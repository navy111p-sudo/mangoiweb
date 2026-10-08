// 🤖 A.i 선생님 수업(/ai-class.html) — 브라우저 하니스 (CDP 직접, 라이브러리 없음) · 2026-10-07
// ⚠️ 자동으로 안 돕니다(manual/) — 사람이 부릅니다:
//      REPS=3 node test-harness/manual/ai-class-browser.mjs        (VPF=pc 처럼 화면 하나만 골라도 됨)
// 화면 9종 × 레슨 4개(그림 있는 BTS · SIU BASIC · SIU ADVANCE + 문장만) × (자동 데모 + 원숭이 클릭) 반복,
// 대답 고르기·속도·자동 말하기·낱말 찾기·카메라·이름·감탄사, 실서비스 전용(마이크 기본 켬·그림 깨짐→문장·그림 주소).
// 교재 API 는 가짜로 흉내 냅니다 — 원본 슬라이드는 저장소에 없으므로 작은 PNG 를 돌려줍니다(그려지는지만 봄).
// 실패하면 종료코드 1.
import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const REPS = +(process.env.REPS || 10);
const PORT = 8800 + Math.floor(Math.random() * 500);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.webp': 'image/webp', '.json': 'application/json', '.png': 'image/png' };
const PUB = process.env.PUB || path.join(DIR, '..', '..', 'cloudflare-deploy', 'public');
const PROF = path.join(os.tmpdir(), 'ai-class-browser-' + process.pid);
const CAT = JSON.parse(fs.readFileSync(path.join(PUB, 'data', 'ai-class-catalog.json'), 'utf8'));
// 그림이 «있는» 권 — 원본 슬라이드는 저장소에 없으므로 가짜 그림(작은 PNG)을 돌려준다.
// 나머지 권은 빈 목록 → 문장만으로 그려지는지 본다.
const IMG_BOOKS = ['BTS 1 001 (Welcome to school)', 'BTS 1 002 (Welcome to school)', 'BTS 7 001 (Head and face)', 'NEW SIU BASIC 001 - A talk with you', 'NEW SIU ADVANCE 002 - Job interview'];
const NAMES = {}; let nextId = 47000;
for (const c of CAT) if (IMG_BOOKS.includes(c.book)) {
  const d = JSON.parse(fs.readFileSync(path.join(PUB, 'data', 'tb-say', c.file + '.json'), 'utf8'));
  for (const k of Object.keys(d)) if (k.startsWith('[' + c.book + '] ' + c.part + ' /')) NAMES[k] = ++nextId;
}
const IMG = JSON.stringify(CAT.map((u, i) => IMG_BOOKS.includes(u.book) ? i : -1).filter(i => i >= 0));
// 4x3 PNG (회색) — 그림이 그려지는지(naturalWidth>0)만 본다
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAEklEQVR4nGNgYGD4z8DAwMDAAAAOAAHqCAPXAAAAAElFTkSuQmCC', 'base64');
let apiCalls = 0, rawCalls = 0;
const srv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  if (u.pathname === '/api/textbook-files') {
    apiCalls++; const book = u.searchParams.get('book');
    const items = Object.entries(NAMES).filter(([k]) => k.startsWith('[' + book + ']')).map(([k, id]) => ({ id, name: k, url: '/api/textbook-files/' + id + '/raw' }));
    r.writeHead(200, { 'Content-Type': 'application/json' }); return r.end(JSON.stringify({ ok: true, items }));
  }
  const raw = /^\/api\/textbook-files\/(\d+)\/raw$/.exec(u.pathname);
  if (raw) { rawCalls++; if (+raw[1] < 47000) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': 'image/png' }); return r.end(PNG); }
  const f = decodeURIComponent(u.pathname);
  const fp = path.join(PUB, f);
  if (!fp.startsWith(PUB) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || (path.extname(fp) === '.css' ? 'text/css' : 'text/plain'), 'Cache-Control': 'no-store' }); r.end(fs.readFileSync(fp));
}).listen(PORT);


const chrome = spawn('/opt/pw-browsers/chromium-1194/chrome-linux/chrome', ['--headless=new', '--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--disable-gpu', '--remote-debugging-port=' + (PORT + 1000), '--user-data-dir=' + PROF, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pend = new Map(); const errors = [];
async function connect() {
  for (let i = 0; i < 50; i++) { try { const l = await (await fetch(`http://127.0.0.1:${PORT + 1000}/json/list`)).json(); const t = l.find(x => x.type === 'page'); if (t) return t.webSocketDebuggerUrl; } catch (e) { } await sleep(200); }
  throw new Error('no chrome');
}
function send(method, params = {}) { return new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); }); }
async function ev(expr) { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval error'); return r.result.value; }

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; if (fails.length < 50) fails.push(m); } }

const VPS = [{ n: 'pc 1440x900', w: 1440, h: 900, m: false }, { n: 'laptop 1280x720', w: 1280, h: 720, m: false }, { n: 'tablet 1024x768', w: 1024, h: 768, m: false }, { n: 'phone 390x844', w: 390, h: 844, m: true }, { n: 'phone-land 844x390', w: 844, h: 390, m: true },
  { n: 'small 360x640', w: 360, h: 640, m: true }, { n: 'bigland 915x412', w: 915, h: 412, m: true }, { n: 'tabletp 768x1024', w: 768, h: 1024, m: true }, { n: 'fhd 1920x1080', w: 1920, h: 1080, m: false }].filter(v => !process.env.VPF || v.n.includes(process.env.VPF));

// 페이지 안에서 쓰는 측정 도구
const PROBE = `(function(){
  function vis(el){ const r=el.getBoundingClientRect(); const W=innerWidth,H=innerHeight; const w=Math.max(0,Math.min(r.right,W)-Math.max(r.left,0)), h=Math.max(0,Math.min(r.bottom,H)-Math.max(r.top,0)); return (r.width*r.height)? (w*h)/(r.width*r.height):0; }
  function top(el){ const r=el.getBoundingClientRect(); const x=r.left+r.width/2,y=r.top+r.height/2; const t=document.elementFromPoint(x,y); return !!t && (t===el||el.contains(t)); }
  window.__probe={vis,top};
  window.__wait=()=>new Promise(r=>{const t=()=>{const a=window.__aiClass;if(a&&!a.loading&&a.state)r();else setTimeout(t,20)};t()});
})()`;

async function runOne(vp, li, mode, seed) { seed += +(process.env.SEED_BASE || 0);
  await send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: vp.m });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/ai-class.html?r=${Date.now()}#fast` });
  for (let i = 0; i < 200; i++) { await sleep(60); try { if (await ev('!!(window.__aiClass && document.getElementById("lessonSel") && document.getElementById("lessonSel").options.length && !document.getElementById("startAuto").disabled)')) break; } catch (e) { } }
  await ev(PROBE);
  const tag = `${vp.n}/L${li}/${mode}#${seed}`;
  // 레슨 고르기: 0~2 = 실제 그림 있는 BTS·SIU BASIC·SIU ADVANCE, 3 = 그림 없는 레슨(무작위)
  const pickIdx = await ev(`(()=>{const IMG=${IMG};const o=[...document.getElementById('lessonSel').options];const img=o.filter(x=>IMG.includes(+x.value));
    const f=(re)=>{const x=img.find(y=>re.test(y.textContent));return x?x.value:null};
    const plain=o.filter(x=>!IMG.includes(+x.value));
    return [f(/^BTS/),f(/^SIU BASIC/),f(/^SIU ADV/),plain[(${seed}*97+${li}*31)%plain.length].value][${li}];})()`);
  ok(pickIdx != null, `${tag}: no lesson with real slides for role ${li}`);
  await ev(`(async()=>{const s=document.getElementById('lessonSel');s.value='${pickIdx}';s.dispatchEvent(new Event('change'));await __wait();})()`);
  if (li < 3) {
    for (let i = 0; i < 40; i++) { if (await ev(`(i=>!i.hidden&&i.complete&&i.naturalWidth>0)(document.getElementById('slideImg'))`)) break; await sleep(50); }
    const im = await ev(`(i=>({hidden:i.hidden,w:i.naturalWidth,rw:i.getBoundingClientRect().width,rh:i.getBoundingClientRect().height,bodyHidden:document.getElementById('bbody').hidden}))(document.getElementById('slideImg'))`);
    ok(!im.hidden && im.w > 0 && im.bodyHidden, `${tag}: real slide image not drawn ${JSON.stringify(im)}`);
    ok(im.rw >= 150 && im.rh >= 110, `${tag}: slide image too small ${im.rw}x${im.rh}`);
  }
  ok(await ev('document.documentElement.scrollWidth <= innerWidth'), `${tag}: horizontal overflow ${await ev('document.documentElement.scrollWidth')}`);
  // 교재와 선생님이 한 화면에 함께 — 교실을 화면 맨 위에 맞췄을 때 둘 다 보이는가
  await ev(`document.getElementById('book').scrollIntoView({block:'start'})`);
  await sleep(30);
  const together = await ev(`(()=>{const b=document.getElementById('book'),t=document.getElementById('tTile');return {b:__probe.vis(b),t:__probe.vis(t),bh:b.getBoundingClientRect().height,th:t.getBoundingClientRect().height}})()`);
  ok(together.b >= 0.9 && together.t >= 0.9, `${tag}: textbook+teacher not on screen together (book ${together.b.toFixed(2)} teacher ${together.t.toFixed(2)})`);
  const lr = await ev(`(()=>{const r=id=>document.getElementById(id).getBoundingClientRect();const b=r('book'),t=r('tTile'),s=r('sTile');return {bookLeft:b.right<=t.left+1&&b.right<=s.left+1,teacherAbove:t.bottom<=s.top+1,sameSide:Math.abs(t.left-s.left)<2,studentVis:__probe.vis(document.getElementById('sTile'))}})()`);
  ok(lr.bookLeft && lr.teacherAbove && lr.sameSide, `${tag}: layout not «book left · teacher+student right» ${JSON.stringify(lr)}`);
  ok(lr.studentVis >= 0.9, `${tag}: student tile not on screen with textbook (${lr.studentVis.toFixed(2)})`);
  ok(together.bh >= 150 && together.th >= 80, `${tag}: textbook/teacher too small (${together.bh}/${together.th})`);
  // 시작
  // 캡션은 아주 빨리 바뀔 수 있으니(#fast) 바뀔 때마다 기록해 둔다 — 띄엄띄엄 들여다보면 놓친다
  await ev(`(()=>{window.__caps=[];const k=document.querySelector('#cap .k');new MutationObserver(()=>window.__caps.push(k.textContent)).observe(k,{childList:true,characterData:true,subtree:true});window.__stg=[];const sb=document.getElementById('stageBar');new MutationObserver(()=>{const n=sb.querySelector('li.now');if(n)window.__stg.push(+n.dataset.n);}).observe(sb,{attributes:true,subtree:true,attributeFilter:['class']});})()`);
  await ev(`document.getElementById('${mode === 'auto' ? 'startAuto' : 'startBtn'}').click()`);
  const startT = Date.now(); let actions = 0, rnd = seed * 9301 + li * 49297;
  const R = () => (rnd = (rnd * 1664525 + 1013904223) % 4294967296) / 4294967296;
  let finished = false, lastSig = '', lastChange = Date.now(), stalled = false, stageSeen = [], stageBack = false, capWarm = false, capQa = false, capFind = false, capSwap = false;
  while (Date.now() - startT < 60000) {
    // 쌓인 단계 변화와 «지금» 단계를 한 번에 읽는다 — 따로 읽으면 그 사이 변화가 끼어 5>4>5 처럼 가짜로 뒤로 간 것으로 보인다
    const sc = await ev(`(()=>{const n=document.querySelector('#stageBar li.now');const k=document.querySelector('#cap .k').textContent;return {stg:window.__stg.splice(0),n:n?+n.dataset.n:0,k,vis:n?__probe.vis(n):0,done:document.querySelectorAll('#stageBar li.done').length}})()`);
    for (const n of sc.stg) { if (stageSeen.length && n < stageSeen[stageSeen.length - 1]) stageBack = true; if (stageSeen[stageSeen.length - 1] !== n) stageSeen.push(n); }
    if (sc.n) { if (stageSeen.length && sc.n < stageSeen[stageSeen.length - 1]) stageBack = true; if (stageSeen[stageSeen.length - 1] !== sc.n) stageSeen.push(sc.n); if (sc.done !== sc.n - 1) ok(false, `${tag}: stage ${sc.n} but done chips ${sc.done}`); }
    { const cs = (await ev(`window.__caps.splice(0).join('\\n')`)) + '\n' + sc.k; if (/지난 시간/.test(cs)) capWarm = true; if (/묻고 답하기/.test(cs)) capQa = true; if (/낱말 찾기/.test(cs)) capFind = true; if (/역할 바꾸기/.test(cs)) capSwap = true; }
    if (/지난 시간/.test(sc.k)) capWarm = true; if (/묻고 답하기/.test(sc.k)) capQa = true; if (/낱말 찾기/.test(sc.k)) capFind = true; if (/역할 바꾸기/.test(sc.k)) capSwap = true;
    const sig = await ev('(s=>[s.phase,s.i,s.stars,s.tries,s.attempts].join(","))(window.__aiClass.state)');
    const ph = sig.split(',')[0];
    if (ph === 'done') { finished = true; break; }
    if (sig !== lastSig) { lastSig = sig; lastChange = Date.now(); } else if (Date.now() - lastChange > 5000) { stalled = true; ok(false, `${tag}: stalled 5s at ${sig}`); break; }
    if (mode === 'monkey' && actions < 300) {
      actions++;
      const ids = ['micBtn', 'againBtn', 'slowBtn', 'skipBtn', 'prevPg', 'nextPg', 'followBtn', 'subBtn', 'sndBtn', 'camBtn', 'spdBtn', 'talkBtn', 'SIM_exact', 'SIM_half', 'SIM_quiet', 'SIM_type', 'LINE', 'CHOICE', 'CHOICE', 'CHIP', 'CHIP', 'KO', 'camDock'];
      const pick = ids[Math.floor(R() * ids.length)];
      await ev(`(()=>{const p='${pick}';
        if(p.startsWith('SIM_')){const m=p.slice(4);if(m==='type'){const i=document.getElementById('simInput');i.value='hello teacher';document.getElementById('simForm').requestSubmit();}else{const b=document.querySelector('[data-say="'+m+'"]');b&&b.click();}return;}
        if(p==='CHOICE'){const cs=document.querySelectorAll('#simChoices .choice');cs.length&&cs[Math.floor(${R()}*cs.length)].click();return;}
        if(p==='LINE'){const ls=document.querySelectorAll('.bl');ls.length&&ls[Math.floor(${R()}*ls.length)].click();return;}
        if(p==='KO'){const ks=document.querySelectorAll('.ko');ks.length&&ks[Math.floor(${R()}*ks.length)].click();return;}
        if(p==='CHIP'){const ls=document.querySelectorAll('#lineChips button');ls.length&&ls[Math.floor(${R()}*ls.length)].click();return;}
        const b=document.getElementById(p);if(b&&!b.disabled&&!b.hidden)b.click();})()`);
      await sleep(3);
      if (actions % 50 === 0) ok(await ev('document.documentElement.scrollWidth <= innerWidth'), `${tag}: overflow after ${actions} actions`);
    } else if (mode === 'monkey' && actions >= 300) {
      actions++; if (actions === 301) await ev(`document.getElementById('autoBtn').click()`);
      await sleep(20);
    } else await sleep(20);
  }
  if (!finished && !stalled) ok(false, `${tag}: class did not finish within 60s (stage ${stageSeen.join('>')}, ${actions} actions)`);
  ok(!stageBack, `${tag}: stage bar went backwards ${stageSeen.join('>')}`);
  if (finished) ok(stageSeen.includes(3) && stageSeen[stageSeen.length - 1] === 5, `${tag}: stage bar did not go to 5 (${stageSeen.join('>')})`);
  const plan5 = await ev(`(p=>({warm:p.some(s=>s.mode==='warm'),qa:p.some(s=>s.mode==='qa'),find:p.some(s=>s.t==='find'),swap:p.some(s=>s.mode==='swap')}))(window.__aiClass.state.plan)`);
  if (mode === 'auto' && plan5.find) ok(capFind, `${tag}: find game never shown in caption`);
  if (mode === 'auto' && plan5.swap) ok(capSwap, `${tag}: swap never shown in caption`);
  if (mode === 'auto' && plan5.warm) ok(capWarm, `${tag}: warm-up sentence never shown in caption`);
  if (mode === 'auto' && plan5.qa) ok(capQa, `${tag}: Q&A never shown in caption`);
  ok(await ev(`__probe.vis(document.getElementById('stageBar'))>0.9 || (document.getElementById('book').scrollIntoView({block:'center'}),true)`), `${tag}: stage bar hidden`);
  if (li < 3) { const n = await ev(`(window.__seenSlides||new Set()).size`); ok(n >= 2, `${tag}: slide image never changed during lesson (${n})`); }
  ok(await ev(`document.getElementById('capText').textContent.trim().length>1`), `${tag}: caption strip empty`);
  const fin = await ev(`(()=>{const s=window.__aiClass.state;return {ph:s.phase,stars:s.stars,targets:s.targets,endShown:!document.getElementById('endOv').hidden,review:document.getElementById('revTab').textContent}})()`);
  ok(fin.ph === 'done', `${tag}: lesson did not finish (${fin.ph})`);
  await sleep(10);
  ok(await ev(`!document.getElementById('endOv').hidden`), `${tag}: end screen not shown`);
  ok(fin.stars <= fin.targets + 3, `${tag}: stars overflow`);
  ok(/\(\d+\)/.test(fin.review), `${tag}: review tab not opened`);
  // 끝 화면의 「다시 하기」 버튼이 맨 위인가
  const rp = await ev(`(()=>{const b=document.getElementById('againLesson');const r=b.getBoundingClientRect();const t=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return {top:__probe.top(b),y:Math.round(r.top),h:Math.round(r.height),H:innerHeight,at:t?t.tagName+'#'+t.id+'.'+t.className:'none'}})()`);
  ok(rp.top, `${tag}: replay button covered ${JSON.stringify(rp)}`);
  return Date.now() - startT;
}


// 주고받기 점검: 학생이 «대답 버튼» 으로 답하면 선생님이 그 답에 맞춰 말하는가 (화면에서 실제로 누름)
async function talkOne(vp, lessonRe) {
  await send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: vp.m });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/ai-class.html?r=${Date.now()}#fast` });
  for (let i = 0; i < 80; i++) { await sleep(60); try { if (await ev('!!(window.__aiClass && !document.getElementById("startAuto").disabled)')) break; } catch (e) { } }
  await ev(PROBE);
  const tag = `${vp.n}/talk`;
  await ev(`(async()=>{const IMG=${IMG};const s=document.getElementById('lessonSel');const o=[...s.options].find(x=>IMG.includes(+x.value)&&${lessonRe}.test(x.textContent));s.value=o.value;s.dispatchEvent(new Event('change'));await __wait();
    window.__subs=[];new MutationObserver(()=>{const t=document.getElementById('subW').firstChild;if(t&&t.nodeType===3)window.__subs.push(t.textContent)}).observe(document.getElementById('subW'),{childList:true});})()`);
  await ev(`document.getElementById('startBtn').click()`);
  const waitAwait = async (t) => { for (let i = 0; i < 200; i++) { if (await ev(`(s=>s.phase==='await'&&!window.__aiClass.busy&&s.plan[s.i].t==='${t}')(window.__aiClass.state)`)) return true; await sleep(20); } return false; };
  const clickChoice = async (re) => {
    await ev(`document.getElementById('micBtn').click()`); await sleep(20);
    const c = await ev(`(()=>{const bs=[...document.querySelectorAll('#simChoices .choice')];const b=bs.find(x=>${re}.test(x.dataset.text));if(!b)return {n:bs.length,ok:false};const vis=__probe.vis(b)>0.9,top=(b.scrollIntoView({block:'center'}),__probe.top(b));window.__subs=[];b.click();return {n:bs.length,ok:true,vis,top,text:b.dataset.text};})()`);
    return c;
  };
  // ① 인사 — 기분 대답
  ok(await waitAwait('greet'), `${tag}: never reached greeting turn`);
  let c = await clickChoice('/tired/');
  ok(c.ok && c.n >= 3, `${tag}: greeting choices missing ${JSON.stringify(c)}`);
  ok(c.top, `${tag}: greeting choice button covered`);
  await waitAwait('intro');
  let subs = await ev('window.__subs.join(" | ")');
  ok(/tired/i.test(subs) && /stretch|wake up|step by step|deep breath/i.test(subs), `${tag}: teacher did not answer «tired» feeling: ${subs.slice(0, 200)}`);
  // ② 도입 — 그림 낱말
  c = await clickChoice('/^I see/');
  ok(c.ok, `${tag}: intro picture choices missing ${JSON.stringify(c)}`);
  const w = (c.text || '').replace(/^I see |\.$/g, '');
  await sleep(150);
  subs = await ev('window.__subs.join(" | ")');
  ok(new RegExp('"' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"').test(subs) && /Good eyes|You found it|That's right|I see it right here/.test(subs), `${tag}: teacher did not echo picture word «${w}»: ${subs.slice(0, 200)}`);
  // ③ 따라 말하기 — 반쪽 대답이면 빠진 낱말 표시
  await waitAwait('repeat');
  let half = '', ws = [];
  for (let k = 0; k < 15; k++) {
    half = await ev(`(()=>{const s=window.__aiClass.state;const t=s.plan[s.i];return t.say})()`);
    ws = half.split(' ');
    const low = ws.map(x => x.toLowerCase().replace(/[^a-z']/g, ''));
    if (ws.length >= 4 && new Set(low).size === low.length) break;   // 같은 말을 되풀이하는 문장은 «반쪽» 이 곧 전체라 건너뜀
    ws = []; await ev(`document.getElementById('micBtn').click()`); await sleep(20);
    await ev(`document.querySelector('[data-say="exact"]').click()`); await waitAwait('repeat');
  }
  if (ws.length >= 4) {
    await ev(`document.getElementById('micBtn').click()`); await sleep(20);
    await ev(`(()=>{const i=document.getElementById('simInput');i.value=${JSON.stringify(ws.slice(0, Math.ceil(ws.length / 2)).join(' '))};document.getElementById('simForm').requestSubmit();})()`);
    for (let i = 0; i < 100; i++) { if (await ev(`(s=>s.phase==='await'&&!window.__aiClass.busy)(window.__aiClass.state)`)) break; await sleep(20); }
    const miss = await ev(`(()=>{const m=document.querySelector('#ask .res.miss');return m?{t:m.textContent,vis:__probe.vis(m)}:null})()`);
    ok(miss && /빠진 낱말|다음엔/.test(miss.t), `${tag}: missing-word chip not shown for half answer «${half}»`);
  } else pass++;
  ok(await ev('document.documentElement.scrollWidth <= innerWidth'), `${tag}: overflow after choices`);
}

// 실서비스 전용 점검 — 마이크 기본 켬 · 그림 깨짐 → 문장 · 그림은 교재 API 주소로만
async function prodOne(vp) {
  const tag = `${vp.n}/prod`;
  // ① 마이크가 있는 브라우저는 처음부터 «자동 말하기 켬», 🎤 는 진짜 마이크
  await go(vp, '&sr=fake&deftalk=1');
  ok(/켬/.test(await ev(`document.getElementById('talkBtn').textContent`)) && await ev('window.__aiClass.talk'), `${tag}: talk not on by default with mic`);
  await ev(`document.getElementById('startBtn').click()`);
  ok(await awaitT('t=>t.t!=="find"'), `${tag}: no student turn`);
  let st = 0; for (let i = 0; i < 100; i++) { st = await ev('window.__recStarts||0'); if (st > 0) break; await sleep(20); }
  ok(st > 0, `${tag}: mic not auto-started on student turn`);
  ok(await ev(`document.getElementById('sim').hidden`), `${tag}: choose-panel shown although mic works`);
  // ② 마이크가 없으면 기본은 «끔» 이고 🎤 는 고르기 창
  await go(vp, '&sr=none&deftalk=1');
  ok(!(await ev('window.__aiClass.talk')), `${tag}: talk on without mic`);
  await ev(`document.getElementById('startBtn').click()`); await awaitT('t=>t.t!=="find"');
  await ev(`document.getElementById('micBtn').click()`); await sleep(30);
  ok(!(await ev(`document.getElementById('sim').hidden`)), `${tag}: choose-panel not shown without mic`);
  // ③ 그림 주소는 교재 API(/api/textbook-files/<id>/raw)뿐
  await go(vp, '');
  const bad = await ev(`Object.values(window.__aiClass.slides).filter(u=>!/^\\/api\\/textbook-files\\/\\d+\\/raw$/.test(u)).length`);
  const n = await ev(`Object.keys(window.__aiClass.slides).length`);
  ok(n > 0 && bad === 0, `${tag}: slide urls not from textbook API n=${n} bad=${bad}`);
  // ④ 그림이 깨지면(삭제·네트워크) 그 쪽은 문장으로 다시 그린다 — 수업은 그대로
  const e0 = errors.length;
  const nm = await ev(`window.__aiClass.unit.pages[0].name`);
  await ev(`(()=>{window.__aiClass.slides[${JSON.stringify(nm)}]='/api/textbook-files/1/raw';const v=window.__aiClass.state.view;document.getElementById('nextPg').click();document.getElementById('prevPg').click();})()`);
  let fb = null; for (let i = 0; i < 60; i++) { fb = await ev(`({img:document.getElementById('slideImg').hidden,body:document.getElementById('bbody').hidden,lines:document.querySelectorAll('#bbody .bl').length,label:document.getElementById('slideName').textContent})`); if (fb.img && !fb.body) break; await sleep(30); }
  await sleep(100); for (let i = errors.length - 1; i >= e0; i--) if (/status of 404/.test(errors[i])) errors.splice(i, 1);   // 일부러 깨뜨린 그림의 404 만 뺀다
  ok(fb.img && !fb.body && fb.lines > 0 && /문장만/.test(fb.label), `${tag}: broken slide did not fall back to text ${JSON.stringify(fb)}`);
  // ⑤ 이름 — 로그인 이름이 아이디와 같으면 부르지 않는다(아이디 노출 금지)
  ok(await ev('document.documentElement.scrollWidth <= innerWidth'), `${tag}: overflow`);
}

// 새 기능 점검: 말하기 속도 · 자동 말하기(가짜 음성인식 / 막힘 / 없음) · 낱말 찾기 · 역할 바꾸기 · 칭찬 스티커
const go = async (vp, q, hash) => {
  await send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: vp.m });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/ai-class.html?r=${Date.now()}${q || ''}${hash ?? '#fast'}` });
  for (let i = 0; i < 80; i++) { await sleep(60); try { if (await ev('!!(window.__aiClass && !document.getElementById("startAuto").disabled)')) break; } catch (e) { } }
  await ev(PROBE);
};
const pickFindLesson = `(async()=>{const IMG=${IMG};const s=document.getElementById('lessonSel');for(const o of [...s.options].filter(x=>IMG.includes(+x.value)&&/^BTS/.test(x.textContent))){s.value=o.value;s.dispatchEvent(new Event('change'));await __wait();const p=window.__aiClass.state.plan;if(p.some(x=>x.t==='find')&&p.some(x=>x.mode==='swap'))return o.textContent;}return null})()`;
const awaitT = async (pred) => { for (let i = 0; i < 400; i++) { if (await ev(`(s=>s.phase==='await'&&!window.__aiClass.busy&&(${pred})(s.plan[s.i]))(window.__aiClass.state)`)) return true; if (await ev(`window.__aiClass.state.phase==='done'`)) return false; await sleep(15); } return false; };
async function featOne(vp) {
  const tag = `${vp.n}/feat`;
  // ① 속도: 네 단계를 돌고, 실제 말하기 속도에 곱해지며, 다시 열어도 기억한다
  await go(vp, '');
  const spds = []; for (let k = 0; k < 4; k++) { await ev(`document.getElementById('spdBtn').click()`); spds.push(await ev(`[window.__aiClass.speed,document.getElementById('spdBtn').textContent]`)); }
  ok(JSON.stringify(spds.map(x => x[0])) === '[1.15,0.75,0.9,1]', `${tag}: speed cycle ${JSON.stringify(spds)}`);
  ok(/빠르게/.test(spds[0][1]) && /아주 천천히/.test(spds[1][1]) && /보통/.test(spds[3][1]), `${tag}: speed label ${JSON.stringify(spds)}`);
  await ev(`document.getElementById('spdBtn').click()`); await ev(`document.getElementById('spdBtn').click()`);   // 0.75
  await go(vp, '&keep=1', '');
  ok(await ev(`window.__aiClass.speed`) === 0.75 && /아주 천천히/.test(await ev(`document.getElementById('spdBtn').textContent`)), `${tag}: speed not remembered`);
  await ev(`(()=>{window.__rates=[];speechSynthesis.speak=function(u){window.__rates.push(u.rate);setTimeout(function(){u.onend&&u.onend()},5)};speechSynthesis.cancel=function(){};})()`);
  await ev(`document.getElementById('startBtn').click()`);
  for (let i = 0; i < 100 && !(await ev('window.__rates.length')); i++) await sleep(20);
  const r0 = await ev('window.__rates[0]');
  ok(Math.abs(r0 - 0.75 * 0.92) < 0.005, `${tag}: speech rate ${r0} not scaled by speed 0.75`);
  ok(await ev('document.documentElement.scrollWidth <= innerWidth'), `${tag}: pills overflow`);
  const pillsTop = await ev(`['spdBtn','talkBtn'].every(id=>{const b=document.getElementById(id);b.scrollIntoView({block:'center'});return __probe.top(b)})`);
  ok(pillsTop, `${tag}: speed/talk pill covered`);
  // ② 자동 말하기 + 가짜 음성인식: 마이크가 저절로 켜지고, 들은 말로 대답하며, 수업이 끝까지 간다(찾기는 눌러서)
  await go(vp, '&sr=fake', '');
  ok(!!(await ev(pickFindLesson)), `${tag}: no lesson with find+swap`);
  await ev(`(()=>{window.__heard=0;new MutationObserver(m=>m.forEach(x=>x.addedNodes.forEach(n=>{if(n.classList&&n.classList.contains('heard'))window.__heard++}))).observe(document.getElementById('ask'),{childList:true});window.__stk=0;new MutationObserver(m=>m.forEach(x=>x.addedNodes.forEach(n=>{if(n.classList&&n.classList.contains('sticker'))window.__stk++}))).observe(document.getElementById('sTile'),{childList:true});speechSynthesis.speak=function(u){setTimeout(function(){u.onend&&u.onend()},3)};speechSynthesis.cancel=function(){};})()`);
  await ev(`document.getElementById('talkBtn').click()`);
  ok(/켬/.test(await ev(`document.getElementById('talkBtn').textContent`)), `${tag}: talk pill did not turn on`);
  await ev(`document.getElementById('startBtn').click()`);
  let heard = false, recOn = false, findDone = 0, swapOk = false, findChecked = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 50000) {
    const x = await ev(`(()=>{const s=window.__aiClass.state,t=s.plan[s.i]||{};return {ph:s.phase,t:t.t,mode:t.mode,busy:window.__aiClass.busy,rec:window.__aiClass.rec,heard:window.__heard>0,finding:document.getElementById('book').classList.contains('finding'),k:document.querySelector('#cap .k').textContent,ask:document.getElementById('ask').textContent,line:t.line,word:t.word,i:s.i}})()`);
    if (x.ph === 'done') break;
    if (x.heard) heard = true; if (x.rec) recOn = true;
    if (x.ph === 'await' && !x.busy && x.t === 'find') {
      if (!findChecked) {
        findChecked = true;
        ok(x.finding && /낱말 찾기/.test(x.k) && x.ask.includes(x.word), `${tag}: find step not shown (${x.k} / ${x.ask})`);
        ok(!x.rec, `${tag}: mic opened during find game`);
        ok(await ev(`document.getElementById('micBtn').disabled`), `${tag}: mic button enabled in find game`);
        const chip = await ev(`(()=>{const b=document.querySelector('#lineChips button[data-line="${x.line}"]');if(!b)return null;b.scrollIntoView({block:'nearest'});const cs=getComputedStyle(b);return {vis:__probe.vis(b),top:__probe.top(b),ws:cs.whiteSpace}})()`);
        ok(chip && chip.vis > 0.9 && chip.top && chip.ws === 'normal', `${tag}: answer chip not tappable/wrapped ${JSON.stringify(chip)}`);
        const wrong = await ev(`(()=>{const b=[...document.querySelectorAll('#lineChips button')].find(b=>b.dataset.line!=='${x.line}');if(!b)return false;b.click();return true})()`);
        if (wrong) { const after = await ev(`(s=>[s.i,s.stars])(window.__aiClass.state)`); ok(after[0] === x.i, `${tag}: wrong chip moved on`); ok(await awaitT(`t=>t.t==='find'`), `${tag}: find did not wait again after a wrong tap`); }
        const st0 = await ev('window.__aiClass.state.stars');
        const st1 = await ev(`(()=>{document.querySelector('#lineChips button[data-line="${x.line}"]').click();const s=window.__aiClass.state;return [s.i,s.stars]})()`);
        ok(st1[0] === x.i + 1 && st1[1] === st0, `${tag}: correct chip did not advance (or gave a star) ${st1}`);
        findDone++;
      } else { await ev(`document.querySelector('#lineChips button[data-line="${x.line}"]').click()`); findDone++; }
    }
    if (x.ph === 'await' && !x.busy && x.mode === 'swap' && !swapOk) { swapOk = /역할 바꾸기/.test(x.k) && /물어보세요/.test(x.ask); ok(swapOk, `${tag}: swap not shown (${x.k} / ${x.ask})`); }
    await sleep(15);
  }
  const fin = await ev(`(s=>({ph:s.phase,stars:s.stars,targets:s.targets}))(window.__aiClass.state)`);
  ok(fin.ph === 'done', `${tag}: auto-speak lesson did not finish ${JSON.stringify(fin)}`);
  ok(fin.stars === fin.targets, `${tag}: auto-speak exact answers but stars ${fin.stars}/${fin.targets}`);
  ok(heard && recOn, `${tag}: mic never auto-opened / heard text not shown (rec ${recOn} heard ${heard})`);
  ok(findDone >= 1 && swapOk, `${tag}: find ${findDone} swap ${swapOk}`);
  ok(await ev('window.__stk') >= 3, `${tag}: praise stickers not shown (${await ev('window.__stk')})`);
  // ③ 마이크가 막힌 화면: 안내를 띄우고 고르는 칸을 연다
  for (const mode of ['deny', 'none']) {
    await go(vp, '&sr=' + mode);
    await ev(`document.getElementById('talkBtn').click()`);
    await ev(`document.getElementById('startBtn').click()`);
    ok(await awaitT(`t=>t.t==='greet'`), `${tag}/${mode}: never reached greeting`);
    await sleep(30);
    const fb = await ev(`(()=>{const m=[...document.querySelectorAll('#ask .res.miss')].find(x=>/마이크를 쓸 수 없어요/.test(x.textContent));return {note:!!m,sim:!document.getElementById('sim').hidden,ch:document.querySelectorAll('#simChoices .choice').length,blocked:window.__aiClass.recBlocked}})()`);
    ok(fb.note && fb.sim && fb.ch >= 3, `${tag}/${mode}: no fallback when mic blocked ${JSON.stringify(fb)}`);
    await ev(`document.querySelector('#simChoices .choice').click()`);
    ok(await awaitT(`t=>t.t!=='greet'`), `${tag}/${mode}: choice did not answer`);
  }
  // ④ 한국어 뜻: 처음엔 흐리게, 누르면 보이고, 다음 문장은 다시 흐리게. «영어» 자막이면 뜻이 없다
  await go(vp, '');
  await ev(`document.getElementById('startBtn').click()`);
  ok(await awaitT(`t=>true`), `${tag}/ko: never waited for the student`);
  const KO = `(()=>{const box=[document.getElementById('sub'),document.getElementById('subW')].find(b=>b&&!b.hidden&&getComputedStyle(b).display!=='none');const k=box&&box.querySelector('.ko');if(!k)return null;k.scrollIntoView({block:'nearest'});const r=k.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);const kt=k.querySelector('.kt'),kh=k.querySelector('.kh');return {open:k.classList.contains('open'),blur:getComputedStyle(kt).filter,hint:getComputedStyle(kh).display!=='none'&&kh.textContent,top:!!hit&&k.contains(hit),txt:kt.textContent,en:box.firstChild&&box.firstChild.textContent,h:r.height}})()`;
  const k0 = await ev(KO);
  ok(k0 && !k0.open && /blur/.test(k0.blur) && k0.hint && k0.top && k0.txt.length > 0 && k0.h >= 16, `${tag}/ko: meaning not blurred+tappable at first ${JSON.stringify(k0)}`);
  await ev(`(()=>{const box=[document.getElementById('sub'),document.getElementById('subW')].find(b=>b&&!b.hidden&&getComputedStyle(b).display!=='none');box.querySelector('.ko').click()})()`);
  await sleep(350);   // 흐림이 풀리는 0.2초 전환이 끝난 뒤에 잰다
  const k1 = await ev(KO);
  ok(k1 && k1.open && k1.blur === 'none' && !k1.hint, `${tag}/ko: tap did not reveal meaning ${JSON.stringify(k1)}`);
  ok(await ev(`window.__aiClass.state.phase`) === 'await', `${tag}/ko: tapping the meaning changed the lesson flow`);
  await ev(`document.querySelector('[data-say="exact"]').click()`);
  let k2 = null; for (let i = 0; i < 200; i++) { await sleep(15); k2 = await ev(KO); if (k2 && k2.en !== k1.en) break; }
  ok(k2 && k2.en !== k1.en && !k2.open && /blur/.test(k2.blur), `${tag}/ko: next line not blurred again ${JSON.stringify(k2)}`);
  await ev(`document.getElementById('subBtn').click()`);   // 영+한 → 영어
  ok(/영어/.test(await ev(`document.getElementById('subBtn').textContent`)), `${tag}/ko: sub mode not English`);
  await ev(`document.querySelector('[data-say="exact"]').click()`);
  let enOnly = false; for (let i = 0; i < 200 && !enOnly; i++) { await sleep(15); enOnly = await ev(`(()=>{const w=[document.getElementById('sub'),document.getElementById('subW')];return w.some(b=>b.firstChild&&b.firstChild.nodeType===3)&&!w.some(b=>b.querySelector('.ko'))})()`); }
  ok(enOnly, `${tag}/ko: English-only mode still shows a meaning`);

  // ⑤ 학생 카메라: 켜면 내 얼굴(영상)이 타일에 나오고, 끄면 장치가 꺼진다. 두 버튼이 같은 상태를 말한다. 막히면 안내만 하고 수업은 그대로
  await go(vp, '');
  await ev(`document.getElementById('startBtn').click()`);
  ok(await awaitT(`t=>true`), `${tag}/cam: never waited for the student`);
  const CAM = `(()=>{const t=document.getElementById('sTile'),v=document.getElementById('camVid'),b=document.getElementById('camBtn'),d=document.getElementById('camDock');t.scrollIntoView({block:'nearest'});const r=v.getBoundingClientRect(),tr=t.getBoundingClientRect();return {fill:(r.width*r.height)/Math.max(1,tr.width*tr.height),cls:t.classList.contains('cam-on'),vid:!v.hidden&&getComputedStyle(v).display!=='none',vw:v.videoWidth,rw:Math.round(r.width),rh:Math.round(r.height),btn:b.textContent,bp:b.getAttribute('aria-pressed'),dock:d.textContent,dp:d.getAttribute('aria-pressed'),off:d.classList.contains('camoff'),label:document.getElementById('camLabel').textContent,note:!document.getElementById('camNote').hidden&&document.getElementById('camNote').textContent,api:window.__aiClassCam(),btop:__probe.top(b),me:getComputedStyle(t.querySelector('.me')).visibility,lf:getComputedStyle(document.getElementById('camLabel')).fontSize,mf:getComputedStyle(t.querySelector('.me')).fontSize}})()`;
  const c0 = await ev(CAM);
  ok(!c0.cls && !c0.vid && !c0.api.on && c0.bp === 'false' && c0.dp === 'false' && c0.off && /꺼짐/.test(c0.label) && /켜기/.test(c0.btn) && /끔/.test(c0.dock) && !c0.note, `${tag}/cam: not off at start ${JSON.stringify(c0)}`);
  ok(!(vp.w <= 400 && vp.m) || c0.lf === '10px', `${tag}/cam: phone label font not small (${c0.lf}/${c0.mf})`);
  const ph0 = await ev(`window.__aiClass.state.phase+'/'+window.__aiClass.state.i`);
  await ev(`document.getElementById('camBtn').click()`);
  let c1 = null; for (let i = 0; i < 100; i++) { await sleep(30); c1 = await ev(CAM); if (c1.api.live && c1.vw > 0) break; }
  ok(c1.api.on && c1.api.live && c1.vw > 0 && c1.cls && c1.vid && c1.fill >= 0.8 && c1.rh >= 30, `${tag}/cam: camera on but no live video in tile ${JSON.stringify(c1)}`);
  ok(c1.bp === 'true' && c1.dp === 'true' && !c1.off && /켜짐/.test(c1.label) && /끄기/.test(c1.btn) && /켬/.test(c1.dock) && !c1.note, `${tag}/cam: buttons/label not synced when on ${JSON.stringify(c1)}`);
  ok(c1.btop && c1.me === 'hidden', `${tag}/cam: off button covered or placeholder over video ${JSON.stringify(c1)}`);
  ok(await ev(`window.__aiClass.state.phase+'/'+window.__aiClass.state.i`) === ph0, `${tag}/cam: camera changed the lesson flow`);
  ok(await ev('document.documentElement.scrollWidth <= innerWidth'), `${tag}/cam: overflow with camera on`);
  await ev(`window.__camTr = window.__aiClassCam && document.getElementById('camVid').srcObject && document.getElementById('camVid').srcObject.getTracks()`);
  await ev(`document.getElementById('camDock').click()`);   // 독 버튼으로 끄기 — 두 버튼이 같은 스위치
  await sleep(60);
  const c2 = await ev(CAM);
  const stopped = await ev(`(window.__camTr||[]).length>0 && window.__camTr.every(t=>t.readyState==='ended')`);
  ok(!c2.api.on && !c2.cls && !c2.vid && stopped && c2.bp === 'false' && c2.dp === 'false' && c2.off && /꺼짐/.test(c2.label), `${tag}/cam: dock off did not stop camera ${JSON.stringify(c2)} stopped=${stopped}`);
  // 막힌 경우: 권한 거부 · 카메라 없음 · API 없음 → 안내, 상태는 꺼짐, 수업 계속
  for (const [nm, code] of [['NotAllowedError', '권한'], ['NotFoundError', '찾지 못했어요'], ['NotReadableError', '다른 앱'], ['noapi', '쓸 수 없어요']]) {
    await ev(nm === 'noapi' ? `(window.__gum=navigator.mediaDevices.getUserMedia, Object.defineProperty(navigator,'mediaDevices',{value:undefined,configurable:true}))` : `(window.__gum=navigator.mediaDevices.getUserMedia, navigator.mediaDevices.getUserMedia=()=>Promise.reject(Object.assign(new Error('x'),{name:'${nm}'})))`);
    await ev(`document.getElementById('camBtn').click()`); await sleep(60);
    const cd = await ev(CAM);
    ok(!cd.api.on && !cd.cls && cd.bp === 'false' && cd.note && cd.note.includes(code) && !(await ev(`document.getElementById('camBtn').disabled`)), `${tag}/cam: ${nm} not handled ${JSON.stringify(cd)}`);
    await ev(nm === 'noapi' ? `delete navigator.mediaDevices` : `navigator.mediaDevices.getUserMedia=window.__gum`);
  }
  ok(await ev(`!!navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia==='function'`), `${tag}/cam: test did not restore getUserMedia`);
  await ev(`document.getElementById('camBtn').click()`);
  let c3 = null; for (let i = 0; i < 100; i++) { await sleep(30); c3 = await ev(CAM); if (c3.api.live) break; }
  ok(c3.api.live && !c3.note, `${tag}/cam: could not turn on again after a failure (note not cleared) ${JSON.stringify(c3)}`);
  await ev(`document.querySelector('[data-say="exact"]').click()`);
  let moved = false; for (let i = 0; i < 200 && !moved; i++) { await sleep(15); moved = await ev(`window.__aiClass.state.phase+'/'+window.__aiClass.state.i`) !== ph0; }
  ok(moved && (await ev(CAM)).api.live, `${tag}/cam: lesson did not go on with camera on (moved ${moved})`);
  await ev(`document.getElementById('camBtn').click()`);

  // ⑥ 학생 이름: 주소의 name · 로그인 정보(mangoi_logged_user)의 이름을 부른다. 한국어 이름은 성을 떼고 영어 문장엔 로마자, 자막엔 한글
  for (const [q, en, ko] of [['&name=' + encodeURIComponent('정우영'), 'Uyeong', '우영'], ['&name=Tom', 'Tom', 'Tom'], ['&name=' + encodeURIComponent('민서'), 'Minseo', '민서'], ['&name=123', 'friend', '123'], ['&name=' + encodeURIComponent('小明'), 'friend', '小明'], ['&name=' + encodeURIComponent('Tom!'), 'friend', 'Tom!'], ['typed:이서윤', 'Seoyun', '서윤']]) {
    if (q.startsWith('typed:')) { await go(vp, ''); await ev(`(()=>{const i=document.getElementById('nameIn');i.value=${JSON.stringify(q.slice(6))};i.dispatchEvent(new Event('input'))})()`); } else await go(vp, q);
    const pv = await ev(`document.getElementById('namePrev').textContent`);
    ok((await ev(`document.getElementById('camLabel').textContent`)).includes(ko), `${tag}/name ${q}: student label before start not using ${ko}`);
    ok(pv.includes(en) && (en === 'friend' || pv.includes(ko)), `${tag}/name ${q}: preview «${pv}» does not say ${en}/${ko}`);
    await ev(`document.getElementById('startBtn').click()`);
    ok(await awaitT(`t=>t.t==='greet'`), `${tag}/name ${q}: never reached greeting`);
    const g = await ev(`(()=>{const b=document.getElementById('sub');const k=b.querySelector('.ko .kt');return {en:b.firstChild?b.firstChild.textContent:'',ko:k?k.textContent:'',cam:document.getElementById('camLabel').textContent,nm:window.__aiClass.state.name,nk:window.__aiClass.state.nameKo}})()`);
    ok(g.nm === en && g.nk === ko && g.en.includes(en) && (!g.ko || g.ko.includes(ko)) && g.cam.includes(ko), `${tag}/name ${q}: greeting/label not using the name ${JSON.stringify(g)}`);
    ok(/^[\x20-\x7e]*$/.test(g.en), `${tag}/name ${q}: non-ASCII in English line «${g.en}»`);
  }
  // 로그인 이름: 페이지가 이름을 읽어 칸에 채운다 / 이름이 아이디와 같으면(이름 없는 계정) 쓰지 않는다
  await go(vp, '');
  await ev(`localStorage.removeItem('aiClassName'); localStorage.setItem('mangoi_logged_user', JSON.stringify({uid:'kimsky',name:'김하늘',role:'student'}))`);
  await go(vp, '&keep=1');
  ok(await ev(`document.getElementById('nameIn').value`) === '김하늘' && /Haneul/.test(await ev(`document.getElementById('namePrev').textContent`)), `${tag}/name: login name not used (${await ev(`document.getElementById('nameIn').value`)})`);
  await ev(`localStorage.setItem('mangoi_logged_user', JSON.stringify({uid:'kimsky',name:'kimsky'}))`);
  await go(vp, '&keep=1');
  ok(await ev(`document.getElementById('nameIn').value`) !== 'kimsky', `${tag}/name: login id used as a name`);
  await ev(`localStorage.removeItem('mangoi_logged_user')`);
  const toRepeat = async () => { for (let k = 0; k < 12; k++) { if (!(await awaitT(`t=>true`))) return false; const t = await ev(`window.__aiClass.state.plan[window.__aiClass.state.i].t`); if (t === 'repeat') return true; await ev(`(()=>{const p=window.__aiClass.state.plan[window.__aiClass.state.i];if(p.t==='find'){const L=[...document.querySelectorAll('#lineList [data-line], .ln')];}const c=document.querySelector('#simChoices .choice');if(c&&!document.getElementById('sim').hidden){c.click();return}document.querySelector('[data-say="exact"]').click()})()`); await sleep(40); } return false; };
  // ⑦ 감탄사 + 축하 소리: 맞히면 감탄사로 시작하고 소리가 나며, 틀리거나 조용하면 안 나온다. 「소리 끔」이면 소리만 안 난다
  await go(vp, '&name=Tom');
  await ev(`document.getElementById('startBtn').click()`);
  ok(await toRepeat(), `${tag}/wow: never reached a repeat turn`);
  const w0 = await ev(`[window.__wowShown||0, window.__sfx||0, window.__sfxPlayed||0]`);
  await ev(`(()=>{const b=document.getElementById('sub');window.__subLog=[];new MutationObserver(()=>{if(b.firstChild)window.__subLog.push(b.firstChild.textContent)}).observe(b,{childList:true})})()`);
  await ev(`document.querySelector('[data-say="quiet"]').click()`); await sleep(80);
  const w1 = await ev(`[window.__wowShown||0, window.__sfx||0]`);
  ok(w1[0] === w0[0] && w1[1] === w0[1], `${tag}/wow: cheer on a silent answer ${w0}→${w1}`);
  ok(await toRepeat(), `${tag}/wow: no repeat turn after silence`);
  await ev(`document.querySelector('[data-say="exact"]').click()`);
  let w2 = null; for (let i = 0; i < 100; i++) { await sleep(15); w2 = await ev(`({n:window.__wowShown||0,s:window.__sfx||0,p:window.__sfxPlayed||0,last:window.__lastWow||'',log:window.__subLog.slice()})`); if (w2.n > w0[0]) break; }
  ok(w2.n === w0[0] + 1 && w2.s === w0[1] + 1 && w2.p === w0[2] && w2.log.some(x => x.startsWith(w2.last + ' ')) && /^You |^Wow|^Fantastic|^Way to go|^High five/.test(w2.last), `${tag}/wow: correct answer cheer/sound wrong (sound off must not play) ${JSON.stringify(w2)}`);
  await ev(`document.getElementById('sndBtn').click()`);   // 소리 켬 → 다음에 맞히면 실제로 소리
  ok(await toRepeat(), `${tag}/wow: no next repeat turn`);
  await ev(`document.querySelector('[data-say="exact"]').click()`);
  let w3 = null; for (let i = 0; i < 100; i++) { await sleep(15); w3 = await ev(`({n:window.__wowShown||0,p:window.__sfxPlayed||0,last:window.__lastWow||''})`); if (w3.n > w2.n) break; }
  ok(w3.n === w2.n + 1 && w3.p === w2.p + 1 && w3.last !== w2.last, `${tag}/wow: sound not played with sound on, or same cheer twice ${JSON.stringify(w3)}`);
  await ev(`document.getElementById('sndBtn').click()`);
}

(async () => {
  ws = new WebSocket(await connect());
  await new Promise(r => ws.onopen = r);
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id).res(d.result || {}); pend.delete(d.id); } if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text); if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error' && !/favicon|fonts\.g/.test(d.params.entry.url || d.params.entry.text)) errors.push(d.params.entry.text); };
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `(function(){var q=location.search;
    if(q.indexOf('keep=1')<0){try{localStorage.removeItem('aiClassSpd');if(q.indexOf('deftalk=1')<0)localStorage.setItem('aiClassTalk','0');else localStorage.removeItem('aiClassTalk');}catch(e){}}
    var m=(q.match(/sr=(\\w+)/)||[])[1]; if(!m) m='none';
    if(m==='none'){ window.SpeechRecognition=undefined; window.webkitSpeechRecognition=undefined; return; }
    function F(){ this.onresult=null; this.onerror=null; this.onend=null; }
    F.prototype.start=function(){ var me=this; window.__recStarts=(window.__recStarts||0)+1;
      if(m==='deny'){ setTimeout(function(){ me.onerror&&me.onerror({error:'not-allowed'}); me.onend&&me.onend(); },10); return; }
      var s=window.__aiClass.state, t=s.plan[s.i]||{}, say=t.say||t.free||'I am happy.';
      me._t=setTimeout(function(){ me.onresult&&me.onresult({results:[{0:{transcript:say.split(' ')[0]},isFinal:false,length:1}]});
        me._t=setTimeout(function(){ me.onresult&&me.onresult({results:[{0:{transcript:say},isFinal:true,length:1}]}); me.onend&&me.onend(); },20); },20); };
    F.prototype.abort=function(){ clearTimeout(this._t); }; F.prototype.stop=F.prototype.abort;
    window.SpeechRecognition=F; window.webkitSpeechRecognition=F; })();` });
  let runs = 0, ms = 0;
  for (const vp of VPS) for (let li = 0; li < 4; li++) for (let s = 1; s <= REPS; s++) {
    if (process.env.ONLY && !process.env.ONLY.split(',').includes(`${vp.n.split(' ')[0]}/L${li}/${s}`)) continue;
    const mode = s % 2 ? 'auto' : 'monkey';
    try { ms += await runOne(vp, li, mode, s); runs++; } catch (e) { ok(false, `${vp.n}/L${li}/${mode}#${s}: crashed ${e.message}`); }
  }
  for (const vp of VPS) { try { await talkOne(vp, '/^BTS/'); } catch (e) { ok(false, `${vp.n}/talk: crashed ${e.message}`); } }
  for (const vp of VPS) { try { await featOne(vp); } catch (e) { ok(false, `${vp.n}/feat: crashed ${e.message}`); } }
  for (const vp of VPS) { try { await prodOne(vp); } catch (e) { ok(false, `${vp.n}/prod: crashed ${e.message}`); } }
  // 정적 점검: 독 버튼이 가려지지 않는가 (시작 전, 각 크기)
  for (const vp of VPS) {
    await send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: vp.m });
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/ai-class.html?r=${Date.now()}#fast` }); await sleep(400); await ev(PROBE);
    for (let i = 0; i < 80; i++) { await sleep(60); try { if (await ev('!!(document.getElementById("startAuto") && !document.getElementById("startAuto").disabled)')) break; } catch (e) { } }
    await ev(`document.getElementById('startAuto').click()`); await sleep(50);
    await ev(`document.querySelector('.dock').scrollIntoView({block:'center'})`); await sleep(30);
    const cov = await ev(`[...document.querySelectorAll('.dock .db')].filter(b=>!__probe.top(b)).map(b=>{const r=b.getBoundingClientRect();const t=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return b.id+'<'+(t?t.tagName+'#'+t.id+'.'+t.className:'none')+' y'+Math.round(r.top)})`);
    ok(cov.length === 0, `${vp.n}: dock buttons covered ${cov}`);
  }
  ok(errors.length === 0, `console/page errors: ${[...new Set(errors)].slice(0, 5).join(' | ')}`);
  console.log(`api list ${apiCalls} · slide raw ${rawCalls}`);
  console.log(`browser runs ${runs} (${VPS.length} viewports × 4 lessons × ${REPS}) · avg ${Math.round(ms / Math.max(1, runs))}ms/run`);
  console.log(`결과: PASS ${pass} / FAIL ${fail}`);
  fails.forEach(f => console.log('  ❌ ' + f));
  chrome.kill(); srv.close(); try { fs.rmSync(PROF, { recursive: true, force: true }); } catch (e) { }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); chrome.kill(); srv.close(); process.exit(2); });
