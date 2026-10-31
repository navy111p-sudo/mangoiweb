// Execute the real display functions and real previous-lesson SQL in isolated SQLite.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
const html = readFileSync(new URL('../cloudflare-deploy/public/teacher.html', import.meta.url), 'utf8');
const helper = readFileSync(new URL('../cloudflare-deploy/src/teacher-previous-lessons.ts', import.meta.url), 'utf8');
const chunk = readFileSync(new URL('../cloudflare-deploy/src/d1-chunk.ts', import.meta.url), 'utf8');
let checks=0;
function check(v, message){checks++;assert.ok(v, message);}
function fn(name){const a=html.indexOf('  function '+name+'(');const b=html.indexOf('\n  function ',a+10);return html.slice(a,b);}
const elements={'portal-search':{value:''},'portal-academy':{value:''},'class-time-sort':{value:'asc'}};
const ctx={document:{getElementById:id=>elements[id],addEventListener(){},querySelectorAll:()=>[]},window:{addEventListener(){}},localStorage:{getItem:()=>null},stuName:c=>c.student_name,stuUid:c=>c.student_uid,EN:()=>true,T:en=>en,esc:x=>String(x??'').replaceAll('<','&lt;').replaceAll('>','&gt;')};
vm.createContext(ctx);
vm.runInContext(html.match(/<script>\s*\/\* Class display:[\s\S]*?<\/script>/)[0].replace(/^<script>|<\/script>$/g,''),ctx);
ctx.MangoiClassDisplay=ctx.window.MangoiClassDisplay;
ctx.clsToday=()=>'2026-10-28';
vm.runInContext([fn('portalRows'),fn('clsDayLabel'),fn('clsPastDate'),fn('clsDaySepHtml'),fn('sortClassesByTime'),fn('previousLessonHtml'),fn('extrasHtml')].join('\n'),ctx);
for(let n=0;n<1440;n++){
  const h=Math.floor(n/60),m=n%60,start=`${h}:${String(m).padStart(2,'0')}`;
  const want=`${h%12||12}:${String(m).padStart(2,'0')}${h<12?'am':'pm'}`;
  check(ctx.MangoiClassDisplay.time(start)===want,'AM/PM minute '+n);
  const range=ctx.MangoiClassDisplay.range({start_time:start,duration_min:20});
  check(range.startsWith(want+' – ') && range.includes('20 min') && range.includes('(+1d)')===(n>=1420),'range minute '+n);
}
for(let seed=0;seed<320;seed++){
  const rows=Array.from({length:18},(_,i)=>{const n=(seed*31+i*137)%1440;return {student_uid:String(i),student_name:'Student',start_time:`${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`,n};});
  rows.push({student_uid:'unknown',student_name:'Student',n:null});
  const copy=rows.slice();
  for(const direction of ['asc','desc']){
    elements['class-time-sort'].value=direction;
    const result=ctx.portalRows(rows);
    const want=rows.filter(x=>x.n!==null).sort((a,b)=>direction==='asc'?a.n-b.n:b.n-a.n).concat(rows.at(-1));
    check(result.map(x=>x.student_uid).join()===want.map(x=>x.student_uid).join(),'portal numeric ordering '+seed+direction);
    check(ctx.sortClassesByTime(rows,direction).map(x=>x.student_uid).join()===want.map(x=>x.student_uid).join(),'daily fallback ordering '+seed+direction);
  }
  check(rows.every((r,i)=>r===copy[i]),'sorting retains action identity '+seed);
  const mixed=rows.map((r,i)=>({...r,start_ts:r.n!==null && i%2 ? Date.parse('2026-10-24T00:00:00+09:00')+r.n*60000 : undefined}));
  check(ctx.sortClassesByTime(mixed,'asc').map(x=>x.student_uid).join()===rows.filter(x=>x.n!==null).sort((a,b)=>a.n-b.n).concat(rows.at(-1)).map(x=>x.student_uid).join(),'mixed timestamp and wall-time ordering '+seed);
}
// 📅 (2026-10-28 강사 제안 «시간이 빠른 순으로 안 나온다») 오늘 목록에는 일지용 지난 14일 카페24 줄이 섞여 온다.
//   오늘 줄 먼저(고른 시간 순) → 지난 줄은 날짜+시각 순, 날짜가 바뀌는 지난 줄 앞에만 구분줄 하나.
const at=(d,t)=>({student_uid:d+' '+t,class_date:d,start_time:t,start_ts:Date.parse(`${d}T${t}:00+09:00`)});
const days=[at('2026-10-15','21:30'),at('2026-10-28','20:00'),at('2026-10-14','18:30'),at('2026-10-28','09:30'),at('2026-10-15','14:00'),at('2026-10-27','12:30')];
const daysAsc=ctx.sortClassesByTime(days,'asc'), daysDesc=ctx.sortClassesByTime(days,'desc');
check(daysAsc.map(x=>x.student_uid).join()==='2026-10-28 09:30,2026-10-28 20:00,2026-10-14 18:30,2026-10-15 14:00,2026-10-15 21:30,2026-10-27 12:30','today first, then earlier days by date+time (asc)');
check(daysDesc.map(x=>x.student_uid).join()==='2026-10-28 20:00,2026-10-28 09:30,2026-10-27 12:30,2026-10-15 21:30,2026-10-15 14:00,2026-10-14 18:30','today first, then earlier days by date+time (desc)');
const seps=daysAsc.map((_,i)=>ctx.clsDaySepHtml(daysAsc,i,true));
check(seps.slice(0,2).every(s=>s===''),'no divider before today rows');
check(seps[2].includes('10-14 (Wed)')&&seps[2].startsWith('<tr class="cls-day-sep"><td colspan="7">'),'divider before first earlier day');
check(seps[3].includes('10-15')&&seps[4]===''&&seps[5].includes('10-27'),'one divider per earlier date');
check(ctx.clsDaySepHtml(daysAsc,2,false).startsWith('<div class="cls-day-sep">'),'card divider');
check(ctx.clsPastDate({})===''&&ctx.clsPastDate({class_date:'2026-10-28'})==='','old cache rows and today rows stay in today group');
// 서버: 지난 카페24 줄(source='lms')은 «그 수업 날» 을 싣는다 — 공용 enrichClassesToday 가 오늘로 덮은 «뒤» 에.
const api=readFileSync(new URL('../cloudflare-deploy/src/api-teacher.ts', import.meta.url), 'utf8');
const keepLine=api.match(/\n  for \(const c of classes\) if \(c\.source === 'lms'[^\n]*\n/)?.[0]||'';
check(keepLine && api.indexOf(keepLine) > api.indexOf('await enrichClassesToday(env as any, classes, todayStr'),'lesson date kept after shared enrich');
// 아침 8시 KST = 전날 23시 UTC — KST 보정을 빠뜨리면 하루 앞 날짜가 된다(그래서 저녁이 아니라 아침으로 잰다).
const kept=[{source:'lms',start_ts:Date.parse('2026-10-14T08:00:00+09:00'),class_date:'2026-10-28'},{kind:'class',start_ts:Date.parse('2026-10-28T09:00:00+09:00'),class_date:'2026-10-28'}];
new Function('classes','KST',keepLine)(kept,9*3600*1000);
check(kept[0].class_date==='2026-10-14','LMS row keeps its own KST date (early morning)');
check(kept[1].class_date==='2026-10-28','today rows untouched');
ctx.hhmm=()=>'';
const feedback=ctx.extrasHtml({class_date:'2026-10-24',level:'<B2>',attendance:{state:'not_yet'}},-1);
check(feedback.includes('feedback-level')&&feedback.includes('&lt;B2&gt;'),'feedback level escaped');
check(!ctx.extrasHtml({class_date:'2026-10-24'},-1).includes('undefined'),'unknown level');
check(ctx.previousLessonHtml({previous_lesson_loaded:false}).includes('unavailable'),'failed history is not empty history');
check(ctx.previousLessonHtml({previous_lesson_loaded:true}).includes('no earlier class report'),'empty history');
check(ctx.previousLessonHtml({prev_lesson:{teacher_name:'<Teacher>',note_en:'<script>'}}).includes('&lt;Teacher&gt;'),'teacher escaped');
check(ctx.previousLessonHtml({prev_lesson:{teacher_name:'<Teacher>',note_en:'<script>'}}).includes('&lt;script&gt;'),'summary escaped');
const db=new DatabaseSync(':memory:');
db.exec('CREATE TABLE student_evaluations(id INTEGER PRIMARY KEY,student_uid TEXT,user_id TEXT,teacher_name TEXT,lesson_date TEXT,score_overall INTEGER,note_en TEXT,note_ko TEXT,teacher_comment TEXT,strengths TEXT,room_id TEXT,created_at INTEGER)');
const insert=db.prepare('INSERT INTO student_evaluations VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
const now=Date.parse('2026-10-24T12:00:00+09:00');
for(let i=0;i<210;i++){
  for(let day=19;day<=25;day++) insert.run(i*10+day-18,i%2?'u'+i:'',i%2?'legacy-other':'u'+i,'Teacher '+day,`2026-10-${day}`,4,'Note '+day,'요약 '+day,null,null,'class-'+i,Date.parse(`2026-10-${day}T10:00:00+09:00`));
}
let calls=0,maxBind=0;
const adapter={prepare(sql){return {bind(...args){calls++;maxBind=Math.max(maxBind,args.length);return {all:async()=>({results:db.prepare(sql).all(...args)})};}};}};
const sqlCtx={console,Date,Map,Set,Number};vm.createContext(sqlCtx);
vm.runInContext(stripTypeScriptTypes(chunk.replaceAll(/^export /gm,'')+'\n'+helper.replace(/^import[^\n]+\n/,'').replaceAll(/^export /gm,'')),sqlCtx);
const occurrences=[];
for(let day=20;day<=26;day++) for(let i=0;i<210;i++)occurrences.push({kind:'class',student_uid:'u'+i,class_date:`2026-10-${day}`});
occurrences.push({kind:'sample',student_uid:'u0',class_date:'2026-10-24'});
await sqlCtx.attachTeacherPreviousLessons(adapter,occurrences,now);
for(const it of occurrences.filter(it=>it.kind==='class')){
  const day=+it.class_date.slice(-2),expected=Math.min(day-1,24);
  check(it.prev_lesson?.teacher_name==='Teacher '+expected,'last report before selected occurrence '+it.class_date+it.student_uid);
  check(it.previous_lesson_loaded===true,'history load state');
}
check(maxBind<=100 && calls===21,'D1 chunks bounded per day');
check(occurrences.at(-1).prev_lesson===undefined,'sample rows excluded');
await sqlCtx.attachTeacherPreviousLessons({prepare(){throw new Error('offline');}},[{kind:'class',student_uid:'u0',class_date:'2026-10-24'}],now);
const missing=[{kind:'class',student_uid:'not-authorized-by-any-other-row',class_date:'2026-10-24'}];
await sqlCtx.attachTeacherPreviousLessons(adapter,missing,now);
check(missing[0].prev_lesson===null && missing[0].previous_lesson_loaded,'no cross-student history');
// ➕ (2026-10-28) 「➕ 지난 피드백 추가」 — 지난 수업 방(class-<예약>-<날짜>)에 «오늘» 쓴 일지도 지난 일지다(짝 포함)
insert.run(90001,'late','', 'Late Teacher','2026-10-23',null,'Backdated','늦게 쓴 일지',null,null,'class-55-20261023',now);
insert.run(90002,'late2','','Same Day','2026-10-24',null,'Today room','오늘 방',null,null,'class-56-20261024',now);
insert.run(90003,'late2','','Future','2026-10-25',null,'Future room','다음 방',null,null,'class-56-20261025',now);
insert.run(90004,'late3','','Odd room','2026-10-23',null,'Not deterministic','이상한 방',null,null,'class-x-20261023',now);
const late=[{kind:'class',student_uid:'late',class_date:'2026-10-24'},{kind:'class',student_uid:'late',class_date:'2026-10-23'},
  {kind:'class',student_uid:'late2',class_date:'2026-10-24'},{kind:'class',student_uid:'late3',class_date:'2026-10-24'}];
await sqlCtx.attachTeacherPreviousLessons(adapter,late,now);
check(late[0].prev_lesson?.eval_id===90001 && late[0].prev_lesson?.date==='2026-10-23','backdated report for an earlier room is the previous lesson');
check(late[1].prev_lesson===null,'a report for the same day is not that day\'s previous lesson (pair)');
check(late[2].prev_lesson===null,'same-day and future rooms written today are not previous lessons (pair)');
check(late[3].prev_lesson===null,'only deterministic class rooms are read as dates (pair)');
db.close();
console.log(`PASS ${checks} checks: all KST minutes, midnight, 320 schedule permutations, 1470 student/date SQL scenarios, chunks, escaping, absent history`);
