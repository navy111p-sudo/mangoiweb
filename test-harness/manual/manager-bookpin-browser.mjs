// -*- coding: utf-8 -*-
/* ═══════════════════════════════════════════════════════════════════════════
   📚 매니저 화면(manager.html)의 「교재 미배정 ▸」 배지 — 진짜 브라우저 검사
   (2026-09-08 신설 · 사장님 지시 「manager.html도 눌리게 해줘」)

   [왜 따로 필요한가] 이 화면의 설계 계약 1번이 «외부 리소스 0개» 다. 그래서 배정 창을
   **누른 뒤에만** 받는데, 그 «누르기 전에는 안 받는다» 는 코드를 읽어서는 확인할 수 없다.
   요청이 실제로 나가는지 세어야 한다.

   ⚠️ manual/ 규약상 게이트가 물어 가지 않는다 — manager.html 의 배지·bindBookPins·
      loadBulkbook 을 건드리면 사람이 직접:
        node test-harness/manual/manager-bookpin-browser.mjs
   ═══════════════════════════════════════════════════════════════════════════ */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = Number(process.env.MBP_PORT || 8921);
const CDP = Number(process.env.MBP_CDP || 9341);
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let PASS = 0, FAIL = 0;
const check = (n, ok, why) => {
  if (ok) { PASS++; console.log('  OK   ' + n); }
  else { FAIL++; console.log('  FAIL ' + n + (why ? ' — ' + why : '')); }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

const NOW = Date.now();
const SESSIONS = [
  { source: 'mangoi', schedule_id: 3001, observable: true, room_id: 'class-3001-20260908',
    student_uid: 'mby1', student_name: '지승연', teacher_name: 'KAYE', level: null, textbook: null,
    textbook_assigned: false, start_time: '12:30', start_ts: NOW, end_ts: NOW + 12e5,
    status: 'live', join_open: true, is_level_test: false, academy: '망고아이', contact_phone: null },
  { source: 'mangoi', schedule_id: 3002, observable: true, room_id: 'class-3002-20260908',
    student_uid: 'jjy2323', student_name: '장지웅', teacher_name: '중국어 강선생님', level: 'Lv 5',
    textbook: 'BTS 2 001', textbook_assigned: true, start_time: '18:00', start_ts: NOW + 9e6, end_ts: NOW + 9e6 + 18e5,
    status: 'early', join_open: false, is_level_test: false, academy: '유앤아이', contact_phone: null },
];

const BOOT = `
  try {
    localStorage.setItem('mangoi_admin_session', JSON.stringify({ username:'mgr_karl', role:'hq_mgr' }));
    localStorage.setItem('mangoi_lang','ko');
  } catch(e){}
  (function(){
    window.__scripts = [];       /* 이 화면이 «받은» 외부 스크립트 — 계약 1번을 재는 자다 */
    window.__books = 0;
    var ok = function(body){ return new Response(JSON.stringify(body), { status:200, headers:{'content-type':'application/json'} }); };
    var real = window.fetch.bind(window);
    window.fetch = function(u, o){
      var s = String((u && u.url) || u || '');
      if (s.indexOf('/api/admin/classes/today') >= 0) return Promise.resolve(ok({ ok:true, sessions:${JSON.stringify(SESSIONS)}, date:'2026-09-08', counts:{} }));
      if (s.indexOf('/api/admin/textbooks') >= 0) { window.__books++; return Promise.resolve(ok({ ok:true, items:[], library:[{ name:'BTS 1 001', level:'Lv 1', quizzes:12, files:20, lang:'en' }] })); }
      if (s.indexOf('/api/admin/students/bulk-assign-textbook') >= 0) {
        try { window.__lastBulkBody = JSON.parse((o && o.body) || '{}'); } catch(e) { window.__lastBulkBody = null; }
        return Promise.resolve(ok({ ok:true, dry:true, targets:1 }));
      }
      /* 🏢 본사 매니저라야 «오늘 전체 수업» 카드(#hqCards)가 켜진다 — 그 판정은 exec/summary 의
         scope.type 으로 한다(manager.html paintMonth). 이걸 안 주면 카드가 hidden 이라
         배지가 «안 보인다» 로 나오는데 그건 **검사 환경 문제**이지 화면 버그가 아니다
         (CLAUDE.md 2장 「FAIL 이 나면 검사 쪽을 먼저 의심하라」). */
      if (s.indexOf('/api/admin/exec/summary') >= 0) return Promise.resolve(ok({ ok:true, scope:{ type:'hq', label:'본사' }, this_month:{ period:'2026-09' }, students:{} }));
      if (s.indexOf('/api/admin/me') >= 0) return Promise.resolve(ok({ ok:true, username:'mgr_karl', role:'hq_mgr', scope:{ type:'hq' } }));
      return Promise.resolve(ok({ ok:true }));
    };
    /* 📌 <script src> 가 실제로 붙는 순간을 센다 — «누르기 전에는 0개» 를 재려면 이것뿐이다 */
    var addOrig = Element.prototype.appendChild;
    Element.prototype.appendChild = function(node){
      try { if (node && node.tagName === 'SCRIPT' && node.src) window.__scripts.push(String(node.src)); } catch(e){}
      return addOrig.call(this, node);
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
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && waiting.has(m.id)) { const { res, rej } = waiting.get(m.id); waiting.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
  };
  const send = (method, params) => new Promise((res, rej) => { const i = ++id; waiting.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  return { send, close: () => ws.close() };
}

async function main() {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: PUBLIC, stdio: 'ignore' });
  const br = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
    `--remote-debugging-port=${CDP}`, '--window-size=1400,1000', 'about:blank'], { stdio: 'ignore' });
  const bye = () => { try { br.kill(); } catch (e) {} try { srv.kill(); } catch (e) {} };
  process.on('exit', bye);
  await sleep(2200);

  const c = await cdp();
  await c.send('Page.enable'); await c.send('Runtime.enable');
  try { await c.send('Network.enable'); } catch (e) {}
  try { await c.send('Network.setCacheDisabled', { cacheDisabled: true }); } catch (e) {}
  /* ⚠️ 서비스워커가 cache-first 로 옛 사본을 주면 변이시험이 조용히 통과한다(CLAUDE.md 2장) */
  try { await c.send('Network.setBypassServiceWorker', { bypass: true }); } catch (e) {}
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: BOOT });
  await c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/manager.html?_nc=${Date.now()}` });
  await sleep(4000);

  const ev = async expr => {
    const r = await c.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception || {}).description);
    return r.result.value;
  };

  console.log('\n── ① 계약 1번 — 첫 화면은 외부 스크립트 0개 ────────');
  check('화면이 뜬 뒤에도 받은 <script src> 가 0개다',
    (await ev('window.__scripts.length')) === 0, JSON.stringify(await ev('JSON.stringify(window.__scripts)')));
  /* ⚠️ 브라우저로는 «첫 화면 이후» 밖에 못 본다 — HTML 에 정적으로 박아 넣는 위반은
     소스를 읽어야 잡힌다(변이시험에서 실제로 이 구멍을 찾았다). */
  const MGR = readFileSync(join(PUBLIC, 'manager.html'), 'utf8');
  check('   HTML 에 <script src> 를 정적으로 박지 않았다',
    !/<script[^>]+\ssrc=/i.test(MGR), (MGR.match(/<script[^>]+\ssrc=[^>]*>/i) || [''])[0]);
  check('   배정 창 파일을 정적으로 싣지 않는다 (누른 뒤에만 받는다)',
    !/<script[^>]*adm-bulkbook/i.test(MGR));
/* ℹ️ 이 화면은 `/css/mangoi-layout.css` 한 줄을 이미 싣고 있다(2026-08-14 화면 비율 통일).
   계약 1번의 문자 그대로는 예외이지만 **이번 변경과 무관한 기존 상태**라 여기서 판정하지 않는다 —
   검사를 자기 범위 밖으로 넓히면 무관한 것이 빨간불이 된다(CLAUDE.md 2장). */

  console.log('\n── ② 배지가 누를 수 있는가 ─────────────────────────');
  await ev('(function(){var d=document.getElementById("c-today"); if(d && !d.open) d.open = true;})()');
  await ev('typeof loadTodayAll === "function" ? loadTodayAll() : Promise.reject("loadTodayAll 없음")');
  await sleep(900);
  check('오늘 수업 2건이 그려졌다', (await ev('document.querySelectorAll("#todayAllBody .row").length')) >= 2,
    String(await ev('document.querySelectorAll("#todayAllBody .row").length')));
  const pins = await ev('document.querySelectorAll("#todayAllBody [data-bookpin]").length');
  /* ⚠️ «배정된 학생은 안 눌린다» 를 짝으로 — 없으면 «전부 눌리게» 해도 통과한다 */
  check('미배정 1건만 누를 수 있다 (배정된 줄은 아니다)', pins === 1, '누를 수 있는 배지 ' + pins + '개');
  /* ⚠️ 배지가 아예 없으면 아래 검사들이 null 에 대고 재다 «크래시» 한다 — 스택트레이스만
     남으면 무엇이 깨졌는지 안 보인다(CLAUDE.md 2장). 깔끔한 FAIL 로 끝낸다. */
  if (!pins) {
    check('배지가 없어 ②~⑥ 을 잴 수 없다 (먼저 배지를 되살리세요)', false);
    c.close(); bye();
    console.log(`\n  ⚠ PASS ${PASS}   FAIL ${FAIL}`);
    process.exit(1);
  }
  const vis = JSON.parse(await ev(`(function(){var e=document.querySelector("#todayAllBody [data-bookpin]");
    var chain=[], n=e; while(n && n!==document.documentElement){ var s=getComputedStyle(n);
      if (s.display==='none'||s.visibility==='hidden') chain.push((n.id||n.tagName)+':'+s.display+'/'+s.visibility); n=n.parentElement; }
    return JSON.stringify({off:!!e.offsetParent, hidden:chain})})()`));
  check('   그 배지가 화면에 실제로 보인다', vis.off, JSON.stringify(vis));
  const shape = JSON.parse(await ev(`(function(){var e=document.querySelector("#todayAllBody [data-bookpin]");var s=getComputedStyle(e);
    return JSON.stringify({tag:e.tagName, role:e.getAttribute('role'), tab:e.getAttribute('tabindex'), cur:s.cursor, h:Math.round(e.getBoundingClientRect().height)})})()`));
  check('   span+role="button"·손가락 커서·배지 크기 그대로', shape.tag === 'SPAN' && shape.role === 'button' && shape.tab === '0' && shape.cur === 'pointer' && shape.h <= 32, JSON.stringify(shape));
  /* 「보인다」와 「손이 닿는다」는 다르다 */
  const top = await ev(`(function(){var b=document.querySelector("#todayAllBody [data-bookpin]");b.scrollIntoView({block:"center"});var r=b.getBoundingClientRect();
    var el=document.elementsFromPoint(r.left+r.width/2, r.top+r.height/2)[0]; return el ? (el.getAttribute('data-bookpin') || el.tagName) : null})()`);
  check('   무엇에도 안 덮인다 (맨 위가 그 배지)', top === 'mby1', String(top));

  console.log('\n── ③ 누른 «뒤에만» 배정 창을 받는가 ────────────────');
  await ev('document.querySelector("#todayAllBody [data-bookpin]").click()');
  await sleep(1200);
  const got = JSON.parse(await ev('JSON.stringify(window.__scripts)'));
  check('그때 비로소 adm-bulkbook.js 를 받는다', got.length === 1 && /adm-bulkbook\.js/.test(got[0]), JSON.stringify(got));
  /* ⚠️ ?v= 가 admin.html 과 어긋나면 두 화면이 다른 사본을 쓴다 */
  check('   admin.html 과 같은 ?v= 를 쓴다', /adm-bulkbook\.js\?v=\d+/.test(got[0] || ''), String(got[0]));
  check('배정 창이 실제로 열린다',
    (await ev('(function(){var o=document.getElementById("bat-overlay"); return o ? getComputedStyle(o).display : null})()')) === 'flex');
  const pinned = await ev('document.getElementById("bat-pinned").textContent');
  check('   «이 학생에게만» 이라고 누구인지 못 박는다',
    /이 학생에게만/.test(pinned || '') && /mby1/.test(pinned || ''), String(pinned));
  check('   대상 미리보기 전에는 실행 버튼이 잠겨 있다', await ev('!!document.getElementById("bat-run").disabled'));

  console.log('\n── ④ 요청에 «그 학생만» 실리는가 ───────────────────');
  await ev('window.__lastBulkBody = null');
  await ev(`(function(){var b=document.getElementById("bat-book"); b.value='BTS 1 001'; b.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await ev('document.getElementById("bat-preview").click()');
  await sleep(500);
  const body = JSON.parse(await ev('JSON.stringify(window.__lastBulkBody)'));
  check('그 학생 아이디만 실린다', JSON.stringify(body && body.user_ids) === '["mby1"]', JSON.stringify(body));
  check('   학생 검색어는 비워 보낸다', (body || {}).q === '', JSON.stringify((body || {}).q));

  console.log('\n── ⑤ 두 번째부터는 다시 안 받는가 ──────────────────');
  await ev('document.getElementById("bat-close").click()');
  await sleep(200);
  await ev('document.querySelector("#todayAllBody [data-bookpin]").click()');
  await sleep(600);
  check('같은 파일을 두 번 받지 않는다', (await ev('window.__scripts.length')) === 1, String(await ev('window.__scripts.length')));
  check('   그래도 창은 다시 열린다',
    (await ev('(function(){var o=document.getElementById("bat-overlay"); return o ? getComputedStyle(o).display : null})()')) === 'flex');
  await ev('document.getElementById("bat-close").click()');

  console.log('\n── ⑥ 다시 그려도 배선이 살아 있는가 ────────────────');
  await ev('loadTodayAll()');
  await sleep(900);
  await ev('document.querySelector("#todayAllBody [data-bookpin]").click()');
  await sleep(600);
  check('목록을 다시 그린 뒤에도 배지가 눌린다 (위임 리스너)',
    (await ev('(function(){var o=document.getElementById("bat-overlay"); return o ? getComputedStyle(o).display : null})()')) === 'flex');
  await ev('document.getElementById("bat-close").click()');

  c.close(); bye();
  console.log('\n════════════════════════════════════════════');
  console.log(`  ${FAIL ? '⚠' : '✅'} PASS ${PASS}   FAIL ${FAIL}`);
  console.log('════════════════════════════════════════════');
  process.exit(FAIL ? 1 : 0);
}
main().catch(e => { console.error('실행 실패:', e); process.exit(2); });
