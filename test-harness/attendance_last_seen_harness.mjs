// -*- coding: utf-8 -*-
// 🧪 M1 — 서버 시각 하트비트(attendance.last_seen_at) 검증
//   실행:  node test-harness/attendance_last_seen_harness.mjs
//
//   왜 필요한가?
//     수업 종료 시각(left_at)은 클라이언트가 /api/attendance/leave 를 호출해야만 기록된다.
//     그런데 회선이 끊기면 페이지가 언로드되지 않으므로 그 호출이 영영 오지 않고 left_at 은 NULL 로 남는다.
//     (재택 강사 회선 끊김 — 사후에 "몇 시까지 수업했는가"를 확인할 방법이 없었다.)
//     M1 은 이미 30초마다(gaze 켜지면 10초마다) 오고 있던 요청의 '서버 도착 시각'을 찍어 이 문제를 푼다.
//
//   이 하니스가 실제로 하는 일 (문자열 검사만 하지 않는다):
//     ① api-mango.ts 소스에서 진짜 SQL 을 추출한다 → 소스가 바뀌면 이 테스트도 따라간다
//     ② 그 SQL 을 실제 SQLite(node:sqlite)에 실행한다 → SQL 이 유효한지, 값이 실제로 써지는지 확인
//     ③ '구버전 스키마(last_seen_at 없음)'에서 시작해 ALTER 자가치유가 도는지 확인
//     ④ 회선 끊김 시나리오를 재현해 종료 시각이 복원되는지 확인
//     ⑤ 양측 동시 접속 시간(both-present) 산출이 교사 끊김 구간을 제외하는지 확인

import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'cloudflare-deploy/src/api-mango.ts'), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
}
function eq(name, a, b) { check(`${name} (=${JSON.stringify(b)})`, JSON.stringify(a) === JSON.stringify(b)); }

// ═══════════════ ① 소스에서 실제 SQL 추출 ═══════════════
// 백틱 안의 SQL 만 뽑아 쓴다. 소스에서 last_seen_at 이 빠지면 여기서 즉시 잡힌다.
function sqlLiterals() {
  return [...SRC.matchAll(/`([^`]*?)`/g)].map(m => m[1]);
}
const LITS = sqlLiterals();
// ⚠️ 함정: leave 와 speaking-time 의 UPDATE 는 needle 이 크게 겹친다
//   (둘 다 'UPDATE attendance' + 'total_active_ms' + 'left_at IS NULL' + 'last_seen_at' 를 포함).
//   소스 순서상 leave 가 먼저라 단순 find 는 leave 를 집어 온다 → 반드시 배타 조건(not)까지 줘야 한다.
const pick = (needles, not = []) =>
  LITS.find(s => needles.every(n => s.includes(n)) && not.every(n => !s.includes(n)));

const ALTER_SQL   = pick(['ALTER TABLE attendance ADD COLUMN last_seen_at']);
// (2026-08-05) 말하기 진단 컬럼도 같은 자가치유 방식으로 붙는다 — 그 ALTER 도 함께 검사한다.
const ALTER_DIAG  = pick(['ALTER TABLE attendance ADD COLUMN spk_diag']);
const CHECKIN_INS = pick(['INSERT INTO attendance', 'last_seen_at', 'attended_at']);
// speaking-time: total_session_ms 를 '직접' 대입(= ?)하고 left_at 은 건드리지 않는다
const SPEAK_SQL   = pick(['UPDATE attendance', 'total_session_ms = ?', 'last_seen_at = ?', 'left_at IS NULL'],
                         ['SET left_at', 'COALESCE']);
// leave: SET left_at 으로 시작하고 나머지는 COALESCE 로 보존한다
const LEAVE_SQL   = pick(['UPDATE attendance', 'SET left_at', 'last_seen_at', 'COALESCE']);
const GAZE_SQL    = pick(['UPDATE attendance', 'gaze_score', 'last_seen_at']);

console.log('\n① 소스에서 SQL 추출 — 소스가 곧 사양');
check('ALTER TABLE ... ADD COLUMN last_seen_at 존재', !!ALTER_SQL);
check('checkin INSERT 에 last_seen_at 포함', !!CHECKIN_INS);
check('/api/speaking-time UPDATE 에 last_seen_at 포함 (30초 하트비트 본체)', !!SPEAK_SQL);
check('/api/attendance/leave UPDATE 에 last_seen_at 포함', !!LEAVE_SQL);
// 두 SQL 이 서로 다른 문장인지 확인 — 같은 걸 집었다면 위 검사는 통과해도 아래 실행 테스트가 무의미해진다
check('speaking-time 과 leave 가 서로 다른 SQL 로 추출됐다', !!SPEAK_SQL && SPEAK_SQL !== LEAVE_SQL);
check('speaking-time SQL 은 left_at 을 건드리지 않는다', !!SPEAK_SQL && !SPEAK_SQL.includes('SET left_at'));
check('/api/gaze-score UPDATE 에 last_seen_at 포함 (10초 하트비트)', !!GAZE_SQL);

// 🔴 서버 시각을 써야 한다 — 클라이언트가 보낸 값(b.timestamp)을 쓰면 위조·과다계상이 가능해진다.
check('checkin 이 서버 시각 전용 변수(srvNow)를 별도로 잡는다',
  /const\s+srvNow\s*=\s*Date\.now\(\)/.test(SRC));
check('checkin 의 now 는 srvNow 에서 출발한다(클라 timestamp 로 대체 가능)',
  /let\s+now\s*=\s*srvNow/.test(SRC));
check('checkin INSERT 의 last_seen_at 바인딩이 srvNow 다',
  /VALUES \(\?, \?, \?, \?, \?, \?, \?, \?, \?\)`[\s\S]{0,240}?srvNow\)\.run\(\)/.test(SRC));

if (!ALTER_SQL || !CHECKIN_INS || !SPEAK_SQL || !LEAVE_SQL || !GAZE_SQL) {
  console.log('\n❌ 필수 SQL 을 소스에서 찾지 못해 중단합니다.');
  process.exit(1);
}

// ═══════════════ ② 실제 SQLite 에서 실행 ═══════════════
// 운영 D1 의 '구버전 스키마'(last_seen_at 없음)로 시작한다 — 자가치유 ALTER 가 도는지 보기 위해.
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL, user_id TEXT NOT NULL,
  username TEXT, role TEXT DEFAULT 'student', joined_at INTEGER NOT NULL, left_at INTEGER,
  status TEXT DEFAULT 'present', date TEXT, attended_at INTEGER,
  total_session_ms INTEGER DEFAULT 0, total_active_ms INTEGER DEFAULT 0, disconnect_count INTEGER DEFAULT 0,
  gaze_score REAL, gaze_samples INTEGER, gaze_forward_samples INTEGER
)`);

const cols = () => db.prepare(`PRAGMA table_info(attendance)`).all().map(r => r.name);

console.log('\n② 구버전 스키마 → 자가치유 ALTER');
check('시작 시점엔 last_seen_at 이 없다(운영 D1 재현)', !cols().includes('last_seen_at'));

let altered = false;
try { db.exec(ALTER_SQL); altered = true; } catch { /* noop */ }
check('소스의 ALTER 문이 실제 SQLite 에서 성공한다', altered);

check('소스에 spk_diag 자가치유 ALTER 가 있다', !!ALTER_DIAG);
let alteredDiag = false;
try { db.exec(ALTER_DIAG); alteredDiag = true; } catch { /* noop */ }
check('spk_diag ALTER 도 실제 SQLite 에서 성공한다', alteredDiag);
check('ALTER 후 last_seen_at 컬럼이 생긴다', cols().includes('last_seen_at'));

// 멱등성 — 두 번째 호출은 실패하지만 try/catch 로 삼켜야 정상(운영에서 매 checkin 마다 호출됨)
let secondThrew = false;
try { db.exec(ALTER_SQL); } catch { secondThrew = true; }
check('같은 ALTER 재실행은 에러를 던진다 → 소스가 try/catch 로 감싸야 한다', secondThrew);
check('소스가 실제로 try/catch 로 감싸고 있다',
  /try \{ await env\.DB\.exec\(`ALTER TABLE attendance ADD COLUMN last_seen_at INTEGER`\); \} catch \{\}/.test(SRC));

// ═══════════════ ③ 회선 끊김 시나리오 재현 ═══════════════
// 시나리오: 14:00 시작 20분 수업. 교사가 14:26 에 회선이 죽어 leave 를 못 보냄.
const T = (hh, mm, ss = 0) => Date.UTC(2026, 6, 28, hh - 9, mm, ss); // KST → epoch ms
const START = T(14, 0);

// checkin (소스의 INSERT SQL 을 그대로 실행)
db.prepare(CHECKIN_INS).run('class-848-20260728', 'teacher_kang', '강선생', 'teacher',
  START, START, 'attended', '2026-07-28', START);

// 30초마다 speaking-time 하트비트 — 14:00 ~ 14:26 까지만 도착하고 그 뒤로는 끊김
const LAST_HB = T(14, 26);
for (let t = START + 30_000; t <= LAST_HB; t += 30_000) {
  // 클라이언트가 보내는 누적값은 '오프라인 동안에도 계속 증가'하는 신뢰 불가 값이다(일부러 부풀려 넣는다)
  const bogusSession = (t - START) * 3;
  db.prepare(SPEAK_SQL).run(1000, bogusSession, t, 'an=1;mic=1;ac=running', 'class-848-20260728', 'teacher_kang');
}

const row = db.prepare(`SELECT * FROM attendance WHERE user_id='teacher_kang'`).get();

console.log('\n③ 교사 회선 끊김 — leave 가 영영 오지 않는 경우');
eq('left_at 은 NULL 이다(끊겨서 leave 미도달)', row.left_at, null);
check('last_seen_at 은 마지막 하트비트 시각으로 남아 있다', row.last_seen_at === LAST_HB);

// 복원 규칙: 실제 종료 시각 = left_at ?? last_seen_at
const effectiveEnd = r => (r.left_at != null ? r.left_at : r.last_seen_at);
check('복원된 종료 시각 = 14:26 (기존에는 알 방법이 전혀 없었음)', effectiveEnd(row) === T(14, 26));

// (2026-08-05) 말하기 점수가 0 인 이유를 사후에 갈라내려면 진단값이 함께 남아야 한다.
check('spk_diag 가 마지막 하트비트 값으로 남는다', row.spk_diag === 'an=1;mic=1;ac=running');

// 오차 한계: 하트비트 주기(30초) 이내여야 한다
const trueEnd = T(14, 26, 20); // 실제로는 14:26:20 에 끊겼다고 가정
check('복원 오차 ≤ 30초 (하트비트 주기)', (trueEnd - effectiveEnd(row)) <= 30_000);

// 클라이언트 누적값은 못 믿는다는 사실도 명시적으로 고정
const clientMinutes = row.total_session_ms / 60000;
const serverMinutes = (effectiveEnd(row) - row.joined_at) / 60000;
check('클라이언트 누적값은 서버 실측보다 부풀려져 있다(신뢰 불가 확인)', clientMinutes > serverMinutes);
eq('서버 실측 수업 길이(분)', Math.round(serverMinutes), 26);

// ═══════════════ ④ 정상 퇴장 ═══════════════
db.prepare(CHECKIN_INS).run('class-848-20260728', 'student_lee', '이학생', 'student',
  START, START, 'attended', '2026-07-28', START);
const STU_LEAVE = T(14, 26);
db.prepare(LEAVE_SQL).run(STU_LEAVE, STU_LEAVE, 900, 1_560_000, 0, 'left',
  'class-848-20260728', 'student_lee');
const stu = db.prepare(`SELECT * FROM attendance WHERE user_id='student_lee'`).get();

console.log('\n④ 정상 퇴장 — left_at 과 last_seen_at 이 일치');
check('left_at 이 기록된다', stu.left_at === STU_LEAVE);
check('last_seen_at 도 같은 시각으로 갱신된다', stu.last_seen_at === STU_LEAVE);
check('정상 퇴장 행은 "끊김" 으로 오분류되지 않는다', stu.left_at != null);

// ═══════════════ ⑤ gaze 하트비트(10초) ═══════════════
db.prepare(GAZE_SQL).run(88.5, 120, 106, T(14, 27), stu.id);
const stu2 = db.prepare(`SELECT * FROM attendance WHERE id=?`).get(stu.id);
console.log('\n⑤ gaze 하트비트 — 해상도 30초 → 10초');
check('gaze-score 호출도 last_seen_at 을 갱신한다', stu2.last_seen_at === T(14, 27));
eq('gaze 점수는 그대로 저장된다', stu2.gaze_score, 88.5);

// ═══════════════ ⑥ 양측 동시 접속 시간(both-present) ═══════════════
// 제안서 2-3 의 판정 모델. 교사가 14:08~14:13 끊겼다 돌아온 경우를 구간으로 계산한다.
function bothPresentMs(teacherSegs, studentSegs) {
  let total = 0;
  for (const t of teacherSegs) for (const s of studentSegs) {
    const lo = Math.max(t[0], s[0]), hi = Math.min(t[1], s[1]);
    if (hi > lo) total += hi - lo;
  }
  return total;
}
const teacher = [[T(14, 0), T(14, 8)], [T(14, 13), T(14, 26)]]; // 5분 끊김
const student = [[T(14, 0), T(14, 26)]];                        // 학생은 계속 접속(증인)
const bp = bothPresentMs(teacher, student) / 60000;

console.log('\n⑥ 양측 동시 접속 시간 — 교사 끊김 구간 제외');
eq('겉보기 교사 접속 시간(분)', (T(14, 26) - T(14, 0)) / 60000, 26);
eq('실제 수업 성립 시간(분) = 26 - 5', bp, 21);
check('끊긴 5분은 수업으로 인정되지 않는다', bp < 26);
// 예정 20분 → 21분 성립 = 원 수업 시간 복원됨 → 페널티 없음
check('예정 20분이 복원되었으므로 페널티 대상 아님', bp >= 20);

// 보충하지 않고 14:20 에 끝낸 경우
const teacherNoMakeup = [[T(14, 0), T(14, 8)], [T(14, 13), T(14, 20)]];
const bp2 = bothPresentMs(teacherNoMakeup, [[T(14, 0), T(14, 20)]]) / 60000;
eq('보충 안 하고 종료 시 성립 시간(분)', bp2, 15);
check('미보충 5분은 페널티 대상으로 판정된다', 20 - bp2 === 5);

// ═══════════════ 결과 ═══════════════
// ⚠️ 요약 문구 형식 주의 — run.mjs 는 /([1-9]\d*)\s*(FAIL|실패)/ 로 실패를 감지한다.
//    "PASS 32  FAIL 0" 처럼 쓰면 '32 FAIL' 로 잡혀 통과인데도 FAIL 로 집계된다.
//    저장소 관례(`✅ N 통과 / ❌ M 실패`)를 그대로 따른다.
console.log('\n====================================================');
console.log(`🎯 총 ${PASS + FAIL}건 중 ✅ ${PASS} 통과 / ❌ ${FAIL} 실패`);
if (FAIL) { console.log('실패 항목:'); FAILS.forEach(f => console.log('  - ' + f)); process.exitCode = 1; }
else console.log('🎉 M1 서버시각 하트비트(last_seen_at) 전부 통과');
console.log('====================================================');
