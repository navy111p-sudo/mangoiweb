// -*- coding: utf-8 -*-
/* ═══════════════════════════════════════════════════════════════════════════
   🆔 강사 화면 수업 이름 옆 «학생 아이디» — 진짜 브라우저에 그려서 재는 검사
   (2026-09-22 신설)

   [왜 필요한가] 이 변경에서 틀릴 수 있는 것은 «무슨 글자가·무슨 색으로 그려지고
   읽히는가» 뿐이다. 문자열 하니스는 함수도 값도 전부 «있다» 고 보고 통과한다
   (CLAUDE.md 2장 「하니스가 전부 초록인데 화면이 죽어 있음」).
   「있다」·「보인다」·「읽힌다」는 서로 다른 값이라 셋을 따로 잰다.

   ⚠️ manual/ 규약상 파일 이름이 *_harness.mjs 가 아니라 **게이트가 물어 가지 않는다.**
      teacher.html 의 stuParts/stuLabelHtml·.stu-id·renderClasses 를 건드리면 사람이 직접:
        node test-harness/manual/teacher-student-id-browser.mjs

   ⚠️ /json/new 로 «새 탭» 을 열면 이 컨테이너의 크로미움이 페이지 스크립트를 아예
      실행하지 않는다 → /json/list 의 «이미 있는 탭» 을 잡아 Page.navigate 로 연다.
   ⚠️ 이 화면은 localStorage 캐시(mangoi_teacher_portal_v1)를 먼저 그린다 → 회차마다 비운다.
   ═══════════════════════════════════════════════════════════════════════════ */
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = Number(process.env.TSID_PORT || 8932);
const CDP = Number(process.env.TSID_CDP || 9338);
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let PASS = 0, FAIL = 0;
const check = (n, ok, why) => {
  if (ok) { PASS++; console.log('  OK   ' + n); }
  else { FAIL++; console.log('  FAIL ' + n + (why ? ' — ' + why : '')); }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ── 씨앗 — 한 목록 안에 «네 모양» 을 모두 둔다 ─────────────────────────────
   ⛔ 「이름+아이디」 하나만 두면 «같은 글자 두 번 막기»·«이름 없음» 가드가
      한 번도 안 돌아 검사가 조용히 헛돈다(CLAUDE.md 「그 상황에 닿지 않으면」). */
const BOOT = `
  try { localStorage.clear(); } catch(e){}
  (function(){
    var now = Date.now();
    var kst = new Date(now + 9*3600*1000);
    var today = kst.toISOString().slice(0,10);
    var mk = function(o){
      var s = now + (o.inMin||0)*60000;
      return Object.assign({
        kind:'class', schedule_id:o.id, room_id:'class-'+o.id+'-'+today.replace(/-/g,''),
        start_time:'10:00', start_ts:s, end_ts:s+20*60000,
        open_at_ts:s-30*60000, close_at_ts:s+35*60000,
        enter_from_ts:s-30*60000, enter_until_ts:s+35*60000,
        duration_min:20, status:'open', class_state:'scheduled',
        class_kind:'regular', is_level_test:false, level:null, textbook:null
      }, o);
    };
    var classes = [
      mk({ id:901, student_name:'정우영', student_uid:'jeong' }),
      mk({ id:902, student_name:'김하나', student_uid:'lt18', class_kind:'level_test', is_level_test:true }),
      mk({ id:903, student_name:'mby1',  student_uid:'mby1' }),
      mk({ id:904, student_name:null,    student_uid:'ysyt01' }),
      mk({ id:905, student_name:'박세리', student_uid:'seri', class_kind:'trial' }),
      { kind:'lms', schedule_id:null, room_id:null, student_uid:null, student_name:null,
        start_time:'11:00', duration_min:30, class_kind:'regular', is_level_test:false,
        start_ts:now, end_ts:now, open_at_ts:now, close_at_ts:now, status:'done', class_state:'done' }
    ];
    var upcoming = [{ id:911, date:'2099-01-02', start_time:'15:00', start_ts:now+86400000,
                      duration_min:20, student_uid:'delaware', student_name:'최윤서',
                      class_kind:'level_test', is_level_test:true }];
    var week = { start: today, end: today, days: [{ date: today, dow: kst.getUTCDay(), is_today:true,
      items: [{ id:901, start_time:'10:00', duration_min:20, student_uid:'jeong',
                student_name:'정우영', kind:'class', class_kind:'regular', is_level_test:false },
              { id:0, start_time:'11:00', duration_min:30, student_uid:null,
                student_name:null, kind:'lms', class_kind:'regular', is_level_test:false }] }] };
    var PORTAL = { ok:true, now:now, today:today,
      me:{ username:'mangoi_018', name:'Teacher Farrah', role:'teacher',
           is_teacher:true, is_manager:false, lang:'ko' },
      classes:classes, upcoming:upcoming, week:week,
      notices:[], resources:[], rating:null };
    var ok = function(b){ return new Response(JSON.stringify(b), { status:200, headers:{'content-type':'application/json'} }); };
    var real = window.fetch.bind(window);
    window.fetch = function(u, o){
      var s = String((u && u.url) || u || '');
      if (s.indexOf('/api/teacher/portal') >= 0) return Promise.resolve(ok(PORTAL));
      if (s.indexOf('/api/') >= 0) return Promise.resolve(ok({ ok:true, items:[] }));
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
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && waiting.has(m.id)) { const { res, rej } = waiting.get(m.id); waiting.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
  };
  const send = (m, p) => new Promise((res, rej) => { const i = ++id; waiting.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  return { send, close: () => ws.close() };
}

/* 반투명 층을 만나면 «모아 두었다가 아래에서 위로» 합성한다(CLAUDE.md 2장). */
const CONTRAST_FN = `(function(){
  function parse(c){ var m=/rgba?\\(([^)]+)\\)/.exec(c||''); if(!m) return null;
    var p=m[1].split(',').map(function(x){return parseFloat(x)}); return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1}; }
  function lin(v){ v/=255; return v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4); }
  function lum(c){ return 0.2126*lin(c.r)+0.7152*lin(c.g)+0.0722*lin(c.b); }
  window.__contrastOf = function(el){
    if(!el) return null;
    var fg = parse(getComputedStyle(el).color); if(!fg) return null;
    var stack = [], n = el;
    while (n && n.nodeType === 1){
      var bg = parse(getComputedStyle(n).backgroundColor);
      if (bg && bg.a > 0){ stack.push(bg); if (bg.a >= 1) break; }
      n = n.parentElement;
    }
    var base = { r:255, g:255, b:255 };
    for (var i = stack.length - 1; i >= 0; i--){ var l = stack[i];
      base = { r: l.r*l.a + base.r*(1-l.a), g: l.g*l.a + base.g*(1-l.a), b: l.b*l.a + base.b*(1-l.a) }; }
    var f = { r: fg.r*fg.a + base.r*(1-fg.a), g: fg.g*fg.a + base.g*(1-fg.a), b: fg.b*fg.a + base.b*(1-fg.a) };
    var L1 = lum(f), L2 = lum(base);
    return Math.round(((Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05)) * 100) / 100;
  };
  return true;
})()`;

async function main() {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: PUBLIC, stdio: 'ignore' });
  const br = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
    `--remote-debugging-port=${CDP}`, '--window-size=1400,1000', 'about:blank'], { stdio: 'ignore' });
  const bye = () => { try { br.kill(); } catch (e) {} try { srv.kill(); } catch (e) {} };
  process.on('exit', bye);
  await sleep(2500);

  const c = await cdp();
  await c.send('Page.enable'); await c.send('Runtime.enable'); await c.send('Network.enable');
  await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  try { await c.send('Network.setBypassServiceWorker', { bypass: true }); } catch (e) {}
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: BOOT });
  await c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/teacher.html?_nc=${Date.now()}` });
  await sleep(4500);

  const ev = async expr => {
    const r = await c.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + ((r.exceptionDetails.exception || {}).description || ''));
    return r.result.value;
  };
  await ev(CONTRAST_FN);

  console.log('\n-- (1) 전제: 화면이 실제로 그려졌는가 --');
  const rows = await ev('document.querySelectorAll("#classes .cls").length');
  check('오늘 수업 줄이 그려졌다', rows >= 5, 'rows=' + rows);

  console.log('\n-- (2) 아이디가 «보이는가» (있다 != 보인다) --');
  const ids = await ev(`JSON.stringify([...document.querySelectorAll("#classes .cls-name .stu-id")]
    .map(function(e){ var r=e.getBoundingClientRect();
      return { t:e.textContent, w:Math.round(r.width), h:Math.round(r.height),
               d:getComputedStyle(e).display, v:getComputedStyle(e).visibility }; }))`);
  const I = JSON.parse(ids);
  check('아이디 span 이 수업 이름 안에 그려진다', I.length >= 2, ids);
  check('전부 실제 크기를 갖는다 (0px 아님)', I.length > 0 && I.every(x => x.w > 0 && x.h > 0), ids);
  check('전부 숨겨져 있지 않다', I.every(x => x.d !== 'none' && x.v !== 'hidden'), ids);
  check('「정우영」 줄에 jeong 이 보인다', I.some(x => x.t === 'jeong'), ids);
  check('레벨테스트 줄에 lt18 이 보인다', I.some(x => x.t === 'lt18'), ids);

  console.log('\n-- (3) 짝: 안 붙여야 할 곳에는 «안 붙는다» --');
  const names = await ev(`JSON.stringify([...document.querySelectorAll("#classes .cls-name")].map(function(e){return e.textContent.trim()}))`);
  const N = JSON.parse(names);
  check('이름==아이디 줄은 mby1 을 한 번만 적는다',
    N.some(t => /^mby1/.test(t)) && !N.some(t => /mby1\s*mby1/.test(t)), names);
  check('이름 없는 줄은 아이디가 «이름 자리» 다 (빈 괄호 없음)',
    N.some(t => /^ysyt01/.test(t)) && !N.some(t => /\(\s*\)/.test(t)), names);
  check('자리표시(옛 LMS) 줄에 아이디를 안 그린다',
    await ev('!document.querySelector("#classes .cls-info .stu-id")'));

  console.log('\n-- (4) 망고아이 안내 — 붙는다 <-> 안 붙는다 --');
  const metas = await ev(`JSON.stringify([...document.querySelectorAll("#classes .cls")].map(function(e){
    var n=e.querySelector(".cls-name"), m=e.querySelector(".cls-meta");
    return { name:(n?n.textContent:"").trim(), meta:(m?m.textContent:"").trim() }; }))`);
  const M = JSON.parse(metas);
  const hint = r => /망고아이에서 입장/.test(r.meta);
  check('레벨테스트 줄에 「망고아이에서 입장」이 붙는다', M.some(r => /lt18/.test(r.name) && hint(r)), metas);
  check('체험수업 줄에도 붙는다', M.some(r => /seri/.test(r.name) && hint(r)), metas);
  check('정규수업 줄에는 안 붙는다', !M.some(r => /jeong/.test(r.name) && hint(r)), metas);
  check('안내가 「옛 LMS 아님」을 말한다', M.some(r => hint(r) && /LMS/.test(r.meta)), metas);

  console.log('\n-- (5) 읽히는가 (WCAG 대비) --');
  const ctr = await ev(`window.__contrastOf(document.querySelector("#classes .cls-name .stu-id"))`);
  check('아이디 글자 대비가 4.5:1 이상', typeof ctr === 'number' && ctr >= 4.5, 'contrast=' + ctr);

  console.log('\n-- (6) 레이아웃 — 넘치지 않는가 (PC/폰) --');
  check('PC 1400px 에서 가로로 안 넘친다', (await ev('document.documentElement.scrollWidth <= window.innerWidth + 1')) === true);
  await c.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(1000);
  check('폰 390px 에서도 가로로 안 넘친다',
    (await ev('document.documentElement.scrollWidth <= window.innerWidth + 1')) === true,
    await ev('document.documentElement.scrollWidth + " > " + window.innerWidth'));
  const stillOn = await ev('document.querySelectorAll("#classes .cls-name .stu-id").length');
  check('폰에서도 아이디가 그대로 보인다', stillOn >= 2, 'n=' + stillOn);
  await c.send('Emulation.clearDeviceMetricsOverride');
  await sleep(700);

  console.log('\n-- (7) 언어를 바꿔도 아이디가 남는가 --');
  const before = await ev('document.querySelectorAll("#classes .cls-name .stu-id").length');
  const how = await ev('(function(){ var b=document.getElementById("langBtn")||document.querySelector("[data-lang-toggle]"); if(b){b.click();return "btn";} if(typeof toggleLang==="function"){toggleLang();return "fn";} return "none"; })()');
  await sleep(1100);
  const after = await ev('document.querySelectorAll("#classes .cls-name .stu-id").length');
  check('언어를 바꿔도 아이디가 사라지지 않는다', after >= before && before > 0,
    'how=' + how + ' before=' + before + ' after=' + after);

  console.log('\n-- (8) 주간 시간표 / 다가오는 수업에도 실렸는가 --');
  const wkN = await ev('document.querySelectorAll(".wk-i .stu-id").length');
  const wkT = await ev('document.querySelectorAll(".wk-i").length');
  check('주간 시간표 칸에도 아이디가 그려진다', wkN >= 1, 'stu-id=' + wkN + ' / wk-i=' + wkT);
  const upN = await ev(`[...document.querySelectorAll(".cls-name")].filter(function(e){return !e.closest("#classes")}).reduce(function(a,e){return a + e.querySelectorAll(".stu-id").length},0)`);
  check('다가오는 수업에도 아이디가 그려진다', upN >= 1, 'n=' + upN);

  console.log(`\nteacher-student-id-browser -- PASS ${PASS} / FAIL ${FAIL}`);
  c.close(); bye();
  process.exit(FAIL ? 1 : 0);
}
main().catch(e => { console.error('실행 실패:', e && e.message || e); process.exit(2); });
