const puppeteer=require('puppeteer-core');const path=require('path');
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--force-device-scale-factor=1']});
 for(const [dir,tag] of [['build_html','ko'],['build_html_en','en']]){
   const pg=await b.newPage(); await pg.setViewport({width:900,height:1273,deviceScaleFactor:1.5});
   const url='file:///'+path.join(__dirname,dir,'teacher.html').split(path.sep).join('/');
   await pg.goto(url,{waitUntil:'networkidle0'}); await sleep(500);
   // 마무리 페이지 = 끝에서 두 번째 .page
   await pg.evaluate(()=>{const ps=document.querySelectorAll('.page'); ps[ps.length-2].scrollIntoView();}); await sleep(300);
   await pg.screenshot({path:path.join(__dirname,'qa','cc_'+tag+'.png')}); await pg.close();
 } await b.close(); console.log('done');})();
