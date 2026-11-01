// -*- coding: utf-8 -*-
/* ═══════════════════════════════════════════════════════════════════════════
   📵 「번호 없는 학생」 칸 — 진짜 admin.html 에 그려서 재는 검사 (2026-10-28 신설)

   [왜] 틀릴 수 있는 것이 «무엇이 그려지고 · 무엇이 나가고 · 다시 그려도 무엇이 남는가» 뿐이라
        문자열·순수 함수 검사(test-harness/phone_gaps_harness.mjs)로는 못 본다.
   [무엇] 진짜 admin.html + js/adm-phone-gaps.js 를 로컬 서버로 띄우고 /api/** 만 가로챈다(page.route — 네트워크 단에서
        잡으니 admin.html 이 나중에 씌우는 fetch 래퍼와 무관하다).
        ① 펼치면 한 번 불러와 줄을 그린다 · 참고 번호는 «글자로만»(칸에 자동으로 안 들어간다)
        ② 칸이 보이고 · 눌리고(elementFromPoint) · 글자가 읽힌다(합성 배경 대비 4.5 이상)
        ③ 저장 → PATCH 본문은 채운 칸만 · 다시 불러 목록에서 빠졌나 확인 · 다른 줄에 쓰다 만 번호는 남는다
        ④ 10자리 미만 → 안 보낸다 · phone_kept:false → 성공이라 안 한다 · 그래도 목록에 남으면 경고
        ⑤ 🌐 영어로 바꿔도 쓰다 만 번호가 남는다 · 기간 14일 → days=14
        ⑥ 강사 신원이면 칸을 숨긴다 · 403 이면 서버 문구(who_line)를 그대로
   ⚠️ manual/ 규약상 게이트가 물어 가지 않는다 — 이 칸을 건드리면 사람이 직접:
        node test-harness/manual/phone-gaps-browser.mjs
   ═══════════════════════════════════════════════════════════════════════════ */
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.log('⏭ playwright 없음 — 건너뜀(«확인 안 함» 이지 «문제없음» 이 아닙니다)'); process.exit(0); }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = Number(process.env.PG_PORT || 8961);
const BASE = `http://127.0.0.1:${PORT}`;

let PASS = 0, FAIL = 0;
const check = (n, ok, why) => {
  if (ok) { PASS++; console.log('  OK   ' + n); }
  else { FAIL++; console.log('  FAIL ' + n + (why ? ' — ' + JSON.stringify(why).slice(0, 300) : '')); }
};

/* 씨앗 — 공개 저장소라 실제 학생 아이디·번호는 안 쓴다 */
const G = (uid, name, date, time, extra = {}) => Object.assign({ uid, name, classes: 2, next_date: date, next_time: time, status: 'none', short_len: 0, hint_phone: '' }, extra);
function freshServer() {
  return {
    gaps: [
      G('test_a', '가학생', '2026-10-29', '16:00', { hint_phone: '010-9999-0001' }),
      G('test_b', '나학생', '2026-10-29', '17:20'),
      G('test_c', '다학생', '2026-10-30', '15:00', { status: 'short', short_len: 9 }),
      G('test_d', '라학생', '2026-10-31', '18:00'),
      G('test_e', '마학생', '2026-11-01', '10:00'),
    ],
    patches: [], gets: [], role: 'hq', gap403: false, keepOnSave: new Set(), notKept: new Set(), notKeptGone: new Set(),
  };
}

async function setup(page, S) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('mangoi_admin_welcome_v1_done', '1');
      localStorage.setItem('mangoi_admin_session', JSON.stringify({ username: 'admin', role: 'hq_exec' }));
      localStorage.setItem('mangoi_lang', 'ko');
    } catch (e) {}
  });
  const J = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/api/**', (route) => J(route, { ok: true }));   // 포괄 먼저(나중에 등록한 것이 이긴다)
  await page.route('**/api/admin/me**', (route) => J(route, { ok: true, user: { username: S.role === 'teacher' ? 'mangoi_018' : 'admin', name: 'T' }, role: S.role, scope: { label: '본사' } }));
  await page.route('**/api/admin/student/phone-gaps**', (route) => {
    const u = new URL(route.request().url());
    S.gets.push(u.searchParams.get('days'));
    if (S.gap403) return J(route, { ok: false, error: 'forbidden_teacher', who_line: '지금 로그인: mangoi_018 (강사)' }, 403);
    const days = Number(u.searchParams.get('days')) || 7;
    return J(route, { ok: true, days, from: '2026-10-28', to: '2026-11-03', students: 20, reachable: 20 - S.gaps.length, gaps: S.gaps,
      complete: true, hint_complete: true, sms_mode: 'real', reminder_enabled: true, measured_at: Date.now() });
  });
  await page.route(/\/api\/admin\/student\/[^/]+\/contact$/, (route) => {
    const req = route.request();
    const uid = decodeURIComponent(new URL(req.url()).pathname.split('/')[4]);
    let body = null; try { body = JSON.parse(req.postData() || 'null'); } catch (e) {}
    S.patches.push({ method: req.method(), uid, body });
    // phone_kept:false — notKept 는 «명부에도 못 찾아 그대로 남음»(roster_updated:false), notKeptGone 은 «명부엔 들어가 목록에서 빠짐»(roster_updated:true)
    if (S.notKept.has(uid)) {
      const gone = S.notKeptGone.has(uid);
      if (gone) S.gaps = S.gaps.filter(g => g.uid !== uid);
      return J(route, { ok: true, phone_kept: false, roster_updated: gone });
    }
    if (!S.keepOnSave.has(uid)) S.gaps = S.gaps.filter(g => g.uid !== uid);
    return J(route, { ok: true, phone_kept: true });
  });
}

async function openSection(page) {
  await page.goto(BASE + '/admin.html?_nc=' + Date.now(), { waitUntil: 'load' });
  await page.waitForFunction(() => window.__pg && window.__pg.__loaded, null, { timeout: 15000 });
  await page.evaluate(() => {
    try { if (typeof window.jumpToMenu === 'function') window.jumpToMenu('card-students-mgmt'); } catch (e) {}
    const ov = document.getElementById('aw-overlay'); if (ov) ov.remove();
    const d = document.getElementById('sm-phone-gaps');
    let p = d; while (p) { if (p.tagName === 'DETAILS') p.open = true; p = p.parentElement; }
    d.scrollIntoView({ block: 'start' });
  });
}
const rows = (page) => page.$$eval('#pg-body div.pg-row[data-uid]', trs => trs.map(t => t.getAttribute('data-uid')));
const waitRows = (page, pred, ms = 6000) => page.waitForFunction(pred, null, { timeout: ms }).then(() => true, () => false);

function lum([r, g, b]) { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); }
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: PUBLIC, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 900));
const browser = await chromium.launch();
try {
  /* ── ①~⑤ 본사 계정 ── */
  {
    const S = freshServer();
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => { if (/phone-gaps|__pg|pg-/.test(String(e && e.stack))) errs.push(String(e.message)); });
    await setup(page, S);
    await openSection(page);
    console.log('\n[ ① 펼치면 불러와 그린다 ]');
    const ok1 = await waitRows(page, () => document.querySelectorAll('#pg-body div.pg-row[data-uid]').length === 5);
    check('펼치면 5줄이 그려진다', ok1, await rows(page));
    check('펼칠 때 한 번만 불러온다(days=7)', S.gets.length === 1 && S.gets[0] === '7', S.gets);
    const cnt = await page.textContent('#pg-count');
    check('개수 칸 = 5명', /5/.test(cnt || ''), cnt);
    const hint = await page.$eval('#pg-body div.pg-row[data-uid="test_a"]', tr => ({ text: tr.textContent, vals: Array.from(tr.querySelectorAll('.pg-in')).map(i => i.value) }));
    check('참고 번호는 글자로 보인다', hint.text.includes('010-9999-0001'), hint.text.slice(0, 120));
    check('참고 번호를 입력칸에 자동으로 넣지 않는다', hint.vals.every(v => v === ''), hint.vals);
    const st = await page.$eval('#pg-body div.pg-row[data-uid="test_c"]', tr => tr.textContent);
    check('짧은 번호 줄은 자릿수를 말한다(9자리)', /9자리/.test(st), st.slice(0, 120));

    console.log('\n[ ② 보이고 · 눌리고 · 읽힌다 ]');
    const vis = await page.evaluate(() => {
      const tr = document.querySelector('#pg-body div.pg-row[data-uid="test_a"]');
      tr.scrollIntoView({ block: 'center' });
      const out = [];
      for (const el of tr.querySelectorAll('.pg-in, .pg-save')) {
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        out.push({ cls: el.className, w: r.width, h: r.height, top: top === el || el.contains(top) });
      }
      return out;
    });
    check('입력칸 둘·저장 버튼이 보이고 맨 위다(눌린다)', vis.length === 3 && vis.every(v => v.w > 20 && v.h > 14 && v.top), vis);
    // 🔴 표(table)였을 때 1440 창에서 [💾 저장]이 상자 오른쪽 밖(x 1788 > 창 1440)이었다 — 폭 셋에서 «상자 안» 인지 잰다
    for (const w of [1440, 1100, 390]) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.waitForTimeout(250);
      const fit = await page.evaluate(() => {
        const box = document.getElementById('pg-body').getBoundingClientRect();
        const out = [];
        for (const tr of document.querySelectorAll('#pg-body div.pg-row[data-uid]')) {
          for (const el of tr.querySelectorAll('.pg-in, .pg-save')) {
            const r = el.getBoundingClientRect();
            out.push({ l: Math.round(r.left), r: Math.round(r.right), boxL: Math.round(box.left), boxR: Math.round(box.right), vw: innerWidth });
          }
        }
        return { out, sw: document.documentElement.scrollWidth, vw: innerWidth };
      });
      const bad = fit.out.filter(o => o.l < o.boxL - 1 || o.r > o.boxR + 1 || o.r > o.vw);
      check(`창 ${w}px: 입력칸·저장 버튼이 전부 상자 안·화면 안`, fit.out.length > 0 && bad.length === 0, bad.slice(0, 3));
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.fill('#pg-body div.pg-row[data-uid="test_a"] .pg-in[data-role="parent"]', '010-1234-5678');
    const col = await page.evaluate(() => {
      const el = document.querySelector('#pg-body div.pg-row[data-uid="test_a"] .pg-in[data-role="parent"]');
      const parse = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return null; const a = m[1].split(',').map(Number); return [a[0], a[1], a[2], a.length > 3 ? a[3] : 1]; };
      const fg = parse(getComputedStyle(el).color);
      const layers = []; let n = el;
      while (n && n.nodeType === 1) { const b = parse(getComputedStyle(n).backgroundColor); if (b && b[3] > 0) { layers.push(b); if (b[3] >= 1) break; } n = n.parentElement; }
      let bg = [255, 255, 255];
      for (let i = layers.length - 1; i >= 0; i--) { const L = layers[i]; bg = [0, 1, 2].map(k => L[k] * L[3] + bg[k] * (1 - L[3])); }
      return { fg, bg, prio: el.style.getPropertyPriority('color') };
    });
    const cr = contrast(col.fg, col.bg);
    console.log(`  · 입력 글자 대비 ${cr.toFixed(2)} (글자 ${col.fg} · 배경 ${col.bg.map(x => Math.round(x))})`);
    check('입력칸 글자 대비 4.5 이상', cr >= 4.5, { cr, col });

    console.log('\n[ ③ 저장 — 채운 칸만 · 다시 불러 확인 · 쓰다 만 번호는 남는다 ]');
    await page.fill('#pg-body div.pg-row[data-uid="test_b"] .pg-in[data-role="student"]', '010-5555-6666');   // 쓰다 만 줄
    await page.click('#pg-body div.pg-row[data-uid="test_a"] .pg-save');
    const gone = await waitRows(page, () => !document.querySelector('#pg-body div.pg-row[data-uid="test_a"]'));
    check('저장한 학생은 다시 불러온 목록에서 빠진다', gone, await rows(page));
    const p1 = S.patches[0];
    check('PATCH 는 그 학생 contact 로 한 번', S.patches.length === 1 && p1.method === 'PATCH' && p1.uid === 'test_a', S.patches);
    check('PATCH 본문은 채운 칸만(학부모 번호 하나 · 빈 문자열 0건)', p1 && JSON.stringify(p1.body) === JSON.stringify({ parent_phone: '010-1234-5678' }), p1 && p1.body);
    check('저장 뒤 다시 불러왔다(GET 2번)', S.gets.length === 2, S.gets);
    const kept = await page.inputValue('#pg-body div.pg-row[data-uid="test_b"] .pg-in[data-role="student"]').catch(() => null);
    check('다른 줄에 쓰다 만 번호가 다시 그린 뒤에도 남는다', kept === '010-5555-6666', kept);
    const fl = await page.$eval('#pg-flash', el => ({ shown: getComputedStyle(el).display !== 'none', t: el.textContent }));
    check('저장 성공 안내가 보인다(그 아이디와 함께)', fl.shown && fl.t.includes('test_a'), fl);
    const flw = await page.$eval('#pg-flash', el => el.getAttribute('data-warn'));
    check('성공 안내는 경고 모양이 아니다(초록 — 짝)', flw === '0', flw);

    console.log('\n[ ④ 안 보내기 · 성공이라 안 하기 · 남으면 경고 ]');
    await page.fill('#pg-body div.pg-row[data-uid="test_c"] .pg-in[data-role="parent"]', '010-123-456');
    await page.click('#pg-body div.pg-row[data-uid="test_c"] .pg-save');
    await page.waitForTimeout(300);
    const m3 = await page.textContent('#pg-body div.pg-row[data-uid="test_c"] .pg-msg');
    check('10자리 미만이면 보내지 않고 이유를 말한다', S.patches.length === 1 && /10자리/.test(m3 || ''), { m3, n: S.patches.length });
    S.notKept.add('test_d');
    const g4 = S.gets.length;
    await page.fill('#pg-body div.pg-row[data-uid="test_d"] .pg-in[data-role="parent"]', '01022223333');
    await page.click('#pg-body div.pg-row[data-uid="test_d"] .pg-save');
    await page.waitForFunction(() => /저장되지 않았습니다/.test((document.querySelector('#pg-body div.pg-row[data-uid="test_d"] .pg-msg') || {}).textContent || ''), null, { timeout: 5000 }).catch(() => {});
    const m4 = await page.textContent('#pg-body div.pg-row[data-uid="test_d"] .pg-msg').catch(() => '');
    check('phone_kept:false · roster_updated:false 면 «저장되지 않았습니다» + 이유(대소문자) · ✅ 없음 · 줄은 남는다', /저장되지 않았습니다/.test(m4 || '') && /대소문자/.test(m4 || '') && !/✅/.test(m4 || '') && (await rows(page)).includes('test_d'), m4);
    check('명부도 못 찾았으면 다시 불러오지 않는다(바뀐 것이 없다)', S.gets.length === g4, { before: g4, after: S.gets.length });
    // 짝 — phone_kept:false 인데 목록에서 빠졌으면(명부엔 들어감) «지금은 가지만 직원 칸엔 못 적음» 을 말한다(✅ 아님)
    S.notKept.add('test_e'); S.notKeptGone.add('test_e');
    await page.fill('#pg-body div.pg-row[data-uid="test_e"] .pg-in[data-role="parent"]', '01044445555');
    await page.click('#pg-body div.pg-row[data-uid="test_e"] .pg-save');
    await page.waitForFunction(() => /직원 입력 칸/.test((document.getElementById('pg-flash') || {}).textContent || ''), null, { timeout: 5000 }).catch(() => {});
    const fl5 = await page.$eval('#pg-flash', el => ({ shown: getComputedStyle(el).display !== 'none', t: el.textContent }));
    check('명부엔 적고 직원 칸만 못 적었으면(roster_updated:true) «한 번 더 저장» 으로 말한다(✅·«지금 간다» 아님)', fl5.shown && /명부에는 적었지만/.test(fl5.t) && /직원 입력 칸/.test(fl5.t) && !/✅/.test(fl5.t) && !/지금은 문자가 갑니다/.test(fl5.t) && !(await rows(page)).includes('test_e'), fl5);
    // 🟡→수리(2026-10-28 함정 대조): 줄이 사라졌으니 «한 번 더 저장» 할 실재하는 곳(학생 상세)을 말하고, 주황 경고로 8초 뒤에도 남긴다
    check('그 경고는 «학생 상세에서» 다시 저장하라고 갈 곳을 말한다', /학생 상세/.test(fl5.t), fl5.t);
    const w5 = await page.$eval('#pg-flash', el => ({ warn: el.getAttribute('data-warn'), bg: getComputedStyle(el).backgroundColor }));
    const bgm = /rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/.exec(w5.bg) || [];
    check('경고는 주황 상자다(초록 성공 상자가 아니다)', w5.warn === '1' && +bgm[1] > +bgm[2] && +bgm[2] > +bgm[3], w5);
    await page.waitForTimeout(8600);
    const st5 = await page.$eval('#pg-flash', el => getComputedStyle(el).display !== 'none' && /학생 상세/.test(el.textContent));
    check('경고는 8초 뒤에도 사라지지 않는다(할 일이 남은 말)', st5, st5);
    S.keepOnSave.add('test_b');
    await page.click('#pg-body div.pg-row[data-uid="test_b"] .pg-save');
    await page.waitForFunction(() => /아직 문자가 안 갈/.test((document.querySelector('#pg-body div.pg-row[data-uid="test_b"] .pg-msg') || {}).textContent || ''), null, { timeout: 5000 }).catch(() => {});
    const m5 = await page.textContent('#pg-body div.pg-row[data-uid="test_b"] .pg-msg').catch(() => '');
    check('저장했는데 아직 목록에 남으면 경고한다', /아직 문자가 안 갈/.test(m5 || ''), m5);
    check('그 PATCH 도 학생 번호 하나만', JSON.stringify(S.patches[S.patches.length - 1].body) === JSON.stringify({ student_phone: '010-5555-6666' }), S.patches[S.patches.length - 1]);

    console.log('\n[ ⑤ 🌐 영어 · 기간 14일 ]');
    await page.fill('#pg-body div.pg-row[data-uid="test_c"] .pg-in[data-role="student"]', '010-7777');
    await page.evaluate(() => { window.adminLang = 'en'; document.dispatchEvent(new CustomEvent('mangoi:lang-changed')); });
    const en = await page.$eval('#pg-body', b => ({ t: b.textContent, ph: (b.querySelector('.pg-in[data-role="parent"]') || {}).placeholder, btn: (b.querySelector('.pg-save') || {}).textContent }));
    check('영어로 바꾸면 안내·칸·버튼이 영어', /students with upcoming classes/.test(en.t) && /Thu/.test(en.t) && en.ph === 'Parent no.' && /Save/.test(en.btn || ''), en);
    const enMsgs = await page.$$eval('#pg-body .pg-msg', els => els.map(e => e.textContent).filter(Boolean));
    check('영어로 바꾸면 이미 떠 있던 줄 안내도 영어로 바뀐다(저장 «그때» 의 말로 굳지 않는다)', enMsgs.length >= 2 && enMsgs.every(t => !/[가-힣]/.test(t)), enMsgs);
    const keptEn = await page.inputValue('#pg-body div.pg-row[data-uid="test_c"] .pg-in[data-role="student"]').catch(() => null);
    check('언어를 바꿔도 쓰다 만 번호가 남는다', keptEn === '010-7777', keptEn);
    await page.evaluate(() => { window.adminLang = 'ko'; document.dispatchEvent(new CustomEvent('mangoi:lang-changed')); });
    const before = S.gets.length;
    await page.selectOption('#pg-days', '14');
    await page.waitForTimeout(500);
    check('기간 14일을 고르면 days=14 로 다시 불러온다', S.gets.length === before + 1 && S.gets[S.gets.length - 1] === '14', S.gets);
    const keptDays = await page.inputValue('#pg-body div.pg-row[data-uid="test_c"] .pg-in[data-role="student"]').catch(() => null);
    check('기간을 바꿔도 남아 있는 학생 줄의 쓰다 만 번호는 남는다', keptDays === '010-7777', keptDays);
    check('이 칸 스크립트에서 오류가 안 난다', errs.length === 0, errs);
    await ctx.close();
  }
  /* ── ⑥ 강사 신원 · 403 ── */
  {
    console.log('\n[ ⑥ 강사는 숨김 · 403 은 서버 문구 ]');
    const S = freshServer(); S.role = 'teacher'; S.gap403 = true;
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await setup(page, S);
    await openSection(page);
    const hidden = await page.waitForFunction(() => getComputedStyle(document.getElementById('sm-phone-gaps')).display === 'none', null, { timeout: 10000 }).then(() => true, () => false);
    check('강사 신원이 오면 칸을 숨긴다', hidden);
    await page.evaluate(() => window.__pg.load());
    await page.waitForTimeout(400);
    const t = await page.textContent('#pg-body');
    check('403 이면 서버가 준 «지금 로그인» 문구를 그대로', /mangoi_018/.test(t || ''), t);
    await ctx.close();
  }
} finally {
  await browser.close();
  srv.kill();
}
console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`);
process.exit(FAIL ? 1 : 0);
