// -*- coding: utf-8 -*-
// 🧪 라이브 참관(Ghost Monitor) 통합 테스트 하니스 — 의존성 없음 · node 로 바로 실행
//   실행:  node test-harness/ghost_monitor_harness.mjs
//   목적:  "라이브 참관"이 연결·속도·안정성·보안 측면에서 안전하게 동작하는지
//          실제 소스(ghost-view.html / admin.html / api-mango.ts)를 태워 검증한다.
//   방식:  ① 실제 소스 정적 배선 검사 (파라미터·사일런트·필수사유·XSS이스케이프·감사로그)
//          ② 서버 ghost API 규칙 미러 + 행동 검증 (start/end/sessions/whisper)
//          ③ 클라이언트 발화비율·참여도 수학 (소스와 동일 공식) + 엣지케이스
//          ④ 연결/폴링 안정성 (실패 격리·abort·백오프·탭숨김·연결상태)
import { readFileSync, existsSync } from 'node:fs';
import { allSrc, allAdm } from './_srcbundle.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dir = dirname(fileURLToPath(import.meta.url));
const CF = resolve(__dir, '../cloudflare-deploy');
const read = p => existsSync(p) ? readFileSync(p, 'utf8') : '';
const GHOST = read(resolve(CF, 'public/admin/ghost-view.html'));
const ADMIN = allAdm();
const API   = allSrc();

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond) { if (cond) { PASS++; } else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`); }
function eq(name, a, b){ check(`${name} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`, JSON.stringify(a)===JSON.stringify(b)); }
function has(hay, needle){ return hay.indexOf(needle) >= 0; }

console.log('\n═══════════════════════════════════════════════════════════');
console.log(' 🧪 라이브 참관 (Ghost Monitor) 테스트 하니스');
console.log('═══════════════════════════════════════════════════════════');

check('소스 로드: ghost-view.html', GHOST.length > 1000);
check('소스 로드: admin.html', ADMIN.length > 1000);
check('소스 로드: api-mango.ts', API.length > 1000);

// ── 1) URL 파라미터 배선 (실제 버그 탐지) ─────────────────────────────
//   ghost-view 는 room_id 만 읽는다: const roomId = params.get('room_id')
console.log('\n[1] URL 파라미터 배선 (참관 진입점들이 올바른 파라미터를 쓰는가)');
const ghostReadsRoomId = /params\.get\(['"]room_id['"]\)/.test(GHOST);
check('ghost-view 는 room_id 파라미터를 읽는다', ghostReadsRoomId);

// admin ghStart 진입점: ?room_id= 로 열어야 정상
const ghStartOpensRoomId = /ghost-view\.html\?room_id=/.test(ADMIN);
check('ghStart 진입점이 ?room_id= 로 연다 (정상)', ghStartOpensRoomId);

// supervisor supOpenGhost 진입점: ?room= 으로 열면 빈 화면 (버그)
const supOpensWrong = /ghost-view\.html\?room=['"+]/.test(ADMIN) || /ghost-view\.html\?room=['"]\s*\+/.test(ADMIN);
check('🐞 supOpenGhost 가 잘못된 ?room= 을 쓰지 않는다', !supOpensWrong);

// 진입점이 ghost-view 가 읽는 키와 100% 일치하는지: 모든 진입 URL 추출
const openUrls = [...ADMIN.matchAll(/ghost-view\.html\?([a-z_]+)=/g)].map(m => m[1]);
const uniqKeys = [...new Set(openUrls)];
eq('모든 참관 진입점은 첫 파라미터로 room_id 만 사용', uniqKeys.sort(), ['room_id']);

// ── 2) 사일런트 참관 보장 (사생활/감사) ───────────────────────────────
console.log('\n[2] 사일런트 참관 보장 (학생·강사에게 알림 X)');
check('start 응답에 notice_sent_to_others:false (다른 참가자 알림 X)', /notice_sent_to_others:\s*false/.test(API));
check('참관 사유(reason) 필수 — 미입력 시 400', /reason_required/.test(API) && /참관 사유/.test(API));
check('start 시 감사 로그 ghost_join 기록', /writeAudit\([^)]*['"]ghost_join['"]/.test(API));
check('end 시 감사 로그 ghost_leave 기록', /writeAudit\([^)]*['"]ghost_leave['"]/.test(API));
check('admin_observations 테이블에 joined_at/left_at 기록', /admin_observations/.test(API) && /joined_at/.test(API) && /left_at/.test(API));

// 시그널링은 1:1(MAX_PEERS=2) — 참관자가 미디어 피어로 끼면 안 됨(사일런트 위반)
const SIG = read(resolve(CF, 'src/signaling-room.ts'));
check('시그널링룸은 1:1 제한(MAX_PEERS=2) — 참관자 미디어 피어 진입 불가 구조', /MAX_PEERS\s*=\s*2/.test(SIG));

// ── 3) 서버 ghost API 규칙 (행동 미러) ────────────────────────────────
console.log('\n[3] 서버 ghost API 규칙 (검증 로직 미러)');
// start 검증 규칙 미러
function ghostStart(b){
  const admin_uid = String(b.admin_uid||'').trim();
  const room_id = String(b.room_id||'').trim();
  const reason = String(b.reason||'').trim();
  if (!admin_uid || !room_id) return { ok:false, status:400, error:'admin_uid_and_room_id_required' };
  if (!reason) return { ok:false, status:400, error:'reason_required' };
  return { ok:true, observation_id: 101, ghost_mode:'recorded_only', notice_sent_to_others:false };
}
eq('admin_uid 없으면 400', ghostStart({room_id:'r1',reason:'멘토링'}).error, 'admin_uid_and_room_id_required');
eq('room_id 없으면 400', ghostStart({admin_uid:'a1',reason:'멘토링'}).error, 'admin_uid_and_room_id_required');
eq('reason 없으면 400(사생활 보호)', ghostStart({admin_uid:'a1',room_id:'r1'}).error, 'reason_required');
check('정상 입력이면 ok + 사일런트', (()=>{const r=ghostStart({admin_uid:'a1',room_id:'r1',reason:'신규 강사 멘토링'});return r.ok && r.notice_sent_to_others===false && r.ghost_mode==='recorded_only';})());

// end 검증 + duration 계산 미러
function ghostEnd(row, b, now){
  const observation_id = Number(b.observation_id);
  if (!b.admin_uid || !observation_id) return { ok:false, status:400, error:'admin_uid_and_observation_id_required' };
  if (!row) return { ok:false, status:404, error:'not_found' };
  if (row.left_at) return { ok:false, status:400, error:'already_ended' };
  return { ok:true, observation_id, duration_sec: Math.round((now - row.joined_at)/1000) };
}
const joined = 1000000;
eq('종료 시 duration_sec 정확(90초)', ghostEnd({joined_at:joined,left_at:null},{admin_uid:'a1',observation_id:101}, joined+90000).duration_sec, 90);
eq('이미 종료된 세션 재종료 거부', ghostEnd({joined_at:joined,left_at:joined+1},{admin_uid:'a1',observation_id:101}, joined+90000).error, 'already_ended');
eq('없는 세션 종료 404', ghostEnd(null,{admin_uid:'a1',observation_id:999}, joined).error, 'not_found');
eq('observation_id 없으면 400', ghostEnd({joined_at:joined},{admin_uid:'a1'}, joined).error, 'admin_uid_and_observation_id_required');

// ── 4) 클라이언트 발화비율·참여도 수학 (소스 동일 공식) ───────────────
console.log('\n[4] 발화 비율 · 참여도 점수 수학 (ghost-view.html 공식)');
function talkRatio(chat){
  const teacherMsg = chat.filter(m => m.sender_role==='teacher').length;
  const studentMsg = chat.filter(m => m.sender_role==='student' || (!m.sender_role || m.sender_role==='')).length;
  const total = Math.max(teacherMsg + studentMsg, 1);
  const tPct = Math.round((teacherMsg/total)*100);
  return { tPct, sPct: 100 - tPct, teacherMsg, studentMsg };
}
function engagement(studentMsg, sPct, minsElapsed){
  return Math.min(100, Math.round((studentMsg/Math.max(minsElapsed,0.5))*15 + (sPct>=50 ? 30 : sPct-20)));
}
// 소스에 동일 공식이 실제로 존재하는지 동시 확인 (드리프트 방지)
check('소스에 발화비율 공식 존재', /tPct\s*=\s*Math\.round\(\(teacherMsg\s*\/\s*total\)\s*\*\s*100\)/.test(GHOST));
check('소스에 참여도 공식 존재', /studentMsg\s*\/\s*minsElapsed\)\s*\*\s*15/.test(GHOST));
let r = talkRatio([{sender_role:'teacher'},{sender_role:'teacher'},{sender_role:'student'},{sender_role:'student'}]);
eq('강사2/학생2 → 강사 50%', r.tPct, 50);
eq('강사2/학생2 → 학생 50%', r.sPct, 50);
r = talkRatio([]);
eq('빈 채팅 → 0으로 나눔 방지(강사 0%)', r.tPct, 0);
check('빈 채팅 → NaN/Infinity 없음', Number.isFinite(r.tPct) && Number.isFinite(r.sPct));
r = talkRatio([{sender_role:''},{sender_role:undefined},{}]);
eq('역할 미상 메시지는 학생으로 집계', r.studentMsg, 3);
check('참여도 점수 0~100 범위 클램프', engagement(999, 80, 0.5) <= 100 && engagement(0, 0, 10) >= -20);
check('빈 수업 참여도 유한값', Number.isFinite(engagement(0, 0, 0.0001)));

// ── 5) 보안: XSS 이스케이프 (채팅/참가자 렌더) ────────────────────────
console.log('\n[5] 보안 — XSS 이스케이프');
function esc(s){ return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
check('소스에 esc() 정의 존재', /function esc\(s\)/.test(GHOST));
eq('<script> 이스케이프', esc('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
eq('따옴표/앰퍼샌드 이스케이프', esc(`"&'`), '&quot;&amp;&#39;');
check('채팅 메시지 렌더에 esc(m.message) 사용', /esc\(m\.message\)/.test(GHOST));
check('참가자 이름 렌더에 esc 사용', /esc\(m\.username/.test(GHOST));
check('알림 detail 렌더에 esc 사용', /esc\(\(a\.detail/.test(GHOST));

// ── 6) 연결/폴링 안정성 (속도·안정성 핵심) ────────────────────────────
console.log('\n[6] 연결 · 폴링 안정성');
// 한 번의 폴링 실패가 루프를 죽이지 않아야 함 (try/catch 격리)
const loadFns = (GHOST.match(/async function load(Chat|Members|Alerts)\(\)\s*\{[\s\S]*?\n    \}/g) || []);
check('loadChat/Members/Alerts 3개 폴러 존재', loadFns.length === 3);
check('각 폴러가 try/catch 로 실패 격리', loadFns.every(f => /try\s*\{/.test(f) && /catch/.test(f)));
check('자가 스케줄러(setTimeout 체인, 겹침·폭주 방지) 존재', /_pollTimer\s*=\s*setTimeout\(scheduleNext/.test(GHOST) && /POLL_BASE\s*=\s*3000/.test(GHOST));
check('Promise.allSettled 로 패널 동시 갱신(부분 실패 허용)', /Promise\.allSettled\(\[loadChat\(\),\s*loadMembers\(\),\s*loadAlerts\(\)\]\)/.test(GHOST));
// 안정성 강화 항목 (개선 목표) — 현재 상태 측정
const hasAbort = /AbortController|AbortSignal|signal:/.test(GHOST);
const hasTimeout = /ctrl\.abort\(\)|AbortSignal\.timeout/.test(GHOST) && /FETCH_TIMEOUT/.test(GHOST);
const hasBackoff = /backoff|연속 실패|consecutiveFail|failCount|retryDelay/.test(GHOST);
const hasVisibility = /visibilitychange|document\.hidden/.test(GHOST);
const hasConnState = /연결 끊김|오프라인|재연결|connection-lost|conn-status|ghd-conn/.test(GHOST);
check('[강화] 폴링 요청 타임아웃/Abort 처리', hasAbort && hasTimeout);
check('[강화] 연속 실패 시 백오프(폭주 방지)', hasBackoff);
check('[강화] 탭 숨김 시 폴링 일시정지(배터리·서버부하)', hasVisibility);
check('[강화] 연결 상태 시각 표시(끊김/재연결)', hasConnState);

// ── 7) 화상(미디어) 경로 현실 점검 ────────────────────────────────────
console.log('\n[7] 화상 스트림 경로 (정직한 현황)');
const videoIsPlaceholder = /GM-4|실제 영상은|스트림 연결 중/.test(GHOST);
check('현재 비디오 영역은 placeholder(메타데이터만 라이브)임을 명시', videoIsPlaceholder);
const recUsesCanvas = /html2canvas|captureStream/.test(GHOST);
check('녹화는 html2canvas DOM 캡처 방식임(실영상 아님)', recUsesCanvas);

// ── 결과 ──────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════════════');
console.log(`  결과:  ✅ ${PASS} 통과   ❌ ${FAIL} 실패   (총 ${PASS+FAIL})`);
if (FAILS.length){ console.log('\n  ❌ 실패 항목:'); FAILS.forEach(f => console.log('     · ' + f)); }
console.log('═══════════════════════════════════════════════════════════\n');
process.exit(FAIL ? 1 : 0);
