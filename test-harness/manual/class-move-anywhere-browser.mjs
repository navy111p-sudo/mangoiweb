/*
 * 📅 «아무 날짜나» 연기·변경·취소 — 진짜 Chromium 에 공용 창(js/class-move-modal.js)을 띄워
 *    무작위 시나리오 수백 개를 «실제로 눌러» 본다 (2026-10-08 매니저 요청)
 *
 *   [보는 것]
 *     · 매주 수업: «실행» → 확인 → 먼저 나누기(POST class-schedules/:id {action:'split', focus_date})
 *                → 서버가 준 «그 날 id» 로만 연기·변경·취소가 나간다. 원래 매주 id 로는 split 말고 한 건도 안 나간다.
 *     · 확인창에서 «취소» → 요청 0건 (짝)
 *     · 나누기 실패(범위 밖·403·연결 끊김·그 날 못 만듦) → 그 뒤 요청 0건, 사람 말로 알린다 (짝)
 *     · 미리보기가 필요한 동작(앞으로 계속·연기보강) → 나눈 뒤 미리보기만, 적용은 안 한다 (한 번 더 누르게)
 *     · 날짜 수업: 나누기 요청이 절대 안 나간다 (짝)
 *     · 학생 목록 «고르기 창»(pickOpen): 본사면 매주 줄이 눌리고, 지사·대리점·카페24 매주 줄은 잠긴다 (짝)
 *
 *   돌리는 법:  PW_DIR=/tmp/pw node test-harness/manual/class-move-anywhere-browser.mjs   (N=300 기본, N=… 로 조절)
 *   ⚠️ 자동으로 안 돕니다(manual/ 규약) — 이 창·나누기를 건드리면 사람이 부르세요.
 *   ℹ️ 서버(API)는 이 검사 안에서 흉내 낸다 — 서버 쪽 판정은 test-harness/class_move_anywhere_harness.mjs(진짜 SQLite)가 본다.
 */
import { requireBrowser } from './_pw.mjs';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium, exe } = requireBrowser();
const PUB = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cloudflare-deploy', 'public');
const MODAL_SRC = process.env.MOVE_MODAL_SRC || join(PUB, 'js', 'class-move-modal.js');
const srv = createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/__t.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end('<!doctype html><meta charset="utf-8"><body><script src="/js/class-move-modal.js"></script></body>');
  }
  const f = u === '/js/class-move-modal.js' ? MODAL_SRC : join(PUB, u);
  if (!existsSync(f)) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': extname(f) === '.js' ? 'text/javascript; charset=utf-8' : 'text/plain' });
  res.end(readFileSync(f));
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const URL0 = 'http://127.0.0.1:' + srv.address().port + '/__t.html';
const N = Number(process.env.N || 300);
const DAY = '2026-10-12';

let PASS = 0, FAIL = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) PASS++;
  else { FAIL++; if (fails.length < 12) fails.push(name + (extra !== undefined ? ' — ' + String(JSON.stringify(extra)).slice(0, 400) : '')); }
}
let seed = Number(process.env.SEED || 7);
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = (a) => a[Math.floor(rnd() * a.length)];

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.addInitScript(() => {
  window.__cfg = {};
  window.__log = [];
  window.__confirms = [];
  window.__confirmAsked = 0;
  window.confirm = function () { window.__confirmAsked++; return window.__confirms.length ? window.__confirms.shift() : false; };
  window.alert = function () {};
  const J = (st, j) => Promise.resolve({ status: st, json: () => Promise.resolve(j) });
  window.fetch = function (url, init) {
    const m = (init && init.method) || 'GET';
    let body = null;
    try { body = init && init.body ? JSON.parse(init.body) : null; } catch (e) {}
    window.__log.push({ m, url: String(url), body });
    const c = window.__cfg;
    const u = String(url);
    if (m === 'GET' && u.indexOf('/api/pay/enroll/admin/move-candidates') === 0) {
      const q = new URL(u, location.href).searchParams;
      return J(200, { ok: true, date: q.get('date'), time: q.get('time'), current: { id: '27', name: 'MAIMAI', free: true }, candidates: [], teacher_change_ok: true, busy_count: 0 });
    }
    if (m === 'GET' && u.indexOf('/api/admin/class-schedules?') === 0) return J(c.listSt || 200, c.list);
    if (m === 'POST' && /^\/api\/admin\/class-schedules\/\d+$/.test(u)) {
      if (c.split === 'neterr') return Promise.reject(new Error('net'));
      if (c.split === 'ok') return J(200, { ok: true, made: 11, existing: [], skipped: [], cancelled: true, focus_date: body.focus_date, focus_id: 777 });
      if (c.split === 'focusnull') return J(200, { ok: true, made: 10, existing: [], skipped: [body.focus_date], cancelled: true, focus_date: body.focus_date, focus_id: null });
      if (c.split === 'notinplan') return J(200, { ok: false, error: 'focus_not_in_plan' });
      if (c.split === '403') return J(403, { ok: false, error: 'forbidden_scope' });
      return J(500, { ok: false });
    }
    if (m === 'POST' && u === '/api/admin/schedule-requests') {
      if (body && body.preview) return J(200, { ok: true, new_date: '2026-11-30', new_time: '19:30', label: '연기보강' });
      return J(200, { ok: true, id: 9001, new_date: body && body.new_date || '2026-11-30', new_time: body && body.new_time || '19:30', end_makeup: '연기보강' });
    }
    if (m === 'POST' && u === '/api/admin/schedule-requests/decide') return J(200, { ok: true, applied: c.applied || 'moved' });
    if (m === 'POST' && u === '/api/pay/enroll/admin/series-move') {
      if (body && body.apply) return J(200, { ok: true, moved: 3, count: 3 });
      return J(200, { ok: true, items: [{ from_date: '2026-10-12', from_time: '19:30', to_date: '2026-10-13', to_time: '19:30' }] });
    }
    if (m === 'DELETE' && /^\/api\/admin\/class-schedules\/\d+$/.test(u)) return J(200, { ok: true });
    return J(404, { error: 'Not Found' });
  };
});
await page.goto(URL0);
await page.waitForFunction(() => !!window.mangoiMoveModal);

/* 한 시나리오 — 페이지 안에서 실행하고 결과만 받아 온다 */
async function scenario(sc) {
  return page.evaluate(async (sc) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    window.mangoiMoveModal.close();
    window.__log = []; window.__confirms = sc.confirms.slice(); window.__confirmAsked = 0;
    window.__cfg = { split: sc.split, applied: sc.act === 'hold' ? 'postponed' : 'moved' };
    let closed = null;
    const row = sc.kind === 'weekly'
      ? { schedule_id: 500, start_ts: Date.parse('2026-10-12T19:30:00+09:00'), start_time: '19:30', student_name: '정우영', student_uid: 'jeong', teacher_name: 'MAIMAI', can_move: false, can_split: true }
      : { schedule_id: 600, start_ts: Date.parse('2026-10-12T19:30:00+09:00'), start_time: '19:30', student_name: '정우영', student_uid: 'jeong', teacher_name: 'MAIMAI', can_move: true, can_split: false };
    window.mangoiMoveModal.open(row, { day: sc.day, isEn: () => sc.en, canCancel: sc.canCancel, me: { name: 'Karl' }, onClose: (ch) => { closed = ch; } });
    const box = document.getElementById('tc-move-modal');
    const out = { banner: !!document.getElementById('tc-mv-split'), bannerText: (document.getElementById('tc-mv-split') || {}).textContent || '' };
    const mode = sc.act === 'hold' || sc.act === 'date' || sc.act === 'end' ? 'postpone' : sc.act;
    const mb = box.querySelector('[data-mv-mode="' + mode + '"]');
    out.modeBtn = !!mb;
    if (!mb) { window.mangoiMoveModal.close(); return out; }
    mb.click();
    if (mode === 'postpone') { const sb = box.querySelector('[data-mv-sub="' + sc.act + '"]'); if (sb) sb.click(); out.subBtn = !!sb; }
    if (sc.act === 'date' || sc.act === 'series') {
      document.getElementById('tc-mv-date').value = '2026-10-13';
      document.getElementById('tc-mv-time').value = '19:30';
      document.getElementById('tc-mv-date').dispatchEvent(new Event('change'));
      await sleep(450);                       /* 강사 확인(350ms 지연) 이 끝나게 */
    }
    await sleep(30);
    const pre = window.__log.length;
    out.preWrites = window.__log.filter((x) => x.m !== 'GET').map((x) => x.url + ' ' + JSON.stringify(x.body));
    document.getElementById('tc-mv-go').click();
    for (let i = 0; i < 40; i++) await sleep(25);
    out.log = window.__log.slice(pre).filter((x) => x.m !== 'GET');
    out.msg = (document.getElementById('tc-mv-msg') || {}).textContent || '';
    out.msgColor = (document.getElementById('tc-mv-msg') || { style: {} }).style.color || '';
    out.bannerAfter = (document.getElementById('tc-mv-split') || {}).textContent || '';
    out.asked = window.__confirmAsked;
    window.mangoiMoveModal.close();
    out.closed = closed;
    return out;
  }, sc);
}

const ACTS = ['hold', 'date', 'end', 'series', 'cancel'];
const SPLITS = ['ok', 'ok', 'ok', 'focusnull', 'notinplan', '403', 'neterr'];
const tally = {};
for (let i = 0; i < N; i++) {
  const sc = {
    kind: rnd() < 0.8 ? 'weekly' : 'dated',
    act: pick(ACTS), canCancel: rnd() < 0.7, split: pick(SPLITS), en: rnd() < 0.25, day: DAY,
    confirms: [rnd() < 0.85, rnd() < 0.85, true],
  };
  const tag = sc.kind + '/' + sc.act + '/' + (sc.kind === 'weekly' ? sc.split : '-');
  tally[tag] = (tally[tag] || 0) + 1;
  const o = await scenario(sc);
  const id = '#' + i + ' ' + tag + ' cc=' + sc.canCancel + ' conf=' + sc.confirms.slice(0, 2).join(',');
  check(id + ' 화면 오류 없음', errors.length === 0, errors.slice(-1));
  check(id + ' 매주 줄에만 «나눈 뒤 처리» 안내', o.banner === (sc.kind === 'weekly'));
  if (sc.kind === 'weekly') check(id + ' 안내 언어', sc.en ? /weekly class/i.test(o.bannerText) : /매주 반복 수업/.test(o.bannerText), o.bannerText);
  if (sc.act === 'cancel' && !sc.canCancel) { check(id + ' 지사·대리점에는 «취소» 버튼이 없다', o.modeBtn === false); continue; }
  check(id + ' 그 동작 버튼이 있다', o.modeBtn === true);
  check(id + ' «실행» 전에는 쓰기 요청 0건(미리보기 POST 만 허용)', o.preWrites.every((s) => /"preview":true|series-move.*"apply"/.test(s) ? !/"apply":true/.test(s) : /series-move/.test(s)), o.preWrites);
  const W = o.log;
  const splitReqs = W.filter((x) => x.m === 'POST' && /^\/api\/admin\/class-schedules\/\d+$/.test(x.url));
  const touches500 = W.filter((x) => (x.body && Number(x.body.schedule_id) === 500) || /\/500$/.test(x.url));
  if (sc.kind === 'dated') {
    check(id + ' 날짜 수업은 나누기 요청이 절대 없다', splitReqs.length === 0, W);
    if (sc.confirms[0] && (sc.act === 'hold' || sc.act === 'date' || sc.act === 'cancel'))
      check(id + ' 날짜 수업은 그 id(600)로 바로 처리', W.length > 0 && W.every((x) => (x.body && x.body.schedule_id ? Number(x.body.schedule_id) === 600 : true)) && (sc.act !== 'cancel' || W[0].url === '/api/admin/class-schedules/600'), W);
    continue;
  }
  /* ── 매주 ── */
  if (!sc.confirms[0]) {
    check(id + ' 나누기 확인에서 «취소» → 요청 0건', W.length === 0, W);
    check(id + ' 아무것도 안 바뀌었다고 닫힌다', o.closed === false, o.closed);
    continue;
  }
  check(id + ' 첫 쓰기 = 나누기(그 매주 id · split · dry_run:false · focus_date=그 날)', W.length >= 1 && W[0].url === '/api/admin/class-schedules/500'
    && W[0].body && W[0].body.action === 'split' && W[0].body.dry_run === false && W[0].body.focus_date === DAY, W[0]);
  check(id + ' 매주 id(500)는 나누기 말고는 한 번도 안 쓴다', touches500.length === 1, touches500);
  if (sc.split !== 'ok') {
    check(id + ' 나누기 실패 → 그 뒤 요청 0건', W.length === 1, W);
    check(id + ' 빨간 글씨로 사람 말을 한다', /185, 28, 28|b91c1c/.test(o.msgColor) && o.msg.length > 5, o.msg);
    if (sc.split === 'notinplan' || sc.split === '403') {
      check(id + ' «아무것도 안 바꿨다» 를 말한다', sc.en ? /Nothing was changed/.test(o.msg) : /아무것도 바꾸지 않았습니다/.test(o.msg), o.msg);
      check(id + ' 안 바뀌었으니 목록을 다시 받지 않는다', o.closed === false, o.closed);
    } else {
      check(id + ' 결과를 모르거나 일부 썼으니 닫으면 목록을 다시 받는다', o.closed === true, o.closed);
    }
    continue;
  }
  check(id + ' 나눈 뒤 안내가 «✅ 나눴습니다» 로 바뀐다', /✅/.test(o.bannerAfter), o.bannerAfter);
  check(id + ' 나눴으니 닫으면 목록을 다시 받는다', o.closed === true, o.closed);
  const rest = W.slice(1);
  check(id + ' 나눈 뒤 요청은 전부 그 날 id(777)', rest.every((x) => (x.body && x.body.schedule_id != null ? Number(x.body.schedule_id) === 777 : true) && !/\/500$/.test(x.url)), rest);
  if (sc.act === 'end') {
    check(id + ' 연기보강: 미리보기만(777) · 적용 안 함 · «한 번 더» 안내', rest.length === 1 && rest[0].body.preview === true && Number(rest[0].body.schedule_id) === 777
      && (sc.en ? /again/i.test(o.msg) : /한 번 더/.test(o.msg)), { rest, msg: o.msg });
  } else if (sc.act === 'series') {
    check(id + ' 앞으로 계속: 미리보기만(777) · apply 없음', rest.length >= 1 && rest.every((x) => x.url === '/api/pay/enroll/admin/series-move' && !x.body.apply) && Number(rest[0].body.schedule_id) === 777, rest);
  } else if (!sc.confirms[1]) {
    check(id + ' 두 번째 확인에서 «취소» → 나누기 뒤 요청 0건', rest.length === 0, rest);
  } else if (sc.act === 'cancel') {
    check(id + ' 취소: DELETE 그 날 id(777) 한 건', rest.length === 1 && rest[0].m === 'DELETE' && rest[0].url === '/api/admin/class-schedules/777', rest);
  } else {
    const req = rest.find((x) => x.url === '/api/admin/schedule-requests');
    check(id + ' 연기·지정 날짜: 요청(777) → 승인 두 건', rest.length === 2 && !!req && Number(req.body.schedule_id) === 777 && rest[1].url === '/api/admin/schedule-requests/decide'
      && (sc.act !== 'date' || (req.body.new_date === '2026-10-13' && req.body.new_time === '19:30')), rest);
  }
}

/* ── 학생 목록 «고르기 창» ─────────────────────────────────────────────── */
async function pickCase(canSplit) {
  return page.evaluate(async (canSplit) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    window.mangoiMoveModal.close();
    const kst = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
    const add = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
    window.__cfg = { list: { ok: true, items: [
      { id: 500, user_id: 'jeong', student_name: '정우영', day_of_week: '1,3', start_time: '19:30', duration_min: 20, status: 'active', source: 'adm-enroll:1', teacher_name: 'MAIMAI' },
      { id: 501, user_id: 'jeong', student_name: '정우영', day_of_week: 'Fri', start_time: '20:00', duration_min: 20, status: 'active', source: 'c24-mirror', teacher_name: 'FAR' },
      { id: 600, user_id: 'jeong', student_name: '정우영', scheduled_date: add(kst, 3), start_time: '18:00', duration_min: 20, status: 'active', source: 'adm-enroll:2', teacher_name: 'KAYE' },
      { id: 601, user_id: 'jeong', student_name: '정우영', scheduled_date: add(kst, 4), start_time: '18:00', duration_min: 20, status: 'postponed', source: 'adm-enroll:2' },
      { id: 602, user_id: 'lms', scheduled_date: add(kst, 2), start_time: '18:00', status: 'active' } ] } };
    window.mangoiMoveModal.pickOpen({ uid: 'jeong', name: '정우영' }, { isEn: () => false, canCancel: canSplit, canSplit: canSplit, me: { name: 'Karl' }, days: 28 });
    for (let i = 0; i < 20; i++) { await sleep(20); if (document.querySelector('[data-pk-i]')) break; }
    const btns = Array.from(document.querySelectorAll('#tc-pick-list [data-pk-i]'));
    const info = btns.map((b) => ({ t: b.textContent, dis: b.disabled }));
    const list = window.__log.filter((x) => x.m === 'GET' && x.url.indexOf('/api/admin/class-schedules?') === 0).pop();
    /* 매주(나눌 수 있는) 줄을 눌러 본다 */
    const wk = btns.find((b) => /매주 \(나눈 뒤 처리\)/.test(b.textContent));
    let opened = null;
    if (wk) { wk.click(); await sleep(20); opened = { modal: !!document.getElementById('tc-move-modal'), banner: !!document.getElementById('tc-mv-split'), pickGone: !document.getElementById('tc-pick-modal'), day: (document.getElementById('tc-move-modal') || { getAttribute: () => '' }).getAttribute('data-day') }; }
    const lockedBtn = btns.find((b) => b.disabled);
    let lockedOpens = null;
    if (lockedBtn) { window.mangoiMoveModal.close(); lockedBtn.click(); await sleep(20); lockedOpens = !!document.getElementById('tc-move-modal'); }
    window.mangoiMoveModal.close();
    const pb = document.getElementById('tc-pick-modal'); if (pb) pb.remove();
    return { info, listUrl: list && list.url, opened, lockedOpens, kst };
  }, canSplit);
}
{
  const hq = await pickCase(true);
  check('고르기: 그 학생·오늘부터로 목록을 묻는다', hq.listUrl && /user_id=jeong/.test(hq.listUrl) && hq.listUrl.indexOf('from_date=' + hq.kst) > 0, hq.listUrl);
  check('고르기: 연기된 날짜 수업·자리표시(lms)는 안 보인다', hq.info.every((x) => !/18:00/.test(x.t) || /KAYE/.test(x.t)), hq.info);
  check('고르기(본사): 매주 줄이 눌리고 «나눈 뒤 처리» 로 연다', hq.opened && hq.opened.modal && hq.opened.banner && hq.opened.pickGone && /^\d{4}-\d{2}-\d{2}$/.test(hq.opened.day), hq.opened);
  check('고르기(본사): 카페24 매주 줄은 잠겨 있고 눌러도 안 열린다', hq.info.some((x) => x.dis && /카페24/.test(x.t)) && hq.lockedOpens === false, hq.info);
  check('고르기(본사): 날짜 수업은 눌린다', hq.info.some((x) => !x.dis && /날짜 수업/.test(x.t)));
  const br = await pickCase(false);
  check('고르기(지사·대리점): 매주 줄은 «본사 계정에서» 로 잠긴다 (짝)', br.info.filter((x) => /매주 수업 — 본사 계정에서/.test(x.t)).every((x) => x.dis) && br.info.some((x) => /본사 계정에서/.test(x.t)) && !br.opened, br.info);
  check('고르기(지사·대리점): 날짜 수업은 그대로 눌린다 (짝)', br.info.some((x) => !x.dis && /날짜 수업/.test(x.t)));
}
check('전체 — 화면 오류 0건', errors.length === 0, errors.slice(0, 3));

await browser.close(); srv.close();
console.log('시나리오 분포: ' + JSON.stringify(tally));
for (const f of fails) console.log('  FAIL ' + f);
console.log('\n결과: PASS ' + PASS + ' / FAIL ' + FAIL + '  (시나리오 ' + N + '개)');
if (FAIL) process.exit(1);
