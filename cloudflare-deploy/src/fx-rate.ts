/**
 * 💱 오늘의 원·페소 환율 (결재함 16단계, 2026-09-25)
 *
 * 순서: ① 오늘자 KV 캐시 → ② 공개 환율 API(open.er-api.com, 키 없음, 3초 제한) → ③ 마지막으로 받은 값(KV)
 *       → ④ 급여 화면에서 사람이 저장한 환율(payroll_settings 행이 «있을 때만») → ⑤ null.
 *   · 어디서 왔는지(source)와 그 값의 날짜(date)를 언제나 함께 돌려준다 — 화면이 «오늘 환율» 인지 «옛 값» 인지 말한다.
 *   ⛔ 기본값(24원 등)을 지어내지 않는다 — 못 구하면 null. 화면은 바꿔 보기를 끈다.
 *   ⛔ 던지지 않는다 — 장부가 이것 때문에 죽으면 안 된다.
 *   ⚠️ 워커에서 그 API 에 닿는지는 이 저장소 환경에서 재지 못했다(프록시). 닿지 않으면 ③·④로 떨어진다.
 */
import { parseFxResponse, fxSane, kstYmd, type FxRate } from './approval-policy';

const FX_URL = 'https://open.er-api.com/v6/latest/PHP';
const KEY_LAST = 'fx:php-krw:last';

export async function getTodayFx(env: any, nowMs: number = Date.now()): Promise<FxRate | null> {
  const today = kstYmd(nowMs);
  const kv = env?.SESSION_STATE;
  const keyToday = 'fx:php-krw:' + today;
  try {
    const hit = kv ? await kv.get(keyToday, 'json') : null;
    if (hit && fxSane(hit.krw_per_php) != null && hit.date) return { krw_per_php: fxSane(hit.krw_per_php)!, date: String(hit.date), source: 'live' };
  } catch { /* 캐시 못 읽음 — 새로 받는다 */ }
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 3000);
    const r = await fetch(FX_URL, { signal: ac.signal, cf: { cacheTtl: 3600 } } as any);
    clearTimeout(timer);
    if (r.ok) {
      const p = parseFxResponse(await r.json());
      if (p) {
        try {
          if (kv) {
            await kv.put(keyToday, JSON.stringify(p), { expirationTtl: 2 * 86400 });
            await kv.put(KEY_LAST, JSON.stringify(p));
          }
        } catch { /* 저장 실패는 이번 응답에 영향 없음 */ }
        return { krw_per_php: p.krw_per_php, date: p.date, source: 'live' };
      }
    }
    console.warn('[fx] rate API gave no usable answer', r.status);
  } catch (e: any) { console.warn('[fx] rate API failed', String(e?.message || e)); }
  try {
    const last = kv ? await kv.get(KEY_LAST, 'json') : null;
    if (last && fxSane(last.krw_per_php) != null && last.date) return { krw_per_php: fxSane(last.krw_per_php)!, date: String(last.date), source: 'last' };
  } catch { /* 넘어간다 */ }
  try {
    const row: any = await env.DB.prepare('SELECT php_krw, updated_at FROM payroll_settings WHERE id=1').first();
    const v = fxSane(row?.php_krw);
    const at = Number(row?.updated_at);
    if (v != null) return { krw_per_php: v, date: isFinite(at) && at > 0 ? kstYmd(at) : '', source: 'payroll' };
  } catch { /* 표가 없을 수 있다 */ }
  return null;
}
