/* idx-vc-guide.js — 수업 화면 «한눈에 보기» 안내 그림 (2026-09-24)
 * ─────────────────────────────────────────────────────────────────────────────
 * [사장님 지시] 「수업 입장하면 학생용 한 장은 학생 수업화면에, 선생님용은 선생님 수업화면에
 *   바로 먼저 보여줘. 그리고 언제나 궁금할 때 보게, 잘 보이는 곳에 버튼 만들어서 누르면 나오게」
 *
 * [하는 일]
 *   ① 수업 화면으로 들어가는 순간(showView) 역할에 맞는 그림을 한 번 띄운다.
 *      선생님·관리자 = /img/class-guide/teacher.webp · 그 밖 = student.webp
 *      ⛔ 참관(Ghost)에게는 «자동으로» 띄우지 않는다(할 일이 다르다). ❓ 버튼으로는 볼 수 있다.
 *   ② 상단바에 「❓ 사용법」 버튼을 달아 언제든 다시 연다.
 *      PC·가로 = .toolbar-left(방 정보 옆, «회의방» 버튼과 같은 줄)
 *      휴대폰 세로 = 그 줄이 숨으므로(mango-topbar-unified) 통합바 #mg-unibar 안에 작은 ❓
 *   ③ 「다음부터 자동으로 열지 않기」 — 역할별로 기억(localStorage). 버튼은 그대로 남는다.
 *
 * ⛔ body class 를 지켜보는 MutationObserver·상주 setInterval 금지(홈 전체가 멎은 전력 2회).
 *    showView 를 감싸 «수업 화면으로 전환하는 순간» 부터 끝이 있는 확인만 한다.
 * ⚠️ 역할(vcMyRole)은 입장 «뒤» 에 정해질 수 있다 → 곧바로 띄우지 않고 잠깐 기다렸다 판정한다.
 *    그래도 모르면 학생 판으로 띄운다(선생님은 ❓ 버튼으로 언제든 선생님 판을 본다).
 * ⚠️ 그림 속 글자는 한국어다. 영어 화면에서는 머리글·버튼만 영어로 바뀐다.
 * ⚠️ 그림을 바꾸면 아래 VER 을 올릴 것(주소가 같으면 브라우저 캐시에 옛 그림이 남는다).
 */
(function () {
  'use strict';
  if (window.__vcGuideReady) return;
  window.__vcGuideReady = true;

  var VER = '1';
  var IMG = { teacher: '/img/class-guide/teacher.webp?v=' + VER, student: '/img/class-guide/student.webp?v=' + VER };
  var LS_OFF = 'mangoi_vc_guide_off_';          // + role → '1' 이면 자동으로 안 띄움
  var OV_ID = 'vc-guide-ov';

  function isEn() {
    try { return (typeof window.getLang === 'function' ? window.getLang() : 'ko') === 'en'; } catch (e) { return false; }
  }
  function T(ko, en) { return isEn() ? en : ko; }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }

  function inCall() { return !!(document.body && document.body.classList.contains('vc-in-call')); }
  function isObserver() {
    return window.vcMyRole === 'observer' || !!(document.body && document.body.classList.contains('vc-observer'));
  }
  function roleNow() {
    try { if (typeof window.vcIsStaffNow === 'function' && window.vcIsStaffNow()) return 'teacher'; } catch (e) {}
    return 'student';
  }
  function roleKnown() {
    try {
      if (window.vcMyRole) return true;
      if (typeof window.vcIsStaffNow === 'function' && window.vcIsStaffNow()) return true;
      if (typeof window.vcIsStudentNow === 'function' && window.vcIsStudentNow()) return true;
    } catch (e) {}
    return false;
  }

  /* ── 스타일 — body 끝에 붙인다(head 면 index.html 의 body <style> 에 같은 특정성에서 진다) ── */
  var styled = false;
  function injectStyle() {
    if (styled) return; styled = true;
    var s = document.createElement('style');
    s.id = 'vc-guide-style';
    s.textContent = [
      /* 독(99993) 위 · 재연결 안내(2147483646)·➕ FAB(2147483200) 아래 */
      '#' + OV_ID + '{position:fixed;inset:0;z-index:2147483001;background:rgba(8,12,24,.86);',
      '  display:flex;flex-direction:column;align-items:center;padding:12px 12px 10px;gap:8px;box-sizing:border-box;}',
      '#' + OV_ID + '[hidden]{display:none !important;}',
      '#' + OV_ID + ' .vg-head{width:100%;max-width:1400px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;color:#fff;}',
      '#' + OV_ID + ' .vg-title{font-size:16px;font-weight:800;flex:1 1 auto;min-width:0;}',
      '#' + OV_ID + ' .vg-btn{border:0;border-radius:999px;padding:7px 14px;font-size:13.5px;font-weight:800;cursor:pointer;',
      '  white-space:nowrap;line-height:1.3;box-sizing:border-box;}',
      '#' + OV_ID + ' .vg-sw{background:#334155;color:#e2e8f0;}',
      '#' + OV_ID + ' .vg-sw.on{background:#fde047;color:#1e1b4b;}',
      '#' + OV_ID + ' .vg-zoom{background:#1e293b;color:#e2e8f0;border:1px solid #475569;}',
      '#' + OV_ID + ' .vg-close{background:#f97316;color:#fff;font-size:15px;padding:8px 18px;}',
      '#' + OV_ID + ' .vg-body{flex:0 1 auto;min-height:0;width:100%;max-width:1400px;overflow:auto;border-radius:12px;',
      '  background:#fffaf0;-webkit-overflow-scrolling:touch;}',
      '#' + OV_ID + ' .vg-body img{display:block;width:100%;height:auto;max-width:none;}',
      '#' + OV_ID + '.vg-big .vg-body img{width:2260px;}',
      '#' + OV_ID + ' .vg-foot{width:100%;max-width:1400px;display:flex;align-items:center;justify-content:space-between;',
      '  gap:10px;flex-wrap:wrap;color:#cbd5e1;font-size:13px;}',
      '#' + OV_ID + ' .vg-foot label{display:inline-flex;align-items:center;gap:6px;cursor:pointer;}',
      '#' + OV_ID + ' .vg-foot input{width:16px;height:16px;margin:0;}',
      /* 상단바 ❓ 버튼 — PC(toolbar-left) · 휴대폰 세로(통합바) */
      '#vc-guide-btn{margin-left:8px;padding:3px 10px;border-radius:999px;cursor:pointer;flex:0 0 auto;',
      '  background:rgba(56,189,248,.16);border:1px solid rgba(56,189,248,.5);color:#7dd3fc;',
      '  font-size:11.5px;font-weight:800;line-height:1.7;white-space:nowrap;}',
      '#vc-guide-btn:hover{background:rgba(56,189,248,.28);}',
      '#vc-guide-btn-m{flex:0 0 auto;width:24px;height:24px;border-radius:50%;padding:0;cursor:pointer;',
      '  background:rgba(56,189,248,.2);border:1px solid rgba(56,189,248,.55);color:#e0f2fe;font-size:13px;',
      '  font-weight:800;line-height:22px;text-align:center;box-sizing:border-box;}',
      '@media (max-width:600px){#' + OV_ID + ' .vg-title{font-size:14px;}#' + OV_ID + ' .vg-btn{padding:6px 11px;font-size:12.5px;}}'
    ].join('\n');
    document.body.appendChild(s);
  }

  /* ── 오버레이 ── */
  var shownRole = 'student';
  function build() {
    var ov = document.getElementById(OV_ID);
    if (ov) return ov;
    injectStyle();
    ov = document.createElement('div');
    ov.id = OV_ID;
    ov.hidden = true;
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.innerHTML =
      '<div class="vg-head">' +
        '<div class="vg-title"></div>' +
        '<button type="button" class="vg-btn vg-sw" data-role="teacher"></button>' +
        '<button type="button" class="vg-btn vg-sw" data-role="student"></button>' +
        '<button type="button" class="vg-btn vg-zoom"></button>' +
        '<button type="button" class="vg-btn vg-close"></button>' +
      '</div>' +
      '<div class="vg-body"><img alt="" decoding="async"></div>' +
      '<div class="vg-foot"><label><input type="checkbox" class="vg-off"><span class="vg-off-t"></span></label>' +
        '<span class="vg-hint"></span></div>';
    document.body.appendChild(ov);

    ov.addEventListener('click', function (e) {
      var t = e.target;
      if (t === ov) { close(); return; }                                   // 바깥(어두운 곳) 누르면 닫힘
      if (t.closest && t.closest('.vg-close')) { close(); return; }
      var sw = t.closest && t.closest('.vg-sw');
      if (sw) { paint(sw.getAttribute('data-role')); return; }
      if (t.closest && t.closest('.vg-zoom')) { ov.classList.toggle('vg-big'); label(); return; }
    });
    ov.querySelector('.vg-off').addEventListener('change', function () {
      lsSet(LS_OFF + shownRole, this.checked ? '1' : null);
    });
    document.addEventListener('keydown', function (e) {
      if ((e.key === 'Escape' || e.key === 'Esc') && !ov.hidden) close();
    });
    return ov;
  }
  function label() {
    var ov = document.getElementById(OV_ID); if (!ov) return;
    ov.querySelector('.vg-title').textContent = shownRole === 'teacher'
      ? T('🧑‍🏫 선생님 수업화면 사용법', '🧑‍🏫 Teacher class screen — how to use')
      : T('🧒 학생 수업화면 사용법', '🧒 Student class screen — how to use');
    ov.querySelector('[data-role="teacher"]').textContent = T('선생님용', 'Teacher');
    ov.querySelector('[data-role="student"]').textContent = T('학생용', 'Student');
    ov.querySelector('.vg-zoom').textContent = ov.classList.contains('vg-big') ? T('🔍 화면에 맞추기', '🔍 Fit') : T('🔍 크게 보기', '🔍 Zoom in');
    ov.querySelector('.vg-close').textContent = T('✕ 닫고 수업하기', '✕ Close');
    ov.querySelector('.vg-off-t').textContent = T('다음부터 입장할 때 자동으로 열지 않기', "Don't open automatically next time");
    ov.querySelector('.vg-hint').textContent = T('언제든 맨 위 ❓ 버튼으로 다시 볼 수 있어요. 휴대폰은 「크게 보기」를 눌러 밀어서 보세요.', 'Open it again any time with the ❓ button at the top. On a phone, tap “Zoom in” and swipe.');
    [].forEach.call(ov.querySelectorAll('.vg-sw'), function (b) { b.classList.toggle('on', b.getAttribute('data-role') === shownRole); });
    ov.querySelector('.vg-off').checked = lsGet(LS_OFF + shownRole) === '1';
    ov.querySelector('.vg-body img').alt = ov.querySelector('.vg-title').textContent;
  }
  function paint(role) {
    shownRole = role === 'teacher' ? 'teacher' : 'student';
    var ov = build();
    var img = ov.querySelector('.vg-body img');
    if (img.getAttribute('src') !== IMG[shownRole]) img.setAttribute('src', IMG[shownRole]);
    label();
  }
  function open(role) {
    var ov = build();
    paint(role || roleNow());
    ov.classList.remove('vg-big');
    label();
    ov.hidden = false;
    try { ov.querySelector('.vg-body').scrollTop = 0; ov.querySelector('.vg-close').focus({ preventScroll: true }); } catch (e) {}
  }
  function close() {
    var ov = document.getElementById(OV_ID);
    if (ov) ov.hidden = true;
  }

  /* ── 상단바 버튼 ── */
  function mountButtons() {
    injectStyle();
    try {
      var left = document.querySelector('#view-videocall-call .toolbar-left') || document.querySelector('.toolbar-left');
      if (left && !document.getElementById('vc-guide-btn')) {
        var b = document.createElement('button');
        b.id = 'vc-guide-btn'; b.type = 'button';
        b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); open(); });
        left.appendChild(b);
      }
      var bar = document.getElementById('mg-unibar');
      if (bar && !document.getElementById('vc-guide-btn-m')) {
        var m = document.createElement('button');
        m.id = 'vc-guide-btn-m'; m.type = 'button'; m.textContent = '?';
        m.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); open(); });
        var rec = bar.querySelector('.uni-rec');
        if (rec) bar.insertBefore(m, rec); else bar.appendChild(m);
      }
      btnText();
    } catch (e) { console.warn('[vc-guide] mount', e); }
  }
  function btnText() {
    var b = document.getElementById('vc-guide-btn');
    if (b) { b.textContent = T('❓ 사용법', '❓ Guide'); b.title = T('수업화면 버튼 사용법 그림 보기', 'See how to use the class screen'); }
    var m = document.getElementById('vc-guide-btn-m');
    if (m) { m.title = T('사용법 보기', 'How to use'); m.setAttribute('aria-label', m.title); }
  }

  /* ── 입장 순간: 역할이 정해질 때까지 잠깐(최대 ~6초) 기다렸다 한 번 띄운다 ── */
  var autoDone = false, waitT = null;
  function onEnter() {
    mountButtons();
    if (autoDone || waitT) return;
    var n = 0;
    waitT = setInterval(function () {
      n++;
      mountButtons();                                   // 통합바는 입장 뒤에 만들어진다
      if (!inCall()) { if (n > 12) { clearInterval(waitT); waitT = null; } return; }
      if (!roleKnown() && n < 8) return;               // 역할 대기(0.75초 × 8)
      clearInterval(waitT); waitT = null;
      autoDone = true;
      if (isObserver()) return;
      var role = roleNow();
      if (lsGet(LS_OFF + role) === '1') return;
      open(role);
    }, 750);
  }
  function onLeave() {
    autoDone = false;                                  // 다음 수업에 다시 한 번
    if (waitT) { clearInterval(waitT); waitT = null; }
    close();
  }

  function boot() {
    try {
      var orig = window.showView;
      if (typeof orig === 'function' && !orig.__vcGuideWrapped) {
        window.showView = function (id) {
          var r = orig.apply(this, arguments);
          try { if (id === 'view-videocall-call') onEnter(); else onLeave(); } catch (e) {}
          return r;
        };
        window.showView.__vcGuideWrapped = true;
      }
    } catch (e) {}
    try {
      var relabel = function () { btnText(); label(); };
      window.addEventListener('mangoi:langchange', relabel);
      window.addEventListener('mangoi:lang-changed', relabel);
    } catch (e) {}
    if (inCall()) onEnter();
    window.vcOpenClassGuide = open;                    // 다른 곳(독·설정)에서 부를 창구
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
