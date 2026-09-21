/* ⏭ 장면 탐험 「모르겠어요 · 넘어가기」 — 「보인다」·「눌린다」·「실제로 넘어간다」를 화면으로 잰다
   ───────────────────────────────────────────────────────────────────────
   ⚠️ 자동으로 안 돕니다 — manual/ 은 게이트가 물어 가지 않습니다. 사람이 부릅니다:
        cd cloudflare-deploy/public && python3 -m http.server 8899 &
        /opt/pw-browsers/chromium-1194/chrome-linux/chrome --headless=new --no-sandbox \
          --remote-debugging-port=9223 --user-data-dir=/tmp/pwprof-sq about:blank &
        node test-harness/manual/scene-quest-skip-browser.mjs

   🔴 왜 이 파일이 있나 — 이 게임은 정답을 «직접 입력» 해야만 「다음 장면 →」 이 나왔다.
      「정답 배우기」도 답을 보여 줄 뿐 문을 열지 않아, 못 쓰는 학생은 그 장면에 갇혔다.
      자동 하니스(scene_quest_harness)는 가짜 DOM 이라 «보이는가·가려졌는가» 를 못 본다.

   ⚠️ 「넘어간다」 옆에 「공짜로 통과하지 않는다」·「맞히는 길은 그대로다」를 짝으로 둔다 —
      짝이 없으면 «누르면 정답 처리» 같은 엉터리 수리도 통과한다.
   ⚠️ 정답을 여기 손으로 적지 않는다 — 장면은 Math.random 으로 뽑혀 회차마다 다르다.
      화면의 장면 이름으로 데이터(window.MangoiSceneQuest)에서 찾아 쓴다.
   ⚠️ display:none 인 요소도 querySelector 로는 잡힌다 — seen() 이 «진짜 보이는가» 로 거른다.
   ⚠️ 폰 폭에서는 질문 패널이 아래로 내려간다. 스크롤한 «뒤» 에 재고 누른다.
*/
const PORT = 9223;
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
let id = 0; const waiters = new Map();
await new Promise(r => ws.onopen = r);
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); } };
const send = (m, p = {}) => new Promise(res => { const i = ++id; waiters.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
const wait = ms => new Promise(r => setTimeout(r, ms));
await send('Page.enable'); await send('Runtime.enable');
// 캐시를 두 겹 다 끈다 — 옛 사본을 재면 변이시험이 조용히 통과한다.
await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Network.setBypassServiceWorker', { bypass: true });

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('  ❌ ' + msg); } };

async function open(w, h) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:8899/student-game-scene-quest.html?_nc=${Date.now()}` });
  await wait(900);
  ok(await ev(`typeof window.MangoiSceneQuest==='object'`), '장면 데이터가 실렸다 (전제)');
  await ev(`document.getElementById('start').click()`);
  await wait(400);
}
/* 「그려졌나」가 아니라 「보이나」 — display:none·visibility·크기 0 은 null. */
const seen = sel => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;
  const s=getComputedStyle(e),r=e.getBoundingClientRect();
  if(s.display==='none'||s.visibility==='hidden'||+s.opacity===0||r.width<1||r.height<1)return null;
  return {w:r.width,h:r.height,top:r.top,text:(e.textContent||'').trim()};})()`);
/* 보이는 것과 손이 닿는 것은 다르다 — 스크롤해 화면에 넣고 맨 위가 나인지 본다. */
async function reach(sel) {
  await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(e)e.scrollIntoView({block:'center'});})()`);
  await wait(220);
  return ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;
    const r=e.getBoundingClientRect();if(r.width<1||r.height<1)return null;
    if(r.top<0||r.bottom>innerHeight)return {mine:false,onScreen:false,h:r.height};
    const t=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
    return {mine:!!t&&(t===e||e.contains(t)),onScreen:true,h:r.height,x:r.left+r.width/2,y:r.top+r.height/2};})()`);
}
async function tap(sel) {
  const at = await reach(sel);
  if (!at || !at.onScreen) return false;
  for (const type of ['mousePressed', 'mouseReleased'])
    await send('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: 'left', clickCount: 1 });
  await wait(280); return true;
}
/* 지금 장면의 정답을 데이터에서 찾는다 — 검사에 답을 손으로 적지 않는다. */
const answerNow = () => ev(`(()=>{const D=window.MangoiSceneQuest;if(!D)return null;
  const name=document.getElementById('scene-title').textContent;
  const s=D.scenes.find(x=>x.ko===name||x.en===name);if(!s)return null;
  const tag=document.getElementById('level-tag').textContent||'';
  const lv=tag.indexOf('WORD')===0?0:tag.indexOf('PHRASE')===0?1:2;
  return s.answers[lv][0];})()`);

for (const [w, h, label] of [[1280, 800, 'PC 1280×800'], [390, 844, '폰 390×844']]) {
  console.log(`\n── ${label} ──`);
  await open(w, h);

  ok(await seen('#skip'), `${label}: 건너뛰기 버튼이 실제로 보인다`);
  const at = await reach('#skip');
  ok(at && at.onScreen && at.mine, `${label}: 그 자리의 맨 위가 그 버튼이다 (가려지지 않았다)`);
  ok(at && at.h >= 40, `${label}: 손가락으로 누를 만한 크기다 (h=${at && Math.round(at.h)})`);
  // 같은 줄의 「힌트 보기」와 나란히 — 새 버튼만 따로 떨어져 못 찾는 일이 없게.
  const row = await ev(`(()=>{const s=document.getElementById('skip');
    return !!s&&!!s.closest('.hint-row')&&s.closest('.hint-row')===document.getElementById('hint').closest('.hint-row');})()`);
  ok(row, `${label}: 힌트·정답 배우기와 같은 줄에 있다`);
  ok(!(await seen('#next')), `${label}: 맞히기 전에는 「다음 장면」이 없다`);

  const title0 = await ev(`document.getElementById('scene-title').textContent`);
  const score0 = await ev(`document.getElementById('score').textContent`);
  ok(await tap('#skip'), `${label}: 건너뛰기 버튼을 실제 좌표로 눌렀다`);

  const next = await reach('#next');
  ok((await seen('#next')) && next && next.mine, `${label}: 누르면 「다음 장면 →」 이 나타나고 눌 수 있다`);
  ok(await ev(`document.getElementById('score').textContent`) === score0, `${label}: 건너뛰어도 점수는 그대로다 (공짜 통과 아님)`);
  ok(!(await seen('#skip')), `${label}: 건너뛴 뒤 그 버튼은 사라진다`);
  const hintBox = await seen('#hint-box');
  ok(hintBox && /[a-z]/i.test(hintBox.text), `${label}: 정답을 그대로 보여 준다 (배움은 남는다)`);
  ok(await seen('#listen'), `${label}: 정답을 들어 볼 수도 있다`);
  ok(/넘어갔|Skipped/.test(await ev(`document.getElementById('feedback').textContent`)), `${label}: 화면이 「넘어갔다」고 사실대로 말한다`);
  ok(!(await ev(`document.getElementById('gate').classList.contains('unlocked')`)), `${label}: 보물문은 열리지 않는다`);

  await tap('#next');
  const title1 = await ev(`document.getElementById('scene-title').textContent`);
  ok(title1 && title1 !== title0, `${label}: 다음 장면으로 실제로 넘어간다 (${title0} → ${title1})`);
  const again = await reach('#skip');
  ok((await seen('#skip')) && again && again.mine, `${label}: 새 장면에서 다시 누를 수 있다`);

  // 짝 — 건너뛰기를 넣었다고 「맞혀서 통과하는 길」이 사라지면 안 된다.
  const key = await answerNow();
  ok(!!key, `${label}: 이 장면의 정답을 데이터에서 찾았다 (전제)`);
  await ev(`(()=>{const a=document.getElementById('answer');a.value=${JSON.stringify(key || '')};
    document.getElementById('answer-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));})()`);
  await wait(280);
  ok(Number(await ev(`document.getElementById('score').textContent`)) > 0, `${label}: 맞히면 예전처럼 점수가 오른다`);
  ok(await ev(`document.getElementById('gate').classList.contains('unlocked')`), `${label}: 맞히면 문이 열린다`);
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
ws.close();
process.exit(fail ? 1 : 0);
