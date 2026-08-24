/* 🟡 LMS·시드 칸에 수업이 «실제로» 들어가는가 — 진짜 Chromium 으로 눌러 본다 (2026-08-24)
 *
 * [왜 이 검사가 따로 필요한가]
 *   문자열 하니스(schedule_10min_manager_harness 4부)는 「그 함수를 쓰는가」까지만 본다.
 *   이번 건에서 정작 사람을 막는 것은 «누르면 무엇이 뜨는가» 였다 — click 이 mouseup «뒤» 에
 *   오기 때문에, 상세 모달이 「새 슬롯 추가」 모달을 덮어써서 «눌러도 아무 일도 안 일어난» 것처럼
 *   보이는 형태의 사고가 난다. 그건 코드를 아무리 읽어도 안 보이고 브라우저에서만 보인다.
 *
 * [무엇을 확인하나]
 *   ① LMS·시드 칸이 «빈 칸» 으로 판정된다 (cellBusy=false) — 진짜 수업은 그대로 true
 *   ② 그 칸을 누르면 「새 슬롯 추가」 가 뜬다 (LMS 상세가 덮어쓰지 않는다)
 *   ③ 진짜 수업 칸은 예전대로 상세가 뜬다 (겹침 방어까지 풀리면 안 된다)
 *   ④ 학생 배정 충돌판정이 LMS 칸을 통과시킨다 (conflictReason=null)
 *   ⑤ 빈칸 찾기(hourHasSlot)가 LMS 시간을 «빈 시간» 으로 센다
 *
 * [돌리는 법]  README 규약 그대로 — 게이트는 이 파일을 물어 가지 않는다(사람이 부른다).
 *   mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
 *   cd <repo> && PW_DIR=/tmp/pw node test-harness/manual/lms-slot-assign-browser.mjs
 *
 * ⚠️ 서버(D1)에 아무것도 쓰지 않는다 — fetch 를 가로채 가짜 응답을 물린다.
 */
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireBrowser } from './_pw.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = Number(process.env.LMS_PORT || 8907);
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

/* 이번 주 월요일(KST) — 화면이 그 주를 그리므로 시드도 같은 주로 만든다 */
const KST = 9 * 3600 * 1000;
const k = new Date(Date.now() + KST);
const monday = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()) - ((k.getUTCDay() + 6) % 7) * 86400000);
const iso = (d) => d.toISOString().slice(0, 10);
const DAY_TUE = iso(new Date(monday.getTime() + 86400000));   // 화요일 — 제보에서 막혀 있던 날

/* 제보 상황 그대로: 화요일 15·16·17시가 LMS 점유, 12시는 시드, 21시에 진짜 수업 하나 */
const SCHED = [
  { teacher_id: '24', date: DAY_TUE, start_time: '15:00', type: '1on1', students: [], duration_min: 60, origin: 'lms' },
  { teacher_id: '24', date: DAY_TUE, start_time: '16:00', type: '1on1', students: [], duration_min: 60, origin: 'lms' },
  { teacher_id: '24', date: DAY_TUE, start_time: '12:00', type: '1on1', students: [], duration_min: 60, origin: 'sample' },
  { teacher_id: '24', date: DAY_TUE, start_time: '21:00', type: '1on1', duration_min: 20, origin: 'class',
    students: [{ name: '김연숙', uid: 'stu_kys' }] },
];

async function open(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  const page = await ctx.newPage();
  await page.route('**/api/**', async (route) => {
    const u = route.request().url();
    const j = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (u.includes('/api/admin/teachers')) return j([{ id: '24', name: 'HANNAH', name_en: 'HANNAH', category: 'office' }]);
    if (u.includes('/api/admin/schedules')) return j(SCHED);
    if (u.includes('/api/admin/unassigned-students')) return j({ students: [{ uid: 'stu_wait', name: '배정대기', level: 'A2' }] });
    return j({ ok: true, items: [], events: [], teachers: [], schedules: [] });   // 나머지는 빈 응답
  });
  /* 🪤 캐시 우회 — 같은 포트의 서버를 다시 쓰면 크로미움이 «직전 회차의 HTML» 을 그대로
     꺼내 쓴다. 고친 파일로 돌렸는데 옛 결과가 나와 «흔들리는 검사» 로 보인다(실측). */
  await page.goto(BASE + '/admin/weekly-schedule.html?_=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof SLOTS !== 'undefined' && Object.keys(SLOTS).length > 0, { timeout: 30000 })
    .catch(() => {});
  /* 🪤 «주간» 뷰는 요일 요약만 그린다 — 칸(td.slot)이 아예 없다.
     제보 화면과 같은 «일간» 뷰로 바꾸고 화요일(주 시작 월요일 기준 index 1)을 편다. */
  await page.evaluate(() => { viewMode = 'day'; curDow = 1; render(); });
  await page.waitForTimeout(800);
  return { ctx, page };
}

/** 그 강사·날짜·시각의 칸(td) 을 찾는다 — 화면이 실제로 그린 것에서 고른다 */
const cellAt = (page, date, hour) => page.evaluate(([d, h]) => {
  const td = document.querySelector(`td.slot[data-date="${d}"][data-hour="${h}"]`);
  if (!td) return null;
  return {
    found: true,
    ghostClass: td.className.indexOf('slot-ghost') >= 0,
    hasSlot: !!td.dataset.slot,
    busy: typeof cellBusy === 'function' ? cellBusy(td) : null,
    text: (td.textContent || '').trim(),
  };
}, [date, hour]);

(async () => {
  const { chromium, exe } = requireBrowser();
  const server = await serve();
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  try {
    const { ctx, page } = await open(browser);

    console.log('\n[1] LMS·시드 칸이 «빈 칸» 으로 판정되는가');
    const lms = await cellAt(page, DAY_TUE, 15);
    const seed = await cellAt(page, DAY_TUE, 12);
    const real = await cellAt(page, DAY_TUE, 21);
    check('화요일 15시 LMS 칸이 그려졌다', !!lms && lms.found && lms.ghostClass, lms);
    check('화요일 12시 시드 칸이 그려졌다', !!seed && seed.found && seed.ghostClass, seed);
    check('화요일 21시 진짜 수업이 그려졌다', !!real && real.found && !real.ghostClass, real);
    check('🟡 LMS 칸은 cellBusy=false (수업을 넣을 수 있다)', !!lms && lms.busy === false, lms && lms.busy);
    check('🟡 시드 칸도 cellBusy=false', !!seed && seed.busy === false, seed && seed.busy);
    check('⛔ 진짜 수업 칸은 cellBusy=true (겹침 방어는 그대로)', !!real && real.busy === true, real && real.busy);

    console.log('\n[2] 그 칸을 «눌렀을 때» 무엇이 뜨는가  ← 코드만 봐서는 안 보이는 부분');
    const clickAndRead = async (date, hour) => {
      await page.evaluate(() => {                     // 앞 검사의 모달을 확실히 닫는다
        document.querySelectorAll('.modal-backdrop,.modal-wrap,#modal,.modal').forEach((m) => m.remove());
      });
      await page.click(`td.slot[data-date="${date}"][data-hour="${hour}"]`, { force: true }).catch(() => {});
      await page.waitForTimeout(500);
      return page.evaluate(() => (document.body.innerText || ''));
    };
    const afterLms = await clickAndRead(DAY_TUE, 15);
    check('🔴 LMS 칸을 누르면 「새 슬롯 추가」 가 뜬다',
      /새 슬롯 추가|Add Slots/.test(afterLms), afterLms.slice(0, 0));
    check('🔴 LMS 상세 모달이 그것을 덮어쓰지 않는다 (click 이 mouseup 뒤에 온다)',
      !/LMS 점유 표시|LMS occupancy marker/.test(afterLms));
    const afterReal = await clickAndRead(DAY_TUE, 21);
    check('⛔ 진짜 수업 칸은 예전대로 상세가 뜬다', /김연숙/.test(afterReal));

    console.log('\n[3] 미배정 학생 칩을 그 칸으로 끌면 «배정 가능» 으로 보이는가');
    /* ⚠️ conflictReason 은 IIFE 안이라 밖에서 못 부른다 — 대신 «사람이 보는 것»,
       즉 끌고 갔을 때 칸에 붙는 drop-target-ok / drop-target-bad 로 판정한다.
       (이쪽이 오히려 진짜 검사다 — 함수가 아니라 화면이 무엇을 말하는가) */
    /* 🪤 «미배정 학생» 패널은 기본이 «접힘»(left:-340px) 이다. 접힌 채로 칩 좌표를 잡으면
       마우스가 칩이 아니라 «칸» 을 잡아, 학생 배정이 아니라 빈칸 드래그선택이 돌아간다
       (실측: 칸에 'selecting' 만 붙고 drop-target-* 는 영영 안 붙는다). 먼저 연다. */
    await page.evaluate(() => {
      const p = document.querySelector('.pool-panel');
      if (p) p.classList.add('open');
    });
    await page.waitForTimeout(400);
    const dragOver = async (hour) => {
      const chip = await page.locator('.pool-chip').first().boundingBox();
      const cell = await page.locator(`td.slot[data-date="${DAY_TUE}"][data-hour="${hour}"]`).first().boundingBox();
      if (!chip || !cell) return { err: 'bbox 없음', chip: !!chip, cell: !!cell };
      await page.mouse.move(chip.x + chip.width / 2, chip.y + chip.height / 2);
      await page.mouse.down();
      await page.mouse.move(cell.x + cell.width / 2, cell.y + cell.height / 2, { steps: 8 });
      await page.mouse.move(cell.x + cell.width / 2, cell.y + cell.height / 2);
      await page.waitForTimeout(200);
      const cls = await page.evaluate(([d, h]) => {
        const td = document.querySelector(`td.slot[data-date="${d}"][data-hour="${h}"]`);
        return td ? td.className : null;
      }, [DAY_TUE, hour]);
      await page.mouse.move(2, 2);          // 칸 밖에서 놓는다 — 실제 배정은 하지 않는다
      await page.mouse.up();
      await page.waitForTimeout(200);
      return { cls: cls || '' };
    };
    const overLms = await dragOver(15);
    const overReal = await dragOver(21);
    check('🟡 LMS 칸 위에서는 «놓을 수 있음»(drop-target-ok)',
      !!overLms.cls && overLms.cls.includes('drop-target-ok'), overLms);
    check('⛔ 진짜 수업 칸 위에서는 «놓을 수 없음»(drop-target-bad)',
      !!overReal.cls && overReal.cls.includes('drop-target-bad'), overReal);

    console.log('\n[4] 빈칸 찾기(hourHasSlot) 가 LMS 시간을 «빈 시간» 으로 세는가');
    const probe = await page.evaluate(([d]) => ({
      loaded: Object.keys(SLOTS).length,          // 0 이면 아래 값이 전부 «가짜 통과» 다
      hourLms: hourHasSlot('24', d, 15),
      hourSeed: hourHasSlot('24', d, 12),
      hourReal: hourHasSlot('24', d, 21),
    }), [DAY_TUE]);
    check('시드가 실제로 실렸다 (0 이면 아래 검사는 무의미)', probe.loaded === SCHED.length, probe.loaded);
    check('🟡 빈칸 찾기 — LMS 시간은 «빈 시간»', probe.hourLms === false, probe.hourLms);
    check('🟡 빈칸 찾기 — 시드 시간도 «빈 시간»', probe.hourSeed === false, probe.hourSeed);
    check('⛔ 빈칸 찾기 — 진짜 수업 시간은 «찬 시간»', probe.hourReal === true, probe.hourReal);

    await ctx.close();
  } finally {
    await browser.close();
    if (server) server.kill();
  }
  console.log('\n' + '─'.repeat(58));
  console.log(FAIL === 0 ? `✅ ALL PASS (${PASS})` : `⚠ PASS ${PASS} / FAIL ${FAIL}`);
  process.exit(FAIL ? 1 : 0);
})().catch((e) => { console.error('실행 실패:', e && e.message); process.exit(2); });
