// idx-vc-pdfshare-verify.js — 강사가 띄운 교재가 «서버에 실제로 저장됐는지» 확인하고, 안 됐으면 조용히 다시 보낸다 (2026-10-20)
//
// [무엇이 문제였나] 2026-10-20 class-4563 (강선생님 ↔ 정우영):
//   교재 사진은 19:13:56 에 서버에 올라갔는데 학생 화면은 19:39 까지 «잠시만 기다려 주세요» 였다.
//   강사 화면에는 교재가 보였다 — 강사 컴퓨터는 교재를 «자기 화면에 먼저» 그린 뒤 pdf-share 신호를 보내는데,
//   그 신호가 서버(DO)에 저장되지 않으면 학생은 받을 것이 없고, 강사는 아무 경고도 못 받는다.
//   학생이 나갔다 들어와도 서버에 저장된 것이 없으니 소용없고, 강사가 교재를 다시 눌러야 그제서야 보인다.
//   신호가 사라지는 길 하나는 코드로 확인했다(idx-main.js createWebSocket — 재연결 큐가 join-room 보다 먼저 나가
//   DO 의 staffOnly 가 «아직 입장 전» 으로 버림. 같은 날 순서를 고쳤다). 반열림 소켓처럼 «못 보는» 길이 더 있을 수
//   있어, 이 파일은 «어떻게 사라졌든» 결과를 확인하는 안전망이다.
//
// [어떻게] window.vcShareTextbook(모든 교재 공유가 지나는 정본)을 감싸, 보낸 뒤
//   VERIFY_DELAYS 마다 /api/room-media/<방> 을 읽어 «그 교재가 저장돼 있나» 본다.
//     · 저장돼 있으면 → 끝
//     · 없거나 다른 교재면 → 같은 교재를 «지금 페이지» 로 다시 보낸다 (최대 MAX_RESEND 번)
//     · 그래도 안 되면 → 강사에게 «학생 화면에 아직 안 보일 수 있다» 를 한/영(+중국어) 으로 말하고 다시 보내기 버튼을 준다
//
// ⛔ 모르면 다시 보내지 않는다 — 조회 실패·입장 전(room-joined 전)은 «없다» 가 아니라 «모른다» 다.
// ⛔ 다른 교재로 바뀌었거나(_vcShownPdfUrl 변경)·공유를 멈췄거나(pdfStopShare)·수업을 나갔으면 즉시 손을 뗀다.
//    그러지 않으면 다른 강사가 바꾼 교재를 옛 교재로 덮어쓰거나, 멈춘 공유를 되살린다.
// ⛔ 상주 타이머 없음 — 공유한 직후 약 45초만 산다(홈에 머무는 학생 폰을 깨우지 않는다).
// ⛔ 이 화면에는 showToast 가 없다(2026-10-20 실측 — 정의 0곳) — 안내 상자는 직접 그린다.
// ⛔ 안내 상자에 data-ko/data-en 을 달지 않는다 — i18n 엔진이 textContent 를 통째로 갈아끼워 버튼이 사라진다(CLAUDE.md).
(function(){
  'use strict';
  var VERIFY_DELAYS = [2500, 6000, 12000, 25000, 45000];   // 공유 뒤 확인 시각(ms)
  var MAX_RESEND = 3;
  var NOTICE_ID = 'vc-pdfshare-notice';
  var NOTICE_MS = 20000;

  var orig = window.vcShareTextbook;
  if (typeof orig !== 'function' || orig.__pdfVerifyWrapped) return;

  var S = window.__vcPdfVerify = { token: 0, job: null, resent: 0, verified: 0, notices: 0 };

  function abs(u){
    u = String(u || '');
    if (!u) return '';
    try { return new URL(u, location.href).href; } catch(e){ return u; }
  }
  function staff(){
    try {
      return (typeof window.vcCanControlTextbook === 'function')
        ? !!window.vcCanControlTextbook()
        : (window.vcMyRole === 'teacher' || window.vcMyRole === 'admin');
    } catch(e){ return false; }
  }
  function roomId(){ try { return (typeof vcRoomId !== 'undefined' && vcRoomId) ? String(vcRoomId) : ''; } catch(e){ return ''; } }
  function inCall(){ try { return !!(document.body && document.body.classList.contains('vc-in-call')); } catch(e){ return false; } }
  function curPage(){ try { return (typeof pdfPageNum !== 'undefined' && pdfPageNum > 0) ? pdfPageNum : 1; } catch(e){ return 1; } }
  function isEn(){ try { return (typeof window.getLang === 'function') && window.getLang() === 'en'; } catch(e){ return false; } }
  function isZh(){
    try { return (String(navigator.language || '') + String((navigator.languages || [])[0] || ''))
      .toLowerCase().indexOf('zh') >= 0; } catch(e){ return false; }
  }

  function cancel(){
    S.token++;
    if (S.job && S.job.timer) { try { clearTimeout(S.job.timer); } catch(e){} }
    S.job = null;
  }
  /* 이 작업이 아직 «살아 있어야» 하는가 — 하나라도 어긋나면 손을 뗀다 */
  function alive(job){
    return job && S.job === job && job.token === S.token && inCall() &&
      abs(window._vcShownPdfUrl) === job.target && roomId() === job.room;
  }

  function resend(job){
    var c = window.vcConn;
    if (!c || typeof c.send !== 'function') return false;
    try {
      c.send({ type: 'pdf-share', data: { pdfId: job.pdfId, url: job.shareUrl, currentPage: curPage(), kind: job.kind, name: job.name } });
      S.resent++;
      console.warn('[pdfshare-verify] 서버에 교재가 없어 다시 보냄(' + (job.tries + 1) + '/' + MAX_RESEND + '):', job.shareUrl);
      return true;
    } catch(e){ return false; }
  }

  function schedule(job){
    if (job.step >= VERIFY_DELAYS.length) { if (S.job === job) S.job = null; return; }
    var wait = VERIFY_DELAYS[job.step] - (job.step ? VERIFY_DELAYS[job.step - 1] : 0);
    job.timer = setTimeout(function(){ check(job); }, wait);
  }

  function check(job){
    job.timer = null;
    if (!alive(job)) { if (S.job === job) S.job = null; return; }
    job.step++;
    /* 입장(room-joined) 전엔 DO 가 지난 수업 상태를 정리하는 중일 수 있다 — «모른다» 로 보고 다음 확인으로 */
    if (window._vcJoinedRoomId !== job.room) { schedule(job); return; }
    var p;
    try { p = fetch('/api/room-media/' + encodeURIComponent(job.room), { cache: 'no-store' }); }
    catch(e){ schedule(job); return; }
    Promise.resolve(p).then(function(r){ return (r && r.ok) ? r.json() : null; })
      .catch(function(){ return null; })
      .then(function(d){
        if (!alive(job)) { if (S.job === job) S.job = null; return; }
        if (!d || typeof d !== 'object') { schedule(job); return; }   // 모른다 → 다시 보내지 않는다
        var st = d.pdfState;
        if (st && st.url && abs(st.url) === job.target) {
          S.verified++;
          console.log('[pdfshare-verify] ✅ 학생에게 전달 확인:', job.shareUrl);
          if (S.job === job) S.job = null;
          hideNotice();
          return;
        }
        if (job.tries < MAX_RESEND) {
          if (resend(job)) job.tries++;
          schedule(job);
          return;
        }
        showNotice(job);
        if (S.job === job) S.job = null;
      });
  }

  function start(pdfId, shareUrl, kind, name){
    cancel();
    var job = {
      token: S.token, room: roomId(), pdfId: pdfId, shareUrl: shareUrl, target: abs(shareUrl),
      kind: kind || '', name: name || '', step: 0, tries: 0, timer: null
    };
    if (!job.room || !job.target) return;
    S.job = job;
    schedule(job);
  }

  window.vcShareTextbook = function(pdfId, url, kind, name, quiet){
    var ok = orig.apply(this, arguments);
    try {
      var shareUrl = String(url || '');
      if (shareUrl.charAt(0) === '/') shareUrl = location.origin + shareUrl;
      /* 보내지 못했거나(false)·로컬 blob(다른 기기가 못 연다 — 다시 보내도 소용없음)·학생이면 확인하지 않는다 */
      if (ok === true && shareUrl && !/^blob:/i.test(shareUrl) && staff()) start(pdfId, shareUrl, kind, name);
    } catch(e){}
    return ok;
  };
  window.vcShareTextbook.__pdfVerifyWrapped = true;

  /* 스스로 공유를 멈추면 확인도 멈춘다 — 안 그러면 다음 확인에서 멈춘 교재를 «없다» 로 보고 되살린다
     (pdfStopShare 는 _vcShownPdfUrl 을 비우지 않는다). */
  var origStop = window.pdfStopShare;
  if (typeof origStop === 'function') {
    window.pdfStopShare = function(){ cancel(); hideNotice(); return origStop.apply(this, arguments); };
  }

  /* ── 강사 안내 상자 ── */
  function hideNotice(){
    try { var n = document.getElementById(NOTICE_ID); if (n && n.parentNode) n.parentNode.removeChild(n); } catch(e){}
  }
  function showNotice(job){
    if (!inCall()) return;
    hideNotice();
    S.notices++;
    var en = isEn();
    var msg = en ? '⚠️ The student may not see this textbook yet.'
                 : '⚠️ 학생 화면에 이 교재가 아직 안 보일 수 있어요.';
    if (isZh()) msg += '\n⚠️ 学生可能还看不到这份教材。';
    var btnTxt = en ? '📤 Send again' : '📤 다시 보내기';
    if (isZh()) btnTxt += ' · 重新发送';
    var n = document.createElement('div');
    n.id = NOTICE_ID;
    n.setAttribute('role', 'alert');
    /* width:max-content — left:50% 만 두면 폭이 «화면 절반» 으로 줄어 폰에서 글자가 세로로 쪼개진다(390px 실측 195px) */
    n.style.cssText = 'position:fixed;left:50%;top:64px;transform:translateX(-50%);z-index:99990;width:max-content;max-width:min(92vw,520px);box-sizing:border-box;'
      + 'background:rgba(15,23,42,.96);color:#fde68a;border:1px solid rgba(251,191,36,.55);border-radius:14px;'
      + 'padding:12px 14px;font-size:14px;font-weight:700;line-height:1.5;box-shadow:0 12px 34px rgba(0,0,0,.5);'
      + 'display:block;white-space:pre-line;text-align:center';
    var t = document.createElement('div');
    t.textContent = msg;
    var row = document.createElement('div');
    row.style.cssText = 'margin-top:9px;display:block;text-align:center';
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = btnTxt;
    b.style.cssText = 'background:#f59e0b;color:#111827;border:0;border-radius:10px;padding:8px 14px;font-weight:800;font-size:14px;cursor:pointer;margin:0 4px';
    b.addEventListener('click', function(){
      hideNotice();
      /* 원래 정본으로 다시 보낸다 — 감싼 쪽을 부르므로 확인도 처음부터 다시 돈다 */
      try { window.vcShareTextbook(job.pdfId, job.shareUrl, job.kind, job.name, true); } catch(e){}
    });
    var x = document.createElement('button');
    x.type = 'button';
    x.textContent = '✕';
    x.setAttribute('aria-label', en ? 'Close' : '닫기');
    x.style.cssText = 'background:transparent;color:#cbd5e1;border:1px solid rgba(203,213,225,.4);border-radius:10px;padding:8px 12px;font-size:14px;cursor:pointer;margin:0 4px';
    x.addEventListener('click', hideNotice);
    row.appendChild(b); row.appendChild(x);
    n.appendChild(t); n.appendChild(row);
    try { document.body.appendChild(n); } catch(e){ return; }
    setTimeout(function(){ var c = document.getElementById(NOTICE_ID); if (c === n) hideNotice(); }, NOTICE_MS);
    console.warn('[pdfshare-verify] ⚠️ ' + MAX_RESEND + '번 다시 보내도 서버에 교재가 없음 — 강사에게 안내:', job.shareUrl);
  }
})();
