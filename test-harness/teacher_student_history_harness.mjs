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
db.exec(`ALTER TABLE attendance ADD COLUMN teacher_uid TEXT;
ALTER TABLE attendance ADD COLUMN left_at INTEGER;
CREATE TABLE teacher_profiles(korean_name TEXT,english_name TEXT);
INSERT INTO teacher_profiles VALUES('티처A','Teacher A');
CREATE TABLE teacher_payroll_auto(teacher_id INTEGER,teacher_name TEXT);
INSERT INTO teacher_payroll_auto VALUES(184,'Teacher A'),(184,'Teacher A'),(1,'Someone Else'),(77,'Teacher X'),(77,'Teacher Y');
INSERT INTO attendance(room_id,role,joined_at,account_uid,user_id,date,status,teacher_uid,left_at) VALUES
('c24-900','student',1793073600000,NULL,'mangoai_lms','2026-10-27','present','184',1793074800000),
('c24-899','student',1792468800000,NULL,'mangoai_lms','2026-10-20','present','77',NULL),
('c24-800','student',1790654400000,NULL,'mangoai_lms','2026-09-29','present','184',1790655600000),
('c24-901','student',1793077200000,NULL,'lms_other','2026-10-27','present','1',1793078400000);
INSERT INTO student_evaluations VALUES(30,'mangoai_lms',NULL,'c24-899','2026-10-28','Teacher Y','teacher_y',1792558800000,'LMS lesson feedback',NULL,NULL,NULL);`);
const lms=p=>request({schedule_id:'',room_id:'c24-900',student_uid:'mangoai_lms',date:'2026-10-28',...p});
let lmsResult=await lms();assert.equal(lmsResult.status,200,'old-LMS row opens without a schedule id');
assert.equal(lmsResult.data.before,'2026-10-27','the LMS lesson date is the reference, not the client date');
assert.deepEqual(lmsResult.data.warnings,[]);
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
db.exec(`INSERT INTO class_schedules(id,user_id,teacher_id,status,scheduled_date,start_time,duration_min,source,created_at) VALUES
(80,'mangoai_lms','1','active','2026-10-27','13:00',20,'c24-mirror',1);`);
const lmsDeduped=(await lms()).data.items.filter(i=>i.date==='2026-10-27');
assert.deepEqual(lmsDeduped.map(i=>i.room_id),['class-80-20261027'],'a Mangoi reservation at the exact LMS slot is shown once');
globalThis.__historyActor={ok:true,isTeacher:true,username:'teacher_c',name:'Teacher C',role:'teacher'};
assert.equal((await lms()).status,403,'a teacher without a cafe24 number cannot open LMS rooms');
globalThis.__historyActor={ok:true,isTeacher:true,username:'teacher_a',name:'Teacher A',role:'teacher'};
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
console.log(`PASS: ${matrix} distinct matrix scenarios plus integration cases: real SQLite history, cross-teacher records, report-free previous teacher, substitutes, leap dates, month boundaries, orphan/legacy reports, authorization, read failures and SELECT-only reads.`);
db.close();
