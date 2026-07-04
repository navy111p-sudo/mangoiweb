/**
 * scope.ts — 대리점 데이터 격리 공용 모듈 (2026-06-09)
 *
 *  로그인 계정(admin_scope)에 따라 학생·매출을 hq|branch|agency 로 격리한다.
 *   - agency : 자기 대리점(shop_name)만
 *   - branch : 자기 지역(franchise LIKE '지역%') 산하 대리점 전체
 *   - hq     : 전체
 *   - none   : 권한 없음(빈 결과)
 *  본사(hq)는 ?as=agency:<shop> / branch:<지역> / hq 로 특정 대리점 드릴다운 가능.
 */
import { checkAdminSession } from './auth-admin';

export type Scope = { type: 'hq' | 'branch' | 'agency' | 'none' | 'franchise'; value: string | null; label: string };
interface ScopeEnv { DB: D1Database; }

async function s_safe<T>(fn: () => Promise<T>, fb: T): Promise<T> { try { return await fn(); } catch { return fb; } }

// franchise(지사본사) 소유 지사 목록 — admin_scope.scope_value 에 콤마구분으로 저장
export function franchiseList(value: string | null): string[] {
  return String(value || '').split(',').map(s => s.trim()).filter(Boolean);
}

export function scopeLabel(type: string, value: string | null): string {
  if (type === 'hq') return '본사 (전체)';
  if (type === 'franchise') { const n = franchiseList(value).length; return n ? `지사본사 (${n}개 지사)` : '지사본사'; }
  if (type === 'branch') return `${value} 지사`;
  if (type === 'agency') return String(value || '대리점');
  return '권한 없음';
}

// students_erp 기준 필터 조건
export function stuCond(scope: Scope): { clause: string; binds: any[] } {
  if (scope.type === 'agency') return { clause: `shop_name = ?`, binds: [scope.value] };
  if (scope.type === 'branch') return { clause: `franchise LIKE ?`, binds: [scope.value + '%'] };
  if (scope.type === 'franchise') {
    const list = franchiseList(scope.value);
    if (!list.length) return { clause: '1=0', binds: [] };
    return { clause: `franchise IN (${list.map(() => '?').join(',')})`, binds: list };
  }
  // 'none'(내부직원·교사) = 제한 없음 — agency/branch/franchise만 격리
  return { clause: '', binds: [] };
}

// student_payments(매출) 필터용 ' AND user_id IN (...)' 조각. hq면 빈 조각.
export function paymentScopeSql(scope?: Scope): { sql: string; binds: any[] } {
  if (scope && (scope.type === 'agency' || scope.type === 'branch' || scope.type === 'franchise')) {
    const c = stuCond(scope);
    if (c.clause) return { sql: ` AND user_id IN (SELECT user_id FROM students_erp WHERE ${c.clause})`, binds: c.binds };
  }
  return { sql: '', binds: [] };
}

// 비용(지출)은 본사만. 대리점/지사면 false.
export function expenseVisible(scope?: Scope): boolean {
  return !scope || (scope.type !== 'agency' && scope.type !== 'branch');
}

async function ensureScope(env: ScopeEnv): Promise<void> {
  await s_safe(async () => { await env.DB.exec(`CREATE TABLE IF NOT EXISTS admin_scope (username TEXT PRIMARY KEY, scope_type TEXT NOT NULL, scope_value TEXT, updated_at INTEGER);`); return true; }, false);
}

async function autoSeedOne(env: ScopeEnv, username: string): Promise<Scope> {
  const acc = await s_safe(async () => await env.DB.prepare(`SELECT name FROM admin_account WHERE username=? LIMIT 1`).bind(username).first<{ name: string }>(), null as any);
  const name = acc?.name || '';
  let type = 'none', value: string | null = null;
  if (/^capi/.test(username) || /지사본사/.test(name)) {
    // 지사본사(franchise) — 소유 지사 미지정 시 기본값으로 전체 지사 부여(관리자가 admin_scope에서 조정)
    type = 'franchise';
    const fr = await s_safe(async () => (await env.DB.prepare(`SELECT DISTINCT franchise FROM students_erp WHERE franchise IS NOT NULL AND franchise<>''`).all()).results as any[], []);
    value = fr.map((r: any) => r.franchise).join(',') || null;
  }
  else if (username === 'admin' || /본사/.test(name)) { type = 'hq'; }
  else if (/지사/.test(name)) { type = 'branch'; value = name.replace('지사', '').trim().split(/\s+/)[0] || null; }
  else if (/대리점/.test(name)) {
    type = 'agency';
    const core = name.replace('대리점', '').trim();
    const shop = await s_safe(async () => await env.DB.prepare(`SELECT shop_name FROM students_erp WHERE shop_name LIKE ? LIMIT 1`).bind('%' + core + '%').first<{ shop_name: string }>(), null as any);
    value = shop?.shop_name || ('망고아이 ' + core + ' 대리점');
  }
  await s_safe(async () => { await env.DB.prepare(`INSERT OR IGNORE INTO admin_scope (username, scope_type, scope_value, updated_at) VALUES (?,?,?,?)`).bind(username, type, value, Date.now()).run(); return true; }, false);
  return { type: type as any, value, label: scopeLabel(type, value) };
}

export async function getScope(env: ScopeEnv, request: Request): Promise<Scope> {
  await ensureScope(env);
  const sess = await s_safe(async () => await checkAdminSession(request, env as any), { ok: false } as any);
  if (!sess?.ok || !sess.username) return { type: 'none', value: null, label: scopeLabel('none', null) };

  const row = await s_safe(async () => await env.DB.prepare(`SELECT scope_type, scope_value FROM admin_scope WHERE username=? LIMIT 1`).bind(sess.username).first<{ scope_type: string; scope_value: string | null }>(), null as any);
  const base: Scope = row ? { type: row.scope_type as any, value: row.scope_value, label: scopeLabel(row.scope_type, row.scope_value) }
                          : await autoSeedOne(env, sess.username);

  if (base.type === 'hq') {
    const as = new URL(request.url).searchParams.get('as');
    if (as) {
      const [t, ...rest] = as.split(':');
      const v = rest.join(':') || null;
      if (t === 'hq') return { type: 'hq', value: null, label: scopeLabel('hq', null) };
      if (t === 'agency' && v) return { type: 'agency', value: v, label: scopeLabel('agency', v) };
      if (t === 'branch' && v) return { type: 'branch', value: v, label: scopeLabel('branch', v) };
    }
  }
  return base;
}

// ── students_erp WHERE 조건(별칭 지원). hq→빈문자, none→1=0 ──
export function scopeStudentCond(scope: Scope, alias = ''): { cond: string; binds: any[] } {
  const a = alias ? alias + '.' : '';
  if (scope.type === 'agency') return { cond: `${a}shop_name = ?`, binds: [scope.value] };
  if (scope.type === 'branch') return { cond: `${a}franchise LIKE ?`, binds: [scope.value + '%'] };
  if (scope.type === 'franchise') {
    const list = franchiseList(scope.value);
    if (!list.length) return { cond: '1=0', binds: [] };
    return { cond: `${a}franchise IN (${list.map(() => '?').join(',')})`, binds: list };
  }
  // 'none'(내부직원·교사) = 제한 없음 — agency/branch/franchise만 격리
  return { cond: '', binds: [] };
}

// ── stats 류 ' AND ...' 조각 (세션 강제) ──
export async function scopeFragments(env: ScopeEnv, request: Request): Promise<{ uidScope: string; erpScope: string; binds: any[]; scope: Scope }> {
  const scope = await getScope(env, request);
  const c = scopeStudentCond(scope);
  const uidScope = c.cond ? ` AND user_id IN (SELECT user_id FROM students_erp WHERE ${c.cond})` : '';
  const erpScope = c.cond ? ` AND ${c.cond}` : '';
  return { uidScope, erpScope, binds: c.binds, scope };
}

// ── 학생목록 WHERE-list 조건 (세션 강제, 별칭 지원) ──
export async function studentScopeWhere(env: ScopeEnv, request: Request, alias = ''): Promise<{ cond: string; binds: any[]; scope: Scope }> {
  const scope = await getScope(env, request);
  const c = scopeStudentCond(scope, alias);
  return { cond: c.cond, binds: c.binds, scope };
}
