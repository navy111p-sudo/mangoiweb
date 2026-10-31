#!/usr/bin/env node
// teacher_login_times_harness.mjs — 🔐 강사 로그인·접속 시각 (2026-10-30 매니저 제안 «add teacher's log in time»)
//
// 무엇을 보나 — 전부 «실제 코드를 돌려서» 본다(문자열 검사로는 원리상 못 잡는 종류라서).
//   ① 순수 판정(dailySeenPlan·summarizeLoginDay·ymdStart)을 경계값으로
//   ② checkAdminSession(auth-admin.ts 에서 오려 냄)을 진짜 SQLite 위에서 돌려 «그날 처음 쓴 시각» 이 적히는지
//      — 무작위 요청 타임라인 수백 개를 독립 기대값(oracle)과 대조
//   ③ 본사 목록(loadTeacherLoginDay·handleTeacherLoginList)·강사 본인(loadMyLoginDays)을 진짜 SQLite 위에서
//      — 무작위 기록 수백 벌을 oracle 과 대조 + 게이트(강사·지사·대리점·«모름»)
//   ④ 배선 — auth-admin 경로 분기 · 강사 포털 part=my_login 블록을 오려 내 실제로 실행
//   ⑤ 화면 — manager.html·teacher.html 의 그리기 함수를 오려 내 가짜 DOM 으로 실행(KO·EN)
//
// 변이시험: TLT_MUTATE=1 이면 소스 사본에 결함을 하나씩 넣어 이 하니스를 다시 돌리고 «실제로 FAIL 하는지» 본다.
//   소스 위치는 TLT_SRC_DIR(=cloudflare-deploy/src)·TLT_PUBLIC_DIR(=cloudflare-deploy/public)로 바꿀 수 있다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { stripTypeScriptTypes } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { deadAt, commentsBalanced } from './helpers/live-code.mjs';

process.removeAllListeners('warning');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SRC = process.env.TLT_SRC_DIR || path.join(ROOT, 'cloudflare-deploy/src');
const PUB = process.env.TLT_PUBLIC_DIR || path.join(ROOT, 'cloudflare-deploy/public');
const SEEDS = Math.max(1, Number(process.env.TLT_SEEDS || 1));
const QUIET = process.env.TLT_QUIET === '1';

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; if (!QUIET) console.log('  ✅ ' + name); }
  else { fail++; fails.push(name); console.log('  ❌ FAIL ' + name + (extra !== undefined ? ' — ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); }
}
function sec(t) { if (!QUIET) console.log('\n── ' + t); }
const read = (p) => fs.readFileSync(p, 'utf8');

/* ── 소스에서 블록 오려 내기 — 문자열·주석·정규식 안의 괄호를 건너뛰며 짝을 맞춘다 ── */
function matchBrace(text, open) {
  let depth = 0, i = open;
  while (i < text.length) {
    const c = text[i], n = text[i + 1];
    if (c === '/' && n === '/') { i = text.indexOf('\n', i); if (i < 0) return -1; continue; }
    if (c === '/' && n === '*') { i = text.indexOf('*/', i + 2); if (i < 0) return -1; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; i++;
      while (i < text.length && text[i] !== q) { if (text[i] === '\\') i++; i++; }
      i++; continue;
    }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i; }
    i++;
  }
  return -1;
}
/** `start` 문자열이 시작하는 자리부터 그 첫 여는 중괄호의 짝까지. */
function cut(text, start, from = 0) {
  const i = text.indexOf(start, from);
  if (i < 0) return null;
  const open = text.indexOf('{', i);
  const e = matchBrace(text, open);
  if (e < 0) return null;
  return { text: text.slice(i, e + 1), at: i, open, end: e };
}
/** TS 함수 선언 — 인자 목록·반환 타입을 지나 «몸통» 중괄호를 찾는다(괄호·꺾쇠 깊이 0 인 첫 {). */
function cutTsFunction(text, sig) {
  const i = text.indexOf(sig);
  if (i < 0) return null;
  // 인자 목록 «끝» 까지 먼저 간다.
  let p = text.indexOf('(', i), depth = 0;
  for (; p < text.length; p++) {
    if (text[p] === '(') depth++;
    else if (text[p] === ')') { depth--; if (depth === 0) { p++; break; } }
  }
  // 반환 타입이 객체 타입(`): { role: string } {`)이면 그 중괄호는 몸통이 아니다 — 통째로 건너뛴다.
  while (/\s/.test(text[p])) p++;
  if (text[p] === ':') {
    p++;
    while (/\s/.test(text[p])) p++;
    if (text[p] === '{') p = matchBrace(text, p) + 1;
  }
  let angle = 0;
  for (; p < text.length; p++) {
    const c = text[p];
    if (c === '<') angle++;
    else if (c === '>' && text[p - 1] !== '=') angle = Math.max(0, angle - 1);
    else if (c === '{' && angle === 0) break;
  }
  const e = matchBrace(text, p);
  return e < 0 ? null : { text: text.slice(i, e + 1), at: i, open: p, end: e };
}
const strip = (ts) => stripTypeScriptTypes(ts, { mode: 'strip' });

/* ── 정본 모듈을 임시 폴더에 .mjs 로 — import 경로만 고친다(내용은 한 글자도 안 바꾼다) ── */
const AUTH_TS = read(path.join(SRC, 'auth-admin.ts'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tlt-'));
function emit(name, ts, rewrite = {}) {
  let js = strip(ts);
  js = js.replace(/from '\.\/([a-z0-9-]+)'/g, (m, f) => `from './${rewrite[f] || f}.mjs'`);
  fs.writeFileSync(path.join(tmp, name + '.mjs'), js);
}
const isOrgFn = cutTsFunction(AUTH_TS, 'export function isOrgScopedRole(');
const resolveRoleFn = cutTsFunction(AUTH_TS, 'function resolveRole(');
fs.writeFileSync(path.join(tmp, 'auth-stub.mjs'), strip(isOrgFn.text) + '\n');
emit('teacher-login-times', read(path.join(SRC, 'teacher-login-times.ts')));
emit('d1-chunk', read(path.join(SRC, 'd1-chunk.ts')));
emit('org-scope-guard', read(path.join(SRC, 'org-scope-guard.ts')), { 'auth-admin': 'auth-stub' });
emit('forbidden-teacher', read(path.join(SRC, 'forbidden-teacher.ts')));
emit('teacher-login-list', read(path.join(SRC, 'teacher-login-list.ts')));
const M = await import(pathToFileURL(path.join(tmp, 'teacher-login-times.mjs')).href);
const L = await import(pathToFileURL(path.join(tmp, 'teacher-login-list.mjs')).href);
const resolveRole = new Function(strip(resolveRoleFn.text) + '\nreturn resolveRole;')();

/* ── D1 모양의 진짜 SQLite ── */
function d1(db) {
  return {
    prepare(sql) {
      const st = { sql, args: [],
        bind(...a) { st.args = a; return st; },
        async first() { return db.prepare(sql).get(...st.args) ?? null; },
        async all() { return { results: db.prepare(sql).all(...st.args) }; },
        async run() { const r = db.prepare(sql).run(...st.args); return { meta: { changes: r.changes } }; },
      };
      return st;
    },
  };
}
function freshDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE admin_account (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL DEFAULT 'x', name TEXT, created_at INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE admin_scope (username TEXT PRIMARY KEY, scope_type TEXT);
    CREATE TABLE admin_sessions (token TEXT PRIMARY KEY, username TEXT NOT NULL, ip TEXT, user_agent TEXT, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL);
    CREATE TABLE admin_login_history (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, ip TEXT, user_agent TEXT, success INTEGER NOT NULL DEFAULT 0, reason TEXT, login_at INTEGER NOT NULL);
    CREATE TABLE teacher_account_links (username TEXT PRIMARY KEY, teacher_id TEXT NOT NULL, teacher_name TEXT, linked_by TEXT, linked_at INTEGER);
    CREATE TABLE teachers (id INTEGER PRIMARY KEY, name TEXT, active INTEGER DEFAULT 1);`);
  return db;
}

/* ── 시각 도우미 ── */
const H = 3600000, MIN = 60000, DAY = 86400000;
const kst = (ymd, hm = '00:00') => Date.parse(`${ymd}T${hm}:00+09:00`);
let seedState = 12345;
function rnd() { seedState = (seedState * 1103515245 + 12345) & 0x7fffffff; return seedState / 0x7fffffff; }
const pick = (a) => a[Math.floor(rnd() * a.length)];
const randInt = (a, b) => a + Math.floor(rnd() * (b - a + 1));

/* ── 독립 기대값(oracle) — 정본과 «같은 규격», 다른 코드 ── */
const ORACLE_FAIL = ['wrong_password', 'wrong_2fa', 'locked_bruteforce'];
function oDayStart(ms) { const k = ms + 9 * H; return k - (((k % DAY) + DAY) % DAY) - 9 * H; }
function oYmd(ms) { return new Date(ms + 9 * H).toISOString().slice(0, 10); }
function oSummary(dayStart, now, logins, seen, lastSeen) {
  const end = dayStart + DAY;
  const inDay = (t) => t != null && Number.isFinite(Number(t)) && Number(t) >= dayStart && Number(t) < end;
  const real = logins.filter(r => inDay(r.login_at) && r.success === 1 && (r.reason == null || r.reason === '')).map(r => r.login_at);
  const failed = logins.filter(r => inDay(r.login_at) && r.success === 0 && ORACLE_FAIL.includes(r.reason)).length;
  const fl = real.length ? Math.min(...real) : null, ll = real.length ? Math.max(...real) : null;
  const sf = seen && inDay(seen.first_seen_at) ? seen.first_seen_at : null;
  const ca = seen && inDay(seen.carried_at) ? seen.carried_at : null;
  const fa = [fl, sf].filter(v => v != null);
  const firstActive = fa.length ? Math.min(...fa) : null;
  const la = [inDay(lastSeen) ? lastSeen : null, ll, firstActive, ca].filter(v => v != null);
  const lastActive = la.length ? Math.max(...la) : null;
  const isToday = now >= dayStart && now < end;
  const online = lastActive != null && isToday && now - lastActive >= 0 && now - lastActive <= 3 * MIN;
  const state = real.length ? 'login' : sf != null ? 'active' : ca != null ? 'carried' : lastActive != null ? 'seen' : 'none';
  return { date: oYmd(dayStart), state, first_login_at: fl, last_login_at: ll, login_count: real.length, failed_count: failed,
    first_active_at: firstActive, carried_at: ca, last_active_at: lastActive, online };
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ═════════════════════════════════════════════════════════════════════════ */
sec('⓪ 전제 — 오려 내기가 됐는가');
ok('auth-admin 에서 isOrgScopedRole·resolveRole 을 오려 냈다', !!isOrgFn && !!resolveRoleFn);
ok('정본 모듈을 불러왔다(필요한 함수가 다 있다)', ['dailySeenPlan', 'noteDailySeen', 'summarizeLoginDay', 'loadTeacherLoginDay', 'loadMyLoginDays', 'ymdStart', 'kstDayStart']
  .every(k => typeof M[k] === 'function') && typeof L.handleTeacherLoginList === 'function');
{
  // 강사 포털(api-teacher.ts)이 정본을 부르므로, 정본은 관리자 게이트 고리(org-scope-guard → auth-admin)를 끌어오면 안 된다.
  // (2026-10-30 CI — auth-admin 을 스텁하는 teacher_page_problem_260807_runtime 하니스의 번들이 그 고리 때문에 깨졌다)
  const T = read(path.join(SRC, 'teacher-login-times.ts'));
  const live = T.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  const froms = [...live.matchAll(/^\s*import\b[^;]*?from\s+'([^']+)'/gm)].map(m => m[1]);
  ok('정본 teacher-login-times.ts 는 d1-chunk 만 import 한다(강사 포털이 관리자 게이트를 짊어지지 않게)', froms.length === 1 && froms[0] === './d1-chunk', froms);
  ok('(전제) 정본 파일을 읽었고 주석을 벗긴 사본이 비지 않았다', T.length > 5000 && live.length > T.length * 0.4, { T: T.length, live: live.length });
}
ok('resolveRole 이 강사·본사·지사를 가른다(이 하니스가 쓰는 판정이 정본 그대로)',
  resolveRole('teacher', 'x', '').role === 'teacher' && resolveRole('hq', 'boss', '대표').role === 'hq' && resolveRole('branch', 'b', '').role === 'branch');

/* ═════════════════════════════════════════════════════════════════════════ */
sec('① 순수 판정 — 경계값');
{
  const now = kst('2026-10-30', '09:00');
  ok('직전 활동이 없음(0)·NaN·미래면 적지 않는다',
    M.dailySeenPlan(0, now) === null && M.dailySeenPlan(NaN, now) === null && M.dailySeenPlan(now + 1000, now) === null);
  ok('오늘 이미 쓴 세션이면 적지 않는다', M.dailySeenPlan(kst('2026-10-30', '00:00'), now) === null);
  const p = M.dailySeenPlan(kst('2026-10-29', '18:00'), now);
  ok('어제 저녁 마지막 → 오늘 09:00 처음 = «첫 접속» 09:00', p && p.ymd === '2026-10-30' && p.first_seen_at === now && p.carried_at === null, p);
  const n2 = kst('2026-10-30', '00:05');
  const c = M.dailySeenPlan(kst('2026-10-29', '23:55'), n2);
  ok('자정 직전(10분 전)까지 쓰던 탭 → «이어서 접속»(첫 접속 아님)', c && c.first_seen_at === null && c.carried_at === n2, c);
  const n3 = kst('2026-10-30', '00:20');
  const c2 = M.dailySeenPlan(kst('2026-10-29', '23:59'), n3);
  ok('21분 공백이면 이어진 것이 아니다(15분 넘음) → 첫 접속', c2 && c2.first_seen_at === n3 && c2.carried_at === null, c2);
  const gap15 = M.dailySeenPlan(n2 - 15 * MIN, n2);
  ok('정확히 15분 공백은 «이어서»(경계 포함)', gap15 && gap15.carried_at === n2);
  ok('ymdStart — 있는 날짜만(2026-02-31·형식 틀림 거절)', M.ymdStart('2026-10-30') === kst('2026-10-30') && M.ymdStart('2026-02-31') === null
    && M.ymdStart('2026-1-3') === null && M.ymdStart("2026-10-30' OR 1=1") === null && M.ymdStart('') === null);
  ok('kstDayStart — KST 0시(UTC 15:00 전날)', M.kstDayStart(kst('2026-10-30', '23:59')) === kst('2026-10-30') && M.kstDayStart(kst('2026-10-30', '00:00')) === kst('2026-10-30'));

  const ds = kst('2026-10-30');
  const L = (hm, success, reason = null) => ({ username: 'u', login_at: kst('2026-10-30', hm), success, reason });
  const s1 = M.summarizeLoginDay(ds, kst('2026-10-30', '15:00'), [
    L('08:10', 1), L('13:00', 1), L('09:00', 1, 'pwreset_done'), L('10:00', 1, 'created_by:admin'), L('10:30', 1, 'password_reset_by:admin'),
    L('07:00', 0, 'wrong_password'), L('07:01', 0, 'wrong_2fa'), L('07:02', 0, 'unknown_user'), L('07:03', 0, 'pwreset_req'),
    { username: 'u', login_at: kst('2026-10-29', '23:00'), success: 1, reason: null },
  ], null, kst('2026-10-30', '14:58'));
  ok('«진짜 로그인» 만 센다 — 비번 재설정·계정 생성·대리 재설정은 로그인이 아니다', s1.login_count === 2 && s1.first_login_at === kst('2026-10-30', '08:10') && s1.last_login_at === kst('2026-10-30', '13:00'), s1);
  ok('실패는 비밀번호·2단계 인증·잠김만(아이디 없음·재설정 요청은 안 셈)', s1.failed_count === 2, s1.failed_count);
  ok('그날 밖(전날 23:00) 로그인은 안 셈', s1.login_count === 2);
  ok('마지막 활동 14:58 · 지금 15:00 → 접속 중(3분 안)', s1.last_active_at === kst('2026-10-30', '14:58') && s1.online === true);
  const s2 = M.summarizeLoginDay(ds, kst('2026-10-30', '15:00'), [], { first_seen_at: kst('2026-10-30', '09:05'), carried_at: null }, kst('2026-10-30', '11:00'));
  ok('로그인 없이 로그인 유지 상태로 09:05 처음 → state active · 첫 접속 09:05', s2.state === 'active' && s2.first_active_at === kst('2026-10-30', '09:05') && s2.online === false, s2);
  const s3 = M.summarizeLoginDay(ds, kst('2026-10-30', '15:00'), [], { first_seen_at: null, carried_at: kst('2026-10-30', '00:02') }, kst('2026-10-30', '00:40'));
  ok('자정 넘어 이어진 접속만 → state carried · «첫 접속» 은 비운다(출근 시각이 아님)', s3.state === 'carried' && s3.first_active_at === null && s3.carried_at === kst('2026-10-30', '00:02'), s3);
  const s4 = M.summarizeLoginDay(ds, kst('2026-10-30', '15:00'), [], null, kst('2026-10-30', '12:00'));
  ok('시작 기록은 없는데 활동은 있음 → state seen(시작 시각을 지어내지 않음)', s4.state === 'seen' && s4.first_active_at === null && s4.last_active_at === kst('2026-10-30', '12:00'), s4);
  const s5 = M.summarizeLoginDay(ds, kst('2026-10-31', '10:00'), [], null, kst('2026-10-31', '09:00'));
  ok('세션 마지막 활동이 그날 «뒤» 면 그날 마지막 활동으로 쓰지 않는다(지난날은 덮여 모름)', s5.state === 'none' && s5.last_active_at === null, s5);
  const s6 = M.summarizeLoginDay(ds, kst('2026-10-31', '10:00'), [L('09:00', 1)], null, kst('2026-10-30', '09:01'));
  ok('지난날은 «지금 접속 중» 이 아니다', s6.online === false && s6.state === 'login');
}

/* ═════════════════════════════════════════════════════════════════════════ */
sec('② checkAdminSession — 진짜 SQLite 에서 «그날 처음 쓴 시각» 적기 (무작위 타임라인)');
const casFn = cutTsFunction(AUTH_TS, 'export async function checkAdminSession(');
ok('checkAdminSession 을 오려 냈다', !!casFn);
const casLive = casFn && deadAt(AUTH_TS, AUTH_TS.indexOf('dailySeenPlan(', casFn.open), casFn.open) === '' && commentsBalanced(casFn.text);
ok('checkAdminSession 안의 dailySeenPlan 호출이 주석 밖에 살아 있다', casLive);
const makeCAS = (clockRef) => new Function('parseCookies', 'SESSION_COOKIE', 'ensureAuthSchema', 'dailySeenPlan', 'noteDailySeen', 'Date',
  strip(casFn.text.replace(/^export\s+/, '')) + '\nreturn checkAdminSession;')(
  (req) => new Map([['sid', req.token]]), 'sid', async () => {}, M.dailySeenPlan, M.noteDailySeen,
  { now: () => clockRef.t });
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0)); };
{
  // 손으로 한 시나리오 — 첫 요청이 적히고, 두 번째는 안 적히며, last_seen 은 매번 갱신
  const db = freshDb(); const env = { DB: d1(db) }; const clock = { t: 0 };
  const cas = makeCAS(clock);
  db.prepare(`INSERT INTO admin_sessions VALUES ('tok','kaye','','',?,?,?)`).run(kst('2026-10-28', '19:00'), kst('2026-11-20'), kst('2026-10-29', '21:00'));
  clock.t = kst('2026-10-30', '08:55');
  const r = await cas({ token: 'tok' }, env); await flush();
  ok('세션 확인은 그대로 통과(ok·username)', r && r.ok === true && r.username === 'kaye');
  const row = db.prepare(`SELECT * FROM admin_daily_seen`).all();
  ok('그날 첫 요청 → admin_daily_seen 한 줄(08:55)', row.length === 1 && row[0].ymd === '2026-10-30' && row[0].first_seen_at === clock.t && row[0].carried_at === null, row);
  ok('last_seen_at 도 갱신', db.prepare(`SELECT last_seen_at AS v FROM admin_sessions`).get().v === clock.t);
  clock.t = kst('2026-10-30', '10:00'); await cas({ token: 'tok' }, env); await flush();
  ok('같은 날 두 번째 요청은 첫 접속을 안 바꾼다', db.prepare(`SELECT first_seen_at AS v FROM admin_daily_seen`).get().v === kst('2026-10-30', '08:55'));
  clock.t = kst('2026-12-01', '10:00');
  const exp = await cas({ token: 'tok' }, env); await flush();
  ok('만료된 세션은 거절하고 아무것도 안 적는다', exp.ok === false && db.prepare(`SELECT COUNT(*) AS n FROM admin_daily_seen`).get().n === 1);
  // 표가 없어도(첫 요청) 만들고 적는다 + noteDailySeen 이 던져도 last_seen 갱신은 된다
  const brokenEnv = { DB: { prepare(sql) { if (/admin_daily_seen/.test(sql)) throw new Error('boom'); return d1(db).prepare(sql); } } };
  db.prepare(`UPDATE admin_sessions SET expires_at = ?, last_seen_at = ?`).run(kst('2027-01-01'), kst('2026-10-31', '20:00'));
  clock.t = kst('2026-11-01', '09:00');
  const r2 = await cas({ token: 'tok' }, brokenEnv); await flush();
  ok('기록이 실패해도 로그인 판정은 그대로(던지지 않음)', r2.ok === true);
  ok('기록이 실패해도 last_seen_at 갱신은 된다', db.prepare(`SELECT last_seen_at AS v FROM admin_sessions`).get().v === clock.t);
  // 워커가 응답 뒤 «중간에 끊기는» 경우 — 쓰기 1번만 되고 그 뒤는 전부 실패(세션 SELECT 는 응답 전이라 된다).
  //   순서가 «적기 → 갱신» 이면 갱신도 못 했으니 다음 요청이 다시 적는다. 반대면 오늘은 영영 못 적는다.
  const cutEnv = (allowRuns) => {
    let runs = 0, cutOff = false;
    return { DB: { prepare(sql) {
      const st = d1(db).prepare(sql);
      const guard = (fn) => async (...a) => { if (cutOff) throw new Error('isolate ended'); return fn(...a); };
      const run0 = st.run;
      st.run = async () => { if (cutOff) throw new Error('isolate ended'); runs++; if (runs > allowRuns) { cutOff = true; throw new Error('isolate ended'); } return run0(); };
      st.first = guard(st.first); st.all = guard(st.all);
      return st;
    } } };
  };
  db.prepare(`DELETE FROM admin_daily_seen`).run();
  db.prepare(`UPDATE admin_sessions SET last_seen_at = ?`).run(kst('2026-11-02', '22:00'));
  clock.t = kst('2026-11-03', '09:00');
  await cas({ token: 'tok' }, cutEnv(1)); await flush();
  clock.t = kst('2026-11-03', '09:30');
  await cas({ token: 'tok' }, env); await flush();
  const after = db.prepare(`SELECT first_seen_at AS v FROM admin_daily_seen WHERE ymd = '2026-11-03'`).get();
  ok('워커가 쓰기 도중 끊겨도 다음 요청이 그날 «첫 접속» 을 적는다(적기 → 갱신 순서)', after && after.v === clock.t, after);
}
{
  // 무작위 타임라인 — 여러 사용자·여러 세션·여러 날. oracle 과 표를 통째로 대조.
  let mism = 0, scenarios = 0, firstMism = null;
  const N = 150 * SEEDS;
  for (let sIdx = 0; sIdx < N; sIdx++) {
    seedState = 1000 + sIdx;
    const db = freshDb(); const env = { DB: d1(db) }; const clock = { t: 0 }; const cas = makeCAS(clock);
    const users = ['kaye', 'win', 'farrah'].slice(0, randInt(1, 3));
    const base = kst('2026-10-27');
    const sessions = [];
    for (const u of users) for (let k = 0; k < randInt(1, 3); k++) {
      const created = base + randInt(0, 3 * 24) * H + randInt(0, 59) * MIN;
      const tok = u + '-' + k;
      db.prepare(`INSERT INTO admin_sessions VALUES (?,?,'','',?,?,?)`).run(tok, u, created, created + 40 * DAY, created);
      sessions.push({ tok, u, last: created });
    }
    const reqs = [];
    for (let k = 0; k < randInt(5, 40); k++) {
      const s = pick(sessions);
      // 자정 근처에 몰아서 «이어서/새로» 경계를 자주 밟게 한다
      const day = randInt(0, 4);
      const t = rnd() < 0.35 ? base + day * DAY + (rnd() < 0.5 ? -randInt(0, 20) * MIN : randInt(0, 20) * MIN)
                             : base + day * DAY + randInt(0, 23) * H + randInt(0, 59) * MIN + randInt(0, 59) * 1000;
      reqs.push({ s, t });
    }
    reqs.sort((a, b) => a.t - b.t);
    const expect = new Map();   // key u|ymd → {first, carried}
    for (const q of reqs) {
      if (q.t < q.s.last) continue;   // 세션이 만들어지기 전 요청은 건너뜀
      const prev = q.s.last;
      if (prev > 0 && prev < oDayStart(q.t)) {
        const key = q.s.u + '|' + oYmd(q.t);
        const e = expect.get(key) || { first: null, carried: null };
        if (q.t - prev <= 15 * MIN) e.carried = e.carried == null ? q.t : Math.min(e.carried, q.t);
        else e.first = e.first == null ? q.t : Math.min(e.first, q.t);
        expect.set(key, e);
      }
      q.s.last = q.t;
      clock.t = q.t;
      await cas({ token: q.s.tok }, env);
      await flush();
    }
    let got = [];
    try { got = db.prepare(`SELECT username, ymd, first_seen_at, carried_at FROM admin_daily_seen`).all(); } catch { got = []; }
    const gotMap = new Map(got.map(r => [r.username + '|' + r.ymd, { first: r.first_seen_at, carried: r.carried_at }]));
    const a = JSON.stringify([...expect.entries()].sort()), b = JSON.stringify([...gotMap.entries()].sort());
    scenarios++;
    if (a !== b) { mism++; if (!firstMism) firstMism = { seed: 1000 + sIdx, expect: a, got: b }; }
  }
  ok(`무작위 요청 타임라인 ${scenarios}개 — admin_daily_seen 이 oracle 과 완전히 같다`, mism === 0, firstMism);
}

/* ═════════════════════════════════════════════════════════════════════════ */
sec('③ 본사 목록·강사 본인 — 진짜 SQLite (무작위 기록 수백 벌)');
const REASONS = [null, null, null, 'pwreset_done', 'created_by:admin', 'password_reset_by:hq', 'contact_set_by:hq', ''];
const FREASONS = ['wrong_password', 'wrong_2fa', 'locked_bruteforce', 'unknown_user', 'pwreset_req', 'legacy_provision_failed'];
function seedAccounts(db) {
  const acc = [
    ['hq_t_kang', '중국어 강선생님', null], ['mangoi_018', 'Teacher Farrah', 'teacher'], ['mangoi_167', 'Teacher Kaye', 'teacher'],
    ['jeong', '정우영(교사)', 'hq'], ['admin', '대표', 'hq'], ['mgr_karl', 'Karl', 'hq'], ['branch_busan', '부산지사', 'branch'],
    ['agency_x', '대리점', 'agency'], ['teacherless', 'Teacher Old', 'none'], ['staff1', '직원', 'none'],
  ];
  for (const [u, n, s] of acc) {
    db.prepare(`INSERT INTO admin_account (username, name) VALUES (?, ?)`).run(u, n);
    if (s) db.prepare(`INSERT INTO admin_scope VALUES (?, ?)`).run(u, s);
  }
  db.prepare(`INSERT INTO teachers VALUES (22, 'FAR', 1)`).run();
  db.prepare(`INSERT INTO teachers VALUES (29, '강선생님', 1)`).run();
  db.prepare(`INSERT INTO teacher_account_links VALUES ('mangoi_018', '22', 'FAR', 'x', 0)`).run();
  db.prepare(`INSERT INTO teacher_account_links VALUES ('hq_t_kang', '29', '강선생님', 'x', 0)`).run();
  return acc;
}
function oTeacherList(db, ymd, now) {
  const ds = kst(ymd);
  const rows = db.prepare(`SELECT a.username, a.name, s.scope_type FROM admin_account a LEFT JOIN admin_scope s ON s.username = a.username`).all();
  const teach = rows.filter(r => resolveRole(r.scope_type || 'none', r.username, r.name || '').role === 'teacher');
  const items = teach.map(r => {
    const logins = db.prepare(`SELECT username, login_at, success, reason FROM admin_login_history WHERE username = ?`).all(r.username);
    let seen = null;
    try { seen = db.prepare(`SELECT first_seen_at, carried_at FROM admin_daily_seen WHERE username = ? AND ymd = ?`).get(r.username, ymd) || null; } catch { seen = null; }
    const ls = db.prepare(`SELECT MAX(last_seen_at) AS m FROM admin_sessions WHERE username = ?`).get(r.username).m;
    const sm = oSummary(ds, now, logins, seen, ls == null ? null : ls);
    const lb = logins.filter(l => l.success === 1 && (l.reason == null || l.reason === '') && l.login_at < ds + DAY).map(l => l.login_at);
    const link = db.prepare(`SELECT t.name AS n FROM teacher_account_links l LEFT JOIN teachers t ON CAST(t.id AS TEXT) = CAST(l.teacher_id AS TEXT) WHERE l.username = ?`).get(r.username);
    const tn = link && link.n ? link.n : null;
    return { username: r.username, name: (r.name || '').trim(), teacher_name: tn, display_name: tn || (r.name || '').trim() || r.username,
      ...sm, last_login_before: sm.login_count > 0 ? null : (lb.length ? Math.max(...lb) : null) };
  });
  items.sort((a, b) => {
    const ka = a.first_active_at ?? a.carried_at ?? a.last_active_at, kb = b.first_active_at ?? b.carried_at ?? b.last_active_at;
    if (ka != null && kb != null && ka !== kb) return ka - kb;
    if (ka != null && kb == null) return -1;
    if (ka == null && kb != null) return 1;
    return String(a.display_name || a.username).localeCompare(String(b.display_name || b.username));
  });
  return items;
}
{
  // 손으로 — 강사만 나오고(본사·지사·직원 빠짐), 원부 이름이 붙는다
  const db = freshDb(); seedAccounts(db); const env = { DB: d1(db) };
  const now = kst('2026-10-30', '15:00');
  db.prepare(`INSERT INTO admin_login_history (username, success, reason, login_at) VALUES ('mangoi_018', 1, NULL, ?)`).run(kst('2026-10-30', '08:50'));
  db.prepare(`INSERT INTO admin_login_history (username, success, reason, login_at) VALUES ('admin', 1, NULL, ?)`).run(kst('2026-10-30', '08:00'));
  const r = await M.loadTeacherLoginDay(env, '2026-10-30', now, (st, u, n) => resolveRole(st, u, n).role);
  const names = r.items.map(i => i.username).sort();
  ok('강사 계정만 — hq_t_* · scope teacher · 이름에 «교사/teacher» (본사·지사·대리점·직원 제외)',
    same(names, ['hq_t_kang', 'jeong', 'mangoi_018', 'mangoi_167', 'teacherless']), names);
  const far = r.items.find(i => i.username === 'mangoi_018');
  ok('원부 이름이 붙는다(FAR) · 08:50 로그인이 첫 줄', far && far.display_name === 'FAR' && r.items[0].username === 'mangoi_018' && far.state === 'login');
  ok('IP·기기 정보는 싣지 않는다', !JSON.stringify(r).includes('user_agent') && !/"ip"/.test(JSON.stringify(r)));
  ok('틀린 날짜는 null(→ 400)', (await M.loadTeacherLoginDay(env, '2026-13-01', now, (st, u, n) => resolveRole(st, u, n).role)) === null);
  ok('first_seen_since — 기록이 아직 없으면 null(화면이 «오늘부터 기록» 이라 말함)', r.first_seen_since === null);
}
{
  let mism = 0, firstMism = null, n = 0;
  const N = 200 * SEEDS;
  for (let sIdx = 0; sIdx < N; sIdx++) {
    seedState = 50000 + sIdx;
    const db = freshDb(); const acc = seedAccounts(db); const env = { DB: d1(db) };
    const day = '2026-10-' + String(randInt(26, 30)).padStart(2, '0');
    const ds = kst(day);
    const now = rnd() < 0.5 ? ds + randInt(0, 23) * H + randInt(0, 59) * MIN : ds + randInt(1, 3) * DAY + randInt(0, 10) * H;
    const us = acc.map(a => a[0]);
    for (let k = 0; k < randInt(0, 40); k++) {
      const u = pick(us); const t = ds + randInt(-2 * 24, 2 * 24) * H + randInt(0, 3599) * 1000;
      if (rnd() < 0.7) db.prepare(`INSERT INTO admin_login_history (username, success, reason, login_at) VALUES (?, 1, ?, ?)`).run(u, pick(REASONS), t);
      else db.prepare(`INSERT INTO admin_login_history (username, success, reason, login_at) VALUES (?, 0, ?, ?)`).run(u, pick(FREASONS), t);
    }
    if (rnd() < 0.8) {
      await M.ensureDailySeen(env.DB);
      for (const u of us) if (rnd() < 0.4) {
        const fs1 = rnd() < 0.6 ? ds + randInt(0, 23) * H + randInt(0, 59) * MIN : null;
        const ca = rnd() < 0.3 ? ds + randInt(0, 20) * MIN : null;
        if (fs1 != null || ca != null) db.prepare(`INSERT INTO admin_daily_seen VALUES (?, ?, ?, ?)`).run(u, day, fs1, ca);
      }
    }
    for (const u of us) for (let k = 0; k < randInt(0, 2); k++) {
      const ls = ds + randInt(-24, 72) * H + randInt(0, 59) * MIN;
      db.prepare(`INSERT INTO admin_sessions VALUES (?, ?, '', '', ?, ?, ?)`).run(u + k + sIdx, u, ls - DAY, ls + 30 * DAY, ls);
    }
    const got = await M.loadTeacherLoginDay(env, day, now, (st, u, nm) => resolveRole(st, u, nm).role);
    const want = oTeacherList(db, day, now);
    const strip2 = (it) => ({ username: it.username, name: it.name, teacher_name: it.teacher_name, display_name: it.display_name, date: it.date, state: it.state,
      first_login_at: it.first_login_at, last_login_at: it.last_login_at, login_count: it.login_count, failed_count: it.failed_count,
      first_active_at: it.first_active_at, carried_at: it.carried_at, last_active_at: it.last_active_at, online: it.online, last_login_before: it.last_login_before });
    n++;
    const g = JSON.stringify(got.items.map(strip2)), w = JSON.stringify(want.map(strip2));
    const cnt = got.counts.total === want.length && got.counts.active === want.filter(i => i.state !== 'none').length && got.counts.online === want.filter(i => i.online).length;
    if (g !== w || !cnt || got.is_today !== (oYmd(now) === day) || got.partial.length) { mism++; if (!firstMism) firstMism = { seed: 50000 + sIdx, got: g.slice(0, 600), want: w.slice(0, 600) }; }
  }
  ok(`무작위 기록 ${n}벌 — 본사 목록이 oracle 과 완전히 같다(순서·숫자·상태·마지막 로그인)`, mism === 0, firstMism);
}
{
  // 강사 본인 — 최근 14일, 자기 계정만
  let mism = 0, firstMism = null, n = 0;
  const N = 120 * SEEDS;
  for (let sIdx = 0; sIdx < N; sIdx++) {
    seedState = 90000 + sIdx;
    const db = freshDb(); seedAccounts(db); const env = { DB: d1(db) };
    const now = kst('2026-10-30', '00:00') + randInt(0, 23) * H + randInt(0, 59) * MIN;
    await M.ensureDailySeen(env.DB);
    for (const u of ['mangoi_167', 'mangoi_018']) {
      for (let k = 0; k < randInt(0, 30); k++) {
        const t = now - randInt(0, 20 * 24) * H - randInt(0, 3599) * 1000;
        if (rnd() < 0.7) db.prepare(`INSERT INTO admin_login_history (username, success, reason, login_at) VALUES (?, 1, ?, ?)`).run(u, pick(REASONS), t);
        else db.prepare(`INSERT INTO admin_login_history (username, success, reason, login_at) VALUES (?, 0, ?, ?)`).run(u, pick(FREASONS), t);
      }
      for (let d = 0; d < 16; d++) if (rnd() < 0.5) {
        const dd = oDayStart(now) - d * DAY;
        db.prepare(`INSERT OR IGNORE INTO admin_daily_seen VALUES (?, ?, ?, ?)`).run(u, oYmd(dd), rnd() < 0.7 ? dd + randInt(5, 22) * H : null, rnd() < 0.3 ? dd + randInt(0, 14) * MIN : null);
      }
      db.prepare(`INSERT INTO admin_sessions VALUES (?, ?, '', '', ?, ?, ?)`).run(u + sIdx, u, now - 5 * DAY, now + 20 * DAY, now - randInt(0, 600) * MIN);
    }
    const got = await M.loadMyLoginDays(env, 'mangoi_167', now);
    const logins = db.prepare(`SELECT username, login_at, success, reason FROM admin_login_history WHERE username = 'mangoi_167'`).all();
    const ls = db.prepare(`SELECT MAX(last_seen_at) AS m FROM admin_sessions WHERE username = 'mangoi_167'`).get().m;
    const want = [];
    for (let d = 0; d < 14; d++) {
      const dd = oDayStart(now) - d * DAY;
      const seen = db.prepare(`SELECT first_seen_at, carried_at FROM admin_daily_seen WHERE username = 'mangoi_167' AND ymd = ?`).get(oYmd(dd)) || null;
      want.push(oSummary(dd, now, logins, seen, ls));
    }
    n++;
    if (!same(got.days, want) || got.username !== 'mangoi_167') { mism++; if (!firstMism) firstMism = { seed: 90000 + sIdx, got: JSON.stringify(got.days).slice(0, 400), want: JSON.stringify(want).slice(0, 400) }; }
  }
  ok(`무작위 ${n}벌 — 강사 «내 기록» 14일이 oracle 과 같고 남의 계정이 안 섞인다`, mism === 0, firstMism);
}
{
  // 게이트 — 강사·지사·대리점·«모름» 은 막고 본사는 통과
  const db = freshDb(); seedAccounts(db); const env = { DB: d1(db) };
  const url = new URL('https://x/api/admin/login-history?scope=teachers&date=2026-10-30');
  const roleOf = (st, u, n) => resolveRole(st, u, n).role;
  const call = (actor, u = url) => L.handleTeacherLoginList(new Request(u), u, env, { actorOf: async () => actor, roleOf, now: kst('2026-10-30', '12:00') });
  const r401 = await call({ ok: false, username: '', name: '', role: 'none', isTeacher: false });
  ok('로그인 안 함 → 401', r401.status === 401);
  const rT = await call({ ok: true, username: 'mangoi_167', name: 'Teacher Kaye', role: 'teacher', isTeacher: true });
  const bT = await rT.json();
  ok('강사 → 403(forbidden_teacher · 계정 이름을 함께 말함)', rT.status === 403 && bT.error === 'forbidden_teacher' && JSON.stringify(bT).includes('mangoi_167'), bT);
  const rB = await call({ ok: true, username: 'branch_busan', name: '부산지사', role: 'branch', isTeacher: false });
  ok('지사 → 403 forbidden_scope', rB.status === 403 && (await rB.json()).error === 'forbidden_scope');
  const rA = await call({ ok: true, username: 'agency_x', name: '대리점', role: 'staff', isTeacher: false });
  ok('getAdminActor 가 «staff» 로 떨어져도 admin_scope 를 다시 읽어 대리점이면 막는다', rA.status === 403);
  // 강사도 같다 — isTeacher·index.ts 차단은 둘 다 actor 에 기대므로, actor 가 «staff» 로 떨어진 날에도 막혀야 한다.
  const rTs = await call({ ok: true, username: 'mangoi_167', name: '', role: 'staff', isTeacher: false });
  const bTs = await rTs.json();
  ok('getAdminActor 가 «staff» 로 떨어져도 admin_scope 가 teacher 면 막는다(forbidden_teacher)', rTs.status === 403 && bTs.error === 'forbidden_teacher', bTs);
  // 짝 — 스코프는 'none' 인데 이름으로 강사로 판정된 계정(옛 LMS 자동생성 등)은 첫 겹(isTeacher)이 막는다.
  //    (두 겹이 같은 계정만 막으면 한 겹을 지워도 검사가 못 봄 — 변이시험이 실제로 그 상태를 잡았다)
  const rTn = await call({ ok: true, username: 'teacherless', name: 'Teacher Old', role: 'teacher', isTeacher: true });
  const bTn = await rTn.json();
  ok('스코프가 none 이어도 강사로 판정된 계정 → 403 forbidden_teacher', rTn.status === 403 && bTn.error === 'forbidden_teacher', bTn);
  const rU = await call({ ok: true, username: 'ghost_hq', name: '', role: 'hq', isTeacher: false });
  ok('admin_scope 를 못 읽으면(행 없음) «모름» → 막는다(fail-closed)', rU.status === 403 && (await rU.json()).error === 'scope_unknown');
  const rH = await call({ ok: true, username: 'mgr_karl', name: 'Karl', role: 'hq', isTeacher: false });
  const bH = await rH.json();
  ok('본사 → 200 · 목록 · no-store', rH.status === 200 && bH.ok === true && Array.isArray(bH.items) && rH.headers.get('Cache-Control') === 'no-store');
  const bad = new URL('https://x/api/admin/login-history?scope=teachers&date=2026-02-31');
  ok('없는 날짜 → 400 bad_date', (await call({ ok: true, username: 'mgr_karl', name: 'Karl', role: 'hq', isTeacher: false }, bad)).status === 400);
  const noDate = new URL('https://x/api/admin/login-history?scope=teachers');
  const bN = await (await call({ ok: true, username: 'mgr_karl', name: 'Karl', role: 'hq', isTeacher: false }, noDate)).json();
  ok('날짜 없으면 오늘(KST)', bN.date === '2026-10-30');
  const throwEnv = { DB: { prepare() { throw new Error('d1 down'); } } };
  const rX = await L.handleTeacherLoginList(new Request(url), url, throwEnv, { actorOf: async () => ({ ok: true, username: 'mgr_karl', name: 'Karl', role: 'hq', isTeacher: false }), roleOf });
  ok('DB 가 죽으면 «0명» 이 아니라 막거나 실패로 말한다', rX.status === 403 || rX.status === 500);
  // 부분 실패 — 로그인 기록만 못 읽으면 partial 에 이름이 실린다(빈 칸을 «없음» 으로 위장하지 않음)
  const partEnv = { DB: { prepare(sql) { if (/admin_login_history/.test(sql)) throw new Error('x'); return d1(db).prepare(sql); } } };
  const rP = await M.loadTeacherLoginDay(partEnv, '2026-10-30', kst('2026-10-30', '12:00'), roleOf);
  ok('로그인 기록을 못 읽으면 partial 에 logins·last_login', rP && rP.partial.includes('logins') && rP.partial.includes('last_login'), rP && rP.partial);
}

/* ═════════════════════════════════════════════════════════════════════════ */
sec('④ 배선 — 경로 분기·강사 포털 블록을 오려 내 실제로 실행');
{
  const h = cutTsFunction(AUTH_TS, 'export async function handleAdminAuthApi(');
  const scopeAt = AUTH_TS.indexOf("url.searchParams.get('scope') === 'teachers'", h ? h.open : 0);
  const plainAt = AUTH_TS.indexOf("// ── 로그인 이력 (최근 10건) ──", h ? h.open : 0);
  ok('scope=teachers 분기가 handleAdminAuthApi 안 · 기존 «내 로그인 이력» 분기보다 앞', h && scopeAt > h.open && scopeAt < h.end && plainAt > scopeAt, { scopeAt, plainAt });
  const ifAt = AUTH_TS.lastIndexOf('if (', scopeAt);
  const blk = cut(AUTH_TS, 'if (', ifAt);
  ok('그 분기가 주석 밖에 살아 있다', blk && deadAt(AUTH_TS, ifAt, h.open) === '' && commentsBalanced(blk.text));
  const calls = [];
  // ⚠️ 함수 «안» 에 넣은 뒤에 타입을 벗긴다 — 블록만 벗기면 «함수 밖 return» 으로 실패한다(CLAUDE.md 2장).
  const runBranch = (p, m, q) => new Function('path', 'method', 'url', 'request', 'env', 'handleTeacherLoginList', 'getAdminActor', 'resolveRole',
    'return ' + strip('(async () => {\n' + blk.text + '\nreturn null; })') + '();')(p, m, new URL('https://x' + p + q), {}, {}, async (...a) => { calls.push(a); return 'LIST'; },
    'ACTOR_FN', (st, u, n) => ({ role: 'R:' + st + ':' + u + ':' + n }));
  const r1 = await runBranch('/api/admin/login-history', 'GET', '?scope=teachers');
  ok('?scope=teachers → 목록 핸들러를 부른다', r1 === 'LIST' && calls.length === 1);
  ok('넘기는 actorOf 는 getAdminActor, roleOf 는 resolveRole(...).role', calls[0] && calls[0][3].actorOf === 'ACTOR_FN' && calls[0][3].roleOf('teacher', 'u1', 'n1') === 'R:teacher:u1:n1');
  const r2 = await runBranch('/api/admin/login-history', 'GET', '');
  const r3 = await runBranch('/api/admin/login-history', 'GET', '?scope=me');
  const r4 = await runBranch('/api/admin/login-history', 'POST', '?scope=teachers');
  ok('scope 가 없거나 다르거나 POST 면 기존 «내 로그인 이력» 으로 흘러간다(목록 안 부름)', r2 === null && r3 === null && r4 === null && calls.length === 1);
}
{
  const API = read(path.join(SRC, 'api-teacher.ts'));
  const h = cutTsFunction(API, 'export async function handleTeacherApi(') || cutTsFunction(API, 'export async function handleTeacherPortal(');
  const at = API.indexOf("if (url.searchParams.get('part') === 'my_login')");
  const gateAt = API.indexOf("if (!actor.ok) return json({ ok: false, error: 'auth_required' }, 401);");
  const notTeacherAt = API.indexOf("error: 'not_a_teacher'");
  ok('my_login 블록이 로그인 확인·강사/본사 확인 «뒤» 에 있다', at > gateAt && at > notTeacherAt && gateAt > 0, { at, gateAt, notTeacherAt });
  const blk = cut(API, "if (url.searchParams.get('part') === 'my_login')");
  ok('my_login 블록이 주석 밖에 살아 있다', blk && deadAt(API, at, gateAt) === '' && commentsBalanced(blk.text));
  const seen = [];
  const run = (q, actor) => new Function('url', 'actor', 'env', 'json', 'loadMyLoginDays', 'Date',
    'return ' + strip('(async () => {\n' + blk.text + '\nreturn "FELL_THROUGH"; })') + '();')(new URL('https://x/api/teacher/portal' + q), actor, { DB: 1 },
    (b, s) => ({ b, s: s || 200 }), async (env, u, now) => { seen.push(u); return { ok: true, username: u }; }, { now: () => 5 });
  const a = await run('?part=my_login&username=admin&user=admin', { username: 'mangoi_167' });
  ok('자기 계정(actor.username)만 — 주소에 남의 아이디를 넣어도 무시', a.b.username === 'mangoi_167' && seen[0] === 'mangoi_167');
  const b = await run('?part=my_evals', { username: 'mangoi_167' });
  ok('다른 part 면 이 블록은 아무것도 안 한다', b === 'FELL_THROUGH');
  const c = await new Function('url', 'actor', 'env', 'json', 'loadMyLoginDays', 'Date',
    'return ' + strip('(async () => {\n' + blk.text + '\n})') + '();')(new URL('https://x/api/teacher/portal?part=my_login'), { username: 'k' }, {},
    (bd, s) => ({ bd, s: s || 200 }), async () => { throw new Error('db'); }, Date);
  ok('읽기 실패는 500 db_error(«기록 없음» 으로 위장 안 함)', c.s === 500 && c.bd.error === 'db_error');
}

/* ═════════════════════════════════════════════════════════════════════════ */
sec('⑤ 화면 — manager.html 카드 · teacher.html 카드를 오려 내 가짜 DOM 으로 실행');
const MGR = read(path.join(PUB, 'manager.html'));
const TCH = read(path.join(PUB, 'teacher.html'));
{
  ok('매니저: 카드·메뉴는 기본 숨김(hidden) — 본사일 때만 연다', /<details class="card" id="c-logins"[^>]*\bhidden\b/.test(MGR) && /id="sideLogins"[^>]*\bhidden\b/.test(MGR));
  const hqLine = MGR.indexOf("['c-logins', 'sideLogins'].forEach(function(id){ var w = document.getElementById(id); if (w) w.hidden = !IS_HQ; });");
  ok('매니저: IS_HQ 판정 바로 뒤에서 두 칸을 함께 연다', hqLine > MGR.indexOf("IS_HQ = (sc.type === 'hq');") && hqLine - MGR.indexOf("IS_HQ = (sc.type === 'hq');") < 1500);
  ok('매니저: 그릇(#tlBody·#tlCount)에 data-en/data-ko 를 달지 않았다(🌐 가 목록을 지우지 않게)',
    !/id="tlBody"[^>]*data-en/.test(MGR) && !/id="tlCount"[^>]*data-en/.test(MGR));
  // 함수들을 오려 내 실행
  const fns = ['window.loadLogins = function', 'function tlTime(', 'function tlCells(', 'function paintLogins('].map(s => cut(MGR, s));
  ok('매니저: 그리기 함수 4개를 오려 냈다', fns.every(Boolean));
  const mk = (lang) => {
    const els = { tlBody: { className: '', textContent: '', innerHTML: '' }, tlCount: { textContent: '' }, tlDate: { value: '' } };
    const gets = [];
    const ctx = { EN: () => lang === 'en', D: {}, els, gets };
    const code = 'var TL_SEQ=0;' + fns.map(f => f.text.replace(/^window\.loadLogins = function/, 'var loadLogins = function')).join('\n')
      + '\nreturn { loadLogins: loadLogins, paintLogins: paintLogins, tlTime: tlTime, D: D };';
    const api = new Function('T', 'esc', 'EN', 'D', 'document', 'get', 'failBox', 'kstToday',
      code)((en, ko) => lang === 'en' ? en : ko, (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';'), () => lang === 'en', ctx.D,
      { getElementById: (id) => els[id] }, (p, k) => { gets.push([p, k]); return Promise.resolve(ctx.resp); },
      (el, e) => { el.className = 'empty'; el.textContent = 'FAIL:' + e.message; }, () => '2026-10-30');
    return Object.assign(ctx, api);
  };
  const t = (hm) => kst('2026-10-30', hm);
  const resp = { ok: true, date: '2026-10-30', is_today: true, first_seen_since: '2026-10-30', partial: [], counts: { total: 4, active: 3, online: 1 },
    items: [
      { username: 'mangoi_018', display_name: 'FAR', state: 'login', first_active_at: t('08:50'), first_login_at: t('08:50'), last_login_at: t('13:10'), login_count: 2, failed_count: 1, last_active_at: t('14:59'), online: true, carried_at: null, last_login_before: null },
      { username: 'hq_t_kang', display_name: '강선생님', state: 'active', first_active_at: t('09:05'), first_login_at: null, last_login_at: null, login_count: 0, failed_count: 0, last_active_at: t('11:00'), online: false, carried_at: null, last_login_before: kst('2026-10-22', '19:22') },
      { username: 'mangoi_167', display_name: 'Teacher Kaye', state: 'carried', first_active_at: null, first_login_at: null, last_login_at: null, login_count: 0, failed_count: 0, last_active_at: t('00:30'), online: false, carried_at: t('00:02'), last_login_before: null },
      { username: 'teacherless', display_name: 'Teacher Old', state: 'none', first_active_at: null, first_login_at: null, last_login_at: null, login_count: 0, failed_count: 0, last_active_at: null, online: false, carried_at: null, last_login_before: null },
    ] };
  for (const lang of ['en', 'ko']) {
    const c = mk(lang); c.resp = resp;
    c.loadLogins(true); await flush();
    const H2 = c.els.tlBody.innerHTML;
    ok(`매니저(${lang}): 목록 API 는 ?scope=teachers&date= · 캐시 키 없음(실패 때 옛 목록을 오늘 것처럼 안 보임)`,
      c.gets.length === 1 && c.gets[0][0] === '/api/admin/login-history?scope=teachers&date=2026-10-30' && c.gets[0][1] === null, c.gets);
    ok(`매니저(${lang}): 한국 시간과 필리핀 시간(1시간 빠름)을 함께`, H2.includes('08:50 (PH 07:50)'));
    ok(`매니저(${lang}): 접속 중·실패 횟수·로그인 횟수`, H2.includes(lang === 'en' ? 'Online now' : '지금 접속 중') && H2.includes(lang === 'en' ? '1 failed login' : '로그인 실패 1회') && H2.includes(lang === 'en' ? '2 times' : '2회'));
    ok(`매니저(${lang}): 로그인 유지 상태 접속은 «전에 로그인한 상태» 라고 말한다`, H2.includes(lang === 'en' ? 'still logged in from before' : '전에 로그인한 상태로 접속'));
    ok(`매니저(${lang}): 오늘 로그인이 없으면 마지막 로그인을 날짜와 함께`, H2.includes((lang === 'en' ? 'Last login: ' : '마지막 로그인: ') + '10-22 19:22 (PH 18:22)'));
    ok(`매니저(${lang}): 자정 넘어 이어진 접속은 «시작 시각» 이 아니라 그 사실로`, H2.includes(lang === 'en' ? 'On since midnight' : '자정 넘어 계속 접속'));
    const moreAt = H2.indexOf('tl-more');
    ok(`매니저(${lang}): 기록 없는 강사는 접힌 «이날 기록 없음» 안으로`, moreAt > 0 && H2.indexOf('Teacher Old') > moreAt && H2.indexOf('FAR') < moreAt);
    ok(`매니저(${lang}): 위에 접속 순서 그대로(FAR → 강선생님 → Kaye)`, H2.indexOf('FAR') < H2.indexOf('강선생님') && H2.indexOf('강선생님') < H2.indexOf('Teacher Kaye'));
    ok(`매니저(${lang}): 숫자 줄`, c.els.tlCount.textContent.includes('3') && c.els.tlCount.textContent.includes('4'));
  }
  const cp = mk('ko'); cp.resp = Object.assign({}, resp, { partial: ['logins'], first_seen_since: null, items: [] });
  cp.loadLogins(true); await flush();
  ok('매니저: 일부 못 읽음 → 경고 줄 · «첫 접속은 오늘부터 기록» 안내', cp.els.tlBody.innerHTML.includes('일부 기록을 읽지 못했습니다') && cp.els.tlBody.innerHTML.includes('부터 기록됩니다'));
  ok('매니저: «첫 접속 기록 시작일» 이 지난 날짜면 그 안내를 숨긴다', (() => { const c = mk('ko'); c.resp = Object.assign({}, resp, { date: '2026-11-02', first_seen_since: '2026-10-30' }); c.D.logins = c.resp; c.paintLogins(); return !c.els.tlBody.innerHTML.includes('부터 기록됩니다'); })());
  ok('매니저: 언어 전환 때 다시 그린다(repaintAll)·새로고침 때 다시 받는다(reloadAll)',
    /if \(D\.logins\) paintLogins\(\);/.test(cut(MGR, 'function repaintAll(').text) && cut(MGR, 'window.reloadAll = function').text.includes("'c-logins:loadLogins'"));
}
{
  ok('강사: 카드는 펼칠 때만 부른다(첫 화면 API 1회 계약)', /<details class="card mycard" id="c-mylogin" ontoggle="if\(this\.open\)loadMyLogin\(\)">/.test(TCH));
  const fns = ['window.loadMyLogin = function', 'function mlTime(', 'function paintMyLogin('].map(s => cut(TCH, s));
  ok('강사: 그리기 함수 3개를 오려 냈다', fns.every(Boolean));
  const mk = (lang) => {
    const box = { innerHTML: '', attrs: { 'data-en': 1 } };
    const gets = [];
    const MY = { mylogin: null };
    const api = new Function('T', 'esc', 'EN', 'MY', 'myGet', 'loading', 'failed', 'fill',
      fns.map(f => f.text.replace(/^window\.loadMyLogin = function/, 'var loadMyLogin = function')).join('\n') + '\nreturn { loadMyLogin: loadMyLogin, paintMyLogin: paintMyLogin };')(
      (en, ko) => lang === 'en' ? en : ko, (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';'), () => lang === 'en', MY,
      (k, u) => { gets.push([k, u]); return Promise.resolve(mk.resp); }, () => {}, () => { box.innerHTML = 'FAILED'; },
      (id, html) => { box.id = id; box.innerHTML = html; });
    return Object.assign({ box, gets, MY }, api);
  };
  const now = kst('2026-10-30', '15:00');
  const days = [];
  for (let d = 0; d < 14; d++) days.push(oSummary(kst('2026-10-30') - d * DAY, now, [], null, null));
  days[0] = Object.assign({}, days[0], { state: 'login', first_active_at: kst('2026-10-30', '08:50'), first_login_at: kst('2026-10-30', '08:50'), login_count: 1, last_active_at: kst('2026-10-30', '14:59'), online: true, failed_count: 2 });
  days[1] = Object.assign({}, days[1], { state: 'carried', carried_at: kst('2026-10-29', '00:03') });
  mk.resp = { ok: true, username: 'mangoi_167', days, partial: [], first_seen_since: '2026-10-30' };
  for (const lang of ['en', 'ko']) {
    const c = mk(lang); c.loadMyLogin(); await flush();
    const H2 = c.box.innerHTML;
    ok(`강사(${lang}): 같은 포털 경로의 ?part=my_login`, c.gets[0] && c.gets[0][1] === '/api/teacher/portal?part=my_login');
    ok(`강사(${lang}): 14일이 한 줄씩 · 오늘 줄 강조`, (H2.match(/<tr/g) || []).length === 15 && H2.includes('class="ml-today"'));
    ok(`강사(${lang}): 한국·필리핀 시간 · 접속 중 · 실패 횟수 · 자정 넘어 접속`, H2.includes('08:50 (PH 07:50)') && H2.includes(lang === 'en' ? 'Now' : '지금 접속 중')
      && H2.includes(lang === 'en' ? '2 failed' : '실패 2회') && H2.includes(lang === 'en' ? 'On since midnight' : '자정 넘어 계속 접속'));
    ok(`강사(${lang}): 요일(10-30 = ${lang === 'en' ? 'Fri' : '금'})`, H2.includes('10-30</b> ' + (lang === 'en' ? 'Fri' : '금')));
  }
  ok('강사: 언어 전환 때 다시 그린다(repaintMy)', /if \(MY\.mylogin\) paintMyLogin\(\);/.test(cut(TCH, 'function repaintMy(').text));
}

/* ═════════════════════════════════════════════════════════════════════════ */
fs.rmSync(tmp, { recursive: true, force: true });

if (process.env.TLT_MUTATE === '1' && !process.env.TLT_IN_MUTATION) {
  sec('⑥ 변이시험 — 소스 사본에 결함을 하나씩 넣고 이 하니스가 «실제로 FAIL» 하는지');
  const MUT = [
    ['src', 'teacher-login-times.ts', "Number(r?.success) === 1 && (r?.reason == null || String(r.reason).trim() === '')", 'Number(r?.success) === 1', '비로그인 이벤트(비번 재설정 등)를 로그인으로 셈'],
    ['src', 'teacher-login-times.ts', 'if (prevSeen >= kstDayStart(now)) return null;', 'if (prevSeen >= kstDayStart(now) && false) return null;', '오늘 이미 쓴 세션도 다시 적음(조건 무력화)'],
    ['src', 'teacher-login-times.ts', 'const carried = now - prevSeen <= CARRY_GAP_MS;', 'const carried = false;', '자정 넘어 이어진 접속을 «출근» 으로 적음'],
    ['src', 'teacher-login-times.ts', 'const carried = now - prevSeen <= CARRY_GAP_MS;', 'const carried = now - prevSeen > CARRY_GAP_MS;', '이어짐 판정 뒤집기'],
    ['src', 'teacher-login-times.ts', 'first_seen_at = COALESCE(MIN(admin_daily_seen.first_seen_at, excluded.first_seen_at), admin_daily_seen.first_seen_at, excluded.first_seen_at)', 'first_seen_at = excluded.first_seen_at', '두 번째 세션이 더 늦은 시각으로 덮어씀'],
    ['src', 'teacher-login-times.ts', "if (roleOf(String(r?.scope_type || 'none'), u, String(r?.name || '')) !== 'teacher') continue;", '', '본사·지사·직원까지 목록에 나옴'],
    ['src', 'teacher-login-list.ts', "  const denied = orgScopeDenyResponse(orgScopeVerdict(scope, actor.role));\n  if (denied) return denied;", '', '지사·대리점 게이트 제거'],
    ['src', 'teacher-login-list.ts', "  if (scope === 'teacher') return", "  if (false && scope === 'teacher') return", '강사 스코프 재확인 무력화(actor 가 staff 로 떨어진 날 강사가 통과)'],
    ['src', 'teacher-login-list.ts', '  if (actor.isTeacher) return', '  if (false && actor.isTeacher) return', '강사 게이트 무력화'],
    ['src', 'teacher-login-times.ts', "import { selectInChunks } from './d1-chunk';\n", "import { selectInChunks } from './d1-chunk';\nimport { readScopeType } from './org-scope-guard';\n", '정본이 관리자 게이트 고리를 다시 끌어옴'],
    ['src', 'teacher-login-times.ts', 'now - lastActive <= ONLINE_MS', 'now - lastActive <= 60 * ONLINE_MS', '«지금 접속 중» 창을 3시간으로'],
    ['src', 'teacher-login-times.ts', "    const d = summarizeLoginDay(dayStart, now, g.logins.get(a.username) || [],", "    const d = summarizeLoginDay(dayStart, now, g.logins.get(users[0]) || [],", '남의 로그인 기록을 붙임'],
    ['src', 'teacher-login-times.ts', 'last_login_before: d.login_count > 0 ? null : before,', 'last_login_before: before,', '오늘 로그인이 있어도 «마지막 로그인» 을 겹쳐 실음'],
    ['src', 'auth-admin.ts', '    const seenPlan = dailySeenPlan(Number(row.last_seen_at), now);', '    const seenPlan = null;', 'checkAdminSession 배선 끊기'],
    ['src', 'auth-admin.ts', '(seenPlan ? noteDailySeen(env.DB, row.username, seenPlan).then(touch) : touch())', '(seenPlan ? (touch(), noteDailySeen(env.DB, row.username, seenPlan)) : touch())', '갱신을 먼저(적기가 잘리면 영영 못 적음)'],
    ['src', 'auth-admin.ts', "url.searchParams.get('scope') === 'teachers'", "url.searchParams.get('scope') !== 'teachers'", '경로 분기 조건 뒤집기'],
    ['src', 'api-teacher.ts', 'loadMyLoginDays(env, actor.username, Date.now())', "loadMyLoginDays(env, url.searchParams.get('username') || actor.username, Date.now())", '주소의 남의 아이디를 받음'],
    ['pub', 'manager.html', "get('/api/admin/login-history?scope=teachers&date=' + encodeURIComponent(date), null)", "get('/api/admin/login-history?scope=teachers&date=' + encodeURIComponent(date), 'logins')", '실패 때 옛 목록을 오늘 것처럼(캐시 키)'],
    ['pub', 'manager.html', "    var head = (!day || k.slice(0, 10) !== day) ? k.slice(5, 10) + ' ' : '';", "    var head = '';", '마지막 로그인 날짜를 빼먹음'],
    ['pub', 'manager.html', "    var p = new Date(Number(ms) + 8 * 3600000).toISOString();", "    var p = new Date(Number(ms) + 9 * 3600000).toISOString();", '필리핀 시간 틀림'],
    ['pub', 'manager.html', "    var off = items.filter(function(it){ return it.state === 'none'; });", "    var off = [];", '기록 없는 강사가 사라짐'],
    ['pub', 'teacher.html', "    if (MY.mylogin) paintMyLogin();\n", '', '언어 전환 때 강사 카드를 안 다시 그림'],
  ];
  let caught = 0;
  for (const [kind, file, from, to, label] of MUT) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tltm-'));
    const srcCopy = path.join(dir, 'src'), pubCopy = path.join(dir, 'public');
    fs.mkdirSync(srcCopy); fs.mkdirSync(pubCopy);
    for (const f of ['teacher-login-times.ts', 'teacher-login-list.ts', 'd1-chunk.ts', 'org-scope-guard.ts', 'forbidden-teacher.ts', 'auth-admin.ts', 'api-teacher.ts']) fs.copyFileSync(path.join(SRC, f), path.join(srcCopy, f));
    for (const f of ['manager.html', 'teacher.html']) fs.copyFileSync(path.join(PUB, f), path.join(pubCopy, f));
    const target = path.join(kind === 'src' ? srcCopy : pubCopy, file);
    const text = fs.readFileSync(target, 'utf8');
    const cnt = text.split(from).length - 1;
    if (cnt !== 1) { ok(`변이 «${label}» — 치환 자리가 정확히 1곳(${cnt}곳)`, false); fs.rmSync(dir, { recursive: true, force: true }); continue; }
    fs.writeFileSync(target, text.replace(from, to));
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { env: { ...process.env, TLT_SRC_DIR: srcCopy, TLT_PUBLIC_DIR: pubCopy, TLT_IN_MUTATION: '1', TLT_QUIET: '1', TLT_SEEDS: '1' }, encoding: 'utf8' });
    const failed = r.status !== 0 && /❌ FAIL/.test(r.stdout || '');
    ok(`변이 «${label}» → 실제 FAIL`, failed, (r.stdout || '').split('\n').filter(l => /❌/.test(l)).slice(0, 2).join(' | ') || ('exit ' + r.status + ' ' + (r.stderr || '').slice(0, 200)));
    if (failed) caught++;
    fs.rmSync(dir, { recursive: true, force: true });
  }
  if (!QUIET) console.log(`  변이 ${MUT.length}종 중 ${caught}종 검출`);
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) { console.log('실패: ' + fails.join(' · ')); process.exit(1); }
