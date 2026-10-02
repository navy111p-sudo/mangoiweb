// -*- coding: utf-8 -*-
// ai-write-guide-browser.mjs — AI 영작 첨삭 첫 화면 «3단계 안내 줄»(P7) 을 진짜 브라우저로 잰다.
//
//   [자동으로 안 돕니다 — 사람이 부릅니다]
//       mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
//       PW_DIR=/tmp/pw node test-harness/manual/ai-write-guide-browser.mjs
//   재는 것: ① 안내 줄이 첫 화면 안에 있고 낱글자로 안 쪼개진다 ② 360×640 에서도
//   «첫 조작»(난이도 버튼)이 안내 줄을 넣은 뒤 첫 화면 «밖» 으로 밀려나지 않는다(넣기 전과 대조)
//   ③ 각 단계를 실제로 누르면 그 칸이 화면에 들어오고(③은 글쓰기 칸에 포커스) ④ 글자 대비 4.5 이상
//   ⑤ 단계 버튼 가운데의 «맨 위» 가 그 버튼이다(elementFromPoint).
//   ⚠️ file:// 로 열지 않는다(<script src="/js/…"> 가 전부 404) — 작은 http 서버를 띄운다.
//   ⚠️ 비교용 «넣기 전» 화면은 안내 줄을 DOM 에서 지운 사본으로 잰다(같은 파일·같은 폰트).

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
  const { ctx, page } = await open(w, h);
  const r = await page.evaluate((LUMSRC) => {
    const lum = eval(LUMSRC);
    const g = document.getElementById('awGuide');
    const out = { has: !!g };
    if (!g) return out;
    const gr = g.getBoundingClientRect();
    out.gTop = gr.top; out.gBottom = gr.bottom; out.gH = gr.height;
    out.vh = innerHeight;
    out.steps = [...g.querySelectorAll('[data-aw-go]')].map((b) => {
      const br = b.getBoundingClientRect();
      const lh = parseFloat(getComputedStyle(b).lineHeight) || 18;
      const cx = br.left + br.width / 2, cy = br.top + br.height / 2;
      const topEl = document.elementFromPoint(cx, cy);
      return { go: b.getAttribute('data-aw-go'), w: br.width, h: br.height, lines: Math.round((br.height - 8) / lh),
        topIsMe: !!(topEl && (topEl === b || b.contains(topEl))), cr: lum(b), disp: getComputedStyle(b).display,
        target: !!document.getElementById(b.getAttribute('data-aw-go')) };
    });
    const lv = document.querySelector('#levelRow .level-btn');
    out.levelTop = lv ? lv.getBoundingClientRect().top : null;
    // 넣기 전: 안내 줄을 빼고 다시 잰다
    const ph = g.nextSibling; const parent = g.parentNode;
    parent.removeChild(g);
    out.levelTopBefore = lv ? lv.getBoundingClientRect().top : null;
    parent.insertBefore(g, ph);
    out.overflowX = document.documentElement.scrollWidth > innerWidth;
    return out;
  }, LUM);
  check('안내 줄이 있다', r.has);
  if (r.has) {
    check('안내 줄이 첫 화면 안에 있다', r.gBottom <= r.vh && r.gTop >= 0, `top ${r.gTop|0} · bottom ${r.gBottom|0} / ${r.vh}`);
    check('안내 줄 높이가 작다(≤ 96px)', r.gH <= 96, `${r.gH|0}px`);
    check('가로 넘침 없음', !r.overflowX);
    const lvBefore = r.levelTopBefore, lvAfter = r.levelTop;
    const wasIn = lvBefore != null && lvBefore + 40 <= r.vh;
    const isIn = lvAfter != null && lvAfter + 40 <= r.vh;
    check('첫 조작(난이도 버튼)을 첫 화면 밖으로 밀어내지 않는다', !wasIn || isIn, `넣기 전 ${lvBefore|0} → 후 ${lvAfter|0} / ${r.vh}`);
    for (const s of r.steps) {
      check(`단계 ${s.go}: 갈 곳이 실재`, s.target);
      check(`단계 ${s.go}: 낱글자로 안 쪼개짐(≤2줄)`, s.lines <= 2, `${s.w|0}×${s.h|0}`);
      check(`단계 ${s.go}: 맨 위가 그 버튼(가려지지 않음)`, s.topIsMe);
      check(`단계 ${s.go}: 대비 ≥ 4.5`, s.cr >= 4.5, s.cr.toFixed(2));
      check(`단계 ${s.go}: display 가 flex 아님`, !/flex/.test(s.disp), s.disp);
    }
    check('단계가 셋', r.steps.length === 3);
  }
  // 눌러 보기
  for (const go of ['picCard', 'goCard', 'text']) {
    const btn = page.locator(`#awGuide [data-aw-go="${go}"]`);
    if (!(await btn.count())) { check(`${go} 버튼 누르기`, false, '버튼 없음'); continue; }
    await page.evaluate(() => window.scrollTo(0, 0));
    await btn.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(900);
    const res = await page.evaluate((id) => {
      const t = document.getElementById(id); const r = t.getBoundingClientRect();
      return { inView: r.top < innerHeight && r.bottom > 0, active: document.activeElement && document.activeElement.id };
    }, go);
    check(`「${go}」 단계를 누르면 그 칸이 화면에 들어온다`, res.inView);
    if (go === 'text') check('③ 단계는 글쓰기 칸에 포커스를 준다', res.active === 'text', res.active);
  }
  await ctx.close();
}

// EN
{
  const { ctx, page } = await open(390, 844, 'en');
  const t = await page.evaluate(() => { const g = document.getElementById('awGuide'); return g ? g.innerText : ''; });
  check('EN 화면은 영어 안내', /Pick a picture or topic/.test(t) && /AI feedback/.test(t), t.replace(/\s+/g, ' ').slice(0, 120));
  await ctx.close();
}

await browser.close();
server.close();
console.log('─'.repeat(60));
console.log('결과: PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
