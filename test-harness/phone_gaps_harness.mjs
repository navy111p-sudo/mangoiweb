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
//   F. 매니저 화면(manager.html) — 같은 스크립트를 «카드를 펼칠 때만» 받는가.
//   G. 강사 화면(teacher.html, 2026-10-28) — «내 수업» 학생만 세는가(오라클 대조) · 참고 번호를 안 읽는가 ·
//      저장 경로(api-teacher.ts ?part=phone_save)를 «진짜 정본» 으로 돌려 남의 학생·이미 번호 있는 학생에게 못 넣는가 ·
//      화면이 강사 모드에서 관리자 경로를 안 부르는가 · 펼칠 때만 받는가.
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
// ⏱ 리마인더의 «알림 창» 계산도 오려 낸다 — 시각 파싱 ~ `continue;   // 알림 창 밖` (candidates.push 바로 앞)
const wStart = sweepBody.indexOf('const [hh, mm] = String(s.start_time');
const wEnd = sweepBody.indexOf('candidates.push(', wStart);
const wSeg = (wStart >= 0 && wEnd > wStart) ? sweepBody.slice(wStart, wEnd) : '';
ok(!!wSeg && /REMIND_MIN_MS/.test(wSeg) && /REMIND_MAX_MS/.test(wSeg), '전제: 리마인더의 «알림 창» 계산을 오려 냈다', wSeg.slice(0, 120));
const constOf = (src, name) => { const m = src.match(new RegExp('const ' + name + '\\s*=\\s*([^;]+);')); try { return m ? Number(new Function('return (' + m[1] + ')')()) : NaN; } catch { return NaN; } };
const LR_MIN = constOf(lrSrc, 'REMIND_MIN_MS'), LR_MAX = constOf(lrSrc, 'REMIND_MAX_MS');
ok(Number.isFinite(LR_MIN) && LR_MIN === PG.REMIND_MIN_MS && LR_MAX === PG.REMIND_MAX_MS, 'B 알림 창 상수(15·45분)가 리마인더와 같다', { LR_MIN, LR_MAX, pg: [PG.REMIND_MIN_MS, PG.REMIND_MAX_MS] });
let reminderWindow = null;
try {
  reminderWindow = new Function('s', 'now', 'kY', 'kMo', 'kD', 'KST', 'REMIND_MIN_MS', 'REMIND_MAX_MS',
    stripTypeScriptTypes('function __w(){' + wSeg.replace(/\bcontinue;/g, 'return false;') + '}').replace(/^function __w\(\)\{/, '').replace(/\}\s*$/, '') + '\nreturn true;');
} catch (e) { ok(false, '전제: 오려 낸 알림 창 계산이 함수로 만들어진다', e && e.message); }
/** 15분마다(UTC·KST 같은 눈금) 리마인더를 «실제로 돌려 보는» 시뮬레이션 — now 이후 그날 안에 한 번이라도 창에 들면 true.
 *  ⚠️ 리마인더의 now 는 눈금 «정각» 이 아니다 — 같은 cron 안에서 감시견 등이 먼저 돌아 δ 만큼 늦다(그래서 «정확히 15분 전» 은 안 걸린다).
 *     δ=0 으로 돌리면 그 경계를 «걸린다» 로 착각한다(2026-10-28 함정 대조가 잡음). 기본 δ=5초, 1초·59초로도 같은 답이어야 한다. */
const TICK = 15 * 60 * 1000, KSTMS = 9 * 3600 * 1000;
function simReach(s, ymd, now, delta = 5000) {
  if (!reminderWindow) return null;
  const [y, mo, d] = ymd.split('-').map(Number);
  const dayStart = Date.UTC(y, mo - 1, d) - KSTMS;
  for (let T = Math.ceil(Math.max(now, dayStart) / TICK) * TICK; T < dayStart + 86400000; T += TICK) {
    const at = T + delta, k = new Date(at + KSTMS);
    if (k.getUTCDate() !== new Date(T + KSTMS).getUTCDate()) continue;   // δ 로 날짜가 넘어가는 일은 없다(1분 미만)
    if (reminderWindow(s, at, k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate(), KSTMS, LR_MIN, LR_MAX)) return true;
  }
  return false;
}
const START_POOL = ['16:00', '09:30', '', null, '7:05', 'ab:cd', '23:59', '00:00', '00:10', '00:14', '00:15', '00:30', '00:44', '00:45', '16:20', '12:5', ' 9:00', '24:30', '23:50'];
function genRow(r, i, ymdPool) {
  const dated = r() < 0.7;
  return {
    id: i, user_id: 'u' + int(r, 0, 9),
    scheduled_date: dated ? pick(r, ymdPool) : pick(r, [null, '', null]),
    day_of_week: dated ? pick(r, [null, '', '3']) : pick(r, ['0', '1', '2', '3', '4', '5', '6', '3', 'Wed', '', null, '7', ' 2']),
    status: pick(r, ['active', 'active', 'active', 'postponed', 'completed']),
    starts_on: r() < 0.3 ? pick(r, ymdPool) : null,
    skip_dates: r() < 0.25 ? [pick(r, ymdPool), pick(r, ymdPool)].join(',') : null,
    start_time: pick(r, START_POOL),
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
  // ⏱ reminderCanStillSend = 리마인더를 15분마다 실제로 돌려 본 결과
  let nw = 0, nwTrue = 0;
  if (reminderWindow) {
    for (let k = 0; k < N; k++) {
      const r = rng(SEED0 * 13 + k);
      const now = Date.UTC(2026, int(r, 0, 11), int(r, 1, 28), int(r, 0, 23), int(r, 0, 59), int(r, 0, 59));
      const ymds = PG.kstDays(now - 86400000, 3).map(d => d.ymd);
      for (let i = 0; i < 30; i++) {
        const st = r() < 0.6 ? pick(r, START_POOL) : (String(int(r, 0, 23)).padStart(2, '0') + ':' + String(int(r, 0, 59)).padStart(2, '0'));
        // «지금» 을 그 수업 시작 바로 앞뒤로도 놓아 본다(경계 15·45분)
        const ymd = pick(r, ymds);
        let nowX = now;
        const [hh, mm] = String(st || '00:00').split(':').map(Number);
        if (Number.isFinite(hh) && r() < 0.5) {
          const [y, mo, d] = ymd.split('-').map(Number);
          nowX = Date.UTC(y, mo - 1, d, hh, mm || 0) - KSTMS - pick(r, [0, 1, 14, 15, 16, 29, 30, 31, 44, 45, 46, 60]) * 60000 + pick(r, [0, 0, 1000, -1000]);
        }
        const want = simReach({ start_time: st }, ymd, nowX);
        const got = PG.reminderCanStillSend(st, ymd, nowX);
        if (k % 7 === 0) ok(simReach({ start_time: st }, ymd, nowX, 1000) === want && simReach({ start_time: st }, ymd, nowX, 59000) === want, '전제: 리마인더가 1초 늦게 돌든 59초 늦게 돌든 답이 같다(분 단위 시각)', { st, ymd });
        nw++; if (want) nwTrue++;
        ok(got === want, 'B «아직 문자가 나갈 수 있나» = 리마인더를 15분마다 돌려 본 결과', { st, ymd, nowX: new Date(nowX).toISOString(), want, got });
      }
    }
  }
  console.log(`  · 알림 창 대조 ${nw}건(그중 «나간다» ${nwTrue})`);
  ok(nw === 0 || (nwTrue > 50 && nw - nwTrue > 50), '전제: «나간다·안 나간다» 를 둘 다 실제로 만들었다', { nw, nwTrue });
  // 고정 — 이미 지난 수업·곧 시작·자정 직후는 안 나간다, 20분 뒤는 나간다
  const n0 = Date.UTC(2026, 9, 28, 7, 0) ;   // 10/28 16:00 KST 정각
  ok(PG.reminderCanStillSend('15:00', '2026-10-28', n0) === false, 'B 고정: 이미 지난 오늘 수업엔 안 나간다');
  ok(PG.reminderCanStillSend('16:10', '2026-10-28', n0) === false, 'B 고정: 15분도 안 남은 수업엔 안 나간다');
  ok(PG.reminderCanStillSend('16:20', '2026-10-28', n0) === true, 'B 고정: 20분 남은 수업엔 (16:00 눈금에) 나간다');
  ok(PG.reminderCanStillSend('16:15', '2026-10-28', n0 - 60000) === false, 'B 고정: «정확히 15분 전» 눈금만 남은 수업엔 안 나간다(리마인더 now 가 눈금보다 몇 초 늦어 15분 미만)');
  ok(PG.reminderCanStillSend('16:45', '2026-10-28', n0 - 60000) === true, 'B 고정: «정확히 45분 전» 눈금은 걸린다(45분 − δ)');
  ok(PG.reminderCanStillSend('00:15', '2026-10-29', n0) === false, 'B 고정: 00:15 수업은 그날 눈금이 00:00 하나뿐이고 그것이 «정확히 15분 전» 이라 원리상 못 보낸다');
  ok(PG.reminderCanStillSend('00:10', '2026-10-29', n0) === false && PG.reminderCanStillSend('00:30', '2026-10-29', n0) === true, 'B 고정: 자정 직후(00:00~00:15) 수업은 리마인더가 못 보낸다(창이 «전날» 눈금이거나 «정확히 15분 전» 하나뿐)');
  ok(PG.reminderCanStillSend('', '2026-10-29', n0) === false && PG.reminderCanStillSend(null, '2026-10-29', n0) === false, 'B 고정: 시각이 비면 «00:00» 으로 읽혀 안 나간다');
  ok(PG.reminderCanStillSend('ab:cd', '2026-10-29', n0) === false, 'B 고정: 시각을 못 읽으면 안 나간다');
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
function oracleGaps(raw, env, now, days, holidays, rowOk = () => true) {
  // 정본을 베끼지 않는다 — 리마인더 블록(B)으로 «열리는가», 한 명씩 phonesForStudent 로 «번호가 있나» 를 잰다
  return (async () => {
    const dl = PG.kstDays(now, days);
    const rows = raw.prepare("SELECT * FROM class_schedules WHERE status != 'cancelled'").all().filter(rowOk);   // G: 강사판은 «그 강사 수업» 만
    const by = new Map();
    for (const s of rows) {
      const uid = String(s.user_id || '').trim();
      if (!uid || ['lms', 'type_seed'].includes(uid.toLowerCase())) continue;
      for (const d of dl) {
        if (!reminderOccurs(s, d.ymd, d.dow, CSD.recurStartedOn, CP.isPostponedOccurrence)) continue;
        if (holidays.has(d.ymd) && String(s.teacher_id || '') !== '29') continue;
        if (!simReach(s, d.ymd, now)) continue;   // ⏱ 리마인더가 «아직» 보낼 수 있는 수업만(15분마다 돌려 본 결과)
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
    // ⏱ 오늘 이미 지난 수업·곧 시작하는 수업은 «다음 수업» 이 될 수 없다
    const rawT = buildWorld(rng(2), 0);
    const nowT = Date.UTC(2026, 9, 28, 7, 0);   // 10/28 16:00 KST
    const insT = rawT.prepare('INSERT INTO class_schedules (id,user_id,student_name,day_of_week,scheduled_date,start_time,status,teacher_id,created_at) VALUES (?,?,?,?,?,?,?,?,1)');
    insT.run(1, 'past', '지남', null, '2026-10-28', '15:00', 'active', '7');
    insT.run(2, 'soon', '곧', null, '2026-10-28', '16:05', 'active', '7');
    insT.run(3, 'later', '나중', null, '2026-10-28', '18:00', 'active', '7');
    insT.run(4, 'later', '나중', null, '2026-10-28', '15:30', 'active', '7');
    insT.run(5, 'midnight', '자정', null, '2026-10-29', '00:05', 'active', '7');
    const rT = await PG.buildPhoneGaps({ DB: d1(rawT, {}) }, { days: 2, now: nowT });
    const gT = new Map(rT.gaps.map(g => [g.uid, g]));
    ok(!gT.has('past') && !gT.has('soon') && !gT.has('midnight'), 'C 고정: 이미 지난·15분도 안 남은·자정 직후 수업만 있는 학생은 목록에 없다(번호가 있어도 문자가 안 감)', rT.gaps);
    ok(gT.has('later') && gT.get('later').next_time === '18:00' && gT.get('later').classes === 1, 'C 고정: «다음 수업» 은 아직 문자가 나갈 수업(이미 지난 15:30 이 아니라 18:00)', gT.get('later'));
    ok(rT.students === 1, 'C 고정: 학생 수도 아직 문자가 나갈 수업이 있는 학생만', rT.students);
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
  // 🔒 지사·대리점 정본 게이트(org-scope-guard.ts)를 «소스에서» 오려 내 그대로 쓴다 — 근거를 다시 읽고 못 읽으면 막는다
  const og = srcOf('org-scope-guard.ts');
  const ogFn = (name) => stripTypeScriptTypes(braceBody(og, og.indexOf('export ' + (name === 'readScopeType' ? 'async ' : '') + 'function ' + name)).replace(/^export /, ''));
  let OG = null;
  try {
    OG = new Function('isOrgScopedRole', ogFn('orgScopeVerdict') + '\n' + ogFn('readScopeType') + '\n' + ogFn('orgScopeDenyResponse') +
      '\nreturn { orgScopeVerdict, readScopeType, orgScopeDenyResponse };')(isOrg);
  } catch (e) { ok(false, 'D 전제: org-scope-guard 정본을 오려 냈다', e && e.message); }
  ok(!!OG, '전제: 지사·대리점 정본 게이트를 오려 냈다');
  // 근거를 «한 번» 읽어 강사 확인·정본 게이트에 같이 쓴다(이름은 소스에서 읽는다 — 하니스에 못 박지 않는다)
  const _scVar = (blk.match(/const (\w+) = await readScopeType\(env, actor\.username\);/) || [])[1];
  ok(!!_scVar && new RegExp('orgScopeDenyResponse\\(orgScopeVerdict\\(' + _scVar + ', actor\\.role\\)\\)').test(blk),
    'D 이 경로가 «근거를 다시 읽는» 정본 게이트를 부른다(읽은 그 값을 넘긴다)', { _scVar });
  let fn = null;
  try {
    // 경로 블록에 `return` 이 있어 그대로는 모듈로 못 벗긴다 — 함수로 감싼 «뒤» 에 타입을 벗긴다
    const routeJs = stripTypeScriptTypes('async function __route(method, path, url, request, env) {' + blk + '\n return null; }');
    fn = new Function('getAdminActor', 'forbiddenTeacherBody', 'isOrgScopedRole', 'buildPhoneGaps', 'json',
      'orgScopeVerdict', 'readScopeType', 'orgScopeDenyResponse',
      routeJs + '\nreturn __route;')
      (async (req) => req.__actor, FT.forbiddenTeacherBody, isOrg, async (env, o) => { env.__called = o; return env.__result || { ok: true, gaps: [] }; },
        (body, status = 200) => ({ body, status }), OG && OG.orgScopeVerdict, OG && OG.readScopeType, OG && OG.orgScopeDenyResponse);
  } catch (e) { ok(false, 'D 전제: 경로 블록을 실행할 수 있다', e && e.message); }
  if (fn) {
    // scope: admin_scope.scope_type 값 · 'NOROW' = 행 없음 · 'THROW' = 조회 실패
    const run = async (actor, q = '', result, scope = 'hq') => {
      const env = { __result: result, DB: { prepare: (sql) => ({ bind: (u) => ({ first: async () => {
        if (!/FROM admin_scope/.test(sql)) throw new Error('unexpected sql');
        if (scope === 'THROW') throw new Error('D1 흔들림');
        return scope === 'NOROW' ? null : { scope_type: scope };
      } }) }) } };
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
    for (const [role, scope] of [['hq', 'hq'], ['staff', 'none'], ['', 'hq'], ['staff', 'staff']]) {
      x = await run({ ok: true, isTeacher: false, role, username: 'mgr_a' }, '?days=14', undefined, scope);
      ok(x.out && x.out.status === 200 && x.called && x.called.days === 14, 'D 본사·내부직원은 200 이고 기간(days)을 그대로 넘긴다', { role, scope, out: x.out, called: x.called });
    }
    // 🔴 actor.role 은 스코프 조회가 흔들리면 'staff' 로 떨어진다 — 근거(admin_scope)를 다시 읽어 막는가
    for (const scope of ['branch', 'agency', 'franchise']) {
      x = await run({ ok: true, isTeacher: false, role: 'staff', username: 'branch_x' }, '', undefined, scope);
      ok(x.out && x.out.status === 403 && !x.called, 'D actor.role 이 staff 로 떨어져도 근거가 지사·대리점이면 403 · 목록 안 만듦', { scope, out: x.out && x.out.status });
    }
    for (const scope of ['THROW', 'NOROW', '', null]) {
      x = await run({ ok: true, isTeacher: false, role: 'staff', username: 'who' }, '', undefined, scope);
      const st = x.out && (x.out.status || (x.out instanceof Response ? x.out.status : 0));
      ok(st === 403 && !x.called, 'D 근거를 못 읽으면(조회 실패·행 없음) 막는다 — fail-closed', { scope, st });
    }
    // 🔴 정본 판정은 강사 스코프('teacher')를 hq 로 통과시킨다 — isTeacher 가 이름·스코프를 못 읽어 false 로 떨어져도
    //    다시 읽은 근거가 teacher 면 막는가(짝: 근거가 hq·none 이면 위에서 200)
    for (const role of ['staff', '', 'hq']) {
      x = await run({ ok: true, isTeacher: false, role, username: 'hq_t_x' }, '', undefined, 'teacher');
      ok(x.out && x.out.status === 403 && x.out.body && x.out.body.error === 'forbidden_teacher' && !x.called,
        'D isTeacher 가 false 로 떨어져도 근거가 teacher 면 403(forbidden_teacher) · 목록 안 만듦', { role, out: x.out && x.out.status });
    }
    x = await run({ ok: true, isTeacher: false, role: 'hq', username: 'admin' }, '', { ok: false, error: 'class_schedules_unavailable' });
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
    const mk = P.saveMsg(200, { ok: true, phone_kept: false });
    ok(mk.ok === true && mk.kept === false && mk.roster === null && !/✅/.test(mk.text), 'E «직원 입력 칸» 에 못 적었고 명부를 «모르면» 성공이라 하지 않고, 다시 불러 사실을 확인한다', mk);
    ok(P.saveMsg(200, { ok: true, phone_kept: true }).kept === true, 'E 다 적었으면 kept=true(짝)');
    // 📋 roster_updated — phone_kept:false 의 두 원인을 서버가 가른다
    const mkNo = P.saveMsg(200, { ok: true, phone_kept: false, roster_updated: false });
    ok(mkNo.ok === false && /명부를 찾지 못했습니다/.test(mkNo.ko) && /roster/.test(mkNo.en) && mkNo.kept === false, 'E 명부 행도 안 바뀌었으면(roster_updated:false) «저장 안 됨» — 다시 불러 확인할 것도 없다', mkNo);
    const mkYes = P.saveMsg(200, { ok: true, phone_kept: false, roster_updated: true });
    ok(mkYes.ok === true && mkYes.roster === true && /명부에는 적었지만/.test(mkYes.ko) && !/✅/.test(mkYes.ko), 'E 명부는 바뀌고 직원 칸만 못 적었으면 «일부» 라고 말한다', mkYes);
    // ⏳ 다시 불러온 뒤 할 말 — «목록에서 빠졌다» 를 «이제 간다» 로 읽지 않는다(수업이 지나도 빠진다)
    const gd = (uids, extra) => Object.assign({ ok: true, gaps: uids.map((u) => ({ uid: u })), sms_mode: 'real', reminder_enabled: true }, extra || {});
    // 변이가 던지면 «하니스 크래시» 가 아니라 깔끔한 FAIL 로 — 던진 값은 빈 답으로 돌려 아래 검사들이 실패하게 한다
    const ar = (m, d) => { try { return P.afterReload(m, d, 'kim1') || {}; } catch (e) { return { row: null, flash: null, threw: e && e.message }; } };
    const kOk = { ok: true, kept: true }, kNoUnknown = { ok: true, kept: false, roster: null }, kNoRoster = { ok: true, kept: false, roster: true };
    let a = ar(kOk, gd([]));
    ok(!a.row && a.flash && /✅/.test(a.flash.ko) && /이 번호로 갑니다/.test(a.flash.ko) && !/꺼져/.test(a.flash.ko), 'E 다 적었고 목록에서 빠졌으면 ✅ «이 번호로 갑니다»', a);
    a = ar(kOk, gd([], { sms_mode: 'mock' }));
    ok(a.flash && /✅/.test(a.flash.ko) && /꺼져 있어 실제로는 안 갑니다/.test(a.flash.ko) && /texting is off/i.test(a.flash.en), 'E 문자가 꺼져 있으면 성공 안내에 «실제로는 안 갑니다» 를 붙인다', a);
    a = ar(kOk, gd([], { reminder_enabled: false }));
    ok(a.flash && /꺼져 있어 실제로는 안 갑니다/.test(a.flash.ko), 'E 리마인더 스위치가 꺼져 있어도 붙인다', a);
    a = ar(kOk, gd([], { reminder_enabled: null }));
    ok(a.flash && !/꺼져/.test(a.flash.ko), 'E 스위치를 «모르면» 꺼졌다고 하지 않는다(짝)', a);
    a = ar(kOk, gd(['kim1']));
    ok(a.row && /아직 문자가 안 갈 번호/.test(a.row.ko) && !a.flash, 'E 다 적었는데 아직 목록에 있으면 «번호를 다시 확인» 을 줄에 남긴다', a);
    a = ar(kNoUnknown, gd(['kim1']));
    ok(a.row && /❌/.test(a.row.ko) && /대소문자/.test(a.row.ko) && !a.flash, 'E 직원 칸 실패 + 명부 모름 + 아직 목록 → ❌ «명부에서 못 찾았을 수 있다»', a);
    a = ar(kNoRoster, gd(['kim1']));
    ok(a.row && /아직 문자가 안 갈 번호/.test(a.row.ko) && !/❌/.test(a.row.ko), 'E 명부엔 적었는데 아직 목록 → «명부를 못 찾았다» 고 하지 않는다(짝)', a);
    a = ar(kNoRoster, gd([]));
    ok(!a.row && a.flash && /명부에는 적었지만/.test(a.flash.ko) && !/✅/.test(a.flash.ko) && !/지금은 문자가 갑니다/.test(a.flash.ko), 'E 명부만 적고 목록에서 빠졌으면 «한 번 더 저장» — «지금 간다» 라고 단정하지 않는다', a);
    a = ar(kNoUnknown, gd([]));
    ok(!a.row && a.flash && /목록에서는 빠졌지만/.test(a.flash.ko) && !/명부에는 적었지만/.test(a.flash.ko), 'E 명부를 «모르면» «명부에 적었다» 고 하지 않는다', a);
    for (const d of [null, { ok: false }, { ok: false, __err: 'x' }]) {
      a = ar(kOk, d);
      ok(!a.row && a.flash && /다시 불러오지 못해 확인하지 못했습니다/.test(a.flash.ko) && !/✅/.test(a.flash.ko), 'E 다시 불러오기가 실패하면 «확인 못 함» — 아무 말 없이 끝내지 않는다', { d, a });
    }
    // 🟡→수리(2026-10-28 함정 대조): 줄이 사라지는 경우 «한 번 더 저장» 할 «실재하는» 곳(학생 상세)을 말하고,
    //    다시 불러오기가 실패해도 «직원 칸에 못 적음» 을 잃지 않으며, 할 일이 남은 말은 경고(warn)로 그린다.
    a = ar(kNoRoster, gd([]));
    ok(a.warn === true && /학생 상세/.test(a.flash.ko) && /student detail/i.test(a.flash.en), 'E 명부만 적고 빠졌으면 «학생 상세에서 한 번 더» — 갈 곳을 말한다 · 경고', a);
    a = ar(kNoUnknown, gd([]));
    ok(a.warn === true && /학생 상세/.test(a.flash.ko), 'E 명부 모름 + 빠짐 → 갈 곳(학생 상세)을 말한다 · 경고', a);
    a = ar(kNoUnknown, null);
    ok(a.warn === true && /직원 입력 칸/.test(a.flash.ko) && /학생 상세/.test(a.flash.ko) && /staff field/i.test(a.flash.en), 'E 다시 불러오기 실패 + 직원 칸 못 적음 → 그 사실을 잃지 않는다', a);
    a = ar(kOk, null);
    ok(a.warn === true && /\[🔄 불러오기\]/.test(a.flash.ko) && /\[🔄 Load\]/.test(a.flash.en) && !/직원 입력 칸/.test(a.flash.ko), 'E 다시 불러오기 실패(직원 칸은 적힘) → 실제 버튼 이름 «🔄 불러오기» 로 안내 · 직원 칸 얘기는 안 함(짝)', a);
    a = ar(kOk, gd([]));
    ok(!a.warn, 'E 성공 안내는 경고가 아니다(초록·저절로 사라짐 — 짝)', a);
    ok(!/«다시 불러오기»/.test(js) && !/«Reload»/.test(js), 'E 화면에 없는 버튼 이름(«다시 불러오기»·«Reload»)으로 안내하지 않는다');
    const m403 = P.saveMsg(403, { ok: false, error: 'forbidden_teacher', message: '강사 권한으로는 …', message_en: 'Teachers cannot …', who_line: '지금 로그인: x', who_line_en: 'Logged in: x' });
    ok(/Teachers cannot/.test(m403.en) && !/강사 권한/.test(m403.en) && /강사 권한/.test(m403.ko), 'E EN 화면에는 서버의 영어 문구를 쓴다(KO 는 그대로 — 짝)', m403);
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
    ok(/students with upcoming classes/.test(P.summaryLines(base)[0]) && /Thu/.test(P.fmtNext({ next_date: '2026-10-29', next_time: '16:00', classes: 1 }, 7)), 'E 영어 화면이면 영어로 말한다');
    ctx.window.adminLang = 'ko';
    ok(listeners.includes('mangoi:lang-changed') && listeners.includes('w:mangoi:lang-changed'), 'E 언어 바뀜을 document·window 양쪽에서 듣는다(관리자 화면은 document 에서 쏜다)');
    ok(listeners.includes('mangoi:identity'), 'E 신원이 늦게 와도 다시 숨김을 판정한다(mangoi:identity)');
  }
  // ⏳ 불러오는 중에 또 부르면 «그다음 한 번» 을 예약하고 그 결과를 돌려준다(undefined 를 주면 저장 확인이 죽는다)
  if (P) {
    const calls = [];
    let release = [];
    ctx.fetch = (u) => { calls.push(u); return new Promise((res) => release.push(() => res({ ok: true, status: 200, json: async () => ({ ok: true, gaps: [{ uid: 'n' + calls.length }], days: 7, from: 'a', to: 'b', students: 1, reachable: 0 }) }))); };
    const p1 = P.load();
    const p2 = P.load();
    const p3 = P.load();
    ok(p1 && typeof p1.then === 'function' && p2 && typeof p2.then === 'function', 'E 불러오는 중에 또 불러도 promise 를 돌려준다(저장 확인이 «.then» 에서 던지지 않게)', { p1: typeof p1, p2: typeof p2 });
    ok(p2 === p3, 'E 겹친 요청은 «다음 한 번» 으로 합친다(요청을 쌓지 않는다)');
    ok(calls.length === 1, 'E 첫 요청이 끝나기 전엔 두 번째 요청을 안 보낸다', calls.length);
    // 변이로 promise 가 영영 안 풀려도 하니스가 «멈추지» 않게(top-level await 미해결 = exit 13 · 결과줄 없음) 1초에 끊는다
    const within = (pr) => Promise.race([pr, new Promise((r) => setTimeout(() => r(null), 1000))]);
    (release.shift() || (() => {}))();
    const d1r = await within(p1);
    for (let i = 0; i < 20 && calls.length < 2; i++) await new Promise((r) => setTimeout(r, 1));
    ok(calls.length === 2, 'E 첫 요청이 끝나면 예약한 한 번을 보낸다(그 사이 저장된 번호를 반영)', calls.length);
    (release.shift() || (() => {}))();
    const d2r = await within(p2);
    ok(d1r && d1r.gaps[0].uid === 'n1' && d2r && d2r.gaps[0].uid === 'n2', 'E 겹친 쪽은 «새로 불러온» 결과를 받는다(옛 결과로 확인하지 않는다)', { d1r: d1r && d1r.gaps, d2r: d2r && d2r.gaps });
    delete ctx.fetch;
  }
  // 💾 save() 를 «실제로» 눌러 본다 — 가짜 줄·가짜 서버. 갈래마다 «무엇을 보냈고 무엇을 말했나» 를 본다.
  //    (saveMsg·afterReload 가 옳아도 save 가 그 답을 안 쓰면 소용없다 — 그 배선을 여기서 잰다)
  if (P) {
    const mkEl = (attrs) => ({ value: '', textContent: '', disabled: false, getAttribute: (k) => attrs[k] ?? null });
    const mkRow = (uid, par, stu) => {
      const els = { par: mkEl({ 'data-role': 'parent' }), stu: mkEl({ 'data-role': 'student' }), msg: mkEl({}), btn: mkEl({}) };
      els.par.value = par; els.stu.value = stu;
      return { els, tr: { getAttribute: (k) => (k === 'data-uid' ? uid : null), querySelector: (q) => (
        q === '.pg-in[data-role="parent"]' ? els.par : q === '.pg-in[data-role="student"]' ? els.stu : q === '.pg-msg' ? els.msg : q === '.pg-save' ? els.btn : null) } };
    };
    const flashEl = { textContent: '', style: { display: 'none' }, attrs: {}, setAttribute(k, v) { this.attrs[k] = String(v); } };
    const bodyEl = { innerHTML: '', querySelectorAll: () => [] };
    ctx.document.getElementById = (id) => (id === 'pg-flash' ? flashEl : id === 'pg-body' ? bodyEl : null);
    const runSave = async (patchRes, listRes, par = '010-1234-5678', stu = '') => {
      const sent = [];
      flashEl.textContent = ''; flashEl.attrs = {}; bodyEl.innerHTML = '';
      ctx.fetch = async (u, o) => {
        sent.push({ u, method: (o && o.method) || 'GET', body: o && o.body });
        if (o && o.method === 'PATCH') {
          if (patchRes === 'NET') throw new Error('net');
          return { ok: patchRes.status === 200, status: patchRes.status, json: async () => patchRes.body };
        }
        if (listRes === 'NET') throw new Error('net');
        return { ok: true, status: 200, json: async () => listRes };
      };
      const row = mkRow('kim1', par, stu);
      let err = null;
      // 변이로 저장이 영영 안 끝나도 멈추지 않게 2초에 끊는다(끊기면 err 로 남아 아래 검사가 FAIL)
      try {
        const done = await Promise.race([P.save(row.tr).then(() => 'done'), new Promise((r) => setTimeout(() => r('timeout'), 2000))]);
        if (done === 'timeout') err = new Error('save timeout');
      } catch (e) { err = e; }
      delete ctx.fetch;
      return { sent, row: row.els, flash: flashEl.textContent, warn: flashEl.attrs['data-warn'] === '1', err };
    };
    const L = (uids, extra) => Object.assign({ ok: true, days: 7, from: 'a', to: 'b', students: 3, reachable: 1, complete: true, sms_mode: 'real', reminder_enabled: true,
      gaps: uids.map((u) => ({ uid: u, name: 'x', status: 'none', next_date: '2026-10-29', next_time: '16:00', classes: 1 })) }, extra || {});
    let r = await runSave({ status: 200, body: { ok: true, phone_kept: true, roster_updated: true } }, L([]));
    const patch = r.sent.find((x) => x.method === 'PATCH');
    ok(!r.err && patch && /\/api\/admin\/student\/kim1\/contact$/.test(patch.u) && JSON.parse(patch.body).parent_phone === '010-1234-5678' && !('student_phone' in JSON.parse(patch.body)),
      'E save: 그 학생 contact PATCH 로 «넣은 칸만» 보낸다(빈 학생 칸은 안 보낸다)', patch);
    ok(r.sent.filter((x) => x.method === 'GET').length === 1 && /✅/.test(r.flash) && /이 번호로 갑니다/.test(r.flash), 'E save: 성공 → 다시 불러 → 빠졌으면 ✅ 안내', { flash: r.flash, sent: r.sent.length });
    ok(r.warn === false, 'E save: 성공 안내는 경고 모양이 아니다(짝)', r.warn);
    r = await runSave({ status: 200, body: { ok: true, phone_kept: false, roster_updated: false } }, L(['kim1']));
    ok(!r.err && r.sent.filter((x) => x.method === 'GET').length === 0 && /❌/.test(r.row.msg.textContent) && /명부를 찾지 못했습니다/.test(r.row.msg.textContent) && !/✅/.test(r.flash),
      'E save: 명부도 안 바뀌었으면 다시 불러오지 않고 그 줄에 «저장 안 됨» 을 남긴다', { msg: r.row.msg.textContent, flash: r.flash, gets: r.sent.length });
    r = await runSave({ status: 200, body: { ok: true, phone_kept: false, roster_updated: true } }, L([]));
    ok(!r.err && /명부에는 적었지만/.test(r.flash) && !/✅/.test(r.flash), 'E save: 명부만 적힘 → 빠져도 ✅ 가 아니라 «한 번 더 저장»', r.flash);
    ok(!r.err && r.warn === true && /학생 상세/.test(r.flash), 'E save: 그 말은 경고 모양(주황·저절로 안 사라짐)으로, 갈 곳(학생 상세)과 함께', { flash: r.flash, warn: r.warn });
    r = await runSave({ status: 200, body: { ok: true, phone_kept: true, roster_updated: true } }, 'NET');
    ok(!r.err && /확인하지 못했습니다/.test(r.flash) && !/✅/.test(r.flash), 'E save: 다시 불러오기가 끊기면 «확인 못 함» 을 띄운다(조용히 끝내지 않는다)', r.flash);
    r = await runSave({ status: 200, body: { ok: true, phone_kept: true, roster_updated: true } }, L([], { sms_mode: 'mock' }));
    ok(/✅/.test(r.flash) && /실제로는 안 갑니다/.test(r.flash), 'E save: 문자가 꺼져 있으면 성공 안내에 그 사실을 붙인다', r.flash);
    r = await runSave('NET', L([]));
    ok(!r.err && /연결이 끊겨/.test(r.row.msg.textContent) && !r.flash && r.sent.filter((x) => x.method === 'GET').length === 0, 'E save: 저장 요청이 끊기면 그 줄에 «저장 못 함» · 다시 불러오지 않는다', r.row.msg.textContent);
    r = await runSave({ status: 200, body: { ok: true } }, L([]), '', '');
    ok(r.sent.length === 0 && /하나를 넣어/.test(r.row.msg.textContent), 'E save: 둘 다 비었으면 아무것도 안 보낸다', r);
    r = await runSave({ status: 200, body: { ok: true } }, L([]), '010-123', '');
    ok(r.sent.length === 0 && /짧으면/.test(r.row.msg.textContent), 'E save: 짧은 번호는 안 보낸다', r.row.msg.textContent);
    ctx.document.getElementById = () => null;
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

/* ── F. 매니저 화면(manager.html) — 같은 스크립트를 «카드를 펼칠 때만» 받는가 (2026-10-28) ──────────────
   왜: 매니저 화면은 «첫 화면 외부 리소스 0개» 계약이라 admin.html 처럼 defer 로 실을 수 없다. 그렇다고 판정·저장을
       복제하면 「화면마다 답이 다른」 사고가 시작된다 → 같은 파일을 펼칠 때 한 번 받는다. 그 로더를 «실제로 돌려» 본다. */
console.log('\n[ F. 매니저 화면 — 같은 스크립트를 펼칠 때만 받는가 ]');
{
  const b = mark();
  const mh = rd(process.env.PG_SRC_MANAGER_HTML || resolve(PUB, 'manager.html'));
  const ah = rd(resolve(PUB, 'admin.html'));
  const js = rd(process.env.PG_SRC_ADM_JS || resolve(PUB, 'js/adm-phone-gaps.js'));
  const jsNoCmt = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const { deadAt, commentsBalanced } = await import('./helpers/live-code.mjs');
  // 정적 — 첫 화면에 안 싣는다 · 같은 번호 · 카드·id
  ok(!/<script[^>]*src="\/js\/adm-phone-gaps\.js/.test(mh), 'F 매니저 화면은 adm-phone-gaps.js 를 <script src> 로 싣지 않는다(계약 1번 — 첫 화면 외부 리소스 0개)');
  const av = (ah.match(/\/js\/adm-phone-gaps\.js\?v=(\d+)/) || [])[1];
  const mv = [...mh.matchAll(/\/js\/adm-phone-gaps\.js\?v=(\d+)/g)].map(m => m[1]);
  ok(av && mv.length === 1 && mv[0] === av, 'F 매니저 로더의 ?v= 가 admin.html 과 같은 번호(다르면 두 화면이 다른 사본을 쓴다)', { admin: av, manager: mv });
  const cAt = mh.indexOf('<details class="card" id="sm-phone-gaps"');
  const cOpen = cAt >= 0 ? mh.slice(cAt, mh.indexOf('>', cAt) + 1) : '';
  const card = cAt >= 0 ? mh.slice(cAt, mh.indexOf('</details>', cAt)) : '';
  ok(/\shidden[\s>]/.test(cOpen) && /ontoggle="if\(this\.open\)loadPhoneGaps\(\)"/.test(cOpen), 'F 카드는 처음엔 감춰져 있고(본사만 푼다) 펼칠 때 로더를 부른다', cOpen);
  /* 계약 1번 «화면을 열 때 이 파일을 받지 않는다» — <script src> 금지만으로는 안 지켜진다: 화면 코드가 로더를
     직접 부르면 열자마자 받는다(함정 대조 실측: IS_HQ 줄에 한 줄 더해도 PASS 였다). «살아 있는 호출은 ontoggle 하나» 로 묻는다. */
  {
    const calls = [];
    for (let i = mh.indexOf('loadPhoneGaps('); i >= 0; i = mh.indexOf('loadPhoneGaps(', i + 1)) {
      const inHtmlCmt = mh.lastIndexOf('<!--', i) > mh.lastIndexOf('-->', i);
      const sAt = mh.lastIndexOf('<script', i), sEnd = mh.lastIndexOf('</script>', i);
      const inJsCmt = sAt > sEnd ? deadAt(mh, i, sAt) !== '' : false;
      if (!inHtmlCmt && !inJsCmt) calls.push(mh.slice(Math.max(0, i - 40), i + 16).replace(/\s+/g, ' '));
    }
    ok(calls.length === 1 && calls[0].includes('ontoggle="if(this.open)loadPhoneGaps()'), 'F 로더를 부르는 살아 있는 자리는 카드의 ontoggle 하나뿐(화면을 열 때 받지 않는다)', calls);
  }
  const usedIds = [...new Set([...jsNoCmt.matchAll(/\$\('([a-z0-9-]+)'\)/g)].map(m => m[1]))];
  ok(usedIds.length >= 5, 'F (전제) 스크립트가 찾는 id 목록을 소스에서 읽었다', usedIds);
  for (const id of usedIds) ok(id === 'sm-phone-gaps' ? cAt >= 0 : card.includes('id="' + id + '"'), 'F 매니저 카드 안에 스크립트가 찾는 요소가 있다', id);
  for (const id of ['pg-body', 'pg-count', 'pg-flash']) {
    const tag = (card.match(new RegExp('<[^>]*id="' + id + '"[^>]*>')) || [''])[0];
    ok(tag && !/data-(en|ko)=/.test(tag), 'F 그려 넣는 그릇에는 data-en/data-ko 를 달지 않는다(applyLang 이 textContent 를 통째로 갈아끼운다)', { id, tag });
  }
  const side = (mh.match(/<button[^>]*id="sidePhoneGaps"[^>]*>/) || [''])[0];
  ok(/\shidden[\s>]/.test(side) && /onclick="sideGo\('sm-phone-gaps'\)"/.test(side), 'F 왼쪽 메뉴 단추도 처음엔 감춰져 있고 그 카드로 간다', side);
  ok(/html\.dark #pg-flash\{color:[^}]*!important\}/.test(mh) && /html\.dark #pg-flash\[data-warn="1"\]\{color:[^}]*!important\}/.test(mh), 'F 어두운 화면에서 알림 글자색을 덮는다(스크립트가 밝은 화면용 진한 색을 인라인으로 쓴다)');
  { const ci = mh.indexOf('이 파일의 설계 계약'); ok(ci > 0 && /adm-phone-gaps\.js/.test(mh.slice(ci, mh.indexOf('-->', ci))), 'F 머리말 설계 계약에 예외를 적었다'); }

  // 실행 — 본사만 카드·메뉴를 푼다 (IS_HQ 자리를 오려 내 돌린다)
  const hqAt = mh.indexOf("['sm-phone-gaps', 'sidePhoneGaps'].forEach");
  const hqEnd = hqAt >= 0 ? mh.indexOf('\n', mh.indexOf('\n', hqAt) + 1) : -1;
  const hqCut = hqAt >= 0 ? mh.slice(hqAt, hqEnd) : '';
  const scrFrom = mh.lastIndexOf('<script>', hqAt);
  ok(hqAt > 0 && deadAt(mh, hqAt, scrFrom) === '' && commentsBalanced(hqCut), 'F (전제) 본사 판정 자리를 오려 냈고 주석 밖에 살아 있다', hqCut.slice(0, 160));
  for (const IS_HQ of [true, false]) {
    const els = { 'sm-phone-gaps': { hidden: true, classList: { contains: () => true } }, sidePhoneGaps: { hidden: true } };
    let paneNull = 0;
    try {
      new Function('document', 'IS_HQ', 'setPane', hqCut)({ getElementById: (id) => els[id] || null }, IS_HQ, (v) => { if (v === null) paneNull++; });
    } catch (e) { ok(false, 'F 본사 판정 자리가 돌아간다', String(e)); }
    ok(els['sm-phone-gaps'].hidden === !IS_HQ && els.sidePhoneGaps.hidden === !IS_HQ, 'F 본사면 카드·메뉴가 보이고, 아니면 감춘다(서버 403 짝)', { IS_HQ, card: els['sm-phone-gaps'].hidden, side: els.sidePhoneGaps.hidden });
    ok(IS_HQ ? paneNull === 0 : paneNull === 1, 'F 본사가 아니게 되면 그 카드를 펼쳐 둔 판(pane)도 닫는다', { IS_HQ, paneNull });
  }

  // 실행 — 언어를 바꾸면 다시 그린다(이 화면은 mangoi:lang-changed 를 안 쏜다 → repaintAll 이 부른다)
  const rpAt = mh.indexOf('function repaintAll(');
  const rpBody = braceBody(mh, rpAt);
  const rIdx = rpBody.indexOf('window.__pg.render()');
  ok(rIdx > 0 && deadAt(rpBody, rIdx, 0) === '', 'F repaintAll 이 (불러온 목록이 있으면) 그 스크립트의 render 를 부른다');
  {
    const line = rpBody.split('\n').find(l => l.includes('window.__pg.render()')) || '';
    for (const [pg, want] of [[undefined, 0], [{ _state: { data: null }, render() { this.n++; }, n: 0 }, 0], [{ _state: { data: { ok: true } }, render() { this.n++; }, n: 0 }, 1]]) {
      const win = { __pg: pg };
      try { new Function('window', line)(win); } catch (e) { ok(false, 'F repaintAll 의 그 줄이 던지지 않는다', String(e)); }
      ok((pg ? pg.n : 0) === want, 'F 목록을 불러온 «뒤» 에만 다시 그린다(안 불렀으면 손대지 않는다)', { has: !!pg, data: pg && pg._state.data, n: pg && pg.n });
    }
  }

  // 실행 — 로더: 한 번만 받는다 · 도착하면 «열려 있고 아직 안 불렀을 때» 만 부른다 · 실패하면 다시 펼칠 때 다시 받는다
  const ldAt = mh.indexOf('window.loadPhoneGaps = function');
  const ldFn = braceBody(mh, ldAt);
  ok(ldAt > 0 && /var _pgLoading = false;/.test(mh.slice(Math.max(0, ldAt - 200), ldAt)) && deadAt(mh, ldAt, mh.lastIndexOf('<script>', ldAt)) === '', 'F (전제) 로더를 오려 냈고 살아 있다');
  const seen = (h) => String(h).replace(/<[^>]*>/g, '');
  function world(en) {
    const scripts = [];
    const body = { innerHTML: '' };
    const sec = { open: true };
    const doc = {
      getElementById: (id) => (id === 'pg-body' ? body : id === 'sm-phone-gaps' ? sec : null),
      createElement: () => ({ src: '', onload: null, onerror: null, parentNode: { removeChild() {} } }),
      head: { appendChild: (s) => scripts.push(s) },
    };
    const win = {};
    let run;
    try { new Function('window', 'document', 'EN', 'var _pgLoading = false;\n' + ldFn + ';')(win, doc, () => en); run = win.loadPhoneGaps; }
    catch (e) { ok(false, 'F 로더가 돌아간다', String(e)); run = () => {}; }
    const stub = (st) => ({ __loaded: true, _state: st, n: 0, load() { this.n++; } });
    return { run, scripts, body, sec, win, stub };
  }
  for (const en of [true, false]) {
    const w = world(en);
    w.run(); w.run();
    ok(w.scripts.length === 1 && w.scripts[0].src === '/js/adm-phone-gaps.js?v=' + av, 'F 연타해도 한 번만 받고, admin 과 같은 주소를 받는다', w.scripts.map(s => s.src));
    // ⚠️ 태그를 벗긴 «보이는 글자» 로 본다 — data-ko/data-en 속성 안의 글자가 걸려 «한국어로 말한다» 가 거짓으로 통과했다(변이 실측)
    ok(seen(w.body.innerHTML).includes(en ? 'Loading' : '불러오는 중') && !seen(w.body.innerHTML).includes(en ? '불러오는 중' : 'Loading'), 'F 받는 동안 «불러오는 중» 을 그 화면 언어로 말한다', { en, html: w.body.innerHTML });
    w.win.__pg = w.stub({ loadedOnce: false, busy: null });
    try { w.scripts[0].onload(); } catch (e) { ok(false, 'F onload 가 던지지 않는다', String(e)); }
    ok(w.win.__pg.n === 1, 'F 도착했을 때 카드가 열려 있으면 목록을 부른다(toggle 이벤트는 이미 지나갔다)', w.win.__pg.n);
  }
  {
    const w = world(true);
    w.run(); w.sec.open = false;
    w.win.__pg = w.stub({ loadedOnce: false, busy: null });
    w.scripts[0].onload();
    ok(w.win.__pg.n === 0, 'F 도착했을 때 카드가 닫혀 있으면 부르지 않는다', w.win.__pg.n);
  }
  for (const en of [true, false]) {
    const w = world(en);
    w.run();
    try { w.scripts[0].onerror(); } catch (e) { ok(false, 'F onerror 가 던지지 않는다', String(e)); }
    ok(seen(w.body.innerHTML).includes(en ? 'Could not load this panel' : '이 칸을 불러오지 못했습니다') && !seen(w.body.innerHTML).includes(en ? '이 칸을' : 'Could not'), 'F 못 받으면 그 사실을 그 화면 언어로 말한다', { en, html: w.body.innerHTML });
    w.run();
    ok(w.scripts.length === 2, 'F 못 받은 뒤 다시 펼치면 다시 받는다(한 번 실패로 영영 막히지 않는다)', w.scripts.length);
  }
  for (const [st, open, want, why] of [
    [{ loadedOnce: true, busy: null }, true, 0, '이미 불러왔으면 다시 안 부른다'],
    [{ loadedOnce: false, busy: {} }, true, 0, '불러오는 중이면 겹쳐 부르지 않는다'],
    [{ loadedOnce: false, busy: null }, true, 1, '열려 있고 아직 안 불렀으면 부른다'],
    [{ loadedOnce: false, busy: null }, false, 0, '닫혀 있으면 부르지 않는다'],
  ]) {
    const w = world(true);
    w.run(); w.sec.open = open;
    w.win.__pg = w.stub(st);
    try { w.scripts[0].onload(); } catch (e) { ok(false, 'F onload 가 던지지 않는다', String(e)); }
    ok(w.win.__pg.n === want, 'F 도착했을 때: ' + why, { st, open, n: w.win.__pg.n });
  }
  /* 이미 받아 둔 뒤에는 로더가 목록을 부르지 않는다 — 그 스크립트가 카드의 toggle 을 직접 듣는다.
     둘 다 부르면 첫 요청이 실패한 뒤 다시 펼칠 때 목록 요청이 두 번 나간다(함정 대조 지적 → 브라우저 ⑦-2 가 실제로 센다). */
  for (const st of [{ loadedOnce: false, busy: null }, { loadedOnce: true, busy: null }]) {
    const w = world(true);
    w.win.__pg = w.stub(st); w.sec.open = true;
    w.run();
    ok(w.scripts.length === 0 && w.win.__pg.n === 0, 'F 이미 받아 둔 뒤에는 다시 받지도 부르지도 않는다(그 스크립트의 toggle 이 부른다)', { st, n: w.win.__pg.n, scripts: w.scripts.length });
  }

  // 실행 — 언어 판정: 매니저 화면은 adminLang 이 없고 기본이 영어(<html lang>) — 저장값이 없어도 영어로 그린다
  const ie = braceBody(jsNoCmt, jsNoCmt.indexOf('function isEn()'));
  const isEnRun = (adminLang, htmlLang, stored) => {
    try {
      return new Function('window', 'document', 'localStorage', ie + '\nreturn isEn();')(
        { adminLang }, { documentElement: { lang: htmlLang } }, { getItem: () => stored });
    } catch (e) { return 'THROW ' + e; }
  };
  for (const [a, h, st, want, why] of [
    [undefined, 'en', null, true, '매니저 기본(영어) — 저장값이 없어도 영어'],
    [undefined, 'en', 'ko', true, '<html lang> 이 저장값보다 먼저(화면이 이미 정한 언어)'],
    [undefined, 'ko', 'en', false, '매니저에서 한국어로 바꾸면 한국어'],
    [undefined, 'ko-KR', null, false, '지역 꼬리가 붙어도(ko-KR) 읽는다'],
    ['ko', 'en', 'en', false, '관리자 화면은 adminLang 이 이긴다(예전 그대로)'],
    ['en', 'ko', 'ko', true, '관리자 화면은 adminLang 이 이긴다(예전 그대로)'],
    [undefined, '', 'en', true, '<html lang> 이 비면 예전처럼 mangoi_lang'],
    [undefined, '', null, false, '아무것도 모르면 한국어(예전 그대로)'],
  ]) ok(isEnRun(a, h, st) === want, 'F 언어 판정: ' + why, { a, h, st, got: isEnRun(a, h, st) });
  report('매니저 화면', b);
}

/* ── G. 강사 화면(teacher.html) — «내 수업» 학생만 · 번호 «넣기» 만 (2026-10-28) ──────────────────────────
   왜: 강사에게 남의 수업 학생이 보이거나 저장되면 되돌릴 수 없다(남의 학생 이름·번호). 그래서 범위(teacherKeys)와
       저장 게이트(api-teacher.ts 의 phoneMode 블록)를 «소스에서 오려 내» 진짜 정본(buildPhoneGaps·setOverridePhones)으로 돌린다. */
console.log('\n[ G. 강사 화면 — 내 수업 학생만 · 번호 넣기만 ]');
{
  const b = mark();
  // G-1 강사 열쇠 목록
  ok(typeof PG.teacherKeyList === 'function', '전제: teacherKeyList 를 내보냈다');
  if (typeof PG.teacherKeyList === 'function') {
    for (const [inp, want] of [[[], ''], [undefined, ''], [null, ''], ['22', ''], [['22'], ',22,'], [['22', '22', ' 22 '], ',22,'],
      [[22, '7'], ',22,7,'], [['a,b', '7'], ',7,'], [['', '  ', null, undefined], '']]) {
      const got = PG.teacherKeyList(inp);
      ok(got === want, 'G 강사 열쇠 목록(빈 값·콤마 든 값·중복을 버린다 · 배열이 아니면 빈 목록)', { inp, got, want });
    }
  }
  // G-2 무작위 — «그 강사 수업» 만 센 오라클과 대조 · 참고 번호를 «읽지도» 않는가 · 열쇠가 없으면 «전부» 로 떨어지지 않는가
  const TID_POOL = ['7', '29', '22', 'mangoi_018', 'Mangoi_018', ' 22', '22,7', null, ''];
  const KEY_POOL = ['7', '22', 'mangoi_018', '22,7', ' 29 ', '', null, 'nobody'];
  let worldsT = 0, gapsT = 0, emptyKeys = 0, otherSkipped = 0;
  for (let k = 0; k < N; k++) {
    HC.clearHolidayClosureCache();
    const r = rng(SEED0 * 17 + k);
    const now = Date.UTC(2026, int(r, 0, 11), int(r, 1, 28), int(r, 0, 23), int(r, 0, 59));
    const days = pick(r, [7, 14, 3]);
    const raw = buildWorld(r, k);
    const pool = PG.kstDays(now, 16).map(d => d.ymd);
    const ins = raw.prepare('INSERT INTO class_schedules (id,user_id,student_name,day_of_week,scheduled_date,start_time,status,teacher_id,created_at) VALUES (?,?,?,?,?,?,?,?,1)');
    let id = 1;
    for (const u of Array.from({ length: int(r, 0, 25) }, (_, i) => 't' + k + '_' + i)) {
      for (let j = int(r, 1, 4); j > 0; j--) {
        const s = genRow(r, id, pool);
        ins.run(id++, u, '학생' + u, s.day_of_week == null ? null : String(s.day_of_week), s.scheduled_date, s.start_time,
          pick(r, ['active', 'active', 'active', 'cancelled', 'postponed']), pick(r, TID_POOL));
      }
      if (r() < 0.6) raw.prepare('INSERT OR IGNORE INTO students_erp VALUES (?,?,?,?)').run(u, r() < 0.4 ? genPhone(r) : null, null, r() < 0.4 ? genPhone(r) : null);
      if (r() < 0.4) raw.prepare('INSERT OR IGNORE INTO student_retention VALUES (?,?)').run(u, '010-' + digitsN(r, 4) + '-' + digitsN(r, 4));
    }
    const keys = Array.from({ length: int(r, 0, 3) }, () => pick(r, KEY_POOL));
    const clean = new Set(keys.map(x => String(x == null ? '' : x).trim()).filter(x => x && !x.includes(',')));
    if (!clean.size) emptyKeys++;
    const log = [];
    const env = { DB: d1(raw, {}, log), SOLAPI_API_KEY: 'k', SOLAPI_API_SECRET: 's' };
    let res;
    try { res = await PG.buildPhoneGaps(env, { days, now, teacherKeys: keys }); } catch (e) { ok(false, 'G buildPhoneGaps(강사판)가 던지지 않는다', e && e.message); continue; }
    worldsT++;
    const logT = log.slice();
    // 정본을 베끼지 않는다 — 포털 예약 조건(cs.teacher_id = ?)과 같은 «정확일치» 를 오라클에서 따로 건다
    const o = await oracleGaps(raw, env, now, days, new Set(), (s) => s.teacher_id != null && clean.has(String(s.teacher_id)));
    ok(res.ok === true && res.scope === 'teacher', 'G 강사판은 scope=teacher', { ok: res.ok, scope: res.scope });
    ok(res.students === o.students && res.reachable === o.reachable, 'G 강사판 학생 수·문자 갈 학생 수 = «그 강사 수업» 만 센 오라클', { got: [res.students, res.reachable], want: [o.students, o.reachable], keys });
    const og = new Map(o.gaps.map(g => [g.uid, g]));
    ok(res.gaps.length === o.gaps.length && res.gaps.every(g => og.has(g.uid)), 'G 강사판 «번호 없는 학생» = 오라클', { got: res.gaps.map(g => g.uid), want: o.gaps.map(g => g.uid), keys });
    for (const g of res.gaps) {
      gapsT++;
      const w = og.get(g.uid); if (!w) continue;
      ok(g.classes === w.classes && (g.next_date + ' ' + g.next_time) === w.next, 'G 강사판 수업 수·가장 가까운 수업도 «내 수업» 기준', { g, w });
      ok(g.hint_phone === '', 'G 강사판은 참고 번호를 싣지 않는다', g);
    }
    ok(!logT.some(x => x.k === 'ret'), 'G 강사판은 이탈위험 표를 «읽지도» 않는다', logT.filter(x => x.k === 'ret').length);
    if (!clean.size) ok(!logT.some(x => x.k === 'cs') && res.students === 0 && res.gaps.length === 0, 'G 열쇠가 없으면 수업 표를 읽지도 않고 0명(«전부» 로 떨어지지 않는다)', { keys, students: res.students });
    // 짝 — 같은 세계에서 열쇠를 안 넘기면 scope=all 이고, 강사판 줄은 그 안에 든다
    const all = await PG.buildPhoneGaps({ DB: d1(raw, {}), SOLAPI_API_KEY: 'k', SOLAPI_API_SECRET: 's' }, { days, now });
    const allU = new Set(all.gaps.map(g => g.uid));
    ok(all.scope === 'all' && res.gaps.every(g => allU.has(g.uid)), 'G 짝: 열쇠를 안 넘기면 scope=all · 강사판 줄은 그 안에 든다', { scope: all.scope });
    if (all.gaps.length > res.gaps.length) otherSkipped++;
  }
  console.log(`  · 강사판 무작위 ${worldsT}벌 · 줄 ${gapsT}건 · 열쇠 없음 ${emptyKeys}벌 · 남의 수업 학생이 빠진 세계 ${otherSkipped}벌`);
  ok(gapsT > 30 && emptyKeys > 0 && otherSkipped > 20, '전제: 무작위가 «내 학생 줄·열쇠 없음·남의 학생 빠짐» 을 실제로 만들었다', { gapsT, emptyKeys, otherSkipped });

  // G-2b 고정 세계 — 무작위로는 드물게만 나오는 «열쇠 모양» 함정을 일부러 만든다
  {
    HC.clearHolidayClosureCache();
    const raw = buildWorld(rng(9), 0);
    const nowF = Date.UTC(2026, 9, 28, 3, 0);   // 10/28 12:00 KST
    const ins = raw.prepare('INSERT INTO class_schedules (id,user_id,student_name,day_of_week,scheduled_date,start_time,status,teacher_id,created_at) VALUES (?,?,?,?,?,?,?,?,1)');
    ins.run(1, 'comma1', '콤마', null, '2026-10-29', '16:00', 'active', '22,7');       // 열쇠 22·7 이 «나란히» 있어도 이 줄은 남의 것
    ins.run(2, 'space1', '공백', null, '2026-10-29', '16:00', 'active', ' 22');        // 포털은 정확일치 — 앞 공백이면 안 걸린다
    ins.run(3, 'case1', '대문자', null, '2026-10-29', '16:00', 'active', 'Mangoi_018'); // 대소문자도 정확일치
    ins.run(4, 'pre1', '앞토막', null, '2026-10-29', '16:00', 'active', '2');           // 22 의 앞토막
    ins.run(5, 'own1', '내학생', null, '2026-10-29', '16:00', 'active', '22');
    ins.run(6, 'own2', '내학생2', null, '2026-10-29', '17:00', 'active', 'mangoi_018');
    const envF = { DB: d1(raw, {}), SOLAPI_API_KEY: 'k', SOLAPI_API_SECRET: 's' };
    for (const keys of [['22', '7', 'mangoi_018'], ['mangoi_018', '22', '7'], ['7', '22', 'mangoi_018', ' 22 ']]) {
      const r = await PG.buildPhoneGaps(envF, { days: 7, now: nowF, teacherKeys: keys });
      const us = (r.gaps || []).map(g => g.uid).sort();
      ok(r.ok && JSON.stringify(us) === JSON.stringify(['own1', 'own2']), 'G 고정: 콤마 든 번호·앞 공백·대소문자·앞토막은 «내 수업» 이 아니다(포털과 같은 정확일치)', { keys, us });
    }
    const r2 = await PG.buildPhoneGaps(envF, { days: 7, now: nowF, teacherKeys: ['22,7'] });
    ok(r2.ok && r2.students === 0 && r2.gaps.length === 0, 'G 고정: 콤마 든 열쇠 하나만이면 아무도 안 센다', r2.gaps);
  }
  // G-3 api-teacher.ts — 관문·위치·블록 실행
  const at = srcOf('api-teacher.ts');
  const { deadAt } = await import('./helpers/live-code.mjs');
  const gStart = at.indexOf('const isGoalPost = ');
  const gIf = at.indexOf("if (path !== '/api/teacher/portal'", gStart);
  const gEnd = gIf >= 0 ? at.indexOf('return null;', gIf) : -1;
  const gateSeg = (gStart >= 0 && gEnd > gIf) ? at.slice(gStart, gEnd + 'return null;'.length) : '';
  let gate = null;
  try {
    gate = new Function(stripTypeScriptTypes('function __g(method, path, url) {\n' + gateSeg + "\nreturn 'pass'; }") + '\nreturn __g;')();
  } catch (e) { ok(false, 'G 전제: 포털 경로 관문을 오려 냈다', e && e.message); }
  ok(!!gate && /isPhoneSavePost/.test(gateSeg), '전제: 포털 경로 관문을 오려 냈다(저장 POST 를 받는 줄 포함)');
  if (gate) {
    const U = (q) => new URL('https://x/api/teacher/portal?' + q);
    for (const [m, p, q, want] of [['POST', '/api/teacher/portal', 'part=phone_save', 'pass'], ['GET', '/api/teacher/portal', 'part=phone_gaps', 'pass'],
      ['POST', '/api/teacher/portal', 'part=phone_gaps', null], ['POST', '/api/teacher/portal', 'part=nope', null],
      ['DELETE', '/api/teacher/portal', 'part=phone_save', null], ['POST', '/api/teacher/other', 'part=phone_save', null]]) {
      ok(gate(m, p, U(q)) === want, 'G 관문: 저장은 POST ?part=phone_save 만 받는다(다른 POST·다른 메서드는 그대로 거절)', { m, p, q, got: gate(m, p, U(q)) });
    }
  }
  const pmLine = (at.match(/const phoneMode = [^;]+;/) || [''])[0];
  const onLine = (at.match(/const onlyNext = [^;]+;/) || [''])[0];
  let modes = null;
  try { modes = new Function('method', 'url', 'isPhoneSavePost', 'monthMode', pmLine + '\n' + onLine + '\nreturn { phoneMode, onlyNext };'); } catch (e) { ok(false, 'G 전제: phoneMode·onlyNext 줄을 오려 냈다', e && e.message); }
  if (modes) {
    const U = (q) => new URL('https://x/api/teacher/portal?' + q);
    let m = modes('GET', U('part=phone_gaps'), false, false);
    ok(m.phoneMode === true && m.onlyNext === true, 'G 목록 요청은 «가벼운 모드»(공지·자료·평점을 안 읽는다)', m);
    m = modes('POST', U('part=phone_save'), true, false);
    ok(m.phoneMode === true && m.onlyNext === true, 'G 저장 요청도 «가벼운 모드»', m);
    m = modes('POST', U('part=phone_gaps'), false, false);
    ok(m.phoneMode === false, 'G POST ?part=phone_gaps 는 목록 모드가 아니다(저장만 POST)', m);
    m = modes('GET', U(''), false, false);
    ok(m.phoneMode === false && m.onlyNext === false, 'G 짝: 평소 포털 요청은 그대로(가벼운 모드 아님)', m);
  }
  const pmAt = at.indexOf('  if (phoneMode) {');
  const pmBlk = pmAt >= 0 ? braceBody(at, pmAt) : '';
  const iAuth = at.indexOf("if (!actor.ok) return json({ ok: false, error: 'auth_required' }, 401);");
  const iNotT = at.indexOf("error: 'not_a_teacher'");
  const iAmb = at.indexOf('const identityAmbiguous =');
  const iHist = at.indexOf("if (url.searchParams.get('part') === 'student_history')");
  ok(!!pmBlk && /setOverridePhones\(/.test(pmBlk) && deadAt(at, pmAt, 0) === '', '전제: 강사판 블록을 오려 냈고 주석 밖에 살아 있다');
  ok(iAuth > 0 && iNotT > iAuth && iAmb > iNotT && pmAt > iAmb && iHist > pmAt, 'G 강사판 블록은 로그인(401)·«강사/본사 아님»(403)·신원 확정 «뒤», 다른 part 보다 «앞»', { iAuth, iNotT, iAmb, pmAt, iHist });
  ok(!/\/api\/admin\//.test(pmBlk.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')), 'G 강사판 블록은 관리자 경로를 부르지 않는다');
  let mkPm = null;
  try {
    const js = stripTypeScriptTypes('async function __pm(url, request, env, actor, linkedTeacherIds, identityUnlinked, identityAmbiguous, isPhoneSavePost, phoneMode) {\n' + pmBlk + '\n return null; }');
    mkPm = (deps) => new Function('buildPhoneGaps', 'PHONE_GAP_DAYS_MAX', 'SMS_MIN_DIGITS', 'setOverridePhones', 'json', js + '\nreturn __pm;')(
      deps.build, PG.PHONE_GAP_DAYS_MAX, PG.SMS_MIN_DIGITS, deps.save, (body, status = 200) => ({ body, status }));
    mkPm({ build: async () => ({}), save: async () => ({}) });
  } catch (e) { mkPm = null; ok(false, 'G 전제: 강사판 블록을 함수로 만들었다', e && e.message); }
  ok(!!mkPm && PG.PHONE_GAP_DAYS_MAX === 14 && PG.SMS_MIN_DIGITS === 10, '전제: 강사판 블록을 실행할 수 있고 상수(14일·10자리)를 정본에서 받았다');
  if (mkPm) {
    const call = async (o) => {
      const log = [];
      const build = async (env, opts) => { log.push(['build', opts]); return o.result || { ok: true, complete: true, gaps: [] }; };
      const save = async (env, uid, put, by) => { log.push(['save', uid, put, by]); return o.saveRes || { ok: true }; };
      let out;
      try {
        out = await mkPm({ build, save })(new URL('https://x/api/teacher/portal?' + (o.q || '')),
          { json: async () => { if (o.body === 'BAD') throw new Error('bad json'); return o.body; } }, {}, o.actor || { username: 'mangoi_018' },
          o.tids || ['22'], !!o.unlinked, !!o.amb, !!o.post, true);
      } catch (e) { out = { status: -1, body: { threw: e && e.message } }; }
      return { out: out || { status: 0, body: {} }, log };
    };
    let x = await call({ q: 'part=phone_gaps&days=14', tids: ['22', 7], amb: true, result: { ok: true, complete: true, gaps: [{ uid: 'a' }] } });
    ok(x.out.status === 200 && x.log.length === 1 && x.log[0][1].days === 14 && JSON.stringify(x.log[0][1].teacherKeys) === JSON.stringify(['mangoi_018', '22', '7']),
      'G 목록: 로그인 아이디 + 확정 원부 번호를 열쇠로 넘긴다(포털 예약 조건과 같은 열쇠) · 기간 그대로', x.log);
    ok(x.out.body.identity_ambiguous === true && x.out.body.identity_unlinked === false && x.out.body.gaps.length === 1, 'G 목록: 신원 상태(연결 안 됨·헷갈림)를 함께 싣는다', x.out.body);
    x = await call({ q: 'part=phone_gaps', result: { ok: false, error: 'class_schedules_unavailable' } });
    ok(x.out.status === 503, 'G 목록: 못 만들면 503(«번호 없는 학생 0명» 으로 보이지 않게)', x.out);
    x = await call({ q: 'part=phone_gaps', actor: { username: '  ' }, tids: [] });
    ok(x.log[0] && Array.isArray(x.log[0][1].teacherKeys) && x.log[0][1].teacherKeys.length === 0, 'G 목록: 아이디도 원부 번호도 없으면 빈 열쇠(정본이 0명으로 끝낸다)', x.log[0]);
    const GAPS = { ok: true, complete: true, gaps: [{ uid: 'kim1' }, { uid: 'Lee' }] };
    const post = (body, extra) => call(Object.assign({ post: true, q: 'part=phone_save', body, result: GAPS }, extra || {}));
    x = await post({ student_uid: 'kim1', parent_phone: '010-1234-5678' });
    let sv = x.log.find(l => l[0] === 'save');
    ok(x.out.status === 200 && x.out.body.ok === true && x.out.body.phone_kept === true && sv && sv[1] === 'kim1' && JSON.stringify(sv[2]) === JSON.stringify({ parent: '010-1234-5678' }) && sv[3] === 'teacher:mangoi_018',
      'G 저장: 넣은 칸만 · 누가 넣었는지(teacher:아이디) 함께 · 성공 모양(phone_kept)', x);
    ok(x.log[0] && x.log[0][0] === 'build' && x.log[0][1].days === PG.PHONE_GAP_DAYS_MAX && JSON.stringify(x.log[0][1].teacherKeys) === JSON.stringify(['mangoi_018', '22']) && x.log.indexOf(sv) > 0,
      'G 저장: 저장 «전에» 같은 열쇠·가장 긴 기간(14일)으로 목록을 다시 잰다', x.log);
    x = await post({ student_uid: ' kim1 ', student_phone: '+63 917 123 4567' });
    sv = x.log.find(l => l[0] === 'save');
    ok(x.out.status === 200 && sv && sv[1] === 'kim1' && JSON.stringify(sv[2]) === JSON.stringify({ student: '+63 917 123 4567' }), 'G 저장: 학생 번호만 넣어도 된다 · 아이디 앞뒤 공백은 뗀다', x.log);
    x = await post({ student_uid: 'kim1', parent_phone: '010-1111-2222', student_phone: '010-3333-4444' });
    sv = x.log.find(l => l[0] === 'save');
    ok(x.out.status === 200 && sv && JSON.stringify(sv[2]) === JSON.stringify({ parent: '010-1111-2222', student: '010-3333-4444' }), 'G 저장: 둘 다 넣으면 둘 다', x.log);
    for (const [bd, err, st, built] of [
      [{ parent_phone: '010-1234-5678' }, 'student_uid_required', 400, false],
      [{ student_uid: '   ', parent_phone: '010-1234-5678' }, 'student_uid_required', 400, false],
      [{ student_uid: 'x'.repeat(81), parent_phone: '010-1234-5678' }, 'student_uid_required', 400, false],
      ['BAD', 'student_uid_required', 400, false],
      [{ student_uid: 'kim1' }, 'no_phone', 400, false],
      [{ student_uid: 'kim1', parent_phone: '', student_phone: '  ' }, 'no_phone', 400, false],
      [{ student_uid: 'kim1', parent_phone: '010-123-456' }, 'bad_phone', 400, false],
      [{ student_uid: 'kim1', parent_phone: '123456789' }, 'bad_phone', 400, false],
      [{ student_uid: 'kim1', parent_phone: '0101234567890123' }, 'bad_phone', 400, false],
      [{ student_uid: 'kim1', parent_phone: 'abc010-1234-5678' }, 'bad_phone', 400, false],
      [{ student_uid: 'kim1', parent_phone: '010 ' + '-'.repeat(26) + '12345678' }, 'bad_phone', 400, false],
      [{ student_uid: 'kim1', parent_phone: '010-1234-5678', student_phone: 'x' }, 'bad_phone', 400, false],
      [{ student_uid: 'nobody', parent_phone: '010-1234-5678' }, 'not_in_your_list', 403, true],
      [{ student_uid: 'lee', parent_phone: '010-1234-5678' }, 'not_in_your_list', 403, true],
      [{ student_uid: 'KIM1', parent_phone: '010-1234-5678' }, 'not_in_your_list', 403, true],
    ]) {
      x = await post(bd);
      ok(x.out.status === st && x.out.body.error === err && !x.log.some(l => l[0] === 'save'), 'G 저장 거절(' + err + ') — 저장을 부르지 않는다(아이디는 대소문자까지 정확일치)', { bd, out: x.out });
      ok(x.log.some(l => l[0] === 'build') === built, 'G 저장 거절: 입력이 틀리면 목록도 안 만든다 · 목록 밖이면 목록을 보고 거절', { bd, built, log: x.log.map(l => l[0]) });
      if (x.out.body && x.out.body.message) ok(!!x.out.body.message_en, 'G 거절 문구는 한/영 둘 다(강사 화면 기본은 영어)', x.out.body);
    }
    x = await post({ student_uid: 'kim1', parent_phone: '010-1234-5678' }, { result: { ok: false, error: 'class_schedules_unavailable' } });
    ok(x.out.status === 503 && x.out.body.error === 'phone_check_unavailable' && !x.log.some(l => l[0] === 'save'), 'G 저장: 목록을 못 만들면 저장하지 않는다(503)', x.out);
    x = await post({ student_uid: 'kim1', parent_phone: '010-1234-5678' }, { result: { ok: true, complete: false, gaps: [{ uid: 'kim1' }] } });
    ok(x.out.status === 503 && x.out.body.error === 'phone_check_incomplete' && !x.log.some(l => l[0] === 'save'), 'G 저장: 번호 조회가 다 안 됐으면 막는다(이미 번호가 있는 학생을 덮을 수 있다)', x.out);
    x = await post({ student_uid: 'kim1', parent_phone: '010-1234-5678' }, { saveRes: { ok: false, reason: 'x' } });
    ok(x.out.status === 500 && x.out.body.error === 'save_failed' && x.out.body.ok === false, 'G 저장: 쓰기가 실패하면 실패라고 말한다(500)', x.out);

    // G-4 진짜 정본으로 끝에서 끝 — 남의 학생·이미 번호 있는 학생에게 못 넣고, 넣은 학생은 목록에서 빠진다
    HC.clearHolidayClosureCache();
    const raw = buildWorld(rng(5), 0);
    const nowI = Date.UTC(2026, 9, 28, 3, 0);   // 10/28 12:00 KST
    const insI = raw.prepare('INSERT INTO class_schedules (id,user_id,student_name,day_of_week,scheduled_date,start_time,status,teacher_id,created_at) VALUES (?,?,?,?,?,?,?,?,1)');
    insI.run(1, 'mine1', '내학생', null, '2026-10-29', '16:00', 'active', '22');
    insI.run(2, 'other1', '남의학생', null, '2026-10-29', '16:00', 'active', '7');
    insI.run(3, 'mine2', '번호있음', null, '2026-10-29', '17:00', 'active', 'mangoi_018');
    insI.run(4, 'mine3', '짧은번호', null, '2026-10-30', '16:00', 'active', '22');
    raw.prepare('INSERT INTO students_erp VALUES (?,?,?,?)').run('mine2', null, null, '010-5555-6666');
    raw.prepare('INSERT INTO students_erp VALUES (?,?,?,?)').run('mine3', '010123456', null, null);
    raw.prepare('INSERT INTO student_retention VALUES (?,?)').run('mine1', '010-7777-8888');
    const envI = { DB: d1(raw, {}), SOLAPI_API_KEY: 'k', SOLAPI_API_SECRET: 's' };
    const fI = mkPm({ build: (env, o) => PG.buildPhoneGaps(env, Object.assign({ now: nowI }, o)), save: SO.setOverridePhones });
    const ov = (u) => raw.prepare('SELECT parent_phone, student_phone, phone_by FROM student_erp_override WHERE user_id = ?').get(u) || null;
    const runI = async (q, body) => {
      try { return await fI(new URL('https://x/api/teacher/portal?' + q), { json: async () => body }, envI, { username: 'mangoi_018' }, ['22'], false, false, q.includes('phone_save'), true); }
      catch (e) { return { status: -1, body: { threw: e && e.message } }; }
    };
    const dg = (v) => String(v || '').replace(/[^0-9]/g, '');
    let y = await runI('part=phone_gaps&days=7');
    const u0 = ((y.body && y.body.gaps) || []).map(g => g.uid).sort();
    ok(y.status === 200 && JSON.stringify(u0) === JSON.stringify(['mine1', 'mine3']), 'G 끝에서 끝: 목록에는 «내 수업» 의 번호 없는·짧은 학생만(남의 학생·번호 있는 학생은 없다)', u0);
    ok(((y.body && y.body.gaps) || []).every(g => g.hint_phone === '') && y.body.scope === 'teacher', 'G 끝에서 끝: 이탈위험 표에 번호가 있어도 강사에게는 참고 번호를 안 보인다', y.body && y.body.gaps);
    y = await runI('part=phone_save', { student_uid: 'other1', parent_phone: '010-1234-5678' });
    ok(y.status === 403 && ov('other1') === null, 'G 끝에서 끝: 남의 수업 학생에게는 못 넣는다(아무것도 안 적힘)', y);
    y = await runI('part=phone_save', { student_uid: 'mine2', student_phone: '010-1234-5678' });
    ok(y.status === 403 && ov('mine2') === null, 'G 끝에서 끝: 이미 문자가 갈 번호가 있는 학생에게는 못 넣는다', y);
    y = await runI('part=phone_save', { student_uid: 'mine1', parent_phone: '010-2222-3333' });
    const o1 = ov('mine1');
    ok(y.status === 200 && o1 && dg(o1.parent_phone) === '01022223333' && o1.student_phone == null && o1.phone_by === 'teacher:mangoi_018', 'G 끝에서 끝: 내 학생에게는 들어간다(받는 자리=student_erp_override · 넣은 칸만 · 누가)', { y, o1 });
    ok(raw.prepare("SELECT COUNT(*) AS n FROM students_erp WHERE user_id = 'mine1'").get().n === 0, 'G 끝에서 끝: 명부(students_erp)는 건드리지 않는다');
    ok(dg((await NC.phonesForStudent(envI, 'mine1')).parent) === '01022223333', 'G 끝에서 끝: 발송 정본이 넣은 번호를 쓴다');
    y = await runI('part=phone_gaps&days=7');
    ok(y.status === 200 && !y.body.gaps.some(g => g.uid === 'mine1'), 'G 끝에서 끝: 다시 불러오면 그 학생이 목록에서 빠진다', y.body && y.body.gaps);
    y = await runI('part=phone_save', { student_uid: 'mine1', parent_phone: '010-9999-0000' });
    ok(y.status === 403 && dg((ov('mine1') || {}).parent_phone) === '01022223333', 'G 끝에서 끝: 한 번 넣은 뒤에는 강사가 그 번호를 바꾸지 못한다(목록에서 빠졌으므로)', y);
    y = await runI('part=phone_save', { student_uid: 'mine3', student_phone: '010-1234-5678' });
    ok(y.status === 200 && dg((await NC.phonesForStudent(envI, 'mine3')).student) === '01012345678', 'G 끝에서 끝: 짧은 번호(9자리) 학생에게는 쓸 수 있는 번호를 넣을 수 있다', y);
  }

  // G-5 공용 스크립트 — 강사 모드(data-pg-mode="teacher")에서 무엇을 부르고 무엇을 그리나
  {
    const js = rd(process.env.PG_SRC_ADM_JS || resolve(PUB, 'js/adm-phone-gaps.js'));
    const mk = (modeAttr, role) => {
      const sec = { open: false, getAttribute: (k) => (k === 'data-pg-mode' ? modeAttr : null), addEventListener() {}, toggled: [], classList: { toggle: (c, v) => sec.toggled.push([c, v]) } };
      const flashEl = { textContent: '', style: { display: 'none' }, attrs: {}, setAttribute(k, v) { this.attrs[k] = String(v); } };
      const bodyEl = { innerHTML: '', querySelectorAll: () => [] };
      const doc = { readyState: 'complete', documentElement: { lang: 'ko' }, addEventListener() {},
        getElementById: (id) => (id === 'sm-phone-gaps' ? sec : id === 'pg-body' ? bodyEl : id === 'pg-flash' ? flashEl : null) };
      const win = { addEventListener() {}, __ADM_ME: role ? { role } : undefined };
      const ctx = vm.createContext({ window: win, document: doc, localStorage: { getItem: () => null, setItem() {} }, setTimeout, clearTimeout, console });
      try { vm.runInContext(js, ctx); } catch (e) { ok(false, 'G 화면 스크립트가 실행된다', e && e.message); }
      return { ctx, P: ctx.window.__pg, sec, bodyEl, flashEl };
    };
    const T1 = mk('teacher', 'teacher'), A1 = mk(null, 'teacher');
    ok(!!(T1.P && T1.P.mode && T1.P.listUrl), '전제: 화면 스크립트가 mode·listUrl 을 내보냈다');
    if (T1.P && A1.P) {
      ok(T1.P.mode() === 'teacher' && A1.P.mode() === 'admin', 'G 모드는 카드의 data-pg-mode 로만 정한다(역할을 짐작하지 않는다)', [T1.P.mode(), A1.P.mode()]);
      ok(T1.P.listUrl(7) === '/api/teacher/portal?part=phone_gaps&days=7' && A1.P.listUrl(14) === '/api/admin/student/phone-gaps?days=14', 'G 목록 주소: 강사=포털 · 관리자=예전 그대로(짝)', [T1.P.listUrl(7), A1.P.listUrl(14)]);
      ok(T1.sec.toggled.length === 0 && A1.sec.toggled.some(([c, v]) => c === 'rbac-hide' && v === true), 'G 강사 카드는 역할로 감추지 않는다 · 관리자 화면 카드는 강사에게 감춘다(짝)', [T1.sec.toggled, A1.sec.toggled]);
      // 그리기 — 강사 모드는 학생 상세 링크를 안 그린다(강사가 못 여는 화면)
      const data = { ok: true, scope: 'teacher', days: 7, from: '2026-10-28', to: '2026-11-03', students: 2, reachable: 1, complete: true, sms_mode: 'real', reminder_enabled: true, hint_complete: true,
        gaps: [{ uid: 'kim1', name: '김', status: 'none', short_len: 0, next_date: '2026-10-29', next_time: '16:00', classes: 1, hint_phone: '' }] };
      for (const W of [T1, A1]) { W.P._state.data = data; try { W.P.render(); } catch (e) { ok(false, 'G render 가 던지지 않는다', e && e.message); } }
      ok(T1.bodyEl.innerHTML.includes('kim1') && !/\/admin\/student\.html/.test(T1.bodyEl.innerHTML), 'G 강사 모드 줄에는 학생 상세(관리자 화면) 링크가 없다', T1.bodyEl.innerHTML.slice(0, 300));
      ok(/\/admin\/student\.html\?uid=kim1/.test(A1.bodyEl.innerHTML), 'G 짝: 관리자 모드 줄에는 학생 상세 링크가 그대로 있다', A1.bodyEl.innerHTML.slice(0, 300));
      ok(/«내» 수업/.test(T1.P.summaryLines(data)[0]) && !/«내»/.test(T1.P.summaryLines(Object.assign({}, data, { scope: 'all' }))[0]), 'G 요약: 강사판은 «내» 수업이라고 말한다(전체판은 그대로 — 짝)');
      const warn = (d) => T1.P.summaryLines(d).some(t => /강사 명부와 확실히 연결/.test(t));
      ok(warn(Object.assign({}, data, { identity_unlinked: true })) && warn(Object.assign({}, data, { identity_ambiguous: true })), 'G 요약: 계정이 강사 명부와 안 이어졌으면 «다 못 찾았을 수 있다» 고 말한다(0명이 «다 됐다» 가 아니다)');
      ok(!warn(data) && !warn(Object.assign({}, data, { scope: 'all', identity_unlinked: true })), 'G 요약: 이어져 있으면·전체판이면 그 경고가 없다(짝)');
      const emptyD = Object.assign({}, data, { students: 0, reachable: 0, gaps: [] });
      T1.P._state.data = emptyD; T1.P.render();
      ok(/«내» 수업이 없습니다/.test(T1.bodyEl.innerHTML), 'G 빈 목록: «내 수업이 없다» 고 말한다', T1.bodyEl.innerHTML.slice(0, 200));
      const red = T1.P.afterReload({ ok: true, kept: false, roster: null }, { ok: true, gaps: [] }, 'kim1');
      ok(red && red.flash && /본사/.test(red.flash.ko) && !/학생 상세/.test(red.flash.ko) && /head office/i.test(red.flash.en), 'G 강사 모드는 «학생 상세에서 한 번 더» 대신 «본사에 알리기» 로 말한다(강사가 못 여는 화면으로 보내지 않는다)', red);
      // 403 — 두 말을 다 준 거절만 서버 문구를 그린다(한국어만 온 문구를 영어 화면에 그리지 않는다)
      const load403 = async (W, body) => {
        W.P._state.data = null; W.P._state.loadedOnce = false;
        W.ctx.fetch = async () => ({ ok: false, status: 403, json: async () => body });
        try { await W.P.load(); } catch (e) { /* 아래 검사가 실패한다 */ }
        delete W.ctx.fetch;
        return (W.P._state.data && W.P._state.data.__err) || null;
      };
      let er = await load403(T1, { ok: false, error: 'not_a_teacher', message: '강사 또는 본사 계정만…', message_en: 'This page is for teacher or head-office accounts only.' });
      ok(er && /teacher or head-office/.test(er.en) && /강사 또는 본사/.test(er.ko), 'G 403: 서버가 두 말을 다 주면 그 문구를 그린다', er);
      er = await load403(T1, { ok: false, error: 'forbidden_scope', message: '지사 계정은 …' });
      ok(er && !/지사 계정/.test(er.en) && /This account cannot see this list/.test(er.en), 'G 403: 한국어만 온 문구는 영어 화면에 그리지 않는다(강사 모드 기본 문구)', er);
      er = await load403(A1, { ok: false, error: 'forbidden_scope', message: '지사 계정은 …' });
      ok(er && /Only HQ accounts/.test(er.en), 'G 짝: 관리자 모드 기본 문구는 예전 그대로', er);
      // 저장 — 강사 모드는 포털 POST, 관리자 PATCH 를 부르지 않는다
      const sent = [];
      T1.ctx.fetch = async (u, o) => { sent.push({ u, method: (o && o.method) || 'GET', body: o && o.body }); return { ok: true, status: 200, json: async () => (o && o.method === 'POST' ? { ok: true, phone_kept: true, roster_updated: null } : Object.assign({}, data, { gaps: [] })) }; };
      const els = { par: { value: '010-1234-5678' }, stu: { value: '' }, msg: { textContent: '' }, btn: { disabled: false } };
      const tr = { getAttribute: (k) => (k === 'data-uid' ? 'kim1' : null), querySelector: (q) => (
        q === '.pg-in[data-role="parent"]' ? els.par : q === '.pg-in[data-role="student"]' ? els.stu : q === '.pg-msg' ? els.msg : q === '.pg-save' ? els.btn : null) };
      try { await Promise.race([T1.P.save(tr), new Promise((r) => setTimeout(r, 2000))]); } catch (e) { ok(false, 'G 저장이 던지지 않는다', e && e.message); }
      delete T1.ctx.fetch;
      const ps = sent.find(s => s.method === 'POST');
      ok(ps && ps.u === '/api/teacher/portal?part=phone_save' && JSON.stringify(JSON.parse(ps.body)) === JSON.stringify({ student_uid: 'kim1', parent_phone: '010-1234-5678' }), 'G 저장: 강사 모드는 포털 POST 로 «아이디 + 넣은 칸만» 보낸다', sent);
      ok(!sent.some(s => /\/api\/admin\//.test(s.u) || s.method === 'PATCH'), 'G 저장: 강사 모드는 관리자 경로·PATCH 를 부르지 않는다', sent);
      ok(sent.some(s => s.method === 'GET' && /part=phone_gaps/.test(s.u)) && /✅/.test(T1.flashEl.textContent), 'G 저장 뒤 강사 목록을 다시 불러 확인하고 ✅ 를 띄운다', { sent, flash: T1.flashEl.textContent });
    }
  }

  // G-6 teacher.html — 펼칠 때만 받는다 · 같은 번호 · 카드·id · 언어
  {
    const th = rd(process.env.PG_SRC_TEACHER_HTML || resolve(PUB, 'teacher.html'));
    const ah = rd(resolve(PUB, 'admin.html'));
    const mh = rd(resolve(PUB, 'manager.html'));
    const js = rd(process.env.PG_SRC_ADM_JS || resolve(PUB, 'js/adm-phone-gaps.js'));
    const jsNoCmt = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const { deadAt, commentsBalanced } = await import('./helpers/live-code.mjs');
    ok(!/<script[^>]*\ssrc=/.test(th), 'G teacher.html 에는 <script src> 가 하나도 없다(계약 1번 — 첫 화면 외부 리소스 0개)');
    const av = (ah.match(/\/js\/adm-phone-gaps\.js\?v=(\d+)/) || [])[1];
    const tv = [...th.matchAll(/\/js\/adm-phone-gaps\.js\?v=(\d+)/g)].map(m => m[1]);
    const mv = [...mh.matchAll(/\/js\/adm-phone-gaps\.js\?v=(\d+)/g)].map(m => m[1]);
    ok(av && tv.length === 1 && tv[0] === av && mv[0] === av, 'G 강사 로더의 ?v= 가 admin.html·manager.html 과 같은 번호', { admin: av, teacher: tv, manager: mv });
    const cAt = th.indexOf('<details class="card mycard" id="sm-phone-gaps"');
    const cOpen = cAt >= 0 ? th.slice(cAt, th.indexOf('>', cAt) + 1) : '';
    const card = cAt >= 0 ? th.slice(cAt, th.indexOf('</details>', cAt)) : '';
    ok(/data-pg-mode="teacher"/.test(cOpen) && /ontoggle="if\(this\.open\)loadPhoneGaps\(\)"/.test(cOpen), 'G 카드는 강사 모드 표시를 달고 펼칠 때 로더를 부른다', cOpen);
    const calls = [];
    for (let i = th.indexOf('loadPhoneGaps('); i >= 0; i = th.indexOf('loadPhoneGaps(', i + 1)) {
      const inHtmlCmt = th.lastIndexOf('<!--', i) > th.lastIndexOf('-->', i);
      const sAt = th.lastIndexOf('<script', i), sEnd = th.lastIndexOf('</script>', i);
      const inJsCmt = sAt > sEnd ? deadAt(th, i, sAt) !== '' : false;
      if (!inHtmlCmt && !inJsCmt) calls.push(th.slice(Math.max(0, i - 40), i + 16).replace(/\s+/g, ' '));
    }
    ok(calls.length === 1 && calls[0].includes('ontoggle="if(this.open)loadPhoneGaps()'), 'G 로더를 부르는 살아 있는 자리는 카드의 ontoggle 하나뿐(화면을 열 때 받지 않는다)', calls);
    const qb = (th.match(/<button[^>]*onclick="openCard\('sm-phone-gaps'\)"[^>]*>/) || [''])[0];
    ok(!!qb && /data-ko="📵 번호 없는 학생"/.test(qb), 'G 위쪽 바로가기 단추가 그 카드를 연다', qb);
    const usedIds = [...new Set([...jsNoCmt.matchAll(/\$\('([a-z0-9-]+)'\)/g)].map(m => m[1]))];
    ok(usedIds.length >= 5, 'G (전제) 스크립트가 찾는 id 목록을 소스에서 읽었다', usedIds);
    for (const id of usedIds) ok(id === 'sm-phone-gaps' ? cAt >= 0 : card.includes('id="' + id + '"'), 'G 강사 카드 안에 스크립트가 찾는 요소가 있다', id);
    for (const id of ['pg-body', 'pg-count', 'pg-flash']) {
      const tag = (card.match(new RegExp('<[^>]*id="' + id + '"[^>]*>')) || [''])[0];
      ok(tag && !/data-(en|ko)=/.test(tag), 'G 그려 넣는 그릇에는 data-en/data-ko 를 달지 않는다(applyLang 이 textContent 를 통째로 갈아끼운다)', { id, tag });
    }
    ok(/html\[data-t="dark"\] #pg-flash\{color:[^}]*!important\}/.test(th) && /html\[data-t="dark"\] #pg-flash\[data-warn="1"\]\{color:[^}]*!important\}/.test(th), 'G 어두운 화면에서 알림 글자색을 덮는다');
    // applyLang 이 (불러온 목록이 있으면) 다시 그린다 — 이 화면은 mangoi:lang-changed 를 안 쏜다
    const alBody = braceBody(th, th.indexOf('function applyLang(){'));
    const rIdx = alBody.indexOf('window.__pg.render()');
    ok(rIdx > 0 && deadAt(alBody, rIdx, 0) === '', 'G applyLang 이 공용 스크립트의 render 를 부른다(언어를 바꾸면 줄도 바뀐다)');
    // 로더 실행 — 그 <script> 를 통째로 오려 가짜 window·document 로 돌린다
    const ldAt = th.indexOf('window.loadPhoneGaps = function');
    const sOpen = th.lastIndexOf('<script>', ldAt), sClose = th.indexOf('</script>', ldAt);
    const ldSrc = (ldAt > 0 && sOpen > 0 && sClose > ldAt) ? th.slice(sOpen + '<script>'.length, sClose) : '';
    ok(!!ldSrc && commentsBalanced(ldSrc) && deadAt(th, ldAt, sOpen) === '', 'G (전제) 강사 로더를 오려 냈고 살아 있다');
    const seen = (h) => String(h).replace(/<[^>]*>/g, '');
    const world = (lang) => {
      const scripts = [], body = { innerHTML: '' }, sec = { open: true };
      const doc = { documentElement: { lang }, getElementById: (id) => (id === 'pg-body' ? body : id === 'sm-phone-gaps' ? sec : null),
        createElement: () => ({ src: '', onload: null, onerror: null, parentNode: { removeChild() {} } }), head: { appendChild: (s) => scripts.push(s) } };
      const win = {};
      try { new Function('window', 'document', ldSrc)(win, doc); } catch (e) { ok(false, 'G 강사 로더가 돌아간다', String(e)); }
      const stub = (st) => ({ __loaded: true, _state: st, n: 0, load() { this.n++; } });
      return { run: () => { try { win.loadPhoneGaps(); } catch (e) { ok(false, 'G 로더 호출이 던지지 않는다', String(e)); } }, scripts, body, sec, win, stub };
    };
    for (const lang of ['en', 'ko']) {
      const w = world(lang);
      w.run(); w.run();
      ok(w.scripts.length === 1 && w.scripts[0].src === '/js/adm-phone-gaps.js?v=' + av, 'G 연타해도 한 번만 받고, admin 과 같은 주소를 받는다', w.scripts.map(s => s.src));
      const en = lang === 'en';
      ok(seen(w.body.innerHTML).includes(en ? 'Loading' : '불러오는 중') && !seen(w.body.innerHTML).includes(en ? '불러오는 중' : 'Loading'), 'G 받는 동안 «불러오는 중» 을 그 화면 언어(<html lang>)로 말한다', { lang, html: w.body.innerHTML });
      w.win.__pg = w.stub({ loadedOnce: false, busy: null });
      try { w.scripts[0] && w.scripts[0].onload(); } catch (e) { ok(false, 'G onload 가 던지지 않는다', String(e)); }
      ok(w.win.__pg.n === 1, 'G 도착했을 때 카드가 열려 있으면 목록을 부른다', w.win.__pg.n);
    }
    for (const lang of ['en', 'ko']) {
      const w = world(lang);
      w.run();
      try { w.scripts[0] && w.scripts[0].onerror(); } catch (e) { ok(false, 'G onerror 가 던지지 않는다', String(e)); }
      const en = lang === 'en';
      ok(seen(w.body.innerHTML).includes(en ? 'Could not load this panel' : '이 칸을 불러오지 못했습니다'), 'G 못 받으면 그 사실을 그 화면 언어로 말한다', { lang, html: w.body.innerHTML });
      w.run();
      ok(w.scripts.length === 2, 'G 못 받은 뒤 다시 펼치면 다시 받는다', w.scripts.length);
    }
    for (const [st, open, want, why] of [
      [{ loadedOnce: true, busy: null }, true, 0, '이미 불러왔으면 다시 안 부른다'],
      [{ loadedOnce: false, busy: {} }, true, 0, '불러오는 중이면 겹쳐 부르지 않는다'],
      [{ loadedOnce: false, busy: null }, false, 0, '닫혀 있으면 부르지 않는다'],
    ]) {
      const w = world('en');
      w.run(); w.sec.open = open;
      w.win.__pg = w.stub(st);
      try { w.scripts[0] && w.scripts[0].onload(); } catch (e) { ok(false, 'G onload 가 던지지 않는다', String(e)); }
      ok(w.win.__pg.n === want, 'G 도착했을 때: ' + why, { st, open, n: w.win.__pg.n });
    }
    {
      const w = world('en');
      w.win.__pg = w.stub({ loadedOnce: false, busy: null });
      w.run();
      ok(w.scripts.length === 0 && w.win.__pg.n === 0, 'G 이미 받아 둔 뒤에는 다시 받지도 부르지도 않는다(그 스크립트의 toggle 이 부른다)', { n: w.win.__pg.n, scripts: w.scripts.length });
    }
  }
  report('강사 화면', b);
}

console.warn = _warn;
console.log('\n' + '─'.repeat(60));
if (fails.size) {
  console.log('❌ 실패 규칙');
  for (const [rule, v] of fails) console.log(`  ❌ FAIL ${rule} (${v.n}회)\n     반례: ${JSON.stringify(v.ex)?.slice(0, 600)}`);
}
console.log(`결과: PASS ${PASS} / FAIL ${FAIL}`);
process.exit(FAIL ? 1 : 0);
