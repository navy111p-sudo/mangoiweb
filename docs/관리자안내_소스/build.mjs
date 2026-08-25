/* ═══════════════════════════════════════════════════════════════════════════
 * build.mjs — slides.mjs 의 글 + .shots/ 의 화면 그림 → 21장짜리 안내 그림
 *
 *   내보내는 곳: cloudflare-deploy/public/guide/admin-easy/
 *     01.jpg … 21.jpg   (되돌림용 — 옛 브라우저)
 *     01.webp … 21.webp (실제로 화면에 나가는 것, 용량 1/3)
 *     admin-easy.pdf    («저장» 버튼이 내려 주는 파일)
 *
 *   쓰는 법은 같은 폴더 README.md 를 보세요.
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SLIDES, DECK_TITLE } from './slides.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const OUT  = path.join(ROOT, 'cloudflare-deploy/public/guide/admin-easy');
const SHOTS= path.join(HERE, '.shots');
const TMP  = path.join(HERE, '.build');
const W = 1920, H = 1080;

/* 한글 글꼴 — 저장소에 넣지 않습니다(10MB). README ① 단계로 받아 둡니다. */
const FONTDIR = process.env.FONT_DIR || path.join(HERE, 'fonts/package/files');
for (const w of ['400','700','800']) {
  const f = path.join(FONTDIR, `noto-sans-kr-korean-${w}-normal.woff2`);
  if (!fs.existsSync(f)) { console.error('✖ 한글 글꼴이 없습니다:', f, '\n  README ① 단계를 먼저 하세요.'); process.exit(1); }
}
const font = w => 'file://' + path.join(FONTDIR, `noto-sans-kr-korean-${w}-normal.woff2`);

const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

/* ── 스타일 ───────────────────────────────────────────────────────────────
   ⚠️ 글씨는 크게. 사장님·직원이 **휴대폰 화면**으로 보십니다(가로 1920 을 손바닥에).
      작게 만들면 «읽을 수 없는 안내문» 이 됩니다. */
const CSS = `
@font-face{font-family:NSK;src:url('${font('400')}') format('woff2');font-weight:400;font-display:block}
@font-face{font-family:NSK;src:url('${font('700')}') format('woff2');font-weight:700;font-display:block}
@font-face{font-family:NSK;src:url('${font('800')}') format('woff2');font-weight:800;font-display:block}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden}
body{font-family:NSK,'Liberation Sans',sans-serif;color:#16202b;background:#fff;
     -webkit-font-smoothing:antialiased}
.hdr{height:78px;background:#1f5fe0;color:#fff;display:flex;align-items:center;
     justify-content:space-between;padding:0 44px;font-weight:700;font-size:25px}
.hdr .r{font-size:23px;opacity:.92}
.rule{height:7px;background:#f59e0b}
.body{padding:34px 56px 0;height:${H-85}px;display:flex;flex-direction:column}

/* 제목 줄 */
.thead{display:flex;align-items:center;gap:24px;margin-bottom:18px}
.badge{width:96px;height:96px;border-radius:22px;background:#1f5fe0;color:#fff;
       font-size:40px;font-weight:800;display:flex;align-items:center;justify-content:center;flex:0 0 auto}
.thead h1{font-size:50px;font-weight:800;letter-spacing:-1px;line-height:1.1}
.thead .sub{font-size:26px;color:#6b7a8c;margin-top:8px;font-weight:400}

/* 한 줄 설명 */
.lead{background:#eef4ff;border-radius:18px;padding:20px 28px;font-size:27px;line-height:1.5;color:#22314a}

/* 본문 2단 */
.cols{display:flex;gap:34px;flex:1;min-height:0;margin-top:22px}
.left{width:46%;display:flex;flex-direction:column;min-width:0}
.right{flex:1;min-width:0;display:flex;align-items:flex-start;justify-content:center}
.right{align-items:center}
.frame{width:100%;height:548px;border:3px solid #dbe6f5;border-radius:20px;overflow:hidden;background:#f7fafd;
       box-shadow:0 12px 34px rgba(22,40,80,.16)}
.frame img{display:block;width:100%;height:100%;object-fit:contain;object-position:center}

/* 순서 */
.steps{list-style:none;display:flex;flex-direction:column;gap:14px}
.steps li{display:flex;gap:16px;align-items:flex-start;font-size:28px;line-height:1.38}
.steps .no{flex:0 0 auto;width:42px;height:42px;border-radius:50%;background:#1f5fe0;color:#fff;
           font-size:22px;font-weight:800;display:flex;align-items:center;justify-content:center;margin-top:2px}
.h3{font-size:27px;font-weight:800;color:#1f5fe0;margin:0 0 14px}

/* 기억할 것 */
.rem{margin-top:auto;background:#f6f9ff;border:2px solid #d7e5fb;border-radius:18px;padding:18px 24px}
.rem b{display:block;font-size:24px;color:#1f5fe0;margin-bottom:10px}
.rem li{list-style:none;font-size:23px;line-height:1.45;color:#3b4a5c;padding-left:20px;position:relative;margin:7px 0}
.rem li:before{content:'';position:absolute;left:2px;top:13px;width:9px;height:9px;border-radius:50%;background:#93b4ea}

/* 맨 아래 띠 */
.strip{display:flex;gap:20px;margin:20px 0 0;padding-bottom:26px}
.note{flex:1;border-radius:16px;padding:16px 24px;font-size:23px;line-height:1.4}
.note b{font-weight:800}
.tip{background:#fff8e8;border:2px solid #f3d089;color:#6b4d0d}
.warn{background:#fff1f1;border:2px solid #f2b5b5;color:#8a2020}

/* 표지 / 끝 */
.cover{height:${H}px;background:#1f5fe0;color:#fff;padding:96px 110px;display:flex;
       flex-direction:column;justify-content:center;position:relative;overflow:hidden}
.cover .bub{position:absolute;border-radius:50%;background:rgba(255,255,255,.10)}
.cover .chip{display:inline-block;background:#fff;color:#1f5fe0;font-size:22px;font-weight:800;
             padding:10px 22px;border-radius:999px;letter-spacing:2px;align-self:flex-start}
.cover .eyebrow{font-size:26px;opacity:.9;margin:32px 0 10px;font-weight:700;letter-spacing:1px}
.cover h1{font-size:104px;font-weight:800;letter-spacing:-3px;line-height:1.06}
.cover p{font-size:34px;margin-top:26px;opacity:.96;line-height:1.45}
.cover .foot{position:absolute;left:110px;bottom:74px;font-size:24px;opacity:.86}

/* 소개 */
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:18px 24px;margin-top:24px}
.gcard{border:2px solid #dfe9f8;border-radius:18px;padding:20px 26px;background:#fff}
.gcard b{display:block;font-size:29px;font-weight:800;margin-bottom:8px}
.gcard span{font-size:23px;color:#5b6b7c;line-height:1.4}

/* 차례 */
.toc{display:grid;grid-template-columns:1fr 1fr;gap:0 72px;margin-top:26px;align-items:start}
.toc .col{display:flex;flex-direction:column;align-items:stretch;gap:12px}
.toc .col > div{display:flex;align-items:center;gap:18px;font-size:27px;padding:9px 0;border-bottom:1px dashed #e2eaf5}
.toc .n{width:56px;height:38px;border-radius:10px;background:#1f5fe0;color:#fff;font-size:20px;font-weight:800;
        display:flex;align-items:center;justify-content:center;flex:0 0 auto}
.toc .p{margin-left:auto;font-weight:800;color:#1f5fe0;font-size:24px}

/* 표 */
table{width:100%;border-collapse:collapse;margin-top:22px;font-size:27px}
th{background:#1f5fe0;color:#fff;text-align:left;padding:16px 22px;font-size:25px}
td{border-bottom:2px solid #e8eef7;padding:17px 22px;vertical-align:middle}
tr:nth-child(even) td{background:#f7fafd}
td.k{font-weight:800;width:24%}
td.d{color:#5b6b7c;width:32%;font-size:24px}

/* 막혔을 때 */
.ways{display:flex;gap:24px;margin-top:36px}
.way{flex:1;border:3px solid #dbe6f5;border-radius:22px;padding:44px 30px;background:#f9fbff;text-align:center}
.way .no{width:74px;height:74px;border-radius:50%;background:#1f5fe0;color:#fff;font-size:34px;font-weight:800;
         display:flex;align-items:center;justify-content:center;margin:0 auto 18px}
.way b{display:block;font-size:32px;font-weight:800;margin-bottom:12px}
.way span{font-size:23px;color:#5b6b7c;line-height:1.45}
.askbox{margin-top:30px;border:3px solid #f2b5b5;background:#fff5f5;border-radius:20px;padding:24px 30px}
.askbox b{font-size:28px;color:#8a2020;display:block;margin-bottom:14px}
.askbox .row{display:flex;gap:14px;flex-wrap:wrap}
.askbox .row span{background:#fff;border:2px solid #f2b5b5;border-radius:999px;padding:10px 22px;font-size:24px;color:#8a2020;font-weight:700}

/* FAQ */
.faq{display:flex;flex-direction:column;gap:14px;margin-top:22px}
.qa{background:#f7fafd;border:2px solid #e4ecf6;border-radius:16px;padding:18px 26px}
.qa b{display:block;font-size:27px;color:#1f5fe0;margin-bottom:7px}
.qa span{font-size:23px;color:#3b4a5c;line-height:1.42}

/* 체크리스트 */
.checks{display:grid;grid-template-columns:1fr 1fr;gap:22px 26px;margin-top:34px}
.chk{display:flex;gap:18px;align-items:flex-start;border:2px solid #dfe9f8;border-radius:18px;padding:30px 26px}
.chk .box{flex:0 0 auto;width:40px;height:40px;border:3px solid #1f5fe0;border-radius:10px}
.chk b{display:block;font-size:27px;font-weight:800;margin-bottom:6px}
.chk span{font-size:22px;color:#5b6b7c}

/* 마무리 */
.three{display:flex;gap:28px;margin-top:56px}
.tri{flex:1;border-radius:24px;padding:78px 30px;text-align:center;color:#fff}
.tri:nth-child(1){background:#1f5fe0}
.tri:nth-child(2){background:#0ea5e9}
.tri:nth-child(3){background:#f59e0b}
.tri b{display:block;font-size:44px;font-weight:800;margin-bottom:16px}
.tri span{font-size:25px;line-height:1.45;opacity:.97}
.bigfoot{margin-top:auto;padding-bottom:34px;font-size:28px;color:#3b4a5c;text-align:center;line-height:1.5}
.endlines{margin-top:44px;display:flex;flex-direction:column;gap:16px;align-items:center}
.endlines div{font-size:30px;background:rgba(255,255,255,.16);border-radius:999px;padding:14px 38px}
`;

/* ── 조각 ─────────────────────────────────────────────────────────────── */
const chrome = (s, inner) => `<div class="hdr"><span>${esc(DECK_TITLE)}</span><span class="r">${esc(s.head||'')}</span></div><div class="rule"></div>${inner}`;
const strip = s => (!s.tip && !s.warn) ? '' : `<div class="strip">
  ${s.warn ? `<div class="note warn"><b>조심할 것 · </b>${esc(s.warn)}</div>` : ''}
  ${s.tip  ? `<div class="note tip"><b>쉬운 방법 · </b>${esc(s.tip)}</div>` : ''}</div>`;

function shotTag(s) {
  const f = path.join(TMP, `shot-${s.shot}.png`);
  return fs.existsSync(f) ? `<div class="frame"><img src="file://${f}"></div>` : '';
}

function render(s, i) {
  switch (s.type) {

  case 'cover': return `<div class="cover">
    <div class="bub" style="width:520px;height:520px;right:-140px;top:-160px"></div>
    <div class="bub" style="width:300px;height:300px;left:-90px;bottom:-90px"></div>
    <span class="chip">${esc(s.badge)}</span>
    <div class="eyebrow">${esc(s.eyebrow)}</div>
    <h1>${esc(s.title)}</h1>
    <p>${esc(s.sub)}</p>
    <div class="foot">${esc(s.foot)}</div></div>`;

  case 'end': return `<div class="cover">
    <div class="bub" style="width:560px;height:560px;left:-170px;top:-200px"></div>
    <div class="bub" style="width:340px;height:340px;right:-100px;bottom:-120px"></div>
    <h1>${esc(s.title)}</h1><p>${esc(s.sub)}</p>
    <div class="endlines">${s.lines.map(l=>`<div>${esc(l)}</div>`).join('')}</div></div>`;

  case 'intro': return chrome(s, `<div class="body">
    <div class="thead"><div><h1>${esc(s.title)}</h1></div></div>
    <div class="lead">${s.lead.map(esc).join('<br>')}</div>
    <div class="grid2">${s.cards.map(([b,d])=>`<div class="gcard"><b>${esc(b)}</b><span>${esc(d)}</span></div>`).join('')}</div>
    <div class="bigfoot">한 장에 하나씩입니다. 오늘 다 못 읽어도 괜찮아요.</div></div>`);

  case 'toc': {
    const items = SLIDES.map((x,k)=>({ t: x.title||'', p:k+1, type:x.type }))
      .filter(x=>x.type!=='cover' && x.type!=='toc');
    const half = Math.ceil(items.length/2);
    const cell = (x,k)=>`<div><span class="n">${String(k+1).padStart(2,'0')}</span><span>${esc(x.t)}</span><span class="p">${x.p}</span></div>`;
    return chrome(s, `<div class="body"><div class="thead"><div><h1>${esc(s.title)}</h1>
      <div class="sub">보고 싶은 쪽 번호를 눌러도 바로 갑니다</div></div></div>
      <div class="toc"><div class="col">${items.slice(0,half).map(cell).join('')}</div>
      <div class="col">${items.slice(half).map((x,k)=>cell(x,k+half)).join('')}</div></div></div>`); }

  case 'step': return chrome(s, `<div class="body">
    <div class="thead"><div class="badge">${esc(s.n)}</div>
      <div><h1>${esc(s.title)}</h1><div class="sub">${esc(s.sub)}</div></div></div>
    <div class="lead">${esc(s.lead)}</div>
    <div class="cols">
      <div class="left">
        <div class="h3">이렇게 하세요</div>
        <ol class="steps">${s.steps.map((t,k)=>`<li><span class="no">${k+1}</span><span>${esc(t)}</span></li>`).join('')}</ol>
        ${s.remember?`<div class="rem"><b>이것만 기억하세요</b><ul>${s.remember.map(t=>`<li>${esc(t)}</li>`).join('')}</ul></div>`:''}
      </div>
      <div class="right">${shotTag(s)}</div>
    </div>${strip(s)}</div>`);

  case 'table': return chrome(s, `<div class="body">
    <div class="thead"><div><h1>${esc(s.title)}</h1></div></div>
    <div class="lead">${esc(s.lead)}</div>
    <table><tr><th>묶음</th><th>안에 든 것</th><th>한마디로</th></tr>
      ${s.rows.map(([a,b,c])=>`<tr><td class="k">${esc(a)}</td><td>${esc(b)}</td><td class="d">${esc(c)}</td></tr>`).join('')}</table>
    <div class="bigfoot">${esc(s.foot)}</div></div>`);

  case 'help': return chrome(s, `<div class="body">
    <div class="thead"><div><h1>${esc(s.title)}</h1></div></div>
    <div class="lead">${esc(s.lead)}</div>
    <div class="ways">${s.ways.map(([n,b,d])=>`<div class="way"><div class="no">${esc(n)}</div><b>${esc(b)}</b><span>${esc(d)}</span></div>`).join('')}</div>
    <div class="askbox"><b>${esc(s.askTitle)}</b><div class="row">${s.ask.map(a=>`<span>${esc(a)}</span>`).join('')}</div></div>
    <div class="bigfoot">${esc(s.foot)}</div></div>`);

  case 'faq': return chrome(s, `<div class="body">
    <div class="thead"><div><h1>${esc(s.title)}</h1></div></div>
    <div class="faq">${s.qa.map(([q,a])=>`<div class="qa"><b>${esc(q)}</b><span>${esc(a)}</span></div>`).join('')}</div></div>`);

  case 'check': return chrome(s, `<div class="body">
    <div class="thead"><div><h1>${esc(s.title)}</h1></div></div>
    <div class="lead">${esc(s.lead)}</div>
    <div class="checks">${s.items.map(([b,d])=>`<div class="chk"><span class="box"></span><div><b>${esc(b)}</b><span>${esc(d)}</span></div></div>`).join('')}</div>
    <div class="bigfoot">${esc(s.foot)}</div></div>`);

  case 'wrap': return chrome(s, `<div class="body">
    <div class="thead"><div><h1>${esc(s.title)}</h1><div class="sub">${esc(s.lead)}</div></div></div>
    <div class="three">${s.three.map(([b,d])=>`<div class="tri"><b>${esc(b)}</b><span>${esc(d)}</span></div>`).join('')}</div>
    <div class="bigfoot">${esc(s.foot)}</div></div>`);

  default: return `<div class="body"><h1>?</h1></div>`;
  }
}

/* ── 굽기 ─────────────────────────────────────────────────────────────── */
const sharp = (await import('sharp')).default;
const { chromium } = await import('playwright-core');
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

fs.mkdirSync(TMP, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

/* ① 화면 그림을 슬라이드에 맞게 잘라 둡니다(crop 이 있으면 그만큼만). */
for (const s of SLIDES) {
  if (!s.shot) continue;
  const src = path.join(SHOTS, `raw-${s.shot}.png`);
  if (!fs.existsSync(src)) { console.error('✖ 화면 그림이 없습니다:', src, '\n  먼저 `node capture.mjs` 를 돌리세요.'); process.exit(1); }
  let im = sharp(src);
  if (s.crop) im = im.extract({ left:s.crop[0], top:s.crop[1], width:s.crop[2], height:s.crop[3] });
  await im.png().toFile(path.join(TMP, `shot-${s.shot}.png`));
}

/* ② 21장을 그려서 PNG 로 */
const b = await chromium.launch({ executablePath: CHROME, args:['--no-sandbox','--allow-file-access-from-files'] });
const ctx = await b.newContext({ viewport:{ width:W, height:H }, deviceScaleFactor:1 });
const page = await ctx.newPage();
for (let i = 0; i < SLIDES.length; i++) {
  const html = `<!doctype html><meta charset="utf-8"><style>${CSS}</style>${render(SLIDES[i], i)}`;
  const f = path.join(TMP, `slide-${i}.html`);
  fs.writeFileSync(f, html);
  await page.goto('file://' + f, { waitUntil:'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(120);
  const png = path.join(TMP, `page-${i}.png`);
  await page.screenshot({ path: png });

  const nn = String(i+1).padStart(2,'0');
  await sharp(png).jpeg({ quality:88, chromaSubsampling:'4:4:4' }).toFile(path.join(OUT, `${nn}.jpg`));
  await sharp(png).webp({ quality:86 }).toFile(path.join(OUT, `${nn}.webp`));
  process.stdout.write(`  ${nn} `);
}
console.log('');

/* ③ PDF — 그림 그대로 21쪽. 화면과 인쇄가 어긋날 일이 없습니다. */
const pdfHtml = `<!doctype html><meta charset="utf-8"><style>
  @page{size:${W}px ${H}px;margin:0} *{margin:0;padding:0}
  img{display:block;width:${W}px;height:${H}px;page-break-after:always}
  img:last-child{page-break-after:auto}</style>` +
  SLIDES.map((_,i)=>`<img src="file://${path.join(TMP,`page-${i}.png`)}">`).join('');
const pf = path.join(TMP, 'pdf.html');
fs.writeFileSync(pf, pdfHtml);
await page.goto('file://' + pf, { waitUntil:'load' });
await page.pdf({ path: path.join(OUT, 'admin-easy.pdf'), width:`${W}px`, height:`${H}px`, printBackground:true, pageRanges:`1-${SLIDES.length}` });
await b.close();

/* ④ 보는 쪽(adm-s18.js)의 제목이 이 파일의 제목과 어긋나지 않았는지 확인합니다.
      ⚠️ 어긋나도 그림은 정상이라 «에러가 안 나는» 종류의 사고입니다 — 그래서 여기서 알려 줍니다. */
try {
  const js = fs.readFileSync(path.join(ROOT, 'cloudflare-deploy/public/js/adm-s18.js'), 'utf8');
  const seg = js.slice(js.indexOf('titles:["관리자'), js.indexOf('en:{ dir'));
  const shown = [...seg.matchAll(/"([^"]+)"/g)].map(m => m[1]);
  const mine  = SLIDES.map(s => s.title || '');
  const bad = mine.filter((t, i) => shown[i] !== t);
  if (shown.length !== mine.length || bad.length) {
    console.warn('⚠️ adm-s18.js 의 한국어 제목이 slides.mjs 와 다릅니다 — 보는 화면의 쪽 제목만 옛것으로 남습니다.');
    mine.forEach((t, i) => { if (shown[i] !== t) console.warn(`   ${i+1}쪽  화면 "${shown[i]}"  ≠  글 "${t}"`); });
  } else console.log('✓ adm-s18.js 제목도 같습니다 (21쪽)');
} catch (e) { console.warn('⚠️ adm-s18.js 제목 확인을 못 했습니다:', e.message); }

console.log('✓ 다 만들었습니다 →', path.relative(ROOT, OUT));
