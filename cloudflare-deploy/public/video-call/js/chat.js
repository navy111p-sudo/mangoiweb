/**
 * chat.js – Native WebSocket 기반 실시간 문자 채팅
 */
function initChat() {
  const $input = document.getElementById('chat-input');
  const $sendBtn = document.getElementById('chat-send');

  // ── 전송 ──
  function sendMessage() {
    const text = $input.value.trim();
    if (!text) return;
    sendWsMessage({ type: 'chat-message', data: { message: text } });
    $input.value = '';
    $input.focus();
  }

  $sendBtn.addEventListener('click', sendMessage);
  $input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
}

// ── WebSocket 핸들러 (app.js에서 오버라이드) ──
function handleChatMessageReceived(data) {
  appendMessage(data);

  // 채팅 패널이 닫혀있으면 뱃지 표시
  const panel = document.getElementById('chat-panel');
  if (!panel.classList.contains('open') && !data.isSystem) {
    showChatBadge();
  }
}

function appendMessage({ username: author, message, timestamp, isSystem }) {
  const $messages = document.getElementById('chat-messages');

  const div = document.createElement('div');

  if (isSystem) {
    div.className = 'chat-msg system';
    div.textContent = message;
  } else {
    const isMine = author === username;
    div.className = `chat-msg ${isMine ? 'mine' : ''}`;

    const time = new Date(timestamp).toLocaleTimeString('ko', { hour: '2-digit', minute: '2-digit' });
    div.innerHTML = `
      ${!isMine ? `<div class="msg-author">${escapeHtml(author)}</div>` : ''}
      <div class="msg-bubble">${escapeHtml(message)}</div>
      <div class="msg-time">${time}</div>
    `;
  }

  $messages.appendChild(div);
  $messages.scrollTop = $messages.scrollHeight;
}

function showChatBadge() {
  const toggle = document.querySelector('.chat-toggle');
  let badge = toggle.querySelector('.badge');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = '!';
    toggle.appendChild(badge);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
