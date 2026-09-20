#!/usr/bin/env node
/**
 * 🎯 홈 히어로 «2번 트랙»(A.i 학습) — 진짜 브라우저에서 눌러 본다
 *
 *   PW_DIR=/tmp/pw node test-harness/manual/home-hero-track-browser.mjs
 *
 * ⚠️ 자동으로 안 돕니다 — manual/ 규약상 게이트가 물어 가지 않습니다. 사람이 부릅니다.
 *   자동 하니스(test-harness/home_hero_track_harness.mjs)는 «onclick 이 무슨 답을 내는가» 까지만
 *   봅니다. 「보인다」·「눌린다」·「열린다」는 다 다른 값이라 여기서 좌표로 잽니다(CLAUDE.md 2장).
 *
 * 📜 2026-09-20 사장님 「2번은 A.i와 친구하기가 모두 나오게 해줘 · 이 페이지가 나오게 해줘」
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const PORT = 8941, CDP_PORT = 9341;
const PW = process.env.PW_DIR || '/tmp/pw-hero';
const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome']
  .find(p => existsSync(p));
if (!CHROME) { console.log('⏭ 크로미움을 못 찾았습니다 — 건너뜁니다.'); process.exit(0); }

let pass = 0, fail = 0, srv, br;
const ok = (n, c, d = '') => { c ? (pass++, console.log('  ✅ ' + n)) : (fail++, console.log('  ❌ ' + n + (d ? ' — ' + d : ''))); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

srv = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: 'cloudflare-deploy/public', stdio: 'ignore' });
br = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
  '--remote-debugging-port=' + CDP_PORT, '--user-data-dir=' + PW, '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' });
const bye = (code) => { try { srv.kill(); } catch (e) {} try { br.kill(); } catch (e) {} process.exit(code); };
await sleep(3500);

let ws, id = 0; const waiters = new Map();
try {
  const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
  const page = list.find(t => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
} catch (e) { console.log('⏭ CDP 연결 실패 — 건너뜁니다: ' + e.message); bye(0); }
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; waiters.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (x) => {
  const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300));
  return r.result?.result?.value;
};
const goto = async () => {
  await send('Page.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  /* ⚠️ 서비스워커도 함께 끄세요 — 캐시만 끄면 «고치기 전» 사본이 나와 변이시험이 헛돕니다. */
  await send('Network.setBypassServiceWorker', { bypass: true });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html?_nc=${Date.now()}` });
  for (let i = 0; i < 60; i++) { await sleep(200); if (await ev('document.readyState==="complete"')) break; }
  /* 빈 브라우저는 «첫 방문자» 입니다 — 코치마크가 히어로를 덮습니다(CLAUDE.md 2장). */
  await ev(`try{localStorage.setItem('mangoi_onboard_v1','skip:0');localStorage.setItem('mangoi_lang','ko');}catch(e){}`);
  await sleep(1100);
};
const clickTrack = async () => {
  const b = await ev(`(function(){var r=document.querySelector('.home-tracks .ht-ai').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
  for (const type of ['mousePressed', 'mouseReleased'])
    await send('Input.dispatchMouseEvent', { type, x: b.x, y: b.y, button: 'left', clickCount: 1 });
  await sleep(700);
};

try {
  /* ── ① 보인다 · 눌 수 있게 생겼다 ─────────────────────────────── */
  console.log('① 2번 트랙이 «누를 수 있는 것» 으로 보인다');
  await goto();
  const m = await ev(`(function(){
    var a=document.querySelector('.home-tracks .ht-ai');
    if(!a) return {none:true};
    var cs=getComputedStyle(a), r=a.getBoundingClientRect();
    var top=document.elementFromPoint(r.left+r.width/2, r.top+r.height/2);
    return {tag:a.tagName, w:Math.round(r.width), h:Math.round(r.height), top:Math.round(r.top),
      cursor:cs.cursor, deco:cs.textDecorationLine, color:cs.color,
      inside:!!(top&&a.contains(top)), topTag: top?top.tagName+'.'+(top.className||''):'null',
      chev:(a.querySelector('.ht-go')||{}).textContent||''};
  })()`);
  ok('전제: 화면에 실제로 그려져 있다', !m.none && m.w > 0 && m.h > 0, JSON.stringify(m));
  ok('전제: 첫 화면 안에 있다', m.top > 0 && m.top < 900, 'top=' + m.top);
  ok('<a> 다', m.tag === 'A', m.tag);
  /* ⚠️ 이 줄은 «지키는 것이 없습니다» — a[href] 는 브라우저 기본 스타일이 이미 pointer 라,
     CSS 에서 cursor:pointer 를 지워도 계산값이 안 바뀝니다(변이시험 Ⓒ 실측 ❌ 0건).
     «<div> 로 되돌리기» 는 바로 윗줄이 잡고, CSS 계약 자체는 자동 하니스 ④절이 봅니다. */
  ok('cursor:pointer (참고 — a[href] 기본값이라 이 줄만으로는 회귀를 못 잡습니다)', m.cursor === 'pointer', m.cursor);
  ok('밑줄·기본 링크색이 안 남는다', m.deco === 'none' && m.color !== 'rgb(0, 0, 238)', m.deco + ' / ' + m.color);
  /* 「있다」·「보인다」·「눌린다」는 다 다릅니다 — 맨 위가 누구인지 재세요. */
  ok('아무도 안 덮는다 (맨 위가 자기 자신)', m.inside, m.topTag);
  ok('› 표시가 그려진다', m.chev.trim() === '›', JSON.stringify(m.chev));

  /* ── ② 누르면 그 페이지가 열린다 ──────────────────────────────── */
  console.log('\n② 눌러 보면 「AI와 친구하기」가 열린다');
  ok('전제: 누르기 «전» 에는 목록이 없다', (await ev(`!!document.getElementById('ai-friends-ov')`)) === false);
  await clickTrack();
  const o = await ev(`(function(){
    var ov=document.getElementById('ai-friends-ov');
    if(!ov) return {open:false};
    var all=[].map.call(ov.querySelectorAll('.aif-item'),function(b){
      var r=b.getBoundingClientRect();
      return {name:(b.querySelector('b')||{}).textContent||'', vis:r.width>0&&r.height>0};
    });
    return {open:getComputedStyle(ov).display!=='none',
      title:(ov.querySelector('.aif-title')||{}).textContent||'',
      shown:all.filter(function(x){return x.vis;}).map(function(x){return x.name;}),
      hidden:all.filter(function(x){return !x.vis;}).map(function(x){return x.name;}),
      search:location.search};
  })()`);
  ok('목록이 열렸다', o.open === true, JSON.stringify(o).slice(0, 200));
  ok('제목이 「AI와 친구하기」다', (o.title || '').trim() === 'AI와 친구하기', o.title);
  ok('같은 화면에서 열린다 (주소로 안 나간다)', !/menu=aitools/.test(o.search || ''), o.search);
  ok('A.i 학습 도구가 «모두» 나온다 (8칸)', o.shown.length === 8, o.shown.length + '칸: ' + o.shown.join(' / '));
  /* 🇨🇳 2026-08-24 학원장 검수로 «중국어 수강생에게만» 보이는 칸입니다(idx-allmenu.js 의 hideZhLearner).
     ⛔ 「모두 나오게」를 이유로 그 결정을 지우지 마세요 — 사람이 승인한 결정입니다. */
  ok('짝: 중국어 복습퀴즈는 «지워진 게 아니라 감춰져» 있다',
    o.hidden.length === 1 && /중국어|Chinese/.test(o.hidden[0] || ''), JSON.stringify(o.hidden));

  /* ── ③ 짝 — 중국어 수강생에게는 9칸이 나온다 (게이트가 «늘 감추기» 가 아님) ── */
  console.log('\n③ 짝: 중국어 수강생에게는 그 칸도 나온다');
  await goto();
  await ev(`try{localStorage.setItem('mangoi_zh_learner','1')}catch(e){}`);
  await goto();
  await clickTrack();
  const z = await ev(`(function(){
    var ov=document.getElementById('ai-friends-ov'); if(!ov) return {n:-1};
    var n=0; [].forEach.call(ov.querySelectorAll('.aif-item'),function(b){var r=b.getBoundingClientRect(); if(r.width>0&&r.height>0) n++;});
    return {n:n};
  })()`);
  ok('중국어 수강생에게는 9칸이 보인다', z.n === 9, z.n + '칸');
  await ev(`try{localStorage.removeItem('mangoi_zh_learner')}catch(e){}`);

  /* ── ④ 🌐 를 눌러도 두 줄과 › 가 살아남는다 ────────────────────── */
  console.log('\n④ 🌐 를 눌러도 안쪽이 안 사라진다');
  await goto();
  const i18n = await ev(`(function(){
    try{ window.setLang ? window.setLang('en') : (window.toggleLang && window.toggleLang()); }catch(e){ return {err:String(e)}; }
    var a=document.querySelector('.home-tracks .ht-ai');
    return {when:!!a.querySelector('.ht-when'), what:!!a.querySelector('.ht-what'),
      chev:!!a.querySelector('.ht-go'), aria:a.getAttribute('aria-label')||'',
      txt:a.textContent.replace(/\\s+/g,' ').trim()};
  })()`);
  ok('첫 줄이 남는다', i18n.when === true, JSON.stringify(i18n));
  ok('둘째 줄이 남는다', i18n.what === true);
  ok('› 가 남는다', i18n.chev === true, i18n.txt);
  ok('aria-label 이 영어로 바뀐다', /Play-with-AI|Open the/.test(i18n.aria), i18n.aria);

  /* ── ⑤ 짝 — 여는 함수가 없으면 «막지 않고» 폴백 주소로 간다 ─────── */
  console.log('\n⑤ 짝: 여는 함수가 없으면 폴백 주소가 산다');
  await goto();
  const fb = await ev(`(function(){
    delete window.openAiFriendsOverlay;
    var a=document.querySelector('.home-tracks .ht-ai');
    var e=new MouseEvent('click',{bubbles:true,cancelable:true});
    a.dispatchEvent(e);
    return {prevented:e.defaultPrevented};
  })()`);
  ok('막지 않는다 (preventDefault 안 함)', fb.prevented === false, JSON.stringify(fb));
  await sleep(1800);
  const landed = await ev(`(function(){return {ov:!!document.getElementById('ai-friends-ov'), s:location.search};})()`);
  ok('브라우저가 폴백 주소를 따라가 거기서도 목록이 열린다', landed.ov === true, JSON.stringify(landed));
} catch (e) {
  fail++; console.log('  ❌ 검사 도중 예외 — ' + String(e).slice(0, 300));
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
bye(fail ? 1 : 0);
