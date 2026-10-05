// -*- coding: utf-8 -*-
// AI 영작 — «글감은 셋 중 하나만» 안내와 «바뀐 주제» 알림 (2026-10-05).
//   ① 그림 ② 오늘의 글감 ③ 내 경험 주제 가 모두 STEP 2 «지금 주제» 하나로 모이고,
//   다른 곳에서 다시 고르면 «앞서 고른 X 대신 바꿨어요» 가 뜨는지 실제 화면에서 봅니다.
//   자동으로 안 돕니다 — 사람이 부릅니다:
//       PW_DIR=/tmp/pw node test-harness/manual/ai-write-pick-one-browser.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireBrowser } from './_pw.mjs';
const __dir = dirname(fileURLToPath(import.meta.url));
const PUB = join(__dir, '../../cloudflare-deploy/public');
const PAGE = process.env.AW_PAGE || 'ai-write.html';
const { chromium, exe } = requireBrowser();

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};
const server = createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  if (p.startsWith('/api/')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":false}'); }
  try {
    const buf = await readFile(join(PUB, p.replace(/^\//, '')));
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(buf);
  } catch { res.writeHead(404).end('nope'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port;

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass++; console.log('  ✅ ' + name + (extra ? '  (' + extra + ')' : '')); }
  else { fail++; console.log('  ❌ FAIL ' + name + (extra ? '  → ' + extra : '')); }
};

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });

async function open(w, h, lang) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript((l) => { try { localStorage.setItem('mangoi_lang', l); } catch (e) {} }, lang || 'ko');
  const page = await ctx.newPage();
  await page.goto(BASE + '/' + PAGE + '?_nc=' + Date.now(), { waitUntil: 'load' });
  await page.waitForTimeout(600);
  return { ctx, page };
}

const LUM = `(function(){
  function p(s){ var m=String(s).match(/rgba?\\(([^)]+)\\)/); if(!m) return null; var a=m[1].split(',').map(function(x){return parseFloat(x)}); if(a.length<4)a.push(1); return a; }
  function lin(c){ c/=255; return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4); }
  function L(a){ return 0.2126*lin(a[0])+0.7152*lin(a[1])+0.0722*lin(a[2]); }
  function firstColor(img){ var m=String(img).match(/rgba?\\([^)]+\\)|#[0-9a-f]{3,6}/i); if(!m) return null; var t=m[0]; if(t[0]==='#'){ var h=t.slice(1); if(h.length===3)h=h.split('').map(function(x){return x+x}).join(''); return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16),1]; } return p(t); }
  return function(el){
    var cs=getComputedStyle(el), fg=p(cs.color); var layers=[]; var n=el;
    while(n && n.nodeType===1){ var s=getComputedStyle(n); var bg=p(s.backgroundColor); if((!bg||bg[3]===0) && s.backgroundImage && s.backgroundImage!=='none'){ bg=firstColor(s.backgroundImage); }
      if(bg && bg[3]>0){ layers.push(bg); if(bg[3]>=1) break; } n=n.parentElement; }
    var base=[10,21,48]; for(var i=layers.length-1;i>=0;i--){ var c=layers[i],a=c[3]; base=[c[0]*a+base[0]*(1-a),c[1]*a+base[1]*(1-a),c[2]*a+base[2]*(1-a)]; }
    var fa=fg[3]; var f=[fg[0]*fa+base[0]*(1-fa),fg[1]*fa+base[1]*(1-fa),fg[2]*fa+base[2]*(1-fa)];
    var l1=L(f),l2=L(base); return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);
  };
})()`;

for (const [w, h] of [[360, 640], [390, 844], [1280, 800]]) {
  console.log(`── ${w}×${h}`);
  for (const lang of ['ko', 'en']) {
    const { ctx, page } = await open(w, h, lang);
    const note = await page.evaluate((src) => {
      const lum = eval(src); const n = document.getElementById('pickNote');
      if (!n) return null; const r = n.getBoundingClientRect();
      return { h: r.height, w: r.width, text: n.innerText, crB: lum(n.querySelector('b')), crS: lum(n.querySelector('span')),
               over: document.documentElement.scrollWidth > innerWidth };
    }, LUM);
    check(`[${lang}] 안내 상자가 그려진다`, !!note && note.h > 20, note && ('높이 ' + Math.round(note.h)));
    check(`[${lang}] 안내 글자가 읽힌다(4.5:1)`, !!note && note.crB >= 4.5 && note.crS >= 4.5, note && (note.crB.toFixed(2) + ' / ' + note.crS.toFixed(2)));
    check(`[${lang}] 가로로 넘치지 않는다`, !!note && !note.over);
    check(`[${lang}] 안내가 그 언어로 말한다`, !!note && (lang === 'ko' ? /하나만/.test(note.text) : /just «one»/.test(note.text)), note && note.text.slice(0, 40));
    if (lang === 'en') { await ctx.close(); continue; }
    // ① 그림 → 지금 주제
    await page.click('.pic-btn.go'); await page.waitForTimeout(500);
    const s1 = await page.evaluate(() => ({ src: (document.querySelector('.go-cur-src') || {}).textContent || '',
      t: (document.querySelector('.go-cur-t') || {}).textContent || '', swap: !!document.querySelector('.go-cur-swap'),
      lbl: (document.querySelector('.go-pick-lbl') || {}).textContent || '' }));
    check('① 그림을 고르면 «오늘의 그림» 이 지금 주제', s1.src === '오늘의 그림', s1.src);
    check('처음 고를 때는 «바꿨어요» 가 안 뜬다(짝)', !s1.swap);
    check('③ 라벨이 칩 위에 있다', /내 경험/.test(s1.lbl), s1.lbl);
    const picName = s1.t.replace(/^지금 주제:\s*/, '');
    // ② 글감 칩 → 바뀜 알림
    await page.click('#topicRow .topic-chip'); await page.waitForTimeout(500);
    const s2 = await page.evaluate((lumSrc) => { const lum = eval(lumSrc); const sw = document.querySelector('.go-cur-swap');
      return { src: (document.querySelector('.go-cur-src') || {}).textContent || '', swap: sw ? sw.textContent : '', cr: sw ? lum(sw) : 0 }; }, LUM);
    check('② 글감을 고르면 «오늘의 글감» 으로 바뀐다', s2.src === '오늘의 글감', s2.src);
    check('바꾸면 «앞서 고른 그림 대신» 이라고 말한다', s2.swap.indexOf(picName) >= 0 && /대신/.test(s2.swap), s2.swap);
    check('바뀜 알림이 읽힌다(4.5:1)', s2.cr >= 4.5, s2.cr.toFixed(2));
    // ③ 경험 칩 → 다시 알림, 같은 칩 다시 누르면 접힘
    await page.click('#goThemes .go-theme'); await page.waitForTimeout(500);
    const s3 = await page.evaluate(() => ({ src: (document.querySelector('.go-cur-src') || {}).textContent || '', swap: (document.querySelector('.go-cur-swap') || {}).textContent || '' }));
    check('③ 경험 주제를 고르면 «이야기 주제» 로 바뀐다', s3.src === '이야기 주제', s3.src);
    check('③ 으로 바꿔도 알림이 뜬다', /대신/.test(s3.swap), s3.swap);
    await page.click('#goThemes .go-theme.on'); await page.waitForTimeout(400);
    const s4 = await page.evaluate(() => ({ cur: !!document.querySelector('.go-cur'), swap: !!document.querySelector('.go-cur-swap') }));
    check('같은 칩을 다시 누르면 주제가 접히고 알림도 사라진다', !s4.cur && !s4.swap);
    await ctx.close();
  }
}
await browser.close(); server.close();
console.log('────────────────────────────────────────────────────────────');
console.log(`결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
