// 2026-07-23 신규 기능 캡처 → assets/opt/*.jpg (1280x800, jpeg q78)
const puppeteer = require('puppeteer-core');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://127.0.0.1:8199';
const OPT = path.join(__dirname, 'assets', 'opt');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const STUDENT_LS = () => {
  const u = { uid: 'demo-student', name: '민준', id: 'student' };
  localStorage.setItem('mango_user', JSON.stringify(u));
  localStorage.setItem('mangoi_logged_user', JSON.stringify(u));
  localStorage.setItem('mangoi_lang', 'ko');
};
const ADMIN_LS = () => {
  localStorage.setItem('mangoi_admin_session', JSON.stringify({
    role: 'admin', name: '관리자', agency_id: 'gn001', branch: '강남점', ok: true, ts: Date.now()
  }));
  localStorage.setItem('mangoi_lang', 'ko');
};

(async () => {
  const b = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--force-device-scale-factor=1', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']
  });
  const VP = { width: 1280, height: 800, deviceScaleFactor: 1 };

  async function shot(pg, key) {
    await pg.screenshot({ path: path.join(OPT, key + '.jpg'), type: 'jpeg', quality: 78 });
    console.log('  saved', key + '.jpg');
  }

  // ── 학생/공용 단독 페이지 ──
  async function pageShot(url, key, ls, extra, wait) {
    try {
      const pg = await b.newPage(); await pg.setViewport(VP);
      if (ls) await pg.evaluateOnNewDocument(ls);
      await pg.goto(BASE + url, { waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {});
      await sleep(wait || 2200);
      await pg.evaluate(() => {
        document.querySelectorAll('.intro-overlay,#intro-overlay,.splash,#splash').forEach(e => e.remove());
      });
      if (extra) { await pg.evaluate(extra); await sleep(1400); }
      await shot(pg, key); await pg.close();
    } catch (e) { console.log(key, 'FAIL', e.message); }
  }

  await pageShot('/judgment.html', 'student_judgment', STUDENT_LS, null, 3500);
  await pageShot('/student-game-grammar-pizza.html', 'student_pizza', STUDENT_LS, null, 2500);
  await pageShot('/student-game-tetris.html', 'student_tetris', STUDENT_LS, null, 2500);
  await pageShot('/student-game-tank-battle.html', 'student_tank', STUDENT_LS, null, 2500);
  await pageShot('/student-game-language-ace.html', 'student_langace', STUDENT_LS, null, 2500);
  await pageShot('/enroll.html', 'admin_enroll', ADMIN_LS, null, 2800);
  await pageShot('/enroll-pricing.html', 'admin_enroll_pricing', ADMIN_LS, null, 2500);
  await pageShot('/ux-stats.html', 'admin_uxstats', ADMIN_LS, null, 2800);

  // ── 관리자 카드 ──
  async function adminCard(card, key, extra) {
    try {
      const pg = await b.newPage(); await pg.setViewport(VP);
      await pg.evaluateOnNewDocument(ADMIN_LS);
      await pg.goto(BASE + '/admin.html', { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
      await sleep(4000);
      await pg.evaluate(() => {
        ['ai-panel', 'ai-greeting-bubble', 'voice-hint'].forEach(id => { const e = document.getElementById(id); if (e) e.style.display = 'none'; });
      });
      if (card) {
        await pg.evaluate((c) => { window.jumpToMenu && window.jumpToMenu(c); }, card);
        await sleep(2500);
        await pg.evaluate((c) => {
          var el = document.getElementById(c);
          if (el) { if (el.tagName === 'DETAILS') el.open = true; el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -70); }
          ['ai-panel', 'ai-greeting-bubble'].forEach(id => { const e = document.getElementById(id); if (e) e.style.display = 'none'; });
        }, card);
        await sleep(900);
      }
      if (extra) { await pg.evaluate(extra); await sleep(1200); }
      await shot(pg, key); await pg.close();
    } catch (e) { console.log(key, 'FAIL', e.message); }
  }

  await adminCard('card-admin-ghost', 'admin_ghost', null);
  await adminCard('card-lesson-insight', 'admin_lessoninsight', null);
  // 사이드바 접기(아이콘 레일) 상태
  await adminCard(null, 'admin_sidebar_rail', () => {
    ['toggleSidebar', 'miToggleSidebar', 'admToggleSidebar', 'toggleAdmSidebar'].forEach(fn => { try { window[fn] && window[fn](); } catch (e) {} });
    document.querySelectorAll('[onclick*="ollapse"],[onclick*="idebar"]').forEach(() => {});
    window.scrollTo(0, 0);
  });

  await b.close(); console.log('DONE');
})();
