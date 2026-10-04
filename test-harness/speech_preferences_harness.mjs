import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';

const client = readFileSync('cloudflare-deploy/public/js/speech-preferences.js', 'utf8');
const storage = () => { const map = new Map(); return { getItem: k => map.get(k) ?? null, setItem: (k,v) => map.set(k,v), removeItem: k => map.delete(k) }; };
const local = storage(), remote = new Map();
const token = uid => btoa(JSON.stringify({uid})) + '.signature';
const login = uid => { local.setItem('mango_user', JSON.stringify({uid})); local.setItem('mango_token', token(uid)); };
let writes = 0;
async function fetchMock(url, opts) {
  const uid = JSON.parse(atob(opts.headers.Authorization.slice(7).split('.')[0])).uid.toLowerCase();
  const key = uid + ':' + new URL(url, 'https://test').searchParams.get('app');
  if (opts.method === 'PUT') { writes++; remote.set(key, JSON.parse(opts.body).level); }
  return { ok: true, json: async () => ({ok:true, level:remote.get(key) ?? null}) };
}
function page(fetch = fetchMock, store = local) {
  const w = { addEventListener() {} };
  vm.runInNewContext(client, { window:w, localStorage:store, sessionStorage:storage(), fetch, atob, AbortController, setTimeout, clearTimeout });
  return w.MangoiSpeechPreferences;
}
const settle = () => new Promise(resolve => setImmediate(resolve));
for (const app of ['warmup','friend']) {
  login('StudentA');
  let p = page().create(app, 3, () => {}); await p.ready;
  const before = writes; assert.equal(p.level, 3); assert.equal(writes,before);
  p.set(2); await settle();
  p = page().create(app, 3, () => {}); await p.ready; assert.equal(p.level,2);
  // Other device: no cache, same account.
  const device = storage(); device.setItem('mango_token', token('STUDENTA'));
  p = page(fetchMock,device).create(app,3,()=>{}); await p.ready; assert.equal(p.level,2);
  login('StudentB'); p = page().create(app,3,()=>{}); await p.ready; assert.equal(p.level,3);
  p.set(5); await settle();
  login('StudentA'); p = page().create(app,3,()=>{}); await p.ready; assert.equal(p.level,2);
  // A late GET must not overwrite a newer manual choice.
  let release;
  p = page((url,opts) => opts.method === 'GET' ? new Promise(r => {release=r;}) : fetchMock(url,opts)).create(app,3,()=>assert.fail('stale GET applied'));
  p.set(1); release({ok:true,json:async()=>({ok:true,level:5})}); await p.ready; await settle(); assert.equal(p.level,1);
  // Offline choice remains per-account and uploads on the next visit.
  p = page(async()=>{throw Error('offline');}).create(app,3,()=>{}); await p.ready; p.set(4); await settle();
  p = page().create(app,3,()=>{}); await p.ready; assert.equal(remote.get('studenta:'+app),4);
  const beforeInvalid = writes; p.set(0); p.set(1.5); p.set(6); await settle(); assert.equal(writes,beforeInvalid);
}
// Parse every inline script after integration edits.
for (const name of ['warmup','ai-friend']) {
  const html = readFileSync('cloudflare-deploy/public/'+name+'.html','utf8');
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (!/src=|application\/ld\+json/.test(match[1])) new vm.Script(match[2]);
  }
}

// Exercise the real route with an authentication stub and a D1-shaped store.
let source = readFileSync('cloudflare-deploy/src/speech-preferences.ts','utf8');
source = source.replace(/import .*?;\n/, '').replace('export async function','async function');
const rows = new Map();
const env = { DB: { exec:async()=>{}, prepare(sql) { return { bind(...args) { return {
  run:async()=>rows.set(args[0]+':'+args[1],args[2]),
  first:async()=>rows.has(args[0]+':'+args[1]) ? {level:rows.get(args[0]+':'+args[1])} : null
}; } }; } } };
const context = vm.createContext({ Request, Response, URL, authUidFromRequest:async req=>req.headers.get('Authorization') });
vm.runInContext(stripTypeScriptTypes(source)+'\nglobalThis.handler=handleSpeechPreferences;',context);
async function request(method,uid,level,app='warmup') {
  return context.handler(new Request('https://test/api/student/speech-preferences?app='+app+'&uid=victim', {
    method, headers:uid ? {Authorization:uid} : {}, body:method==='PUT'?JSON.stringify({level,uid:'victim'}):undefined
  }),env);
}
assert.equal((await request('PUT',null,2)).status,401);
assert.equal((await request('PUT','guest_test',2)).status,401);
for (const v of [0,6,1.5,'2',null]) assert.equal((await request('PUT','alice',v)).status,400);
assert.equal((await request('GET','alice',null,'bad')).status,400);
assert.equal((await request('PUT','Alice',2)).status,200);
assert.equal((await (await request('GET','ALICE')).json()).level,2);
assert.equal((await (await request('GET','victim')).json()).level,null);
assert.equal((await (await request('GET','alice',null,'friend')).json()).level,null);
env.DB.exec = async()=>{throw Error('unavailable');};
assert.equal((await request('PUT','alice',3)).status,503);
console.log('PASS: both apps, reload, device restore, account isolation, late-read race, offline retry, invalid values, route ownership and script syntax');
