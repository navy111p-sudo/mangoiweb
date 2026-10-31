// -*- coding: utf-8 -*-
/**
 * 수업 연기하기 — «날짜로 연기» 탭이 «실제 시간표» 를 쓰는가 (2026-09-30)
 *
 * [왜] 사장님: 「날짜로 연기 탭도 실제 시간표로 바꿔줘」. 예전 시간칸·선생님 목록은 해시로 지어낸
 *      가짜 시간표(SCHEDULE)라, 화면이 «된다» 고 해도 실제로 되는지 아무도 몰랐다.
 * [무엇] 옮길 수업을 고르고 → 날짜 → 시간칸은 /api/class/schedule/day-slots(서버 판정)
 *      → 그 시각의 선생님은 /api/class/schedule/free-teachers(관리자 승인과 같은 정본).
 *      고른 것은 «그 수업 자리»(origIdx)에 담기고, 다른 선생님이면 원부 번호(teacher_id)로 저장된다.
 *
 * 돌리는 법:  PW_DIR=/tmp/pw node test-harness/manual/lesson-postpone-date-real-browser.mjs
 *   ⚠️ 자동으로 안 돈다(manual/). 이 화면을 고치면 사람이 부르세요.
 */
import { requireBrowser } from './_pw.mjs';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUB = process.env.LP_PUB || join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cloudflare-deploy', 'public');
const { chromium, exe } = requireBrowser();
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };
const srv = createServer((req, res) => {
  const p = join(PUB, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(PUB) || !existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
});
await new Promise(r => srv.listen(0, r));
const BASE = `http://127.0.0.1:${srv.address().port}`;

let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('  ✅', name); } else { fail++; console.log('  ❌ FAIL', name, extra ?? ''); } };

const MINE = { ok: true, schedules: [
  { schedule_id: 4385, scheduled_date: '2099-09-30', start_time: '16:00', teacher_name: 'KRYSTEL', next_date: '2099-09-30' },
  { schedule_id: 849, scheduled_date: null, start_time: '19:20', teacher_name: '중국어 강선생님', next_date: '2099-09-30' },
  { schedule_id: 850, scheduled_date: null, start_time: '19:20', teacher_name: '중국어 강선생님', next_date: '2099-10-01' },
] };
const SLOTS = [
  { t: '09:00', past: false, student_busy: false, teacher_free: true },
  { t: '09:20', past: false, student_busy: true, teacher_free: true },
  { t: '09:40', past: true, student_busy: false, teacher_free: true },
  { t: '10:00', past: false, student_busy: false, teacher_free: false },
];

async function open(user) {
  const browser = await chromium.launch({ executablePath: exe });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const seen = { slots: [], free: [], posts: [] };
  let slotCalls849 = 0;
  await ctx.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
  await ctx.route('**/api/class/schedule/mine**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MINE) }));
  await ctx.route('**/api/class/schedule/day-slots**', r => {
    const u = new URL(r.request().url()); const sid = u.searchParams.get('schedule_id');
    seen.slots.push({ sid, date: u.searchParams.get('date'), auth: r.request().headers()['authorization'] || '' });
    if (sid === '849' && slotCalls849++ === 0) return r.fulfill({ status: 500, contentType: 'application/json', body: '{"ok":false,"error":"lookup_failed"}' });
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, date: u.searchParams.get('date'), slots: SLOTS }) });
  });
  await ctx.route('**/api/class/schedule/free-teachers**', r => {
    const u = new URL(r.request().url()); const sid = u.searchParams.get('schedule_id'); const time = u.searchParams.get('time');
    seen.free.push({ sid, date: u.searchParams.get('date'), time });
    const cands = (sid === '849' && time === '10:00') ? [] : [{ id: '7', name: 'ANA', display_name: 'Teacher Ana', photo: '' }];
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, current: { id: '16', name: 'KRYSTEL', display_name: 'Krystel', photo: '' }, candidates: cands, busy_count: 5, teacher_change_ok: true }) });
  });
  await ctx.route('**/api/class/schedule/request', r => { seen.posts.push(JSON.parse(r.request().postData() || '{}')); r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"id":1}' }); });
  await ctx.addInitScript(u => { try { localStorage.clear(); if (u) { localStorage.setItem('mangoi_logged_user', JSON.stringify(u)); localStorage.setItem('mango_token', 'tok-' + u.uid); } } catch (e) {} }, user);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/lesson-postpone-demo.html?_nc=' + Date.now());
  await page.waitForFunction(() => typeof __MOB_STATE !== 'undefined' && __MOB_STATE !== 'loading', null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(300);
  return { browser, page, seen, errs };
}
const txt = page => page.evaluate(() => (document.getElementById('detail-body') || document.body).innerText);
const click = async (page, sel, name) => { try { await page.click(sel, { timeout: 3000 }); await page.waitForTimeout(350); return true; } catch (e) { ok(name + ' — 누를 수 있다', false, String(e.message).split('\n')[0]); return false; } };
const cart = page => page.evaluate(() => state.cart.map(c => ({ o: c.origIdx, id: c.realTeacherId == null ? null : String(c.realTeacherId), n: c.teacherName, d: c.date, h: c.hour })));

console.log('\n▶ ① 로그인 학생: 날짜로 연기(실제 시간표)');
{
  const { browser, page, seen, errs } = await open({ uid: 'jeong', name: '정우영' });
  await page.evaluate(() => _goMode('postpone'));
  await page.waitForTimeout(300);
  /* 2026-10-05 A안 — 실제 수업 연기는 탭 3개(⏩ 매주 · 📅 날짜로 · 👨‍🏫 교사로), 기본은 «매주». */
  ok('연기 탭 3개가 보이고 기본은 «매주 한 주씩»', await page.evaluate(() => state.tab === 'weekly' && document.getElementById('segment').classList.contains('seg3')
    && ['weekly','time','teacher'].every(t => { const b = document.querySelector('.seg[data-tab="' + t + '"]'); return b && b.offsetParent !== null; })));
  await click(page, '#seg-time', '📅 날짜로 연기 탭');
  ok('날짜 탭에는 «매주» 단추가 없다(자기 탭에만)', await page.evaluate(() => !document.getElementById('pushBtn')));
  ok('전제: 진짜 수업 3건 · 날짜 탭', await page.evaluate(() => __MOB_REAL === true && CURRENT_SCHEDULE.length === 3 && state.tab === 'time'));
  ok('옮길 수업 고르기 칩이 3개, 첫 수업이 선택돼 있다', await page.evaluate(() => document.querySelectorAll('[data-dtsel]').length === 3 && !!document.querySelector('[data-dtsel="0"].active')));
  ok('날짜를 고르기 전엔 서버에 안 묻는다', seen.slots.length === 0, seen.slots.length);
  ok('날짜 고르기 전엔 가짜 시간칸이 없다', await page.evaluate(() => document.querySelectorAll('.hour-chip[data-hour]').length === 0));
  const d2 = await page.evaluate(() => document.querySelectorAll('.date-chip')[2].dataset.date);
  await click(page, `.date-chip[data-date="${d2}"]`, '날짜');
  await page.waitForTimeout(300);
  ok('고른 수업·날짜로 day-slots 를 물었다(토큰 포함)', seen.slots.length === 1 && seen.slots[0].sid === '4385' && seen.slots[0].date === d2 && seen.slots[0].auth === 'Bearer tok-jeong', JSON.stringify(seen.slots));
  const chips = await page.evaluate(() => [...document.querySelectorAll('.hour-chip[data-dthour]')].map(b => ({ t: b.dataset.dthour, dis: b.classList.contains('disabled'), tf: b.classList.contains('tf') })));
  ok('시간칸은 서버가 준 것만(4칸, 가짜 42칸 아님)', chips.length === 4, JSON.stringify(chips));
  ok('내 다른 수업과 겹침·지난 시간은 흐림', chips.find(c => c.t === '09:20')?.dis === true && chips.find(c => c.t === '09:40')?.dis === true);
  ok('되는 칸은 흐리지 않다(짝)', chips.find(c => c.t === '09:00')?.dis === false && chips.find(c => c.t === '10:00')?.dis === false);
  ok('지금 선생님이 되는 칸만 초록 테두리(tf)', chips.find(c => c.t === '09:00')?.tf === true && chips.find(c => c.t === '10:00')?.tf === false);
  await page.evaluate(() => document.querySelector('.hour-chip[data-dthour="09:20"]').click());
  await page.waitForTimeout(250);
  ok('흐린 칸은 눌러도 선택되지 않는다', await page.evaluate(() => state.hour === null) && seen.free.length === 0);

  await click(page, '.hour-chip[data-dthour="09:00"]', '09:00');
  await page.waitForTimeout(300);
  ok('그 시각으로 free-teachers 를 물었다', seen.free.length >= 1 && seen.free[0].sid === '4385' && seen.free[0].date === d2 && seen.free[0].time === '09:00', JSON.stringify(seen.free));
  let t = await txt(page);
  ok('지금 선생님 그대로 + 다른 선생님(Teacher Ana)이 보인다', t.includes('지금 선생님 그대로') && t.includes('KRYSTEL') && t.includes('Teacher Ana'), t.slice(0, 400));
  ok('가짜 시간표 강사(Karl·Teacher Janice)는 안 보인다', !/Karl|Teacher Janice/.test(t));
  await click(page, '.teacher-card[data-dtpick="7"]', 'Teacher Ana');
  let c = await cart(page);
  ok('고르면 그 수업 자리(0)에 원부 번호로 담긴다', c.length === 1 && c[0].o === 0 && c[0].id === '7' && c[0].d === d2 && c[0].h === '09:00', JSON.stringify(c));
  ok('다음 수업으로 넘어가고 날짜가 비워진다', await page.evaluate(() => state.dtOrig === 1 && state.date === null && state.hour === null));

  // 같은 수업을 다시 고르면 «바꿔» 담는다(한 자리에 하나) · 지금 선생님이 안 되는 칸엔 «그대로» 카드가 없다
  await click(page, '[data-dtsel="0"]', '수업 1 다시 고르기');
  await click(page, `.date-chip[data-date="${d2}"]`, '날짜(수업 1 다시)');
  await page.waitForTimeout(300);
  await click(page, '.hour-chip[data-dthour="10:00"]', '10:00(수업 1)');
  await page.waitForTimeout(300);
  ok('지금 선생님이 안 되는 칸(10:00)엔 «지금 선생님 그대로» 카드가 없다', await page.evaluate(() => !document.querySelector('[data-dtpick="cur"]') && !!document.querySelector('[data-dtpick="7"]')));
  await click(page, '.teacher-card[data-dtpick="7"]', 'Teacher Ana(10:00)');
  c = await cart(page);
  ok('같은 수업을 다시 고르면 바꿔 담는다(그 자리 1건 · 10:00)', c.filter(x => x.o === 0).length === 1 && c.find(x => x.o === 0).h === '10:00' && c.length === 1, JSON.stringify(c));
  await click(page, '[data-dtsel="1"]', '수업 2 고르기');

  // 수업 1(849): 첫 조회 실패 → 다시 불러오기
  await click(page, `.date-chip[data-date="${d2}"]`, '날짜(수업 2)');
  await page.waitForTimeout(300);
  t = await txt(page);
  ok('시간표 조회 실패를 «칸 없음» 이 아니라 «불러오지 못했어요» 로 말한다', t.includes('시간표를 불러오지 못했어요') && !(await page.evaluate(() => document.querySelectorAll('.hour-chip[data-dthour]').length)), t.slice(0, 300));
  await click(page, '[data-dsretry]', '다시 불러오기');
  await page.waitForTimeout(300);
  ok('다시 불러오기로 칸이 나온다', await page.evaluate(() => document.querySelectorAll('.hour-chip[data-dthour]').length === 4));
  await click(page, '.hour-chip[data-dthour="10:00"]', '10:00');
  await page.waitForTimeout(300);
  t = await txt(page);
  ok('지금 선생님도 안 되고 다른 선생님도 없으면 «없어요»', t.includes('이 시간에 가능한 선생님이 없어요') && !(await page.evaluate(() => document.querySelectorAll('[data-dtpick]').length)), t.slice(0, 300));

  // 수업 2(850): 지금 선생님 그대로
  await click(page, '[data-dtsel="2"]', '수업 3 고르기');
  await click(page, `.date-chip[data-date="${d2}"]`, '날짜(수업 3)');
  await page.waitForTimeout(300);
  await click(page, '.hour-chip[data-dthour="09:00"]', '09:00(수업 3)');
  await page.waitForTimeout(300);
  await click(page, '.teacher-card[data-dtpick="cur"]', '지금 선생님 그대로');
  c = await cart(page);
  const c2 = c.find(x => x.o === 2);
  ok('«지금 선생님 그대로» 는 강사 번호 없이(바꾸지 않음) 그 자리에 담긴다', !!c2 && c2.id === null && c2.n === '중국어 강선생님' && c2.h === '09:00', JSON.stringify(c));
  ok('다음은 아직 안 담긴 수업(1)로', await page.evaluate(() => state.dtOrig === 1));

  // 저장: 남은 1건은 직접 넣고 확정
  await page.evaluate(() => { state.cart.push({ teacherId: 'x', teacherName: 'X', ico: '', date: '2099-10-09', hour: '11:00', origIdx: 1 }); updateSticky(); onConfirm(); });
  await page.waitForTimeout(700);
  const p = seen.posts;
  ok('요청 3건', p.length === 3, p.length);
  const p0 = p.find(x => x.schedule_id === 4385), p2 = p.find(x => x.schedule_id === 850), p1 = p.find(x => x.schedule_id === 849);
  ok('4385 → 고른 날짜·10:00 · 강사 7', !!p0 && p0.new_date === d2 && p0.new_time === '10:00' && String(p0.teacher_id) === '7', JSON.stringify(p0));
  ok('850 → 고른 날짜·09:00 · 강사 번호 없음(지금 선생님 그대로)', !!p2 && p2.new_date === d2 && p2.new_time === '09:00' && p2.teacher_id == null, JSON.stringify(p2));
  ok('849 → 제 자리에 담은 것', !!p1 && p1.new_date === '2099-10-09' && p1.new_time === '11:00', JSON.stringify(p1));
  ok('페이지 오류 없음', errs.length === 0, errs.join(' | '));
  await browser.close();
}

console.log('\n▶ ② 로그인 학생: «매주» 탭 ↔ 날짜·교사 탭은 장바구니를 섞지 않는다');
{
  const { browser, page, errs } = await open({ uid: 'jeong' });
  await page.evaluate(() => _goMode('postpone'));
  await page.evaluate(() => { state.cart = [{ teacherId: 'x', teacherName: 'K', date: '2099-10-07', hour: '16:00', origIdx: 0, requestScope: 'weekly_postpone', seriesItems: [{}, {}] }]; renderBody(); updateSticky(); });
  await click(page, '#seg-teacher', '교사로 탭');
  ok('매주 묶음을 담은 채 교사 탭으로 가면 장바구니가 비워진다', await page.evaluate(() => state.tab === 'teacher' && state.cart.length === 0));
  await page.evaluate(() => { state.cart = [{ teacherId: 'x', teacherName: 'K', date: '2099-10-07', hour: '16:00', origIdx: 0 }]; renderBody(); updateSticky(); });
  await click(page, '#seg-time', '날짜로 탭');
  ok('날짜 ↔ 교사 탭끼리는 장바구니를 유지한다(짝)', await page.evaluate(() => state.tab === 'time' && state.cart.length === 1));
  await click(page, '[data-dtsel="1"]', '날짜 탭에서 다른 수업 고르기');
  ok('날짜 탭에서 수업을 바꿔 골라도 담은 것은 남는다', await page.evaluate(() => state.cart.length === 1 && state.dtOrig === 1));
  await click(page, '#seg-weekly', '매주 탭');
  ok('매주 탭으로 돌아가면 비우고 «매주» 단추가 보인다', await page.evaluate(() => state.cart.length === 0 && !!document.getElementById('pushBtn')));
  // (Codex 리뷰 1) 매주 미리보기를 기다리는 사이 다른 탭으로 가면, 늦게 온 응답이 장바구니에 끼어들지 않는다
  await page.route('**/api/class/schedule/weekly-postpone**', async r => { await new Promise(res => setTimeout(res, 800)); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, count: 2, snapshot: 's', items: [{ id: 4385, from_date: '2099-09-30', from_time: '16:00', to_date: '2099-10-07', to_time: '16:00' }, { id: 849, from_date: '2099-09-30', from_time: '16:20', to_date: '2099-10-07', to_time: '16:20' }] }) }); });
  await page.evaluate(() => { state.dtOrig = 0; pushBackAll(); });
  await click(page, '#seg-time', '기다리는 중 날짜 탭');
  await page.waitForTimeout(1100);
  ok('늦게 온 매주 미리보기는 날짜 탭 장바구니에 안 들어온다', await page.evaluate(() => state.tab === 'time' && state.cart.length === 0 && !state.previewLoading));
  await click(page, '#seg-weekly', '매주 탭(다시)');
  await click(page, '#pushBtn', '매주 미리보기');
  await page.waitForTimeout(1100);
  ok('매주 탭에 머물면 미리보기가 담긴다(짝)', await page.evaluate(() => state.cart.length === 1 && !!state.cart[0].seriesItems));
  // (Codex 리뷰 2) 수업을 늦게 불러와도 기본은 «매주»
  await page.evaluate(() => { __MOB_REAL = false; _goMode('postpone'); });
  ok('불러오기 전엔 날짜 탭(예시)', await page.evaluate(() => state.tab === 'time'));
  await page.evaluate(() => { __MOB_REAL = true; renderBody(); updateSticky(); });
  ok('수업이 늦게 와도 기본은 «매주» 로 맞춘다', await page.evaluate(() => state.tab === 'weekly' && document.getElementById('seg-weekly').classList.contains('active')));
  await page.evaluate(() => { __MOB_REAL = false; _goMode('postpone'); });
  await click(page, '#seg-teacher', '불러오기 전 교사 탭 직접 누름');
  await page.evaluate(() => { __MOB_REAL = true; renderBody(); updateSticky(); });
  ok('사람이 직접 고른 탭은 안 바꾼다(짝)', await page.evaluate(() => state.tab === 'teacher'));
  await page.evaluate(() => _goMode('change'));
  ok('«수업 변경» 에는 매주 탭이 없다', await page.evaluate(() => !document.getElementById('segment').classList.contains('seg3') && document.getElementById('seg-weekly').offsetParent === null));
  ok('페이지 오류 없음', errs.length === 0, errs.join(' | '));
  await browser.close();
}

console.log('\n▶ ③ 비로그인: 예시 화면 그대로');
{
  const { browser, page, seen, errs } = await open(null);
  await page.evaluate(() => _goMode('postpone'));
  const d2 = await page.evaluate(() => document.querySelectorAll('.date-chip')[2].dataset.date);
  await click(page, `.date-chip[data-date="${d2}"]`, '날짜(예시)');
  ok('비로그인은 day-slots 를 부르지 않는다', seen.slots.length === 0);
  ok('예시 시간칸(가짜 42칸)이 그대로 그려진다', await page.evaluate(() => document.querySelectorAll('.hour-chip[data-hour]').length === 42));
  ok('옮길 수업 고르기 칩은 없다', await page.evaluate(() => document.querySelectorAll('[data-dtsel]').length === 0));
  ok('페이지 오류 없음', errs.length === 0, errs.join(' | '));
  await browser.close();
}

srv.close();
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
