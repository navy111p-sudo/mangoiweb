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

// ═══════════════════════════════════════════════════════════════════════
// 🐕 자체 감시견 (self-watchdog) — cron(*/15)에서 호출.
//   우리 Worker 가 스스로 사이트(health)를 확인하다가, 응답이 없으면 관리자에게 문자.
//   UptimeRobot 유료 웹훅 없이도 문자 자동알림이 되게 하는 무료 경로.
//   ⚠️ 한계: Worker/CF 가 완전히 죽으면 cron 도 안 돌아 이 감시견은 못 잡음
//      → 그 경우는 UptimeRobot 앱 푸시(외부 감시)가 커버. 둘이 이중 안전망.
//   상태변화(정상↔장애) 시에만 1회 문자 → 15분마다 스팸 방지(KV 상태 저장).
//   transient 오탐 방지: 실패 감지 시 2초 후 1회 재확인, 둘 다 실패해야 '장애'.
// ═══════════════════════════════════════════════════════════════════════
export async function runSiteWatchdog(
  env: MangoEnv,
  opts?: { simulate?: 'up' | 'down' }
): Promise<{ prev: string; cur: string; changed: boolean; smsSent: boolean; detail?: string }> {
  const kv: any = (env as any).SESSION_STATE;

  // 핵심 의존성(D1 데이터베이스)이 살아있는지 직접 확인.
  //   ⚠️ Worker 가 자기 자신의 URL 을 fetch 하면 CF 가 막아(무한루프 방지) 오탐이 남 →
  //      HTTP self-fetch 대신 D1 쿼리로 백엔드 생존을 판단한다(오탐 0, HTTP 감시는 UptimeRobot 담당).
  const checkOnce = async (): Promise<boolean> => {
    try {
      const db: any = (env as any).DB;
      if (!db) return true; // DB 미바인딩이면 판단 불가 → 오탐 방지 위해 정상 취급
      const row: any = await db.prepare('SELECT 1 AS ok').first();
      return !!(row && (row.ok === 1 || row.ok === '1'));
    } catch { return false; }
  };

  let isUp: boolean;
  if (opts?.simulate) {
    isUp = opts.simulate === 'up';       // 테스트용 강제 상태
  } else {
    isUp = await checkOnce();
    if (!isUp) {                          // 실패면 잠깐 뒤 1회 재확인(순간 blip 무시)
      await new Promise(r => setTimeout(r, 2000));
      isUp = await checkOnce();
    }
  }

  const prev = (kv ? (await kv.get('watchdog:state').catch(() => null)) : null) || 'up';
  const cur = isUp ? 'up' : 'down';
  let smsSent = false;
  let detail: string | undefined;

  if (cur !== prev) {
    const phone = String((env as any).OWNER_ALERT_PHONE || '').trim();
    if (phone) {
      const text = isUp
        ? '[망고아이] ✅ 사이트가 정상 복구되었습니다.'
        : '[망고아이] ⚠️ 사이트 응답 없음 감지. 접속 확인이 필요합니다.';
      const r = await sendPlainSms(env, phone, text);
      smsSent = r.ok;
      detail = r.message || r.error;
    }
    if (kv) { try { await kv.put('watchdog:state', cur); } catch {} }
  }
  return { prev, cur, changed: cur !== prev, smsSent, detail };
}

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

  // 1b) 🐕 자체 감시견 수동 실행/테스트 — ?run=watchdog (&simulate=down|up 으로 상태 강제)
  //     cron 을 15분 기다리지 않고 지금 즉시 동작 확인용.
  if (url.searchParams.get('run') === 'watchdog') {
    const sim = url.searchParams.get('simulate');
    const res = await runSiteWatchdog(env, sim === 'down' || sim === 'up' ? { simulate: sim } : undefined);
    return json({ ok: true, watchdog: res });
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
  // 중복방지 타이머는 '발송 성공' 시에만 건다 — 실패 시엔 재시도를 막지 않도록.
  if (kv && r.ok) { try { await kv.put(throttleKey, String(Date.now()), { expirationTtl: 300 }); } catch {} }

  return json({ ok: r.ok, sent: r.ok, state: isUp ? 'up' : 'down', error: r.error, detail: r.message });
}
