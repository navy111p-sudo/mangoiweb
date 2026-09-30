// -*- coding: utf-8 -*-
/**
 * 수업 연기하기 — «교사로 연기» 탭이 «그 시간에 실제로 수업 가능한 강사» 를 보여 주는가 (2026-09-30)
 *
 * [왜] 사장님: 「교사로 연기 버튼 누르면 그 시간대에 수업 가능한 교사들이 자동으로 나오게 해서
 *      거기서 선택을 하게 해줘」. 예전 목록은 해시로 지어낸 가짜 시간표(SCHEDULE)라 누가 되는지 아무도 몰랐다.
 * [무엇] 실제 내 수업마다 /api/class/schedule/free-teachers 를 부르고, 그 결과만 그리며,
 *      고른 강사는 «그 수업 자리» 에 원부 번호(teacher_id)로 저장된다.
 *
 * 돌리는 법:  PW_DIR=/tmp/pw node test-harness/manual/lesson-postpone-teacher-free-browser.mjs
 *   ⚠️ 자동으로 안 돈다(manual/). 이 화면을 고치면 사람이 부르세요.
 */
import { requireBrowser } from './_pw.mjs';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUB = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cloudflare-deploy', 'public');
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

/* 수업 셋: 4385(가능 2명) · 849(가능 0명) · 850(서버 오류) */
const MINE = {
  ok: true, schedules: [
    { schedule_id: 4385, scheduled_date: '2099-09-30', start_time: '16:00', teacher_name: 'KRYSTEL', next_date: '2099-09-30' },
    { schedule_id: 849, scheduled_date: null, start_time: '19:20', teacher_name: '중국어 강선생님', next_date: '2099-09-30' },
    { schedule_id: 850, scheduled_date: null, start_time: '19:20', teacher_name: '중국어 강선생님', next_date: '2099-10-01' },
  ],
};
const FREE = {
  4385: { status: 200, body: { ok: true, date: '2099-09-30', time: '16:00', candidates: [
    { id: '7', name: 'ANA', display_name: 'Teacher Ana', photo: '' },
    { id: '22', name: 'FAR', display_name: 'Teacher Farrah', photo: '' },
  ], busy_count: 20, teacher_change_ok: true } },
  849: { status: 200, body: { ok: true, candidates: [], busy_count: 25, teacher_change_ok: true } },
  850: { status: 500, body: { ok: false, error: 'lookup_failed' } },
};

async function open(user) {
  const browser = await chromium.launch({ executablePath: exe });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const seen = { free: [], posts: [] };
  await ctx.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
  await ctx.route('**/api/class/schedule/mine**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MINE) }));
  await ctx.route('**/api/class/schedule/free-teachers**', r => {
    const u = new URL(r.request().url());
    const sid = u.searchParams.get('schedule_id');
    seen.free.push({ sid, date: u.searchParams.get('date'), time: u.searchParams.get('time'), auth: r.request().headers()['authorization'] || '' });
    const f = FREE[sid] || { status: 404, body: {} };
    r.fulfill({ status: f.status, contentType: 'application/json', body: JSON.stringify(f.body) });
  });
  await ctx.route('**/api/class/schedule/request', r => {
    seen.posts.push(JSON.parse(r.request().postData() || '{}'));
    r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"id":1}' });
  });
  await ctx.addInitScript(u => {
    try { localStorage.clear(); if (u) { localStorage.setItem('mangoi_logged_user', JSON.stringify(u)); localStorage.setItem('mango_token', 'tok-' + u.uid); } } catch (e) {}
  }, user);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/lesson-postpone-demo.html?_nc=' + Date.now());
  await page.waitForFunction(() => typeof __MOB_STATE !== 'undefined' && __MOB_STATE !== 'loading', null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(400);
  return { browser, page, seen, errs };
}
const txt = (page) => page.evaluate(() => (document.getElementById('detail-body') || document.body).innerText);
const safeClick = async (page, sel, name) => {
  try { await page.click(sel, { timeout: 3000 }); return true; } catch (e) { ok(name + ' — 누를 수 있다', false, String(e.message).split('\n')[0]); return false; }
};

/* ① 로그인 학생 — 실제 가능 강사 */
console.log('\n▶ ① 로그인 학생: 교사로 연기');
{
  const { browser, page, seen, errs } = await open({ uid: 'jeong', name: '정우영' });
  ok('전제: 진짜 수업 3건을 불러왔다', await page.evaluate(() => __MOB_REAL === true && CURRENT_SCHEDULE.length === 3));
  await page.evaluate(() => _goMode('postpone'));
  await safeClick(page, '#seg-teacher', '교사로 탭');
  await page.waitForTimeout(600);
  let t = await txt(page);
  ok('수업마다 서버에 «그 날짜·시각» 을 물었다(3건)', seen.free.length === 3, JSON.stringify(seen.free));
  const f4385 = seen.free.find(x => x.sid === '4385');
  ok('4385 는 2099-09-30 16:00 으로 물었다', !!f4385 && f4385.date === '2099-09-30' && f4385.time === '16:00', JSON.stringify(f4385));
  ok('학생 토큰을 실어 보냈다', !!f4385 && f4385.auth === 'Bearer tok-jeong');
  ok('가능 강사 이름이 보인다(Teacher Ana · Teacher Farrah)', t.includes('Teacher Ana') && t.includes('Teacher Farrah'));
  ok('가짜 시간표 강사(Karl·Mo·Teacher Janice)는 안 보인다', !/Karl|Teacher Janice|\bMo\b/.test(t), t.slice(0, 300));
  ok('가능 0명인 수업은 «없어요» 라고 말한다', t.includes('수업 가능한 다른 선생님이 없어요'));
  ok('서버 오류인 수업은 «불러오지 못했어요» 라고 말한다(가능 0명으로 위장하지 않음)', t.includes('불러오지 못했어요'));
  ok('수업마다 지금 선생님을 보여 준다', t.includes('KRYSTEL') && t.includes('중국어 강선생님'));

  // 고르기 → 바꾸기 → 다시 누르면 빼기
  await safeClick(page, '.teacher-card[data-ftid="7"]', 'Teacher Ana');
  let cart = await page.evaluate(() => state.cart.map(c => ({ o: c.origIdx, id: c.realTeacherId, d: c.date, h: c.hour })));
  ok('고르면 그 수업 자리에 담긴다(4385 = 0번 · 같은 날짜·시각)', cart.length === 1 && cart[0].o === 0 && cart[0].id === '7' && cart[0].d === '2099-09-30' && cart[0].h === '16:00', JSON.stringify(cart));
  ok('고른 카드가 표시된다(active)', await page.evaluate(() => !!document.querySelector('.teacher-card.active[data-ftid="7"]')));
  await safeClick(page, '.teacher-card[data-ftid="22"]', 'Teacher Farrah');
  cart = await page.evaluate(() => state.cart.map(c => ({ o: c.origIdx, id: c.realTeacherId })));
  ok('다른 선생님을 누르면 바꿔 담는다(한 수업에 하나)', cart.length === 1 && cart[0].id === '22', JSON.stringify(cart));
  await safeClick(page, '.teacher-card[data-ftid="22"]', 'Teacher Farrah 다시');
  cart = await page.evaluate(() => state.cart.length);
  ok('같은 선생님을 다시 누르면 뺀다', cart === 0, cart);

  // 저장 짝: 3건 모두 담아야 완료 가능 — 가능 강사가 있는 1건 + 나머지는 «날짜로» 에서 담았다고 가정해 직접 넣는다
  await safeClick(page, '.teacher-card[data-ftid="7"]', 'Teacher Ana 재선택');
  await page.evaluate(() => {
    /* ⚠️ 일부러 «더 이른» 날짜를 섞는다 — 옛 짝(정렬 순서대로)이면 4385 자리에 이 항목이 붙어 FAIL 이 나야 한다. */
    state.cart.push({ teacherId: 't1', teacherName: 'X', ico: '', date: '2099-09-29', hour: '10:00' });
    state.cart.push({ teacherId: 't2', teacherName: 'Y', ico: '', date: '2099-10-04', hour: '11:00' });
    updateSticky();
  });
  await page.evaluate(() => onConfirm());
  await page.waitForTimeout(700);
  const p = seen.posts;
  ok('요청 3건을 보냈다', p.length === 3, p.length);
  const p0 = p.find(x => x.schedule_id === 4385);
  ok('4385 요청에 고른 강사가 원부 번호로 실렸다(teacher_id 7)', !!p0 && String(p0.teacher_id) === '7', JSON.stringify(p0));
  ok('4385 요청은 같은 날짜·시각이다(교사만 바꿈)', !!p0 && p0.new_date === '2099-09-30' && p0.new_time === '16:00', JSON.stringify(p0));
  const others = p.filter(x => x.schedule_id !== 4385);
  ok('나머지 수업은 «날짜로» 담은 것이 순서대로 붙는다(강사 번호 없음)', others.length === 2 && others.every(x => x.teacher_id == null) && others[0].new_date === '2099-09-29', JSON.stringify(others));
  ok('페이지 오류 없음', errs.length === 0, errs.join(' | '));
  await browser.close();
}

/* ② 로그인 안 한 방문자 — 예시 화면 그대로, 서버에 묻지 않음 */
console.log('\n▶ ② 비로그인: 예시 화면');
{
  const { browser, page, seen, errs } = await open(null);
  await page.evaluate(() => _goMode('postpone'));
  await safeClick(page, '#seg-teacher', '교사로 탭(예시)');
  await page.waitForTimeout(400);
  ok('비로그인은 free-teachers 를 부르지 않는다', seen.free.length === 0, seen.free.length);
  ok('예시 피드가 그대로 그려진다', await page.evaluate(() => document.querySelectorAll('.teacher-feed .teacher-card').length > 0));
  ok('페이지 오류 없음', errs.length === 0, errs.join(' | '));
  await browser.close();
}

srv.close();
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
