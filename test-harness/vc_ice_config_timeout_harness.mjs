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
    calls, context, flush,
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
  return new Promise((resolve, reject) => options?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
}

test('hung initial request is aborted; concurrent entry shares it; next attempt can recover', async () => {
  const h = boot((n, options) => n === 1 ? hang(options) : good());
  const first = h.ensure(), second = h.ensure();
  assert.equal(h.calls.length, 1, 'preload and entry must share a single request');
  await h.advance(3000);
  await Promise.all([first, second]);
  assert.equal(h.calls[0].options.signal.aborted, true);
  await h.ensure();
  assert.equal(h.calls.length, 2, 'a timeout must not pin all retries to the old promise');
  assert.equal(h.read('__vcIceHasTurn'), true);
});

test('timeout also covers a stalled JSON body', async () => {
  const h = boot((n, options) => n === 1 ? Promise.resolve({ ok: true, json: () => hang(options) }) : good());
  await h.flush();
  await h.advance(3000);
  assert.equal(h.calls[0].options.signal.aborted, true);
  await h.ensure();
  assert.equal(h.calls.length, 2);
  assert.equal(h.read('__vcIceHasTurn'), true);
});

test('fresh credentials are reused; failed refresh preserves them and permits retry', async () => {
  const h = boot((n, options) => n === 2 ? hang(options) : good());
  await h.flush();
  await h.ensure();
  assert.equal(h.calls.length, 1);
  await h.advance(4 * 3600 * 1000 + 1);
  const refresh = h.ensure();
  await h.advance(3000);
  await refresh;
  assert.equal(h.read('__vcIceHasTurn'), true);
  assert.equal(h.read('ICE_SERVERS.iceServers[0].urls'), 'turn:example.test:3478');
  const retry = h.ensure();
  await h.flush();
  assert.equal(h.calls.length, 3);
  await retry;
});

test('HTTP failure and invalid JSON do not poison the next attempt', async () => {
  const h = boot(n => n === 1 ? Promise.resolve({ ok: false }) : n === 2 ? Promise.resolve({ ok: true, json: async () => { throw Error('bad JSON'); } }) : good());
  await h.flush();
  await h.ensure();
  assert.equal(h.read('__vcIceHasTurn'), false);
  await h.ensure();
  assert.equal(h.calls.length, 3);
  assert.equal(h.read('__vcIceHasTurn'), true);
});
