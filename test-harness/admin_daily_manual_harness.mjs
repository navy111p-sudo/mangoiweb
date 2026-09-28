// Real script in a tiny DOM: recipient isolation and daily dismissal across reloads/accounts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const src = readFileSync('cloudflare-deploy/public/js/admin-daily-manual.js', 'utf8');
assert.ok(Buffer.byteLength(src, 'utf8') < 16 * 1024, 'manual stays below 16 KB');
const targets = ['admin', 'mgr_jjw', 'mgr_maimai', 'mgr_karl', 'mgr_melca'];
function boot({ uid = 'admin', role = 'hq', scope = 'hq', storage = new Map(), now = '2026-09-27T14:59:00Z', fail = false, blocked = false } = {}) {
  const listeners = {}, winListeners = {}, nodes = {};
  let nowMs = Date.parse(now), response = { ok: true, user: { username: uid }, role, scope: { type: scope } };
  let requests = 0, html = '', focus = '';
  const dlg = { open: false, showModal() { this.open = true; }, close() { this.open = false; }, addEventListener(n, fn) { listeners['dialog:' + n] = fn; } };
  const root = { set innerHTML(v) { html = v; }, querySelector(sel) {
    if (sel === 'dialog') return dlg;
    if (sel === 'button') return { addEventListener(n, fn) { listeners.close = fn; } };
    if (sel === '.content') return { scrollTop: 100 };
    if (sel === 'h1') return { focus() { focus = 'title'; } };
  } };
  const document = { readyState: 'complete', hidden: false, activeElement: { isConnected: true, focus() { focus = 'previous'; } },
    body: { parentElement: null, appendChild(el) { nodes[el.id] = el; el.parentElement = this; } },
    createElement() { return { style: {}, attachShadow() { this.shadowRoot = root; return root; } }; },
    addEventListener(n, fn) { listeners[n] = fn; } };
  const window = { addEventListener(n, fn) { winListeners[n] = fn; } };
  class Clock extends Date { static now() { return nowMs; } }
  const context = vm.createContext({ window, document, getComputedStyle: () => ({ zoom: '1.3' }), Date: Clock, AbortController, setTimeout, clearTimeout,
    localStorage: { getItem(k) { if (blocked) throw Error('blocked'); return storage.get(k) || null; }, setItem(k, v) { if (blocked) throw Error('blocked'); storage.set(k, v); } },
    fetch: async (url, options) => { requests++; assert.equal(url, '/api/admin/me'); assert.equal(options.credentials, 'include'); assert.equal(options.cache, 'no-store'); if (fail) throw Error('offline'); return { ok: true, json: async () => response }; } });
  vm.runInContext(src, context);
  return { nodes, dlg, storage, listeners, winListeners, get html() { return html; }, get requests() { return requests; }, get focus() { return focus; }, setTime(s) { nowMs = Date.parse(s); }, recover() { fail = false; }, rerun() { vm.runInContext(src, context); } };
}
const flush = () => new Promise(r => setImmediate(r));
for (const uid of targets) { const b = boot({ uid }); await flush(); assert.ok(b.dlg.open, uid); assert.equal(b.focus, 'title'); }
for (const [uid, role, scope] of [['mgr_lby','hq','hq'], ['mangoi_033','teacher','teacher'], ['mgr_karla','hq','hq'], ['admin','teacher','teacher'], ['mgr_karl','hq','agency'], ['', 'hq','hq']]) {
  const b = boot({ uid, role, scope }); await flush(); assert.equal(b.dlg.open, false, uid);
}
const b = boot(); await flush();
assert.equal(Number(b.nodes['admin-daily-manual'].style.zoom), 1 / 1.3, 'portal cancels admin body zoom');
assert.equal(b.storage.size, 0, 'opening alone must not mark read');
assert.match(b.html, /카카오 문의와 평가 확인/);
assert.match(b.html, /Review Kakao inquiries &amp; feedback/);
assert.match(b.html, /<footer>.*닫기 \/ Close/s);
assert.equal((b.html.match(/<li>/g) || []).length, 17);
b.listeners.close(); assert.equal(b.dlg.open, false); assert.equal(b.focus, 'previous');
assert.equal(b.storage.get('mangoi_admin_manual_closed_v1:admin'), '2026-09-27');
const same = boot({ storage: b.storage }); await flush(); assert.equal(same.dlg.open, false);
const other = boot({ uid: 'mgr_jjw', storage: b.storage }); await flush(); assert.ok(other.dlg.open, 'same browser different account');
same.setTime('2026-09-27T15:00:00Z'); same.winListeners.focus(); await flush(); assert.ok(same.dlg.open, 'KST midnight while tab remains open');
let prevented = false; same.listeners['dialog:cancel']({ preventDefault() { prevented = true; } }); assert.ok(prevented); assert.equal(same.dlg.open, false);
assert.equal(same.storage.get('mangoi_admin_manual_closed_v1:admin'), '2026-09-28');
const restricted = boot({ blocked: true }); await flush(); restricted.listeners.close(); restricted.winListeners.focus(); await flush(); assert.equal(restricted.dlg.open, false);
const offline = boot({ fail: true }); await flush(); assert.equal(offline.dlg.open, false); offline.recover(); offline.winListeners.online(); await flush(); assert.ok(offline.dlg.open);
offline.rerun(); await flush(); assert.equal(offline.requests, 2, 'duplicate script does not issue another request');
for (const page of ['admin','manager']) assert.match(readFileSync(`cloudflare-deploy/public/${page}.html`, 'utf8'), /<script src="\/js\/admin-daily-manual.js\?v=2" defer><\/script>/);
console.log('PASS: five recipients, excluded roles/accounts, fresh identity, content, close/Escape, reload, KST rollover, shared browser, blocked storage, offline retry, both landing pages');
