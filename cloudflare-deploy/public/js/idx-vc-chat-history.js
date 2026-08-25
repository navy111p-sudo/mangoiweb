/* ════════════════════════════════════════════════════════════════
   💬 이전 대화 보기 — 채팅 이력을 «누를 때만» 불러온다 (2026-08-25)

   왜 버튼인가
     · 2026-07-24 사장님 지시로 채팅 이력 «자동» 로드를 껐다(idx-main.js vcJoinRoom 안,
       `window.__vcChatAutoLoadHistory` 스위치). 이유는 「상담 내용이 다음 수업에 그대로 남는 문제」.
     · 그런데 「먼저 들어와 남긴 말이 다시 들어오면 사라진다」는 불편은 그대로였다.
     · 그래서 기본값은 그대로 «빈 채팅» 으로 두고, 필요한 사람이 누를 때만 불러온다.
       자동으로는 아무것도 안 올라오므로 7월 지시와 부딪히지 않는다.
     ⛔ 이 파일을 「입장하면 자동 호출」로 바꾸지 말 것. 그 순간 7월에 껐던 그 동작이 된다.

   얼마나 거슬러 보나 — 방 이름이 «두 종류» 라 한 숫자로 못 정한다
     · class-{예약id}-{YYYYMMDD} … 이름에 날짜가 있어 하루 지나면 아예 다른 방 → 48시간이어도
       «그날 그 수업» 말고는 나올 것이 없다.
     · mangoi-class (기본방·회의방) … 이름이 고정이라 앞 타임·어제 수업이 전부 같은 방 →
       길게 잡으면 남의 수업 대화가 넘어온다. 그래서 3시간(=이번 타임)만.
     ⚠️ 이 판정을 방 번호가 아니라 «이름 모양» 으로 하는 이유: 기본방은 예약과 연결이 없어
       «다음 수업이 언제인지» 를 시스템이 알 방법이 없다.

   함께 지켜야 하는 것
     · 「채팅 지우기」 이후 것만 보여 준다 — 안 그러면 «지웠는데 다시 들어오니 살아 있다» 가 된다.
       지운 시각은 이 파일이 vcResetChat 을 감싸서 방마다 기억한다(서버 기록은 그대로 남긴다).
     · 불러온 메시지에는 `_loadedAt` 을 붙인다 — 안읽음 배지·채팅창 자동열기를 막는 표시라
       (idx-main.js vcReceiveChat) 빠뜨리면 재입장마다 배지가 200개로 뜬다.
     · 1:1 귓속말은 애초에 서버에 저장하지 않는다(개인 대화) → 복원되지 않는 것이 정상.

   ⚠️ 이 파일은 defer 다. 첫 화면 예산(first_paint_budget_harness)이 index.html 상한에
      거의 닿아 있어 idx-main.js 에 넣을 수 없다. blocking 으로 바꾸지 말 것.
   ⚠️ 방 번호는 `let vcRoomId`(idx-main.js) 라 **window 에 없다** — `window.vcRoomId` 로 읽으면
      항상 undefined 다(CLAUDE.md 함정). 같은 클래식 스크립트 전역이므로 «맨이름» 으로 읽는다.
   ════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var BTN_ID = 'vc-chat-history-btn';
  var LS_PREFIX = 'mangoi_chat_cleared_';
  var HOUR = 3600 * 1000;
  var WINDOW_DATED = 48 * HOUR;   // class-…-YYYYMMDD — 날짜로 이미 갈린 방
  var WINDOW_SHARED = 3 * HOUR;   // mangoi-class 등 여러 수업이 돌려 쓰는 고정 방
  var MAX_ROWS = 200;

  var loading = false;

  function isEn() {
    try { if (typeof getLang === 'function') return getLang() === 'en'; } catch (e) {}
    return document.documentElement.lang === 'en';
  }

  function roomId() {
    // 맨이름으로 읽는다(window.vcRoomId 는 항상 undefined). 아직 선언 전이면 예외 → ''
    try { return (typeof vcRoomId !== 'undefined' && vcRoomId) ? String(vcRoomId) : ''; }
    catch (e) { return ''; }
  }

  function token() {
    try { return localStorage.getItem('mango_token') || ''; } catch (e) { return ''; }
  }

  /* 날짜가 이름에 박힌 방인가 — class-849-20260825 */
  function windowMs(rid) {
    return /^class-.+-\d{8}$/.test(rid) ? WINDOW_DATED : WINDOW_SHARED;
  }

  function clearedAt(rid) {
    try { return parseInt(localStorage.getItem(LS_PREFIX + rid) || '0', 10) || 0; }
    catch (e) { return 0; }
  }

  /* 라벨을 바꿀 때는 data-ko/data-en 도 함께 갱신한다.
     textContent 만 쓰면 🌐 를 눌렀을 때 i18n 엔진이 옛 글자로 되돌린다(CLAUDE.md 함정). */
  function setLabel(btn, ko, en) {
    if (!btn) return;
    btn.setAttribute('data-ko', ko);
    btn.setAttribute('data-en', en);
    btn.textContent = isEn() ? en : ko;
  }

  function btn() { return document.getElementById(BTN_ID); }

  // ── 「채팅 지우기」 시각 기억 ────────────────────────────────
  //   지운 뒤에 이 버튼을 누르면 지운 것이 되살아나면 안 된다.
  //   서버 기록은 건드리지 않는다(감사·분쟁 대비). 이 화면에서 안 보여 줄 뿐이다.
  (function wrapReset() {
    var orig = window.vcResetChat;
    if (typeof orig !== 'function') return;
    window.vcResetChat = function () {
      var before = document.getElementById('vc-chat-messages');
      var had = before ? before.innerHTML : '';
      var r = orig.apply(this, arguments);
      // 확인창에서 취소하면 화면이 그대로다 → 그때는 «지웠다» 로 적지 않는다
      var after = document.getElementById('vc-chat-messages');
      if (after && after.innerHTML === '' && had !== '') {
        var rid = roomId();
        if (rid) { try { localStorage.setItem(LS_PREFIX + rid, String(Date.now())); } catch (e) {} }
        var b = btn();
        if (b) { b.disabled = false; setLabel(b, '이전 대화 보기', 'Earlier messages'); }
      }
      return r;
    };
  })();

  // ── 불러오기 ────────────────────────────────────────────────
  async function loadHistory() {
    if (loading) return;
    var b = btn();
    var rid = roomId();
    if (!rid) {
      if (b) setLabel(b, '수업에 들어간 뒤에 볼 수 있어요', 'Available after joining');
      return;
    }
    var since = Math.max(Date.now() - windowMs(rid), clearedAt(rid));

    loading = true;
    if (b) { b.disabled = true; setLabel(b, '불러오는 중…', 'Loading…'); }

    try {
      var qs = '?room_id=' + encodeURIComponent(rid) +
               '&limit=' + MAX_ROWS +
               '&since=' + since +
               '&token=' + encodeURIComponent(token());
      var r = await fetch('/api/chat/messages' + qs);
      var d = await r.json().catch(function () { return {}; });

      if (!d || !d.ok) {
        // 401 = 이 수업 참여자가 아님. 그 밖은 통신 실패.
        if (r.status === 401) setLabel(b, '이 수업 참여자만 볼 수 있어요', 'Participants only');
        else setLabel(b, '불러오지 못했어요 · 다시 누르기', 'Could not load · tap again');
        if (b) b.disabled = false;
        loading = false;
        return;
      }

      var rows = d.rows || [];
      if (!rows.length) {
        setLabel(b, '불러올 이전 대화가 없어요', 'No earlier messages');
        loading = false;
        return;   // 버튼은 눌린 채로 둔다(다시 눌러도 같은 결과)
      }

      var box = document.getElementById('vc-chat-messages');
      if (!box) { loading = false; return; }

      /* 지금 화면에 있는 대화는 «뒤» 에 그대로 둔다.
         vcReceiveChat 이 container.innerHTML += 로 «맨 뒤에» 붙이므로,
         비우고 → 이력을 먼저 그리고 → 원래 것을 다시 붙이는 순서라야 시간순이 맞는다. */
      var prev = box.innerHTML;
      box.innerHTML = '';

      var head = document.createElement('div');
      head.className = 'vc-chat-hist-mark';
      head.style.cssText = 'text-align:center;font-size:11px;color:#94a3b8;padding:6px 4px;margin-bottom:6px;border-bottom:1px dashed rgba(148,163,184,.22)';
      head.textContent = isEn()
        ? '─ ' + rows.length + ' earlier message(s) ─'
        : '─ 이전 대화 ' + rows.length + '개 ─';
      box.appendChild(head);

      for (var i = 0; i < rows.length; i++) {
        var m = rows[i];
        try {
          window.vcReceiveChat({
            userId: m.sender_uid,
            username: m.sender_name || (isEn() ? 'Unknown' : '익명'),
            message: m.message,
            type: (m.sender_role === 'system') ? 'system' : 'user',
            _loadedAt: m.sent_at,     // ⚠️ 배지·자동열기를 막는 표시. 빼지 말 것
          });
        } catch (e) { /* 한 줄이 깨져도 나머지는 그린다 */ }
      }

      if (prev) {
        var tail = document.createElement('div');
        tail.className = 'vc-chat-hist-mark';
        tail.style.cssText = 'text-align:center;font-size:11px;color:#94a3b8;padding:6px 4px;margin:6px 0;border-top:1px dashed rgba(148,163,184,.22)';
        tail.textContent = isEn() ? '─ from here: this session ─' : '─ 여기부터 지금 대화 ─';
        box.appendChild(tail);
        box.innerHTML += prev;
      }

      // 불러온 목적이 «읽는 것» 이므로 맨 위(가장 오래된 것)로 올려 준다
      box.scrollTop = 0;
      setLabel(b, '이전 대화 ' + rows.length + '개 불러옴', 'Loaded ' + rows.length);
    } catch (e) {
      console.warn('[vc-chat-hist] load:', e);
      setLabel(b, '불러오지 못했어요 · 다시 누르기', 'Could not load · tap again');
      if (b) b.disabled = false;
    }
    loading = false;
  }

  function boot() {
    var b = btn();
    if (!b || b.dataset.wired === '1') return;
    b.dataset.wired = '1';
    b.addEventListener('click', function (e) {
      e.preventDefault();
      loadHistory();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // 콘솔에서 직접 부를 수 있게(점검용)
  window.vcChatHistoryLoad = loadHistory;
})();
