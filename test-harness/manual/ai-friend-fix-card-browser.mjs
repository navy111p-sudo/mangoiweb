/* ai-friend-fix-card-browser.mjs — AI 영어친구 «교정 카드» 가 화면에 실제로 그려지는가 (2026-09-09)
 *
 * 왜 필요한가
 *   사장님 「A.i 친구도 똑같이 만들어줘」로 웜업의 교정 카드를 이 화면에 붙였다.
 *   문자열 하니스(ai_friend_correction_harness)는 «배선과 판정» 까지만 본다.
 *   이 화면의 결함은 늘 «그려졌는가·읽히는가·가려지지 않았는가» 로만 드러났다
 *   (i18n 이 textContent 를 갈아끼워 문장이 사라지는 사고, 상자 밖으로 넘치는 사고).
 *
 * ⚠️ 자동으로 안 돕니다 — manual/ 규약상 게이트가 안 물어 갑니다. 사람이 부릅니다:
 *      node test-harness/manual/ai-friend-fix-card-browser.mjs
 */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path'; import { tmpdir } from 'node:os';
const PUB = '/home/user/mangoiweb/cloudflare-deploy/public';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'fixcard-'));
const CDP = 9340 + (process.pid % 40);
let _p = 8210 + (process.pid % 60);
const KIDS = [];
/* ⚠️ 방문할 때마다 «새 포트» 를 쓴다 — 두 번째 방문부터 서비스워커가 끼어 옛 파일을 준다. */
const serve = () => { const p = _p++; KIDS.push(spawn('python3', ['-m', 'http.server', String(p)], { cwd: PUB, stdio: 'ignore' })); return p; };
KIDS.push(spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
  `--remote-debugging-port=${CDP}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' }));
const cleanup = () => { for (const k of KIDS) { try { k.kill('SIGKILL'); } catch (e) {} } };
process.on('exit', cleanup); process.on('SIGINT', () => { cleanup(); process.exit(130); });
await sleep(3500);

const tabs = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json();
const ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl);
let id = 0; const w = new Map(); const errs = [];
const send = (m, p = {}) => new Promise((r) => { const i = ++id; w.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
ws.onmessage = (e) => { const m = JSON.parse(e.data);
  if (m.id && w.has(m.id)) { w.get(m.id)(m.result); w.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') errs.push(String(m.params.exceptionDetails?.exception?.description || '').slice(0, 120)); };
await new Promise((r) => ws.onopen = r);
await send('Page.enable'); await send('Runtime.enable');
/* ⚠️ 캐시를 «두 겹 다» 끈다 — HTTP 캐시만 끄면 서비스워커가 옛 사본을 준다(CLAUDE.md). */
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Network.setBypassServiceWorker', { bypass: true });
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result?.value;
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? (pass++, console.log('  ✅ ' + m)) : (fail++, console.log('  ❌ ' + m + (x !== undefined ? '\n       · ' + JSON.stringify(x) : ''))); };
const open = async (path, W = 390, H = 844) => {
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 600 });
  errs.length = 0;
  await send('Page.navigate', { url: `http://127.0.0.1:${serve()}${path}` });
  await sleep(2400);
};

/* 사장님 화면에 실제로 찍힌 그 문장 그대로 */
const FIX = { was: 'I go to school yesterday', now: 'I went to school yesterday',
              why_ko: '어제 일이니까 go 대신 went 를 써', tag: 'past_tense', severity: 'major' };

console.log('■ AI 영어친구 — 교정 카드');
await open('/ai-friend.html');

ok(await ev('typeof showFixCard === "function"'), 'showFixCard 를 화면 어디서나 부를 수 있다 (최상위 선언)');

// ── ① 카드가 그려지고 «고친 문장» 이 실제로 보인다 ──
/* ⚠️ 실제 전송 경로(sendMsg)는 «빈 상태» 를 «먼저 지우고» 말풍선을 붙인다(ai-friend.html).
   그 단계를 건너뛰면 .empty-state 가 남아, 언어 전환 핸들러의 renderEmpty() 가 채팅을 통째로
   다시 그려 «카드가 사라졌다» 는 거짓 실패가 난다(2026-09-09 실제로 밟았다).
   ⛔ 이 줄을 지우지 말 것 — 지우면 ②절이 화면 버그가 아닌 것을 버그로 보고한다. */
await ev(`(function(){var e=document.querySelector('.empty-state');
           if(e) document.getElementById('chat').innerHTML='';})(); true`);
ok(await ev(`document.querySelectorAll('.empty-state').length`) === 0,
   '전제: 실제 전송 경로처럼 «빈 상태» 를 먼저 지웠다');
await ev(`appendMsg('ai','Nice sentence! What did you do at school yesterday?', true);
          showFixCard(${JSON.stringify(FIX)}, true); true`);
await sleep(300);
const card = await ev(`(function(){
  var c=document.querySelector('.fix-card'); if(!c) return null;
  var r=c.getBoundingClientRect();
  var now=c.querySelector('.fix-now'), was=c.querySelector('.fix-was'), why=c.querySelector('.fix-why');
  var btns=Array.from(c.querySelectorAll('.fix-btn')).map(function(b){var br=b.getBoundingClientRect();
    return {t:(b.textContent||'').trim(), w:Math.round(br.width), h:Math.round(br.height)};});
  return { w:Math.round(r.width), h:Math.round(r.height), left:Math.round(r.left), right:Math.round(r.right),
           now: now&&now.textContent, was: was&&was.textContent, why: why&&why.textContent,
           btns: btns, vis: getComputedStyle(c).display };
})()`);
ok(!!card, '교정 카드가 그려졌다');
if (card) {
  ok(card.now === FIX.now, '«고친 문장» 이 화면에 그대로 있다 (옛 팁 방식은 이게 없었다)', card.now);
  ok(card.was === FIX.was, '«내가 말한 것» 도 함께 보여 준다', card.was);
  ok((card.why || '').includes(FIX.why_ko), '왜 고쳤는지 한국어 설명이 있다', card.why);
  ok(card.btns.length === 2, '들어보기·따라 말해 보기 두 버튼 (repeat 켰을 때)', card.btns.map((b) => b.t));
  /* 폰에서 누를 수 있는 크기여야 한다 — 34px 미만이면 아이 손가락이 못 맞춘다 */
  ok(card.btns.every((b) => b.h >= 30 && b.w >= 60), '버튼이 폰에서 누를 크기다', card.btns);
  ok(card.right <= 390 && card.left >= 0, '카드가 화면 밖으로 안 넘친다', { left: card.left, right: card.right });
}

/* 🔴 «내가 남을 덮는가» 만 보면 반대쪽을 놓친다 — 여기서 실제로 밟았다.
   왼쪽 가장자리에는 «메뉴» 손잡이(#mg-drawer-tab, x 2~46px)가 떠 있어서,
   카드를 폰에서 margin-left:0 으로 두면 제목과 «내가 말한 것» 라벨이 덮인다.
   화면 검사가 통과했는데 스크린샷을 눈으로 보고서야 찾았다 — 그래서 짝으로 못 박는다.
   ⚠️ display 만 보면 «보인다» 로 나온다. elementFromPoint 로 «맨 위가 누구인가» 를 잰다. */
const covered = await ev(`(function(){
  var c=document.querySelector('.fix-card'); if(!c) return ['카드 없음'];
  var out=[];
  c.querySelectorAll('.fix-title,.fix-lbl,.fix-now,.fix-was,.fix-why,.fix-btn').forEach(function(el){
    var r=el.getBoundingClientRect(); if(r.width<1||r.height<1) return;
    var pt=document.elementFromPoint(Math.round(r.left+3), Math.round(r.top+r.height/2));
    if(pt && !c.contains(pt)) out.push((el.textContent||'').trim().slice(0,16)+' ← '+(pt.id||pt.className||pt.tagName));
  });
  return out;})()`);
ok(Array.isArray(covered) && covered.length === 0,
   '🔴 카드를 덮는 것이 없다 (왼쪽 «메뉴» 손잡이가 라벨을 가리던 사고)', covered);

// ── ② 🔴 i18n 이 카드 문장을 지우지 않는다 (이 저장소가 반복해 밟은 함정) ──
/* 진짜 토글이 있으면 그것을 쓴다 — i18n 엔진이 [data-ko] 요소의 textContent 를 실제로
   갈아끼우는 그 동작까지 지나야 이 검사가 뜻을 갖는다. 없으면 이벤트로 대신한다. */
await ev(`(function(){
  if (typeof window.toggleLang === 'function') { window.toggleLang(); return; }
  window.getLang=function(){return 'en';};
  document.dispatchEvent(new CustomEvent('mangoi:lang-changed'));
  window.dispatchEvent(new CustomEvent('mangoi:lang-changed'));
})(); true`);
await sleep(400);
const after = await ev(`(function(){var c=document.querySelector('.fix-card'); if(!c) return null;
  var n=c.querySelector('.fix-now'); var t=c.querySelector('.fix-title');
  return { now: n&&n.textContent, title: t&&t.textContent };})()`);
ok(after && after.now === FIX.now,
   '🔴 🌐 를 눌러도 «고친 문장» 이 안 사라진다 (카드 상자에 data-ko/en 을 달면 사라진다)', after);
/* ⚠️ 짝 검사 — 위만 두면 «i18n 이 아예 안 돌아도» 초록이다. 라벨은 «바뀌어야» 한다. */
ok(after && /Even better/.test(after.title || ''),
   '짝 검사: 라벨은 실제로 영어로 바뀐다 (i18n 이 돌긴 돌았다는 증거)', after && after.title);

// ── ③ 교정 카드가 있으면 옛 (💡 …) 팁 칩은 안 그린다 ──
await ev(`document.getElementById('chat').innerHTML=''; true`);
await ev(`appendMsg('ai','Nice sentence! (💡 어제에 가는 것이 더 자연스러워요)', true); true`);
const dup = await ev(`document.querySelectorAll('.tip-chip').length`);
ok(dup === 0, '교정 카드가 뜨는 답변에는 옛 팁 칩이 안 붙는다 (같은 말이 두 번 나오지 않게)', dup);
await ev(`document.getElementById('chat').innerHTML=''; true`);
await ev(`appendMsg('ai','Nice sentence! (💡 어제에 가는 것이 더 자연스러워요)', false); true`);
const kept = await ev(`document.querySelectorAll('.tip-chip').length`);
ok(kept === 1, '교정 카드가 «없을» 때는 옛 팁 칩이 그대로 뜬다 (짝 검사 — 전부 지우면 안 된다)', kept);

// ── ④ 교정이 없으면 아무것도 안 그린다 ──
await ev(`document.getElementById('chat').innerHTML=''; showFixCard(null,false); showFixCard({was:'',now:''},false); true`);
ok(await ev(`document.querySelectorAll('.fix-card').length`) === 0, '서버가 «교정 없음» 이면 카드를 안 그린다');

// ── ⑤ 카드는 한 벌만 쌓인다 ──
await ev(`showFixCard(${JSON.stringify(FIX)},false); showFixCard(${JSON.stringify(FIX)},false); true`);
ok(await ev(`document.querySelectorAll('.fix-card').length`) === 1, '같은 카드가 두 벌 쌓이지 않는다');

// ── ⑥ «읽히는가» — 글자와 배경의 대비 (WCAG) ──
/* ⚠️ 반투명 배경을 «불투명» 으로 읽으면 멀쩡한 색이 실패로 나온다 — 층을 모아 합성한다. */
const contrast = await ev(`(function(){
  function parse(c){var m=/rgba?\\(([^)]+)\\)/.exec(c); if(!m) return null;
    var p=m[1].split(',').map(function(x){return parseFloat(x);});
    return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1};}
  function bgOf(el){var layers=[],e=el;
    while(e){var st=getComputedStyle(e);var c=parse(st.backgroundColor);
      if(c&&c.a>0){layers.push(c); if(c.a>=1) break;}
      if(c===null||c.a===0){var bi=st.backgroundImage;var m2=/rgba?\\([^)]+\\)/.exec(bi||'');
        if(m2){var c2=parse(m2[0]); if(c2){layers.push(c2); if(c2.a>=1) break;}}}
      e=e.parentElement;}
    layers.push({r:255,g:255,b:255,a:1});
    var out=layers[layers.length-1];
    for(var i=layers.length-2;i>=0;i--){var t=layers[i];
      out={r:t.r*t.a+out.r*(1-t.a), g:t.g*t.a+out.g*(1-t.a), b:t.b*t.a+out.b*(1-t.a), a:1};}
    return out;}
  function L(c){var f=function(v){v/=255; return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);};
    return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b);}
  var el=document.querySelector('.fix-card .fix-now'); if(!el) return null;
  var fg=parse(getComputedStyle(el).color), bg=bgOf(el);
  var l1=L(fg),l2=L(bg); var hi=Math.max(l1,l2),lo=Math.min(l1,l2);
  return Math.round(((hi+0.05)/(lo+0.05))*100)/100;})()`);
ok(contrast !== null && contrast >= 4.5, `«고친 문장» 이 읽히는 대비다 (WCAG 4.5 이상) — ${contrast}`, contrast);

ok(errs.length === 0, '콘솔에 JS 오류가 없다', errs);

console.log(`\n  결과: PASS ${pass} · FAIL ${fail}`);
cleanup();
process.exit(fail ? 1 : 0);
