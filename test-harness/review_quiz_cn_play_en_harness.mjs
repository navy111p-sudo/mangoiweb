// 중국어 복습퀴즈 «문제 푸는 화면» EN/KO (2026-11-04)
// renderQ·응원문구·isEn/T 를 소스에서 오려 내 가짜 DOM 으로 실제로 그려, 영어 모드에 한국어가 안 남는지·한국어는 그대로인지 짝으로 본다.
import fs from 'node:fs';
const root = new URL('../', import.meta.url).pathname;
const SRC = process.env.RQ_CN || root + 'cloudflare-deploy/public/review-quiz-cn.html';
const h = fs.readFileSync(SRC, 'utf8');
let pass = 0, fail = 0;
const ok = (n, c) => { c ? pass++ : fail++; console.log((c ? '✅ ' : '❌ FAIL ') + n); };
function cut(a, b) { const i = h.indexOf(a), j = h.indexOf(b, i + 1); return i > 0 && j > i ? h.slice(i, j) : ''; }
const cheer = cut('    var CHEER = {', '    function floatPop(');
const tone = cut('    function renderToneColor(', '    async function loadList(');
const types = cut('    var TYPE_ICON =', '    var rec =');
const rq = cut('    function renderQ(', '    var SILENT_WAV');
const lang = cut('    function isEn(){', '    var _lastResult');
ok('전제: 문제 화면 조각을 전부 오려 냈다', !!(cheer && tone && types && rq && lang));
const HANGUL = /[가-힣]/;
const QS = [
  { type: 'choice', q: '你好', py: 'ni3', opts: [{ hz: '好', py: 'hao3' }, '不'] },
  { type: 'listen', q: '听', opts: ['一', '二'] },
  { type: 'write', q: '写', answer_text: '书' },
  { type: 'speak', q: '说', target: '我爱你' },
];
function draw(cur, idx, fb, combo) {
  const L = { cur };
  const els = { playView: { innerHTML: '' }, writeIn: { focus() {} } };
  const document = { documentElement: { lang: 'ko' }, getElementById: id => els[id] || null };
  const window = { getLang: () => L.cur };
  const state = { quiz: { title: '第一课', questions: QS }, idx, fb: QS.map((_, k) => k === idx ? fb : null), answers: QS.map(() => null), combo: combo || 0, correctCount: 2, animate: -1 };
  let played = 0;
  let api;
  try {
    api = new Function('window', 'document', 'state', 'ABC', 'esc', 'APP_STATE', 'SFX', 'MANGO_IMG', 'playAudio', 'setTimeout',
      lang + cheer + tone + types + rq + '; return { renderQ: renderQ, pickLine: pickLine, CHEER: CHEER };')
      (window, document, state, ['A', 'B', 'C', 'D'], s => String(s), { showPinyin: true, showToneColor: false }, { muted: false }, '/m.png', () => played++, f => f());
    if (fb && fb.line === 'PICK') fb.line = api.pickLine(fb.correct ? 'ok' : 'no');
    api.renderQ();
  } catch (e) { return { err: e.message, html: '' }; }
  return { html: els.playView.innerHTML, api, L, els, played: () => played };
}
const text = s => (s || '').replace(/<[^>]+>/g, ' ');
const attrs = s => ((s || '').match(/(?:title|aria-label|placeholder)="[^"]*"/g) || []).join(' ');
let allEn = true, allKo = true;
QS.forEach((q, k) => {
  for (const fb of [null, { correct: true, answer: 0, your: 0, line: 'PICK', answer_text: '书', explain: '解释' }]) {
    const en = draw('en', k, fb && { ...fb }, 3);
    if (en.err || !en.html || HANGUL.test(text(en.html)) || HANGUL.test(attrs(en.html))) { allEn = false; console.log('  EN 남은 한국어:', q.type, !!fb, en.err || (text(en.html) + attrs(en.html)).match(/[가-힣][^<"]{0,20}/)); }
    const ko = draw('ko', k, fb && { ...fb }, 3);
    if (ko.err || !HANGUL.test(text(ko.html))) allKo = false;
  }
});
ok('EN: 4가지 문항 × 풀기 전/후 전부 한국어(본문·툴팁) 0글자', allEn);
ok('KO(짝): 같은 화면이 한국어로 그대로 나온다', allKo);
const en0 = draw('en', 0, null, 3);
ok('EN: 실제 영어 문구가 들어간다', /Multiple choice/.test(en0.html) && /pts/.test(en0.html) && /combo/.test(en0.html) && /Skip/.test(en0.html) && /Quit/.test(en0.html) && /Sound FX/.test(en0.html));
const ko0 = draw('ko', 0, null, 3);
ok('KO: 예전 문구 그대로', /객관식/.test(ko0.html) && /건너뛰기/.test(ko0.html) && /그만두기/.test(ko0.html) && !/Quit/.test(ko0.html));
ok('중국어 문항 글자는 그대로 남는다', /你好/.test(en0.html) && /好/.test(en0.html));
// 응원 문구: 줄 수가 같고, 언어를 바꿔 다시 그리면 같은 줄이 그 언어로
if (!en0.api) { ok('응원 문구 ko·en 줄 수가 같다', false); ok('🌐: 다시 그리면 응원 문구도 영어로(같은 줄)', false); ok('듣기: 처음엔 자동재생 1번', false); ok('🌐: 다시 그릴 때 자동재생을 되풀이하지 않는다', false); }
else {
  const C = en0.api.CHEER;
  ok('응원 문구 ko·en 줄 수가 같다', ['ok', 'hot', 'no'].every(n => C[n].ko.length === C[n].en.length && C[n].en.every(x => !HANGUL.test(x))));
  const fb = { correct: false, answer: 0, your: 1, line: { set: 'no', k: 0 } };
  const d = draw('ko', 0, fb);
  const koLine = /아쉬워/.test(d.html);
  d.L.cur = 'en'; d.api.renderQ(true);
  ok('🌐: 다시 그리면 응원 문구도 영어로(같은 줄)', koLine && /So close/.test(d.els.playView.innerHTML));
}
if (en0.api) {
// 듣기 문항: 언어만 바꿔 다시 그릴 때 음성을 다시 틀지 않는다
{
  const d = draw('ko', 1, null);
  const n = d.played();
  d.L.cur = 'en'; d.api.renderQ(true);
  ok('듣기: 처음엔 자동재생 1번', n === 1);
  ok('🌐: 다시 그릴 때 자동재생을 되풀이하지 않는다', d.played() === 1 && /Listen/.test(d.els.playView.innerHTML));
}
}
// 언어 리스너가 문제 화면도 다시 그린다(배선)
const rel = cut('      function relang(){', '      window.addEventListener(\'mangoi:lang-changed\', relang);');
ok('배선: 🌐 리스너가 문제 화면을 renderQ(true) 로 다시 그린다', /shown\('playView'\)[^\n]*renderQ\(true\)/.test(rel) && /!rec\.mr/.test(rel));
console.log(`review_quiz_cn_play_en_harness — PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
