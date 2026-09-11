// -*- coding: utf-8 -*-
// vc_lowstep_relay_harness.mjs — 「교사 화면이 안 보인다」 재발 방지 (2026-08-21)
//   실행: node test-harness/vc_lowstep_relay_harness.mjs
//
// [무슨 사고였나]
//   2026-08-21 중국어 수업(class-851-20260821, 강사 = teachers.id 29 「중국어 강선생님」).
//   사장님: "연결이 약해서 교사 화면이 안 보여".
//   화면에 뜬 것은 고장이 아니라 AAO(저대역 자동 음성전용)의 안내였다 —
//   강사 쪽 브라우저가 오디오 손실을 보고 «자기 영상을 껐다».
//
// [고친 것 ①] 절벽이 너무 컸다
//   화질 단계가 [1.0, 0.6, 0.35, 0.2] 뿐이고 그 아래가 «완전 꺼짐» 이었다.
//   즉 240kbps 다음이 곧바로 0 이라, 조금만 더 나빠지면 얼굴이 통째로 사라진다.
//   → 4단계(0.08 · 해상도 1/4 · 하한 60kbps/5fps)를 끼웠다. 오디오와 비슷한 비용으로 얼굴은 남는다.
//   ⚠️ 하한(FLOOR_*)을 «4단계만» 낮춘 이유: 앞 단계 동작을 한 톨도 바꾸지 않기 위해서다.
//      실측(헤드리스, 데스크톱 기준 1200kbps/24fps): step0~3 = 1200/720/420/240kbps 로 고침 전과 동일.
//
// [고친 것 ②] 중계(TURN)로 갈 방법이 사실상 없었다
//   createPeer 는 «직접 연결에 실패했을 때만» relay 를 강제했다(__vcForceRelay).
//   그런데 중국 회선은 «연결은 되는데 패킷만 흘리는» 형태라 그 실패 조건에 안 걸린다
//   → 아무리 나빠도 영영 직접 경로를 쓴다.
//   → 관리자가 강사별로 켤 수 있게 했다(vc_relay_force 표 → sessions/today 의 net_relay
//     → window.__vcRelayAlways → createPeer).
//   ⛔ TURN 을 확보하지 못했을 때는 절대 relay 로 가면 안 된다 — 연결 자체가 불가능해진다.
//      그래서 __vcIceHasTurn 검사는 반드시 함께 있어야 한다(실측으로도 확인: TURN 없음 → 'all').
//
// ⚠️ 이 파일은 «있는가» 만 본다. «어떤 값이 실제로 적용되는가» 는 문자열로 볼 수 없으므로
//    test-harness/manual/vc-lowstep-relay-browser.html 로 사람이 재야 한다(그 파일 머리말에 실행법).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dir = dirname(fileURLToPath(import.meta.url));
const R = (p) => readFileSync(resolve(__dir, p), 'utf8');
const MAIN  = R('../cloudflare-deploy/public/js/idx-main.js');
const MANGO = R('../cloudflare-deploy/src/api-mango.ts');
const ADMIN = R('../cloudflare-deploy/src/api-admin.ts');
// 부정 검사는 주석을 벗겨 낸 사본으로 (자기 설명 주석에 걸리는 사고 방지)
const CODE = MAIN.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

let PASS = 0, FAIL = 0; const FAILS = [];
const ok = (name, cond) => { if (cond) PASS++; else { FAIL++; FAILS.push(name); } console.log(`  ${cond ? '✅' : '❌'} ${name}`); };

console.log('📉🔁 초저화질 단계 · 중계 강제 회귀 감시');

// ── ① 초저화질 단계 ────────────────────────────────────────
ok('① 화질 단계가 5개다(마지막 = 얼굴만 남기는 단계)',
   /const STEPS = \[1\.0, 0\.6, 0\.35, 0\.2, 0\.08\];/.test(CODE));
ok('① 해상도 축소도 5개로 짝이 맞는다',
   /const SCALE = \[1, 1\.5, 2, 3, 4\];/.test(CODE));
ok('① 하한이 단계별이고 4단계만 낮다(앞 단계 동작 보존)',
   /const lo = step >= 4;/.test(CODE)
   && /Math\.max\(lo \? 60000 : 150000,/.test(CODE)
   && /Math\.max\(lo \? 5 : 10,/.test(CODE));
// 하한을 상수로 되돌리면 4단계가 150kbps 로 올라붙어 «절벽»이 되살아난다.
ok('① 150kbps·10fps 를 다시 상수로 박아 두지 않았다',
   !/maxBitrate\s*=\s*Math\.max\(150 \* 1000/.test(CODE)
   && !/maxFramerate\s*=\s*Math\.max\(10,/.test(CODE));
// 본 경로와 «구형 브라우저 대체 경로» 둘 다 고쳐야 한다 — 한쪽만 고치면 그 기기에서만 조용히 옛 동작.
ok('① 본 경로·대체 경로 두 곳 모두 단계별 하한을 쓴다',
   (CODE.match(/Math\.max\(lo \? 60000 : 150000,/g) || []).length === 2
   && (CODE.match(/Math\.max\(lo \? 5 : 10,/g) || []).length === 2);

/* ⏱ (2026-08-21 추가) 4단계를 «만들었는데 못 쓰던» 빈틈.
   두 판정이 같은 4초 주기다 — 화질은 한 틱에 한 단계씩 내려가 4단계까지 4틱(≈16초),
   AAO 는 3틱(≈12초)에 영상을 통째로 끈다. 그래서 급격한 붕괴에서는 AAO 가 «한 틱 먼저»
   와서 새로 만든 «얼굴만» 단계가 한 번도 안 쓰였다. 기능은 있는데 닿지 않는 상태.
   → ① 오디오가 2틱 나빠지면 그 자리에서 최저 단계로 내려 8초를 벌고,
     ② AAO 는 «최저 단계를 실제로 써 봤을 때만» 끈다(단 sev>=5 면 오디오 우선으로 그냥 끔).
   실측(헤드리스): sev3+floor=false → 영상 유지 · sev3+floor=true → 끔 · sev5+false → 끔. */
ok('⏱ 오디오가 2틱 나빠지면 영상을 먼저 최저 단계로 내린다',
   /A\.sev >= 2 && \(pc\.__qStep \|\| 0\) < STEPS\.length - 1/.test(CODE)
   && /pc\.__qStep = STEPS\.length - 1; applyStep\(pc, pc\.__qStep\)/.test(CODE));
ok('⏱ 최저 단계에 닿았는지를 AAO 가 볼 수 있게 기록한다',
   /A\.floor = \(pc\.__qStep \|\| 0\) >= STEPS\.length - 1;/.test(CODE));
ok('⏱ AAO 는 최저 단계를 써 본 뒤에만 영상을 끈다',
   /A\.sev >= 3 && \(A\.floor \|\| A\.sev >= 5\)/.test(CODE));
// ⛔ 이 탈출구가 없으면 최저 단계에 못 닿는 상황에서 AAO 가 영영 안 걸려 «오디오까지» 죽는다.
ok('⛔ ⏱ 그래도 심각하면(sev>=5) 오디오를 살리려 영상을 끈다',
   /A\.sev >= 5/.test(CODE));

// ── ② 중계(TURN) 강제 ──────────────────────────────────────
ok('② createPeer 가 관리자 설정(__vcRelayAlways)을 본다',
   /window\.__vcRelayAlways \|\| \(window\.__vcForceRelay/.test(CODE));
ok('⛔ ② TURN 을 확보했을 때만 relay 로 간다(없으면 연결 자체가 불가능해짐)',
   /if \(__vcIceHasTurn && \(window\.__vcRelayAlways/.test(CODE));
ok('② 직접연결 실패 복구용 relay 도 그대로 살아 있다',
   /window\.__vcForceRelay\[userId\]/.test(CODE));
ok('② 서버가 준 net_relay 를 입장 직전에 기억한다',
   /window\.__vcRelayAlways = !!_jd\.net_relay/.test(CODE)
   && /window\.__vcRelayAlways = !!d\.net_relay/.test(CODE));

// ── ③ 서버: 정책 전달·저장 ─────────────────────────────────
ok('③ sessions/today 응답에 net_relay 가 실린다(학생·교사가 같은 값을 받는다)',
   /net_relay: netRelay/.test(MANGO));
ok('③ 정책은 teacher_id 로 찾는다(이름으로 이으면 남의 것이 붙는다 — CLAUDE.md 2장)',
   /SELECT enabled FROM vc_relay_force WHERE teacher_id = \?/.test(MANGO));
ok('③ 조회가 실패해도 수업을 막지 않는다(기본 = 직접 연결)',
   /catch \{ netRelay = false; \}/.test(MANGO));
/* ⛔ Cloudflare TURN 이 없으면 /api/ice-servers 는 «무료 공개 TURN(openrelay)» 을 내려준다.
   거기로 강제 릴레이하면 직접 연결보다 나빠질 수 있다 — 회선을 살리려다 더 망가뜨리는 교환. */
ok('⛔ ③ Cloudflare TURN 이 설정됐을 때만 릴레이를 켠다(무료 공개 TURN 강제 방지)',
   /const hasCfTurn = !!\(\(env as any\)\.TURN_KEY_ID && \(env as any\)\.TURN_KEY_API_TOKEN\);/.test(MANGO)
   && /netRelay = hasCfTurn && !!\(rrow/.test(MANGO));
ok('③ 관리자 API 가 있다 (GET·POST /api/admin/vc/relay)',
   /path === '\/api\/admin\/vc\/relay' && \(method === 'GET' \|\| method === 'POST'\)/.test(ADMIN));
// canEditOrg() 는 강사를 못 막는다(scope.type==='none' 에 true) — 반드시 따로 막아야 한다.
ok('⛔ ③ 강사는 이 설정을 못 바꾼다(forbidden_teacher)',
   /_vrActor\.isTeacher\) return json\((?:\{ ok: false, error: 'forbidden_teacher' \}|forbiddenTeacherBody\(_vrActor\)), 403\)/.test(ADMIN));
ok('③ teacher_id 는 숫자만 받는다(오타·옛 폼이 보낸 쓰레기 차단)',
   /!\/\^\\d\+\$\/\.test\(tid\)/.test(ADMIN));

console.log(`\n결과: ${PASS} 통과, ${FAIL} 실패`);
if (FAIL) { FAILS.forEach(f => console.log(`실패: ${f}`)); process.exit(1); }
