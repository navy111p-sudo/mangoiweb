const puppeteer=require('puppeteer-core');const path=require('path');
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--force-device-scale-factor=1']});
 for(const [dir,aud,kw,tag] of [['build_html','branch','마이페이지 & 관리자','kb'],['build_html_en','agency','My Page & Admin','ea']]){
   const pg=await b.newPage(); await pg.setViewport({width:900,height:1273,deviceScaleFactor:1.4});
   await pg.goto('file:///'+path.join(__dirname,dir,aud+'.html').split(path.sep).join('/'),{waitUntil:'networkidle0'}); await sleep(400);
   await pg.evaluate(k=>{const s=[...document.querySelectorAll('.sec')].find(e=>e.textContent.includes(k)); if(s)s.scrollIntoView({block:'center'});},kw); await sleep(250);
   await pg.screenshot({path:path.join(__dirname,'qa','m_'+tag+'.png')}); await pg.close();
 } await b.close(); console.log('done');})();
