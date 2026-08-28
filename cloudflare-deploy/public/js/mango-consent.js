/* mango-consent.js — 수업 녹화 «동의» 를 학생에게 한 번 묻는다 (2026-08-12)
 * ─────────────────────────────────────────────────────────────────────────────
 * 왜 생겼나
 *   운영 D1 의 consents 표가 **0행**이었다. /api/consents 는 예전부터 있었는데
 *   학생 화면에서 부르는 곳이 한 군데도 없었다(관리자 헬스체크만 불렀다).
 *   그래서 녹화 1,552건의 consented_user_ids 가 전부 빈 값이었다 — 미성년 수업
 *   영상인데 «동의를 받았다» 고 말할 근거가 하나도 없었다는 뜻이다.
 *
 * 무엇을 하나
 *   학생이 수업에 들어갈 때 한 번 묻고, 답을 서버에 남긴다. 그 답이 없으면
 *   서버가 녹화를 시작하지 않는다(api-mango.ts 의 consent_required 게이트).
 *
 * 지키는 규칙
 *   · 수업 자체는 절대 막지 않는다. 동의하지 않아도 수업은 그대로 들어간다.
 *     막히는 것은 «녹화» 뿐이다. 여기서 수업을 막으면 동의가 사실상 강요가 된다.
 *   · 한 번만 묻는다. 이미 답(동의/거부 무관)이 있으면 다시 안 묻는다.
 *   · 서버가 안 될 때는 조용히 넘어간다 — 동의 창 오류로 수업이 못 들어가면 안 된다.
 *     (그 경우 녹화는 어차피 서버 게이트에서 안 켜진다. 안전한 쪽으로 실패한다.)
 *   · 한/영 둘 다 — 강사·학생 다수가 한국어를 쓰지 않는다.
 */
(function () {
  'use strict';

  var CONSENT_VERSION = 'v1.0-2026-08';
  var CACHE_KEY = 'mangoi_consent_asked_v1';   // uid 목록 — 물어본 적 있으면 네트워크를 아낀다

  /* 언어 판정은 반드시 getLang() 으로 한다.
     이 페이지엔 i18n 엔진이 둘이고, 나중에 로드되는 js/mango-i18n.js 가 setLang/getLang 을
     덮어쓰면서 인라인 엔진의 전역 currentLang 은 그대로 둔다. currentLang 을 직접 읽으면
     사용자가 🌐 를 눌러도 안 따라온다. */
  function lang() {
    try { if (typeof window.getLang === 'function') return window.getLang(); } catch (_) {}
    try { return localStorage.getItem('mangoi_lang') || 'ko'; } catch (_) { return 'ko'; }
  }
  var isEn = function () { return String(lang()).toLowerCase().indexOf('en') === 0; };

  function askedBefore(uid) {
    try { return (JSON.parse(localStorage.getItem(CACHE_KEY) || '[]') || []).indexOf(uid) >= 0; }
    catch (_) { return false; }
  }
  function rememberAsked(uid) {
    try {
      var a = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]') || [];
      if (a.indexOf(uid) < 0) a.push(uid);
      localStorage.setItem(CACHE_KEY, JSON.stringify(a.slice(-20)));
    } catch (_) {}
  }

  /* 🔐 학생 본인 확인용 서명 토큰 — mango-attendance.js 와 같은 방식.
     이게 없으면 서버가 «누구인지 모르는 요청» 으로 보고 조회를 401 로 막는다(내 동의도 못 읽는다).
     쓰기(POST)는 토큰이 없어도 통과하지만, 있으면 «남의 uid 로 남기기» 가 막힌다. */
  function tok() {
    try { return localStorage.getItem('mango_token') || ''; } catch (_) { return ''; }
  }

  /* 토큰은 «헤더»로 보낸다. 서버(auth-token.ts)는 Authorization: Bearer 를 먼저 읽고,
     없으면 body.token → 쿼리 파라미터 순으로 본다. 쿼리스트링은 프록시·로그·리퍼러에 그대로 남으므로
     자격증명을 거기 싣지 않는다. */
  function authHeaders(extra) {
    var h = Object.assign({ 'Accept': 'application/json' }, extra || {});
    if (tok()) h['Authorization'] = 'Bearer ' + tok();
    return h;
  }

  async function fetchExisting(uid) {
    try {
      var r = await fetch('/api/consents/' + encodeURIComponent(uid), {
        headers: authHeaders(), credentials: 'include'
      });
      if (!r.ok) return null;                       // 401 등 — «없다» 가 아니라 «모른다»
      var row = await r.json();
      return (row && row.user_id) ? row : null;
    } catch (_) { return null; }
  }

  async function save(uid, username, agreed) {
    try {
      var r = await fetch('/api/consents', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({
          user_id: uid,
          token: tok() || undefined,   // 헤더를 못 쓰는 경로 대비(서버는 body.token 도 읽는다)
          username: username || uid,
          role: 'student',
          consent_version: CONSENT_VERSION,
          recording: agreed ? 1 : 0,
          attendance: agreed ? 1 : 0,
          /* 보호자 항목을 «필요함/본인이 대신 확인» 으로 남긴다.
             미성년자 본인 동의만으로는 법적 효력이 약하다. 여기서 «받았다» 고 단정하면
             기록이 실제보다 세게 읽힌다 — 나중에 보호자 확인 경로가 생기면 이 값으로 가려낸다. */
          guardian_required: 1,
          guardian_status: agreed ? 'self_declared' : 'declined'
        })
      });
      return r.ok;
    } catch (_) { return false; }
  }

  function modal(username) {
    return new Promise(function (resolve) {
      var en = isEn();
      var wrap = document.createElement('div');
      wrap.id = 'mangoi-consent-modal';
      wrap.setAttribute('role', 'dialog');
      wrap.setAttribute('aria-modal', 'true');
      wrap.style.cssText =
        'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;' +
        'background:rgba(15,23,42,.72);padding:16px';

      var card = document.createElement('div');
      card.style.cssText =
        'background-color:#ffffff;color:#101828;max-width:460px;width:100%;border-radius:16px;' +
        'padding:22px 20px;box-shadow:0 18px 50px rgba(0,0,0,.35);font-size:15px;line-height:1.6';

      var title = en ? 'Recording consent' : '수업 녹화 동의';
      var body = en
        ? 'Your class may be recorded so you and your guardian can review it later. ' +
          'Recordings are kept for 3 months and then deleted automatically.<br><br>' +
          'You can join the class either way. If you do not agree, <b>the class will simply not be recorded</b>.'
        : '복습을 위해 수업이 녹화될 수 있습니다. 녹화본은 <b>3개월</b> 보관 후 자동으로 지워집니다.<br><br>' +
          '동의하지 않아도 <b>수업은 그대로 들어갑니다</b>. 녹화만 하지 않습니다.';
      var guardianNote = en
        ? 'If you are under 14, please check with your guardian before agreeing.'
        : '만 14세 미만이면 보호자와 함께 확인해 주세요.';

      card.innerHTML =
        '<div style="font-size:18px;font-weight:800;margin-bottom:10px">' + title + '</div>' +
        '<div style="margin-bottom:10px">' + body + '</div>' +
        '<div style="background-color:#f1f5f9;border-radius:10px;padding:10px 12px;font-size:13px;color:#334155">' +
        guardianNote + '</div>' +
        '<div style="display:flex;gap:8px;margin-top:18px">' +
        '  <button type="button" id="mgc-no" style="flex:1;padding:12px;border-radius:10px;border:1px solid #cbd5e1;' +
        '          background-color:#ffffff;color:#334155;font-size:15px;cursor:pointer">' +
        (en ? 'I do not agree' : '동의하지 않음') + '</button>' +
        '  <button type="button" id="mgc-yes" style="flex:1.4;padding:12px;border-radius:10px;border:0;' +
        '          background-color:#f59e0b;color:#ffffff;font-weight:700;font-size:15px;cursor:pointer">' +
        (en ? 'I agree' : '동의합니다') + '</button>' +
        '</div>';

      wrap.appendChild(card);
      document.body.appendChild(wrap);

      function done(v) {
        try { wrap.remove(); } catch (_) {}
        resolve(v);
      }
      card.querySelector('#mgc-yes').addEventListener('click', function () { done(true); });
      card.querySelector('#mgc-no').addEventListener('click', function () { done(false); });
      // 바깥 클릭·ESC 로는 닫지 않는다 — «안 누르고 지나가기» 가 동의로 읽히면 안 된다.
      setTimeout(function () { try { card.querySelector('#mgc-yes').focus(); } catch (_) {} }, 30);
    });
  }

  /**
   * 학생에게 녹화 동의를 한 번 묻고 결과를 남긴다.
   * @returns {Promise<boolean>} 동의했으면 true. (수업 입장 여부와는 무관 — 항상 들어간다)
   */
  window.mangoConsentEnsure = async function (uid, username) {
    uid = String(uid || '').trim();
    if (!uid) return false;                                   // 계정을 모르면 물어봐야 남길 곳이 없다
    if (askedBefore(uid)) return true;                        // 이 기기에서 이미 물었다
    var existing = await fetchExisting(uid);
    if (existing) { rememberAsked(uid); return !!existing.recording_consent; }

    var agreed = await modal(username);
    var ok = await save(uid, username, agreed);
    if (ok) rememberAsked(uid);                               // 저장 실패면 다음 입장에서 다시 묻는다
    return agreed && ok;
  };

  /* 🔌 입장 함수에 «스스로» 붙는다 — idx-main.js 를 건드리지 않기 위해서다.
     [왜 이렇게까지] idx-main.js 는 두 사람이 동시에 만지는 파일이고, 고치면 index.html 의
       ?v= 를 올려야 한다. 그 번호를 두 세션이 각자 올리다가 «같은 주소 다른 내용»이
       1년 캐시에 박히는 사고가 이미 여러 번 났다(v=5·v=6·v=8·v=12). 이 파일은 새 파일이라
       ?v=1 로 시작하고 아무와도 겹치지 않는다.
     [타이밍] 이 스크립트는 defer 로 idx-main.js 뒤에 실행되므로 vcJoinRoom 이 이미 있다.
       혹시 없으면 조용히 넘어간다 — 동의 때문에 수업 입장이 깨지면 안 된다.
     [역할 판정] vcMyRole 은 vcJoinRoom «안에서» 정해지므로 아직 못 읽는다. 대신 계정이
       말해 주는 역할을 쓴다. 강사·관리자는 촬영 주체라 묻지 않는다. */
  function attach() {
    if (typeof window.vcJoinRoom !== 'function' || window.__mangoConsentAttached) return;
    window.__mangoConsentAttached = true;
    var original = window.vcJoinRoom;
    window.vcJoinRoom = async function () {
      try {
        var cu = (typeof window.getCurrentUser === 'function') ? window.getCurrentUser() : null;
        /* ⚠️ 아이디를 꺼내는 순서를 mango-attendance.js 의 accountUid 와 «글자까지» 같게 둔다.
           동의는 이 값으로 저장되고 참가자는 attendance.account_uid 로 채워진다.
           한 글자만 달라도 서버 게이트가 영영 안 맞아 녹화가 계속 거절된다. */
        var uid = String((cu && (cu.uid || cu.user_id || cu.id)) || '').trim();
        var role = String((cu && cu.role) || '').toLowerCase();
        var isStaff = /teacher|tutor|admin|hq/.test(role);
        var observing = false;
        try { observing = (typeof vcIsObserver !== 'undefined' && vcIsObserver === true) || (window._vcObserverMode === true); } catch (_) {}
        if (uid && !isStaff && !observing) {
          var nm = '';
          try { nm = (document.getElementById('vc-name-input') || {}).value || (cu && cu.name) || ''; } catch (_) {}
          await window.mangoConsentEnsure(uid, String(nm || '').trim() || uid);
        }
      } catch (_) { /* 동의 창 오류로 수업을 못 들어가면 안 된다 — 녹화는 서버가 어차피 안 켠다 */ }
      return original.apply(this, arguments);
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach);
  else attach();
})();
