import { requireBrowser } from './_pw.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
const {chromium,exe}=requireBrowser();
const base=fileURLToPath(new URL('../../cloudflare-deploy/public',import.meta.url));
const server=http.createServer((req,res)=>{try{let path=req.url.split('?')[0];if(path==='/banner-test'){res.setHeader('Content-Type','text/html');res.end('<meta charset="utf-8"><section id="handover-inbox-banner" hidden></section><script src="/js/handover-inbox-banner.js?v=1"></script>');return;}res.setHeader('Content-Type',path.endsWith('.js')?'application/javascript':path.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(base+path));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:exe});
try{
 const page=await browser.newPage({viewport:{width:1366,height:1050}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const files=[{id:'d921e4e2-16d8-4c2b-9e47-1f3281518101',name:'발표 자료.pdf',mime:'application/pdf',size:15000}];
 const reports=[1,2].map((id)=>({id,report_date:'2026-09-28',username:'maimai',staff_name:'Maimai',recipient:'admin',status:'submitted',version:1,updated_at:Date.now(),payload:{work:id===1?'지사장 페이지 개선 및 발표 자료 초안 제작':'내일 수업 일정 확인',no_issue:true,no_open:false,open:'발표 자료 최종 검토',owner:'mgr_jjw',deadline:'2026-09-29T11:00',priority:'normal',attachments:id===1?[files[0].id]:[]}}));
 let uploadCount=0;
 await page.route('**/api/approval/handover/**',async route=>{let path=new URL(route.request().url()).pathname,b=route.request().method()==='POST'&&!path.endsWith('/attachment')?route.request().postDataJSON():null,j;
 if(path.endsWith('/home'))j={ok:true,day:'2026-09-28',reader_mode:true,can_review_all:true,me:{username:'admin',name:'정우영'},members:[{username:'admin',name:'정우영'},{username:'mgr_jjw',name:'장지웅'}],default_recipient:'mgr_jjw',reports,files,own:null};
 else if(path.endsWith('/inbox'))j={ok:true,reader_mode:true,total:reports.filter(x=>x.status==='submitted').length,reports:reports.filter(x=>x.status==='submitted'),files};
 else if(path.endsWith('/ack')){reports.find(x=>x.id===b.id).status='acknowledged';j={ok:true};}
 else if(path.endsWith('/attachment')){if(route.request().method()==='POST')uploadCount++;j={ok:true,file:files[0]};}
 else if(path.endsWith('/review'))j={ok:true,check:{ready:true},suggestion:null,ai_state:'unavailable'};
 else j={ok:true};await route.fulfill({json:j});});
 const origin='http://127.0.0.1:'+server.address().port;
 await page.goto(origin+'/daily-handover.html');await page.locator('.mh-report-button').first().waitFor();
 assert.equal(await page.locator('#mh-editor').isVisible(),false);
 assert.equal(await page.locator('#mh-filter').inputValue(),'unread');
 assert.equal(await page.locator('#mh-report-detail .preview').evaluate(e=>getComputedStyle(e).fontSize),'22px');
 await page.locator('#mh-report-detail').getByRole('button',{name:'PDF 미리보기 / Preview',exact:true}).click();assert.equal(await page.locator('.mh-pdf').count(),1);
 await page.screenshot({path:'/workspace/handover-reader-pc.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});assert.equal(await page.locator('#mh-reports').isVisible(),false);
 await page.getByRole('button',{name:'다음 보고 / Next',exact:true}).click();assert.match(await page.locator('#mh-report-detail h3').innerText(),/내일 수업/);
 await page.getByRole('button',{name:'이전 보고 / Previous',exact:true}).click();
 await page.locator('#mh-report-detail').getByRole('button',{name:'내용 확인 완료 / Acknowledge',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#mh-inbox-message').textContent.includes('미확인 1건'));
 assert.match(await page.locator('#mh-report-detail h3').innerText(),/내일 수업/);
 await page.screenshot({path:'/workspace/handover-reader-mobile.png',fullPage:true});
 for(const width of [320,360,390]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
 await page.locator('#mh-write-toggle').click();await page.locator('#mh-work').fill('담당자 보고를 검토했습니다.');
 await page.locator('#mh-files').setInputFiles({name:'발표 자료.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7 test')});
 await page.waitForFunction(()=>document.querySelector('#mh-upload-status').textContent.includes('업로드 완료'));assert.equal(uploadCount,1);assert.match(await page.locator('#mh-file-list').innerText(),/발표 자료/);
 await page.locator('#mh-manual').click();await page.waitForFunction(()=>!document.querySelector('#mh-confirm').disabled);await page.locator('#mh-confirm').check();
 await page.getByRole('button',{name:'첨부 제외 / Remove',exact:true}).click();assert.equal(await page.locator('#mh-send').isDisabled(),true);
 await page.goto(origin+'/banner-test');await page.locator('#handover-inbox-banner').getByText('매일보고 · 미확인 1건 / 1 unread',{exact:true}).waitFor();
 assert.match(await page.locator('#handover-inbox-banner a.primary').getAttribute('href'),/report=2/);
 assert.deepEqual(errors,[]);
 console.log('PASS reader browser: desktop split/22px, mobile focus/next/ack, private upload wiring, attachment edit invalidates confirmation, responsive widths, persistent inbox banner/deep link');
}finally{await browser.close();server.close();}
