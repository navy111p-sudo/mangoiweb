// -*- coding: utf-8 -*-
// 📝📊 「오늘 수업일지」와 「월간 성적표」 — 이름 짝 맞음 · 점수 만점 감시   (2026-09-04)
//
//   왜 필요한가 —
//     사장님: 「평가서와 리포트는 같은 거야 다른 거야? 이게 둘다 뭐지 들어가보니 이상해」
//
//     코드로 확인해 보니 —
//       ① 이름이 둘 다 «성적 종이» 라는 뜻이라 타일만 보고는 차이를 알 수 없었다
//          (실제로는 낱장 /eval.html 과 한 달치 합본 /report.html)
//       ② 점수 만점 표기가 틀렸다 — report.html 이 「/10」으로 못 박아 두었는데
//          `student_evaluations.score_overall` 은 **한 칸에 두 척도** 다:
//            · 강사 1분 수업일지(/api/eval/create · bulk-create) … 1~5
//            · AI 수업 리포트(/api/eval/ai-lesson-report)         … 0~100
//          2026-09-04 운영 D1 실측: 1~5 행 3건 · 0~100 행 2건. 「/10」은 어느 쪽도 아니다.
//       ③ 그 탓에 eval.html 목록이 0~100 행에서 **RangeError 로 통째로 안 그려졌다**
//          ('☆'.repeat(5 - 88) → RangeError: Invalid count value: -83 — 실측)
//
//   이 하니스가 못 박는 것 — «여러 곳이 서로 같은 말을 하는가»
//     전체메뉴 타일(idx-allmenu.js) · 화면 제목(eval.html·report.html) ·
//     홈 검색 라벨(idx-ai-home.js) · 사이트 구성표.
//     ⚠️ 한 곳만 고치면 에러 없이 어긋난다 — 그때가 바로 이 제보가 다시 올라오는 때다.
//
//   ⛔ 검사를 «그 글자가 파일에 있는가» 로 쓰지 않는다 —
//      만점 계산은 두 화면에서 **함수를 오려 내 실제로 돌려** 같은 답을 내는지 본다.
//
//   실행: node test-harness/eval_report_naming_harness.mjs
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const rd = (p) => { try { return readFileSync(resolve(__dir, p), 'utf8'); } catch { return ''; } };
const PUB = '../cloudflare-deploy/public';

let pass = 0, fail = 0;
const ok = (m, c, extra = '') => { c ? (pass++, console.log('  ✅ ' + m)) : (fail++, console.log('  ❌ ' + m + (extra ? '  → ' + extra : ''))); };

// 주석을 벗긴 사본 — 부정 검사가 «왜 그렇게 했는지» 적어 둔 내 주석을 잡지 않게(CLAUDE.md 2장).
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '').replace(/<!--[\s\S]*?-->/g, '');

const menu   = rd(`${PUB}/js/idx-allmenu.js`);
const home   = rd(`${PUB}/js/idx-ai-home.js`);
const evalH  = rd(`${PUB}/eval.html`);
const report = rd(`${PUB}/report.html`);
const map    = rd(`${PUB}/admin/site-structure-map.html`);

const KO_EVAL = '오늘 수업일지';
const KO_REP  = '월간 성적표';

console.log('\n📝📊 수업일지·성적표 이름 짝 맞음 감시');

// ── ① 전체메뉴 타일이 정본이다 ─────────────────────────────────────
console.log('\n① 전체메뉴 타일');
const tile = (url) => {
  // 그 url 을 가진 항목 하나를 통째로 잘라 낸다(중괄호 짝 — 길이로 자르면 옆 항목이 딸려 온다)
  const i = strip(menu).indexOf(`url:'${url}'`);
  if (i < 0) return null;
  const s = strip(menu).lastIndexOf('{', i);
  const e = strip(menu).indexOf('}', i);
  return s < 0 || e < 0 ? null : strip(menu).slice(s, e + 1);
};
const tEval = tile('/eval.html'), tRep = tile('/report.html');
ok('타일 두 개가 있다', !!tEval && !!tRep);
ok(`수업일지 타일 이름이 「${KO_EVAL}」`, !!tEval && tEval.includes(`name:'${KO_EVAL}'`), tEval || '');
ok(`성적표 타일 이름이 「${KO_REP}」`, !!tRep && tRep.includes(`name:'${KO_REP}'`), tRep || '');
ok('두 타일에 EN 이름이 있다(EN 화면에서 한국어로 남지 않는다)',
   !!tEval && /\ben:\s*["']/.test(tEval) && !!tRep && /\ben:\s*["']/.test(tRep));
// 라벨은 «글자만 담은 span» 에 달아야 한다 — <a> 나 아이콘에 달면 두 i18n 엔진이
// textContent 를 통째로 갈아끼워 사진이 사라진다(CLAUDE.md 2장 「아이콘 버튼에 달았더니」).
ok('data-ko/data-en 을 라벨 span 에만 단다(아이콘·<a> 에는 안 단다)',
   /<span data-ko="' \+ m\.name \+ '" data-en="' \+ m\.en \+ '">/.test(menu)
   && !/class="mgam-card"[^\n]*data-ko=/.test(strip(menu)));
ok('EN 일 때 EN 글자를 그린다', /allmenuIsEn\(\)\s*\?\s*m\.en\s*:\s*m\.name/.test(strip(menu)));

// ── ② 화면 제목이 타일과 같은 말을 한다 ─────────────────────────────
console.log('\n② 화면 제목이 타일과 같은 말을 하는가');
ok(`eval.html <title> 이 「${KO_EVAL}」`, new RegExp(`<title>${KO_EVAL}`).test(evalH));
ok(`eval.html 머리글이 「${KO_EVAL}」`, new RegExp(`class="brand-sub"[^>]*>${KO_EVAL}<`).test(evalH));
ok(`report.html <title> 이 「${KO_REP}」`, new RegExp(`<title>${KO_REP}`).test(report));
ok(`report.html 머리글이 「${KO_REP}」`, new RegExp(`id="report-title">${KO_REP}<`).test(report));
ok('두 화면 다 옛 이름(학습 평가서 · 월별 학습 보고서)이 안 남아 있다',
   !/학습 평가서|월별 학습 보고서/.test(strip(evalH) + strip(report)));

// ── ③ 홈 검색 — 새 이름으로 부르되 «옛 말로 찾던 사람» 을 버리지 않는다 ──
console.log('\n③ 홈 검색(옛 낱말을 버리지 않았는가)');
const entry = (url) => {
  const s = strip(home);
  const i = s.indexOf(`location.href='${url}'`);
  if (i < 0) return null;
  const a = s.lastIndexOf('{', i), b = s.indexOf('\n', i);
  return a < 0 ? null : s.slice(a, b);
};
const eEval = entry('/eval.html'), eRep = entry('/report.html');
ok('검색 항목 두 개가 있다', !!eEval && !!eRep);
ok(`수업일지 라벨이 「${KO_EVAL}」`, !!eEval && eEval.includes(KO_EVAL), eEval || '');
ok(`성적표 라벨이 「${KO_REP}」`, !!eRep && eRep.includes(KO_REP), eRep || '');
// ⛔ 옛 낱말을 kws 에서 빼면 그 말로 찾던 사람이 못 찾는다 — 이름을 바꾼 값이 여기서 치러진다.
ok('옛 낱말 「평가서」로도 찾을 수 있다', !!eEval && /'평가서'/.test(eEval));
ok('옛 낱말 「리포트」로도 찾을 수 있다', !!eRep && /'리포트'/.test(eRep));
ok('새 낱말 「수업일지」로도 찾을 수 있다', !!eEval && /'수업일지'/.test(eEval));
ok('새 낱말 「성적표」로도 찾을 수 있다', !!eRep && /'성적표'/.test(eRep));

// ── ④ 사이트 구성표도 같은 말을 한다 ───────────────────────────────
console.log('\n④ 사이트 구성표');
ok('구성표의 /report.html 잎이 「월간 성적표」', /">월간 성적표<span class="p">\/report\.html/.test(map));
ok('구성표의 /eval.html 잎에 옛 이름(평가표)이 없다',
   !/">[^<]*평가표[^<]*<span class="p">\/eval\.html/.test(map));

// ── ⑤ 점수 만점 — 문자열이 아니라 «돌려서» 확인한다 ──────────────────
console.log('\n⑤ 점수 만점(두 화면이 같은 답을 내는가)');
const cut = (src, name) => {
  const m = src.match(new RegExp(`function ${name}\\(v\\)\\s*\\{[^}]*\\}`));
  return m ? m[0] : null;
};
const fEval = cut(evalH, 'evalMax'), fRep = cut(report, 'evalMax');
ok('eval.html 에 evalMax() 가 있다', !!fEval);
ok('report.html 에 evalMax() 가 있다', !!fRep);
if (fEval && fRep) {
  const a = new Function(`${fEval}; return evalMax;`)();
  const b = new Function(`${fRep}; return evalMax;`)();
  // 2026-09-04 운영 D1 에 실제로 들어 있는 값 + 경계값
  const cases = [[5, 5], [4, 5], [1, 5], [88, 100], [84, 100], [90, 100], [0, 5], [null, 5], [undefined, 5]];
  let same = true, right = true, bad = '';
  for (const [v, want] of cases) {
    if (a(v) !== b(v)) { same = false; bad += ` ${v}:${a(v)}≠${b(v)}`; }
    if (a(v) !== want) { right = false; bad += ` ${v}→${a(v)}(기대 ${want})`; }
  }
  ok('두 화면의 만점 판정이 «같은 답» 을 낸다', same, bad);
  ok('1~5 행은 만점 5 · 0~100 행은 만점 100 으로 읽는다', right, bad);
}
// ⛔ 「/10」은 두 척도 어느 쪽도 아니다 — 되살아나면 학부모가 틀린 만점을 본다.
// 세부 점수(참여도·말하기 …)도 만점이 하나가 아니다 — AI 리포트 행은 0~100 이라 「90 / 5」가 된다.
ok('eval.html 세부 점수 막대가 「/ 5」를 못 박지 않는다', !/">\/ 5<\/span>/.test(strip(evalH)));
ok('eval.html 세부 점수 막대가 evalMax() 로 만점을 정한다', /const smax = evalMax\(value\)/.test(evalH) && /\/ \$\{smax\}/.test(evalH));
ok('report.html 에 「/10」 못박기가 없다', !/\$\{e\.score_overall\|\|0\}\/10/.test(strip(report)));
ok('report.html 이 만점을 evalMax() 로 그린다', /\/\$\{evalMax\(e\.score_overall\)\}/.test(report));

// ── ⑥ 별점 — 0~100 행에서 RangeError 로 목록이 통째로 안 그려지던 자리 ──
console.log('\n⑥ 별점(0~100 행에서 목록이 죽지 않는가)');
ok('목록 별점이 점수를 그대로 repeat() 하지 않는다',
   !/'★'\.repeat\(Math\.round\(e\.score_overall/.test(strip(evalH)));
ok('목록 별점이 stars(evalOn5(...)) 를 쓴다', /stars\(evalOn5\(e\.score_overall\)\)/.test(strip(evalH)));
const fStars = strip(evalH).match(/function stars\(n\)\s*\{[\s\S]*?\n  \}/);
const fOn5 = cut(evalH, 'evalOn5');
if (fStars && fOn5 && fEval) {
  const st = new Function(`${fEval}; ${fOn5}; ${fStars[0]}; return function(v){return stars(evalOn5(v));};`)();
  let threw = '';
  for (const v of [88, 84, 5, 0, null, 120]) { try { st(v); } catch (e) { threw += ` ${v}:${e.constructor.name}`; } }
  ok('88·84 같은 0~100 행에서도 별점이 안 던진다(옛 코드는 RangeError 였다)', !threw, threw);
  // 별은 언제나 5칸 — 88 이 들어와 88개가 되면 카드가 무너진다
  const cnt = (v) => (st(v).match(/[★☆]/g) || []).length;
  ok('별이 언제나 5칸이다', [88, 5, 0, 120].every((v) => cnt(v) === 5), [88, 5, 0, 120].map((v) => `${v}:${cnt(v)}`).join(' '));
} else {
  ok('stars()·evalOn5() 를 오려 낼 수 있다', false, '함수를 못 찾음 — 검사가 헛돌고 있다');
}

console.log(`\n📝📊 eval_report_naming_harness — PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
