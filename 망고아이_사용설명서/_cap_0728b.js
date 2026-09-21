const puppeteer = require('puppeteer-core');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://127.0.0.1:8199';
const OPT = path.join(__dirname, 'assets', 'opt');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox','--force-device-scale-factor=1','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'] });
  const VP = { width: 1280, height: 800, deviceScaleFactor: 1 };
  const shot = async (pg,k)=>{ await pg.screenshot({path:path.join(OPT,k+'.jpg'),type:'jpeg',quality:78}); console.log('  saved',k+'.jpg'); };

  // 홈 히어로 — 완전 비로그인 + 온보딩 억제
  try {
    const pg = await b.newPage(); await pg.setViewport(VP);
    await pg.evaluateOnNewDocument(() => {
      try { localStorage.clear(); sessionStorage.clear(); } catch(e){}
      localStorage.setItem('mangoi_lang','ko');
      localStorage.setItem('mangoi_onboard_v1','skip:1');
      localStorage.setItem('mango_vocab_onboard_dismissed','1');
    });
    await pg.goto(BASE + '/index.html', { waitUntil:'networkidle2', timeout:60000 }).catch(()=>{});
    await sleep(5000);
    await pg.evaluate(() => {
      ['mango-intro','mango-intro-skip','intro-overlay','ai-greeting-bubble','ai-panel','voice-hint'].forEach(id=>{const e=document.getElementById(id); if(e) e.style.display='none';});
      // 남은 전체화면 오버레이(코치마크/모달) 제거
      document.querySelectorAll('body *').forEach(e=>{
        const st=getComputedStyle(e);
        if(st.position==='fixed' && parseInt(st.zIndex||0)>=900 && e.getBoundingClientRect().width>380 && e.getBoundingClientRect().height>200){
          const t=(e.textContent||'');
          if(t.indexOf('건너뛰기')>=0||t.indexOf('다음')>=0||t.indexOf('여기!')>=0) e.style.display='none';
        }
      });
      window.scrollTo(0,0);
    });
    await sleep(1500);
    await shot(pg,'student_home'); await pg.close();
  } catch(e){ console.log('home FAIL', e.message); }

  // 단어장 허브 — 온보딩 억제
  try {
    const pg = await b.newPage(); await pg.setViewport(VP);
    await pg.evaluateOnNewDocument(() => {
      try { localStorage.clear(); sessionStorage.clear(); } catch(e){}
      const u = { uid:'demo-student', name:'민준', id:'student' };
      localStorage.setItem('mango_user', JSON.stringify(u));
      localStorage.setItem('mangoi_logged_user', JSON.stringify(u));
      localStorage.setItem('mangoi_lang','ko');
      localStorage.setItem('mango_vocab_onboard_dismissed','1');
      sessionStorage.setItem('mango_vocab_onboard_dismissed_seen','1');
    });
    await pg.goto(BASE + '/vocab.html', { waitUntil:'networkidle2', timeout:45000 }).catch(()=>{});
    await sleep(3500);
    await pg.evaluate(()=>{ try{ window.closeOnboarding && window.closeOnboarding(); }catch(e){} window.scrollTo(0,0); });
    await sleep(1200);
    await shot(pg,'student_vocab'); await pg.close();
  } catch(e){ console.log('vocab FAIL', e.message); }

  await b.close(); console.log('DONE');
})();
