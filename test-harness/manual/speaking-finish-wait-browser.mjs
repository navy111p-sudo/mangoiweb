// -*- coding: utf-8 -*-
// ⏳ A.i 말하기 «AI 대답 중에 누른 끝내기» — 브라우저 검사 (2026-11-09 세션 미완료 수리)
//   자동으로 안 돕니다 — 사람이 부릅니다:
//     PW_DIR=/tmp/pw node test-harness/manual/speaking-finish-wait-browser.mjs
//   짝으로 묻는 것: 「대답 중에는 결과 창을 안 연다」 ↔ 「대답이 끝나면 연다(버리지 않는다)」
//                  「안내는 맨 위에 보인다」 ↔ 「그 아래 눌림은 가리지 않는다」
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {join,extname,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {requireBrowser} from './_pw.mjs';
const root=join(dirname(fileURLToPath(import.meta.url)),'../../cloudflare-deploy/public');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.json':'application/json','.svg':'image/svg+xml'};
const srv=createServer(async(q,s)=>{try{const p=decodeURIComponent(new URL(q.url,'http://x').pathname);
  const b=await readFile(join(root,p==='/'?'index.html':p));s.writeHead(200,{'content-type':MIME[extname(p)]||'application/octet-stream','cache-control':'no-store'});s.end(b);}catch{s.writeHead(404);s.end();}});
await new Promise(r=>srv.listen(0,r));const base='http://127.0.0.1:'+srv.address().port;
const {chromium,exe}=requireBrowser();
let pass=0,fail=0;const ok=(n,c,d)=>{if(c){pass++;console.log('  ✅ '+n+(d?'  '+d:''));}else{fail++;console.log('  ❌ FAIL '+n+(d?'  '+d:''));}};
const browser=await chromium.launch({executablePath:exe});

async function open(path,vp){
  const ctx=await browser.newContext({viewport:vp});
  await ctx.addInitScript(()=>{ try{ localStorage.setItem('mangoi_ftk_peeked','1'); localStorage.setItem('mangoi_aw_seen','1'); }catch(e){} });
  const page=await ctx.newPage(); const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
  await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!==base){await route.abort();return;}
    if(!u.pathname.startsWith('/api/')){await route.continue();return;}
    await route.fulfill({json:{ok:true}});});
  await page.goto(base+path+(path.includes('?')?'&':'?')+'_nc='+Date.now());
  await page.waitForFunction(()=>window.AiSpeakingProgress&&window.AiSpeakingProgress.afterReply,null,{timeout:9000}).catch(()=>{});
  await page.waitForTimeout(500);
  return {ctx,page,errs};
}
const state=page=>page.evaluate(()=>{const n=document.getElementById('aiProgressNotice'),d=document.querySelector('dialog.ai-progress-dialog');
  if(!n) return {notice:false,dialog:!!(d&&d.open)};
  const r=n.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,pass=document.elementFromPoint(cx,cy);
  n.style.pointerEvents='auto'; const top=document.elementFromPoint(cx,cy); n.style.pointerEvents='none';
  return {notice:!n.hidden&&r.width>0,text:n.textContent,dialog:!!(d&&d.open),inView:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,
    upper:r.bottom<innerHeight/2,topmost:top===n,through:pass!==n,w:Math.round(r.width),h:Math.round(r.height)};});

for(const vp of [{width:390,height:844},{width:1366,height:768}]){
  console.log(`▶ A.i 친구하기 · 얼굴 대화 ✓ · ${vp.width}x${vp.height}`);
  const {ctx,page,errs}=await open('/ai-friend.html',vp);
  const ftkOpen=await page.evaluate(()=>!!(window.MangoiFaceTalk&&MangoiFaceTalk.isActive()));
  ok('전제: 얼굴 대화가 열려 있다', ftkOpen);
  await page.evaluate(()=>{document.getElementById('sendBtn').disabled=true;});
  await page.click('#ftk .fc-done');
  await page.waitForTimeout(400);
  let s=await state(page);
  ok('대답 중 ✓ → 결과 창은 아직 안 연다', s.dialog===false, JSON.stringify(s));
  ok('대신 «AI 대답이 끝나면…» 안내가 보인다', s.notice && /AI 대답이 끝나면/.test(s.text||''), s.text);
  ok('안내는 화면 안 · 위쪽(아래 마이크 안내 자리와 안 겹침)', s.inView && s.upper, s.w+'x'+s.h);
  ok('안내가 그 자리의 맨 위', s.topmost);
  ok('(짝) 안내가 그 아래 눌림을 가리지 않는다', s.through);
  await page.waitForTimeout(1200);
  s=await state(page);
  ok('대답이 끝날 때까지 계속 기다린다', s.dialog===false && s.notice);
  await page.evaluate(()=>{document.getElementById('sendBtn').disabled=false;});
  await page.waitForTimeout(700);
  s=await state(page);
  ok('대답이 끝나면 결과 창을 연다(버리지 않음)', s.dialog===true, JSON.stringify(s));
  ok('안내는 사라진다', s.notice===false);
  ok('페이지 오류 없음', errs.length===0, errs.join(' | '));
  await ctx.close();
}

for(const vp of [{width:390,height:844},{width:1366,height:768}]){
  console.log(`▶ A.i 말하기(웜업) · 얼굴 대화 ✓ · ${vp.width}x${vp.height}`);
  const {ctx,page,errs}=await open('/warmup.html?setup=0',vp);
  await page.evaluate(()=>{ try{ window.WarmupFaceTalk && WarmupFaceTalk.enter(); }catch(e){} });
  await page.waitForTimeout(500);
  const pre=await page.evaluate(()=>({ftk:!!(window.WarmupFaceTalk&&WarmupFaceTalk.isActive()), done:!!document.querySelector('#ftk .fc-done')}));
  ok('전제: 웜업 얼굴 대화가 열려 있다', pre.ftk && pre.done, JSON.stringify(pre));
  await page.evaluate(()=>{document.getElementById('sendBtn').disabled=true;});
  await page.waitForTimeout(100);
  const fin=await page.evaluate(()=>document.getElementById('wgFinish').disabled);
  ok('전제: 대답 중에는 «끝내고 요약 보기» 도 꺼진다(그래서 예전엔 ✓ 가 아무 일도 안 했다)', fin===true);
  await page.click('#ftk .fc-done'); await page.waitForTimeout(400);
  let s=await state(page); const sum1=await page.evaluate(()=>document.getElementById('wgSummary').open);
  ok('대답 중 ✓ → 요약 창은 아직 안 연다', sum1===false, JSON.stringify(s));
  ok('안내가 보이고 맨 위', s.notice && s.topmost && s.inView, s.text);
  await page.evaluate(()=>{document.getElementById('sendBtn').disabled=false;});
  await page.waitForTimeout(800);
  s=await state(page);
  const after=await page.evaluate(()=>{const c=document.querySelector('#wgSummary .ai-progress-card');return {open:document.getElementById('wgSummary').open,card:c?c.textContent.trim().length:-1};});
  ok('대답이 끝나면 요약 창을 열고 결과 칸을 채운다(버리지 않음)', after.open && after.card>0, JSON.stringify(after));
  ok('안내는 사라진다', s.notice===false);
  ok('페이지 오류 없음', errs.length===0, errs.join(' | '));
  await ctx.close();
}

await browser.close(); srv.close();
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if(fail) process.exit(1);
