#!/usr/bin/env node
/* ⏸ 연기보강 (src/end-makeup.ts) — 2026-10-02 사장님 제안
   「월수금 수업에서 금요일을 연기하면 수업 끝(11/1 월) 다음 수업일(11/3 수)에 «연기보강 (10월 2일 연기)»」
   정본을 실제로 돌리고(순수 함수 + 진짜 SQLite), 서버·화면 배선을 본다. */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.env.EM_SRC || join(ROOT, 'cloudflare-deploy/src/end-makeup.ts');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };

let M;
try { M = await import(pathToFileURL(SRC).href + '?t=' + Date.now()); }
catch (e) { console.log('  ❌ 정본을 불러오지 못함: ' + e.message); console.log('결과: PASS 0 / FAIL 1'); process.exit(1); }
const { nextEndMakeupDate, endMakeupLabel, planEndMakeup, END_MAKEUP_MARK_SQL } = M;

const add = (ymd, n) => { const d = new Date(ymd + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dow = ymd => new Date(ymd + 'T00:00:00Z').getUTCDay();
/* 2027-10-01(금) ~ 2027-11-01(월) 월수금 */
const mwf = []; for (let d = '2027-10-01'; d <= '2027-11-01'; d = add(d, 1)) if ([1, 3, 5].includes(dow(d))) mwf.push(d);
const series = mwf.map((d, i) => ({ id: i + 1, date: d }));
const fri = series.find(s => s.date === '2027-10-01');

console.log('① 날짜 계산(순수 함수)');
ok('(전제) 마지막 수업은 11/1(월)', mwf[mwf.length - 1] === '2027-11-01' && dow('2027-11-01') === 1);
ok('사장님 예 — 금요일 연기 → 11/3(수)', nextEndMakeupDate(series, fri.id) === '2027-11-03', nextEndMakeupDate(series, fri.id));
const moved = series.map(s => s.id === fri.id ? { ...s, date: '2027-11-03' } : s);
const mon = series.find(s => s.date === '2027-10-04');
ok('두 번째 연기는 첫 보강 다음 수업일(11/5 금)', nextEndMakeupDate(moved, mon.id) === '2027-11-05', nextEndMakeupDate(moved, mon.id));
const last = series[series.length - 1];
ok('마지막 회를 연기하면 그 다음 수업일(11/3)', nextEndMakeupDate(series, last.id) === '2027-11-03');
ok('혼자뿐이면 다음 주 같은 요일', nextEndMakeupDate([{ id: 9, date: '2027-10-01' }], 9) === '2027-10-08');
ok('자기를 못 찾으면 null(지어내지 않음)', nextEndMakeupDate(series, 999) === null);
ok('이름: 연기보강 (10월 2일 연기)', endMakeupLabel('2026-10-02') === '연기보강 (10월 2일 연기)', endMakeupLabel('2026-10-02'));

console.log('② DB 계획 + 표시(진짜 SQLite)');
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE class_schedules (id INTEGER PRIMARY KEY, user_id TEXT, scheduled_date TEXT, start_time TEXT, status TEXT, class_type TEXT DEFAULT 'regular', notes TEXT)`);
const ins = db.prepare(`INSERT INTO class_schedules (id,user_id,scheduled_date,start_time,status) VALUES (?,?,?,?,?)`);
series.forEach(s => ins.run(s.id, 'kid', s.date, '19:20', 'active'));
ins.run(100, 'kid', '2027-11-08', '20:00', 'active');      // 다른 시각 — 묶음 밖
ins.run(101, 'other', '2027-11-10', '19:20', 'active');    // 다른 학생 — 묶음 밖
ins.run(102, 'kid', '2027-11-15', '19:20', 'cancelled');   // 취소 — 묶음 밖
const wrap = (sql, a = []) => ({ bind: (...x) => wrap(sql, x), first: async () => db.prepare(sql).get(...a) ?? null, all: async () => ({ results: db.prepare(sql).all(...a) }), run: async () => db.prepare(sql).run(...a) });
const env = { DB: { prepare: sql => wrap(sql) } };
const p = await planEndMakeup(env, fri.id, '2027-09-30');
ok('같은 학생·같은 시각·활성만 묶어 11/3(수)', p.ok && p.new_date === '2027-11-03' && p.new_time === '19:20' && p.last_date === '2027-11-01', p);
ok('이름이 원래 날짜', p.label === '연기보강 (10월 1일 연기)', p.label);
ok('취소된 회는 연기보강 불가', (await planEndMakeup(env, 102, '2027-09-30')).ok === false);
db.prepare(END_MAKEUP_MARK_SQL).run(p.label, fri.id);
const r = db.prepare(`SELECT class_type, notes FROM class_schedules WHERE id=?`).get(fri.id);
ok('표시: class_type=makeup + 메모에 이름', r.class_type === 'makeup' && r.notes === '연기보강 (10월 1일 연기)', r);

console.log('③ 서버 배선');
const api = readFileSync(join(ROOT, 'cloudflare-deploy/src/api-admin.ts'), 'utf8');
const i0 = api.indexOf("if (method === 'POST' && path === '/api/admin/schedule-requests') {");
const post = api.slice(i0, api.indexOf("if (method === 'GET' && path === '/api/admin/schedule-requests')", i0));
ok('(전제) 요청 접수 라우트를 찾았다', i0 > 0 && post.length > 100);
const iPrev = post.indexOf('body.preview === true'), iIns = post.indexOf('INSERT INTO schedule_change_requests');
ok('미리보기는 INSERT 보다 앞에서 돌아간다(아무것도 안 씀)', iPrev > 0 && iPrev < iIns);
ok('날짜는 서버 계산값으로 덮는다(화면 값 무시)', /body\.new_date\s*=\s*_emPlan\.new_date/.test(post) && /body\.request_type\s*=\s*'change'/.test(post));
ok('접수 뒤 end_makeup 이름을 남긴다', /SET end_makeup = \?/.test(post));
const d0 = api.indexOf("if (method === 'POST' && path === '/api/admin/schedule-requests/decide')");
const dec = api.slice(d0, d0 + 20000);
ok('승인 때 이동과 같은 batch 에 표시를 넣는다', /_mvAll\.push\(env\.DB\.prepare\(END_MAKEUP_MARK_SQL\)/.test(dec) && dec.indexOf('END_MAKEUP_MARK_SQL') < dec.indexOf('await env.DB.batch(_mvAll)'));
const sr = readFileSync(join(ROOT, 'cloudflare-deploy/src/student-schedule-request.ts'), 'utf8');
ok('요청 표에 end_makeup 칸(지연 ALTER)', /'end_makeup TEXT'/.test(sr));

console.log('④ 화면(공용 연기·변경 창)');
const js = readFileSync(join(ROOT, 'cloudflare-deploy/public/js/class-move-modal.js'), 'utf8');
ok("세 번째 갈래 «끝에 보강 (연기보강)»", /mvSubBtn\('end'/.test(js));
ok("mvAct 가 'end' 를 돌려준다", /sv === 'end' \? 'end'/.test(js));
const ir = js.indexOf('function mvRunEnd(');
const runEnd = js.slice(ir, js.indexOf('function mvRun(', ir));
ok('실행은 end_makeup:true 로 보내고 날짜를 안 보낸다', /end_makeup: true/.test(runEnd) && !/new_date:/.test(runEnd));
ok('실행 뒤 승인(decide)까지', /schedule-requests\/decide/.test(runEnd));
const vs = new Set([...readFileSync(join(ROOT, 'cloudflare-deploy/public/admin/student.html'), 'utf8').matchAll(/class-move-modal\.js\?v=(\d+)/g)].map(m => m[1]));
ok('학생 상세가 새 번호로 싣는다', vs.size === 1 && Number([...vs][0]) >= 4, [...vs]);

console.log('결과: PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
