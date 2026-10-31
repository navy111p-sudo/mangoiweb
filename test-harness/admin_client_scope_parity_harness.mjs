/** Execute the browser guard against the server's actual allowlist; no network. */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const server = read('cloudflare-deploy/src/index.ts');
const client = read('cloudflare-deploy/public/js/adm-scope-guard.js');
const block = server.match(/function isAgencyAllowedApi\(path: string\): boolean \{[\s\S]*?\n\}/)?.[0];
assert.ok(block, 'actual server gate found');
const clean = text => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const paths = text => [...clean(text).matchAll(/'([^']*\/api\/admin\/[^']*)'/g)].map(m => m[1]);
const serverPaths = paths(block);
const clientPaths = paths(client.match(/var ALLOW = \[[\s\S]*?\n  \];/)[0]);
const publicPaths = ['/api/admin/login', '/api/admin/ai-analyze/student'];
assert.deepEqual([...clientPaths].sort(), [...serverPaths, ...publicPaths].sort(), 'mirror is neither stale nor broader than the server + public exceptions');
const isAllowed = vm.runInNewContext('(' + block.replace('(path: string): boolean', '(path)') + ')');
let checks = 1;
function fixture(session) {
  const requests = [];
  let responseStatus = 200;
  const fetch = async (input, init) => { requests.push({input,init}); return new Response(JSON.stringify({ok:responseStatus===200,server:true}), {status:responseStatus}); };
  const window = {fetch};
  vm.runInNewContext(client, {window, localStorage:{getItem:()=>JSON.stringify(session)}, URL, Response, location:{origin:'https://example.invalid'}, console:{info(){}}});
  return {window,requests,fetch,setStatus:status=>{responseStatus=status;}};
}
for (const role of ['agency','branch','franchise']) {
  const f = fixture({uid:role+'_test',role});
  for (const base of serverPaths) for (const path of [base,base+'/child']) {
    assert.equal(isAllowed(path),true);
    const before = f.requests.length;
    const result = await f.window.fetch(path+'?fixture=1');
    assert.equal(result.status,200); assert.equal(f.requests.length,before+1,path); checks++;
  }
  for (const path of publicPaths) {
    const result = await f.window.fetch(path); assert.equal(result.status,200); checks++;
  }
  const before = f.requests.length;
  const denied = await f.window.fetch('/api/admin/unlisted-private-action');
  assert.equal(isAllowed('/api/admin/unlisted-private-action'),false);
  assert.equal(denied.status,403); assert.equal((await denied.json()).client_skipped,true);
  assert.equal(f.requests.length,before); checks++;
  f.setStatus(403);
  const allowedButServerDenied = await f.window.fetch(new Request('https://example.invalid/api/admin/teachers', {method:'POST',body:'{}'}));
  assert.equal(allowedButServerDenied.status,403); assert.equal((await allowedButServerDenied.json()).server,true,'handler authorization response stays authoritative'); checks++;
  await f.window.fetch('https://elsewhere.invalid/api/admin/unlisted');
  await f.window.fetch('/api/student/anything');
  assert.equal(f.requests.length,before+3,'cross-origin/non-admin requests unchanged'); checks++;
  const installed = f.window.fetch;
  vm.runInNewContext(client, {window:f.window});
  assert.equal(f.window.fetch,installed,'no duplicate wrappers'); checks++;
}
for (const session of [{uid:'admin',role:'agency'},{uid:'exec_user',role:'exec'},{uid:'t',role:'teacher'},null]) {
  const f = fixture(session); assert.equal(f.window.fetch,f.fetch,'unscoped roles retain native fetch'); checks++;
}
for (const uid of ['agency_legacy','branch_legacy']) {
  const f=fixture({uid}); const r=await f.window.fetch('/api/admin/franchises'); assert.equal(r.status,200); checks++;
}
assert.match(read('cloudflare-deploy/public/admin.html'),/adm-scope-guard\.js\?v=2/);
console.log(`Admin client scope parity: PASS ${checks}, no live calls; server authorization unchanged`);
