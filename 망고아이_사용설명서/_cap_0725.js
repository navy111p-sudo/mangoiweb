// 2026-07-25 신규 기능 캡처 → assets/opt/*.jpg (1280x800, jpeg q78)
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

// 월간 리포트 데모 데이터 주입
const REPORT_STUB = () => {
  const J = (o) => Promise.resolve(new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  const orig = window.fetch.bind(window);
  window.fetch = function (u, o) {
    const url = String((u && u.url) || u || '');
    if (url.indexOf('/api/report/monthly') >= 0) {
      return J({
        ok: true, year_month: '2026-07',
        student: { student_name: '이민준', user_id: 'minjun', parent_name: '이수진' },
        attendance: { days: 8 },
        radar: { pronunciation: 78, vocab: 72, sentence: 65, attitude: 88, participation: 81 },
        growth_highlight: { text_ko: '지난달보다 문장 구성력이 크게 늘었어요', text_en: 'Big jump in sentence building this month' },
        evaluations: { count: 8, avg_score: 4.3, items: [
          { score_overall: 3.8, next_goals: '긴 문장을 끊지 않고 말하기' },
          { score_overall: 4.1, next_goals: '과거형 동사 정확히 쓰기' },
          { score_overall: 4.3, next_goals: '질문에 한 문장 더 붙여 답하기' }
        ]},
        voice: { sessions: 12, avg_accuracy: 82, avg_pronunciation: 78, avg_fluency: 74, best: 91 },
        judgment: { index: 72, events: 24, axis: { choice: 78, reasoning: 64, register: 70 }, top_gaps: ['정중한 요청', '이유 설명'] },
        ai_text: '민준이는 이번 달 꾸준히 출석하며 발음이 눈에 띄게 좋아졌어요. 특히 수업 태도가 훌륭합니다. 조금만 더 긴 문장에 도전하면 실력이 쑥 자랄 거예요!',
        ai_draft_tip_ko: '집에서 하루 5분, 오늘 배운 문장을 소리 내어 세 번 읽게 해 주세요. 발음과 자신감이 함께 자랍니다.'
      });
    }
    return orig(u, o);
  };
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
  const shot = async (pg, key) => { await pg.screenshot({ path: path.join(OPT, key + '.jpg'), type: 'jpeg', quality: 78 }); console.log('  saved', key + '.jpg'); };

  // ── 월간 리포트 오각형 ──
  try {
    const pg = await b.newPage(); await pg.setViewport(VP);
    await pg.evaluateOnNewDocument(REPORT_STUB);
    await pg.goto(BASE + '/monthly-report.html?uid=minjun&period=2026-07', { waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {});
    await sleep(2500);
    await pg.evaluate(() => window.scrollTo(0, 0));
    await sleep(500);
    await shot(pg, 'student_report_pentagon'); await pg.close();
  } catch (e) { console.log('report FAIL', e.message); }

  // ── 구조 항해 게임 (시작 화면) ──
  try {
    const pg = await b.newPage(); await pg.setViewport(VP);
    await pg.evaluateOnNewDocument(STUDENT_LS);
    await pg.goto(BASE + '/student-game-rescue-voyage.html', { waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {});
    await sleep(3000);
    await shot(pg, 'student_rescue'); await pg.close();
  } catch (e) { console.log('rescue FAIL', e.message); }

  // ── 강사 통합 관리 (개편된 명부: 필터바 + 그룹 사이드바 + 표) ──
  async function adminCard(card, key, extra) {
    try {
      const pg = await b.newPage(); await pg.setViewport(VP);
      await pg.evaluateOnNewDocument(ADMIN_LS);
      await pg.goto(BASE + '/admin.html', { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
      await sleep(4500);
      await pg.evaluate(ADM_CLEAN);
      await pg.evaluate((c) => { window.jumpToMenu && window.jumpToMenu(c); }, card);
      await sleep(2800);
      await pg.evaluate((c) => {
        var el = document.getElementById(c);
        if (el) { if (el.tagName === 'DETAILS') el.open = true; el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -70); }
      }, card);
      await sleep(1200);
      if (extra) { await pg.evaluate(extra); await sleep(1500); }
      await pg.evaluate(ADM_CLEAN);
      await sleep(400);
      await shot(pg, key); await pg.close();
    } catch (e) { console.log(key, 'FAIL', e.message); }
  }

  await adminCard('card-teacher-mgmt', 'admin_teachers');

  await b.close(); console.log('DONE');
})();
