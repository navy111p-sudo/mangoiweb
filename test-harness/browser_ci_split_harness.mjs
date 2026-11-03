// 브라우저 검사 워크플로를 «갈래»(matrix.part)로 나눈 뒤에도 검사가 하나도 빠지지 않는가 (2026-11-03).
//
// 왜: warmup-browser.yml 은 두 러너에서 동시에 돕니다(wiring · speech). 단계마다 `if: matrix.part == '…'`
//     로 «어느 갈래에서 도는가» 를 정하는데, 갈래 이름을 바꾸고 if 를 안 고치면 그 단계는 «에러 없이»
//     영영 안 돕니다(건너뜀은 초록입니다). 그리고 동시 실행 도우미(helpers/browser-pool.mjs)를
//     시각에 민감한 아바타 검사가 쓰기 시작하면 짧은 입모양 구간을 놓칩니다.
import fs from 'node:fs';

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✅ ' + msg); } else { fail++; console.log('  ❌ ' + msg); } }

const wfPath = '.github/workflows/warmup-browser.yml';
const wf = fs.readFileSync(wfPath, 'utf8').replace(/^\s*#.*$/gm, '');

const partsM = wf.match(/^\s*part:\s*\[([^\]]*)\]\s*$/m);
ok(!!partsM, '전제: warmup-browser.yml 에 matrix.part 목록이 있다');
const parts = partsM ? partsM[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean) : [];
ok(parts.length >= 2, '갈래가 둘 이상이다: ' + parts.join(', '));

// 단계를 «- name:» 단위로 자르고 각 단계의 if 를 읽습니다.
const steps = wf.split(/\n(?=\s{6}- (?:name|uses):)/).slice(1).map(block => {
  const name = (block.match(/- name:\s*(.+)/) || [])[1] || (block.match(/- uses:\s*(.+)/) || [])[1] || '';
  const cond = (block.match(/^\s+if:\s*(.+)$/m) || [])[1] || '';
  const runs = [...block.matchAll(/node\s+(test-harness\/manual\/[\w.-]+\.mjs)/g)].map(m => m[1]);
  return { name: name.trim(), cond: cond.trim(), runs };
});
const testSteps = steps.filter(s => s.runs.length);
ok(testSteps.length >= 3, '전제: 검사 단계를 읽었다(' + testSteps.length + '개)');

const seen = new Set();
for (const st of testSteps) {
  const m = st.cond.match(/^matrix\.part\s*==\s*'([^']+)'$/);
  ok(!!m, '«' + st.name + '» 단계가 갈래 하나를 정확히 지정한다 (if: ' + (st.cond || '없음') + ')');
  if (m) {
    ok(parts.includes(m[1]), '«' + st.name + '» 의 갈래 «' + m[1] + '» 가 matrix 목록에 있다 — 없으면 영영 안 돕니다');
    seen.add(m[1]);
  }
}
for (const p of parts) ok(seen.has(p), '갈래 «' + p + '» 에 도는 검사가 하나 이상 있다');

// 예전 한 줄짜리 워크플로가 돌리던 검사가 전부 남아 있는가(빠뜨림 방지).
const mustRun = [
  'test-harness/manual/avatar-viseme-browser.mjs',
  'test-harness/manual/warmup-two-way-browser.mjs',
  'test-harness/manual/warmup-guided-browser.mjs',
  'test-harness/manual/warmup-bts-book-browser.mjs',
  'test-harness/manual/warmup-two-way-mutation.mjs',
  'test-harness/manual/speech-preferences-browser.mjs',
];
const allRuns = testSteps.flatMap(s => s.runs);
for (const f of mustRun) ok(allRuns.filter(r => r === f).length === 1, f + ' 를 정확히 한 번 돌린다');

// 아바타 검사가 «동시 실행 도우미» 를 쓰지 않는가 — 같은 갈래 안에서 시각 검사가 CPU 를 나누지 않게.
const avatar = fs.readFileSync('test-harness/manual/avatar-viseme-browser.mjs', 'utf8');
ok(!/browser-pool/.test(avatar), '아바타 입모양 검사는 동시 실행 도우미(browser-pool)를 쓰지 않는다');
const avatarStep = testSteps.find(s => s.runs.includes('test-harness/manual/avatar-viseme-browser.mjs'));
const speechStep = testSteps.find(s => s.runs.includes('test-harness/manual/speech-preferences-browser.mjs'));
ok(!!avatarStep && !!speechStep && avatarStep.cond !== speechStep.cond,
  '아바타 검사와 동시 실행 검사(말빠르기)는 다른 갈래(다른 러너)에서 돈다');

// 동시 실행으로 바꾼 두 검사가 «사례를 다 돌렸다» 를 스스로 확인하는가.
const speech = fs.readFileSync('test-harness/manual/speech-preferences-browser.mjs', 'utf8');
const speaking = fs.readFileSync('test-harness/manual/ai-speaking-browser.mjs', 'utf8');
ok(/runPool\(/.test(speech) && /assert\.equal\(cases,\s*matrix\.length/.test(speech), '말빠르기 검사: 동시에 돌리고 «전부 돌았나» 를 센다');
ok(/runPool\(/.test(speaking) && /assert\.equal\(cases,\s*320/.test(speaking), 'A.i 말하기 검사: 동시에 돌리고 320건 전부를 센다');
ok(/'Sandbox_'\s*\+\s*index/.test(speech), '말빠르기 검사: 계정 이름을 «사례 번호» 로 — 동시에 돌아도 서로 안 겹친다');

// 도우미를 고치면 그것을 쓰는 브라우저 검사가 «반드시» 다시 돌아야 합니다(path 필터에 없으면 안 돕니다).
for (const f of ['.github/workflows/warmup-browser.yml', '.github/workflows/ai-speaking-browser.yml']) {
  ok(fs.readFileSync(f, 'utf8').includes("- 'test-harness/helpers/browser-pool.mjs'"), f + ' 의 paths 에 browser-pool.mjs 가 있다');
}

console.log('browser_ci_split_harness: PASS ' + pass + ' / FAIL ' + fail);
if (fail) process.exit(1);
