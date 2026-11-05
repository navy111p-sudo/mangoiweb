// Real shipped recovery functions in Chromium; all requests are intercepted fixtures.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(resolve(process.env.PW_DIR || '.', 'node_modules/playwright'));
const harness = readFileSync(new URL('../class_undo_move_harness.mjs', import.meta.url), 'utf8');
const cut = new Function(harness.slice(harness.indexOf('function cutBlock('), harness.indexOf('/* 주석을 벗긴')) + '; return cutBlock;')();
const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium', args:['--no-sandbox']});
let checks = 0;
try {
 for (const width of [390,1360]) {
  const page = await browser.newPage({viewport:{width,height:800}});
  const errors = []; page.on('pageerror', e=>errors.push(e.message));
  const source = readFileSync(new URL('../../cloudflare-deploy/public/manager.html',import.meta.url),'utf8');
  const code = ['var TA_UNDO_WHY = {','function taUndoPill(','function taUndoMove(','function taRestoreCancelledPill(','async function taRestoreCancelled('].map(n=>cut(source,n)+';').join('\n');
  const posts = [], dialogs = [];
  let allow = true;
  page.on('dialog', async d=>{dialogs.push(d.message()); await (allow ? d.accept() : d.dismiss());});
  await page.route('**/*', async route=>{ if (route.request().isNavigationRequest()) return route.fulfill({contentType:'text/html',body:'<main id="app"></main>'}); posts.push(route.request().postDataJSON()); await route.fulfill({json:{ok:true}}); });
  await page.goto('http://recovery.fixture/');
  await page.addScriptTag({content:`
   var IS_HQ=true, rows={}, refreshes=0;
   var T=(en,ko)=>en, esc=s=>String(s||''), taRowOf=id=>rows[id];
   var taMarkStale=()=>{}, loadTodayAll=()=>refreshes++;
   ${code}
   window.showRecovery=function(cancelled){
     rows[41]={schedule_id:41,student_name:'Fixture',cancelled,start_ts:Date.now()+86400000,change:{to_date:'2027-01-09',to_time:'20:00'},undo:{ok:false,reason:'orig_passed',historical_available:true,from_date:'2026-11-01',from_time:'10:00'}};
     document.getElementById('app').innerHTML=cancelled?taRestoreCancelledPill(rows[41]):taUndoPill(rows[41]);
     document.querySelector('[role=button]')?.addEventListener('click',e=>taUndoMove(e.currentTarget));
   };`});
  await page.evaluate(()=>showRecovery(false));
  allow=false; await page.getByRole('button').click(); assert.equal(posts.length,0); checks++;
  allow=true; await page.getByRole('button').click(); await page.waitForFunction(()=>refreshes===1);
  assert.equal(posts[0].historical_correction,true); assert.match(dialogs.at(-1),/postponed/); assert.match(dialogs.at(-1),/2026-11-01/); checks+=3;
  await page.evaluate(()=>showRecovery(true)); await page.getByRole('button').click(); await page.waitForFunction(()=>refreshes===2);
  assert.equal(posts[1].action,'restore'); assert.match(dialogs.at(-1),/normal attendance and billing/); checks+=2;
  await page.evaluate(()=>{IS_HQ=false;showRecovery(true)}); assert.equal(await page.getByRole('button').count(),0); checks++;
  const admin = readFileSync(new URL('../../cloudflare-deploy/public/js/adm-today-classes.js',import.meta.url),'utf8');
  const adminCode = ['var TC_UNDO_WHY = {','function tcMd(','function tcUndoMoveHtml(','async function tcUndoMove(','async function tcRestorePostponed('].map(n=>cut(admin,n)+';').join('\n');
  await page.addScriptTag({content:`
    IS_HQ=true; rows[41].cancelled=false; T=(ko,en)=>en; var tcCanMessage=()=>IS_HQ;
    window.tcLoadToday=()=>refreshes++;
    ${adminCode}
    document.getElementById('app').innerHTML=tcUndoMoveHtml(rows[41]);
    document.querySelector('[role=button]').addEventListener('click',e=>tcUndoMove(e.currentTarget));
  `});
  await page.getByRole('button').click(); await page.waitForFunction(()=>refreshes===3);
  assert.equal(posts[2].historical_correction,true); assert.match(dialogs.at(-1),/postponed/); checks+=2;
  await page.evaluate(()=>{IS_HQ=false; document.getElementById('app').innerHTML=tcUndoMoveHtml(rows[41]);});
  assert.equal(await page.getByRole('button').count(),0); checks++;
  assert.deepEqual(errors,[]); checks++; await page.close();
 }
 console.log(JSON.stringify({checks,failures:0,viewports:[390,1360],scope:'actual manager/admin recovery functions, synthetic network; backend tested separately'}));
} finally {await browser.close();}
