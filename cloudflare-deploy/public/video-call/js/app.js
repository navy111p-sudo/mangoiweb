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

// fix (2026-07-05) — 결정론적 딥링크 지원: URL 의 roomId/room/vc_room·name 을 입력칸에 미리 채움.
//   예약 기반(Phase RM)에서 계산된 방으로 이 레거시 로비에 들어와도 교사·학생이 같은 방으로 연결됨.
//   빈칸 기본값(mangoi-class) 폴백은 그대로 유지 → 기존 동작 불변.
(function prefillFromUrl() {
  try {
    const sp = new URLSearchParams(location.search);
    const room = sp.get('roomId') || sp.get('room') || sp.get('vc_room');
    const name = sp.get('name') || sp.get('vc_name');
    if (room && $roomInput) $roomInput.value = room;
    if (name && $usernameInput) $usernameInput.value = name;
    if (room && sp.get('autojoin') === '1') setTimeout(joinRoom, 300);
  } catch (_) {}
})();

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
  /* 🔴 (2026-08-05) 예전엔 1280×720(최대 1920×1080)을 달라고 했다.
     카메라가 큰 그림을 주면 인코더가 그걸 줄여 보내느라 CPU 를 쓰고, 저사양 노트북에서는 그 자체가 렉이다.
     1:1 얼굴 화면에 720p 는 과하다. 처음부터 작게 받는다 — 640×360 · 20fps.
     받는 사람 화면에서 차이를 거의 못 느끼고, 올리는 대역과 CPU 는 크게 준다.
     ⚠️ ideal 로만 준다. max 로 못 박으면 그 해상도를 못 내는 웹캠에서 아예 실패한다. */
  const videoConstraints = {
    width:     { ideal: 640 },
    height:    { ideal: 360 },
    frameRate: { ideal: 20, max: 24 },
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

/* 「연결 중」 표시 — index.html 첫 조각에 인라인으로 있다. 없으면 조용히 무시한다. */
const _boot = (t, p) => { try { if (window.bootStep) window.bootStep(t, p); } catch (e) {} };

/* ── 정규 수업이면 출결·발화시간을 기록한다 ──
   🔴 (2026-08-05) 이 화면은 출결 API 를 하나도 부르지 않았다. 회의방일 땐 상관없지만,
      정규 예약 수업(class-…)을 이 화면으로 하면 «수업은 되는데 기록이 안 남는» 상태가 된다.
      출결·발화시간은 강사료 정산과 학부모 리포트의 근거라, 조용히 비면 한 달 뒤 정산 때 발견된다.
      (정식 화면은 /js/mango-attendance.js 가 그 일을 하는데, 이 화면은 그걸 안 실었다.)
   → 방 번호가 class- 로 시작할 때만 그 파일(16KB)을 불러 붙인다.
      회의방(meet-)·공용방은 예전 그대로 한 바이트도 더 받지 않는다.
   ⚠️ 그 모듈은 body.vc-in-call 을 감시해 스스로 켜지는데, 이 화면엔 그 클래스가 없다.
      그래서 공개 API(MangoAttendance.start)로 «직접» 켠다. 클래스를 흉내 내지 않는다 —
      흉내 내면 정식 화면 전용 코드가 같이 깨어날 위험이 있다. */
function maybeStartAttendance() {
  try {
    if (!/^class-/.test(String(roomId || ''))) return;   // 회의방·공용방은 기록 대상이 아니다
    const sp = new URLSearchParams(location.search);
    const uid  = (sp.get('uid') || sp.get('user_id') || '').trim();
    const role = (sp.get('role') || sp.get('vc_role') || '').trim().toLowerCase();
    if (!uid) { console.warn('[attendance] 링크에 uid 가 없어 기록 생략 — 수업 입장 버튼이 넣어 줘야 한다'); return; }
    /* join 본문의 role 은 모듈이 localStorage(mango_role)에서 읽는다 — 정식 화면과 같은 규칙이다.
       링크가 명시한 경우에만 맞춰 준다. 임의로 덮으면 공용 PC 에서 남의 역할이 남는다. */
    if (role === 'teacher' || role === 'student') { try { localStorage.setItem('mango_role', role); } catch (e) {} }
    const s = document.createElement('script');
    s.src = '/js/mango-attendance.js?v=1';
    s.onload = function () {
      try {
        window.MangoAttendance.start({
          roomId: roomId, userId: uid, username: username,
          stream: localStream, role: role || 'student'
        });
        console.log('[attendance] 경량 화면에서 출결 기록 시작:', roomId, uid, role);
      } catch (e) { console.warn('[attendance] 시작 실패:', e); }
    };
    s.onerror = function () { console.warn('[attendance] 스크립트 로드 실패 — 수업은 계속된다'); };
    document.head.appendChild(s);
  } catch (e) { console.warn('[attendance] 예외:', e); }
}

async function joinRoom() {
  username = $usernameInput.value.trim() || ('사용자' + Math.floor(Math.random() * 1000));
  // fix (2026-06-01) — 비우면 랜덤 방이 아니라 공용 수업방(mangoi-class)으로 입장 → 교사·학생이 같은 방에서 만남
  roomId = $roomInput.value.trim() || 'mangoi-class';

  _boot('카메라·마이크를 준비하고 있어요 · Preparing camera and mic', 25);
  localStream = await acquireLocalMedia();
  _boot('수업방에 접속하는 중 · Joining the room', 60);

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
  /* 화면이 실제로 바뀐 뒤에 「연결 중」을 치운다 — 먼저 치우면 흰 화면이 한 번 스친다 */
  _boot('거의 다 됐어요 · Almost there', 95);
  setTimeout(() => { try { if (window.bootDone) window.bootDone(); } catch (e) {} }, 300);

  maybeStartAttendance();   // 정규 수업(class-…)이면 출결·발화시간 기록을 붙인다

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

  /* 🔴🔴 (2026-08-05) 여기가 나쁜 회선에서 수업을 죽이던 자리다.
     예전: 입장 2초 뒤 곧바로 녹화를 켜고, 기본값 «영상 2.5Mbps + 소리 128kbps» 로 R2 에 계속 올렸다.
     필리핀 가정 회선의 올리는 속도는 그보다 낮은 경우가 흔하다. 그러면 녹화 업로드가 올리는 길을
     통째로 막아 «수업 영상» 이 밀린다 — 상대 화면이 검거나 끊기는 것으로 나타난다.
     녹화는 수업의 부산물이고, 수업이 먼저다.
     지금: ① 비트레이트를 1/5 로(영상 500kbps · 소리 48kbps — 다시 보기용으로 충분)
           ② 2초 → 12초 뒤로 미룬다(입장·연결 협상이 끝난 뒤에 시작)
           ③ 그 시점에 연결이 아직 안 붙었으면 아예 시작하지 않는다. 붙고 나면 다시 본다. */
  const AUTO_REC_OPTS = { videoBitsPerSecond: 500000, audioBitsPerSecond: 48000 };
  const anyPeerConnected = () => {
    try {
      if (typeof peerConnections === 'undefined' || !peerConnections || peerConnections.size === 0) return true; // 혼자면 방해할 상대가 없다
      let ok = false;
      peerConnections.forEach((pc) => {
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') ok = true;
      });
      return ok;
    } catch (e) { return true; }
  };
  const tryAutoRecord = (attempt) => {
    try {
      if (typeof startRecording !== 'function') return;
      if (!localStream || localStream.getTracks().length === 0) return;
      if (!anyPeerConnected()) {
        if (attempt < 5) {   // 아직 붙는 중 → 수업을 방해하지 않도록 기다렸다 다시 본다
          console.log('[auto-record] 연결 대기 중 → 녹화 보류 (' + attempt + ')');
          return setTimeout(() => tryAutoRecord(attempt + 1), 10000);
        }
        console.warn('[auto-record] 연결이 계속 불안정 → 녹화 시작하지 않음(수업 우선)');
        return;
      }
      const ok = startRecording(AUTO_REC_OPTS);
      if (ok) console.log('[auto-record] 녹화 시작 (저비트레이트, 수업 대역 보호)');
      else console.warn('[auto-record] 시작 실패');
    } catch (e) { console.warn('[auto-record] 예외:', e); }
  };
  setTimeout(() => tryAutoRecord(0), 12000);
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
    _wsReconnectCount = 0;
    startHeartbeat();
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
    stopHeartbeat();
    scheduleReconnect();
  };
}

// 🔁 끊김 방지 — 지수 백오프 재연결(2s→최대 15s, 영구 재시도) + 하트비트 + 탭 복귀 재연결
let _wsReconnectCount = 0;
let _hbTimer = null, _lastPong = 0;
function scheduleReconnect() {
  if (document.hidden) return;            // 숨김 탭은 복귀 시(visibilitychange) 재연결
  if (ws && ws.readyState === WebSocket.OPEN) return;
  _wsReconnectCount++;
  const delay = Math.min(1000 * Math.pow(2, _wsReconnectCount), 15000);
  console.log('[ws] 재연결 예약:', _wsReconnectCount, delay + 'ms');
  setTimeout(() => { if (!ws || ws.readyState !== WebSocket.OPEN) connectWebSocket(); }, delay);
}
function startHeartbeat() {
  stopHeartbeat();
  _lastPong = Date.now();
  _hbTimer = setInterval(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (Date.now() - _lastPong > 32000) {   // 32초간 pong 없음 → 죽은 연결, 강제 재연결
      console.warn('[ws] 하트비트 응답 없음 → 강제 재연결');
      try { ws.close(); } catch (_) {}
      return;
    }
    sendWsMessage({ type: 'ping' });
  }, 12000);
}
function stopHeartbeat() { if (_hbTimer) { clearInterval(_hbTimer); _hbTimer = null; } }
// 백그라운드 탭으로 끊겼다가 돌아오면 즉시 재연결
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && (!ws || ws.readyState !== WebSocket.OPEN)) {
    _wsReconnectCount = 0;
    connectWebSocket();
  }
});

function handleWebSocketMessage(msg) {
  const { type, data } = msg;
  _wsReconnectCount = 0;
  switch (type) {
    case 'pong': _lastPong = Date.now(); break;
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
  if (pc) {
    // 핸들러 해제 후 close → 잔여 콜백/메모리 누수 방지
    pc.onicecandidate = pc.ontrack = pc.oniceconnectionstatechange = pc.onconnectionstatechange = pc.onnegotiationneeded = null;
    try { pc.close(); } catch (_) {}
    peerConnections.delete(userId);
  }
  if (typeof pendingCandidates !== 'undefined') pendingCandidates.delete(userId);
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

  /* 출결 마감 — 여기서 확정해야 발화시간(total_active_ms)이 서버에 남는다.
     pagehide/beforeunload 안전망도 모듈 안에 있지만, 나가기 버튼은 «정상 종료» 라
     beacon 이 확실히 나가도록 명시적으로 닫는다. */
  try { if (window.MangoAttendance) window.MangoAttendance.stop({ useBeacon: true }); } catch (e) {}

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
