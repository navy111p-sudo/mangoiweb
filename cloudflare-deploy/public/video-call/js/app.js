/**
 * app.js – 메인 진입점: 로비, 탭 전환, WebSocket 연결
 * Native WebSocket 기반 (Socket.IO 대체)
 *
 * 주요 개선:
 *  - visibilitychange / pageshow 시 모든 video 자동 재생 (타앱 전환 후 멈춤 문제 해결)
 *  - getUserMedia 오디오 실패 시 폴백 로직 강화 (데스크탑 마이크 문제)
 *  - 녹화는 기본 활성이지만, 사용자 제스처 후 시작 (일부 브라우저 자동 재생 정책 대응)
 */
let ws = null;
let localStream = null;
let roomId = null;
let username = null;

const $lobby    = document.getElementById('lobby');
const $app      = document.getElementById('app');
const $joinBtn  = document.getElementById('join-btn');
const $usernameInput = document.getElementById('username-input');
const $roomInput     = document.getElementById('room-input');
const $roomBadge     = document.getElementById('room-badge');
const $userCount     = document.getElementById('user-count');

$joinBtn.addEventListener('click', joinRoom);
$usernameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom(); });
$roomInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom(); });

/**
 * 견고한 getUserMedia — 마이크/카메라 모두 시도하고
 * 실패 시 단독 모드로 폴백 (데스크탑에서 마이크 안 잡히는 문제 해결)
 */
async function acquireLocalMedia() {
  const audioConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    sampleRate: 48000,
    channelCount: 1
  };
  const videoConstraints = {
    width:  { ideal: 1280, max: 1920 },
    height: { ideal: 720,  max: 1080 },
    facingMode: 'user'
  };

  // 1순위: 비디오 + 오디오
  try {
    const s = await navigator.mediaDevices.getUserMedia({
      video: videoConstraints,
      audio: audioConstraints
    });
    console.log('[media] video+audio 획득:', s.getAudioTracks().length, '오디오 트랙');
    return s;
  } catch (err) {
    console.warn('[media] video+audio 실패:', err && err.name, err && err.message);
  }

  // 2순위: 단순 옵션으로 재시도
  try {
    const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    console.log('[media] 단순 옵션으로 획득 성공');
    return s;
  } catch (err) {
    console.warn('[media] 단순 옵션도 실패:', err && err.name);
  }

  // 3순위: 오디오만 (데스크탑 마이크만 있는 경우)
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    console.warn('[media] 오디오만 획득 (카메라 없음)');
    return s;
  } catch (_) {}

  // 4순위: 비디오만
  try {
    const s = await navigator.mediaDevices.getUserMedia({ video: true });
    console.warn('[media] 비디오만 획득 (마이크 없음)');
    return s;
  } catch (_) {}

  console.error('[media] 모든 미디어 획득 실패 → 빈 스트림');
  return new MediaStream();
}

async function joinRoom() {
  username = $usernameInput.value.trim() || ('사용자' + Math.floor(Math.random() * 1000));
  roomId = $roomInput.value.trim() || generateRoomId();

  localStream = await acquireLocalMedia();

  // 디버그: 오디오 트랙 상태
  const audioTracks = localStream.getAudioTracks();
  if (audioTracks.length === 0) {
    console.warn('[media] 오디오 트랙 없음 — 마이크 권한 또는 장치 문제');
  } else {
    audioTracks.forEach(t => {
      t.enabled = true;
      console.log('[media] 오디오 트랙:', t.label, 'enabled:', t.enabled, 'muted:', t.muted);
    });
  }

  document.getElementById('local-video').srcObject = localStream;
  document.getElementById('local-label').textContent = username + ' (나)';

  connectWebSocket();

  $lobby.classList.add('hidden');
  $app.classList.remove('hidden');
  $roomBadge.textContent = '방: ' + roomId;

  initWhiteboard();
  initChat();

  window.addEventListener('resize', () => {
    resizeWhiteboard();
    if (window.currentPdfPage && typeof renderPdfPage === 'function') renderPdfPage(window.currentPdfPage);
  });

  // 화면 회전/리사이즈 대응: orientationchange 이벤트 별도 처리 (iOS)
  window.addEventListener('orientationchange', () => {
    setTimeout(() => {
      if (typeof resizeWhiteboard === 'function') resizeWhiteboard();
      if (window.currentPdfPage && typeof renderPdfPage === 'function') renderPdfPage(window.currentPdfPage);
    }, 200);
  });

  // ★ visibilitychange: 타앱(카카오톡 등) 다녀오고 돌아왔을 때 멈춘 video 재생
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pageshow', resumeAllVideos);
  window.addEventListener('focus', resumeAllVideos);

  // 방 입장 즉시 자동 녹화 시작 (R2 스트리밍 업로드)
  setTimeout(() => {
    try {
      if (typeof startRecording === 'function' && localStream && localStream.getTracks().length > 0) {
        const ok = startRecording();
        if (ok) console.log('[auto-record] 녹화 자동 시작 (R2 스트리밍)');
        else console.warn('[auto-record] 시작 실패');
      }
    } catch (e) { console.warn('[auto-record] 예외:', e); }
  }, 2000);
}

/**
 * 페이지 visibility 변경 → 다시 보일 때 모든 비디오 강제 play()
 * 해결: 타앱 전환 후 돌아왔을 때 video가 멈춰 보이는 문제
 */
function onVisibilityChange() {
  if (document.visibilityState === 'visible') {
    resumeAllVideos();
    // ICE 연결이 disconnected라면 restart 시도
    if (typeof peerConnections !== 'undefined' && peerConnections) {
      peerConnections.forEach((pc, uid) => {
        if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
          try {
            console.log('[visibility] ICE restart 시도:', uid);
            pc.restartIce();
          } catch (_) {}
        }
      });
    }
  }
}

function resumeAllVideos() {
  const videos = document.querySelectorAll('video');
  videos.forEach(v => {
    if (v.paused) {
      v.play().catch(() => {
        // autoplay 차단된 경우 한 번의 클릭으로 해제
        const unlock = () => {
          document.querySelectorAll('video').forEach(x => x.play().catch(() => {}));
          document.removeEventListener('click', unlock);
          document.removeEventListener('touchstart', unlock);
        };
        document.addEventListener('click', unlock, { once: true });
        document.addEventListener('touchstart', unlock, { once: true });
      });
    }
  });
}

function generateRoomId() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let id = '';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  ws = new WebSocket(protocol + '//' + host + '/ws/video-call?roomId=' + encodeURIComponent(roomId));

  ws.onopen = () => {
    console.log('WebSocket 연결 완료');
    sendWsMessage({ type: 'join-room', data: { roomId, username } });
  };
  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleWebSocketMessage(msg);
    } catch (err) { console.error('Message parse error:', err); }
  };
  ws.onerror = () => { console.error('WebSocket 오류'); };
  ws.onclose = () => {
    console.log('WebSocket 연결 종료 → 재연결 시도');
    // 백그라운드에서 WS가 끊어진 경우 자동 재연결 (최대 5번)
    if (!document.hidden) setTimeout(reconnectWebSocket, 2000);
  };
}

let _wsReconnectCount = 0;
function reconnectWebSocket() {
  if (_wsReconnectCount >= 5) return;
  _wsReconnectCount++;
  console.log('[ws] 재연결 시도:', _wsReconnectCount);
  connectWebSocket();
}

function handleWebSocketMessage(msg) {
  const { type, data } = msg;
  _wsReconnectCount = 0;
  switch (type) {
    case 'existing-users': handleExistingUsers(data); break;
    case 'room-joined': handleRoomJoined(data); break;
    case 'user-joined': handleUserJoined(data); break;
    case 'user-left': handleUserLeft(data); break;
    case 'chat-message': handleChatMessageReceived(data); break;
    case 'whiteboard-draw': drawRemote(data); break;
    case 'whiteboard-clear': handleWhiteboardClear(); break;
    case 'pdf-sync': handlePdfSync(data); break;
    case 'pdf-page-change': handlePdfPageChange(data); break;
    case 'pdf-stop-share': stopPdfShare(); break;
    case 'offer': handleOfferMessage(data); break;
    case 'answer': handleAnswerMessage(data); break;
    case 'ice-candidate': handleIceCandidateMessage(data); break;
  }
}

function handleRoomJoined(data) {
  console.log('[app] Room joined:', data.roomId, 'userId:', data.userId, 'userCount:', data.userCount);
  if (data.userCount) { userCount = data.userCount; updateUserCount(); }
}

function handleUserLeft({ userId }) {
  userCount = Math.max(1, userCount - 1);
  updateUserCount();
  const pc = peerConnections.get(userId);
  if (pc) { pc.close(); peerConnections.delete(userId); }
  const el = document.getElementById('video-' + userId);
  if (el) el.remove();
  if (typeof removeFloatingVideo === 'function') removeFloatingVideo(userId);
  updateGridCount();
}

// 그리드 참가자 수 → CSS data-count 반영 (반응형 분기용)
function updateGridCount() {
  const grid = document.getElementById('video-grid');
  if (!grid) return;
  const count = grid.querySelectorAll('.video-item').length;
  grid.dataset.count = count;
}
document.addEventListener('DOMContentLoaded', updateGridCount);

let userCount = 1;
function updateUserCount() { $userCount.textContent = userCount + '명'; }

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'whiteboard') resizeWhiteboard();
    if (btn.dataset.tab === 'materials' && window.currentPdfPage && typeof renderPdfPage === 'function') {
      renderPdfPage(window.currentPdfPage);
    }
  });
});

document.getElementById('toggle-mic').addEventListener('click', async function() {
  let audioTrack = localStream.getAudioTracks()[0];

  // 오디오 트랙이 없으면 런타임에 요청 (데스크탑에서 최초에 마이크 거부된 경우 재시도)
  if (!audioTrack) {
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioTrack = audioStream.getAudioTracks()[0];
      if (audioTrack) {
        localStream.addTrack(audioTrack);
        // 모든 PC에 오디오 트랙 추가
        if (typeof peerConnections !== 'undefined') {
          peerConnections.forEach((pc) => {
            try { pc.addTrack(audioTrack, localStream); } catch (_) {}
          });
        }
        console.log('[mic] 런타임 오디오 트랙 추가 완료');
      }
    } catch (err) {
      alert('마이크 접근 권한이 필요합니다. 브라우저 주소창의 자물쇠(🔒) 아이콘에서 마이크를 허용해 주세요.');
      return;
    }
  }

  audioTrack.enabled = !audioTrack.enabled;
  this.classList.toggle('active', !audioTrack.enabled);
  this.textContent = audioTrack.enabled ? '🎤' : '🔇';
});

document.getElementById('toggle-cam').addEventListener('click', function() {
  const videoTrack = localStream.getVideoTracks()[0];
  if (!videoTrack) return;
  videoTrack.enabled = !videoTrack.enabled;
  this.classList.toggle('active', !videoTrack.enabled);
  this.textContent = '📷';
});

// 나가기 - 녹화 중지 + 업로드 완료 대기
document.getElementById('leave-btn').addEventListener('click', async () => {
  if (!confirm('통화에서 나가시겠습니까?')) return;
  try {
    if (typeof isRecording === 'function' && isRecording()) {
      console.log('[auto-record] 녹화 중지 및 업로드 중...');
      const result = await stopRecording();
      console.log('[auto-record] 업로드 결과:', result);
    }
  } catch (e) { console.warn('[auto-record] 중지/업로드 예외:', e); }

  localStream.getTracks().forEach(t => t.stop());
  if (ws) ws.close();
  location.href = '/';
});

document.getElementById('toggle-chat').addEventListener('click', () => {
  const panel = document.getElementById('chat-panel');
  panel.classList.toggle('open');
  const badge = document.querySelector('.chat-toggle .badge');
  if (badge) badge.remove();
  const msgs = document.getElementById('chat-messages');
  msgs.scrollTop = msgs.scrollHeight;
});
document.getElementById('close-chat').addEventListener('click', () => {
  document.getElementById('chat-panel').classList.remove('open');
});

function sendWsMessage(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

// 스텁 함수: webrtc.js, pdf-viewer.js, chat.js 에서 덮어씌워짐
function handleChatMessageReceived(data) { console.log('[stub] chat-message (모듈 미로드)'); }
function handlePdfSync(data) { console.log('[stub] pdf-sync (모듈 미로드)'); }
function handlePdfPageChange(data) { console.log('[stub] pdf-page-change (모듈 미로드)'); }
function handleExistingUsers(data) { console.log('[stub] existing-users (모듈 미로드)'); }
function handleUserJoined(data) { console.log('[stub] user-joined (모듈 미로드)'); }
function handleOfferMessage(data) { console.log('[stub] offer (모듈 미로드)'); }
function handleAnswerMessage(data) { console.log('[stub] answer (모듈 미로드)'); }
function handleIceCandidateMessage(data) { console.log('[stub] ice-candidate (모듈 미로드)'); }
