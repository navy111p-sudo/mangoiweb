// -*- coding: utf-8 -*-
// ✏️➕ 「오늘 수업」 피드백 칸 «고치기 · 추가» — 실제 브라우저 검사 (2026-10-28)
//
//   왜 — 매니저·강사 제안 3번 「오늘 피드백·지난 피드백을 고치고 추가하는 버튼」.
//   정적 하니스(eval_add_edit_buttons_harness)는 «조건이 세 화면에서 같은가» 를 본다.
//   여기서는 «실제로 눌렀을 때 무슨 요청이 나가는가» 와 «버튼이 보이는가(색이 카드 규칙에 안 눌리는가)» 를 본다.
//
//   무엇을 —
//     A. admin.html 의 「오늘 수업」 칸을 그대로 오려 와 진짜 CSS(admin-inline-c.css)·진짜 js/adm-today-classes.js 로 그린다.
//        API 는 가로채서 가짜 줄을 준다(학생 데이터에 손대지 않는다).
//     B. 「➕ 오늘 피드백 추가」 → 공용 창 → 빈 칸 저장 막힘 → 문자 + 한국어 없음 막힘 → 한국어로 만들기 → 저장
//        → 나간 본문(방 번호·날짜·notify_parent·teacher_uid) · 표를 다시 불러옴.
//     C. 「➕ 지난 피드백 추가」 → 서버 «지난 회차» 목록에서 고르기 · 고른 회차의 «자기 예약 번호» 방으로 저장 · 문자 칸 없음.
//     D. 「✏️ 고치기」 → 보기를 건너뛰고 곧장 고치기 화면 → PATCH 본문. 허락이 없으면 보기 + 이유(짝).
//     E. 저장을 두 번 눌러도 한 번만 나간다.
//
//   ⚠️ 자동으로 안 돕니다(manual/ 규약). 사람이 부릅니다:
//        mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
//        PW_DIR=/tmp/pw node test-harness/manual/eval-add-edit-browser.mjs
//      (웹 세션 컨테이너에는 playwright 가 이미 있어 PW_DIR 없이도 돈다)
import { readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireBrowser } from './_pw.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
const ADMIN = readFileSync(join(PUB, 'admin.html'), 'utf8');
const SHOT_DIR = process.env.SHOT_DIR || '';

let pass = 0, fail = 0;
const check = (n, ok, extra) => {
  if (ok) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ FAIL ' + n + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
};

// admin.html 의 「오늘 수업」 칸을 통째로 오린다(<details id="sm-today-classes"> … 짝 </details>)
function cutTodayBlock() {
  const i = ADMIN.indexOf('<details class="sub-item" id="sm-today-classes">');
  if (i < 0) return '';
  const re = /<details\b|<\/details>/g;
  re.lastIndex = i;
  let d = 0, m;
  while ((m = re.exec(ADMIN))) {
    if (m[0] === '</details>') { d--; if (d === 0) return ADMIN.slice(i, m.index + m[0].length); }
    else d++;
  }
  return '';
}
const block = cutTodayBlock().replace('<details class="sub-item" id="sm-today-classes">', '<details class="sub-item" id="sm-today-classes" open>');
check('전제: admin.html 의 오늘 수업 칸을 오려 냈다', block.length > 2000);
const cssVer = (ADMIN.match(/admin-inline-c\.css\?v=(\d+)/) || [])[1];
const jsVer = (ADMIN.match(/adm-today-classes\.js\?v=(\d+)/) || [])[1];

const PAGE = `<!doctype html><html data-admin-theme="ivory"><head><meta charset="utf-8">
<link rel="stylesheet" href="/css/admin-inline-c.css?v=${cssVer}">
<script>window.adminLang='en'; window.__ADM_ME={ role:'hq', username:'mgr_karl' };</script>
</head><body>
<details class="table-card menu-card" id="card-students-mgmt" open><summary>card</summary>${block}</details>
<script src="/js/adm-today-classes.js?v=${jsVer}"></script>
</body></html>`;

const TODAY = '2026-10-28';
const WEEK = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'];
const now = Date.parse('2026-10-28T16:00:00+09:00');
const row = (o) => Object.assign({
  class_date: TODAY, start_ts: now - 40 * 60000, end_ts: now - 20 * 60000, start_time: '15:20', end_time: '15:40',
  status: 'ended', source: 'mangoi', teacher_name: 'Kaye', academy: 'A학원', eval_hidden: false,
  attendance: { state: 'attended' }, teacher_entry: { state: 'on_time', at: now - 41 * 60000 },
  week_days: [true, false, true, false, true, false, false], week_dates: WEEK, last_eval: null, today_eval: null,
  // 서버(recentClassesFor)가 주는 «지난 회차» — 월·금은 요일마다 예약 번호가 다르다(요일당 1행)
  prev_classes: [{ date: '2026-10-26', room_id: 'class-6640-20261026', time: '15:20' }, { date: '2026-10-23', room_id: 'class-6642-20261023', time: '15:20' }],
}, o);
const ROWS = [
  row({ student_uid: 'stu_nofb', student_name: 'Mina', room_id: 'class-6648-20261028', schedule_id: 6648 }),
  row({ student_uid: 'stu_hasfb', student_name: 'Jun', room_id: 'class-7057-20261028', schedule_id: 7057,
        last_eval: { id: 41, date: '2026-10-26', text: 'Read well' }, today_eval: { id: 42, date: TODAY, text: 'Good' } }),
  row({ student_uid: 'stu_early', student_name: 'Ara', room_id: 'class-8000-20261028', schedule_id: 8000, status: 'early',
        start_ts: now + 3600000, end_ts: now + 4800000 }),
  row({ student_uid: 'stu_noprev', student_name: 'Bo', room_id: 'class-8100-20261028', schedule_id: 8100, prev_classes: [] }),
];

const { chromium, exe } = requireBrowser();
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const posts = [], patches = [];
let todayLoads = 0;
await page.route('**/*', async (route) => {
  const req = route.request();
  const u = new URL(req.url());
  const p = u.pathname;
  if (p === '/test') return route.fulfill({ contentType: 'text/html', body: PAGE });
  if (p.startsWith('/js/') || p.startsWith('/css/')) {
    try { return route.fulfill({ contentType: p.endsWith('.css') ? 'text/css' : 'text/javascript', body: readFileSync(join(PUB, p)) }); }
    catch { return route.fulfill({ status: 404, body: '' }); }
  }
  if (p === '/api/admin/classes/today') { todayLoads++; return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, date: TODAY, sessions: ROWS }) }); }
  if (p === '/api/translate') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, en: 'Mina read the story well.', ko: '민아는 이야기를 잘 읽었습니다.' }) });
  if (p === '/api/eval/manual-create') { posts.push(JSON.parse(req.postData() || '{}')); return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, id: 900 + posts.length, notify: { sent: ['01000000000'], failed: [] } }) }); }
  const m = /^\/api\/eval\/(\d+)$/.exec(p);
  if (m && req.method() === 'GET') {
    const id = +m[1];
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, can_edit: id !== 43,
      eval: { id, student_name: 'Jun', lesson_date: TODAY, note_en: 'Old note', note_ko: '예전 글입니다', parent_notified: 0 } }) });
  }
  if (m && req.method() === 'PATCH') { patches.push({ id: +m[1], body: JSON.parse(req.postData() || '{}') }); return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, id: +m[1], parent_notified: false }) }); }
  return route.fulfill({ status: 404, body: '' });
});
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto('http://mg.test/test');
await page.evaluate(() => window.tcLoadToday());
await page.waitForSelector('#tc-body table');

console.log('\n[A] 표 — 버튼이 보이는가');
const addToday = page.locator('[data-evq-new="today"][data-uid="stu_nofb"]');
const addLast = page.locator('[data-evq-new="last"][data-uid="stu_nofb"]');
check('A-1 글이 없는 줄: 「➕ Add today」·「➕ Add last」 둘 다 보인다', await addToday.isVisible() && await addLast.isVisible());
check('A-2 글이 있는 줄: 「✏️ Edit」 두 개(41·42), 추가 버튼 없음(짝)',
  await page.locator('[data-evq-fix="41"]').isVisible() && await page.locator('[data-evq-fix="42"]').isVisible()
  && (await page.locator('[data-evq-new][data-uid="stu_hasfb"]').count()) === 0);
check('A-3b 지난 회차 목록이 빈 줄: 지난 추가 없음 · 오늘 추가는 있음(짝)',
  (await page.locator('[data-evq-new="last"][data-uid="stu_noprev"]').count()) === 0
  && (await page.locator('[data-evq-new="today"][data-uid="stu_noprev"]').count()) === 1);
check('A-3 아직 시작 안 한 줄: 오늘 추가 없음 · 지난 추가는 있음(짝)',
  (await page.locator('[data-evq-new="today"][data-uid="stu_early"]').count()) === 0
  && (await page.locator('[data-evq-new="last"][data-uid="stu_early"]').count()) === 1);
const col = await addToday.evaluate((el) => { const c = getComputedStyle(el); return { fg: c.color, bg: c.backgroundColor, d: c.display }; });
check('A-4 추가 버튼 색이 카드 규칙(검정)에 안 눌린다 — 초록 글자·옅은 초록 바탕', col.fg === 'rgb(4, 120, 87)' && col.bg === 'rgb(236, 253, 243)', col);
const colE = await page.locator('[data-evq-fix="41"]').evaluate((el) => getComputedStyle(el).color);
check('A-5 고치기 버튼은 파랑', colE === 'rgb(29, 78, 216)', colE);
if (SHOT_DIR) {
  // 표가 넓어 피드백 칸은 가로 스크롤 오른쪽에 있다 — 그 칸이 보이게 밀고 찍는다
  mkdirSync(SHOT_DIR, { recursive: true });
  await addLast.scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(SHOT_DIR, 'table.png') });
}

console.log('\n[B] 「➕ 오늘 피드백 추가」');
const loadsBefore = todayLoads;
await addToday.click();
await page.waitForSelector('#mg-evq [data-evq-save]');
check('B-1 공용 창이 쓰기 화면으로 열린다(날짜 칸 없음)', (await page.locator('#mg-evq [data-evq-date]').count()) === 0);
await page.click('#mg-evq [data-evq-save]');
check('B-2 빈 채로 저장 → 막고 말한다', /Write the feedback first/.test(await page.locator('#mg-evq [data-evq-msg]').innerText()) && posts.length === 0);
await page.fill('#mg-evq [data-evq-f="note_en"]', 'Mina read the story well');
await page.check('#mg-evq [data-evq-sms]');
await page.click('#mg-evq [data-evq-save]');
check('B-3 문자 + 한국어 없음 → 막는다', /Make the Korean/.test(await page.locator('#mg-evq [data-evq-msg]').innerText()) && posts.length === 0);
await page.click('#mg-evq [data-evq-tr]');
await page.waitForFunction(() => document.querySelector('#mg-evq [data-evq-f="note_ko"]').value.length > 0);
check('B-4 「한국어로 만들기」가 두 칸을 채운다', (await page.inputValue('#mg-evq [data-evq-f="note_ko"]')) === '민아는 이야기를 잘 읽었습니다.'
  && (await page.inputValue('#mg-evq [data-evq-f="note_en"]')) === 'Mina read the story well.');
if (SHOT_DIR) await page.locator('#mg-evq .evq-box').screenshot({ path: join(SHOT_DIR, 'create-today.png') });
await page.click('#mg-evq [data-evq-save]');
await page.waitForSelector('#mg-evq [data-evq-open]');
const p1 = posts[0] || {};
check('B-5 한 번 저장했다', posts.length === 1, posts.length);
check('B-6 그 수업의 방 번호·날짜로', p1.room_id === 'class-6648-20261028' && p1.lesson_date === TODAY, p1);
check('B-7 문자를 고른 그대로(notify_parent=true)', p1.notify_parent === true);
check('B-8 teacher_uid 는 비운다(매니저가 강사인 척하지 않는다) · teacher_name 은 수업 강사', p1.teacher_uid === null && p1.teacher_name === 'Kaye', p1);
check('B-9 점수는 보내지 않는다', !Object.keys(p1).some((k) => /^score_/.test(k)));
check('B-10 결과 화면이 문자 결과를 말한다', /Text sent/.test(await page.locator('#mg-evq').innerText()));
await page.waitForFunction((n) => true, loadsBefore);
check('B-11 저장 뒤 표를 다시 불러온다', todayLoads > loadsBefore, { before: loadsBefore, after: todayLoads });
await page.click('#mg-evq [data-evq-close]');

console.log('\n[C] 「➕ 지난 피드백 추가」');
await page.locator('[data-evq-new="last"][data-uid="stu_nofb"]').click();
await page.waitForSelector('#mg-evq [data-evq-pick]');
const opts = await page.$$eval('#mg-evq [data-evq-pick] option', (os) => os.map((o) => o.textContent));
check('C-1 서버가 준 지난 회차가 날짜(요일)·시각으로 보이고, 가장 최근이 골라져 있다',
  opts.join('|') === '2026-10-26 (Mon) 15:20|2026-10-23 (Fri) 15:20' && (await page.inputValue('#mg-evq [data-evq-pick]')) === '0', opts);
check('C-2 문자 칸·날짜 짐작 칸이 없다', (await page.locator('#mg-evq [data-evq-sms]').count()) === 0 && (await page.locator('#mg-evq input[type="date"]').count()) === 0);
await page.fill('#mg-evq [data-evq-f="note_en"]', 'Practised vowels');
if (SHOT_DIR) await page.locator('#mg-evq .evq-box').screenshot({ path: join(SHOT_DIR, 'create-last.png') });
await page.click('#mg-evq [data-evq-save]');
await page.waitForSelector('#mg-evq [data-evq-open]');
const p2 = posts[1] || {};
check('C-3 고른 회차(월요일)의 «자기 예약 번호» 방으로 저장 — 오늘 방 번호를 빌리지 않는다',
  p2.room_id === 'class-6640-20261026' && p2.lesson_date === '2026-10-26', p2);
check('C-4 문자는 안 보낸다', p2.notify_parent === false);
check('C-5 문자를 안 골랐으면 문자 결과 줄이 없다(짝)', !/Text sent|No parent phone/.test(await page.locator('#mg-evq').innerText()));
await page.click('#mg-evq [data-evq-close]');
// 다른 회차를 고르면 그 회차의 방으로
await page.locator('[data-evq-new="last"][data-uid="stu_nofb"]').click();
await page.waitForSelector('#mg-evq [data-evq-pick]');
await page.selectOption('#mg-evq [data-evq-pick]', '1');
await page.fill('#mg-evq [data-evq-f="note_en"]', 'Friday class');
await page.click('#mg-evq [data-evq-save]');
await page.waitForSelector('#mg-evq [data-evq-open]');
const p3 = posts[2] || {};
check('C-6 금요일을 고르면 금요일 예약 번호 방(class-6642)', p3.room_id === 'class-6642-20261023' && p3.lesson_date === '2026-10-23', p3);
await page.click('#mg-evq [data-evq-close]');
// 짝: 회차 목록이 없으면 창 자체가 안 열린다
await page.evaluate(() => window.mgEvalQuick.create({ which: 'last', student_uid: 'x', class_date: '2026-10-28', room_id: 'class-1-20261028', prev_classes: [] }, { en: true }));
check('C-7 고를 회차가 없으면 «지난» 창을 안 연다(짝)', (await page.locator('#mg-evq').count()) === 0);

console.log('\n[D] 「✏️ 고치기」');
await page.locator('[data-evq-fix="42"]').click();
await page.waitForSelector('#mg-evq [data-evq-f="note_en"]');
check('D-1 보기를 건너뛰고 곧장 고치기 화면', (await page.locator('#mg-evq [data-evq-save]').count()) === 1
  && (await page.inputValue('#mg-evq [data-evq-f="note_en"]')) === 'Old note');
await page.fill('#mg-evq [data-evq-f="note_en"]', 'Fixed by manager');
await page.click('#mg-evq [data-evq-save]');
await page.waitForFunction(() => /Saved/.test(document.getElementById('mg-evq').innerText));
check('D-2 바뀐 칸만 PATCH 로', patches.length === 1 && patches[0].id === 42 && JSON.stringify(patches[0].body) === JSON.stringify({ note_en: 'Fixed by manager' }), patches);
await page.click('#mg-evq [data-evq-close]');
// 짝 — 허락이 없는 글(43)은 보기 화면 + 이유
await page.evaluate(() => window.mgEvalQuick(43, { en: true, edit: true }));
await page.waitForFunction(() => /View only/.test((document.getElementById('mg-evq') || {}).innerText || ''));
check('D-3 허락이 없으면 고치기 화면이 아니라 «보기 전용» 이유(짝)', (await page.locator('#mg-evq [data-evq-save]').count()) === 0);
await page.click('#mg-evq [data-evq-close]');

console.log('\n[E] 두 번 눌러도 한 번');
await page.evaluate(() => window.mgEvalQuick.create({ which: 'today', student_uid: 'stu_x', student_name: 'X', room_id: 'class-1-20261028', class_date: '2026-10-28' }, { en: true }));
await page.fill('#mg-evq [data-evq-f="note_en"]', 'Twice');
const before = posts.length;
await page.evaluate(() => { const b = document.querySelector('#mg-evq [data-evq-save]'); b.click(); b.disabled = false; b.click(); });
await page.waitForSelector('#mg-evq [data-evq-open]');
check('E-1 저장 요청은 한 번', posts.length === before + 1, posts.length - before);

console.log('\n[F] 키보드');
await page.click('#mg-evq [data-evq-close]');
await page.locator('[data-evq-fix="41"]').focus();
await page.keyboard.press('Enter');
await page.waitForSelector('#mg-evq [data-evq-f="note_en"]');
check('F-1 Enter 로도 연다(role=button)', true);

check('페이지 오류 없음', errs.length === 0, errs);
await browser.close();
console.log('\n결과: PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
