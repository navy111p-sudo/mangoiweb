/* 🔤 아이디 대소문자·자동대문자 — 진짜 브라우저 검사 (2026-08-26)
 *
 *   왜 별도인가 — 「autocapitalize 속성이 박혔는가」는 문자열로 볼 수 있지만,
 *   「로그인 모달을 열었을 때 그 칸에 실제로 붙는가」·「Caps Lock 안내가 정말 보이는가」는
 *   그릴 때만 알 수 있다. `lm-uid` 는 모달을 열 때 JS 가 만들므로 소스에 그 속성이 없다.
 *
 *   ⚠️ `manual/` 규약상 `*_harness.mjs` 가 아니라 **게이트가 물어 가지 않는다.**
 *      로그인 화면·session-guard.js 를 건드리면 **사람이 직접** 불러야 한다:
 *        node test-harness/manual/login-case-browser.mjs
 *
 *   ⚠️ `file://` 로 열면 `<script src="/js/…">` 가 전부 404 라 아무것도 안 돈다(CLAUDE.md 2장).
 *      그래서 public/ 을 그대로 서빙하는 로컬 HTTP 서버를 띄운다.
 *   ⚠️ 빈 브라우저는 늘 «첫 방문자» 다 — 홈의 오프닝/안내가 클릭을 가로막을 수 있어
 *      본 검사는 DOM 판정만 하고 실제 클릭 대신 이벤트를 직접 보낸다.
 */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const PUB = resolve(__dir, '../../cloudflare-deploy/public');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let PASS = 0, FAIL = 0; const FAILS = [];
const check = (name, ok, extra) => {
  if (ok) { PASS++; console.log('  ✅ ' + name); }
  else { FAIL++; FAILS.push(name); console.log('  ❌ ' + name + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : '')); }
};

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

// ── 로컬 서버 — 없는 API 는 조용히 빈 값을 준다(스텁 때문에 나는 오류를 버그로 오독하지 않게) ──
const server = createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  if (p.startsWith('/api/')) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"ok":true}'); }
  const file = join(PUB, p === '/' ? 'index.html' : p);
  try {
    if (!(await stat(file)).isFile()) throw new Error('dir');
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end('nf'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port;

const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9333', '--no-sandbox',
  '--disable-dev-shm-usage', '--user-data-dir=/tmp/pw-logincase', '--window-size=390,844'], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function cdpTargets() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch('http://127.0.0.1:9333/json/list'); if (r.ok) return await r.json(); } catch {}
    await sleep(300);
  }
  throw new Error('크로미움이 뜨지 않았습니다');
}

let id = 0;
function open(wsUrl) {
  const ws = new WebSocket(wsUrl);
  const waiters = new Map();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); }
  });
  const ready = new Promise((r) => ws.addEventListener('open', r));
  return {
    ready,
    send: (method, params = {}) => new Promise((res, rej) => {
      const mid = ++id; waiters.set(mid, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result)));
      ws.send(JSON.stringify({ id: mid, method, params }));
    }),
    close: () => ws.close(),
  };
}

async function evalOn(cli, expr) {
  const r = await cli.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
  return r.result.value;
}

async function goto(cli, url) {
  await cli.send('Page.enable');
  await cli.send('Page.navigate', { url });
  for (let i = 0; i < 80; i++) {
    await sleep(250);
    const st = await evalOn(cli, 'document.readyState');
    if (st === 'complete') { await sleep(700); return; }
  }
}

try {
  const list = await cdpTargets();
  const page = list.find((t) => t.type === 'page');
  const cli = open(page.webSocketDebuggerUrl);
  await cli.ready;
  await cli.send('Runtime.enable');

  /* ══ ① 홈 — 정적 아이디 칸이 자동대문자를 끄고 있는가 ══════════════════════ */
  console.log('\n════ ① 홈(index.html) 정적 아이디 칸 ════');
  await goto(cli, BASE + '/index.html');
  const statics = await evalOn(cli, `(function(){
    var out={};
    ['vc-name-input','ext-uid'].forEach(function(id){
      var el=document.getElementById(id);
      out[id]= el ? [el.getAttribute('autocapitalize'), el.getAttribute('autocorrect'), el.getAttribute('spellcheck')] : null;
    });
    return out;
  })()`);
  check('session-guard.js 가 로드되어 보정이 켜졌다', await evalOn(cli, '!!window.__mangoiIdNoCaps'));
  check('🔴 화상수업 이름칸(vc-name-input) 세 속성이 꺼졌다',
    JSON.stringify(statics['vc-name-input']) === '["off","off","false"]', statics['vc-name-input']);
  check('🔴 연장결제 아이디칸(ext-uid) 세 속성이 꺼졌다',
    JSON.stringify(statics['ext-uid']) === '["off","off","false"]', statics['ext-uid']);

  /* ══ ② 로그인 모달 — 나중에 만들어지는 칸도 잡히는가 ═══════════════════════ */
  console.log('\n════ ② 로그인 모달의 아이디 칸(lm-uid) ════');
  const modal = await evalOn(cli, `(function(){
    try { openLoginModal(); } catch(e){ return {err:String(e)}; }
    var el = document.getElementById('lm-uid');
    if (!el) return {err:'lm-uid 없음'};
    var before = el.getAttribute('autocapitalize');
    // 실제로 «누르는» 동작 — 우리 코드는 pointerdown 캡처에서 손본다
    el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
    var after = [el.getAttribute('autocapitalize'), el.getAttribute('autocorrect'), el.getAttribute('spellcheck')];
    var pw = document.getElementById('lm-pw');
    return { before: before, after: after, pwTouched: pw ? pw.getAttribute('autocapitalize') : 'no-pw' };
  })()`);
  check('로그인 모달이 열리고 lm-uid 가 만들어졌다', !modal.err, modal.err);
  if (!modal.err) {
    check('⚠️ 전제 — 마크업에는 그 속성이 없다(밖에서 입히는 것이 유일한 방어)', modal.before === null, modal.before);
    check('🔴 누르는 순간 세 속성이 꺼진다', JSON.stringify(modal.after) === '["off","off","false"]', modal.after);
    check('⛔ 비밀번호 칸은 건드리지 않았다', modal.pwTouched === null || modal.pwTouched === 'no-pw', modal.pwTouched);
  }

  /* ══ ③ 관리자·강사 로그인 — 아이디 칸 + Caps Lock 안내 ════════════════════ */
  console.log('\n════ ③ 관리자·강사 로그인(admin/login.html) ════');
  await goto(cli, BASE + '/admin/login.html');
  const u = await evalOn(cli, `(function(){var el=document.getElementById('username');
    return el?[el.getAttribute('autocapitalize'),el.getAttribute('autocorrect'),el.getAttribute('spellcheck')]:null})()`);
  check('🔴 아이디 칸 세 속성이 꺼졌다', JSON.stringify(u) === '["off","off","false"]', u);

  /* Caps Lock 은 CDP 로 «진짜로» 켤 수 없다(수식키 비트마스크에 없다).
     그래서 그 이벤트 하나에만 getModifierState 를 심어 배선이 실제로 도는지 본다. */
  const caps = await evalOn(cli, `(function(){
    var w=document.getElementById('capsWarn'), pw=document.getElementById('password');
    if(!w||!pw) return {err:'요소 없음'};
    var hidden0 = getComputedStyle(w).display;
    function fire(on){
      var e=new KeyboardEvent('keydown',{bubbles:true,key:'a'});
      e.getModifierState=function(k){ return k==='CapsLock' && on; };
      pw.dispatchEvent(e);
      return getComputedStyle(w).display;
    }
    var onDisp=fire(true), offDisp=fire(false);
    return { hidden0: hidden0, onDisp: onDisp, offDisp: offDisp };
  })()`);
  check('평소에는 안 보인다', caps.hidden0 === 'none', caps.hidden0);
  check('🔴 Caps Lock 이 켜지면 실제로 보인다', caps.onDisp !== 'none', caps.onDisp);
  check('꺼지면 다시 사라진다', caps.offDisp === 'none', caps.offDisp);

  /* ⚠️ 「보인다」와 「읽힌다」는 다르다 — 대비비(WCAG)까지 잰다(CLAUDE.md 2장). */
  const contrast = await evalOn(cli, `(function(){
    var w=document.getElementById('capsWarn'); w.classList.add('show');
    function rgb(s){var m=s.match(/[\\d.]+/g); return m?m.slice(0,3).map(Number):null;}
    function lum(c){var a=c.map(function(v){v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);});
      return 0.2126*a[0]+0.7152*a[1]+0.0722*a[2];}
    var cs=getComputedStyle(w), fg=rgb(cs.color);
    /* ⚠️ 반투명 배경을 «그대로» 배경색으로 쓰면 안 된다 — 실제로 눈에 닿는 색은
       조상들이 아래에서 비쳐 나온 합성색이다. 한 번 그렇게 재서 멀쩡한 대비를
       1.16 으로 잘못 읽었다. 그래서 위에서부터 알파 합성을 직접 한다. */
    var layers=[], el=w;
    while(el){ var st=getComputedStyle(el), n=(st.backgroundColor.match(/[\\d.]+/g)||[]);
      var a=n.length>3?parseFloat(n[3]):(n.length?1:0);
      if(a>0) layers.push({c:[+n[0],+n[1],+n[2]], a:a});
      if(a>=1) break;
      el=el.parentElement; }
    var bg=layers.length?layers[layers.length-1].c.slice():[255,255,255];
    for(var i=layers.length-2;i>=0;i--){ var L=layers[i];
      for(var k=0;k<3;k++) bg[k]=L.c[k]*L.a + bg[k]*(1-L.a); }
    var l1=lum(fg), l2=lum(bg);
    var ratio=(Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);
    w.classList.remove('show');
    return { ratio: Math.round(ratio*100)/100, size: parseFloat(cs.fontSize) };
  })()`);
  check('🔴 안내 글자가 실제로 읽힌다 (WCAG 본문 4.5:1 이상)', contrast.ratio >= 4.5, contrast);

  cli.close();
} catch (e) {
  FAIL++; FAILS.push('실행 오류'); console.log('  ❌ 실행 오류 → ' + e.message);
} finally {
  try { chrome.kill(); } catch {}
  server.close();
}

console.log('\n' + '─'.repeat(58));
console.log(FAIL === 0 ? `✅ ALL PASS (${PASS})` : `⚠ PASS ${PASS} / FAIL ${FAIL}`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach((f) => console.log('   · ' + f)); }
process.exit(FAIL ? 1 : 0);
