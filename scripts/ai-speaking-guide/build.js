/* =========================================================
   AI 말하기 사용 안내서 — PDF·Word 만들기 / Build PDF + Word
   원본: cloudflare-deploy/public/ai-speaking-guide.html (한 장) · ai-speaking-guide-full.html (자세한 판)
   결과: cloudflare-deploy/public/guide/ai-speaking/AI-Speaking-{OnePage,Guide}_{KO,EN}.{pdf,docx}

   실행 / Run (리포 루트):  node scripts/ai-speaking-guide/build.js
   필요 / Needs: playwright(chromium), pandoc, python3 + python-docx,
                 한글 글꼴 하나(IBM Plex Sans KR 또는 맑은 고딕 등 — 없으면 PDF 글자가 깨짐)
   ⚠️ 한 장 판 PDF 가 1쪽을 넘으면 실패합니다(글자를 늘렸으면 줄이세요).
   ⚠️ 페이지가 /img·/css 같은 «사이트 절대 경로» 를 쓰므로 file:// 이 아니라 작은 로컬 서버로 엽니다.
   ========================================================= */
"use strict";

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { chromium } = require("playwright");
const { commonCleanup, imagesToPng, exportGuide, exportOnePage } = require("./exporters");

const REPO = path.resolve(__dirname, "..", "..");
const PUBLIC = path.join(REPO, "cloudflare-deploy", "public");
const OUT = path.join(PUBLIC, "guide", "ai-speaking");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "aisg-"));

const LANGS = ["ko", "en"];
const FOOTNOTE = {
  ko: "2026년 11월 기준 · 화면은 업데이트에 따라 조금 달라질 수 있어요.",
  en: "As of November 2026 · Screens may change slightly with updates.",
};

/* 페이지별 설정 */
const PAGES = [
  {
    html: "ai-speaking-guide-full.html",
    fileBase: "AI-Speaking-Guide",
    exporter: exportGuide,
    docxProfile: "standard",
    pdf: { margin: { top: "14mm", bottom: "16mm", left: "14mm", right: "14mm" }, pageNumbers: true },
  },
  {
    html: "ai-speaking-guide.html",
    fileBase: "AI-Speaking-OnePage",
    exporter: exportOnePage,
    docxProfile: "compact",
    pdf: { margin: { top: "9mm", bottom: "9mm", left: "9mm", right: "9mm" }, pageNumbers: false, maxPages: 1 },
  },
];

const outFile = (page, lang, ext) => path.join(OUT, `${page.fileBase}_${lang.toUpperCase()}.${ext}`);

/* ---------- public 폴더를 내보내는 작은 서버 ---------- */
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript",
  ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".jpg": "image/jpeg" };
function startServer() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]);
    const file = path.join(PUBLIC, rel);
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end(); return;
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

/* PDF 쪽수 세기 (Chromium PDF 의 /Type /Page 개수) */
function countPdfPages(file) {
  const m = fs.readFileSync(file, "latin1").match(/\/Type\s*\/Page(?![s\w])/g);
  return m ? m.length : 0;
}

/* ---------- PDF ---------- */
async function buildPdf(tab, page, lang) {
  await tab.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
  const title = (await tab.title()).replace(/ — .*$/, "");
  const file = outFile(page, lang, "pdf");
  await tab.pdf({
    path: file,
    format: "A4",
    printBackground: true,
    margin: page.pdf.margin,
    displayHeaderFooter: page.pdf.pageNumbers,
    headerTemplate: "<span></span>",
    footerTemplate:
      `<div style="width:100%;text-align:center;font-size:8px;color:#565d80;font-family:'IBM Plex Sans KR',sans-serif;">` +
      `${title} · <span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
  });
  const pages = countPdfPages(file);
  if (page.pdf.maxPages && pages > page.pdf.maxPages) {
    throw new Error(`${path.basename(file)}: ${pages}쪽 (최대 ${page.pdf.maxPages}쪽을 넘었어요)`);
  }
  return pages;
}

/* ---------- Word ---------- */
async function buildDocx(tab, page, lang) {
  const args = { lang, footerText: FOOTNOTE[lang], annotatedShot: null };
  if (await tab.locator(".shot__frame").count()) {
    args.annotatedShot = path.join(TMP, "screen-annotated.png");
    await tab.locator(".shot__frame").screenshot({ path: args.annotatedShot, scale: "css" }); // 1배 — Word 파일이 커지지 않게
  }
  await tab.evaluate(imagesToPng, { maxSide: 320 });
  await tab.evaluate(`window.__commonCleanup = ${commonCleanup.toString()}`);
  let { body } = await tab.evaluate(page.exporter, args);

  // data URL 그림 → 임시 PNG 파일 (pandoc 이 파일로 읽게)
  let n = 0;
  body = body.replace(/src="data:image\/png;base64,([^"]+)"/g, (_, b64) => {
    const f = path.join(TMP, `img-${lang}-${n++}.png`);
    fs.writeFileSync(f, Buffer.from(b64, "base64"));
    return `src="${f}"`;
  });

  // <title> 은 넣지 않음: pandoc 이 Word 제목으로 한 번 더 넣는 것을 방지
  const exportFile = path.join(TMP, `${page.fileBase}_${lang}.html`);
  fs.writeFileSync(exportFile, `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"></head><body>${body}</body></html>`, "utf8");
  execFileSync("pandoc", [
    exportFile, "-f", "html",
    "-o", outFile(page, lang, "docx"),
    "--reference-doc", path.join(TMP, `reference-${page.docxProfile}.docx`),
  ], { stdio: ["ignore", "inherit", "ignore"] });
}

/* ---------- 실행 ---------- */
async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  for (const profile of new Set(PAGES.map((p) => p.docxProfile))) {
    execFileSync("python3", [path.join(__dirname, "make_reference_docx.py"), path.join(TMP, `reference-${profile}.docx`), profile], { stdio: "inherit" });
  }
  const server = await startServer();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1000, height: 1200 }, deviceScaleFactor: 2 });
    for (const page of PAGES) {
      for (const lang of LANGS) {
        const tab = await context.newPage();
        await tab.goto(`${origin}/${page.html}?lang=${lang}`, { waitUntil: "load" });
        await tab.evaluate(() => document.fonts.ready);
        // ⚠️ PDF 먼저 — buildDocx 가 Word 용으로 탭 안 그림을 320px 로 줄이므로, 뒤에 찍으면 PDF 그림이 흐려진다
        const pages = await buildPdf(tab, page, lang);
        await buildDocx(tab, page, lang);
        await tab.close();
        console.log(`✔ ${page.fileBase}_${lang.toUpperCase()}  PDF ${pages}쪽 + Word`);
      }
    }
  } finally {
    await browser.close();
    server.close();
    fs.rmSync(TMP, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error("✘ 빌드 실패 / Build failed:", err.message);
  process.exit(1);
});
