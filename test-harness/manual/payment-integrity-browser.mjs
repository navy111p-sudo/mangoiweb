// Real refund page + real authenticated API handler + isolated SQLite. PG is mocked.
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { fresh, order, confirm, refundFixture, Refund } from '../payment_schedule_integrity_harness.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PW_DIR?resolve(process.env.PW_DIR,'node_modules/playwright-core'):'/tmp/mangoi-pw/node_modules/playwright-core');
const pub=resolve(dirname(fileURLToPath(import.meta.url)),'../../cloudflare-deploy/public');
const output=process.env.OUTPUT_DIR||'/tmp/track5-browser-evidence';mkdirSync(output,{recursive:true});
const originalNow=Date.now;Date.now=()=>Date.parse('2027-01-04T10:00:00+09:00');
const s=fresh(),o=await order(s);await confirm(s,o);refundFixture(s);
let heldPreview=null,heldPlan=null,refundRequests=0;
function holdResponse(kind){let entered,release;const started=new Promise(r=>entered=r),waiting=new Promise(r=>release=r);const hold={entered,waiting};if(kind==='preview')heldPreview=hold;else heldPlan=hold;return{started,release};}
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname.startsWith('/api/pay/admin/refund')){
  if(req.method==='POST')refundRequests++;
  const hold=url.pathname.endsWith('refund-preview')?heldPreview:req.method==='POST'?heldPlan:null;
  if(hold){if(req.method==='POST')heldPlan=null;else heldPreview=null;}
  const chunks=[];for await(const c of req)chunks.push(c);
  const r=await Refund.handleRefundApi(new Request(url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})}),url,s.env);
  if(hold){hold.entered();await hold.waiting;}
  res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));return;
 }
 if(url.pathname.startsWith('/api/')){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({ok:true,loggedIn:true,role:'hq',username:'admin',ui_lang:'ko'}));return;}
 const file=resolve(pub,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(pub+'/')||!existsSync(file)){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'content-type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'}[extname(file)]||'application/octet-stream'});res.end(readFileSync(file));
}catch(e){res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({ok:false,error:String(e)}));}});
await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r);});const base='http://127.0.0.1:'+server.address().port;
let pass=0,fail=0;const assertions=[];function check(name,c){assertions.push({name,passed:!!c});console.log((c?'BROWSER PASS ':'BROWSER FAIL ')+name);c?pass++:fail++;}
if(process.env.SERVE_ONLY){console.log(JSON.stringify({base,orderId:o.orderId,cookie:'mango_admin_session=synthetic-session',synthetic:true}));await new Promise(()=>{});}
let browser;
try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 const ctx=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
 await ctx.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
 await ctx.addCookies([{name:'mango_admin_session',value:'synthetic-session',url:base}]);const page=await ctx.newPage(),errors=[],dialogs=[];page.on('pageerror',e=>errors.push(String(e)));page.on('dialog',d=>{dialogs.push(d.message());return d.dismiss();});
 async function load(){await page.click('#btn-load');await page.locator('#pv-card:not(.hide)').waitFor();}
 async function failedLoad(){const d=page.waitForEvent('dialog');await page.click('#btn-load');await d;await page.locator('#pv-card').waitFor({state:'hidden'});}
 const hidden=()=>page.locator('#pv-card').evaluate(el=>el.classList.contains('hide'));
 const summary=()=>page.locator('#pv-kv').innerText();
 await page.goto(base+'/admin/refunds.html');await page.fill('#q-order',o.orderId);await page.click('#btn-load');await page.locator('.refund-lesson').first().waitFor();
 check('all24 unused lessons rendered from actual SQLite',await page.locator('.refund-lesson').count()===24);
 s.db.exec("UPDATE class_schedules SET start_time='09:00' WHERE id=1; INSERT INTO attendance(room_id,role) VALUES('class-1-20270104','student');");
 await load();
 check('same-day attendance shows23 remaining /1 used /345000 and23 choices',(await summary()).includes('23회')&&(await page.locator('#pv-notes').innerText()).includes('1회 사용')&&await page.inputValue('#f-amount')==='345000'&&await page.locator('.refund-lesson').count()===23);
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
 await page.waitForFunction(()=>document.querySelectorAll('.refund-lesson').length===21);
 check('prior selected2 plus attended1 shows21 remaining /1 used /315000',(await summary()).includes('21회')&&(await page.locator('#pv-notes').innerText()).includes('1회 사용')&&await page.inputValue('#f-amount')==='315000');
 await page.screenshot({path:resolve(output,'partial-refund-desktop-result.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:resolve(output,'partial-refund-mobile-result.png'),fullPage:true});
 check('no horizontal overflow at390px',await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 // Revalidation failures must clear a previously usable preview, including hidden state.
 await page.fill('#f-amount','30000');await page.locator('.refund-lesson').nth(0).check();await page.locator('.refund-lesson').nth(1).check();
 await page.click('#btn-dry');await page.locator('#confirm-box:not(.hide)').waitFor();await page.fill('#f-typed','환불');
 s.faults.lessonReadFault='throw';await failedLoad();
 check('Korean verification hold clears old preview and confirmation',dialogs.at(-1).includes('미사용 수업을 확인하지 못해')&&await hidden()&&await page.locator('#btn-dry').isDisabled()&&await page.locator('#btn-run').isDisabled()&&await page.inputValue('#f-typed')==='');
 const before=refundRequests;await page.locator('#btn-run').evaluate(el=>el.dispatchEvent(new Event('click')));await page.locator('#btn-dry').evaluate(el=>el.dispatchEvent(new Event('click')));
 check('failed reload leaves no reusable current or plan',refundRequests===before&&s.db.prepare('SELECT COUNT(*) n FROM payment_refunds').get().n===1);
 s.faults.lessonReadFault='';await load();
 check('transient read recovery restores21 verified choices and315000',await page.locator('.refund-lesson').count()===21&&await page.inputValue('#f-amount')==='315000'&&!await page.locator('#btn-dry').isDisabled());
 await page.evaluate(()=>{document.documentElement.lang='en';});s.faults.lessonReadFault='throw';await failedLoad();
 check('English verification hold is localized',dialogs.at(-1).includes('unused lessons could not be verified')&&!dialogs.at(-1).includes('lesson_verification_unavailable'));
 s.faults.lessonReadFault='';await page.evaluate(()=>{document.documentElement.lang='ko';});await load();
 const previewRoute='**/api/pay/admin/refund-preview?*';await page.route(previewRoute,route=>route.abort());await failedLoad();await page.unroute(previewRoute);
 check('transport failure also invalidates the old preview',await hidden()&&await page.locator('#btn-dry').isDisabled()&&await page.locator('#btn-run').isDisabled());
 await load();const old=holdResponse('preview');await page.click('#btn-load');await old.started;s.faults.lessonReadFault='throw';await failedLoad();
 const oldResponse=page.waitForResponse(r=>r.url().includes('refund-preview')&&r.status()===200);old.release();await oldResponse;await page.waitForTimeout(50);
 check('older successful load cannot restore preview after newer failed load',await hidden()&&await page.locator('#btn-dry').isDisabled());
 s.faults.lessonReadFault='';await load();await page.fill('#f-amount','30000');await page.locator('.refund-lesson').nth(0).check();await page.locator('.refund-lesson').nth(1).check();
 const oldPlan=holdResponse('plan');await page.click('#btn-dry');await oldPlan.started;s.faults.lessonReadFault='throw';await failedLoad();
 const planResponse=page.waitForResponse(r=>r.url().endsWith('/api/pay/admin/refund')&&r.status()===200);oldPlan.release();await planResponse;await page.waitForTimeout(50);
 check('older dry-run cannot restore confirmation after failed reload',await hidden()&&await page.locator('#confirm-box').evaluate(el=>el.classList.contains('hide'))&&await page.locator('#btn-run').isDisabled());
 s.faults.lessonReadFault='';await load();await page.fill('#f-amount','30000');await page.locator('.refund-lesson').nth(0).check();await page.locator('.refund-lesson').nth(1).check();
 s.faults.lessonReadFault='throw';const planningDialog=page.waitForEvent('dialog');await page.click('#btn-dry');await planningDialog;
 check('planning verification failure clears preview and explains hold',await hidden()&&dialogs.at(-1).includes('미사용 수업을 확인하지 못해'));
 s.faults.lessonReadFault='';await load();
 await page.fill('#f-amount','30000');await page.locator('.refund-lesson').nth(0).check();await page.locator('.refund-lesson').nth(1).check();
 await page.click('#btn-dry');await page.locator('#confirm-box:not(.hide)').waitFor();await page.fill('#f-typed','환불');s.faults.lessonReadFault='throw';
 const executionDialog=page.waitForEvent('dialog');await page.click('#btn-run');await executionDialog;
 check('execution-time verification failure requires reload without another refund',await hidden()&&await page.locator('#btn-dry').isDisabled()&&await page.locator('#btn-run').isDisabled()&&dialogs.at(-1).includes('미사용 수업을 확인하지 못해')&&s.db.prepare('SELECT COUNT(*) n FROM payment_refunds').get().n===1);
 s.faults.lessonReadFault='';await load();
 await page.screenshot({path:resolve(output,'refund-verification-recovered-mobile.png'),fullPage:true});
 check('no page JavaScript errors',errors.length===0);
 if(assertions.length!==21)throw Error('Incomplete refund browser fixture: expected exactly 21 assertions');
 writeFileSync(resolve(output,'fixture-report.json'),JSON.stringify({suite:'payment-integrity-browser',passed:pass,failed:fail,skipped:0,assertions,liveTransactions:0,errors},null,2)+'\n');
 console.log(JSON.stringify({browserPass:pass,browserFail:fail,screenshots:output,liveTransactions:0,errors}));
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));Date.now=originalNow;}
if(fail)process.exitCode=1;
