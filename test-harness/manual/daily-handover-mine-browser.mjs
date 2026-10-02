// 📤 내가 보낸 보고 · 확인 여부 — 사람이 부르는 브라우저 검사(자동으로 안 돕니다).
// PW_DIR=/opt/node22/lib/node_modules/playwright node test-harness/manual/daily-handover-mine-browser.mjs
import { requireBrowser } from './_pw.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
const {chromium,exe}=requireBrowser();
const base=fileURLToPath(new URL('../../cloudflare-deploy/public',import.meta.url));
const server=http.createServer((req,res)=>{try{const p=req.url.split('?')[0];res.setHeader('Content-Type',p.endsWith('.js')?'application/javascript':p.endsWith('.css')?'text/css':'text/html; charset=utf-8');res.end(fs.readFileSync(base+p));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:exe});
const P=(id,date,status,extra={})=>({id,report_date:date,username:'karl',staff_name:'Karl',recipient:'mgr_jjw',status,version:2,updated_at:Date.now(),payload:{work:'일 '+id,no_issue:true,no_open:true,priority:'normal'},...extra});
const mine=[P(3,'2026-10-02','submitted'),P(2,'2026-10-01','acknowledged',{acknowledged_by:'mgr_jjw',acknowledged_at:Date.parse('2026-10-01T09:30:00Z')}),P(1,'2026-09-30','changes_requested',{acknowledged_by:'mgr_jjw',feedback:'학생 이름을 적어 주세요'})];
let fails=0;const ok=(c,m)=>{if(c)console.log('✅',m);else{fails++;console.log('❌ FAIL',m);}};
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let mineCalls=0;
 await page.route('**/api/approval/handover/**',async route=>{const path=new URL(route.request().url()).pathname;let j;
  if(path.endsWith('/home'))j={ok:true,day:'2026-10-02',me:{username:'karl',name:'Karl'},members:[{username:'mgr_jjw',name:'장지웅'},{username:'karl',name:'Karl'}],own:mine[0],reports:[],files:[],staged_ids:[],reader_mode:false,read_schedule:null,schedule:null,required:[],default_recipient:'mgr_jjw',ai_available:false,can_review_all:false};
  else if(path.endsWith('/inbox'))j={ok:true,total:0,reports:[],files:[]};
  else if(path.endsWith('/mine')){mineCalls++;j={ok:true,reports:mine,files:[]};}
  else j={ok:true,reports:[],files:[]};
  await route.fulfill({json:j});});
 await page.goto(`http://127.0.0.1:${server.address().port}/daily-handover.html`);
 await page.waitForFunction(()=>document.querySelector('#mh-staff').value==='Karl');
 const own=await page.locator('#mh-own-status');
 ok(await own.isVisible(),'오늘 내 보고 상태 줄이 보인다');
 ok((await own.textContent()).includes('확인 대기')&&(await own.textContent()).includes('장지웅'),'상태 줄이 «확인 대기 · 받는 사람» 을 말한다');
 const btn=page.locator('#mh-mine');ok(await btn.isVisible(),'«내가 보낸 보고» 버튼이 보인다');
 const box=await btn.boundingBox();const top=await page.evaluate(([x,y])=>{const e=document.elementFromPoint(x,y);return e&&e.closest('#mh-mine')?'ok':(e&&e.outerHTML.slice(0,60));},[box.x+box.width/2,box.y+box.height/2]);
 ok(top==='ok','버튼이 맨 위라 눌린다 ('+top+')');
 ok(mineCalls===0,'누르기 전에는 /mine 을 부르지 않는다');
 await btn.click();await page.waitForTimeout(400);
 ok(mineCalls===1,'누르면 /mine 을 부른다');
 const msg=await page.locator('#mh-inbox-message').textContent();
 ok(msg.includes('확인 완료 1')&&msg.includes('확인 대기 1')&&msg.includes('보완 요청 1'),'요약이 상태별 건수를 말한다: '+msg);
 ok(await page.locator('#mh-reports .mh-report-button').count()===3,'목록에 내 보고 3건');
 ok((await page.locator('#mh-reports .mh-report-button').first().textContent()).startsWith('→ 장지웅'),'목록 줄이 «받는 사람» 을 보여 준다');
 await page.locator('#mh-reports .mh-report-button').nth(1).click();
 let d=await page.locator('#mh-report-detail').textContent();
 ok(d.includes('✅ 확인 완료')&&d.includes('10-01 18:30'),'확인 완료 건은 확인 시각(KST)까지 보인다');
 await page.locator('#mh-reports .mh-report-button').nth(2).click();
 d=await page.locator('#mh-report-detail').textContent();
 ok(d.includes('보완 요청')&&d.includes('학생 이름을 적어 주세요'),'보완 요청 건은 요청 내용이 보인다');
 ok(await page.locator('#mh-report-detail button:has-text("Acknowledge")').count()===0,'내 보고에는 «확인 완료» 버튼이 없다(자기 확인 금지)');
 ok(await page.locator('#mh-report-detail button:has-text("Revise")').count()===0,'지난 날짜 보완요청에는 «다시 보내기» 버튼이 없다(오늘 보고만 고칠 수 있음)');
 await btn.click();await page.waitForTimeout(200);
 ok(await page.$eval('#mh-filter',e=>e.value)==='unread','한 번 더 누르면 미확인 목록으로 돌아간다');
 await own.click();await page.waitForTimeout(400);
 ok(await page.$eval('#mh-filter',e=>e.value)==='mine','상태 줄을 누르면 내 보고 목록이 열린다');
 for(const w of [360,390]){await page.setViewportSize({width:w,height:800});const over=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);ok(!over,w+'px 에서 가로 넘침 없음');}
 ok(!errors.length,'페이지 오류 없음 '+errors.join(' | '));
}finally{await browser.close();server.close();}
console.log(fails?`결과: FAIL ${fails}`:'결과: PASS');process.exit(fails?1:0);
