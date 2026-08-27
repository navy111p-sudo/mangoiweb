// 📚 수업 중 교재 라이브러리 — 브라우저 검사 (2026-08-27) · ⚠️ 자동으로 안 돕니다, 사람이 부릅니다
//
//   무엇을 재현하나 —
//     마이마이 제보 「The library doesn't work sir … After uploading book folder at the library,
//     we can't now open the library during the class」의 뿌리를 그대로 재현한다.
//     교재 업로더에는 store 가 없을 때 «DB 버전을 올려» store 를 만드는 길이 있어
//     `mangoi-textbooks` 가 4 가 될 수 있다. 그러면 수업 화면이 `open(name, 3)` 으로 열다가
//     VersionError 로 **열기 자체가 실패**하고, 그 실패 경로에서는 교재를 여는 함수
//     (`window.selectFromTextbookLibrary`)가 **영영 정의되지 않았다**(chk() 안에 있었기 때문).
//     라이브러리 목록은 서버에서 받아 오므로 «목록은 보이는데 눌러도 안 되는» 상태가 된다.
//     ⚠️ IndexedDB 는 캐시가 아니라 재시작·캐시삭제·새로고침으로 안 풀린다 — 제보와 일치.
//
//   ⚠️ 🔴 **테스트마다 포트를 바꿔야 한다** — index.html 이 서비스워커를 등록하고 sw.js 가
//      `?v=` 자산과 내비게이션을 캐시하므로, 같은 포트로 두 번째 방문하면 **옛 index.html**
//      (옛 `?v=`)이 나와 「고쳤는데도 그대로」로 오진한다(CLAUDE.md 2장, 2026-08-27 실제로 밟음).
//
//   실행:
//     cd cloudflare-deploy/public && python3 -m http.server 8911 &
//     /opt/pw-browsers/chromium-1194/chrome-linux/chrome --headless=new \
//       --remote-debugging-port=9341 --user-data-dir=/tmp/tblib --no-sandbox &
//     BASE_URL=http://127.0.0.1:8911 CDP_PORT=9341 \
//       node test-harness/manual/textbook-library-open-browser.mjs
const PORT = Number(process.env.CDP_PORT || 9341);
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8911';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0; const FAILS = [];
const check = (n, ok) => { if (ok) { pass++; console.log('  ✅ ' + n); } else { fail++; FAILS.push(n); console.log('  ❌ ' + n); } };
const eq = (n, got, want) => check(`${n} → «${got}»`, got === want);

async function newPage() {
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0; const pend = new Map(); const subs = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); return; }
    if (m.method) subs.forEach((f) => f(m));
  });
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('JS: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  };
  return { send, evalJs, on: (f) => subs.push(f), close: () => fetch(`http://127.0.0.1:${PORT}/json/close/${t.id}`).catch(() => {}) };
}

console.log('📚 수업 중 교재 라이브러리 브라우저 검사 · ' + new Date().toISOString());
for (const t of await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json())
  await fetch(`http://127.0.0.1:${PORT}/json/close/${t.id}`).catch(() => {});
await sleep(500);

/* ═══════════════════════════════════════════════════════════════════════
   ① 로드 직후 — 교재를 여는 함수가 «이미» 있어야 한다
   ═══════════════════════════════════════════════════════════════════════ */
console.log('\n① 로드 직후 (라이브러리를 한 번도 안 열었을 때)');
{
  const p = await newPage();
  await p.send('Runtime.enable'); await p.send('Page.enable');
  await p.send('Page.navigate', { url: BASE + '/index.html?libtest=1' });
  await sleep(6000);
  const st = JSON.parse(await p.evalJs(`JSON.stringify({
    open: typeof window.openTextbookLibrary,
    load: typeof window.loadTextbookLibrary,
    close: typeof window.closeTextbookLibrary,
    select: typeof window.selectFromTextbookLibrary,
    toast: typeof window.mangoToast
  })`));
  eq('openTextbookLibrary', st.open, 'function');
  eq('loadTextbookLibrary', st.load, 'function');
  eq('closeTextbookLibrary', st.close, 'function');
  /* ⛔ 여기가 'undefined' 면 그 사고가 되돌아온 것이다 — 교재를 골라도 아무 일도 안 일어난다. */
  eq('selectFromTextbookLibrary (교재를 실제로 여는 함수)', st.select, 'function');
  eq('mangoToast 폴백 (거절이 조용하지 않게)', st.toast, 'function');
  await p.close();
}

/* ═══════════════════════════════════════════════════════════════════════
   ② 🔴 DB 버전이 4 인 브라우저 — 제보 상황 그대로
   ═══════════════════════════════════════════════════════════════════════ */
console.log('\n② 🔴 DB 버전을 4로 올린 뒤 (업로더가 store 를 만들며 올릴 수 있는 값)');
{
  const p = await newPage();
  const logs = [];
  p.on((m) => { if (m.method === 'Runtime.consoleAPICalled') logs.push((m.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(' ')); });
  await p.send('Runtime.enable'); await p.send('Page.enable');
  await p.send('Page.navigate', { url: BASE + '/index.html?libtest=2' });
  await sleep(6000);
  const bumped = await p.evalJs(`new Promise(function(res){
    var r = indexedDB.open('mangoi-textbooks', 4);
    r.onupgradeneeded = function(e){
      var d = e.target.result;
      if (!d.objectStoreNames.contains('textbooks')) d.createObjectStore('textbooks', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('files')) d.createObjectStore('files', { keyPath: 'id' });
    };
    r.onsuccess = function(){ var v = r.result.version; r.result.close(); res(v); };
    r.onerror = function(){ res(-1); };
  })`);
  eq('DB 버전을 4로 올렸다', bumped, 4);
  logs.length = 0;
  await p.evalJs(`window.loadTextbookLibrary()`);
  await sleep(7000);
  const st = JSON.parse(await p.evalJs(`JSON.stringify({ select: typeof window.selectFromTextbookLibrary })`));
  /* ⛔ 이 두 줄이 그 사고의 지문이다. 되돌리면 select='undefined' 이고 [ph245] 로그가 안 뜬다. */
  eq('버전 4 에서도 교재를 여는 함수가 있다', st.select, 'function');
  check('버전 4 에서도 IDB 를 읽는다 ([ph245] 로그)', logs.some((l) => /\[ph245\] IDB 교재/.test(l)));
  await p.close();
}

/* ═══════════════════════════════════════════════════════════════════════
   ③ 거절 안내가 «실제로 화면에 보이는가»
   ═══════════════════════════════════════════════════════════════════════ */
console.log('\n③ 학생·매니저가 눌렀을 때 이유를 알려 주는가');
{
  const p = await newPage();
  await p.send('Runtime.enable'); await p.send('Page.enable');
  await p.send('Page.navigate', { url: BASE + '/index.html?libtest=3' });
  await sleep(6000);
  const r = JSON.parse(await p.evalJs(`(function(){
    window.__vcTbDenyAt = 0;
    if (typeof window.vcTextbookDenied !== 'function') return JSON.stringify({ err: 'no-fn' });
    window.vcTextbookDenied();
    var el = document.getElementById('mgo-toast-fallback');
    if (!el) return JSON.stringify({ shown: false });
    var rc = el.getBoundingClientRect(), cs = getComputedStyle(el);
    /* ⚠️ elementsFromPoint 는 pointer-events:none 요소를 «건너뛴다» — 잠시 켜서 재야
       «가려졌다» 는 거짓 실패가 안 난다(2026-08-27 실제로 밟음). */
    el.style.pointerEvents = 'auto';
    var top = document.elementsFromPoint(rc.left + rc.width / 2, rc.top + rc.height / 2)[0];
    var ok = (top === el);
    el.style.pointerEvents = 'none';
    return JSON.stringify({
      shown: cs.display !== 'none', text: el.textContent, topmost: ok,
      inViewport: rc.top >= 0 && rc.bottom <= innerHeight, z: cs.zIndex
    });
  })()`));
  check('안내 상자가 뜬다', r.shown === true);
  check('내용이 «왜 안 되는지» 를 말한다: ' + r.text, /선생님만|teacher/i.test(r.text || ''));
  check('화면 안에 있다', r.inViewport === true);
  check('다른 것에 가려지지 않는다', r.topmost === true);
  check('z-index 가 재연결 안내(2147483646) 아래다', Number(r.z) < 2147483646);
  await p.close();
}

console.log('\n' + '═'.repeat(60));
console.log(`총 ${pass + fail}건 중 ✅ ${pass} 통과 / ❌ ${fail} 실패`);
if (fail) { console.log('\n❌ 실패:'); FAILS.forEach((f) => console.log('   - ' + f)); process.exit(1); }
console.log('\n🎉 교재 라이브러리 브라우저 검사 전체 통과');
