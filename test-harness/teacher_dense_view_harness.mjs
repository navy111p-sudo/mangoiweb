// 🧾 교사 「오늘의 수업」 표 보기(PC) · 상세 숨기기 · 일지 미작성 칩 (2026-10-26)
// ─────────────────────────────────────────────────────────────────────────────
// 직원 제안(고밀도 표) + 보고서의 하이브리드안. 줄 마크업·버튼은 renderClasses 그대로 두고
// 배치만 바꾸는 설계라, 그 «분리» 가 지켜지는지와 칩 개수가 [일지 쓰기] 버튼 조건과 같은지를 본다.
// 실제 브라우저 무작위 검사는 test-harness/manual/teacher-dense-view-browser.mjs (수백 회).
// 변이시험: TEACHER_HTML=<사본>
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(process.env.TEACHER_HTML || resolve(ROOT, 'cloudflare-deploy/public/teacher.html'), 'utf8');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✅', name); }
  else { fail++; console.log('  ❌ FAIL', name, extra ? '— ' + String(extra).slice(0, 200) : ''); }
};
function fnBlock(t, name) {
  const s = t.indexOf('function ' + name + '(');
  if (s < 0) return '';
  let i = t.indexOf('{', s), d = 0, q = null;
  for (; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '{') d++;
    else if (c === '}') { d--; if (d === 0) return t.slice(s, i + 1); }
  }
  return '';
}
/** `@media(...)` 블록 본문 — 여는 줄부터 중괄호 짝까지 */
function mediaBlocks(css, head) {
  const out = []; let from = 0;
  for (;;) {
    const s = css.indexOf(head, from); if (s < 0) return out;
    let i = css.indexOf('{', s), d = 0;
    for (; i < css.length; i++) { if (css[i] === '{') d++; else if (css[i] === '}') { d--; if (!d) break; } }
    out.push(css.slice(s, i + 1)); from = i + 1;
  }
}

console.log('▶ 마크업 · 번역');
ok('보기 선택(#cls-view)과 상세 숨기기(#cls-lite)가 있다', /id="cls-view"/.test(html) && /id="cls-lite"/.test(html));
ok('보기 선택의 두 값(cards/table)이 EN/KO 라벨을 가진다',
  /value="cards" data-en="Cards" data-ko="카드"/.test(html) && /value="table" data-en="Table \(PC\)" data-ko="표 \(PC\)"/.test(html));
ok('상세 숨기기 라벨이 EN/KO', /data-en="Hide details[^"]*" data-ko="상세 숨기기[^"]*"/.test(html));

console.log('▶ CSS — 표 배치는 PC(900px 이상)에서만');
const css = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
const dense900 = mediaBlocks(css, '@media(min-width:900px)').filter(b => b.includes('cls-dense')).join('\n');
const outside = css.replace(/@media\(min-width:900px\)\{[\s\S]*?\n\}/g, '');
ok('그리드 줄 규칙이 900px 미디어 안에 있다', /#classes\.cls-dense \.cls\{display:grid/.test(dense900));
ok('(짝) 미디어 밖에는 그리드 줄 규칙이 없다 — 폰은 늘 카드', !/cls-dense \.cls\{display:grid/.test(outside));
ok('머리줄은 기본 숨김, PC 표에서만 grid', /\.cls-dhead\{display:none\}/.test(css) && /#classes\.cls-dense \.cls-dhead\{display:grid/.test(dense900));
ok('보기 선택 상자는 폰에서 숨는다', /\.cls-view-pc\{display:none !important\}/.test(css) && /\.cls-view-pc\{display:flex !important\}/.test(dense900));
ok('hover 는 색만 — 확대·이동 없음(1-3 규칙)', !/cls-dense[^{]*:hover\{[^}]*(transform|scale|translate)/.test(css));
ok('상세 숨기기는 목표·인수인계·지난 수업만 숨긴다(다른 방 경고·학부모 요청·일지 버튼은 남김)',
  /#classes\.cls-lite \.cls-goal,#classes\.cls-lite \.cls-hand,#classes\.cls-lite \.cls-prev\{display:none\}/.test(css)
  && !/cls-lite \.cls-(away|preq|extra)/.test(css));
ok('연기·보류·다른 방 줄은 hover 에도 제 배경을 지킨다', /\.cls:not\(\.cls-postponed\):not\(\.cls-hold\):not\(\.cls-away-row\):hover/.test(dense900));

console.log('▶ 분리 — 줄 그리기와 보기 설정이 엮이지 않는다');
const init = html.slice(html.indexOf('(function initClsView(){'), html.indexOf('})();', html.indexOf('(function initClsView(){')));
ok('initClsView 가 있다', init.length > 100);
ok('initClsView 는 renderClasses 를 부르지 않는다', !/renderClasses\s*\(/.test(init));
ok('renderClasses 는 보기 설정을 모른다(cls-dense/cls-lite 미참조)', !/cls-dense|cls-lite/.test(fnBlock(html, 'renderClasses')));
ok('localStorage 접근은 try 로 감싼다', /function load\(k\)\{ try \{ return localStorage\.getItem/.test(init) && /function save\(k, v\)\{ try \{ localStorage\.setItem/.test(init));
ok('저장값이 이상하면 카드로 떨어진다', /load\(KV\) === 'table' \? 'table' : 'cards'/.test(init));
ok('카드로 돌아가면 머리줄을 지운다', /if \(!box\.classList\.contains\('cls-dense'\) \|\| !first\)\{ if \(head\) head\.remove\(\); return; \}/.test(init));
ok('다시 그려져도 머리줄이 돌아온다(관찰자)', /new MutationObserver\(ensureHead\)\.observe\(box, \{ childList: true \}\)/.test(init));
ok('머리줄 문구가 EN/KO', /T\('Time', '시간'\)/.test(init) && /T\('Action', '작업'\)/.test(init));
ok('initClsView 는 applyLang·load 보다 먼저 돈다', html.indexOf('(function initClsView(){') < html.lastIndexOf('\n  applyLang();\n  paintOutbox();'));

console.log('▶ 일지 미작성 칩 — [일지 쓰기] 버튼 조건과 같은가 (실제 함수 실행)');
const ctx = { LANG: 'ko', EN() { return this.LANG !== 'ko'; } };
ctx.T = (en, ko) => (ctx.LANG !== 'ko' ? en : ko);
ctx.esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
vm.createContext(ctx);
vm.runInContext(fnBlock(html, 'clsStateOf') + '\n' + fnBlock(html, 'clsChipsHtml'), ctx);
const T0 = 1_800_000_000_000;
const row = (o) => Object.assign({ kind: 'class', class_state: 'scheduled', close_at_ts: T0 - 1000 }, o);
const nolog = (list) => { const m = String(ctx.clsChipsHtml(list, T0)).match(/data-chip="nolog">[^<]*?(\d+)</); return m ? +m[1] : 0; };
ok('끝났고 일지 없음 → 1', nolog([row({ class_state: 'done' })]) === 1);
ok('(짝) 일지를 썼으면 → 0', nolog([row({ class_state: 'done', eval_written: true })]) === 0);
ok('(짝) 아직 안 끝났으면 → 0', nolog([row({ close_at_ts: T0 + 60_000 })]) === 0);
ok('노쇼라도 끝났고 일지 없으면 → 1 (줄에 [일지 쓰기] 가 있다)', nolog([row({ class_state: 'no_show' })]) === 1);
ok('(짝) 취소 · 연기 · 보류 → 0 (그 줄엔 버튼이 없다)', nolog([row({ class_state: 'cancelled' }), row({ class_state: 'postponed' }), row({ absence_hold: true })]) === 0);
ok('(짝) LMS·샘플 줄은 세지 않는다', nolog([row({ kind: 'lms' }), row({ kind: 'demo' })]) === 0);
ok('여러 줄 합산', nolog([row({}), row({}), row({ eval_written: true }), row({ close_at_ts: T0 + 1 })]) === 2);
ok('0 이면 칩을 그리지 않는다', !/data-chip="nolog"/.test(ctx.clsChipsHtml([row({ eval_written: true })], T0)));
ok('한국어 라벨', /일지 미작성 1/.test(ctx.clsChipsHtml([row({})], T0)));
ctx.LANG = 'en';
ok('영어 라벨', /Log not written 1/.test(ctx.clsChipsHtml([row({})], T0)));
ok('칩을 누르면 [일지 쓰기] 줄로 간다', /k === 'nolog' \? '\.btn-eval'/.test(html));
ok('줄의 [일지 쓰기] 버튼 클래스가 btn-eval 그대로다(칩 이동 대상)', /class="btn btn-eval" type="button" data-eval=/.test(html));

console.log('▶ 문법');
let syntax = true;
for (const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) { try { new vm.Script(m[1]); } catch (e) { syntax = false; } }
ok('인라인 스크립트 전부 문법 통과', syntax);

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
