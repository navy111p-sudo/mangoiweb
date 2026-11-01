// -*- coding: utf-8 -*-
// 수업 종류 이름·색 통일 — 진짜 브라우저(크로미움)로 재는 검사 (2026-10-07 사장님)
//   「정규수업 · 보강수업 · 체험수업 · 레벨테스트」 — 이름과 색이 화면마다 같은가.
//
// ① 학생 상세 「수업 예약 등록」을 진짜로 눌러 본다(무작위 종류·날짜, ROUNDS 회).
//    서버로 나가는 payload 의 class_type/schedule_kind 와, 그 수업이 캘린더에 «그 종류 색» 으로 그려지는지 잰다.
//    ⚠️ 제보의 그 모양 그대로: 하루짜리(예전 「특정 날짜」)가 «정규수업»(주황)으로 그려지면 FAIL.
// ② 주간 전체 스케줄을 밝은(ivory)·어두운(dark) 두 테마로 그려 네 종류 칸의 «계산된» 배경색을 잰다.
//
// ⚠️ manual/ 규약상 게이트가 물어 가지 않는다 — 스케줄·캘린더 색/이름을 건드리면 사람이 직접:
//      node test-harness/manual/class-type-canon-browser.mjs        (ROUNDS=200 기본)
// ⚠️ 문자열 검사는 test-harness/class_type_canon_harness.mjs(자동) — 이 파일은 «그려진 결과» 를 본다.
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright, findChromium } from './_pw.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = Number(process.env.CTC_PORT || 8937);
const ROUNDS = Number(process.env.ROUNDS || 200);
let PASS = 0, FAIL = 0;
const check = (n, ok, why) => { if (ok) PASS++; else { FAIL++; console.log('  FAIL ' + n + (why !== undefined ? ' — ' + JSON.stringify(why) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const pw = loadPlaywright();
const exe = findChromium();
if (!pw || !exe) { console.log('⏭ 건너뜀 — playwright-core 또는 크로미움 없음 (PW_DIR=… 로 지정)'); process.exit(0); }

const KIND = { regular: '정규수업', makeup: '보강수업', trial: '체험수업', level_test: '레벨테스트' };
// 학생 상세 캘린더 카드 테두리(--mc) — 정본 MGS_AI_COLORS.border
const LINE = { regular: 'rgb(180, 83, 9)', makeup: 'rgb(109, 40, 217)', trial: 'rgb(4, 120, 87)', level_test: 'rgb(29, 78, 216)' };

const STUB = `(function(){
  try { localStorage.setItem('mangoi_admin_welcome_v1_done','1'); localStorage.setItem('mangoi_lang','ko'); } catch(e){}
  window.__items = []; window.__posts = []; var nid = 7000;
  var ok = function(b){ return Promise.resolve(new Response(JSON.stringify(b), { status:200, headers:{'content-type':'application/json'} })); };
  var real = window.fetch.bind(window);
  window.fetch = function(u, o){
    var s = String((u && u.url) || u || ''); var m = (o && o.method) || 'GET';
    if (s.indexOf('/api/admin/class-schedules') >= 0) {
      if (m === 'GET') return ok({ ok:true, count:window.__items.length, items:window.__items });
      if (m === 'POST') {
        var b = JSON.parse(o.body); window.__posts.push(b);
        /* 서버 허용식과 같은 판정 — 모르는 값은 regular (api-admin.ts) */
        var ct = ['regular','trial','level_test','makeup'].indexOf(String(b.class_type||'')) >= 0 ? b.class_type : 'regular';
        var id = ++nid;
        if (b.schedule_kind === 'one_off') window.__items.push({ id:id, user_id:'delaware', student_name:'김연숙', schedule_kind:'one_off', class_type:ct,
            day_of_week:null, scheduled_date:b.scheduled_date, start_time:b.start_time, duration_min:20, status:'active', source:'admin_ui', teacher_id:22, teacher_name:'BELLE', created_at:Date.now() });
        else (b.days||[]).forEach(function(d){ window.__items.push({ id:++nid, user_id:'delaware', student_name:'김연숙', schedule_kind:'recurring', class_type:ct,
            day_of_week:String(d), scheduled_date:null, starts_on:b.starts_on, start_time:b.start_time, duration_min:20, status:'active', source:'admin_ui', teacher_id:22, teacher_name:'BELLE', created_at:Date.now() }); });
        return ok({ ok:true, created:[{ id:id }], failed:[] });
      }
    }
    if (s.indexOf('/api/admin/teachers') >= 0) return ok({ ok:true, items:[{ id:22, name:'BELLE', active:1 }] });
    if (s.indexOf('/api/admin/me') >= 0) return ok({ ok:true, username:'admin', role:'hq_exec' });
    if (s.indexOf('/api/') >= 0) return ok({ ok:true, items:[], data:{} });
    return real(u, o);
  };
  window.confirm = function(){ return true; }; window.alert = function(){};
})();`;

async function main() {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: PUBLIC, stdio: 'ignore' });
  process.on('exit', () => { try { srv.kill(); } catch (e) {} });
  await sleep(1200);
  const browser = await pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  try {
    /* ───────── ① 학생 상세 ───────── */
    console.log('── ① 학생 상세 「수업 예약 등록」 ' + ROUNDS + '회 ─────────');
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, serviceWorkers: 'block' });
    await ctx.addInitScript(STUB);
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(String(e.message || e)));
    await p.goto('http://127.0.0.1:' + PORT + '/admin/student.html?uid=delaware&_nc=' + Date.now(), { waitUntil: 'load' });
    await sleep(2500);
    await p.evaluate(() => { const b = document.querySelector('.tab[data-tab="schedule"]'); if (b) b.click(); });
    await sleep(1500);
    const opts = await p.$$eval('#ns-kind option', os => os.map(o => [o.value, o.textContent.trim()]));
    check('종류 선택지 = 정규·보강·체험·레벨테스트', JSON.stringify(opts.map(o => o[0])) === '["regular","makeup","trial","level_test"]', opts);
    for (const [v, t] of opts) check('선택지 글자에 «' + KIND[v] + '»', t.includes(KIND[v]), t);
    const legend = await p.evaluate(() => [...document.querySelectorAll('#d-sched-calendar ~ div span[data-ko]')].map(s => s.textContent.trim()));
    check('캘린더 범례 = 정규수업·체험수업·레벨테스트·보강수업', ['정규수업', '체험수업', '레벨테스트', '보강수업'].every(n => legend.includes(n)), legend);
    check('캘린더 범례에 «보충» 없음', !legend.some(t => /보충/.test(t)), legend);

    // 이번 주 날짜 (주간 뷰는 «이번 주» 만 그린다)
    const week = await p.evaluate(() => { const n = new Date(), ws = new Date(n); ws.setDate(n.getDate() - n.getDay());
      return [0,1,2,3,4,5,6].map(i => { const d = new Date(ws); d.setDate(ws.getDate() + i); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }); });
    let seed = 20261007; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const kinds = Object.keys(KIND);
    let sentOk = 0, uiOk = 0, msgOk = 0, cardOk = 0, colorOk = 0, oneVisible = 0;
    const seen = new Set();
    for (let i = 0; i < ROUNDS; i++) {
      const k = kinds[Math.floor(rnd() * 4)]; seen.add(k);
      const date = week[Math.floor(rnd() * 7)];
      const hh = 10 + Math.floor(rnd() * 11), mm = ['00', '10', '20', '30', '40', '50'][Math.floor(rnd() * 6)];
      await p.selectOption('#ns-kind', k);
      const vis = await p.evaluate(() => ({ days: getComputedStyle(document.getElementById('ns-days-wrap')).display, date: getComputedStyle(document.getElementById('ns-date-wrap')).display }));
      const one = k !== 'regular';
      if (one ? (vis.days === 'none' && vis.date !== 'none') : (vis.days !== 'none' && vis.date === 'none')) uiOk++;
      if (one) { await p.fill('#ns-date', date); oneVisible++; }
      else { await p.fill('#ns-start', week[0]); }  /* 정규는 «시작일» 부터 그려진다 — 오늘이 기본이라 지난 요일은 원래 안 그려짐(정상) */
      if (!one) await p.evaluate((dw) => { document.querySelectorAll('.ns-day').forEach(c => { c.checked = c.value === String(dw); }); }, new Date(date + 'T00:00:00').getDay());
      await p.fill('#ns-time', String(hh).padStart(2, '0') + ':' + mm);
      const before = await p.evaluate(() => window.__posts.length);
      await p.click('#ns-add');
      await p.waitForFunction((n) => window.__posts.length > n && /등록됐습니다/.test(document.getElementById('ns-msg').textContent), before, { timeout: 5000 }).catch(() => {});
      const last = await p.evaluate(() => window.__posts[window.__posts.length - 1]);
      if (last && last.class_type === k && last.schedule_kind === (one ? 'one_off' : 'recurring') && (one ? last.scheduled_date === date : last.scheduled_date === undefined)) sentOk++;
      if (await p.evaluate(() => /✅ 예약 1건이 등록됐습니다/.test(document.getElementById('ns-msg').textContent))) msgOk++;
      // 방금 만든 수업 카드가 캘린더에 «그 종류» 로 그려졌는가 (date·시각으로 찾는다)
      const t = String(hh).padStart(2, '0') + ':' + mm;
      await p.waitForTimeout(60);
      const card = await p.evaluate(({ k, t }) => {
        const cs = [...document.querySelectorAll('#d-sched-calendar .mgs-ev.mgs-' + k)].filter(c => (c.getAttribute('title') || c.textContent || '').includes(t));
        if (!cs.length) return null;
        return { mc: getComputedStyle(cs[0]).getPropertyValue('--mc').trim(), bl: getComputedStyle(cs[0]).borderLeftColor, bg: getComputedStyle(cs[0]).backgroundColor, txt: cs[0].textContent };
      }, { k, t });
      if (card) cardOk++;
      if (card && (card.bl === LINE[k] || card.mc.toLowerCase() === ({ regular: '#b45309', makeup: '#6d28d9', trial: '#047857', level_test: '#1d4ed8' })[k])) colorOk++;
      if (i < 4 || !card) { if (!card) console.log('    (카드 못 찾음) round', i, k, date, t); }
    }
    check(ROUNDS + '회 모두 칸 보이기가 종류와 맞다', uiOk === ROUNDS, uiOk);
    check(ROUNDS + '회 모두 payload 종류·방식·날짜가 맞다', sentOk === ROUNDS, sentOk);
    check(ROUNDS + '회 모두 「✅ 예약 1건이 등록됐습니다」', msgOk === ROUNDS, msgOk);
    check(ROUNDS + '회 모두 캘린더에 그 종류 카드가 그려졌다', cardOk === ROUNDS, cardOk);
    check(ROUNDS + '회 모두 카드 색이 그 종류 색이다', colorOk === ROUNDS, colorOk);
    check('네 종류가 다 시험됐다', seen.size === 4, [...seen]);
    // 제보의 그 모양: 보강(하루)이 «정규수업» 카드로 그려지면 안 된다
    const wrong = await p.evaluate(() => window.__items.filter(x => x.schedule_kind === 'one_off' && x.class_type === 'regular').length);
    check('[제보] 하루짜리가 정규수업으로 저장된 것 0건', wrong === 0, wrong);
    // 다가오는 수업 칩 — 보강 칩 글자/색
    const chips = await p.evaluate(() => [...document.querySelectorAll('#aiSchedulesList .ty')].map(e => ({ t: e.textContent.trim(), bg: getComputedStyle(e).backgroundColor })));
    const mk = chips.find(c => c.t === '보강'), lt = chips.find(c => c.t === '레벨'), tr = chips.find(c => c.t === '체험');
    check('다가오는 수업 칩: 보강=보라 바탕', !mk || mk.bg === 'rgb(237, 233, 254)', mk);
    check('다가오는 수업 칩: 레벨=파랑 바탕(캘린더와 같음)', !lt || lt.bg === 'rgb(219, 234, 254)', lt);
    check('다가오는 수업 칩: 체험=초록 바탕', !tr || tr.bg === 'rgb(220, 252, 231)', tr);
    check('화면 글자에 «보충» 없음', !(await p.evaluate(() => /보충/.test(document.body.innerText))));
    check('페이지 오류 0건', errs.length === 0, errs.slice(0, 3));
    await ctx.close();

    /* ───────── ② 주간 전체 스케줄 ───────── */
    for (const theme of ['ivory', 'dark']) {
      console.log('── ② 주간 전체 스케줄 · ' + theme + ' ─────────');
      const c2 = await browser.newContext({ viewport: { width: 1600, height: 1000 }, serviceWorkers: 'block' });
      await c2.addInitScript(`try{localStorage.setItem('mangoi_admin_theme','${theme}');localStorage.setItem('admin_theme','${theme}');localStorage.setItem('mangoi_lang','ko');}catch(e){}`);
      await c2.route('**/api/**', r => r.fulfill({ json: { ok: true, items: [] } }));
      await c2.route('**/api/admin/teachers*', r => r.fulfill({ json: { ok: true, items: [{ id: 22, name: 'BELLE', category: 'office' }] } }));
      await c2.route('**/api/admin/schedules*', r => {
        const w = new URL(r.request().url()).searchParams.get('week');
        const d0 = new Date(w + 'T00:00:00Z'); const iso = (i) => { const d = new Date(d0); d.setUTCDate(d0.getUTCDate() + i); return d.toISOString().slice(0, 10); };
        const mk = (id, type, i, t) => ({ id, teacher_id: 22, date: iso(i), start_time: t, hour: Number(t.slice(0, 2)), type, origin: 'class', students: [{ name: '학생' + id, uid: 's' + id }], duration_min: 20 });
        /* 일간 보기는 하루만 그리므로 «매일» 다섯 종류를 다 넣는다 */
        const items = []; let id = 0;
        for (let i = 0; i < 7; i++) [['1on1', '10:00'], ['temp', '11:00'], ['trial', '12:00'], ['leveltest', '13:00'], ['group', '14:00']].forEach(([ty, t]) => items.push(mk(++id, ty, i, t)));
        r.fulfill({ json: { ok: true, items } });
      });
      const q = await c2.newPage(); const e2 = []; q.on('pageerror', e => e2.push(String(e.message || e)));
      await q.goto('http://127.0.0.1:' + PORT + '/admin/weekly-schedule.html?_nc=' + Date.now(), { waitUntil: 'load' });
      await sleep(2500);
      await q.evaluate((th) => document.documentElement.setAttribute('data-admin-theme', th), theme);
      await sleep(200);
      const measure = (pre) => q.evaluate((pre) => {
        const out = {};
        for (const k of ['1on1', 'temp', 'trial', 'leveltest', 'group']) {
          const el = document.querySelector(pre + k);
          out[k] = el ? getComputedStyle(el).backgroundColor : null;
        }
        return out;
      }, pre);
      /* 두 보기를 «둘 다» 잰다 — 주간(타임라인 막대 .tl-seg)과 일간(격자 칸 .slot-). 한쪽만 재면
         다른 쪽 CSS 를 되돌려도 통과한다(변이시험으로 실제로 밟음). */
      for (const [view, pre] of [['주간', '.tl-seg.s-'], ['일간', 'td.slot-']]) {
      if (view === '일간') { await q.click('.view-toggle button[data-view="day"]'); await sleep(600); }
      const got = await measure(pre);
      console.log('    ' + theme + ' ' + view, JSON.stringify(got));
      const EXP = theme === 'ivory'
        ? { '1on1': 'rgb(254, 243, 199)', temp: 'rgb(237, 233, 254)', trial: 'rgb(220, 252, 231)', leveltest: 'rgb(219, 234, 254)' }
        : { '1on1': 'rgb(253, 230, 138)', temp: 'rgb(196, 181, 253)', trial: 'rgb(134, 239, 172)', leveltest: 'rgb(147, 197, 253)' };
      for (const k in EXP) check(theme + ' ' + view + ' · ' + k + ' 칸 색', got[k] === EXP[k], got[k]);
      check(theme + ' ' + view + ' · 네 종류 칸 색이 서로 다르다', new Set(Object.keys(EXP).map(k => got[k])).size === 4, got);
      check(theme + ' ' + view + ' · 그룹 칸은 그대로 분홍', got.group === (theme === 'ivory' ? 'rgb(251, 220, 234)' : 'rgb(244, 171, 206)'), got.group);
      }
      const txt = await q.evaluate(() => document.body.innerText);
      check(theme + ' · 화면에 «보충» 없음', !/보충/.test(txt));
      check(theme + ' · 범례에 정규·보강수업·체험수업·레벨테스트', ['정규 1:1', '보강수업', '체험수업', '레벨테스트'].every(n => txt.includes(n)));
      // 툴팁 이름 — 보강 칸에 마우스
      const tip = await q.evaluate(() => { const el = document.querySelector('.slot-temp'); if (!el) return null;
        el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        const t = document.querySelector('.tooltip-title'); return t ? t.textContent : null; });
      check(theme + ' · 보강 칸 툴팁 «보강수업»', tip === null || /보강수업/.test(tip), tip);
      check(theme + ' · 페이지 오류 0건', e2.length === 0, e2.slice(0, 3));
      await c2.close();
    }
  } finally { await browser.close(); }
  console.log(`결과: PASS ${PASS} / FAIL ${FAIL}`);
  process.exit(FAIL ? 1 : 0);
}
main().catch(e => { console.log('크래시:', e.message); process.exit(1); });
