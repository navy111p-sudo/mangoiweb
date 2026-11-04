// Actual product page, local assets and mocked APIs only. No paid/live API or account writes.
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {dirname,join,extname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {loadPlaywright,findChromium} from './_pw.mjs';
const root=resolve(process.env.WARMUP_PUBLIC_ROOT||join(dirname(fileURLToPath(import.meta.url)),'../../cloudflare-deploy/public'));
const shots=process.env.WARMUP_FLOW_SHOTS;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.json':'application/json','.wasm':'application/wasm'};
const server=createServer(async(q,s)=>{try{const p=new URL(q.url,'http://local').pathname;
 if(p==='/qa-host.html'){s.setHeader('content-type','text/html');s.end('<video id="teacher"></video><iframe style="width:100%;height:850px" src="/warmup.html?setup=0&textbook=BTS%201&unit=Food"></iframe><script>window.teacherStops=0;window.teacherContext=new AudioContext();window.teacherTrack=teacherContext.createMediaStreamDestination().stream.getAudioTracks()[0];var originalStop=teacherTrack.stop.bind(teacherTrack);teacherTrack.stop=function(){teacherStops++;originalStop();};document.getElementById("teacher").srcObject=new MediaStream([teacherTrack]);</script>');return;}
 const file=join(root,decodeURIComponent(p));s.setHeader('content-type',mime[extname(file)]||'application/octet-stream');s.end(await readFile(file));
}catch{s.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const pw=loadPlaywright(),exe=process.env.CHROMIUM||findChromium();
if(!pw||!exe){console.error('BLOCKED: Playwright/Chromium required for this focused test');server.close();process.exit(2);}
const browser=await pw.chromium.launch({executablePath:exe,args:['--no-sandbox']});if(shots)await mkdir(shots,{recursive:true});
const group=process.env.WARMUP_FLOW_GROUP||'all';
let passed=0;function ck(v,name){assert.ok(v,name);passed++;console.log('PASS '+name);}
const en='What would you like to order?',zh='你想点什么？';
function audioFixture(){const rate=16000,n=rate*2,b=Buffer.alloc(44+n*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*2,40);for(let i=0;i<n;i++)b.writeInt16LE(Math.round(Math.sin(i*2*Math.PI*180/rate)*(i%4000<2500?13000:500)),44+i*2);return b;}

async function fixture(w=390,h=844,lang='en',touch=true,setup=false,blockedStorage=false){
 const context=await browser.newContext({viewport:{width:w,height:h},hasTouch:touch,isMobile:false});const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.text().startsWith('ZOOM_OVERFLOW'))console.log(m.text());});
 await context.addInitScript(({blockedStorage})=>{
   window.__mic={starts:0,aborts:0};window.SpeechRecognition=class{start(){__mic.starts++;this.onstart?.();}stop(){__mic.stops=(__mic.stops||0)+1;this.onend?.();}abort(){__mic.aborts++;}};
   localStorage.setItem('mangoi_ftk_peeked','1');
   if(blockedStorage)Storage.prototype.setItem=function(){throw new DOMException('blocked','QuotaExceededError');};
 },{blockedStorage});
 const S={chat:[],asks:[],images:[],audio:true,askMode:'ok',chatMode:'ok',bgHold:null,pendingAsk:[],pendingChat:[]};
 await context.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());if(u.origin!==base){await route.abort();return;}
   if(u.pathname.startsWith('/img/write-scenes/')){
     S.images.push(u.pathname);if(S.bgHold&&u.pathname.includes(S.bgHold.file))await new Promise(r=>S.bgHold.release=r);
     if(S.bgFail&&u.pathname.includes(S.bgFail)){await route.fulfill({status:503,body:''});return;}
   }
   if(!u.pathname.startsWith('/api/')){await route.continue();return;}
   let body={};try{body=req.postDataJSON()||{};}catch{}
   if(u.pathname==='/api/warmup/chat'){
     S.chat.push(body);if(S.chatMode==='delay')await new Promise(r=>S.pendingChat.push(r));
     const z=body.lang==='zh';try{await route.fulfill({json:{ai_response:z?zh:en,fix:S.chat.length>1?{was:z?'我想面包。':'I want bread.',now:z?'我想要一些面包。':'I would like some bread.',why_ko:'주문 상황에 맞는 공손한 표현이에요.'}:null,repeat:true,speaking_help:{words:z?['想要']:['bread'],frame:z?'我想要____。':'I would like ____.',example:z?'我想要面包。':'I would like bread.'},answer_chips:[]}});}catch{}return;
   }
   if(u.pathname==='/api/ai/class-ask'){
     S.asks.push(body);if(S.askMode==='delay')await new Promise(r=>S.pendingAsk.push(r));
     try{await route.fulfill(S.askMode==='fail'?{status:503,json:{ok:false,error:'ai_unavailable'}}:{json:{ok:true,...(body.lang==='zh'?{zh:'“想要”表示愿望。'}:{en:'Would like is polite.'}),ko:'공손한 요청 표현이에요.'}});}catch{}return;
   }
   if(u.pathname==='/api/voice/tts'){await route.fulfill(S.audio?{status:200,contentType:'audio/wav',body:audioFixture()}:{status:503,body:''});return;}
   if(u.pathname==='/api/translate'){await route.fulfill({json:{ok:true,map:Object.fromEntries((body.texts||[]).map(t=>[t,'이 문장의 뜻이에요.']))}});return;}
   if(u.pathname==='/api/warmup/context'){await route.fulfill({json:{ok:true,textbook:S.contextBook||'BTS 1',sentences:['I would like bread.']}});return;}
   await route.fulfill({json:{ok:true}});
 });
 await page.goto(base+'/warmup.html?setup='+(setup?'1':'0')+'&lang='+lang+'&textbook=BTS%201&unit=Food%20at%20the%20bakery');
 await page.waitForFunction(()=>window.MangoWarmupFlow && (document.getElementById('wuSetup').hidden?!sending:true));
 await page.evaluate(()=>{_stopSpeak();_speechOn=false;});
 return{page,context,S,errors,close:async()=>{S.pendingAsk.splice(0).forEach(r=>r());S.pendingChat.splice(0).forEach(r=>r());if(S.bgHold?.release)S.bgHold.release();await context.close();}};
}
async function openPrefs(p){await p.locator('#wfPreferencesOpen').click();}
async function sendAnswer(p,text){await p.evaluate(t=>{document.getElementById('inp').value=t;return sendMsg();},text);await p.waitForFunction(()=>!sending);}
try{
 if(group==='all'||group==='layout')for(const [w,h,touch]of [[320,568,true],[390,844,true],[844,390,true],[768,1024,true],[1024,768,true],[1366,900,false]])for(const lang of ['en','zh']){
  const F=await fixture(w,h,lang,touch),{page:p,S,errors}=F,label=w+'x'+h+'/'+lang;
  ck(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label+' no horizontal overflow');
  ck(await p.locator('#tavatar-canvas').evaluate(e=>getComputedStyle(e).objectFit==='contain'),label+' native face ratio is contained without stretching');
  const mainMic=touch?'#tbMic':'#micBtn';
  ck(await p.locator(mainMic).evaluate(e=>{let r=e.getBoundingClientRect();return r.width>=44&&r.height>=44&&r.top>=0&&r.bottom<=innerHeight+1;}),label+' microphone reachable >=44px');
  if(touch)ck(await p.locator('#wfAskTouch').evaluate(e=>{let r=e.getBoundingClientRect();return r.width>=44&&r.height>=44&&r.bottom<=innerHeight+1;}),label+' direct touch question button remains reachable');
  await p.locator('#wfAskOpen').click();ck(await p.evaluate(()=>_warmPaused&&!_recognizing),label+' question pauses practice microphone');
  await p.locator('#wfAskInput').fill('왜 이렇게 말하나요?');await p.locator('#wfAskSend').click();await p.waitForFunction(()=>document.getElementById('wfAskAnswer').textContent.length>0);
  ck(S.asks.length===1&&S.asks[0].lang===lang&&!('session_id'in S.asks[0]),label+' stateless language-specific help contract');
  ck((await p.locator('#wfAskAnswer').innerText()).includes(lang==='zh'?'想要':'polite'),label+' explanation in selected practice language');
  if(shots&&w===390)await p.screenshot({path:join(shots,'question-'+lang+'.png'),fullPage:true});
  await p.keyboard.press('Escape');await p.waitForFunction(()=>!document.getElementById('wfAsk').open&&!_warmPaused);ck(await p.evaluate(()=>!_warmPaused && document.activeElement.id==='wfAskOpen'),label+' close resumes same practice and focus');
  ck(S.chat.length===1,label+' help never submits a main reply');
  await openPrefs(p);await p.locator('#wfBackgroundMode').selectOption('plain');await p.locator('#wfPreferencesClose').click();
  ck(await p.locator('#wfStage').getAttribute('data-background')==='plain',label+' plain background works');
  if(shots&&[390,768,1366].includes(w)){await openPrefs(p);await p.locator('#wfBackground').selectOption('bakery');await p.waitForFunction(()=>document.getElementById('wfStage').dataset.background==='bakery');await p.locator('#wfPreferencesClose').click();await p.screenshot({path:join(shots,'product-'+w+'-'+lang+'.png'),fullPage:true});}
  ck(!errors.length,label+' no JavaScript errors '+errors.join(';'));await F.close();
 }
 // Existing setup controls survive; values reach the actual main chat request.
 if(group==='all'||group==='setup')for(const lang of ['en','zh'])for(const correction of ['free_talk','balanced','focused']){
  const F=await fixture(1366,900,lang,false,true),{page:p,S}=F;
  ck(await p.locator('#wusLangs [data-lang]').count()===2,'setup keeps English/Chinese');
  ck(await p.locator('#wusAges [data-age]').count()===4&&await p.locator('#wusLevels [data-lvl]').count()===8,'setup keeps ages and all levels');
  ck(await p.locator('#wusCModes [data-cmode]').count()===3,'setup keeps correction modes');
  ck(await p.locator('#wusFind').count()===1&&await p.locator('#wusTwoWay').count()===1&&await p.locator('#wusTalkBtns').count()===1,'setup keeps level finder, book/free and manual/auto');
  await p.evaluate(({lang,correction})=>{setWarmLang(lang,false);setAge('adult',false);setLevel(5,false);setCorrMode(correction);}, {lang,correction});
  await p.locator('#wusStart').click();await p.waitForFunction(()=>_warmStarted&&!sending);await sendAnswer(p,lang==='zh'?'我想买面包。':'I would like bread.');
  const req=S.chat.at(-1);ck(req.lang===lang&&req.age_group==='adult'&&req.difficulty===5&&req.correction_mode===correction,'actual request preserves '+lang+'/'+correction+'/adult/5');await F.close();
 }
 if(group==='all'||group==='requests'){
  for(const lang of ['en','zh']){
   const F=await fixture(1366,900,lang,false),{page:p,S}=F;
   for(const age of ['kid','child','teen','adult'])for(let level=1;level<=8;level++){
    await p.evaluate(({age,level})=>{setAge(age,false);setLevel(level,false);},{age,level});await sendAnswer(p,lang==='zh'?'我想要面包。':'I would like bread.');
    const req=S.chat.at(-1);ck(req.lang===lang&&req.age_group===age&&req.difficulty===level&&req.textbook==='BTS 1','actual request matrix '+lang+'/'+age+'/'+level);
   }
   if(lang==='en'){
    await p.evaluate(()=>clearBtsBook(false));await sendAnswer(p,'Free conversation.');ck(!('textbook'in S.chat.at(-1)),'free conversation removes only book context from request');
    const book=await p.evaluate(()=>{applyBtsBook(SIU_BOOKS[0].v,false,false);return{title:WCTX.textbook,level:_warmLevel};});await sendAnswer(p,'My SIU answer.');ck(S.chat.at(-1).textbook===book.title&&S.chat.at(-1).difficulty===book.level,'SIU selection reaches request without resetting chosen difficulty');
   }
   for(const friend of lang==='en'?['emma','jake','lily','noah','mix']:['mei','long']){
    await p.evaluate(friend=>setVoiceMode(friend,false),friend);await sendAnswer(p,lang==='zh'?'我想要面包。':'I would like bread.');
    ck((friend==='mix'?['emma','jake','lily','noah'].includes(S.chat.at(-1).friend):S.chat.at(-1).friend===friend)&&await p.evaluate(()=>!sending),'friend selection reaches request and cannot strand the busy state: '+friend);
   }
   S.contextBook='Resolved profile book';const epoch=await p.evaluate(()=>_warmEpoch);await p.evaluate(()=>initGreeting());ck(S.chat.at(-1).textbook==='Resolved profile book'&&await p.evaluate(()=>_warmEpoch)===epoch,'bootstrap profile metadata does not cancel its own greeting: '+lang);
   await F.close();
  }
 }
 // Deferred help requests: duplicate clicks, cancellation, context replacement, failure and retry.
 if(group==='all'||group==='races'){
  const F=await fixture(1366,900,'en',false),{page:p,S}=F;await sendAnswer(p,'I want bread.');
  await p.evaluate(()=>setCorrMode('balanced'));
  await p.locator('#wfAskOpen').click();await p.locator('#wfAskContext summary').click();ck((await p.locator('#wfAskContextText').innerText()).includes('I would like some bread.'),'question context includes last verified correction');
  S.askMode='delay';await p.locator('#wfAskInput').fill('Why?');await p.evaluate(()=>{document.getElementById('wfAskSend').click();document.getElementById('wfAskSend').click();});await p.waitForTimeout(70);
  ck(S.asks.length===1,'double send creates one help request');await p.locator('#wfAskCancel').click();S.askMode='ok';S.pendingAsk.shift()();await p.waitForTimeout(70);
  ck((await p.locator('#wfAskAnswer').innerText())==='','late cancelled explanation is discarded');
  S.askMode='fail';await p.locator('#wfAskSend').click();await p.waitForFunction(()=>!document.getElementById('wfAskSend').disabled);ck((await p.locator('#wfAskState').innerText()).includes('받지 못'),'network failure offers retry without losing draft');
  S.askMode='ok';await p.locator('#wfAskSend').click();await p.waitForFunction(()=>document.getElementById('wfAskAnswer').textContent.length>0);ck(S.asks.length===3&&await p.locator('#wfAskInput').inputValue()==='Why?','explicit retry succeeds with same draft');
  S.askMode='delay';await p.locator('#wfAskSend').click();await p.waitForTimeout(70);await p.evaluate(()=>setLevel(6,false));S.askMode='ok';S.pendingAsk.shift()();await p.waitForTimeout(70);ck((await p.locator('#wfAskAnswer').innerText())==='','context change discards old explanation');
  await p.keyboard.press('Escape');await p.waitForFunction(()=>!document.getElementById('wfAsk').open&&!_warmPaused);ck(await p.evaluate(()=>_warmLevel===6&&!_warmPaused),'help close preserves changed settings');await F.close();
  const M=await fixture(1366,900,'en',false);M.S.chatMode='delay';
  await M.page.evaluate(()=>{document.getElementById('inp').value='pending answer';sendMsg();});await M.page.waitForFunction(()=>sending);while(!M.S.pendingChat.length)await M.page.waitForTimeout(10);
  const aiCount=await M.page.locator('#log .msg.ai').count();await M.page.locator('#wfAskOpen').click();M.S.chatMode='ok';M.S.pendingChat.shift()();await M.page.waitForTimeout(80);
  ck(await M.page.locator('#log .msg.ai').count()===aiCount,'late main reply cannot overwrite practice after question interrupts it');await M.page.keyboard.press('Escape');await M.page.waitForFunction(()=>!_warmPaused);await sendAnswer(M.page,'a new answer');
  ck(M.S.chat.length===3,'interrupted main turn is not automatically resent or duplicated');
  await M.page.evaluate(()=>{window.__realWarmupFetch=warmupFetch;window.__streamEnd=null;warmupFetch=function(url,options){if(String(url).endsWith('/api/warmup/chat'))return Promise.resolve(new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('data: '+JSON.stringify({t:'Partial streamed sentence.'})+'\n\n'));window.__streamEnd=function(){c.enqueue(new TextEncoder().encode('data: '+JSON.stringify({done:true,ok:true,status:200,ai_response:'OLD STREAM FINISH'})+'\n\n'));c.close();};}}),{headers:{'content-type':'text/event-stream'}}));return __realWarmupFetch(url,options);};document.getElementById('inp').value='streaming answer';sendMsg();});
  await M.page.waitForFunction(()=>sending&&!!__streamEnd);await M.page.locator('#wfAskOpen').click();await M.page.evaluate(()=>__streamEnd());await M.page.waitForTimeout(80);
  ck(!(await M.page.locator('#log').innerText()).includes('OLD STREAM FINISH'),'late stream final is discarded after help pauses its generation');
  await M.page.locator('#wfAskClose').click();await M.page.waitForFunction(()=>!_warmPaused);await M.page.evaluate(()=>warmupFetch=__realWarmupFetch);await M.close();
 }
 // Background changes preserve the active session and settings; stale loads cannot override selection.
 if(group==='all'||group==='background'){
  const F=await fixture(1366,900,'en',false),{page:p,S}=F;await openPrefs(p);
  const state=await p.evaluate(()=>JSON.stringify([SESSION_ID,WCTX,_warmLevel,_warmLang,_warmAge,_wuCorrMode,_rateLevel,_warmEpoch,document.getElementById('log').textContent]));
  S.bgHold={file:'space.webp'};await p.locator('#wfBackground').selectOption('space');await p.waitForTimeout(60);await p.locator('#wfBackground').selectOption('bakery');await p.waitForFunction(()=>document.getElementById('wfStage').dataset.background==='bakery');S.bgHold.release();S.bgHold=null;await p.waitForTimeout(80);
  ck(await p.locator('#wfStage').getAttribute('data-background')==='bakery','late older background cannot overwrite latest choice');
  ck(state===await p.evaluate(()=>JSON.stringify([SESSION_ID,WCTX,_warmLevel,_warmLang,_warmAge,_wuCorrMode,_rateLevel,_warmEpoch,document.getElementById('log').textContent])),'background changes preserve conversation/avatar settings and epoch');
  S.bgFail='train.webp';await p.locator('#wfBackground').selectOption('train');await p.waitForFunction(()=>document.getElementById('wfStage').dataset.background==='plain');ck((await p.locator('#wfBackgroundStatus').innerText()).includes('가져오지 못'),'background failure has plain fallback and retry notice');S.bgFail=null;await p.locator('#wfBackgroundRetry').click();await p.waitForFunction(()=>document.getElementById('wfStage').dataset.background==='train');ck(true,'explicit background retry recovers the failed asset');await p.locator('#wfBackground').selectOption('bakery');await p.waitForFunction(()=>document.getElementById('wfStage').dataset.background==='bakery');
  await p.locator('#wfBackgroundLock').check();await p.locator('#wfBackgroundMode').selectOption('auto');await p.locator('#wfPreferencesClose').click();await p.evaluate(()=>{LESSON_TOPIC='space';MangoWarmupFlow.contextChanged();});ck(await p.locator('#wfStage').getAttribute('data-background')==='bakery','locked visible background survives situation change');
  await openPrefs(p);await p.locator('#wfBackgroundLock').uncheck();await p.waitForFunction(()=>document.getElementById('wfStage').dataset.background==='space');await p.locator('#wfPreferencesClose').click();ck(true,'unlock auto selects appropriate situation');
  await F.close();
 }
 // Recovered user-owned backgrounds must decode and remain selectable on each layout.
 if(group==='all'||group==='extra-backgrounds'){
  for(const [w,h,touch] of [[390,844,true],[768,1024,true],[1366,900,false]]){
   const F=await fixture(w,h,'en',touch),{page:p,S}=F;await openPrefs(p);
   const session=await p.evaluate(()=>SESSION_ID),turns=S.chat.length;
   for(const key of ['runway','raft']){
    await p.locator('#wfBackground').selectOption(key);
    await p.waitForFunction(k=>document.getElementById('wfStage').dataset.background===k,key);
    ck(await p.locator('#wfStage').evaluate((e,k)=>e.style.backgroundImage.includes('hf-'+k+'.webp'),key),w+' '+key+' actual image decodes and paints');
    ck(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),w+' '+key+' no horizontal overflow');
   }
   ck(await p.evaluate(()=>SESSION_ID)===session&&S.chat.length===turns,w+' background selection preserves session without AI calls');
   await p.locator('#wfPreferencesClose').click();await p.reload();await p.waitForFunction(()=>window.MangoWarmupFlow&&!sending&&document.getElementById('wfStage').dataset.background==='raft');
   ck(true,w+' new background preference survives reload');
   await openPrefs(p);await p.locator('#wfBackgroundMode').selectOption('auto');await p.locator('#wfPreferencesClose').click();
   for(const [key,topic] of [['runway',"Let's talk about a runway"],['raft',"Let's talk about a raft"],['runway','现在聊聊跑道'],['raft','现在聊聊木筏']]){
    await p.evaluate(t=>MangoWarmupFlow.onMessage(t,'me'),topic);await p.waitForFunction(k=>document.getElementById('wfStage').dataset.background===k,key);
    ck(true,w+' explicit topic '+topic+' selects '+key);
   }
   if(shots)await p.screenshot({path:join(shots,'extra-background-'+w+'.png'),fullPage:true});
   ck(!F.errors.length,w+' new backgrounds have no JavaScript errors');await F.close();
  }
 }
 // Presets are explicit; custom changes and the existing automatic-mic choice survive.
 if(group==='all'||group==='accessibility'){
  const F=await fixture(390,844,'en',true),{page:p}=F;await p.evaluate(()=>{WarmupAutoTalk.setMode('button');setRate(4);});await openPrefs(p);await p.locator('#wfSettingsDetail').evaluate(e=>e.open=true);await p.locator('#wfRate').selectOption('2');await p.locator('#wfCorrection').selectOption('balanced');await p.locator('#wfPreferencesClose').click();
  await openPrefs(p);ck(await p.locator('#wfRate').inputValue()==='2'&&await p.locator('#wfCorrection').inputValue()==='balanced','individual settings survive reopening');await p.locator('#wfPresetfocus').click();ck(await p.evaluate(()=>_rateLevel===3&&_wuCorrMode==='focused'&&WarmupAutoTalk.mode()==='button'),'preset changes only explicit speed/subtitle/correction, not automatic mic');await p.locator('#wfPreferencesClose').click();
  await p.setViewportSize({width:844,height:390});ck(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'rotation keeps layout inside viewport');
  await p.evaluate(()=>addMsg('这是很长的中文句子。 긴 한국어 설명과 very long English sentence '.repeat(12),'ai'));await p.locator('#wfExpandOpen').click();ck((await p.locator('#wfLargeText').innerText()).length>200,'long multilingual sentence can be enlarged');await p.keyboard.press('Escape');
  await p.setViewportSize({width:390,height:844});await p.evaluate(()=>document.body.style.zoom='2');ck(await p.evaluate(()=>{const ok=document.documentElement.scrollWidth<=innerWidth+1;if(!ok)console.log('ZOOM_OVERFLOW',JSON.stringify(Array.from(document.querySelectorAll('body *')).filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.right>innerWidth+1;}).slice(0,18).map(e=>({id:e.id,cls:e.className,rect:e.getBoundingClientRect().toJSON()}))));return ok;}),'200% CSS zoom avoids horizontal clipping');await p.evaluate(()=>document.body.style.zoom='1');
  await p.locator('#wfAskOpen').click();await p.setViewportSize({width:390,height:400});await p.locator('#wfAskInput').scrollIntoViewIfNeeded();ck(await p.locator('#wfAskInput').evaluate(e=>{let r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}),'keyboard-height simulation keeps question input reachable');
  await p.setViewportSize({width:390,height:844});await p.evaluate(()=>{window.__vvpDescriptor=Object.getOwnPropertyDescriptor(window,'visualViewport');Object.defineProperty(window,'visualViewport',{configurable:true,value:{height:330,offsetTop:40}});dispatchEvent(new Event('resize'));});
  await p.waitForFunction(()=>getComputedStyle(document.documentElement).getPropertyValue('--wf-keyboard-bottom').trim()==='474px');
  ck(await p.locator('#wfAsk').evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=40&&r.bottom<=370;}),'visual-viewport-only keyboard and pan keep the whole panel above the keyboard');
  await p.evaluate(()=>{Object.defineProperty(window,'visualViewport',__vvpDescriptor);dispatchEvent(new Event('resize'));});await F.close();
 }
 // Situation policy: stable within a practice, suitable alternatives on a new practice.
 if(group==='all'||group==='policy'){
  const F=await fixture(1366,900,'en',false),{page:p}=F;p.on('dialog',d=>d.accept());
  await p.waitForFunction(()=>['bakery','restaurant'].includes(document.getElementById('wfStage').dataset.background));
  const first=await p.locator('#wfStage').getAttribute('data-background');await sendAnswer(p,'I would like bread.');
  ck(await p.locator('#wfStage').getAttribute('data-background')===first,'same conversation never randomly changes background');
  await p.evaluate(()=>newWarmupChat());await p.waitForFunction(prev=>!sending&&document.getElementById('wfStage').dataset.background!==prev&&['bakery','restaurant'].includes(document.getElementById('wfStage').dataset.background),first);
  ck(await p.locator('#wfStage').getAttribute('data-background')!==first,'new practice avoids repeating a suitable food scene');
  const sid=await p.evaluate(()=>SESSION_ID);await sendAnswer(p,'이제 우주 이야기를 하자');await p.waitForFunction(()=>document.getElementById('wfStage').dataset.background==='space');ck(await p.evaluate(()=>SESSION_ID)===sid,'explicit topic change selects scene without resetting the conversation');
  await p.evaluate(()=>{window.__realScene=MangoWarmupGuide.scene;MangoWarmupGuide.scene=()=>'shopping';MangoWarmupFlow.contextChanged();});await p.waitForFunction(()=>document.getElementById('wfStage').dataset.background==='shopping');ck(true,'explicit picture scene outranks an older lesson topic');await p.evaluate(()=>{MangoWarmupGuide.scene=__realScene;});
  await p.evaluate(()=>{LESSON_TOPIC='School';setAge('adult',false);MangoWarmupFlow.contextChanged();});await p.waitForFunction(()=>document.getElementById('wfStage').dataset.background==='library');ck(true,'adult school topic selects library, not playground');
  await openPrefs(p);await p.locator('#wfBackground').selectOption('space');await p.waitForFunction(()=>document.getElementById('wfStage').dataset.background==='space');await p.locator('#wfPreferencesClose').click();
  await p.evaluate(()=>{LESSON_TOPIC='Food';MangoWarmupFlow.contextChanged();newWarmupChat();});await p.waitForFunction(()=>!sending);ck(await p.locator('#wfStage').getAttribute('data-background')==='space','manual background survives new session and topic');
  await openPrefs(p);await p.locator('#wfBackgroundMode').selectOption('plain');await p.locator('#wfPreferencesClose').click();await p.evaluate(()=>newWarmupChat());await p.waitForFunction(()=>!sending);ck(await p.locator('#wfStage').getAttribute('data-background')==='plain','plain preference survives new practice');await F.close();
 }
 // Shared audio engine, repeat cancellation and microphone hand-off, using a local test WAV.
 if(group==='all'||group==='panel-stream'){
  for(const [w,h,touch] of [[390,844,true],[1366,900,false]]){
   const F=await fixture(w,h,'en',touch),{page:p}=F;
   await p.evaluate(()=>{_speechOn=true;window.__wavStarts=0;document.addEventListener('play',()=>__wavStarts++,true);speak('Keep the original voice and mouth playing while adjusting the display.');});
   await p.waitForFunction(()=>_ttsAudio&&!_ttsAudio.paused);
   await p.evaluate(()=>{_ttsAudio.loop=true;window.__wavRestarts=0;_ttsAudio.addEventListener('play',()=>__wavRestarts++);window.__panelAudio=_ttsAudio;window.__panelSeq=_speakSeq;window.__panelEpoch=_warmEpoch;window.__panelSession=SESSION_ID;});
   for(const operation of ['manual','lock','plain','escape','cancel']){
    await openPrefs(p);
    if(operation==='manual')await p.locator('#wfBackground').selectOption('bakery');
    if(operation==='lock')await p.locator('#wfBackgroundLock').check();
    if(operation==='plain')await p.locator('#wfBackgroundMode').selectOption('plain');
    if(operation==='escape')await p.keyboard.press('Escape');
    else if(operation==='cancel')await p.locator('#wfPreferences').evaluate(d=>d.dispatchEvent(new Event('cancel',{cancelable:true}))&&d.close());
    else await p.locator('#wfPreferencesClose').click();
    await p.waitForTimeout(40);
    ck(await p.evaluate(()=>!_warmPaused&&_ttsAudio===__panelAudio&&!_ttsAudio.paused&&_speakSeq===__panelSeq&&_warmEpoch===__panelEpoch&&SESSION_ID===__panelSession),w+' '+operation+' preferences retain the same running WAV/sequence/epoch/session');
   }
   for(const close of ['button','escape']){
    await p.locator('#wfExpandOpen').click();
    ck(await p.evaluate(()=>!_warmPaused&&!_ttsAudio.paused&&_speakSeq===__panelSeq),w+' enlarged sentence leaves original audio running');
    if(close==='button')await p.locator('#wfLargeClose').click();else await p.keyboard.press('Escape');
    ck(await p.evaluate(()=>!_ttsAudio.paused&&_speakSeq===__panelSeq&&_warmEpoch===__panelEpoch),w+' enlarge '+close+' close does not stop or restart speech');
   }
   ck(await p.evaluate(()=>__wavRestarts===0),w+' display controls never restart WAV playback');
   ck(await p.evaluate(async()=>{var t=_ttsAudio.currentTime;await new Promise(r=>setTimeout(r,150));return Math.abs(_ttsAudio.currentTime-t)>.02;}),w+' original WAV timeline keeps advancing after display controls');
   await p.locator('#wfAskOpen').click();ck(await p.evaluate(()=>_warmPaused&&_ttsAudio.paused),w+' question still stops conflicting practice speech');
   await p.keyboard.press('Escape');await F.close();
  }
  async function stream(p,first){
   await p.evaluate(first=>{window.__flowFetch=warmupFetch;warmupFetch=function(url,options){if(String(url).endsWith('/api/warmup/chat'))return Promise.resolve(new Response(new ReadableStream({start(c){const send=o=>c.enqueue(new TextEncoder().encode('data: '+JSON.stringify(o)+'\n\n'));window.__pushSentence=t=>send({t});window.__finishStream=t=>{send({done:true,ok:true,status:200,ai_response:t});c.close();};if(first)__pushSentence(first);}}),{headers:{'content-type':'text/event-stream'}}));return __flowFetch(url,options);};document.getElementById('inp').value='new streamed turn';sendMsg();},first);
   await p.waitForFunction(()=>sending&&typeof __pushSentence==='function');
   if(first)await p.waitForFunction(()=>document.querySelector('.stm-preview'));
  }
  {
   const F=await fixture(),{page:p,S}=F;await stream(p,'Visible streamed first sentence.');
   await p.locator('#wfExpandOpen').click();ck((await p.locator('#wfLargeText').innerText()).includes('Visible streamed first sentence.')&&await p.evaluate(()=>!_warmPaused&&sending),'enlarge reads actual preview without cancelling delayed SSE');
   await p.evaluate(()=>__pushSentence('Next streamed sentence.'));await p.waitForFunction(()=>document.getElementById('wfLargeText').textContent.includes('Next streamed sentence.'));ck(true,'open enlargement follows subsequent streamed sentence');
   await p.evaluate(()=>__finishStream('Final completed reply.'));await p.waitForFunction(()=>!sending);await p.waitForFunction(()=>document.getElementById('wfLargeText').textContent==='Final completed reply.');ck(true,'enlarge follows confirmed replacement at stream completion');
   await p.keyboard.press('Escape');await p.locator('#wfAskOpen').click();await p.locator('#wfAskInput').fill('Explain this');await p.locator('#wfAskSend').click();await p.waitForFunction(()=>document.getElementById('wfAskAnswer').textContent.length>0);
   ck(S.asks.at(-1).lines[0]==='Final completed reply.','completed question references the final visible reply');
   await p.keyboard.press('Escape');await p.evaluate(()=>{warmupFetch=__flowFetch;});
   await p.waitForFunction(()=>!_warmPaused);await p.locator('#tbHelp').click();await p.locator('[data-tb=tbHist]').click();await p.evaluate(()=>{_speechOn=true;});await p.locator('#log .msg.ai .replay-btn').first().click();await p.waitForFunction(()=>_ttsAudio&&!_ttsAudio.paused);await p.locator('#wfAskOpen').click();await p.locator('#wfAskInput').fill('Current sentence?');await p.locator('#wfAskSend').click();await p.waitForFunction(()=>document.getElementById('wfAskAnswer').textContent.length>0);
   ck(S.asks.at(-1).lines[0]==='Final completed reply.','replaying an older message does not relabel the currently displayed reply');await F.close();
  }
  {
   const F=await fixture(),{page:p,S}=F;await stream(p,'Frozen visible preview, not the old reply.');await p.locator('#wfAskOpen').click();
   ck((await p.locator('#wfAskContextText').textContent()).includes('Frozen visible preview')&&(await p.locator('#wfAskContextText').textContent()).includes('완성 답변'),'question labels the visible preview as unfinished');
   await p.evaluate(()=>__finishStream('LATE FINAL MUST NOT REPLACE SNAPSHOT'));await p.waitForFunction(()=>!sending);
   await p.locator('#wfAskInput').fill('Explain the visible text');await p.locator('#wfAskSend').click();await p.waitForFunction(()=>document.getElementById('wfAskAnswer').textContent.length>0);
   ck(S.asks.at(-1).lines[0]==='Frozen visible preview, not the old reply.','cancelled stream retains the exact question-opening snapshot after preview removal');
   ck(!(await p.locator('#wfAskContextText').textContent()).includes('LATE FINAL'),'late SSE cannot overwrite frozen question context');S.askMode='delay';await p.locator('#wfAskSend').click();while(!S.pendingAsk.length)await p.waitForTimeout(10);await p.locator('#wfAskCancel').click();S.pendingAsk.splice(0).forEach(r=>r());S.askMode='ok';
   ck((await p.locator('#wfAskContextText').textContent()).includes('Frozen visible preview'),'question cancel retains the frozen displayed sentence');
   await p.keyboard.press('Escape');await p.evaluate(()=>{warmupFetch=__flowFetch;});await sendAnswer(p,'next turn');await p.locator('#wfAskOpen').click();await p.locator('#wfAskInput').fill('New turn?');await p.locator('#wfAskSend').click();await p.waitForFunction(()=>document.getElementById('wfAskAnswer').textContent.length>0);
   ck(S.asks.at(-1).lines[0]===en,'next turn replaces the earlier interrupted preview snapshot');await F.close();
  }
  {
   const F=await fixture(),{page:p,S}=F;await stream(p,null);await p.locator('#wfExpandOpen').click();
   ck((await p.locator('#wfLargeText').textContent()).includes('받는 중'),'enlarge shows waiting state instead of old sentence before first SSE text');await p.keyboard.press('Escape');await p.locator('#wfAskOpen').click();
   ck(await p.locator('#wfAskSend').isDisabled(),'question cannot send the previous sentence as a new response before any SSE text');
   ck((await p.locator('#wfAskContextText').textContent()).includes('아직 받지 못'),'missing new sentence is explained explicitly');await p.evaluate(()=>__finishStream('discard'));await p.keyboard.press('Escape');ck(S.asks.length===0,'blocked pre-sentence question never reaches API');await F.close();
  }
  {
   const F=await fixture(),{page:p}=F;await stream(p,null);await p.locator('#wfExpandOpen').click();await p.evaluate(()=>{pauseWarmup();__finishStream('discard');});await p.waitForFunction(()=>!sending);await p.waitForTimeout(30);
   ck((await p.locator('#wfLargeText').textContent()).includes('받기 전에 중단'),'interruption before the first SSE sentence cannot reveal the old reply as current');await F.close();
  }
  {
   const F=await fixture(),{page:p}=F;await stream(p,'This preview will finish with repeated wording.');await p.locator('#wfExpandOpen').click();await p.evaluate(t=>__finishStream(t),en);await p.waitForFunction(()=>!sending);await p.waitForTimeout(30);
   ck(await p.locator('#wfLargeText').textContent()===en,'a new completed reply identical to an earlier reply is not mislabelled as interrupted');await F.close();
  }
  {
   const F=await fixture(),{page:p}=F;await stream(p,'Old cancelled preview still waiting for its SSE final.');await p.locator('#wfAskOpen').click();await p.keyboard.press('Escape');await p.waitForFunction(()=>!_warmPaused);await p.evaluate(()=>{window.__finishOld=__finishStream;warmupFetch=__flowFetch;});
   await p.locator('#wfExpandOpen').click();await stream(p,null);await p.waitForTimeout(30);
   ck((await p.locator('#wfLargeText').textContent()).includes('받는 중')&&!(await p.locator('#wfLargeText').textContent()).includes('중단'),'new pending turn replaces the old preview state without an interruption label');
   await p.evaluate(()=>__finishOld('OLD LATE FINAL'));await p.waitForFunction(()=>!document.querySelector('.stm-preview'));await p.waitForTimeout(30);
   ck(await p.evaluate(()=>sending&&!!document.querySelector('.typing'))&&(await p.locator('#wfLargeText').textContent()).includes('받는 중')&&!(await p.locator('#wfLargeText').textContent()).includes('중단'),'removing the cancelled old preview preserves the active new request waiting state');
   if(shots)await p.screenshot({path:join(shots,'pending-after-old-preview-removal.png')});
   await p.evaluate(()=>__pushSentence('The new request sentence has arrived.'));await p.waitForFunction(()=>document.getElementById('wfLargeText').textContent.includes('The new request sentence'));
   ck(!(await p.locator('#wfLargeText').textContent()).includes('중단'),'new sentence arrival replaces waiting state with the live preview');
   await p.evaluate(()=>__finishStream('The new request is complete.'));await p.waitForFunction(()=>!sending);await p.waitForFunction(()=>document.getElementById('wfLargeText').textContent==='The new request is complete.');
   ck(true,'new request completion replaces preview with the confirmed text');await F.close();
  }
  {
   const F=await fixture(),{page:p}=F;await stream(p,'Visible interrupted enlarged preview.');await p.locator('#wfExpandOpen').click();
   await p.evaluate(()=>{pauseWarmup();__finishStream('discarded');});await p.waitForFunction(()=>!document.querySelector('.stm-preview'));
   ck((await p.locator('#wfLargeText').textContent()).includes('중단되기 전')&&(await p.locator('#wfLargeText').textContent()).includes('Visible interrupted'),'interrupted enlargement keeps a clearly labelled snapshot instead of falling back to old text');await F.close();
  }
 }
 if(group==='all'||group==='panel-auto'){
  for(const panel of ['wfPreferences','wfLarge'])for(const closing of ['button','escape','cancel']){
   const F=await fixture(),{page:p,S}=F;
   await p.evaluate(()=>{_speechOn=true;_audioUnlocked=true;speak('Keep speaking while the display panel is open.');});await p.waitForFunction(()=>_ttsAudio&&!_ttsAudio.paused);
   await p.evaluate(()=>{WarmupAutoTalk.setMode('auto');window.__autoPanelAudio=_ttsAudio;window.__autoPanelSeq=_speakSeq;});
   await p.locator(panel==='wfPreferences'?'#wfPreferencesOpen':'#wfExpandOpen').click();
   ck(await p.evaluate(()=>!_warmPaused&&!_ttsAudio.paused&&_ttsAudio===__autoPanelAudio&&_speakSeq===__autoPanelSeq),panel+'/'+closing+' retains active TTS while deferring auto recording');
   await p.waitForFunction(()=>_ttsAudio.ended);await p.waitForTimeout(850);
   ck(await p.evaluate(()=>__mic.starts===0&&!_recognizing&&WarmupAutoTalk._state.panelDeferred),panel+'/'+closing+' TTS completion cannot open the microphone behind modal');
   if(shots&&closing==='button')await p.screenshot({path:join(shots,'auto-held-'+panel+'.png')});
   if(closing==='button')await p.locator('#'+panel+'Close').click();else if(closing==='escape')await p.keyboard.press('Escape');else await p.locator('#'+panel).evaluate(d=>{d.dispatchEvent(new Event('cancel',{cancelable:true}));d.close();});
   await p.waitForFunction(()=>__mic.starts===1&&_recognizing);await p.evaluate(()=>_autoHook('panelClose'));await p.waitForTimeout(800);
   ck(await p.evaluate(()=>__mic.starts===1&&_recognizing),panel+'/'+closing+' close resumes one deferred auto recorder without duplicates');
   ck(S.chat.length===1,panel+'/'+closing+' modal actions never send a learner turn');await F.close();
  }
  for(const panel of ['wfPreferences','wfLarge']){
   const F=await fixture(),{page:p,S}=F;await p.evaluate(()=>{_audioUnlocked=true;WarmupAutoTalk.setMode('button');toggleMic();});await p.waitForFunction(()=>_recognizing);await p.evaluate(()=>document.getElementById('inp').value='keep my draft');
   await p.locator(panel==='wfPreferences'?'#wfPreferencesOpen':'#wfExpandOpen').click();await p.waitForFunction(()=>!_recognizing);
   ck((await p.locator('#'+panel+'RecordingNote').textContent()).includes('취소')&&await p.evaluate(()=>__mic.stops===1),panel+' visibly cancels an already active practice recording');
   await p.keyboard.press('Escape');await p.waitForTimeout(850);
   ck(await p.evaluate(()=>__mic.starts===1&&!_recognizing)&&await p.locator('#inp').inputValue()==='keep my draft'&&S.chat.length===1,panel+' manual recorder stays stopped and preserves draft without sending');await F.close();
  }
  {
   const F=await fixture(),{page:p,S}=F;await p.evaluate(()=>{_audioUnlocked=true;WarmupAutoTalk.setMode('auto');});await p.waitForFunction(()=>_recognizing&&__mic.starts===1);await p.locator('#wfPreferencesOpen').click();await p.waitForFunction(()=>!_recognizing);
   ck((await p.locator('#wfPreferencesRecordingNote').textContent()).includes('취소'),'already active automatic recorder is stopped with a visible notice');await p.keyboard.press('Escape');await p.waitForFunction(()=>__mic.starts===2&&_recognizing);await p.waitForTimeout(1000);
   ck(await p.evaluate(()=>__mic.starts===2)&&S.chat.length===1,'automatic recorder resumes once after cancellation and close without submitting');await F.close();
  }
  {
   const F=await fixture(),{page:p,S}=F;await p.evaluate(()=>{_audioUnlocked=true;WarmupAutoTalk.setMode('button');_micPreferWhisper=true;window.__lateVoice=null;window.__cancelVoiceCount=0;MangoiVoice.supported=()=>true;MangoiVoice.record=()=>new Promise(r=>__lateVoice=r);MangoiVoice.cancel=()=>{__cancelVoiceCount++;};toggleMic();});await p.waitForFunction(()=>_whisperOn);await p.locator('#wfExpandOpen').click();
   ck(await p.evaluate(()=>!_whisperOn&&!_recognizing&&__cancelVoiceCount===1),'display modal cancels the existing Whisper path without TTS interruption');await p.evaluate(()=>__lateVoice('late cancelled words'));await p.waitForTimeout(80);
   ck((await p.locator('#inp').inputValue())===''&&S.chat.length===1,'cancelled transcription cannot submit or replace the draft behind modal');await F.close();
  }
  {
   const F=await fixture(),{page:p}=F;await p.evaluate(()=>{WarmupAutoTalk.setMode('button');toggleMic();window.__staleResult=_recog.onresult;window.__staleEnd=_recog.onend;window.__whisperStarts=0;MangoiVoice.supported=()=>true;MangoiVoice.record=()=>{__whisperStarts++;return new Promise(()=>{});};_recog.onerror({error:'network'});document.getElementById('inp').value='safe draft';document.getElementById('wfPreferencesOpen').click();});await p.waitForTimeout(450);
   ck(await p.evaluate(()=>__whisperStarts===0&&!_recognizing&&!_whisperOn),'opening display modal invalidates a delayed STT network-to-Whisper retry');await p.evaluate(()=>{__staleResult({});__staleEnd();});
   ck(await p.locator('#inp').inputValue()==='safe draft','stale STT result/end callbacks cannot erase the draft in the modal');await p.keyboard.press('Escape');await p.evaluate(()=>toggleMic());await p.waitForFunction(()=>_recognizing);await p.evaluate(()=>__staleEnd());
   ck(await p.evaluate(()=>__mic.starts===2&&_recognizing),'new manual recording works after close while cancelled-generation callbacks stay fenced');await F.close();
  }
  {
   const F=await fixture(),{page:p}=F;await p.evaluate(()=>{WarmupAutoTalk.setMode('button');toggleMic();window.__retryAttempts=0;_recog.start=()=>{__retryAttempts++;throw Error('fixture restart failed');};_recog.onend();document.getElementById('wfExpandOpen').click();});await p.waitForTimeout(400);
   ck(await p.evaluate(()=>__retryAttempts===1&&__mic.starts===1&&!_recognizing),'display modal invalidates the delayed recognition restart without starting another mic');await p.keyboard.press('Escape');await p.evaluate(()=>toggleMic());await p.waitForFunction(()=>_recognizing);
   ck(await p.evaluate(()=>__mic.starts===2),'a fresh recorder still starts after a cancelled retry and modal close');await F.close();
  }
  {
   const F=await fixture(),{page:p}=F;await p.evaluate(()=>{_speechOn=true;_audioUnlocked=true;speak('Question interrupts this speech.');});await p.waitForFunction(()=>_ttsAudio&&!_ttsAudio.paused);await p.evaluate(()=>WarmupAutoTalk.setMode('auto'));await p.locator('#wfAskOpen').click();await p.waitForTimeout(850);
   ck(await p.evaluate(()=>_warmPaused&&_ttsAudio.paused&&__mic.starts===0),'question modal still stops speech and blocks automatic recording');await p.keyboard.press('Escape');await p.waitForTimeout(850);
   ck(await p.evaluate(()=>!_recognizing&&__mic.starts===0),'question close does not silently arm a new automatic recording');await F.close();
  }
  {
   const F=await fixture(),{page:p}=F;await sendAnswer(p,'I want bread.');await p.evaluate(()=>{_speechOn=true;WarmupAutoTalk.setMode('button');});const repeat=p.locator('.fix-card .fix-btn').last();await repeat.click();await p.waitForFunction(()=>_ttsAudio&&!_ttsAudio.paused);await p.locator('#wfPreferencesOpen').click();
   ck((await p.locator('#wfPreferencesRecordingNote').textContent()).includes('따라 말하기')&&await repeat.isEnabled(),'display modal cancels the pending repeat microphone handoff and re-enables its button');await p.waitForTimeout(2800);
   ck(await p.evaluate(()=>__mic.starts===0&&!_recognizing),'explicit repeat handoff cannot open a recorder behind display modal');await p.keyboard.press('Escape');await repeat.click();await p.waitForFunction(()=>_recognizing);
   ck(await p.evaluate(()=>__mic.starts===1&&!!_repeatTarget),'repeat remains usable after the display modal closes');await F.close();
  }
 }
 if(group==='all'||group==='media'){
  const F=await fixture(1366,900,'en',false),{page:p,S}=F;S.audio=true;await sendAnswer(p,'I want bread.');
  await p.evaluate(()=>{_ttsCache={};_speechOn=true;window.__avatarStarts=0;window.__avatarStops=0;var a=MangoAvatar.plainStart,b=MangoAvatar.plainStop;MangoAvatar.plainStart=function(){__avatarStarts++;return a.apply(this,arguments);};MangoAvatar.plainStop=function(){__avatarStops++;return b.apply(this,arguments);};});
  await p.locator('#log .msg.ai .replay-btn').last().click();await p.waitForFunction(()=>__avatarStarts>0&&_ttsAudio&&!_ttsAudio.paused);
  ck(true,'existing local-audio play event starts original avatar');await p.locator('#wfAskOpen').click();
  ck(await p.evaluate(()=>_ttsAudio.paused&&__avatarStops>0&&!_recognizing),'question opening stops practice TTS and mouth through existing stop path');
  await p.keyboard.press('Escape');await p.waitForFunction(()=>!_warmPaused);
  const prior=await p.evaluate(()=>__avatarStarts);await p.locator('#log .msg.ai .replay-btn').last().click();await p.waitForFunction(n=>__avatarStarts>n,prior);ck(true,'audio and mouth restart after help closes');await p.evaluate(()=>_stopSpeak());
  const repeat=p.locator('.fix-card .fix-btn').last();await repeat.click();await p.locator('#wfAskOpen').click();await p.waitForTimeout(500);
  ck(await p.evaluate(()=>!_recognizing&&__mic.starts===0),'opening help cancels pending correction microphone hand-off');
  await p.keyboard.press('Escape');await p.waitForFunction(()=>!_warmPaused);ck(await repeat.isEnabled(),'cancelled repeat button becomes usable again');
  await p.evaluate(()=>{_speechOn=false;});await repeat.click();await p.waitForFunction(()=>_recognizing);ck(await p.evaluate(()=>__mic.starts===1&&!!_repeatTarget),'correction repeat arms exactly one existing practice mic and text-match target');
  await p.locator('#wfAskOpen').click();ck(await p.evaluate(()=>!_recognizing&&__mic.aborts>=1),'opening question cancels existing practice recorder');
  await p.evaluate(()=>{window.__questionResolve=null;window.__questionCancels=0;MangoiVoice.supported=()=>true;MangoiVoice.record=o=>{o.onState('speaking');return new Promise(r=>__questionResolve=r);};MangoiVoice.cancel=()=>{__questionCancels++;};});
  await p.locator('#wfAskInput').fill('keep this draft');await p.locator('#wfAskMic').click();ck(await p.locator('#wfAskSend').isDisabled(),'question recording and send cannot overlap');
  await p.keyboard.press('Escape');await p.waitForFunction(()=>!_warmPaused);await p.evaluate(()=>__questionResolve('late transcription'));await p.waitForTimeout(50);
  ck(await p.locator('#wfAskInput').inputValue()==='keep this draft'&&await p.evaluate(()=>__questionCancels>=1),'late cancelled question transcription cannot overwrite draft');
  ck(S.asks.length===0,'question microphone never automatically submits or awards a reply');
  await openPrefs(p);await p.locator('#wfBackgroundMode').selectOption('plain');await p.locator('#wfPreferencesClose').click();
  const eyeFrames=await p.evaluate(async()=>{const c=document.getElementById('tavatar-canvas'),seen=new Set();for(let i=0;i<65;i++){const data=c.getContext('2d').getImageData(Math.floor(c.width*.2),Math.floor(c.height*.18),Math.floor(c.width*.6),Math.floor(c.height*.3)).data;let h=0;for(let j=0;j<data.length;j+=4)h=(h*31+data[j])|0;seen.add(h);await new Promise(r=>setTimeout(r,120));}return seen.size;});
  ck(eyeFrames>1,'original eye region animates after help and background changes');await F.close();
 }
 if(group==='all'||group==='iframe'){
  const F=await fixture(1366,1000,'en',false),{page:p}=F;await p.goto(base+'/qa-host.html');const frame=p.frames().find(f=>f.url().includes('warmup.html'));await frame.waitForFunction(()=>window.MangoWarmupFlow&&!sending);
  await frame.evaluate(()=>{_stopSpeak();_speechOn=false;WarmupAutoTalk.setMode('auto');});ck(await frame.evaluate(()=>!WarmupAutoTalk.isOn()),'classroom iframe still forbids automatic recording');
  await frame.locator('#wfAskOpen').click();await frame.locator('#wfAskClose').click();await frame.waitForFunction(()=>!_warmPaused);
  ck(await p.evaluate(()=>teacherStops===0&&teacherTrack.readyState==='live'),'question open/close never stops parent teacher media track');await p.evaluate(()=>{teacherTrack.stop();teacherContext.close();});await F.close();
 }
 if(group==='all'||group==='storage'){
  const F=await fixture(390,844,'en',true,false,true),{page:p,errors}=F;await openPrefs(p);await p.locator('#wfBackgroundMode').selectOption('plain');ck((await p.locator('#wfPreferenceNote').innerText()).includes('저장하지 못'),'blocked storage reports session-only preference');await p.locator('#wfPreferencesClose').click();ck(!errors.length,'blocked storage keeps practice usable');await F.close();
  const U=await fixture(1366,900,'en',false);await U.page.evaluate(()=>wuToggleUiLang());ck((await U.page.locator('#wfAskOpen').innerText()).includes('Ask a question'),'existing UI-language change updates added controls');
  await U.page.evaluate(()=>document.querySelector('.wrap').style.width='620px');ck(await U.page.locator('#wfStage').evaluate(e=>getComputedStyle(e).display==='flex'),'layout follows actual 620px container in a wide PC viewport');await U.close();
 }
 console.log('warmup-flow-browser PASS '+passed);
}finally{await browser.close();await new Promise(r=>server.close(r));}
