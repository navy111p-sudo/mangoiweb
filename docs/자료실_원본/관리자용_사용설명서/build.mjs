// 📘 관리자 자료실 «관리자용 사용설명서» PDF·PPTX·XLSX 만들기 (2026-10-09 새로 만듦)
//
//   왜 — 옛 사용설명서(2026-07-27, admin-kr.pdf)는 원본이 저장소에 없었고, 화면도 숫자도 옛것이었다
//   (가짜 KPI 숫자 · 옛 주소 mangoi.co.kr · 수업 연기·변경·취소 창이 생기기 전). 사장님 지시
//   「수업 입력·연기·변경·취소, 급여 등등 최근 캡처 이미지로 바꿔서 모두 만들어줘」.
//
//   만드는 법 (리포 루트에서)
//     1) cd cloudflare-deploy/public && python3 -m http.server 8977        (다른 창)
//     2) node "docs/자료실_원본/관리자용_사용설명서/capture.mjs" <캡처폴더>   (LANGS=ko,en)
//          → 실제 화면 파일을 띄우고 API 만 «설명용 가짜 데이터» 로 대신해 찍는다.
//          ⛔ 실제 학생 정보를 쓰지 말 것 — /library/ 밑이라 누구나 받는다(저장소도 공개).
//     3) node "docs/자료실_원본/관리자용_사용설명서/build.mjs" <캡처폴더> <출력폴더>
//          → admin-kr/en.pdf (A4) · admin-kr/en.pptx · admin-kr/en.xlsx
//          PPTX·XLSX 는 make_office.py(python-pptx·openpyxl)가 같은 글(content.mjs)로 만든다.
//
//   ⛔ 글은 content.mjs 하나가 정본 — 여기서 문구를 다시 적지 말 것(세 형식이 서로 다른 말을 하게 된다).
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { T } from './content.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CAP = resolve(process.argv[2] || 'cap');
const OUT = resolve(process.argv[3] || 'out');
mkdirSync(OUT, { recursive: true });

// 그림이 하나라도 빠지면 «빈 상자» 가 든 설명서가 나간다 — 만들기 전에 막는다.
const missing = [];
for (const lang of Object.keys(T)) for (const ch of T[lang].chapters) for (const s of ch.steps) {
  const f = join(CAP, `${lang}-${s.img}.jpg`); if (!existsSync(f)) missing.push(f);
}
if (missing.length) { console.error('그림이 없습니다:\n' + missing.join('\n')); process.exit(1); }

function html(lang, fontCss) {
  const t = T[lang];
  const img = n => 'file://' + join(CAP, `${lang}-${n}.jpg`);
  const toc = t.chapters.map((c, i) => `<li><b>${i + 1}.</b> ${c.title}</li>`).join('');
  const body = t.chapters.map((c, i) => `<section class="ch"><div class="chhead"><span class="chn">${i + 1}</span><div><h2>${c.title}</h2><div class="intro">${c.intro}</div></div></div>
${c.steps.map((s, j) => `<div class="step"><h3><span class="num">${i + 1}-${j + 1}</span>${s.h}</h3>
<ul>${s.p.map(x => `<li>${x}</li>`).join('')}</ul><img class="shot" src="${img(s.img)}"></div>`).join('\n')}</section>`).join('\n');
  const faq = t.faq.map(([q, a]) => `<div class="qa"><div class="q">Q. ${q}</div><div class="a">${a}</div></div>`).join('');
  return `<!doctype html><html lang="${t.htmlLang}"><head><meta charset="utf-8"><title>${t.title}</title>
<style>${fontCss}
@page{size:A4;margin:13mm 12mm 14mm}
*{box-sizing:border-box}
body{margin:0;font-family:'Noto Sans KR','Noto Color Emoji',sans-serif;color:#1f2937;font-size:10.8pt;line-height:1.55}
.cover{border-bottom:3px solid #f59e0b;padding:40mm 0 10px;margin-bottom:14px}
h1{font-size:28pt;margin:0;color:#111827;font-weight:800}
.sub{color:#4b5563;margin-top:6px;font-size:12pt}.date{color:#b45309;font-weight:700;margin-top:6px}
.box{background:#fff7ed;border:1px solid #fdba74;border-radius:10px;padding:10px 14px;margin:12px 0}
.box h2{margin:0 0 4px;font-size:12.5pt;color:#9a3412}.box ul{margin:0;padding-left:18px}.box li{margin:2px 0}
.toc{columns:2;margin:6px 0 0;padding-left:0;list-style:none}.toc li{margin:3px 0}
.ch{break-before:page;page-break-before:always}
.chhead{display:flex;gap:12px;align-items:center;border-bottom:2px solid #f59e0b;padding-bottom:6px;margin-bottom:8px}
.chn{width:40px;height:40px;border-radius:10px;background:#111827;color:#fbbf24;display:flex;align-items:center;justify-content:center;font-size:18pt;font-weight:800;flex:0 0 auto}
.chhead h2{margin:0;font-size:17pt;font-weight:800;color:#111827}.intro{color:#4b5563;font-size:10.5pt}
.step{break-inside:avoid;page-break-inside:avoid;margin:12px 0 6px}
.step h3{display:flex;align-items:center;gap:8px;font-size:12.5pt;margin:0 0 4px;color:#111827;font-weight:800}
.num{flex:0 0 auto;min-width:34px;height:24px;padding:0 6px;border-radius:12px;background:#f59e0b;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:10pt}
.step ul{margin:0 0 6px;padding-left:20px}.step li{margin:1px 0}
.shot{display:block;max-width:100%;max-height:100mm;margin:0 auto;border:1px solid #d1d5db;border-radius:6px}
.qa{break-inside:avoid;margin:8px 0;border-left:4px solid #f59e0b;padding:4px 10px;background:#fffbeb}.q{font-weight:700}
.foot{margin-top:18px;color:#9ca3af;font-size:9pt;text-align:center}
</style></head><body>
<div class="cover"><h1>${t.title}</h1><div class="sub">${t.sub}</div><div class="date">${t.date}</div></div>
<div class="box"><h2>${t.beforeTitle}</h2><ul>${t.before.map(x => `<li>${x}</li>`).join('')}</ul></div>
<div class="box" style="background:#f8fafc;border-color:#cbd5e1"><h2 style="color:#1e293b">${t.tocTitle}</h2><ul class="toc">${toc}</ul></div>
${body}
<section class="ch"><div class="chhead"><span class="chn">?</span><div><h2>${t.xlsx.faqSheet}</h2></div></div>${faq}</section>
<div class="foot">${t.foot}</div>
</body></html>`;
}

async function fontCss(text) {
  // 굵기마다 따로 받는다 — text= 와 여러 굵기를 한 번에 주면 400 이 난다(CLAUDE.md 2장).
  let css = '';
  for (const w of [400, 700, 800]) {
    const url = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent('Noto Sans KR') + ':wght@' + w + '&text=' + encodeURIComponent(text);
    const c = execFileSync('curl', ['-sS', '-A', 'Mozilla/5.0 Chrome/120', url]).toString();
    if (!/@font-face/.test(c)) throw new Error('글꼴을 못 받았습니다(' + w + '): ' + c.slice(0, 200));
    let out = c;
    for (const m of c.matchAll(/url\((https:[^)]+)\)/g)) {
      const b = execFileSync('curl', ['-sS', m[1]]);
      out = out.replace(m[1], 'data:font/woff2;base64,' + b.toString('base64'));
    }
    css += out + '\n';
  }
  return css;
}

const req = createRequire('/opt/node22/lib/node_modules/playwright/package.json');
const { chromium } = req('playwright');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
for (const lang of Object.keys(T)) {
  const plain = html(lang, '').replace(/<[^>]+>/g, '');
  const chars = [...new Set(plain + '0123456789?')].join('');
  const doc = html(lang, await fontCss(chars));
  const tmp = join(OUT, `_${lang}.html`);
  writeFileSync(tmp, doc);
  const page = await browser.newPage();
  await page.goto('file://' + tmp, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: join(OUT, T[lang].files.pdf), format: 'A4', printBackground: true, preferCSSPageSize: true });
  await page.close();
  execFileSync('rm', ['-f', tmp]);
  console.log('PDF', T[lang].files.pdf);
}
await browser.close();

const json = join(OUT, '_content.json');
writeFileSync(json, JSON.stringify(T));
execFileSync('python3', ['-I', join(HERE, 'make_office.py'), json, CAP, OUT], { stdio: 'inherit' });
execFileSync('rm', ['-f', json]);
