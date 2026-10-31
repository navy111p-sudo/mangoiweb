const puppeteer=require('puppeteer-core');const path=require('path');
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--force-device-scale-factor=1']});
 const jobs=[['build_html','student','자녀 학습 한눈에','ko_parent'],['build_html','teacher','마이페이지 메뉴 100','ko_tmp'],['build_html','admin','포인트·리워드 정책','ko_apt'],['build_html_en','student','See Your Child','en_parent']];
 for(const [dir,aud,kw,tag] of jobs){
   const pg=await b.newPage(); await pg.setViewport({width:900,height:1273,deviceScaleFactor:1.35});
   const url='file:///'+path.join(__dirname,dir,aud+'.html').split(path.sep).join('/');
   await pg.goto(url,{waitUntil:'networkidle0'}); await sleep(400);
   await pg.evaluate((k)=>{const s=[...document.querySelectorAll('.sec')].find(e=>e.textContent.includes(k)); if(s)s.scrollIntoView({block:'center'});}, kw);
   await sleep(250);
   await pg.screenshot({path:path.join(__dirname,'qa','n_'+tag+'.png')}); await pg.close();
 } await b.close(); console.log('done');})();
