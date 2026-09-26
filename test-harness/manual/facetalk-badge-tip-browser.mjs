// -*- coding: utf-8 -*-
// ▶ 얼굴 대화 입구 표시의 «무엇을 하는 버튼인가» 안내 — 브라우저 검사 (2026-09-26 사장님)
//   「마우스를 삼각형에 가져대면 "선생님 얼굴만 보며 대화" 표지가 나오게. 휴대폰에선?」
//   - PC(마우스): ▶ 에 올리면 말풍선
//   - 폰(터치): 마우스 올리기가 원리상 없다 → 처음 3번만 ▶ 옆에 5초 안내, 누르면 걷힘
//   자동으로 안 돕니다 — 사람이 부릅니다:
//     PW_DIR=/tmp/pw node test-harness/manual/facetalk-badge-tip-browser.mjs
//   짝으로 묻는 것: 「올리면 보인다」↔「안 올리면 안 보인다」 · 「폰은 안내가 뜬다」↔「PC 는 안 뜬다」
//                  「3번까지」↔「4번째는 안 뜬다」
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {join,extname,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {requireBrowser} from './_pw.mjs';
const root=join(dirname(fileURLToPath(import.meta.url)),'../../cloudflare-deploy/public');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.json':'application/json','.svg':'image/svg+xml'};
const srv=createServer(async(q,s)=>{try{const p=decodeURIComponent(new URL(q.url,'http://x').pathname);
  const b=await readFile(join(root,p));s.writeHead(200,{'content-type':MIME[extname(p)]||'application/octet-stream','cache-control':'no-store'});s.end(b);}catch{s.writeHead(404);s.end();}});
await new Promise(r=>srv.listen(0,r));const base='http://127.0.0.1:'+srv.address().port;
const {chromium,exe}=requireBrowser();
let pass=0,fail=0;const ok=(n,c,d)=>{if(c){pass++;console.log('  ✅ '+n+(d?'  '+d:''));}else{fail++;console.log('  ❌ FAIL '+n+(d?'  '+d:''));}};
const browser=await chromium.launch({executablePath:exe});
const TIP='선생님 얼굴만 보며 대화';

for (const pg of ['warmup','ai-friend']) {
  const url=`${base}/${pg}.html?setup=0&diff=2`;
  // ── PC(마우스) ──
  {
    console.log(`▶ ${pg} · PC`);
    const ctx=await browser.newContext({viewport:{width:1280,height:800}});
    const page=await ctx.newPage();
    await page.route('**/api/**',r=>r.fulfill({json:{ok:true,ai_response:'Hi!'}}));
    await page.goto(url); await page.waitForTimeout(2500);
    const tipOf=()=>page.evaluate(()=>{const b=document.querySelector('#tavatar-ring .ftk-badge');const cs=getComputedStyle(b,'::after');
      return {content:cs.content,op:+cs.opacity,vis:cs.visibility,title:document.getElementById('tavatar-ring').getAttribute('title')};});
    const t0=await tipOf();
    ok(pg+' PC: 말풍선 글자가 «'+TIP+'»', t0.content===`"${TIP}"`, t0.content);
    ok(pg+' PC: 올리기 전에는 안 보인다(짝)', t0.op===0 && t0.vis==='hidden');
    ok(pg+' PC: 브라우저 기본 title 말풍선은 없다(두 개 겹침 방지)', t0.title===null);
    const bb=await page.locator('#tavatar-ring .ftk-badge').boundingBox();
    await page.mouse.move(bb.x+bb.width/2, bb.y+bb.height/2); await page.waitForTimeout(400);
    const t1=await tipOf();
    ok(pg+' PC: ▶ 에 마우스를 올리면 보인다', t1.op===1 && t1.vis==='visible', JSON.stringify(t1));
    await page.screenshot({path:`/tmp/tip-${pg}-pc.png`,clip:{x:Math.max(0,bb.x-160),y:Math.max(0,bb.y-140),width:520,height:220}});
    ok(pg+' PC: 폰 안내 말풍선은 안 뜬다(짝)', await page.evaluate(()=>!document.querySelector('.ftk-hint')));
    await page.mouse.click(bb.x+bb.width/2, bb.y+bb.height/2); await page.waitForTimeout(500);
    ok(pg+' PC: ▶ 를 눌러도 얼굴 화면이 켜진다', await page.evaluate(()=>document.getElementById('ftk')?.classList.contains('on')));
    await ctx.close();
  }
  // ── 폰(터치) ──
  {
    console.log(`▶ ${pg} · 폰`);
    const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});
    const page=await ctx.newPage();
    await page.route('**/api/**',r=>r.fulfill({json:{ok:true,ai_response:'Hi!'}}));
    const shown=[];
    for (let i=1;i<=4;i++){
      await page.goto(url+"&_n="+i); await page.waitForTimeout(3600);
      const h=await page.evaluate(()=>{const e=document.querySelector('.ftk-hint');if(!e)return null;const r=e.getBoundingClientRect();
        const b=document.querySelector('#tavatar-ring .ftk-badge').getBoundingClientRect();
        return {text:e.textContent,inView:r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight,right:r.left>=b.right,near:Math.abs((r.top+r.height/2)-(b.top+b.height/2))<14,
          lines:Math.round(r.height/parseFloat(getComputedStyle(e).lineHeight))};});
      shown.push(h);
      if(i===1){ await page.screenshot({path:'/tmp/tip-'+pg+'-phone.png',clip:{x:0,y:0,width:390,height:260}});
        ok(pg+' 폰: 처음 들어오면 ▶ 옆에 안내가 뜬다', !!h && /선생님 얼굴만 보며 대화/.test(h.text), JSON.stringify(h));
        ok(pg+' 폰: 안내가 화면 안·▶ 바로 오른쪽(같은 높이)에 있다', !!h && h.inView && h.right && h.near, JSON.stringify(h));
        await page.mouse.click(200,600); await page.waitForTimeout(300);
        ok(pg+' 폰: 화면을 누르면 안내가 걷힌다', await page.evaluate(()=>!document.querySelector('.ftk-hint')));
      }
      if(i===2){ await page.waitForTimeout(5300);
        ok(pg+' 폰: 5초 지나면 저절로 걷힌다', await page.evaluate(()=>!document.querySelector('.ftk-hint'))); }
    }
    ok(pg+' 폰: 처음 3번까지 뜬다', !!shown[0]&&!!shown[1]&&!!shown[2]);
    ok(pg+' 폰: 4번째부터는 안 뜬다(짝)', shown[3]===null);
    await ctx.close();
  }
}
await browser.close(); srv.close();
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail?1:0);
