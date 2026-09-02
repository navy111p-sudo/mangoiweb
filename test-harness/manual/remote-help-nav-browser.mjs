/* ═══════════════════════════════════════════════════════════════════════════
   🛠 원격 도움받기 모달의 ← 뒤로 · 🏠 홈 — 진짜 브라우저로 잰다
   (2026-09-02 사장님 지시 «뒤로, 홈버튼 도 만들어줘»)
   ───────────────────────────────────────────────────────────────────────────
   ⚠️ 자동으로 안 돕니다 — 파일 이름이 *_harness.mjs 가 아니라 게이트가 안 물어 갑니다.
      사람이 부릅니다:
        cd cloudflare-deploy/public && python3 -m http.server 8921 &
        /opt/pw-browsers/chromium-1194/chrome-linux/chrome --headless=new \
          --remote-debugging-port=9231 --no-sandbox --user-data-dir=/tmp/rsnav &
        node test-harness/manual/remote-help-nav-browser.mjs

   [왜 문자열 하니스로는 못 잡나] 함수도 값도 다 «있고» 틀릴 수 있는 것은
     «보이는가 · 눌리는가 · 읽히는가 · 무슨 주소가 남는가» 뿐입니다.

   🪤 이번에 이 검사가 실제로 잡은 것 (둘 다 «검사 쪽» 이 틀렸습니다 — CLAUDE.md
      「FAIL 이 나면 검사 쪽을 먼저 의심하라」의 실례입니다)
     ① room=keepme 를 넣고 «남아 있나» 를 물었더니 사라졌습니다. 제 코드가 아니라
        index.html:16694 의 forget() 이 «수업 밖 새로고침이 방으로 끌려가지 않게»
        스스로 지운 것이었습니다 ⟹ 그 페이지가 «관리하는» 파라미터로 시험하지 말고
        중립 파라미터(kept=yes)로 물어야 합니다.
     ② precheck.html 에서 버튼이 0개로 나왔습니다. 이 모달은 window.getLang() 으로
        한/영을 가르는데 헤드리스의 navigator.language 가 en-US 라 «Back/Home» 으로
        떴고, 제 정규식이 한국어 글자만 찾고 있었습니다 ⟹ 라벨 검사는 두 언어 모두.

   ⚠️ /json/new 로 «새 탭» 을 만들면 이 컨테이너 크로미움은 스크립트를 안 돌립니다.
      /json/list 로 «이미 있는 탭» 을 잡아 Page.navigate 합니다(CLAUDE.md).
   ⚠️ 고친 뒤 다시 잴 때는 캐시 우회(?_nc=)가 필요합니다 — 편집 전 사본을 줍니다.
   ═══════════════════════════════════════════════════════════════════════════ */
const CDP = 'http://127.0.0.1:9231';
const BASE = 'http://127.0.0.1:8921';
let id = 0, ws;
const pend = new Map();
async function connect() {
  const tabs = await (await fetch(CDP + '/json/list')).json();
  const page = tabs.find(t => t.type === 'page');
  const { WebSocket } = globalThis;
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => { const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
}
const send = (method, params = {}) => new Promise(r => { const i = ++id;
  pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result?.result?.value;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function go(url) {
  await send('Page.navigate', { url: url + (url.includes('?') ? '&' : '?') + '_nc=' + Date.now() });
  await sleep(2600);
}
let P = 0, F = 0;
const ok  = (n, c, d='') => { c ? (P++, console.log('  ✅ ' + n + (d ? ' — ' + d : '')))
                                : (F++, console.log('  ❌ ' + n + (d ? ' — ' + d : ''))); };

await connect();
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setFocusEmulationEnabled', { enabled: true });

/* ── ① 홈에서 /?menu=remote 로 열었을 때 두 버튼이 «보이고 눌리는가» ── */
console.log('\n① 홈 · /?menu=remote — 버튼이 보이고 눌리는가');
await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
await go(BASE + '/index.html?menu=remote');
await sleep(1200);

ok('모달이 실제로 열렸다', await ev(`(()=>{const o=document.getElementById('rs-overlay');
  return !!o && getComputedStyle(o).display!=='none';})()`));

const probe = await ev(`(()=>{
  const bs=[...document.querySelectorAll('#rs-overlay button')]
    .filter(b=>/뒤로|홈|Back|Home/.test(b.textContent));
  return bs.map(b=>{const r=b.getBoundingClientRect();
    const cs=getComputedStyle(b);
    const cx=r.left+r.width/2, cy=r.top+r.height/2;
    const top=document.elementFromPoint(cx,cy);
    return {t:b.textContent.trim(), w:+r.width.toFixed(1), h:+r.height.toFixed(1),
      vis:cs.display!=='none'&&cs.visibility!=='hidden'&&!!b.offsetParent,
      inView:r.top>=0&&r.top<innerHeight&&r.left>=0,
      hit: top===b||b.contains(top), topTag: top?top.tagName+'.'+(top.className||'').toString().slice(0,20):'null'};});
})()`);
console.log('   실측:', JSON.stringify(probe));
ok('버튼이 정확히 2개 (뒤로·홈)', probe.length === 2, probe.map(p=>p.t).join(' / '));
for (const p of probe) {
  ok(`「${p.t}」 화면에 보인다`, p.vis && p.inView, `${p.w}×${p.h}`);
  ok(`「${p.t}」 맨 위라 눌린다`, p.hit, p.hit ? '' : '덮은 것: ' + p.topTag);
  ok(`「${p.t}」 탭 표적 40px 이상`, p.h >= 40, p.h + 'px');
  ok(`「${p.t}」 글자가 한 줄`, p.h < 60, p.h + 'px');
}

/* ── ② 대비비 (어두운 모달 — «무슨 색인가» 가 아니라 «읽히는가») ── */
console.log('\n② 글자가 읽히는가 (WCAG · 반투명은 합성해서)');
const contrast = await ev(`(()=>{
  const lum=c=>{const a=[c[0],c[1],c[2]].map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)});
    return .2126*a[0]+.7152*a[1]+.0722*a[2]};
  const parse=s=>{const m=s.match(/[\\d.]+/g);return m?[+m[0],+m[1],+m[2],m[3]!==undefined?+m[3]:1]:null};
  function bg(el){const layers=[];
    for(let n=el;n;n=n.parentElement){const cs=getComputedStyle(n);
      let c=parse(cs.backgroundColor);
      /* 배경이 투명이면 그라데이션의 첫 색을 그 층으로 (CLAUDE.md) */
      if((!c||c[3]===0)&&cs.backgroundImage&&cs.backgroundImage!=='none'){
        const g=cs.backgroundImage.match(/rgba?\\([^)]*\\)/); if(g) c=parse(g[0]); }
      if(c&&c[3]>0){layers.push(c); if(c[3]>=1) break;}}
    layers.push([255,255,255,1]);
    let out=layers[layers.length-1];
    for(let i=layers.length-2;i>=0;i--){const f=layers[i],a=f[3];
      out=[f[0]*a+out[0]*(1-a),f[1]*a+out[1]*(1-a),f[2]*a+out[2]*(1-a),1];}
    return out;}
  return [...document.querySelectorAll('#rs-overlay button')]
    .filter(b=>/뒤로|홈|Back|Home/.test(b.textContent)).map(b=>{
      const fg=parse(getComputedStyle(b).color), b2=bg(b);
      const l1=lum(fg),l2=lum(b2);
      return {t:b.textContent.trim(), ratio:+(((Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05))).toFixed(2)};});
})()`);
for (const c of contrast) ok(`「${c.t}」 대비 4.5 이상`, c.ratio >= 4.5, c.ratio + ':1');

/* ── ③ ← 뒤로 : 모달이 걷히고 ?menu=remote 만 지워지는가 ── */
console.log('\n③ ← 뒤로 — 걷히고 주소에서 menu 만 빠지는가');
await ev(`history.replaceState(null,'','/index.html?menu=remote&kept=yes&_nc=1')`);
await ev(`window.rsGoBack()`);
await sleep(400);
ok('모달이 걷혔다', await ev(`getComputedStyle(document.getElementById('rs-overlay')).display==='none'`));
const url = await ev(`location.search`);
console.log('   주소:', url);
ok('menu=remote 가 지워졌다', !/menu=remote/.test(url));
ok('★ 다른 파라미터는 그대로 남았다 (menu 만 지운다)', /kept=yes/.test(url) && /_nc=1/.test(url));
ok('페이지가 통째로 이동하지 않았다', await ev(`location.pathname==='/index.html'`));

/* ── ④ 수업 중에는 홈이 없어야 한다 (나가면 수업이 끊긴다) ── */
console.log('\n④ 수업 중(body.vc-in-call) — 홈은 숨고 뒤로는 남는가');
await ev(`document.body.classList.add('vc-in-call')`);
await ev(`window.openRemoteSupportModal()`);
await sleep(500);
const inCall = await ev(`(()=>{const b=[...document.querySelectorAll('#rs-overlay button')]
  .filter(x=>/뒤로|홈|Back|Home/.test(x.textContent)).map(x=>x.textContent.trim());return b;})()`);
console.log('   수업 중 버튼:', JSON.stringify(inCall));
ok('★ 수업 중엔 홈이 없다', !inCall.some(t=>/홈|Home/.test(t)));
ok('수업 중에도 뒤로는 있다', inCall.some(t=>/뒤로|Back/.test(t)));
const stayed = await ev(`(()=>{const p=location.pathname; window.rsGoHome(); return location.pathname===p;})()`);
ok('★ 안전망: 수업 중 rsGoHome() 이 «/» 로 안 나간다', stayed);
await ev(`document.body.classList.remove('vc-in-call')`);

/* ── ⑤ 수업 밖에서는 홈이 실제로 «/» 로 간다 ── */
console.log('\n⑤ 수업 밖 — 홈이 «/» 로 가는가');
await go(BASE + '/index.html?menu=remote');
await sleep(1000);
await ev(`window.rsGoHome()`);
await sleep(1800);
const home = await ev(`location.pathname + location.search`);
console.log('   이동 결과:', home);
ok('홈(/)으로 이동했다', home === '/' || home.startsWith('/?') || home === '/index.html');

/* ── ⑥ precheck.html 위에서도 뜨는가 (여기선 뒤로 = 진단 결과로 복귀) ── */
console.log('\n⑥ 수업 진단(precheck.html) 위에서도 같은가');
await go(BASE + '/precheck.html?menu=remote');
await sleep(1400);
const pre = await ev(`(()=>{const o=document.getElementById('rs-overlay');
  if(!o||getComputedStyle(o).display==='none') return {open:false};
  const b=[...o.querySelectorAll('button')].filter(x=>/뒤로|홈|Back|Home/.test(x.textContent));
  return {open:true, n:b.length, labels:b.map(x=>x.textContent.trim())};})()`);
console.log('   실측:', JSON.stringify(pre));
ok('진단 화면에서도 모달이 열린다', pre.open);
ok('진단 화면에도 두 버튼이 있다', pre.n === 2, (pre.labels||[]).join(' / '));
if (pre.open) {
  await ev(`window.rsGoBack()`);
  await sleep(300);
  ok('뒤로가 진단 화면을 떠나지 않는다', await ev(`location.pathname==='/precheck.html'`));
  ok('진단 화면에서도 모달이 걷혔다', await ev(`getComputedStyle(document.getElementById('rs-overlay')).display==='none'`));
}

/* ── ⑦ 변이시험 — 되돌리면 진짜 FAIL 이 나는가 ── */
console.log('\n⑦ 변이시험 (검사가 헛돌지 않는지)');
await go(BASE + '/index.html?menu=remote');
await sleep(1000);
const mut = await ev(`(()=>{const o=document.getElementById('rs-overlay');
  const nav=[...o.querySelectorAll('div')].find(d=>getComputedStyle(d).position==='sticky');
  if(!nav) return 'sticky 줄을 못 찾음';
  nav.remove();
  return [...o.querySelectorAll('button')].filter(b=>/뒤로|홈|Back|Home/.test(b.textContent)).length;})()`);
ok('★ 줄을 지우면 버튼이 0개가 된다 (검사가 진짜로 잰다)', mut === 0, '남은 개수: ' + mut);

console.log(`\n${'═'.repeat(58)}\n  PASS ${P} / FAIL ${F}`);
process.exit(F ? 1 : 0);
