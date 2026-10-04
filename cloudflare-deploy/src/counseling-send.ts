import { phonesForStudent } from './notify-contacts';
import { getSolapiMode, sendPlainSms } from './solapi-client';

export async function counselingRecipient(env: any, uid: string) {
  const exists = await env.DB.prepare('SELECT user_id FROM students_erp WHERE user_id = ?').bind(uid).first();
  if (!exists) return null;
  const phones = await phonesForStudent(env, uid);
  const phone = phones.parent || phones.student;
  return { user_id: uid, phone, role: phones.parent ? 'parent' : 'student', ready: getSolapiMode(env) === 'real', sender: '16440561' };
}

// One explicit, confirmed SMS only. Kakao is a manual handoff, never an SMS fallback.
export async function sendCounselingSms(env: any, body: any, actor: string) {
  const uid = String(body.user_id || '').trim();
  const message = String(body.message || '').trim();
  const id = String(body.request_id || '');
  if (!uid || !message || message.length > 1000 || !/^[a-zA-Z0-9-]{16,80}$/.test(id) || body.confirmed !== true)
    return { ok: false, error: 'invalid_request' };
  const recipient = await counselingRecipient(env, uid);
  if (!recipient?.phone || !/^01[016789][0-9]{7,8}$/.test(recipient.phone)) return { ok: false, error: 'missing_phone' };
  if (body.expected_phone !== recipient.phone) return { ok: false, error: 'recipient_changed' };
  if (!recipient.ready) return { ok: false, error: 'delivery_not_ready' };
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS counseling_sms_log (request_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, fingerprint TEXT NOT NULL, actor TEXT NOT NULL, status TEXT NOT NULL, message_id TEXT, created_at INTEGER NOT NULL)`);
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(uid + '\n' + recipient.phone + '\n' + message));
  const fingerprint = Array.from(new Uint8Array(bytes)).map(x => x.toString(16).padStart(2, '0')).join('');
  const now = Date.now();
  const claim = await env.DB.prepare(`INSERT OR IGNORE INTO counseling_sms_log (request_id,user_id,fingerprint,actor,status,created_at) SELECT ?,?,?,?,'sending',? WHERE NOT EXISTS (SELECT 1 FROM counseling_sms_log WHERE fingerprint=? AND created_at>?)`).bind(id, uid, fingerprint, actor, now, fingerprint, now - 120000).run();
  if (!claim.meta?.changes) return { ok: false, error: 'duplicate_request' };
  let result: any;
  try { result = await sendPlainSms(env, recipient.phone, message, { from: '16440561', subject: '망고아이 상담 안내' }); }
  catch { result = { ok: false }; }
  const accepted = result.ok && result.mode === 'real';
  await env.DB.prepare('UPDATE counseling_sms_log SET status=?, message_id=? WHERE request_id=?')
    .bind(accepted ? 'accepted' : 'failed_or_unknown', result.messageId || null, id).run();
  return accepted ? { ok: true, status: 'accepted' } : { ok: false, error: 'delivery_failed_or_unknown' };
}
