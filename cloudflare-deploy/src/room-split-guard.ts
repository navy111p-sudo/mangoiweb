// ═══════════════════════════════════════════════════════════════════════
// 🚪 «같은 방 번호인데 다른 교실» 감시 — 도메인이 서로 다른 워커에 붙었는지 잰다.
//
// [왜 이 파일이 있는가]
//   이 저장소는 워커를 두 벌 배포한다(webrtc-unified-platform · -prod). 두 워커는
//   D1·KV·R2 를 같은 id 로 공유하지만 **Durable Object 네임스페이스만 갈린다.**
//   그래서 도메인이 서로 다른 워커에 붙으면 idFromName("class-848-20260901") 이
//   워커마다 «다른 방» 을 만들고, 두 사람이 같은 방 번호를 넣고도 서로 못 만난다.
//   출석·room_tokens 에는 둘 다 «같은 방에 있었다» 고 남아 **DB 만 보면 정상으로 보인다.**
//
//   이 사고는 네 번 났다 — 2026-08-19(강선생님 8회) · 08-25(class-895) ·
//   08-27(ubckt01 7회) · 09-01(class-848, 강선생님과 사장님). 그때마다 규칙서에
//   「고쳤다」고 적혔지만 두 번은 실제로 옮겨지지 않았고, 아무도 다시 확인하지 않았다.
//   ⟹ **문서로 막는 것은 이미 두 번 실패했다.** 그래서 사람 기억이 아니라 «측정» 으로 옮긴다.
//
// [무엇을 재는가 — 증상이 아니라 원인]
//   «한 방에 host 가 둘» 을 세는 방법도 있지만 그건 **도메인을 합친 뒤에는 정상**이라
//   멀쩡한 상태에 문자가 가고 알림이 무뎌진다. 그래서 원인 그 자체를 잰다 —
//   `idFromName()` 은 **네임스페이스마다 다른 값**을 돌려준다(방이 갈리는 이유가 바로 이것).
//   즉 이 지문이 도메인마다 다르면 그 두 도메인의 방은 반드시 갈려 있다. 대리지표가 아니다.
//
// [흐름]
//   ① 학생·강사가 수업에 들어올 때(= 출석 checkin) 그 요청을 «받은 워커» 가
//      자기 지문을 계산해 KV 에 `roomns:<host>` 로 적는다. 네트워크 호출 0회(순수 계산).
//   ② 15분 감시견(runSiteWatchdog)이 도메인들의 지문을 비교해 갈렸으면 문자 1회.
//
// ⛔ 이 파일의 함수는 **절대 던지지 않는다.** ①은 출석 기록 옆에서 돌고 ②는 감시견
//    안에서 돈다 — 던지면 «감시 장치가 감시 대상을 멈추는» 사고가 된다.
// ═══════════════════════════════════════════════════════════════════════
import { SITE_HOSTS } from './site-url';
import { sendPlainSms } from './solapi-client';

/** 지문을 뽑을 때 쓰는 고정 이름. 실제 방을 만들지 않는다(id 계산만 한다). */
export const NS_PROBE_NAME = '__mangoi_room_ns_probe__';

/** 기록이 이보다 오래되면 «모름» 으로 본다 — 옛 값으로 계속 문자하지 않기 위해. */
export const NS_FRESH_MS = 14 * 24 * 60 * 60 * 1000;   // 14일

const nsKey = (host: string) => `roomns:${String(host || '').toLowerCase()}`;

/* ⚠️ `kv.get(k).catch(...)` 는 **Promise 를 돌려줄 때만** 잡는다 — KV 가 «동기적으로» 던지면
   .catch 에 닿기도 전에 예외가 빠져나간다. 감시 장치가 던지면 감시 대상(감시견 전체)이
   그 자리에서 멈추므로, 읽기·쓰기·문자를 전부 이 헬퍼로만 한다.
   (하니스 ④절이 «전부 던지는 가짜 KV» 를 넣어 이것을 실제로 확인한다 — 첫 판에서
    실제로 이 구멍이 잡혔다.) */
async function kvGet(kv: any, key: string): Promise<string | null> {
  try { const v = await kv.get(key); return v == null ? null : String(v); } catch { return null; }
}
async function kvPut(kv: any, key: string, val: string): Promise<void> {
  // 조용히 실패하면 «배치를 적어 뒀다» 고 착각하게 된다 — 한 줄은 남긴다(던지지는 않는다).
  try { await kv.put(key, val); } catch (e: any) { console.warn('[room-split] KV put 실패', key, e?.message); }
}
async function kvDel(kv: any, key: string): Promise<void> {
  // 지우기가 실패하면 «알림 보냄» 표시가 남아 다음 사고에 문자가 안 간다 — 반드시 남긴다.
  try { await kv.delete(key); } catch (e: any) { console.warn('[room-split] KV delete 실패', key, e?.message); }
}
async function smsSafe(env: any, phone: string, text: string): Promise<{ ok: boolean; detail?: string }> {
  try { const r = await sendPlainSms(env, phone, text, { kind: 'room-split' }); return { ok: !!r.ok, detail: r.message || r.error }; }
  catch (e: any) { return { ok: false, detail: String(e?.message || e) }; }
}

/** 우리가 아는 도메인인가 — Host 헤더는 호출자가 마음대로 보낼 수 있으므로 반드시 거른다. */
function isKnownHost(host: string): boolean {
  const h = String(host || '').toLowerCase().split(':')[0].trim();
  return !!h && SITE_HOSTS.some((s) => s.toLowerCase() === h);
}

/**
 * 이 워커의 «방 세계» 지문. 두 워커에서 서로 다른 값이 나온다.
 * 모양이 예상과 다르면 null(=모름) — 확신이 없으면 알리지 않는 쪽으로 실패한다.
 */
export function roomNamespaceFingerprint(env: any): string | null {
  try {
    const ns = env && env.VIDEO_CALL_ROOM;
    if (!ns || typeof ns.idFromName !== 'function') return null;
    const s = String(ns.idFromName(NS_PROBE_NAME) || '');
    return /^[0-9a-f]{32,}$/i.test(s) ? s.toLowerCase() : null;
  } catch { return null; }
}

/**
 * ① 요청을 받은 워커가 «이 도메인은 내 방 세계다» 를 적어 둔다.
 * 값이 그대로면 쓰지 않는다(입장마다 KV 쓰기가 생기지 않게).
 */
export async function recordHostRoomNamespace(env: any, host: string | null): Promise<void> {
  try {
    const h = String(host || '').toLowerCase().split(':')[0].trim();
    if (!isKnownHost(h)) return;                 // 모르는 Host 는 무시(스팸·오염 방지)
    const kv: any = env && env.SESSION_STATE;
    if (!kv) return;
    const fp = roomNamespaceFingerprint(env);
    if (!fp) return;

    const prevRaw = await kvGet(kv, nsKey(h));
    let prev: any = null;
    try { prev = prevRaw ? JSON.parse(prevRaw) : null; } catch { prev = null; }

    // 지문이 같고 기록도 아직 싱싱하면 쓰지 않는다.
    if (prev && prev.ns === fp && Date.now() - Number(prev.at || 0) < NS_FRESH_MS / 2) return;

    await kvPut(kv, nsKey(h), JSON.stringify({ ns: fp, at: Date.now() }));
  } catch { /* 출석 기록을 절대 막지 않는다 */ }
}

export type RoomSplitResult = {
  state: 'unknown' | 'ok' | 'split';
  hosts?: Record<string, string>;   // host → 지문 앞 12자(로그용, 전체는 안 남긴다)
  smsSent?: boolean;
  detail?: string;
};

/**
 * ② 감시견이 도메인들의 지문을 대조한다.
 *   · 싱싱한 기록이 2개 미만이면 «모름» → 침묵(아직 그 도메인으로 아무도 안 들어온 것뿐).
 *   · 지문이 하나면 정상, 둘 이상이면 갈린 것.
 * 상태가 바뀔 때만 문자 1회 — 15분마다 같은 문자를 보내지 않는다.
 */
export async function checkRoomSplit(env: any): Promise<RoomSplitResult> {
  const kv: any = env && env.SESSION_STATE;
  if (!kv) return { state: 'unknown' };

  const fresh: Record<string, string> = {};
  for (const h of SITE_HOSTS) {
    try {
      const raw = await kvGet(kv, nsKey(h));
      if (!raw) continue;
      const rec = JSON.parse(raw);
      if (!rec || !rec.ns) continue;
      if (Date.now() - Number(rec.at || 0) > NS_FRESH_MS) continue;   // 오래된 값으로 알리지 않는다
      fresh[h] = String(rec.ns);
    } catch { /* 그 도메인만 건너뛴다 */ }
  }

  const seen = Object.keys(fresh);
  const distinct = new Set(Object.values(fresh));
  const state: RoomSplitResult['state'] =
    seen.length < 2 ? 'unknown' : (distinct.size === 1 ? 'ok' : 'split');

  const shown: Record<string, string> = {};
  for (const h of seen) shown[h] = fresh[h].slice(0, 12);

  const alerted = await kvGet(kv, 'roomns:alerted');
  let smsSent = false;
  let detail: string | undefined;

  if (state === 'split' && !alerted) {
    // 갈린 쪽 도메인을 실제로 골라 문자에 담는다 — 어디를 옮겨야 하는지 바로 알 수 있게.
    const groups: Record<string, string[]> = {};
    for (const h of seen) (groups[fresh[h]] = groups[fresh[h]] || []).push(h);
    const sides = Object.values(groups).map((g) => g.join(', ')).join('  ↔  ');
    const phone = String(env.OWNER_ALERT_PHONE || '').trim();
    if (phone) {
      const r = await smsSafe(env, phone,
        '[망고아이] 🔴 화상수업 방이 갈렸습니다.\n' + sides + '\n' +
        '같은 방 번호를 넣어도 서로 못 만납니다. Cloudflare 대시보드 > Workers & Pages > ' +
        'webrtc-unified-platform-prod > Domains & Routes 에 세 도메인을 모아 주세요.');
      smsSent = r.ok;
      detail = r.detail;
    }
    await kvPut(kv, 'roomns:alerted', '1');
  } else if (state === 'ok' && alerted) {
    const phone = String(env.OWNER_ALERT_PHONE || '').trim();
    if (phone) {
      const r = await smsSafe(env, phone, '[망고아이] ✅ 화상수업 방이 다시 하나로 합쳐졌습니다.');
      smsSent = r.ok;
      detail = r.detail;
    }
    await kvDel(kv, 'roomns:alerted');
  } else if (state === 'unknown' && alerted) {
    /* 기록이 오래돼 판단을 못 하게 된 것뿐이다 — «복구됐다» 고 말하지 않는다(거짓말이 된다).
       다만 표시는 지워, 나중에 진짜로 갈리면 다시 한 번 알릴 수 있게 한다. */
    await kvDel(kv, 'roomns:alerted');
  }

  return { state, hosts: shown, smsSent, detail };
}
