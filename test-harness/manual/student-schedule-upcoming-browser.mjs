// -*- coding: utf-8 -*-
// 📅 학생 상세 › 등록된 수업 스케줄 — «다음 수업 · 묶음 · 앞으로 날짜 칩» (2026-10-01 사장님 B안) 브라우저 검사
//
//   왜 브라우저인가 — 이 변경은 «무엇이 어디에 그려지고 무엇을 누를 수 있는가» 가 전부라
//   문자열 하니스로는 원리상 못 본다(함수도 값도 다 «있다»).
//
//   무엇을 보는가 —
//     ① 다음 수업이 맨 위에 «종류와 함께» 나온다
//     ② 매주 반복 4줄이 «주 4회» 한 줄로 묶인다 (짝: 날짜 지정 수업은 묶지 않는다)
//     ③ 날짜 칩 개수 = 앞으로 14일의 실제 회차 수 (짝: 시작일 «전»·취소된 것은 안 나온다)
//     ④ 보충·체험 칩에만 종류 글자가 붙는다 (짝: 정규 칩에는 안 붙는다)
//     ⑤ 매주 반복 칩을 누르면 «이 날 하나만은 못 한다» 고 사실대로 말하고 연기 버튼을 안 준다
//        (짝: 날짜 지정 칩은 연기·변경 버튼을 주고, 누르면 공용 연기·변경 창이 실제로 열린다)
//     ⑥ 이 카드에 «취소» 버튼이 없다 (2026-10-01 사장님 「취소는 빼고」)
//     ⑦ 휴대폰 폭: 페이지가 옆으로 안 밀리고, 칩 줄만 옆으로 넘긴다, 버튼이 맨 위에서 눌린다
//     ⑧ 글자가 읽힌다(대비 4.5 이상)
//
//   ⚠️ 자동으로 안 돕니다(manual/ 규약). 사람이 부릅니다:
//        mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
//        PW_DIR=/tmp/pw node test-harness/manual/student-schedule-upcoming-browser.mjs
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright, findChromium } from './_pw.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = 8967;
const SHOT = process.env.SHOT_DIR || '';

let pass = 0, fail = 0;
const check = (n, ok, extra) => {
  if (ok) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (extra ? '  → ' + extra : '')); }
};
const pw = loadPlaywright(), exe = findChromium();
if (!pw || !exe) { console.log('⏭  건너뜀 — playwright-core 또는 Chromium 이 없습니다.'); process.exit(0); }

/* 씨앗 — 브라우저 «안» 에서 오늘(KST) 기준으로 만든다(고정 날짜를 적으면 며칠 뒤 저절로 빨간불). */
const BOOT = `
  try { localStorage.setItem('mangoi_admin_welcome_v1_done','1'); localStorage.setItem('mangoi_lang','ko'); } catch(e){}
  (function(){
    var ymd = function(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
    var t0 = new Date(); t0.setHours(0,0,0,0);
    var plus = function(n){ var d = new Date(t0); d.setDate(t0.getDate()+n); return ymd(d); };
    window.__D = { mk: plus(2), pp: plus(3), dt: plus(5), future: plus(20) };
    var base = { user_id:'jeong', student_name:'정우영', class_type:'regular', duration_min:20, teacher_id:29,
                 teacher_name:'중국어 강선생님', status:'active', source:'admin_ui', created_at:Date.parse('2026-07-23T00:00:00+09:00') };
    var rec = function(id, dow){ return Object.assign({}, base, { id:id, schedule_kind:'recurring', day_of_week:dow, scheduled_date:null, start_time:'19:20', starts_on:'2026-07-23' }); };
    var items = [ rec(1,'Tue'), rec(2,'Wed'), rec(3,'Thu'), rec(4,'Fri'),
      /* 보충 — 날짜 지정 */
      Object.assign({}, base, { id:5, schedule_kind:'one_off', class_type:'makeup', day_of_week:null, scheduled_date:window.__D.mk, start_time:'16:00' }),
      /* 정규 날짜 지정(수강신청 확정이 만드는 모양) */
      Object.assign({}, base, { id:6, schedule_kind:'dated', day_of_week:null, scheduled_date:window.__D.dt, start_time:'20:00', source:'adm-enroll:1' }),
      /* 시작일이 아직 안 온 반복 — 14일 안에 안 나와야 한다(짝) */
      Object.assign({}, rec(7,'Mon'), { starts_on: window.__D.future, start_time:'18:00' }),
      /* 이미 연기된 날짜 지정 — 칩에서도 버튼을 주면 안 된다(요일별 줄의 ⏸ 와 같은 판정 · 짝) */
      Object.assign({}, base, { id:8, schedule_kind:'one_off', status:'postponed', day_of_week:null, scheduled_date:window.__D.pp, start_time:'15:00' })
    ];
    window.__items = items;
    var ok = function(b){ return Promise.resolve(new Response(JSON.stringify(b), { status:200, headers:{'content-type':'application/json'} })); };
    var real = window.fetch.bind(window);
    window.fetch = function(u, o){
      var s = String((u && u.url) || u || '');
      if (s.indexOf('/api/admin/class-schedules') >= 0) return ok({ ok:true, count:items.length, items:items });
      if (s.indexOf('/api/admin/me') >= 0) return ok({ ok:true, username:'admin', role:'hq_exec' });
      if (s.indexOf('/api/') >= 0) return ok({ ok:true, items:[], data:{}, events:[], rows:[] });
      return real(u, o);
    };
  })();
`;

const CONTRAST = `(sel) => {
  const px = v => { const m = String(v||'').match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(',').map(Number); return { r:p[0], g:p[1], b:p[2], a:p.length>3?p[3]:1 }; };
  const over = (f,b) => ({ r:f.r*f.a+b.r*(1-f.a), g:f.g*f.a+b.g*(1-f.a), b:f.b*f.a+b.b*(1-f.a), a:1 });
  const el = document.querySelector(sel); if (!el) return null;
  let layers = [], n = el;
  while (n) { const c = px(getComputedStyle(n).backgroundColor); if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; } n = n.parentElement; }
  let bg = { r:255, g:255, b:255, a:1 }; for (let i = layers.length-1; i >= 0; i--) bg = over(layers[i], bg);
  let fg = px(getComputedStyle(el).color); if (fg.a < 1) fg = over(fg, bg);
  const L = c => { const f = v => { v/=255; return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4); }; return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b); };
  const a = L(fg), b = L(bg); return Math.round(((Math.max(a,b)+0.05)/(Math.min(a,b)+0.05))*100)/100;
}`;

const srv = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: PUBLIC, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 900));
const browser = await pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
try {
  for (const vp of [{ name: 'PC', w: 1366, h: 900 }, { name: '휴대폰', w: 390, h: 844 }]) {
    console.log(`\n── ${vp.name} ${vp.w}×${vp.h} ─────────────────────────`);
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, timezoneId: 'Asia/Seoul', locale: 'ko-KR' });
    const page = await ctx.newPage();
    page.on('dialog', d => d.dismiss().catch(() => {}));
    await page.addInitScript(BOOT);
    await page.goto(`http://127.0.0.1:${PORT}/admin/student.html?uid=jeong&_nc=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await page.evaluate(() => { const b = document.querySelector('.tab[data-tab="schedule"]'); if (b) b.click(); });
    await page.evaluate(() => { try { loadAiSchedules(); } catch (e) {} });
    await page.waitForSelector('#mgsuTop .mgsu-chip', { timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(400);

    const info = await page.evaluate(() => {
      const top = document.getElementById('mgsuTop');
      const exp = mgsuUpcoming(window.__items, new Date(), MGSU_DAYS);
      return {
        hero: (top && top.querySelector('.mgsu-hero') || {}).textContent || '',
        groups: [...document.querySelectorAll('#mgsuTop .mgsu-grp .t')].map(e => e.textContent),
        chips: [...document.querySelectorAll('#mgsuTop .mgsu-chip')].map(e => ({ t: e.textContent, tag: !!e.querySelector('.ty'), key: e.getAttribute('data-mgsu-occ'), past: e.classList.contains('past'), tagBg: e.querySelector('.ty') ? getComputedStyle(e.querySelector('.ty')).backgroundColor : '' })),
        heroTyBg: (() => { const e = document.querySelector('#mgsuTop .mgsu-hero .mgsu-ty'); return e ? getComputedStyle(e).backgroundColor : ''; })(),
        expect: exp.length, future: exp.some(o => o.sch.id === 7),
        foldOpen: !!(document.getElementById('mgsuFold') || {}).open,
        rows: document.querySelectorAll('#mgsuFold .mgsu-rows > div').length,
        cancelBtns: [...document.querySelectorAll('#aiSchedulesList button')].filter(b => /취소|Cancel/.test(b.textContent)).length,
        docW: document.documentElement.scrollWidth, winW: innerWidth,
        wide: (() => { const W = innerWidth, o = []; document.querySelectorAll('body *').forEach(e => { const r = e.getBoundingClientRect(); if (r.right > W + 2 && r.width > 0) o.push((r.right|0) + ' ' + e.tagName + '#' + e.id + '.' + String(e.className).slice(0, 24)); }); return o.slice(0, 8); })(),
      };
    });
    check('① 다음 수업 상자가 맨 위에 있다', /다음 수업/.test(info.hero), info.hero);
    check('① 다음 수업에 수업 종류가 함께 나온다', /정규수업|보충수업|체험수업/.test(info.hero), info.hero);
    check('② 매주 반복 4줄이 «주 4회» 한 줄로 묶인다', info.groups.some(t => /주 4회/.test(t) && /화·수·목·금/.test(t)), JSON.stringify(info.groups));
    check('② [짝] 시작일이 아직 안 온 반복은 따로 묶인다(합쳐지지 않는다)', info.groups.length === 2, JSON.stringify(info.groups));
    check('③ 날짜 칩 개수 = 정본(mgsuUpcoming)이 센 앞으로 14일 회차', info.chips.length === info.expect && info.expect >= 9, info.chips.length + ' vs ' + info.expect);
    check('③ [짝] 시작일이 아직 안 온 수업은 칩에 안 나온다', !info.future);
    const mk = info.chips.find(c => /보충/.test(c.t));
    check('④ 보충 수업 칩에 «보충» 글자가 붙는다', !!mk && mk.tag);
    check('④ [짝] 정규 칩에는 종류 글자가 안 붙는다', info.chips.filter(c => !c.tag).length === info.chips.length - 1);
    check('⑥ 이 카드에 «취소» 버튼이 없다', info.cancelBtns === 0, String(info.cancelBtns));
    check('요일별 줄은 접혀 있고 펼치면 8줄(전부)이 있다', !info.foldOpen && info.rows === 8, info.foldOpen + '/' + info.rows);
    check('⑦ 페이지가 옆으로 안 밀린다', info.docW <= info.winW, info.docW + ' > ' + info.winW + ' ' + JSON.stringify(info.wide));

    // ⑤ 반복 칩 — 사실대로 말하고 연기 버튼을 안 준다
    check('④ 보충 색과 정규 색이 화면에서 실제로 다르다(페인터가 덮지 않았다)', !!mk && mk.tagBg && info.heroTyBg && mk.tagBg !== info.heroTyBg, (mk && mk.tagBg) + ' vs ' + info.heroTyBg);
    const pastChip = info.chips.find(c => c.past);
    if (pastChip) {
      await page.evaluate(k => document.querySelector(`[data-mgsu-occ="${k}"]`).click(), pastChip.key);
      const pa = await page.evaluate(() => ({ t: document.getElementById('mgsuAct').textContent, b: document.querySelectorAll('#mgsuAct button').length }));
      check('지난 회차 칩: «이미 끝난 수업» 이라 말하고 버튼을 안 준다', /이미 끝난 수업/.test(pa.t) && pa.b === 0, pa.t);
    } else console.log('     (지금 시각엔 지난 회차 칩이 없어 그 검사는 건너뜀)');
    const recKey = info.chips.find(c => /\|[1-4]$/.test(c.key || '') && !c.past).key;
    await page.evaluate(k => document.querySelector(`[data-mgsu-occ="${k}"]`).click(), recKey);
    const recAct = await page.evaluate(() => ({ t: document.getElementById('mgsuAct').textContent, mv: document.querySelectorAll('#mgsuAct [data-mgsu-move]').length, se: document.querySelectorAll('#mgsuAct [data-mgsu-series]').length }));
    check('⑤ 반복 칩: «이 날 하나만은 못 한다» 고 말한다', /매주 반복 수업이라/.test(recAct.t), recAct.t.slice(0, 80));
    check('⑤ 반복 칩: 연기 버튼을 안 주고 «매주 변경» 만 준다', recAct.mv === 0 && recAct.se === 1);
    await page.evaluate(() => document.querySelector('#mgsuAct [data-mgsu-series]').click());
    await page.waitForTimeout(300);
    check('⑤ «매주 변경» 을 누르면 요일별 줄이 펼쳐지고 그 줄의 변경 편집기가 열린다',
      await page.evaluate(k => document.getElementById('mgsuFold').open && document.getElementById('resch-' + k.split('|')[1]).style.display === 'block', recKey));

    // ⑤ 날짜 지정 칩 — 연기·변경 버튼, 누르면 공용 창이 열린다
    await page.evaluate(() => { document.getElementById('mgsuFold').open = false; });
    const mkKey = mk.key;
    await page.evaluate(k => document.querySelector(`[data-mgsu-occ="${k}"]`).click(), mkKey);
    const dAct = await page.evaluate(() => document.querySelectorAll('#mgsuAct [data-mgsu-move]').length);
    check('⑤ [짝] 날짜 지정 칩: 연기·변경 창을 여는 버튼을 준다(창이 모드를 고르므로 하나)', dAct === 1, String(dAct));
    const dTxt = await page.evaluate(() => document.getElementById('mgsuAct').textContent);
    /* 공용 창의 «변경(앞으로 계속)» 은 뒤 회차도 옮긴다 — «다른 날은 그대로» 라고 약속하면 거짓이다. */
    check('⑤ 안내가 창의 실제 동작을 말한다(«앞으로 계속» = 같은 요일·시각 전부)', /앞으로 계속/.test(dTxt) && /전부/.test(dTxt) && !/다른 날 수업은 그대로/.test(dTxt), dTxt.slice(0, 120));
    const ppKey = await page.evaluate(() => { const c = [...document.querySelectorAll('[data-mgsu-occ]')].find(x => x.getAttribute('data-mgsu-occ').endsWith('|8')); return c ? c.getAttribute('data-mgsu-occ') : ''; });
    check('(전제) 이미 연기된 회차도 칩으로 보인다', !!ppKey);
    if (ppKey) {
      await page.evaluate(k => document.querySelector(`[data-mgsu-occ="${k}"]`).click(), ppKey);
      const pp = await page.evaluate(() => ({ t: document.getElementById('mgsuAct').textContent, mv: document.querySelectorAll('#mgsuAct [data-mgsu-move]').length }));
      check('⑤ [짝] 이미 연기된 회차에는 연기·변경 버튼을 안 준다', pp.mv === 0 && /이미 연기된/.test(pp.t), JSON.stringify(pp).slice(0, 120));
      await page.evaluate(k => document.querySelector(`[data-mgsu-occ="${k}"]`).click(), mkKey);
    }
    const btn = page.locator('#mgsuAct [data-mgsu-move]').first();
    await btn.scrollIntoViewIfNeeded();
    const topOk = await btn.evaluate(b => { const r = b.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!e && (e === b || b.contains(e)); });
    check('⑦ 연기 버튼이 맨 위에서 눌린다(가려지지 않는다)', topOk);
    await btn.click();
    await page.waitForSelector('#tc-move-modal', { timeout: 4000 }).catch(() => {});
    const modal = await page.evaluate(() => { const m = document.getElementById('tc-move-modal'); return m ? m.textContent : ''; });
    check('⑤ 누르면 공용 «수업 연기·변경» 창이 실제로 열린다', /수업 연기·변경/.test(modal));
    check('⑥ 그 창에도 «수업 취소» 는 없다(canCancel:false)', !/수업 취소/.test(modal));
    if (SHOT) await page.screenshot({ path: join(SHOT, `upcoming-${vp.w}-modal.png`) });
    await page.evaluate(() => { try { window.mangoiMoveModal.close(); } catch (e) {} });

    if (vp.w < 640) {
      const sc = await page.evaluate(() => { const c = document.querySelector('#mgsuTop .mgsu-chips'); const cs = getComputedStyle(c); return { wrap: cs.flexWrap, ox: cs.overflowX, over: c.scrollWidth > c.clientWidth }; });
      check('⑦ 휴대폰: 칩은 한 줄로 옆으로 넘긴다', sc.wrap === 'nowrap' && sc.ox === 'auto' && sc.over, JSON.stringify(sc));
    }
    const c1 = await page.evaluate('(' + CONTRAST + ')("#mgsuTop .mgsu-hero .v")');
    const c2 = await page.evaluate('(' + CONTRAST + ')("#mgsuTop .mgsu-grp .m")');
    const c3 = await page.evaluate('(' + CONTRAST + ')("#mgsuTop .mgsu-chip:not(.today):not(.hol)")');
    console.log(`     대비: 다음수업 ${c1} · 묶음 설명 ${c2} · 날짜 칩 ${c3}`);
    check('⑧ 글자가 읽힌다(대비 4.5 이상 — 다음수업·묶음·칩)', c1 >= 4.5 && c2 >= 4.5 && c3 >= 4.5);
    /* ⑨ (2026-10-01 사장님) 요일별 줄 — 시작일 대신 «다음 수업일», 시작일은 줄 끝에 작게. */
    const row = await page.evaluate(() => {
      document.getElementById('mgsuFold').open = true;
      const rows = [...document.querySelectorAll('#mgsuFold .mgsu-rows > div')];
      const tue = rows.find(r => /매주 화요일/.test(r.textContent));
      const fut = rows.find(r => /매주 월요일/.test(r.textContent));   // 시작일이 아직 안 온 반복(10/22~)
      const small = tue ? [...tue.querySelectorAll('span')].find(x => /^시작 \d{4}-\d{2}-\d{2}$/.test(x.textContent.trim())) : null;
      return { t: tue ? tue.textContent : '', f: fut ? fut.textContent : '',
               small: small ? parseFloat(getComputedStyle(small).fontSize) : 0,
               want: tue ? mgsuNextLabel(window.__items.find(x => x.id === 1)) : '',
               /* 시작일 전 반복(id 7)이 고르는 «다음 수업» 날짜 — 시작일보다 앞이면 안 된다 */
               futYmd: (function () { var t = _mgsKstToday(); var b = new Date(+t.slice(0,4), +t.slice(5,7) - 1, +t.slice(8,10));
                 var n = mgsuNext(mgsuUpcoming([window.__items.find(x => x.id === 7)], b, 28), Date.now()); return n ? n.ymd : ''; })(),
               futStart: window.__D.future };
    });
    check('⑨ 매주 줄에 «다음 수업 날짜» 가 나온다(정본 mgsuNext 와 같은 날)', !!row.want && row.t.includes('다음 수업 ' + row.want), row.want + ' / ' + row.t.slice(0, 90));
    check('⑨ [짝] 줄의 큰 글자에 «… 시작» 이 더는 없다', !/\d{4}-\d{2}-\d{2} 시작/.test(row.t), row.t.slice(0, 90));
    check('⑨ 시작일은 남아 있되 작은 글자다(≤ 11px)', row.small > 0 && row.small <= 11, String(row.small));
    check('⑨ [짝] 아직 시작 안 한 반복의 다음 수업일은 시작일 «이후» 다', !!row.futYmd && row.futYmd >= row.futStart, row.futYmd + ' vs ' + row.futStart);
    if (SHOT) {
      await page.locator('#mgsuFold').screenshot({ path: join(SHOT, `upcoming-${vp.w}-rows.png`) });
      await page.evaluate(() => { document.getElementById('mgsuFold').open = false; });
      await page.evaluate(() => { _mgsuSel = ''; mgsuRender(); document.getElementById('aiSchedulesSection').scrollIntoView(); });
      await page.locator('#aiSchedulesSection').screenshot({ path: join(SHOT, `upcoming-${vp.w}.png`) });
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  srv.kill();
}
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
