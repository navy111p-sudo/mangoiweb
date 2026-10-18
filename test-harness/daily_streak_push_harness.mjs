// 🔔 매일 KST 19:00 «오늘 영어 한 마디» 푸시 — 받을 사람 감시 (2026-10-18, 개선안 3순위 ⑩)
//
// [무엇이 문제였나 — D1 실측]
//   push_queue 의 daily-* 186건이 전부 «사장님 계정(admin)» 과 «계정이 빈 구독» 으로만
//   갔고 학생 구독은 0건이었다. ① 학생인지 안 걸렀고 ② 오늘 출석을 기기번호(user_id)로
//   봤고 ③ 날짜를 UTC 로 셌고 ④ 학생 화면 구독이 계정칸을 비워 저장했다.
//
// [왜 문자열 검사만으로는 모자란가]
//   SQL 도 호출도 다 «있다». 틀린 것은 «누가 고르는가» 뿐이라 정본 SQL 을 소스에서
//   오려 내 진짜 SQLite 에 실제로 돌린다. 「학생은 받는다」 옆에 「직원·출석한 학생은
//   안 받는다」를 짝으로 둔다(짝이 없으면 «전부 보내기»·«아무도 안 보내기» 가 통과).
//
// 실행: node test-harness/daily_streak_push_harness.mjs
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

let DatabaseSync;
try { ({ DatabaseSync } = await import('node:sqlite')); }
catch { console.log('⏭  건너뜀 — 이 node 에는 node:sqlite 가 없습니다(Node 22+ 필요)'); process.exit(0); }

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dir, '../cloudflare-deploy/src');
const PUB = resolve(__dir, '../cloudflare-deploy/public');
const MOD = readFileSync(resolve(SRC, 'daily-streak-targets.ts'), 'utf8');
const IDX = readFileSync(resolve(SRC, 'index.ts'), 'utf8');
const PSW = readFileSync(resolve(PUB, 'js/idx-push-sw.js'), 'utf8');
const HTML = readFileSync(resolve(PUB, 'index.html'), 'utf8');

let PASS = 0, FAIL = 0;
const ok = (c, m, x) => { if (c) { PASS++; console.log('  ✅ ' + m); } else { FAIL++; console.log('  ❌ FAIL ' + m + (x !== undefined ? '  →  ' + JSON.stringify(x) : '')); } };

/* 중괄호 짝으로 «선언 뒤 첫 { 부터» 몸통을 자른다(TS 반환 타입의 { 를 피하려고 괄호 깊이 0 인 { 만). */
function bodyOf(src, decl) {
  const i = src.indexOf(decl); if (i < 0) return '';
  let j = i + decl.length, par = 0, ang = 0;
  for (; j < src.length; j++) {
    const c = src[j];
    if (c === '(') par++; else if (c === ')') par--;
    else if (c === '<') ang++; else if (c === '>') ang = Math.max(0, ang - 1);
    else if (c === '{' && par === 0 && ang === 0) break;
  }
  let d = 0, k = j;
  for (; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) break; } }
  return src.slice(i, k + 1);
}

/* 모듈을 타입만 벗겨 실제로 불러온다 — 정본을 «베끼지» 않는다. */
let M = null;
try {
  const js = stripTypeScriptTypes(MOD).replace(/^export\s+/gm, '');
  M = new Function(js + '\nreturn { kstTodayYmd, STREAK_TARGET_SQL, loadStreakTargets };')();
} catch (e) { ok(false, '전제: 정본 모듈을 실제로 불러왔다', String(e && e.message || e)); }

console.log('\n① 날짜는 KST');
if (M) {
  ok(M.kstTodayYmd(Date.parse('2026-10-18T10:00:00Z')) === '2026-10-18', 'UTC 10:00(=KST 19:00) → 그날');
  ok(M.kstTodayYmd(Date.parse('2026-10-18T16:00:00Z')) === '2026-10-19', 'UTC 16:00(=KST 다음날 01:00) → 다음날(UTC 로 세면 하루 밀림)');
}

console.log('\n② 받을 사람 — 진짜 SQLite');
function mkDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE push_subscriptions (id INTEGER PRIMARY KEY, user_id TEXT, endpoint TEXT UNIQUE, enabled INTEGER DEFAULT 1);
           CREATE TABLE students_erp (user_id TEXT PRIMARY KEY);
           CREATE TABLE admin_account (username TEXT UNIQUE);
           CREATE TABLE attendance (id INTEGER PRIMARY KEY, room_id TEXT, user_id TEXT, account_uid TEXT, date TEXT);`);
  const sub = db.prepare('INSERT INTO push_subscriptions (user_id, endpoint, enabled) VALUES (?,?,?)');
  sub.run('admin', 'ep-admin-pc', 1);           // 사장님(관리자) — 실측 그대로
  sub.run(null, 'ep-null', 1);                  // 계정이 빈 구독 — 실측 그대로
  sub.run('kid1', 'ep-kid1-a', 1);              // 학생 · 오늘 안 옴 → 받는다
  sub.run('kid1', 'ep-kid1-b', 1);              //   같은 학생 다른 기기 → 받는다
  sub.run('kid2', 'ep-kid2', 1);                // 학생 · 오늘 화상수업(account_uid) → 안 받는다
  sub.run('kid3', 'ep-kid3', 1);                // 학생 · 오늘 카페24 예약 씨앗(user_id=계정) → 안 받는다
  sub.run('kid4', 'ep-kid4', 1);                // 학생 · «어제» 만 왔음 → 받는다(짝)
  sub.run('kid5', 'ep-kid5', 0);                // 학생 · 구독 꺼짐 → 안 받는다
  sub.run('both', 'ep-both', 1);                // 학생이자 직원 아이디 → 직원으로 보고 안 받는다
  sub.run('mgr_karl', 'ep-mgr', 1);             // 직원(학생표에 없음) → 안 받는다
  sub.run('', 'ep-empty', 1);                   // 빈 문자열 계정 → 안 받는다
  sub.run('ghost99', 'ep-ghost', 1);            // 학생표에도 직원표에도 없는 계정(학부모·옛 아이디) → 안 받는다
  for (const u of ['kid1', 'kid2', 'kid3', 'kid4', 'kid5', 'both']) db.prepare('INSERT INTO students_erp VALUES (?)').run(u);
  for (const u of ['admin', 'both', 'mgr_karl']) db.prepare('INSERT INTO admin_account VALUES (?)').run(u);
  const att = db.prepare('INSERT INTO attendance (room_id, user_id, account_uid, date) VALUES (?,?,?,?)');
  att.run('class-1-20261018', 'u_x8k2', 'kid2', '2026-10-18');   // 기기번호 + 계정
  att.run('c24-5011', 'kid3', null, '2026-10-18');               // 카페24 씨앗
  att.run('class-2-20261017', 'u_aa', 'kid4', '2026-10-17');     // 어제
  att.run('class-3-20261018', 'u_kid1', null, '2026-10-18');     // 기기번호만(계정 모름) — kid1 이 아님
  return db;
}
const d1 = (db) => ({ prepare: (sql) => ({ bind: (...a) => ({ all: async () => ({ results: db.prepare(sql).all(...a) }) }) }) });
if (M) {
  const db = mkDb();
  const r = await M.loadStreakTargets(d1(db), '2026-10-18');
  const eps = r.targets.map((t) => t.endpoint).sort();
  ok(r.error === null, '조회가 성공한다', r.error);
  ok(eps.includes('ep-kid1-a') && eps.includes('ep-kid1-b'), '오늘 안 온 학생은 받는다(기기 둘 다)', eps);
  ok(eps.includes('ep-kid4'), '«어제» 만 온 학생은 받는다(짝 — 날짜를 안 가리면 여기서 빠짐)', eps);
  ok(!eps.includes('ep-admin-pc'), '사장님(관리자 계정)에게는 안 보낸다', eps);
  ok(!eps.includes('ep-mgr') && !eps.includes('ep-both'), '직원 계정(학생표에 있어도)에게는 안 보낸다', eps);
  ok(!eps.includes('ep-null') && !eps.includes('ep-empty'), '계정이 빈 구독에는 안 보낸다', eps);
  ok(!eps.includes('ep-ghost'), '학생 계정이 아닌 구독에는 안 보낸다(학생표 확인)', eps);
  ok(!eps.includes('ep-kid2'), '오늘 화상수업에 온 학생(account_uid)은 안 받는다', eps);
  ok(!eps.includes('ep-kid3'), '오늘 카페24 예약이 있는 학생(user_id=계정)은 안 받는다', eps);
  ok(!eps.includes('ep-kid5'), '구독을 끈 학생은 안 받는다', eps);
  ok(eps.length === 3, '정확히 세 구독(kid1 ×2 · kid4)', eps);
  let r2; try { r2 = await M.loadStreakTargets({ prepare: () => { throw new Error('no such table: students_erp'); } }, '2026-10-18'); } catch (e) { r2 = { thrown: String(e && e.message || e) }; }
  ok(r2 && Array.isArray(r2.targets) && r2.targets.length === 0 && /no such table/.test(r2.error || ''), '조회가 실패하면 «아무에게도 안 보냄» + 사유', r2);
}

console.log('\n③ 배선 — sendDailyStreakPush 가 정본을 쓴다');
const FN = bodyOf(IDX, 'async function sendDailyStreakPush(');
ok(FN.length > 200, '전제: sendDailyStreakPush 몸통을 오려 냈다', FN.length);
ok(/import\s*\{[^}]*\bloadStreakTargets\b[^}]*\}\s*from\s*'\.\/daily-streak-targets'/.test(IDX), '정본 모듈을 import 한다');
const iLoad = FN.indexOf('loadStreakTargets(');
const iErrRet = FN.search(/if\s*\(\s*targetErr\s*\)\s*\{[^}]*return;/);
const iInsert = FN.indexOf('INSERT INTO push_queue');
ok(iLoad > 0 && iErrRet > iLoad && iInsert > iErrRet, '받을 사람을 정본으로 고르고, 실패하면 큐에 넣기 «전» 에 돌아간다', { iLoad, iErrRet, iInsert });
ok(/kstTodayYmd\(\)/.test(FN) && !/new Date\(\)\.toISOString\(\)\.slice\(0,\s*10\)/.test(FN), '날짜는 KST(정본) — UTC 로 다시 세지 않는다');
ok(!/FROM attendance WHERE date = \?/.test(FN) && !/FROM push_subscriptions WHERE enabled = 1 AND user_id IS NOT NULL`/.test(FN), '옛 «기기번호로 출석 판정·직원 포함» 조회가 되살아나지 않았다');
ok(/for\s*\(const t of targets\)/.test(FN), '정본이 고른 targets 로 큐를 채운다');

console.log('\n④ 학생 화면 구독 — 계정칸이 비지 않는다');
const m = PSW.match(/user_id:\s*(\(user && \([^)]*\)\) \|\| null)/);
ok(!!m, '전제: 구독 본문의 user_id 식을 찾았다');
if (m) {
  const f = new Function('user', 'return ' + m[1] + ';');
  ok(f({ uid: 'jeong', name: '정우영', role: 'student' }) === 'jeong', '로그인 정본 모양 {uid,…} 이면 계정이 실린다');
  ok(f({ user_id: 'lee' }) === 'lee', '옛 모양 {user_id} 도 그대로 받는다(짝)');
  ok(f({ uid: 'new', user_id: 'old' }) === 'new', '둘 다 있으면 새 모양(uid)이 이긴다');
  ok(f(null) === null && f({}) === null, '비로그인이면 계정을 지어내지 않는다(null)');
}
ok(/<script defer src="\/js\/idx-push-sw\.js\?v=\d+"><\/script>/.test(HTML), 'index.html 이 그 파일을 ?v= 로 싣는다');

console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`);
process.exit(FAIL ? 1 : 0);
