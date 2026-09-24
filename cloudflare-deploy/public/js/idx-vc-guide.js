/* idx-vc-guide.js — 수업 입장 시 «사용법 안내» 창 (2026-09-24 사장님 지시)
 * ─────────────────────────────────────────────────────────────────────────────
 * [지시] 수업에 들어가면 선생님은 선생님용, 학생은 학생용 사용법이 «가장 먼저» 뜨게.
 *        언제든 다시 볼 수 있게 「❓ 사용법」 버튼도.
 *
 * [무엇을 하나]
 *   ・수업 화면(view-videocall-call)으로 들어가는 순간, 역할이 정해지길 최대 약 6초 기다렸다가
 *     선생님·관리자(vcIsStaffNow) → 선생님용 / 그 밖 → 학생용 안내 창을 띄운다.
 *   ・참관(Ghost, body.vc-observer)에게는 «자동으로» 띄우지 않는다(버튼으로는 볼 수 있음).
 *   ・「다음부터 자동으로 열지 않기」를 고르면 그 기기에서는 자동으로 안 뜬다(❓ 버튼은 남음).
 *   ・❓ 버튼: PC 는 방 이름 줄(회의방 버튼 옆), 휴대폰 세로는 맨 위 통합바(#mg-unibar) 안.
 *
 * [그림이 아니라 «글+아이콘» 인 이유] 사용법 그림 파일이 아직 없다. 그림을 받으면
 *   STEPS 대신 그림을 넣으면 된다(창·버튼·자동열기 규칙은 그대로 쓴다).
 *
 * ⚠️ 첫 화면 예산 때문에 반드시 defer. index.html 에는 <script defer> 한 줄만 둔다.
 * ⛔ body class 를 지켜보는 MutationObserver·상주 setInterval 금지(홈이 멎은 전력 2회).
 *    수업 화면으로 «전환하는 순간»(showView)에만 짧게, 끝이 있는 확인을 한다.
 * ⛔ 버튼에 data-ko/data-en 을 달지 말 것 — i18n 엔진이 textContent 를 갈아끼운다.
 */
(function () {
  'use strict';
  if (window.__mgVcGuideReady) return;
  window.__mgVcGuideReady = true;

  var OFF_KEY = 'mangoi_vcguide_off_v1';
  var BTN_PC = 'vc-guide-btn';
  var BTN_M = 'vc-guide-btn-m';
  var OV_ID = 'vc-guide-ov';
  var shownThisEntry = false;

  function isKo() {
    try {
      if (typeof window.getLang === 'function') return window.getLang() !== 'en';
      return (localStorage.getItem('mangoi_lang') || 'ko') !== 'en';
    } catch (e) { return true; }
  }
  function autoOff() { try { return localStorage.getItem(OFF_KEY) === '1'; } catch (e) { return false; } }
  function setAutoOff(v) { try { if (v) localStorage.setItem(OFF_KEY, '1'); else localStorage.removeItem(OFF_KEY); } catch (e) {} }
  function inCall() { return document.body.classList.contains('vc-in-call'); }
  function isObserver() { return document.body.classList.contains('vc-observer'); }
  function isStaff() {
    try { return typeof window.vcIsStaffNow === 'function' && !!window.vcIsStaffNow(); } catch (e) { return false; }
  }
  function roleKnown() {
    var r = window.vcMyRole;
    return r === 'teacher' || r === 'admin' || r === 'student' || r === 'observer' || isStaff();
  }

  /* ── 안내 내용 (아이콘은 실제 화면 버튼과 같은 것) ── */
  var STEPS = {
    teacher: [
      ['📚', '교재 띄우기', '가운데 「📚 교재 고르기」나 「📁 내 파일 올리기」를 누르세요. 선생님이 띄운 교재가 학생 화면에도 똑같이 보입니다.',
             'Show a textbook', 'Tap “Pick textbook” or “Upload my file” in the middle. Students see the same page you show.'],
      ['🗂️', '위쪽 탭으로 도구 바꾸기', '교재 · 칠판 · 동영상 · 학생게임 탭을 눌러 수업 도구를 바꿉니다. 「📖 교재」를 누르면 언제든 교재로 돌아옵니다.',
             'Switch tools with the top tabs', 'Textbook · Whiteboard · Video · Games. Tap “Textbook” to come back anytime.'],
      ['🎤', '아래 버튼 줄', '🎤 마이크 · 📷 카메라 · 🖥️ 화면공유 · 💬 채팅 · ⚙️ 설정(장치·화질·언어). 휴대폰에서는 「⋯」 안에 있습니다.',
             'Bottom buttons', 'Mic · Camera · Screen share · Chat · Settings (device, quality, language). On phones they are under “⋯”.'],
      ['⭐', '칭찬 별', '학생 얼굴 칸의 ⭐ 를 누르면 칭찬 포인트가 학생에게 갑니다.',
             'Praise star', 'Tap ⭐ on a student’s video tile to send praise points.'],
      ['🚪', '수업 끝내기', '수업이 끝나면 오른쪽 아래 빨간 「나가기」를 누르세요.',
             'Finish the class', 'When class is over, tap the red “Leave” button at the bottom right.']
    ],
    student: [
      ['⏳', '잠깐 기다리기', '「잠시만 기다려 주세요」가 보이면 선생님이 교재를 띄울 때까지 기다리면 됩니다.',
             'Wait a moment', 'If you see “Please wait”, the teacher is getting the textbook ready.'],
      ['🎤', '내 소리 확인', '아래 🎤 마이크가 켜져 있어야 선생님이 내 목소리를 들어요. 소리가 이상하면 ⚙️ 설정을 누르세요.',
             'Check your mic', 'Keep 🎤 Mic on so the teacher can hear you. If sound is odd, tap ⚙️ Settings.'],
      ['💬', '채팅으로 말하기', '💬 채팅을 눌러 글로도 질문할 수 있어요.',
             'Chat', 'Tap 💬 Chat to type a question.'],
      ['🔍', '화면 크기 바꾸기', '위쪽의 「교재 크게 · 기본 · 얼굴 크게」로 교재와 얼굴 크기를 바꿀 수 있어요.',
             'Change the layout', 'Use “Book bigger · Default · Face bigger” at the top to resize.'],
      ['🚪', '수업이 끝나면', '빨간 「나가기」를 누르면 수업 평가와 복습퀴즈가 이어서 나와요.',
             'After class', 'Tap the red “Leave” button — a quick rating and review quiz come next.']
    ]
  };

  var styled = false;
  function injectStyle() {
    if (styled) return; styled = true;
    var s = document.createElement('style');
    s.id = 'vc-guide-style';
    s.textContent = [
      '#' + OV_ID + '{position:fixed;inset:0;z-index:2147483001;background:rgba(2,6,23,.62);display:flex;',
      '  align-items:center;justify-content:center;padding:16px;box-sizing:border-box;}',
      '#' + OV_ID + ' .vg-card{background:#ffffff;color:#101828;border-radius:18px;width:100%;max-width:560px;',
      '  max-height:calc(100svh - 32px);display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.4);',
      '  font-family:inherit;line-height:1.5;overflow:hidden;}',
      '#' + OV_ID + ' .vg-head{display:flex;align-items:center;gap:8px;padding:14px 16px 8px;flex:0 0 auto;}',
      '#' + OV_ID + ' .vg-title{font-size:18px;font-weight:800;flex:1 1 auto;min-width:0;}',
      '#' + OV_ID + ' .vg-x{border:0;background:#f1f5f9;color:#101828;width:36px;height:36px;border-radius:999px;',
      '  font-size:18px;cursor:pointer;flex:0 0 auto;}',
      '#' + OV_ID + ' .vg-tabs{display:flex;gap:6px;padding:0 16px 8px;flex:0 0 auto;}',
      '#' + OV_ID + ' .vg-tab{border:1px solid #cbd5e1;background:#fff;color:#344054;border-radius:999px;',
      '  padding:5px 12px;font-size:13px;font-weight:700;cursor:pointer;}',
      '#' + OV_ID + ' .vg-tab.on{background:#b45309;border-color:#b45309;color:#fff;}',
      '#' + OV_ID + ' .vg-body{overflow-y:auto;min-height:0;padding:4px 16px 8px;flex:1 1 auto;}',
      '#' + OV_ID + ' .vg-step{display:flex;gap:12px;align-items:flex-start;padding:10px 0;border-top:1px solid #eef2f6;}',
      '#' + OV_ID + ' .vg-step:first-child{border-top:0;}',
      '#' + OV_ID + ' .vg-ico{font-size:24px;width:40px;height:40px;flex:0 0 40px;display:flex;align-items:center;',
      '  justify-content:center;background:#fff7ed;border-radius:12px;}',
      '#' + OV_ID + ' .vg-txt{display:block;min-width:0;}',
      '#' + OV_ID + ' .vg-txt b{display:block;font-size:15px;}',
      '#' + OV_ID + ' .vg-txt span{display:block;font-size:13.5px;color:#475467;}',
      '#' + OV_ID + ' .vg-foot{display:flex;align-items:center;gap:10px;padding:10px 16px 14px;border-top:1px solid #eef2f6;',
      '  flex:0 0 auto;flex-wrap:wrap;}',
      '#' + OV_ID + ' .vg-off{font-size:13px;color:#475467;display:flex;align-items:center;gap:6px;flex:1 1 auto;cursor:pointer;}',
      '#' + OV_ID + ' .vg-ok{border:0;background:#b45309;color:#fff;font-weight:800;font-size:15px;border-radius:12px;',
      '  padding:10px 22px;cursor:pointer;flex:0 0 auto;}',
      '#' + BTN_PC + '{margin-left:6px;padding:3px 9px;border-radius:999px;cursor:pointer;background:rgba(56,189,248,.14);',
      '  border:1px solid rgba(56,189,248,.45);color:#38bdf8;font-size:11.5px;font-weight:700;line-height:1.7;',
      '  white-space:nowrap;flex:0 0 auto;}',
      '#' + BTN_M + '{display:none;border:1px solid rgba(56,189,248,.5);background:rgba(56,189,248,.16);color:#38bdf8;',
      '  width:22px;height:22px;min-width:22px;border-radius:999px;font-size:12px;font-weight:800;padding:0;',
      '  line-height:20px;cursor:pointer;flex:0 0 auto;}',
      '@media (max-width:920px) and (orientation:portrait){#' + BTN_M + '{display:inline-block;}}'
    ].join('\n');
    document.body.appendChild(s);   // head 가 아니라 body — index.html body <style> 에게 지지 않게
  }

  function esc(t) { return String(t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function render(ov, who) {
    var ko = isKo();
    ov.__who = who;
    var steps = STEPS[who] || STEPS.student;
    ov.querySelector('.vg-title').textContent = ko
      ? (who === 'teacher' ? '👩‍🏫 선생님 사용법' : '🙋 학생 사용법')
      : (who === 'teacher' ? 'How to use (Teacher)' : 'How to use (Student)');
    var tabs = ov.querySelectorAll('.vg-tab');
    for (var i = 0; i < tabs.length; i++) {
      var t = tabs[i].getAttribute('data-who');
      tabs[i].className = 'vg-tab' + (t === who ? ' on' : '');
      tabs[i].textContent = t === 'teacher' ? (ko ? '선생님용' : 'Teacher') : (ko ? '학생용' : 'Student');
    }
    var h = '';
    for (var j = 0; j < steps.length; j++) {
      var s = steps[j];
      h += '<div class="vg-step"><div class="vg-ico">' + esc(s[0]) + '</div><div class="vg-txt"><b>' +
           esc(ko ? s[1] : s[3]) + '</b><span>' + esc(ko ? s[2] : s[4]) + '</span></div></div>';
    }
    ov.querySelector('.vg-body').innerHTML = h;
    ov.querySelector('.vg-offtxt').textContent = ko ? '다음부터 자동으로 열지 않기 (❓ 버튼으로 다시 볼 수 있어요)'
                                                    : 'Don’t open automatically next time (use ❓ to see it again)';
    ov.querySelector('.vg-ok').textContent = ko ? '알겠어요' : 'Got it';
    var x = ov.querySelector('.vg-x');
    x.title = ko ? '닫기' : 'Close';
    x.setAttribute('aria-label', x.title);
  }

  function close() {
    var ov = document.getElementById(OV_ID);
    if (!ov) return;
    try { setAutoOff(!!ov.querySelector('.vg-offchk').checked); } catch (e) {}
    ov.parentNode.removeChild(ov);
    document.removeEventListener('keydown', onKey, true);
  }
  function onKey(e) { if (e.key === 'Escape') close(); }

  function open(who) {
    injectStyle();
    var old = document.getElementById(OV_ID);
    if (old) { render(old, who); return; }
    var ov = document.createElement('div');
    ov.id = OV_ID;
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.innerHTML =
      '<div class="vg-card">' +
        '<div class="vg-head"><div class="vg-title"></div><button type="button" class="vg-x">✕</button></div>' +
        '<div class="vg-tabs"><button type="button" class="vg-tab" data-who="teacher"></button>' +
        '<button type="button" class="vg-tab" data-who="student"></button></div>' +
        '<div class="vg-body"></div>' +
        '<div class="vg-foot"><label class="vg-off"><input type="checkbox" class="vg-offchk"><span class="vg-offtxt"></span></label>' +
        '<button type="button" class="vg-ok"></button></div>' +
      '</div>';
    ov.querySelector('.vg-offchk').checked = autoOff();
    ov.addEventListener('click', function (e) {
      var t = e.target;
      if (t === ov || (t.closest && (t.closest('.vg-x') || t.closest('.vg-ok')))) { close(); return; }
      var tab = t.closest && t.closest('.vg-tab');
      if (tab) render(ov, tab.getAttribute('data-who'));
    });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(ov);
    render(ov, who);
  }
  function openForMe() { open(isStaff() ? 'teacher' : 'student'); }
  window.mgOpenVcGuide = openForMe;

  function btnLabel(b, mobile) {
    var ko = isKo();
    b.textContent = mobile ? '?' : ('❓ ' + (ko ? '사용법' : 'Help'));
    b.title = ko ? '수업 화면 사용법 보기' : 'How to use the class screen';
    b.setAttribute('aria-label', b.title);
  }
  function mountButtons() {
    injectStyle();
    try {
      var info = document.getElementById('vc-room-info');
      var left = info && info.parentNode;
      if (left && !document.getElementById(BTN_PC)) {
        var b = document.createElement('button');
        b.id = BTN_PC; b.type = 'button'; btnLabel(b, false);
        b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); openForMe(); });
        var meet = document.getElementById('vc-meet-btn');
        if (meet && meet.parentNode === left) left.insertBefore(b, meet.nextSibling);
        else left.appendChild(b);
      }
      var uni = document.querySelector('#mg-unibar .uni-info');
      if (uni && !document.getElementById(BTN_M)) {
        var m = document.createElement('button');
        m.id = BTN_M; m.type = 'button'; btnLabel(m, true);
        m.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); openForMe(); });
        uni.appendChild(m);
      }
    } catch (e) {}
  }
  function relabel() {
    var b = document.getElementById(BTN_PC); if (b) btnLabel(b, false);
    var m = document.getElementById(BTN_M); if (m) btnLabel(m, true);
    var ov = document.getElementById(OV_ID); if (ov) render(ov, ov.__who);
  }

  /* 수업 화면에 들어간 순간부터 끝이 있는 확인(최대 약 8초) */
  function onEnter() {
    var n = 0;
    var t = setInterval(function () {
      n++;
      if (!inCall()) { if (n > 16) clearInterval(t); return; }
      mountButtons();
      if (shownThisEntry || isObserver() || autoOff()) {
        if (document.getElementById(BTN_PC) && document.getElementById(BTN_M)) clearInterval(t);
        if (n > 16) clearInterval(t);
        return;
      }
      if (roleKnown() || n >= 12) {           // 역할이 정해졌거나 약 6초가 지났으면
        shownThisEntry = true;
        openForMe();
      }
      if (n > 16) clearInterval(t);
    }, 500);
  }

  function boot() {
    try {
      var orig = window.showView;
      if (typeof orig === 'function' && !orig.__vcGuideWrapped) {
        window.showView = function (id) {
          var r = orig.apply(this, arguments);
          try {
            if (id === 'view-videocall-call') onEnter();
            else { shownThisEntry = false; close(); }
          } catch (e) {}
          return r;
        };
        window.showView.__vcGuideWrapped = true;
      }
    } catch (e) {}
    ['mangoi:langchange', 'mangoi:lang-changed'].forEach(function (ev) {
      try { window.addEventListener(ev, relabel); document.addEventListener(ev, relabel); } catch (e) {}
    });
    if (inCall()) onEnter();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
