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
  SOLAPI_TEST_MODE?: string;
}

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

  if (mode === 'mock') {
    console.log('[solapi MOCK]', { template: params.templateCode, to: phone, vars: params.variables });
    return {
      ok: true, mode: 'mock',
      messageId: 'mock_' + Date.now().toString(36),
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
