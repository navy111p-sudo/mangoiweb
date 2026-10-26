// ✍️ AI 영작 첨삭 v2 보완 감시 하니스 (2026-10-19)
//   — 단어 수 목표 · 초안 자동 저장 · 6하원칙 확인 · 고쳐서 다시 첨삭
//
//   왜 필요한가 —
//     넷 다 «함수도 값도 다 있고 틀리는 것은 무엇이 나오는가» 뿐인 종류라 문자열로는 못 본다
//     (CLAUDE.md 2장 「하니스가 전부 초록인데 화면이 죽어 있음」). 그래서 ai-write.html 에서
//     v2 블록과 submitText·resetForm 을 «오려 내 가짜 DOM·가짜 저장소·가짜 fetch 로 실제로 돌린다».
//
//   이 하니스가 못 박는 것 —
//     ① 단어 수는 «영어 단어만» 센다. 단계마다 목표가 다르고, 모자라면 «N단어 더», 채우면 초록.
//        글자 수는 1800자를 넘을 때만 붙고 2000자를 넘으면 빨강.
//     ② 🔴 처음 화면을 그릴 때(awRenderCount)는 저장하지 않는다 — 저장하면 되살리지 않은 «남의» 초안을
//        빈 칸으로 덮어 지운다(공용 PC). 글이 바뀔 때(updateCharCount)만 저장한다.
//        빈 칸이 되어도 «내» 초안만 지운다 · 되살리기는 같은 계정 + 하루 안 + 빈 칸일 때만.
//     ③ 6하원칙 확인은 메모와 글을 «낱말» 로만 비교한다 — 들어갔으면 ✅, 안 보이면 🔸,
//        한글 메모는 판정하지 않고 «스스로 확인» 이라고 말한다(지어내지 않는다). 메모가 없으면 상자를 안 그린다.
//     ④ 같은 글을 고쳐 다시 받으면 «2차 · 지난번 점수 → 이번 점수», 다른 글이면 다시 1차.
//        완전히 같은 글이면 보내기 전에 묻고, «아니오» 면 서버를 부르지 않는다.
//        새 글(resetForm)은 초안·차수를 함께 지운다.
//
//   ⚠️ «눌러서 진짜 그렇게 보이는가» 는 브라우저로 봐야 한다:
//        PW_DIR=/tmp/pw node test-harness/manual/ai-write-v2-browser.mjs
//
//   실행: node test-harness/ai_write_v2_harness.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dir);
// AW_HTML = 변이시험용 사본 경로(저장소 파일을 고쳤다 되돌리지 않으려고)
const HTML = readFileSync(process.env.AW_HTML || join(root, 'cloudflare-deploy/public/ai-write.html'), 'utf8');

let pass = 0, fail = 0; const FAILS = [];
const check = (name, ok, extra = '') => {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; FAILS.push(name); console.log('  ❌ ' + name + (extra ? '  → ' + extra : '')); }
};

console.log('✍️ AI 영작 v2 보완 하니스 · ' + new Date().toISOString());

/* 주석을 벗겨 낸 사본 — 부정 검사(«이 호출이 없어야 한다»)는 이것으로 본다(설명 주석이 같은 이름을 담는다). */
function stripComments(src) {
  let out = '', i = 0, q = null;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (q) { out += c; if (c === '\\') { out += n || ''; i += 2; continue; } if (c === q) q = null; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; out += c; i++; continue; }
    if (c === '/' && n === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue; }
    if (c === '/' && n === '/' && src[i - 1] !== ':') { const e = src.indexOf('\n', i); i = e < 0 ? src.length : e; continue; }
    out += c; i++;
  }
  return out;
}
// 여는 중괄호부터 짝이 맞는 닫는 중괄호까지(문자열·템플릿 안은 건너뛴다)
function braceBlock(src, from) {
  const s = src.indexOf('{', from);
  if (s < 0) return '';
  let depth = 0, q = null;
  for (let i = s; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(from, i + 1); }
  }
  return '';
}
const cutFn = (startText, label) => {
  const i = HTML.indexOf(startText);
  check('오려 냄: ' + label, i >= 0);
  return i >= 0 ? braceBlock(HTML, i) : '';
};

/* ═══ 오려 내기 ═══ */
const v2Start = HTML.indexOf('    const AW_WORD_GOAL');
const v2EndAnchor = HTML.indexOf('    window.awReviseAgain = function');
check('오려 냄: v2 블록(AW_WORD_GOAL ~ awReviseAgain)', v2Start > 0 && v2EndAnchor > v2Start);
const V2 = HTML.slice(v2Start, v2EndAnchor) + braceBlock(HTML, v2EndAnchor) + ';';
// ⚠️ escapeHtml 은 정규식 안에 따옴표가 있어(/[&<>"']/) 중괄호 짝 자르기가 문자열로 오인한다 — 줄 모양으로 자른다.
const ESC = (HTML.match(/    function escapeHtml\(s\) \{\n[^\n]*\n    \}/) || [''])[0];
check('오려 냄: escapeHtml', !!ESC);
const goHasKo = (HTML.match(/const goHasKo = [^\n]+\n/) || [''])[0];
const goIsEn = (HTML.match(/const goIsEn  = [^\n]+\n/) || [''])[0];
check('오려 냄: goHasKo · goIsEn', !!goHasKo && !!goIsEn);
const SUBMIT = cutFn('    async function submitText() {', 'submitText');
const RESET = cutFn('    window.resetForm = function(){', 'resetForm');

/* ═══ 가짜 세계 — 저장소·DOM·시계·fetch ═══ */
function makeWorld({ lang = 'ko', uid = 'kid01' } = {}) {
  const store = new Map();
  const timers = [];
  const toasts = [], confirms = [], fetches = [], rendered = [];
  const el = (id) => ({ id, value: '', textContent: '', innerHTML: '', disabled: false, style: {},
    focus() {}, setSelectionRange() {}, scrollIntoView() {} });
  const els = { text: el('text'), charCount: el('charCount'), submitBtn: el('submitBtn'), resultBox: el('resultBox') };
  const env = {
    store, timers, toasts, confirms, fetches, rendered, els,
    confirmAnswer: true, nextScore: 70,
    uid,
  };
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
  };
  const document = {
    getElementById: (id) => els[id] || null,
    addEventListener() {}, visibilityState: 'visible',
  };
  const window = { getLang: () => lang, addEventListener() {}, scrollTo() {} };
  const setTimeoutF = (fn) => { timers.push(fn); return timers.length; };
  const clearTimeoutF = () => {};
  const fetchF = async (url, opt) => {
    fetches.push({ url, body: JSON.parse(opt.body) });
    return { status: 200, json: async () => ({ ok: true, score: env.nextScore, corrected: 'x', issues: [] }) };
  };
  const SRC = `
    ${ESC}
    ${goHasKo}${goIsEn}
    let currentLevel = 'A1';
    let _lastDraft = '';
    let _missionWords = [];
    let _goAnswers = {};
    const _qs = [
      { k:'where', ko:'📍 Where — 여기는 어디인가요?', en:'📍 Where — Where is this place?' },
      { k:'who',   ko:'🧑 Who — 누가 보이나요?',       en:'🧑 Who — Who can you see?' },
      { k:'what',  ko:'💡 What — 무슨 일이 벌어지고 있나요?', en:'💡 What — What is happening?' },
      { k:'how',   ko:'💗 How — 그다음엔 어떻게 됐나요?', en:'💗 How — What happened next?' },
    ];
    function goQuestions() { return _qs.map(q => Object.assign({}, q)); }
    function getUid() { return env.uid; }
    function getToken() { return ''; }
    function showToast(m) { env.toasts.push(m); }
    function stopDictation() {}
    function awTopicIdNow() { return null; }   // 📅 숙제(제안 6) — 정본 검사는 write_topics_harness
    function awMarkHwDone() {}
    function awTopicWorkSave() { env.topicSaves = (env.topicSaves || 0) + 1; }   // ✍️ 이어 쓰기(제안 5) — 정본 검사는 write_topics_harness [G]
    function showErrorBox(t, d) { env.rendered.push({ error: t + ' ' + d }); }
    function renderResult(d) { env.rendered.push({ score: d.score, round: _awRoundNow && Object.assign({}, _awRoundNow), snap: _awSubmitSnap }); }
    async function loadHistory() {}
    function alert(m) { env.toasts.push('ALERT ' + m); }
    function confirm(m) { env.confirms.push(m); return env.confirmAnswer; }
    ${V2}
    ${SUBMIT}
    ${RESET}
    return {
      AW_WORD_GOAL, AW_DRAFT_KEY, awWords, awWordCount, awCountLine, awRenderCount, updateCharCount,
      awDraftSave, awDraftRestore, awDraftForget, awWhCheck, awWhCheckHtml, awSameWriting, awNoteRound, awRoundHtml,
      submitText, resetForm: window.resetForm, awReviseAgain: window.awReviseAgain,
      setLevel: (lv) => { currentLevel = lv; },
      setAnswers: (a) => { _goAnswers = a; },
      // 화면의 goInput 처럼 «같은 객체를 고친다»(새 객체로 바꾸면 사본 검사가 헛돈다 — 변이시험 실측)
      typeAnswer: (k, v) => { _goAnswers[k] = v; },
      state: () => ({ prev: _awPrev, round: _awRoundNow, snap: _awSubmitSnap }),
    };`;
  let api = null, err = null;
  try {
    api = new Function('env', 'window', 'document', 'localStorage', 'setTimeout', 'clearTimeout', 'fetch', SRC)(
      env, window, document, localStorage, setTimeoutF, clearTimeoutF, fetchF);
  } catch (e) { err = e; }
  const runTimers = () => { const t = timers.splice(0); t.forEach((f) => f()); };
  return { api, env, err, runTimers };
}

const W0 = makeWorld();
check('가짜 세계에서 v2 블록이 실행된다', !!W0.api, W0.err && W0.err.message);
if (!W0.api) { console.log(`\n결과: PASS ${pass} / FAIL ${fail}`); process.exit(1); }

/* ═══ [1] 단어 수 목표 ═══ */
console.log('\n[1] 📏 단어 수 목표 줄');
{
  const { api } = makeWorld();
  check('영어 단어만 센다: «I like pizza. It is yummy!» = 6', api.awWordCount('I like pizza. It is yummy!') === 6);
  check('한글은 단어로 안 센다: «나는 pizza 좋아» = 1', api.awWordCount('나는 pizza 좋아') === 1);
  check("줄임말은 한 단어: «I'm happy» = 2", api.awWordCount("I'm happy") === 2);
  const w = (n) => Array.from({ length: n }, () => 'cat').join(' ');
  check('빈 칸 → «0단어 · 목표 20~40단어»', api.awCountLine('', 'A1').text === '✏️ 0단어 · 목표 20~40단어');
  const l12 = api.awCountLine(w(12), 'A1');
  check('1단계 12단어 → «8단어 더!» · 기본색', /8단어 더!/.test(l12.text) && l12.color === 'var(--text2)', l12.text);
  const l25 = api.awCountLine(w(25), 'A1');
  check('1단계 25단어 → «목표 달성» · 초록', /목표 달성/.test(l25.text) && l25.color === '#34d399', l25.text);
  const l50 = api.awCountLine(w(50), 'A1');
  check('1단계 50단어 → «목표보다 길어요» · 초록(벌주지 않음)', /길어요/.test(l50.text) && l50.color === '#34d399', l50.text);
  check('4단계 목표는 120~200', /120~200/.test(api.awCountLine(w(5), 'B2').text));
  check('모르는 단계는 1단계 목표로', /20~40/.test(api.awCountLine(w(5), 'C9').text));
  const long1 = api.awCountLine('a'.repeat(1850), 'A1');
  check('1800자를 넘으면 글자 수를 함께 보여 준다', /1850\/2000자/.test(long1.text), long1.text);
  check('1800자 이하면 글자 수를 안 붙인다', !/\/2000/.test(api.awCountLine(w(30), 'A1').text));
  check('2000자를 넘으면 빨강(읽히는 밝은 빨강 #fca5a5)', api.awCountLine('a'.repeat(2050), 'A1').color === '#fca5a5');
  const en = makeWorld({ lang: 'en' }).api.awCountLine(w(12), 'A1').text;
  check('영어 화면은 영어로 «8 more!»', /12 words · goal 20–40 \(8 more!\)/.test(en), en);
}

/* ═══ [2] 초안 자동 저장 ═══ */
console.log('\n[2] 💾 초안 자동 저장 — 그리기는 저장 안 함 · 바뀔 때만 저장');
{
  const { api, env, runTimers } = makeWorld({ uid: 'kid01' });
  env.els.text.value = 'I went to the park.';
  api.awRenderCount(); runTimers();
  check('awRenderCount 는 저장하지 않는다', !env.store.has(api.AW_DRAFT_KEY));
  check('awRenderCount 가 글자 줄을 그린다', /5단어/.test(env.els.charCount.textContent), env.els.charCount.textContent);
  api.updateCharCount();
  check('updateCharCount 는 바로 쓰지 않고 잠시 뒤(타이머) 저장한다', !env.store.has(api.AW_DRAFT_KEY) && env.timers.length > 0);
  runTimers();
  const saved = JSON.parse(env.store.get(api.AW_DRAFT_KEY) || 'null');
  check('타이머 뒤 «내 계정 + 글 + 시각» 이 저장된다', saved && saved.u === 'kid01' && saved.t === 'I went to the park.' && saved.ts > 0);
  // 빈 칸 — 내 초안은 지우고 남의 초안은 안 지운다
  env.els.text.value = '';
  api.updateCharCount(); runTimers();
  check('빈 칸이 되면 «내» 초안을 지운다', !env.store.has(api.AW_DRAFT_KEY));
  env.store.set(api.AW_DRAFT_KEY, JSON.stringify({ u: 'other', t: 'Someone else', ts: Date.now() }));
  api.updateCharCount(); runTimers();
  check('빈 칸이어도 «남의» 초안은 안 지운다(공용 PC)', env.store.has(api.AW_DRAFT_KEY));
  api.awDraftForget();
  check('새 글(awDraftForget)도 남의 초안은 안 지운다', env.store.has(api.AW_DRAFT_KEY));
}
{
  // 되살리기
  const mk = (draft, uid = 'kid01', pre = '') => {
    const w = makeWorld({ uid });
    if (draft) w.env.store.set(w.api.AW_DRAFT_KEY, JSON.stringify(draft));
    w.env.els.text.value = pre;
    const r = w.api.awDraftRestore();
    return { r, w };
  };
  const now = Date.now();
  let t = mk({ u: 'kid01', t: 'My dog is big.', ts: now - 60000 });
  check('같은 계정 · 하루 안 → 되살린다', t.r === true && t.w.env.els.text.value === 'My dog is big.');
  check('되살렸다고 알린다(토스트)', t.w.env.toasts.some((m) => /되살렸어요/.test(m)));
  t = mk({ u: 'other', t: 'Not mine.', ts: now - 60000 });
  check('다른 계정의 초안은 안 되살린다', t.r === false && t.w.env.els.text.value === '');
  t = mk({ u: 'kid01', t: 'Old one.', ts: now - 2 * 86400000 });
  check('하루가 지난 초안은 안 되살리고 지운다', t.r === false && !t.w.env.store.has(t.w.api.AW_DRAFT_KEY));
  t = mk({ u: 'kid01', t: 'Saved text.', ts: now }, 'kid01', 'Already typed');
  check('칸에 이미 글이 있으면 덮지 않는다', t.r === false && t.w.env.els.text.value === 'Already typed');
  t = mk(null);
  check('저장된 초안이 없으면 아무 일도 안 한다', t.r === false && t.w.env.toasts.length === 0);
  const bad = makeWorld(); bad.env.store.set(bad.api.AW_DRAFT_KEY, '{broken');
  check('깨진 저장값에도 던지지 않는다', bad.api.awDraftRestore() === false);
}

/* ═══ [3] 6하원칙 확인 ═══ */
console.log('\n[3] 🧭 6하원칙 확인 — 메모 ↔ 글 낱말 비교');
{
  const { api } = makeWorld();
  const qs = [
    { k: 'where', ko: '📍 Where — 여기는 어디인가요?', en: '📍 Where — Where is this place?' },
    { k: 'who', ko: '🧑 Who — 누가 보이나요?', en: '🧑 Who — Who can you see?' },
    { k: 'what', ko: '💡 What — 무슨 일이?', en: '💡 What — What is happening?' },
    { k: 'how', ko: '💗 How — 그다음엔?', en: '💗 How — What next?' },
  ];
  const ans = { where: 'at the park', who: 'my best friend', what: 'play soccer', how: '신나게 뛰었다' };
  const text = 'I was at the park. We played soccers all day.';
  const r = api.awWhCheck(qs, ans, text);
  const by = (k) => r.rows.find((x) => x.q.k === k) || {};
  check('메모 낱말이 글에 있으면 ok (park)', by('where').kind === 'ok');
  check('메모 낱말이 글에 없으면 miss + 빠진 낱말 (best, friend)', by('who').kind === 'miss' && by('who').miss.join(',') === 'best,friend', JSON.stringify(by('who')));
  check('끝말이 달라도 같은 말로 본다 (play ↔ played, soccer ↔ soccers)', by('what').kind === 'ok');
  check('한글 메모는 판정하지 않는다(kind ko)', by('how').kind === 'ko');
  check('셀 수 있는 것은 영어 메모 3개 · 들어간 것 2개', r.checkable === 3 && r.ok === 2, `${r.ok}/${r.checkable}`);
  const r2 = api.awWhCheck(qs, { where: 'at the park' }, 'At the park.');
  check('메모가 없는 질문은 «빈 칸» 으로 따로 센다', r2.empty.length === 3);
  check('메모를 하나도 안 썼으면 상자를 안 그린다', api.awWhCheckHtml({ qs, answers: {}, text: 'Hello there.' }) === '');
  const html = api.awWhCheckHtml({ qs, answers: ans, text });
  check('메모가 있으면 상자를 그린다(짝)', /id="awWhCheck"/.test(html));
  check('🔸 안 보이는 메모를 알린다', /best, friend/.test(html) && /다른 말로 썼다면 괜찮아요/.test(html));
  check('📝 한글 메모는 «스스로 확인» 이라고 말한다', /스스로 확인/.test(html));
  check('«AI 판정 아님» 을 밝힌다', /AI 판정 아님/.test(html));
  check('두 언어를 data-ko/data-en 으로 함께 싣는다', /data-en="[^"]*appear in your writing/.test(html));
  // 메모 글이 그대로 다시 보이는 «ok» 줄로 만들어야 이스케이프를 잰다(miss 줄은 빠진 낱말만 보여 준다)
  const evil = api.awWhCheckHtml({ qs, answers: { where: '<img src=x onerror=alert(1)>' }, text: 'img src onerror alert' });
  check('메모 글은 HTML 로 해석되지 않는다(이스케이프)', !/<img src=x/.test(evil) && /&lt;img/.test(evil));
  const en = makeWorld({ lang: 'en' }).api.awWhCheckHtml({ qs, answers: ans, text });
  check('영어 화면은 영어로 그린다', />[^<]*5W1H check/.test(en) && /2 of 3 English notes/.test(en));
}

/* ═══ [4] 고쳐서 다시 첨삭 ═══ */
console.log('\n[4] 🔁 고쳐서 다시 첨삭 — 차수 · 점수 변화');
{
  const { api } = makeWorld();
  const a = api.awNoteRound('I go to school yesterday with my friend.', 72, 'A1');
  check('첫 첨삭은 1차 · 지난 점수 없음', a.round === 1 && a.prevScore === null);
  const b = api.awNoteRound('I went to school yesterday with my best friend.', 85, 'A1');
  check('같은 글을 고치면 2차 · 지난번 72점', b.round === 2 && b.prevScore === 72);
  const c = api.awNoteRound('Pizza is my favorite food because it is cheesy.', 60, 'A1');
  check('전혀 다른 글이면 다시 1차', c.round === 1 && c.prevScore === null);
  check('awSameWriting: 지난 글이 3낱말 미만이면 판단 안 함', api.awSameWriting('Hi hi', 'Hi') === false);
  const h2 = api.awRoundHtml({ round: 2, prevScore: 72, score: 85, words: 9, level: 'A1' });
  check('2차 줄: «지난번 72점 → 이번 85점 (+13)»', /지난번 72점 → 이번 85점 \(\+13\)/.test(h2), h2);
  const hDown = api.awRoundHtml({ round: 3, prevScore: 85, score: 80, words: 30, level: 'A1' });
  check('점수가 내려가도 벌주지 않는 말로 설명한다', /\(-5\) · 점수는 글 길이/.test(hDown));
  const h1 = api.awRoundHtml({ round: 1, prevScore: null, score: 70, words: 9, level: 'A1' });
  check('1차 줄은 «고쳐서 다시 받으면» 을 안내한다', /1차 첨삭/.test(h1) && /11단어 더 쓰면 좋아요/.test(h1));
}

/* ═══ [5] 배선 — submitText·resetForm 을 실제로 돌린다 ═══ */
console.log('\n[5] 🔌 배선 — 제출·새 글을 실제로 돌려 본다');
{
  const W = makeWorld();
  const { api, env } = W;
  api.setAnswers({ where: 'at the park' });
  env.els.text.value = 'I go to the park with my dog today.';
  env.nextScore = 72;
  await api.submitText();
  check('1번째 제출: 서버를 한 번 부른다', env.fetches.length === 1);
  check('1번째 제출: renderResult 를 부를 때 이미 «1차» 가 정해져 있다', env.rendered[0] && env.rendered[0].round && env.rendered[0].round.round === 1, JSON.stringify(env.rendered[0]));
  check('제출 때 메모를 «찍어 둔다»(_awSubmitSnap)', env.rendered[0] && env.rendered[0].snap && env.rendered[0].snap.answers.where === 'at the park');
  check('보내기 전에 초안을 바로 저장한다', env.store.has(api.AW_DRAFT_KEY));
  api.typeAnswer('where', 'CHANGED AFTER');
  check('찍어 둔 메모는 나중에 메모를 바꿔도 그대로다(사본)', api.state().snap.answers.where === 'at the park');

  env.els.text.value = 'I went to the park with my dog today.';
  env.nextScore = 85;
  await api.submitText();
  check('고친 글 제출: 서버를 다시 부른다', env.fetches.length === 2);
  check('고친 글 제출: «2차 · 지난번 72점»', env.rendered[1] && env.rendered[1].round.round === 2 && env.rendered[1].round.prevScore === 72, JSON.stringify(env.rendered[1]));

  // 똑같은 글 — 물어보고, 아니오면 안 보낸다
  env.confirmAnswer = false;
  await api.submitText();
  check('똑같은 글이면 보내기 전에 묻는다', env.confirms.length === 1);
  check('«아니오» 면 서버를 부르지 않는다', env.fetches.length === 2);
  env.confirmAnswer = true;
  await api.submitText();
  check('«예» 면 보낸다(짝)', env.fetches.length === 3);

  // 새 글
  const confirmsBeforeReset = env.confirms.length;
  api.resetForm();
  check('새 글: 칸을 비운다', env.els.text.value === '');
  check('새 글: 저장해 둔 초안을 지운다', !env.store.has(api.AW_DRAFT_KEY));
  check('새 글: 차수·지난 점수·찍어 둔 메모를 지운다', api.state().prev === null && api.state().round === null && api.state().snap === null);
  env.els.text.value = 'I went to the park with my dog today.';
  env.nextScore = 90;
  await api.submitText();
  const lastR = env.rendered[env.rendered.length - 1] || {};
  check('새 글 뒤에는 같은 글을 보내도 묻지 않고 1차부터', env.confirms.length === confirmsBeforeReset && lastR.round && lastR.round.round === 1,
    `confirms=${env.confirms.length} last=${JSON.stringify(lastR).slice(0, 160)}`);
}

/* ═══ [6] 배선 — 소스 위치(주석 벗긴 사본) ═══ */
console.log('\n[6] 🔌 배선 — 단계 버튼 · 처음 열기 · 결과 화면');
{
  const S = stripComments(HTML);
  const lvl = S.indexOf("localStorage.setItem('mangoi_aiwrite_level', currentLevel)");
  const lvlBody = lvl > 0 ? S.slice(lvl, S.indexOf('};', lvl)) : '';
  check('단계를 바꾸면 단어 수 목표를 다시 그린다(조건 없이)', /\n\s+awRenderCount\(\);/.test(lvlBody), lvlBody.slice(0, 200));
  const initA = S.indexOf('flowMark(0);\n'), initB = S.indexOf('wtLoad();', initA);
  const init = initA > 0 && initB > initA ? S.slice(initA, initB) : '';
  check('처음 열 때 초안을 되살리고 목표 줄을 그린다', /awDraftRestore\(\)/.test(init) && /awRenderCount\(\)/.test(init) && init.indexOf('awDraftRestore') < init.indexOf('awRenderCount'));
  check('🔴 처음 열 때는 updateCharCount(=저장) 를 부르지 않는다', !/updateCharCount\(/.test(init));
  const rr = braceBlock(S, S.indexOf('function renderResult(d)'));
  check('결과에 «몇 차 첨삭» 줄을 그린다', /awRoundHtml\(_awRoundNow\)/.test(rr));
  check('결과에 «6하원칙 확인» 을 그린다(제출 때 찍은 메모로)', /awWhCheckHtml\(_awSubmitSnap\)/.test(rr));
  check('결과에 «고쳐서 다시 첨삭» 버튼이 있다', /onclick="awReviseAgain\(\)"/.test(rr) && /data-ko="내 글 고쳐서 다시 첨삭"/.test(rr));
  check('결과 버튼 줄이 좁은 화면에서 줄바꿈된다(.aw-result-acts flex-wrap)', /\.aw-result-acts \{[^}]*flex-wrap: wrap/.test(HTML));
  check('결과를 그린 뒤 i18n 을 입힌다(새 span 의 data-ko/data-en)', /applyI18n\(document\.getElementById\('resultBox'\)\)/.test(rr));
  const uc = braceBlock(S, S.indexOf('function updateCharCount()'));
  check('updateCharCount = 그리기 + 저장 예약', /awRenderCount\(\)/.test(uc) && /awDraftSaveSoon\(\)/.test(uc));
  const rc = braceBlock(S, S.indexOf('function awRenderCount()'));
  check('🔴 awRenderCount 안에는 저장이 없다', !/awDraftSave/.test(rc));
  check('입력칸은 여전히 oninput 으로 updateCharCount 를 부른다', /<textarea id="text"[^>]*oninput="updateCharCount\(\)"/.test(HTML));
  const lc = S.indexOf("['mangoi:lang-changed'].forEach(ev => {");
  check('🌐 언어를 바꾸면 목표 줄도 다시 그린다', lc > 0 && /awRenderCount\(\)/.test(S.slice(lc, lc + 400)));
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) { console.log('실패: ' + FAILS.join(' | ')); process.exit(1); }
