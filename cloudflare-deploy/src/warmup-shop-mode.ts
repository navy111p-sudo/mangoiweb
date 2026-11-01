/**
 * 🎚️ 학원별 A.i 말하기(웜업) 교정 방식 — 원장님이 관리 화면에서 정한다 (2026-10-31)
 *
 * [왜] 사장님 「원장님 관리 화면에서 학원별 교정 방식 지정도 만들어줘」.
 *   그전에는 시범 표(warmup-honest.ts 의 WARMUP_MODE_PILOT — 코드에 박힌 학원 이름)를 고쳐야만 바뀌었다.
 *
 * [판정 순서 — 정본은 warmup-honest.ts 의 resolveWarmupHonest]
 *   ① 학생이 첫 화면에서 직접 고른 모드 → ② 이 표(학원 설정) → ③ 시범 표 → ④ 없음(예전 동작)
 *
 * [단위] 학원 = students_erp.shop_name «그대로»(정확일치). 대리점 계정 스코프 값과 같은 문자열이다.
 *
 * ⛔ 이 모듈의 읽기 함수는 던지지 않는다 — 웜업 대화 한가운데서 불린다(못 읽으면 null = 다음 단계로).
 * ⛔ 표는 «한 문장» 으로 만든다 — D1 exec 는 줄마다 실행해 여러 줄 CREATE 가 조용히 실패한다(CLAUDE.md 2장).
 * 감시: test-harness/warmup_shop_mode_harness.mjs
 */

/* ⚠️ 모드 목록은 warmup-honest.ts 의 WARMUP_MODES 와 «같아야» 한다. 이 파일이 그 파일을 import 하면
   순환이 생기고(그 파일이 이 파일을 부른다) 하니스가 한 파일만 떼어 돌리기 어려워져 값만 둔다.
   두 목록이 같은지는 하니스 ①이 대조한다. */
export const SHOP_MODES = ['free_talk', 'balanced', 'focused'] as const;
export type ShopMode = typeof SHOP_MODES[number];

export const SHOP_MODE_TABLE_SQL =
  'CREATE TABLE IF NOT EXISTS warmup_shop_mode (shop_name TEXT PRIMARY KEY, mode TEXT NOT NULL, updated_at INTEGER, updated_by TEXT)';

/* 같은 DB 묶음(isolate 안에서 같은 객체)에는 한 번만 만든다. 객체가 바뀌면 다시 «있으면 그대로» 를 한 번 부른다(싸다). */
const _ready = new WeakSet<object>();
export async function ensureShopModeTable(env: any): Promise<boolean> {
  const db = env && env.DB;
  if (!db) return false;
  if (_ready.has(db)) return true;
  try {
    await db.prepare(SHOP_MODE_TABLE_SQL).run();
    _ready.add(db);
    return true;
  } catch (e: any) {
    console.warn('[warmup-shop-mode] table create failed:', e?.message || e);
    return false;
  }
}

export function isShopMode(v: unknown): v is ShopMode {
  return typeof v === 'string' && (SHOP_MODES as readonly string[]).includes(v);
}

/** 학원 이름 → 원장님이 정한 모드. 없거나 못 읽으면 null(던지지 않음). */
export async function getShopMode(env: any, shopName: unknown): Promise<ShopMode | null> {
  try {
    const k = String(shopName == null ? '' : shopName).trim();
    if (!k || !env || !env.DB) return null;
    const row: any = await env.DB.prepare('SELECT mode FROM warmup_shop_mode WHERE shop_name = ? LIMIT 1').bind(k).first();
    const m = row && row.mode;
    return isShopMode(m) ? m : null;
  } catch (e: any) {
    // 표가 아직 없으면(no such table) 여기로 온다 — «설정 없음» 과 같다(다음 단계 = 시범 표·기본).
    console.warn('[warmup-shop-mode] read skipped:', e?.message || e);
    return null;
  }
}

/** 정하기(mode) · 지우기(null — 시범 표·기본으로 돌아감). 실패하면 false. */
export async function setShopMode(env: any, shopName: string, mode: ShopMode | null, by: string): Promise<boolean> {
  const k = String(shopName || '').trim();
  if (!k) return false;
  if (mode !== null && !isShopMode(mode)) return false;
  if (!(await ensureShopModeTable(env))) return false;
  try {
    if (mode === null) {
      await env.DB.prepare('DELETE FROM warmup_shop_mode WHERE shop_name = ?').bind(k).run();
    } else {
      await env.DB.prepare(
        'INSERT INTO warmup_shop_mode (shop_name, mode, updated_at, updated_by) VALUES (?, ?, ?, ?) ' +
        'ON CONFLICT(shop_name) DO UPDATE SET mode = excluded.mode, updated_at = excluded.updated_at, updated_by = excluded.updated_by'
      ).bind(k, mode, Date.now(), String(by || '')).run();
    }
    return true;
  } catch (e: any) {
    console.warn('[warmup-shop-mode] save failed:', e?.message || e);
    return false;
  }
}

/** 정해 둔 학원 전부(본사 화면용). 못 읽으면 null. */
export async function listShopModes(env: any): Promise<Array<{ shop_name: string; mode: ShopMode; updated_at: number | null; updated_by: string | null }> | null> {
  try {
    if (!(await ensureShopModeTable(env))) return null;
    const r: any = await env.DB.prepare('SELECT shop_name, mode, updated_at, updated_by FROM warmup_shop_mode ORDER BY shop_name').all();
    return ((r && r.results) || []).filter((x: any) => isShopMode(x.mode));
  } catch (e: any) {
    console.warn('[warmup-shop-mode] list failed:', e?.message || e);
    return null;
  }
}
