// 📅 학생 상세 캘린더 — «취소된 수업이 되살아나는가» 를 진짜 브라우저로 잰다 — 2026-09-21
//
//   자동 하니스(enroll_calendar_cancelled_harness.mjs)는 판정 함수와 서버 블록을 오려 내
//   돌린다. 여기서는 **그 화면을 실제로 그려** «카드가 눈에 보이는가» 를 잰다
//   — 「판정이 옳다」와 「화면에 안 나온다」는 다른 값이다.
//
// 실행: node test-harness/manual/enroll-calendar-cancelled-browser.mjs
//   (자동으로 안 돕니다 — manual/ 은 게이트가 물어 가지 않습니다. 사람이 부릅니다.)
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = process.env.PORT || '8931';
const URL_ = `http://127.0.0.1:${PORT}/admin/student.html?uid=jeong`;
const CHROME = execSync(`ls -d /opt/pw-browsers/chromium*/chrome-linux/chrome 2>/dev/null | head -1`).toString().trim();
if (!CHROME) { console.log('⏭  건너뜀 — 크로미움이 없습니다'); process.exit(0); }

let PASS = 0, FAIL = 0; const FAILS = [];
const check = (n, ok, extra) => {
  if (ok) { PASS++; console.log('  ✅ ' + n); }
  else { FAIL++; FAILS.push(n); console.log('  ❌ ' + n + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : '')); }
};

const prof = mkdtempSync(join(tmpdir(), 'enrcal-'));
const proc = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--disable-gpu',
  '--remote-debugging-port=9333', `--user-data-dir=${prof}`, 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(1800);

let ws, id = 0; const waiters = new Map();
async function cdp(method, params = {}, sessionId) {
  const mid = ++id;
  ws.send(JSON.stringify({ id: mid, method, params, sessionId }));
  return new Promise((res, rej) => { waiters.set(mid, { res, rej }); setTimeout(() => rej(new Error('timeout ' + method)), 20000); });
}
try {
  /* ⚠️ /json/new 로 «새 탭» 을 만들면 이 컨테이너의 크로미움은 스크립트를 실행하지 않는다
     (규칙서 「헤드리스로 화면을 열었는데 페이지 스크립트가 하나도 안 돌음」).
     **이미 있는 탭**을 잡아 Page.navigate 로 연다. */
  const list = JSON.parse(execSync('curl -s http://127.0.0.1:9333/json/list').toString());
  const page = list.find((t) => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && waiters.has(m.id)) { const w = waiters.get(m.id); waiters.delete(m.id);
      m.error ? w.rej(new Error(m.error.message)) : w.res(m.result); }
  };
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await cdp('Network.enable'); await cdp('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp('Page.navigate', { url: URL_ + '&_nc=' + Date.now() });
  await sleep(2500);

  const evalJs = async (expr) => {
    const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
    return r.result.value;
  };

  check('⓪ 전제: 판정 함수와 렌더 함수가 화면에 살아 있다',
    await evalJs(`typeof enrCalHidden === 'function' && typeof renderDSchedule === 'function'`));

  /* 그 주(2026-09-20 일 ~ 09-26 토)를 보게 하고, 실사고 신청을 넣어 그린다.
     ⚠️ 카드 개수는 «화면에 실재하는 요소» 로 센다 — 스크립트 안 문자열까지 세면 헛돈다. */
  /* ⚠️ 이 화면은 로그인·API 없이 열면 스케줄 탭 안의 요소가 아직 없을 수 있다.
     렌더 함수가 쓰는 두 칸을 보장해 준다 — 검사 대상은 «무엇이 그려지는가» 이지
     «탭이 어떻게 열리는가» 가 아니다. */
  await evalJs(`(function(){
    ['d-sched-label','d-sched-calendar'].forEach(function(id){
      if (!document.getElementById(id)) {
        var d = document.createElement('div'); d.id = id; document.body.appendChild(d);
      }
    });
    return true;
  })()`);

  const draw = async (enr, view) => evalJs(`(function(){
    _dSchedState.view = ${JSON.stringify(view)};
    _dSchedState.weekStart = new Date(2026, 8, 20);
    _dSchedState.year = 2026; _dSchedState.month = 8;
    _dSchedState.enrollments = ${JSON.stringify([enr])};
    _dSchedState.aiSchedules = [];
    renderDSchedule();
    var el = document.getElementById('d-sched-calendar');
    /* ⚠️ 주간 카드에는 title 이 있고 «월간 카드에는 없다» — title 로 세면 월간이
       늘 0개로 나와 멀쩡한 화면이 빨간불이 된다(2026-09-21 에 실제로 밟음).
       두 뷰가 «함께» 쓰는 것은 체험수업 색(#dcfce7)이므로 그것으로 센다. */
    var cards = el.querySelectorAll('div[style*="#dcfce7"]');
    return { cards: cards.length, hasText: el.textContent.indexOf('체험수업') >= 0 };
  })()`);

  const 실사고 = { id: 103, student_user_id: 'jeong', status: 'confirmed', type: '체험수업',
                   days_of_week: '금', time: '14:20', class_size: '1:1', teacher_name: '중국어 강선생님',
                   started_at: 1789084800000, end_date: '2026-10-11', class_total: 4, class_active: 0 };
  const 살아있음 = { ...실사고, class_total: 4, class_active: 4 };
  const 옛서버   = { id: 103, student_user_id: 'jeong', status: 'confirmed', type: '체험수업',
                     days_of_week: '금', time: '14:20', class_size: '1:1', teacher_name: '중국어 강선생님',
                     started_at: 1789084800000, end_date: '2026-10-11' };

  for (const view of ['week', 'month']) {
    const ko = view === 'week' ? '주간' : '월간';
    const a = await draw(살아있음, view);
    check(`① 전제(${ko}) 살아 있는 신청은 카드가 «그려진다»`, a.cards > 0, a);
    const b = await draw(실사고, view);
    check(`② (${ko}) 실사고 — 수업이 전부 취소된 신청은 카드가 «안 그려진다»`, b.cards === 0 && !b.hasText, b);
    const c = await draw(옛서버, view);
    check(`③ 짝(${ko}) 서버가 칸을 안 주면 예전대로 그린다(fail-open)`, c.cards > 0, c);
    const d = await draw({ ...실사고, status: 'cancelled', class_total: 4, class_active: 4 }, view);
    check(`④ 짝(${ko}) 신청서 자체가 취소면 안 그린다`, d.cards === 0, d);
  }
  /* 🔁 변이시험 — 판정을 무력화하면 실사고 카드가 «다시» 나타나야 한다.
     이것이 통과해야 위 ②가 «헛돌지 않았다» 는 증거가 된다.
     ⚠️ 디스크 파일은 안 건드린다(전역만 잠깐 덮었다 되돌린다). */
  const mutated = await evalJs(`(function(){
    var orig = window.enrCalHidden;
    window.enrCalHidden = function(){ return false; };
    try {
      _dSchedState.view = 'week';
      _dSchedState.weekStart = new Date(2026, 8, 20);
      _dSchedState.enrollments = ${JSON.stringify([실사고])};
      _dSchedState.aiSchedules = [];
      renderDSchedule();
      var el = document.getElementById('d-sched-calendar');
      return el.querySelectorAll('div[style*="#dcfce7"]').length;
    } finally { window.enrCalHidden = orig; }
  })()`);
  check('⑤ 변이) 판정을 끄면 실사고 카드가 «다시 나타난다»(검사가 헛돌지 않는다)', mutated > 0, mutated);
  const restored = await draw(실사고, 'week');
  check('⑥ 되돌린 뒤 다시 «안 그려진다»(전역을 제대로 복구했다)', restored.cards === 0, restored);

  console.log('\n결과: PASS ' + PASS + ' / FAIL ' + FAIL);
  if (FAIL) { console.log('⚠ 실제 확인 필요:\n  - ' + FAILS.join('\n  - ')); }
} catch (e) {
  console.log('  ❌ 실행 중 예외: ' + (e && e.message));
  FAIL++;
} finally {
  try { ws && ws.close(); } catch {}
  try { proc.kill(); } catch {}
}
process.exit(FAIL ? 1 : 0);
