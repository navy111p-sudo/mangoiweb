// Execute the real portal and history loaders against disposable in-memory SQLite.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { build } from '../cloudflare-deploy/node_modules/esbuild/lib/main.js';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = await build({stdin:{contents:`export {handleTeacherApi} from './cloudflare-deploy/src/api-teacher'; export {previousScheduled,validHistoryDate,markWritableLessons,isMyLesson} from './cloudflare-deploy/src/teacher-student-history';`,resolveDir:root},bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'session-fixture',setup(b){b.onLoad({filter:/[\\/]auth-admin\.ts$/},async a=>({loader:'ts',contents:readFileSync(a.path,'utf8').replace('export async function getAdminActor(', 'async function originalGetAdminActor(')+'\nexport async function getAdminActor(){return globalThis.__historyActor;}'}));b.onLoad({filter:/[\\/]session-ledger-load\.ts$/},async a=>({loader:'ts',contents:readFileSync(a.path,'utf8').replace('export async function buildStudentLedger(', 'async function originalBuildStudentLedger(')+'\nexport async function buildStudentLedger(env:any, uid:string, ...rest:any[]){if(globalThis.__ledgerThrow===uid)throw new Error("injected ledger failure");return (originalBuildStudentLedger as any)(env, uid, ...rest);}'}));}}]});
const { handleTeacherApi, previousScheduled, validHistoryDate, markWritableLessons, isMyLesson } = await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));
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
const env={DB:{prepare(sql){let args=[];return {bind(...a){args=a;return this;},async all(){executed.push(sql);if(globalThis.__historyFail?.(sql,args))throw new Error('injected read failure');return {results:db.prepare(sql).all(...args)};},async first(){executed.push(sql);if(globalThis.__historyFail?.(sql,args))throw new Error('injected read failure');return db.prepare(sql).get(...args)||null;}};},async exec(){throw new Error('History must never mutate schema/data');}}};
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
('c24-960','student',1793077200000,NULL,'lms_z','2026-10-27','present','185',NULL),
('c24-970','student',1792987200000-13*86400000,NULL,'mangoai_lms','2026-10-13','present','185',1792988400000-13*86400000);
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
// ✎ (2026-11-11) old-LMS lessons: mine = my cafe24 teacher number (Teacher A = #184), never another number (#185).
assert.equal(lmsLesson.can_write,true,'my own old-LMS lesson without a report → writable');
assert.equal(lmsResult.data.items.find(i=>i.room_id==='c24-970').can_write,false,'another cafe24 teacher number → not mine');
assert.equal(lmsResult.data.items.find(i=>i.room_id==='c24-899').can_write,false,'old-LMS lesson with a report → no button');
assert.ok(!JSON.stringify(lmsResult).includes('lms_teacher_uid'),'cafe24 numbers stay on the server');
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
// Same slot = one lesson recorded by two systems = ONE card (2026-11-04 Kaye screenshot: every Wednesday showed
// «Regular class · Unknown» beside «Attended (old LMS)» at the same 9:00am). The ledger never reads c24 attendance, so an
// «unknown» reservation takes the LMS attendance over — the evidence stays visible, just not twice. A «done» reservation
// hides the LMS row. Any other state (student absent …) disagrees with the LMS — then both stay.
db.exec(`INSERT INTO class_schedules(id,user_id,teacher_id,status,scheduled_date,start_time,duration_min,source,created_at) VALUES
(80,'mangoai_lms','1','active','2026-10-27','13:00',20,'c24-mirror',1);`);
const slotOf=async()=>(await lms()).data.items.filter(i=>i.date==='2026-10-27');
let slot=await slotOf();
assert.deepEqual(slot.map(i=>i.room_id),['class-80-20261027'],'unknown reservation + LMS attendance at the exact slot: one card');
assert.equal(slot[0].state,'done','…that keeps the LMS attendance evidence (not «Unknown»)');
assert.equal(slot[0].label_en,'Attended (old LMS)');assert.equal(slot[0].label_ko,'출석 (옛 LMS)');
assert.equal(slot[0].attendance_source,'lms');assert.equal(slot[0].lms_room_id,'c24-900');
assert.equal(slot[0].schedule_id,80,'the card is still the reservation (type · schedule · teacher)');
assert.equal(slot[0].teacher_source,'schedule');
assert.equal(slot[0].teacher_name,'Teacher A','reservation teacher = LMS teacher (payroll 184) — they agree');
assert.equal(slot[0].deduct,false,'display only: the ledger fields stay as the ledger said (unknown → no deduction)');
assert.equal(slot[0].carry,false);
// The teacher disagrees (trap-check 2026-11-04: a substitute in the old LMS / a stale mirror reservation) → both stay,
// or the one card would read «Teacher B attended» while the LMS says Teacher A taught.
db.exec(`UPDATE class_schedules SET teacher_id='2' WHERE id=80`);
slot=await slotOf();
assert.deepEqual(slot.map(i=>i.room_id).sort(),['c24-900','class-80-20261027'],'teacher B reservation + teacher A LMS: two cards');
assert.equal(slot.find(i=>i.room_id==='class-80-20261027').state,'unknown');
assert.equal(slot.find(i=>i.room_id==='class-80-20261027').label_en,'Unknown','…the reservation says what the ledger said');
assert.equal(slot.find(i=>i.room_id==='class-80-20261027').lms_room_id,undefined);
assert.equal(slot.find(i=>i.room_id==='class-80-20261027').attendance_source,undefined);
assert.equal(slot.find(i=>i.room_id==='c24-900').teacher_name,'Teacher A','the LMS teacher stays visible');
assert.equal(slot.find(i=>i.room_id==='c24-900').state,'done');
// ✎ (2026-11-11) the reservation is Teacher B's, but the old LMS says Teacher A taught that slot → no ✎ for Teacher B there.
globalThis.__historyActor={ok:true,isTeacher:true,username:'teacher_b',name:'Teacher B',role:'teacher'};
{ const bView=await request({schedule_id:'80',date:'2026-10-27',month:'2026-10'});assert.equal(bView.status,200,'(precondition) teacher B opens their reservation');
  const b80=bView.data.items.find(i=>i.room_id==='class-80-20261027');
  assert.equal(b80.teacher_name,'Teacher B','(precondition) the card shows teacher B');
  assert.equal(b80.can_write,false,'the old LMS says another teacher taught → no ✎');
  assert.ok(!JSON.stringify(bView.data).includes('lms_disagrees'),'internal flag stays on the server'); }
globalThis.__historyActor={ok:true,isTeacher:true,username:'teacher_a',name:'Teacher A',role:'teacher'};
// A substitute that makes the shown teacher agree → one card again (judged on the name finally shown).
db.exec(`INSERT INTO class_substitutions VALUES(80,'2026-10-27','1','2','active')`);
slot=await slotOf();
assert.deepEqual(slot.map(i=>i.room_id),['class-80-20261027'],'substitute = LMS teacher: one card');
assert.equal(slot[0].teacher_name,'Teacher A');assert.equal(slot[0].lms_room_id,'c24-900');
db.exec(`DELETE FROM class_substitutions WHERE schedule_id=80; UPDATE class_schedules SET teacher_id='1' WHERE id=80`);
// …and one that makes it disagree after the merge → split back (the teacher is only final after substitutes).
db.exec(`INSERT INTO class_substitutions VALUES(80,'2026-10-27','2','1','active')`);
slot=await slotOf();
assert.deepEqual(slot.map(i=>i.room_id).sort(),['c24-900','class-80-20261027'],'substitute ≠ LMS teacher: two cards');
assert.equal(slot.find(i=>i.room_id==='class-80-20261027').teacher_name,'Teacher B');
assert.equal(slot.find(i=>i.room_id==='class-80-20261027').state,'unknown');
assert.equal(slot.filter(i=>i.room_id==='c24-900').length,1,'the LMS lesson comes back once');
db.exec(`DELETE FROM class_substitutions WHERE schedule_id=80`);
// Same teacher, different spelling («KAYE» vs «TEACHER KAYE» on the 2026-11-04 screenshot) → still one card.
db.exec(`UPDATE teachers SET name='TEACHER Teacher A' WHERE id=1`);
const spelled=await lms();assert.equal(spelled.status,200);
slot=spelled.data.items.filter(i=>i.date==='2026-10-27');
assert.deepEqual(slot.map(i=>i.room_id),['class-80-20261027'],'role prefix spelling difference is the same teacher');
db.exec(`UPDATE teachers SET name='Teacher A' WHERE id=1`);
// Two unknown reservations at one slot: the LMS attendance goes to the one whose teacher agrees — even when the
// disagreeing one (80 → Teacher B, a stale mirror row) comes first.
db.exec(`UPDATE class_schedules SET teacher_id='2' WHERE id=80;
INSERT INTO class_schedules(id,user_id,teacher_id,status,scheduled_date,start_time,duration_min,source,created_at) VALUES
(79,'mangoai_lms','1','active','2026-10-27','13:00',20,'c24-mirror',1);`);
slot=await slotOf();
assert.equal(slot.find(i=>i.room_id==='class-79-20261027')?.lms_room_id,'c24-900','merged into the agreeing reservation');
assert.equal(slot.find(i=>i.room_id==='class-80-20261027')?.state,'unknown');
assert.ok(!slot.some(i=>i.room_id==='c24-900'),'…so the LMS lesson is not shown a second time');
db.exec(`DELETE FROM class_schedules WHERE id=79; UPDATE class_schedules SET teacher_id='1' WHERE id=80`);
// A report with no room on that day attaches to the (single) merged card.
db.exec(`INSERT INTO student_evaluations VALUES(33,'mangoai_lms',NULL,NULL,'2026-10-27','Teacher A','teacher_a',1793075000000,'Roomless report',NULL,NULL,NULL)`);
slot=await slotOf();
assert.deepEqual(slot.map(i=>i.room_id),['class-80-20261027']);assert.equal(slot[0].feedback?.note_en,'Roomless report','one card that day → a room-less report attaches');
db.exec(`DELETE FROM student_evaluations WHERE id=33`);
// Reports in both rooms: the reservation's own room wins; the LMS-room one adds no row.
db.exec(`INSERT INTO student_evaluations VALUES
(34,'mangoai_lms',NULL,'class-80-20261027','2026-10-27','Teacher A','teacher_a',1793075000000,'Reservation room report',NULL,NULL,NULL),
(35,'mangoai_lms',NULL,'c24-900','2026-10-27','Teacher A','teacher_a',1793076000000,'LMS room report',NULL,NULL,NULL);`);
slot=await slotOf();
assert.deepEqual(slot.map(i=>i.room_id),['class-80-20261027']);
assert.equal(slot[0].feedback?.note_en,'Reservation room report','own room first');
db.exec(`DELETE FROM student_evaluations WHERE id IN (34,35)`);
// A report-backed merged card keeps one card even if the shown teacher would disagree (the report is the strongest record).
db.exec(`UPDATE class_schedules SET teacher_id='2' WHERE id=80;
INSERT INTO student_evaluations VALUES(36,'mangoai_lms',NULL,'class-80-20261027','2026-10-27','Teacher B','teacher_b',1793075000000,'B wrote it',NULL,NULL,NULL);`);
slot=await slotOf();
assert.deepEqual(slot.map(i=>i.room_id),['class-80-20261027'],'feedback teacher is the teacher of record (same precedence as the list view)');
assert.equal(slot[0].feedback?.note_en,'B wrote it');assert.equal(slot[0].teacher_source,'feedback');
db.exec(`DELETE FROM student_evaluations WHERE id=36; UPDATE class_schedules SET teacher_id='1' WHERE id=80`);
// A report written in the old-LMS room belongs to the merged card — newest revision once, never an extra «not recorded» row.
db.exec(`INSERT INTO student_evaluations VALUES
(31,'mangoai_lms',NULL,'c24-900','2026-10-27','Teacher A','teacher_a',1793075000000,'Merged slot feedback (old)',NULL,NULL,NULL),
(32,'mangoai_lms',NULL,'c24-900','2026-10-27','Teacher A','teacher_a',1793076000000,'Merged slot feedback',NULL,NULL,NULL);`);
slot=await slotOf();
assert.deepEqual(slot.map(i=>i.room_id),['class-80-20261027'],'a revised LMS-room report adds no row');
assert.equal(slot[0].feedback.note_en,'Merged slot feedback','the old-LMS room report shows on the merged card (newest)');
db.exec(`DELETE FROM student_evaluations WHERE id IN (31,32)`);
// The two sources disagree (reservation: student absent · LMS: attended) — both stay, each says what it knows.
db.exec(`INSERT INTO class_no_show(room_id,schedule_id,missing_role,teacher_name,student_name,created_at) VALUES
('class-80-20261027',80,'student','Teacher A','LMS kid',1793074800000);`);
slot=await slotOf();
assert.deepEqual(slot.map(i=>i.room_id).sort(),['c24-900','class-80-20261027'],'student-absent reservation: the LMS row stays beside it');
assert.equal(slot.find(i=>i.room_id==='class-80-20261027').state,'student_absent');
assert.equal(slot.find(i=>i.room_id==='class-80-20261027').lms_room_id,undefined);
db.exec(`DELETE FROM class_no_show WHERE room_id='class-80-20261027'`);
db.exec(`INSERT INTO attendance(room_id,role,joined_at,account_uid,user_id,date,status) VALUES
('class-80-20261027','student',1793073600000,'mangoai_lms','mangoai_lms','2026-10-27','attended');`);
slot=await slotOf();
assert.deepEqual(slot.map(i=>i.room_id),['class-80-20261027'],'attended reservation at the exact LMS slot: shown once');
assert.equal(slot[0].state,'done');assert.equal(slot[0].label_en,'Done','its own attendance speaks — nothing taken over');
assert.equal(slot[0].lms_room_id,undefined);
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
// 👥 Twin accounts (2026-10-28 «쌍둥이 수업 요약·캘린더 이력도 고쳐줘»): one student as `X` (reservations) and `mangoai_X`
// (old-LMS attendance). Either row must open the same, whole history — but only when both ids carry the same confirmed name.
// Names below are made up. Reservation rows here are judged by their own account's ledger (its own public-room login).
{
  const kst = (d, t) => Date.parse(`${d}T${t}:00+09:00`);
  db.exec(`ALTER TABLE class_schedules ADD COLUMN student_name TEXT;
ALTER TABLE attendance ADD COLUMN username TEXT;
CREATE TABLE students_erp(user_id TEXT PRIMARY KEY, korean_name TEXT, username TEXT);
INSERT INTO students_erp VALUES('kidaa',NULL,'kidaa'),('mangoai_kidaa',NULL,'가나다 MANGOAI');
INSERT INTO class_schedules(id,user_id,teacher_id,status,scheduled_date,start_time,duration_min,source,created_at,student_name) VALUES
(200,'kidaa','1','active','2026-10-26','19:00',20,'adm-enroll:1',1,'가나다'),
(201,'kidaa','1','active','2026-10-20','19:00',20,'adm-enroll:1',1,'kidaa'),
(202,'mangoai_kidaa','2','active','2026-10-22','16:00',20,'c24-mirror',1,'가나다 MANGOAI'),
(203,'mangoai_kidaa','2','active','2026-10-21','16:00',20,'c24-mirror',1,'가나다 MANGOAI');
INSERT INTO attendance(room_id,role,joined_at,account_uid,user_id,date,status,teacher_uid,left_at,username) VALUES
('c24-910','student',${kst('2026-10-27','19:00')},NULL,'mangoai_kidaa','2026-10-27','present','184',${kst('2026-10-27','19:20')},'가나다 MANGOAI'),
('c24-911','student',${kst('2026-10-13','19:00')},NULL,'mangoai_kidaa','2026-10-13','present','184',NULL,'가나다 MANGOAI'),
('c24-912','student',${kst('2026-10-20','19:00')},NULL,'mangoai_kidaa','2026-10-20','present','184',NULL,'가나다 MANGOAI'),
('mangoi-class','student',${kst('2026-10-22','16:01')},'mangoai_kidaa','u_device','2026-10-22','attended',NULL,NULL,NULL);
INSERT INTO student_evaluations VALUES
(300,'mangoai_kidaa',NULL,'c24-911','2026-10-13','Teacher A','teacher_a',${kst('2026-10-13','20:00')},'Twin LMS lesson feedback',NULL,NULL,NULL),
(301,'kidaa',NULL,'class-200-20261026','2026-10-26','Teacher A','teacher_a',${kst('2026-10-26','20:00')},'Reservation feedback',NULL,NULL,NULL);
INSERT INTO class_substitutions VALUES(202,'2026-10-22','3','2','active');
INSERT INTO class_audit_log VALUES(203,'teacher_change',NULL,'2026-10-24','{"from_teacher_id":"3","to_teacher_id":"2"}',${kst('2026-10-24','09:00')});`);
  globalThis.__historyActor={ok:true,isTeacher:true,username:'teacher_a',name:'Teacher A',role:'teacher'};
  const fromRes = p => request({schedule_id:'200',date:'2026-10-28',...p});
  const fromLms = p => request({schedule_id:'',room_id:'c24-910',student_uid:'mangoai_kidaa',date:'2026-10-28',...p});
  const rooms = r => r.data.items.map(i=>i.room_id).sort();
  // c24-912 (mangoai_kidaa 10-20 19:00) is the same lesson as reservation 201 (kidaa 10-20 19:00, no Mangoi login → «unknown»):
  // one card — the reservation, carrying the LMS attendance.
  const WHOLE = ['c24-910','c24-911','class-200-20261026','class-201-20261020','class-202-20261022','class-203-20261021'];
  let a = await fromRes(), b = await fromLms();
  assert.equal(a.status,200);assert.equal(b.status,200);
  assert.deepEqual(a.data.warnings,[]);assert.deepEqual(b.data.warnings,[]);
  assert.deepEqual(rooms(a),WHOLE,'reservation row: the twin old-LMS lessons are in the history too');
  assert.deepEqual(rooms(b),WHOLE,'old-LMS row: the twin reservations are in the history too (same whole history)');
  const at = (r, room) => r.data.items.find(i=>i.room_id===room);
  for (const r of [a,b]) {
    assert.equal(at(r,'c24-911').feedback.note_en,'Twin LMS lesson feedback','the twin account report stays on its lesson');
    assert.equal(at(r,'class-200-20261026').feedback.note_en,'Reservation feedback');
    assert.equal(at(r,'c24-911').student_uid,'mangoai_kidaa','an LMS lesson keeps the account it was recorded under');
    assert.equal(at(r,'class-200-20261026').student_uid,'kidaa');
    assert.equal(at(r,'class-202-20261022').student_uid,'mangoai_kidaa');
    assert.equal(at(r,'class-202-20261022').state,'done','a twin reservation is judged by the twin account own login (own ledger)');
    assert.equal(at(r,'class-202-20261022').teacher_name,'Teacher C','a substitute on a twin reservation still applies');
    assert.equal(at(r,'class-203-20261021').teacher_name,'Teacher C','a teacher change on a twin reservation is still undone before its day');
    assert.equal(r.data.items.filter(i=>i.feedback?.id===300).length,1,'a twin report is not repeated as its own row');
    assert.equal(at(r,'class-201-20261020').state,'done','twin LMS attendance at the reservation slot: one card, attended');
    assert.equal(at(r,'class-201-20261020').lms_room_id,'c24-912');
    assert.equal(at(r,'class-201-20261020').student_uid,'kidaa','the merged card stays the reservation account');
  }
  assert.equal(a.data.previous.room_id,'c24-910','previous class: the later twin LMS lesson beats the earlier reservation');
  assert.equal(a.data.previous.teacher_source,'lms');
  assert.equal(b.data.before,'2026-10-27');
  assert.equal(b.data.previous.room_id,'class-200-20261026','opened from LMS: the later twin reservation is the previous class');
  assert.equal(b.data.previous.feedback.note_en,'Reservation feedback');
  // One c24 room recorded under both ids is still one lesson (and its report shows once).
  db.exec(`INSERT INTO attendance(room_id,role,joined_at,account_uid,user_id,date,status,teacher_uid,username) VALUES
('c24-911','student',${kst('2026-10-13','19:00')},NULL,'kidaa','2026-10-13','present','184','가나다');`);
  for (const r of [await fromRes(), await fromLms()]) {
    assert.deepEqual(rooms(r),WHOLE,'a c24 room under both twin ids is shown once');
    assert.equal(r.data.items.filter(i=>i.feedback?.id===300).length,1);
  }
  db.exec(`DELETE FROM attendance WHERE room_id='c24-911' AND user_id='kidaa'`);
  // The twin half failing to read is a warning — the opened account's own half still shows, never a silently shorter history.
  const failing = async (hook, why, check) => {
    if (typeof hook === 'function') globalThis.__historyFail = hook; else globalThis.__ledgerThrow = hook;
    try { const r = await fromRes(); assert.equal(r.status,200,why); assert.ok(rooms(r).includes('class-200-20261026'),why+': own reservation still shown'); check(r); }
    finally { globalThis.__historyFail = undefined; globalThis.__ledgerThrow = undefined; }
  };
  await failing((sql,a)=>/FROM student_evaluations/.test(sql)&&a[0]==='mangoai_kidaa','twin reports unreadable',r=>{
    assert.ok(r.data.warnings.includes('twin_account'),'twin reports unreadable → twin_account warning');
    assert.equal(at(r,'class-200-20261026').feedback.note_en,'Reservation feedback');
    assert.notEqual(at(r,'c24-911').feedback?.id,300);
  });
  await failing('mangoai_kidaa','twin ledger throws',r=>{
    assert.ok(r.data.warnings.includes('twin_account'),'twin ledger failed → twin_account warning');
    assert.ok(!rooms(r).includes('class-202-20261022'),'an unjudged twin reservation is not shown as if known');
    assert.ok(rooms(r).includes('c24-910'),'the twin old-LMS half still shows');
  });
  await failing((sql,a)=>/account_uid = \? OR user_id = \?/.test(sql)&&a[0]==='mangoai_kidaa','twin day attendance unreadable',r=>{
    assert.ok(r.data.warnings.includes('attendance_day'),'a twin ledger warning reaches the screen');
  });
  await failing((sql,a)=>/WHERE user_id = \? COLLATE BINARY AND room_id LIKE/.test(sql)&&a[0]==='mangoai_kidaa','twin LMS unreadable',r=>{
    assert.ok(r.data.warnings.includes('lms_attendance'),'twin LMS unreadable → lms_attendance warning');
    assert.ok(!rooms(r).includes('c24-910'));
  });
  assert.deepEqual((await fromRes()).data.warnings,[],'hooks cleared');
  // Same exact slot across the twins: the LMS row is hidden only once the reservation itself says «done».
  db.exec(`INSERT INTO attendance(room_id,role,joined_at,account_uid,user_id,date,status) VALUES
('class-201-20261020','student',${kst('2026-10-20','19:01')},'kidaa','u_device','2026-10-20','attended');`);
  for (const r of [await fromRes(), await fromLms()]) {
    assert.deepEqual(rooms(r),WHOLE,'attended twin reservation at the exact LMS slot: shown once');
    assert.equal(at(r,'class-201-20261020').state,'done');
    assert.equal(at(r,'class-201-20261020').lms_room_id,undefined,'its own login decides — the LMS row is simply hidden');
  }
  // Not the same student (or not provably): the other id's records never join.
  db.exec(`INSERT INTO students_erp VALUES('kidab','가나라',NULL),('mangoai_kidab',NULL,'라마바 MANGOAI');
INSERT INTO class_schedules(id,user_id,teacher_id,status,scheduled_date,start_time,duration_min,source,created_at,student_name) VALUES
(210,'kidab','1','active','2026-10-26','18:00',20,'adm-enroll:2',1,'가나라'),
(211,'kidac','1','active','2026-10-26','18:20',20,'adm-enroll:3',1,'kidac'),
(212,'kidad','1','active','2026-10-26','18:40',20,'adm-enroll:4',1,'가가가'),
(213,'kidad','1','cancelled','2026-10-05','18:40',20,'adm-enroll:4',1,'나나나'),
(214,'Kidae','1','active','2026-10-26','17:40',20,'adm-enroll:5',1,'바바바'),
(215,'kidaf','1','active','2026-10-26','17:20',20,'adm-enroll:6',1,'MANGOAI');
INSERT INTO attendance(room_id,role,joined_at,account_uid,user_id,date,status,teacher_uid,username) VALUES
('c24-920','student',${kst('2026-10-27','18:00')},NULL,'mangoai_kidab','2026-10-27','present','184','라마바 MANGOAI'),
('c24-921','student',${kst('2026-10-27','18:20')},NULL,'mangoai_kidac','2026-10-27','present','184','가나바 MANGOAI'),
('c24-922','student',${kst('2026-10-27','18:40')},NULL,'mangoai_kidad','2026-10-27','present','184','가가가 MANGOAI'),
('c24-923','student',${kst('2026-10-27','17:40')},NULL,'mangoai_kidae','2026-10-27','present','184','바바바 MANGOAI'),
('c24-924','student',${kst('2026-10-27','17:20')},NULL,'mangoai_kidaf','2026-10-27','present','184','MANGOAI');`);
  for (const [id, room, why] of [['210','c24-920','different names'],['211','c24-921','one side has no confirmed name (id-shaped only)'],
    ['212','c24-922','one side has two names'],['214','c24-923','ids differ by case (Kidae vs mangoai_kidae)'],
    ['215','c24-924','a name that is only the MANGOAI mark is no name']]) {
    const r = await request({schedule_id:id,date:'2026-10-28'});
    assert.equal(r.status,200);assert.ok(!r.data.items.some(i=>i.room_id===room),'not linked: '+why);
    assert.deepEqual(r.data.warnings,[],'not linked is a decision, not a read failure: '+why);
  }
  // Every name source counts: a second name in the roster or in the cafe24-synced LMS rows blocks the link.
  // Only cafe24-synced LMS rows (teacher_uid set) and c24 present rows count — /api/attendance/join can write a c24 room and a
  // name without logging in (it cannot write teacher_uid), and a public-room login is not an LMS record.
  db.exec(`INSERT INTO students_erp VALUES('kidag','','호호호'),('mangoai_kidah',NULL,'파파파 MANGOAI');
INSERT INTO class_schedules(id,user_id,teacher_id,status,scheduled_date,start_time,duration_min,source,created_at,student_name) VALUES
(230,'kidag','1','active','2026-10-26','16:00',20,'adm-enroll:7',1,'하하하'),
(231,'kidah','1','active','2026-10-26','16:20',20,'adm-enroll:8',1,'파파파'),
(232,'kidai','1','active','2026-10-26','16:40',20,'adm-enroll:9',1,'카카카'),
(233,'kidaz','1','active','2026-10-26','15:40',20,'adm-enroll:10',1,'자자자');
INSERT INTO attendance(room_id,role,joined_at,account_uid,user_id,date,status,teacher_uid,username) VALUES
('c24-930','student',${kst('2026-10-27','16:00')},NULL,'mangoai_kidag','2026-10-27','present','184','하하하 MANGOAI'),
('c24-940','student',${kst('2026-10-27','16:20')},NULL,'mangoai_kidah','2026-10-27','present','184','파파파 MANGOAI'),
('c24-941','student',${kst('2026-10-26','16:20')},NULL,'mangoai_kidah','2026-10-26','present','184','타타타 MANGOAI'),
('c24-950','student',${kst('2026-10-27','16:40')},NULL,'mangoai_kidai','2026-10-27','present','184','카카카 MANGOAI'),
('c24-951','student',${kst('2026-10-25','16:40')},NULL,'mangoai_kidai','2026-10-25','present',NULL,'거거거'),
('mangoi-class','student',${kst('2026-10-24','16:40')},'mangoai_kidai','mangoai_kidai','2026-10-24','attended',NULL,'너너너'),
('c24-952','student',${kst('2026-11-02','16:40')},NULL,'mangoai_kidai','2026-11-02','scheduled','184','더더더');`);
  for (const [id, room, why] of [['230','c24-930','the roster username names someone else (korean_name is only an empty string)'],
    ['231','c24-940','a cafe24-synced LMS row carries a second name']]) {
    const r = await request({schedule_id:id,date:'2026-10-28'});
    assert.equal(r.status,200);assert.ok(!r.data.items.some(i=>i.room_id===room),'not linked: '+why);
    assert.deepEqual(r.data.warnings,[],'not linked: '+why);
  }
  const linked = await request({schedule_id:'232',date:'2026-10-28'});
  assert.ok(linked.data.items.some(i=>i.room_id==='c24-950'),'a name in an anonymous c24 row, a public-room login or a cafe24 «scheduled» seed never blocks (or makes) a link');
  // The roster korean_name is a real name source on its own: here the reservation and the roster username only carry the id.
  db.exec(`INSERT INTO students_erp VALUES('kidak','라라라','kidak');
INSERT INTO class_schedules(id,user_id,teacher_id,status,scheduled_date,start_time,duration_min,source,created_at,student_name) VALUES
(235,'kidak','1','active','2026-10-26','15:00',20,'adm-enroll:12',1,'kidak');
INSERT INTO attendance(room_id,role,joined_at,account_uid,user_id,date,status,teacher_uid,username) VALUES
('c24-960','student',${kst('2026-10-27','15:00')},NULL,'mangoai_kidak','2026-10-27','present','184','라라라 MANGOAI');`);
  assert.ok((await request({schedule_id:'235',date:'2026-10-28'})).data.items.some(i=>i.room_id==='c24-960'),'linked through the roster korean_name');
  const alone = await request({schedule_id:'233',date:'2026-10-28'});
  assert.deepEqual(alone.data.warnings,[],'a student without a twin account: no warning');
  assert.deepEqual(alone.data.items.map(i=>i.room_id),['class-233-20261026']);
  // More than 1000 name rows: the check is not trusted (warning), never a link.
  db.exec(`INSERT INTO class_schedules(id,user_id,teacher_id,status,scheduled_date,start_time,duration_min,source,created_at,student_name)
WITH RECURSIVE c(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM c WHERE n<1001) SELECT 5000+n,'kidaj','9','cancelled','2025-01-01','10:00',20,'x',1,'이름'||n FROM c;
INSERT INTO class_schedules(id,user_id,teacher_id,status,scheduled_date,start_time,duration_min,source,created_at,student_name) VALUES
(234,'kidaj','1','active','2026-10-26','15:20',20,'adm-enroll:11',1,'이름1');`);
  assert.ok((await request({schedule_id:'234',date:'2026-10-28'})).data.warnings.includes('twin_account'),'name rows over the limit → warning');
  db.exec(`DELETE FROM class_schedules WHERE user_id='kidaj'`);
  // With the production-like schema, the opening privacy check still holds.
  const own = await request();
  assert.ok(!JSON.stringify(own).includes('PRIVATE_OTHER_STUDENT'));assert.ok(!own.data.warnings.includes('twin_account'));
  // The placeholder account `lms` (old-LMS occupancy rows) is never the twin of `mangoai_lms`, even with a matching name.
  db.exec(`UPDATE attendance SET username='가가나 MANGOAI' WHERE user_id='mangoai_lms';
UPDATE class_schedules SET student_name='가가나 MANGOAI' WHERE user_id='mangoai_lms';
INSERT INTO class_schedules(id,user_id,teacher_id,status,scheduled_date,start_time,duration_min,source,created_at,student_name) VALUES
(220,'lms','1','active','2026-10-25','10:00',20,'lms_import_w26',1,'가가나');`);
  const placeholder = await request({schedule_id:'',room_id:'c24-900',student_uid:'mangoai_lms',date:'2026-10-28'});
  assert.equal(placeholder.status,200);assert.ok(!placeholder.data.items.some(i=>i.schedule_id===220),'placeholder `lms` rows never join');
  // An unread name check is a warning — and the student's own half still shows (never a silently shorter history).
  db.exec('ALTER TABLE students_erp RENAME TO students_erp_off');
  const unread = await fromRes();assert.equal(unread.status,200);
  assert.ok(unread.data.warnings.includes('twin_account'),'twin names unreadable → warning');
  assert.deepEqual(rooms(unread),['class-200-20261026','class-201-20261020'],'…and only the confirmed account is shown');
  db.exec('ALTER TABLE students_erp_off RENAME TO students_erp');
  assert.deepEqual((await fromRes()).data.warnings,[]);
  globalThis.__historyActor={ok:true,isTeacher:true,username:'teacher_c',name:'Teacher C',role:'teacher'};
  assert.equal((await fromRes()).status,403,'merging twins never widens who may open the history');
  globalThis.__historyActor={ok:true,isTeacher:true,username:'teacher_a',name:'Teacher A',role:'teacher'};
}
Date.now=realNow;
// 🎌 Month-grid labels (2026-11-03 teacher suggestion «month option at Summary / Calendar like the manager's page»): the history
// carries the month's KR/PH holidays from the same three sources as the manager's calendar, and each reservation's lesson type.
// Holidays are labels only — an unread table means «no label», never a failed history or a changed lesson state.
{
  db.exec(`CREATE TABLE holidays(id INTEGER PRIMARY KEY,country TEXT,date TEXT,name TEXT,source TEXT);
INSERT INTO holidays(country,date,name) VALUES('KR','2026-10-03','National Foundation Day'),('KR','2026-10-09','Hangeul Day'),
  ('KR','2026-10-05','Observed Day'),('PH','2026-10-31','All Saints Eve'),('KR','2026-11-01','Next Month Day'),('JP','2026-10-12','Not a KR/PH day');
ALTER TABLE enroll_holidays ADD COLUMN name TEXT;
INSERT INTO enroll_holidays VALUES('2026-10-14','Academy closed'),('2026-10-15',NULL);
CREATE TABLE calendar_events(id INTEGER PRIMARY KEY,event_type TEXT,title TEXT,date TEXT,end_date TEXT,country TEXT);
INSERT INTO calendar_events(event_type,title,date,end_date,country) VALUES('holiday','Chuseok','2026-09-29','2026-10-02','KR'),
  ('holiday','Substitute Holiday','2026-10-05',NULL,'KR'),('holiday','National Foundation Day','2026-10-03',NULL,'KR'),
  ('vacation','Teacher trip','2026-10-20',NULL,NULL);
ALTER TABLE class_schedules ADD COLUMN class_type TEXT;
UPDATE class_schedules SET class_type='trial' WHERE id=1;`);
  const labels = r => r.data.holidays.map(h => h.date + ' ' + h.country + ' ' + h.name);
  const base = await request();assert.equal(base.status,200);
  assert.deepEqual(labels(base), ['2026-10-01 KR Chuseok','2026-10-02 KR Chuseok','2026-10-03 KR National Foundation Day',
    '2026-10-05 KR Observed Day','2026-10-05 KR Substitute Holiday','2026-10-09 KR Hangeul Day','2026-10-14 KR Academy closed','2026-10-15 KR ','2026-10-31 PH All Saints Eve'],
    'this month only · KR/PH only · a multi-day event per day · the same name once · two names on one day both stay');
  assert.equal(base.data.items.find(i => i.schedule_id === 1).class_type, 'trial', 'reservation carries its lesson type');
  assert.ok(base.data.items.filter(i => i.schedule_id === 5).every(i => !('class_type' in i)), 'unknown type is left out, never guessed');
  const sep = await request({month:'2026-09'});
  assert.deepEqual(labels(sep), ['2026-09-29 KR Chuseok','2026-09-30 KR Chuseok'], 'the other month gets its own days of the same event');
  // Each source fails alone; all failing still gives the same lessons and no new warning.
  const mine = /FROM (holidays|enroll_holidays|calendar_events)\b/;
  const ownQuery = sql => mine.test(sql) && !/^\s*SELECT day FROM enroll_holidays/.test(sql);   // the ledger's own holiday read is not a label read
  globalThis.__historyFail = sql => ownQuery(sql) && /FROM holidays\b/.test(sql);
  const oneDown = await request();
  globalThis.__historyFail = sql => ownQuery(sql);
  const allDown = await request();
  globalThis.__historyFail = undefined;
  assert.equal(oneDown.status,200);assert.ok(!labels(oneDown).some(l => /Hangeul|All Saints/.test(l)) && labels(oneDown).includes('2026-10-05 KR Substitute Holiday'), 'one source down, the others still label');
  assert.equal(allDown.status,200,'labels never fail the history');assert.deepEqual(allDown.data.holidays,[]);
  assert.deepEqual(allDown.data.items.map(i => i.date + i.state), base.data.items.map(i => i.date + i.state), 'lesson states do not depend on labels');
  assert.deepEqual(allDown.data.warnings, base.data.warnings, 'no warning for a missing label');
  db.exec(`DELETE FROM enroll_holidays;DROP TABLE holidays;DROP TABLE calendar_events;UPDATE class_schedules SET class_type=NULL;`);
}
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
    document: { documentElement: { lang: 'en' }, head: new El('head'), body: new El('body'), createElement: t => new El(t), createTextNode: x => { const n = new El('#text'); n.textContent = x; return n; }, activeElement: null, querySelectorAll: () => [], addEventListener() {} },
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
  // twin_account says what is missing (the student's other account); other warnings do not claim it.
  const screenFor = async warnings => {
    reply = { ...reply, warnings };
    api.open({ scheduleId: '5', roomId: '', studentUid: '', date: '2026-10-27', name: 'S' });
    for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0));
    return dctx.document.body.children.at(-1).textContent;
  };
  const twinShown = await screenFor(['twin_account']);
  assert.ok(/other account/.test(twinShown) && /Some records/.test(twinShown), 'twin_account: generic + other-account line');
  const lmsShown = await screenFor(['lms_attendance']);
  assert.ok(/Some records/.test(lmsShown) && !/other account/.test(lmsShown), 'other warnings do not mention the other account');
  // 🗓 Month grid like the manager's calendar (2026-11-03): each lesson card shows type · time range · teacher · [status] · report,
  // holidays are labelled (KR red / PH blue), and «This month» jumps back. Real renderer + the page's real time helper.
  {
    const helper = vm.createContext({});
    vm.runInContext("var mode='12';" + block('  function time(value){') + '\n' + block('  function range(c){'), helper);
    dctx.window.MangoiClassDisplay = { time: helper.time, range: helper.range };
    const tree = el => [el, ...el.children.flatMap(tree)];
    const dlg = dctx.document.body.children.at(-1);
    const cls = (el, c) => String(el.className || '').split(' ').includes(c);
    reply = { ok: true, before: '2026-10-29', warnings: [], previous: null,
      holidays: [{ date: '2026-10-03', name: 'National Foundation Day', country: 'KR' }, { date: '2026-10-31', name: 'All Saints Eve', country: 'PH' },
        { date: '2026-10-15', name: '', country: 'KR' }],
      items: [
        { date: '2026-10-01', start: '17:50', duration_min: 20, class_type: 'regular', teacher_name: 'KAYE', state: 'student_absent', label_en: 'Student absent', label_ko: '학생 결석', report_loaded: true },
        { date: '2026-10-06', start: '17:50', duration_min: 20, class_type: 'regular', teacher_name: 'KAYE', state: 'absence_hold', label_en: 'Paused (absences)', label_ko: '결석 보류', report_loaded: true },
        { date: '2026-10-08', start: '17:50', duration_min: 20, class_type: 'trial', teacher_name: 'KAYE', state: 'done', label_en: 'Done', label_ko: '완료', feedback: { note_en: 'Great' } },
        { date: '2026-10-13', start: '17:50', duration_min: 20, teacher_name: null, state: 'done', label_en: 'Done', label_ko: '완료', report_loaded: false, teacher_changed: true },
        { date: '2026-10-20', start: '13:00', duration_min: null, teacher_name: 'Teacher A', teacher_source: 'lms', state: 'done', label_en: 'Attended (old LMS)', label_ko: '출석 (옛 LMS)' },
        { date: '2026-10-29', start: '19:40', duration_min: 20, class_type: 'regular', teacher_name: 'KAYE', state: 'upcoming', label_en: 'Upcoming', label_ko: '예정' }] };
    const openOct = async () => { api.open({ scheduleId: '5', roomId: '', studentUid: '', date: '2026-10-29', name: 'S' });
      for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0)); };
    await openOct();
    const chips = () => tree(dlg).filter(e => cls(e, 'cal-chip'));
    const chipOn = date => chips().find(c => (c.attrs['aria-label'] || '').startsWith(date));
    const text = date => chipOn(date).textContent;
    assert.equal(chips().length, 6, 'one card per lesson');
    assert.match(text('2026-10-01'), /Regular class.*5:50pm – 6:10pm · 20 min.*KAYE.*Student absent.*Report: not written/, 'card lines in the manager order');
    assert.ok(!/Report/.test(text('2026-10-06')), 'a paused day owes no report');
    assert.match(text('2026-10-08'), /Trial class.*Report: written/, 'written feedback shows, with the lesson type');
    assert.match(text('2026-10-13'), /^5:50pm – 6:10pm · 20 min Teacher not recorded Done · Teacher changed Report: could not check$/, 'no guessed type · unread report says so');
    assert.match(text('2026-10-20'), /^1:00pm Teacher A Attended \(old LMS\) Report: not written$/, 'old-LMS row: start time only (no duration)');
    assert.ok(/7:40pm – 8:00pm · 20 min/.test(text('2026-10-29')) && !/Report/.test(text('2026-10-29')), 'upcoming: no report line yet');
    assert.match(chipOn('2026-10-01').attrs['aria-label'], /^2026-10-01 · Regular class · 5:50pm – 6:10pm · 20 min · KAYE · Student absent · Report: not written$/, 'screen readers get the same lines');
    // Holidays: cells, names, colours (a KR holiday turns the day number red even on a Saturday; PH does not).
    const cell = day => tree(dlg).find(e => cls(e, 'cal-day') && e.children[0] && e.children[0].textContent === String(day));
    assert.ok(cls(cell(3), 'cal-hol') && !cls(cell(3), 'cal-hol-ph') && /National Foundation Day/.test(cell(3).textContent), 'KR holiday cell + name');
    assert.ok(cls(cell(3).children[0], 'cal-sun'), 'KR holiday: red day number on a Saturday');
    assert.ok(cls(cell(31), 'cal-hol-ph') && cls(cell(31).children[0], 'cal-sat') && /All Saints Eve/.test(cell(31).textContent), 'PH holiday: blue cell, number keeps its weekday colour');
    assert.ok(/^15 Holiday$/.test(cell(15).textContent), 'unnamed holiday says «Holiday»');
    assert.ok(!cls(cell(4), 'cal-hol'), 'ordinary day is not a holiday');
    // A card opens the List view at its day; the view bar follows.
    const viewButtons = tree(dlg).find(e => cls(e, 'history-view')).children;
    chipOn('2026-10-08').onclick();
    assert.equal(viewButtons[1].attrs['aria-pressed'], 'true', 'card → List view');
    assert.ok(tree(dlg).some(e => cls(e, 'history-day') && /^2026-10-08/.test(e.textContent)), 'List view shows that day');
    viewButtons[0].onclick();assert.equal(viewButtons[0].attrs['aria-pressed'], 'true');
    // «This month»: from another month, one tap loads the current KST month; on the current month it does nothing.
    const navButtons = tree(dlg).find(e => e.tagName === 'nav').children.filter(e => e.tagName === 'button');
    const thisMonth = navButtons.find(b => b.textContent === 'This month');
    assert.ok(thisMonth, '«This month» button is in the month bar');
    const nowMonth = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 7), before = urls.length;
    thisMonth.onclick();for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0));
    assert.equal(urls.length, before + (nowMonth === '2026-10' ? 0 : 1));
    assert.equal(new URLSearchParams(urls.at(-1).split('?')[1]).get('month'), nowMonth, 'requests the current KST month');
    const again = urls.length;thisMonth.onclick();assert.equal(urls.length, again, 'already on this month: no extra request');
    // Korean page: same cards in Korean.
    dctx.document.documentElement.lang = 'ko';await openOct();
    assert.match(text('2026-10-01'), /정규수업.*KAYE.*학생 결석.*보고서: 미작성/);
    assert.ok(navButtons.some(b => b.textContent === '이번 달') && /공휴일/.test(cell(15).textContent), 'Korean labels');
    dctx.document.documentElement.lang = 'en';
    // ✎ (2026-11-11) the real renderer draws Write feedback in BOTH views, only where the server said can_write === true.
    const wbase = { start: '17:50', duration_min: 20, teacher_name: 'KAYE', state: 'done', label_en: 'Done', label_ko: '완료', report_loaded: true, student_uid: 's1' };
    reply = { ok: true, before: '2026-10-29', warnings: [], previous: null, holidays: [], items: [
      { ...wbase, date: '2026-10-02', room_id: 'class-5-20261002', can_write: true },
      { ...wbase, date: '2026-10-09', room_id: 'class-5-20261009', can_write: false },
      { ...wbase, date: '2026-10-16', room_id: 'class-5-20261016', can_write: 'true' },
      { ...wbase, date: '2026-10-23', room_id: 'class-5-20261023' }] };
    const openWith = async writer => { api.open({ scheduleId: '5', roomId: '', studentUid: '', date: '2026-10-29', name: 'S', onWrite: writer });
      for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0)); };
    const writes = () => tree(dlg).filter(e => cls(e, 'cal-write'));
    await openWith(() => {});
    assert.deepEqual(writes().map(b => b.attrs['aria-label']), ['Write feedback · 2026-10-02 17:50'], 'month view: ✎ only on the can_write lesson');
    assert.ok(cell(2).children.includes(writes()[0]), '…drawn inside that day cell');
    viewButtons[1].onclick();
    assert.deepEqual(writes().map(b => b.attrs['aria-label']), ['Write feedback · 2026-10-02 17:50'], 'list view: the same lesson only');
    assert.ok(tree(dlg).some(e => cls(e, 'history-lesson') && e.children.includes(writes()[0])), '…drawn inside that lesson');
    viewButtons[0].onclick();
    await openWith(undefined);
    assert.equal(writes().length, 0, 'a page without a writer → no button');
  }
}

/* ✎ (2026-11-11 teacher request «add and write feedback at summary / calendar»)
   The server marks can_write (markWritableLessons); the calendar draws ✎ only then; teacher.html opens its own class-log window. */
{
  const base={date:'2026-10-23',start:'19:00',state:'done',room_id:'class-1-20261023',student_uid:'student_one',report_loaded:true};
  const NOW=Date.parse('2026-10-23T19:00:00+09:00');
  const one=(over,mine=()=>true,now=NOW)=>markWritableLessons({items:[{...base,...over}]},mine,now).items[0].can_write;
  assert.equal(one({}),true,'mine + due + started + no report → writable');
  assert.equal(one({},()=>false),false,'not my lesson → no button');
  assert.equal(one({},()=>'yes'),false,'only a real true counts as mine');
  assert.equal(one({},()=>true,NOW-60000),false,'not started yet → no button');
  assert.equal(one({feedback:{id:1}}),false,'report already written → no button');
  assert.equal(one({report_loaded:false}),false,'«could not check» never becomes «not written»');
  for (const st of ['postponed','cancelled','holiday','leave','upcoming','paused']) assert.equal(one({state:st}),false,'no report due: '+st);
  for (const st of ['done','student_absent','late_postpone','unknown']) assert.equal(one({state:st}),true,'report due: '+st);
  assert.equal(one({room_id:''}),false,'no room → no button');
  assert.equal(one({student_uid:''}),false,'no student account → no button');
  // «My lesson» — exact names only; old LMS needs both numbers known.
  const mine=new Set(['ANNA','TEACHER A']);
  assert.equal(isMyLesson({teacher_name:'anna '},mine,''),true,'same name, case/space-insensitive');
  for (const other of ['HANNAH','TEACHER AB','TEACHER','A','ANNA B',null,'']) assert.equal(isMyLesson({teacher_name:other},mine,''),false,'never a substring/shared word: '+other);
  assert.equal(isMyLesson({teacher_source:'lms',lms_teacher_uid:'184'},mine,'184'),true,'old LMS: my cafe24 number');
  assert.equal(isMyLesson({teacher_source:'lms',lms_teacher_uid:'185'},mine,'184'),false,'old LMS: another number');
  assert.equal(isMyLesson({teacher_source:'lms',lms_teacher_uid:null},mine,''),false,'old LMS: both unknown is not «equal»');
  assert.equal(isMyLesson({teacher_source:'lms',lms_teacher_uid:''},mine,''),false);
  assert.equal(isMyLesson({teacher_source:'lms',lms_teacher_uid:'184',teacher_name:'ANNA'},mine,''),false,'old LMS never falls back to the name');
  // Fail closed: an unread twin account, a report seen by the calendar, or the old LMS naming another teacher → no ✎.
  assert.equal(markWritableLessons({items:[{...base}],warnings:['twin_account']},()=>true,NOW).items[0].can_write,false,'twin reports unread → no buttons at all');
  assert.equal(markWritableLessons({items:[{...base}],warnings:['lms_attendance']},()=>true,NOW).items[0].can_write,true,'other warnings do not block');
  assert.equal(one({today_eval:{id:7}}),false,'the calendar already found a report → no button');
  assert.equal(one({lms_disagrees:true}),false,'the old LMS says another teacher taught → no button');
  const strip=markWritableLessons({items:[{...base,lms_teacher_uid:'24'}],previous:{lms_teacher_uid:'24'}},()=>true,NOW);
  assert.ok(!JSON.stringify(strip).includes('lms_teacher_uid'),'cafe24 teacher numbers never leave the server');
  assert.ok(!JSON.stringify(markWritableLessons({items:[{...base,lms_disagrees:true}]},()=>true,NOW)).includes('lms_disagrees'),'internal flag dropped');

  // Real handler + SQLite: teacher A (id 1) — own lessons only, never the substitute's day or another teacher's.
  globalThis.__historyFail=null;globalThis.__ledgerThrow=null;   // earlier sections inject read failures
  db.exec('DROP TABLE IF EXISTS student_evaluations; ALTER TABLE full_evaluations RENAME TO student_evaluations');   // the fixture reports again
  globalThis.__historyActor={ok:true,isTeacher:true,username:'teacher_a',name:'Teacher A',role:'teacher'};
  let r=await request();assert.equal(r.status,200);
  const at=d=>r.data.items.filter(i=>i.date===d);
  const room=x=>r.data.items.find(i=>i.room_id===x);
  assert.ok(r.data.items.every(i=>typeof i.can_write==='boolean'),'every lesson says yes or no');
  assert.equal(at('2026-10-23')[0].can_write,true,'own past lesson without a report → writable');
  assert.equal(at('2026-10-26')[0].can_write,true,'own weekly lesson (past) → writable');
  assert.equal(at('2026-10-20')[0].can_write,false,'another teacher\'s lesson (report written) → not');
  assert.equal(room('class-2-20261021').can_write,false,'substitute day belongs to the substitute');
  assert.ok(!JSON.stringify(r.data).includes('lms_teacher_uid'));
  globalThis.__historyActor={ok:true,isTeacher:true,username:'teacher_c',name:'Teacher C',role:'teacher'};
  r=await request({schedule_id:'2',date:'2026-10-21'});assert.equal(r.status,200);
  assert.equal(room('class-2-20261021').can_write,false,'report already written → no button even for the substitute');
  db.exec("DELETE FROM student_evaluations WHERE room_id='class-2-20261021'");
  r=await request({schedule_id:'2',date:'2026-10-21'});assert.equal(r.status,200);
  assert.equal(room('class-2-20261021').can_write,true,'the substitute owns that day');
  assert.equal(at('2026-10-23')[0].can_write,false,'substitute does not own teacher A\'s other days');
  globalThis.__historyActor={ok:true,isTeacher:true,username:'teacher_a',name:'Teacher A',role:'teacher'};
  // Client: the calendar's button and teacher.html's bridge, cut out of the real files and executed.
  const cut=(src,name)=>{const i=src.indexOf('function '+name+'(');assert.ok(i>=0,'found '+name);let d=0,j=src.indexOf('{',i);for(;j<src.length;j++){if(src[j]==='{')d++;else if(src[j]==='}'&&--d===0)break;}return src.slice(i,j+1);};
  const hist=readFileSync(root+'cloudflare-deploy/public/js/teacher-student-history.js','utf8');
  const page=readFileSync(root+'cloudflare-deploy/public/teacher.html','utf8');
  const fakeEl=tag=>({tag,children:[],attrs:{},className:'',textContent:'',appendChild(c){this.children.push(c);return c;},setAttribute(k,v){this.attrs[k]=v;}});
  const calls=[];
  const mk=new Function('context','dialog','document','t','element','button',cut(hist,'writeButton')+';return writeButton;');
  const doc={createTextNode:x=>({text:x})};
  const el=(tag,text)=>{const e=fakeEl(tag);if(text!=null)e.textContent=text;return e;};
  const btn=(text,fn)=>{const b=el('button',text);b.onclick=fn;return b;};
  const ctx={onWrite:row=>calls.push(['write',row.room_id])};
  const dlg={addEventListener(type,fn){if(type==='close')this.after=fn;},close(){calls.push(['close']);const f=this.after;this.after=null;if(f)f();}};
  const wb=mk(ctx,dlg,doc,(en)=>en,el,btn);
  assert.equal(wb({...base,can_write:true}).className,'cal-write','writable → ✎ button');
  for (const v of [undefined,false,'true',1]) assert.equal(wb({...base,can_write:v}),null,'only can_write === true draws it: '+v);
  assert.equal(mk({},dlg,doc,(en)=>en,el,btn)({...base,can_write:true}),null,'no writer on the page → no button');
  wb({...base,can_write:true}).onclick();
  assert.deepEqual(calls,[['close'],['write','class-1-20261023']],'closes the calendar, then opens the class log for that lesson');
  assert.ok(/forEach\(function \(row\) \{ cell\.appendChild\(lessonChip\(row, date\)\); var wb = writeButton\(row\)/.test(hist),'month view draws it');
  assert.ok(/note\(lesson, row\.feedback\); var wb = writeButton\(row\)/.test(hist),'list view draws it');
  assert.ok(/onWrite:function\(row\)\{openEval\(historyEvalItem\(row\)\);\}/.test(page),'teacher page wires the calendar to openEval');
  const bridge=new Function('DATA','WK_DATA','stuUid',cut(page,'historyEvalItem')+';return historyEvalItem;');
  const stuUid=c=>String(c&&c.student_uid||'').trim();
  const D={classes:[{student_uid:'student_other',student_name:'OTHER',level:'Lv 9'},{student_uid:'student_one',student_name:'ONE',level:'Lv 3',eval_band:'grow'}]};
  let it=bridge(D,null,stuUid)({...base,state:'done',duration_min:20,schedule_id:1});
  assert.equal(it.student_uid,'student_one');assert.equal(it.student_name,'ONE');assert.equal(it.level,'Lv 3','borrows name/level from the SAME account only');
  assert.equal(it.room_id,'class-1-20261023');assert.equal(it.class_date,'2026-10-23');assert.equal(it.start_time,'19:00');
  assert.equal(it.attendance,null,'attendance is not guessed');
  assert.deepEqual(bridge(D,null,stuUid)({...base,state:'student_absent'}).attendance,{state:'absent'},'recorded absence is pre-selected');
  it=bridge({classes:[{student_uid:'student_other',student_name:'OTHER',level:'Lv 9'}]},null,stuUid)({...base,student_uid:'twin_x'});
  assert.equal(it.student_uid,'twin_x');assert.equal(it.student_name,'');assert.equal(it.level,'','never borrows another student');
  assert.ok(/teacher-student-history\.js\?v=\d+'/.test(page),'the page loads the script with a cache version');
}
console.log(`PASS: ${matrix} distinct matrix scenarios plus integration cases: real SQLite history, cross-teacher records, report-free previous teacher, substitutes, leap dates, month boundaries, orphan/legacy reports, authorization, read failures and SELECT-only reads.`);
db.close();
