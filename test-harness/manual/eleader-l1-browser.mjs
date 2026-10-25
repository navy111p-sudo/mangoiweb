// 브라우저 검사 — A.i 말하기(warmup.html) + 엘리더잼 Level 1 (js/eleader-l1.js)
// ⚠️ 자동으로 안 돕니다(manual/). 사람이 부릅니다:  node test-harness/manual/eleader-l1-browser.mjs
// 외부 요청은 전부 막고 /api/* 는 가짜로 답합니다 — 실제 AI·음성 호출 0회.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')); }
const root = resolve(import.meta.dirname, '../..');
const PORT = 8933, ORIGIN = 'http://127.0.0.1:' + PORT;
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: root + '/cloudflare-deploy/public', stdio: 'ignore' });
await new Promise(r => setTimeout(r, 900));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) pass++; else { fail++; console.log('❌ FAIL', n, x); } };
const BOOKS = [1, 2].map(n => ({ id: 'books-v1-b0' + n, title: '0' + n + '권 · 시험 책 ' + n, book: n,
  questions: Array.from({ length: 20 }, (_, i) => ({ question: `Book ${n} question ${i + 1}?`, hint: `힌트 ${i + 1}`, model: `Answer ${i + 1}.` })) }));
const browser = await chromium.launch({ headless: true });

async function open({ token, booksStatus = 200, lang, booksBody } = {}) {
  const c = await browser.newContext({ serviceWorkers: 'block' });
  await c.addInitScript(([t, l]) => { if (t) localStorage.setItem('mango_token', t); if (l) localStorage.setItem('mangoi_lang', l); }, [token, lang]);
  const log = { l1: [], warm: [], books: 0 };
  await c.route('**/*', async r => {
    const u = new URL(r.request().url());
    if (u.origin !== ORIGIN) return r.abort();
    if (!u.pathname.startsWith('/api/')) return r.continue();
    if (u.pathname === '/api/ai/eleader/l1/books') { log.books++; return booksStatus === 200 ? r.fulfill({ json: booksBody || { ok: true, books: BOOKS, daily_cap: 120, used_today: 0 } }) : r.fulfill({ status: booksStatus, json: { error: 'l1_not_enrolled' } }); }
    if (u.pathname === '/api/ai/eleader/l1/chat') { const b = JSON.parse(r.request().postData() || '{}'); log.l1.push({ b, auth: r.request().headers()['authorization'] }); return r.fulfill({ json: { ai_response: 'Reply ' + log.l1.length, answer_chips: [] } }); }
    if (u.pathname === '/api/warmup/chat') { log.warm.push(JSON.parse(r.request().postData() || '{}')); return r.fulfill({ json: { ai_response: 'free reply', answer_chips: [] } }); }
    return r.fulfill({ status: 404, json: { error: 'test_only' } });
  });
  const p = await c.newPage();
  const errors = []; p.on('pageerror', e => errors.push(String(e)));
  await p.goto(ORIGIN + '/warmup.html?setup=1');
  await p.locator('#wuSetup').waitFor({ state: 'visible' });
  return { c, p, log, errors };
}
async function send(p, text) { await p.fill('#inp', text); await p.click('#sendBtn'); await p.waitForTimeout(400); }

try {
  // ① ed 계정: 책 고르기가 보이고 시작하면 l1 통로로 첫 질문을 부른다
  let { c, p, log, errors } = await open({ token: 'tok-ed' });
  await p.locator('#eleaderL1').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  ok('ed: Level 1 panel visible', await p.locator('#eleaderL1').isVisible());
  ok('ed: panel title', /엘리더잼 Level 1 기본과정/.test(await p.locator('#eleaderL1').innerText()));
  ok('ed: 2 books in select', await p.locator('#eleaderL1Book option').count() === 2);
  ok('ed: books request carries token', log.books === 1);
  await p.selectOption('#eleaderL1Book', 'books-v1-b02');
  await p.click('#eleaderL1 .l1-go');
  await p.waitForFunction(() => document.getElementById('wuSetup').hidden || getComputedStyle(document.getElementById('wuSetup')).display === 'none', null, { timeout: 5000 }).catch(() => {});
  await p.waitForTimeout(800);
  ok('start: setup closed', !(await p.locator('#wuSetup').isVisible()));
  ok('start: kickoff went to l1 chat', log.l1.length >= 1 && log.l1[0].b.kickoff === 1 && log.l1[0].b.eleader_q === 0 && log.l1[0].b.eleader_book === 'books-v1-b02', JSON.stringify(log.l1[0]?.b));
  ok('start: l1 request has bearer token', log.l1[0]?.auth === 'Bearer tok-ed');
  ok('start: client topic/textbook not sent', log.l1[0] && log.l1[0].b.lesson_topic === undefined && log.l1[0].b.textbook === undefined);
  ok('start: no free warmup chat call', log.warm.length === 0);
  ok('start: AI reply shown', /Reply 1/.test(await p.locator('#log').innerText()));
  ok('start: bar shows question 1/20', /질문 1 \/ 20/.test(await p.locator('#eleaderL1Bar').innerText()));
  ok('start: level set to 1', await p.evaluate(() => window._warmLevel) === 1);
  // ② 답할 때마다 «답하는 문항» 번호가 따라간다
  await send(p, 'I have a dog');
  ok('turn1: answering q0', log.l1.at(-1).b.eleader_q === 0 && !log.l1.at(-1).b.kickoff);
  ok('turn1: bar 2/20', /질문 2 \/ 20/.test(await p.locator('#eleaderL1Bar').innerText()));
  await send(p, 'Yes');
  ok('turn2: answering q1', log.l1.at(-1).b.eleader_q === 1);
  await p.click('#eleaderL1Bar button:has-text("힌트")');
  ok('hint: shows Korean hint of current question', /힌트 3/.test(await p.locator('#eleaderL1Bar').innerText()));
  // ③ 책 그만하기 → 자유 대화로 돌아감
  await p.click('#eleaderL1Bar button:has-text("책 그만하기")');
  await send(p, 'hello');
  ok('leave: free talk uses normal warmup chat', log.warm.length === 1 && log.l1.length === 3);
  ok('leave: bar removed', await p.locator('#eleaderL1Bar').count() === 0);
  ok('ed: no page errors', errors.length === 0, errors.join(' | '));
  await c.close();

  // ③-2 이미 자유 대화 중에 책을 고르면 첫 질문을 직접 부른다(첫 인사가 다시 안 돌기 때문)
  ({ c, p, log } = await open({ token: 'tok-ed' }));
  await p.locator('#eleaderL1').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  await p.click('#wusStart'); await p.waitForTimeout(500);
  await send(p, 'hi');
  ok('started: free talk first', log.warm.length >= 1 && log.l1.length === 0);
  await p.evaluate(() => window.openSetup(true)); await p.waitForTimeout(300);
  await p.click('#eleaderL1 .l1-go'); await p.waitForTimeout(800);
  ok('started: picking a book sends kickoff to l1', log.l1.length === 1 && log.l1[0].b.kickoff === 1 && log.l1[0].b.eleader_q === 0);
  ok('started: first book question reply shown', /Reply 1/.test(await p.locator('#log').innerText()));
  await c.close();

  // ③-3 서버가 200 이어도 ok:true 가 아니면 안 그린다
  ({ c, p } = await open({ token: 'tok-ed', booksBody: { ok: false, books: BOOKS } }));
  await p.waitForTimeout(600);
  ok('ok:false: panel hidden', !(await p.locator('#eleaderL1').isVisible()));
  await c.close();

  // ④ 영어 화면
  ({ c, p } = await open({ token: 'tok-ed', lang: 'en' }));
  await p.locator('#eleaderL1').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  ok('en: panel in English', /Eleader Jam Level 1 Basic Course/.test(await p.locator('#eleaderL1').innerText()));
  await c.close();

  // ⑤ 다른 학생(403)·비로그인 — 아무것도 안 보이고 예전 화면 그대로
  for (const [name, opt] of [['other student 403', { token: 'tok-kim', booksStatus: 403 }], ['logged out', {}]]) {
    ({ c, p, log, errors } = await open(opt));
    await p.waitForTimeout(600);
    ok(name + ': panel hidden', !(await p.locator('#eleaderL1').isVisible()));
    ok(name + ': start button still there', await p.locator('#wusStart').isVisible());
    await p.click('#wusStart'); await p.waitForTimeout(500);
    await send(p, 'hello');
    ok(name + ': uses normal warmup chat', log.warm.length >= 1 && log.l1.length === 0);
    ok(name + ': no page errors', errors.length === 0, errors.join(' | '));
    await c.close();
  }
} finally { await browser.close(); srv.kill(); }
console.log(`eleader-l1-browser — PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
