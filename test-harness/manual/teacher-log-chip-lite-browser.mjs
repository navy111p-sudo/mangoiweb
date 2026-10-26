/* 수동 브라우저 스트레스 검사 — 교사 「오늘의 수업」 «일지 미작성 N» 칩 · «상세 숨기기» (2026-10-26)
   표 보기 자체는 #1811(teacher_class_table_harness)이 맡는다. 여기서는 그 위에 붙인 두 가지가
   카드·표 두 보기에서 모두 맞는지 실제 Chromium 으로 본다. /api/* 는 전부 가짜 응답(운영 데이터 0건 접촉).
   무작위 시나리오 N회(기본 300): 폭 7종 × 언어 2 × 보기 2 × 상세 2 × 테마 2 × 수업 0~24줄.
   실행:  node test-harness/manual/teacher-log-chip-lite-browser.mjs            (기본 300회)
          RUNS=1000 SEED=7 node test-harness/manual/teacher-log-chip-lite-browser.mjs
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
  const vis = (e) => { if (!e) return false; if (e.closest('details:not([open])') && !e.matches('details > summary') && e.closest('details:not([open])') !== e) return false; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const table = !!box.querySelector('.cls-tbl');
  const rows = table ? [...box.querySelectorAll('tr.cls-tr')] : [...box.querySelectorAll(':scope > .cls')];
  const nolog = box.querySelector('[data-chip="nolog"]');
  const lite = [...box.querySelectorAll('.cls-goal,.cls-hand,.cls-prev')];
  return {
    table, rows: rows.length,
    liteOn: box.classList.contains('cls-lite'), dayLiteOn: (document.getElementById('cls-day-view') || box).classList.contains('cls-lite'),
    evals: box.querySelectorAll('.btn-eval').length, evalRows: rows.filter(r => r.querySelector('.btn-eval')).length,
    nologN: nolog ? +(nolog.textContent.match(/(\d+)\s*$/) || [0, -1])[1] : 0, nologTxt: nolog ? nolog.textContent : '',
    liteVisible: lite.filter(vis).length, liteTotal: lite.length,
    keepVisible: [...box.querySelectorAll('.btn-eval,[data-join],[data-away]')].filter(vis).length,
    keepTotal: [...box.querySelectorAll('.btn-eval,[data-join],[data-away]')].length,
    over: document.documentElement.scrollWidth > innerWidth + 1,
    viewVal: document.getElementById('class-view').value,
    wrapVis: vis(document.getElementById('cls-lite-wrap')), liteChecked: document.getElementById('cls-lite').checked,
    sel: rows.map(r => r.querySelector('.btn-eval') ? 1 : 0).join(''),
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
    localStorage.setItem('mangoi_teacher_class_view', o.view);
    localStorage.setItem('mangoi_teacher_cls_lite', o.lite ? '1' : '0');
    if (o.dark) localStorage.setItem('mangoi_teacher_theme', 'dark');
  }, o);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => { const b = document.getElementById('classes'); return b && (b.querySelector('.cls,.cls-tr') || b.querySelector('.empty')); }, null, { timeout: 15000 });
}
const setView = (v) => page.evaluate((v) => { const s = document.getElementById('class-view'); s.value = v; s.dispatchEvent(new Event('change')); }, v);

const WIDTHS = [360, 390, 768, 899, 900, 1280, 1920];
console.log(`▶ 일지 미작성 칩 · 상세 숨기기 스트레스 — ${RUNS}회 (seed ${seed})`);
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
    // 기대값을 픽스처에서 직접 계산 — 줄의 [일지 쓰기] 조건(classActHtml done && !eval_written, 취소·연기·보류 제외)
    const now = Date.now();
    const want = o.classes.filter(c => c.kind === 'class' && c.class_state !== 'cancelled' && c.class_state !== 'postponed'
      && !c.absence_hold && now > c.close_at_ts && !c.eval_written).length;
    ok(tag + ' 줄 수 = 수업 수', r.rows === n, r.rows + ' vs ' + n);
    ok(tag + ' 보기·상세 저장값 복원', r.viewVal === o.view && r.liteChecked === o.lite);
    ok(tag + ' 보기 = 저장값(표/카드)', n === 0 || r.table === (o.view === 'table'));
    ok(tag + ' 칩 수 = 픽스처 기대값', r.nologN === want, r.nologN + ' vs ' + want);
    ok(tag + ' 칩 수 = 화면의 [일지 쓰기] 버튼 수', r.nologN === r.evals, r.nologN + ' vs ' + r.evals);
    ok(tag + ' 칩 라벨 언어', !r.nologN || (o.lang === 'ko' ? /일지 미작성/.test(r.nologTxt) : /Log not written/.test(r.nologTxt)), r.nologTxt);
    ok(tag + ' 상세 숨기기 줄은 카드에서만 보인다', r.wrapVis === (o.view === 'cards'));
    ok(tag + ' cls-lite 클래스 = 체크(오늘·다른 날 상자 둘 다)', r.liteOn === o.lite && r.dayLiteOn === o.lite);
    if (!r.table) ok(tag + ' 카드: 상세 숨기기', o.lite ? r.liteVisible === 0 : r.liteVisible === r.liteTotal, r.liteVisible + '/' + r.liteTotal);
    ok(tag + ' 숨겨도 버튼(입장·일지·다른 방)은 그대로 보인다', r.keepVisible === r.keepTotal, r.keepVisible + '/' + r.keepTotal);
    ok(tag + ' 가로 넘침 없음', !r.over);

    // 보기 전환 + 상세 토글 — 칩·일지 줄은 그대로
    const before = r;
    await setView(o.view === 'table' ? 'cards' : 'table');
    if (o.view === 'table') await page.click('#cls-lite');      // 카드로 바뀌어 상자가 보일 때 사람처럼 누른다
    else await page.evaluate(() => { const c = document.getElementById('cls-lite'); c.checked = !c.checked; c.dispatchEvent(new Event('change')); });
    r = await page.evaluate(READ);
    ok(tag + ' 전환 후 칩 수 동일', r.nologN === before.nologN);
    ok(tag + ' 전환 후 칩 = 버튼 수', r.nologN === r.evals, r.nologN + ' vs ' + r.evals);
    ok(tag + ' 전환 후 [일지 쓰기] 줄 위치 동일', r.sel === before.sel || n === 0, r.sel + ' / ' + before.sel);
    ok(tag + ' 전환 후 상세 숨기기 반영', r.liteOn === !o.lite);
    ok(tag + ' 전환 후 상세 줄 보임 = 카드', r.wrapVis === (r.viewVal === 'cards'));
    if (!r.table) ok(tag + ' 전환 후 카드 상세', !o.lite ? r.liteVisible === 0 : r.liteVisible === r.liteTotal, r.liteVisible + '/' + r.liteTotal);
    ok(tag + ' 전환 후 가로 넘침 없음', !r.over);
    const stored = await page.evaluate(() => [localStorage.getItem('mangoi_teacher_class_view'), localStorage.getItem('mangoi_teacher_cls_lite')]);
    ok(tag + ' 전환값 저장', stored[0] === (o.view === 'table' ? 'cards' : 'table') && stored[1] === (o.lite ? '0' : '1'), stored.join(','));

    // 재그리기(60초 tick 과 같은 경로) 뒤에도 상세 숨김·칩이 유지
    await page.evaluate(() => window.__tt.rerender());
    await page.waitForTimeout(20);
    const r2 = await page.evaluate(READ);
    ok(tag + ' 재그리기 후 cls-lite 유지', r2.liteOn === r.liteOn);
    ok(tag + ' 재그리기 후 칩 = 버튼', r2.nologN === r2.evals);

    // 언어 전환 → 칩 글자도 바뀐다
    if (run % 5 === 0 && r2.nologN) {
      await page.click('#lang', { force: true }).catch(() => {});
      await page.waitForTimeout(80);
      const r3 = await page.evaluate(READ);
      ok(tag + ' 언어 전환 후 칩 번역', o.lang === 'ko' ? /Log not written/.test(r3.nologTxt) : /일지 미작성/.test(r3.nologTxt), r3.nologTxt);
    }
    // 칩 클릭 → [일지 쓰기] 가 있는 줄이 화면 안으로
    if (r2.nologN > 0) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.click('[data-chip="nolog"]');
      await page.waitForTimeout(700);
      const inView = await page.evaluate(() => {
        const b = document.querySelector('#classes .btn-eval'); const row = b && b.closest('.cls, .cls-tr');
        if (!row) return false; const rr = row.getBoundingClientRect(); return rr.bottom > 0 && rr.top < innerHeight;
      });
      ok(tag + ' 칩을 누르면 [일지 쓰기] 줄이 보인다', inView);
    }
  } catch (e) { ok(tag + ' 시나리오 실행', false, String(e.message || e).slice(0, 160)); }
  ok(tag + ' 페이지 예외 0건', errors.length === errBefore, errors.slice(errBefore).join(' / ').slice(0, 200));
  if (run % 50 === 0) console.log(`  … ${run}/${RUNS}  PASS ${pass} FAIL ${fail}  (${Math.round((Date.now() - t0) / 1000)}s)`);
}
await page.screenshot({ path: process.env.SHOT || '/tmp/teacher-log-chip.png', fullPage: false }).catch(() => {});
console.log(fails.length ? '\n실패 예시:\n  ❌ ' + fails.join('\n  ❌ ') : '');
console.log(`\n결과: ${RUNS}회 시나리오 · 검사 PASS ${pass} / FAIL ${fail} · ${Math.round((Date.now() - t0) / 1000)}s`);
await browser.close(); server.close();
process.exit(fail ? 1 : 0);
