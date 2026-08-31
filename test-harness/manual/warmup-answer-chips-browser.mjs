/* warmup-answer-chips-browser.mjs — 「대답 보기」가 «몇 초 기다렸다가» 나오는지 (2026-08-31)
 *
 * 왜 필요한가
 *   사장님 제보 「샘플질문이 시작하자마자 나와요. 전에는 학생이 대답을 안 하고 있으면
 *   나왔었는데」. 답을 보여 준 뒤에 묻는 순서라 학생이 스스로 만들어 볼 자리가 없었다.
 *
 * 🔴 이 검사가 없었으면 못 잡았을 것
 *   8초 지연을 넣고도 화면은 «즉시» 그대로였다 — 첫 인사가 스크립트 파싱 중에 부르는데
 *   ANS_DELAY_MS 선언이 그보다 아래라 setTimeout(fn, undefined) = 0ms 였다.
 *   함수도 값도 다 «있어서» 문자열 하니스는 전부 초록이었다.
 *
 * ⚠️ 자동으로 안 돕니다 — manual/ 규약상 게이트가 안 물어 갑니다. 사람이 부릅니다:
 *      PW_DIR=/tmp/pw node test-harness/manual/warmup-answer-chips-browser.mjs
 * ⚠️ 검사마다 새 포트를 씁니다 — 같은 포트를 다시 쓰면 2번째 방문부터 서비스워커가
 *    옛 파일을 줍니다(CLAUDE.md 홈 무한루프 항목).
 */
/* 「대답 보기」가 8초 뒤에 나오는지, 그 사이 타이핑하면 안 나오는지 실제로 잰다 */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path'; import { tmpdir } from 'node:os';
const PUB='/home/user/mangoiweb/cloudflare-deploy/public';
const CHROME='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const profile=mkdtempSync(join(tmpdir(),'ans-'));
const CDP=9850+(process.pid%60);
/* ⚠️ 검사마다 «새 포트» — 같은 포트를 다시 쓰면 2번째 방문부터 서비스워커가 옛 파일을 준다
   (CLAUDE.md 홈 무한루프 항목). 실제로 이걸 안 해서 «옛 코드» 를 재고 4건이 거짓 실패했다. */
let _port = 8870+(process.pid%40);
const serve = () => { const p=_port++; spawn('python3',['-m','http.server',String(p)],{cwd:PUB,stdio:'ignore'}); return p; };
const PORT = serve();
spawn(CHROME,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--window-size=430,900',
 `--remote-debugging-port=${CDP}`,`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
await sleep(3500);
const tabs=await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json();
const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
let id=0; const w=new Map();
const send=(m,p={})=>new Promise(r=>{const i=++id;w.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:p}));});
ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id&&w.has(m.id)){w.get(m.id)(m.result);w.delete(m.id);}};
await new Promise(r=>ws.onopen=r);
await send('Page.enable');
const ev=async e=>(await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true})).result?.value;
let pass=0, fail=0;
const ok=(c,m,x)=>{c?(pass++,console.log('  ✅ '+m)):(fail++,console.log('  ❌ '+m+(x?'\n       · '+x:'')));};

// 레벨 2(기초) 로 열면 첫 인사와 함께 «대답 보기» 후보가 준비된다
await send('Page.navigate',{url:`http://127.0.0.1:${serve()}/warmup.html?setup=0&diff=2`}); await sleep(2600);
const t0 = Date.now();
console.log('── 첫 인사 직후 ──');
ok(await ev("!document.getElementById('ansCard')"), '말하자마자는 «대답 보기» 가 안 뜬다',
   '즉시 뜨면 답을 보여 준 뒤에 묻는 순서가 된다');
ok(await ev("typeof _ansTimer !== 'undefined' && !!_ansTimer"), '대신 «예약» 은 걸려 있다');
await sleep(4000);
ok(await ev("!document.getElementById('ansCard')"), `4초 뒤에도 아직 안 뜬다 (${Math.round((Date.now()-t0)/1000)}초)`);
await sleep(5500);
const shown = await ev("!!document.getElementById('ansCard')");
ok(shown, `8초쯤 지나면 뜬다 (${Math.round((Date.now()-t0)/1000)}초 경과)`);
if (shown) {
  const n = await ev("document.querySelectorAll('#ansCard .ans-chip').length");
  ok(n >= 2, `보기가 ${n}개 그려졌다`);
  ok(await ev("(function(){var r=document.getElementById('ansCard').getBoundingClientRect();return r.top<innerHeight&&r.bottom>0;})()"),
     '화면 안에 보인다 (열렸다 ≠ 보인다)');
}

// ── 타이핑 중이면 방해하지 않는가 ──
console.log('── 학생이 스스로 쓰고 있을 때 ──');
await send('Page.navigate',{url:`http://127.0.0.1:${serve()}/warmup.html?setup=0&diff=2`}); await sleep(2600);
await ev("(function(){var i=document.getElementById('inp'); i.value='I am happy'; return 1;})()");
await sleep(9500);
ok(await ev("!document.getElementById('ansCard')"), '입력칸에 뭔가 쓰고 있으면 뜨지 않는다',
   '스스로 하고 있는 아이에게 답을 들이미는 것이 이 기능의 반대편 실패다');

// ── 예약이 쌓이지 않는가 ──
console.log('── 예약 중복 ──');
await send('Page.navigate',{url:`http://127.0.0.1:${serve()}/warmup.html?setup=0&diff=2`}); await sleep(2600);
await ev("showAnswerChips(['A one.','B two.']); showAnswerChips(['C three.','D four.']);");
await sleep(9000);
const chips = await ev("Array.from(document.querySelectorAll('#ansCard .ans-chip')).map(function(b){return b.textContent;}).join(',')");
const cards = await ev("document.querySelectorAll('.ans-card').length");
ok(cards === 1, `카드가 한 장만 남는다 (${cards}장)`, '예약을 취소하지 않으면 지난 질문의 보기가 뒤늦게 튀어나온다');
ok(chips === 'C three.,D four.', `마지막 것만 그려진다 (${chips})`);

console.log(`\n${pass} PASS / ${fail} 실패`);
process.exit(fail?1:0);
