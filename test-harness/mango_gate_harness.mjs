// mango_gate_harness.mjs — 「api-mango.ts 에 만들었는데 URL 로는 안 되는 API」 자동 탐지 (2026-08-09)
//
// 배경 (index.ts:939 의 주석 그대로)
//   「⚠ 새 API 경로를 api-mango.ts 에 추가했을 때는 반드시 이 게이트에도 등록할 것.
//     여기 목록에 없으면 index.html 로 fallthrough → CF Assets 가 POST 에 405 반환.」
//
//   이 게이트는 index.ts 안의 **510줄짜리 if 조건 하나**다(941~1450행, 끝이 handleMangoApi).
//   사람이 손으로 유지한다. 빠뜨리면 tsc 도 통과하고 배포도 성공하고 헬스체크도 200 인데
//   그 API 만 조용히 죽는다. CLAUDE.md 함정 목록에 있는 그 사고다.
//
// 검사 방법 (추정 아님)
//   게이트 조건식을 소스에서 그대로 떼어내 함수로 만들어 **실제로 실행**한다.
//   api-mango.ts 가 처리하는 경로를 하나씩 넣어 보고, 통과 못 하는 것을 보고한다.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dir, '../cloudflare-deploy/src');
const idx = readFileSync(join(SRC, 'index.ts'), 'utf8');
const mango = readFileSync(join(SRC, 'api-mango.ts'), 'utf8');

// ── ① 게이트 조건식 추출 ──
// 시작: `if (path.startsWith('/api/attendance') ||`
// 끝  : 그 if 의 여는 중괄호. 괄호 균형으로 찾는다.
const startIdx = idx.indexOf("if (path.startsWith('/api/attendance')");
if (startIdx < 0) { console.log('1 FAIL — 게이트 시작점을 못 찾음 (index.ts 구조가 바뀌었나?)'); process.exit(1); }

let i = idx.indexOf('(', startIdx), depth = 0, end = -1;
for (let j = i; j < idx.length; j++) {
  const c = idx[j];
  if (c === '(') depth++;
  else if (c === ')') { depth--; if (depth === 0) { end = j; break; } }
}
if (end < 0) { console.log('1 FAIL — 게이트 조건의 닫는 괄호를 못 찾음'); process.exit(1); }

const cond = idx.slice(i + 1, end);
const gateLines = idx.slice(0, end).split('\n').length - idx.slice(0, startIdx).split('\n').length;

// 조건식이 path 말고 다른 변수를 쓰면 그대로 실행할 수 없다 — 그때는 정직하게 실패한다.
const idents = [...cond.matchAll(/\b([A-Za-z_$][\w$]*)\s*(?![\w$(])/g)].map(m => m[1]);
const ALLOWED = new Set(['path', 'test', 'startsWith', 'endsWith', 'includes', 'method', 'url', 'RegExp']);
const foreign = [...new Set(idents)].filter(v => !ALLOWED.has(v) && !/^\d/.test(v));

let gate;
try {
  gate = new Function('path', `return (${cond});`);
  gate('/api/__probe__');
} catch (e) {
  console.log(`1 FAIL — 게이트 조건을 실행할 수 없음: ${e.message}`);
  if (foreign.length) console.log(`   외부 식별자: ${foreign.slice(0, 8).join(', ')}`);
  process.exit(1);
}

// ── ② api-mango.ts 가 처리하는 경로 수집 ──
// ⚠️ 구체 경로(===)와 접두사(startsWith)를 **반드시 나눠서** 본다.
//    처음엔 둘을 섞어 접두사 문자열 자체를 게이트에 넣어 봤다가
//    「63개가 안 된다」는 가짜 경보를 냈다. api-mango 가 startsWith('/api/admin/kakao/') 로
//    받더라도 게이트엔 '/api/admin/kakao/status' 같은 구체 경로가 등록돼 있어
//    실제 요청은 멀쩡히 통과한다. 접두사 자체는 아무도 호출하지 않는 문자열이다.
const exact = new Set();
const prefix = new Set();
for (const m of mango.matchAll(/path\s*===\s*['"`](\/api\/[^'"`]+)['"`]/g)) exact.add(m[1]);
for (const m of mango.matchAll(/path\.startsWith\(\s*['"`](\/api\/[^'"`]+)['"`]/g)) prefix.add(m[1]);

console.log(`게이트 조건 ${gateLines}줄 (index.ts)`);
console.log(`api-mango.ts — 구체 경로 ${exact.size}개 · 접두사 ${prefix.size}개`);

// ── ③ 구체 경로가 게이트를 통과하는가 (여기가 진짜 판정) ──
const broken = [...exact].filter(p => !gate(p)).sort();

// ── ④ 접두사는 «참고» 로만 — 그 아래 아무 경로도 못 지나가면 통째로 죽은 것 ──
//     탐침 두 개(prefix 자체 · prefix+'probe')가 둘 다 막히면 그 네임스페이스는 닫혀 있다.
//     ⚠️ 「그 아래 통과하는 게 있나」는 **게이트에 등록된 문자열** 기준으로 봐야 한다.
//        api-mango 의 exact 집합으로 보면 안 된다 — 예: 게이트엔 '/api/admin/kakao/status' 가
//        등록돼 있는데 api-mango 는 그걸 startsWith 로 받으므로 exact 에 없다.
//        그래서 처음엔 kakao 를 「통째로 막혀 있다」고 잘못 셌다.
//     ⚠️ 탐침은 여러 모양으로 쏴야 한다. 게이트엔 문자열뿐 아니라 **정규식** 등록도 있어서
//        (예: /^\/api\/passkey\/(list|remove|…)$/ · /^\/api\/get-lesson-video\/\d+$/)
//        'probe' 하나만 쏘면 통과하는 네임스페이스를 «막혔다» 고 잘못 센다. 실제로 그랬다.
const gateLiterals = [...cond.matchAll(/['"`](\/api\/[^'"`]+)['"`]/g)].map(m => m[1]);
const PROBES = ['', 'probe', '1', 'list', 'status', 'export'];
const opensAnything = (p) => {
  const base = p.replace(/\/$/, '');
  return PROBES.some(s => gate(s ? `${base}/${s}` : p) || gate(p + s));
};
const deadPrefixes = [...prefix]
  .filter(p => !opensAnything(p))
  .filter(p => !gateLiterals.some(g => g.startsWith(p)))   // 게이트가 그 아래 하나라도 열어 뒀으면 제외
  .sort();

if (broken.length) {
  console.log(`\n🚨 게이트에 등록되지 않아 «URL 로는 안 되는» 구체 경로 ${broken.length}개:`);
  for (const p of broken) console.log(`    ${p}`);
  console.log(`\n  고치는 법: index.ts 의 그 if 조건에 해당 경로를 추가.`);
  console.log(`  (등록 안 하면 index.html 로 흘러가 CF Assets 가 405/HTML 을 돌려준다)`);
}

if (deadPrefixes.length) {
  console.log(`\n🚨 게이트가 아무것도 통과시키지 않는 네임스페이스 ${deadPrefixes.length}개:`);
  for (const p of deadPrefixes) console.log(`    ${p}*`);
  console.log(`  (api-mango 는 받을 준비가 돼 있는데 게이트가 통째로 막고 있습니다 —`);
  console.log(`   즉 그 아래 API 는 구현돼 있어도 URL 로는 죽어 있습니다)`);
}

const fail = broken.length + deadPrefixes.length;
if (fail) { console.log(`\n${fail} FAIL`); process.exit(1); }
console.log(`\n✅ 구체 경로 ${exact.size}개 · 접두사 ${prefix.size}개 모두 게이트를 통과합니다`);
process.exit(0);
