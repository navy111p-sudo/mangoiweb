// -*- coding: utf-8 -*-
// 👥 «특정 날짜·시각에 빈 강사» — 실제로 돌려 보는 하니스 (2026-10-13)
//   실행: node test-harness/free_teachers_on_date_harness.mjs
//   (esbuild 위치를 바꾸려면 ESBUILD=/경로/esbuild)
//
//   왜 — 매니저 요청 「학원이 5시에 학생 5명을 등록하려는데 빈 강사를 바로 볼 수 있나」.
//     판정 정본 src/free-teachers-on-date.ts 를 esbuild 로 번들해 «진짜 SQLite» 를 D1 모양으로
//     감싸 실제로 돌린다. ⚠️ 문자열 검사로는 못 잡는다 — 틀리는 것은 «누가 비었다고 나오는가» 뿐이다.
//
//   짝으로 묻는 것:
//     · 1:1 수업이 «같은 시각·같은 길이» 로 있는 강사는 비지 않았다(옮기기 검사는 합반으로 보고 뺀다)
//     · 날짜 없는 «매주 반복» 수업도 막는다
//     · 끝나는 시각에 딱 맞닿은 수업은 막지 않는다(경계)
//     · 미러를 안 켠 강사는 «확실히 가능» 이 아니라 «확인 필요» 로
//     · 근무 불가·공휴일 휴강·퇴사는 빠진다
//     · 못 읽으면 ok:false — «빈 강사 0명» 으로 위장하지 않는다
import { readFileSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

const __dir = dirname(fileURLToPath(import.meta.url));
const CF = resolve(__dir, '../cloudflare-deploy');
const SRC = process.env.FREE_SRC || join(CF, 'src/free-teachers-on-date.ts');

let PASS = 0, FAIL = 0, SKIP = 0;
const ok = (name, cond, extra) => {
  if (cond) PASS++; else FAIL++;
  console.log(`  ${cond ? '✅' : '❌ FAIL'} ${name}${!cond && extra ? '  — ' + extra : ''}`);
};

/* 주석·문자열을 벗긴 사본 — 부정 검사(«없어야 한다»)는 이것으로 판정한다 */
function stripComments(s) {
  let out = '', q = null;
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (q) { out += c; if (c === '\\') { out += s[k + 1] || ''; k++; continue; } if (c === q) q = null; continue; }
    if (c === "'" || c === '"' || c === '`') { q = c; out += c; continue; }
    if (c === '/' && s[k + 1] === '/') { const e = s.indexOf('\n', k); k = e < 0 ? s.length : e - 1; continue; }
    if (c === '/' && s[k + 1] === '*') { const e = s.indexOf('*/', k + 2); k = e < 0 ? s.length : e + 1; continue; }
    out += c;
  }
  return out;
}

// ═══ ① 정적 배선 — 게이트·화면 ═══
console.log('① 배선');
const enrollOps = readFileSync(join(CF, 'src/enroll-ops.ts'), 'utf8');
const ROUTE = "'/api/pay/enroll/admin/free-teachers-on-date'";
ok('라우트가 enroll-ops.ts 에 있다', enrollOps.includes("path === " + ROUTE));
{
  const m = /const ENROLL_ADMIN_SELF_GATED = new Set\(\[([\s\S]*?)\]\);/.exec(enrollOps);
  ok('전제: 자기 게이트 목록을 읽었다', !!m);
  ok('본사 전용 기본 게이트를 탄다(자기 게이트 목록에 없다)', !!m && !stripComments(m[1]).includes('free-teachers-on-date'));
}
const mgr = readFileSync(join(CF, 'public/manager.html'), 'utf8');
ok('카드는 기본 감춤(hidden)', /<details class="card" id="c-free"[^>]*\bhidden\b/.test(mgr));
ok('사이드바도 기본 감춤(hidden)', /id="sideFree"[^>]*\bhidden\b/.test(mgr));
ok('본사일 때만 연다(IS_HQ)', /\['c-free', 'sideFree'\]\.forEach\(function\(id\)\{[^}]*w\.hidden = !IS_HQ/.test(mgr));
ok('화면이 그 API 를 부른다', mgr.includes('/api/pay/enroll/admin/free-teachers-on-date?date='));
ok('그릇(freeBody)에 data-en 을 달지 않았다', !/id="freeBody"[^>]*data-en/.test(mgr));

// ═══ ② 화면 판정 — paintFree 를 오려 내 실제로 돌린다 ═══
console.log('② 화면');
function fnBody(s, sig) {
  const i = s.indexOf(sig); if (i < 0) return '';
  const open = s.indexOf('{', i); let depth = 0, q = null;
  for (let k = open; k < s.length; k++) {
    const c = s[k];
    if (q) { if (c === '\\') { k++; continue; } if (c === q) q = null; continue; }
    if (c === "'" || c === '"' || c === '`') { q = c; continue; }
    if (c === '/' && s[k + 1] === '/') { k = s.indexOf('\n', k); continue; }
    if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) return s.slice(i, k + 1); }
  }
  return '';
}
const paintSrc = fnBody(mgr, 'function paintFree(){');
ok('전제: paintFree 를 오려 냈다', paintSrc.length > 500);
function runPaint(j, need, en) {
  const el = { className: '', textContent: '', innerHTML: '' };
  const D = { free: { j, need } };
  const T = (e, k) => (en ? e : k);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const document = { getElementById: () => el };
  try {
    new Function('D', 'T', 'esc', 'document', paintSrc + '\npaintFree();')(D, T, esc, document);
  } catch (e) { return { err: e.message }; }
  return { html: el.innerHTML, text: el.textContent, cls: el.className };
}
{
  const t = (id, nm) => ({ id, name: nm, display_name: nm, day_count: 2 });
  const base = { ok: true, date: '2026-10-15', time: '17:00', duration_min: 20, busy_count: 4, holiday: null };
  const a = runPaint({ ...base, sure: [t('1', 'A'), t('2', 'B')], check: [t('9', 'Z1'), t('8', 'Z2'), t('7', 'Z3')] }, 5, true);
  ok('부족하면 «부족» 이라고 말한다(확인 필요 강사는 세지 않는다)', !a.err && /fq-short/.test(a.html) && /3 short/.test(a.html), a.err || a.html.slice(0, 200));
  ok('확인 필요 강사를 «카페24 확인» 으로 따로 적는다', /check Cafe24/.test(a.html) && /\+ 3 more/.test(a.html));
  const b = runPaint({ ...base, sure: [t('1', 'A'), t('2', 'B')], check: [] }, 2, false);
  ok('충분하면 «배정 가능» (짝)', !b.err && /fq-ok/.test(b.html) && /배정 가능/.test(b.html), b.err);
  const c = runPaint({ ok: true, sure: null }, 1, true);
  ok('못 읽었으면 «0명» 이라 하지 않는다', !c.err && /NOT "nobody is free"/.test(c.text), c.err || c.text);
  const e1 = runPaint({ ...base, mirror_off: true, sure: [], check: [t('1', 'A')] }, 1, true);
  ok('미러가 꺼져 있으면 그 사실을 말한다', !e1.err && /not being copied/.test(e1.html));
  const e2 = runPaint({ ...base, beyond_mirror: true, sure: [], check: [t('1', 'A')] }, 1, false);
  ok('14일보다 먼 날짜면 그 사실을 말한다', !e2.err && /14일보다 먼 날짜/.test(e2.html));
  const e3 = runPaint({ ...base, sure: [t('1', 'A')], check: [] }, 1, true);
  ok('평소에는 그 경고가 없다(짝)', !e3.err && !/not being copied|more than 14 days/.test(e3.html));
  const d = runPaint({ ...base, holiday: '한글날', sure: [], check: [] }, 1, false);
  ok('공휴일이면 휴강이라고 말한다', !d.err && /fq-hol/.test(d.html) && /한글날/.test(d.html));
}

// ═══ ③ 판정 정본을 번들해 진짜 SQLite 로 돌린다 ═══
console.log('③ 판정 정본 실행');
const ESB = process.env.ESBUILD || join(CF, 'node_modules', 'esbuild', 'bin', 'esbuild');
let mod = null;
if (!existsSync(ESB)) {
  SKIP++;
  console.log(`  ⏭ SKIP esbuild 가 없어 정본을 못 돌렸습니다(${ESB}) — ESBUILD=경로 로 지정하세요`);
} else {
  const out = join(mkdtempSync(join(tmpdir(), 'freet-')), 'b.mjs');
  try {
    execFileSync(process.platform === 'win32' ? process.execPath : ESB,
      [...(process.platform === 'win32' ? [ESB] : []), SRC, '--bundle', '--format=esm', '--platform=neutral',
       '--main-fields=module,main', '--log-level=error', '--outfile=' + out], { stdio: 'pipe' });
    mod = await import(pathToFileURL(out).href);
  } catch (e) { console.log('  번들 실패: ' + (e.stderr ? String(e.stderr) : e.message)); }
  ok('전제: 정본을 번들했다', !!(mod && mod.freeTeachersOnDate));
}

function makeEnv({ mode = 'whitelist', failIntervals = false, failUnav = false, holiday = null, blockAll = [], carlSkip = null, sub = false } = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE teachers (id INTEGER PRIMARY KEY, name TEXT, active INTEGER);
    CREATE TABLE class_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, student_name TEXT,
      teacher_id TEXT, start_time TEXT, duration_min INTEGER, scheduled_date TEXT, day_of_week TEXT,
      schedule_kind TEXT, status TEXT, class_type TEXT, source TEXT, notes TEXT,
      created_at INTEGER, updated_at INTEGER, skip_dates TEXT, starts_on TEXT);
    CREATE TABLE class_substitutions (id INTEGER PRIMARY KEY, schedule_id INTEGER, sub_date TEXT,
      substitute_teacher_id TEXT, original_teacher_id TEXT, status TEXT);
    CREATE TABLE teacher_unavailability (id INTEGER PRIMARY KEY, teacher_id TEXT, kind TEXT, start_date TEXT,
      end_date TEXT, day_of_week INTEGER, start_time TEXT, end_time TEXT);
    CREATE TABLE c24_mirror_config (k TEXT PRIMARY KEY, v TEXT NOT NULL, updated_at INTEGER);
    CREATE TABLE c24_mirror_teachers (teacher_id TEXT PRIMARY KEY, enabled INTEGER DEFAULT 1, note TEXT, updated_by TEXT, updated_at INTEGER);
    CREATE TABLE enroll_holidays (day TEXT PRIMARY KEY, name TEXT);
  `);
  const T = [[1, 'ANNA', 1], [2, 'BEN', 1], [3, 'CARL', 1], [4, 'DINA', 1], [5, 'EVA', 1], [6, 'FAY', 1], [7, 'GUS', 0], [8, 'HUGO', 1]];
  for (const r of T) db.prepare('INSERT INTO teachers VALUES (?,?,?)').run(...r);
  db.prepare("INSERT INTO c24_mirror_config VALUES ('mode', ?, 0)").run(mode);
  for (const id of [1, 2, 3, 4, 6, 7, 8]) db.prepare('INSERT INTO c24_mirror_teachers (teacher_id, enabled) VALUES (?, ?)').run(String(id), blockAll.includes(String(id)) ? 0 : 1);
  const cs = db.prepare(`INSERT INTO class_schedules (user_id, teacher_id, start_time, duration_min, scheduled_date, day_of_week, schedule_kind, status, created_at)
                         VALUES (?,?,?,?,?,?,?,?,0)`);
  cs.run('stu_b', '2', '17:00', 20, '2026-10-15', '4', 'one_off', 'active');      // BEN: 같은 시각·같은 길이 1:1
  cs.run('stu_c', '3', '17:10', 30, null, '4', 'recurring', 'active');             // CARL: 매주 목 17:10 (날짜 없음)
  if (carlSkip) db.prepare('UPDATE class_schedules SET skip_dates = ? WHERE user_id = ?').run(carlSkip, 'stu_c');
  cs.run('stu_d', '4', '16:40', 20, '2026-10-15', '4', 'one_off', 'active');      // DINA: 17:00 에 끝남(맞닿음)
  cs.run('stu_h', '8', '17:00', 20, '2026-10-16', '5', 'one_off', 'active');      // HUGO: 다른 날
  cs.run('lms', '1', '17:00', 20, '2026-10-15', '4', 'one_off', 'active');        // ANNA: LMS 자리표시(세지 않음)
  cs.run('stu_x', '1', '17:00', 20, '2026-10-15', '4', 'one_off', 'cancelled');   // ANNA: 취소된 수업(세지 않음)
  db.prepare("INSERT INTO teacher_unavailability (teacher_id, kind, start_date, end_date) VALUES ('6','date_range','2026-10-14','2026-10-16')").run();
  if (holiday) db.prepare('INSERT INTO enroll_holidays VALUES (?, ?)').run(holiday, '임시휴일');
  // 대체: BEN 의 17:00 수업(id 1)을 그날 ANNA 가 대신 맡는다
  if (sub) db.prepare("INSERT INTO class_substitutions (schedule_id, sub_date, substitute_teacher_id, original_teacher_id, status) VALUES (1, '2026-10-15', '1', '2', 'active')").run();

  const norm = (a) => a.map((v) => (v === undefined ? null : v));
  const wrap = (sql, args) => {
    if (failIntervals && sql.includes('COALESCE(duration_min, 20) AS dm, scheduled_date')) throw new Error('D1 흔들림(시험)');
    if (failUnav && sql.includes('teacher_unavailability')) throw new Error('D1 흔들림(시험)');
    return db.prepare(sql);
  };
  const D1 = {
    prepare(sql) {
      const mk = (args) => ({
        bind: (...a) => mk(a),
        async first() { const r = wrap(sql, args).get(...norm(args)); return r === undefined ? null : r; },
        async all() { return { results: wrap(sql, args).all(...norm(args)) }; },
        async run() { wrap(sql, args).run(...norm(args)); return { success: true, meta: { changes: 0 } }; },
      });
      return mk([]);
    },
    async exec(sql) { db.exec(sql); return {}; },
    async batch(stmts) { const o = []; for (const s of stmts) o.push(await s.run()); return o; },
  };
  return { DB: D1 };
}

const NOW = Date.parse('2026-10-13T09:00:00+09:00');   // ⚠️ 고정 «오늘» — 미러 기간 판정이 오늘에 걸린다
if (mod && mod.freeTeachersOnDate) {
  const ids = (a) => (a || []).map((t) => t.id).sort().join(',');
  let r;
  try { r = await mod.freeTeachersOnDate(makeEnv(), '2026-10-15', '17:00', 20, NOW); } catch (e) { r = { ok: false, error: 'throw:' + e.message }; }
  ok('정상 조회는 ok', r.ok === true, JSON.stringify(r).slice(0, 300));
  ok('확실히 가능 = ANNA·DINA·HUGO', ids(r.sure) === '1,4,8', ids(r.sure));
  ok('확인 필요(미러 안 켬) = EVA', ids(r.check) === '5', ids(r.check));
  ok('같은 시각·같은 길이 1:1 수업 강사(BEN)는 빠진다', !ids(r.sure).split(',').includes('2') && !ids(r.check).split(',').includes('2'));
  ok('매주 반복 수업 강사(CARL)는 빠진다', !ids(r.sure).split(',').includes('3'));
  ok('맞닿은 수업 강사(DINA)는 가능(경계·짝)', ids(r.sure).split(',').includes('4'));
  ok('근무 불가(FAY)·퇴사(GUS)는 빠진다', !/(^|,)(6|7)(,|$)/.test(ids(r.sure) + ',' + ids(r.check)));
  ok('안 되는 강사 수 = 3 (BEN·CARL·FAY)', r.busy_count === 3, String(r.busy_count));
  ok('그날 수업 수가 실린다(DINA 1)', (r.sure || []).find((t) => t.id === '4')?.day_count === 1);

  const all = await mod.freeTeachersOnDate(makeEnv({ mode: 'all' }), '2026-10-15', '17:00', 20, NOW);
  ok('미러가 «전원» 이면 EVA 도 확실히 가능(짝)', ids(all.sure) === '1,4,5,8' && ids(all.check) === '', ids(all.sure) + ' / ' + ids(all.check));

  const late = await mod.freeTeachersOnDate(makeEnv(), '2026-10-15', '17:10', 40, NOW);
  ok('17:10~17:50 이면 DINA 도 가능하고 HUGO 는 그대로', ids(late.sure) === '1,4,8', ids(late.sure));
  const early = await mod.freeTeachersOnDate(makeEnv(), '2026-10-15', '16:50', 20, NOW);
  ok('16:50 이면 DINA(16:40~17:00)는 빠진다', !ids(early.sure).split(',').includes('4'), ids(early.sure));

  // ⚠️ 부르는 자리까지 try — 정본이 던지면 «깔끔한 FAIL» 이어야 한다(크래시면 결과줄이 안 나온다)
  let fail;
  try { fail = await mod.freeTeachersOnDate(makeEnv({ failIntervals: true }), '2026-10-15', '17:00', 20, NOW); }
  catch (e) { fail = { threw: e.message }; }
  ok('일정을 못 읽으면 ok:false (0명으로 위장 안 함)', fail.ok === false && !Array.isArray(fail.sure), JSON.stringify(fail));

  const hol = await mod.freeTeachersOnDate(makeEnv({ holiday: '2026-10-22' }), '2026-10-22', '17:00', 20, NOW);
  ok('공휴일 휴강이면 확실히 가능 0명 + 휴일 이름', hol.ok && (hol.sure || []).length === 0 && hol.holiday === '임시휴일', JSON.stringify(hol).slice(0, 200));

  // ── trap-check(2026-10-13) 지적 반영 — 미러가 «안 보이는» 경우는 전부 «확인 필요» 로
  const off = await mod.freeTeachersOnDate(makeEnv({ mode: 'off' }), '2026-10-15', '17:00', 20, NOW);
  ok('미러가 꺼져 있으면(off) 확실히 가능 0명 · 전원 확인 필요', ids(off.sure) === '' && ids(off.check) === '1,4,5,8' && off.mirror_off === true, ids(off.sure) + ' / ' + ids(off.check));
  const far = await mod.freeTeachersOnDate(makeEnv(), '2026-10-28', '17:00', 20, NOW);
  ok('오늘+15일(미러 기간 밖)이면 전원 확인 필요', ids(far.sure) === '' && far.beyond_mirror === true, ids(far.sure));
  const edge = await mod.freeTeachersOnDate(makeEnv(), '2026-10-27', '17:00', 20, NOW);
  ok('오늘+14일(기간 끝)은 평소대로(짝)', ids(edge.sure) === '1,2,3,4,6,8' && edge.beyond_mirror === false, ids(edge.sure));
  const blk = await mod.freeTeachersOnDate(makeEnv({ mode: 'all', blockAll: ['4'] }), '2026-10-15', '17:00', 20, NOW);
  ok("'all' 이어도 «켜지 마라»(enabled=0) 강사는 확인 필요", ids(blk.sure) === '1,5,8' && ids(blk.check) === '4', ids(blk.sure) + ' / ' + ids(blk.check));
  let un; try { un = await mod.freeTeachersOnDate(makeEnv({ failUnav: true }), '2026-10-15', '17:00', 20, NOW); } catch (e) { un = { threw: e.message }; }
  ok('근무 불가 표를 못 읽으면 ok:false (휴가 중 강사를 «가능» 으로 안 냄)', un.ok === false, JSON.stringify(un).slice(0, 200));
  const sk = await mod.freeTeachersOnDate(makeEnv({ carlSkip: '2026-10-15' }), '2026-10-15', '17:00', 20, NOW);
  ok('매주 반복이라도 «그 주만 빠짐» 이면 CARL 가능', ids(sk.sure) === '1,3,4,8', ids(sk.sure));
  const sb = await mod.freeTeachersOnDate(makeEnv({ sub: true }), '2026-10-15', '17:00', 20, NOW);
  ok('그날 대체를 맡은 강사(ANNA)는 빠진다', !ids(sb.sure).split(',').includes('1'), ids(sb.sure));
}


// ═══ ④ 무작위 샌드박스 — 정본 결과를 «독립적으로 다시 계산한 정답» 과 대조 (2026-10-13 사장님 「수백 번」) ═══
//   매 회 강사·미러·수업(날짜 지정/매주 반복/취소/자리표시/시작일/그 주만 빠짐)·근무 불가·공휴일을 무작위로 만들고
//   «확실히 가능 · 카페24 확인 · 안 되는 수» 를 정답과 견준다. 실패하면 씨앗(seed)과 회차를 찍는다 — FUZZ_SEED 로 재현.
//   ⚠️ 정답 계산은 정본 코드를 «부르지 않고» 여기서 처음부터 다시 짠다(같은 함수를 부르면 같은 실수를 같이 한다).
//   모형에 넣은 것: 미러 모드 off/whitelist/all(«켜지 마라» 포함)·미러 기간(오늘+14일)·대체 수업.
//   ⚠️ 모형에서 뺀 것: 긴 수업 정원(강사별 설정 표 없음 = 무제한).
if (mod && mod.freeTeachersOnDate) {
  const N = Number(process.env.FUZZ_N || 300);
  const SEED = Number(process.env.FUZZ_SEED || 20261013);
  let st = SEED >>> 0;
  const rnd = () => { st = (st + 0x6D2B79F5) >>> 0; let t = st; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const ri = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
  const hhmm = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  const addDays = (ymd, n) => new Date(Date.parse(ymd + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  const dowOf = (ymd) => new Date(ymd + 'T00:00:00Z').getUTCDay();
  const TIDS = ['1', '2', '3', '4', '5', '6', '7', '8', '29'];   // 29 = 공휴일 예외 강사(정본 기본값)
  let bad = 0, firstBad = '';
  for (let it = 0; it < N; it++) {
    const date = addDays('2027-01-01', it);           // ⚠️ 회차마다 다른 날짜 — 공휴일 판정이 날짜별로 5분 캐시한다
    const teachers = TIDS.map((id) => ({ id, active: rnd() < 0.85 ? 1 : 0 }));
    const mode = pick(['whitelist', 'whitelist', 'all', 'all', 'off']);
    const nowMs = Date.parse(addDays(date, -ri(0, 20)) + 'T' + String(ri(0, 23)).padStart(2, '0') + ':30:00+09:00');
    const mirrored = new Set(TIDS.filter(() => rnd() < 0.7));
    const rows = [];
    for (let k = ri(0, 22); k > 0; k--) {
      const recurring = rnd() < 0.3;
      const r = {
        user: rnd() < 0.08 ? pick(['lms', 'LMS', 'type_seed']) : 'stu' + ri(1, 50),
        tid: pick(TIDS), start: ri(90, 114) * 10, dur: pick([20, 30, 40]),
        status: rnd() < 0.15 ? pick(['cancelled', 'postponed']) : 'active',
        sdate: recurring ? null : pick([date, date, addDays(date, -1), addDays(date, 1)]),
        dow: recurring ? String(rnd() < 0.7 ? dowOf(date) : ri(0, 6)) : String(dowOf(date)),
        kind: recurring ? 'recurring' : 'one_off',
        starts_on: recurring && rnd() < 0.3 ? pick([addDays(date, -7), date, addDays(date, 7)]) : null,
        skip: recurring && rnd() < 0.25 ? pick([date, addDays(date, 7), addDays(date, -7) + ',' + date]) : null,
      };
      rows.push(r);
    }
    const unav = [];
    for (let k = ri(0, 3); k > 0; k--) {
      const timed = rnd() < 0.5;
      const ts = ri(90, 114) * 10, te = ts + pick([30, 60, 120]);
      if (rnd() < 0.5) unav.push({ tid: pick(TIDS), kind: 'date_range', sd: pick([addDays(date, -2), date]), ed: pick([date, addDays(date, -1), addDays(date, 2)]), dow: null, st: timed ? hhmm(ts) : null, et: timed ? hhmm(te) : null });
      else unav.push({ tid: pick(TIDS), kind: 'weekly', sd: null, ed: null, dow: pick([dowOf(date), ri(0, 6)]), st: timed ? hhmm(ts) : null, et: timed ? hhmm(te) : null });
    }
    const subs = [];
    for (const [k, r] of rows.entries()) if (rnd() < 0.12) subs.push({ sid: k + 1, sub: pick(TIDS), sdate: pick([date, date, addDays(date, 1)]), status: rnd() < 0.85 ? 'active' : 'cancelled' });
    const holiday = rnd() < 0.1;
    const qStart = ri(90, 114) * 10, qDur = pick([20, 30, 40]);

    // ── 정답(독립 계산) ──
    const ov = (s1, e1, s2, e2) => s1 < e2 && s2 < e1;
    const busy = new Set();
    const qE = qStart + qDur;
    const subOf = (k) => subs.find((x) => x.sid === k + 1 && x.status === 'active' && x.sdate === date);
    for (const [k, r] of rows.entries()) {
      if (r.status !== 'active') continue;
      const hit = ov(qStart, qE, r.start, r.start + r.dur);
      const sb = subOf(k);
      if (sb && hit) busy.add(sb.sub);                    // 대체를 맡은 강사(자리표시 행이라도 — 정본 오버레이와 같다)
      if (['lms', 'type_seed'].includes(r.user.toLowerCase())) continue;
      if (r.sdate) { if (r.sdate === date && hit) busy.add(r.tid); continue; }   // 날짜 지정 행: 대체가 있어도 원래 강사는 «바쁨»(보수적)
      const on = Number(r.dow) === dowOf(date) && !(r.skip && r.skip.split(',').includes(date)) && !(r.starts_on && date < r.starts_on);
      if (on && hit) { busy.add(r.tid); if (sb) busy.add(sb.sub); }   // 반복 행: 대체가 있어도 원래 강사는 «바쁨»(보수적) + 대체 강사도
    }
    for (const u of unav) {
      const s2 = u.st ? Number(u.st.slice(0, 2)) * 60 + Number(u.st.slice(3)) : 0;
      const e2 = u.et ? Number(u.et.slice(0, 2)) * 60 + Number(u.et.slice(3)) : 1440;
      const day = u.kind === 'date_range' ? (date >= u.sd && date <= u.ed) : (u.dow === dowOf(date));
      if (day && ov(qStart, qStart + qDur, s2, e2)) busy.add(u.tid);
    }
    if (holiday) for (const t of TIDS) if (t !== '29') busy.add(t);
    const expSure = [], expCheck = [];
    for (const t of teachers) {
      if (!t.active || busy.has(t.id)) continue;
      const today = new Date(nowMs + 9 * 3600000).toISOString().slice(0, 10);
      const beyond = date > addDays(today, 14);
      if (mode !== 'off' && !beyond && mirrored.has(t.id)) expSure.push(t.id); else expCheck.push(t.id);
    }
    const expBusy = teachers.filter((t) => t.active).length - expSure.length - expCheck.length;

    // ── 정본 실행 ──
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE teachers (id INTEGER PRIMARY KEY, name TEXT, active INTEGER);
      CREATE TABLE class_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, student_name TEXT,
        teacher_id TEXT, start_time TEXT, duration_min INTEGER, scheduled_date TEXT, day_of_week TEXT,
        schedule_kind TEXT, status TEXT, class_type TEXT, source TEXT, notes TEXT,
        created_at INTEGER, updated_at INTEGER, skip_dates TEXT, starts_on TEXT);
      CREATE TABLE class_substitutions (id INTEGER PRIMARY KEY, schedule_id INTEGER, sub_date TEXT, substitute_teacher_id TEXT, original_teacher_id TEXT, status TEXT);
      CREATE TABLE teacher_unavailability (id INTEGER PRIMARY KEY, teacher_id TEXT, kind TEXT, start_date TEXT, end_date TEXT, day_of_week INTEGER, start_time TEXT, end_time TEXT);
      CREATE TABLE c24_mirror_config (k TEXT PRIMARY KEY, v TEXT NOT NULL, updated_at INTEGER);
      CREATE TABLE c24_mirror_teachers (teacher_id TEXT PRIMARY KEY, enabled INTEGER DEFAULT 1, note TEXT, updated_by TEXT, updated_at INTEGER);
      CREATE TABLE enroll_holidays (day TEXT PRIMARY KEY, name TEXT);`);
    for (const t of teachers) db.prepare('INSERT INTO teachers VALUES (?,?,?)').run(Number(t.id), 'T' + t.id, t.active);
    db.prepare("INSERT INTO c24_mirror_config VALUES ('mode', ?, 0)").run(mode);
    for (const id of TIDS) db.prepare('INSERT INTO c24_mirror_teachers (teacher_id, enabled) VALUES (?, ?)').run(id, mirrored.has(id) ? 1 : 0);
    for (const r of rows) db.prepare(`INSERT INTO class_schedules (user_id, teacher_id, start_time, duration_min, scheduled_date, day_of_week, schedule_kind, status, created_at, starts_on, skip_dates)
      VALUES (?,?,?,?,?,?,?,?,0,?,?)`).run(r.user, r.tid, hhmm(r.start), r.dur, r.sdate, r.dow, r.kind, r.status, r.starts_on, r.skip);
    for (const u of unav) db.prepare('INSERT INTO teacher_unavailability (teacher_id, kind, start_date, end_date, day_of_week, start_time, end_time) VALUES (?,?,?,?,?,?,?)').run(u.tid, u.kind, u.sd, u.ed, u.dow, u.st, u.et);
    if (holiday) db.prepare('INSERT INTO enroll_holidays VALUES (?, ?)').run(date, '휴일');
    for (const x of subs) db.prepare('INSERT INTO class_substitutions (schedule_id, sub_date, substitute_teacher_id, status) VALUES (?,?,?,?)').run(x.sid, x.sdate, x.sub, x.status);
    const norm = (a) => a.map((v) => (v === undefined ? null : v));
    const D1 = {
      prepare(sql) {
        const mk = (args) => ({
          bind: (...x) => mk(x),
          async first() { const r = db.prepare(sql).get(...norm(args)); return r === undefined ? null : r; },
          async all() { return { results: db.prepare(sql).all(...norm(args)) }; },
          async run() { db.prepare(sql).run(...norm(args)); return { success: true, meta: { changes: 0 } }; },
        });
        return mk([]);
      },
      async exec(sql) { db.exec(sql); return {}; },
    };
    let got;
    try { got = await mod.freeTeachersOnDate({ DB: D1 }, date, hhmm(qStart), qDur, nowMs); } catch (e) { got = { threw: e.message }; }
    const gs = (got.sure || []).map((t) => t.id).sort().join(','), gc = (got.check || []).map((t) => t.id).sort().join(',');
    const es = expSure.sort().join(','), ec = expCheck.sort().join(',');
    if (!got.ok || gs !== es || gc !== ec || got.busy_count !== expBusy || (got.holiday != null) !== holiday) {
      bad++;
      if (!firstBad) firstBad = `회차 ${it} (seed ${SEED}) ${date} ${hhmm(qStart)}/${qDur}분 — 정본 sure[${gs}] check[${gc}] busy ${got.busy_count}${got.threw ? ' 던짐:' + got.threw : ''} · 정답 sure[${es}] check[${ec}] busy ${expBusy}`;
    }
  }
  ok(`무작위 ${N}회 — 정본과 독립 정답이 전부 같다`, bad === 0, `${bad}회 어긋남 · 첫 번째: ${firstBad}`);
}

console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL} / SKIP ${SKIP}`);
if (FAIL) process.exit(1);
