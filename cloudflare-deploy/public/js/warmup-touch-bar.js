/* 📱 A.i 말하기 연습 — 휴대폰·태블릿(터치) 전용 «아래 3칸 바» (2026-09-26 · 시안 4)
 *
 * 사장님 「1,2번이 아직도 너무 복잡하고 혼란 스러워」 → 시안 4종 중 4번(아래 3칸 바) 추천,
 * 「추천한대로 진행하는대신 자동,버튼은 잘 좀 보이게 해줘」.
 *
 * 화면 아래는 두 줄뿐이다.
 *   ① 「말하는 방법」 — 🎤 버튼으로 | ✨ 자동으로  (꽉 찬 폭, 고른 쪽은 채운 색 + ✓)
 *   ② 💡 도움 · 🎤 말하기(가운데 크게) · ⌨ 글쓰기
 * 흩어져 있던 버튼(이전 대화·대답 도움·새 질문·그림·끝내기)은 «💡 도움» 시트 하나에 모은다.
 *
 * 원칙
 *   - 새 기능을 만들지 않는다. 모든 칸은 원래 버튼을 «대신 눌러» 준다(toggleMic·wgHistory·wgHelpOpen·qsBtn·wgFinish).
 *     그래서 판정·상태는 원래 코드 한 곳에만 있다.
 *   - 터치 기기(hover:none + pointer:coarse)에서만 켠다. 마우스 PC 는 한 글자도 안 바뀐다.
 *   - 상태를 따라 그리는 관찰자는 «.wg-composer» 하나만 본다(⛔ body class 관찰 금지 — 홈이 멎은 전력 2회).
 *     바는 composer «밖» 에 있고, 바뀐 값만 쓰므로 관찰자가 스스로를 깨우지 않는다.
 *   - 「말하는 방법」 스위치(#talkSwitch)는 warmup-auto-talk.js 가 만든 «그 요소» 를 옮겨 온다.
 *     그 파일은 id 로 다시 그리고(paint) 요소 자체에 click 을 묶으므로(bindPick) 옮겨도 안전하다.
 *   ⚠️ 수업 안(iframe)에서는 스위치가 없다 — 그때는 ② 한 줄만.
 * 감시: test-harness/manual/warmup-touch-compact-browser.mjs (자동으로 안 돕니다, 사람이 부릅니다)
 */
(function () {
  'use strict';
  var mq;
  try { mq = window.matchMedia('(hover:none) and (pointer:coarse)'); } catch (e) { return; }
  if (!mq || !mq.matches) return;

  function $(id) { return document.getElementById(id); }
  function en() {
    try { return (typeof window.getLang === 'function' ? window.getLang() : localStorage.getItem('mangoi_lang')) === 'en'; }
    catch (e) { return false; }
  }
  function T(ko, e) { return en() ? e : ko; }

  var CSS =
    /* 흩어져 있던 줄은 감춘다 — 전부 «💡 도움» 시트 안에 있다 */
    'html.tb-on .wg-history-bar,html.tb-on .qs-row,html.tb-on .wg-composer .hint,'
    + 'html.tb-on .wg-composer #wgState,html.tb-on .wg-composer #listening,html.tb-on .wg-composer .autotalk-pill{display:none!important}'
    + 'html.tb-on #wgScenes:not([data-tb-show]){display:none!important}'
    /* 입력칸은 «⌨ 글쓰기» 를 눌렀을 때만. 🎤 는 가운데 칸이 맡는다 */
    + 'html.tb-on .wg-composer:not(.tb-typing){display:none!important}'
    + 'html.tb-on .wg-composer.tb-typing{display:block!important;padding:4px!important}'
    + 'html.tb-on .wg-composer #micBtn{display:none!important}'
    /* 바 */
    + '#tbBar{flex-shrink:0;display:flex;flex-direction:column;gap:6px}'
    + '#tbBar .talk-switch{display:grid!important;grid-template-columns:auto 1fr 1fr;align-items:center;gap:6px;margin:0!important;'
    + 'padding:5px;border-radius:14px;background:#0b1830;border:1px solid #3b557b}'
    + '#tbBar .talk-switch .ts-lbl{display:block!important;font-size:12.5px;font-weight:800;color:#e2e8f0;padding:0 4px 0 6px;white-space:nowrap}'
    + '#tbBar .talk-switch button{min-height:42px!important;padding:4px 6px!important;border-radius:10px!important;font-size:14.5px!important;font-weight:800;'
    + 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:transparent!important;border:1.5px solid #4b6a93!important;color:#cbd5e1!important;box-shadow:none!important}'
    + '#tbBar .talk-switch button.on{background:#0ea5e9!important;border-color:#7dd3fc!important;color:#fff!important;box-shadow:0 0 0 2px rgba(125,211,252,.35)!important}'
    + '#tbBar .talk-switch button.on::before{content:"\\2713 ";font-weight:900}'
    /* 좁은 칸에서 글자가 잘리지 않게 «베타» 표는 바에서만 뺀다(⋮ 메뉴·설정 화면에는 그대로 있다) */
    + '#tbBar .talk-switch .at-beta{display:none}'
    + '#tbNote{margin:0;padding:0 6px;font-size:13px;line-height:1.35;color:#fde68a;text-align:center}'
    + '#tbNote[hidden]{display:none!important}'
    + '#tbTabs{display:grid;grid-template-columns:1fr 1.6fr 1fr;gap:6px}'
    + '#tbTabs button{min-height:58px;border-radius:14px;border:1px solid #3b557b;background:#12213e;color:#e2e8f0;'
    + 'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-weight:800;font-size:13px;line-height:1.2;cursor:pointer;padding:4px}'
    + '#tbTabs button .tb-i{font-size:22px;line-height:1}'
    + '#tbTabs button .tb-t{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    + '#tbTabs #tbMic{background:#0ea5e9;border-color:#7dd3fc;color:#fff;font-size:14px}'
    + '#tbTabs #tbMic .tb-i{font-size:26px}'
    + '#tbTabs #tbMic.rec{background:#dc2626;border-color:#fca5a5}'
    + '#tbTabs #tbMic.busy{background:#334155;border-color:#64748b}'
    + '#tbTabs #tbType.on{background:#1e3a5f;border-color:#7dd3fc}'
    + '#tbTabs button:focus-visible,#tbSheet button:focus-visible{outline:2px solid #fbbf24;outline-offset:2px}'
    /* 도움 시트 */
    + '#tbSheetBg{position:fixed;inset:0;background:rgba(2,6,23,.55);z-index:100002}'
    + '#tbSheet{position:fixed;left:0;right:0;bottom:0;z-index:100003;background:#0f1d36;border-top:1px solid #3b557b;'
    + 'border-radius:18px 18px 0 0;padding:12px 16px calc(14px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:8px;'
    + 'max-height:80svh;overflow-y:auto}'
    + '#tbSheet .tb-sh-h{display:flex;align-items:center;justify-content:space-between;color:#f8fafc;font-weight:900;font-size:16px}'
    + '#tbSheet button{min-height:48px;border-radius:12px;border:1px solid #3b557b;background:#12213e;color:#e2e8f0;'
    + 'font-size:15.5px;font-weight:800;text-align:left;padding:8px 14px;cursor:pointer}'
    + '#tbSheet #tbSheetClose{min-height:40px;padding:4px 14px;text-align:center}'
    + '#tbSheet[hidden],#tbSheetBg[hidden]{display:none!important}'
    /* 눕힌 폰: 스위치와 3칸을 한 줄에 */
    + '@media (max-height:520px){#tbBar{flex-direction:row;align-items:stretch}#tbBar .talk-switch{flex:1 1 0;min-width:0;padding:4px;grid-template-columns:1fr 1fr}'
    + '#tbBar .talk-switch .ts-lbl{display:none!important}#tbBar .talk-switch button{min-height:38px!important;font-size:13.5px!important}'
    + '#tbTabs{flex:1.2 1 0;min-width:0}#tbTabs button{min-height:46px;flex-direction:row;gap:5px}#tbTabs button .tb-i{font-size:19px}#tbTabs #tbMic .tb-i{font-size:21px}}'
    /* 아주 좁은 폰: 「말하는 방법」 글자를 위로 */
    + '@media (max-width:359px){#tbBar .talk-switch{grid-template-columns:1fr 1fr}#tbBar .talk-switch .ts-lbl{grid-column:1/-1}}';

  var bar, tabs, mic, typeBtn, sheet, sheetBg, composer;
  var last = {};

  function setIfChanged(el, key, val, fn) {
    if (last[key] === val) return;
    last[key] = val; fn(val);
  }

  /* 가운데 칸 — 원래 🎤 버튼(#micBtn)·자동 알약의 상태를 그대로 옮겨 그린다 */
  function micState() {
    var mb = $('micBtn');
    if (mb && mb.classList.contains('rec')) return { cls: 'rec', i: '⏹', t: T('듣는 중 · 멈추기', 'Listening · Stop') };
    var p = $('autoTalkPill');
    if (p && !p.hidden) {
      var ph = p.getAttribute('data-phase') || '';
      var tx = p.querySelector('.at-txt'); tx = tx ? tx.textContent.replace(/^\S+\s*/, '') : '';
      var ic = { listen: '👂', speak: '🗣️', check: '🤖', done: '✅' }[ph];
      if (ic && ph !== 'listen') return { cls: 'busy', i: ic, t: T('자동 · ', 'Auto · ') + tx };
    }
    return { cls: '', i: '🎤', t: T('눌러서 말하기', 'Tap to talk') };
  }
  /* 원래 안내 줄(#wgState)은 감추되, «평소 문구» 가 아닌 것(멈춤·오류·답 준비 중)만 한 줄로 옮긴다 */
  var QUIET = /^(준비되면|듣는 중이에요|When ready)/;
  function noteText() {
    var st = $('wgState'); var t = st ? String(st.textContent || '').trim() : '';
    var mb = $('micBtn'); if (mb && mb.classList.contains('rec')) return '';
    return (t && !QUIET.test(t)) ? t : '';
  }
  function tabHtml(i, t) { return '<span class="tb-i" aria-hidden="true">' + i + '</span><span class="tb-t">' + t + '</span>'; }

  function repaint(force) {
    if (force) last = {};
    var s = micState();
    setIfChanged(mic, 'mic', s.cls + '|' + s.i + '|' + s.t, function () {
      mic.className = s.cls; mic.innerHTML = tabHtml(s.i, s.t);
      mic.setAttribute('aria-label', s.t);
    });
    var nt = noteText();
    setIfChanged(null, 'note', nt, function () { var n = $('tbNote'); n.textContent = nt; n.hidden = !nt; });
    var typing = composer.classList.contains('tb-typing');
    setIfChanged(typeBtn, 'type', (typing ? 1 : 0) + (en() ? 'e' : 'k'), function () {
      typeBtn.className = typing ? 'on' : '';
      typeBtn.setAttribute('aria-pressed', typing ? 'true' : 'false');
      typeBtn.innerHTML = tabHtml('⌨️', typing ? T('글쓰기 닫기', 'Close typing') : T('글쓰기', 'Type'));
    });
    setIfChanged(null, 'help', en() ? 'e' : 'k', function () {
      $('tbHelp').innerHTML = tabHtml('💡', T('도움', 'Help'));
    });
  }

  function click(id) { var el = $(id); if (el) el.click(); }

  function openSheet() {
    var hist = $('wgHistory'), histOpen = hist && hist.getAttribute('aria-expanded') === 'true';
    var items = [
      ['tbScenes', '🖼️ ' + T('그림 골라 이야기하기', 'Talk about a picture'), !!$('wgScenes')],
      ['tbHist', '🕘 ' + (histOpen ? T('이전 대화 접기', 'Hide earlier talk') : T('이전 대화 보기', 'Earlier conversation')), !!hist],
      ['tbAns', '🙋 ' + T('대답할 때 도움', 'Help me answer'), !!$('wgHelpOpen')],
      ['tbQs', '💡 ' + T('새 질문 추천', 'Suggest a new question'), !!$('qsBtn')],
      ['tbFin', '✅ ' + T('끝내고 요약 보기', 'Finish and summarize'), !!$('wgFinish')]
    ];
    var h = '<div class="tb-sh-h"><span>' + T('💡 도움', '💡 Help') + '</span>'
      + '<button type="button" id="tbSheetClose">' + T('닫기', 'Close') + '</button></div>';
    for (var i = 0; i < items.length; i++) if (items[i][2]) h += '<button type="button" data-tb="' + items[i][0] + '">' + items[i][1] + '</button>';
    sheet.innerHTML = h;
    sheet.hidden = false; sheetBg.hidden = false;
  }
  function closeSheet() { sheet.hidden = true; sheetBg.hidden = true; }

  function onSheet(e) {
    var t = e.target && e.target.closest ? e.target.closest('button') : null;
    if (!t) return;
    if (t.id === 'tbSheetClose') { closeSheet(); return; }
    var k = t.getAttribute('data-tb'); if (!k) return;
    closeSheet();
    if (k === 'tbScenes') {
      var sc = $('wgScenes'); if (!sc) return;
      sc.setAttribute('data-tb-show', '1'); sc.open = true;
      try { sc.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e2) {}
    } else if (k === 'tbHist') click('wgHistory');
    else if (k === 'tbAns') click('wgHelpOpen');
    else if (k === 'tbQs') click('qsBtn');
    else if (k === 'tbFin') click('wgFinish');
  }

  function mount() {
    composer = document.querySelector('.wg-composer');
    if (!composer || $('tbBar')) return;
    if (!document.documentElement.classList.contains('tb-on')) document.documentElement.classList.add('tb-on');
    var st = document.createElement('style'); st.id = 'tb-css'; st.textContent = CSS;
    document.body.appendChild(st);   // 본문의 touch-compact 블록보다 «뒤» 라야 같은 명시도에서 이긴다

    bar = document.createElement('div'); bar.id = 'tbBar';
    tabs = document.createElement('div'); tabs.id = 'tbTabs';
    tabs.setAttribute('role', 'toolbar'); tabs.setAttribute('aria-label', T('말하기 도구', 'Talk tools'));
    tabs.innerHTML = '<button type="button" id="tbHelp"></button><button type="button" id="tbMic"></button><button type="button" id="tbType" aria-pressed="false"></button>';
    var sw = $('talkSwitch');
    if (sw) bar.appendChild(sw);
    var note = document.createElement('p'); note.id = 'tbNote'; note.setAttribute('role', 'status'); note.hidden = true;
    bar.appendChild(note);   // 자동 말하기 파일이 만든 «그» 스위치를 옮긴다(수업 안에서는 없다)
    bar.appendChild(tabs);
    composer.parentNode.insertBefore(bar, composer.nextSibling);
    mic = $('tbMic'); typeBtn = $('tbType');

    sheetBg = document.createElement('div'); sheetBg.id = 'tbSheetBg'; sheetBg.hidden = true;
    sheet = document.createElement('div'); sheet.id = 'tbSheet'; sheet.hidden = true;
    sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true');
    document.body.appendChild(sheetBg); document.body.appendChild(sheet);
    sheetBg.addEventListener('click', closeSheet);
    sheet.addEventListener('click', onSheet);

    $('tbHelp').addEventListener('click', openSheet);
    mic.addEventListener('click', function () { click('micBtn'); });
    typeBtn.addEventListener('click', function () {
      var on = !composer.classList.contains('tb-typing');
      composer.classList.toggle('tb-typing', on);
      if (on) { var inp = $('inp'); if (inp) try { inp.focus(); } catch (e) {} }
      repaint();
    });
    var sc = $('wgScenes');
    if (sc) sc.addEventListener('toggle', function () { if (!sc.open) sc.removeAttribute('data-tb-show'); });

    // 원래 버튼·알약이 바뀌면 따라 그린다 — composer 하나만 본다(⛔ body 관찰 금지)
    try {
      new MutationObserver(function () { repaint(); })
        .observe(composer, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'hidden', 'data-phase'], characterData: true });
    } catch (e) {}
    var relang = function () { repaint(true); if (!sheet.hidden) openSheet(); };
    window.addEventListener('mangoi:lang-changed', relang);
    document.addEventListener('mangoi:lang-changed', relang);
    repaint(true);
  }

  // warmup-auto-talk.js(defer, 이 파일보다 앞)가 스위치를 만든 «뒤» 에 옮긴다
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
