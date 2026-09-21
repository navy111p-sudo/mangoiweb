/* ═══════════════════════════════════════════════════════════════════════════
   🎤 발음 «오늘 몫» 줄 — 진짜 브라우저로 재는 검사 (2026-09-21 신설 · B안)

   ⚠️ **자동으로 안 돕니다 — 사람이 부릅니다.** `manual/` 은 게이트가 물어 가지 않습니다.
       PW_DIR=/tmp/pw node test-harness/manual/speech-mission-browser.mjs

   [왜 여기가 따로 필요한가]
     문자열 하니스는 «무슨 글자가 나오는가» 까지는 봅니다. 그런데 이 줄이 실제로
     **얼마나 넓게 · 어디에 · 가려지지 않고** 그려지는지는 브라우저만 압니다.
     실제로 밟은 것 — 넓은 화면에서 `.wrap` 이 `display:grid` 가 되는데, 그리드 자식에
     좌우 `auto` 마진을 주면 stretch 가 꺼져 **글자 폭만큼 쪼그라듭니다**
     (1280px 실측: 칸 654px 이 될 자리가 **129px**). 코드에는 `max-width:760px` 이
     멀쩡히 있어서 파일만 봐서는 보이지 않습니다.

   [무엇을 재나]
     ① 폰·PC 세 폭에서 줄이 «첫 화면 안» 에 있고 칸을 제대로 채우는가
     ② 채움이 실제로 그 비율만큼 그려지는가(인라인 span 함정 — 폭 0 이면 색도 안 보인다)
     ③ 그 자리의 «맨 위» 가 이 줄 자신인가(남이 덮고 있지 않은가)
     ④ 짝 — 모르면(게스트·조회 실패) 아예 안 그리는가
     ⑤ 달성한 채로 들어오면 보상을 **한 번** 청하고, 같은 날 다시 들어오면 **안 청하는가**
     ⑥ 🌐 영어로도 말이 되는가

   🔴 [④절이 «자동 하니스가 원리상 못 보는 것» 을 맡습니다]
     `_scIsEn()` 의 **localStorage 폴백**은 여기서만 검사됩니다. 자동 하니스의 가짜 상자는
     `window.getLang` 을 언제나 정의해 주는데, 실제 화면에서는 `mango-i18n.js` 가
     **아직 안 실린 사이** 응답이 와서 「영어로 들어왔는데 한국어 줄」이 실제로 났습니다.
     ⛔ 그 폴백을 지우지 마세요 — 지우면 여기서 **2건 FAIL**(2026-09-21 변이 실측).

   변이시험 — 2026-09-21 실측:
     · 좌우 `auto` 마진 되살리기 ……………………… 실제 FAIL(칸 폭 129px)
     · `_scIsEn` 의 localStorage 폴백 지우기 …… 실제 FAIL 2건
   ═══════════════════════════════════════════════════════════════════════════ */
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 9411, HTTP = 8951;
const ROOT = new URL('../../', import.meta.url).pathname;
const PUB = join(ROOT, 'cloudflare-deploy', 'public');

let PASS = 0, FAIL = 0;
const ok = (n) => { console.log('  ✅ ' + n); PASS++; };
const no = (n, w) => { console.log('  ❌ ' + n + (w !== undefined ? '\n       ' + JSON.stringify(w) : '')); FAIL++; };
const check = (n, c, w) => (c ? ok(n) : no(n, w));

const MISSION = (o) => Object.assign({ goal: 5, count: 2, left: 3, reached: false,
  unitKo: '문장', unitEn: 'sentence', unitEnPl: 'sentences', rule: 'speech_daily', points: 10 }, o);

const srv = spawn('python3', ['-m', 'http.server', String(HTTP)], { cwd: PUB, stdio: 'ignore' });
const prof = mkdtempSync(join(tmpdir(), 'scmission-'));
const br = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + prof, 'about:blank'], { stdio: 'ignore' });
const bye = () => { try { br.kill(); } catch {} try { srv.kill(); } catch {} };
process.on('exit', bye);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(5000);

async function open(mission, w, h, lang, uid) {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = list.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const w8 = new Map();
  const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; w8.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && w8.has(m.id)) { const x = w8.get(m.id); w8.delete(m.id); m.error ? x.rej(new Error(JSON.stringify(m.error))) : x.res(m.result); } });
  await new Promise((r) => ws.addEventListener('open', r));
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  /* ⚠️ 서비스워커도 함께 꺼야 한다 — HTTP 캐시만 끄면 sw.js 가 옛 사본을 준다 */
  try { await send('Network.setBypassServiceWorker', { bypass: true }); } catch {}
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
  /* 🪤 init 스크립트는 **쌓입니다** — 회차마다 더하기만 하면 1회차 스텁(한국어)이 계속 살아
     나중 회차의 언어·미션을 덮습니다(실제로 밟았습니다: 영어 회차가 한국어로 나왔습니다).
     그래서 쓰고 나면 반드시 떼어 냅니다. */
  const initId = (await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    try { localStorage.setItem('mangoi_logged_user', JSON.stringify({uid:${JSON.stringify(uid)},name:'T'}));
          localStorage.setItem('mango_token','T'); localStorage.setItem('mangoi_lang', ${JSON.stringify(lang)}); } catch(e){}
    (function(){ var real = window.fetch;
      window.fetch = function(u,o){ var s = String(u);
        if (s.indexOf('/api/voice/history') >= 0)
          return Promise.resolve(new Response(JSON.stringify({ ok:true, rows:[], mission: ${JSON.stringify(mission)} }),
                 { status:200, headers:{'content-type':'application/json'} }));
        if (s.indexOf('/api/points/earn-by-rule') >= 0) { window.__claim = (window.__claim||0) + 1;
          return Promise.resolve(new Response(JSON.stringify({ ok:true, rule:{ code:'speech_daily', amount:10 } }),
                 { status:200, headers:{'content-type':'application/json'} })); }
        return real.apply(this, arguments); }; })();` })).identifier;
  await send('Page.navigate', { url: `http://127.0.0.1:${HTTP}/speech-coach.html?_nc=` + Date.now() });
  await sleep(2200);
  const r = await send('Runtime.evaluate', { returnByValue: true, expression: `(function(){
    var b=document.getElementById('sc-mission'), t=document.getElementById('sc-mission-t'), f=document.getElementById('sc-mission-fill');
    if(!b) return JSON.stringify({err:'no box'});
    var rb=b.getBoundingClientRect(), rf=f.getBoundingClientRect(), rt=t.getBoundingClientRect();
    var cs=getComputedStyle(b), cf=getComputedStyle(f);
    var topEl = document.elementFromPoint(rt.left+rt.width/2, rt.top+Math.min(rt.height/2, 6));
    return JSON.stringify({ text:t.textContent, cls:t.className, disp:cs.display,
      top:Math.round(rb.top), boxW:Math.round(rb.width), wrapW:Math.round((b.parentElement||document.body).getBoundingClientRect().width),
      fillW:Math.round(rf.width), trackW:Math.round(f.parentElement.getBoundingClientRect().width),
      fillDisp:cf.display, topAtSelf: !!(topEl && b.contains(topEl)),
      inFirst: rb.top >= 0 && rb.top < innerHeight, claims: window.__claim||0 });
  })()` });
  try { await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: initId }); } catch {}
  ws.close();
  return JSON.parse(r.result.value);
}

console.log('\n① 세 폭에서 제대로 그려지는가');
for (const [w, h, label] of [[390, 844, '폰 세로'], [768, 1024, '태블릿'], [1280, 800, 'PC']]) {
  const d = await open(MISSION(), w, h, 'ko', 'u' + w);
  check(`${label} — 「2 / 5문장 · 3문장 더!」`, /2 \/ 5문장/.test(d.text) && /3문장 더/.test(d.text), d.text);
  check(`${label} — 첫 화면 안에 있다`, d.inFirst === true, d.top);
  /* 🪤 그리드에서 쪼그라드는 함정 — 부모 칸의 절반은 넘어야 «줄» 이다 */
  check(`${label} — 칸을 제대로 채운다(부모의 절반 이상)`, d.boxW >= d.wrapW * 0.5, { boxW: d.boxW, wrapW: d.wrapW });
  check(`${label} — 채움이 40% 만큼 실제로 그려졌다`,
        d.fillDisp === 'block' && Math.abs(d.fillW / d.trackW - 0.4) < 0.05, { fillW: d.fillW, trackW: d.trackW });
  check(`${label} — 그 자리의 맨 위가 이 줄 자신이다(남이 안 덮는다)`, d.topAtSelf === true);
  check(`${label} — 아직 못 채웠으니 보상을 청하지 않는다`, d.claims === 0, d.claims);
}

console.log('\n② 짝 — 모르면 아무 말도 안 한다');
const nul = await open(null, 390, 844, 'ko', 'unone');
check('모름(null) — 줄을 그리지 않는다', nul.disp === 'none' && nul.text === '', nul);

console.log('\n③ 채운 상태 — 축하하고 «한 번만» 청한다');
const hitUid = 'uhit' + Date.now();
const hit1 = await open(MISSION({ count: 5, left: 0, reached: true }), 390, 844, 'ko', hitUid);
check('「오늘 몫 끝!」 이라고 말한다', /오늘 몫 끝/.test(hit1.text), hit1.text);
check('짝: 「더 해도 좋아요」 — 잠그지 않는다', /더 해도/.test(hit1.text), hit1.text);
check('막대가 가득 차고 색이 바뀐다', hit1.fillW >= hit1.trackW - 2 && /hit/.test(hit1.cls), hit1);
check('보상을 한 번 청한다', hit1.claims === 1, hit1.claims);
const hit2 = await open(MISSION({ count: 7, left: 0, reached: true }), 390, 844, 'ko', hitUid);
check('짝: 같은 날 다시 들어와도 또 청하지 않는다', hit2.claims === 0, hit2.claims);

console.log('\n④ 영어');
const en = await open(MISSION({ count: 1, left: 4 }), 390, 844, 'en', 'uen');
check('「1 / 5 sentences · 4 to go」', /1 \/ 5 sentences/.test(en.text) && /4 to go/.test(en.text), en.text);
const enHit = await open(MISSION({ count: 5, left: 0, reached: true }), 390, 844, 'en', 'uenhit');
check('영어 — 채우면 「Today\'s goal done!」', /goal done/i.test(enHit.text), enHit.text);

console.log('\n─────────────────────────────────────────────');
console.log(`결과: PASS ${PASS} / FAIL ${FAIL}`);
bye();
process.exit(FAIL > 0 ? 1 : 0);
