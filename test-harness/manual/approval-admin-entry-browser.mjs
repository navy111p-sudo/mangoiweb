/*
 * 관리자 화면(admin.html)에 결재함 입구가 **실제로 보이는지** 눌러 확인한다.
 *
 * 왜 중요한가 — 2026-08-17 사장님 화면에서 «어디에도 안 보인다» 는 지적이 나왔다. 원인 둘:
 *   ① 대기 0건이면 아예 안 그렸다(입구가 없어 /work 주소를 외워야 했다)
 *   ② 오른쪽 아래에 띄웠는데 그 자리는 이미 「AI 운영비서」·상담원 아바타가 쓰고 있다 → 가려진다
 * 그래서 본문 맨 위(자주 쓰는 기능 바로 위)에 흐름 안 요소로 넣었다.
 * 이 검사는 «보이는가 · 가려지지 않는가 · 0건에도 있는가» 를 실제 브라우저에서 본다.
 *
 * 서버는 띄우지 않는다 — fetch 를 가짜로 바꾼다(운영 DB 를 건드리지 않는다).
 */
import { requireBrowser, fileUrl } from './_pw.mjs';

const { chromium, exe } = requireBrowser();

const FILE = fileUrl('cloudflare-deploy/public/admin.html');

let PASS = 0, FAIL = 0;
function check(name, cond, extra) {
  if (cond) { PASS++; console.log('  OK   ' + name); }
  else { FAIL++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

const now = Date.now();
function home(inbox) {
  return {
    ok: true, me: { username: 'admin', name: '정우영', is_exec: true, is_ph_manager: false, is_teacher: false },
    can_approve: true, pending: inbox.length, types: [], hr_periods: null,
    inbox, mine: [], reuse: [], urgent: [], colleagues: [], my_delegate: null, schedule_pending: 0,
  };
}

async function open(browser, inbox) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await page.addInitScript((h) => {
    const rf = window.fetch;
    window.fetch = function (u, o) {
      u = String(u);
      if (u.indexOf('/api/approval/home') === 0) {
        return Promise.resolve(new Response(JSON.stringify(h), { status: 200 }));
      }
      // 나머지 관리자 API 는 전부 빈 응답 — 이 검사는 결재 입구만 본다
      if (u.indexOf('/api/') === 0) {
        return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      }
      return rf(u, o);
    };
  }, home(inbox));
  await page.goto(FILE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4200);        // 입구는 첫 화면과 경쟁하지 않게 3초 뒤에 그린다
  return page;
}

(async () => {
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });

  console.log('\n[1] 대기 0건 — 그래도 입구가 보이는가 (급여 확정을 «올리러» 들어가는 경우)');
  let page = await open(browser, []);
  let el = page.locator('#mi-appr-badge');
  check('입구가 그려졌다', await el.count() === 1);
  check('눈에 보인다', await el.isVisible());
  check('«결재함» 이라고 쓰여 있다', (await el.textContent()).indexOf('결재함') >= 0,
        JSON.stringify(await el.textContent()));
  check('/work 로 간다', (await el.getAttribute('href')) === '/work');

  // ★ 가려지지 않는가 — 그 자리를 실제로 눌렀을 때 이 요소가 잡히는지 본다
  let hit = await page.evaluate(() => {
    const a = document.getElementById('mi-appr-badge');
    const r = a.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { covered: !(top === a || a.contains(top)), w: Math.round(r.width), h: Math.round(r.height),
             topId: top ? (top.id || top.className || top.tagName) : null };
  });
  check('무엇에도 가려지지 않는다 (그 자리를 누르면 입구가 잡힌다)', !hit.covered,
        '가린 것: ' + hit.topId);
  check('크기가 눌릴 만하다', hit.w > 100 && hit.h >= 36, JSON.stringify(hit));

  // 본문 맨 위인가 — 「자주 쓰는 기능」 바로 위
  const order = await page.evaluate(() => {
    const a = document.getElementById('mi-appr-badge');
    const q = document.getElementById('ph161-quick');
    if (!a || !q) return null;
    return { before: !!(a.compareDocumentPosition(q) & Node.DOCUMENT_POSITION_FOLLOWING),
             sameParent: a.parentNode === q.parentNode };
  });
  check('「자주 쓰는 기능」 바로 위에 있다 (본문 맨 위)', !!order && order.before && order.sameParent,
        JSON.stringify(order));
  await page.context().close();

  console.log('\n[2] 대기가 있을 때 — 건수가 보이는가');
  page = await open(browser, [
    { id: 1, stage_due_at: now + 86400000 },
    { id: 2, stage_due_at: now + 86400000 },
    { id: 3, stage_due_at: now - 3600000 },   // 지연 1건
  ]);
  el = page.locator('#mi-appr-badge');
  const t = await el.textContent();
  check('건수가 보인다', t.indexOf('3') >= 0, JSON.stringify(t));
  check('지연 건수도 보인다', t.indexOf('지연') >= 0, JSON.stringify(t));
  check('여전히 가려지지 않는다', await page.evaluate(() => {
    const a = document.getElementById('mi-appr-badge');
    const r = a.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return top === a || a.contains(top);
  }));
  await page.context().close();

  await browser.close();
  console.log('\n──────────────────────────────────────');
  console.log(FAIL ? ('  ' + FAIL + '건 실패 / ' + (PASS + FAIL) + '건') : ('  전부 통과 (' + PASS + '건)'));
  process.exit(FAIL ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
