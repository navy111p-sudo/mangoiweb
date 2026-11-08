// Actual report pages; local fixtures only, no account, microphone or operating DB.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname} from 'node:path';
import {requireBrowser} from './_pw.mjs';
const {chromium,exe}=requireBrowser(),pub=new URL('../../cloudflare-deploy/public/',import.meta.url);
const server=createServer(async(req,res)=>{try{const path=decodeURIComponent(req.url.split('?')[0]),ext=extname(path);res.setHeader('Content-Type',ext==='.html'?'text/html':ext==='.js'?'application/javascript':ext==='.css'?'text/css':'application/octet-stream');res.end(await readFile(new URL('.'+path,pub)));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true,executablePath:exe});
const growth={turns:3,sessions:2,grades:{perfect:1,partial:1,incomplete:0},reading:{samples:1,pronunciation:0,fluency:75},corrections:[{was:'<img src=x onerror="window.bad=1">',now:'I like apples.'}]};
const data={ok:true,year_month:'2026-11',student:{student_name:'Fixture'},child:{student_name:'Fixture'},evaluations:{count:0,items:[]},attendance:{days:0},speaking_growth:growth,warmup:{sessions_this_month:4,spoke_sessions_this_month:3,days_this_month:2,fixes_recorded:true,recent_fixes:[],weekly_activity:Array.from({length:7},(_,i)=>({date:'2026-11-0'+(i+1),sessions:i%3}))}};
let cases=0;
try{for(const width of [320,390,768,1366])for(const kind of ['parent','monthly']){
 const page=await browser.newPage({viewport:{width,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!==base){await route.abort();return;}if(!u.pathname.startsWith('/api/')){await route.continue();return;}await route.fulfill({json:u.pathname.startsWith('/api/report/monthly/')?data:{ok:false,items:[]}});});
 await page.goto(base+(kind==='parent'?'/parent.html':'/monthly-report.html?uid=fixture&period=2026-11'));
 if(kind==='parent')await page.evaluate(d=>{document.getElementById('dashboard').style.display='block';pdRender({...d,evaluations:[]});},data);
 const box=page.locator(kind==='parent'?'#pd-speaking-growth':'#monthly-speaking-growth');await box.waitFor({state:'visible'});
 const text=await box.innerText();assert.match(text,/0\/100/);assert.match(text,/75\/100/);assert.match(text,/미측정/);assert.match(text,/I like apples/);assert.match(text,/onerror/);
 assert.equal(await box.locator('img').count(),0);assert.equal(await page.evaluate(()=>window.bad),undefined);
 assert.equal(await box.evaluate(e=>e.scrollWidth<=e.clientWidth+1),true,'report card fits '+width);
 if(kind==='parent'){const week=page.locator('#pd-warmup-card');assert.equal(await week.locator('ol li').count(),7);assert.match(await week.innerText(),/실력 점수는 아니에요/);assert.equal(await week.evaluate(e=>e.scrollWidth<=e.clientWidth+1),true,'weekly activity card fits '+width);await page.evaluate(()=>pdRender({child:{student_name:'Fixture'},evaluations:[],speaking_growth:null}));assert.equal(await box.isHidden(),true);}
 assert.deepEqual(errors,[]);cases++;await page.close();
}}finally{await browser.close();await new Promise(r=>server.close(r));}
console.log('PASS speaking growth parent/monthly report rendering, unknown scores and text safety at '+cases+' desktop/mobile page sizes; not real-device verification');
