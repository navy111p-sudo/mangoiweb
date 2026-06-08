/**
 * Category UI - Adds Phonics/BTS/SIU/中文 category selection menu
 * Also fixes DOM.targetText bug (should be DOM.targetSentence)
 * This file should be loaded AFTER main.js
 *
 * [v3 수정사항 — 2026-05-28]
 * - BTS 옵션에 Level 1~8 라벨 추가
 * - Phonics 옵션에 Level 0 라벨 추가
 * - 레벨 선택 시 levelInfo에 레벨 설명 표시
 * - 🇨🇳 중국어 카드 추가 — speech-coach-cn.html (다락원 + Lv 1~20) 로 이동
 */
(function() {
  // === Bug Fix: DOM.targetText is undefined, should be DOM.targetSentence ===
  if (typeof DOM !== "undefined" && DOM.targetSentence && !DOM.targetText) {
    DOM.targetText = DOM.targetSentence;
  }

  // === Level 매핑 정의 ===
  var LEVEL_LABELS = {
    "phonics": { level: "Level 0", desc: "파닉스 — 짧고 쉬운 단어 연습" },
    "1":  { level: "Level 1", desc: "기초 문장 연습 (BTS 1~4)" },
    "2":  { level: "Level 1", desc: "기초 문장 연습 (BTS 1~4)" },
    "3":  { level: "Level 1", desc: "기초 문장 연습 (BTS 1~4)" },
    "4":  { level: "Level 1", desc: "기초 문장 연습 (BTS 1~4)" },
    "5":  { level: "Level 2", desc: "일상 표현 연습 (BTS 5~8)" },
    "6":  { level: "Level 2", desc: "일상 표현 연습 (BTS 5~8)" },
    "7":  { level: "Level 2", desc: "일상 표현 연습 (BTS 5~8)" },
    "8":  { level: "Level 2", desc: "일상 표현 연습 (BTS 5~8)" },
    "9":  { level: "Level 3", desc: "기본 대화 연습 (BTS 9~12)" },
    "10": { level: "Level 3", desc: "기본 대화 연습 (BTS 9~12)" },
    "11": { level: "Level 3", desc: "기본 대화 연습 (BTS 9~12)" },
    "12": { level: "Level 3", desc: "기본 대화 연습 (BTS 9~12)" },
    "13": { level: "Level 4", desc: "중급 문장 연습 (BTS 13~16)" },
    "14": { level: "Level 4", desc: "중급 문장 연습 (BTS 13~16)" },
    "15": { level: "Level 4", desc: "중급 문장 연습 (BTS 13~16)" },
    "16": { level: "Level 4", desc: "중급 문장 연습 (BTS 13~16)" },
    "17": { level: "Level 5", desc: "고급 문장 연습 (BTS 17~20)" },
    "18": { level: "Level 5", desc: "고급 문장 연습 (BTS 17~20)" },
    "19": { level: "Level 5", desc: "고급 문장 연습 (BTS 17~20)" },
    "20": { level: "Level 5", desc: "고급 문장 연습 (BTS 17~20)" },
    "21": { level: "Level 6", desc: "복합 문장 연습 (BTS 21~24)" },
    "22": { level: "Level 6", desc: "복합 문장 연습 (BTS 21~24)" },
    "23": { level: "Level 6", desc: "복합 문장 연습 (BTS 21~24)" },
    "24": { level: "Level 6", desc: "복합 문장 연습 (BTS 21~24)" },
    "25": { level: "Level 7", desc: "학술/전문 연습 (BTS 25~28)" },
    "26": { level: "Level 7", desc: "학술/전문 연습 (BTS 25~28)" },
    "27": { level: "Level 7", desc: "학술/전문 연습 (BTS 25~28)" },
    "28": { level: "Level 7", desc: "학술/전문 연습 (BTS 25~28)" },
    "29": { level: "Level 8", desc: "최상위 레벨 연습 (BTS 29~34)" },
    "30": { level: "Level 8", desc: "최상위 레벨 연습 (BTS 29~34)" },
    "31": { level: "Level 8", desc: "최상위 레벨 연습 (BTS 29~34)" },
    "32": { level: "Level 8", desc: "최상위 레벨 연습 (BTS 29~34)" },
    "33": { level: "Level 8", desc: "최상위 레벨 연습 (BTS 29~34)" },
    "34": { level: "Level 8", desc: "최상위 레벨 연습 (BTS 29~34)" },
    "35": { level: "Level 8", desc: "최상위 레벨 연습 (BTS 29~34)" }
  };

  function getBtsNum(v) { var m = v.match(/BTS\s*(\d+)/i); return m ? m[1] : null; }
  function isPhonics(v) { return v.toLowerCase().indexOf("phonics") >= 0; }

  // === 옵션 라벨에 Level 추가 ===
  function addLevelLabels() {
    var sel = document.getElementById("levelSelect");
    if (!sel) return;
    var opts = sel.querySelectorAll("option");
    for (var i = 0; i < opts.length; i++) {
      var o = opts[i], val = o.value, txt = o.textContent;
      if (txt.indexOf("Level") >= 0) continue;
      if (isPhonics(val)) {
        o.textContent = "[Level 0] " + txt;
      } else {
        var n = getBtsNum(val);
        if (n && LEVEL_LABELS[n]) o.textContent = "[" + LEVEL_LABELS[n].level + "] " + txt;
      }
    }
  }

  function showLevelInfo() {
    var sel = document.getElementById("levelSelect");
    var info = document.getElementById("levelInfo");
    if (!sel || !info) return;
    sel.addEventListener("change", function () {
      var val = sel.value, desc = "";
      if (isPhonics(val)) { desc = LEVEL_LABELS["phonics"].desc; }
      else { var n = getBtsNum(val); if (n && LEVEL_LABELS[n]) desc = LEVEL_LABELS[n].desc; }
      if (desc) { info.textContent = "📖 " + desc; info.style.color = "#4a90d9"; info.style.fontWeight = "600"; info.style.display = ""; }
    });
  }

  function updateOptgroupLabels() {
    var sel = document.getElementById("levelSelect");
    if (!sel) return;
    var ogs = sel.querySelectorAll("optgroup");
    for (var i = 0; i < ogs.length; i++) {
      if (ogs[i].label === "BTS") ogs[i].label = "BTS (Level 1~8)";
      else if (ogs[i].label === "Phonics") ogs[i].label = "Phonics (Level 0)";
    }
  }

  // === Category Menu UI ===
  var h2 = document.querySelector("section.practice h2");
  if (!h2) return;
  var span = h2.querySelector("span");
  h2.innerHTML = "";
  if (span) h2.appendChild(span);
  h2.appendChild(document.createTextNode(" 레벨 선택"));

  var selectEl = document.getElementById("levelSelect");
  var levelInfo = document.getElementById("levelInfo");
  if (!selectEl) return;
  var parentDiv = selectEl.parentElement;

  var btnContainer = document.createElement("div");
  btnContainer.id = "categoryBtns";
  btnContainer.style.cssText = "display:flex; gap:0.5rem; flex-wrap:wrap; justify-content:center; width:100%; max-width:560px;";

  // === v3: 중국어 카드 추가 (external: true → 외부 URL 로 이동) ===
  var CN_URL = "https://webrtc-unified-platform.navy111p.workers.dev/speech-coach-cn.html";
  var categories = [
    {id: "cat-phonics", label: "Phonics (Level 0)",    groups: ["Phonics", "Phonics (Level 0)"], color: "#10b981"},
    {id: "cat-bts",     label: "BTS (Level 1~8)",      groups: ["BTS", "BTS (Level 1~8)"],       color: "#e6a800"},
    {id: "cat-siu",     label: "SIU",                  groups: ["SIU Basic", "SIU Advance"],     color: "#6366f1"},
    {id: "cat-zh",      label: "🇨🇳 中文 (Lv 1~20)",   groups: [], color: "#dc2626", external: true, url: CN_URL, badge: "NEW"}
  ];

  function selectCategory(cat) {
    // 외부 링크 카드인 경우 그냥 이동
    if (cat.external && cat.url) {
      window.location.href = cat.url;
      return;
    }
    var btns = btnContainer.querySelectorAll("button");
    for (var b = 0; b < btns.length; b++) {
      var thisCat = categories[b];
      if (thisCat.id === cat.id) {
        btns[b].style.background = thisCat.color;
        btns[b].style.color = "white";
        btns[b].style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
        btns[b].setAttribute("data-active", "1");
      } else {
        btns[b].style.background = "white";
        btns[b].style.color = thisCat.color;
        btns[b].style.boxShadow = "none";
        btns[b].removeAttribute("data-active");
      }
    }
    var optgroups = selectEl.querySelectorAll("optgroup");
    for (var i = 0; i < optgroups.length; i++) {
      var show = false;
      for (var g = 0; g < cat.groups.length; g++) {
        if (optgroups[i].label === cat.groups[g]) { show = true; break; }
      }
      optgroups[i].style.display = show ? "" : "none";
    }
    selectEl.style.display = "";
    if (levelInfo) levelInfo.style.display = "";
    if (span) span.style.background = cat.color;
    selectEl.style.borderColor = cat.color.replace(")", ",0.3)").replace("rgb", "rgba");
    var visibleGroups = selectEl.querySelectorAll("optgroup");
    var firstOpt = null;
    for (var i = 0; i < visibleGroups.length; i++) {
      if (visibleGroups[i].style.display !== "none" && visibleGroups[i].options.length > 0) {
        firstOpt = visibleGroups[i].options[0]; break;
      }
    }
    if (firstOpt) {
      selectEl.value = firstOpt.value;
      if (typeof handleLevelChange === "function") handleLevelChange();
    }
  }

  for (var c = 0; c < categories.length; c++) {
    (function(cat) {
      var btn = document.createElement("button");
      btn.id = cat.id;
      btn.style.cssText = "position:relative; flex:1; min-width:80px; padding:0.75rem 1rem; border:2px solid " + cat.color + "; border-radius:1rem; font-size:1rem; font-weight:700; background:white; color:" + cat.color + "; cursor:pointer; transition:all 0.2s; font-family:Pretendard,Noto Sans KR,sans-serif;";
      // NEW 배지 (중국어 카드 등)
      if (cat.badge) {
        btn.innerHTML = '<span style="position:absolute;top:-7px;right:-7px;background:#fbbf24;color:#1a1a1a;font-size:9px;font-weight:900;padding:2px 6px;border-radius:99px;letter-spacing:0.4px;box-shadow:0 2px 6px rgba(251,191,36,0.45)">' + cat.badge + '</span>' + cat.label;
      } else {
        btn.textContent = cat.label;
      }
      btn.onmouseenter = function() { if (!this.getAttribute("data-active")) { this.style.background = cat.color; this.style.color = "white"; } };
      btn.onmouseleave = function() { if (!this.getAttribute("data-active")) { this.style.background = "white"; this.style.color = cat.color; } };
      btn.onclick = function() { selectCategory(cat); };
      btnContainer.appendChild(btn);
    })(categories[c]);
  }

  parentDiv.insertBefore(btnContainer, selectEl);
  selectEl.style.display = "none";
  if (levelInfo) levelInfo.style.display = "none";

  // Level 라벨 추가 (main.js가 옵션 생성한 뒤 실행)
  setTimeout(function () {
    addLevelLabels();
    updateOptgroupLabels();
    showLevelInfo();
  }, 200);

  // === v3: URL 쿼리 파라미터 자동 선택 ===
  // mangoiweb 에서 ?course=phonics / ?course=bts / ?course=siu / ?course=zh 로 들어오면
  // 해당 카테고리 자동 활성화 (중국어는 즉시 redirect)
  try {
    var params = new URLSearchParams(window.location.search);
    var course = (params.get("course") || "").toLowerCase();
    if (course) {
      var targetMap = { "phonics": "cat-phonics", "bts": "cat-bts", "siu": "cat-siu", "zh": "cat-zh", "chinese": "cat-zh", "cn": "cat-zh" };
      var targetId = targetMap[course];
      if (targetId) {
        setTimeout(function() {
          for (var i = 0; i < categories.length; i++) {
            if (categories[i].id === targetId) {
              selectCategory(categories[i]);
              break;
            }
          }
        }, 350);
      }
    }
  } catch(e) { console.warn("[category-ui v3] URL 쿼리 처리 실패:", e); }

})();
