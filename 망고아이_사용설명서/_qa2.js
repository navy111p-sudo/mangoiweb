const puppeteer=require('puppeteer-core');const path=require('path');
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--force-device-scale-factor=1']});
 for(const [dir,tag,kw] of [['build_html','ko','칭찬 포인트'],['build_html_en','en','Praise Points During']]){
   const pg=await b.newPage(); await pg.setViewport({width:900,height:1273,deviceScaleFactor:1.4});
   const url='file:///'+path.join(__dirname,dir,'teacher.html').split(path.sep).join('/');
   await pg.goto(url,{waitUntil:'networkidle0'}); await sleep(500);
   await pg.evaluate((k)=>{const s=[...document.querySelectorAll('.sec')].find(e=>e.textContent.includes(k)); if(s)s.scrollIntoView({block:'center'});}, kw);
   await sleep(300);
   await pg.screenshot({path:path.join(__dirname,'qa','pr_'+tag+'.png')}); await pg.close();
 } await b.close(); console.log('done');})();
