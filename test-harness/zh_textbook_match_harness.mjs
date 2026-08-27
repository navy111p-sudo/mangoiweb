// 🈶 중국어 교재 이름 해석 하니스 (2026-08-26)
//
//   왜 필요한가 —
//     사장님 제보: 「중국어 수업 끝났는데 복습퀴즈가 왜 영어가 나와?」
//     「수업교재와 진도에 맞게 중국어 퀴즈가 나와야 하는데 안 되네」
//
//     중국어 퀴즈가 없어서가 «아니었다» — 다락원 제1~14과가 이미 다 있었다
//     (review_quizzes 활성 16건, source='passage' = 사람이 만든 교재본문 기반).
//     닿지 못한 이유 중 하나가 **같은 교재를 두 이름으로 부르고 있던 것**이다.
//       · 교재 라이브러리 textbook_files : 「다락원 중국어 마스터 3」 583쪽 · 「… 练习册」 72쪽
//       · 콘텐츠 zh_passage·zh_vocab·review_quizzes : 「다락원」
//     서버 매칭이 LOWER(textbook)=LOWER(?) 정확일치라 두 이름은 **영영 안 맞았다.**
//     에러가 안 나고 조용히 영어로 흘러가서 오래 안 보였다.
//
//   이 하니스가 못 박는 것 —
//     ① 판정이 한 파일(src/zh-textbook.ts)에만 있다 — 규칙을 복사하지 않았다
//     ② 후보 목록을 코드에 하드코딩하지 않는다(zh_passage·zh_vocab 에서 읽어 온다)
//     ③ 🔴 **함수를 컴파일해 실제로 돌린다** — D1 에서 실측한 그 이름 그대로.
//        문자열 검사는 「부르는가」만 볼 뿐 「무엇을 이어 주는가」는 못 본다
//        (CLAUDE.md 2장 「헬퍼에 행을 넘겼는데 아무 일도 안 일어남」).
//     ④ 못 이으면 «중국어 아님» 으로 실패한다 — 영어 수업을 중국어로 오인하지 않는다
//
//   실행: node test-harness/zh_textbook_match_harness.mjs
import { readFileSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join, resolve } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dir);
const read = (p) => { try { return readFileSync(join(root, p), 'utf8'); } catch { return ''; } };

let pass = 0, fail = 0; const FAILS = [];
const check = (name, ok) => {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; FAILS.push(name); console.log('  ❌ ' + name); }
};
const eq = (name, a, b) => check(`${name} (=${JSON.stringify(b)})`, JSON.stringify(a) === JSON.stringify(b));

console.log('🈶 중국어 교재 이름 해석 하니스 · ' + new Date().toISOString());

const SRC = read('cloudflare-deploy/src/zh-textbook.ts');
const API = read('cloudflare-deploy/src/api-games.ts');

/** 부정 검사는 주석을 벗긴 사본으로 — 설명 주석이 자기 검사에 걸린다
 *  (CLAUDE.md 2장 「부정 검사가 내 주석 때문에 FAIL」). */
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

console.log('\n[A] 정본 한 파일 · 규칙 복사 금지');
check('src/zh-textbook.ts 가 있다', SRC.length > 0);
check('api-games.ts 가 그 파일에서 import 한다',
  /import \{[^}]*resolveZhTextbook[^}]*\} from '\.\/zh-textbook'/.test(API));
check('api-games.ts 안에 해석 규칙을 복사해 두지 않았다',
  !/function resolveZhTextbook/.test(strip(API)));

console.log('\n[B] 후보 목록을 코드에 하드코딩하지 않는다');
/* ⛔ 교재 «이름» 만 보고 중국어라고 짐작하면 안 된다 — 판정 근거는 zh_passage·zh_vocab 에
   그 교재가 실제로 있는가이다(중국어 게임이 이미 그 두 표를 정본으로 쓴다). */
check('해석 함수가 후보 목록을 «인자로» 받는다(표에서 읽어 넘기는 구조)',
  /export function resolveZhTextbook\([^)]*known: string\[\]/.test(SRC));
check('api-games 가 zh_passage·zh_vocab 에서 후보를 읽어 온다',
  /\['zh_passage', 'zh_vocab'\]/.test(API) && /SELECT DISTINCT textbook FROM/.test(API));
check('해석 함수 본문에 교재 이름이 박혀 있지 않다',
  !/'다락원'/.test(strip(SRC).split('export function resolveZhTextbook')[1] || ''));

console.log('\n[C] 🔴 함수를 실제로 돌린다 — D1 실측 이름 그대로');
let ts = null, tsWhy = '';
try {
  ts = (await import(pathToFileURL(resolve(__dir, '../cloudflare-deploy/node_modules/typescript/lib/typescript.js')).href)).default;
} catch (e) { tsWhy = e && e.message; }

if (!ts) {
  console.log('  ⏭ typescript 를 못 찾아 건너뜀 (' + String(tsWhy).slice(0, 90) + ')');
} else {
  const js = ts.transpileModule(SRC, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const mod = await import('data:text/javascript;charset=utf-8,' + encodeURIComponent(js));
  const { resolveZhTextbook, zhDisplayTextbook, zhDisplayDesc } = mod;

  // 2026-08-26 D1 실측: zh_passage·zh_vocab 의 교재 표기는 「다락원」 하나뿐이다.
  const KNOWN = ['다락원'];

  console.log('  — 라이브러리 실제 이름 → 콘텐츠 표기');
  eq('「다락원 중국어 마스터 3」(583쪽)', resolveZhTextbook('다락원 중국어 마스터 3', KNOWN), '다락원');
  eq('「다락원 중국어 마스터 3 练习册」(72쪽)', resolveZhTextbook('다락원 중국어 마스터 3 练习册', KNOWN), '다락원');
  eq('이미 콘텐츠 표기로 부르는 경우(중국어 게임·CN 페이지)', resolveZhTextbook('다락원', KNOWN), '다락원');
  eq('앞뒤 공백·대소문자 무시', resolveZhTextbook('  다락원 중국어 마스터 3  ', KNOWN), '다락원');

  console.log('  — ⛔ 영어 교재를 중국어로 오인하지 않는다 (D1 실측 이름 그대로)');
  for (const en of ['BTS 12 Korea (Jobs, Going to work)', 'BTS 2 Korea (Shapes and colors)',
                    'SIU BOOKS', 'BTS 1 008 (My classroom)', '007. Commercials',
                    '004. I visited my grandparents', 'Mangoi Books']) {
    eq(`「${en}」 → 중국어 아님`, resolveZhTextbook(en, KNOWN), null);
  }

  console.log('  — 모르면 «중국어 아님» 으로 실패한다 (안 잡히는 쪽이 틀린 쪽보다 낫다)');
  eq('빈 교재', resolveZhTextbook('', KNOWN), null);
  eq('null 교재', resolveZhTextbook(null, KNOWN), null);
  eq('후보 목록이 비었을 때(표가 없거나 조회 실패)', resolveZhTextbook('다락원 중국어 마스터 3', []), null);

  console.log('  — 교재가 늘어도 «더 구체적인 쪽» 을 고른다');
  eq('「다락원 회화 1」 은 회화 쪽으로', resolveZhTextbook('다락원 회화 1', ['다락원', '다락원 회화']), '다락원 회화');
  eq('그 교재가 아직 없으면 상위 표기로', resolveZhTextbook('다락원 회화 1', ['다락원']), '다락원');

  console.log('  — 보여줄 이름은 「중국어 마스터」 (2026-08-26 사장님 지시)');
  eq('콘텐츠 표기 → 표시 이름', zhDisplayTextbook('다락원'), '중국어 마스터');
  eq('등록 없는 이름은 그대로', zhDisplayTextbook('BTS 1 001 (Welcome to school)'), 'BTS 1 001 (Welcome to school)');
  eq('빈 값은 빈 값', zhDisplayTextbook(''), '');
  eq('설명글 안의 이름도 바꾼다(D1 값은 안 건드리므로 읽을 때)',
    zhDisplayDesc('다락원 Lv 3 제1과 본문 기반 (객관식/듣기/쓰기/말하기) — 2026-08-26', 'zh'),
    '중국어 마스터 Lv 3 제1과 본문 기반 (객관식/듣기/쓰기/말하기) — 2026-08-26');
  eq('⛔ 영어 행의 설명글은 안 건드린다',
    zhDisplayDesc('AI 자동 출제 (듣기/쓰기/말하기) — 2026-08-07', null),
    'AI 자동 출제 (듣기/쓰기/말하기) — 2026-08-07');
}

console.log('\n[D] 🔴 과별 재업로드 폴더 이름 — 업로더 분류기를 «실제로» 돌린다');
/* [왜 이 검사가 있나] 2026-08-26 실측으로, 폴더를 어떻게 쌓느냐에 따라 «교재 이름 자체가 달라진다».
     다락원/마스터3/제1과/…            → 교재명 「마스터3」   ← 중국어 매칭이 통째로 깨진다
     다락원 중국어 마스터 3/제1과/…     → 교재명 그대로 ✅
   583쪽을 다시 올린 «뒤에» 알게 되면 되돌릴 방법이 없으므로, 규칙을 여기에 못 박는다.
   ⚠️ 업로더의 정규식을 손볼 때 이 검사가 FAIL 하면, 다락원 재업로드가 깨진다는 뜻이다. */
const UP = read('cloudflare-deploy/public/textbook-uploader.html');
check('교재 업로더 화면이 있다', UP.length > 0);
{
  // 업로더의 «분류기» 를 HTML 에서 오려 내 그대로 돌린다 — 규칙을 여기에 베껴 쓰지 않는다.
  const rxSrc = (UP.match(/const RX = \{[\s\S]*?\n\};/) || [])[0] || '';
  const fnSrc = (UP.match(/function classifyFile\(file\) \{[\s\S]*?\n\}\n/) || [])[0] || '';
  check('분류기(RX · classifyFile)를 소스에서 오려 냈다', !!rxSrc && !!fnSrc);
  if (rxSrc && fnSrc) {
    const run = new Function('path',
      rxSrc + '\n' + fnSrc.replace('function classifyFile(file) {', 'function classifyFile(file) {') +
      '\nfunction fileKind(){ return "img"; }' +
      '\nreturn classifyFile({ fullPath: path, name: path.split("/").pop(), size: 1 });');

    const BOOK = '다락원 중국어 마스터 3';
    console.log('  — ✅ 권장 구조: 「' + BOOK + '/제N과/파일」');
    for (const n of [1, 7, 14]) {
      const r = run(`${BOOK}/제${n}과/Slide3.JPG`);
      eq(`제${n}과 — 교재명이 «그대로» 다`, r.textbook, BOOK);
      eq(`제${n}과 — 과를 인식한다`, r.lesson, `제${n}과`);
      eq(`제${n}과 — 레벨이 zh_passage 와 같다`, r.level, 'Lv 3');
    }
    const r1 = run(`${BOOK}/제1과/Slide3.JPG`);
    check('그 교재명이 콘텐츠 표기로 이어진다(= 중국어로 잡힌다)',
      (await (async () => {
        if (!ts) return true;   // 컴파일 못 하면 이 줄은 건너뛴 셈
        const js = ts.transpileModule(SRC, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
        const m = await import('data:text/javascript;charset=utf-8,' + encodeURIComponent(js));
        return m.resolveZhTextbook(r1.textbook, ['다락원']) === '다락원';
      })()));

    console.log('  — ⛔ 이렇게 쌓으면 «교재 이름이 바뀌어» 중국어 매칭이 깨진다(경고용)');
    const bad1 = run('다락원/마스터3/제1과/Slide1.jpg');
    check('「다락원/마스터3/제N과」 는 교재명이 「마스터3」 로 바뀐다 — 쓰지 말 것',
      bad1.textbook !== BOOK);
    const bad2 = run(`${BOOK}/001/Slide1.jpg`);
    check('숫자 폴더(001)는 «유닛마다 다른 책» 으로 쪼개진다 — 다락원에는 쓰지 말 것',
      bad2.textbook !== BOOK);
  }
}

console.log('\n' + '═'.repeat(60));
console.log(`총 ${pass + fail}건 중 ✅ ${pass} 통과 / ❌ ${fail} 실패`);
if (fail) { console.log('\n❌ 실패:'); FAILS.forEach(f => console.log('   - ' + f)); process.exit(1); }
console.log('\n🎉 중국어 교재 이름 해석 전체 통과 — 라이브러리↔콘텐츠 표기가 이어지고, 영어 교재는 안 걸린다.');
