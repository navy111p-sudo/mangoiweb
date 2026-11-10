// -*- coding: utf-8 -*-
// ⋮ 얼굴 대화(간단 대화) 화면의 설정 버튼 — 브라우저 검사 (js/ftk-call.js · warmup-facetalk.js · aifriend-facetalk.js)
//   자동으로 안 돕니다 — 사람이 부릅니다:  PW_DIR=/tmp/pw node test-harness/manual/ftk-settings-menu-browser.mjs
//   짝으로 묻는 것: 「⋮ 누르면 얼굴 화면 «위» 에 열린다」 ↔ 「바깥을 누르면 닫힌다」
//                  「고른 값이 실제로 바뀐다」 ↔ 「나가면 패널이 상단바 ⋮ 로 돌아가 거기서도 열린다」
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {join,extname,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {requireBrowser} from './_pw.mjs';
const root=join(dirname(fileURLToPath(import.meta.url)),'../../cloudflare-deploy/public');
const SHOT=process.env.SHOT_DIR||'/tmp';
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.json':'application/json','.svg':'image/svg+xml'};
const srv=createServer(async(q,s)=>{try{const p=decodeURIComponent(new URL(q.url,'http://x').pathname);
  const b=await readFile(join(root,p));s.writeHead(200,{'content-type':MIME[extname(p)]||'application/octet-stream','cache-control':'no-store'});s.end(b);}catch{s.writeHead(404);s.end();}});
await new Promise(r=>srv.listen(0,r));const base='http://127.0.0.1:'+srv.address().port;
const {chromium,exe}=requireBrowser();
let pass=0,fail=0;const ok=(n,c,d)=>{if(c){pass++;console.log('  ✅ '+n+(d?'  '+d:''));}else{fail++;console.log('  ❌ FAIL '+n+(d?'  '+d:''));}};
const browser=await chromium.launch({executablePath:exe});
async function open(w,h,url){
  const ctx=await browser.newContext({viewport:{width:w,height:h},serviceWorkers:'block'});
  await ctx.addInitScript(()=>{ try{ localStorage.setItem('mangoi_ftk_peeked','1'); }catch(e){} });
  const page=await ctx.newPage(); const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
  await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!==base){await route.abort();return;}
    if(!u.pathname.startsWith('/api/')){await route.continue();return;}
    await route.fulfill({json:{ok:true,ai_response:'Hi! Do you like dogs?',reply:'Hi! Do you like dogs?',messages:[],items:[]}});});
  await page.goto(base+url+(url.includes('?')?'&':'?')+'_nc='+Date.now());
  return {ctx,page,errs};
}
/* 그 요소 한가운데의 «맨 위» 가 그 요소(또는 그 안)인가 — 보이는데 안 눌리는 것을 잡는다 */
const onTop=(page,sel)=>page.evaluate(s=>{const e=document.querySelector(s);if(!e)return false;const r=e.getBoundingClientRect();
  if(!r.width||!r.height)return false;const t=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return !!t&&(t===e||e.contains(t));},sel);

for (const [w,h,name,q] of [[390,844,'폰 세로 · 교재/간단대화','?setup=0&diff=2'],[1366,768,'노트북 · 상황','?setup=0&diff=2&sit=cafe'],[360,640,'작은 폰','?setup=0&diff=2']]) {
  console.log(`▶ 웜업 ${name} ${w}x${h}`);
  const {ctx,page,errs}=await open(w,h,'/warmup.html'+q);
  await page.waitForFunction(()=>window.WarmupFaceTalk&&window.FtkCall&&window.WarmupAutoTalk,null,{timeout:9000}).catch(()=>{});
  await page.waitForTimeout(1500);
  await page.evaluate(()=>{ if(!WarmupFaceTalk.isActive()) WarmupFaceTalk.enter(); });
  await page.waitForTimeout(400);
  const pre=await page.evaluate(()=>{const f=document.getElementById('ftk'),b=f&&f.querySelector('.fc-menu');const r=b&&b.getBoundingClientRect();
    const t=f.querySelector('.fc-title').getBoundingClientRect();
    return {on:!!f&&f.classList.contains('on'),btn:!!b&&!b.hidden,w:r?r.width:0,right:r?r.right:0,vw:f.getBoundingClientRect().right,title:t.width,label:b&&b.getAttribute('aria-label')};});
  ok(name+': 얼굴 화면이 켜지고 ⋮ 설정 버튼이 보인다(38px 이상 · 이름 «설정»)', pre.on&&pre.btn&&pre.w>=38&&pre.label==='설정', JSON.stringify(pre));
  ok(name+': ⋮ 가 화면 안에 있고 제목 자리가 남는다', pre.right<=pre.vw && pre.title>=40, 'title '+pre.title.toFixed(0)+'px');
  ok(name+': ⋮ 가 맨 위(눌린다)', await onTop(page,'#ftk .fc-menu'));
  await page.click('#ftk .fc-menu'); await page.waitForTimeout(300);
  await page.screenshot({path:`${SHOT}/ftkmenu-warmup-${w}.png`});
  const st=await page.evaluate(()=>{const f=document.getElementById('ftk'),p=document.getElementById('menuPanel');const r=p.getBoundingClientRect();
    const vis=id=>{const e=document.getElementById(id);return !!e&&e.getBoundingClientRect().height>0;};
    const hid=s=>{const e=p.querySelector(s);return !e||e.getBoundingClientRect().height===0;};
    return {open:p.classList.contains('open'),inside:f.contains(p),fit:r.top>=0&&r.bottom<=innerHeight+1&&r.left>=0&&r.right<=innerWidth+1,
      groups:['menuTalkBtns','rateSlider','lvlBtns','ageBtns','voiceBtns','subBtns'].filter(vis),
      hidden:hid('.menu-reopen')&&hid('.menu-scenes')&&hid('#newChatGroup')&&hid('.menu-howto')};});
  ok(name+': 누르면 설정 패널이 얼굴 화면 안에서 열리고 화면을 안 넘는다', st.open&&st.inside&&st.fit, JSON.stringify(st));
  ok(name+': 여섯 항목이 다 있다(말하는 방법·속도·레벨·연령대·친구·자막)', st.groups.length===6, st.groups.join(','));
  ok(name+': 화면 밑에서 열리는 것(다시 고르기·그림·새로 시작·사용방법)은 감춘다', st.hidden);
  ok(name+': 패널이 맨 위(눌린다)', await onTop(page,'#menuPanel .menu-head'));
  /* 고르면 실제로 바뀐다 */
  await page.click('#lvlBtns button:nth-child(5)'); await page.click('#subBtns [data-s="off"]');
  await page.evaluate(()=>{const s=document.getElementById('rateSlider');s.value='2';s.dispatchEvent(new Event('input',{bubbles:true}));});
  const ageN=await page.evaluate(()=>document.querySelectorAll('#ageBtns button').length);
  if(ageN>1) await page.click('#ageBtns button:nth-child(2)');
  await page.click('#menuTalkBtns [data-talk="button"]');
  const ch=await page.evaluate(()=>({lvl:document.getElementById('lvlVal').textContent,rate:window._rateLevel,sub:document.getElementById('log').dataset.sub,
    cap:document.querySelector('#ftk .fc-cap').hidden,cc:document.querySelector('#ftk .fc-cc').getAttribute('aria-pressed'),
    hand:document.querySelector('#ftk .fc-hand').getAttribute('aria-pressed'),mode:WarmupAutoTalk.mode(),still:document.getElementById('menuPanel').classList.contains('open')}));
  ok(name+': 레벨 5 · 속도 2 가 들어간다', /5/.test(ch.lvl)&&+ch.rate===2, JSON.stringify(ch));
  ok(name+': 자막 «완전 끄기» → 얼굴 화면 자막(CC)도 꺼진다', ch.sub==='off'&&ch.cap===true&&ch.cc==='false');
  ok(name+': 말하는 방법 «버튼» → 얼굴 화면도 버튼 모드', ch.hand==='true'&&ch.mode==='button', ch.mode);
  await page.click('#subBtns [data-s="blur"]');
  const bl=await page.evaluate(()=>{const c=document.querySelector('#ftk .fc-cap');return {hidden:c.hidden,blur:c.classList.contains('blur')};});
  ok(name+': 자막 «가리기» → 자막이 흐리게 다시 보인다(짝)', bl.hidden===false&&bl.blur===true, JSON.stringify(bl));
  await page.click('#subBtns [data-s="on"]');
  await page.click('#voiceBtns [data-v="jake"]'); await page.waitForTimeout(200);
  const vv=await page.evaluate(()=>({v:document.getElementById('voiceVal').textContent,act:WarmupFaceTalk.isActive(),blur:document.querySelector('#ftk .fc-cap').classList.contains('blur')}));
  ok(name+': 친구 Jake 로 바뀌고 얼굴 화면은 그대로 · 자막 «보이기» 는 흐림을 푼다', /Jake/.test(vv.v)&&vv.act&&!vv.blur, JSON.stringify(vv));
  /* 바깥을 누르면 닫힌다 · Esc 는 설정만 닫는다 */
  await page.evaluate(()=>{ if(!document.getElementById('menuPanel').classList.contains('open')) document.querySelector('#ftk .fc-menu').click(); });
  await page.mouse.click(20,h-200); await page.waitForTimeout(250);
  const cl=await page.evaluate(()=>({open:document.getElementById('menuPanel').classList.contains('open'),act:WarmupFaceTalk.isActive()}));
  ok(name+': 바깥을 누르면 닫히고 얼굴 화면은 남는다', !cl.open&&cl.act, JSON.stringify(cl));
  await page.click('#ftk .fc-menu'); await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  const es=await page.evaluate(()=>({open:document.getElementById('menuPanel').classList.contains('open'),act:WarmupFaceTalk.isActive()}));
  ok(name+': Esc 한 번은 설정만 닫는다(얼굴 화면 유지)', !es.open&&es.act, JSON.stringify(es));
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  const ex=await page.evaluate(()=>{const p=document.getElementById('menuPanel');return {act:WarmupFaceTalk.isActive(),home:!!p.closest('.menu-wrap'),mask:!!document.getElementById('menuMask').closest('.menu-wrap'),mode:localStorage.getItem('mangoi_warmup_talk_mode')};});
  ok(name+': 나가면 패널·가림막이 상단바 ⋮ 로 돌아간다', !ex.act&&ex.home&&ex.mask, JSON.stringify(ex));
  await page.evaluate(()=>document.getElementById('menuBtn').click()); await page.waitForTimeout(250);
  const tb=await page.evaluate(()=>{const p=document.getElementById('menuPanel');const e=p.querySelector('.menu-reopen');return {open:p.classList.contains('open'),reopen:e.getBoundingClientRect().height>0};});
  ok(name+': 채팅 화면의 ⋮ 도 예전처럼 열리고 «다시 고르기» 가 보인다(짝)', tb.open&&tb.reopen, JSON.stringify(tb));
  ok(name+': 페이지 오류 0건', errs.length===0, errs.join(' | ').slice(0,300));
  await ctx.close();
}

for (const [w,h,name] of [[390,844,'폰 세로'],[1366,768,'노트북']]) {
  console.log(`▶ A.i 친구 ${name} ${w}x${h}`);
  const {ctx,page,errs}=await open(w,h,'/ai-friend.html');
  await page.waitForFunction(()=>{const f=document.getElementById('ftk');return f&&f.classList.contains('on');},null,{timeout:9000}).catch(()=>{});
  const pre=await page.evaluate(()=>{const f=document.getElementById('ftk'),b=f&&f.querySelector('.fc-menu');return {on:!!f&&f.classList.contains('on'),btn:!!b&&!b.hidden};});
  ok(name+': 얼굴 화면에 ⋮ 설정 버튼이 보인다', pre.on&&pre.btn, JSON.stringify(pre));
  if(pre.btn){
    await page.click('#ftk .fc-menu'); await page.waitForTimeout(500);
    await page.screenshot({path:`${SHOT}/ftkmenu-friend-${w}.png`});
    ok(name+': 누르면 설정 시트가 열리고 맨 위(눌린다)', await page.evaluate(()=>document.body.classList.contains('sheet-open')) && await onTop(page,'#optsSheet .sheet-close'));
    const has=await page.evaluate(()=>['[data-level]','[data-voice]','[data-sub]'].map(s=>!!document.querySelector('#optsSheet .opt'+s)));
    ok(name+': 시트에 레벨·친구·자막이 있다', has.every(Boolean), JSON.stringify(has));
    await page.evaluate(()=>document.querySelector('#optsSheet .opt[data-sub="off"]').click());
    ok(name+': 자막 «완전 끄기» → 얼굴 화면 자막(CC)도 꺼진다', await page.evaluate(()=>document.querySelector('#ftk .fc-cap').hidden===true));
    await page.evaluate(()=>document.querySelector('#optsSheet .opt[data-sub="on"]').click());
    ok(name+': «보이기» → 다시 켜진다(짝)', await page.evaluate(()=>document.querySelector('#ftk .fc-cap').hidden===false));
    await page.keyboard.press('Escape'); await page.waitForTimeout(350);
    const es=await page.evaluate(()=>({sheet:document.body.classList.contains('sheet-open'),on:document.getElementById('ftk').classList.contains('on')}));
    ok(name+': Esc 한 번은 설정만 닫는다(얼굴 화면 유지)', !es.sheet&&es.on, JSON.stringify(es));
  }
  ok(name+': 페이지 오류 0건', errs.length===0, errs.join(' | ').slice(0,300));
  await ctx.close();
}
await browser.close(); srv.close();
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail?1:0);
