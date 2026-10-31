/* manual/allmenu-url-browser.mjs — 「전체메뉴」가 «진짜 화면에서» 열리는가 (2026-09-14)
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ 자동으로 안 돕니다 — 사람이 부릅니다(manual/ 규약: 게이트가 물어 가지 않음).
 *
 *   준비:  cd cloudflare-deploy/public && python3 -m http.server 8891
 *          /opt/pw-browsers/chromium-1194/chrome-linux/chrome --headless=new --no-sandbox \
 *            --remote-debugging-port=9222 --user-data-dir=/tmp/cd-allmenu about:blank &
 *   실행:  node test-harness/manual/allmenu-url-browser.mjs
 *
 * [왜] 2026-09-14 사장님 제보 — 「전체 메뉴 누르면 홈화면으로만 가? 전체메뉴는 안보여」.
 *      공용 사이드바(js/mg-sidebar.js)는 «주소로만» 옮겨 가는데(mgGo → location.href)
 *      「전체메뉴」는 홈에서만 도는 «함수»(openAllMenuOverlay)라 줄 주소가 없어
 *      주소표에 '/' 라고 적혀 있었다 — 홈 밖 25개 화면에서 눌러도 홈으로 «가기만» 했다.
 *      수리는 «주소를 하나 내 주는 것»(/?menu=all-menu)이고, 그 주소가 진짜로
 *      오버레이를 여는지는 여기서만 잰다.
 *
 * ⚠️ sidebar_menu_parity_harness 는 «주소가 짝이 맞는가» 까지만 본다.
 *    «그 주소로 들어가면 실제로 무엇이 그려지는가» 는 문자열로 못 본다.
 * ⚠️ 「열렸다」·「보인다」·「눌린다」는 다 다르다(CLAUDE.md) — 셋을 따로 잰다.
 * ⚠️ 되돌려 보면 실제로 FAIL 납니다(실측: js/idx-allmenu.js 의 ?menu=all-menu 절을
 *    끄면 5건 FAIL — 「안 열림」·「안 보임」·「덮임」·「menu 가 안 지워짐」·「빈 상자」).
 * ⚠️ 캐시를 «두 겹» 다 끈다 — 서비스워커는 setCacheDisabled 로 안 꺼진다(CLAUDE.md).
 */
const PORT = Number(process.env.CDP_PORT || 9222);
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8891';
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find(t => t.type === 'page');
if (!page) { console.log('페이지 대상이 없습니다 — 크로미움을 먼저 띄우세요'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const waits = new Map();
const send = (method, params = {}) => new Promise((res, rej) => {
  const i = ++id; waits.set(i, { res, rej });
  ws.send(JSON.stringify({ id: i, method, params }));
});
await new Promise(r => ws.addEventListener('open', r));
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && waits.has(m.id)) { const w = waits.get(m.id); waits.delete(m.id);
    m.error ? w.rej(new Error(JSON.stringify(m.error))) : w.res(m.result); }
  /* 헤드리스에서 alert/confirm 이 뜨면 렌더러가 멈춘다 — 무조건 닫는다 */
  if (m.method === 'Page.javascriptDialogOpening') send('Page.handleJavaScriptDialog', { accept: false }).catch(() => {});
});
const evalJs = async (expr) => {
  const r = await Promise.race([
    send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }),
    new Promise((_, rj) => setTimeout(() => rj(new Error('EVAL-TIMEOUT')), 12000))
  ]);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
};
await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
try { await send('Network.setBypassServiceWorker', { bypass: true }); } catch (_) {}
const go = async (q) => { await send('Page.navigate', { url: BASE + '/' + q });
                          await new Promise(r => setTimeout(r, 4500)); };

let P = 0, F = 0;
const t = (name, got, want) => { const okk = String(got) === String(want); okk ? P++ : F++;
  console.log(`  ${okk ? 'PASS' : 'FAIL'} ${name} → ${JSON.stringify(got)}${okk ? '' : ' (기대 ' + JSON.stringify(want) + ')'}`); };

/* ① 파라미터가 없으면 저절로 열리면 안 된다.
   ⚠️ 이 짝이 없으면 «언제나 열기» 도 통과한다(CLAUDE.md: 짝으로 물을 것). */
console.log('① 파라미터 없는 홈 — 저절로 열리지 않는가');
await go('?_nc=' + Date.now());
t('오버레이 존재', await evalJs(`!!document.getElementById('mangoi-allmenu')`), false);

/* ② /?menu=all-menu — 열리고, 보이고, 맨 위에 있고, 비어 있지 않은가 */
console.log('\n② /?menu=all-menu — 실제로 열리는가');
await go('?menu=all-menu&_nc=' + Date.now());
t('오버레이 존재', await evalJs(`!!document.getElementById('mangoi-allmenu')`), true);
t('화면을 덮는가(폭>200 · 높이>200 · display/visibility)', await evalJs(
  `(function(){var o=document.getElementById('mangoi-allmenu');if(!o)return 'none';
    var r=o.getBoundingClientRect(),c=getComputedStyle(o);
    return (r.width>200&&r.height>200&&c.display!=='none'&&c.visibility!=='hidden')?'visible':
      ('w'+Math.round(r.width)+' h'+Math.round(r.height)+' '+c.display+' '+c.visibility);})()`), 'visible');
t('한가운데 맨 위가 오버레이 안인가', await evalJs(
  `(function(){var o=document.getElementById('mangoi-allmenu');if(!o)return 'none';
    var e=document.elementFromPoint(Math.round(innerWidth/2),Math.round(innerHeight/2));
    return e?(o.contains(e)?'inside':(e.id||e.tagName)):'null';})()`), 'inside');
t('누를 것이 10개 이상인가(빈 상자가 아닌가)', await evalJs(
  `(function(){var o=document.getElementById('mangoi-allmenu');
    return o?(o.querySelectorAll('a,button').length>=10?'ok':'empty:'+o.querySelectorAll('a,button').length):'none';})()`), 'ok');

/* ③ 주소 정리 — menu «만» 지워야 한다.
   ⛔ pathname 으로 통째로 갈아치우면 index.html 이 수업으로 되돌아올 때 쓰는
      ?room= 과 해시까지 조용히 잃는다(CLAUDE.md). */
console.log('\n③ 주소에서 menu «만» 지워졌는가');
const q = await evalJs('location.search');
console.log('      location.search = ' + JSON.stringify(q));
t('menu 가 지워졌다(새로고침에 또 열리지 않는다)', q.indexOf('menu=') < 0, true);
t('다른 쿼리는 남았다(통째로 갈아치우지 않았다)', q.indexOf('_nc=') >= 0, true);

/* ④ 사장님이 실제로 하신 그 동작 — 홈 «밖» 화면에서 사이드바의 「전체메뉴」를 누른다.
   이 절이 이 파일의 핵심이다. ①~③은 «주소가 들어오면» 을 재고, 여기는
   «그 주소가 실제로 만들어져 나가는가» 까지 한 번에 잰다(공용 mgGo → 홈 → 오버레이).
   ⚠️ 되돌리면(mg-sidebar.js 의 'all-menu' 를 '/' 로) 홈에는 도착하지만 오버레이가
      안 열려 제보 그대로가 재현된다. */
console.log('\n④ 홈 «밖» 화면(ai-write.html)에서 사이드바 「전체메뉴」를 눌러 본다');
await go('ai-write.html?_nc=' + Date.now());
t('그 화면에 전체메뉴 버튼이 있는가', await evalJs(
  `[].slice.call(document.querySelectorAll('button')).filter(function(x){
     return (x.getAttribute('onclick')||'').indexOf("mgGo('all-menu')")>=0;}).length`), 1);
await evalJs(`(function(){var b=[].slice.call(document.querySelectorAll('button')).filter(function(x){
  return (x.getAttribute('onclick')||'').indexOf("mgGo('all-menu')")>=0;})[0]; if(b) b.click();})()`);
await new Promise(r => setTimeout(r, 5000));
t('홈으로 왔는가', await evalJs('location.pathname'), '/');
t('전체메뉴가 열렸는가 (← 제보의 그 자리)', await evalJs(`!!document.getElementById('mangoi-allmenu')`), true);
t('주소가 정리됐는가', await evalJs('location.search.indexOf("menu=") < 0'), true);

console.log(`\n결과: PASS ${P} / FAIL ${F}`);
ws.close();
process.exit(F ? 1 : 0);
