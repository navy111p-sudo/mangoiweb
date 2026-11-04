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
const ko = cut('    var _lastResult', '    /* 🪙 (2026-11-02)');   // tKo·koRuns·koTranslatePlay (듣기 번역)
ok('전제: 문제 화면 조각을 전부 오려 냈다', !!(cheer && tone && types && rq && lang && /function koTranslatePlay\(/.test(ko)));
const HANGUL = /[가-힣]/;
const QS = [
  { type: 'choice', q: '你好', py: 'ni3', opts: [{ hz: '好', py: 'hao3' }, '不'] },
  { type: 'listen', q: '听', opts: ['一', '二'] },
  { type: 'write', q: '写', answer_text: '书' },
  { type: 'speak', q: '说', target: '我爱你' },
];
function draw(cur, idx, fb, combo, opt) {
  opt = opt || {};
  const L = { cur };
  const els = { playView: { innerHTML: '', style: { display: 'block' } }, writeIn: { focus() {} } };
  const document = { documentElement: { lang: 'ko' }, getElementById: id => els[id] || null };
  const window = { getLang: () => L.cur };
  const qs = opt.qs || QS;
  const state = { quiz: { title: '第一课', questions: qs }, idx, fb: qs.map((_, k) => k === idx ? fb : null), answers: qs.map(() => null), combo: combo || 0, correctCount: 2, animate: -1 };
  let played = 0;
  let api;
  try {
    api = new Function('window', 'document', 'state', 'ABC', 'esc', 'APP_STATE', 'SFX', 'MANGO_IMG', 'playAudio', 'setTimeout', 'fetch',
      lang + ko + cheer + tone + types + rq + '; return { renderQ: renderQ, pickLine: pickLine, CHEER: CHEER };')
      (window, document, state, ['A', 'B', 'C', 'D'], s => String(s), { showPinyin: true, showToneColor: false }, { muted: false }, '/m.png', () => played++, f => f(),
        opt.fetch || (async () => { throw new Error('no fetch'); }));
    if (fb && fb.line === 'PICK') fb.line = api.pickLine(fb.correct ? 'ok' : 'no');
    api.renderQ();
  } catch (e) { return { err: e.message, html: '' }; }
  return { html: els.playView.innerHTML, api, L, els, state, played: () => played };
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
// 🌐 (2026-11-04) 듣기 문항의 한국어 뜻 보기·문제 글·해설 → 영어 모드면 번역해 다시 그린다(중국어 보기·정답 번호는 그대로)
{
  const LQ = [{ type: 'listen', q: '🎧 잘 듣고 무슨 뜻인지 고르세요.', opts: ['새 학기가 시작되었고, 반에 새 친구가 왔어요.', '반 친구들은 모두 그를 좋아해서 자주 민호라고 불러요.'] },
              { type: 'choice', q: '다음 중 «한국인» 은?', opts: [{ hz: '韩国人', py: 'Hánguórén' }, '中国人'] }];
  const TRP = { '잘 듣고 무슨 뜻인지 고르세요.': 'Listen and choose the meaning.', '새 학기가 시작되었고, 반에 새 친구가 왔어요.': 'A new semester began and a new friend came.',
    '반 친구들은 모두 그를 좋아해서 자주 민호라고 불러요.': 'His classmates all like him and call him Minho.', '해설입니다': 'Explanation' };
  const tick = () => new Promise(r => setTimeout(r, 5));
  // 응답을 매크로태스크로 늦춘다 — 중복 방지가 깨져 «그리기→요청→그리기» 가 돌아도 하니스가 멈추지 않고 FAIL 로 잡게
  const mk = (sent, mapFn) => async (u, o) => { await new Promise(r => setTimeout(r, 0)); const b = JSON.parse(o.body); sent.push(b); return { json: async () => mapFn(b) }; };
  const okMap = b => ({ ok: true, map: Object.fromEntries(b.texts.map(t => [t, TRP[t] || t])) });
  // EN: 번역 요청 → 다시 그리면 한국어 0
  { const sent = []; const d = draw('en', 0, null, 0, { qs: LQ, fetch: mk(sent, okMap) });
    await tick(); await tick();
    const t = text(d.els.playView.innerHTML);
    ok('EN 듣기: 한국어 조각(문제 글·보기 2개)을 한 번에 번역 요청', sent.length === 1 && sent[0].target === 'en' && sent[0].texts.length === 3);
    ok('EN 듣기: 다시 그리면 보기가 영어 · 한국어 0글자', /A new semester began/.test(t) && /call him Minho/.test(t) && /Listen and choose/.test(t) && !HANGUL.test(t));
    ok('EN 듣기: 다시 그릴 때 음성 자동재생을 되풀이하지 않는다', d.played() === 1);
    // 다시 그려도 같은 조각을 또 묻지 않는다
    d.api.renderQ(true); await tick();
    ok('EN 듣기: 이미 번역한 조각은 다시 요청하지 않는다', sent.length === 1); }
  // KO(짝): 요청 없음 · 한국어 그대로
  { const sent = []; const d = draw('ko', 0, null, 0, { qs: LQ, fetch: mk(sent, okMap) }); await tick();
    ok('KO 듣기(짝): 번역 요청 없음 · 한국어 보기 그대로', sent.length === 0 && /새 학기가/.test(d.els.playView.innerHTML)); }
  // 실패: 원문 그대로(지어내지 않음) · 화면 안 깨짐
  { const sent = []; const d = draw('en', 0, null, 0, { qs: LQ, fetch: mk(sent, () => ({ ok: false })) }); await tick(); await tick();
    ok('EN 듣기 실패: 원문 한국어 그대로 남는다(지어내지 않음)', /새 학기가/.test(d.els.playView.innerHTML) && /Listen/.test(d.els.playView.innerHTML)); }
  // 다른 문항으로 넘어갔으면 다시 그리지 않는다
  { let res; const sent = []; const d = draw('en', 0, null, 0, { qs: LQ, fetch: async (u, o) => { sent.push(1); return new Promise(r => { res = () => r({ json: async () => okMap(JSON.parse(o.body)) }); }); } });
    d.state.idx = 1; const before = d.els.playView.innerHTML; res && res(); await tick(); await tick();
    ok('EN 듣기: 그 사이 다른 문항으로 넘어갔으면 다시 그리지 않는다', d.els.playView.innerHTML === before); }
  // 풀고 난 뒤 해설도
  { const sent = []; const d = draw('en', 0, { correct: true, answer: 1, your: 1, line: 'PICK', explain: '同学们 해설입니다' }, 0, { qs: LQ, fetch: mk(sent, okMap) });
    await tick(); await tick();
    ok('EN 듣기: 풀고 난 뒤 해설의 한국어도 번역(중국어는 그대로)', /同学们 Explanation/.test(d.els.playView.innerHTML)); }
  // 🌐 (2026-11-04) 객관식(choice) 문제 글도 번역 — 중국어 보기·정답 번호는 그대로
  const CQ = [{ type: 'choice', q: '[자기소개 · 새 친구] 📖 새 친구는 어느 나라 사람인가요?', opts: ['中国人', '韩国人', '美国人'], answer: 1 }];
  const TRC = { '자기소개 · 새 친구': 'Self-intro · New friend', '새 친구는 어느 나라 사람인가요?': 'Where is the new friend from?', '한국인': 'Korean' };
  const okC = b => ({ ok: true, map: Object.fromEntries(b.texts.map(t => [t, TRC[t] || t])) });
  { const sent = []; const d = draw('en', 0, null, 0, { qs: CQ, fetch: mk(sent, okC) }); await tick(); await tick();
    const t = text(d.els.playView.innerHTML);
    ok('EN 객관식: 문제 글의 한국어 조각만 번역 요청(중국어 보기는 안 보냄)', sent.length === 1 && sent[0].texts.length === 2 && !sent[0].texts.some(x => /[\u3400-\u9fff]/.test(x)));
    ok('EN 객관식: 다시 그리면 문제 글 영어 · 중국어 보기 그대로 · 한국어 0', /Where is the new friend from\?/.test(t) && /Self-intro/.test(t) && /韩国人/.test(t) && /美国人/.test(t) && !HANGUL.test(t)); }
  { const sent = []; const d = draw('ko', 0, null, 0, { qs: CQ, fetch: mk(sent, okC) }); await tick();
    ok('KO 객관식(짝): 번역 요청 없음 · 한국어 문제 글 그대로', sent.length === 0 && /어느 나라 사람/.test(d.els.playView.innerHTML)); }
  { const sent = []; const d = draw('en', 0, { correct: true, answer: 1, your: 1, line: 'PICK', explain: '정답: 韩国人 (한국인)' }, 0, { qs: CQ, fetch: mk(sent, okC) });
    await tick(); await tick();
    ok('EN 객관식: 풀고 난 뒤 해설도 영어(중국어는 그대로)', /Answer: 韩国人 \(Korean\)/.test(d.els.playView.innerHTML)); }
  // 서술형(write) 문제는 이번 범위 밖 — 번역 요청 없음(짝)
  { const sent = []; const d = draw('en', 0, null, 0, { qs: [{ type: 'write', q: '한자로 쓰세요', answer_text: '你' }], fetch: mk(sent, okC) }); await tick();
    ok('짝: 서술형은 번역 요청하지 않는다', sent.length === 0); }
}
console.log(`review_quiz_cn_play_en_harness — PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
