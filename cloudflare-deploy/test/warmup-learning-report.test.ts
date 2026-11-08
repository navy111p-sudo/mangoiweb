import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { readWarmupWeek, readParentWarmup, speakingVocabularyBetween, speakingVocabularyWeeks } from '../src/warmup-parent.ts';
import { WARMUP_LOG_DDL } from '../src/warmup-log.ts';

function database() {
  const sql = new DatabaseSync(':memory:');
  WARMUP_LOG_DDL.forEach(ddl => sql.exec(ddl));
  const db = { prepare(query: string) {
    const statement = sql.prepare(query);
    const bound = (args: any[]) => ({ all: async () => ({results: statement.all(...args)}), first: async () => statement.get(...args) });
    return {...bound([]), bind: (...args: any[]) => bound(args)};
  }};
  return {sql, db};
}
const now = Date.parse('2026-11-08T03:00:00Z');
const start = Date.parse('2026-11-01T15:00:00Z'); // November 2 midnight KST
test('week uses first reply, exact student identity, KST boundaries and excludes future replies', async () => {
  const {sql, db} = database();
  try {
    const insert = sql.prepare('INSERT INTO warmup_session_log(session_id,user_id,started_at,first_reply_at) VALUES(?,?,?,?)');
    for (const [id, uid, at] of [['old','Lee',start-1],['first','Lee',start],['again','Lee',start+1],['case','lee',start],['other','Kim',start],['silent','Lee',null],['today','Lee',now],['future','Lee',now+1]] as const) insert.run(id,uid,start-1000,at);
    const result = await readParentWarmup(db,'Lee',now);
    assert.equal(result.weekly_activity?.length,7);
    assert.deepEqual(result.weekly_activity?.map(d=>d.sessions),[2,0,0,0,0,0,1]);
    assert.equal(result.weekly_activity?.[0].date,'2026-11-02');
    assert.equal(result.weekly_activity?.[6].date,'2026-11-08');
    assert.equal((await readWarmupWeek(db,'lee',now))?.[0].sessions,1);
    assert.equal((await readWarmupWeek(db,'nobody',now))?.reduce((n,d)=>n+d.sessions,0),0);
  } finally {sql.close();}
});
test('unknown records never become a zero activity week', async () => {
  const broken = {prepare(){throw new Error('offline');}};
  assert.equal(await readWarmupWeek(broken,'Lee',now),null);
  assert.equal(await readWarmupWeek(broken,'Lee',NaN),null);
  assert.equal(await readWarmupWeek(broken,'',now),null);
  assert.equal(await readWarmupWeek({prepare(){return {bind(){return {all:async()=>({})};}};}},'Lee',now),null);
});

// Run the actual Worker correction gate, including its authentication and async log.
const source = readFileSync(new URL('../src/index.ts',import.meta.url),'utf8');
const begin = source.indexOf('    let showFix: any = null;',source.indexOf('async function handleWarmupChat'));
const end = source.indexOf('    /* 🧭',begin);
assert.ok(begin>=0 && end>begin);
const gate = stripTypeScriptTypes('(async()=>{'+source.slice(begin,end)+'\nawait parentLog; return {showFix,reviewFix};})()');
async function runGate(options:any = {}) {
  const logged:any[]=[];
  const fix={was:'She go yesterday.',now:'She went yesterday.',tag:'tense',severity:'major'};
  const context:any={
    rawFix:fix, ctxLang:'en', studentInput:fix.was, timing:'after-lesson', modelOk:true,
    sessionId:'session1',ctxUserId:'Lee',turnCount:1,honest:null,
    env:{SESSION_STATE:{get:async()=>null,put:async()=>{}}},body:{},request:{url:'https://mangoi.ai/api/warmup/chat'},URL,
    verifyWarmupFix:()=>fix,backfillPastTenseFix:()=>null,
    showDuringPractice:(timing:string)=>timing!=='after-lesson',
    decideWarmupFixShow:()=>({show:fix,memo:{}}),
    warmupShouldOfferRepeat:()=>true,gateFixForMode:()=>({show:null,repeat:false}),
    authUidFromRequest:async()=>options.uid ?? 'Lee',checkAdminSession:async()=>({ok:false}),
    logWarmupFix:async(_env:any,data:any)=>{logged.push(data);return true;},
    console:{warn(){}}, ...options.context,
  };
  const result = await vm.runInNewContext(gate,context);
  return {logged,result};
}
test('deferred correction is recorded for the authenticated student without a live correction card',async()=>{
  const {logged,result}=await runGate();
  assert.equal(result.showFix,null);
  assert.equal(logged.length,1);
  assert.equal(logged[0].fix.now,result.reviewFix.now);
  assert.equal(logged[0].userId,'Lee');
});
test('unauthenticated and different-case accounts cannot plant a parent correction',async()=>{
  for(const uid of ['', 'lee', 'Kim']) assert.equal((await runGate({uid})).logged.length,0);
});
test('fallback replies do not log deferred corrections',async()=>{
  assert.equal((await runGate({context:{modelOk:false}})).logged.length,0);
});
test('corrections suppressed by the final correction mode do not enter parent reports',async()=>{
  assert.equal((await runGate({context:{timing:'immediate',honest:{mode:'free_talk'}}})).logged.length,0);
});
test('visible immediate corrections still enter parent reports',async()=>{
  assert.equal((await runGate({context:{timing:'immediate'}})).logged.length,1);
});

const html = readFileSync(new URL('../public/parent.html',import.meta.url),'utf8');
const renderSource = html.slice(html.indexOf('function pdWarmupHtml('),html.indexOf('/* 🗓 4주 목표 카드'));
const esc = (s:any)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const render = new Function('esc','fmt','fmtDate',renderSource+';return pdWarmupHtml;')(esc,String,String);
test('weekly chart shows real counts, both languages and a non-score explanation',()=>{
  const week=Array.from({length:7},(_,i)=>({date:'2026-11-0'+(i+2),sessions:i===0?2:0}));
  const ko=render({weekly_activity:week},false), en=render({weekly_activity:week},true);
  assert.match(ko,/최근 7일 말하기 활동/);
  assert.equal((ko.match(/<time /g)||[]).length,7);
  assert.match(ko,/width:100.00%/);
  assert.match(ko,/width:0.00%/);
  assert.match(en,/not completion counts or skill scores/);
  assert.match(en,/2<span[^>]*> sessions<\/span>/);
});
test('unknown or malformed weekly data has no chart, old server response stays compatible',()=>{
  for(const weekly_activity of [null,[],[{date:'<script>',sessions:1}],Array(7).fill({date:'2026-11-02',sessions:-1})]) {
    const output=render({weekly_activity},true);
    assert.match(output,/Recent activity records are unavailable/);
    assert.doesNotMatch(output,/<time |<script>/);
  }
  assert.doesNotMatch(render({},true),/last 7 days|Recent activity records/);
});

test('vocabulary deduplicates across completed sessions and isolates accounts and weeks', async () => {
  const {sql, db} = database();
  try {
    sql.exec('CREATE TABLE ai_speaking_sessions(id TEXT, student_uid TEXT, status TEXT, finished_at INTEGER, result_json TEXT)');
    const insert = sql.prepare('INSERT INTO ai_speaking_sessions VALUES (?, ?, ?, ?, ?)');
    insert.run('a','Lee','complete',now-86400000,JSON.stringify({uniqueWords:['apple','pear']}));
    insert.run('b','Lee','complete',now,JSON.stringify({uniqueWords:['apple','plum']}));
    insert.run('c','lee','complete',now,JSON.stringify({uniqueWords:['banana']}));
    insert.run('d','Lee','open',now,JSON.stringify({uniqueWords:['melon']}));
    const bindings = db as unknown as D1Database;
    assert.deepEqual(await speakingVocabularyBetween(bindings,'Lee',start,now+1),{sessions:2,uniqueWords:3});
    assert.deepEqual((await speakingVocabularyWeeks(bindings,'Lee',now))?.map(w=>w.uniqueWords),[0,0,0,3]);
    assert.deepEqual((await readParentWarmup(db,'Lee',now)).speaking_vocabulary,{sessions:2,uniqueWords:3});
  } finally { sql.close(); }
});
