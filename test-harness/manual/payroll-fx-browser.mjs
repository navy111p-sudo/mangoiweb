// -*- coding: utf-8 -*-
// 💱 급여 표 «원화로 보기» 브라우저 검사 (2026-09-25)
//
//   사장님 「급여에서 버튼 만들어서 누르면 페소와 원화 현재 환율로 변해서 보이게. 위에 환율도 보여줘」.
//   문자열 하니스(payroll_fx_krw_harness)는 «식이 맞나» 까지만 본다 — 여기서는 진짜 화면에 그려
//   ① 환율 줄이 보이는가 ② 버튼이 «맨 위» 라 눌리는가 ③ 누르면 실지급액이 ₩ 로 바뀌는가
//   ④ 계산 API 를 다시 부르지 않는가 ⑤ 다시 누르면 ₱ 로 돌아오는가 ⑥ 환율을 못 받으면 ₱ 그대로인가 를 잰다.
//
//   ⛔ 「바뀐다」만 세지 말 것 — 짝으로 센다:
//        · 켜면 ₩            ↔ 끄면 ₱ 로 돌아온다
//        · 환율이 있으면 ₩    ↔ 환율이 없으면 눌러도 ₱ 그대로(숫자를 지어내지 않음)
//        · 표시가 ₩           ↔ 조정 금액 입력칸 값은 ₱ 그대로
//
//   ⚠️ 자동으로 안 돕니다 — 사람이 부릅니다:
//        mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
//        PW_DIR=/tmp/pw node test-harness/manual/payroll-fx-browser.mjs
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright, findChromium } from './_pw.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = 8963;
const BASE = `http://127.0.0.1:${PORT}`;

let pass = 0, fail = 0;
const check = (n, ok, extra) => {
  if (ok) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (extra ? '  → ' + extra : '')); }
};

const RATE = 23.85;
const CALC = {
  ok: true, levels: [],
  summary: { teacher_count: 2, total_lessons: 313, total_deduction: 0, total_final: 10235, paid_count: 0 },
  rows: [
    { teacher_id: 7, korean_name: 'Teacher Ana', english_name: 'Teacher Ana', lesson_count: 211, total_minutes: 4220,
      fee_per_10min: 35, rate_per_20min: 70, calculated_amount: 7385, deduction_total: 0, final_amount: 7385, status: 'pending' },
    { teacher_id: 8, korean_name: 'Teacher Belle', english_name: 'Teacher Belle', lesson_count: 102, total_minutes: 2320,
      fee_per_10min: 25, rate_per_20min: 50, calculated_amount: 2850, deduction_total: 0, final_amount: 2850, status: 'pending' },
  ],
};

async function serve() {
  const p = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: PUBLIC, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 250));
    try { const r = await fetch(BASE + '/admin.html', { method: 'HEAD' }); if (r.ok) return p; } catch { /* 아직 */ }
  }
  p.kill(); throw new Error('정적 서버를 못 띄웠습니다');
}

async function open(browser, fxOk) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    try {
      localStorage.setItem('mangoi_admin_welcome_v1_done', '1');
      localStorage.setItem('mangoi_admin_session', JSON.stringify({ uid: 'admin', username: 'admin', role: 'admin' }));
    } catch (e) { /* */ }
  });
  const calls = { calc: 0, fx: 0 };
  // 포괄을 먼저, 구체적인 것을 뒤에(나중에 등록한 route 가 이긴다)
  await ctx.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
  await ctx.route('**/api/admin/payroll/calculate**', r => { calls.calc++; r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CALC) }); });
  await ctx.route('**/api/admin/reports/fx-rate**', r => {
    calls.fx++;
    if (fxOk) r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, rate: RATE, date: '2026-09-25', source: 'live' }) });
    else r.fulfill({ status: 502, contentType: 'application/json', body: '{"ok":false,"error":"fx_unavailable"}' });
  });
  page.on('dialog', d => { calls.alert = (calls.alert || 0) + 1; d.dismiss().catch(() => {}); });
  await page.goto(BASE + '/admin.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#card-payroll-auto', { state: 'attached', timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    if (typeof window.jumpToMenu === 'function') { try { window.jumpToMenu('card-payroll-auto'); } catch (e) {} }
    const c = document.getElementById('card-payroll-auto'); if (c && !c.open) c.open = true;
  });
  await page.waitForFunction(() => /Teacher Ana/.test((document.getElementById('pr-table') || {}).textContent || ''), null, { timeout: 30000 });
  await page.waitForTimeout(600);
  return { ctx, page, calls };
}

const anaFinal = page => page.evaluate(() => {
  const tr = [...document.querySelectorAll('#pr-table tbody tr')].find(t => /Teacher Ana/.test(t.textContent));
  if (!tr) return null;
  const td = tr.querySelectorAll('td');
  return { fin: (td[7].textContent || '').trim(), adj: tr.querySelector('input[type=number]').value,
           head: [...document.querySelectorAll('#pr-table thead th')].map(t => t.textContent.trim())[8] };
});

(async () => {
  const pw = loadPlaywright(), exe = findChromium();
  if (!pw || !exe) { console.log('  ⏭ playwright-core 또는 Chromium 없음 — 건너뜁니다.'); process.exit(0); }
  const srv = await serve();
  const browser = await pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    console.log('\n① 환율이 있을 때');
    let { ctx, page, calls } = await open(browser, true);
    await page.waitForFunction(() => /23/.test((document.getElementById('pr-fx') || {}).textContent || ''), null, { timeout: 10000 }).catch(() => {});
    const bar = await page.evaluate(() => {
      const w = document.getElementById('pr-fx-wrap'), b = document.getElementById('pr-krw-btn');
      const r = b.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { disp: getComputedStyle(w).display, h: w.getBoundingClientRect().height, txt: document.getElementById('pr-fx').textContent,
               btn: b.textContent.trim(), onTop: top === b || b.contains(top) };
    });
    check('①-1 환율 줄이 보인다', bar.disp !== 'none' && bar.h > 10, JSON.stringify(bar));
    check('①-2 「1페소 = 23.85원 · 오늘 환율 · 날짜」', /1페소 = 23\.85원/.test(bar.txt) && /오늘 환율/.test(bar.txt) && /2026-09-25/.test(bar.txt), bar.txt);
    check('①-3 버튼이 「₩ 원화로 보기」이고 맨 위라 눌린다', bar.btn === '₩ 원화로 보기' && bar.onTop, JSON.stringify(bar));
    const before = await anaFinal(page);
    check('①-4 누르기 전 실지급액은 ₱', before && before.fin === '₱ 7,385', JSON.stringify(before));
    const calc0 = calls.calc;
    await page.click('#pr-krw-btn');
    await page.waitForTimeout(700);
    const on = await anaFinal(page);
    const want = '₩ ' + Math.round(7385 * RATE).toLocaleString('ko-KR');
    check('①-5 누르면 실지급액이 ₩ (' + want + ')', on && on.fin === want, JSON.stringify(on));
    check('①-6 계산 API 를 다시 부르지 않는다', calls.calc === calc0, `calc ${calc0} → ${calls.calc}`);
    check('①-7 조정 금액 칸은 ₱ 그대로 + 제목에 (₱)', on && on.adj === '' && /₱/.test(on.head || ''), JSON.stringify(on));
    const sum = await page.evaluate(() => document.getElementById('pr-summary').textContent);
    check('①-8 위 요약도 ₩', /₩/.test(sum) && !/₱/.test(sum), sum);
    const btn2 = await page.evaluate(() => document.getElementById('pr-krw-btn').textContent.trim());
    check('①-9 버튼 글자가 「₱ 페소로 보기」', btn2 === '₱ 페소로 보기', btn2);
    await page.click('#pr-krw-btn'); await page.waitForTimeout(700);
    const off = await anaFinal(page);
    check('①-10 다시 누르면 ₱ 로 돌아온다(짝)', off && off.fin === '₱ 7,385', JSON.stringify(off));
    await ctx.close();

    console.log('\n② 환율을 못 받을 때 — 숫자를 지어내지 않는다');
    ({ ctx, page, calls } = await open(browser, false));
    await page.waitForTimeout(800);
    const txt = await page.evaluate(() => document.getElementById('pr-fx').textContent);
    check('②-1 「환율을 불러오지 못했습니다」', /불러오지 못했습니다/.test(txt), txt);
    await page.click('#pr-krw-btn'); await page.waitForTimeout(800);
    const still = await anaFinal(page);
    check('②-2 눌러도 ₱ 그대로(짝)', still && still.fin === '₱ 7,385', JSON.stringify(still));
    check('②-3 사람에게 못 받았다고 말한다(알림)', (calls.alert || 0) >= 1, String(calls.alert));
    await ctx.close();
  } catch (e) {
    fail++; console.log('  ❌ 실행 오류 — ' + (e && e.message || e));
  } finally {
    await browser.close(); if (srv) srv.kill();
  }
  console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
})();
