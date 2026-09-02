/* remote-help-entry-browser.mjs — 「🛠 원격 도움받기」 로 가는 길을 «진짜 브라우저에» 그려서 잰다
 *                                  (2026-09-01)
 *
 * 왜 필요한가
 *   2026-09-01 실측: 원격지원 모달은 멀쩡히 동작하는데 화면에서 찾을 길이 «검색창에 「원격」 을
 *   정확히 치는 것» 하나뿐이었다. 코드에는 입구가 여럿 있는 것처럼 보였지만 전부 죽어 있었다 —
 *     · 그리드 메뉴의 💻 PC원격지원 타일 → index.html 의 fix-v19 가 #grid-menu 를
 *       display:none !important 로 통째로 감춘다(계산값으로 확인).
 *     · 카테고리 모달 카드 → 모달이 DOM 에 붙지 않아 a[href="/remote.html"] 가 0개.
 *     · 전체메뉴 오버레이 → 보이는 항목 71개 중 원격 0건.
 *   그때 회귀 하니스 258건과 타입체크는 «전부 초록불» 이었다. 「그 함수가 있는가」 는 맞았고,
 *   틀린 것은 «보이는가 · 눌리는가 · 무엇이 위에 있는가» 뿐이었기 때문이다.
 *   그래서 여기서는 실제로 그려 놓고 누른다.
 *
 * ⚠️ manual/ 규약상 자동으로 안 돕니다 — 아래를 건드리면 사람이 부르세요.
 *      · js/idx-remote-support.js (모달 z-index · 홈 ➕ 항목 · /?menu=remote)
 *      · js/idx-allmenu.js (전체메뉴 타일)
 *      · js/vc-dock.js (수업 중 설정 시트 「도움받기」)
 *      · precheck.html (수업 진단 결과의 도움 줄)
 *
 *      cd cloudflare-deploy/public && python3 -m http.server 8899 &
 *      node test-harness/manual/remote-help-entry-browser.mjs
 *
 * ⚠️ file:// 로 열면 <script src="/js/…"> 가 전부 404 라 아무 것도 확인되지 않는다(CLAUDE.md 함정).
 *    반드시 로컬 HTTP 서버로 띄운다.
 */
import { spawn } from 'node:child_process';

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8899';
const PORT = 9364;
let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  c ? (pass++, console.log('  ✅ ' + m))
    : (fail++, console.log('  ❌ ' + m + (extra !== undefined ? '\n       · ' + JSON.stringify(extra) : '')));
};

const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 2800));

const tabs = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
let id = 0; const pend = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
await new Promise(r => ws.onopen = r);
const cdp = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return { ERR: JSON.stringify(r.result.exceptionDetails).slice(0, 300) };
  return r.result?.result?.value;
};
await cdp('Page.enable'); await cdp('Runtime.enable');
/* 빈 브라우저는 늘 «첫 방문자» 다 — 세로 폰의 「화면을 가로로 돌려주세요」 오버레이가
   수업 화면을 덮고 그 아래를 잠근다(CLAUDE.md 함정). 사람은 한 번 넘기면 다시 안 본다. */
await cdp('Page.addScriptToEvaluateOnNewDocument', {
  source: `try{localStorage.setItem('mangoi_vc_orientation_dismissed','1');}catch(e){}`
});

/* 🔴 판정의 핵심 — 「열렸다」·「보인다」·「눌린다」는 다 다르다.
   모달 z-index 는 11500 이었는데 A.i 상담사 위젯(2147483000)·수업 독(99993)이 더 위라
   «보이는데 안 눌리는» 상태가 될 수 있었다. elementFromPoint 로 «맨 위가 누구인가» 를 잰다. */
const TOPCHECK = `(() => {
  const ov = document.getElementById('rs-overlay');
  if (!ov) return { exists: false };
  const cs = getComputedStyle(ov);
  /* ⚠️ 화면 «가운데 몇 점» 을 찍으면 헛돈다 — 실제로 겹치는 것들(수업 독은 아래 가운데,
     A.i 상담사 위젯과 ➕ 는 아래 모서리)이 그 표본을 비켜 간다. 2026-09-01 에 이 검사를
     그렇게 짰다가, z-index 를 옛 값(11500)으로 되돌려도 32건이 전부 초록이었다.
     그래서 «모달이 가진 조작들» 을 하나하나 훑어 그 자리의 맨 위가 모달 안인지 본다. */
  const els = [...ov.querySelectorAll('button, a, input')].filter(el => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight;
  });
  const blocked = [];
  els.forEach(el => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    if (!hit || !ov.contains(hit)) {
      blocked.push({ me: (el.textContent || el.id || el.tagName).trim().slice(0, 18),
                     by: hit ? (hit.tagName + '#' + (hit.id || '')) : 'null' });
    }
  });
  /* 🔴 «지금 이 순간 안 가려졌다» 만으로는 부족하다 — 겹치는지는 모달을 어디까지 굴렸는지,
     카드가 화면 어디에 놓였는지에 따라 그때그때 다르다. 그래서 «쌓임 순서» 자체를 잰다:
     지금 화면에 떠 있는 것들 중 모달보다 위에 있는 것이 있으면 안 된다.
     ⛔ 예외 둘은 일부러 위에 둔다(CLAUDE.md) —
        #mg-fab-wrap(➕) 과 #vc-reconnect-banner(재연결 안내). 재연결 안내가 가려지면
        수업이 끊긴 것을 학생이 모른다. */
  const ALLOW_ABOVE = ['mg-fab-wrap', 'mg-fab-scrim', 'vc-reconnect-banner'];
  const myZ = parseInt(cs.zIndex) || 0;
  const above = [];
  document.querySelectorAll('body *').forEach(el => {
    if (ov.contains(el) || el === ov) return;
    const s2 = getComputedStyle(el);
    if (s2.position !== 'fixed' && s2.position !== 'sticky') return;
    if (s2.display === 'none' || s2.visibility === 'hidden' || s2.opacity === '0') return;
    const r = el.getBoundingClientRect();
    if (r.width < 12 || r.height < 12) return;
    if (r.bottom < 0 || r.top > innerHeight) return;
    const z = parseInt(s2.zIndex);
    if (!isFinite(z) || z <= myZ) return;
    let n = el, allowed = false;
    while (n && n !== document.body) { if (ALLOW_ABOVE.indexOf(n.id) >= 0) { allowed = true; break; } n = n.parentElement; }
    if (!allowed) above.push({ id: el.id || ('.' + String(el.className).slice(0, 20)), z });
  });
  return { exists: true, display: cs.display, z: cs.zIndex,
           checked: els.length, blocked, above, pin: !!document.getElementById('rs-pin-input') };
})()`;

async function open(path, w, h, mobile) {
  await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
  // 고친 파일을 다시 잴 때 캐시가 옛 사본을 준다 — 캐시 우회를 박아 둔다(CLAUDE.md 함정)
  await cdp('Page.navigate', { url: BASE + path + (path.includes('?') ? '&' : '?') + '_nc=' + Date.now() });
  await new Promise(r => setTimeout(r, 4200));
}
const enterCall = `(async () => {
  document.body.classList.add('vc-in-call');
  try { window.vcNukeRotationOverlays && window.vcNukeRotationOverlays(); } catch(e){}
  const v = document.getElementById('view-videocall-call');
  if (v) { v.style.display = 'block'; v.classList.add('active'); }
  document.querySelectorAll('.view,[id^="view-"]').forEach(e => { if (e.id !== 'view-videocall-call') e.style.display = 'none'; });
  await new Promise(r => setTimeout(r, 1600));
  return !!document.getElementById('vc-dock');
})()`;

// ── ① 홈 ➕ 스피드다이얼 ────────────────────────────────────────────────
console.log('\n① 홈 ➕ 세 번째 항목');
for (const [lab, w, h, mob] of [['PC', 1280, 900, false], ['폰', 390, 844, true]]) {
  await open('/index.html', w, h, mob);
  const n = await ev(`(()=>{const w=document.getElementById('mg-fab-wrap');return w?w.querySelectorAll('.mg-fab-item').length:0;})()`);
  ok(n === 3, `[${lab}] ➕ 항목이 3개(새로고침·카카오·원격)`, n);

  /* ⛔ 아이콘 버튼에 data-ko/data-en 을 달면 두 i18n 엔진이 textContent 를 통째로 갈아끼워
     44px 동그라미 안에 문장이 들어앉는다(CLAUDE.md 함정 — 홈 오프닝 소리 버튼 실사고). */
  const btn = await ev(`(()=>{const b=document.querySelector('#mg-fab-wrap [data-act="remotehelp"]');
    return b?{txt:b.textContent,dataKo:b.hasAttribute('data-ko'),title:b.title}:null;})()`);
  ok(btn && btn.dataKo === false && btn.txt === '🛠',
     `[${lab}] 아이콘 버튼이 아이콘 그대로(data-ko 없음)`, btn);

  await ev(`document.getElementById('mg-fab').click()`);
  await new Promise(r => setTimeout(r, 500));
  // 폰에서는 ➕ 가 우하단이라 라벨이 오른쪽으로 뻗으면 화면 밖으로 잘린다
  const inside = await ev(`(()=>{const rs=[...document.querySelectorAll('#mg-fab-wrap .mg-fab-item')];
    return rs.length===3 && rs.every(e=>{const b=e.getBoundingClientRect();return b.x>=0 && b.right<=innerWidth+0.5;});})()`);
  ok(inside === true, `[${lab}] 세 항목이 화면 안 — 잘리지 않음`);

  await ev(`document.querySelector('#mg-fab-wrap [data-act="remotehelp"]').click()`);
  await new Promise(r => setTimeout(r, 700));
  const t = await ev(TOPCHECK);
  ok(t.exists && t.display === 'block', `[${lab}] 눌러서 모달이 열림`, t);
  ok(t.checked > 0 && t.blocked.length === 0,
     `[${lab}] 모달 안 조작 ${t.checked}개가 전부 눌림`, t.blocked);
  ok(t.above && t.above.length === 0,
     `[${lab}] 모달보다 위에 떠 있는 것이 없음(A.i 위젯 등)`, t.above);
}

// ── ② 전체메뉴 타일 ────────────────────────────────────────────────────
console.log('\n② 전체메뉴 오버레이 타일');
await open('/index.html', 390, 844, true);
await ev(`window.openAllMenuOverlay()`);
await new Promise(r => setTimeout(r, 700));
const tile = await ev(`(()=>{const a=document.querySelector('a[data-remote-help]');
  if(!a)return{found:false};const b=a.getBoundingClientRect();
  return{found:true,txt:a.textContent.trim(),href:a.getAttribute('href'),
    vis:b.width>0&&b.height>0&&getComputedStyle(a).visibility!=='hidden'};})()`);
ok(tile.found && tile.vis, '전체메뉴에 «원격 도움받기» 타일이 보임', tile);
/* ⛔ href 를 '#' 으로 두면 자바스크립트가 죽었을 때 «눌러도 아무 일도 없음» 이 된다.
   폴백 주소가 살아 있어야 한다(idx-remote-support.js 의 rsFromUrl 이 받는다). */
ok(tile.href === '/?menu=remote', 'href 폴백이 /?menu=remote', tile.href);
await ev(`document.querySelector('a[data-remote-help]').click()`);
await new Promise(r => setTimeout(r, 700));
let t2 = await ev(TOPCHECK);
ok(t2.exists && t2.display === 'block', '타일을 누르면 모달이 열림', t2);
ok(await ev(`!document.getElementById('mangoi-allmenu')`) === true, '전체메뉴는 닫힘');

// ── ③ 주소로 바로 열기 ─────────────────────────────────────────────────
console.log('\n③ /?menu=remote 링크 진입');
await open('/index.html?menu=remote', 390, 844, true);
t2 = await ev(TOPCHECK);
ok(t2.exists && t2.display === 'block', '주소만으로 모달이 열림(카톡으로 보낼 링크)', t2);

// ── ④ 수업 중 설정 시트 ────────────────────────────────────────────────
console.log('\n④ 수업 중 ⚙️ 설정 → 도움받기');
for (const [lab, w, h, mob] of [['폰', 390, 844, true], ['PC', 1280, 900, false]]) {
  await open('/index.html', w, h, mob);
  await ev(enterCall);
  await ev(`(()=>{const b=[...document.querySelectorAll('#vc-dock button')].find(x=>/설정|Settings/.test(x.textContent));
    if(b)b.click();return !!b;})()`);
  await new Promise(r => setTimeout(r, 700));
  const row = await ev(`(()=>{const b=document.querySelector('#vc-dock-settings [data-act="remotehelp"]');
    if(!b)return{found:false};const r=b.getBoundingClientRect();
    return{found:true,txt:b.textContent.trim(),vis:r.width>0&&getComputedStyle(b).visibility!=='hidden'};})()`);
  ok(row.found && row.vis, `[${lab}] 설정 시트에 «🛠 원격 도움받기» 가 보임`, row);

  /* ⛔ 독에 8번째 버튼으로 만들지 말 것 — 독은 폭이 꽉 차 있어 좁은 폰에서 줄이 넘친다
     (CLAUDE.md 「독에 버튼을 하나 추가했는데 PC 에서 개수가 안 맞음」). */
  const n = await ev(`[...document.querySelectorAll('#vc-dock button')].filter(b=>getComputedStyle(b).display!=='none').length`);
  ok(n === 7, `[${lab}] 독 버튼 개수 그대로(7) — 폭 안 늘어남`, n);

  await ev(`document.querySelector('#vc-dock-settings [data-act="remotehelp"]').click()`);
  await new Promise(r => setTimeout(r, 700));
  const t3 = await ev(TOPCHECK);
  ok(t3.exists && t3.display === 'block', `[${lab}] 누르면 모달이 열림`, t3);
  // 독은 z-index 99993, 설정 시트는 99994 — 모달이 그보다 위여야 손이 닿는다
  ok(t3.checked > 0 && t3.blocked.length === 0,
     `[${lab}] 모달 안 조작 ${t3.checked}개가 전부 눌림`, t3.blocked);
  ok(t3.above && t3.above.length === 0,
     `[${lab}] 모달보다 위에 떠 있는 것이 없음(독·세계시계 등)`, t3.above);
}

// ── ⑤ 수업 진단 결과의 도움 줄 ─────────────────────────────────────────
console.log('\n⑤ 수업 진단(precheck) 결과 → 도움받기');
await open('/precheck.html', 390, 844, true);
ok(await ev(`typeof window.openRemoteSupportModal`) === 'function', '진단 페이지에 모달 스크립트가 실림');

for (const lang of ['ko', 'en']) {
  const r = await ev(`(()=>{ setLang && setLang('${lang}');
    Object.keys(T).forEach(k=>{T[k].pass=true;}); T.camera.pass=false;
    buildRecommendations();
    const h=document.querySelector('.reco-help'); if(!h) return {found:false};
    return {found:true, as:[...h.querySelectorAll('a')].map(a=>({t:a.textContent.trim(),href:a.getAttribute('href')}))};})()`);
  const remote = r.as && r.as.find(a => a.href === '/?menu=remote');
  ok(!!remote, `[${lang}] 실패가 있으면 원격 버튼이 나옴 + 폴백 주소`, r);
  ok(remote && (lang === 'ko' ? /원격 도움받기/.test(remote.t) : /Remote help/.test(remote.t)),
     `[${lang}] 라벨이 그 언어로 나옴`, remote);
}

/* ⛔ 전부 통과인 학생에게는 그리지 않는다 — 멀쩡한데 «뭔가 잘못됐나» 하는 인상을 주면 안 된다.
   (buildRecommendations 는 문제가 없을 때 'ok' 팁 한 줄을 넣으므로 «비었는가» 로는 못 가른다.) */
ok(await ev(`(()=>{Object.keys(T).forEach(k=>{T[k].pass=true;}); buildRecommendations();
  return !!document.querySelector('.reco-help');})()`) === false,
   '전부 통과일 때는 도움 줄을 안 그림');

const geo = await ev(`(()=>{ setLang && setLang('ko');
  Object.keys(T).forEach(k=>{T[k].pass=true;}); T.camera.pass=false; buildRecommendations();
  const h=document.querySelector('.reco-help');
  const as=[...h.querySelectorAll('a')].map(a=>{const cs=getComputedStyle(a);const b=a.getBoundingClientRect();
    const lh=parseFloat(cs.lineHeight)||18;
    const inner=b.height-parseFloat(cs.paddingTop)-parseFloat(cs.paddingBottom);
    return {t:a.textContent.trim(),lines:Math.round(inner/lh)};});
  return {as, docOverflow: document.documentElement.scrollWidth>innerWidth};})()`);
/* 짧은 라벨이 좁은 상자에서 «낱글자로 쪼개지는» 사고가 이 저장소에 있었다(CLAUDE.md).
   상자 높이 ÷ line-height 로 줄 수를 센다 — padding 을 빼야 한 줄짜리가 2줄로 안 잡힌다. */
ok(geo.as.every(a => a.lines <= 1), '버튼 글자가 한 줄 — 낱글자로 안 쪼개짐', geo.as);
ok(geo.docOverflow === false, '390px 에서 문서가 가로로 안 넘침');

/* «무슨 색인가» 와 «읽히는가» 는 다른 검사다(CLAUDE.md).
   ⚠️ 반투명 층을 만나면 거기서 멈추지 말고 아래에서 위로 합성해야 한다 —
      그냥 쓰면 멀쩡한 대비를 1.x 로 잘못 읽는다. */
const contrast = await ev(`(()=>{
  function parse(c){const m=c.match(/[\\d.]+/g);return m?m.map(Number):null;}
  function bgOf(el){ let layers=[],n=el;
    while(n && n!==document.documentElement){ const cs=getComputedStyle(n);
      let c=parse(cs.backgroundColor);
      if((!c||c[3]===0) && cs.backgroundImage && cs.backgroundImage!=='none'){
        const m=cs.backgroundImage.match(/rgba?\\([^)]+\\)/); if(m) c=parse(m[0]); }
      if(c && (c[3]===undefined||c[3]>0)){ layers.push(c); if(c[3]===undefined||c[3]===1) break; }
      n=n.parentElement; }
    layers.push([255,255,255,1]);
    let out=layers[layers.length-1].slice(0,3);
    for(let i=layers.length-2;i>=0;i--){const l=layers[i],a=l[3]===undefined?1:l[3];
      out=[0,1,2].map(k=>l[k]*a+out[k]*(1-a));}
    return out; }
  function lum(c){const s=c.map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4);});
    return .2126*s[0]+.7152*s[1]+.0722*s[2];}
  return [...document.querySelectorAll('.reco-help a, .reco-help .rh-t')].map(el=>{
    const L1=lum(parse(getComputedStyle(el).color)), L2=lum(bgOf(el));
    return {t:el.textContent.trim().slice(0,16),
      ratio:+(((Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05))).toFixed(2)};});})()`);
ok(contrast.every(c => c.ratio >= 4.5), '도움 줄 글자가 WCAG 본문 4.5:1 이상', contrast);

console.log(`\n════════════════════════════════════════════`);
console.log(`  ${fail ? '⚠' : '✅'} PASS ${pass}   FAIL ${fail}`);
console.log(`════════════════════════════════════════════`);
ws.close();
try { chrome.kill(); } catch (e) {}
process.exit(fail ? 1 : 0);
