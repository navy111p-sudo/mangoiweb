// 2026-11-04 AI 말하기 «사용 안내» — 버튼 · 창 · 안내서(한 장/자세한 판) · PDF·Word 감시
//
// 무엇을 지키나
//   A. 안내서 두 장과 그 안의 그림·CSS·JS·PDF·Word 가 «실제로 있다» (없으면 화면이 조용히 반쪽)
//      + 한 장 판 PDF 가 정말 1쪽이다(KO/EN) · Word 는 진짜 docx(zip)다
//   B. 교정 정도 설명이 AI 말하기 화면 버튼(data-hint-ko/en)과 «같은 글자» 다 — 화면이 바뀌면 안내서도
//   C. AI 말하기 화면의 버튼 배선을 «오려 내 실제로 돌려» 본다
//      (화면 언어를 넘기는가 · 열 때만 iframe 을 부르는가 · 창을 못 열면 같은 탭으로 가는가 · 닫히는가)
//   D. 안내서 공용 스크립트를 가짜 DOM 에서 «실제로 돌려» 본다
//      (?lang → 안내서 값 → 사이트 언어 → 한국어 · 다운로드 주소 · 사이트 공용 키 mangoi_lang 에 «안 쓴다»)
//   E. 규칙: 외부 주소 없음 · data-ko/data-en 없음(공용 i18n 엔진이 본문을 갈아 끼움 — CLAUDE.md 2장)
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';

const pub = new URL('../cloudflare-deploy/public/', import.meta.url);
const read = (p) => readFileSync(new URL(p, pub), 'utf8');
const exists = (p) => existsSync(new URL(p.replace(/^\//, '').split('?')[0].split('#')[0], pub));

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + msg); } };

const hub = read('ai-speaking.html');
const one = read('ai-speaking-guide.html');
const full = read('ai-speaking-guide-full.html');
const guideJs = read('js/ai-speaking-guide.js');
const css = ['css/ai-speaking-guide.css', 'css/ai-speaking-guide-onepage.css', 'css/ai-speaking-guide-full.css'].map(read);

// ── A. 파일이 실제로 있다 ────────────────────────────────────────────────
for (const [name, html] of [['한 장', one], ['자세한 판', full]]) {
  const refs = [...html.matchAll(/(?:src|href)="(\/[^"]+)"/g)].map((m) => m[1]);
  ok(refs.length >= 8, name + ': 사이트 경로 참조를 읽었다(전제)');
  for (const r of refs) ok(exists(r), name + ': ' + r + ' 가 있다');
}
const BASES = ['AI-Speaking-OnePage', 'AI-Speaking-Guide'];
for (const base of BASES) for (const L of ['KO', 'EN']) {
  for (const ext of ['pdf', 'docx']) ok(exists(`guide/ai-speaking/${base}_${L}.${ext}`), `${base}_${L}.${ext} 가 있다`);
  const docx = readFileSync(new URL(`guide/ai-speaking/${base}_${L}.docx`, pub));
  ok(docx[0] === 0x50 && docx[1] === 0x4b, `${base}_${L}.docx 는 진짜 Word(zip) 파일`);
}
const pdfPages = (f) => (readFileSync(new URL(f, pub), 'latin1').match(/\/Type\s*\/Page(?![s\w])/g) || []).length;
for (const L of ['KO', 'EN']) {
  ok(pdfPages(`guide/ai-speaking/AI-Speaking-OnePage_${L}.pdf`) === 1, `한 장 판 PDF(${L})는 정확히 1쪽`);
  ok(pdfPages(`guide/ai-speaking/AI-Speaking-Guide_${L}.pdf`) >= 3, `자세한 판 PDF(${L})는 여러 쪽(쪽 세기가 헛돌지 않는다)`);
}

// ── B. 교정 정도 설명 = AI 말하기 화면 버튼 글자 ───────────────────────────
const hints = {};
for (const m of hub.matchAll(/data-corr="([a-z_]+)"[^>]*data-hint-ko="([^"]+)"[^>]*data-hint-en="([^"]+)"/g)) hints[m[1]] = { ko: m[2], en: m[3] };
ok(Object.keys(hints).length === 3, 'AI 말하기 화면에서 교정 정도 버튼 3개의 설명을 읽었다(전제)');
const blockOf = (html, key) => { // 그 칸부터 다음 칸 직전까지(다른 단계 글자가 섞이지 않게)
  const i = html.indexOf(`data-corr-guide="${key}"`);
  if (i < 0) return '';
  const j = html.indexOf('data-corr-guide=', i + 10);
  return html.slice(i, j > 0 && j - i < 800 ? j : i + 800);
};for (const [name, html] of [['한 장', one], ['자세한 판', full]]) {
  for (const [key, h] of Object.entries(hints)) {
    const b = blockOf(html, key);
    ok(b.length > 0, `${name}: ${key} 설명 칸이 있다`);
    ok(b.includes('>' + h.ko + '<'), `${name}: ${key} 한국어 설명이 화면 버튼과 같다 («${h.ko}»)`);
    ok(b.includes('>' + h.en + '<'), `${name}: ${key} 영어 설명이 화면 버튼과 같다 («${h.en}»)`);
  }
}

// ── C. AI 말하기 화면 — 버튼 배선을 실제로 돌린다 ───────────────────────────
const tagOf = (id) => (hub.match(new RegExp('<[a-z]+\\b[^>]*\\bid="' + id + '"[^>]*>')) || [''])[0];
ok(/^<button\b/.test(tagOf('guideBtn')), '사용 안내 버튼이 있다(<button>)');
ok(!/data-ko|data-en/.test(tagOf('guideBtn')), '버튼 자체에는 data-ko/en 이 없다(있으면 i18n 루프가 아이콘을 지움)');
ok(/<span data-ko="사용 안내" data-en="How to use">/.test(hub), '버튼 글자는 안쪽 span 에 KO/EN');
ok(/^<dialog\b/.test(tagOf('guideDlg')) && /^<button\b/.test(tagOf('guideClose')), '창(dialog)과 닫기 버튼이 있다');
{ // 창 안 글자에는 data-ko/en 이 없다(i18n 루프가 갈아끼움) · 나가기 확인 창(#leaveAsk)보다 앞(그 창 검사가 거기서 페이지 끝까지를 읽음)
  const gi = hub.indexOf('<dialog id="guideDlg"'), ge = hub.indexOf('</dialog>', gi);
  ok(gi > 0 && !/data-ko|data-en/.test(hub.slice(gi, ge)), '사용 안내 창 안에는 data-ko/en 이 없다');
  const li = hub.indexOf('id="leaveAsk"');
  ok(li < 0 || gi < li, '사용 안내 창은 나가기 확인 창보다 앞에 있다');
  ok((hub.match(/<\/body>/g) || []).length === 1, '</body> 글자는 한 번뿐(주석에 쓰면 그 창 검사가 거기서 잘림)');
}
ok(/^<iframe\b/.test(tagOf('guideFrame')) && !/\bsrc=/.test(tagOf('guideFrame')), 'iframe 은 처음에 src 가 없다(열 때만 불러옴 — 첫 화면 비용 0)');
const lead = hub.slice(hub.indexOf('<p class="lead">'), hub.indexOf('</p>', hub.indexOf('<p class="lead">')));
ok(lead.includes('id="guideBtn"'), '버튼은 «오늘은 …» 줄 안에 있다');
ok((hub.match(/<a class="mode/g) || []).length === 3, '행성 카드는 여전히 3장(브라우저 검사가 .mode 를 셈)');

const s0 = hub.indexOf('  var GUIDE_URL');
// ⚠️ 같은 글자가 언어 버튼 처리기 안에 먼저 있다 — 배선 코드 «뒤» 에서, 줄 맨 앞으로 찾는다
const s1 = hub.indexOf('\n  applyUi(); renderSituations();', s0) + 1;
ok(s0 > 0 && s1 > s0, '배선 코드를 오려 냈다(전제)');
const callLine = hub.slice(s1, hub.indexOf('\n', s1));
{ // 그 줄을 실제로 실행한다 — 모든 이름을 «부르면 기록만 하는 함수» 로 바꿔 끼운 with 범위에서.
  // 글자 일치로 보면 `// wireGuide();`·`false && wireGuide();` 도 통과한다(함정 대조가 실제로 뚫음).
  const calls = [];
  const scope = new Proxy({}, { has: () => true, get: (_, k) => (k === Symbol.unscopables ? undefined : () => { calls.push(k); }) });
  try { new Function('scope', 'with (scope) {\n' + callLine + '\n}')(scope); } catch (e) { calls.push('THROW:' + e.message); }
  ok(calls.includes('wireGuide'), '화면 시작 줄을 실행하면 wireGuide() 가 실제로 불린다 → ' + calls.join(','));
  ok(calls.includes('wire'), '같은 줄에서 기존 wire() 도 그대로 불린다(전제)');
}
const make = new Function('ui', 'T', 'document', 'location', 'window', hub.slice(s0, s1) + '\nreturn { guideHref, openGuide, wireGuide, GUIDE_URL };');
const T = (ko, en) => ko;
ok(exists(make('ko', T, {}, {}, {}).GUIDE_URL), '안내서 주소의 파일이 실제로 있다');
for (const [ui, want] of [['ko', 'ko'], ['en', 'en'], ['zz', 'ko'], [undefined, 'ko']]) {
  ok(make(ui, T, {}, {}, {}).guideHref() === '/ai-speaking-guide.html?lang=' + want, `화면 언어 ${ui} → 안내서 ?lang=${want}`);
}
function fakePage({ showModal = true, throws = false } = {}) {
  const ev = {};
  const el = (id) => ({ id, attrs: {}, listeners: {},
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }, focus() { ev.focused = id; } });
  const dlg = el('guideDlg'); dlg.open = false; dlg.shown = 0;
  if (showModal) dlg.showModal = function () { if (throws) throw new Error('x'); this.open = true; this.shown++; };
  dlg.close = function () { this.open = false; (this.listeners.close || []).forEach((f) => f()); };
  const nodes = { guideDlg: dlg, guideFrame: el('guideFrame'), guideClose: el('guideClose'), guideBtn: el('guideBtn'), guideDlgTitle: el('guideDlgTitle') };
  const replaced = [];
  nodes.guideFrame.contentWindow = { location: { replace: (u) => replaced.push(u) } };
  const doc = { getElementById: (id) => nodes[id] || null };
  const loc = { href: '/ai-speaking.html', origin: 'https://mangoi.ai' };
  const win = { listeners: {}, addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); } };
  return { nodes, doc, loc, ev, win, replaced };
}
{ // 정상: 창을 열고 iframe 에 안내서를 넣는다 — 같은 탭 이동 없음
  const P = fakePage(); const G = make('en', (k, e) => e, P.doc, P.loc, P.win);
  G.openGuide();
  ok(P.nodes.guideDlg.open && P.nodes.guideDlg.shown === 1, '버튼을 누르면 창이 열린다');
  ok(P.nodes.guideFrame.getAttribute('src') === '/ai-speaking-guide.html?lang=en', 'iframe 에 화면 언어(en) 안내서를 넣는다');
  ok(P.loc.href === '/ai-speaking.html', '창이 열리면 같은 탭으로 이동하지 않는다');
  ok(P.nodes.guideClose.getAttribute('aria-label') === 'Close', '닫기 버튼 이름도 화면 언어로');
  ok(P.nodes.guideDlgTitle.textContent === 'AI Speaking guide', '창 제목도 화면 언어로(글자는 스크립트가 씀)');
  G.openGuide();
  ok(P.nodes.guideDlg.shown === 1, '이미 열린 창을 또 열지 않는다');
  ok(P.replaced.length === 0, '같은 언어로 다시 열면 안내서를 다시 불러오지 않는다');
}
{ // 다른 언어로 다시 열면 — src 를 다시 쓰지 않고 replace(방문 기록이 늘면 «뒤로» 가 한 번 헛돎)
  const P = fakePage();
  make('ko', T, P.doc, P.loc, P.win).openGuide(); P.nodes.guideDlg.close();
  make('en', (k, e) => e, P.doc, P.loc, P.win).openGuide();
  ok(P.replaced.length === 1 && P.replaced[0] === '/ai-speaking-guide.html?lang=en', '언어가 바뀌면 iframe 주소를 replace 로 바꾼다');
  ok(P.nodes.guideFrame.getAttribute('src') === '/ai-speaking-guide.html?lang=ko', '그때 src 는 다시 쓰지 않는다(기록 한 줄 더 안 생김)');
  ok(P.nodes.guideFrame.getAttribute('data-lang') === 'en', '지금 창 언어를 적어 둔다');
}
{ // 창을 못 여는 옛 브라우저 → 같은 탭
  const P = fakePage({ showModal: false }); make('ko', T, P.doc, P.loc, P.win).openGuide();
  ok(P.loc.href === '/ai-speaking-guide.html?lang=ko', 'dialog 를 못 쓰면 같은 탭에서 안내서로 간다');
  ok(P.nodes.guideFrame.getAttribute('src') === null, '그때 iframe 은 건드리지 않는다');
}
{ // showModal 이 던지면 → 같은 탭
  const P = fakePage({ throws: true }); make('ko', T, P.doc, P.loc, P.win).openGuide();
  ok(P.loc.href === '/ai-speaking-guide.html?lang=ko', 'showModal 이 실패해도 안내서는 열린다(같은 탭)');
}
{ // 배선: 버튼 → 열기, 닫기 → 닫기, 바깥 → 닫기, 안쪽 → 그대로, 닫으면 버튼으로 포커스
  const P = fakePage(); const G = make('ko', T, P.doc, P.loc, P.win); G.wireGuide();
  (P.nodes.guideBtn.listeners.click || []).forEach((f) => f());
  ok(P.nodes.guideDlg.open, 'wireGuide 가 버튼 click 에 열기를 단다');
  (P.nodes.guideDlg.listeners.click || []).forEach((f) => f({ target: P.nodes.guideFrame }));
  ok(P.nodes.guideDlg.open, '창 안을 누르면 닫히지 않는다');
  (P.nodes.guideDlg.listeners.click || []).forEach((f) => f({ target: P.nodes.guideDlg }));
  ok(!P.nodes.guideDlg.open, '창 바깥(어두운 곳)을 누르면 닫힌다');
  ok(P.ev.focused === 'guideBtn', '닫히면 포커스가 사용 안내 버튼으로 돌아온다');
  G.openGuide(); (P.nodes.guideClose.listeners.click || []).forEach((f) => f());
  ok(!P.nodes.guideDlg.open, '닫기(✕) 버튼이 창을 닫는다');
  // 창 안(iframe)에서 Esc → 안내서가 보낸 메시지로 닫힌다. 다른 곳에서 온 것은 무시(짝)
  const send = (data, origin, source) => (P.win.listeners.message || []).forEach((f) => f({ data, origin, source }));
  G.openGuide(); send('ai-speaking-guide:close', 'https://evil.example', P.nodes.guideFrame.contentWindow);
  ok(P.nodes.guideDlg.open, '다른 오리진의 «닫아» 메시지는 무시');
  send('ai-speaking-guide:close', 'https://mangoi.ai', {});
  ok(P.nodes.guideDlg.open, '그 iframe 이 아닌 곳에서 온 «닫아» 는 무시');
  send('ai-speaking-guide:close', 'https://mangoi.ai', P.nodes.guideFrame.contentWindow);
  ok(!P.nodes.guideDlg.open, '창 안 안내서가 보낸 «닫아»(Esc)로 창이 닫힌다');
}

// ── D. 안내서 공용 스크립트를 가짜 DOM 에서 돌린다 ───────────────────────────
function runGuide({ search = '', store = {}, inFrame = false, fileBase = 'AI-Speaking-OnePage' } = {}) {
  const mk = (attrs) => ({ attrs: { ...attrs }, hidden: false, listeners: {}, open: false,
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }, setAttribute(k, v) { this.attrs[k] = String(v); },
    addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); } });
  const root = mk({ 'data-file-base': fileBase, 'data-title-ko': '안내', 'data-title-en': 'Guide' });
  const els = [
    mk({ 'data-lang-btn': 'ko' }), mk({ 'data-lang-btn': 'en' }),
    mk({ 'data-download': 'pdf', href: 'x' }), mk({ 'data-download': 'docx', href: 'x' }),
    mk({ 'data-lang-link': '', href: '/ai-speaking-guide-full.html' }),
    mk({ 'data-standalone-only': '' }), mk({ 'data-action': 'print' }),
  ];
  const writes = [];
  const ls = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { writes.push(k); store[k] = String(v); } };
  const match = (el, sel) => { const m = sel.match(/^\[([a-z-]+)(?:="([^"]*)")?\]$/); return m ? (m[1] in el.attrs && (m[2] === undefined || el.attrs[m[1]] === m[2])) : false; };
  const docListeners = {};
  const document = { documentElement: root, title: '', querySelectorAll: (sel) => els.filter((e) => match(e, sel)),
    addEventListener(t, f) { (docListeners[t] = docListeners[t] || []).push(f); } };
  const posted = [], replaced = [];
  const win = { localStorage: ls, addEventListener() {}, print() {}, parent: { postMessage: (m, o) => posted.push([m, o]) } };
  win.self = win; win.top = inFrame ? {} : win;
  const ctx = { window: win, document, location: { search, origin: 'https://mangoi.ai', replace: (u) => replaced.push(u) }, URLSearchParams, console };
  vm.createContext(ctx); vm.runInContext(guideJs, ctx);
  return { root, els, writes, store, doc: document, docListeners, posted, replaced };
}
{
  ok(runGuide({ search: '?lang=en', store: { 'aiSpeakingGuide.lang': 'ko', mangoi_lang: 'ko' } }).root.getAttribute('data-lang') === 'en', '주소 ?lang= 이 가장 먼저');
  ok(runGuide({ store: { 'aiSpeakingGuide.lang': 'en', mangoi_lang: 'ko' } }).root.getAttribute('data-lang') === 'en', '그다음 안내서에서 고른 값');
  ok(runGuide({ store: { mangoi_lang: 'en' } }).root.getAttribute('data-lang') === 'en', '그다음 사이트 언어(mangoi_lang)');
  ok(runGuide({}).root.getAttribute('data-lang') === 'ko', '아무것도 없으면 한국어');
  ok(runGuide({ search: '?lang=zz', store: { mangoi_lang: 'en' } }).root.getAttribute('data-lang') === 'en', '모르는 ?lang 값은 무시');
  for (const base of BASES) for (const L of ['ko', 'en']) {
    const R = runGuide({ search: '?lang=' + L, fileBase: base });
    for (const ext of ['pdf', 'docx']) {
      const href = R.els.find((e) => e.attrs['data-download'] === ext).getAttribute('href');
      ok(href === `/guide/ai-speaking/${base}_${L.toUpperCase()}.${ext}` && exists(href), `${base} ${L} ${ext} 링크 → 실제 파일`);
    }
  }
  const R = runGuide({ search: '?lang=en', store: {} });
  ok(R.els.find((e) => 'data-lang-link' in e.attrs).getAttribute('href') === '/ai-speaking-guide-full.html?lang=en', '다른 안내서 링크에 지금 언어를 붙인다');
  const koBtn = R.els.find((e) => e.attrs['data-lang-btn'] === 'ko');
  (koBtn.listeners.click || []).forEach((f) => f());
  ok(R.root.getAttribute('data-lang') === 'ko', 'KO 버튼을 누르면 한국어로');
  ok(R.writes.includes('aiSpeakingGuide.lang'), '고른 언어는 안내서 자기 키에 남긴다');
  ok(!R.writes.includes('mangoi_lang'), '⛔ 사이트 공용 키 mangoi_lang 에는 쓰지 않는다');
  ok(R.els.find((e) => 'data-standalone-only' in e.attrs).hidden === false, '혼자 열면 «AI 말하기로» 링크가 보인다');
  ok(runGuide({ inFrame: true }).els.find((e) => 'data-standalone-only' in e.attrs).hidden === true, '창(iframe) 안에서는 그 링크를 숨긴다');

  // 창 안에서는: 언어를 저장하지 않는다(부모 storage 이벤트가 «✅ 적용됐어요» 를 거둠) · Esc 를 부모에 알린다 · 안쪽 링크는 replace
  const F = runGuide({ inFrame: true, search: '?lang=ko' });
  (F.els.find((e) => e.attrs['data-lang-btn'] === 'en').listeners.click || []).forEach((f) => f());
  ok(F.root.getAttribute('data-lang') === 'en' && F.writes.length === 0, '창 안에서 EN 을 눌러도 화면만 바뀌고 저장소에는 안 쓴다');
  (F.docListeners.keydown || []).forEach((f) => f({ key: 'a' }));
  ok(F.posted.length === 0, '다른 키는 부모에 안 알린다');
  (F.docListeners.keydown || []).forEach((f) => f({ key: 'Escape' }));
  ok(F.posted.length === 1 && F.posted[0][0] === 'ai-speaking-guide:close' && F.posted[0][1] === 'https://mangoi.ai', '창 안에서 Esc → 부모에 «닫아» (같은 오리진으로만)');
  const link = F.els.find((e) => 'data-lang-link' in e.attrs); let prevented = false;
  (link.listeners.click || []).forEach((f) => f({ preventDefault() { prevented = true; } }));
  ok(prevented && F.replaced[0] === '/ai-speaking-guide-full.html?lang=en', '창 안 «자세한 안내서» 링크는 replace 로(기록 안 늘림)');
  const S = runGuide({ search: '?lang=ko' });
  ok(!(S.docListeners.keydown || []).length && !(S.els.find((e) => 'data-lang-link' in e.attrs).listeners.click || []).length, '혼자 열었을 때는 Esc·링크를 가로채지 않는다');
}

// ── E. 규칙 ─────────────────────────────────────────────────────────────
for (const [name, text] of [['한 장', one], ['자세한 판', full], ['공용 JS', guideJs], ...css.map((c, i) => ['CSS ' + i, c])]) {
  ok(!/https?:\/\//.test(text.replace(/<!--[\s\S]*?-->/g, '')), name + ': 외부 주소를 쓰지 않는다');
}
for (const [name, html] of [['한 장', one], ['자세한 판', full]]) {
  ok(!/\sdata-(ko|en)=/.test(html), name + ': data-ko/data-en 을 쓰지 않는다');
  ok(/<html[^>]*data-file-base="AI-Speaking-(OnePage|Guide)"/.test(html), name + ': 다운로드 파일 이름표(data-file-base)');
  ok(html.includes('/js/ai-speaking-guide.js?v='), name + ': 공용 스크립트를 싣는다');
}
const cssLive = css[0].replace(/\/\*[\s\S]*?\*\//g, ''); // 주석으로 죽인 규칙은 «없음» (함정 대조가 실제로 뚫음)
for (const [name, html] of [['한 장', one], ['자세한 판', full]]) ok(html.includes('이름 전체') && html.includes('full name'), name + ': 안전 약속은 «이름 전체»(AI 친구가 이름을 부르는 기능과 맞춤)');
ok(/\[hidden\]\s*\{\s*display:\s*none\s*!important/.test(cssLive), '[hidden] 강제 숨김(.btn 이 기본 [hidden] 을 이기는 함정)');

console.log(`결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
