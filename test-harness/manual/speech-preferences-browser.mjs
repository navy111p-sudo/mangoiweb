// Entire production pages in Chromium; HTTP/API/SQLite all bound to localhost.
// No production account, AI request, microphone, or remote database is used.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createSpeechSandbox } from '../helpers/speech-sandbox.mjs';
const require=createRequire(import.meta.url);
const pwRoot=process.env.PW_DIR || process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
const {chromium}=require(pwRoot+(process.env.PW_DIR?'/node_modules/playwright':'/playwright'));
const sandbox=createSpeechSandbox();
const root=path.resolve('cloudflare-deploy/public');
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.mp3':'audio/mpeg'};
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/api/student/speech-preferences'){
      let body='';for await(const chunk of req)body+=chunk;
      const result=await sandbox.handle(new Request(url,{method:req.method,headers:req.headers,body:body||undefined}));
      res.writeHead(result.status,Object.fromEntries(result.headers));res.end(await result.text());return;
    }
    if(url.pathname.startsWith('/api/')){
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,items:[],data:[],gam:{},state:'active'}));return;
    }
    const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(fs.readFileSync(file));
  }catch(e){res.writeHead(500);res.end(String(e));}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage'],
  executablePath:process.env.PLAYWRIGHT_BROWSERS_PATH?path.join(process.env.PLAYWRIGHT_BROWSERS_PATH,'installed/chrome-linux/chrome'):undefined});
const rates=[0.5,0.65,0.8,1,1.25];let cases=0,assertions=0;const errors=[];
async function context(viewport){
  const ctx=await browser.newContext({viewport});
  await ctx.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  return ctx;
}
async function login(page,uid){
  const token=await sandbox.sign(uid);
  await page.evaluate(({uid,token})=>{
    localStorage.clear();const user=JSON.stringify({uid,user_id:uid,name:uid,role:'student'});
    localStorage.setItem('mango_user',user);localStorage.setItem('mangoi_logged_user',user);localStorage.setItem('mango_token',token);
  },{uid,token});
}
async function load(page,app){
  await page.goto(origin+'/'+(app==='warmup'?'warmup':'ai-friend')+'.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(app=>app==='warmup'?typeof warmupRatePreference!=='undefined'&&warmupRatePreference.loaded:typeof friendRatePreference!=='undefined'&&friendRatePreference.loaded,app);
}
async function expectLevel(page,app,level){
  const actual=await page.evaluate(app=>app==='warmup'?Number(document.getElementById('rateSlider').value):Number(document.querySelector('.opt[data-rate].active')?.dataset.rate),app);
  assert.equal(actual,app==='warmup'?level:rates[level-1]);assertions++;
}
async function choose(page,app,level){
  await page.evaluate(({app,level,rates})=>{
    if(app==='warmup'){const s=document.getElementById('rateSlider');s.value=level;s.dispatchEvent(new Event('input',{bubbles:true}));}
    else document.querySelector('.opt[data-rate="'+rates[level-1]+'"]').click();
  },{app,level,rates});
}
async function saved(uid,app,level){
  for(let i=0;i<100;i++){
    const row=sandbox.sqlite.prepare('SELECT level FROM student_speech_preferences WHERE uid=? AND app=?').get(uid.toLowerCase(),app);
    if(row?.level===level)return;
    await new Promise(r=>setTimeout(r,20));
  }
  assert.fail('server did not persist '+uid+' '+app+' '+level);
}
try{
  const viewports=[{width:1366,height:900},{width:1920,height:1080},{width:390,height:844},{width:430,height:932},{width:820,height:1180}];
  for(const viewport of viewports)for(const app of ['warmup','friend'])for(let level=1;level<=5;level++){
    const uid='Sandbox_'+cases,ctx=await context(viewport),page=await ctx.newPage();
    page.on('pageerror',e=>errors.push({app,message:e.message}));
    await page.goto(origin+'/warmup.html',{waitUntil:'domcontentloaded'});await login(page,uid);await load(page,app);
    await choose(page,app,level);await saved(uid,app,level);await expectLevel(page,app,level);
    for(let reload=0;reload<2;reload++){await load(page,app);await expectLevel(page,app,level);}
    const other=await context(viewport),otherPage=await other.newPage();
    await otherPage.goto(origin+'/warmup.html',{waitUntil:'domcontentloaded'});await login(otherPage,uid);await load(otherPage,app);await expectLevel(otherPage,app,level);
    await login(page,uid+'_B');await load(page,app);await expectLevel(page,app,3);
    await login(page,uid);await load(page,app);await expectLevel(page,app,level);
    await other.close();await ctx.close();cases++;
    if(cases%10===0)console.log('speech browser sandbox: '+cases+' account/device cases passed');
  }
  assert.deepEqual(errors,[],'production page JavaScript errors');
  console.log(JSON.stringify({suite:'Chromium full pages + real signed auth + isolated SQLite',cases,assertions,failed:0}));
}finally{await browser.close();await new Promise(r=>server.close(r));sandbox.close();}
