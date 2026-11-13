import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const source = readFileSync(new URL('../cloudflare-deploy/public/js/idx-main.js', import.meta.url), 'utf8');
const block = source.slice(source.indexOf('let ICE_SERVERS ='), source.indexOf('/**', source.indexOf('// 페이지 로드 시 즉시 ICE')));
function boot(respond) {
  let now = 100000, seq = 0;
  const timers = new Map(), calls = [];
  const context = vm.createContext({
    AbortController, console: { log() {}, warn() {} },
    Date: { now: () => now },
    setTimeout(fn, delay) { timers.set(++seq, { fn, at: now + delay }); return seq; },
    clearTimeout(id) { timers.delete(id); },
    fetch(url, options) { calls.push({ url, options }); return respond(calls.length, options); }
  });
  vm.runInContext(block, context);
  const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
  return {
    calls, context, flush, timers,
    ensure: () => vm.runInContext('vcEnsureIceServers()', context),
    read: expr => vm.runInContext(expr, context),
    async advance(ms) {
      now += ms;
      for (const [id, t] of [...timers]) if (t.at <= now) { timers.delete(id); t.fn(); }
      await flush();
    }
  };
}
const good = () => Promise.resolve({ ok: true, json: async () => ({ iceServers: [{ urls: 'turn:example.test:3478', username: 'test', credential: 'test' }] }) });
function hang(options) {
  if (options?.signal?.aborted) return Promise.reject(new Error("aborted"));
  return new Promise((resolve, reject) => options?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
}


// 500 deterministic fault schedules against the shipped ICE loader, no network.
for (let seed = 1; seed <= 500; seed++) test(`ICE fault schedule ${seed}`, async () => {
  let randomState = seed;
  const random = n => { randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0; return randomState % n; };
  const failures = ['headers', 'body', 'http', 'network', 'json', 'invalid'];
  const coldFailure = seed % 2 === 1;
  let mode = coldFailure ? failures[random(failures.length)] : 'good';
  const h = boot((n, options) => {
    if (mode === 'headers') return hang(options);
    if (mode === 'body') return Promise.resolve({ ok: true, json: () => hang(options) });
    if (mode === 'http') return Promise.resolve({ ok: false });
    if (mode === 'network') return Promise.reject(new TypeError('synthetic network failure'));
    if (mode === 'json') return Promise.resolve({ ok: true, json: async () => { throw new SyntaxError('synthetic truncated JSON'); } });
    if (mode === 'invalid') return Promise.resolve({ ok: true, json: async () => ({ iceServers: [null] }) });
    return good();
  });
  await h.flush();
  if (coldFailure) {
    const initial = h.ensure();
    await h.advance(3000);
    await initial;
    assert.equal(h.read('__vcIceHasTurn'), false, 'failed cold start must not claim usable TURN');
    mode = 'good';
    await h.ensure();
    assert.equal(h.read('__vcIceHasTurn'), true, 'cold-start retry must recover');
  }
  for (let cycle = 0; cycle < 4; cycle++) {
    await h.advance(4 * 3600 * 1000 + 1 + random(10000));
    mode = failures[random(failures.length)];
    const before = h.calls.length;
    const stamp = h.read('__vcIceLoadedAt');
    const callers = Array.from({ length: 2 + random(19) }, () => h.ensure());
    assert.equal(h.calls.length, before + 1, 'all concurrent entrants must share one refresh');
    await h.advance(3000);
    await Promise.all(callers);
    assert.equal(h.read('__vcIceLoadedAt'), stamp, 'failed refresh must preserve original timestamp');
    assert.equal(h.read('ICE_SERVERS.iceServers[0].urls'), 'turn:example.test:3478');
    mode = 'good';
    await Promise.all(Array.from({ length: 1 + random(20) }, () => h.ensure()));
    await h.flush();
    assert.equal(h.calls.length, before + 2, 'the next attempt must recover exactly once');
    assert.equal(h.read('__vcIceHasTurn'), true);
    assert.equal(h.timers.size, 0, 'deadlines must not leak');
  }
});
