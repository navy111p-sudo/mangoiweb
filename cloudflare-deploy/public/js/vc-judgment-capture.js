/* ============================================================
   vc-judgment-capture.js — 🧠 수업 중 실시간 판단 캡처 (사장님 승인 2026-07-21)
   원칙: "수업 절대 안 끊김" — WebRTC/WS/DO 코드 무접촉. 전송 함수 순수 래퍼 +
        수업 통신과 완전히 분리된 별도 HTTP 경로만 사용. 이 파일을 빼면 즉시 원복.

   · 캡처 대상: 학생 본인이 보낸 '전체 채팅'만
     (1:1 비밀채팅 제외 — 개인 대화는 기록 안 하는 기존 정책 유지 / 교사·참관인 제외)
   · 전송: 6건 모이면 즉시, 아니면 90초마다(2건 이상) keepalive POST /api/judgment/inclass
   · 퇴장·화면이탈 시 잔여분 sendBeacon 플러시
   · fail-safe: 전송 3연속 실패 또는 서버 disabled(KV 킬스위치) 응답 → 세션 내 자가 비활성
   ============================================================ */
(function (w, d) {
  'use strict';
  if (w.__mgJudgCap) return; w.__mgJudgCap = true;

  var buf = [], fails = 0, dead = false, timer = null;
  var FLUSH_MS = 90000, MIN_LINES = 2, MAX_NOW = 6, MAX_BUF = 40;

  function isTeacher() {
    try {
      if (typeof w.vcIsTeacherRole === 'function') return !!w.vcIsTeacherRole();
      return w.vcMyRole === 'teacher' || w.vcMyRole === 'admin';
    } catch (_) { return false; }
  }
  function myUid() { try { return String(w.vcUserId || '').trim(); } catch (_) { return ''; } }
  function room() { try { return String(w.vcRoomId || '').trim(); } catch (_) { return ''; } }

  function capture(text) {
    if (dead || !text || !room() || !myUid() || isTeacher()) return;
    try { if (w.vcIsObserver) return; } catch (_) {}
    text = String(text).replace(/\s+/g, ' ').trim().slice(0, 300);
    if (text.length < 2) return;
    buf.push({ text: text, ts: Date.now() });
    if (buf.length > MAX_BUF) buf = buf.slice(-MAX_BUF);
    if (buf.length >= MAX_NOW) flush(false); else armTimer();
  }

  function armTimer() {
    if (timer || dead) return;
    timer = setTimeout(function () {
      timer = null;
      if (buf.length >= MIN_LINES) flush(false);
      else if (buf.length) armTimer();          // 1건뿐이면 다음 주기 또는 퇴장 플러시까지 대기
    }, FLUSH_MS);
  }

  function flush(final) {
    if (dead || !buf.length) return;
    var items = buf; buf = [];
    var payload = JSON.stringify({ room_id: room(), uid: myUid(), name: String(w.vcUsername || ''), items: items });
    if (final && navigator.sendBeacon) {
      try { navigator.sendBeacon('/api/judgment/inclass', new Blob([payload], { type: 'application/json' })); } catch (_) {}
      return;
    }
    try {
      fetch('/api/judgment/inclass', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: payload, keepalive: true
      }).then(function (r) { return r.json().catch(function () { return {}; }); })
        .then(function (j) {
          if (j && j.disabled) { dead = true; return; }
          if (j && j.ok) fails = 0; else if (++fails >= 3) dead = true;
        })
        .catch(function () { if (++fails >= 3) dead = true; });
    } catch (_) { if (++fails >= 3) dead = true; }
  }

  // ── vcSendChat 래핑: 원본이 입력창을 비우기 전에 값을 읽는다. DM(개별 대상)은 캡처 제외. ──
  function wrapSend() {
    var orig = w.vcSendChat;
    if (typeof orig !== 'function' || orig.__mgJudg) return typeof orig === 'function';
    var wrapped = function () {
      try {
        var el = d.getElementById('vc-chat-input');
        var dm = false; try { dm = !!(w.vcChatTarget && w.vcChatTarget.userId); } catch (_) {}
        if (!dm && el) capture(el.value);
      } catch (_) {}
      return orig.apply(this, arguments);
    };
    wrapped.__mgJudg = true;
    w.vcSendChat = wrapped;
    return true;
  }

  // ── vcLeaveRoom 래핑: 방 나가기 직전 잔여 버퍼 최종 플러시(비동기·무대기). ──
  function wrapLeave() {
    var orig = w.vcLeaveRoom;
    if (typeof orig !== 'function' || orig.__mgJudg) return typeof orig === 'function';
    var wrapped = function () {
      try { flush(true); } catch (_) {}
      return orig.apply(this, arguments);
    };
    wrapped.__mgJudg = true;
    w.vcLeaveRoom = wrapped;
    return true;
  }

  // 화면 이탈(탭 닫기·백그라운드) 시에도 잔여분 확보
  w.addEventListener('pagehide', function () { try { flush(true); } catch (_) {} });
  d.addEventListener('visibilitychange', function () {
    try { if (d.visibilityState === 'hidden' && buf.length >= MIN_LINES) flush(true); } catch (_) {}
  });

  // defer 로드라 인라인 함수는 보통 이미 존재하지만, 안전하게 최대 30초 재시도
  var tries = 0;
  (function arm() {
    var ok1 = wrapSend(), ok2 = wrapLeave();
    if ((!ok1 || !ok2) && ++tries < 30) setTimeout(arm, 1000);
  })();
})(window, document);
