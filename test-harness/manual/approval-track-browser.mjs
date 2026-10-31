/*
 * 🧭 결재 «진행 추적» — 실제 브라우저에 그려서 확인한다 (2026-09-04)
 *
 *   [무엇을 보나]
 *     내가 올린 결재에 «지금 어디까지 왔나 · 며칠째인가 · 왜 안 움직이나» 가
 *     실제로 그려지는지. 문자열 검사로는 «무엇이 화면에 나왔는가» 를 볼 수 없다.
 *
 *   [왜 만들었나]
 *     2026-08-30 에 올라온 긴급 건이 5일째 서 있었는데 화면은 «대기 중» 이라고만 했다.
 *     그 건은 결재 단계가 exec 로 박혀 있고 exec 를 결재할 수 있는 사람이 기안자 본인뿐이라
 *     **기다려도 처리될 수 없는 상태**였다. 화면이 그 사실을 말하게 한 것이 이 변경이고,
 *     이 검사는 그 말이 «맞는 자리에만» 나오는지 본다.
 *
 *   [짝으로 본다]
 *     «막힘이 뜬다» 만 검사하면 **모든 건에 뜨는 코드**도 통과한다.
 *     그래서 «안 막힌 건에는 안 뜬다»·«남이 올린 건에는 안 뜬다»·«결재함에는 안 나온다» 를
 *     반드시 함께 센다.
 *
 *   돌리는 법:  PW_DIR=/tmp/pw node test-harness/manual/approval-track-browser.mjs
 *   ⚠️ 자동으로 안 돕니다(manual/ 규약) — 결재 화면을 건드리면 사람이 부르세요.
 */

import { requireBrowser, fileUrl } from './_pw.mjs';

const { chromium, exe } = requireBrowser();
const FILE = fileUrl('cloudflare-deploy/public/work.html');

const now = Date.now();
const DAY = 86400000;

/* 실제로 D1 에 있던 모양을 본떴다(2026-09-04 실측).
   ⚠️ 여기 값을 «그럴듯하게» 바꾸지 말 것 — 사고를 재현하는 것이 이 검사의 뜻이다. */
const HOME = {
  ok: true,
  me: { username: 'admin', name: '정우영', is_exec: true, is_ph_manager: false, is_teacher: false },
  colleagues: [{ username: 'mgr_jjw', name: '장지웅' }],
  my_delegate: null,
  can_approve: true, pending: 1,
  types: [{ key: 'urgent', ko: '긴급 소통', en: 'Urgent', needs_amount: false, wants_file: false }],

  // 내가 올린 것 — 세 가지 상태가 한 화면에 있어야 짝 검사가 성립한다
  mine: [
    { // ① 막힌 건 — 실제 #2 재현(긴급, exec 단계, 5일째, 결재 가능자 0명)
      id: 2, req_type: 'urgent', type_ko: '긴급 소통', type_en: 'Urgent',
      title: 'we need to found the test classes',
      requester_username: 'admin', requester_name: '정우영',
      status: 'pending', created_at: now - 5 * DAY,
      stage_seq: 1, stage_total: 1, stage_due_at: now - 4 * DAY,
      escalated: true, flags: [], has_file: false,
      approver_count: 0, blocked: true,
      steps: [{ seq: 1, role: 'exec', status: 'active' }],
    },
    { // ② 대기 중이지만 결재할 사람이 있는 건 — «막힘» 이 뜨면 안 된다
      id: 9, req_type: 'purchase', type_ko: '물품 구입', type_en: 'Purchase',
      title: 'Ink cartridge',
      requester_username: 'admin', requester_name: '정우영',
      status: 'pending', created_at: now - 1 * DAY,
      stage_seq: 1, stage_total: 1, stage_due_at: now + DAY,
      escalated: false, flags: [], has_file: false,
      approver_count: 2, blocked: false,
      steps: [{ seq: 1, role: 'staff', status: 'active' }],
    },
    { // ③ 끝난 건 — 2단계 전부 승인
      id: 3, req_type: 'purchase', type_ko: '물품 구입', type_en: 'Purchase',
      title: 'Purchase request (Dual Wan Router)',
      requester_username: 'admin', requester_name: '정우영',
      amount: 2800, currency: 'PHP',
      status: 'approved', created_at: now - 1 * DAY, decided_at: now - 1 * DAY + 3600000,
      stage_seq: 2, stage_total: 2, escalated: false, flags: [], has_file: true, file_name: 'r.jpg',
      steps: [
        { seq: 1, role: 'staff', status: 'approved', decided_by: 'mgr_jjw' },
        { seq: 2, role: 'exec', status: 'approved', decided_by: 'admin' },
      ],
    },
  ],

  // 남이 올린 긴급 — 내 건이 아니므로 진행바도 «막힘» 도 나오면 안 된다
  urgent: [
    { id: 40, req_type: 'urgent', type_ko: '긴급 소통', type_en: 'Urgent',
      title: 'Aircon broken in room 2',
      requester_username: 'mgr_karl', requester_name: 'Karl',
      status: 'pending', created_at: now - 2 * 3600000,
      stage_seq: 1, stage_total: 1, escalated: false, flags: [], has_file: false,
      blocked: true,                     // ⚠️ 일부러 켜 둔다 — 내 건이 아니면 무시해야 한다
      steps: [{ seq: 1, role: 'any', status: 'active' }] },
  ],

  // 결재함 — 여기에는 진행바를 그리지 않는다(버튼이 더 중요하다)
  inbox: [
    { id: 50, req_type: 'purchase', type_ko: '물품 구입', type_en: 'Purchase',
      title: 'Whiteboard markers',
      requester_username: 'mgr_melca', requester_name: 'Melca',
      amount: 300, currency: 'PHP',
      status: 'pending', created_at: now - 3600000, stage_due_at: now + DAY,
      stage_seq: 1, stage_total: 1, escalated: false, flags: [], has_file: false,
      steps: [{ seq: 1, role: 'staff', status: 'active' }] },
  ],
  reuse: [],
};

let PASS = 0, FAIL = 0;
function check(name, cond, extra) {
  if (cond) { PASS++; console.log('  OK   ' + name); }
  else { FAIL++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

/* WCAG 대비 — 반투명이면 아래 층과 합성해야 한다(CLAUDE.md 함정).
   여기 색은 전부 불투명이라 단순 계산으로 충분하지만, 값을 실제로 재서 판정한다. */
function lum(rgb) {
  const c = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(a, b) {
  const l1 = lum(a), l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
function parseRgb(s) {
  const m = String(s).match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(',').map((x) => parseFloat(x));
  return [p[0], p[1], p[2]];
}

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

  /* ── ① 진행바가 내 건에 그려지는가 ───────────────────────────────────── */
  console.log('\n[1] 진행 추적 줄');

  const trkInMine = await page.evaluate(() =>
    document.querySelectorAll('#mine .trk').length);
  check('내가 올린 건마다 진행바가 있다 (3건)', trkInMine === 3, '실제: ' + trkInMine);

  // 막힌 건: 올림 → 경영진 → 완료 = 3칸
  const cells2 = await page.evaluate(() =>
    document.querySelectorAll('#req-2 .trkS').length);
  check('1단계 건은 «올림 → 단계 → 완료» 3칸이다', cells2 === 3, '실제: ' + cells2);

  // 끝난 건: 올림 → 본사 → 경영진 → 완료 = 4칸
  const cells3 = await page.evaluate(() =>
    document.querySelectorAll('#req-3 .trkS').length);
  check('2단계 건은 4칸이다', cells3 === 4, '실제: ' + cells3);

  const doneAll = await page.evaluate(() => {
    const c = document.querySelectorAll('#req-3 .trkS');
    return Array.from(c).every((x) => x.classList.contains('done'));
  });
  check('승인 끝난 건은 모든 칸이 «done»', doneAll);

  /* ── ② 막힘은 «막힌 건에만» ──────────────────────────────────────────── */
  console.log('\n[2] «이대로는 처리되지 않습니다» — 맞는 자리에만');

  const stuck2 = await page.evaluate(() => !!document.querySelector('#req-2 .stuck'));
  check('막힌 건에는 안내가 뜬다', stuck2);

  const stuck9 = await page.evaluate(() => !!document.querySelector('#req-9 .stuck'));
  check('결재할 사람이 있는 대기 건에는 안 뜬다 (짝 검사)', !stuck9);

  const stuck3 = await page.evaluate(() => !!document.querySelector('#req-3 .stuck'));
  check('이미 끝난 건에는 안 뜬다 (짝 검사)', !stuck3);

  const stuck40 = await page.evaluate(() => !!document.querySelector('#req-40 .stuck'));
  check('남이 올린 건에는 안 뜬다 — blocked 를 켜 두어도 (짝 검사)', !stuck40);

  const trk40 = await page.evaluate(() => !!document.querySelector('#req-40 .trk'));
  check('남이 올린 건에는 진행바도 안 그린다 (짝 검사)', !trk40);

  const trkInbox = await page.evaluate(() =>
    document.querySelectorAll('#inbox .trk').length);
  check('결재함에는 진행바를 그리지 않는다 (짝 검사)', trkInbox === 0, '실제: ' + trkInbox);

  /* ── ③ 문구가 사실을 말하는가 ────────────────────────────────────────── */
  console.log('\n[3] 무엇이라고 말하는가');

  const stuckTxt = await page.evaluate(() => {
    const e = document.querySelector('#req-2 .stuck');
    return e ? e.textContent : '';
  });
  check('«처리되지 않습니다» 라고 말한다', stuckTxt.indexOf('처리되지 않습니다') >= 0,
        JSON.stringify(stuckTxt.slice(0, 60)));
  check('막힌 단계 이름(경영진)을 말한다', stuckTxt.indexOf('경영진') >= 0);
  check('본인 결재 금지라는 이유를 말한다', stuckTxt.indexOf('본인') >= 0);

  const meta2 = await page.evaluate(() => {
    const e = document.querySelector('#req-2 .imeta');
    return e ? e.textContent : '';
  });
  check('며칠째인지 적는다 (5일째)', /5일째/.test(meta2), JSON.stringify(meta2));

  const chips2 = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#req-2 .chip')).map((c) => c.textContent).join('|'));
  check('«멈춤» 칩이 붙는다', chips2.indexOf('멈춤') >= 0, chips2);

  const chips9 = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#req-9 .chip')).map((c) => c.textContent).join('|'));
  check('안 막힌 건에는 «멈춤» 칩이 없다 (짝 검사)', chips9.indexOf('멈춤') < 0, chips9);

  const hot2 = await page.evaluate(() =>
    document.getElementById('req-2').classList.contains('hot'));
  check('막힌 건은 눈에 띄게 표시된다 (hot)', hot2);

  /* ── ④ 폰에서 안 깨지는가 ────────────────────────────────────────────── */
  console.log('\n[4] 휴대폰 390px — 겹침·넘침');

  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - window.innerWidth);
  check('가로로 넘치지 않는다', overflow <= 0, '넘침 ' + overflow + 'px');

  // 진행바 칸의 글자끼리 겹치지 않는가 — 상자가 아니라 실제 글자 자리를 잰다
  const overlap = await page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll('#req-3 .trkL'));
    const rects = labels.map((el) => {
      const r = document.createRange(); r.selectNodeContents(el);
      const rs = Array.from(r.getClientRects());
      if (!rs.length) return null;
      return { l: Math.min(...rs.map((x) => x.left)), r: Math.max(...rs.map((x) => x.right)) };
    }).filter(Boolean);
    let bad = 0;
    for (let i = 1; i < rects.length; i++) if (rects[i].l < rects[i - 1].r - 0.5) bad++;
    return bad;
  });
  check('진행바 글자가 서로 겹치지 않는다', overlap === 0, '겹친 쌍 ' + overlap);

  const beadVisible = await page.evaluate(() => {
    const b = document.querySelector('#req-2 .trkS.stop .trkB');
    if (!b) return 0;
    const r = b.getBoundingClientRect();
    return (r.width >= 8 && r.height >= 8) ? 1 : 0;
  });
  check('막힌 단계의 표시점이 실제로 보인다', beadVisible === 1);

  /* ── ⑤ 글자가 읽히는가 ──────────────────────────────────────────────── */
  console.log('\n[5] 대비 (WCAG 4.5:1)');

  const contrast = await page.evaluate(() => {
    const e = document.querySelector('#req-2 .stuck');
    if (!e) return null;
    const cs = getComputedStyle(e);
    let bg = cs.backgroundColor, el = e;
    while (bg === 'rgba(0, 0, 0, 0)' && el.parentElement) { el = el.parentElement; bg = getComputedStyle(el).backgroundColor; }
    return { fg: cs.color, bg };
  });
  const cr = contrast ? ratio(parseRgb(contrast.fg), parseRgb(contrast.bg)) : 0;
  check('«막힘» 안내가 읽힌다', cr >= 4.5,
        contrast ? (contrast.fg + ' / ' + contrast.bg + ' = ' + cr.toFixed(2)) : '못 쟀다');

  /* ── ⑥ 언어 전환 ────────────────────────────────────────────────────── */
  console.log('\n[6] 영어로 바꿔도 따라오는가');

  await page.evaluate(() => window.toggleLang());
  await page.waitForTimeout(300);

  const en = await page.evaluate(() => {
    const s = document.querySelector('#req-2 .stuck');
    const m = document.querySelector('#req-2 .imeta');
    const t = document.querySelector('#req-2 .trkS .trkL');
    return { stuck: s ? s.textContent : '', meta: m ? m.textContent : '', first: t ? t.textContent : '' };
  });
  check('«막힘» 안내가 영어로 바뀐다', /will not move/i.test(en.stuck), JSON.stringify(en.stuck.slice(0, 60)));
  check('진행바 라벨이 영어로 바뀐다', /Submitted/i.test(en.first), JSON.stringify(en.first));
  check('며칠째가 영어로 바뀐다', /5 days/.test(en.meta), JSON.stringify(en.meta));

  /* ── ⑦ PC 폭에서도 ──────────────────────────────────────────────────── */
  console.log('\n[7] PC 900px');

  await page.setViewportSize({ width: 900, height: 900 });
  await page.waitForTimeout(300);
  const wideOverflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - window.innerWidth);
  check('넓은 화면에서도 안 넘친다', wideOverflow <= 0, '넘침 ' + wideOverflow + 'px');
  const wideTrk = await page.evaluate(() => document.querySelectorAll('#mine .trk').length);
  check('진행바가 그대로 있다', wideTrk === 3, '실제: ' + wideTrk);

  /* ── ⑧ 조용한 실패가 없는가 ─────────────────────────────────────────── */
  console.log('\n[8] 실행 중 오류');
  check('자바스크립트 오류가 없다', errors.length === 0, errors.join(' / '));

  console.log('\n──────────────────────────────────────');
  console.log(FAIL ? ('  ⚠ ' + FAIL + '건 실패 / ' + (PASS + FAIL) + '건')
                   : ('  전부 통과 (' + PASS + '건)'));
  await browser.close();
  process.exit(FAIL ? 1 : 0);
})();
