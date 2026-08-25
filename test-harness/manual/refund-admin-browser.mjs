// -*- coding: utf-8 -*-
// 💸 환불 화면 브라우저 검사 — 2026-08-25 (사람이 직접 부르는 검사)
//
//   왜 필요한가
//     문자열 하니스(payment_refund_harness)는 「그 코드가 있는가」만 본다.
//     「빨간 실행 버튼이 실제로 빨갛게 그려지는가」·「좁은 폭에서 안 넘치는가」·
//     「확인 문구 없이 버튼이 눌리는가」는 **진짜 브라우저에 그려 봐야** 보인다.
//     CLAUDE.md 2장에 같은 뿌리의 사고가 여러 건 적혀 있다 —
//     관리자 화면의 버튼 색이 전역 CSS 세 겹에 먹혀 «네 개가 전부 흰색» 이던 건이 대표적이다.
//     환불은 돈을 되돌리는 화면이라 «강조색이 안 보이는 것» 자체가 위험이다.
//
//   ⚠️ 자동으로 돌지 않는다 (manual/ 규약 — 게이트가 *_harness.mjs 만 물어 간다).
//      환불 화면·api-pay-refund 를 건드리면 사람이 불러야 한다:
//        mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
//        PW_DIR=/tmp/pw node test-harness/manual/refund-admin-browser.mjs
//
//   ⚠️ file:// 로 열지 않는다 — 절대경로 <script src="/js/…"> 가 전부 404 라
//      「기능이 죽었다」로 오진하게 된다(CLAUDE.md 2장). 로컬 HTTP 서버로 띄운다.
import { spawn } from 'node:child_process';
import { loadPlaywright, findChromium } from './_pw.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const PUB = join(__dir, '..', '..', 'cloudflare-deploy', 'public');
const PORT = 8913;

const pw = loadPlaywright();
const exe = findChromium();
if (!pw || !exe) {
  console.log('⏭ playwright-core 또는 Chromium 을 못 찾아 건너뜁니다.');
  console.log('   mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core');
  console.log('   PW_DIR=/tmp/pw node test-harness/manual/refund-admin-browser.mjs');
  process.exit(0);
}

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : '')); }
};

/* ── 가짜 서버 응답 ── */
const PREVIEW = {
  ok: true,
  preview: {
    order_id: 'MGE-TEST-1', uid: 'stu1', student_name: '홍길동',
    paid_amount: 120000, status: 'paid', payment_key: 'pk_test', method: '카드', paid_at: 1756000000000,
    already_refunded: 0, pending_refunds: 0, refundable_max: 120000,
    suggested: 80000,
    suggest_basis: {
      rule: 'enroll_used_settlement', sessions: 12, used_sessions: 4,
      list_per_session: 10000, used_value: 40000, base_price_no_discount: 120000,
      policy: '기간할인 취소 후 정가로 사용분 정산 → 잔액 환불',
    },
    remaining_classes: 8, active_subscription: true,
    history: [{ id: 7, refund_amount: 10000, kind: 'partial', reason: '테스트', status: 'failed',
                requested_by: 'admin', requested_at: 1756000000000, done_at: 1756000000000 }],
  },
};
const LIST = {
  ok: true,
  refunds: [
    { id: 9, order_id: 'MGE-A', student_name: '김하나', refund_amount: 50000, kind: 'partial',
      reason: '학부모 요청', status: 'done', requested_by: 'admin', requested_at: 1756000000000, done_at: 1756000000000 },
    { id: 8, order_id: 'MGE-B', student_name: '이두리', refund_amount: 30000, kind: 'full',
      reason: '중복 결제', status: 'failed', pg_code: 'ALREADY_CANCELED_PAYMENT',
      requested_by: 'hq_mgr', requested_at: 1755900000000, done_at: 1755900000000 },
  ],
  total: { count: 12, amount: 640000 },
  needs_check: 1,
};

const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'],
  { cwd: PUB, stdio: 'ignore' });
const wait = (ms) => new Promise(r => setTimeout(r, ms));

try {
  await wait(700);
  const browser = await pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });

  /* ══ 1부. 넓은 화면 ══ */
  console.log('\n[ 1부. PC 폭(1440) — 그려지는가 · 색이 살아 있는가 ]');
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message)));

  let lastPost = null;
  await page.route('**/api/pay/admin/**', async (route) => {
    const u = route.request().url();
    if (u.includes('refund-preview')) return route.fulfill({ json: PREVIEW });
    if (u.includes('/refunds')) return route.fulfill({ json: LIST });
    if (u.includes('/refund')) {
      lastPost = JSON.parse(route.request().postData() || '{}');
      if (!lastPost.confirm) {
        return route.fulfill({ json: { ok: true, dry_run: true, will: {
          order_id: lastPost.order_id, amount: lastPost.amount, kind: 'partial',
          mode: lastPost.record_only ? 'record_only' : 'pg_cancel',
          cancel_remaining_classes: !!lastPost.cancel_remaining_classes,
          remaining_classes: 8, active_subscription: true,
        }, preview: PREVIEW.preview } });
      }
      return route.fulfill({ json: { ok: true, refund_id: 11, amount: lastPost.amount,
        kind: 'partial', cancelled_classes: 8, warnings: ['⚠️ 자동연장이 살아 있습니다.'] } });
    }
    return route.fulfill({ json: { ok: false, error: 'not_stubbed' } });
  });

  await page.goto(`http://127.0.0.1:${PORT}/admin/refunds.html`, { waitUntil: 'networkidle' });
  await wait(400);

  check('자바스크립트 오류 없이 뜬다', errors.length === 0, errors.slice(0, 2));
  check('제목이 그려진다', (await page.title()).includes('환불'));

  const sum = await page.evaluate(() => ({
    cnt: document.getElementById('s-cnt').textContent,
    amt: document.getElementById('s-amt').textContent,
    chk: document.getElementById('s-chk').textContent,
    stuckShown: !document.getElementById('stuck-box').classList.contains('hide'),
    rows: document.querySelectorAll('#hist-body tr').length,
  }));
  check('환불 합계가 숫자로 그려진다', sum.cnt === '12' && /640,000/.test(sum.amt), sum);
  check('«확인 필요» 건수가 보인다', sum.chk === '1', sum.chk);
  check('확인 필요가 있으면 맨 위 경고 상자가 열린다', sum.stuckShown === true);
  check('내역 두 줄이 그려진다 (완료·실패)', sum.rows === 2, sum.rows);
  check('실패한 건의 PG 코드까지 보여 준다',
    (await page.textContent('#hist-body')).includes('ALREADY_CANCELED_PAYMENT'));

  // ── 미리보기 ──
  await page.fill('#q-order', 'MGE-TEST-1');
  await page.click('#btn-load');
  await wait(300);

  const pv = await page.evaluate(() => {
    const t = document.getElementById('pv-notes').textContent;
    return {
      shown: !document.getElementById('pv-card').classList.contains('hide'),
      kv: document.getElementById('pv-kv').textContent,
      amount: document.getElementById('f-amount').value,
      sub: t.includes('자동연장'),
      basis: t.includes('4회 사용'),
      hist: t.includes('#7'),
      runDisabled: document.getElementById('btn-run').disabled,
      confirmHidden: document.getElementById('confirm-box').classList.contains('hide'),
    };
  });
  check('미리보기 카드가 열린다', pv.shown);
  check('결제 금액·상한·권장액이 함께 보인다',
    /120,000/.test(pv.kv) && /80,000/.test(pv.kv), pv.kv.slice(0, 80));
  check('권장 금액이 입력칸에 미리 채워진다', pv.amount === '80000', pv.amount);
  check('계산 근거(사용 회차)를 화면이 말한다', pv.basis);
  check('🔴 자동연장 경고가 뜬다 (그대로 두면 다음 달 또 청구된다)', pv.sub);
  check('이 주문의 지난 환불 이력이 보인다', pv.hist);
  check('아직 확인 단계가 아니다 (confirm 상자 닫힘)', pv.confirmHidden);
  check('실행 버튼은 처음부터 잠겨 있다', pv.runDisabled === true);

  /* 🔴 CLAUDE.md 2장 「관리자 버튼에 색을 줬는데 화면에는 흰색으로 나옴」 —
     이 화면은 admin.html 밖이지만 adm-light-theme.css 를 함께 링크한다.
     코드에 적힌 색이 아니라 **실제로 계산된 색**을 재야 한다. */
  const colors = await page.evaluate(() => {
    const g = (id) => {
      const el = document.getElementById(id), s = getComputedStyle(el);
      return { bg: s.backgroundColor, img: s.backgroundImage, color: s.color };
    };
    return { run: g('btn-run'), dry: g('btn-dry') };
  });
  const isRed = (c) => {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c.bg || '');
    if (!m) return false;
    const [r, gg, b] = [+m[1], +m[2], +m[3]];
    return r > 120 && r > gg * 2 && r > b * 2;         // 빨강 계열인가
  };
  check('🔴 «환불 실행» 버튼이 실제로 빨간색으로 그려진다 (전역 CSS 에 안 먹혔다)',
    isRed(colors.run), colors.run);
  check('«확인» 버튼과 «실행» 버튼의 색이 서로 다르다 (헷갈려 누르지 않게)',
    colors.run.bg !== colors.dry.bg, colors);

  // ── 사유 없이 확인 누르기 ──
  let alerted = '';
  page.on('dialog', async (d) => { alerted = d.message(); await d.dismiss(); });
  await page.click('#btn-dry');
  await wait(250);
  check('사유가 비면 확인 단계로 못 넘어간다', /사유/.test(alerted), alerted.slice(0, 40));
  check('그때 서버로 요청이 나가지 않는다', lastPost === null);

  // ── 사유 채우고 확인 ──
  await page.fill('#f-reason', '학부모 요청 · 이사로 수업 중단');
  await page.click('#btn-dry');
  await wait(300);
  const st = await page.evaluate(() => ({
    open: !document.getElementById('confirm-box').classList.contains('hide'),
    text: document.getElementById('confirm-text').textContent,
    runDisabled: document.getElementById('btn-run').disabled,
  }));
  check('확인 상자가 열린다', st.open);
  check('«이대로 실행합니다» 가 금액과 함께 나온다', /80,000/.test(st.text), st.text.slice(0, 60));
  check('토스에 실제 취소를 보낸다고 분명히 말한다', /실제 취소/.test(st.text));
  check('남은 수업 처리 방침도 함께 말한다', /남은 수업/.test(st.text));
  check('확인 문구 전에는 실행 버튼이 여전히 잠겨 있다', st.runDisabled === true);
  check('dry-run 요청에 confirm 이 없다', lastPost && lastPost.confirm === undefined, lastPost);

  // ── 확인 문구 ──
  await page.fill('#f-typed', '환');
  await wait(120);
  check('문구가 덜 맞으면 잠긴 채다', await page.evaluate(() => document.getElementById('btn-run').disabled));
  await page.fill('#f-typed', '환불');
  await wait(120);
  check('문구가 맞으면 실행 버튼이 열린다',
    !(await page.evaluate(() => document.getElementById('btn-run').disabled)));

  // ── 금액을 바꾸면 확인이 무효 ──
  await page.fill('#f-amount', '50000');
  await page.dispatchEvent('#f-amount', 'change');
  await wait(200);
  const after = await page.evaluate(() => ({
    hidden: document.getElementById('confirm-box').classList.contains('hide'),
    disabled: document.getElementById('btn-run').disabled,
    typed: document.getElementById('f-typed').value,
  }));
  check('🔴 금액을 바꾸면 앞서 받은 확인이 무효가 된다', after.hidden && after.disabled && after.typed === '',
    after);

  // ── 진짜 실행 ──
  await page.click('#btn-dry');
  await wait(300);
  await page.fill('#f-typed', '환불');
  await wait(120);
  await page.click('#btn-run');
  await wait(400);
  check('실행 요청에 confirm:true 가 실린다', lastPost && lastPost.confirm === true, lastPost);
  check('바뀐 금액(50,000)이 그대로 실린다', lastPost && lastPost.amount === 50000, lastPost && lastPost.amount);
  check('사유가 함께 실린다', lastPost && /이사로 수업 중단/.test(lastPost.reason || ''));
  const res = await page.textContent('#run-result');
  check('결과가 화면에 남는다 (기록 번호 포함)', /#11/.test(res), res.slice(0, 70));
  check('서버 경고(자동연장)를 그대로 보여 준다', /자동연장/.test(res));

  /* ══ 2부. 좁은 화면 ══ */
  console.log('\n[ 2부. 휴대폰 폭(390) — 가로로 넘치지 않는가 ]');
  /* ⚠️ 스크린샷 눈대중으로 「잘렸다」고 판단하지 않는다 — 헤드리스 최소 뷰포트가 500px 라
     390 으로 찍으면 멀쩡한 화면도 잘려 보인다(CLAUDE.md 2장). 숫자를 잰다. */
  /* ⚠️ isMobile:true 를 쓰지 않는다 — 그 문맥에서는 레이아웃 뷰포트가 지정값과 어긋나
     (844 로 지정했는데 innerHeight 가 1437 로 잡힌다) playwright 의 클릭 전 스크롤·겹침 판정이
     엉뚱한 좌표를 본다. 실제로 「div.muted 가 버튼을 가린다」는 «거짓» 실패가 났다
     (같은 화면을 손으로 스크롤해 누르면 정상). 이 검사가 재려는 것은 «좁은 폭에서 넘치는가» 이므로
     폭만 좁히면 충분하다. hover/touch 분기가 있는 화면을 잴 때만 isMobile 을 켤 것. */
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p2 = await ctx2.newPage();
  await p2.route('**/api/pay/admin/**', async (route) => {
    const u = route.request().url();
    if (u.includes('refund-preview')) return route.fulfill({ json: PREVIEW });
    if (u.includes('/refunds')) return route.fulfill({ json: LIST });
    const body = JSON.parse(route.request().postData() || '{}');
    return route.fulfill({ json: { ok: true, dry_run: true, will: {
      order_id: body.order_id, amount: body.amount, kind: 'partial', mode: 'pg_cancel',
      cancel_remaining_classes: !!body.cancel_remaining_classes,
      remaining_classes: 8, active_subscription: true,
    }, preview: PREVIEW.preview } });
  });
  await p2.goto(`http://127.0.0.1:${PORT}/admin/refunds.html`, { waitUntil: 'networkidle' });
  await p2.fill('#q-order', 'MGE-TEST-1');
  await p2.click('#btn-load');
  await wait(400);
  /* ⚠️ 실행 버튼은 «확인» 을 거쳐야 화면에 나온다 — 숨은 채로 크기를 재면 0×0 이 나와
     「버튼이 없다」고 오진하게 된다(이 검사가 처음에 그랬다). 확인 단계까지 진행한 뒤 잰다. */
  await p2.fill('#f-reason', '휴대폰 확인');
  /* ⚠️ 폰 문맥(isMobile)에서는 playwright 의 «클릭 전 자동 스크롤» 이 제대로 안 걸린다
     (innerHeight 가 지정한 뷰포트와 다르게 잡힌다 — 실측 844 지정에 903). 그대로 두면
     「버튼을 못 누른다」는 거짓 실패가 난다. 화면 문제가 아니므로 직접 스크롤해 준다. */
  await p2.locator('#btn-dry').scrollIntoViewIfNeeded();
  await wait(200);
  await p2.click('#btn-dry');
  await wait(350);

  const m = await p2.evaluate(() => ({
    docW: document.documentElement.scrollWidth,
    winW: window.innerWidth,
    tableOverflow: (() => {
      const t = document.querySelector('#hist-body').closest('table');
      const box = t.parentElement;
      return { tableW: t.scrollWidth, boxW: box.clientWidth, boxOverflow: getComputedStyle(box).overflowX };
    })(),
    runBtn: (() => { const r = document.getElementById('btn-run').getBoundingClientRect();
                     return { w: Math.round(r.width), h: Math.round(r.height) }; })(),
  }));
  check('문서가 화면보다 넓지 않다 (가로 스크롤 없음)', m.docW <= m.winW + 1, m);
  check('표가 자기 상자 안에서 굴러간다 (문서를 밀지 않는다)',
    m.tableOverflow.boxOverflow === 'auto', m.tableOverflow);

  /* 🔴 CLAUDE.md 2장 「낱글자로 쪼개짐」의 표 판 —
     문서가 안 넘치는 것만 보고 통과시키면 이 사고를 못 본다. 실제로 밟았다:
     표에 min-width 를 560px 로 박았더니 칸이 9개라 한 칸이 60px 이 되어
     「김/하/나」·「학부모/요청/·/이사」로 세로로 쪼개졌다.
     그래서 «몇 줄로 나뉘었는가» 를 직접 센다(높이 ÷ 줄간격). */
  const wrap = await p2.evaluate(() => {
    const out = [];
    for (const td of document.querySelectorAll('#hist-body td')) {
      const txt = (td.textContent || '').trim();
      if (!txt) continue;
      const lh = parseFloat(getComputedStyle(td).lineHeight) || 20;
      const lines = Math.round(td.getBoundingClientRect().height / lh);
      if (lines >= 3) out.push({ txt: txt.slice(0, 14), lines });
    }
    return out;
  });
  check('표 칸의 글자가 세로로 쪼개지지 않는다 (3줄 이상인 칸 0개)', wrap.length === 0, wrap);
  check('실행 버튼이 좁은 폭에서도 눌릴 만한 크기다', m.runBtn.h >= 30 && m.runBtn.w >= 60, m.runBtn);

  /* 확인 문구 잠금이 휴대폰에서도 그대로인가 — 여기서 풀리면 오조작이 난다 */
  const lock = await p2.evaluate(() => document.getElementById('btn-run').disabled);
  check('휴대폰에서도 실행 버튼은 기본 잠김', lock === true);

  await browser.close();
} catch (e) {
  fail++;
  console.log('  ❌ 검사 중 예외: ' + String(e && e.message).slice(0, 200));
} finally {
  srv.kill();
}

console.log('\n────────────────────────────────');
console.log(`  PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
