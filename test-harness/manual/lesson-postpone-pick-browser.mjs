// -*- coding: utf-8 -*-
/**
 * 학생 연기 화면 — «고른 수업만» 요청하는가 (브라우저, 2026-10-01 jeong 제보)
 * 제보: 주 4회 중 오늘(10/1) 하루만 미루려 했는데 4건 전부 연기 요청이 나갔다.
 * ⚠️ 자동으로 안 돕니다 — 사람이 부릅니다:
 *    PW_DIR=/opt/node-tools node test-harness/manual/lesson-postpone-pick-browser.mjs
 * 짝: «하나만 담으면 하나만 나간다» ↔ «넷 다 담으면 넷 다 나간다» · 중복(409)은 사람 말로.
 */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const req = createRequire(join(process.env.PW_DIR || '/opt/node-tools', 'node_modules', 'x.js'));
let pw; try { pw = req('playwright-core'); } catch (e) { console.log('⏭ playwright-core 없음 — 건너뜀'); process.exit(0); }
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✅', n); } else { fail++; console.log('  ❌ FAIL', n, x ?? ''); } };

const PORT = 8900 + Math.floor(Math.random() * 90);
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: join(ROOT, 'cloudflare-deploy', 'public'), stdio: 'ignore' });
await new Promise(r => setTimeout(r, 900));
const browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

const kst = new Date(Date.now() + 9 * 3600e3);
const d = n => new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() + n)).toISOString().slice(0, 10);
const fmt = n => { const x = d(n); return Number(x.slice(5,7)) + '/' + Number(x.slice(8,10)); };
const MINE = [
  { schedule_id: 850, next_date: d(1), start_time: '19:20', teacher_name: '중국어 강선생님', scheduled_date: null },
  { schedule_id: 851, next_date: d(2), start_time: '19:20', teacher_name: '중국어 강선생님', scheduled_date: null },
  { schedule_id: 848, next_date: d(5), start_time: '19:20', teacher_name: '중국어 강선생님', scheduled_date: null },
  { schedule_id: 849, next_date: d(6), start_time: '19:20', teacher_name: '중국어 강선생님', scheduled_date: null },
];

async function scenario(label, { pushAll, dupReply }) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const sent = [];
  await page.route('**/api/**', r => r.fulfill({ json: { ok: true, items: [] } }));
  await page.route('**/api/class/schedule/mine**', r => r.fulfill({ json: { ok: true, schedules: MINE } }));
  await page.route('**/api/class/schedule/request', async r => {
    sent.push(JSON.parse(r.request().postData() || '{}'));
    if (dupReply) return r.fulfill({ status: 409, json: { ok: false, error: 'already_pending' } });
    r.fulfill({ json: { ok: true, id: sent.length, status: 'pending' } });
  });
  await page.addInitScript(() => { try { if (!sessionStorage.getItem('__seeded')) { sessionStorage.setItem('__seeded', '1');
    localStorage.setItem('mangoi_logged_user', JSON.stringify({ uid: 'jeong', name: '정우영', role: 'student' }));
    localStorage.setItem('mango_token', 'tok'); } } catch (e) {} });
  await page.goto(`http://127.0.0.1:${PORT}/lesson-postpone-demo.html?_nc=${Date.now()}`);
  await page.waitForFunction(() => typeof __MOB_STATE !== 'undefined' && __MOB_STATE === 'real', null, { timeout: 8000 }).catch(() => {});
  ok(`[${label}] 실제 수업 4건을 불러왔다(전제)`, await page.evaluate(() => typeof __MOB_STATE !== 'undefined' && __MOB_STATE === 'real' && CURRENT_SCHEDULE.length === 4));
  await page.evaluate(() => _goMode('postpone'));
  ok(`[${label}] 실제 수업에서는 «주 N회» 강요 칸이 없다`, await page.evaluate(() => !document.querySelector('#detail-body .wk-tabs')));
  if (pushAll) {
    for (let i = 0; i < 4; i++) { await page.evaluate(i => { state.dtOrig = i; pushBackAll(); }, i); }
  } else {
    await page.evaluate(() => { state.dtOrig = 0; });
    await page.click('#pushBtn', { timeout: 3000 }).catch(e => ok(`[${label}] «한 주 뒤로» 버튼 누름`, false, e.message));
  }
  const cartN = await page.evaluate(() => state.cart.length);
  ok(`[${label}] 장바구니 ${pushAll ? 4 : 1}개`, cartN === (pushAll ? 4 : 1), cartN);
  const btn = await page.evaluate(() => { const b = document.getElementById('confirm-btn'); return b ? { dis: b.disabled, t: b.textContent } : null; });
  ok(`[${label}] 완료 버튼이 눌린다`, btn && btn.dis === false, btn);
  await page.click('#confirm-btn', { timeout: 3000 }).catch(e => ok(`[${label}] 완료 버튼 클릭`, false, e.message));
  await page.waitForFunction(() => document.getElementById('screen-done').classList.contains('active'), null, { timeout: 5000 }).catch(() => {});
  const done = await page.evaluate(() => ({ title: document.getElementById('done-title').textContent, sub: document.getElementById('done-sub').textContent, list: document.getElementById('done-list').textContent, n: document.querySelectorAll('#done-list li').length }));
  if (!pushAll) {
    ok(`[${label}] 서버로 나간 요청은 정확히 1건`, sent.length === 1, sent.length);
    ok(`[${label}] 그 1건은 오늘 수업(850)`, sent[0] && sent[0].schedule_id === 850 && sent[0].orig_date === d(1), sent[0]);
    ok(`[${label}] 그 1건은 한 주 뒤 같은 시각`, sent[0] && sent[0].new_date === d(8) && sent[0].new_time === '19:20', sent[0]);
    if (dupReply) ok(`[${label}] 중복이면 «기다리는 중» 을 사람 말로`, /기다리는 중/.test(done.sub) && /저장되지 않/.test(done.title), done);
    else {
      /* 📅 (2026-10-06) 완료 화면은 «기존 → 새 날짜» 한 줄씩 — 고른 수업 하나만, 옮긴 날짜까지 */
      ok(`[${label}] 완료 화면에 고른 수업 한 줄만(다른 날 없음)`, done.n === 1 && done.list.includes(fmt(1)) && !done.list.includes(fmt(2)), done);
      ok(`[${label}] 완료 화면에 옮겨진 날짜(한 주 뒤)가 보인다`, done.list.includes('→') && done.list.includes(fmt(8)), done.list);
      ok(`[${label}] 완료 제목은 «요청을 보냈어요»`, /요청을 보냈어요/.test(done.title), done.title);
    }
  } else {
    ok(`[${label}] 넷을 다 담으면 넷 다 나간다(짝)`, sent.length === 4 && new Set(sent.map(s => s.schedule_id)).size === 4, sent.map(s => s.schedule_id));
  }
  await ctx.close();
}
try {
  await scenario('하루만', { pushAll: false });
  await scenario('넷 다', { pushAll: true });
  await scenario('중복', { pushAll: false, dupReply: true });
} catch (e) { ok('시나리오 실행', false, e.message); }
await browser.close(); srv.kill();
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
