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
  // 2026-11-03 owner: step 5 cancelled; five child/teen situations per step; English only (no Chinese)
  ok(S.list.length === 20 && S.steps.length === 4, 'twenty situations in four steps');
  for (const st of S.steps) ok(S.list.filter(s => s.step === st.n).length === 5, 'step ' + st.n + ' has five');
  ok(!/[\u4e00-\u9fff]/.test(read('js/ai-situations.js')), 'situation table has no Chinese characters');
  ok(!/[\u4e00-\u9fff]/.test(hub), 'hub has no Chinese characters');
  ok(new Set(S.list.map(s => s.id)).size === S.list.length, 'unique ids');
  for (const s of S.list) {
    ok(/^[a-z0-9-]+$/.test(s.id), s.id + ' id is url-safe');
    ok(S.steps.some(g => g.n === s.step), s.id + ' step known');
    ok(/어린이|청소년/.test(s.role) && /영어 대화/.test(s.role), s.id + ' role targets kids/teens in English');
    ok(!s.img || existsSync(new URL(s.img.slice(1), pub)), s.id + ' picture exists');
    ok(!s.role.includes("'"), s.id + ' role has no single quote (server wraps it in quotes)');
    ok(s.role.includes(s.open), s.id + ' role tells the server what the AI already said');
    ok(!/[‍]/.test(s.ic) && [...s.ic].every(c => c.codePointAt(0) < 0x1FA70), s.id + ' icon is old-Windows safe');
    ok(Array.isArray(s.chips) && s.chips.length === 2 && s.chips.every(c => /^[\x20-\x7e]+$/.test(c)), s.id + ' chips are plain English (sent as speech)');
    const u = new URL(S.url(s), 'https://x.test/');
    ok(u.pathname === '/warmup.html' && u.searchParams.get('sit') === s.id && u.searchParams.get('setup') === '0' && u.searchParams.get('lang') === 'en', s.id + ' url (English)');
  }
  ok(S.find('BAKERY') && S.find('BAKERY').id === 'bakery', 'find ignores case');
  ok(S.find('nope') === null && S.find('') === null, 'unknown id -> null (free talk)');

  // 3) warmup consumes ?sit= : run the real block from warmup.html
  const wu = read('warmup.html');
  ok(wu.indexOf('/js/ai-situations.js') > 0 && wu.indexOf('/js/ai-situations.js') < wu.indexOf("var LESSON_TOPIC = Q.get('unit')"), 'warmup loads the table before reading ?sit');
  const a = wu.indexOf("var LESSON_TOPIC = Q.get('unit')"), b = wu.indexOf('function situationActive()');
  const block = wu.slice(a, wu.indexOf('\n', b));
  const evalSit = (qs) => { const ctx = { window: { MangoiSituations: S }, Q: new URLSearchParams(qs) }; vm.createContext(ctx); vm.runInContext(block + ';this.out={t:LESSON_TOPIC,s:SITUATION&&SITUATION.id,act:situationActive()};', ctx); return ctx.out; };
  let r = evalSit('sit=bakery'); ok(r.s === 'bakery' && r.t === 'Ordering at a bakery' && r.act, '?sit=bakery -> short topic + active');
  r = evalSit('sit=zzz'); ok(r.s === null && r.t === '' && !r.act, 'unknown sit -> free talk (old behaviour)');
  r = evalSit('topic=Pets&sit=bakery'); ok(r.s === null && r.t === 'Pets', '?topic= wins over ?sit=');
  r = evalSit(''); ok(r.s === null && r.t === '' && !r.act, 'no params -> unchanged');
  ok(/body\.lesson_topic = situationActive\(\) \? SITUATION\.role : LESSON_TOPIC/.test(wu), 'server gets the role text only while the situation is active');
  ok(!/SIT_ZH|zhRole|zhOpen|zhChips/.test(wu), 'warmup has no Chinese situation code');
  const rb = wu.slice(wu.indexOf('(function restoreBtsBook(){'), wu.indexOf('})();', wu.indexOf('(function restoreBtsBook(){')));
  ok(/if\(SITUATION\) return;/.test(rb), 'saved textbook does not override a situation');
  const fg = wu.slice(wu.indexOf('function fallbackGreeting(){'), wu.indexOf('var g = (isZh()', wu.indexOf('function fallbackGreeting(){')));
  ok(/if\(situationActive\(\) && !isZh\(\)\)/.test(fg) && fg.includes("addMsg(SITUATION.open, 'ai')") && fg.includes('showAnswerChips(SITUATION.chips)') && fg.includes('return;'), 'greeting opens with the role line');
  ok(/if\(d && d\.ok && !situationActive\(\)\)/.test(wu), 'server textbook does not hijack a situation');

  // 4) common settings: never writes unless a person chooses; writes both screens' keys
  const SET = run('js/ai-speaking-settings.js').AiSpeakSettings;
  const mkLS = (init = {}, opts = {}) => { const m = new Map(Object.entries(init)); const writes = []; return { writes,
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { if (opts.block) throw new Error('quota'); writes.push(k); if (!opts.ignore) m.set(k, String(v)); } }; };
  let ls = mkLS(); let st = SET.read(ls);
  ok(st.level === 0 && st.corr === '' && st.lang === 'ko' && ls.writes.length === 0, 'reading writes nothing; unset stays unset');
  ok(SET.chooseLevel(ls, 5) === true && ls.getItem('mangoi_warmup_level') === '5' && ls.getItem('mangoi_aifriend_level') === 'S5', 'level writes both screens');
  ok(SET.chooseCorr(ls, 'balanced') && ls.getItem('mangoi_warmup_correction') === 'balanced' && ls.getItem('mangoi_aifriend_correction') === 'balanced', 'correction writes both screens');
  const before = ls.writes.length;
  ok(!SET.chooseLevel(ls, 9) && !SET.chooseLevel(ls, 0) && !SET.chooseLevel(ls, 2.5) && !SET.chooseCorr(ls, 'loud') && !SET.chooseLang(ls, 'zh') && ls.writes.length === before, 'bad values rejected without writing');
  st = SET.read(mkLS({ mangoi_warmup_level: '3', mangoi_aifriend_level: 'S6' })); ok(st.level === 'mixed', 'different saved levels -> mixed');
  st = SET.read(mkLS({ mangoi_aifriend_level: 'B1' })); ok(st.level === 4, 'legacy AI-friend level B1 -> 4');
  st = SET.read(mkLS({ mangoi_warmup_correction: 'focused', mangoi_aifriend_correction: 'free_talk' })); ok(st.corr === 'mixed', 'different corrections -> mixed');
  ok(SET.chooseLevel(mkLS({}, { block: true }), 3) === false, 'blocked storage -> false, no throw');
  ok(SET.chooseCorr(mkLS({}, { ignore: true }), 'focused') === false, 'storage that silently ignores writes -> false');
  ls = mkLS(); ok(SET.chooseLang(ls, 'en') && ls.getItem('mangoi_lang') === 'en' && ls.getItem('mangoi_lang_by') === 'user' && ls.getItem('mangoi_warmup_lang') === null, 'language = screen text (shared key like setLang(l,"user")); talk language untouched');
  ok(!hub.includes('localStorage.setItem'), 'hub page itself never writes storage directly');
  console.log('PASS: redesign (' + n + ' checks) — cards, situations, warmup ?sit, common settings');
}
// 2026-11-03 owner: no Chinese names in the situation list (the conversation itself still follows the chosen language)
{
  const fn = hub.slice(hub.indexOf('function renderSituations(){'), hub.indexOf('function renderSettings(){'));
  assert.ok(fn.length > 100 && !/s\.zh\b/.test(fn), 'situation list does not print Chinese names');
  assert.ok(/SIT\.url\(s\)/.test(fn), 'list links use the table url (English)');
  console.log('PASS: no Chinese situation names in the list');
}
// 2026-11-03 owner (A안 · ①설명형): one line under «교정 정도» says what the picked level really does.
// The wording is paired with the server (src/warmup-honest.ts) — change one, change the other.
// 2026-11-03 follow-up (trap-check): the server side is checked by RUNNING the real functions (types stripped),
// and renderSettings is cut out of the page and RUN on a fake DOM — «the text exists» checks let
// a swapped ko/en or an `if (false && …)` pass.
{
  const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path');
  const { stripTypeScriptTypes } = await import('node:module');
  const { pathToFileURL, fileURLToPath } = await import('node:url');
  let n = 0; const ok = (v, m) => { n++; assert.ok(v, m); };
  const LV = ['free_talk', 'balanced', 'focused'];
  const attrs = tag => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
  const tags = LV.map(id => hub.match(new RegExp('<button[^>]*data-corr="' + id + '"[^>]*>'))?.[0] || '');
  const hint = (id, l) => attrs(tags[LV.indexOf(id)])['data-hint-' + l] || '';

  // ① the copy itself
  for (const id of LV) {
    for (const l of ['ko', 'en']) {
      ok(hint(id, l).length > 0, id + ' ' + l + ' hint exists');
      ok(!/\p{Extended_Pictographic}/u.test(hint(id, l)), id + ' ' + l + ' hint has no emoji (old Windows)');
    }
    ok([...hint(id, 'ko')].length <= 24, id + ' ko hint stays one short line on phones');
  }

  // ② pair with the server: load src/warmup-honest.ts (types stripped) and run it
  const SRC = fileURLToPath(new URL('../cloudflare-deploy/src/', import.meta.url));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aisp-hint-'));
  for (const [from, to] of [['warmup-empathy.ts', 'warmup-empathy.mjs'], ['warmup-shop-mode.ts', 'warmup-shop-mode.mjs'], ['warmup-honest.ts', 'warmup-honest.mjs']]) {
    const js = stripTypeScriptTypes(fs.readFileSync(path.join(SRC, from), 'utf8'))
      .replace(/from '\.\/warmup-empathy'/g, "from './warmup-empathy.mjs'").replace(/from '\.\/warmup-shop-mode'/g, "from './warmup-shop-mode.mjs'");
    fs.writeFileSync(path.join(tmp, to), js);
  }
  const H = await import(pathToFileURL(path.join(tmp, 'warmup-honest.mjs')).href);
  const reps = H.FOCUSED_FIX_REPEATS;
  ok(Number.isInteger(reps) && reps > 0, 'server repeat count loaded from the real module');
  const FIX = { was: 'I go to the park.', now: 'I went to the park.' };
  const spoken = H.ensureFocusedFixSpoken('Nice! What did you do?', 'focused', 'partial', FIX);
  ok(spoken.split(FIX.now).length - 1 === reps && /say it with me/i.test(spoken), 'server: focused says the fixed sentence N times, then repeat-after-me');
  // focused: the number is how many times it is SAID — «N번 고쳐요» / «최대 N번» would be false
  ok(hint('focused', 'ko').includes(reps + '번 들려') && hint('focused', 'en').includes('says it ' + reps + ' times'), 'focused hint ties the server count to «hearing it»');
  ok(!/(\d+|세)\s*번\s*(까지\s*)?고(치|쳐)|최대/.test(hint('focused', 'ko')) && !/up to|fixes \d/i.test(hint('focused', 'en')), 'focused hint does not read the count as «number of fixes»');
  ok(/따라 말/.test(hint('focused', 'ko')) && /repeat/i.test(hint('focused', 'en')), 'focused hint mentions repeat-after-me');
  // free talk: the server never asks to repeat, whatever the other gates decided
  let freeRepeats = 0;
  for (const shown of [FIX, null]) for (const rep of [true, false]) if (H.gateFixForMode('free_talk', FIX, shown, rep).repeat) freeRepeats++;
  ok(freeRepeats === 0, 'server: free talk never asks to repeat (gateFixForMode run 4 ways)');
  ok(/따라 말하기 없이/.test(hint('free_talk', 'ko')) && /no repeat/i.test(hint('free_talk', 'en')), 'free talk hint: no repeat-after-me (pairs with the server)');
  ok(hint('balanced', 'ko').includes('1번') && /\bonce\b/.test(hint('balanced', 'en')), 'balanced hint: repeat once');
  fs.rmSync(tmp, { recursive: true, force: true });

  // ③ renderSettings cut out of the page and run on a fake DOM — the picked level's line, in the screen language
  const fnSrc = name => {
    const s = hub.indexOf('function ' + name + '(');
    if (s < 0) return '';
    let d = 0, i = hub.indexOf('{', s);
    for (; i < hub.length; i++) { if (hub[i] === '{') d++; else if (hub[i] === '}' && --d === 0) break; }
    return hub.slice(s, i + 1);
  };
  // 2026-11-04: renderSettings now draws the picked-but-unsaved «draft» (saved only on «확인»), and calls renderOk
  const body = ['T', 'esc', 'renderSettings', 'renderOk', 'draftMissing'].map(fnSrc);
  ok(body.every(b => b.length > 20) && body[2].includes('corrState'), 'renderSettings / T / esc / renderOk / draftMissing cut out of the page');
  const run = (lang, corr) => {
    const a = tags.map(attrs);
    const buttons = a.map(o => ({ getAttribute: k => (k in o ? o[k] : null), setAttribute: (k, v) => { o[k] = String(v); } }));
    const el = { corrState: { textContent: '' }, setLevel: { innerHTML: '' } };
    const document = {
      getElementById: id => el[id] || null,
      querySelectorAll: sel => (sel === '[data-corr]' ? buttons : []),
      querySelector: sel => { const m = /^\[data-corr="([^"]+)"\]$/.exec(sel); return m ? buttons.find(b => b.getAttribute('data-corr') === m[1]) || null : null; }
    };
    const SET = { read: () => { throw new Error('renderSettings must draw the draft, not storage'); }, LEVELS: [], CORR: LV };
    new Function('document', 'SET', 'LS', 'ui', 'draft', 'okState', body.join('\n') + '\nrenderSettings();')(document, SET, {}, lang, { level: 0, corr }, '');
    return { text: el.corrState.textContent, pressed: a.map(o => o['aria-pressed']) };
  };
  for (const lang of ['ko', 'en']) {
    for (const id of LV) {
      const r = run(lang, id);
      ok(r.text === hint(id, lang), lang + '/' + id + ': the line is that level\'s hint in the screen language → ' + JSON.stringify(r.text));
      ok(r.pressed.join() === LV.map(x => String(x === id)).join(), lang + '/' + id + ': only the picked button is pressed');
    }
    ok(/화면마다 다름|Differs by screen/.test(run(lang, 'mixed').text), lang + ': mixed keeps the old «differs by screen» line');
    ok(/아직 안 정함|Not set/.test(run(lang, '').text), lang + ': unset keeps the old «not set» line');
  }
  ok(run('en', 'focused').text !== run('ko', 'focused').text, 'ko and en lines differ (catches a swapped language)');
  ok(/aria-describedby="corrState"/.test(hub), 'the button group is described by the hint line');
  console.log('PASS: correction hint line (A안 · ①설명형) — ' + n + ' checks, server run + page function run');
}
// 2026-11-04 owner: the «✅ 저장했어요 — 세 가지 연습에 함께 적용돼요» line and the note under it were removed and a
// «확인» button added. Picking language / level / corrections only changes the on-screen choice (draft); «확인»
// saves all three at once (level·corrections → both screens' keys, language → only when it differs from storage).
// The page's real functions — including wire() — are cut out and RUN on a fake DOM with the real settings module,
// so «clicking a button no longer writes» and «확인 writes» are both measured, not grepped.
{
  const vm = await import('node:vm');
  let n = 0; const ok = (v, m) => { n++; assert.ok(v, m); };
  const fnSrc = name => {
    const s = hub.indexOf('function ' + name + '(');
    if (s < 0) return '';
    let d = 0, i = hub.indexOf('{', s);
    for (; i < hub.length; i++) { if (hub[i] === '{') d++; else if (hub[i] === '}' && --d === 0) break; }
    return hub.slice(s, i + 1);
  };
  const NAMES = ['T', 'esc', 'applyUi', 'renderSituations', 'readDraft', 'renderSettings', 'renderOk', 'draftMissing', 'status', 'pick', 'confirmSettings', 'wire'];
  const fns = NAMES.map(fnSrc);
  ok(fns.every(f => f.length > 20), 'page functions cut out: ' + NAMES.filter((_, i) => fns[i].length <= 20).join(','));
  const uiLine = hub.match(/var ui = [^\n]+/)?.[0] || '', draftLine = hub.match(/var draft = readDraft\(\);/)?.[0] || '', okLine = hub.match(/var okState = '';/)?.[0] || '';
  ok(uiLine && draftLine && okLine, 'page declares ui / draft / okState the way the harness boots them');

  // markup: the visible lines are gone, a real button and a screen-reader-only status remain
  const markup = hub.replace(/<script[\s\S]*?<\/script>/g, '');
  ok(!/class="note"/.test(markup) && !markup.includes('목소리·말 빠르기는 각 화면에서'), 'the note under the settings is removed');
  ok(!markup.includes('함께 적용돼요'), 'no visible «함께 적용돼요» text left in the markup');
  ok(/<button type="button" class="ok-btn" id="setOk"[^>]*>/.test(markup) && markup.includes('id="setOkTxt"'), 'the «확인» button exists');
  ok(/<p id="setMsg" class="sr" role="status"/.test(markup), 'status line kept only for screen readers (visually hidden)');
  ok(!/id="setOkTxt"[^>]*data-ko/.test(markup), 'button label has no data-ko/en (the i18n loop would overwrite it)');
  // wiring guard: only confirmSettings may call the storage writers
  const writers = s => (s.match(/SET\.choose(Level|Corr|Lang)\(/g) || []).length;
  ok(writers(hub) === writers(fnSrc('confirmSettings')) && writers(hub) === 3, 'storage is written only inside confirmSettings (3 writers)');

  const ctx = { console }; ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(read('js/ai-speaking-settings.js'), ctx);
  const SET = ctx.AiSpeakSettings;
  const CORR = ['free_talk', 'balanced', 'focused'];
  const attrs = tag => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
  const mkLS = (init = {}, opts = {}) => { const m = new Map(Object.entries(init)); const writes = []; return { writes, m,
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { if (opts.block) throw new Error('quota'); writes.push(k); m.set(k, String(v)); } }; };
  const mkEl = (a = {}) => { const h = {}; const o = { ...a }; return { o, textContent: '', innerHTML: '', value: '', disabled: false, hidden: false,
    getAttribute: k => (k in o ? o[k] : null), setAttribute: (k, v) => { o[k] = String(v); },
    addEventListener: (ev, fn) => { (h[ev] = h[ev] || []).push(fn); }, fire: ev => (h[ev] || []).forEach(fn => fn({ preventDefault() {} })) }; };
  const boot = (init, opts) => {
    const ls = mkLS(init, opts);
    const corr = CORR.map(id => mkEl(attrs(hub.match(new RegExp('<button[^>]*data-corr="' + id + '"[^>]*>'))[0])));
    const lang = ['ko', 'en'].map(l => mkEl({ 'data-lang': l }));
    const els = { setLevel: mkEl(), corrState: mkEl(), setOk: mkEl(), setOkTxt: mkEl(), setMsg: mkEl() };
    const document = { documentElement: { lang: '' }, title: '',
      getElementById: id => els[id] || null,
      querySelectorAll: sel => (sel === '[data-corr]' ? corr : sel === '[data-lang]' ? lang : []),
      querySelector: sel => { const m = /^\[data-corr="([^"]+)"\]$/.exec(sel); return m ? corr.find(b => b.getAttribute('data-corr') === m[1]) || null : null; } };
    const api = new Function('document', 'SET', 'LS', 'SIT', [uiLine, ...fns, draftLine, okLine,
      'applyUi(); renderSituations(); renderSettings(); wire();', 'return { get ui(){ return ui; }, get draft(){ return draft; } };'].join('\n'))(document, SET, ls, null);
    const btn = () => ({ disabled: els.setOk.disabled, text: els.setOkTxt.textContent, state: els.setOk.getAttribute('data-state') || '' });
    const click = id => corr[CORR.indexOf(id)].fire('click');
    const level = v => { els.setLevel.value = String(v); els.setLevel.fire('change'); };
    return { ls, els, api, btn, click, level, lang, document, confirm: () => els.setOk.fire('click') };
  };

  // A) empty storage: nothing is written until «확인»; the button says what is missing
  let s = boot({});
  ok(s.ls.writes.length === 0, 'A: opening the page writes nothing');
  ok(s.btn().disabled && s.btn().text === '수준·교정 정도를 골라 주세요', 'A: nothing picked -> locked, asks for both → ' + JSON.stringify(s.btn()));
  // level 0 (not set) must show the «not set» header — otherwise «1단계» looks picked and choosing 1 fires no change
  ok(/^<option value="" selected>아직 안 정함/.test(s.els.setLevel.innerHTML) && !/value="1" selected/.test(s.els.setLevel.innerHTML), 'A: unset level shows the «not set» header selected, not level 1');
  s.level(4);
  ok(s.ls.writes.length === 0, 'A: picking a level does not save');
  ok(s.btn().disabled && s.btn().text === '교정 정도를 골라 주세요', 'A: level picked -> still locked, asks for corrections');
  s.click('focused');
  ok(s.ls.writes.length === 0, 'A: picking a correction does not save');
  ok(!s.btn().disabled && s.btn().text === '확인' && s.btn().state === '', 'A: both picked -> «확인» enabled');
  s.confirm();
  ok(s.ls.getItem('mangoi_warmup_level') === '4' && s.ls.getItem('mangoi_aifriend_level') === 'S4', 'A: 확인 saves the level to both screens');
  ok(s.ls.getItem('mangoi_warmup_correction') === 'focused' && s.ls.getItem('mangoi_aifriend_correction') === 'focused', 'A: 확인 saves the correction to both screens');
  ok(!s.ls.writes.includes('mangoi_lang') && !s.ls.writes.includes('mangoi_lang_by'), 'A: unchanged language is not rewritten (keeps auto-detect flag)');
  ok(s.btn().text === '✅ 적용됐어요' && s.btn().state === 'saved' && !s.btn().disabled, 'A: after 확인 -> «✅ 적용됐어요» → ' + JSON.stringify(s.btn()));
  ok(/세 가지|AI 친구/.test(s.els.setMsg.textContent), 'A: screen-reader status says it was saved');
  const before = s.ls.writes.length;
  s.click('balanced');
  ok(s.ls.writes.length === before && s.ls.getItem('mangoi_warmup_correction') === 'focused', 'A: changing after save does not write until 확인 again');
  ok(s.btn().text === '확인' && s.btn().state === '' && s.els.setMsg.textContent === '', 'A: a new pick resets the button to «확인»');
  s.confirm();
  ok(s.ls.getItem('mangoi_aifriend_correction') === 'balanced' && s.btn().state === 'saved', 'A: second 확인 saves the new pick');
  s.els.setLevel.value = ''; s.els.setLevel.fire('change');
  ok(s.api.draft.level === 4, 'A: the «not set» header option does not clear the pick');

  // B) already saved and the same on both screens: ready, but not claiming «applied» before a press
  s = boot({ mangoi_warmup_level: '5', mangoi_aifriend_level: 'S5', mangoi_warmup_correction: 'balanced', mangoi_aifriend_correction: 'balanced' });
  ok(s.ls.writes.length === 0 && !s.btn().disabled && s.btn().text === '확인', 'B: saved values -> «확인» ready, nothing written on open');
  ok(s.els.setLevel.innerHTML.includes('value="5" selected') && s.els.corrState.textContent === attrs(hub.match(/<button[^>]*data-corr="balanced"[^>]*>/)[0])['data-hint-ko'], 'B: shows the saved level and its correction line');

  // C) the two screens differ -> must pick to unify; 확인 writes nothing even if fired while locked
  s = boot({ mangoi_warmup_level: '3', mangoi_aifriend_level: 'S6', mangoi_warmup_correction: 'balanced', mangoi_aifriend_correction: 'balanced' });
  ok(s.btn().disabled && s.btn().text === '수준을 골라 주세요', 'C: mixed level -> locked, asks for a level');
  s.confirm();
  ok(s.ls.writes.length === 0, 'C: a locked 확인 writes nothing (guard inside confirmSettings, not just the disabled attribute)');
  s.level(6); s.confirm();
  ok(s.ls.getItem('mangoi_warmup_level') === '6' && s.ls.getItem('mangoi_aifriend_level') === 'S6', 'C: after picking, 확인 unifies both screens');
  s = boot({ mangoi_warmup_level: '2', mangoi_warmup_correction: 'focused', mangoi_aifriend_correction: 'free_talk' });
  ok(s.btn().disabled && s.btn().text === '교정 정도를 골라 주세요', 'C: mixed correction -> locked, asks for corrections');

  // D) language: preview immediately, save on 확인 only
  s = boot({ mangoi_lang: 'ko', mangoi_warmup_level: '5', mangoi_aifriend_level: 'S5', mangoi_warmup_correction: 'balanced', mangoi_aifriend_correction: 'balanced' });
  s.lang[1].fire('click');
  ok(s.api.ui === 'en' && s.document.documentElement.lang === 'en' && s.btn().text === 'Confirm', 'D: English shows at once (preview), button in English');
  ok(s.ls.writes.length === 0 && s.ls.getItem('mangoi_lang') === 'ko', 'D: choosing a language does not save it');
  s.confirm();
  ok(s.ls.getItem('mangoi_lang') === 'en' && s.ls.getItem('mangoi_lang_by') === 'user', 'D: 확인 saves the language as the person\'s choice');
  ok(s.btn().text === '✅ Applied', 'D: applied label in English');

  // E) storage that throws: honest failure on the button, retry possible
  s = boot({ mangoi_warmup_level: '5', mangoi_aifriend_level: 'S5', mangoi_warmup_correction: 'balanced', mangoi_aifriend_correction: 'balanced' }, { block: true });
  s.confirm();
  ok(s.btn().state === 'fail' && s.btn().text === '⚠️ 이 기기에선 저장이 안 돼요' && !s.btn().disabled, 'E: blocked storage -> failure label, still pressable');
  ok(/저장이 안 돼요/.test(s.els.setMsg.textContent), 'E: screen-reader status says it failed');
  console.log('PASS: confirm button (확인) — ' + n + ' checks, page functions + wiring run on a fake DOM');
}
