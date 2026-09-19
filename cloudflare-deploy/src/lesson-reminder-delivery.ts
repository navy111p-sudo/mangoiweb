/** 수업예정 SMS: 대표번호 고정, 수신자별 원자적 선점, 확실한 거절만 제한 재시도.
 * pending/unknown 은 자동 재발송하지 않는다. 응답 유실 시 업체 접수 여부가 불명확하기 때문이다.
 * 전화번호·본문 원문은 새 장부에 저장하지 않는다. accepted 는 업체 접수이지 단말 수신확인이 아니다.
 */
import { getSolapiMode, sendPlainSms } from './solapi-client';

export const LESSON_REMINDER_FROM_PHONE = '1644-0561';
const RETRY_DELAY_MS = 60_000;
const MAX_ATTEMPTS = 3;

export async function ensureLessonReminderDeliveryTable(env: any): Promise<void> {
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS lesson_reminder_delivery (
    room_id TEXT NOT NULL, recipient TEXT NOT NULL, phone_hash TEXT NOT NULL,
    status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 1, attempted_at INTEGER NOT NULL,
    message_id TEXT, error_code TEXT,
    PRIMARY KEY (room_id, recipient), UNIQUE (room_id, phone_hash)
  )`);
}

export async function deliverLessonReminder(
  env: any, roomId: string, recipient: 'parent' | 'student', phone: string, text: string,
): Promise<{ status: string; attempted: boolean; accepted: boolean; error?: string }> {
  const mode = getSolapiMode(env);
  if (mode !== 'real') return { status: mode, attempted: false, accepted: false };
  const normalized = String(phone || '').replace(/[^0-9]/g, '');
  if (normalized.length < 10) return { status: 'invalid_phone', attempted: false, accepted: false };
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(roomId + ':' + normalized))))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  const now = Date.now();
  try {
    // UNIQUE 로 동시 cron/수동 실행과, 부모·학생 동일 번호 중복을 막는다.
    let claim = await env.DB.prepare(`INSERT OR IGNORE INTO lesson_reminder_delivery
      (room_id, recipient, phone_hash, status, attempts, attempted_at) VALUES (?,?,?,'pending',1,?)`)
      .bind(roomId, recipient, hash, now).run();
    if (!claim.meta?.changes) {
      claim = await env.DB.prepare(`UPDATE lesson_reminder_delivery
        SET status='pending', attempts=attempts+1, attempted_at=?, phone_hash=?, error_code=NULL
        WHERE room_id=? AND recipient=? AND status='rejected' AND attempts < ? AND attempted_at <= ?`)
        .bind(now, hash, roomId, recipient, MAX_ATTEMPTS, now - RETRY_DELAY_MS).run();
    }
    if (!claim.meta?.changes) {
      const prev: any = await env.DB.prepare(`SELECT status, attempts, error_code FROM lesson_reminder_delivery
        WHERE room_id=? AND (recipient=? OR phone_hash=?) LIMIT 1`).bind(roomId, recipient, hash).first();
      const status = prev?.status === 'accepted' ? 'already_accepted'
        : prev?.status === 'rejected' ? (prev.attempts >= MAX_ATTEMPTS ? 'retry_exhausted' : 'retry_wait')
        : prev?.status || 'claim_unavailable';
      return { status, attempted: false, accepted: false, ...(prev?.error_code ? { error: prev.error_code } : {}) };
    }
  } catch {
    // 중복 방지를 확인할 수 없으면 발송하지 않는다.
    return { status: 'delivery_store_unavailable', attempted: false, accepted: false };
  }

  let status = 'unknown', error = '', messageId: string | null = null;
  try {
    const r = await sendPlainSms(env, normalized, text, {
      from: LESSON_REMINDER_FROM_PHONE, subject: '망고아이 수업예정 안내',
    });
    if (r.ok && r.mode === 'real') { status = 'accepted'; messageId = r.messageId || null; }
    else {
      error = r.error || (r.muted ? 'owner_muted' : r.mode !== 'real' ? r.mode : 'send_failed');
      // 네트워크 유실/서버 오류/해석 못 한 2xx 는 이미 접수됐을 수 있다. 무조건 재시도 금지.
      status = error === 'network_error' || /^http_[25]\d\d$/.test(error) || error === 'send_failed'
        ? 'unknown' : 'rejected';
    }
  } catch { error = 'send_exception'; }
  try {
    await env.DB.prepare(`UPDATE lesson_reminder_delivery SET status=?, message_id=?, error_code=?
      WHERE room_id=? AND recipient=? AND status='pending'`)
      .bind(status, messageId, error || null, roomId, recipient).run();
  } catch {
    // 선점(pending)은 남는다. 결과 저장 실패가 재발송을 일으키지 않게 한다.
    return { status: status === 'accepted' ? 'accepted_log_failed' : 'unknown',
      attempted: true, accepted: status === 'accepted', error: 'delivery_result_write_failed' };
  }
  return { status, attempted: true, accepted: status === 'accepted', ...(error ? { error } : {}) };
}
