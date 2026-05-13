/**
 * webrtc.js – WebRTC 피어 연결 관리
 */
const peerConnections = new Map(); // peerId -> RTCPeerConnection
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

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
});

// ── 피어 연결 생성 ──
function createPeerConnection(peerId, peerName, isInitiator) {
  const pc = new RTCPeerConnection(ICE_SERVERS);
  peerConnections.set(peerId, pc);

  // 로컬 트랙 추가
  if (localStream) {
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  }

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
