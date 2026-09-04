/* vc-startlow-duptab-browser.mjs — 회선 2층 2·3·4(#799)가 «진짜 index.html» 에서 먹는지 (2026-09-04)
 *
 * ⚠️ 자동으로 안 돕니다 — manual/ 규약. idx-vc-qlog.js 의 «밖에서 감싸기» 절이나
 *    idx-main.js 의 vcCreatePeer·vcAAONotify 를 건드리면 **사람이 부르세요**:
 *      cd cloudflare-deploy/public && python3 -m http.server 8903 &
 *      /opt/pw-browsers/chromium-1194/chrome-linux/chrome --headless=new --remote-debugging-port=9222 about:blank &
 *      node test-harness/manual/vc-startlow-duptab-browser.mjs
 *
 * 왜 브라우저가 필요한가
 *   가짜 DOM 하니스(⑭절)는 «함수를 감쌌다» 까지만 본다. 진짜 페이지에서는 idx-main.js 의
 *   전역 함수 선언(writable 인가) · defer 로드 순서 · 실제 RTCPeerConnection · 토스트 렌더가 다 걸린다.
 *   🪤 SW cache-first(setBypassServiceWorker 필수) · /json/new 금지(class-end-flow-browser.mjs 참고).
 */
const PORT = process.env.PW_PORT || 8903;
const CDP = 'http://127.0.0.1:9222';
const URL = 'http://127.0.0.1:' + PORT + '/index.html?_nc=' + Date.now();
let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? (pass++, console.log('  ✅ ' + m)) : (fail++, console.log('  ❌ ' + m + (extra ? '\n       · ' + extra : ''))); };
const list = await (await fetch(CDP + '/json/list')).json();
const page = list.find(t => t.type === 'page');
if (!page) { console.error('열린 탭이 없습니다'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const waiters = new Map();
const send = (method, params = {}) => new Promise(res => { const i = ++id; waiters.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
await new Promise(r => ws.onopen = r);
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m.result); waiters.delete(m.id); } };
const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r && r.exceptionDetails) return { __err: r.exceptionDetails.text || JSON.stringify(r.exceptionDetails).slice(0, 200) }; return r && r.result && r.result.value; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Network.setBypassServiceWorker', { bypass: true });

async function load(pre) {
  await send('Page.addScriptToEvaluateOnNewDocument', { source: pre || ';' });
  await send('Page.navigate', { url: URL + '&r=' + Math.random() });
  await sleep(4500);
}

console.log('\n[ ① 감싸기가 진짜 페이지에서 걸린다 ]');
await load(`try{localStorage.clear();sessionStorage.setItem('mangoi_admin_welcome_v1_done','1');}catch(e){}`);
const w = await ev(`({ cp: !!(window.vcCreatePeer && window.vcCreatePeer.__vcqWrapped), aao: !!(window.vcAAONotify && window.vcAAONotify.__vcqWrapped), cpT: typeof vcCreatePeer, ver: (document.querySelector('script[src*="idx-vc-qlog"]')||{}).src })`);
ok(w && w.cp === true, 'window.vcCreatePeer 가 감싸져 있다(__vcqWrapped)', JSON.stringify(w));
ok(w && w.aao === true, 'window.vcAAONotify 가 감싸져 있다');
ok(w && /v=9/.test(w.ver || ''), '실린 idx-vc-qlog.js 가 ?v=9 다 (' + (w && w.ver) + ')');

console.log('\n[ ② 낮게 시작 — 저장된 기준 RTT 로 새 연결에 단계가 심긴다 ]');
const mk = `(function(){ try { var pc = vcCreatePeer('probe-' + Math.random().toString(36).slice(2), '확인용'); var st = pc && pc.__qStep; try { pc.close(); } catch(e){} return { step: st === undefined ? null : st, isPC: (pc instanceof RTCPeerConnection) }; } catch(e) { return { err: String(e) }; } })()`;
const s0 = await ev(mk);
ok(s0 && s0.isPC === true && s0.step === null, '기준 RTT 를 모르면 단계를 안 심는다(지금과 같음)', JSON.stringify(s0));
await load(`try{localStorage.clear();localStorage.setItem('mangoi_vc_rttbase',JSON.stringify({rtt:520,at:Date.now()}));localStorage.setItem('mangoi_vc_quality','auto');}catch(e){}`);
const s1 = await ev(mk);
ok(s1 && s1.isPC === true && s1.step === 2, "저장값 520ms + 화질 '자동' → 2단계 (" + JSON.stringify(s1) + ')');
await load(`try{localStorage.clear();localStorage.setItem('mangoi_vc_rttbase',JSON.stringify({rtt:520,at:Date.now()}));localStorage.setItem('mangoi_vc_quality','low');}catch(e){}`);
const s2 = await ev(mk);
ok(s2 && s2.step === 1, "화질 '저'(기본)면 1단계까지 (" + JSON.stringify(s2) + ')');
const saved = await ev(`(function(){ window.__vcNetSelf = { rttBase: 433.4 }; vcqSaveRttBase(); return localStorage.getItem('mangoi_vc_rttbase'); })()`);
ok(typeof saved === 'string' && /"rtt":433/.test(saved), '종료 정리용 저장이 진짜 localStorage 에 쓴다 (' + saved + ')');

console.log('\n[ ③ 같은 계정 둘째 탭 — 토스트가 진짜 DOM 에 그려진다 ]');
const d = await ev(`(function(){ document.getElementById('vc-local-label').textContent = '유세영 (나)';
  window.vcPeerConnections = { a: { __username: '유세영', connectionState: 'connected', getReceivers: function(){ return []; } } };
  window.__vcDupTab = null; vcqDupTabWatch();
  var t = document.getElementById('vc-netlow-toast'); if (!t) return { none: true };
  var cs = getComputedStyle(t); var r = t.getBoundingClientRect();
  return { html: t.innerHTML.slice(0, 80), display: cs.display, opacity: cs.opacity, w: r.width, h: r.height, inView: r.top >= 0 && r.bottom <= innerHeight }; })()`);
ok(d && !d.none && /같은 계정/.test(d.html), '토스트가 붙었다', JSON.stringify(d));
ok(d && d.display !== 'none' && d.opacity === '1' && d.w > 100 && d.inView, '보이는 상태(opacity 1, 화면 안)', JSON.stringify(d));
const d2 = await ev(`(function(){ document.getElementById('vc-local-label').textContent = '유세영 (나)';
  window.vcPeerConnections = { a: { __username: '교사 Teacher - Farrah', connectionState: 'connected', getReceivers: function(){ return []; } } };
  var t = document.getElementById('vc-netlow-toast'); if (t) t.remove(); window.__vcDupTab = null; vcqDupTabWatch();
  return !!document.getElementById('vc-netlow-toast'); })()`);
ok(d2 === false, '다른 이름이면 안 뜬다');

console.log('\n[ ④ 안내에 «왜» — 음성전용 안내가 진짜 DOM 에 지연·이유를 그린다 ]');
const a = await ev(`(function(){ window.__vcNetSelf = { lastRtt: 1100, lastLoss: 0.5, rttBase: 300 };
  vcAAONotify('📶 <b>Your internet is weak — sending audio only for a moment.</b>');
  var t = document.getElementById('vc-aao-toast'); if (!t) return { none: true };
  return { html: t.innerHTML, display: getComputedStyle(t).display }; })()`);
ok(a && !a.none && /1100ms/.test(a.html) && /평소 300ms/.test(a.html) && /업로드/.test(a.html), 'AAO 토스트에 「지연 1100ms(평소 300ms) · … 업로드가 꽉 찬 모양」 이 붙는다', a && (a.html || '').replace(/<[^>]+>/g, '').slice(0, 160));
const b = await ev(`(function(){ vcAAONotify('📶 <b>Connection recovered — video is back on.</b>'); return document.getElementById('vc-aao-toast').innerHTML; })()`);
ok(!/1100ms/.test(b), '회복 안내에는 숫자를 안 붙인다');
const n = await ev(`(function(){ window.__vcNetSelf = { bad: 0, notifiedAt: 0, rttBase: 130 };
  for (var i = 0; i < 5; i++) vcNetSelfWatch(1, 950);
  var t = document.getElementById('vc-netlow-toast'); return t ? t.innerHTML.replace(/<[^>]+>/g,'') : null; })()`);
ok(typeof n === 'string' && /950ms/.test(n) && /평소 130ms/.test(n) && /업로드/.test(n), '회선 경고 토스트에도 지연·이유 (' + String(n).slice(0, 120) + ')');

console.log('\n[ ⑤ 홈 화면 부작용 없음 ]');
const side = await ev(`({ inCall: document.body.classList.contains('vc-in-call'), rxT: !!window.__vcRxT, errs: (window.__vcqErrs||[]).length })`);
ok(side && side.inCall === false && side.rxT === false, '홈에서는 수업 중 타이머가 안 돈다(상주 타이머 없음)', JSON.stringify(side));

console.log('\n' + '═'.repeat(60) + `\n  ✅ PASS ${pass}   ❌ FAIL ${fail}`);
ws.close(); process.exit(fail ? 1 : 0);
