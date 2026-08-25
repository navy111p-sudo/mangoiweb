#!/usr/bin/env node
/**
 * 🖥 매니저 「오늘 전체 수업」 카드 — 진짜 브라우저 실측 (2026-08-25)
 *
 * 왜 사람이 불러야 하나
 *   문자열 하니스는 «그 코드가 있는가» 만 본다. 이 카드에서 틀릴 수 있는 것은
 *   «어떻게 그려졌는가» 다 — 카페24 줄에 입장 버튼이 붙었는지, 첫 화면에 요청이
 *   늘지 않았는지, 좁은 폰에서 표가 넘치지 않는지. 그건 그려 봐야 안다.
 *
 * 실행
 *   mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
 *   PW_DIR=/tmp/pw node test-harness/manual/manager-today-classes-browser.mjs
 *
 * ⚠️ manual/ 규약 — 파일명이 *_harness.mjs 가 아니라 게이트가 물어가지 않는다. 사람이 부른다.
 */
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright, findChromium } from './_pw.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const PUB = join(__dir, '../../cloudflare-deploy/public');
const PW = process.env.PW_DIR || '/tmp/pw';

// 공용 로더를 쓴다 — 다른 manual 하니스와 같은 방식(경로·버전 차이를 여기서 흡수한다)
const pw = loadPlaywright();
const EXE = findChromium();
if (!pw || !EXE) {
  console.log('⏭ playwright-core 또는 Chromium 을 못 찾아 건너뜁니다.');
  console.log('   mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core');
  process.exit(0);
}
const chromium = pw.chromium;

let PASS = 0, FAIL = 0; const FAILS = [];
const check = (label, ok, extra = '') => {
  if (ok) { PASS++; console.log('  ✅ ' + label + (extra ? '  ' + extra : '')); }
  else { FAIL++; FAILS.push(label); console.log('  ⚠ FAIL ' + label + (extra ? '  ' + extra : '')); }
};

// ── 로컬 정적 서버 (배포되는 그 파일을 그대로 그린다) ─────────────────────────
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
               '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const f = join(PUB, p === '/' ? '/manager.html' : p);
  if (!existsSync(f) || !f.startsWith(PUB)) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(8893, r));

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
/* ⚠️ isMobile 은 켜지 않는다 — 그 문맥은 레이아웃 뷰포트가 어긋나 «멀쩡한 버튼이 안 눌린다» 는
   거짓 실패를 만든다(CLAUDE.md 2장). 폭만 좁히면 반응형 확인에는 충분하다. */
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

// ── API 스텁 — 카페24 2건(입장 불가) + 망고아이 2건(1건 입장 가능) ────────────
const TODAY = {
  ok: true, today: '2026-08-25', date: '2026-08-25', is_today: true, now: Date.now(),
  count: 4,
  counts: { mangoi: 2, cafe24: 2, joinable: 1 },
  sessions: [
    { source: 'mangoi', observable: true, room_id: 'class-11-20260825', student_name: '홍민수',
      teacher_name: 'HANNAH', start_time: '21:30', start_ts: Date.now(), status: 'live',
      join_open: true, level: 'BTS 1', textbook: 'BTS 1', textbook_assigned: true, is_level_test: false },
    { source: 'mangoi', observable: true, room_id: 'class-12-20260825', student_name: '김하나',
      teacher_name: null, start_time: '22:00', start_ts: Date.now() + 36e5, status: 'early',
      join_open: false, level: null, textbook: null, textbook_assigned: false, is_level_test: false },
    { source: 'cafe24', observable: false, room_id: 'c24-5511327', student_name: 'Ahn Si-woo',
      teacher_name: 'Teacher Hera', start_time: '16:30', start_ts: Date.now() - 6e5, status: 'live',
      join_open: false, level: null, textbook: null, textbook_assigned: false, is_level_test: false },
    { source: 'cafe24', observable: false, room_id: 'c24-5506662', student_name: 'Kim Ji-yu',
      teacher_name: 'Teacher Cindy', start_time: '16:40', start_ts: Date.now() - 3e5, status: 'live',
      join_open: false, level: 'BTS 2', textbook: null, textbook_assigned: false, is_level_test: false },
  ],
};
let apiCalls = [];
await page.route('**/api/**', async (route) => {
  const u = new URL(route.request().url());
  apiCalls.push(u.pathname + u.search);
  const send = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  if (u.pathname === '/api/admin/classes/today') return send(TODAY);
  if (u.pathname === '/api/admin/me') return send({ ok: true, username: 'mgr_melca', scope_type: 'hq', name: 'Melca' });
  if (u.pathname === '/api/admin/stats/today') return send({ ok: true, date: '2026-08-25', revenue: { amount_krw: 0 } });
  if (u.pathname === '/api/admin/exec/summary') return send({ ok: true });
  return send({ ok: true });
});

console.log('\n🖥 매니저 「오늘 전체 수업」 — 브라우저 실측\n');
console.log('── 1. 첫 화면 계약 (API 2회 · 카드는 안 부른다) ──');
await page.goto('http://127.0.0.1:8893/manager.html', { waitUntil: 'networkidle' });
const firstPaintCalls = apiCalls.slice();
check('① 첫 화면에서 오늘수업 API 를 부르지 않는다  ← «펼칠 때만» 계약',
  !firstPaintCalls.some((u) => u.startsWith('/api/admin/classes/today')),
  '[첫 화면 호출: ' + firstPaintCalls.length + '건]');

console.log('\n── 2. 펼치면 그려지는가 ──');
await page.evaluate(() => { const d = document.getElementById('hqCards'); if (d) d.hidden = false; });
const card = page.locator('#c-today');
check('② 카드가 화면에 있다', await card.count() === 1);
await page.evaluate(() => { document.getElementById('c-today').open = true; });
await page.waitForFunction(() => {
  const el = document.getElementById('todayAllBody');
  return el && /c24-|class-/.test(el.textContent || '');
}, null, { timeout: 5000 }).catch(() => {});
const bodyTxt = await page.locator('#todayAllBody').innerText();
check('③ 펼친 뒤 오늘수업 API 를 부른다', apiCalls.some((u) => u.startsWith('/api/admin/classes/today')));
check('④ 네 줄이 다 그려진다', ['홍민수', '김하나', 'Ahn Si-woo', 'Kim Ji-yu'].every((n) => bodyTxt.includes(n)));
check('⑤ 요약에 카페24 건수가 따로 나온다', /카페24 2건|2 on cafe24/.test(bodyTxt));

console.log('\n── 3. 🔴 카페24 줄에 입장 버튼이 붙으면 안 된다 ──');
const rowInfo = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('#todayAllBody .row')];
  return rows.map((r) => ({
    text: r.innerText.replace(/\s+/g, ' ').trim(),
    join: !!r.querySelector('a[onclick*="taJoin"]'),
    lms: /LMS/.test(r.innerText),
  }));
});
const c24Rows = rowInfo.filter((r) => r.lms);
const mgRows = rowInfo.filter((r) => !r.lms);
check('⑥ 카페24 줄 2개가 「LMS」로 표시된다', c24Rows.length === 2);
check('⑦ 카페24 줄에는 입장 버튼이 없다  ← 아무도 없는 방으로 보내지 않는다',
  c24Rows.every((r) => !r.join));
check('⑧ 입장 가능한 망고아이 줄에는 입장 버튼이 있다', mgRows.filter((r) => r.join).length === 1);
check('⑨ 아직 시간이 안 된 줄에는 입장 버튼이 없다', mgRows.filter((r) => !r.join).length === 1);

console.log('\n── 4. 학생 정보 한 줄 (보고서 ①) ──');
check('⑩ 교재 미배정이 눈에 띄게 표시된다  (3줄)',
  (bodyTxt.match(/교재 미배정|no textbook/g) || []).length === 3);
check('⑪ 배정된 교재는 이름이 그대로 나온다', bodyTxt.includes('BTS 1'));
check('⑫ 강사 미배정이 경고색으로 표시된다', /미배정|unassigned/.test(bodyTxt));
const warnColor = await page.evaluate(() => {
  const el = [...document.querySelectorAll('#todayAllBody .row span')]
    .find((s) => /미배정|unassigned/.test(s.textContent) && !/교재/.test(s.textContent));
  return el ? getComputedStyle(el).color : '';
});
check('⑬ 그 경고가 회색이 아니다  [' + warnColor + ']', /^rgb\(180, 83, 9\)|^rgb\(18[0-9]/.test(warnColor));

console.log('\n── 5. 좁은 화면에서 넘치지 않는가 (390px) ──');
const narrow = await ctx.newPage();
await narrow.route('**/api/**', async (route) => {
  const u = new URL(route.request().url());
  const send = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  if (u.pathname === '/api/admin/classes/today') return send(TODAY);
  if (u.pathname === '/api/admin/me') return send({ ok: true, username: 'mgr_melca', scope_type: 'hq' });
  return send({ ok: true });
});
await narrow.setViewportSize({ width: 390, height: 844 });
await narrow.goto('http://127.0.0.1:8893/manager.html', { waitUntil: 'networkidle' });
await narrow.evaluate(() => {
  const d = document.getElementById('hqCards'); if (d) d.hidden = false;
  document.getElementById('c-today').open = true;
});
await narrow.waitForFunction(() => /c24-|홍민수/.test(document.getElementById('todayAllBody')?.textContent || ''), null, { timeout: 5000 }).catch(() => {});
const of = await narrow.evaluate(() => ({
  doc: document.documentElement.scrollWidth, win: window.innerWidth,
  /* 줄이 낱글자로 쪼개지지 않았나 — 높이 ÷ 줄높이 로 «몇 줄인가» 를 센다 (CLAUDE.md 2장) */
  worst: Math.max(...[...document.querySelectorAll('#todayAllBody .row')].map((r) => {
    const lh = parseFloat(getComputedStyle(r).lineHeight) || 18;
    return Math.round(r.getBoundingClientRect().height / lh);
  })),
}));
check(`⑭ 문서가 가로로 넘치지 않는다  [${of.doc} ≤ ${of.win}]`, of.doc <= of.win);
check(`⑮ 한 줄이 3줄 이상으로 쪼개지지 않는다  [최대 ${of.worst}줄]`, of.worst <= 3);

await browser.close(); server.close();
console.log('\n─────────────────────────────────────────────');
console.log(`  ✅ PASS ${PASS}    ⚠ FAIL ${FAIL}   (총 ${PASS + FAIL})`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach((f) => console.log('   · ' + f)); }
console.log('─────────────────────────────────────────────\n');
process.exit(FAIL ? 1 : 0);
