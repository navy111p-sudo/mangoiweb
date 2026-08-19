// 「관리자 페이지 쉬운 사용법」 슬라이드를 만든다 — 1920×1080 그림 + PDF.
//   실행: PW_DIR=<playwright-core 위치> node tools/guide-shots/deck/build.mjs <ko|en> <그림폴더> <내보낼폴더>
//   예:  node tools/guide-shots/deck/build.mjs ko /tmp/shots-ko cloudflare-deploy/public/guide/admin-easy
//
// 왜 소스를 저장소에 두나 — 예전 데크는 그림 21장만 있고 «무엇으로 만들었는지» 가 없었다.
// 그래서 문구 한 줄을 고치려면 전부 다시 만들어야 했다. 이제 원고(slides.*.mjs)만 고치고 이걸 돌리면 된다.
import { loadPlaywright, findChromium } from '../../../test-harness/manual/_pw.mjs';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const LANG  = process.argv[2] === 'en' ? 'en' : 'ko';
const SHOTS = resolve(process.argv[3] || `/tmp/shots-${LANG}`);
const OUT   = resolve(process.argv[4] || `/tmp/deck-${LANG}`);
mkdirSync(OUT, { recursive: true });

const { meta, slides } = await import(pathToFileURL(join(import.meta.dirname, `slides.${LANG}.mjs`)).href);
const EN = LANG === 'en';
const L = {
  how:      EN ? 'Do this' : '이렇게 하세요',
  remember: EN ? 'Just remember this' : '이것만 기억하세요',
  tip:      EN ? 'Easy tip' : '쉬운 방법',
  page:     EN ? 'page' : '쪽',
  new:      EN ? 'NEW' : '새로 바뀜',
};

const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const pad = n => (n < 10 ? '0' : '') + n;

/** 그림을 data: 로 심는다 — PDF 인쇄에서 file:// 이미지가 빠지는 것을 막는다. */
function img(name){
  for (const ext of ['png','jpg','webp']) {
    const p = join(SHOTS, `${name}.${ext}`);
    if (existsSync(p)) return `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,` + readFileSync(p).toString('base64');
  }
  console.warn('  ⚠ 그림 없음:', name);
  return '';
}
const mango = 'data:image/png;base64,' + readFileSync(
  resolve(import.meta.dirname, '../../../cloudflare-deploy/public/img/mango-char.png')).toString('base64');

// 차례에 쓸 «번호 있는 장» 목록
const steps = slides.map((s, i) => ({ ...s, page: i + 1 })).filter(s => s.kind === 'step');
const extras = slides.map((s, i) => ({ ...s, page: i + 1 }))
  .filter(s => ['roles','whatsnew','faq','checklist'].includes(s.kind));

function chrome(s, i){
  return `<div class="hdr"><div class="hdr-l">🖥 ${esc(meta.header)}</div>`
       + `<div class="hdr-r">${esc(s.kind === 'step' ? `${L.page} ${i+1} / ${slides.length}` : (s.title || meta.title))}</div></div>`
       + `<div class="rule"></div>`;
}

function slideHTML(s, i){
  const K = s.kind;
  if (K === 'cover') return `<section class="slide cover">
    <div class="cov-panel">
      <div class="cov-chip">💻 ${EN ? 'EASY ADMIN GUIDE' : 'EASY ADMIN GUIDE'}</div>
      <div class="cov-brand">${esc(meta.brand)}</div>
      <h1 class="cov-h1">${esc(meta.title)}</h1>
      <div class="cov-sub">${esc(meta.sub)}</div>
      <div class="cov-foot">${esc(meta.cover)}   |   ${esc(meta.site)}</div>
      <img class="cov-mango" src="${mango}" alt="">
      <div class="cov-blob1"></div><div class="cov-blob2"></div>
    </div></section>`;

  if (K === 'intro') return `<section class="slide">${chrome(s,i)}<div class="body">
    ${titleRow(s)}
    <div class="lead">${esc(s.lead)}</div>
    <div class="grid2 g-intro">${s.points.map(([h,b]) => `
      <div class="pcard"><div class="pcard-h">${esc(h)}</div><div class="pcard-b">${esc(b)}</div></div>`).join('')}</div>
    ${tip(s)}</div></section>`;

  if (K === 'toc') return `<section class="slide">${chrome(s,i)}<div class="body">
    ${titleRow(s)}
    <div class="grid2 g-toc">
      <div class="toc-col">${steps.slice(0, Math.ceil(steps.length/2)).map(tocRow).join('')}</div>
      <div class="toc-col">${steps.slice(Math.ceil(steps.length/2)).map(tocRow).join('')}
        ${extras.map(x => `<div class="toc-row"><span class="toc-n toc-n-x">·</span><span class="toc-t">${esc(x.title)}</span><span class="toc-p">${x.page}</span></div>`).join('')}
      </div>
    </div></div></section>`;

  if (K === 'step') return `<section class="slide">${chrome(s,i)}<div class="body">
    ${titleRow(s)}
    <div class="lead">${esc(s.lead)}</div>
    <div class="cols${s.mode === 'tall' ? ' tall' : ''}">
      <div class="left">
        <div class="h3">✔ ${esc(L.how)}</div>
        <ol class="steps">${s.steps.map(t => `<li>${esc(t)}</li>`).join('')}</ol>
        <div class="rem"><div class="rem-h">🔖 ${esc(L.remember)}</div>
          <ul>${s.remember.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>
      </div>
      <div class="right"><div class="shot ${s.mode === 'cover' ? 'fill' : 'fit'}">
        <img src="${img(s.shot)}" alt=""></div></div>
    </div>
    ${tip(s)}</div></section>`;

  if (K === 'roles') return `<section class="slide">${chrome(s,i)}<div class="body">
    ${titleRow(s)}
    <div class="lead">${esc(s.lead)}</div>
    <div class="roles">${s.rows.map(([a,b]) => `
      <div class="role"><div class="role-a">${esc(a)}</div><div class="role-b">${esc(b)}</div></div>`).join('')}</div>
    <div class="rem wide"><ul>${s.notes.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>
    </div></section>`;

  if (K === 'whatsnew') return `<section class="slide">${chrome(s,i)}<div class="body">
    ${titleRow({ ...s, subtitle: s.when })}
    <div class="grid2 g-new">${s.items.map(([h,b], k) => `
      <div class="ncard"><div class="ncard-n">${k+1}</div>
        <div><div class="ncard-h">${esc(h)}</div><div class="ncard-b">${esc(b)}</div></div></div>`).join('')}</div>
    </div></section>`;

  if (K === 'faq') return `<section class="slide">${chrome(s,i)}<div class="body">
    ${titleRow(s)}
    <div class="grid2 g-faq">${s.qa.map(([q,a]) => `
      <div class="qa"><div class="q">Q. ${esc(q)}</div><div class="a">A. ${esc(a)}</div></div>`).join('')}</div>
    </div></section>`;

  if (K === 'checklist') return `<section class="slide">${chrome(s,i)}<div class="body">
    ${titleRow(s)}
    <div class="lead">${esc(s.lead)}</div>
    <div class="grid2 g-chk">${s.items.map(t => `
      <div class="chk"><span class="box"></span><span>${esc(t)}</span></div>`).join('')}</div>
    </div></section>`;

  if (K === 'end') return `<section class="slide end">
    <div class="end-wrap">
      <div class="end-ico">${s.icon}</div>
      <h1 class="end-h1">${esc(s.title)}</h1>
      <div class="end-lines">${s.lines.map((t,k) => `<div class="${k===0?'end-l0':'end-l'}">${esc(t)}</div>`).join('')}</div>
      <div class="end-foot">${esc(s.foot)}</div>
      <img class="end-mango" src="${mango}" alt="">
    </div></section>`;
  return '';
}

const tocRow = s => `<div class="toc-row"><span class="toc-n">${pad(s.n)}</span>`
  + `<span class="toc-t">${esc(s.title)}</span><span class="toc-p">${s.page}</span></div>`;

const titleRow = s => `<div class="ttl-row">
  <div class="num">${s.n != null ? pad(s.n) : (s.icon || '•')}</div>
  <div class="ttl-txt"><h1>${s.n != null ? (s.icon + ' ') : ''}${esc(s.title)}</h1>
    ${s.subtitle ? `<div class="sub">${esc(s.subtitle)}</div>` : ''}</div>
  ${s.badge ? `<div class="nbadge">${esc(s.badge)}</div>` : ''}</div>`;

const tip = s => s.tip ? `<div class="tipbar">💡 <b>${esc(L.tip)}</b> · ${esc(s.tip)}</div>` : '';

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#e5e9f0}
body{font-family:'Pretendard','Noto Sans KR',system-ui,sans-serif;color:#0f172a;-webkit-font-smoothing:antialiased}
.slide{width:1920px;height:1080px;background:#fff;position:relative;overflow:hidden;page-break-after:always;break-after:page}
.hdr{height:80px;background:#1f5fe0;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 46px}
.hdr-l{font-size:30px;font-weight:800;letter-spacing:-.3px}
.hdr-r{font-size:22px;font-weight:700;opacity:.95}
.rule{height:7px;background:#f59e0b}
.body{height:calc(1080px - 87px);padding:30px 48px 26px;display:flex;flex-direction:column}
.ttl-row{display:flex;align-items:center;gap:26px}
.num{width:96px;height:96px;flex:0 0 96px;border-radius:20px;background:#1f5fe0;color:#fff;
     display:flex;align-items:center;justify-content:center;font-size:42px;font-weight:900;letter-spacing:-1px}
.ttl-txt h1{font-size:50px;font-weight:900;letter-spacing:-1.2px;line-height:1.1}
.ttl-txt .sub{font-size:23px;color:#64748b;margin-top:8px;font-weight:600}
.nbadge{margin-left:auto;background:#fef3c7;border:2px solid #f59e0b;color:#b45309;
        font-size:22px;font-weight:900;padding:10px 20px;border-radius:999px}
.lead{margin-top:20px;background:#eef4ff;border:2px solid #d3e2ff;border-radius:16px;
      padding:20px 26px;font-size:25px;line-height:1.5;font-weight:600;color:#12336e}
.cols{display:grid;grid-template-columns:700px 1fr;gap:36px;margin-top:22px;flex:1;min-height:0}
.cols.tall{grid-template-columns:1fr 470px}
.left{display:flex;flex-direction:column;min-height:0}
.h3{font-size:27px;font-weight:900;color:#1f5fe0;margin-bottom:14px}
.steps{list-style:none;counter-reset:s}
.steps li{counter-increment:s;position:relative;padding-left:46px;font-size:23.5px;line-height:1.45;
          margin-bottom:13px;font-weight:500}
.steps li::before{content:counter(s);position:absolute;left:0;top:1px;width:32px;height:32px;border-radius:50%;
  background:#1f5fe0;color:#fff;font-size:18px;font-weight:800;display:flex;align-items:center;justify-content:center}
.rem{margin-top:auto;border:2px solid #cfe0ff;background:#f8fbff;border-radius:16px;padding:16px 22px}
.rem.wide{margin-top:24px;margin-bottom:4px}
.rem-h{font-size:23px;font-weight:900;color:#1f5fe0;margin-bottom:9px}
.rem ul{list-style:none}
.rem li{position:relative;padding-left:22px;font-size:21px;line-height:1.42;margin-bottom:7px;color:#233category}
.rem li{color:#1e293b}
.rem li::before{content:'•';position:absolute;left:4px;color:#1f5fe0;font-weight:900}
.right{min-width:0;min-height:0}
.shot{width:100%;height:100%;border:2px solid #dbe3ef;border-radius:18px;overflow:hidden;
      box-shadow:0 14px 34px rgba(15,23,42,.13);background:#f8fafc}
.shot img{width:100%;height:100%;display:block}
.shot.fill img{object-fit:cover;object-position:left top}
.shot.fit img{object-fit:contain;object-position:center}
.cols.tall .shot img{object-fit:cover;object-position:top center}
.tipbar{margin-top:20px;background:#fffbeb;border:2px solid #fcd34d;border-radius:14px;
        padding:15px 24px;font-size:22px;font-weight:600;color:#78350f}

/* 표지 */
.cover{display:flex;align-items:center;justify-content:center;background:#fff;padding:44px}
.cov-panel{position:relative;width:100%;height:100%;background:#1f5fe0;border-radius:26px;overflow:hidden;
           padding:96px 92px;color:#fff}
.cov-chip{display:inline-block;background:#fff;color:#1f5fe0;font-size:26px;font-weight:900;
          padding:14px 30px;border-radius:12px}
.cov-brand{margin-top:64px;font-size:32px;font-weight:800;opacity:.95}
.cov-h1{margin-top:16px;font-size:104px;font-weight:900;letter-spacing:-3px;line-height:1.05}
.cov-sub{margin-top:44px;font-size:38px;font-weight:600;opacity:.96}
.cov-foot{position:absolute;left:92px;bottom:82px;font-size:24px;opacity:.85;font-weight:600}
.cov-mango{position:absolute;right:96px;bottom:96px;width:520px;filter:drop-shadow(0 18px 32px rgba(0,0,0,.28))}
.cov-blob1{position:absolute;right:-120px;top:-160px;width:520px;height:520px;border-radius:50%;background:#3b82f6;opacity:.55}
.cov-blob2{position:absolute;left:-140px;bottom:-190px;width:460px;height:460px;border-radius:50%;background:#38bdf8;opacity:.35}

/* 차례 */
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:26px 56px}
.g-toc{margin-top:34px;align-content:start;flex:1}
.toc-col{display:flex;flex-direction:column;gap:11px}
.toc-row{display:flex;align-items:center;gap:18px;border-bottom:1.5px dashed #e2e8f0;padding-bottom:9px}
.toc-n{width:60px;flex:0 0 60px;text-align:center;background:#1f5fe0;color:#fff;border-radius:9px;
       font-size:20px;font-weight:900;padding:6px 0}
.toc-n-x{background:#94a3b8}
.toc-t{font-size:25px;font-weight:700;flex:1}
.toc-p{font-size:22px;font-weight:800;color:#1f5fe0}

/* 소개 카드 */
.g-intro{margin-top:26px;flex:1;align-content:center}
.pcard{background:#f8fbff;border:2px solid #d9e6ff;border-radius:18px;padding:26px 30px}
.pcard-h{font-size:28px;font-weight:900;color:#1f5fe0;margin-bottom:12px}
.pcard-b{font-size:23px;line-height:1.5;color:#1e293b;font-weight:500}

/* 역할 */
.roles{margin-top:26px;display:flex;flex-direction:column;gap:22px;flex:1;justify-content:center}
.role{display:flex;align-items:center;gap:30px;background:#f8fbff;border:2px solid #d9e6ff;
      border-radius:16px;padding:28px 34px}
.role-a{flex:0 0 330px;font-size:31px;font-weight:900;color:#12336e}
.role-b{font-size:24px;font-weight:500;color:#1e293b}

/* 새로 바뀐 것 */
.g-new{margin-top:26px;gap:22px 44px;align-content:center;flex:1}
.ncard{display:flex;gap:20px;align-items:flex-start;background:#fff;border:2px solid #e2e8f0;
       border-radius:16px;padding:18px 24px}
.ncard-n{flex:0 0 44px;width:44px;height:44px;border-radius:50%;background:#f59e0b;color:#fff;
         font-size:22px;font-weight:900;display:flex;align-items:center;justify-content:center}
.ncard-h{font-size:25.5px;font-weight:900;color:#12336e;line-height:1.25}
.ncard-b{font-size:21.5px;color:#475569;margin-top:6px;font-weight:500;line-height:1.4}

/* FAQ */
.g-faq{margin-top:30px;gap:24px 44px;align-content:center;flex:1}
.qa{background:#f8fbff;border:2px solid #d9e6ff;border-radius:16px;padding:20px 26px}
.q{font-size:25px;font-weight:900;color:#12336e;line-height:1.3}
.a{font-size:22.5px;color:#334155;margin-top:9px;line-height:1.45;font-weight:500}

/* 체크리스트 */
.g-chk{margin-top:28px;gap:22px 56px;align-content:center;flex:1}
.chk{display:flex;align-items:center;gap:18px;font-size:27px;font-weight:600;
     border-bottom:1.5px dashed #e2e8f0;padding-bottom:14px}
.box{width:32px;height:32px;flex:0 0 32px;border:3px solid #1f5fe0;border-radius:8px}

/* 마무리 */
.end{display:flex;align-items:center;justify-content:center;background:#1f5fe0;color:#fff}
.end-wrap{text-align:center;position:relative;width:100%;padding:0 120px}
.end-ico{font-size:96px}
.end-h1{font-size:88px;font-weight:900;letter-spacing:-2px;margin-top:10px}
.end-lines{margin-top:52px;display:inline-block;text-align:left}
.end-l0{font-size:34px;font-weight:700;margin-bottom:22px;opacity:.95}
.end-l{font-size:36px;font-weight:800;margin-bottom:16px}
.end-foot{margin-top:56px;font-size:26px;opacity:.9;font-weight:600}
.end-mango{position:absolute;right:40px;bottom:-40px;width:300px;opacity:.95}
@page{size:1920px 1080px;margin:0}
`;

const html = `<!doctype html><html lang="${LANG}"><head><meta charset="utf-8">
<title>${esc(meta.title)}</title><style>${CSS}</style></head><body>
${slides.map(slideHTML).join('\n')}
</body></html>`;

const htmlPath = join(OUT, `_deck.${LANG}.html`);
writeFileSync(htmlPath, html);

const pw = loadPlaywright(); const exe = findChromium();
if (!pw || !exe) { console.log('⏭  건너뜀 — playwright/chromium 없음'); process.exit(0); }
const browser = await pw.chromium.launch({ executablePath: exe, args:['--no-sandbox','--font-render-hinting=none'] });
const page = await browser.newPage({ viewport:{ width:1920, height:1080 }, deviceScaleFactor:1 });
await page.goto(pathToFileURL(htmlPath).href, { waitUntil:'load' });
await page.waitForTimeout(1500);

const els = await page.$$('.slide');
console.log(`▶ ${LANG} — 슬라이드 ${els.length}장`);
for (let k = 0; k < els.length; k++) {
  const png = await els[k].screenshot({ type:'png' });
  writeFileSync(join(OUT, `${pad(k+1)}.png`), png);
}
// jpg / webp 는 브라우저 캔버스로 인코딩한다 (컨테이너에 cwebp 가 없다)
for (let k = 0; k < els.length; k++) {
  const b64 = readFileSync(join(OUT, `${pad(k+1)}.png`)).toString('base64');
  const out = await page.evaluate(async (src) => {
    const im = new Image(); im.src = src; await im.decode();
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
    c.getContext('2d').drawImage(im, 0, 0);
    return { jpg: c.toDataURL('image/jpeg', 0.92), webp: c.toDataURL('image/webp', 0.86) };
  }, 'data:image/png;base64,' + b64);
  writeFileSync(join(OUT, `${pad(k+1)}.jpg`),  Buffer.from(out.jpg.split(',')[1],  'base64'));
  writeFileSync(join(OUT, `${pad(k+1)}.webp`), Buffer.from(out.webp.split(',')[1], 'base64'));
}
await browser.close();

// PDF·PPTX 는 JPEG 를 묶어서 만든다 (page.pdf() 는 PNG 를 심어 두 배로 커진다)
const pdfName = EN ? 'admin-easy-en.pdf' : 'admin-easy.pdf';
const pptName = EN ? 'admin-easy-en.pptx' : 'admin-easy-kr.pptx';
const here = import.meta.dirname;
execFileSync('python3', [join(here, 'topdf.py'), OUT, join(OUT, pdfName)], { stdio:'inherit' });
execFileSync('python3', [join(here, 'topptx.py'), OUT, join(OUT, pptName), meta.title], { stdio:'inherit' });
console.log('✅ 끝 →', OUT);
