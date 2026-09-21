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
  /* ⚠️ 앞 회차의 localStorage 가 넘어오면 그 뒤 검사가 통째로 헛돕니다 —
     실제로 `mangoi_zh_learner` 가 남아 「감춰진 칸이 한 칸」이 []로 나왔습니다(CLAUDE.md 2장).
     ⟹ 회차마다 «지금 재려는 상태» 를 명시적으로 세웁니다(③이 zh 를 따로 켭니다). */
  await ev(`try{localStorage.setItem('mangoi_onboard_v1','skip:0');localStorage.setItem('mangoi_lang','ko');localStorage.removeItem('mangoi_zh_learner');}catch(e){}`);
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

  /* ①-b 손가락 표적 — «보이는 크기» 와 «누를 수 있는 크기» 는 다른 값입니다.
     투명한 ::after 로 넓혀 두었으므로 «보이는가» 로는 원리상 확인할 수 없습니다.
     ⛔ 「44px 로 키웠다」로 읽지 마세요 — 상자는 34px 그대로이고 표적만 넓습니다. */
  const hit = await ev(`(function(){
    var a=document.querySelector('.home-tracks .ht-ai'), b=document.querySelector('.home-tracks .ht-live');
    function rect(el){var r=el.getBoundingClientRect();return {t:Math.round(r.top),h:Math.round(r.height),l:Math.round(r.left),w:Math.round(r.width)};}
    var on={a:rect(a),b:rect(b)};
    var st=document.createElement('style');
    st.textContent='.home-tracks a.ht-track::after{content:none!important}';
    document.head.appendChild(st);
    var off={a:rect(a),b:rect(b)};
    st.remove();
    var ra=a.getBoundingClientRect();
    function hitAt(y){var el=document.elementFromPoint(ra.left+ra.width/2, y);return !!(el && (el===a || a.contains(el)));}
    var top=ra.top, bot=ra.bottom, y;
    for(y=Math.round(ra.top); y>Math.round(ra.top)-14; y--){ if(hitAt(y)) top=y; else break; }
    for(y=Math.round(ra.bottom); y<Math.round(ra.bottom)+14; y++){ if(hitAt(y)) bot=y; else break; }
    var rb=b.getBoundingClientRect();
    var mid=document.elementFromPoint(rb.left+rb.width/2, rb.top+rb.height/2);
    return {sameLayout: JSON.stringify(on)===JSON.stringify(off), on:on, off:off,
      hitH:Math.round(bot-top), boxH:Math.round(ra.height),
      liveIntact: !!(mid && b.contains(mid)), liveTag: mid?mid.tagName+'.'+(mid.className||''):'null'};
  })()`);
  ok('전제: 보이는 상자는 여전히 작다 (44px 로 «키운» 게 아니다)', hit.boxH > 0 && hit.boxH < 40, hit.boxH + 'px');
  ok('손가락 표적이 44px 이상', hit.hitH >= 44, `상자 ${hit.boxH}px → 표적 ${hit.hitH}px`);
  ok('짝: 그런데 레이아웃은 «한 픽셀도» 안 바뀐다', hit.sameLayout === true, JSON.stringify({ on: hit.on, off: hit.off }));
  /* ⚠️ 이 줄은 «가운데» 만 봅니다 — 좌우로 몇 px 넓히는 변이는 여기서 안 걸립니다
     (실측: left/right 를 -6px 로 열어도 ❌ 0건). 그쪽은 자동 하니스 ④절이
     «좌우가 0인가» 로 봅니다 — 둘이 짝입니다. */
  ok('짝: 넓힌 표적이 옆 트랙(1번)을 침범하지 않는다', hit.liveIntact === true, hit.liveTag);

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
  /* ⛔ «몇 칸인가» 를 숫자로 못 박지 마세요 — 열 번째 도구를 정당하게 더하면
     보장은 세지는데 검사만 빨간불입니다(CLAUDE.md 2장 「목록·개수를 못 박은 검사」).
     물어야 할 것은 «전부 나오는가»(= 감춰진 것 말고 전부) 입니다. */
  const total = o.shown.length + o.hidden.length;
  ok('전제: 목록이 비어 있지 않다', total >= 8, total + '칸');
  ok('A.i 학습 도구가 «모두» 나온다 (감춰진 것 말고 전부)',
    o.shown.length === total - o.hidden.length && o.shown.length > 0,
    o.shown.length + '/' + total + '칸: ' + o.shown.join(' / '));
  /* 🇨🇳 2026-08-24 학원장 검수로 «중국어 수강생에게만» 보이는 칸입니다(idx-allmenu.js 의 hideZhStaticEntries).
     ⛔ 「모두 나오게」를 이유로 그 결정을 지우지 마세요 — 사람이 승인한 결정입니다.
     ⚠️ 이 짝 검사는 «지금 정책» 을 계약으로 굳힙니다 — 사람이 「모두에게 보이기」로 정하는 날
        이 줄이 «먼저» 빨간불이 됩니다. 그때는 느슨하게 풀지 말고 **새 경계로 옮겨 적으세요.** */
  ok('짝: 감춰진 것은 중국어 복습퀴즈 «한 칸뿐» 이다 (지워진 게 아니다)',
    o.hidden.length === 1 && /중국어|Chinese/.test(o.hidden[0] || ''), JSON.stringify(o.hidden));

  /* ── ③ 짝 — 중국어 수강생에게는 9칸이 나온다 (게이트가 «늘 감추기» 가 아님) ── */
  console.log('\n③ 짝: 중국어 수강생에게는 그 칸도 나온다');
  await goto();
  /* ⚠️ goto() 가 zh 를 지우므로 «켜고 나서 다시 goto 하면» 안 됩니다 —
     새로고침 없이 그 자리에서 켜고 오버레이만 다시 엽니다. */
  await ev(`try{localStorage.setItem('mangoi_zh_learner','1')}catch(e){}`);
  await ev(`(function(){var o=document.getElementById('ai-friends-ov'); if(o&&o.parentNode) o.parentNode.removeChild(o);})()`);
  await clickTrack();
  const z = await ev(`(function(){
    var ov=document.getElementById('ai-friends-ov'); if(!ov) return {n:-1};
    var all=ov.querySelectorAll('.aif-item'), n=0;
    [].forEach.call(all,function(b){var r=b.getBoundingClientRect(); if(r.width>0&&r.height>0) n++;});
    return {n:n, total:all.length};
  })()`);
  ok('중국어 수강생에게는 «하나도 안 감춰진다» (보이는 수 = 전체 수)',
    z.n > 0 && z.n === z.total && z.n === total, `보임 ${z.n} / 전체 ${z.total} (앞에서 잰 전체 ${total})`);
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

  /* ── ⑥ 1번 트랙(화상수업) — 「망고아이란? ▸ 원어민 선생님과 1:1 / 1:2 수업」 ──
     📜 2026-09-21 사장님 「왼쪽은 1번, 오른쪽은 2번」. 그 전에는 둘이 똑같이 생겼는데
        오른쪽만 눌려서 「이거 두개 카드 연결된거야?」라는 물음이 나왔습니다. */
  console.log('\n⑥ 1번 트랙을 누르면 「원어민 선생님과 1:1 / 1:2 수업」 카드가 열린다');
  await goto();
  const m1 = await ev(`(function(){
    var a=document.querySelector('.home-tracks .ht-live');
    if(!a) return {none:true};
    var cs=getComputedStyle(a), r=a.getBoundingClientRect();
    var top=document.elementFromPoint(r.left+r.width/2, r.top+r.height/2);
    return {tag:a.tagName, cursor:cs.cursor, deco:cs.textDecorationLine,
      chev:(a.querySelector('.ht-go')||{}).textContent||'',
      inside:!!(top&&a.contains(top)), topTag: top?top.tagName+'.'+(top.className||''):'null'};
  })()`);
  ok('전제: 1번도 <a> 다', m1.tag === 'A', m1.tag);
  ok('› 가 그려진다 (2번과 «같은» 표시 — 어느 쪽이 눌리는지 갈리지 않게)', (m1.chev||'').trim() === '›', JSON.stringify(m1.chev));
  ok('cursor:pointer · 밑줄 없음', m1.cursor === 'pointer' && m1.deco === 'none', m1.cursor + ' / ' + m1.deco);
  ok('아무도 안 덮는다', m1.inside === true, m1.topTag);
  ok('전제: 누르기 «전» 에는 「망고아이란?」이 없다', (await ev(`!!document.getElementById('about-mangoi-ov')`)) === false);
  const b1 = await ev(`(function(){var r=document.querySelector('.home-tracks .ht-live').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
  for (const type of ['mousePressed', 'mouseReleased'])
    await send('Input.dispatchMouseEvent', { type, x: b1.x, y: b1.y, button: 'left', clickCount: 1 });
  await sleep(700);
  const d1 = await ev(`(function(){
    var ov=document.getElementById('about-mangoi-ov'); if(!ov) return {open:false};
    var lv=ov.querySelector('.abm-view-list'), dv=ov.querySelector('.abm-view-detail');
    return {open:getComputedStyle(ov).display!=='none',
      listShown:getComputedStyle(lv).display!=='none', detailShown:getComputedStyle(dv).display!=='none',
      title:(ov.querySelector('.abm-dtitle')||{}).textContent||'',
      cta:(ov.querySelector('.abm-dcta')||{}).textContent||'',
      pts:ov.querySelectorAll('.abm-dpts li').length, search:location.search};
  })()`);
  ok('열렸다', d1.open === true, JSON.stringify(d1).slice(0, 180));
  /* ⛔ 「목록」이 아니라 「자세히」여야 합니다 — 사장님이 가리킨 것은 그 카드입니다. */
  ok('«목록» 이 아니라 «자세히» 가 보인다', d1.detailShown === true && d1.listShown === false,
    `list=${d1.listShown} detail=${d1.detailShown}`);
  ok('그 카드가 맞다 — 「원어민 선생님과 1:1 / 1:2 수업」', d1.title === '원어민 선생님과 1:1 / 1:2 수업', d1.title);
  ok('강점 3줄과 CTA 가 그려진다', d1.pts === 3 && /수업 신청하러 가기/.test(d1.cta), d1.pts + '줄 / ' + d1.cta);
  ok('같은 화면에서 열린다 (주소로 안 나간다)', !/menu=/.test(d1.search || ''), d1.search);
  await ev(`document.querySelector('#about-mangoi-ov .abm-back').click()`);
  await sleep(300);
  const back1 = await ev(`(function(){var ov=document.getElementById('about-mangoi-ov');
    return {list:getComputedStyle(ov.querySelector('.abm-view-list')).display!=='none', n:ov.querySelectorAll('.abm-item').length};})()`);
  ok('「← 목록으로」로 전체 카드 목록에 간다', back1.list === true && back1.n >= 10, JSON.stringify(back1));

  console.log('\n⑥-b 주소로도 열린다 — /?menu=about-tutor');
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html?menu=about-tutor&_nc=${Date.now()}` });
  for (let i = 0; i < 60; i++) { await sleep(200); if (await ev('document.readyState==="complete"')) break; }
  await sleep(1100);
  const u1 = await ev(`(function(){var ov=document.getElementById('about-mangoi-ov'); if(!ov) return {open:false};
    return {open:getComputedStyle(ov).display!=='none',
      detail:getComputedStyle(ov.querySelector('.abm-view-detail')).display!=='none',
      title:(ov.querySelector('.abm-dtitle')||{}).textContent||'', search:location.search};})()`);
  ok('주소만으로 그 카드가 열린다', u1.open === true && u1.detail === true, JSON.stringify(u1));
  ok('제목이 같다', u1.title === '원어민 선생님과 1:1 / 1:2 수업', u1.title);
  /* ⛔ menu «만» 지웁니다 — pathname 으로 갈아치우면 ?room= 과 해시까지 조용히 잃습니다. */
  ok('주소에서 menu 만 지워진다', !/menu=/.test(u1.search || ''), u1.search);

  console.log('\n⑥-c 짝 — 옛 입구는 한 글자도 안 바뀌었다');
  await goto();
  const plain = await ev(`(function(){ window.openAboutMangoi();
    var ov=document.getElementById('about-mangoi-ov');
    return {list:getComputedStyle(ov.querySelector('.abm-view-list')).display!=='none',
      detail:getComputedStyle(ov.querySelector('.abm-view-detail')).display!=='none'};})()`);
  ok('짝: 인자 없이 부르면 예전처럼 «목록» 이 열린다', plain.list === true && plain.detail === false, JSON.stringify(plain));
  const unk = await ev(`(function(){ var ov=document.getElementById('about-mangoi-ov'); ov.style.display='none';
    window.openAboutMangoi('__없는열쇠__');
    return {detail:getComputedStyle(ov.querySelector('.abm-view-detail')).display!=='none',
      list:getComputedStyle(ov.querySelector('.abm-view-list')).display!=='none'};})()`);
  ok('짝: 모르는 열쇠는 «지어내지 않고» 목록 그대로', unk.detail === false && unk.list === true, JSON.stringify(unk));

} catch (e) {
  fail++; console.log('  ❌ 검사 도중 예외 — ' + String(e).slice(0, 300));
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
bye(fail ? 1 : 0);
