#!/usr/bin/env node
/**
 * 🖥 취소한 수업이 «사라지지 않고» 「취소 · 연기」 로 보이는가 — 진짜 브라우저 실측 (2026-11-03)
 *
 * 왜 사람이 불러야 하나
 *   서버 쪽은 class_cancelled_visible_harness(게이트)가 실제 핸들러로 잰다. 여기서 재는 것은 «어떻게 그려졌나» —
 *   관리자 표에 새 칸이 상태 옆에 붙었는지(th·td 짝), 취소 줄에 입장·참관·초대·연기 버튼이 «없는지»,
 *   색이 카드 규칙에 눌리지 않았는지(조상 id 로 이기는가), 매니저 간단히/자세히, 강사 주간·월간, KO/EN.
 *
 * 실행 (manual/ 규약 — 게이트가 물어 가지 않는다. 사람이 부른다)
 *   node test-harness/manual/cancelled-visible-browser.mjs            # 스크린샷: SHOT_DIR (기본 OS 임시폴더)
 */
import http from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadPlaywright, findChromium } from './_pw.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const PUB = join(__dir, '../../cloudflare-deploy/public');
const SHOT = process.env.SHOT_DIR || join(tmpdir(), 'cancelled-visible-shots');
mkdirSync(SHOT, { recursive: true });
const pw = loadPlaywright(); const EXE = findChromium();
if (!pw || !EXE) { console.log('⏭ playwright 또는 Chromium 을 못 찾아 건너뜁니다.'); process.exit(0); }

let PASS = 0, FAIL = 0;
const check = (label, ok, extra = '') => {
  if (ok) { PASS++; console.log('  ✅ ' + label + (extra ? '  ' + extra : '')); }
  else { FAIL++; console.log('  ⚠ FAIL ' + label + (extra ? '  ' + extra : '')); }
};

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const f = join(PUB, p === '/' ? '/admin.html' : p);
  if (!f.startsWith(PUB) || !existsSync(f)) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port;

// ── 씨앗 — 서버(api-admin.ts classes/today)가 내려주는 모양 그대로 ──
const NOW = Date.now();
const KST_TODAY = new Date(NOW + 9 * 3600e3).toISOString().slice(0, 10);
const base = (over) => Object.assign({ source: 'mangoi', observable: true, academy: '망고아이 본원', contact_phone: null,
  textbook_assigned: true, textbook: 'BTS 1', level: 'Lv 3', is_level_test: false, class_date: KST_TODAY,
  duration_min: 20, can_move: true, can_split: false, cancelled: false, postponed: false, holiday: false, change: null }, over);
const SESSIONS = [
  base({ schedule_id: 101, room_id: 'class-101-x', student_uid: 'hong', student_name: '홍길동', teacher_name: 'KAYE',
    start_time: '13:40', start_ts: NOW + 5 * 60e3, end_ts: NOW + 25 * 60e3, status: 'open', join_open: true,
    change: { kind: 'moved', via: 'postpone', from_date: '2026-11-04', from_time: '11:00', at: NOW, at_kst: '11/03 09:10', by: 'Melca (본사 매니저)', reason: null,
      label_ko: '📅 11/04 11:00 에서 연기됨', label_en: '📅 Postponed from 11/04 11:00' } }),
  base({ schedule_id: 4327, room_id: 'class-4327-x', student_uid: 'lby01', student_name: 'lby01', teacher_name: 'BELLE',
    start_time: '14:00', start_ts: NOW + 25 * 60e3, end_ts: NOW + 45 * 60e3, status: 'cancelled', join_open: false, observable: false,
    can_move: false, cancelled: true, attendance: { state: 'cancelled' }, teacher_entry: { state: 'cancelled' },
    change: { kind: 'cancelled', at: NOW, at_kst: '11/02 14:22', by: 'Maimai (본사 매니저)', reason: '학생 사정으로 취소',
      label_ko: '✕ 취소됨', label_en: '✕ Cancelled' } }),
  base({ schedule_id: 103, room_id: 'class-103-x', student_uid: 'jeong', student_name: 'Jeong', teacher_name: 'BELLE',
    start_time: '15:00', start_ts: NOW + 85 * 60e3, end_ts: NOW + 105 * 60e3, status: 'postponed', join_open: false, postponed: true,
    attendance: { state: 'postponed' }, teacher_entry: { state: 'postponed' },
    change: { kind: 'postponed', at: NOW, at_kst: '11/03 08:30', by: 'Mai', reason: null, label_ko: '⏸ 연기됨 — 새 날짜 미정', label_en: '⏸ Postponed — no new date' } }),
  // 짝 — 이동 칩은 있고 «취소·연기» 는 없는 평범한 줄(폰에서 «글자 칸이 이름 칸을 빼앗지 않는가» 를 이 줄과 견준다)
  base({ schedule_id: 105, room_id: 'class-105-x', student_uid: 'plain', student_name: '평범학생', teacher_name: 'KAYE',
    start_time: '15:20', start_ts: NOW + 105 * 60e3, end_ts: NOW + 125 * 60e3, status: 'early', join_open: false }),
  base({ schedule_id: null, source: 'cafe24', observable: false, room_id: 'c24-1', student_uid: 'c24s', student_name: '카페24학생', teacher_name: 'Teacher Hera',
    start_time: '16:00', start_ts: NOW + 145 * 60e3, end_ts: NOW + 165 * 60e3, status: 'early', join_open: false, can_move: false }),
];
const TODAY_BODY = { ok: true, today: KST_TODAY, date: KST_TODAY, is_today: true, now: NOW, count: SESSIONS.length, sessions: SESSIONS,
  contact_source: 'lookup', change_history: 'ok', counts: { mangoi: 4, cafe24: 1, joinable: 1, cancelled: 1, postponed: 1, moved: 1 } };

const browser = await pw.chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
const errs = [];
async function newPage(w, h, init) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript(init || (() => {}));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(String(e.message || e).slice(0, 200)));
  await page.route('**/api/**', (route) => {
    const u = new URL(route.request().url());
    const send = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (u.pathname === '/api/admin/classes/today') return send(TODAY_BODY);
    if (u.pathname === '/api/admin/me') return send({ ok: true, username: 'admin', role: 'hq_exec', scope_type: 'hq', name: 'Admin' });
    if (u.pathname === '/api/teacher/portal') return send(teacherBody(u));
    return send({ ok: true });
  });
  return page;
}

// ════ 1. 관리자 「오늘 수업」 ════
console.log('\n🖥 1. 관리자(admin.html) 「오늘 수업」');
const adminInit = () => { try { localStorage.setItem('mangoi_admin_welcome_v1_done', '1'); localStorage.setItem('mangoi_admin_session', JSON.stringify({ username: 'admin', role: 'hq_exec' })); localStorage.setItem('mangoi_lang', 'ko'); } catch (e) {} };
const ap = await newPage(1600, 1000, adminInit);
await ap.goto(BASE + '/admin.html', { waitUntil: 'domcontentloaded' });
await ap.waitForFunction(() => typeof window.tcLoadToday === 'function', null, { timeout: 20000 }).catch(() => {});
await ap.evaluate(() => { if (typeof jumpToMenu === 'function') jumpToMenu('card-students-mgmt'); });
await ap.waitForTimeout(400);
await ap.evaluate(() => { const d = document.getElementById('sm-today-classes'); if (d) d.open = true; return window.tcLoadToday(); });
await ap.waitForFunction(() => /lby01/.test((document.getElementById('tc-body') || {}).textContent || ''), null, { timeout: 8000 }).catch(() => {});
const A = await ap.evaluate(() => {
  const ths = [...document.querySelectorAll('#tc-body thead th')].map(t => t.textContent.replace(/[↕▲▼]/g, '').trim());
  const rows = [...document.querySelectorAll('#tc-body tbody tr')];
  const row = (n) => rows.find(r => r.textContent.includes(n));
  const cx = row('lby01'), mv = row('홍길동'), pp = row('Jeong');
  const pill = cx && cx.querySelector('span.tc-st-cancelled');
  const tds = cx ? [...cx.children] : [];
  const op = (el) => el ? Number(getComputedStyle(el).opacity) : -1;
  return {
    ths, tdCounts: rows.map(r => r.children.length),
    cxClass: cx ? cx.className : '', cxText: cx ? cx.innerText.replace(/\s+/g, ' ') : '',
    cxBtns: cx ? ['.tc-act-enter', '.tc-act-observe', '.tc-act-invite', '.tc-move-pin', '.tc-restore-pin', '.tc-sub-act'].filter(s => cx.querySelector(s)) : ['no-row'],
    cxMsg: !!(cx && cx.querySelector('.tc-msg-pin')),
    pillColor: pill ? getComputedStyle(pill).color : '', pillBg: pill ? getComputedStyle(pill).backgroundColor : '',
    changeCell: tds[3] ? tds[3].innerText.replace(/\s+/g, ' ') : '', statusCell: tds[2] ? tds[2].innerText : '',
    opStatus: op(tds[2]), opChange: op(tds[3]), opStudent: op(tds[4]),
    mvChange: mv ? mv.children[3].innerText.replace(/\s+/g, ' ') : '', mvJoin: !!(mv && mv.querySelector('.tc-act-enter')),
    ppChange: pp ? pp.children[3].innerText.replace(/\s+/g, ' ') : '',
    cnt: (document.getElementById('tc-count') || {}).textContent || '',
    chips: [...document.querySelectorAll('.tc-st-chip')].map(c => c.textContent.trim()),
  };
});
const iSt = A.ths.indexOf('상태');
check('A1 머리글: 「상태」 바로 옆에 「취소 · 연기」', iSt >= 0 && A.ths[iSt + 1] === '취소 · 연기', JSON.stringify(A.ths.slice(0, 6)));
check('A2 th 수 = 모든 줄의 td 수(칸이 밀리지 않는다)', A.tdCounts.length > 0 && A.tdCounts.every(n => n === A.ths.length), A.ths.length + ' / ' + JSON.stringify(A.tdCounts));
check('A3 🔑 취소한 수업이 표에 남는다(흐린 줄 tc-row-cancelled)', /tc-row-cancelled/.test(A.cxClass), A.cxClass);
check('A4 상태 배지 «✕ 취소됨»', /✕ 취소됨/.test(A.statusCell), A.statusCell);
check('A5 「취소 · 연기」 칸: 취소됨 · 누가 · 언제 · 사유', /✕ 취소됨/.test(A.changeCell) && /Maimai/.test(A.changeCell) && /11\/02 14:22/.test(A.changeCell) && /학생 사정/.test(A.changeCell), A.changeCell);
check('A6 ⛔ 취소 줄에는 입장·참관·초대·연기·대체강사 버튼이 없다', A.cxBtns.length === 0, JSON.stringify(A.cxBtns));
check('A7 «✕ 취소된 수업 — 입장 없음» 이 글자로 보인다', /취소된 수업 — 입장 없음/.test(A.cxText));
check('A8 취소 배지 색이 카드 규칙에 안 눌린다(빨강 글자 · 분홍 바탕)', A.pillColor === 'rgb(180, 35, 24)' && A.pillBg === 'rgb(253, 236, 234)', A.pillColor + ' / ' + A.pillBg);
check('A9 흐림: 학생 칸은 흐리고 상태·취소연기 칸은 또렷', A.opStudent < 0.8 && A.opStatus === 1 && A.opChange === 1, JSON.stringify({ st: A.opStatus, ch: A.opChange, stu: A.opStudent }));
check('A10 옮겨 온 수업: «📅 11/04 11:00 에서 연기됨» · 입장 버튼은 그대로', /11\/04 11:00 에서 연기됨/.test(A.mvChange) && A.mvJoin, A.mvChange);
check('A11 연기 줄: «⏸ 연기됨 — 새 날짜 미정»', /연기됨 — 새 날짜 미정/.test(A.ppChange), A.ppChange);
check('A12 머리 줄 건수에 «취소 1건 · 연기 1건»', /취소 1건/.test(A.cnt) && /연기 1건/.test(A.cnt), A.cnt);
check('A13 상태 칩에 «✕ 취소됨 1»', A.chips.some(c => /✕ 취소됨 1/.test(c)), JSON.stringify(A.chips));
await ap.locator('#tc-body').screenshot({ path: join(SHOT, 'admin-today-ko.png') }).catch(() => {});
// EN
await ap.evaluate(() => { window.adminLang = 'en'; try { localStorage.setItem('mangoi_lang', 'en'); } catch (e) {} return window.tcLoadToday(); });
await ap.waitForTimeout(500);
const AE = await ap.evaluate(() => ({
  ths: [...document.querySelectorAll('#tc-body thead th')].map(t => t.textContent.replace(/[↕▲▼]/g, '').trim()),
  cx: ([...document.querySelectorAll('#tc-body tbody tr')].find(r => r.textContent.includes('lby01')) || {}).innerText || '',
}));
check('A14 EN: 머리글 «Cancelled · Postponed» · 줄 «✕ Cancelled — no class»', AE.ths.includes('Cancelled · Postponed') && /✕ Cancelled — no class/.test(AE.cx) && /✕ Cancelled/.test(AE.cx), JSON.stringify(AE.ths.slice(0, 5)));
await ap.locator('#tc-body').screenshot({ path: join(SHOT, 'admin-today-en.png') }).catch(() => {});

// ════ 2. 매니저 화면 ════
console.log('\n🖥 2. 매니저(manager.html) 「오늘 전체 수업」');
for (const detail of [false, true]) {
  const mp = await newPage(1280, 900, detail ? () => { try { localStorage.setItem('mgr_today_detail', '1'); localStorage.setItem('mangoi_lang', 'ko'); } catch (e) {} } : () => { try { localStorage.setItem('mgr_today_detail', '0'); localStorage.setItem('mangoi_lang', 'ko'); } catch (e) {} });
  await mp.goto(BASE + '/manager.html', { waitUntil: 'networkidle' });
  await mp.evaluate(() => { const d = document.getElementById('hqCards'); if (d) d.hidden = false; document.getElementById('c-today').open = true; });
  await mp.waitForFunction(() => /lby01/.test(document.getElementById('todayAllBody')?.textContent || ''), null, { timeout: 6000 }).catch(() => {});
  const M = await mp.evaluate(() => {
    const rows = [...document.querySelectorAll('#todayAllBody .row')];
    const cx = rows.find(r => r.textContent.includes('lby01')), mv = rows.find(r => r.textContent.includes('홍길동'));
    return { n: rows.length, cxClass: cx ? cx.className : '', cxText: cx ? cx.innerText.replace(/\s+/g, ' ') : '',
      cxJoin: !!(cx && cx.querySelector('a[onclick*="taJoin"], [data-ta]')), mvText: mv ? mv.innerText.replace(/\s+/g, ' ') : '',
      head: (document.querySelector('#todayAllBody .muted') || {}).textContent || '' };
  });
  const v = detail ? '자세히' : '간단히';
  check('M1 ' + v + ': 취소 줄이 남고 흐린 줄(ta-cx)', /ta-cx/.test(M.cxClass), M.cxClass);
  check('M2 ' + v + ': «✕ 취소됨» 이 보인다', /✕ 취소됨/.test(M.cxText), M.cxText.slice(0, 120));
  check('M3 ' + v + ': ⛔ 취소 줄에 입장·연기 버튼 없음', !M.cxJoin);
  check('M4 ' + v + ': 옮겨 온 줄에 «11/04 11:00 에서 연기됨»', /11\/04 11:00 에서 연기됨/.test(M.mvText), M.mvText.slice(0, 120));
  if (detail) check('M5 자세히: 누가·언제·사유까지', /Maimai/.test(M.cxText) && /11\/02 14:22/.test(M.cxText) && /학생 사정/.test(M.cxText), M.cxText.slice(0, 200));
  check('M6 ' + v + ': 머리 줄 «취소 1건 · 연기 1건»', /취소 1건/.test(M.head) && /연기 1건/.test(M.head), M.head.slice(0, 120));
  await mp.locator('#todayAllBody').screenshot({ path: join(SHOT, 'manager-' + (detail ? 'detail' : 'simple') + '.png') }).catch(() => {});
  await mp.context().close();
}

// 폰 폭 — 간단히 보기 6칸 격자가 가로로 넘치지 않는가(매니저 대부분이 폰으로 본다)
{
  const np = await newPage(390, 844, () => { try { localStorage.setItem('mgr_today_detail', '0'); localStorage.setItem('mangoi_lang', 'ko'); } catch (e) {} });
  await np.goto(BASE + '/manager.html', { waitUntil: 'networkidle' });
  await np.evaluate(() => { const d = document.getElementById('hqCards'); if (d) d.hidden = false; document.getElementById('c-today').open = true; });
  await np.waitForFunction(() => /lby01/.test(document.getElementById('todayAllBody')?.textContent || ''), null, { timeout: 6000 }).catch(() => {});
  const of = await np.evaluate(() => {
    const box = document.getElementById('todayAllBody');
    const cx = [...box.querySelectorAll('.row')].find(r => r.textContent.includes('lby01'));
    const tag = cx && cx.querySelector('.ta-st .tag');
    const r = tag ? tag.getBoundingClientRect() : null;
    /* 🪤 «넘치지 않는다» 만 보면 글자 칸이 이름 칸을 0 폭으로 눌러도 통과한다(실제로 밟음) — 이름·강사 칸의 폭을 짝으로 잰다. */
    const w = (row, i) => { const el = row && row.children[i]; return el ? Math.round(el.getBoundingClientRect().width) : 0; };
    const mv = [...box.querySelectorAll('.row')].find(r => r.textContent.includes('홍길동'));
    return { doc: document.documentElement.scrollWidth, win: innerWidth, tagVis: !!(r && r.width > 0 && r.right <= innerWidth + 1),
      mvName: w(mv, 1), mvTeacher: w(mv, 3), cxName: w(cx, 1),
      plName: w([...box.querySelectorAll('.row')].find(r => r.textContent.includes('평범학생')), 1),
      plTeacher: w([...box.querySelectorAll('.row')].find(r => r.textContent.includes('평범학생')), 3) };
  });
  check('M7 폰 390px: 간단히 보기가 가로로 넘치지 않고 «취소됨» 이 화면 안에 보인다', of.doc <= of.win && of.tagVis, JSON.stringify(of));
  check('M8 폰 390px: «취소·연기» 글자가 이름·강사 칸 폭을 빼앗지 않는다(같은 이동 칩이 있는 평범한 줄과 같은 폭)',
    of.plName > 0 && Math.abs(of.mvName - of.plName) <= 1 && Math.abs(of.mvTeacher - of.plTeacher) <= 1 && of.cxName >= of.plName, JSON.stringify(of));
  await np.locator('#todayAllBody').screenshot({ path: join(SHOT, 'manager-simple-390.png') }).catch(() => {});
  await np.context().close();
}

// 지사(branch.html) — 같은 서버 값, 자세히 줄 하나뿐인 화면. 지사 계정에는 서버가 누가·사유를 안 싣는다(그대로 비워 둔다).
{
  const bp = await newPage(1280, 900, () => { try { localStorage.setItem('mangoi_lang', 'ko'); } catch (e) {} });
  await bp.goto(BASE + '/branch.html', { waitUntil: 'networkidle' });
  await bp.evaluate(() => { const d = document.getElementById('c-today'); if (d) d.open = true; if (typeof loadTodayAll === 'function') loadTodayAll(); });
  await bp.waitForFunction(() => /lby01/.test(document.getElementById('todayAllBody')?.textContent || ''), null, { timeout: 6000 }).catch(() => {});
  const B = await bp.evaluate(() => {
    const rows = [...document.querySelectorAll('#todayAllBody .row')];
    const cx = rows.find(r => r.textContent.includes('lby01'));
    return { cls: cx ? cx.className : '', txt: cx ? cx.innerText.replace(/\s+/g, ' ') : '', join: !!(cx && cx.querySelector('a[onclick*="taJoin"]')),
      head: (document.querySelector('#todayAllBody .muted') || {}).textContent || '' };
  });
  check('B1 지사: 취소 줄이 남고 «취소 · 연기: ✕ 취소됨» · 입장 없음', /ta-cx/.test(B.cls) && /취소 · 연기: ✕ 취소됨/.test(B.txt) && !B.join, B.txt.slice(0, 140));
  check('B2 지사: 머리 줄 «취소 1건»', /취소 1건/.test(B.head), B.head.slice(0, 120));
  await bp.locator('#todayAllBody').screenshot({ path: join(SHOT, 'branch-detail.png') }).catch(() => {});
  await bp.context().close();
}

// ════ 3. 강사 화면 — 주간·월간 ════
console.log('\n🖥 3. 강사(teacher.html) 주간·월간 시간표');
function kstMonday() { const d = new Date(Date.now() + 9 * 3600e3); const wd = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - wd); return d.toISOString().slice(0, 10); }
function addDays(ymd, n) { const d = new Date(ymd + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function tItem(id, date, time, over) {
  const st = Date.parse(date + 'T' + time + ':00+09:00');
  return Object.assign({ kind: 'class', id, schedule_id: id, teacher_id: '2', date, class_date: date, room_id: 'class-' + id + '-' + date.replace(/-/g, ''),
    start_ts: st, start_time: time, duration_min: 20, level: 'Lv 3', student_uid: 'stu' + id, student_name: '학생' + id,
    class_kind: 'regular', is_level_test: false, status: 'early', attendance: { state: 'not_yet' } }, over || {});
}
function teacherBody(u) {
  const mon = kstMonday();
  const days = []; for (let i = 0; i < 7; i++) { const d = addDays(mon, i); days.push({ date: d, dow: new Date(d + 'T00:00:00Z').getUTCDay(), is_today: d === KST_TODAY, items: [] }); }
  const di = days.findIndex(d => d.is_today) >= 0 ? days.findIndex(d => d.is_today) : 0;
  days[di].items.push(tItem(201, days[di].date, '13:00'));
  days[di].items.push(tItem(4327, days[di].date, '14:00', { student_name: 'lby01', class_state: 'cancelled', status: 'cancelled', attendance: { state: 'cancelled' } }));
  const d2 = days[(di + 1) % 7];
  d2.items.push(tItem(4400, d2.date, '10:00', { student_name: '취소학생', class_state: 'cancelled', status: 'cancelled', attendance: { state: 'cancelled' } }));
  if (u.searchParams.get('part') === 'month') {
    const ym = u.searchParams.get('month');
    const last = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate();
    const md = []; for (let i = 1; i <= last; i++) { const d = ym + '-' + String(i).padStart(2, '0'); md.push({ date: d, dow: new Date(d + 'T00:00:00Z').getUTCDay(), is_today: d === KST_TODAY, items: [] }); }
    const t = md.find(d => d.date === KST_TODAY) || md[0];
    t.items.push(tItem(201, t.date, '13:00'), tItem(4327, t.date, '14:00', { student_name: 'lby01', class_state: 'cancelled', status: 'cancelled' }));
    return { ok: true, now: Date.now(), today: KST_TODAY, me: { identity_unlinked: false, identity_ambiguous: false, is_manager: false }, month: { month: ym, days: md } };
  }
  const today = days[di].items.map(it => Object.assign({}, it, { class_state: it.class_state || 'scheduled', open_at_ts: it.start_ts - 6e5, close_at_ts: it.start_ts + 21e5,
    enter_from_ts: it.start_ts - 432e5, enter_until_ts: it.start_ts + 432e5, end_ts: it.start_ts + 12e5 }));
  return { ok: true, now: Date.now(), today: KST_TODAY, me: { name: 'BELLE', username: 'belle', lang: 'ko' },
    classes: today, upcoming: [], notices: [], resources: [], rating: {}, week: { start: mon, end: addDays(mon, 6), days } };
}
const tp = await newPage(1280, 1000, () => { try { localStorage.removeItem('mangoi_teacher_portal_v1'); localStorage.setItem('mangoi_lang', 'ko'); localStorage.setItem('mangoi_teacher_sched_view', 'week'); } catch (e) {} window.alert = function () {}; });
await tp.goto(BASE + '/teacher.html', { waitUntil: 'networkidle' });
await tp.waitForFunction(() => /lby01/.test(document.getElementById('week')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
await tp.evaluate(() => { const c = document.getElementById('c-week'); if (c) { c.hidden = false; c.open = true; } });
await tp.waitForTimeout(300);
const W = await tp.evaluate(() => {
  const items = [...document.querySelectorAll('#week .wk-i')];
  const cx = items.find(i => i.textContent.includes('lby01'));
  const nx = items.find(i => i.textContent.includes('취소학생'));
  return { n: items.length, cxClass: cx ? cx.className : '', cxText: cx ? cx.innerText.replace(/\s+/g, ' ') : '', nxText: nx ? nx.innerText.replace(/\s+/g, ' ') : '',
    cxOp: cx ? Number(getComputedStyle(cx).opacity) : -1, cxDeco: cx ? getComputedStyle(cx.querySelector('b')).textDecorationLine : '',
    cxFeedbackBtn: !!(cx && cx.querySelector('[data-week-eval]')) };
});
check('T1 🔑 주간 시간표: 취소한 수업이 남는다(wk-cx)', /wk-cx/.test(W.cxClass), W.cxClass);
check('T2 «✕ 취소됨» 배지 + 기록 줄 «취소됨»', /✕ 취소됨/.test(W.cxText) && /취소됨/.test(W.cxText), W.cxText.slice(0, 120));
check('T3 흐림·시간 취소선', W.cxOp < 0.8 && /line-through/.test(W.cxDeco), JSON.stringify({ op: W.cxOp, deco: W.cxDeco }));
check('T4 ⛔ 취소 회차엔 «피드백 작성» 버튼 없음', !W.cxFeedbackBtn);
check('T5 다른 날 취소 회차도 남는다', /취소학생/.test(W.nxText) && /취소됨/.test(W.nxText), W.nxText.slice(0, 80));
await tp.locator('#week').screenshot({ path: join(SHOT, 'teacher-week.png') }).catch(() => {});
await tp.evaluate(() => { const b = document.getElementById('wk-mode-month'); if (b) b.click(); });
await tp.waitForFunction(() => document.querySelector('#month .mo-i'), null, { timeout: 6000 }).catch(() => {});
const Mo = await tp.evaluate(() => {
  const it = [...document.querySelectorAll('#month .mo-i')].find(i => (i.getAttribute('title') || '').includes('lby01'));
  const cell = it && it.closest('.mo-c');
  return { cls: it ? it.className : '', title: it ? it.getAttribute('title') : '', deco: it ? getComputedStyle(it).textDecorationLine : '',
    badge: cell ? ((cell.querySelector('.mo-n') || {}).textContent || '0') : '' };
});
check('T6 월간 달력: 취소 회차가 남는다(.cx · 취소선 · 제목 «취소됨»)', /\bcx\b/.test(Mo.cls) && /line-through/.test(Mo.deco) && /취소됨/.test(Mo.title), JSON.stringify(Mo));
check('T7 월간 배지 수는 «열리는 수업» 만 센다(취소 제외 → 1)', Mo.badge === '1', 'badge=' + Mo.badge);
await tp.locator('#month').screenshot({ path: join(SHOT, 'teacher-month.png') }).catch(() => {});

check('Z 페이지 스크립트 오류 0건', errs.length === 0, JSON.stringify(errs.slice(0, 3)));
await browser.close(); server.close();
console.log('\n📷 스크린샷: ' + SHOT);
console.log(`결과: PASS ${PASS} / FAIL ${FAIL}`);
process.exit(FAIL ? 1 : 0);
