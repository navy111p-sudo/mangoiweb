// Real refund page + real authenticated API handler + isolated SQLite. PG is mocked.
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { fresh, order, confirm, refundFixture, Refund } from '../payment_schedule_integrity_harness.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PW_DIR?resolve(process.env.PW_DIR,'node_modules/playwright-core'):'/tmp/mangoi-pw/node_modules/playwright-core');
const pub=resolve(dirname(fileURLToPath(import.meta.url)),'../../cloudflare-deploy/public');
const output=process.env.OUTPUT_DIR||'/tmp/track5-browser-evidence';mkdirSync(output,{recursive:true});
const s=fresh(),o=await order(s);await confirm(s,o);refundFixture(s);
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname.startsWith('/api/pay/admin/refund')){
  const chunks=[];for await(const c of req)chunks.push(c);
  const r=await Refund.handleRefundApi(new Request(url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})}),url,s.env);
  res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));return;
 }
 if(url.pathname.startsWith('/api/')){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({ok:true,loggedIn:true,role:'hq',username:'admin',ui_lang:'ko'}));return;}
 const file=resolve(pub,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(pub+'/')||!existsSync(file)){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'content-type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'}[extname(file)]||'application/octet-stream'});res.end(readFileSync(file));
}catch(e){res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({ok:false,error:String(e)}));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
let pass=0,fail=0;function check(name,c){console.log((c?'BROWSER PASS ':'BROWSER FAIL ')+name);c?pass++:fail++;}
if(process.env.SERVE_ONLY){console.log(JSON.stringify({base,orderId:o.orderId,cookie:'mango_admin_session=synthetic-session',synthetic:true}));await new Promise(()=>{});}
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const ctx=await browser.newContext({viewport:{width:1440,height:1000}});
 await ctx.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
 await ctx.addCookies([{name:'mango_admin_session',value:'synthetic-session',url:base}]);const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('dialog',d=>d.dismiss());
 await page.goto(base+'/admin/refunds.html');await page.fill('#q-order',o.orderId);await page.click('#btn-load');await page.locator('.refund-lesson').first().waitFor();
 check('all24 unused lessons rendered from actual SQLite',await page.locator('.refund-lesson').count()===24);
 await page.fill('#f-amount','30000');await page.fill('#f-reason','Synthetic sandbox selected unused lesson refund');await page.locator('.refund-lesson').nth(0).check();await page.locator('.refund-lesson').nth(1).check();
 await page.click('#btn-dry');await page.locator('#confirm-box:not(.hide)').waitFor();
 check('confirmation states exact selected2 and remaining retained',(await page.locator('#confirm-text').innerText()).includes('선택한 2회 취소')&&(await page.locator('#confirm-text').innerText()).includes('나머지 수업 유지'));
 check('preview created no refund record',s.db.prepare('SELECT COUNT(*) n FROM payment_refunds').get().n===0);
 check('execution disabled until required written acknowledgment',await page.locator('#btn-run').isDisabled());
 await page.screenshot({path:resolve(output,'partial-refund-desktop-preview.png'),fullPage:true});
 await page.locator('.refund-lesson').nth(2).check();check('changing selection invalidates prior confirmation',await page.locator('#confirm-box').evaluate(el=>el.classList.contains('hide')));
 await page.locator('.refund-lesson').nth(2).uncheck();await page.click('#btn-dry');await page.locator('#confirm-box:not(.hide)').waitFor();await page.click('#btn-cancel');check('cancel preserves24 schedules and no refund record',s.db.prepare("SELECT COUNT(*) n FROM class_schedules WHERE status='active'").get().n===24&&s.db.prepare('SELECT COUNT(*) n FROM payment_refunds').get().n===0);
 await page.click('#btn-dry');await page.locator('#confirm-box:not(.hide)').waitFor();await page.fill('#f-typed','환불');
 // This is the isolated API with a mocked payment provider, never a financial action.
 await page.click('#btn-run');await page.locator('#run-result').getByText(/처리 완료|환불 완료|환불을 처리/).first().waitFor({timeout:5000}).catch(()=>{});
 await page.waitForFunction(()=>document.querySelector('#run-result')?.textContent.includes('기록 #'));
 check('browser-selected2 cancelled and22 remain',s.db.prepare("SELECT COUNT(*) n FROM class_schedules WHERE status='active'").get().n===22&&s.db.prepare("SELECT COUNT(*) n FROM payment_refunds WHERE status='done'").get().n===1);
 check('partial refund retains enrollment',s.db.prepare('SELECT status FROM enrollments').get().status==='active');
 await page.screenshot({path:resolve(output,'partial-refund-desktop-result.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:resolve(output,'partial-refund-mobile-result.png'),fullPage:true});
 check('no horizontal overflow at390px',await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 check('no page JavaScript errors',errors.length===0);
 console.log(JSON.stringify({browserPass:pass,browserFail:fail,screenshots:output,liveTransactions:0,errors}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
if(fail)process.exitCode=1;
