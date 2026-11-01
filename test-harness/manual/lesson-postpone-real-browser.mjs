// -*- coding: utf-8 -*-
/**
 * 수업 연기하기(/lesson-postpone-demo.html) — «내 수업» 을 진짜로 불러오는가 (2026-09-30)
 *
 * [왜] 사장님(jeong) 화면에 예약에 없는 «Karl 10/2 11:20 · 10/5 14:00» 이 떴다.
 *      원인: 관리자 전용 API(/api/admin/class-schedules)를 불러 학생은 늘 401 → 말없이 예시 수업.
 *      그리고 예시 수업 상태로 «완료» 해도 서버엔 아무것도 안 갔는데 화면은 «완료되었습니다».
 *
 * 돌리는 법:  PW_DIR=/tmp/pw node test-harness/manual/lesson-postpone-real-browser.mjs
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

/* D1 실측(2026-09-30 jeong) 모양 그대로 — 강선생님 화·수·목·금 19:20 + KRYSTEL 9/30 16:00 */
const MINE_JEONG = {
  ok: true, matched_by: 'uid', schedules: [
    { schedule_id: 4385, day_labels_ko: [], scheduled_date: '2099-09-30', start_time: '16:00', teacher_name: 'KRYSTEL', next_date: '2099-09-30', next_start_ts: 1 },
    { schedule_id: 849, day_labels_ko: ['수'], scheduled_date: null, start_time: '19:20', teacher_name: '중국어 강선생님', next_date: '2099-09-30', next_start_ts: 2 },
    { schedule_id: 850, day_labels_ko: ['목'], scheduled_date: null, start_time: '19:20', teacher_name: '중국어 강선생님', next_date: '2099-10-01', next_start_ts: 3 },
    { schedule_id: 851, day_labels_ko: ['금'], scheduled_date: null, start_time: '19:20', teacher_name: '중국어 강선생님', next_date: '2099-10-02', next_start_ts: 4 },
    { schedule_id: 848, day_labels_ko: ['화'], scheduled_date: null, start_time: '19:20', teacher_name: '중국어 강선생님', next_date: '2099-10-06', next_start_ts: 5 },
  ],
};

async function run(label, { user, mine, reqStatus }) {
  console.log('\n▶', label);
  const browser = await chromium.launch({ executablePath: exe });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const seen = { admin: 0, mine: 0, posts: 0 };
  /* 포괄 스텁을 «먼저», 구체적인 것을 «뒤에» — 나중 것이 이긴다(CLAUDE.md 2장). */
  await ctx.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
  await ctx.route('**/api/admin/class-schedules**', r => { seen.admin++; r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"unauthorized"}' }); });
  await ctx.route('**/api/class/schedule/mine**', r => { seen.mine++; r.fulfill({ status: mine.status, contentType: 'application/json', body: JSON.stringify(mine.body) }); });
  await ctx.route('**/api/admin/schedule-requests', r => { seen.oldPosts = (seen.oldPosts || 0) + 1; r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"unauthorized"}' }); });
  await ctx.route('**/api/class/schedule/request', r => {
    seen.posts++;
    seen.auth = r.request().headers()['authorization'] || '';
    /* ⏩ (2026-10-06) reqStatus: 200 = 대기 접수 · 'auto' = 접수 즉시 자동 반영 · 'mix' = 홀수 번째만 자동 */
    const autoOn = reqStatus === 'auto' || (reqStatus === 'mix' && seen.posts % 2 === 1);
    const st = (reqStatus === 'auto' || reqStatus === 'mix') ? 200 : reqStatus;
    r.fulfill({ status: st, contentType: 'application/json', body: st === 200 ? JSON.stringify(autoOn ? { ok: true, id: seen.posts, status: 'approved', auto_applied: 'moved' } : { ok: true, id: seen.posts, status: 'pending' }) : '{"ok":false,"error":"login_required"}' });
  });
  await ctx.addInitScript(u => {
    try { localStorage.clear(); if (u) { localStorage.setItem('mangoi_logged_user', JSON.stringify(u)); localStorage.setItem('mango_token', 'tok-' + (u.uid || u.user_id)); } } catch (e) {}
  }, user);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/lesson-postpone-demo.html?_nc=' + Date.now());
  await page.waitForFunction(() => typeof __MOB_STATE !== 'undefined' && __MOB_STATE !== 'loading', null, { timeout: 8000 }).catch(() => {});
  /* ⚠️ 옛 판(__MOB_STATE 없음)으로 되돌려도 «크래시» 가 아니라 «깔끔한 FAIL» 이 나게 typeof 로 읽는다. */
  await page.waitForTimeout(600);
  const st = await page.evaluate(() => ({
    state: typeof __MOB_STATE !== 'undefined' ? __MOB_STATE : '(없음)',
    real: typeof __MOB_REAL !== 'undefined' ? __MOB_REAL : null,
    sched: CURRENT_SCHEDULE.map(c => c.teacherName + ' ' + c.date + ' ' + c.hour),
    html: renderCurrentLesson(),
  }));
  ok('페이지 오류 없음', errs.length === 0, errs.join(' | '));
  ok('관리자 전용 API 를 부르지 않는다', seen.admin === 0, seen.admin);
  return { browser, page, st, seen };
}

/* ① 로그인 학생(jeong) — 진짜 수업 */
{
  const { browser, page, st, seen } = await run('① jeong 로그인 · 수업 5건', { user: { uid: 'jeong', name: 'jeong', role: 'student' }, mine: { status: 200, body: MINE_JEONG }, reqStatus: 401 });
  ok('학생용 API 를 부른다', seen.mine >= 1);
  ok('상태 real', st.state === 'real' && st.real === true, st.state);
  ok('Karl 이 없다', !st.sched.some(s => /Karl/.test(s)) && !/Karl/.test(st.html), st.sched);
  ok('강선생님·KRYSTEL 5건', st.sched.length === 5 && st.sched.filter(s => s.startsWith('중국어 강선생님')).length === 4 && st.sched.some(s => s.startsWith('KRYSTEL 2099-09-30 16:00')), st.sched);
  ok('«현재 수업 (5회)» 라고 말한다', /현재 수업 \(5회\)/.test(st.html), st.html.slice(0, 200));
  ok('남의 국기를 지어내지 않는다(🇵🇭 없음)', !st.html.includes('🇵🇭'));
  // 저장 실패(401)면 «완료» 라고 거짓말하지 않는다
  await page.evaluate(() => { state.mode = 'postpone'; state.cart = CURRENT_SCHEDULE.map(c => Object.assign({}, c)); state.weeklyTarget = CURRENT_SCHEDULE.length; onConfirm(); });
  await page.waitForFunction(() => document.getElementById('screen-done').classList.contains('active'), null, { timeout: 5000 }).catch(() => {});
  const t = await page.evaluate(() => [document.getElementById('done-title').textContent, document.getElementById('done-sub').textContent]);
  ok('학생 경로로 요청을 5건 보냈다', seen.posts === 5, seen.posts);
  ok('옛 관리자 경로로는 안 보낸다', !seen.oldPosts, seen.oldPosts);
  ok('학생 토큰(Bearer)을 싣는다', seen.auth === 'Bearer tok-jeong', seen.auth);
  ok('로그인 만료라고 말한다', /다시 로그인/.test(t[1]), t[1]);
  ok('401 이면 «저장되지 않았어요»', /저장되지 않았어요/.test(t[0]) && !/완료/.test(t[0]), t[0]);
  ok('0/5 를 말한다', /0\/5/.test(t[1]), t[1]);
  await browser.close();
}

/* ② 같은 학생 — 저장 성공(짝) */
{
  const { browser, page } = await run('② jeong · 저장 성공', { user: { uid: 'jeong', name: 'jeong' }, mine: { status: 200, body: MINE_JEONG }, reqStatus: 200 });
  await page.evaluate(() => { state.mode = 'postpone'; state.cart = CURRENT_SCHEDULE.map(c => Object.assign({}, c)); state.weeklyTarget = CURRENT_SCHEDULE.length; onConfirm(); });
  await page.waitForFunction(() => document.getElementById('screen-done').classList.contains('active'), null, { timeout: 5000 }).catch(() => {});
  const t = await page.evaluate(() => document.getElementById('done-title').textContent);
  ok('성공이면 «요청을 보냈어요»', /요청을 보냈어요/.test(t), t);
  await browser.close();
}

/* ②-b 자동 반영 — «시간표에 바로 반영» 이라고 말하고, «관리자 확인» 이라고 하지 않는다 */
{
  const { browser, page } = await run('②-b jeong · 자동 반영', { user: { uid: 'jeong', name: 'jeong' }, mine: { status: 200, body: MINE_JEONG }, reqStatus: 'auto' });
  await page.evaluate(() => { state.mode = 'postpone'; state.cart = CURRENT_SCHEDULE.map(c => Object.assign({}, c)); state.weeklyTarget = CURRENT_SCHEDULE.length; onConfirm(); });
  await page.waitForFunction(() => document.getElementById('screen-done').classList.contains('active'), null, { timeout: 5000 }).catch(() => {});
  const t = await page.evaluate(() => [document.getElementById('done-title').textContent, document.getElementById('done-sub').textContent]);
  ok('자동이면 «바로 반영» 이라고 말한다', /바로 반영/.test(t[0]) && !/요청을 보냈어요/.test(t[0]), t[0]);
  ok('자동이면 선생님·관리자 시간표도 말한다', /선생님·관리자 시간표에도 바로 반영/.test(t[1]), t[1]);
  ok('자동이면 «관리자가 확인한 뒤» 라고 안 한다', !/관리자가 확인한 뒤/.test(t[1]), t[1]);
  await browser.close();
}
/* ②-d 📅 (2026-10-06) 완료 화면에 «어느 수업 → 어디로» 가 한 줄씩 보인다(10/8 을 10/7 로 옮긴 것을 «10/7 연기» 로 오해한 일) */
{
  const { browser, page } = await run('②-d jeong · 옮겨진 날짜', { user: { uid: 'jeong', name: 'jeong' }, mine: { status: 200, body: MINE_JEONG }, reqStatus: 'auto' });
  const r = await page.evaluate(() => {
    const o = CURRENT_SCHEDULE[0];
    const nd = new Date(o.date + 'T00:00:00Z'); nd.setUTCDate(nd.getUTCDate() + 7);
    const to = nd.toISOString().slice(0, 10);
    state.mode = 'postpone'; state.cart = [Object.assign({}, o, { date: to, origIdx: 0 })]; onConfirm();
    return { from: fmtMD(o.date) + '(' + fmtDOW(o.date) + ') ' + o.hour, to: fmtMD(to) + '(' + fmtDOW(to) + ') ' + o.hour };
  });
  await page.waitForFunction(() => document.getElementById('screen-done').classList.contains('active'), null, { timeout: 5000 }).catch(() => {});
  const d = await page.evaluate(() => ({ n: document.querySelectorAll('#done-list li').length, li: (document.querySelector('#done-list li') || {}).textContent || '',
    fromStrike: (() => { const e = document.querySelector('#done-list .mv-from'); return e ? getComputedStyle(e).textDecorationLine : ''; })() }));
  ok('한 줄만(고른 수업 하나)', d.n === 1, d);
  ok('«기존 → 새 날짜» 순서로 보인다', d.li.indexOf(r.from) >= 0 && d.li.indexOf(r.to) > d.li.indexOf(r.from) && d.li.includes('→'), [r, d.li]);
  ok('바로 반영된 줄에 «반영됨» 표시', /반영됨/.test(d.li), d.li);
  ok('기존 날짜는 줄을 그어 «지나간 것» 으로', d.fromStrike.includes('line-through'), d.fromStrike);
  await browser.close();
}
/* ②-c 일부만 자동 — 몇 건이 바로 됐고 몇 건이 대기인지 사실대로 */
{
  const { browser, page } = await run('②-c jeong · 일부만 자동', { user: { uid: 'jeong', name: 'jeong' }, mine: { status: 200, body: MINE_JEONG }, reqStatus: 'mix' });
  await page.evaluate(() => { state.mode = 'postpone'; state.cart = CURRENT_SCHEDULE.map(c => Object.assign({}, c)); state.weeklyTarget = CURRENT_SCHEDULE.length; onConfirm(); });
  await page.waitForFunction(() => document.getElementById('screen-done').classList.contains('active'), null, { timeout: 5000 }).catch(() => {});
  const t = await page.evaluate(() => [document.getElementById('done-title').textContent, document.getElementById('done-sub').textContent]);
  ok('일부만 자동이면 «바로 반영» 제목이 아니다', /요청을 보냈어요/.test(t[0]), t[0]);
  ok('일부만 자동이면 건수를 나눠 말한다', /3건은 바로 반영됐고, 나머지 2건은 관리자가 확인/.test(t[1]), t[1]);
  await browser.close();
}

/* ③ 로그인했는데 못 불러옴 — 예시로 떨어지지 않는다 */
{
  const { browser, st } = await run('③ jeong · API 실패', { user: { uid: 'jeong' }, mine: { status: 404, body: { error: 'Not Found' } }, reqStatus: 401 });
  ok('상태 error', st.state === 'error', st.state);
  ok('예시(Karl) 로 떨어지지 않는다', st.sched.length === 0 && !/Karl/.test(st.html), st.sched);
  ok('«불러오지 못했어요» 라고 말한다', /불러오지 못했어요/.test(st.html));
  await browser.close();
}

/* ④ 로그인했는데 예약 0건 */
{
  const { browser, st } = await run('④ 예약 없음', { user: { user_id: 'nobody' }, mine: { status: 200, body: { ok: true, schedules: [] } }, reqStatus: 401 });
  ok('옛 모양 {user_id} 로도 계정을 읽는다', st.state === 'empty', st.state);
  ok('«예약된 수업이 없어요»', /예약된 수업이 없어요/.test(st.html) && !/Karl/.test(st.html));
  await browser.close();
}

/* ⑤ 비로그인 — 예시는 «예시» 라고 밝힌다 */
{
  const { browser, page, st, seen } = await run('⑤ 비로그인', { user: null, mine: { status: 200, body: MINE_JEONG }, reqStatus: 200 });
  ok('상태 demo · API 안 부름', st.state === 'demo' && seen.mine === 0, st.state);
  ok('«예시 수업» 이라고 밝힌다', /예시 수업/.test(st.html) && !/📌 현재 수업/.test(st.html), st.html.slice(0, 160));
  await page.evaluate(() => { state.mode = 'postpone'; state.cart = CURRENT_SCHEDULE.map(c => Object.assign({}, c)); state.weeklyTarget = CURRENT_SCHEDULE.length; onConfirm(); });
  await page.waitForTimeout(300);
  const t = await page.evaluate(() => document.getElementById('done-title').textContent);
  ok('예시로는 저장 안 됨을 말한다', /저장되지 않았어요|예시 화면/.test(t) && seen.posts === 0, t);
  await browser.close();
}

srv.close();
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
