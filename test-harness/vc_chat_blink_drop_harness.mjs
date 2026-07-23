// -*- coding: utf-8 -*-
// 🥭 (2026-07-24) 사장님 신고 3건 회귀 하네스 — 의존성 없음 · node 로 바로 실행
//   실행: node test-harness/vc_chat_blink_drop_harness.mjs
//   ① 채팅 자동열기(A안)      — 상대가 채팅하면 열되, 수업 흐름을 깨는 상황에선 독 배지만
//   ② 카메라/마이크 깜빡임     — 워치독 오인 + 감시루프 중복 + 독 아이콘 재생성
//   ③ 필리핀 강사 튕김        — pong 워치독 · dropped 타일 유지 · 정원초과 무한루프 · close 로그
//
//   ⚠️ 이 파일은 "왜 이렇게 짰는지"를 보존하는 용도다. 아래 항목이 깨지면
//      과거에 실제로 났던 사고가 그대로 재발한다는 뜻이므로 지우지 말 것.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dir = dirname(fileURLToPath(import.meta.url));
const R = (p) => readFileSync(resolve(__dir, p), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
function ok(name, cond){
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
}

const IDX  = R('../cloudflare-deploy/public/index.html');
const DOCK = R('../cloudflare-deploy/public/js/vc-dock.js');
const DO   = R('../cloudflare-deploy/src/video-call-room.ts');
const WT   = R('../cloudflare-deploy/wrangler.toml');

// ── ① 채팅 자동열기 ────────────────────────────────────────────
console.log('\n[ ① 상대 채팅 시 자동열기 (A안) ]');
ok('열기 전용 멱등 함수 vcOpenChat 존재 (토글로 열면 열려있을 때 오히려 닫힘)',
   /function vcOpenChat\(\)/.test(IDX) && /if \(!panel \|\| panel\.classList\.contains\('open'\)\) return;/.test(IDX));
ok('vcToggleChat 이 vcOpenChat 을 재사용', /function vcToggleChat\(\)[\s\S]{0,220}vcOpenChat\(\);/.test(IDX));
ok('수신 지점에서 자동열기 호출', /vcChatAutoOpen\(\);/.test(IDX));

// 가드 — 하나라도 빠지면 실제 사고가 났던 항목들
ok('가드: 내가 보낸 메시지 제외(서버가 보낸사람에게도 에코)', /if \(!isMine && !isSystem && !data\._loadedAt/.test(IDX));
ok('가드: 시스템 안내 제외(입·퇴장마다 창이 열리던 문제)', /!isSystem/.test(IDX));
ok('가드: 과거 대화 재생 제외(입장하자마자 창이 열리던 문제)', /!data\._loadedAt/.test(IDX));
ok('가드: 수업 중이 아니면 무시', /vcChatAutoOpen[\s\S]{0,400}classList\.contains\('vc-in-call'\)/.test(IDX));
ok("가드: 모바일 세로 + 회전안내 미해제(blur·pointer-events 유령창 방지)",
   /_vw > 0 && _vw <= 920 && _vh > _vw && !body\.classList\.contains\('vc-orientation-dismissed'\)/.test(IDX));
ok('가드: 뷰포트 0 보고 시 세로로 오판하지 않음(숨은 탭에서 PC 자동열기가 막히던 문제)',
   /_vw > 0 &&/.test(IDX));
ok('가드: 교사 집중모드에서는 열지 않음', /__vcFocusLockedByTeacher === true\) blocked/.test(IDX));
ok('가드: 게임·미션 플레이 중에는 열지 않음', /getElementById\('game-suite-frame'\)\) blocked/.test(IDX));
ok('열지 못한 상황에서는 독 배지로 대신 알림(A안 핵심)',
   /if \(blocked\) \{[\s\S]{0,160}vcDockChatBadge\(chatUnread, true\)/.test(IDX));
ok('⚠️ 자동열기에서 입력칸 focus 금지(모바일 키보드가 화면을 또 덮음)',
   !/vcChatAutoOpen[\s\S]{0,900}\.focus\(\)/.test(IDX));

console.log('\n[ ①-b 하단 독 채팅 배지 (모바일은 상단 배지가 숨겨져 있어 인지 불가였음) ]');
ok('독에 배지 엘리먼트 부착', /id = 'vc-dock-chat-badge'/.test(DOCK));
ok('전역 제어 함수 window.vcDockChatBadge', /window\.vcDockChatBadge = function\(n, pulse\)/.test(DOCK));
ok('배지 CSS + 깜빡임 애니메이션', /\.dock-badge/.test(DOCK) && /vcDockBadgePulse/.test(DOCK));
ok('깜빡임은 pulse 인자가 있을 때만(늘 깜빡이면 무시하게 됨)', /_chatPulse = !!pulse && _chatUnread > 0/.test(DOCK));
ok('채팅 버튼을 누르면 배지 즉시 해제', /bChat\.onclick[\s\S]{0,140}vcDockChatBadge\(0\)/.test(DOCK));
ok('채팅창을 열면 배지 해제', /function vcOpenChat[\s\S]{0,360}vcDockChatBadge\(0\)/.test(IDX));

// ── ② 카메라/마이크 깜빡임 ─────────────────────────────────────
console.log('\n[ ② 카메라·마이크 토글 깜빡임 ]');
ok('토글은 여전히 track.enabled 방식(getUserMedia 재획득 아님)',
   /audioTracks\.forEach\(t => t\.enabled = vcMicOn\)/.test(IDX) &&
   /getVideoTracks\(\)\.forEach\(t => t\.enabled = vcCamOn\)/.test(IDX));
ok('window.vcMicOn 동기화(안 하면 독 버튼이 꺼져도 안 빨개져 계속 다시 누름)', /window\.vcMicOn = vcMicOn;/.test(IDX));
ok('window.vcCamOn 동기화', /window\.vcCamOn = vcCamOn;/.test(IDX));
ok('독 아이콘은 상태가 바뀐 순간에만 교체(1.5초마다 SVG 재생성 → 깜빡임)',
   /btnMic\.__iconOn !== micOn/.test(DOCK) && /btnCam\.__iconOn !== camOn/.test(DOCK));
// 🔴 (2026-07-24 재점검) 판정을 '추측' 에서 '상대가 보낸 신호' 로 바꿨다.
//    옛 휴리스틱(audioAlive)은 ①비디오만 굶어 죽은 진짜 장애를 카메라 끔으로 오인해 복구를 막고
//    ②마이크 없는 참가자에겐 아예 안 걸렸다. 되살리지 말 것.
// (주석에 이름이 남는 건 기록으로서 유용하므로, '실제 코드' 가 없는지를 본다)
ok('워치독이 옛 audioAlive 휴리스틱을 쓰지 않는다(진짜 장애까지 막던 코드)',
   !/var audioAlive =/.test(IDX) && !/rv\.track\.muted && audioAlive/.test(IDX));
ok('카메라 상태를 상대에게 브로드캐스트', /function vcBroadcastCamState/.test(IDX) && /type: 'cam-state'/.test(IDX));
ok('보내는 쪽이 자기 userId 를 실어 준다(서버는 data 를 그대로 중계)',
   /data: \{ userId: vcUserId, camOn:/.test(IDX));
ok('서버가 cam-state 를 중계 대상에 포함', /case 'cam-state':/.test(DO));
ok('수신 측이 cam-state 를 기록', /case 'cam-state': \{[\s\S]{0,320}vcRemoteCamOff/.test(IDX));
ok('워치독은 받은 신호로만 판정(신호 없으면 예전대로 자가복구 = 안전한 쪽)',
   /var camOff = \(window\.vcRemoteCamOff \|\| \{\}\)\[id\];[\s\S]{0,320}if \(camOff\) \{/.test(IDX));
ok('그 경우 재시도 카운터도 리셋(다음에 진짜 장애면 정상 발동)',
   /if \(camOff\) \{[\s\S]{0,120}tries\[id\] = 0;/.test(IDX));
ok('🔴 재협상은 막되 안내문은 반드시 남긴다(안내까지 지우면 사용자는 고장으로 인식)',
   /if \(camOff\) \{[\s\S]{0,300}vcApplyRemoteCamHint\(id\);/.test(IDX));
ok('상대 타일 카메라꺼짐 안내가 한/영 둘 다', /Camera is off/.test(IDX) && /상대가 카메라를 껐어요/.test(IDX));
ok('저대역폭 음성전용(AAO)도 상대에게 알린다(대역폭 위기 중 재협상은 최악)',
   /vcBroadcastCamState\(false, 'aao'\)/.test(IDX));
ok('AAO 상황은 안내 문구를 따로 준다', /audio only for now/.test(IDX) && /음성만<\/b> 전송 중이에요/.test(IDX));
ok('나중에 들어온 사람에게도 현재 카메라 상태를 알린다',
   /window\.vcCamOn === false\) vcBroadcastCamState\(false, 'user'\)/.test(IDX));
ok('퇴장 시 카메라 상태 기록도 정리', /delete window\.vcRemoteCamOff\[userId\]/.test(IDX));
ok('onunmute 가 타일 전체를 다시 그리지 않음(붙어 있으면 재생만)',
   /event\.track\.onunmute = function\(\)[\s\S]{0,420}if \(_v && _v\.srcObject\)[\s\S]{0,80}return;/.test(IDX));
ok('attachStreamMonitor 중복 등록 방지(루프·AudioContext 누적)',
   /if \(box\.__vsMon\)/.test(IDX) && /box\.__vsMon\.key === monKey\) return;/.test(IDX));
// 🔴 스트림 객체만으로 판정하면, 같은 스트림에 마이크가 뒤늦게 추가된 경우 재등록이 막혀
//    그 참가자의 음량 막대가 수업 끝까지 죽는다(마이크 거부 후 복구 경로에서 실제 발생).
ok('중복 판정 키에 오디오 트랙 id 포함(마이크 뒤늦게 복구되는 경우)',
   /const monKey = \(stream\.id \|\| ''\) \+ '\|' \+ \(_at0 \? _at0\.id : 'noaudio'\)/.test(IDX));
ok('음량 분석 실패 시 AudioContext 를 닫는다(누수)',
   /catch\(e\) \{[\s\S]{0,260}mon\.ctx\.close\(\); mon\.ctx = null;/.test(IDX));
ok('마이크 진단 복구도 window.vcMicOn 을 맞춘다(독이 빨간 채 굳던 회귀)',
   /window\.vcMicOn = true;\s*\/\/ 🔴 \(2026-07-24 재점검\)/.test(IDX));
ok('마이크 재획득 경로도 동일', /vcMicOn = true; window\.vcMicOn = true;/.test(IDX));
ok('스트림이 바뀌면 옛 루프를 확실히 정리', /clearInterval\(box\.__vsMon\.iconInt\)/.test(IDX) && /__vsMon\.ctx && box\.__vsMon\.ctx\.close\(\)/.test(IDX));
ok('rAF 루프도 정지 플래그를 확인', /if \(mon\.stop \|\| !box\.isConnected\)/.test(IDX));

// ── ③ 필리핀 강사 튕김 ─────────────────────────────────────────
console.log('\n[ ③ 필리핀 강사 수업 중 튕김 ]');
ok('pong 수신을 실제로 확인한다(예전엔 그냥 버려서 반열림 소켓을 영영 못 알아챘음)',
   /data\.type === 'pong'\) \{ resetPongState\(\); return; \}/.test(IDX));
ok('pong 무응답이면 강제 close → 기존 재연결 경로 진입', /ws\.close\(4002, 'pong-timeout'\)/.test(IDX));
// 🔴 처음엔 'PONG_TIMEOUT=20초' 로 짰는데 판정 주기가 25초라 항상 초과 = 사실상 1회 유실에 즉시 절단이었다.
//    지연이 잦은 필리핀 회선에서 이 워치독이 오히려 멀쩡한 수업을 끊을 수 있었다. 시간이 아니라 횟수로 판정할 것.
{
  const m = IDX.match(/const PONG_MAX_MISS = (\d+);/);
  ok(`무응답 허용 횟수가 2회 이상 (현재 ${m ? m[1] : '없음'})`, !!m && Number(m[1]) >= 2);
}
ok('시간 기반 판정(PONG_TIMEOUT)을 되살리지 않았다', !/const PONG_TIMEOUT/.test(IDX));
ok('복귀·재연결 시 pong 대기상태를 비운다(복귀 첫 틱이 멀쩡한 소켓을 죽이던 문제)',
   /function resetPongState\(\)/.test(IDX)
   && /notePongResume\(\) \{ resetPongState\(\); \}/.test(IDX)
   && /vcOnAppResume[\s\S]{0,420}notePongResume\(\)/.test(IDX));
ok('새 소켓을 만들기 전에도 비운다(낡은 인터벌이 새 소켓을 죽이던 문제)',
   /function connect\(\) \{[\s\S]{0,420}resetPongState\(\);/.test(IDX));

// 🔴 pong 워치독이 '안전한' 이유는 아래 3개 전제 위에 서 있다. 하나라도 깨지면
//    45초마다 멀쩡한 소켓을 끊고 재연결하는 무한루프가 된다. 반드시 함께 지킬 것.
{
  const callers = [...IDX.matchAll(/createWebSocket\(\s*\n?\s*`([^`]+)`/g)].map(m => m[1]);
  ok(`전제①: createWebSocket 호출처가 전부 /ws/video-call (현재 ${callers.length}곳)`,
     callers.length >= 2 && callers.every(p => p.startsWith('/ws/video-call')));
}
ok('전제②: 서버가 ping 에 pong 을 돌려준다', /case 'ping':\s*this\.send\(userId, \{ type: 'pong'/.test(DO));
ok('전제③: ping 응답에 join 여부 검사가 없다(관찰자도 pong 을 받아야 함)',
   !/case 'ping'[\s\S]{0,80}isJoined/.test(DO));
ok('전제③-b: 소켓 accept 시점에 userId 를 붙인다(입장 전에도 send 가 도달)',
   /server\.serializeAttachment\(\{ userId, roomId: this\.roomId, joined: false \}/.test(DO));
ok('ping 주기 25초는 그대로 유지(Cloudflare 유휴 타임아웃 방지)', /\}, 25000\); \/\/ 25초마다 ping/.test(IDX));
ok('정원초과·강제종료는 재연결 중단(예전엔 거절→재연결 무한루프)',
   /data\.type === 'room-full' \|\| data\.type === 'force_end'[\s\S]{0,200}intentionalClose = true;/.test(IDX));
ok('그 이유를 화면에 한/영으로 안내(조용히 멈추면 "그냥 튕겼다"로 보임)',
   /This class room is full/.test(IDX) && /정원\(10명\)이 가득/.test(IDX));
ok('vcRemovePeer 가 reason 을 실제로 받음', /function vcRemovePeer\(userId, reason\)/.test(IDX));
ok("순단(dropped)에는 타일을 지우지 않고 '재연결 중'으로 유지", /reason && reason !== 'left'\)[\s\S]{0,500}vcMarkPeerReconnecting\(box\)/.test(IDX));
ok('강제종료·정원초과는 되돌릴 수 없는 플래그로 못박음(탭 전환으로 되살아나던 문제)',
   /let terminated = false;/.test(IDX) && /if \(terminated\) \{ console\.log\('\[WebSocket\] 종료된 세션/.test(IDX));
ok('수업을 나갈 때 유령 타일과 종료 안내 배너를 정리',
   /function vcLeaveRoom[\s\S]{0,400}vcSweepGhostTiles\(\)[\s\S]{0,200}vc-conn-notice/.test(IDX));
ok('새 참가자 입장 시에도 유령 타일을 먼저 치운다(1:1 인데 타일 3개 되던 문제)',
   /case 'user-joined':[\s\S]{0,500}vcSweepGhostTiles\(\)/.test(IDX));
ok('유령 타일은 반드시 시간제한(재접속 시 새 userId 라 안 지우면 영구히 남음)',
   /VC_GHOST_TILE_MS = \d+/.test(IDX) && /box\.dataset\.vcGhost === '1'\) \{ box\.remove\(\)/.test(IDX));
ok('상대가 돌아오면 유령 타일 즉시 정리(타일 2개로 보이는 것 방지)',
   /function vcAddRemoteVideo[\s\S]{0,400}vcSweepGhostTiles\(\)/.test(IDX));
ok('전체 피어 정리에서도 유령 타일 청소', /function vcCleanupAllPeers[\s\S]{0,700}vcSweepGhostTiles\(\)/.test(IDX));
// 🔴 유령 id 의 접두사가 'vc-video-' 와 겹치면 안 된다. 겹치면 저장소 곳곳의
//    id.replace('vc-video-','') / [id^="vc-video-"] 가 유령을 '진짜 참가자' 로 잡아
//    개별채팅 대상칩·칭찬 버튼·고착 워치독·녹화 합성까지 오염된다(실제로 6곳이 깨졌었다).
ok("유령 타일 id 접두사가 'vc-video-' 와 겹치지 않음", /box\.id = 'vcghost-' \+ userId/.test(IDX));
ok('유령 판별은 접두사가 아니라 data 속성으로', /\.video-box\[data-vc-ghost="1"\]/.test(IDX));
ok('재연결 중 안내는 한/영 둘 다', /Reconnecting…/.test(IDX) && /재연결 중…/.test(IDX));

console.log('\n[ ③-b 사후 분석용 로그 (없으면 다음 장애도 추측만 하게 됨) ]');
ok('close code 를 서버 로그에 남김', /\[VideoChat\]\[close\][\s\S]{0,120}code=\$\{code\}/.test(DO));
ok('webSocketError 도 로그', /\[VideoChat\]\[error\]/.test(DO));
ok('Workers Logs 저장 활성화(기본 환경)', /\[observability\]\s*\nenabled = true/.test(WT));
ok('Workers Logs 저장 활성화(운영 환경 — 실제 적용되는 쪽)', /\[env\.production\.observability\]\s*\nenabled = true/.test(WT));

// ── 되살리면 안 되는 것 (CLAUDE.md 1-3) ──────────────────────────
console.log('\n[ ④ 기존 안전장치가 살아 있는지 ]');
ok("dropped 로 수업을 자동 종료하지 않음", /zeroStreak = 0;\s+\/\/ 조용한 끊김은 종료 카운트를 쌓지 않음/.test(IDX));
ok('저대역 오디오 전용(AAO) 모드 유지', /usedtx=1/.test(IDX));
ok('수업 중 WebSocket 무제한 재연결 유지', /reconnectAttempts < MAX_RECONNECT \|\| inCall/.test(IDX));

console.log(`\n결과: ${PASS} 통과, ${FAIL} 실패`);
if (FAIL) { console.log('실패:', FAILS.join(', ')); process.exit(1); }
