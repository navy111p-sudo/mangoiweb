/**
 * 📶 고착 피어 → TURN 릴레이 승격 확인 — 진짜 브라우저로 (2026-08-22)
 * ---------------------------------------------------------------------------
 * 무엇을 보나
 *   `vcStuckPeerWatch` 가 «상대 영상이 안 온다» 고 판단해 재시도할 때,
 *   **두 번째 시도부터 그 피어에 TURN 릴레이를 강제하는가**(`__vcForceRelay[id]`).
 *
 * 왜 손으로 만들었나
 *   이건 «어떤 값이 언제 켜지는가» 라 문자열 검사로는 보이지 않는다. 실제로 고착 타일을
 *   만들어 놓고 워치독이 도는 것을 기다려야 한다.
 *
 * ⏳ 느리다(약 40초) — 워치독이 STUCK_MS=9초 + 재판정 유예 5초로 «진짜 시간» 을 쓰기 때문이다.
 *    그 숫자를 줄여서 빨리 끝내면 그건 다른 코드를 시험하는 것이라 의미가 없다.
 *
 * ⚠️ file:// 로 열면 안 된다(CLAUDE.md 2장) · 동의 모달을 스텁해야 한다(같은 장 함정).
 *
 *   PW_DIR=/tmp/pw node test-harness/manual/vc-stuck-relay-browser.mjs
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { requireBrowser } from './_pw.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = 8941;

let pass = 0, fail = 0;
const ok = (label, cond, detail) => {
  if (cond) { pass++; console.log('  ✅ ' + label); }
  else { fail++; console.log('  ❌ ' + label + (detail ? ' — ' + detail : '')); }
};

const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'],
                  { cwd: PUB, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));

const { chromium, exe } = requireBrowser();
const browser = await chromium.launch({
  executablePath: exe,
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required',
         '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});

try {
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  const perrs = [];
  page.on('pageerror', e => perrs.push(String(e).slice(0, 200)));
  page.on('dialog', async d => { try { await d.dismiss(); } catch (_) {} });
  const stuckLogs = [];
  page.on('console', m => { const t = m.text(); if (t.includes('[vc-stuck]')) stuckLogs.push(t.slice(0, 160)); });

  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  /* ⚠️ playwright 의 waitForSelector 는 기본이 «보일 때까지» 다. 로비 입력칸은 아직 숨은
     뷰 안에 있어서 그대로 두면 30초 뒤 타임아웃이 난다 — «붙어 있으면» 으로 기다린다. */
  await page.waitForSelector('#vc-name-input', { state: 'attached', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2500));

  await page.evaluate(() => {
    const RealWS = window.WebSocket;
    window.WebSocket = function (url) {
      return { url: String(url), readyState: 1, send() {}, close() {},
               addEventListener() {}, removeEventListener() {} };
    };
    window.WebSocket.OPEN = RealWS.OPEN;
    const realFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const u = String((input && input.url) || input || '');
      // TURN 이 «있는» 상태로 만든다 — 릴레이 승격은 TURN 이 확보됐을 때만 해야 한다
      if (u.includes('/api/turn-config')) {
        return new Response(JSON.stringify({ iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'turn:fake.turn:3478', username: 'u', credential: 'c' }
        ] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (u.includes('/api/consents/')) {   // 동의 모달이 입장을 막지 않게(2장 함정)
        return new Response(JSON.stringify({ user_id: 'stu_test', recording_consent: 1 }),
                            { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (u.includes('/api/class/sessions/today')) {
        return new Response(JSON.stringify(window.__sessions), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (u.includes('/api/')) return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      return realFetch(input, init);
    };
    const now = Date.now(), k = new Date(now + 9 * 3600 * 1000), p = n => (n < 10 ? '0' : '') + n;
    const ymd = '' + k.getUTCFullYear() + p(k.getUTCMonth() + 1) + p(k.getUTCDate());
    window.__sessions = { sessions: [{
      schedule_id: 9001, room_id: 'class-9001-' + ymd, student_uid: 'stu_test', student_name: '테스트학생',
      teacher_id: '1', teacher_name: '테스트강사', start_ts: now, end_ts: now + 1800000,
      open_at_ts: now - 600000, close_at_ts: now + 2700000, duration_min: 30,
      status: 'live', join_open: true, starts_in_ms: 0 }], student_gate: 'off' };
    window.getCurrentUser = () => ({ uid: 'stu_test', name: '테스트학생', role: 'student' });
    window.vcMyRole = 'student';
    document.getElementById('vc-name-input').value = '테스트학생';
    document.getElementById('vc-roomcode-input').value = '';
    const g = document.getElementById('vc-class-gate'); if (g) g.remove();
  });

  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button'))
      .find(x => (x.getAttribute('onclick') || '').includes('vcJoinRoom'));
    if (b) b.click();
  });
  await new Promise(r => setTimeout(r, 4000));

  const inCall = await page.evaluate(() => document.body.classList.contains('vc-in-call'));
  ok('수업 화면에 들어가 있다(전제)', inCall);

  /* ── 「상대 영상이 안 오는」 타일을 만든다 ──
     워치독의 판정 기준 그대로: .vc-connecting-hint 가 있고, 그 피어의 수신 트랙이 없다. */
  await page.evaluate(() => {
    window.__vcForceRelay = {};
    const grid = document.getElementById('vc-video-grid');
    const box = document.createElement('div');
    box.className = 'video-box'; box.id = 'vc-video-peerX';
    box.innerHTML = '<div class="video-label">테스트강사</div><div class="vc-connecting-hint">📷 연결 중…</div>';
    grid.appendChild(box);
    // 수신 트랙이 하나도 없는 «가짜 피어» — 워치독이 고착으로 판단해야 한다
    vcPeerConnections['peerX'] = { getReceivers: () => [], close() {}, __username: '테스트강사' };
    // 실제 재offer 로 새어 나가지 않게 — 이 시험이 보는 것은 «릴레이 플래그» 뿐이다
    window.vcCreatePeerAndOffer = function () {};
  });

  console.log('\n  ⏳ 워치독을 기다립니다 (9초 고착 판정 + 14초 뒤 2차 시도 — 약 30초)…');
  const snaps = [];
  for (let i = 0; i < 12; i++) {
    await new Promise(r => setTimeout(r, 3000));
    snaps.push(await page.evaluate(() => ({
      t: Date.now(), relay: !!(window.__vcForceRelay && window.__vcForceRelay.peerX),
    })));
    if (snaps.filter(s => s.relay).length) { /* 켜졌으면 조금 더 보고 끝낸다 */ }
  }

  const relayOn = snaps.some(s => s.relay);
  const firstRelayIdx = snaps.findIndex(s => s.relay);
  const tries = stuckLogs.filter(t => t.includes('복구 시도')).length;

  console.log('\n📋 [vc-stuck] 로그 ' + tries + '건');
  stuckLogs.slice(0, 6).forEach(t => console.log('   · ' + t));

  console.log('\n── 판정 ──');
  ok('워치독이 고착을 «알아채고» 재시도했다', tries >= 1, '재시도 로그 ' + tries + '건');
  ok('1차 시도는 직접 연결 그대로다 (릴레이 아님)',
     !(snaps[0] && snaps[0].relay) && !(snaps[1] && snaps[1].relay),
     '초기 스냅샷에서 이미 relay=true');
  ok('2차 시도부터 TURN 릴레이가 강제된다', relayOn,
     '__vcForceRelay.peerX 가 끝까지 안 켜짐 (스냅샷 ' + snaps.length + '개)');
  ok('릴레이 승격이 2차 시도 시점이다(너무 이르지 않다)',
     relayOn && firstRelayIdx >= 2, 'firstRelayIdx=' + firstRelayIdx);
  ok('스크립트 오류 없음', perrs.length === 0, perrs.join(' | '));

  console.log('\n결과: ' + pass + ' 통과, ' + fail + ' 실패');
} finally {
  await browser.close();
  srv.kill();
}
process.exit(fail ? 1 : 0);
