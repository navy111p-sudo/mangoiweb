#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   🏫 b2b_tuition_harness — 대리점 수업료(충전금 지갑) 정산

   [왜 이 검사가 있나 — 2026-10-01 사장님 지시]
     옛 mangoi.co.kr B2B 결제의 12가지 문제(충전금이 안 빠짐 · 잔액 알림 없음 · 주 1회인데
     달마다 3·4·5회 · 미리 말한 연기가 결석으로 빠짐 · 첫 달 두 달치 청구 · 로그인해야 결제 …)를
     mangoi.ai 에서 «충전금 지갑 + 20일 청구 + 자동 문자» 로 고쳤다. 돈이 걸린 계산이라
     문자열로 «함수가 있는가» 를 묻는 것으로는 아무것도 지켜지지 않는다.

   [어떻게 재나]
     ① 정본(b2b-tuition.ts)을 «그대로» 실행한다 — Node 의 타입 제거로 .ts 를 직접 import.
     ② 로더·API(b2b-tuition-load.ts)는 진짜 SQLite(node:sqlite)를 D1 모양으로 감싸
        «하루 스윕 → 청구서 → 결제 → 다시 스윕» 을 실제로 돌린다.
     ③ 배선(라우터·결제 확정 갈래·공개 링크)은 소스를 오려 내 «위치·인자» 로 본다.
     ⚠️ src 를 임시 폴더에 복사하고 상대 import 에 .ts 만 붙인다(원본은 안 건드린다).
        B2B_SRC_DIR 로 «변이된 사본» 을 가리킬 수 있다(변이시험용 — 원본을 고쳤다 되돌리지 않는다).

   [짝으로 묻는다]
     「뺀다」 옆에 「안 뺀다」, 「보낸다」 옆에 「안 보낸다」, 「싣는다」 옆에 「안 싣는다」.
     한쪽만 두면 «전부 하기» 나 «전부 안 하기» 가 통과한다.
   ═══════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = process.env.B2B_SRC_DIR || path.join(ROOT, 'cloudflare-deploy', 'src');
const PUB = path.join(ROOT, 'cloudflare-deploy', 'public');

let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log('  ✅ ' + m); }
  else { fail++; console.log('  ❌ ' + m + (extra !== undefined ? ' — ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); }
};
const section = (t) => console.log('\n' + t);

/* ── 소스 복사(.ts 확장자 붙이기) ── */
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'b2bt-'));
for (const f of fs.readdirSync(SRC_DIR)) {
  if (!f.endsWith('.ts')) continue;
  let s = fs.readFileSync(path.join(SRC_DIR, f), 'utf8');
  s = s.replace(/(from\s+['"]\.\/[A-Za-z0-9_./-]+?)(['"])/g, (m, a, b) => a.endsWith('.ts') ? m : a + '.ts' + b)
       .replace(/(import\(\s*['"]\.\/[A-Za-z0-9_./-]+?)(['"]\s*\))/g, (m, a, b) => a.endsWith('.ts') ? m : a + '.ts' + b);
  fs.writeFileSync(path.join(TMP, f), s);
}
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {} });
const imp = async (f) => import(pathToFileURL(path.join(TMP, f)).href);

const origWarn = console.warn; console.warn = () => {};   // 정본의 «못 읽음» 경고는 시나리오가 일부러 만든다

let core, load, sqlite;
try {
  core = await imp('b2b-tuition.ts');
  load = await imp('b2b-tuition-load.ts');
} catch (e) {
  console.warn = origWarn;
  console.log('❌ 정본을 불러오지 못했습니다: ' + (e && e.message));
  process.exit(1);
}
try { sqlite = await import('node:sqlite'); } catch { sqlite = null; }

/* ═══════════════════════════ A. 정본(순수 함수) ═══════════════════════════ */
section('A. 회당 단가 — 주1회(=월4회) 단가 ÷ 4 × 수업 길이 배수');
ok(core.sessionUnitPrice(60000, 20) === 15000, '20분 60,000 → 15,000');
ok(core.sessionUnitPrice(60000, 30) === 22500, '30분 → 22,500 (1.5배)');
ok(core.sessionUnitPrice(60000, 40) === 30000, '40분 → 30,000 (2배)');
ok(core.sessionUnitPrice(0, 20) === null && core.sessionUnitPrice(null, 20) === null && core.sessionUnitPrice('x', 20) === null, '단가가 없으면 null(지어내지 않음)');
ok(core.sessionUnitPrice(60000, 0) === 15000, '길이를 모르면 기본(20분)');
ok(core.sessionUnitPrice(55555, 20) % 10 === 0, '10원 단위로 내림');

section('A2. 회차 차감 판정 — 문제 ①⑤');
const U = 15000;
ok(core.chargeFor('done', U).charge === U, '완료 → 차감');
ok(core.chargeFor('student_absent', U).charge === U, '결석(연락 없음) → 차감');
ok(core.chargeFor('late_postpone', U).charge === U, '30분 안쪽 연기 → 차감');
for (const st of ['postponed', 'teacher_absent', 'holiday', 'leave', 'cancelled', 'upcoming', 'absence_hold']) {
  ok(core.chargeFor(st, U).charge === 0, `${st} → 차감 안 함`);
}
const unk = core.chargeFor('unknown', U);
ok(unk.charge === 0 && unk.hold === 'unknown_state', '미정 → 차감 안 함 + 보류 사유');
const held = core.chargeFor('student_absent', U, { fee_type: 'free', minutes_before: 120 });
ok(held.charge === 0 && held.hold === 'pending_postpone', '⑤ 30분 전 연기 신청이 대기 중이면 결석이어도 보류');
ok(core.chargeFor('student_absent', U, { fee_type: 'paid', minutes_before: 10 }).charge === U, '⑤ 짝 — 늦은 연기 신청은 보류 안 함');
ok(core.chargeFor('student_absent', U, { minutes_before: 31 }).hold === 'pending_postpone', '경계: 31분 전 → 보류');
ok(core.chargeFor('student_absent', U, { minutes_before: 30 }).charge === U, '경계: 정확히 30분 → 보류 안 함(30분 «초과»)');
ok(core.chargeFor('student_absent', U, { request_type: 'change', fee_type: 'free' }).charge === U, '«변경» 요청은 연기가 아니다 → 보류 안 함');
ok(core.chargeFor('done', null).hold === 'no_price' && core.chargeFor('done', null).charge === 0, '단가 모름 → 0 + 보류(지어내지 않음)');
ok(core.postponeIsFree(Date.parse('2026-10-08T10:00:00Z'), Date.parse('2026-10-08T09:29:00Z')).free === true, '연기 신청 31분 전 → 무료');
ok(core.postponeIsFree(Date.parse('2026-10-08T10:00:00Z'), Date.parse('2026-10-08T09:31:00Z')).free === false, '연기 신청 29분 전 → 차감');
ok(core.postponeIsFree(Date.parse('2026-10-08T10:00:00Z'), Date.parse('2026-10-08T09:30:00Z')).free === false, '경계: 정확히 30분 전 → 차감(30분 «초과» 여야 무료)');

section('A3. 요일 패턴 — 문제 ⑩ (같은 주1회라도 3·4·5회)');
const pat = core.patternOf(['2026-10-06', '2026-10-13', '2026-10-20', '2026-10-27']);
ok(/화 4회/.test(pat.ko) && /6·13·20·27일/.test(pat.ko), '「화 4회 (6·13·20·27일)」', pat.ko);
ok(core.patternOf([]).ko === '수업 없음', '수업이 없으면 「수업 없음」');

function plan(uid, name, dates, unit = U, excluded = null) {
  return { uid, name, excluded, sessions: dates.map(d => ({ date: d, minutes: 20, unit })) };
}
// 2026-11: 월요일 5번(2·9·16·23·30) · 화요일 4번 · 일요일 5번
const novMon = ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30'];
const novTue = ['2026-11-03', '2026-11-10', '2026-11-17', '2026-11-24'];

section('A4. 정기 청구서 계산 — 다음 달 − (지금 잔액 − 이번 달 남은 수업)');
const m1 = core.computeInvoice({ kind: 'monthly', month: '2026-11', students: [plan('a', '김하나', novMon), plan('b', '이둘', novTue)], balanceKrw: 50000, committedKrw: 30000 });
ok(m1.planned_krw === 9 * U, '다음 달 9회 = 135,000', m1.planned_krw);
ok(m1.credit_krw === 20000 && m1.debt_krw === 0, '월말 예상 잔액 20,000 = 남는 돈');
ok(m1.due_krw === 135000 - 20000, '청구액 = 135,000 − 20,000 = 115,000', m1.due_krw);
const m2 = core.computeInvoice({ kind: 'monthly', month: '2026-11', students: [plan('a', '김하나', novMon)], balanceKrw: 10000, committedKrw: 40000 });
ok(m2.debt_krw === 30000 && m2.due_krw === 75000 + 30000, '모자란 금액(30,000)은 더한다 → 105,000', m2.due_krw);
const m3 = core.computeInvoice({ kind: 'monthly', month: '2026-11', students: [plan('a', '김하나', novMon)], balanceKrw: 500000, committedKrw: 0 });
ok(m3.due_krw === 0, '잔액이 넉넉하면 0원 — 음수로 «돌려준다» 고 하지 않음');
const m4 = core.computeInvoice({ kind: 'monthly', month: '2026-11', students: [plan('a', '김하나', novMon), plan('x', '제외됨', novTue, U, '개인 결제')], balanceKrw: 0, committedKrw: 0 });
ok(m4.due_krw === 75000 && m4.students === 1, '청구에서 뺀 학생은 금액에 안 들어감', m4.due_krw);
ok(m4.lines.find(l => l.uid === 'x').amount === 0 && m4.lines.find(l => l.uid === 'x').excluded === '개인 결제', '뺀 학생은 줄에는 남고(이유와 함께) 금액 0');
const m5 = core.computeInvoice({ kind: 'monthly', month: '2026-11', students: [plan('a', '김하나', novMon, null)], balanceKrw: 0, committedKrw: 0 });
ok(m5.due_krw === 0 && m5.no_price_sessions === 5, '단가 모르는 수업은 0으로 세고 «몇 회» 를 알린다');
ok(m5.explain_ko.some(t => /단가가 정해지지 않은 수업 5회/.test(t)), '⚠️ 단가 없음 안내 문장');

section('A5. 설명 문장 — 문제 ⑧ «왜 이 금액인가»');
ok(m1.explain_ko[0].includes('135,000') && m1.explain_ko[1].includes('50,000') && m1.explain_ko[1].includes('30,000'), '①② 계산에 쓴 숫자가 그대로 문장에');
ok(m1.explain_ko[2].includes('115,000'), '③ 최종 금액');
ok(m1.explain_ko.some(t => /주 1회.*5·4회|주 1회.*4·5회/.test(t)), '⑩ 주1회인데 회차가 다른 이유를 말한다', m1.explain_ko);
const same = core.computeInvoice({ kind: 'monthly', month: '2026-11', students: [plan('b', '이둘', novTue), plan('c', '박셋', ['2026-11-04', '2026-11-11', '2026-11-18', '2026-11-25'])], balanceKrw: 0, committedKrw: 0 });
ok(!same.explain_ko.some(t => /주 1회/.test(t)), '⑩ 짝 — 회차가 모두 같으면 그 문장을 안 넣는다');
ok(m1.explain_ko.some(t => /연기.*차감하지 않고/.test(t)), '차감 안 하는 경우를 함께 적는다');
ok(m1.explain_en.length === m1.explain_ko.length, 'EN 문장 수 = KO 문장 수');

section('A6. 보충 청구서 — 문제 ⑪ 첫 달은 «남은 회차만큼만»');
const t1 = core.computeInvoice({ kind: 'topup', month: '2026-10', students: [], balanceKrw: 0, committedKrw: 45000 });
ok(t1.due_krw === 45000, '잔액 0 · 이번 달 남은 수업 45,000 → 45,000만', t1.due_krw);
const t2 = core.computeInvoice({ kind: 'topup', month: '2026-10', students: [], balanceKrw: 60000, committedKrw: 45000 });
ok(t2.due_krw === 0, '잔액이 충분하면 보충 0');
const t3 = core.computeInvoice({ kind: 'topup', month: '2026-10', students: [], balanceKrw: 30000, committedKrw: 45000 });
ok(t3.due_krw === 15000, '모자란 만큼만 15,000');
ok(t1.explain_ko.some(t => /다음 달 것이 아닙니다/.test(t)), '두 달치가 아님을 문장으로 말한다');

section('A7. 잔액 알림 — 문제 ②');
ok(core.balanceAlert(0, 30000) === 'empty', '잔액 0 + 앞으로 수업 → empty');
ok(core.balanceAlert(10000, 30000) === 'low', '잔액 < 앞으로 14일 → low');
ok(core.balanceAlert(50000, 30000) === 'ok', '충분 → ok');
ok(core.balanceAlert(0, 0) === 'ok', '앞으로 수업이 없으면 0원이어도 ok(겁주지 않음)');

section('A8. 자동 문자 일정 — 문제 ⑦ (20일 발행 · D-7 · D-day · D+14 · D+21)');
const inv = { kind: 'monthly', month: '2026-11', issued_on: '2026-10-20', status: 'issued', due_krw: 100000, paid_krw: 0, first_month: false };
ok(core.dueDateOf(inv) === '2026-11-01', '정기 마감 = 대상 달 1일');
ok(core.dueDateOf({ kind: 'topup', month: '2026-10', issued_on: '2026-10-08' }) === '2026-10-11', '보충 마감 = 발행 + 3일');
ok(core.reminderStepToday(inv, '2026-10-20') === 'issued', '20일 → 발행 문자');
ok(core.reminderStepToday(inv, '2026-10-25') === 'd_minus_7', '10/25 → D-7');
ok(core.reminderStepToday(inv, '2026-11-01') === 'd_day', '11/1 → D-day');
ok(core.reminderStepToday(inv, '2026-11-15') === 'd_plus_14', '11/15 → D+14');
ok(core.reminderStepToday(inv, '2026-11-22') === 'd_plus_21', '11/22 → D+21');
ok(core.reminderStepToday(inv, '2026-10-26') === null && core.reminderStepToday(inv, '2026-11-02') === null, '그 사이 날에는 안 보낸다(매일 졸라 대지 않음)');
ok(core.reminderStepToday(inv, '2026-10-25', ['d_minus_7']) === null, '이미 보낸 단계는 다시 안 보낸다');
ok(core.reminderStepToday({ ...inv, first_month: true }, '2026-11-22') === null, '첫 달은 D+21(잠금) 단계 없음 — 문자만');
ok(core.reminderStepToday({ ...inv, status: 'paid' }, '2026-11-01') === null, '완납이면 안 보낸다');
ok(core.reminderStepToday({ ...inv, paid_krw: 40000, status: 'partial' }, '2026-11-01') === 'd_day', '부분 입금은 독촉을 풀지 않는다(사장님 결정)');
ok(core.reminderStepToday({ ...inv, status: 'void' }, '2026-11-01') === null, '취소된 청구서는 안 보낸다');
ok(core.overdueLevel(inv, '2026-10-20') === 'none', '마감 12일 전 → 정상');
ok(core.overdueLevel(inv, '2026-10-28') === 'due_soon', '마감 4일 전 → 임박');
ok(core.overdueLevel(inv, '2026-11-05') === 'overdue', '마감 4일 뒤 → 연체');
ok(core.overdueLevel(inv, '2026-11-16') === 'warn', 'D+15 → 경고');
ok(core.overdueLevel(inv, '2026-11-25') === 'lock_candidate', 'D+24 → 잠금 후보');
ok(core.overdueLevel({ ...inv, first_month: true }, '2026-11-25') === 'warn', '첫 달은 잠금 후보로 올리지 않는다');
const txt = core.reminderText('issued', { ...inv, shop_name: '테스트학원' }, 'https://mangoi.ai/b2b-pay.html?t=x');
ok(txt.includes('테스트학원') && txt.includes('100,000') && txt.includes('11/1') && txt.includes('https://mangoi.ai/b2b-pay.html?t=x'), '문자에 학원·금액·마감·링크', txt);
ok(core.reminderText('d_day', { ...inv, shop_name: 'A', paid_krw: 40000 }, 'L').includes('60,000'), '부분 입금 뒤 문자는 «남은 금액»');
ok(!/[a-z0-9]{6,}@|uid/i.test(txt), '문자에 학생 아이디가 없다');

section('A9. A.i 차이 진단 — 문제 ⑧');
const rows = [{ uid: 'a', name: '김하나', items: [
  { date: '2026-10-06', state: 'done', deduct: true }, { date: '2026-10-13', state: 'student_absent', deduct: true },
  { date: '2026-10-20', state: 'postponed', deduct: false }, { date: '2026-10-27', state: 'done', deduct: true } ] },
  { uid: 'b', name: '이둘', items: [{ date: '2026-10-07', state: 'done', deduct: true }, { date: '2026-10-14', state: 'teacher_absent', deduct: false }] }];
const dg = core.diagnoseCounts(rows, { a: 2, b: 2 });
const da = dg.find(r => r.uid === 'a'), db = dg.find(r => r.uid === 'b');
ok(da.ours === 3 && da.diff === 1 && da.reasons_ko.some(t => t.includes('10/13') && /결석/.test(t)), '우리가 더 셌다 → 그 날(10/13 결석)을 짚는다', da.reasons_ko);
ok(db.diff === -1 && db.reasons_ko.some(t => t.includes('10/14') && /강사 결석/.test(t)), '학원이 더 셌다 → 강사 결석 날을 짚는다', db.reasons_ko);
const dsame = core.diagnoseCounts(rows, { a: 3 });
ok(dsame.find(r => r.uid === 'a').reasons_ko.length === 0, '숫자가 같으면 아무 말도 안 한다(지어내지 않음)');
ok(dsame.find(r => r.uid === 'b').theirs === null, '학원이 안 적은 학생은 «모름»(0 으로 단정 안 함)');
const pc = core.parseTheirCounts('김하나 3\n이 둘: 2회\n없는사람 4\n쓰레기줄', [{ uid: 'a', name: '김하나' }, { uid: 'b', name: '이둘' }]);
ok(pc.counts.a === 3 && pc.counts.b === 2, '「이름 횟수」를 읽는다(띄어쓰기·콜론·회 허용)', pc);
ok(pc.unmatched.length === 2, '모르는 이름·형식 오류는 버리지 않고 «못 맞춤» 으로 돌려준다');
const dup = core.parseTheirCounts('김민서 4', [{ uid: 'x1', name: '김민서' }, { uid: 'x2', name: '김민서' }]);
ok(Object.keys(dup.counts).length === 0 && dup.unmatched.length === 1, '동명이인(후보 둘)이면 붙이지 않는다');

section('A10. 날짜 도우미');
ok(core.monthAdd('2026-12', 1) === '2027-01' && core.monthAdd('2026-01', -1) === '2025-12', 'monthAdd 연도 넘김');
ok(core.isValidMonth('2026-10') && !core.isValidMonth('2026-13') && !core.isValidMonth('2026-1') && !core.isValidMonth(null), 'isValidMonth');
ok(core.lastDayOf('2026-02') === '2026-02-28' && core.lastDayOf('2028-02') === '2028-02-29', 'lastDayOf 윤년');
ok(core.daysBetween('2026-10-25', '2026-11-01') === 7, 'daysBetween');

/* ═══════════════════════════ B. 실제 SQLite 로 하루 스윕 ═══════════════════════════ */
function makeD1(db) {
  const conv = (a) => a.map(v => v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => { const r = db.prepare(sql).get(...conv(args)); return r ? { ...r } : null; },
    all: async () => ({ results: db.prepare(sql).all(...conv(args)).map(r => ({ ...r })) }),
    run: async () => { const r = db.prepare(sql).run(...conv(args)); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
  });
  return { prepare: (sql) => stmt(sql), exec: async (sql) => { db.exec(sql); return { count: 1 }; }, batch: async (arr) => Promise.all(arr.map(s => s.run())) };
}
const KSTms = (ymdhm) => Date.parse(ymdhm.replace(' ', 'T') + ':00+09:00');
const dow = (ymd) => new Date(ymd + 'T00:00:00Z').getUTCDay();

if (!sqlite) {
  console.log('\n⏭ node:sqlite 가 없어 B·C 절을 건너뜁니다(정본 A 절만 확인)');
} else {
  section('B. 하루 스윕 — 실제 SQLite 위에서 «켜기 → 차감 → 청구서 → 결제 → 다시 스윕»');
  const raw = new sqlite.DatabaseSync(':memory:');
  const DB = makeD1(raw);
  raw.exec(`
    CREATE TABLE class_schedules (id INTEGER PRIMARY KEY, user_id TEXT, student_name TEXT, teacher_id TEXT, day_of_week TEXT, start_time TEXT, duration_min INTEGER, scheduled_date TEXT, status TEXT DEFAULT 'active', source TEXT, created_at INTEGER, starts_on TEXT);
    CREATE TABLE students_erp (user_id TEXT PRIMARY KEY, korean_name TEXT, shop_name TEXT);
    CREATE TABLE attendance (id INTEGER PRIMARY KEY, room_id TEXT, role TEXT, user_id TEXT, account_uid TEXT, joined_at INTEGER, date TEXT, status TEXT);
    CREATE TABLE class_no_show (id INTEGER PRIMARY KEY, room_id TEXT, schedule_id INTEGER, missing_role TEXT, teacher_name TEXT, student_name TEXT, created_at INTEGER);
    CREATE TABLE enroll_holidays (day TEXT PRIMARY KEY);
    CREATE TABLE agency_pricing (shop_name TEXT PRIMARY KEY, weekly1_price INTEGER);
    CREATE TABLE centers (id INTEGER PRIMARY KEY, name TEXT, phone TEXT);
  `);
  const SHOP = '테스트학원';
  raw.prepare(`INSERT INTO agency_pricing VALUES (?, 60000)`).run(SHOP);
  raw.prepare(`INSERT INTO centers (name, phone) VALUES (?, '010-1234-5678')`).run(SHOP);
  // 학생: 화 20분(kim) · 수 30분(lee) · 카페24 미러 목(c24) · 이름 칸에 아이디가 든 학생(abc123)
  const S = [['kim01', '김하나'], ['lee02', '이둘'], ['c24kid', '카페이'], ['abc123', 'abc123']];
  for (const [u, n] of S) raw.prepare(`INSERT INTO students_erp VALUES (?,?,?)`).run(u, n, SHOP);
  raw.prepare(`INSERT INTO students_erp VALUES ('other9','남의학생','다른학원')`).run();
  const ins = raw.prepare(`INSERT INTO class_schedules (id,user_id,student_name,day_of_week,start_time,duration_min,source,status) VALUES (?,?,?,?,?,?,?, 'active')`);
  ins.run(101, 'kim01', '김하나', '2', '16:00', 20, 'adm-enroll:1');
  ins.run(102, 'lee02', '이둘', '3', '17:00', 30, 'adm-enroll:2');
  ins.run(103, 'c24kid', '카페이', '4', '18:00', 20, 'c24-mirror');
  ins.run(104, 'abc123', 'abc123', '5', '15:00', 20, 'adm-enroll:3');
  ins.run(201, 'other9', '남의학생', '2', '16:00', 20, 'adm-enroll:9');
  // 날짜 지정 보강 1회(10/2 금) — 나중에 «그 하루» 를 취소해 본다
  raw.prepare(`INSERT INTO class_schedules (id,user_id,student_name,start_time,duration_min,scheduled_date,source,status) VALUES (105,'kim01','김하나','19:00',20,'2026-10-02','adm-enroll:1','active')`).run();
  raw.prepare(`INSERT INTO attendance (room_id, role, user_id, account_uid, joined_at, date, status) VALUES ('class-105-20261002', 'student', 'u_dev', 'kim01', ?, '2026-10-02', 'present')`).run(KSTms('2026-10-02 19:01'));

  const env = { DB, TOSS_SECRET_KEY: '' };
  // 켜기: 2026-10-01 · 오늘은 10/08(목) 10:00
  raw.exec(`CREATE TABLE IF NOT EXISTS b2b_tuition_shops (shop_name TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0, enabled_on TEXT, include_c24 INTEGER NOT NULL DEFAULT 0, phone TEXT, link_token TEXT, autopay INTEGER NOT NULL DEFAULT 0, updated_by TEXT, updated_at INTEGER)`);
  raw.prepare(`INSERT INTO b2b_tuition_shops (shop_name, enabled, enabled_on) VALUES (?, 1, '2026-10-01')`).run(SHOP);
  // 10/06(화) kim 출석 · 10/07(수) lee 노쇼(학생) · 9/29(화, 켜기 전) kim 출석
  raw.prepare(`INSERT INTO attendance (room_id, role, user_id, account_uid, joined_at, date, status) VALUES (?, 'student', 'u_dev', 'kim01', ?, '2026-10-06', 'present')`).run('class-101-20261006', KSTms('2026-10-06 16:01'));
  raw.prepare(`INSERT INTO attendance (room_id, role, user_id, account_uid, joined_at, date, status) VALUES (?, 'student', 'u_dev', 'kim01', ?, '2026-09-29', 'present')`).run('class-101-20260929', KSTms('2026-09-29 16:01'));
  raw.prepare(`INSERT INTO class_no_show (room_id, schedule_id, missing_role, created_at) VALUES ('class-102-20261007', 102, 'student', ?)`).run(KSTms('2026-10-07 17:10'));

  const NOW = KSTms('2026-10-08 10:00');
  const offRun = await load.runB2bTuitionDaily(env, { now: NOW });
  ok(offRun.status === 'disabled', '스위치(auto)가 꺼져 있으면 아무것도 안 한다', offRun.status);
  ok(Number(raw.prepare(`SELECT COUNT(*) AS n FROM b2b_tuition_charges`).get().n) === 0, '꺼진 동안 차감 0건');

  const dry = await load.runB2bTuitionDaily(env, { now: NOW, dry: true });
  ok(dry.status === 'dry_run' && dry.report.length === 1, '미리 보기는 켜 둔 학원만 돈다(다른학원 제외)');
  ok(Number(raw.prepare(`SELECT COUNT(*) AS n FROM b2b_tuition_charges`).get().n) === 0 && Number(raw.prepare(`SELECT COUNT(*) AS n FROM b2b_tuition_invoices`).get().n) === 0, '미리 보기는 아무것도 안 쓴다');

  const r1 = await load.runB2bTuitionDaily(env, { now: NOW, force: true });
  ok(r1.status === 'ran', '실제 실행(force)', r1.status);
  const ch = raw.prepare(`SELECT uid, date, state, charge_krw FROM b2b_tuition_charges ORDER BY date`).all().map(r => ({ ...r }));
  const chKim = ch.find(r => r.uid === 'kim01' && r.date === '2026-10-06');
  const chLee = ch.find(r => r.uid === 'lee02' && r.date === '2026-10-07');
  ok(chKim && chKim.state === 'done' && chKim.charge_krw === 15000, '① 10/6 완료 → 15,000 자동 차감', chKim);
  ok(chLee && chLee.state === 'student_absent' && chLee.charge_krw === 22500, '① 10/7 결석(30분) → 22,500 차감', chLee);
  ok(!ch.some(r => r.date < '2026-10-01'), '켠 날(10/1) 이전 수업은 절대 안 뺀다(9/29 출석 있음)');
  ok(!ch.some(r => r.uid === 'c24kid'), '카페24 미러 수업은 기본으로 안 뺀다(이중 청구 방지)');
  ok(!ch.some(r => r.uid === 'other9'), '남의 학원 학생은 안 뺀다');
  const w1 = await load.walletBalance(env, SHOP);
  ok(w1.balance === -ch.reduce((a, r) => a + r.charge_krw, 0) && w1.balance < 0, '잔액 = 들어온 돈 0 − 차감 합계(음수 = 받을 돈)', w1);
  ok(ch.find(r => r.uid === 'kim01' && r.date === '2026-10-02')?.charge_krw === 15000, '날짜 지정 보강(10/2)도 차감');

  const inv1 = raw.prepare(`SELECT * FROM b2b_tuition_invoices WHERE shop_name=? ORDER BY id`).all(SHOP).map(r => ({ ...r }));
  const top = inv1.find(i => i.kind === 'topup');
  ok(top && top.status === 'issued' && top.first_month === 1, '⑪ 첫 달 보충 청구서 발행(첫 달 표시)', inv1);
  ok(!inv1.some(i => i.kind === 'monthly'), '20일 전에는 다음 달 청구서를 안 만든다');
  const calc = JSON.parse(top.calc_json);
  ok(top.due_krw === Math.max(0, calc.committed_krw - w1.balance) - (Math.max(0, calc.committed_krw - w1.balance) % 10), '보충액 = 이번 달 남은 수업 − 잔액(음수 포함)', { due: top.due_krw, committed: calc.committed_krw, bal: w1.balance });

  // 다시 돌려도 같은 것을 또 만들지 않는다(멱등)
  const r2 = await load.runB2bTuitionDaily(env, { now: NOW + 3600e3, force: true });
  ok(Number(raw.prepare(`SELECT COUNT(*) AS n FROM b2b_tuition_invoices`).get().n) === inv1.length, '두 번 돌려도 청구서가 늘지 않는다');
  ok(Number(raw.prepare(`SELECT COUNT(*) AS n FROM b2b_tuition_charges`).get().n) === ch.length, '두 번 돌려도 차감이 늘지 않는다');
  ok(!r2.report[0].actions.some(a => /차감/.test(a)), '바뀐 게 없으면 «차감 갱신» 도 없다', r2.report[0].actions);

  // 문자 스위치 꺼짐 → 기록만, 보낸 표시 없음
  ok(r1.report[0].actions.some(a => /미발송·스위치 꺼짐/.test(a)), '⑦ 문자 스위치가 꺼져 있으면 «보냈을 문자» 를 기록만', r1.report[0].actions);
  ok(String(raw.prepare(`SELECT reminders FROM b2b_tuition_invoices WHERE id=?`).get(top.id).reminders || '') === '', '안 보낸 문자는 «보냄» 으로 적지 않는다');

  section('B2. 결제 링크(로그인 없음) — 문제 ⑫③');
  const token = raw.prepare(`SELECT link_token FROM b2b_tuition_shops WHERE shop_name=?`).get(SHOP).link_token;
  ok(/^[0-9a-f]{48}$/.test(token), '링크 토큰 = 무작위 48자리');
  const call = async (p, method = 'GET', body, t = token) => {
    const u = new URL('https://mangoi.ai/api/pay/b2b/' + p + (method === 'GET' ? '?t=' + encodeURIComponent(t) : ''));
    const req = new Request(u, method === 'GET' ? { method } : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t, ...(body || {}) }) });
    const res = await load.handleB2bTuitionPublic(req, u, env);
    return { res, body: res ? await res.json() : null };
  };
  const bad = await call('view', 'GET', null, 'f'.repeat(48));
  ok(bad.res.status === 404 && bad.body.error === 'bad_link', '모르는 토큰 → 404');
  const bad2 = await call('view', 'GET', null, "' OR 1=1 --");
  ok(bad2.res.status === 404, '토큰 모양이 아니면 DB 를 묻기 전에 거절');
  raw.prepare(`INSERT INTO b2b_tuition_students (shop_name, uid, excluded, reason, updated_at) VALUES (?, 'abc123', 1, '내부메모-원장님과통화', 1)`).run(SHOP);
  const v = await call('view');
  {
    const vsx = JSON.stringify(v.body);
    ok(!/내부메모-원장님과통화/.test(vsx) && /청구 제외/.test(vsx), '공개 화면에는 «제외 사유» 원문 대신 «청구 제외» 만', vsx.match(/내부메모[^"]*/));
  }
  raw.prepare(`DELETE FROM b2b_tuition_students WHERE shop_name=? AND uid='abc123'`).run(SHOP);
  ok(v.res.status === 200 && v.body.ok === true && v.body.shop_name === SHOP, '맞는 토큰 → 그 학원 화면');
  ok(/no-store/.test(v.res.headers.get('Cache-Control') || '') && /noindex/.test(v.res.headers.get('X-Robots-Tag') || ''), '캐시 금지 + 검색 노출 금지');
  const vs = JSON.stringify(v.body);
  ok(!/kim01|lee02|abc123|c24kid/.test(vs), '⛔ 공개 화면에 학생 «아이디» 가 없다(이 서비스에서 아이디 = 로그인)', vs.match(/kim01|lee02|abc123|c24kid/));
  ok(vs.includes('김하나') && vs.includes('(이름 미등록)'), '이름은 보이고, 이름 칸에 아이디가 든 학생은 «이름 미등록» 으로');
  ok(!/남의학생/.test(vs), '남의 학원 학생은 안 보인다');
  ok(v.body.alert === 'empty' || v.body.alert === 'low', '② 잔액 부족 알림이 화면에 실린다', v.body.alert);
  ok((v.body.invoices || []).some(i => i.kind === 'topup' && Array.isArray(i.calc?.explain_ko) && i.calc.explain_ko.length > 0), '⑧ 청구서마다 «왜 이 금액인가» 문장이 실린다');
  const kimRow = v.body.current.find(s => s.name === '김하나');
  ok(kimRow && kimRow.items.some(i => i.date === '2026-10-06' && i.state === 'done' && i.charge_krw === 15000), '학생별 날짜·상태·차감액이 그대로 보인다');

  // 다른 학원 청구서로 결제 시도 → 거절
  raw.prepare(`INSERT INTO b2b_tuition_invoices (shop_name, kind, month, seq, status, due_krw, created_at) VALUES ('다른학원','topup','2026-10',1,'issued',99990,1)`).run();
  const otherId = raw.prepare(`SELECT id FROM b2b_tuition_invoices WHERE shop_name='다른학원'`).get().id;
  const co0 = await call('checkout', 'POST', { invoice_id: otherId });
  ok(co0.res.status === 404, '남의 학원 청구서는 결제 주문을 못 만든다');
  const co = await call('checkout', 'POST', { invoice_id: top.id });
  ok(co.body.ok === true && /^MGT-\d+-/.test(co.body.order_id) && co.body.amount === top.due_krw, '결제 주문 = MGT-<청구서>-… · 금액은 서버가 정한다', co.body);
  const po = raw.prepare(`SELECT program, amount, status, uid FROM payment_orders WHERE order_id=?`).get(co.body.order_id);
  ok(po && po.program === 'b2b_tuition' && po.amount === top.due_krw && po.uid === null, 'payment_orders 에 기록(학생 uid 없음)');

  section('B3. 결제 확정 — 멱등 · 부분 입금');
  const paidOk = await load.activateB2bTuitionPayment(env, co.body.order_id, top.due_krw, NOW + 7200e3);
  ok(paidOk === true, '확정 성공');
  const after = raw.prepare(`SELECT status, paid_krw FROM b2b_tuition_invoices WHERE id=?`).get(top.id);
  ok(after.status === 'paid' && after.paid_krw === top.due_krw, '청구서 = 완납');
  await load.activateB2bTuitionPayment(env, co.body.order_id, top.due_krw, NOW + 7300e3);
  ok(raw.prepare(`SELECT paid_krw FROM b2b_tuition_invoices WHERE id=?`).get(top.id).paid_krw === top.due_krw, '같은 주문이 두 번 와도 한 번만 들어간다(웹훅 재전송)');
  ok(Number(raw.prepare(`SELECT COUNT(*) AS n FROM b2b_wallet_entries WHERE ref=?`).get(co.body.order_id).n) === 1, '충전금 기록도 한 줄');
  ok((await load.activateB2bTuitionPayment(env, 'MGB-1-xx', 1000, NOW)) === false, 'MGT- 가 아닌 주문은 손대지 않는다');
  const w2 = await load.walletBalance(env, SHOP);
  ok(w2.balance === w1.balance + top.due_krw, '잔액 = 이전 + 결제액', w2);

  section('B4. 20일 — 다음 달 정기 청구서 (보충 미납분 이중 청구 없음)');
  const NOW20 = KSTms('2026-10-20 10:00');
  const r20 = await load.runB2bTuitionDaily(env, { now: NOW20, force: true });
  const mon = raw.prepare(`SELECT * FROM b2b_tuition_invoices WHERE shop_name=? AND kind='monthly'`).all(SHOP).map(r => ({ ...r }));
  ok(mon.length === 1 && mon[0].month === '2026-11', '20일 → 11월 정기 청구서 1장', mon);
  const mc = JSON.parse(mon[0].calc_json);
  const kimLine = mc.lines.find(l => l.name === '김하나'), leeLine = mc.lines.find(l => l.name === '이둘');
  ok(kimLine && kimLine.count === 4 && /화 4회/.test(kimLine.pattern_ko), '⑩ 11월 화요일 4회', kimLine && kimLine.pattern_ko);
  ok(leeLine && leeLine.count === 4 && leeLine.amount === 4 * 22500, '30분 수업 = 22,500 × 4', leeLine);
  ok(!mc.lines.some(l => l.name === '카페이'), '카페24 미러 수업은 다음 달 청구에도 없다');
  ok(r20.report[0].actions.some(a => /2026-11 청구서 발행/.test(a)), '실행 보고에 «발행» 이 남는다', r20.report[0].actions);
  const r21 = await load.runB2bTuitionDaily(env, { now: NOW20 + 86400e3, force: true });
  ok(raw.prepare(`SELECT COUNT(*) AS n FROM b2b_tuition_invoices WHERE kind='monthly' AND shop_name=?`).get(SHOP).n === 1, '그 달 정기 청구서는 하나뿐(21일에 또 안 만듦)');
  void r21;
  {
    const m0 = raw.prepare(`SELECT id, due_krw FROM b2b_tuition_invoices WHERE shop_name=? AND kind='monthly'`).get(SHOP);
    await load.activateB2bTuitionPayment(env, `MGT-${m0.id}-TEST`, m0.due_krw, NOW20 + 1);
    await load.runB2bTuitionDaily(env, { now: NOW20 + 1.5 * 86400e3, force: true });
    ok(raw.prepare(`SELECT COUNT(*) AS n FROM b2b_tuition_invoices WHERE kind='monthly' AND shop_name=?`).get(SHOP).n === 1, '정기 청구서를 낸 뒤에도 그 달 것을 새로 또 만들지 않는다');
    // 낸 뒤 11월 신규생이 들어와도 11월 정기 청구서를 또 만들지 않는다(11월에 보충 청구서로 받는다)
    raw.prepare(`INSERT INTO students_erp VALUES ('new03','새학생',?)`).run(SHOP);
    raw.prepare(`INSERT INTO class_schedules (id,user_id,student_name,day_of_week,start_time,duration_min,source,status) VALUES (106,'new03','새학생','5','16:00',40,'adm-enroll:6','active')`).run();
    await load.runB2bTuitionDaily(env, { now: NOW20 + 1.7 * 86400e3, force: true });
    ok(raw.prepare(`SELECT COUNT(*) AS n FROM b2b_tuition_invoices WHERE kind='monthly' AND shop_name=?`).get(SHOP).n === 1, '낸 뒤 신규생이 와도 그 달 정기 청구서는 하나(두 번째 청구서 없음)');
    raw.prepare(`UPDATE class_schedules SET status='cancelled' WHERE id=106`).run();
  }

  {
    const fakeSnap = { ym: '2026-10', wallet: { balance: -45000 }, committed: 0,
      next: { ok: true, students: [{ uid: 'a', name: '가', excluded: null, items: novTue.map(d => ({ date: d, start: '16:00', duration_min: 20, unit_krw: U, state: 'upcoming' })) }] } };
    const noOwed = load.nextMonthlyCalc(fakeSnap, 0), withOwed = load.nextMonthlyCalc(fakeSnap, 45000);
    ok(noOwed.due_krw === 60000 + 45000, '보충 청구서가 없으면 모자란 45,000 을 다음 달에 더한다', noOwed.due_krw);
    ok(withOwed.due_krw === 60000, '보충 청구서가 이미 그 45,000 을 받고 있으면 다음 달에 또 더하지 않는다(이중 청구 방지)', withOwed.due_krw);
    const emptyStu = { ...fakeSnap, next: { ok: true, students: [...fakeSnap.next.students, { uid: 'z', name: '수업없음', excluded: null, items: [] }] } };
    ok(!load.nextMonthlyCalc(emptyStu, 45000).lines.some(l => l.name === '수업없음'), '다음 달 수업이 없는 학생은 청구서 줄에 안 넣는다');
  }

  section('B5. 원장에서 사라진 회차 — «그 하루» 취소만 되돌린다');
  const c105 = raw.prepare(`SELECT charge_krw FROM b2b_tuition_charges WHERE uid='kim01' AND date='2026-10-02'`).get();
  ok(c105 && c105.charge_krw === 15000, '전제 — 10/2 보강은 차감돼 있었다', c105);
  raw.prepare(`UPDATE class_schedules SET status='cancelled' WHERE id=105`).run();
  raw.prepare(`UPDATE class_schedules SET status='cancelled' WHERE id=102`).run();   // 반복 수업 «끊기»(학생이 그만둠)
  await load.runB2bTuitionDaily(env, { now: NOW20 + 2 * 86400e3, force: true });
  const gone = raw.prepare(`SELECT state, charge_krw, hold FROM b2b_tuition_charges WHERE uid='kim01' AND date='2026-10-02'`).get();
  ok(gone && gone.state === 'gone' && gone.charge_krw === 0 && gone.hold === 'cancelled', '날짜 지정 수업을 취소하면 그 차감 15,000 → 0', gone);
  const leeKeep = raw.prepare(`SELECT charge_krw FROM b2b_tuition_charges WHERE uid='lee02' AND date='2026-10-07'`).get();
  ok(leeKeep && leeKeep.charge_krw === 22500, '짝 — 반복 수업을 끊어도 이미 지난 회차는 되돌리지 않는다(공짜 수업 방지)', leeKeep);
  const kimStill = raw.prepare(`SELECT charge_krw FROM b2b_tuition_charges WHERE uid='kim01' AND date='2026-10-06'`).get();
  ok(kimStill.charge_krw === 15000, '짝 — 다른 정상 차감은 그대로');
  raw.prepare(`UPDATE class_schedules SET status='active' WHERE id=102`).run();

  section('B6. 학원이 낸 연기 신청 — 문제 ⑤');
  // 10/27(화) 16:00 kim — 지금(10/22 10:00)은 한참 전 → 무료 연기
  const NOWPP = KSTms('2026-10-22 10:00');
  const realNow = Date.now; Date.now = () => NOWPP;
  try {
    const pp = await call('postpone', 'POST', { schedule_id: 101, date: '2026-10-27', reason: '가족 여행' });
    ok(pp.body.ok === true && pp.body.free === true, '30분 전 연기 신청 → 무료로 접수', pp.body);
    const scr = raw.prepare(`SELECT status, requester_role, fee_type FROM schedule_change_requests WHERE schedule_id=101 AND orig_date='2026-10-27'`).get();
    ok(scr && scr.status === 'pending' && scr.requester_role === 'agency' && scr.fee_type === 'free', '결재함에 «대리점 · 대기 · 무료» 로 들어간다', scr);
    const pp2 = await call('postpone', 'POST', { schedule_id: 101, date: '2026-10-27' });
    ok(pp2.body.already === true, '같은 수업을 두 번 신청해도 한 줄');
    const ppx = await call('postpone', 'POST', { schedule_id: 201, date: '2026-10-27' });
    ok(ppx.body.ok === false && ppx.body.error === 'not_found', '남의 학원 수업은 연기 신청 못 한다');
    const ppPast = await call('postpone', 'POST', { schedule_id: 101, date: '2026-10-06' });
    ok(ppPast.body.ok === false && ppPast.body.error === 'not_upcoming', '지난 수업은 연기 신청 못 한다');
  } finally { Date.now = realNow; }
  // 수업 시각이 지나 출석이 없으면 원래는 결석으로 빠지지만, 대기 중인 무료 연기 신청이 있으면 보류
  raw.prepare(`INSERT INTO class_no_show (room_id, schedule_id, missing_role, created_at) VALUES ('class-101-20261027', 101, 'student', ?)`).run(KSTms('2026-10-27 16:10'));
  await load.runB2bTuitionDaily(env, { now: KSTms('2026-10-28 10:00'), force: true });
  const hold = raw.prepare(`SELECT state, charge_krw, hold FROM b2b_tuition_charges WHERE uid='kim01' AND date='2026-10-27'`).get();
  ok(hold && hold.charge_krw === 0 && hold.hold === 'pending_postpone', '⑤ 결재가 아직이어도 결석으로 안 빠진다(보류)', hold);
  {
    const rn = Date.now; Date.now = () => KSTms('2026-10-28 10:30');
    const dh = await call('diagnose', 'POST', { month: '2026-10', text: '김하나 2' });
    const dsep = await call('diagnose', 'POST', { month: '2026-09', text: '김하나 0' });
    Date.now = rn;
    const k = (dh.body.rows || []).find(r => r.name === '김하나');
    ok(k && k.ours === 1 && k.reasons_ko.some(t => /10\/27/.test(t) && /연기/.test(t)), '진단 — 연기 신청으로 보류 중인 날은 «연기» 로 짚는다(결석이라 하지 않음)', k);
    const ks = (dsep.body.rows || []).find(r => r.name === '김하나');
    ok(ks && ks.ours === 0 && ks.diff === 0, '진단 — 켜기 전(9월) 수업은 «뺐다» 고 세지 않는다', ks);
  }
  raw.prepare(`UPDATE schedule_change_requests SET status='rejected' WHERE schedule_id=101 AND orig_date='2026-10-27'`).run();
  await load.runB2bTuitionDaily(env, { now: KSTms('2026-10-28 11:00'), force: true });
  const rej = raw.prepare(`SELECT charge_krw FROM b2b_tuition_charges WHERE uid='kim01' AND date='2026-10-27'`).get();
  ok(rej.charge_krw === 15000, '짝 — 본사가 반려하면 그때 결석으로 차감', rej);

  section('B7. 이의 신청 · 차이 진단');
  const realNow2 = Date.now; Date.now = () => KSTms('2026-10-28 12:00');
  const dgr = await call('diagnose', 'POST', { month: '2026-10', text: '김하나 1\n이둘 1' });
  Date.now = realNow2;
  ok(dgr.body.ok === true && Array.isArray(dgr.body.rows), '진단 결과');
  ok(!JSON.stringify(dgr.body).match(/kim01|lee02/), '진단 결과에도 아이디가 없다');
  const kimD = dgr.body.rows.find(r => r.name === '김하나');
  ok(kimD && kimD.ours === 2 && kimD.diff === 1 && kimD.reasons_ko.some(t => /10\/27/.test(t)), '우리가 더 셌으면 그 날(10/27 결석)을 짚는다 — 켜기 전·취소된 회차는 안 셈', kimD);
  const ds = await call('dispute', 'POST', { message: '10/27 은 미리 말씀드렸어요', month: '2026-10' });
  ok(ds.body.ok === true && ds.body.assignee === '장지웅 부장', '이의 신청은 장지웅 부장님께(사장님 결정)', ds.body);
  for (let i = 0; i < 12; i++) await call('dispute', 'POST', { message: 'spam ' + i });
  ok(Number(raw.prepare(`SELECT COUNT(*) AS n FROM b2b_tuition_disputes WHERE shop_name=?`).get(SHOP).n) <= 10, '링크가 새어도 하루 10건까지만(표를 못 채운다)');

  section('B8. 스위치 기본값 · 못 읽으면 «꺼짐»');
  ok((await load.getSwitch(env, 'notify')) === false && (await load.getSwitch(env, 'autopay_live')) === false && (await load.getSwitch(env, 'auto')) === false, '세 스위치 모두 기본 꺼짐');
  const brokenEnv = { DB: { prepare: () => { throw new Error('d1 down'); }, exec: async () => {} } };
  ok((await load.getSwitch(brokenEnv, 'notify')) === false, 'DB 가 흔들려도 «꺼짐»(문자·결제가 새어 나가지 않음)');
  raw.prepare(`INSERT INTO b2b_tuition_meta (k, v, at) VALUES ('notify','on',1) ON CONFLICT(k) DO UPDATE SET v='on'`).run();
  ok((await load.getSwitch(env, 'notify')) === true, '짝 — 켜면 켜진다');
  raw.prepare(`UPDATE b2b_tuition_meta SET v='off' WHERE k='notify'`).run();

  section('B9. 학원 끄기 — 꺼진 학원은 링크도 막힌다');
  raw.prepare(`UPDATE b2b_tuition_shops SET enabled=0 WHERE shop_name=?`).run(SHOP);
  const vOff = await call('view');
  ok(vOff.res.status === 404, '꺼진 학원의 링크 → 404');
  const rOff = await load.runB2bTuitionDaily(env, { now: KSTms('2026-10-29 10:00'), force: true });
  ok(rOff.report.length === 0, '꺼진 학원은 스윕 대상이 아니다');
  raw.prepare(`UPDATE b2b_tuition_shops SET enabled=1 WHERE shop_name=?`).run(SHOP);
  ok((await call('view')).res.status === 200, '짝 — 다시 켜면 같은 링크가 살아난다');

  section('B10. 월초 — 안 낸 정기 청구서와 보충 청구서가 같은 돈을 두 번 받지 않는다');
  {
    // 순수: 이번 달 남은 수업 60,000 · 잔액 0 · 같은 달 정기 청구서 미납 60,000
    const fs0 = { ym: '2026-11', wallet: { balance: 0 }, committed: 60000 };
    ok(load.topupCalc(fs0, [], 60000).due_krw === 0, '정기 청구서가 그 돈을 이미 받고 있으면 보충 청구서는 0');
    ok(load.topupCalc(fs0, [], 0).due_krw === 60000, '짝 — 정기 청구서가 없으면 모자란 60,000 을 보충으로 받는다');
    ok(load.topupCalc(fs0, [], 45000).due_krw === 15000, '짝 — 정기 청구서보다 더 모자란 15,000 은 여전히 보충으로 받는다');
    // openMonthlyOwed — 그 학원·그 달·미납(issued/partial)·monthly 만 센다
    raw.prepare(`INSERT INTO b2b_tuition_invoices (shop_name, kind, month, seq, status, due_krw, paid_krw, issued_on, calc_json, created_at, updated_at) VALUES ('딴학원','monthly','2026-11',1,'partial',50000,10000,'2026-10-20','{}',1,1),('딴학원','topup','2026-11',1,'issued',99000,0,'2026-11-01','{}',1,1),('딴학원','monthly','2026-12',1,'issued',77000,0,'2026-11-20','{}',1,1)`).run();
    ok((await load.openMonthlyOwed(env, '딴학원', '2026-11')) === 40000, '미납 = 50,000 − 10,000(보충·다른 달은 안 셈)');
    ok((await load.openMonthlyOwed(env, '없는학원', '2026-11')) === 0, '없으면 0');
    // 통합: 11월 정기 청구서를 «안 낸» 상태로 되돌리고 11/1 에 돌린다
    const m0 = raw.prepare(`SELECT id, due_krw FROM b2b_tuition_invoices WHERE shop_name=? AND kind='monthly' AND month='2026-11'`).get(SHOP);
    raw.prepare(`DELETE FROM b2b_wallet_entries WHERE ref LIKE ?`).run(`%MGT-${m0.id}-%`);
    raw.prepare(`UPDATE b2b_tuition_invoices SET status='issued', paid_krw=0 WHERE id=?`).run(m0.id);
    ok((await load.openMonthlyOwed(env, SHOP, '2026-11')) === m0.due_krw, '전제 — 11월 정기 청구서가 미납', m0);
    await load.runB2bTuitionDaily(env, { now: KSTms('2026-11-01 10:00'), force: true });
    const topNov = raw.prepare(`SELECT COALESCE(SUM(due_krw),0) AS s FROM b2b_tuition_invoices WHERE shop_name=? AND kind='topup' AND month='2026-11' AND status IN ('issued','partial')`).get(SHOP).s;
    ok(topNov < m0.due_krw / 2, '11/1 — 정기 청구서 미납분을 보충 청구서로 또 내지 않는다', { topNov, monthly: m0.due_krw });
    // 짝 — 정기 청구서를 거두면(void) 보충 청구서가 그 달을 받는다
    raw.prepare(`UPDATE b2b_tuition_invoices SET status='void' WHERE id=?`).run(m0.id);
    await load.runB2bTuitionDaily(env, { now: KSTms('2026-11-01 11:00'), force: true });
    const topNov2 = raw.prepare(`SELECT COALESCE(SUM(due_krw),0) AS s FROM b2b_tuition_invoices WHERE shop_name=? AND kind='topup' AND month='2026-11' AND status IN ('issued','partial')`).get(SHOP).s;
    ok(topNov2 > topNov, '짝 — 정기 청구서가 없으면 보충 청구서가 그 달 모자란 돈을 받는다', { topNov, topNov2 });
  }
}

/* ═══════════════════════════ C. 배선 ═══════════════════════════ */
section('C. 배선 — 라우터·결제 확정 갈래·화면');
const read = (p) => fs.readFileSync(path.join(SRC_DIR, p), 'utf8');
const apiPay = read('api-pay.ts'), aiBill = read('ai-billing.ts'), ld = read('b2b-tuition-load.ts');
{
  const iMgt = apiPay.indexOf("startsWith('MGT-')"), iMgb = apiPay.indexOf("startsWith('MGB-')");
  ok(iMgt > 0 && iMgb > 0 && iMgt < iMgb, 'activateEnrollment 의 MGT- 갈래가 MGB- 앞에 있다');
  const after = apiPay.slice(iMgt, iMgt + 300);
  ok(/activateB2bTuitionPayment\(env, orderId, amount, when\)/.test(after) && /return;/.test(after), 'MGT- 면 수업료 확정을 부르고 거기서 끝난다(개인 수강 로직으로 안 흐름)');
  const iDel = apiPay.indexOf("path.startsWith('/api/pay/b2b/')"), iEns = apiPay.indexOf('await ensurePayTable(env);\n\n  /* 🏫');
  ok(iDel > 0 && iEns > 0 && iDel > iEns, '/api/pay/b2b/* 위임이 handlePayApi 안에 있다');
  ok(/topupCalc\(snap, \[\], await openMonthlyOwed\(env, shop, snap\.ym\)\)/.test(ld), '스윕이 보충 청구서에 «같은 달 정기 청구서 미납» 을 넘긴다');
  ok(/NOT LIKE 'MGT-%'/.test(apiPay), '결제 대사가 MGT- 주문을 «수강 연결 누락» 으로 세지 않는다');
  ok(/p === 'tuition' \|\| p\.startsWith\('tuition\/'\)/.test(aiBill) && /tuitionAdminRouter\(request, env,/.test(aiBill), '관리자 /api/admin/ai-billing/tuition/* 위임');
}
{
  // 관리자 라우터: 쓰기는 전부 본사 게이트를 먼저 지난다
  for (const sub of ['overview', 'switch', 'link', 'wallet', 'student', 'invoice/void', 'run', 'dispute/answer']) {
    const i = ld.indexOf(`if (sub === '${sub}'`);
    const seg = i > 0 ? ld.slice(i, i + 220) : '';
    ok(i > 0 && /const g = await hqGate\(\); if \(g\) return g;/.test(seg), `「${sub}」 는 본사 게이트(enrollAdminHqOnly)를 먼저 지난다`);
  }
  const iShopPost = ld.indexOf("if (sub === 'shop' && method === 'POST')");
  ok(/hqGate/.test(ld.slice(iShopPost, iShopPost + 200)), '학원 설정 저장은 본사만');
  const iShopGet = ld.indexOf("if (sub === 'shop' && method === 'GET')");
  const sg = ld.slice(iShopGet, iShopGet + 500);
  ok(/scope\.type === 'agency'\) shop = String\(scope\.value/.test(sg) && /else \{ const g = await hqGate\(\)/.test(sg), '학원 화면 조회: 대리점은 «자기 학원으로 고정», 그 밖은 본사 게이트');
  ok(/withUid: scope\.type !== 'agency'/.test(sg), '대리점 로그인 화면에도 아이디를 안 싣는다');
  ok(/const dry = body\.dry !== false;/.test(ld), '실행(run)은 기본이 «미리 보기»(dry) — 명시적으로 false 여야 실제 실행');
  ok(/\^\[0-9a-f\]\{48\}\$/.test(ld), '공개 토큰은 48자리 16진수만');
  const iTokShop = ld.indexOf('async function tokenShop');
  ok(/Number\(r\.enabled\) === 1/.test(ld.slice(iTokShop, iTokShop + 500)), '꺼진 학원의 토큰은 통하지 않는다');
}
{
  const pay = fs.readFileSync(path.join(PUB, 'b2b-pay.html'), 'utf8');
  const adm = fs.readFileSync(path.join(PUB, 'admin', 'b2b-tuition.html'), 'utf8');
  ok(/name="robots" content="noindex/.test(pay) && /name="robots" content="noindex/.test(adm), '두 화면 모두 검색 노출 금지');
  ok(/\[hidden\]\{\s*display:none !important;?\s*\}/.test(adm.replace(/\s+/g, ' ').replace(/\{ /g, '{').replace(/ \}/g, '}')) || /\[hidden\]\s*\{\s*display\s*:\s*none\s*!important/.test(adm), '관리자 화면 [hidden] 이 실제로 먹는다');
  ok(/\[hidden\]\s*\{\s*display\s*:\s*none\s*!important/.test(pay), '대리점 화면 [hidden] 이 실제로 먹는다');
  ok(!/<script[^>]+src="\/admin\//.test(adm) && !/<link[^>]+href="\/admin\//.test(adm), '/admin/ 밑에 자산을 두지 않는다(로그인 게이트가 삼킨다)');
  ok(/api\/admin\/ai-billing\/tuition\//.test(adm), '관리자 화면은 tuition API 를 부른다');
  ok(/d\.ok !== true/.test(adm), '화면은 «성공이라고 말했는가»(ok === true) 로 가른다');
  const map = fs.readFileSync(path.join(PUB, 'admin', 'site-structure-map.html'), 'utf8');
  ok(map.includes('/b2b-pay.html') && map.includes('/admin/b2b-tuition.html'), '사이트 구성표에 두 화면 등록');
  const ia6 = fs.readFileSync(path.join(PUB, 'js', 'adm-ia6.js'), 'utf8');
  const iIt = ia6.indexOf("href: '/admin/b2b-tuition.html'");
  ok(iIt > 0 && /hideFrom: \['teacher', 'franchise', 'branch', 'agency'\]/.test(ia6.slice(iIt, iIt + 200)), '사이드바 항목 + 역할 감춤(서버 본사 게이트와 짝)');
}

console.warn = origWarn;
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
