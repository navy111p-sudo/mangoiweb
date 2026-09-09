/* manual/meet-room-code-browser.mjs — 회의방 번호가 «진짜 화면에서» 맞물리는가 (2026-09-09)
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ 자동으로 안 돕니다 — 사람이 부릅니다(manual/ 규약: 게이트가 물어 가지 않음).
 *
 *   준비:  cd cloudflare-deploy/public && python3 -m http.server 8921
 *          /opt/pw-browsers/chromium-1194/chrome-linux/chrome --headless=new --no-sandbox \
 *            --remote-debugging-port=9331 --user-data-dir=/tmp/cd about:blank &
 *   실행:  node test-harness/manual/meet-room-code-browser.mjs
 *
 * [왜] 2026-09-09 사장님 제보 — 교사가 회의방 1234 를 여는데 학생은 mangoi-class 에 있었다.
 *      로비에 «1234» 를 쳐도 방 id 가 `1234` 라 `meet-1234` 와 만나지 못했다.
 *      문자열 하니스(meet_room_code_harness)는 «두 규칙이 같은 말을 하나» 까지만 본다.
 *      «그 규칙이 진짜로 이 화면에 실려서 입장 직전에 도는가» 는 여기서만 잰다.
 *
 * ⚠️ 되돌려 보면 실제로 FAIL 납니다(실측: 래퍼에서 normalizeRoomInput 을 빼면
 *    「입장 직전 방 코드 칸 → "1234"」로 사고가 그대로 재현되고 1건 FAIL).
 * ⚠️ 이름 칸을 «비워» 두는 것이 핵심입니다 — 진짜 vcJoinRoom 은 첫 줄에서 곧바로 return 하므로
 *    소켓·카메라를 건드리지 않고 «래퍼가 한 일» 만 깨끗하게 잽니다.
 *    (이름을 채우면 헤드리스 렌더러가 alert/미디어에서 멈춰 검사가 통째로 헛돕니다 — 실제로 밟음)
 */
const PORT = Number(process.env.CDP_PORT || 9331);
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8921';
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const waits = new Map();
const send = (method, params = {}) => new Promise((res, rej) => {
  const i = ++id; waits.set(i, { res, rej });
  ws.send(JSON.stringify({ id: i, method, params }));
});
await new Promise(r => ws.addEventListener('open', r));
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && waits.has(m.id)) { const w = waits.get(m.id); waits.delete(m.id); m.error ? w.rej(new Error(JSON.stringify(m.error))) : w.res(m.result); }
});
const evalJs = async (expr) => {
  const r = await Promise.race([
    send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }),
    new Promise((_, rj) => setTimeout(() => rj(new Error('EVAL-TIMEOUT')), 12000))
  ]);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
  return r.result.value;
};
await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
/* 헤드리스에서 alert/confirm 이 뜨면 렌더러가 멈춘다 — 무조건 닫는다 */
ws.addEventListener('message', e => { const m = JSON.parse(e.data);
  if (m.method === 'Page.javascriptDialogOpening') send('Page.handleJavaScriptDialog', { accept: false }).catch(()=>{}); });
await send('Network.setCacheDisabled', { cacheDisabled: true });
try { await send('Network.setBypassServiceWorker', { bypass: true }); } catch (_) {}
await send('Page.navigate', { url: BASE + '/index.html?_nc=' + Date.now() });
await new Promise(r => setTimeout(r, 3500));

let P = 0, F = 0;
const t = (name, got, want) => { const okk = String(got) === String(want); okk ? P++ : F++;
  console.log(`  ${okk ? 'PASS' : 'FAIL'} ${name} → ${JSON.stringify(got)}${okk ? '' : ' (기대 ' + JSON.stringify(want) + ')'}`); };

console.log('① 해석 정본이 화면에 실려 있는가');
t('typeof vcResolveRoomCode', await evalJs('typeof window.vcResolveRoomCode'), 'function');
for (const [i, o] of [['1234','meet-1234'],['melca','meet-melca'],['mangoi-class','mangoi-class'],
                      ['demo-1','demo-1'],['class-849-20260909','class-849-20260909'],['meet-1234','meet-1234'],['','']])
  t(`resolve(${JSON.stringify(i)})`, await evalJs(`window.vcResolveRoomCode(${JSON.stringify(i)})`), o);

console.log('② 실사고 재현 — 로비에 «1234» 를 치고 입장을 누르면 어느 방으로 가나');
// 진짜 입장(소켓·카메라)은 안 시킨다. 래퍼가 원래 함수를 부르는 그 순간 값을 가로챈다.
const got = await evalJs(`(function(){
  var box = document.getElementById('vc-roomcode-input');
  box.value = '1234';
  /* 지금 걸려 있는 래퍼를 그대로 부른다. 이름 칸이 비어 있으므로 원본 vcJoinRoom 은
     첫 줄에서 곧바로 return 하고, 그때 normalizeRoomInput() 은 «이미» 돌았다.
     → 소켓·카메라를 건드리지 않고 «래퍼가 한 일» 만 잰다. */
  try { window.vcJoinRoom.call(window); } catch(e){}
  return box.value;
})()`);
t('입장 직전 방 코드 칸', got, 'meet-1234');
const opened = await evalJs(`(function(){var i=document.getElementById('vc-roomcode-input');var d=i.closest('details');return d? !!d.open : 'no-details';})()`);
t('바뀐 값을 사람에게 «보여 주는가»(칸이 펴짐)', opened, 'true');

console.log('②-2 대문자로 쳐도 같은 방인가 (폰 키보드 첫 글자 대문자)');
for (const [inp, want] of [['Meet-1234','meet-1234'], ['MEET-1234','meet-1234'], ['1234','meet-1234']]) {
  const v = await evalJs(`(function(){window.alert=function(){};var b=document.getElementById('vc-roomcode-input');b.value=${JSON.stringify(inp)};document.getElementById('vc-name-input').value='';try{window.vcJoinRoom.call(window);}catch(e){}return b.value;})()`);
  t(`«${inp}» 입장 직전 칸`, v, want);
}
console.log('②-3 칸에 대문자·자동고침 방어가 실제로 붙었는가');
for (const [a, want] of [['autocapitalize','off'], ['autocorrect','off'], ['spellcheck','false']])
  t(a, await evalJs(`document.getElementById('vc-roomcode-input').getAttribute(${JSON.stringify(a)})`), want);

console.log('③ 공용방 폴백은 예전 그대로인가 (빈칸)');
const blank = await evalJs(`(function(){var b=document.getElementById('vc-roomcode-input');b.value='';try{window.vcJoinRoom.call(window);}catch(e){}return b.value;})()`);
t('빈칸은 빈칸 그대로', blank, '');

console.log(`\n결과: PASS ${P} / FAIL ${F}`);
ws.close();
process.exit(F ? 1 : 0);
