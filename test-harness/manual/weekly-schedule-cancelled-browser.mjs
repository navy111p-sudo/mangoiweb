#!/usr/bin/env node
/**
 * 🖥 관리자 «주간 시간표» 에서 취소·연기한 수업이 «사라지지 않고» 회색으로 남는가 — 진짜 브라우저 실측 (2026-11-03)
 *
 * 왜 사람이 불러야 하나
 *   서버(/api/admin/schedules 의 off_items)는 class_cancelled_visible_harness(게이트) G절이 실제 핸들러로 잰다.
 *   여기서 재는 것은 «어떻게 그려졌나» — 일간 칸·주간 막대·툴팁·통계, 그리고 «그 칸이 수업 칸처럼 굴지 않는가»
 *   (data-slot 없음 → 끌기·우클릭·삭제 불가, cellBusy=false → 눌러서 새 수업을 넣을 수 있다).
 *
 * 실행 (manual/ 규약 — 게이트가 물어 가지 않는다. 사람이 부른다)
 *   node test-harness/manual/weekly-schedule-cancelled-browser.mjs     # 스크린샷: SHOT_DIR (기본 OS 임시폴더)
 */
import http from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadPlaywright, findChromium } from './_pw.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const PUB = join(__dir, '../../cloudflare-deploy/public');
const SHOT = process.env.SHOT_DIR || join(tmpdir(), 'weekly-cancelled-shots');
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
  const f = join(PUB, p);
  if (!f.startsWith(PUB) || !existsSync(f)) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port;

// ── 이번 주(KST) — 화면은 브라우저 시간대(아래 Asia/Seoul)로 이번 주 월요일을 잡는다 ──
const kst = new Date(Date.now() + 9 * 3600e3);
const dow = (kst.getUTCDay() + 6) % 7;            // 월=0
const mon = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() - dow));
const D = (i) => new Date(mon.getTime() + i * 864e5).toISOString().slice(0, 10);
const TUE = D(1), WED = D(2);

const TEACHERS = [{ id: 1, name: 'BELLE', name_en: 'BELLE', category: 'office' }, { id: 2, name: 'KAYE', name_en: 'KAYE', category: 'office' }];
const ITEMS = [
  { id: 501, move_version: 'v1', teacher_id: 1, hour: 15, start_time: '15:00', type: '1on1', origin: 'class', students: [{ name: '홍길동', uid: 'hong' }],
    duration_min: 20, note: '', move_field: 'scheduled_date', date: TUE, start_date: TUE, end_date: TUE,
    change: { kind: 'moved', via: 'postpone', from_date: '2026-11-04', from_time: '11:00', at: 1, at_kst: '11/03 09:10', by: 'Melca (본사 매니저)', reason: null,
      label_ko: '📅 11/04 11:00 에서 연기됨', label_en: '📅 Postponed from 11/04 11:00' } },
  { id: 502, move_version: 'v1', teacher_id: 2, hour: 11, start_time: '11:00', type: '1on1', origin: 'class', students: [{ name: '새학생', uid: 'newstu' }],
    duration_min: 20, note: '', move_field: 'scheduled_date', date: WED, start_date: WED, end_date: WED },
];
const OFF = [
  { off: 'cancelled', teacher_id: 1, date: TUE, hour: 14, start_time: '14:00', type: '1on1', students: [{ name: '이병엽', uid: 'lby01' }], duration_min: 20, note: '',
    change: { kind: 'cancelled', at: 1, at_kst: '11/02 14:22', by: 'Maimai (본사 매니저)', reason: '학생 사정으로 취소', from_date: null, from_time: null, via: null, label_ko: '✕ 취소됨', label_en: '✕ Cancelled' } },
  { off: 'postponed', teacher_id: 1, date: TUE, hour: 16, start_time: '16:00', type: '1on1', students: [{ name: 'Jeong', uid: 'jeong' }], duration_min: 20, note: '',
    change: { kind: 'postponed', at: 1, at_kst: '11/03 08:30', by: 'Mai', reason: null, from_date: null, from_time: null, via: null, label_ko: '⏸ 연기됨 — 새 날짜 미정', label_en: '⏸ Postponed — no new date' } },
  // 같은 자리에 새 수업(502)이 이미 들어 있다 — 진짜 수업이 이겨야 한다
  { off: 'cancelled', teacher_id: 2, date: WED, hour: 11, start_time: '11:00', type: '1on1', students: [{ name: '옛학생', uid: 'oldstu' }], duration_min: 20, note: '',
    change: { kind: 'cancelled', at: 1, at_kst: '11/01 10:00', by: null, reason: null, from_date: null, from_time: null, via: null, label_ko: '✕ 취소됨', label_en: '✕ Cancelled' } },
];

const browser = await pw.chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
const errs = [];
async function open(schedBody, lang = 'ko') {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, timezoneId: 'Asia/Seoul' });
  await ctx.addInitScript((l) => { try { localStorage.setItem('mangoi_lang', l); localStorage.setItem('mangoi_lang_by', 'user'); } catch (e) {} }, lang);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(String(e.message || e).slice(0, 200)));
  // ⚠️ 포괄 스텁을 «먼저», 구체적인 것을 «뒤에» — 나중에 등록한 것이 이긴다(CLAUDE.md 2장)
  await page.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, items: [], events: [] }) }));
  await page.route('**/api/admin/teachers', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, teachers: TEACHERS }) }));
  await page.route('**/api/admin/schedules?**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(schedBody) }));
  await page.goto(BASE + '/admin/weekly-schedule.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.render === 'function' && document.querySelector('#main .tl-scroll'), null, { timeout: 15000 });
  return { ctx, page };
}

// ═══ 1. 일간 뷰 ═══
console.log('\n═ 1. 일간 뷰(작업면) — 화요일 ═');
const body = { ok: true, week: D(0), count: ITEMS.length, items: ITEMS, schedules: ITEMS, off_items: OFF, off_complete: true };
let { ctx, page } = await open(body);
await page.evaluate(() => { viewMode = 'day'; curDow = 1; render(); });
const cx = await page.evaluate(() => {
  const tds = [...document.querySelectorAll('td.slot.slot-off')];
  const c = tds.find(td => /이병엽/.test(td.textContent));
  const p = tds.find(td => /Jeong/.test(td.textContent));
  const cs = c && getComputedStyle(c);
  return {
    n: tds.length,
    cText: c && c.textContent, cHasSlot: c && c.hasAttribute('data-slot'), cHasOff: c && c.hasAttribute('data-off'),
    cBusy: c ? window.cellBusy(c) : null, cTid: c && c.dataset.tid, cMin: c && (c.dataset.hour + ':' + c.dataset.min),
    cBgImg: cs && cs.backgroundImage, cDeco: cs && cs.textDecorationLine, cColor: cs && cs.color, cW: c && c.getBoundingClientRect().width,
    pText: p && p.textContent, pCls: p && p.className, pDeco: p && getComputedStyle(p).textDecorationLine,
    liveHong: !![...document.querySelectorAll('td.slot[data-slot]')].find(td => /홍길동/.test(td.textContent)),
  };
});
check('1-1 취소 칸이 «사라지지 않고» 회색 칸으로 남는다(✕ 이병엽)', /✕\s*이병엽/.test(cx.cText || ''), JSON.stringify({ n: cx.n, t: cx.cText }));
check('1-2 ⛔ 취소 칸에는 data-slot 이 없다(끌기·우클릭·삭제·상세가 안 붙는다) — data-off 만', cx.cHasSlot === false && cx.cHasOff === true);
check('1-3 그 시간은 «빈 시간» — cellBusy=false · 칸 계약(data-tid/hour/min) 그대로', cx.cBusy === false && cx.cTid === '1' && cx.cMin === '14:0', JSON.stringify({ b: cx.cBusy, t: cx.cTid, m: cx.cMin }));
check('1-4 취소 칸은 빗금 바탕 + 취소선 + 어두운 글자(밝은 화면에서 읽힌다)', /gradient/.test(cx.cBgImg || '') && /line-through/.test(cx.cDeco || '') && cx.cColor === 'rgb(71, 84, 103)', JSON.stringify({ bg: (cx.cBgImg || '').slice(0, 40), d: cx.cDeco, c: cx.cColor }));
check('1-5 20분 = 10분 칸 2개 폭(colspan)', cx.cW > 25, 'w=' + cx.cW);
check('1-6 연기 칸 = ⏸ · 취소선 없음 · slot-off-postponed', /⏸\s*Jeong/.test(cx.pText || '') && /slot-off-postponed/.test(cx.pCls || '') && !/line-through/.test(cx.pDeco || ''), JSON.stringify({ t: cx.pText, d: cx.pDeco }));
check('1-7 짝: 진짜 수업(홍길동)은 그대로 수업 칸(data-slot)', cx.liveHong === true);

// 같은 자리에 새 수업이 들어 있으면 진짜 수업이 이긴다
await page.evaluate(() => { curDow = 2; render(); });
const wed = await page.evaluate(() => ({
  live: [...document.querySelectorAll('td.slot[data-slot]')].some(td => /새학생/.test(td.textContent)),
  oldOff: [...document.querySelectorAll('td.slot.slot-off')].some(td => /옛학생/.test(td.textContent)),
}));
check('1-8 같은 시각에 새 수업이 있으면 새 수업이 보이고 옛 취소 칸은 가려진다', wed.live === true && wed.oldOff === false, JSON.stringify(wed));
await page.evaluate(() => { curDow = 1; render(); });
await page.screenshot({ path: join(SHOT, 'day-ko.png'), fullPage: false });

// ═══ 2. 툴팁 ═══
console.log('\n═ 2. 마우스를 올리면 ═');
async function hoverText(re) {
  const box = await page.evaluate((src) => {
    const td = [...document.querySelectorAll('td.slot')].find(t => new RegExp(src).test(t.textContent));
    if (!td) return null; td.scrollIntoView({ block: 'center', inline: 'center' });
    const r = td.getBoundingClientRect(); return { x: r.left + Math.min(6, r.width / 2), y: r.top + r.height / 2 };
  }, re);
  if (!box) return { shown: false, text: '' };
  await page.mouse.move(box.x, box.y); await page.mouse.move(box.x + 1, box.y);
  await page.waitForTimeout(80);
  return page.evaluate(() => { const t = document.getElementById('tooltip'); return { shown: t.classList.contains('show'), text: t.textContent }; });
}
let tt = await hoverText('이병엽');
check('2-1 취소 칸 툴팁: ✕ 취소됨 · 누가·언제 · 사유 · «비어 있음»', tt.shown && /✕ 취소됨/.test(tt.text) && /Maimai/.test(tt.text) && /11\/02 14:22/.test(tt.text) && /학생 사정/.test(tt.text) && /비어 있음/.test(tt.text), tt.text.slice(0, 160));
tt = await hoverText('홍길동');
check('2-2 옮겨 온 수업 툴팁에 «📅 11/04 11:00 에서 연기됨»', tt.shown && /11\/04 11:00 에서 연기됨/.test(tt.text) && /Melca/.test(tt.text), tt.text.slice(0, 160));
tt = await hoverText('Jeong');
check('2-3 연기 칸 툴팁: ⏸ 연기됨', tt.shown && /연기됨/.test(tt.text), tt.text.slice(0, 120));

// ═══ 3. 눌러도 «수업 칸» 처럼 굴지 않는다 ═══
console.log('\n═ 3. 조작 ═');
const ofBox = await page.evaluate(() => {
  const td = [...document.querySelectorAll('td.slot.slot-off')].find(t => /이병엽/.test(t.textContent));
  td.scrollIntoView({ block: 'center', inline: 'center' }); const r = td.getBoundingClientRect(); return { x: r.left + 5, y: r.top + r.height / 2 };
});
await page.mouse.move(ofBox.x, ofBox.y); await page.mouse.down();
const dndSrc = await page.evaluate(() => (typeof dnd !== 'undefined' && dnd.sourceEl) ? 'set' : 'none');
await page.mouse.up(); await page.waitForTimeout(120);
const modal = await page.evaluate(() => ({ open: document.getElementById('modal-overlay').classList.contains('show'), text: document.getElementById('modal-box').textContent.slice(0, 200) }));
check('3-1 ⛔ 취소 칸을 눌러도 «수업 끌기» 후보가 안 된다(dnd.sourceEl 없음)', dndSrc === 'none', dndSrc);
check('3-2 취소 칸을 누르면 빈 칸처럼 «새 수업 추가» 창이 열린다(상세·삭제 창이 아니다)', modal.open && !/삭제|Delete/.test(modal.text), modal.text.slice(0, 120));
await page.evaluate(() => window.closeModal && window.closeModal());
const ctxm = await page.evaluate(() => {
  const td = [...document.querySelectorAll('td.slot.slot-off')].find(t => /이병엽/.test(t.textContent));
  td.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
  return document.getElementById('ctx-menu').classList.contains('show');
});
check('3-3 ⛔ 취소 칸 우클릭에 «시간 변경·삭제» 메뉴가 안 뜬다', ctxm === false);

// ═══ 4. 주간 뷰·통계·검색 ═══
console.log('\n═ 4. 주간 뷰(개요)·통계·검색 ═');
await page.evaluate(() => { viewMode = 'week'; render(); });
const wk = await page.evaluate(() => {
  const segs = [...document.querySelectorAll('.tl-seg.s-off')];
  return { n: segs.length, pp: segs.filter(s => s.classList.contains('s-pp')).length,
    title: (segs.find(s => /이병엽/.test(s.title)) || {}).title || '', stOff: document.getElementById('st-off').textContent,
    stTotal: document.getElementById('st-total').textContent };
});
check('4-1 주간 막대에 취소·연기 회색 막대(3개, 그중 연기 1)', wk.n === 3 && wk.pp === 1, JSON.stringify(wk));
check('4-2 막대 설명(title)에 «✕ 취소됨 · 이병엽»', /✕ 취소됨/.test(wk.title) && /이병엽/.test(wk.title), wk.title);
check('4-3 통계 «취소·연기 3건» · 짝: «총 수업» 에는 안 든다(2건)', wk.stOff === '3건' && wk.stTotal === '2건', JSON.stringify({ off: wk.stOff, total: wk.stTotal }));
await page.fill('#search-input', 'lby01'); await page.waitForTimeout(500);   // 검색은 180ms 디바운스
const srch = await page.evaluate(() => [...document.querySelectorAll('.tl-nm')].map(n => n.textContent));
check('4-4 취소된 학생 아이디로 찾아도 그 강사가 나온다', srch.length === 1 && srch[0] === 'BELLE', JSON.stringify(srch));
await page.fill('#search-input', ''); await page.waitForTimeout(500);
await page.screenshot({ path: join(SHOT, 'week-ko.png'), fullPage: false });

// ═══ 5. 영어 ═══
console.log('\n═ 5. EN ═');
await page.evaluate(() => window.toggleLang());
await page.evaluate(() => { viewMode = 'day'; curDow = 1; render(); });
const en = await page.evaluate(() => {
  const td = [...document.querySelectorAll('td.slot.slot-off')].find(t => /이병엽/.test(t.textContent));
  return { title: td && td.title, stOff: document.getElementById('st-off').textContent, sumTitle: document.getElementById('st-off').closest('[data-ko-title]').title };
});
check('5-1 EN: 칸 설명이 «✕ Cancelled» · 통계 «3»', /✕ Cancelled/.test(en.title || '') && en.stOff === '3', JSON.stringify(en));
check('5-1b EN: 요약 칸 설명(title)도 영어 — data-en-title 을 실제로 씀', /Classes cancelled or postponed/.test(en.sumTitle || ''), en.sumTitle);
tt = await hoverText('이병엽');
check('5-2 EN 툴팁: Cancelled · Postponed / Open — click to add', /Cancelled/.test(tt.text) && /Open — click to add/.test(tt.text), tt.text.slice(0, 160));
await page.screenshot({ path: join(SHOT, 'day-en.png'), fullPage: false });
await ctx.close();

// ═══ 6. 서버가 «못 물어봤다» 고 할 때 · 옛 서버(off_items 없음) ═══
console.log('\n═ 6. 실패·옛 서버 ═');
({ ctx, page } = await open({ ok: true, week: D(0), items: ITEMS, schedules: ITEMS, off_items: [], off_complete: false }));
const unk = await page.evaluate(() => document.getElementById('st-off').textContent);
check('6-1 이력·취소 조회를 못 했으면 0 이 아니라 «?»', unk === '?', unk);
await ctx.close();
({ ctx, page } = await open({ ok: true, week: D(0), items: ITEMS, schedules: ITEMS }));
const old = await page.evaluate(() => ({ off: document.getElementById('st-off').textContent, cells: document.querySelectorAll('.tl-seg.s-off').length, live: document.querySelectorAll('.tl-seg.s-1on1').length }));
check('6-2 옛 서버(off_items 없음): 취소 칸 0 · 수업은 그대로 · 건수는 «0건» 이라 단정하지 않고 «?»', old.off === '?' && old.cells === 0 && old.live === 2, JSON.stringify(old));
await ctx.close();

// ═══ 8. (2026-11-04) 같은 칸에 «취소» 와 다른 학생의 «옮겨 감» — 둘 다 말한다 ═══
console.log('\n═ 8. 같은 칸에 취소 + 옮겨 감(그룹) ═');
const MIX = (uid, name, off, ko, en) => ({ off, moved_away: off === 'postponed', teacher_id: 2, date: TUE, hour: 17, start_time: '17:00', type: 'group',
  students: [{ name, uid }], duration_min: 20, note: '', change: { kind: off, at: 1, at_kst: null, by: null, reason: null, label_ko: ko, label_en: en } });
const OFF2 = OFF.concat([
  MIX('mx_a', '취소학생', 'cancelled', '✕ 취소됨', '✕ Cancelled'),
  MIX('mx_b', '연기학생', 'postponed', '⏸ 연기됨 → 11/11 15:50', '⏸ Postponed → 11/11 15:50'),
  MIX('mx_c', '연기친구', 'postponed', '⏸ 연기됨 → 11/11 15:50', '⏸ Postponed → 11/11 15:50'),
]);
({ ctx, page } = await open({ ok: true, week: D(0), items: ITEMS, schedules: ITEMS, off_items: OFF2, off_complete: true }));
await page.evaluate(() => { viewMode = 'day'; curDow = 1; render(); });
const mix = await page.evaluate(() => {
  const td = [...document.querySelectorAll('td.slot.slot-off')].find(t => t.dataset.tid === '2' && t.dataset.hour === '17');
  const cs = td && getComputedStyle(td);
  return { text: td && td.textContent, cls: td && td.className, title: td && td.title, deco: cs && cs.textDecorationLine, slot: td && td.hasAttribute('data-slot'),
           busy: td ? window.cellBusy(td) : null, stOff: document.getElementById('st-off').textContent };
});
check('8-1 섞인 칸: 기호 둘(✕⏸) · 그룹 3명 · slot-off-mixed', /✕⏸\s*그룹 3/.test(mix.text || '') && /slot-off-mixed/.test(mix.cls || ''), JSON.stringify({ t: mix.text, c: mix.cls }));
check('8-2 섞인 칸에는 취소선이 없다(연기된 학생 이름까지 그어지지 않게) · 여전히 data-slot 없음·빈 시간', mix.deco === 'none' && mix.slot === false && mix.busy === false, JSON.stringify({ d: mix.deco, s: mix.slot, b: mix.busy }));
check('8-3 칸 설명(title)에 두 사정이 다', /✕ 취소됨 · ⏸ 연기됨 → 11\/11 15:50/.test(mix.title || ''), mix.title);
check('8-4 통계는 사정 수(기존 3 + 이 칸 2 = 5건)', mix.stOff === '5건', mix.stOff);
const mixBox = await page.evaluate(() => {
  const td = [...document.querySelectorAll('td.slot.slot-off')].find(t => t.dataset.tid === '2' && t.dataset.hour === '17');
  td.scrollIntoView({ block: 'center', inline: 'center' }); const r = td.getBoundingClientRect(); return { x: r.left + 5, y: r.top + r.height / 2 };
});
await page.mouse.move(mixBox.x, mixBox.y); await page.mouse.move(mixBox.x + 1, mixBox.y); await page.waitForTimeout(80);
const mtt = await page.evaluate(() => {
  const t = document.getElementById('tooltip');
  const parts = [...t.querySelectorAll('.tooltip-off-part')].map(x => x.textContent);
  const lists = [...t.querySelectorAll('.tooltip-students')].map(x => [...x.querySelectorAll('.uid')].map(u => u.textContent));
  return { shown: t.classList.contains('show'), parts, lists };
});
check('8-5 툴팁: 사정마다 한 묶음(2) — 첫 묶음은 ✕ 취소됨만, 둘째는 ⏸ 연기됨 → 11/11 15:50만 · 같은 글자가 한 묶음에 두 번 안 나온다',
  mtt.shown && mtt.parts.length === 2 && /✕ 취소됨/.test(mtt.parts[0]) && !/연기됨/.test(mtt.parts[0]) && /⏸ 연기됨 → 11\/11 15:50/.test(mtt.parts[1]) && !/취소됨/.test(mtt.parts[1])
  && mtt.parts.every(t => (t.match(/(취소됨|연기됨)/g) || []).length === 1), JSON.stringify(mtt.parts));
check('8-6 툴팁: 학생은 «자기 사정» 아래 — 취소엔 mx_a, 연기엔 mx_b·mx_c(같은 글자는 한 묶음)', JSON.stringify(mtt.lists) === JSON.stringify([['mx_a'], ['mx_b', 'mx_c']]), JSON.stringify(mtt.lists));
await page.screenshot({ path: join(SHOT, 'day-mixed-ko.png'), fullPage: false });
await page.evaluate(() => { viewMode = 'week'; render(); });
const mseg = await page.evaluate(() => {
  const segs = [...document.querySelectorAll('.tl-seg.s-off')];
  const m = segs.find(s => s.dataset.offSeg === 'mixed');
  return { n: segs.length, title: m && m.title, pp: m && m.classList.contains('s-pp') };
});
check('8-7 주간 막대: 섞인 칸 하나(data-off-seg=mixed) · 설명에 두 사정', mseg.n === 4 && /✕ 취소됨 · ⏸ 연기됨 → 11\/11 15:50/.test(mseg.title || '') && mseg.pp === false, JSON.stringify(mseg));
await page.evaluate(() => window.toggleLang());
await page.evaluate(() => { viewMode = 'day'; curDow = 1; render(); });
const men = await page.evaluate(() => {
  const td = [...document.querySelectorAll('td.slot.slot-off')].find(t => t.dataset.tid === '2' && t.dataset.hour === '17');
  return td && td.title;
});
check('8-8 EN: ✕ Cancelled · ⏸ Postponed → 11/11 15:50', /✕ Cancelled · ⏸ Postponed → 11\/11 15:50/.test(men || ''), men);
await ctx.close();

check('7 페이지 스크립트 오류 0', errs.length === 0, errs.slice(0, 3).join(' | '));
await browser.close(); server.close();
console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}   (스크린샷: ${SHOT})`);
process.exit(FAIL ? 1 : 0);
