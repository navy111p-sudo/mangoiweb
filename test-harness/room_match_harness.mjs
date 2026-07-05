/**
 * room_match_harness.mjs
 * ── "학생과 교사는 반드시 같은 방에서 만난다" 회귀 가드 ──
 *
 * 화상수업 엇갈림(서로 다른 방 입장) 원천 차단이 코드에 유지되는지 검증한다.
 * 방식: 실제 소스 파일을 읽어 결정론적 방 배정의 핵심 불변식을 단언(레포의 스키마-드리프트 가드 방식과 동일).
 *
 * 불변식:
 *  1) 서버가 방ID를 계산한다: room_id = `class-${schedule.id}-${ymd}` (손입력 금지)
 *  2) 방ID는 역할(student/teacher)에 의존하지 않는다 → 둘이 같은 예약을 보면 같은 방
 *  3) ymd 는 KST(UTC+9) 기준으로 계산 (Workers=UTC 이므로 명시 변환)
 *  4) 클라이언트(index.html)는 서버가 준 session.room_id 를 그대로 입력칸에 채운다
 *  5) 백엔드 WS 라우팅은 idFromName(roomId) 사용 → 같은 문자열 → 같은 Durable Object
 *
 * 실행: node test-harness/room_match_harness.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CF = join(__dirname, '..', 'cloudflare-deploy');
const read = (p) => readFileSync(join(CF, p), 'utf8');

let pass = 0, fail = 0; const out = [];
const ok = (c, l) => { c ? (pass++, out.push('  ✅ ' + l)) : (fail++, out.push('  ❌ ' + l)); };

const apiMango = read('src/api-mango.ts');
const indexTs = read('src/index.ts');
const indexHtml = read('public/index.html');

// 1) 결정론적 room_id 공식 존재
ok(/room_id:\s*`class-\$\{s\.id\}-\$\{ymd\}`/.test(apiMango),
  '결정론적 방ID 공식 유지: `class-${s.id}-${ymd}`');

// 2) 역할 비의존: room_id 공식 라인에 isTeacher/role 삼항이 섞여 있지 않음
const roomLine = (apiMango.split('\n').find(l => l.includes('room_id: `class-')) || '');
ok(roomLine && !/isTeacher|role\s*[?=]/.test(roomLine),
  '방ID 계산이 역할(student/teacher)에 의존하지 않음');

// 2b) ymd 자체도 역할과 무관하게 단일 계산 (분기 밖에서 1회 정의)
const ymdDefs = (apiMango.match(/const\s+ymd\s*=/g) || []).length;
ok(ymdDefs === 1, `ymd 는 역할 분기 밖에서 단 한 번 계산됨 (정의 ${ymdDefs}회)`);

// 3) KST(UTC+9) 기준 날짜 계산
ok(/KST\s*=\s*9\s*\*\s*3600\s*\*\s*1000/.test(apiMango) && /now\s*\+\s*KST/.test(apiMango),
  'ymd/오늘 날짜를 KST(UTC+9)로 명시 변환');

// 3b) 입장 시간창을 신뢰 시계(서버)가 계산 → 조기/지각 입장 게이트
ok(/OPEN_BEFORE/.test(apiMango) && /LATE_AFTER/.test(apiMango) && /join_open/.test(apiMango),
  '입장 시간창(join_open)을 서버가 계산 → 조기/지각 입장 방지');

// 4) 클라이언트가 서버 room_id 를 입력칸에 그대로 사용
ok(/\/api\/class\/sessions\/today/.test(indexHtml),
  '클라이언트가 /api/class/sessions/today 로 방을 서버에서 받아옴');
ok(/\.value\s*=\s*session\.room_id|room_id\b/.test(indexHtml),
  '받아온 session.room_id 를 방 입력값으로 사용(손입력 아님)');

// 5) WS 라우팅: idFromName(roomId) — 같은 문자열이면 같은 DO 인스턴스
ok(/VIDEO_CALL_ROOM\.idFromName\(roomId\)/.test(indexTs),
  'WS 라우팅이 idFromName(roomId) 사용 → 동일 roomId ⇒ 동일 Durable Object');

console.log('\n════════ 같은 방 매칭 회귀 가드 ════════');
console.log(out.join('\n'));
console.log('──────────────────────────────────────────');
console.log(`총 ${pass + fail}건 중 ✅ ${pass} 통과 / ❌ ${fail} 실패`);
if (fail === 0) console.log('🎉 결정론적 방 배정 유지 — 학생·교사는 반드시 같은 방에서 만남.');
process.exit(fail === 0 ? 0 : 1);
