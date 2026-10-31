/**
 * 🎚️ /api/admin/ai-billing/correction-mode — 학원별 A.i 말하기 교정 방식 (2026-10-31)
 *
 *   GET  : 내 범위의 학원과 지금 방식.  대리점 = 자기 학원 하나 · 본사 = 정해 둔 학원 + 시범 학원 (+ ?q= 로 학원 찾기)
 *          지사·지사본사 = 산하 학원(보기만).
 *   POST : {shop_name, mode}  mode = free_talk|balanced|focused, '' 이면 지우기(시범 표·기본으로).
 *          본사 또는 «그 학원» 대리점 계정만(드릴다운 승격으로는 못 씀 — ai-billing.ts writeAllowed 와 같은 규칙).
 *
 * ⛔ 쓰기 권한은 «원래 로그인 계정» 으로 판정한다(getScope noDrillDown). 지사가 ?as=agency:… 로 산하 학원을
 *    바꾸면 안 된다(2026-09-11 사장님: 지사는 보기만).
 * ⛔ 범위를 못 읽으면 막는다(쓰기). 보기는 «권한 없음» 으로 답한다.
 * 감시: test-harness/warmup_shop_mode_harness.mjs
 */
import { json, parseJsonBody } from './api-util';
import { getScope, scopeStudentCond, type Scope } from './scope';
import { checkAdminSession } from './auth-admin';
import { WARMUP_MODE_PILOT, pilotModeFor } from './warmup-honest';
import { isShopMode, listShopModes, getShopMode, setShopMode, type ShopMode } from './warmup-shop-mode';

const NONE: Scope = { type: 'none', value: null, label: '권한 없음' };
const fail = (msg: string, status = 400) => json({ ok: false, error: msg }, status);

async function scopeOf(env: any, request: Request, noDrillDown: boolean): Promise<Scope> {
  try { return await getScope(env, request, noDrillDown ? { noDrillDown: true } : {}); }
  catch (e: any) { console.warn('[correction-mode] scope failed:', e?.message || e); return NONE; }
}

/** 쓰기 판정 — 본사 또는 그 학원 대리점 계정. (순수 함수 — 하니스가 경계값을 넣어 돌린다) */
export function canWriteShopMode(raw: Scope | null | undefined, shopName: string): boolean {
  if (!raw || !shopName) return false;
  if (raw.type === 'hq') return true;
  return raw.type === 'agency' && !!raw.value && raw.value === shopName;
}

type Row = { shop_name: string; mode: ShopMode | null; pilot_mode: ShopMode | null; editable: boolean; updated_at?: number | null; updated_by?: string | null };

export async function correctionModeRouter(request: Request, env: any): Promise<Response> {
  const method = request.method.toUpperCase();
  const raw = await scopeOf(env, request, true);

  if (method === 'GET') {
    const scope = await scopeOf(env, request, false);
    if (scope.type === 'none') return fail('forbidden', 403);
    const url = new URL(request.url);
    const set = await listShopModes(env);
    if (!set) return fail('lookup_failed', 503);
    const setMap = new Map(set.map((r) => [r.shop_name, r]));
    const mk = (shop: string): Row => {
      const r = setMap.get(shop);
      return { shop_name: shop, mode: r ? r.mode : null, pilot_mode: pilotModeFor(shop) as ShopMode | null,
        editable: canWriteShopMode(raw, shop), updated_at: r ? r.updated_at : null, updated_by: r ? r.updated_by : null };
    };

    if (scope.type === 'agency') {
      const shop = String(scope.value || '').trim();
      if (!shop) return fail('forbidden', 403);
      return json({ ok: true, scope: scope.type, rows: [mk(shop)] });
    }

    if (scope.type === 'hq') {
      const names = new Set<string>([...setMap.keys(), ...Object.keys(WARMUP_MODE_PILOT)]);
      const rows = [...names].sort().map(mk);
      const q = (url.searchParams.get('q') || '').trim().toLowerCase();
      let found: Row[] = [];
      if (q) {
        try {
          const r: any = await env.DB.prepare(
            `SELECT DISTINCT shop_name FROM students_erp WHERE shop_name IS NOT NULL AND TRIM(shop_name) <> '' AND instr(LOWER(shop_name), ?) > 0 ORDER BY shop_name LIMIT 30`
          ).bind(q).all();
          found = ((r && r.results) || []).map((x: any) => mk(String(x.shop_name)));
        } catch (e: any) { console.warn('[correction-mode] search failed:', e?.message || e); return fail('search_failed', 503); }
      }
      return json({ ok: true, scope: scope.type, rows, found });
    }

    // 지사·지사본사 — 산하 학원을 보기만 한다
    const sc = scopeStudentCond(scope, '');
    try {
      const r: any = await env.DB.prepare(
        `SELECT DISTINCT shop_name FROM students_erp WHERE shop_name IS NOT NULL AND TRIM(shop_name) <> ''${sc.cond ? ' AND ' + sc.cond : ''} ORDER BY shop_name LIMIT 300`
      ).bind(...sc.binds).all();
      const rows = ((r && r.results) || []).map((x: any) => mk(String(x.shop_name)));
      return json({ ok: true, scope: scope.type, rows });
    } catch (e: any) { console.warn('[correction-mode] branch list failed:', e?.message || e); return fail('lookup_failed', 503); }
  }

  if (method === 'POST') {
    if (raw.type !== 'hq' && raw.type !== 'agency') return fail('forbidden', 403);
    const b: any = (await parseJsonBody(request)) || {};
    let shop = String(b.shop_name || '').trim();
    if (!shop && raw.type === 'agency') shop = String(raw.value || '').trim();
    if (!shop) return fail('shop_name required');
    if (!canWriteShopMode(raw, shop)) return fail('forbidden: own academy only', 403);
    const m = b.mode == null ? '' : String(b.mode).trim();
    if (m && !isShopMode(m)) return fail('invalid mode');
    // 본사가 오타로 «없는 학원» 에 설정을 만들지 않게 — 그 이름의 학생이 실제로 있는지 본다(못 읽으면 막는다).
    let exists: any = null;
    try { exists = await env.DB.prepare('SELECT 1 AS ok FROM students_erp WHERE shop_name = ? LIMIT 1').bind(shop).first(); }
    catch (e: any) { console.warn('[correction-mode] shop check failed:', e?.message || e); return fail('lookup_failed', 503); }
    if (!exists) return fail('unknown_shop', 404);
    let by = '';
    try { const s: any = await checkAdminSession(request, env); by = (s && s.username) || ''; } catch (e: any) { console.warn('[correction-mode] who failed:', e?.message || e); }
    const okSave = await setShopMode(env, shop, m ? (m as ShopMode) : null, by);
    if (!okSave) return fail('save_failed', 500);
    const now = await getShopMode(env, shop);
    return json({ ok: true, shop_name: shop, mode: now, pilot_mode: pilotModeFor(shop) });
  }

  return fail('method not allowed', 405);
}
