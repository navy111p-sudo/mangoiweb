// ═══════════════════════════════════════════════════════════════════════
// 🧭 AI 영작 첨삭 첫 화면 «3단계 안내 줄»(P7, 2026-10-02) 회귀 하니스
//   ① 단계가 가리키는 칸(id)이 화면에 «실재» 하고 순서도 맞는가(①그림 → ②브레인스토밍 → ③글쓰기 칸)
//   ② 누름 스크립트를 소스에서 오려 내 가짜 DOM 으로 «실제로 돌려»: 그 칸으로 스크롤하고,
//      ③만 글쓰기 칸에 포커스를 준다(짝: ①②는 포커스를 안 뺏는다) · 갈 곳이 없으면 던지지 않는다
//   ③ 낱글자 쪼개짐·i18n 함정(data-ko 를 버튼에 달지 않음)·CSS 주석 홑낫표
//   «보이는가·가려지는가·첫 화면 밖으로 밀리는가» 는 브라우저 검사가 잰다:
//       PW_DIR=/tmp/pw node test-harness/manual/ai-write-guide-browser.mjs
//   변이시험: AW_SRC=<고친 사본> node test-harness/ai_write_guide_harness.mjs
// ═══════════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.env.AW_SRC || path.join(HERE, '..', 'cloudflare-deploy', 'public', 'ai-write.html');
const html = fs.readFileSync(SRC, 'utf8');

let pass = 0, fail = 0;
function ok(c, l) { if (c) { pass++; console.log('  ✅ ' + l); } else { fail++; console.log('  ❌ FAIL ' + l); } }

console.log('═'.repeat(66));
console.log('  🧭 ai_write_guide — AI 영작 첨삭 3단계 안내 줄');
console.log('═'.repeat(66));

// ── ① 마크업·매핑 ──
const navM = html.match(/<nav class="aw-guide" id="awGuide"[^>]*>([\s\S]*?)<\/nav>/);
ok(!!navM, '전제: 안내 줄(#awGuide)을 찾았다');
const nav = navM ? navM[1] : '';
const steps = [...nav.matchAll(/<button type="button" class="awg-step" data-aw-go="([^"]+)">([\s\S]*?)<\/button>/g)].map(m => ({ go: m[1], inner: m[2] }));
ok(steps.length === 3, '단계 버튼이 셋 (' + steps.length + ')');
const want = ['picCard', 'goCard', 'text'];
ok(steps.map(s => s.go).join(',') === want.join(','), '①→오늘의 그림(picCard) ②→브레인스토밍(goCard) ③→글쓰기 칸(text)');
const pos = id => { const m = html.match(new RegExp('<[a-z]+[^>]*\\bid="' + id + '"')); return m ? m.index : -1; };
for (const s of steps) ok(pos(s.go) > 0, '단계 ' + s.go + ' 가 가리키는 칸이 화면에 실재한다');
ok(pos('picCard') < pos('goCard') && pos('goCard') < pos('text'), '세 칸이 화면에서도 그 순서다(① 위 · ③ 아래)');
ok(/<textarea id="text"/.test(html), '③ 의 칸은 AI 첨삭이 읽는 그 textarea(#text)다');
ok(/id="submitBtn"[^>]*onclick="submitText\(\)"/.test(html), '짝: 글쓰기 칸 아래 AI 첨삭 버튼(submitText)이 그대로 있다');
const wrapAt = html.indexOf('<div class="wrap">'), navAt = html.indexOf('id="awGuide"'), heroAt = html.indexOf('<div class="hero">');
ok(wrapAt > 0 && wrapAt < navAt && navAt < heroAt, '안내 줄은 본문 맨 위(.wrap 안, 히어로 앞)에 있다');

// 문구 — 한/영
const labels = steps.map(s => (s.inner.match(/data-ko="([^"]+)" data-en="([^"]+)"/) || []).slice(1));
ok(labels.length === 3 && labels.every(l => l.length === 2), '각 단계 글자에 data-ko/data-en 이 있다');
const L = (i, j) => String(((labels[i] || [])[j]) || '');
ok(/그림이나 주제 고르기/.test(L(0, 0)) && /질문에 답하기/.test(L(1, 0)) && /AI 첨삭 받기/.test(L(2, 0)), '한국어: 그림이나 주제 고르기 → 질문에 답하기 → AI 첨삭 받기');
ok(/picture or topic/i.test(L(0, 1)) && /Answer/.test(L(1, 1)) && /AI feedback/.test(L(2, 1)), '영어 문구가 짝으로 있다');
ok(steps.every(s => /^<span data-ko=/.test(s.inner.trim())), 'data-ko/data-en 은 버튼이 아니라 «글자만 담은 span» 에 단다');
ok(!/<button[^>]*data-ko=/.test(nav), '짝: 버튼 자신에는 data-ko 를 달지 않는다(i18n 엔진이 본문을 갈아끼움)');
ok(/class="awg-arrow" aria-hidden="true"/.test(nav), '화살표는 낭독기에서 감춘다');

// ── ② CSS ──
const css = (html.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
const rule = sel => { const m = css.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}')); return m ? m[1] : ''; };
const gRule = rule('.aw-guide'), sRule = rule('.aw-guide .awg-step');
ok(gRule.length > 0 && sRule.length > 0, '전제: 안내 줄 CSS 규칙을 찾았다');
ok(!/display\s*:\s*(inline-)?flex/.test(gRule), '안내 줄 상자는 flex 가 아니다(글자가 낱글자로 쪼개짐)');
ok(/display\s*:\s*inline-block/.test(sRule) && /white-space\s*:\s*nowrap/.test(sRule), '단계 버튼은 inline-block + nowrap(버튼 단위로만 줄바꿈)');
const cssComments = (css.match(/\/\*[\s\S]*?\*\//g) || []).join('\n');
ok(!/[「」]/.test(cssComments), 'CSS 주석에 홑낫표가 없다(한자 폰트 검사 함정)');
ok(!/[「」]/.test(css), '<style> 안 어디에도 홑낫표가 없다');

// ── ③ 누름 스크립트를 실제로 돌린다 ──
const scrM = html.slice(navAt).match(/<\/nav>\s*<script>([\s\S]*?)<\/script>/);
ok(!!scrM, '전제: 안내 줄 바로 뒤 누름 스크립트를 오려 냈다');
function run(opts = {}) {
  const els = {};
  const log = { scroll: [], focus: [] };
  const mk = (id, top) => ({ id, getBoundingClientRect: () => ({ top, height: 58 }), focus: (o) => log.focus.push([id, o]) });
  els.picCard = mk('picCard', 900); els.goCard = mk('goCard', 1700); els.text = mk('text', 2300);
  if (opts.drop) delete els[opts.drop];
  let listener = null;
  els.awGuide = { addEventListener: (t, fn) => { if (t === 'click') listener = fn; } };
  const top = { getBoundingClientRect: () => ({ height: 58 }) };
  const win = {
    pageYOffset: 100,
    scrollTo: (a, b) => log.scroll.push(typeof a === 'object' ? a.top : b),
    document: { getElementById: id => els[id] || null, querySelector: s => (s === '.top' ? top : null) },
  };
  win.window = win;
  const ctx = vm.createContext(win);
  ctx.Math = Math;
  let err = null;
  try { vm.runInContext(scrM ? scrM[1] : '', ctx); } catch (e) { err = e; }
  const click = (go) => {
    const btn = { getAttribute: () => go };
    try { listener && listener({ target: { closest: s => (/data-aw-go/.test(s) && go ? btn : null) } }); return null; } catch (e) { return e; }
  };
  return { log, err, click, hasListener: !!listener };
}
{
  const r = run();
  ok(!r.err && r.hasListener, '스크립트가 예외 없이 돌고 클릭을 듣는다');
  ok(r.click('picCard') === null && r.log.scroll[0] === 900 + 100 - 70, '① 누르면 그 칸이 «머리줄 아래» 에 오도록 스크롤한다 (' + r.log.scroll[0] + ')');
  ok(r.log.focus.length === 0, '짝: ① 은 포커스를 뺏지 않는다(폰 키보드가 안 뜸)');
  r.click('goCard');
  ok(r.log.scroll[1] === 1700 + 100 - 70 && r.log.focus.length === 0, '② 누르면 브레인스토밍 칸으로 · 포커스 없음');
  r.click('text');
  ok(r.log.scroll[2] === 2300 + 100 - 70, '③ 누르면 글쓰기 칸으로 스크롤');
  ok(r.log.focus.length === 1 && r.log.focus[0][0] === 'text' && r.log.focus[0][1] && r.log.focus[0][1].preventScroll === true, '③ 은 글쓰기 칸에 포커스(preventScroll — 스크롤은 위에서 한 번만)');
  const n = r.log.scroll.length;
  ok(r.click('') === null && r.log.scroll.length === n, '짝: 단계 밖을 누르면 아무 일도 안 한다');
}
{
  const r = run({ drop: 'goCard' });
  ok(r.click('goCard') === null && r.log.scroll.length === 0, '갈 칸이 없으면 던지지 않고 조용히 돌아간다');
}
const code = (scrM ? scrM[1] : '').replace(/\/\*[\s\S]*?\*\//g, '');
ok(!/setInterval|MutationObserver/.test(code), '상주 타이머·관찰자 없음');

console.log('─'.repeat(66));
console.log('결과: PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
