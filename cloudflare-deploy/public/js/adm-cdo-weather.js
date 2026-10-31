// ═══════════════════════════════════════════════════════════════════════════
// adm-cdo-weather.js — 🌤 카가얀데오로(CDO) 날씨 (2026-08-17 사장님 지시)
//
//   어디에 —
//     모바일 사이드바 맨 위, 한국·필리핀 시계(#mgv2-clock) 바로 밑.
//     필리핀 시각 옆에 그곳 날씨가 같이 보이면 «지금 현지가 어떤지» 가 한 눈에 들어온다.
//     (CDO = Cagayan de Oro. 강사분들이 있는 도시.)
//
//   어디서 받나 — Open-Meteo (https://open-meteo.com)
//     · API 키가 필요 없다. 가입도, 시크릿 관리도 없다.
//     · 비상업 사용 무료이고 CORS 를 허용해서 브라우저가 바로 부를 수 있다.
//       → 서버(Worker)에 새 API 를 만들 필요가 없다. src/index.ts 라우팅을 안 건드린다.
//     · 응답이 예상과 달라도 «날씨 줄만 안 보이고» 메뉴는 멀쩡하다(아래 안전장치).
//
//   무겁지 않게 —
//     · 반복 타이머 0개. 페이지를 열 때 부르지 않는다.
//     · **메뉴를 열 때만** 확인하고, 그것도 캐시가 30분 지났을 때만 실제로 부른다.
//       (날씨는 30분에 한 번이면 충분하다. 메뉴를 열 때마다 부르면 낭비다.)
//     · 캐시는 localStorage. 받아 둔 값이 있으면 **먼저 그려 놓고** 조용히 갱신한다
//       → 열자마자 빈 칸이 보이는 일이 없다.
//     · 6초 안에 응답이 없으면 포기한다(AbortController). 멈춘 요청을 붙들지 않는다.
//
//   ⚠️ 실패하면 «조용히» 사라진다. 오류 문구를 메뉴에 띄우지 않는다 —
//      날씨는 곁다리 정보인데 그것 때문에 메뉴가 시끄러워지면 안 된다.
//   ⚠️ 아이콘은 글자가 아니라 SVG 다. 기호 문자(☀ ☁ ☂)는 글꼴에 따라 깨진다(아래 ICO 주석).
//   ⚠️ 라벨에 data-ko/data-en 을 쓰지 않는다. 이 줄은 **숫자와 기호가 대부분**이고,
//      adm-core 의 applyAdminLangDom() 이 [data-ko] 를 textContent 로 통째로 갈아치우므로
//      안에 넣은 아이콘·온도가 지워진다(adm-quick-access.js 가 적어 둔 함정과 같은 것).
//      대신 언어에 따라 우리가 직접 두 벌을 그린다.
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';
  if (window.__admCdoWeather) return;
  window.__admCdoWeather = 1;

  /* 🖥 (2026-08-17) 여기 「모바일에만 붙는다」는 조기 return 이 있었다. 그래서 PC 에서는
     날씨가 아예 안 만들어졌고, 사장님이 「왜 안 뜨나」 하신 원인이었다.
     이제 모바일·PC 둘 다 사이드바 맨 위(시계 바로 밑)에 붙는다.
     달라지는 건 «언제 확인하나» 뿐이다 — 아래 hook() 참고. */
  function isNarrow() { return window.matchMedia('(max-width: 1023px)').matches; }

  var LS = 'mangoi_cdo_weather';
  var TTL = 30 * 60 * 1000;                 // 30분
  var TIMEOUT = 6000;                       // 6초
  // 카가얀데오로 좌표 (Cagayan de Oro, Misamis Oriental, PH)
  var URL = 'https://api.open-meteo.com/v1/forecast'
          + '?latitude=8.4542&longitude=124.6319'
          + '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code'
          + '&timezone=Asia%2FManila';

  /* 🌐 언어 판정 — 정본은 window.adminLang (adm-lang-boot.js 가 정하고, adm-core.js 의
     `var adminLang` 이 같은 바인딩이라 KO/EN 토글까지 따라온다. 저장 키는 mangoi_lang).
     ⚠️ 예전엔 localStorage 'adminLang' 을 읽었는데 그 키는 **아무도 저장하지 않는 죽은 키**라
        EN 스태프에게도 늘 한국어였다(2026-08-27 수리). ⛔ 그 키에 쓰는 방식으로 되살리지 말 것. */
  function isEn() {
    if (window.adminLang === 'en' || window.adminLang === 'ko') return window.adminLang === 'en';
    try { return (localStorage.getItem('mangoi_lang') || '') === 'en'; } catch (e) { return false; }
  }

  /* 아이콘은 **글자가 아니라 SVG** 로 그린다.
     ☀ ☁ ☂ 같은 기호 문자는 글꼴에 따라 얇은 실선으로 깨지거나 아예 두부가 된다
     (실제로 ☂ 가 «↑» 비슷하게 나오는 것을 화면으로 확인했다 — 2026-08-17).
     이 저장소도 같은 이유로 도크·메뉴에서 이모지 대신 SVG 를 쓰기로 정해 두었다. */
  var ICO = {
    sun:    '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"/>',
    part:   '<circle cx="8.5" cy="8.5" r="3.2"/><path d="M8.5 2.6v1.6M2.6 8.5h1.6M4.6 4.6l1.1 1.1M12.4 4.6l-1.1 1.1"/><path d="M8 19h9a3.2 3.2 0 0 0 .2-6.4 4.6 4.6 0 0 0-8.8-1A3.7 3.7 0 0 0 8 19z"/>',
    cloud:  '<path d="M7 18.5h10a3.4 3.4 0 0 0 .2-6.8 4.9 4.9 0 0 0-9.4-1.1A3.9 3.9 0 0 0 7 18.5z"/>',
    fog:    '<path d="M7 14.5h10a3.4 3.4 0 0 0 .2-6.8 4.9 4.9 0 0 0-9.4-1.1A3.9 3.9 0 0 0 7 14.5z"/><path d="M4 18h16M6.5 21h11"/>',
    rain:   '<path d="M7 15h10a3.4 3.4 0 0 0 .2-6.8 4.9 4.9 0 0 0-9.4-1.1A3.9 3.9 0 0 0 7 15z"/><path d="M9 18l-1 3M13 18l-1 3M17 18l-1 3"/>',
    // 눈은 점(h.01)으로 찍으면 15px 에서 안 보인다 — 비처럼 짧은 선으로 긋는다
    snow:   '<path d="M7 15h10a3.4 3.4 0 0 0 .2-6.8 4.9 4.9 0 0 0-9.4-1.1A3.9 3.9 0 0 0 7 15z"/><path d="M9 18.4v1.6M12.5 19.4v1.6M16 18.4v1.6"/>',
    storm:  '<path d="M7 14.5h10a3.4 3.4 0 0 0 .2-6.8 4.9 4.9 0 0 0-9.4-1.1A3.9 3.9 0 0 0 7 14.5z"/><path d="M13 16l-2.5 4h3L11 23.5"/>'
  };

  /* WMO 날씨 코드 → 아이콘 + 말
     표: https://open-meteo.com/en/docs (WMO Weather interpretation codes)
     비슷한 코드는 묶었다 — 사이드바 한 줄에 들어가야 하므로 너무 잘게 나누지 않는다. */
  function describe(code) {
    var c = Number(code);
    if (c === 0)                 return { k: 'sun',   ko: '맑음',       en: 'Clear' };
    if (c === 1)                 return { k: 'sun',   ko: '대체로 맑음', en: 'Mostly clear' };
    if (c === 2)                 return { k: 'part',  ko: '구름 조금',   en: 'Partly cloudy' };
    if (c === 3)                 return { k: 'cloud', ko: '흐림',       en: 'Overcast' };
    if (c === 45 || c === 48)    return { k: 'fog',   ko: '안개',       en: 'Fog' };
    if (c >= 51 && c <= 57)      return { k: 'rain',  ko: '이슬비',     en: 'Drizzle' };
    if (c >= 61 && c <= 65)      return { k: 'rain',  ko: '비',         en: 'Rain' };
    if (c >= 66 && c <= 67)      return { k: 'rain',  ko: '언 비',      en: 'Freezing rain' };
    if (c >= 71 && c <= 77)      return { k: 'snow',  ko: '눈',         en: 'Snow' };
    if (c >= 80 && c <= 82)      return { k: 'rain',  ko: '소나기',     en: 'Showers' };
    if (c >= 85 && c <= 86)      return { k: 'snow',  ko: '눈소나기',   en: 'Snow showers' };
    if (c >= 95)                 return { k: 'storm', ko: '천둥번개',   en: 'Thunderstorm' };
    return { k: 'part', ko: '', en: '' };   // 모르는 코드 — 아이콘만 두고 말은 비운다
  }

  function load() {
    try {
      var v = JSON.parse(localStorage.getItem(LS) || 'null');
      if (v && typeof v === 'object' && v.d) return v;
    } catch (e) { /* 깨진 값 — 없는 것으로 */ }
    return null;
  }
  function save(d) {
    try { localStorage.setItem(LS, JSON.stringify({ t: Date.now(), d: d })); } catch (e) { /* 무시 */ }
  }

  function box() {
    var el = document.getElementById('mgv2-weather');
    if (el) return el;
    var clock = document.getElementById('mgv2-clock');
    if (!clock || !clock.parentNode) return null;
    el = document.createElement('div');
    el.id = 'mgv2-weather';
    el.setAttribute('aria-live', 'polite');
    clock.parentNode.insertBefore(el, clock.nextSibling);   // 시계 바로 밑
    return el;
  }

  /** d = {temp, feels, hum, code} */
  function paint(d) {
    var el = box();
    if (!el) return;
    if (!d || typeof d.temp !== 'number') { el.textContent = ''; el.classList.add('mgv2-w-empty'); return; }
    el.classList.remove('mgv2-w-empty');

    var w = describe(d.code), en = isEn();
    var word = en ? w.en : w.ko;
    var city = en ? 'Cagayan de Oro' : '카가얀데오로';
    var parts = [];
    if (word) parts.push(word);
    if (typeof d.feels === 'number' && Math.abs(d.feels - d.temp) >= 1) {
      parts.push((en ? 'feels ' : '체감 ') + Math.round(d.feels) + '°');
    }
    if (typeof d.hum === 'number') parts.push((en ? 'humidity ' : '습도 ') + Math.round(d.hum) + '%');

    /* textContent 로 한 번에 넣지 않고 조각으로 넣는다 — 아이콘·도시·온도가 각각
       다른 크기·색이라 span 이 필요하고, 나중에 언어를 바꿔도 이 함수가 다시 그린다. */
    el.innerHTML = '';
    var add = function (cls, text) {
      var s = document.createElement('span');
      s.className = cls; s.textContent = text; el.appendChild(s);
    };
    /* 아이콘 — 선만 그리고 색은 currentColor 로 둔다.
       그래야 테마(밝게/어둡게)가 바뀌어도 옆 글자와 같은 색으로 따라간다. */
    var ico = document.createElement('span');
    ico.className = 'mgv2-w-ico';
    ico.setAttribute('aria-hidden', 'true');       // 화면낭독기는 옆의 «소나기» 만 읽으면 된다
    ico.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none"'
                  + ' stroke="currentColor" stroke-width="1.7"'
                  + ' stroke-linecap="round" stroke-linejoin="round">'
                  + (ICO[w.k] || ICO.part) + '</svg>';
    el.appendChild(ico);

    add('mgv2-w-city', city);
    add('mgv2-w-temp', Math.round(d.temp) + '°');
    if (parts.length) add('mgv2-w-sub', parts.join(' · '));
  }

  var busy = false;
  function fetchNow() {
    if (busy || !window.fetch) return;
    busy = true;
    var ctl = null, timer = 0;
    try { ctl = new AbortController(); timer = setTimeout(function () { try { ctl.abort(); } catch (e) {} }, TIMEOUT); }
    catch (e) { ctl = null; }

    fetch(URL, ctl ? { signal: ctl.signal, cache: 'no-store' } : { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        var c = j && j.current;
        if (!c || typeof c.temperature_2m !== 'number') return;   // 모양이 다르면 조용히 포기
        var d = {
          temp:  c.temperature_2m,
          feels: typeof c.apparent_temperature === 'number' ? c.apparent_temperature : null,
          hum:   typeof c.relative_humidity_2m === 'number' ? c.relative_humidity_2m : null,
          code:  c.weather_code
        };
        save(d); paint(d);
      })
      .catch(function () { /* 네트워크·시간초과·차단 — 조용히 넘어간다 */ })
      .then(function () { if (timer) clearTimeout(timer); busy = false; });
  }

  /* 🕐 시계(#mgv2-clock)가 세워진 뒤에야 붙을 자리가 생긴다.
     ⚠️ 이 파일은 defer 라서 **인라인 시계 스크립트보다 먼저** 실행이 끝난다
        (defer 는 DOMContentLoaded «전» 에 돌고, 시계는 DOMContentLoaded 에서 세워진다).
        그래서 곧바로 그리려 하면 box() 가 null 이라 아무 일도 안 일어난다.
        모바일은 사람이 메뉴를 여는 시점이 한참 뒤라 우연히 문제가 안 났지만,
        PC 는 열림 동작이 없어서 이 대기가 없으면 영영 안 그려진다. */
  function whenClockReady(cb, tries) {
    if (document.getElementById('mgv2-clock')) { cb(); return; }
    if ((tries || 0) > 40) return;                 // 10초까지만 기다린다(0.25초 × 40)
    setTimeout(function () { whenClockReady(cb, (tries || 0) + 1); }, 250);
  }

  /** 캐시가 싱싱하면 그리기만 하고 네트워크는 안 쓴다. */
  function sync() {
    whenClockReady(function () {
      var c = load();
      if (c) paint(c.d);                     // 있으면 먼저 보여 준다(빈 칸 방지)
      if (!c || (Date.now() - c.t) > TTL) fetchNow();
    });
  }
  window.__mgv2WeatherSync = sync;

  /* «언제 확인하나» 가 화면 폭에 따라 다르다.
       좁은 화면: 시계·날씨가 드로어 «안» 에 있으니 **열 때만** 확인한다.
                  닫혀 있는 동안 네트워크를 쓰는 것은 낭비다.
       PC       : 사이드바가 늘 펼쳐져 있으니 **한 번** 확인한다.
                  (그것도 캐시가 30분 지났을 때만 실제로 부른다 — sync 안에서 판정) */
  function hook() {
    if (!isNarrow()) { sync(); return; }

    /* 메뉴 열림에 얹는다.
       ⚠️ mgaToggle 도 window.mgaOpen 을 부르므로 여기 한 곳만 감싸면 둘 다 걸린다. */
    if (typeof window.mgaOpen !== 'function') { setTimeout(hook, 400); return; }
    if (window.mgaOpen.__wxWrapped) return;
    var orig = window.mgaOpen;
    var wrapped = function () {
      var r = orig.apply(this, arguments);
      try { sync(); } catch (e) { /* 날씨 때문에 메뉴가 안 열리면 안 된다 */ }
      return r;
    };
    wrapped.__wxWrapped = 1;
    window.mgaOpen = wrapped;
    // 이미 열려 있는 상태로 시작했다면(새로고침 등) 한 번 그려 둔다
    if (document.body && document.body.classList.contains('mga-open')) sync();
    else whenClockReady(function () { var c = load(); if (c) paint(c.d); });   // 네트워크 없이 캐시만
  }

  /* 🌐 KO/EN 토글에 따라오게 — 이 줄은 `textContent` 로 직접 그리므로 data-ko/data-en 루프가
     못 고친다(CLAUDE.md 2장 「JS 로 그린 라벨」). 캐시만 다시 그리므로 네트워크는 안 쓴다.
     ⚠️ 2026-08-27 이전에는 판정이 죽은 키(localStorage 'adminLang')라 **늘 한국어**였고,
        그래서 토글해도 어긋날 일이 없어 이 구멍이 안 보였다. 정본으로 고치면서 드러났다.
     ⚠️ 이벤트를 쏘는 곳이 둘이다 — adm-core.js 는 `document`, mango-i18n.js 는 `window`.
        한쪽만 들으면 화면에 따라 조용히 안 먹는다(adm-s1.js 도 둘 다 듣는다). */
  function repaintForLang() { try { var c = load(); if (c) paint(c.d); } catch (e) { /* 날씨 때문에 토글이 깨지면 안 된다 */ } }
  try { document.addEventListener('mangoi:lang-changed', repaintForLang); } catch (e) {}
  try { window.addEventListener('mangoi:lang-changed', repaintForLang); } catch (e) {}

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook);
  else hook();
})();
