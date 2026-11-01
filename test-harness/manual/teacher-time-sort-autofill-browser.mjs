/* 수동 브라우저 검사 — 강사 «오늘의 수업» [시간 정렬] 오름차순·내림차순 + 검색칸 자동완성 (2026-10-28)
   제보(사장님 스크린샷): [시간 정렬] 을 바꾸자 목록이 «검색 결과가 없습니다» 로 비었다.
   실측 원인 — 정렬 계산(sortClassesByTime·portalRows)은 맞았다(기존 검사 3종 통과). 비운 것은 «학생 이름 / ID» 검색칸:
   브라우저 비밀번호 관리자가 그 칸을 «아이디 칸» 으로 오해해 로그인 아이디(파란 자동완성 배경)를 채웠고,
   정렬을 바꾸는 순간 그 값으로 걸러 학생이 한 명도 안 남았다. 같은 날 #1870 이 «내 아이디 정확일치 비우기·숨은 아이디 칸·필터 지우기» 를
   넣었고(문자열 아닌 실행 검사 teacher_search_own_id_harness), 이 검사는 그 위에 «실제 페이지에서 정렬이 도는가» 와
   «자동완성 표시가 붙은 다른 계정 아이디» 를 더 본다.
   «실제» teacher.html 을 띄우고 API 만 가짜로 돌려 잰다 — 운영 자료를 건드리지 않는다.
   실행:  node test-harness/manual/teacher-time-sort-autofill-browser.mjs      (폭 2종 × 언어 2 × 보기 2)
   변이시험: TEACHER_SRC=<고친 사본> 으로 사본을 잰다(저장소 파일을 안 건드림). */
import { readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { resolve, dirname, join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PUB = join(ROOT, 'cloudflare-deploy/public');
let chromium;
try { ({ chromium } = createRequire(import.meta.url)('playwright')); }
catch { try { ({ chromium } = await import('playwright')); } catch { console.log('⏭  건너뜀 — playwright 가 없습니다'); process.exit(0); } }

const html = readFileSync(process.env.TEACHER_SRC || join(PUB, 'teacher.html'), 'utf8');
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/teacher.html') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(html); }
  const f = normalize(join(PUB, p));
  if (f.startsWith(PUB) && existsSync(f) && !f.endsWith('/')) { res.setHeader('Content-Type', TYPES[extname(f)] || 'application/octet-stream'); return res.end(readFileSync(f)); }
  res.statusCode = 404; res.end('');
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? pass++ : fail++; if (!c) console.log('  ❌ FAIL ' + n + (d === undefined ? '' : '  — ' + JSON.stringify(d).slice(0, 300))); };

// ── 가짜 자료 — 오늘 4줄(시각을 일부러 섞음) + 같은 주 다른 날 3줄. 학생 이름에 시각을 넣어 DOM 순서로 바로 읽는다.
const NOW = Date.now(), H = 3600e3;
const kst = ms => new Date(ms + 9 * H).toISOString();
const TODAY = kst(NOW).slice(0, 10);
const monday = d => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
const WK = monday(TODAY);
const addDay = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const OTHER = [0, 1, 2, 3, 4, 5, 6].map(i => addDay(WK, i)).find(d => d !== TODAY);
const ME = 'hq_t_sample';
function row(date, hhmm, i) {
  const st = Date.parse(date + 'T' + hhmm + ':00+09:00');
  return { kind: 'class', schedule_id: 100 + i, room_id: 'class-fx-' + i, student_uid: 'stu' + i, student_name: '학생' + hhmm.replace(':', ''),
    start_time: hhmm, start_ts: st, end_ts: st + 20 * 6e4, open_at_ts: st - 10 * 6e4, close_at_ts: st + 35 * 6e4,
    enter_from_ts: st - 10 * 6e4, enter_until_ts: st + 35 * 6e4, duration_min: 20, class_date: date, date,
    class_state: 'scheduled', level: 'Lv 1', textbook: 'Book', academy: '테스트학원' };
}
const TODAY_TIMES = ['16:00', '09:30', '20:00', '12:30'];
const OTHER_TIMES = ['18:10', '07:50', '13:40'];
function portal() {
  return { ok: true, now: NOW, today: TODAY, me: { name: '강 선생님', username: ME, lang: 'ko' },
    classes: TODAY_TIMES.map((t, i) => row(TODAY, t, i)), upcoming: [], notices: [], resources: [], rating: {},
    week: { start: WK, end: addDay(WK, 6), days: [0, 1, 2, 3, 4, 5, 6].map(i => {
      const d = addDay(WK, i);
      return { date: d, dow: new Date(d + 'T00:00:00Z').getUTCDay(), is_today: d === TODAY,
        items: d === OTHER ? OTHER_TIMES.map((t, j) => row(d, t, 10 + j)) : d === TODAY ? TODAY_TIMES.map((t, j) => row(d, t, j)) : [] };
    }) } };
}
const sorted = (a, dir) => a.slice().sort((x, y) => dir === 'desc' ? y.localeCompare(x) : x.localeCompare(y)).map(t => t.replace(':', ''));
// 목록 상자 안의 학생 이름 순서 — «학생HHMM»
const orderIn = (page, sel) => page.evaluate(s => { const b = document.querySelector(s); return b ? (b.innerText.match(/학생(\d{4})/g) || []).map(x => x.slice(2)) : null; }, sel);
const dedupe = a => a ? a.filter((x, i) => a.indexOf(x) === i) : a;

const browser = await chromium.launch();
let scen = 0;
try {
  for (const width of [1280, 390]) for (const lang of ['ko', 'en']) for (const view of ['table', 'cards']) {
    scen++;
    const tag = `${width}px·${lang}·${view}`;
    const ctx = await browser.newContext({ viewport: { width, height: 1000 } });
    await ctx.addInitScript(([lang, view]) => { try { localStorage.setItem('mangoi_lang', lang); localStorage.setItem('mangoi_teacher_class_view', view); } catch (e) {} }, [lang, view]);
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    page.on('dialog', d => d.dismiss());
    await page.route('**/api/**', route => {
      const u = new URL(route.request().url());
      const body = u.pathname === '/api/teacher/portal' && !u.searchParams.get('part')
        ? (() => { const p = portal(); p.me.lang = lang; return p; })()
        : { ok: true, items: [], rows: [], reports: [], drafts: [], active: [], requests: [], lessons: [] };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto(BASE + '/teacher.html');
    await page.waitForFunction(() => /학생\d{4}/.test((document.getElementById('classes') || {}).innerText || ''), null, { timeout: 15000 });

    // ① 기본(오름차순) + 실제로 고르기(selectOption = 사람이 고르는 것과 같은 change 이벤트)
    ok(tag + ' ① 처음엔 오름차순', JSON.stringify(dedupe(await orderIn(page, '#classes'))) === JSON.stringify(sorted(TODAY_TIMES, 'asc')), dedupe(await orderIn(page, '#classes')));
    await page.selectOption('#class-time-sort', 'desc');
    ok(tag + ' ① 내림차순으로 바뀐다', JSON.stringify(dedupe(await orderIn(page, '#classes'))) === JSON.stringify(sorted(TODAY_TIMES, 'desc')), dedupe(await orderIn(page, '#classes')));
    await page.selectOption('#class-time-sort', 'asc');
    ok(tag + ' ① 다시 오름차순', JSON.stringify(dedupe(await orderIn(page, '#classes'))) === JSON.stringify(sorted(TODAY_TIMES, 'asc')));

    // ② 고른 값은 이 기기에 남는다(새로고침 뒤에도 내림차순)
    await page.selectOption('#class-time-sort', 'desc');
    await page.reload();
    await page.waitForFunction(() => /학생\d{4}/.test((document.getElementById('classes') || {}).innerText || ''), null, { timeout: 15000 });
    ok(tag + ' ② 새로고침 뒤에도 내림차순', await page.inputValue('#class-time-sort') === 'desc' && JSON.stringify(dedupe(await orderIn(page, '#classes'))) === JSON.stringify(sorted(TODAY_TIMES, 'desc')));

    // ③ 사고 재현 — 비밀번호 관리자가 검색칸에 «내 로그인 아이디» 를 채운 상태(이벤트 없이 값만)에서 정렬을 바꾼다
    await page.evaluate(me => { document.getElementById('portal-search').value = me; }, ME);
    await page.selectOption('#class-time-sort', 'asc');
    const o3 = dedupe(await orderIn(page, '#classes'));
    ok(tag + ' ③ 내 아이디가 채워져 있어도 목록이 안 비고 오름차순', JSON.stringify(o3) === JSON.stringify(sorted(TODAY_TIMES, 'asc')), o3);
    ok(tag + ' ③ 그 값은 검색칸에서 지워진다(화면이 «안 걸렀는데 글자는 남은» 상태가 아니다)', await page.inputValue('#portal-search') === '');

    // ④ 자동완성 표시(:-webkit-autofill / :autofill)가 붙은 값도 검색어로 쓰지 않는다 — 진짜 자동완성은 헤드리스에서 못 일으켜 matches 를 바꿔 낸다
    await page.evaluate(() => {
      const el = document.getElementById('portal-search');
      el.value = 'someone_else';
      el.matches = sel => /autofill/.test(sel) || HTMLElement.prototype.matches.call(el, sel);
    });
    await page.selectOption('#class-time-sort', 'desc');
    const o4 = dedupe(await orderIn(page, '#classes'));
    ok(tag + ' ④ 자동완성 값은 거르지 않는다(목록 그대로·내림차순)', JSON.stringify(o4) === JSON.stringify(sorted(TODAY_TIMES, 'desc')), o4);
    ok(tag + ' ④ 자동완성 값은 지워진다', await page.inputValue('#portal-search') === '');
    await page.evaluate(() => { delete document.getElementById('portal-search').matches; });

    // ⑤ 짝 — 사람이 «직접 친» 검색어는 그대로 걸러지고, 정렬을 바꿔도 남는다(위 방어가 진짜 검색을 죽이지 않는다)
    await page.fill('#portal-search', '');
    await page.type('#portal-search', '학생1230');
    ok(tag + ' ⑤ 직접 친 검색어로 걸러진다', JSON.stringify(dedupe(await orderIn(page, '#classes'))) === JSON.stringify(['1230']), dedupe(await orderIn(page, '#classes')));
    await page.selectOption('#class-time-sort', 'asc');
    ok(tag + ' ⑤ 정렬을 바꿔도 직접 친 검색어는 남는다', await page.inputValue('#portal-search') === '학생1230' && JSON.stringify(dedupe(await orderIn(page, '#classes'))) === JSON.stringify(['1230']));

    // ⑥ 결과 0건이면 «무엇으로 걸렀는지» 와 [검색어 지우기] 를 보인다 — 누르면 목록이 돌아온다
    await page.fill('#portal-search', 'zzz-없는학생');
    const empty = await page.evaluate(() => (document.getElementById('classes') || {}).innerText || '');
    ok(tag + ' ⑥ 0건 문구에 그 검색어가 보인다', empty.includes('zzz-없는학생'), empty.slice(0, 120));
    const clr = page.locator('#classes [data-portal-clear]');
    ok(tag + ' ⑥ [검색어 지우기] 버튼이 있다', await clr.count() === 1);
    if (await clr.count()) {
      await clr.click();
      const dir6 = await page.inputValue('#class-time-sort'), o6 = dedupe(await orderIn(page, '#classes'));
      ok(tag + ' ⑥ 누르면 검색칸이 비고 목록이 (지금 정렬대로) 돌아온다', await page.inputValue('#portal-search') === '' && JSON.stringify(o6) === JSON.stringify(sorted(TODAY_TIMES, dir6)), { dir6, o6 });
    }

    // ⑦ 다른 날 보기도 정렬을 따른다
    await page.fill('#portal-search', '');
    await page.selectOption('#class-time-sort', 'asc');
    await page.selectOption('#cls-day', OTHER);
    await page.waitForFunction(() => /학생\d{4}/.test((document.getElementById('cls-day-view') || {}).innerText || ''), null, { timeout: 8000 });
    ok(tag + ' ⑦ 다른 날: 오름차순', JSON.stringify(dedupe(await orderIn(page, '#cls-day-view'))) === JSON.stringify(sorted(OTHER_TIMES, 'asc')), dedupe(await orderIn(page, '#cls-day-view')));
    await page.selectOption('#class-time-sort', 'desc');
    ok(tag + ' ⑦ 다른 날: 내림차순', JSON.stringify(dedupe(await orderIn(page, '#cls-day-view'))) === JSON.stringify(sorted(OTHER_TIMES, 'desc')), dedupe(await orderIn(page, '#cls-day-view')));
    await page.click('#cls-day-today');

    // ⑧ 비밀번호 변경 칸 앞에 «숨은 아이디 칸»(autocomplete=username)이 있고 내 아이디가 들어 있다 — 비밀번호 관리자가 검색칸 대신 이 칸을 아이디로 본다
    const pu = await page.evaluate(() => {
      const u = document.querySelector('#c-pw input[autocomplete="username"]'), pw = document.getElementById('pw-cur');
      if (!u) return null;
      return { val: u.value, hidden: u.hidden || getComputedStyle(u).display === 'none', tab: u.tabIndex,
        before: !!(u.compareDocumentPosition(pw) & Node.DOCUMENT_POSITION_FOLLOWING) };
    });
    ok(tag + ' ⑧ 숨은 아이디 칸 = 내 아이디·안 보임·탭 안 감·비밀번호 칸보다 앞', !!pu && pu.val === ME && pu.hidden && pu.tab === -1 && pu.before, pu);

    ok(tag + ' 페이지 오류 0', errs.length === 0, errs);
    ok(tag + ' 옆으로 안 밀림', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log(`결과: 시나리오 ${scen} · PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
