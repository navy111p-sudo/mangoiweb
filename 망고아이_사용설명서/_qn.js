const puppeteer=require('puppeteer-core');const path=require('path');
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--force-device-scale-factor=1']});
 for(const [dir,aud,kw,tag] of [['build_html','student','한국·필리핀 듀얼','clock'],['build_html','student','중국어 발음 코치','cn']]){
   const pg=await b.newPage(); await pg.setViewport({width:900,height:1273,deviceScaleFactor:1.4});
   await pg.goto('file:///'+path.join(__dirname,dir,aud+'.html').split(path.sep).join('/'),{waitUntil:'networkidle0'}); await sleep(400);
   await pg.evaluate(k=>{const s=[...document.querySelectorAll('.sec')].find(e=>e.textContent.includes(k)); if(s)s.scrollIntoView({block:'center'});},kw); await sleep(250);
   await pg.screenshot({path:path.join(__dirname,'qa','nf_'+tag+'.png')}); await pg.close();
 } await b.close(); console.log('done');})();
