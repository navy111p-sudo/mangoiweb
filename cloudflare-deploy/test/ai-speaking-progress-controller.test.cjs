const test = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../public/js/ai-speaking-progress.js'), 'utf8');
function setup() {
  const root = {}, requests = [], storage = new Map([['mango_token', 'local-token-A']]);
  vm.runInNewContext(source, { window: root, location: { pathname: '/ai-friend.html' }, crypto: globalThis.crypto,
    localStorage: { getItem: key => storage.get(key) || '' }, document: { readyState: 'loading', addEventListener() {} },
    fetch: async (_, options) => new Promise(resolve => requests.push({ options, reply: data => resolve({ ok: true, json: async () => data }) })) });
  return { api: root.AiSpeakingProgress, requests, storage };
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
