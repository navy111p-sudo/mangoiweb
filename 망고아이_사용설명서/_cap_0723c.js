// 2026-07-23 마감 캡처 (스크롤 위치·잡요소 정리) → assets/opt/*.jpg
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
const STUB = () => {
  const J = (o) => Promise.resolve(new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  const orig = window.fetch.bind(window);
  window.fetch = function (u, o) {
    const url = String((u && u.url) || u || '');
    if (url.indexOf('/api/judgment/scenario') >= 0) {
      return J({ ok: true, sid: 'demo-1', difficulty: 3, textbook: 'Side by Side 2', skill_tag: 'politeness',
        situation: '수업이 끝나고 선생님께 오늘 배운 자료를 다시 받고 싶어요. 선생님은 바쁘게 다음 수업을 준비하고 계세요. 어떻게 말하는 것이 가장 좋을까요?',
        options: ['Give me that file.', 'Could I have the file again, please?', 'I want the file now.', 'File, please!'],
        option_scores: [20, 100, 35, 55], correct_index: 1 });
    }
    if (url.indexOf('/api/judgment/growth') >= 0) return J({ ok: true, index: 72, axes: { situation: 78, politeness: 81, reasoning: 64, recovery: 70, consistency: 67 }, count: 24 });
    return orig(u, o);
  };
};

// 관리자 화면 잡요소 제거 (백엔드 미연결 에러카드·아바타·시계칩)
const ADM_CLEAN = () => {
  const k = document.getElementById('kpi');
  if (k && k.textContent.indexOf('데이터 로드 실패') >= 0) k.innerHTML = '';
  ['ai-panel', 'ai-greeting-bubble', 'voice-hint'].forEach(id => { const e = document.getElementById(id); if (e) e.style.display = 'none'; });
  document.querySelectorAll('iframe[src*="avatar"],#mango-avatar-fab,#ai-avatar-fab,[id*="avatar" i]').forEach(e => { e.style.display = 'none'; });
  document.querySelectorAll('[id*="worldclock" i],[class*="worldclock" i],[id*="dualclock" i]').forEach(e => { e.style.display = 'none'; });
};

(async () => {
  const b = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--force-device-scale-factor=1', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']
  });
  const VP = { width: 1280, height: 800, deviceScaleFactor: 1 };
  const shot = async (pg, key) => { await pg.screenshot({ path: path.join(OPT, key + '.jpg'), type: 'jpeg', quality: 78 }); console.log('  saved', key + '.jpg'); };

  // 판단력 훈련 — 문제 카드가 화면 가운데 오도록
  try {
    const pg = await b.newPage(); await pg.setViewport(VP);
    await pg.evaluateOnNewDocument(STUDENT_LS);
    await pg.evaluateOnNewDocument(STUB);
    await pg.goto(BASE + '/judgment.html', { waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {});
    await sleep(3500);
    await pg.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('div,section'));
      const t = nodes.find(n => n.className && String(n.className).indexOf('sit') >= 0);
      const card = t ? (t.closest('section') || t.parentElement) : null;
      if (card) window.scrollTo(0, Math.max(0, card.getBoundingClientRect().top + window.scrollY - 40));
    });
    await sleep(800);
    await shot(pg, 'student_judgment'); await pg.close();
  } catch (e) { console.log('judgment FAIL', e.message); }

  async function adminCard(card, key, preLS) {
    try {
      const pg = await b.newPage(); await pg.setViewport(VP);
      await pg.evaluateOnNewDocument(ADMIN_LS);
      if (preLS) await pg.evaluateOnNewDocument(preLS);
      await pg.goto(BASE + '/admin.html', { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
      await sleep(4500);
      await pg.evaluate(ADM_CLEAN);
      if (card) {
        await pg.evaluate((c) => { window.jumpToMenu && window.jumpToMenu(c); }, card);
        await sleep(2500);
        await pg.evaluate((c) => {
          var el = document.getElementById(c);
          if (el) { if (el.tagName === 'DETAILS') el.open = true; el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -70); }
        }, card);
        await sleep(700);
      } else { await pg.evaluate(() => window.scrollTo(0, 0)); }
      await pg.evaluate(ADM_CLEAN);
      await sleep(500);
      await shot(pg, key); await pg.close();
    } catch (e) { console.log(key, 'FAIL', e.message); }
  }

  await adminCard('card-admin-ghost', 'admin_ghost');
  await adminCard('card-lesson-insight', 'admin_lessoninsight');
  await adminCard(null, 'admin_sidebar_rail', () => { localStorage.setItem('mangoi_admin_nav_collapsed', '1'); });

  await b.close(); console.log('DONE');
})();
