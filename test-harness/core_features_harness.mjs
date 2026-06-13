// -*- coding: utf-8 -*-
// 🥭 망고아이 핵심 기능 통합 테스트 하네스 (의존성 없음 · node 로 바로 실행)
//   실행:  node test-harness/core_features_harness.mjs
//   목적:  망고 화상영어의 5대 핵심 기능 "안전성 핵심 규칙"을 가짜 데이터로 검증한다.
//     1) 실시간 수업 세션 안정성   (src/signaling-room.ts, api-mango.ts attendance)
//     2) 숙제 처리 데이터 무결성    (api-mango.ts eval/create, points homework, retention)
//     3) AI 퀴즈 응답 정확도        (api-mango.ts rqGrade/rqNorm/rqWordAcc/rqSafe)
//     4) 카카오톡 평가표 발송 자동화 (src/solapi-client.ts)
//     5) 교재/교사 업로드 → 표시 검증 (api-mango.ts textbook-files, teacher-profiles)
//   주의: 이 하네스는 실제 소스의 규칙을 그대로 미러링한 사양(spec) 테스트입니다.
//         규칙을 바꾸면 여기도 같이 바꿔야 회귀를 잡습니다.
//         + 일부 항목은 실제 소스 파일을 직접 읽어 사양과 일치하는지 교차검증합니다.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = (f) => resolve(__dir, '../cloudflare-deploy/src/', f);
const readSrc = (f) => { try { return readFileSync(SRC(f), 'utf8'); } catch { return ''; } };

let PASS = 0, FAIL = 0; const FAILS = [];
const SECT = {};
let cur = '(init)';
function section(name){ cur = name; SECT[cur] ??= { pass:0, fail:0 }; console.log('\n' + name); }
function check(name, cond){
  if (cond) { PASS++; SECT[cur].pass++; } else { FAIL++; SECT[cur].fail++; FAILS.push(cur + ' › ' + name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
}
function eq(name, a, b){ check(name + ` (=${JSON.stringify(b)})`, JSON.stringify(a) === JSON.stringify(b)); }

console.log('🥭 망고아이 핵심 기능 통합 테스트 하네스');
console.log('   ' + new Date().toISOString());

// ════════════════════════════════════════════════════════════════════
// [1] 실시간 수업 세션 안정성  (1:1 화상 시그널링 + 입장/출석 확정)
// ════════════════════════════════════════════════════════════════════
section('[1] 실시간 수업 세션 안정성');

// 1-A) 시그널링 방 정원 — src/signaling-room.ts 미러
//   주의(회귀 포인트): handleJoin 진입 시 자신은 이미 connections 에 들어가 있으므로
//                      size > MAX_PEERS 일 때만 room-full (>= 아님). >= 로 바꾸면 정상 2번째 입장이 막힘.
const MAX_PEERS = 2;
function handleJoinRoomFull(currentSizeAfterAdd){ return currentSizeAfterAdd > MAX_PEERS; }
eq('1번째 입장(size=1) → 정상', handleJoinRoomFull(1), false);
eq('2번째 입장(size=2) → 정상 (1:1 성립)', handleJoinRoomFull(2), false);
eq('3번째 입장(size=3) → room-full 차단', handleJoinRoomFull(3), true);
check('🔒 회귀가드: 정원 비교는 > 이며 >= 아님(2명 정상입장 보장)', !handleJoinRoomFull(MAX_PEERS));

// 교차검증: 실제 소스가 size > MAX_PEERS 를 쓰는지 확인
{
  const sig = readSrc('signaling-room.ts');
  check('소스 일치: MAX_PEERS = 2', /MAX_PEERS\s*=\s*2/.test(sig));
  check('소스 일치: room-full 은 size > MAX_PEERS', /this\.connections\.size\s*>\s*MAX_PEERS/.test(sig));
  check('소스 일치: room-full 시 자신 connection 제거', /room-full[\s\S]{0,160}connections\.delete/.test(sig));
}

// 1-B) 입장 토큰 만료 — exp(초) 검증
function tokenValid(payload, nowSec){ if (payload.exp && payload.exp < nowSec) return false; return true; }
const now = Math.floor(Date.now()/1000);
check('유효 토큰(exp 미래) → 입장 허용', tokenValid({ exp: now + 600 }, now));
check('만료 토큰(exp 과거) → 입장 거부', !tokenValid({ exp: now - 1 }, now));
check('exp 없는 토큰 → (구버전 호환) 통과', tokenValid({}, now));

// 1-C) 입장 → 출석 확정/결석 복구 — api-mango.ts /api/attendance/join 미러
//   수업 시간 내 입장이면 status='attended' 로 확정(결석배치 결과를 덮어씀), 시간 밖이면 'present'
function attendanceStatusOnJoin(withinClass){ return withinClass ? 'attended' : 'present'; }
eq('수업시간 내 입장 → attended 확정', attendanceStatusOnJoin(true), 'attended');
eq('수업시간 밖 입장 → present', attendanceStatusOnJoin(false), 'present');
// attended_at 은 COALESCE 로 최초값 보존(재입장해도 첫 입장시각 유지)
function coalesceAttendedAt(existing, now){ return existing != null ? existing : now; }
eq('재입장 시 attended_at 최초값 보존', coalesceAttendedAt(1000, 2000), 1000);
eq('첫 입장 시 attended_at 기록', coalesceAttendedAt(null, 2000), 2000);

// 교차검증: 실제 소스의 확정 로직
{
  const api = readSrc('api-mango.ts');
  check('소스 일치: 수업시간 내 status=attended 확정', /withinClass\s*\?\s*'attended'\s*:\s*'present'/.test(api));
  check('소스 일치: attended_at 은 COALESCE 보존', /attended_at\s*=\s*COALESCE\(attended_at/.test(api));
}
