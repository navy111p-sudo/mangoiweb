/* ═══════════════════════════════════════════════════════════════════════
 * 🍯 judgment-sample-browser.mjs — 판단력 훈련 «맛보기» 를 진짜 브라우저에 그려서 잰다 (2026-09-05)
 *
 *   ⚠️ 자동으로 안 돕니다 — `*_harness.mjs` 가 아니라 게이트가 물어 가지 않습니다.
 *      judgment.html 의 로그인 게이트·배너·한도 안내를 건드리면 «사람이» 부르세요:
 *        cd cloudflare-deploy/public && python3 -m http.server 8931 &
 *        /opt/pw-browsers/chromium-1194/chrome-linux/chrome --headless=new --no-sandbox \
 *          --remote-debugging-port=9222 --use-gl=angle --use-angle=swiftshader \
 *          --enable-unsafe-swiftshader --user-data-dir=/tmp/cdpprof about:blank &
 *        node test-harness/manual/judgment-sample-browser.mjs          # 390x844
 *        VW=360 VH=640 node test-harness/manual/judgment-sample-browser.mjs   # 작은 폰
 *
 *   왜 브라우저인가 — 문자열로는 「있다」까지만 보입니다. 여기서 재는 것은
 *   «보이는가 · 눌리는가 · 무엇이 덮는가 · 첫 화면 안에 있는가» 입니다.
 *   🔴 실제로 이 검사가 잡은 것: 맛보기 배너(137px)가 첫 설정 카드의 «선택지» 를
 *      360x640 폰에서 스크롤 밖(y=739 / 화면 640)으로 밀어냈습니다.
 *      배너를 한 줄로 줄여 되돌렸고(43px), 그 과정에서 이번엔 로그인 버튼이 27px 로
 *      작아져 «보이는데 못 누르는» 상태가 된 것도 여기서 잡았습니다.
 *   ⛔ «뜬다» 만 넣지 말 것 — ⑤(로그인한 학생에겐 아무것도 안 바뀐다)가 짝입니다.
 *      그 짝이 없으면 «항상 맛보기» 로 만드는 변이가 그대로 통과합니다.
 *   ℹ️ LLM 을 실제로 부르지 않습니다 — Fetch 도메인으로 /api/judgment/* 를 가로채
 *      가짜 문항을 돌려줍니다(돈이 나가는 경로라 일부러 그렇게 합니다).
 *
 *   playwright-core 가 이 컨테이너에 없어 CDP 로 직접 말합니다(Node 22 는 WebSocket 전역).
 *   ⚠️ 새 탭(/json/new)으로 열면 이 컨테이너의 크로미움이 스크립트를 실행하지 않습니다 —
 *      반드시 «이미 있는 탭»(/json/list)을 잡아 Page.navigate 로 엽니다(CLAUDE.md 2장).
 * ═══════════════════════════════════════════════════════════════════════ */
const BASE = 'http://127.0.0.1:8931';
let PASS = 0, FAIL = 0;
const check = (name, ok, note='') => { ok ? PASS++ : FAIL++; console.log(`  ${ok?'✅':'❌'} ${name}${note?'  — '+note:''}`); };

const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const page = list.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const waits = new Map(); const events = [];
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && waits.has(m.id)) { waits.get(m.id)(m); waits.delete(m.id); }
  else if (m.method) events.push(m);
});
await new Promise(r => ws.addEventListener('open', r));
const send = (method, params={}, sessionId) => new Promise(res => {
  const i = ++id; waits.set(i, res);
  ws.send(JSON.stringify({ id: i, method, params, ...(sessionId?{sessionId}:{}) }));
});
const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) return { __err: r.result.exceptionDetails.text };
  return r.result?.result?.value;
};
await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
await send('Network.setBypassServiceWorker', { bypass: true });
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setFocusEmulationEnabled', { enabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: Number(process.env.VW||390), height: Number(process.env.VH||844), deviceScaleFactor: 1, mobile: false });

const goto = async (url) => {
  await send('Page.navigate', { url });
  await new Promise(r => setTimeout(r, 1400));
};

/* ── 시나리오 API 를 가로채 가짜 문항을 준다 (진짜 LLM 을 안 부른다) ── */
await send('Fetch.enable', { patterns: [{ urlPattern: '*/api/judgment/*' }] });
let capLeft = 3;                 // 3문제 뒤 sample_limit
let sawUids = [];
const fakeQ = { ok:true, situation:'Your friend looks sad at school.', skill_tag:'empathy',
  options:['Are you okay?','Go away.','I do not care.','Whatever.'], correct_index:0,
  option_scores:[5,1,1,1], difficulty:2, band_catalog:[], reading_band:3, band_mode:'auto', age_group:'child' };
(async () => {
  for (;;) {
    const ev = events.shift();
    if (!ev) { await new Promise(r => setTimeout(r, 30)); continue; }
    if (ev.method !== 'Fetch.requestPaused') continue;
    const { requestId, request } = ev.params;
    const u = new URL(request.url);
    let bodyObj;
    if (u.pathname === '/api/judgment/growth' && u.searchParams.get('only') === 'band') {
      sawUids.push(u.searchParams.get('uid'));
      bodyObj = { ok:true, has_band:false, band_catalog:[
        {b:1,ko:'첫걸음',en:'Starter',zh:'入门',dko:'아주 짧은 문장',den:'Very short',dzh:'很短'},
        {b:3,ko:'초급',en:'Elementary',zh:'初级',dko:'과거형',den:'Past tense',dzh:'过去式'}] };
    } else if (u.pathname === '/api/judgment/scenario') {
      try { sawUids.push(JSON.parse(request.postData||'{}').uid); } catch {}
      bodyObj = (capLeft-- > 0) ? fakeQ : { ok:false, error:'sample_limit', limit:12 };
    } else { bodyObj = { ok:true }; }
    const body = Buffer.from(JSON.stringify(bodyObj)).toString('base64');
    await send('Fetch.fulfillRequest', { requestId, responseCode:200,
      responseHeaders:[{name:'Content-Type',value:'application/json'}], body });
  }
})();

console.log('\n[ ① 로그인 안 한 사람이 맛보기로 들어간다 ]');
await goto(BASE + '/judgment.html?_nc=' + Date.now());
await evalJs("localStorage.clear()");
await goto(BASE + '/judgment.html?_nc=' + Date.now());
await new Promise(r => setTimeout(r, 1600));

const st = await evalJs(`(function(){
  var bar=document.getElementById('sampleBar'), stage=document.getElementById('stage');
  var cs=bar?getComputedStyle(bar):null;
  return { barHidden: bar?bar.hidden:null, barDisplay: cs?cs.display:null,
    barText: bar?bar.innerText.slice(0,60):'', barBox: bar?[Math.round(bar.getBoundingClientRect().width),Math.round(bar.getBoundingClientRect().height)]:null,
    stageText: stage?stage.innerText.slice(0,90):'',
    guestUid: localStorage.getItem('mangoi_judg_sample_uid'),
    win: localStorage.getItem('mangoi_judg_sample_from') ? 'set':'none' };
})()`);
check('맛보기 배너가 실제로 보인다', st.barHidden === false && st.barDisplay !== 'none' && st.barBox[1] > 20, JSON.stringify(st.barBox));
check('배너가 «맛보기» 라고 말한다', /맛보기/.test(st.barText||''), (st.barText||'').replace(/\n/g,' ').slice(0,40));
check('게스트 아이디가 guest_ 로 시작한다', /^guest_/.test(st.guestUid||''), st.guestUid);
check('창 시작 시각이 기록된다', st.win === 'set');
check('로그인 안내가 아니라 화면이 진행된다', !/로그인 후 이용/.test(st.stageText||''), (st.stageText||'').replace(/\n/g,' ').slice(0,50));
check('서버에 그 게스트 아이디로 물었다', sawUids.some(u => /^guest_/.test(u||'')), sawUids.slice(0,2).join(','));

console.log('\n[ ② 배너 버튼이 실제로 눌린다 (가려지지 않았나) ]');
const hit = await evalJs(`(function(){
  var a=document.querySelector('#sampleBar a'); if(!a) return {no:true};
  var r=a.getBoundingClientRect();
  var top=document.elementFromPoint(r.left+r.width/2, r.top+r.height/2);
  return { href:a.getAttribute('href'), w:Math.round(r.width), h:Math.round(r.height),
    mine: !!(top && (top===a || a.contains(top))), topTag: top?top.tagName+'.'+(top.className||''):null };
})()`);
check('배너에 로그인 버튼이 있다', hit && !hit.no && hit.href === '/');
check('그 버튼이 맨 위에 있다(가려지지 않음)', !!hit.mine, hit.topTag);
check('탭 표적이 충분히 크다(44px 권장·최소 32)', hit.h >= 32, hit.w+'x'+hit.h);

console.log('\n[ ③ 하루가 지나면 로그인 안내로 돌아간다 ]');
await evalJs("localStorage.setItem('mangoi_judg_sample_from', String(Date.now() - 25*3600*1000))");
await goto(BASE + '/judgment.html?_nc=' + Date.now());
await new Promise(r => setTimeout(r, 900));
const st3 = await evalJs(`(function(){
  var bar=document.getElementById('sampleBar'), stage=document.getElementById('stage');
  return { barHidden: bar?bar.hidden:null, stageText: stage?stage.innerText.slice(0,80):'' };
})()`);
check('창이 지나면 배너가 안 뜬다', st3.barHidden === true);
check('창이 지나면 로그인 안내가 뜬다', /로그인 후 이용|log in/i.test(st3.stageText||''), (st3.stageText||'').replace(/\n/g,' ').slice(0,40));

console.log('\n[ ④ 맛보기 한도 — «고장» 이 아니라 «오늘 몫» 이라고 말한다 ]');
await evalJs("localStorage.removeItem('mangoi_judg_sample_from')");
capLeft = 0;                       // 다음 요청부터 곧바로 한도
await goto(BASE + '/judgment.html?_nc=' + Date.now());
await new Promise(r => setTimeout(r, 1500));
/* 첫 설정 카드를 지나야 시나리오를 부른다 — 「그냥 바로 시작할래요」를 실제로 누른다 */
const clicked = await evalJs(`(function(){
  var b=document.querySelector('#stage [data-s="skip"]'); if(!b) return false;
  b.scrollIntoView({block:'center'});
  var r=b.getBoundingClientRect();
  var top=document.elementFromPoint(r.left+r.width/2, r.top+r.height/2);
  if(!(top && (top===b || b.contains(top) || top.contains(b)))) {
    return JSON.stringify({ covered:true, rect:[Math.round(r.left),Math.round(r.top),Math.round(r.width),Math.round(r.height)],
      vh: innerHeight, vw: innerWidth, scrollY: Math.round(scrollY),
      top: top ? top.tagName+'#'+(top.id||'')+'.'+(top.className||'') : null,
      stack: (document.elementsFromPoint(r.left+r.width/2, r.top+r.height/2)||[]).slice(0,4).map(function(e){return e.tagName+'#'+(e.id||'')+'.'+(String(e.className||'').slice(0,24));}) });
  }
  b.click(); return true;
})()`);
check('첫 설정 카드의 「바로 시작」이 실제로 눌린다', clicked === true, String(clicked));
await new Promise(r => setTimeout(r, 2200));
const st4 = await evalJs(`(function(){
  var stage=document.getElementById('stage');
  var t=stage?stage.innerText:'';
  var a=stage?stage.querySelector('a[href="/"]'):null;
  return { text:t.replace(/\\n/g,' ').slice(0,140), hasLogin:!!a,
    retry: /다시 시도|Try again/i.test(t), broke: /불러오지 못|Could not load/i.test(t) };
})()`);
check('한도일 때 «오늘 맛보기는 여기까지» 로 말한다', /여기까지|today's sample|到这里/i.test(st4.text), st4.text.slice(0,60));
check('«문제를 불러오지 못했어요» 로 말하지 않는다', !st4.broke, st4.text.slice(0,60));
check('「다시 시도」 버튼을 두지 않는다', !st4.retry);
check('로그인으로 가는 길이 있다', st4.hasLogin);

console.log('\n[ ④-2 배너가 첫 설정 카드를 화면 밖으로 밀지 않았나 (폰 390x844) ]');
/* 🔴 CLAUDE.md 2장 「첫 화면에 «정하세요» 카드를 띄웠는데 아무도 안 고름」 —
   위에 상자를 하나 더 얹으면 정작 고를 카드가 스크롤 밖으로 밀린다. 배너를 넣은 값을 재서 확인한다. */
await evalJs("localStorage.clear()");
capLeft = 3;
await goto(BASE + '/judgment.html?_nc=' + Date.now());
await new Promise(r => setTimeout(r, 1600));
const fold = await evalJs(`(function(){
  var bar=document.getElementById('sampleBar'), stage=document.getElementById('stage');
  var card=stage?stage.getBoundingClientRect():null;
  var skip=document.querySelector('#stage [data-s="skip"]');
  var first=document.querySelector('#stage .lvm-btn, #stage [data-s]');
  return { vh: innerHeight, barH: bar&&!bar.hidden?Math.round(bar.getBoundingClientRect().height):0,
    cardTop: card?Math.round(card.top):null,
    firstChoiceTop: first?Math.round(first.getBoundingClientRect().top):null,
    skipTop: skip?Math.round(skip.getBoundingClientRect().top):null,
    explainOpen: !!(document.getElementById('explain')||{}).classList && document.getElementById('explain').classList.contains('open') };
})()`);
check('④-2 설명 상자가 첫 설정 화면에서는 접혀 있다', fold.explainOpen === false);
check('④-2 설정 카드가 첫 화면 안에서 시작한다', fold.cardTop !== null && fold.cardTop < fold.vh,
  'top=' + fold.cardTop + ' / vh=' + fold.vh + ' (배너 ' + fold.barH + 'px)');
const above = await evalJs(`(function(){
  var out=[], b=document.body;
  var el=document.querySelector('#stage');
  var n=b.firstElementChild;
  function walk(root){
    for(var i=0;i<root.children.length;i++){
      var c=root.children[i]; var r=c.getBoundingClientRect();
      if(r.top >= 450) continue;
      if(r.height>=8) out.push((c.tagName+'#'+(c.id||'')+'.'+String(c.className||'').split(' ')[0]).slice(0,34)+' h='+Math.round(r.height)+' top='+Math.round(r.top));
      if(out.length<14 && c.children.length && r.height>60 && !c.id) walk(c);
    }
  }
  walk(b);
  return out.slice(0,14);
})()`);
console.log('     ↳ 카드 위쪽 구성:', JSON.stringify(above, null, 0));
check('④-2 첫 선택지가 스크롤 없이 보인다', fold.firstChoiceTop !== null && fold.firstChoiceTop < fold.vh,
  'top=' + fold.firstChoiceTop);

console.log('\n[ ⑤ 로그인한 학생은 아무것도 안 바뀐다 ]');
await evalJs(`localStorage.clear(); localStorage.setItem('mangoi_logged_user', JSON.stringify({uid:'testkid', name:'테스트'}))`);
capLeft = 3;
await goto(BASE + '/judgment.html?_nc=' + Date.now());
await new Promise(r => setTimeout(r, 1600));
const st5 = await evalJs(`(function(){
  var bar=document.getElementById('sampleBar');
  return { barHidden: bar?bar.hidden:null, guestUid: localStorage.getItem('mangoi_judg_sample_uid'),
    win: localStorage.getItem('mangoi_judg_sample_from') };
})()`);
check('로그인 상태에서는 배너가 안 뜬다', st5.barHidden === true);
check('로그인 상태에서는 게스트 아이디를 안 만든다', !st5.guestUid, String(st5.guestUid));
check('로그인 상태에서는 창도 안 연다', !st5.win, String(st5.win));
check('서버에 진짜 아이디로 물었다', sawUids.includes('testkid'), sawUids.slice(-2).join(','));

console.log('\n────────────────────────────────');
console.log(`총 ${PASS+FAIL}건 중 ✅ ${PASS} 통과 / ❌ ${FAIL} 실패`);
ws.close();
process.exit(FAIL ? 1 : 0);
