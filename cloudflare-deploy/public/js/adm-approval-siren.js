/* 🚨 관리자 화면 결재 사이렌 (2026-09-24 사장님 「관리자 화면 사이렌도 만들어줘」)
 *
 *   결재함(/work)에만 있던 사이렌을 관리자 화면(admin.html)에서도 울린다 —
 *   부장님이 온종일 켜 두는 화면은 결재함이 아니라 관리자 화면이라서다.
 *
 *   · 무엇으로 판정하나: /api/approval/home 이 주는 inbox 의 siren_at(서버 nudgePlan 정본).
 *     ⛔ 시각 규칙을 여기 베끼지 않는다 — 결재함 사이렌과 «같은 순간» 울려야 한다.
 *   · 누구에게: 그 API 가 «내가 결재할 수 있는 건» 만 준다. 거기서 대신 결재(by_proxy)·
 *     앞 단계를 내가 찍은 건(same_decider)은 뺀다(결재함 sirenDue 와 같은 조건).
 *   · 밤 22~8시 KST 는 긴급만.
 *   · 「30분 뒤」는 결재함과 **같은 저장칸**을 쓴다 — 한쪽에서 미루면 둘 다 조용해진다.
 *   · 본사 계정이 아니면(403) 그 자리에서 멈추고 다시 묻지 않는다.
 *   ⛔ 상주 MutationObserver 없음. 타이머는 이 파일 하나(1분 확인 · 5분마다 새로 받기).
 */
(function () {
  'use strict';
  if (window.__admApprovalSiren) return;
  window.__admApprovalSiren = true;

  var SNOOZE_KEY = 'mangoi_work_siren_snooze_v1';   // ⚠️ work.html 과 같은 이름 — 바꾸면 둘이 따로 운다
  var FETCH_EVERY = 5;                              // 분
  var inbox = [], stopped = false, tick = 0, sirenFor = 0, toneT = null, actx = null;

  function en() {
    try {
      if (window.adminLang) return window.adminLang === 'en';
      return localStorage.getItem('mangoi_lang') === 'en';
    } catch (e) { return false; }
  }
  function T(e, k) { return en() ? e : k; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function quiet() { var h = new Date(Date.now() + 9 * 3600000).getUTCHours(); return h >= 22 || h < 8; }
  function snoozed() {
    try { return Number(localStorage.getItem(SNOOZE_KEY) || 0) > Date.now(); } catch (e) { return false; }
  }
  function snooze(min) { try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + min * 60000)); } catch (e) {} }

  // 소리 — 브라우저는 사람 조작 전에는 소리를 못 낸다. 첫 클릭·키에서 깨워 둔다.
  function wake() {
    try {
      if (!actx) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) actx = new AC(); }
      if (actx && actx.state === 'suspended') actx.resume();
    } catch (e) {}
  }
  document.addEventListener('pointerdown', wake, { capture: true, passive: true });
  document.addEventListener('keydown', wake, { capture: true, passive: true });
  function tone() {
    wake();
    if (!actx) return;
    try {
      for (var k = 0; k < 3; k++) {
        var o = actx.createOscillator(), g = actx.createGain(), t0 = actx.currentTime + k * 0.5;
        o.type = 'square';
        o.frequency.setValueAtTime(880, t0);
        o.frequency.linearRampToValueAtTime(1320, t0 + 0.22);
        o.frequency.linearRampToValueAtTime(880, t0 + 0.44);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.46);
        o.connect(g); g.connect(actx.destination);
        o.start(t0); o.stop(t0 + 0.47);
      }
    } catch (e) {}
  }

  function due() {
    var now = Date.now(), pick = null;
    for (var i = 0; i < inbox.length; i++) {
      var r = inbox[i];
      if (!r || r.status !== 'pending' || !r.siren_at || now < Number(r.siren_at)) continue;
      if (r.by_proxy || r.same_decider) continue;
      if (r.req_type !== 'urgent' && quiet()) continue;
      if (!pick || Number(r.siren_at) < Number(pick.siren_at)) pick = r;
    }
    return pick;
  }

  function stop() {
    if (toneT) { clearInterval(toneT); toneT = null; }
    var el = document.getElementById('adm-siren'); if (el && el.parentNode) el.parentNode.removeChild(el);
    sirenFor = 0;
  }

  function style() {
    if (document.getElementById('adm-siren-style')) return;
    var s = document.createElement('style');
    s.id = 'adm-siren-style';
    // z-index: 휴대폰 드로어(100001)·모달(100002) 위. 클래스 이름을 -btn 으로 끝내지 않는다(전역 룰).
    s.textContent =
      '#adm-siren{position:fixed;inset:0;z-index:100050;background:rgba(142,27,20,.94);color:#fff;display:flex;' +
      'align-items:center;justify-content:center;padding:24px;text-align:center;font-family:inherit}' +
      '#adm-siren .sbox{max-width:440px;display:flex;flex-direction:column;gap:14px}' +
      '#adm-siren h2{font-size:22px;margin:0;line-height:1.35;color:#fff}' +
      '#adm-siren p{margin:0;font-size:15px;line-height:1.5;color:#fff}' +
      '#adm-siren button{font:inherit;font-size:16px;font-weight:700;min-height:52px;border-radius:10px;border:0;cursor:pointer}' +
      '#adm-siren .sgo{background:#fff;color:#8e1b14}' +
      '#adm-siren .slater{background:transparent;color:#fff;border:2px solid rgba(255,255,255,.7)}' +
      '@media (prefers-reduced-motion: no-preference){#adm-siren{animation:admSirenPulse 1s ease-in-out infinite alternate}}' +
      '@keyframes admSirenPulse{from{background:rgba(142,27,20,.94)}to{background:rgba(190,40,28,.94)}}';
    document.head.appendChild(s);
  }

  function check() {
    if (snoozed()) { stop(); return; }
    var r = due();
    if (!r) { stop(); return; }
    if (sirenFor === r.id && document.getElementById('adm-siren')) return;
    stop();
    style();
    sirenFor = r.id;
    // 단계가 열린 시각 = 사이렌 − (승격 − 사이렌). 서버 비율을 베끼지 않는다(결재함과 같은 식).
    var st0 = Number(r.siren_at) - (Number(r.escalate_at || r.siren_at) - Number(r.siren_at));
    var hours = Math.max(1, Math.round((Date.now() - st0) / 3600000));
    var box = document.createElement('div');
    box.id = 'adm-siren';
    box.setAttribute('role', 'alertdialog');
    box.innerHTML = '<div class="sbox"><h2>' + esc(T('An approval has been waiting too long', '결재가 너무 오래 기다리고 있습니다')) + '</h2>' +
      '<p>' + esc(r.title || '') + '</p>' +
      '<p>' + esc(T('Waiting for about ' + hours + ' hours', '약 ' + hours + '시간째 대기 중')) + '</p>' +
      '<button type="button" class="sgo">' + esc(T('Decide now', '지금 결재하기')) + '</button>' +
      '<button type="button" class="slater">' + esc(T('Remind me in 30 min', '30분 뒤 다시 알림')) + '</button></div>';
    document.body.appendChild(box);
    var id = r.id;
    box.querySelector('.sgo').onclick = function () {
      snooze(10);
      stop();
      var url = '/work?id=' + id;
      // 인앱 브라우저는 새 창을 못 연다(null) — 그때는 같은 창에서.
      var w = null;
      try { w = window.open(url, '_blank'); } catch (e) { w = null; }
      if (w) { try { w.opener = null; } catch (e) {} } else { location.href = url; }
    };
    box.querySelector('.slater').onclick = function () { snooze(30); stop(); };
    tone();
    toneT = setInterval(tone, 3000);
  }

  function load() {
    if (stopped) return Promise.resolve();
    return fetch('/api/approval/home', { credentials: 'include', headers: { Accept: 'application/json' } })
      .then(function (r) {
        // 결재함을 못 쓰는 계정(강사·지사·로그인 안 됨)이면 그만 묻는다.
        if (r.status === 401 || r.status === 403) { stopped = true; inbox = []; return null; }
        if (!r.ok) return null;
        return r.json();
      })
      .then(function (d) {
        if (d && d.ok !== false && Array.isArray(d.inbox)) inbox = d.inbox;
      })
      .catch(function () { /* 다음 회차에 다시 */ });
  }

  window.__admApprovalSirenState = function () { return { inbox: inbox.length, stopped: stopped, ringing: sirenFor }; };

  function start() {
    load().then(check, check);
    setInterval(function () {
      if (stopped) return;
      tick++;
      if (tick % FETCH_EVERY === 0) load().then(check, check);
      else check();   // 데이터가 안 바뀌어도 시간이 흘러 사이렌 시각이 될 수 있다
    }, 60000);
  }
  // 첫 화면 그리기와 겹치지 않게 조금 뒤에 시작한다.
  setTimeout(start, 4000);
})();
