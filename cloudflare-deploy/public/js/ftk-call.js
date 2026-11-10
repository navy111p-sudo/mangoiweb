/*!
 * 📞 ftk-call.js — A.i 말하기 «얼굴 대화» 를 영상통화 화면처럼 (2026-11-08 사장님 「영상 앱과 똑같이 — 디자인·분위기·자막」)
 *
 * [무엇] 두 얼굴 화면(js/aifriend-facetalk.js · js/warmup-facetalk.js)이 만드는 #ftk 위에 «겉모습» 만 입힌다.
 *   밝은 회색 배경 · 상반신 아바타 · 위: 제목 / ✓ 끝내기 / 📷 내 카메라 / ✕
 *   왼쪽: 다시 듣기 · 가운데 아래: 말하는 대로 한 낱말씩 나오는 자막(2줄) · «듣는 중... / 생각 중...»
 *   아래: 🎤 마이크 · .5X 천천히 · CC 자막 · 말소리 점 · 자동/손(누르고 말하기) · 진행 막대(5번 말하면 초록)
 *
 * [어떻게] 대화 순서·듣기·보내기는 두 파일 그대로다. 그 파일이 build() 끝에서 FtkCall.mount(root, CALL) 로
 *   «손잡이(CALL)» 를 넘기고, 이 파일은 그것을 부르기만 한다. ⛔ 여기서 음성인식·전송을 새로 만들지 않는다.
 *   상태는 #ftk 의 data-s(listen·think·speak·pause)·class(on·heard) 를 #ftk «하나만» 지켜본다.
 * ⛔ body class 관찰자·상주 타이머 없음 — 자막 rAF 는 선생님이 말하는 동안만 돈다(CLAUDE.md 2장).
 * ⛔ 내 카메라는 이 화면 안에서만 비춘다(녹화·전송 없음). 기본은 꺼짐(빨강).
 */
(function () {
  'use strict';
  if (window.FtkCall) return;

  var HANDS_KEY = 'mangoi_ftk_hands', CC_KEY = 'mangoi_ftk_cc', GOAL = 5;

  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function handsFree() { return ls(HANDS_KEY) !== 'hand'; }

  /* ── 자막 — 말한 조각(parts)의 낱말 + 지금 조각의 «재생된 비율» 만큼 ─────────────
     parts: 소리로 나가는 조각들(순서대로) · idx: 지금 재생 중인 조각(-1 = 아직 소리 없음) · frac: 그 조각의 재생 비율(0~1)
     중국어처럼 띄어쓰기가 없으면 글자 단위로 늘린다. 조각 수보다 재생이 많아지면 전부 보인다. */
  function units(s) { s = String(s || '').trim(); return !s ? [] : /\s/.test(s) || !/[　-鿿]/.test(s) ? s.split(/\s+/) : Array.from(s); }
  function capText(parts, idx, frac) {
    if (idx < 0 || !parts.length) return '';
    var out = [];
    for (var i = 0; i < parts.length && i <= idx; i++) {
      var u = units(parts[i]);
      var n = i < idx || idx >= parts.length ? u.length : Math.min(u.length, Math.floor((frac || 0) * u.length) + 1);
      out = out.concat(u.slice(0, n));
    }
    var cjk = out.length && !/\s/.test(parts.join('')) && /[　-鿿]/.test(parts.join(''));
    return out.join(cjk ? '' : ' ');
  }

  var I = {
    check: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M8.2 12.4l2.6 2.6 5-5.4"/></svg>',
    cam: '<svg viewBox="0 0 24 24"><rect x="3" y="7" width="12" height="10" rx="2"/><path d="M15 10.5l5-3v9l-5-3"/><path class="sl" d="M3 3l18 18"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    wave: '<svg viewBox="0 0 24 24"><path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 10v4"/></svg>',
    mic: '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>',
    auto: '<svg viewBox="0 0 24 24"><circle cx="9" cy="9" r="3.5"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6M17 7.5a4 4 0 0 1 0 5M19.5 5a7.5 7.5 0 0 1 0 10"/></svg>',
    hand: '<svg viewBox="0 0 24 24"><path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11m0-1.5a1.5 1.5 0 0 1 3 0V12m0-1a1.5 1.5 0 0 1 3 0v3.5c0 3.6-2.4 6.5-6 6.5-2.4 0-3.7-1.2-5-3l-2.4-3.6a1.5 1.5 0 0 1 2.4-1.8L9 15"/></svg>'
  };

  /* #ftk.ftk-call — 두 얼굴 화면의 옛 모양(남색·테두리 빛·유리판 손잡이)보다 «한 단계 더 구체적인» 선택자로 덮는다 */
  var CSS = ''
    + '#ftk.ftk-call{background:linear-gradient(180deg,#e4e5e7 0%,#d4d5d8 55%,#c6c7ca 100%);color:#fff;font-family:inherit}'
    + '#ftk.ftk-call .ftk-edge,#ftk.ftk-call .ftk-bars,#ftk.ftk-call .ftk-x{display:none!important}'
    /* 상반신이 화면 폭보다 조금 크게 — 얼굴이 화면 가운데, 어깨 아래는 어두운 바닥에 잠긴다(영상 앱 구도) */
    + '#ftk.ftk-call .ftk-stage{inset:auto;left:50%;top:max(60px,16vh);width:min(112vw,62vh);height:auto;aspect-ratio:4/5;transform:translateX(-50%)}'
    + '#ftk.ftk-call #tavatar-canvas{object-fit:contain!important;object-position:50% 100%!important}'
    + '#ftk .fc-shade{position:absolute;left:0;right:0;bottom:0;height:36%;z-index:2;pointer-events:none;'
    + ' background:linear-gradient(180deg,rgba(52,54,58,0) 0%,rgba(52,54,58,.72) 42%,rgba(40,42,46,.94) 100%)}'
    + '#ftk .fc svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}'
    + '#ftk .fc-b{border:0;cursor:pointer;display:grid;place-items:center;font:inherit;-webkit-tap-highlight-color:transparent}'
    + '#ftk .fc-b:focus-visible{outline:3px solid #2563eb;outline-offset:2px}'
    + '#ftk .fc-top{position:absolute;z-index:6;top:calc(env(safe-area-inset-top,0px) + 10px);left:max(18px,calc(50% - 300px));right:max(12px,calc(50% - 300px));display:flex;align-items:center;gap:10px}'
    + '#ftk .fc-title{flex:1;margin:0;font-size:20px;font-weight:800;color:#111;letter-spacing:-.3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '#ftk .fc-top .fc-b{width:42px;height:42px;border-radius:50%;background:rgba(255,255,255,.72);color:#222;box-shadow:0 1px 4px rgba(0,0,0,.12)}'
    + '#ftk .fc-top .fc-done{background:#fff;width:auto;border-radius:21px;padding:0 14px 0 10px;display:flex;align-items:center;gap:6px;font-size:15px;font-weight:800;white-space:nowrap}'   /* ✓ 만으로는 못 찾아서 «끝내기» 글자를 함께(2026-11-09) */
    + '#ftk .fc-top .fc-cam{background:#ef4444;color:#fff}'
    + '#ftk .fc-top .fc-cam[aria-pressed="true"]{background:#fff;color:#222}#ftk .fc-cam[aria-pressed="true"] .sl{display:none}'
    + '#ftk .fc-self{position:absolute;z-index:6;top:calc(env(safe-area-inset-top,0px) + 64px);right:max(12px,calc(50% - 300px));width:96px;height:128px;'
    + ' border-radius:14px;object-fit:cover;transform:scaleX(-1);background:#222;box-shadow:0 4px 14px rgba(0,0,0,.25)}'
    + '#ftk .fc-self[hidden]{display:none}'
    /* 왼쪽 가장자리에 붙은 «다시 듣기» */
    + '#ftk .fc-replay{position:absolute;z-index:6;left:max(0px,calc(50% - 300px));top:52%;width:60px;height:58px;border-radius:0 29px 29px 0;'
    + ' background:rgba(255,232,226,.82);box-shadow:0 2px 8px rgba(0,0,0,.12)}'
    + '#ftk .fc-replay span{width:42px;height:42px;border-radius:50%;background:#5c5a59;color:#fff;display:grid;place-items:center}'
    /* 자막 — 늘 «마지막 2줄» 만(위로 넘친 줄은 잘려 사라진다) */
    + '#ftk .fc-cap{position:absolute;z-index:5;left:max(28px,calc(50% - 250px));right:max(28px,calc(50% - 250px));'
    + ' bottom:calc(env(safe-area-inset-bottom,0px) + 168px);height:2.7em;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end;'
    + ' font-size:22px;line-height:1.35;font-weight:800;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.55),0 0 14px rgba(0,0,0,.25);'
    + ' pointer-events:none;transition:opacity .35s}'
    + '#ftk .fc-cap.off{opacity:0}#ftk .fc-cap p{margin:0}'
    + '#ftk .fc-status{position:absolute;z-index:5;left:0;right:0;bottom:calc(env(safe-area-inset-bottom,0px) + 128px);text-align:center;'
    + ' font-size:15px;font-weight:700;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.5);pointer-events:none}'
    /* 아래 조작줄 */
    + '#ftk .fc-bar{position:absolute;z-index:6;left:max(16px,calc(50% - 280px));right:max(16px,calc(50% - 280px));'
    + ' bottom:calc(env(safe-area-inset-bottom,0px) + 52px);display:flex;align-items:center;gap:12px}'
    + '#ftk .fc-bar .fc-b{width:44px;height:44px;border-radius:50%;background:rgba(32,34,38,.88);color:#fff;font-size:14px;font-weight:800}'
    + '#ftk .fc-bar .fc-b[aria-pressed="true"]{background:#fff;color:#1f2023}'
    + '#ftk .fc-mic.live{background:#fff!important;color:#1f2023!important}'
    + '#ftk .fc-dots{display:flex;align-items:center;gap:8px;height:30px}'
    + '#ftk .fc-dots i{width:11px;height:11px;border-radius:6px;background:rgba(255,255,255,.35);transition:background .2s}'
    + '#ftk .fc-dots.live i{background:#fff}'
    + '#ftk .fc-dots.heard i{animation:fcEq .9s infinite ease-in-out}'
    + '#ftk .fc-dots.heard i:nth-child(2){animation-delay:.15s}#ftk .fc-dots.heard i:nth-child(3){animation-delay:.3s}'
    + '@keyframes fcEq{0%,100%{height:11px}50%{height:28px}}'
    + '#ftk .fc-modes{margin-left:auto;display:flex;gap:2px;padding:3px;border-radius:26px;background:rgba(32,34,38,.88)}'
    + '#ftk .fc-modes .fc-b{width:40px;height:40px;background:transparent}'
    + '#ftk .fc-prog{position:absolute;z-index:6;left:max(0px,calc(50% - 300px));right:max(0px,calc(50% - 300px));'
    + ' bottom:calc(env(safe-area-inset-bottom,0px) + 24px);height:6px;border-radius:3px;background:rgba(255,255,255,.14);overflow:hidden}'
    + '#ftk .fc-prog i{display:block;height:100%;width:0;border-radius:3px;background:#f2c94c;transition:width .5s,background .5s}'
    + '#ftk .fc-prog.done i{background:#6fd99a}'
    /* 막혔을 때만 뜨는 도움판(대답 보기·안내) — 자막처럼 투명 바탕 + 글자 그림자, 조작줄 위에
       (2026-11-09 사장님 「계속 투명한 바탕에」 — 흰 카드는 자막과 모양이 달라 «화면이 바뀐» 것처럼 보였다) */
    + '#ftk.ftk-call .ftk-glass{display:none;transform:none!important;left:0;right:0;margin:0 auto;width:min(560px,calc(100% - 24px));'
    + ' bottom:calc(env(safe-area-inset-bottom,0px) + 112px);z-index:7;border:0;border-radius:18px;background:transparent;'
    + ' color:#fff;box-shadow:none;max-height:46%;text-shadow:0 1px 3px rgba(0,0,0,.55),0 0 14px rgba(0,0,0,.25)}'
    + '#ftk.ftk-call.gl-open .ftk-glass{display:block}#ftk.ftk-call .ftk-grab i{background:rgba(255,255,255,.7)}'
    + '#ftk.ftk-call.gl-open .fc-status{visibility:hidden}'
    /* 바탕이 없으니 글이 길면 밝은 셔츠 위로 올라간다 — 그때만 아래 어둠을 넓혀 흰 글자가 읽히게 */
    + '#ftk.ftk-call.gl-open .fc-shade{height:56%}'
    /* 흰 카드일 땐 카드가 «다시 듣기» 를 덮었다 — 투명이면 글과 겹쳐 보이니 열린 동안만 같은 모양(숨김)으로 */
    + '#ftk.ftk-call.gl-open .fc-replay{visibility:hidden}'
    + '#ftk.ftk-call .ftk-teacher{color:#fff;font-weight:800}#ftk.ftk-call .ftk-me{color:#bbf7d0;font-weight:700}#ftk.ftk-call .ftk-note{color:#fde68a;font-weight:700}'
    + '#ftk.ftk-call .ftk-chips button{background:rgba(32,34,38,.82);border-color:rgba(255,255,255,.28);color:#fff;text-shadow:none}#ftk.ftk-call .ftk-chips button small{color:#d4d4d8}'
    + '#ftk.ftk-call .ftk-ask{top:calc(env(safe-area-inset-top,0px) + 64px);left:16px;height:38px;background:rgba(255,255,255,.78);color:#111;font-size:15px}'
    + '@media (min-width:640px){#ftk .fc-replay{border-radius:29px}}'
    /* 도움판이 열리면 같은 선생님 말이 카드에 있다 — 흰 자막이 카드 뒤로 겹쳐 비치지 않게(2026-11-09 사장님 화면) */
    + '#ftk.ftk-call.gl-open .fc-cap{visibility:hidden}'
    /* 🏷 아이콘만 있던 버튼 밑에 짧은 글자 — 처음 쓰는 아이도 뜻을 안다(2026-11-09 「추천한대로」) */
    + '#ftk .fc-bar .fc-b{position:relative}#ftk .fc-bar .fc-mic{width:52px;height:52px}'
    + '#ftk .fc-lb{position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:5px;font-size:11px;font-weight:700;line-height:1.2;'
    + ' color:rgba(255,255,255,.92);white-space:nowrap;pointer-events:none;text-shadow:0 1px 2px rgba(0,0,0,.6)}'
    /* 다시 듣기 글자 — 위 «.fc-replay span»(42px 동그라미) 모양을 이긴다 */
    + '#ftk .fc-replay .fc-lb{display:block;width:auto;height:auto;padding:1px 6px;border-radius:8px;background:rgba(255,255,255,.85);color:#3f3f46;text-shadow:none}'
    /* 🖥 넓은 화면(PC·태블릿 가로) — 왼쪽 얼굴 · 오른쪽 대화 기록 + 글쓰기. 폰·좁은 창은 위 그대로 얼굴이 화면 가득.
       기준은 기기가 아니라 «창 폭»(수업 안 좁은 iframe 은 폰 모양) */
    + '#ftk .fc-side{display:none}'
    + '@media (min-width:1024px){#ftk.ftk-call{right:36%}'
    + '#ftk .fc-side{display:flex;flex-direction:column;position:fixed;top:0;right:0;bottom:0;width:36%;z-index:8;background:#f4f4f5;color:#18181b;'
    + ' border-left:1px solid #d4d4d8;-webkit-user-select:text;user-select:text;touch-action:auto}}'
    + '#ftk .fc-sideh{margin:0;padding:calc(env(safe-area-inset-top,0px) + 18px) 20px 12px;font-size:15px;font-weight:800;color:#52525b;border-bottom:1px solid #e4e4e7}'
    + '#ftk .fc-log{flex:1;min-height:0;overflow-y:auto;list-style:none;margin:0;padding:16px 20px;display:flex;flex-direction:column;gap:10px}'
    + '#ftk .fc-log li{max-width:85%;padding:10px 13px;border-radius:16px 16px 16px 4px;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.08);'
    + ' font-size:15px;line-height:1.45;overflow-wrap:anywhere}'
    + '#ftk .fc-log li.me{align-self:flex-end;border-radius:16px 16px 4px 16px;background:#dcfce7;color:#14532d}'
    + '#ftk .fc-log:empty::before{content:attr(data-empty);color:#71717a;font-size:14px}'
    + '#ftk .fc-type{display:flex;gap:8px;padding:12px 16px calc(env(safe-area-inset-bottom,0px) + 16px);border-top:1px solid #e4e4e7}'
    + '#ftk .fc-type[hidden]{display:none}'
    + '#ftk .fc-in{flex:1;min-width:0;height:44px;padding:0 14px;border:1px solid #d4d4d8;border-radius:12px;font:inherit;font-size:15px;background:#fff;color:#18181b}'
    + '#ftk .fc-send{height:44px;padding:0 18px;border:0;border-radius:12px;background:#18181b;color:#fff;font:inherit;font-weight:800;cursor:pointer}'
    + '#ftk .fc-in:focus-visible,#ftk .fc-send:focus-visible{outline:3px solid #2563eb;outline-offset:2px}'
    + '@media (prefers-reduced-motion:reduce){#ftk .fc-dots.heard i{animation:none;height:20px}}';

  var LB = '<span class="fc-lb" aria-hidden="true"></span>';   // 버튼 밑 짧은 글자(뜻은 aria-label 이 따로 말한다)
  var root = null, A = null, el = {}, wasOn = false, slowOn = false, camStream = null, logKey = '';
  var cap = { raf: 0, parts: [], idx: -1, src: '', last: 0, key: '', endAt: 0, hide: 0 };

  function t(ko, en) { try { return A && A.en && A.en() ? en : ko; } catch (e) { return ko; } }

  function build() {
    if (!document.getElementById('fc-style')) {
      var st = document.createElement('style'); st.id = 'fc-style'; st.textContent = CSS; document.head.appendChild(st);
    }
    var w = document.createElement('div');
    w.className = 'fc';
    w.innerHTML = ''
      + '<div class="fc-shade"></div>'
      + '<div class="fc-top"><h1 class="fc-title"></h1>'
      + '<button type="button" class="fc-b fc-done">' + I.check + '<span class="fc-done-t"></span></button>'
      + '<button type="button" class="fc-b fc-cam" aria-pressed="false">' + I.cam + '</button>'
      + '<button type="button" class="fc-b fc-close">' + I.x + '</button></div>'
      + '<video class="fc-self" muted playsinline autoplay hidden></video>'
      + '<button type="button" class="fc-b fc-replay"><span>' + I.wave + '</span>' + LB + '</button>'
      + '<div class="fc-cap"><p></p></div>'
      + '<div class="fc-status" role="status" aria-live="polite"></div>'
      + '<div class="fc-bar">'
      + '<button type="button" class="fc-b fc-mic">' + I.mic + LB + '</button>'
      + '<button type="button" class="fc-b fc-slow" aria-pressed="false">.5X' + LB + '</button>'
      + '<button type="button" class="fc-b fc-cc" aria-pressed="true">CC' + LB + '</button>'
      + '<span class="fc-dots" aria-hidden="true"><i></i><i></i><i></i></span>'
      + '<span class="fc-modes" role="group"><button type="button" class="fc-b fc-auto">' + I.auto + LB + '</button>'
      + '<button type="button" class="fc-b fc-hand">' + I.hand + LB + '</button></span>'
      + '</div>'
      + '<div class="fc-prog" role="progressbar" aria-valuemin="0" aria-valuemax="' + GOAL + '"><i></i></div>'
      + '<aside class="fc-side"><h2 class="fc-sideh"></h2><ol class="fc-log"></ol>'
      + '<form class="fc-type"><input class="fc-in" type="text" autocomplete="off" enterkeyhint="send"><button type="submit" class="fc-send"></button></form></aside>';
    root.appendChild(w);
    ['title', 'done', 'cam', 'close', 'self', 'replay', 'cap', 'status', 'mic', 'slow', 'cc', 'dots', 'auto', 'hand', 'prog',
     'sideh', 'log', 'type', 'in', 'send']
      .forEach(function (k) { el[k] = w.querySelector('.fc-' + k); });
    el.capP = el.cap.querySelector('p');
    el.type.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = el.in.value.trim();
      if (!v) return;
      if (call('type', v) === true) el.in.value = '';   // 받았을 때만 비운다 — 생각 중·보내는 중이면 글이 그대로 남는다
    });

    /* 버튼 눌림이 뒤의 얼굴(#ftkStage 클릭 = 마이크)로 새지 않게 */
    w.addEventListener('click', function (e) { if (e.target.closest('.fc-b')) e.stopPropagation(); });
    el.mic.onclick = function () { call('tap'); };
    el.close.onclick = function () { call('close'); };
    el.done.onclick = function () { call('finish'); };
    el.replay.onclick = function () { call('replay'); };
    el.slow.onclick = function () { setSlow(!slowOn); };
    el.cc.onclick = function () { ls(CC_KEY, ccOn() ? '0' : '1'); paint(); };
    el.auto.onclick = function () { setHands(true); };
    el.hand.onclick = function () { setHands(false); };
    el.cam.onclick = toggleCam;
    var onLang = function () { if (wasOn) paint(); };
    document.addEventListener('mangoi:lang-changed', onLang);
    window.addEventListener('mangoi:lang-changed', onLang);
    /* #ftk 하나만 — 상태(data-s)와 켜짐·말소리(class)를 본다. 이 파일은 #ftk 의 속성을 쓰지 않는다(되먹임 없음). */
    new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ['data-s', 'class'] });
  }
  function call(name, arg) { try { return A && typeof A[name] === 'function' ? A[name](arg) : undefined; } catch (e) { return undefined; } }
  function ccOn() { return ls(CC_KEY) !== '0'; }
  function setHands(on) { ls(HANDS_KEY, on ? 'auto' : 'hand'); call('hands', on); paint(); }
  function setSlow(on) { slowOn = !!on; call('slow', slowOn); paint(); }

  function toggleCam() {
    if (camStream) return stopCam();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 320 } }, audio: false }).then(function (s) {
      if (!wasOn) { s.getTracks().forEach(function (k) { k.stop(); }); return; }
      camStream = s; el.self.srcObject = s; el.self.hidden = false; paint();
    }).catch(function () { paint(); });
  }
  function stopCam() {
    if (camStream) camStream.getTracks().forEach(function (k) { k.stop(); });
    camStream = null; if (el.self) { el.self.srcObject = null; el.self.hidden = true; } paint();
  }

  function label(b, ko, en) { var s = t(ko, en); b.setAttribute('aria-label', s); b.title = s; }
  function paint() {
    if (!root || !el.title) return;
    var s = root.getAttribute('data-s') || 'pause', hf = handsFree();
    el.title.textContent = call('title') || t('A.i 말하기', 'A.i Speaking');
    label(el.done, '끝내기 · 결과 보기', 'Finish and see results');   // 보이는 글자(끝내기/Finish)로 시작해야 음성 조작으로 부를 수 있다
    var dt = el.done.querySelector('.fc-done-t'); if (dt) dt.textContent = t('끝내기', 'Finish');
    label(el.cam, camStream ? '내 카메라 끄기' : '내 카메라 켜기(나만 보여요)', camStream ? 'Turn my camera off' : 'Turn my camera on (only you see it)');
    el.cam.setAttribute('aria-pressed', camStream ? 'true' : 'false');
    label(el.close, '나가기', 'Leave');
    label(el.replay, '선생님 말 다시 듣기', 'Hear the teacher again');
    label(el.mic, s === 'listen' ? '다 말했어요(보내기)' : s === 'speak' ? '끊고 내가 말하기' : '눌러서 말하기',
      s === 'listen' ? "I'm done (send)" : s === 'speak' ? 'Interrupt and talk' : 'Tap to talk');
    el.mic.classList.toggle('live', s === 'listen');
    label(el.slow, '천천히 말하기(0.5배)', 'Speak slowly (0.5x)'); el.slow.setAttribute('aria-pressed', slowOn ? 'true' : 'false');
    label(el.cc, '자막', 'Captions'); el.cc.setAttribute('aria-pressed', ccOn() ? 'true' : 'false');
    label(el.auto, '자동 대화(말하면 알아서)', 'Hands-free'); el.auto.setAttribute('aria-pressed', hf ? 'true' : 'false');
    label(el.hand, '누르고 말하기', 'Tap to talk'); el.hand.setAttribute('aria-pressed', hf ? 'false' : 'true');
    el.auto.parentNode.setAttribute('aria-label', t('대화 방식', 'Talk mode'));
    el.status.textContent = s === 'listen' ? t('듣는 중...', 'Listening...')
      : s === 'think' ? (call('thinking') || t('생각 중...', 'Thinking...'))   // 화면이 «왜 기다리는지» 를 알면 그 말을 쓴다(웜업 집중교정)
      : s === 'pause' ? (hf && !call('waitTap') ? t('쉬는 중 · 마이크를 누르면 다시 시작해요', 'Paused · tap the mic to resume') : t('마이크를 눌러 말해요', 'Tap the mic to talk'))
      : '';
    el.dots.className = 'fc-dots' + (s === 'listen' ? ' live' : '') + (s === 'listen' && root.classList.contains('heard') ? ' heard' : '');
    var n = +call('turns') || 0, f = Math.min(1, n / GOAL);
    el.prog.firstChild.style.width = (f * 100) + '%';
    el.prog.classList.toggle('done', n >= GOAL);
    el.prog.setAttribute('aria-valuenow', String(Math.min(n, GOAL)));
    el.prog.setAttribute('aria-label', t('오늘 말한 횟수 ', 'Turns spoken ') + Math.min(n, GOAL) + '/' + GOAL);
    el.cap.hidden = !ccOn();
    lb(el.mic, s === 'listen' ? t('보내기', 'Send') : t('말하기', 'Talk'));
    lb(el.slow, t('천천히', 'Slow')); lb(el.cc, t('자막', 'Captions'));
    lb(el.auto, t('자동', 'Auto')); lb(el.hand, t('버튼', 'Button')); lb(el.replay, t('다시 듣기', 'Replay'));
    el.sideh.textContent = t('대화 기록', 'Conversation');
    el.log.setAttribute('data-empty', t('아직 대화가 없어요', 'No messages yet'));
    el.in.placeholder = t('글로 써서 보내기', 'Type your answer');
    el.in.setAttribute('aria-label', el.in.placeholder);
    el.send.textContent = t('보내기', 'Send');
    el.type.hidden = !A || typeof A.type !== 'function';
    paintLog();
  }
  function lb(b, s) { var x = b.querySelector('.fc-lb'); if (x && x.textContent !== s) x.textContent = s; }
  /* 🖥 넓은 화면 오른쪽 대화 기록 — 손잡이 log() 가 화면의 말풍선을 [{me, text}] 로 준다(여기서 새로 저장하지 않는다).
     바뀐 것이 없으면 다시 그리지 않는다. 좁은 화면에선 CSS 로 숨어 있다. */
  function paintLog() {
    var items = call('log') || [];
    var last = items.length ? items[items.length - 1] : null;
    var key = items.length + '|' + (last ? (last.me ? 1 : 0) + last.text : '');
    if (key === logKey) return;
    logKey = key;
    el.log.textContent = '';
    items.slice(-40).forEach(function (m) {
      if (!m || !m.text) return;
      var li = document.createElement('li');
      if (m.me) li.className = 'me';
      li.textContent = m.text;
      el.log.appendChild(li);
    });
    el.log.scrollTop = el.log.scrollHeight;
  }

  function sync() {
    var on = root.classList.contains('on');
    if (on !== wasOn) {
      wasOn = on;
      if (!on) { stopCam(); if (slowOn) setSlow(false); capStop(true); }
      else setTimeout(function () { try { el.close.focus({ preventScroll: true }); } catch (e) {} }, 0);   // 옛 ✕ 는 숨겼다 — 첫 초점을 보이는 ✕ 로
    }
    if (!on) return;
    paint();
    if (root.getAttribute('data-s') === 'speak') capStart(); else capStop(false);
  }

  /* ── 자막 rAF — 선생님이 말하는 동안만 ── */
  function capStart() {
    clearTimeout(cap.hide); el.cap.classList.remove('off');
    if (cap.raf) return;
    /* 조각 사이 잠깐 조용해서 «말하기» 가 끊겼다 이어진 것이면(1.5초 안) 세던 자리를 그대로 이어 간다 */
    var text = String(call('text') || '');
    if (text !== cap.key || Date.now() - cap.endAt > 1500) { cap.idx = -1; cap.src = ''; cap.last = 0; cap.key = text; el.capP.textContent = ''; }
    cap.raf = requestAnimationFrame(capTick);
  }
  function capStop(now) {
    if (cap.raf) { cancelAnimationFrame(cap.raf); cap.raf = 0; cap.endAt = Date.now(); }
    clearTimeout(cap.hide);
    if (now) { el.cap && el.cap.classList.add('off'); return; }
    cap.hide = setTimeout(function () { if (!cap.raf && el.cap) el.cap.classList.add('off'); }, 600);
  }
  function capTick() {
    cap.raf = requestAnimationFrame(capTick);
    var text = String(call('text') || '');
    cap.key = text;
    var parts = call('parts', text) || [text];
    var a = call('audio'), frac = 1;
    if (a && !a.paused && !a.ended && a.duration > 0 && isFinite(a.duration)) {
      if (a.src !== cap.src || a.currentTime + 0.25 < cap.last) { cap.idx++; cap.src = a.src; }   // 새 조각이 소리 나기 시작
      cap.last = a.currentTime; frac = a.currentTime / a.duration;
    } else if (cap.idx < 0 && window.speechSynthesis && speechSynthesis.speaking) {
      cap.idx = parts.length;   // shortcut: 기기 목소리(재생 위치를 모름)는 한 번에 전부 보인다 — 서버 목소리가 기본이라 드묾
    }
    var s = capText(parts, cap.idx, frac);
    if (el.capP.textContent !== s) { el.capP.textContent = s; paintLog(); }   // 낱말이 바뀔 때만 — 흘러나오는 대답도 기록에 따라 붙는다
  }

  window.FtkCall = {
    mount: function (r, adapter) {
      A = adapter || {};
      if (root === r) return;
      root = r; root.classList.add('ftk-call');
      build(); sync();
    },
    handsFree: handsFree,
    _capText: capText,   // test-harness/ftk_call_harness.mjs
    _paintLog: paintLog
  };
})();
