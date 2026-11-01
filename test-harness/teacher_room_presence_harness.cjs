const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const ts = require('../cloudflare-deploy/node_modules/typescript');
const source = fs.readFileSync('cloudflare-deploy/src/teacher-room-presence.ts', 'utf8');
let actor = { ok: true, isTeacher: true, username: 'hq_t_kang' };
const moduleObj = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
  exports: moduleObj.exports, module: moduleObj, console, Request, URL, Date, Map, Set, WeakMap,
  require(name) {
    if (name === './auth-admin') return { getAdminActor: async () => actor };
    if (name === './d1-chunk') return { selectInChunks: async (db, vals, sql) => (await db.prepare(sql(vals.map(() => '?').join(','))).bind(...vals).all()).results };
    throw Error(name);
  }
});
const m = moduleObj.exports;
function dbAdapter(raw) {
  return { exec: async sql => raw.exec(sql), prepare(sql) { let params = []; return { bind(...p) { params = p; return this; },
    async first() { return raw.prepare(sql).get(...params) || null; }, async all() { return { results: raw.prepare(sql).all(...params) }; },
    async run() { return raw.prepare(sql).run(...params); } }; } };
}
const raw = new DatabaseSync(':memory:'); const db = dbAdapter(raw); const env = { DB: db };
const req = new Request('https://mangoi.ai/api/attendance/join');
const body = { room_id: 'class-4601-20261023', user_id: 'device1', role: 'teacher', account_uid: 'victim' };
let passed = 0;
function check(fn) { fn(); passed++; }
(async () => {
  await m.recordTeacherRoomPresence(env, req, body, 'join');
  check(() => assert.equal(raw.prepare('SELECT account_uid FROM teacher_room_presence').get().account_uid, 'hq_t_kang'));
  actor = { ok: true, isTeacher: false, username: 'jeong' };
  await m.recordTeacherRoomPresence(env, req, {...body, user_id:'spoof'}, 'join');
  check(() => assert.equal(raw.prepare('SELECT COUNT(*) n FROM teacher_room_presence').get().n, 1));
  actor = { ok: false, isTeacher: true, username: 'hq_t_kang' };
  await m.recordTeacherRoomPresence(env, req, body, 'join');
  check(() => assert.equal(raw.prepare('SELECT COUNT(*) n FROM teacher_room_presence').get().n, 1));
  actor = { ok: true, isTeacher: true, username: 'hq_t_kang' };
  await m.recordTeacherRoomPresence(env, req, {...body, room_id:"x';DROP TABLE teachers"}, 'join');
  check(() => assert.equal(raw.prepare('SELECT COUNT(*) n FROM teacher_room_presence').get().n, 1));
  for (let i=0;i<10;i++) await m.recordTeacherRoomPresence(env, req, body, 'heartbeat');
  check(() => assert.equal(raw.prepare('SELECT COUNT(*) n FROM teacher_room_presence').get().n, 1));
  await m.recordTeacherRoomPresence(env, req, body, 'leave');
  for (let i=0;i<4;i++) await m.recordTeacherRoomPresence(env, req, body, 'heartbeat');
  check(() => assert.ok(raw.prepare('SELECT left_at FROM teacher_room_presence').get().left_at));
  await m.recordTeacherRoomPresence(env, req, body, 'join');
  check(() => assert.equal(raw.prepare('SELECT COUNT(*) n FROM teacher_room_presence').get().n, 2));
  await m.recordTeacherRoomPresence(env, req, {...body,user_id:'device2',room_id:'meet-1234'}, 'heartbeat');
  check(() => assert.equal(raw.prepare('SELECT entry_kind FROM teacher_room_presence WHERE peer_id=?').get('device2').entry_kind,'heartbeat'));
  const now = Date.now(), date = new Date(now + 32400000).toISOString().slice(0,10);
  const row = {account_uid:'hq_t_kang',room_id:body.room_id,host:'mangoi.ai',joined_at:now-10000,last_seen_at:now,left_at:null};
  const summary = (rows, room=body.room_id, day=date) => m.teacherRoomSummary(['hq_t_kang'],rows,room,now,day);
  for(let repeat=0;repeat<20;repeat++) {
    check(() => assert.equal(summary([row]).state,'same'));
    check(() => assert.equal(summary([{...row,room_id:'other'}]).state,'other'));
    check(() => assert.equal(summary([row,{...row,room_id:'other'}]).state,'multiple'));
    check(() => assert.equal(summary([{...row,last_seen_at:now-75001}]).state,'stale'));
    check(() => assert.equal(summary([{...row,left_at:now}]).state,'left'));
    check(() => assert.equal(summary([]).state,'none'));
    check(() => assert.equal(summary([{...row,account_uid:'jeong'}]).state,'none'));
    check(() => assert.equal(m.teacherRoomSummary([], [row],body.room_id,now,date).state,'unlinked'));
    check(() => assert.equal(summary([row],body.room_id,'2020-01-01').state,'history'));
    check(() => assert.equal(m.receiptState({...row,last_seen_at:now+1000},now),'stale'));
  }
  raw.exec('CREATE TABLE teacher_account_links(username TEXT, teacher_id TEXT); INSERT INTO teacher_account_links VALUES (\'hq_t_kang\',\'25\');');
  const sessions=[{teacher_id:25,room_id:body.room_id},{teacher_id:99,room_id:'other'},{teacher_id:25,source:'cafe24',room_id:'c24-1'}];
  await m.enrichTeacherRoomPresence(env,sessions,date,now);
  check(() => assert.equal(sessions[0].teacher_connection.state,'multiple'));
  check(() => assert.equal(sessions[1].teacher_connection.state,'unlinked'));
  check(() => assert.equal(sessions[2].teacher_connection.state,'external'));
  const broken = { DB:{ exec:async()=>{throw Error('lookup failed')} } };
  const fail=[{room_id:body.room_id}]; await m.enrichTeacherRoomPresence(broken,fail,date,now);
  check(() => assert.equal(fail[0].teacher_connection.state,'unavailable'));
  await m.recordTeacherRoomPresence(broken,req,body,'join'); passed++;
  // Frontend: evaluate real renderer, assert unknown/negative/XSS/TTL and exercise actual HTML in browser separately.
  let js=fs.readFileSync('cloudflare-deploy/public/js/adm-today-classes.js','utf8');
  js=js.replace("  if (document.readyState === 'loading')", "  window.__presenceTest = { render: xTeacherConnection };\n  if (document.readyState === 'loading')");
  const window={addEventListener(){}}; const document={readyState:'loading',addEventListener(){},getElementById(){return null;}};
  vm.runInNewContext(js,{window,document,localStorage:{getItem(){return 'ko'}},location:{origin:'https://mangoi.ai'},navigator:{},console,Date,setTimeout(){return 1;},clearTimeout(){}});
  const render=window.__presenceTest.render;
  const html=render({room_id:body.room_id,teacher_connection:{...summary([row]),sessions:[{...row,account_uid:'<img src=x onerror=alert(1)>'}]}});
  check(() => assert.ok(html.includes('&lt;img')));
  check(() => assert.ok(!html.includes('<img')));
  check(() => assert.ok(html.includes('<details')));
  check(() => assert.ok(render({teacher_connection:{state:'unavailable'}}).includes('접속 조회 실패')));
  check(() => assert.ok(render({teacher_connection:{...summary([row]),valid_until:now-1,sessions:[{...row,last_seen_at:now-100000}]}}).includes('연결 확인 지연')));
  fs.writeFileSync(process.env.PRESENCE_PREVIEW_PATH || require('node:path').join(require('node:os').tmpdir(), 'teacher-presence-preview.html'),'<!doctype html><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;background:#f8fafc;padding:30px}main{display:flex;gap:24px;flex-wrap:wrap}button{padding:7px;border:1px solid #bbb;border-radius:5px;margin:4px}summary{padding:5px}</style><h2>오늘 수업 · 교사 입장 상태</h2><main>'+['same','other','stale','none','unavailable'].map(state=>render({room_id:body.room_id,teacher_connection:{...summary(state==='other'?[{...row,room_id:'class-4588-20261022'}]:[row]),state,sessions:state==='none'||state==='unavailable'?[]:state==='stale'?[{...row,last_seen_at:now-100000}]:state==='other'?[{...row,room_id:'class-4588-20261022'}]:[row]}})).join('')+'</main>');
  console.log('PASS '+passed+' assertions (20 repeated state matrices + SQLite/auth/frontend cases)');
})().catch(e=>{console.error(e);process.exit(1)});
