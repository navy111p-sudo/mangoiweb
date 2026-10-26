/* 수동 브라우저 스트레스 검사 — 교사 「오늘의 수업」 표 보기(PC) · 상세 숨기기 · 일지 미작성 칩 (2026-10-26)
   실제 teacher.html 을 실제 Chromium 으로 띄우고, /api/* 는 전부 가짜 응답(운영 데이터 0건 접촉)으로
   무작위 시나리오를 N회(기본 300) 돌린다: 폭 7종 × 언어 2 × 보기 2 × 상세 2 × 테마 2 × 수업 0~24줄.
   실행:  node test-harness/manual/teacher-dense-view-browser.mjs            (기본 300회)
          RUNS=1000 SEED=7 node test-harness/manual/teacher-dense-view-browser.mjs
   변이시험: TEACHER_SRC=<고친 사본> 으로 사본을 띄운다(저장소 파일을 안 건드림). */
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { resolve, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PUB = resolve(ROOT, 'cloudflare-deploy/public');
const RUNS = +process.env.RUNS || 300;
let seed = +process.env.SEED || 20261026;

let chromium;
try { ({ chromium } = createRequire(import.meta.url)('playwright')); }
catch { try { ({ chromium } = await import('playwright')); } catch { console.log('⏭  건너뜀 — playwright 가 없습니다'); process.exit(0); } }

// ── 시험 전용 훅: 클로저 안의 renderClasses 를 다시 부를 수 있게(제공 사본에만, 저장소 파일은 그대로) ──
let html = readFileSync(process.env.TEACHER_SRC || join(PUB, 'teacher.html'), 'utf8').replace(/\r\n/g, '\n');
const HOOK_AT = '  scheduleAutoRefresh(AR_MIN);\n})();';
if (!html.includes(HOOK_AT)) { console.log('❌ 훅 자리를 찾지 못했습니다'); process.exit(1); }
html = html.replace(HOOK_AT, '  scheduleAutoRefresh(AR_MIN);\n  window.__tt = { rerender: function(){ lastSig = null; renderClasses(DATA.classes || []); } };\n})();');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer((req, res) => {
  const p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/teacher.html') { res.setHeader('Content-Type', MIME['.html']); return res.end(html); }
  try { const b = readFileSync(join(PUB, p)); res.setHeader('Content-Type', MIME[extname(p)] || 'application/octet-stream'); res.end(b); }
  catch { res.statusCode = 404; res.end('nf'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port;

// ── 결정적 난수 ──
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
const pick = (a) => a[Math.floor(rnd() * a.length)];
const KST_TODAY = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
function monday(d) { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); }
const WEEK_START = monday(KST_TODAY);
function week() {
  const days = [];
  for (let i = 0; i < 7; i++) { const x = new Date(WEEK_START + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + i); days.push({ date: x.toISOString().slice(0, 10), items: [] }); }
  return { start: WEEK_START, days };
}
const LONG = 'Alexandria-Konstantinopel Supercalifragilistic Kim';
function mkClass(id) {
  const offset = Math.round((rnd() * 16 - 8) * 60);          // -8h ~ +8h
  const start = Date.now() + offset * 60e3, dur = pick([20, 25, 40]);
  const kind = rnd() < 0.08 ? pick(['lms', 'demo']) : 'class';
  const state = pick(['scheduled', 'scheduled', 'ongoing', 'done', 'done', 'postponed', 'cancelled', 'no_show', undefined]);
  const c = {
    kind, schedule_id: id, room_id: 'class-' + id + '-x', start_time: new Date(start + 9 * 3600e3).toISOString().slice(11, 16),
    class_date: KST_TODAY, start_ts: start, end_ts: start + dur * 60e3, open_at_ts: start - 10 * 60e3, close_at_ts: start + (dur + 15) * 60e3,
    enter_from_ts: start - 12 * 3600e3, enter_until_ts: start + 12 * 3600e3, duration_min: dur,
    student_name: rnd() < 0.15 ? LONG + id : '학생' + id, student_uid: 'stu' + id, student_name_en: 'Student ' + id,
    level: pick(['Lv 1', 'Lv 3', 'Phonics A', '']), textbook: rnd() < 0.2 ? 'Very Long Textbook Title For Overflow Testing Vol. ' + id : 'Book ' + id,
    academy: pick(['강남학원', 'Mokdong Academy', '']), student_phone: '010-0000-' + String(1000 + id),
    class_kind: rnd() < 0.1 ? 'level_test' : 'regular', eval_written: rnd() < 0.4,
  };
  if (state) c.class_state = state;
  if (state === 'no_show') c.no_show_role = pick(['teacher', 'student', 'both']);
  if (state === 'postponed') c.postponed_info = { at: Date.now() - 3600e3, by: 'Maimai' };
  if (rnd() < 0.06) c.absence_hold = true;
  if (rnd() < 0.1) { c.substitute = true; c.covering_for = 'Teacher ' + id; }
  if (rnd() < 0.3) c.prev_lesson = { date: KST_TODAY, teacher_name: 'Prev T', note_ko: '지난 수업 메모 ' + id, note_en: 'Prev note ' + id, score_overall: 4 };
  return c;
}

const browser = await chromium.launch();
const ctx = await browser.newContext();
let FIXTURE = null;
// 바깥 주소(폰트·분석 등)는 전부 끊는다 — 운영 접촉 0, 그리고 «load» 대기가 걸리지 않게.
await ctx.route((url) => url.hostname !== '127.0.0.1', (route) => route.abort());
await ctx.route('**/api/**', (route) => {
  const u = new URL(route.request().url());
  if (u.pathname === '/api/teacher/portal' && FIXTURE)
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(Object.assign({}, FIXTURE, { now: Date.now() })) });
  return route.fulfill({ contentType: 'application/json', body: '{"ok":false,"error":"stub"}' });
});
const page = await ctx.newPage();
page.setDefaultTimeout(5000);
const errors = [];
page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
page.on('dialog', (d) => d.dismiss().catch(() => {}));

let pass = 0, fail = 0; const fails = [];
function ok(name, cond, detail) { if (cond) pass++; else { fail++; if (fails.length < 40) fails.push(name + (detail ? ' — ' + detail : '')); } }

const READ = () => {
  const box = document.getElementById('classes');
  const vis = (e) => { if (!e) return false; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const rows = [...box.querySelectorAll(':scope > .cls')];
  const heads = box.querySelectorAll('.cls-dhead');
  const head = heads[0];
  const nolog = box.querySelector('[data-chip="nolog"]');
  const lite = [...box.querySelectorAll('.cls-goal,.cls-hand,.cls-prev')];
  const cr = box.getBoundingClientRect();
  return {
    rows: rows.length, rowsHtml: rows.map(r => r.outerHTML).join('\n'),
    heads: heads.length, headVis: vis(head), headFirst: !!(head && head.nextElementSibling === rows[0]), headText: head ? head.textContent : '',
    dense: box.classList.contains('cls-dense'), liteOn: box.classList.contains('cls-lite'),
    grid: rows.filter(r => r.getBoundingClientRect().height > 0).every(r => getComputedStyle(r).display === 'grid'),
    anyGrid: rows.some(r => getComputedStyle(r).display === 'grid'),
    joins: box.querySelectorAll('[data-join]').length, evals: box.querySelectorAll('.btn-eval').length,
    nologN: nolog ? +(nolog.textContent.match(/(\d+)\s*$/) || [0, -1])[1] : 0,
    liteVisible: lite.filter(vis).length, liteTotal: lite.length,
    actOut: rows.filter(r => { const a = r.querySelector('.cls-act'); if (!a || !vis(a)) return false; const ar = a.getBoundingClientRect(); return ar.right > cr.right + 2 || ar.left < cr.left - 2; }).length,
    over: document.documentElement.scrollWidth > innerWidth + 1,
    viewVal: document.getElementById('cls-view').value, viewVis: vis(document.getElementById('cls-view')),
    liteChecked: document.getElementById('cls-lite').checked,
    avgRowH: rows.length ? rows.reduce((s, r) => s + r.getBoundingClientRect().height, 0) / rows.length : 0,
  };
};

async function openScenario(o) {
  FIXTURE = { ok: true, today: KST_TODAY, me: { name: 'Farrah', username: 'mangoi_018', lang: o.lang }, classes: o.classes, upcoming: [], notices: [], resources: [], rating: {}, week: week() };
  await page.setViewportSize({ width: o.w, height: 900 });
  await page.goto('about:blank');
  await ctx.clearCookies();
  await page.goto(BASE + '/teacher.html?_=' + Math.random(), { waitUntil: 'domcontentloaded' });
  await page.evaluate((o) => {
    localStorage.clear();
    localStorage.setItem('mangoi_lang', o.lang);
    localStorage.setItem('mangoi_teacher_cls_view', o.view);
    localStorage.setItem('mangoi_teacher_cls_lite', o.lite ? '1' : '0');
    if (o.dark) localStorage.setItem('mangoi_teacher_theme', 'dark');
  }, o);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => { const b = document.getElementById('classes'); return b && (b.querySelector('.cls') || b.querySelector('.empty')); }, null, { timeout: 15000 });
}

const WIDTHS = [360, 390, 768, 899, 900, 1280, 1920];
console.log(`▶ 교사 표 보기 스트레스 — ${RUNS}회 (seed ${seed})`);
const t0 = Date.now();
for (let run = 1; run <= RUNS; run++) {
  const o = { w: pick(WIDTHS), lang: pick(['ko', 'en']), view: pick(['cards', 'table']), lite: rnd() < 0.5, dark: rnd() < 0.3 };
  const n = rnd() < 0.08 ? 0 : 1 + Math.floor(rnd() * 24);
  o.classes = Array.from({ length: n }, (_, i) => mkClass(run * 100 + i));
  const tag = `#${run} w${o.w} ${o.lang} ${o.view}${o.lite ? ' lite' : ''}${o.dark ? ' dark' : ''} n${n}`;
  const errBefore = errors.length;
  try {
    await openScenario(o);
    let r = await page.evaluate(READ);
    const pc = o.w >= 900, wantDense = o.view === 'table';
    ok(tag + ' 줄 수 = 수업 수', r.rows === n, r.rows + ' vs ' + n);
    ok(tag + ' 저장된 보기값 복원', r.viewVal === o.view && r.liteChecked === o.lite);
    ok(tag + ' 보기 선택은 PC 에서만 보인다', r.viewVis === pc);
    ok(tag + ' cls-dense 클래스 = 표 보기', r.dense === wantDense);
    ok(tag + ' 머리줄 0~1개', r.heads <= 1, String(r.heads));
    ok(tag + ' 머리줄 = 표 보기 && 줄 있음', (r.heads === 1) === (wantDense && n > 0));
    if (r.heads) ok(tag + ' 머리줄은 첫 줄 바로 앞', r.headFirst);
    ok(tag + ' 머리줄은 PC 표에서만 보인다', r.headVis === (wantDense && pc && n > 0));
    if (r.heads) ok(tag + ' 머리줄 언어', o.lang === 'ko' ? /시간/.test(r.headText) : /Time/.test(r.headText), r.headText);
    ok(tag + ' 그리드 배치 = PC 표', wantDense && pc && n ? r.grid : !r.anyGrid);
    ok(tag + ' 상세 숨기기', o.lite ? r.liteVisible === 0 : r.liteVisible === r.liteTotal, r.liteVisible + '/' + r.liteTotal);
    ok(tag + ' 일지 미작성 칩 = [일지 쓰기] 버튼 수', r.nologN === r.evals, r.nologN + ' vs ' + r.evals);
    ok(tag + ' 가로 넘침 없음', !r.over);
    ok(tag + ' 버튼이 카드 밖으로 안 나감', r.actOut === 0, String(r.actOut));

    // 보기 전환: 줄 내용·버튼은 한 글자도 안 바뀐다(배치만)
    const before = r;
    // PC 에서는 사람처럼 고르고, 폰(선택 상자가 일부러 숨은 폭)에서는 저장값만 바꾼 셈으로 change 를 쏜다.
    const nextView = o.view === 'table' ? 'cards' : 'table';
    if (before.viewVis) await page.selectOption('#cls-view', nextView);
    else await page.evaluate((v) => { const s = document.getElementById('cls-view'); s.value = v; s.dispatchEvent(new Event('change')); }, nextView);
    await page.click('#cls-lite', { force: true });
    r = await page.evaluate(READ);
    ok(tag + ' 전환 후 줄 HTML 동일', r.rowsHtml === before.rowsHtml);
    ok(tag + ' 전환 후 입장·일지 버튼 수 동일', r.joins === before.joins && r.evals === before.evals);
    ok(tag + ' 전환 후 머리줄 일관', (r.heads === 1) === (r.dense && n > 0) && r.heads <= 1);
    ok(tag + ' 전환 후 상세 숨기기 반영', r.liteOn === !o.lite);
    ok(tag + ' 전환 후 가로 넘침 없음', !r.over);
    const stored = await page.evaluate(() => [localStorage.getItem('mangoi_teacher_cls_view'), localStorage.getItem('mangoi_teacher_cls_lite')]);
    ok(tag + ' 전환값 저장', stored[0] === (o.view === 'table' ? 'cards' : 'table') && stored[1] === (o.lite ? '0' : '1'), stored.join(','));

    // 재그리기(60초 tick·서버 갱신과 같은 경로) 뒤에도 머리줄이 하나, 첫 줄 앞
    await page.evaluate(() => window.__tt.rerender());
    await page.waitForTimeout(20);
    r = await page.evaluate(READ);
    ok(tag + ' 재그리기 후 머리줄 일관', (r.heads === 1) === (r.dense && n > 0) && r.heads <= 1 && (!r.heads || r.headFirst));

    // 언어 전환 → 머리줄 글자도 따라 바뀐다
    if (run % 5 === 0 && n) {
      await page.click('#lang', { force: true }).catch(() => {});
      await page.waitForTimeout(80);
      r = await page.evaluate(READ);
      if (r.heads) ok(tag + ' 언어 전환 후 머리줄 번역', o.lang === 'ko' ? /Time/.test(r.headText) : /시간/.test(r.headText), r.headText);
      ok(tag + ' 언어 전환 후 머리줄 1개', r.heads <= 1);
    }
    // 일지 미작성 칩 클릭 — 예외 없이 스크롤
    if (before.nologN > 0) await page.click('[data-chip="nolog"]', { force: true }).catch(() => {});
  } catch (e) { ok(tag + ' 시나리오 실행', false, String(e.message || e).slice(0, 160)); }
  ok(tag + ' 페이지 예외 0건', errors.length === errBefore, errors.slice(errBefore).join(' / ').slice(0, 200));
  if (run % 50 === 0) console.log(`  … ${run}/${RUNS}  PASS ${pass} FAIL ${fail}  (${Math.round((Date.now() - t0) / 1000)}s)`);
}

// 밀도 확인(결정적): 같은 데이터로 PC 카드 vs 표 — 표가 줄 높이를 줄여야 «한눈에» 의 의미가 있다
{
  seed = 4242;
  const classes = Array.from({ length: 12 }, (_, i) => Object.assign(mkClass(9000 + i), { prev_lesson: undefined }));
  await openScenario({ w: 1280, lang: 'ko', view: 'cards', lite: false, dark: false, classes });
  const cards = await page.evaluate(READ);
  await openScenario({ w: 1280, lang: 'ko', view: 'table', lite: false, dark: false, classes });
  const table = await page.evaluate(READ);
  ok('밀도: PC 표의 평균 줄 높이가 카드보다 낮다', table.avgRowH < cards.avgRowH, Math.round(table.avgRowH) + 'px vs ' + Math.round(cards.avgRowH) + 'px');
  console.log(`  📏 평균 줄 높이 — 카드 ${Math.round(cards.avgRowH)}px → 표 ${Math.round(table.avgRowH)}px`);
  await page.screenshot({ path: process.env.SHOT || '/tmp/teacher-dense-table.png', fullPage: false }).catch(() => {});
}

console.log(fails.length ? '\n실패 예시:\n  ❌ ' + fails.join('\n  ❌ ') : '');
console.log(`\n결과: ${RUNS}회 시나리오 · 검사 PASS ${pass} / FAIL ${fail} · ${Math.round((Date.now() - t0) / 1000)}s`);
await browser.close(); server.close();
process.exit(fail ? 1 : 0);
