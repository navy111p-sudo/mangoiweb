/**
 * webrtc.js – WebRTC 피어 연결 관리
 * 비트레이트 상한(F)/ICE 재시작(G)/적응형 화질 로직은 media-utils.js 로 분리(테스트 가능)
 */
const peerConnections = new Map(); // peerId -> RTCPeerConnection
// STUN + TURN(릴레이) 구성. media-utils.js 의 buildIceServers() 사용.
// (까다로운 NAT/방화벽에서도 통화가 성사되도록 TURN 폴백 포함)
// 기본은 정적 폴백. 입장 시 app.js 가 /api/turn-config 결과로 교체한다.
var ICE_SERVERS = buildIceServers();

// 현재 연결된 상대 수에 맞춰 모든 송신 화질을 재조정한다.
// (입장으로 사람이 늘면 화질↓, 퇴장으로 줄면 화질↑ — 1:4 교사 업로드 병목 완화)
function recapAllSenders() {
  const peerCount = peerConnections.size; // 내가 영상을 보내는 상대 수
  const mobile = isMobileUA(navigator.userAgent);
  peerConnections.forEach((pc) => capSenderBitrate(pc, mobile, peerCount));
}

// ── 기존 참가자 목록 수신 → 각각에게 Offer 전송 ──
socket.on('existing-users', (users) => {
  users.forEach(({ userId, username: name }) => {
    createPeerConnection(userId, name, true);
  });
});

// ── 새 참가자 입장 → Answer 준비 ──
socket.on('user-joined', ({ userId, username: name }) => {
  createPeerConnection(userId, name, false);
});

// ── Offer 수신 ──
socket.on('offer', async ({ from, offer }) => {
  const pc = peerConnections.get(from) || createPeerConnection(from, '', false);
  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.emit('answer', { to: from, answer });
});

// ── Answer 수신 ──
socket.on('answer', async ({ from, answer }) => {
  const pc = peerConnections.get(from);
  if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
});

// ── ICE Candidate 수신 ──
socket.on('ice-candidate', async ({ from, candidate }) => {
  const pc = peerConnections.get(from);
  if (pc && candidate) {
    try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); }
    catch (e) { console.warn('ICE 후보 추가 실패:', e); }
  }
});

// ── 참가자 퇴장 ──
socket.on('user-left', ({ userId }) => {
  const pc = peerConnections.get(userId);
  if (pc) {
    pc.close();
    peerConnections.delete(userId);
  }
  const el = document.getElementById('video-' + userId);
  if (el) el.remove();
  // 사람이 줄었으니 남은 연결의 화질을 다시 올릴 수 있다.
  recapAllSenders();
});

// ── 피어 연결 생성 ──
function createPeerConnection(peerId, peerName, isInitiator) {
  // [버그 C] 동일 peer 에 대해 PC 를 2개 만들면 영상 중복/협상 충돌(glare)이
  // 난다. 이미 있으면 기존 연결을 재사용한다.
  const existing = peerConnections.get(peerId);
  if (existing) return existing;

  const pc = new RTCPeerConnection(ICE_SERVERS);
  peerConnections.set(peerId, pc);

  // 로컬 트랙 추가
  if (localStream) {
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  }

  // [버그 G] ICE 실패 시 자동 재시작
  attachIceRestart(pc);

  // [버그 F + 적응형] 현재 인원에 맞춰 모든 연결의 송신 화질을 재조정.
  recapAllSenders();

  // ICE 후보 전송
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('ice-candidate', { to: peerId, candidate: event.candidate });
    }
  };

  // 원격 트랙 수신 → 비디오 요소 생성
  pc.ontrack = (event) => {
    let videoEl = document.getElementById('video-' + peerId);
    if (!videoEl) {
      const grid = document.getElementById('video-grid');
      const wrapper = document.createElement('div');
      wrapper.className = 'video-item';
      wrapper.id = 'video-' + peerId;
      wrapper.innerHTML = `
        <video autoplay playsinline></video>
        <span class="video-label">${peerName || '참가자'}</span>
      `;
      grid.appendChild(wrapper);
      videoEl = wrapper;
    }
    videoEl.querySelector('video').srcObject = event.streams[0];
  };

  // Initiator → Offer 전송
  if (isInitiator) {
    pc.onnegotiationneeded = async () => {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('offer', { to: peerId, offer });
      } catch (e) { console.error('Offer 생성 실패:', e); }
    };
  }

  return pc;
}
