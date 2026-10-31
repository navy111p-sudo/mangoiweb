// -*- coding: utf-8 -*-
// AI 영작 — 글감 고르는 곳 «하나» 와 «바뀐 주제» 알림 (2026-10-05 → 2026-10-19 경계 옮김).
//   📅 2026-10-19 사장님 지시 «글감이 두세 군데 있는 것보다 한 군데에서 오늘의 글감을 고르는 게 좋다» —
//      예전엔 그림 · 🎲 글감 칩 · 🧠 경험 칩 세 곳에 «셋 중 하나만» 안내(#pickNote)를 붙였는데, 지금은 «🎬 장면·글감 선택» 목록 하나다.
//      그래서 «안내가 읽히는가» 는 «고르는 곳이 하나이고 그 이름표가 읽히는가» 로 옮겼다(⛔ 안내·칩을 되살리는 쪽으로 되돌리지 말 것).
//   지키는 것은 그대로: 그림·오늘의 글감·내 경험 이 모두 STEP 2 «지금 주제» 하나로 모이고,
//   다른 것으로 다시 고르면 «앞서 고른 X 대신 바꿨어요» 가 뜨는지 실제 화면에서 봅니다.
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
  await ctx.addInitScript(() => { try { localStorage.setItem('mangoi_aiwrite_howto_v1', '1'); } catch (e) {} }); // 첫 방문 «📖 사용 방법» 창이 화면을 덮지 않게(본 것으로 표시) — onescreen 과 같은 방식
  await ctx.addInitScript((l) => { try { localStorage.setItem('mangoi_lang', l); } catch (e) {} }, lang || 'ko');
  const page = await ctx.newPage();
  await page.goto(BASE + '/' + PAGE + '?_nc=' + Date.now(), { waitUntil: 'load' });
  await page.waitForTimeout(600);
  // (2026-10-19) 브레인스토밍은 «도움» 접이칸 밖 · 그림 바로 아래라 펼칠 것이 없다
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
    const row = await page.evaluate((src) => {
      const lum = eval(src); const lb = document.querySelector('.scene-picker label'), pc = document.getElementById('picChoice');
      if (!lb || !pc) return null; const r = pc.getBoundingClientRect();
      return { n: document.querySelectorAll('#picChoice').length, old: !!document.getElementById('pickNote') || !!document.getElementById('topicRow') || !!document.querySelector('#goThemes .go-theme'),
               h: r.height, text: lb.innerText, cr: lum(lb), groups: [...pc.querySelectorAll('optgroup')].map(o => o.label),
               over: document.documentElement.scrollWidth > innerWidth };
    }, LUM);
    check(`[${lang}] 글감 고르는 곳은 하나다(옛 안내·칩 줄 없음)`, !!row && row.n === 1 && !row.old);
    check(`[${lang}] 고르는 칸이 그려진다`, !!row && row.h > 20, row && ('높이 ' + Math.round(row.h)));
    check(`[${lang}] 이름표가 읽힌다(4.5:1)`, !!row && row.cr >= 4.5, row && row.cr.toFixed(2));
    check(`[${lang}] 가로로 넘치지 않는다`, !!row && !row.over);
    check(`[${lang}] 이름표·묶음이 그 언어로 말한다`, !!row && (lang === 'ko' ? (/장면·글감 선택/.test(row.text) && /그림 장면/.test(row.groups.join())) : (/Pick a scene or topic/.test(row.text) && /Picture scenes/.test(row.groups.join()))), row && (row.text + ' | ' + row.groups.join(',')));
    if (lang === 'en') { await ctx.close(); continue; }
    const cur = () => page.evaluate((lumSrc) => { const lum = eval(lumSrc); const sw = document.querySelector('.go-cur-swap');
      return { src: (document.querySelector('.go-cur-src') || {}).textContent || '', t: (document.querySelector('.go-cur-t') || {}).textContent || '',
               swap: sw ? sw.textContent : '', cr: sw ? lum(sw) : 0 }; }, LUM);
    // ① 처음 = 그림이 지금 주제 · «바꿨어요» 는 아직 없다
    const s1 = await cur();
    check('① 처음엔 «오늘의 그림» 이 지금 주제', s1.src === '오늘의 그림', s1.src);
    check('처음에는 «바꿨어요» 가 안 뜬다(짝)', !s1.swap);
    const picName = s1.t.replace(/^지금 주제:\s*/, '');
    // ② 목록에서 오늘의 글감 → 바뀜 알림
    await page.selectOption('#picChoice', 'topic:0'); await page.waitForTimeout(500);
    const s2 = await cur();
    check('② 오늘의 글감을 고르면 «오늘의 글감» 으로 바뀐다', s2.src === '오늘의 글감', s2.src);
    check('바꾸면 «앞서 고른 그림 대신» 이라고 말한다', s2.swap.indexOf(picName) >= 0 && /대신/.test(s2.swap), s2.swap);
    check('바뀜 알림이 읽힌다(4.5:1)', s2.cr >= 4.5, s2.cr.toFixed(2));
    // ③ 내 경험 → 다시 알림
    const story = await page.evaluate(() => { const o = [...document.querySelectorAll('#picChoice option')].find(x => /^story:/.test(x.value)); return o ? o.value : ''; });
    await page.selectOption('#picChoice', story); await page.waitForTimeout(500);
    const s3 = await cur();
    check('③ 내 경험을 고르면 «이야기 주제» 로 바뀐다', s3.src === '이야기 주제', s3.src);
    check('③ 으로 바꿔도 알림이 뜬다', /대신/.test(s3.swap), s3.swap);
    // ④ «🎬 다른 글감 고르기» 는 그 목록 하나로 데려간다(새 고르는 곳을 만들지 않는다)
    await page.click('.go-cur-x'); await page.waitForTimeout(500);
    const s4 = await page.evaluate(() => ({ focus: document.activeElement && document.activeElement.id, top: document.getElementById('picChoice').getBoundingClientRect().top, ih: innerHeight }));
    check('«다른 글감 고르기» 를 누르면 그 목록으로 간다', s4.focus === 'picChoice' && s4.top >= 0 && s4.top < s4.ih, JSON.stringify(s4));
    await ctx.close();
  }
}
await browser.close(); server.close();
console.log('────────────────────────────────────────────────────────────');
console.log(`결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
