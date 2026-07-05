/**
 * webrtc_ice_queue_harness.mjs
 * ── 화상수업 연결 안정성 회귀 가드 ──
 *
 * 검증 대상: cloudflare-deploy/public/video-call/js/webrtc.js 의 ICE 후보 큐잉.
 *   버그(수정 전): remoteDescription 설정 전에 도착한 ICE 후보를 즉시 addIceCandidate →
 *                  offer/answer 보다 먼저 오면 예외로 유실 → 간헐적으로 학생·교사 연결 실패.
 *   수정 후: remoteDescription 이 없으면 pendingCandidates 에 버퍼링 →
 *            setRemoteDescription 직후 flushPendingCandidates 로 일괄 투입.
 *
 * 방식: 실제 webrtc.js 파일을 읽어, 브라우저 전역(RTCPeerConnection 등)을 목킹한
 *       샌드박스 함수 안에서 로드한 뒤 실제 코드의 핸들러를 구동한다. (복사본이 아닌 원본 검증)
 *
 * 실행: node test-harness/webrtc_ice_queue_harness.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEBRTC_PATH = join(__dirname, '..', 'cloudflare-deploy', 'public', 'video-call', 'js', 'webrtc.js');

let pass = 0, fail = 0;
const results = [];
function ok(cond, label) { cond ? (pass++, results.push('  ✅ ' + label)) : (fail++, results.push('  ❌ ' + label)); }

// ── 최소 브라우저 목 ──
class FakeSender { constructor() { this.track = null; } getParameters() { return { encodings: [{}] }; } setParameters() { return Promise.resolve(); } }
class FakeRTCPeerConnection {
  constructor() {
    this.signalingState = 'stable';
    this.iceConnectionState = 'new';
    this.connectionState = 'new';
    this.remoteDescription = null;
    this.localDescription = null;
    this._added = [];              // addIceCandidate 로 실제 투입된 후보 기록
    this.onicecandidate = null; this.ontrack = null;
    this.oniceconnectionstatechange = null; this.onconnectionstatechange = null;
    this.onnegotiationneeded = null;
  }
  setRemoteDescription(desc) { this.remoteDescription = desc; return Promise.resolve(); }
  setLocalDescription(desc) { this.localDescription = desc; this.signalingState = desc && desc.type === 'offer' ? 'have-local-offer' : 'stable'; return Promise.resolve(); }
  createOffer() { return Promise.resolve({ type: 'offer', sdp: 'x' }); }
  createAnswer() { return Promise.resolve({ type: 'answer', sdp: 'x' }); }
  addIceCandidate(c) { if (!this.remoteDescription) return Promise.reject(new Error('InvalidStateError')); this._added.push(c); return Promise.resolve(); }
  getSenders() { return []; }
  restartIce() {}
  close() {}
}
const noop = () => {};
const fakeDoc = { addEventListener: noop, removeEventListener: noop, getElementById: () => null, querySelectorAll: () => [], createElement: () => ({ appendChild: noop, querySelector: () => ({}), style: {} }) };
const sandbox = {
  RTCPeerConnection: FakeRTCPeerConnection,
  RTCSessionDescription: function (x) { return x; },
  RTCIceCandidate: function (x) { return x; },
  navigator: { userAgent: 'node-test' },
  document: fakeDoc,
  console: { log: noop, warn: noop, error: noop },
  setTimeout: () => 0,
  localStream: null,               // addTrack/비트레이트 경로 회피 (버퍼 로직에 무관)
  sendWsMessage: noop,
  updateUserCount: noop, updateGridCount: noop, handlePdfSync: noop,
  userCount: 1,
};

// webrtc.js 를 샌드박스 함수로 감싸 로드하고 내부 핸들러/맵을 추출
const src = readFileSync(WEBRTC_PATH, 'utf8');
const names = Object.keys(sandbox);
const loader = new Function(...names,
  src + '\nreturn { handleOfferMessage, handleAnswerMessage, handleIceCandidateMessage, createPeerConnection, peerConnections, pendingCandidates };'
);
const M = loader(...names.map(n => sandbox[n]));

function nextTick() { return new Promise(r => setImmediate(r)); }

async function run() {
  // ── 시나리오 A: ICE 후보가 offer(setRemoteDescription) 보다 먼저 도착 ──
  const pc = M.createPeerConnection('peerB', 'B', false); // 수신자(non-initiator)
  ok(pc instanceof FakeRTCPeerConnection, 'A: peerConnection 생성됨');
  ok(pc.remoteDescription === null, 'A: 아직 remoteDescription 없음(선행 상태)');

  // 후보 2개가 먼저 도착 → 즉시 투입되면 안 되고 버퍼링돼야 함
  M.handleIceCandidateMessage({ fromUserId: 'peerB', candidate: { c: 1 } });
  M.handleIceCandidateMessage({ fromUserId: 'peerB', candidate: { c: 2 } });
  ok(pc._added.length === 0, 'A: remoteDescription 전 도착한 후보는 즉시 투입 안 됨(유실 방지)');
  ok((M.pendingCandidates.get('peerB') || []).length === 2, 'A: 후보 2개가 버퍼에 적재됨');

  // 이제 offer 도착 → setRemoteDescription → flush
  M.handleOfferMessage({ fromUserId: 'peerB', sdp: { type: 'offer', sdp: 'x' } });
  await nextTick(); await nextTick(); await nextTick();
  ok(pc.remoteDescription !== null, 'A: offer 처리로 remoteDescription 설정됨');
  ok(pc._added.length === 2, 'A: 버퍼된 후보 2개가 flush 되어 실제 투입됨');
  ok(!M.pendingCandidates.has('peerB'), 'A: flush 후 버퍼 비워짐');

  // ── 시나리오 B: remoteDescription 이 이미 있으면 후보는 즉시 투입 ──
  M.handleIceCandidateMessage({ fromUserId: 'peerB', candidate: { c: 3 } });
  await nextTick();
  ok(pc._added.length === 3, 'B: remoteDescription 이후 도착한 후보는 즉시 투입됨');

  // ── 시나리오 C: answer 경로도 flush 를 수행 ──
  const pc2 = M.createPeerConnection('peerC', 'C', false);
  // 강제로 have-local-offer 상태(우리가 offer 를 보낸 쪽) 흉내
  M.handleIceCandidateMessage({ fromUserId: 'peerC', candidate: { c: 9 } });
  ok((M.pendingCandidates.get('peerC') || []).length === 1, 'C: answer 전 후보 버퍼링');
  M.handleAnswerMessage({ fromUserId: 'peerC', sdp: { type: 'answer', sdp: 'x' } });
  await nextTick(); await nextTick();
  ok(pc2._added.length === 1, 'C: answer 적용 후 버퍼된 후보 flush');

  // ── 시나리오 D: 알 수 없는 피어의 후보는 무시(크래시 없음) ──
  let threw = false;
  try { M.handleIceCandidateMessage({ fromUserId: 'ghost', candidate: { c: 0 } }); } catch (_) { threw = true; }
  ok(!threw, 'D: PC 없는 피어 후보 → 예외 없이 무시');

  // ── 시나리오 E: 주 수업 경로(index.html 인라인)에도 동일한 큐잉이 유지되는지 소스 단언 ──
  //   index.html 인라인 WebRTC 는 별도 구현이라 파일을 로드하지 않고 핵심 불변식만 확인.
  const idxPath = join(__dirname, '..', 'cloudflare-deploy', 'public', 'index.html');
  const idx = readFileSync(idxPath, 'utf8');
  ok(/vcPendingCandidates/.test(idx), 'E: index.html 인라인에 ICE 버퍼(vcPendingCandidates) 존재');
  ok(/function vcFlushPendingIce/.test(idx), 'E: index.html 인라인에 flush 헬퍼(vcFlushPendingIce) 존재');
  ok(/!pc\.remoteDescription\s*\|\|\s*!pc\.remoteDescription\.type/.test(idx),
    'E: remoteDescription 전이면 즉시 addIceCandidate 하지 않고 버퍼링');
  // setRemoteDescription 3개 지점(글레어/offer/answer) 뒤에 flush 가 붙어있는지
  const flushCalls = (idx.match(/vcFlushPendingIce\(/g) || []).length;
  ok(flushCalls >= 4, `E: flush 호출이 정의+3개 적용지점 이상 존재 (${flushCalls}회)`);

  console.log('\n════════ WebRTC ICE 큐잉 회귀 가드 ════════');
  console.log(results.join('\n'));
  console.log('────────────────────────────────────────────');
  console.log(`총 ${pass + fail}건 중 ✅ ${pass} 통과 / ❌ ${fail} 실패`);
  if (fail === 0) console.log('🎉 ICE 후보 큐잉 정상 — 학생·교사 연결 안정성 회귀 없음.');
  process.exit(fail === 0 ? 0 : 1);
}

run().catch(e => { console.error('하니스 오류:', e); process.exit(2); });
