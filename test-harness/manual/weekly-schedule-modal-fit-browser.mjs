/* 📐 주간 스케줄 «새 슬롯 추가» 모달이 100% 배율에서 화면 안에 들어오는가 (2026-09-29)
 *
 * 사장님 제보: 「화면 비율을 줄여야 아래에 '저장' 버튼이 보여」.
 * 원인: PC(≥1024px)는 body{zoom:1.3} 인데 모달이 max-height:88vh 라 그 88vh 에도 1.3 이 곱해져
 *       모달이 화면(뷰포트)보다 커진다 — 아래 붙은(sticky) 저장 버튼이 화면 밖으로 밀린다.
 * 확인: 여러 창 크기에서 ① 모달 아래 끝이 화면 안 ② 저장 버튼의 «맨 위» 가 그 버튼(눌린다)
 *       ③ 짝: 내용은 스크롤로 다 닿는다(모달 안이 굴러간다).
 * 돌리는 법: PW_DIR=/tmp/pw node test-harness/manual/weekly-schedule-modal-fit-browser.mjs
 * ⚠️ 서버에 아무것도 쓰지 않는다(fetch 를 가짜 응답으로).
 */
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireBrowser } from './_pw.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = Number(process.env.WSM_PORT || 8917);
const BASE = `http://127.0.0.1:${PORT}`;
let PASS = 0, FAIL = 0;
const check = (n, ok, why) => { if (ok) { PASS++; console.log('  OK   ' + n); } else { FAIL++; console.log('  FAIL ' + n + (why !== undefined ? ' — ' + JSON.stringify(why) : '')); } };

async function serve() {
  const p = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: PUBLIC, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    try { const r = await fetch(BASE + '/admin/weekly-schedule.html', { method: 'HEAD' }); if (r.ok) return p; } catch { /* 아직 */ }
  }
  p.kill(); throw new Error('정적 서버를 못 띄웠습니다');
}

const { chromium, exe } = requireBrowser();
const srv = await serve();
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
try {
  for (const [w, h] of [[1680, 964], [1440, 800], [1366, 657], [1280, 720], [390, 844]]) {
    console.log(`\n[${w}×${h}]`);
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await page.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, items: [] }) }));
    await page.goto(BASE + '/admin/weekly-schedule.html?_=' + Date.now(), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.openNewSlotModal === 'function', { timeout: 20000 }).catch(() => {});
    const r = await page.evaluate(() => {
      try {
        window.openNewSlotModal([{ teacher: { name: 'KARL' }, dateISO: '2026-09-29', hour: 16, minute: 40 }]);
        var c = document.querySelector('.type-choice[data-type="1on1"]'); if (c) c.click();
      } catch (e) { return { err: String(e) }; }
      var m = document.getElementById('modal-box'), btn = document.getElementById('new-slot-save');
      if (!m || !btn) return { err: 'no modal/btn' };
      var mr = m.getBoundingClientRect(), br = btn.getBoundingClientRect();
      var top = document.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2);
      m.scrollTop = m.scrollHeight;
      var memo = document.querySelector('#new-slot-fields input, #new-slot-fields textarea:last-of-type');
      return { vh: innerHeight, mTop: Math.round(mr.top), mBot: Math.round(mr.bottom), bBot: Math.round(br.bottom),
        mine: !!top && (top === btn || btn.contains(top)), scrolls: m.scrollHeight > m.clientHeight + 1 };
    });
    if (r.err) { check('모달 열기', false, r.err); await ctx.close(); continue; }
    check('모달 아래 끝이 화면 안', r.mBot <= r.vh && r.mTop >= 0, r);
    check('저장 버튼이 화면 안 + 맨 위(눌린다)', r.bBot <= r.vh && r.mine, r);
    check('(짝) 넘치는 내용은 모달 안에서 스크롤로 닿는다', r.scrolls || r.mBot < r.vh, r);
    await ctx.close();
  }
} finally { await browser.close(); srv.kill(); }
console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`);
process.exit(FAIL ? 1 : 0);
