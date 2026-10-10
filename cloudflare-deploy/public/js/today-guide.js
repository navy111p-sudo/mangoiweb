/* ═══════════════════════════════════════════════════════════════════════
 * ❓ today-guide.js — «오늘의 A.i 학습» 사용 설명서 (2026-10-10 사장님 지시)
 *   「캡처·화살표로 초등학생도 알 수 있게 · 처음 들어가면 나오고 · 다음부터는 버튼으로」
 *
 *   · 그림은 실제 화면을 캡처해 화살표·번호를 «그려 넣은» 것이다(/img/today-guide/*.jpg).
 *     글자 설명은 그림 «밖» 에 두어 한/영을 바꿀 수 있게 한다(그림도 언어별 두 벌).
 *   · 처음 한 번만 저절로 열린다(localStorage KEY). 다음부터는 화면 위 「❓ 사용법 보기」.
 *     ⚠️ 저장이 막힌 기기에서는 «보여 주는» 쪽으로 실패한다(설명을 잃는 것보다 한 번 더 보는 편이 낫다).
 *   · 그림은 «그 장을 열 때» 받는다(다음 장 하나만 미리) — 열지 않는 학생은 0바이트.
 *   · ⛔ 상주 setInterval·MutationObserver 없음. 첫 자동 열기는 «끝이 있는» 기다림(최대 8초)이다.
 *   · ⛔ data-ko/data-en 을 여기서 그리는 요소에 달지 말 것 — 언어는 그릴 때 고른다(textContent 갈아끼움 함정).
 *   · z-index 100002 — 공용 홈/EN 칩(99999)·드로어(100000) 위여야 버튼이 안 가려진다(CLAUDE.md 2장).
 *   · 이 파일을 고치면 today.html 의 ?v= 를 올린다(asset_version_harness).
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var KEY = 'mangoi_today_guide_v1';   // 'seen' = 한 번 봤음
  var IMG_V = '1';
  var SLIDES = [
    { img: '1-top',
      ko: ['오늘 공부 한눈에 보기', '여기는 «오늘 할 공부» 를 알려 주는 곳이에요. 노란 막대가 끝까지 차면 오늘 공부 끝! 🎉'],
      en: ["Today's study at a glance", 'This page tells you what to study today. When the yellow bar is full, you are done for today! 🎉'] },
    { img: '2-order',
      ko: ['1번부터 차례대로', '숫자 순서대로 하면 돼요. 「수업 전」·「수업 후」·「집에서」 표시를 보면 언제 하면 되는지 알 수 있어요.'],
      en: ['Go in order — start with 1', 'Do them in number order. The «Before class», «After class» and «At home» tags tell you when to do each one.'] },
    { img: '3-start',
      ko: ['노란 「시작 ▶」 누르기', '하고 싶은 칸의 노란 「시작 ▶」 버튼을 누르면 바로 공부가 시작돼요.'],
      en: ['Tap the yellow «Start ▶»', 'Tap the yellow «Start ▶» button on a card and that lesson begins right away.'] },
    { img: '4-done',
      ko: ['다 하면 초록 ✓', '공부를 마치고 이 화면으로 돌아오면 초록색 ✓ 「완료」 표시가 생겨요. 한 번 더 해도 좋아요!'],
      en: ['Finished? A green ✓', 'When you finish and come back here, a green ✓ «Done» appears. You can do it once more too!'] },
    { img: '5-week',
      ko: ['이번 주 달력', '파란 칸은 학원 수업이 있는 날, 초록 칸은 집에서 공부하는 날이에요. 노란 테두리가 바로 오늘!'],
      en: ["This week's calendar", 'Blue = a class day at the academy. Green = a study-at-home day. The yellow border is today!'] },
    { img: '6-tools',
      ko: ['다른 공부도 할 수 있어요', '맨 아래 「🤖 AI 도구 전부 보기」를 누르면 다른 공부도 골라서 할 수 있어요.'],
      en: ['You can pick other lessons too', 'Tap «🤖 See all AI tools» at the bottom to choose any other lesson.'] },
    { img: '7-help',
      ko: ['다시 보고 싶을 때', '이 설명은 화면 위쪽 「❓ 사용법 보기」 버튼을 누르면 언제든 다시 볼 수 있어요.'],
      en: ['Want to see this again?', 'Tap «❓ How to use» at the top of the page any time to see this guide again.'] }
  ];

  function isEn() { try { return (localStorage.getItem('mangoi_lang') || '') === 'en'; } catch (e) { return false; } }
  function T(ko, en) { return isEn() ? en : ko; }
  function imgUrl(i, en) { return '/img/today-guide/' + SLIDES[i].img + '-' + (en ? 'en' : 'ko') + '.jpg?v=' + IMG_V; }

  function css() {
    if (document.getElementById('tg-style')) return;
    var s = document.createElement('style');
    s.id = 'tg-style';
    s.textContent =
      '#tg-ov{position:fixed;inset:0;z-index:100002;background:rgba(3,8,20,.78);display:flex;align-items:center;justify-content:center;padding:12px}' +
      '#tg-ov[hidden]{display:none!important}' +
      '#tg-box{width:100%;max-width:460px;max-height:calc(100vh - 24px);max-height:calc(100svh - 24px);display:flex;flex-direction:column;' +
        'background:#14213b;border:2px solid rgba(251,191,36,.55);border-radius:20px;box-shadow:0 18px 50px rgba(0,0,0,.55);color:#e6ecff;overflow:hidden}' +
      '#tg-head{position:relative;padding:12px 52px 10px 16px;border-bottom:1px solid rgba(251,191,36,.2)}' +
      '#tg-head .k{font-size:12.5px;font-weight:800;color:#a3b3d1}' +
      '#tg-head .x{position:absolute;top:4px;right:4px;width:44px;height:44px;border:0;border-radius:12px;background:transparent;color:#e6ecff;font-size:20px;cursor:pointer}' +
      '#tg-body{overflow-y:auto;min-height:0;padding:12px 16px 4px}' +
      '#tg-body .pic{display:block;width:100%;height:auto;border-radius:12px;background:#0a1530;border:1px solid rgba(255,255,255,.08)}' +
      '#tg-body .tt{display:block;font-size:20px;font-weight:900;letter-spacing:-.02em;line-height:1.35;margin:12px 0 6px;color:#fbbf24}' +
      '#tg-body .tt b{display:inline-block;min-width:30px;height:30px;line-height:30px;margin-right:8px;text-align:center;border-radius:50%;background:#ff2d6f;color:#fff;font-size:16px;vertical-align:2px}' +
      '#tg-body .tx{font-size:16px;line-height:1.65;margin:0 0 8px;color:#e6ecff}' +
      '#tg-foot{padding:10px 16px 14px;border-top:1px solid rgba(255,255,255,.06)}' +
      '#tg-dots{text-align:center;margin-bottom:10px;line-height:0}' +
      '#tg-dots i{display:inline-block;width:9px;height:9px;margin:0 4px;border-radius:50%;background:rgba(255,255,255,.22)}' +
      '#tg-dots i.on{background:#fbbf24;width:22px;border-radius:99px}' +
      '#tg-nav{display:grid;grid-template-columns:1fr 1.6fr;gap:10px}' +
      '#tg-nav button{min-height:52px;border-radius:14px;font-size:17px;font-weight:900;cursor:pointer;border:0}' +
      '#tg-nav .pv{background:rgba(255,255,255,.08);color:#e6ecff}' +
      '#tg-nav .pv:disabled{opacity:.35;cursor:default}' +
      '#tg-nav .nx{background:linear-gradient(135deg,#f59e0b,#fbbf24);color:#1a1200}';
    document.head.appendChild(s);
  }

  var ov = null, idx = 0, prevOverflow = '';
  function build() {
    if (ov) return ov;
    css();
    ov = document.createElement('div');
    ov.id = 'tg-ov';
    ov.hidden = true;
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.innerHTML =
      '<div id="tg-box">' +
        '<div id="tg-head"><div class="k"></div><button type="button" class="x">✕</button></div>' +
        '<div id="tg-body"><img class="pic" alt="" width="780" height="560" decoding="async"><span class="tt"></span><p class="tx"></p></div>' +
        '<div id="tg-foot"><div id="tg-dots"></div><div id="tg-nav"><button type="button" class="pv"></button><button type="button" class="nx"></button></div></div>' +
      '</div>';
    document.body.appendChild(ov);
    ov.querySelector('.x').addEventListener('click', close);
    ov.querySelector('.pv').addEventListener('click', function () { go(idx - 1); });
    ov.querySelector('.nx').addEventListener('click', function () { if (idx >= SLIDES.length - 1) close(); else go(idx + 1); });
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    document.addEventListener('keydown', function (e) {
      if (!ov || ov.hidden) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight' && idx < SLIDES.length - 1) go(idx + 1);
      else if (e.key === 'ArrowLeft' && idx > 0) go(idx - 1);
    });
    return ov;
  }

  function draw() {
    if (!ov) return;
    var en = isEn(), s = SLIDES[idx], txt = en ? s.en : s.ko;
    ov.setAttribute('aria-label', T('오늘의 A.i 학습 사용법', "How to use Today's AI Plan"));
    ov.querySelector('#tg-head .k').textContent = T('📘 사용법 ', '📘 How to use ') + (idx + 1) + ' / ' + SLIDES.length;
    ov.querySelector('#tg-head .x').setAttribute('aria-label', T('닫기', 'Close'));
    var img = ov.querySelector('.pic');
    img.src = imgUrl(idx, en);
    img.alt = txt[0];
    var tt = ov.querySelector('.tt');
    tt.innerHTML = '';
    var b = document.createElement('b'); b.textContent = String(idx + 1); tt.appendChild(b);
    tt.appendChild(document.createTextNode(txt[0]));
    ov.querySelector('.tx').textContent = txt[1];
    var dots = '';
    for (var i = 0; i < SLIDES.length; i++) dots += '<i' + (i === idx ? ' class="on"' : '') + '></i>';
    ov.querySelector('#tg-dots').innerHTML = dots;
    var pv = ov.querySelector('.pv'), nx = ov.querySelector('.nx');
    pv.textContent = T('◀ 이전', '◀ Back');
    pv.disabled = idx === 0;
    nx.textContent = idx >= SLIDES.length - 1 ? T('알겠어요! 시작하기', 'Got it! Let\'s go') : T('다음 ▶', 'Next ▶');
    ov.querySelector('#tg-body').scrollTop = 0;
    /* 다음 장 그림만 미리 받는다 — 넘길 때 빈 칸이 안 보이게 */
    if (idx + 1 < SLIDES.length) { var pre = new Image(); pre.src = imgUrl(idx + 1, en); }
  }
  function go(i) { idx = Math.max(0, Math.min(SLIDES.length - 1, i)); draw(); }

  function open(at) {
    build();
    idx = at || 0;
    draw();
    if (ov.hidden) { prevOverflow = document.documentElement.style.overflow; document.documentElement.style.overflow = 'hidden'; }
    ov.hidden = false;
    try { localStorage.setItem(KEY, 'seen'); } catch (e) {}
    var nx = ov.querySelector('.nx'); try { nx.focus({ preventScroll: true }); } catch (e) {}
  }
  function close() {
    if (!ov || ov.hidden) return;
    ov.hidden = true;
    document.documentElement.style.overflow = prevOverflow;
    var btn = document.getElementById('td-guide-btn'); if (btn) { try { btn.focus({ preventScroll: true }); } catch (e) {} }
  }
  function seen() { try { return localStorage.getItem(KEY) === 'seen'; } catch (e) { return false; } }

  window.mangoiTodayGuide = { open: open, close: close, slides: SLIDES.length };

  var btn = document.getElementById('td-guide-btn');
  if (btn) btn.addEventListener('click', function () { open(0); });

  function relang() { if (ov && !ov.hidden) draw(); }
  window.addEventListener('mangoi:lang-changed', relang);
  document.addEventListener('mangoi:lang-changed', relang);

  /* 처음 한 번 — 화면이 그려진 뒤(본문이나 로그인 안내가 보일 때) 연다. 끝이 있는 기다림(최대 8초). */
  if (!seen()) {
    var tries = 0;
    (function wait() {
      var m = document.getElementById('td-main'), l = document.getElementById('td-login');
      var ready = (m && !m.hidden) || (l && !l.hidden);
      if (ready || ++tries > 27) { if (!seen()) open(0); return; }
      setTimeout(wait, 300);
    })();
  }
})();
