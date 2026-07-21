/**
 * api-capitown.ts — 캐피타운 프랜차이즈 정산 데이터 API (2026-07-22)
 *
 * 배경
 *   capitown-settlement.html 이 정산표(학원명·담당자 실명·매출)를 HTML 에 하드코딩해
 *   ① 로그인 없이 소스보기만으로 노출됐고 ② 열람자 구분 없이 전원이 전체 표를 봤다.
 *   → 데이터를 D1(capitown_agencies)로 옮기고, 이 API 가 로그인 계정별로 필터해 내려준다.
 *
 * 접근 등급 (사장님 결정 2026-07-22: 캐피타운 정산 = 경영진 + 캐피타운 계열 전용)
 *   - 본사 경영진(admin·hq_exec·exec)      → 전체
 *   - 캐피타운 본사(capitown)               → 전체
 *   - 캐피타운 지사(capi_* + admin_scope.scope_value='캐피 XX') → 자기 지사 소속 대리점만
 *   - 그 외(관리자·강사·타 지사·대리점)      → 403
 *
 * 라우트: GET /api/admin/capitown/agencies
 *   응답 { ok, scope: 'all'|'<지사명>', agencies: [{id,name,login_id,manager,branch,status,type,margin,students,online,book}] }
 *
 * ⚠️ index.ts 등록 3곳 필수: 라우터 마운트 + isAdminPath(페이지) + isAgencyAllowedPage/Api.
 */

import { checkAdminSession } from './auth-admin';

interface Env { DB: D1Database; }

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

// 기존 페이지 내장 표(2026년 1~6월 검증 정산표) 그대로 이관 — 실데이터 연동 전까지의 정본.
// students/online/book 은 월별 변동 계산의 base 값(페이지 calcMonth 가 동일 공식으로 산출).
const SEED: Array<[number, string, string, string, string, string, string, number, number, number, number]> = [
  // [id, name, login_id, manager, branch, status, type, margin, students, online, book]
  [44, '강남캐피타운학원', 'jsatc',   '윤은아', '캐피 강남', '사용',   '직영', 0.00,  30, 12500000, 526474],
  [43, '전주 JNK',        'kqyt02',  '이소현', '캐피 전북', '사용',   '가맹', 0.53,  22, 8200000,  552314],
  [42, 'UBCK어학원',      'ubckt00', '김수희', '캐피 충북', '사용',   '가맹', 0.105, 20, 8000000,  394353],
  [41, '랭클어학원',      'lnct00',  '신수연', '캐피 부천', '사용',   '가맹', 0.387, 18, 7000000,  474923],
  [40, '앤해피잉글리쉬',  'aht00',   '부예슬', '캐피 강서', '사용',   '가맹', 0.387, 17, 6800000,  354361],
  [39, '다온캐피타운',    'bnmt00',  '강순정', '캐피 강서', '사용',   '가맹', 0.40,  14, 5000000,  230989],
  [31, '예티어학원',      'yeti00',  '한지민', '캐피 충북', '사용',   '가맹', 0.40,  12, 5300000,  300000],
  [22, '서울 두드림',     'ddr00',   '오세훈', '캐피 강서', '사용',   '가맹', 0.35,  4,  1200000,  80000],
  [15, 'N SYPO어학원',    'sypo00',  '정유진', '캐피 대구', '사용',   '가맹', 0.38,  5,  1500000,  100000],
  [9,  '탑키즈영어학원',  'topk00',  '문가영', '캐피 제주', '사용',   '가맹', 0.36,  2,  700000,   50000],
  [7,  '은여울캐피타운',  'eyu00',   '배수지', '캐피 강서', '미사용', '가맹', 0.40,  0,  0,        0],
  [5,  '위즈쿡 캐피타운', 'wzc00',   '손나은', '캐피 고양', '미사용', '가맹', 0.40,  0,  0,        0],
  [3,  '큰숲캐츠학원',    'ksf00',   '김태리', '캐피 충북', '해지',   '가맹', 0.40,  0,  0,        0],
  [2,  '잉글리쉬고고',    'eg00',    '박소담', '캐피 대전', '해지',   '가맹', 0.40,  0,  0,        0],
];

async function ensureTable(env: Env): Promise<void> {
  await env.DB.exec(
    `CREATE TABLE IF NOT EXISTS capitown_agencies (id INTEGER PRIMARY KEY, name TEXT NOT NULL, login_id TEXT, manager TEXT, branch TEXT NOT NULL, status TEXT NOT NULL DEFAULT '사용', type TEXT NOT NULL DEFAULT '가맹', margin REAL NOT NULL DEFAULT 0.4, students INTEGER NOT NULL DEFAULT 0, online INTEGER NOT NULL DEFAULT 0, book INTEGER NOT NULL DEFAULT 0, updated_at INTEGER);`
  );
  const cnt = await env.DB.prepare(`SELECT COUNT(*) AS n FROM capitown_agencies`).first<{ n: number }>();
  if ((cnt?.n || 0) > 0) return;
  const now = Date.now();
  for (const r of SEED) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO capitown_agencies (id,name,login_id,manager,branch,status,type,margin,students,online,book,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(...r, now).run();
  }
}

export async function capitownRouter(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  const sess = await checkAdminSession(request, env as any);
  if (!sess.ok || !sess.username) return json({ ok: false, error: 'auth_required' }, 401);
  const me = String(sess.username).toLowerCase();

  // ── 열람 범위 판정 ──
  //   branchFilter=null → 전체(경영진·캐피타운 본사), '캐피 XX' → 그 지사만, 판정 불가 → 403.
  let branchFilter: string | null = null;
  const isExec = me === 'admin' || me === 'hq_exec' || me === 'exec';
  if (!isExec && me !== 'capitown') {
    if (!me.startsWith('capi')) return json({ ok: false, error: 'forbidden', message: '캐피타운 정산은 본사 경영진과 캐피타운 계열 계정만 열람할 수 있습니다.' }, 403);
    // 지사 계정 — admin_scope 의 지사명('캐피 강남' 등)으로 자기 것만.
    const sc = await env.DB.prepare(
      `SELECT scope_value FROM admin_scope WHERE username = ? LIMIT 1`
    ).bind(sess.username).first<{ scope_value: string | null }>();
    const v = String(sc?.scope_value || '').trim();
    if (!v) return json({ ok: false, error: 'no_scope', message: '이 계정에 지사 범위가 지정되어 있지 않습니다. 본사 관리자에게 문의하세요.' }, 403);
    branchFilter = v;
  }

  if (path === '/api/admin/capitown/agencies' && request.method === 'GET') {
    await ensureTable(env);
    const q = branchFilter
      ? env.DB.prepare(`SELECT id,name,login_id,manager,branch,status,type,margin,students,online,book FROM capitown_agencies WHERE branch = ? ORDER BY id DESC`).bind(branchFilter)
      : env.DB.prepare(`SELECT id,name,login_id,manager,branch,status,type,margin,students,online,book FROM capitown_agencies ORDER BY id DESC`);
    const rows = await q.all();
    return json({ ok: true, scope: branchFilter || 'all', agencies: rows.results || [] });
  }

  return json({ ok: false, error: 'not_found' }, 404);
}
