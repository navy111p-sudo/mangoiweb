/*
 * 💳 「대신 결재」 접기 — 실제 브라우저에 그려서 확인한다 (2026-09-10)
 *
 *   [무엇을 보나]
 *     ₱5,000 미만 건이 대표님 결재함에서 «승인 버튼과 함께» 뜨지 않는지.
 *
 *   [왜 만들었나]
 *     2026-09-09 부터 돈 나가는 건은 «결재권자(장지웅 부장) → 경영진» 으로 갈렸고,
 *     소액은 결재권자 1단계로 끝난다(경영진은 「확인」만 — needsExecAck).
 *     그런데 화면은 그 소액 건을 경영진 결재함에도 «승인/반려 버튼과 함께» 그렸다
 *     (경영진이 부재중 대신 결재할 수 있게 열어 둔 자리 — canDecideStage 의 'mgr').
 *     그래서 2026-09-10 사장님 「₱5,000 미만은 장 부장님만 결재하고 저는 확인만」이
 *     화면에서 무너져 있었다. 게다가 「N건 한 번에 승인」이 그 건들을 쓸어 담았다.
 *
 *     ⛔ 목록에서 «빼지는» 않았다 — 결재권자가 휴가·출장이면 그 건이 그대로 멈춘다
 *        (8/30 긴급 건이 그렇게 5일 서 있었다). 그래서 «접어 두고 펼치면 된다».
 *
 *   [짝으로 본다]
 *     «접힌다» 만 검사하면 **전부 접는 코드**도 통과한다. 그래서
 *     «내가 주 결재자인 건은 그대로 승인 버튼이 있다»·«펼치면 나온다» 를 함께 센다.
 *
 *   ⚠️ 문자열 하니스로는 이 사고를 못 본다 — 함수도 값도 다 «있고» 틀린 것은
 *      «무엇이 화면에 그려지는가» 뿐이다.
 *
 *   돌리는 법:  PW_DIR=/tmp/pw node test-harness/manual/approval-proxy-fold-browser.mjs
 *   ⚠️ 자동으로 안 돕니다(manual/ 규약) — 결재함 카드를 건드리면 사람이 부르세요.
 */

import { requireBrowser, fileUrl } from './_pw.mjs';

const { chromium, exe } = requireBrowser();
const FILE = fileUrl('cloudflare-deploy/public/work.html');

const now = Date.now();
const DAY = 86400000;

/* 결재함 한 줄의 공통 모양 — 값은 실제 D1 행을 본떴다. */
function row(o) {
  return Object.assign({
    req_type: 'purchase', type_ko: '물품 구입', type_en: 'Purchase',
    requester_username: 'mgr_karl', requester_name: 'Karl',
    currency: 'PHP', status: 'pending',
    created_at: now - 3600000, stage_due_at: now + DAY,
    stage_seq: 1, stage_total: 1, escalated: false, flags: [], has_file: false,
    steps: [{ seq: 1, role: 'mgr', status: 'active' }],
  }, o);
}

const HOME = {
  ok: true,
  me: { username: 'admin', name: '정우영', is_exec: true, is_ph_manager: false, is_teacher: false },
  colleagues: [{ username: 'mgr_jjw', name: '장지웅' }],
  my_delegate: null,
  can_approve: true, pending: 4,
  types: [{ key: 'purchase', ko: '물품 구입', en: 'Purchase', needs_amount: true, wants_file: true }],
  inbox: [
    // ① 소액(₱2,500) — 결재권자 몫이다. 대표님 화면에서는 «접혀» 있어야 한다.
    row({ id: 51, title: 'Whiteboard markers', amount: 2500, by_proxy: true }),
    // ② 큰돈 2단계의 경영진 차례 — 내가 «주» 결재자다. 접히면 안 된다(짝 검사).
    row({ id: 52, title: 'Dual WAN router', amount: 8800, by_proxy: false,
          stage_seq: 2, stage_total: 2,
          steps: [{ seq: 1, role: 'mgr', status: 'approved', decided_by: 'mgr_jjw' },
                  { seq: 2, role: 'exec', status: 'active' }] }),
    // ③ 소액이고 앞 단계를 내가 찍은 건 — 펼쳐도 «승인» 은 없고 «반려» 만 있어야 한다.
    row({ id: 53, title: 'Ink cartridge', amount: 900, by_proxy: true, same_decider: true }),
    // ④ 내가 주 결재자인 또 하나 — 묶음 승인 버튼이 뜨려면 2건 이상이어야 한다.
    row({ id: 54, title: 'Aircon filter', amount: 7200, by_proxy: false,
          stage_seq: 2, stage_total: 2,
          steps: [{ seq: 1, role: 'mgr', status: 'approved', decided_by: 'mgr_jjw' },
                  { seq: 2, role: 'exec', status: 'active' }] }),
  ],
  mine: [], urgent: [], ack_pending: [], reuse: [],
};

let PASS = 0, FAIL = 0;
function check(name, cond, extra) {
  if (cond) { PASS++; console.log('  OK   ' + name); }
  else { FAIL++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

/* 그 카드에 «승인» 버튼이 실제로 그려졌는가 — 서버를 부르는 그 버튼만 센다.
   ⛔ 「글자가 승인인가」로 세지 말 것. 「반려」도 버튼이라 뜻이 흐려진다. */
const hasApprove = (page, id) => page.evaluate((n) => {
  const c = document.getElementById('req-' + n);
  if (!c) return null;
  return Array.from(c.querySelectorAll('button')).some(
    (b) => /decide\(\s*\d+\s*,\s*'approved'/.test(b.getAttribute('onclick') || ''));
}, id);

const hasReject = (page, id) => page.evaluate((n) => {
  const c = document.getElementById('req-' + n);
  if (!c) return null;
  return Array.from(c.querySelectorAll('button')).some(
    (b) => /askWhy\(/.test(b.getAttribute('onclick') || ''));
}, id);

const hasProxyBtn = (page, id) => page.evaluate((n) => {
  const c = document.getElementById('req-' + n);
  if (!c) return null;
  return Array.from(c.querySelectorAll('button')).some(
    (b) => /proxyOpen\(/.test(b.getAttribute('onclick') || ''));
}, id);

(async () => {
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('dialog', (d) => d.accept());

  await page.addInitScript((home) => {
    try { localStorage.setItem('mangoi_lang', 'ko'); } catch (e) {}
    const rf = window.fetch;
    window.fetch = function (u, o) {
      u = String(u);
      if (u.indexOf('/api/approval/home') === 0) {
        return Promise.resolve(new Response(JSON.stringify(home), { status: 200 }));
      }
      if (u.indexOf('/api/push/vapid-public-key') === 0) {
        return Promise.resolve(new Response(JSON.stringify({ ok: true, key: '' }), { status: 200 }));
      }
      return rf(u, o);
    };
  }, HOME);

  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForTimeout(600);

  /* ── 전제 — 네 건이 실제로 그려졌는가 ─────────────────────────────────
     이게 깨지면 아래 검사가 전부 «없어서 통과» 하는 헛돎이 된다. */
  console.log('\n[0] 전제');
  const drawn = await page.evaluate(() =>
    [51, 52, 53, 54].filter((n) => !!document.getElementById('req-' + n)).length);
  check('결재함에 네 건이 다 그려졌다', drawn === 4, '실제: ' + drawn);

  /* ── ① 접힘 ──────────────────────────────────────────────────────────── */
  console.log('\n[1] 소액(결재권자 몫)은 접혀 있다');
  check('#51 에 «승인» 버튼이 없다', (await hasApprove(page, 51)) === false);
  check('#51 에 «반려» 버튼도 없다 (접힌 상태)', (await hasReject(page, 51)) === false);
  check('#51 에 «대신 결재하기» 버튼이 있다', (await hasProxyBtn(page, 51)) === true);

  const note51 = await page.evaluate(() =>
    (document.getElementById('req-51') || {}).textContent || '');
  check('#51 이 «확인만 하시면 됩니다» 라고 말한다', /확인/.test(note51) && /결재권자/.test(note51));

  /* ── ② 짝 — 내가 주 결재자인 건은 그대로 ─────────────────────────────── */
  console.log('\n[2] 짝 — 내 차례인 건은 접히지 않는다');
  check('#52 에 «승인» 버튼이 그대로 있다', (await hasApprove(page, 52)) === true);
  check('#52 에는 «대신 결재하기» 가 없다', (await hasProxyBtn(page, 52)) === false);
  check('#54 에 «승인» 버튼이 그대로 있다', (await hasApprove(page, 54)) === true);

  /* ── ③ 묶음 승인 ─────────────────────────────────────────────────────── */
  console.log('\n[3] 묶음 승인은 «대신 결재» 건을 쓸어 담지 않는다');
  const bulk = await page.evaluate(() =>
    (document.getElementById('bulkBox') || {}).textContent || '');
  check('묶음 버튼이 떠 있다', /한 번에 승인/.test(bulk), '실제: ' + bulk.slice(0, 80));
  check('묶음 건수가 2건이다 (#52·#54 만 — #51·#53 제외)',
    /\b2건/.test(bulk), '실제: ' + bulk.slice(0, 80));

  /* ── ④ 펼치면 예전과 같다 ────────────────────────────────────────────── */
  console.log('\n[4] 펼치면 대신 결재할 수 있다');
  await page.evaluate(() => {
    const c = document.getElementById('req-51');
    const b = Array.from(c.querySelectorAll('button')).find(
      (x) => /proxyOpen\(/.test(x.getAttribute('onclick') || ''));
    b.click();
  });
  await page.waitForTimeout(200);
  check('#51 을 펼치면 «승인» 버튼이 나온다', (await hasApprove(page, 51)) === true);
  check('#51 을 펼치면 «반려» 버튼도 나온다', (await hasReject(page, 51)) === true);
  check('짝 — 다른 건(#53)은 그대로 접혀 있다', (await hasApprove(page, 53)) === false);

  const bulk2 = await page.evaluate(() =>
    (document.getElementById('bulkBox') || {}).textContent || '');
  check('펼쳐도 묶음 건수는 그대로 2건이다 (묶음은 목록 전체를 누르는 버튼이다)',
    /\b2건/.test(bulk2), '실제: ' + bulk2.slice(0, 80));

  /* ── ⑤ 같은 사람 연속 결재 금지가 살아 있는가 ────────────────────────── */
  console.log('\n[5] 펼쳐도 «앞 단계를 내가 찍은 건» 은 승인이 없다');
  await page.evaluate(() => {
    const c = document.getElementById('req-53');
    const b = Array.from(c.querySelectorAll('button')).find(
      (x) => /proxyOpen\(/.test(x.getAttribute('onclick') || ''));
    b.click();
  });
  await page.waitForTimeout(200);
  check('#53 은 펼쳐도 «승인» 이 없다', (await hasApprove(page, 53)) === false);
  check('#53 은 «반려» 는 있다 (돈이 안 나가는 방향)', (await hasReject(page, 53)) === true);

  /* ── ⑥ 60초 뒤 다시 그려도 펼침이 남는가 ─────────────────────────────── */
  console.log('\n[6] 다시 그려도 펼침이 안 접힌다');
  await page.evaluate(() => { if (typeof repaint === 'function') repaint(); });
  await page.waitForTimeout(200);
  check('repaint 뒤에도 #51 의 «승인» 이 남아 있다', (await hasApprove(page, 51)) === true);

  /* ── ⑦ 조용한 실패가 없는가 ──────────────────────────────────────────── */
  console.log('\n[7] 실행 중 오류');
  check('자바스크립트 오류가 없다', errors.length === 0, errors.join(' / '));

  console.log('\n──────────────────────────────────────');
  console.log(FAIL ? ('  ⚠ ' + FAIL + '건 실패 / ' + (PASS + FAIL) + '건')
                   : ('  전부 통과 (' + PASS + '건)'));
  await browser.close();
  process.exit(FAIL ? 1 : 0);
})();
