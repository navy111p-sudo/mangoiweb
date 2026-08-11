// -*- coding: utf-8 -*-
// 🐧🖥 하니스 이식성 가드 — "내 PC 에선 되는데 CI 에서 터진다" 를 막는다 (2026-08-12)
//   실행: node test-harness/harness_portability_harness.mjs
//
//   왜 생겼나 — 같은 사고가 **세 번** 났고, 세 번째는 자동배포를 3연속 막았다.
//     `node_modules/esbuild/bin/esbuild` 는 OS 마다 정체가 다르다.
//       · Windows      : JS 셸 스크립트        → `node <경로>` 라야 돈다
//       · Linux/macOS  : 네이티브 ELF 바이너리 → node 에 넘기면 «\x7fELF …» 를 JS 로 읽다 죽는다
//     개발 PC 가 전부 Windows 라 **로컬에선 늘 통과한다.** 그래서 사람 눈으로는 안 걸리고,
//     CI 를 한 바퀴 태워야만 드러난다. 그 한 바퀴가 곧 «배포가 막힌 시간» 이다.
//
//     · 2026-08-10  admin_404_apis · teacher_page_problem_260807_runtime  (win32 분기로 해결)
//     · 2026-08-11  enroll_priority_assign → 배포 3연속 차단 (JS API buildSync 로 해결)
//
//   [정답은 두 가지고, 둘 다 인정한다]
//     ① JS API   : require('esbuild').buildSync(...)   ← 권장. 경로·플랫폼을 신경 쓸 필요가 없다
//     ② 분기 실행 : process.platform === 'win32' 로 갈라 bin/esbuild 를 다르게 부른다
//   막는 것은 «bin/esbuild 를 node 에 넘기면서 분기가 없는» 한 가지뿐이다.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const SELF = basename(fileURLToPath(import.meta.url));
let PASS = 0, FAIL = 0; const FAILS = [];
const check = (n, c, x) => {
  if (c) PASS++; else { FAIL++; FAILS.push(n); }
  console.log(`  ${c ? '✅' : '❌'} ${n}${!c && x !== undefined ? '  → ' + JSON.stringify(x) : ''}`);
};

const files = readdirSync(__dir).filter((f) => f.endsWith('.mjs') && f !== SELF);

/* 위험한 형태 «하나»만 정확히 겨냥한다.
   넓게 잡으면 오탐이 난다 — 처음엔 넓게 잡았다가 npx esbuild(CLI)와 transformSync(JS API)를
   쓰는 멀쩡한 하니스 4개를 빨갛게 만들었다. 오탐이 나는 가드는 결국 아무도 안 본다. */
const usesBinPath = (src) => /['"]bin['"]\s*,\s*['"]esbuild['"]/.test(src) || /bin\/esbuild/.test(src);
const viaNode     = (src) => /execFileSync\(\s*process\.execPath/.test(src);
const hasWinSwitch= (src) => /process\.platform\s*===\s*['"]win32['"]/.test(src);
const isDangerous = (src) => usesBinPath(src) && viaNode(src) && !hasWinSwitch(src);

console.log('\n[ 🚫 bin/esbuild 를 «node 로» 실행하면서 win32 분기가 없는 하니스 ]');
const offenders = [];
for (const f of files) {
  const src = readFileSync(join(__dir, f), 'utf8');
  if (/esbuild/.test(src) && isDangerous(src)) offenders.push(f);
}
check('없다', offenders.length === 0, offenders);
if (offenders.length) {
  console.log('     고치는 법 — 둘 중 하나로 바꾸세요:');
  console.log("       ① (권장) const esbuild = createRequire(join(CF,'package.json'))('esbuild');");
  console.log("                 esbuild.buildSync({ entryPoints:[...], bundle:true, outfile:out });");
  console.log("       ② if (process.platform === 'win32') execFileSync(process.execPath, [BIN, ...args]);");
  console.log('          else                              execFileSync(BIN, args);');
}

console.log('\n[ 참고 — esbuild 를 쓰는 하니스가 어떤 방식인가 (통과/실패 아님) ]');
const users = files.filter((f) => /esbuild/.test(readFileSync(join(__dir, f), 'utf8')));
for (const f of users) {
  const src = readFileSync(join(__dir, f), 'utf8');
  const how = /buildSync|transformSync/.test(src) ? 'JS API      '
            : /npx[^\n]*esbuild/.test(src)        ? 'npx CLI     '
            : usesBinPath(src) && hasWinSwitch(src) ? 'bin+win32분기'
            : usesBinPath(src)                    ? '⚠ bin 직접  '
            : '경로만 참조 ';
  console.log(`     ${how}  ${f}`);
}

console.log('\n────────────────────────────────');
console.log(`총 ${PASS + FAIL}건 중 ✅ ${PASS} 통과 / ❌ ${FAIL} 실패`);
if (FAIL) {
  console.log('실패:');
  FAILS.forEach((f) => console.log('  - ' + f));
  console.log('\n💡 이 가드는 CI 를 한 바퀴 태우기 전에 잡으라고 있는 것입니다.');
  console.log('   Windows 에서 통과했다는 사실은 리눅스 CI 의 근거가 못 됩니다.');
}
process.exit(FAIL === 0 ? 0 : 1);
