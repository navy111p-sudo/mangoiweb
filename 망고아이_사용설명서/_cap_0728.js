// 2026-07-28 신규/변경 화면 캡처 → assets/opt/*.jpg (1280x800, jpeg q78)
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
  localStorage.setItem('mangoi_admin_welcome_v1_hide', '1');
  sessionStorage.setItem('mangoi_admin_welcome_v1_seen', '1');
};
const ADM_CLEAN = () => {
  const k = document.getElementById('kpi');
  if (k && k.textContent.indexOf('데이터 로드 실패') >= 0) k.innerHTML = '';
  ['ai-panel', 'ai-greeting-bubble', 'voice-hint'].forEach(id => { const e = document.getElementById(id); if (e) e.style.display = 'none'; });
};

(async () => {
  const b = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--force-device-scale-factor=1', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']
  });
  const VP = { width: 1280, height: 800, deviceScaleFactor: 1 };
  const shot = async (pg, key) => {
    await pg.screenshot({ path: path.join(OPT, key + '.jpg'), type: 'jpeg', quality: 78 });
    console.log('  saved', key + '.jpg');
  };

  // ── 1) 탈출: 말해야 열린다 (인트로 화면) ──
  try {
    const pg = await b.newPage(); await pg.setViewport(VP);
    await pg.evaluateOnNewDocument(STUDENT_LS);
    await pg.goto(BASE + '/student-game-escape-voice.html', { waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {});
    await sleep(3000);
    await shot(pg, 'student_escape'); await pg.close();
  } catch (e) { console.log('escape FAIL', e.message); }

  // ── 2) 홈 히어로 (비회원 = 무료 체험 신청 1순위) ──
  try {
    const pg = await b.newPage(); await pg.setViewport(VP);
    await pg.evaluateOnNewDocument(() => {
      try { localStorage.removeItem('mango_token'); localStorage.removeItem('mango_user'); } catch (e) {}
      localStorage.setItem('mangoi_lang', 'ko');
    });
    await pg.goto(BASE + '/index.html', { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
    await sleep(4500);
    // 인트로 오버레이/팝업 제거
    await pg.evaluate(() => {
      ['intro-overlay', 'intro-screen', 'popup-layer', 'ai-greeting-bubble', 'ai-panel'].forEach(id => {
        const e = document.getElementById(id); if (e) e.style.display = 'none';
      });
      document.querySelectorAll('.popup-backdrop,.modal-backdrop').forEach(e => e.style.display = 'none');
      window.scrollTo(0, 0);
    });
    await sleep(1200);
    await shot(pg, 'student_home'); await pg.close();
  } catch (e) { console.log('home FAIL', e.message); }

  // ── 3) 마이 단어장 허브 (6탭) ──
  try {
    const pg = await b.newPage(); await pg.setViewport(VP);
    await pg.evaluateOnNewDocument(STUDENT_LS);
    await pg.goto(BASE + '/vocab.html', { waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {});
    await sleep(3500);
    await pg.evaluate(() => {
      // 온보딩 오버레이가 탭을 가리면 닫는다
      document.querySelectorAll('[id*="onboard"],[class*="onboard"]').forEach(e => {
        const st = getComputedStyle(e);
        if (st.position === 'fixed' || st.position === 'absolute') e.style.display = 'none';
      });
      window.scrollTo(0, 0);
    });
    await sleep(900);
    await shot(pg, 'student_vocab'); await pg.close();
  } catch (e) { console.log('vocab FAIL', e.message); }

  // ── 4) 학부모 주간 리포트 (신규 관리자 화면) ──
  try {
    const pg = await b.newPage(); await pg.setViewport(VP);
    await pg.evaluateOnNewDocument(ADMIN_LS);
    await pg.goto(BASE + '/parent-report.html', { waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {});
    await sleep(2800);
    await pg.evaluate(() => window.scrollTo(0, 0));
    await sleep(600);
    await shot(pg, 'admin_parent_weekly'); await pg.close();
  } catch (e) { console.log('parent-report FAIL', e.message); }

  // ── 5) 강사 명부 (첫 열 고정) 재촬영 ──
  try {
    const pg = await b.newPage(); await pg.setViewport(VP);
    await pg.evaluateOnNewDocument(ADMIN_LS);
    await pg.goto(BASE + '/admin.html', { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
    await sleep(4500);
    await pg.evaluate(ADM_CLEAN);
    await pg.evaluate(() => { window.jumpToMenu && window.jumpToMenu('card-teacher-mgmt'); });
    await sleep(2800);
    await pg.evaluate(() => {
      const el = document.getElementById('card-teacher-mgmt');
      if (el) { if (el.tagName === 'DETAILS') el.open = true; el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -70); }
    });
    await sleep(1400);
    await pg.evaluate(ADM_CLEAN);
    await sleep(400);
    await shot(pg, 'admin_teachers'); await pg.close();
  } catch (e) { console.log('teachers FAIL', e.message); }

  await b.close(); console.log('DONE');
})();
