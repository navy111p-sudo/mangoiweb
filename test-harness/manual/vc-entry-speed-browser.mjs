/**
 * ⚡ 수업 입장 «낭비» 측정 — 진짜 브라우저로 (2026-08-22)
 * ---------------------------------------------------------------------------
 * 왜 손으로 만들었나
 *   정적 하니스(문자열 검사)는 «카메라를 몇 번 여는가» 를 볼 수 없다. 이 파일이 고친 것이
 *   정확히 그것이라, 실제로 입장 버튼을 눌러 장치 열림 횟수·HTTP 왕복 횟수를 «센다».
 *
 * ⚠️ file:// 로 열면 안 된다 — index.html 의 <script src="/js/…"> 가 파일시스템 루트를
 *    가리켜 전부 404 이고, vcJoinRoom 이 undefined 가 된다(CLAUDE.md 2장 함정).
 *    그래서 public/ 을 HTTP 로 띄워 놓고 확인한다.
 *
 * ⏳ manual/ 규약상 자동으로 안 돈다. 입장 경로(vcJoinRoom·vcEnsureMediaPermission·
 *    acquireLocalMedia·vcEnsureIceServers)를 건드리면 사람이 불러야 한다:
 *      CHROME_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
 *      node test-harness/manual/vc-entry-speed-browser.mjs
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import puppeteer from 'puppeteer-core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8931;

let pass = 0, fail = 0;
const ok = (label, cond, detail) => {
  if (cond) { pass++; console.log('  ✅ ' + label); }
  else { fail++; console.log('  ❌ ' + label + (detail ? ' — ' + detail : '')); }
};

const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'],
                  { cwd: PUB, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required',
         '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  /* ⚠️ alert/confirm 을 받아 주지 않으면 페이지가 «거기서 멈춘다» — 아무 일도 안 일어난
     것처럼 보여 엉뚱한 곳을 뒤지게 된다. 무엇이 떴는지 남기고 닫는다. */
  const dialogs = [];
  page.on('dialog', async d => { dialogs.push(d.message().slice(0, 120)); try { await d.dismiss(); } catch (_) {} });
  const perrs = [];
  page.on('pageerror', e => perrs.push(String(e).slice(0, 200)));
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#vc-name-input', { timeout: 30000 });
  await new Promise(r => setTimeout(r, 2500));   // 초기화 스크립트 안정화

  // ── 계측기 설치: 장치 열림·TURN 왕복·소켓을 «관찰만» 한다 ──
  await page.evaluate(() => {
    window.__gum = [];       // getUserMedia 호출마다 제약을 기록
    window.__turn = 0;       // /api/turn-config 왕복 횟수
    window.__ws = [];
    window.__stopped = 0;    // 트랙 stop() 횟수

    const realGum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (c) => {
      window.__gum.push(JSON.parse(JSON.stringify(c || {})));
      const s = await realGum(c);
      s.getTracks().forEach(t => {
        const rs = t.stop.bind(t);
        t.stop = function () { window.__stopped++; return rs(); };
      });
      return s;
    };

    const RealWS = window.WebSocket;
    window.WebSocket = function (url) {
      window.__ws.push(String(url));
      return { url: String(url), readyState: 0, send() {}, close() {},
               addEventListener() {}, removeEventListener() {} };
    };
    window.WebSocket.OPEN = RealWS.OPEN;

    const realFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const u = String((input && input.url) || input || '');
      if (u.includes('/api/turn-config')) {
        window.__turn++;
        return new Response(JSON.stringify({ iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'turn:fake.turn:3478', username: 'u', credential: 'c' }
        ] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (u.includes('/api/class/sessions/today')) {
        return new Response(JSON.stringify(window.__sessions), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      /* 🔴 함정 — mango-consent.js 가 vcJoinRoom 을 «감싸고» 있다. 동의 기록이 없으면
         입장 전에 모달을 띄우고 사람이 누를 때까지 기다린다. 그 상태로 계측하면
         getUserMedia 0회·TURN 0회가 나와 «입장이 통째로 깨졌다» 로 오독하게 된다
         (실제로 여기서 한참 헤맸다 — 화면도 조용하고 에러도 안 난다).
         → 이미 동의한 계정으로 응답해 그 모달을 건너뛴다. */
      if (u.includes('/api/consents/')) {
        return new Response(JSON.stringify({
          user_id: 'stu_test', consent_version: 'v1.0-2026-08',
          recording_consent: 1, recording: 1, attendance: 1
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (u.includes('/api/')) {
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return realFetch(input, init);
    };
  });

  // ── 오늘 입장 가능한 예약 하나를 만들어 둔다(정상 입장 경로) ──
  const roomId = await page.evaluate(() => {
    const now = Date.now();
    const k = new Date(now + 9 * 3600 * 1000), p = n => (n < 10 ? '0' : '') + n;
    const ymd = '' + k.getUTCFullYear() + p(k.getUTCMonth() + 1) + p(k.getUTCDate());
    const rid = 'class-9001-' + ymd;
    window.__sessions = { sessions: [{
      schedule_id: 9001, room_id: rid, student_uid: 'stu_test', student_name: '테스트학생',
      teacher_id: '1', teacher_name: '테스트강사',
      start_ts: now, end_ts: now + 1800000, open_at_ts: now - 600000, close_at_ts: now + 2700000,
      duration_min: 30, status: 'live', join_open: true, starts_in_ms: 0,
    }], student_gate: 'off' };
    window.getCurrentUser = () => ({ uid: 'stu_test', name: '테스트학생', role: 'student' });
    window.vcMyRole = 'student';
    document.getElementById('vc-name-input').value = '테스트학생';
    document.getElementById('vc-roomcode-input').value = '';
    const g = document.getElementById('vc-class-gate'); if (g) g.remove();
    // 계측은 «입장 버튼을 누른 뒤» 부터 — 페이지 로드 때의 호출은 세지 않는다
    window.__gum = []; window.__turn = 0; window.__ws = []; window.__stopped = 0;
    return rid;
  });

  // ★ 진짜 입장 버튼을 누른다
  const clicked = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button'))
      .find(x => (x.getAttribute('onclick') || '').includes('vcJoinRoom'));
    if (!b) return false; b.click(); return true;
  });
  await new Promise(r => setTimeout(r, 4000));

  const r = await page.evaluate(() => ({
    gum: window.__gum, turn: window.__turn, ws: window.__ws, stopped: window.__stopped,
    inCall: document.body.classList.contains('vc-in-call'),
    roomId: String((typeof vcRoomId !== 'undefined' ? vcRoomId : '') || ''),
    liveTracks: (function () {
      try { return (vcLocalStream ? vcLocalStream.getTracks() : []).filter(t => t.readyState === 'live').length; }
      catch (e) { return -1; }
    })(),
    permLeak: !!window.__vcPermStream,
  }));

  console.log('\n📋 실측: getUserMedia ' + r.gum.length + '회, TURN 왕복 ' + r.turn +
              '회, stop() ' + r.stopped + '회, 살아있는 트랙 ' + r.liveTracks);
  console.log('   제약: ' + JSON.stringify(r.gum));

  console.log('\n── 입장이 정상인가(회귀 확인) ──');
  ok('입장 버튼이 눌린다', clicked);
  ok('예약방으로 들어간다', r.roomId === roomId, 'roomId=' + r.roomId);
  ok('수업 화면으로 전환된다', r.inCall);
  ok('그 방으로 접속을 시도한다', r.ws.some(u => u.includes(encodeURIComponent(roomId))), JSON.stringify(r.ws));
  ok('로컬 스트림에 살아있는 트랙이 있다', r.liveTracks > 0, '트랙 ' + r.liveTracks + '개');

  console.log('\n── 낭비가 사라졌는가(이번 수정의 핵심) ──');
  // 카메라를 요구한 gUM 만 센다(오디오 전용 폴백은 장치 열림 비용이 다르다)
  const camOpens = r.gum.filter(c => c && c.video && c.video !== false).length;
  ok('카메라를 «한 번만» 연다 (예전 2회)', camOpens === 1, '카메라 요구 gUM ' + camOpens + '회');
  ok('입장 중 TURN 왕복이 1회 이하 (예전 2회)', r.turn <= 1, 'TURN ' + r.turn + '회');
  ok('열자마자 버리는 트랙이 없다', r.stopped === 0, 'stop() ' + r.stopped + '회');
  ok('첫 카메라부터 해상도 상한이 걸려 있다(bare video:true 금지)',
     camOpens === 1 && r.gum.some(c => c && c.video && c.video.width),
     JSON.stringify(r.gum.map(c => c && c.video)));
  ok('권한용 스트림이 새지 않는다(소비 완료)', !r.permLeak);

  ok('입장 중 스크립트 오류 없음', perrs.length === 0, perrs.join(' | '));
  if (dialogs.length) console.log('   (뜬 안내창: ' + JSON.stringify(dialogs) + ')');

  console.log('\n결과: ' + pass + ' 통과, ' + fail + ' 실패');
} finally {
  await browser.close();
  srv.kill();
}
process.exit(fail ? 1 : 0);
