const puppeteer=require('puppeteer-core');const path=require('path');
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--force-device-scale-factor=1']});
 for(const [aud] of [['branch'],['agency']]){
   const pg=await b.newPage(); await pg.setViewport({width:900,height:1273,deviceScaleFactor:1.3});
   await pg.goto('file:///'+path.join(__dirname,'build_html',aud+'.html').split(path.sep).join('/'),{waitUntil:'networkidle0'}); await sleep(400);
   for(const n of [1,3]){ await pg.evaluate(i=>{document.querySelectorAll('.page')[i-1].scrollIntoView();},n); await sleep(250); await pg.screenshot({path:path.join(__dirname,'qa',`b_${aud}_${n}.png`)}); }
   await pg.close();
 } await b.close(); console.log('done');})();
