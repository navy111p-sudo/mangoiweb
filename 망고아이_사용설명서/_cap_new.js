// 신규 기능 캡처 → assets/opt/*.jpg (1280x800, jpeg q78)
const puppeteer = require('puppeteer-core');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://127.0.0.1:8199';
const OPT = path.join(__dirname, 'assets', 'opt');
const RAW = path.join(__dirname, 'assets');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const STUDENT_LS = () => {
  localStorage.setItem('mango_user', JSON.stringify({ uid: 'demo-student', name: '민준', id: 'student' }));
  localStorage.setItem('mangoi_logged_user', JSON.stringify({ uid: 'demo-student', name: '민준', id: 'student' }));
};
const ADMIN_LS = () => {
  localStorage.setItem('mangoi_admin_session', JSON.stringify({
    role: 'admin', name: '관리자', agency_id: 'gn001', branch: '강남점', ok: true, ts: Date.now()
  }));
};

async function shot(pg, key) {
  await pg.screenshot({ path: path.join(OPT, key + '.jpg'), type: 'jpeg', quality: 78 });
  console.log('  saved', key + '.jpg');
}

(async () => {
  const b = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--force-device-scale-factor=1', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']
  });
  const VP = { width: 1280, height: 800, deviceScaleFactor: 1 };

  // ── 1. 학생: AI 음성일기 모달 ──
  try {
    const pg = await b.newPage(); await pg.setViewport(VP);
    await pg.evaluateOnNewDocument(STUDENT_LS);
    await pg.goto(BASE + '/index.html', { waitUntil: 'networkidle2', timeout: 45000 }).catch(()=>{});
    await sleep(1500);
    await pg.evaluate(() => { document.querySelectorAll('.intro-overlay,#intro-overlay,.splash,#splash').forEach(e => e.remove()); });
    await pg.evaluate(() => { window.openVoiceDiaryModal && window.openVoiceDiaryModal(); });
    await sleep(1200);
    await shot(pg, 'student_voicediary'); await pg.close();
  } catch (e) { console.log('voicediary FAIL', e.message); }

  // ── 2. 학생: 학습 흐름 커넥터 (MangoFlow 메뉴) ──
  try {
    const pg = await b.newPage(); await pg.setViewport(VP);
    await pg.evaluateOnNewDocument(STUDENT_LS);
    await pg.goto(BASE + '/student-games.html', { waitUntil: 'networkidle2', timeout: 45000 }).catch(()=>{});
    await sleep(1500);
    await pg.evaluate(() => { window.MangoFlow && window.MangoFlow.open && window.MangoFlow.open('game'); });
    await sleep(1000);
    await shot(pg, 'student_flow'); await pg.close();
  } catch (e) { console.log('flow FAIL', e.message); }

  // ── 3. 학생: AI 상담사 아바타 (라이브 워커) ──
  try {
    const pg = await b.newPage(); await pg.setViewport(VP);
    await pg.goto('https://mangoi-ai-avatar-cf.navy111p.workers.dev/student.html', { waitUntil: 'networkidle2', timeout: 45000 });
    await sleep(2500);
    await shot(pg, 'student_aiavatar'); await pg.close();
  } catch (e) { console.log('aiavatar FAIL', e.message); }

  // ── 4. 교사: 수업종료 AI 코칭 카드 (demo) ──
  try {
    const pg = await b.newPage(); await pg.setViewport(VP);
    await pg.evaluateOnNewDocument(STUDENT_LS);
    await pg.goto(BASE + '/index.html', { waitUntil: 'networkidle2', timeout: 45000 }).catch(()=>{});
    await sleep(1500);
    await pg.evaluate(() => { document.querySelectorAll('.intro-overlay,#intro-overlay,.splash,#splash').forEach(e => e.remove()); });
    const ok = await pg.evaluate(() => { if (window.MangoTeacherFeedback && window.MangoTeacherFeedback.demo) { window.MangoTeacherFeedback.demo('ko'); return true; } return false; });
    console.log('  teacher demo present:', ok);
    await sleep(1200);
    await shot(pg, 'teacher_aicoach'); await pg.close();
  } catch (e) { console.log('teachercoach FAIL', e.message); }

  // ── 5~7. 관리자 (공지 스튜디오 / 음성일기 모니터 / AI 운영비서) ──
  async function adminShot(card, key, extra) {
    try {
      const pg = await b.newPage(); await pg.setViewport(VP);
      await pg.evaluateOnNewDocument(ADMIN_LS);
      await pg.goto(BASE + '/admin.html', { waitUntil: 'networkidle2', timeout: 60000 }).catch(()=>{});
      await sleep(2500);
      if (card) {
        await pg.evaluate((c) => { window.jumpToMenu && window.jumpToMenu(c); }, card);
        await sleep(1500);
      }
      if (extra) { await pg.evaluate(extra); await sleep(1000); }
      await shot(pg, key); await pg.close();
    } catch (e) { console.log(key, 'FAIL', e.message); }
  }
  await adminShot('card-poster-maker', 'admin_noticestudio', () => { window.noticeStudioTab && window.noticeStudioTab('make'); });
  await adminShot('card-voice-diary', 'admin_voicediary', null);
  // AI 운영비서: hero의 ai-panel에 데모 이동응답 주입
  await adminShot(null, 'admin_aicommand', () => {
    var p = document.getElementById('ai-panel'); var c = document.getElementById('ai-content');
    if (p && c) {
      p.style.display = 'block';
      c.innerHTML = '<div style="padding:6px 2px;font-size:15px;line-height:1.6;color:#e5e7eb">'
        + '<div style="font-weight:800;margin-bottom:8px">🧭 강사 스케줄 화면으로 이동할게요</div>'
        + '<div style="opacity:.85;margin-bottom:12px">"김민지 강사 스케줄로 가게 해줘" — 요청을 이해했어요. 주간 스케줄에서 <b>김민지</b> 강사를 자동으로 찾아 보여드립니다.</div>'
        + '<button style="background:linear-gradient(135deg,#6366f1,#0ea5e9);color:#fff;border:0;border-radius:10px;padding:10px 18px;font-weight:700;font-size:14px;cursor:pointer">지금 이동 →</button>'
        + '</div>';
      var b = document.getElementById('ai-greeting-bubble'); if (b) b.style.display = 'inline-block';
      var i = document.getElementById('menu-search'); if (i) i.value = '김민지 강사 스케줄로 가게 해줘';
      p.scrollIntoView({ block: 'center' });
    }
  });

  await b.close(); console.log('DONE');
})();
