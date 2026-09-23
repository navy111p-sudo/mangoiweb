// -*- coding: utf-8 -*-
// 🗑 웜업 «대화 지우고 새로 시작» (2026-09-23) — 브라우저 검사. 자동으로 안 돕니다, 사람이 부릅니다.
//   PW_DIR=/tmp/pw node test-harness/manual/warmup-new-chat-browser.mjs
// 물어보는 것(짝으로):
//   ① 누르면 화면이 비고 «새 세션 번호» 로 첫 인사를 다시 받는다  ↔  취소하면 아무것도 안 바뀐다
//   ② 진행 중이던 옛 대화의 답이 새 화면에 늦게 끼어들지 않는다
//   ③ 수업방(?room=)에서는 버튼이 «보이지도» 않고 불러도 아무 일 없다  ↔  평소에는 보인다
//   ④ 설정 카드가 안 길어져 노트북(1366x768)에서도 «다시 고르기» 가 화면 안이다
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {join,extname,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {requireBrowser} from './_pw.mjs';
const root=join(dirname(fileURLToPath(import.meta.url)),'../../cloudflare-deploy/public');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{try{
  const name=decodeURIComponent(req.url.split('?')[0]);
  res.setHeader('Content-Type',mime[extname(name)]||'application/octet-stream');
  res.end(await readFile(join(root,name)));
}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
const {chromium,exe}=requireBrowser();
const browser=await chromium.launch({executablePath:exe,args:['--no-sandbox']});
let pass=0,fail=0;
function ck(name,c){ if(c){pass++;console.log('✅ '+name);} else {fail++;console.log('❌ FAIL '+name);} }
async function open(query,w=1366,h=768){
  const ctx=await browser.newContext({viewport:{width:w,height:h}});
  const page=await ctx.newPage(), reqs=[], errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{ window.SpeechRecognition=class{start(){this.onstart?.();}stop(){this.onend?.();}abort(){}}; });
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin!==base){await route.abort();return;}
    if(!url.pathname.startsWith('/api/')){await route.continue();return;}
    const body=route.request().postDataJSON?.()||null;
    if(url.pathname==='/api/warmup/chat'){
      reqs.push(body);
      if(body && body.student_input==='SLOW'){ await new Promise(r=>setTimeout(r,1500)); await route.fulfill({json:{ai_response:'OLD-SESSION-LATE-REPLY'}}); return; }
      await route.fulfill({json:{ai_response: body && body.kickoff ? 'Hello! Do you like cats?' : 'Nice! Tell me more.'}}); return;
    }
    if(url.pathname==='/api/warmup/context'){await route.fulfill({json:{ok:true,textbook:'BTS 1',sentences:['Hello, I am a student.']}});return;}
    if(url.pathname==='/api/voice/tts'){await route.fulfill({status:503,body:''});return;}
    await route.fulfill({json:{ok:true}});
  });
  await page.goto(base+'/warmup.html?setup=0&textbook=BTS%201'+query);
  await page.waitForFunction(()=>document.querySelector('#log .msg.ai'),null,{timeout:15000});
  await page.evaluate(()=>{_speechOn=false;_stopSpeak();});
  return {ctx,page,reqs,errors};
}
async function send(page,text){ await page.locator('#inp').fill(text); await page.locator('#sendBtn').click(); }
try{
  // ① 누르면 새로 시작
  {
    const {ctx,page,reqs,errors}=await open('');
    const sid1=reqs[0]&&reqs[0].session_id;
    ck('전제: 첫 인사가 세션 번호를 싣는다',!!sid1);
    await send(page,'I like cats.'); await page.waitForFunction(()=>!sending);
    ck('전제: 학생 말풍선 1개',await page.locator('#log .msg.me').count()===1);
    // 취소 → 그대로(짝)
    page.once('dialog',d=>d.dismiss());
    await page.evaluate(()=>newWarmupChat());
    ck('취소하면 대화가 그대로',await page.locator('#log .msg.me').count()===1);
    ck('취소하면 세션 번호도 그대로',await page.evaluate(()=>SESSION_ID)===sid1);
    // 메뉴를 열어 버튼이 보이고 눌리는가
    await page.locator('#menuBtn').click();
    const btn=page.locator('.menu-newchat');
    await btn.scrollIntoViewIfNeeded();
    ck('버튼이 보인다',await btn.isVisible());
    ck('버튼이 맨 위(눌린다)',await btn.evaluate(e=>{const r=e.getBoundingClientRect();const t=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return !!t&&e.contains(t);}));
    const n=reqs.length;
    page.once('dialog',d=>d.accept());
    await btn.click();
    await page.waitForFunction(()=>document.querySelector('#log .msg.ai'),null,{timeout:10000});
    const sid2=await page.evaluate(()=>SESSION_ID);
    ck('새 세션 번호로 바뀐다',!!sid2 && sid2!==sid1);
    ck('탭 저장값도 새 번호',await page.evaluate(()=>sessionStorage.getItem('mangoi_warmup_sid'))===sid2);
    ck('화면 세션 칩도 새 번호',(await page.locator('#m-session').innerText())===sid2.slice(0,22));
    ck('학생 말풍선이 지워졌다',await page.locator('#log .msg.me').count()===0);
    ck('첫 인사를 다시 받았다(kickoff 가 새 번호로)',reqs.slice(n).some(r=>r&&r.kickoff&&r.session_id===sid2));
    ck('옛 번호로는 아무것도 안 보낸다',!reqs.slice(n).some(r=>r&&r.session_id===sid1));
    ck('메뉴가 닫혔다',!(await page.locator('#menuPanel').evaluate(e=>e.classList.contains('open'))));
    ck('콤보 칩이 감춰졌다',await page.locator('#comboChip').evaluate(e=>getComputedStyle(e).display==='none'));
    ck('진행 표시가 처음으로',(await page.locator('#wgProgress').innerText()).includes('3'));
    ck('페이지 오류 0',errors.length===0);
    await ctx.close();
  }
  // ② 늦게 온 옛 답은 안 끼어든다
  {
    const {ctx,page}=await open('');
    await send(page,'SLOW');
    await page.waitForTimeout(150);
    page.once('dialog',d=>d.accept());
    await page.evaluate(()=>newWarmupChat());
    await page.waitForTimeout(2200);
    ck('옛 세션의 늦은 답이 새 화면에 안 나온다',!(await page.locator('#log').innerText()).includes('OLD-SESSION-LATE-REPLY'));
    ck('보내기 버튼이 잠겨 있지 않다',await page.evaluate(()=>!sending && !document.getElementById('sendBtn').disabled));
    await ctx.close();
  }
  // ③ 수업방에서는 감춘다
  {
    const {ctx,page}=await open('&room=class-1-20260923');
    ck('수업방: 버튼 칸이 안 보인다',await page.locator('#newChatGroup').evaluate(e=>getComputedStyle(e).display==='none'));
    const sid=await page.evaluate(()=>SESSION_ID);
    let asked=false; page.once('dialog',d=>{asked=true;d.accept();});
    await page.evaluate(()=>newWarmupChat());
    ck('수업방: 불러도 묻지도 않는다',!asked);
    ck('수업방: 세션 번호 그대로(방 번호)',await page.evaluate(()=>SESSION_ID)===sid && sid==='class-1-20260923');
    await ctx.close();
  }
  // ④ 노트북에서 «다시 고르기» 가 화면 안
  for(const [w,h] of [[1366,768],[1280,800],[390,844]]){
    const {ctx,page}=await open('',w,h);
    await page.locator('#menuBtn').click();
    await page.waitForTimeout(200);
    ck(w+'x'+h+': 다시 고르기가 화면 안',await page.locator('.menu-reopen').evaluate(e=>{const r=e.getBoundingClientRect();const t=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return r.bottom<=innerHeight&&!!t&&e.contains(t);}));
    await ctx.close();
  }
}finally{ await browser.close(); server.close(); }
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail?1:0);
