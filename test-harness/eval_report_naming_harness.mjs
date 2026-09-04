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


// ── ⑦ 같은 척도 결함이 남아 있는 자리 — «고쳤다» 로 읽히지 않게 이름을 찍어 둔다 ──
//   ⛔ 이 절을 지우지 말 것. 이 저장소가 네 번 사고를 낸 「하기로 한 것이 «했다» 로 적힌다」의
//      방어선이다 — 옛 경로를 grep 하는 데 30초면 되는데, 안 적으면 다음 사람이 다시 안 본다.
//   ✅ 고친 자리는 «되살아나지 않는가» 로 못 박고, 못 고친 자리는 «사람 결정 대기» 로 출력만 한다
//      (선례: popup_open_return_harness — FAIL 로 만들면 무관한 PR 이 전부 빨간불이 된다).
console.log('\n⑦ 같은 척도 결함 — 고친 자리 · 남은 자리');
const parent = rd(`${PUB}/parent.html`);
const admR6  = rd(`${PUB}/js/adm-r6.js`);
// 🔴 화면 전체가 그려지는 «그릇» 에 data-ko/data-en 을 달면 i18n 엔진이 textContent 를
//    통째로 갈아끼워 **그린 내용이 사라진다**(2026-09-04 실제로 밟음 — 「불러오는 중…」에서 안 넘어갔다).
ok('#eval-root «자신» 에는 data-ko/data-en 이 없다(그릇에 달면 화면이 지워진다)',
   !/id="eval-root"[^>]*data-(ko|en)=/.test(evalH));
ok('로딩 문구는 안쪽 span 에 달려 있다', /id="eval-root"[^>]*><span data-ko=/.test(evalH));
// 학부모 대시보드의 만점 헬퍼가 «쓰기 전에 선언» 돼 있어야 한다(TDZ — 순서가 뒤바뀌면 그 자리에서 죽는다)
{
  const src = rd(`${PUB}/parent.html`);
  const dec = src.indexOf('const pdEvalMax');
  const use = src.indexOf('pdEvalMax(e.score_overall)');
  ok('parent.html 이 헬퍼를 쓰기 «전» 에 선언한다', dec >= 0 && use >= 0 && dec < use, `선언 ${dec} · 사용 ${use}`);
}
ok('학부모 대시보드(parent.html)에 「/10」이 없다', !/\$\{e\.score_overall\|\|0\}\/10/.test(strip(parent)));
ok('학부모 대시보드가 만점을 값에서 읽는다', /pdEvalMax\(e\.score_overall\)/.test(parent) && /> 5 \? 100 : 5/.test(parent));
ok('관리자 평가서 표(adm-r6.js)가 점수를 그대로 repeat() 하지 않는다',
   !/'★'\.repeat\(Math\.round\(overall\)\)/.test(strip(admR6)));
{
  // 실제로 돌려서 확인한다 — 88 이 들어오면 옛 코드는 RangeError 를 던졌다
  const m = strip(admR6).match(/const evMax = [\s\S]*?const stars = [^;]+;/);
  if (m) {
    const f = new Function('overall', `${m[0]} return stars;`);
    let threw = '';
    for (const v of [88, 84, 5, 0, null, 120]) { try { f(v); } catch (e) { threw += ` ${v}:${e.constructor.name}`; } }
    ok('관리자 표 별점이 0~100 행에서 안 던진다', !threw, threw);
    /* ⚠️ try/catch 로 감싼다 — 되돌리면 f(88) 이 던지는데, 안 감싸면 하니스가 스택트레이스만
     *   남기고 죽어 «무엇이 깨졌는지» 가 안 보인다(CLAUDE.md: 하니스를 크래시시키지 말 것). */
    let five = true, err5 = '';
    for (const v of [88, 5, 0, 120]) {
      try { if ((f(v).match(/[★☆]/g) || []).length !== 5) { five = false; err5 += ` ${v}:${(f(v).match(/[★☆]/g) || []).length}칸`; } }
      catch (e) { five = false; err5 += ` ${v}:${e.constructor.name}`; }
    }
    ok('관리자 표 별점이 언제나 5칸이다', five, err5);
  } else ok('adm-r6.js 별점 블록을 오려 낼 수 있다', false, '못 찾음 — 검사가 헛돈다');
}
// 성적표 「평균 점수」 — 섞인 달이면 «모른다» 고 말해야 한다
{
  const m = report.match(/function avgLabel\(ev\)\{[\s\S]*?\n\}/);
  if (m) {
    const f = new Function(`${cut(report, 'evalMax')}; ${m[0]}; return avgLabel;`)();
    const mixed = { avg_score: 46.5, items: [{ score_overall: 5 }, { score_overall: 88 }] };
    const pure5 = { avg_score: 4.7, items: [{ score_overall: 5 }, { score_overall: 4 }] };
    ok('두 척도가 섞인 달은 평균을 «—» 로 가린다', f(mixed) === '—', String(f(mixed)));
    ok('한 척도뿐인 달은 평균에 만점을 붙여 보여 준다', /4\.7/.test(String(f(pure5))) && /\/5/.test(String(f(pure5))), String(f(pure5)));
  } else ok('report.html avgLabel() 을 오려 낼 수 있다', false, '못 찾음 — 검사가 헛돈다');
}
// 🟡 아직 안 고친 자리 — 출력만 한다(사람이 정할 일)
const REMAIN = [
  // ⚠️ 세는 정규식이 실제와 어긋나면 그것도 같은 병이다 — 「N곳」이 거짓말이 된다.
  //    2026-09-04 실측: teacher.html 1538·2715 두 곳, monthly-report.html 164 한 곳(163 은 주석).
  ['public/teacher.html', /\+ '\/5/g, '강사 화면 지난 수업·초안 배지 「⭐ N/5」 — 0~100 행이면 「88/5」'],
  ['public/monthly-report.html', /Number\(r\.score_overall\)/g, '월간 리포트 추이 그래프가 5점 만점을 전제로 선을 그린다'],
  ['src/api-admin.ts', /종합 \$\{c\.score_overall\|\|'-'\}\/5점/g, 'AI 월간 리포트 프롬프트에 「종합 88/5점」이 그대로 실려 모델에 들어간다'],
];
let remainFound = 0;
for (const [rel, re, why] of REMAIN) {
  const src = rd(`../cloudflare-deploy/${rel}`);
  const n = (src.match(re) || []).length;
  if (n) { remainFound++; console.log(`  🟡 남은 자리 — ${rel} (${n}곳): ${why}`); }
}
console.log(`  ℹ️ 위 ${remainFound}개는 «사람 결정 대기» 입니다. 고쳤으면 이 목록에서 빼세요(FAIL 로 만들지 않습니다).`);

console.log(`\n📝📊 eval_report_naming_harness — PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
