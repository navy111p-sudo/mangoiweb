/*
 * approval-push-reason-browser.mjs — 결재함 「알림 받기」가 «왜 안 켜졌는지» 를 말하는가 (2026-09-10)
 *
 * ⚠️ 자동으로 안 돕니다 — manual/ 규약상 *_harness.mjs 가 아니라 게이트가 물어가지 않습니다.
 *    work.html 의 웹푸시 구독(subscribePush·askPush·pushWhy)을 건드리면 **사람이 부르세요**:
 *      PW_DIR=/tmp/pw node test-harness/manual/approval-push-reason-browser.mjs
 *
 * 왜 이 검사가 있나 — 2026-09-10 사장님 제보 「알림 받기 안 켜진다고 나오지?」
 *   옛 코드는 네 단계(키 발급 → SW 등록 → 구독 → 서버 저장)의 실패를 catch 하나로 받아
 *   전부 「알림을 켜지 못했습니다」 한 줄로 뭉갰다. 그러면 보는 사람은 «내 폰 문제인지
 *   서버 설정 문제인지» 를 가릴 수 없고, 그래서 다음에 무엇을 할지도 정해지지 않는다.
 *   ⟹ 지금은 { ok, why } 를 돌려주고 화면이 사유를 그대로 말한다.
 *
 * ⚠️ 문자열 하니스로는 원리상 못 잽니다 — 함수도 값도 다 «있고» 틀린 것은
 *    «무슨 글자가 나오는가» 뿐이라 수리 전에도 --fast 가 전부 초록이었습니다.
 *
 * 🪤 이 검사를 만들며 실제로 밟은 함정 — 지우지 마세요
 *    스텁을 addInitScript 로 회차마다 쌓으면 2회차부터 **const 재선언으로 죽고**
 *    «1회차 스텁» 이 계속 살아 있습니다. 그러면 모든 회차가 같은 답을 내며
 *    검사가 통째로 헛돕니다(실제로 6건 중 5건이 거짓 FAIL 로 나왔습니다).
 *    → 회차마다 **새 컨텍스트**를 열고, 스텁 본문은 IIFE 로 감쌉니다.
 *
 * ⛔ 「막힌다」만 넣지 마세요 — «성공하면 성공이라고 말한다» 를 짝으로 둡니다.
 *    앞만 보면 «전부 실패로 만들기» 도 통과합니다.
 */

import { requireBrowser, fileUrl } from './_pw.mjs';

const { chromium, exe } = requireBrowser();
const FILE = fileUrl('cloudflare-deploy/public/work.html');

const HOME = {
  ok: true,
  me: { username: 'admin', name: '정우영', is_exec: true, is_teacher: false },
  can_approve: true, pending: 0,
  summary: { inbox: 0, mine_open: 0, archive: 0, money_scope: 'all',
             money: { month: [], year: [], month_count: 0, year_count: 0 } },
  types: [], inbox: [], mine: [], reuse: [], ack_pending: [], urgent: [],
};

/* [이름, 기대 문구, 스텁 설정] — 사유가 «서로 달라야» 뜻이 있다. */
const CASES = [
  ['키 없음(서버 미설정)', '서버에 알림 키(VAPID)가 아직 없습니다. 관리자가 등록해야 합니다.', { key: '' }],
  ['서버에 못 닿음',       '서버에 닿지 못했습니다. 연결을 확인하고 다시 눌러 주세요.',          { netfail: 1 }],
  // 🔴 fetch 는 404·500 에도 reject 하지 않는다 — 이 줄이 없으면 서버 장애가
  //    「관리자가 키를 등록해야 합니다」로 나가는 것을 아무도 못 본다(실제로 밟았다).
  ['서버 오류(HTTP 500)',  '서버가 알림 키를 주지 못했습니다 (HTTP 500). 잠시 뒤 다시 눌러 주세요.', { http: 500 }],
  ['SW 등록 실패',         '이 브라우저에서 알림용 백그라운드 등록에 실패했습니다.',             { key: 'AAA', swfail: 1 }],
  ['구독 거절',            '이 브라우저가 알림 구독을 거절했습니다.',                            { key: 'AAA', subfail: 1 }],
  ['서버 저장 실패',       '이 기기에서는 등록됐지만 서버가 저장하지 못했습니다.',               { key: 'AAA', savefail: 1 }],
  ['성공',                 '결재가 오면 알려 드립니다.',                                          { key: 'AAA' }],
];

let PASS = 0, FAIL = 0;
const check = (name, cond, extra) => {
  if (cond) { PASS++; console.log('  OK   ' + name); }
  else { FAIL++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
};

const stub = (home, cfg) => {
  window.__CFG = cfg;
  // 권한은 이미 «허용» 인 상태로 둔다 — 재려는 것은 그 «뒤» 단계다.
  Object.defineProperty(window, 'Notification', { configurable: true, value: {
    permission: 'granted', requestPermission: function () { return Promise.resolve('granted'); } } });
  Object.defineProperty(window, 'PushManager', { configurable: true, value: function () {} });
  var fakeSub = { toJSON: function () { return { endpoint: 'https://example/e1', keys: { p256dh: 'p', auth: 'a' } }; } };
  var reg = { pushManager: {
    getSubscription: function () { return Promise.resolve(null); },
    subscribe: function () { return window.__CFG.subfail ? Promise.reject(new Error('denied')) : Promise.resolve(fakeSub); } } };
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {
    register: function () { return window.__CFG.swfail ? Promise.reject(new Error('sw')) : Promise.resolve(reg); },
    ready: Promise.resolve(reg), addEventListener: function () {}, controller: null } });
  var realFetch = window.fetch;
  window.fetch = function (url) {
    var u = String(url);
    var J = function (o) { return Promise.resolve(new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } })); };
    if (u.indexOf('/api/push/vapid-public-key') >= 0) {
      window.__vapidHits = (window.__vapidHits || 0) + 1;   // «가드» 검사용
      if (window.__CFG.netfail) return Promise.reject(new TypeError('Failed to fetch'));
      if (window.__CFG.http) return Promise.resolve(new Response('<html>oops</html>',
        { status: window.__CFG.http, headers: { 'Content-Type': 'text/html' } }));
      return J({ ok: true, key: window.__CFG.key });
    }
    if (u.indexOf('/api/push/subscribe') >= 0) return J({ ok: !window.__CFG.savefail });
    if (u.indexOf('/api/') >= 0) return J(home);
    return realFetch.apply(this, arguments);
  };
};

(async () => {
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });

  for (const [name, want, cfg] of CASES) {
    // 🪤 회차마다 «새 컨텍스트» — 스텁이 쌓이면 검사가 통째로 헛돈다(머리말 참고)
    const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));

    // 🪤 IIFE 로 감싼다 — 최상위 const 를 쓰면 스텁이 겹칠 때 재선언으로 죽는다.
    await page.addInitScript(
      '(function(){try{localStorage.setItem("mangoi_lang","ko");}catch(e){}'
      + '(' + stub.toString() + ')(' + JSON.stringify(HOME) + ',' + JSON.stringify(cfg) + ');})();');

    await page.goto(FILE);
    await page.waitForTimeout(900);

    const got = await page.evaluate(async () => {
      const b0 = document.getElementById('pushBtn');
      // ⚠️ «누르기 전» 값을 함께 잰다 — 안 그러면 askPush 가 아무 일도 안 해도
      //    조용한 되살리기가 만들어 둔 상태 덕에 hidden 검사가 그냥 통과한다.
      const before = { hidden: b0 ? !!b0.hidden : null, hits: window.__vapidHits || 0 };
      window.askPush();
      await new Promise(r => setTimeout(r, 700));
      const t = document.querySelector('#toast, .toast');
      const b = document.getElementById('pushBtn');
      return {
        before: before,
        // ⚠️ textContent 만 보면 «화면에 안 보여도» 통과한다 — show 클래스까지 본다.
        toast: t ? t.textContent.trim() : '(토스트 없음)',
        toastShown: !!(t && String(t.className).indexOf('show') >= 0),
        hidden: b ? !!b.hidden : null,
        hits: window.__vapidHits || 0,
      };
    });

    // 🛡 «조용한 되살리기» 가 repaint 마다 다시 나가지 않는가 —
    //    가드(pushSilentTried)를 지우면 이 줄이 잡는다. ⚠️ «끊김» 은 일부러 다시 붙으므로 예외.
    const guard = await page.evaluate(async () => {
      const n0 = window.__vapidHits || 0;
      // ⚠️ repaint()·load() 는 IIFE 안이라 밖에서 못 부른다 — 화면의 「새로고침」이
      //    쓰는 window.reloadAll(→ load → repaint)로 실제 경로를 그대로 탄다.
      window.reloadAll(); window.reloadAll(); window.reloadAll();
      await new Promise(r => setTimeout(r, 600));
      return (window.__vapidHits || 0) - n0;
    });

    check(name + ' → 사유를 그대로 말한다', got.toast === want, '실제="' + got.toast + '" 기대="' + want + '"');
    check(name + ' — 토스트가 실제로 보인다(show)', got.toastShown === true, 'className 에 show 없음');
    check(name + ' — 누르기 «전» 에는 그 문구가 없었다', got.before.hits !== undefined && got.hits > got.before.hits,
          '발급요청 ' + got.before.hits + ' → ' + got.hits + ' (버튼이 아무 일도 안 했을 수 있다)');
    check(name + ' — JS 오류 0', errors.length === 0, errors.slice(0, 2).join(' / '));
    if (cfg.netfail) check(name + ' — «끊김» 은 다시 붙는다(가드에 안 걸린다)', guard >= 1, 'repaint 3회에 발급요청 ' + guard + '회');
    else             check(name + ' — repaint 를 세 번 해도 다시 안 나간다', guard === 0, 'repaint 3회에 발급요청 ' + guard + '회');
    // 성공했을 때만 버튼이 숨는다(이미 켜져 있으니 다시 권할 이유가 없다).
    if (name === '성공') check('성공하면 「알림 받기」 버튼이 숨는다', got.hidden === true, 'hidden=' + got.hidden);
    else check(name + ' — 실패했으면 버튼은 그대로 보인다(다시 누를 수 있어야 한다)', got.hidden === false, 'hidden=' + got.hidden);

    await ctx.close();
  }

  await browser.close();
  console.log('\n결과: PASS ' + PASS + ' / FAIL ' + FAIL);
  process.exit(FAIL ? 1 : 0);
})();
