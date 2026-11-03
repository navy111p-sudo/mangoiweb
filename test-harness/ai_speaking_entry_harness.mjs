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
// 2026-11-03: the free-talk card was removed on the owner's instruction (replaced by 상황별 말하기).
assert.ok(!hub.includes('id="free-talk-mode"'), 'free talk card removed');
assert.ok(!hub.includes('localStorage.setItem'), 'entrance does not overwrite learning settings');
assert.ok(!/fetch\(|getUserMedia\(/.test(hub), 'entrance does not start a conversation or microphone');
const drawer = home.slice(home.indexOf('id="mg-drawer"'), home.indexOf('</aside>', home.indexOf('id="mg-drawer"')));
assert.equal((drawer.match(/location.href='\/ai-speaking.html'/g) || []).length, 1, 'one drawer entrance');
assert.ok(!/location.href='\/(warmup|ai-friend).html'/.test(drawer), 'drawer does not show duplicate modes');
console.log('PASS: unified speaking menu, both destinations, return links, passive entrance');

// ── 2026-11-03: phone redesign — 3 row cards (textbook / situations / friend) + common settings ──
{
  const vm = await import('node:vm');
  const run = (file, extra = {}) => { const ctx = { console, ...extra }; ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx); vm.runInContext(read(file), ctx); return ctx; };
  let n = 0; const ok = (v, m) => { n++; assert.ok(v, m); };

  // 1) the three cards and the kept free-talk entrance
  const cards = hub.match(/<a class="mode[^"]*" id="([a-z-]+)"/g) || [];
  ok(cards.length === 3, 'exactly three cards (browser harness counts .mode)');
  ok(/<a class="mode situ" id="situation-mode" href="#situations"/.test(hub), 'situation card opens the in-page list');
  ok(hub.includes('id="situations"') && hub.includes('id="sitBody"'), 'situation panel exists');
  ok(hub.indexOf('/js/ai-situations.js') > 0 && hub.indexOf('/js/ai-speaking-settings.js') > 0, 'hub loads the two shared scripts');
  ok(hub.includes('/img/mango-char.png'), 'Mr.mango mascot, not a robot');
  for (const src of [...hub.matchAll(/<img[^>]*src="(\/img\/[^"]+)"/g)].map(m => m[1])) ok(existsSync(new URL(src.slice(1), pub)), src + ' exists');

  // 2) situation table — one source for hub and warmup
  const S = run('js/ai-situations.js').MangoiSituations;
  ok(S.list.length === 15 && S.steps.length === 5, 'fifteen situations in five steps');
  for (const st of S.steps) ok(S.list.filter(s => s.step === st.n).length === 3, 'step ' + st.n + ' has three');
  ok(new Set(S.list.map(s => s.id)).size === S.list.length, 'unique ids');
  for (const s of S.list) {
    ok(/^[a-z0-9-]+$/.test(s.id), s.id + ' id is url-safe');
    ok(S.steps.some(g => g.n === s.step), s.id + ' step known');
    ok(!s.zhRole.includes("'") && s.zhRole.includes(s.zhOpen) && /중국어/.test(s.zhRole), s.id + ' Chinese role');
    ok(/[\u4e00-\u9fff]/.test(s.zh + s.zhOpen) && s.zhChips.length === 2 && s.zhChips.every(c => /^[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef0-9a-zA-Z ]+$/.test(c)), s.id + ' Chinese chips are Chinese only (no pinyin/Korean)');
    ok(!s.img || existsSync(new URL(s.img.slice(1), pub)), s.id + ' picture exists');
    ok(!s.role.includes("'"), s.id + ' role has no single quote (server wraps it in quotes)');
    ok(s.role.includes(s.open), s.id + ' role tells the server what the AI already said');
    ok(!/[‍]/.test(s.ic) && [...s.ic].every(c => c.codePointAt(0) < 0x1FA70), s.id + ' icon is old-Windows safe');
    ok(Array.isArray(s.chips) && s.chips.length === 2 && s.chips.every(c => /^[\x20-\x7e]+$/.test(c)), s.id + ' chips are plain English (sent as speech)');
    for (const lg of ['en', 'zh']) { const u = new URL(S.url(s, lg), 'https://x.test/');
      ok(u.pathname === '/warmup.html' && u.searchParams.get('sit') === s.id && u.searchParams.get('setup') === '0' && u.searchParams.get('lang') === lg, s.id + ' url ' + lg); }
    ok(new URL(S.url(s, 'xx'), 'https://x.test/').searchParams.get('lang') === 'en', s.id + ' unknown language -> en');
  }
  ok(S.find('CAFE') && S.find('CAFE').id === 'cafe', 'find ignores case');
  ok(S.find('nope') === null && S.find('') === null, 'unknown id -> null (free talk)');

  // 3) warmup consumes ?sit= : run the real block from warmup.html
  const wu = read('warmup.html');
  ok(wu.indexOf('/js/ai-situations.js') > 0 && wu.indexOf('/js/ai-situations.js') < wu.indexOf("var LESSON_TOPIC = Q.get('unit')"), 'warmup loads the table before reading ?sit');
  const a = wu.indexOf("var LESSON_TOPIC = Q.get('unit')"), b = wu.indexOf('function situationActive()');
  const block = wu.slice(a, wu.indexOf('\n', b));
  const evalSit = (qs) => { const ctx = { window: { MangoiSituations: S }, Q: new URLSearchParams(qs) }; vm.createContext(ctx); vm.runInContext(block + ';this.out={t:LESSON_TOPIC,s:SITUATION&&SITUATION.id,act:situationActive(),zh:SIT_ZH};', ctx); return ctx.out; };
  let r = evalSit('sit=cafe'); ok(r.s === 'cafe' && r.t === 'Ordering at a cafe' && r.act, '?sit=cafe -> short topic + active');
  r = evalSit('sit=cafe&lang=zh'); ok(r.zh && r.t === S.find('cafe').zh && r.act, 'lang=zh -> Chinese title');
  r = evalSit('sit=zzz'); ok(r.s === null && r.t === '' && !r.act, 'unknown sit -> free talk (old behaviour)');
  r = evalSit('topic=Pets&sit=cafe'); ok(r.s === null && r.t === 'Pets', '?topic= wins over ?sit=');
  r = evalSit(''); ok(r.s === null && r.t === '' && !r.act, 'no params -> unchanged');
  ok(/body\.lesson_topic = situationActive\(\) \? \(isZh\(\) \? SITUATION\.zhRole : SITUATION\.role\) : LESSON_TOPIC/.test(wu), 'server gets the role text (per language) only while the situation is active');
  const rb = wu.slice(wu.indexOf('(function restoreBtsBook(){'), wu.indexOf('})();', wu.indexOf('(function restoreBtsBook(){')));
  ok(/if\(SITUATION\) return;/.test(rb), 'saved textbook does not override a situation');
  const fg = wu.slice(wu.indexOf('function fallbackGreeting(){'), wu.indexOf('var g = (isZh()', wu.indexOf('function fallbackGreeting(){')));
  ok(/if\(situationActive\(\)\)\{/.test(fg) && /isZh\(\) \? SITUATION\.zhOpen : SITUATION\.open/.test(fg) && /isZh\(\) \? SITUATION\.zhChips : SITUATION\.chips/.test(fg) && fg.includes('return;'), 'greeting opens with the role line in the right language');
  ok(/if\(d && d\.ok && !situationActive\(\)\)/.test(wu), 'server textbook does not hijack a situation');

  // 4) common settings: never writes unless a person chooses; writes both screens' keys
  const SET = run('js/ai-speaking-settings.js').AiSpeakSettings;
  const mkLS = (init = {}, opts = {}) => { const m = new Map(Object.entries(init)); const writes = []; return { writes,
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { if (opts.block) throw new Error('quota'); writes.push(k); if (!opts.ignore) m.set(k, String(v)); } }; };
  let ls = mkLS(); let st = SET.read(ls);
  ok(st.level === 0 && st.corr === '' && st.lang === '' && ls.writes.length === 0, 'reading writes nothing; unset stays unset');
  ok(SET.chooseLevel(ls, 5) === true && ls.getItem('mangoi_warmup_level') === '5' && ls.getItem('mangoi_aifriend_level') === 'S5', 'level writes both screens');
  ok(SET.chooseCorr(ls, 'balanced') && ls.getItem('mangoi_warmup_correction') === 'balanced' && ls.getItem('mangoi_aifriend_correction') === 'balanced', 'correction writes both screens');
  const before = ls.writes.length;
  ok(!SET.chooseLevel(ls, 9) && !SET.chooseLevel(ls, 0) && !SET.chooseLevel(ls, 2.5) && !SET.chooseCorr(ls, 'loud') && !SET.chooseLang(ls, 'ko') && ls.writes.length === before, 'bad values rejected without writing');
  st = SET.read(mkLS({ mangoi_warmup_level: '3', mangoi_aifriend_level: 'S6' })); ok(st.level === 'mixed', 'different saved levels -> mixed');
  st = SET.read(mkLS({ mangoi_aifriend_level: 'B1' })); ok(st.level === 4, 'legacy AI-friend level B1 -> 4');
  st = SET.read(mkLS({ mangoi_warmup_correction: 'focused', mangoi_aifriend_correction: 'free_talk' })); ok(st.corr === 'mixed', 'different corrections -> mixed');
  ok(SET.chooseLevel(mkLS({}, { block: true }), 3) === false, 'blocked storage -> false, no throw');
  ok(SET.chooseCorr(mkLS({}, { ignore: true }), 'focused') === false, 'storage that silently ignores writes -> false');
  ls = mkLS(); ok(SET.chooseLang(ls, 'zh') && ls.getItem('mangoi_warmup_lang') === 'zh' && ls.getItem('mangoi_lang') === null, 'talk language = warmup language key; UI language untouched');
  ok(SET.read(mkLS({ mangoi_warmup_lang: 'zh' })).lang === 'zh', 'reads Chinese');
  ok(!hub.includes('localStorage.setItem'), 'hub page itself never writes storage directly');
  console.log('PASS: redesign (' + n + ' checks) — cards, situations, warmup ?sit, common settings');
}
// 2026-11-03 owner: no Chinese names in the situation list (the conversation itself still follows the chosen language)
{
  const fn = hub.slice(hub.indexOf('function renderSituations(){'), hub.indexOf('function renderSettings(){'));
  assert.ok(fn.length > 100 && !/s\.zh\b/.test(fn), 'situation list does not print Chinese names');
  assert.ok(/SIT\.url\(s, tl\)/.test(fn), 'list links still carry the chosen talk language');
  console.log('PASS: no Chinese situation names in the list');
}
