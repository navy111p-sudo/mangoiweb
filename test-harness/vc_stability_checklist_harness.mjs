/**
 * 🛡 화상수업 안정성 체크리스트 하네스 (코드로 된 체크리스트)
 * -----------------------------------------------------------------------------
 * 끊김·튕김·음성지연 방지 장치가 실제 소스(index.html + video-call-room.ts)에
 * 전부 살아있는지 정적으로 검증한다. 리팩터링/수정 중 안전장치가 실수로
 * 지워지는 회귀를 잡는 게 목적. (항목 하나 = 운영 체크리스트 한 줄)
 *
 * 실행: node test-harness/vc_stability_checklist_harness.mjs
 * 통과 기준: 전 항목 ✅ (exit code 0)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, '..', 'cloudflare-deploy', 'public', 'index.html'), 'utf8');
const doTs = readFileSync(join(__dirname, '..', 'cloudflare-deploy', 'src', 'video-call-room.ts'), 'utf8');

let pass = 0, fail = 0;
const section = (t) => console.log('\n── ' + t + ' ──');
const ok = (label, cond) => {
  if (cond) { pass++; console.log('  ✅ ' + label); }
  else { fail++; console.log('  ❌ ' + label); }
};
const has = (re) => (re instanceof RegExp ? re.test(html) : html.includes(re));

console.log('🛡 화상수업 안정성 체크리스트 — ' + new Date().toISOString());

/* ═══════════════ 1. ICE / TURN 연결 설정 ═══════════════ */
section('1. ICE/TURN 연결 설정');
ok('동적 TURN 자격증명 로드(/api/turn-config)', has("fetch('/api/turn-config')"));
ok('STUN 폴백 기본값(구글+Cloudflare) 존재', has('stun:stun.l.google.com:19302') && has('stun:stun.cloudflare.com:3478'));
ok('연결 직전 TURN 보장(vcEnsureIceServers) 정의', has('function vcEnsureIceServers'));
ok('vcEnsureIceServers: 4시간 만료 자격증명 재발급', has(/4\s*\*\s*3600\s*\*\s*1000/));
ok('vcEnsureIceServers: 3초 타임아웃(수업 지연 금지)', has(/Promise\.race\(\[__vcIcePromise,\s*new Promise\(r => setTimeout\(r,\s*3000\)\)\]\)/));
ok('vcJoinRoom 입장 시 TURN 확보 대기(await)', has(/await vcEnsureIceServers\(\)/));
ok('피어 재연결 시 TURN 재발급(vcReconnectPeer 내부)', /vcEnsureIceServers\(\)\.catch/.test(html));
ok('PC 설정: bundlePolicy max-bundle(포트 단일화)', has("bundlePolicy: 'max-bundle'"));
ok('PC 설정: rtcpMuxPolicy require', has("rtcpMuxPolicy: 'require'"));
ok('PC 설정: iceCandidatePoolSize 사전 후보수집', has(/iceCandidatePoolSize:\s*[1-9]/));

/* ═══════════════ 2. 미디어 품질 / 적응형 비트레이트 ═══════════════ */
section('2. 미디어 품질 · 적응형 비트레이트');
ok('Opus 인밴드 FEC(패킷손실 음성복원) SDP 튜닝', has('useinbandfec=1'));
ok('오디오 비트레이트 여유(maxaveragebitrate=40000)', has('maxaveragebitrate=40000'));
ok('오디오 네트워크 우선순위 high(소리 우선 생존)', has(".networkPriority = 'high'"));
ok('적응 화질 조절기 존재(vcAdaptiveQuality)', has('vcAdaptiveQuality'));
ok('  · 하향 조건: 손실 >6% 또는 RTT >450ms', has(/lossPct > 6 \|\| rtt > 450/));
ok('  · 상향 조건: 3틱 연속 양호(진동 방지)', has(/__qGood.*>=\s*3/) || has('pc.__qGood >= 3'));
ok('  · 바닥 보장: 150kbps / 10fps', has(/Math\.max\(150 \* 1000/) && has(/Math\.max\(10,/));
/* (2026-07-23) 설정의 화질(자동/고/저)이 기준 해상도를 정하게 되면서 식이
   `SCALE[step]` → `(caps.scale||1) * (SCALE[step]||1)` 로 바뀌었다.
   '단계별로 해상도를 줄인다'는 안전장치 자체는 그대로이므로, 글자 그대로가 아니라 의미로 검사한다. */
ok('  · 해상도 축소(scaleResolutionDownBy) 단계 적용',
   has(/scaleResolutionDownBy\s*=[^;\n]*SCALE\[step\]/));
ok('  · 구형 브라우저 scale 거부 시 비트레이트만 폴백', has('delete p2.encodings[0].scaleResolutionDownBy'));
ok('송신 상한: 모바일 500kbps / PC 1200kbps', has(/isMobile \? 500 : 1200/));
ok('degradationPreference balanced(부하 시 균형 저하)', has("degradationPreference = 'balanced'"));
ok('백그라운드 시 비디오 인코딩 정지(발열·배터리)', has('vcBackgroundThrottle'));

/* ═══════════════ 3. 시그널링(WebSocket) 생존성 ═══════════════ */
section('3. 시그널링(WebSocket) 생존성');
ok('지수 백오프 재연결(1s→16s 캡)', has(/Math\.min\(1000 \* Math\.pow\(2,.*16000\)/));
ok('수업 중(vc-in-call) 무한 재시도 — 영구 포기 금지', has(/reconnectAttempts < MAX_RECONNECT \|\| inCall/));
ok('keepalive ping 25초(Cloudflare 유휴 타임아웃 방지)', has(/}, 25000\);/) && has("type: 'ping'"));
ok('서버(DO) pong 응답 존재', /case 'ping':\s*this\.send\(userId,\s*\{\s*type:\s*'pong'/.test(doTs));
ok('재연결 시 공유 메시지 재전송 큐(QUEUEABLE_TYPES)', has('QUEUEABLE_TYPES') && has('tab-sync') && has('file-share'));
ok('의도적 종료는 close(1000) 명시(dropped 오인 방지)', has("ws.close(1000, 'client-close')"));
ok('reconnectNow(): 앱 복귀 시 즉시 재연결', has('reconnectNow()'));

/* ═══════════════ 4. P2P 자동 복구(끊김·튕김 방지) ═══════════════ */
section('4. P2P 자동 복구');
ok('ICE failed → restartIce + 피어 재생성(vcReconnectPeer)', has(/st === 'failed'/) && has('function vcReconnectPeer'));
ok('ICE disconnected → 5초 유예 후 재연결', has(/'5초 후 재시도'|5000\);/));
ok('vcReconnectPeer 8초 쿨다운(재연결 폭주 방지)', has(/< 8000\) return/));
ok('글레어 방지: userId 작은 쪽만 즉시 offer', has(/String\(vcUserId\) < String\(userId\)/));
ok('백업 offer: 상대 offer 4초 미수신 시 내가 offer', has(/백업 offer/));
ok('ICE 후보 버퍼링(vcPendingCandidates, 순서 역전 대비)', has('vcPendingCandidates'));
ok('고착 피어 워치독(연결중 멈춤 자동 재빌드)', has('vcStuckPeerWatch'));
ok('영상 프리즈 워치독(framesDecoded 8초 정지 감지)', has('vcVideoFreezeWatch') && has('framesDecoded'));
ok('오디오 워치독(수신 중 출력막힘 자동 복구)', has('vcAudioWatchdog'));
ok('5초 주기 상태 감시(failed/disconnected 청소부)', has(/__discSince/));
ok('online 이벤트 → WS+전체 피어 즉시 복구', has(/addEventListener\('online'/) && has(/네트워크 복귀\(online\)/));
ok('offline 이벤트 → 재연결 배너 표시', has(/addEventListener\('offline'/));
ok('앱 복귀(vcOnAppResume): 마이크·카메라 자가치유', has('vcHealLocalMic') && has('vcHealLocalVideo'));
ok('WakeLock 재획득(화면 꺼짐 방지 유지)', has('requestWakeLock'));
ok('재연결 배너("재연결 중…") + 자동 숨김', has('vc-reconnect-banner') && has('vcEvalReconnecting'));

/* ═══════════════ 5. 수업 절대 안 끊김(자동종료 금지) ═══════════════ */
section('5. 수업 절대 안 끊김');
ok('서버: 명시적 나가기(left)와 네트워크 끊김(dropped) 구분', /left|dropped/.test(doTs) && doTs.includes('dropped'));
ok('조용한 끊김(dropped)으로는 자동종료 안 함', has('__vcPeerLeftExplicit'));
ok('끊김 유예 대기 플래그(__vcPeerGraceWait)', has('__vcPeerGraceWait'));

/* ═══════════════ 6. 옵저버 폭주 방지(홈 먹통 재발 가드) ═══════════════ */
section('6. 옵저버 폭주 방지');
// 26-07-14 라이브 장애: body class 옵저버 콜백이 무조건 classList.remove() →
// remove 는 클래스가 없어도 속성을 다시 써 mutation 재발생 → 자기 자신 무한 재귀 → 메인스레드 정지.
// 옵저버 콜백 안의 remove('vc-vp-tools-open')는 반드시 contains() 가드 필수.
ok('vc-vp-tools-open 제거는 contains() 가드 후에만', has("if (document.body.classList.contains('vc-vp-tools-open')) document.body.classList.remove('vc-vp-tools-open')"));

/* ═══════════════ 결과 ═══════════════ */
console.log('\n════════════════════════════════════');
console.log(fail === 0
  ? `🎉 안정성 체크리스트 전 항목 통과: ${pass}/${pass + fail}`
  : `⚠️ 실패 ${fail}건 / 통과 ${pass}건 — 위 ❌ 항목의 안전장치가 소스에서 사라졌는지 확인 필요`);
process.exit(fail === 0 ? 0 : 1);
