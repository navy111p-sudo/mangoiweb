// 📖 A.i 동화책 4편 — 무작위 조작(퍼즈) 샌드박스 검사 · 2026-10-14
// ⚠️ 자동으로 안 돕니다(manual/) — 사람이 부릅니다:
//      SEEDS=75 STEPS=40 node test-harness/manual/story-fuzz-browser.mjs
// 사람이 «아무 순서로나» 누르는 것을 흉내냅니다: 문장 누르기 · 고르기 시작/끝 · 알림의 «고르기 끝내기» ·
//   정답 확인 · 낱말 게임 보기(맞게/틀리게/연타) · 🔊 · 한 번 더 하기 · «처음부터 다시»(게임 피드백 도중 포함).
// 매 조작 뒤 불변식을 잽니다(2026-10-14 수리의 약속 그대로):
//   ① 게임을 끝내기 전에는 한글 뜻이 하나도 안 보인다(.ko 0개 · .ko-lock 있음) · 끝나면 보인다
//   ② «고르기» 가 켜져 있으면 본문 위 알림이 보이고, 꺼져 있으면 숨는다(버튼 글자와 같은 말)
//   ③ 고르기가 꺼져 있을 때 문장을 누르면 소리가 난다(speak 1회) · 켜져 있으면 안 난다
//   ④ «처음부터 다시» 뒤에는 고르기 꺼짐 · 고른 문장 0 · 새 게임(남은 문제 = 전체) · 뜻 가림
//      — 게임 피드백(0.65~1.2초) 도중에 눌러도 첫 문제를 건너뛰지 않는다
//   ⑤ «고르기 끝내기»(알림·버튼) 는 고른 문장을 지우지 않는다 · 고른 문장은 언제나 2개 이하
//   ⑥ 뜻 열림을 저장하지 않는다(story_*_wordsopen 키 0) · 영영풀이는 모든 카드에 영어로
//   ⑦ 페이지 예외 0건
// 같은 SEEDS 면 조작 순서와 낱말 게임 순서(주소의 fz= 로 시계 고정)가 같게 시작합니다. 다만 게임 피드백(0.65~1.2초)이
//   진짜 타이머라, 그것과 겹치는 조작은 회차마다 조금 갈릴 수 있습니다(실측: 8회 중 앞 4회는 완전히 같음).
// 실패하면 종료코드 1.
import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const PUB = process.env.PUB || path.join(DIR, '..', '..', 'cloudflare-deploy', 'public');
const SEEDS = +(process.env.SEEDS || 25);
const STEPS = +(process.env.STEPS || 40);
const BOOKS = (process.env.BOOKS || 'red-umbrella,birthday-cake,robot-dance,treasure-map').split(',');
const PORT = 9800 + Math.floor(Math.random() * 150);
const PROF = path.join(os.tmpdir(), 'story-fuzz-' + process.pid);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.webp': 'image/webp', '.css': 'text/css', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg' };

const srv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  if (u.pathname.startsWith('/api/')) { r.writeHead(200, { 'Content-Type': 'application/json' }); return r.end('{"ok":true,"newBalance":100,"rule":{"amount":10}}'); }
  const fp = path.join(PUB, decodeURIComponent(u.pathname));
  if (!fp.startsWith(PUB) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'text/plain', 'Cache-Control': 'no-store' }); r.end(fs.readFileSync(fp));
}).listen(PORT);

const chrome = spawn('/opt/pw-browsers/chromium-1194/chrome-linux/chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=' + (PORT + 1000), '--user-data-dir=' + PROF, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0; const pend = new Map(); const pageErr = [];
async function connect() {
  for (let i = 0; i < 60; i++) { try { const l = await (await fetch(`http://127.0.0.1:${PORT + 1000}/json/list`)).json(); const t = l.find((x) => x.type === 'page'); if (t) return t.webSocketDebuggerUrl; } catch {} await sleep(200); }
  throw new Error('no chrome');
}
function send(method, params = {}) { return new Promise((res, rej) => { const i = ++id; const to = setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('시간초과 ' + method)); } }, 20000); pend.set(i, { res: (v) => { clearTimeout(to); res(v); }, rej: (e) => { clearTimeout(to); rej(e); } }); ws.send(JSON.stringify({ id: i, method, params })); }); }
async function ev(expr) { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval error'); return r.result.value; }
let pass = 0, fail = 0, steps = 0, againDone = 0; const fails = []; const actCount = {};
const ok = (c, m) => { if (c) pass++; else { fail++; if (fails.length < 80) fails.push(m); } };

// 결정적 난수(시드마다 같은 순서 — 실패하면 그 시드로 다시 돌려 재현)
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

// 소리는 진짜로 못 들으니 speechSynthesis.speak 호출 수를 센다(페이지 스크립트보다 먼저 감싸야 synth 가 잡는 객체가 같다)
const STUB = `(function(){ /* 시드 재현: 낱말 게임 순서가 Date.now 로 정해지므로 주소의 fz= 값으로 시계를 고정 */ try{ const m=location.search.match(/[?&]fz=(\\d+)/); if(m){ let t=1700000000000+ +m[1]*1000; Date.now=()=>t++; } }catch(e){}
  window.__speak=0; window.__spoken=[]; try{ const s=window.speechSynthesis; if(s){ const o=s.speak.bind(s); s.speak=function(u){ window.__speak++; window.__spoken.push(u&&u.text); try{ setTimeout(()=>{ try{ u.onend&&u.onend(); }catch(e){} },5); }catch(e){} }; } }catch(e){} })();`;

const STATE = `(()=>{const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
  const pn=$('#pickNote'), pm=$('#pickMode'), card=$('#wq .wq-card');
  const left=card&&!card.classList.contains('done')?+((card.querySelector('.wq-top span')||{}).textContent||'').replace(/[^0-9]/g,''):null;
  return { done:!!$('#wq .wq-card.done'), ko:$$('#words .w .ko').length, lock:$$('#words .w .ko-lock').length, cards:$$('#words .w').length,
    defs:$$('#words .w .def').map(d=>d.textContent), noteShown:!!pn&&!pn.hidden&&getComputedStyle(pn).display!=='none', pmText:pm?pm.textContent:'',
    picks:$$('#text .s.pick').length, left, word:(($('#wq .wq-word span')||{}).textContent)||null, picked:$$('#wq .wq-o.right,#wq .wq-o.wrong').length>0,
    speak:window.__speak, openKeys:Object.keys(localStorage).filter(k=>/wordsopen/.test(k)).length, total:window.__wqTotal||null };})()`;

async function load(book, fz) {
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/story-${book}.html?fz=${fz}` });
  for (let i = 0; i < 300; i++) { await sleep(50); try { if (await ev('!!(document.querySelectorAll("#text .s").length > 20 && document.querySelector("#wq .wq-card"))')) break; } catch {} }
  await ev('(()=>{try{localStorage.clear();}catch(e){}})()');
  await send('Page.reload', { ignoreCache: true });
  for (let i = 0; i < 300; i++) { await sleep(50); try { if (await ev('!!(document.querySelectorAll("#text .s").length > 20 && document.querySelector("#wq .wq-card"))')) break; } catch {} }
  return ev('!!document.querySelector("#wq .wq-card")');
}

const ACTIONS = ['sentence', 'sentence', 'pickToggle', 'noteOff', 'checkKey', 'wqRight', 'wqRight', 'wqRight', 'wqWrong', 'wqMash', 'wqSay', 'again', 'reset', 'resetMid', 'cardSay', 'wait'];

async function act(a, R, learned) {
  actCount[a] = (actCount[a] || 0) + 1;
  switch (a) {
    case 'sentence': {
      const before = await ev(STATE);
      const n = await ev('document.querySelectorAll("#text .s").length');
      const i = Math.floor(R() * n);
      await ev(`document.querySelectorAll("#text .s")[${i}].click()`);
      const after = await ev(STATE);
      if (before.noteShown) ok(after.speak === before.speak, `고르기 중 문장 클릭은 소리를 안 낸다 (speak ${before.speak}→${after.speak})`);
      else ok(after.speak === before.speak + 1, `고르기가 꺼져 있으면 문장 클릭에 소리가 난다 (speak ${before.speak}→${after.speak})`);
      ok(after.picks <= 2, `고른 문장은 2개 이하 (${after.picks})`);
      return;
    }
    case 'pickToggle': await ev('document.getElementById("pickMode").click()'); return;
    case 'noteOff': {
      const b = await ev(STATE);
      const had = await ev('!!document.querySelector("#pickNote:not([hidden]) button")');
      if (!had) return;
      await ev('document.querySelector("#pickNote button").click()');
      const s = await ev(STATE);
      ok(!s.noteShown && /고르기 시작/.test(s.pmText), `«고르기 끝내기» → 알림 숨고 버튼이 «고르기 시작» («${s.pmText}»)`);
      ok(s.picks === b.picks, `«고르기 끝내기» 는 고른 문장을 지우지 않는다 (${b.picks}→${s.picks})`);
      return;
    }
    case 'checkKey': await ev('document.getElementById("checkKey").click()'); return;
    case 'wqRight': case 'wqWrong': case 'wqMash': {
      const s = await ev(STATE); if (s.done || s.picked) { await sleep(150); return; }
      const opts = await ev('[...document.querySelectorAll("#wq .wq-o")].map(o=>o.textContent)');
      let k = Math.floor(R() * opts.length);
      if (a === 'wqRight' && learned[s.word] != null) { const j = opts.indexOf(learned[s.word]); if (j >= 0) k = j; }
      if (a === 'wqWrong' && learned[s.word] != null) { const j = opts.findIndex((o) => o !== learned[s.word]); if (j >= 0) k = j; }
      await ev(`document.querySelectorAll("#wq .wq-o")[${k}].click()`);
      if (a === 'wqMash') { for (let m = 0; m < 4; m++) await ev(`(b=>b&&b.click())(document.querySelectorAll("#wq .wq-o")[${(k + m) % opts.length}])`); }
      const right = await ev('(e=>e?e.textContent:null)(document.querySelector("#wq .wq-o.right"))');
      if (right != null) learned[s.word] = right;
      const after = await ev(STATE);
      ok(after.ko === 0 || after.done, `피드백 중에도 뜻은 가려져 있다 (ko ${after.ko})`);
      await sleep(R() < 0.7 ? 1350 : Math.floor(R() * 900));  // 대개 피드백이 끝날 때까지 기다리고 가끔은 도중에 다음 조작
      return;
    }
    case 'wqSay': { const b = await ev('window.__speak'); const has = await ev('!!document.querySelector("#wq [data-wq=say]")'); if (!has) return; await ev('document.querySelector("#wq [data-wq=say]").click()'); ok(await ev('window.__speak') === b + 1, '게임 🔊 는 소리를 낸다'); return; }
    case 'cardSay': {
      const n = await ev('document.querySelectorAll("#words .w .spk, #words .w button").length'); if (!n) return;
      const b = await ev('window.__speak'); const i = Math.floor(R() * n);
      await ev(`document.querySelectorAll("#words .w .spk, #words .w button")[${i}].click()`); await sleep(40);
      ok(await ev('window.__speak') > b, '낱말 카드 🔊 는 소리를 낸다'); return;
    }
    case 'again': {
      if (!(await ev('!!document.querySelector("#wq [data-wq=again]")'))) return;
      await ev('document.querySelector("#wq [data-wq=again]").click()'); againDone++;
      const s = await ev(STATE);
      ok(!s.done && s.ko === 0 && s.lock > 0, `«한 번 더 하기» → 뜻이 다시 가려진다 (ko ${s.ko} lock ${s.lock})`);
      return;
    }
    case 'reset': case 'resetMid': {
      if (a === 'resetMid') {   // 게임 피드백 도중에 «처음부터 다시»
        const s0 = await ev(STATE);
        if (!s0.done) { await ev('document.querySelectorAll("#wq .wq-o")[0].click()'); await sleep(100 + Math.floor(R() * 500)); }
      }
      await ev('document.getElementById("stampReset").click()');
      const s = await ev(STATE);
      ok(!s.noteShown && /고르기 시작/.test(s.pmText), `«처음부터 다시» → 고르기 꺼짐 («${s.pmText}»)`);
      ok(s.picks === 0, `«처음부터 다시» → 고른 문장 0 (${s.picks})`);
      ok(!s.done && s.ko === 0 && s.lock > 0, `«처음부터 다시» → 새 게임·뜻 가림 (done ${s.done} ko ${s.ko})`);
      const leftNow = s.left;
      await sleep(1400);   // 예전 피드백 예약이 남아 있었다면 이때 첫 문제를 건너뛴다
      const s2 = await ev(STATE);
      ok(s2.left === leftNow && s2.left === s2.total, `«처음부터 다시» 뒤 첫 문제를 건너뛰지 않는다 (남은 ${leftNow}→${s2.left} / 전체 ${s2.total})`);
      const b = s2.speak; await ev('document.querySelectorAll("#text .s")[0].click()');
      ok(await ev('window.__speak') === b + 1, '«처음부터 다시» 뒤 문장을 누르면 소리가 난다');
      for (const k in learned) delete learned[k];
      return;
    }
    case 'wait': await sleep(Math.floor(R() * 1500)); return;
  }
}

async function runSeed(book, seed) {
  if (!(await load(book, seed * 10 + BOOKS.indexOf(book)))) { ok(false, `${book}#${seed}: 화면이 안 열림`); return; }
  // 전체 문제 수(처음 화면의 «남은 문제») 를 기억 — 새 게임이 나올 때마다 같아야 한다
  await ev(`window.__wqTotal=+((document.querySelector('#wq .wq-top span')||{}).textContent||'').replace(/[^0-9]/g,'')`);
  const s0 = await ev(STATE);
  ok(s0.ko === 0 && s0.lock === s0.cards && s0.cards >= 6, `${book}: 처음엔 뜻이 전부 가려져 있다 (ko ${s0.ko} lock ${s0.lock}/${s0.cards})`);
  ok(s0.defs.length === s0.cards && s0.defs.every((d) => /^영영풀이\s+[A-Za-z]/.test(d) && !/[가-힣]/.test(d.replace(/^영영풀이/, ''))), `${book}: 모든 카드에 영어 영영풀이`);
  ok(!(await ev('!!document.querySelector("[data-wpeek],.ko-peek")')), `${book}: «눌러서 보기» 가 없다`);
  const R = rng(seed * 7919 + book.length); const learned = {};
  for (let i = 0; i < STEPS; i++) {
    const a = ACTIONS[Math.floor(R() * ACTIONS.length)];
    try { await act(a, R, learned); } catch (e) { ok(false, `${book}#${seed} step${i} ${a}: 예외 ${e.message}`); return; }
    steps++;
    const s = await ev(STATE);
    const tag = `${book}#${seed} step${i}(${a})`;
    ok(s.done ? s.ko >= 6 && s.lock === 0 : s.ko === 0 && s.lock > 0, `${tag}: 게임 끝 ${s.done} 인데 뜻 ko ${s.ko} lock ${s.lock}`);
    ok(s.noteShown === /고르기 끝/.test(s.pmText), `${tag}: 알림(${s.noteShown})과 버튼 «${s.pmText}» 가 다른 말`);
    ok(s.picks <= 2, `${tag}: 고른 문장 ${s.picks}`);
    ok(s.openKeys === 0, `${tag}: 뜻 열림을 저장함`);
    ok(s.done || s.left == null || (s.left >= 1 && s.left <= s.total + 40), `${tag}: 남은 문제 ${s.left}`);
  }
  // 마무리: 남은 게임을 정답으로 끝까지 → 뜻이 열린다
  for (let g = 0; g < 60 && !(await ev('!!document.querySelector("#wq .wq-card.done")')); g++) await act('wqRight', () => 0.1, learned);
  const sEnd = await ev(STATE);
  ok(sEnd.done && sEnd.ko >= 6 && sEnd.lock === 0, `${book}#${seed}: 게임을 끝내면 뜻이 열린다 (done ${sEnd.done} ko ${sEnd.ko})`);
  // «한 번 더 하기» 는 무작위 구간에서 거의 안 닿으므로(끝까지 풀어야 나옴) 여기서 반드시 한 번 누른다
  const a0 = againDone; await act('again', () => 0.1, learned);
  ok(againDone === a0 + 1, `${book}#${seed}: «한 번 더 하기» 를 실제로 눌렀다`);
  // 새로고침하면 다시 가려진다(저장 안 함)
  await send('Page.reload', { ignoreCache: true });
  for (let i = 0; i < 200; i++) { await sleep(50); try { if (await ev('!!document.querySelector("#wq .wq-card")')) break; } catch {} }
  const sR = await ev(STATE);
  ok(!sR.done && sR.ko === 0 && sR.lock > 0, `${book}#${seed}: 새로고침하면 뜻이 다시 가려진다 (ko ${sR.ko})`);
}

(async () => {
  ws = new WebSocket(await connect());
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { const p = pend.get(d.id); pend.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); }
    if (d.method === 'Runtime.exceptionThrown') pageErr.push(d.params.exceptionDetails?.exception?.description || 'exception'); };
  await new Promise((r) => ws.onopen = r);
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true }); await send('Network.setBypassServiceWorker', { bypass: true });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: STUB });
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  let runs = 0;
  for (let seed = 1; seed <= SEEDS; seed++) for (const book of BOOKS) {
    try { await runSeed(book, seed); } catch (e) { ok(false, `${book}#${seed}: 예외 ${e.message}`); }
    runs++; process.stdout.write(`\r  ${runs}회 · 조작 ${steps} · PASS ${pass} FAIL ${fail}   `);
  }
  ok(pageErr.length === 0, `페이지 예외 0건 (${pageErr.slice(0, 3).join(' | ')})`);
  console.log(`\n결과: 시퀀스 ${runs}회 · 무작위 조작 ${steps}회 · PASS ${pass} / FAIL ${fail}`);
  ok(againDone >= runs, `«한 번 더 하기» 실행 ${againDone}회 ≥ 시퀀스 ${runs}회`);
  console.log('조작 분포: ' + JSON.stringify(actCount) + ' · 한 번 더 하기 ' + againDone + '회');
  if (fails.length) console.log(fails.map((f) => '  ❌ ' + f).join('\n'));
  ws.close(); chrome.kill(); srv.close(); await new Promise((r) => { chrome.once('exit', r); setTimeout(r, 3000); }); try { fs.rmSync(PROF, { recursive: true, force: true }); } catch {}
  process.exit(fail ? 1 : 0);
})();
