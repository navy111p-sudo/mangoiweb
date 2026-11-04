/* =========================================================
   AI 말하기 사용 안내서 — 공통 동작 (/ai-speaking-guide.html · /ai-speaking-guide-full.html)
   페이지 설정은 <html> 속성으로: data-file-base · data-title-ko · data-title-en
   1) 언어 KO/EN — 주소 ?lang= → 이 안내서에서 고른 값 → 사이트 언어(mangoi_lang) → 한국어
      ⛔ 사이트 공용 키 mangoi_lang 에는 쓰지 않는다(안내서에서 누른 것이 사이트 전체 언어를 바꾸면 안 됨).
   2) PDF·Word 링크를 지금 언어 파일로 맞춤 (/guide/ai-speaking/)
   3) 다른 안내서로 가는 링크([data-lang-link])에 지금 언어를 붙임
   4) 인쇄할 때 접힌 칸(Q&A·추가 기능)을 모두 펼침
   5) 창(iframe) 밖에서 열렸을 때만 «AI 말하기로» 링크를 보여 줌
   6) 창 안에서는: 언어를 저장하지 않음(저장하면 부모 화면 storage 이벤트가 «✅ 적용됐어요» 를 거둠) ·
      Esc 를 부모에게 알림(포커스가 iframe 안이면 dialog 가 Esc 를 못 받음) ·
      다른 안내서 링크는 replace 로(창을 닫은 뒤 «뒤로» 가 안 보이는 iframe 만 되돌리지 않게)
   서버를 부르지 않는다(로그인 불필요 · 누구나 열람).
   ========================================================= */
(function () {
  "use strict";

  var root = document.documentElement;
  var fileBase = root.getAttribute("data-file-base") || "AI-Speaking-Guide";
  var LANGS = ["ko", "en"];
  var OWN_KEY = "aiSpeakingGuide.lang";
  var SITE_KEY = "mangoi_lang";
  var TITLES = {
    ko: root.getAttribute("data-title-ko") || document.title,
    en: root.getAttribute("data-title-en") || document.title
  };
  var FILES = {
    pdf: "/guide/ai-speaking/" + fileBase + "_{LANG}.pdf",
    docx: "/guide/ai-speaking/" + fileBase + "_{LANG}.docx"
  };

  /* ---------- 저장소 (막힌 기기에서도 화면은 뜬다) ---------- */
  function readKey(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function writeOwnLang(lang) {
    try { window.localStorage.setItem(OWN_KEY, lang); } catch (e) { /* 무시 */ }
  }

  /* ---------- 언어 ---------- */
  function isLang(v) { return LANGS.indexOf(v) !== -1; }

  function initialLang() {
    var fromUrl = null;
    try { fromUrl = new URLSearchParams(location.search).get("lang"); } catch (e) { /* 무시 */ }
    if (isLang(fromUrl)) return fromUrl;
    var own = readKey(OWN_KEY);
    if (isLang(own)) return own;
    var site = readKey(SITE_KEY);
    if (isLang(site)) return site;
    return "ko";
  }

  function withLang(href, lang) {
    var base = href.split("#")[0].split("?")[0];
    return base + "?lang=" + lang;
  }

  function applyLang(lang) {
    root.setAttribute("lang", lang);
    root.setAttribute("data-lang", lang);
    document.title = TITLES[lang];
    var suffix = lang.toUpperCase();
    document.querySelectorAll("[data-lang-btn]").forEach(function (btn) {
      btn.setAttribute("aria-pressed", String(btn.getAttribute("data-lang-btn") === lang));
    });
    document.querySelectorAll("[data-download]").forEach(function (a) {
      var pattern = FILES[a.getAttribute("data-download")];
      if (pattern) a.setAttribute("href", pattern.replace("{LANG}", suffix));
    });
    document.querySelectorAll("[data-lang-link]").forEach(function (a) {
      a.setAttribute("href", withLang(a.getAttribute("href"), lang));
    });
  }

  /* ---------- 인쇄: 접힌 칸 펼치기 ---------- */
  var closedBeforePrint = [];
  function expandForPrint() {
    closedBeforePrint = Array.prototype.filter.call(
      document.querySelectorAll("details:not([open])"),
      function (d) { d.open = true; return true; }
    );
  }
  function restoreAfterPrint() {
    closedBeforePrint.forEach(function (d) { d.open = false; });
    closedBeforePrint = [];
  }

  /* ---------- 창 안인지 ---------- */
  function inFrame() {
    try { return window.self !== window.top; } catch (e) { return true; }
  }

  var IN_FRAME = inFrame();

  function bindEvents() {
    document.querySelectorAll("[data-lang-btn]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var lang = btn.getAttribute("data-lang-btn");
        applyLang(lang);
        if (!IN_FRAME) writeOwnLang(lang);
      });
    });
    if (IN_FRAME) {
      document.addEventListener("keydown", function (e) {
        if (e.key !== "Escape") return;
        try { window.parent.postMessage("ai-speaking-guide:close", location.origin); } catch (err) { /* 무시 */ }
      });
      document.querySelectorAll("[data-lang-link]").forEach(function (a) {
        a.addEventListener("click", function (e) {
          e.preventDefault();
          location.replace(a.getAttribute("href"));
        });
      });
    }
    document.querySelectorAll('[data-action="print"]').forEach(function (btn) {
      btn.addEventListener("click", function () { window.print(); });
    });
    window.addEventListener("beforeprint", expandForPrint);
    window.addEventListener("afterprint", restoreAfterPrint);
  }

  document.querySelectorAll("[data-standalone-only]").forEach(function (el) { el.hidden = IN_FRAME; });
  applyLang(initialLang());
  bindEvents();
})();
