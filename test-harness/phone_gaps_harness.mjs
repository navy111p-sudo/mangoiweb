#!/usr/bin/env node
// 📵 번호 없는 학생 목록 — 발송 정본 일괄판 · 목록 판정 · 경로 게이트 · 화면 순수 함수 (2026-10-28)
//
// 왜 만들었나
//   «수업 30분 전 안내 문자» 가 갈 번호가 없는 학생을 보여 주는 목록(src/phone-gaps.ts)을 새로 만들었다.
//   이 목록이 «틀리면» 두 방향으로 다 나쁘다 — 받을 수 있는 학생을 «못 받는다» 고 하면 직원이 헛수고하고,
//   못 받는 학생을 «받는다» 고 하면 그 학생은 영영 문자를 못 받는다. 그래서 «글자» 가 아니라 «답» 으로 잰다.
//
// 무엇을 돌리나 (전부 «진짜 소스» 를 실행한다)
//   A. notify-contacts.ts loadSendPhones(여러 명) ↔ phonesForStudent(한 명씩) — 진짜 SQLite, 무작위 표 수백 벌.
//      대소문자만 다른 행·공백 낀 아이디·빈 번호 행·9자리·명부 칸 빠짐·원천 통째 실패까지 «같은 답» 인가.
//   B. phone-gaps.ts occursLikeReminder ↔ lesson-reminder.ts 의 «그날 열리는가» 블록(소스에서 오려 냄) — 무작위 수업·날짜.
//   C. buildPhoneGaps 끝에서 끝 — 독립 오라클(B 의 오려 낸 블록 + 한 명씩 phonesForStudent)과 대조.
//   D. api-mango.ts 경로 — 로그인 없음 401 · 강사·지사·대리점 403 (목록을 «만들기 전에» 막는가) · 위치.
//   E. adm-phone-gaps.js 순수 함수 — 빈 칸을 절대 안 보내는가 · 10자리 문턱 · 안내 문구 · 역할 숨김.
//
// 실행: node test-harness/phone_gaps_harness.mjs   (FUZZ_N=1000 FUZZ_SEED=7 로 늘릴 수 있다)
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';
import { d1ExecLikeProd } from './helpers/d1-exec-faithful.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'cloudflare-deploy/src');
const PUB = resolve(ROOT, 'cloudflare-deploy/public');
const rd = (p) => readFileSync(p, 'utf8');
const N = Math.max(1, Number(process.env.FUZZ_N) || 300);
const SEED0 = Number(process.env.FUZZ_SEED) || 20261028;
const SRC_OVERRIDE = (name) => process.env['PG_SRC_' + name.replace(/[^A-Za-z]/g, '_').toUpperCase()];  // 변이시험용 — 사본을 가리킨다

let PASS = 0, FAIL = 0;
const fails = new Map();
function ok(cond, rule, ex) {
  if (cond) { PASS++; return; }
  FAIL++;
  if (!fails.has(rule)) fails.set(rule, { n: 0, ex });
  fails.get(rule).n++;
}
const mark = () => ({ pass: PASS, fail: FAIL });
function report(label, b) { console.log(`  ${FAIL === b.fail ? '✅' : '❌'} ${label} — 검사 ${PASS + FAIL - b.pass - b.fail}건`); }
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const int = (r, a, b) => a + Math.floor(r() * (b - a + 1));
const digitsN = (r, n) => Array.from({ length: n }, () => int(r, 0, 9)).join('');
// 함수 «몸통» 의 여는 중괄호 — 인자 목록·반환 타입 안의 { } 는 건너뛴다(TS 의 `opts: { dry?: boolean }` 함정)
function bodyOpen(src, startIdx) {
  let paren = 0, angle = 0;
  for (let i = startIdx; i < src.length; i++) {
    const c = src[i];
    if (c === '(') paren++; else if (c === ')') paren--;
    else if (c === '<') angle++; else if (c === '>' && src[i - 1] !== '=') angle--;
    else if (c === '{' && paren === 0 && angle <= 0) return i;
    else if (c === '{') {   // 인자·타입 안의 객체 타입 — 짝까지 건너뛴다
      let d = 0;
      for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (d === 0) break; } }
    }
  }
  return -1;
}
function braceBody(src, startIdx, fn = false) {
  const open = fn ? bodyOpen(src, startIdx) : src.indexOf('{', startIdx);
  if (startIdx < 0 || open < 0) return '';
  let d = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (d === 0) return src.slice(startIdx, i + 1); }
  }
  return '';
}
const importData = (code) => import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const wireImports = (code) => code.replace(/^import\s*\{([^}]*)\}\s*from\s*'[^']+';?/gm, (m, names) =>
  names.split(',').map(n => n.trim()).filter(Boolean).map(n => `const ${n} = globalThis.__PG.${n};`).join('\n'));
const srcOf = (name) => rd(SRC_OVERRIDE(name) || resolve(SRC, name));

/* ── 진짜 정본을 불러온다 ─────────────────────────────────────────────────── */
globalThis.__PG = { findTeacherContact: async () => null };
const CH = await importData(stripTypeScriptTypes(srcOf('d1-chunk.ts')));
globalThis.__PG.selectInChunks = CH.selectInChunks;
const SO = await importData(wireImports(stripTypeScriptTypes(srcOf('student-override.ts'))));
Object.assign(globalThis.__PG, { getOverridePhones: SO.getOverridePhones, loadOverridePhones: SO.loadOverridePhones, ensureStudentOverrideTable: SO.ensureStudentOverrideTable });
const NC = await importData(wireImports(stripTypeScriptTypes(srcOf('notify-contacts.ts'))));
const CSD = await importData(stripTypeScriptTypes(srcOf('class-start-date.ts')));
const CP = await importData(stripTypeScriptTypes(srcOf('class-postponed.ts')));
const HC = await importData(stripTypeScriptTypes(srcOf('holiday-closure.ts')));
// getSolapiMode 는 solapi-client.ts 에서 «그 함수만» 오려 낸다(그 파일 전체는 이 검사에 필요 없는 것이 많다)
const solSrc = srcOf('solapi-client.ts');
const gsmBody = braceBody(solSrc, solSrc.indexOf('export function getSolapiMode'));
const GSM = gsmBody ? await importData(stripTypeScriptTypes(gsmBody)) : {};
Object.assign(globalThis.__PG, {
  ensureStartsOnColumn: CSD.ensureStartsOnColumn, startsOnSel: CSD.startsOnSel, recurStartedOn: CSD.recurStartedOn,
  isPostponedOccurrence: CP.isPostponedOccurrence, loadHolidayClosure: HC.loadHolidayClosure, isHolidayClosedFor: HC.isHolidayClosedFor,
  loadSendPhones: NC.loadSendPhones, getSolapiMode: GSM.getSolapiMode,
});
const PG = await importData(wireImports(stripTypeScriptTypes(srcOf('phone-gaps.ts'))));
console.log(`🎲 seed ${SEED0} · 무작위 ${N}벌씩`);
const _warn = console.warn; console.warn = () => {};
const loaded = !!(NC.loadSendPhones && NC.phonesForStudent && PG.buildPhoneGaps && PG.occursLikeReminder && GSM.getSolapiMode);
ok(loaded, '전제: 정본(loadSendPhones·phonesForStudent·buildPhoneGaps·occursLikeReminder·getSolapiMode)을 불러왔다');
if (!loaded) { console.warn = _warn; console.log('❌ 정본을 못 불러왔다'); process.exit(1); }

/* ── 공용: 진짜 SQLite → D1 모양 + 원천별 실패 주입 ──────────────────────── */
const OV_COLS = 'user_id TEXT PRIMARY KEY, korean_name TEXT, hidden INTEGER NOT NULL DEFAULT 0, memo TEXT, created_at INTEGER NOT NULL, updated_at INTEGER, parent_phone TEXT, student_phone TEXT, phone_by TEXT, phone_at INTEGER, franchise TEXT, shop_name TEXT, org_by TEXT, org_at INTEGER, hidden_by TEXT, hidden_at INTEGER, hidden_reason TEXT';
function d1(raw, fail, log) {
  const kind = (sql) => /student_erp_override/.test(sql) ? 'ov' : (/FROM students_erp/.test(sql) ? 'erp'
    : (/student_retention/.test(sql) ? 'ret' : (/FROM class_schedules/.test(sql) ? 'cs' : null)));
  const cnt = { ov: 0, erp: 0, ret: 0, cs: 0 };
  const hit = (sql) => {
    const k = kind(sql);
    if (!k) return;
    log && log.push({ k, sql });
    const i = cnt[k]++;
    const f = fail && fail[k];
    if (f === 'all' || (f === 'chunk1' && i >= 1)) throw new Error('injected ' + k + ' #' + i);
  };
  const mk = (sql, args) => ({
    bind: (...a) => mk(sql, a),
    all: async () => { hit(sql); return { results: raw.prepare(sql).all(...(args || [])) }; },
    first: async () => { hit(sql); return raw.prepare(sql).get(...(args || [])) ?? null; },
    run: async () => { hit(sql); return raw.prepare(sql).run(...(args || [])); },
  });
  return { prepare: (sql) => mk(sql, []), exec: d1ExecLikeProd(raw) };
}
function genPhone(r) {
  return pick(r, [
    () => '010' + digitsN(r, 8), () => '010-' + digitsN(r, 4) + '-' + digitsN(r, 4), () => ' 010 ' + digitsN(r, 4) + ' ' + digitsN(r, 4),
    () => '+63 9' + digitsN(r, 2) + ' ' + digitsN(r, 3) + ' ' + digitsN(r, 4), () => digitsN(r, 9), () => digitsN(r, int(r, 1, 8)),
    () => 'none', () => '', () => '   ', () => null, () => null, () => null,
  ])();
}
const variants = (r, u) => pick(r, [u, u, u, u.toUpperCase(), u[0].toUpperCase() + u.slice(1), u + ' ', ' ' + u]);

/* ── A. loadSendPhones ↔ phonesForStudent ─────────────────────────────────── */
console.log('\n[ A. 발송 번호 — 여러 명 한 번에 ↔ 한 명씩 ]');
{
  const b = mark();
  let worlds = 0, compared = 0;
  for (let k = 0; k < N; k++) {
    const r = rng(SEED0 + k);
    const big = r() < 0.12;
    const base = Array.from({ length: big ? int(r, 95, 240) : int(r, 1, 25) }, (_, i) => (pick(r, ['kim', 'lee', 'park', 'jeong', 'u']) + k + '_' + i));
    const erpSchema = pick(r, ['full', 'full', 'full', 'full', 'noStudentPhone', 'noPhone', 'missing']);
    const fault = pick(r, ['none', 'none', 'none', 'none', 'none', 'erpAll', 'ovAll']);
    const raw = new DatabaseSync(':memory:');
    raw.exec(`CREATE TABLE student_erp_override (${OV_COLS})`);
    const cols = ['user_id TEXT PRIMARY KEY'];
    if (erpSchema !== 'noStudentPhone') cols.push('student_phone TEXT');
    if (erpSchema !== 'noPhone') cols.push('phone TEXT');
    cols.push('parent_phone TEXT');
    if (erpSchema !== 'missing') raw.exec(`CREATE TABLE students_erp (${cols.join(', ')})`);
    const ovIns = raw.prepare('INSERT OR IGNORE INTO student_erp_override (user_id, parent_phone, student_phone, created_at) VALUES (?,?,?,1)');
    for (const u of base) {
      // 같은 사람의 «대소문자만 다른» 행을 한두 벌 섞는다 — 정확일치 우선·BINARY 최소 고르기를 잰다
      for (const id of new Set([u, ...(r() < 0.25 ? [variants(r, u), variants(r, u)] : [])])) {
        if (r() < 0.3) ovIns.run(id, genPhone(r), genPhone(r));
        if (erpSchema !== 'missing' && r() < 0.75) {
          const names = ['user_id'], vals = [id];
          if (erpSchema !== 'noStudentPhone') { names.push('student_phone'); vals.push(genPhone(r)); }
          if (erpSchema !== 'noPhone') { names.push('phone'); vals.push(genPhone(r)); }
          names.push('parent_phone'); vals.push(genPhone(r));
          raw.prepare(`INSERT OR IGNORE INTO students_erp (${names.join(',')}) VALUES (${names.map(() => '?').join(',')})`).run(...vals);
        }
      }
    }
    const ask = Array.from({ length: big ? base.length : int(r, 0, 30) }, (_, i) => big ? base[i] : pick(r, [variants(r, pick(r, base)), pick(r, base), '', null, undefined, 'nobody' + k]));
    const fail = fault === 'erpAll' ? { erp: 'all' } : fault === 'ovAll' ? { ov: 'all' } : {};
    const env = { DB: d1(raw, fail) };
    let got;
    try { got = await NC.loadSendPhones(env, ask); } catch (e) { ok(false, 'A 일괄 함수가 던지지 않는다', e && e.message); continue; }
    worlds++;
    const want = Array.from(new Set(ask.map(u => String(u || '').trim()).filter(Boolean)));
    ok(want.every(u => got.phones.has(u)) && got.phones.size === want.length, 'A 넘긴 계정은 «빈 값이어도» 전부 맵에 있다', { want: want.length, size: got.phones.size });
    const expectComplete = fault === 'none' && erpSchema !== 'missing' && erpSchema !== 'noStudentPhone' && erpSchema !== 'noPhone';
    if (want.length) ok(got.complete === expectComplete, 'A complete = «모든 원천에 다 물어봤나» 와 같다', { fault, erpSchema, got: got.complete });
    for (const u of want) {
      const one = await NC.phonesForStudent(env, u);
      const g = got.phones.get(u) || {};
      compared++;
      ok(one.student === g.student && one.parent === g.parent, 'A 여러 명 = 한 명씩(학생·학부모 번호가 같다)', { u, fault, erpSchema, one, g });
    }
    // 성능 — 모두 정확일치로 찾으면 «전체를 훑는» 대소문자 무시 질문을 명부에 안 한다
    if (fault === 'none' && erpSchema === 'full' && want.length) {
      const exactAll = want.every(u => raw.prepare('SELECT 1 FROM students_erp WHERE user_id = ?').get(u));
      if (exactAll) {
        const log = []; await NC.loadSendPhones({ DB: d1(raw, {}, log) }, ask);
        ok(!log.some(x => x.k === 'erp' && /COLLATE NOCASE/.test(x.sql)), 'A 모두 정확일치면 명부를 대소문자 무시로 훑지 않는다(인덱스를 못 타는 질문)');
      }
    }
  }
  // 고정 반례 — 정확일치 행이 «빈 칸» 이어도 이긴다(대소문자만 다른 행에 번호가 있어도)
  {
    const raw = new DatabaseSync(':memory:');
    raw.exec(`CREATE TABLE student_erp_override (${OV_COLS})`);
    raw.exec('CREATE TABLE students_erp (user_id TEXT PRIMARY KEY, student_phone TEXT, phone TEXT, parent_phone TEXT)');
    raw.prepare('INSERT INTO students_erp VALUES (?,?,?,?)').run('Kim', null, null, null);
    raw.prepare('INSERT INTO students_erp VALUES (?,?,?,?)').run('kim', '01011112222', null, '01033334444');
    raw.prepare('INSERT INTO students_erp VALUES (?,?,?,?)').run('PARK', null, null, '01055556666');
    raw.prepare('INSERT INTO students_erp VALUES (?,?,?,?)').run('park', null, null, '01077778888');
    const env = { DB: d1(raw, {}) };
    const g = await NC.loadSendPhones(env, ['Kim', 'Park', 'lee']);
    ok(g.phones.get('Kim').parent === '' && g.phones.get('Kim').student === '', 'A 고정: 정확일치 «Kim»(빈 칸)이 대소문자만 다른 «kim» 을 이긴다');
    ok(g.phones.get('Park').parent === '01055556666', 'A 고정: 정확일치가 없으면 BINARY 로 가장 앞(«PARK» < «park»)을 고른다');
    ok(g.phones.get('lee').parent === '' && g.complete === true, 'A 고정: 없는 계정은 빈 값 · 다 물어봤으면 complete');
    const e2 = await NC.loadSendPhones({}, ['Kim']);
    ok(e2.complete === false && e2.phones.get('Kim').parent === '', 'A 고정: DB 가 없으면 «못 물어봤다»(complete=false)');
    const e3 = await NC.loadSendPhones({ DB: d1(raw, {}) }, []);
    ok(e3.complete === true && e3.phones.size === 0, 'A 고정: 아무도 안 넘기면 빈 맵 · complete');
  }
  console.log(`  · 무작위 ${worlds}벌 · 한 명씩 대조 ${compared}건`);
  report('여러 명 = 한 명씩', b);
}

/* ── B. occursLikeReminder ↔ 리마인더 블록(소스에서 오려 냄) ─────────────── */
console.log('\n[ B. «그날 열리는가» — 목록 ↔ 수업 30분 전 문자 ]');
const lrSrc = rd(process.env.PG_SRC_LESSON_REMINDER_TS || resolve(SRC, 'lesson-reminder.ts'));
const sweepBody = braceBody(lrSrc, lrSrc.indexOf('export async function runLessonReminderSweep'), true);
const bStart = sweepBody.indexOf('let occurs = false;');
const bEnd = sweepBody.indexOf('if (isHolidayClosedFor(', bStart);
const block = (bStart >= 0 && bEnd > bStart) ? sweepBody.slice(bStart, bEnd) : '';
ok(!!block && /continue;/.test(block), '전제: 리마인더의 «그날 열리는가» 블록을 오려 냈다(못 오리면 아래 대조가 아무것도 안 잰다)');
let reminderOccurs = null;
try {
  const body = block.replace(/\bseen\.add\(s\.id\);/g, '').replace(/\bcontinue;/g, 'return false;') + '\nreturn true;';
  reminderOccurs = new Function('s', 'todayStr', 'kDow', 'recurStartedOn', 'isPostponedOccurrence', body);
} catch (e) { ok(false, '전제: 오려 낸 블록이 함수로 만들어진다', e && e.message); }
function genRow(r, i, ymdPool) {
  const dated = r() < 0.7;
  return {
    id: i, user_id: 'u' + int(r, 0, 9),
    scheduled_date: dated ? pick(r, ymdPool) : pick(r, [null, '', null]),
    day_of_week: dated ? pick(r, [null, '', '3']) : pick(r, ['0', '1', '2', '3', '4', '5', '6', '3', 'Wed', '', null, '7', ' 2']),
    status: pick(r, ['active', 'active', 'active', 'postponed', 'completed']),
    starts_on: r() < 0.3 ? pick(r, ymdPool) : null,
    skip_dates: r() < 0.25 ? [pick(r, ymdPool), pick(r, ymdPool)].join(',') : null,
    start_time: pick(r, ['16:00', '09:30', '', null, '7:05', 'ab:cd', '23:59']),
    teacher_id: pick(r, ['7', '29', '22', null, '']),
  };
}
{
  const b = mark();
  let n = 0;
  if (reminderOccurs) {
    for (let k = 0; k < N; k++) {
      const r = rng(SEED0 * 3 + k);
      const days = PG.kstDays(Date.UTC(2026, int(r, 0, 11), int(r, 1, 28), int(r, 0, 23)), 14);
      const ymdPool = days.map(d => d.ymd).concat(['2025-12-31', '2027-01-01']);
      for (let i = 0; i < 20; i++) {
        const s = genRow(r, i, ymdPool);
        for (const d of days) {
          n++;
          const want = reminderOccurs(s, d.ymd, d.dow, CSD.recurStartedOn, CP.isPostponedOccurrence);
          ok(PG.occursLikeReminder(s, d.ymd, d.dow) === want, 'B 목록의 «그날 열리는가» = 리마인더 블록', { s, d, want });
        }
      }
    }
  }
  // kstDays — KST 자정 경계·요일
  const kd = PG.kstDays(Date.UTC(2026, 9, 28, 14, 59), 3);   // 10/28 23:59 KST
  ok(kd[0].ymd === '2026-10-28' && kd[0].dow === 3 && kd[2].ymd === '2026-10-30', 'B kstDays: KST 23:59 은 그날, 요일 수=3', kd);
  const kd2 = PG.kstDays(Date.UTC(2026, 9, 28, 15, 0), 1);   // 10/29 00:00 KST
  ok(kd2[0].ymd === '2026-10-29' && kd2[0].dow === 4, 'B kstDays: KST 자정이 지나면 다음 날', kd2);
  console.log(`  · 수업×날짜 대조 ${n}건`);
  report('목록 = 리마인더', b);
}

/* ── C. buildPhoneGaps 끝에서 끝 ──────────────────────────────────────────── */
console.log('\n[ C. 목록 — 독립 오라클과 대조 ]');
function buildWorld(r, k) {
  const raw = new DatabaseSync(':memory:');
  raw.exec('CREATE TABLE class_schedules (id INTEGER PRIMARY KEY, user_id TEXT, student_name TEXT, day_of_week TEXT, scheduled_date TEXT, start_time TEXT, status TEXT, teacher_id TEXT, created_at INTEGER)');
  raw.exec(`CREATE TABLE student_erp_override (${OV_COLS})`);
  raw.exec('CREATE TABLE students_erp (user_id TEXT PRIMARY KEY, student_phone TEXT, phone TEXT, parent_phone TEXT)');
  raw.exec('CREATE TABLE student_retention (user_id TEXT PRIMARY KEY, phone TEXT)');
  raw.exec('CREATE TABLE holidays (country TEXT, date TEXT, name TEXT)');
  return raw;
}
function oracleGaps(raw, env, now, days, holidays) {
  // 정본을 베끼지 않는다 — 리마인더 블록(B)으로 «열리는가», 한 명씩 phonesForStudent 로 «번호가 있나» 를 잰다
  return (async () => {
    const dl = PG.kstDays(now, days);
    const rows = raw.prepare("SELECT * FROM class_schedules WHERE status != 'cancelled'").all();
    const by = new Map();
    for (const s of rows) {
      const uid = String(s.user_id || '').trim();
      if (!uid || ['lms', 'type_seed'].includes(uid.toLowerCase())) continue;
      if (!Number.isFinite(Number(String(s.start_time || '00:00').split(':')[0]))) continue;
      for (const d of dl) {
        if (!reminderOccurs(s, d.ymd, d.dow, CSD.recurStartedOn, CP.isPostponedOccurrence)) continue;
        if (holidays.has(d.ymd) && String(s.teacher_id || '') !== '29') continue;
        const a = by.get(uid) || { uid, classes: 0, keys: [], name: '' };
        a.classes++; a.keys.push(d.ymd + ' ' + String(s.start_time || ''));
        if (!a.name && s.student_name) a.name = s.student_name;
        by.set(uid, a);
      }
    }
    const gaps = [];
    let reachable = 0;
    for (const a of by.values()) {
      const p = await NC.phonesForStudent(env, a.uid);
      const L = (x) => String(x || '').replace(/[^0-9]/g, '').length;
      if (L(p.parent) >= 10 || L(p.student) >= 10) { reachable++; continue; }
      a.keys.sort();
      gaps.push({ uid: a.uid, classes: a.classes, next: a.keys[0], short: Math.max(L(p.parent), L(p.student)) });
    }
    return { students: by.size, reachable, gaps };
  })();
}
{
  const b = mark();
  let worlds = 0, gapsSeen = 0, shortSeen = 0, hintSeen = 0;
  for (let k = 0; k < N; k++) {
    HC.clearHolidayClosureCache();
    const r = rng(SEED0 * 7 + k);
    const now = Date.UTC(2026, int(r, 0, 11), int(r, 1, 28), int(r, 0, 23), int(r, 0, 59));
    const days = pick(r, [7, 7, 14, 3, 1]);
    const raw = buildWorld(r, k);
    const pool = PG.kstDays(now, 16).map(d => d.ymd).concat(['2020-01-01']);
    const uids = Array.from({ length: int(r, 0, 30) }, (_, i) => 's' + k + '_' + i).concat(r() < 0.3 ? ['lms', 'TYPE_SEED'] : []);
    const ins = raw.prepare('INSERT INTO class_schedules (id,user_id,student_name,day_of_week,scheduled_date,start_time,status,teacher_id,created_at) VALUES (?,?,?,?,?,?,?,?,1)');
    let id = 1;
    for (const u of uids) {
      for (let j = int(r, 0, 4); j > 0; j--) {
        const s = genRow(r, id, pool);
        ins.run(id++, pick(r, [u, u, u, ' ' + u, '']), r() < 0.7 ? ('학생' + u) : null, s.day_of_week == null ? null : String(s.day_of_week),
          s.scheduled_date, s.start_time, pick(r, ['active', 'active', 'active', 'cancelled', 'postponed']), s.teacher_id);
      }
      const p1 = r() < 0.5 ? genPhone(r) : null, p2 = r() < 0.5 ? genPhone(r) : null;
      if (r() < 0.85) raw.prepare('INSERT OR IGNORE INTO students_erp VALUES (?,?,?,?)').run(u, p1, r() < 0.2 ? genPhone(r) : null, p2);
      if (r() < 0.12) raw.prepare('INSERT OR IGNORE INTO student_erp_override (user_id, parent_phone, student_phone, created_at) VALUES (?,?,?,1)').run(u, genPhone(r), genPhone(r));
      if (r() < 0.3) raw.prepare('INSERT OR IGNORE INTO student_retention VALUES (?,?)').run(u, pick(r, ['010-' + digitsN(r, 4) + '-' + digitsN(r, 4), '123', null]));
    }
    const hol = new Set(); if (r() < 0.3) { const h = pick(r, pool); hol.add(h); raw.prepare("INSERT INTO holidays VALUES ('KR',?,?)").run(h, '공휴일'); }
    const fault = pick(r, ['none', 'none', 'none', 'none', 'erp', 'ret']);
    const env = { DB: d1(raw, fault === 'erp' ? { erp: 'all' } : fault === 'ret' ? { ret: 'all' } : {}), SOLAPI_API_KEY: 'k', SOLAPI_API_SECRET: 's' };
    let res;
    try { res = await PG.buildPhoneGaps(env, { days, now }); } catch (e) { ok(false, 'C buildPhoneGaps 가 던지지 않는다', e && e.message); continue; }
    worlds++;
    const o = await oracleGaps(raw, env, now, days, hol);
    ok(res.ok === true, 'C 정상이면 ok', res.error);
    ok(res.days === days && res.from === PG.kstDays(now, days)[0].ymd && res.to === PG.kstDays(now, days)[days - 1].ymd, 'C 기간(from·to·days)이 KST 날짜와 같다');
    ok(res.students === o.students, 'C 수업이 있는 학생 수가 오라클과 같다', { got: res.students, want: o.students });
    ok(res.reachable === o.reachable, 'C 문자가 갈 학생 수가 오라클과 같다', { got: res.reachable, want: o.reachable });
    ok(res.reachable + res.gaps.length === res.students, 'C 문자 감 + 번호 없음 = 수업 있는 학생');
    const og = new Map(o.gaps.map(g => [g.uid, g]));
    ok(res.gaps.length === o.gaps.length && res.gaps.every(g => og.has(g.uid)), 'C «번호 없는 학생» 이 오라클과 같다', { got: res.gaps.map(g => g.uid), want: o.gaps.map(g => g.uid) });
    for (const g of res.gaps) {
      gapsSeen++;
      const w = og.get(g.uid); if (!w) continue;
      ok(g.classes === w.classes, 'C 학생마다 «이번 기간 수업 수» 가 같다', { g, w });
      ok((g.next_date + ' ' + g.next_time) === w.next, 'C 학생마다 «가장 가까운 수업» 이 같다', { g, w });
      ok(g.status === (w.short ? 'short' : 'none') && g.short_len === w.short, 'C 짧은 번호(10자리 미만)는 «short» 와 그 자릿수', { g, w });
      if (g.status === 'short') shortSeen++;
      if (g.hint_phone) hintSeen++;
      ok(!/^\s|\s$/.test(g.uid) && !['lms', 'type_seed'].includes(g.uid.toLowerCase()), 'C 자리표시·공백 아이디는 목록에 없다', g);
    }
    const keys = res.gaps.map(g => g.next_date + ' ' + g.next_time);
    ok(keys.every((x, i) => i === 0 || keys[i - 1] <= x), 'C 가장 가까운 수업 순서로 정렬');
    ok(res.complete === (fault !== 'erp' || o.students === 0), 'C 명부 조회가 실패하면 complete=false(«번호 없음» 으로 단정하지 않는다)', { fault, complete: res.complete });
    ok(res.hint_complete === (fault !== 'ret' || res.gaps.length === 0), 'C 참고 번호 조회가 실패하면 hint_complete=false', { fault });
    if (fault === 'none') {
      const retMap = new Map(raw.prepare('SELECT user_id, phone FROM student_retention').all().map(x => [x.user_id, x.phone]));
      for (const g of res.gaps) {
        const v = retMap.get(g.uid); const want = (v && String(v).replace(/[^0-9]/g, '').length >= 9) ? String(v).trim() : '';
        ok(g.hint_phone === want, 'C 참고 번호 = 이탈위험 표의 그 학생 번호(9자리 미만은 안 보여 줌)', { g, v });
      }
    }
  }
  // 고정: days 범위, 수업 표 실패, 문자 모드·스위치
  {
    const raw = buildWorld(rng(1), 0);
    raw.prepare("INSERT INTO class_schedules (id,user_id,student_name,day_of_week,scheduled_date,start_time,status,teacher_id,created_at) VALUES (1,'a','에이',NULL,'2026-10-29','16:00','active','7',1)").run();
    const now = Date.UTC(2026, 9, 28, 3);
    const env = { DB: d1(raw, {}), SOLAPI_API_KEY: 'k', SOLAPI_API_SECRET: 's', SESSION_STATE: { get: async () => 'off' } };
    for (const [inp, want] of [[0, 7], [NaN, 7], [-3, 7], [undefined, 7], [99, 14], [3, 3], [1, 1], [2.9, 2]]) {
      const r1 = await PG.buildPhoneGaps(env, { days: inp, now });
      ok(r1.days === want, 'C 기간은 1~14 일, 모르면 7 일', { inp, got: r1.days });
    }
    const r2 = await PG.buildPhoneGaps(env, { days: 7, now });
    ok(r2.gaps.length === 1 && r2.gaps[0].uid === 'a' && r2.gaps[0].name === '에이' && r2.gaps[0].status === 'none', 'C 고정: 번호 없는 학생 한 명', r2.gaps);
    ok(r2.sms_mode === 'real' && r2.reminder_enabled === false, 'C 고정: 문자 모드·리마인더 스위치(off)를 함께 알려 준다', r2);
    const r3 = await PG.buildPhoneGaps({ DB: d1(raw, {}), SOLAPI_TEST_MODE: 'true', SOLAPI_API_KEY: 'k', SOLAPI_API_SECRET: 's' }, { days: 7, now });
    ok(r3.sms_mode === 'mock' && r3.reminder_enabled === true, 'C 고정: 시험 모드면 mock · 스위치가 없으면 켜짐');
    const r4 = await PG.buildPhoneGaps({ DB: d1(raw, { cs: 'all' }) }, { days: 7, now });
    ok(r4.ok === false && r4.error === 'class_schedules_unavailable', 'C 고정: 수업 표를 못 읽으면 ok=false(빈 목록으로 «다 됐다» 고 말하지 않는다)', r4);
    const r5 = await PG.buildPhoneGaps({}, { days: 7, now });
    ok(r5.ok === false, 'C 고정: DB 가 없으면 ok=false');
    raw.prepare("INSERT INTO student_erp_override (user_id, parent_phone, created_at) VALUES ('a','010-1234-5678',1)").run();
    const r6 = await PG.buildPhoneGaps(env, { days: 7, now });
    ok(r6.gaps.length === 0 && r6.reachable === 1, 'C 고정: 받아 둔 번호를 넣으면 그 학생이 목록에서 빠진다(저장 뒤 다시 불러 확인하는 근거)', r6);
  }
  console.log(`  · 무작위 ${worlds}벌 · 목록 줄 ${gapsSeen}건(짧은 번호 ${shortSeen} · 참고 번호 ${hintSeen})`);
  ok(gapsSeen > 50 && shortSeen > 0 && hintSeen > 0, '전제: 무작위 표가 «번호 없음·짧은 번호·참고 번호» 를 실제로 만들었다', { gapsSeen, shortSeen, hintSeen });
  report('목록 = 오라클', b);
}

/* ── D. api-mango.ts 경로 게이트 ──────────────────────────────────────────── */
console.log('\n[ D. 경로 — 누가 볼 수 있나 ]');
{
  const b = mark();
  const am = rd(process.env.PG_SRC_API_MANGO_TS || resolve(SRC, 'api-mango.ts'));
  const at = am.indexOf("if (method === 'GET' && path === '/api/admin/student/phone-gaps')");
  const generic = am.indexOf("/^\\/api\\/admin\\/student\\/[^\\/]+$/.test(path) && method === 'GET'");
  ok(at > 0, '전제: 경로를 찾았다');
  ok(at > 0 && generic > 0 && at < generic, 'D 이 경로가 «학생 한 명» GET 정규식보다 앞이다(뒤면 uid=phone-gaps 로 잡힌다)', { at, generic });
  const blk = braceBody(am, at);
  ok(/import \{ buildPhoneGaps \} from '\.\/phone-gaps'/.test(am), 'D buildPhoneGaps 를 phone-gaps.ts 에서 가져온다');
  const ftSrc = srcOf('forbidden-teacher.ts');
  const FT = await importData(stripTypeScriptTypes(ftSrc));
  const aa = srcOf('auth-admin.ts');
  const isOrg = new Function('return ' + stripTypeScriptTypes(braceBody(aa, aa.indexOf('export function isOrgScopedRole')).replace(/^export /, '')).replace(/^function isOrgScopedRole/, 'function'))();
  let fn = null;
  try {
    // 경로 블록에 `return` 이 있어 그대로는 모듈로 못 벗긴다 — 함수로 감싼 «뒤» 에 타입을 벗긴다
    const routeJs = stripTypeScriptTypes('async function __route(method, path, url, request, env) {' + blk + '\n return null; }');
    fn = new Function('getAdminActor', 'forbiddenTeacherBody', 'isOrgScopedRole', 'buildPhoneGaps', 'json',
      routeJs + '\nreturn __route;')
      (async (req) => req.__actor, FT.forbiddenTeacherBody, isOrg, async (env, o) => { env.__called = o; return env.__result || { ok: true, gaps: [] }; },
        (body, status = 200) => ({ body, status }));
  } catch (e) { ok(false, 'D 전제: 경로 블록을 실행할 수 있다', e && e.message); }
  if (fn) {
    const run = async (actor, q = '', result) => {
      const env = { __result: result };
      const out = await fn('GET', '/api/admin/student/phone-gaps', new URL('https://x/api/admin/student/phone-gaps' + q), { __actor: actor }, env);
      return { out, called: env.__called };
    };
    let x = await run({ ok: false });
    ok(x.out && x.out.status === 401 && !x.called, 'D 로그인이 없으면 401 이고 목록을 만들지 않는다', x);
    x = await run({ ok: true, isTeacher: true, username: 'mangoi_018', role: 'teacher' });
    ok(x.out && x.out.status === 403 && x.out.body.error === 'forbidden_teacher' && !x.called, 'D 강사는 403(forbidden_teacher)이고 목록을 만들지 않는다', x.out);
    for (const role of ['branch', 'agency', 'franchise']) {
      x = await run({ ok: true, isTeacher: false, role });
      ok(x.out && x.out.status === 403 && x.out.body.error === 'forbidden_scope' && !x.called, 'D 지사·대리점·지사본사는 403 이고 목록을 만들지 않는다', { role, out: x.out });
    }
    for (const role of ['hq', 'staff', '']) {
      x = await run({ ok: true, isTeacher: false, role }, '?days=14');
      ok(x.out && x.out.status === 200 && x.called && x.called.days === 14, 'D 본사·내부직원은 200 이고 기간(days)을 그대로 넘긴다', { role, out: x.out, called: x.called });
    }
    x = await run({ ok: true, isTeacher: false, role: 'hq' }, '', { ok: false, error: 'class_schedules_unavailable' });
    ok(x.out && x.out.status === 503, 'D 목록을 못 만들면 503(«번호 없는 학생 0명» 으로 보이지 않게)', x.out);
  }
  report('경로 게이트', b);
}

/* ── E. 화면 순수 함수 ───────────────────────────────────────────────────── */
console.log('\n[ E. 화면 — 무엇을 보내고 무엇을 말하나 ]');
{
  const b = mark();
  const js = rd(process.env.PG_SRC_ADM_JS || resolve(PUB, 'js/adm-phone-gaps.js'));
  const store = {};
  const listeners = [];
  const ctx = vm.createContext({
    window: {}, document: { readyState: 'complete', getElementById: () => null, addEventListener: (t, f) => listeners.push(t) },
    localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } },
    setTimeout, clearTimeout, console,
  });
  ctx.window.addEventListener = (t) => listeners.push('w:' + t);
  let P = null;
  try { vm.runInContext(js, ctx); P = ctx.window.__pg; } catch (e) { ok(false, 'E 전제: 화면 스크립트가 실행된다', e && e.message); }
  ok(!!(P && P.buildBody && P.checkPhone && P.saveMsg && P.hideFor && P.summaryLines), 'E 전제: 순수 함수를 내보냈다');
  if (P) {
    for (const [v, want] of [['', ''], ['   ', ''], [null, ''], ['010-1234-5678', 'ok'], ['01012345678', 'ok'], [' 010 1234 5678 ', 'ok'],
      ['+63 917 123 4567', 'ok'], ['010-123-456', 'short'], ['123456789', 'short'], ['abc', 'bad'], ['010-1234-567a', 'bad'], ['010.1234.5678', 'ok']]) {
      ok(P.checkPhone(v) === want, 'E 입력 판정(빈칸·10자리 문턱·글자 섞임)', { v, got: P.checkPhone(v), want });
    }
    ok(P.MIN_DIGITS === PG.SMS_MIN_DIGITS, 'E 화면의 문턱 = 서버 SMS_MIN_DIGITS', { ui: P.MIN_DIGITS, srv: PG.SMS_MIN_DIGITS });
    // 🔴 빈 칸은 «절대» 안 보낸다 — 그 PATCH 는 빈 문자열을 «지우겠다» 로 읽는다(남은 번호가 지워진다)
    const r = rng(SEED0 * 11);
    const vals = ['', '  ', '010-1234-5678', '0101234', 'abc', null, '01098765432'];
    let bodies = 0;
    for (let i = 0; i < N; i++) {
      const pv = pick(r, vals), sv = pick(r, vals);
      const body = P.buildBody(pv, sv);
      const okP = P.checkPhone(pv) === 'ok', okS = P.checkPhone(sv) === 'ok';
      if (!okP && !okS) { ok(body === null, 'E 둘 다 안 맞으면 보내지 않는다(null)', { pv, sv, body }); continue; }
      bodies++;
      ok(body && Object.values(body).every(x => typeof x === 'string' && x.trim() !== ''), 'E 보내는 값은 전부 «채운» 번호다(빈 문자열 0건)', { pv, sv, body });
      ok(('parent_phone' in body) === okP && ('student_phone' in body) === okS, 'E 맞는 칸만 싣는다(안 맞는 칸은 키 자체가 없다)', { pv, sv, body });
      ok(Object.keys(body).every(k => k === 'parent_phone' || k === 'student_phone'), 'E 번호 두 칸 말고는 아무것도 안 보낸다', body);
    }
    ok(bodies > 10, '전제: 보내는 경우를 실제로 만들었다', bodies);
    // 저장 응답
    ok(P.saveMsg(200, { ok: true, phone_kept: true }).ok === true, 'E 저장 성공 → 다시 불러 확인');
    ok(P.saveMsg(200, { ok: true, phone_kept: false }).ok === false, 'E «야간 동기화가 못 덮는 칸» 에 못 적었으면 성공이라 하지 않는다');
    ok(P.saveMsg(403, { ok: false, error: 'forbidden_teacher', who_line: '지금 로그인: x' }).ok === false, 'E 403 은 실패');
    ok(P.saveMsg(401, null).ok === false && /로그인/.test(P.saveMsg(401, null).text), 'E 401 은 «다시 로그인»');
    ok(P.saveMsg(200, null).ok === false, 'E 본문이 없으면(=JSON 아님) 실패로 본다');
    ok(P.saveMsg(200, { error: 'Not Found' }).ok === false, 'E «ok 가 없는» 404 본문은 성공이 아니다(ok === true 일 때만 성공)');
    // 역할 숨김 — 서버 403 과 짝
    for (const role of ['teacher', 'branch', 'agency', 'franchise']) ok(P.hideFor(role) === true, 'E 강사·지사·대리점에게는 숨긴다', role);
    for (const role of ['hq', 'staff', '', undefined, null]) ok(P.hideFor(role) === false, 'E 본사·내부직원·«모름» 에게는 보인다(서버가 최종 판정)', role);
    // 안내 문구 — 사실만, 짝으로
    const base = { days: 7, from: '2026-10-28', to: '2026-11-03', students: 252, reachable: 12, gaps: new Array(240), complete: true, sms_mode: 'real', reminder_enabled: true, hint_complete: true };
    const l0 = P.summaryLines(base);
    ok(l0.length === 1 && /252/.test(l0[0]) && /12/.test(l0[0]) && /240/.test(l0[0]), 'E 정상일 땐 숫자 한 줄만(경고 없음)', l0);
    ok(P.summaryLines({ ...base, complete: false }).some(t => /일부/.test(t)), 'E 조회가 덜 됐으면 «일부를 못 했다» 고 말한다');
    ok(P.summaryLines({ ...base, sms_mode: 'mock' }).some(t => /mock/.test(t)), 'E 문자가 시험 모드면 그 사실을 말한다');
    ok(P.summaryLines({ ...base, reminder_enabled: false }).some(t => /스위치/.test(t)), 'E 리마인더 스위치가 꺼져 있으면 말한다');
    ok(!P.summaryLines({ ...base, reminder_enabled: null }).some(t => /스위치/.test(t)), 'E 스위치를 «모르면» 꺼졌다고 말하지 않는다');
    ok(/^10\/29\(목\) 16:00 · 이번 7일 3회$/.test(P.fmtNext({ next_date: '2026-10-29', next_time: '16:00:00', classes: 3 }, 7)), 'E 다음 수업 칸(날짜·요일·시각·횟수)', P.fmtNext({ next_date: '2026-10-29', next_time: '16:00:00', classes: 3 }, 7));
    ok(/9자리/.test(P.statusText({ status: 'short', short_len: 9 })) && /없음/.test(P.statusText({ status: 'none' })), 'E 상태 글자(짧은 번호·번호 없음)');
    // EN
    ctx.window.adminLang = 'en';
    ok(/students with classes/.test(P.summaryLines(base)[0]) && /Thu/.test(P.fmtNext({ next_date: '2026-10-29', next_time: '16:00', classes: 1 }, 7)), 'E 영어 화면이면 영어로 말한다');
    ctx.window.adminLang = 'ko';
    ok(listeners.includes('mangoi:lang-changed') && listeners.includes('w:mangoi:lang-changed'), 'E 언어 바뀜을 document·window 양쪽에서 듣는다(관리자 화면은 document 에서 쏜다)');
    ok(listeners.includes('mangoi:identity'), 'E 신원이 늦게 와도 다시 숨김을 판정한다(mangoi:identity)');
  }
  // 정적 — 화면이 판정·자동 채우기를 하지 않는가
  const noCmt = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ok(/\/api\/admin\/student\/phone-gaps\?days=/.test(noCmt) && /\/contact'/.test(noCmt) && /method:\s*'PATCH'/.test(noCmt), 'E 목록은 phone-gaps, 저장은 기존 contact PATCH');
  ok(!/hint_phone[^;]*\.value\s*=/.test(noCmt) && !/\.value\s*=\s*[^;]*hint_phone/.test(noCmt), 'E 참고 번호를 입력칸에 «자동으로» 넣지 않는다');
  ok(!/students_erp|student_retention|phonesForStudent/.test(noCmt), 'E 화면이 번호 판정을 다시 하지 않는다(서버만)');
  // 🔴 인라인 display 로 감추면 PC 에서 #legacy-cards details{display:block!important} 가 이긴다(브라우저 실측) — .rbac-hide 로
  const roleFn = braceBody(noCmt, noCmt.indexOf('function applyRole'));
  ok(/classList\.toggle\('rbac-hide',\s*!!\(me && hideFor\(me\.role\)\)\)/.test(roleFn) && !/\.style\.display\s*=/.test(roleFn), 'E 역할 숨김은 .rbac-hide 클래스로(인라인 display 금지)', roleFn.slice(0, 200));
  // ⌨️ 다시 그려도 쓰다 만 번호를 남긴다 — render 가 «그리기 전에 읽고 그린 뒤 되살린다»
  const renderFn = braceBody(noCmt, noCmt.indexOf('function render()'));
  const iRead = renderFn.indexOf('typedNow()'), iDraw = renderFn.lastIndexOf('body.innerHTML'), iRest = renderFn.lastIndexOf('restoreTyped(typed)');
  ok(iRead > 0 && iDraw > iRead && iRest > iDraw, 'E render: 쓰다 만 번호를 읽고(그리기 전) → 그린 뒤 되살린다', { iRead, iDraw, iRest });
  ok(!/<table/.test(noCmt), 'E 줄은 표(table)가 아니라 줄 상자(flex-wrap) — 표면 PC 에서 저장 버튼이 상자 밖으로 밀린다(실측 1,081px 대 624px)');
  const html = rd(resolve(PUB, 'admin.html'));
  const secAt = html.indexOf('id="sm-phone-gaps"');
  ok(secAt > 0 && /<script src="\/js\/adm-phone-gaps\.js\?v=\d+" defer><\/script>/.test(html), 'E admin.html 에 칸과 스크립트(defer, ?v=)가 있다');
  const secHtml = secAt > 0 ? html.slice(secAt, html.indexOf('</details>', secAt)) : '';
  for (const id of ['pg-load', 'pg-days', 'pg-count', 'pg-body', 'pg-flash']) ok(secHtml.includes('id="' + id + '"'), 'E 칸 안에 스크립트가 찾는 요소가 있다', id);
  ok(!/id="pg-body"[^>]*data-ko/.test(secHtml), 'E 그려 넣는 그릇(pg-body)에는 data-ko 를 달지 않는다(엔진이 내용을 갈아끼운다)');
  report('화면', b);
}

console.warn = _warn;
console.log('\n' + '─'.repeat(60));
if (fails.size) {
  console.log('❌ 실패 규칙');
  for (const [rule, v] of fails) console.log(`  ❌ FAIL ${rule} (${v.n}회)\n     반례: ${JSON.stringify(v.ex)?.slice(0, 600)}`);
}
console.log(`결과: PASS ${PASS} / FAIL ${FAIL}`);
process.exit(FAIL ? 1 : 0);
