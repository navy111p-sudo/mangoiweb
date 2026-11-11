/* ══════════════════════════════════════════════════════════════════════
   🔔 관리자·매니저 «알림 종» — 강사 미입장 목록 + 확인(Confirmed)  (2026-11-11)

   [왜] 필리핀 매니저 건의 — 옛 LMS 상단 종(MESSAGES)처럼 «강사가 수업에 안 들어왔다» 를
        화면에서 보고 «확인» 을 남기고 싶다. 정본 기록 teacher_missing_alert 를 읽어 보여 준다.

   [지키는 것]
     A. 정본(src/notice-inbox.ts)을 «진짜 SQLite» 로 실제로 돌린다 — 테이블 스키마는 정본 CREATE 를 읽어 만든다
        (teachers·class_schedules 와 칸 이름이 겹쳐도 ambiguous 로 안 죽는가 · 7일 창 · 최신순 · 문장 · 폴백)
     B. 확인 — 처음 누른 사람이 남는다(짝: 두 번째 사람은 덮지 못한다) · 없는 방은 null · 미확인 수가 준다
     C. 누가 보나 — 판정 함수를 실제로 돌린다(본사·내부직원만 · 강사·지사·대리점·미로그인 막음)
     D. 배선 — 핸들러 블록을 오려 내 «가짜 actor» 로 실제로 실행(강사면 목록을 안 읽고 403 · 본사면 200)
        + 라우팅(index.ts·api-mango.ts 접두사)·지사 허용목록에 없음(=403) 을 소스에서 확인
     E. 화면 — admin.html 은 싣고, manager.html 은 «서버가 OK 일 때만» 싣는다(외부 리소스 계약) ·
        서버 글자는 textContent 로만 · 401/403 이면 멈춘다
   ══════════════════════════════════════════════════════════════════════ */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadTypescript, loadTsModule } from './helpers/handover-env.mjs';

let PASS = 0, FAIL = 0;
function check(name, cond) { if (cond) PASS++; else FAIL++; console.log(`  ${cond ? '✅' : '❌'} ${name}`); }
const rd = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const SRC = 'cloudflare-deploy/src/';

/* 중괄호 짝으로 블록을 자른다(주석·문자열 추적) */
function blockFrom(src, openIdx) {
  let depth = 0, inStr = null, inLine = false, inBlock = false;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (inLine) { if (c === '\n') inLine = false; continue; }
    if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i++; } continue; }
    if (inStr) { if (c === '\\') { i++; continue; } if (c === inStr) inStr = null; continue; }
    if (c === '/' && n === '/') { inLine = true; i++; continue; }
    if (c === '/' && n === '*') { inBlock = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(openIdx, i + 1); }
  }
  return '';
}

/* 메모리 SQLite 위의 D1 흉내 — prepare().bind().all/first/run · batch */
function d1(db) {
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    first: async () => db.prepare(sql).get(...args) ?? null,
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: r.changes } }; },
  });
  return { prepare: (sql) => stmt(sql), batch: async (list) => { for (const s of list) await s.run(); return []; } };
}

/* 정본 CREATE 를 읽어 스키마를 만든다(하니스에 베끼지 않는다) */
function freshDb({ withAlertTable = true } = {}) {
  const db = new DatabaseSync(':memory:');
  const core = rd(SRC + 'admin-teacher-core.ts');
  const i = core.indexOf('`CREATE TABLE IF NOT EXISTS teachers (`');
  const teachersDdl = core.slice(i, core.indexOf('].join', i)).match(/`([^`]*)`/g).map(s => s.slice(1, -1)).join(' ');
  const cs = rd(SRC + 'enroll-ops.ts').match(/`(CREATE TABLE IF NOT EXISTS class_schedules \([^`]*)`/)[1];
  db.exec(teachersDdl); db.exec(cs);
  if (withAlertTable) db.exec(rd(SRC + 'teacher-missing-alert.ts').match(/`(CREATE TABLE IF NOT EXISTS teacher_missing_alert [^`]*)`/)[1]);
  return db;
}

const ts = loadTypescript();
if (!ts) { console.log('⏭ SKIP typescript 없음'); process.exit(0); }
const M = loadTsModule(ts, SRC + 'notice-inbox.ts');
const NOW = Date.parse('2026-11-09T11:00:00Z');   // 2026-11-09 20:00 KST

console.log('\n🔔 알림 종 — 강사 미입장 목록 + 확인\n');
console.log('A. 목록(진짜 SQLite)');
{
  const raw = freshDb();
  raw.prepare(`INSERT INTO teachers (id, name, created_at, updated_at, status, user_id) VALUES (7, 'Teacher Win', 1, 1, 'office', 'u7')`).run();
  raw.prepare(`INSERT INTO class_schedules (id, user_id, student_name, start_time, teacher_id, status, created_at) VALUES (55, 'kim', '김은하', '17:30', '7', 'active', 1)`).run();
  const ins = raw.prepare(`INSERT INTO teacher_missing_alert (room_id, schedule_id, teacher_id, created_at, result) VALUES (?, ?, ?, ?, ?)`);
  ins.run('class-1-20261109', 1, '3', NOW - 3600000, JSON.stringify({ teacher: 'Teacher Hannah', student: '허은서', start: '19:00', status: 'owner_escalated' }));
  ins.run('class-55-20261109', 55, '7', NOW - 7200000, null);                                  // 기록 줄이 비면 원부·예약에서
  ins.run('class-9-20261101', 9, '3', NOW - 8 * 86400000, JSON.stringify({ teacher: 'Old' })); // 7일 밖
  const out = await M.listInbox(d1(raw), NOW);
  check('ok:true 와 7일 안의 2건만', out.ok === true && out.items.length === 2);
  check('최신순(19:00 건이 먼저)', out.items[0]?.id === 'class-1-20261109');
  check('한국어 문장 = LMS 모양', out.items[0]?.ko === 'Teacher Hannah 강사가 19:00(허은서) 수업에 입장하지 않았습니다.');
  check('영어 문장', out.items[0]?.en === 'Teacher Hannah did not join the 19:00 class (허은서).');
  check('결과 줄이 비면 원부 강사·예약 학생·시각으로 채운다(JOIN 이 실제로 돈다)',
    out.items[1]?.ko === 'Teacher Win 강사가 17:30(김은하) 수업에 입장하지 않았습니다.');
  check('«강사에게 안 닿음» 표시는 owner_escalated 일 때만(짝)', out.items[0].unreached === true && out.items[1].unreached === false);
  check('미확인 2건', out.unread === 2);

  console.log('\nB. 확인(Confirmed)');
  const a1 = await M.ackInbox(d1(raw), 'class-1-20261109', 'Mai', NOW);
  check('확인하면 누가·언제가 남는다', a1?.acked_by === 'Mai' && a1?.acked_at === NOW);
  const a2 = await M.ackInbox(d1(raw), 'class-1-20261109', 'Karl', NOW + 1000);
  check('(짝) 두 번째 사람은 덮지 못한다 — 처음 확인한 사람이 남는다', a2?.acked_by === 'Mai');
  check('없는 방은 null(아무 방 이름으로 행을 만들지 않는다)', (await M.ackInbox(d1(raw), 'class-x', 'Mai', NOW)) === null
    && raw.prepare(`SELECT COUNT(*) n FROM teacher_missing_ack`).get().n === 1);
  check('빈 id·너무 긴 id 는 null', (await M.ackInbox(d1(raw), '', 'Mai', NOW)) === null && (await M.ackInbox(d1(raw), 'x'.repeat(81), 'Mai', NOW)) === null);
  const after = await M.listInbox(d1(raw), NOW);
  check('목록에 «확인됨 · Mai» 가 실리고 미확인이 1건으로 준다', after.items[0].acked_by === 'Mai' && after.unread === 1 && !after.items[1].acked_by);
  check('원래 표(teacher_missing_alert)는 안 건드린다', raw.prepare(`SELECT COUNT(*) n FROM teacher_missing_alert`).get().n === 3);
}
{
  const M2 = loadTsModule(ts, SRC + 'notice-inbox.ts');      // 새 isolate 흉내(표 준비 플래그 초기화)
  const out = await M2.listInbox(d1(freshDb({ withAlertTable: false })), NOW);
  check('크론이 아직 한 번도 안 남겼어도(표 없음) 빈 목록으로 답한다', out.ok === true && out.items.length === 0 && out.unread === 0);
}

console.log('\nC. 누가 보나 — 판정 실제 실행');
const D = M.inboxDenied;
check('미로그인 → 401', D({ ok: false }) === 401 && D(null) === 401);
check('강사 → 403 (역할이 hq 로 잘못 잡혀도 isTeacher 면 막는다)', D({ ok: true, isTeacher: true, role: 'hq' }) === 403 && D({ ok: true, role: 'teacher' }) === 403);
check('지사·대리점·지사본사 → 403', ['branch', 'agency', 'franchise'].every(r => D({ ok: true, role: r }) === 403));
check('(짝) 본사·내부직원 → 통과', D({ ok: true, role: 'hq' }) === 0 && D({ ok: true, role: 'none' }) === 0 && D({ ok: true, role: 'staff' }) === 0);

console.log('\nD. 배선 — 핸들러 블록을 오려 내 실제로 실행');
{
  const sch = rd(SRC + 'api-admin-scheduling.ts');
  const at = sch.indexOf("if (path === '/api/admin/no-shows/inbox'");
  const blk = at > 0 ? blockFrom(sch, sch.indexOf('{', at)) : '';
  check('핸들러 블록을 찾았다(전제)', blk.length > 200);
  check('정본을 import 한다', /import \{ inboxDenied, listInbox, ackInbox \} from '\.\/notice-inbox';/.test(sch));
  const js = ts.transpileModule(`async function h(){${blk}}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const run = async (actor, method = 'GET', body = {}) => {
    const log = [];
    const fn = new Function('path', 'method', 'request', 'env', 'getAdminActor', 'inboxDenied', 'listInbox', 'ackInbox', 'json', 'forbiddenTeacherBody',
      js + '\nreturn h();');
    const res = await fn('/api/admin/no-shows/inbox', method, { json: async () => body }, { DB: {} },
      async () => actor, M.inboxDenied,
      async () => { log.push('list'); return { ok: true, items: [], unread: 0 }; },
      async (_db, id, who) => { log.push('ack:' + id + ':' + who); return { room_id: id, acked_by: who }; },
      (d, s = 200) => ({ d, s }), (a) => ({ ok: false, error: 'forbidden_teacher' }));
    return { res, log };
  };
  const tch = await run({ ok: true, isTeacher: true, role: 'teacher', username: 't1' });
  check('강사 → 403 이고 목록을 읽지 않는다', tch.res?.s === 403 && tch.log.length === 0);
  const ag = await run({ ok: true, role: 'agency', username: 'ag' }, 'POST', { id: 'class-1' });
  check('대리점 → 403 이고 확인도 안 적는다', ag.res?.s === 403 && ag.log.length === 0);
  const no = await run({ ok: false });
  check('미로그인 → 401', no.res?.s === 401 && no.log.length === 0);
  const hq = await run({ ok: true, role: 'hq', username: 'mgr_mai', name: 'Mai' });
  check('(짝) 본사 → 목록 200', hq.res?.s === 200 && hq.log[0] === 'list');
  const ack = await run({ ok: true, role: 'hq', username: 'mgr_mai', name: 'Mai' }, 'POST', { id: 'class-1' });
  check('(짝) 본사 POST → 확인을 «이름» 으로 적는다', ack.res?.s === 200 && ack.log[0] === 'ack:class-1:Mai');

  const idx = rd(SRC + 'index.ts'), mango = rd(SRC + 'api-mango.ts');
  check('라우팅 허용목록에 /api/admin/no-shows 접두사가 있다(index.ts 무변경)', /path\.startsWith\('\/api\/admin\/no-shows'\)/.test(idx));
  check('위임 가드에도 있다(api-mango.ts)', /path\.startsWith\('\/api\/admin\/no-shows'\)/.test(mango));
  const agencyFn = blockFrom(idx, idx.indexOf('{', idx.indexOf('function isAgencyAllowedApi(')));
  check('지사·대리점 허용목록에는 없다(index.ts 관문이 403)', agencyFn.length > 100 && !/no-shows/.test(agencyFn));
}

console.log('\nE. 화면');
{
  const bell = rd('cloudflare-deploy/public/js/notice-bell.js');
  const admin = rd('cloudflare-deploy/public/admin.html');
  const mgr = rd('cloudflare-deploy/public/manager.html');
  const v = (admin.match(/\/js\/notice-bell\.js\?v=(\d+)/) || [])[1];
  const bellCode = bell.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');   // 부정 검사는 주석을 벗긴 사본으로(자기 주석을 잡는 함정)
  check('admin.html 이 종을 싣는다', !!v && /<script src="\/js\/notice-bell\.js\?v=\d+" defer><\/script>/.test(admin));
  check('manager.html: 서버가 OK 일 때만 싣고 첫 응답을 넘긴다', /fetch\('\/api\/admin\/no-shows\/inbox'/.test(mgr)
    && /if\(!d\|\|d\.ok!==true\)return;window\.__noticeBellFirst=d;/.test(mgr) && new RegExp(`s\\.src='/js/notice-bell\\.js\\?v=${v}'`).test(mgr));
  check('(짝) manager.html: 정적 <script src> 를 늘리지 않는다', !/<script[^>]+src="\/js\/notice-bell/.test(mgr));
  const tpl = bell.match(/innerHTML\s*=/g) || [];
  check('innerHTML 은 정적 틀 한 번뿐 — 서버 글자는 textContent', tpl.length === 1 && /n\.textContent = txt/.test(bell));
  check('401·403 이면 멈춘다', /r\.status === 401 \|\| r\.status === 403\) \{ stop\(\)/.test(bell));
  check('Shadow DOM 으로 관리자 전역 버튼 규칙을 피한다', /attachShadow\(\{ mode: 'open' \}\)/.test(bell));
  check('body class·MutationObserver 를 쓰지 않는다', !/MutationObserver|body\.classList/.test(bellCode) && bellCode.length > 3000);
  check('같은 API 주소', /var API = '\/api\/admin\/no-shows\/inbox'/.test(bell));
}

console.log(`\n결과: PASS ${PASS} · FAIL ${FAIL}`);
if (FAIL) process.exit(1);
