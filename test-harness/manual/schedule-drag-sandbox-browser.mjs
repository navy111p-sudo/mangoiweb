/**
 * 🧪 관리자 스케줄 캘린더 드래그(연기·변경) 샌드박스 — 진짜 브라우저 · 진짜 화면 파일 · 진짜 서버 이동 모듈
 *
 * 무엇: 로컬 서버가 public/ 을 그대로 서빙하고, 이동 API(PATCH /api/admin/class-schedules/move)는
 *   **운영 모듈 src/class-schedule-move.ts 를 그대로** 진짜 SQLite 위에서 돌린다. 화면은
 *   ① 관리자 › 강사 스케줄 캘린더(js/adm-q6.js) ② 주간 전체 스케줄(admin/weekly-schedule.html)
 *   둘 다 진짜 마우스로 끌어 보고, 끝난 뒤 «DB 에 실제로 무엇이 남았나» 를 SELECT 로 대조한다.
 * ⛔ 운영 HTTP·운영 D1 은 안 씀. 자동으로 안 돕니다 — 사람이 부릅니다:
 *     node test-harness/manual/schedule-drag-sandbox-browser.mjs
 *   (ROUNDS=N 으로 강사 캘린더 무작위 드래그 회수 조절, 기본 120)
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PUB = join(ROOT, 'cloudflare-deploy/public');
const SRC = join(ROOT, 'cloudflare-deploy/src');
const SELF = fileURLToPath(import.meta.url);

/* ═════════════ 자식: 서버(진짜 이동 모듈 + SQLite) ═════════════ */
if (process.env.SDS_CHILD === '1') {
  const { DatabaseSync } = await import('node:sqlite');
  const sq = new DatabaseSync(':memory:');
  const norm = v => v === undefined ? null : typeof v === 'boolean' ? Number(v) : v;
  const st = (sql, args = []) => ({ sql, args, bind: (...a) => st(sql, a.map(norm)),
    async first(c) { const r = sq.prepare(sql).get(...args); return r ? c ? r[c] : { ...r } : null; },
    async all() { return { success: true, results: sq.prepare(sql).all(...args).map(r => ({ ...r })) }; },
    async run() { const r = sq.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; } });
  const DB = { prepare: s => st(s), async exec(s) { sq.exec(s); },
    async batch(list) { sq.exec('BEGIN IMMEDIATE'); try { const o = []; for (const s of list) o.push(await s.run()); sq.exec('COMMIT'); return o; } catch (e) { sq.exec('ROLLBACK'); throw e; } } };
  const env = { DB };
  const imp = f => import(pathToFileURL(join(SRC, f)).href);
  const { moveSchedulesAtomically: move, scheduleMoveVersion: version } = await imp('class-schedule-move.ts');
  const { ensureClassAuditTable } = await imp('class-audit.ts');
  const adminSrc = readFileSync(join(SRC, 'api-admin.ts'), 'utf8');
  const ddl = (src, t, needs = '') => { for (const m of src.matchAll(new RegExp('`(CREATE TABLE IF NOT EXISTS ' + t + '\\s*\\([\\s\\S]*?\\);?)`', 'g'))) if (m[1].includes(needs)) return m[1]; throw new Error(t); };
  sq.exec(ddl(adminSrc, 'class_schedules', 'duration_min INTEGER DEFAULT 20'));
  sq.exec('ALTER TABLE class_schedules ADD COLUMN starts_on TEXT');
  sq.exec(ddl(readFileSync(join(SRC, 'scope.ts'), 'utf8'), 'admin_scope'));
  const ti = adminSrc.indexOf('`CREATE TABLE IF NOT EXISTS teachers (`'), te = adminSrc.indexOf("].join(' ')", ti);
  sq.exec([...adminSrc.slice(ti, te).matchAll(/`([^`]*)`/g)].map(m => m[1]).join(' '));
  sq.exec(ddl(adminSrc, 'teacher_unavailability'));
  sq.exec(ddl(readFileSync(join(SRC, 'api-lessons.ts'), 'utf8'), 'calendar_events'));
  await ensureClassAuditTable(env);
  const mfm = adminSrc.match(/move_field: (\(\(String\(r\.schedule_kind \|\| 'recurring'\) === 'one_off'\) \|\| r\.scheduled_date\)\s*\? 'scheduled_date' : 'day_of_week')/);
  if (!mfm) throw new Error('move_field 판정식을 못 찾음');
  const moveField = new Function('r', 'return ' + mfm[1] + ';');
  const NOW = Date.now();
  const ins = (t, d) => { const k = Object.keys(d); return Number(sq.prepare(`INSERT INTO ${t} (${k.join(',')}) VALUES (${k.map(() => '?').join(',')})`).run(...Object.values(d)).lastInsertRowid); };
  for (const [id, name] of [[1, 'ALPHA'], [2, 'BETA'], [3, 'GAMMA']]) ins('teachers', { id, name, active: 1, created_at: NOW, updated_at: NOW });
  ins('admin_scope', { username: 'admin', scope_type: 'hq', updated_at: NOW });
  const kst = new Date(Date.now() + 9 * 3600e3), dow0 = (kst.getUTCDay() + 6) % 7;
  const mon = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() - dow0));
  const WEEK = [...Array(7)].map((_, i) => new Date(mon.getTime() + i * 864e5).toISOString().slice(0, 10));
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dowOf = d => DOW[new Date(d + 'T00:00:00Z').getUTCDay()];
  const TODAY = kst.toISOString().slice(0, 10);
  const seed = () => {
    sq.exec('DELETE FROM class_schedules; DELETE FROM class_audit_log;');
    const c = (o) => ins('class_schedules', { class_type: 'regular', duration_min: 20, status: 'active', created_at: NOW, schedule_kind: 'dated', ...o });
    c({ user_id: 'kid', student_name: '김아이', scheduled_date: WEEK[2], start_time: '14:20', teacher_id: '1', source: 'adm-enroll:1' });
    for (const g of ['g1', 'g2', 'g3']) c({ user_id: g, student_name: '그룹' + g, scheduled_date: WEEK[3], start_time: '16:00', teacher_id: '1', class_type: 'group', source: 'adm-enroll:2' });
    c({ user_id: 'rec', student_name: '매주학생', schedule_kind: 'recurring', scheduled_date: null, day_of_week: 'Mon', start_time: '18:00', teacher_id: '1', source: 'adm-enroll:3' });
    c({ user_id: 'mir', student_name: '미러학생', schedule_kind: 'one_off', scheduled_date: WEEK[1], start_time: '10:00', teacher_id: '1', source: 'c24-mirror', notes: 'c24:9' });
    c({ user_id: 'lms', student_name: 'LMS', scheduled_date: WEEK[4], start_time: '12:00', teacher_id: '1', source: 'lms_import_w26' });
    c({ user_id: 'busy', student_name: '바쁜학생', scheduled_date: WEEK[4], start_time: '15:00', teacher_id: '1', source: 'adm-enroll:4' });
    // 오늘(주간 전체 스케줄의 일간 작업면)
    c({ user_id: 'today1', student_name: '오늘학생', scheduled_date: TODAY, start_time: '14:00', teacher_id: '1', source: 'adm-enroll:5' });
    c({ user_id: 'today2', student_name: '오늘베타', scheduled_date: TODAY, start_time: '17:00', teacher_id: '2', source: 'adm-enroll:6' });
  };
  seed();
  const cards = (weekStart) => {
    const ws = new Date(weekStart + 'T00:00:00Z'), wk = [...Array(7)].map((_, i) => new Date(ws.getTime() + i * 864e5).toISOString().slice(0, 10));
    const out = [];
    for (const r of sq.prepare(`SELECT * FROM class_schedules WHERE (status IS NULL OR status='active')`).all().map(x => ({ ...x }))) {
      const u = String(r.user_id).toLowerCase();
      const base = { id: r.id, move_version: version(r), teacher_id: Number(r.teacher_id), start_time: r.start_time, hour: Number(r.start_time.split(':')[0]),
        type: r.class_type === 'group' ? 'group' : '1on1', origin: u === 'lms' ? 'lms' : 'class', students: [{ name: r.student_name, uid: r.user_id }],
        duration_min: r.duration_min || 20, note: '', move_field: moveField(r), source: r.source };
      if (r.schedule_kind === 'one_off' || r.scheduled_date) { if (wk.includes(r.scheduled_date)) out.push({ ...base, date: r.scheduled_date, start_date: r.scheduled_date, end_date: r.scheduled_date }); }
      else for (const d of wk) if (dowOf(d) === r.day_of_week) out.push({ ...base, date: d, start_date: wk[0], end_date: wk[6] });
    }
    return out;
  };
  const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webp': 'image/webp', '.woff2': 'font/woff2' };
  const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
  const srv = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    let body = ''; for await (const ch of req) body += ch;
    try {
      if (p === '/__db') return send(res, 200, { rows: sq.prepare('SELECT * FROM class_schedules ORDER BY id').all(), week: WEEK, today: TODAY });
      if (p === '/__reset') { seed(); return send(res, 200, { ok: true }); }
      if (p === '/__ph54.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><link rel="stylesheet" href="/css/admin-inline-c.css"></head>
<body><div id="card-teacher-mgmt"></div><script src="/js/adm-q6.js"></script></body></html>`);
      }
      if (p === '/api/admin/class-schedules/move' && req.method === 'PATCH') {
        const r = await move(env, { ok: true, username: 'admin', name: '관리자', isTeacher: false }, JSON.parse(body || '{}'));
        return send(res, r.status || 200, r);
      }
      if (p === '/api/admin/schedules') return send(res, 200, { ok: true, schedules: cards(url.searchParams.get('week')) });
      if (p === '/api/admin/teachers') return send(res, 200, { ok: true, items: sq.prepare('SELECT id, name FROM teachers').all().map(t => ({ ...t, category: 'office' })) });
      if (p === '/api/admin/reports/c24-mirror') return send(res, 200, { ok: true, rows: [] });
      if (p.startsWith('/api/')) return send(res, 200, { ok: true, items: [], events: [], rows: [] });
      let f = join(PUB, decodeURIComponent(p));
      if (!f.startsWith(PUB)) return send(res, 403, {});
      if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
      if (!existsSync(f)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(readFileSync(f));
    } catch (e) { send(res, 500, { ok: false, error: String(e) }); }
  });
  srv.listen(0, '127.0.0.1', () => console.log('READY ' + srv.address().port));
  await new Promise(() => {});
}

/* ═════════════ 부모: 브라우저 ═════════════ */
const { requireBrowser } = await import('./_pw.mjs');
const { chromium, exe } = requireBrowser();
const tmp = mkdtempSync(join(tmpdir(), 'sds-'));
writeFileSync(join(tmp, 'hooks.mjs'), `import { existsSync } from 'node:fs'; import { fileURLToPath } from 'node:url';
export async function resolve(spec, ctx, next) {
 if ((spec.startsWith('./') || spec.startsWith('../')) && !/\\.(ts|js|mjs|json)$/.test(spec) && ctx.parentURL) {
  const u = new URL(spec + '.ts', ctx.parentURL); if (existsSync(fileURLToPath(u))) return next(u.href, ctx);
 } return next(spec, ctx);
}`);
writeFileSync(join(tmp, 'reg.mjs'), `import { register } from 'node:module'; register('./hooks.mjs', import.meta.url);`);
const child = spawn(process.execPath, ['--experimental-strip-types', '--no-warnings', '--import', join(tmp, 'reg.mjs'), SELF], { env: { ...process.env, SDS_CHILD: '1' } });
let childErr = '';
child.stderr.on('data', d => { childErr += d; });
const port = await new Promise((ok, no) => {
  child.stdout.on('data', d => { const m = String(d).match(/READY (\d+)/); if (m) ok(Number(m[1])); });
  child.on('exit', c => no(new Error('server exited ' + c + '\n' + childErr)));
  setTimeout(() => no(new Error('server timeout\n' + childErr)), 30000);
});
const BASE = 'http://127.0.0.1:' + port;
let pass = 0, fail = 0;
const check = (n, ok, d) => { if (ok) { pass++; console.log('✅ ' + n); } else { fail++; console.log('❌ FAIL ' + n + ' — ' + JSON.stringify(d)?.slice(0, 500)); } };
const db = async () => (await fetch(BASE + '/__db')).json();
const reset = async () => (await fetch(BASE + '/__reset')).json();
const browser = await chromium.launch({ executablePath: exe, headless: true });
const ROUNDS = Number(process.env.ROUNDS || 120);
try {
  /* ── ① 강사 스케줄 캘린더(adm-q6) ── */
  console.log('\n[①] 관리자 › 강사 스케줄 캘린더 (js/adm-q6.js)');
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1300 }, timezoneId: 'Asia/Seoul', locale: 'ko-KR' });
  const page = await ctx.newPage();
  const pageErrors = []; page.on('pageerror', e => pageErrors.push(String(e)));
  let dialogs = [], answer = true;
  page.on('dialog', async d => { dialogs.push(d.message()); answer ? await d.accept() : await d.dismiss(); });
  const openCal = async () => {
    await page.goto(BASE + '/__ph54.html');
    await page.waitForFunction(() => document.getElementById('card-teacher-schedule'));
    await page.evaluate(() => { const s = document.getElementById('card-teacher-schedule'); s.open = true; s.dispatchEvent(new Event('toggle')); });
    await page.waitForSelector('#ph54-teacher-filter');
    await page.selectOption('#ph54-teacher-filter', '1');
    await page.waitForFunction(() => document.querySelectorAll('.ph54-ev').length > 0);
  };
  const W = (await db()).week;
  await openCal();
  // 카드·열 좌표
  const geo = async (name) => page.evaluate((nm) => {
    const card = [...document.querySelectorAll('.ph54-ev')].find(e => e.textContent.includes(nm));
    const cols = [...document.querySelectorAll('#ph54-cal-track .ph54-cal-col')].map(c => { const r = c.getBoundingClientRect(); return { day: +c.dataset.day, x: r.left + r.width / 2, top: r.top, h: r.height }; });
    if (!card) return { cols };
    const r = card.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + 4, top: r.top, h: r.height, drag: card.getAttribute('draggable'), cols };
  }, name);
  const yFor = (col, min) => col.top + (min - 360) / (18 * 60) * col.h;
  const drag = async (from, toX, toY) => {
    await page.mouse.move(from.x, from.y); await page.mouse.down();
    await page.mouse.move(from.x + 5, from.y + 5, { steps: 3 });
    await page.mouse.move(toX, toY, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(500);
  };
  const toast = () => page.evaluate(() => (document.getElementById('ph54-toast') || {}).textContent || '');
  const rowsOf = async (uid) => (await db()).rows.filter(r => r.user_id === uid);
  // 캘린더 본문은 #ph54-cal-body(max-height 560px) 안에서 굴러간다 — 사람처럼 «원래 자리와 놓을 자리» 가
  //   둘 다 보이게 먼저 굴린 뒤, 카드 «가운데» 를 잡아 «카드 위 끝이 그 시각» 이 되도록 놓는다.
  //   (예전 판은 머리글 밑·화면 밖 좌표로 끌어 드롭이 아예 안 일어났다 — 시험 쪽 결함)
  const minOfCard = (t) => { const m = /(\d{2}):(\d{2})/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : 600; };
  const moveCard = async (name, day, min) => {
    const g0 = await geo(name); if (!g0.x) return { ok: false, why: 'card' };
    const fromMin = await page.evaluate((nm) => { const c = [...document.querySelectorAll('.ph54-ev')].find(e => e.textContent.includes(nm)); return c ? c.textContent : ''; }, name).then(minOfCard);
    await page.evaluate(([a, b]) => { const body = document.getElementById('ph54-cal-body'), col = document.querySelector('#ph54-cal-track .ph54-cal-col');
      if (!body || !col) return;
      // ⚠️ 관리자 화면은 zoom 이 걸려 «화면 px» 과 scrollTop(px) 이 다르다 — 비율을 재서 나눈다.
      const zoom = body.getBoundingClientRect().height / body.clientHeight || 1;
      const cr = col.getBoundingClientRect(), y = m => cr.top + (m - 360) / (18 * 60) * cr.height;
      const head = document.querySelector('.ph54-cal-dayhead'), headBottom = head ? head.getBoundingClientRect().bottom : body.getBoundingClientRect().top;
      // 붙어 있는(sticky) 요일 머리글 «밑» 으로 위쪽 시각이 40px 내려오게 — 머리글 위로 놓으면 드롭이 안 일어난다
      body.scrollTop += (y(Math.min(a, b)) - (headBottom + 40)) / zoom; }, [fromMin, min]);
    await page.waitForTimeout(60);
    const g = await geo(name); const c = g.cols.find(x => x.day === day);
    const grabY = g.top + Math.min(10, (g.h || 28) / 2);
    const ty = yFor(c, min) + (grabY - g.top);
    const hit = await page.evaluate(([x, y, gx, gy]) => { const a = document.elementFromPoint(gx, gy), b = document.elementFromPoint(x, y);
      return { src: !!(a && a.closest('.ph54-ev')), dst: !!(b && b.closest('.ph54-cal-col, .ph54-ev')) }; }, [c.x, ty, g.x, grabY]);
    await drag({ x: g.x, y: grabY }, c.x, ty);
    return { ok: hit.src && hit.dst, hit };
  };

  // 1) 날짜 지정 수업 14:20(수) → 금 16:40 (고치기 전: 날짜가 안 바뀌던 그 경우)
  let g = await geo('김아이');
  check('전제: 카드가 그려지고 끌 수 있다', g.x && g.drag === 'true', g);
  let col;
  dialogs = []; answer = true;
  check('1) 전제: 원래 자리·놓을 자리가 둘 다 화면에 보인다', (await moveCard('김아이', 4, 16 * 60 + 40)).ok);
  await page.waitForFunction(() => /저장됨|저장하지/.test((document.getElementById('ph54-toast') || {}).textContent || ''), null, { timeout: 5000 }).catch(() => {});
  let r = (await rowsOf('kid'))[0];
  check('1) 확인 창이 «지금 → 바꿀 곳» 을 말했다', dialogs.length === 1 && /14:20/.test(dialogs[0]) && /16:40/.test(dialogs[0]) && new RegExp(W[4]).test(dialogs[0]), dialogs);
  check('1) DB: 날짜·시각이 실제로 금 16:40 으로 (요일만 바뀌던 옛 결함 없음)', r.scheduled_date === W[4] && r.start_time === '16:40' && r.teacher_id === '1', r);
  check('1) 화면: 다시 읽은 카드가 금요일 열에 있다', await page.evaluate((d) => { const c = [...document.querySelectorAll('.ph54-ev')].find(e => e.textContent.includes('김아이')); return c && +c.closest('.ph54-cal-col').dataset.day === d; }, 4));
  check('1) ✅ 와 되돌리기 버튼이 보이고 «맨 위» 다', /✅/.test(await toast()) && await page.evaluate(() => { const b = document.querySelector('#ph54-undo button'); if (!b) return false; const q = b.getBoundingClientRect(); return document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2) === b; }));
  await page.click('#ph54-undo button');
  await page.waitForFunction(() => /되돌렸/.test((document.getElementById('ph54-toast') || {}).textContent || ''), null, { timeout: 5000 }).catch(() => {});
  r = (await rowsOf('kid'))[0];
  check('1) ↩ 되돌리기 → DB 가 원래 수 14:20 으로', r.scheduled_date === W[2] && r.start_time === '14:20', r);

  // 2) 취소하면 아무것도 안 바뀐다
  const before2 = JSON.stringify((await db()).rows);
  answer = false; dialogs = [];
  await moveCard('김아이', 5, 11 * 60);
  check('2) 확인 창에서 취소 → DB 그대로', dialogs.length === 1 && JSON.stringify((await db()).rows) === before2, dialogs);
  answer = true;

  // 3) 그룹 3명 → 함께 옮겨진다
  dialogs = [];
  const mv3 = await moveCard('그룹g1', 5, 9 * 60 + 30);
  check('3) 전제: 원래 자리·놓을 자리가 둘 다 화면에 보인다', mv3.ok, mv3);
  await page.waitForTimeout(600);
  const grp = (await db()).rows.filter(x => /^g\d$/.test(x.user_id));
  check('3) 확인 창이 «그룹 3명이 함께» 를 말했다', /3/.test(dialogs[0] || '') && /그룹/.test(dialogs[0] || ''), dialogs);
  check('3) DB: 그룹 3명 전부 토 09:30 (수업이 안 쪼개진다)', grp.length === 3 && grp.every(x => x.scheduled_date === W[5] && x.start_time === '09:30'), grp);

  // 4) 매주 반복 → 요일만 바뀌고 날짜가 박히지 않는다
  dialogs = [];
  await moveCard('매주학생', 2, 19 * 60);
  await page.waitForTimeout(600);
  r = (await rowsOf('rec'))[0];
  check('4) 확인 창이 «매주 바뀝니다» 를 말했다', /매주/.test(dialogs[0] || ''), dialogs);
  check('4) DB: 반복 행은 요일 Wed·19:00, 날짜가 박히지 않았다(«매주» 유지)', r.day_of_week === 'Wed' && r.start_time === '19:00' && !r.scheduled_date, r);

  // 5) 카페24 미러 → 사람 손 도장
  await moveCard('미러학생', 1, 11 * 60);
  await page.waitForTimeout(600);
  r = (await rowsOf('mir'))[0];
  check('5) 카페24 미러 행: 시각 이동 + «사람 손» 도장(밤 미러가 안 되돌림)', r.start_time === '11:00' && r.source === 'c24-mirror:manual', r);

  // 6) 겹치는 자리 → 서버 거절, DB·화면 그대로, 사유를 말함
  //    ⚠️ «같은 강사·정확히 같은 시각·같은 길이» 는 서버가 «그룹 합류» 로 받는다(설계 — schedule-conflict.ts).
  //    그래서 «엇갈려 겹치는» 15:10 에 놓는다.
  const before6 = JSON.stringify((await db()).rows);
  await moveCard('김아이', 4, 15 * 60 + 10);
  await page.waitForFunction(() => /저장하지/.test((document.getElementById('ph54-toast') || {}).textContent || ''), null, { timeout: 5000 }).catch(() => {});
  check('6) 겹침: DB 한 글자도 안 바뀜', JSON.stringify((await db()).rows) === before6);
  check('6) 겹침: «❌ 저장하지 못했습니다(옮기지 않음)» + 사유', /❌/.test(await toast()) && /겹/.test(await toast()), await toast());
  check('6) 겹침: 카드는 원래 자리(수요일)에 그대로', await page.evaluate(() => { const c = [...document.querySelectorAll('.ph54-ev')].find(e => e.textContent.includes('김아이')); return c && +c.closest('.ph54-cal-col').dataset.day === 2; }));

  // 7) LMS 점유칸은 끌리지 않는다
  g = await geo('LMS 점유');
  check('7) LMS 점유칸: draggable 아님', g.x && g.drag === null, g);

  // 8) 무작위 왕복 — ROUNDS 회 (끌기 → 저장 → 되돌리기)
  await reset(); await openCal();
  let roundsOk = 0, refusals = 0; const bad = [];
  for (let i = 0; i < ROUNDS; i++) {
    const before = (await rowsOf('kid'))[0];
    // 원래 시각 ±4시간 안(본문 560px 에 둘 다 보이는 범위) · 07:00~22:50
    const cur = +before.start_time.slice(0, 2) * 60 + +before.start_time.slice(3);
    const lo = Math.max(7 * 60, cur - 240), hi = Math.min(22 * 60 + 50, cur + 240);
    const day = Math.floor(Math.random() * 7), min = lo + 10 * Math.floor(Math.random() * ((hi - lo) / 10 + 1));
    const mv = await moveCard('김아이', day, min);
    if (!mv.ok) { bad.push({ i, why: '시험 전제: 화면에 안 보이는 좌표', mv }); continue; }
    await page.waitForFunction(() => /저장됨|저장하지|취소/.test((document.getElementById('ph54-toast') || {}).textContent || ''), null, { timeout: 4000 }).catch(() => {});
    const t = await toast(); const after = (await rowsOf('kid'))[0];
    const same = day === 2 && after.start_time === before.start_time;
    if (/✅/.test(t)) {
      const m = t.match(/(\d{4}-\d{2}-\d{2}) \([^)]*\) (\d{2}:\d{2})/);
      if (!m || after.scheduled_date !== m[1] || after.start_time !== m[2]) bad.push({ i, why: '토스트와 DB 가 다르다', t, after });
      if (after.scheduled_date !== W[day]) bad.push({ i, why: '놓은 요일과 DB 날짜가 다르다', day, after });
      const diff = Math.abs((+after.start_time.slice(0, 2) * 60 + +after.start_time.slice(3)) - min);
      if (diff > 10) bad.push({ i, why: '놓은 시각과 10분 넘게 차이', min, after });
      roundsOk++;
      if (await page.$('#ph54-undo button')) {
        await page.click('#ph54-undo button');
        const ut = await page.waitForFunction(() => /되돌렸|저장하지/.test((document.getElementById('ph54-toast') || {}).textContent || ''), null, { timeout: 8000 }).then(() => 'done', () => 'timeout');
        const back = (await rowsOf('kid'))[0];
        if (back.scheduled_date !== before.scheduled_date || back.start_time !== before.start_time)
          bad.push({ i, why: '되돌리기 후 원래와 다르다', ut, toast: await toast(), was: before.scheduled_date + ' ' + before.start_time, moved: after.scheduled_date + ' ' + after.start_time, back: back.scheduled_date + ' ' + back.start_time });
      } else bad.push({ i, why: '되돌리기 버튼이 없다' });
    } else if (/❌/.test(t)) {
      refusals++;
      if (after.scheduled_date !== before.scheduled_date || after.start_time !== before.start_time) bad.push({ i, why: '거절됐는데 DB 가 바뀜', t });
    } else if (!same && JSON.stringify(after) !== JSON.stringify(before)) bad.push({ i, why: '알림 없이 DB 가 바뀜', t });
    await page.evaluate(() => { const e = document.getElementById('ph54-toast'); if (e) e.textContent = ''; });
  }
  check(`8) 진짜 마우스 무작위 왕복 ${ROUNDS}회 — 저장·되돌림 ${roundsOk} · 겹침 거절 ${refusals} · 어긋남 0`, bad.length === 0 && roundsOk > ROUNDS * 0.5, bad.slice(0, 3));
  check('①) 페이지 오류(JS 예외) 0건', pageErrors.length === 0, pageErrors.slice(0, 3));
  await ctx.close();

  /* ── ② 주간 전체 스케줄(weekly-schedule.html) — 같은 서버 이동 모듈 ── */
  console.log('\n[②] 주간 전체 스케줄 (admin/weekly-schedule.html)');
  await reset();
  const c2 = await browser.newContext({ viewport: { width: 1600, height: 1000 }, timezoneId: 'Asia/Seoul', locale: 'ko-KR' });
  await c2.addInitScript(() => { try { localStorage.setItem('mangoi_admin_welcome_v1_done', '1'); } catch (e) {} });
  const p2 = await c2.newPage();
  const errs2 = []; p2.on('pageerror', e => errs2.push(String(e)));
  p2.on('dialog', d => d.accept());
  await p2.goto(BASE + '/admin/weekly-schedule.html');
  await p2.waitForFunction(() => typeof SLOTS !== 'undefined' && Object.keys(SLOTS).length > 0, null, { timeout: 15000 }).catch(() => {});
  const T = (await db()).today;
  // 작업면은 «일간» 뷰 — 주간 개요에는 data-hour 칸이 없다. 오늘 요일로 내려간다.
  const todayDow = (new Date(T + 'T00:00:00Z').getUTCDay() + 6) % 7;
  await p2.click('.view-toggle button[data-view="day"]');
  await p2.evaluate((d) => { const b = document.querySelector('#day-picker button[data-dow="' + d + '"]'); if (b) b.click(); }, todayDow);
  await p2.waitForTimeout(300);
  // ⚠️ 두 칸을 «따로» scrollIntoView 하면 두 번째가 화면을 굴려 첫 칸 좌표가 낡는다 — 한 번만 굴리고 둘 다 잰다
  const cells = (a, b) => p2.evaluate(([d, a, b]) => {
    const q = (t) => document.querySelector(`td[data-tid="${t[0]}"][data-date="${d}"][data-hour="${t[1]}"][data-min="${t[2]}"]`);
    const A = q(a), B = b ? q(b) : null; if (!A || (b && !B)) return null;
    A.scrollIntoView({ block: 'center', inline: 'center' });
    const at = (td) => { const r = td.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; const top = document.elementFromPoint(x, y);
      return { x, y, slot: !!td.dataset.slot, visible: !!(top && top.closest('td') === td) }; };
    return { src: at(A), dst: B ? at(B) : null };
  }, [T, a, b]);
  const cell = async (tid, h, m) => { const c = await cells([tid, h, m], null); return c && c.src; };
  let src = await cell('1', 14, 0);
  check('② 전제: 오늘 일간 작업면에 수업 칸이 있다', src && src.slot, src);
  if (src) {
    await p2.evaluate(() => { if (typeof wsSetEditing === 'function') wsSetEditing(true, { quiet: true }); });
    const doDrag = async (s, d) => { await p2.mouse.move(s.x, s.y); await p2.mouse.down(); for (let i = 1; i <= 12; i++) await p2.mouse.move(s.x + (d.x - s.x) * i / 12, s.y + (d.y - s.y) * i / 12); await p2.mouse.up(); await p2.waitForTimeout(400); };
    // 같은 강사·다른 시각 → 「연기」
    const clickMode = async (m) => { try { await p2.click(`[data-move-mode="${m}"]`, { timeout: 3000 }); return true; } catch (e) { return false; } };
    // ⓪ 매니저가 아닌 사람이 «이미 지난/30분 안» 수업을 「연기」 → 화면이 거절하고 서버에 아무것도 안 보낸다(설계)
    //    — 오늘 14:00 수업은 시험 시각에 따라 지났을 수도 있으므로 «지났을 때만» 이 검사를 한다.
    const kstNowMin = (() => { const k = new Date(Date.now() + 9 * 3600e3); return k.getUTCHours() * 60 + k.getUTCMinutes(); })();
    if (kstNowMin > 14 * 60 - 30) {
      const before0 = JSON.stringify((await db()).rows);
      const p0 = await cells(['1', 14, 0], ['1', 15, 30]);
      if (p0) { await doDrag(p0.src, p0.dst); await clickMode('postpone'); await p2.waitForTimeout(700); }
      const rejected = await p2.evaluate(() => /연기|Postpone/.test(document.body.innerText) && !!document.querySelector('.modal-overlay.show, .modal.show, [class*="modal"][style*="flex"]'));
      check('②-0 비매니저: 지난 수업 「연기」는 거절, DB 그대로', JSON.stringify((await db()).rows) === before0, { rejected });
      await p2.evaluate(() => { if (typeof closeModal === 'function') closeModal(); });
    }
    // 이후는 관리자 신원(매니저 — 시간 제한 면제)으로
    await p2.evaluate(() => { localStorage.setItem('admin_session', JSON.stringify({ uid: 'admin' })); });
    await p2.reload();
    await p2.waitForFunction(() => typeof SLOTS !== 'undefined' && Object.keys(SLOTS).length > 0, null, { timeout: 15000 }).catch(() => {});
    await p2.click('.view-toggle button[data-view="day"]');
    await p2.evaluate((d) => { const b = document.querySelector('#day-picker button[data-dow="' + d + '"]'); if (b) b.click(); if (typeof wsSetEditing === 'function') wsSetEditing(true, { quiet: true }); }, todayDow);
    await p2.waitForTimeout(300);
    let pr = await cells(['1', 14, 0], ['1', 15, 30]);
    check('② 전제: 끌 칸·놓을 칸이 둘 다 화면 맨 위에 보인다', pr && pr.src.visible && pr.dst.visible, pr);
    await doDrag(pr.src, pr.dst);
    const modal = await p2.evaluate(() => !!document.querySelector('[data-move-mode="postpone"]'));
    check('② 끌면 «연기/변경» 확인 창이 뜬다', modal);
    await clickMode('postpone'); await p2.waitForTimeout(900);
    let w = (await rowsOf('today1'))[0];
    check('② 연기: DB 가 오늘 15:30 으로', w.start_time === '15:30' && w.scheduled_date === T && w.teacher_id === '1', w);
    // 다른 강사 줄로 → 「변경」(강사까지)
    pr = await cells(['1', 15, 30], ['2', 13, 0]);
    if (pr && pr.src.visible && pr.dst.visible) {
      await doDrag(pr.src, pr.dst);
      await clickMode('change'); await p2.waitForTimeout(900);
      w = (await rowsOf('today1'))[0];
      check('② 변경: DB 가 BETA·13:00 으로 (강사까지)', w.start_time === '13:00' && w.teacher_id === '2', w);
    } else check('② 전제: BETA 줄 칸을 찾았다', false, pr);
    // 겹치는 자리(BETA 17:00 수업 위)는 화면이 먼저 막는다
    pr = await cells(['2', 13, 0], ['2', 17, 0]);
    const before = JSON.stringify((await db()).rows);
    check('② 전제: 겹침 시험 칸이 보인다', pr && pr.src.visible && pr.dst.visible, pr);
    if (pr) { await doDrag(pr.src, pr.dst); await clickMode('postpone'); await clickMode('change'); await p2.waitForTimeout(600); }
    check('② 이미 수업이 있는 칸에 놓으면 저장 안 됨', JSON.stringify((await db()).rows) === before);
  }
  check('②) 페이지 오류(JS 예외) 0건', errs2.length === 0, errs2.slice(0, 3));
  await c2.close();
} finally {
  await browser.close();
  child.kill();
  rmSync(tmp, { recursive: true, force: true });
}
console.log(`\n스케줄 드래그 샌드박스: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
