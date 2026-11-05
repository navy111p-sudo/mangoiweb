import { adminSrcUsing as readAdminModuleGraph } from './_srcbundle.mjs';
// 📶 관제탑 «회선» 칸 — 강사 / 학생 나눠 보기 (2026-11-03 사장님 「역할별로 나눠 보이게 고쳐줘」)
//
// 직원 질문: 「254ms · 0.1% 는 강사 쪽인가, 학생 쪽인가?」 → 답은 «방 전체 평균» 이라 알 수 없었다.
// 정본 src/vc-quality-live.ts 를 타입 제거로 «실제로» 돌리고(진짜 SQLite), 배선 두 곳
// (서버 api-admin.ts live=1 블록 · 화면 js/monitor-wall.js 의 회선 칸)을 «오려 내 실행» 한다.
// ⚠️ 「나눈다」 옆에 「표본 없는 1분은 빼지만 표본 있는 1분은 넣는다」·「실패해도 방 단위 값은 나간다」
//    ·「by_role 이 없으면 예전 한 줄」을 짝으로 둔다 — 짝이 없으면 «전부 null» 같은 엉터리도 통과한다.
// ⚠️ 스키마·방 단위 SQL 은 하니스에 베끼지 않고 api-admin.ts 에서 읽는다(CLAUDE.md 2장).
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'cloudflare-deploy/src');
const PUB = resolve(ROOT, 'cloudflare-deploy/public');
let PASS = 0, FAIL = 0;
const ok = (c, m) => { if (c) { PASS++; console.log('  ✅ ' + m); } else { FAIL++; console.log('  ❌ ' + m); } };
const rd = (p) => readFileSync(p, 'utf8');
const done = () => { console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`); process.exit(FAIL ? 1 : 0); };

/* 중괄호 짝으로 블록 자르기 — 문자열·템플릿·주석 안의 중괄호는 안 센다 */
function blockFrom(src, start) {
  const open = src.indexOf('{', start);
  if (start < 0 || open < 0) return '';
  let d = 0, i = open, q = '', lineC = false, blockC = false;
  for (; i < src.length; i++) {
    const ch = src[i], nx = src[i + 1];
    if (lineC) { if (ch === '\n') lineC = false; continue; }
    if (blockC) { if (ch === '*' && nx === '/') { blockC = false; i++; } continue; }
    if (q) { if (ch === '\\') { i++; continue; } if (ch === q) q = ''; continue; }
    if (ch === '/' && nx === '/') { lineC = true; i++; continue; }
    if (ch === '/' && nx === '*') { blockC = true; i++; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { q = ch; continue; }
    if (ch === '{') d++;
    else if (ch === '}') { d--; if (d === 0) return src.slice(start, i + 1); }
  }
  return '';
}

/* ── 정본 로드 ── */
let M = null;
try {
  const code = stripTypeScriptTypes(rd(resolve(SRC, 'vc-quality-live.ts')));
  M = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
} catch (e) { console.log('  (정본 로드 실패) ' + e.message); }
ok(!!(M && M.LIVE_ROLE_SQL && M.LIVE_AVG_SQL && M.attachRoleSplit), '전제: 정본 src/vc-quality-live.ts 를 불러왔다');
if (!M) done();

const ADMIN = readAdminModuleGraph(adminModuleFile => rd(resolve(SRC, adminModuleFile)));
const qStart = ADMIN.indexOf("path === '/api/admin/vc/quality'");
const createSql = (ADMIN.slice(qStart).match(/CREATE TABLE IF NOT EXISTS vc_quality \([^`]*\)/) || [''])[0];
const liveAt = ADMIN.indexOf("if (url.searchParams.get('live') === '1')", qStart);
const liveBlock = blockFrom(ADMIN, liveAt);
ok(!!createSql && /\bsamples\b/.test(createSql), '전제: api-admin.ts 의 vc_quality 스키마를 읽었다(samples 칸 포함)');
ok(liveBlock.length > 200 && /LIVE_ROLE_SQL/.test(liveBlock), '전제: api-admin.ts 의 live=1 블록을 중괄호 짝으로 잘라 냈다');
/* 정본 약속 «방 단위 쿼리와 같은 WHERE» — 두 SQL 의 WHERE 를 소스에서 읽어 글자 그대로 대조한다 */
{
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const whereOf = (sql) => norm((String(sql).match(/WHERE([\s\S]*?)GROUP BY/) || [])[1]);
  const roomSql = (liveBlock.match(/SELECT room, COUNT\(\*\) AS windows[\s\S]*?`/) || [''])[0];
  const wRoom = whereOf(roomSql), wRole = whereOf(M.LIVE_ROLE_SQL);
  ok(!!wRoom && wRoom === wRole, `역할별 SQL 의 WHERE 가 방 단위 SQL 과 같다 (방 «${wRoom}» · 역할 «${wRole}»)`);
  ok(/\$\{LIVE_AVG_SQL\}/.test(roomSql) && M.LIVE_ROLE_SQL.includes(M.LIVE_AVG_SQL), '평균 규칙(표본 있는 1분만)은 LIVE_AVG_SQL 한 곳 — 방 단위·역할별 쿼리가 함께 쓴다');
}

/* ── 진짜 SQLite — 방 두 개, 강사·학생·기타, 카메라 끈 1분, 창 밖 오래된 행 ── */
const NOW = Date.now();
function mkDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(createSql);
  const ins = db.prepare('INSERT INTO vc_quality (ts, room, uid, name, role, avg_loss, max_loss, avg_rtt, aao, samples) VALUES (?,?,?,?,?,?,?,?,?,?)');
  const R = 'class-4405-20261103', R2 = 'class-7657-20261103';
  // 강사 — 254ms·0.1% 두 번(= 화면 사진의 그 숫자)
  ins.run(NOW - 60000, R, 't_len', 'LEN', 'teacher', 0.1, 0.4, 254, 0, 40);
  ins.run(NOW - 120000, R, 't_len', 'LEN', 'teacher', 0.1, 0.3, 254, 0, 38);
  // 학생 두 명 — 한 명은 'student', 한 명은 역할 빈 값(옛 기기) → 둘 다 학생
  ins.run(NOW - 60000, R, 's_kim', 'Kim', 'student', 1.0, 2.0, 180, 0, 30);
  ins.run(NOW - 90000, R, 's_lee', 'Lee', '', 3.0, 5.0, 200, 0, 25);
  // 카메라 끈 1분 — samples 0 · avg_rtt 0 (화면이 보내는 «표본 없음» 모양). 평균에 넣으면 학생이 좋아 보인다
  ins.run(NOW - 30000, R, 's_kim', 'Kim', 'student', 0, 0, 0, 0, 0);
  // 기기가 teacher·student·빈 값이 아닌 글자를 보낸 드문 경우 — 기타
  //   (⚠️ 본사·사장님 «직접 입장» 은 vcIsTeacherRole() 이 참이라 기기가 'teacher' 로 보낸다 → 강사 줄)
  ins.run(NOW - 60000, R, 'hq_x', 'HQ', 'hq_admin', 0.5, 0.5, 100, 0, 10);
  // 음수 손실 행 — 수집 경로가 무인증이라 들어올 수는 있다. 방 단위·역할별 둘 다 같은 WHERE 로 빼야 한다
  ins.run(NOW - 45000, R, 't_len', 'LEN', 'teacher', -1, 0, 9999, 0, 40);
  // 창 밖(10분 전) — 안 섞여야 한다
  ins.run(NOW - 600000, R, 't_len', 'LEN', 'teacher', 50, 60, 900, 0, 40);
  // 다른 방 — 강사만, 그것도 표본이 하나도 없다
  ins.run(NOW - 60000, R2, 't_belle', 'BELLE', 'Teacher', 0, 0, 0, 0, 0);
  return db;
}
function d1(db, opt = {}) {
  return { prepare(sql) {
    return { bind(...a) { return { async all() {
      if (opt.failRole && sql === M.LIVE_ROLE_SQL) throw new Error('D1 흔들림(모의)');
      return { results: db.prepare(sql).all(...a).map(r => ({ ...r })) };
    } }; } };
  }, async exec(s) { db.exec(s); } };
}
const since = NOW - 5 * 60000;

console.log('① 정본 SQL 을 진짜 SQLite 에 돌린다');
{
  const rows = mkDb().prepare(M.LIVE_ROLE_SQL).all(since).map(r => ({ ...r }));
  const get = (room, rk) => rows.find(r => r.room === room && r.rk === rk);
  const T = get('class-4405-20261103', 'teacher'), S = get('class-4405-20261103', 'student'), O = get('class-4405-20261103', 'other');
  ok(T && T.avg_rtt === 254 && T.avg_loss === 0.1 && T.people === 1, `강사 = 254ms · 0.1% · 1명 (실측 ${JSON.stringify(T)})`);
  ok(T && T.avg_rtt !== 900, '(짝) 5분 창 밖의 행은 안 섞인다');
  ok(T && T.avg_rtt !== 9999 && T.avg_loss >= 0, '(짝) 음수 손실 행(avg_loss < 0)은 방 단위와 같은 조건으로 빠진다');
  ok(S && S.people === 2, `역할 빈 값(옛 기기)도 학생으로 센다 — 학생 2명 (실측 ${S && S.people})`);
  ok(S && S.avg_loss === 2 && S.avg_rtt === 190, `표본 없는 1분(samples 0·rtt 0)은 평균에서 뺀다 — 학생 190ms · 2% (실측 ${S && S.avg_rtt}ms · ${S && S.avg_loss}%)`);
  ok(S && S.avg_loss !== 1.3 && S.avg_rtt !== 127, '(짝) 뺐기 때문에 «0 이 섞여 좋아 보이는» 값(127ms·1.3%)이 아니다');
  ok(O && O.people === 1 && O.avg_rtt === 100, `teacher·student·빈 값이 아닌 글자(hq_admin)는 «기타» (실측 ${JSON.stringify(O)})`);
  const B = get('class-7657-20261103', 'teacher');
  ok(B && B.avg_rtt === null && B.avg_loss === null, `대소문자가 달라도 강사('Teacher') · 표본이 하나도 없으면 null(«모름») — 0 이 아니다 (실측 ${JSON.stringify(B)})`);
}

console.log('\n② attachRoleSplit — 방마다 붙이기');
{
  const rooms = [{ room: 'A', avg_rtt: 200, avg_loss: 1 }, { room: 'B', avg_rtt: 90, avg_loss: 0 }];
  const out = M.attachRoleSplit(rooms, [
    { room: 'A', rk: 'student', people: 2, avg_loss: 0, avg_rtt: 120 },
    { room: 'A', rk: 'other', people: 1, avg_loss: null, avg_rtt: 'x' },
    { room: 'A', rk: 'teacher', people: 1, avg_loss: 0.1, avg_rtt: 254 },
    { room: 'A', rk: '???', people: 1, avg_loss: 1, avg_rtt: 1 },
    { room: '', rk: 'teacher', people: 1, avg_loss: 1, avg_rtt: 1 },
  ]);
  const A = out[0];
  ok(A.avg_rtt === 200 && A.avg_loss === 1, '방 단위 값은 그대로 둔다(심각도가 그 값을 쓴다)');
  ok(Array.isArray(A.by_role) && A.by_role[0].role === 'teacher' && A.by_role[1].role === 'student', '순서는 강사 → 학생 → 기타 (서버가 준 순서와 무관)');
  ok(A.by_role[1].avg_loss === 0 && A.by_role[1].avg_rtt === 120, '(짝) 손실 0% 는 0 으로 남는다 — «모름» 과 다르다');
  const others = A.by_role.filter(x => x.role === 'other');
  ok(others.some(x => x.avg_loss === null && x.avg_rtt === null), "숫자가 아닌 값('x')·null 은 null(«모름») — 0 으로 바꾸지 않는다");
  ok(others.some(x => x.avg_rtt === 1), '(짝) 숫자면 그대로 남는다');
  ok(A.by_role.length === 4 && A.by_role.filter(x => x.role === 'other').length === 2, '모르는 역할 이름은 «기타» 로 떨어진다');
  ok(!('by_role' in out[1]), '역할 행이 없는 방에는 by_role 을 안 붙인다(화면은 예전 한 줄)');
  ok(rooms[0].by_role === undefined, '입력 배열을 건드리지 않는다');
}

console.log('\n③ 서버 배선 — api-admin.ts live=1 블록을 오려 내 실제로 돌린다');
{
  let run = null;
  try {
    const js = stripTypeScriptTypes('export async function run(url, env, json, LIVE_ROLE_SQL, attachRoleSplit, LIVE_AVG_SQL) {\n' + liveBlock + '\nreturn null; }');
    run = (await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))).run;
  } catch (e) { console.log('  (블록 변환 실패) ' + e.message); }
  ok(typeof run === 'function', '전제: 그 블록이 실행 가능한 함수가 됐다');
  if (run) {
    const url = new URL('https://mangoi.ai/api/admin/vc/quality?live=1&mins=5');
    const json = (o) => o;
    const r1 = await run(url, { DB: d1(mkDb()) }, json, M.LIVE_ROLE_SQL, M.attachRoleSplit, M.LIVE_AVG_SQL);
    const R = r1 && r1.rooms && r1.rooms.find(x => x.room === 'class-4405-20261103');
    ok(r1 && r1.ok === true && R && Array.isArray(R.by_role) && R.by_role.length === 3, `응답의 방에 by_role 이 붙는다 (실측 ${R && R.by_role && R.by_role.map(x => x.role).join(',')})`);
    ok(R && R.by_role[0].role === 'teacher' && R.by_role[0].avg_rtt === 254, '(짝) 강사 칸 = 254ms');
    ok(R && typeof R.avg_rtt === 'number' && typeof R.avg_loss === 'number' && R.windows === 6, `방 단위 값도 함께 나간다 · windows 는 기록된 1분 수 그대로 (windows ${R && R.windows})`);
    // 🔢 (2026-11-03 사장님 「방 단위 값도 표본 없는 1분 빼고」) 방 평균도 카메라 끈 1분을 뺀다
    ok(R && R.avg_rtt === 198 && R.avg_loss === 0.9, `방 평균 = 표본 있는 1분만 — 198ms · 0.9% (실측 ${R && R.avg_rtt}ms · ${R && R.avg_loss}%)`);
    ok(R && R.avg_rtt !== 165 && R.avg_loss !== 0.8, '(짝) 카메라 끈 1분을 0 으로 섞은 옛 값(165ms·0.8%)이 아니다');
    ok(R && R.worst_loss === 5, `최악 손실도 표본 있는 1분에서 (실측 ${R && R.worst_loss})`);
    const RB = r1 && r1.rooms && r1.rooms.find(x => x.room === 'class-7657-20261103');
    ok(RB && RB.avg_rtt === null && RB.avg_loss === null && RB.worst_loss === null && RB.windows === 1,
      `표본이 하나도 없는 방은 null(«모름») — 0 이 아니다 · 줄은 남는다 (실측 ${JSON.stringify(RB)})`);
    const warn = console.warn; console.warn = () => {};
    let r2 = null, threw = false;
    try { r2 = await run(url, { DB: d1(mkDb(), { failRole: true }) }, json, M.LIVE_ROLE_SQL, M.attachRoleSplit, M.LIVE_AVG_SQL); } catch (e) { threw = true; }
    console.warn = warn;
    const R2 = r2 && r2.rooms && r2.rooms.find(x => x.room === 'class-4405-20261103');
    ok(!threw && r2 && r2.ok === true && R2 && !('by_role' in R2) && typeof R2.avg_rtt === 'number',
      '역할 집계가 실패해도 응답은 나간다 — by_role 만 빠지고 방 단위 값은 그대로(관제탑은 예전 한 줄)');
  }
}

console.log('\n④ 화면 — js/monitor-wall.js 의 회선 칸을 오려 내 실제로 그린다');
{
  const W = rd(resolve(PUB, 'js/monitor-wall.js'));
  const fn = (name) => blockFrom(W, W.indexOf('function ' + name + '('));
  const roleLb = (W.match(/var ROLE_LB = \{[^\n]*\};/) || [''])[0];
  const parts = ['lvl', 'worst', 'fmt', 'sigOne', 'sigHtml', 'severity', 'reasonHtml'].map(fn);
  ok(parts.every(Boolean) && !!roleLb, '전제: lvl·worst·fmt·sigOne·sigHtml·severity·reasonHtml·ROLE_LB 를 잘라 냈다');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const mk = (en, state) => new Function('state', 'L', 'esc',
    roleLb + '\n' + parts.join('\n') + '\nreturn { lvl, fmt, sigOne, sigHtml, severity, reasonHtml };')(
    state, (ko, e) => (en ? e : ko), esc);
  const text = (h) => h.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
  const q = {
    'r-split': { avg_rtt: 220, avg_loss: 0.9, by_role: [
      { role: 'teacher', people: 1, avg_rtt: 254, avg_loss: 0.1 },
      { role: 'student', people: 2, avg_rtt: 88, avg_loss: 0 },
      { role: 'other', people: 1, avg_rtt: null, avg_loss: null }] },
    'r-old': { avg_rtt: 610, avg_loss: 9.2 },
    'r-bad-teacher': { avg_rtt: 300, avg_loss: 1, by_role: [{ role: 'teacher', people: 1, avg_rtt: 520, avg_loss: 6 }, { role: 'student', people: 1, avg_rtt: 90, avg_loss: 0 }] },
    'r-bad-student': { avg_rtt: 260, avg_loss: 1, by_role: [{ role: 'teacher', people: 1, avg_rtt: 90, avg_loss: 0 }, { role: 'student', people: 1, avg_rtt: 450, avg_loss: 1 }] },
    'r-all-bad': { avg_rtt: 500, avg_loss: 6, by_role: [{ role: 'teacher', people: 1, avg_rtt: 480, avg_loss: 5 }, { role: 'student', people: 1, avg_rtt: 700, avg_loss: 9 }] },
    'r-unknown-roles': { avg_rtt: 500, avg_loss: 1, by_role: [{ role: 'teacher', people: 1, avg_rtt: null, avg_loss: null }] },
  };
  const ko = mk(false, { quality: q, alerts: {} }), en = mk(true, { quality: q, alerts: {} });
  const h = ko.sigHtml('r-split');
  const lines = (h.match(/<div class="sig-r">[\s\S]*?<\/span><\/div>/g) || []).map(text);
  ok(lines.length === 3, `강사·학생·기타 세 줄로 그린다 (실측 ${lines.length}줄)`);
  ok(lines[0] === '강사 🟡 254ms · 0.1%', `첫 줄 = 강사 (실측 «${lines[0]}»)`);
  ok(lines[1] === '학생 2명 🟢 88ms · 0%', `둘째 줄 = 학생 2명 · 손실 0% 는 «0%» (실측 «${lines[1]}»)`);
  ok(/^기타 /.test(lines[2] || '') && /—/.test(lines[2]) && !/🟢/.test(lines[2]), `(짝) 표본 없는 줄은 «—» — 초록불을 켜지 않는다 (실측 «${lines[2]}»)`);
  ok(/title="최근 5분 · 방 전체 220ms · 0.9%"/.test(h), '방 전체 값은 툴팁에 남는다');
  const he = en.sigHtml('r-split');
  ok(/>Teacher</.test(he) && /Student 2</.test(he) && /Last 5 min · whole room/.test(he), 'EN 화면은 Teacher / Student / Last 5 min (EN/KO)');
  const old = text(ko.sigHtml('r-old'));
  ok(old === '🔴 610ms · 9.2%', `by_role 이 없으면 예전 한 줄 그대로 (실측 «${old}»)`);
  ok(text(ko.sigHtml('nope')) === '—', '(짝) 그 방 자료가 아예 없으면 «—»');
  ok(text(mk(false, { quality: { z: { avg_rtt: null, avg_loss: null, windows: 3 } }, alerts: {} }).sigHtml('z')) === '—', '방 단위 값이 «모름»(null) 이면 «—» — 초록불이 아니다');
  // 기준 한 곳 — 경계 앞뒤
  const L1 = ko.lvl;
  ok(L1({ avg_loss: 4.9, avg_rtt: 399 }) === 1 && L1({ avg_loss: 5, avg_rtt: 0 }) === 2 && L1({ avg_loss: 0, avg_rtt: 400 }) === 2, '나쁨(2) 경계: 손실 5% · RTT 400ms');
  ok(L1({ avg_loss: 1.9, avg_rtt: 249 }) === 0 && L1({ avg_loss: 2, avg_rtt: 0 }) === 1 && L1({ avg_loss: 0, avg_rtt: 250 }) === 1, '주의(1) 경계: 손실 2% · RTT 250ms');
  ok(L1({ avg_loss: null, avg_rtt: null }) === 0 && L1(undefined) === 0, '(짝) 모름(null)·자료 없음은 어느 기준에도 안 걸린다');
  // 🚨 (2026-11-03 사장님 「심각도도 가장 나쁜 역할 기준으로」) — 「손봐야 할 방」·줄의 🔴 가 «가장 나쁜 줄» 을 따른다
  const sev = (rid) => ko.severity({ roomId: rid, userCount: 2 });
  const why = (k, rid) => text(k.reasonHtml({ roomId: rid, userCount: 2 }));
  ok(sev('r-bad-teacher') === 2, '방 평균은 주의 이하여도 강사 줄이 나쁘면 심각도 2 (「손봐야 할 방」에 뜬다)');
  ok(why(ko, 'r-bad-teacher') === '📶 강사 회선 나쁨 · 520ms · 6%', `사유가 «누구» 인지 말한다 (실측 «${why(ko, 'r-bad-teacher')}»)`);
  ok(sev('r-bad-student') === 2 && why(ko, 'r-bad-student') === '📶 학생 회선 나쁨 · 450ms · 1%', `학생 줄만 나빠도 2 · 사유는 학생 (실측 «${why(ko, 'r-bad-student')}»)`);
  ok(why(en, 'r-bad-teacher') === '📶 Teacher bad line · 520ms · 6%', `EN 사유 (실측 «${why(en, 'r-bad-teacher')}»)`);
  ok(sev('r-all-bad') === 2 && /^📶 (강사|학생) 회선 나쁨/.test(why(ko, 'r-all-bad')), '둘 다 나쁘면 심각도 2 · 역할 하나를 짚는다');
  ok(why(ko, 'r-all-bad') === '📶 강사 회선 나쁨 · 480ms · 5%', `(짝) 단계가 같으면 강사 먼저 (실측 «${why(ko, 'r-all-bad')}»)`);
  ok(sev('r-split') === 0, '(짝) 가장 나쁜 줄이 «주의»(🟡) 면 심각도는 안 오른다 — 나쁨(🔴)만 올린다');
  ok(sev('r-old') === 2 && why(ko, 'r-old') === '📶 회선 나쁨 · 610ms · 9.2%', '(짝) by_role 이 없으면 예전처럼 방 전체로 판정·표기(역할 이름 없음)');
  ok(sev('r-unknown-roles') === 2 && why(ko, 'r-unknown-roles') === '📶 회선 나쁨 · 500ms · 1%', '(짝) 역할 줄이 «모름» 뿐이면 방 전체 값으로 판정한다(모름이 나쁨을 가리지 않는다)');
  ok(ko.severity({ roomId: 'nope', userCount: 2 }) === 0, '(짝) 자료가 없는 방은 0');
  // 배선 — 표의 회선 칸이 이 함수를 부른다
  const row = fn('rowHtml');
  ok(/'<td class="n">' \+ sigHtml\(rid\) \+ '<\/td>'/.test(row), '표의 «회선» 칸이 sigHtml(rid) 를 부른다');
  ok(!/avg_loss >= 5|avg_rtt >= 400/.test(W.replace(fn('lvl'), '')), '기준 숫자(5%·400ms)를 lvl 밖에 다시 적지 않았다(기준은 한 곳)');
}

console.log('\n⑤ 화면 자산 — ?v= 를 올렸다');
{
  const H = rd(resolve(PUB, 'admin/monitor-wall.html'));
  const v = +((H.match(/\/js\/monitor-wall\.js\?v=(\d+)/) || [])[1] || 0);
  ok(v >= 11, `monitor-wall.html 이 monitor-wall.js?v=${v} 로 부른다(나눔은 v=11 부터)`);
  ok(/\.sig-r\s*\{/.test(H), '나눈 줄의 모양(.sig-r)이 HTML 인라인 CSS 에 있다(/admin/ 밑에는 css 파일을 두지 않는다)');
}

done();
