/*
 * 인사·급여 «월 확정» 결재를 실제 브라우저에서 눌러 확인한다.
 *
 * 왜 중요한가 — 이 기능의 핵심 성질은 «올리는 사람이 숫자를 타이핑하지 않는다» 이다.
 * 달과 종류만 고르면 금액·인원은 서버가 읽어서 채운다. 화면에 금액 입력칸이 생기는 순간
 * 그 성질이 깨지고, 급여를 잘못 적어 올리는 사고가 가능해진다.
 * 그리고 이미 확정된 달은 두 번 올릴 수 없어야 한다.
 *
 * 서버는 띄우지 않는다 — fetch 를 가짜로 바꾼다(운영 DB 를 건드리지 않는다).
 * 돌리는 법은 같은 폴더 README 참고.
 */
import { requireBrowser, fileUrl } from './_pw.mjs';

const { chromium, exe } = requireBrowser();

const FILE = fileUrl('cloudflare-deploy/public/work.html');

const HOME = {
  ok: true,
  me: { username: 'mgr_jjw', name: '장지웅', is_exec: false, is_ph_manager: false, is_teacher: false },
  colleagues: [], my_delegate: null,
  can_approve: true, pending: 0, schedule_pending: 0,
  types: [
    { key: 'purchase', ko: '물품 구입', en: 'Purchase', needs_amount: true, wants_file: true, picks_period: false },
    { key: 'hr', ko: '인사 · 급여', en: 'HR & Pay', needs_amount: false, wants_file: false, picks_period: true },
  ],
  hr_periods: {
    payroll: [
      { period: '2026-08', label: '2026년 8월', approved: false, hint: '27명 · ₱24,600' },
      { period: '2026-07', label: '2026년 7월', approved: true, approved_by: 'admin',
        approved_at: Date.now() - 86400000, hint: '29명 · ₱57,600' },
    ],
    evaluation: [
      { period: '2026-04', label: '2026년 4월', approved: false, hint: '21명 평가' },
    ],
  },
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
  page.on('dialog', (d) => d.accept());          // confirm() 자동 확인

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
        return Promise.resolve(new Response(JSON.stringify({ ok: true, id: 7 }), { status: 200 }));
      }
      if (u.indexOf('/api/push/vapid-public-key') === 0) {
        return Promise.resolve(new Response(JSON.stringify({ ok: true, key: '' }), { status: 200 }));
      }
      return rf(u, o);
    };
  }, HOME);

  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForTimeout(450);

  console.log('\n[1] 인사·급여를 고르면 «달 고르기» 가 나오는가');
  await page.locator('.kind', { hasText: /인사|HR/ }).click();
  await page.waitForTimeout(250);

  // ★ 핵심 — 타이핑 칸이 하나도 없어야 한다
  const inputs = await page.locator('#form input, #form textarea').count();
  check('입력칸이 하나도 없다 (숫자를 손으로 적을 수 없다)', inputs === 0, '실제 입력칸: ' + inputs);

  const txt = await page.locator('#form').textContent();
  check('급여 달이 보인다', txt.indexOf('2026년 8월') >= 0, JSON.stringify(txt || '').slice(0, 200));
  check('그 달의 규모가 함께 보인다 (무슨 달인지 알아보게)', txt.indexOf('₱24,600') >= 0);
  check('인사평가 달도 보인다', txt.indexOf('2026년 4월') >= 0);

  console.log('\n[2] 이미 확정된 달은 다시 올릴 수 없는가');
  const done = page.locator('#form button', { hasText: '2026년 7월' });
  check('확정된 달 버튼이 있다', await done.count() === 1);
  check('확정된 달은 눌리지 않는다', await done.isDisabled());
  check('누가 확정했는지 보여 준다', (await done.textContent()).indexOf('admin') >= 0);

  console.log('\n[3] 달을 누르면 그대로 올라가는가');
  await page.locator('#form button', { hasText: '2026년 8월' }).click();
  await page.waitForTimeout(700);
  const posts = await page.evaluate(() => window.__POSTS);
  check('서버로 갔다', posts.length === 1, JSON.stringify(posts));
  check('분류가 hr 이다', posts.length === 1 && posts[0].req_type === 'hr');
  check('종류가 급여다', posts.length === 1 && posts[0].hr_kind === 'payroll');
  check('달이 정확히 갔다', posts.length === 1 && posts[0].period === '2026-08');
  check('같은 건 열쇠도 함께 갔다', posts.length === 1 && !!posts[0].client_key);

  // ★ 핵심 — 화면이 금액을 보내지 않는다(서버가 읽는다)
  check('금액을 보내지 않는다 (서버가 읽는다)',
        posts.length === 1 && posts[0].amount === undefined,
        '보낸 값: ' + JSON.stringify(posts[0] && posts[0].amount));
  check('제목도 보내지 않는다 (서버가 만든다)',
        posts.length === 1 && posts[0].title === undefined);

  console.log('\n[4] 평가 확정도 같은 방식인가');
  await page.locator('.kind', { hasText: /인사|HR/ }).click();
  await page.waitForTimeout(250);
  await page.locator('#form button', { hasText: '2026년 4월' }).click();
  await page.waitForTimeout(700);
  const posts2 = await page.evaluate(() => window.__POSTS);
  check('평가 건이 올라갔다', posts2.length === 2, JSON.stringify(posts2.length));
  check('종류가 평가다', posts2.length === 2 && posts2[1].hr_kind === 'evaluation');
  check('달이 정확히 갔다', posts2.length === 2 && posts2[1].period === '2026-04');

  console.log('\n[5] 실행 중 오류');
  check('자바스크립트 오류가 없다', errors.length === 0, errors.join(' | '));

  await browser.close();
  console.log('\n──────────────────────────────────────');
  console.log(FAIL ? ('  ' + FAIL + '건 실패 / ' + (PASS + FAIL) + '건') : ('  전부 통과 (' + PASS + '건)'));
  process.exit(FAIL ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
