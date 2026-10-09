// 📖 A.i 동화책 «The Red Umbrella» — 샌드박스(헤드리스 크로미움) 검사 · 2026-10-09
// ⚠️ 자동으로 안 돕니다(manual/) — 사람이 부릅니다:
//      REPS=4 node test-harness/manual/story-red-umbrella-browser.mjs
// 실제 화면을 «사람처럼» 끝까지 누릅니다: 읽기 → 핵심문장 → 요점정리 → 낱말 게임 → 근거 찾기 → 바꿔 쓰기
//   → 도장 6개 → 포인트 요청(서버는 가짜: 성공·상한·로그인필요·서버오류→다시받기·연결끊김) → 축하.
// 화면 4종 × 한/영 × 서버 응답 5종 × REPS 회 + 일부러 틀리고 다시 푸는 «원숭이» 회차.
// 실패하면 종료코드 1.
import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const PUB = path.join(DIR, '..', '..', 'cloudflare-deploy', 'public');
const REPS = +(process.env.REPS || 2);
const PORT = 9300 + Math.floor(Math.random() * 400);
const PROF = path.join(os.tmpdir(), 'story-browser-' + process.pid);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.webp': 'image/webp', '.css': 'text/css', '.woff2': 'font/woff2' };

let MODE = 'ok'; const reqs = [];
const srv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  if (u.pathname === '/api/points/earn-by-rule') {
    let b = ''; q.on('data', (c) => b += c); q.on('end', () => {
      let body = null; try { body = JSON.parse(b); } catch {}
      reqs.push({ body, auth: q.headers.authorization || '' });
      const send = (st, o) => { r.writeHead(st, { 'Content-Type': 'application/json' }); r.end(JSON.stringify(o)); };
      if (MODE === 'ok' || (MODE === 'err-then-ok' && reqs.length > 1)) return send(200, { ok: true, newBalance: 130, rule: { code: 'story_read', label: 'A.i 동화책 한 편 완주', amount: 10 } });
      if (MODE === 'cap') return send(200, { ok: false, error: 'game_daily_cap_reached', cap: 30, message_ko: '게임·퀴즈 포인트는 하루 30점까지예요. 내일 또 받을 수 있어요!', message_en: 'Game & quiz points are capped at 30 per day. See you tomorrow!' });
      if (MODE === 'login') return send(401, { ok: false, error: 'auth_required' });
      if (MODE === 'err-then-ok') return send(500, { ok: false, error: 'boom' });
      if (MODE === 'drop') return q.socket.destroy();
    });
    return;
  }
  const fp = path.join(PUB, decodeURIComponent(u.pathname));
  if (!fp.startsWith(PUB) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'text/plain', 'Cache-Control': 'no-store' }); r.end(fs.readFileSync(fp));
}).listen(PORT);

const chrome = spawn('/opt/pw-browsers/chromium-1194/chrome-linux/chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', '--autoplay-policy=no-user-gesture-required', '--remote-debugging-port=' + (PORT + 1000), '--user-data-dir=' + PROF, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0; const pend = new Map(); const consoleErr = [];
async function connect() {
  for (let i = 0; i < 60; i++) { try { const l = await (await fetch(`http://127.0.0.1:${PORT + 1000}/json/list`)).json(); const t = l.find((x) => x.type === 'page'); if (t) return t.webSocketDebuggerUrl; } catch {} await sleep(200); }
  throw new Error('no chrome');
}
function send(method, params = {}) { return new Promise((res, rej) => { const i = ++id; const to = setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('시간초과 ' + method + ' ' + String(params.expression || '').slice(0, 60))); } }, 25000); pend.set(i, { res: (v) => { clearTimeout(to); res(v); }, rej: (e) => { clearTimeout(to); rej(e); } }); ws.send(JSON.stringify({ id: i, method, params })); }); }
async function ev(expr) { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval error'); return r.result.value; }
let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { fail++; if (fails.length < 60) fails.push(m); if (process.env.LIVE) console.log('\n  ❌ ' + m); } };

const VPS = [{ n: 'phone 390x844', w: 390, h: 844, m: true }, { n: 'small 360x640', w: 360, h: 640, m: true }, { n: 'tablet 768x1024', w: 768, h: 1024, m: true }, { n: 'pc 1440x900', w: 1440, h: 900, m: false }];
const MODES = ['ok', 'cap', 'login', 'err-then-ok', 'drop'];

// 페이지 안에서 «사람처럼» 푸는 도구 — 정답은 화면의 데이터가 아니라 «눌러서 나온 결과» 로 확인합니다.
const SOLVER = `(function(){
  const $=(s,r)=> (r||document).querySelector(s), $$=(s,r)=>[...(r||document).querySelectorAll(s)];
  const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
  let lastTop='';
  function top(el){ el.scrollIntoView({block:'center'}); /* 여러 줄로 감긴 문장은 상자 가운데가 줄 사이 빈칸이라 «첫 줄 조각» 을 잰다 */ const rs=el.getClientRects(); const r=rs.length?rs[0]:el.getBoundingClientRect(); const t=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2); lastTop=t?(t.tagName+'#'+t.id+'.'+String(t.className).slice(0,30)+'@'+Math.round(r.left)+','+Math.round(r.top)+' '+Math.round(r.width)+'x'+Math.round(r.height)):'null'; return !!t&&(t===el||el.contains(t)); }
  let blocked=[];
  function click(el,name){ if(!el){ blocked.push('없음:'+name); return; } if(!top(el)) blocked.push('가림:'+name+'←'+lastTop); el.click(); }
  window.__earnCalls=0; const _f=window.fetch; window.fetch=function(u,o){ if(String(u).indexOf('/api/points/earn-by-rule')>=0) window.__earnCalls++; return _f.apply(this,arguments); };
  window.__solve = async function(monkey){
    blocked=[];
    // ① 읽기: 문장 5개 눌러 듣기
    const ss=$$('#text .s'); for(let i=0;i<5;i++) click(ss[i],'문장'+i);
    window.speechSynthesis && speechSynthesis.cancel();
    // ② 핵심문장: (원숭이) 먼저 틀린 것 → 다시
    click($('#pickMode'),'고르기');
    if(monkey){ click(ss[0],'틀린문장'); click(ss[1],'틀린문장2'); click($('#checkKey'),'확인'); click($('#pickMode'),'다시고르기'); }
    const P=ss.find(s=>s.dataset.role==='P'), S=ss.find(s=>s.dataset.role==='S');
    click(P,'P'); click(S,'S'); click($('#checkKey'),'정답확인');
    // ③ 요점정리
    const sels=$$('#sumText select');
    sels.forEach((s,i)=>{ s.value = (monkey&&i===0) ? s.options[1].value===s.dataset.ans ? s.options[2].value : s.options[1].value : s.dataset.ans; s.dispatchEvent(new Event('change')); });
    click($('#checkSum'),'요점확인');
    if(monkey){ sels[0].value=sels[0].dataset.ans; sels[0].dispatchEvent(new Event('change')); click($('#checkSum'),'요점재확인'); }
    // ④ 낱말 게임: 뜻 카드에서 정답을 찾아 누른다(원숭이는 첫 문제를 일부러 틀림)
    const words={}; $$('#words .w').forEach(w=>{ const en=$('.en',w).textContent, ko=$('.ko',w); words[en]=ko?ko.textContent:null; });
    let wrongOnce=!!monkey, guard=0;
    while(!$('#wq .wq-card.done') && guard++<30){
      const en=$('#wq .wq-word span').textContent, opts=$$('#wq .wq-o');
      const ex=$$('#words .w').find(w=>$('.en',w).textContent===en); const exT=$('.ex',ex).textContent;
      const isRight=(o)=> document.documentElement.lang==='en' ? o.textContent===exT : o.textContent===words[en];
      let pick = opts.find(isRight); if(wrongOnce){ pick=opts.find(o=>!isRight(o)); wrongOnce=false; }
      click(pick,'낱말 '+en); await sleep(pick&&isRight(pick)?720:1280);
    }
    // ⑤ 근거 찾기: 정답 보기·근거는 «틀린 뒤 초록색» 으로 배워서 다시 푼다(사람이 하는 그대로)
    for(let qi=0;qi<3;qi++){
      let card=()=>$$('#qs .qcard')[qi];
      click($$('.opt',card())[0],'Q'+qi+'보기A');
      const need=+($('.cnt',card()).textContent.split('/')[1]);
      for(let k=0;k<need;k++) click($$('.evb',card())[k],'Q'+qi+'근거'+k);
      click($('[data-check]',card()),'Q'+qi+'확인');
      if($('.fb.ok',card())) continue;
      const ans=$$('.opt',card()).findIndex(o=>o.classList.contains('right'));
      const evs=$$('.evb',card()).map((e,i)=>e.classList.contains('right')?i:-1).filter(i=>i>=0);
      click($('[data-retry]',card()),'Q'+qi+'다시');
      click($$('.opt',card())[ans],'Q'+qi+'정답보기');
      evs.forEach(i=>click($$('.evb',card())[i],'Q'+qi+'정답근거'));
      click($('[data-check]',card()),'Q'+qi+'재확인');
    }
    // ⑥ 바꿔 쓰기: (원숭이) 한글 먼저 → 거절 → 예시 칩
    if(monkey){ $('#wa').value='숙제하기'; $('#wb').value='저녁'; $('#wa').dispatchEvent(new Event('input')); click($('#wcheck'),'한글완성'); }
    click($$('#mywrite .chip')[1],'칩'); click($('#wcheck'),'완성');
    return blocked;
  };
})()`;

async function runOne(vp, lang, mode, monkey, tag) {
  MODE = mode; reqs.length = 0;
  await send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: vp.m });
  await send('Network.clearBrowserCookies');
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/story-red-umbrella.html?r=${Date.now()}` });
  for (let i = 0; i < 300; i++) { await sleep(50); try { if (await ev('!!(window.StoryFun && document.querySelectorAll("#text .s").length > 30)')) break; } catch {} }
  await ev(`(()=>{try{localStorage.clear();localStorage.setItem('story_lang','${lang}')}catch(e){}})()`);
  await send('Page.reload', { ignoreCache: true });
  for (let i = 0; i < 300; i++) { await sleep(50); try { if (await ev('!!(window.StoryFun && document.querySelectorAll("#text .s").length > 30 && document.querySelector("#wq .wq-card"))')) break; } catch {} }
  if (!(await ev('!!(window.StoryFun && document.querySelector("#wq .wq-card"))'))) { ok(false, `${tag}: 15초 안에 화면이 안 열림`); return; }
  ok(await ev(`document.documentElement.lang==='${lang}'`), `${tag}: 언어 ${lang} 로 열림`);
  ok(await ev('document.querySelectorAll("#stampBoard .stamp").length===6 && document.querySelector(".sb-n").textContent.trim()==="0 / 6"'), `${tag}: 도장판 0/6`);
  ok(await ev('document.documentElement.scrollWidth<=innerWidth'), `${tag}: 가로 넘침 없음(${await ev('document.documentElement.scrollWidth')})`);
  const imgs = await ev(`(async()=>{ /* 장면 그림은 loading=lazy — 사람처럼 그 자리까지 내려가 본다 */ for (const i of document.images) { i.scrollIntoView({block:'center'}); await new Promise(r=>setTimeout(r,60)); } window.scrollTo(0,0); })().then(()=>Promise.all([...document.images].map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=i.onerror=r;}))).then(()=>[...document.images].filter(i=>/story\\//.test(i.src)).map(i=>i.naturalWidth)))`);
  ok(imgs.length === 3 && imgs.every((w) => w > 100), `${tag}: 그림 3장(표지+장면2)이 그려짐 ${JSON.stringify(imgs)}`);
  ok(await ev('document.getElementById("bgm") && document.querySelectorAll(".speed .sp").length>=2 && document.querySelectorAll("#ends .end").length===2'), `${tag}: 재미요소(음악·말속도·투표) 그대로`);
  await ev(SOLVER);
  const blocked = await ev(`__solve(${monkey})`);
  ok(blocked.length === 0, `${tag}: 누를 것이 가려지거나 없음 ${JSON.stringify(blocked).slice(0, 200)}`);
  await sleep(400);
  const st = await ev('JSON.stringify(Object.keys(window.StoryFun.state()).sort())');
  ok(st === JSON.stringify(['infer', 'key', 'read', 'sum', 'words', 'write']), `${tag}: 도장 6개 ${st}`);
  ok(await ev('document.querySelector(".sb-n").textContent.trim()==="6 / 6" && document.querySelectorAll("#stampBoard .stamp.on").length===6'), `${tag}: 도장판 6/6 표시`);
  for (let i = 0; i < 40 && !(await ev('!!document.querySelector("#finishBox .fin-card:not(.fin-wait)")')); i++) await sleep(100);
  const calls = await ev('window.__earnCalls');
  ok(calls === 1 && reqs.length >= 1, `${tag}: 포인트 요청이 정확히 1번 (화면 ${calls} · 서버 ${reqs.length})`);
  const b = reqs[0] && reqs[0].body;
  ok(b && b.rule_code === 'story_read' && /^guest_/.test(b.user_id) && b.meta && b.meta.story === 'red-umbrella' && !('student_name' in b), `${tag}: 요청 내용 ${JSON.stringify(b)}`);
  const fin = await ev('(e=>({cls:e?e.className:"",t:e?e.textContent:""}))(document.querySelector("#finishBox .fin-card"))');
  const en = lang === 'en';
  const want = { ok: [/fin-ok/, en ? /Points added/ : /포인트를 받았어요/], cap: [/fin-cap/, en ? /capped at 30/ : /하루 30점까지/], login: [/fin-login/, en ? /Log in/ : /로그인하면/], 'err-then-ok': [/fin-error/, en ? /Get points/ : /다시 받기/], drop: [/fin-error/, en ? /Get points/ : /다시 받기/] }[mode];
  ok(want[0].test(fin.cls) && want[1].test(fin.t), `${tag}: 완주 안내 ${fin.cls} «${fin.t.slice(0, 80)}»`);
  if (mode === 'ok') ok(/\+10P/.test(fin.t) && /130P/.test(fin.t), `${tag}: 받은 금액·잔액을 서버 값 그대로`);
  const paid = await ev(`!!Object.keys(localStorage).find(k=>/story_red-umbrella_paid_/.test(k))`);
  ok(paid === (mode === 'ok' || mode === 'cap'), `${tag}: «오늘 받음» 표시는 성공·상한일 때만 (${paid})`);
  if (mode === 'err-then-ok') {
    await ev('document.getElementById("earnRetry").click()');
    for (let i = 0; i < 40 && !(await ev('!!document.querySelector("#finishBox .fin-ok")')); i++) await sleep(100);
    ok(await ev('window.__earnCalls') === 2 && await ev('!!document.querySelector("#finishBox .fin-ok")'), `${tag}: «다시 받기» 로 받아진다`);
  }
  // 새로고침해도 다시 요청하지 않는다
  const before = reqs.length;
  await send('Page.reload', { ignoreCache: true }); await sleep(900);
  ok(reqs.length === before, `${tag}: 다시 열었다고 포인트 요청이 또 나가지 않는다`);
  ok(await ev('document.querySelector(".sb-n").textContent.trim()==="6 / 6"'), `${tag}: 도장은 남아 있다`);
  // 도장판 단추를 누르면 그 활동으로 간다 · 맨 위가 단추(가려지지 않음)
  const nav = await ev(`(()=>{const b=document.querySelectorAll('#stampBoard .stamp')[4];b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();const t=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return !!t&&(t===b||b.contains(t));})()`);
  ok(nav, `${tag}: 도장 단추가 가려지지 않음`);
  // 처음부터 다시 → 0/6
  await ev('document.getElementById("stampReset").click()');
  ok(await ev('document.querySelector(".sb-n").textContent.trim()==="0 / 6"'), `${tag}: 처음부터 다시 → 0/6`);
}

(async () => {
  ws = new WebSocket(await connect());
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { const p = pend.get(d.id); pend.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); }
    if (d.method === 'Runtime.exceptionThrown') consoleErr.push(d.params.exceptionDetails?.exception?.description || 'exception'); };
  await new Promise((r) => ws.onopen = r);
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
  let runs = 0;
  for (let rep = 0; rep < REPS; rep++) for (const vp of VPS) for (const lang of ['ko', 'en']) for (const mode of MODES) {
    if (process.env.ONLY && !(vp.n + '/' + lang + '/' + mode).includes(process.env.ONLY)) continue;
    const monkey = (rep + runs) % 3 === 0;
    const tag = `${vp.n}/${lang}/${mode}${monkey ? '/원숭이' : ''}#${rep}`;
    try { await runOne(vp, lang, mode, monkey, tag); } catch (e) { ok(false, `${tag}: 예외 ${e.message}`); }
    runs++;
    process.stdout.write(`\r  ${runs}회 · PASS ${pass} FAIL ${fail}   `);
  }
  ok(consoleErr.length === 0, `페이지 예외 0건 (${consoleErr.slice(0, 3).join(' | ')})`);
  console.log(`\n결과: ${runs}회 전 과정 · PASS ${pass} / FAIL ${fail}`);
  if (fails.length) console.log(fails.map((f) => '  ❌ ' + f).join('\n'));
  ws.close(); chrome.kill(); srv.close(); fs.rmSync(PROF, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
})();
