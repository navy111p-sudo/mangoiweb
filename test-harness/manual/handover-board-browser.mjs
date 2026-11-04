// 👀 매일보고 «팀 보고판» 브라우저 검사 — 진짜 화면(daily-handover.html) + 진짜 서버 코드(daily-handover.ts)
//   API 는 page.route 로 가로채 «메모리 SQLite 위의 정본 핸들러» 에 그대로 넘긴다(스텁 숫자를 손으로 적지 않는다).
//   자동으로 안 돕니다 — 사람이 부릅니다:  PW_DIR=<playwright-core 설치 폴더> node test-harness/manual/handover-board-browser.mjs
//   스크린샷: 환경변수 SHOT_DIR 이 있으면 그 폴더에 PC·휴대폰 화면을 남긴다.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { requireBrowser } from './_pw.mjs';
import { ROOT, loadTypescript, makeHandoverEnv, seedBoardDay, DRAFT_SECRET } from '../helpers/handover-env.mjs';

const ts = loadTypescript();
if (!ts) { console.log('⏭  typescript 없음 — 건너뜀'); process.exit(0); }
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) { pass++; console.log('  ✅', name); } else { fail++; console.log('  ❌ FAIL', name, extra); } };

const PUB = join(ROOT, 'cloudflare-deploy/public');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  try { const p = decodeURIComponent(req.url.split('?')[0]); const data = await readFile(join(PUB, p)); res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); res.end(data); }
  catch { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(0, r));
const BASE = 'http://127.0.0.1:' + server.address().port;
const { chromium, exe } = requireBrowser();
const browser = await chromium.launch({ executablePath: exe });

async function openAs(who, { width = 1440, height = 1000 } = {}) {
  const t = makeHandoverEnv(ts);
  await seedBoardDay(t);
  // 서버 시계를 실제 시간과 함께 흐르게 — 10초 읽기 규칙을 브라우저 타이머와 같은 시계로 잰다.
  const base = t.clock.now, start = Date.now();
  Object.defineProperty(t.clock, 'now', { get: () => base + (Date.now() - start), set() {} });
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [], calls = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url());
    const m = url.pathname.match(/^\/api\/approval\/handover(\/.*)?$/);
    if (!m) return route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"Not Found"}' });
    const path = (m[1] || '') + url.search;
    calls.push(req.method() + ' ' + path);
    const res = await t.request(req.method(), path, req.method() === 'GET' ? undefined : JSON.parse(req.postData() || '{}'), who);
    route.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() });
  });
  await page.goto(BASE + '/daily-handover.html');
  return { page, t, errors, calls };
}
const items = page => page.$$eval('#mh-board .mhb-item', els => els.map(e => ({ state: e.dataset.state, name: e.querySelector('.mhb-who strong').textContent,
  tag: e.querySelector('.mhb-tag').textContent, tone: e.querySelector('.mhb-tag').dataset.tone })));

console.log('① 대표님(admin) — PC');
{
  const { page, errors, calls } = await openAs('admin');
  await page.waitForSelector('#mh-board:not([hidden]) .mhb-item');
  ok('보고판이 보인다', await page.isVisible('#mh-board'));
  const cells = await page.$$eval('#mhb-summary .mhb-cell', els => els.map(e => Number(e.querySelector('b').textContent)));
  ok('요약 = 작성 대상 6 · 제출 4 · 미제출 2 · 문제 1 · 미확인 3', cells.join() === '6,4,2,1,3', cells.join());
  const list = await items(page);
  ok('맨 위 = 이병엽 이사 · 빨간 «문제 · 미확인»', list[0].name === '이병엽 이사' && list[0].tone === 'bad' && list[0].state === 'issue', JSON.stringify(list[0]));
  ok('명단 + 명단 밖 제출자 = 7줄', list.length === 7, String(list.length));
  ok('⛔ 초안 본문이 화면 어디에도 없다', !(await page.textContent('body')).includes(DRAFT_SECRET));
  // 짝: 요약 칸의 숫자 = 눌렀을 때 보이는 줄 수(같은 판정에서 나와야 한다)
  for (let i = 0; i < 5; i++) {
    const cell = (await page.$$('#mhb-summary .mhb-cell'))[i];
    const n = Number(await cell.$eval('b', b => b.textContent));
    await cell.click();
    const shown = (await page.$$('#mh-board .mhb-item')).length;
    ok(`요약 칸 ${i + 1}: 숫자 ${n} = 보이는 줄 ${shown}`, n === shown);
    await (await page.$$('#mhb-summary .mhb-cell'))[i].click(); // 다시 누르면 전체
  }
  ok('다시 누르면 전체(7줄)', (await page.$$('#mh-board .mhb-item')).length === 7);
  await page.click('#mh-board .mhb-head[data-user="mgr_lby"]');
  const body = await page.textContent('#mh-board .mhb-body');
  ok('펼치면 본문·문제·남은 일·영업 활동이 보인다', body.includes('계약서 검토') && body.includes('결재로 올림') && body.includes('B학원 견적서') && body.includes('A학원'));
  ok('기한 지남 빨간 표시', await page.isVisible('#mh-board .mhb-body .mhb-late'));
  ok('펼친 줄 aria-expanded=true', (await page.getAttribute('#mh-board .mhb-head[data-user="mgr_lby"]', 'aria-expanded')) === 'true');
  if (process.env.SHOT_DIR) await page.screenshot({ path: join(process.env.SHOT_DIR, 'board-pc.png'), fullPage: false });
  const inboxBefore = calls.filter(c => c.startsWith('GET /inbox')).length;
  const ack = await page.$('#mh-board .mhb-body button.primary');
  ok('대표님은 10초 규칙 없이 바로 확인 버튼이 켜져 있다', !!ack && !(await ack.isDisabled()));
  await ack.click();
  await page.waitForFunction(() => [...document.querySelectorAll('#mh-board .mhb-item')].some(e => e.dataset.state === 'acknowledged' && e.textContent.includes('이병엽')));
  ok('확인 뒤 이병엽 이사 줄이 «확인됨» 으로 내려간다', (await items(page)).find(x => x.name === '이병엽 이사').state === 'acknowledged');
  await page.waitForTimeout(400);
  ok('받은 보고 목록도 따라서 다시 읽는다(이벤트)', calls.filter(c => c.startsWith('GET /inbox')).length > inboxBefore);
  await page.click('#mhb-prev');
  await page.waitForFunction(() => document.querySelector('#mhb-date').value === '2026-11-03');
  ok('‹ 전날 → 11-03 · 그날 낸 사람(장지웅) 줄', (await items(page)).some(x => x.name === '장지웅 부장' && x.state === 'awaiting'));
  ok('어제에서는 › 다음 날 버튼이 켜진다', !(await page.isDisabled('#mhb-next')));
  await page.click('#mhb-today');
  await page.waitForFunction(() => document.querySelector('#mhb-date').value === '2026-11-04');
  ok('오늘에서는 › 다음 날 버튼이 꺼진다(미래 없음)', await page.isDisabled('#mhb-next'));
  ok('콘솔 오류 0', errors.length === 0, errors.join(' | '));
  await page.close();
}

console.log('② 장지웅 부장(확인 의무자) — 10초 읽기');
{
  const { page, errors, calls } = await openAs('mgr_jjw');
  await page.waitForSelector('#mh-board:not([hidden]) .mhb-item');
  await page.click('#mh-board .mhb-head[data-user="mgr_melca"]');
  const btn = '#mh-board .mhb-body button.primary';
  await page.waitForSelector(btn);
  ok('펼치자마자 확인 버튼은 꺼져 있고 남은 초를 말한다', await page.isDisabled(btn) && /초 뒤/.test(await page.textContent(btn)));
  ok('연 순간을 서버에 남긴다(POST /opened)', calls.some(c => c.startsWith('POST /opened')));
  await page.waitForFunction(s => !document.querySelector(s).disabled, btn, { timeout: 15000 });
  await page.click(btn);
  await page.waitForFunction(() => [...document.querySelectorAll('#mh-board .mhb-item')].some(e => e.dataset.state === 'acknowledged' && e.textContent.includes('Melca')));
  ok('10초 뒤 확인이 서버에서 통과한다', true);
  ok('콘솔 오류 0', errors.length === 0, errors.join(' | '));
  await page.close();
}

console.log('③ 일반 직원 — 보고판 없음');
{
  const { page, errors, calls } = await openAs('staff_a');
  for (let i = 0; i < 50 && !calls.some(c => c.startsWith('GET /board')); i++) await page.waitForTimeout(100);
  await page.waitForTimeout(500); // 403 응답을 받아 처리할 시간
  ok('보고판 칸이 숨어 있다', !(await page.isVisible('#mh-board')));
  ok('서버가 403 으로 막았다', calls.some(c => c.startsWith('GET /board')));
  ok('콘솔 오류 0', errors.length === 0, errors.join(' | '));
  await page.close();
}

console.log('④ 대표님 — 휴대폰(390px)');
{
  const { page, errors } = await openAs('admin', { width: 390, height: 844 });
  await page.waitForSelector('#mh-board:not([hidden]) .mhb-item');
  await page.click('#mh-board .mhb-head[data-user="mgr_lby"]');
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok('가로로 넘치지 않는다', over <= 0, 'overflow ' + over + 'px');
  const tagBox = await page.$eval('#mh-board .mhb-item .mhb-tag', e => { const r = e.getBoundingClientRect(); return r.right <= window.innerWidth; });
  ok('상태 꼬리표가 화면 안에 있다', tagBox);
  // 「넘치지 않는다」만으로는 못 잡는다 — 꼬리표가 자리를 먹어 이름이 «한 글자씩» 꺾여도 넘침은 0 이었다(실제로 그렇게 나왔다).
  const nameFit = await page.$eval('#mh-board .mhb-item .mhb-who strong', e => ({ w: e.getBoundingClientRect().width, h: e.getBoundingClientRect().height,
    row: e.closest('.mhb-head').getBoundingClientRect().width, lh: parseFloat(getComputedStyle(e).lineHeight) || 26 }));
  ok('이름이 한 줄로 읽힌다(꼬리표에 밀려 꺾이지 않음)', nameFit.w >= nameFit.row * 0.6 && nameFit.h <= nameFit.lh * 1.5, JSON.stringify(nameFit));
  if (process.env.SHOT_DIR) await page.screenshot({ path: join(process.env.SHOT_DIR, 'board-mobile.png'), fullPage: false });
  ok('콘솔 오류 0', errors.length === 0, errors.join(' | '));
  await page.close();
}

await browser.close();
server.close();
console.log(`handover-board-browser — PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
