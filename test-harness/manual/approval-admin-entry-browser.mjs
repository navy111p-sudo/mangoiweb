/*
 * 관리자 화면(admin.html)에 결재함 입구가 **실제로 보이는지** 눌러 확인한다.
 *
 * ⚠️ (2026-08-20) 입구가 «초록 줄(#mi-appr-badge)» 에서 **두 곳**으로 바뀌었다 —
 *    ① 사이드바 맨 위 「결재함」(#ia6-appr) ② 「자주 쓰는 기능」 표 첫 칸.
 *    초록 줄은 표 밖에 혼자 떠 있어 어색했고, 같은 입구가 셋이 되어 없앴다(사장님 지적).
 *
 * 왜 중요한가 — 2026-08-17 사장님 화면에서 «어디에도 안 보인다» 는 지적이 나왔다. 원인 둘:
 *   ① 대기 0건이면 아예 안 그렸다(입구가 없어 /work 주소를 외워야 했다)
 *   ② 오른쪽 아래에 띄웠는데 그 자리는 이미 「AI 운영비서」·상담원 아바타가 쓰고 있다 → 가려진다
 * 그래서 본문 맨 위(자주 쓰는 기능 바로 위)에 흐름 안 요소로 넣었다.
 * 이 검사는 «보이는가 · 가려지지 않는가 · 0건에도 있는가» 를 실제 브라우저에서 본다.
 *
 * 서버는 띄우지 않는다 — fetch 를 가짜로 바꾼다(운영 DB 를 건드리지 않는다).
 */
import { requireBrowser } from './_pw.mjs';

/* 🪤 file:// 로 열면 안 된다 — `<script src="/js/…">` 가 파일시스템 루트를 가리켜 전부 404 다.
      옛 검사는 초록 줄이 admin.html **인라인** 스크립트라 file:// 로도 통과했지만, 새 두 입구는
      외부 js(adm-ia6.js · adm-quick-access.js)가 그리므로 그대로 두면 «요소가 없다» 로 전부 실패한다
      (실제로 그렇게 12건이 빨개졌다). 정적 서버로 띄운 주소를 쓴다:
        cd cloudflare-deploy/public && python3 -m http.server 8899 */
const BASE = process.env.WORK_BASE || 'http://127.0.0.1:8899';

const { chromium, exe } = requireBrowser();

const FILE = BASE + '/admin.html';

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
  await page.waitForTimeout(6000);   // 외부 js 가 사이드바·자주쓰는기능을 그릴 때까지        // 입구는 첫 화면과 경쟁하지 않게 3초 뒤에 그린다
  return page;
}

(async () => {
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });

  console.log('\n[1] 대기 0건 — 그래도 입구가 보이는가 (급여 확정을 «올리러» 들어가는 경우)');
  let page = await open(browser, []);
  await page.evaluate(() => { const o = document.getElementById('aw-overlay'); if (o) o.remove(); });

  // ⛔ 옛 초록 줄은 없어야 한다 — 남아 있으면 같은 입구가 셋이 된다
  check('옛 초록 줄(#mi-appr-badge)은 없다', await page.locator('#mi-appr-badge').count() === 0);

  const probe = async () => page.evaluate(() => {
    const seat = (el) => { if (!el) return null;
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { w: Math.round(r.width), h: Math.round(r.height),
               covered: !(t === el || el.contains(t)),
               by: t ? (t.id || t.className || t.tagName) : '(화면 밖)' }; };
    const side = document.getElementById('ia6-appr');
    const quick = document.querySelector('#ph161-quick-items .ph161-q[data-qa="결재함"]');
    const qFirst = quick && quick === document.querySelector('#ph161-quick-items .ph161-q');
    return {
      side: seat(side), sideHref: side && side.getAttribute('href'),
      sideOn: side && side.classList.contains('on'),
      sideN: (document.getElementById('ia6-appr-n') || {}).textContent,
      quick: seat(quick), quickFirst: !!qFirst,
      quickN: quick && quick.querySelector('.mi-appr-n')
              ? quick.querySelector('.mi-appr-n').textContent : '',
    };
  });

  let r = await probe();
  check('① 사이드바에 결재함 줄이 있다', !!r.side);
  check('① /work 로 간다', r.sideHref === '/work', String(r.sideHref));
  check('① 무엇에도 가려지지 않는다', r.side && !r.side.covered, r.side && r.side.by);
  check('① 0건이면 «켜짐» 이 아니다 (테두리만 남는다)', r.sideOn === false);
  check('① 0건이면 배지가 비어 있다', !r.sideN);
  check('② 「자주 쓰는 기능」 표에 결재함 칸이 있다', !!r.quick);
  check('② 그 표의 **첫 칸**이다 (많이 눌린 순서에 밀리지 않게 고정)', r.quickFirst);
  check('② 무엇에도 가려지지 않는다', r.quick && !r.quick.covered, r.quick && r.quick.by);
  check('② 0건이면 숫자가 없다', !r.quickN);
  await page.context().close();

  console.log('\n[2] 대기가 있을 때 — 두 곳 다 숫자가 보이는가');
  page = await open(browser, [
    { id: 1, stage_due_at: now + 86400000 },
    { id: 2, stage_due_at: now + 86400000 },
    { id: 3, stage_due_at: now - 3600000 },   // 지연 1건
  ]);
  await page.evaluate(() => { const o = document.getElementById('aw-overlay'); if (o) o.remove(); });
  r = await probe();
  check('① 사이드바 배지가 3', r.sideN === '3', String(r.sideN));
  check('① 대기가 있으면 «켜진다»', r.sideOn === true);
  check('① 여전히 가려지지 않는다', r.side && !r.side.covered, r.side && r.side.by);
  check('② 표의 칸에도 숫자 3', r.quickN === '3', String(r.quickN));
  check('② 여전히 가려지지 않는다', r.quick && !r.quick.covered, r.quick && r.quick.by);
  await page.context().close();

  await browser.close();
  console.log('\n──────────────────────────────────────');
  console.log(FAIL ? ('  ' + FAIL + '건 실패 / ' + (PASS + FAIL) + '건') : ('  전부 통과 (' + PASS + '건)'));
  process.exit(FAIL ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
