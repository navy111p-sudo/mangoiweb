// -*- coding: utf-8 -*-
// 🎬 판단력 훈련 첫 진입 설정 카드 — **진짜 브라우저** 검사 (사람이 직접 부릅니다)
//   실행:  cd cloudflare-deploy/public && python3 -m http.server 8899 &
//          node test-harness/manual/judgment-first-setup-browser.mjs
//
//   ⚠️ manual/ 규약상 이름이 `*_harness.mjs` 가 아니라 **게이트가 물어 가지 않습니다.**
//      첫 설정 카드·부팅 분기·프리페치를 건드리면 **사람이 불러야** 합니다.
//
//   왜 필요한가 — 문자열 하니스는 «어디에 그려졌나»·«순서가 맞나»·«정말 눌리나»를 못 봅니다.
//   이 저장소에서 실제로 그 틈으로 나간 사고가 여럿입니다(짧은 라벨이 낱글자로 쪼개짐,
//   pointerdown 과 click 이 서로를 뒤집음, 「열렸다」와 「보인다」가 다름).
//
//   ⚠️ file:// 로 열면 <script src="/js/…"> 가 전부 404 라 아무 일도 안 일어납니다 — HTTP 로 띄우세요.
//   ⚠️ 스텁: 로그인·시나리오 API 를 가로채 씨앗값을 돌려줍니다(LLM 을 부르지 않습니다).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8899';
const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome']
  .find((p) => existsSync(p));
if (!CHROME) { console.error('크로미움을 찾지 못했습니다'); process.exit(2); }

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond, extra) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name + (extra ? ` — ${extra}` : '')); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${cond ? '' : (extra ? ` — ${extra}` : '')}`);
}

const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9333', '--no-sandbox',
  '--disable-dev-shm-usage', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
process.on('exit', () => { try { proc.kill(); } catch {} });

async function waitPort() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch('http://127.0.0.1:9333/json/version'); if (r.ok) return (await r.json()).webSocketDebuggerUrl; } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('CDP 포트가 안 열립니다');
}

const wsUrl = await waitPort();
const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let msgId = 0; const waiting = new Map();
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
});
function send(method, params = {}, sessionId) {
  const id = ++msgId;
  return new Promise((res) => { waiting.set(id, res); ws.send(JSON.stringify({ id, method, params, sessionId })); });
}

const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' });
const { result: { sessionId } } = await send('Target.attachToTarget', { targetId, flatten: true });
const S = (m, p) => send(m, p, sessionId);
await S('Page.enable'); await S('Runtime.enable');
// 폰 폭. ⚠️ 헤드리스 최소 뷰포트가 500px 이라 그냥 --window-size 로 찍으면 «잘렸다»고 오진합니다(CLAUDE.md 2장).
//    그래서 창 크기가 아니라 CDP 로 메트릭을 덮어씁니다.
await S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

// 스텁 — 서버를 안 부르고 씨앗값을 돌려줍니다. 시나리오 요청은 «몇 번 나갔는지»도 셉니다.
const STUB = `
window.__net = { scenario: 0, band: 0, lastBody: null };
localStorage.setItem('mangoi_logged_user', JSON.stringify({uid:'qa_first_setup', name:'QA'}));
localStorage.removeItem('mangoi_judg_setup_v1');
localStorage.setItem('mangoi_lang','ko');
var CAT = [1,2,3,4,5,6,7,8].map(function(b){ return {band:b, lv:'Lv '+b, ko:'범주'+b, en:'Band '+b, zh:'级'+b,
  dko:'설명'+b, den:'desc'+b, dzh:'说明'+b}; });
var _f = window.fetch;
window.fetch = function(u, o){
  var s = String(u);
  if(s.indexOf('only=band') >= 0){
    window.__net.band++;
    return Promise.resolve(new Response(JSON.stringify({ok:true, has_band:false, band_catalog:CAT}),
      {headers:{'Content-Type':'application/json'}}));
  }
  if(s.indexOf('/api/judgment/scenario') >= 0){
    window.__net.scenario++;
    try{ window.__net.lastBody = JSON.parse(o && o.body || '{}'); }catch(e){}
    return Promise.resolve(new Response(JSON.stringify({ok:true, sid:'qa1',
      situation:'Your teacher asks you to hand in your homework tomorrow morning.',
      options:['Okay, I will bring it.','Sure thing, dude.','No way!','I forgot it again.'],
      correct_index:0, option_scores:[100,50,20,30], difficulty:3, why:'polite',
      reading_band:3, reading_band_label:'Lv 9-12', band_mode:'auto', age_group:(window.__net.lastBody&&window.__net.lastBody.age_group)||'child',
      band_catalog:CAT, based_on:{band_src:'default'}}), {headers:{'Content-Type':'application/json'}}));
  }
  return _f.apply(this, arguments);
};
`;
await S('Page.addScriptToEvaluateOnNewDocument', { source: STUB });

async function go(url) {
  await S('Page.navigate', { url });
  await new Promise((r) => setTimeout(r, 1400));
}
async function evalJs(expr) {
  const r = await S('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value;
}

console.log('\n[ 1. 첫 진입 — 카드가 «즉시» 뜨는가 (LLM 대기 없이) ]');
await go(BASE + '/judgment.html');
{
  const st = await evalJs(`(function(){
    var t = document.querySelector('.lvp-title');
    return { title: t ? t.textContent.trim() : '', ages: document.querySelectorAll('.su-age').length,
      choices: document.querySelectorAll('[data-s]').length, band: window.__net.band, scen: window.__net.scenario };
  })()`);
  check('카드 제목이 떠 있다', /시작하기 전에/.test(st.title), st.title);
  check('① 나이대 버튼이 2개', st.ages === 2, String(st.ages));
  check('② 갈래 버튼이 4개(AI·직접·레벨찾기·바로시작)', st.choices === 4, String(st.choices));
  check('부팅 판정을 KV 조회 1회로 끝냈다', st.band === 1, String(st.band));
  check('카드가 떠 있는 동안 첫 문제를 미리 만들고 있다', st.scen === 1, String(st.scen));
}

console.log('\n[ 2. 폰 폭 390px — 가로로 넘치거나 글자가 쪼개지지 않는가 ]');
{
  const st = await evalJs(`(function(){
    var doc = document.documentElement;
    function lines(el){ if(!el) return 0; var lh = parseFloat(getComputedStyle(el).lineHeight) || 16;
      return Math.round(el.getBoundingClientRect().height / lh); }
    var t = document.querySelectorAll('.lvm-t');
    var worst = 0, worstTxt = '';
    for(var i=0;i<t.length;i++){ var n = lines(t[i]); if(n > worst){ worst = n; worstTxt = t[i].textContent.trim(); } }
    // ①의 두 버튼이 세로로 쌓였는가 — 순서(①→②)가 눈으로 읽히려면 겹치면 안 된다
    var a = document.querySelectorAll('.su-age');
    var r0 = a[0].getBoundingClientRect(), r1 = a[1].getBoundingClientRect();
    return { over: doc.scrollWidth - window.innerWidth, worst: worst, worstTxt: worstTxt,
      stacked: r1.top >= r0.bottom - 1, num: document.querySelectorAll('.setup-num').length };
  })()`);
  check('문서가 가로로 안 넘친다', st.over <= 0, `초과 ${st.over}px`);
  check('버튼 제목이 낱글자로 안 쪼개진다(제목 최대 2줄)', st.worst <= 2, `${st.worst}줄 — "${st.worstTxt}"`);
  check('①의 두 갈래가 세로로 쌓인다(390px)', st.stacked === true);
  check('①② 번호표가 그려진다', st.num === 2, String(st.num));
  // 📜 «왜 판단력 훈련을 하나요?» 설명이 펼쳐진 채면 카드가 두 화면 아래로 밀립니다 —
  //    정하라고 띄운 카드가 스크롤 밖에 있으면 첫 진입의 뜻이 사라집니다.
  const seen = await evalJs(`(function(){
    var c = document.querySelector('.lvp-title').getBoundingClientRect();
    var ex = document.getElementById('explain');
    return { top: Math.round(c.top), open: ex.classList.contains('open') };
  })()`);
  check('카드가 첫 화면 안에 보인다(스크롤 없이)', seen.top < 844, `top=${seen.top}px`);
  check('설명 상자는 접혀 있다(지우지 않고 접기만)', seen.open === false);
}

console.log('\n[ 3. ① 나이대 — 누르면 «성인»으로 바뀌고 그 나이대로 미리 만드는가 ]');
{
  const st = await evalJs(`(function(){
    var before = window.__net.scenario;
    document.querySelector('.su-age[data-g="adult"]').click();
    return { before: before };
  })()`);
  await new Promise((r) => setTimeout(r, 400));
  const st2 = await evalJs(`(function(){
    var cur = document.querySelector('.su-age.cur');
    return { cur: cur ? cur.getAttribute('data-g') : '', scen: window.__net.scenario,
      sentAge: window.__net.lastBody && window.__net.lastBody.age_group, still: !!document.querySelector('.lvp-title') };
  })()`);
  check('«성인»이 선택 표시된다', st2.cur === 'adult', st2.cur);
  check('그 나이대로 문제를 다시 미리 만든다', st2.scen === st.before + 1, `${st.before} → ${st2.scen}`);
  check('요청에 age_group=adult 가 실린다', st2.sentAge === 'adult', String(st2.sentAge));
  check('카드는 그대로 떠 있다(화면이 안 넘어감)', st2.still === true);
}

console.log('\n[ 4. ② «내가 고를래요» — 8범주 목록이 카드 안에서 펼쳐지는가 ]');
{
  await evalJs(`document.querySelector('[data-s="manual"]').click()`);
  await new Promise((r) => setTimeout(r, 300));
  const st = await evalJs(`(function(){
    var items = document.querySelectorAll('.su-band');
    var r = items.length ? items[0].getBoundingClientRect() : null;
    return { n: items.length, visible: !!(r && r.width > 0 && r.height > 0),
      // 목록이 «② 아래»에 오는가 — 순서가 뒤집히면 무엇을 고르는 목록인지 알 수 없다
      below: !!(r && r.top > document.querySelector('[data-s="manual"]').getBoundingClientRect().top) };
  })()`);
  check('8범주 목록이 펼쳐진다', st.n === 8, String(st.n));
  check('목록이 실제로 보인다', st.visible === true);
  check('목록이 «내가 고를래요» 아래에 온다', st.below === true);
}

console.log('\n[ 5. 되돌아가기 — 한 번 더 누르면 접히는가 ]');
{
  await evalJs(`document.querySelector('[data-s="manual"]').click()`);
  await new Promise((r) => setTimeout(r, 250));
  const n = await evalJs(`document.querySelectorAll('.su-band').length`);
  check('목록이 다시 접힌다', n === 0, String(n));
}

console.log('\n[ 6. 🤖 «AI가 맞춰줄게요» — 기다림 없이 곧바로 문제가 뜨는가 ]');
{
  const before = await evalJs(`window.__net.scenario`);
  const t0 = Date.now();
  await evalJs(`document.querySelector('[data-s="auto"]').click()`);
  // «떴는가»를 재려면 기다린 시간이 아니라 뜬 시각을 봐야 합니다 — 50ms 씩 확인합니다.
  let shown = 0;
  for (let i = 0; i < 60; i++) {
    if (await evalJs(`document.querySelectorAll('.opt').length === 4`)) { shown = Date.now() - t0; break; }
    await new Promise((r) => setTimeout(r, 50));
  }
  await new Promise((r) => setTimeout(r, 300));   // 뒤이어 걸리는 «다음 문제» 프리페치까지 세기 위해
  const st = await evalJs(`(function(){
    return { sit: (document.querySelector('.sit')||{}).textContent || '', opts: document.querySelectorAll('.opt').length,
      scen: window.__net.scenario, flag: localStorage.getItem('mangoi_judg_setup_v1') };
  })()`);
  check('문제 화면으로 넘어갔다', /homework/.test(st.sit), st.sit.slice(0, 40));
  check('선택지 4개가 그려졌다', st.opts === 4, String(st.opts));
  // 🔴 이 검사가 이 파일의 핵심입니다 — «미리 받아 둔 문제를 버리고 새로 만드는» 회귀를 잡습니다.
  //    버렸다면 요청이 **2건**(이 문제 + 다음 문제) 늘고, 그대로 썼다면 **1건**(다음 문제)만 늘어납니다.
  //    (mode 를 불필요하게 붙이면 loadScenario 가 프리페치를 버립니다 — 실제로 그렇게 짜기 쉽습니다)
  check('미리 받아 둔 문제를 그대로 썼다(늘어난 요청은 «다음 문제» 1건뿐)',
    st.scen === before + 1, `${before} → ${st.scen} (버렸다면 ${before + 2})`);
  check('설정 완료 표시가 남았다', st.flag === '1', String(st.flag));
  check('전환이 즉시다(1초 이내) — 미리 만들어 둔 덕분', shown > 0 && shown < 1000, `${shown}ms`);
}

console.log('\n[ 7. 다시 들어오면 카드가 안 뜨는가 ]');
{
  await S('Page.addScriptToEvaluateOnNewDocument', {
    source: `try{ localStorage.setItem('mangoi_judg_setup_v1','1'); }catch(e){}` });
  await go(BASE + '/judgment.html');
  const st = await evalJs(`(function(){
    return { card: !!document.querySelector('.lvp-title'), opts: document.querySelectorAll('.opt').length,
      band: window.__net.band };
  })()`);
  check('설정 카드가 다시 뜨지 않는다', st.card === false);
  check('바로 문제가 뜬다', st.opts === 4, String(st.opts));
  check('KV 조회조차 안 한다(로컬 표시로 끝)', st.band === 0, String(st.band));
}

console.log('\n[ 8. 🎯 «레벨 찾기» 갈래 — 나이대를 지킨 채 배치테스트로 들어가는가 ]');
{
  await S('Page.addScriptToEvaluateOnNewDocument', {
    source: `try{ localStorage.removeItem('mangoi_judg_setup_v1'); }catch(e){}` });
  await go(BASE + '/judgment.html');
  await evalJs(`document.querySelector('.su-age[data-g="adult"]').click()`);
  await new Promise((r) => setTimeout(r, 350));
  await evalJs(`document.querySelector('[data-s="placement"]').click()`);
  await new Promise((r) => setTimeout(r, 600));
  const st = await evalJs(`(function(){
    return { dots: document.querySelectorAll('.pl-dot').length,
      step: (document.querySelector('.pl-step')||{}).textContent || '',
      probe: window.__net.lastBody && window.__net.lastBody.probe_band,
      age: window.__net.lastBody && window.__net.lastBody.age_group,
      card: !!document.querySelector('.lvp-title') };
  })()`);
  check('배치테스트로 들어간다(6문항 표시)', st.dots === 6, String(st.dots));
  check('«레벨 찾기 1 / 6» 이 뜬다', /1 \/ 6/.test(st.step), st.step);
  check('탐색 밴드 4에서 시작한다', Number(st.probe) === 4, String(st.probe));
  check('카드는 닫힌다', st.card === false);
  // ⚠️ 이 줄이 서버 수정의 이유입니다 — 나이대 저장이 probing 안에 있으면 배치 6문항이 전부 아이 소재로 나갑니다.
  //    (probe 요청 자체는 age_group 을 안 실어 보냅니다 — 앞서 ①에서 저장해 둔 값을 서버가 씁니다)
  check('배치 직전에 나이대가 서버에 저장돼 있다(①에서 보낸 요청)', st.age === undefined || st.age === null,
    `probe 요청의 age_group=${st.age} (없는 것이 정상 — 저장값을 씁니다)`);
}

console.log('\n[ 9. 글자가 읽히는가 — WCAG 대비비 (본문 4.5:1 · 큰 글자 3:1) ]');
{
  await S('Page.addScriptToEvaluateOnNewDocument', {
    source: `try{ localStorage.removeItem('mangoi_judg_setup_v1'); }catch(e){}` });
  await go(BASE + '/judgment.html');
  const bad = await evalJs(`(function(){
    function rgb(s){ var m = String(s).match(/[\\d.]+/g) || []; return m.slice(0,3).map(Number); }
    function lum(c){ var a = c.map(function(v){ v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4); });
      return 0.2126*a[0] + 0.7152*a[1] + 0.0722*a[2]; }
    function bgOf(el){ // 투명하면 조상을 타고 올라가 실제로 깔린 색을 찾습니다
      var n = el;
      while(n && n !== document.documentElement){
        var b = getComputedStyle(n).backgroundColor;
        var m = String(b).match(/[\\d.]+/g);
        if(m && (m.length < 4 || Number(m[3]) > 0.5)) return rgb(b);
        n = n.parentElement;
      }
      return [15,10,32];
    }
    var out = [];
    var els = document.querySelectorAll('.lvp-title, .setup-num, .lvm-t, .lvm-d, .lvp-name, .lvp-desc, .hint, .lvp-sub');
    for(var i=0;i<els.length;i++){
      var el = els[i]; var cs = getComputedStyle(el);
      if(!el.textContent.trim() || !el.getBoundingClientRect().height) continue;
      var fs = parseFloat(cs.fontSize), fw = Number(cs.fontWeight) || 400;
      var big = fs >= 24 || (fs >= 18.66 && fw >= 700);
      var need = big ? 3 : 4.5;
      var L1 = lum(rgb(cs.color)), L2 = lum(bgOf(el));
      var ratio = (Math.max(L1,L2) + 0.05) / (Math.min(L1,L2) + 0.05);
      if(ratio < need) out.push({ t: el.textContent.trim().slice(0,18), r: Math.round(ratio*100)/100, need: need, fs: fs });
    }
    return out;
  })()`);
  check('카드 안 모든 글자가 대비 기준을 넘는다', Array.isArray(bad) && bad.length === 0,
    JSON.stringify(bad).slice(0, 300));
}

console.log('\n' + '═'.repeat(40));
console.log(`  ${FAIL ? '⚠' : '✅'} 실패 ${FAIL}건 / 통과 ${PASS}건`);
for (const f of FAILS) console.log('   ❌ ' + f);
console.log('═'.repeat(40) + '\n');
try { proc.kill(); } catch {}
process.exit(FAIL ? 1 : 0);
