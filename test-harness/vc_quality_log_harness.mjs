// -*- coding: utf-8 -*-
// vc_quality_log_harness.mjs — 회선품질 로그가 «비어 있지 않게» 지키는 회귀 감시 (2026-08-21)
//   실행: node test-harness/vc_quality_log_harness.mjs
//
// [무슨 사고였나]
//   2026-08-21 중국어 수업(class-851-20260821). 사장님 제보 —
//     "연결이 약해서 교사 화면이 안 보여" → "최대한 문제 없게 할 수 없나".
//   그런데 «강선생님 회선이 실제로 얼마나 나쁜가» 를 답할 데이터가 없었다.
//   D1 vc_quality 실측(최근 한 달 675건):
//     · room 이 빈 값 → 673건 (99.7%)  = 어느 수업이었는지 영영 모름
//     · role='teacher' → 3건뿐, 그나마 전부 사장님 본인·테스트 계정
//   즉 「강사별 인터넷 품질 파악용」이라 적어 둔 로그가 그 목적으로 한 건도 못 쓰이고 있었다.
//
// [뿌리 ① — 방 번호가 안 남던 이유]
//   payload 가 `window.vcRoomId` 를 읽었는데, 방 번호는 `let vcRoomId` 로 선언돼 있다.
//   **`let` 은 `var` 와 달리 window 에 속성을 만들지 않는다** → 항상 undefined.
//   대체 경로 `window.currentRoomId` 도 어디에도 대입되지 않아 역시 undefined.
//   그래서 조용히 빈 문자열이 됐다 — 에러가 안 나서 한 달간 아무도 몰랐다.
//   실측(헤드리스 크로미움, 2026-08-21): typeof window.vcRoomId === 'undefined',
//   어휘 바인딩으로 바꾼 뒤 posted.room === 'class-851-20260821'.
//
// [뿌리 ② — 제일 나쁜 구간이 통째로 비던 이유]
//   vcQualityAcc() 호출이 **영상 sender 통계 루프 안**, 그것도
//   `if (dSent + dLost < 25) return;` **뒤에** 있었다.
//   AAO(저대역 자동 음성전용)가 영상을 끄면 전송 패킷이 0 이 되어 그 return 에 걸린다
//   = **회선이 무너져 영상이 꺼진 순간부터 로그가 완전히 멈춘다.**
//   가장 알아야 할 구간이 정확히 기록되지 않는 구조였다.
//
// ⚠️ 이 두 개가 되돌아가면 「강사 회선이 나쁘다」를 다시 숫자로 말할 수 없게 된다. 지우지 말 것.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dir = dirname(fileURLToPath(import.meta.url));
const MAIN = readFileSync(resolve(__dir, '../cloudflare-deploy/public/js/idx-main.js'), 'utf8');

// 부정 검사는 주석을 벗겨 낸 사본으로 판정한다(설명 주석이 자기 검사에 걸리는 사고 방지 —
// CLAUDE.md 2장 「하니스에 «이 단어가 없어야 한다» 검사를 넣었는데 내 주석 때문에 FAIL」).
const CODE = MAIN.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

let PASS = 0, FAIL = 0; const FAILS = [];
function ok(name, cond) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
}

console.log('📶 회선품질 로그 회귀 감시');

// ── ① 방 번호 ──────────────────────────────────────────────
ok('① 품질 로그 payload 가 room 을 어휘 바인딩 vcRoomId 로 읽는다',
   /room:\s*\(\s*vcRoomId\s*\|\|\s*''\s*\)/.test(CODE));

ok('① window.vcRoomId 를 읽지 않는다(let 선언이라 항상 undefined)',
   !/window\.vcRoomId/.test(CODE));

ok('① window.currentRoomId 를 읽지 않는다(어디에도 대입되지 않는 이름)',
   !/window\.currentRoomId/.test(CODE));

// 전제가 바뀌면(누가 var 로 바꾸면) 위 검사의 근거가 사라지므로 선언 형태도 함께 못 박는다.
ok('① 방 번호는 let 으로 선언돼 있다(그래서 window 에 안 붙는다 = ①의 전제)',
   /^let vcRoomId = '';$/m.test(MAIN));

// ── ② AAO 구간 로깅 ────────────────────────────────────────
ok('② AAO 가 켜져 있는 동안에도 품질 로그를 남긴다(오디오 통계로 이어 적음)',
   /if\s*\(\s*A\.active\s*\)\s*\{\s*try\s*\{\s*vcQualityAcc\(\s*alp\s*,\s*art\s*\)/.test(CODE));

// 그 호출은 반드시 오디오 블록(alp/art 를 계산하는 곳)에 있어야 한다.
// 영상 블록에만 있으면 영상이 꺼진 순간 다시 멈춘다 = 사고 재발.
ok('② 그 호출이 오디오 손실(alp)·RTT(art) 를 계산한 뒤에 온다',
   (() => {
     const a = CODE.indexOf('const alp = 100 * adl');
     const b = CODE.search(/if\s*\(\s*A\.active\s*\)\s*\{\s*try\s*\{\s*vcQualityAcc/);
     return a > 0 && b > a;
   })());

// 영상 쪽 호출은 그대로 살아 있어야 한다(정상 수업의 주 경로).
ok('② 영상 쪽 품질 로그 호출도 그대로 있다',
   /vcQualityAcc\(\s*lossPct\s*,\s*rtt\s*\)/.test(CODE));

// ── ③ 서버가 그 값을 실제로 저장하는가 ─────────────────────
const APIM = readFileSync(resolve(__dir, '../cloudflare-deploy/src/api-mango.ts'), 'utf8');
ok('③ 서버가 room 컬럼에 값을 저장한다',
   /INSERT INTO vc_quality \([^)]*\broom\b/.test(APIM));
ok('③ 서버가 aao 컬럼에 값을 저장한다',
   /INSERT INTO vc_quality \([^)]*\baao\b/.test(APIM));

console.log(`\n결과: ${PASS} 통과, ${FAIL} 실패`);
if (FAIL) { FAILS.forEach(f => console.log(`실패: ${f}`)); process.exit(1); }
