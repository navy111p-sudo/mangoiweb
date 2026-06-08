/**
 * app.js – 메인 진입점: 로비, 탭 전환, 소켓 연결
 * [통합] /video-call 네임스페이스 사용
 */
const socket = io('/video-call');
let localStream = null;
let roomId = null;
let username = null;

// ── DOM ──
const $lobby    = document.getElementById('lobby');
const $app      = document.getElementById('app');
const $joinBtn  = document.getElementById('join-btn');
const $usernameInput = document.getElementById('username-input');
const $roomInput     = document.getElementById('room-input');
const $roomBadge     = document.getElementById('room-badge');
const $userCount     = document.getElementById('user-count');

// ── 입장 ──
$joinBtn.addEventListener('click', joinRoom);
$usernameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom(); });
$roomInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom(); });

async function joinRoom() {
  username = $usernameInput.value.trim() || `사용자${Math.floor(Math.random() * 1000)}`;
  roomId = $roomInput.value.trim() || generateRoomId();

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  } catch (err) {
    console.warn('미디어 장치 접근 실패:', err.message);
    localStream = new MediaStream();
  }

  document.getElementById('local-video').srcObject = localStream;
  document.getElementById('local-label').textContent = username + ' (나)';

  socket.emit('join-room', { roomId, username });

  $lobby.classList.add('hidden');
  $app.classList.remove('hidden');
  $roomBadge.textContent = '방: ' + roomId;

  initWhiteboard();
  initChat();

  window.addEventListener('resize', () => {
    resizeWhiteboard();
    if (window.currentPdfPage) renderPdfPage(window.currentPdfPage);
  });
}

function generateRoomId() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let id = '';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

// ── 참가자 수 업데이트 ──
let userCount = 1;
socket.on('user-joined', () => { userCount++; updateUserCount(); });
socket.on('user-left', () => { userCount = Math.max(1, userCount - 1); updateUserCount(); });
function updateUserCount() { $userCount.textContent = userCount + '명'; }

// ── 탭 전환 ──
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'whiteboard') resizeWhiteboard();
  });
});

// ── 마이크/카메라 토글 ──
document.getElementById('toggle-mic').addEventListener('click', function() {
  const audioTrack = localStream.getAudioTracks()[0];
  if (!audioTrack) return;
  audioTrack.enabled = !audioTrack.enabled;
  this.classList.toggle('active', !audioTrack.enabled);
  this.textContent = audioTrack.enabled ? '🎤' : '🔇';
});
document.getElementById('toggle-cam').addEventListener('click', function() {
  const videoTrack = localStream.getVideoTracks()[0];
  if (!videoTrack) return;
  videoTrack.enabled = !videoTrack.enabled;
  this.classList.toggle('active', !videoTrack.enabled);
  this.textContent = videoTrack.enabled ? '📷' : '📷';
});

// ── 나가기 ──
document.getElementById('leave-btn').addEventListener('click', () => {
  if (confirm('통화에서 나가시겠습니까?')) {
    localStream.getTracks().forEach(t => t.stop());
    socket.disconnect();
    location.href = '/';
  }
});

// ── 채팅 토글 ──
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
