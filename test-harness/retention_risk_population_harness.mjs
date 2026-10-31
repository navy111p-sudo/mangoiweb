// 🚨 이탈 위험 스캔(10가지 신호) — «누구를 보는가» 와 «출석을 무엇으로 세는가» (2026-10-13 케어 보드 1단계)
//
// 정본: cloudflare-deploy/src/api-admin.ts 의 GET /api/admin/retention/risk 핸들러.
// 그 블록을 소스에서 «중괄호 짝» 으로 오려 타입만 벗기고, 진짜 SQLite(가짜 D1 껍데기)에 물려 «실제로» 돌린다.
//
// 고친 것 두 가지(+ 곁가지 하나)를 짝으로 본다:
//   ① 명부에서 «정렬 없이 아무 500명» 만 보던 것 → 최근 90일 흔적·이탈 스냅샷이 있는 학생만, 조용한 순
//      짝: 흔적 없는 학생(이미 떠남)·비활성 학생은 «안» 본다 / 상한을 넘으면 truncated 로 말한다
//   ② 출석을 attendance.user_id(실접속에선 기기번호)로 세던 것 → 계정(account_uid) + 카페24 씨앗(user_id) 둘 다
//      짝: 카페24 씨앗만 있는 학생도 «그대로» 세어진다(account_uid 만 보게 바꾸는 변이 방지)
//   ③ «지금 이후» 예약 씨앗은 출석이 아니다 / 기록이 아예 없으면 «999일 전» 이라 지어내지 않는다
//
// 실행: node test-harness/retention_risk_population_harness.mjs
//       RISK_SRC=<다른 api-admin.ts 경로> 로 변이 사본을 가리킬 수 있다(저장소 파일을 고치지 않고 변이시험).
process.env.TZ = 'Asia/Seoul';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
let DatabaseSync;
try { ({ DatabaseSync } = await import('node:sqlite')); }
catch { console.log('⏭  건너뜀 — 이 node 에는 node:sqlite 가 없습니다(Node 22+ 필요)'); process.exit(0); }

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'cloudflare-deploy/src');
const rd = (p) => readFileSync(p, 'utf8');
let PASS = 0, FAIL = 0;
const ok = (c, m, extra) => { if (c) { PASS++; console.log('  ✅ ' + m); } else { FAIL++; console.log('  ❌ FAIL ' + m + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); } };
const done = () => { console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`); process.exit(FAIL ? 1 : 0); };

/* ── 정본 불러오기 ─────────────────────────────────────────────────────────── */
const importTs = async (file) => import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(rd(resolve(SRC, file)))).toString('base64'));
const ATT = await importTs('attendance-uid.ts');
const CHUNK = await importTs('d1-chunk.ts');
// 📞 (2026-10-13 2단계) 핸들러가 «마지막 연락» 을 붙이므로 정본 care-contact 도 함께 물린다(forecast-dashboard 를 먼저 풀어 끼움)
const _toUrl = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const _FD_URL = _toUrl(stripTypeScriptTypes(rd(resolve(SRC, 'forecast-dashboard.ts'))));
const CC = await import(_toUrl(stripTypeScriptTypes(rd(resolve(SRC, 'care-contact.ts'))).replace(`'./forecast-dashboard'`, JSON.stringify(_FD_URL))));

const adminSrc = rd(process.env.RISK_SRC || resolve(SRC, 'api-admin.ts'));
const ANCHOR = "if (method === 'GET' && path === '/api/admin/retention/risk') {";
const at = adminSrc.indexOf(ANCHOR);
let block = '';
if (at >= 0) {
  // 중괄호 짝 — 문자열·템플릿·주석을 건너뛰며 센다(길이로 자르지 않는다)
  let i = at + ANCHOR.length - 1, depth = 0, q = null;
  for (; i < adminSrc.length; i++) {
    const c = adminSrc[i], n = adminSrc[i + 1];
    if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
    if (c === '/' && n === '/') { i = adminSrc.indexOf('\n', i); continue; }
    if (c === '/' && n === '*') { i = adminSrc.indexOf('*/', i + 2) + 1; continue; }
    if (c === "'" || c === '"' || c === '`') { q = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) break; }
  }
  block = adminSrc.slice(at, i + 1);
}
ok(block.length > 2000 && /retention\/risk/.test(block), '전제: 핸들러 블록을 오려 냈다', block.length);

let run = null;
try {
  const wrapped = `export async function run(env, request, method, path, H) {
    const { json, studentScopeWhere, selectInChunks, today, ensureAttendanceAccountUid,
            ATTENDANCE_ACCOUNT_KEY, ATTENDANCE_BY_UID_LIST, attUidListBinds, lastContacts } = H;
    ${block}
    return null;
  }`;
  const js = stripTypeScriptTypes(wrapped);
  ({ run } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64')));
} catch (e) { console.log('  (블록 컴파일 실패) ' + e.message); }
ok(typeof run === 'function', '전제: 블록을 타입 제거로 실행할 수 있다');
if (!run) done();

/* ── 가짜 D1 (진짜 SQLite) ─────────────────────────────────────────────────── */
const DAY = 86400000, NOW = Date.now();
const ymd = (ms) => new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10);
function mkEnv() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE students_erp (user_id TEXT PRIMARY KEY, korean_name TEXT, student_name TEXT, parent_phone TEXT, parent_name TEXT, status TEXT);
           CREATE TABLE attendance (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT, user_id TEXT, account_uid TEXT, username TEXT, role TEXT, joined_at INTEGER, left_at INTEGER, status TEXT, date TEXT);
           CREATE TABLE student_retention (user_id TEXT PRIMARY KEY, category TEXT, contacted INTEGER DEFAULT 0, contacted_at INTEGER);
           CREATE TABLE student_evaluations (id INTEGER PRIMARY KEY, student_uid TEXT, score_overall REAL, created_at INTEGER);
           CREATE TABLE homework_submissions (id INTEGER PRIMARY KEY, user_id TEXT, status TEXT, created_at INTEGER);
           CREATE TABLE point_log (id INTEGER PRIMARY KEY, user_id TEXT, created_at INTEGER);`);
  const stmt = (sql, args) => {
    const st = db.prepare(sql);
    return { all: async () => ({ results: st.all(...args) }), first: async () => st.get(...args) ?? null, run: async () => st.run(...args) };
  };
  const D1 = {
    prepare: (sql) => Object.assign(stmt(sql, []), { bind: (...a) => stmt(sql, a) }),
    exec: async (sql) => { db.exec(sql); },
  };
  return { db, env: { DB: D1, SESSION_STATE: { get: async () => null, put: async () => {} } } };
}
const H = {
  json: (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } }),
  studentScopeWhere: async () => ({ cond: '', binds: [], scope: { type: 'hq' } }),
  selectInChunks: CHUNK.selectInChunks,
  today: () => ymd(NOW),
  ensureAttendanceAccountUid: async () => {},
  ATTENDANCE_ACCOUNT_KEY: ATT.ATTENDANCE_ACCOUNT_KEY,
  ATTENDANCE_BY_UID_LIST: ATT.ATTENDANCE_BY_UID_LIST,
  attUidListBinds: ATT.attUidListBinds,
  lastContacts: CC.lastContacts,
};
async function call(env) {
  try {
    const res = await run(env, new Request('https://x/api/admin/retention/risk'), 'GET', '/api/admin/retention/risk', H);
    return res ? await res.json() : null;
  } catch (e) { return { __crash: e.message }; }
}
const addAtt = (db, { uid, acc = null, daysAgo, status = 'present', room = 'class-1' }) => {
  const t = NOW - daysAgo * DAY;
  db.prepare(`INSERT INTO attendance (room_id,user_id,account_uid,role,joined_at,status,date) VALUES (?,?,?,?,?,?,?)`)
    .run(room, uid, acc, 'student', t, status, ymd(t));
};

/* ── 시나리오 1 ───────────────────────────────────────────────────────────── */
console.log('\n① 누구를 보는가 — «아무 500명» 이 아니라 «최근 90일 흔적이 있는 학생»');
const S1 = mkEnv(); const db = S1.db;
const ins = db.prepare(`INSERT INTO students_erp (user_id, korean_name, status) VALUES (?,?,?)`);
// 흔적이 전혀 없는 학생 600명을 «먼저» 넣는다 — 옛 코드(LIMIT 500, 정렬 없음)는 rowid 순이라 이들만 고른다
for (let k = 1; k <= 600; k++) ins.run('d' + String(k).padStart(3, '0'), '휴면' + k, 'active');
ins.run('jeong', '정우영', 'active');       // 실접속만(기기번호 + account_uid)
ins.run('kim', '김카페', 'active');         // 카페24 씨앗만(user_id = 계정, account_uid 없음)
ins.run('gone', '떠난학생', 'active');      // 200일 전 기록뿐
ins.run('exp', '만료학생', 'active');       // 이탈 스냅샷에만
ins.run('off', '비활성', 'inactive');       // 최근 출석이 있어도 비활성
ins.run('streak2', '진짜결석', 'active');   // 씨앗 결석 3회 연속
ins.run('mixed', '섞인학생', 'active');     // 씨앗 결석 뒤 실접속 출석 → 연속 결석 0
ins.run('mix2', '섞인학생2', 'active');     // 실접속 출석 «뒤» 씨앗 결석 3회 → 연속 결석 3 (묶음 기준을 user_id 로 되돌리면 0 이 된다)
// jeong: 30~60일 전 실접속 2회, 최근 30일 0회
addAtt(db, { uid: 'u_dev1', acc: 'jeong', daysAgo: 40 });
addAtt(db, { uid: 'u_dev2', acc: 'jeong', daysAgo: 35 });
// kim: 최근 씨앗 출석 2회 + «미래» 예약 씨앗 1건
addAtt(db, { uid: 'kim', daysAgo: 3, room: 'c24-1' });
addAtt(db, { uid: 'kim', daysAgo: 10, room: 'c24-2' });
addAtt(db, { uid: 'kim', daysAgo: -5, status: 'scheduled', room: 'c24-3' });
addAtt(db, { uid: 'gone', daysAgo: 200 });
db.prepare(`INSERT INTO student_retention (user_id, category) VALUES ('exp','expired')`).run();
addAtt(db, { uid: 'u_off', acc: 'off', daysAgo: 5 });
for (const d of [6, 4, 2]) addAtt(db, { uid: 'streak2', daysAgo: d, status: 'scheduled', room: 'c24-s' });
addAtt(db, { uid: 'mixed', daysAgo: 6, status: 'scheduled', room: 'c24-m' });
addAtt(db, { uid: 'mixed', daysAgo: 4, status: 'scheduled', room: 'c24-m' });
addAtt(db, { uid: 'u_dev9', acc: 'mixed', daysAgo: 1 });
addAtt(db, { uid: 'u_dev7', acc: 'mix2', daysAgo: 10 });
for (const d of [6, 4, 2]) addAtt(db, { uid: 'mix2', daysAgo: d, status: 'scheduled', room: 'c24-x' });

const r1 = await call(S1.env);
ok(r1 && r1.last_contact_ok === true && Array.isArray(r1.at_risk) && r1.at_risk.every(x => 'last_contact' in x),
  '(2단계) 목록마다 «마지막 연락» 칸이 붙는다(연락 기록 표가 없어도 null 로)', r1 && r1.last_contact_ok);
ok(r1 && r1.ok === true, '응답 ok', r1);
const by = Object.fromEntries(((r1 && r1.at_risk) || []).map(x => [x.user_id, x]));
const sc = (r1 && r1.scan) || {};
ok(sc.active_total === 607, 'scan.active_total = 명부 활성 학생 수(607 — 비활성 off 는 뺀다)', sc);
ok(sc.candidates === 6, 'scan.candidates = 흔적·스냅샷이 있는 활성 학생 6명 (jeong·kim·exp·streak2·mixed·mix2)', sc);
ok(sc.scanned === sc.candidates && sc.truncated === false, '상한 안이면 truncated=false', sc);
ok(!!by.jeong, '흔적 없는 600명을 먼저 넣어도 실제 학생(jeong)이 목록에 나온다 — «아무 500명» 이 아님');
ok(!Object.keys(by).some(k => /^d\d{3}$/.test(k)), '(짝) 흔적 없는 휴면 학생은 위험 목록에 «안» 나온다 — 90일 기록 없음');
ok(!by.gone, '(짝) 90일 넘게 기록이 없는 학생은 안 본다');
ok(!by.off, '(짝) 비활성 학생은 최근 출석이 있어도 안 본다');
ok(!!by.exp, '이탈 스냅샷(만료)에만 있는 학생은 출석이 없어도 본다');

console.log('\n② 출석을 «계정» 으로 센다 — 실접속(account_uid) + 카페24 씨앗(user_id) 둘 다');
ok(by.jeong && by.jeong.attendance_30to60d === 2, 'jeong: 기기번호로 들어온 실접속 2회가 «계정» 으로 잡힌다', by.jeong && by.jeong.attendance_30to60d);
ok(by.jeong && by.jeong.days_since_last_join === 35, 'jeong: 마지막 입장 35일 전 (기기번호로 셌으면 «기록 없음»)', by.jeong && by.jeong.days_since_last_join);
// kim 은 최근 3일 전 출석 → 위험 점수가 낮아 목록에 안 나올 수 있다. 그래서 «안 나온다» 가 곧 «씨앗을 셌다» 의 증거.
ok(!by.kim || by.kim.attendance_30d === 2, '(짝) 카페24 씨앗만 있는 학생(kim)도 그대로 세어진다 — 위험 목록에 «출석 0» 으로 안 뜬다', by.kim);
ok(!by.kim, 'kim(3일 전 출석)은 위험 목록에 없다');

console.log('\n③ 미래 예약·기록 없음');
// kim 이 목록에 없으므로 별도로 확인: 미래 씨앗만 있는 학생
const S3 = mkEnv();
S3.db.prepare(`INSERT INTO students_erp (user_id, korean_name, status) VALUES ('fut','미래만','active'),('none','스냅샷만','active')`).run();
addAtt(S3.db, { uid: 'fut', daysAgo: 25 });
addAtt(S3.db, { uid: 'fut', daysAgo: -3, status: 'scheduled', room: 'c24-f' });
S3.db.prepare(`INSERT INTO student_retention (user_id, category) VALUES ('none','inactive')`).run();
const r3 = await call(S3.env);
const by3 = Object.fromEntries(((r3 && r3.at_risk) || []).map(x => [x.user_id, x]));
ok(by3.fut && by3.fut.days_since_last_join === 25, '«지금 이후» 예약 씨앗은 마지막 입장으로 안 친다 (25일 전, 음수 아님)', by3.fut && by3.fut.days_since_last_join);
ok(by3.fut && by3.fut.attendance_30d === 1, '«지금 이후» 예약 씨앗은 30일 출석에도 안 센다', by3.fut && by3.fut.attendance_30d);
ok(by3.none && by3.none.reasons.includes('📵 출석 기록 없음'), '기록이 아예 없으면 «출석 기록 없음» 이라고 쓴다', by3.none && by3.none.reasons);
ok(by3.none && !by3.none.reasons.some(s => /999일/.test(s)), '(짝) «999일 전» 이라고 지어내지 않는다');

console.log('\n④ 연속 결석도 계정으로 묶어 센다');
ok(by.streak2 && by.streak2.absent_streak === 3 && by.streak2.risk_level === 'high', '씨앗 결석 3회 연속 → 연속 결석 3 · 심각', by.streak2 && [by.streak2.absent_streak, by.streak2.risk_level]);
ok(by.mix2 && by.mix2.absent_streak === 3, '실접속 출석 «뒤» 씨앗 결석 3회 → 한 학생의 연속 결석 3 (기기번호·씨앗이 한 줄로 이어진다)', by.mix2 && by.mix2.absent_streak);
ok(!by.mixed || by.mixed.absent_streak === 0, '(짝) 씨앗 결석 뒤 실접속 출석이 있으면 연속 결석이 끊긴다', by.mixed && by.mixed.absent_streak);

console.log('\n⑤ 상한 — 넘으면 «가장 조용한 학생부터» 보고 truncated 로 말한다');
const S5 = mkEnv();
const ins5 = S5.db.prepare(`INSERT INTO students_erp (user_id, korean_name, status) VALUES (?,?,?)`);
const att5 = S5.db.prepare(`INSERT INTO attendance (room_id,user_id,account_uid,role,joined_at,status,date) VALUES ('c',?,?, 'student', ?, 'present', ?)`);
for (let k = 0; k < 1010; k++) {
  const id = 'q' + k; ins5.run(id, '학생' + k, 'active');
  const t = NOW - (1 + (k % 80)) * DAY;     // 1~80일 전
  att5.run('u' + k, id, t, ymd(t));
}
const r5 = await call(S5.env);
const s5 = (r5 && r5.scan) || {};
ok(s5.candidates === 1010 && s5.scanned < s5.candidates && s5.truncated === true, '상한을 넘으면 scanned < candidates · truncated=true', s5);
const scannedIds = new Set(((r5 && r5.at_risk) || []).map(x => x.user_id));
ok(scannedIds.has('q79'), '가장 조용한 학생(80일 전)은 상한 안에 들어온다');
ok(r5 && !r5.__crash, '크래시 없음', r5 && r5.__crash);

console.log('\n⑥ 배선 — 화면이 scan 을 말하는가');
const q1 = rd(resolve(ROOT, 'cloudflare-deploy/public/js/adm-q1.js'));
const arr = q1.slice(q1.indexOf('window.arrLoad'), q1.indexOf('window.arrLoad') + 6000);
ok(/d\.scan/.test(arr) && /scanLine/.test(arr), 'arrLoad 가 서버의 scan 을 읽어 안내 줄을 그린다');
ok((arr.match(/scanLine \+/g) || []).length >= 2, '위험 학생이 있을 때·없을 때 모두 그 줄을 붙인다');
ok(/_sc \? /.test(arr), '(짝) scan 이 없으면(옛 서버) 그 줄을 지어내지 않는다');
const html = rd(resolve(ROOT, 'cloudflare-deploy/public/admin.html'));
ok(/\/js\/adm-q1\.js\?v=\d+/.test(html), 'admin.html 이 adm-q1.js 를 ?v= 로 부른다');

console.log('\n⑦ 되돌리기 방지 (주석을 벗긴 사본)');
const noCmt = block.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
ok(!/FROM students_erp WHERE \(status[^`]*LIMIT 500/.test(noCmt), '«정렬 없는 LIMIT 500» 으로 되돌아가지 않았다');
ok(!/FROM attendance WHERE user_id IN \(\$\{ph\}\)/.test(noCmt), '출석을 user_id IN (…) 로만 세는 옛 모양이 없다');
done();
