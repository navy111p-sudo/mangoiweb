import { fileURLToPath } from 'node:url';
// 중국어 복습퀴즈 결과 화면 EN/KO (2026-11-03)
// showResult 를 소스에서 오려 내 가짜 DOM 으로 실제로 그려, 영어 모드에 한국어가 안 남는지·한국어 모드는 그대로인지 짝으로 본다.
import fs from 'node:fs';
const root = fileURLToPath(new URL('../', import.meta.url));
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
// 🌐 (2026-11-04) 실제 데이터 모양 — 한국어 문제 글·«정답: 韩国人 (한국인)» 해설·한국어 듣기 보기·한국어 제목
//    EN: 한국어 조각만 번역 요청 → 다시 그리면 한국어 0글자 + 중국어는 그대로 / KO: 요청 없음(짝) / 실패: 원문 그대로
const TR = { '새 친구는 어느 나라 사람인가요?': 'Which country is the new friend from?', '자기소개 · 새 친구': 'Self-intro · New friend',
  '한국인': 'Korean', '잘 듣고 무슨 뜻인지 고르세요.': 'Listen and choose the meaning.',
  '반 친구들은 모두 그를 좋아해서 자주 민호라고 불러요.': 'His classmates all like him and often call him Minho.',
  '새 학기가 시작되었고, 반에 새 친구가 왔어요.': 'A new semester began and a new friend joined the class.',
  '제1과 · 자기소개 · 새 친구': 'Lesson 1 · Self-intro · New friend' };
async function real(cur, mapFn, toggle) {
  const lang = { cur }, sent = []; let fx = 0;
  const els = { resultView: { style: {}, innerHTML: '' }, playView: { style: {} } };
  const document = { documentElement: { lang: 'ko' }, getElementById: id => els[id] || null, addEventListener() {} };
  const window = { getLang: () => lang.cur, addEventListener() {}, scrollTo() {} };
  const state = { quiz: { title: '[제1과 · 자기소개 · 새 친구] 복습퀴즈', questions: [
    { type: 'choice', q: '[자기소개 · 새 친구] 📖 새 친구는 어느 나라 사람인가요?', opts: ['中国人', '韩国人'] },
    { type: 'listen', q: '🎧 잘 듣고 무슨 뜻인지 고르세요.', opts: ['새 학기가 시작되었고, 반에 새 친구가 왔어요.', '반 친구들은 모두 그를 좋아해서 자주 민호라고 불러요.'] } ] }, maxCombo: 0 };
  const fetchFn = async (u, o) => { const b = JSON.parse(o.body); sent.push(b); return { json: async () => mapFn(b) }; };
  const r = { score: 1, total: 2, percent: 50, awarded: 10, streak: 0, detail: [
    { type: 'choice', correct: true, your_answer: 1, answer: 1, explain: '정답: 韩国人 (한국인)' },
    { type: 'listen', correct: false, your_answer: 0, answer: 1, explain: '同学们都很喜欢他，常常叫他民浩。 (Tóngxuémen dōu hěn xǐhuan tā.)' } ] };
  try {
    const api = new Function('window', 'document', 'state', 'ABC', 'TYPE_ICON', 'esc', 'confetti', 'sfxWin', 'fetch',
      h.slice(i, j) + '; return { showResult };')(window, document, state, ['A', 'B'], {}, s => String(s), () => fx++, () => {}, fetchFn);
    api.showResult(r);
    els.resultView.style.display = 'block';
    if (toggle) { lang.cur = 'en'; api.showResult(r, true); }
    for (let k = 0; k < 3; k++) await new Promise(z => setTimeout(z, 0));
  } catch (e) { return { err: e.message, html: '', sent, fx }; }
  return { html: els.resultView.innerHTML, sent, fx };
}
const txt = x => (x || '').replace(/<[^>]+>/g, ' ');
{
  const map = b => ({ ok: true, map: Object.fromEntries((b.texts || []).map(t => [t, TR[t] || t])) });
  const a = await real('en', map);
  ok('실데이터 EN: 번역 요청 1번 · 중국어가 섞인 글은 «한국어 조각만» 보낸다', a.sent.length === 1 && a.sent[0].target === 'en' && a.sent[0].texts.every(t => !/[㐀-鿿]/.test(t)) && !a.sent[0].texts.includes('정답:'));
  ok('실데이터 EN: 다시 그리면 한국어 0글자', !a.err && !HANGUL.test(txt(a.html)));
  if (a.err || HANGUL.test(txt(a.html))) console.log('  ', a.err || (txt(a.html).match(/[가-힣][^<]{0,20}/) || [''])[0]);
  ok('실데이터 EN: 중국어·병음은 그대로 + 해설은 «Answer: 韩国人 (Korean)»', /Answer: 韩国人 \(Korean\)/.test(a.html) && /同学们都很喜欢他/.test(a.html) && /Review Quiz/.test(a.html));
  ok('실데이터 EN: 듣기 보기(한국어 뜻)도 영어로', /call him Minho/.test(a.html) && /new semester/.test(a.html));
  ok('실데이터 EN: 번역 뒤 다시 그려도 축하는 1번', a.fx === 1);
  const k = await real('ko', map);
  ok('실데이터 KO(짝): 번역을 묻지 않고 한국어 그대로', k.sent.length === 0 && /새 친구는 어느 나라/.test(k.html) && /정답: 韩国人 \(한국인\)/.test(k.html));
  const g = await real('ko', map, true);
  ok('실데이터 🌐(KO→EN): 그 자리에서 번역해 영어로', g.sent.length === 1 && !HANGUL.test(txt(g.html)) && g.fx === 1);
  const f = await real('en', () => ({ ok: false }));
  ok('실데이터 EN: 번역 실패면 원문 그대로(지어내지 않음, 화면은 남음)', !f.err && /새 친구는 어느 나라/.test(f.html) && /Points earned/.test(f.html));
  ok('틀린 문제 다시 버튼: onclick 따옴표가 닫힌다', /onclick="retryWrong\(\[1\]\)">🎯/.test(a.html));
}
console.log(`review_quiz_cn_result_en_harness — PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
