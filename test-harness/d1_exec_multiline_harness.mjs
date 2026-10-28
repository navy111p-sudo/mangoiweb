#!/usr/bin/env node
// d1_exec_multiline_harness.mjs — 여러 줄 DB.exec 금지 + «운영처럼 줄마다 실행해도» 표가 생기는가 (2026-10-28)
//
// 왜: Cloudflare D1 의 exec() 는 입력을 «줄마다» 따로 실행한다(문서: 「queries separated by \n」).
//   그래서 `env.DB.exec(\`CREATE TABLE … (\n  …\n)\`)` 처럼 여러 줄로 쓴 CREATE 는 첫 줄에서
//   «incomplete input» 으로 죽는다. [잰 것 — 2026-10-28 운영 D1 SELECT] 그 방법으로만 만드는 표 6개
//   (lesson_reminder_delivery · teacher_room_presence · homework · intervention_logs ·
//    space_monster_hits · space_monster_results) 가 «전부» 없었다. 리마인더 문자는 발송 직전 이 표를
//   만들다 던져 9/20(#1044) 부터 한 건도 안 나갔고, 교사 접속 확인(#1733)은 기록이 0건이었다.
//   기존 하니스는 가짜 DB 가 node:sqlite exec 를 그대로 써서 여러 줄을 받아 줘 «원리상» 못 잡았다.
//
//   A. 정적 전수 — src/*.ts 에서 «여러 줄 문자열을 exec 에 넘기는» 자리를 주석·문자열 밖에서만 센다
//   B. 운영처럼 줄마다 실행하는 가짜(helpers/d1-exec-faithful.mjs)로 실제 함수를 돌린다
//   C. 고친 자리의 SQL 이 prepare() 로 넘어가고, 그 SQL 이 실제로 표를 만든다
//
// 📜 이 이름의 하니스는 2026-10-04(#1373, 일정 이동·연기 승인 503)에 처음 생겼는데 «두 파일만» FAIL 이고
//   나머지 자리는 «ℹ️ 사람 확인 대기» 로 이름만 찍었다 — 그 목록에 리마인더 장부가 있었는데 3주 넘게 아무도
//   안 고쳤다. 그래서 이번 판은 «전수 FAIL + 예외는 이유와 개수로» 로 바꿨다. ⛔ 다시 «이름만 찍기» 로 느슨하게
//   되돌리지 말 것 — 찍힌 이름은 아무도 안 읽는다.
//
// 실행: node test-harness/d1_exec_multiline_harness.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { d1ExecLikeProd } from './helpers/d1-exec-faithful.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.env.D1X_SRC || resolve(ROOT, 'cloudflare-deploy/src');
let PASS = 0, FAIL = 0;
function ok(name, cond, detail = '') {
  if (cond) { PASS++; console.log('  ✅ ' + name); }
  else { FAIL++; console.log('  ❌ FAIL ' + name + (detail ? '\n       ' + detail : '')); }
}

// ── 스캐너: 코드 상태에서만 `.exec(` 를 보고, 바로 뒤가 «줄바꿈을 품은» 템플릿 리터럴이면 기록 ──
//   주석·문자열·정규식 안의 글자는 건너뛴다(설명 주석에 예시를 적어도 거짓 FAIL 이 안 나게).
export function findMultilineExec(src) {
  const hits = [];
  const n = src.length;
  let i = 0, prevSig = '';
  const isRegexStart = () => !prevSig || /[(,=:[!&|?{};+\-*%~^<>]/.test(prevSig) || /\b(return|typeof|case|in|of|delete|void|throw|new)$/.test(prevSig);
  const readTemplate = (start) => {          // start = 여는 백틱 위치 → [끝 위치, 본문]
    let j = start + 1, body = '';
    while (j < n) {
      const c = src[j];
      if (c === '\\') { body += c + (src[j + 1] || ''); j += 2; continue; }
      if (c === '`') return [j, body];
      if (c === '$' && src[j + 1] === '{') {  // ${ … } — 안쪽 중괄호 짝만 맞춘다
        let d = 1; body += '${'; j += 2;
        while (j < n && d > 0) { if (src[j] === '{') d++; else if (src[j] === '}') d--; if (d > 0) body += src[j]; j++; }
        body += '}'; continue;
      }
      body += c; j++;
    }
    return [n, body];
  };
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { const e = src.indexOf('\n', i); i = e < 0 ? n : e; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === '\'' || c === '"') {
      let j = i + 1; while (j < n && src[j] !== c && src[j] !== '\n') { if (src[j] === '\\') j++; j++; }
      i = j + 1; prevSig = 'x'; continue;
    }
    if (c === '`') { const [e] = readTemplate(i); i = e + 1; prevSig = 'x'; continue; }
    if (c === '/' && isRegexStart()) {
      let j = i + 1, cls = false;
      while (j < n && src[j] !== '\n') { if (src[j] === '\\') { j += 2; continue; } if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false; else if (src[j] === '/' && !cls) break; j++; }
      i = j + 1; while (i < n && /[a-z]/i.test(src[i])) i++; prevSig = 'x'; continue;
    }
    if (c === '.' && src.startsWith('.exec(', i)) {
      let j = i + 6; while (j < n && /\s/.test(src[j])) j++;
      if (src[j] === '`') {
        const [e, body] = readTemplate(j);
        if (body.includes('\n')) {
          const line = src.slice(0, i).split('\n').length;
          const tables = [...body.matchAll(/CREATE\s+(?:UNIQUE\s+)?(?:TABLE|INDEX)\s+IF\s+NOT\s+EXISTS\s+([A-Za-z_][A-Za-z0-9_]*)/gi)].map(m => m[1]);
          hits.push({ line, tables, body });
        }
        i = e + 1; prevSig = 'x'; continue;
      }
    }
    if (!/\s/.test(c)) {
      if (/[A-Za-z0-9_$]/.test(c)) { let j = i; while (j < n && /[A-Za-z0-9_$]/.test(src[j])) j++; prevSig = src.slice(i, j); i = j; continue; }
      prevSig = c;
    }
    i++;
  }
  return hits;
}

// 예외 — «이미 있는 표» 를 만드는 자리라 운영에서는 아무 일도 안 하거나(try 로 감싸짐),
//   되살리면 «데이터를 바꾸기 시작하는» 자리라 일부러 죽은 채 둔다. 줄번호가 아니라 «파일|표» 로 센다.
const ALLOW = {
  'api-mango.ts|students_erp': { n: 3, why: '표는 카페24 동기화가 만든다. 둘은 try{} 로 감싸져 동작 영향 없음. POST /api/admin/students/erp(옛 단건 등록 — 화면 호출 0곳)는 되살리면 user_id 없는 옛 모양 행을 넣기 시작해 일부러 죽은 채 둔다. ⛔ 이 CREATE 들을 «맞춰» 고치지 말 것(운영 표엔 id 칸이 없다)' },
  'api-mango.ts|enrollments': { n: 1, why: '데모 시드 경로의 try{} 안 — 표는 이미 있다(동작 영향 없음)' },
};

console.log('\n══ A. 정적 전수 — 여러 줄 문자열을 exec 에 넘기는 자리 ══');
{
  // A-0 (전제) 스캐너가 «코드» 와 «주석·문자열» 을 실제로 가르는가 — 합성 입력으로
  const probe = [
    'await env.DB.exec(`CREATE TABLE IF NOT EXISTS t1 (\n a INTEGER\n)`);',          // 잡아야 함
    '// await env.DB.exec(`CREATE TABLE IF NOT EXISTS t2 (\n a\n)`);',               // 줄주석 — 첫 줄만 주석이라 다음 줄은 코드처럼 보이지만 백틱이 주석 안에서 열렸다
    '/* await env.DB.exec(`CREATE TABLE IF NOT EXISTS t3 (\n a\n)`); */',          // 블록주석
    "const s = 'x.exec(`';",                                                        // 문자열 안
    'await env.DB.exec(`CREATE TABLE IF NOT EXISTS t4 (a INTEGER)`);',             // 한 줄 — 안 잡음
    "await env.DB.exec(\n  'CREATE TABLE IF NOT EXISTS t5 (' +\n  'a INTEGER)');",   // + 이어붙이기 — 한 줄 결과
    'const re = /`/; await env.DB.exec(`CREATE TABLE IF NOT EXISTS t6 (\n b\n)`);', // 정규식 안 백틱 뒤의 진짜 호출
    'await db.prepare(`CREATE TABLE IF NOT EXISTS t7 (\n a\n)`).run();',            // prepare — 정상
  ].join('\n');
  const got = findMultilineExec(probe).flatMap(h => h.tables).sort().join(',');
  ok('A-0 (전제) 스캐너가 코드 속 여러 줄 exec 만 잡는다 (t1·t6 / 주석·문자열·한 줄·이어붙이기·prepare 는 안 잡음)', got === 't1,t6', '잡은 것: ' + got);

  const files = readdirSync(SRC).filter(f => f.endsWith('.ts')).sort();
  ok('A-1 (전제) src 의 .ts 를 읽었다', files.length > 100, 'files=' + files.length);
  const counts = {}; const unknown = [];
  for (const f of files) {
    for (const h of findMultilineExec(readFileSync(resolve(SRC, f), 'utf8'))) {
      const key = f + '|' + (h.tables[0] || '(표 없음)');
      counts[key] = (counts[key] || 0) + 1;
      if (!ALLOW[key]) unknown.push(f + ':' + h.line + ' ' + (h.tables.join(',') || h.body.slice(0, 60).replace(/\s+/g, ' ')));
    }
  }
  ok('A-2 여러 줄 문자열을 DB.exec 에 넘기는 새 자리가 없다 (D1 은 줄마다 실행 → 그 CREATE 는 운영에서 한 번도 안 돈다. prepare(...).run() 이나 한 줄로)',
    unknown.length === 0, unknown.join('\n       '));
  for (const [key, a] of Object.entries(ALLOW)) {
    ok(`A-3 예외 «${key}» 는 정확히 ${a.n}곳 (늘면 새 결함, 줄면 낡은 예외 — 목록을 고칠 것)`, (counts[key] || 0) === a.n, `실제 ${counts[key] || 0}곳 · 이유: ${a.why}`);
  }
  // A-4 (2026-10-28 고친 자리) — 다시 exec 로 되돌아가면 A-2 가 잡지만, «그 표를 prepare 로 만든다» 를 이름으로도 못 박는다
  // (2026-10-04 #1373 이 먼저 고친 두 표 — 그때 하니스는 «이 두 파일만» FAIL 이고 나머지는 이름만 찍었다.
  //  그 «이름만 찍힌» 자리에 리마인더 장부가 있었고 아무도 안 고쳐 9/20 부터 문자가 멈춰 있었다.)
  const FIXED = [
    ['class-schedule-move.ts', 'schedule_move_guard'],
    ['schedule-request-atomic.ts', 'schedule_request_guard'],
    ['lesson-reminder-delivery.ts', 'lesson_reminder_delivery'],
    ['teacher-room-presence.ts', 'teacher_room_presence'],
    ['teacher-room-presence.ts', 'idx_teacher_room_presence_account_seen'],
    ['api-lessons.ts', 'homework'],
    ['ai-command.ts', 'intervention_logs'],
    ['ai-billing.ts', 'payment_orders'],
    ['api-space-monster.ts', 'space_monster_hits'],
    ['api-space-monster.ts', 'space_monster_results'],
  ];
  for (const [f, t] of FIXED) {
    const s = readFileSync(resolve(SRC, f), 'utf8');
    const at = s.search(new RegExp('CREATE\\s+(?:UNIQUE\\s+)?(?:TABLE|INDEX)\\s+IF\\s+NOT\\s+EXISTS\\s+' + t + '\\b'));
    const tick = at < 0 ? -1 : s.lastIndexOf('`', at);
    const before = tick < 0 ? '' : s.slice(Math.max(0, tick - 40), tick);
    ok(`A-4 ${f} 의 «${t}» 는 prepare() 로 만든다`, at >= 0 && /\.prepare\(\s*$/.test(before), at < 0 ? '그 CREATE 를 못 찾음' : '앞: …' + before.replace(/\s+/g, ' '));
  }
}

console.log('\n══ B. 운영처럼 «줄마다» 실행하는 가짜로 실제 함수를 돌린다 ══');
// 실제 TS 를 타입만 벗겨 data: 로 import — 상대 import 는 globalThis.__D1X 의 대역으로 돌린다.
async function loadModule(name, stubs) {
  let code = stripTypeScriptTypes(readFileSync(resolve(SRC, name + '.ts'), 'utf8'));
  code = code.replace(/import\s*\{([^}]*)\}\s*from\s*'\.\/([\w-]+)';?/g, (_m, names, mod) =>
    `const {${names.replace(/\s+as\s+/g, ': ')}} = globalThis.__D1X[${JSON.stringify(mod)}];`);
  ok(`B-(전제) ${name}.ts 에 남은 상대 import 가 없다`, !/from\s*'\.\//.test(code));
  globalThis.__D1X = stubs;
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64') + '#' + name + Date.now());
}
function dbOf(raw) {
  return {
    exec: d1ExecLikeProd(raw),
    prepare(sql) {
      let params = [];
      const st = {
        bind(...p) { params = p; return st; },
        async first() { return raw.prepare(sql).get(...params) || null; },
        async all() { return { results: raw.prepare(sql).all(...params) }; },
        async run() { const r = raw.prepare(sql).run(...params); return { meta: { changes: Number(r.changes) } }; },
      };
      return st;
    },
  };
}
const has = (raw, type, name) => !!raw.prepare(`SELECT 1 FROM sqlite_master WHERE type=? AND name=?`).get(type, name);
{
  // B-0 (전제) 가짜가 운영과 같은 사고를 «재현» 하는가 — 이게 없으면 아래 검사가 헛돈다
  const raw = new DatabaseSync(':memory:'); const db = dbOf(raw);
  let threw = false;
  try { await db.exec(`CREATE TABLE IF NOT EXISTS x (\n a INTEGER\n)`); } catch { threw = true; }
  ok('B-0 (전제) 여러 줄 CREATE 를 exec 로 넘기면 던지고 표가 안 생긴다 (운영 증상 재현)', threw && !has(raw, 'table', 'x'));
  let e1 = '';   // 세미콜론 없이 줄로만 나눈 두 문장 — 운영(줄마다 실행)에서는 둘 다 돈다
  try { await db.exec(`CREATE TABLE IF NOT EXISTS y (a INTEGER)\nCREATE INDEX IF NOT EXISTS iy ON y(a)`); } catch (e) { e1 = String(e?.message || e); }
  ok('B-1 (짝) 한 줄짜리 문장들은 exec 로도 생긴다', !e1 && has(raw, 'table', 'y') && has(raw, 'index', 'iy'), e1);

  // B-2 수업 전 리마인더 발송 장부
  const lrd = await loadModule('lesson-reminder-delivery', { 'solapi-client': { getSolapiMode: () => 'mock', sendPlainSms: async () => ({ ok: true }) } });
  const raw2 = new DatabaseSync(':memory:');
  let err2 = '';
  try { await lrd.ensureLessonReminderDeliveryTable({ DB: dbOf(raw2) }); } catch (e) { err2 = String(e?.message || e); }
  ok('B-2 리마인더 발송 장부(lesson_reminder_delivery)가 운영처럼 실행해도 생긴다', !err2 && has(raw2, 'table', 'lesson_reminder_delivery'), err2);
  let dup = false;
  try {
    raw2.prepare(`INSERT INTO lesson_reminder_delivery (room_id,recipient,phone_hash,status,attempted_at) VALUES ('r','parent','h','pending',1)`).run();
    raw2.prepare(`INSERT INTO lesson_reminder_delivery (room_id,recipient,phone_hash,status,attempted_at) VALUES ('r','student','h','pending',1)`).run();
  } catch { dup = true; }
  ok('B-2b (짝) 그 표의 «같은 수업·같은 번호» 중복 막이(UNIQUE)가 그대로 있다', dup);

  // B-3·B-4 교사 접속 기록
  let actor = { ok: true, isTeacher: true, username: 'hq_t_fixture' };
  const trp = await loadModule('teacher-room-presence', {
    'auth-admin': { getAdminActor: async () => actor },
    'd1-chunk': { selectInChunks: async (db, vals, mk) => (await db.prepare(mk(vals.map(() => '?').join(','))).bind(...vals).all()).results },
  });
  const raw3 = new DatabaseSync(':memory:'); const env3 = { DB: dbOf(raw3) };
  let err3 = '';
  try { await trp.ensureTeacherRoomPresence(env3.DB); } catch (e) { err3 = String(e?.message || e); }
  ok('B-3 교사 접속 기록 표와 인덱스가 운영처럼 실행해도 생긴다', !err3 && has(raw3, 'table', 'teacher_room_presence') && has(raw3, 'index', 'idx_teacher_room_presence_account_seen'), err3);
  const req = new Request('https://mangoi.ai/api/attendance/join');
  await trp.recordTeacherRoomPresence(env3, req, { room_id: 'class-1-20261028', user_id: 'peer1' }, 'join');
  const n3 = raw3.prepare('SELECT COUNT(*) n FROM teacher_room_presence').get().n;
  ok('B-4 교사가 입장하면 접속 기록이 실제로 한 줄 남는다 (예전엔 표가 없어 0줄)', n3 === 1, 'rows=' + n3);
  actor = { ok: true, isTeacher: false, username: 'student_fixture' };
  await trp.recordTeacherRoomPresence(env3, req, { room_id: 'class-1-20261028', user_id: 'peer2' }, 'join');
  ok('B-4b (짝) 강사가 아닌 사람은 기록하지 않는다', raw3.prepare('SELECT COUNT(*) n FROM teacher_room_presence').get().n === 1);
}

console.log('\n══ C. 고친 자리의 SQL 이 실제로 표를 만든다 (핸들러 안이라 함수 대신 SQL 을 오려 내 돌린다) ══');
{
  const CUT = [
    ['api-lessons.ts', 'homework'],
    ['ai-command.ts', 'intervention_logs'],
    ['ai-billing.ts', 'payment_orders'],
    ['api-space-monster.ts', 'space_monster_hits'],
    ['api-space-monster.ts', 'space_monster_results'],
  ];
  for (const [f, t] of CUT) {
    const s = readFileSync(resolve(SRC, f), 'utf8');
    const at = s.search(new RegExp('CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+' + t + '\\b'));
    const a = at < 0 ? -1 : s.lastIndexOf('`', at), b = a < 0 ? -1 : s.indexOf('`', at);
    const sql = a >= 0 && b > a ? s.slice(a + 1, b) : '';
    const raw = new DatabaseSync(':memory:');
    let e = '';
    try { await dbOf(raw).prepare(sql).run(); } catch (x) { e = String(x?.message || x); }
    ok(`C ${f} 의 «${t}» SQL 로 표가 생긴다`, !!sql && !e && has(raw, 'table', t), e || (sql ? '' : 'SQL 을 못 오려 냄'));
  }
}

console.log('\n════════════════════════════════════════');
console.log(`  결과: PASS ${PASS} / FAIL ${FAIL}`);
console.log('════════════════════════════════════════');
process.exit(FAIL ? 1 : 0);
