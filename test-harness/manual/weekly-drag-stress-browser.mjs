/**
 * 🧪 주간 스케줄 «연기·변경» 드래그 스트레스 (2026-10-04 사장님
 *   「샌드박스랑 하니스를 이용해서 수업연기,변경 드래그 테스트를 수백번 해서 문제없을때까지」
 *   「반드시 학생,교사 수업 스케줄 캘린더에서 잘 이동하고 표시되게」).
 *
 *  ▸ 진짜 Worker(src/index.ts 를 esbuild 로 번들) + 메모리 SQLite(D1 모양) + 진짜 Chromium.
 *    화면은 배포되는 public/ 그대로이고 /api 만 그 Worker 로 보냅니다. 운영 D1·네트워크 0.
 *  ▸ 매 회차: 무작위 수업을 실제 마우스로 끌어 → 「연기」/「변경」/「아니요」 중 하나를 누름 →
 *    ① DB 행 ② 학생 «내 수업»(/api/class/schedule/mine) ③ 강사 주간 캘린더(/api/teacher/portal?week=)
 *    ④ 관리자 주간(/api/admin/schedules) ⑤ 화면 격자 칸 — 다섯 곳이 «같은 자리» 를 말하는지 대조.
 *  ▸ 자동으로 안 돕니다(manual/). 사람이 부릅니다:
 *      PW_DIR=/tmp/pw node test-harness/manual/weekly-drag-stress-browser.mjs [회차=300] [seed=1]
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import http from 'node:http';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = join(ROOT, 'cloudflare-deploy/src');
const PUBLIC = join(ROOT, 'cloudflare-deploy/public');
const SELF = fileURLToPath(import.meta.url);
const KST = 9 * 3600000;
const pad = n => String(n).padStart(2, '0');
const ymd = ms => { const d = new Date(ms + KST); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); };
/* 다음 주 월요일(KST) — 모든 수업이 «앞으로» 라 학생 «내 수업» 이 거르지 않는다. */
function nextMonday() {
  const k = new Date(Date.now() + KST); const wd = (k.getUTCDay() + 6) % 7;
  return ymd(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()) - KST + (7 - wd) * 86400000);
}
const addDays = (date, n) => ymd(Date.parse(date + 'T00:00:00+09:00') + n * 86400000);
/* 🧬 변이시험 — 화면을 «일부러 고장 낸» 판으로 서빙해 이 하니스가 실제로 잡는지 본다.
   WDS_MUT=<이름> node … 로 부르면 FAIL 이 나와야 정상(안 나오면 하니스가 헛도는 것). */
const MUTATIONS = {
  'drop-teacher': ['if(newTeacherId) body.teacher_id=String(newTeacherId);', ''],
  'off-by-10': ['var body={ start_time: minLabel(startMin) };', 'var body={ start_time: minLabel(startMin+10) };'],
  'split-group': ['var ids=(slot.ids&&slot.ids.length)?slot.ids.slice():(slot.id?[slot.id]:[]);', 'var ids=slot.id?[slot.id]:[];'],
  'undo-keeps-teacher': ['info.prev.teacherId, null, {undo:true}', 'null, null, {undo:true}'],
  'postpone-any-teacher': ["(ctx.movedTeacher?' disabled title=", "(false?' disabled title="],
  'unlock-without-yes': ["dnd.locked=!wsEditing();", "dnd.locked=!wsEditing(); if(dnd.locked) wsSetEditing(true,{quiet:true});"],
};
const DOW3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dowOf = date => new Date(date + 'T00:00:00Z').getUTCDay();

/* ═══════════════════════════ 자식: Worker + SQLite + HTTP ═══════════════════════════ */
if (process.env.WDS_SERVER === '1') {
  globalThis.fetch = async () => { throw new Error('external network forbidden'); };
  console.warn = () => {}; console.log = (...a) => process.stdout.write(a.join(' ') + '\n');
  const { DatabaseSync } = await import('node:sqlite');
  const sq = new DatabaseSync(':memory:');
  const norm = v => (v === undefined ? null : (typeof v === 'boolean' ? (v ? 1 : 0) : v));
  const mkStmt = (sql, args) => ({
    sql, args,
    bind: (...b) => mkStmt(sql, b.map(norm)),
    async first(col) { const r = sq.prepare(sql).get(...args); if (!r) return null; const o = { ...r }; return col ? o[col] : o; },
    async all() { return { results: sq.prepare(sql).all(...args).map(r => ({ ...r })), success: true, meta: {} }; },
    async run() { const r = sq.prepare(sql).run(...args); return { success: true, meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } }; },
    async raw() { return sq.prepare(sql).all(...args).map(r => Object.values(r)); },
  });
  const DB = {
    prepare: sql => mkStmt(sql, []),
    async exec(sql) { sq.exec(sql); return { count: 1 }; },
    async batch(stmts) { sq.exec('BEGIN IMMEDIATE'); try { const out = []; for (const s of stmts) out.push(await s.run()); sq.exec('COMMIT'); return out; } catch (e) { sq.exec('ROLLBACK'); throw e; } },
    dump: async () => new ArrayBuffer(0),
  };
  const kvMap = new Map();
  const KV = {
    async get(k, t) { const v = kvMap.get(k); if (v == null) return null; return t === 'json' ? JSON.parse(v) : v; },
    async put(k, v) { kvMap.set(k, String(v)); }, async delete(k) { kvMap.delete(k); },
    async list() { return { keys: [...kvMap.keys()].map(name => ({ name })), list_complete: true }; },
  };
  const env = new Proxy({ DB, ADMIN_PASSWORD: 'harness-pw', ROOM_JWT_SECRET: 'local-drag-stress-secret' }, {
    get(t, p) { if (p in t) return t[p]; if (typeof p === 'string' && /^[A-Z_]+$/.test(p) && /KV|STATE|CACHE|SESS/.test(p)) return KV; return undefined; },
  });
  const { createRequire } = await import('node:module');
  const require = createRequire(join(ROOT, 'cloudflare-deploy/package.json'));
  const bundle = async entry => (await import('data:text/javascript;base64,' + Buffer.from(require('esbuild').buildSync({ entryPoints: [join(SRC, entry)], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' }).outputFiles[0].text).toString('base64')));
  const worker = (await bundle('index.ts')).default;
  const { signUidToken } = await bundle('auth-token.ts');
  const wctx = { waitUntil() {}, passThroughOnException() {} };
  const BASE = 'https://mangoi.ai';
  const prime = (p, cookie) => worker.fetch(new Request(BASE + p, { headers: cookie ? { cookie: 'mango_admin_session=' + cookie } : {} }), env, wctx).catch(() => null);
  const { checkAdminSession } = await bundle('auth-admin.ts');
  const { getScope } = await bundle('scope.ts');
  await checkAdminSession(new Request(BASE + '/x', { headers: { cookie: 'mango_admin_session=prime' } }), env);
  await getScope(env, new Request(BASE + '/x'));
  await prime('/api/admin/me', 'prime');
  await prime('/api/class/sessions/today?user_id=prime');
  const adminSrc = readFileSync(join(SRC, 'api-admin.ts'), 'utf8');
  const cutCreate = (src, name, must) => { const re = new RegExp('`(CREATE TABLE IF NOT EXISTS ' + name + '\\s*\\([\\s\\S]*?\\);?)`', 'g'); let m; while ((m = re.exec(src))) { if (!must || m[1].includes(must)) return m[1]; } return null; };
  const tIdx = adminSrc.indexOf('`CREATE TABLE IF NOT EXISTS teachers (`'); const tEnd = adminSrc.indexOf("].join(' ')", tIdx);
  const teachersDDL = [...adminSrc.slice(tIdx, tEnd).matchAll(/`([^`]*)`/g)].map(m => m[1]).join(' ');
  for (const d of [teachersDDL, cutCreate(adminSrc, 'students_erp', 'user_id TEXT PRIMARY KEY, korean_name'), cutCreate(adminSrc, 'teacher_account_links')]) sq.exec(d);
  const T0 = Date.parse('2026-09-01T00:00:00Z'), FAR = Date.parse('2030-01-01T00:00:00Z');
  const ins = (sql, ...a) => sq.prepare(sql).run(...a);
  const TEACHERS = [[1, 'ALPHA', 't_alpha'], [2, 'BETA', 't_beta'], [3, 'GAMMA', 't_gamma']];
  for (const [id, n, u] of TEACHERS) {
    ins(`INSERT INTO teachers (id, name, active, created_at, updated_at) VALUES (?,?,1,?,?)`, id, n, T0, T0);
    ins(`INSERT INTO admin_account (username, password_hash, name, created_at, updated_at) VALUES (?, 'x', ?, ?, ?)`, u, n, T0, T0);
    ins(`INSERT OR REPLACE INTO admin_scope (username, scope_type, scope_value, updated_at) VALUES (?, 'teacher', NULL, ?)`, u, T0);
    ins(`INSERT INTO teacher_account_links (username, teacher_id, teacher_name, linked_by, linked_at) VALUES (?,?,?,'h',?)`, u, String(id), n, T0);
    ins(`INSERT INTO admin_sessions (token, username, created_at, expires_at, last_seen_at) VALUES (?,?,?,?,?)`, 'tok_' + u, u, T0, FAR, T0);
  }
  ins(`INSERT OR REPLACE INTO admin_scope (username, scope_type, scope_value, updated_at) VALUES ('admin','hq',NULL,?)`, T0);
  ins(`INSERT INTO admin_sessions (token, username, created_at, expires_at, last_seen_at) VALUES ('tok_admin','admin',?,?,?)`, T0, FAR, T0);
  const MON = process.env.WDS_MON;
  const plan = JSON.parse(process.env.WDS_PLAN);
  for (const c of plan) {
    if (!sq.prepare('SELECT 1 FROM students_erp WHERE user_id=?').get(c.user)) ins(`INSERT INTO students_erp (user_id, korean_name, created_at) VALUES (?,?,?)`, c.user, '학생' + c.user, T0);
    ins(`INSERT INTO class_schedules (user_id, student_name, schedule_kind, class_type, day_of_week, scheduled_date, start_time, duration_min, teacher_id, status, source, created_at)
         VALUES (?,?,?, 'regular', ?, ?, ?, 20, ?, 'active', 'harness', ?)`,
      c.user, '학생' + c.user, c.kind, c.kind === 'recurring' ? DOW3[dowOf(c.date)] : null, c.kind === 'recurring' ? null : c.date, c.time, String(c.tid), T0);
  }
  const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
  const server = http.createServer(async (req, res) => {
    try {
      const u = new URL(req.url, 'http://x');
      if (u.pathname === '/__h/token') { res.end(JSON.stringify({ token: await signUidToken(u.searchParams.get('uid'), env, 86400000) })); return; }
      if (u.pathname === '/__h/rows') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(sq.prepare("SELECT * FROM class_schedules WHERE source NOT LIKE 'zz%' ORDER BY id").all().map(r => ({ ...r })))); return; }
      if (u.pathname.startsWith('/api/')) {
        const chunks = []; for await (const c of req) chunks.push(c);
        const headers = {}; for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string' && !/^(host|connection|content-length)$/i.test(k)) headers[k] = v;
        const r = new Request(BASE + req.url, { method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined });
        const out = await worker.fetch(r, env, wctx);
        const hs = {}; out.headers.forEach((v, k) => { if (!/^(content-encoding|content-length|transfer-encoding)$/i.test(k)) hs[k] = v; });
        res.writeHead(out.status, hs); res.end(Buffer.from(await out.arrayBuffer())); return;
      }
      let p = join(PUBLIC, decodeURIComponent(u.pathname));
      if (!p.startsWith(PUBLIC)) { res.writeHead(403); res.end(); return; }
      if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
      if (!existsSync(p)) { res.writeHead(404); res.end('nf'); return; }
      res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' });
      let buf = readFileSync(p);
      const MUT = MUTATIONS[process.env.WDS_MUT || ''];
      if (MUT && p.endsWith('weekly-schedule.html')) {
        const t = buf.toString('utf8');
        if (!t.includes(MUT[0])) { process.stderr.write('MUTATION ANCHOR MISSING: ' + process.env.WDS_MUT + '\n'); process.exit(3); }
        buf = Buffer.from(t.replace(MUT[0], MUT[1]));
      }
      res.end(buf);
    } catch (e) { res.writeHead(500); res.end(String(e && e.stack || e)); }
  });
  server.listen(0, '127.0.0.1', () => process.stdout.write('READY ' + server.address().port + '\n'));
} else {
  await runParent();
}

async function runParent() {
  const N = Number(process.argv[2] || 300), SEED = Number(process.argv[3] || 1);
  let rnd = SEED >>> 0;
  const rand = () => { rnd = (rnd * 1664525 + 1013904223) >>> 0; return rnd / 4294967296; };
  const pick = a => a[Math.floor(rand() * a.length)];
  const MON = nextMonday();
  const DAYS = [0, 1, 2, 3, 4].map(i => addDays(MON, i));
  /* 빡빡하게: 사흘에 수업 12건 + 그룹 수업(같은 강사·같은 시각 학생 둘) 1개 — 겹침 거절·찬 칸이 실제로 나오게 */
  const plan = [];
  for (let i = 0; i < 12; i++) plan.push({ user: 'stu_' + String.fromCharCode(97 + i), kind: i % 4 === 3 ? 'recurring' : 'one_off', date: DAYS[i % 3], time: pad(9 + Math.floor(i / 3)) + ':' + pad((i % 3) * 20), tid: 1 + (i % 3) });
  plan.push({ user: 'stu_g1', kind: 'one_off', date: DAYS[1], time: '15:00', tid: 2 });
  plan.push({ user: 'stu_g2', kind: 'one_off', date: DAYS[1], time: '15:00', tid: 2 });
  const child = spawn(process.execPath, [SELF], { env: { ...process.env, WDS_SERVER: '1', WDS_MON: MON, WDS_PLAN: JSON.stringify(plan) }, stdio: ['ignore', 'pipe', 'inherit'] });
  const port = await new Promise((ok, no) => { let buf = ''; child.stdout.on('data', d => { buf += d; const m = buf.match(/READY (\d+)/); if (m) ok(Number(m[1])); }); child.on('exit', c => no(new Error('server exit ' + c))); });
  const ORIGIN = 'http://127.0.0.1:' + port;
  try { await stress({ N, rand, pick, MON, DAYS, ORIGIN, plan }); }
  finally { child.kill(); }
}

async function stress({ N, rand, pick, MON, DAYS, ORIGIN, plan }) {
  const req = createRequire(join(process.env.PW_DIR || '/tmp/pw', 'package.json'));
  const { chromium } = req('playwright-core');
  const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium'].find(existsSync);
  const browser = await chromium.launch({ executablePath: exe });
  const ctx = await browser.newContext({ viewport: { width: 2600, height: 1200 }, timezoneId: 'Asia/Seoul', locale: 'ko-KR' });
  await ctx.addCookies([{ name: 'mango_admin_session', value: 'tok_admin', url: ORIGIN }]);
  await ctx.addInitScript(() => { try { localStorage.setItem('admin_session', JSON.stringify({ uid: 'admin' })); } catch (e) {} });
  /* 🔎 진단 기록 — 확인창·저장 경로가 실제로 불렸는지(회차가 실패할 때만 출력) */
  await ctx.addInitScript(() => {
    window.__trace = [];
    const T = (k, x) => { window.__trace.push(Math.round(performance.now()) + ' ' + k + (x ? ' ' + x : '')); if (window.__trace.length > 60) window.__trace.shift(); };
    window.__T = T;
    for (const ev of ['mousedown', 'mouseup', 'click']) document.addEventListener(ev, e => T(ev, (e.target && (e.target.id || e.target.className || e.target.tagName) + '').slice(0, 60) + ' @' + e.clientX + ',' + e.clientY), true);
    const wrapLater = () => {
      for (const n of ['openModal', 'closeModal', 'showMoveConfirm', 'confirmMoveDo', 'confirmMoveAs', 'cancelMove']) {
        const f = window[n]; if (typeof f === 'function' && !f.__w) { const w = function () { T(n); return f.apply(this, arguments); }; w.__w = 1; try { window[n] = w; } catch (e) {} }
      }
      const rr = window.reloadAndRender;
      if (typeof rr === 'function' && !rr.__w) {
        const w = async function () { window.__rrStart = (window.__rrStart || 0) + 1; T('reload+'); try { return await rr.apply(this, arguments); } finally { window.__rrEnd = (window.__rrEnd || 0) + 1; T('reload-'); } };
        w.__w = 1; try { window.reloadAndRender = w; } catch (e) {}
      }
    };
    document.addEventListener('DOMContentLoaded', wrapLater); setTimeout(wrapLater, 1500); setTimeout(wrapLater, 4000);
  });
  const page = await ctx.newPage(); page.setDefaultTimeout(8000);
  const pageErrors = []; page.on('pageerror', e => pageErrors.push(String(e && e.message || e)));
  /* ⏳ «끝났다» 의 기준 — 진행 중인 /api 요청이 0 이고 화면의 reloadAndRender 가 다 끝났을 때.
     ⛔ waitForLoadState('networkidle') 는 쓰지 말 것 — 페이지가 한 번 idle 에 닿은 뒤에는 «즉시»
        돌아와서(새 idle 을 기다리지 않음) 저장 뒤 재읽기 «도중» 에 화면을 재게 된다(실측: 화면 칸만 옛 자리). */
  let inflight = 0;
  page.on('request', r => { if (r.url().includes('/api/')) inflight++; });
  const done = r => { if (r.url().includes('/api/')) inflight = Math.max(0, inflight - 1); };
  page.on('requestfinished', done); page.on('requestfailed', done);
  const patches = []; page.on('request', r => { if (r.url().includes('/api/admin/class-schedules/move')) patches.push(JSON.parse(r.postData() || '{}')); });

  let pass = 0, fail = 0; const fails = []; const tally = {};
  const ok = (name, cond, detail) => { if (cond) pass++; else { fail++; if (fails.length < 60) fails.push(name + (detail ? ' :: ' + String(detail).slice(0, 6000) : '')); } };
  const bump = k => { tally[k] = (tally[k] || 0) + 1; };
  const getJ = async (path, headers = {}) => { const r = await fetch(ORIGIN + path, { headers }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
  const tokens = {};
  for (const c of plan) tokens[c.user] = (await getJ('/__h/token?uid=' + c.user)).body.token;
  const TCOOKIE = { 1: 'tok_t_alpha', 2: 'tok_t_beta', 3: 'tok_t_gamma' };
  const toMin = t => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m; };
  const lab = m => pad(Math.floor(m / 60)) + ':' + pad(m % 60);
  const todayK = ymd(Date.now());

  /* 모델 — 서버가 «해야 할» 자리. rows 의 id 순서 = plan 순서. */
  const rows0 = (await getJ('/__h/rows')).body;
  const model = rows0.map((r, i) => ({ id: r.id, user: r.user_id, kind: r.schedule_kind, date: plan[i].date, time: r.start_time, tid: String(r.teacher_id) }));
  /* 화면은 같은 강사·같은 날·같은 시각·같은 종류를 한 칸(그룹)으로 묶어 한꺼번에 옮긴다 */
  const groupOf = c => model.filter(o => o.tid === c.tid && o.time === c.time && o.kind === c.kind && (c.kind === 'recurring' ? dowOf(o.date) === dowOf(c.date) : o.date === c.date));
  ok('전제: 씨앗 수업 ' + plan.length + '건', model.length === plan.length, JSON.stringify(rows0));

  await page.goto(ORIGIN + '/admin/weekly-schedule.html');
  await page.waitForFunction(() => typeof SLOTS !== 'undefined' && Object.keys(SLOTS).length > 0, null, { timeout: 20000 });
  await page.locator('#next-week').click();
  await page.waitForFunction(mon => String(currentWeekStart).includes(mon), new Date(MON + 'T00:00:00').toString().slice(4, 15), { timeout: 10000 });
  try { await page.locator('#guide-toast button').click({ timeout: 2500 }); } catch (e) {}
  await page.locator('[data-view="day"]').click();

  const overlaps = (aS, aE, bS, bE) => aS < bE && bS < aE;
  /* 그 날짜에 열리는가 — dated 는 날짜, recurring 은 요일 */
  const onDate = (c, date) => c.kind === 'recurring' ? dowOf(c.date) === dowOf(date) : c.date === date;
  function expectConflict(c, date, startMin, tid) {
    const g = groupOf(c), gid = new Set(g.map(x => x.id)), users = new Set(g.map(x => x.user));
    return model.some(o => !gid.has(o.id) && onDate(o, date) && (o.tid === tid || users.has(o.user))
      && overlaps(startMin, startMin + 20, toMin(o.time), toMin(o.time) + 20));
  }
  async function showDay(date) {
    const idx = DAYS.indexOf(date);
    await page.locator('#day-picker [data-dow="' + idx + '"]').click();
    await page.waitForFunction(d => !!document.querySelector('td.slot[data-date="' + d + '"]'), date, { timeout: 8000 });
  }
  const cellSel = (tid, date, m) => `td.slot[data-tid="${tid}"][data-date="${date}"][data-hour="${Math.floor(m / 60)}"][data-min="${m % 60}"]`;
  /* 화면이 재읽기로 칸을 «갈아 끼우는» 도중이면 그 칸을 다시 찾는다 — 사람은 보이는 칸을 끈다. */
  async function boxOf(sel) {
    for (let i = 0; i < 20; i++) {
      try { await page.locator(sel).scrollIntoViewIfNeeded({ timeout: 1500 }); const b = await page.locator(sel).boundingBox({ timeout: 1500 }); if (b) return b; }
      catch (e) { if (!/not attached|Timeout/.test(String(e && e.message))) throw e; }
      await page.waitForTimeout(50);
    }
    return null;
  }
  async function drag(srcSel, dstSel) {
    const a = await boxOf(srcSel), b = await boxOf(dstSel);
    if (!a || !b) return false;
    await page.mouse.move(a.x + Math.min(8, a.width / 2), a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 });
    await page.mouse.up();
    return true;
  }
  async function settle() {
    const end = Date.now() + 15000; let quietSince = 0;
    while (Date.now() < end) {
      const busy = inflight > 0 || await page.evaluate(() => (window.__rrStart || 0) !== (window.__rrEnd || 0)).catch(() => true);
      if (busy) quietSince = 0; else if (!quietSince) quietSince = Date.now(); else if (Date.now() - quietSince > 250) return true;
      await page.waitForTimeout(40);
    }
    ok('저장 뒤 화면 재읽기가 15초 안에 끝남', false);
    return false;
  }

  async function verifyAll(label) {
    const rows = (await getJ('/__h/rows')).body;
    const admin = (await getJ('/api/admin/schedules?week=' + MON, { cookie: 'mango_admin_session=tok_admin' })).body;
    const aItems = Array.isArray(admin) ? admin : (admin.items || []);
    const portals = {};
    for (const t of ['1', '2', '3']) portals[t] = (await getJ('/api/teacher/portal?week=' + MON, { cookie: 'mango_admin_session=' + TCOOKIE[t] })).body;
    const mines = {};
    for (const u of [...new Set(model.map(c => c.user))]) mines[u] = (await getJ('/api/class/schedule/mine?user_id=' + u, { authorization: 'Bearer ' + tokens[u] })).body;
    // 화면 — 지금 보이는 날의 칸들
    const ui = await page.evaluate(() => [...document.querySelectorAll('td.slot[data-slot]')].map(td => {
      let d = null; try { d = JSON.parse(decodeURIComponent(td.dataset.slot)); } catch (e) {}
      return { tid: td.dataset.tid, date: td.dataset.date, m: Number(td.dataset.hour) * 60 + Number(td.dataset.min || 0), ids: (d && d.slot && d.slot.ids) || [] };
    }));
    const uiDate = ui.length ? ui[0].date : null;
    for (const c of model) {
      const r = rows.find(x => x.id === c.id);
      ok(label + ' DB #' + c.id, r && r.status === 'active' && r.start_time === c.time && String(r.teacher_id) === c.tid
        && (c.kind === 'recurring' ? (r.day_of_week === DOW3[dowOf(c.date)] && !r.scheduled_date) : r.scheduled_date === c.date), JSON.stringify({ r, c }));
      const occDate = c.kind === 'recurring' ? DAYS[(dowOf(c.date) + 6) % 7] : c.date;
      const a = aItems.filter(x => Number(x.id) === c.id);
      ok(label + ' 관리자 주간 #' + c.id + ' 한 번·제자리', a.length === 1 && a[0].date === occDate && a[0].start_time === c.time && String(a[0].teacher_id) === c.tid, JSON.stringify({ a, c }));
      for (const t of ['1', '2', '3']) {
        const its = ((portals[t].week && portals[t].week.days) || []).flatMap(d => (d.items || []).filter(x => Number(x.id) === c.id).map(x => ({ ...x, date: d.date })));
        if (t === c.tid) ok(label + ' 강사' + t + ' 캘린더 #' + c.id + ' 제자리', its.length === 1 && its[0].date === occDate && String(its[0].start_time).slice(0, 5) === c.time, JSON.stringify({ its, c }));
        else ok(label + ' 강사' + t + ' 캘린더 #' + c.id + ' 유령 없음', its.length === 0, JSON.stringify(its));
      }
      const m = ((mines[c.user] && mines[c.user].schedules) || []).filter(x => Number(x.schedule_id) === c.id);
      const nd = m[0] && m[0].next_date;
      ok(label + ' 학생 «내 수업» #' + c.id, m.length === 1 && String(m[0].start_time).slice(0, 5) === c.time
        && (c.kind === 'recurring' ? (nd >= todayK && dowOf(nd) === dowOf(c.date)) : nd === c.date), JSON.stringify({ m, c }));
      if (uiDate) {
        const shown = ui.filter(x => x.ids.map(Number).includes(c.id));
        if (onDate(c, uiDate)) ok(label + ' 화면 칸 #' + c.id, shown.length === 1 && shown[0].tid === c.tid && shown[0].m === toMin(c.time), JSON.stringify({ shown, c }));
        else ok(label + ' 화면 다른 날 #' + c.id + ' 안 보임', shown.length === 0, JSON.stringify(shown));
      }
    }
    ok(label + ' 페이지 오류 0', pageErrors.length === 0, pageErrors.join(' | '));
  }

  await showDay(DAYS[0]);
  await verifyAll('시작');
  const t0 = Date.now();
  async function boot() {
    await page.goto(ORIGIN + '/admin/weekly-schedule.html');
    await page.waitForFunction(() => typeof SLOTS !== 'undefined' && Object.keys(SLOTS).length > 0, null, { timeout: 20000 });
    await page.locator('#next-week').click();
    await page.waitForFunction(mon => String(currentWeekStart).includes(mon), new Date(MON + 'T00:00:00').toString().slice(4, 15), { timeout: 10000 });
    try { await page.locator('#guide-toast button').click({ timeout: 2500 }); } catch (e) {}
    await page.locator('[data-view="day"]').click();
  }
  /* 서버가 «정답» — 예외로 회차가 끊기면 모델을 서버 행으로 다시 맞추고 화면을 새로 연다
     (예외 자체는 FAIL 로 이미 셌다). */
  async function recover() {
    const rows = (await getJ('/__h/rows')).body;
    for (const c of model) { const r = rows.find(x => x.id === c.id); if (r) { c.time = r.start_time; c.tid = String(r.teacher_id); } }
    await boot();
  }
  for (let it = 1; it <= N; it++) {
    const L = '#' + it;
    try {
    const day = pick(DAYS.filter(d => model.some(c => onDate(c, d))));
    await showDay(day);
    const here = model.filter(c => onDate(c, day));
    const c = pick(here);
    const srcSel = cellSel(c.tid, day, toMin(c.time));
    // 목적지 — 9:00~20:50, 10분 격자, 강사 셋 중 하나
    const sameTeacher = rand() < 0.55;
    const tid = sameTeacher ? c.tid : pick(['1', '2', '3'].filter(t => t !== c.tid));
    let m = rand() < 0.6 ? (9 * 60) + 10 * Math.floor(rand() * 30) : (9 * 60) + 10 * Math.floor(rand() * 72);
    if (tid === c.tid && m === toMin(c.time)) m += 30;
    const dstSel = cellSel(tid, day, m);
    if (!(await page.locator(dstSel).count())) { bump('skip-no-cell'); it--; continue; }
    const busyCell = await page.locator(dstSel).evaluate(td => !!td.dataset.slot);
    const locked = rand() < 0.25;
    await page.evaluate(l => { wsSetEditing(!l, { quiet: true }); }, locked);
    /* ⚡ 15% 는 «빠른 사람» — 앞 저장의 재읽기가 끝나기 «전» 에 바로 끈다(재읽기 중 드래그가 안전한가). */
    const fast = rand() < 0.15;
    if (fast) bump('fast'); else await settle();
    const action = pick(['postpone', 'change', 'change', 'cancel']);
    const before = patches.length;
    const okDrag = await drag(srcSel, dstSel);
    ok(L + ' 끌 수 있음', okDrag);
    if (busyCell) {
      // 이미 수업이 있는 칸 — 모달 없이 거절, 요청 0
      await page.waitForTimeout(250);
      ok(L + ' 찬 칸: 모달 안 뜸·요청 0', !(await page.locator('#modal-overlay.show').count()) && patches.length === before);
      bump('busy-cell');
      await verifyAll(L);
      continue;
    }
    const modal = page.locator('#modal-overlay.show');
    try { await modal.waitFor({ timeout: 4000 }); } catch (e) { ok(L + ' 확인 창이 뜸', false, srcSel + ' → ' + dstSel); continue; }
    ok(L + ' 잠김 표시 = 잠김 상태', (await page.locator('#modal-overlay.show .ws-move-locked').count() === 1) === locked);
    const pBtn = page.locator('#modal-overlay.show button[data-move-mode="postpone"]');
    const pDisabled = await pBtn.isDisabled();
    ok(L + ' 연기 버튼: 다른 강사면 막힘', pDisabled === (tid !== c.tid));
    let act = action;
    if (act === 'postpone' && pDisabled) act = 'change';
    bump(act + (locked ? '-locked' : '') + (tid !== c.tid ? '-teacher' : ''));
    const wantConflict = act !== 'cancel' && expectConflict(c, day, m, tid);
    const groupOf0 = groupOf(c); let moved = [];
    if (groupOf0.length > 1) bump('group');
    if (act === 'cancel') {
      await page.locator('#modal-overlay.show button[onclick="cancelMove()"]').click();
      await page.waitForTimeout(150);
      ok(L + ' 아니요: 요청 0', patches.length === before);
      ok(L + ' 아니요: 잠금 그대로', (await page.evaluate(() => wsEditing())) === !locked);
    } else {
      const resp = page.waitForResponse(r => r.url().includes('/api/admin/class-schedules/move'), { timeout: 8000 }).catch(() => null);
      await page.locator('#modal-overlay.show button[data-move-mode="' + act + '"]').click();
      const r = await resp;
      const diag = async () => JSON.stringify(await page.evaluate(() => ({ dnd: [...document.querySelectorAll('.dnd-toast')].map(e => e.textContent.slice(0, 160)), modal: (document.querySelector('#modal-overlay.show') || {}).textContent?.slice(0, 300) || null, editing: wsEditing() }))) + ' act=' + act + ' src=' + srcSel + ' dst=' + dstSel + ' locked=' + locked;
      ok(L + ' 요청 1건', patches.length === before + 1, (patches.length - before) + ' ' + (patches.length === before + 1 ? '' : await diag() + ' TRACE ' + JSON.stringify(await page.evaluate(() => window.__trace.slice(-25)))));
      const body = patches[patches.length - 1] || {};
      ok(L + ' 요청 내용', body.start_time === lab(m) && body.destination_date === day && body.source_date === day
        && (act === 'postpone' ? !('teacher_id' in body) : (tid !== c.tid ? body.teacher_id === tid : !('teacher_id' in body))), JSON.stringify(body));
      const st = r ? r.status() : 0;
      if (wantConflict) { ok(L + ' 겹침이면 서버가 거절', st === 409 || st === 400, st); bump('conflict'); }
      else {
        ok(L + ' 저장 성공', st === 200, st + ' ' + (r ? await r.text().catch(() => '') : ''));
        if (st === 200) { moved = groupOf(c); for (const g of moved) { g._srcTime = g.time; g._srcTid = g.tid; } for (const g of moved) { g.time = lab(m); g.tid = tid; } }
        ok(L + ' 묶음 전부 보냄', JSON.stringify([...(body.ids || [])].map(Number).sort((a, b) => a - b)) === JSON.stringify(groupOf0.map(x => x.id).sort((a, b) => a - b)), JSON.stringify(body.ids));
      }
      await settle();
      if (!wantConflict) ok(L + ' 편집 켜짐(저장 뒤)', await page.evaluate(() => wsEditing()));
      // 가끔 되돌리기
      if (!wantConflict && st === 200 && rand() < 0.15) {
        /* 토스트는 rAF 한 번 뒤에 «show» 가 붙는다 — 그리기가 무거운 순간엔 수백 ms 늦는다(실측). */
        const ub = page.locator('.undo-toast.show button');
        await ub.first().waitFor({ timeout: 3000 }).catch(() => {});
        if (await ub.count()) {
          const r2p = page.waitForResponse(x => x.url().includes('/api/admin/class-schedules/move'), { timeout: 8000 }).catch(() => null);
          await ub.first().click();
          const r2 = await r2p;
          ok(L + ' 되돌리기 저장', r2 && r2.status() === 200, r2 && r2.status());
          if (r2 && r2.status() === 200) for (const g of moved) { g.time = g._srcTime; g.tid = g._srcTid; }
          await settle();
          bump('undo');
        } else ok(L + ' 되돌리기 버튼이 있음', false, JSON.stringify(await page.evaluate(() => ({ toasts: [...document.querySelectorAll('.undo-toast')].map(e => e.className + '|' + e.textContent), dnd: [...document.querySelectorAll('.dnd-toast')].map(e => e.className + '|' + e.textContent), editing: wsEditing() }))) + ' act=' + act + ' tid=' + tid + ' src=' + c._srcTid + ' locked=' + locked);
      }
    }
    await verifyAll(L);
    } catch (e) {
      const why = await page.evaluate(() => ({ modal: (document.querySelector('#modal-overlay.show') || {}).innerText?.slice(0, 400) || null, dnd: [...document.querySelectorAll('.dnd-toast')].map(e => e.textContent.slice(0, 160)) })).catch(() => null);
      ok(L + ' 회차가 예외 없이 끝남', false, String(e && e.message || e).split('\n')[0] + ' ' + JSON.stringify(why));
      await recover().catch(() => {});
    }
    if (it % 25 === 0) console.log(`… ${it}/${N}  PASS ${pass} FAIL ${fail}  (${Math.round((Date.now() - t0) / 1000)}s)`);
    if (fail > 40) break;
  }
  /* ⚡⚡ 빠른 연속 드래그 — 저장 응답이 오자마자(화면 재읽기 «도중») 다음 수업을 끈다.
     사람이 연달아 옮길 때 «확인창이 먹통» 이 되거나 엉뚱한 자리에 저장되면 안 된다. */
  const RAPID = Number(process.env.WDS_RAPID || 40);
  for (let k = 1; k <= RAPID && fail <= 40; k++) {
    const L = '⚡' + k;
    try {
      await settle();
      const day = pick(DAYS.filter(d => model.filter(c => onDate(c, d)).length >= 2));
      await showDay(day); await settle();
      const pair = []; const here = model.filter(c => onDate(c, day));
      while (pair.length < 2) { const c = pick(here); if (!pair.includes(c) && !pair.some(p => groupOf(p).includes(c))) pair.push(c); }
      for (const c of pair) {
        // 겹치지 않는 빈 자리를 고른다(이 단계는 «거절» 이 아니라 «먹통·오저장» 을 본다)
        let tid, m, tries = 0;
        do { tid = pick(['1', '2', '3']); m = 9 * 60 + 10 * Math.floor(rand() * 72); tries++; }
        while (tries < 200 && ((tid === c.tid && m === toMin(c.time)) || expectConflict(c, day, m, tid) || model.some(o => o.tid === tid && onDate(o, day) && overlaps(m, m + 20, toMin(o.time), toMin(o.time) + 20))));
        const srcSel = cellSel(c.tid, day, toMin(c.time)), dstSel = cellSel(tid, day, m);
        await page.locator(srcSel).waitFor({ timeout: 4000 });
        const before = patches.length;
        await drag(srcSel, dstSel);
        await page.locator('#modal-overlay.show').waitFor({ timeout: 4000 });
        const resp = page.waitForResponse(r => r.url().includes('/api/admin/class-schedules/move'), { timeout: 6000 }).catch(() => null);
        await page.locator('#modal-overlay.show button[data-move-mode="change"]').click();
        const r = await resp;
        const sent = patches.length === before + 1;
        ok(L + ' 빠른 연속: 「변경」이 요청을 보냄(먹통 아님)', sent, sent ? '' : JSON.stringify(await page.evaluate(() => ({ modal: !!document.querySelector('#modal-overlay.show'), trace: window.__trace.slice(-30) }))));
        const st = r ? r.status() : 0;
        if (st === 200) { for (const g of groupOf(c)) { g.time = lab(m); g.tid = tid; } }
        else ok(L + ' 빠른 연속: 빈 자리라 저장 성공', false, st);
        bump('rapid');
        // ⛔ 여기서 settle 하지 않는다 — 다음 끌기가 재읽기 «도중» 에 일어나게
      }
      await settle();
      await verifyAll(L);
    } catch (e) {
      const why = await page.evaluate(() => ({ modal: !!document.querySelector('#modal-overlay.show'), trace: (window.__trace || []).slice(-30) })).catch(() => null);
      ok(L + ' 회차가 예외 없이 끝남', false, String(e && e.message || e).split('\n')[0] + ' ' + JSON.stringify(why));
      await recover().catch(() => {});
    }
  }
  console.log('\n분포:', JSON.stringify(tally));
  for (const f of fails) console.log('❌ ' + f);
  console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
  await browser.close();
  if (fail) process.exitCode = 1;
}
