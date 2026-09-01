/* remote-code-relay-browser.mjs — 「원격 도움받기」 접속 코드 날라다 주기를 진짜 브라우저로 잰다
 *                                  (2026-09-01)
 *
 * 무엇을 재나
 *   사장님 지시 «직원이 원격으로 학생의 모바일이나 PC 에 들어가서 수리». 브라우저에는 «남의 기기를
 *   조작하는» API 가 없으므로(보안상 일부러 없다) 실제 조작은 Quick Assist·AnyDesk 가 하고,
 *   우리는 그 **접속 코드를 양방향으로 날라다 준다.** 그 두 방향을 여기서 끝까지 눌러 본다.
 *     ① PC   : 직원이 만든 코드 → 학생 화면에 «크게» (Quick Assist·Chrome 원격 데스크톱)
 *     ② 휴대폰: 학생 기기의 번호 → 직원 화면에 (AnyDesk — 방향이 정반대다)
 *
 * ⚠️ manual/ 규약상 자동으로 안 돕니다 — 아래를 건드리면 사람이 부르세요.
 *      · src/api-mango.ts 의 /api/class/remote-support/* 네 경로
 *      · js/idx-remote-support.js (학생 화면)
 *      · js/adm-remote-pin.js · admin.html 의 #rsc-relay (직원 화면)
 *
 *      cd cloudflare-deploy/public && python3 -m http.server 8899 &
 *      node test-harness/manual/remote-code-relay-browser.mjs
 *
 * 🪤 이 파일을 고칠 때 밟았던 함정 둘 — 되풀이하지 마세요.
 *   ① **admin.html 은 자기 fetch 래퍼를 «나중에» 씌운다.** 스텁을
 *      addScriptToEvaluateOnNewDocument 로 먼저 깔면 그 래퍼에 덮여 무력화되고, 화면은
 *      404 를 «성공 아님» 으로 «올바르게» 처리하므로 멀쩡한 코드가 FAIL 로 보인다(실측).
 *      → 관리자 화면 스텁은 **로드가 끝난 뒤** 건다.
 *   ② IA6 는 관리자 카드를 «한 번에 한 장» 만 보여 준다(.ia6-hide = display:none).
 *      jumpToMenu 로 그 카드를 먼저 열지 않으면 글자는 읽히는데 «보인다·눌린다» 만 헛돈다.
 */
import { spawn } from 'node:child_process';

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8899';
const PORT = 9371;
let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  c ? (pass++, console.log('  ✅ ' + m))
    : (fail++, console.log('  ❌ ' + m + (extra !== undefined ? '\n       · ' + JSON.stringify(extra) : '')));
};

const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 2800));

const tabs = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
let id = 0; const pend = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
await new Promise(r => ws.onopen = r);
const cdp = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return { ERR: JSON.stringify(r.result.exceptionDetails).slice(0, 300) };
  return r.result?.result?.value;
};
await cdp('Page.enable'); await cdp('Runtime.enable');
await cdp('Emulation.setFocusEmulationEnabled', { enabled: true });   // 헤드리스 창은 포커스가 없다

const SESSION = '0123456789abcdef0123456789abcdef';

/* 학생 화면 스텁 — 세 번째 조회부터 직원 코드가 온다 */
const STUDENT_STUB = `
window.__calls = []; window.__posted = null;
(function(){ const real = window.fetch; let polls = 0;
  window.fetch = function(u, o){ const url = String(u); window.__calls.push(url);
    if (url.indexOf('remote-support/claim') >= 0)
      return Promise.resolve(new Response(JSON.stringify({ok:true, claimed_at:Date.now(),
        session:'${SESSION}', expires_at:Date.now()+600000}), {status:200, headers:{'Content-Type':'application/json'}}));
    if (url.indexOf('remote-support/student-code') >= 0){ window.__posted = JSON.parse(o.body);
      return Promise.resolve(new Response(JSON.stringify({ok:true, sent_at:Date.now()}), {status:200, headers:{'Content-Type':'application/json'}})); }
    if (url.indexOf('remote-support/status') >= 0){ polls++;
      const b = polls >= 3 ? {ok:true, code:'845213', tool:'quickassist', sent_at:Date.now(), expires_at:Date.now()+600000}
                           : {ok:true, code:null, expires_at:Date.now()+600000};
      return Promise.resolve(new Response(JSON.stringify(b), {status:200, headers:{'Content-Type':'application/json'}})); }
    return real.apply(this, arguments); };
})();`;

/* 직원 화면 스텁 — 두 번째 조회부터 학생이 «넣었다», 그 뒤 학생 번호까지 올라온다 */
const ADMIN_STUB = `
window.__sent = null;
(function(){ const real = window.fetch; let polls = 0;
  window.fetch = function(u, o){ const url = String(u);
    if (url.indexOf('remote-support/issue') >= 0)
      return Promise.resolve(new Response(JSON.stringify({ok:true, pin:'123456', expires_at:Date.now()+600000}), {status:200, headers:{'Content-Type':'application/json'}}));
    if (url.indexOf('remote-support/pin-status') >= 0){ polls++;
      return Promise.resolve(new Response(JSON.stringify({ok:true, claimed:polls>=2, code_sent:!!window.__sent,
        student_code: polls>=3 ? '987654321' : null, student_tool:'anydesk',
        expires_at:Date.now()+600000}), {status:200, headers:{'Content-Type':'application/json'}})); }
    if (url.indexOf('remote-support/helper-code') >= 0){ window.__sent = JSON.parse(o.body);
      return Promise.resolve(new Response(JSON.stringify({ok:true, sent_at:Date.now()}), {status:200, headers:{'Content-Type':'application/json'}})); }
    return real.apply(this, arguments); };
})();`;

/* 반투명 층을 «합성» 해서 배경을 구한다 — 층에서 멈추면 멀쩡한 대비를 1.x 로 잘못 읽는다 */
const CONTRAST = (sel) => `(() => {
  function parse(c){const m=c.match(/[\\d.]+/g);return m?m.map(Number):null;}
  function bgOf(el){ let layers=[],n=el;
    while(n && n!==document.documentElement){ const cs=getComputedStyle(n);
      let c=parse(cs.backgroundColor);
      if((!c||c[3]===0) && cs.backgroundImage && cs.backgroundImage!=='none'){
        const m=cs.backgroundImage.match(/rgba?\\([^)]+\\)/); if(m) c=parse(m[0]); }
      if(c && (c[3]===undefined||c[3]>0)){ layers.push(c); if(c[3]===undefined||c[3]===1) break; }
      n=n.parentElement; }
    layers.push([255,255,255,1]);
    let out=layers[layers.length-1].slice(0,3);
    for(let i=layers.length-2;i>=0;i--){const l=layers[i],a=l[3]===undefined?1:l[3];
      out=[0,1,2].map(k=>l[k]*a+out[k]*(1-a));}
    return out; }
  function lum(c){const s=c.map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4);});
    return .2126*s[0]+.7152*s[1]+.0722*s[2];}
  return [...document.querySelectorAll('${sel}')].filter(e=>e.children.length===0 && e.textContent.trim())
    .map(el=>{const L1=lum(parse(getComputedStyle(el).color)), L2=lum(bgOf(el));
      return {t:el.textContent.trim().slice(0,14), ratio:+(((Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05))).toFixed(2)};});
})()`;

async function openStudent(w, h, mobile) {
  await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: STUDENT_STUB });
  await cdp('Page.navigate', { url: BASE + '/index.html?menu=remote&_nc=' + Date.now() });
  await new Promise(r => setTimeout(r, 4200));
}

// ── ① 직원 → 학생 (PC·Quick Assist) ────────────────────────────────────
for (const [lab, w, h, mob] of [['폰', 390, 844, true], ['PC', 1280, 900, false]]) {
  console.log(`\n① [${lab}] 직원이 보낸 코드가 학생 화면에 뜨는가`);
  await openStudent(w, h, mob);
  ok(await ev(`(()=>{const b=document.getElementById('rs-code-box'); return b && getComputedStyle(b).display==='none';})()`),
     `[${lab}] 코드 자리는 처음엔 안 보임(빈 상자를 그리지 않는다)`);

  await ev(`(()=>{document.getElementById('rs-pin-input').value='123456';})()`);
  await ev(`window.rsClaimPin()`);
  await new Promise(r => setTimeout(r, 900));
  await new Promise(r => setTimeout(r, 10000));   // 3초 폴링 × 3회

  const got = await ev(`(()=>{const n=document.getElementById('rs-code-num');
    if(!n) return {found:false};
    const cs=getComputedStyle(n), b=n.getBoundingClientRect();
    return {found:true, txt:n.textContent.trim(), px:parseFloat(cs.fontSize),
      copy:!!document.querySelector('#rs-code-box button'),
      overflow: b.right>innerWidth+0.5 || b.left<-0.5};})()`);
  ok(got.found, `[${lab}] 코드가 화면에 뜸`, got);
  ok(got.txt === '845 213', `[${lab}] 세 자리씩 띄워 읽기 쉽게`, got.txt);
  /* 컴퓨터가 고장 난 학생이 읽는 자리다 — 작으면 못 읽는다 */
  ok(got.px >= 28, `[${lab}] 숫자가 큼 (${got.px}px ≥ 28)`, got.px);
  ok(got.copy === true, `[${lab}] 복사 버튼 있음`);
  ok(got.overflow === false, `[${lab}] 화면 밖으로 안 넘침`);

  /* ⛔ 상주 폴링 금지(홈을 멎게 한 전력) — 코드를 받으면 스스로 멈춰야 한다 */
  const before = await ev(`window.__calls.filter(u=>u.indexOf('status')>=0).length`);
  await new Promise(r => setTimeout(r, 7000));
  const after = await ev(`window.__calls.filter(u=>u.indexOf('status')>=0).length`);
  ok(after === before, `[${lab}] 코드를 받은 뒤 폴링이 멈춤 (${before}→${after})`);

  /* ⛔ PIN(6자리)으로 조회를 열면 claim 의 5회 제한을 우회해 번호를 찍어 볼 수 있다 */
  ok(await ev(`window.__calls.every(u=>u.indexOf('status')<0 || u.indexOf('session=')>=0)`) === true,
     `[${lab}] 조회는 세션 토큰으로만 — PIN 으로 조회하지 않음`);

  const con = await ev(CONTRAST('#rs-code-box, #rs-code-box *'));
  ok(con.length > 0 && con.every(c => c.ratio >= 4.5), `[${lab}] 코드 상자 글자가 WCAG 4.5:1 이상`, con);
}

// ── ② 학생 → 직원 (휴대폰·AnyDesk, 방향이 정반대) ──────────────────────
console.log('\n② [폰] 학생이 자기 번호를 직원에게 보내는가');
await openStudent(390, 844, true);
ok(await ev(`(()=>{const b=document.getElementById('rs-mycode-box'); return b && getComputedStyle(b).display==='none';})()`),
   'PIN 확인 전에는 «내 번호» 칸이 안 보임');
await ev(`(()=>{document.getElementById('rs-pin-input').value='123456';})()`);
await ev(`window.rsClaimPin()`);
await new Promise(r => setTimeout(r, 900));

const my = await ev(`(()=>{const b=document.getElementById('rs-mycode-box');
  if(!b || getComputedStyle(b).display==='none') return {shown:false};
  const i=document.getElementById('rs-mycode-input'), r=b.getBoundingClientRect();
  return {shown:true, hasInput:!!i,
    a: i?{cap:i.getAttribute('autocapitalize'),cor:i.getAttribute('autocorrect'),sp:i.getAttribute('spellcheck'),im:i.getAttribute('inputmode')}:null,
    overflow: r.right>innerWidth+0.5};})()`);
ok(my.shown && my.hasInput, 'PIN 확인 뒤 «내 번호 보내기» 칸이 열림', my);
/* 폰 키보드는 아이디·번호 칸에서 첫 글자를 대문자로 만들고 자동고침으로 딴 낱말을 넣는다(CLAUDE.md) */
ok(my.a && my.a.cap === 'off' && my.a.cor === 'off' && my.a.sp === 'false', '폰 키보드 자동고침·대문자 꺼짐', my.a);
ok(my.a && my.a.im === 'numeric', '숫자 키보드가 뜨게 돼 있음');
ok(my.overflow === false, '390px 에서 안 넘침');

await ev(`(()=>{document.getElementById('rs-mycode-input').value='123 456 789';})()`);
await ev(`window.rsSendMyCode(${JSON.stringify(SESSION)})`);
await new Promise(r => setTimeout(r, 800));
const posted = await ev(`window.__posted`);
ok(posted && posted.code === '123456789', '공백을 뺀 숫자만 보냄', posted);
ok(posted && posted.session === SESSION, '세션 토큰으로 보냄(PIN 아님)', posted);
ok((await ev(`document.getElementById('rs-mycode-msg').textContent`) || '').includes('보냈'), '보냄 결과를 사실대로 말함');

await ev(`(()=>{document.getElementById('rs-mycode-input').value='12';})()`);
await ev(`window.rsSendMyCode(${JSON.stringify(SESSION)})`);
await new Promise(r => setTimeout(r, 400));
ok((await ev(`document.getElementById('rs-mycode-msg').textContent`) || '').includes('숫자'),
   '짧은 값은 거절하고 «왜» 를 말함');

// ── ③ 직원 화면 ────────────────────────────────────────────────────────
console.log('\n③ 직원 화면 — 잠금 · 보내기 · 학생 번호 받기');
await cdp('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('mangoi_admin_welcome_v1_done','1');}catch(e){}` });
await cdp('Page.navigate', { url: BASE + '/admin.html?_nc=' + Date.now() });
await new Promise(r => setTimeout(r, 6500));
await ev(ADMIN_STUB);   // 🪤 함정① — 반드시 «로드 뒤» 에
await ev(`(()=>{ try{ if(window.jumpToMenu) jumpToMenu('card-students-mgmt'); }catch(e){}
  const d=document.getElementById('sm-remote-support'); if(d) d.open=true; })()`);   // 🪤 함정②
await new Promise(r => setTimeout(r, 900));

ok(await ev(`(()=>{const b=document.getElementById('rsc-issue'); return !!b && !!b.offsetParent;})()`),
   'PIN 만들기 버튼이 실제로 보임(카드가 열려 있음)');
ok(await ev(`(()=>{const r=document.getElementById('rsc-relay'); return r && getComputedStyle(r).display==='none';})()`),
   'PIN 만들기 전에는 코드 보내기 칸이 숨어 있음');

await ev(`document.getElementById('rsc-issue').click()`);
await new Promise(r => setTimeout(r, 900));
ok(await ev(`document.getElementById('rsc-pin').textContent.trim()`) === '123 456', 'PIN 이 뜸');
ok(await ev(`(()=>{const r=document.getElementById('rsc-relay'); return r && getComputedStyle(r).display!=='none';})()`),
   'PIN 발급 뒤 코드 보내기 칸이 열림');
/* ⚠️ 학생이 안 넣었으면 보낼 곳이 없다 — 서버도 not_claimed 로 거절한다 */
ok(await ev(`document.getElementById('rsc-send').disabled`) === true, '학생이 넣기 전에는 보내기가 잠김');

await new Promise(r => setTimeout(r, 7000));   // 폴링 2회 → claimed
ok(await ev(`document.getElementById('rsc-send').disabled`) === false, '학생이 넣으면 잠금이 풀림');

await ev(`(()=>{document.getElementById('rsc-code').value='845 213';})()`);
await ev(`document.getElementById('rsc-send').click()`);
await new Promise(r => setTimeout(r, 900));
const sent = await ev(`window.__sent`);
ok(sent && sent.pin === '123456' && sent.code === '845213', '공백을 뺀 숫자만 보냄', sent);
ok(sent && sent.tool === 'quickassist', '도구 값이 함께 감', sent);
ok((await ev(`document.getElementById('rsc-relay-state').textContent`) || '').includes('학생 화면'),
   '보냄 결과를 사실대로 말함');

await new Promise(r => setTimeout(r, 7000));   // 폴링 → 학생 번호 도착
const stu = await ev(`(()=>{const b=document.getElementById('rsc-student-code');
  if(!b || getComputedStyle(b).display==='none') return {shown:false};
  return {shown:true, txt:b.textContent.replace(/\\s+/g,' ').trim().slice(0,60)};})()`);
ok(stu.shown && /987 654 321/.test(stu.txt), '학생이 보낸 번호가 직원 화면에 뜸', stu);

const conA = await ev(CONTRAST('#rsc-student-code *'));
ok(conA.length > 0 && conA.every(c => c.ratio >= 4.5), '직원 화면 번호 글자가 WCAG 4.5:1 이상', conA);

console.log(`\n════════════════════════════════════════════`);
console.log(`  ${fail ? '⚠' : '✅'} PASS ${pass}   FAIL ${fail}`);
console.log(`════════════════════════════════════════════`);
ws.close();
try { chrome.kill(); } catch (e) {}
process.exit(fail ? 1 : 0);
