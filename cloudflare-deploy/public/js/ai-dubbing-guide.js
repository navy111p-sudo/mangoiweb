/* ═══════════════════════════════════════════════════════════════════════
 * ❓ ai-dubbing-guide.js — A.i영화더빙 «사용방법» 안내창 (2026-10-26)
 *   요청: 들어오면 저절로 · ✕ 닫기 · 시작하기 · 오늘은 다시 보지 않기 · 위쪽 ‘❓ 사용방법’으로 다시 열기
 *         초등학생·학부모도 알 수 있게 큰 글씨·짧은 존댓말 · 한/영 · 폰/PC
 *
 *   · 세 단계 ① 영상 골라요 ② 듣고 따라 해요 ③ 내 목소리로 말해요 — 화면에 «실제로 있는» 버튼 이름
 *     (‘👀 보기’·‘더빙’·‘자막 보며 연습 (추천)’·‘내 목소리로 녹음 시작’·‘✅ 말하기 완료’)으로만 말한다.
 *     버튼 이름이 바뀌면 여기 글과 그림도 함께 바꾼다(하니스가 «그 이름이 화면에 있는가» 를 본다).
 *   · 그림은 로컬에서 실제 화면을 캡처해 화살표·번호를 그려 넣은 것이다(/img/dubbing-guide/*-ko|en.jpg,
 *     test-harness/manual/ai-dubbing-guide-capture.mjs). 글은 그림 «밖» 에 두어 한/영을 바꾼다.
 *     그림은 그 단계를 열 때 받는다(다음 단계 하나만 미리) — 안내를 안 여는 사람은 0바이트.
 *
 *   · 저절로 열기 판정의 정본은 decide() 하나다(하니스가 조합으로 본다).
 *       - 오늘(«이 기기의» 날짜) ‘오늘은 다시 보지 않기’를 눌렀으면 안 연다 → 내일은 다시 열린다
 *       - 이 탭에서 이미 한 번 봤으면 안 연다(sessionStorage) — 작품을 바꾸면 ?ep= 로 새로 고침되는데
 *         그때마다 다시 뜨면 수업 중에 방해가 된다
 *       - ?resume= · ?library= 로 «하던 일» 을 이어 들어왔으면 안 연다(그 일을 가리지 않게)
 *       - 저장소가 막힌 기기에서는 «보여 주는» 쪽으로 실패한다(설명을 잃는 것보다 한 번 더 보는 편이 낫다)
 *     ⛔ 위쪽 ‘❓ 사용방법’ 버튼은 언제나 연다 — 오늘 숨김·이 탭에서 봄과 상관없다.
 *
 *   · ⛔ 이 파일은 마이크·영상·소리를 «직접» 건드리지 않는다 (getUserMedia·play()·AudioContext 0 — 하니스가 본다).
 *     🔊 음성 안내는 js/ai-dubbing-guide-voice.js 가 맡는다(2026-10-26 사장님: «클릭하면 바로 들리게 · 끄기 버튼»).
 *     여기는 열림·닫힘만 알린다(voice().guideOpened·guideClosed) — 사람이 ‘❓ 사용방법’으로 열면 소리 시작,
 *     저절로 열리면 소리 0, ✕·Esc·오늘 숨김이면 끔, ‘시작하기’면 이어 듣기. 판단은 그 파일 한 곳.
 *     ‘시작하기’도 녹음을 시작하지 않는다 — 창을 닫고 ‘짧은 더빙 시작’ 버튼으로 «포커스만» 옮긴다.
 *   · 바깥(어두운 곳)을 눌러도 닫히지 않는다 — 팝업은 ✕ 로만 닫는다(js/mg-modal-policy.js 와 같은 정책).
 *   · Esc 로 닫힌다. 이때 화면의 Esc(역할 고르기 시트 닫기)까지 같이 돌지 않게 이 창이 먼저 받아 멈춘다.
 *   · 열려 있는 동안 Tab 은 창 안에서만 돈다. 닫으면 열기 전 포커스·스크롤 자리로 돌아간다.
 *   · z-index 100002 — 공용 홈/EN 칩(99999)·드로어(100000) 위(CLAUDE.md 2장).
 *   · ⛔ data-ko/data-en 을 여기서 그리는 요소에 달지 말 것 — 언어는 그릴 때 고른다(textContent 갈아끼움 함정).
 *   · 이 파일이나 css/ai-dubbing-guide.css 를 고치면 ai-dubbing.html 의 ?v= 를 올린다(asset_version_harness).
 * ═══════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var HIDE_KEY = 'mangoi_dub_guide_hide_v1';   // localStorage: 'YYYY-MM-DD' = 그날은 저절로 안 열림
  var SEEN_KEY = 'mangoi_dub_guide_seen_v1';   // sessionStorage: '1' = 이 탭에서 이미 봤음
  var IMG_V = '1';
  /* 단계 정본 — img 는 /img/dubbing-guide/<img>-<ko|en>.jpg, size 는 그 그림의 [가로, 세로](px) */
  var STEPS = [
    { img: '1-pick', size: { ko: [732, 692], en: [732, 732] },
      tab: ['영상 골라요', 'Pick a video'],
      alt: ['장면 카드의 ‘👀 보기’(1번)와 ‘더빙’(2번) 버튼', 'The ‘👀 Watch’ (1) and ‘Dub’ (2) buttons on a scene card'],
      points: [
        ['‘👀 보기’를 누르면 원어민 목소리로 영상을 먼저 볼 수 있어요.', 'Tap ‘👀 Watch’ to watch the video with native voices first.'],
        ['연습하고 싶은 장면의 ‘더빙’을 눌러요.', 'Tap ‘Dub’ on the scene you want to practise.']],
      tip: ['처음이라면 위쪽 ‘짧은 더빙 시작’으로 한 장면만 해 봐도 좋아요.', 'New here? Try just one scene with ‘Record a short scene’ near the top.'] },
    { img: '2-follow', size: { ko: [780, 888], en: [780, 948] },
      tab: ['듣고 따라 해요', 'Listen and follow'],
      alt: ['캐릭터 버튼(1번), ‘자막 보며 연습 (추천)’(2번), ‘내 목소리로 녹음 시작’(3번)', 'Character buttons (1), ‘Practise with subtitles (recommended)’ (2), ‘Start recording my voice’ (3)'],
      points: [
        ['내가 맡을 캐릭터를 골라요.', 'Choose the character you will play.'],
        ['‘자막 보며 연습 (추천)’을 골라요. 자막을 보며 따라 말할 수 있어요.', 'Choose ‘Practise with subtitles (recommended)’ so you can read along.'],
        ['‘내 목소리로 녹음 시작’을 눌러요. 친구 캐릭터의 목소리를 듣고 내 차례를 기다려요.', 'Tap ‘Start recording my voice’. Listen to the other characters and wait for your turn.']],
      tip: ['마이크는 이 버튼을 누를 때만 켜져요. 마이크 사용을 물어보면 ‘허용’을 눌러 주세요.', 'The microphone turns on only when you tap this button. If you are asked, tap ‘Allow’.'] },
    { img: '3-speak', size: { ko: [732, 722], en: [732, 722] },
      tab: ['내 목소리로 말해요', 'Speak in my voice'],
      alt: ['내 차례에 나오는 자막(1번)과 ‘✅ 말하기 완료’ 버튼(2번)', 'The subtitle for your turn (1) and the ‘✅ Done speaking’ button (2)'],
      points: [
        ['자막에 ‘🎤’와 내 이름이 보이면 내 차례예요. 자막을 보고 또박또박 말해요.', 'When you see ‘🎤’ and your name, it’s your turn. Read the subtitle and speak clearly.'],
        ['다 말했으면 ‘✅ 말하기 완료’를 눌러요. 다음 대사로 넘어가요.', 'When you finish, tap ‘✅ Done speaking’ to go to the next line.'],
        ['끝나면 AI 발음 평가와 내 목소리로 만든 영상을 볼 수 있어요.', 'At the end, you can see your AI pronunciation check and your own movie.']],
      tip: ['처음에는 틀려도 괜찮아요. 천천히 함께 해 볼까요?', 'It’s okay to make mistakes at first. Shall we try slowly together?'] }
  ];

  /* ── 판정(순수 함수) ─────────────────────────────────────────────────── */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  /** 이 기기의 «오늘» — UTC 가 아니라 기기 시간대 날짜(자정에 넘어간다) */
  function dayKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  /** 저절로 열까? o = { search, today, hidden, seen } */
  function decide(o) {
    if (/[?&](?:resume|library)=/.test(String(o.search || ''))) return false;
    if (o.seen) return false;
    if (o.hidden && o.hidden === o.today) return false;
    return true;
  }

  var api = { decide: decide, dayKey: dayKey, steps: STEPS.length, HIDE_KEY: HIDE_KEY, SEEN_KEY: SEEN_KEY };
  root.MangoiDubGuide = api;
  if (typeof document === 'undefined' || !document.getElementById) return;   // 하니스(vm)에서는 판정만 쓴다

  /* ── 저장(실패해도 화면은 돈다) ─────────────────────────────────────── */
  var mem = { hidden: '', seen: false };   // 저장소가 막힌 기기용 — 이 화면이 떠 있는 동안만
  function read(store, key) { try { return root[store].getItem(key) || ''; } catch (e) { return ''; } }
  function write(store, key, value) { try { root[store].setItem(key, value); return true; } catch (e) { return false; } }
  function hiddenDay() { return read('localStorage', HIDE_KEY) || mem.hidden; }
  function seenHere() { return read('sessionStorage', SEEN_KEY) === '1' || mem.seen; }
  function markSeen() { mem.seen = true; write('sessionStorage', SEEN_KEY, '1'); }

  function isEn() { try { return !!(root.getLang && root.getLang() === 'en'); } catch (e) { return false; } }
  function T(pair) { return isEn() ? pair[1] : pair[0]; }
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function imgUrl(i, en) { return '/img/dubbing-guide/' + STEPS[i].img + '-' + (en ? 'en' : 'ko') + '.jpg?v=' + IMG_V; }
  /* 🔊 음성 안내(js/ai-dubbing-guide-voice.js) — 못 실렸으면 null, 안내창은 소리 없이 그대로 돈다 */
  function voice() { var v = root.MangoiDubVoice; return v && typeof v.mount === 'function' ? v : null; }

  var ov = null, box = null, idx = 0, back = null, saved = null, hooked = false;
  var UI = {
    kicker: ['🎬 A.i영화더빙 사용방법', '🎬 How to use A.i Dubbing'],
    title: ['세 단계만 따라 해요', 'Just follow three steps'],
    close: ['닫기', 'Close'],
    prev: ['◀ 이전', '◀ Back'],
    next: ['다음 ▶', 'Next ▶'],
    start: ['시작하기 🎬', 'Let’s start 🎬'],
    hide: ['오늘은 다시 보지 않기', 'Don’t show again today'],
    again: ['이 안내는 위쪽 ‘❓ 사용방법’을 누르면 언제든 다시 볼 수 있어요.', 'Tap ‘❓ How to use’ at the top any time to see this again.'],
    step: ['단계', 'Step'],
    lang: ['영어로 보기', 'Show in Korean']
  };

  function build() {
    if (ov) return ov;
    ov = el('div', 'dg-ov'); ov.id = 'dub-guide'; ov.hidden = true;
    box = el('div', 'dg-box');
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', 'dg-title'); box.setAttribute('aria-describedby', 'dg-desc');
    var head = el('div', 'dg-head');
    var kicker = el('p', 'dg-kicker'); kicker.id = 'dg-kicker';
    var title = el('h2', 'dg-title'); title.id = 'dg-title'; title.tabIndex = -1;
    var lang = el('button', 'dg-lang'); lang.type = 'button';
    var x = el('button', 'dg-x', '✕'); x.type = 'button';
    head.append(kicker, title, lang, x);
    var tabs = el('ol', 'dg-tabs');
    STEPS.forEach(function (_, i) {
      var li = el('li'), b = el('button', 'dg-tab'); b.type = 'button'; b.setAttribute('data-step', String(i));
      b.append(el('b', '', String(i + 1)), el('span'));
      b.addEventListener('click', function () { go(i); });
      li.appendChild(b); tabs.appendChild(li);
    });
    var body = el('div', 'dg-body'); body.id = 'dg-desc';
    var fig = el('figure', 'dg-fig'), img = el('img', 'dg-pic'); img.decoding = 'async'; fig.appendChild(img);
    var st = el('h3', 'dg-step-title'); st.setAttribute('aria-live', 'polite');
    /* 글이 먼저(폰에서도 스크롤 없이 할 일이 보이게), 그 아래 그림 — 글의 번호와 그림의 번호가 같다 */
    body.append(st, el('ol', 'dg-points'), fig, el('p', 'dg-tip'), el('p', 'dg-again'));
    var foot = el('div', 'dg-foot'), nav = el('div', 'dg-nav');
    var pv = el('button', 'dg-prev'); pv.type = 'button';
    var nx = el('button', 'dg-next'); nx.type = 'button';
    nav.append(pv, nx);
    var hide = el('button', 'dg-hide'); hide.type = 'button';
    /* 아래 줄 = ‘🔊 소리로 듣기’(음성 안내가 실렸을 때) + ‘오늘은 다시 보지 않기’ */
    var row = el('div', 'dg-row');
    if (voice()) voice().mount(row);
    row.appendChild(hide);
    foot.append(nav, row);
    box.append(head, tabs, body, foot);
    ov.appendChild(box);
    document.body.appendChild(ov);

    x.addEventListener('click', function () { close('x'); });
    /* 공용 🌐 칩은 이 창 아래에 깔려 못 누른다 — 같은 전환(toggleLang)을 창 안에도 둔다 */
    lang.addEventListener('click', function () { if (typeof root.toggleLang === 'function') root.toggleLang(); });
    pv.addEventListener('click', function () { go(idx - 1); });
    nx.addEventListener('click', function () { if (idx >= STEPS.length - 1) close('start'); else go(idx + 1); });
    hide.addEventListener('click', hideToday);
    box.addEventListener('keydown', trapTab);
    return ov;
  }

  function draw() {
    if (!ov) return;
    var en = isEn(), s = STEPS[idx], lang = en ? 'en' : 'ko';
    ov.querySelector('.dg-kicker').textContent = T(UI.kicker);
    ov.querySelector('.dg-title').textContent = T(UI.title);
    ov.querySelector('.dg-x').setAttribute('aria-label', T(UI.close));
    var lb = ov.querySelector('.dg-lang');
    lb.hidden = typeof root.toggleLang !== 'function';
    lb.textContent = en ? '🌐 KO' : '🌐 EN';
    lb.setAttribute('aria-label', T(UI.lang));
    ov.querySelector('.dg-tabs').setAttribute('aria-label', T(UI.kicker));
    Array.prototype.forEach.call(ov.querySelectorAll('.dg-tab'), function (b, i) {
      b.querySelector('span').textContent = T(STEPS[i].tab);
      if (i === idx) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      b.setAttribute('aria-label', T(UI.step) + ' ' + (i + 1) + ' / ' + STEPS.length + ': ' + T(STEPS[i].tab));
    });
    var img = ov.querySelector('.dg-pic');
    img.width = s.size[lang][0]; img.height = s.size[lang][1];
    img.alt = T(s.alt);
    img.src = imgUrl(idx, en);
    var st = ov.querySelector('.dg-step-title');
    st.replaceChildren(el('b', '', String(idx + 1)), document.createTextNode(T(s.tab)));
    var ol = ov.querySelector('.dg-points');
    ol.replaceChildren();
    s.points.forEach(function (p, k) { var li = el('li'); li.append(el('i', '', String(k + 1)), el('span', '', T(p))); ol.appendChild(li); });
    ov.querySelector('.dg-tip').textContent = T(s.tip);
    var pv = ov.querySelector('.dg-prev'), nx = ov.querySelector('.dg-next');
    pv.textContent = T(UI.prev); pv.disabled = idx === 0;
    var last = idx >= STEPS.length - 1;
    nx.textContent = last ? T(UI.start) : T(UI.next);
    nx.classList.toggle('dg-go', last);
    ov.querySelector('.dg-hide').textContent = T(UI.hide);
    ov.querySelector('.dg-again').textContent = T(UI.again);
    ov.querySelector('.dg-body').scrollTop = 0;
    if (idx + 1 < STEPS.length) { var pre = new Image(); pre.src = imgUrl(idx + 1, en); }
  }

  function go(i) {
    var n = Math.max(0, Math.min(STEPS.length - 1, i));
    if (n === idx && ov && !ov.hidden) return;
    idx = n; draw();
    /* 이전 버튼이 첫 장에서 꺼지면 포커스가 사라진다 — 다음 버튼으로 옮겨 Tab 이 창 밖으로 새지 않게 */
    var a = document.activeElement;
    if (!a || a.disabled || !box.contains(a)) focusIn(ov.querySelector('.dg-next'));
  }
  function focusIn(e) { if (e) { try { e.focus({ preventScroll: true }); } catch (_) { e.focus(); } } }

  function focusables() {
    return Array.prototype.filter.call(box.querySelectorAll('button'), function (b) { return !b.disabled && b.offsetParent !== null; });
  }
  function trapTab(e) {
    if (e.key !== 'Tab') return;
    var list = focusables(); if (!list.length) return;
    var first = list[0], last = list[list.length - 1], a = document.activeElement;
    if (e.shiftKey && (a === first || !box.contains(a))) { e.preventDefault(); focusIn(last); }
    else if (!e.shiftKey && (a === last || !box.contains(a))) { e.preventDefault(); focusIn(first); }
  }
  /* Esc — 화면의 다른 Esc(document 에 단 «역할 고르기 시트 닫기») 보다 먼저 받아서 거기서 멈춘다 */
  function onKey(e) {
    if (!ov || ov.hidden) return;
    if (e.key === 'Escape' || e.key === 'Esc') { e.preventDefault(); e.stopPropagation(); close('esc'); }
  }
  /* 창 밖으로 포커스가 나가면(마우스로 바탕 글자를 고르거나 다른 스크립트가 옮길 때) 창 안으로 되돌린다 */
  function onFocusIn(e) { if (ov && !ov.hidden && !box.contains(e.target)) focusIn(ov.querySelector('.dg-next')); }

  function lockScroll() {
    var de = document.documentElement, bd = document.body;
    saved = { x: root.scrollX || 0, y: root.scrollY || 0, html: de.style.overflow, body: bd.style.overflow };
    de.style.overflow = 'hidden'; bd.style.overflow = 'hidden';
  }
  function unlockScroll() {
    if (!saved) return;
    document.documentElement.style.overflow = saved.html; document.body.style.overflow = saved.body;
    if ((root.scrollX || 0) !== saved.x || (root.scrollY || 0) !== saved.y) { try { root.scrollTo(saved.x, saved.y); } catch (e) {} }
    saved = null;
  }

  function open(at, opener) {
    build();
    var was = !ov.hidden;
    idx = Math.max(0, Math.min(STEPS.length - 1, at || 0));
    draw();
    markSeen();
    if (was) return;   // 이미 열려 있으면 그 자리에서 첫 장으로만 — 스크롤·포커스 기록을 덮어쓰지 않는다
    back = opener || document.activeElement;
    lockScroll();
    ov.hidden = false;
    if (!hooked) {
      hooked = true;
      root.addEventListener('keydown', onKey, true);
      document.addEventListener('focusin', onFocusIn);
    }
    focusIn(ov.querySelector('.dg-next'));
    /* opener 가 있다 = 사람이 버튼을 눌러 열었다(그 클릭 안) → 음성 안내가 바로 시작. 저절로 열림(null)은 소리 0 */
    if (voice()) voice().guideOpened(!!opener);
  }

  function close(why) {
    if (!ov || ov.hidden) return;
    ov.hidden = true;
    if (hooked) {
      hooked = false;
      root.removeEventListener('keydown', onKey, true);
      document.removeEventListener('focusin', onFocusIn);
    }
    unlockScroll();
    if (voice()) voice().guideClosed(why);   // «시작하기» 면 소리가 이어지고(아래 «끄기» 막대), 그 밖은 꺼진다
    var opener = back, target = null;
    back = null;
    if (why === 'start') {
      /* 시작하기 = 첫 버튼으로 안내만 한다(누르지 않는다 → 마이크·영상이 저절로 켜지지 않는다) */
      target = $('dub-quick-start');
      if (!target || target.disabled) target = document.querySelector('#dub-scenes button[data-scene]:not([disabled])');
      if (target) { try { target.focus(); } catch (e) {} if (typeof target.scrollIntoView === 'function') target.scrollIntoView({ block: 'center' }); return; }
    }
    target = opener && opener !== document.body && document.contains(opener) && !opener.disabled ? opener : $('dub-guide-open');
    focusIn(target);
  }

  function hideToday() {
    var today = dayKey(new Date());
    mem.hidden = today;
    write('localStorage', HIDE_KEY, today);   // 막힌 기기면 이 화면에서만 기억한다(다음 접속 땐 다시 보인다)
    close('hide');
  }

  api.open = function () { open(0, $('dub-guide-open')); };
  api.close = function () { close('api'); };
  api.isOpen = function () { return !!ov && !ov.hidden; };

  var btn = $('dub-guide-open');
  if (btn) btn.addEventListener('click', function () { open(0, btn); });
  function relang() { if (ov && !ov.hidden) draw(); }
  root.addEventListener('mangoi:lang-changed', relang);
  document.addEventListener('mangoi:lang-changed', relang);

  if (decide({ search: location.search, today: dayKey(new Date()), hidden: hiddenDay(), seen: seenHere() })) open(0, null);
})(typeof window !== 'undefined' ? window : this);
