const {chromium}=require(process.env.PW_DIR ? process.env.PW_DIR + '/node_modules/playwright' : 'playwright');
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const root=path.join(__dirname,'../../cloudflare-deploy/public');
const server=http.createServer((req,res)=>{const p=path.join(root,decodeURIComponent(req.url.split('?')[0]));fs.readFile(p,(e,b)=>{res.writeHead(e?404:200,{'Content-Type':p.endsWith('.js')?'application/javascript':p.endsWith('.json')?'application/json':p.endsWith('.css')?'text/css':'text/html'});res.end(e?'':b);});});
(async()=>{
 await new Promise(r=>server.listen(8893,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || undefined,headless:true});
 try{for(const width of [1440,1024,861,860,390]){
 const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8893/ai-dubbing.html');
 await page.waitForFunction(()=>!document.getElementById('dub-cast-panel').hidden);
 const b=page.locator('[data-scene="0"]');assert.equal(await b.textContent(),'더빙');await b.click();
 await page.waitForFunction(()=>document.getElementById('dub-side').classList.contains('open'));
 await page.locator('#dub-side-close').waitFor({state:'visible'});
 assert.equal(await page.locator('#dub-side').evaluate(e=>e.scrollTop),0);
 await page.locator('#dub-cast .stu-name').first().fill('테스트');
 assert.equal(await page.locator('#dub-cast .stu-name').first().inputValue(),'테스트');
 assert.equal(await page.evaluate(()=>window.__dub.S.run),null);
 await page.locator('#dub-side-close').click();
 assert.equal(await page.locator('#dub-side').evaluate(e=>e.classList.contains('open')),false);
 await page.locator('[data-scene="1"]').click();
 assert.match(await page.locator('#dub-pick-sum').textContent(),/EP 2/);
 await page.locator('#dub-sheet-bg').click({position:{x:4,y:4}});
 assert.equal(await page.locator('#dub-side').evaluate(e=>e.classList.contains('open')),false);
 assert.deepEqual(errors,[]);console.log('PASS '+width+'px: dub button opens editable roles; close/backdrop; scene 2 selection; no recording or JS errors');await page.close();
 }}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});

