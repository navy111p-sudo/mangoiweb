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
import { franchiseInClause } from './d1-chunk';   // 🔒 지사 목록 IN 조각 (D1 바인드 한도 처리 포함)
export { franchiseInClause };

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
  // 🧑‍🏫 (2026-07-27) 옛 LMS 에서 넘어온 강사 계정 — 학생 데이터 범위는 'none'(내부직원)과
  //   같지만, 역할이 '강사'로 못박히도록 별도 타입을 쓴다(auth-admin resolveRole 참조).
  if (type === 'teacher') return '강사';
  return '권한 없음';
}

// students_erp 기준 필터 조건
export function stuCond(scope: Scope): { clause: string; binds: any[] } {
  if (scope.type === 'agency') return { clause: `shop_name = ?`, binds: [scope.value] };
  if (scope.type === 'branch') return { clause: `franchise LIKE ?`, binds: [scope.value + '%'] };
  if (scope.type === 'franchise') return franchiseInClause(franchiseList(scope.value));
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

// 비용(지출)은 본사만. 대리점(agency)·지사(branch)·지사본사(franchise)는 볼 수 없음(false).
export function expenseVisible(scope?: Scope): boolean {
  return !scope || (scope.type !== 'agency' && scope.type !== 'branch' && scope.type !== 'franchise');
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

/* 세션이 없을 때 무엇으로 볼 것인가.
 *   'none' (기본) — 권한 없음. 바깥에서 들어오는 모든 요청은 이쪽이어야 한다.
 *   'hq'          — 본사 전체. **내부 cron 호출 전용**이다.
 *                   경영요약 브리핑(index.ts 가 세션 없는 가짜 Request 를 만들어 부른다)이
 *                   이걸 쓴다. 바깥 요청은 index.ts 의 관리자 인증 게이트가 먼저 401 로
 *                   막으므로 노출되지 않는다(2026-08-07 라이브 401 확인).
 *                   ⚠️ 새 라우트에 'hq' 를 붙일 땐 그 경로가 게이트 뒤인지 반드시 확인할 것. */
export interface GetScopeOpts {
  noSessionScope?: 'none' | 'hq';
  /* 🔒 (2026-09-11) ?as= 드릴다운을 건너뛰고 «로그인 계정 원래 스코프» 만 돌려준다.
     지사(branch) 계정이 ?as=agency:<산하 대리점> 으로 agency 스코프로 «승격» 되는 것은
     화면 조회(대리점별 현황 드릴다운)에는 맞지만, «지사가 학원 대신 결제 주문을 만드는»
     것처럼 승격된 스코프로 쓰기 권한까지 얻으면 안 되는 자리가 있다(ai-billing.ts
     invoice/checkout — 사장님 결정 2026-09-11: 지사는 결제 여부를 볼 수는 있어도 결제
     요청은 만들 수 없다). 그런 자리는 이 옵션으로 «원래 계정이 무엇인가» 를 한 번 더
     물어서 판정한다 — 조회용 scope 변수를 이걸로 바꿔치기하지 말 것(그러면 드릴다운
     조회 자체가 막힌다). */
  noDrillDown?: boolean;
}

export async function getScope(env: ScopeEnv, request: Request, opts: GetScopeOpts = {}): Promise<Scope> {
  await ensureScope(env);
  const sess = await s_safe(async () => await checkAdminSession(request, env as any), { ok: false } as any);
  if (!sess?.ok || !sess.username) {
    const t = opts.noSessionScope === 'hq' ? 'hq' : 'none';
    return { type: t, value: null, label: scopeLabel(t, null) };
  }

  const row = await s_safe(async () => await env.DB.prepare(`SELECT scope_type, scope_value FROM admin_scope WHERE username=? LIMIT 1`).bind(sess.username).first<{ scope_type: string; scope_value: string | null }>(), null as any);
  const base: Scope = row ? { type: row.scope_type as any, value: row.scope_value, label: scopeLabel(row.scope_type, row.scope_value) }
                          : await autoSeedOne(env, sess.username);

  if (opts.noDrillDown) return base;

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
  // 🏬 (2026-07-19) 지사 드릴다운 — 지사도 ?as=agency:<shop_name> 으로 대리점 상세를 볼 수 있다.
  //   단, **그 대리점이 이 지사 산하인지 DB 로 검증**한 뒤에만 허용(다른 지사 대리점은 조용히 무시하고
  //   자기 지사 스코프 유지 — 권한 상승 불가). 지사 대시보드 '대리점별 현황' 카드 클릭 이동에 사용.
  if (base.type === 'branch' && base.value) {
    const as = new URL(request.url).searchParams.get('as');
    if (as && as.startsWith('agency:')) {
      const v = as.slice('agency:'.length);
      if (v) {
        const own = await s_safe(async () => await env.DB.prepare(
          `SELECT 1 ok FROM students_erp WHERE shop_name = ? AND franchise LIKE ? LIMIT 1`
        ).bind(v, base.value + '%').first<{ ok: number }>(), null as any);
        if (own) return { type: 'agency', value: v, label: scopeLabel('agency', v) };
      }
    }
  }
  return base;
}

/* ══ 🏢 조직 명부(지사·대리점) 스코프 — 2026-08-18 수정요청 #03·#04 ══════════════
   왜 여기 있나 —
     조직 관리 화면은 그동안 «본사+지사» 등급이라 대리점(학원장)에게는 카드째 안 보였고,
     지사장이 열어도 /api/admin/franchises·centers 가 지사 허용목록에 없어 403 → 빈 표였다.
     사장님이 「영업사원·지사장·학원장이 보기 쉽게」 하라고 하신 화면이 정작 그 셋 중
     둘에게 닫혀 있었던 것이다. 그래서 그 두 API 를 **스코프를 걸어서** 연다.

   위의 stuCond/scopeStudentCond 는 students_erp(학생 명부) 기준이다. 조직 명부는
   franchises.name / centers.franchise_id 를 봐야 해서 조건이 다르다 — 그래서 따로 둔다.

   ⚠️ 바인드를 «목록» 으로 만들지 않는다. 지사본사(franchise)는 소유 지사가 241개까지
      갈 수 있어 `IN (?,?,…)` 로 펴면 D1 바인드 100개 한도를 넘긴다(CLAUDE.md 함정표).
      콤마로 이어 붙인 문자열 하나를 그대로 넘겨 SQL 안에서 맞춘다 — 바인드는 항상 1개다.
   ⚠️ 값이 비면 **막는 쪽**으로 간다(1 = 0). LIKE '%' 로 새면 전국이 그대로 열린다. */
export function scopeFranchiseCond(scope: Scope, alias = ''): { cond: string; binds: any[] } {
  const a = alias ? alias + '.' : '';
  if (scope.type === 'branch') {
    if (!scope.value) return { cond: '1 = 0', binds: [] };
    return { cond: `${a}name LIKE ?`, binds: [String(scope.value) + '%'] };
  }
  if (scope.type === 'franchise') {
    const names = franchiseList(scope.value);
    if (!names.length) return { cond: '1 = 0', binds: [] };
    // ',서울지사,노원지사,' 안에 ',<이름>,' 가 들어 있는가 — 부분일치(«노원»이 «노원구지사»에
    // 걸리는 것)를 막으려고 양쪽에 쉼표를 붙인다.
    return { cond: `',' || ? || ',' LIKE '%,' || ${a}name || ',%'`, binds: [names.join(',')] };
  }
  if (scope.type === 'agency') {
    if (!scope.value) return { cond: '1 = 0', binds: [] };
    return { cond: `${a}id IN (SELECT franchise_id FROM centers WHERE name = ?)`, binds: [scope.value] };
  }
  return { cond: '', binds: [] };     // hq · none(본사 내부직원) = 제한 없음
}

/** 🏪 대리점(centers) 쪽 같은 조건. 대리점 계정은 «자기 한 칸», 지사는 «자기 지사 소속 전부». */
export function scopeCenterCond(scope: Scope, alias = ''): { cond: string; binds: any[] } {
  const a = alias ? alias + '.' : '';
  if (scope.type === 'agency') {
    if (!scope.value) return { cond: '1 = 0', binds: [] };
    return { cond: `${a}name = ?`, binds: [scope.value] };
  }
  const f = scopeFranchiseCond(scope);
  if (!f.cond) return { cond: '', binds: [] };
  return { cond: `${a}franchise_id IN (SELECT id FROM franchises WHERE ${f.cond})`, binds: f.binds };
}

/** 조직 명부를 «고칠» 수 있는가 — 등록·수정·대표지사 지정은 본사만. */
export function canEditOrg(scope: Scope): boolean {
  return scope.type === 'hq' || scope.type === 'none';
}

// ── students_erp WHERE 조건(별칭 지원). hq→빈문자, none→1=0 ──
export function scopeStudentCond(scope: Scope, alias = ''): { cond: string; binds: any[] } {
  const a = alias ? alias + '.' : '';
  if (scope.type === 'agency') return { cond: `${a}shop_name = ?`, binds: [scope.value] };
  if (scope.type === 'branch') return { cond: `${a}franchise LIKE ?`, binds: [scope.value + '%'] };
  if (scope.type === 'franchise') {
    const c = franchiseInClause(franchiseList(scope.value), a);
    return { cond: c.clause, binds: c.binds };
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
