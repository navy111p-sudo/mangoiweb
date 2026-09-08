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

import { siteUrl } from './site-url';
/* 📵 운영자 문자 음소거 판정 — 정본은 한 곳(복제 금지). 순수 함수라 하니스가 실제로 돌린다. */
import { isOwnerPhone, ownerSmsBlocked, OWNER_MUTE_KV_KEY, type OwnerSmsKind } from './owner-sms-mute';

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
  SOLAPI_TEMPLATE_CLASS_RENEWAL?: string;   // 수업 종료 → 수강 연장 안내(B2C 미연장) 템플릿
  SOLAPI_TEST_MODE?: string;
  DB?: D1Database;            // 있으면 발송을 alimtalk_log 에 기록(이탈위험 그래프 IGNORED 엣지 소스)
  PUBLIC_BASE_URL?: string;   // 클릭추적 리다이렉트 베이스(미설정 시 기본 워커 도메인)
  ALIMTALK_TRACK?: string;    // 'on' 일 때만 버튼 URL 을 클릭추적 링크로 감쌈(기본 off=URL 원본 유지·안전)
  /* 📵 (2026-09-08) 운영자 문자 음소거에 쓰는 둘 — 아래 sendPlainSms 머리 참고.
     둘 다 옵셔널이라 이 값을 안 넘기는 기존 호출부는 그대로 동작한다(막지 않음). */
  OWNER_ALERT_PHONE?: string;      // 이 번호로 가는 문자만 음소거 대상
  SESSION_STATE?: KVNamespace;     // 스위치 owner_alert_mute 를 읽는 곳
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
  fromPhone?: string;                    // 이 건만 다른 발신번호로 (미지정 시 SOLAPI_FROM_PHONE)
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
//
//  🌏 (2026-08-13) opts.country — 해외문자(필리핀 강사 등).
//     SOLAPI 는 국내번호면 country 를 안 보내고, 해외면 국가번호(PH=63)를 따로 실어야 한다.
//     이때 to 는 «앞의 0 을 뗀» 로컬번호다(0935-844-4527 → country 63 + to 9358444527).
//     0 을 안 떼면 SOLAPI 가 형식오류로 반려한다. 그래서 여기서 한 번만 처리한다.
//     ⚠️ 해외문자는 SOLAPI 계정에서 «해외 발송» 이 열려 있어야 하고 단가가 국내와 다르다.
//        안 열려 있으면 errorCode 가 그대로 올라오니, 부르는 쪽에서 사람에게 그대로 보여줄 것.
// ─────────────────────────────────────────────────────────────
//  📵 (2026-09-08) 운영자 문자 음소거 — 사장님 「일단 모두 꺼줘」.
//     `OWNER_ALERT_PHONE` 으로 가는 문자를 **여기 한 곳에서** 막는다. 호출부 17군데를 각각
//     고치면 나중에 새 알림이 생길 때 조용히 새어 나가므로, «보내는 정본» 에 둔 것이다.
//     기본이 «음소거» 이고 되켜기는 KV `owner_alert_mute='off'`(배포 불필요).
//     ⚠️ 학부모·강사·학생 문자는 번호가 달라 영향 없다(수신번호로만 판정).
//     📌 (2026-09-09) 예외 둘 — `opts.kind` 로 «무슨 알림인가» 를 밝히면 음소거 중에도 나간다.
//        지금은 `uptime`(사이트 장애)·`room-split`(방 갈림 감시견)뿐이고 목록의 정본은
//        `owner-sms-mute.ts` 의 `OWNER_ALWAYS_KINDS` 다. ⛔ 여기서 예외를 만들지 말 것.
//        ✅ 안 밝힌 호출은 그대로 막힌다 — 새 알림이 조용히 새지 않는다.
//     자세한 근거·대가는 `owner-sms-mute.ts` 머리말 참고.
export async function sendPlainSms(
  env: SolapiEnv, toPhone: string, text: string,
  opts?: { country?: string; subject?: string; from?: string; kind?: OwnerSmsKind }
): Promise<{ ok: boolean; mode: SolapiMode; messageId?: string; error?: string; message?: string; muted?: boolean }> {
  const mode = getSolapiMode(env);
  if (isOwnerPhone(toPhone, env.OWNER_ALERT_PHONE)) {
    /* ⚠️ KV 를 못 읽어도 «지금 정책대로» 떨어진다 — 장애·감시견은 나가고 나머지는 막힌다.
       (종류를 안 밝힌 호출은 여기서도 막히는 쪽이다) */
    let muted = ownerSmsBlocked(null, opts?.kind);
    try { muted = ownerSmsBlocked(await env.SESSION_STATE?.get(OWNER_MUTE_KV_KEY), opts?.kind); } catch {}
    if (muted) {
      /* ⛔ 조용히 넘기지 않는다 — 무엇이 안 갔는지 Workers 로그에 남긴다.
         ⚠️ 본문에 학생 이름·금액이 들어가므로 «앞 40자» 만 남긴다(로그에 PII 를 쌓지 않는다). */
      console.warn('[owner-sms] 음소거로 보내지 않음(KV owner_alert_mute=off 로 되켬):',
        'kind=' + (opts?.kind || '(안 밝힘)'),
        String(text || '').replace(/\s+/g, ' ').slice(0, 40));
      return { ok: false, mode, muted: true, message: '운영자 문자 음소거(owner_alert_mute)' };
    }
  }
  const country = String(opts?.country || '').replace(/[^0-9]/g, '');
  const isIntl = !!country && country !== '82';
  let phone = normalizePhone(toPhone);
  if (isIntl) phone = phone.replace(/^0+/, '');   // 해외문자는 국가번호 뒤에 로컬번호(앞 0 제거)
  const from = normalizePhone(opts?.from || env.SOLAPI_FROM_PHONE || '');
  const bodyText = String(text || '').slice(0, 1000);

  if (mode === 'disabled') return { ok: false, mode, message: 'SOLAPI_API_KEY 미설정' };
  // 해외 로컬번호는 앞 0 을 떼면 10자리 미만인 나라도 있어 하한을 낮춘다(국내는 종전대로 10)
  if (!phone || phone.length < (isIntl ? 7 : 10)) return { ok: false, mode, error: 'invalid_phone' };
  if (!from || from.length < 8) return { ok: false, mode, error: 'invalid_from' };
  if (!bodyText) return { ok: false, mode, error: 'empty_text' };

  if (mode === 'mock') {
    console.log('[solapi SMS MOCK]', { to: maskPhone(phone), country: country || 'KR', textLen: bodyText.length });
    return { ok: true, mode, messageId: 'mock_' + Date.now().toString(36), message: '[TEST MODE] 실제 발송 안 함' };
  }

  const dateISO = new Date().toISOString();
  const salt = Math.random().toString(36).slice(2);
  const auth = await generateSignature(env.SOLAPI_API_KEY!, env.SOLAPI_API_SECRET!, dateISO, salt);
  // 90바이트 초과 시 LMS(장문), 아니면 SMS(단문). SOLAPI 는 type 명시를 권장.
  const byteLen = new TextEncoder().encode(bodyText).length;
  const type = byteLen > 88 ? 'LMS' : 'SMS';
  const message: any = { to: phone, from, type, text: bodyText };
  if (isIntl) message.country = country;
  if (type === 'LMS') message.subject = opts?.subject || '망고아이 알림';

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
      from: normalizePhone(params.fromPhone || env.SOLAPI_FROM_PHONE || ''),
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
      '#{결제URL}': vars.paymentUrl || PAYMENT_URL,
    },
    /* 🪤 여기가 «결제 → » 뒤가 빈 채로 나가던 자리다(vars.paymentUrl || '' 였다).
          이제 알림톡 변수와 **같은 값**을 쓴다 — 한쪽만 고치면 카톡과 문자가 서로 다른
          주소를 말하게 된다. */
    fallbackSmsText: `[망고아이] ${vars.studentName} 학생 수강료 ${vars.daysOverdue}일 미납 (${vars.amountKrw.toLocaleString('ko-KR')}원). 결제 → ${vars.paymentUrl || PAYMENT_URL}`,
  });
}

/* ═══════════════════════════════════════════════════════════════
   🔁 B2C «미연장» 안내 — 수업 종료 후 수강 연장 요청 (2026-08-18)

   ⚠️ 위의 sendPaymentOverdueAlert(«미납») 과 **다른 것**이다. 헷갈리면 학부모에게
      틀린 문자가 나간다.
        · 미납(B2B)   = 수업은 이미 했는데 돈이 안 들어온 것 → 「받아야 할 돈」
        · 미연장(B2C) = 결제한 만큼만 수업이 나간 뒤 끝난 것 → 「받을 돈이 없다」
      B2C 는 선불이라 «미납» 이 성립하지 않는다. 그래서 금액·미납일수를 말하지 않고
      «수업이 언제 끝났는지» 와 «연장하려면 결제해 달라» 만 말한다.

   📵 발신번호는 1644-0561 로 고정한다(2026-08-18 사장님 지시). 다른 알림톡과 발신번호가
      달라도 되도록 이 건에만 fromPhone 을 실어 보낸다 — 전역 SOLAPI_FROM_PHONE 을 바꾸면
      수업시작·평가서 등 다른 문자까지 같이 바뀐다.

   📝 문구는 사장님이 지정한 그대로다. 임의로 다듬지 말 것.
      「OOO 회원님의 수업이 O월 O일자로 종료되었습니다.
        수강 연장을 희망하실 경우 수강료 결제를 부탁드립니다.」
      (앞의 [망고아이] 는 수신자가 발신처를 알 수 있게 붙이는 공통 머리표다.)

   카카오 템플릿(SOLAPI_TEMPLATE_CLASS_RENEWAL)이 등록돼 있으면 알림톡으로,
   없으면 그냥 문자(SMS/LMS)로 보낸다. 템플릿 검수 전에도 발송이 되게 하기 위함.
   ═══════════════════════════════════════════════════════════════ */

/** 미연장 안내 문자 발신번호 — 사장님 지정(2026-08-18). */
export const CLASS_RENEWAL_FROM_PHONE = '1644-0561';

/* 🔗 연장(결제) 링크.
   ⚠️ 워커 기본 도메인이 아니라 **SITE_ORIGIN(mangoi.ai)** 을 쓴다 — 사람에게 나가는 주소의
      정본은 site-url.ts 한 곳이다(CLAUDE.md 2장). 여기에 주소를 손으로 적으면 도메인이
      바뀔 때 이 문자만 옛 주소로 남는다.
   ⚠️ 경로가 /enroll.html 인 이유는 **「수업 7일·3일 전 종료 안내」 문자(enroll-ops.ts)와 같은
      곳으로 보내기 위해서**다. 같은 학부모가 며칠 사이에 두 문자를 받는데 서로 다른 데로
      보내면 안 된다. 그 이상의 근거는 없다.

   🔴 알아 두어야 할 한계 — 이 링크는 **로그인 벽 뒤에 있다.**
      enroll.html 은 localStorage 의 mangoi_uid / mangoi_logged_user 가 없으면 화면을
      「🔒 로그인 후 이용할 수 있어요」로 갈아치운다(enroll.html 의 `if (!UID)`).
      그런데 이 문자는 parent_phone 으로 나간다 — **학부모 휴대폰에는 학생 로그인이 없는 게
      보통**이라, 누르면 결제창이 아니라 로그인 안내가 뜬다.
      ⛔ 이걸 «학부모에게 학생 로그인을 만들어 주는» 방식으로 풀지 말 것 — 학생 전용 기능이
         통째로 열린다(CLAUDE.md 2장 「로그인했는데 또 로그인하래요」).
      → 제대로 고치려면 서명된 1회용 링크(토큰 붙은 재등록 주소)가 필요하다. 그건 인증을
        건드리는 별건 작업이라 사람이 결정할 일이다. 지금은 enroll-ops.ts 의 기존 안내 문자와
        **같은 한계를 공유**하는 상태다(새로 생긴 문제가 아니라 경로가 하나 늘어난 것). */
export const CLASS_RENEWAL_URL = siteUrl('/enroll.html');

/* 💳 B2B 미납 독촉의 결제 안내 주소. 미연장(B2C)과 성격이 달라 목적지도 다르다 —
      B2B 는 학원이 본사로 보내는 후불 대금이라 «수강신청» 페이지가 아니다.
      여기도 workers.dev 기본 도메인을 쓰지 않는다(사람에게 나가는 주소 = SITE_ORIGIN). */
const PAYMENT_URL = siteUrl('/?go=payment');

/** 「O월 O일」 — KST 기준. 타임존을 안 맞추면 자정 근처에서 하루가 틀린다. */
export function formatKstMonthDay(at: number | string | Date): string {
  const ms = at instanceof Date ? at.getTime()
           : typeof at === 'number' ? at
           : Date.parse(String(at).length === 10 ? String(at) + 'T00:00:00+09:00' : String(at));
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms + 9 * 3600 * 1000);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
}

/** 지정 문구 그대로. 화면 미리보기와 실제 발송이 같은 문장을 쓰도록 여기 하나만 둔다.
 *  url 을 넘기지 않으면 CLASS_RENEWAL_URL 을 붙이고, **null 을 넘기면 링크 없이** 만든다
 *  (웹푸시는 알림 자체에 이동 주소가 붙으므로 본문에 링크를 또 넣지 않는다). */
export function buildClassRenewalText(
  studentName: string,
  lastClassAt: number | string | Date,
  url?: string | null,
): string {
  const md = formatKstMonthDay(lastClassAt);
  const body = `[망고아이] ${studentName || '회원'} 회원님의 수업이 ${md}자로 종료되었습니다. 수강 연장을 희망하실 경우 수강료 결제를 부탁드립니다.`;
  const link = url === null ? '' : (url || CLASS_RENEWAL_URL);
  return link ? `${body}\n▶ 연장·결제: ${link}` : body;
}

export async function sendClassRenewalAlert(env: SolapiEnv, phone: string, vars: {
  studentName: string;
  lastClassAt: number | string | Date;   // 마지막 수업일
  paymentUrl?: string;
  logContext?: AlimtalkLogContext;
}): Promise<SendKakaoResult> {
  const link = vars.paymentUrl || CLASS_RENEWAL_URL;
  const text = buildClassRenewalText(vars.studentName, vars.lastClassAt, link);
  const template = env.SOLAPI_TEMPLATE_CLASS_RENEWAL || '';

  if (template) {
    return sendKakaoAlimtalk(env, {
      templateCode: template,
      recipientPhone: phone,
      fromPhone: CLASS_RENEWAL_FROM_PHONE,
      variables: {
        '#{학생명}': vars.studentName || '회원',
        '#{종료일}': formatKstMonthDay(vars.lastClassAt),
        '#{결제URL}': link,
      },
      fallbackSmsText: text,
      logContext: vars.logContext,
    });
  }

  // 템플릿 미등록 — 문자로 보낸다. 결과 모양은 알림톡과 맞춰 부르는 쪽이 분기하지 않게 한다.
  const r = await sendPlainSms(env, phone, text, {
    subject: '수강 연장 안내',
    from: CLASS_RENEWAL_FROM_PHONE,
  });
  return {
    ok: r.ok, mode: r.mode, messageId: r.messageId,
    status: r.ok ? 'sent' : 'failed',
    message: r.message, error: r.error,
  };
}
