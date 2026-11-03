// 중국어 복습퀴즈 결과 화면 EN/KO (2026-11-03)
// showResult 를 소스에서 오려 내 가짜 DOM 으로 실제로 그려, 영어 모드에 한국어가 안 남는지·한국어 모드는 그대로인지 짝으로 본다.
import fs from 'node:fs';
const root = new URL('../', import.meta.url).pathname;
const SRC = process.env.RQ_CN || root + 'cloudflare-deploy/public/review-quiz-cn.html';
const h = fs.readFileSync(SRC, 'utf8');
let pass = 0, fail = 0;
const ok = (n, c) => { c ? pass++ : fail++; console.log((c ? '✅ ' : '❌ FAIL ') + n); };
const i = h.indexOf('    /* 🌐 (2026-11-03)'), j = h.indexOf('    function retryWrong(', i);
ok('전제: 결과 화면 조각을 오려 냈다', i > 0 && j > i);
function run(lang, r) {
  const els = { resultView: { style: {}, innerHTML: '' }, playView: { style: {} } };
  const listeners = {};
  let fx = 0;
  const document = { documentElement: { lang: 'ko' }, getElementById: id => els[id] || null,
    addEventListener: (t, f) => { (listeners['d' + t] = listeners['d' + t] || []).push(f); } };
  const window = { getLang: () => lang.cur, addEventListener: (t, f) => { (listeners['w' + t] = listeners['w' + t] || []).push(f); }, scrollTo() {} };
  const state = { quiz: { questions: [{ q: '你好', opts: ['A1', 'B1'] }, { q: '谢谢', opts: ['A2', 'B2'] }] }, maxCombo: 3 };
  const esc = s => String(s);
  try {
    new Function('window', 'document', 'state', 'ABC', 'TYPE_ICON', 'esc', 'confetti', 'sfxWin',
      h.slice(i, j) + '; showResult(arguments[8]); return { fire: () => (listeners["wmangoi:lang-changed"]||[]).concat(listeners["dmangoi:lang-changed"]||[]) };')
    (window, document, state, ['A', 'B'], {}, esc, () => fx++, () => {}, r);
  } catch (e) { return { err: e.message }; }
  return { html: els.resultView.innerHTML, fx, listeners, lang };
}
const R = { score: 1, total: 2, percent: 50, awarded: 10, streak: 3, balance: 120, first_clear: true, points_full: 10,
  detail: [{ type: 'choice', correct: true, your_answer: 0, answer: 0 }, { type: 'choice', correct: false, your_answer: null, answer: 1 }] };
const HANGUL = /[가-힣]/;
const en = run({ cur: 'en' }, R);
ok('EN: 그려진다', !en.err && (en.html||'').length > 100);
ok('EN: 한국어가 한 글자도 안 남는다', !HANGUL.test((en.html||'').replace(/<[^>]+>/g, '')));
ok('EN: 영어 문구가 실제로 들어간다', /Points earned/.test(en.html||'') && /My answer: /.test(en.html||'') && /Answer: /.test(en.html||'') && /Back to list/.test(en.html||'') && /Retry wrong ones/.test(en.html||'') && /\(no answer\)/.test(en.html||''));
ok('EN: 받은 포인트는 그대로 +10', /id="rvPts">\+10</.test(en.html||''));
const ko = run({ cur: 'ko' }, R);
ok('KO(짝): 예전 한국어 그대로', /획득 포인트/.test(ko.html||'') && /내 답: /.test(ko.html||'') && /목록으로/.test(ko.html||'') && !/Points earned/.test(ko.html||''));
ok('KO: 축하 효과는 한 번', ko.fx === 1);
// 🌐 토글: 결과 화면이 보이는 중 언어를 바꾸면 다시 그리고, 축하는 되풀이하지 않는다
{
  const lang = { cur: 'ko' };
  const els = { resultView: { style: {}, innerHTML: '' }, playView: { style: {} } };
  const L = []; let fx = 0;
  const document = { documentElement: { lang: 'ko' }, getElementById: id => els[id] || null, addEventListener: (t, f) => t === 'mangoi:lang-changed' && L.push(f) };
  const window = { getLang: () => lang.cur, addEventListener: (t, f) => t === 'mangoi:lang-changed' && L.push(f), scrollTo() {} };
  const state = { quiz: { questions: [{ q: 'x', opts: ['a', 'b'] }, { q: 'y', opts: ['a', 'b'] }] }, maxCombo: 0 };
  try {
    new Function('window', 'document', 'state', 'ABC', 'TYPE_ICON', 'esc', 'confetti', 'sfxWin', h.slice(i, j) + '; showResult(arguments[8]);')
      (window, document, state, ['A', 'B'], {}, s => String(s), () => fx++, () => {}, R);
  } catch (e) { console.log(e.message); }
  lang.cur = 'en'; L.forEach(f => f());
  ok('🌐: 리스너가 window·document 양쪽에 달린다', L.length === 2);
  ok('🌐: 언어를 바꾸면 결과가 영어로 다시 그려진다', /Points earned/.test(els.resultView.innerHTML));
  ok('🌐: 다시 그릴 때 축하 효과를 되풀이하지 않는다', fx === 1);
  els.resultView.style.display = 'none'; els.resultView.innerHTML = ''; lang.cur = 'ko'; L.forEach(f => f());
  ok('🌐 짝: 결과 화면이 안 보이면 다시 그리지 않는다', els.resultView.innerHTML === '');
}
console.log(`review_quiz_cn_result_en_harness — PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
