#!/usr/bin/env node
/* 📅 매주 수업 → 날짜별 수업 나누기 (src/schedule-split.ts) — 2026-10-02
   정본을 «실제로» 돌린다: 순수 계획 함수 + 진짜 SQLite(D1 모양 래퍼)로 실행 함수.
   「나눈다」 옆에 «안 나눈다»(미러 행·이미 날짜 행·취소된 행·다른 시각의 수강신청)를 짝으로 둔다. */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.env.SPLIT_SRC || join(ROOT, 'cloudflare-deploy/src/schedule-split.ts');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };

let M;
try { M = await import(pathToFileURL(SRC).href + '?t=' + Date.now()); }
catch (e) { console.log('  ❌ 정본을 불러오지 못함: ' + e.message); console.log('결과: PASS 0 / FAIL 1'); process.exit(1); }
const { planScheduleSplit, runScheduleSplit, splitDowList } = M;

console.log('① 요일 표기 세 벌');
ok('숫자·영문·한글을 다 읽는다', JSON.stringify([splitDowList('3'), splitDowList('tue'), splitDowList('목'), splitDowList('Mon,Thu')]) === '[[3],[2],[4],[1,4]]');
ok('모르면 빈 배열', splitDowList('xyz').length === 0 && splitDowList('9').length === 0);

console.log('② 계획(순수 함수)');
const wk = { status: 'active', day_of_week: 'tue', start_time: '19:20', source: 'ai_enroll' };
const p12 = planScheduleSplit(wk, '2026-10-02', null);
ok('종료일 없으면 12주 = 화요일 12회', p12.ok && p12.dates.length === 12 && p12.until_source === 'default', p12);
ok('첫 날짜는 오늘 이후 첫 화요일', p12.dates[0] === '2026-10-06', p12.dates[0]);
ok('전부 화요일', p12.dates.every(d => new Date(d + 'T00:00:00Z').getUTCDay() === 2));
const pe = planScheduleSplit({ ...wk, day_of_week: '3', starts_on: '2026-09-28' }, '2026-10-02', '2026-10-28');
ok('수강 종료일까지(10/7·14·21·28)', pe.ok && pe.until_source === 'enrollment' && pe.dates.join() === '2026-10-07,2026-10-14,2026-10-21,2026-10-28', pe);
const pf = planScheduleSplit({ ...wk, starts_on: '2026-11-03' }, '2026-10-02', null);
ok('시작일이 미래면 시작일부터', pf.dates[0] === '2026-11-03', pf.dates[0]);
const pc = planScheduleSplit(wk, '2026-10-02', '2030-01-01');
ok('종료일이 아주 멀어도 26주에서 자른다', pc.dates.length <= 26 && pc.dates.length >= 25, pc.dates.length);
ok('오늘이 그 요일이면 오늘도 포함', planScheduleSplit({ ...wk, day_of_week: 'fri' }, '2026-10-02', null).dates[0] === '2026-10-02');
ok('카페24 미러 행은 안 나눈다', planScheduleSplit({ ...wk, source: 'c24-mirror' }, '2026-10-02', null).ok === false);
ok('이미 날짜가 있는 행은 안 나눈다', planScheduleSplit({ ...wk, scheduled_date: '2026-10-06' }, '2026-10-02', null).ok === false);
ok('취소된 행은 안 나눈다', planScheduleSplit({ ...wk, status: 'cancelled' }, '2026-10-02', null).ok === false);
ok('요일을 모르면 안 나눈다', planScheduleSplit({ ...wk, day_of_week: '' }, '2026-10-02', null).ok === false);

console.log('③ 실행(진짜 SQLite)');
function mkEnv() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE class_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, student_name TEXT, schedule_kind TEXT NOT NULL DEFAULT 'recurring', class_type TEXT NOT NULL DEFAULT 'regular', day_of_week TEXT, scheduled_date TEXT, start_time TEXT NOT NULL, duration_min INTEGER DEFAULT 20, teacher_id TEXT, status TEXT DEFAULT 'active', source TEXT, created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER, notes TEXT, starts_on TEXT);
    CREATE UNIQUE INDEX uq_sched_teacher_slot ON class_schedules(teacher_id, scheduled_date, start_time) WHERE status='active' AND scheduled_date IS NOT NULL AND teacher_id IS NOT NULL;
    CREATE TABLE enrollments (id INTEGER PRIMARY KEY, student_user_id TEXT, status TEXT, end_date TEXT, days_of_week TEXT, time TEXT);`);
  const wrap = (sql, args = []) => ({
    bind: (...a) => wrap(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
  });
  return { db, env: { DB: { prepare: (sql) => wrap(sql), batch: async (stmts) => { const out = []; for (const s of stmts) out.push(await s.run()); return out; } } } };
}
{
  const { db, env } = mkEnv();
  db.prepare(`INSERT INTO class_schedules (id,user_id,student_name,day_of_week,start_time,teacher_id,source,created_at,notes) VALUES (848,'jeong','정우영','tue','19:20','29','ai_enroll',1,'주4회')`).run();
  db.prepare(`INSERT INTO enrollments VALUES (103,'jeong','confirmed','2026-10-11','금','14:20')`).run();
  db.prepare(`INSERT INTO enrollments VALUES (104,'jeong','confirmed','2026-10-11','화','14:20')`).run();   // 같은 요일·다른 시각
  db.prepare(`INSERT INTO enrollments VALUES (105,'jeong','confirmed','2026-10-11','금','19:20')`).run();   // 같은 시각·다른 요일
  // 강사 29 가 10/13 19:20 에 이미 다른 학생 수업
  db.prepare(`INSERT INTO class_schedules (user_id,schedule_kind,scheduled_date,start_time,teacher_id,created_at) VALUES ('other','dated','2026-10-13','19:20','29',1)`).run();
  const dry = await runScheduleSplit(env, 848, { dry: true, actor: 't', today: '2026-10-02' });
  ok('미리보기는 아무것도 안 쓴다', dry.ok && db.prepare(`SELECT COUNT(*) n FROM class_schedules`).get().n === 2);
  ok('다른 시각의 수강신청 종료일(10/11)은 같은 요일·같은 시각 둘 다 맞아야 쓴다 → 12주', dry.plan.until_source === 'default' && dry.plan.dates.length === 12, dry.plan);
  const r = await runScheduleSplit(env, 848, { dry: false, actor: 't', today: '2026-10-02' });
  ok('11회 생성 + 강사 겹친 10/13 은 skipped 로 말한다', r.ok && r.made === 11 && r.skipped.join() === '2026-10-13', r);
  ok('원본은 지우지 않고 취소로 내린다', db.prepare(`SELECT status FROM class_schedules WHERE id=848`).get().status === 'cancelled');
  /* 💰 (2026-10-08) 원본 메모에 «나눈 날» — 급여가 그 날 이전 회차를 원래 id 로 계속 센다 */
  ok('원본 메모에 «날짜별로 나눔 @2026-10-02» 를 남긴다', /날짜별로 나눔 @2026-10-02/.test(db.prepare(`SELECT notes FROM class_schedules WHERE id=848`).get().notes || ''));
  const nr = db.prepare(`SELECT * FROM class_schedules WHERE user_id='jeong' AND scheduled_date IS NOT NULL ORDER BY scheduled_date`).all();
  ok('새 줄은 날짜·시각·강사·출처를 이어받는다', nr.length === 11 && nr.every(x => x.schedule_kind === 'dated' && x.start_time === '19:20' && x.teacher_id === '29' && x.source === 'ai_enroll' && x.status === 'active'));
  ok('새 줄 메모에 원본 번호', /#848/.test(nr[0].notes || ''));
  const again = await runScheduleSplit(env, 848, { dry: false, actor: 't', today: '2026-10-02' });
  ok('두 번 눌러도 다시 안 만든다(원본이 이미 취소)', again.ok === false && db.prepare(`SELECT COUNT(*) n FROM class_schedules WHERE user_id='jeong' AND status='active'`).get().n === 11);
}
{
  const { db, env } = mkEnv();
  db.prepare(`INSERT INTO class_schedules (id,user_id,day_of_week,start_time,teacher_id,source,created_at,starts_on) VALUES (3498,'yahee','3','20:00','9','admin_ui',1,'2026-09-28')`).run();
  db.prepare(`INSERT INTO enrollments VALUES (112,'yahee','confirmed','2026-10-28','수','20:00')`).run();
  db.prepare(`INSERT INTO enrollments VALUES (113,'yahee','confirmed','2026-10-28','금','20:00')`).run();
  db.prepare(`INSERT INTO class_schedules (user_id,schedule_kind,scheduled_date,start_time,teacher_id,created_at) VALUES ('yahee','dated','2026-10-14','20:00','9',1)`).run();
  const r = await runScheduleSplit(env, 3498, { dry: false, actor: 't', today: '2026-10-02' });
  ok('같은 시각·요일의 수강신청 종료일까지', r.plan.until === '2026-10-28' && r.plan.until_source === 'enrollment', r.plan);
  ok('이미 있는 그 학생의 날짜(10/14)는 건너뛰고 나머지 3회', r.ok && r.made === 3 && r.existing.join() === '2026-10-14' && r.skipped.length === 0, r);
}
{
  const { db, env } = mkEnv();
  db.prepare(`INSERT INTO class_schedules (id,user_id,day_of_week,start_time,teacher_id,source,created_at) VALUES (1,'a','tue','10:00','5','x',1)`).run();
  // 모든 날짜를 강사가 이미 막고 있으면 원본을 내리지 않는다
  for (const d of planScheduleSplit({ status: 'active', day_of_week: 'tue', start_time: '10:00' }, '2026-10-02', null).dates)
    db.prepare(`INSERT INTO class_schedules (user_id,schedule_kind,scheduled_date,start_time,teacher_id,created_at) VALUES ('z','dated',?,'10:00','5',1)`).run(d);
  const r = await runScheduleSplit(env, 1, { dry: false, actor: 't', today: '2026-10-02' });
  ok('하나도 못 만들면 원본(매주 줄)을 그대로 둔다', r.ok === false && db.prepare(`SELECT status FROM class_schedules WHERE id=1`).get().status === 'active', r);
}

console.log('④ 배선');
const api = readFileSync(join(ROOT, 'cloudflare-deploy/src/api-admin.ts'), 'utf8');
const i = api.indexOf("method === 'POST' && /^\\/api\\/admin\\/class-schedules\\/\\d+$/.test(path)");
ok('(전제) POST 라우트를 찾았다', i > 0);
const blk = api.slice(i, api.indexOf('\n    }\n', i));
ok('본사 전용 게이트가 실행보다 앞', blk.indexOf('enrollAdminHqOnly(') > 0 && blk.indexOf('enrollAdminHqOnly(') < blk.indexOf('runScheduleSplit('));
ok('dry_run 이 기본(false 일 때만 실행)', /dry_run\s*!==\s*false/.test(blk));
ok("action:'split' 이 아니면 거절", /action !== 'split'/.test(blk));
const html = readFileSync(join(ROOT, 'cloudflare-deploy/public/admin/student.html'), 'utf8');
ok('화면: 매주 줄에 «날짜별로 나누기» 버튼', (html.match(/data-mgsu-split=/g) || []).length >= 2);
ok('화면: 미리보기 뒤 확인을 받고 실행', /dry_run: dry/.test(html) && /call\(list\[i\], true\)/.test(html) && /confirm\(msg\)/.test(html) && /call\(list\[j\], false\)/.test(html));

/* 💰 (2026-10-08) 옛 방식(원본 메모에 @ 표시 없음)으로 이미 나뉜 줄 — 날짜 줄 메모로 «나눈 날» 을 되찾는다 */
{
  const { splitOriginsFromNotes, splitPastDay } = M;
  ok('전제 — 급여 복구 함수 두 개를 내보낸다', typeof splitOriginsFromNotes === 'function' && typeof splitPastDay === 'function');
  const t1002 = Date.parse('2026-10-02T10:00:00+09:00'), t1005 = Date.parse('2026-10-05T01:00:00+09:00');
  const kids = [
    { notes: '메모 · 매주 수업 #848 을 날짜별로 나눔', created_at: t1002 },     // 같은 원본을 두 번 → 이른 날
    { notes: '매주 수업 #848 을 날짜별로 나눔', created_at: t1005 },
    { notes: '매주 수업 #848 을 날짜별로 나눔', created_at: t1005 + 1 },
    { notes: '옛 메모 매주 수업 #12 · 매주 수업 #77 을 날짜별로 나눔', created_at: t1005 }, // 마지막 번호가 원본
    { notes: '아무 메모', created_at: t1002 },
  ];
  const og = splitOriginsFromNotes(kids);
  ok('옛 나누기: 날짜 줄 메모로 원본 id → 나눈 날(KST, 가장 이른 날)', og.get(848) === '2026-10-02' && og.get(77) === '2026-10-05' && !og.has(12) && og.size === 2, [...og]);
  const wk = (id, extra) => Object.assign({ id, status: 'cancelled', scheduled_date: null, notes: '' }, extra || {});
  ok('옛 나누기(원본에 @ 없음)도 날짜 줄 메모로 나눈 날을 준다', splitPastDay(wk(848), og) === '2026-10-02');
  ok('새 나누기: 원본 메모의 @날짜가 먼저', splitPastDay(wk(848, { notes: 'x · 날짜별로 나눔 @2026-10-08' }), og) === '2026-10-08');
  ok('짝 — 날짜 줄도 @ 도 없는 그냥 취소 줄은 null(되살리지 않음)', splitPastDay(wk(999), og) === null);
  ok('짝 — 살아 있는 줄·날짜 줄은 null', splitPastDay(wk(848, { status: 'active' }), og) === null && splitPastDay(wk(848, { scheduled_date: '2026-10-09' }), og) === null);
}

console.log('결과: PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
