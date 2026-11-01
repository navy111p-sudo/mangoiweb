#!/usr/bin/env node
/* 🏠/🏢 담당 강사 «근무지» 칸(전체·홈·사무실) 브라우저 검사 — 2026-10-07 사장님 「담당 강사 옆에 칸 추가」.
   ⚠️ 자동으로 안 돕니다(manual/). 사람이 부릅니다: node test-harness/manual/teacher-workplace-filter-browser.mjs
   강사 목록은 운영 D1 실측(2026-10-07, 30명)을 그대로 넣고, workplace 는 서버와 «같은 규칙»
   (명부 group_name: home 포함 → 홈 · office/head 포함 → 사무실 · 그 밖 → 모름)으로 만든다.
   여러 번 왕복(전체→홈→사무실→전체…)해도 목록·숫자가 같고, 고른 강사가 빠지면 화면이 말하는지 본다. */
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = Number(process.env.TWF_PORT || 8933);
const CDP = Number(process.env.TWF_CDP || 9353);
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let PASS = 0, FAIL = 0;
const check = (n, ok, why) => { if (ok) { PASS++; console.log('  OK   ' + n); } else { FAIL++; console.log('  FAIL ' + n + (why ? ' — ' + why : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 운영 D1 실측 2026-10-07 — [id, name, active, group_name]
const D1 = [[7,'ANA',1,'Office Teacher'],[2,'BELLE',1,'Home-based'],[15,'CHAINE',1,'Home-based'],[5,'CINDY',1,'Office Teacher'],
 [22,'FAR',1,'Office Teacher'],[24,'HANNAH',1,'Home-based'],[10,'HT NESS',1,'Home-based'],[6,'JANE',1,'Office Teacher'],
 [28,'JANICE',1,'미국 오후반'],[13,'JENNY',1,'Home-based'],[23,'JP',1,'Office Teacher'],[25,'KARL',1,'Head Teacher'],
 [8,'KAYE',1,'Office Teacher'],[1,'KES',1,'Office Teacher'],[16,'KRYSTEL',1,'Home-based'],[18,'LEN',1,'Office Teacher'],
 [27,'MAIMAI',1,'Head Teacher'],[26,'MELCA',1,null],[17,'SHAS',1,'Office Teacher'],[14,'SID',1,'Office Teacher'],
 [30,'WAN',1,null],[19,'WIN',1,'Home-based'],[9,'ZEE',1,'Office Teacher'],[29,'중국어 강선생님',1,'중국어 강사'],
 [21,'FAYE',0,null],[3,'HT FARRAH',0,null],[20,'JED',0,null],[12,'JINETTE',0,'Home-based'],[11,'MARIANE',0,'Home-based'],[4,'RICA',0,'Office Teacher']];
const wpOf = g => { g = String(g || '').toLowerCase(); return g.includes('home') ? 'home' : (g.includes('office') || g.includes('head')) ? 'office' : ''; };
const ROWS = D1.map(([id, name, active, g]) => ({ id, name, active, workplace: wpOf(g) }));
const exp = (wp, left) => ROWS.filter(t => (left || t.active) && (!wp || t.workplace === wp)).map(t => String(t.id)).sort();

const BOOT = `
  try { localStorage.setItem('mangoi_admin_welcome_v1_done','1'); localStorage.setItem('mangoi_lang','ko'); } catch(e){}
  (function(){
    var ROWS = ${JSON.stringify(ROWS)};
    var ok = function(b){ return Promise.resolve(new Response(JSON.stringify(b), { status:200, headers:{'content-type':'application/json'} })); };
    var real = window.fetch.bind(window);
    window.__bodies = [];
    window.fetch = function(u, o){
      var s = String((u && u.url) || u || ''); var m = (o && o.method) || 'GET';
      if (o && o.body) { try { window.__bodies.push({ m:m, u:s, b:JSON.parse(o.body) }); } catch(_){} }
      if (s.indexOf('/api/admin/teachers') >= 0) return ok({ ok:true, items: ROWS });
      if (s.indexOf('/api/admin/class-schedules') >= 0) {
        if (m === 'POST') return ok({ ok:true, created:[{ id:9100 }], failed:[] });
        return ok({ ok:true, count:0, items:[] });
      }
      if (s.indexOf('/api/admin/me') >= 0) return ok({ ok:true, username:'admin', role:'hq_exec' });
      if (s.indexOf('/api/') >= 0) return ok({ ok:true, items:[], data:{} });
      return real(u, o);
    };
    window.confirm = function(){ return true; }; window.alert = function(){};
  })();`;

async function cdp() {
  const tabs = (await (await fetch('http://127.0.0.1:' + CDP + '/json/list')).json()).filter(t => t.type === 'page' && t.webSocketDebuggerUrl);
  const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const w = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && w.has(m.id)) { const { res, rej } = w.get(m.id); w.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } };
  return { send: (method, params) => new Promise((res, rej) => { const i = ++id; w.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params: params || {} })); }) };
}

async function main() {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: PUBLIC, stdio: 'ignore' });
  const br = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=' + CDP, '--window-size=1500,1000', 'about:blank'], { stdio: 'ignore' });
  process.on('exit', () => { try { br.kill(); } catch (e) {} try { srv.kill(); } catch (e) {} });
  await sleep(2400);
  const c = await cdp();
  await c.send('Page.enable'); await c.send('Runtime.enable');
  await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  try { await c.send('Network.setBypassServiceWorker', { bypass: true }); } catch (e) {}
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: BOOT });
  await c.send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/admin/student.html?uid=jeong&_nc=' + Date.now() });
  await sleep(3800);
  const ev = async x => { const r = await c.send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(String((r.exceptionDetails.exception || {}).description || r.exceptionDetails.text).split('\n')[0]); return r.result.value; };
  await ev('(function(){var b=document.querySelector(\'.tab[data-tab="schedule"]\');if(b)b.click();})()');
  await sleep(2200);

  const ids = () => ev('JSON.stringify([...document.querySelectorAll("#ns-teacher-sel option")].map(o=>o.value).filter(Boolean).sort())').then(JSON.parse);
  const pick = (v) => ev(`(function(){var s=document.getElementById("ns-teacher-wp"); s.value=${JSON.stringify(v)}; s.dispatchEvent(new Event("change",{bubbles:true})); return s.value;})()`);
  const labels = () => ev('JSON.stringify([...document.getElementById("ns-teacher-wp").options].map(o=>o.textContent))').then(JSON.parse);

  console.log('\n── ⓪ 칸이 보이고 담당 강사 바로 옆에 있다 ──');
  const geo = JSON.parse(await ev(`JSON.stringify((function(){
    var t=document.getElementById("ns-teacher-sel").getBoundingClientRect(), w=document.getElementById("ns-teacher-wp").getBoundingClientRect();
    var e=document.elementFromPoint(w.left+w.width/2, w.top+w.height/2);
    return {tl:t.left,tr:t.right,tt:t.top,wl:w.left,wt:w.top,ww:w.width,wh:w.height,top:e&&e.id};})())`));
  check('근무지 칸이 그려졌다(폭·높이 > 0)', geo.ww > 0 && geo.wh > 0, JSON.stringify(geo));
  check('담당 강사 «오른쪽 바로 옆»(간격 40px 이내)', geo.wl >= geo.tr && geo.wl - geo.tr < 40, (geo.wl - geo.tr) + 'px');
  check('같은 줄(위치 차 6px 이내)', Math.abs(geo.wt - geo.tt) < 6, geo.wt + ' vs ' + geo.tt);
  check('맨 위가 그 칸이다(가려지지 않음)', geo.top === 'ns-teacher-wp', geo.top);

  console.log('\n── ① 숫자가 운영 데이터와 맞는다 ──');
  const lb = await labels();
  /* ⛔ 숫자를 손으로 적지 않는다(처음에 8·14 로 잘못 세었다) — 데이터에서 센다. 실측 24 = 홈 7 + 사무실 13 + 모름 4 */
  const n = wp => exp(wp, false).length;
  check('전체 (' + n('') + ')', lb[0].includes('(' + n('') + ')'), lb[0]);
  check('홈 (' + n('home') + ')', lb[1].includes('(' + n('home') + ')'), lb[1]);
  check('사무실 (' + n('office') + ')', lb[2].includes('(' + n('office') + ')'), lb[2]);
  check('[짝] 모르는 강사(JANICE·MELCA·WAN·강선생님)는 «전체» 에만 — 홈+사무실 < 전체', n('home') + n('office') < n(''));

  console.log('\n── ② 여러 번 왕복해도 같은 답 ──');
  const seq = ['home', 'office', '', 'office', 'home', '', 'home', 'home', 'office', ''];
  for (let i = 0; i < seq.length; i++) {
    const v = seq[i]; await pick(v); await sleep(80);
    const got = await ids(); const want = exp(v, false);
    check(`#${i + 1} ${v || '전체'} → ${want.length}명 정확히`, JSON.stringify(got) === JSON.stringify(want), got.join(','));
  }
  console.log('\n── ③ 퇴사 강사도 보기와 함께 ──');
  await ev('(function(){var c=document.getElementById("ns-show-left"); c.checked=true; c.dispatchEvent(new Event("change",{bubbles:true}));})()');
  for (const v of ['home', 'office', '']) { await pick(v); await sleep(80); const got = await ids(); const want = exp(v, true);
    check(`퇴사 포함 ${v || '전체'} → ${want.length}명`, JSON.stringify(got) === JSON.stringify(want), got.join(',')); }
  const lbl = await ev('document.getElementById("ns-show-left-lb").textContent');
  check('전체일 때 퇴사 6명', /\(6명\)/.test(lbl), lbl);
  await pick('home'); await sleep(80);
  check('홈일 때 퇴사 2명(JINETTE·MARIANE)', /\(2명\)/.test(await ev('document.getElementById("ns-show-left-lb").textContent')));
  await ev('(function(){var c=document.getElementById("ns-show-left"); c.checked=false; c.dispatchEvent(new Event("change",{bubbles:true}));})()');

  console.log('\n── ④ 고른 강사가 빠지면 화면이 말한다 / 남으면 그대로 ──');
  await pick(''); await ev('document.getElementById("ns-msg").innerHTML=""; document.getElementById("ns-teacher-sel").value="2"');
  await pick('home'); await sleep(80);
  check('BELLE(홈) 고른 채 홈 → 그대로', await ev('document.getElementById("ns-teacher-sel").value') === '2');
  check('[짝] 그때는 아무 말도 안 한다', !/선택이 풀렸/.test(await ev('document.getElementById("ns-msg").textContent')));
  await pick('office'); await sleep(80);
  check('사무실로 바꾸면 선택이 풀린다', await ev('document.getElementById("ns-teacher-sel").value') === '');
  check('[짝] 그 사실을 말한다', /선택이 풀렸/.test(await ev('document.getElementById("ns-msg").textContent')));

  console.log('\n── ⑤ 거른 뒤 고른 강사가 실제로 id 로 등록된다 ──');
  await pick('office'); await ev('document.getElementById("ns-teacher-sel").value="22"');
  await ev('(function(){var k=document.getElementById("ns-kind"); if(k){k.value="one_off"; k.dispatchEvent(new Event("change",{bubbles:true}));} var d=document.getElementById("ns-date"); if(d) d.value="2026-10-16"; document.getElementById("ns-time").value="21:10"; document.getElementById("ns-add").click();})()');
  await sleep(1500);
  const body = JSON.parse(await ev('JSON.stringify((window.__bodies||[]).filter(x=>x.m==="POST"&&/class-schedules/.test(x.u)).pop()||null)'));
  check('POST 가 나갔다', !!body, JSON.stringify(body));
  check('teacher_id = 22 (FAR, 사무실)', body && String(body.b.teacher_id) === '22', body && JSON.stringify(body.b).slice(0, 200));

  console.log('\n결과: PASS ' + PASS + ' / FAIL ' + FAIL + '\n');
  process.exit(FAIL ? 1 : 0);
}
main().catch(e => { console.log('FAIL 실행 — ' + e.message); process.exit(1); });
