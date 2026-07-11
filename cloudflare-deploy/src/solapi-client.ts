// ═══════════════════════════════════════════════════════════════
//  solapi-client.ts — SOLAPI(NHN Cloud) 카카오 알림톡 어댑터
//
//  ▶ 환경변수 (wrangler secret):
//     SOLAPI_API_KEY      : SolAPI 발급 API 키
//     SOLAPI_API_SECRET   : SolAPI 발급 시크릿
//     SOLAPI_PFID         : 카카오 비즈 채널 발신프로필 ID (PFID)
//     SOLAPI_FROM_PHONE   : 발신 전화번호 (실패 시 SMS 폴백)
//     SOLAPI_TEMPLATE_LESSON_START   : 수업 시작 알림톡 템플릿 코드
//     SOLAPI_TEMPLATE_LESSON_END     : 수업 종료 알림톡 템플릿 코드
//     SOLAPI_TEMPLATE_CHAT_SUMMARY   : 채팅 요약 템플릿 코드
//     SOLAPI_TEMPLATE_MENTION        : 멘션 푸시 템플릿 코드
//     SOLAPI_TEST_MODE               : "true" 면 mock 응답 (실제 발송 X)
//
//  ▶ 가입 단계 (사용자 직접):
//     1) https://solapi.com 회원가입 + 본인인증
//     2) 카카오 비즈 채널 등록 → 발신프로필 (PFID) 발급
//     3) 알림톡 템플릿 4개 등록 → 카카오 검수 (1~2일)
//     4) wrangler secret put 으로 키/PFID/템플릿코드 모두 등록
//
//  ▶ 가입 전(mock 모드): 콘솔에 로그 + UI 에 "mock 발송 완료" 안내
// ═══════════════════════════════════════════════════════════════

export interface SolapiEnv {
  SOLAPI_API_KEY?: string;
  SOLAPI_API_SECRET?: string;
  SOLAPI_PFID?: string;
  SOLAPI_FROM_PHONE?: string;
  SOLAPI_TEMPLATE_LESSON_START?: string;
  SOLAPI_TEMPLATE_LESSON_END?: string;
  SOLAPI_TEMPLATE_CHAT_SUMMARY?: string;
  SOLAPI_TEMPLATE_MENTION?: string;
  SOLAPI_TEMPLATE_PAYMENT_OVERDUE?: string;
  SOLAPI_TEST_MODE?: string;
  DB?: D1Database;            // 있으면 발송을 alimtalk_log 에 기록(이탈위험 그래프 IGNORED 엣지 소스)
  PUBLIC_BASE_URL?: string;   // 클릭추적 리다이렉트 베이스(미설정 시 기본 워커 도메인)
  ALIMTALK_TRACK?: string;    // 'on' 일 때만 버튼 URL 을 클릭추적 링크로 감쌈(기본 off=URL 원본 유지·안전)
}

/** 알림톡 발송을 alimtalk_log 에 남길 때의 맥락(학생/사유) */
export interface AlimtalkLogContext {
  userId: string;            // 대상 학생 uid
  reason?: string;           // 'monthly_report' | 'absence' | 'payment' | 'lesson' | ...
  refRoomId?: string;        // 연관 수업 room_id
  refDate?: string;          // 연관 날짜 'YYYY-MM-DD'
}

// 클릭추적 리다이렉트 기본 도메인(헬퍼들의 기존 fallback URL 과 동일)
const WORKER_BASE = 'https://webrtc-unified-platform-prod.navy111p.workers.dev';

export type SolapiMode = 'real' | 'mock' | 'disabled';

export function getSolapiMode(env: SolapiEnv): SolapiMode {
  if (!env.SOLAPI_API_KEY || !env.SOLAPI_API_SECRET) return 'disabled';
  if (env.SOLAPI_TEST_MODE === 'true') return 'mock';
  return 'real';
}

export interface SendKakaoParams {
  templateCode: string;
  recipientPhone: string;
  recipientName?: string;
  variables: Record<string, string>;     // 템플릿 변수 (예: { #{학생명}: "홍길동" })
  fallbackSmsText?: string;              // 알림톡 실패 시 SMS 로 보낼 문구
  logContext?: AlimtalkLogContext;       // 있으면 발송을 alimtalk_log 에 기록(+클릭추적)
}

export interface SendKakaoResult {
  ok: boolean;
  mode: SolapiMode;
  messageId?: string;
  status?: string;
  message?: string;
  error?: string;
  raw?: any;
}

// 전화번호 정규화
function normalizePhone(p: string): string {
  return (p || '').replace(/[^0-9]/g, '');
}

// 🔐 로그용 전화번호 마스킹 — mock/디버그 로그에 원문 번호·본문이 남지 않도록(PII 유출 방지)
function maskPhone(p: string): string {
  const d = (p || '').replace(/[^0-9]/g, '');
  if (d.length < 7) return '***';
  return d.slice(0, 3) + '****' + d.slice(-2);
}

// HMAC-SHA256 시그니처 생성 (SolAPI 표준 인증)
async function generateSignature(
  apiKey: string, apiSecret: string, dateISO: string, salt: string
): Promise<string> {
  const data = dateISO + salt;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(apiSecret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `HMAC-SHA256 apiKey=${apiKey}, date=${dateISO}, salt=${salt}, signature=${hex}`;
}

// ─────────────────────────────────────────────────────────────
//  일반 SMS/LMS 발송 (템플릿 불필요) — 운영자 장애 알림 등 내부용
//    카카오 알림톡(ATA)은 사전 승인 템플릿이 필요하지만, 문자(SMS/LMS)는 불필요.
//    UptimeRobot 장애 웹훅 → 이 함수로 관리자 폰에 즉시 문자.
// ─────────────────────────────────────────────────────────────
export async function sendPlainSms(
  env: SolapiEnv, toPhone: string, text: string
): Promise<{ ok: boolean; mode: SolapiMode; messageId?: string; error?: string; message?: string }> {
  const mode = getSolapiMode(env);
  const phone = normalizePhone(toPhone);
  const from = normalizePhone(env.SOLAPI_FROM_PHONE || '');
  const bodyText = String(text || '').slice(0, 1000);

  if (mode === 'disabled') return { ok: false, mode, message: 'SOLAPI_API_KEY 미설정' };
  if (!phone || phone.length < 10) return { ok: false, mode, error: 'invalid_phone' };
  if (!from || from.length < 8) return { ok: false, mode, error: 'invalid_from' };
  if (!bodyText) return { ok: false, mode, error: 'empty_text' };

  if (mode === 'mock') {
    console.log('[solapi SMS MOCK]', { to: maskPhone(phone), textLen: bodyText.length });
    return { ok: true, mode, messageId: 'mock_' + Date.now().toString(36), message: '[TEST MODE] 실제 발송 안 함' };
  }

  const dateISO = new Date().toISOString();
  const salt = Math.random().toString(36).slice(2);
  const auth = await generateSignature(env.SOLAPI_API_KEY!, env.SOLAPI_API_SECRET!, dateISO, salt);
  // 90바이트 초과 시 LMS(장문), 아니면 SMS(단문). SOLAPI 는 type 명시를 권장.
  const byteLen = new TextEncoder().encode(bodyText).length;
  const type = byteLen > 88 ? 'LMS' : 'SMS';
  const message: any = { to: phone, from, type, text: bodyText };
  if (type === 'LMS') message.subject = '망고아이 알림';

  try {
    const resp = await fetch('https://api.solapi.com/messages/v4/send', {
      method: 'POST',
      headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    const raw = await resp.text();
    let parsed: any = null;
    try { parsed = JSON.parse(raw); } catch { parsed = { raw }; }
    if (resp.status >= 200 && resp.status < 300 && parsed?.statusCode === '2000') {
      return { ok: true, mode, messageId: parsed?.messageId, message: parsed?.statusMessage || 'OK' };
    }
    return { ok: false, mode, error: parsed?.errorCode || ('http_' + resp.status), message: parsed?.errorMessage || parsed?.statusMessage || raw.slice(0, 200) };
  } catch (e: any) {
    return { ok: false, mode, error: 'network_error', message: String(e?.message || e) };
  }
}

// ─────────────────────────────────────────────────────────────
//  카카오 알림톡 발송
// ─────────────────────────────────────────────────────────────
export async function sendKakaoAlimtalk(
  env: SolapiEnv, params: SendKakaoParams
): Promise<SendKakaoResult> {
  const mode = getSolapiMode(env);
  const phone = normalizePhone(params.recipientPhone);

  if (mode === 'disabled') {
    return { ok: false, mode, status: 'skipped', message: 'SOLAPI_API_KEY 미설정' };
  }
  if (!params.templateCode) {
    return { ok: false, mode, status: 'skipped', message: 'templateCode 미설정' };
  }
  if (!phone || phone.length < 10) {
    return { ok: false, mode, status: 'failed', error: 'invalid_phone' };
  }

  // 이탈위험 그래프용 발송 기록은 항상(아래 logAlimtalkSend). 클릭추적 URL 래핑은
  // ALIMTALK_TRACK='on' 일 때만 — 카카오 검수 템플릿의 버튼 URL 을 함부로 바꾸지 않기 위함.
  // (래핑 꺼져도 무반응→IGNORED 추론은 그대로 동작 → 안전 기본값)
  let trackToken: string | null = null;
  if (env.DB && params.logContext && String(env.ALIMTALK_TRACK || '').toLowerCase() === 'on') {
    trackToken = crypto.randomUUID().replace(/-/g, '').slice(0, 24);
    const base = env.PUBLIC_BASE_URL || WORKER_BASE;
    for (const k of Object.keys(params.variables)) {
      const v = params.variables[k];
      if (typeof v === 'string' && /^https?:\/\//i.test(v))
        params.variables[k] = `${base}/api/alimtalk/r?t=${trackToken}&to=${encodeURIComponent(v)}`;
    }
  }

  if (mode === 'mock') {
    console.log('[solapi MOCK]', { template: params.templateCode, to: maskPhone(phone), varKeys: Object.keys(params.variables || {}) });
    const messageId = 'mock_' + Date.now().toString(36);
    await logAlimtalkSend(env, params, phone, messageId, 'sent', trackToken);
    return {
      ok: true, mode: 'mock',
      messageId,
      status: 'sent',
      message: '[TEST MODE] 실제 발송 안 함 (콘솔 로그만)',
    };
  }

  // === Real 발송 ===
  const dateISO = new Date().toISOString();
  const salt = Math.random().toString(36).slice(2);
  const auth = await generateSignature(env.SOLAPI_API_KEY!, env.SOLAPI_API_SECRET!, dateISO, salt);

  const body = {
    message: {
      to: phone,
      from: env.SOLAPI_FROM_PHONE || '',
      type: 'ATA',         // ATA = 알림톡
      kakaoOptions: {
        pfId: env.SOLAPI_PFID || '',
        templateId: params.templateCode,
        variables: params.variables,
        ...(params.fallbackSmsText ? {
          disableSms: false,
        } : {}),
      },
      ...(params.fallbackSmsText ? { text: params.fallbackSmsText } : {}),
    },
  };

  try {
    const resp = await fetch('https://api.solapi.com/messages/v4/send', {
      method: 'POST',
      headers: {
        'Authorization': auth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const text = await resp.text();
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }

    if (resp.status >= 200 && resp.status < 300 && parsed?.statusCode === '2000') {
      await logAlimtalkSend(env, params, phone, parsed?.messageId, 'sent', trackToken);
      return {
        ok: true, mode: 'real',
        messageId: parsed?.messageId,
        status: 'sent',
        message: parsed?.statusMessage || 'OK',
        raw: parsed,
      };
    }
    return {
      ok: false, mode: 'real',
      status: 'failed',
      error: parsed?.errorCode || ('http_' + resp.status),
      message: parsed?.errorMessage || parsed?.statusMessage || text.slice(0, 200),
      raw: parsed,
    };
  } catch (e: any) {
    return { ok: false, mode: 'real', status: 'failed', error: 'network_error', message: String(e?.message || e) };
  }
}

// ─────────────────────────────────────────────────────────────
//  알림톡 발송 로그 (이탈위험 그래프 IGNORED 엣지 소스)
//  - sendKakaoAlimtalk 가 logContext+DB 있을 때 자동 호출
//  - 테이블 없으면 1회 생성 후 재시도(멱등). 실패해도 발송엔 영향 없음.
// ─────────────────────────────────────────────────────────────
export async function ensureAlimtalkLog(env: SolapiEnv): Promise<void> {
  if (!env.DB) return;
  await env.DB.exec(
    `CREATE TABLE IF NOT EXISTS alimtalk_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, parent_phone TEXT, template TEXT, reason TEXT, ref_room_id TEXT, ref_date TEXT, message_id TEXT, track_token TEXT, send_status TEXT DEFAULT 'sent', sent_at INTEGER NOT NULL, read_at INTEGER, responded_at INTEGER, created_at INTEGER NOT NULL);`
  );
  try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_alimtalk_log_user_sent ON alimtalk_log(user_id, sent_at);`); } catch {}
  try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_alimtalk_log_token ON alimtalk_log(track_token);`); } catch {}
}

async function logAlimtalkSend(
  env: SolapiEnv, params: SendKakaoParams, phone: string,
  messageId: string | undefined, status: string, token: string | null
): Promise<void> {
  if (!env.DB || !params.logContext) return;
  const lc = params.logContext;
  const now = Date.now();
  const insert = () => env.DB!.prepare(
    `INSERT INTO alimtalk_log (user_id, parent_phone, template, reason, ref_room_id, ref_date, message_id, track_token, send_status, sent_at, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(lc.userId, phone, params.templateCode || null, lc.reason || null, lc.refRoomId || null, lc.refDate || null, messageId || null, token, status, now, now).run();
  try {
    await insert();
  } catch {
    // 테이블 미생성 등 → 1회 생성 후 재시도
    try { await ensureAlimtalkLog(env); await insert(); }
    catch (e: any) { console.warn('[alimtalk_log] insert skipped:', e?.message || e); }
  }
}

/**
 * 클릭추적 열람 기록: /api/alimtalk/r?t=<token> 가 호출.
 * 토큰에 해당하는 알림톡의 read_at 을 처음 1회 기록하고, 원래 목적지 URL 을 반환.
 */
export async function markAlimtalkRead(env: SolapiEnv, token: string): Promise<void> {
  if (!env.DB || !token) return;
  try {
    await env.DB.prepare(
      `UPDATE alimtalk_log SET read_at = ? WHERE track_token = ? AND read_at IS NULL`
    ).bind(Date.now(), token).run();
  } catch (e: any) { console.warn('[alimtalk_log] read mark skipped:', e?.message || e); }
}

// ─────────────────────────────────────────────────────────────
//  잔액 조회 (선불 충전 잔액)
// ─────────────────────────────────────────────────────────────
export async function checkSolapiBalance(env: SolapiEnv): Promise<{
  ok: boolean; mode: SolapiMode; balance?: number; point?: number; message?: string;
}> {
  const mode = getSolapiMode(env);
  if (mode === 'disabled') return { ok: false, mode, message: 'API 키 미설정' };
  if (mode === 'mock') return { ok: true, mode: 'mock', balance: 100000, point: 0, message: '[TEST MODE]' };

  const dateISO = new Date().toISOString();
  const salt = Math.random().toString(36).slice(2);
  const auth = await generateSignature(env.SOLAPI_API_KEY!, env.SOLAPI_API_SECRET!, dateISO, salt);
  try {
    const resp = await fetch('https://api.solapi.com/cash/v1/balance', {
      method: 'GET', headers: { 'Authorization': auth },
    });
    const body: any = await resp.json().catch(() => ({}));
    if (resp.ok) {
      return {
        ok: true, mode: 'real',
        balance: Number(body?.balance) || 0,
        point: Number(body?.point) || 0,
        message: '잔액 조회 성공',
      };
    }
    return { ok: false, mode: 'real', message: body?.errorMessage || ('HTTP ' + resp.status) };
  } catch (e: any) {
    return { ok: false, mode: 'real', message: String(e?.message || e) };
  }
}

// ─────────────────────────────────────────────────────────────
//  편의 함수 — 4가지 시나리오별 발송 헬퍼
// ─────────────────────────────────────────────────────────────
export async function sendLessonStartAlert(env: SolapiEnv, phone: string, vars: {
  studentName: string; lessonTitle: string; teacherName: string; roomUrl?: string;
}): Promise<SendKakaoResult> {
  return sendKakaoAlimtalk(env, {
    templateCode: env.SOLAPI_TEMPLATE_LESSON_START || '',
    recipientPhone: phone,
    variables: {
      '#{학생명}': vars.studentName,
      '#{수업명}': vars.lessonTitle,
      '#{강사명}': vars.teacherName,
      '#{입장URL}': vars.roomUrl || 'https://webrtc-unified-platform-prod.navy111p.workers.dev/',
    },
    fallbackSmsText: `[망고아이] ${vars.studentName}님 ${vars.lessonTitle} 수업이 시작됐어요. ${vars.roomUrl || ''}`,
  });
}

export async function sendLessonEndAlert(env: SolapiEnv, phone: string, vars: {
  studentName: string; lessonTitle: string; duration: string; messagesCount: number;
}): Promise<SendKakaoResult> {
  return sendKakaoAlimtalk(env, {
    templateCode: env.SOLAPI_TEMPLATE_LESSON_END || '',
    recipientPhone: phone,
    variables: {
      '#{학생명}': vars.studentName,
      '#{수업명}': vars.lessonTitle,
      '#{수업시간}': vars.duration,
      '#{메시지수}': String(vars.messagesCount),
    },
    fallbackSmsText: `[망고아이] ${vars.studentName}님 ${vars.lessonTitle} 수업 종료 (${vars.duration})`,
  });
}

export async function sendChatSummaryAlert(env: SolapiEnv, phone: string, vars: {
  studentName: string; lessonTitle: string; messageCount: number; summaryUrl: string;
}): Promise<SendKakaoResult> {
  return sendKakaoAlimtalk(env, {
    templateCode: env.SOLAPI_TEMPLATE_CHAT_SUMMARY || '',
    recipientPhone: phone,
    variables: {
      '#{학생명}': vars.studentName,
      '#{수업명}': vars.lessonTitle,
      '#{메시지수}': String(vars.messageCount),
      '#{요약URL}': vars.summaryUrl,
    },
    fallbackSmsText: `[망고아이] 오늘 ${vars.lessonTitle} 채팅 ${vars.messageCount}개. ${vars.summaryUrl}`,
  });
}

export async function sendMentionAlert(env: SolapiEnv, phone: string, vars: {
  studentName: string; teacherName: string; messageExcerpt: string; roomUrl?: string;
}): Promise<SendKakaoResult> {
  return sendKakaoAlimtalk(env, {
    templateCode: env.SOLAPI_TEMPLATE_MENTION || '',
    recipientPhone: phone,
    variables: {
      '#{학생명}': vars.studentName,
      '#{강사명}': vars.teacherName,
      '#{메시지}': vars.messageExcerpt.slice(0, 80),
      '#{입장URL}': vars.roomUrl || 'https://webrtc-unified-platform-prod.navy111p.workers.dev/',
    },
    fallbackSmsText: `[망고아이] ${vars.teacherName} 강사가 호출: ${vars.messageExcerpt.slice(0, 50)}`,
  });
}

export async function sendPaymentOverdueAlert(env: SolapiEnv, phone: string, vars: {
  studentName: string;
  daysOverdue: number;
  amountKrw: number;
  paymentUrl?: string;
}): Promise<SendKakaoResult> {
  return sendKakaoAlimtalk(env, {
    templateCode: env.SOLAPI_TEMPLATE_PAYMENT_OVERDUE || '',
    recipientPhone: phone,
    variables: {
      '#{학생명}': vars.studentName,
      '#{미납일수}': String(vars.daysOverdue),
      '#{금액}': vars.amountKrw.toLocaleString('ko-KR'),
      '#{결제URL}': vars.paymentUrl || 'https://webrtc-unified-platform-prod.navy111p.workers.dev/?go=payment',
    },
    fallbackSmsText: `[망고아이] ${vars.studentName} 학생 수강료 ${vars.daysOverdue}일 미납 (${vars.amountKrw.toLocaleString('ko-KR')}원). 결제 → ${vars.paymentUrl || ''}`,
  });
}
