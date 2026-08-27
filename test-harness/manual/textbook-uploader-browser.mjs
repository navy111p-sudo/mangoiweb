// 📚 교재 업로더 — 브라우저 검사 (2026-08-27) · ⚠️ 자동으로 안 돕니다, 사람이 부릅니다
//
//   왜 브라우저여야 하나 —
//     이 사고(「BTS 2/001 을 올리면 교재 이름이 «001» 이 된다」)는 함수도 값도 다 «있는»
//     상태에서 났다. 틀린 것은 «분류기가 무슨 이름을 내놓는가» 와 «자동 저장이 언제
//     누르는가» 뿐이라, 문자열 하니스 211건이 전부 초록이었다. 이름은 정적 하니스가
//     못 박았고(textbook_uploader_naming_harness), 여기서는 **요청이 실제로 나가는가** 를 본다.
//
//   ⚠️ 이 컨테이너에는 playwright 가 없다(node_modules 미설치) → CDP 를 직접 말한다.
//      Node 22 는 WebSocket 이 전역이라 라이브러리가 필요 없다.
//
//   실행:
//     cd cloudflare-deploy/public && python3 -m http.server 8901 &
//     /opt/pw-browsers/chromium-1194/chrome-linux/chrome --headless=new \
//       --remote-debugging-port=9333 --user-data-dir=/tmp/tbup --no-sandbox &
//     node test-harness/manual/textbook-uploader-browser.mjs
//
//   ⚠️ 탭을 닫지 않고 여러 번 돌리면 «먼저 열린 탭» 이 IndexedDB 를 붙잡아
//      openDB 가 안 끝나고, 저장이 조용히 멈춘 것처럼 보인다(2026-08-27 실제로 오진).
//      그래서 이 검사는 시작할 때 남은 탭을 모두 닫는다.
const PORT = Number(process.env.CDP_PORT || 9333);
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8901';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0; const FAILS = [];
const check = (n, ok) => { if (ok) { pass++; console.log('  ✅ ' + n); } else { fail++; FAILS.push(n); console.log('  ❌ ' + n); } };
const eq = (n, got, want) => check(`${n} → «${got}»`, got === want);

async function closeAllTabs() {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  for (const t of list) await fetch(`http://127.0.0.1:${PORT}/json/close/${t.id}`).catch(() => {});
  await sleep(500);
}
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

// 업로드 POST 를 가로채 «무슨 이름으로 나갔나» 를 기록하고 원하는 상태코드로 답한다
const STUB = (status) => `
window.__up = []; window.__alerts = [];
window.alert = function (m) { window.__alerts.push(String(m)); };
window.__of = window.fetch;
window.fetch = function (u, o) {
  var url = String(u);
  if (url.indexOf('/api/admin/textbook-files') >= 0 && o && o.method === 'POST') {
    window.__up.push(o.body.get('name'));
    return Promise.resolve(new Response(JSON.stringify(${status} === 200 ? { ok: true, id: 1 } : { ok: false, error: 'forbidden' }),
      { status: ${status}, headers: { 'content-type': 'application/json' } }));
  }
  return window.__of.apply(window, arguments);
};
'ok'`;
const MAKE = (paths) => `(function () {
  function f(p) { var n = p.split('/').pop(); var x = new File([new Uint8Array(8)], n, { type: 'image/jpeg' }); x.fullPath = p; return x; }
  window.__files = ${JSON.stringify(paths)}.map(f);
  return window.__files.length;
})()`;

async function open(status) {
  const p = await newPage();
  const errs = [];
  p.on((m) => { if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); });
  await p.send('Runtime.enable'); await p.send('Page.enable');
  await p.send('Page.navigate', { url: BASE + '/textbook-uploader.html' });
  await sleep(2500);
  await p.evalJs(STUB(status));
  return { p, errs };
}

console.log('📚 교재 업로더 브라우저 검사 · ' + new Date().toISOString());
await closeAllTabs();

/* ═══════════════════════════════════════════════════════════════════════
   ① 화면이 뜨고 분류기·JSZip 이 살아 있다
   ═══════════════════════════════════════════════════════════════════════ */
console.log('\n① 화면이 뜨는가');
{
  const { p, errs } = await open(200);
  const st = JSON.parse(await p.evalJs(`JSON.stringify({
    title: document.title, jszip: typeof window.JSZip, classify: typeof classifyFile,
    dz: !!document.getElementById('dropzone'), btn: !!document.getElementById('btn-save')
  })`));
  check('제목이 교재 업로더다', /교재 업로더/.test(st.title));
  eq('JSZip(zip 자동 풀기)이 로드됐다', st.jszip, 'function');
  eq('분류기가 있다', st.classify, 'function');
  check('드롭존·저장 버튼이 있다', st.dz && st.btn);
  check('첫 화면에 JS 예외가 없다', errs.length === 0);
  await p.close();
}

/* ═══════════════════════════════════════════════════════════════════════
   ② 🔴 유닛 폴더를 올리면 «책 이름이 붙은» 이름으로 서버에 나간다
   ═══════════════════════════════════════════════════════════════════════ */
console.log('\n② 🔴 실제로 나가는 요청의 이름 (공용 자료실 묶음이 되는 문자열)');
{
  const { p } = await open(200);
  await p.evalJs(MAKE(['BTS 2/001/Slide1.JPG', 'BTS 2/002/Slide1.JPG', 'BTS 3/001/Slide1.JPG']));
  await p.evalJs(`processFiles(window.__files)`);
  await sleep(12000);   // 자동 저장(8초) + 업로드
  const up = JSON.parse(await p.evalJs(`JSON.stringify(window.__up)`));
  check('세 파일 모두 요청이 나갔다 (실측 ' + up.length + '건)', up.length === 3);
  check('BTS 2 001 묶음으로 나갔다', up.some((n) => n.startsWith('[BTS 2 001]')));
  check('BTS 2 002 묶음으로 나갔다', up.some((n) => n.startsWith('[BTS 2 002]')));
  check('BTS 3 001 묶음으로 나갔다', up.some((n) => n.startsWith('[BTS 3 001]')));
  /* ⛔ 여기가 깨지면 공용 자료실에 「001」 이라는 이름 없는 묶음이 생기고,
        BTS 2 와 BTS 3 의 001 이 **한 묶음으로 합쳐진다**(대괄호 이름 하나로 묶으므로). */
  check('«[001]» 처럼 번호만인 묶음이 하나도 없다', !up.some((n) => /^\[\d+\]/.test(n)));
  await p.close();
}

/* ═══════════════════════════════════════════════════════════════════════
   ③ 자동 저장이 사람의 검토를 앞지르지 않는다
   ═══════════════════════════════════════════════════════════════════════ */
console.log('\n③ 자동 저장 대기 — 이름을 읽을 시간이 있는가');
{
  const { p } = await open(200);
  await p.evalJs(MAKE(['BTS 2/001/Slide1.JPG']));
  await p.evalJs(`processFiles(window.__files)`);
  await sleep(1500);
  const t1 = await p.evalJs(`document.getElementById('btn-save').textContent`);
  check('버튼에 «남은 초» 가 보인다: ' + t1, /\d+초 뒤 자동 저장/.test(t1));
  await sleep(2500);
  const up1 = JSON.parse(await p.evalJs(`JSON.stringify(window.__up)`));
  check('4초쯤에는 아직 안 올라갔다 (검토할 시간)', up1.length === 0);
  await sleep(9000);
  const up2 = JSON.parse(await p.evalJs(`JSON.stringify(window.__up)`));
  check('기다리면 결국 자동으로 올라간다 (ph241 취지 유지)', up2.length === 1);
  await p.close();
}

/* ═══════════════════════════════════════════════════════════════════════
   ④ 이름을 고치면 그 이름으로 나간다 (= 자동 저장이 멈춰 준다)
   ═══════════════════════════════════════════════════════════════════════ */
console.log('\n④ 사람이 교재명을 고칠 수 있는가');
{
  const { p } = await open(200);
  await p.evalJs(MAKE(['BTS 2/001/Slide1.JPG']));
  await p.evalJs(`processFiles(window.__files)`);
  await sleep(1200);
  await p.evalJs(`(function () {
    var el = document.querySelector('#cr-groups input[data-k="textbook"]');
    el.focus(); el.value = 'BTS 2 Unit 001'; el.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await sleep(11000);
  const mid = JSON.parse(await p.evalJs(`JSON.stringify({ up: window.__up, btn: document.getElementById('btn-save').textContent, name: pendingGroups[0] && pendingGroups[0].textbook })`));
  check('만진 동안에는 자동으로 올라가지 않는다', mid.up.length === 0);
  eq('고친 이름이 반영돼 있다', mid.name, 'BTS 2 Unit 001');
  check('버튼이 «저장» 상태로 돌아와 눌릴 수 있다: ' + mid.btn, /라이브러리에 저장/.test(mid.btn));
  await p.evalJs(`document.getElementById('btn-save').click()`);
  await sleep(4000);
  const up = JSON.parse(await p.evalJs(`JSON.stringify(window.__up)`));
  check('고친 이름 그대로 나갔다', up.length === 1 && up[0].startsWith('[BTS 2 Unit 001]'));
  const al = JSON.parse(await p.evalJs(`JSON.stringify(window.__alerts)`));
  check('«저장할 교재가 없습니다» 오알림이 안 뜬다', !al.some((m) => /저장할 교재가 없습니다/.test(m)));
  await p.close();
}

/* ═══════════════════════════════════════════════════════════════════════
   ⑤ 권한이 없을 때 «완료» 라고 말하지 않는다
   ═══════════════════════════════════════════════════════════════════════ */
console.log('\n⑤ 403(권한 없음) — 정직하게 말하는가');
{
  const { p } = await open(403);
  await p.evalJs(MAKE(['BTS 2/001/Slide1.JPG']));
  await p.evalJs(`processFiles(window.__files)`);
  await sleep(13000);
  const al = JSON.parse(await p.evalJs(`JSON.stringify(window.__alerts)`));
  const joined = al.join('\n');
  check('«이 컴퓨터에만 저장» 을 알린다', /이 컴퓨터에만 저장/.test(joined));
  check('마지막 알림이 «✅ 저장 완료!» 로 시작하지 않는다',
    !(al[al.length - 1] || '').startsWith('✅ 저장 완료!'));
  check('공용 자료실 «실패» 건수를 적는다', /공용 자료실:[^\n]*실패/.test(joined));
  await p.close();
}

/* ═══════════════════════════════════════════════════════════════════════
   ⑥ 되던 구조가 그대로인가 (브라우저에서 한 번 더)
   ═══════════════════════════════════════════════════════════════════════ */
console.log('\n⑥ 되돌림 감시 — 다락원·Phonics');
{
  const { p } = await open(200);
  const out = JSON.parse(await p.evalJs(`JSON.stringify([
    '다락원 중국어 마스터 3/제1과/p1.JPG',
    'Mangoi Phonics/Mangoi Phonics A/Slide1.JPG',
    'BTS 1/BTS 1 001 (Welcome to school)/Slide1.JPG'
  ].map(function (path) {
    var f = new File([new Uint8Array(4)], path.split('/').pop(), { type: 'image/jpeg' });
    f.fullPath = path;
    return classifyFile(f).textbook;
  }))`));
  eq('다락원 중국어 마스터 3 그대로', out[0], '다락원 중국어 마스터 3');
  eq('Mangoi Phonics A 그대로', out[1], 'Mangoi Phonics A');
  eq('BTS 1 001 (Welcome to school) 그대로', out[2], 'BTS 1 001 (Welcome to school)');
  await p.close();
}

console.log('\n' + '═'.repeat(60));
console.log(`총 ${pass + fail}건 중 ✅ ${pass} 통과 / ❌ ${fail} 실패`);
if (fail) { console.log('\n❌ 실패:'); FAILS.forEach((f) => console.log('   - ' + f)); process.exit(1); }
console.log('\n🎉 교재 업로더 브라우저 검사 전체 통과');
