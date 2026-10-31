import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { loadPlaywright, findChromium } from './_pw.mjs';
const code = readFileSync(new URL('../../cloudflare-deploy/public/js/idx-vc-book-history.js', import.meta.url), 'utf8');
const fixture = `<!doctype html><html><body><div style="display:flex;flex-wrap:wrap"><span id="pdf-page-info">1</span></div><script>
let pdfPageNum=1,vcRoomId='one';window.calls=[];window.staff=true;
window.miIsEn=()=>localStorage.getItem('lang')==='en';window.vcCanControlTextbook=()=>window.staff;
window.pdfGoToPage=p=>{pdfPageNum=p};window._pdfBroadcastPage=()=>{};
window.selectFromTextbookLibrary=async(id,url)=>{window.calls.push(url);window._vcCurrentPdfUrl=url;pdfPageNum=1};
window.vcShareTextbook=()=>{};
</script><script>${code}</script></body></html>`;
const server=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(fixture)});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const pw = loadPlaywright();
assert(pw, 'Playwright must be installed; this test must not silently skip');
const exe = process.env.MANGOI_CHROME_EXECUTABLE || findChromium();
assert(exe, 'Chromium executable is required');
const browser=await pw.chromium.launch({executablePath:exe,headless:true,
args:['--disable-background-networking','--disable-component-update']});
let pass=0,checks=0;const failures=[];
const cases=Number(process.env.BROWSER_CASES || 300);
assert(Number.isInteger(cases) && cases > 0 && cases <= 10000, 'BROWSER_CASES must be 1..10000');
try {
  for(let seed=0;seed<cases;seed++){
    const context=await browser.newContext({viewport:seed%2?{width:390,height:844}:{width:1366,height:768},serviceWorkers:'block'});
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    try {
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      const expectedPage=1+seed%20;
      await page.evaluate(async({seed,p})=>{
        localStorage.setItem('lang',seed%3?'en':'ko');
        window._libSequence=[{id:'a',url:'/a.pdf'}];window._libSeqIdx=0;
        await selectFromTextbookLibrary('a','/a.pdf','pdf','[Alpha] lesson');pdfPageNum=p;
        window._libSequence=[{id:'b',url:'/b.pdf'}];
        await selectFromTextbookLibrary('b','/b.pdf','pdf','[Beta] lesson');pdfPageNum=3;
      },{seed,p:expectedPage});
      await page.selectOption('#vc-book-history','Alpha');
      await page.waitForFunction(()=>window._vcCurrentPdfUrl==='/a.pdf'&&!document.getElementById('vc-book-history').disabled);
      assert.equal(await page.evaluate(()=>pdfPageNum),expectedPage);checks++;
      await page.selectOption('#vc-book-history','Alpha');
      assert.equal(await page.evaluate(()=>pdfPageNum),expectedPage);checks++;
      const label=await page.locator('#vc-book-history').getAttribute('aria-label');
      assert.equal(label,seed%3?'Books opened in this session':'이번 수업에서 연 교재');checks++;
      const before=await page.evaluate(()=>window.calls.length);
      if(seed%2){
        await page.evaluate(()=>{window.staff=false});
        await page.selectOption('#vc-book-history','Beta');
        assert.equal(await page.locator('#vc-book-history').isHidden(),true);checks++;
      }else{
        await page.evaluate(()=>{vcRoomId='two'});
        await page.selectOption('#vc-book-history','Beta');
        assert.equal(await page.locator('#vc-book-history option').count(),0);checks++;
      }
      assert.equal(await page.evaluate(()=>window.calls.length),before);checks++;
      assert.deepEqual(errors,[]);checks++;pass++;
    }catch(e){failures.push({seed,message:e.message});if(failures.length<4)console.error('Failure',seed,e.message);}
    finally{await context.close()}
    if((seed+1)%50===0)console.log(`Browser scenarios ${seed+1}/300; failures ${failures.length}`);
  }
}finally{await browser.close();await new Promise(r=>server.close(r))}
const report={browser:'Chrome',scenarios:cases,pass,fail:failures.length,checks,failures};
if (process.env.BROWSER_REPORT) writeFileSync(process.env.BROWSER_REPORT,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));process.exitCode=failures.length?1:0;
