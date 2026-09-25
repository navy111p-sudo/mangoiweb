/**
 * 💱 필리핀 페소 → 원화 «최신 환율» (2026-09-25 사장님 「급여를 원화로도 보이게, 실시간 환율」)
 *
 *   GET /api/admin/reports/fx-rate  → { ok, base:'PHP', quote:'KRW', rate, source, rate_time, fetched_at, stale }
 *
 * ⚠️ «실시간» 의 한계를 화면이 사실대로 말하게 할 것 — 무료 공개 환율 API 는 **분 단위가 아니라
 *    하루 1회 안팎** 갱신된다. 그래서 응답에 «그 환율이 매겨진 시각»(rate_time)을 함께 싣고
 *    화면이 그것을 그대로 적는다(「실시간」이라고 단정하지 않는다).
 * ⚠️ 조회가 실패하면 **숫자를 지어내지 않는다** — `payroll_settings.php_krw`(기본 24)로 떨어뜨리면
 *    화면이 그 값을 «오늘 환율» 로 보여 준다. 마지막으로 성공한 값(최대 7일)만 `stale:true` 로 돌려준다.
 * ⚠️ 이 값은 «보기용» 이다 — 급여 계산·저장·CSV 는 한 글자도 바뀌지 않는다(전부 ₱ 그대로).
 */

const KEY_FRESH = 'fx:PHP:KRW:v1';          // 30분 캐시 — 관리자가 여러 번 눌러도 외부 호출은 30분에 1번
const KEY_LAST_GOOD = 'fx:PHP:KRW:last-good'; // 7일 — 외부 API 가 죽었을 때 «마지막 값» 을 정직하게 보여 준다
const FRESH_TTL = 1800;
const LAST_GOOD_TTL = 7 * 86400;

export interface FxRate {
  ok: boolean;
  base: 'PHP';
  quote: 'KRW';
  rate?: number;          // 1 PHP = rate KRW
  source?: string;
  rate_time?: number;     // 환율이 매겨진 시각(ms) — 제공자가 준 값
  fetched_at?: number;    // 우리가 받아 온 시각(ms)
  stale?: boolean;        // true = 지금 새로 못 받아서 «마지막으로 성공한 값» 을 준 것
  error?: string;
}

/** 합리 범위 밖이면 버린다(응답이 깨졌을 때 이상한 숫자로 급여를 보여 주지 않게). */
export function sanePhpKrw(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (n < 5 || n > 100) return null;   // 1페소는 수십 원대 — 그 밖은 응답 오류로 본다
  return n;
}

async function fetchJson(url: string): Promise<any> {
  const r = await fetch(url, { signal: AbortSignal.timeout(5000), headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('http-' + r.status);
  return r.json();
}

/** 제공자 둘을 차례로 묻는다. 둘 다 실패하면 null. */
async function fetchLive(): Promise<Omit<FxRate, 'ok' | 'base' | 'quote' | 'stale'> | null> {
  const now = Date.now();
  // ① open.er-api.com — 키 없음, 하루 1회 갱신
  try {
    const d = await fetchJson('https://open.er-api.com/v6/latest/PHP');
    const rate = sanePhpKrw(d?.rates?.KRW);
    if (d?.result === 'success' && rate) {
      const t = Number(d.time_last_update_unix);
      return { rate, source: 'open.er-api.com', rate_time: t > 0 ? t * 1000 : undefined, fetched_at: now };
    }
  } catch { /* 다음 제공자로 */ }
  // ② frankfurter.app — 유럽중앙은행(ECB) 기준, 영업일 1회 갱신
  try {
    const d = await fetchJson('https://api.frankfurter.app/latest?from=PHP&to=KRW');
    const rate = sanePhpKrw(d?.rates?.KRW);
    if (rate) {
      const t = d?.date ? Date.parse(String(d.date) + 'T00:00:00Z') : NaN;
      return { rate, source: 'frankfurter.app (ECB)', rate_time: Number.isFinite(t) ? t : undefined, fetched_at: now };
    }
  } catch { /* 둘 다 실패 */ }
  return null;
}

export async function getPhpKrwLive(env: any): Promise<FxRate> {
  const kv = env?.SESSION_STATE;
  const base = { base: 'PHP' as const, quote: 'KRW' as const };
  try {
    const cached = kv ? await kv.get(KEY_FRESH, 'json') : null;
    if (cached && sanePhpKrw((cached as any).rate)) return { ok: true, ...base, ...(cached as any), stale: false };
  } catch { /* 캐시를 못 읽으면 새로 받는다 */ }

  const live = await fetchLive();
  if (live) {
    try {
      if (kv) {
        await kv.put(KEY_FRESH, JSON.stringify(live), { expirationTtl: FRESH_TTL });
        await kv.put(KEY_LAST_GOOD, JSON.stringify(live), { expirationTtl: LAST_GOOD_TTL });
      }
    } catch { /* 저장 실패는 응답을 막지 않는다 */ }
    return { ok: true, ...base, ...live, stale: false };
  }

  try {
    const last = kv ? await kv.get(KEY_LAST_GOOD, 'json') : null;
    if (last && sanePhpKrw((last as any).rate)) return { ok: true, ...base, ...(last as any), stale: true };
  } catch { /* 아래로 */ }
  return { ok: false, ...base, error: 'fx_unavailable' };
}
