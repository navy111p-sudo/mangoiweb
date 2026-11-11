// Local browser preview. Real component + real inbox handler, memory SQLite only.
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { loadTypescript, makeHandoverEnv, seedBoardDay } from '../helpers/handover-env.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(join(process.env.PW_DIR,'node_modules/playwright-core'));
const t=makeHandoverEnv(loadTypescript());await seedBoardDay(t);
t.db.exec('CREATE TABLE holidays(country TEXT,date TEXT)');
const source=readFileSync('cloudflare-deploy/public/js/handover-inbox-banner.js','utf8');
const server=http.createServer(async(req,res)=>{
  if(req.url.startsWith('/api/approval/handover/')){
    const path=req.url.replace('/api/approval/handover','');
    const r=await t.request('GET',path,undefined,'staff_c');
    res.writeHead(r.status,{'Content-Type':'application/json'});res.end(await r.text());return;
  }
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
  res.end('<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width, initial-scale=1"><body style="margin:24px;font-family:Arial"><h1>매니저 업무 화면</h1><section id="handover-inbox-banner" hidden></section><script>'+source+'</script></body></html>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=document-user-activation-required']});
const shots=process.env.SHOT_DIR||'handover-warning-preview';mkdirSync(shots,{recursive:true});
try{
  for(const [label,width,height] of [['desktop',1440,1000],['mobile',390,844]]){
    const context=await browser.newContext({viewport:{width,height}}),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(String(e)));
    await page.goto('http://127.0.0.1:'+server.address().port);
    const modal=page.locator('#handover-writer-warning');await modal.waitFor();
    assert.match(await modal.innerText(),/3차 경고/);
    assert.ok(await modal.locator('a').getAttribute('href'));
    assert.equal(await modal.evaluate(el=>el.scrollWidth<=innerWidth),true);
    await page.screenshot({path:join(shots,label+'-popup.png')});
    await modal.getByRole('button',{name:'닫기',exact:true}).click();
    await modal.waitFor({state:'detached'});
    const banner=page.locator('#handover-inbox-banner');
    assert.match(await banner.locator('.writer').innerText(),/3차 경고/);
    await page.screenshot({path:join(shots,label+'-banner.png')});
    await page.reload();await page.waitForTimeout(300);
    assert.equal(await page.locator('#handover-writer-warning').count(),0,'once per day');
    assert.deepEqual(errors,[],'no browser errors');
    await context.close();
  }
  console.log('PASS browser: PC/mobile popup, dismiss, persistent banner, daily popup limit, no JS errors');
}finally{await browser.close();await new Promise(r=>server.close(r));t.db.close();}
