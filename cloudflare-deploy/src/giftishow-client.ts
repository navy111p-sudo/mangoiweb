// ═══════════════════════════════════════════════════════════════
//  giftishow-client.ts — KT alpha 기프티쇼 비즈 API 어댑터
//
//  ▶ 환경변수 (wrangler.toml [vars] 또는 wrangler secret):
//     GIFTISHOW_API_KEY      : KT alpha 발급 API 키 (40자 내외)
//     GIFTISHOW_USER_ID      : 가맹점 ID (선택, custCd / userId)
//     GIFTISHOW_API_BASE     : API 베이스 URL (기본: https://bizapi.giftishow.com/bizApi)
//     GIFTISHOW_CALLBACK_URL : 발송 결과 콜백 URL (선택)
//     GIFTISHOW_TEST_MODE    : "true" 면 실제 발송 안 하고 mock 응답
//
//  ▶ 운영 흐름:
//     1) 학생이 /api/gifts/redeem 호출
//     2) 우리 시스템에서 포인트 차감 + gift_redemptions 행 INSERT(pending)
//     3) 이 클라이언트로 sendCoupon() 호출 → KT alpha 가 학생 카톡으로 발송
//     4) 성공 시 status='sent' + external_order_id 기록
//     5) 카톡 발송/수령 변화는 webhook(/api/gifts/webhook/giftishow)으로 비동기 갱신
//
//  ▶ API 키 없을 때 (개발/초기 운영):
//     mock 모드로 fallback. 실제 발송 안 되고 관리자가 수동으로 처리하도록
//     pending 상태 유지. 학원이 KT alpha 가입 전에도 안전하게 가동.
//
//  ▶ 실제 KT alpha 응답 스펙은 가맹점 가입 후 받는 PDF 문서를 따름.
//     본 파일은 표준 한국 기프티콘 B2B API 패턴 (resCode/resMsg + 주문번호) 기반.
//     가입 후 실제 응답 형식이 다르면 parseSendResponse() 한 함수만 수정하면 됨.
// ═══════════════════════════════════════════════════════════════

export interface GiftishowEnv {
  GIFTISHOW_API_KEY?: string;
  GIFTISHOW_USER_ID?: string;
  GIFTISHOW_API_BASE?: string;
  GIFTISHOW_CALLBACK_URL?: string;
  GIFTISHOW_TEST_MODE?: string;
}

export interface SendCouponParams {
  externalProductCode: string;   // KT alpha 상품 코드 (gift_catalog.external_id)
  recipientPhone: string;        // 받는 사람 휴대폰 (010-1234-5678 또는 01012345678)
  recipientName?: string;
  internalOrderId: string | number;  // 우리 시스템의 gift_redemptions.id (트래킹)
  msgTitle?: string;             // 카톡 메시지 제목 (옵션)
  msgBody?: string;              // 카톡 메시지 본문 (옵션)
}

export interface SendCouponResult {
  ok: boolean;
  mode: 'real' | 'mock' | 'disabled';
  externalOrderId?: string;     // KT alpha 의 trId / orderId
  externalCouponCode?: string;  // 발송된 쿠폰 PIN (즉시 받을 수 있는 경우)
  status: 'sent' | 'pending' | 'failed';
  message?: string;
  raw?: any;                    // 원본 API 응답 (디버깅용)
  error?: string;
}

export interface BalanceResult {
  ok: boolean;
  mode: 'real' | 'mock' | 'disabled';
  balance?: number;
  message?: string;
  raw?: any;
}

// 어떤 모드로 작동하는지 진단용
export function getGiftishowMode(env: GiftishowEnv): 'real' | 'mock' | 'disabled' {
  if (!env.GIFTISHOW_API_KEY) return 'disabled';
  if (env.GIFTISHOW_TEST_MODE === 'true') return 'mock';
  return 'real';
}

// 기본 API base URL
function getBase(env: GiftishowEnv): string {
  return env.GIFTISHOW_API_BASE || 'https://bizapi.giftishow.com/bizApi';
}

// 전화번호 정규화 (숫자만)
function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9]/g, '');
}

// 외부 주문번호 생성 (mock 용)
function genMockOrderId(): string {
  return 'mock_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

// ─────────────────────────────────────────────────────────────
//  쿠폰 발송 (학생이 신청 → 카톡 자동 발송)
// ─────────────────────────────────────────────────────────────
export async function sendCoupon(env: GiftishowEnv, params: SendCouponParams): Promise<SendCouponResult> {
  const mode = getGiftishowMode(env);
  const phone = normalizePhone(params.recipientPhone);

  // ──── disabled: API 키 없음 → pending 유지 ────
  if (mode === 'disabled') {
    return {
      ok: false,
      mode: 'disabled',
      status: 'pending',
      message: 'GIFTISHOW_API_KEY 미설정 — 관리자 수동 발송 대기',
    };
  }

  // ──── mock: 테스트 모드 → 가짜 성공 응답 ────
  if (mode === 'mock') {
    return {
      ok: true,
      mode: 'mock',
      status: 'sent',
      externalOrderId: genMockOrderId(),
      externalCouponCode: 'MOCK-' + Math.random().toString(36).slice(2, 10).toUpperCase(),
      message: '[TEST MODE] 실제 발송 안 함 - mock 응답',
    };
  }

  // ──── real: 실제 KT alpha API 호출 ────
  if (!params.externalProductCode) {
    return {
      ok: false,
      mode: 'real',
      status: 'failed',
      error: 'external_product_code_required',
      message: '상품에 기프티쇼 비즈 상품 코드(external_id)가 설정되지 않았습니다. 관리자 → 카탈로그 → 편집에서 등록하세요.',
    };
  }
  if (!phone || phone.length < 10) {
    return { ok: false, mode: 'real', status: 'failed', error: 'invalid_phone', message: '전화번호 형식 오류' };
  }

  const url = getBase(env) + '/v1/sendCoupon';
  // KT alpha 표준 요청 형태 (실제 가입 후 PDF 스펙에 맞춰 한 두 필드 조정 필요할 수 있음)
  const reqBody = {
    custAuthCd: env.GIFTISHOW_API_KEY,
    custId: env.GIFTISHOW_USER_ID || '',
    goodsCode: params.externalProductCode,
    callbackNo: env.GIFTISHOW_CALLBACK_URL || '',
    phoneNo: phone,
    msgTitle: params.msgTitle || '[망고아이] 선물이 도착했어요! 🎁',
    msgBody: params.msgBody || '망고아이 포인트로 교환한 선물입니다. 카카오톡 선물함에서 확인해주세요.',
    bizTrId: String(params.internalOrderId),   // 우리 주문 ID (콜백 매칭용)
  };

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(reqBody),
    });
    const text = await resp.text();
    let body: any = null;
    try { body = JSON.parse(text); } catch { body = { raw: text }; }
    return parseSendResponse(resp.status, body);
  } catch (e: any) {
    return {
      ok: false,
      mode: 'real',
      status: 'failed',
      error: 'network_error',
      message: '네트워크 오류: ' + String(e?.message || e),
    };
  }
}

// 응답 파싱 — KT alpha 실제 스펙에 맞춰 이 함수만 조정하면 됨
function parseSendResponse(httpStatus: number, body: any): SendCouponResult {
  // 표준 한국 B2B API 패턴: { resultCode: "0000", resultMsg: "성공", result: { trId: "...", pinNo: "..." } }
  // 또는: { code: "0000", message: "...", data: { ... } }
  // 또는: { status: "success", orderId: "..." }

  if (httpStatus < 200 || httpStatus >= 300) {
    return {
      ok: false, mode: 'real', status: 'failed',
      error: 'http_' + httpStatus,
      message: `HTTP ${httpStatus} — ${JSON.stringify(body).slice(0, 200)}`,
      raw: body,
    };
  }

  // 성공 코드 후보
  const successCodes = new Set(['0000', '00', 'SUCCESS', 'success', '200']);
  const code = body?.resultCode ?? body?.code ?? body?.resCode ?? body?.status ?? '';
  const msg  = body?.resultMsg  ?? body?.message ?? body?.resMsg ?? body?.errorMessage ?? '';
  const data = body?.result ?? body?.data ?? body;

  if (successCodes.has(String(code))) {
    const orderId = data?.trId || data?.orderId || data?.bizTrId || data?.transactionId || '';
    const pinNo = data?.pinNo || data?.couponNo || data?.couponCode || '';
    return {
      ok: true, mode: 'real',
      status: 'sent',
      externalOrderId: String(orderId || ''),
      externalCouponCode: pinNo ? String(pinNo) : undefined,
      message: msg || '발송 요청 접수',
      raw: body,
    };
  }

  // 실패
  return {
    ok: false, mode: 'real',
    status: 'failed',
    error: 'api_error_' + String(code || 'unknown'),
    message: msg || ('API 오류: code=' + code),
    raw: body,
  };
}

// ─────────────────────────────────────────────────────────────
//  잔액 조회 (KT alpha 가맹점 선불 잔액)
// ─────────────────────────────────────────────────────────────
export async function checkBalance(env: GiftishowEnv): Promise<BalanceResult> {
  const mode = getGiftishowMode(env);
  if (mode === 'disabled') {
    return { ok: false, mode: 'disabled', message: 'GIFTISHOW_API_KEY 미설정' };
  }
  if (mode === 'mock') {
    return { ok: true, mode: 'mock', balance: 999999, message: '[TEST MODE] mock 잔액' };
  }
  const url = getBase(env) + '/v1/depositBalance';
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        custAuthCd: env.GIFTISHOW_API_KEY,
        custId: env.GIFTISHOW_USER_ID || '',
      }),
    });
    const body: any = await resp.json().catch(() => ({}));
    const code = body?.resultCode ?? body?.code;
    if (String(code) === '0000' || String(code) === '00') {
      const bal = body?.result?.balance ?? body?.data?.balance ?? body?.balance ?? 0;
      return { ok: true, mode: 'real', balance: Number(bal) || 0, message: body?.resultMsg || 'OK', raw: body };
    }
    return { ok: false, mode: 'real', message: body?.resultMsg || ('API 오류 code=' + code), raw: body };
  } catch (e: any) {
    return { ok: false, mode: 'real', message: '네트워크 오류: ' + String(e?.message || e) };
  }
}

// ─────────────────────────────────────────────────────────────
//  발송 상태 조회 (주문번호로 진행 상황 확인)
// ─────────────────────────────────────────────────────────────
export async function checkOrderStatus(env: GiftishowEnv, externalOrderId: string): Promise<{
  ok: boolean; status?: 'sent' | 'delivered' | 'failed' | 'unknown'; message?: string; raw?: any;
}> {
  const mode = getGiftishowMode(env);
  if (mode === 'disabled') return { ok: false, message: 'API 키 미설정' };
  if (mode === 'mock') return { ok: true, status: 'delivered', message: '[TEST MODE] mock 상태' };
  const url = getBase(env) + '/v1/orderStatus';
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        custAuthCd: env.GIFTISHOW_API_KEY,
        custId: env.GIFTISHOW_USER_ID || '',
        trId: externalOrderId,
      }),
    });
    const body: any = await resp.json().catch(() => ({}));
    const code = body?.resultCode ?? body?.code;
    if (String(code) === '0000' || String(code) === '00') {
      const s = body?.result?.status || body?.data?.status || '';
      // KT alpha 상태 매핑 (실제 가입 후 조정 필요할 수 있음)
      let mapped: 'sent' | 'delivered' | 'failed' | 'unknown' = 'unknown';
      if (/sent|발송완료|SEND/i.test(s)) mapped = 'sent';
      if (/delivered|수령|USE|사용/i.test(s)) mapped = 'delivered';
      if (/fail|실패|CANCEL|취소/i.test(s)) mapped = 'failed';
      return { ok: true, status: mapped, message: body?.resultMsg, raw: body };
    }
    return { ok: false, message: body?.resultMsg || 'API 오류', raw: body };
  } catch (e: any) {
    return { ok: false, message: '네트워크 오류: ' + String(e?.message || e) };
  }
}

// ─────────────────────────────────────────────────────────────
//  웹훅 페이로드 파싱 (KT alpha 가 우리 콜백 URL 로 보내는 알림)
// ─────────────────────────────────────────────────────────────
export interface WebhookEvent {
  internalOrderId?: string;     // bizTrId → gift_redemptions.id
  externalOrderId?: string;     // KT alpha trId
  status?: 'sent' | 'delivered' | 'failed';
  couponCode?: string;
  message?: string;
  raw: any;
}

export function parseWebhook(body: any): WebhookEvent {
  return {
    internalOrderId: body?.bizTrId || body?.internal_order_id,
    externalOrderId: body?.trId || body?.orderId,
    status: (() => {
      const s = String(body?.status || body?.eventType || '').toLowerCase();
      if (s.includes('deliver') || s.includes('use') || s.includes('수령') || s.includes('사용')) return 'delivered';
      if (s.includes('send') || s.includes('sent') || s.includes('발송')) return 'sent';
      if (s.includes('fail') || s.includes('cancel') || s.includes('실패') || s.includes('취소')) return 'failed';
      return undefined;
    })(),
    couponCode: body?.pinNo || body?.couponCode || body?.couponNo,
    message: body?.message || body?.resultMsg || body?.eventMsg,
    raw: body,
  };
}
