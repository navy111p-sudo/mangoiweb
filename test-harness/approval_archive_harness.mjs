/*
 * 🗂 결재 보관함(시안 A) 하니스 — 함 옆 «건수» 가 오른쪽 «표» 와 같은 말을 하는가 (2026-09-08)
 *
 *   사장님 「내가 결재한 것·남이 결재한 것을 다 볼 수 있는 곳이 어디냐」 →
 *   「보관함 카드를 열면 전체·기간별·결재자별·종류별을 한 번에」 → 시안 A(함 + 표).
 *
 *   [무엇이 틀릴 수 있나 — 그리고 왜 문자열 검사로는 못 보나]
 *     함 옆 숫자는 SQL 집계인데 오른쪽 표는 canView 로 한 번 더 거른다. 두 판정이 어긋나면
 *     「전체 결재 24」라고 써 놓고 표에는 21건만 나온다 — 에러는 안 나고 숫자만 거짓이 된다.
 *     그래서 ②절은 세 등급(경영진·본사 직원·필리핀 매니저)마다 **SQL 이 준 행 집합과
 *     canView 가 참인 행 집합이 같은가** 를 진짜 SQLite 에서 실제로 대조한다.
 *
 *   [정본을 실제로 돌린다]
 *     archivePeriods · archiveVisibleCond · buildArchiveFacets 를 import 해 node:sqlite 에 물린다.
 *     라우트·화면은 «배선» 만 문자열로 본다(정본을 부르는가 · 게이트가 있는가).
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dir, '../cloudflare-deploy/src');
const PUB = resolve(__dir, '../cloudflare-deploy/public');
const P = await import(pathToFileURL(join(SRC, 'approval-policy.ts')).href);
const { archivePeriods, archiveVisibleCond, buildArchiveFacets, canView, buildFindQuery, TYPES, DECIDED_BY_SQL } = P;
const api  = readFileSync(join(SRC, 'api-approval.ts'), 'utf8');
const work = readFileSync(join(PUB, 'work.html'), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond, extra) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name + (extra ? ` — ${extra}` : '')); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${cond ? '' : (extra ? ` — ${extra}` : '')}`);
}
const sec = (t) => console.log('\n' + t);
const same = (a, b) => a.length === b.length && a.every((x) => b.indexOf(x) >= 0);

let DatabaseSync;
try { ({ DatabaseSync } = await import('node:sqlite')); }
catch { console.log('⏭  node:sqlite 없음 — 이 검사는 SQL 을 실제로 돌려야 뜻이 있습니다.'); process.exit(0); }

console.log('════════ 🗂 결재 보관함 하니스 ════════');

/* ══ ① 기간 함의 경계 ═════════════════════════════════════════════════════ */
sec('[①] 기간 함 — 이번 달 · 지난 달 · 이번 분기 · 올해 (KST 날짜)');
{
  const p = archivePeriods('2026-09-08');
  check('이번 달 = 9/1 ~ 9/30', p.month.from === '2026-09-01' && p.month.to === '2026-09-30', JSON.stringify(p.month));
  check('지난 달 = 8/1 ~ 8/31', p.last_month.from === '2026-08-01' && p.last_month.to === '2026-08-31');
  check('이번 분기 = 7/1 ~ 9/30', p.quarter.from === '2026-07-01' && p.quarter.to === '2026-09-30', JSON.stringify(p.quarter));
  check('올해 = 1/1 ~ 12/31', p.year.from === '2026-01-01' && p.year.to === '2026-12-31');
  const j = archivePeriods('2026-01-15');
  check('1월의 지난 달은 «작년 12월» (해가 넘어간다)', j.last_month.from === '2025-12-01' && j.last_month.to === '2025-12-31', JSON.stringify(j.last_month));
  check('1월의 분기는 1/1 ~ 3/31', j.quarter.from === '2026-01-01' && j.quarter.to === '2026-03-31');
  const f = archivePeriods('2028-02-10');
  check('윤년 2월은 29일까지', f.month.to === '2028-02-29', f.month.to);
  const bad = archivePeriods('어제');
  check('날짜 모양이 아니면 던지지 않는다 (화면이 통째로 죽지 않게)', !!bad && !!bad.month);
}

/* ══ ② 범위 조건 == canView ═══════════════════════════════════════════════ */
sec('[②] 🔴 함 옆 건수의 범위(SQL) 가 표의 열람 판정(canView) 과 같은 집합인가 — 세 등급 전부');
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE approval_requests (
  id INTEGER PRIMARY KEY, req_type TEXT, requester_username TEXT, status TEXT, created_at INTEGER)`);
db.exec(`CREATE TABLE approval_steps (
  id INTEGER PRIMARY KEY, request_id INTEGER, seq INTEGER, role TEXT, status TEXT, decided_by TEXT, decided_at INTEGER)`);
const KST = (d) => Date.parse(d + 'T00:00:00+09:00') + 12 * 3600_000;
const ROWS = [
  // id, 종류,      올린 사람,    상태,       올린 날
  [1, 'expense',  'mgr_karl',  'approved', '2026-09-03'],
  [2, 'hr',       'admin',     'approved', '2026-08-28'],   // 인사·급여 — 경영진만
  [3, 'expense',  'admin',     'approved', '2026-08-20'],
  [4, 'doc',      'mgr_melca', 'approved', '2026-09-07'],   // 필리핀 매니저가 올림
  [5, 'purchase', 'mgr_melca', 'pending',  '2026-09-08'],   // 아무도 안 찍음
  [6, 'urgent',   'mgr_lby',   'approved', '2026-07-15'],   // 긴급 — 전원이 본다
  [7, 'hr',       'mgr_karl',  'approved', '2026-06-30'],   // Karl 이 올린 인사 건 — 본인은 본다
  [8, 'expense',  'admin',     'rejected', '2026-09-01'],
  [9, 'expense',  'mgr_lby',   'approved', '2026-09-05'],   // 전결 — 2단계가 «건너뜀» 으로 남는다
];
const STEPS = [
  // request, seq, role,   status,     decided_by
  [1, 1, 'staff', 'approved', 'mgr_lby'],
  [2, 1, 'exec',  'approved', 'admin'],
  [3, 1, 'staff', 'approved', 'mgr_karl'],
  [4, 1, 'staff', 'approved', 'mgr_karl'],
  [5, 1, 'staff', 'active',   null],
  [6, 1, 'any',   'approved', 'mgr_melca'],   // 필리핀 매니저가 닫은 긴급
  [7, 1, 'exec',  'approved', 'admin'],
  [7, 2, 'exec',  'skipped',  'admin'],       // 전결로 건너뛴 단계 — decided_by 가 있어도 «도장» 이 아니다
  [8, 1, 'staff', 'rejected', 'mgr_jjw'],
  [9, 1, 'staff', 'approved', 'admin'],
  [9, 2, 'exec',  'skipped',  'mgr_jjw'],    // 🔴 유일한 «mgr_jjw 흔적» 이 건너뜀 — 결재한 것으로 세면 안 된다
];
const insR = db.prepare('INSERT INTO approval_requests VALUES (?,?,?,?,?)');
for (const r of ROWS) insR.run(r[0], r[1], r[2], r[3], KST(r[4]));
const insS = db.prepare('INSERT INTO approval_steps (request_id, seq, role, status, decided_by, decided_at) VALUES (?,?,?,?,?,1)');
for (const s of STEPS) insS.run(...s);

/** 라우트의 chainUsers 와 같은 계산 — decided_by 가 있는 단계의 계정 전부 */
const chainOf = (id) => STEPS.filter((s) => s[0] === id && s[4]).map((s) => s[4]);
/* ⚠️ exec 플래그를 손으로 적지 않는다 — 라우트도 isExec(actor) 로 넘긴다. 처음 이 검사를 쓸 때
   mgr_jjw 를 «본사 직원» 으로 적었다가 FAIL 이 났다: 정본 EXEC_USERNAMES 에 이미 들어 있었다. */
const ACTORS = [
  { label: '경영진(admin)',              me: 'admin',     actor: { ok: true, username: 'admin',     role: 'hq' },    ph: false },
  { label: '경영진(mgr_jjw, staff 역할)', me: 'mgr_jjw',   actor: { ok: true, username: 'mgr_jjw',   role: 'staff' }, ph: false },
  { label: '본사 직원(mgr_karl)',        me: 'mgr_karl',  actor: { ok: true, username: 'mgr_karl',  role: 'hq' },    ph: false },
  { label: '본사 직원(mgr_lby, staff)',  me: 'mgr_lby',   actor: { ok: true, username: 'mgr_lby',   role: 'staff' }, ph: false },
  { label: '필리핀 매니저(mgr_melca)',   me: 'mgr_melca', actor: { ok: true, username: 'mgr_melca', role: 'hq' },    ph: true },
];
for (const A of ACTORS) A.exec = P.isExec(A.actor);
check('전제 — admin·mgr_jjw 는 정본에서 경영진이고 mgr_karl·mgr_lby 는 아니다',
  ACTORS[0].exec && ACTORS[1].exec && !ACTORS[2].exec && !ACTORS[3].exec, JSON.stringify(ACTORS.map((a) => a.exec)));
for (const A of ACTORS) {
  const vis = archiveVisibleCond(A.me, { exec: A.exec, ph: A.ph });
  const sql = 'SELECT id FROM approval_requests' + (vis.cond ? (' WHERE ' + vis.cond) : '') + ' ORDER BY id';
  const got = db.prepare(sql).all(...vis.binds).map((r) => Number(r.id));
  const want = ROWS.filter((r) => canView(A.actor, r[1], r[2], chainOf(r[0]), A.ph)).map((r) => r[0]);
  check(`${A.label} — SQL 집합 == canView 집합`, same(got, want), `sql=${JSON.stringify(got)} canView=${JSON.stringify(want)}`);
}
{
  // 짝 검사 — 등급이 정말 갈리는가(전부 같은 답이면 위 대조는 아무것도 안 잰다)
  const a = archiveVisibleCond('admin', { exec: true, ph: false });
  const k = archiveVisibleCond('mgr_karl', { exec: false, ph: false });
  const m = archiveVisibleCond('mgr_melca', { exec: false, ph: true });
  const n = (c) => db.prepare('SELECT COUNT(*) AS n FROM approval_requests' + (c.cond ? ' WHERE ' + c.cond : '')).get(...c.binds).n;
  check('경영진 9건 > 본사 직원 8건(남의 인사 1건 제외) > 필리핀 매니저 3건 (등급이 실제로 갈린다)',
    n(a) === 9 && n(k) === 8 && n(m) === 3, `${n(a)}/${n(k)}/${n(m)}`);
  check('본사 직원은 남의 인사·급여(2)는 못 보고 자기가 올린 인사 건(7)은 본다',
    (() => { const ids = db.prepare('SELECT id FROM approval_requests WHERE ' + k.cond).all(...k.binds).map((r) => r.id);
             return ids.indexOf(2) < 0 && ids.indexOf(7) >= 0; })());
  check('필리핀 매니저는 자기 것(4·5) + 자기가 닫은 긴급(6) 만',
    same(db.prepare('SELECT id FROM approval_requests WHERE ' + m.cond).all(...m.binds).map((r) => r.id), [4, 5, 6]));
}

/* ══ ③ 함 옆 건수 — 정본 SQL 을 실제로 돌린다 ═════════════════════════════ */
sec('[③] buildArchiveFacets — 진짜 SQLite 에서 센 값');
{
  const F = buildArchiveFacets({ me: 'admin', exec: true, ph: false, today: '2026-09-08' });
  const tot = db.prepare(F.totals.sql).get(...F.totals.binds);
  check('전체 9 · 내가 올린 것 3 · 내가 결재한 것 3 (경영진 admin — 2·7·9)',
    Number(tot.all_n) === 9 && Number(tot.mine_n) === 3 && Number(tot.decided_n) === 3, JSON.stringify(tot));
  /* 🔴 mgr_jjw 의 유일한 9번 흔적은 «건너뜀» — 결재한 것으로 세면 안 된다.
     (admin 은 7번에 도장+건너뜀이 함께 있어 EXISTS 로는 구별이 안 된다 — 그래서 이 행이 따로 필요했다.
      처음엔 이 행이 없어 «상태 조건 제거» 변이가 이 하니스를 그대로 통과했다.) */
  const JJ = buildArchiveFacets({ me: 'mgr_jjw', exec: true, ph: false, today: '2026-09-08' });
  const jj = db.prepare(JJ.totals.sql).get(...JJ.totals.binds);
  check('⛔ 건너뛴 단계(skipped)는 «결재한 것» 으로 안 센다 — mgr_jjw 는 8번 반려 1건뿐(9번 건너뜀은 제외)',
    Number(jj.decided_n) === 1, JSON.stringify(jj));
  const per = (k) => Number(db.prepare(F.periods[k].sql).get(...F.periods[k].binds).n);
  check('이번 달(9월) 5건 · 지난 달(8월) 2건 · 분기(7~9월) 8건 · 올해 9건',
    per('month') === 5 && per('last_month') === 2 && per('quarter') === 8 && per('year') === 9,
    `${per('month')}/${per('last_month')}/${per('quarter')}/${per('year')}`);
  const ty = db.prepare(F.types.sql).all(...F.types.binds);
  const tyMap = Object.fromEntries(ty.map((r) => [r.k, Number(r.n)]));
  check('종류별 — expense 4 · hr 2 · doc 1 · purchase 1 · urgent 1',
    tyMap.expense === 4 && tyMap.hr === 2 && tyMap.doc === 1 && tyMap.purchase === 1 && tyMap.urgent === 1, JSON.stringify(tyMap));
  const ap = db.prepare(F.approvers.sql).all(...F.approvers.binds);
  const apMap = Object.fromEntries(ap.map((r) => [r.u, Number(r.n)]));
  check('결재자별 — admin 3 · mgr_karl 2 · mgr_lby 1 · mgr_jjw 1(건너뜀 제외) · mgr_melca 1',
    apMap.admin === 3 && apMap.mgr_karl === 2 && apMap.mgr_lby === 1 && apMap.mgr_jjw === 1 && apMap.mgr_melca === 1, JSON.stringify(apMap));
  check('결재자별 목록은 많이 결재한 사람이 먼저 (ORDER BY n DESC)', ap.length >= 2 && Number(ap[0].n) >= Number(ap[1].n));

  // 본사 직원 기준 — 범위가 좁아지면 숫자도 함께 좁아져야 한다(전부 전체로 세면 여기서 걸린다)
  const K = buildArchiveFacets({ me: 'mgr_karl', exec: false, ph: false, today: '2026-09-08' });
  const kt = db.prepare(K.totals.sql).get(...K.totals.binds);
  check('본사 직원 mgr_karl — 전체 8(남의 인사 건 2번만 빠짐) · 내 것 2 · 내가 결재 2',
    Number(kt.all_n) === 8 && Number(kt.mine_n) === 2 && Number(kt.decided_n) === 2, JSON.stringify(kt));
  const kap = db.prepare(K.approvers.sql).all(...K.approvers.binds);
  /* admin 의 도장 3개(2·7·9) 중 mgr_karl 에게 보이는 것은 7(자기 인사 건)·9(남의 지출) — 2번(남의 인사)은 빠져 2 */
  check('본사 직원의 결재자별에는 남의 인사 건 도장(admin 의 2번)이 안 들어간다 — admin 3 → 2',
    Object.fromEntries(kap.map((r) => [r.u, Number(r.n)])).admin === 2, JSON.stringify(kap));
  // 바인드 순서 — SELECT 의 ? 가 WHERE 의 ? 보다 먼저. 순서가 틀리면 SQLite 는 에러 없이 엉뚱한 값을 준다.
  check('totals 바인드 — SELECT 절 me·me 가 먼저, 그 뒤 범위 조건', K.totals.binds[0] === 'mgr_karl' && K.totals.binds[1] === 'mgr_karl');
  check('D1 바인드 한도 — 어느 조각도 10개를 넘지 않는다',
    [F.totals, F.types, F.approvers, ...Object.values(F.periods)].every((p) => p.binds.length <= 10));
}

/* ══ ④ 찾기 조건과 함이 «같은 도장» 을 본다 ═══════════════════════════════ */
sec('[④] 「내가 결재한 것」 함의 건수와 그 함을 눌렀을 때의 목록이 같은 행인가');
{
  const F = buildArchiveFacets({ me: 'mgr_karl', exec: false, ph: false, today: '2026-09-08' });
  const n = Number(db.prepare(F.totals.sql).get(...F.totals.binds).decided_n);
  const q = buildFindQuery({ scope: 'decided', me: 'mgr_karl' });
  const rows = db.prepare('SELECT id FROM approval_requests' + q.cond).all(...q.binds).map((r) => r.id);
  check('mgr_karl — 함 옆 «내가 결재한 것 2» == 목록 2건 [3, 4]', n === rows.length && same(rows, [3, 4]), `${n} vs ${JSON.stringify(rows)}`);
  const by = buildFindQuery({ scope: 'all', me: 'admin', decidedBy: 'mgr_melca' });
  check('결재자별 함(mgr_melca) → 목록 [6]', same(db.prepare('SELECT id FROM approval_requests' + by.cond).all(...by.binds).map((r) => r.id), [6]));
  check('두 곳이 같은 SQL 조각(DECIDED_BY_SQL)을 쓴다 — 한쪽만 고치면 어긋난다',
    F.totals.sql.indexOf(DECIDED_BY_SQL) >= 0 && by.cond.indexOf(DECIDED_BY_SQL) >= 0);
}

/* ══ ⑤ 서버 배선 ══════════════════════════════════════════════════════════ */
sec('[⑤] 서버 — 라우트가 정본을 부르고 게이트가 있는가');
{
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  const a = strip(api);
  check('view=facets 를 받는다', /searchParams\.get\('view'\) === 'facets'/.test(a));
  check('함 옆 건수 SQL 은 정본(buildArchiveFacets)이 만든다 — 라우트에 GROUP BY 를 다시 적지 않았다',
    /buildArchiveFacets\(\{ me, exec, ph, today \}\)/.test(a));
  check('🔴 결재자별(decided_by)은 결재 권한자에게만 — all 과 같은 게이트에 묶여 있다',
    /\(scope === 'pending' \|\| scope === 'all' \|\| fBy\) && !approver/.test(a));
  check('decided_by 를 정본 조건 조립에 넘긴다 (decidedBy)', /decidedBy: fBy/.test(a));
  check('「전체」 건수는 결재 권한자에게만 준다 (직원의 all 은 «내가 볼 수 있는 것» 이라 이름이 거짓)',
    /all:\s*\(approver && tot\)/.test(a));
  check('결재자별 목록도 결재 권한자에게만 (직원에게는 결재자 명부가 될 뿐)',
    /if \(approver\) \{[\s\S]{0,400}F\.approvers/.test(a));
  check('기간 함 경계를 서버가 함께 내려준다 (화면이 달을 따로 계산하지 않게)',
    /archivePeriods\(today\)/.test(a) && /from: bounds\[k\]\.from, to: bounds\[k\]\.to/.test(a));
  check('못 읽은 칸은 null + unknown — «0건» 으로 적지 않는다', /unknown = true/.test(a) && /n: r \? Number\(r\.n \|\| 0\) : null/.test(a));
  // 보관함 카드
  check('맨 위 요약에 archive 가 실린다', /archive: homeArchive/.test(a));
  check('🔴 마지막 결재는 approval_requests.decided_by 가 아니라 approval_steps 의 도장으로 본다 (회수는 «결재» 가 아니다)',
    /FROM approval_steps s JOIN approval_requests r ON r\.id = s\.request_id\s+WHERE s\.decided_at IS NOT NULL AND s\.status IN \('approved','rejected'\)/.test(a));
  check('보관함 카드 범위가 금액 타일과 같다 (sumAll 로 가른다)',
    /const yearFrom = nowMonth\.slice\(0, 4\) \+ '-01-01'[\s\S]{0,400}\(sumAll \? '' : ' AND requester_username = \?'\)/.test(a));
  check('못 읽었으면 year_count 가 null (unknown)', /year_count: archRow \? Number\(archRow\.n \|\| 0\) : null/.test(a));
  check('응답 모양이 바뀌었으니 홈 ETag 판을 올렸다 (a9 이상)', /W\/"a(9|\d\d)-/.test(a));
}

/* ══ ⑥ 화면 배선 ══════════════════════════════════════════════════════════ */
sec('[⑥] 화면 — 다섯째 카드와 함 트리');
{
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  const w = strip(work);
  check('다섯째 타일 「결재 보관함」이 있고 topArchive 로 연다', /tile\('arch', T\('Archive', '결재 보관함'\)[\s\S]{0,80}'topArchive\(\)'\)/.test(w));
  check('타일이 «어느 범위인지»(전체/내가 올린 것)를 함께 적는다', /arScope = \(sm\.money_scope === 'all'\)/.test(w));
  check('못 읽었으면 «—» (0건이 아니다)', /\(ar\.year_count == null\) \? '—'/.test(w));
  // 인라인 onclick 이 부르는 이름은 window 최상위에 있어야 한다
  for (const fn of ['topArchive', 'fbPick', 'fbScopeChanged']) {
    check(`window.${fn} 이 최상위에 있다 (인라인 onclick 은 전역에서 이름을 찾는다)`, new RegExp('^window\\.' + fn + ' = function', 'm').test(w));
  }
  check('함 트리 자리(#findBox)가 문서함 패널 안에 있다', /<nav id="findBox" class="findbox"/.test(work));
  check('함 네 묶음 — 전체 · 기간별 · 결재자별 · 종류별',
    /T\('All', '전체'\)/.test(w) && /T\('By period', '기간별'\)/.test(w) && /T\('By approver', '결재자별'\)/.test(w) && /T\('By kind', '종류별'\)/.test(w));
  check('「내가 결재한 것」이 함에도, 고르기 칸에도 있다',
    /fbPick\(\\'scope\\',\\'decided\\'\)/.test(w) && /\['decided',\s+T\('Decided by me',\s+'내가 결재한 것'\)\]/.test(w));
  check('결재자 함은 decided_by 파라미터로 나간다', /p\.push\('decided_by=' \+ encodeURIComponent\(FIND_BY\)\)/.test(w));
  check('기간 함의 날짜는 서버가 준 경계(FACETS.periods)를 쓴다 — 화면이 달을 계산하지 않는다',
    /FACETS\.periods\[val\]/.test(w) && !/getMonth\(\)\s*\+\s*1\)\.padStart/.test(w.slice(w.indexOf('function paintFindBox'), w.indexOf('window.topArchive'))));
  check('함 옆 건수가 null 이면 «—»', /var n = function\(v\)\{ return \(v == null\) \? '—'/.test(w));
  check('결재자별 묶음은 결재 권한자(can_approve)에게만 그린다', /if \(canAll && \(!f \|\| aps\.length\)\)/.test(w));
  check('함을 눌러도 다른 축은 그대로 — 지우기는 따로(«함 조건 지우기»)', /fbPick\(\\'clear\\'\)/.test(w) && /kind === 'clear'/.test(w));
  check('「보는 중: …」 한 줄이 지금 조건을 말한다', /function paintFindWhere/.test(w) && /T\('Showing: ', '보는 중: '\)/.test(w));
  check('언어를 바꾸면 함도 다시 그린다', /paintFindChrome\(\); paintFindBox\(\); paintFind\(\);/.test(w));
  // 폰 — A 안의 약점(왼쪽 기둥)을 접는 규칙
  /* ⚠️ work.html 은 <style> 이 둘이다(한자 폰트 @font-face 한 줄 + 본문). 첫 블록만 자르면 본문 CSS 를 통째로 놓친다 —
     실제로 그렇게 짜서 세 검사가 거짓 FAIL 났다. 전부 이어 붙인다. */
  const css = (work.match(/<style[^>]*>[\s\S]*?<\/style>/g) || []).join('\n');
  const mq = css.slice(css.indexOf('@media (max-width:720px)'));
  check('720px 아래에서 함 기둥을 접고(한 열) 가로로 굴린다', /\.findlay\{grid-template-columns:minmax\(0,1fr\)\}/.test(mq) && /\.findbox\{[^}]*overflow-x:auto/.test(mq));
  check('넓은 화면에서는 함이 왼쪽 기둥(184px)이고 표 칸은 min-width 0', /\.findlay\{display:grid;grid-template-columns:184px minmax\(0,1fr\)/.test(css) && /\.findmain\{min-width:0\}/.test(css));
  check('보관함 타일 색이 따로 있다(.tile.arch) — hover 확대(transform) 는 없다', /\.tile\.arch\{/.test(css) && !/\.tile\.arch[^}]*transform/.test(css));
}

console.log('\n──────────────────────────────────────');
if (FAIL) {
  console.log(`  ❌ ${FAIL}건 실패 / ${PASS + FAIL}건`);
  for (const f of FAILS) console.log('     ' + f);
  process.exit(1);
}
console.log(`  ✅ ${PASS}건 전부 통과 — 함 옆 건수가 표와 같은 말을 합니다.`);
