// 영어 복습퀴즈(BTS/SIU) 화면 EN/KO (2026-11-04)
// 옛 isEn() 은 어디서도 안 정해지는 window.langCurrent 를 봐서 EN 학생도 늘 한국어였다.
// 화면 조각(목록·문제·결과·🌐 배선)을 소스에서 오려 내 가짜 DOM 으로 «실제로» 그려 본다 — EN 은 한국어 0글자, KO 는 그대로(짝).
import fs from 'node:fs';
const root = new URL('../', import.meta.url).pathname;
const SRC = process.env.RQ_EN || root + 'cloudflare-deploy/public/review-quiz.html';
const h = fs.readFileSync(SRC, 'utf8');
let pass = 0, fail = 0;
const ok = (n, c) => { c ? pass++ : fail++; console.log((c ? '✅ ' : '❌ FAIL ') + n); };
function cut(a, b) { const i = h.indexOf(a), j = h.indexOf(b, i + 1); return i > 0 && j > i ? h.slice(i, j) : ''; }
const lang = cut('    function isEn(){', '    var ME =');
const cheer = cut('    var CHEER_OK', '    // ━━━ +점수 플로팅');
const list = cut('    async function loadList(', '    // ───── 풀기');
const types = cut('    var TYPE_ICON =', '    var rec =');
const rq = cut('    function renderQ(', '    function refreshNext(');
const res = cut('    function countUp(', '    /* 🌐 (2026-11-04) 언어가');
const wire = cut('    /* 🌐 (2026-11-04) 언어가', '    loadList();\n');
ok('전제: 화면 조각을 전부 오려 냈다', !!(lang && cheer && list && types && rq && res && wire));
const HANGUL = /[가-힣]/;
const text = s => (s || '').replace(/<[^>]+>/g, ' ');
const attrs = s => ((s || '').match(/(?:title|aria-label|placeholder)="[^"]*"/g) || []).join(' ');
const QS = [
  { type: 'choice', q: 'What color is it?', opts: ['Red', 'Blue'] },
  { type: 'listen', q: 'Listen', opts: ['One', 'Two'] },
  { type: 'write', q: 'Write it' },
  { type: 'speak', q: 'Say it' },
];
function env(cur) {
  const L = { cur };
  const els = { playView: { innerHTML: '' }, resultView: { innerHTML: '', style: { display: 'none' } }, quizList: { innerHTML: '' }, rvScore: { textContent: '' }, rvPts: { textContent: '' } };
  els.playView.style = { display: 'block' };
  const document = { documentElement: { lang: 'ko' }, getElementById: id => els[id] || null };
  const window = { getLang: () => L.cur, scrollTo() {} };
  return { L, els, document, window };
}
const NAMES = ['window', 'document', 'state', 'ABC', 'esc', 'SFX', 'MANGO_IMG', 'playAudio', 'setTimeout', 'fetch', 'ME', 'zhHintTop', 'localStorage', 'confetti', 'sfxWin', 'requestAnimationFrame', 'performance'];
function build(E, state, counts) {
  return new Function(...NAMES, lang + cheer + list + types + rq + res + '; return { renderQ, pickLine, loadList, showResult, CHEER_OK };')(
    E.window, E.document, state, ['A', 'B', 'C', 'D'], s => String(s == null ? '' : s), { muted: false }, '/m.png',
    () => counts.played++, f => f(),
    async () => ({ json: async () => (counts.listResp) }), { uid: 'u1' }, () => {}, { getItem: () => '' },
    () => counts.conf++, () => {}, () => {}, { now: () => 0 });
}
function draw(cur, idx, fb, combo) {
  const E = env(cur), counts = { played: 0, conf: 0 };
  const state = { quiz: { id: 7, title: 'BTS 1 001', questions: QS }, idx, fb: QS.map((_, k) => k === idx ? fb : null), answers: QS.map(() => null), combo: combo || 0, maxCombo: 3, correctCount: 2, animate: -1 };
  try {
    const api = build(E, state, counts);
    if (fb && fb.line === 'PICK') fb.line = api.pickLine(api.CHEER_OK);
    api.renderQ();
    return { html: E.els.playView.innerHTML, api, E, counts };
  } catch (e) { return { err: e.message, html: '' }; }
}
let allEn = true, allKo = true;
QS.forEach((q, k) => {
  for (const fb of [null, { correct: true, answer: 0, your: 0, line: 'PICK', answer_text: 'I like it', explain: 'Because' }]) {
    const en = draw('en', k, fb && { ...fb }, 3);
    if (en.err || !en.html || HANGUL.test(text(en.html)) || HANGUL.test(attrs(en.html))) { allEn = false; console.log('  EN 남은 한국어:', q.type, !!fb, en.err || (text(en.html) + attrs(en.html)).match(/[가-힣][^<"]{0,20}/)); }
    const ko = draw('ko', k, fb && { ...fb }, 3);
    if (ko.err || !HANGUL.test(text(ko.html))) allKo = false;
  }
});
ok('EN(엔진 getLang=en, <html lang=ko>): 4가지 문항 × 풀기 전/후 한국어 0글자', allEn);
ok('KO(짝): 같은 화면이 한국어로 그대로 나온다', allKo);
const en0 = draw('en', 0, null, 3);
ok('EN: 문항 종류도 영어 이름(Multiple choice)', /Multiple choice/.test(en0.html) && !/— 📝 choice/.test(en0.html));
const ko0 = draw('ko', 0, null, 3);
ok('KO: 예전 문구 그대로', /객관식/.test(ko0.html) && /건너뛰기/.test(ko0.html) && /그만두기/.test(ko0.html));
// 🌐: 응원 대사가 같은 줄로 언어만 바뀐다 + 듣기 자동재생을 되풀이하지 않는다
const fbOk = { correct: true, answer: 0, your: 0, line: 'PICK' };
const c = draw('ko', 0, fbOk, 1);
if (c.err) { ok('🌐: 다시 그리면 응원 문구가 같은 줄로 영어가 된다', false); }
else {
  const kLine = c.api.CHEER_OK.ko.find(t => c.html.includes(t));
  const k = c.api.CHEER_OK.ko.indexOf(kLine);
  c.E.L.cur = 'en'; c.api.renderQ(true);
  ok('🌐: 다시 그리면 응원 문구가 같은 줄로 영어가 된다', k >= 0 && c.E.els.playView.innerHTML.includes(c.api.CHEER_OK.en[k].replace("'", '&#39;')));
}
const ls = draw('en', 1, null, 0);
const first = ls.counts && ls.counts.played;
if (ls.api) ls.api.renderQ(true);
ok('듣기: 처음엔 자동재생 1번, 🌐 다시 그릴 땐 안 튼다', first === 1 && ls.counts.played === 1);
// 목록
async function listHtml(cur, resp) {
  const E = env(cur), counts = { played: 0, conf: 0, listResp: resp };
  const state = { quiz: null };
  try { const api = build(E, state, counts); await api.loadList(); return E.els.quizList.innerHTML; } catch (e) { return 'ERR ' + e.message; }
}
const R = { ok: true, quizzes: [{ id: 1, title: 'BTS 1 001', question_count: 5, best_score: 3, attempts: 2 }] };
const lEn = await listHtml('en', R), lKo = await listHtml('ko', R);
ok('목록 EN: 한국어 0글자 + questions/Best/tries/Start', !HANGUL.test(text(lEn)) && /questions/.test(lEn) && /Best/.test(lEn) && /tries/.test(lEn) && /Start/.test(lEn));
ok('목록 KO(짝): 문항·풀기', /문항/.test(lKo) && /풀기/.test(lKo));
const lEmpty = await listHtml('en', { ok: true, quizzes: [] });
ok('목록 EN: 빈 목록 문구도 영어', /No quizzes yet/.test(lEmpty) && !HANGUL.test(text(lEmpty)));
// 결과: 🌐 다시 그리기는 축하를 되풀이하지 않고 숫자를 바로 채운다
{
  const E = env('ko'), counts = { played: 0, conf: 0 };
  const state = { quiz: { id: 7, title: 'BTS 1 001', questions: QS }, idx: 0, maxCombo: 0, practice: false };
  let okR = false, msg = '';
  try {
    const api = build(E, state, counts);
    const r = { ok: true, score: 4, total: 4, percent: 100, awarded: 40, balance: 100, streak: 0, first_clear: false, detail: QS.map((q, i) => ({ type: q.type, correct: true, your_answer: 0, answer: 0, your_text: 'x', answer_text: 'x' })) };
    api.showResult(r);
    const conf1 = counts.conf;
    E.L.cur = 'en'; api.showResult(r, true);
    const html = E.els.resultView.innerHTML;
    okR = conf1 === 1 && counts.conf === 1 && !HANGUL.test(text(html)) && E.els.rvScore.textContent === '4' && E.els.rvPts.textContent === '+40';
    msg = [conf1, counts.conf, E.els.rvScore.textContent, E.els.rvPts.textContent, (text(html).match(/[가-힣][^<]{0,15}/) || [''])[0]].join(' | ');
  } catch (e) { msg = e.message; }
  ok('결과 🌐: 영어로 다시 그리고, 폭죽은 1번만, 숫자는 바로 채움', okR);
  if (!okR) console.log('  ', msg);
}
// 배선: 🌐 이벤트(window·document) + 첫 화면(DOMContentLoaded) 에서 다시 그린다
{
  const L = {}, calls = [];
  const mk = () => ({ on: {}, addEventListener(n, f) { (this.on[n] = this.on[n] || []).push(f); } });
  const win = mk(), doc = mk();
  doc.readyState = 'loading';
  doc.getElementById = id => ({ listView: { style: { display: 'block' } }, playView: { style: { display: 'none' } }, resultView: { style: { display: 'none' } } })[id] || null;
  try {
    new Function('window', 'document', 'state', 'rec', 'showResult', 'renderQ', 'loadList', 'var _lastResult = null;' + wire)(
      win, doc, { quiz: null }, { mr: null }, () => calls.push('res'), () => calls.push('q'), () => calls.push('list'));
  } catch (e) { console.log('  ', e.message); }
  const fire = (o, n) => (o.on[n] || []).forEach(f => f());
  fire(win, 'mangoi:lang-changed'); fire(doc, 'mangoi:lang-changed'); fire(doc, 'DOMContentLoaded');
  ok('배선: window·document 🌐 와 첫 화면에서 목록을 다시 그린다', calls.filter(c => c === 'list').length === 3);
}
// 옛 판정이 되살아나지 않았다
ok('isEn 이 공용 엔진 getLang() 을 본다(죽은 langCurrent 아님)', /function isEn\(\)\{[^\n]*getLang/.test(h) && !/window\.langCurrent === 'en'/.test(h));
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
