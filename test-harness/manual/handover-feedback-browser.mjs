import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {join,extname} from 'node:path';
import {loadPlaywright} from './_pw.mjs';
import {ROOT,loadTypescript,makeHandoverEnv,seedBoardDay} from '../helpers/handover-env.mjs';
const pw=loadPlaywright();assert.ok(pw,'Set PW_DIR to a playwright-core installation');
const ts=loadTypescript(),t=makeHandoverEnv(ts);await seedBoardDay(t);
const server=http.createServer(async(req,res)=>{try{const f=join(ROOT,'cloudflare-deploy/public',decodeURIComponent(req.url.split('?')[0]));const data=await readFile(f);res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png'})[extname(f)]||'application/octet-stream');res.end(data);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
const browser=await pw.chromium.launch({channel:'chrome',headless:true});
const errors=[];
async function open(who,width=1440,path='/daily-handover.html'){const page=await browser.newPage({viewport:{width,height:900}});page.on('pageerror',e=>errors.push(String(e)));await page.route('**/api/**',async route=>{const req=route.request(),url=new URL(req.url());if(path==='/manager.html'&&url.pathname==='/api/approval/handover/inbox')return route.abort();if(!url.pathname.startsWith('/api/approval/handover'))return route.fulfill({status:404,json:{ok:false}});const res=await t.request(req.method(),url.pathname.slice('/api/approval/handover'.length)+url.search,req.method()==='GET'?undefined:JSON.parse(req.postData()||'{}'),who);return route.fulfill({status:res.status,contentType:'application/json',body:await res.text()});});await page.goto(base+path);return page;}
try{
 const admin=await open('admin');await admin.locator('#mhb-list .mhb-head').first().click();
 const box=admin.locator('#mhb-list .mh-feedback');await box.locator('textarea').fill('Please send the price quotation and specifications.\n견적과 사양을 보내 주세요.');await box.getByRole('button',{name:'피드백 보내기 / Send feedback'}).click();
 await box.getByText('매니저 미확인 / Awaiting manager confirmation').waitFor();
 const target=t.db.prepare('SELECT h.username FROM daily_handover_replies f JOIN daily_handovers h ON h.id=f.report_id ORDER BY f.id DESC LIMIT 1').get().username;
 // Make a second reply: each requires its own explicit confirmation.
 const id=t.db.prepare('SELECT report_id FROM daily_handover_replies ORDER BY id DESC LIMIT 1').get().report_id;
 await t.api('/reply',{id,body:'Second feedback message.',request_key:crypto.randomUUID()},'admin');
 // The manager's first page must show feedback even when the inbox is unavailable.
 const phone=await open(target,390,'/manager.html');const modal=phone.locator('#handover-feedback-required');await modal.waitFor();
 assert.match(await modal.innerText(),/price quotation/);const confirm=modal.getByRole('button',{name:'읽고 확인했습니다'});assert.equal(await confirm.isDisabled(),true);
 await phone.keyboard.press('Escape');assert.equal(await modal.isVisible(),true);
 await phone.reload();await modal.waitFor();assert.match(await modal.innerText(),/price quotation/);
 if(process.env.SHOT_DIR){await mkdir(process.env.SHOT_DIR,{recursive:true});await phone.screenshot({path:join(process.env.SHOT_DIR,'feedback-phone.png')});await admin.screenshot({path:join(process.env.SHOT_DIR,'feedback-pc.png')});}
 await confirm.click({timeout:10000});await modal.getByText('Second feedback message.',{exact:true}).waitFor();await confirm.click({timeout:10000});await modal.waitFor({state:'detached'});
 assert.equal((await t.api('/feedback-pending',null,target)).feedback.length,0);
 assert.equal(t.db.prepare('SELECT COUNT(*) n FROM daily_handover_replies WHERE confirmed_at IS NOT NULL').get().n,2);
 await admin.locator('#mhb-refresh').click();await admin.locator('#mhb-list .mh-feedback').getByText(/매니저 확인 \/ Confirmed/).first().waitFor();
 // The existing change-request entry now uses a multi-line dialog.
 await admin.locator('#mhb-list').getByRole('button',{name:'보완 요청 / Request changes',exact:true}).click();await admin.locator('dialog textarea').fill('Please clarify the requested specifications.');await admin.locator('dialog').getByRole('button',{name:'보완 요청 보내기 / Send request'}).click();await admin.locator('dialog').waitFor({state:'detached'});
 assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(errors,[]);console.log('PASS PC composer, mobile persistent gate, Escape/reload, sequential confirmation, sender receipt, multiline change request, no overflow');
}finally{await browser.close();await new Promise(r=>server.close(r));t.db.close();}
