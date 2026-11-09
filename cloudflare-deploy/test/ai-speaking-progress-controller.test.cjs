const test = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../public/js/ai-speaking-progress.js'), 'utf8');
function setup(armed = false) {
  const events = {}, card = { replaceChildren() { this.textContent = ''; }, setAttribute() {}, appendChild(p) { this.textContent = p.textContent; } };
  const root = {addEventListener(name, cb) { events[name] = cb; }, AiSpeakingProgressView: {render(_, data) { card.textContent = data.lessonId; card.weeklyVocabulary=data.weeklyVocabulary; card.rewards=data.rewards; }}}, requests = [], storage = new Map([['mango_token', 'local-token-A']]);
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
test('reopening shares one completed-result read and refreshes late rewards and history',async()=>{
 const s=setup(true);await start(s,'alice');const done=s.api.finish();
 s.requests[1].reply({ok:true,result:{finishedNormally:true,lessonId:'alice',rewards:{pointsEarned:2}}});await done;
 const a=s.api.finish(),b=s.api.finish();assert.equal(s.requests.length,3);
 assert.deepEqual(JSON.parse(s.requests[2].options.body),{action:'finish',sessionId:'alice'});
 s.requests[2].reply({ok:true,result:{finishedNormally:true,lessonId:'alice',rewards:{pointsEarned:4},weeklyVocabulary:[{words:42}]}});await Promise.all([a,b]);
 assert.equal(s.card.weeklyVocabulary[0].words,42);assert.equal(s.card.textContent,'alice');
 assert.equal(s.card.rewards.pointsEarned,4);
 const retry=s.api.finish();s.requests[3].reply({ok:false,error:'offline'});await retry;
 assert.equal(s.card.weeklyVocabulary,null);assert.equal(s.card.textContent,'alice');
 assert.equal(s.card.rewards.pointsEarned,4);
 const invalid=s.api.finish();s.requests[4].reply({ok:true,result:{finishedNormally:true,lessonId:'foreign',rewards:{pointsEarned:999}}});await invalid;
 assert.equal(s.card.rewards.pointsEarned,4);assert.equal(s.card.textContent,'alice');
 const recovered=s.api.finish();s.requests[5].reply({ok:true,result:{finishedNormally:true,lessonId:'alice',weeklyVocabulary:[{words:43}],rewards:{pointsEarned:4}}});await recovered;
 assert.equal(s.card.weeklyVocabulary[0].words,43);
});
test('late completed-result refresh cannot repaint another account or a new practice',async()=>{
 for(const change of ['account','practice']){
  const s=setup(true);await start(s,'alice');const done=s.api.finish();complete(s,1,'alice');await done;
  const old=s.api.finish();if(change==='account')s.storage.set('mango_token','bob');
  await start(s,'new');s.requests[2].reply({ok:true,result:{finishedNormally:true,lessonId:'alice',weeklyVocabulary:[{words:999}],rewards:{pointsEarned:999}}});await old;
  assert.notEqual(s.card.weeklyVocabulary?.[0]?.words,999);
 }
});

// ⏳ AI 대답 중에 누른 «끝내기» 는 버리지 않고 대답이 끝나면 한 번 한다(2026-11-09).
function setupBusy() {
  const timers = [], send = { disabled: true }, nodes = [], requests = [], storage = new Map([['mango_token', 'local-token-A']]);
  const el = () => ({ style: {}, hidden: false, textContent: '', setAttribute() {}, replaceChildren() {}, appendChild() {} });
  const root = { addEventListener() {}, AiSpeakingProgressView: { render() {} } };
  vm.runInNewContext(source, { window: root, location: { pathname: '/warmup.html' }, crypto: globalThis.crypto,
    localStorage: { getItem: key => storage.get(key) || '' },
    setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout() {},
    document: { readyState: 'complete', addEventListener() {}, body: { appendChild(n) { nodes.push(n); } }, createElement: el,
      querySelector() { return { insertBefore() {} }; }, getElementById: id => id === 'sendBtn' ? send : null },
    fetch: async (_, options) => new Promise(resolve => requests.push({ options, reply: data => resolve({ ok: true, json: async () => data }) })) });
  const tick = () => { const due = timers.splice(0); due.forEach(fn => fn()); };
  return { api: root.AiSpeakingProgress, send, timers, tick, nodes, requests };
}
test('not busy: the action runs at once with no wait', () => {
  const s = setupBusy(); s.send.disabled = false; let n = 0; s.api.afterReply(() => n++);
  assert.equal(n, 1); assert.equal(s.timers.length, 0); assert.equal(s.nodes.length, 0);
});
test('busy: the action waits, says so, then runs exactly once', () => {
  const s = setupBusy(); let n = 0; s.api.afterReply(() => n++);
  assert.equal(n, 0); assert.match(s.nodes[0].textContent, /AI 대답이 끝나면/); assert.equal(s.nodes[0].hidden, false);
  s.tick(); assert.equal(n, 0, 'still replying');
  s.send.disabled = false; s.tick(); assert.equal(n, 1); assert.equal(s.nodes[0].hidden, true);
  s.tick(); assert.equal(n, 1); assert.equal(s.timers.length, 0);
});
test('pressing again while waiting keeps one wait and runs the latest', () => {
  const s = setupBusy(); let a = 0, b = 0; s.api.afterReply(() => a++); s.api.afterReply(() => b++);
  assert.equal(s.timers.length, 1); s.send.disabled = false; s.tick(); assert.equal(a, 0); assert.equal(b, 1);
});
test('a reply that never ends gives up after 30 seconds and says so', () => {
  const s = setupBusy(); let n = 0; s.api.afterReply(() => n++);
  let ticks = 0; while (/AI 대답이 끝나면/.test(s.nodes[0].textContent) && ticks < 1000) { s.tick(); ticks++; }
  assert.ok(ticks >= 98 && ticks <= 100, 'about 30 s of 300 ms checks, got ' + ticks);
  assert.equal(n, 0); assert.match(s.nodes[0].textContent, /아직 안 끝났어요/);
  s.send.disabled = false; s.tick(); assert.equal(n, 0, 'no late run after giving up');
});
test('starting over cancels a waiting finish', () => {
  const s = setupBusy(); let n = 0; s.api.afterReply(() => n++); s.api.reset();
  assert.equal(s.nodes[0].hidden, true); s.send.disabled = false; s.tick(); assert.equal(n, 0);
});
test('finish pressed during the AI reply is not dropped', async () => {
  const s = setupBusy(); s.send.disabled = false; const start = s.api.beforeTurn(); s.requests[0].reply({ ok: true, sessionId: 'one' }); await start;
  s.send.disabled = true; await s.api.finish(); s.tick(); assert.equal(s.requests.length, 1, 'not sent while replying');
  s.send.disabled = false; s.tick(); await new Promise(r => setImmediate(r)); assert.equal(s.requests.length, 2);
  assert.deepEqual(JSON.parse(s.requests[1].options.body), { action: 'finish', sessionId: 'one' });
});

// 얼굴 대화·하단 바의 «끝내기» 도 같은 기다림을 지난다 — 함수를 오려 내 실제로 돌린다.
function cut(file, startText) {
  const src = fs.readFileSync(path.join(__dirname, '../public/js', file), 'utf8'), i = src.indexOf(startText);
  assert.ok(i >= 0, 'found ' + startText); let d = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && !--d) return src.slice(i, k + 1); }
  throw new Error('unbalanced');
}
for (const [name, code, wrap] of [
  ['face-talk finish', () => cut('warmup-facetalk.js', 'finish: function'), c => '({' + c + '}).finish()'],
  ['touch bar finish', () => cut('warmup-touch-bar.js', 'function onSheet'), c => c + ';onSheet({target:{closest(){return{id:"x",getAttribute(){return "tbFin"}}}}})'],
]) {
  test(name + ' waits for the reply instead of dropping the press', () => {
    for (const busy of [true, false]) {
      const btn = { disabled: busy, clicks: 0, click() { if (!this.disabled) this.clicks++; } }, waits = [];
      const ctx = { exit() {}, closeSheet() {}, click() {}, $: () => btn, document: { getElementById: () => btn },
        window: { AiSpeakingProgress: { afterReply(fn) { waits.push(fn); } } } };
      vm.runInNewContext(wrap(code()), ctx);
      assert.equal(waits.length, 1, 'goes through afterReply'); btn.disabled = false; waits[0](); assert.equal(btn.clicks, 1);
    }
  });
}
test('face-talk «finish» shows its word, not only a check mark', () => {
  const src = fs.readFileSync(path.join(__dirname, '../public/js/ftk-call.js'), 'utf8');
  assert.match(src, /class="fc-b fc-done">' \+ I\.check \+ '<span class="fc-done-t"><\/span>/);
  assert.match(src, /querySelector\('\.fc-done-t'\); if \(dt\) dt\.textContent = t\('끝내기', 'Finish'\)/);
});
