/* 📊 게임 진행 띠 — 「보인다」·「안 보인다」·「움직인다」를 실제 화면으로 잰다
   ───────────────────────────────────────────────────────────────────────
   ⚠️ 자동으로 안 돕니다 — manual/ 은 게이트가 물어 가지 않습니다. 사람이 부릅니다:
        cd cloudflare-deploy/public && python3 -m http.server 8899 &
        /opt/pw-browsers/chromium-1194/chrome-linux/chrome --headless=new --no-sandbox \
          --remote-debugging-port=9223 --user-data-dir=/tmp/pwprof about:blank &
        node test-harness/manual/game-progress-bar-browser.mjs

   🔴 왜 이 파일이 있나 (2026-09-22 실사고) — 처음 판의 브라우저 검사는 `box.hidden`
      «속성» 만 재고 통과시켰다. 그런데 .game-progress 에 display:flex 가 있어
      브라우저 기본 [hidden]{display:none} 을 «작성자 > UA» 순위로 이겼고,
      채움은 폭이 미설정이라 부모 폭을 100% 먹어 «초록 가득» 이 됐다 ⟹ 목표가
      0인 아바타 키우기에서 **시작하자마자 「다 했어요」** 로 읽혔다.
      ✅ 그래서 여기서는 반드시 getComputedStyle 로 «진짜 안 보이는가» 를 잰다.
      ✅ 되돌려 보면 실제로 FAIL 난다(실측: [hidden] 규칙을 지우면 ratio 1, 3건 ❌).

   ⚠️ transition:width .28s — 전환 «중» 에 재면 옛 값이 나온다. 기다렸다 잰다.
   ⚠️ 「그린다」 옆에 「안 그릴 때는 정말 안 그린다」를 짝으로 둔다 —
      짝이 없으면 «전부 그리기» 도 «전부 안 그리기» 도 통과한다.
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
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Network.setBypassServiceWorker', { bypass: true });

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + '  ' + x); } };

async function openHub() {
  await send('Page.navigate', { url: 'http://127.0.0.1:8899/student-games.html?_nc=' + Date.now() });
  await wait(2300);
  await ev(`try{localStorage.setItem('mangoi_quest_mode','off');localStorage.setItem('mangoi_onboard_v1','skip:0');localStorage.setItem('mangoi_lang','ko');}catch(e){}`);
  await send('Page.navigate', { url: 'http://127.0.0.1:8899/student-games.html?_nc=' + Date.now() });
  await wait(2300);
}
const STARTED = `(function(){var hg=document.getElementById('hub-game'),a=document.getElementById('game-area');
  return JSON.stringify({active:!!(hg&&hg.classList.contains('active')),mode:(typeof _gameState!=='undefined'?_gameState.mode:''),hasIframe:!!(a&&a.querySelector('iframe'))});})()`;
/* ⚠️ transition:width .28s — 전환 중에 재면 옛 값이 나온다. 기다렸다 잰다. */
const READ = `(function(){var b=document.getElementById('hub-progress'),f=document.getElementById('hub-gp-fill'),t=document.getElementById('hub-gp-txt');
  if(!b) return JSON.stringify({err:'no-box'});
  var cs=getComputedStyle(b), br=b.getBoundingClientRect(), fr=f?f.getBoundingClientRect():null, tr=b.querySelector('.gp-track');
  var trr=tr?tr.getBoundingClientRect():null;
  return JSON.stringify({hiddenAttr:b.hidden, display:cs.display, boxH:Math.round(br.height),
    fillW:fr?Math.round(fr.width):null, trackW:trr?Math.round(trr.width):null,
    ratio: (fr&&trr&&trr.width)? +(fr.width/trr.width).toFixed(3) : null,
    txt:t?t.textContent.trim():null, overflow:document.documentElement.scrollWidth>window.innerWidth});})()`;

console.log('\n=== 1. 아바타(목표 0) — 실사고 그 자리 ===');
await openHub(); await ev(`hubOpenGame('avatar')`); await wait(2600);
let st = JSON.parse(await ev(STARTED));
ok('[전제] 아바타가 실제로 켜졌다', st.active && st.hasIframe, JSON.stringify(st));
let r = JSON.parse(await ev(READ));
ok('🔴 computed display 가 none 이다(속성이 아니라 «진짜 안 보이는가»)', r.display === 'none', `display:${r.display} hiddenAttr:${r.hiddenAttr}`);
ok('자리를 안 먹는다(높이 0)', r.boxH === 0, `${r.boxH}px`);
ok('채움이 «초록 가득» 이 아니다', !r.ratio || r.ratio === 0, `ratio ${r.ratio} (${r.fillW}/${r.trackW})`);

console.log('\n=== 2. 통로 없는 게임(낚시·말하기퀴즈·장면탐험대) ===');
for (const m of ['fish', 'speaking', 'scenequest']) {
  await openHub(); await ev(`hubOpenGame('${m}')`); await wait(2600);
  const s2 = JSON.parse(await ev(STARTED));
  const r2 = JSON.parse(await ev(READ));
  ok(`[전제] ${m} 이 실제로 켜졌다`, s2.active && s2.hasIframe, JSON.stringify(s2));
  ok(`${m} — 띠를 안 그린다(진행을 알려 올 통로가 없다)`, r2.display === 'none' && r2.boxH === 0, `display:${r2.display} h:${r2.boxH} txt:${JSON.stringify(r2.txt)}`);
}

console.log('\n=== 3. 짝 — 통로가 있는 게임에는 그린다(탱크) ===');
await openHub(); await ev(`hubOpenGame('tank')`); await wait(2800);
let st3 = JSON.parse(await ev(STARTED));
ok('[전제] 탱크가 실제로 켜졌다', st3.active && st3.hasIframe, JSON.stringify(st3));
let r3 = JSON.parse(await ev(READ));
ok('띠가 실제로 보인다', r3.display !== 'none' && r3.boxH > 0, `display:${r3.display} h:${r3.boxH}`);
ok('«맞힌 개수» 임을 글자가 말한다(✅ 4 / 10 꼴)', /✅/.test(r3.txt || '') && /0 \/ 10/.test(r3.txt || ''), JSON.stringify(r3.txt));
ok('0개일 때도 «측정 안 됨» 으로 안 읽힌다(최소 표시)', r3.fillW >= 5, `채움 ${r3.fillW}px`);
ok('가로 넘침 없음', r3.overflow === false);

// 진행이 실제로 움직이나 — iframe 안에서 진짜 신호를 만든다
const fired = await ev(`(function(){try{var f=document.querySelector('#game-area iframe'),w=f&&f.contentWindow;
  if(!w) return 'no-iframe'; if(!w.MangoiGame) return 'no-MangoiGame';
  w.MangoiGame.answer(true,'a','가');w.MangoiGame.answer(false,'b','나');w.MangoiGame.answer(true,'c','다');
  return 'sent';}catch(e){return 'ERR:'+e.message;}})()`);
await wait(1200);
let r4 = JSON.parse(await ev(READ));
ok('정답 2·오답 1 → 띠가 «2» 로 움직인다(오답은 안 센다)', fired === 'sent' && /2 \/ 10/.test(r4.txt || ''), `${fired} · ${JSON.stringify(r4.txt)}`);
ok('채움이 실제로 늘었다(전환이 끝난 뒤)', r4.ratio > 0.1 && r4.ratio < 0.3, `ratio ${r4.ratio}`);

console.log('\n=== 4. 🌐 를 누르면 글자가 바로 따라온다 ===');
await ev(`toggleSiteLang()`); await wait(500);
let r5 = JSON.parse(await ev(READ));
ok('영어로 바로 바뀐다(다음 정답을 기다리지 않는다)', /to go!/.test(r5.txt || ''), JSON.stringify(r5.txt));
await ev(`toggleSiteLang()`); await wait(400);
let r6 = JSON.parse(await ev(READ));
ok('다시 한국어로 돌아온다', /개만 더/.test(r6.txt || ''), JSON.stringify(r6.txt));

console.log('\n=== 5. 메뉴로 돌아가면 치운다 ===');
await ev(`hubBackToMenu()`); await wait(900);
let r7 = JSON.parse(await ev(READ));
ok('computed 로도 사라진다', r7.display === 'none' && r7.boxH === 0, `display:${r7.display} h:${r7.boxH}`);

console.log('\n=== 6. 폰 390x844 ===');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await openHub(); await ev(`hubOpenGame('shooter')`); await wait(2800);
let st8 = JSON.parse(await ev(STARTED));
ok('[전제] 폰에서 게임이 켜졌다', st8.active && st8.hasIframe, JSON.stringify(st8));
let r8 = JSON.parse(await ev(READ));
ok('폰에서도 보인다', r8.display !== 'none' && r8.boxH > 0, `h:${r8.boxH} txt:${JSON.stringify(r8.txt)}`);
ok('폰에서 가로 넘침 없음', r8.overflow === false);
// 띠가 «누를 것» 을 가리지 않는가 — 띠 안을 훑어 맨 위가 자기 자신인지
const cover = await ev(`(function(){var b=document.getElementById('hub-progress');if(!b||b.hidden)return 'hidden';
  var r=b.getBoundingClientRect(),bad=[];
  for(var x=r.left+4;x<r.right-4;x+=18){var el=document.elementFromPoint(x, r.top+r.height/2);
    if(el&&!b.contains(el)&&el!==b) bad.push(el.id||el.tagName);}
  return bad.length? bad.join(','):'none';})()`);
ok('띠 위에서 남이 가로채지 않는다', cover === 'none', `가로챔: ${cover}`);

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
ws.close();
