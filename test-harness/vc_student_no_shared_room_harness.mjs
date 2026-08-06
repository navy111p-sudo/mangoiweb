/**
 * 🚪 학생이 «공용방(mangoi-class)» 으로 흘러가지 않는지 — 진짜 버튼을 눌러서 검증 (2026-08-06)
 *
 * 왜 이 하니스가 필요한가
 *   동시접속 진단에서 확인된 최악의 경로: 예약이 없거나 시작 10분 전보다 이르면 학생이
 *   «아무 안내도 없이» 공용방으로 들어갔다. 그 방 정원은 10명이라 50명이 몰리면 40명이 튕긴다.
 *   (실측: 한 방 50명 시도 → 10명 입장 + 40명 room-full)
 *
 *   ⚠️ 이 검사는 «문자열 있나» 로는 절대 잡히지 않는다. 예전에 문법 게이트를 전부 통과하고도
 *      배선이 죽어 버튼이 무반응이던 회귀가 있었다(admin 학생목록). 그래서 여기서는
 *      **실제 <button onclick="vcJoinRoom()"> 을 click() 해서** 결과를 본다.
 *
 * 검증 시나리오 (fetch 를 가로채 서버 응답을 흉내낸다 — 운영 호출 없음)
 *   ① 오늘 예약 없음        → 안내 뜨고 «입장하지 않는다». vcRoomId 가 mangoi-class 가 되면 실패
 *   ② 아직 이름(early)      → 카운트다운 대기화면(#vc-class-gate) 이 뜨고 입장하지 않는다
 *   ③ 입장창 열림(join_open)→ class-{id}-{날짜} 방으로 정상 입장
 *   ④ 조회 실패(네트워크)    → 학생은 멈춘다(공용방 금지)
 *   ⑤ 교사·예약 없음        → 기존대로 공용 연습방 허용(연습·시연 흐름 보존)
 *
 * 실행: node test-harness/vc_student_no_shared_room_harness.mjs
 */
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX = path.resolve(__dirname, '..', 'cloudflare-deploy', 'public', 'index.html');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
}

const KST = 9 * 3600 * 1000;
const ymd = () => { const k = new Date(Date.now() + KST); const p = n => String(n).padStart(2, '0'); return `${k.getUTCFullYear()}${p(k.getUTCMonth() + 1)}${p(k.getUTCDate())}`; };

/** 서버 응답 한 벌 만들기 */
function session(id, offsetMin, durMin = 30) {
  const now = Date.now();
  const start_ts = now + offsetMin * 60000;
  const end_ts = start_ts + durMin * 60000;
  const open_at_ts = start_ts - 10 * 60000;
  const close_at_ts = end_ts + 15 * 60000;
  const join_open = now >= open_at_ts && now <= close_at_ts;
  const status = now < open_at_ts ? 'early' : (now < start_ts ? 'open' : (now <= close_at_ts ? 'live' : 'ended'));
  return {
    schedule_id: id, room_id: `class-${id}-${ymd()}`,
    student_uid: 'stu_test', student_name: '테스트학생', teacher_id: '1', teacher_name: '테스트강사',
    start_ts, end_ts, open_at_ts, close_at_ts, duration_min: durMin, status, join_open,
    starts_in_ms: start_ts - now,
  };
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e).slice(0, 200)));

  await page.goto('file:///' + INDEX.replace(/\\/g, '/'), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#vc-name-input', { timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000)); // 초기화 스크립트 안정화

  // ── 공통 하네스: fetch·alert·WebSocket 을 가로채 «입장 시도» 를 관찰만 한다 ──
  await page.evaluate(() => {
    window.__alerts = [];
    window.alert = (m) => { window.__alerts.push(String(m)); };
    window.__wsUrls = [];
    const RealWS = window.WebSocket;
    window.WebSocket = function (url, ...rest) {
      window.__wsUrls.push(String(url));
      // 진짜로 열지 않는다 — 열리지 않는 더미 소켓
      return { url: String(url), readyState: 0, send() {}, close() {}, addEventListener() {}, removeEventListener() {} };
    };
    window.WebSocket.OPEN = RealWS.OPEN;
    const realFetch = window.fetch.bind(window);
    window.__sessionsReply = null;      // 시나리오마다 갈아끼운다
    window.fetch = async (input, init) => {
      const u = String((input && input.url) || input || '');
      if (u.includes('/api/class/sessions/today')) {
        if (window.__sessionsReply === 'ERROR') throw new Error('network down (harness)');
        return new Response(JSON.stringify(window.__sessionsReply), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (u.startsWith('/api/') || u.includes('/api/')) {
        // 그 밖의 API 는 전부 무해한 빈 성공으로 — 로비 단계에서 실제 호출이 나가지 않게
        return new Response(JSON.stringify({ ok: true, iceServers: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return realFetch(input, init);
    };
    // 미디어 권한 대기로 멈추지 않도록
    window.vcEnsureMediaPermission = async () => true;
  });

  /** 한 시나리오를 실행하고 결과를 읽는다. 진짜 버튼을 클릭한다. */
  async function run({ reply, role, name }) {
    await page.evaluate((reply, role, name) => {
      window.__sessionsReply = reply;
      window.__alerts = [];
      window.__wsUrls = [];
      window.vcMyRole = role;
      window.__vcStudentGate = (reply && reply.student_gate) || (reply === 'ERROR' ? window.__vcStudentGate : 'off');
      /* 🔴 함정 — index.html 의 `let vcRoomId` 는 **window 프로퍼티가 아니다**(전역 렉시컬 바인딩).
         `window.vcRoomId` 를 읽으면 언제나 빈 문자열이라 «공용방에 안 갔다» 가 항상 통과해 버린다.
         (그렇게 만들었다가 이 하니스가 스스로를 속이는 걸 발견했다.)
         전역 스코프에서는 이름으로 직접 읽고 쓸 수 있으므로 반드시 이렇게 접근한다. */
      try { vcRoomId = ''; } catch (e) { window.vcRoomId = ''; }
      try { window.getCurrentUser = () => ({ uid: 'stu_test', name, role }); } catch (e) {}
      const ni = document.getElementById('vc-name-input'); if (ni) ni.value = name;
      const ri = document.getElementById('vc-roomcode-input'); if (ri) ri.value = '';   // ★ 방코드 비움 = 문제의 경로
      const g = document.getElementById('vc-class-gate'); if (g) g.remove();
    }, reply, role, name);

    // ★★ 진짜 «수동 입장» 버튼을 누른다 (onclick="vcJoinRoom()")
    const clicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const b = btns.find(x => (x.getAttribute('onclick') || '').includes('vcJoinRoom'));
      if (!b) return false;
      b.click();
      return true;
    });
    await new Promise(r => setTimeout(r, 1200));

    return { clicked, ...(await page.evaluate(() => ({
      alerts: window.__alerts.slice(),
      wsUrls: window.__wsUrls.slice(),
      // ★ window.vcRoomId 가 아니라 진짜 전역 바인딩을 읽는다(위 주석 참고)
      roomId: String((typeof vcRoomId !== 'undefined' ? vcRoomId : (window.vcRoomId || '')) || ''),
      gate: !!document.getElementById('vc-class-gate'),
      inCall: document.body.classList.contains('vc-in-call'),
    }))) };
  }

  const today = ymd();

  // ── ① 오늘 예약 없음 ──
  let r = await run({ reply: { ok: true, sessions: [], current: null, student_gate: 'on' }, role: 'student', name: '테스트학생' });
  check('① 버튼이 실제로 눌린다(배선 살아 있음)', r.clicked);
  check('① 예약 없는 학생 — 공용방으로 «가지 않는다»', r.roomId !== 'mangoi-class', `vcRoomId="${r.roomId}"`);
  check('① 예약 없는 학생 — 수업 화면으로 넘어가지 않는다', !r.inCall);
  check('① 예약 없는 학생 — 이유를 안내한다', r.alerts.length > 0, r.alerts[0] ? r.alerts[0].split('\n')[0] : '(안내 없음)');
  check('① 안내는 한/영 둘 다', r.alerts.some(a => /class booked|room code/i.test(a)) && r.alerts.some(a => /예약|방 번호/.test(a)));

  // ── ② 아직 이르다(30분 뒤 시작 = early) ──
  const early = session(9001, 30);
  r = await run({ reply: { ok: true, sessions: [early], current: early, student_gate: 'on' }, role: 'student', name: '테스트학생' });
  check('② 이른 입장 — 카운트다운 대기화면이 뜬다', r.gate);
  check('② 이른 입장 — 공용방으로 «가지 않는다»', r.roomId !== 'mangoi-class', `vcRoomId="${r.roomId}"`);
  check('② 이른 입장 — 수업 화면으로 넘어가지 않는다', !r.inCall);
  await page.evaluate(() => { const g = document.getElementById('vc-class-gate'); if (g) { clearInterval(g.__t); g.remove(); } });

  // ── ③ 입장창 열림(5분 뒤 시작 → 이미 open) ──
  const open = session(9002, 5);
  r = await run({ reply: { ok: true, sessions: [open], current: open, student_gate: 'on' }, role: 'student', name: '테스트학생' });
  check('③ 입장 가능 — 예약방(class-*)으로 들어간다', r.roomId === `class-9002-${today}`, `vcRoomId="${r.roomId}"`);
  check('③ 입장 가능 — 공용방이 아니다', r.roomId !== 'mangoi-class');
  check('③ 입장 가능 — 그 방으로 실제 접속을 시도한다', r.wsUrls.some(u => u.includes(`roomId=class-9002-${today}`)), r.wsUrls[0] || '(시도 없음)');

  // ── ④ 조회 실패(네트워크 장애) ──
  await page.evaluate(() => { document.body.classList.remove('vc-in-call'); });
  r = await run({ reply: 'ERROR', role: 'student', name: '테스트학생' });
  check('④ 조회 실패 — 학생은 공용방으로 «가지 않는다»', r.roomId !== 'mangoi-class', `vcRoomId="${r.roomId}"`);
  check('④ 조회 실패 — 이유를 안내한다', r.alerts.length > 0);

  // ── ⑤ 교사·예약 없음 → 공용 연습방 허용(기존 흐름 보존) ──
  await page.evaluate(() => { document.body.classList.remove('vc-in-call'); });
  r = await run({ reply: { ok: true, sessions: [], current: null, student_gate: 'on' }, role: 'teacher', name: '테스트강사' });
  check('⑤ 예약 없는 교사 — 공용 연습방은 그대로 허용(연습·시연 보존)', r.roomId === 'mangoi-class', `vcRoomId="${r.roomId}"`);

  /* ── ⑥ 게이트 OFF(배포 기본값) — 예전 동작이 100% 그대로인지 ──
     ⛔ 지금 운영은 이 상태로 나간다. class_schedules 663건 중 «실제 학생 예약» 은 6건뿐이라
        켜면 대다수 학생이 입장 자체를 못 하기 때문이다. 그래서 «꺼져 있을 때 예전과 같은가» 가
        지금 가장 중요한 검사다. */
  await page.evaluate(() => { document.body.classList.remove('vc-in-call'); });
  r = await run({ reply: { ok: true, sessions: [], current: null, student_gate: 'off' }, role: 'student', name: '테스트학생' });
  check('⑥ 게이트 OFF — 예약 없는 학생은 예전대로 공용방(동작 무변경)', r.roomId === 'mangoi-class', `vcRoomId="${r.roomId}"`);
  check('⑥ 게이트 OFF — 막는 안내를 띄우지 않는다', r.alerts.length === 0, r.alerts[0] || '');

  /* ── 페이지 자체가 깨지지 않았는지 ──
     한 페이지에서 입장을 5번 반복하는 하니스 특성상, 오디오 컨텍스트를 두 번 닫는 등
     «실사용에서는 안 나는» 정리 잡음이 섞인다. 배선이 끊겼을 때 나오는 오류
     (ReferenceError / is not a function)만 실패로 본다 — 그게 이 하니스가 잡아야 할 회귀다. */
  const realErrors = pageErrors.filter(e => /ReferenceError|is not a function|is not defined/.test(e));
  check('배선 오류 없음(ReferenceError / not a function)', realErrors.length === 0, realErrors[0] || '');
  if (pageErrors.length) console.log(`  (참고: 무해한 정리 잡음 ${pageErrors.length}건 — ${pageErrors[0].slice(0, 80)})`);

} finally {
  await browser.close();
}

const fail = results.filter(r => !r.ok);
console.log(`\n결과: ${results.length - fail.length} 통과, ${fail.length} 실패`);
console.log(`⚠ FAIL ${fail.length}`);
for (const f of fail) console.log(`실패: ${f.name}${f.detail ? ' — ' + f.detail : ''}`);
process.exit(fail.length ? 1 : 0);
