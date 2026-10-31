// 재무제표(손익·재무상태·현금흐름·시산) — 2026-10-09
//  ① 자료가 온전하지 않은 기간(진행 중·연동 전)은 서버가 coverage 를 싣고 화면·PDF 가 «참고값» 경고를 그린다
//  ② 서버 notes(재무상태표 «완전한 표가 아님» · 시산표 차대 일치 등)가 화면·PDF 에 실제로 나온다
//  ③ 현금흐름표의 «장비 구매 = 매출×2%» 지어낸 숫자를 다시 넣지 않는다
//  ④ 월 선택칸이 HTML 고정값(2026-04)에 머물지 않고 «지난달» 로 시작한다
// 함수를 소스에서 중괄호 짝으로 오려 내 실제로 돌린다.
import { readFileSync } from 'node:fs';
const root = new URL('..', import.meta.url).pathname;
const SRV = readFileSync(root + 'cloudflare-deploy/src/accounting-reports.ts', 'utf8');
const CLI = readFileSync(root + 'cloudflare-deploy/public/js/adm-core.js', 'utf8');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✅', n); } else { fail++; console.log('  ❌ FAIL', n); } };

function braceBlock(src, start) {            // start = 여는 { 위치
  let d = 0;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') d++;
    else if (ch === '}') { d--; if (d === 0) return src.slice(start, i + 1); }
  }
  return '';
}
function fnBody(src, sig) {
  const i = src.indexOf(sig); if (i < 0) return '';
  return braceBlock(src, src.indexOf('{', i));
}
const stripComments = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

console.log('① 서버 — coverage');
const sr = fnBody(SRV, 'async function statementReport(');
ok('전제: statementReport 를 오려 냈다', sr.length > 2000);
const covStart = sr.indexOf('const fsStarts');
const covEnd = sr.indexOf('};', sr.indexOf('const coverage = {', covStart)) + 2;
const covCode = sr.slice(covStart, covEnd).replace(/ as string/g, '').replace(/: Record<string, number>/g, '');
ok('전제: coverage 계산 블록을 오려 냈다', covStart > 0 && covEnd > covStart);
function runCov(months, levels) {
  const fake = Object.fromEntries(months.map((m, i) => [m, { level: levels[i], note: 'N' + m }]));
  const f = new Function('months', 'syncStarts', 'coverageOf', 'env', 'return (async()=>{' + covCode.replace('await syncStarts(env)', 'syncStarts()') + '; return coverage; })()');
  return f(months, () => ({}), (m) => fake[m], {});
}
const c1 = await runCov(['2026-09'], ['full']);
ok('온전한 달 → full · note 비움', c1.level === 'full' && c1.note === '');
const c2 = await runCov(['2026-10'], ['partial']);
ok('진행 중인 달 → partial + 이유', c2.level === 'partial' && c2.note === 'N2026-10');
const c3 = await runCov(['2026-04', '2026-05', '2026-06'], ['none', 'partial', 'full']);
ok('분기 — 가장 나쁜 달(none)을 따른다', c3.level === 'none');
ok('분기 — 온전하지 않은 달마다 이유(달 이름 포함)', c3.note.includes('2026-04: N2026-04') && c3.note.includes('2026-05: N2026-05') && !c3.note.includes('2026-06'));
const c4 = await runCov(['2026-10', '2026-11', '2026-12'], ['partial', 'future', 'future']);
ok('분기 — 미래 달이 끼면 full 이 아니다', c4.level !== 'full');
const afterElse = sr.slice(sr.indexOf("unknown type: "));
ok('응답(json·csv) 직전에 data.coverage = coverage', /data\.coverage\s*=\s*coverage/.test(afterElse.slice(0, 400)));

console.log('③ 현금흐름표 — 지어낸 숫자 없음');
const srNC = stripComments(sr);
ok('«매출 × 0.02» 장비 추정이 없다', !/revenue\s*\*\s*0\.02/.test(srNC));
ok('장비 구매 줄이 «자료없음» 이라고 말한다', /장비 구매 — 자료없음/.test(sr));
ok('현금흐름표에 통장 실제 흐름 참고 섹션', (sr.match(/통장 기준 실제 현금흐름/g) || []).length >= 2);

console.log('② 화면·PDF — 경고와 안내문');
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const exSrc = fnBody(CLI, 'function _fsExtras(');
const ntSrc = fnBody(CLI, 'function _fsNotes(');
ok('전제: _fsExtras·_fsNotes 를 오려 냈다', exSrc && ntSrc);
let fx, fn;
try {
  fx = new Function('_esc', 'd', 'where', exSrc.slice(1, -1));
  fn = new Function('_esc', 'd', ntSrc.slice(1, -1));
} catch (e) { ok('오려 낸 함수가 문법상 돈다: ' + e.message, false); }
try {
  ok('partial 이면 참고값 경고', /참고값/.test(fx(esc, { coverage: { level: 'partial', note: '진행 중<b>' } }, 'top')));
  ok('경고 안 note 를 이스케이프', fx(esc, { coverage: { level: 'partial', note: '<b>' } }, 'top').includes('&lt;b&gt;'));
  ok('full 이면 경고 없음(짝)', fx(esc, { coverage: { level: 'full', note: '' } }, 'top') === '');
  ok('coverage 없는 옛 응답이면 경고 없음', fx(esc, {}, 'top') === '');
  const nh = fn(esc, { notes: ['완전한 재무상태표가 아닙니다', '차변과 대변이 일치합니다'] });
  ok('notes 를 둘 다 그린다', nh.includes('완전한 재무상태표가 아닙니다') && nh.includes('차변과 대변이 일치합니다'));
  ok('notes 없으면 빈 문자열(짝)', fn(esc, {}) === '');
} catch (e) { ok('실행 중 예외: ' + e.message, false); }
const gen = fnBody(CLI, 'window.accGenStatement = async function(');
const pdf = fnBody(CLI, 'window.accStatementPdf = async function(');
ok('전제: 화면·PDF 함수를 오려 냈다', gen.length > 200 && pdf.length > 200);
ok('화면이 _fsExtras·_fsNotes 를 부른다', /_fsExtras\(d/.test(gen) && /_fsNotes\(d\)/.test(gen));
ok('PDF 도 _fsExtras·_fsNotes 를 부른다', /_fsExtras\(d/.test(pdf) && /_fsNotes\(d\)/.test(pdf));

console.log('④ 월 기본값');
const di = CLI.indexOf("const mEl = document.getElementById('acc-fs-month');\n    if (!mEl || mEl.value !== mEl.defaultValue) return;");
ok('전제: 기본값 절을 찾았다', di > 0);
const initFn = braceBlock(CLI, CLI.lastIndexOf('{', di));
function runInit(today, value, defaultValue) {
  const el = { value, defaultValue };
  new Function('document', '_today', initFn.slice(1, -1))({ getElementById: () => el }, () => today);
  return el.value;
}
ok('10월 9일 → 2026-09', runInit('2026-10-09', '2026-04', '2026-04') === '2026-09');
ok('1월 → 전해 12월', runInit('2027-01-05', '2026-04', '2026-04') === '2026-12');
ok('사람이 이미 바꿨으면 안 건드린다(짝)', runInit('2026-10-09', '2026-07', '2026-04') === '2026-07');

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
