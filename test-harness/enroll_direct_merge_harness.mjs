/* 🔀 «직접 배정» → 수강신청 합치기 (2026-09-30 사장님 «배정 경로가 어떠하든 같은 조건과 버튼»)
 *  ① 정본(enroll-direct.ts + enroll-direct-merge.ts)을 타입 제거로 «실제로» 돌린다 — 진짜 SQLite(D1 모양으로 감쌈)
 *     · dry 는 아무것도 안 쓴다 · 묶음마다 신청서 1건 · 수업 source 가 adm-enroll:<id> 로 바뀐다
 *     · 칸(패키지·요일·시각·강사·기간·확정·요금 비움) · 같은 묶음이 다시 오면 새로 안 만들고 붙인다(기간이 늘어남)
 *     · (짝) 강사가 다르면 다른 신청서 · 취소된 신청서에는 안 붙인다 · 이미 신청서 수업인 행은 안 건드린다
 *  ② 합친 뒤 «기존 버튼» 이 그대로 걸리는가 — 삭제의 연쇄 취소 SQL · 후속 계획의 «이미 만들어짐» 조회를 소스에서 오려 내 돌린다
 *  ③ 배선: 수업 등록 POST 가 자동으로 잇는다 · PUT 합치기는 본사만·모르는 action 거절·dry 기본
 *  ④ 화면: 합치기 버튼은 본사만(짝: 아니면 버튼 없음)
 */
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { stripTypeScriptTypes } from 'node:module';
let PASS = 0, FAIL = 0;
const ok = (c, n) => { if (c) { PASS++; console.log('  ✅ ' + n); } else { FAIL++; console.log('  ❌ ' + n); } };
const SRC_D = process.env.DIRECT_SRC || 'cloudflare-deploy/src/enroll-direct.ts';
const SRC_M = process.env.MERGE_SRC || 'cloudflare-deploy/src/enroll-direct-merge.ts';
const A = readFileSync(process.env.ADMIN_SRC || 'cloudflare-deploy/src/api-admin.ts', 'utf8');
const C = readFileSync(process.env.CORE_SRC || 'cloudflare-deploy/public/js/adm-core.js', 'utf8');

const strip = (t) => stripTypeScriptTypes(t).replace(/^import .*$/gm, '').replace(/^export /gm, '');
let M = null;
try {
  M = new Function(strip(readFileSync(SRC_D, 'utf8')) + '\n' + strip(readFileSync(SRC_M, 'utf8')) +
    '\nreturn { groupDirectClasses, directEnrollmentFields, mergeDirectRows, mergeDirectByIds, UNMERGED_DIRECT_SQL, DIRECT_ENROLL_TYPE };')();
} catch (e) { console.log('  ' + e.message); }

/* D1 모양 — prepare().bind().first/all/run + batch */
function d1(db) {
  const wrap = (sql, args = []) => ({
    bind: (...a) => wrap(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
  });
  return { prepare: (sql) => wrap(sql), batch: async (list) => { const out = []; for (const s of list) out.push(await s.run()); return out; } };
}
/* 스키마는 소스에서 읽는다 — 하니스에 베끼지 않는다 */
function schema() {
  const db = new DatabaseSync(':memory:');
  const cre = A.match(/CREATE TABLE IF NOT EXISTS enrollments \(id INTEGER[^`]*?\);/);
  db.exec(cre ? cre[0] : 'CREATE TABLE enrollments (id INTEGER PRIMARY KEY)');
  const i0 = A.indexOf('if (!_enrSchemaReady) {'), i1 = A.indexOf('_enrSchemaReady = true;', i0);
  for (const m of A.slice(i0, i1).matchAll(/_addEnrCol2\('(\w+)', '(\w+)'\)/g)) db.exec(`ALTER TABLE enrollments ADD COLUMN ${m[1]} ${m[2]}`);
  db.exec(`CREATE TABLE class_schedules (id INTEGER PRIMARY KEY, user_id TEXT, student_name TEXT, teacher_id TEXT, start_time TEXT, duration_min INTEGER, schedule_kind TEXT, day_of_week TEXT, scheduled_date TEXT, class_type TEXT, created_at INTEGER, updated_at INTEGER, status TEXT, source TEXT);
           CREATE TABLE teachers (id INTEGER PRIMARY KEY, name TEXT);
           INSERT INTO teachers VALUES (7,'KARL'),(9,'ZEE');`);
  return db;
}
const day = (n) => new Date(Date.now() + 9 * 3600e3 + n * 86400e3).toISOString().slice(0, 10);
const ins = (db, id, o) => db.prepare(`INSERT INTO class_schedules (id,user_id,student_name,teacher_id,start_time,duration_min,schedule_kind,day_of_week,scheduled_date,class_type,created_at,status,source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
  .run(id, o.u || 'jjy2323', o.n ?? '장지웅', o.t ?? '7', o.st || '16:40', o.dur ?? 20, o.k || 'one_off', o.dow ?? null, o.d ?? null, o.ct || 'regular', o.c || id, o.s || 'active', o.src || 'admin_ui');

console.log('① 합치기 (진짜 SQLite)');
ok(!!(M && M.mergeDirectRows), '전제: 정본을 실행할 수 있다');
const run = async () => {
  if (!M) return;
  const db = schema(); const env = { DB: d1(db) };
  const cols = db.prepare(`PRAGMA table_info(enrollments)`).all().map(c => c.name);
  ok(['type', 'teacher_name', 'end_date', 'duration_min', 'days_of_week', 'time'].every(c => cols.includes(c)), '전제: 소스에서 신청서 스키마를 읽었다(' + cols.length + '칸)');
  const d1d = day(1), d8 = day(8);
  ins(db, 1, { d: d1d }); ins(db, 2, { d: d8 });                                   // 장지웅 · KARL · 16:40 · 날짜 2
  ins(db, 3, { u: 'kim', n: '김', t: '9', st: '10:00', k: 'recurring', dow: '1' });   // 김 · ZEE · 매주 월
  ins(db, 4, { u: 'kim', n: '김', t: '9', st: '10:00', k: 'recurring', dow: '3' });   //        · 매주 수
  ins(db, 5, { u: 'x', d: d1d, src: 'adm-enroll:99' });                             // 이미 신청서 수업 — 대상 아님
  const unmerged = async () => (await env.DB.prepare(M.UNMERGED_DIRECT_SQL).all()).results;

  const dry = await M.mergeDirectRows(env, await unmerged(), true);
  ok(dry.groups === 2 && dry.rows === 4, `dry: 묶음 2 · 수업 4 (${dry.groups}·${dry.rows})`);
  ok(db.prepare('SELECT COUNT(*) n FROM enrollments').get().n === 0 && db.prepare("SELECT COUNT(*) n FROM class_schedules WHERE source='admin_ui'").get().n === 4, 'dry 는 아무것도 안 쓴다');

  const r = await M.mergeDirectRows(env, await unmerged(), false);
  ok(r.created_enrollments === 2 && r.linked_rows === 4 && !r.failed.length, `실행: 신청서 2건 · 수업 4건 연결 (${r.created_enrollments}·${r.linked_rows}·실패 ${r.failed.length})`);
  const E = db.prepare('SELECT * FROM enrollments ORDER BY id').all();
  const ej = E.find(e => e.student_user_id === 'jjy2323'), ek = E.find(e => e.student_user_id === 'kim');
  ok(ej && ej.status === 'confirmed' && ej.package === '정규수업' && ej.teacher_name === 'KARL' && ej.time === '16:40' && ej.duration_min === 20, '칸: 확정 · 정규수업 · 강사 · 시각 · 길이');
  ok(ej && ej.monthly_fee_krw == null, '요금을 지어내지 않는다(비움)');
  ok(ej && ej.end_date === d8 && ej.started_at === Date.parse(d1d + 'T00:00:00+09:00'), '기간: 첫날(KST 0시) ~ 끝날');
  ok(ek && ek.days_of_week === '월,수' && ek.end_date == null, '매주 수업: 요일 «월,수» · 끝날 없음');
  ok(ej && ej.type === M.DIRECT_ENROLL_TYPE, '신청서에 «직접 배정에서 옴» 표시');
  const srcJ = db.prepare('SELECT DISTINCT source s FROM class_schedules WHERE user_id=?').all('jjy2323').map(x => x.s);
  ok(srcJ.length === 1 && srcJ[0] === 'adm-enroll:' + ej.id, '수업 source 가 adm-enroll:<신청서id> 로 바뀐다(' + srcJ.join(',') + ')');
  /* 목록 조건이 먼저 거르지만, 정본에 «그런 행이 직접 넘어와도» 안 건드리는지 실제로 넘겨 본다 */
  const row5 = db.prepare(M.UNMERGED_DIRECT_SQL.replace("cs.source = 'admin_ui'", 'cs.id = 5')).all();
  ok(row5.length === 1, '전제: 신청서 수업 행을 정본 모양으로 읽었다');
  await M.mergeDirectRows(env, row5, false);
  ok(db.prepare('SELECT source s FROM class_schedules WHERE id=5').get().s === 'adm-enroll:99', '(짝) 이미 신청서 수업인 행은 넘어와도 안 건드린다');
  db.prepare("DELETE FROM enrollments WHERE student_user_id='x'").run();
  ok((await unmerged()).length === 0, '합친 뒤 «직접 배정» 줄이 남지 않는다');

  // 같은 묶음이 다시 배정되면 — 새 신청서 없이 붙고 기간이 늘어난다
  const d15 = day(15);
  ins(db, 6, { d: d15 });
  const r2 = await M.mergeDirectByIds(env, [6]);
  ok(r2 && r2.created_enrollments === 0 && r2.attached_to_existing === 1, '같은 묶음은 새로 안 만들고 붙인다');
  ok(db.prepare('SELECT end_date e FROM enrollments WHERE id=?').get(ej.id).e === d15, '붙이면 신청서 기간이 늘어난다');
  ok(db.prepare('SELECT source s FROM class_schedules WHERE id=6').get().s === 'adm-enroll:' + ej.id, '새 수업도 같은 신청서로 이어진다');
  // (짝) 강사가 다르면 다른 신청서
  ins(db, 7, { d: d15, t: '9' });
  const r3 = await M.mergeDirectByIds(env, [7]);
  ok(r3 && r3.created_enrollments === 1, '(짝) 강사가 다르면 다른 신청서');
  // (짝) 취소된 신청서에는 안 붙인다
  db.prepare("UPDATE enrollments SET status='cancelled' WHERE id=?").run(ej.id);
  ins(db, 8, { d: day(22) });
  const r4 = await M.mergeDirectByIds(env, [8]);
  ok(r4 && r4.created_enrollments === 1 && r4.attached_to_existing === 0, '(짝) 취소된 신청서에는 안 붙인다');
  // (짝) 대소문자만 다른 계정(Kim/kim)은 별개 — 한 신청서로 섞지 않는다
  ins(db, 11, { u: 'Kim', n: '김', t: '9', st: '10:00', k: 'recurring', dow: '5' });
  const r5 = await M.mergeDirectByIds(env, [11]);
  ok(r5 && r5.created_enrollments === 1 && r5.attached_to_existing === 0, '(짝) Kim 과 kim 은 다른 신청서');
  // 망가진 DB 에서도 던지지 않는다(수업 등록이 막히면 안 된다)
  let threw = false, rv;
  try { rv = await M.mergeDirectByIds({ DB: { prepare: () => { throw new Error('boom'); } } }, [1]); } catch { threw = true; }
  ok(!threw && rv === null, '망가진 DB 에서도 던지지 않는다(null)');

  console.log('② 합친 뒤 기존 버튼이 그대로 걸리는가');
  const del = A.match(/UPDATE class_schedules SET status='cancelled', updated_at=\? WHERE source = \? AND status != 'cancelled'/);
  ok(!!del, '전제: 삭제의 «연결 수업 취소» SQL 을 오려 냈다');
  if (del) db.prepare(del[0]).run(Date.now(), 'adm-enroll:' + ek.id);
  ok(db.prepare("SELECT COUNT(*) n FROM class_schedules WHERE user_id='kim' AND status='cancelled'").get().n === 2, '🗑️ 삭제 → 그 신청서의 수업이 함께 취소된다');
  const EA = readFileSync('cloudflare-deploy/src/enroll-activate.ts', 'utf8');
  const pl = EA.match(/`(SELECT COUNT\(\*\) AS n FROM class_schedules WHERE source = \?)`/);
  ok(!!pl && db.prepare(pl[1]).get('adm-enroll:' + ej.id).n >= 3, '⚙ 후속 계획이 «이미 만들어짐» 을 본다 → 수업을 새로 안 만든다');
};
await run();

console.log('③ 배선');
{
  const AU = readFileSync('cloudflare-deploy/src/auth-admin.ts', 'utf8');
  const orgFn = (() => { const m = AU.match(/export function isOrgScopedRole[\s\S]*?\n\}/); return m ? new Function(stripTypeScriptTypes(m[0].replace(/^export /, '')) + '\nreturn isOrgScopedRole;')() : null; })();
  ok(!!orgFn && orgFn('agency') && !orgFn('hq'), '전제: 정본 isOrgScopedRole 을 소스에서 읽어 돌린다');
  /* POST 자동 연결 — «본사만» 판정식을 오려 내 실제로 돌린다(강사·조직·모름이면 안 잇는다) */
  const me = A.match(/mergeOk = (!!\(a && a\.ok[^;]*\));/);
  ok(!!me, '전제: POST 의 자동 연결 판정식을 오려 냈다');
  if (me && orgFn) {
    const f = new Function('a', 'isOrgScopedRole', 'return ' + me[1] + ';');
    ok(f({ ok: true, isTeacher: false, role: 'hq' }, orgFn) === true && f({ ok: true, isTeacher: false, role: 'staff' }, orgFn) === true, '(실행) 본사·직원이면 잇는다');
    ok(!f({ ok: true, isTeacher: true, role: 'teacher' }, orgFn) && !f({ ok: true, isTeacher: false, role: 'agency' }, orgFn) && !f({ ok: false }, orgFn) && !f(null, orgFn), '(짝·실행) 강사·대리점·로그인 모름이면 안 잇는다');
  }
  const post = A.indexOf("const enrollmentMerge = mergeOk ? await mergeDirectByIds(env, created.map(");
  const ret = A.indexOf('ok: true, created, failed, enrollment_merge: enrollmentMerge');
  const mo = A.lastIndexOf('let mergeOk = false;', post);
  ok(post > 0 && ret > post && mo > 0 && post - mo < 4000, '수업 등록 POST 가 (본사일 때) 방금 만든 수업을 응답 전에 잇는다');
  ok(/import \{[^}]*\benrollAdminHqOnly\b[^}]*\} from '\.\/enroll-ops'/.test(A), 'PUT 게이트는 정본 enrollAdminHqOnly 를 쓴다(import)');
  const p0 = A.indexOf("if (method === 'PUT' && path === '/api/admin/enrollments') {");
  const p1 = A.indexOf("if ((method === 'GET' || method === 'POST') && path === '/api/admin/enrollments')", p0);
  const put = A.slice(A.indexOf('{', p0) + 1, A.lastIndexOf('}', p1));
  ok(/b\.action !== 'merge_direct'/.test(put) && /unknown_action/.test(put), 'PUT: 모르는 action 은 거절');
  ok(/const dry = b\.dry !== false;/.test(put), 'PUT: dry 가 기본(명시적으로 false 일 때만 쓴다)');
  /* 게이트를 «실제로» 돌린다 — 글자만 보면 `if (false && …)` 한 글자에 뚫린다 */
  let gate = null;
  try {
    gate = new Function('enrollAdminHqOnly', 'parseJsonBody', 'json', 'mergeDirectRows', 'UNMERGED_DIRECT_SQL',
      stripTypeScriptTypes('async function __gate(method, request, env) {' + put + '\nreturn "fallthrough"; }') + '\nreturn __gate;')(
      async (req) => { gate.gated++; return req.deny ? { body: { ok: false }, status: 403 } : null; },
      async (req) => req.body, (b, st) => ({ body: b, status: st || 200 }),
      async () => { gate.called++; return { groups: 1, rows: 1, created_enrollments: 1, attached_to_existing: 0, linked_rows: 1, failed: [] }; }, 'SQL');
  } catch (e) { console.log('  ' + e.message); }
  const call = async (deny, body) => { gate.called = 0; gate.gated = 0; const r = await gate('PUT', { deny, body }, { DB: { prepare: () => ({ all: async () => ({ results: [] }) }) } }); return { r, called: gate.called, gated: gate.gated }; };
  if (gate) {
    const t = await call(true, { action: 'merge_direct', dry: false });
    const h = await call(false, { action: 'merge_direct', dry: false });
    const u = await call(false, { action: 'wipe' });
    const z = await call(false, { action: 'merge_direct' });
    ok(t.gated === 1 && t.r.status === 403 && !t.called, '(실행) 게이트가 막으면 그 응답을 돌려주고 합치기를 부르지 않는다');
    ok(h.gated === 1 && h.r.status === 200 && h.called === 1 && h.r.body.dry === false, '(짝·실행) 게이트가 통과시키면 합치기를 부른다');
    ok(u.r.status === 400 && !u.called, '(실행) 모르는 action 은 400 · 안 부른다');
    ok(z.r.body.dry === true, '(실행) dry 를 안 보내면 dry');
    ok(gate.length === 3 && p1 > p0, '전제: PUT 블록이 GET/POST 블록 «앞» 에 따로 있다(그 조건 줄을 다른 하니스가 앵커로 쓴다)');
  } else ok(false, '전제: PUT 게이트를 실행할 수 있다');
}

console.log('④ 화면');
{
  const cut = (name) => {
    const i0 = C.indexOf('function ' + name + '(');
    let d = 0, i1 = -1;
    for (let i = C.indexOf('{', i0); i0 > 0 && i < C.length; i++) { if (C[i] === '{') d++; else if (C[i] === '}') { d--; if (!d) { i1 = i; break; } } }
    return i1 > 0 ? C.slice(i0, i1 + 1) : '';
  };
  const RE = cut('_renderEnrollments');
  ok(!!RE && /async function enMergeDirect\(\)/.test(C), '전제: _renderEnrollments · enMergeDirect 가 있다');
  const summary = (hq) => {
    const box = { innerHTML: '' }, tb = { innerHTML: '' };
    try {
      new Function('adminLang', '_enItems', '_enDirect', '_enQuery', '_enDupOnly', '_esc', '_fmtDate', 'document', 'window', 'EN_STATUS_META', 'EN_LIVE', '__enSel',
        'let __enShown=[];function _enStatusMeta(){return {};}function _enDupKey(){return "";}function _enSyncSelUI(){}function _enDirectList(){return [];}function _enDirectRow(){return "";}\n' + RE + '\nreturn _renderEnrollments;')(
        'ko', [], [{ key: 'k' }], '', false, (s) => String(s), () => '', { getElementById: (id) => (id === 'en-summary' ? box : id === 'enrollments-table' ? tb : null) },
        { _isHqMgrOrUp: hq }, {}, ['pending', 'confirmed', 'active'], new Set())();
    } catch (e) { return 'ERR ' + e.message; }
    return box.innerHTML;
  };
  ok(/onclick="enMergeDirect\(\)"/.test(summary(true)), '본사에게는 「신청서로 합치기」 버튼');
  ok(!/enMergeDirect/.test(summary(false)) && /1/.test(summary(false)), '(짝) 본사가 아니면 버튼 없이 건수만');
  ok(/method: 'PUT'/.test(cut('enMergeDirect')) && /call\(true\)/.test(cut('enMergeDirect')) && cut('enMergeDirect').indexOf('confirm(') < cut('enMergeDirect').indexOf('call(false)'), '먼저 건수를 묻고(dry) 확인한 뒤에만 실행');
}
console.log('⑤ 학생 상세 캘린더');
{
  const S = readFileSync(process.env.STUDENT_SRC || 'cloudflare-deploy/public/admin/student.html', 'utf8');
  const loops = [...S.matchAll(/for \(const enr of \(_dSchedState\.enrollments \|\| \[\]\)\) \{\s*(?:\/\*[\s\S]*?\*\/\s*)?if \(enr\.type === 'schedule_direct'\) continue;/g)];
  ok(loops.length === 2, '합친 신청서는 주간·월간 신청서 레이어에서 건너뛴다(예약 레이어가 그 수업을 그림 — 두 번 안 그림) (' + loops.length + '/2)');
  ok((S.match(/for \(const enr of \(_dSchedState\.enrollments \|\| \[\]\)\)/g) || []).length === 2, '전제: 신청서 레이어는 두 곳뿐');
}
console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`);
process.exit(FAIL ? 1 : 0);
