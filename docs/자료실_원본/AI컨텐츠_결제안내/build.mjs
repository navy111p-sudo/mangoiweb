// 🤖 A.i 컨텐츠 결제 안내서 PDF 만들기 (2026-10-28)
//
//   왜 — 2026-10-28 사장님이 한글판 PDF(「A.i 컨텐츠 결제 안내서」 4쪽)를 주시며 자료실에 넣으라고 하셨다.
//   자료실은 한글/English 두 줄이 짝이라(사용자 규칙 «EN/KO 함께») 같은 모양의 영어판이 필요했고,
//   한글판 원본(HTML·캡처 스크립트)은 저장소에 없어 고칠 수도 없었다 → 같은 구성을 여기서 다시 만든다.
//
//   만드는 법 (리포 루트에서)
//     1) cd cloudflare-deploy/public && python3 -m http.server 8977        (다른 창)
//     2) node "docs/자료실_원본/AI컨텐츠_결제안내/capture.mjs" <캡처폴더>
//     3) node "docs/자료실_원본/AI컨텐츠_결제안내/build.mjs" <캡처폴더> <출력폴더>     (LANGS=en 이면 영어판만)
//          → ai-pay-guide-kr.pdf · ai-pay-guide-en.pdf (A4 4쪽, Noto Sans KR 심음)
//     4) cp <출력폴더>/ai-pay-guide-*.pdf cloudflare-deploy/public/library/agency/
//
//   ⚠️ 사장님이 주신 한글판을 «그대로» 올리지 않고 여기서 같은 구성으로 다시 만든 이유 두 가지(2026-10-28):
//      ① 로그인 화면 사진에 «실제 대리점 로그인 아이디»(api-admin.ts 주석의 엘리더잼영어 아이디)가 찍혀 있었다 —
//         /library/ 는 누구나 받고 저장소도 공개라 실제 계정을 내보낼 수 없다 → 캡처는 sample01 · 시연 계정(testagency) 예시만.
//      ② 「얼마인가요? … (2쪽 표)」 인데 단가표는 4쪽에 있었다 → 「(끝쪽 표)」.
//   ⛔ 글은 content.mjs 하나가 정본 — 여기서 문구를 다시 적지 말 것.
import { writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { T } from './content.mjs';
import { launchChromium, fontCss } from '../_공용/pdf-helpers.mjs';

const CAP = resolve(process.argv[2] || 'cap');
const OUT = resolve(process.argv[3] || 'out');
const LANGS = (process.env.LANGS || Object.keys(T).join(',')).split(',');
mkdirSync(OUT, { recursive: true });

// 그림이 하나라도 빠지면 «빈 상자» 가 든 안내서가 나간다 — 만들기 전에 막는다.
const imgsOf = t => t.steps.flatMap(s => [s.img, s.img2].filter(Boolean));
const missing = LANGS.flatMap(l => imgsOf(T[l]).map(n => join(CAP, `${l}-${n}.jpg`))).filter(f => !existsSync(f));
if (missing.length) { console.error('그림이 없습니다:\n' + missing.join('\n')); process.exit(1); }

// 그림 폭(본문 폭 대비) — 좁은 화면 조각은 너무 크게 늘리지 않는다. 4쪽(1~2 · 3~4 · 5~6 · 단가·FAQ)에 맞춘 값.
const WIDTH = { 'p1-login': '58%', 'p2-menu': '62%', 'p3-load': '86%', 'p4-check': '84%', 'p4-notyet': '84%', 'p5-pay': '90%', 'p6-done': '90%' };
// 이 단계 앞에서 쪽을 넘긴다(한글판과 같은 쪽 나눔).
const BREAK_BEFORE = new Set([2, 4]);

function html(lang, css) {
  const t = T[lang];
  const img = n => `<img class="shot" style="width:${WIDTH[n] || '100%'}" src="file://${join(CAP, `${lang}-${n}.jpg`)}">`;
  const flow = t.flow.map((x, i) => `<span class="chip${i === t.flow.length - 1 ? ' end' : ''}">${x}</span>`).join('<span class="arr">→</span>');
  const facts = t.facts.map(([k, v]) => `<div class="fact"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
  const steps = t.steps.map((s, i) => `<section class="step${BREAK_BEFORE.has(i) ? ' pb' : ''}">
<h2><span class="sn">${i + 1}</span>${s.h}${s.addr ? `<span class="addr">${s.addr}</span>` : ''}</h2>
${img(s.img)}${s.p.map(x => `<p class="cap">${x}</p>`).join('')}
${s.img2 ? img(s.img2) + (s.p2 || []).map(x => `<p class="cap">${x}</p>`).join('') : ''}
${s.tip ? `<div class="tip">💡 ${s.tip}</div>` : ''}</section>`).join('\n');
  const table = `<table><tr>${t.priceHead.map(x => `<th>${x}</th>`).join('')}</tr><tr>${t.priceRow.map((x, i) => i ? `<td>${x}</td>` : `<th>${x}</th>`).join('')}</tr></table>`;
  const faq = t.faq.map(([q, a]) => `<div class="qa"><div class="q">Q. ${q}</div><div class="a">${a}</div></div>`).join('');
  return `<!doctype html><html lang="${t.htmlLang}"><head><meta charset="utf-8"><title>${t.title}</title><style>${css}
@page{size:A4;margin:12mm 13mm 13mm}
*{box-sizing:border-box}
body{margin:0;font-family:'Noto Sans KR','Noto Color Emoji',sans-serif;color:#1f2937;font-size:10.4pt;line-height:1.55}
.hero{background:#fff7ed;border:1px solid #fed7aa;border-radius:14px;padding:14px 18px 15px;margin-bottom:10px}
h1{margin:0;font-size:23pt;font-weight:800;color:#111827}
.sub{color:#c2410c;font-weight:700;margin:2px 0 10px;font-size:10.5pt}
.flow{display:flex;flex-wrap:wrap;align-items:center;gap:4px}
.chip{background:#fff;border:1.5px solid #f59e0b;border-radius:999px;padding:2px 8px;font-weight:700;font-size:8.6pt;color:#1f2937}
.chip.end{border-color:#22c55e;background:#f0fdf4}.arr{color:#ea580c;font-weight:800}
.facts{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:0 0 12px}
.fact{background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:7px 12px}
.fact .k{color:#6b7280;font-size:8.6pt}.fact .v{font-size:10.4pt}
.step{break-inside:avoid;page-break-inside:avoid;margin:0 0 12px}
.pb{break-before:page;page-break-before:always}
h2{display:flex;align-items:center;gap:9px;margin:0 0 6px;font-size:15pt;font-weight:800;color:#111827}
.sn{flex:0 0 auto;width:30px;height:30px;border-radius:50%;background:#f59e0b;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:14pt}
.addr{font-size:9.5pt;font-weight:400;color:#6b7280}
.shot{display:block;max-width:100%;border:1px solid #d1d5db;border-radius:8px;margin:2px 0 4px}
.cap{margin:3px 0 6px}
b.n{display:inline-flex;align-items:center;justify-content:center;min-width:17px;height:17px;padding:0 4px;border-radius:999px;background:#e11d48;color:#fff;font-size:8.4pt;font-weight:800;vertical-align:1px;margin-right:1px}
.tip{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:7px 12px;margin:4px 0 0}
h3.bar{border-left:5px solid #f59e0b;padding-left:9px;font-size:13.5pt;font-weight:800;margin:4px 0 8px;color:#111827}
table{width:100%;border-collapse:collapse;margin:0 0 6px}th,td{border:1px solid #d1d5db;padding:7px 10px;text-align:left;font-size:10pt}
th{background:#f3f4f6;font-weight:700}
.note{margin:0 0 16px}
.qa{background:#f8fafc;border-radius:8px;padding:6px 11px;margin:0 0 6px}.q{color:#b45309;font-weight:700}
.contact{background:#fff1f2;border:1px solid #fecdd3;border-radius:10px;padding:9px 13px;margin:12px 0 10px}
.foot{border-top:1px solid #e5e7eb;padding-top:6px;color:#6b7280;font-size:8.6pt}
</style></head><body>
<div class="hero"><h1>🤖&nbsp;${t.title}</h1><div class="sub">${t.sub}</div><div class="flow">${flow}</div></div>
<div class="facts">${facts}</div>
${steps}
<section class="pb"><h3 class="bar">${t.priceTitle}</h3>${table}<p class="note">${t.priceNote}</p>
<h3 class="bar">${t.faqTitle}</h3>${faq}
<div class="contact">${t.contact}</div><div class="foot">${t.footnote}</div></section>
</body></html>`;
}

const browser = await launchChromium();
for (const lang of LANGS) {
  const plain = html(lang, '').replace(/<[^>]+>/g, '');
  const chars = [...new Set(plain + '0123456789!?')].join('');
  const tmp = join(OUT, `_${lang}.html`);
  writeFileSync(tmp, html(lang, fontCss(chars)));
  const page = await browser.newPage();
  await page.goto('file://' + tmp, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const pdf = join(OUT, T[lang].file);
  await page.pdf({ path: pdf, format: 'A4', printBackground: true, preferCSSPageSize: true });
  await page.close();
  if (!process.env.KEEP_HTML) rmSync(tmp);
  console.log('PDF', pdf);
}
await browser.close();
