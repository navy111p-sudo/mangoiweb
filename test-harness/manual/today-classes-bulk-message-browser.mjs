// -*- coding: utf-8 -*-
/* ═══════════════════════════════════════════════════════════════════════════
   ☑ 「오늘 수업」 고른 학생에게 한 번에 메시지 — 진짜 브라우저에 그려서 재는 검사 (2026-11-11)

   [왜] 논리는 today_bulk_message_harness.mjs 가 본다. 여기서는 «화면에서» 틀릴 수 있는 것만:
     칸이 보이는가 · 전체 선택이 «보이는 줄» 만 고르는가 · 숫자가 맞는가 · 창이 열리고
     실제 요청이 학생마다 나가는가 · 보낸 뒤 같은 학생에게 두 번 안 가는가 · EN 전환.
   ⚠️ manual/ 규약상 게이트가 안 물어 간다 — js/adm-today-classes.js 의 render()·tcOpenMsgModal 을
      건드리면 사람이 직접: node test-harness/manual/today-classes-bulk-message-browser.mjs
   ═══════════════════════════════════════════════════════════════════════════ */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = Number(process.env.TBM_PORT || 8927);
const CDP = Number(process.env.TBM_CDP || 9347);
const CHROME = process.env.CHROME || ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', '/opt/pw-browsers/chromium-1243/chrome-linux/chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => existsSync(p));

let PASS = 0, FAIL = 0;
const check = (n, ok, why) => { if (ok) { PASS++; console.log('  OK   ' + n); } else { FAIL++; console.log('  FAIL ' + n + (why ? ' — ' + why : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const NOW = Date.now();
const row = (id, uid, name, extra) => Object.assign({ source: 'mangoi', schedule_id: id, observable: true, room_id: 'class-' + id + '-20261111',
  student_uid: uid, student_name: name, teacher_name: 'KAYE', academy: 'HiGenie', textbook_assigned: true, textbook: 'BTS 1 001',
  start_time: '20:' + String(id % 60).padStart(2, '0'), start_ts: NOW + id * 6e4, end_ts: NOW + id * 6e4 + 12e5, status: 'early', join_open: false, is_level_test: false }, extra || {});
const SESSIONS = [
  row(10, 'tak003', '탁학생'),
  row(20, 'hilime', '김나희'),
  row(30, 'jye46712', '김선우', { teacher_name: 'SID', academy: 'English Nation' }),
  row(40, 'ah30', '주현무', { moved_away: true, change: { label_ko: '⏸ 다른 날로 옮김', label_en: '⏸ Moved' } }),
];

const BOOT = `
  try {
    localStorage.setItem('mangoi_admin_welcome_v1_done','1');
    localStorage.setItem('mangoi_admin_session', JSON.stringify({ username:'admin', role:'hq_exec' }));
    localStorage.setItem('mangoi_lang','ko');
  } catch(e){}
  (function(){
    window.__tcSeed = ${JSON.stringify(SESSIONS)};
    window.__sent = []; window.__confirms = []; window.__alerts = [];
    window.confirm = function(m){ window.__confirms.push(String(m)); return true; };
    window.alert = function(m){ window.__alerts.push(String(m)); };
    var ok = function(body){ return new Response(JSON.stringify(body), { status:200, headers:{'content-type':'application/json'} }); };
    var real = window.fetch.bind(window);
    window.fetch = function(u, o){
      var s = String((u && u.url) || u || '');
      if (s.indexOf('/api/admin/classes/today') >= 0) return Promise.resolve(ok({ ok:true, sessions: window.__tcSeed }));
      if (s.indexOf('/api/admin/retention/care') >= 0) {
        var b = {}; try { b = JSON.parse((o && o.body) || '{}'); } catch(e) {}
        window.__sent.push(b);
        if (window.__delay) return new Promise(function(r){ setTimeout(function(){ r(ok({ ok:true, status:'sent', detail:'문자 발송 → ***1234' })); }, window.__delay); });
        /* hilime 은 번호가 없어 «못 보냄» — 다시 보내기가 그 한 명만 고르는지 본다 */
        if (b.user_id === 'hilime' && !window.__fixHilime) return Promise.resolve(ok({ ok:true, status:'failed', detail:'문자: 보낼 번호가 없습니다' }));
        return Promise.resolve(ok({ ok:true, status:'sent', detail:'문자 발송 → ***1234' }));
      }
      if (s.indexOf('/api/admin/me') >= 0) return Promise.resolve(ok({ ok:true, username:'admin', role:'hq_exec' }));
      return real(u, o);
    };
  })();
`;

async function cdp() {
  const r = await fetch(`http://127.0.0.1:${CDP}/json/list`);
  const tabs = (await r.json()).filter(t => t.type === 'page' && t.webSocketDebuggerUrl);
  if (!tabs.length) throw new Error('열려 있는 탭이 없습니다');
  const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const waiting = new Map();
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && waiting.has(m.id)) { const { res, rej } = waiting.get(m.id); waiting.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } };
  const send = (method, params) => new Promise((res, rej) => { const i = ++id; waiting.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  return { send, close: () => ws.close() };
}

async function main() {
  if (!CHROME) { console.log('크로미움을 못 찾았습니다 (CHROME=경로 로 지정)'); process.exit(2); }
  const srv = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: PUBLIC, stdio: 'ignore' });
  const br = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', `--remote-debugging-port=${CDP}`, '--window-size=1500,1000', 'about:blank'], { stdio: 'ignore' });
  const bye = () => { try { br.kill(); } catch (e) {} try { srv.kill(); } catch (e) {} };
  process.on('exit', bye);
  await sleep(2200);
  const c = await cdp();
  await c.send('Page.enable'); await c.send('Runtime.enable');
  try { await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true }); await c.send('Network.setBypassServiceWorker', { bypass: true }); } catch (e) {}
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: BOOT });
  await c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/admin.html?_nc=${Date.now()}` });
  await sleep(5000);
  const ev = async expr => {
    const r = await c.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception || {}).description);
    return r.result.value;
  };
  await ev('typeof jumpToMenu === "function" ? (jumpToMenu("card-students-mgmt"), 1) : 0');
  await sleep(400);
  await ev('(function(){var d=document.getElementById("sm-today-classes"); if(d) d.open=true;})()');
  await ev('typeof tcLoadToday === "function" ? tcLoadToday() : Promise.reject("tcLoadToday 없음")');
  await sleep(900);
  const n = () => ev('document.getElementById("tc-sel-n").textContent');

  console.log('\n── ⓪ 전제 ───────────────────────────────────────');
  check('오늘 수업 4줄이 그려졌다', (await ev('document.querySelectorAll("#tc-body tbody tr").length')) === 4);
  check('그 카드가 실제로 보인다', await ev('!!document.getElementById("tc-body").offsetParent'));

  console.log('\n── ① 칸이 보이는가 ──────────────────────────────');
  check('맨 위 «전체 선택» 칸이 보인다', await ev('!!document.getElementById("tc-sel-all").offsetParent'));
  check('   보낼 수 있는 3줄에만 고르는 칸 (옮긴 줄은 빈칸)', (await ev('document.querySelectorAll("#tc-body .tc-sel").length')) === 3);
  check('   머리글 칸 수 = 줄 칸 수 (th·td 짝)', await ev('document.querySelectorAll("#tc-body thead th").length === document.querySelector("#tc-body tbody tr").children.length'));
  check('[📩 고른 학생에게 메시지] 버튼이 보인다 · 처음엔 0명', (await ev('!!document.getElementById("tc-bulk-msg").offsetParent')) && (await n()) === '0');
  check('   <button> 이 아니다 (파란 알약 방지)', (await ev('document.getElementById("tc-bulk-msg").tagName')) === 'SPAN');
  const top = await ev(`(function(){var b=document.getElementById("tc-sel-all");b.scrollIntoView({block:"center"});var r=b.getBoundingClientRect();
    var el=document.elementsFromPoint(r.left+r.width/2, r.top+r.height/2)[0]; return el ? (el.id||el.tagName) : null})()`);
  check('   전체 선택 칸이 무엇에도 안 덮인다', top === 'tc-sel-all', String(top));

  console.log('\n── ② 고르기 ─────────────────────────────────────');
  await ev('document.getElementById("tc-bulk-msg").click()');
  check('0명일 때 누르면 «먼저 고르세요» 라고 말한다', /골라 주세요/.test(await ev('window.__alerts.join("|")')));
  await ev('document.getElementById("tc-sel-all").click()');
  check('전체 선택 → 3명', (await n()) === '3', await n());
  await ev('document.querySelectorAll("#tc-body .tc-sel")[0].click()');
  check('하나 끄면 2명 · 전체 칸은 «반쯤» 표시', (await n()) === '2' && (await ev('document.getElementById("tc-sel-all").indeterminate')));
  await ev('tcLoadToday()'); await sleep(600);
  check('다시 그려도 고른 것이 남는다 (2명)', (await n()) === '2', await n());
  await ev('document.getElementById("tc-sel-all").click()');
  await ev('document.getElementById("tc-sel-all").click()');
  check('전체 칸 두 번 → 0명 (전부 풀림 · 짝)', (await n()) === '0', await n());

  console.log('\n── ③ 걸러 내면 «보이는 줄» 만 ───────────────────');
  await ev('document.getElementById("tc-sel-all").click()');
  await ev('(function(){var e=document.getElementById("tc-q");e.value="김선우";e.dispatchEvent(new Event("input",{bubbles:true}));})()');
  await sleep(300);
  check('검색으로 1줄만 보이면 숫자도 1명 (숨은 줄로 새지 않는다)', (await n()) === '1', await n());
  await ev('(function(){var e=document.getElementById("tc-q");e.value="";e.dispatchEvent(new Event("input",{bubbles:true}));})()');
  await sleep(300);
  check('검색을 풀면 다시 3명', (await n()) === '3', await n());

  console.log('\n── ④ 보내기 ─────────────────────────────────────');
  await ev('document.getElementById("tc-bulk-msg").click()'); await sleep(200);
  check('창이 열린다 · 제목에 3명', /3명/.test(await ev('(document.getElementById("tc-msg-modal")||{}).textContent||""')));
  check('   받는 학생 이름이 보인다', /탁학생.*김나희.*김선우/.test(await ev('document.getElementById("tc-msg-who").textContent')));
  check('   글에 {name} 자리표가 있다 (학생마다 바뀐다)', /\{name\}/.test(await ev('document.getElementById("tc-msg-text").value')));
  await ev('document.getElementById("tc-msg-send").click()'); await sleep(500);
  check('보내기 전에 한 번 묻는다', (await ev('window.__confirms.length')) === 1);
  const sent = JSON.parse(await ev('JSON.stringify(window.__sent)'));
  check('학생마다 한 번씩 3건 요청', sent.length === 3 && sent.map(s => s.user_id).join() === 'tak003,hilime,jye46712', sent.map(s => s.user_id).join());
  check('   글이 그 학생 이름으로 채워졌다', /탁학생/.test(sent[0].message) && /김선우/.test(sent[2].message) && !/\{name\}/.test(sent[1].message));
  const out = await ev('document.getElementById("tc-msg-out").textContent');
  check('결과: 2명 보냄 · 1명 못 보냄 + 이유', /2명 보냄/.test(out) && /1명 못 보냄/.test(out) && /보낼 번호가 없습니다/.test(out), out);
  check('   버튼이 «못 보낸 1명 다시 보내기» 로 바뀐다', /못 보낸 1명/.test(await ev('document.getElementById("tc-msg-send").textContent')));
  await ev('window.__sent = []; window.__fixHilime = true; document.getElementById("tc-msg-send").click()'); await sleep(400);
  const re = JSON.parse(await ev('JSON.stringify(window.__sent)'));
  check('다시 보내기는 그 한 명에게만 (받은 학생에게 두 번 안 간다)', re.length === 1 && re[0].user_id === 'hilime', JSON.stringify(re.map(s => s.user_id)));
  check('   다 갔으면 보내기 버튼이 사라진다', (await ev('getComputedStyle(document.getElementById("tc-msg-send")).display')) === 'none');
  await ev('document.getElementById("tc-msg-cancel").click()');

  console.log('\n── ⑤ 📩 한 명 칩은 예전 그대로 ──────────────────');
  await ev('window.__sent = []; window.__confirms = []; document.querySelector("#tc-body .tc-msg-pin").click()'); await sleep(200);
  const t1 = await ev('document.getElementById("tc-msg-text").value');
  check('한 명 창은 글이 그 학생 이름으로 미리 채워진다 (자리표 없음)', /탁학생 학생/.test(t1) && !/\{/.test(t1), t1);
  await ev('document.getElementById("tc-msg-send").click()'); await sleep(300);
  check('   한 명은 묻지 않고 바로 1건', (await ev('window.__confirms.length')) === 0 && (await ev('window.__sent.length')) === 1);
  await ev('document.getElementById("tc-msg-cancel").click()');

  console.log('\n── ⑤-2 보내는 중 닫았다 다시 열어도 두 번 안 나간다 (Codex P2) ──');
  await ev('window.__sent = []; window.__delay = 400; document.getElementById("tc-bulk-msg").click()'); await sleep(150);
  await ev('document.getElementById("tc-msg-send").click()'); await sleep(100);
  await ev('document.getElementById("tc-msg-cancel").click(); document.getElementById("tc-bulk-msg").click()'); await sleep(100);
  await ev('document.getElementById("tc-msg-send").click()'); await sleep(100);
  check('앞 묶음이 끝나기 전 새 «보내기» 는 막고 이유를 말한다', /아직 끝나지 않았습니다/.test(await ev('document.getElementById("tc-msg-out").textContent')));
  await sleep(1600);
  const dup = JSON.parse(await ev('JSON.stringify(window.__sent.map(function(b){return b.user_id}))'));
  check('   학생마다 정확히 한 번씩 (중복 0)', dup.length === 3 && new Set(dup).size === 3, JSON.stringify(dup));
  await ev('window.__delay = 0; window.__sent = []; document.getElementById("tc-msg-send").click()'); await sleep(400);
  check('   앞 묶음이 끝나면 다시 보낼 수 있다 (짝)', (await ev('window.__sent.length')) === 3);
  await ev('document.getElementById("tc-msg-cancel").click()');

  console.log('\n── ⑥ 폰 폭 · EN ─────────────────────────────────');
  await c.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await sleep(400);
  check('390px 에서 버튼이 화면 안', await ev('document.getElementById("tc-bulk-msg").getBoundingClientRect().right <= innerWidth + 1'));
  await c.send('Emulation.clearDeviceMetricsOverride');
  await ev(`(function(){ if (typeof toggleAdminLang === 'function') return toggleAdminLang(); window.adminLang='en'; document.dispatchEvent(new CustomEvent('mangoi:lang-changed')); })()`);
  await sleep(800);
  check('EN 전환 → 버튼이 영어', /Message selected/.test(await ev('document.getElementById("tc-bulk-msg").textContent')));
  check('   전체 선택 칸 이름도 영어', (await ev('document.getElementById("tc-sel-all").getAttribute("aria-label")')) === 'Select all');

  c.close(); bye();
  console.log('\n════════════════════════════════════════════');
  console.log(`  ${FAIL ? "⚠" : "✅"} PASS ${PASS} / FAIL ${FAIL}`);
  console.log('════════════════════════════════════════════');
  process.exit(FAIL ? 1 : 0);
}
main().catch(e => { console.error('실행 실패:', e); process.exit(2); });
