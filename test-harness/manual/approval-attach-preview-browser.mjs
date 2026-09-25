/*
 * 📎 결재 «첨부 보기» 를 화면 안에서 연다 — 실제 브라우저로 확인 (2026-09-25)
 *
 *   [왜 만들었나]
 *     사장님 「첨부보기를 누르면 꼭 다운을 받아서 봐야 하는데 불편 — 바로 여기서 보이게,
 *     거기서 다운로드 버튼」. 그전에는 «첨부 보기» 가 서버의 attachment 주소라 누르면 곧바로
 *     파일이 내려받아졌다.
 *
 *   [무엇을 보나 — 짝으로]
 *     ① PDF 를 누르면 미리보기 창이 뜨고 pdf.js 가 «페이지 수만큼» 캔버스를 실제로 칠한다
 *        (빈 캔버스가 아닌가까지) — 그리고 그 사이 파일이 «내려받아지지 않는다».
 *     ② 창 안의 «다운로드» 버튼은 예전 주소(attachment)이고 누르면 실제로 내려받아진다.
 *     ③ 사진도 창 안에 뜬다.
 *     ④ 짝 — 모르는 형식(file_kind 없음)은 가로채지 않고 예전처럼 내려받는다.
 *     ⑤ 못 불러오면 «다운로드로 받으세요» 라고 말한다(빈 창으로 두지 않는다).
 *     ⑥ 닫기·Esc·바깥 누르기로 닫힌다. 창이 맨 위다(elementFromPoint).
 *     ⑦ 폰 폭(390)에서도 PDF 가 그려진다 — 안드로이드 크롬은 iframe 에 PDF 를 못 띄워서
 *        pdf.js 로 그리는 방식을 골랐다.
 *
 *   ⚠️ work.html 이 /js/pdf.min.js 를 절대경로로 부르므로 file:// 로 열면 안 된다(CLAUDE.md 2장).
 *      public/ 를 작은 HTTP 서버로 띄운다.
 *
 *   돌리는 법:  PW_DIR=/tmp/pw node test-harness/manual/approval-attach-preview-browser.mjs
 *   ⚠️ 자동으로 안 돕니다(manual/ 규약) — 결재 카드의 첨부를 건드리면 사람이 부르세요.
 */
import { requireBrowser } from './_pw.mjs';
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const { chromium, exe } = requireBrowser();
const PUB = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cloudflare-deploy', 'public');
const SRC = process.env.WORK_SRC || join(PUB, 'work.html');   // 변이시험용 사본을 가리킬 수 있게

/* ── 진짜 PDF 두 쪽 — xref 오프셋까지 맞춘다 ─────────────────────────── */
function makePdf() {
  const objs = [];
  objs.push('<< /Type /Catalog /Pages 2 0 R >>');
  objs.push('<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>');
  objs.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 5 0 R /Resources << /Font << /F1 7 0 R >> >> >>');
  objs.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 6 0 R /Resources << /Font << /F1 7 0 R >> >> >>');
  const c1 = '0 0 0 rg 20 20 260 160 re f BT /F1 24 Tf 1 1 1 rg 40 90 Td (PAGE ONE) Tj ET';
  const c2 = '0 0 0.6 rg 20 20 260 160 re f BT /F1 24 Tf 1 1 1 rg 40 90 Td (PAGE TWO) Tj ET';
  objs.push(`<< /Length ${c1.length} >>\nstream\n${c1}\nendstream`);
  objs.push(`<< /Length ${c2.length} >>\nstream\n${c2}\nendstream`);
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let out = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offs.forEach((o) => { out += String(o).padStart(10, '0') + ' 00000 n \n'; });
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
/* ── 진짜 PNG 한 장(40×30, 빨강) ───────────────────────────────────────── */
function makePng() {
  const w = 40, h = 30;
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw[y * (w * 3 + 1) + 1 + x * 3] = 220;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const PDF = makePdf(), PNG = makePng();

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname === '/work' || u.pathname === '/work.html' ? null : join(PUB, decodeURIComponent(u.pathname));
  const f = p === null ? SRC : p;
  if (!f.startsWith(PUB) && f !== SRC) { res.writeHead(403); return res.end(); }
  if (!existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port;

const now = Date.now();
function row(o) {
  return Object.assign({
    req_type: 'doc', type_ko: '일반 문서', type_en: 'Document',
    requester_username: 'mgr_melca', requester_name: 'Melca', currency: 'PHP', status: 'pending',
    created_at: now - 3600000, stage_due_at: now + 86400000, stage_seq: 1, stage_total: 1,
    escalated: false, flags: [], has_file: true, steps: [{ seq: 1, role: 'staff', status: 'active' }],
  }, o);
}
const HOME = {
  ok: true,
  me: { username: 'mgr_jjw', name: '장지웅', is_exec: false, is_ph_manager: false, is_teacher: false },
  colleagues: [], my_delegate: null, can_approve: true, pending: 4,
  types: [{ key: 'doc', ko: '일반 문서', en: 'Document' }],
  inbox: [
    row({ id: 61, title: 'Melca Loan Request', file_kind: 'pdf', file_name: 'Melca_Loan_Request.pdf' }),
    row({ id: 62, title: 'Receipt photo', file_kind: 'image', file_name: 'receipt.png' }),
    row({ id: 63, title: 'Unknown kind', file_kind: null, file_name: 'odd.bin' }),
    row({ id: 64, title: 'Broken file', file_kind: 'pdf', file_name: 'broken.pdf' }),
  ],
  mine: [], urgent: [], ack_pending: [], reuse: [],
};

let PASS = 0, FAIL = 0;
const check = (n, c, x) => { if (c) { PASS++; console.log('  OK   ' + n); } else { FAIL++; console.log('  FAIL ' + n + (x ? ' — ' + x : '')); } };

async function run(width) {
  console.log(`\n══ 폭 ${width}px ══`);
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  let downloads = [];
  page.on('download', (d) => downloads.push(d.url()));
  const fileHits = [];

  await ctx.addInitScript(() => { try { localStorage.setItem('mangoi_lang', 'ko'); } catch (e) {} });
  // ⚠️ route 는 «나중에 등록한 것» 이 이긴다(CLAUDE.md) — 포괄 먼저, 구체적인 것 뒤에.
  await page.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
  await page.route('**/api/approval/home**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(HOME) }));
  await page.route(/\/api\/approval\/requests\/\d+\/file/, (r) => {
    const u = new URL(r.request().url());
    const id = Number(u.pathname.split('/')[4]);
    fileHits.push(u.pathname + u.search);
    if (id === 64) return r.fulfill({ status: 500, body: 'boom' });
    const body = id === 62 ? PNG : id === 61 ? PDF : Buffer.from('odd');
    const ct = id === 62 ? 'image/png' : id === 61 ? 'application/pdf' : 'application/octet-stream';
    // 서버와 같게 — PDF·모르는 것은 늘 attachment, 사진은 ?inline=1 일 때만 inline
    const inline = id === 62 && u.searchParams.get('inline') === '1';
    return r.fulfill({ status: 200, body, headers: { 'Content-Type': ct,
      'Content-Disposition': (inline ? 'inline' : 'attachment') + "; filename*=UTF-8''f" } });
  });

  await page.goto(BASE + '/work', { waitUntil: 'load' });
  await page.waitForTimeout(700);

  console.log('[0] 전제');
  const drawn = await page.evaluate(() => [61, 62, 63, 64].filter((n) => !!document.getElementById('req-' + n)).length);
  check('네 건이 그려졌다', drawn === 4, '실제 ' + drawn);
  const lnk = (id) => `#req-${id} a.lnk`;
  check('PDF 줄의 «첨부 보기» 는 여전히 예전 주소를 href 로 가진다(JS 가 죽으면 예전처럼)',
    (await page.getAttribute(lnk(61), 'href')) === '/api/approval/requests/61/file');

  console.log('[1] PDF 를 누르면 창 안에서 그린다');
  const before = page.url();
  downloads = [];
  try { await page.click(lnk(61), { timeout: 3000 }); } catch (e) { check('PDF 링크를 눌렀다', false, e.message); }
  /* ⚠️ «캔버스가 두 장 생겼다» ≠ «두 장 다 그려졌다» — 둘째 쪽이 그리는 중일 수 있다. 칠해질 때까지 기다린다.
     ⚠️ 빈 캔버스는 getImageData 가 (0,0,0,0) 이라 «어둡다» 로 세면 안 된다 — 알파까지 본다(변이시험이 잡은 구멍). */
  const INK = (c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let dark = 0; for (let i = 0; i < d.length; i += 4 * 97) if (d[i + 3] > 200 && d[i] + d[i + 1] + d[i + 2] < 200) dark++; return dark; };
  await page.waitForFunction((src) => { const f = new Function('return ' + src)();
    const cs = document.querySelectorAll('#attBody canvas'); return cs.length >= 2 && Array.from(cs).every((c) => f(c) > 20); },
    INK.toString(), { timeout: 15000 }).catch(() => {});
  const st = await page.evaluate((src) => { const ink = new Function('return ' + src)();
    const ov = document.getElementById('attov');
    const cs = Array.from(document.querySelectorAll('#attBody canvas'));
    const inked = cs.map(ink);
    return { on: !!ov && ov.classList.contains('on'), n: cs.length, inked,
      name: (document.getElementById('attName') || {}).textContent,
      dl: (document.getElementById('attDl') || {}).getAttribute && document.getElementById('attDl').getAttribute('href'),
      dlTxt: (document.getElementById('attDl') || {}).textContent,
      maxW: Math.max(0, ...cs.map((c) => c.getBoundingClientRect().right)), vw: innerWidth };
  }, INK.toString());
  check('미리보기 창이 열렸다', st.on);
  check('두 쪽이 캔버스 두 장으로 그려졌다', st.n === 2, '실제 ' + st.n);
  check('캔버스가 비어 있지 않다(실제로 칠해졌다)', st.inked.length === 2 && st.inked.every((x) => x > 20), JSON.stringify(st.inked));
  check('캔버스가 화면 폭을 넘지 않는다', st.maxW <= st.vw + 1, st.maxW + ' > ' + st.vw);
  check('파일 이름을 보여 준다', st.name === 'Melca_Loan_Request.pdf', st.name);
  check('그 사이 내려받기가 일어나지 않았다', downloads.length === 0, downloads.join(','));
  check('화면을 떠나지 않았다', page.url() === before);
  check('창 안 «다운로드» 버튼이 예전 주소를 가리킨다', st.dl === '/api/approval/requests/61/file' && st.dlTxt === '다운로드', st.dl + ' ' + st.dlTxt);
  const top = await page.evaluate(() => { const b = document.getElementById('attDl').getBoundingClientRect();
    const el = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return el && el.id; });
  check('다운로드 버튼이 맨 위다(눌린다)', top === 'attDl', '맨 위: ' + top);

  console.log('[2] 다운로드 버튼은 실제로 내려받는다');
  const dlP = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
  await page.click('#attDl').catch(() => {});
  const d = await dlP;
  check('누르면 파일이 내려받아진다', !!d && /\/api\/approval\/requests\/61\/file$/.test(d.url()), d ? d.url() : '없음');
  check('다운로드 뒤에도 화면은 그대로다', page.url() === before);

  console.log('[3] 닫기');
  await page.click('#attX').catch(() => {});
  check('«닫기» 로 닫힌다', !(await page.evaluate(() => document.getElementById('attov').classList.contains('on'))));
  check('닫으면 캔버스를 비운다', (await page.evaluate(() => document.querySelectorAll('#attBody canvas').length)) === 0);
  check('닫으면 스크롤 잠금을 푼다', (await page.evaluate(() => document.documentElement.style.overflow)) === '');

  console.log('[4] 사진도 창 안에');
  await page.click(lnk(62)).catch(() => {});
  await page.waitForFunction(() => { const i = document.querySelector('#attBody img'); return i && i.naturalWidth > 0; }, null, { timeout: 5000 }).catch(() => {});
  const img = await page.evaluate(() => { const i = document.querySelector('#attBody img'); return i ? { w: i.naturalWidth, src: i.getAttribute('src') } : null; });
  check('사진이 그려졌다', !!img && img.w === 40, JSON.stringify(img));
  check('사진은 ?inline=1 로 받는다', !!img && /\/62\/file\?inline=1$/.test(img.src));
  await page.keyboard.press('Escape');
  check('Esc 로 닫힌다', !(await page.evaluate(() => document.getElementById('attov').classList.contains('on'))));

  console.log('[5] 짝 — 모르는 형식은 가로채지 않는다');
  check('모르는 형식에는 미리보기 표식이 없다', (await page.getAttribute(lnk(63), 'data-att')) === null);
  const dl63 = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
  await page.click(lnk(63)).catch(() => {});
  const d63 = await dl63;
  check('예전처럼 내려받는다', !!d63);
  check('창은 안 열린다', !(await page.evaluate(() => { const o = document.getElementById('attov'); return !!o && o.classList.contains('on'); })));

  console.log('[6] 못 불러오면 말한다');
  await page.click(lnk(64)).catch(() => {});
  await page.waitForFunction(() => /다운로드/.test((document.getElementById('attBody') || {}).textContent || ''), null, { timeout: 15000 }).catch(() => {});
  const msg = await page.evaluate(() => document.getElementById('attBody').textContent);
  check('실패 안내가 뜬다(빈 창 아님)', /보여 드리지 못했습니다/.test(msg), msg);
  check('실패해도 다운로드 버튼은 남는다', (await page.getAttribute('#attDl', 'href')) === '/api/approval/requests/64/file');
  await page.mouse.click(3, 3);
  check('바깥을 누르면 닫힌다', !(await page.evaluate(() => document.getElementById('attov').classList.contains('on'))));

  check('페이지 오류 없음', errors.length === 0, errors.join(' | '));
  await browser.close();
}

try { await run(1280); await run(390); }
finally { server.close(); }
console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`);
process.exit(FAIL ? 1 : 0);
