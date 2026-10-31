const { chromium } = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright' : 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH || (fs.existsSync('/tmp/chromium') ? '/tmp/chromium' : undefined),args:['--no-sandbox']});
 const page = await browser.newPage();
 const requests=[]; let sends=0;
 await page.route('https://care.test/**', route => {
  const url=route.request().url(); requests.push(url);
  if(url.includes('/forecast/message')) {
   if(route.request().method()==='POST') { sends++; const b=route.request().postDataJSON(); assert.equal(b.user_id,'s1'); assert.equal(b.expected_phone,'01012345678'); assert.equal(b.confirmed,true); return route.fulfill({json:{ok:true,status:'accepted'}}); }
   return route.fulfill({json:{ok:true,recipient:{phone:'01012345678',role:'parent',ready:true}}});
  }
  if(url.endsWith('/revenue')) return route.fulfill({json:{ok:true}});
  if(url.endsWith('/churn')) return route.fulfill({json:{ok:true,rows:[{user_id:'s1',name:'김설',status:'unreviewed',reason:'long_inactive',days_inactive:5}]}});
  return route.fulfill({contentType:'text/html',body:'<html><body><div id="forecast-overview"></div><details id="card-ai-forecast"></details></body></html>'});
 });
 await page.goto('https://care.test/');
 await page.addStyleTag({content:fs.readFileSync('cloudflare-deploy/public/css/adm-forecast.css','utf8')});
 await page.addScriptTag({content:fs.readFileSync('cloudflare-deploy/public/js/adm-forecast.js','utf8')});
 await page.locator('[data-preview]').click();
 assert.equal(await page.locator('#af-draft-template option').count(),6);
 assert.equal(await page.locator('[data-copy]').isDisabled(),true);
 for(const lang of ['ko','en']) {
  await page.selectOption('#af-draft-language',lang);
  for(let i=0;i<5;i++) {
   await page.selectOption('#af-draft-template',String(i));
   const value=await page.inputValue('textarea');
   assert(value.includes('김설')); assert(!/[\u3400-\u9fff\uf900-\ufaff]/u.test(value));
   if(lang==='ko') assert(!/[A-Za-z]/.test(value));
   else assert(value.startsWith('Hello'));
  }
 }
 await page.selectOption('#af-draft-language','ko');
 await page.selectOption('#af-draft-template','0');
 await page.fill('textarea','직접 수정한 상담 문구');
 await page.selectOption('#af-draft-template','1');
 await page.selectOption('#af-draft-language','en');
 await page.selectOption('#af-draft-template','0');
 await page.selectOption('#af-draft-language','ko');
 assert.equal(await page.inputValue('textarea'),'직접 수정한 상담 문구');
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>window.copied=text}}));
 await page.locator('[data-copy]').click();
 assert.equal(await page.evaluate(()=>window.copied),'직접 수정한 상담 문구');
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('denied')}}}));
 await page.locator('[data-copy]').click();
 await page.getByText('자동 복사가 되지 않았습니다.',{exact:false}).waitFor();
 await page.setViewportSize({width:390,height:844});
 assert(await page.locator('dialog').evaluate(e=>e.getBoundingClientRect().width<=390));
 await page.locator('[data-close]').click();
 await page.locator('[data-preview]').click();
 assert.equal(await page.inputValue('#af-draft-template'),'');
 await page.keyboard.press('Escape');
 await page.locator('dialog').waitFor({state:'detached'});
 await page.evaluate(()=>window.adminLang='en');
 await page.locator('[data-preview]').click();
 assert.equal(await page.inputValue('#af-draft-language'),'en');
 assert(!requests.some(url=>/retention\/(preview|send)/.test(url)));
 await page.selectOption('#af-draft-template','1');
 await page.locator('[data-sms]:enabled').waitFor();
 page.once('dialog',d=>d.dismiss()); await page.locator('[data-sms]').click(); assert.equal(sends,0);
 page.once('dialog',d=>{assert(d.message().includes('01012345678')); d.accept()});
 await page.locator('[data-sms]').click(); await page.getByText('Text delivery request accepted.',{exact:false}).waitFor(); assert.equal(sends,1);
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>window.copied=text}}));
 await page.locator('[data-kakao]').click(); await page.getByRole('link',{name:'Open Kakao Channel Manager'}).waitFor();
 assert.equal(sends,1); assert.equal(await page.locator('[data-copy-status]').innerText().then(s=>s.includes('Nothing has been sent yet.')),true);
 await browser.close(); console.log('PASS: all 10 templates, Korean-only copy, edits retained, copy/fallback, mobile, fresh selection, English default, Escape, no send or generated preview.');
})().catch(err=>{console.error(err);process.exit(1)});
