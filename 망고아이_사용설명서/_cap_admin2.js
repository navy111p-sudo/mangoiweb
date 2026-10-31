const puppeteer = require('puppeteer-core');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://127.0.0.1:8199';
const OPT = path.join(__dirname, 'assets', 'opt');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ADMIN_LS = () => {
  localStorage.setItem('mangoi_admin_session', JSON.stringify({ role: 'admin', name: '관리자', agency_id: 'gn001', branch: '강남점', ok: true, ts: Date.now() }));
};
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--force-device-scale-factor=1'] });
  async function adminCard(card, key, extra) {
    const pg = await b.newPage(); await pg.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    await pg.evaluateOnNewDocument(ADMIN_LS);
    await pg.goto(BASE + '/admin.html', { waitUntil: 'networkidle2', timeout: 60000 }).catch(()=>{});
    await sleep(4000);
    // AI 잔여 패널/버블 숨김
    await pg.evaluate(() => {
      ['ai-panel','ai-greeting-bubble','voice-hint'].forEach(id=>{const e=document.getElementById(id);if(e)e.style.display='none';});
    });
    await pg.evaluate((c) => { window.jumpToMenu && window.jumpToMenu(c); }, card);
    await sleep(2500);
    // 카드 요소를 직접 펼치고 상단 정렬
    await pg.evaluate((c) => {
      var el = document.getElementById(c);
      if (el) { if (el.tagName === 'DETAILS') el.open = true; el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -70); }
      ['ai-panel','ai-greeting-bubble'].forEach(id=>{const e=document.getElementById(id);if(e)e.style.display='none';});
    }, card);
    await sleep(800);
    if (extra) { await pg.evaluate(extra); await sleep(900); }
    await pg.screenshot({ path: path.join(OPT, key + '.jpg'), type: 'jpeg', quality: 78 });
    console.log('saved', key); await pg.close();
  }
  await adminCard('card-poster-maker', 'admin_noticestudio', () => { window.noticeStudioTab && window.noticeStudioTab('make'); var e=document.getElementById('card-poster-maker'); if(e){e.scrollIntoView({block:'start'});window.scrollBy(0,-70);} });
  await adminCard('card-voice-diary', 'admin_voicediary', null);
  await b.close(); console.log('DONE');
})();
