// -*- coding: utf-8 -*-
// 🛡 배포 되감김 게이트 하니스 (2026-08-12)
//   실행: node test-harness/deploy_live_drift_gate_harness.mjs
//
//   무엇을 지키는가 — deploy.ps1 의 [0b] 「라이브 되감김 게이트」.
//
//   왜 있는가: deploy.ps1 은 로컬 cloudflare-deploy/public 폴더를 **통째로** 올린다.
//     그 사이 누가 main 에 머지하고 Actions 가 배포했으면, 그 결과물이 내 폴더에 없다는
//     이유만으로 라이브에서 **조용히** 사라진다. 에러도 안 나고 로그도 안 남는다.
//
//   2026-08-12 하루에 세 번 겪었다:
//     · 05:43 Actions 배포(PR #72·#78 녹화 동의) → 06:18 로컬 배포가 통째로 덮음
//       (몇 시간 뒤 «consents 가 0행» 으로만 드러났다. 그전엔 아무 신호도 없었다)
//     · 반대 방향도 있었다 — main 머지가 로컬 배포분을 지웠다
//
//   🪤 이 게이트를 처음 만들 때 밟은 함정도 함께 못 박는다:
//     PowerShell 5.1 의 Invoke-WebRequest `.Content` 는 응답을 Latin-1 로 디코딩한다.
//     그대로 비교하면 **한글이 든 줄이 전부 «다른 줄»** 이 되어 오탐 3,456줄이 났다
//     (= 모든 배포가 막힌다). 반드시 RawContentStream 을 UTF-8 로 직접 읽어야 한다.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const rd = (p) => { try { return readFileSync(resolve(__dir, p), 'utf8'); } catch { return ''; } };
const ps = rd('../deploy.ps1');

let PASS = 0, FAIL = 0; const FAILS = [];
const check = (n, c, x) => {
  if (c) PASS++; else { FAIL++; FAILS.push(n); }
  console.log(`  ${c ? '✅' : '❌'} ${n}${!c && x !== undefined ? '  → ' + JSON.stringify(x) : ''}`);
};

console.log('\n[ 게이트가 존재하는가 ]');
check('deploy.ps1 을 읽었다', ps.length > 0);
check('[0b] 되감김 게이트가 있다', /\[0b\/7\]|라이브 되감김 게이트/.test(ps));
check('-SkipLiveDrift 스위치가 선언돼 있다', /param\(\[switch\]\$SkipSmoke,\s*\[switch\]\$SkipLiveDrift\)/.test(ps));

console.log('\n[ 🔒 게이트가 «막는» 동작을 하는가 ]');
// 게이트 블록만 잘라 본다 — 파일 다른 곳의 exit 1 에 걸리지 않게.
const g0 = ps.indexOf('라이브 되감김 게이트');
const g1 = ps.indexOf('# [0] 배포 전 안전 게이트', g0);
const GATE = (g0 >= 0 && g1 > g0) ? ps.slice(g0, g1) : '';
check('게이트 블록을 찾았다', GATE.length > 0);
check('라이브에만 있는 줄이 있으면 exit 1 로 멈춘다',
  /onlyLive\.Count -gt 0[\s\S]{0,900}exit 1/.test(GATE));
check('라이브를 못 읽으면(네트워크 실패) 그냥 넘어가지 않고 멈춘다',
  /IsNullOrWhiteSpace\(\$liveHtml\)[\s\S]{0,700}exit 1/.test(GATE));

console.log('\n[ 🚫 -SkipSmoke 로는 꺼지지 않는다 (급할수록 남의 작업을 지운다) ]');
check('게이트 조건이 $SkipSmoke 가 아니라 $SkipLiveDrift 다',
  /if \(-not \$SkipLiveDrift\)/.test(ps) && !/if \(-not \$SkipSmoke\)[\s\S]{0,200}되감김/.test(ps));

console.log('\n[ 🪤 인코딩 — 이걸 틀리면 게이트가 모든 배포를 막는다 ]');
check('응답을 RawContentStream + UTF-8 로 읽는다', /RawContentStream[\s\S]{0,80}UTF8\.GetString|UTF8\.GetString\(\$resp\.RawContentStream/.test(ps));
check('🚫 $resp.Content 를 그대로 쓰지 않는다 (PS 5.1 은 Latin-1 로 디코딩한다)',
  !/\$liveHtml\s*=\s*\$resp\.Content/.test(ps));
check('로컬 index.html 도 UTF-8 로 읽는다', /Get-Content \$localIndex -Raw -Encoding UTF8/.test(ps));

console.log('\n[ 🎯 무엇과 비교하는가 ]');
/* 🪤 여기서 «파일에 test.mangoi.co.kr 라는 글자가 없는가» 로 보면 안 된다 —
      게이트 주석이 «커스텀 도메인은 왜 안 되는가» 를 설명하느라 그 이름을 적고 있어서
      멀쩡한 코드가 빨개진다(실제로 그렇게 한 번 잡혔다). 검사는 «실제 요청 주소» 로 좁힌다. */
const urlLine = (/\$liveUrl\s*=\s*"([^"]+)"/.exec(GATE) || [])[1] || '';
check('요청 주소가 workers.dev 원본이다 (엣지가 옛 HTML 을 HIT 로 내준다)',
  /workers\.dev/.test(urlLine) && !/test\.mangoi\.co\.kr/.test(urlLine), urlLine);
check('캐시 우회 쿼리를 붙인다', /nocache=/.test(GATE));
check('BUILD 스탬프 줄은 비교에서 뺀다 (매 배포마다 바뀐다)', /notmatch 'BUILD:'/.test(GATE));
check('«로컬에만 있는 줄» 은 막지 않는다 — 그게 정상 배포다',
  !/onlyLocal[\s\S]{0,200}exit 1/.test(GATE));

console.log('\n────────────────────────────────');
console.log(`총 ${PASS + FAIL}건 중 ✅ ${PASS} 통과 / ❌ ${FAIL} 실패`);
if (FAIL) { console.log('실패:'); FAILS.forEach((f) => console.log('  - ' + f)); }
process.exit(FAIL === 0 ? 0 : 1);
