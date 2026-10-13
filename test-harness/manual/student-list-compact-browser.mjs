// -*- coding: utf-8 -*-
// ✅▦ 학생 목록 «D+A 안» 브라우저 검사 (2026-10-13 사장님 「D+A 추천안으로 실제 학생 목록 고쳐줘」)
//
//   무엇을 재나 —
//     ① «손볼 학생» 카드가 실제 숫자를 그리고, 누르면 그 학생만 남고, 다시 누르면 풀린다(짝).
//     ② 예약 정보가 «한 명도» 없으면 예약 카드는 숫자 대신 «—»(모름) — 서버 예약 요약은 실패해도
//        빈 Map 으로 떨어져 «전원 예약 없음» 처럼 보이므로 지어내지 않는다.
//     ③ 간단히 보기(기본)는 머리글 10칸 · 아이디가 이름 아래 · 머리글과 칸 폭이 맞는다.
//        «모든 칸 보기» 를 누르면 20칸으로 돌아온다(짝 — 없으면 «영영 접기» 도 통과).
//     ④ 도구 줄 보조 버튼이 «큰 파란 알약»(전역 버튼 규칙)으로 안 그려진다.
//
//   ⚠️ 자동으로 안 돕니다(manual/ 규약). 사람이 부릅니다:
//        PW_DIR=/opt/node-tools node test-harness/manual/student-list-compact-browser.mjs
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright, findChromium } from './_pw.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = 8963 + Math.floor(Math.random() * 20);   // 서비스워커 캐시 회피 — 매번 새 오리진
const BASE = `http://127.0.0.1:${PORT}`;
const SHOT = process.env.SHOT || '';

let pass = 0, fail = 0;
const check = (n, ok, extra) => {
  if (ok) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (extra ? '  → ' + extra : '')); }
};

const sched = (label, teachers) => ({ weekly: 1, upcoming: 0, past: 0, total: 1, label_ko: label, label_en: label, teachers });
const NOSCHED = { weekly: 0, upcoming: 0, past: 0, total: 0, label_ko: '—', label_en: '—', teachers: [] };
function students(withSched) {
  const S = [
    ['Melca08', 'Melca', '01000000000', '', sched('주 1회', ['MELCA'])],
    ['Jeong456', 'Jeong456', '01000000000', '', sched('단건 10회', [])],
    ['lee123', 'lee123', '01000000000', '', NOSCHED],
    ['Jeong123', 'Jeong', '01000000000', '', sched('주 4회', ['MAIMAI'])],
    ['yahee', '정예희', '01090451234', '01089862224', sched('단건 6회', ['ZEE', 'KRYSTEL'])],
    ['mango7038', '김독이', '', '', NOSCHED],
    ['지서윤', '지서윤', '', '', NOSCHED],
  ];
  return S.map(([u, n, p, pp, sc], i) => ({ user_id: u, name: n, student_phone: p, parent_phone: pp,
    created_at: Date.now() - i * 3600e3, points: i * 10, shop_name: i > 5 ? '천안UMC엄마표' : '',
    sched: withSched ? sc : NOSCHED, track: 'unknown',
    franchise: i === 4 ? '천안지사' : '', sessions: i === 4 ? 12 : 0, last_seen: i === 4 ? '2026-10-08' : null,
    lastpay: i === 4 ? { paid_at: Date.UTC(2026, 8, 30, 3, 0), amount_krw: 150000 } : null,
    next_class: i === 4 ? { at: Date.UTC(2026, 9, 14, 10, 20), ymd: '2026-10-14', hm: '19:20', source: 'cafe24' } : null }));
}

async function serve() {
  const p = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: PUBLIC, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 250));
    try { const r = await fetch(BASE + '/admin.html', { method: 'HEAD' }); if (r.ok) return p; } catch { /* 아직 */ }
  }
  p.kill(); throw new Error('정적 서버를 못 띄웠습니다');
}

async function open(browser, withSched) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('mangoi_admin_welcome_v1_done', '1');
      localStorage.setItem('mangoi_admin_session', JSON.stringify({ uid: 'admin', username: 'admin', role: 'admin' }));
    } catch (e) { /* 시크릿 */ }
  });
  await ctx.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[],"results":[]}' }));
  await ctx.route('**/api/admin/students/unified**', r => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, count: 7, students: students(withSched), can_view_pii: true }) }));
  const page = await ctx.newPage();
  await page.goto(BASE + '/admin.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.jumpToMenu === 'function' && typeof window.smToggleCompact === 'function', null, { timeout: 30000 });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    window.jumpToMenu('card-students-mgmt');
    const d = document.getElementById('sm-student-list'); if (d) d.open = true;
    document.getElementById('sm-load-students').click();
  });
  await page.waitForFunction(() => document.querySelectorAll('#sm-students-tbody tr td a.sm-name-go').length >= 7, null, { timeout: 15000 });
  await page.waitForTimeout(300);
  return { ctx, page };
}

const state = page => page.evaluate(() => {
  const vis = el => el && getComputedStyle(el).display !== 'none';
  const ths = [...document.querySelectorAll('#sm-students-table thead th')].filter(vis);
  const tr = document.querySelector('#sm-students-tbody tr');
  const tds = tr ? [...tr.children].filter(vis) : [];
  const widthOk = ths.length === tds.length && ths.every((t, i) => Math.abs(t.getBoundingClientRect().width - tds[i].getBoundingClientRect().width) < 2);
  const cards = [...document.querySelectorAll('#sm-todo-cards .sm-todo[data-todo]')].filter(a => a.dataset.todo)
    .map(a => ({ k: a.dataset.todo, n: a.querySelector('b').textContent, pressed: a.getAttribute('aria-pressed') }));
  const rows = document.querySelectorAll('#sm-students-tbody a.sm-name-go').length;
  const sub = document.querySelector('#sm-students-tbody .sm-uid-sub');
  const csv = document.getElementById('sm-export-csv');
  const cs = csv ? getComputedStyle(csv) : null;
  return { th: ths.length, td: tds.length, widthOk, cards, rows,
    uidSub: sub ? (vis(sub) ? sub.textContent : '(hidden)') : null,
    csvBg: cs ? cs.backgroundImage + ' ' + cs.backgroundColor : '', csvH: csv ? Math.round(csv.getBoundingClientRect().height) : 0,
    pageOverflow: document.documentElement.scrollWidth > innerWidth + 1 };
});

(async () => {
  const pw = loadPlaywright(), exe = findChromium();
  if (!pw || !exe) { console.log('  ⏭ playwright-core 또는 Chromium 없음 — 건너뜁니다.'); process.exit(0); }
  const srv = await serve();
  const browser = await pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  try {
    console.log('[ ① 손볼 학생 카드 ]');
    const { ctx, page } = await open(browser, true);
    let s = await state(page);
    const n = k => (s.cards.find(c => c.k === k) || {}).n;
    check(`번호 없음 = 2 (${n('nophone')})`, n('nophone') === '2');
    check(`예약 없음 = 3 (${n('nosched')})`, n('nosched') === '3');
    check(`예약은 있는데 강사 이름 없음 = 1 (${n('noteacher')})`, n('noteacher') === '1');
    await page.click('#sm-todo-cards [data-todo="nophone"]');
    s = await state(page);
    check(`누르면 그 학생만 남는다 (${s.rows}행)`, s.rows === 2);
    check('누른 카드가 눌린 상태로 그려진다', (s.cards.find(c => c.k === 'nophone') || {}).pressed === 'true');
    await page.click('#sm-todo-cards [data-todo="nophone"]');
    s = await state(page);
    check(`다시 누르면 풀린다 (${s.rows}행)`, s.rows === 7);

    console.log('[ ③ 간단히 보기 ]');
    check(`머리글 15칸 · 첫 줄 15칸 (${s.th}·${s.td})`, s.th === 15 && s.td === 15);
    const extra = await page.evaluate(() => { const tr=[...document.querySelectorAll('#sm-students-tbody tr')].find(r=>/yahee/.test(r.textContent)); const c=[...tr.children]; return { br: c[16].textContent.trim(), cls: c[17].textContent.trim(), vis17: getComputedStyle(c[16]).display !== 'none', vis18: getComputedStyle(c[17]).display !== 'none' }; });
    check(`지사 칸이 보이고 franchise 로 채워진다 (${extra.br})`, extra.vis17 && extra.br === '천안지사');
    check(`수업 기록 칸에 횟수·최근 수업일 (${extra.cls})`, extra.vis18 && /12회/.test(extra.cls) && /10-08/.test(extra.cls));
    // 🔗 (2026-10-13) 맨 오른쪽 «바로가기» — 세 버튼이 보이고, 그 학생 상세의 그 탭으로 가며, 손이 닿는다.
    const q = await page.evaluate(() => { const tr=[...document.querySelectorAll('#sm-students-tbody tr')].find(r=>/yahee/.test(r.textContent)); const td=tr.children[21]; const as=[...td.querySelectorAll('a')]; return { vis: getComputedStyle(td).display !== 'none', hrefs: as.map(a=>a.getAttribute('href')), top: as.map(a=>{ a.scrollIntoView({block:'center',inline:'center'}); const r=a.getBoundingClientRect(); const e=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2); return !!(e && (e===a || a.contains(e))); }), inCell: as.every(a=>{ const r=a.getBoundingClientRect(), c=td.getBoundingClientRect(); return r.left>=c.left-1 && r.right<=c.right+1; }) }; });
    check(`바로가기 칸이 보이고 버튼 3개 (${q.hrefs.length})`, q.vis && q.hrefs.length === 3);
    check(`수업료·출결·녹화 탭으로 간다 (${q.hrefs.map(h=>h.split('tab=')[1]).join(',')})`, ['payment','attend','recording'].every((t,i)=>q.hrefs[i]==='/admin/student?uid=yahee&tab='+t));
    check(`세 버튼 모두 손이 닿는다 (${q.top.join(',')})`, q.top.length === 3 && q.top.every(Boolean));
    check('세 버튼이 칸 밖으로 안 넘친다', q.inCell);
    // 💰📅 (2026-10-13) 최근 결제 · 다음 수업 — 보이고, 값이 들어가고, 없는 학생은 «—».
    const pn = await page.evaluate(() => { const rows=[...document.querySelectorAll('#sm-students-tbody tr')]; const tr=rows.find(r=>/yahee/.test(r.textContent)); const other=rows.find(r=>/Melca08/.test(r.textContent)); const vis=e=>getComputedStyle(e).display!=='none'; const lp=tr.children[19], nc=tr.children[20]; return { vis: vis(lp)&&vis(nc), lp: lp.textContent.trim(), nc: nc.textContent.trim(), olp: other.children[19].textContent.trim(), onc: other.children[20].textContent.trim(), lines: [lp,nc].map(c=>Math.round(c.getBoundingClientRect().height)), hd: [...document.querySelectorAll('#sm-students-table thead th')].slice(19,21).map(t=>t.textContent.trim()) }; });
    check(`머리글 «최근 결제»·«다음 수업» (${pn.hd.join('·')})`, /최근 결제/.test(pn.hd[0]) && /다음 수업/.test(pn.hd[1]));
    check(`최근 결제 = 09-30 · ₩150,000 (${pn.lp})`, pn.vis && /09-30/.test(pn.lp) && /₩150,000/.test(pn.lp));
    check(`다음 수업 = 10-14 19:20 (${pn.nc})`, /10-14/.test(pn.nc) && /19:20/.test(pn.nc));
    check(`(짝) 값이 없는 학생은 «—» (${pn.olp}·${pn.onc})`, pn.olp === '—' && pn.onc === '—');
    check('머리글과 칸 폭이 맞는다', s.widthOk);
    check(`아이디가 이름 아래 보인다 (${s.uidSub})`, s.uidSub === 'Melca08');
    check('페이지가 옆으로 안 밀린다', !s.pageOverflow);
    if (SHOT) await page.screenshot({ path: SHOT, clip: await page.evaluate(() => { const r = document.getElementById('sm-student-list').getBoundingClientRect(); return { x: Math.max(0, r.x), y: Math.max(0, r.y + scrollY), width: Math.min(1600, r.width), height: Math.min(900, r.height) }; }), fullPage: true });
    console.log('[ ④ 도구 줄 ]');
    check(`CSV 버튼이 그라데이션 알약이 아니다 (${s.csvBg} · h${s.csvH})`, /none/.test(s.csvBg) && s.csvH <= 40)   // 관리자 PC 는 zoom 1.3 — 27px × 1.3 ≈ 35;
    await page.click('#sm-compact-toggle');
    s = await state(page);
    check(`«모든 칸 보기» 를 누르면 22칸 (${s.th}·${s.td})`, s.th === 22 && s.td === 22);
    check('그때 아이디는 이름 아래가 아니라 자기 칸에', s.uidSub === '(hidden)');
    await page.click('#sm-compact-toggle');
    s = await state(page);
    check(`다시 누르면 15칸 (${s.th})`, s.th === 15);
    await ctx.close();

    console.log('[ ② 예약 정보가 없으면 «모름» ]');
    const b = await open(browser, false);
    s = await state(b.page);
    check(`예약 카드가 숫자 대신 «—» (${(s.cards.find(c => c.k === 'nosched') || {}).n})`, (s.cards.find(c => c.k === 'nosched') || {}).n === '—');
    check('번호 카드는 그대로 센다', (s.cards.find(c => c.k === 'nophone') || {}).n === '2');
    await b.ctx.close();
  } catch (e) { fail++; console.log('  ❌ 검사 도중 오류: ' + (e && e.message || e)); }
  await browser.close(); srv.kill();
  console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
})();
