/* ai-friend-8levels-browser.mjs — 여덟 칸이 «화면에서» 실제로 도는가 (2026-08-31)
 *
 * 왜 필요한가
 *   사장님 결정으로 AI 영어친구를 다섯 칸(A1…C1)에서 여덟 칸(S1…S8)으로 넓히고,
 *   웜업도 같은 눈금으로 맞췄다. 문자열 하니스(ai_friend_level_harness)는 «표가 맞는가» 까지만 본다.
 *   여기서는 «버튼이 여덟 개로 그려지고 · 폰에서 누를 크기이고 · 옛 저장값을 이어받고 ·
 *   여덟 단계가 각각 다른 첫 인사를 하는가» 를 진짜 브라우저에서 잰다.
 *
 * ⚠️ 설정 줄(.opts)은 기본으로 접혀 있다 — 펼치지 않고 재면 버튼이 0x0 으로 나와
 *    멀쩡한 화면을 «너무 작다» 로 오진한다(실제로 밟았다).
 * ⚠️ 자동으로 안 돕니다 — manual/ 규약상 게이트가 안 물어 갑니다. 사람이 부릅니다:
 *      PW_DIR=/tmp/pw node test-harness/manual/ai-friend-8levels-browser.mjs
 */
/* 여덟 칸이 실제 화면에서 도는지 — 버튼·저장값 이어받기·레벨별 첫 인사 */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path'; import { tmpdir } from 'node:os';
const PUB='/home/user/mangoiweb/cloudflare-deploy/public';
const CHROME='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const profile=mkdtempSync(join(tmpdir(),'lv8-'));
const CDP=9280+(process.pid%50);
let _p=8150+(process.pid%60);
/* ⚠️ 방문할 때마다 «새 포트» 를 쓴다 — 두 번째 방문부터 서비스워커가 끼어 옛 파일을 준다.
   ⚠️ 띄운 것은 끝날 때 반드시 거둔다(예전 판은 서버 15개 + 크로미움이 남았다). */
const KIDS=[];
const serve=()=>{const p=_p++; KIDS.push(spawn('python3',['-m','http.server',String(p)],{cwd:PUB,stdio:'ignore'})); return p;};
KIDS.push(spawn(CHROME,['--headless=new','--no-sandbox','--disable-dev-shm-usage',
 `--remote-debugging-port=${CDP}`,`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'}));
const cleanup=()=>{ for(const k of KIDS){ try{ k.kill('SIGKILL'); }catch(e){} } };
process.on('exit',cleanup); process.on('SIGINT',()=>{cleanup();process.exit(130);});
await sleep(3500);
const tabs=await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json();
const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
let id=0; const w=new Map(); const errs=[];
const send=(m,p={})=>new Promise(r=>{const i=++id;w.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:p}));});
ws.onmessage=e=>{const m=JSON.parse(e.data);
  if(m.id&&w.has(m.id)){w.get(m.id)(m.result);w.delete(m.id);return;}
  if(m.method==='Runtime.exceptionThrown') errs.push(String(m.params.exceptionDetails?.exception?.description||'').slice(0,110));};
await new Promise(r=>ws.onopen=r);
await send('Page.enable'); await send('Runtime.enable');
const ev=async e=>(await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true})).result?.value;
let pass=0,fail=0;
const ok=(c,m,x)=>{c?(pass++,console.log('  ✅ '+m)):(fail++,console.log('  ❌ '+m+(x?'\n       · '+JSON.stringify(x):'')));};
const open=async(path,W=390,H=844)=>{await send('Emulation.setDeviceMetricsOverride',{width:W,height:H,deviceScaleFactor:1,mobile:W<600});
  errs.length=0; await send('Page.navigate',{url:`http://127.0.0.1:${serve()}${path}`}); await sleep(2200);};

console.log('■ AI 영어친구 — 여덟 칸');
await open('/ai-friend.html');
/* ⚠️ 설정 줄(.opts)은 기본으로 «접혀» 있다 — 그대로 재면 버튼이 0x0 으로 나와
   멀쩡한 화면을 «너무 작다» 로 오진한다(2026-08-31 실제로 밟음). 먼저 펼친다. */
await ev(`(function(){var t=document.querySelector('[onclick*="toggleOpts"], .opts-toggle, #optsToggle'); if(t) t.click();})()`);
await sleep(400);
const btns = await ev(`Array.from(document.querySelectorAll('.opt[data-level]')).map(function(b){
  var r=b.getBoundingClientRect();
  return {lv:b.dataset.level, txt:(b.textContent||'').trim(), w:Math.round(r.width), h:Math.round(r.height), on:b.classList.contains('active')};})`);
ok(btns.length===8, `버튼이 여덟 개다 (${btns.length})`, btns.map(b=>b.lv));
ok(btns.every(b=>/S[1-8]/.test(b.lv)), '값이 전부 S1~S8 이다');
ok(btns.filter(b=>b.on).length===1 && btns.find(b=>b.on).lv==='S3', `기본이 STEP 3 이다 (${btns.find(b=>b.on)?.lv})`);
/* 값(S1…S8)마다 «정해진» CEFR 이름이 붙어야 한다 — 아무 CEFR 글자나 있으면 통과시키면
   이름이 서로 뒤바뀌어도 못 잡는다(서버 AI_FRIEND_CEFR 와 같은 표를 여기 적어 대조한다). */
const CEFR={S1:'A1',S2:'A2',S3:'A2+',S4:'B1',S5:'B1+',S6:'B2',S7:'B2+',S8:'C1'};
ok(btns.every(b=>b.txt.replace(/\s+/g,'')===String(b.lv.slice(1))+CEFR[b.lv]),
   'CEFR 이름이 값마다 «정확히» 붙어 있다', btns.map(b=>b.lv+'='+b.txt));
ok(btns.every(b=>b.w>=24&&b.h>=24), `여덟 개가 손가락으로 누를 크기다 (최소 ${Math.min(...btns.map(b=>b.w))}x${Math.min(...btns.map(b=>b.h))})`);
ok(await ev("document.documentElement.scrollWidth<=innerWidth"), '폰에서 가로로 안 넘친다',
   {doc:await ev("document.documentElement.scrollWidth"), win:await ev("innerWidth")});
ok(errs.length===0, `JS 에러 없음 (${errs.length})`, errs.slice(0,2));

console.log('\n■ 옛 저장값을 이어받는가');
for (const [oldK,newK] of [['A1','S1'],['A2','S2'],['B1','S4'],['B2','S6'],['C1','S8']]) {
  await send('Page.navigate',{url:'about:blank'}); await sleep(200);
  const port=serve();
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/ai-friend.html`}); await sleep(1500);
  await ev(`localStorage.setItem('mangoi_aifriend_level','${oldK}')`);
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/ai-friend.html?x=1`}); await sleep(1800);
  const got = await ev("typeof currentLevel==='undefined'?'?':currentLevel");
  ok(got===newK, `옛 «${oldK}» → ${got}`);
}

/* 🔎 접힌 상태의 요약 — 대부분의 학생이 실제로 보는 글자다(설정 줄은 기본이 접힘).
   두 줄짜리 버튼의 textContent 를 그대로 쓰면 「3A2+」 로 붙어 나온다(trap-check 발견). */
console.log('\n■ 접힌 설정 요약이 사람이 읽는 글자인가');
await open('/ai-friend.html');
const sum = await ev(`(function(){var t=document.querySelector('.opts-toggle'); return t?t.textContent.trim():'';})()`);
ok(!!sum, `요약 글자를 읽었다 «${sum}»`);
ok(!/\d(Pre-)?[ABC]\d/.test(sum.replace(/\s+/g,'')), `숫자와 CEFR 이 붙어 나오지 않는다 «${sum}»`);
ok(/3/.test(sum) && /A2\+/.test(sum), `기본 STEP 3 · A2+ 를 말한다 «${sum}»`);

console.log('\n■ 웜업 — 여덟 단계 전용 첫 인사');
for (const lv of [1,2,3,4,5,6,7,8]) {
  await open(`/warmup.html?setup=0&diff=${lv}`);
  const r = await ev(`(function(){var m=document.querySelectorAll('#log .msg.ai');
    var t=m.length?(m[0].querySelector('.wu-text')||m[0]).textContent.trim():'';
    var w=(t.replace(/[^\\x20-\\x7E]/g,' ').trim().split(/\\s+/).filter(Boolean)).length;
    return {t:t.slice(0,58), w:w};})()`);
  const generic = /Mangoi AI friend/.test(r.t);
  ok(!generic, `Lv${lv}: 전용 인사다 (${r.w}단어) «${r.t}»`);
}
console.log('\n■ 레벨 목록에 CEFR 이 함께 뜨는가');
await open('/warmup.html');
const cat = await ev(`(typeof LEVEL_CATALOG==='undefined')?null:LEVEL_CATALOG.map(function(x){return x.n+':'+x.ko+'/'+x.lv+'/'+x.cefr;})`);
ok(cat && cat.length===8, `여덟 칸 (${cat?cat.length:0})`, cat);
/* ⛔ CEFR 은 «더한 칸» 이다 — 교재 Lv 구간(판단력 훈련 BAND_SPECS 와 짝)을 대체하면 안 된다 */
ok(cat && cat.every(x=>/\/Lv \d+-\d+\//.test(x)), '교재 Lv 구간이 그대로 남아 있다', cat);
ok(cat && cat.join(',')===[1,2,3,4,5,6,7,8].map((n,i)=>n+':'+['첫걸음','기초','초급','초중급','중급','중고급','고급','최상급'][i]
   +'/'+['Lv 1-4','Lv 5-8','Lv 9-12','Lv 13-17','Lv 18-21','Lv 22-25','Lv 26-30','Lv 31-34'][i]
   +'/'+['A1','A2','A2+','B1','B1+','B2','B2+','C1'][i]).join(','), '이름·Lv·CEFR 이 전부 맞다', cat);
/* 화면에도 실제로 그려지는가 — 목록만 맞고 렌더에서 빠지면 사람은 못 본다 */
await ev(`(function(){try{localStorage.setItem('mangoi_admin_welcome_v1','1');}catch(e){}})()`);
const shown = await ev(`(function(){var b=document.querySelectorAll('#wusLevels .wus-cefr');
  return Array.prototype.map.call(b,function(x){return x.textContent.trim();});})()`);
ok(shown && shown.length===8, `설정 화면에 CEFR 이 여덟 개 그려진다 (${shown?shown.length:0})`, shown);
/* ⋮ 설정 패널 — 학생이 대화 중에 실제로 보는 자리다(설정 화면은 처음 한 번만 본다).
   여기 첫 표시 글자가 HTML 에 손으로 박혀 있어서 눈금을 손볼 때마다 옛 값으로 남았다. */
console.log('\n■ ⋮ 설정 패널이 CEFR 을 함께 말하는가');
await open('/warmup.html?setup=0&diff=4');
const panel = await ev(`(function(){
  var v=document.getElementById('lvlVal');
  var b=document.querySelectorAll('#lvlBtns button');
  return { now: v?v.textContent.trim():'', n: b.length,
           t4: b[3]?b[3].title:'', on: (function(){for(var i=0;i<b.length;i++) if(b[i].classList.contains('on')) return i+1; return 0;})() };
})()`);
ok(panel.n === 8, `눈금 버튼이 여덟 개다 (${panel.n})`);
ok(panel.on === 4, `고른 단계가 켜져 있다 (${panel.on})`);
ok(panel.now === '4단계 · 초중급 · B1', `지금 값에 CEFR 이 함께 나온다 «${panel.now}»`);
ok(panel.t4 === '4단계 · 초중급 · B1', `버튼 툴팁에도 CEFR 이 붙는다 «${panel.t4}»`);

console.log(`\n${pass} PASS / ${fail} 실패`);
process.exit(fail?1:0);
