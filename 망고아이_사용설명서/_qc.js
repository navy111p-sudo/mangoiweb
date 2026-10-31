const puppeteer=require('puppeteer-core');const path=require('path');
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--force-device-scale-factor=1']});
 for(const [dir,aud,kw,tag] of [['build_html','student','AI 음성 일기','qc_diary'],['build_html','admin','공지 스튜디오','qc_notice'],['build_html_en','teacher','AI Coaching After Class','qc_coach_en']]){
   const pg=await b.newPage(); await pg.setViewport({width:900,height:1273,deviceScaleFactor:1.4});
   await pg.goto('file:///'+path.join(__dirname,dir,aud+'.html').split(path.sep).join('/'),{waitUntil:'networkidle0'}); await sleep(400);
   const found=await pg.evaluate(k=>{const s=[...document.querySelectorAll('.sec,.section,section')].find(e=>e.textContent.includes(k)); if(s){s.scrollIntoView({block:'center'});return true;}return false;},kw); await sleep(300);
   await pg.screenshot({path:path.join(__dirname,'qa',tag+'.png')}); console.log(tag,found); await pg.close();
 } await b.close();})();
