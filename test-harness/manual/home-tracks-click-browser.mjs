/* manual/home-tracks-click-browser.mjs — 홈 «두 트랙 줄» 이 진짜로 눌려 그 카드로 가는가 (2026-09-21)
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ 자동으로 안 돕니다 — 사람이 부릅니다(manual/ 규약: 게이트가 물어 가지 않음).
 *
 *   준비:  cd cloudflare-deploy/public && python3 -m http.server 8893
 *          /opt/pw-browsers/chromium-1194/chrome-linux/chrome --headless=new --no-sandbox \
 *            --remote-debugging-port=9223 --user-data-dir=/tmp/cd-tracks about:blank &
 *   실행:  node test-harness/manual/home-tracks-click-browser.mjs
 *
 * [왜] 2026-09-21 사장님 제보 — 「1번, 2번 모두 눌러도 카드로 들어가지 않아」.
 *      #1046 이 만든 .home-tracks 는 마크업·CSS 뿐이라 클릭 배선이 «아예» 없었다.
 *      목적지는 사장님이 스크린샷으로 지목하셨다:
 *        .ht-live → 「망고아이란?」의 «원어민 선생님과 1:1 / 1:2 수업» 카드(상세)
 *        .ht-ai   → 「AI와 친구하기」 카드 오버레이
 *
 * ⚠️ 문자열 하니스로는 원리상 못 봅니다 — 함수도 값도 다 «있고» 틀린 것은
 *    «눌러서 무엇이 열리는가» 뿐입니다.
 * ⚠️ 「있다」·「보인다」·「눌린다」는 다 다릅니다 — 셋을 따로 잽니다(CLAUDE.md).
 * ⚠️ 짝을 둡니다 — 「열린다」 옆에 「배선을 안 건 곳은 안 열린다」·「안의 <span> 이 살아 있다」를
 *    함께 둡니다. 앞만 보면 «전부 열기»·«마크업을 갈아치우기» 도 통과합니다.
 * ⚠️ 캐시를 두 겹 다 끕니다 — 서비스워커는 setCacheDisabled 로 안 꺼집니다(CLAUDE.md).
 * ⚠️ 코치마크(#mangoi_onboard_v1)를 «본 것» 으로 표시합니다 — 빈 브라우저는 늘 첫 방문자라
 *    그 오버레이가 히어로를 덮습니다(CLAUDE.md 「헤드리스로 홈 스크린샷을 찍었는데」).
 */
const PORT = Number(process.env.CDP_PORT || 9223);
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8893';
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
await send('DOM.enable'); await send('Accessibility.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
try { await send('Network.setBypassServiceWorker', { bypass: true }); } catch (_) {}
/* 첫 방문자 코치마크가 히어로를 덮지 않게 «본 것» 으로 표시하고 연다 */
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: "try{localStorage.setItem('mangoi_onboard_v1','skip:0');}catch(e){}"
});

const home = async () => { await send('Page.navigate', { url: BASE + '/index.html' });
                           await new Promise(r => setTimeout(r, 4500)); };

let P = 0, F = 0;
const t = (name, got, want) => { const okk = String(got) === String(want); okk ? P++ : F++;
  console.log(`  ${okk ? 'PASS' : 'FAIL'} ${name} → ${JSON.stringify(got)}${okk ? '' : ' (기대 ' + JSON.stringify(want) + ')'}`); };

/* 실제 좌표로 누른다 — el.click() 은 «가려짐» 을 건너뛰어 사람 손과 다르다 */
const clickSel = async (sel) => {
  const box = await evalJs(`(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;
    e.scrollIntoView({block:'center'});var r=e.getBoundingClientRect();
    return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})()`);
  if (!box) return false;
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
  }
  await new Promise(r => setTimeout(r, 900));
  return true;
};

console.log('\n① 전제 — 두 트랙이 실제로 그려져 있고 배선이 걸렸다');
await home();
t('.ht-live 가 화면에 그려짐(높이>0)', await evalJs(`(function(){var e=document.querySelector('.home-tracks .ht-live');return !!e && e.getBoundingClientRect().height>0;})()`), true);
t('.ht-ai 가 화면에 그려짐(높이>0)', await evalJs(`(function(){var e=document.querySelector('.home-tracks .ht-ai');return !!e && e.getBoundingClientRect().height>0;})()`), true);
t('.ht-live 에 role=button 이 걸림', await evalJs(`(document.querySelector('.home-tracks .ht-live')||{}).getAttribute&&document.querySelector('.home-tracks .ht-live').getAttribute('role')`), 'button');
t('.ht-ai 에 tabindex 가 걸림', await evalJs(`(document.querySelector('.home-tracks .ht-ai')||{}).getAttribute&&document.querySelector('.home-tracks .ht-ai').getAttribute('tabindex')`), '0');
t('.ht-live 가 손가락 커서', await evalJs(`getComputedStyle(document.querySelector('.home-tracks .ht-live')).cursor`), 'pointer');
t('맨 위가 .ht-live 자신(안 가려짐)', await evalJs(`(function(){var e=document.querySelector('.home-tracks .ht-live');var r=e.getBoundingClientRect();
   var top=document.elementFromPoint(r.left+r.width/2, r.top+r.height/2); return !!top && (top===e || e.contains(top));})()`), true);

console.log('\n② 짝 — 트랙 안의 글자 조각이 살아 있다 (role 을 달아도 자식이 안 날아감)');
t('.ht-live 안 span 2개', await evalJs(`document.querySelectorAll('.home-tracks .ht-live > span').length`), 2);
t('.ht-ai 글자에 «8» 이 남아 있음', await evalJs(`/8/.test(document.querySelector('.home-tracks .ht-ai').textContent)`), true);
t('트랙에 data-ko 를 안 달았다(textContent 갈아치움 방지)', await evalJs(`!document.querySelector('.home-tracks .ht-live').hasAttribute('data-ko')`), true);

console.log('\n③ 왼쪽을 누르면 «원어민 1:1 / 1:2 수업» 카드 상세가 열린다');
t('누르기 전 — 망고아이란? 오버레이 없음', await evalJs(`!document.getElementById('about-mangoi-ov')`), true);
await clickSel('.home-tracks .ht-live');
t('오버레이가 보인다', await evalJs(`(function(){var o=document.getElementById('about-mangoi-ov');return !!o && getComputedStyle(o).display!=='none';})()`), true);
t('목록이 아니라 «상세» 뷰다', await evalJs(`(function(){var o=document.getElementById('about-mangoi-ov');if(!o)return null;
   var d=o.querySelector('.abm-view-detail'); return !!d && getComputedStyle(d).display!=='none';})()`), true);
/* ⛔ 기대 글자를 여기 손으로 적지 않는다 — 카드 제목을 손보는 무해한 수정에 거짓 FAIL 이 난다
   (CLAUDE.md 「검사에 «설정표» 를 손으로 적으면」). 화면끼리 대조한다:
   목록에서 그 key 를 단 버튼의 글자 == 지금 열린 상세의 제목. */
t('상세 제목이 «그 key 를 단 목록 버튼» 과 같은 글자', await evalJs(`(function(){
   var d=document.querySelector('#about-mangoi-ov .abm-dtitle');
   var b=document.querySelector('#about-mangoi-ov .abm-item[data-key="live-class"] .abm-tx');
   if(!d||!b) return null;
   return d.textContent.trim() === b.textContent.trim();})()`), true);
t('그 제목이 빈 글자가 아니다(대조가 헛돌지 않았다)', await evalJs(`(function(){
   var d=document.querySelector('#about-mangoi-ov .abm-dtitle');
   return !!d && d.textContent.trim().length > 3;})()`), true);
t('그 카드의 버튼이 「수업 신청하러 가기」', await evalJs(`(function(){var e=document.querySelector('#about-mangoi-ov .abm-dcta');return e?/수업 신청/.test(e.textContent):null;})()`), true);
t('「← 목록으로」로 돌아갈 길이 보인다', await evalJs(`(function(){var e=document.querySelector('#about-mangoi-ov .abm-back');return !!e && e.getBoundingClientRect().height>0;})()`), true);

console.log('\n④ 오른쪽을 누르면 「AI와 친구하기」 카드 오버레이가 열린다');
await home();
t('누르기 전 — AI 오버레이 없음', await evalJs(`!document.getElementById('ai-friends-ov')`), true);
await clickSel('.home-tracks .ht-ai');
t('AI 오버레이가 보인다', await evalJs(`(function(){var o=document.getElementById('ai-friends-ov');return !!o && getComputedStyle(o).display!=='none';})()`), true);
t('카드가 8장 이상', await evalJs(`document.querySelectorAll('#ai-friends-ov .aif-item, #ai-friends-ov a[href], #ai-friends-ov button').length >= 8`), true);
t('망고아이란? 오버레이는 안 열렸다(서로 안 섞임)', await evalJs(`(function(){var o=document.getElementById('about-mangoi-ov');return !o || getComputedStyle(o).display==='none';})()`), true);

console.log('\n⑤ 키보드 Enter 로도 열린다 (role=button 을 달았으면 짝이어야 한다)');
await home();
await evalJs(`document.querySelector('.home-tracks .ht-live').focus()`);
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
await new Promise(r => setTimeout(r, 900));
t('Enter 로 상세가 열린다', await evalJs(`(function(){var d=document.querySelector('#about-mangoi-ov .abm-view-detail');return !!d && getComputedStyle(d).display!=='none';})()`), true);

console.log('\n⑥ 짝 — 배선을 «안» 건 곳은 여전히 아무 일도 안 한다 (전부 열기 변이 차단)');
await home();
await clickSel('.home-slogan');
t('슬로건을 눌러도 망고아이란? 안 열림', await evalJs(`!document.getElementById('about-mangoi-ov')`), true);
t('슬로건을 눌러도 AI 오버레이 안 열림', await evalJs(`!document.getElementById('ai-friends-ov')`), true);
t('슬로건에는 role=button 이 안 붙었다', await evalJs(`!document.querySelector('.home-slogan').hasAttribute('role')`), true);

console.log('\n⑦ 짝 — 모르는 key 를 주면 «갔다» 고 거짓말하지 않는다');
await home();
t('모르는 key → false', await evalJs(`window.openAboutMangoiCard('__no_such_key__')`), false);
t('그래도 목록은 열어 둔다(사람이 눈으로 고를 수 있게)', await evalJs(`(function(){var o=document.getElementById('about-mangoi-ov');return !!o && getComputedStyle(o).display!=='none';})()`), true);
t('아는 key → true', await evalJs(`window.openAboutMangoiCard('live-class')`), true);

console.log('\n⑧ 폰 폭(390) — 트랙이 좁아져도 그 자리가 여전히 그 트랙인가');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await home();
for (const sel of ['.home-tracks .ht-live', '.home-tracks .ht-ai']) {
  t(`390px — 맨 위가 ${sel} 자신`, await evalJs(`(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;
     var r=e.getBoundingClientRect(); var top=document.elementFromPoint(r.left+r.width/2, r.top+r.height/2);
     return !!top && (top===e || e.contains(top));})()`), true);
}
t('390px — 두 트랙이 서로 겹치지 않는다', await evalJs(`(function(){
   var a=document.querySelector('.home-tracks .ht-live').getBoundingClientRect();
   var b=document.querySelector('.home-tracks .ht-ai').getBoundingClientRect();
   return a.right <= b.left + 0.5 || b.right <= a.left + 0.5;})()`), true);
await send('Emulation.clearDeviceMetricsOverride');

console.log('\n⑨ ▸ 화살표 — «누를 수 있다» 는 신호 (폰엔 커서도 hover 도 없다)');
await home();
const chev = (sel) => evalJs(`(function(){var e=document.querySelector(${JSON.stringify(sel)} + ' .ht-what');
   if(!e) return null; var c=getComputedStyle(e,'::after').content; return c;})()`);
t('.ht-live 에 화살표가 그려진다', /\u203a|›/i.test(String(await chev('.home-tracks .ht-live'))), true);
t('.ht-ai 에 화살표가 그려진다', /\u203a|›/i.test(String(await chev('.home-tracks .ht-ai'))), true);
/* ⛔ 짝 — 라벨 «글자» 에는 화살표가 없어야 한다. 글자로 넣으면 i18n 사전이 전체 문자열
   일치라 「원어민 화상수업」과 「원어민 화상수업 ›」를 다른 말로 보고 번역이 깨진다. */
t('짝 — 라벨 textContent 에는 화살표가 없다', await evalJs(`/[›\u203a]/.test(document.querySelector('.home-tracks').textContent)`), false);

console.log('\n⑨-2 짝 — 🌐 를 눌러도 화살표가 살아남는다 (가상요소를 쓴 이유)');
const beforeTxt = await evalJs(`document.querySelector('.home-tracks .ht-ai .ht-what').textContent.trim()`);
await evalJs(`(function(){ try{ window.toggleLang && window.toggleLang(); }catch(e){} return 1; })()`);
await new Promise(r => setTimeout(r, 700));
t('언어가 실제로 바뀌었다(전제)', await evalJs(`document.querySelector('.home-tracks .ht-ai .ht-what').textContent.trim()`) !== beforeTxt, true);
t('토글 뒤에도 .ht-ai 화살표가 남아 있다', /\u203a|›/i.test(String(await chev('.home-tracks .ht-ai'))), true);
t('토글 뒤에도 .ht-live 화살표가 남아 있다', /\u203a|›/i.test(String(await chev('.home-tracks .ht-live'))), true);
t('토글 뒤에도 안쪽 span 이 살아 있다', await evalJs(`document.querySelectorAll('.home-tracks .ht-live > span').length`), 2);
await evalJs(`(function(){ try{ window.toggleLang && window.toggleLang(); }catch(e){} return 1; })()`);
await new Promise(r => setTimeout(r, 500));

/* ⑨-3 폰 폭 — 화살표를 붙여도 «새로» 넘치지 않는가
   🔴 2026-09-21 함정 대조가 잡은 것: 처음 검사식이 `w.scrollWidth <= box.clientWidth`
   였는데 `box`(.ht-track)에는 좌우 패딩 22px 가 들어 있어 **자기 상자를 22px 넘어도
   통과**했습니다. 실측: 320px 한국어에서 .ht-live 가 내용상자를 16.8px 넘는데 그 검사는 `true`.
   ✅ 견주는 대상을 «자기 상자»(w.clientWidth)로 바꿨습니다.
   ⚠️ 그런데 320px 에서는 **화살표가 없어도 이미 11.9px 넘칩니다**(글자만으로).
      그건 이 변경이 만든 것이 아니므로 «절대 넘침» 으로 FAIL 내면 거짓 고발입니다 —
      320 에서는 **A/B(화살표를 껐다 켜서 «새» 넘침이 생겼는가)** 로 묻습니다.
   ⚠️ 「문서가 가로로 안 넘친다」는 이 사고를 못 봅니다 — .home-tracks 가 잘라내므로
      안쪽만 넘치고 문서 폭은 그대로입니다(실측). 그래서 둘을 짝으로 둡니다. */
console.log('\n⑨-3 폰 폭 — 화살표를 붙여도 «새로» 넘치지 않는다');
const SELS = ['.home-tracks .ht-live', '.home-tracks .ht-ai'];
const lineW = (sel) => evalJs(`(function(){
   var b=document.querySelector(${JSON.stringify(sel)}); if(!b) return null;
   var w=b.querySelector('.ht-what');
   /* ::after 는 Range 로 안 잡힌다 — inline-block 으로 잠깐 바꿔 «줄 전체» 폭을 잰다 */
   var od=w.style.display; w.style.display='inline-block';
   var rw=w.getBoundingClientRect().width; w.style.display=od;
   return { line: Math.round(rw*10)/10, own: w.clientWidth, sw: w.scrollWidth };})()`);
for (const wpx of [320, 360, 390]) {
  await send('Emulation.setDeviceMetricsOverride', { width: wpx, height: 800, deviceScaleFactor: 2, mobile: true });
  await home();
  t(`${wpx}px — 문서가 가로로 안 넘친다`, await evalJs(`document.documentElement.scrollWidth <= window.innerWidth + 1`), true);
  const on = {}; for (const sel of SELS) on[sel] = await lineW(sel);
  /* 화살표를 끈 판을 만들어 A/B */
  await evalJs(`(function(){var s=document.getElementById('ab-off');if(s)s.remove();
     s=document.createElement('style');s.id='ab-off';
     s.textContent='.home-tracks .home-tracks .ht-track .ht-what::after,.home-tracks .ht-track .ht-what::after{content:none !important}';
     document.head.appendChild(s);return 1;})()`);
  await new Promise(r => setTimeout(r, 350));
  const off = {}; for (const sel of SELS) off[sel] = await lineW(sel);
  await evalJs(`(function(){var s=document.getElementById('ab-off');if(s)s.remove();return 1;})()`);
  for (const sel of SELS) {
    const nm = sel.split(' ').pop();
    t(`${wpx}px — ${nm} 전제: 화살표가 실제로 폭을 더한다`, on[sel].line > off[sel].line, true);
    console.log(`      ${wpx} ${nm}: OFF ${off[sel].line} → ON ${on[sel].line} (자기 상자 ${on[sel].own})`);
    /* «새» 넘침 — 화살표 때문에 처음으로 넘치게 된 것만 잡는다 */
    t(`${wpx}px — ${nm} 화살표가 «새» 넘침을 만들지 않는다`,
      !(on[sel].line > on[sel].own + 1) || (off[sel].line > off[sel].own + 1), true);
    t(`${wpx}px — ${nm} 이 한 줄이다`, await evalJs(`(function(){
       var w=document.querySelector(${JSON.stringify(sel)} + ' .ht-what');
       var lh=parseFloat(getComputedStyle(w).lineHeight)||16;
       return w.getBoundingClientRect().height < lh * 1.8;})()`), true);
  }
  if (wpx >= 360) for (const sel of SELS) {
    /* 여유가 있는 폭에서는 «절대» 로도 안 넘쳐야 한다(느슨한 옛 검사식을 대신한다) */
    t(`${wpx}px — ${sel.split(' ').pop()} 글자가 «자기» 상자를 안 넘는다`,
      on[sel].sw <= on[sel].own + 1, true);
  }
}
await send('Emulation.clearDeviceMetricsOverride');

/* ⑨-3b 🔴 화살표가 «보이는가» — 그려졌다고 보이는 것은 아니다
   함정 대조 실측: `opacity:.7` → `opacity:0` 으로 바꾸면 화살표가 안 보이는데
   ⑨(content 만 읽음)도 ⑨-4(대체 텍스트라 이름에도 없음)도 통과했습니다
   — 사장님 지시가 «조용히 무효» 가 되는 방향인데 어느 검사도 못 봤습니다. */
console.log('\n⑨-3b 🔴 화살표가 실제로 «보인다» (그려짐 ≠ 보임)');
await home();
for (const sel of SELS) {
  const nm = sel.split(' ').pop();
  const op = await evalJs(`parseFloat(getComputedStyle(document.querySelector(${JSON.stringify(sel)} + ' .ht-what'),'::after').opacity)`);
  console.log(`      ${nm}: ::after opacity = ${op}`);
  t(`${nm} — 화살표가 투명하지 않다(opacity > .25)`, op > 0.25, true);
  t(`${nm} — 화살표가 display:none 이 아니다`, await evalJs(
    `getComputedStyle(document.querySelector(${JSON.stringify(sel)} + ' .ht-what'),'::after').display`) !== 'none', true);
}

console.log('\n⑨-4 🔴 화살표가 화면낭독기 이름에 섞이지 않는다 (CDP 접근성 트리)');
await home();
const axName = async (sel) => {
  const { root } = await send('DOM.getDocument', { depth: -1 });
  const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: sel });
  if (!nodeId) return '(노드없음)';
  const { nodes } = await send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
  return String((nodes[0] && nodes[0].name && nodes[0].name.value) || '');
};
for (const sel of ['.home-tracks .ht-live', '.home-tracks .ht-ai']) {
  const nm = await axName(sel);
  const seen = await evalJs(`document.querySelector(${JSON.stringify(sel)} + ' .ht-what').textContent.replace(/\\s+/g,'')`);
  console.log(`      ${sel} → 이름 ${JSON.stringify(nm)} · 보이는 글자 ${JSON.stringify(seen)}`);
  t(`${sel} — 이름이 비어 있지 않다(전제)`, nm.length > 3, true);
  t(`${sel} — 이름에 화살표가 안 섞인다`, /›|›/.test(nm), false);
  t(`${sel} — 짝: 보이는 글자가 이름에 그대로 들어 있다`,
    seen.length > 3 && nm.replace(/\s+/g, '').includes(seen), true);
}

console.log(`\n결과: PASS ${P} / FAIL ${F}`);
ws.close();
process.exit(F ? 1 : 0);
