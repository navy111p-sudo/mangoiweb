// 🧾 카페24 지출결의 — «우리 것이 아닌» 건 제외 하니스 (2026-08-24)
//
//   왜 필요한가 —
//     관리자 「정산·매출 ▸ 회계 ▸ 🧾 카페24 회계 실데이터 ▸ 🧾 지출결의」 탭은 카페24
//     그래프DB `ExpenseReport` 를 그대로 보여 준다. 그런데 그 노드에는 **망고아이와 무관한
//     다른 조직의 지출품의서가 함께 쌓인다**(「정기휴가/개인사정」·「유치부 야외활동 매트」…).
//     사장님이 알려 주신 판별법은 둘 — ① 결재라인에 「Joy」·「박상인」 ② 제목·문구가 한글.
//     필리핀 강사들이 올리는 우리 결재는 전부 영어다.
//
//   이 하니스가 못 박는 것 —
//     ① 판정이 한 파일(src/c24-expense-filter.ts)에만 있다 — API·화면에 규칙을 복사하지 않았다
//     ② TS 정규식과 Cypher(Java) 정규식이 짝이다 (한쪽만 고치면 FAIL)
//     ③ 최종 판정은 TS 가 한다 — Cypher 는 «먼저 덜어내기» 일 뿐 (그래서 헛돌아도 결과가 안 틀린다)
//     ④ 결재라인 속성 이름을 모르므로 properties(d) 를 통째로 받아 훑는다
//     ⑤ 🔴 **판정 함수를 컴파일해 실제로 돌린다** — 사장님 화면의 실제 행 모양 그대로 넣어 본다.
//        문자열 검사는 「함수를 부르는가」만 볼 뿐, 「무엇을 버리는가」는 못 본다.
//
//   실행: node test-harness/c24_expense_filter_harness.mjs
import { readFileSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join, resolve } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dir);
const read = (p) => readFileSync(join(root, p), 'utf8');

let pass = 0, fail = 0;
const check = (name, ok) => { if (ok) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name); } };

/** 부정 검사(«이 단어가 없어야 한다»)는 주석을 벗긴 사본으로 — 설명 주석이 자기 검사에 걸린다.
 *  (CLAUDE.md 2장 「하니스에 부정 검사를 넣었는데 내 주석 때문에 FAIL」) */
//    ⚠️ 줄 «끝» 에 붙은 주석도 벗겨야 한다 — import 줄 뒤 설명 주석에 그 이름을 적기만 해도 걸린다.
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const filterSrc = read('cloudflare-deploy/src/c24-expense-filter.ts');
const adminSrc  = read('cloudflare-deploy/src/api-admin.ts');
const coreSrc   = read('cloudflare-deploy/public/js/adm-core.js');

console.log('\n[ ① 판정 정본이 한 파일에 있다 ]');
check('src/c24-expense-filter.ts 가 있고 c24ExpenseDrop 을 내보낸다',
  /export function c24ExpenseDrop/.test(filterSrc));
check('api-admin 이 그 정본을 import 해서 쓴다',
  /import\s*\{[^}]*c24ExpenseDrop[^}]*\}\s*from\s*'\.\/c24-expense-filter'/.test(adminSrc)
  && /c24ExpenseDrop\(/.test(strip(adminSrc)));
check('⛔ 화면(adm-core.js)에는 판정 규칙을 복사하지 않았다 (건수만 표시)',
  !/박상인/.test(strip(coreSrc)) && !/\\bjoy\\b/i.test(strip(coreSrc)));
check('⛔ api-admin 이 판정 규칙을 직접 다시 쓰지 않았다 (정본만 부른다)',
  !/박상인/.test(strip(adminSrc)));

console.log('\n[ ② TS 정규식과 Cypher(Java) 정규식이 짝이다 ]');
check('한글 판정 — TS 문자범위와 Cypher 문자범위가 같다',
  /\[가-힣ㄱ-ㅎㅏ-ㅣ\]/.test(filterSrc)
  && /C24_HANGUL_CYPHER_RE\s*=\s*'\(\?s\)\.\*\[가-힣ㄱ-ㅎㅏ-ㅣ\]\.\*'/.test(filterSrc));
check('글자 판정 — TS·Cypher 둘 다 라틴+한글 범위다',
  /C24_LETTER_CYPHER_RE\s*=\s*'\(\?s\)\.\*\[A-Za-z가-힣ㄱ-ㅎㅏ-ㅣ\]\.\*'/.test(filterSrc));
check('⛔ 유니코드 속성 대신 문자범위를 쓴다 (Neo4j·JDK 판마다 지원이 갈린다)',
  !/\\p\{Is?Hangul\}/.test(strip(filterSrc)));
check('결재자 이름 정본이 한 곳에 모여 있다 (Joy · 박상인)',
  /C24_FOREIGN_APPROVERS\s*=\s*\['Joy',\s*'박상인'\]/.test(filterSrc));

console.log('\n[ ③ Cypher 는 «먼저 덜어내기», 최종 판정은 TS ]');
const cypherLine = (adminSrc.match(/expenses:\s*`[\s\S]*?`/) || [''])[0];
check('expenses Cypher 가 한글 제목 행을 미리 뺀다',
  /\$c24HangulRe/.test(cypherLine) && /\$c24LetterRe/.test(cypherLine));
check('제목에 글자가 없을 때만 내용으로 판정한다 (CASE 로 짝지음)',
  /CASE WHEN coalesce\(d\.name,''\) =~ \$c24LetterRe THEN coalesce\(d\.name,''\) ELSE coalesce\(d\.content,''\) END/.test(cypherLine));
check('그래도 TS 가 모든 행을 한 번 더 판정한다 (Cypher 만 믿지 않는다)',
  /for \(const r of rows\)[\s\S]{0,400}c24ExpenseDrop\(/.test(strip(adminSrc)));
check('두 정규식을 실제로 Cypher 파라미터로 넘긴다',
  /c24HangulRe:\s*C24_HANGUL_CYPHER_RE/.test(adminSrc) && /c24LetterRe:\s*C24_LETTER_CYPHER_RE/.test(adminSrc));

console.log('\n[ ④ 결재라인 속성 이름을 모르므로 통째로 받아 훑는다 ]');
check('Cypher 가 properties(d) 를 함께 받는다',
  /properties\(d\)\s+AS\s+props/.test(cypherLine));
check('응답에 넣기 전에 props 를 지운다 (화면이 안 쓰는 원본 뭉치)',
  /delete \(r as Record<string, unknown>\)\.props/.test(adminSrc));
check('제외 건수를 응답에 담는다 (건수가 원본과 다른 것이 고장으로 오인되지 않게)',
  /filtered_out:\s*filteredOut/.test(adminSrc));
check('화면이 그 건수를 보여 준다',
  /filtered_out/.test(coreSrc) && /지출품의/.test(coreSrc));
check('⛔ 다른 탭(장부·급여·세금·예치금)에는 이 필터를 걸지 않았다',
  /kind === 'expenses'/.test(adminSrc)
  && !/QMAP\.ledger[\s\S]{0,80}c24ExpenseDrop/.test(adminSrc));

/* 🔴 ⑤ 여기가 핵심이다 — 위 문자열 검사는 「부르는가」만 본다. 「무엇을 버리는가」는
   함수를 실제로 돌려야만 보인다(CLAUDE.md 2장 「헬퍼에 행을 넘겼는데 아무 일도 안 일어남」).
   ⚠️ typescript 는 cloudflare-deploy/node_modules 에 있다(ci-gates.sh 전제: npm ci 가 먼저 돈다).
      없으면 이 묶음만 건너뛴다 — 하니스 전체가 죽는 것이 더 나쁘다. */
console.log('\n[ ⑤ 판정 함수를 컴파일해 실제 행 모양으로 돌려 본다 ]');
let mod = null, tsWhy = '';
try {
  const ts = (await import(pathToFileURL(resolve(__dir, '../cloudflare-deploy/node_modules/typescript/lib/typescript.js')).href)).default;
  const js = ts.transpileModule(filterSrc, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  mod = await import('data:text/javascript;base64,' + Buffer.from(js, 'utf8').toString('base64'));
} catch (e) { tsWhy = e.message; }

if (!mod) {
  console.log('  ⏭ typescript 를 못 찾아 건너뜀 (' + String(tsWhy).slice(0, 80) + ')');
} else {
  const drop = (row) => mod.c24ExpenseDrop(row).drop;

  // ── 사장님 화면에 실제로 찍혀 있던 행들 (2026-08-24 스크린샷) ──
  console.log('  · 남의 것 — 한글 제목');
  check('「정기휴가 / 개인사정」 은 뺀다',
    drop({ name: '정기휴가', content: '개인사정' }));
  check('「유치부 야외 활동 매트 및 교사용 생수 구매」 는 뺀다',
    drop({ name: '유치부 야외 활동 매트 및 교사용 생수 구매', content: '유치부 야외활동 매트 물놀이장 교사용 생수' }));
  check('「약품구입 지품의 올립니다」 는 뺀다',
    drop({ name: '약품구입 지품의 올립니다', content: '<쿠팡 구매 목록입니다> 네오밴드(표준형)80매' }));
  check('「장부장 선지출 (에밀리 비자)」 는 뺀다',
    drop({ name: '장부장 선지출 (에밀리 비자)', content: '장부장 선지출 (에밀리 비자) 연장건입니다.', organ: '장지웅 부장 급여 계좌 또는 농협' }));

  console.log('  · 우리 것 — 필리핀(영어)');
  check('「1ST CUT SALARY JULY 30- AUGUST 12, 2026」 은 남긴다',
    !drop({ name: '1ST CUT SALARY JULY 30- AUGUST 12, 2026', content: '' }));
  check('「2ND CUT SALARY JULY 14-29, 2026」 은 남긴다',
    !drop({ name: '2ND CUT SALARY JULY 14-29, 2026', content: '—' }));

  console.log('  · 결재라인 이름');
  check('결재라인에 「박상인」 이 있으면 제목이 영어여도 뺀다',
    drop({ name: 'OFFICE SUPPLIES', content: 'ballpen', approval_line: '박상인 > 대표' }));
  check('결재라인에 「Joy」 가 있으면 제목이 영어여도 뺀다',
    drop({ name: 'OFFICE SUPPLIES', content: 'ballpen', approver: 'Joy' }));
  check('결재라인 속성 «이름이 무엇이든» 찾아낸다 (카페24가 정한 이름을 우리는 모른다)',
    drop({ name: 'MEDICINE', content: 'x', sign_users: 'Kim, Joy, Park' }));
  check('결재라인이 배열로 와도 찾아낸다',
    drop({ name: 'MEDICINE', content: 'x', line: ['Lee', 'Joy'] }));

  console.log('  · 🔴 잘못 버리면 안 되는 것 (진짜 우리 지출이 사라지는 쪽이 더 나쁘다)');
  check('내용·거래처에 한글이 섞여도 제목이 영어면 남긴다 (「쿠팡」에서 산 필리핀 지출)',
    !drop({ name: 'MULTI TAP PURCHASE', content: 'bought at 쿠팡', organ: '쿠팡 /장바구니 담음' }));
  check('필리핀에 흔한 이름 「Joy」가 제목에 있어도 남긴다 (결재라인이 아니다)',
    !drop({ name: "JOY'S MEDICAL REIMBURSEMENT", content: 'hospital receipt attached' }));
  check('내용에 「Joy」가 있어도 남긴다 (자유 서술 칸)',
    !drop({ name: 'MEDICAL REIMBURSEMENT', content: 'Teacher Joy went to the hospital' }));
  check('비고(memo)에 「Joy」가 있어도 남긴다',
    !drop({ name: 'MEDICAL REIMBURSEMENT', content: 'x', memo: 'requested by Joy' }));
  check('「Joyce」·「Enjoy」 는 안 걸린다 (낱말 단위로만 본다)',
    !drop({ name: 'TEAM DINNER', content: 'x', approver: 'Joyce Santos' })
    && !drop({ name: 'TEAM DINNER', content: 'x', approver: 'Enjoy Corp' }));

  console.log('  · 가장자리');
  check('제목이 비었으면 내용으로 판정한다 (한글 내용 → 뺀다)',
    drop({ name: '', content: '유치부 쿠킹클래스 재료비' }));
  check('제목이 비고 내용도 영어면 남긴다',
    !drop({ name: '', content: 'CUTOFF SALARY' }));
  check('제목이 숫자·기호뿐이면 내용으로 판정한다',
    drop({ name: '2026-07', content: '요리수업 용품' }));
  check('빈 행·null 에도 터지지 않는다',
    mod.c24ExpenseDrop(null).drop === false && mod.c24ExpenseDrop({}).drop === false);
  check('왜 뺐는지 이유를 함께 돌려준다 (진단용)',
    mod.c24ExpenseDrop({ name: '정기휴가' }).reason === 'korean'
    && mod.c24ExpenseDrop({ name: 'X', approver: 'Joy' }).reason === 'approver');
}

console.log('\n' + (fail ? '⚠ FAIL ' + fail + ' / PASS ' + pass : '✅ 전부 통과 (' + pass + '건)'));
process.exit(fail ? 1 : 0);
