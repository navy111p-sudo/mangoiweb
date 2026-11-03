/* 📱 A.i 말하기 연습 — 휴대폰 «위쪽 버튼 한 줄» (2026-11-03 사장님 선택: 세로 B · 가로 C)
 *
 * 사장님 「휴대폰 가로·세로에서 위의 버튼들이 모두 한 줄에 있게 — 아바타와 대화글이 가려져서 안 보여」
 *   → 시안 6종(세로 3 · 가로 3) 중 «세로 B(초소형 아이콘 한 줄)» 와 «가로 C(투명하게 떠 있는 바 + 숨기기)» 선택.
 *
 * 한 일 (새 기능은 없다 — 이미 있는 요소를 «옮기기» 만 한다)
 *   - 위쪽 머리글(.top) 한 줄 안에 주제·콤보 칩(.meta), 도구 줄(#wfTools: 질문하기·배경/속도·문장 크게),
 *     이전 대화·대답 도움 줄(.wg-history-bar)을 옮겨 넣는다. 버튼은 CSS 로 아이콘만 보이게 한다
 *     (글자는 그대로 남아 화면낭독기·툴팁이 읽는다 — 언어 전환(data-ko/en)도 그대로 동작).
 *   - 진행 문구(.wg-progress «한마디부터 시작해요 · 내 답변 N개»)는 ⋮ 설정 메뉴 맨 위로 옮긴다.
 *   - 세로에서는 폭이 모자라 «모드 선택 · 🏠 · 🔄 · 🔊» 를 ⋮ 메뉴 맨 위 «빠른 줄» 로 옮긴다
 *     (🔄·🎚️ 와 같은 기능은 원래 ⋮ 메뉴에도 있다. 🎚️ 와 ⋮ 는 한 줄에 남는다).
 *   - 가로에서는 머리글을 화면 위에 반투명하게 띄우고, ⌃ 로 숨기면 위 가운데 «메뉴» 손잡이만 남는다.
 *
 * 원칙
 *   - 휴대폰 크기에서만 켠다 — 세로 (max-width:640px) / 가로 (orientation:landscape) and (max-height:520px).
 *     PC·태블릿은 한 글자도 안 바뀐다. 화면을 돌리면 원래 자리로 되돌린 뒤 다시 옮긴다(자리표 주석 노드).
 *   - 옮기는 요소는 id·클릭 처리기를 그대로 지닌다(warmup-touch-bar.js 의 #talkSwitch 옮기기와 같은 방식).
 *   - 터치 기기에서 «이전 대화·대답 도움» 줄은 기존 규칙(html.tb-on .wg-history-bar)대로 감춰진다
 *     — 아래 💡 도움 시트에 같은 버튼이 있어서다. 그 규칙을 이기지 않도록 display 에 !important 를 쓰지 않는다.
 *   - body 관찰(MutationObserver)은 하지 않는다(홈이 멎은 전력 — warmup-touch-bar.js 주석).
 * 짝: css/warmup-topbar.css · 감시: test-harness/manual/warmup-topbar-browser.mjs (사람이 부릅니다)
 */
(function () {
  'use strict';
  if (window.WarmupTopbar) return;

  var doc = document, root = doc.documentElement;
  function $(id) { return doc.getElementById(id); }
  function tr(ko, en) { return typeof window.wuT === 'function' ? window.wuT(ko, en) : ko; }

  var top = doc.querySelector('.top');
  var menuWrap = top && top.querySelector('.menu-wrap');
  var menuScroll = doc.querySelector('#menuPanel .menu-scroll');
  if (!top || !menuWrap || !menuScroll) return;

  var mqPortrait, mqLandscape;
  try {
    mqPortrait = window.matchMedia('(max-width:640px)');
    mqLandscape = window.matchMedia('(orientation:landscape) and (max-height:520px)');
  } catch (e) { return; }

  var HIDE_KEY = 'mangoi_warmup_topbar_hidden';

  // 옮길 요소 — 처음 한 번만 찾는다(옮긴 뒤에는 위치가 바뀌므로)
  var META = doc.querySelector('.wrap .meta');
  var TOOLS = $('wfTools');
  var HISTORY = doc.querySelector('.wg-history-bar');
  var PROGRESS = doc.querySelector('.wg-progress');
  var PORTRAIT_TO_MENU = [
    top.querySelector('a[href="/ai-speaking.html"]'),   // 모드 선택
    top.querySelector('.back.home'),                     // 🏠
    $('newChatTop'),                                     // 🔄
    $('spkToggle')                                       // 🔊
  ];
  var CAPTIONS = { newChatTop: ['새 대화', 'New chat'], spkToggle: ['소리', 'Sound'] };

  function make(tag, id) { var e = doc.createElement(tag); e.id = id; return e; }

  // 한 줄 안의 가운데 칸(칩·도구) — 제목(h1) 바로 뒤, 🔄·🔊·🎚️·⋮ 앞
  var slot = make('div', 'wuTbSlot');
  slot.setAttribute('role', 'group');
  var h1 = top.querySelector('h1');
  top.insertBefore(slot, h1 ? h1.nextSibling : menuWrap);

  // ⋮ 메뉴 맨 위: 진행 문구 + (세로) 빠른 줄. 굴러가는 칸(.menu-scroll) «안» 이라 카드 높이를 늘리지 않는다
  var menuBox = make('div', 'wuTbMenu');
  var quick = make('div', 'wuTbQuick');
  menuBox.appendChild(quick);
  menuScroll.insertBefore(menuBox, menuScroll.firstChild);

  // 가로 전용: 숨기기(⌃, 머리글 맨 끝) · 보이기(위 가운데 손잡이)
  var hideBtn = make('button', 'wuTbHide'); hideBtn.type = 'button';
  top.appendChild(hideBtn);
  var showBtn = make('button', 'wuTbShow'); showBtn.type = 'button';
  showBtn.appendChild(doc.createElement('span'));
  doc.body.appendChild(showBtn);

  // ── 옮기기 / 되돌리기 — 원래 자리에 주석 노드(자리표)를 남겨 정확히 그 자리로 돌아간다
  var spots = [];
  function park(node, dest, before) {
    if (!node || !node.parentNode) return;
    var spot = null;
    for (var i = 0; i < spots.length; i++) if (spots[i].node === node) spot = spots[i];
    if (!spot) {
      var mark = doc.createComment(' wu-topbar: ' + (node.id || node.className || node.tagName) + ' ');
      node.parentNode.insertBefore(mark, node);
      spot = { node: node, mark: mark };
      spots.push(spot);
    }
    dest.insertBefore(node, before || null);
  }
  function unparkAll() {
    spots.forEach(function (s) {
      if (s.mark.parentNode && s.node.previousSibling !== s.mark) s.mark.parentNode.insertBefore(s.node, s.mark.nextSibling);
    });
  }

  // ── 가로: 숨김 상태(이 기기에만 기억)
  function readHidden() { try { return localStorage.getItem(HIDE_KEY) === '1'; } catch (e) { return false; } }
  function setHidden(on) {
    if (on && typeof window.closeMenu === 'function') { try { window.closeMenu(); } catch (e) {} }
    root.classList.toggle('wu-tb-hidden', !!on);
    try { localStorage.setItem(HIDE_KEY, on ? '1' : '0'); } catch (e) {}
    try { (on ? showBtn : hideBtn).focus({ preventScroll: true }); } catch (e) {}
  }
  hideBtn.addEventListener('click', function () { setHidden(true); });
  showBtn.addEventListener('click', function () { setHidden(false); });

  // ── 글자(EN/KO) — 아이콘만 보이는 버튼에는 지금 글자를 툴팁으로 단다
  function paint() {
    slot.setAttribute('aria-label', tr('말하기 도구', 'Talk tools'));
    var hide = tr('위쪽 메뉴 숨기기', 'Hide top menu');
    hideBtn.setAttribute('aria-label', hide); hideBtn.title = hide;
    showBtn.setAttribute('aria-label', tr('위쪽 메뉴 보이기', 'Show top menu'));
    showBtn.firstChild.textContent = tr('메뉴', 'Menu');
    quick.setAttribute('aria-label', tr('빠른 메뉴', 'Quick menu'));
    var home = PORTRAIT_TO_MENU[1];
    if (home) home.setAttribute('data-wu-cap', tr('홈', 'Home'));
    Object.keys(CAPTIONS).forEach(function (id) {
      var b = $(id); if (b) b.setAttribute('data-wu-cap', tr(CAPTIONS[id][0], CAPTIONS[id][1]));
    });
    Array.prototype.forEach.call(slot.querySelectorAll('.wf-button,.wg-btn'), function (b) {
      var t = (b.textContent || '').trim(); if (t) b.title = t;
    });
  }

  // ── 지금 화면에 맞게 배치
  var mode = '';
  function apply() {
    var next = mqPortrait.matches ? 'p' : (mqLandscape.matches ? 'l' : '');
    if (next === mode) return;
    unparkAll();
    root.classList.remove('wu-tb', 'wu-tb-p', 'wu-tb-l', 'wu-tb-hidden');
    mode = next;
    if (!mode) return;
    park(META, slot);
    park(TOOLS, slot);
    park(HISTORY, slot);
    park(PROGRESS, menuBox, quick);
    if (mode === 'p') PORTRAIT_TO_MENU.forEach(function (n) { park(n, quick); });
    root.classList.add('wu-tb', 'wu-tb-' + mode);
    if (mode === 'l' && readHidden()) root.classList.add('wu-tb-hidden');
    paint();
  }

  function listen(mq) {
    if (mq.addEventListener) mq.addEventListener('change', apply);
    else if (mq.addListener) mq.addListener(apply);
  }
  listen(mqPortrait);
  listen(mqLandscape);
  // 언어 전환·«이전 대화 보기/접기» 처럼 글자가 바뀐 뒤에 툴팁을 다시 단다
  window.addEventListener('mangoi:lang-changed', function () { setTimeout(paint, 0); });
  slot.addEventListener('click', function () { setTimeout(paint, 80); });

  apply();
  window.WarmupTopbar = { apply: apply, mode: function () { return mode; }, setHidden: setHidden };
})();
