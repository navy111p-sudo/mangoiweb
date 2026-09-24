// -*- coding: utf-8 -*-
/* ═══════════════════════════════════════════════════════════════════════════
   📅 학생 상세 「📅 스케줄」 — 진짜 브라우저에 그려서 재는 검사 (2026-09-22 신설)

   [왜 필요한가] 2026-09-22 사장님 제보 「일정변경·취소가 작동 안 하고 캘린더에도
   반영이 안 된다」. 재 보니 버튼도 API 도 멀쩡했고 실제로 틀린 것은 둘이었다:
     ① 입력칸이 «흰 바탕에 흰 글자»(실측 대비 **1.14**) — 값이 있어도 안 보인다
     ② 캘린더가 그 예약을 원래 안 그린다(반복 전부 + 월간은 통째로)
   둘 다 «무슨 색인가»·«무엇이 그려지는가» 라 **문자열 하니스로는 원리상 못 본다**
   (수리 전 `--fast` 가 전부 초록이었다 — CLAUDE.md 2장).

   ⚠️ manual/ 규약상 이름이 *_harness.mjs 가 아니라 **게이트가 물어 가지 않는다.**
      admin/student.html 의 스케줄 탭·캘린더·두 폼을 건드리면 사람이 직접:
        node test-harness/manual/student-schedule-calendar-browser.mjs

   ⚠️ /json/new 로 «새 탭» 을 열면 이 컨테이너의 크로미움이 페이지 스크립트를 실행하지
      않는다 → /json/list 의 «이미 있는 탭» 을 잡는다(CLAUDE.md 2장).
   ⚠️ 캐시를 두 겹 다 끈다 — HTTP 캐시만 끄면 서비스워커가 옛 사본을 준다.
   ═══════════════════════════════════════════════════════════════════════════ */
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT   = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'cloudflare-deploy', 'public');
const PORT   = Number(process.env.SSC_PORT || 8921);
const CDP    = Number(process.env.SSC_CDP  || 9341);
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const AA = 4.5;

let PASS = 0, FAIL = 0;
const check = (n, ok, why) => {
  if (ok) { PASS++; console.log('  OK   ' + n); }
  else { FAIL++; console.log('  FAIL ' + n + (why ? ' — ' + why : '')); }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* 씨앗은 브라우저 «안» 에서 이번 주 기준으로 만든다 — 주간 뷰가 «이번 주» 만 그리므로
   고정 날짜를 적으면 며칠 뒤 검사가 저절로 빨간불이 된다. */
const BOOT = `
  try { localStorage.setItem('mangoi_admin_welcome_v1_done','1');
        localStorage.setItem('mangoi_lang','ko'); } catch(e){}
  (function(){
    var now = new Date();
    var ws = new Date(now); ws.setDate(now.getDate() - now.getDay()); ws.setHours(0,0,0,0);
    var ymd = function(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
    var day = function(i){ var d = new Date(ws); d.setDate(ws.getDate()+i); return ymd(d); };
    window.__WEEK = { wed: day(3), fri: day(5) };
    var base = { user_id:'jeong', student_name:'정우영', class_type:'regular', duration_min:20,
                 teacher_id:null, status:'active', source:'admin_ui', created_at:Date.now(), teacher_name:null };
    var items = [
      /* ⓐ 1회차 — 날짜 칸만 찼다(서버 POST 가 one_off 를 이렇게 저장한다) */
      Object.assign({}, base, { id:9001, schedule_kind:'one_off',  day_of_week:null, scheduled_date:window.__WEEK.wed, start_time:'16:00' }),
      /* ⓑ 반복 — 등록 폼 경로가 저장하는 **숫자** 표기 */
      Object.assign({}, base, { id:9002, schedule_kind:'recurring', day_of_week:'3',   scheduled_date:null, start_time:'14:20' }),
      /* ⓒ 반복 — 일정변경(PATCH)·운영 D1 정본인 **영문** 표기 */
      Object.assign({}, base, { id:9003, schedule_kind:'recurring', day_of_week:'Wed', scheduled_date:null, start_time:'15:00' }),
      /* ⓓ 반복 — 한글 표기(AI 명령 경로) */
      Object.assign({}, base, { id:9004, schedule_kind:'recurring', day_of_week:'수',  scheduled_date:null, start_time:'17:00' }),
      /* ⓔ 취소된 것 — 그려지면 안 된다(짝 검사) */
      Object.assign({}, base, { id:9005, schedule_kind:'recurring', day_of_week:'3',   scheduled_date:null, start_time:'18:00', status:'cancelled' }),
      /* ⓕ 주간 격자 밖(09시 전) — 주간에는 안 그려져야 한다(짝 검사) */
      Object.assign({}, base, { id:9006, schedule_kind:'recurring', day_of_week:'3',   scheduled_date:null, start_time:'03:00' }),
      /* ⓖ 두 칸이 다 찼다 — sessions/today 와 같이 **날짜가 이겨야** 한다(금요일에만) */
      Object.assign({}, base, { id:9007, schedule_kind:'recurring', day_of_week:'1',   scheduled_date:window.__WEEK.fri, start_time:'20:00' })
    ];
    window.__calls = [];
    var ok = function(b){ return Promise.resolve(new Response(JSON.stringify(b), { status:200, headers:{'content-type':'application/json'} })); };
    var real = window.fetch.bind(window);
    window.fetch = function(u, o){
      var s = String((u && u.url) || u || ''); var m = (o && o.method) || 'GET';
      window.__calls.push(m + ' ' + s);
      if (o && o.body) { try { (window.__bodies = window.__bodies||[]).push({ m:m, u:s, b:JSON.parse(o.body) }); } catch(_){} }
      if (s.indexOf('/api/admin/class-schedules') >= 0) {
        if (m === 'GET')    return ok({ ok:true, count:items.length, items:items });
        if (m === 'PATCH')  return ok({ ok:true, id:9001, updated_fields:3 });
        if (m === 'DELETE') return ok({ ok:true, id:9001, status:'cancelled' });
        if (m === 'POST')   return ok({ ok:true, created:[{ id:9100 }], failed:[] });
      }
      /* 🔴 강사 목록 — 포괄 스텁«앞» 에 둔다. 뒤에 두면 items:[] 가 이겨
         드롭다운이 아니라 «폴백» 경로만 검사하게 된다(규칙서: 스텁 순서 함정).
         운영 D1 에 실재하는 그 쌍(FAR 22 · HT FARRAH 3)을 그대로 넣는다. */
      if (s.indexOf('/api/admin/teachers') >= 0) {
        return ok({ ok:true, items:[
          { id:3,  name:'HT FARRAH', active:0 },
          { id:22, name:'FAR',       active:1 },
          { id:27, name:'MAIMAI',    active:null },
          { id:29, name:'강선생님',    active:1 }
        ] });
      }
      if (s.indexOf('/api/admin/enrollments') >= 0) return ok({ ok:true, items:[] });
      if (s.indexOf('/api/admin/me') >= 0) return ok({ ok:true, username:'admin', role:'hq_exec' });
      if (s.indexOf('/api/') >= 0) return ok({ ok:true, items:[], data:{} });
      return real(u, o);
    };
    window.confirm = function(){ window.__confirmed = (window.__confirmed||0)+1; return true; };
    window.alert   = function(t){ (window.__alerts = window.__alerts||[]).push(String(t)); };
  })();
`;

/* 글자가 실제로 읽히는가 — 반투명 층을 모아 아래에서 위로 합성한다(CLAUDE.md 2장).
   ⛔ «색이 무엇인가» 만 보면 안 된다: 이 사고는 색도 배경도 «있는데» 둘이 같았다. */
const CONTRAST_FN = `
  function __px(v){ var m=String(v||'').match(/rgba?\\(([^)]+)\\)/); if(!m) return null;
    var p=m[1].split(',').map(Number); return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1}; }
  function __over(f,b){ return {r:f.r*f.a+b.r*(1-f.a), g:f.g*f.a+b.g*(1-f.a), b:f.b*f.a+b.b*(1-f.a), a:1}; }
  function __bg(el){ var layers=[],n=el;
    while(n){ var c=__px(getComputedStyle(n).backgroundColor);
      if(c && c.a>0){ layers.push(c); if(c.a>=1) break; } n=n.parentElement; }
    var out={r:255,g:255,b:255,a:1};
    for(var i=layers.length-1;i>=0;i--) out=__over(layers[i],out);
    return out; }
  function __lum(c){ var f=function(v){ v/=255; return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4); };
    return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b); }
  function __ratio(a,b){ var l1=__lum(a),l2=__lum(b),hi=Math.max(l1,l2),lo=Math.min(l1,l2); return (hi+0.05)/(lo+0.05); }
  function __contrast(sel){ var el=document.querySelector(sel); if(!el) return null;
    var cs=getComputedStyle(el); var fg=__px(cs.color); if(!fg) return null;
    var bg=__bg(el); if(fg.a<1) fg=__over(fg,bg);
    var r=el.getBoundingClientRect();
    return { c: Math.round(__ratio(fg,bg)*100)/100, w: Math.round(r.width), h: Math.round(r.height),
             color: cs.color, bg: 'rgb('+[bg.r,bg.g,bg.b].map(Math.round).join(',')+')' }; }
`;

async function cdp() {
  const tabs = (await (await fetch('http://127.0.0.1:' + CDP + '/json/list')).json())
    .filter(t => t.type === 'page' && t.webSocketDebuggerUrl);
  if (!tabs.length) throw new Error('열려 있는 탭이 없습니다');
  const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const waiting = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) { const { res, rej } = waiting.get(m.id); waiting.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result); } };
  const send = (method, params) => new Promise((res, rej) => {
    const i = ++id; waiting.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  return { send, close: () => ws.close() };
}

async function main() {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: PUBLIC, stdio: 'ignore' });
  const br  = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
    '--remote-debugging-port=' + CDP, '--window-size=1500,1000', 'about:blank'], { stdio: 'ignore' });
  const bye = () => { try { br.kill(); } catch (e) {} try { srv.kill(); } catch (e) {} };
  process.on('exit', bye);
  await sleep(2400);

  const c = await cdp();
  await c.send('Page.enable'); await c.send('Runtime.enable');
  await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  try { await c.send('Network.setBypassServiceWorker', { bypass: true }); } catch (e) {}
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: BOOT });
  await c.send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/admin/student.html?uid=jeong&_nc=' + Date.now() });
  await sleep(3800);

  const ev = async expr => {
    const r = await c.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(String((r.exceptionDetails.exception || {}).description || r.exceptionDetails.text).split('\n')[0]);
    return r.result.value;
  };
  await ev(CONTRAST_FN);

  console.log('\n── ⓪ 전제 — 화면이 살아 있는가 ─────────────────────');
  check('정본 함수 셋이 전역에 있다',
    await ev('["mgsDowIdx","mgsSchedHitsDate","mgsAiColors"].every(n=>typeof window[n]==="function")'));
  await ev('(function(){var b=document.querySelector(\'.tab[data-tab="schedule"]\');if(b)b.click();})()');
  await sleep(2600);
  const listH = await ev('(function(){var e=document.getElementById("aiSchedulesList");return e?Math.round(e.getBoundingClientRect().height):0})()');
  check('스케줄 탭이 실제로 보인다(높이 > 0)', listH > 0, 'h=' + listH);

  console.log('\n── ① 입력칸이 읽히는가 (제보의 그 칸들) ─────────────');
  // 일정변경 편집기를 연다
  await ev('(function(){var b=[...document.querySelectorAll("#aiSchedulesList button")].find(x=>/일정변경/.test(x.textContent)); if(b) b.click();})()');
  await sleep(1800);   // ⚠️ adm-light-surfaces.js 페인터가 돌 시간을 준다
  for (const sel of ['#rs-date-9001', '#rs-time-9001', '#rs-dur-9001', '#ns-kind', '#ns-time', '#ns-dur', '#ns-teacher-sel', '#ns-teacher']) {
    const m = await ev(`JSON.stringify(__contrast(${JSON.stringify(sel)}))`);
    const o = m ? JSON.parse(m) : null;
    check('입력칸 ' + sel + ' 글자가 읽힌다(대비 ≥ ' + AA + ')',
      !!o && o.c >= AA, o ? ('대비 ' + o.c + ' · ' + o.color + ' on ' + o.bg) : '요소 없음');
  }
  /* 같은 폼의 «요일 체크박스 라벨» 도 어두운 인라인 배경을 쓴다 — 다만 그쪽은 글자 노드가 있어
     페인터의 fixText() 가 구제해 준다. 「input 만 문제」라는 전제를 재서 못 박아 둔다. */
  for (const sel of ['#ns-days-wrap label', '#aiSchedulesList span']) {
    const m = await ev(`JSON.stringify(__contrast(${JSON.stringify(sel)}))`);
    const o = m ? JSON.parse(m) : null;
    check('(전제) ' + sel + ' 도 읽힌다', !!o && o.c >= AA,
      o ? ('대비 ' + o.c + ' · ' + o.color + ' on ' + o.bg) : '요소 없음');
  }
  check('일정변경 편집기가 원래 값을 채워 준다',
    (await ev('(document.getElementById("rs-time-9001")||{}).value')) === '16:00');

  console.log('\n── ② 버튼·API 는 그대로 동작하는가 (짝 검사) ────────');
  check('저장이 PATCH 를 실제로 보낸다',
    await ev('(async()=>{ await submitReschedule(9001); await new Promise(r=>setTimeout(r,500));'
           + ' return (window.__calls||[]).some(c=>/^PATCH .*class-schedules\\/9001/.test(c)); })()'));
  check('🗑 취소가 확인창을 띄우고 DELETE 를 보낸다',
    await ev('(async()=>{ var b=[...document.querySelectorAll("#aiSchedulesList button")].find(x=>/취소/.test(x.textContent));'
           + ' if(!b) return false; b.click(); await new Promise(r=>setTimeout(r,700));'
           + ' return (window.__confirmed||0)>0 && (window.__calls||[]).some(c=>/^DELETE .*class-schedules\\//.test(c)); })()'));

  console.log('\n── ③ 주간 캘린더가 예약을 그리는가 ─────────────────');
  await ev('(async()=>{ await loadDStudentSchedule(); await new Promise(r=>setTimeout(r,400)); })()');
  /* ⚠️ innerHTML 에서 시각 문자열을 찾으면 **격자의 «시간 눈금»** 이 걸려 저절로 참이 된다
     (처음에 그렇게 썼다가 「취소된 18:00 이 안 그려진다」가 눈금 때문에 FAIL 났다).
     카드만 콕 집어 DOM 으로 센다 — 눈금에는 title 이 없다. */
  /* ⚠️ 자리는 `style.left` 문자열로 묻지 않는다 — 브라우저가 calc 를 정규화해
     `calc(71.4286% + 19.1429px)` 로 돌려준다(처음에 `* 5 / 7` 을 기대했다가 거짓 FAIL).
     «보이는 자리» 로 묻는다: 카드 중앙 x 가 어느 요일 머리글 칸 안인가. */
  const weekCards = JSON.parse(await ev(`JSON.stringify((function(){
      var head = [...document.querySelectorAll('#d-sched-calendar > div:first-child > div')];
      var cols = head.slice(1).map(function(h){ var r=h.getBoundingClientRect(); return {l:r.left, r:r.right}; });
      return [...document.querySelectorAll('#d-sched-calendar div[data-mgs-sch="1"]')].map(function(e){
        var r = e.getBoundingClientRect(); var cx = r.left + r.width/2;
        var col = -1; for (var i=0;i<cols.length;i++) if (cx>=cols[i].l && cx<=cols[i].r) { col=i; break; }
        return { t: e.getAttribute('title')||'', col: col };
      });
    })())`));
  const wTitles = weekCards.map(x => x.t).join(' | ');
  /* ⓐ1회차 + ⓑ숫자 + ⓒ영문 + ⓓ한글 + ⓖ날짜우선 = 5 (ⓔ취소·ⓕ시간대밖은 빠진다) */
  check('반복(숫자·영문·한글)과 1회차가 모두 그려진다 — 카드 5장', weekCards.length === 5, '카드=' + weekCards.length);
  check('16:00 · 14:20 · 15:00 · 17:00 이 전부 카드로 있다',
    ['16:00', '14:20', '15:00', '17:00'].every(t => wTitles.indexOf(t) >= 0), wTitles);
  console.log('\n   (짝) 안 그려야 할 것은 안 그린다');
  check('취소된 예약(18:00)은 안 그려진다', wTitles.indexOf('18:00') < 0, wTitles);
  check('격자 밖(03:00)은 주간에 안 그려진다', wTitles.indexOf('03:00') < 0, wTitles);
  const twenty = weekCards.filter(x => x.t.indexOf('20:00') >= 0);
  /* ⓖ 는 day_of_week='1'(월) 인데 scheduled_date 는 금요일이다 — 금요일(열 5) 한 장뿐이어야
     한다. 예전 코드는 요일을 먼저 봐서 월요일(열 1)에 «매주» 그렸다. */
  check('두 칸이 다 차면 «날짜» 가 이긴다 — 금요일 칸 한 장뿐',
    twenty.length === 1 && twenty[0].col === 5, JSON.stringify(twenty));

  console.log('\n── ④ 월간 캘린더에도 그려지는가 ────────────────────');
  await ev('(function(){var b=[...document.querySelectorAll("button")].find(x=>/월간|Month/.test(x.textContent)); if(b) b.click();})()');
  await sleep(900);
  const monthCards = JSON.parse(await ev(
    'JSON.stringify([...document.querySelectorAll(\'#d-sched-calendar div[title^="🤖 예약 수업"]\')]'
    + '.map(e=>e.getAttribute("title")||""))'));
  check('월간 뷰에도 예약 수업이 그려진다', monthCards.length > 0, '카드=' + monthCards.length);
  check('월간에서도 취소된 예약은 안 그려진다', monthCards.join(' | ').indexOf('18:00') < 0, monthCards.join(' | '));

  console.log('\n── ⑤ 등록에 성공하면 캘린더도 다시 읽는가 ───────────');
  const before = await ev('(window.__calls||[]).filter(c=>/^GET .*class-schedules/.test(c)).length');
  await ev(`(async()=>{
      var k=document.getElementById('ns-kind'); k.value='one_off'; k.dispatchEvent(new Event('change',{bubbles:true}));
      document.getElementById('ns-date').value = window.__WEEK.wed;
      document.getElementById('ns-time').value = '11:00';
      document.getElementById('ns-add').click();
      await new Promise(r=>setTimeout(r,1400));
    })()`);
  const after = await ev('(window.__calls||[]).filter(c=>/^GET .*class-schedules/.test(c)).length');
  const posted = await ev('(window.__calls||[]).some(c=>/^POST .*class-schedules/.test(c))');
  check('등록이 POST 를 보낸다', posted === true);
  /* 목록(loadAiSchedules) 1회 + 캘린더(loadDStudentSchedule) 1회 = 최소 2회 늘어야 한다.
     ⚠️ 「1회만 늘었다」가 정확히 이 사고의 모양이다(목록만 새로고침). */
  check('등록 뒤 GET 이 2회 이상 늘어난다(목록 + 캘린더)', (after - before) >= 2, (after - before) + '회');

  console.log('\n── ⑥ 담당 강사 드롭다운 (2026-09-22 사장님 「스크롤해서 선택」) ──');
  /* ⚠️ 「있다」·「보인다」·「눌린다」 는 다 다르다 — 세 가지를 따로 재다. */
  const selShown = await ev(`(function(){var e=document.getElementById('ns-teacher-sel');
    if(!e) return 'none'; var r=e.getBoundingClientRect();
    return getComputedStyle(e).display + '|' + Math.round(r.width) + 'x' + Math.round(r.height); })()`);
  /* ⚠️ `!/\|0x/` 는 «폭 0» 만 본다 — 높이 0 을 놓친다. 두 값을 «둘 다» 재다. */
  const _sd = String(selShown).split('|');
  const _sw = Number((_sd[1] || '0x0').split('x')[0]), _sh = Number((_sd[1] || '0x0').split('x')[1]);
  check('드롭다운이 실제로 보인다', _sd[0] !== 'none' && _sw > 0 && _sh > 0, selShown);
  check('[짝] 옆 텍스트 칸은 감춰져 있다',
    (await ev(`getComputedStyle(document.getElementById('ns-teacher')).display`)) === 'none');

  const opts = await ev(`(function(){var e=document.getElementById('ns-teacher-sel');
    return JSON.stringify([...e.querySelectorAll('optgroup')].map(function(g){
      return { g:g.label, o:[...g.querySelectorAll('option')].map(function(o){ return o.value+':'+o.textContent; }) }; })); })()`);
  const groups = JSON.parse(opts || '[]');
  const live = (groups.find(g => /재직/.test(g.g)) || { o: [] }).o;
  const gone = (groups.find(g => /퇴사/.test(g.g)) || { o: [] }).o;
  check('재직 묶음에 FAR(22)·강선생님(29) 이 있다',
    live.some(x => /^22:/.test(x)) && live.some(x => /^29:/.test(x)), JSON.stringify(live));
  check('active 가 NULL 인 MAIMAI(27) 도 재직이다', live.some(x => /^27:/.test(x)), JSON.stringify(live));
  /* 🚪 기본은 «퇴사 안 보임» — 2026-08-26 사고가 그 목록에서 죽은 행을 고른 것이다. */
  check('기본에서는 퇴사 HT FARRAH(3) 가 안 보인다',
    !gone.some(x => /^3:/.test(x)) && !live.some(x => /^3:/.test(x)), JSON.stringify(groups));

  /* ⚠️ 말없이 빼면 「그 강사가 없다」로 읽힌다 — 감춘 «명 수» 를 화면이 말해야 한다. */
  const lw = await ev(`(function(){var w=document.getElementById('ns-show-left-wrap');
    if(!w) return 'none|'; var r=w.getBoundingClientRect();
    return getComputedStyle(w).display + '|' + Math.round(r.width) + 'x' + Math.round(r.height)
      + '|' + (document.getElementById('ns-show-left-lb')||{}).textContent; })()`);
  check('「퇴사 강사도 보기」 체크박스가 보인다', lw.split('|')[0] !== 'none'
    && Number((lw.split('|')[1]||'0x0').split('x')[0]) > 0
    && Number((lw.split('|')[1]||'0x0').split('x')[1]) > 0, lw);
  check('감춘 «명 수» 를 말해 준다 (1명)', /\(1명\)/.test(lw), lw);

  /* 🔴 짝 — «감춘다» 만 보면 «전부 감추기» 도 통과한다. 체크하면 «반드시» 나와야 한다. */
  await ev(`(function(){var c=document.getElementById('ns-show-left');
    c.checked=true; c.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  const opts2 = await ev(`(function(){var e=document.getElementById('ns-teacher-sel');
    return JSON.stringify([...e.querySelectorAll('optgroup')].map(function(g){
      return { g:g.label, o:[...g.querySelectorAll('option')].map(function(o){ return o.value+':'+o.textContent; }) }; })); })()`);
  const groups2 = JSON.parse(opts2 || '[]');
  const live2 = (groups2.find(g => /재직/.test(g.g)) || { o: [] }).o;
  const gone2 = (groups2.find(g => /퇴사/.test(g.g)) || { o: [] }).o;
  check('[짝] 체크하면 HT FARRAH(3) 가 «(퇴사)» 로 나온다',
    gone2.some(x => /^3:.*\(퇴사\)/.test(x)), JSON.stringify(gone2));
  check('[짝] 그때도 퇴사가 재직 묶음에 섞이지 않는다', !live2.some(x => /^3:/.test(x)));
  check('[짝] 체크해도 재직은 그대로 있다', live2.some(x => /^22:/.test(x)), JSON.stringify(live2));

  // 다시 끈다 — 아래 «고르기» 는 기본 상태에서 재야 한다
  await ev(`(function(){var c=document.getElementById('ns-show-left');
    c.checked=false; c.dispatchEvent(new Event('change',{bubbles:true})); })()`);

  /* 🔴 핵심 — 「FAR」을 골라 등록하면 POST 본문에 teacher_id=22 가 실려야 한다.
     이름으로 보내면 서버가 `name = ? OR name LIKE ? LIMIT 1` 로 3(퇴사)을 붙인다. */
  await ev(`(function(){
      window.__bodies = [];
      var k=document.getElementById('ns-kind'); k.value='one_off'; k.dispatchEvent(new Event('change',{bubbles:true}));
      document.getElementById('ns-date').value = window.__WEEK.wed;
      document.getElementById('ns-time').value = '13:00';
      var t=document.getElementById('ns-teacher-sel'); t.value='22'; t.dispatchEvent(new Event('change',{bubbles:true}));
      document.getElementById('ns-add').click();
    })()`);
  await sleep(1200);
  const body = await ev(`JSON.stringify((window.__bodies||[]).filter(function(x){
      return x.m==='POST' && x.u.indexOf('/api/admin/class-schedules')>=0; }).pop() || null)`);
  const sent = body ? (JSON.parse(body) || {}).b : null;
  check('[핵심] 고른 강사가 teacher_id 로 나간다 (22)',
    !!sent && String(sent.teacher_id) === '22', JSON.stringify(sent));
  check('그 이름도 함께 실린다 (FAR)', !!sent && sent.teacher_name === 'FAR', JSON.stringify(sent));

  c.close();
  console.log('\n결과: PASS ' + PASS + ' / FAIL ' + FAIL);
  bye();
  process.exit(FAIL ? 1 : 0);
}
main().catch(e => { console.error('하니스 오류:', e.message); process.exit(1); });
