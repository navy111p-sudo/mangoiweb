/* =========================================================
   Word 변환용 HTML 정리 함수 / HTML cleaners for Word export
   각 함수는 브라우저 안(page.evaluate)에서 실행되어 화면 전용 요소를 걷어 내고
   pandoc 이 읽기 좋은 HTML 을 돌려줍니다.
   ========================================================= */
"use strict";

/* 두 페이지가 함께 쓰는 정리 단계 (브라우저 안에 문자열로 주입해 window.__commonCleanup 으로 부름) */
function commonCleanup(main, lang) {
  const other = lang === "ko" ? "en" : "ko";
  main.querySelectorAll(`[data-export="skip"], .${other}, svg`).forEach((el) => el.remove());

  // 추가 기능(접이식) → 소제목 + "이름 : 설명" 목록
  const text = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");
  main.querySelectorAll("details.more").forEach((d) => {
    const items = Array.from(d.querySelectorAll(".more__list li"))
      .map((li) => `<li><b>${text(li.querySelector("b"))}</b> : ${text(li.querySelector("p"))}</li>`).join("");
    const box = document.createElement("div");
    box.innerHTML = `<h3>${text(d.querySelector("summary"))}</h3><ul>${items}</ul>`;
    d.replaceWith(box);
  });
}

/* 그림을 PNG data URL 로 바꿈 (Word 는 webp 를 못 읽음) — 살아 있는 화면에서 한 번 */
async function imagesToPng({ maxSide }) {
  const imgs = Array.from(document.querySelectorAll("main img"));
  for (const img of imgs) {
    try {
      if (!img.complete) await img.decode();
      const w = img.naturalWidth, h = img.naturalHeight;
      if (!w || !h) continue;
      const k = Math.min(1, maxSide / Math.max(w, h));
      const c = document.createElement("canvas");
      c.width = Math.round(w * k); c.height = Math.round(h * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      img.src = c.toDataURL("image/png");
    } catch (e) { /* 못 바꾸면 그대로 둔다 — pandoc 이 건너뜀 */ }
  }
}

/* ---------- 자세한 판 (ai-speaking-guide-full.html) ---------- */
function exportGuide({ lang, annotatedShot, footerText }) {
  const main = document.querySelector("main").cloneNode(true);
  window.__commonCleanup(main, lang);

  // 번호가 찍힌 화면 캡처로 교체
  main.querySelectorAll(".shot__frame").forEach((frame) => {
    const img = document.createElement("img");
    img.src = annotatedShot;
    img.setAttribute("width", "100%");
    frame.replaceWith(img);
  });
  main.querySelectorAll(".mode__art img").forEach((img) => img.setAttribute("width", "90"));

  // 붙어서 출력되는 항목에 구분 기호 넣기
  const joinText = (el, sep) =>
    Array.from(el.children).map((c) => c.textContent.trim()).filter(Boolean).join(sep);
  main.querySelectorAll(".opts").forEach((el) => (el.textContent = joinText(el, " / ")));
  main.querySelectorAll(".legend b, .tip > b").forEach((b) => b.after(document.createTextNode(" : ")));
  main.querySelectorAll(".routine__step").forEach((li) => (li.textContent = joinText(li, " · ")));

  // Q&A: 접힘 상자 → 질문 제목 + 답변
  main.querySelectorAll(".qna details").forEach((d) => {
    const q = document.createElement("h3");
    q.textContent = "Q. " + d.querySelector("summary").textContent.trim();
    const a = document.createElement("p");
    a.textContent = "A. " + d.querySelector("p").textContent.trim();
    d.replaceWith(q, a);
  });

  return { body: main.innerHTML + `<hr><p>${footerText}</p>` };
}

/* ---------- 한 장 판 (ai-speaking-guide.html) ---------- */
function exportOnePage({ lang }) {
  const main = document.querySelector("main").cloneNode(true);
  window.__commonCleanup(main, lang);
  const text = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");
  const make = (html) => {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  };

  // 단계 번호: "1준비해요" → "1. 준비해요"
  main.querySelectorAll(".num").forEach((n) => {
    n.replaceWith(document.createTextNode(n.classList.contains("num--q") ? "" : n.textContent + ". "));
  });

  // 행성 3개 → 3칸 표
  main.querySelectorAll(".planets").forEach((ul) => {
    const cells = Array.from(ul.children).map((li) => {
      const img = li.querySelector("img");
      return `<td><img src="${img.getAttribute("src")}" width="48"><p><b>${text(li.querySelector("h3"))}</b></p>` +
        `<p>${text(li.querySelector("p"))}</p><p>[ ${text(li.querySelector(".chip"))} ]</p></td>`;
    });
    ul.replaceWith(make(`<table><tbody><tr>${cells.join("")}</tr></tbody></table>`));
  });

  // 설정 3칸 → 제목 줄 + 내용 줄 표
  main.querySelectorAll(".set").forEach((dl) => {
    const items = Array.from(dl.children);
    const head = items.map((d) => `<th>${text(d.querySelector("dt"))}</th>`).join("");
    const body = items.map((d) => {
      const fix = d.querySelector(".fix");
      const value = fix
        ? Array.from(fix.children).map((s) => `<p>${text(s)}</p>`).join("")
        : `<p>${text(d.querySelector("dd"))}</p>`;
      return `<td>${value}</td>`;
    }).join("");
    dl.replaceWith(make(`<table><thead><tr>${head}</tr></thead><tbody><tr>${body}</tr></tbody></table>`));
  });

  // Q&A → "Q. 질문 → 답" 한 줄씩
  main.querySelectorAll(".faq details").forEach((d) => {
    d.replaceWith(make(`<p><b>Q. ${text(d.querySelector("summary"))}</b> → ${text(d.querySelector("p"))}</p>`));
  });

  // 굵은 이름표 뒤 구분 기호
  main.querySelectorAll(".say-tip > b, .sheet__foot b").forEach((b) => b.after(document.createTextNode(" : ")));

  return { body: main.innerHTML };
}

module.exports = { commonCleanup, imagesToPng, exportGuide, exportOnePage };
