const test = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../public/js/ai-speaking-progress.js'), 'utf8');
function setup(armed = false) {
  const events = {}, card = { replaceChildren() { this.textContent = ''; }, setAttribute() {}, appendChild(p) { this.textContent = p.textContent; } };
  const root = {addEventListener(name, cb) { events[name] = cb; }, AiSpeakingProgressView: {render(_, data) { card.textContent = data.lessonId; }}}, requests = [], storage = new Map([['mango_token', 'local-token-A']]);
  vm.runInNewContext(source, { window: root, location: { pathname: '/warmup.html' }, crypto: globalThis.crypto,
    localStorage: { getItem: key => storage.get(key) || '' }, document: { readyState: armed ? 'complete' : 'loading', addEventListener() {}, createElement() { return card; }, querySelector() { return {insertBefore() {}}; }, getElementById() { return null; } },
    fetch: async (_, options) => new Promise(resolve => requests.push({ options, reply: data => resolve({ ok: true, json: async () => data }) })) });
  return { api: root.AiSpeakingProgress, requests, storage, card, events };
}
test('concurrent turns share the session start but have separate replay keys', async () => {
  const s = setup(), a = s.api.beforeTurn(), b = s.api.beforeTurn();
  assert.equal(s.requests.length, 1); s.requests[0].reply({ ok: true, sessionId: 'one' });
  const [x, y] = await Promise.all([a, b]); assert.equal(x.progress_session, 'one'); assert.equal(y.progress_session, 'one'); assert.notEqual(x.progress_turn, y.progress_turn);
});
test('clearing history discards a late session start without replacing the new one', async () => {
  const s = setup(), old = s.api.beforeTurn(); s.api.reset(); const current = s.api.beforeTurn();
  s.requests[1].reply({ ok: true, sessionId: 'new' }); assert.equal((await current).progress_session, 'new');
  s.requests[0].reply({ ok: true, sessionId: 'old' }); assert.equal(JSON.stringify(await old), '{}');
  assert.equal((await s.api.beforeTurn()).progress_session, 'new'); assert.equal(s.requests.length, 2);
});
test('account token changes cannot reuse the previous account session', async () => {
  const s = setup(), a = s.api.beforeTurn(); s.requests[0].reply({ ok: true, sessionId: 'alice' }); await a;
  s.storage.set('mango_token', 'local-token-B'); const b = s.api.beforeTurn();
  assert.equal(s.requests[1].options.headers.Authorization, 'Bearer local-token-B'); s.requests[1].reply({ ok: true, sessionId: 'bob' });
  assert.equal((await b).progress_session, 'bob');
});
test('a token change during session start does not attach stale metadata', async () => {
  const s = setup(), a = s.api.beforeTurn(); s.storage.set('mango_token', 'changed'); s.requests[0].reply({ ok: true, sessionId: 'stale' });
  assert.equal(JSON.stringify(await a), '{}');
});
test('failed session start leaves ordinary chat available', async () => {
  const s = setup(), a = s.api.beforeTurn(); s.requests[0].reply({ ok: false, error: 'auth_required' }); assert.equal(JSON.stringify(await a), '{}');
});

async function start(s, id) {
  const promise = s.api.beforeTurn(); s.requests.at(-1).reply({ok:true, sessionId:id}); await promise;
}
function complete(s, index, id) { s.requests[index].reply({ok:true,result:{finishedNormally:true,lessonId:id}}); }
test('cached results are cleared on direct token change before reopening', async () => {
  const s = setup(true); await start(s,'alice'); const done=s.api.finish(); complete(s,1,'alice'); await done;
  assert.equal(s.card.textContent,'alice'); s.storage.set('mango_token','bob'); await s.api.finish();
  assert.notEqual(s.card.textContent,'alice'); assert.equal(s.requests.length,2);
});
test('cross-tab logout clears an open cached result immediately', async () => {
  const s = setup(true); await start(s,'alice'); const done=s.api.finish(); complete(s,1,'alice'); await done;
  s.storage.delete('mango_token'); s.events.storage({key:'mango_token'}); assert.equal(s.card.textContent,'');
});
test('late old-account finish cannot render or clear the new-account in-flight finish', async () => {
  const s=setup(true); await start(s,'alice'); const old=s.api.finish(); s.storage.set('mango_token','bob');
  await start(s,'bob'); const current=s.api.finish(); assert.equal(s.requests.length,4); complete(s,1,'alice'); await old;
  assert.notEqual(s.card.textContent,'alice'); const repeated=s.api.finish(); assert.equal(s.requests.length,4);
  complete(s,3,'bob'); await Promise.all([current,repeated]); assert.equal(s.card.textContent,'bob');
});
test('token changes while grading cannot paint the old result', async () => {
  const s=setup(true); await start(s,'alice'); const old=s.api.finish(); s.storage.set('mango_token','bob');
  complete(s,1,'alice'); await old; assert.notEqual(s.card.textContent,'alice');
});

test('same-tab token changes during finish cannot reveal the old account result',async()=>{
 const s=setup(true),start=s.api.beforeTurn();s.requests[0].reply({ok:true,sessionId:'alice'});await start;
 const pending=s.api.finish();s.storage.set('mango_token','changed');
 s.requests[1].reply({ok:true,result:{finishedNormally:true,lessonId:'alice',rewards:{pointsBalance:999}}});await pending;
 assert.doesNotMatch(s.card.textContent,/alice|999/);
});
test('logout clears account metadata before guest practice',async()=>{
 const s=setup(),start=s.api.beforeTurn();s.requests[0].reply({ok:true,sessionId:'alice'});await start;
 s.storage.delete('mango_token');assert.equal(JSON.stringify(await s.api.beforeTurn()),'{}');assert.equal(s.requests.length,1);
});
