const puppeteer = require('puppeteer-core');
const path = require('path'); const fs = require('fs');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const HTML = path.join(__dirname, process.env.QA_HTML || 'build_html_en');
const QA = path.join(__dirname, 'qa');
fs.mkdirSync(QA, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const JOBS = [['student',[1,2,3]],['teacher',[5,6]]];
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox','--force-device-scale-factor=1'] });
  for (const [aud, pages] of JOBS) {
    const pg = await b.newPage();
    await pg.setViewport({ width: 900, height: 1273, deviceScaleFactor: 1.4 });
    await pg.goto('file:///' + path.join(HTML, aud + '.html').replace(/\\/g,'/'), { waitUntil: 'networkidle0' });
    await sleep(600);
    for (const n of pages) {
      const ok = await pg.evaluate((i) => { const el = document.querySelectorAll('.page')[i-1]; if(!el) return false; el.scrollIntoView(); return true; }, n);
      if (!ok) continue;
      await sleep(300);
      await pg.screenshot({ path: path.join(QA, `pg_${aud}_${n}.png`) });
    }
    await pg.close();
  }
  await b.close(); console.log('QA pages done');
})();
