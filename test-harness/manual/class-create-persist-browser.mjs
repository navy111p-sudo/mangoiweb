/* 💾 «수업을 만들면 서버에 진짜로 저장되는가» — 진짜 Chromium 으로 눌러 본다 (2026-08-24)
 *
 * [왜 이 검사가 따로 필요한가]
 *   2026-08-24 사장님 제보: jjy2323(장지웅) 학생과 HANNAH 강사의 22:00 수업을 주간 스케줄
 *   화면에서 잡았는데 ① 학생 화면은 「오늘 잡힌 수업이 없다」 ② 강의실에서 서로 못 만났다.
 *   원인은 이 화면의 «수업 만들기» 가 메모리(SLOTS)에만 넣고 서버에 POST 를 하지 않은 것.
 *   `class_schedules` 에 행이 없으니 학생 조회도 0건이고, 결정론적 방 번호
 *   (`class-{예약id}-{YYYYMMDD}`)를 만들 근거 자체가 없었다.
 *
 *   ⚠️ 이 사고의 고약한 점은 «화면에는 멀쩡히 그려진다» 는 것이다 — 새로고침해야 사라진다.
 *      그래서 코드를 읽어도, 화면을 봐도 안 보이고 **네트워크를 봐야** 보인다.
 *      문자열 하니스(schedule_10min_manager_harness 6부)는 「POST 하는 코드가 있는가」까지만
 *      본다. 여기서는 실제로 **요청이 나갔는지, 무엇을 보냈는지, 실패하면 어떻게 되는지** 를 본다.
 *
 * [무엇을 확인하나]
 *   ① 빈 칸 → 「새 슬롯 추가」 → 저장  ⇒ /api/admin/class-schedules 로 POST 가 나간다
 *   ② 보낸 내용이 서버 계약과 맞는다 (one_off + 날짜 + HH:MM + 학생 + 강사 + 길이)
 *   ③ 서버가 거절하면 화면에 그리지 않는다 (있는 것처럼 보이면 이 사고가 그대로 남는다)
 *   ④ 겹치면(409 conflict) 사람에게 한 번 묻고, «그래도» 면 force 로 다시 보낸다
 *   ⑤ 대기 풀 배정도 서버에 저장한다 — 실패하면 풀에서 빼지도 않는다
 *   ⑥ 같은 칸의 여러 행(그룹)은 한 수업으로 합쳐 그린다 (3명이 1명으로 줄지 않게)
 *
 * [돌리는 법]  README 규약 그대로 — 게이트는 이 파일을 물어 가지 않는다(사람이 부른다).
 *   mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
 *   cd <repo> && PW_DIR=/tmp/pw node test-harness/manual/class-create-persist-browser.mjs
 *
 * ⚠️ 서버(D1)에 아무것도 쓰지 않는다 — fetch 를 가로채 가짜 응답을 물린다.
 */
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireBrowser } from './_pw.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = Number(process.env.CCP_PORT || 8911);
const BASE = `http://127.0.0.1:${PORT}`;

let PASS = 0, FAIL = 0;
const check = (n, ok, why) => {
  if (ok) { PASS++; console.log('  OK   ' + n); }
  else { FAIL++; console.log('  FAIL ' + n + (why !== undefined ? ' — ' + JSON.stringify(why) : '')); }
};

async function serve() {
  try { const r = await fetch(BASE + '/admin/weekly-schedule.html', { method: 'HEAD' }); if (r.ok) return null; } catch { /* 아직 */ }
  const p = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: PUBLIC, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    try { const r = await fetch(BASE + '/admin/weekly-schedule.html', { method: 'HEAD' }); if (r.ok) return p; } catch { /* 아직 */ }
  }
  p.kill();
  throw new Error('정적 서버를 못 띄웠습니다: ' + PUBLIC);
}

const KST = 9 * 3600 * 1000;
const k = new Date(Date.now() + KST);
const monday = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()) - ((k.getUTCDay() + 6) % 7) * 86400000);
const iso = (d) => d.toISOString().slice(0, 10);
const DAY_TUE = iso(new Date(monday.getTime() + 86400000));

/* 👥 그룹 수업은 서버에 «학생마다 한 행» 으로 들어온다 — 같은 칸(화 09:00)에 두 행을 둔다.
   합치지 않으면 나중 행이 앞 행을 덮어써 2명짜리가 1명으로 보인다(제보 형태 재현). */
const SCHED = [
  { teacher_id: '24', date: DAY_TUE, start_time: '09:00', type: '1on1', duration_min: 20, origin: 'class',
    students: [{ name: '학생가', uid: 'stu_a' }] },
  { teacher_id: '24', date: DAY_TUE, start_time: '09:00', type: '1on1', duration_min: 20, origin: 'class',
    students: [{ name: '학생나', uid: 'stu_b' }] },
];

/* 이 회차에 서버가 어떻게 답할지 — 검사마다 바꿔 가며 쓴다 */
const stub = { mode: 'ok', posts: [] };

async function open(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  const page = await ctx.newPage();
  await page.exposeFunction('__logPost', (s) => { stub.posts.push(JSON.parse(s)); });
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const u = req.url();
    const j = (o, status) => route.fulfill({ status: status || 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (req.method() === 'POST' && u.includes('/api/admin/class-schedules')) {
      const body = JSON.parse(req.postData() || '{}');
      await page.evaluate((b) => window.__logPost(b), JSON.stringify(body)).catch(() => {});
      if (stub.mode === 'fail') return j({ ok: false, error: 'student_not_found', message: '학생을 찾지 못했습니다.' }, 400);
      if (stub.mode === 'conflict' && !body.force) {
        return j({ ok: false, error: 'conflict', message: '겹치는 수업이 있습니다.' }, 409);
      }
      return j({ ok: true, created: [{ id: 9001, scheduled_date: body.scheduled_date, start_time: body.start_time }] });
    }
    if (u.includes('/api/admin/teachers')) return j([{ id: '24', name: 'HANNAH', name_en: 'HANNAH', category: 'office' }]);
    if (u.includes('/api/admin/schedules')) return j(SCHED);
    if (u.includes('/api/admin/unassigned-students')) return j({ students: [{ uid: 'jjy2323', name: '장지웅', level: 'A2' }] });
    return j({ ok: true, items: [], events: [], teachers: [], schedules: [] });
  });
  await page.goto(BASE + '/admin/weekly-schedule.html?_=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof SLOTS !== 'undefined' && Object.keys(SLOTS).length > 0, { timeout: 30000 })
    .catch(() => {});
  await page.evaluate(() => { viewMode = 'day'; curDow = 1; render(); });
  await page.waitForTimeout(800);
  return { ctx, page };
}

/** 빈 칸을 «끌어» 「새 슬롯 추가」 를 열고, 종류·학생을 채워 저장까지 누른다.
 *  🪤 빈 칸은 그냥 click 으로는 안 열린다 — 모달을 여는 것은 «드래그 선택» 의 mouseup 이고,
 *     선택 칸은 mousemove 에서만 쌓인다. 움직임이 한 번도 없으면 dragSelected 가 비어
 *     mouseup 이 조용히 되돌아간다(모달도 에러도 없음). 실제 사람 손처럼 눌러-움직여-뗀다. */
async function createAt(page, hour, studentLine) {
  await page.evaluate(() => { /* ⛔ 모달을 «지우지» 말 것 — `#modal-box` 의 class 가 바로 `modal` 이라 지우면
     그 뒤 openModal 이 «떨어져 나간 노드» 에 그린다: 에러도 없고 화면에도 아무것도 안 뜬다
     (실측: dragSelected 는 1인데 .type-choice 가 0). 닫기만 한다. */
    if (typeof closeModal === 'function') closeModal(); });
  /* 🪤 일간 격자는 «가로로 길다»(10분 칸 × 14시간). 늦은 시간 칸은 창(1600px) 밖에 있어
     boundingBox 가 x=1966 같은 값을 준다 — 그 좌표로 진짜 마우스를 누르면 다른 데를 누르는
     셈이라 mousedown 이 아예 안 걸리고(isDragging=false) 모달도 안 열린다(실측).
     ✅ 드래그선택은 좌표가 아니라 «어느 요소에서 눌렀나»(e.target) 로만 판정하므로
        그 칸에 이벤트를 직접 보낸다 — 실제 핸들러(mousedown→mousemove→mouseup)는 그대로 탄다. */
  const fired = await page.evaluate(([d, h]) => {
    const td = document.querySelector(`td.slot[data-date="${d}"][data-hour="${h}"]`);
    if (!td) return false;
    const ev = (t, el) => el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, button: 0 }));
    ev('mousedown', td); ev('mousemove', td); ev('mouseup', td);
    return true;
  }, [DAY_TUE, hour]);
  if (!fired) return { opened: false, why: 'cell 없음' };
  await page.waitForTimeout(500);
  const opened = await page.evaluate(() => !!document.querySelector('.type-choice[data-type="1on1"]'));
  if (!opened) return { opened: false };
  await page.click('.type-choice[data-type="1on1"]');
  await page.waitForTimeout(250);
  await page.fill('#ns-students', studentLine);
  await page.click('#new-slot-save');
  await page.waitForTimeout(1200);
  return { opened: true };
}

(async () => {
  const { chromium, exe } = requireBrowser();
  const server = await serve();
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  try {
    const { ctx, page } = await open(browser);
    const dialogs = [];
    page.on('dialog', async (d) => { dialogs.push(d.message()); await d.accept(); });

    console.log('\n[0] 👥 같은 칸의 여러 행이 «한 수업» 으로 합쳐지는가');
    const merged = await page.evaluate(([d]) => {
      const s = getSlotAt('24', d, 9 * 60);
      return s ? { type: s.type, n: (s.students || []).length, names: (s.students || []).map((x) => x.name) } : null;
    }, [DAY_TUE]);
    check('그 칸에 수업이 있다', !!merged, merged);
    check('👥 학생 2명이 다 남았다 (덮어써서 1명이 되지 않는다)', !!merged && merged.n === 2, merged);
    check('👥 2명 이상이면 그룹으로 그린다', !!merged && merged.type === 'group', merged);

    console.log('\n[1] 빈 칸에 수업을 만들면 «서버로» 나가는가');
    stub.mode = 'ok'; stub.posts.length = 0;
    const c1 = await createAt(page, 22, '장지웅:jjy2323');
    check('빈 칸을 누르면 「새 슬롯 추가」 가 열린다', c1.opened);
    check('🔴 /api/admin/class-schedules 로 POST 가 나갔다 (예전엔 한 건도 안 나갔다)',
      stub.posts.length === 1, stub.posts.length);
    const p1 = stub.posts[0] || {};
    check('🔴 학생 아이디를 보낸다', p1.user_id === 'jjy2323', p1.user_id);
    check('🟡 학생 이름도 함께 보낸다 (아이디가 없을 때 서버가 이름으로 찾는다)', p1.student_name === '장지웅', p1.student_name);
    check('🔴 강사 번호를 보낸다', String(p1.teacher_id) === '24', p1.teacher_id);
    check('🔴 «그 날짜의 일회성» 으로 보낸다', p1.schedule_kind === 'one_off' && p1.scheduled_date === DAY_TUE,
      { kind: p1.schedule_kind, date: p1.scheduled_date });
    check('🔴 시작 시각을 HH:MM 으로 보낸다 (칸이 22시면 22:00)', p1.start_time === '22:00', p1.start_time);
    check('🟡 수업 길이를 보낸다', Number(p1.duration_min) > 0, p1.duration_min);
    check('🟡 서버가 아는 class_type 을 보낸다',
      ['regular', 'trial', 'level_test', 'makeup'].includes(p1.class_type), p1.class_type);

    console.log('\n[2] 서버가 거절하면 «화면에도 그리지 않는가»  ← 이 사고의 핵심');
    stub.mode = 'fail'; stub.posts.length = 0; dialogs.length = 0;
    const before = await page.evaluate(([d]) => !!getSlotAt('24', d, 20 * 60), [DAY_TUE]);
    await createAt(page, 20, '없는학생:no_such_uid');
    const after = await page.evaluate(([d]) => !!getSlotAt('24', d, 20 * 60), [DAY_TUE]);
    check('요청은 나갔다', stub.posts.length === 1, stub.posts.length);
    check('🔴 실패하면 그 칸에 수업을 그리지 않는다 (있는 것처럼 보이면 안 된다)',
      before === false && after === false, { before, after });
    check('🔴 사람에게 실패를 알린다', dialogs.some((m) => /저장하지 못|Nothing was saved|찾지 못/.test(m)), dialogs);

    console.log('\n[3] 겹치면 한 번 묻고, «그래도» 면 force 로 다시 보낸다');
    stub.mode = 'conflict'; stub.posts.length = 0; dialogs.length = 0;
    await createAt(page, 19, '장지웅:jjy2323');
    check('🟡 겹침을 사람에게 물었다', dialogs.some((m) => /겹치는|overlapping/.test(m)), dialogs);
    check('🟡 «그래도» 하면 force 로 한 번 더 보낸다',
      stub.posts.length === 2 && stub.posts[0].force !== true && stub.posts[1].force === true,
      stub.posts.map((x) => !!x.force));

    console.log('\n[4] 대기 풀 배정도 서버에 저장하는가');
    stub.mode = 'ok'; stub.posts.length = 0;
    await page.evaluate(() => { /* ⛔ 모달을 «지우지» 말 것 — `#modal-box` 의 class 가 바로 `modal` 이라 지우면
     그 뒤 openModal 이 «떨어져 나간 노드» 에 그린다: 에러도 없고 화면에도 아무것도 안 뜬다
     (실측: dragSelected 는 1인데 .type-choice 가 0). 닫기만 한다. */
    if (typeof closeModal === 'function') closeModal(); });
    await page.evaluate(() => { const p = document.querySelector('.pool-panel'); if (p) p.classList.add('open'); });
    /* 🪤 직전 저장이 reloadAndRender 로 화면을 통째로 다시 그린다 — 그 사이에 끌면
       잡고 있던 칸이 «갈아 끼워져» 놓을 곳을 잃는다. 다 그려질 때까지 기다린다. */
    await page.waitForTimeout(1500);
    /* ⚠️ 여기만은 «진짜 마우스» 여야 한다 — 배정 mouseup 이 elementFromPoint(clientX,clientY)
       로 놓을 칸을 찾기 때문에 좌표가 진짜여야 한다. 그래서 화면 안에 보이는 시간대를 쓴다
       (일간 격자는 가로로 길어 늦은 시간 칸은 창 밖에 있다). */
    const dropOn = async (hour) => {
      const chip = await page.locator('.pool-chip').first().boundingBox();
      const cell = await page.locator(`td.slot[data-date="${DAY_TUE}"][data-hour="${hour}"]`).first().boundingBox();
      if (!chip || !cell) return false;
      await page.mouse.move(chip.x + chip.width / 2, chip.y + chip.height / 2);
      await page.mouse.down();
      await page.mouse.move(cell.x + cell.width / 2, cell.y + cell.height / 2, { steps: 8 });
      await page.mouse.move(cell.x + cell.width / 2, cell.y + cell.height / 2);
      await page.waitForTimeout(200);
      await page.mouse.up();
      await page.waitForTimeout(1000);
      return true;
    };
    const dropped = await dropOn(17);
    check('칩을 칸으로 끌어 놓았다', dropped);
    check('🔴 대기 풀 배정도 /api/admin/class-schedules 로 나간다',
      stub.posts.length === 1 && stub.posts[0].user_id === 'jjy2323', stub.posts);
    check('🟡 그 배정도 «그 날짜의 일회성» 이다',
      (stub.posts[0] || {}).schedule_kind === 'one_off' && (stub.posts[0] || {}).scheduled_date === DAY_TUE,
      stub.posts[0]);

    console.log('\n[5] 대기 풀 배정이 «실패» 하면 풀에서 빼지 않는가');
    stub.mode = 'fail'; stub.posts.length = 0;
    await page.evaluate(() => { if (typeof reloadUnassignedPool === 'function') reloadUnassignedPool(); });
    await page.waitForTimeout(600);
    await page.evaluate(() => { const p = document.querySelector('.pool-panel'); if (p) p.classList.add('open'); });
    const poolBefore = await page.evaluate(() => document.querySelectorAll('.pool-chip').length);
    await dropOn(16);
    const poolAfter = await page.evaluate(() => document.querySelectorAll('.pool-chip').length);
    const drawn = await page.evaluate(([d]) => !!getSlotAt('24', d, 16 * 60), [DAY_TUE]);
    check('요청은 나갔다', stub.posts.length === 1, stub.posts.length);
    check('🔴 실패하면 대기 풀에 그대로 남는다 (사라지면 그 학생을 영영 못 찾는다)',
      poolBefore > 0 && poolAfter === poolBefore, { poolBefore, poolAfter });
    check('🔴 실패하면 칸에도 그리지 않는다', drawn === false, drawn);

    await ctx.close();
  } finally {
    await browser.close();
    if (server) server.kill();
  }
  console.log('\n' + '─'.repeat(58));
  console.log(FAIL === 0 ? `✅ ALL PASS (${PASS})` : `⚠ PASS ${PASS} / FAIL ${FAIL}`);
  process.exit(FAIL ? 1 : 0);
})();
