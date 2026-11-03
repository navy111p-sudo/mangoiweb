/*
 * 📒 결재함 회계장부 — 미리보기 · PDF · 엑셀 · 인쇄 (2026-11-02) — 화면에서 «실제로» 동작하는가
 *
 *   [짝으로 본다]
 *     처음엔 만드는 스크립트를 안 받는다 ↔ 누르면 한 번만 받는다
 *     미리보기가 열린다 ↔ 닫기·바깥 누르기·Esc 로 닫힌다
 *     엑셀을 누르면 .xlsx(zip) 가 내려온다 ↔ CSV 버튼은 예전 그대로 format=csv 로 간다(첫 .findcsv)
 *     PDF·인쇄는 숨은 iframe 에 «같은 문서» 를 넣고 인쇄를 부른다 ↔ 끝나면 그 iframe 이 남지 않는다
 *     한국어 ↔ 영어 라벨
 *
 *   돌리는 법:  PW_DIR=/tmp/pw node test-harness/manual/approval-ledger-export-browser.mjs
 *   ⚠️ 자동으로 안 돕니다(manual/ 규약). ⚠️ file:// 로 열면 /js/… 가 파일시스템 루트를 가리켜
 *      스크립트가 안 실립니다(CLAUDE.md 2장) — 그래서 public/ 을 작은 http 서버로 띄웁니다.
 */
import { requireBrowser } from './_pw.mjs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join, dirname, extname, normalize } from 'node:path';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const { chromium, exe } = requireBrowser();
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
const P = await import(pathToFileURL(join(ROOT, 'cloudflare-deploy', 'src', 'approval-policy.ts')).href);
const TYPES = P.TYPES.map((t) => ({ key: t.key, ko: t.ko, en: t.en, needs_amount: t.needsAmount, wants_file: t.wantsFile,
  requires_file: !!t.requiresFile, wants_dates: !!t.wantsDates, wants_category: !!t.wantsCategory, picks_period: t.key === 'hr' }));
const CATS = P.CATEGORIES.map((c) => ({ key: c.key, ko: c.ko, en: c.en, account: c.account }));
const STATUSES = P.STATUSES.map((s) => ({ key: s.key, ko: s.ko, en: s.en }));
const HOME = { ok: true, me: { username: 'mgr_jjw', name: '장지웅', is_exec: false, is_ph_manager: false, is_teacher: false },
  colleagues: [], my_delegate: null, can_approve: true, pending: 0, types: TYPES, categories: CATS, statuses: STATUSES,
  inbox: [], mine: [], reuse: [], urgent: [] };
// 서버 ledgerFrom 정본을 그대로 돌려 응답을 만든다(화면이 받는 모양을 손으로 적지 않는다)
const RAW = [
  { id: 1, status: 'approved', amount: 500,   currency: 'PHP', created_at: Date.parse('2026-10-03T10:00:00+09:00'), title: '잉크', requester_name: 'Karl', category_ko: '사무용품' },
  { id: 2, status: 'approved', amount: 12000.5, currency: 'PHP', created_at: Date.parse('2026-10-10T10:00:00+09:00'), title: '프린터 <b>', requester_name: 'Mai' },
  { id: 3, status: 'approved', amount: 30000, currency: 'KRW', created_at: Date.parse('2026-10-01T10:00:00+09:00'), title: '택배', requester_name: '정우영' },
  { id: 5, status: 'pending',  amount: 999,   currency: 'PHP', created_at: Date.parse('2026-10-21T10:00:00+09:00'), title: '대기' },
];
const L = P.ledgerFrom(RAW);
const LEDGER = { ok: true, ledger: L.rows, totals: L.totals, by_category: L.by_category, pending: L.pending, no_amount: L.no_amount,
  truncated: false, max: 2000, steps_missing: false, from: '2026-10-01', to: '2026-10-31',
  fx: { krw_per_php: 20.92, date: '2026-11-02', source: 'live' } };

const TYPES_MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const srv = createServer(async (req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const p = normalize(join(PUB, u === '/' ? '/work.html' : u));
  if (!p.startsWith(PUB)) { res.writeHead(403); return res.end(); }
  try { const b = await readFile(p); res.writeHead(200, { 'Content-Type': TYPES_MIME[extname(p)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
const BASE = 'http://127.0.0.1:' + srv.address().port;

let PASS = 0, FAIL = 0;
const check = (n, c, x) => { if (c) { PASS++; console.log('  OK   ' + n); } else { FAIL++; console.log('  FAIL ' + n + (x ? ' — ' + x : '')); } };

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
async function open(lang) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  const scriptReqs = []; page.on('request', (r) => { if (/work-ledger-export\.js/.test(r.url())) scriptReqs.push(r.url()); });
  await page.addInitScript(({ h, lg, lang }) => {
    try { localStorage.setItem('mangoi_lang', lang); } catch (e) {}
    window.__CALLS = []; window.__PRINTS = 0;
    const rf = window.fetch;
    window.fetch = function (u, o) {
      u = String(u); window.__CALLS.push(u);
      if (u.indexOf('/api/approval/home') === 0) return Promise.resolve(new Response(JSON.stringify(h), { status: 200 }));
      if (u.indexOf('/api/push/vapid-public-key') === 0) return Promise.resolve(new Response('{"ok":true,"key":""}', { status: 200 }));
      if (u.indexOf('view=ledger') >= 0) return Promise.resolve(new Response(JSON.stringify(lg), { status: 200 }));
      if (u.indexOf('/api/') === 0) return Promise.resolve(new Response('{"ok":true,"items":[],"has_more":false,"offset":0,"facets":{}}', { status: 200 }));
      return rf(u, o);
    };
    // 숨은 인쇄 iframe 의 print() 를 «센다» — 인쇄 창은 헤드리스에서 안 뜬다
    const ap = Element.prototype.appendChild;
    Element.prototype.appendChild = function (n) {
      const r = ap.call(this, n);
      if (n && n.tagName === 'IFRAME' && n.getAttribute('aria-hidden') === 'true') {
        n.addEventListener('load', () => { try { n.contentWindow.print = () => { window.__PRINTS++; }; } catch (e) {} }, { capture: true });
      }
      return r;
    };
  }, { h: HOME, lg: LEDGER, lang });
  await page.goto(BASE + '/work.html', { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('#ledResult .ledxbtn'), null, { timeout: 15000 }).catch(() => {});
  return { ctx, page, errors, scriptReqs };
}
const btn = (page, label) => page.locator('#ledResult .ledxbtn', { hasText: label }).first();

try {
  console.log('\n[1] 버튼이 보이고 처음엔 만드는 코드를 안 받는다');
  let { ctx, page, errors, scriptReqs } = await open('ko');
  const labels = await page.evaluate(() => Array.from(document.querySelectorAll('#ledResult .ledexp button')).map((b) => b.textContent.trim()));
  check('미리보기 · PDF · 엑셀 · 인쇄 · CSV 가 한 줄에 있다', JSON.stringify(labels) === JSON.stringify(['미리보기', 'PDF', '엑셀', '인쇄', 'CSV']), JSON.stringify(labels));
  check('«다운로드:» 이름표가 있다', /다운로드:/.test(await page.evaluate(() => document.querySelector('#ledResult .ledexp').textContent)));
  check('(짝) 아직 누르지 않았으니 work-ledger-export.js 를 안 받았다', scriptReqs.length === 0, JSON.stringify(scriptReqs));
  check('첫 .findcsv 는 CSV 버튼이다(기존 검사 규약)', (await page.evaluate(() => document.querySelector('#ledResult .findcsv').textContent.trim())) === 'CSV');

  console.log('\n[2] 미리보기');
  await btn(page, '미리보기').click();
  await page.waitForSelector('.ledxov iframe', { timeout: 10000 });
  await page.waitForTimeout(400);
  const pv = await page.evaluate(() => {
    const d = document.querySelector('.ledxov iframe').contentDocument;
    return { h1: (d.querySelector('h1') || {}).textContent, txt: d.body.innerText, b: !!d.querySelector('.sheet b, td b'), rows: d.querySelectorAll('section.np tbody tr').length };
  });
  check('문서 제목 «지출 회계장부»', /지출\s*회계장부/.test(pv.h1 || ''), pv.h1);
  check('통화별 합계가 따로 — ₱12,500.50 · ₩30,000', /₱12,500\.50/.test(pv.txt) && /₩30,000/.test(pv.txt), pv.txt.slice(0, 300));
  check('전표 장부 3줄(대기 건은 안 들어감)', pv.rows === 3, String(pv.rows));
  check('대기 1건을 «제외» 로 적는다', /결재 대기/.test(pv.txt));
  check('검증 완료 줄이 있다', /검증 완료/.test(pv.txt));
  check('참고 환산은 «장부 금액이 아님» 과 함께', /참고값/.test(pv.txt) && /장부 금액이 아닙니다/.test(pv.txt));
  check('제목의 <b> 는 글자로(태그 주입 없음)', !pv.b && /프린터 <b>/.test(pv.txt));
  check('스크립트는 한 번만 받았다', scriptReqs.length === 1, JSON.stringify(scriptReqs));

  console.log('\n[3] 미리보기 안에서 엑셀 → .xlsx 내려받기');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }),
    page.locator('.ledxov button', { hasText: '엑셀' }).click()]);
  const path = await dl.path();
  const head = path ? (await readFile(path)).subarray(0, 2).toString() : '';
  const size = path ? (await readFile(path)).length : 0;
  check('zip(PK) 이고 비어 있지 않다', head === 'PK' && size > 3000, head + ' ' + size);
  check('파일 이름이 .xlsx', /\.xlsx$/.test(dl.suggestedFilename()) || dl.suggestedFilename() === 'download', dl.suggestedFilename());

  console.log('\n[4] 닫기 · Esc · 바깥 누르기');
  await page.locator('.ledxov button', { hasText: '닫기' }).click();
  check('닫기로 닫힌다', !(await page.evaluate(() => !!document.querySelector('.ledxov'))));
  await btn(page, '미리보기').click(); await page.waitForSelector('.ledxov');
  await page.keyboard.press('Escape');
  check('Esc 로 닫힌다', !(await page.evaluate(() => !!document.querySelector('.ledxov'))));
  await btn(page, '미리보기').click(); await page.waitForSelector('.ledxov');
  await page.mouse.click(5, 5);
  check('바깥을 누르면 닫힌다', !(await page.evaluate(() => !!document.querySelector('.ledxov'))));

  console.log('\n[5] PDF · 인쇄 — 숨은 iframe 에 같은 문서를 넣고 인쇄를 부른다');
  await btn(page, 'PDF').click(); await page.waitForTimeout(800);
  const afterPdf = await page.evaluate(() => ({ p: window.__PRINTS, note: (document.querySelector('#ledResult .ledxnote') || {}).textContent || '' }));
  check('PDF → print() 1회', afterPdf.p === 1, String(afterPdf.p));
  check('PDF → «PDF로 저장» 안내 한 줄', /PDF로 저장/.test(afterPdf.note), afterPdf.note);
  await btn(page, '인쇄').click(); await page.waitForTimeout(800);
  check('인쇄 → print() 한 번 더', (await page.evaluate(() => window.__PRINTS)) === 2);
  check('CSV 는 예전 그대로 format=csv 주소', /format=csv/.test(await page.evaluate(() => { let u = ''; const o = window.ledCsv; return String(o); })));
  check('콘솔 오류 없음', errors.length === 0, errors.join(' | '));
  await ctx.close();

  console.log('\n[6] 영어');
  ({ ctx, page, errors, scriptReqs } = await open('en'));
  const enl = await page.evaluate(() => Array.from(document.querySelectorAll('#ledResult .ledexp button')).map((b) => b.textContent.trim()));
  check('Preview · PDF · Excel · Print · CSV', JSON.stringify(enl) === JSON.stringify(['Preview', 'PDF', 'Excel', 'Print', 'CSV']), JSON.stringify(enl));
  await btn(page, 'Preview').click(); await page.waitForSelector('.ledxov iframe'); await page.waitForTimeout(300);
  const enTxt = await page.evaluate(() => document.querySelector('.ledxov iframe').contentDocument.body.innerText);
  check('영어 문서(Expense Ledger · Verified)', /Expense Ledger/.test(enTxt) && /Verified/.test(enTxt), enTxt.slice(0, 200));
  check('콘솔 오류 없음(영어)', errors.length === 0, errors.join(' | '));
  await ctx.close();
} finally {
  await browser.close();
  srv.close();
}
console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`);
process.exitCode = FAIL ? 1 : 0;
