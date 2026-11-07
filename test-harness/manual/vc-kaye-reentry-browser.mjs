// Shipped sender/receiver, translation IIFE and PDF coordinator in sandboxed Chromium.
// Synthetic identity/API/socket only; no media permission or production site.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadPlaywright,findChromium} from './_pw.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),pub=process.env.KAYE_PUBLIC_SOURCE||join(root,'cloudflare-deploy/public');
const require=createRequire(join(root,'cloudflare-deploy/package.json')),ts=require('typescript');
const main=readFileSync(join(pub,'js/idx-main.js'),'utf8'),chat=readFileSync(join(pub,'js/idx-vc-chat.js'),'utf8');
const ast=ts.createSourceFile('main.js',main,ts.ScriptTarget.Latest,true);
const funcs=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&['vcSendChat','vcReceiveChat','vcAddChatSystem'].includes(n.name?.text)).map(n=>n.getText(ast)).join('\n');
const start=main.indexOf('window.vcApplySharedPdf = function'),pdf=main.slice(start,main.indexOf('window.vcStartPdfPoll = function',start));
const pw=loadPlaywright(),exe=process.env.CHROME_EXECUTABLE||findChromium()||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':null);
assert(pw&&exe,'Chromium and Playwright required; no passing skip');
const browser=await pw.chromium.launch({executablePath:exe,chromiumSandbox:true,args:['--disable-setuid-sandbox','--disable-background-networking','--disable-component-update','--disable-sync','--no-default-browser-check']});
const base='http://127.0.0.1:8933',results=[];let blocked=0;
function bootstrap(){
 Object.assign(window,{vcRoomId:'A',vcUserId:'u',vcUsername:'Fixture',vcChatTarget:null,chatUnread:0,__sent:[],__requests:[],__mode:'ok',__accept:true});
 window.vcAccountSnapshot=()=>window.__account||'fixture';
 window.escHtml=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
 window.vcConn={ws:{readyState:1},send:m=>{if(!window.__accept)return false;window.__sent.push(m);queueMicrotask(()=>window.vcReceiveChat({...m.data,userId:'u',username:'Fixture'}));return true}};
 window.vcDockChatBadge=()=>{};window.vcChatAutoOpen=()=>{};
 window.fetch=(url,options)=>{window.__requests.push({url,body:options&&options.body});if(url!=='/api/translate')return Promise.resolve(new Response('{}'));
 const q=JSON.parse(options.body),good=()=>new Response(JSON.stringify({ok:true,map:{[q.texts[0]]:q.target==='en'?'Hello':'좋은 아침이에요'}}),{status:200});
 if(window.__mode==='wait')return new Promise(r=>window.__apiResolve=()=>r(good()));
 if(window.__mode==='http')return Promise.resolve(new Response(JSON.stringify({ok:false}),{status:503}));return Promise.resolve(good())};
 Object.assign(window,{pdfPageNum:1,pdfCurrentId:'',__loads:[],__renders:[]});
 window.vcSwitchTab=()=>{};window.pdfRender=()=>window.__renders.push(window.pdfPageNum);
 window.pdfLoad=url=>new Promise((resolve,reject)=>window.__loads.push({url,resolve,reject}));
 localStorage.setItem('mangoi_vc_chat_tr','en');localStorage.setItem('mangoi_lang','ko');
}
const scenarios=[
 ['translated send and echo preserve original',async p=>{await p.fill('#vc-chat-input','안녕하세요');await p.evaluate(()=>vcSendChat());await p.waitForFunction(()=>__sent.length===1&&document.querySelector('.vc-tr-note'));assert.deepEqual(await p.evaluate(()=>({text:__sent[0].data.message,note:document.querySelector('.vc-tr-note').textContent})),{text:'Hello',note:'✏️ 안녕하세요'})}],
 ['translation failure keeps original and explains',async p=>{await p.evaluate(()=>__mode='http');await p.fill('#vc-chat-input','안녕하세요');await p.evaluate(()=>vcSendChat());await p.waitForFunction(()=>document.querySelector('.chat-msg.system'));assert.equal(await p.evaluate(()=>__sent.length),0);assert.equal(await p.inputValue('#vc-chat-input'),'안녕하세요')}],
 ['edited draft cannot be overwritten by late result',async p=>{await p.evaluate(()=>__mode='wait');await p.fill('#vc-chat-input','안녕하세요');await p.evaluate(()=>vcSendChat());await p.waitForFunction(()=>!!window.__apiResolve);await p.fill('#vc-chat-input','새로운 입력');await p.evaluate(()=>__apiResolve());await p.waitForFunction(()=>document.querySelector('.chat-msg.system'));assert.equal(await p.evaluate(()=>__sent.length),0);assert.equal(await p.inputValue('#vc-chat-input'),'새로운 입력')}],
 ['late translation cannot cross recipient boundary',async p=>{await p.evaluate(()=>__mode='wait');await p.fill('#vc-chat-input','안녕하세요');await p.evaluate(()=>vcSendChat());await p.waitForFunction(()=>!!window.__apiResolve);await p.evaluate(()=>{vcChatTarget={userId:'other'};__apiResolve()});await p.waitForFunction(()=>document.querySelector('.chat-msg.system'));assert.equal(await p.evaluate(()=>__sent.length),0)}],
 ['incoming failure is visible below original',async p=>{await p.evaluate(()=>{__mode='http';vcReceiveChat({userId:'t',username:'Teacher',message:'Good morning'})});await p.waitForFunction(()=>document.querySelector('.vc-tr-note'));assert.match(await p.textContent('.vc-tr-note'),/번역|Translation/);assert.match(await p.textContent('.msg-bubble'),/Good morning/)}],
 ['socket rejection restores original draft',async p=>{await p.evaluate(()=>__accept=false);await p.fill('#vc-chat-input','안녕하세요');await p.evaluate(()=>vcSendChat());await p.waitForFunction(()=>document.querySelector('.chat-msg.system'));assert.equal(await p.inputValue('#vc-chat-input'),'안녕하세요');assert.equal(await p.evaluate(()=>__sent.length),0)}],
 ['private message retains private destination',async p=>{await p.evaluate(()=>vcChatTarget={userId:'private'});await p.fill('#vc-chat-input','안녕하세요');await p.evaluate(()=>vcSendChat());await p.waitForFunction(()=>__sent.length===1);assert.equal(await p.evaluate(()=>__sent[0].data.toUserId),'private');assert.equal(await p.evaluate(()=>__requests.some(r=>r.url==='/api/chat/messages')),false)}],
 ['PDF reversed completion preserves newer book/page',async p=>{await p.evaluate(()=>vcApplySharedPdf('/old.pdf','pdf',9));await p.waitForFunction(()=>__loads.length===1);await p.evaluate(()=>vcApplySharedPdf('/new.pdf','pdf',3));await p.waitForFunction(()=>__loads.length===2);await p.evaluate(()=>__loads[1].resolve());await p.waitForFunction(()=>pdfPageNum===3);await p.evaluate(()=>__loads[0].resolve());await p.evaluate(()=>Promise.resolve());assert.equal(await p.evaluate(()=>_vcShownPdfUrl),base+'/new.pdf');assert.equal(await p.evaluate(()=>pdfPageNum),3)}]
];
try{
 for(const viewport of [{width:1280,height:800},{width:390,height:844}])for(const [name,run]of scenarios){
  const context=await browser.newContext({viewport,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.setDefaultTimeout(3000);
  page.on('pageerror',e=>errors.push(String(e)));await context.routeWebSocket('**/*',s=>s.close());
  await context.route('**/*',route=>{if(route.request().url()===base+'/fixture')return route.fulfill({contentType:'text/html',body:'<!doctype html><body class=vc-in-call><div id=vc-chat-panel class=open><div id=vc-chat-messages></div><div><input id=vc-chat-input placeholder=Message></div></div><b id=vc-chat-badge></b></body>'});blocked++;return route.abort()});
  try{await page.goto(base+'/fixture');await page.evaluate(bootstrap);await page.addScriptTag({content:funcs+'\n'+pdf+'\n'+chat});await run(page);assert.deepEqual(errors,[]);results.push({name,viewport,pass:true});console.log('PASS',viewport.width,name)}
  catch(e){results.push({name,viewport,pass:false,error:String(e.stack)});console.log('FAIL',viewport.width,name,String(e))}finally{await context.close()}
 }
}finally{
 const version=browser.version();await browser.close();const out=process.env.KAYE_BROWSER_OUTPUT||'/tmp/mangoi-kaye-browser';mkdirSync(out,{recursive:true});
 const summary={browser:version,sandbox:true,blockedPageRequests:blocked,mediaPermissionRequested:false,passed:results.filter(x=>x.pass).length,failed:results.filter(x=>!x.pass).length,results};
 writeFileSync(join(out,'browser.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify({...summary,results:undefined}));process.exitCode=summary.failed?1:0;
}
