/*
 * 매일보고 → «결재로 옮기기» → 결재 화면 채우기 — 진짜 브라우저로 «끝에서 끝까지» 수십 번 눌러 본다 (2026-10-09)
 *
 * 서버는 운영이 아니다 — 로컬 HTTP 로 public/ 을 그대로 서빙하고, /review 응답은
 *   정본 src/handover-routing.ts 를 node 에서 «실제로 돌려» 만든다(화면 ↔ 정본이 같은 답을 쓰는지까지 본다).
 * 보는 것: 노란 상자가 뜨는가 · 줄·종류·이유(한/영) · 버튼 → 새 탭 /work?type= · 그 탭에 제목·내용·금액·통화가 채워지는가
 *   + 짝: 평범한 보고면 상자 없음 · 다른 계정이면 안 채움 · 15분 지나면 안 채움 · 쓰던 초안이 있으면 안 덮음 · 다른 분류면 안 채움.
 * ⚠️ work.html 의 PICK·CUR 는 스크립트 «안» 변수라 밖에서 못 읽는다 — 화면(.kind.on · #cur_*.on)으로 읽는다.
 * 돌리는 법: PW_DIR=/opt/node-tools node test-harness/manual/handover-route-flow-browser.mjs   (자동으로 안 돕니다)
 */
import { requireBrowser } from './_pw.mjs';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import http from 'node:http';

const { chromium, exe } = requireBrowser();
const PUB = fileURLToPath(new URL('../../cloudflare-deploy/public', import.meta.url));
const SRC = fileURLToPath(new URL('../../cloudflare-deploy/src/handover-routing.ts', import.meta.url));
const d0 = mkdtempSync(join(tmpdir(), 'hflow-')); writeFileSync(join(d0, 'm.mjs'), stripTypeScriptTypes(readFileSync(SRC, 'utf8')));
const R = await import(pathToFileURL(join(d0, 'm.mjs')).href);

let PASS = 0, FAIL = 0; const FAILS = [];
const ok = (n, c, x) => { if (c) PASS++; else { FAIL++; FAILS.push(n + (x ? ' — ' + x : '')); } };

const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0]; if (p === '/work') p = '/work.html';
  try { const b = readFileSync(PUB + p); res.setHeader('Content-Type', p.endsWith('.js') ? 'application/javascript' : p.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8'); res.end(b); }
  catch { res.statusCode = 404; res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const ORIGIN = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless: true, executablePath: exe });

const ME = { username: 'mgr_maimai', name: 'Maimai' };
const TYPES = [
  { key: 'purchase', ko: '물품 구입', en: 'Purchase', needs_amount: true, wants_file: true, wants_category: true },
  { key: 'expense', ko: '지출 정산', en: 'Expense', needs_amount: true, wants_file: true, wants_category: true },
  { key: 'leave', ko: '휴가 신청', en: 'Time off', needs_amount: false, wants_file: false, wants_dates: true },
  { key: 'doc', ko: '일반 문서', en: 'Document', needs_amount: false, wants_file: true },
];
async function newCtx(workUser = ME.username) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 1000 } });
  // ⚠️ 포괄 스텁을 «먼저», 구체적인 것을 «뒤에» — 나중 등록이 이긴다
  await ctx.route('**/api/**', r => r.fulfill({ json: { ok: true } }));
  await ctx.route('**/api/approval/home*', r => r.fulfill({ json: { ok: true, me: { username: workUser, name: workUser, is_exec: false, is_ph_manager: true, is_teacher: false }, colleagues: [], my_delegate: null, can_approve: false, pending: 0, schedule_pending: 0, types: TYPES, inbox: [], mine: [], reuse: [], urgent: [] } }));
  await ctx.route('**/api/approval/handover/**', async route => {
    const req = route.request(), u = req.url(), b = req.method() === 'POST' ? req.postDataJSON() : null;
    let data;
    if (u.includes('/home')) data = { ok: true, day: '2026-10-09', me: ME, members: [ME, { username: 'mgr_jjw', name: '장지웅' }], default_recipient: 'mgr_jjw', reports: [], own: null, schedule: null, required: [], ai_available: true, can_review_all: false };
    else if (u.endsWith('/inbox')) data = { ok: true, reports: [], total: 0, files: [] };
    else if (u.endsWith('/review')) data = { ok: true, check: { ready: !!b.payload.work, missing: b.payload.work ? [] : ['work'] }, ai_state: 'unavailable', suggestion: null, approval_hints: R.approvalHints(b.payload) };
    else data = { ok: true };
    await route.fulfill({ json: data });
  });
  return ctx;
}
async function reviewPage(ctx, work) {
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(ORIGIN + '/daily-handover.html');
  await page.waitForFunction(() => !document.querySelector('#mh-work').disabled);
  await page.locator('#mh-work').fill(work);
  await page.locator('#mh-manual').click();
  await page.waitForTimeout(150);
  return { page, errs };
}
async function openWork(page, idx = 0) {
  // 버튼이 없으면 «크래시» 가 아니라 «깔끔한 FAIL» — 무엇이 깨졌는지 보이게
  if ((await page.locator('#mh-route a').count()) <= idx) return { pop: null, v: { url: null, title: '', body: '', amount: '', cur: null, pick: null, left: null }, errs: ['no button'] };
  const [pop] = await Promise.all([page.context().waitForEvent('page'), page.locator('#mh-route a').nth(idx).click()]);
  const errs = []; pop.on('pageerror', e => errs.push(e.message));
  await pop.waitForLoadState('load'); await pop.waitForTimeout(700);
  const v = await pop.evaluate(() => ({ url: location.pathname + location.search, title: (document.getElementById('f_title') || {}).value, body: (document.getElementById('f_body') || {}).value, amount: (document.getElementById('f_amount') || {}).value, cur: document.querySelector('#cur_PHP.on') ? 'PHP' : document.querySelector('#cur_KRW.on') ? 'KRW' : null, pick: (function(){ var k=document.querySelector('#kinds .kind.on'); if(!k) return null; var t=k.textContent.trim(); return ({'물품 구입':'purchase','Purchase':'purchase','지출 정산':'expense','Expense':'expense','휴가 신청':'leave','Time off':'leave','일반 문서':'doc','Document':'doc'})[t]||t; })(), left: localStorage.getItem('mangoi_work_prefill_v1') }));
  return { pop, v, errs };
}

// ① 생성 문장 수십 개 — 상자 → 버튼 → 결재 화면 채움
const ITEMS = ['프린터 잉크', '헤드셋', '마우스', '웹캠', 'A4 용지', '키보드'];
const AMTS = [['₱1,200', 1200, 'PHP'], ['PHP 850', 850, 'PHP'], ['450 pesos', 450, 'PHP'], ['3만원', 30000, 'KRW'], ['12,000원', 12000, 'KRW']];
const CASES = [];
for (const it of ITEMS) for (const [a, n, c] of AMTS) CASES.push({ line: `${it} ${a} 사야 함`, type: 'purchase', n, c });
for (const [a, n, c] of AMTS) CASES.push({ line: `택시비 사비로 ${a} 냄, 영수증 있음`, type: 'expense', n, c });
for (const d of ['다음 주 금요일', '10월 15일', '내일']) CASES.push({ line: `${d} 연차 쓰고 싶습니다`, type: 'leave', n: null, c: null });
CASES.push({ line: 'I need a day off on Oct 15', type: 'leave', n: null, c: null });
CASES.push({ line: 'Paid for ink out of pocket 450 pesos, please reimburse', type: 'expense', n: 450, c: 'PHP' });

const ctx = await newCtx();
for (const [i, cs] of CASES.entries()) {
  const { page, errs } = await reviewPage(ctx, '카카오 문의 3건 답변\n' + cs.line);
  const box = page.locator('#mh-route');
  ok(`#${i} 상자 보임 «${cs.line}»`, await box.isVisible());
  const txt = await box.innerText();
  ok(`#${i} 줄 그대로`, txt.includes(cs.line));
  ok(`#${i} 평범한 줄은 안 나옴`, !txt.includes('카카오 문의'));
  ok(`#${i} 한/영 제목`, /결재로 올려야 할 것 같아요/.test(txt) && /These may need approval/.test(txt));
  ok(`#${i} 버튼 1개 · 주소`, (await box.locator('a').count()) === 1 && (await box.locator('a').getAttribute('href')) === '/work?type=' + cs.type);
  const { pop, v, errs: e2 } = await openWork(page);
  ok(`#${i} 결재 폼이 그 분류로 열림`, v.pick === cs.type, JSON.stringify(v));
  ok(`#${i} 제목 채움`, v.title === cs.line.slice(0, 80), v.title);
  ok(`#${i} 내용 채움`, (v.body || '').startsWith(cs.line) && /매일보고에서 옮김/.test(v.body || ''));
  if (cs.n != null) { ok(`#${i} 금액 ${cs.n}`, String(v.amount) === String(cs.n), v.amount); ok(`#${i} 통화 ${cs.c}`, v.cur === cs.c, v.cur); }
  ok(`#${i} 넘김 내용은 한 번 쓰고 지움`, v.left === null);
  ok(`#${i} 화면 오류 없음`, errs.length === 0 && e2.length === 0, [...errs, ...e2].join('|'));
  if (pop) { await pop.evaluate(() => localStorage.clear()); await pop.close(); } await page.close();
}

// ② 짝 — 평범한 보고면 상자 없음
for (const w of ['카카오 문의 3건 답변', '학생 결제 5만원 받음', '휴가 결재 올림', '학생 조퇴함', 'Teacher A 휴가 중이라 대신 수업함', '수업료 문의 5만원']) {
  const { page } = await reviewPage(ctx, w);
  ok(`안 뜸 «${w}»`, !(await page.locator('#mh-route').isVisible()));
  await page.close();
}
// 여러 줄 → 여러 버튼, 두 번째 버튼은 두 번째 분류로
{
  const { page } = await reviewPage(ctx, '잉크 ₱500 사야 함\n다음 주 금요일 연차 쓰고 싶습니다\n택시비 사비로 ₱300 냄, 영수증 있음');
  ok('세 줄 → 버튼 3개', (await page.locator('#mh-route a').count()) === 3);
  const { pop, v } = await openWork(page, 1);
  ok('두 번째 버튼 = 휴가', v.pick === 'leave' && v.title.includes('연차'), JSON.stringify(v));
  if (pop) { await pop.evaluate(() => localStorage.clear()); await pop.close(); }
  // 고치면 상자가 사라짐(옛 안내가 남지 않게)
  await page.locator('#mh-work').fill('카카오 답변');
  ok('본문을 고치면 상자 숨김', !(await page.locator('#mh-route').isVisible()));
  await page.close();
}
await ctx.close();

// ③ 짝 — 결재 화면이 «안 채워야» 할 때
async function prefillThen(work, setup) {
  const c = await newCtx(setup.workUser || ME.username);
  const { page } = await reviewPage(c, work);
  if (setup.before) await page.evaluate(setup.before);
  if (!(await page.locator('#mh-route a').count())) { await c.close(); return { title: '', pick: null, toast: '', left: null, nobutton: true }; }
  const [pop] = await Promise.all([c.waitForEvent('page'), page.locator('#mh-route a').first().click()]);
  await pop.waitForLoadState('load');
  if (setup.after) { await pop.evaluate(setup.after); await pop.reload(); }
  await pop.waitForTimeout(700);
  const v = await pop.evaluate(() => ({ title: (document.getElementById('f_title') || {}).value || '', pick: (function(){ var k=document.querySelector('#kinds .kind.on'); if(!k) return null; var t=k.textContent.trim(); return ({'물품 구입':'purchase','Purchase':'purchase','지출 정산':'expense','Expense':'expense','휴가 신청':'leave','Time off':'leave','일반 문서':'doc','Document':'doc'})[t]||t; })(), toast: (document.getElementById('toast') || {}).textContent || '', left: localStorage.getItem('mangoi_work_prefill_v1') }));
  await c.close();
  return v;
}
let v = await prefillThen('잉크 ₱500 사야 함', { workUser: 'mgr_karl' });
ok('다른 계정이면 안 채움', !v.title.includes('잉크'), JSON.stringify(v));
// ⚠️ 첫 로딩이 넘김 내용을 «이미 쓰고 지웠으므로» 고쳐 넣지 말고 «통째로 새로» 써야 한다
//    (처음엔 남은 것을 고쳐 넣어 빈 객체가 되어 «15분 검사를 지워도 통과» 했다 — 변이시험 실측)
const PF = (extra) => `localStorage.setItem('mangoi_work_prefill_v1', JSON.stringify(Object.assign({ type: 'purchase', user: 'mgr_maimai', title: '잉크 ₱500 사야 함', body: '잉크', amount: '500', cur: 'PHP', at: Date.now() }, ${JSON.stringify(extra)}, ${'at' in extra ? '{ at: Date.now() - ' + extra.at + ' }' : '{}'}))); localStorage.removeItem('mangoi_work_draft_v1');`;
v = await prefillThen('잉크 ₱500 사야 함', { after: PF({ at: 16 * 60000 }) });
ok('16분 지나면 안 채움', !v.title.includes('잉크'), JSON.stringify(v));
v = await prefillThen('잉크 ₱500 사야 함', { after: PF({ type: 'expense' }) });
ok('분류가 다르면 안 채움', !v.title.includes('잉크'), JSON.stringify(v));
// 짝 — 같은 방식으로 «14분 전·같은 분류» 를 새로 쓰면 채운다(위 두 검사가 헛돌지 않는다는 증거)
v = await prefillThen('잉크 ₱500 사야 함', { after: PF({ at: 14 * 60000 }) });
ok('14분 전이면 채움(짝)', v.title.includes('잉크'), JSON.stringify(v));
v = await prefillThen('잉크 ₱500 사야 함', { before: () => localStorage.setItem('mangoi_work_draft_v1', JSON.stringify({ key: 'k1', type: 'doc', cur: 'PHP', title: '쓰던 문서', body: '쓰던 내용', at: Date.now() })) });
ok('쓰던 초안이 있으면 덮지 않음', v.title === '쓰던 문서' && v.pick === 'doc', JSON.stringify(v));
// 화면 언어는 브라우저 설정을 따른다(헤드리스는 영어) — 두 말 모두 받는다
ok('그 사실을 알림', /쓰던 결재 초안이 있어|unfinished draft/.test(v.toast), JSON.stringify(v));
ok('매일보고 내용은 버리지 않고 남김(초안 닫고 다시 누를 수 있게)', !!v.left && v.left.includes('잉크'), JSON.stringify(v));

// ④ 좁은 화면 — 상자가 옆으로 넘치지 않는가
{
  const c = await newCtx();
  const { page } = await reviewPage(c, '프린터 잉크 ₱1,200 사야 함\n다음 주 금요일 연차 쓰고 싶습니다');
  for (const w of [390, 360, 320]) { await page.setViewportSize({ width: w, height: 900 }); await page.waitForTimeout(80); ok(`${w}px 가로 넘침 없음`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); }
  await c.close();
}

await browser.close(); server.close();
console.log(`브라우저 끝에서 끝까지: 문장 ${CASES.length}개 × (상자→새 탭→채움)`);
if (FAILS.length) console.log('FAIL:\n  ' + FAILS.slice(0, 30).join('\n  '));
console.log(`handover-route-flow-browser — PASS ${PASS} / FAIL ${FAIL}`);
process.exit(FAIL ? 1 : 0);
