// ═══════════════════════════════════════════════════════════════════════
// 📟 UptimeRobot 장애 웹훅 → 관리자 문자(SMS) 알림
//   흐름: UptimeRobot(사이트 죽음 감지) → POST/GET /api/uptime-hook?key=... → SOLAPI 문자
//   보호: ?key= 토큰(UPTIME_HOOK_KEY) 일치 필수(무단 호출로 SMS 스팸 방지) + KV 중복방지(90초)
//   대상: OWNER_ALERT_PHONE (미설정 시 발송 스킵)
//   ⚠️ 신규 /api 경로이므로 index.ts 라우팅 게이트에도 등록해야 함(SRS 함정 #1).
// ═══════════════════════════════════════════════════════════════════════
import { json, parseJsonBody, keyMatchesAny } from './api-util';
import { SITE_HOSTS } from './site-url';        // 🔗 사람에게 나가는 링크는 한 곳에서
import { sendPlainSms, getSolapiMode } from './solapi-client';
import { checkRoomSplit } from './room-split-guard';   // 🚪 도메인이 다른 워커에 붙었는지(방 갈림)
import type { MangoEnv } from './api-mango';

// ═══════════════════════════════════════════════════════════════════════
// 🐕 1층 감시견 (self-watchdog) — cron(*/15)에서 호출.
//   우리 Worker 가 스스로 백엔드(D1)를 확인하다가, 응답이 없으면 관리자에게 문자.
//   상태변화(정상↔장애) 시에만 1회 문자 → 15분마다 스팸 방지(KV 상태 저장).
//   transient 오탐 방지: 실패 감지 시 2초 후 1회 재확인, 둘 다 실패해야 '장애'.
//
// 🔴 이 감시견 혼자서는 절대 못 잡는 것이 있다 — **자기 자신의 죽음**.
//   Worker/CF 가 통째로 죽으면 cron 도 안 돌고 문자도 못 보낸다. 즉 «가장 심각한 장애일수록
//   더 조용해진다». 오래 «UptimeRobot 이 그걸 커버한다» 고 적혀 있었지만, 2026-08-07 확인 결과
//   **UptimeRobot 웹훅은 유료 전용이라 애초에 만들어진 적이 없었다.** 감시는 한 겹뿐이었다.
//
// ✅ 그래서 2층을 붙였다 (2026-08-07) — 카페24 서버의 /root/mangoi-watchdog.sh (ops/ 에 원본).
//   · 5분마다 **바깥에서** HTTP 로 사이트를 찔러 본다 (CF 밖 · 다른 사업자 · 다른 회선)
//   · 문자도 **워커를 거치지 않고** 카페24 → SOLAPI 로 직접 쏜다 (워커가 죽어도 문자는 나간다)
//   · 그 호출(`?run=probe`)이 곧 «2층 살아있음» 체크인이 된다 → 아래 checkLayer2 가 역감시.
//   두 층이 서로를 본다. 한 층이 죽으면 남은 층이 그 사실 자체를 알린다.
// ═══════════════════════════════════════════════════════════════════════

/** 2층(외부 감시) 이 얼마나 오래 조용한지 — 30분 넘게 체크인이 없으면 «감시가 멈췄다» 고 알린다.
 *  ⚠️ 한 번도 체크인한 적 없으면(=아직 설치 전) 조용히 넘어간다. 설치 전부터 울리면 안 되니까. */
const LAYER2_STALE_MS = 30 * 60 * 1000;

async function checkLayer2(env: MangoEnv): Promise<{ state: 'unset' | 'ok' | 'stale'; ageSec?: number; smsSent?: boolean }> {
  const kv: any = (env as any).SESSION_STATE;
  if (!kv) return { state: 'unset' };
  const last = await kv.get('watchdog2:last').catch(() => null);
  if (!last) return { state: 'unset' };            // 아직 설치 전 → 침묵

  const age = Date.now() - Number(last);
  const stale = age > LAYER2_STALE_MS;
  const alerted = await kv.get('watchdog2:alerted').catch(() => null);
  let smsSent = false;

  // 상태가 바뀔 때만 1회 — 15분마다 같은 문자를 보내지 않는다.
  if (stale !== !!alerted) {
    const phone = String((env as any).OWNER_ALERT_PHONE || '').trim();
    if (phone) {
      const text = stale
        ? '[망고아이] 🔕 외부 장애감시(2층)가 30분째 응답이 없습니다. 사이트는 정상이지만 감시가 한 겹뿐입니다.'
        : '[망고아이] 🔔 외부 장애감시(2층)가 정상 복구되었습니다.';
      const r = await sendPlainSms(env, phone, text, { kind: 'uptime' });
      smsSent = r.ok;
    }
    try { stale ? await kv.put('watchdog2:alerted', '1') : await kv.delete('watchdog2:alerted'); } catch {}
  }
  return { state: stale ? 'stale' : 'ok', ageSec: Math.round(age / 1000), smsSent };
}

/** D1(백엔드)이 살아있는지 — 1층 판정과 2층 deep probe 가 같은 함수를 쓴다(판정이 갈리지 않게). */
async function dbAlive(env: MangoEnv): Promise<boolean> {
  try {
    const db: any = (env as any).DB;
    if (!db) return true; // DB 미바인딩이면 판단 불가 → 오탐 방지 위해 정상 취급
    const row: any = await db.prepare('SELECT 1 AS ok').first();
    return !!(row && (row.ok === 1 || row.ok === '1'));
  } catch { return false; }
}

export async function runSiteWatchdog(
  env: MangoEnv,
  opts?: { simulate?: 'up' | 'down' }
): Promise<{ prev: string; cur: string; changed: boolean; smsSent: boolean; detail?: string; layer2?: any; roomSplit?: any }> {
  const kv: any = (env as any).SESSION_STATE;

  // 핵심 의존성(D1 데이터베이스)이 살아있는지 직접 확인.
  //   ⚠️ Worker 가 자기 자신의 URL 을 fetch 하면 CF 가 막아(무한루프 방지) 오탐이 남 →
  //      HTTP self-fetch 대신 D1 쿼리로 백엔드 생존을 판단한다(오탐 0).
  //   HTTP 경로(라우팅·DNS·워커 예외)는 이 함수가 원리적으로 못 본다 → **2층(카페24)이 담당**.
  const checkOnce = dbAlive.bind(null, env);

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
      const r = await sendPlainSms(env, phone, text, { kind: 'uptime' });
      smsSent = r.ok;
      detail = r.message || r.error;
    }
    if (kv) { try { await kv.put('watchdog:state', cur); } catch {} }
  }

  /* 💓 1층 하트비트 — «cron 이 마지막으로 돈 시각». 상태변화가 없어도 **매번** 찍는다.
     2층이 이 값을 보고 «워커는 살아서 응답하는데 cron 만 조용히 죽었다» 를 잡아낸다.
     (실제로 이런 장애가 제일 지독하다 — 사이트는 멀쩡해 보이는데 감시·정산·알림이 전부 멈춘다.) */
  if (kv) { try { await kv.put('watchdog:last', String(Date.now())); } catch {} }

  // 🔁 역감시 — 2층이 조용해지면 그 사실 자체를 알린다(감시가 한 겹으로 줄었다는 뜻).
  const layer2 = await checkLayer2(env).catch(() => undefined);

  /* 🚪 «같은 방 번호인데 다른 교실» 감시 — 도메인이 서로 다른 워커에 붙으면 DO 가 갈려
     같은 방 번호로도 서로 못 만난다(2026-08-19·08-25·08-27·09-01 네 번 사고).
     규칙서에 「고쳤다」고 적어 두는 방식은 두 번 실패했으므로 여기서 «측정» 한다.
     ⚠️ layer2 와 같이 .catch 로 감싼다 — 이게 던지면 감시견 전체가 멈춘다. */
  const roomSplit = await checkRoomSplit(env).catch(() => undefined);

  return { prev, cur, changed: cur !== prev, smsSent, detail, layer2, roomSplit };
}

export async function handleUptimeApi(
  request: Request,
  url: URL,
  env: MangoEnv
): Promise<Response | null> {
  if (url.pathname !== '/api/uptime-hook') return null;

  // 1) 토큰 검증 — 아무나 호출해 문자 스팸 못 하게
  /* 🔐 회전 완료(4/4). 후보는 새 키 하나뿐. 호출자: 카페24 /root/mangoi-watchdog.sh (2층). */
  const given = String(url.searchParams.get('key') || '').trim();
  if (!keyMatchesAny(given, (env as any).UPTIME_HOOK_KEY_NEW)) {
    return json({ ok: false, error: 'forbidden' }, 403);
  }

  /* 1a) 🛰 2층(카페24 외부 감시)이 5분마다 부르는 심층 점검 — **문자를 보내지 않는다.**
     돌려주는 것: D1 생존 · 1층 cron 이 마지막으로 돈 지 몇 초 됐나.
     그리고 이 호출 자체가 «2층 살아있음» 체크인이다 → runSiteWatchdog 의 checkLayer2 가 읽는다.
     ⚠️ 판정(문자 발송)은 2층이 한다. 워커가 죽으면 이 응답 자체가 안 오는데,
        그때 판정을 워커에 맡기면 아무 일도 일어나지 않기 때문이다. */
  if (url.searchParams.get('run') === 'probe') {
    const kv0: any = (env as any).SESSION_STATE;
    if (kv0) { try { await kv0.put('watchdog2:last', String(Date.now())); } catch {} }
    const db = await dbAlive(env);
    const lastCron = kv0 ? await kv0.get('watchdog:last').catch(() => null) : null;
    const cronAgeSec = lastCron ? Math.round((Date.now() - Number(lastCron)) / 1000) : null;
    return json({
      ok: true,
      probe: {
        db,
        cron_age_sec: cronAgeSec,
        // cron 은 */15 → 40분 넘게 소식 없으면 죽은 것으로 본다(2회 걸러도 여유).
        // null = 아직 한 번도 안 돎(배포 직후) → 2층은 이걸 «장애» 로 치지 않는다.
        cron_stale: cronAgeSec == null ? null : cronAgeSec > 40 * 60,
        build: String((env as any).BUILD_STAMP || ''),
      },
    });
  }

  // 1b) 🐕 자체 감시견 수동 실행/테스트 — ?run=watchdog (&simulate=down|up 으로 상태 강제)
  //     cron 을 15분 기다리지 않고 지금 즉시 동작 확인용.
  if (url.searchParams.get('run') === 'watchdog') {
    const sim = url.searchParams.get('simulate');
    const res = await runSiteWatchdog(env, sim === 'down' || sim === 'up' ? { simulate: sim } : undefined);
    /* 📋 설정 점검 — 값이 아니라 «설정돼 있는가» 만 돌려준다 (2026-08-07).
       왜 필요한가: 발신·수신 번호를 wrangler.toml [vars] 에서 secret 으로 옮겼는데,
       잘못 옮기면 sendPlainSms 가 invalid_from / owner_phone_not_set 으로 **조용히 안 보낸다**.
       그런데 그걸 확인하려면 실제로 장애 문자를 한 통 쏴 보는 수밖에 없었다(사장님 폰으로).
       참/거짓만 보여주면 **문자를 보내지 않고도** 알림 체계가 살아있는지 확인할 수 있다.
       ⚠️ 번호 자체는 절대 내보내지 않는다 — 이 경로는 키만 맞으면 누구나 부를 수 있다. */
    const cfg = {
      owner_phone_set: !!String((env as any).OWNER_ALERT_PHONE || '').trim(),
      sms_from_set: !!String((env as any).SOLAPI_FROM_PHONE || '').trim(),
      solapi_mode: getSolapiMode(env as any),   // disabled | mock | real
      /* 🛰 2층 설치 여부 — unset 이면 카페24 감시 스크립트가 아직 한 번도 안 붙은 것.
         「감시가 이중인가」를 문자 한 통 안 보내고 여기서 바로 확인할 수 있어야 한다. */
      layer2: res.layer2?.state ?? 'unset',
      layer2_age_sec: res.layer2?.ageSec ?? null,
    };
    return json({ ok: true, watchdog: res, config: cfg });
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
  const site = monitorName || SITE_HOSTS[0];

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

  const r = await sendPlainSms(env, phone, text, { kind: 'uptime' });
  // 중복방지 타이머는 '발송 성공' 시에만 건다 — 실패 시엔 재시도를 막지 않도록.
  if (kv && r.ok) { try { await kv.put(throttleKey, String(Date.now()), { expirationTtl: 300 }); } catch {} }

  return json({ ok: r.ok, sent: r.ok, state: isUp ? 'up' : 'down', error: r.error, detail: r.message });
}
