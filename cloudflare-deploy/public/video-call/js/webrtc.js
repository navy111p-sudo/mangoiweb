/**
 * webrtc.js – WebRTC 피어 연결 관리 (Native WebSocket)
 * 핵심 수정: onnegotiationneeded를 addTrack 전에 설정 (레이스 컨디션 방지)
 */
const peerConnections = new Map();
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
  ]
};

function handleExistingUsers(data) {
  console.log('[webrtc] existing-users 수신:', JSON.stringify(data).substring(0, 200));
  const list = Array.isArray(data) ? data : (data && Array.isArray(data.users) ? data.users : []);
  console.log('[webrtc] 기존 사용자 수:', list.length);
  list.forEach(({ userId, username: name }) => {
    console.log('[webrtc] 기존 사용자 연결(initiator):', userId, name);
    createPeerConnection(userId, name, true);
  });
  if (data && data.pdfState && typeof handlePdfSync === 'function') {
    try { handlePdfSync(data.pdfState); } catch (_) {}
  }
}

function handleUserJoined({ userId, username: name, userCount: count }) {
  console.log('[webrtc] user-joined:', userId, name);
  if (count) userCount = count;
  else userCount++;
  updateUserCount();
  createPeerConnection(userId, name, false);
}

function handleOfferMessage(data) {
  const from = data.fromUserId || data.from;
  const offer = data.sdp || data.offer;
  const name = data.fromUsername || '';
  console.log('[webrtc] offer 수신 from:', from);
  if (!from || !offer) { console.warn('[webrtc] Invalid offer', data); return; }
  const pc = peerConnections.get(from) || createPeerConnection(from, name, false);
  pc.setRemoteDescription(new RTCSessionDescription(offer)).then(() => {
    console.log('[webrtc] remoteDesc 설정 → answer 생성');
    return pc.createAnswer();
  }).then((answer) => {
    return pc.setLocalDescription(answer).then(() => answer);
  }).then((answer) => {
    console.log('[webrtc] answer 전송 →', from);
    sendWsMessage({ type: 'answer', data: { targetUserId: from, sdp: answer } });
  }).catch(e => console.error('[webrtc] Offer handle error:', e));
}

function handleAnswerMessage(data) {
  const from = data.fromUserId || data.from;
  const answer = data.sdp || data.answer;
  console.log('[webrtc] answer 수신 from:', from);
  if (!from || !answer) { console.warn('[webrtc] Invalid answer', data); return; }
  const pc = peerConnections.get(from);
  if (pc) {
    pc.setRemoteDescription(new RTCSessionDescription(answer))
      .then(() => console.log('[webrtc] answer 적용 완료'))
      .catch(e => console.error('[webrtc] Answer error:', e));
  } else {
    console.warn('[webrtc] answer 수신 but PC 없음:', from);
  }
}

function handleIceCandidateMessage(data) {
  const from = data.fromUserId || data.from;
  const candidate = data.candidate;
  const pc = peerConnections.get(from);
  if (pc && candidate) {
    try { pc.addIceCandidate(new RTCIceCandidate(candidate)); }
    catch (e) { console.warn('[webrtc] ICE candidate error:', e); }
  }
}

function createPeerConnection(userId, peerName, isInitiator) {
  if (peerConnections.has(userId)) return peerConnections.get(userId);
  console.log('[webrtc] createPC:', userId, peerName, 'initiator:', isInitiator);
  const pc = new RTCPeerConnection(ICE_SERVERS);
  peerConnections.set(userId, pc);

  // --- 이벤트 핸들러 ---
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      sendWsMessage({ type: 'ice-candidate', data: { targetUserId: userId, candidate: event.candidate } });
    }
  };

  pc.oniceconnectionstatechange = () => {
    console.log('[webrtc] ICE(' + userId + '):', pc.iceConnectionState);
    if (pc.iceConnectionState === 'failed') {
      console.warn('[webrtc] ICE 실패 → restartIce');
      pc.restartIce();
    }
    if (pc.iceConnectionState === 'disconnected') {
      setTimeout(() => {
        if (pc.iceConnectionState === 'disconnected') {
          console.warn('[webrtc] 장시간 끊김 → restartIce');
          pc.restartIce();
        }
      }, 5000);
    }
  };

  pc.onconnectionstatechange = () => {
    console.log('[webrtc] conn(' + userId + '):', pc.connectionState);
  };

  pc.ontrack = (event) => {
    console.log('[webrtc] ★ ontrack! userId:', userId, 'streams:', event.streams.length, 'track:', event.track.kind);
    let videoEl = document.getElementById('video-' + userId);
    if (!videoEl) {
      const grid = document.getElementById('video-grid');
      const wrapper = document.createElement('div');
      wrapper.className = 'video-item remote';
      wrapper.id = 'video-' + userId;
      wrapper.innerHTML = '<video autoplay playsinline></video><span class="video-label">' + (peerName || '참가자') + '</span>';
      grid.appendChild(wrapper);
      videoEl = wrapper;
      if (typeof updateGridCount === 'function') updateGridCount();
      console.log('[webrtc] 원격 비디오 엘리먼트 생성:', userId);
    }
    const videoTag = videoEl.querySelector('video');
    if (event.streams && event.streams[0]) {
      videoTag.srcObject = event.streams[0];
    } else {
      // fallback: 스트림 없이 트랙만 올 경우
      let stream = videoTag.srcObject;
      if (!stream) stream = new MediaStream();
      stream.addTrack(event.track);
      videoTag.srcObject = stream;
    }
    // ★ 스피커 보장: 원격 비디오는 반드시 음소거 해제 + 재생 시도
    videoTag.muted = false;
    videoTag.volume = 1.0;
    const tryPlay = () => {
      const p = videoTag.play();
      if (p && typeof p.catch === 'function') {
        p.catch((err) => {
          console.warn('[webrtc] autoplay 차단됨, 사용자 제스처 필요:', err && err.name);
          // 사용자 클릭 한번으로 언블록 (iOS Safari 대응)
          const unlock = () => { videoTag.play().catch(()=>{}); document.removeEventListener('click', unlock); };
          document.addEventListener('click', unlock, { once: true });
        });
      }
    };
    tryPlay();
    console.log('[webrtc] 원격 비디오 srcObject 설정 + 오디오 언뮤트 완료');

    // ★ 플로팅 비디오에도 미러링 (다른 탭에서도 상대 영상 보이게)
    updateFloatingVideo(userId, peerName, event.streams[0] || videoTag.srcObject);
  };

  // ★ 핵심 수정: onnegotiationneeded를 addTrack 전에 설정!
  // addTrack이 negotiationneeded를 트리거하는데, 핸들러가 뒤에 있으면 이벤트를 놓칠 수 있음
  if (isInitiator) {
    pc.onnegotiationneeded = () => {
      console.log('[webrtc] negotiationneeded → offer 생성:', userId);
      pc.createOffer().then((offer) => {
        return pc.setLocalDescription(offer).then(() => offer);
      }).then((offer) => {
        console.log('[webrtc] offer 전송:', userId);
        sendWsMessage({ type: 'offer', data: { targetUserId: userId, sdp: offer } });
      }).catch(e => console.error('[webrtc] Offer create error:', e));
    };
  }

  // ★ addTrack은 반드시 onnegotiationneeded 설정 후에 호출
  if (localStream) {
    const tracks = localStream.getTracks();
    console.log('[webrtc] 로컬 트랙 추가:', tracks.length, '개');
    tracks.forEach(track => pc.addTrack(track, localStream));
  } else {
    console.warn('[webrtc] localStream 없음!');
  }

  // ★ 안전장치: initiator인데 1.5초 후에도 offer가 안 갔으면 강제 생성
  if (isInitiator) {
    setTimeout(() => {
      if (pc.signalingState === 'stable' && !pc.remoteDescription) {
        console.log('[webrtc] negotiationneeded 미발생 → 강제 offer:', userId);
        pc.createOffer().then((offer) => {
          return pc.setLocalDescription(offer).then(() => offer);
        }).then((offer) => {
          sendWsMessage({ type: 'offer', data: { targetUserId: userId, sdp: offer } });
        }).catch(e => console.error('[webrtc] Forced offer error:', e));
      }
    }, 1500);
  }

  return pc;
}

// ★ 플로팅 원격 비디오: 다른 탭에서도 상대방 영상 표시
function updateFloatingVideo(userId, peerName, stream) {
  const container = document.getElementById('floating-remote-videos');
  if (!container) return;
  let el = document.getElementById('float-' + userId);
  if (!el) {
    el = document.createElement('div');
    el.className = 'floating-video-item';
    el.id = 'float-' + userId;
    el.innerHTML = '<video autoplay playsinline muted></video><span class="floating-video-label">' + (peerName || '참가자') + '</span>';
    container.appendChild(el);
  }
  if (stream) el.querySelector('video').srcObject = stream;
}

function removeFloatingVideo(userId) {
  const el = document.getElementById('float-' + userId);
  if (el) el.remove();
}

// ★ 앱 전환 후 복귀 시 모든 원격 video의 play 강제 재시도 (화면 멈춤 해결)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    document.querySelectorAll('video').forEach(v => {
      if (v.paused) {
        v.play().catch(() => {
          const unlock = () => { v.play().catch(()=>{}); document.removeEventListener('click', unlock); };
          document.addEventListener('click', unlock, { once: true });
        });
      }
    });
    // 연결이 disconnected라면 복구 시도
    if (typeof peerConnections !== 'undefined') {
      peerConnections.forEach((pc, uid) => {
        try {
          if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
            console.log('[webrtc] visibility 복귀 → ICE restart:', uid);
            pc.restartIce();
          }
        } catch (_) {}
      });
    }
  }
});
