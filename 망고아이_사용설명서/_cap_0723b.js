// 2026-07-23 재캡처 (데모 데이터 주입 + 환영모달 숨김) → assets/opt/*.jpg
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
  localStorage.setItem('mangoi_admin_welcome_v1_hide', '1');   // 환영 온보딩 모달 숨김
  sessionStorage.setItem('mangoi_admin_welcome_v1_seen', '1');
};

// ── 데모 API 스텁 (백엔드 미연결 상태에서도 실제와 같은 화면을 캡처) ──
const STUB = () => {
  const J = (o) => Promise.resolve(new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  const orig = window.fetch.bind(window);
  window.fetch = function (u, o) {
    const url = String((u && u.url) || u || '');
    if (url.indexOf('/api/judgment/scenario') >= 0) {
      return J({
        ok: true, sid: 'demo-1', difficulty: 3, textbook: 'Side by Side 2',
        skill_tag: 'politeness',
        situation: '수업이 끝나고 선생님께 오늘 배운 자료를 다시 받고 싶어요. 선생님은 바쁘게 다음 수업을 준비하고 계세요. 어떻게 말하는 것이 가장 좋을까요?',
        options: [
          'Give me that file.',
          'Could I have the file again, please?',
          'I want the file now.',
          'File, please!'
        ],
        option_scores: [20, 100, 35, 55],
        correct_index: 1
      });
    }
    if (url.indexOf('/api/judgment/growth') >= 0) {
      return J({ ok: true, index: 72, axes: { situation: 78, politeness: 81, reasoning: 64, recovery: 70, consistency: 67 }, count: 24 });
    }
    if (url.indexOf('/api/pay/enroll/teachers') >= 0) {
      return J({ ok: true, teachers: [
        { id: 't1', name: 'Anna' }, { id: 't2', name: 'Grace' },
        { id: 't3', name: 'Mark' }, { id: 't4', name: 'Sophia' }
      ]});
    }
    if (url.indexOf('/api/pay/enroll/quote') >= 0) {
      return J({ ok: true, amount: 132000, name: '주2회 · 1개월 · 20분', discountRate: 1 });
    }
    if (url.indexOf('/api/pay/enroll/check') >= 0) {
      return J({ ok: true, ok_to_book: true, first_date: '2026-07-27', last_date: '2026-08-24', sessions: 8, conflict_count: 0 });
    }
    return orig(u, o);
  };
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

  // ── 판단력 훈련 (문제 표시 상태) ──
  try {
    const pg = await b.newPage(); await pg.setViewport(VP);
    await pg.evaluateOnNewDocument(STUDENT_LS);
    await pg.evaluateOnNewDocument(STUB);
    await pg.goto(BASE + '/judgment.html', { waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {});
    await sleep(3500);
    // 상단 '왜 판단력 훈련을 하나요?' 안내는 접어서 문제 영역이 보이게
    await pg.evaluate(() => {
      document.querySelectorAll('details[open]').forEach(d => { d.open = false; });
      window.scrollTo(0, 0);
    });
    await sleep(900);
    await shot(pg, 'student_judgment'); await pg.close();
  } catch (e) { console.log('judgment FAIL', e.message); }

  // ── 수강신청(등록·결제) — 강사/요일 선택까지 채운 상태 ──
  try {
    const pg = await b.newPage(); await pg.setViewport(VP);
    await pg.evaluateOnNewDocument(STUDENT_LS);
    await pg.evaluateOnNewDocument(STUB);
    await pg.goto(BASE + '/enroll.html', { waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {});
    await sleep(2500);
    await pg.evaluate(() => {
      const t = document.querySelector('.tcard'); if (t) t.click();
    });
    await sleep(700);
    await pg.evaluate(() => {
      const days = document.querySelectorAll('#dayBox .chip, .days .chip, [id*="day" i] .chip');
      if (days.length >= 4) { days[1].click(); days[3].click(); }
    });
    await sleep(1800);
    await shot(pg, 'admin_enroll'); await pg.close();
  } catch (e) { console.log('enroll FAIL', e.message); }

  // ── 관리자 카드 (환영 모달 숨김) ──
  async function adminCard(card, key, extra, preLS) {
    try {
      const pg = await b.newPage(); await pg.setViewport(VP);
      await pg.evaluateOnNewDocument(ADMIN_LS);
      if (preLS) await pg.evaluateOnNewDocument(preLS);
      await pg.goto(BASE + '/admin.html', { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
      await sleep(4000);
      await pg.evaluate(() => {
        ['ai-panel', 'ai-greeting-bubble', 'voice-hint'].forEach(id => { const e = document.getElementById(id); if (e) e.style.display = 'none'; });
        document.querySelectorAll('#aw-modal,#aw-wrap,.aw-backdrop,[id^="aw-"]').forEach(e => { if (e.id === 'aw-modal' || e.id === 'aw-wrap' || e.className.indexOf('aw-backdrop') >= 0) e.remove(); });
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
  await adminCard(null, 'admin_sidebar_rail', () => { window.scrollTo(0, 0); },
    () => { localStorage.setItem('mangoi_admin_nav_collapsed', '1'); });

  await b.close(); console.log('DONE');
})();
