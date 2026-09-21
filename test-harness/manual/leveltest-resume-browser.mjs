// -*- coding: utf-8 -*-
/* ⏸ AI 자동 진단 «중간 멈춤 · 이어서 하기» 브라우저 검사 (사람이 부른다)
 *
 *   발단(2026-09-21 제보): 「24문항 중 14문항(약 7분) 풀고 전화를 받고 돌아오니
 *   처음부터 다시 시작해야 됨. 중간 멈춤 기능이 있었으면 함.」
 *   원인은 진행 상태(answers·idx)가 화면의 JS 변수에만 있던 것 — 폰은 전화·앱 전환만으로도
 *   탭을 버리므로 «되돌아오면 초기화» 가 된다. 에러가 안 나서 하니스도 전부 초록이었다.
 *
 *   여기서 재는 것 (문자열 검사로는 못 보는 «실제로 이어지는가»):
 *     ① 14문항 풀고 «탭이 버려진 뒤»(reload) 돌아오면 이어서 하기가 14/24 로 뜬다
 *     ② 이어서 하기 → 1번이 아니라 15번 문항부터
 *     ③ 끝까지 풀어 제출하면 앞의 14문항 답이 «그대로» 실려 간다 (id 로 복구)
 *     ④ 🔴 A번(인덱스 0)을 고른 문항이 «안 푼 것» 으로 세지 않는다 (falsy 함정)
 *     ⑤ ⏸ 잠시 멈추기 → 멈춤 화면 → 이어서 풀기 로 되돌아온다
 *     ⑥ 처음부터 를 고르면 확인을 거쳐 실제로 0/24 가 된다
 *     ⑦ 채점이 실패해도 답이 남아, 이어서 하기가 문항을 다시 풀리지 않고 채점만 다시 한다
 *     ⑧ 하루 지난 저장은 이어서 하기를 내주지 않는다
 *     ⑨ 문항은행이 바뀌어 사라진 id 의 답은 버린다 (엉뚱한 문항에 붙지 않게)
 *
 *   준비: mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
 *   실행: PW_DIR=/tmp/pw node test-harness/manual/leveltest-resume-browser.mjs
 *   ⚠️ 자동 게이트에서 안 돈다(manual/) — 이 화면의 저장·복구를 건드리면 사람이 부른다. */
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireBrowser } from './_pw.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const PUBLIC = resolve(__dir, '../../cloudflare-deploy/public');
const PORT = 8971;
const BASE = `http://127.0.0.1:${PORT}`;
let PASS = 0, FAIL = 0; const FAILS = [];
const check = (name, ok, extra) => {
  if (ok) PASS++; else { FAIL++; FAILS.push(name + (extra ? ` — ${extra}` : '')); }
  console.log(`  ${ok ? '✅' : '❌'} ${name}${!ok && extra ? ` — ${extra}` : ''}`);
};

async function serve() {
  try { const r = await fetch(BASE + '/level-test-ai.html', { method: 'HEAD' }); if (r.ok) return null; } catch { /* 아직 */ }
  const p = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: PUBLIC, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    try { const r = await fetch(BASE + '/level-test-ai.html', { method: 'HEAD' }); if (r.ok) return p; } catch { /* 아직 */ }
  }
  throw new Error('정적 서버가 안 뜸');
}

/* 서버 CEFR_BANK 와 같은 모양 — 레벨당 4문항 24개 */
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const QUESTIONS = [];
for (const lv of LEVELS) for (let i = 1; i <= 4; i++) {
  QUESTIONS.push({ id: `${lv.toLowerCase()}_${i}`, cefr: lv, q: `${lv} question ${i}?`, choices: ['alpha', 'beta', 'gamma', 'delta'] });
}

/* 제출된 body 를 모아 둔다 — 「이어서 한 뒤 앞 문항 답이 실려 가는가」의 유일한 증거 */
let posted = [];

async function open(browser, opt = {}) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 880 } });
  const page = await ctx.newPage();
  await page.route('**/api/**', async (route) => {
    const u = route.request().url();
    const j = (o, s = 200) => route.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(o) });
    if (u.includes('/api/leveltest/questions')) {
      const qs = opt.bankShift ? QUESTIONS.slice(2) : QUESTIONS;   // ⑨ 은행이 바뀐 상황
      return j({ ok: true, questions: qs, total: qs.length });
    }
    if (u.includes('/api/leveltest/diagnose')) {
      try { posted.push(JSON.parse(route.request().postData() || '{}')); } catch { posted.push(null); }
      if (opt.gradeFail) return j({ error: 'boom' }, 500);
      return j({ ok: true, level: 'B1', ai_score: 61, correct: 14, total: 24, breakdown: [], placement: { level: 'B1', applied: true } });
    }
    return j({ ok: true });
  });
  await page.goto(BASE + '/level-test-ai.html?_nc=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#ai-start');
  return { ctx, page };
}

/* 보이는 카드 이름 + 진행 표시 */
const snap = () => {
  const vis = (id) => { const e = document.getElementById(id); return !!e && !e.classList.contains('hidden'); };
  return {
    start: vis('start-card'), quiz: vis('quiz-card'), pause: vis('pause-card'),
    grading: vis('grading-card'), result: vis('result-card'), resume: vis('resume-box'),
    prog: (document.getElementById('ai-progtxt') || {}).textContent || '',
    qtext: (document.getElementById('ai-qtext') || {}).textContent || '',
    rsm: (document.getElementById('rsm-txt') || {}).textContent || '',
    rsub: (document.getElementById('rsm-sub') || {}).textContent || '',
    startBtn: (document.getElementById('ai-start') || {}).textContent || '',
    pauseCnt: (document.getElementById('pause-cnt') || {}).textContent || '',
    saved: (function(){ try { return JSON.parse(localStorage.getItem('mangoi_leveltest_ai_progress') || 'null'); } catch(e){ return null; } })(),
  };
};

/* n 문항을 답한다. pick(i) 가 고를 보기 번호를 정한다 */
async function answerN(page, n, pick = () => 1) {
  for (let i = 0; i < n; i++) {
    const before = await page.evaluate(() => (document.getElementById('ai-progtxt') || {}).textContent);
    await page.locator('#ai-choices button').nth(pick(i)).click();
    await page.waitForFunction(
      (b) => { const e = document.getElementById('ai-progtxt'); const q = document.getElementById('quiz-card');
               return !e || e.textContent !== b || (q && q.classList.contains('hidden')); },
      before, { timeout: 5000 },
    ).catch(() => {});
  }
}

(async () => {
  const { chromium, exe } = requireBrowser();
  const srv = await serve();
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  try {
    // ═══ ①②③④ 제보 그대로 재현 ═══════════════════════════════════════════
    console.log('\n[ ①②③④ 14문항 풀고 탭이 버려진 뒤 돌아오기 (제보 재현) ]');
    let { ctx, page } = await open(browser);
    let m = await page.evaluate(snap);
    check('첫 진입엔 이어서 하기가 없다', !m.resume && m.start, JSON.stringify([m.resume, m.start]));

    await page.fill('#ai-name', '김망고');
    await page.click('#ai-start');
    await page.waitForSelector('#quiz-card:not(.hidden)');
    /* ④ 첫 문항은 일부러 A번(인덱스 0) — falsy 라 «안 푼 것» 으로 세면 여기서 드러난다 */
    await answerN(page, 14, (i) => (i === 0 ? 0 : (i % 4)));
    m = await page.evaluate(snap);
    check('14문항을 풀어 15번 문항에 서 있다', m.prog === '15 / 24', m.prog);
    check('저장본이 14문항으로 적혀 있다', !!m.saved && m.saved.done === 14, JSON.stringify(m.saved && { done: m.saved.done, total: m.saved.total }));
    check('④ A번(0)을 고른 첫 문항도 «푼 것» 으로 세어졌다', !!m.saved && m.saved.answers.a1_1 === 0, JSON.stringify(m.saved && m.saved.answers.a1_1));
    check('이름도 함께 저장된다', !!m.saved && m.saved.name === '김망고', m.saved && m.saved.name);

    // 📞 전화 — 탭이 버려지고 다시 열린다
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#ai-start');
    m = await page.evaluate(snap);
    check('① 돌아오면 이어서 하기가 보인다', m.resume, JSON.stringify([m.resume, m.start]));
    check('① «14 / 24 문항» 이라고 말한다', /14 \/ 24/.test(m.rsm), m.rsm);
    check('① 언제 저장한 것인지 말한다', /오늘 (오전|오후) \d{1,2}:\d{2}/.test(m.rsub), m.rsub);
    check('① 이름이 되살아난다', (await page.inputValue('#ai-name')) === '김망고');
    check('① 큰 버튼이 «처음부터 새로 하기» 로 바뀐다(눌러서 날리지 않게)', /처음부터/.test(m.startBtn), m.startBtn);

    await page.click('#rsm-go');
    await page.waitForSelector('#quiz-card:not(.hidden)');
    m = await page.evaluate(snap);
    check('② 1번이 아니라 15번 문항부터 이어서 푼다', m.prog === '15 / 24', m.prog);
    check('② 그 문항은 B2 4번째(= 15번째) 문항이다', /B2 question 3\?/.test(m.qtext), m.qtext);

    posted = [];
    await answerN(page, 10, () => 2);
    await page.waitForSelector('#result-card:not(.hidden)', { timeout: 8000 });
    const body = posted[0] || {};
    check('③ 제출 payload 에 24문항 답이 전부 실렸다', Object.keys(body.answers || {}).length === 24, String(Object.keys(body.answers || {}).length));
    check('③ 전화 «전» 에 푼 14문항 답이 그대로다(a1_1=0 · a1_2=1)',
      body.answers && body.answers.a1_1 === 0 && body.answers.a1_2 === 1,
      JSON.stringify(body.answers && { a1_1: body.answers.a1_1, a1_2: body.answers.a1_2 }));
    check('③ 전화 «뒤» 에 푼 10문항 답도 실렸다(c2_4=2)', body.answers && body.answers.c2_4 === 2, JSON.stringify(body.answers && body.answers.c2_4));
    check('③ 이름·uid·token 계약은 그대로다', body.student_name === '김망고' && 'student_uid' in body && 'token' in body, JSON.stringify(Object.keys(body)));
    m = await page.evaluate(snap);
    check('채점이 끝나면 저장본을 지운다(끝난 시험을 또 이어 주지 않게)', m.saved === null, JSON.stringify(m.saved));
    await ctx.close();

    // ═══ ⑤ 잠시 멈추기 ═════════════════════════════════════════════════════
    console.log('\n[ ⑤ ⏸ 잠시 멈추기 ]');
    ({ ctx, page } = await open(browser));
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('#ai-start');
    await page.fill('#ai-name', '이하늘');
    await page.click('#ai-start'); await page.waitForSelector('#quiz-card:not(.hidden)');
    await answerN(page, 5, () => 1);
    check('멈춤 버튼이 화면에 보인다', await page.isVisible('#ai-pause'));
    check('«자동 저장» 안내가 화면에 있다(나가도 되는 줄 알게)',
      /자동으로 저장/.test(await page.textContent('#quiz-card')));
    await page.click('#ai-pause');
    await page.waitForSelector('#pause-card:not(.hidden)');
    m = await page.evaluate(snap);
    check('⑤ 멈춤 화면이 «5 / 24 문항» 이라고 말한다', m.pauseCnt === '5 / 24 문항', m.pauseCnt);
    check('⑤ 문항 화면은 감춰진다', !m.quiz);
    check('⑤ 나가는 길(레벨테스트로)이 있다', await page.isVisible('#pause-card a.home'));
    await page.click('#pause-go');
    await page.waitForSelector('#quiz-card:not(.hidden)');
    m = await page.evaluate(snap);
    check('⑤ 이어서 풀기를 누르면 6번 문항으로 돌아온다', m.prog === '6 / 24', m.prog);
    await ctx.close();

    // ═══ ⑥ 처음부터 ════════════════════════════════════════════════════════
    console.log('\n[ ⑥ 처음부터 새로 하기 ]');
    /* ⚠ playwright 는 컨텍스트마다 localStorage 가 따로다 — 앞 절의 저장본은 여기 없다.
       (처음에 «앞 절에서 이어진다» 고 썼다가 실제로 FAIL 이 났다.) 직접 심어 둔다. */
    ({ ctx, page } = await open(browser));
    await page.evaluate(() => {
      localStorage.setItem('mangoi_leveltest_ai_progress', JSON.stringify({
        v: 1, name: '이하늘', answers: { a1_1: 1, a1_2: 1, a1_3: 1, a1_4: 1, a2_1: 1 }, done: 5, total: 24, ts: Date.now() - 60000 }));
    });
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('#ai-start');
    m = await page.evaluate(snap);
    check('⑥ 5문항짜리 저장본이 이어서 하기로 뜬다', m.resume && /5 \/ 24/.test(m.rsm), m.rsm);
    page.once('dialog', (d) => d.accept());
    await page.click('#rsm-fresh');
    await page.waitForFunction(() => document.getElementById('resume-box').classList.contains('hidden'));
    m = await page.evaluate(snap);
    check('⑥ 확인을 누르면 저장본이 사라진다', m.saved === null);
    check('⑥ 큰 버튼도 «진단 시작하기» 로 되돌아온다', /진단 시작하기/.test(m.startBtn), m.startBtn);
    await ctx.close();

    // ═══ ⑦ 채점 실패 ═══════════════════════════════════════════════════════
    console.log('\n[ ⑦ 채점이 실패해도 24문항이 날아가지 않는다 ]');
    ({ ctx, page } = await open(browser, { gradeFail: true }));
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('#ai-start');
    await page.fill('#ai-name', '최윤서');
    await page.click('#ai-start'); await page.waitForSelector('#quiz-card:not(.hidden)');
    page.once('dialog', (d) => d.accept());
    await answerN(page, 24, () => 1);
    await page.waitForSelector('#start-card:not(.hidden)', { timeout: 8000 });
    m = await page.evaluate(snap);
    check('⑦ 실패해도 24문항이 저장돼 있다', !!m.saved && m.saved.done === 24, JSON.stringify(m.saved && m.saved.done));
    check('⑦ 이어서 하기가 «24 / 24» 로 뜬다', m.resume && /24 \/ 24/.test(m.rsm), m.rsm);
    posted = [];
    await page.click('#rsm-go');
    await page.waitForSelector('#grading-card:not(.hidden)', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(600);
    m = await page.evaluate(snap);
    check('⑦ 문항을 다시 풀리지 않고 채점만 다시 한다', !m.quiz && posted.length === 1, JSON.stringify([m.quiz, posted.length]));
    await ctx.close();

    // ═══ ⑧ 하루 지난 저장 ══════════════════════════════════════════════════
    console.log('\n[ ⑧ 하루 지난 저장은 이어 주지 않는다 ]');
    ({ ctx, page } = await open(browser));
    await page.evaluate(() => {
      localStorage.setItem('mangoi_leveltest_ai_progress', JSON.stringify({
        v: 1, name: '옛날사람', answers: { a1_1: 1 }, done: 1, total: 24, ts: Date.now() - 25 * 3600 * 1000 }));
    });
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('#ai-start');
    m = await page.evaluate(snap);
    check('⑧ 25시간 전 저장은 이어서 하기를 안 내준다', !m.resume);
    check('⑧ 그 저장본은 정리된다(계속 남아 헷갈리지 않게)', m.saved === null);
    await ctx.close();

    // ═══ ⑨ 문항은행이 바뀐 경우 ════════════════════════════════════════════
    console.log('\n[ ⑨ 문항은행이 바뀌면 사라진 id 의 답은 버린다 ]');
    ({ ctx, page } = await open(browser, { bankShift: true }));
    await page.evaluate(() => {
      localStorage.setItem('mangoi_leveltest_ai_progress', JSON.stringify({
        v: 1, name: '박지호', answers: { a1_1: 3, a1_2: 3, a1_3: 2, a1_4: 1 }, done: 4, total: 24, ts: Date.now() - 60000 }));
    });
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('#ai-start');
    await page.click('#rsm-go');
    await page.waitForSelector('#quiz-card:not(.hidden)');
    m = await page.evaluate(snap);
    check('⑨ 없어진 문항(a1_1·a1_2)의 답은 버리고 남은 2문항만 이어받는다', m.prog === '3 / 22', m.prog);
    check('⑨ 그 자리는 a1_3·a1_4 뒤 문항이다', /A2 question 1\?/.test(m.qtext), m.qtext);
    await ctx.close();

    if (process.env.SHOT) { await page.screenshot({ path: process.env.SHOT }); console.log('  📸 ' + process.env.SHOT); }
  } finally {
    await browser.close();
    if (srv) srv.kill();
  }
  console.log('\n════════════════════════════════════════');
  console.log(`  ${FAIL ? '⚠' : '✅'} 실패 ${FAIL}건 / 통과 ${PASS}건`);
  if (FAIL) { FAILS.forEach((f) => console.log('   ❌ ' + f)); process.exitCode = 1; }
  console.log('════════════════════════════════════════\n');
})().catch((e) => { console.error('💥', e); process.exitCode = 1; });
