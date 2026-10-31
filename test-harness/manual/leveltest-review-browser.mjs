#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   📘 레벨테스트 «틀린 문제 다시 보기» — 브라우저 검사 (2026-09-22)

   ⚠️ 자동으로 안 돕니다. 사람이 부릅니다:
        cd cloudflare-deploy/public && python3 -m http.server 8899 &
        PW_DIR=/tmp/pw node test-harness/manual/leveltest-review-browser.mjs

   [왜 «브라우저» 여야 하나]
     자동 하니스(leveltest_review_harness)는 «무엇이 실리고 무슨 글자가 나오는가» 까지
     봅니다. 하지만 «그 글자가 화면에 보이는가 · 눌러야 할 버튼을 덮지 않는가 · 읽히는가» 는
     원리상 못 봅니다(CLAUDE.md 「열렸다·보인다·눌린다는 다 다릅니다」).

   [함정 회피]
     · 새 탭(/json/new)은 이 컨테이너에서 스크립트가 통째로 안 돕니다 → 기존 탭 + Page.navigate
     · 캐시가 «고치기 전» 사본을 줍니다 → ?_nc= + setCacheDisabled + setBypassServiceWorker
     · 대비는 반투명을 «합성» 해야 합니다(안 하면 멀쩡한 글자가 거짓 실패)
   ═══════════════════════════════════════════════════════════════════════ */
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const BASE = process.env.LT_BASE || 'http://127.0.0.1:8899';
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log('  ✅ ' + m); }
  else { fail++; console.log('  ❌ ' + m + (extra != null ? ' — ' + extra : '')); }
};

if (!fs.existsSync(CHROME)) { console.log('SKIP: 크로미움 없음 ' + CHROME); process.exit(0); }

const PORT = 9333;
const proc = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--no-sandbox',
  '--disable-dev-shm-usage', '--hide-scrollbars', '--window-size=390,844',
  '--user-data-dir=/tmp/lt-review-prof',
], { stdio: 'ignore' });
process.on('exit', () => { try { proc.kill(); } catch {} });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function cdpTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await r.json();
      const page = list.find(t => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error('크로미움에 못 붙었습니다');
}

const wsUrl = await cdpTarget();
const ws = new WebSocket(wsUrl);
await new Promise(r => ws.addEventListener('open', r));
let msgId = 0; const waiting = new Map();
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
});
const send = (method, params = {}) => new Promise(res => {
  const id = ++msgId; waiting.set(id, res);
  ws.send(JSON.stringify({ id, method, params }));
});
const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result && r.result.exceptionDetails) return { __err: r.result.exceptionDetails.text };
  return r.result && r.result.result ? r.result.result.value : undefined;
};

await send('Page.enable'); await send('Runtime.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Network.setBypassServiceWorker', { bypass: true });
await send('Emulation.setFocusEmulationEnabled', { enabled: true });

/* 서버를 스텁한다 — 문항 24개와 «틀린 6문항» 이 실린 채점 결과 */
const STUB = `(function(){
  var Q = [], A = [];
  var LV = ['A1','A2','B1','B2','C1','C2'];
  for (var i=0;i<24;i++){
    var lv = LV[Math.floor(i/4)];
    Q.push({ id:'q'+i, cefr:lv, q:'Item '+i+' — She ___ a student.', choices:['be','am','is','are'] });
    A.push(2);
  }
  var REVIEW = [];
  for (var k=0;k<6;k++){
    REVIEW.push({ id:'q'+k, cefr:Q[k].cefr, q:Q[k].q, choices:Q[k].choices,
      picked:1, answer:2,
      why:'주어가 3인칭 단수(She)면 be동사는 is 예요. I → am, You/We/They → are.',
      sentence:'She is a student.' });
  }
  var _f = window.fetch;
  window.fetch = function(u, o){
    var s = String(u);
    if (s.indexOf('/api/leveltest/questions') >= 0)
      return Promise.resolve(new Response(JSON.stringify({ ok:true, questions:Q, total:24 }), {headers:{'Content-Type':'application/json'}}));
    if (s.indexOf('/api/leveltest/diagnose') >= 0)
      return Promise.resolve(new Response(JSON.stringify({ ok:true, ai_score:52, level:'B1',
        correct:18, total:24, review:REVIEW, track:'unknown',
        breakdown: LV.map(function(L,i){ return { cefr:L, correct: i<3?4:2, total:4 }; }) }), {headers:{'Content-Type':'application/json'}}));
    return _f.apply(this, arguments);
  };
  try { localStorage.clear(); } catch(e){}
})();`;

async function openAndFinish(w, h) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: STUB });
  await send('Page.navigate', { url: `${BASE}/level-test-ai.html?_nc=${Date.now()}` });
  await sleep(900);
  await evalJs(`document.getElementById('ai-name').value='검사'; document.getElementById('ai-start').click();`);
  await sleep(500);
  // 24문항을 «실제로» 눌러 끝까지 간다 — 결과 화면은 그 끝에서만 열린다
  for (let i = 0; i < 24; i++) {
    await evalJs(`(function(){var b=document.querySelectorAll('#ai-choices .choice'); if(b[1]) b[1].click(); return !!b[1];})()`);
    await sleep(60);
  }
  await sleep(700);
}

console.log('\n① 폰 폭 390×844 — 결과 화면에 해설이 실제로 그려지는가');
await openAndFinish(390, 844);

ok(await evalJs(`!document.getElementById('result-card').classList.contains('hidden')`), '전제: 결과 화면이 열렸다');
const wrapShown = await evalJs(`(function(){var e=document.getElementById('ai-review-wrap');
  return e && !e.classList.contains('hidden') && e.getBoundingClientRect().height > 0;})()`);
ok(wrapShown, '해설 상자가 «보인다» (높이 > 0)');
const cards = await evalJs(`document.querySelectorAll('#ai-review .rvq').length`);
ok(cards === 6, `틀린 6문항이 카드로 그려졌다 (나온 값 ${cards})`);
ok(await evalJs(`/정답/.test(document.getElementById('ai-review').textContent)`), '«정답» 표시가 화면 글자로 나온다');
ok(await evalJs(`/내 답/.test(document.getElementById('ai-review').textContent)`), '«내 답» 표시도 함께 나온다');
ok(await evalJs(`/주어가 3인칭 단수/.test(document.getElementById('ai-review').textContent)`), '해설이 화면 글자로 나온다');
ok(await evalJs(`/She is a student\\./.test(document.getElementById('ai-review').textContent)`), '완성 문장이 나온다');
const tipShown = await evalJs(`(function(){var e=document.getElementById('ai-review-tip');
  return e && !e.classList.contains('hidden') && e.getBoundingClientRect().height>0 && /6문항/.test(e.textContent);})()`);
ok(tipShown, '요약 밑 안내가 «아래에 6문항 해설이 있다» 고 보인다');

console.log('\n② 기존 조작(CTA)을 덮거나 밀어내지 않는가');
/* 🔴 「보인다」와 「눌린다」는 다르다 — elementFromPoint 로 «맨 위가 그 버튼인가» 를 잰다 */
const ctaTop = await evalJs(`(function(){
  var a=document.querySelector('.cta a.voice'); if(!a) return null;
  a.scrollIntoView({block:'center'});
  var r=a.getBoundingClientRect(), x=r.left+r.width/2, y=r.top+r.height/2;
  var top=document.elementFromPoint(x,y);
  return { h:r.height, hit: !!(top && (top===a || a.contains(top))), tag: top?top.tagName+'.'+top.className:'?' };
})()`);
ok(ctaTop && ctaTop.h > 20, '전제: 발음 평가 버튼이 그려져 있다');
ok(ctaTop && ctaTop.hit, '발음 평가 버튼이 «맨 위» 다 (해설이 덮지 않는다)', ctaTop && ctaTop.tag);
const order = await evalJs(`(function(){
  var cta=document.querySelector('.cta a.voice'), rv=document.getElementById('ai-review-wrap');
  if(!cta||!rv) return null;
  return cta.getBoundingClientRect().top < rv.getBoundingClientRect().top;
})()`);
ok(order === true, 'CTA 가 해설보다 «위» 다 (버튼이 스크롤 밖으로 밀리지 않는다)');

/* 🔴 왼쪽 가장자리에는 사이드바 «메뉴» 손잡이(#mg-drawer-tab)가 세로 가운데에 떠 있다
   (CLAUDE.md 「채팅 화면 왼쪽 가장자리에 카드를 붙였는데 글자가 가려짐」 — x 2~46px).
   ⚠️ 상자가 아니라 «글자» 자리를 Range 로 재야 한다 — 상자는 폭이 넓어 과장된다.
   ⚠️ elementFromPoint 로는 못 본다: 그 손잡이가 pointer-events 를 안 먹는 순간을 건너뛴다.
   ⚠️ 기존 요소(밴드 막대 라벨)는 원래부터 그 띠에 걸쳐 있다 — «내 변경이 만든 것» 만 본다. */
console.log('\n②-2 왼쪽 «메뉴» 손잡이가 새로 넣은 글자를 가리지 않는가');
const ovl = await evalJs(`(function(){
  var tab=document.getElementById('mg-drawer-tab');
  var t=tab?tab.getBoundingClientRect():null;
  function textLeft(sel){ var e=document.querySelector(sel); if(!e) return null;
    var rg=document.createRange(); rg.selectNodeContents(e);
    var rs=rg.getClientRects(), min=1e9;
    for(var i=0;i<rs.length;i++) if(rs[i].width>0) min=Math.min(min,rs[i].left);
    return min===1e9?null:Math.round(min); }
  return { tabRight: t?Math.round(t.right):null,
           opt: textLeft('#ai-review .rvo.ok'), why: textLeft('#ai-review .rvw'),
           sent: textLeft('#ai-review .rvs'), qt: textLeft('#ai-review .qt') };
})()`);
ok(ovl && ovl.tabRight != null, '전제: 메뉴 손잡이를 찾았다 (없으면 이 절은 헛돈다)', ovl && JSON.stringify(ovl));
if (ovl && ovl.tabRight != null) {
  for (const [k, label] of [['opt','보기 글자'],['why','해설 글자'],['sent','완성 문장'],['qt','문제 글자']]) {
    const x = ovl[k];
    ok(x != null && x > ovl.tabRight,
       `${label}가 메뉴 손잡이(x≤${ovl.tabRight}) 오른쪽에 있다 (x=${x})`, `x=${x}`);
  }
}

console.log('\n③ 가로 넘침 — 좁은 폰(360×640)');
await openAndFinish(360, 640);
const overflow = await evalJs(`document.documentElement.scrollWidth - window.innerWidth`);
ok(overflow <= 0, `문서가 가로로 안 넘친다 (넘침 ${overflow}px)`);
const boxOver = await evalJs(`(function(){
  var bad=0, ns=document.querySelectorAll('#ai-review .rvq, #ai-review .rvo');
  for (var i=0;i<ns.length;i++){ if (ns[i].scrollWidth - ns[i].clientWidth > 1) bad++; }
  return bad;
})()`);
ok(boxOver === 0, `해설 카드 안에서도 글자가 안 잘린다 (넘친 칸 ${boxOver})`);

console.log('\n④ 글자가 «읽히는가» — 반투명을 합성해 대비를 잰다');
/* CLAUDE.md: backgroundColor 하나로는 못 잰다. 불투명 층을 만날 때까지 모아 아래에서 위로 합성. */
const CONTRAST = `(function(){
  function parse(c){ var m=/rgba?\\(([^)]+)\\)/.exec(c); if(!m) return null;
    var p=m[1].split(',').map(function(x){return parseFloat(x);});
    return { r:p[0], g:p[1], b:p[2], a: p.length>3 ? p[3] : 1 }; }
  function bgOf(el){
    var layers=[];
    for (var n=el; n; n=n.parentElement){
      var cs=getComputedStyle(n), c=parse(cs.backgroundColor);
      if (c && c.a>0) { layers.push(c); if (c.a>=1) break; }
      var img=cs.backgroundImage;
      if (img && img!=='none'){ var g=parse(img); if (g && g.a>0){ layers.push(g); if(g.a>=1) break; } }
    }
    layers.push({r:255,g:255,b:255,a:1});
    var out=layers[layers.length-1];
    for (var i=layers.length-2;i>=0;i--){ var t=layers[i];
      out={ r:t.r*t.a+out.r*(1-t.a), g:t.g*t.a+out.g*(1-t.a), b:t.b*t.a+out.b*(1-t.a), a:1 }; }
    return out;
  }
  function lum(c){ var f=function(v){ v/=255; return v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4); };
    return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b); }
  function ratio(el){
    var cs=getComputedStyle(el), fg=parse(cs.color); if(!fg) return null;
    var op=1; for(var n=el;n;n=n.parentElement){ var o=parseFloat(getComputedStyle(n).opacity); if(!isNaN(o)) op*=o; }
    var bg=bgOf(el); fg.a=(fg.a==null?1:fg.a)*op;
    var comp={ r:fg.r*fg.a+bg.r*(1-fg.a), g:fg.g*fg.a+bg.g*(1-fg.a), b:fg.b*fg.a+bg.b*(1-fg.a) };
    var L1=lum(comp), L2=lum(bg);
    var hi=Math.max(L1,L2), lo=Math.min(L1,L2);
    return { ratio:(hi+0.05)/(lo+0.05), size:parseFloat(cs.fontSize), weight:cs.fontWeight };
  }
  var out={};
  var pick={ ok:'#ai-review .rvo.ok', no:'#ai-review .rvo.no', why:'#ai-review .rvw',
             sent:'#ai-review .rvs', qt:'#ai-review .qt', tip:'#ai-review-tip' };
  for (var k in pick){ var e=document.querySelector(pick[k]); out[k]= e? ratio(e) : null; }
  return out;
})()`;
const cr = await evalJs(CONTRAST);
for (const [k, label] of [['ok','정답 보기(초록)'],['no','내 오답(빨강)'],['why','해설 글자'],['sent','완성 문장'],['qt','문제 글자'],['tip','위쪽 안내']]) {
  const v = cr && cr[k];
  if (!v) { ok(false, `${label} — 잴 요소를 못 찾음`); continue; }
  // 큰 글자(24px↑ 또는 18.66px↑ 굵게)는 3:1, 본문은 4.5:1
  const big = v.size >= 24 || (v.size >= 18.66 && Number(v.weight) >= 700);
  const need = big ? 3 : 4.5;
  ok(v.ratio >= need, `${label} 대비 ${v.ratio.toFixed(2)} ≥ ${need} (${v.size}px)`, `실측 ${v.ratio.toFixed(2)}`);
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
try { proc.kill(); } catch {}
process.exit(fail > 0 ? 1 : 0);
