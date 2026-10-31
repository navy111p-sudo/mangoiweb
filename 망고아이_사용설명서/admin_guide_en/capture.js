// ═══════════════════════════════════════════════════════════════
// capture.js — auto-captures the EN admin screenshots the guide needs,
// straight from the local admin.html (served at :8799). Data-heavy panels
// return 404 locally, so we only shoot the navigation / home chrome that
// renders cleanly in English; data screens stay as labelled placeholders.
//
//   node capture.js      → writes PNGs into ../capture_en/
// ═══════════════════════════════════════════════════════════════
const puppeteer = require('puppeteer-core');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://127.0.0.1:8799';
const OUT = path.join(__dirname, '..', 'capture_en');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const SESSION = { username: 'admin', role: 'admin', name: 'Admin', ts: Date.now() };

async function newPage(b, en) {
  const pg = await b.newPage();
  await pg.setViewport({ width: 1720, height: 960, deviceScaleFactor: 2 });
  await pg.evaluateOnNewDocument((s, lang) => {
    localStorage.setItem('mangoi_admin_session', JSON.stringify(s));
    localStorage.setItem('mangoi_lang', lang);           // i18n-sweep reads this
  }, SESSION, en ? 'en' : 'ko');
  return pg;
}

async function toEN(pg) {
  await pg.evaluate(() => { try { if (window.adminLang && window.adminLang !== 'en') window.toggleAdminLang(); } catch (e) {} });
  await sleep(2200);
}

// Hide floating widgets that overlap the chrome (world clock, FABs, video tile).
async function hideFloaters(pg) {
  await pg.evaluate(() => {
    ['mgWorldClock', 'kakao-chat-fab', 'adm-refresh-fab', 'mi-ops-fab',
     'ph133-precheck-fab', 'greet-pop'].forEach(id => {
      const e = document.getElementById(id); if (e) e.style.display = 'none';
    });
    // any bottom-right live video tile / self-cam
    document.querySelectorAll('video, [id*="selfcam"], [class*="self-cam"]').forEach(e => {
      const r = e.getBoundingClientRect();
      if (r.width && r.right > window.innerWidth - 400 && r.bottom > window.innerHeight - 400) e.style.visibility = 'hidden';
    });
  });
  await sleep(300);
}

(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });

  // ── 01_login ───────────────────────────────────────────────
  {
    const pg = await newPage(b, true);
    await pg.goto(BASE + '/admin/login.html', { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(1800);
    // hide the floating consultant popup so the shot is clean
    await pg.evaluate(() => { const p = document.getElementById('greet-pop'); if (p) p.style.display = 'none';
      document.querySelectorAll('[id*="greet"],[class*="greet"]').forEach(e => { if (e.id === 'greet-pop' || e.closest('#greet-pop')) e.style.display = 'none'; }); });
    await sleep(600);
    await pg.screenshot({ path: path.join(OUT, '01_login.png') });
    await pg.close();
    console.log('✓ 01_login');
  }

  // ── admin.html in EN (reused for 02/03/04) ─────────────────
  const pg = await newPage(b, true);
  await pg.goto(BASE + '/admin.html', { waitUntil: 'networkidle2', timeout: 90000 });
  await sleep(2500);
  await toEN(pg);
  await hideFloaters(pg);

  // Polish the EN home for a clean shot: swap the baked-in Korean greeting PNG
  // for its English <h1> fallback, translate the search placeholder, and drop
  // the local-only "load failed" banner (data APIs 404 off-server).
  await pg.evaluate(() => {
    const img = document.querySelector('.hero-banner-img');
    if (img) { img.style.display = 'none';
      const h1 = img.nextElementSibling;
      if (h1) { h1.style.display = 'inline-block'; h1.textContent = h1.getAttribute('data-en') || h1.textContent; } }
    const s = document.getElementById('ph85-search'); if (s) s.setAttribute('placeholder', '🔍 Search menu…');
    document.querySelectorAll('*').forEach(el => {
      if (el.children.length === 0 && /Load Failed|로드 실패|HTTP 404/.test(el.textContent)) {
        const card = el.closest('.menu-card, section, .card, div');
        if (card && card.offsetHeight < 400) card.style.display = 'none';
      }
    });
  });
  await sleep(500);

  // 03_dashboard — clip to the hero row (excludes any lower error/empty panels)
  await pg.screenshot({ path: path.join(OUT, '03_dashboard.png'), clip: { x: 0, y: 0, width: 1720, height: 815 } });
  console.log('✓ 03_dashboard');

  // 02_sidebar — crop the sidebar element (collapsed)
  {
    const el = await pg.$('#ph85-sidebar');
    await el.screenshot({ path: path.join(OUT, '02_sidebar.png') });
    console.log('✓ 02_sidebar');
  }

  // 04_sidebar_open — expand the Teachers group, then crop the sidebar
  {
    await pg.evaluate(() => {
      const heads = [...document.querySelectorAll('#ph85-sidebar .ph85-group .ph85-head')];
      const t = heads.find(h => /Teacher/i.test(h.textContent)) || heads[2];
      if (t) t.click();
    });
    await sleep(900);
    await hideFloaters(pg);
    const el = await pg.$('#ph85-sidebar');
    await el.screenshot({ path: path.join(OUT, '04_sidebar_open.png') });
    console.log('✓ 04_sidebar_open');
  }

  await b.close();
  console.log('done → ' + OUT);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
