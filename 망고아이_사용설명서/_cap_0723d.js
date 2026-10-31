const puppeteer = require('puppeteer-core');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://127.0.0.1:8199';
const OPT = path.join(__dirname, 'assets', 'opt');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ADMIN_LS = () => {
  localStorage.setItem('mangoi_admin_session', JSON.stringify({ role:'admin', name:'관리자', agency_id:'gn001', branch:'강남점', ok:true, ts:Date.now() }));
  localStorage.setItem('mangoi_lang','ko');
  localStorage.setItem('mangoi_admin_welcome_v1_hide','1');
  sessionStorage.setItem('mangoi_admin_welcome_v1_seen','1');
};
const CLEAN = () => {
  const k = document.getElementById('kpi');
  if (k && k.textContent.indexOf('데이터 로드 실패') >= 0) k.innerHTML = '';
  ['ai-panel','ai-greeting-bubble','voice-hint'].forEach(id=>{const e=document.getElementById(id);if(e)e.style.display='none';});
};
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless:'new', args:['--no-sandbox','--force-device-scale-factor=1'] });
  async function card(c, key){
    const pg = await b.newPage(); await pg.setViewport({width:1280,height:800,deviceScaleFactor:1});
    await pg.evaluateOnNewDocument(ADMIN_LS);
    await pg.goto(BASE+'/admin.html',{waitUntil:'networkidle2',timeout:60000}).catch(()=>{});
    await sleep(4500); await pg.evaluate(CLEAN);
    await pg.evaluate((x)=>{ window.jumpToMenu && window.jumpToMenu(x); }, c);
    await sleep(2500);
    await pg.evaluate((x)=>{ var el=document.getElementById(x); if(el){ if(el.tagName==='DETAILS') el.open=true; el.scrollIntoView({block:'start'}); window.scrollBy(0,-70);} }, c);
    await sleep(800); await pg.evaluate(CLEAN); await sleep(400);
    await pg.screenshot({path:path.join(OPT,key+'.jpg'),type:'jpeg',quality:78});
    console.log('saved',key); await pg.close();
  }
  await card('card-teacher-mgmt','admin_teachers');
  await b.close(); console.log('DONE');
})();
