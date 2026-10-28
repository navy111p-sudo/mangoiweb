// Execute the real portal and history loaders against disposable in-memory SQLite.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { build } from '../cloudflare-deploy/node_modules/esbuild/lib/main.js';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = await build({stdin:{contents:`export {handleTeacherApi} from './cloudflare-deploy/src/api-teacher'; export {previousScheduled,validHistoryDate} from './cloudflare-deploy/src/teacher-student-history';`,resolveDir:root},bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'session-fixture',setup(b){b.onLoad({filter:/[\\/]auth-admin\.ts$/},async a=>({loader:'ts',contents:readFileSync(a.path,'utf8').replace('export async function getAdminActor(', 'async function originalGetAdminActor(')+'\nexport async function getAdminActor(){return globalThis.__historyActor;}'}));}}]});
const { handleTeacherApi, previousScheduled, validHistoryDate } = await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));
const db = new DatabaseSync(':memory:');
db.exec(`
CREATE TABLE teachers(id INTEGER,name TEXT);
INSERT INTO teachers VALUES(1,'Teacher A'),(2,'Teacher B'),(3,'Teacher C');
CREATE TABLE teacher_account_links(username TEXT,teacher_id INTEGER,teacher_name TEXT);
INSERT INTO teacher_account_links VALUES('teacher_a',1,'Teacher A');
CREATE TABLE class_schedules(id INTEGER,user_id TEXT,teacher_id TEXT,status TEXT,scheduled_date TEXT,day_of_week TEXT,start_time TEXT,duration_min INTEGER,source TEXT,starts_on TEXT,created_at INTEGER,skip_dates TEXT);
INSERT INTO class_schedules VALUES
(1,'student_one','1','active','2026-10-23',NULL,'19:00',20,'manual',NULL,1,NULL),
(2,'student_one','2','active','2026-10-21',NULL,'18:00',20,'manual',NULL,1,NULL),
(3,'student_one','2','active','2026-10-20',NULL,'18:00',20,'manual',NULL,1,NULL),
(4,'student_other','2','active','2026-10-23',NULL,'19:00',20,'manual',NULL,1,NULL),
(5,'student_one','1','active',NULL,'Mon','17:00',20,'manual','2026-10-15',1,NULL);
CREATE TABLE student_evaluations(id INTEGER,student_uid TEXT,user_id TEXT,room_id TEXT,lesson_date TEXT,teacher_name TEXT,teacher_uid TEXT,created_at INTEGER,note_en TEXT,note_ko TEXT,teacher_comment TEXT,strengths TEXT);
INSERT INTO student_evaluations VALUES
(10,'student_one',NULL,'class-3-20261020','2026-10-20','Teacher B','teacher_b',1792494000000,'Previous teacher feedback',NULL,NULL,NULL),
(11,'', 'student_one','class-999-20260930','2026-09-30','Teacher C','teacher_c',1790751600000,'Legacy retained feedback',NULL,NULL,NULL),
(12,'student_other',NULL,'class-4-20261023','2026-10-23','Teacher B','teacher_b',1792753200000,'PRIVATE_OTHER_STUDENT',NULL,NULL,NULL);
CREATE TABLE class_substitutions(schedule_id INTEGER,sub_date TEXT,substitute_teacher_id TEXT,original_teacher_id TEXT,status TEXT);
INSERT INTO class_substitutions VALUES(2,'2026-10-21','3','2','active');
CREATE TABLE class_audit_log(schedule_id INTEGER,action TEXT,teacher_name TEXT,lesson_date TEXT,detail TEXT,created_at INTEGER);
CREATE TABLE attendance(room_id TEXT,role TEXT,joined_at INTEGER,account_uid TEXT,user_id TEXT,date TEXT,status TEXT);
CREATE TABLE class_no_show(room_id TEXT,schedule_id INTEGER,missing_role TEXT,teacher_name TEXT,student_name TEXT,created_at INTEGER);
CREATE TABLE schedule_change_requests(schedule_id INTEGER,orig_date TEXT,fee_type TEXT,minutes_before INTEGER,request_type TEXT,created_at INTEGER,status TEXT);
CREATE TABLE student_leaves(id INTEGER,student_uid TEXT,start_date TEXT,end_date TEXT,reason TEXT,status TEXT,created_by TEXT,created_at INTEGER,cancelled_by TEXT,cancelled_at INTEGER);
CREATE TABLE class_absence_hold(id INTEGER,student_uid TEXT,held_after TEXT,resumed_on TEXT,state TEXT);
CREATE TABLE enroll_holidays(day TEXT);
`);
const executed=[];
const env={DB:{prepare(sql){let args=[];return {bind(...a){args=a;return this;},async all(){executed.push(sql);return {results:db.prepare(sql).all(...args)};},async first(){executed.push(sql);return db.prepare(sql).get(...args)||null;}};},async exec(){throw new Error('History must never mutate schema/data');}}};
globalThis.__historyActor={ok:true,isTeacher:true,username:'teacher_a',name:'Teacher A',role:'teacher'};
async function request(params={}){const url=new URL('https://example.test/api/teacher/portal');url.search=new URLSearchParams({part:'student_history',schedule_id:'1',date:'2026-10-23',month:'2026-10',...params});const response=await handleTeacherApi(new Request(url),url,env);return {status:response.status,data:await response.json()};}
let result=await request();assert.equal(result.status,200);
assert.equal(result.data.previous.date,'2026-10-21');assert.equal(result.data.previous.teacher_name,'Teacher C');
assert.equal(result.data.previous.feedback,undefined,'previous teacher does not require a report');
assert.equal(result.data.items.find(i=>i.date==='2026-10-20').feedback.note_en,'Previous teacher feedback');
assert.ok(!JSON.stringify(result).includes('PRIVATE_OTHER_STUDENT'));
assert.ok(!result.data.items.some(i=>i.date==='2026-10-05'),'never project before enrollment start');
result=await request({month:'2026-09'});assert.equal(result.data.items.length,1);assert.equal(result.data.items[0].teacher_name,'Teacher C');
assert.equal(result.data.items[0].feedback.note_en,'Legacy retained feedback','legacy and orphaned feedback survives');
assert.equal((await request({schedule_id:'4'})).status,403,'other teacher student denied');
assert.equal((await request({schedule_id:'404'})).status,403);
assert.equal((await request({date:'2026-02-30'})).status,400);
assert.equal((await request({month:'2026-13'})).status,400);
globalThis.__historyActor={ok:true,isTeacher:true,username:'teacher_c',name:'Teacher C',role:'teacher'};
assert.equal((await request({schedule_id:'2',date:'2026-10-21'})).status,200,'date-specific substitute can read history');
assert.equal((await request({schedule_id:'2',date:'2026-10-22'})).status,403,'substitute cannot borrow another date');
globalThis.__historyActor={ok:true,isTeacher:true,username:'unknown',name:'Unlinked',role:'teacher'};
assert.equal((await request()).status,403,'unlinked actor fails closed');
globalThis.__historyActor={ok:false};assert.equal((await request()).status,401);
assert.ok(executed.every(sql=>/^\s*(SELECT\b|PRAGMA table_info\b)/.test(sql)),'history only reads data and schema');
assert.equal(validHistoryDate('2026-02-30'),false);
assert.equal(previousScheduled([{id:1,day_of_week:'Mon',start_time:'18:00',starts_on:'2026-10-01',skip_dates:'2026-10-19'}],'2026-10-23').date,'2026-10-12');
let matrix = 0;
// Independent day-by-day oracle, across leap days, all weekdays and skipped occurrences.
for (let weekday=0;weekday<7;weekday++) for(let offset=0;offset<100;offset++) {
  const before=new Date(Date.UTC(2024,1,20)+offset*86400000).toISOString().slice(0,10);
  const skipped=['2024-02-26','2024-03-04','2024-03-11'];
  const row={id:99,day_of_week:String(weekday),start_time:'23:40',starts_on:'2024-02-01',skip_dates:skipped.join(',')};
  let expected=null;
  for(let daysBack=1;daysBack<200;daysBack++) {
    const candidate=new Date(Date.parse(before+'T00:00:00Z')-daysBack*86400000);
    const date=candidate.toISOString().slice(0,10);
    if(date<'2024-02-01')break;
    if(candidate.getUTCDay()===weekday&&!skipped.includes(date)){expected=date;break;}
  }
  assert.equal(previousScheduled([row],before)?.date||null,expected);matrix++;
}
globalThis.__historyActor={ok:true,isTeacher:true,username:'teacher_a',name:'Teacher A',role:'teacher'};
for(let index=0;index<120;index++) {
  const month=new Date(Date.UTC(2020, index, 1)).toISOString().slice(0,7);
  const calendar=await request({month});assert.equal(calendar.status,200);
  assert.ok(calendar.data.items.every(row=>row.date.slice(0,7)===month));
  assert.ok(!JSON.stringify(calendar).includes('PRIVATE_OTHER_STUDENT'));matrix++;
}
// A historical teacher change must not rewrite an earlier teacher's name.
db.exec(`INSERT INTO class_audit_log VALUES(2,'teacher_change',NULL,'2026-10-22','{"from_teacher_id":"2","to_teacher_id":"1"}',1792620000000);`);
const changed=await request();assert.equal(changed.data.items.find(i=>i.date==='2026-10-21').teacher_name,'Teacher C');
// Two lessons on the last date: an earlier lesson's late-written feedback must not replace the last teacher.
db.exec(`INSERT INTO class_schedules VALUES(6,'student_one','2','active','2026-10-21',NULL,'17:00',20,'manual',NULL,1,NULL);
INSERT INTO student_evaluations VALUES(20,'student_one',NULL,'class-6-20261021','2026-10-21','Teacher B','teacher_b',1792753200000,'Earlier lesson, written later',NULL,NULL,NULL);`);
let twoLessons=await request();assert.equal(twoLessons.data.previous.teacher_name,'Teacher C');
assert.equal(twoLessons.data.previous.feedback,undefined);
db.exec(`INSERT INTO student_evaluations VALUES(21,'student_one',NULL,'class-2-20261021','2026-10-21','Teacher C','teacher_c',1792580400000,'Actual last lesson feedback',NULL,NULL,NULL);`);
twoLessons=await request();assert.equal(twoLessons.data.previous.teacher_name,'Teacher C');
assert.equal(twoLessons.data.previous.feedback.note_en,'Actual last lesson feedback');
// A split/cancel operation must preserve past classes under their original room IDs.
db.exec(`ALTER TABLE class_schedules ADD COLUMN updated_at INTEGER;
ALTER TABLE class_schedules ADD COLUMN notes TEXT;
INSERT INTO class_schedules(id,user_id,teacher_id,status,day_of_week,start_time,duration_min,starts_on,created_at,updated_at,notes) VALUES
(70,'student_one','2','cancelled','Fri','15:00',20,'2026-10-01',1,1792108800000,'날짜별로 나눔 @2026-10-16'),
(71,'student_one','2','cancelled','Mon','15:00',20,'2026-10-01',1,1791932400000,NULL),
(72,'student_one','2','cancelled','Wed','15:00',20,'2026-10-01',1,NULL,NULL);
INSERT INTO attendance VALUES('class-71-20261012','student',1791784800000,'student_one','student_one','2026-10-12','attended');
INSERT INTO attendance VALUES('class-72-20261007','student',1791352800000,'student_one','student_one','2026-10-07','attended');`);
const cancelled=await request();assert.equal(cancelled.status,200);
assert.ok(cancelled.data.items.some(i=>i.room_id==='class-70-20261009'));
assert.ok(!cancelled.data.items.some(i=>i.schedule_id===70&&i.date>='2026-10-16'));
assert.equal(cancelled.data.items.find(i=>i.room_id==='class-71-20261012').state,'done');
assert.ok(!cancelled.data.items.some(i=>i.schedule_id===71&&i.date>='2026-10-19'));
assert.equal(cancelled.data.items.find(i=>i.room_id==='class-72-20261007').state,'done');
assert.ok(!cancelled.data.items.some(i=>i.room_id==='class-72-20261014'));
// Old-LMS (cafe24) rows have no reservation id (2026-10-28 "Could not load class history"): open them by room + student,
// authorized only by this teacher's cafe24 number. cafe24 #1 is someone else even though Teacher A is teachers.id 1.
// The LMS permission window (14 days, same as the class list) is relative to "now" — pin it so the fixture never ages out.
const realNow=Date.now;Date.now=()=>Date.parse('2026-10-28T03:00:00Z');
db.exec(`ALTER TABLE attendance ADD COLUMN teacher_uid TEXT;
ALTER TABLE attendance ADD COLUMN left_at INTEGER;
CREATE TABLE teacher_profiles(korean_name TEXT,english_name TEXT);
INSERT INTO teacher_profiles VALUES('티처A','Teacher A'),(NULL,'Teacher Z');
CREATE TABLE teacher_payroll_auto(teacher_id INTEGER,teacher_name TEXT);
INSERT INTO teacher_payroll_auto VALUES(184,'Teacher A'),(184,'Teacher A'),(1,'Someone Else'),(77,'Teacher X'),(77,'Teacher Y'),(185,'Teacher Z');
INSERT INTO attendance(room_id,role,joined_at,account_uid,user_id,date,status,teacher_uid,left_at) VALUES
('c24-900','student',1793073600000,NULL,'mangoai_lms','2026-10-27','present','184',1793074800000),
('c24-900','student',1793073660000,NULL,'mangoai_lms','2026-10-27','present','184',NULL),
('c24-899','student',1792468800000,NULL,'mangoai_lms','2026-10-20','present','77',NULL),
('c24-800','student',1790654400000,NULL,'mangoai_lms','2026-09-29','present','184',1790655600000),
('c24-901','student',1793077200000,NULL,'lms_other','2026-10-27','present','1',1793078400000),
('c24-950','student',1793160000000,NULL,'mangoai_lms','2026-10-28','scheduled','184',NULL),
('c24-960','student',1793077200000,NULL,'lms_z','2026-10-27','present','185',NULL);
INSERT INTO student_evaluations VALUES(30,'mangoai_lms',NULL,'c24-899','2026-10-28','Teacher Y','teacher_y',1792558800000,'LMS lesson feedback',NULL,NULL,NULL);`);
const lms=p=>request({schedule_id:'',room_id:'c24-900',student_uid:'mangoai_lms',date:'2026-10-28',...p});
let lmsResult=await lms();assert.equal(lmsResult.status,200,'old-LMS row opens without a schedule id');
assert.equal(lmsResult.data.before,'2026-10-27','the LMS lesson date is the reference, not the client date');
assert.deepEqual(lmsResult.data.warnings,[]);
assert.equal(lmsResult.data.items.filter(i=>i.room_id==='c24-900').length,1,'a rejoin (two attendance rows, one room) is one lesson');
const lmsLesson=lmsResult.data.items.find(i=>i.room_id==='c24-900');
assert.equal(lmsLesson.teacher_name,'Teacher A');assert.equal(lmsLesson.teacher_source,'lms');
assert.equal(lmsLesson.start,'13:00');assert.equal(lmsLesson.duration_min,20);assert.equal(lmsLesson.state,'done');
assert.equal(lmsLesson.start_ts,undefined,'internal timestamps stay on the server');
const lmsReported=lmsResult.data.items.find(i=>i.room_id==='c24-899');
assert.equal(lmsReported.feedback.note_en,'LMS lesson feedback','a c24 room report matches its lesson even when dated another day');
assert.equal(lmsResult.data.items.filter(i=>i.feedback?.id===30).length,1,'the matched report is not repeated as its own row');
assert.equal(lmsResult.data.previous.date,'2026-10-20');assert.equal(lmsResult.data.previous.teacher_source,'lms');
assert.equal(lmsResult.data.previous.teacher_name,null,'a cafe24 number with two names stays unknown');
assert.ok(!JSON.stringify(lmsResult).includes('lms_other'),'another student in the LMS is never shown');
assert.deepEqual((await lms({month:'2026-09'})).data.items.map(i=>i.room_id),['c24-800']);
assert.equal((await lms({student_uid:'lms_other'})).status,403,'the student must be the one in that room');
assert.equal((await lms({room_id:'c24-901',student_uid:'lms_other'})).status,403,'teachers.id 1 never authorizes cafe24 #1');
assert.equal((await lms({student_uid:''})).status,403);
assert.equal((await lms({room_id:'c24-abc'})).status,400);
assert.equal((await lms({room_id:'class-1-20261023'})).status,400);
assert.equal((await lms({room_id:'c24-950',date:'2026-10-28'})).status,403,'a seeded (not attended) LMS row never authorizes');
assert.equal((await lms({room_id:'c24-800'})).status,403,'outside the 14-day class-list window the old room no longer opens history');
// «Previous class» is the later of reservation and LMS — compared as HH:MM, so '9:00' is earlier than '13:00'.
db.exec(`INSERT INTO class_schedules(id,user_id,teacher_id,status,scheduled_date,start_time,duration_min,source,created_at) VALUES
(82,'mangoai_lms','1','active','2026-10-20','9:00',20,'manual',1);`);
assert.equal((await lms()).data.previous.room_id,'c24-899','same day: the 13:00 LMS lesson is later than the 9:00 reservation');
db.exec(`INSERT INTO class_schedules(id,user_id,teacher_id,status,scheduled_date,start_time,duration_min,source,created_at) VALUES
(81,'mangoai_lms','1','active','2026-10-22','9:00',20,'manual',1);`);
assert.equal((await lms()).data.previous.date,'2026-10-22','a later reservation wins over an earlier LMS lesson');
assert.notEqual((await lms()).data.previous.teacher_source,'lms');
// Same slot: the reservation hides the LMS row only when it itself says «done». The ledger never counts c24 attendance,
// so an unattended reservation must not replace «Attended (old LMS)» with «no record» — then both rows stay.
db.exec(`INSERT INTO class_schedules(id,user_id,teacher_id,status,scheduled_date,start_time,duration_min,source,created_at) VALUES
(80,'mangoai_lms','1','active','2026-10-27','13:00',20,'c24-mirror',1);`);
let slot=(await lms()).data.items.filter(i=>i.date==='2026-10-27');
assert.deepEqual(slot.map(i=>i.room_id).sort(),['c24-900','class-80-20261027'],'unattended reservation: the LMS evidence stays visible');
assert.notEqual(slot.find(i=>i.room_id==='class-80-20261027').state,'done');
db.exec(`INSERT INTO attendance(room_id,role,joined_at,account_uid,user_id,date,status) VALUES
('class-80-20261027','student',1793073600000,'mangoai_lms','mangoai_lms','2026-10-27','attended');`);
slot=(await lms()).data.items.filter(i=>i.date==='2026-10-27');
assert.deepEqual(slot.map(i=>i.room_id),['class-80-20261027'],'attended reservation at the exact LMS slot: shown once');
assert.equal(slot[0].state,'done');
globalThis.__historyActor={ok:true,isTeacher:true,username:'teacher_c',name:'Teacher C',role:'teacher'};
assert.equal((await lms()).status,403,'a teacher without a cafe24 number cannot open LMS rooms');
// The LMS list needs only the cafe24 number (not a D1 roster link), so the history behind it must not ask for more.
globalThis.__historyActor={ok:true,isTeacher:true,username:'teacher_z',name:'Teacher Z',role:'teacher'};
assert.equal((await lms({room_id:'c24-960',student_uid:'lms_z'})).status,200,'cafe24-only teacher opens their own LMS row');
assert.equal((await request()).status,403,'…but the reservation path still needs the D1 roster link');
// Unread records are warnings, never an empty month / «not recorded».
globalThis.__historyActor={ok:true,isTeacher:false,username:'mgr',name:'Manager',role:'hq'};
db.exec('ALTER TABLE teacher_payroll_auto RENAME TO payroll_off');
const unnamed=await lms();assert.equal(unnamed.status,200);
assert.ok(unnamed.data.warnings.includes('lms_teacher_names'),'payroll unreadable → warning');
assert.equal(unnamed.data.items.find(i=>i.room_id==='c24-899').teacher_name,'Teacher Y','(report name still wins)');
db.exec('ALTER TABLE payroll_off RENAME TO teacher_payroll_auto');
globalThis.__historyActor={ok:true,isTeacher:true,username:'teacher_a',name:'Teacher A',role:'teacher'};
db.exec('ALTER TABLE attendance RENAME TO attendance_off');
const lmsDown=await request();assert.equal(lmsDown.status,200);
assert.ok(lmsDown.data.warnings.includes('lms_attendance'),'LMS attendance unreadable → warning, not a silent empty month');
db.exec('ALTER TABLE attendance_off RENAME TO attendance');
Date.now=realNow;
assert.ok(executed.every(sql=>/^\s*(SELECT\b|PRAGMA table_info\b)/.test(sql)),'LMS history only reads data and schema');
// Read-only compatibility: fresh canonical schema, then legacy schema with eval_at in another month.
db.exec(`ALTER TABLE student_evaluations RENAME TO full_evaluations;
CREATE TABLE student_evaluations(id INTEGER,student_uid TEXT,teacher_name TEXT,teacher_comment TEXT,lesson_date TEXT,created_at INTEGER);
INSERT INTO student_evaluations VALUES(100,'student_one','Teacher B','Canonical-only feedback','2026-10-08',1791446400000);`);
const canonical=await request();assert.equal(canonical.status,200);
assert.equal(canonical.data.items.find(i=>i.feedback?.id===100).feedback.note_en,'Canonical-only feedback');
db.exec(`DROP TABLE student_evaluations;
CREATE TABLE student_evaluations(id INTEGER,user_id TEXT,eval_at INTEGER,evaluator TEXT,comment TEXT,created_at INTEGER);
INSERT INTO student_evaluations VALUES(101,'student_one',1790751600000,'Teacher C','Legacy date precedence',1792494000000);`);
const legacy=await request({month:'2026-09'});assert.equal(legacy.status,200);
assert.equal(legacy.data.items.find(i=>i.feedback?.id===101).date,'2026-09-30');
assert.equal(legacy.data.items.find(i=>i.feedback?.id===101).teacher_name,'Teacher C');
assert.ok(!(await request()).data.items.some(i=>i.feedback?.id===101));
db.exec('DROP TABLE student_evaluations');
assert.equal((await request()).status,503,'database failure is an error, never an empty successful history');
// Client wiring (the 2026-10-28 bug was a client sending an empty schedule id): run the real button builder, click handler
// and dialog script — an old-LMS row must ask by room + student, a reservation row by schedule id.
{
  const vm = await import('node:vm');
  const page = readFileSync(new URL('../cloudflare-deploy/public/teacher.html', import.meta.url), 'utf8');
  const block = (start) => { const a = page.indexOf(start); assert.ok(a >= 0, 'missing ' + start);
    let d = 0, i = page.indexOf('{', a); for (; i < page.length; i++) { if (page[i] === '{') d++; else if (page[i] === '}' && --d === 0) break; }
    return page.slice(a, i + 1); };
  const attr = (h, n) => (new RegExp(n + '="([^"]*)"').exec(h) || [])[1];
  const ctx = vm.createContext({ esc: x => String(x ?? ''), T: en => en, stuUid: c => c.student_uid || '', stuLabelText: c => c.student_name || '', todayKST: () => '2026-10-28' });
  vm.runInContext(block('  function portalContact('), ctx);
  const lmsBtn = ctx.portalContact({ kind: 'class', source: 'lms', schedule_id: null, room_id: 'c24-900', student_uid: 'mangoai_lms', start_ts: 1792468800000, class_date: '2026-10-28' });
  assert.equal(attr(lmsBtn, 'data-history-schedule'), '');assert.equal(attr(lmsBtn, 'data-history-room'), 'c24-900');
  assert.equal(attr(lmsBtn, 'data-history-uid'), 'mangoai_lms');assert.equal(attr(lmsBtn, 'data-history-date'), '2026-10-20', 'LMS row: its own lesson date (KST), not today');
  const resBtn = ctx.portalContact({ kind: 'class', schedule_id: 5, room_id: 'class-5-20261027', student_uid: 'student_one', class_date: '2026-10-27' });
  assert.equal(attr(resBtn, 'data-history-schedule'), '5');assert.equal(attr(resBtn, 'data-history-room'), undefined);
  // click handler → context
  let listener, opened;
  const cctx = vm.createContext({ document: { addEventListener: (k, fn) => { if (k === 'click') listener = fn; } }, T: en => en,
    window: { MangoiTeacherHistory: { open: c => { opened = c; } } } });
  vm.runInContext(block("  document.addEventListener('click',function(e){\n    // History opens") + ');', cctx);
  const attrs = { 'data-history-schedule': '', 'data-history-room': 'c24-900', 'data-history-uid': 'mangoai_lms', 'data-history-date': '2026-10-20', 'data-history-name': 'S' };
  listener({ target: { closest: () => ({ getAttribute: k => attrs[k] ?? null }) } });
  assert.equal(opened.roomId, 'c24-900');assert.equal(opened.studentUid, 'mangoai_lms');
  // dialog script → request URL and rendering
  class El { constructor(t) { this.tagName = t; this.children = []; this.attrs = {}; this._t = ''; this.open = false; this.isConnected = true; }
    set textContent(v) { this._t = String(v); this.children = []; } get textContent() { return this._t + this.children.map(c => c.textContent).join(' '); }
    setAttribute(k, v) { this.attrs[k] = v; } appendChild(c) { this.children.push(c); return c; } append(...c) { this.children.push(...c); }
    replaceChildren(...c) { this._t = ''; this.children = c; } addEventListener() {} showModal() { this.open = true; } close() { this.open = false; } focus() {}
    get lastChild() { return this.children[this.children.length - 1]; }
    all(tag) { return this.children.flatMap(c => [...(c.tagName === tag ? [c] : []), ...c.all(tag)]); }
    querySelectorAll(sel) { const [a, b] = sel.split(' '); return b ? this.all(a).flatMap(x => x.all(b)) : this.all(a); }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; } }
  const urls = []; let reply;
  const dctx = vm.createContext({ AbortController, URLSearchParams, console, Promise, Array,
    document: { documentElement: { lang: 'en' }, head: new El('head'), body: new El('body'), createElement: t => new El(t), activeElement: null, querySelectorAll: () => [], addEventListener() {} },
    window: { addEventListener() {} }, fetch: async (u) => { urls.push(u); return { ok: true, json: async () => reply }; } });
  dctx.window = Object.assign(dctx.window, dctx);
  vm.runInContext(readFileSync(new URL('../cloudflare-deploy/public/js/teacher-student-history.js', import.meta.url), 'utf8').replace("if (window.MangoiTeacherHistory) return;", ''), dctx);
  const api = dctx.window.MangoiTeacherHistory || dctx.MangoiTeacherHistory;
  reply = { ok: true, before: '2026-10-20', warnings: [], items: [{ date: '2026-10-20', start: '13:00', teacher_name: 'Teacher A', teacher_source: 'lms', label_en: 'Attended (old LMS)', label_ko: '출석 (옛 LMS)' }],
    previous: { date: '2026-10-13', teacher_name: 'Teacher A', teacher_source: 'lms' } };
  api.open({ scheduleId: '', roomId: 'c24-900', studentUid: 'mangoai_lms', date: '2026-10-28', name: 'S' });
  for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0));
  const q = new URLSearchParams(urls.at(-1).split('?')[1]);
  assert.equal(q.get('room_id'), 'c24-900');assert.equal(q.get('student_uid'), 'mangoai_lms');assert.equal(q.get('schedule_id'), null, 'no empty schedule id is sent');
  const shown = dctx.document.body.children[0].textContent;
  assert.ok(/Old LMS record/.test(shown) && /Before 2026-10-20/.test(shown) && !/Could not load/.test(shown), 'renders the LMS rows with the server-confirmed date');
  api.open({ scheduleId: '5', roomId: '', studentUid: '', date: '2026-10-27', name: 'S' });
  for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0));
  const q2 = new URLSearchParams(urls.at(-1).split('?')[1]);
  assert.equal(q2.get('schedule_id'), '5');assert.equal(q2.get('room_id'), null);
}
console.log(`PASS: ${matrix} distinct matrix scenarios plus integration cases: real SQLite history, cross-teacher records, report-free previous teacher, substitutes, leap dates, month boundaries, orphan/legacy reports, authorization, read failures and SELECT-only reads.`);
db.close();
