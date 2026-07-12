import puppeteer from 'puppeteer-core';
const INDEX = 'C:/Users/Admin/Desktop/mangoi_develop2-main/cloudflare-deploy/public/index.html';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless:'new', args:['--no-sandbox'] });
const page = await browser.newPage();
page.on('pageerror', e => console.log('[PAGEERROR]', String(e.stack||e).slice(0,400)));
page.on('console', m => { if(m.type()==='error') console.log('[console.error]', m.text().slice(0,300)); });
await page.evaluateOnNewDocument(() => {
  try {
    const mock = { register: () => Promise.resolve({ update(){}, unregister(){ return Promise.resolve(true); } }),
      getRegistrations: () => Promise.resolve([]), getRegistration: () => Promise.resolve(undefined),
      ready: Promise.resolve({}), addEventListener(){}, controller: null };
    Object.defineProperty(navigator, 'serviceWorker', { get: () => mock, configurable: true });
  } catch (_) {}
});
await page.setViewport({ width:390, height:844, isMobile:true, hasTouch:true });
await page.goto('file:///' + INDEX, { waitUntil:'domcontentloaded' });
await new Promise(r=>setTimeout(r,900));
const out = await page.evaluate(()=>{
  const rows = [...document.querySelectorAll('.vc-main-row')].map(r=>r.id||'(noid)');
  const typeofFns = {};
  ['vcMobileToggleMore','vcFolderOpen','vcFolderClose','vcCanvasTool','vcCanvasColor','vcCanvasClear','vcCanvasSave','vcScreenSet','vcSetVideoSize','vcTogglePip','vcToggleSolo'].forEach(n=>typeofFns[n]=typeof window[n]);
  const row = document.getElementById('vc-main-row');
  const before = row.className;
  let warn = null;
  const origWarn = console.warn; console.warn = (...a)=>{ warn = a.join(' '); };
  if(window.vcScreenSet) window.vcScreenSet('facepip');
  console.warn = origWarn;
  const afterFn = row.className;
  // 수동 강제 후 재확인 (되돌려지는지)
  row.classList.remove('video-half'); row.classList.add('video-facepip');
  const manual = row.className;
  return { rows, typeofFns, before, afterFn, warn, manual };
});
console.log(JSON.stringify(out,null,2));
await browser.close();
