// 📊 경영 지표 «분모·기간» 회귀 감시 (2026-10-13)
//
// 왜: 경영 지표가 «활동 학생 28,825명 · 미납 28,771명(99.8%) · 매출 −80.1%» 라고 말했다.
//   ① 분모가 students_erp 명부 전체 ② «결제 기록 없음» 을 «미납» 으로 셈 ③ 이번 달 13일치를
//   지난달 한 달 전체와 비교. 정본은 cloudflare-deploy/src/kpi-active.ts 하나.
//
// 방법: 정본을 타입 제거로 «실제로» 불러, 진짜 SQLite(node:sqlite) 에 그 SQL 을 돌려 답을 본다.
//   「세는 것」 옆에 「세면 안 되는 것은 안 센다」를 짝으로 둔다(짝이 없으면 «전부 세기» 도 통과).
//   KPI_SRC=<고친 사본> 으로 변이시험을 돌릴 수 있다(저장소 파일은 안 건드림).
import { readFileSync, writeFileSync, mkdtempSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.env.KPI_SRC || join(ROOT, 'cloudflare-deploy/src/kpi-active.ts');
const ADMIN_TS = join(ROOT, 'cloudflare-deploy/src/api-admin.ts');
const ADMIN_HTML = join(ROOT, 'cloudflare-deploy/public/admin.html');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; } else { fail++; console.log('❌ FAIL', name, extra !== undefined ? JSON.stringify(extra) : ''); } };

// ── ① 정본을 실제로 돌린다 ───────────────────────────────────────────────
const tmp = mkdtempSync(join(tmpdir(), 'kpi-active-'));
copyFileSync(SRC, join(tmp, 'ka.ts'));
writeFileSync(join(tmp, 'run.mjs'), `
import { DatabaseSync } from 'node:sqlite';
const m = await import('./ka.ts');
const DAY = 86400000, KST = 9*3600000;
// 2026-10-13 12:00 KST
const now = Date.UTC(2026, 9, 13, 3, 0, 0);
const kd = (ms) => new Date(ms + KST).toISOString().slice(0,10);
const db = new DatabaseSync(':memory:');
db.exec(\`
CREATE TABLE students_erp (user_id TEXT PRIMARY KEY, status TEXT, shop_name TEXT, created_at INTEGER);
CREATE TABLE class_schedules (id INTEGER PRIMARY KEY, user_id TEXT, status TEXT, scheduled_date TEXT);
CREATE TABLE attendance (id INTEGER PRIMARY KEY, user_id TEXT, account_uid TEXT, room_id TEXT, joined_at INTEGER, last_seen_at INTEGER, date TEXT, role TEXT);
CREATE TABLE student_payments (id INTEGER PRIMARY KEY, user_id TEXT, paid_at INTEGER, amount_krw INTEGER, status TEXT);
\`);
const ins = (sql, ...v) => db.prepare(sql).run(...v);
// 명부 10명 — 그중 «수업이 있는» 학생은 a1·a2·a3 셋
for (const u of ['a1','a2','a3','x1','x2','x3','x4','x5','x6','x7']) ins('INSERT INTO students_erp VALUES (?,?,?,?)', u, '정상', u === 'a2' ? 'B점' : 'A점', 0);
// a1: 수업 예약(미래 날짜)
ins('INSERT INTO class_schedules (user_id,status,scheduled_date) VALUES (?,?,?)', 'a1', 'active', kd(now + 3*DAY));
// 자리표시·취소·옛 날짜 — 활동으로 세면 안 됨
ins('INSERT INTO class_schedules (user_id,status,scheduled_date) VALUES (?,?,?)', 'lms', 'active', kd(now));
ins('INSERT INTO class_schedules (user_id,status,scheduled_date) VALUES (?,?,?)', 'x1', 'cancelled', kd(now));
ins('INSERT INTO class_schedules (user_id,status,scheduled_date) VALUES (?,?,?)', 'x2', 'active', kd(now - 60*DAY));
// a2: 카페24 예약 씨앗(어제)
ins('INSERT INTO attendance (user_id,account_uid,room_id,joined_at,last_seen_at,date,role) VALUES (?,?,?,?,?,?,?)', 'a2', null, 'c24-1', now - DAY, 0, kd(now - DAY), 'student');
// a3: 실제 화상방 접속(3일 전) — user_id 는 기기번호
ins('INSERT INTO attendance (user_id,account_uid,room_id,joined_at,last_seen_at,date,role) VALUES (?,?,?,?,?,?,?)', 'u_dev1', 'a3', 'class-9-x', now - 3*DAY, now - 3*DAY, kd(now - 3*DAY), 'student');
// x3: 접속은 했지만 last_seen_at 0(실접속 아님) + c24 방 아님 → 활동 아님
ins('INSERT INTO attendance (user_id,account_uid,room_id,joined_at,last_seen_at,date,role) VALUES (?,?,?,?,?,?,?)', 'u_dev2', 'x3', 'class-1-x', now - 2*DAY, 0, kd(now - 2*DAY), 'student');
// x4: 40일 전 카페24 씨앗 → 30일 창 밖
ins('INSERT INTO attendance (user_id,account_uid,room_id,joined_at,last_seen_at,date,role) VALUES (?,?,?,?,?,?,?)', 'x4', null, 'c24-2', now - 40*DAY, 0, kd(now - 40*DAY), 'student');
// 어제 x5(활동 아님) 기록 + 강사 기록
ins('INSERT INTO attendance (user_id,account_uid,room_id,joined_at,last_seen_at,date,role) VALUES (?,?,?,?,?,?,?)', 'x5', null, 'x-room', now - DAY, 0, kd(now - DAY), 'student');
ins('INSERT INTO attendance (user_id,account_uid,room_id,joined_at,last_seen_at,date,role) VALUES (?,?,?,?,?,?,?)', 'a2', null, 'c24-1', now - 2*DAY, 0, kd(now - 2*DAY), 'teacher');   // 다른 날 — 강사 줄을 세면 하루가 더 생긴다
// 같은 학생·같은 날 두 줄(재접속) → 한 번만
ins('INSERT INTO attendance (user_id,account_uid,room_id,joined_at,last_seen_at,date,role) VALUES (?,?,?,?,?,?,?)', 'u_dev3', 'a3', 'class-9-x', now - 3*DAY + 60000, now - 3*DAY, kd(now - 3*DAY), 'student');
// 결제: a1 40일 전(미납) · a2 5일 전(정상) · a3 없음 · x6 40일 전(활동 아님)
ins('INSERT INTO student_payments (user_id,paid_at,amount_krw,status) VALUES (?,?,?,?)', 'a1', now - 40*DAY, 100, 'paid');
ins('INSERT INTO student_payments (user_id,paid_at,amount_krw,status) VALUES (?,?,?,?)', 'a2', now - 5*DAY, 100, 'paid');
ins('INSERT INTO student_payments (user_id,paid_at,amount_krw,status) VALUES (?,?,?,?)', 'x6', now - 40*DAY, 100, 'paid');
ins('INSERT INTO student_payments (user_id,paid_at,amount_krw,status) VALUES (?,?,?,?)', 'a1', now - 3*DAY, 100, 'failed');

const q = (sql, ...b) => { try { return db.prepare(sql).get(...b); } catch (e) { return { __err: e.message }; } };
const ab = m.activeBinds(now);
const out = {};
out.active = q(m.activeCountSql(), ...ab);
out.activeScoped = q(m.activeCountSql(' AND shop_name = ?'), ...ab, 'B점');
out.overdue = q(m.overdueSql(), ...ab, now - m.OVERDUE_GRACE_DAYS*DAY);
out.overdueScoped = q(m.overdueSql(' AND shop_name = ?'), ...ab, now - m.OVERDUE_GRACE_DAYS*DAY, 'B점');
out.absent = q(m.absentSql(), ...ab, now - m.ABSENT_DAYS*DAY, now);
out.attended = q(m.ATTENDED_ON_DATE_SQL, ...ab, kd(now - DAY));
const mb = m.kstMonthBounds(now);
out.mb = mb;
out.classDays = q(m.classDaysSql(), mb.thisStart, now);
out.classDaysScoped = q(m.classDaysSql(' AND shop_name = ?'), mb.thisStart, now, 'B점');
out.mbMar31 = m.kstMonthBounds(Date.UTC(2026, 2, 31, 3)); // 3/31 12:00 KST
out.mbOct1 = m.kstMonthBounds(Date.UTC(2026, 8, 30, 16)); // 10/1 01:00 KST
out.trend00 = m.trendPct(0, 0);
out.trend510 = m.trendPct(5, 10);
out.trend50 = m.trendPct(5, 0);
out.sanBad = m.briefingSanity({ active_students: 545, overdue_count: 28771, at_risk_count: 10, attended_yesterday: 100 });
out.sanOk = m.briefingSanity({ active_students: 545, overdue_count: 91, at_risk_count: 23, attended_yesterday: 118 });
out.sanZero = m.briefingSanity({ active_students: 0, overdue_count: 0, at_risk_count: 0, attended_yesterday: 0 });
out.midnight = m.kstMidnight(now);
console.log(JSON.stringify(out));
`);
const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', join(tmp, 'run.mjs')], { encoding: 'utf8' });
let o = null;
try { o = JSON.parse((r.stdout || '').trim().split('\n').pop()); } catch {}
ok('정본을 실제로 돌렸다', !!o, (r.stderr || '').slice(0, 400));
if (o) {
  ok('① 활동 학생 = 수업이 있는 3명 (명부 10명 아님)', o.active?.n === 3, o.active);
  ok('① 스코프(B점)면 그 지점 활동 학생만', o.activeScoped?.n === 1, o.activeScoped);
  ok('② 미납 분모 = 결제 기록 있는 활동 학생 2명 (결제 없는 a3·활동 아닌 x6 제외)', o.overdue?.paid_ever === 2, o.overdue);
  ok('② 미납 = 35일 넘은 a1 한 명 (실패 결제는 안 셈)', o.overdue?.overdue === 1, o.overdue);
  ok('② 스코프(B점) 미납 0 / 분모 1', o.overdueScoped?.overdue === 0 && o.overdueScoped?.paid_ever === 1, o.overdueScoped);
  ok('③ 14일 수업 기록 없음 = a1 한 명 (a2 씨앗·a3 실접속은 있음)', o.absent?.n === 1, o.absent);
  ok('④ 어제 수업 학생 = a2 한 명 (활동 아닌 x5 제외)', o.attended?.n === 1, o.attended);
  ok('⑤ 이번 달 수업 기록 = a2·a3·x3·x5 각 하루 (같은 날 재접속 한 번 · 강사 제외)', o.classDays?.n === 4, o.classDays);
  ok('⑤ 스코프(B점) 수업 기록 = a2 하루', o.classDaysScoped?.n === 1, o.classDaysScoped);
  ok('⑥ 이번 달 시작 = KST 10/1 00:00', o.mb.thisStart === Date.UTC(2026, 8, 30, 15), o.mb);
  ok('⑥ 지난달 같은 기간 끝 = KST 9/13 12:00', o.mb.lastSameEnd === Date.UTC(2026, 8, 13, 3), o.mb);
  ok('⑥ 지난달 시작 = KST 9/1 00:00', o.mb.lastStart === Date.UTC(2026, 7, 31, 15), o.mb);
  ok('⑥ 3/31: 지난달(2월)보다 길어도 이번 달 시작을 넘지 않음', o.mbMar31.lastSameEnd === o.mbMar31.thisStart, o.mbMar31);
  ok('⑥ KST 10/1 01:00 은 10월 (UTC 로 자르면 9월이 됨)', o.mbOct1.thisStart === Date.UTC(2026, 8, 30, 15), o.mbOct1);
  ok('⑥ KST 자정', o.midnight === Date.UTC(2026, 9, 12, 15), o.midnight);
  ok('⑦ 비교 대상 0 → null(100% 로 지어내지 않음)', o.trend00 === null && o.trend50 === null, [o.trend00, o.trend50]);
  ok('⑦ 5 vs 10 → −50', o.trend510 === -50, o.trend510);
  ok('⑧ 미납 > 활동이면 AI 에 안 넘김', o.sanBad.length > 0, o.sanBad);
  ok('⑧ 정상 숫자는 통과(짝)', o.sanOk.length === 0, o.sanOk);
  ok('⑧ 활동 0명이면 막음', o.sanZero.length > 0, o.sanZero);
}

// ── ② 배선: KPI 라우트와 브리핑이 정본을 실제로 쓰는가 ─────────────────
const admin = readFileSync(ADMIN_TS, 'utf8');
const bodyAt = (src, anchor) => {
  const i = src.indexOf(anchor); if (i < 0) return '';
  const j = src.indexOf('{', i); let d = 0;
  for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); } }
  return '';
};
const kpi = bodyAt(admin, "if (method === 'GET' && path === '/api/admin/kpi/dashboard')");
ok('전제: KPI 라우트를 오려 냈다', kpi.length > 2000, kpi.length);
ok('KPI: 활동 학생을 정본으로 센다', /fetch1\(activeCountSql\(_erpScope\)/.test(kpi));
ok('KPI: 미납을 정본으로 센다', /fetch1\(overdueSql\(_erpScope\)/.test(kpi));
ok('KPI: overdue 는 «overdue» 칸(분모와 갈라)', /oc\?\.overdue/.test(kpi) && /oc\?\.paid_ever/.test(kpi));
ok('KPI: 매출 증감은 지난달 «같은 기간» 대비', /trend\(revThisMonth\?\.sum \|\| 0, revLastSame\?\.sum \|\| 0\)/.test(kpi));
ok('KPI: 지난달 같은 기간 매출을 lastSameEnd 로 잰다', /lastMonthStart, lastSameEnd, \.\.\._sb\),\s*\n\s*fetch1\(absentSql/.test(kpi));
ok('KPI: 수업 기록은 classDaysSql (출석 포인트 건수 아님)', (kpi.match(/classDaysSql\(_erpScope\)/g) || []).length >= 3 && !/rule_code='attendance'/.test(kpi));
ok('KPI: trend = trendPct (0 → null)', /const trend = trendPct;/.test(kpi));
ok('KPI: 캐시 키를 바꿨다(옛 정의 캐시 무효화)', /'admkpi2:'/.test(kpi));
const brief = bodyAt(admin, "if ((method === 'POST' && path === '/api/admin/briefing/generate')");
ok('전제: 브리핑 라우트를 오려 냈다', brief.length > 2000, brief.length);
ok('브리핑: 분모·미납·결석·어제 모두 정본', ['activeCountSql()', 'overdueSql()', 'absentSql()', 'ATTENDED_ON_DATE_SQL'].every(x => brief.includes(x)));
ok('브리핑: 옛 «명부 전체» 분모 쿼리가 없다', !/FROM students_erp WHERE status IN \('정상','활동','active'\)/.test(brief));
ok('브리핑: 숫자가 이상하면 AI 를 안 부른다', /if \(env\.AI && sanity\.length === 0\)/.test(brief));
ok('브리핑: 옛 정의 브리핑은 다시 만든다', /st\.def === KPI_DEF_VERSION/.test(brief));
ok('브리핑: stats 에 def 를 싣는다', /def: KPI_DEF_VERSION,/.test(brief));
const html = readFileSync(ADMIN_HTML, 'utf8');
ok('화면: 옛 브리핑 캐시 키(v1)를 안 읽는다', !html.includes('mangoi_briefing_v1'));
ok('화면: 미납 타일이 분모를 말한다', /k\.overdue\.paid_ever/.test(html));
ok('화면: 매출 타일이 «지난달 같은 기간» 을 말한다', /k\.revenue\.last_month_same/.test(html));
ok('화면: 활동 학생 타일이 명부 수를 따로 말한다', /k\.students\.roster_total/.test(html));

console.log(`kpi_active_denominator_harness — PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
