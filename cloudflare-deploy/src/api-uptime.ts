// ═══════════════════════════════════════════════════════════════════════
// 📟 UptimeRobot 장애 웹훅 → 관리자 문자(SMS) 알림
//   흐름: UptimeRobot(사이트 죽음 감지) → POST/GET /api/uptime-hook?key=... → SOLAPI 문자
//   보호: ?key= 토큰(UPTIME_HOOK_KEY) 일치 필수(무단 호출로 SMS 스팸 방지) + KV 중복방지(90초)
//   대상: OWNER_ALERT_PHONE (미설정 시 발송 스킵)
//   ⚠️ 신규 /api 경로이므로 index.ts 라우팅 게이트에도 등록해야 함(SRS 함정 #1).
// ═══════════════════════════════════════════════════════════════════════
import { json, parseJsonBody } from './api-util';
import { sendPlainSms } from './solapi-client';
import type { MangoEnv } from './api-mango';

export async function handleUptimeApi(
  request: Request,
  url: URL,
  env: MangoEnv
): Promise<Response | null> {
  if (url.pathname !== '/api/uptime-hook') return null;

  // 1) 토큰 검증 — 아무나 호출해 문자 스팸 못 하게
  const expected = String((env as any).UPTIME_HOOK_KEY || '').trim();
  const given = String(url.searchParams.get('key') || '').trim();
  if (!expected || given !== expected) {
    return json({ ok: false, error: 'forbidden' }, 403);
  }

  // 2) up/down 판별 — UptimeRobot 이 query 또는 body 로 alertType(1=down,2=up) 전달.
  //    설정 방식이 달라도 견디도록 query·JSON·form 여러 곳에서 읽는다.
  let alertType = url.searchParams.get('alertType') || '';
  let monitorName = url.searchParams.get('monitorFriendlyName') || url.searchParams.get('name') || '';
  let statusHint = (url.searchParams.get('status') || '').toLowerCase();
  if (request.method === 'POST') {
    const body = await parseJsonBody(request);
    if (body && typeof body === 'object') {
      alertType = alertType || String(body.alertType ?? '');
      monitorName = monitorName || String(body.monitorFriendlyName || body.monitorURL || body.name || '');
      statusHint = statusHint || String(body.status || body.alertTypeFriendlyName || '').toLowerCase();
    }
  }

  const isUp = alertType === '2' || statusHint.includes('up') || statusHint.includes('정상');
  const site = monitorName || 'test.mangoi.co.kr';

  // 3) 중복방지 — 같은 상태 알림을 90초 내 반복 발송하지 않음(KV)
  const kv: any = (env as any).SESSION_STATE;
  const throttleKey = `uptime_sms:${isUp ? 'up' : 'down'}`;
  if (kv) {
    try {
      const last = await kv.get(throttleKey);
      if (last && (Date.now() - Number(last)) < 90 * 1000) {
        return json({ ok: true, skipped: 'throttled' });
      }
    } catch {}
  }

  // 4) 문자 발송
  const phone = String((env as any).OWNER_ALERT_PHONE || '').trim();
  if (!phone) return json({ ok: false, error: 'owner_phone_not_set' }, 200);

  const text = isUp
    ? `[망고아이] ✅ 사이트 정상 복구됨 (${site}).`
    : `[망고아이] ⚠️ 사이트 응답 없음 감지 (${site}). 접속 확인이 필요합니다.`;

  const r = await sendPlainSms(env, phone, text);
  if (kv) { try { await kv.put(throttleKey, String(Date.now()), { expirationTtl: 300 }); } catch {} }

  return json({ ok: r.ok, sent: r.ok, state: isUp ? 'up' : 'down', error: r.error, detail: r.message });
}
