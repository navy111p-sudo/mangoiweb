/** WebRTC peer connection management — video-call-first recovery. */
const peerConnections = new Map();
var ICE_SERVERS = buildIceServers();
const connectionHealth = new Map();

function recapAllSenders() {
  const peerCount = peerConnections.size;
  const mobile = isMobileUA(navigator.userAgent);
  peerConnections.forEach((pc) => capSenderBitrate(pc, mobile, peerCount));
}

socket.on('existing-users', (users) => users.forEach(({ userId, username: name }) => createPeerConnection(userId, name, true)));
socket.on('user-joined', ({ userId, username: name }) => createPeerConnection(userId, name, false));
socket.on('offer', async ({ from, offer }) => {
  const pc = peerConnections.get(from) || createPeerConnection(from, '', false);
  try {
    if (pc.signalingState !== 'stable') await pc.setLocalDescription({ type: 'rollback' });
  } catch (_) {}
  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.emit('answer', { to: from, answer });
});
socket.on('answer', async ({ from, answer }) => {
  const pc = peerConnections.get(from);
  if (pc && pc.signalingState === 'have-local-offer') await pc.setRemoteDescription(new RTCSessionDescription(answer));
});
socket.on('ice-candidate', async ({ from, candidate }) => {
  const pc = peerConnections.get(from);
  if (pc && candidate) try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) { console.warn('ICE 후보 추가 실패:', e); }
});
socket.on('recovery-request', ({ from, reason }) => {
  const pc = peerConnections.get(from);
  if (pc && pc.__mangoInitiator) requestRecovery(from, pc, `peer-request:${reason || 'unknown'}`, true);
});
socket.on('user-left', ({ userId }) => {
  const pc = peerConnections.get(userId); if (pc) pc.close();
  const health = connectionHealth.get(userId); if (health && health.timer) clearInterval(health.timer);
  peerConnections.delete(userId); connectionHealth.delete(userId);
  const el = document.getElementById('video-' + userId); if (el) el.remove(); recapAllSenders();
});

function createPeerConnection(peerId, peerName, isInitiator) {
  const existing = peerConnections.get(peerId); if (existing) return existing;
  const pc = new RTCPeerConnection(ICE_SERVERS);
  pc.__mangoInitiator = !!isInitiator;
  peerConnections.set(peerId, pc);
  connectionHealth.set(peerId, {
    lastBytes: 0,
    lastProgress: Date.now(),
    recoveries: 0,
    relayOnly: false,
    lastRecovery: 0,
    lastTelemetry: 0,
    timer: null,
  });
  if (localStream) localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  recapAllSenders();

  pc.onicecandidate = (event) => { if (event.candidate) socket.emit('ice-candidate', { to: peerId, candidate: event.candidate }); };
  pc.onconnectionstatechange = () => {
    logConnectionEvent(peerId, 'connection-state', { state: pc.connectionState, ice: pc.iceConnectionState }, true);
    if (pc.connectionState === 'failed') requestRecovery(peerId, pc, 'connection-failed');
  };
  pc.oniceconnectionstatechange = () => {
    logConnectionEvent(peerId, 'ice-state', { state: pc.iceConnectionState }, true);
    if (pc.iceConnectionState === 'failed') requestRecovery(peerId, pc, 'ice-failed');
    if (pc.iceConnectionState === 'disconnected') {
      setTimeout(() => {
        if (pc.iceConnectionState === 'disconnected') requestRecovery(peerId, pc, 'ice-disconnected-5s');
      }, 5000);
    }
  };
  pc.ontrack = (event) => {
    let videoEl = document.getElementById('video-' + peerId);
    if (!videoEl) {
      const grid = document.getElementById('video-grid'); const wrapper = document.createElement('div');
      wrapper.className = 'video-item'; wrapper.id = 'video-' + peerId;
      wrapper.innerHTML = `<video autoplay playsinline></video><span class="video-label">${peerName || '참가자'}</span>`;
      grid.appendChild(wrapper); videoEl = wrapper;
    }
    const video = videoEl.querySelector('video');
    video.srcObject = event.streams[0];
    video.play().catch(() => {});
    video.onplaying = () => { const h = connectionHealth.get(peerId); if (h) h.lastProgress = Date.now(); };
    startBlackScreenWatch(peerId, pc, video);
    logConnectionEvent(peerId, 'remote-track', { kind: event.track.kind, readyState: event.track.readyState }, true);
  };
  if (isInitiator) pc.onnegotiationneeded = async () => {
    if (pc.signalingState !== 'stable') return;
    try { const offer = await pc.createOffer(); await pc.setLocalDescription(offer); socket.emit('offer', { to: peerId, offer }); }
    catch (e) { console.error('Offer 생성 실패:', e); }
  };
  return pc;
}

function startBlackScreenWatch(peerId, pc, video) {
  const health = connectionHealth.get(peerId); if (!health || health.timer) return;
  health.timer = setInterval(async () => {
    if (!peerConnections.has(peerId) || pc.connectionState === 'closed') { clearInterval(health.timer); return; }
    if (document.hidden || pc.connectionState !== 'connected') return;
    try {
      const stats = await pc.getStats();
      let bytes = 0, packetsLost = 0, packetsReceived = 0, rtt = null, selectedPair = null, relay = false;
      stats.forEach(r => {
        if (r.type === 'inbound-rtp' && (r.kind === 'video' || r.mediaType === 'video') && !r.isRemote) {
          bytes += r.bytesReceived || 0; packetsLost += r.packetsLost || 0; packetsReceived += r.packetsReceived || 0;
        }
        if (r.type === 'candidate-pair' && r.state === 'succeeded' && (r.nominated || r.selected)) selectedPair = r;
      });
      if (selectedPair) {
        if (selectedPair.currentRoundTripTime != null) rtt = Math.round(selectedPair.currentRoundTripTime * 1000);
        const local = stats.get(selectedPair.localCandidateId); const remote = stats.get(selectedPair.remoteCandidateId);
        relay = !!((local && local.candidateType === 'relay') || (remote && remote.candidateType === 'relay'));
      }
      if (bytes > health.lastBytes) { health.lastBytes = bytes; health.lastProgress = Date.now(); }
      const stalledMs = Date.now() - health.lastProgress;
      const visualStall = video.readyState < 2 || video.videoWidth === 0;
      const dataStall = bytes > 0 && stalledMs >= 12000;
      if (stalledMs >= 7000 && visualStall || dataStall) requestRecovery(peerId, pc, 'black-screen-or-video-stall');

      const quality = { rtt, packetsLost, packetsReceived, relay, stalledMs: Math.min(stalledMs, 60000) };
      const now = Date.now();
      logConnectionEvent(peerId, 'quality', quality, now - health.lastTelemetry >= 15000);
      if (now - health.lastTelemetry >= 15000) health.lastTelemetry = now;
    } catch (_) {}
  }, 3000);
}

function requestRecovery(peerId, pc, reason, forceInitiator) {
  const health = connectionHealth.get(peerId); if (!health) return;
  const now = Date.now(); if (health.lastRecovery && now - health.lastRecovery < 10000) return;
  health.lastRecovery = now; health.recoveries++;

  if (health.recoveries >= 3 && !health.relayOnly) {
    try {
      const cfg = pc.getConfiguration();
      pc.setConfiguration({ ...cfg, iceTransportPolicy: 'relay' });
      health.relayOnly = true;
      logConnectionEvent(peerId, 'turn-relay-escalation', { reason, attempt: health.recoveries }, true);
    } catch (e) {
      logConnectionEvent(peerId, 'turn-relay-escalation-failed', { message: String(e && e.message || e) }, true);
    }
  }

  logConnectionEvent(peerId, 'recovery', { reason, attempt: health.recoveries, relayOnly: health.relayOnly }, true);

  // Glare 방지: offer 생성자는 initiator 한쪽으로 제한한다.
  if (!pc.__mangoInitiator && !forceInitiator) {
    socket.emit('recovery-request', { to: peerId, reason });
    return;
  }

  try { pc.restartIce(); } catch (_) {}
  if (pc.signalingState === 'stable') {
    pc.createOffer({ iceRestart: true })
      .then(o => pc.setLocalDescription(o).then(() => socket.emit('offer', { to: peerId, offer: o })))
      .catch(() => {});
  }
}

function logConnectionEvent(peerId, type, data, sendToServer) {
  const entry = { ts: new Date().toISOString(), peerId, type, ...data };
  window.__mangoConnectionLog = window.__mangoConnectionLog || [];
  window.__mangoConnectionLog.push(entry); if (window.__mangoConnectionLog.length > 300) window.__mangoConnectionLog.shift();
  if (type !== 'quality') console.info('[MangoAI connection]', entry);
  if (sendToServer) {
    try { socket.emit('connection-quality-event', { peerId, type, detail: data || {}, ts: Date.now() }); } catch (_) {}
  }
}

window.MangoAI = window.MangoAI || {};
window.MangoAI.getConnectionDiagnostics = () => (window.__mangoConnectionLog || []).slice();
