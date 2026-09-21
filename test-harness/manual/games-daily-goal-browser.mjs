#!/usr/bin/env node
/**
 * games-daily-goal-browser.mjs — 게임 허브 «오늘 몫» 줄 브라우저 검사 (2026-09-21)
 *
 * ⚠️ 자동으로 안 돕니다(manual/ 규약). 사람이 부릅니다:
 *
 *   cd cloudflare-deploy/public && python3 -m http.server 8941 &
 *   /opt/pw-browsers/chromium-1194/chrome-linux/chrome --headless=new \
 *     --remote-debugging-port=9941 --no-sandbox --disable-dev-shm-usage \
 *     --use-gl=angle --use-angle=swiftshader about:blank &
 *   node test-harness/manual/games-daily-goal-browser.mjs
 *
 * [왜] 자동 하니스는 «무슨 값이 나오는가» 까지입니다. «화면에 그려지는가 · 가려지지
 *   않았는가 · 작은 폰에서 손이 닿는가 · 글자가 읽히는가» 는 원리상 못 봅니다.
 *
 * 🔴 「보인다」·「눌린다」·「첫 화면 안에 있다」는 전부 다른 값입니다 — 셋 다 잽니다.
 * 🔴 상자를 위에 더하면 **아래 «누를 것» 이 밀립니다** — «내가 남을 덮는가» 를 짝으로 봅니다.
 * ⚠️ 대비는 배경이 반투명·그라데이션이라 CSS 합성으로 못 잽니다 — 글자를 잠깐 투명하게
 *   만들고 **그 자리를 찍어** 진짜 배경을 읽습니다(CLAUDE.md 2장).
 * ⚠️ 회차 사이에 localStorage 가 넘어가면 다음 폭이 «옛 상태» 로 시작합니다 — 폭마다 지웁니다.
 */
import zlib from 'node:zlib';
const PORT = Number(process.env.GDG_PORT || 8941);
const CDP  = Number(process.env.GDG_CDP  || 9941);
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

try { const r = await fetch(BASE + '/student-games.html', { method: 'HEAD' }); if (!r.ok) throw 0; }
catch { console.log('⏭  games-daily-goal-browser — 건너뜀 (정적서버 ' + BASE + ' 가 안 떠 있습니다)'); process.exit(0); }

let list;
for (let i = 0; i < 20; i++) {
  try { list = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json(); if (list?.length) break; } catch {}
  await sleep(500);
}
if (!list?.length) { console.log('⏭  games-daily-goal-browser — 건너뜀 (크로미움이 안 떠 있습니다)'); process.exit(0); }

const tgt = list.find(t => t.type === 'page') || list[0];
const ws = new WebSocket(tgt.webSocketDebuggerUrl);
let id = 0; const waits = new Map();
await new Promise(r => { ws.onopen = r; });
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && waits.has(m.id)) { waits.get(m.id)(m); waits.delete(m.id); } };
const cmd = (method, params = {}) => new Promise(r => { const i = ++id; waits.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async expr => {
  const r = await cmd('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return { __err: String(r.result.exceptionDetails.exception?.description || '') };
  return r.result?.result?.value;
};
await cmd('Page.enable'); await cmd('Runtime.enable');
await cmd('Network.setCacheDisabled', { cacheDisabled: true });
await cmd('Network.setBypassServiceWorker', { bypass: true });

const P = [], F = [];
const t = (name, cond, got) => { (cond ? P : F).push(name + (cond ? '' : `  →  ${JSON.stringify(got)}`)); };

/* 서버를 스텁한다 — 이 검사가 보는 것은 «화면» 이지 D1 이 아니다.
   ⚠️ IIFE 로 감싼다: 최상위 const 를 쓰면 회차가 쌓일 때 재선언으로 죽는다(CLAUDE.md 2장). */
/* ⚠️ 서버 정본(today-plan.ts gameGoalLine)이 내려주는 모양 그대로 흉내 낸다 —
   화면은 문장을 «고르기만» 하므로 여기서 문장까지 줘야 실제와 같다. */
const mkLine = (goal, items, plays) => {
  if (items >= goal && goal > 0) return { state:'hit', goal, items, plays, pct:100,
    ko:'🎉 오늘 몫 끝! · 더 해도 좋아요', en:'🎉 Done for today · keep going if you like' };
  if (items > 0) return { state:'counted', goal, items, plays,
    pct: Math.min(100, Math.round(items/goal*100)),
    ko:`${items} / ${goal}문제 · ${goal-items}문제 더!`, en:`${items} / ${goal} questions · ${goal-items} to go!` };
  if (plays > 0) return { state:'uncounted', goal, items:0, plays, pct:-1,
    ko:`오늘 ${plays}판 했어요 👍`, en:`You played ${plays} today 👍` };
  return { state:'none', goal, items:0, plays:0, pct:0,
    ko:`0 / ${goal}문제 · ${goal}문제 더!`, en:`0 / ${goal} questions · ${goal} to go!` };
};
const stub = (goal, items, plays) => `(function(){
  try{ localStorage.setItem('mangoi_logged_user', JSON.stringify({uid:'browsertest',name:'검사'})); }catch(e){}
  var of_ = window.fetch;
  window.fetch = function(u, o){
    if (String(u).indexOf('/api/student/today') >= 0) {
      window.__todayCalls = (window.__todayCalls || 0) + 1;
      return Promise.resolve(new Response(JSON.stringify({ok:true, plan:{
        gameGoal:${goal}, gameItems:${items},
        gameLine:${JSON.stringify(mkLine(goal, items, plays === undefined ? 0 : plays))},
        steps:[], week:[]}}), {status:200, headers:{'content-type':'application/json'}}));
    }
    return of_.apply(this, arguments);
  };
})()`;

/* 🪤 등록한 스크립트는 «쌓입니다» — 안 지우면 1회차 스텁이 끝까지 살아
   «비로그인» 회차에도 로그인을 심고 fetch 를 가로챕니다(2026-09-21 실측으로 밟음).
   회차마다 지운 뒤 새로 답니다. */
let stubId = null;
async function openHub(w, h, goal, items, opts, plays) {
  await cmd('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await cmd('Page.navigate', { url: 'about:blank' }); await sleep(120);
  /* 앞 회차가 심어 둔 로그인·언어가 넘어가면 다음 폭이 «옛 상태» 로 시작한다.
     ⚠️ about:blank 에서 localStorage.clear() 를 부르면 «그 오리진» 을 지울 뿐이다 —
        검사 대상 오리진은 그대로 남는다(2026-09-21 실측으로 밟음). CDP 로 지운다. */
  await cmd('Storage.clearDataForOrigin', { origin: BASE, storageTypes: 'local_storage' });
  if (stubId) { await cmd('Page.removeScriptToEvaluateOnNewDocument', { identifier: stubId }); stubId = null; }
  if (!opts?.anon) {
    const r = await cmd('Page.addScriptToEvaluateOnNewDocument', { source: stub(goal, items, plays) });
    stubId = r.result?.identifier || null;
  }
  await cmd('Page.navigate', { url: `${BASE}/student-games.html?_nc=${Date.now()}${Math.random()}` });
  for (let i = 0; i < 60; i++) {
    await sleep(200);
    if (await evaluate("!!document.querySelector('#hub-menu .hub-panel')")) break;
  }
  await sleep(700);   // defer + fetch 한 바퀴
}

const M = `(function(){
  var b=document.getElementById('gdg-box');
  if(!b) return JSON.stringify({exists:false});
  var cs=getComputedStyle(b), r=b.getBoundingClientRect();
  var tEl=b.querySelector('.gdg-t'), fill=b.querySelector('.gdg-bar > i');
  var fr=fill?fill.getBoundingClientRect():null;
  var cx=Math.round(r.left+r.width/2), cy=Math.round(r.top+r.height/2);
  var top=document.elementFromPoint(cx,cy);
  return JSON.stringify({
    exists:true, display:cs.display, vis:cs.visibility, w:Math.round(r.width), h:Math.round(r.height),
    top:Math.round(r.top), bottom:Math.round(r.bottom),
    text:(tEl?tEl.textContent:''), hit:b.className.indexOf('gdg-hit')>=0,
    fillW:fr?Math.round(fr.width*10)/10:null, fillH:fr?Math.round(fr.height*10)/10:null,
    barW:fill&&fill.parentElement?Math.round(fill.parentElement.getBoundingClientRect().width):0,
    coversMe: top ? b.contains(top) : false,
    innerH: window.innerHeight
  });
})()`;

/* ── ① 로그인 학생 · 미달(2/5) ── */
await openHub(1280, 900, 5, 2);
let d = JSON.parse(await evaluate(M));
t('① 줄이 실제로 그려진다', d.exists === true, d);
t('① 화면에 보인다 (display·높이)', d.exists && d.display !== 'none' && d.h > 0, d);
t('① 남은 개수를 말한다', /2 \/ 5문제/.test(d.text || '') && /3문제 더/.test(d.text || ''), d.text);
/* 🔴 채움이 span 이면 브라우저가 글자로 봐 width 가 통째로 무시된다 — 실제 px 를 잰다 */
t('① 막대 채움이 실제로 그려진다 (폭 0 아님)', d.fillW > 0 && d.fillH > 0, d);
t('① 채움 폭이 진행도를 따라간다 (2/5 ≈ 40%)',
  d.barW > 0 && Math.abs(d.fillW / d.barW - 0.4) < 0.06, { fillW: d.fillW, barW: d.barW });
t('① 가려지지 않았다 (맨 위가 나)', d.coversMe === true, d);

/* ── ②  «내가 남을 덮는가» (짝) — 위에 상자를 더하면 아래 조작이 밀린다 ── */
const BELOW = `(function(){
  var out=[], sel=['#coin-wallet','#btn-spin','#btn-shop','#lang-pick .lg','#site-lang-btn'];
  sel.forEach(function(s){
    var el=document.querySelector(s); if(!el) return;
    var r=el.getBoundingClientRect(); if(!(r.width>0&&r.height>0)) { out.push([s,'hidden']); return; }
    var top=document.elementFromPoint(Math.round(r.left+r.width/2), Math.round(r.top+r.height/2));
    var box=document.getElementById('gdg-box');
    out.push([s, top && el.contains(top) ? 'ok' : (box && box.contains(top) ? 'COVERED_BY_GDG' : 'other')]);
  });
  return JSON.stringify(out);
})()`;
let below = JSON.parse(await evaluate(BELOW));
t('② 아래 조작을 내가 덮지 않는다 (짝)',
  below.every(([, v]) => v !== 'COVERED_BY_GDG'), below);
t('② 전제: 아래 조작을 실제로 찾았다', below.length >= 3, below);

/* ── ③ 달성(5/5) ── */
await openHub(1280, 900, 5, 5);
d = JSON.parse(await evaluate(M));
t('③ 채우면 «끝» 이라고 말한다', /오늘 몫 끝/.test(d.text || ''), d.text);
t('③ 달성 표시가 붙는다 (색이 바뀐다)', d.hit === true, d);
t('③ 막대가 가득 찬다', d.barW > 0 && d.fillW / d.barW > 0.98, { fillW: d.fillW, barW: d.barW });

/* ── ④ 0/5 — 빈 막대를 «측정 안 됨» 으로 읽지 않게 글자가 말한다 ── */
await openHub(1280, 900, 5, 0);
d = JSON.parse(await evaluate(M));
t('④ 0 도 «0 / 5문제» 라고 분명히 말한다', /0 \/ 5문제/.test(d.text || ''), d.text);
t('④ 0 이면 채움이 비어 있다', d.fillW === 0, d);

/* ── ④-b 🔴 판은 했는데 문제 수가 0 — «0문제» 라고 말하면 거짓말이다 ── */
await openHub(1280, 900, 5, 0, null, 3);
d = JSON.parse(await evaluate(M));
t('④-b 못 센 날엔 «0 / 5문제» 라고 «안» 한다', !/0 \/ 5문제/.test(d.text || ''), d.text);
t('④-b 그때는 판 수를 사실대로 말한다', /3판/.test(d.text || ''), d.text);
/* 🔴 0% 막대를 그리면 «아무것도 안 했다» 로 읽힌다 */
t('④-b 그때는 막대를 아예 안 그린다', d.fillW === null && d.barW === 0, d);
t('④-b 그래도 줄은 보인다 (짝)', d.exists && d.h > 0, d);

/* ── ⑤ 비로그인 — 아무것도 안 그리고 자리도 안 먹는다 (짝) ── */
await openHub(1280, 900, 5, 2, { anon: true });
d = JSON.parse(await evaluate(M));
t('⑤ 비로그인이면 안 그린다 (짝)', d.exists === false || d.h === 0, d);
/* 🔴 전제 — 스텁이 정말 꺼졌는지 확인한다. 안 꺼졌으면 이 절은 «확인 안 함» 이다 */
const anonOk = await evaluate("(function(){try{return !localStorage.getItem('mangoi_logged_user')}catch(e){return false}})()");
t('⑤ 전제: 이 회차는 진짜 비로그인이다', anonOk === true, anonOk);

/* ── ⑥ 작은 폰(360×640) — 첫 화면 안에 있고, 아래 조작이 스크롤 밖으로 안 밀렸나 ── */
await openHub(360, 640, 5, 2);
d = JSON.parse(await evaluate(M));
t('⑥ 작은 폰에서도 보인다', d.exists && d.h > 0, d);
t('⑥ 첫 화면 안에 있다', d.top >= 0 && d.top < d.innerH, { top: d.top, innerH: d.innerH });
t('⑥ 글자가 안 쪼개진다 (두 줄 이하)', d.h <= 90, d);
const PUSH = `(function(){
  var el=document.querySelector('#btn-spin')||document.querySelector('#coin-wallet');
  if(!el) return JSON.stringify({found:false});
  var r=el.getBoundingClientRect();
  return JSON.stringify({found:true, top:Math.round(r.top), innerH:window.innerHeight});
})()`;
let push = JSON.parse(await evaluate(PUSH));
t('⑥ 아래 첫 조작이 여전히 첫 화면 안에 있다 (밀려나지 않음)',
  push.found && push.top < push.innerH, push);

/* ── ⑦ 대비 — 글자를 잠깐 투명하게 만들고 «그 자리» 를 찍어 진짜 배경을 읽는다 ── */
async function shotPx(x, y) {
  const r = await cmd('Page.captureScreenshot', { format: 'png', clip: { x, y, width: 6, height: 6, scale: 1 } });
  const buf = Buffer.from(r.result.data, 'base64');
  let i = 8, w = 0, h = 0, bit = 0, ct = 0; const idat = [];
  while (i < buf.length) {
    const len = buf.readUInt32BE(i); const typ = buf.toString('ascii', i + 4, i + 8);
    if (typ === 'IHDR') { w = buf.readUInt32BE(i + 8); h = buf.readUInt32BE(i + 12); bit = buf[i + 16]; ct = buf[i + 17]; }
    if (typ === 'IDAT') idat.push(buf.slice(i + 8, i + 8 + len));
    i += 12 + len;
  }
  if (bit !== 8 || (ct !== 6 && ct !== 2)) return null;
  const bpp = ct === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp; const out = Buffer.alloc(h * stride);
  for (let y2 = 0; y2 < h; y2++) {
    const ft = raw[y2 * (stride + 1)]; const row = raw.slice(y2 * (stride + 1) + 1, (y2 + 1) * (stride + 1));
    for (let x2 = 0; x2 < stride; x2++) {
      const a = x2 >= bpp ? out[y2 * stride + x2 - bpp] : 0;
      const b = y2 > 0 ? out[(y2 - 1) * stride + x2] : 0;
      const c = (x2 >= bpp && y2 > 0) ? out[(y2 - 1) * stride + x2 - bpp] : 0;
      let v = row[x2];
      if (ft === 1) v += a; else if (ft === 2) v += b; else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      out[y2 * stride + x2] = v & 255;
    }
  }
  const mid = (Math.floor(h / 2) * stride) + Math.floor(w / 2) * bpp;
  return [out[mid], out[mid + 1], out[mid + 2]];
}
const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };

await openHub(1280, 900, 5, 2);
const pos = JSON.parse(await evaluate(`(function(){var e=document.querySelector('.gdg-t');if(!e)return 'null';
  var r=e.getBoundingClientRect();return JSON.stringify({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)});})()`));
if (pos) {
  const fg = JSON.parse(await evaluate(`(function(){var c=getComputedStyle(document.querySelector('.gdg-t')).color;
    var m=c.match(/\\d+/g);return JSON.stringify(m?m.slice(0,3).map(Number):null);})()`));
  await evaluate("document.querySelector('.gdg-t').style.color='transparent'");
  await sleep(150);
  const bg = await shotPx(pos.x - 3, pos.y - 3);
  await evaluate("document.querySelector('.gdg-t').style.color=''");
  const cr = (fg && bg) ? ratio(fg, bg) : null;
  t('⑦ 글자가 읽힌다 (대비 4.5 이상)', cr !== null && cr >= 4.5,
    { fg, bg, ratio: cr ? Math.round(cr * 100) / 100 : null });
} else { t('⑦ 글자가 읽힌다 (대비 4.5 이상)', false, '글자를 못 찾음'); }

/* ── ⑧ 🌐 를 누르면 글자가 실제로 바뀌는가 (배선이 죽어 있지 않은가) ── */
await openHub(1280, 900, 5, 2);
const before = JSON.parse(await evaluate(`JSON.stringify({txt:(document.querySelector('.gdg-t')||{}).textContent})`));
await evaluate(`(function(){try{localStorage.setItem('mangoi_lang','en')}catch(e){}
  window.dispatchEvent(new CustomEvent('mangoi:lang-changed'));
  document.dispatchEvent(new CustomEvent('mangoi:lang-changed'));})()`);
await sleep(600);
const after = JSON.parse(await evaluate(`JSON.stringify({txt:(document.querySelector('.gdg-t')||{}).textContent})`));
t('⑧ 🌐 를 누르면 영어로 바뀐다', /questions/.test(after.txt || ''), { before: before.txt, after: after.txt });
/* 🔴 짝 — 바뀌면서 막대가 사라지면 안 된다(i18n 엔진이 textContent 를 갈아끼우는 함정) */
d = JSON.parse(await evaluate(M));
t('⑧ 바뀐 뒤에도 막대가 살아 있다 (짝)', d.fillW > 0, d);
/* 🔴 🌐 는 «다시 그리기» 여야 한다 — 서버를 또 부르면 토글 한 번에 D1 조회 20여 회가
   두 번 나간다(window·document 양쪽에 걸려 있어 최대 2회). today-page.js 와 같은 모양. */
const calls = await evaluate('window.__todayCalls || 0');
t('⑧ 🌐 토글이 서버를 다시 부르지 않는다 (캐시에서 다시 그린다)', calls === 1, { todayCalls: calls });
await evaluate("try{localStorage.removeItem('mangoi_lang')}catch(e){}");

console.log('\n── 게임 «오늘 몫» 브라우저 검사 ──');
P.forEach(s => console.log('  ✅ ' + s));
F.forEach(s => console.log('  ❌ ' + s));
console.log(`\n결과: PASS ${P.length} / FAIL ${F.length}`);
ws.close();
process.exit(F.length ? 1 : 0);
