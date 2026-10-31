// -*- coding: utf-8 -*-
// 🕐 «오전/오후» 사고 — 실제 브라우저로 누르는 검사 (2026-10-30)
//
//   왜 — 2026-10-29 매니저가 저녁 7:40 수업을 «7:40» 으로 등록해 20회가 오전 07:40 이 됐고, 그중 한 회를
//   «연기» 한 뒤 «🔄 Change from now on» 을 눌렀더니 «Class not found» 만 떴다(서버는 연기된 줄을 일부러 거절).
//   그래서 이번 수리는 «화면이 무엇을 보여 주고 무엇을 보내는가» 다 — 문자열 하니스로는 원리상 못 본다.
//
//   무엇을 누르나 (진짜 js/class-move-modal.js 를 진짜 Chromium 에 싣고, 서버만 가짜로 둔다)
//     S1 연기된 줄(영어) — 안내 상자 · «앞으로 계속» 버튼 대신 안내 · «완전히 연기» 없음 · «지정한 날짜로» 가 눌려 있음
//        · 강사 목록을 «묻지 않음» · 19:40 칩 → «= 7:40 PM» · 메모·확인창에 «19:40 (7:40 PM)»·뒤집힘 경고·«연기 풀림»
//        · 보내는 요청이 change / 19:40 / 그 날짜
//     S2 열린 줄(영어) — «앞으로 계속» 미리보기·확인창에 «19:40 (7:40 PM)» · 보내는 요청이 series-move apply / 19:40
//     S3 한국어 — «= 오후 7:40» · «오전·오후만 바뀝니다»
//     S4 짝 — 20:00 은 뒤집힘 경고를 안 띄운다
//     S5 수백 번 — 무작위 시각 300개를 시각 칸에 넣어 «= h:mm AM/PM» 과 뒤집힘 경고가 정확한지
//     S6 수강 등록 시간 칸 미리보기 — 진짜 입력칸에 300개를 쳐서, 브라우저 정규식 엔진이 Node 와 같은 답을 내는지
//
//   실행:  node test-harness/manual/move-modal-ampm-browser.mjs   (자동으로 안 돕니다, 사람이 부릅니다)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireBrowser } from './_pw.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..', '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
const core = readFileSync(join(PUB, 'js', 'adm-core.js'), 'utf8');

let pass = 0, fail = 0;
const fails = [];
const ok = (c, m, extra) => {
  if (c) { pass++; console.log('  ✅ ' + m); }
  else { fail++; fails.push(m); console.log('  ❌ ' + m + (extra !== undefined ? '  →  ' + JSON.stringify(extra).slice(0, 400) : '')); }
};
function fnAt(s, anchor) {
  const i = s.indexOf(anchor); if (i < 0) return '';
  let paren = 0, start = -1;
  for (let j = i; j < s.length; j++) { const c = s[j]; if (c === '(') paren++; else if (c === ')') paren--; else if (c === '{' && paren === 0) { start = j; break; } }
  let d = 0;
  for (let k = start; k < s.length; k++) { if (s[k] === '{') d++; else if (s[k] === '}') { d--; if (!d) return s.slice(i, k + 1); } }
  return '';
}
const enrollFns = [fnAt(core, 'function _enNormTimeText(raw)'), fnAt(core, 'function _enTimeHint(raw)'), fnAt(core, 'function _enPaintTimeHint(tr)')].join('\n');

const TEST_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body>
<table><tr id="enrow"><td class="en-c en-c-time"><input class="en-row-time" type="text"><div class="en-time-hint" style="display:none"></div></td></tr></table>
<script>
window.__reqs = []; window.__confirms = [];
window.confirm = function (t) { window.__confirms.push(String(t)); return true; };
window.fetch = async function (url, opt) {
  url = String(url); var body = null; try { body = opt && opt.body ? JSON.parse(opt.body) : null; } catch (e) {}
  window.__reqs.push({ url: url, method: (opt && opt.method) || 'GET', body: body });
  var j;
  if (url.indexOf('/move-candidates') >= 0) {
    var q = new URL(url, location.href).searchParams;
    j = { ok: true, date: q.get('date'), time: q.get('time'), current: { id: 8, name: 'KAYE', free: true }, candidates: [], teacher_change_ok: true, busy_count: 0 };
  } else if (url.indexOf('/series-move') >= 0) {
    var items = []; for (var i = 0; i < 18; i++) { var d = new Date(Date.UTC(2026, 10, 5 + 7 * i)).toISOString().slice(0, 10); items.push({ id: 4043 + i, from_date: d, from_time: '07:40', to_date: d, to_time: (body && body.new_time) || '19:40' }); }
    j = body && body.apply ? { ok: true, applied: true, moved: 18, count: 18, items: items } : { ok: true, dry_run: true, count: 18, items: items, teacher: { changed: false } };
  } else if (/schedule-requests\\/decide/.test(url)) { j = { ok: true, applied: 'moved' }; }
  else if (/schedule-requests/.test(url)) { j = { ok: true, id: 77 }; }
  else { j = { ok: false, error: 'not_stubbed' }; }
  return { ok: true, status: 200, json: async function () { return j; } };
};
</script>
<script src="/js/class-move-modal.js?v=11"></script>
<script>${enrollFns}
var __tr = document.getElementById('enrow');
__tr.querySelector('.en-row-time').addEventListener('input', function () { _enPaintTimeHint(__tr); });
window.__enHint = _enTimeHint;
</script></body></html>`;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer(async (req, res) => {
  const p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/__ampm_test.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(TEST_PAGE); return; }
  try { const data = await readFile(join(PUB, p)); res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); res.end(data); }
  catch { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port;

const { chromium, exe } = requireBrowser();
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(BASE + '/__ampm_test.html');
await page.waitForFunction(() => !!window.mangoiMoveModal);

const KST = (d, hm) => Date.parse(d + 'T' + hm + ':00+09:00');
async function open(row, en) {
  await page.evaluate(({ row, en }) => {
    window.__reqs = []; window.__confirms = [];
    window.mangoiMoveModal.close();
    window.mangoiMoveModal.open(row, { day: '2026-11-05', isEn: function () { return en; }, canCancel: true, me: { name: 'Maimai' }, onClose: function () {} });
  }, { row, en });
  await page.waitForSelector('#tc-move-modal');
}
const txt = sel => page.evaluate(s => { const e = document.querySelector(s); return e ? e.textContent : null; }, sel);
const visible = sel => page.evaluate(s => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none' && !e.hidden; }, sel);
const exists = sel => page.evaluate(s => !!document.querySelector(s), sel);
const sleep = ms => new Promise(r => setTimeout(r, ms));

console.log('════════ S1 연기된 줄 (영어) ════════');
const ppRow = { schedule_id: 4042, start_ts: KST('2026-11-05', '07:40'), start_time: '07:40', student_name: 'Dongbowon', student_uid: 'bellet00', teacher_name: 'KAYE', can_move: true, postponed: true };
await open(ppRow, true);
ok(/already postponed/.test(await txt('#tc-mv-pp') || ''), '안내 상자 «already postponed» 가 보인다');
ok(!(await exists('[data-mv-mode="series"]')) && await exists('#tc-mv-series-off'), '«🔄 Change from now on» 버튼 대신 «after rebooking» 안내(서버가 거절할 버튼을 안 둔다)');
ok(!(await exists('[data-mv-sub="hold"]')), '«Postpone (no new date)» 를 또 두지 않는다');
ok(await page.evaluate(() => document.querySelector('[data-mv-sub="date"]').getAttribute('aria-pressed')) === 'true', '«Postpone to a date»(=다시 잡기)가 처음부터 눌려 있다');
ok(await visible('#tc-mv-when'), '날짜·시각 고르는 칸이 바로 보인다');
await sleep(600);
ok(/not shown for a postponed class/.test(await txt('#tc-mv-teachers') || ''), '강사 칸이 «연기된 수업이라 미리 안 보여 준다 — Apply 때 서버가 확인» 이라고 말한다');
ok(!(await page.evaluate(() => window.__reqs.some(r => r.url.indexOf('move-candidates') >= 0))), '강사 목록을 서버에 묻지 않는다(서버가 일부러 거절하는 요청)');
ok(await exists('#tc-mv-restore'), '본사 계정이면 «↩ Restore» 도 그대로 있다(#1889·#1890 보존)');
ok((await txt('#tc-mv-time12')) === '= 7:40 AM', '처음 시각 옆 표시 «= 7:40 AM»', await txt('#tc-mv-time12'));
await page.click('[data-mv-hm="19:40"]');
await sleep(450);
ok((await txt('#tc-mv-time12')) === '= 7:40 PM', '19:40 칩을 누르면 «= 7:40 PM»', await txt('#tc-mv-time12'));
const note1 = await txt('#tc-mv-note');
ok(/07:40 \(7:40 AM\)/.test(note1) && /19:40 \(7:40 PM\)/.test(note1), '메모가 «07:40 (7:40 AM) → 19:40 (7:40 PM)» 로 말한다', note1);
ok(/Only AM\/PM changes: 7:40 AM → 7:40 PM/.test(note1), '메모가 «오전·오후만 바뀜» 을 짚는다', note1);
await page.click('#tc-mv-go');
await page.waitForFunction(() => window.__reqs.some(r => /schedule-requests\/decide/.test(r.url)), null, { timeout: 5000 }).catch(() => {});
const c1 = await page.evaluate(() => window.__confirms.join('\n----\n'));
ok(/19:40 \(7:40 PM\)/.test(c1) && /Only AM\/PM changes/.test(c1) && /no longer postponed/.test(c1), '확인창: «19:40 (7:40 PM)» + 뒤집힘 경고 + «연기 풀림»', c1);
const r1 = await page.evaluate(() => window.__reqs.filter(r => r.method === 'POST'));
ok(r1.length === 2 && r1[0].body.request_type === 'change' && r1[0].body.new_time === '19:40' && r1[0].body.new_date === '2026-11-05' && r1[0].body.schedule_id === 4042,
  '보낸 요청: schedule-requests change · 2026-11-05 · 19:40 · 같은 수업 번호(4042)', r1);
ok(/schedule-requests\/decide/.test((r1[1] || {}).url || '') && r1[1].body.action === 'approve', '이어서 /decide approve', r1[1]);
ok(/Moved \(this class only\)/.test(await txt('#tc-mv-msg') || ''), '결과 문구 «Moved (this class only)»', await txt('#tc-mv-msg'));

console.log('\n════════ S2 열린 줄 «앞으로 계속» (영어) ════════');
const actRow = { schedule_id: 4043, start_ts: KST('2026-11-05', '07:40'), start_time: '07:40', student_name: 'Dongbowon', student_uid: 'bellet00', teacher_name: 'KAYE', can_move: true };
await open(actRow, true);
ok(await exists('[data-mv-mode="series"]') && !(await exists('#tc-mv-pp')) && await exists('[data-mv-sub="hold"]'), '짝: 열린 줄은 예전 그대로(앞으로 계속·완전히 연기 있음, 연기 안내 없음)');
await page.click('[data-mv-mode="series"]');
await page.click('[data-mv-hm="19:40"]');
await page.waitForFunction(() => /classes move/.test((document.getElementById('tc-mv-series') || {}).textContent || ''), null, { timeout: 5000 }).catch(() => {});
ok(/19:40 \(7:40 PM\)/.test(await txt('#tc-mv-series') || ''), '«앞으로 계속» 미리보기 줄마다 «19:40 (7:40 PM)»', await txt('#tc-mv-series'));
ok(/new time 19:40 \(7:40 PM\)/.test(await txt('#tc-mv-note') || '') && /Only AM\/PM changes/.test(await txt('#tc-mv-note') || ''), '메모: «new time 19:40 (7:40 PM)» + 뒤집힘 경고', await txt('#tc-mv-note'));
await sleep(500);
await page.click('#tc-mv-go');
await page.waitForFunction(() => window.__reqs.some(r => /series-move/.test(r.url) && r.body && r.body.apply === true), null, { timeout: 5000 }).catch(() => {});
const c2 = await page.evaluate(() => window.__confirms.join('\n----\n'));
ok(/Change from now on\?/.test(c2) && /19:40 \(7:40 PM\)/.test(c2) && /Only AM\/PM changes/.test(c2), '«앞으로 계속» 확인창: 새 시각 오전/오후 + 뒤집힘 경고', c2);
const ap = await page.evaluate(() => window.__reqs.filter(r => /series-move/.test(r.url) && r.body && r.body.apply === true));
ok(ap.length === 1 && ap[0].body.new_time === '19:40' && ap[0].body.schedule_id === 4043, '보낸 요청: series-move apply · 19:40 · 4043', ap);

console.log('\n════════ S3 한국어 · S4 짝(뒤집힘 아님) ════════');
await open(ppRow, false);
await page.click('[data-mv-hm="19:40"]');
await sleep(300);
ok((await txt('#tc-mv-time12')) === '= 오후 7:40', '한국어 «= 오후 7:40»', await txt('#tc-mv-time12'));
ok(/오전·오후만 바뀝니다: 오전 7:40 → 오후 7:40/.test(await txt('#tc-mv-note') || ''), '한국어 메모 «오전·오후만 바뀝니다»', await txt('#tc-mv-note'));
ok(/이미 연기된 수업/.test(await txt('#tc-mv-pp') || ''), '한국어 안내 상자 «이미 연기된 수업»');
await page.click('[data-mv-hm="20:00"]');
await sleep(300);
ok(!/오전·오후만/.test(await txt('#tc-mv-note') || '') && (await txt('#tc-mv-time12')) === '= 오후 8:00', '짝: 20:00 은 뒤집힘 경고 없음 · «= 오후 8:00»', await txt('#tc-mv-note'));

console.log('\n════════ S5 수백 번 — 무작위 시각 300개 (날짜 이동 모드) ════════');
await open(actRow, true);
await page.click('[data-mv-sub="date"]');
let x = 20261030 >>> 0;
const rnd = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
const cases = [];
for (let i = 0; i < 300; i++) { const h = Math.floor(rnd() * 24), m = i % 7 === 0 ? 40 : Math.floor(rnd() * 60); cases.push((h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m); }
const got = await page.evaluate((list) => list.map(function (v) {
  var el = document.getElementById('tc-mv-time'); el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  return { v: v, t12: document.getElementById('tc-mv-time12').textContent, note: document.getElementById('tc-mv-note').textContent };
}), cases);
let bad5 = [];
for (const g of got) {
  const h = Number(g.v.slice(0, 2)), m = g.v.slice(3);
  const want = '= ' + (((h % 12) || 12) + ':' + m + ' ' + (h < 12 ? 'AM' : 'PM'));
  const flipWant = m === '40' && h === 19;
  const flipGot = /Only AM\/PM changes/.test(g.note);
  if ((g.t12 !== want || flipGot !== flipWant || g.note.indexOf(g.v + ' (') < 0) && bad5.length < 5) bad5.push({ g, want, flipWant });
}
ok(bad5.length === 0, got.length + '개 시각 — 표시·메모·뒤집힘 경고가 전부 맞다', bad5);

console.log('\n════════ S6 수강 등록 시간 칸 — 진짜 입력칸에 쳐 보기 ════════');
await page.evaluate(() => window.mangoiMoveModal.close());
await page.fill('.en-row-time', '7:40');
ok(/7:40 AM \(07:40\)/.test(await txt('.en-time-hint')) && /MORNING/.test(await txt('.en-time-hint')), '«7:40» 을 치면 «7:40 AM (07:40) ⚠ MORNING …»', await txt('.en-time-hint'));
ok(await page.evaluate(() => getComputedStyle(document.querySelector('.en-time-hint')).backgroundColor) === 'rgb(254, 243, 199)', '그 줄이 노란 바탕(실제 계산된 색)');
await page.fill('.en-row-time', '7:40 PM');
ok(/→ 7:40 PM \(19:40\)/.test(await txt('.en-time-hint')) && !/MORNING/.test(await txt('.en-time-hint')), '«7:40 PM» → «7:40 PM (19:40)», 경고 없음', await txt('.en-time-hint'));
await page.fill('.en-row-time', '');
ok(!(await visible('.en-time-hint')), '빈 칸이면 미리보기가 사라진다');
/* 300개: 브라우저가 낸 해석 = Node 가 낸 해석 (정규식 엔진 차이 확인) */
const nodeHint = new Function(enrollFns + '\nreturn _enTimeHint;')();
const inputs = [];
const parts = ['7:40', '7:40 PM', '19:40', 'Mon 7:30, Wed 8 pm', '오후 7:40', 'Thu 7:40', '12:10 AM', '7pm', 'abc', 'Samuel 7:40', '7:30 PM 8:00 PM', 'Tues 6:20pm', '오전 9:00', '23:59', '0:05'];
for (let i = 0; i < 300; i++) inputs.push(parts[i % parts.length] + (i % 3 === 0 ? '' : i % 3 === 1 ? ' ' : ', Fri ' + (i % 12 + 1) + ':' + ((i * 7) % 60 < 10 ? '0' : '') + ((i * 7) % 60) + (i % 2 ? 'pm' : '')));
const bh = await page.evaluate((list) => list.map(t => JSON.stringify(window.__enHint(t))), inputs);
let bad6 = [];
inputs.forEach((t, i) => { const n = JSON.stringify(nodeHint(t)); if (n !== bh[i] && bad6.length < 5) bad6.push({ t, node: n, browser: bh[i] }); });
ok(bad6.length === 0, inputs.length + '개 입력 — 브라우저 해석 = Node 해석', bad6);

ok(errors.length === 0, '페이지 오류 0건', errors);

console.log('\n════════ S7 진짜 admin.html — 관리자 CSS·페인터 아래에서도 노란 경고가 보이는가 ════════');
/* 🪤 실제로 밟았다: 처음 클래스 이름 «en-row-time-hint» 가 옛 규칙 [id^="card-"] [class*="-row"] 에 걸려
   바탕이 덮이고 adm-s13 페인터가 흰색으로 다시 칠했다 — 빈 페이지 검사(S6)는 원리상 못 본다. API 는 가짜. */
const page2 = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const err2 = [];
page2.on('pageerror', e => err2.push(String(e).slice(0, 200)));
await page2.route('**/api/**', route => {
  const u = route.request().url();
  const j = /\/api\/admin\/me\b/.test(u) ? { ok: true, username: 'admin', name: 'Admin', role: 'admin', scope: { type: 'hq' } } : { ok: true, items: [], rows: [] };
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(j) });
});
await page2.goto(BASE + '/admin.html', { waitUntil: 'domcontentloaded' });
const ready = await page2.waitForFunction(() => typeof window._addEnrollmentRow === 'function' && typeof window._enPaintTimeHint === 'function', null, { timeout: 40000 }).then(() => true, () => false);
ok(ready, '(전제) 진짜 admin.html 에서 수강 등록 함수가 떴다');
if (ready) {
  const made = await page2.evaluate(() => {
    const tb = document.getElementById('en-multi-rows'); if (!tb) return false;
    window._addEnrollmentRow({});
    const tr = tb.querySelector('tr:last-child'); let d = tr;
    while (d) { if (d.tagName === 'DETAILS') d.open = true; d = d.parentElement; }
    return !!tr.querySelector('.en-time-hint');
  });
  ok(made, '새 행의 시간 칸 밑에 미리보기 칸이 있다');
  const inp = page2.locator('#en-multi-rows tr:last-child .en-row-time');
  const read = () => page2.evaluate(() => { const b = document.querySelector('#en-multi-rows tr:last-child .en-time-hint'); const cs = getComputedStyle(b); return { text: b.textContent, display: cs.display, bg: cs.backgroundColor, img: cs.backgroundImage }; });
  await inp.fill('7:40');
  let h = await read();
  ok(h.display === 'block' && /오전 7:40 \(07:40\)|7:40 AM \(07:40\)/.test(h.text) && h.bg === 'rgb(254, 243, 199)' && h.img === 'none', '진짜 화면에서 «7:40» → 오전 경고 + 노란 바탕(덮이지 않음)', h);
  await inp.fill('7:40 PM');
  h = await read();
  ok(/19:40/.test(h.text) && h.bg === 'rgb(236, 253, 245)', '진짜 화면에서 «7:40 PM» → 19:40 + 초록 바탕', h);
  const rows = await page2.evaluate(() => {
    const tr = document.querySelector('#en-multi-rows tr:last-child');
    tr.querySelector('.en-row-uid').value = 'zz_ampm_test';
    tr.querySelector('.en-row-day[value="thu"]').checked = true;
    tr.querySelector('.en-row-type[value="regular"]').checked = true;
    return window._readEnrollmentRows().filter(r => r.student_user_id === 'zz_ampm_test').map(r => ({ time: r.time, days: r.days_of_week }));
  });
  ok(rows.length === 1 && rows[0].time === '19:40' && rows[0].days === '목', '진짜 화면이 서버로 보낼 값: «19:40» · 목', rows);
}
ok(err2.length === 0, '진짜 admin.html 페이지 오류 0건', err2);
await browser.close();
server.close();
console.log('\n결과: PASS ' + pass + ' / FAIL ' + fail);
if (fail) { console.log('실패:'); fails.forEach(f => console.log('  · ' + f)); process.exit(1); }
