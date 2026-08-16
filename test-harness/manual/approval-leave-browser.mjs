/*
 * 휴가 결재를 실제 브라우저에서 눌러 확인한다.
 *
 * 왜 중요한가 — 휴가는 승인되는 순간 «강사 근무불가» 에 들어가 **그 기간 예약이 실제로 막힌다.**
 * 날짜가 비어 있거나 거꾸로 들어가면 «승인은 됐는데 아무것도 안 막힌» 상태가 된다.
 * 그래서 보내기 전에 화면이 먼저 잡는지, 기간이 서버로 온전히 가는지를 본다.
 *
 * 서버는 띄우지 않는다 — fetch 를 가짜로 바꾼다(운영 DB 를 건드리지 않는다).
 * 돌리는 법은 같은 폴더 README 참고.
 */
import { requireBrowser } from './_pw.mjs';

const { chromium, exe } = requireBrowser();

const FILE = 'file:///home/user/mangoiweb/cloudflare-deploy/public/work.html';

const HOME = {
  ok: true,
  me: { username: 'hq_t01', name: 'Teacher Ann', is_exec: false, is_ph_manager: false, is_teacher: true },
  colleagues: [], my_delegate: null,
  can_approve: false, pending: 0, schedule_pending: 0,
  // 강사에게 열린 분류 — 긴급·고객불만·휴가
  types: [
    { key: 'urgent', ko: '긴급 소통', en: 'Urgent', needs_amount: false, wants_file: false, wants_dates: false },
    { key: 'leave',  ko: '휴가 신청', en: 'Time off', needs_amount: false, wants_file: false, wants_dates: true },
  ],
  inbox: [], mine: [], reuse: [], urgent: [],
};

let PASS = 0, FAIL = 0;
function check(name, cond, extra) {
  if (cond) { PASS++; console.log('  OK   ' + name); }
  else { FAIL++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

(async () => {
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  const page = await (await browser.newContext({ viewport: { width: 420, height: 900 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.addInitScript((home) => {
    window.__POSTS = [];
    const rf = window.fetch;
    window.fetch = function (u, o) {
      u = String(u);
      if (u.indexOf('/api/approval/home') === 0) {
        return Promise.resolve(new Response(JSON.stringify(home), { status: 200 }));
      }
      if (u.indexOf('/api/approval/requests') === 0 && o && o.method === 'POST') {
        const rec = {};
        for (const [k, v] of o.body.entries()) rec[k] = (v instanceof Blob) ? '[file]' : v;
        window.__POSTS.push(rec);
        return Promise.resolve(new Response(JSON.stringify({ ok: true, id: 1 }), { status: 200 }));
      }
      if (u.indexOf('/api/push/vapid-public-key') === 0) {
        return Promise.resolve(new Response(JSON.stringify({ ok: true, key: '' }), { status: 200 }));
      }
      return rf(u, o);
    };
  }, HOME);

  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForTimeout(450);

  console.log('\n[1] 강사에게 보이는 분류');
  const kinds = await page.locator('.kind').allTextContents();
  check('휴가 신청이 보인다', kinds.indexOf('휴가 신청') >= 0 || kinds.indexOf('Time off') >= 0,
        JSON.stringify(kinds));
  check('지출·인사 분류는 보이지 않는다',
        kinds.every((k) => k.indexOf('지출') < 0 && k.indexOf('인사') < 0 &&
                           k.indexOf('Expense') < 0 && k.indexOf('HR') < 0),
        JSON.stringify(kinds));

  console.log('\n[2] 휴가 폼 — 기간을 받는가');
  const leaveBtn = page.locator('.kind', { hasText: /휴가 신청|Time off/ });
  await leaveBtn.click();
  await page.waitForTimeout(200);
  check('시작일 칸이 있다', await page.locator('#f_from').count() === 1);
  check('종료일 칸이 있다', await page.locator('#f_to').count() === 1);
  check('금액 칸은 없다 (휴가에 금액은 의미가 없다)', await page.locator('#f_amount').count() === 0);

  console.log('\n[3] 날짜 없이 보내면 화면이 먼저 잡는가');
  await page.fill('#f_title', 'Family event');
  await page.click('#b_submit');
  await page.waitForTimeout(400);
  let posts = await page.evaluate(() => window.__POSTS);
  check('날짜가 없으면 서버로 보내지 않는다', posts.length === 0, JSON.stringify(posts));
  const toastTxt = await page.locator('#toast').textContent();
  check('무엇을 해야 하는지 알려 준다', !!toastTxt && toastTxt.length > 0, JSON.stringify(toastTxt));

  console.log('\n[4] 기간을 넣고 보내기');
  await page.fill('#f_from', '2026-09-01');
  await page.fill('#f_to', '2026-09-03');
  await page.click('#b_submit');
  await page.waitForTimeout(600);
  posts = await page.evaluate(() => window.__POSTS);
  check('서버로 갔다', posts.length === 1, JSON.stringify(posts));
  check('분류가 휴가다', posts.length === 1 && posts[0].req_type === 'leave');
  check('시작일이 온전히 갔다', posts.length === 1 && posts[0].date_from === '2026-09-01');
  check('종료일이 온전히 갔다', posts.length === 1 && posts[0].date_to === '2026-09-03');
  check('같은 건 열쇠도 함께 갔다', posts.length === 1 && !!posts[0].client_key);

  console.log('\n[5] 쓰다 만 휴가 신청이 되살아나는가');
  await page.locator('.kind', { hasText: /휴가 신청|Time off/ }).click();
  await page.waitForTimeout(150);
  await page.fill('#f_title', 'Medical leave');
  await page.fill('#f_from', '2026-10-05');
  await page.waitForTimeout(250);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(700);
  check('제목이 되살아난다', (await page.inputValue('#f_title').catch(() => '')) === 'Medical leave');
  check('휴가 시작일도 되살아난다', (await page.inputValue('#f_from').catch(() => '')) === '2026-10-05');

  console.log('\n[6] 실행 중 오류');
  check('자바스크립트 오류가 없다', errors.length === 0, errors.join(' | '));

  await browser.close();
  console.log('\n──────────────────────────────────────');
  console.log(FAIL ? ('  ' + FAIL + '건 실패 / ' + (PASS + FAIL) + '건') : ('  전부 통과 (' + PASS + '건)'));
  process.exit(FAIL ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
