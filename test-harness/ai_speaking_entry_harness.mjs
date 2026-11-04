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
  for (const [from, to] of [['warmup-empathy.ts', 'warmup-empathy.mjs'], ['warmup-shop-mode.ts', 'warmup-shop-mode.mjs'], ['warmup-honest.ts', 'warmup-honest.mjs'], ['english-only.ts', 'english-only.mjs'], ['warmup-correction.ts', 'warmup-correction.mjs']]) {
    const js = stripTypeScriptTypes(fs.readFileSync(path.join(SRC, from), 'utf8'))
      .replace(/from '\.\/warmup-empathy'/g, "from './warmup-empathy.mjs'").replace(/from '\.\/warmup-shop-mode'/g, "from './warmup-shop-mode.mjs'")
      .replace(/from '\.\/english-only'/g, "from './english-only.mjs'");
    fs.writeFileSync(path.join(tmp, to), js);
  }
  const H = await import(pathToFileURL(path.join(tmp, 'warmup-honest.mjs')).href);
  ok(typeof H.ensureFocusedFixSpoken === 'function' && typeof H.gateFixForMode === 'function', 'server: warmup-honest functions loaded (renamed export → clean FAIL, not a crash)');
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
  // balanced (2026-11-04 사장님 「균형 문구를 서버 동작에 맞게 약하게」): the server does NOT ask to repeat after every fix —
  // warmupShouldOfferRepeat allows it at most once per WARMUP_REPEAT_GAP_TURNS turns. Run the real gate turn by turn.
  const C = await import(pathToFileURL(path.join(tmp, 'warmup-correction.mjs')).href);
  const gap = C.WARMUP_REPEAT_GAP_TURNS;
  ok(Number.isInteger(gap) && gap > 1, 'server: balanced repeat gap loaded from the real module (' + gap + ' turns)');
  ok(typeof C.decideWarmupFixShow === 'function' && typeof C.warmupShouldOfferRepeat === 'function' && typeof H.gateFixForMode === 'function', 'server: decideWarmupFixShow / warmupShouldOfferRepeat / gateFixForMode loaded');
  const MAJOR = { was: 'I go to the park yesterday.', now: 'I went to the park yesterday.', tag: 'past_tense', severity: 'major' };
  const MINOR = { was: 'I saw cat.', now: 'I saw a cat.', tag: 'article', severity: 'minor' };
  let memo = null, shows = 0, reps2 = 0;
  for (let turn = 1; turn <= 6; turn++) {
    const d = C.decideWarmupFixShow(MAJOR, memo, turn, { immediate: false });
    const g = H.gateFixForMode('balanced', MAJOR, d.show, C.warmupShouldOfferRepeat(d.show, d.memo, turn));
    if (g.show) shows++; if (g.repeat) reps2++;
    memo = d.memo;
  }
  ok(shows === 6 && reps2 >= 1 && reps2 < shows, 'server: balanced fixes a big mistake every turn but asks to repeat only some turns (' + shows + ' fixes, ' + reps2 + ' repeats)');
  // small mistakes are fixed too, just not on back-to-back turns → «mostly key mistakes», not «only key mistakes»
  let mm = null, minorShows = 0;
  for (let turn = 1; turn <= 6; turn++) { const d = C.decideWarmupFixShow(MINOR, mm, turn, { immediate: false }); if (H.gateFixForMode('balanced', MINOR, d.show, false).show) minorShows++; mm = d.memo; }
  ok(minorShows >= 1 && minorShows < 6, 'server: balanced fixes small mistakes on some turns, not every turn (' + minorShows + '/6)');
  ok(/위주|주로|대부분/.test(hint('balanced', 'ko')) && /mostly|mainly|chiefly/i.test(hint('balanced', 'en')), 'balanced hint says «mostly» key mistakes (small ones are fixed too)');
  ok(!/만\s*고치|만 고쳐/.test(hint('balanced', 'ko')) && !/\bonly\b/i.test(hint('balanced', 'en')), 'balanced hint does not say «only» key mistakes');

  // wiring — the two screens' OWN lines, cut out of the server source (types stripped) and run turn by turn.
  // The functions above can be right while a screen ignores them (e.g. `offerRepeat = !!showFix`) — this catches that.
  const SRCF = f => fs.readFileSync(path.join(SRC, f), 'utf8');
  const cutLines = (src, startMark, endMark) => { const a = src.indexOf(startMark); if (a < 0) return ''; const e = src.indexOf(endMark, a); if (e < 0) return ''; const nl = src.indexOf('\n', e); return src.slice(a, nl < 0 ? src.length : nl); };
  const IDX = SRCF('index.ts'), AIF = SRCF('api-ai.ts');
  const wSnip = cutLines(IDX, 'const decided = decideWarmupFixShow(verified, memoIn, turnCount', 'if (honest) { const g = gateFixForMode(');
  const fSnip = cutLines(AIF, 'const immediateFix = friendMode', 'const immediateFix = friendMode') + '\n'
    + cutLines(AIF, 'const decided = decideWarmupFixShow(verified, memoIn, turnNo', "else if (friendMode === 'focused') offerRepeat");
  ok(wSnip.includes('warmupShouldOfferRepeat(') && fSnip.includes('warmupShouldOfferRepeat(') && fSnip.includes('const immediateFix'), 'wiring: decide→repeat lines cut out of src/index.ts (warmup) and src/api-ai.ts (AI friend)');
  let wire = ''; try { wire = stripTypeScriptTypes(
    'export async function warm(decideWarmupFixShow, warmupShouldOfferRepeat, gateFixForMode, verified, memoIn, turnCount, honest, ctxUserId) {\n'
    + "  let showFix = null, traceTag = '', traceReason = 'shown', offerRepeat = false;\n" + wSnip + '\n  return { showFix, offerRepeat, memo: decided.memo };\n}\n'
    + 'export async function friend(decideWarmupFixShow, warmupShouldOfferRepeat, gateFixForMode, verified, memoIn, turnNo, friendMode, logAiFriendFix, env, uid) {\n'
    + '  let showFix = null, offerRepeat = false;\n' + fSnip + '\n  return { showFix, offerRepeat, memo: decided.memo };\n}\n'); } catch (e) { wire = ''; }
  fs.writeFileSync(path.join(tmp, 'wire.mjs'), wire);
  let W = null; try { if (!wire) throw new Error('strip failed'); W = await import(pathToFileURL(path.join(tmp, 'wire.mjs')).href); } catch (e) { W = null; }
  ok(W && typeof W.warm === 'function' && typeof W.friend === 'function', 'wiring: the cut lines compile and load');
  const runScreen = async (screen, mode, fix) => {
    let m = null, sh = 0, rp = 0;
    try {
      for (let t = 1; t <= 6; t++) {
        const r = screen === 'warmup'
          ? await W.warm(C.decideWarmupFixShow, C.warmupShouldOfferRepeat, H.gateFixForMode, fix, m, t, { mode }, '')
          : await W.friend(C.decideWarmupFixShow, C.warmupShouldOfferRepeat, H.gateFixForMode, fix, m, t, mode, async () => {}, { DB: null }, 'u1');
        if (r.showFix) sh++; if (r.offerRepeat) rp++; m = r.memo;
      }
    } catch (e) { return { sh: -1, rp: -1, err: String((e && e.message) || e) }; }
    return { sh, rp };
  };
  for (const screen of (W ? ['warmup', 'AI friend'] : [])) {
    const b = await runScreen(screen, 'balanced', MAJOR), f = await runScreen(screen, 'focused', MAJOR), fr = await runScreen(screen, 'free_talk', MAJOR);
    ok(b.sh === 6 && b.rp >= 1 && b.rp < b.sh, 'wiring: ' + screen + ' balanced fixes every turn, repeat only some turns (' + JSON.stringify(b) + ')');
    // pairs — prove the run sees the mode (otherwise «never repeat» or «always repeat» could pass the line above by luck)
    ok(f.sh === 6 && f.rp === 6, 'wiring: ' + screen + ' focused repeats every turn (' + JSON.stringify(f) + ')');
    ok(fr.rp === 0, 'wiring: ' + screen + ' free talk never repeats (' + JSON.stringify(fr) + ')');
    const bm = await runScreen(screen, 'balanced', MINOR);   // «mostly key mistakes»: small ones are fixed, but not on back-to-back turns
    ok(bm.sh >= 1 && bm.sh < 6, 'wiring: ' + screen + ' balanced fixes small mistakes on some turns, not every turn (' + JSON.stringify(bm) + ')');
  }
  // so the hint must say «sometimes», not «every time / once after each fix»
  ok(/따라 말/.test(hint('balanced', 'ko')) && /repeat/i.test(hint('balanced', 'en')), 'balanced hint mentions repeat-after-me');
  ok(/가끔|때때로|이따금|때로/.test(hint('balanced', 'ko')) && /sometimes|now and then|occasionally|from time to time/i.test(hint('balanced', 'en')), 'balanced hint says the repeat is occasional (pairs with the server gap)');
  ok(!/1\s*번|한\s*번|매번|항상|꼭|마다|(^|\s)늘(\s|$)/.test(hint('balanced', 'ko')) && !/\bonce\b|every|\beach\b|always|then you repeat/i.test(hint('balanced', 'en')), 'balanced hint does not promise a repeat after every fix');
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
// saves level + corrections at once (both screens' keys). Same day, owner: «언어는 바로 저장되게 되돌려줘» — language
// is saved the moment it is tapped (as before), independent of «확인».
// The page's WHOLE inline script (its own declarations and its own boot line) is RUN on a fake DOM with the real
// settings module, so «clicking a button no longer writes» and «확인 writes» are both measured, not grepped.
// 2026-11-04 trap-check: the first version cut out functions and wrote its own boot line — dropping `wire();` or
// `renderSettings();` from the page, or moving `var draft` below the boot, all still passed. Now the page boots itself.
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
  // the one inline <script> (no src) — the page's own code, run as-is
  const inline = [...hub.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  ok(inline.length === 1 && inline[0].includes('confirmSettings') && /\}\)\(\);\s*$/.test(inline[0]), 'one inline script found (self-booting IIFE)');
  // the visually-hidden rule really hides (otherwise the removed «…함께 적용돼요» line shows again under the button)
  const css = hub.slice(hub.indexOf('<style>'), hub.indexOf('</style>'));
  ok(/\.sr\{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect\(0 0 0 0\)/.test(css), '.sr rule is a real visually-hidden rule (1px + clip)');
  ok(!/#setMsg\s*\{/.test(css), 'no #setMsg rule that could make the status line visible again');

  // markup: the visible lines are gone, a real button and a screen-reader-only status remain
  const markup = hub.replace(/<script[\s\S]*?<\/script>/g, '');
  ok(!/class="note"/.test(markup) && !markup.includes('목소리·말 빠르기는 각 화면에서'), 'the note under the settings is removed');
  ok(!markup.includes('함께 적용돼요'), 'no visible «함께 적용돼요» text left in the markup');
  ok(/<button type="button" class="ok-btn" id="setOk"[^>]*>/.test(markup) && markup.includes('id="setOkTxt"'), 'the «확인» button exists');
  ok(/<p id="setMsg" class="sr" role="status"/.test(markup), 'status line kept only for screen readers (visually hidden)');
  ok(!/id="setOkTxt"[^>]*data-ko/.test(markup), 'button label has no data-ko/en (the i18n loop would overwrite it)');
  // wiring guard: only confirmSettings may call the storage writers
  const writers = (s, re = /SET\.choose(Level|Corr)\(/g) => (s.match(re) || []).length;
  ok(writers(hub) === writers(fnSrc('confirmSettings')) && writers(hub) === 2, 'level / corrections are written only inside confirmSettings');
  const langWriters = s => writers(s, /SET\.chooseLang\(/g);
  ok(langWriters(hub) === 1 && langWriters(fnSrc('confirmSettings')) === 0 && langWriters(fnSrc('wire')) === 1, 'language is written only by its own click handler (in wire), not by 확인');

  const ctx = { console }; ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(read('js/ai-speaking-settings.js'), ctx);
  const SET = ctx.AiSpeakSettings;
  const CORR = ['free_talk', 'balanced', 'focused'];
  const attrs = tag => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
  const mkLS = (init = {}, opts = {}) => { const m = new Map(Object.entries(init)); const writes = []; return { writes, m,
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { if (opts.block) throw new Error('quota'); writes.push(k); m.set(k, String(v)); } }; };
  // 2026-11-04 6차(«확인 안 누르고 나가면 묻기»): focus · inert(속성) · 이벤트 객체(target·preventDefault)까지 흉내 낸다
  let active = null;
  const evt = (target, extra = {}) => { const e = { target, defaultPrevented: false, button: 0, ...extra }; e.preventDefault = () => { e.defaultPrevented = true; }; return e; };
  const mkEl = (a = {}) => { const h = {}; const o = { ...a }; const el = { o, textContent: '', innerHTML: '', value: '', disabled: false, hidden: false,
    getAttribute: k => (k in o ? o[k] : null), setAttribute: (k, v) => { o[k] = String(v); }, removeAttribute: k => { delete o[k]; }, hasAttribute: k => k in o,
    focus: o => { active = el; el.focusArg = o; }, scrollIntoView: () => {},
    addEventListener: (ev, fn) => { (h[ev] = h[ev] || []).push(fn); },
    fire: (ev, extra) => { const e = evt(el, extra); (h[ev] || []).forEach(fn => fn(e)); return e; } }; return el; };
  const boot = (init, opts = {}) => {
    const ls = mkLS(init, opts);
    const corr = CORR.map(id => mkEl(attrs(hub.match(new RegExp('<button[^>]*data-corr="' + id + '"[^>]*>'))[0])));
    const lang = ['ko', 'en'].map(l => mkEl({ 'data-lang': l }));
    const els = { setLevel: mkEl(), corrState: mkEl(), setOk: mkEl(), setOkTxt: mkEl(), setMsg: mkEl(),
      leaveAsk: mkEl(), leaveTitle: mkEl(), leaveBody: mkEl(), leavePick: mkEl(), leaveGo: mkEl(), leaveSkip: mkEl(), leaveStay: mkEl() };
    els.leaveAsk.hidden = true;   // markup: <div class="leave" id="leaveAsk" hidden>
    const wrap = mkEl(); active = null;
    const dh = {}, wh = {};
    const document = { documentElement: { lang: '' }, title: '', get activeElement() { return active; },
      getElementById: id => els[id] || null,
      addEventListener: (ev, fn) => { (dh[ev] = dh[ev] || []).push(fn); },
      querySelectorAll: sel => (sel === '[data-corr]' ? corr : sel === '[data-lang]' ? lang : []),
      querySelector: sel => { if (sel === '.wrap') return wrap; const m = /^\[data-corr="([^"]+)"\]$/.exec(sel); return m ? corr.find(b => b.getAttribute('data-corr') === m[1]) || null : null; } };
    const timers = [];
    const win = { AiSpeakSettings: SET, MangoiSituations: null, location: { href: '' }, setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
      addEventListener: (ev, fn) => { (wh[ev] = wh[ev] || []).push(fn); },
      removeEventListener: (ev, fn) => { wh[ev] = (wh[ev] || []).filter(f => f !== fn); } };
    if (opts.unavailable) Object.defineProperty(win, 'localStorage', { get() { throw new Error('SecurityError'); } });
    else win.localStorage = ls;
    const c = vm.createContext({ window: win, document, console });
    vm.runInContext(inline[0], c);   // the page declares its state and boots itself (applyUi · renderSituations · renderSettings · wire)
    const btn = () => ({ disabled: els.setOk.disabled, text: els.setOkTxt.textContent, state: els.setOk.getAttribute('data-state') || '' });
    const click = id => corr[CORR.indexOf(id)].fire('click');
    const level = v => { els.setLevel.value = String(v); els.setLevel.fire('change'); };
    // a click that bubbles up to the document (where the page listens for links)
    const docClick = extra => { const e = evt(extra.target, extra); (dh.click || []).forEach(fn => fn(e)); return e; };
    const mkLink = (href, a = {}) => { const l = mkEl({ href, ...a }); l.href = href.charAt(0) === '#' ? 'http://localhost/ai-speaking.html' + href : 'http://localhost' + href; l.closest = sel => (sel === 'a[href]' ? l : null); return l; };
    const clickLink = (href, a, extra = {}) => docClick({ ...extra, target: mkLink(href, a) });
    const bu = () => { const e = { defaultPrevented: false, returnValue: '' }; e.preventDefault = () => { e.defaultPrevented = true; }; (wh.beforeunload || []).forEach(fn => fn(e)); return { listeners: (wh.beforeunload || []).length, prevented: e.defaultPrevented }; };
    const pageshow = persisted => (wh.pageshow || []).forEach(fn => fn({ persisted }));
    const storageEvt = () => (wh.storage || []).forEach(fn => fn({}));
    const docKey = extra => { const e = evt(extra.target || null, extra); (dh.keydown || []).forEach(fn => fn(e)); return e; };
    const runTimers = () => { timers.splice(0).forEach(t => t.fn()); };
    const leave = () => ({ open: !els.leaveAsk.hidden, title: els.leaveTitle.textContent, body: els.leaveBody.textContent, pick: els.leavePick.textContent,
      go: els.leaveGo.textContent, skip: els.leaveSkip.textContent, stay: els.leaveStay.textContent, stayHidden: els.leaveStay.hidden });
    return { ls, els, btn, click, level, lang, document, corr, wrap, docClick, clickLink, bu, pageshow, leave, storageEvt, docKey, runTimers, timers,
      nav: () => win.location.href, active: () => active, confirm: () => els.setOk.fire('click') };
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
  s.level(6); s.els.setLevel.value = ''; s.els.setLevel.fire('change'); s.confirm();
  ok(s.ls.getItem('mangoi_warmup_level') === '6', 'A: the «not set» header option does not clear the pick');

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

  // D) language: saved the moment it is tapped (owner 2026-11-04), independent of «확인»
  s = boot({});
  s.lang[1].fire('click');
  ok(s.document.documentElement.lang === 'en' && s.ls.getItem('mangoi_lang') === 'en' && s.ls.getItem('mangoi_lang_by') === 'user', 'D: tapping English saves it at once — even with level/corrections not picked (button locked)');
  ok(s.btn().disabled && s.btn().text === 'Choose a level and corrections', 'D: …the confirm button stays about level/corrections, in English');
  ok(!s.ls.writes.some(k => /level|correction/.test(k)), 'D: a language tap writes no level/correction');
  s = boot({ mangoi_lang: 'ko', mangoi_warmup_level: '5', mangoi_aifriend_level: 'S5', mangoi_warmup_correction: 'balanced', mangoi_aifriend_correction: 'balanced' });
  s.confirm();
  ok(s.btn().text === '✅ 적용됐어요' && !s.ls.writes.includes('mangoi_lang'), 'D: 확인 does not rewrite the language (keeps auto-detect flag)');
  s.lang[1].fire('click');
  ok(s.ls.getItem('mangoi_lang') === 'en' && s.btn().text === '✅ Applied' && s.btn().state === 'saved', 'D: language tap after 확인 saves at once; level/corrections stay «applied» (label in English)');
  s.lang[1].fire('click');
  ok(s.ls.writes.filter(k => k === 'mangoi_lang').length === 1, 'D: tapping the current language again writes nothing');
  s = boot({ mangoi_lang: 'en' });
  ok(s.document.documentElement.lang === 'en', 'D: saved English opens in English');
  s.lang[0].fire('click');
  ok(s.ls.getItem('mangoi_lang') === 'ko' && s.ls.getItem('mangoi_lang_by') === 'user', 'D: en saved -> tap 한국어 -> ko saved at once');
  // language tap on a device that cannot save: screen still switches, failure is told (not silent)
  s = boot({ mangoi_lang: 'ko', mangoi_warmup_level: '5', mangoi_aifriend_level: 'S5', mangoi_warmup_correction: 'balanced', mangoi_aifriend_correction: 'balanced' }, { block: true });
  s.lang[1].fire('click');
  ok(s.document.documentElement.lang === 'en' && s.btn().state === 'fail' && /Could not save/.test(s.btn().text) && /language/.test(s.els.setMsg.textContent), 'D: blocked storage -> language shows but failure is told');

  // E) storage that throws: honest failure on the button, retry possible
  s = boot({ mangoi_warmup_level: '5', mangoi_aifriend_level: 'S5', mangoi_warmup_correction: 'balanced', mangoi_aifriend_correction: 'balanced' }, { block: true });
  s.confirm();
  ok(s.btn().state === 'fail' && s.btn().text === '⚠️ 이 기기에선 저장이 안 돼요' && !s.btn().disabled, 'E: blocked storage -> failure label, still pressable');
  ok(/저장이 안 돼요/.test(s.els.setMsg.textContent), 'E: screen-reader status says it failed');
  // F) storage that throws on access (page swaps in a dead store): page still boots, picks work, 확인 reports failure
  s = boot({}, { unavailable: true });
  ok(s.btn().disabled && s.btn().text === '수준·교정 정도를 골라 주세요', 'F: storage unavailable -> page still boots, locked');
  s.level(3); s.click('free_talk'); s.confirm();
  ok(s.btn().state === 'fail' && !s.btn().disabled, 'F: storage unavailable -> 확인 says it could not save');
  console.log('PASS: confirm button (확인) — ' + n + ' checks, the page\'s own inline script booted and clicked on a fake DOM');

  // G) 2026-11-04 6차(사장님 «확인 안 누르고 나가면 물어보게 해줘») — picked but not confirmed, then leaving -> asked.
  //    Same booted page. Pairs throughout: «asked» next to «not asked» (unchanged · changed back · after 확인 · cannot save),
  //    so «always ask» and «never ask» both fail.
  const n0 = n;
  const dIdx = markup.indexOf('<div class="leave" id="leaveAsk" hidden>');
  const dlg = dIdx >= 0 ? markup.slice(dIdx, markup.indexOf('</body>')) : '';
  ok(dIdx > 0 && /role="dialog" aria-modal="true" aria-labelledby="leaveTitle" aria-describedby="leaveBody"/.test(dlg), 'G: the ask dialog exists (modal, labelled)');
  ok(dlg && !/data-ko|data-en/.test(dlg), 'G: dialog texts have no data-ko/en (the page i18n loop would overwrite them) — the script writes them');
  const before_ = markup.slice(markup.indexOf('<body>'), dIdx);
  ok(dIdx > 0 && (before_.match(/<div\b/g) || []).length === (before_.match(/<\/div>/g) || []).length, 'G: the dialog sits outside .wrap (the page behind is made inert while it is open)');
  const ruleOf = sel => { const m = css.match(new RegExp('(?:^|[}\\s])' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}')); return m ? m[1] : ''; };
  const leaveRule = ruleOf('.leave'), wrapRule = ruleOf('.wrap'), zOf = r => Number((/z-index:(-?\d+)/.exec(r) || [])[1]);
  ok(/position:fixed/.test(leaveRule) && /top:0/.test(leaveRule) && /right:0/.test(leaveRule) && /bottom:0/.test(leaveRule) && /left:0/.test(leaveRule) && !/inset:/.test(leaveRule), 'G: dialog covers the screen with top/right/bottom/left (no inset shorthand — old Safari) → ' + leaveRule);
  ok(zOf(leaveRule) > zOf(wrapRule), 'G: dialog z-index is above the page (.wrap) → ' + zOf(leaveRule) + ' > ' + zOf(wrapRule));
  ok(/max-height:calc\(100vh[^;]*\);max-height:calc\(100dvh/.test(ruleOf('.leave-box')), 'G: box height fits the visible screen (100vh then 100dvh — iPhone toolbars)');
  ok(!/syncLeaveGuard|unapplied/.test(fnSrc('renderSettings') + fnSrc('renderOk')), 'G: renderSettings/renderOk do not read storage for the guard (block ③ runs them with a throwing store)');
  const SAVED = { mangoi_warmup_level: '5', mangoi_aifriend_level: 'S5', mangoi_warmup_correction: 'balanced', mangoi_aifriend_correction: 'balanced' };
  // G1 nothing changed -> links go through
  s = boot({ ...SAVED });
  let e = s.clickLink('/ai-friend.html');
  ok(!e.defaultPrevented && !s.leave().open && s.bu().listeners === 0, 'G1: nothing changed -> not asked, no beforeunload guard');
  // G2 changed -> guard on; changed back to the saved value -> not asked, guard off
  s.click('focused');
  ok(s.bu().listeners === 1 && s.bu().prevented, 'G2: a changed pick arms the browser prompt (back / reload / close)');
  s.click('balanced'); e = s.clickLink('/ai-friend.html');
  ok(!e.defaultPrevented && !s.leave().open && s.bu().listeners === 0, 'G2: changed back to the saved value -> not asked, guard removed');
  // G3 changed, not confirmed -> asked; «적용하고 이동» saves both screens and goes; no second (browser) prompt
  s = boot({ ...SAVED });
  s.level(3); s.click('focused');
  e = s.clickLink('/');   // 7차: 연습 시작 링크(data-start)는 묻지 않고 저장 후 간다(G13) — 묻는 것은 홈처럼 «연습을 안 하고 나가는» 링크
  ok(e.defaultPrevented && s.leave().open && s.nav() === '', 'G3: changed but not confirmed -> the link is held and the dialog opens');
  ok(s.leave().title === '설정을 아직 적용하지 않았어요' && /«확인»을 눌러야/.test(s.leave().body) && s.leave().pick === '고른 설정: 수준 3단계 · 교정 집중', 'G3: dialog says what is not applied and what was picked → ' + JSON.stringify(s.leave()));
  ok(s.leave().go === '적용하고 이동' && s.leave().skip === '적용 안 하고 이동' && s.leave().stay === '머무르기' && !s.leave().stayHidden, 'G3: three choices');
  ok(s.wrap.getAttribute('inert') === '' && s.active() === s.els.leaveGo, 'G3: the page behind is inert, focus on the main choice');
  ok(s.els.leaveGo.focusArg && s.els.leaveGo.focusArg.preventScroll === true, 'G3: …focused without scrolling (scrollIntoView cut the title on a 568×320 phone)');
  ok(s.ls.writes.length === 0, 'G3: asking writes nothing');
  s.els.leaveGo.fire('click');
  ok(s.ls.getItem('mangoi_warmup_level') === '3' && s.ls.getItem('mangoi_aifriend_level') === 'S3' && s.ls.getItem('mangoi_warmup_correction') === 'focused' && s.ls.getItem('mangoi_aifriend_correction') === 'focused', 'G3: «적용하고 이동» saves level + corrections to both screens');
  ok(s.nav() === 'http://localhost/' && !s.leave().open, 'G3: …and goes where the link pointed → ' + s.nav());
  ok(!s.bu().prevented && s.btn().state === 'saved', 'G3: …with no second browser prompt');
  // G4 «적용 안 하고 이동» -> nothing written, goes, the browser prompt does not ask again
  s = boot({ ...SAVED }); s.click('focused');
  s.clickLink('/'); s.els.leaveSkip.fire('click');
  ok(s.ls.writes.length === 0 && s.nav() === 'http://localhost/' && !s.leave().open, 'G4: «적용 안 하고 이동» writes nothing and goes');
  ok(s.bu().listeners === 1 && !s.bu().prevented, 'G4: …the browser prompt stays quiet while leaving (no double ask)');
  ok(s.timers.some(t => t.ms >= 1000), 'G4: a reset is scheduled in case the navigation is stopped');
  s.runTimers();
  ok(s.bu().prevented, 'G4: navigation stopped (still on this page) -> the browser prompt guards again');
  // G5 stay: button · Escape · backdrop; Tab stays inside
  s = boot({ ...SAVED }); s.click('focused');
  const L = s.clickLink('/ai-friend.html').target;
  s.els.leaveStay.fire('click');
  ok(!s.leave().open && s.nav() === '' && s.ls.writes.length === 0 && s.wrap.getAttribute('inert') === null && s.active() === L, 'G5: «머무르기» closes, stays, focus back on the link');
  ok(s.btn().text === '확인' && s.bu().prevented, 'G5: …the pick is kept, still unapplied (guard still on)');
  s.clickLink('/ai-friend.html'); s.docKey({ key: 'Escape', target: s.els.leaveGo });
  ok(!s.leave().open && s.nav() === '', 'G5: Escape = stay');
  s.clickLink('/ai-friend.html'); s.docKey({ key: 'Escape', target: null });
  ok(!s.leave().open, 'G5: Escape works after tapping the text (focus fell to <body>)');
  s.docKey({ key: 'Escape', target: null });
  ok(!s.leave().open && s.nav() === '', 'G5: Escape with the dialog closed does nothing');
  s.els.setOk.focus(); const kc = s.docKey({ key: 'Tab', target: s.els.setOk });
  ok(!kc.defaultPrevented && s.active() === s.els.setOk, 'G5: with the dialog closed, Tab is the page\'s own (not pulled into the hidden dialog)');
  s.clickLink('/ai-friend.html'); s.els.leaveAsk.fire('click');
  ok(!s.leave().open && s.nav() === '', 'G5: tapping the dark backdrop = stay');
  s.clickLink('/ai-friend.html'); s.els.leaveAsk.fire('click', { target: s.els.leaveTitle });
  ok(s.leave().open, 'G5: tapping inside the box does not close it');
  s.els.leaveStay.focus(); let k = s.docKey({ key: 'Tab', target: s.els.leaveStay });
  ok(s.active() === s.els.leaveGo && k.defaultPrevented, 'G5: Tab on the last choice wraps to the first');
  k = s.docKey({ key: 'Tab', shiftKey: true, target: s.els.leaveGo });
  ok(s.active() === s.els.leaveStay && k.defaultPrevented, 'G5: Shift+Tab on the first choice wraps to the last');
  s.els.leaveGo.focus(); k = s.docKey({ key: 'Tab', target: s.els.leaveGo });
  ok(!k.defaultPrevented && s.active() === s.els.leaveGo, 'G5: Tab in the middle is left to the browser');
  s.els.leaveTitle.focus(); k = s.docKey({ key: 'Tab', target: null });
  ok(s.active() === s.els.leaveGo && k.defaultPrevented, 'G5: Tab with focus outside the buttons comes back to the first');
  // G6 after 확인 -> not asked
  s = boot({ ...SAVED }); s.click('focused'); s.confirm();
  e = s.clickLink('/ai-friend.html');
  ok(!e.defaultPrevented && !s.leave().open && s.bu().listeners === 0, 'G6: after «확인» -> not asked, no guard');
  // G7 only one of the two picked (확인 locked) -> says what is missing; «고르러 가기» stays and points at it
  s = boot({}); s.level(4);
  e = s.clickLink('/ai-friend.html');
  ok(e.defaultPrevented && s.leave().open && /교정 정도를 골라야/.test(s.leave().body) && s.leave().go === '고르러 가기' && s.leave().stayHidden && s.leave().pick === '고른 설정: 수준 4단계', 'G7: level picked, corrections not -> explains, «고르러 가기» → ' + JSON.stringify(s.leave()));
  s.els.leaveGo.fire('click');
  ok(!s.leave().open && s.nav() === '' && s.ls.writes.length === 0 && s.active() === s.corr[0], 'G7: «고르러 가기» stays and focuses the corrections');
  s = boot({}); s.click('balanced'); s.clickLink('/');
  ok(/수준을 골라야/.test(s.leave().body), 'G7: corrections picked, level not -> asks for the level');
  s.els.leaveGo.fire('click');
  ok(s.active() === s.els.setLevel && s.nav() === '', 'G7: «고르러 가기» focuses the level');
  s.clickLink('/'); s.els.leaveSkip.fire('click');
  ok(s.nav() === 'http://localhost/' && s.ls.writes.length === 0, 'G7: …and can still leave without applying');
  // G8 not intercepted: in-page (#), new tab, already-handled click, target, non-link
  s = boot({ ...SAVED }); s.click('focused');
  ok(!s.clickLink('#situations').defaultPrevented && !s.leave().open, 'G8: in-page link (#situations) is not asked');
  ok(!s.clickLink('/ai-friend.html', {}, { ctrlKey: true }).defaultPrevented && !s.clickLink('/ai-friend.html', {}, { metaKey: true }).defaultPrevented && !s.leave().open, 'G8: ctrl/cmd-click (new tab) is not asked');
  ok(!s.clickLink('/ai-friend.html', {}, { shiftKey: true }).defaultPrevented && !s.clickLink('/ai-friend.html', {}, { altKey: true }).defaultPrevented && !s.leave().open, 'G8: shift/alt-click (new window / download) is not asked');
  s.clickLink('/ai-friend.html', {}, { defaultPrevented: true });
  ok(!s.leave().open, 'G8: a click another handler already took is not asked');
  ok(!s.clickLink('/x.html', { target: '_blank' }).defaultPrevented && !s.leave().open, 'G8: target=_blank is not asked');
  ok(!s.docClick({ target: s.els.setOk }).defaultPrevented && !s.leave().open, 'G8: a click not on a link is ignored');
  ok(s.clickLink('/ai-friend.html').defaultPrevented && s.leave().open, 'G8: (pair) the same plain link is asked');
  // G9 English screen
  s = boot({ ...SAVED, mangoi_lang: 'en' }); s.level(2); s.clickLink('/');
  ok(s.leave().title === 'Your settings are not applied yet' && s.leave().go === 'Apply and go' && s.leave().skip === 'Go without applying' && s.leave().stay === 'Stay here' && s.leave().pick === 'Your picks: Level 2 · Corrections: Balanced', 'G9: dialog in English → ' + JSON.stringify(s.leave()));
  ok(!/[가-힣]/.test([s.leave().title, s.leave().body, s.leave().pick, s.leave().go, s.leave().skip, s.leave().stay].join(' ')) && /confirm/i.test(s.leave().body), 'G9: no Korean left anywhere in the English dialog (title · body · picks · buttons)');
  for (const [id, ko, en] of [['free_talk', '자유', 'Free'], ['balanced', '균형', 'Balanced'], ['focused', '집중', 'Focused']]) {
    for (const lg of ['ko', 'en']) {
      const t = boot({ ...SAVED, mangoi_lang: lg }); t.level(1); t.click(id); t.clickLink('/');
      ok(t.leave().pick === (lg === 'en' ? 'Your picks: Level 1 · Corrections: ' + en : '고른 설정: 수준 1단계 · 교정 ' + ko), 'G9: picks line names ' + id + ' in ' + lg + ' → ' + t.leave().pick);
    }
  }
  s.els.leaveStay.fire('click'); s.lang[0].fire('click'); s.clickLink('/');
  ok(s.leave().title === '설정을 아직 적용하지 않았어요' && s.leave().stay === '머무르기', 'G9: switching to 한국어 -> the next ask is in Korean');
  // G10 cannot save: asked once, failure stays visible, next tap goes without asking
  s = boot({ ...SAVED }, { block: true }); s.click('focused');
  s.clickLink('/ai-friend.html'); s.els.leaveGo.fire('click');
  ok(!s.leave().open && s.nav() === '' && s.btn().state === 'fail' && s.active() === s.els.setOk, 'G10: blocked storage -> stays, «⚠️» shown and focused');
  e = s.clickLink('/ai-friend.html');
  ok(!e.defaultPrevented && !s.leave().open && s.bu().listeners === 0, 'G10: …next tap leaves without asking again');
  s = boot({}, { unavailable: true }); s.level(3); s.click('free_talk');
  ok(!s.clickLink('/').defaultPrevented && s.bu().listeners === 0, 'G10: no storage at all -> never asked (nothing could be saved)');
  // G11 back-forward cache: the restored page re-reads settings (another screen may have changed them), nothing stale is asked
  s = boot({ ...SAVED }); s.click('focused'); s.clickLink('/'); s.els.leaveSkip.fire('click');
  s.ls.m.set('mangoi_warmup_level', '7'); s.ls.m.set('mangoi_aifriend_level', 'S7');
  s.pageshow(false);
  ok(s.corr[2].getAttribute('aria-pressed') === 'true', 'G11: a normal pageshow (not restored) changes nothing');
  s.pageshow(true);
  ok(!s.leave().open && s.els.setLevel.innerHTML.includes('value="7" selected') && s.corr[1].getAttribute('aria-pressed') === 'true', 'G11: restored from back-forward cache -> shows the saved values');
  ok(!s.clickLink('/').defaultPrevented && s.bu().listeners === 0, 'G11: …nothing stale is asked');
  s.click('focused');
  ok(s.bu().prevented && s.clickLink('/').defaultPrevented, 'G11: …and asking works again (leaving flag reset)');
  s = boot({ ...SAVED }); s.click('focused'); s.clickLink('/');
  s.ls.m.set('mangoi_lang', 'en');
  s.pageshow(true);
  ok(!s.leave().open && s.wrap.getAttribute('inert') === null, 'G11: restored while the dialog was open -> the dialog is closed, page usable');
  ok(s.document.documentElement.lang === 'en', 'G11: …and the screen language is re-read (another screen switched it)');
  // G12 two tabs (함정 대조 실측): a tab that changed nothing is not asked; untouched fields follow storage
  s = boot({ ...SAVED });
  s.ls.m.set('mangoi_warmup_level', '7'); s.ls.m.set('mangoi_aifriend_level', 'S7'); s.ls.m.set('mangoi_warmup_correction', 'focused'); s.ls.m.set('mangoi_aifriend_correction', 'focused');
  e = s.clickLink('/ai-friend.html');
  ok(!e.defaultPrevented && !s.leave().open && s.bu().listeners === 0, 'G12: another tab confirmed 7/집중, this tab touched nothing -> not asked (even without a storage event)');
  s.storageEvt();
  ok(s.els.setLevel.innerHTML.includes('value="7" selected') && s.corr[2].getAttribute('aria-pressed') === 'true', 'G12: storage event -> this tab now shows the other tab\'s values');
  s = boot({ ...SAVED });
  s.level(3);
  s.ls.m.set('mangoi_warmup_correction', 'focused'); s.ls.m.set('mangoi_aifriend_correction', 'focused');   // other tab, no event
  s.clickLink('/');
  ok(s.leave().pick === '고른 설정: 수준 3단계 · 교정 집중', 'G12: the dialog shows the untouched field as it is now saved → ' + s.leave().pick);
  s.els.leaveGo.fire('click');
  ok(s.ls.getItem('mangoi_warmup_level') === '3' && s.ls.getItem('mangoi_aifriend_correction') === 'focused' && s.ls.getItem('mangoi_warmup_correction') === 'focused', 'G12: «적용하고 이동» writes this tab\'s level and keeps the other tab\'s corrections (no overwrite with stale values)');
  s = boot({ ...SAVED }); s.click('focused'); s.confirm();
  s.ls.m.set('mangoi_warmup_level', '2'); s.ls.m.set('mangoi_aifriend_level', 'S2'); s.storageEvt();
  ok(s.btn().text === '확인' && s.btn().state === '', 'G12: after another tab changed settings, «✅ 적용됐어요» is withdrawn');
  s.ls.m.set('mangoi_warmup_correction', 'free_talk'); s.ls.m.set('mangoi_aifriend_correction', 'free_talk');
  ok(!s.clickLink('/').defaultPrevented && !s.leave().open, 'G12: after «확인» this tab\'s picks are no longer «touched» — another tab changing them is not asked about');
  s = boot({ ...SAVED }); s.level(3);
  s.ls.m.set('mangoi_warmup_correction', 'free_talk'); s.ls.m.set('mangoi_aifriend_correction', 'free_talk'); s.confirm();
  ok(s.ls.getItem('mangoi_aifriend_correction') === 'free_talk' && s.ls.getItem('mangoi_aifriend_level') === 'S3', 'G12: plain «확인» also keeps the other tab\'s untouched corrections');
  console.log('PASS: leave without 확인 (6차) — ' + (n - n0) + ' checks, same booted page');

  // G13) 2026-11-04 7차(사장님 «자유·균형·집중을 바꾸고 버튼 누르면 교재로 연습 안에서도 똑같이 자동으로») —
  //      «연습 시작» 링크(data-start)는 묻지 않고 «확인» 과 같은 저장을 한 뒤 그대로 간다.
  //      짝: 시작 링크 «자동 저장» 옆에 홈 링크 «묻기»(G3) · 안 바꿈 «안 씀» · 확인 잠김 «묻기» · 저장 막힘 «머묾».
  const n1 = n;
  const tagOf = id => (markup.match(new RegExp('<a\\b[^>]*id="' + id + '"[^>]*>')) || [''])[0];
  ok(/\sdata-start[\s>]/.test(tagOf('textbook-mode')) && /\sdata-start[\s>]/.test(tagOf('friend-mode')), 'G13: the textbook and AI friend cards are start links (data-start)');
  ok(!/data-start/.test(tagOf('situation-mode')) && !/data-start/.test((markup.match(/<a class="home"[^>]*>/) || [''])[0]), 'G13: (pair) the situations toggle and the home link are not start links');
  ok(/<a class="sit" data-sit="' \+ esc\(s\.id\) \+ '" data-start href=/.test(fnSrc('renderSituations')), 'G13: each situation link is drawn as a start link');
  const START = { 'data-start': '' };
  for (const [href, label] of [['/warmup.html', 'textbook'], ['/ai-friend.html', 'AI friend'], ['/warmup.html?setup=0&lang=en&sit=cafe', 'situation']]) {
    for (const id of CORR) {
      if (id === 'balanced') continue;   // SAVED is already balanced — picking it is «unchanged»
      s = boot({ ...SAVED }); s.click(id);
      e = s.clickLink(href, START);
      ok(!e.defaultPrevented && !s.leave().open, 'G13: ' + label + ' start link with ' + id + ' picked -> not held, no dialog');
      ok(s.ls.getItem('mangoi_warmup_correction') === id && s.ls.getItem('mangoi_aifriend_correction') === id, 'G13: …' + id + ' is saved for both screens before going (the practice opens with it)');
      ok(s.ls.getItem('mangoi_warmup_level') === '5' && s.ls.getItem('mangoi_aifriend_level') === 'S5', 'G13: …the untouched level stays as saved');
      ok(!s.bu().prevented && s.btn().state === 'saved', 'G13: …no browser prompt while leaving');
    }
  }
  s = boot({ ...SAVED }); s.level(3); s.click('free_talk');
  e = s.clickLink('/warmup.html', START);
  ok(!e.defaultPrevented && s.ls.getItem('mangoi_warmup_level') === '3' && s.ls.getItem('mangoi_aifriend_level') === 'S3' && s.ls.getItem('mangoi_warmup_correction') === 'free_talk', 'G13: level + corrections both changed -> both saved on the start link');
  s = boot({ ...SAVED });
  e = s.clickLink('/warmup.html', START);
  ok(!e.defaultPrevented && s.ls.writes.length === 0, 'G13: nothing changed -> the start link writes nothing (no «picked by the student» stamp)');
  s = boot({ ...SAVED }); s.click('focused'); s.click('balanced');
  e = s.clickLink('/warmup.html', START);
  ok(!e.defaultPrevented && s.ls.writes.length === 0, 'G13: changed back to the saved value -> writes nothing');
  s = boot({}); s.click('balanced');
  e = s.clickLink('/warmup.html', START);
  ok(e.defaultPrevented && s.leave().open && /수준을 골라야/.test(s.leave().body) && s.ls.writes.length === 0, 'G13: 확인 locked (no level yet) -> the start link asks what to pick, writes nothing');
  s = boot({ ...SAVED }, { block: true }); s.click('focused');
  e = s.clickLink('/warmup.html', START);
  ok(e.defaultPrevented && !s.leave().open && s.btn().state === 'fail' && s.active() === s.els.setOk, 'G13: cannot save -> stays, «⚠️» shown and focused (not a silent start with the old setting)');
  e = s.clickLink('/warmup.html', START);
  ok(!e.defaultPrevented && !s.leave().open, 'G13: …next tap goes without asking again');
  s = boot({ ...SAVED }); s.level(3);
  s.ls.m.set('mangoi_warmup_correction', 'focused'); s.ls.m.set('mangoi_aifriend_correction', 'focused');   // other tab, no event
  s.clickLink('/ai-friend.html', START);
  ok(s.ls.getItem('mangoi_warmup_level') === '3' && s.ls.getItem('mangoi_warmup_correction') === 'focused' && s.ls.getItem('mangoi_aifriend_correction') === 'focused', 'G13: two tabs — the start link saves this tab\'s level and keeps the other tab\'s corrections');
  s = boot({ ...SAVED }); s.click('focused');
  ok(!s.clickLink('/warmup.html', { ...START, target: '_blank' }).defaultPrevented && s.ls.writes.length === 0, 'G13: start link in a new tab (target) is left to the browser, nothing written');
  console.log('PASS: start links apply the picks (7차) — ' + (n - n1) + ' checks, same booted page');

  // G14) 2026-11-04 사장님 «반대 방향도 맞춰줘» — 연습 화면(웜업·AI 친구)에서 사람이 교정 정도를 고르면 정본(chooseCorr)으로
  //      두 화면 키를 함께 써서, 입구로 돌아와도 «화면마다 다름» 이 아니라 그 값이 보인다.
  //      짝: 정본이 없으면 예전처럼 제 키만(안 던짐) · 모르는 값은 안 씀 · 화면을 열기만 하면 안 씀 · 수준 키는 안 건드림.
  const n2 = n;
  const wu = read('warmup.html'), af = read('ai-friend.html'), wflow = read('js/warmup-flow.js');
  const noHtmlComments = s => s.replace(/<!--[\s\S]*?-->/g, '');
  const hubV = (hub.match(/<script src="\/js\/ai-speaking-settings\.js\?v=(\d+)"/) || [])[1];
  ok(!!hubV, 'G14 premise: the entry loads the settings module with a ?v=');
  for (const [name, page] of [['warmup', wu], ['ai-friend', af]]) {
    const tags = noHtmlComments(page).match(/<script\b[^>]*\bsrc="\/js\/ai-speaking-settings\.js[^"]*"[^>]*>/g) || [];
    ok(tags.length === 1, 'G14: ' + name + ' loads the settings module exactly once, outside comments → ' + tags.length);
    ok(tags.length === 1 && tags[0].includes('ai-speaking-settings.js?v=' + hubV + '"') && !/\btype=/.test(tags[0]), 'G14: ' + name + ' loads it as a normal script with the entry\'s ?v=' + hubV);
  }
  // ── 웜업: setCorrMode 를 오려 내 실제로 돌린다 ──
  const cut = (src, re) => (src.match(re) || [''])[0];
  const wuKey = cut(wu, /var WU_CMODE_KEY = '[^']+';/), wuCat = cut(wu, /var CMODE_CATALOG = \[[\s\S]*?\n\];/), wuSet = cut(wu, /function setCorrMode\(id\)\{[\s\S]*?\n\}/);
  ok(!!(wuKey && wuCat && wuSet), 'G14 premise: cut WU_CMODE_KEY · CMODE_CATALOG · setCorrMode out of warmup.html');
  const wuPicker = (ls, withSet) => {
    const c = vm.createContext({ window: withSet ? { AiSpeakSettings: SET } : {}, localStorage: ls });
    vm.runInContext(wuKey + '\nvar _wuCorrMode = "";\n' + wuCat + '\n' + wuSet, c, { timeout: 500 });
    return id => { try { return vm.runInContext('setCorrMode(' + JSON.stringify(id) + ')', c, { timeout: 500 }); } catch (e) { return 'threw: ' + e.message; } };
  };
  const MIXED = { mangoi_warmup_level: '5', mangoi_aifriend_level: 'S5', mangoi_warmup_correction: 'free_talk', mangoi_aifriend_correction: 'focused' };
  let ls2 = mkLS(MIXED);
  ok(SET.read(ls2).corr === 'mixed', 'G14 premise: the two screens start out different («화면마다 다름»)');
  ok(wuPicker(ls2, true)('balanced') === true, 'G14: warmup pick returns true');
  ok(ls2.getItem('mangoi_warmup_correction') === 'balanced' && ls2.getItem('mangoi_aifriend_correction') === 'balanced', 'G14: warmup pick writes BOTH screen keys');
  ok(SET.read(ls2).corr === 'balanced', 'G14: …so the entry reads one value, not «mixed»');
  ok(ls2.writes.every(k => /_correction$/.test(k)), 'G14: …and touches no level key → ' + ls2.writes.join(','));
  for (const id of CORR) { const l = mkLS(MIXED); wuPicker(l, true)(id); ok(SET.read(l).corr === id, 'G14: warmup pick ' + id + ' → entry reads ' + id); }
  ls2 = mkLS(MIXED);
  ok(wuPicker(ls2, true)('strict') === false && ls2.writes.length === 0, 'G14: an unknown value writes nothing');
  ls2 = mkLS(MIXED);
  ok(wuPicker(ls2, false)('balanced') === true && ls2.getItem('mangoi_warmup_correction') === 'balanced' && ls2.getItem('mangoi_aifriend_correction') === 'focused', 'G14: (pair) settings module missing -> warmup key only, as before, no throw');
  // 사람이 고르는 자리에서만 부른다 — 열거나 그리기만 할 때 쓰면 «학생이 고른 것» 으로 굳는다
  const wuCalls = wu.split('\n').filter(l => /setCorrMode\(/.test(l) && !/function setCorrMode\(/.test(l) && !/^\s*(\/\/|\/?\*)/.test(l));
  ok(wuCalls.length === 1 && /if\(t\.getAttribute\('data-cmode'\)\) \{ setCorrMode\(/.test(wuCalls[0]), 'G14: in warmup.html setCorrMode is called only by the setup card click → ' + wuCalls.length);
  const flowCalls = wflow.split('\n').filter(l => /setCorrMode\(/.test(l));
  ok(flowCalls.length >= 1 && flowCalls.every(l => /function\s*\([^)]*\)\s*\{[^}]*setCorrMode\(/.test(l)), 'G14: warmup-flow.js calls setCorrMode only inside button / select handlers → ' + flowCalls.length);
  // ── AI 친구: 교정 버튼 배선을 오려 내 실제로 돌린다 ──
  const afBlock = cut(af, /const AIF_CORR_KEY = [\s\S]*?\n    \}\);\n/);
  ok(!!afBlock && /\.opt\[data-cmode\]/.test(afBlock), 'G14 premise: cut the AI friend correction block out of ai-friend.html');
  const afPage = (ls, withSet) => {
    const btns = CORR.map(id => { const cls = new Set(); return { dataset: { cmode: id }, onclick: null, classList: { toggle: (k, on) => (on ? cls.add(k) : cls.delete(k)), has: k => cls.has(k) } }; });
    const c = vm.createContext({ window: withSet ? { AiSpeakSettings: SET } : {}, localStorage: ls,
      document: { querySelectorAll: sel => (sel === '.opt[data-cmode]' ? btns : []) } });
    vm.runInContext(afBlock, c, { timeout: 500 });
    return { press: id => { try { btns[CORR.indexOf(id)].onclick(); return true; } catch (e) { return 'threw: ' + e.message; } }, active: () => (btns.find(b => b.classList.has('active')) || {}).dataset?.cmode || '' };
  };
  ls2 = mkLS(MIXED);
  let fp = afPage(ls2, true);
  ok(ls2.writes.length === 0 && fp.active() === 'focused', 'G14: opening AI friend writes nothing and shows its saved value');
  // ⚠️ 두 키 «어느 쪽과도 다른» 값으로 누른다 — 웜업 키와 같은 값이면 안 써도 통과한다(2026-11-04 변이시험에서 밟음)
  ok(fp.press('balanced') === true && ls2.getItem('mangoi_aifriend_correction') === 'balanced' && ls2.getItem('mangoi_warmup_correction') === 'balanced', 'G14: AI friend pick writes BOTH screen keys');
  ok(ls2.writes.includes('mangoi_warmup_correction') && ls2.writes.every(k => /_correction$/.test(k)), 'G14: …it really wrote the warmup key, and no level key → ' + ls2.writes.join(','));
  ok(SET.read(ls2).corr === 'balanced' && fp.active() === 'balanced', 'G14: …the entry reads balanced and the button shows it');
  ls2 = mkLS(MIXED); fp = afPage(ls2, false);
  ok(fp.press('balanced') === true && ls2.getItem('mangoi_aifriend_correction') === 'balanced' && ls2.getItem('mangoi_warmup_correction') === 'free_talk', 'G14: (pair) settings module missing -> AI friend key only, as before');
  // ── 입구: 연습 화면에서 고른 뒤 돌아오면(새로 열기 · 뒤로가기 보관 화면) 그 값이 보인다 ──
  const pressed = s => CORR.filter((id, i) => s.corr[i].getAttribute('aria-pressed') === 'true');
  s = boot({ ...SAVED });   // 입구에서 균형으로 들어감
  ok(pressed(s).join() === 'balanced', 'G14 premise: the entry starts on balanced');
  wuPicker(s.ls, true)('focused');   // 웜업 안에서 집중교정으로 바꿈(같은 기기 저장소)
  s.pageshow(true);                   // 뒤로가기로 보관된 입구가 돌아옴
  ok(pressed(s).join() === 'focused' && !s.leave().open, 'G14: back to the cached entry -> shows focused (changed inside warmup), no dialog');
  ok(s.btn().state !== 'fail' && !s.bu().prevented, 'G14: …nothing counts as «not applied» (no leave prompt)');
  const fresh = boot(Object.fromEntries(s.ls.m));
  ok(pressed(fresh).join() === 'focused', 'G14: opening the entry again also shows focused');
  afPage(fresh.ls, true).press('free_talk'); fresh.storageEvt();
  ok(pressed(fresh).join() === 'free_talk', 'G14: AI friend pick in another tab -> the open entry follows (storage event)');
  console.log('PASS: practice screens sync back to the entry (8차) — ' + (n - n2) + ' checks');
}
