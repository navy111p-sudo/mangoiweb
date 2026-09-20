// Real DOM / input / deferred network checks. AI and microphone providers are stubbed.
import {createServer} from 'node:http';
import {readFile, mkdir} from 'node:fs/promises';
import {join,extname,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {requireBrowser} from './_pw.mjs';
const root=join(dirname(fileURLToPath(import.meta.url)),'../../cloudflare-deploy/public');
const qaFont=process.env.WARMUP_QA_FONT;
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.mp4':'video/mp4'};
const server=createServer(async(req,res)=>{try{
  const name=decodeURIComponent(req.url.split('?')[0]);
  res.setHeader('Content-Type',mime[extname(name)]||'application/octet-stream');
  if(name==='/qa-font.ttf' && qaFont){res.setHeader('Content-Type','font/ttf');res.end(await readFile(qaFont));return;}
  res.end(await readFile(join(root,name)));
}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
const {chromium,exe}=requireBrowser();
const browser=await chromium.launch({executablePath:exe,args:['--no-sandbox'],env:{...process.env,FONTCONFIG_PATH:'/etc/fonts',FONTCONFIG_FILE:'/etc/fonts/fonts.conf'}});
const shotDir=process.env.WARMUP_SCREENSHOTS;
if(shotDir)await mkdir(shotDir,{recursive:true});
let pass=0;
function ck(name,condition){assert.ok(condition,name);pass++;console.log('PASS '+name);}
async function setup(w,h,query=''){
  const page=await browser.newPage({viewport:{width:w,height:h}}), requests=[],errors=[],mediaRequests=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    localStorage.setItem('mangoi_warmup_level','3');
    window.__mic={start:0,abort:0,cancel:0};
    window.SpeechRecognition=class{
      start(){window.__mic.start++;this.onstart?.();}
      stop(){this.onend?.();}
      abort(){window.__mic.abort++;}
    };
  });
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname.startsWith('/video/warmup-scenes/'))mediaRequests.push(url.pathname);
    if(url.origin!==base){await route.abort();return;}
    if(!url.pathname.startsWith('/api/')){await route.continue();return;}
    const body=route.request().postDataJSON();
    if(url.pathname==='/api/warmup/chat'){
      requests.push(body);
      const zh=body.lang==='zh';
      await route.fulfill({json:{ai_response:zh?'你想学什么？':requests.length===1?'What would you like to learn?':'Pasta sounds good. Who would you cook it for?',
        speaking_help:zh?{words:['想','学'],frame:'我想学____。',example:'我想学做饭。'}:{words:['cook','family'],frame:'I want to cook for ____.',example:'I want to cook for my family.'},answer_chips:[]}});return;
    }
    if(url.pathname==='/api/warmup/context'){await route.fulfill({json:{ok:true,textbook:'SIU ADVANCE 009',sentences:['I want to learn something new.']}});return;}
    if(url.pathname==='/api/warmup/questions'){requests.push(body);await route.fulfill({json:{ok:true,answer_chips:['Yes, I do.'],questions:['Do you like cooking?']}});return;}
    if(url.pathname==='/api/voice/tts'){await route.fulfill({status:503,body:''});return;}
    await route.fulfill({json:{ok:true}});
  });
  await page.goto(base+'/warmup.html?setup=0&textbook=SIU%20ADVANCE%20009&unit=Goals%20and%20dreams'+query);
  await page.waitForFunction(()=>document.querySelector('#log .msg.ai'));
  if(shotDir && qaFont){await page.addStyleTag({content:"@font-face{font-family:'QA Korean';src:url('/qa-font.ttf')}html body,html body *{font-family:'QA Korean',sans-serif!important}"});await page.evaluate(()=>document.fonts.ready);}
  await page.evaluate(()=>{_speechOn=false;_stopSpeak();});
  return {page,requests,errors,mediaRequests};
}
try{
  for(const [w,h] of [[390,844],[768,1024],[1366,768]]){
    const {page,requests,errors}=await setup(w,h);
    ck(w+' no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    if(shotDir)await page.screenshot({path:join(shotDir,'review-'+w+'.png'),fullPage:true});
    ck(w+' microphone initially reachable',await page.locator('#micBtn').evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}));
    ck(w+' no help or full example on arrival',await page.locator('#wgHelp').isHidden());
    await page.locator('[data-scene=cooking]').click();
    await page.waitForFunction(()=>!sending&&document.querySelector('#wgScene:not([hidden])'));
    ck(w+' selecting picture is not a student answer',await page.locator('#log .msg.me').count()===0);
    ck(w+' scene selection reaches history API',requests.some(r=>r.pick&&r.scene_id==='cooking'));
    await page.locator('#wgHelpOpen').click();await page.locator('#wgHelpNext').click();
    ck(w+' first help is words only',!(await page.locator('#wgHelpOutput').innerText()).includes('I want'));
    await page.locator('#wgHelpNext').click();
    ck(w+' second help is incomplete frame',(await page.locator('#wgHelpOutput').innerText()).includes('____'));
    await page.locator('#wgHelpNext').click();
    await page.locator('#wgHelpActions button').click();
    ck(w+' example fills draft without submitting',await page.locator('#log .msg.me').count()===0);
    await page.locator('#inp').fill('I want to cook pasta.');await page.locator('#sendBtn').click();
    await page.waitForFunction(()=>!sending);
    ck(w+' one submitted answer',await page.locator('#log .msg.me').count()===1);
    ck(w+' latest question visible',(await page.locator('#log').innerText()).includes('Who would you cook it for'));
    ck(w+' older turn collapsed',await page.locator('#log .msg.ai:visible').count()===1);
    await page.locator('#wgHistory').click();
    ck(w+' conversation can be reopened',await page.locator('#log .msg.ai:visible').count()>=2);
    await page.locator('#wgHistory').click();
    await page.locator('#micBtn').click();
    ck(w+' mic starts only on click',await page.evaluate(()=>__mic.start===1&&_recognizing));
    await page.locator('#wgFinish').click();
    ck(w+' finish stops microphone',await page.evaluate(()=>__mic.abort===1&&!_recognizing&&_warmPaused));
    ck(w+' summary contains actual reply',(await page.locator('#wgSummaryText').innerText()).includes('I want to cook pasta.'));
    ck(w+' summary distinguishes example assistance',(await page.locator('#wgSummaryText').innerText()).includes('example-assisted: 1'));
    await page.locator('#wgSummaryBack').click();
    ck(w+' returning does not restart mic',await page.evaluate(()=>__mic.start===1&&!_warmPaused));
    ck(w+' no runtime errors',errors.length===0);
    if(shotDir){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:join(shotDir,'warmup-'+w+'.png'),fullPage:true});}
    await page.locator('#wgFinish').click();await page.locator('#wgSummaryNext').click();
    ck(w+' next activity menu is usable above closed summary',await page.locator('#mango-flow-overlay').isVisible()&&await page.locator('#wgSummary').isHidden());
    await page.evaluate(()=>MangoFlow.close());
    ck(w+' dismissing activity menu leaves input usable without restarting mic',await page.evaluate(()=>!_warmPaused&&__mic.start===1));
    await page.close();
  }
  {
    const {page,errors}=await setup(390,844,'&lang=zh');
    await page.locator('#wgHelpOpen').click();await page.locator('#wgHelpNext').click();
    ck('Chinese hints remain Chinese',(await page.locator('#wgHelpOutput').innerText()).includes('学'));
    ck('Chinese scene labels',await page.locator('[data-scene=cooking]').innerText()==='做饭');
    ck('Chinese has no runtime errors',errors.length===0);await page.close();
  }
  // All added cards must be reachable, select their own topic and play real media.
  // AI remains stubbed; these assertions exercise the shipped images and MP4 files.
  for(const lang of ['en','zh']){
    const {page,requests,mediaRequests,errors}=await setup(390,844,'&lang='+lang);
    const topics=[
      ['cooking','cooking','做饭'],['soccer','soccer','踢足球'],['train','travelling','旅行'],
      ['cycling','riding a bike','骑自行车'],['pets','caring for pets','照顾宠物'],
      ['painting','painting','画画'],['music','playing music','演奏音乐'],
      ['gardening','gardening','种花'],['shopping','shopping for food','买水果'],
      ['beach','playing at the beach','在海边玩']
    ];
    ck(lang+' ten distinct scene choices',await page.locator('#wgChoices button').count()===10 &&
      await page.locator('#wgChoices button').evaluateAll(bs=>new Set(bs.map(b=>b.dataset.scene)).size===10));
    ck(lang+' scene picker has a bounded scroll area',await page.locator('#wgChoices').evaluate(e=>e.scrollHeight>e.clientHeight&&e.clientHeight<=200));
    await page.evaluate(()=>{_warmLevel=1;});
    for(const [id,en,zh] of topics){
      await page.locator('#wgScenes').evaluate(e=>e.open=true);
      const choice=page.locator('[data-scene='+id+']');await choice.scrollIntoViewIfNeeded();
      await choice.locator('img').evaluate(img=>img.decode());
      await choice.click();await page.waitForFunction(()=>!sending);
      const q=lang==='zh'?'你喜欢'+zh+'吗？':'Do you like '+en+'?';
      ck(lang+' '+id+' sends its own easy question and scene',requests.some(r=>r.scene_id===id&&r.pick===q)&&
        (await page.locator('#log .msg.ai:visible').innerText()).includes(q));
      ck(lang+' '+id+' shows a loaded matching picture',await page.locator('#wgSceneImage').evaluate(img=>img.complete&&img.naturalWidth>0)&&
        await choice.getAttribute('aria-pressed')==='true');
      ck(lang+' '+id+' microphone remains reachable',await page.locator('#micBtn').evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}));
      if(lang==='en'){
        ck(id+' clip has not been prefetched',!mediaRequests.includes('/video/warmup-scenes/'+id+'.mp4'));
        await page.locator('#wgScenePlay').click();
        await page.waitForFunction(()=>document.querySelector('#wgSceneVideo').currentTime>0.1);
        ck(id+' real clip plays muted',await page.locator('#wgSceneVideo').evaluate(v=>!v.paused&&v.muted&&v.videoWidth>0&&v.duration>=4.9&&v.duration<=5.1));
        await page.locator('#wgScenePlay').click();
      }
    }
    ck(lang+' exploring scenes never submits student answers',await page.locator('#log .msg.me').count()===0);
    if(lang==='zh')ck('Chinese scene selection never preloads videos',mediaRequests.length===0);
    await page.evaluate(()=>{_warmLevel=3;});
    await page.locator('#wgScenes').evaluate(e=>e.open=true);
    await page.locator('[data-scene=music]').click();await page.waitForFunction(()=>!sending);
    await page.locator('#wgHelpOpen').click();
    for(let i=0;i<3;i++)await page.locator('#wgHelpNext').click();
    ck(lang+' goal example matches music scene',(await page.locator('#wgHelpOutput').innerText()).includes(lang==='zh'?'我想学弹钢琴。':'I want to learn to play the piano.'));
    ck(lang+' all ten scenes have no runtime errors',errors.length===0);
    await page.close();
  }
  {
    const {page,requests}=await setup(1366,768);
    let release;const delayed=new Promise(r=>release=r);
    await page.route('**/api/warmup/chat',async route=>{await delayed;try{await route.fulfill({json:{ai_response:'LATE RESPONSE',answer_chips:[]}});}catch{}});
    await page.locator('#inp').fill('I want to cook.');await page.locator('#sendBtn').click();
    await page.waitForFunction(()=>sending);
    await page.locator('#wgFinish').click();release();
    await page.waitForTimeout(150);
    ck('in-flight answer cannot speak or append after finish',!(await page.locator('#log').innerText()).includes('LATE RESPONSE'));
    await page.locator('#wgSummaryBack').click();
    await page.evaluate(()=>{window.MangoiVoice={supported:()=>true,cancel:()=>{__mic.cancel++;},record:()=>new Promise(r=>window.__resolveWhisper=r)};micViaWhisper();});
    await page.locator('#wgFinish').click();
    await page.evaluate(()=>__resolveWhisper('LATE TRANSCRIPT'));
    await page.waitForTimeout(100);
    ck('Whisper cancellation stops auto-send',!(await page.locator('#log').innerText()).includes('LATE TRANSCRIPT'));
    ck('Whisper recorder is cancelled',await page.evaluate(()=>__mic.cancel===1));
    await page.close();
  }
  {
    const {page}=await setup(1280,800);
    const before=await page.locator('#log .msg.me').count();
    await page.evaluate(()=>{ANS_DELAY_MS=10;showAnswerChips(['FULL EXAMPLE']);});
    await page.waitForTimeout(30);
    ck('idle hint does not reveal full example',!(await page.locator('#wgHelp').innerText()).includes('FULL EXAMPLE'));
    ck('idle hint does not submit an answer',await page.locator('#log .msg.me').count()===before);
    await page.route('**/qa-host',route=>route.fulfill({contentType:'text/html',body:'<section id="host"><iframe id="child" src="/warmup.html?setup=0" style="width:900px;height:700px" allow="microphone"></iframe></section>'}));
    await page.goto(base+'/qa-host');
    const frame=page.frameLocator('#child');
    await frame.locator('#micBtn').click();
    ck('embedded microphone starts on student click',await frame.locator('body').evaluate(()=>_recognizing));
    await page.locator('#host').evaluate(e=>e.style.display='none');
    await page.waitForTimeout(50);
    ck('hiding classroom tab stops warmup microphone',await frame.locator('body').evaluate(()=>_warmPaused&&!_recognizing&&__mic.abort===1));
    await page.locator('#host').evaluate(e=>e.style.display='block');
    await page.waitForTimeout(50);
    ck('returning classroom tab never restarts microphone',await frame.locator('body').evaluate(()=>!_warmPaused&&!_recognizing&&__mic.start===1));
    await page.close();
  }
  {
    const {page,mediaRequests,errors}=await setup(390,844);
    const video=page.locator('#wgSceneVideo');
    await page.locator('[data-scene=cooking]').click();await page.waitForFunction(()=>!sending);
    ck('scene video is not fetched on arrival or picture selection',mediaRequests.length===0);
    await page.locator('#wgScenePlay').click();
    await page.waitForFunction(()=>document.querySelector('#wgSceneVideo').currentTime>0.1);
    ck('scene video plays only after explicit click',await video.evaluate(v=>!v.paused));
    ck('scene video stays muted without autoplay or looping',await video.evaluate(v=>v.muted&&!v.autoplay&&!v.loop&&!v.controls));
    ck('scene video uses same-origin media',mediaRequests.includes('/video/warmup-scenes/cooking.mp4'));
    await page.locator('#micBtn').click();
    ck('microphone pauses scene video',await video.evaluate(v=>v.paused));
    await page.locator('#wgScenePlay').click();
    ck('scene video cannot start during recording',await video.evaluate(v=>v.paused));
    await page.evaluate(()=>{pauseWarmup();resumeWarmup();});
    await page.locator('#wgScenePlay').click();await page.waitForFunction(()=>!document.querySelector('#wgSceneVideo').paused);
    await page.locator('#wgScenes summary').click();await page.locator('[data-scene=soccer]').click();await page.waitForFunction(()=>!sending);
    ck('changing scene stops and unloads the previous clip',await video.evaluate(v=>v.paused&&!v.getAttribute('src')));
    await page.locator('#wgScenePlay').click();await page.waitForFunction(()=>document.querySelector('#wgSceneVideo').currentTime>0.1);
    await page.locator('#wgFinish').click();
    ck('finishing warmup pauses scene video',await video.evaluate(v=>v.paused));
    await page.locator('#wgSummaryBack').click();
    ck('returning to warmup does not restart scene video',await video.evaluate(v=>v.paused));
    await page.locator('#wgSceneClose').click();
    ck('closing picture unloads scene video',await video.evaluate(v=>!v.getAttribute('src')));
    await page.route('**/video/warmup-scenes/train.mp4',route=>route.abort());
    await page.locator('#wgScenes summary').click();await page.locator('[data-scene=train]').click();await page.waitForFunction(()=>!sending);
    await page.locator('#wgScenePlay').click();await page.waitForFunction(()=>document.querySelector('#wgVideoNotice').textContent.includes('불러오지'));
    ck('video failure falls back to usable picture',await page.locator('#wgSceneImage').isVisible()&&await video.isHidden());
    await page.locator('#inp').fill('I like travelling.');await page.locator('#sendBtn').click();await page.waitForFunction(()=>!sending);
    ck('conversation still works after video failure',await page.locator('#log .msg.me').count()===1);
    ck('scene playback has no runtime errors',errors.length===0);await page.close();
  }
  console.log('warmup-guided-browser — PASS '+pass+' / FAIL 0');
}finally{await browser.close();await new Promise(r=>server.close(r));}
