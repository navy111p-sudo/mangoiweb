/*
 * 📅 「오늘 전체 수업」 줄의 연기·변경·취소 — 실제 브라우저에 그려서 확인한다 (2026-09-22)
 *
 *   [무엇을 보나]
 *     매니저가 학생 이름 옆에서 바로 수업을 연기·변경·취소할 수 있는가,
 *     그리고 **해서는 안 되는 줄에는 그 길이 없는가.**
 *
 *   [왜 브라우저인가]
 *     ⚠️ 문자열 하니스로는 못 본다 — 함수도 값도 다 «있고» 틀린 것은
 *        «무엇이 그려지고 무슨 요청이 나가는가» 뿐이다.
 *     ⚠️ `hidden` 은 작성자 CSS 가 display 를 정하면 진다(CLAUDE.md 2장) —
 *        「있다」가 아니라 **getComputedStyle 로 «보이는가»** 를 잰다.
 *
 *   [짝으로 본다 — 한쪽만 보면 반대 방향이 통째로 통과한다]
 *     · «칩이 붙는다» 옆에 «카페24·매주반복 줄에는 안 붙는다»
 *     · «실행하면 요청이 나간다» 옆에 «확인창을 취소하면 한 건도 안 나간다»
 *     · «본사는 취소가 보인다» 옆에 «지사·대리점에는 안 보이고 이유를 말한다»
 *     · «옮겼다» 옆에 «못 옮겼을 때 초록으로 말하지 않는다»(거짓 성공 금지)
 *
 *   (2026-09-23) 줄 아래 «패널» 이 관리자 화면과 같은 **공용 창**(js/class-move-modal.js)으로 바뀌었다
 *   — 그 파일은 버튼을 누를 때만 받으므로 file:// 로는 못 연다(절대경로 /js/… 가 404). 그래서
 *     이 검사는 작은 로컬 서버로 public/ 을 그대로 서빙한다.
 *
 *   돌리는 법:  PW_DIR=/tmp/pw node test-harness/manual/manager-today-reschedule-browser.mjs
 *   ⚠️ 자동으로 안 돕니다(manual/ 규약) — 이 줄·패널을 건드리면 사람이 부르세요.
 */

import { requireBrowser } from './_pw.mjs';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium, exe } = requireBrowser();
const PUB = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cloudflare-deploy', 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json' };
const srv = createServer((req, res) => {
  const f = join(PUB, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(PUB) || !existsSync(f)) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const FILE = 'http://127.0.0.1:' + srv.address().port + '/manager.html';
const DAY = '2026-09-22';

/* 오늘 수업 네 줄 — 서버(/api/admin/classes/today)가 주는 모양 그대로.
   ⚠️ 네 갈래가 «전부» 있어야 한다. 하나라도 빠지면 그 갈래의 검사가
      «없어서 통과» 하는 헛돎이 된다. */
const SESSIONS = [
  { schedule_id: 1001, source: 'mangoi', can_move: true,  student_name: 'Minkuen Kim',
    student_uid: 'umc101', teacher_name: 'KES', academy: "UMC Mom's English",
    start_time: '15:00', start_ts: 1, join_open: false, textbook_assigned: true, textbook: 'BTS 1' },
  { schedule_id: 1002, source: 'mangoi', can_move: false, student_name: 'Weekly Kid',
    student_uid: 'wk01', teacher_name: 'KAYE',
    start_time: '16:00', start_ts: 2, join_open: false, textbook_assigned: true, textbook: 'BTS 2' },
  { schedule_id: null,  source: 'cafe24', can_move: false, student_name: 'LMS Kid',
    student_uid: 'lms01', teacher_name: 'RICA',
    start_time: '17:00', start_ts: 3, join_open: false, textbook_assigned: true, textbook: 'BTS 3' },
  { schedule_id: 1004, source: 'mangoi', can_move: true,  student_name: 'Hyung Jun Kim',
    student_uid: 'hj01', teacher_name: 'KAYE',
    start_time: '18:00', start_ts: 4, join_open: false, textbook_assigned: true, textbook: 'BTS 4' },
];

let PASS = 0, FAIL = 0;
function check(name, cond, extra) {
  if (cond) { PASS++; console.log('  OK   ' + name); }
  else { FAIL++; console.log('  FAIL ' + name + (extra !== undefined ? ' — ' + extra : '')); }
}

/** 한 판 — scope 와 /decide 응답을 갈아 끼워 여러 상황을 본다. */
async function open(browser, opts) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.addInitScript((cfg) => {
    try { localStorage.setItem('mangoi_lang', cfg.lang || 'ko'); } catch (e) {}
    window.__sent = [];                     // 나간 요청을 그대로 적어 둔다
    const rf = window.fetch;
    const J = (o, st) => Promise.resolve(new Response(JSON.stringify(o), { status: st || 200 }));
    window.fetch = function (u, o) {
      u = String(u); o = o || {};
      const m = (o.method || 'GET').toUpperCase();
      let body = null;
      try { body = o.body ? JSON.parse(o.body) : null; } catch (e) {}
      if (u.indexOf('/api/admin/') === 0) window.__sent.push({ m: m, u: u, body: body });

      if (u.indexOf('/api/admin/classes/today') === 0) {
        return J({ ok: true, date: cfg.day, sessions: cfg.sessions,
                   counts: { joinable: 0, cafe24: 1 }, contact_source: 'retention' });
      }
      if (u.indexOf('/api/admin/exec/summary') === 0) return J({ ok: true, scope: { type: cfg.scope } });
      if (u.indexOf('/api/admin/stats/today') === 0) return J({ ok: true });
      if (u.indexOf('/api/admin/me') === 0) return J({ ok: true, name: 'Karl' });
      if (u.indexOf('/api/admin/schedule-requests/decide') === 0) {
        return cfg.decideFail ? J({ ok: false, error: 'forbidden_scope' }, 403)
                              : J({ ok: true, status: 'approved', applied: cfg.applied });
      }
      if (u.indexOf('/api/admin/schedule-requests') === 0) return J({ ok: true, id: 9001, status: 'pending' });
      if (/\/api\/admin\/class-schedules\/\d+$/.test(u)) return J({ ok: true, status: 'cancelled' });
      if (u.indexOf('/api/pay/enroll/admin/move-candidates') === 0) {
        window.__sent.push({ m: m, u: u, body: null });
        const q = new URL(u, location.href).searchParams;
        return J({ ok: true, date: q.get('date'), time: q.get('time'),
                   current: { id: '5', name: 'KES', display_name: 'KES', free: true },
                   candidates: [{ id: '7', name: 'FAR', display_name: 'FAR', free: true, photo: '' }],
                   busy_count: 1, teacher_change_ok: true });
      }
      if (u.indexOf('/api/pay/enroll/admin/series-move') === 0) {
        window.__sent.push({ m: m, u: u, body: body });
        const items = [{ id: 1001, from_date: '2026-09-22', from_time: '15:00', to_date: '2026-09-23', to_time: '18:20' },
                       { id: 1011, from_date: '2026-09-29', from_time: '15:00', to_date: '2026-09-30', to_time: '18:20' }];
        return J({ ok: true, dry_run: !(body && body.apply), applied: !!(body && body.apply),
                   moved: body && body.apply ? 2 : undefined, count: 2, items: items,
                   teacher: { changed: !!(body && body.teacher_id), from_name: 'KES', to_name: 'FAR' } });
      }
      return J({ ok: true });
    };
  }, { day: DAY, sessions: SESSIONS, scope: opts.scope || 'hq',
       applied: opts.applied || 'postponed', decideFail: !!opts.decideFail, lang: opts.lang || 'ko' });

  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  await page.evaluate(() => { const c = document.getElementById('c-today'); if (c) c.open = true; });
  await page.waitForTimeout(500);
  return { ctx, page, errors };
}

/** 그 줄에 «연기·변경» 칩이 있는가 */
const chip = (page, sid) => page.evaluate((n) => !!document.querySelector('[data-ta="' + n + '"]'), sid);

/** 요소가 **실제로 보이는가** — hidden 속성만 보면 작성자 CSS 에 진다 */
const visible = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return null;
  return getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0;
}, sel);

/** 누르기 — **크래시 대신 깔끔한 FAIL** 로 끝낸다.
 *  🪤 `page.click()` 을 그냥 쓰면 요소가 안 보일 때 **30초 타임아웃 + 예외**로 죽는다.
 *     그러면 ❌ 가 한 줄도 안 남아 «무엇이 깨졌는지» 를 못 본다(CLAUDE.md 2장).
 *     실측(2026-09-22 변이시험): `pan.hidden = false` 한 줄을 지우자 이 하니스가
 *     TimeoutError 로 죽어 **exit=1 인데 ❌=0** — «검출» 처럼 보이지만 아무 말도 못 했다.
 *  ⚠️ 그래서 짧게 기다리고, 실패하면 그 자리를 이름으로 찍는다. */
async function tap(page, sel, why) {
  try {
    await page.click(sel, { timeout: 2500 });
    return true;
  } catch (e) {
    check((why || '눌린다') + ' — ' + sel, false, '보이지 않거나 없습니다');
    return false;
  }
}

(async () => {
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });

  /* ══ ① 본사 — 어느 줄에 길이 열리는가 ══════════════════════════════════ */
  console.log('\n[1] 본사(hq) — 칩이 «옳은 줄에만» 붙는다');
  let s = await open(browser, { scope: 'hq' });
  s.page.on('dialog', (d) => d.accept());

  const drawn = await s.page.evaluate(() => document.querySelectorAll('#todayAllBody .row').length);
  check('전제 — 오늘 수업 네 줄이 그려졌다', drawn === 4, '실제: ' + drawn);

  check('날짜 지정 수업에는 칩이 붙는다 (1001)', (await chip(s.page, 1001)) === true);
  check('날짜 지정 수업에는 칩이 붙는다 (1004)', (await chip(s.page, 1004)) === true);
  // 짝 — 이 둘이 없으면 «전부 붙이기» 도 통과한다
  check('매주 반복 줄에는 칩이 «없다» (1002)', (await chip(s.page, 1002)) === false);
  check('카페24(LMS) 줄에는 칩이 «없다»', await s.page.evaluate(() =>
    !document.querySelector('[data-ta="null"]') && !document.querySelector('[data-ta=""]')));
  check('매주 반복 줄은 «왜 안 되는지» 를 보이는 글자로 말한다', await s.page.evaluate(() =>
    /매주 반복/.test(document.getElementById('todayAllBody').textContent || '')));

  /* ══ ② 창 — 열리는가, 버튼이 맞는가 (관리자 화면과 같은 공용 창) ══════════ */
  console.log('\n[2] 연기·변경 창');
  const M = '#tc-move-modal';
  check('처음에는 창이 없다', (await visible(s.page, M)) === null);
  check('⛔ 첫 화면에 공용 창 파일을 받지 않았다 (외부 리소스 0개 계약)', await s.page.evaluate(() =>
    !window.mangoiMoveModal && !document.querySelector('script[src*="class-move-modal"]')));
  await tap(s.page, '[data-ta="1001"]');
  await s.page.waitForTimeout(600);
  check('칩을 누르면 창이 **보인다**', (await visible(s.page, M)) === true);
  check('버튼 셋: 연기 · 변경(앞으로 계속) · 취소', await s.page.evaluate(() =>
    [...document.querySelectorAll('#tc-move-modal [data-mv-mode]')].map((b) => b.getAttribute('data-mv-mode')).join(',') === 'postpone,series,cancel'));
  check('기본은 «연기 ▸ 완전히(날짜 미정)» 가 눌려 있다', await s.page.evaluate(() =>
    !!document.querySelector('#tc-move-modal [data-mv-mode="postpone"][aria-pressed="true"]')
    && !!document.querySelector('#tc-move-modal [data-mv-sub="hold"][aria-pressed="true"]')));
  check('«완전히 연기» 에서는 날짜칸이 안 보인다', (await visible(s.page, '#tc-mv-when')) === false);
  await tap(s.page, '#tc-move-modal [data-mv-sub="date"]');
  await s.page.waitForTimeout(700);
  check('«지정한 날짜로 연기» 를 누르면 날짜칸이 보인다 (짝)', (await visible(s.page, '#tc-mv-when')) === true);
  check('새 시간에 되는 강사 사진 카드가 나온다', await s.page.evaluate(() =>
    document.querySelectorAll('#tc-mv-teachers [data-mv-pick]').length === 2));
  check('안내 한 줄이 «이번 한 번만» 이라고 말한다', await s.page.evaluate(() =>
    /이번 한 번만/.test(document.getElementById('tc-mv-note').textContent)));

  /* ══ ③ 확인창을 «취소» 하면 한 건도 안 나간다 ═══════════════════════════ */
  console.log('\n[3] 확인창을 취소하면 아무 일도 안 일어난다 (짝)');
  await s.ctx.close();
  s = await open(browser, { scope: 'hq' });
  s.page.on('dialog', (d) => d.dismiss());
  await tap(s.page, '[data-ta="1001"]');
  await s.page.waitForTimeout(600);
  await tap(s.page, '#tc-mv-go');
  await s.page.waitForTimeout(250);
  check('쓰기 요청이 한 건도 안 나갔다', await s.page.evaluate(() =>
    window.__sent.filter((r) => r.m === 'POST' || r.m === 'DELETE' || r.m === 'PATCH').length === 0),
    JSON.stringify(await s.page.evaluate(() =>
      window.__sent.filter((r) => r.m === 'POST' || r.m === 'DELETE').map((r) => r.m + ' ' + r.u))));

  /* ══ ④ 완전히 연기 — 실제로 무엇을 보내는가 ═════════════════════════════ */
  console.log('\n[4] 완전히 연기 실행');
  await s.ctx.close();
  s = await open(browser, { scope: 'hq', applied: 'postponed' });
  s.page.on('dialog', (d) => d.accept());
  await tap(s.page, '[data-ta="1001"]');
  await s.page.waitForTimeout(600);
  await tap(s.page, '#tc-mv-go');
  await s.page.waitForTimeout(600);
  let sent = await s.page.evaluate(() => window.__sent);
  const mk = sent.find((r) => r.m === 'POST' && /schedule-requests$/.test(r.u));
  const dc = sent.find((r) => r.m === 'POST' && /schedule-requests\/decide$/.test(r.u));
  check('요청을 만들었다 (POST /schedule-requests)', !!mk && mk.body.request_type === 'postpone');
  check('그 자리에서 승인했다 (POST /decide)', !!dc && dc.body && dc.body.action === 'approve');
  check('«누가 냈는가» 를 admin 으로 적는다', !!mk && mk.body.requester_role === 'admin');
  check('처리한 사람 이름을 싣는다 (Karl)', !!mk && mk.body.requester_name === 'Karl');
  check('그 수업의 schedule_id 를 보낸다', !!mk && mk.body.schedule_id === 1001);
  check('연기에는 새 날짜를 안 보낸다 (짝)', !!mk && !mk.body.new_date && !mk.body.new_time);
  check('DELETE 는 안 나갔다 (짝)', sent.filter((r) => r.m === 'DELETE').length === 0);
  check('화면이 «연기 처리했습니다» 로 답한다', await s.page.evaluate(() =>
    /연기 처리/.test(document.getElementById('tc-mv-msg').textContent || '')));
  check('그 안내가 «성공» 색이다', await s.page.evaluate(() =>
    getComputedStyle(document.getElementById('tc-mv-msg')).color === 'rgb(4, 120, 87)'));
  await tap(s.page, '#tc-mv-close');
  await s.page.waitForTimeout(400);
  check('닫으면 목록을 다시 받는다', await s.page.evaluate(() =>
    window.__sent.filter((r) => r.u.indexOf('/api/admin/classes/today') === 0).length >= 2));

  /* ══ ⑤ 지정한 날짜 — 못 옮겼을 때 초록으로 말하지 않는다 ═════════════════ */
  console.log('\n[5] 지정한 날짜로 연기 · 겹쳐서 못 옮긴 경우 (거짓 성공 금지)');
  await s.ctx.close();
  s = await open(browser, { scope: 'hq', applied: 'conflict' });
  s.page.on('dialog', (d) => d.accept());
  await tap(s.page, '[data-ta="1004"]');
  await s.page.waitForTimeout(600);
  await tap(s.page, '#tc-move-modal [data-mv-sub="date"]');
  await s.page.fill('#tc-mv-date', '2026-09-25');
  await s.page.fill('#tc-mv-time', '19:30');
  await s.page.dispatchEvent('#tc-mv-time', 'change');
  await s.page.waitForTimeout(900);
  await tap(s.page, '#tc-mv-go');
  await s.page.waitForTimeout(600);
  sent = await s.page.evaluate(() => window.__sent);
  const mk2 = sent.find((r) => r.m === 'POST' && /schedule-requests$/.test(r.u));
  check('«이번 한 번 옮기기(change)» 로 보낸다', !!mk2 && mk2.body.request_type === 'change');
  check('새 날짜·시각을 그대로 싣는다', !!mk2 && mk2.body.new_date === '2026-09-25' && mk2.body.new_time === '19:30');
  check('못 옮겼으면 «초록» 이 아니다', await s.page.evaluate(() =>
    getComputedStyle(document.getElementById('tc-mv-msg')).color !== 'rgb(4, 120, 87)'
    && /못 옮겼/.test(document.getElementById('tc-mv-msg').textContent)));

  /* ══ ⑥ 변경 · 앞으로 계속 — 미리보기 뒤 한 번에 ═══════════════════════════ */
  console.log('\n[6] 변경 · 앞으로 계속');
  await s.ctx.close();
  s = await open(browser, { scope: 'hq' });
  s.page.on('dialog', (d) => d.accept());
  await tap(s.page, '[data-ta="1001"]');
  await s.page.waitForTimeout(600);
  await tap(s.page, '#tc-move-modal [data-mv-mode="series"]');
  await s.page.fill('#tc-mv-date', '2026-09-23');
  await s.page.fill('#tc-mv-time', '18:20');
  await s.page.dispatchEvent('#tc-mv-time', 'change');
  await s.page.waitForTimeout(1200);
  check('미리보기가 «앞으로 2회» 를 보여 준다', await s.page.evaluate(() =>
    /2회/.test(document.getElementById('tc-mv-series').textContent)));
  check('미리보기 요청에는 apply 가 없다', await s.page.evaluate(() =>
    window.__sent.filter((r) => r.u.indexOf('series-move') >= 0).every((r) => !r.body.apply)));
  await tap(s.page, '#tc-mv-go');
  await s.page.waitForTimeout(600);
  check('실행하면 apply:true 한 번', await s.page.evaluate(() =>
    window.__sent.filter((r) => r.u.indexOf('series-move') >= 0 && r.body && r.body.apply === true).length === 1));
  check('화면이 «앞으로 2회를 옮겼습니다» 로 답한다', await s.page.evaluate(() =>
    /2회를 옮겼습니다/.test(document.getElementById('tc-mv-msg').textContent)));

  /* ══ ⑦ 승인이 실패하면 «요청은 남아 있다» 고 말한다 ═════════════════════ */
  console.log('\n[7] 승인 실패 — 잃은 것이 없다고 말한다');
  await s.ctx.close();
  s = await open(browser, { scope: 'hq', decideFail: true });
  s.page.on('dialog', (d) => d.accept());
  await tap(s.page, '[data-ta="1001"]');
  await s.page.waitForTimeout(600);
  await tap(s.page, '#tc-mv-go');
  await s.page.waitForTimeout(600);
  check('«요청은 저장됐습니다» 를 알려 준다', await s.page.evaluate(() =>
    /요청은 저장/.test(document.getElementById('tc-mv-msg').textContent || '')));
  check('실패 색으로 말한다', await s.page.evaluate(() =>
    getComputedStyle(document.getElementById('tc-mv-msg')).color === 'rgb(185, 28, 28)'));

  /* ══ ⑧ 취소 — 본사만. 지사·대리점에는 «왜 없는지» 를 말한다 ═════════════ */
  console.log('\n[8] 취소');
  await s.ctx.close();
  s = await open(browser, { scope: 'hq' });
  s.page.on('dialog', (d) => d.accept());
  await tap(s.page, '[data-ta="1001"]');
  await s.page.waitForTimeout(600);
  check('본사에는 «수업 취소» 가 있다', await s.page.evaluate(() =>
    !!document.querySelector('#tc-move-modal [data-mv-mode="cancel"]')));
  await tap(s.page, '#tc-move-modal [data-mv-mode="cancel"]');
  await tap(s.page, '#tc-mv-go');
  await s.page.waitForTimeout(600);
  sent = await s.page.evaluate(() => window.__sent);
  const del = sent.find((r) => r.m === 'DELETE');
  check('진짜 취소 경로(DELETE /class-schedules/:id)를 부른다', !!del && /\/class-schedules\/1001$/.test(del.u));
  check('취소를 «연기 요청» 으로 보내지 않는다 (짝)', sent.filter((r) =>
    r.m === 'POST' && /schedule-requests$/.test(r.u)).length === 0);
  check('«실행» 버튼이 맨 위에 있다 (가려지지 않는다)', await s.page.evaluate(() => {
    const g = document.getElementById('tc-mv-go'); g.scrollIntoView({ block: 'center' });
    const r = g.getBoundingClientRect();
    return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === g;
  }));

  await s.ctx.close();
  s = await open(browser, { scope: 'agency' });
  await tap(s.page, '[data-ta="1001"]');
  await s.page.waitForTimeout(600);
  check('지사·대리점에는 «수업 취소» 가 없다 (403 나는 버튼을 주지 않는다)', await s.page.evaluate(() =>
    !document.querySelector('#tc-move-modal [data-mv-mode="cancel"]')));
  check('그래도 연기·변경은 그대로 된다 (짝)', await s.page.evaluate(() =>
    document.querySelectorAll('#tc-move-modal [data-mv-mode]').length === 2));
  check('«왜 없는지» 를 말해 준다', await s.page.evaluate(() =>
    /본사 계정/.test((document.getElementById('tc-move-modal') || {}).textContent || '')));

  /* ══ ⑨ 영어 화면 ═══════════════════════════════════════════════════════ */
  console.log('\n[9] 영어 화면에서는 영어로 말한다');
  await s.ctx.close();
  s = await open(browser, { scope: 'hq', lang: 'en' });
  await tap(s.page, '[data-ta="1001"]');
  await s.page.waitForTimeout(600);
  check('창 제목·버튼이 영어다', await s.page.evaluate(() => {
    const t = document.getElementById('tc-move-modal').textContent;
    return /Postpone \/ move class/.test(t) && /from now on/.test(t) && !/수업 연기·변경/.test(t);
  }));

  check('콘솔에 스크립트 오류가 없다', s.errors.length === 0, s.errors.join(' | '));

  await s.ctx.close();
  await browser.close();
  srv.close();
  console.log('\n결과: PASS ' + PASS + ' / FAIL ' + FAIL);
  process.exit(FAIL ? 1 : 0);
})();
