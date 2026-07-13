/**
 * 🛠 2026-07-13 3종 수정 검증
 *  A) 로비 환영음성 — 수업 중(vc-in-call) 재생 금지 + 폴백 클릭 리스너가 수업 중 발화 안 함
 *  B) 교재/동영상 폴링 — /api/room-media/{room} 으로 호출 (room-status 401 우회)
 *  C) 포인트 축하 연출 — 내 박스 숨김(세로폰)에서도 화면 전체 오버레이로 표시
 * 실행: (public 을 :8791 서빙 후) node test-harness/vc_fixes_260713_harness.mjs
 */
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE_URL || 'http://localhost:8791';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
page.on('pageerror', e => console.log('  [pageerror]', String(e).slice(0, 160)));
await page.setViewport({ width: 440, height: 900, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 1500));

let fail = 0;
const chk = (name, ok, extra) => { if (ok) console.log('✅ ' + name); else { fail++; console.log('❌ ' + name + (extra ? ' — ' + extra : '')); } };

/* ── A) 로비 환영음성 가드 ── */
const a = await page.evaluate(() => {
  const out = {};
  const audio = document.getElementById('lobby-welcome-audio');
  out.hasFns = typeof lobbyPlayWelcome === 'function' && typeof lobbyWelcomeAllowed === 'function' && typeof lobbyClearPendingUnlock === 'function';

  // A-1: 수업 중에는 allowed=false → play 되지 않음
  document.body.classList.add('vc-in-call');
  out.allowedInCall = lobbyWelcomeAllowed();
  let played = false;
  const origPlay = audio.play.bind(audio);
  audio.play = function(){ played = true; return Promise.resolve(); };
  try { localStorage.removeItem('mangoi_lobby_audio_muted'); } catch(e){}
  lobbyPlayWelcome();
  out.playedInCall = played;

  // A-2: 폴백 리스너 등록 상태를 흉내 — 수업 중 클릭 시 재생 안 됨 + 리스너 자체 해제
  played = false;
  window._lobbyWelcomePendingUnlock = null;
  // 로비로 위장해 폴백 등록 (play 가 reject 되도록 스텁)
  document.body.classList.remove('vc-in-call');
  document.querySelectorAll('.view.active').forEach(v => v.classList.remove('active'));
  document.getElementById('view-videocall-lobby').classList.add('active');
  audio.play = function(){ return Promise.reject(new Error('NotAllowedError')); };
  lobbyPlayWelcome();
  out.pendingAfterBlockedTry = 'wait';   // 마이크로태스크 이후 확인 필요
  return out;
});
await new Promise(r => setTimeout(r, 300));
const a2 = await page.evaluate(() => {
  const out = {};
  out.pendingRegistered = typeof window._lobbyWelcomePendingUnlock === 'function';
  // 수업 입장 상황으로 전환 후 클릭 발생
  const audio = document.getElementById('lobby-welcome-audio');
  let played = false;
  audio.play = function(){ played = true; return Promise.resolve(); };
  document.getElementById('view-videocall-lobby').classList.remove('active');
  document.body.classList.add('vc-in-call');
  document.body.click();
  out.playedOnClickInCall = played;
  out.pendingCleared = window._lobbyWelcomePendingUnlock === null;
  // lobbyStopWelcome 이 대기 리스너를 지우는지
  window._lobbyWelcomePendingUnlock = function(){};
  lobbyStopWelcome();
  out.stopClearsPending = window._lobbyWelcomePendingUnlock === null;
  return out;
});
chk('A-0 함수 존재(lobbyWelcomeAllowed 등)', a.hasFns);
chk('A-1 수업 중 allowed=false', a.allowedInCall === false, String(a.allowedInCall));
chk('A-1 수업 중 lobbyPlayWelcome → 재생 안 함', a.playedInCall === false, String(a.playedInCall));
chk('A-2 로비에서 자동재생 차단 → 폴백 리스너 등록', a2.pendingRegistered, String(a2.pendingRegistered));
chk('A-2 수업 입장 후 첫 클릭 → 환영음성 재생 안 함', a2.playedOnClickInCall === false, String(a2.playedOnClickInCall));
chk('A-2 클릭 후 리스너 해제(반복 방지)', a2.pendingCleared, String(a2.pendingCleared));
chk('A-3 lobbyStopWelcome 이 대기 리스너 취소', a2.stopClearsPending, String(a2.stopClearsPending));

/* ── B) 폴링이 /api/room-media 사용 ── */
const b = await page.evaluate(async () => {
  const urls = [];
  const origFetch = window.fetch;
  window.fetch = function(u, o){ urls.push(String(u)); return Promise.resolve({ ok: false, json: () => Promise.resolve(null) }); };
  try {
    vcRoomId = 'harness-room';
    vcStartPdfPoll();
    await new Promise(r => setTimeout(r, 1200));
    vcStopPdfPoll();
  } finally { window.fetch = origFetch; }
  return urls;
});
chk('B-1 폴링 URL = /api/room-media/', b.some(u => u.includes('/api/room-media/harness-room')), JSON.stringify(b));
chk('B-2 room-status 는 더 이상 폴링 안 함', !b.some(u => u.includes('/api/room-status/')), JSON.stringify(b));

/* ── C) 내 박스 숨김 상태에서 포인트 축하 연출 ── */
const c = await page.evaluate(async () => {
  try { localStorage.setItem('mangoi_user_role', 'student'); } catch(e){}
  document.querySelectorAll('.view.active').forEach(v => v.classList.remove('active'));
  document.getElementById('view-videocall-call').classList.add('active');
  document.body.classList.add('vc-in-call');
  const row = document.querySelector('.vc-main-row'); if (row) row.classList.add('video-pip');
  // 원격 박스 추가해 data-count=2 → 세로폰 규칙으로 내 박스 숨김
  const grid = document.getElementById('vc-video-grid');
  if (grid && !document.getElementById('vc-video-peer1')) {
    const peer = document.createElement('div');
    peer.className = 'video-box'; peer.id = 'vc-video-peer1';
    grid.appendChild(peer);
    grid.setAttribute('data-count', '2');
  }
  const out = {};
  out.localHidden = (function(){ const el = document.getElementById('vc-local-box'); return !el || el.offsetWidth === 0; })();
  // 로그인 없음 → 로컬 연출만 (서버 호출 없음)
  vcCelebratePoint('hx_' + Date.now(), '선생님');
  await new Promise(r => setTimeout(r, 250));
  out.overlay = !!document.querySelector('body > div[style*="z-index:100003"], body > div[style*="z-index: 100003"]');
  out.confetti = document.querySelectorAll('.vc-confetti-piece').length;
  out.sparkles = document.querySelectorAll('.vc-sparkle').length;
  await new Promise(r => setTimeout(r, 1600));
  out.overlayCleaned = !document.querySelector('body > div[style*="100003"]');
  return out;
});
chk('C-0 내 박스 숨김 상태 재현', c.localHidden, String(c.localHidden));
chk('C-1 화면 전체 오버레이 생성', c.overlay, JSON.stringify(c));
chk('C-2 색종이 연출 표시', c.confetti > 0, String(c.confetti));
chk('C-3 별가루 연출 표시', c.sparkles > 0, String(c.sparkles));
chk('C-4 오버레이 1.5초 후 정리', c.overlayCleaned, String(c.overlayCleaned));

console.log(fail === 0 ? '\n🎉 ALL PASS' : '\n💥 ' + fail + ' FAIL');
await browser.close();
process.exit(fail === 0 ? 0 : 1);
