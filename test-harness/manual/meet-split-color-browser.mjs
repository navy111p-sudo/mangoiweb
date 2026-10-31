/* meet-split-color-browser.mjs — 수업 관찰 카드의 「⚠ 혼자 대기중」·「혼자」 색이
 * 실제 화면에서 «갈리는지» 재는 브라우저 검사 (2026-09-10)
 *
 * ⚠️ 자동으로 안 돕니다 — manual/ 규약상 게이트가 물어 가지 않습니다. 사람이 부릅니다:
 *      cd cloudflare-deploy/public && python3 -m http.server 8899 &
 *      /opt/pw-browsers/chromium-1194/chrome-linux/chrome --headless=new --no-sandbox \
 *        --remote-debugging-port=9222 about:blank &
 *      node test-harness/manual/meet-split-color-browser.mjs
 *
 * ── 왜 ──────────────────────────────────────────────────────────────────────
 * 2026-09-10 에 회의방을 갈라 그리면서 「회의방은 노란 경고 대신 회색」이라고 코드 주석·
 * 커밋 메시지·규칙서 세 곳에 적었는데, **화면에서는 두 글자가 같은 검정**이었습니다.
 * `html[data-admin-theme="ivory"][data-admin-tone="slate"] [id^="card-"] :is(p,span,div,…)`
 * 가 `#101828 !important` 로 덮어 인라인 color 를 이기기 때문입니다(CLAUDE.md 2장).
 * ⟹ **색 주장은 문자열 하니스로 원리상 못 봅니다.** 브라우저에서 재야 합니다.
 *
 * ⚠️ 카드 «밖» 에서 재면 안 됩니다 — 이기는 규칙이 `[id^="card-"]` 를 요구하므로
 *    밖에서는 «멀쩡한 답» 이 나옵니다(CLAUDE.md 「카드 밖에서 쟀더니 …그 답이 거짓」).
 */
const PORT = process.env.PORT || 8899, CDP = process.env.CDP || 9222;
let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? (pass++, console.log('  ✅ ' + m)) : (fail++, console.log('  ❌ ' + m + (extra ? '\n       · ' + extra : ''))); };

let list;
try { list = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json(); }
catch { console.log('⏭ 크로미움(9222)이 없어 건너뜁니다 — 파일 머리말의 실행법을 보세요.'); process.exit(0); }
const page = list.find((t) => t.type === 'page');
if (!page) { console.log('⏭ 열린 탭이 없어 건너뜁니다.'); process.exit(0); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const waiters = new Map();
const send = (method, params = {}) => new Promise((r) => { const i = ++id; waiters.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m.result); waiters.delete(m.id); } };
await new Promise((r) => { ws.onopen = r; });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;

console.log('■ 수업 관찰 카드 — 「혼자」 두 표시의 색 (브라우저 실측)');
await send('Page.enable'); await send('Runtime.enable');
/* ⚠️ 캐시를 «두 겹» 다 끈다 — HTTP 캐시만 끄면 서비스워커가 옛 사본을 준다(CLAUDE.md 2장) */
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Network.setBypassServiceWorker', { bypass: true });
/* 첫 방문자 «환영 안내» 오버레이가 스크롤·클릭을 막는다 — 본 것으로 표시 */
await send('Page.addScriptToEvaluateOnNewDocument', { source: "try{localStorage.setItem('mangoi_admin_welcome_v1_done','1')}catch(e){}" });
await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/admin.html?_nc=` + Date.now() });
await new Promise((r) => setTimeout(r, 6000));
/* IA6 는 카드를 «한 번에 한 장» 만 보여 준다 — 그 카드를 먼저 연다 */
await ev("try{ jumpToMenu('card-admin-ghost') }catch(e){ var d=document.getElementById('card-admin-ghost'); if(d) d.open=true }");
await new Promise((r) => setTimeout(r, 3000));   /* 글자색 페인터가 도는 시간을 준다 */

const R = await ev(`(() => {
  const box = document.getElementById('gh-live-list');
  if (!box) return { err: 'gh-live-list 없음' };
  const card = box.closest('[id^="card-"]');
  const put = (html) => { box.insertAdjacentHTML('beforeend', html); };
  put('<span id="_pA" class="gh-alone">\\u26A0 혼자 대기중</span>'
    + '<span id="_pB" class="gh-alone-meet">혼자</span>'
    /* 되돌림 대조 — 옛 «인라인 색» 방식. 이 둘이 같아져야 이 검사가 헛돌지 않는다는 증거다. */
    + '<span id="_pC" style="color:#fbbf24;font-weight:800">\\u26A0 혼자 대기중</span>'
    + '<span id="_pD" style="color:#94a3b8;font-weight:700">혼자</span>');
  const num = (c) => { const m = String(c).match(/rgba?\\((\\d+)[,\\s]+(\\d+)[,\\s]+(\\d+)(?:[,\\s/]+([\\d.]+))?/);
    return m ? [ +m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4] ] : null; };
  /* 배경 — 불투명한 층을 만날 때까지 모아 아래에서 위로 겹친다(반투명·그라데이션 대응) */
  const bgOf = (el) => {
    const layers = [];
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const s = getComputedStyle(n);
      let c = num(s.backgroundColor);
      if ((!c || c[3] === 0) && s.backgroundImage && s.backgroundImage !== 'none') {
        const g = String(s.backgroundImage).match(/rgba?\\([^)]+\\)/g);
        if (g) c = num(g[0]);
      }
      if (!c || c[3] === 0) continue;
      layers.push(c);
      if (c[3] === 1) break;
    }
    let base = [255, 255, 255];
    for (let i = layers.length - 1; i >= 0; i--) {
      const [r, g, b, a] = layers[i];
      base = [r * a + base[0] * (1 - a), g * a + base[1] * (1 - a), b * a + base[2] * (1 - a)];
    }
    return base;
  };
  const lum = (rgb) => { const f = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); const hi = Math.max(l1, l2), lo = Math.min(l1, l2); return (hi + 0.05) / (lo + 0.05); };
  const one = (el) => { const s = getComputedStyle(el); const c = num(s.color); const bg = bgOf(el);
    return { color: s.color, weight: s.fontWeight, contrast: +ratio([c[0], c[1], c[2]], bg).toFixed(2) }; };
  const A = one(document.getElementById('_pA')), B = one(document.getElementById('_pB'));
  const C = one(document.getElementById('_pC')), D = one(document.getElementById('_pD'));
  ['_pA','_pB','_pC','_pD'].forEach((i) => document.getElementById(i).remove());
  return { cardId: card && card.id, visible: !!box.offsetParent,
           theme: document.documentElement.getAttribute('data-admin-theme'),
           tone: document.documentElement.getAttribute('data-admin-tone'), A, B, C, D };
})()`);

ok(!!R && !R.err, '⓪ 전제: 수업 관찰 카드 안에서 쟀다', R && R.err);
if (R && !R.err) {
  ok(R.cardId === 'card-admin-ghost' && R.visible === true,
    `⓪-b 전제: 그 카드가 실제로 보이는 상태다 (card=${R.cardId} · visible=${R.visible})`,
    'IA6 는 한 번에 한 장만 보여 준다 — 안 열면 «보인다·색» 검사가 통째로 헛돈다');
  ok(R.theme === 'ivory', `⓪-c 전제: admin.html 은 ivory 고정이다 (지금 ${R.theme}/${R.tone})`,
    '다크로 갈 길이 없으므로 여기서 잰 색이 화면의 전부다(CLAUDE.md 2장)');

  ok(R.A.color !== R.B.color,
    `① 두 표시의 색이 실제로 갈린다 (수업방 ${R.A.color} · 회의방 ${R.B.color})`,
    '같으면 «회색으로 낮췄다» 는 말이 화면에서 거짓이 된다');
  ok(R.A.contrast >= 4.5, `②-a 수업방 경고가 읽힌다 (대비 ${R.A.contrast})`, '⛔ #fbbf24 로 되돌리지 말 것 — 흰 카드 위 1.67');
  ok(R.B.contrast >= 4.5, `②-b 회의방 표시도 읽힌다 (대비 ${R.B.contrast})`, '낮추는 것과 «안 보이게 하는 것» 은 다르다');
  ok(R.A.weight === '800' && R.B.weight === '700',
    `③ 굵기도 갈린다 (${R.A.weight}/${R.B.weight}) — 색은 «둘째» 신호다`);

  /* ④ 되돌림 대조 — 이 줄이 없으면 위 검사가 «원래 늘 갈리는 것» 을 재는지 알 수 없다 */
  ok(R.C.color === R.D.color,
    `④ 옛 «인라인 색» 방식은 여전히 둘 다 같은 색이다 (${R.C.color}) — 이 검사가 헛돌지 않는다는 증거`,
    '인라인이 살아난다면 이 카드의 색 규칙이 바뀐 것 — 위 꼬리 블록을 다시 봐야 한다');
}

console.log(`\n${pass} PASS / ${fail} 실패`);
ws.close();
process.exit(fail ? 1 : 0);
