const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const HERE = __dirname;
const suffix = process.env.MANUAL_SUFFIX || '';
const HTML = path.join(HERE, 'build_html' + suffix);
const QA = path.join(HERE, 'qa');
fs.mkdirSync(QA, { recursive: true });
const manifest = JSON.parse(fs.readFileSync(path.join(HTML, 'manifest.json'), 'utf8'));
manifest.forEach(m => fs.mkdirSync(path.dirname(m.pdf), { recursive: true }));
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox','--disable-dev-shm-usage','--force-device-scale-factor=1'] });
  for (const m of manifest) {
    const page = await browser.newPage();
    await page.setViewport({ width: 900, height: 1273, deviceScaleFactor: 1.5 });
    const url = 'file:///' + m.html.replace(/\\/g, '/');
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 90000 });
    await sleep(700);
    await page.pdf({ path: m.pdf, format: 'A4', printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    const kb = (fs.statSync(m.pdf).size / 1024) | 0;
    console.log('PDF', m.aud, kb + 'KB', '->', m.pdf);
    await page.close();
  }
  await browser.close();
  console.log('DONE');
})();
