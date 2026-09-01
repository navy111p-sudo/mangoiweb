/* 🪞 카페24 수업 «겹쳐 보기» 가 진짜로 그려지는가 — 진짜 Chromium 으로 확인 (2026-08-31)
 *
 * [왜 이 검사가 따로 필요한가]
 *   문자열 하니스(c24_mirror_harness I절)는 「그 코드가 있는가」까지만 본다.
 *   이번 건에서 정작 중요한 것은 «카드가 화면에 실제로 나타나는가» 와
 *   «그 카드가 진짜 수업을 건드리지 않는가» 인데, 둘 다 브라우저에서만 보인다.
 *   (CLAUDE.md — 「열렸다」와 「보인다」는 다르다 / 좌표가 틀린 버그는 문자열로 안 잡힌다)
 *
 * [무엇을 확인하나]
 *   ① 카페24 카드가 캘린더에 실제로 그려진다 (.ph54-c24)
 *   ② 그 카드가 «카페24» 배지와 «카페24에만 있음» 을 화면 글자로 말한다
 *   ③ 🔴 드래그 불가 — draggable 속성이 없다 (끌면 엉뚱한 수업에 PATCH 가 나간다)
 *   ④ 🔴 data-idx 가 없다 — 진짜 수업 배열의 인덱스와 섞이지 않는다
 *   ⑤ 이미 망고아이에 있는 수업(already/conflict)은 겹쳐 그리지 않는다
 *   ⑥ 진짜 수업 카드는 그대로 드래그 가능하다 (겹쳐 그리기가 원래 기능을 안 깬다)
 *   ⑦ 체크박스를 끄면 카페24 카드가 사라진다
 *   ⑧ 성적표를 못 읽으면 «없다» 가 아니라 «못 읽었다» 고 적는다
 *   ⑨ 글자가 읽힌다 — 카드 배경과 글자색 대비 4.5:1 이상
 *
 * [돌리는 법]  README 규약 그대로 — 게이트는 이 파일을 물어 가지 않는다(사람이 부른다).
 *   mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
 *   cd <repo> && PW_DIR=/tmp/pw node test-harness/manual/c24-overlay-browser.mjs
 *
 * ⚠️ 서버(D1·Neo4j)에 아무것도 쓰지 않는다 — fetch 를 가로채 가짜 응답을 물린다.
 */
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireBrowser } from './_pw.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = Number(process.env.C24_PORT || 8931);
const BASE = `http://127.0.0.1:${PORT}`;

let PASS = 0, FAIL = 0;
const check = (n, ok, why) => {
  if (ok) { PASS++; console.log('  OK   ' + n); }
  else { FAIL++; console.log('  FAIL ' + n + (why !== undefined ? ' — ' + JSON.stringify(why) : '')); }
};

async function serve() {
  try { const r = await fetch(BASE + '/admin.html', { method: 'HEAD' }); if (r.ok) return null; } catch { /* 아직 */ }
  const p = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: PUBLIC, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 250));
    try { const r = await fetch(BASE + '/admin.html', { method: 'HEAD' }); if (r.ok) return p; } catch { /* 아직 */ }
  }
  p.kill();
  throw new Error('정적 서버를 못 띄웠습니다: ' + PUBLIC);
}

/* 이번 주 화요일(KST) — 화면이 보고 있는 주와 같아야 카드가 그려진다 */
const KST = 9 * 3600 * 1000;
const k = new Date(Date.now() + KST);
const monday = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()) - ((k.getUTCDay() + 6) % 7) * 86400000);
const iso = (d) => d.toISOString().slice(0, 10);
const TUE = iso(new Date(monday.getTime() + 86400000));
/* 🔴 (2026-09-01) «지난 수업» 이 「미러를 켜면 만들어집니다」 라고 말하던 것을 막는다.
   이번 주 월요일이 오늘이면 지난 날짜가 이번 주에 없으므로, 그때만 어제를 쓴다. */
const TODAY = iso(new Date(Date.now() + KST));
const PAST = iso(new Date(monday.getTime())) < TODAY ? iso(new Date(monday.getTime())) : null;

/* 망고아이에 «이미 있는» 진짜 수업 하나 (드래그 가능해야 한다) */
const SCHED = [{ id: 901, teacher_id: '24', date: TUE, start_time: '21:00', type: '1on1', duration_min: 20,
                 students: [{ name: '김연숙', uid: 'stu_kys' }] }];

/* 그림자 성적표 — 판정 5종을 섞어 넣는다.
   그려야 하는 것: ok · not_whitelisted · no_student (망고아이에 아직 행이 없음)
   그리면 안 되는 것: already · conflict (이미 진짜 카드로 그려진다) · no_teacher (놓을 칸을 모른다) */
const MIRROR = {
  ok: true, mode: 'off', since: iso(monday), until: iso(new Date(monday.getTime() + 6 * 86400000)),
  total: 6, summary: {}, by_state: { '1': 6 }, by_date: [],
  rows: [
    { class_id: 'c1', date: TUE, start_time: '15:00', duration_min: 30, class_state: 1, teacher_id: '24', teacher_name: 'HANNAH', student_uid: 'zee',  student_name: 'Zee',  verdict: 'not_whitelisted' },
    { class_id: 'c2', date: TUE, start_time: '16:00', duration_min: 20, class_state: 1, teacher_id: '24', teacher_name: 'HANNAH', student_uid: 'kes',  student_name: 'Kes',  verdict: 'ok' },
    { class_id: 'c3', date: TUE, start_time: '17:00', duration_min: 20, class_state: 1, teacher_id: '24', teacher_name: 'HANNAH', student_uid: 'sid',  student_name: null,   verdict: 'no_student' },
    { class_id: 'c4', date: TUE, start_time: '21:00', duration_min: 20, class_state: 1, teacher_id: '24', teacher_name: 'HANNAH', student_uid: 'stu_kys', student_name: '김연숙', verdict: 'conflict' },
    { class_id: 'c5', date: TUE, start_time: '19:00', duration_min: 20, class_state: 1, teacher_id: '24', teacher_name: 'HANNAH', student_uid: 'aaa',  student_name: 'AAA',  verdict: 'already' },
    { class_id: 'c6', date: TUE, start_time: '11:00', duration_min: 20, class_state: 1, teacher_id: null, teacher_name: null,     student_uid: 'bbb',  student_name: 'BBB',  verdict: 'not_whitelisted' },
  ].concat(PAST ? [{ class_id: 'c7', date: PAST, start_time: '10:00', duration_min: 20, class_state: 1,
                     teacher_id: '24', teacher_name: 'HANNAH', student_uid: 'past1', student_name: '지난학생', verdict: 'ok' }] : []),
};

async function open(browser, opt = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  const page = await ctx.newPage();
  await page.route('**/api/**', async (route) => {
    const u = route.request().url();
    const j = (o, s = 200) => route.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(o) });
    if (u.includes('/api/admin/reports/c24-mirror')) {
      if (opt.mirrorFail) return j({ ok: false, error: 'c24_unreachable' }, 502);
      return j(MIRROR);
    }
    if (u.includes('/api/admin/teachers')) return j({ ok: true, items: [{ id: '24', name: 'HANNAH' }] });
    if (u.includes('/api/admin/schedules')) return j({ ok: true, schedules: SCHED });
    if (u.includes('/api/admin/me')) return j({ ok: true, username: 'admin', role: 'hq', scope: { type: 'hq' } });
    return j({ ok: true, items: [], schedules: [], events: [] });
  });
  /* 🪤 첫 방문자 오버레이(#aw-overlay)는 클릭·스크롤을 통째로 막는다 — 본 것으로 표시(CLAUDE.md 2장) */
  await page.addInitScript(() => {
    try { localStorage.setItem('mangoi_admin_welcome_v1_done', '1'); } catch (e) {}
    try { localStorage.setItem('ph54_c24_overlay', '1'); } catch (e) {}
  });
  await page.goto(BASE + '/admin.html?_=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.ph54Open === 'function' || document.getElementById('ph54-sched-wrap'), { timeout: 30000 }).catch(() => {});
  return { ctx, page };
}

/* 캘린더 카드를 그린다 — 화면의 정본 경로(ph54Open)가 없으면 렌더 함수라도 부른다 */
async function renderCalendar(page) {
  await page.evaluate(() => {
    const el = document.getElementById('card-teacher-schedule') || document.getElementById('ph54-sched-wrap');
    if (el && el.tagName === 'DETAILS') el.open = true;
    if (typeof window.jumpToMenu === 'function') { try { window.jumpToMenu('card-teacher-schedule'); } catch (e) {} }
  });
  await page.waitForSelector('#ph54-sched-wrap .ph54-ev, #ph54-sched-wrap #ph54-cal', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1200);
}

const relLum = (rgb) => {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
};
const parseRgb = (s) => (String(s).match(/[\d.]+/g) || []).slice(0, 3).map(Number);

(async () => {
  const { chromium, exe } = requireBrowser();
  const srv = await serve();
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  try {
    const { ctx, page } = await open(browser);
    await renderCalendar(page);

    const info = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('#ph54-sched-wrap .ph54-c24'));
      const real = Array.from(document.querySelectorAll('#ph54-sched-wrap .ph54-ev:not(.ph54-c24)'));
      const cs = cards[0] ? getComputedStyle(cards[0]) : null;
      return {
        n: cards.length,
        texts: cards.map((c) => c.textContent.replace(/\s+/g, ' ').trim()),
        drag: cards.map((c) => c.getAttribute('draggable')),
        idx: cards.map((c) => c.getAttribute('data-idx')),
        blk: cards.map((c) => c.getAttribute('data-block')),
        boxes: cards.map((c) => { const r = c.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; }),
        realDrag: real.map((c) => c.getAttribute('draggable')),
        realN: real.length,
        color: cs ? cs.color : '', bg: cs ? cs.backgroundColor : '',
        legend: (document.querySelector('#ph54-sched-wrap .ph54-legend') || {}).textContent || '',
      };
    });

    console.log('\n[ ①② 그려지는가 · 사실을 말하는가 ]');
    // 앞으로 것 3장(ok·not_whitelisted·no_student) + 지난 것 1장(넣었을 때만)
    check('카페24 카드가 «앞으로 3장 + 지난 것» 만큼 그려졌다', info.n === 3 + (PAST ? 1 : 0), info.n);
    check('카드에 «카페24» 배지가 있다', info.texts.every((t) => t.includes('카페24')), info.texts);
    /* ⚠️ 문구가 «지난 것» 과 «앞으로 것» 으로 갈렸으므로 전부 같은 말을 기대하면 안 된다.
       앞으로 것만 «카페24에만 있음» 이고, 지난 것은 ⑩절에서 따로 본다. */
    const ahead = info.texts.filter((t) => !t.includes('지난 수업'));
    check('앞으로 것은 «카페24에만 있음» 이라고 말한다',
      ahead.length === 3 && ahead.every((t) => t.includes('카페24에만 있음')), ahead);
    check('학생 이름이 보인다 (Zee·Kes)', info.texts.join(' ').includes('Zee') && info.texts.join(' ').includes('Kes'));
    check('카드가 실제로 크기를 가진다 (숨겨져 있지 않다)', info.boxes.every((b) => b.w > 20 && b.h >= 20), info.boxes);

    console.log('\n[ ③④ 진짜 수업을 안 건드린다 ]');
    check('🔴 카페24 카드는 draggable 이 아니다', info.drag.every((d) => d === null), info.drag);
    check('🔴 카페24 카드에 data-idx 가 없다', info.idx.every((d) => d === null), info.idx);
    check('카페24 카드에 data-block 이 없다(누르면 삭제되지 않는다)', info.blk.every((d) => d === null), info.blk);
    check('진짜 수업 카드는 그대로 드래그된다', info.realN >= 1 && info.realDrag.some((d) => d === 'true'), { realN: info.realN, realDrag: info.realDrag });

    console.log('\n[ ⑤ 두 번 보이지 않는다 ]');
    check('이미 있는 수업(already·conflict)은 겹쳐 그리지 않는다',
      !info.texts.join(' ').includes('김연숙') && !info.texts.join(' ').includes('AAA'), info.texts);
    check('강사를 못 이은 것(BBB)은 아무 칸에나 놓지 않는다', !info.texts.join(' ').includes('BBB'), info.texts);
    check('범례가 카페24 건수를 따로 센다', /카페24/.test(info.legend), info.legend.slice(0, 200));

    console.log('\n[ ⑩ 지난 수업은 «만들어집니다» 라고 말하지 않는다 ]');
    if (!PAST) {
      console.log('  --   오늘이 이번 주 월요일이라 «지난 날짜» 가 이번 주에 없다 — 건너뜀');
    } else {
      const past = await page.evaluate(() => {
        const c = Array.from(document.querySelectorAll('#ph54-sched-wrap .ph54-c24'))
          .find((x) => /지난학생/.test(x.textContent));
        return c ? { text: c.textContent.replace(/\s+/g, ' ').trim(), title: c.getAttribute('title') || '' } : null;
      });
      check('⑩ 지난 카드가 그려진다(감추지 않는다)', !!past, past);
      check('🔴 ⑩ 「미러를 켜면 만들어집니다」 가 없다', !!past && !/만들어집니다/.test(past.title), past && past.title);
      check('⑩ 「지난 수업 (카페24 기록)」 이라고 말한다', !!past && /지난 수업 \(카페24 기록\)/.test(past.text), past && past.text);
      check('⑩ 왜 안 생기는지 이유를 적는다', !!past && /오늘부터만 만들므로/.test(past.title), past && past.title);
      const legend = await page.evaluate(() => (document.querySelector('#ph54-sched-wrap .ph54-legend') || {}).textContent || '');
      check('🔴 ⑩ 건수를 «대기» 와 «지난 기록» 으로 갈라 센다',
        /카페24 대기/.test(legend) && /지난 카페24 기록/.test(legend), legend.slice(-160));
    }

    console.log('\n[ ⑨ 글자가 읽히는가 (WCAG 4.5:1) ]');
    {
      const fg = parseRgb(info.color), bg = parseRgb(info.bg);
      const L1 = relLum(fg), L2 = relLum(bg);
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      check('카드 글자 대비 4.5:1 이상', ratio >= 4.5, { fg: info.color, bg: info.bg, ratio: Math.round(ratio * 100) / 100 });
    }

    console.log('\n[ ⑦ 끄면 사라진다 ]');
    await page.evaluate(() => { const t = document.getElementById('ph54-c24-toggle'); if (t) { t.checked = false; t.dispatchEvent(new Event('change')); } });
    await page.waitForTimeout(900);
    const offN = await page.evaluate(() => document.querySelectorAll('#ph54-sched-wrap .ph54-c24').length);
    check('체크박스를 끄면 카페24 카드가 0장', offN === 0, offN);
    const stillReal = await page.evaluate(() => document.querySelectorAll('#ph54-sched-wrap .ph54-ev').length);
    check('끈 뒤에도 진짜 수업 카드는 남는다', stillReal >= 1, stillReal);
    await ctx.close();

    console.log('\n[ ⑧ 못 읽으면 «못 읽었다» 고 적는다 ]');
    const bad = await open(browser, { mirrorFail: true });
    await renderCalendar(bad.page);
    const hint = await bad.page.evaluate(() => Array.from(document.querySelectorAll('#ph54-sched-wrap .ph54-hint')).map((h) => h.textContent).join(' | '));
    check('실패 사유가 화면에 적힌다', /읽지 못했습니다/.test(hint), hint.slice(0, 200));
    check('실패해도 진짜 수업은 그려진다',
      (await bad.page.evaluate(() => document.querySelectorAll('#ph54-sched-wrap .ph54-ev:not(.ph54-c24)').length)) >= 1);
    await bad.ctx.close();
  } finally {
    await browser.close().catch(() => {});
    if (srv) srv.kill();
  }
  console.log(`\n${'─'.repeat(52)}`);
  console.log(`  PASS ${PASS} / FAIL ${FAIL}`);
  console.log(`${'─'.repeat(52)}\n`);
  process.exit(FAIL ? 1 : 0);
})();
