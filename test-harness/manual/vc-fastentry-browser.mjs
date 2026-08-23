/**
 * 🎓 「로그인한 학생은 로비를 보지 않는다」 — 진짜 브라우저로 확인 (2026-08-23)
 * ---------------------------------------------------------------------------
 * 왜 손으로 만들었나
 *   이 변경이 고친 것은 «화면에 무엇이 보이는가» 다. 문자열 하니스는 그것을 못 본다
 *   (CLAUDE.md: 「화면 좌표가 틀린 버그를 하니스가 못 잡음」). 그래서 실제 Chromium 에
 *   그려서 elementsFromPoint 로 «맨 위에 무엇이 있나» 를 잰다 —
 *   「열렸다」·「보인다」·「눌린다」는 다 다르다.
 *
 * ⚠️ file:// 로 열면 안 된다 — <script src="/js/…"> 가 전부 404 가 되어 vcJoinRoom 이
 *    undefined 이고, 증상이 「아무 일도 안 일어남」으로 똑같이 보인다(CLAUDE.md 2장).
 *
 * ⏳ manual/ 규약상 자동으로 안 돈다. js/idx-vc-fastentry.js · 로비 자동입장(4곳) ·
 *    mango-consent 를 건드리면 사람이 불러야 한다:
 *      PW_DIR=/tmp/pw node test-harness/manual/vc-fastentry-browser.mjs
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { requireBrowser } from './_pw.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = 8934;

let pass = 0, fail = 0;
const ok = (label, cond, detail) => {
  if (cond) { pass++; console.log('  ✅ ' + label); }
  else { fail++; console.log('  ❌ ' + label + (detail ? ' — ' + detail : '')); }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'],
                  { cwd: PUB, stdio: 'ignore' });
await sleep(1200);

const { chromium, exe } = requireBrowser();
const browser = await chromium.launch({
  executablePath: exe,
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required',
         '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});

/** 한 판을 새 페이지로 연다 — localStorage 상태가 판마다 다르다. */
async function open(opts) {
  const page = await browser.newPage();
  await page.setViewportSize({ width: 390, height: 844 });   // 학생 대부분이 폰이다
  const dialogs = [], perrs = [];
  page.on('dialog', async d => { dialogs.push(d.message().slice(0, 80)); try { await d.dismiss(); } catch (_) {} });
  page.on('pageerror', e => perrs.push(String(e).slice(0, 200)));

  // 첫 방문자 오버레이(#aw-overlay)는 스크롤·클릭을 막는다 → «본 것으로» 표시(CLAUDE.md)
  await page.addInitScript(o => {
    try {
      localStorage.setItem('mangoi_admin_welcome_v1_done', '1');
      if (o.loggedIn) {
        const u = { uid: 'stu_test', name: '테스트학생', role: 'student' };
        localStorage.setItem('mangoi_logged_user', JSON.stringify(u));
        localStorage.setItem('mango_user', JSON.stringify(u));
        localStorage.setItem('mangoi_uid', 'stu_test');
      }
    } catch (_) {}
  }, opts);

  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#vc-name-input', { state: 'attached', timeout: 30000 });
  await sleep(2500);

  // ── API 스텁 ──
  await page.evaluate(o => {
    window.__sessions = o.sessions;
    window.__consent  = o.consent;
    const realFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const u = String((input && input.url) || input || '');
      if (u.includes('/api/class/sessions/today')) return new Response(JSON.stringify(window.__sessions), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (u.includes('/api/consents/'))            return new Response(JSON.stringify(window.__consent),  { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (u.includes('/api/turn-config'))          return new Response(JSON.stringify({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (u.includes('/api/'))                     return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      return realFetch(input, init);
    };
    // 소켓은 열지 않는다 — 이 검사가 보는 것은 «화면» 이다
    const RealWS = window.WebSocket;
    window.__ws = [];
    window.WebSocket = function (url) {
      window.__ws.push(String(url));
      return { url: String(url), readyState: 0, send() {}, close() {}, addEventListener() {}, removeEventListener() {} };
    };
    window.WebSocket.OPEN = RealWS.OPEN;
  }, opts);

  return { page, dialogs, perrs };
}

function todaySessions(status) {
  const now = Date.now();
  const k = new Date(now + 9 * 3600 * 1000), p = n => (n < 10 ? '0' : '') + n;
  const ymd = '' + k.getUTCFullYear() + p(k.getUTCMonth() + 1) + p(k.getUTCDate());
  if (status === 'none') return { sessions: [], student_gate: 'off' };
  return {
    sessions: [{
      schedule_id: 9001, room_id: 'class-9001-' + ymd, student_uid: 'stu_test',
      student_name: '테스트학생', teacher_id: '1', teacher_name: '테스트강사',
      start_ts: now, end_ts: now + 1800000, open_at_ts: now - 600000, close_at_ts: now + 2700000,
      duration_min: 30, status: 'live', join_open: true, starts_in_ms: 0,
    }], student_gate: 'off',
  };
}
const CONSENT_DONE = { user_id: 'stu_test', consent_version: 'v1.0-2026-08', recording_consent: 1, recording: 1, attendance: 1 };

/** 화면 한가운데에서 «맨 위에 무엇이 있나» — classList·display 로는 이 사고를 못 본다 */
const topAtCenter = page => page.evaluate(() => {
  const els = document.elementsFromPoint(window.innerWidth / 2, window.innerHeight / 2);
  return els.slice(0, 4).map(e => (e.id ? '#' + e.id : e.tagName));
});

try {
  /* ══ ① 정상 — 로그인한 학생 + 오늘 예약 있음 ══════════════════════════════ */
  console.log('\n── ① 로그인한 학생 · 오늘 예약 있음 (기대: 로비를 한 번도 안 본다) ──');
  {
    const { page, perrs } = await open({ loggedIn: true, sessions: todaySessions('live'), consent: CONSENT_DONE });
    // 로비를 여는 «그 순간» 덮개가 이미 있는가 (220ms 자동입장을 기다리지 않는다)
    const atOnce = await page.evaluate(() => {
      showView('view-videocall-lobby');
      const c = document.getElementById('vc-fastentry-cover');
      return { cover: !!c, z: c ? getComputedStyle(c).zIndex : '', op: c ? getComputedStyle(c).opacity : '' };
    });
    ok('로비가 열리는 즉시 덮개가 있다 (0ms — 지연 없음)', atOnce.cover);
    ok('덮개가 처음부터 불투명하다 (백그라운드 탭에서도 보인다)', atOnce.op === '1', 'opacity=' + atOnce.op);

    /* ⚠️ 재는 시각이 중요하다 — 입장이 끝난 뒤에 재면 «수업 화면의» 오버레이가 잡혀
       엉뚱하게 실패한다(첫 판에서 #vc-orientation-overlay 로 실제로 밟았다).
       자동입장은 +220ms 에 시작하므로 그 «전» 인 150ms 에 잰다. */
    await sleep(150);
    const mid = await page.evaluate(() => {
      const ni = document.getElementById('vc-name-input');
      const b = ni.getBoundingClientRect();
      const hit = document.elementsFromPoint(b.left + b.width / 2, b.top + b.height / 2)[0];
      const cov = document.getElementById('vc-fastentry-cover');
      return {
        // ⚠️ 맨 위는 덮개의 «자식»(Mr.Mango 그림)일 수 있다 — 덮개 «안» 이면 가려진 것이 맞다
        coveredByCover: !!(cov && hit && (hit === cov || cov.contains(hit))),
        hit: hit ? (hit.id ? '#' + hit.id : hit.tagName) : null,
        inCall: document.body.classList.contains('vc-in-call'),
      };
    });
    ok('입장이 끝나기 전까지 아이디 칸 자리를 덮개가 가린다 (로비를 못 본다)',
       !mid.inCall && mid.coveredByCover, JSON.stringify(mid));

    await sleep(4000);
    const r = await page.evaluate(() => ({
      inCall: document.body.classList.contains('vc-in-call'),
      cover: document.querySelectorAll('#vc-fastentry-cover').length,
      note: !!document.getElementById('vc-fastentry-note'),
      room: String((typeof vcRoomId !== 'undefined' ? vcRoomId : '') || ''),
      timers: !!window.__feTimer,
    }));
    ok('수업 화면으로 들어간다', r.inCall);
    ok('예약된 «내 방» 으로 들어간다 (공용방 아님)', /^class-9001-\d{8}$/.test(r.room), 'room=' + r.room);
    ok('들어간 뒤 덮개가 남지 않는다', r.cover === 0, '덮개 ' + r.cover + '개');
    ok('정상 입장이면 안내 줄을 만들지 않는다', !r.note);
    ok('스크립트 오류 없음', perrs.length === 0, perrs.join(' | '));
    await page.close();
  }

  /* ══ ② 오늘 예약이 없는 학생 — ①번 선택: 로비 + 이유 + 방 코드 칸 ═════════
     ⚠️ 이 길은 **학생 게이트가 켜져 있을 때만** 열린다. 지금 운영은 `student_gate:'off'` 라
        (wrangler.toml VC_STUDENT_ROOM_GATE — class_schedules 663건 중 실제 학생 예약이
        6건뿐이라 켜면 대다수가 입장을 못 한다) 예약이 없어도 공용방으로 들어간다.
        그 «지금» 동작은 ②-B 가 따로 지킨다. */
  console.log('\n── ②-A 예약 없음 + 학생게이트 ON (기대: 덮개를 걷고 이유를 적고 방코드 칸을 편다) ──');
  {
    const noneOn = todaySessions('none'); noneOn.student_gate = 'on';
    const { page, dialogs, perrs } = await open({ loggedIn: true, sessions: noneOn, consent: CONSENT_DONE });
    await page.evaluate(() => showView('view-videocall-lobby'));
    await sleep(4000);
    const r = await page.evaluate(() => {
      const box = document.querySelector('#view-videocall-lobby .lobby-box');
      const n = document.getElementById('vc-fastentry-note');
      const det = box && box.querySelector('details');
      const rc = document.getElementById('vc-roomcode-input');
      const rr = rc ? rc.getBoundingClientRect() : null;
      return {
        cover: document.querySelectorAll('#vc-fastentry-cover').length,
        note: !!n, noteText: n ? n.textContent.replace(/\s+/g, ' ').slice(0, 120) : '',
        detOpen: !!(det && det.open),
        rcVisible: !!(rr && rr.width > 0 && rr.height > 0),
        inCall: document.body.classList.contains('vc-in-call'),
      };
    });
    ok('덮개를 걷는다 (학생이 갇히지 않는다)', r.cover === 0);
    ok('로비가 보인다 (수업 화면으로 안 넘어감)', !r.inCall);
    ok('왜 못 들어갔는지 이유가 화면에 적힌다', r.note, r.noteText);
    ok('안내가 한/영 둘 다다', /수업/.test(r.noteText) && /[A-Za-z]{4,}/.test(r.noteText), r.noteText);
    ok('「방 코드 직접 입력」이 펴진다 (①번 — 매니저에게 방 번호를 받는 경로)', r.detOpen);
    ok('방 코드 입력칸이 실제로 화면에 보인다', r.rcVisible);
    ok('스크립트 오류 없음', perrs.length === 0, perrs.join(' | '));
    if (dialogs.length) console.log('   (뜬 안내창: ' + JSON.stringify(dialogs) + ')');
    await page.close();
  }

  /* ══ ②-B 예약 없음 + 학생게이트 OFF(현재 운영값) — 예전과 같이 공용방으로 들어간다 ══
     이 파일은 «입장 로직을 바꾸지 않는다». 그 사실을 여기서 못 박는다 —
     덮개가 입장 결과를 바꾸기 시작하면 그 순간 사고 반경이 서비스 전체가 된다. */
  console.log('\n── ②-B 예약 없음 + 학생게이트 OFF (기대: 예전 그대로 공용방 입장 · 덮개만 사라짐) ──');
  {
    const { page, perrs } = await open({ loggedIn: true, sessions: todaySessions('none'), consent: CONSENT_DONE });
    await page.evaluate(() => showView('view-videocall-lobby'));
    await sleep(4000);
    const r = await page.evaluate(() => ({
      inCall: document.body.classList.contains('vc-in-call'),
      room: String((typeof vcRoomId !== 'undefined' ? vcRoomId : '') || ''),
      cover: document.querySelectorAll('#vc-fastentry-cover').length,
      note: !!document.getElementById('vc-fastentry-note'),
    }));
    ok('예전과 같이 입장한다 (덮개가 입장 결과를 바꾸지 않는다)', r.inCall, 'room=' + r.room);
    ok('공용방으로 간다 (게이트 OFF 의 기존 동작)', r.room === 'mangoi-class', 'room=' + r.room);
    ok('덮개가 남지 않는다', r.cover === 0);
    ok('엉뚱한 안내를 붙이지 않는다', !r.note);
    ok('스크립트 오류 없음', perrs.length === 0, perrs.join(' | '));
    await page.close();
  }

  /* ══ ③ 비로그인 — 예전 로비 그대로여야 한다 ═══════════════════════════════ */
  console.log('\n── ③ 로그인 안 한 사람 (기대: 예전과 100% 같은 로비) ──');
  {
    const { page, perrs } = await open({ loggedIn: false, sessions: todaySessions('live'), consent: CONSENT_DONE });
    await page.evaluate(() => showView('view-videocall-lobby'));
    await sleep(1200);
    const r = await page.evaluate(() => {
      const ni = document.getElementById('vc-name-input');
      const rr = ni ? ni.getBoundingClientRect() : null;
      return {
        cover: document.querySelectorAll('#vc-fastentry-cover').length,
        idVisible: !!(rr && rr.width > 0 && rr.height > 0),
        note: !!document.getElementById('vc-fastentry-note'),
      };
    });
    ok('덮개가 뜨지 않는다', r.cover === 0);
    ok('아이디 칸이 그대로 보인다', r.idVisible);
    ok('엉뚱한 안내가 붙지 않는다', !r.note);
    ok('스크립트 오류 없음', perrs.length === 0, perrs.join(' | '));
    await page.close();
  }

  /* ══ ④ 촬영동의를 아직 안 한 학생 — 모달이 «눌려야» 한다 ══════════════════ */
  console.log('\n── ④ 촬영동의 기록이 없는 학생 (기대: 덮개를 걷어 동의 모달이 눌린다) ──');
  {
    const { page, perrs } = await open({ loggedIn: true, sessions: todaySessions('live'), consent: {} });
    await page.evaluate(() => showView('view-videocall-lobby'));
    await sleep(3000);
    const r = await page.evaluate(() => {
      const m = document.getElementById('mangoi-consent-modal');
      let top = [];
      if (m) {
        const b = m.getBoundingClientRect();
        top = document.elementsFromPoint(b.left + b.width / 2, b.top + b.height / 2)
                      .slice(0, 3).map(e => (e.id ? '#' + e.id : e.tagName));
      }
      return { modal: !!m, cover: document.querySelectorAll('#vc-fastentry-cover').length, top };
    });
    ok('촬영동의 모달이 뜬다', r.modal, JSON.stringify(r.top));
    ok('덮개가 그 위를 덮고 있지 않다 (보이는데 안 눌린다 방지)',
       r.cover === 0 && !r.top.includes('#vc-fastentry-cover'), '덮개 ' + r.cover + '개 / top=' + JSON.stringify(r.top));
    ok('스크립트 오류 없음', perrs.length === 0, perrs.join(' | '));
    await page.close();
  }

  /* ══ ⑤ PC 폭 — 「모바일만 확인하고 PC 를 안 본」 사고 방지(2026-08-17) ═════════
     그리고 홈의 「A.i 상담사」 위젯은 z-index 2,147,483,000 이다. 그 위에 겹친 것은
     «보이는데 안 눌린다» 가 된다(CLAUDE.md). 덮개가 정말 맨 위인지 좌표로 잰다. */
  console.log('\n── ⑤ PC 1440×900 (기대: 덮개가 화면 전체 · A.i 위젯보다 위) ──');
  {
    const { page, perrs } = await open({ loggedIn: true, sessions: todaySessions('live'), consent: CONSENT_DONE });
    await page.setViewportSize({ width: 1440, height: 900 });
    const r = await page.evaluate(() => {
      showView('view-videocall-lobby');
      const c = document.getElementById('vc-fastentry-cover');
      const b = c.getBoundingClientRect();
      const cs = getComputedStyle(c);
      // A.i 상담사 위젯 자리에서 «맨 위에 무엇이 있나»
      const w = document.getElementById('mangoi-toggle') || document.getElementById('mangoi-widget');
      let overWidget = null, widgetSeen = false;
      if (w) {
        const wb = w.getBoundingClientRect();
        if (wb.width > 0 && wb.height > 0) {
          widgetSeen = true;
          const hit = document.elementsFromPoint(wb.left + wb.width / 2, wb.top + wb.height / 2)[0];
          overWidget = !!(hit && (hit === c || c.contains(hit)));
        }
      }
      return {
        full: Math.round(b.width) === window.innerWidth && Math.round(b.height) === window.innerHeight,
        w: Math.round(b.width), h: Math.round(b.height), vw: window.innerWidth, vh: window.innerHeight,
        z: cs.zIndex, pos: cs.position, widgetSeen, overWidget,
        // 문서가 옆으로 넘치지 않는가
        overflowX: document.documentElement.scrollWidth > window.innerWidth,
      };
    });
    /* ⚠️ position:fixed 는 «스크롤바를 뺀» 폭이다 — 1440 화면에서 1425 가 정상이다.
       스크롤바를 덮겠다고 html 에 overflow:hidden 을 걸지 말 것(sticky 가 죽는다 — CLAUDE.md). */
    ok('PC 에서도 덮개가 화면을 덮는다 (스크롤바 폭 제외)',
       r.full || (r.vw - r.w <= 20 && r.h === r.vh), r.w + '×' + r.h + ' vs ' + r.vw + '×' + r.vh);
    ok('position:fixed 다 (스크롤해도 안 밀린다)', r.pos === 'fixed', r.pos);
    ok('가로로 넘치지 않는다', !r.overflowX);
    if (r.widgetSeen) ok('「A.i 상담사」 위젯보다 덮개가 위에 있다 (보이는데 안 눌린다 방지)', r.overWidget === true, 'z=' + r.z);
    else console.log('  ⏭ A.i 상담사 위젯이 이 판에는 없어 겹침 확인 건너뜀');
    await page.screenshot({ path: '/tmp/fastentry-pc.png' });
    await sleep(4000);
    const after = await page.evaluate(() => ({
      inCall: document.body.classList.contains('vc-in-call'),
      cover: document.querySelectorAll('#vc-fastentry-cover').length,
    }));
    ok('PC 에서도 수업 화면까지 들어간다', after.inCall);
    ok('PC 에서도 덮개가 남지 않는다', after.cover === 0);
    ok('스크립트 오류 없음', perrs.length === 0, perrs.join(' | '));
    await page.close();
  }

  console.log('\n결과: ' + pass + ' 통과, ' + fail + ' 실패');
} finally {
  await browser.close();
  srv.kill();
}
process.exit(fail ? 1 : 0);
