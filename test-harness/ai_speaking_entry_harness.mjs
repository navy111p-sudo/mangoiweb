// 2026-11-01: one menu entrance, two preserved practice destinations.
import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
const pub = new URL('../cloudflare-deploy/public/', import.meta.url);
const read = path => readFileSync(new URL(path, pub), 'utf8');
const home = read('index.html');
const hub = read('ai-speaking.html');
const start = home.indexOf('var ITEMS=[', home.indexOf("var ID='ai-friends-ov'"));
assert.ok(start >= 0, 'AI tools menu found');
const end = home.indexOf('];', start);
const items = new Function('aifSvg', home.slice(start, end + 2) + ';return ITEMS;')(() => 'icon');
assert.equal(items.filter(i => i.url === '/ai-speaking.html').length, 1, 'one speaking card');
assert.equal(items.filter(i => ['/warmup.html', '/ai-friend.html'].includes(i.url)).length, 0, 'no competing top-level cards');
for (const [id, destination] of [['textbook-mode', '/warmup.html'], ['friend-mode', '/ai-friend.html']]) {
  const tag = hub.match(new RegExp('<a\\b[^>]*id="' + id + '"[^>]*>'))?.[0];
  assert.ok(tag?.includes('href="' + destination + '"'), id + ' has a real link (works without JS)');
  assert.ok(existsSync(new URL(destination.slice(1), pub)), 'destination exists');
  assert.ok(read(destination.slice(1)).includes('href="/ai-speaking.html"'), 'can return to mode selection');
}
// 2026-11-02: free talk goes straight into the conversation (no setup screen), free_talk mode for this visit only.
const freeTag = hub.match(/<a\b[^>]*id="free-talk-mode"[^>]*>/)?.[0] || '';
const freeHref = (freeTag.match(/href="([^"]+)"/)?.[1] || '').replace(/&amp;/g, '&');
const freeUrl = new URL(freeHref, 'https://x.test/');
assert.equal(freeUrl.pathname, '/warmup.html', 'free talk opens warmup');
assert.equal(freeUrl.searchParams.get('cmode'), 'free_talk', 'free talk passes free_talk mode');
assert.equal(freeUrl.searchParams.get('setup'), '0', 'free talk skips setup screen');
assert.ok(!hub.includes('localStorage.setItem'), 'entrance does not overwrite learning settings');
assert.ok(!/fetch\(|getUserMedia\(/.test(hub), 'entrance does not start a conversation or microphone');
const drawer = home.slice(home.indexOf('id="mg-drawer"'), home.indexOf('</aside>', home.indexOf('id="mg-drawer"')));
assert.equal((drawer.match(/location.href='\/ai-speaking.html'/g) || []).length, 1, 'one drawer entrance');
assert.ok(!/location.href='\/(warmup|ai-friend).html'/.test(drawer), 'drawer does not show duplicate modes');
console.log('PASS: unified speaking menu, both destinations, return links, passive entrance');
