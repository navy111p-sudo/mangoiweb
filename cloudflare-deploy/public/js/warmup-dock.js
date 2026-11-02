/* 📱 세로(폰) 아래 버튼 줄 자동 접힘 (2026-11-02 사장님 요청)
 *
 * 규칙
 *   - 학생이 말하는 중(듣는 중, 🎤 녹음 중)  → 아래 버튼 줄이 올라와 펼쳐진다.
 *   - 아바타(선생님)가 말하는 중              → 아래 버튼 줄이 내려가 접힌다.
 *   - 손잡이(.dock-handle)를 누르면 직접 열고 닫는다.
 *     직접 고른 상태는 다음 자동 전환이 올 때까지 유지된다.
 *
 * 대상: 터치 기기의 #tbBar(js/warmup-touch-bar.js), 없으면 .wg-composer.
 * 접힘은 CSS 클래스 .dock-collapsed 로만 표현한다(css/warmup-flow.css 의 «warmup-dock» 블록).
 * 폰 세로 너비(640px 이하)에서만 동작한다. PC 는 한 글자도 바뀌지 않는다.
 *
 * 관찰: 짧은 주기(500ms)로 세 가지만 읽는다 — #tavatar-wrap 의 speaking 클래스,
 *       듣기 상태(window._recognizing / _whisperOn / #tbMic.rec / #listening 표시),
 *       speechSynthesis.speaking. body 관찰은 하지 않는다(홈 전력 문제 회피).
 */
(function () {
  'use strict';

  var mq;
  try { mq = window.matchMedia('(max-width:640px)'); } catch (e) { return; }

  var dock = null;        // 접히고 펼쳐지는 요소
  var handle = null;      // 손잡이 버튼
  var manual = null;      // null = 자동, true = 접기 고정, false = 펼치기 고정
  var lastAuto = null;    // 직전 자동 판정(바뀔 때만 수동 선택을 푼다)
  var manualAt = 0;       // 손잡이를 마지막으로 누른 시각
  // 손잡이를 누른 직후 잠깐(1.5초)은 자동 판정이 바뀌어도 사용자 선택을 지우지 않는다.
  // 첫 터치 때 앱이 인사말을 다시 읽어 말하기 상태가 잠깐 흔들리는데, 그 떨림에 방금 누른 선택이 뒤집히는 것을 막는다.
  var GRACE_MS = 1500;

  function avatarSpeaking() {
    var w = document.getElementById('tavatar-wrap');
    if (w && w.classList.contains('speaking')) return true;
    try { return !!(window.speechSynthesis && window.speechSynthesis.speaking); } catch (e) { return false; }
  }

  function studentListening() {
    if (window._recognizing || window._whisperOn) return true;
    var m = document.getElementById('tbMic');
    if (m && m.classList.contains('rec')) return true;
    var l = document.getElementById('listening');
    if (l) {
      try { return getComputedStyle(l).display !== 'none'; } catch (e) { return false; }
    }
    return false;
  }

  function isCollapsed() {
    return !!(dock && dock.classList.contains('dock-collapsed'));
  }

  function build() {
    if (dock) return;
    var d = document.getElementById('tbBar') || document.querySelector('.wg-composer');
    if (!d) return;
    var h = document.createElement('button');
    h.type = 'button';
    h.className = 'dock-handle';
    h.setAttribute('aria-controls', d.id || '');
    h.setAttribute('aria-label', '아래 말하기 버튼 줄 열기·닫기 / Show or hide the talk buttons');
    h.addEventListener('click', function () {
      manual = !isCollapsed();   // 지금 접혀 있으면 펼치고, 펼쳐 있으면 접는다
      manualAt = Date.now();
      sync();
    });
    d.setAttribute('data-dock', '');
    d.insertBefore(h, d.firstChild);
    dock = d;
    handle = h;
  }

  function sync() {
    if (!dock || !handle) return;
    var auto = !studentListening() && avatarSpeaking();   // 학생 말하기가 우선
    if (auto !== lastAuto) {
      lastAuto = auto;
      if (Date.now() - manualAt > GRACE_MS) manual = null;   // 방금 누른 선택은 잠깐 지키고, 그 뒤의 자동 전환부터 자동 규칙을 따른다
    }
    var collapsed = (manual === null ? auto : manual) && mq.matches;
    dock.classList.toggle('dock-collapsed', collapsed);
    handle.setAttribute('aria-expanded', String(!collapsed));
  }

  function tick() {
    build();
    sync();
  }

  function start() {
    tick();
    setInterval(tick, 500);
    try { mq.addEventListener('change', sync); } catch (e) { /* 구형 브라우저 — 주기 갱신이 맡는다 */ }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
