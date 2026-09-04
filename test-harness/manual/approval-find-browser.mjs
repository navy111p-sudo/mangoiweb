/*
 * 📂 결재 문서함 — 「지난 결재 찾기」를 실제 브라우저에서 확인한다 (2026-09-04)
 *
 *   [왜 만들었나]
 *     사장님 제보 「결재한 것들을 잘 구분해서 정리해서 저장한 곳이 있어?」
 *     화면이 「내가 올린 것」 **최근 15건**만 보여 줘서 그 뒤로는 볼 방법이 없었다.
 *     검색·기간·분류·상태 필터도, 완료 문서함도, 엑셀도 없었다.
 *
 *   [짝으로 본다]
 *     「검색이 된다」만 검사하면 **아무 조건이나 무시하고 전부 주는 코드**도 통과한다.
 *     그래서 «보낸 요청에 그 조건이 실려 있는가» 를 가로채서 센다.
 *
 *   [특히 조심한 것]
 *     · 첫 화면은 API 한 번 — 패널이 닫혀 있는 동안 검색을 부르면 안 된다.
 *     · 결재자가 아닌 사람에게 «내가 결재할 것»·«전체» 함을 주면 서버가 403 을 준다.
 *     · 언어를 바꾸면 JS 로 그린 글자도 따라와야 한다(data-ko/data-en 이 못 건드린다).
 *
 *   돌리는 법:  PW_DIR=/tmp/pw node test-harness/manual/approval-find-browser.mjs
 *   ⚠️ 자동으로 안 돕니다(manual/ 규약) — 결재 문서함을 건드리면 사람이 부르세요.
 */

import { requireBrowser, fileUrl } from './_pw.mjs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const { chromium, exe } = requireBrowser();
const FILE = fileUrl('cloudflare-deploy/public/work.html');

/* 분류표는 정본에서 읽는다 — 손으로 적으면 소스를 바꿔도 검사가 안 바뀐다
   (2026-09-04 에 첨부 검사에서 실제로 그렇게 헛돌았다). */
const P = await import(
  pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), '..', '..',
                     'cloudflare-deploy', 'src', 'approval-policy.ts')).href);
const TYPES = P.TYPES.map((t) => ({
  key: t.key, ko: t.ko, en: t.en, needs_amount: t.needsAmount,
  wants_file: t.wantsFile, requires_file: !!t.requiresFile,
  wants_dates: !!t.wantsDates, picks_period: t.key === 'hr',
}));

const now = Date.now();
const DAY = 86400000;

function row(id, title, type, status, days) {
  const spec = TYPES.find((t) => t.key === type) || TYPES[0];
  return {
    id, req_type: type, type_ko: spec.ko, type_en: spec.en, title,
    requester_username: 'admin', requester_name: '정우영',
    status, created_at: now - days * DAY,
    decided_at: status === 'pending' ? null : (now - (days - 1) * DAY),
    decided_by: status === 'pending' ? null : 'mgr_jjw',
    stage_seq: 1, stage_total: 1, escalated: false, flags: [], has_file: false,
    steps: [{ seq: 1, role: 'staff', status: status === 'pending' ? 'active' : status }],
    approver_count: 1, blocked: false,
  };
}

const HOME = {
  ok: true,
  me: { username: 'admin', name: '정우영', is_exec: true, is_ph_manager: false, is_teacher: false },
  colleagues: [], my_delegate: null, can_approve: true, pending: 0,
  types: TYPES, inbox: [], reuse: [], urgent: [],
  mine: [row(90, '최근 건', 'doc', 'pending', 1)],
};

/** 검색 응답 — 20건 + has_more 로 «더 보기» 가 실제로 도는지 본다. */
const PAGE1 = { ok: true, can_approve: true, pending: 0, has_more: true, offset: 0,
  items: Array.from({ length: 20 }, (_, i) => row(100 + i, '지난 결재 ' + (i + 1), 'expense', 'approved', 30 + i)) };
const PAGE2 = { ok: true, can_approve: true, pending: 0, has_more: false, offset: 20,
  items: [row(200, '더 오래된 건', 'purchase', 'rejected', 80)] };

let PASS = 0, FAIL = 0;
function check(name, cond, extra) {
  if (cond) { PASS++; console.log('  OK   ' + name); }
  else { FAIL++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

(async () => {
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('dialog', (d) => d.accept());

  await page.addInitScript(({ home, p1, p2 }) => {
    try { localStorage.setItem('mangoi_lang', 'ko'); } catch (e) {}
    window.__FIND_URLS = [];               // 검색이 실제로 무엇을 물었는지
    window.__NAV = [];                     // location.href 로 연 주소(엑셀)
    const rf = window.fetch;
    window.fetch = function (u, o) {
      u = String(u);
      if (u.indexOf('/api/approval/home') === 0) {
        return Promise.resolve(new Response(JSON.stringify(home), { status: 200 }));
      }
      if (u.indexOf('/api/approval/requests?') === 0) {
        window.__FIND_URLS.push(u);
        const more = /offset=(\d+)/.exec(u);
        const off = more ? Number(more[1]) : 0;
        return Promise.resolve(new Response(JSON.stringify(off >= 20 ? p2 : p1), { status: 200 }));
      }
      if (u.indexOf('/api/push/vapid-public-key') === 0) {
        return Promise.resolve(new Response(JSON.stringify({ ok: true, key: '' }), { status: 200 }));
      }
      return rf(u, o);
    };
  }, { home: HOME, p1: PAGE1, p2: PAGE2 });

  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForTimeout(600);

  const findUrls = () => page.evaluate(() => window.__FIND_URLS);

  /* ── ① 첫 화면 예산 ────────────────────────────────────────────────── */
  console.log('\n[1] 첫 화면 — 안 열었는데 서버를 부르지 않는가');

  check('패널이 닫혀 있다', await page.locator('#findPanel').isHidden());
  check('아직 검색을 부르지 않았다 (첫 화면은 API 한 번)',
        (await findUrls()).length === 0, JSON.stringify(await findUrls()));

  /* ── ② 열면 찾아 준다 ─────────────────────────────────────────────── */
  console.log('\n[2] 열면 지난 결재가 나오는가');

  await page.locator('#findBtn').click();
  await page.waitForTimeout(700);
  check('패널이 열린다', await page.locator('#findPanel').isVisible());
  check('열 때 한 번 부른다', (await findUrls()).length === 1);

  const cards = await page.locator('#findResult .item').count();
  check('지난 결재가 20건 그려진다 (15건 제한이 사라졌다)', cards === 20, '실제 ' + cards + '건');
  /* ⚠️ 버튼이 없을 때 그냥 click() 하면 타임아웃으로 **검사가 통째로 죽는다** —
     무엇이 깨졌는지 안 보인다. 없으면 «못 눌렀다» 고 깔끔하게 FAIL 로 남긴다. */
  const hasMoreBtn = (await page.locator('#findResult .findmore').count()) === 1;
  check('«더 보기» 버튼이 있다', hasMoreBtn);

  if (hasMoreBtn) {
    await page.locator('#findResult .findmore').click();
    await page.waitForTimeout(600);
    const after = await page.locator('#findResult .item').count();
    check('«더 보기» 를 누르면 이어 붙는다 (21건)', after === 21, '실제 ' + after + '건');
    check('두 번째 요청에 offset 이 실린다',
          /offset=20/.test((await findUrls())[1] || ''), (await findUrls())[1]);
    check('다 불러오면 «더 보기» 가 사라진다',
          (await page.locator('#findResult .findmore').count()) === 0);
  } else {
    check('«더 보기» 를 누르면 이어 붙는다 (21건)', false, '버튼이 없어 누르지 못했다');
    check('두 번째 요청에 offset 이 실린다', false, '버튼이 없어 두 번째 요청이 없다');
    check('다 불러오면 «더 보기» 가 사라진다', false, '앞 단계가 실패했다');
  }

  /* ── ③ 조건이 실제로 서버에 가는가 (짝 검사) ───────────────────────── */
  console.log('\n[3] 고른 조건이 요청에 실리는가');

  await page.fill('#fq', '라우터');
  await page.locator('.findgo').click();
  await page.waitForTimeout(600);
  let last = (await findUrls()).slice(-1)[0];
  check('검색어가 실린다', /[?&]q=/.test(last) && decodeURIComponent(last).indexOf('라우터') >= 0, last);

  await page.selectOption('#ftype', 'expense');
  await page.waitForTimeout(600);
  last = (await findUrls()).slice(-1)[0];
  check('분류가 실린다', /[?&]type=expense/.test(last), last);

  await page.selectOption('#fstat', 'approved');
  await page.waitForTimeout(600);
  last = (await findUrls()).slice(-1)[0];
  check('상태가 실린다', /[?&]status=approved/.test(last), last);

  await page.fill('#ffrom', '2026-08-01');
  await page.waitForTimeout(600);
  await page.fill('#fto', '2026-08-31');
  await page.waitForTimeout(600);
  last = (await findUrls()).slice(-1)[0];
  check('기간이 실린다', /from=2026-08-01/.test(last) && /to=2026-08-31/.test(last), last);

  await page.selectOption('#fscope', 'done');
  await page.waitForTimeout(600);
  last = (await findUrls()).slice(-1)[0];
  check('함(완료)이 실린다', /scope=done/.test(last), last);

  // 짝 검사 — 비운 칸은 보내지 않는다(빈 값을 보내면 서버가 «전부» 로 오해할 수 있다)
  await page.fill('#fq', '');
  await page.selectOption('#ftype', '');
  await page.waitForTimeout(600);
  last = (await findUrls()).slice(-1)[0];
  check('비운 조건은 안 보낸다 (짝 검사)', !/[?&]q=/.test(last) && !/[?&]type=/.test(last), last);

  /* ── ④ 함 목록은 권한을 따르는가 ──────────────────────────────────── */
  console.log('\n[4] 함 목록 — 결재자에게만 주는 것');

  const scopeVals = await page.evaluate(() =>
    Array.from(document.getElementById('fscope').options).map((o) => o.value));
  check('내 문서함 넷이 있다',
        ['mine', 'open', 'done', 'rejected'].every((v) => scopeVals.indexOf(v) >= 0), scopeVals.join(','));
  check('결재자에게는 «내가 결재할 것»·«전체» 도 있다',
        scopeVals.indexOf('pending') >= 0 && scopeVals.indexOf('all') >= 0, scopeVals.join(','));

  /* ── ⑤ 언어 전환 ──────────────────────────────────────────────────── */
  console.log('\n[5] 영어로 바꿔도 따라오는가');

  await page.evaluate(() => window.toggleLang());
  await page.waitForTimeout(500);
  const en = await page.evaluate(() => {
    const sc = document.getElementById('fscope');
    const q = document.getElementById('fq');
    const btn = document.getElementById('findBtn');
    return {
      scope: sc ? Array.from(sc.options).map((o) => o.textContent).join('|') : '',
      ph: q ? q.placeholder : '',
      btn: btn ? btn.textContent : '',
      keep: sc ? sc.value : '',
    };
  });
  check('함 이름이 영어로 바뀐다', /Approved|In progress/.test(en.scope), en.scope);
  check('검색창 안내도 영어로 바뀐다', /Search/i.test(en.ph), JSON.stringify(en.ph));
  check('버튼 글자도 영어로 바뀐다', /Find past/i.test(en.btn), JSON.stringify(en.btn));
  check('언어를 바꿔도 고른 함이 그대로다 (done)', en.keep === 'done', en.keep);

  /* ── ⑥ 좁은 화면 ──────────────────────────────────────────────────── */
  console.log('\n[6] 휴대폰 390px');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - window.innerWidth);
  check('가로로 넘치지 않는다', overflow <= 0, '넘침 ' + overflow + 'px');

  /* ── ⑦ 엑셀 — 맨 뒤에 둔다(진짜 네비게이션이라 페이지 상태를 흔든다) ───────────────────────────────────────────────────────── */
  console.log('\n[7] 엑셀 내려받기');

  /* ⚠️ location.href 를 후킹해서 «이동했다» 를 잡지 않는다 — 최신 크롬은 Location
     재정의를 막는데 **예외도 안 내고 조용히 원본 그대로**라, 그대로 진짜 내려받기가
     시작되어 검사가 통째로 죽는다(CLAUDE.md 2장 · 이 검사가 실제로 그렇게 죽었다).
     진짜 네비게이션을 route 로 가로채 주소만 보고 취소한다. */
  let csvUrl = null;
  await page.route((u) => String(u).indexOf('format=csv') >= 0, (route) => {
    csvUrl = route.request().url();
    route.abort();
  });
  await page.evaluate(() => window.findCsv());
  await page.waitForTimeout(700);

  check('엑셀 주소에 format=csv 가 있다', !!csvUrl && /format=csv/.test(csvUrl), String(csvUrl));
  check('엑셀도 고른 조건을 그대로 쓴다', !!csvUrl && /scope=done/.test(csvUrl), String(csvUrl));

  /* ── ⑧ 조용한 실패가 없는가 ───────────────────────────────────────── */
  console.log('\n[8] 실행 중 오류');
  check('자바스크립트 오류가 없다', errors.length === 0, errors.join(' / '));

  console.log('\n──────────────────────────────────────');
  console.log(FAIL ? ('  ⚠ ' + FAIL + '건 실패 / ' + (PASS + FAIL) + '건')
                   : ('  전부 통과 (' + PASS + '건)'));
  await browser.close();
  process.exit(FAIL ? 1 : 0);
})();
