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

async function open({ token, booksStatus = 200, lang, booksBody, warmLang } = {}) {
  const c = await browser.newContext({ serviceWorkers: 'block' });
  await c.addInitScript(([t, l, w]) => { if (t) localStorage.setItem('mango_token', t); if (l) localStorage.setItem('mangoi_lang', l); if (w) localStorage.setItem('mangoi_warmup_lang', w); }, [token, lang, warmLang]);
  const log = { l1: [], warm: [], books: 0, failNext: 0, capNext: 0, nextQ: null, used: (booksBody && booksBody.used_today) || 0 };
  await c.route('**/*', async r => {
    const u = new URL(r.request().url());
    if (u.origin !== ORIGIN) return r.abort();
    if (!u.pathname.startsWith('/api/')) return r.continue();
    if (u.pathname === '/api/ai/eleader/l1/books') { log.books++; return booksStatus === 200 ? r.fulfill({ json: booksBody || { ok: true, books: BOOKS, daily_cap: 200, used_today: 0 } }) : r.fulfill({ status: booksStatus, json: { error: 'l1_not_enrolled' } }); }
    if (u.pathname === '/api/ai/eleader/l1/chat') { const b = JSON.parse(r.request().postData() || '{}'); log.l1.push({ b, auth: r.request().headers()['authorization'] }); if (log.failNext) { log.failNext--; return r.fulfill({ status: 503, json: { error: 'limit_unavailable' } }); } if (log.capNext) { log.capNext--; return r.fulfill({ status: 429, headers: { 'X-Eleader-Used': '200', 'X-Eleader-Cap': '200' }, json: { error: 'daily_cap_reached', cap: 200 } }); } const nq = log.nextQ; log.nextQ = null; const hd = { 'X-Eleader-Used': String(++log.used), 'X-Eleader-Cap': '200' }; if (nq != null) hd['X-Eleader-Q'] = String(nq); return r.fulfill({ headers: hd, json: { ai_response: 'Reply ' + log.l1.length, answer_chips: [] } }); }
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
/* 📞 일반 «시작» 은 얼굴 대화를 연다(2026-11-09 기본 화면) — 이 검사는 채팅 칸을 쓰므로 사람처럼 ✕ 로 닫는다 */
async function closeFt(p) {
  await p.waitForFunction(() => window.WarmupFaceTalk && WarmupFaceTalk.isActive(), null, { timeout: 4000 }).catch(() => {});
  const on = await p.evaluate(() => !!(window.WarmupFaceTalk && WarmupFaceTalk.isActive()));
  if (on) { await p.click('#ftk .fc-close').catch(() => p.evaluate(() => WarmupFaceTalk.exit())); await p.waitForTimeout(200); }
  return on;
}

try {
  // ① ed 계정: 책 고르기가 보이고 시작하면 l1 통로로 첫 질문을 부른다
  let { c, p, log, errors } = await open({ token: 'tok-ed' });
  await p.locator('#eleaderL1').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  ok('ed: Level 1 panel visible', await p.locator('#eleaderL1').isVisible());
  ok('ed: panel title', /엘리더잼 기본과정/.test(await p.locator('#eleaderL1').innerText()));
  ok('ed: 2 books in list', await p.locator('#eleaderL1 .l1-item').count() === 2);
  ok('ed: no level tabs when server sends no levels (old server)', await p.locator('#eleaderL1 .l1-tab').count() === 0);
  ok('ed: books request carries token', log.books === 1);
  ok('quota: panel says daily max and today count', /하루 최대 200번 대화할 수 있어요 · 오늘 0번 했어요/.test(await p.locator('#eleaderL1').innerText()), await p.locator('#eleaderL1').innerText());
  await p.click('#eleaderL1 .l1-item[data-id="books-v1-b02"]');
  await p.click('#eleaderL1 .l1-go');
  await p.waitForFunction(() => document.getElementById('wuSetup').hidden || getComputedStyle(document.getElementById('wuSetup')).display === 'none', null, { timeout: 5000 }).catch(() => {});
  await p.waitForTimeout(800);
  ok('start: setup closed', !(await p.locator('#wuSetup').isVisible()));
  ok('start: kickoff went to l1 chat', log.l1.length >= 1 && log.l1[0].b.kickoff === 1 && log.l1[0].b.eleader_q === 0 && log.l1[0].b.eleader_book === 'books-v1-b02', JSON.stringify(log.l1[0]?.b));
  ok('start: l1 request has bearer token', log.l1[0]?.auth === 'Bearer tok-ed');
  ok('start: client topic/textbook not sent', log.l1[0] && log.l1[0].b.lesson_topic === undefined && log.l1[0].b.textbook === undefined);
  ok('start: no free warmup chat call', log.warm.length === 0);
  ok('start: 엘리더잼 책으로 시작하면 얼굴 대화는 안 열린다(진행 막대가 채팅 쪽)', !(await p.evaluate(() => !!(window.WarmupFaceTalk && WarmupFaceTalk.isActive()))));
  ok('start: AI reply shown', /Reply 1/.test(await p.locator('#log').innerText()));
  ok('place B: bar is first in the answer area (.wg-composer), not inside the stage', await p.evaluate(() => { const b = document.getElementById('eleaderL1Bar'), c = document.querySelector('.wg-composer'), w = document.getElementById('wgWorkspace'); return !!(b && c && c.firstElementChild === b && !(w && w.contains(b))); }));
  ok('start: bar shows question 1/20', /질문 1 \/ 20/.test(await p.locator('#eleaderL1Bar').innerText()));
  ok('quota: bar shows today 1 / 200 (from server header)', /오늘 1 \/ 200/.test(await p.locator('#eleaderL1Bar').innerText()), await p.locator('#eleaderL1Bar').innerText());
  ok('start: level set to 1', await p.evaluate(() => window._warmLevel) === 1);
  // ② 답할 때마다 «답하는 문항» 번호가 따라간다
  await send(p, 'I have a dog');
  ok('turn1: answering q0', log.l1.at(-1).b.eleader_q === 0 && !log.l1.at(-1).b.kickoff);
  ok('turn1: bar 2/20', /질문 2 \/ 20/.test(await p.locator('#eleaderL1Bar').innerText()));
  ok('quota: bar follows server count 2 / 200', /오늘 2 \/ 200/.test(await p.locator('#eleaderL1Bar').innerText()));
  await send(p, 'Yes');
  ok('turn2: answering q1', log.l1.at(-1).b.eleader_q === 1);
  // ②-2 같은 말을 연달아 답해도(「Yes」) 다음 문항으로 간다 — 재시도로 오인하지 않는다
  await send(p, 'Yes');
  ok('same answer twice: answering q2', log.l1.at(-1).b.eleader_q === 2, JSON.stringify(log.l1.at(-1).b));
  // ②-3 실패하면 문항을 건너뛰지 않는다
  log.failNext = 1;
  await send(p, 'I like cats');
  ok('fail: was answering q3', log.l1.at(-1).b.eleader_q === 3);
  ok('fail: bar stays 4/20', /질문 4 \/ 20/.test(await p.locator('#eleaderL1Bar').innerText()));
  ok('fail 503: generic «no reply» line still shown (pair)', ((await p.locator('#log').innerText()).match(/답변을 받아오지 못했어요/g) || []).length === 1);
  await send(p, 'I like cats a lot');
  ok('after fail: answers the same q3 again', log.l1.at(-1).b.eleader_q === 3);
  ok('after fail: bar 5/20', /질문 5 \/ 20/.test(await p.locator('#eleaderL1Bar').innerText()));
  await p.click('#eleaderL1Bar button:has-text("힌트")');
  ok('hint: shows Korean hint of current question', /힌트 5/.test(await p.locator('#eleaderL1Bar').innerText()));
  // ③ 책 그만하기 → 자유 대화로 돌아감
  await p.click('#eleaderL1Bar button:has-text("책 그만하기")');
  await send(p, 'hello');
  ok('leave: free talk uses normal warmup chat', log.warm.length === 1 && log.l1.length === 6);
  ok('leave: bar removed', await p.locator('#eleaderL1Bar').count() === 0);
  ok('ed: no page errors', errors.length === 0, errors.join(' | '));
  await c.close();

  // ③-1b 📏 하루 상한(429) — «200번을 다 썼어요» 한 줄만. «답변을 받아오지 못했어요» 를 겹쳐 쓰지 않는다(2026-10-28 원장님 화면)
  ({ c, p, log, errors } = await open({ token: 'tok-ed' }));
  await p.locator('#eleaderL1').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  await p.click('#eleaderL1 .l1-go'); await p.waitForTimeout(800);
  log.capNext = 1;
  await send(p, 'Yes, I am happy.');
  { const t = await p.locator('#log').innerText();
    ok('cap 429: says 200 turns used up', /오늘 엘리더잼 대화 200번을 다 썼어요/.test(t), t.slice(-200));
    ok('cap 429: no duplicate «no reply» line', !/답변을 받아오지 못했어요/.test(t), t.slice(-200)); }
  ok('cap 429: bar shows 200 / 200', /오늘 200 \/ 200/.test(await p.locator('#eleaderL1Bar').innerText()));
  ok('cap 429: bar count marked low', await p.locator('#eleaderL1Bar .l1-quota.l1-low').count() === 1);
  ok('cap 429: question not advanced', /질문 2 \/ 20/.test(await p.locator('#eleaderL1Bar').innerText()) || /질문 1 \/ 20/.test(await p.locator('#eleaderL1Bar').innerText()));
  ok('cap 429: no page errors', errors.length === 0, errors.join(' | '));
  await c.close();

  // ③-1c 남은 횟수가 10번 이하면 책 고르는 칸의 문구도 주황(l1-low) — 넉넉하면 아니다(짝)
  ({ c, p } = await open({ token: 'tok-ed', booksBody: { ok: true, books: BOOKS, daily_cap: 200, used_today: 195 } }));
  await p.locator('#eleaderL1').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  ok('quota low: panel shows 195 used and is marked low', /오늘 195번 했어요/.test(await p.locator('#eleaderL1').innerText()) && await p.locator('#eleaderL1 .l1-quota.l1-low').count() === 1);
  await c.close();
  ({ c, p } = await open({ token: 'tok-ed', booksBody: { ok: true, books: BOOKS, daily_cap: 300, used_today: 12 } }));
  await p.locator('#eleaderL1').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  ok('quota: per-account cap (300) shown as given by server', /하루 최대 300번 대화할 수 있어요 · 오늘 12번 했어요/.test(await p.locator('#eleaderL1').innerText()) && await p.locator('#eleaderL1 .l1-quota.l1-low').count() === 0);
  await c.close();

  // ③-2 이미 자유 대화 중에 책을 고르면 첫 질문을 직접 부른다(첫 인사가 다시 안 돌기 때문)
  ({ c, p, log } = await open({ token: 'tok-ed' }));
  await p.locator('#eleaderL1').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  await p.click('#wusStart'); await p.waitForTimeout(500);
  ok('started: 자유 대화로 시작하면 얼굴 대화가 열린다(기본 화면)', await closeFt(p));
  await send(p, 'hi');
  ok('started: free talk first', log.warm.length >= 1 && log.l1.length === 0);
  await p.evaluate(() => window.openSetup(true)); await p.waitForTimeout(300);
  await p.click('#eleaderL1 .l1-go'); await p.waitForTimeout(800);
  ok('started: picking a book sends kickoff to l1', log.l1.length === 1 && log.l1[0].b.kickoff === 1 && log.l1[0].b.eleader_q === 0);
  ok('started: first book question reply shown', /Reply 1/.test(await p.locator('#log').innerText()));
  await c.close();

  // ③-2b 📗 20문항을 다 끝낸 뒤 — 마지막 문항(19)을 되풀이해 보내지 않고 «다 했어요»(20)를 보낸다
  //      (2026-10-27 「great job 만 하고 질문을 더 안 해요」 — 19 를 다시 보내면 서버가 매 턴 마무리 인사만 했다)
  ({ c, p, log } = await open({ token: 'tok-ed' }));
  await p.locator('#eleaderL1').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  await p.click('#eleaderL1 .l1-go'); await p.waitForTimeout(800);
  for (let k = 0; k < 20; k++) await send(p, 'Answer number ' + (k + 1));
  ok('done: 20th answer was question 19', log.l1.at(-1).b.eleader_q === 19, JSON.stringify(log.l1.at(-1)?.b));
  ok('done: bar says all done', /다 했어요/.test(await p.locator('#eleaderL1Bar').innerText()));
  await send(p, 'Do you have more questions?');
  ok('done: next turn sends 20 (book done), not 19', log.l1.at(-1).b.eleader_q === 20, JSON.stringify(log.l1.at(-1)?.b));
  await send(p, 'I like dogs');
  ok('done: stays 20 on later turns', log.l1.at(-1).b.eleader_q === 20 && log.l1.at(-1).b.eleader_book === 'books-v1-b01');
  ok('done: still l1 route, not free warmup', log.warm.length === 0);
  await c.close();

  // ③-2c 🔁 같은 질문 두 번 금지(2026-10-28) — 서버가 «이미 다룬 문항» 을 건너뛰면(X-Eleader-Q) 진행 번호·힌트·다음 요청이 그 문항을 따라간다
  ({ c, p, log, errors } = await open({ token: 'tok-ed' }));
  await p.locator('#eleaderL1').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  log.nextQ = 2;   // 첫 인사에서 1·2번이 이미 다룬 것이라 3번(0부터 2)을 물었다
  await p.click('#eleaderL1 .l1-go'); await p.waitForTimeout(800);
  ok('skip: kickoff header → bar 3/20', /질문 3 \/ 20/.test(await p.locator('#eleaderL1Bar').innerText()), await p.locator('#eleaderL1Bar').innerText());
  await send(p, 'Yes');
  ok('skip: next answer is for q2', log.l1.at(-1).b.eleader_q === 2, JSON.stringify(log.l1.at(-1)?.b));
  ok('skip: no header → one step (4/20)', /질문 4 \/ 20/.test(await p.locator('#eleaderL1Bar').innerText()));
  log.nextQ = 6;   // 4번(0부터 3)에 답하는 턴 — 5·6번은 이미 다뤄 7번(0부터 6)을 물었다
  await send(p, 'It is small');
  ok('skip: was answering q3', log.l1.at(-1).b.eleader_q === 3);
  ok('skip: header → bar 7/20', /질문 7 \/ 20/.test(await p.locator('#eleaderL1Bar').innerText()), await p.locator('#eleaderL1Bar').innerText());
  await p.click('#eleaderL1Bar button:has-text("힌트")');
  ok('skip: hint follows the asked question (힌트 7)', /힌트 7/.test(await p.locator('#eleaderL1Bar').innerText()));
  await send(p, 'White');
  ok('skip: next answer is for q6', log.l1.at(-1).b.eleader_q === 6, JSON.stringify(log.l1.at(-1)?.b));
  log.nextQ = 1;   // 거꾸로 가는 헤더는 무시한다
  await send(p, 'Yes');
  ok('skip: backward header ignored (answering q7 → bar 9/20)', log.l1.at(-1).b.eleader_q === 7 && /질문 9 \/ 20/.test(await p.locator('#eleaderL1Bar').innerText()), await p.locator('#eleaderL1Bar').innerText());
  ok('skip: no page errors', errors.length === 0, errors.join(' | '));
  await c.close();

  // ③-3 서버가 200 이어도 ok:true 가 아니면 안 그린다
  ({ c, p } = await open({ token: 'tok-ed', booksBody: { ok: false, books: BOOKS } }));
  await p.waitForTimeout(600);
  ok('ok:false: panel hidden', !(await p.locator('#eleaderL1').isVisible()));
  await c.close();

  // ③-4 웜업을 중국어로 두었던 학생도 책은 영어로
  ({ c, p, log } = await open({ token: 'tok-ed', warmLang: 'zh' }));
  await p.locator('#eleaderL1').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  ok('zh: was Chinese before start', await p.evaluate(() => window.isZh && window.isZh()) === true);
  await p.click('#eleaderL1 .l1-go'); await p.waitForTimeout(800);
  ok('zh: start switches warmup to English', await p.evaluate(() => window.isZh()) === false);
  ok('zh: kickoff went to l1', log.l1.length >= 1 && log.l1[0].b.kickoff === 1);
  await c.close();

  // ④ 영어 화면
  ({ c, p } = await open({ token: 'tok-ed', lang: 'en' }));
  await p.locator('#eleaderL1').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  ok('en: panel in English', /Eleader Jam Basic Course/.test(await p.locator('#eleaderL1').innerText()));
  ok('en: daily limit in English', /You can talk up to 200 times a day · 0 used today/.test(await p.locator('#eleaderL1').innerText()));
  await c.close();

  // ⑤ 다른 학생(403)·비로그인 — 아무것도 안 보이고 예전 화면 그대로
  for (const [name, opt] of [['other student 403', { token: 'tok-kim', booksStatus: 403 }], ['logged out', {}]]) {
    ({ c, p, log, errors } = await open(opt));
    await p.waitForTimeout(600);
    ok(name + ': panel hidden', !(await p.locator('#eleaderL1').isVisible()));
    ok(name + ': start button still there', await p.locator('#wusStart').isVisible());
    await p.click('#wusStart'); await p.waitForTimeout(500);
    await closeFt(p);
    await send(p, 'hello');
    ok(name + ': uses normal warmup chat', log.warm.length >= 1 && log.l1.length === 0);
    ok(name + ': no page errors', errors.length === 0, errors.join(' | '));
    await c.close();
  }
  // ⑥ 📚 Level 2~5 캐피 주제(2026-11-02) — 서버가 levels 를 주면 탭·검색·목록으로 그리고, 주제 대화는 eleader_topic 만 싣는다
  {
    const require2 = createRequire(root + '/cloudflare-deploy/package.json');
    const { build } = require2('esbuild');
    const { tmpdir } = await import('node:os'); const { pathToFileURL } = await import('node:url');
    const outf = tmpdir() + '/eleader-capi-pub-' + process.pid + '.mjs';
    await build({ entryPoints: [root + '/cloudflare-deploy/src/eleader-capi-topics.ts'], bundle: true, platform: 'node', format: 'esm', outfile: outf, logLevel: 'silent' });
    const LEVELS = (await import(pathToFileURL(outf))).eleaderCapiPublic();
    const body = { ok: true, books: BOOKS, levels: LEVELS, daily_cap: 200, used_today: 0 };
    ({ c, p, log, errors } = await open({ token: 'tok-ed', booksBody: body }));
    await p.locator('#eleaderL1').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    ok('levels: 5 tabs (Level 1~5)', await p.locator('#eleaderL1 .l1-tab').count() === 5);
    { const t = await p.locator('#eleaderL1').innerText();   // 2026-11-03 — 기본과정에는 «Level 1» 을 안 붙인다(제목·탭)
      ok('levels: real header is «엘리더잼 기본과정» (no Level 1)', /엘리더잼 기본과정/.test(t) && !/엘리더잼 Level 1/.test(t));
      ok('levels: L1 tab is «Level 1 · 캐피 기본과정 (N)»', /(^|\n)Level 1 · 캐피 기본과정 \(\d+\)/.test(await p.locator('#eleaderL1 .l1-tabs').innerText())); }
    ok('levels: tab names', /Level 2 · 캐피 기본 레벨5 \(25\)/.test(await p.locator('#eleaderL1 .l1-tabs').innerText()) && /Level 5 · 캐피 심화3 \(30\)/.test(await p.locator('#eleaderL1 .l1-tabs').innerText()));
    await p.click('#eleaderL1 .l1-tab[data-lv="l3"]');
    ok('levels: L3 title', /엘리더잼 Level 3 캐피 심화1/.test(await p.locator('#eleaderL1 h3').innerText()));
    ok('levels: L3 shows 30 units', await p.locator('#eleaderL1 .l1-item').count() === 30 && /총 30단원/.test(await p.locator('#eleaderL1').innerText()));
    await p.fill('#eleaderL1 .l1-search', '길을');
    ok('search: filters to matching units', await p.locator('#eleaderL1 .l1-item').count() === 1 && /길을 잃어버린 경험/.test(await p.locator('#eleaderL1 .l1-list').innerText()));
    ok('search: input keeps focus while typing', await p.evaluate(() => document.activeElement && document.activeElement.classList.contains('l1-search')));
    await p.fill('#eleaderL1 .l1-search', 'zzzz');
    ok('search: empty result says so', /찾는 이름이 없어요/.test(await p.locator('#eleaderL1 .l1-list').innerText()));
    await p.fill('#eleaderL1 .l1-search', '');
    await p.click('#eleaderL1 .l1-item[data-id="c3-02"]');
    ok('pick: selected line shows topic', /고른 것: 방학에 여행 갔던 일/.test(await p.locator('#eleaderL1 .l1-pick').innerText()));
    ok('pick: start button says topic', /이 주제로 말하기 시작/.test(await p.locator('#eleaderL1 .l1-go').innerText()));
    await p.click('#eleaderL1 .l1-go'); await p.waitForTimeout(800);
    const k = log.l1[0]?.b || {};
    ok('topic: kickoff to l1 route with eleader_topic only', k.kickoff === 1 && k.eleader_topic === 'c3-02' && k.eleader_book === undefined && k.eleader_q === undefined, JSON.stringify(k));
    ok('topic: client topic/textbook not sent', k.lesson_topic === undefined && k.textbook === undefined);
    ok('place B: topic bar also above the input', await p.evaluate(() => { const b = document.getElementById('eleaderL1Bar'), c = document.querySelector('.wg-composer'), w = document.getElementById('wgWorkspace'); return !!(b && c && c.firstElementChild === b && !(w && w.contains(b))); }));
    ok('topic: bar shows level and topic (no question count)', /Level 3 · 02단원 방학에 여행 갔던 일/.test(await p.locator('#eleaderL1Bar').innerText()) && !/질문 \d/.test(await p.locator('#eleaderL1Bar').innerText()));
    await send(p, 'I went to Jeju.');
    const t2 = log.l1.at(-1)?.b || {};
    ok('topic: next turn still eleader_topic · no question number', log.l1.length === 2 && t2.eleader_topic === 'c3-02' && t2.eleader_q === undefined && t2.kickoff === undefined);
    ok('topic: bar quota follows server (today 2 / 200)', /오늘 2 \/ 200/.test(await p.locator('#eleaderL1Bar').innerText()));
    await p.click('#eleaderL1Bar button:has-text("주제 안내")');
    ok('topic: tip shows English topic', /a trip you took during vacation/.test(await p.locator('#eleaderL1Bar').innerText()));
    await p.click('#eleaderL1Bar button:has-text("주제 그만하기")');
    await send(p, 'hello');
    ok('topic leave: free talk uses normal warmup chat', log.warm.length === 1 && log.l1.length === 2);
    ok('levels: no page errors', errors.length === 0, errors.join(' | '));
    await p.reload(); await p.locator('#eleaderL1').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    ok('remember: last level tab reopened after reload (L3)', await p.locator('#eleaderL1 .l1-tab[aria-selected="true"]').getAttribute('data-lv') === 'l3');
    await c.close();
    // Level 2 — 요점 원문이 목록에 보이고, 고른 탭은 다음에 열어도 그대로(localStorage)
    ({ c, p, log, errors } = await open({ token: 'tok-ed', booksBody: body }));
    await p.locator('#eleaderL1').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    await p.click('#eleaderL1 .l1-tab[data-lv="l2"]');
    ok('L2: 25 books with key questions', await p.locator('#eleaderL1 .l1-item').count() === 25 && /지진에 대해 듣거나 경험해 본 적이 있나\?/.test(await p.locator('#eleaderL1 .l1-list').innerText()));
    await c.close();
    // 영어 화면 — 탭·주제가 영어로
    ({ c, p } = await open({ token: 'tok-ed', lang: 'en', booksBody: body }));
    await p.locator('#eleaderL1').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    await p.click('#eleaderL1 .l1-tab[data-lv="l4"]');
    ok('en: level title and topics in English', /Eleader Jam Level 4 CAPI Advanced 2/.test(await p.locator('#eleaderL1 h3').innerText()) && /what you want to be in the future/.test(await p.locator('#eleaderL1 .l1-list').innerText()));
    ok('en: start button in English', /Start talking about this topic/.test(await p.locator('#eleaderL1 .l1-go').innerText()));
    // 폰 폭 — 가로로 넘치지 않는다(탭은 상자 안에서 옆으로 민다)
    await p.setViewportSize({ width: 390, height: 844 });
    await p.waitForTimeout(200);
    ok('mobile: panel does not overflow page width', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await c.close();
  }
} finally { await browser.close(); srv.kill(); }
console.log(`eleader-l1-browser — PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
