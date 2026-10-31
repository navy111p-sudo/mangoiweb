/* ═══════════════════════════════════════════════════════════════════════════
   🎚 강사가 수업 일지에서 학생 레벨을 직접 정한다
      (2026-10-27 사장님 「강사가 일지에서 레벨을 직접 입력하게 해줘」)
      Teachers set a student's level from the Class Log.

   [왜] students_erp.level 이 거의 비어 있다 — [잰 것 — 2026-10-27 D1] 29,570명 중 9명,
        예약이 살아 있는 학생 536명 중 8명. 레벨은 레벨테스트 배치(student-placement.ts)와
        관리자 교재 일괄배정만 써 왔고, 매주 학생을 보는 강사는 쓸 길이 없었다.

   [어디에 쓰나] students_erp.level 한 칸. 이미 여러 화면이 읽는 정본이다 —
        판단력 훈련 읽기 밴드(사람이 정한 값 1순위) · 오늘의 학습 레벨 심기 · 복습퀴즈 · 관리자 화면.
        ⚠️ 퍼지는 시점이 화면마다 다르다 — 판단력 훈련·복습퀴즈는 학생이 «다음에 열 때» 서버에서 읽고,
           오늘의 학습(today-page.js seedLevel)은 기기 저장값이 «비어 있을 때만» 심는다
           (웜업·AI 친구 레벨을 이미 고른 기기에는 안 간다 — 학생이 고른 값을 덮지 않는 설계).
        ⚠️ 판단력 훈련은 사람 레벨이 바뀌면 밴드 상태를 새로 만든다(resolveReadingBand) — 그 학생이 고른
           모드·나이대·자동 조절 이력이 기본값으로 돌아간다. 초기화는 «저장할 때» 가 아니라 학생이 «다음에 열 때»
           (KV 의 base 와 원부 레벨이 다를 때) 일어난다 — 그 사이 원래 값으로 되돌리면 안 일어난다.

   [밤 동기화] 카페24 UPSERT 의 SET 목록에 level 이 없고, DELETE 보존 조건에 level 이 있다
        (cafe24-sync.ts) — 강사가 넣은 레벨은 매일 밤 03:00 동기화에 지워지지 않는다.
   [레벨테스트] applyPlacementLevel 은 «비어 있을 때만» 쓴다 — 강사가 정한 값을
        나중 레벨테스트가 덮지 않는다(«사람 손이 이긴다»).

   ⛔ 화면이 보낸 아무 글자나 받지 않는다 — 'Lv 1'~'Lv 34'(BAND_SPECS 의 교재 Lv 범위) 정수만.
   ⛔ «지우기» 는 없다 — 잘못 고르면 다른 레벨로 바꾼다. 지우는 길을 열면 레벨테스트가 정한 값까지
      한 번에 사라질 수 있다.
   ✅ 바꿀 때마다 student_level_log 에 «누가·언제·무엇에서 무엇으로» 를 남긴다(되돌릴 근거).
   ⚠️ 학생 행은 user_id «정확일치» — Kim/kim 은 다른 계정이다(CLAUDE.md 2장).
   ⚠️ 누가 정할 수 있는지(«이 강사의 학생인가») 의 판정은 아래 teacherLevelScope 하나다(2026-10-28 좁힘) —
      부르는 쪽(api-teacher.ts 의 POST ?part=level)이 세션을 확인한 뒤 그 함수에 묻고, 그다음에 저장을 부른다.
   ═══════════════════════════════════════════════════════════════════════════ */

import { BAND_SPECS } from './judgment-level';
import { normalizeStudentLevel } from './eval-attendance';
import { normStartsOn } from './class-start-date';

/** 강사가 고를 수 있는 교재 Lv 범위 — BAND_SPECS 에서 읽는다(숫자를 여기 다시 적지 않는다). */
export const TEACHER_LEVEL_MIN = BAND_SPECS[0].lvFrom;
export const TEACHER_LEVEL_MAX = BAND_SPECS[BAND_SPECS.length - 1].lvTo;

/**
 * 강사가 고른 레벨 → 저장할 표기 'Lv N'. 범위 밖·소수·글자·빈 값은 null.
 *   받아 주는 모양: 'Lv 12' · 'lv12' · 'Lv.12' · '12' · 12.
 *   ⚠️ 숫자만 뽑아 쓰지 않는다 — 'Lv 5 (Basic)' 처럼 뒤에 글자가 붙은 값은 «고른 것» 이 아니다.
 */
export function normalizeTeacherLevelChoice(raw: unknown): string | null {
  if (raw == null || typeof raw === 'boolean') return null;
  const s = String(raw).trim();
  const m = s.match(/^(?:lv\.?\s*)?(\d{1,3})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!(n >= TEACHER_LEVEL_MIN && n <= TEACHER_LEVEL_MAX)) return null;
  return 'Lv ' + n;
}

/** 화면(teacher.html 일지 창)이 고르기 목록을 그릴 때 쓰는 표 — 서버가 단일 출처. */
export function levelScaleForPortal(): Array<{ band: number; from: number; to: number; ko: string; en: string }> {
  return BAND_SPECS.map((s) => ({ band: s.band, from: s.lvFrom, to: s.lvTo, ko: s.nameKo, en: s.nameEn }));
}

/* 🔐 «이 강사가 이 학생의 레벨을 정할 수 있나» — 판정 정본(순수 함수).
      (2026-10-28 사장님 「3번 권한 범위 좁혀줘」) Who may set a student's level.

   [전에는] 오늘 목록 ∪ 이 강사의 예약표 행 «전부». 그 예약표 조회(api-teacher.ts)는 날짜 제한이 없어
        몇 달 전에 끝난 일회성 수업·연기 자리표시 행까지 «내 학생» 으로 셌다.
        [잰 것 — 2026-10-28 D1, 예약표 행만 teacher_id 로 묶은 근사(오늘 목록 ① 은 안 셈) «전 → 지금»]
        72→61 · 58→50 · 55→46 … 40→1(번호 22 — 남은 행이 9/2~9/30 카페24 미러 수업이었다).
   [지금] 아래 셋 중 하나일 때만:
     ① 오늘 목록의 수업 학생(취소된 줄 제외) — 포털이 만든 그대로(대타 · 그리고 카페24 수업 블록이 붙었다면 그 줄도).
        ⚠️ 카페24 블록은 계정 표시이름이 강사 프로필과 «완전일치» 할 때만 붙는다(api-teacher.ts) —
           [잰 것 — 2026-10-28] 계정이 연결된 활성 강사 21명 중 15명은 일치 0건이라 그 강사들에게는 그 블록이 비어 있다
           (번호 22 포함 — 이번 변경 «전부터» 의 현상, 별건).
     ② 최근 TEACHER_LEVEL_PAST_DAYS 일 ~ 오늘 사이에 날짜가 잡힌 이 강사의 수업 — 주간 보기의 «지난 수업» 일지가 같은 창을 쓴다.
     ③ 지금 걸려 있는 매주 반복 수업(시작일이 오늘보다 뒤가 아님).
   ⛔ 앞으로 잡힌 수업만 있는 학생은 안 된다 — 일지 창은 수업이 «시작한 뒤» 에만 열린다.
   ⛔ 예약표 상태는 «허용 목록»(active·비어 있음·postponed)으로 본다 — 모르는 상태는 근거가 못 된다(막는 쪽으로 실패).
      연기(postponed)는 수업이 «옮겨진» 것이지 끝난 것이 아니라 근거가 된다. 취소(cancelled)는 안 된다.
   그 학생과 수업 기록은 있는데 위 셋에 안 들면 'out_of_window' — 화면이 «내 학생이 아니다» 가 아니라
   «최근 N일» 이라고 사실대로 말하게 갈라 돌려준다.
   ⚠️ 14일 = api-teacher.ts 의 카페24 수업 되돌아보기(LOOKBACK_DAYS)와 같은 근거 — 「일지는 기억이 남아 있을 때 쓴다」.
      ① 의 카페24 줄은 날짜를 안 보므로 그 상수를 바꾸면 레벨 창도 함께 바뀐다 → 두 값이 같은지 하니스가 대조한다.
      [잰 것 — 2026-10-28] 최근 120일 강사 일지 30건 전부 수업 «당일» 에 썼다.
   ⚠️ 학생 아이디는 «정확일치»(Kim/kim 은 다른 계정). 예약표 행의 아이디는 부르는 쪽의 uidOf 로 읽는다
      (api-teacher.ts 의 studentUidOf — 자리표시 lms·type_seed 를 걸러 낸다).
   ⚠️ «모르면» 의 방향이 축마다 다르다 — 상태·날짜가 이상하면 막고(위), 매주 반복 행의 시작일(starts_on)이
      깨져 있으면 «시작일 없음» 과 같이 연다(recurStartedOn 과 같은 설계 — 실측 반복 행 6~9개뿐).
      상태 비교는 대소문자·공백을 그대로 본다('Active' 는 막힘 — 막는 쪽이라 안전).
   ⚠️ 세션 확인(로그인·조직 계정 거절)은 여기서 하지 않는다 — 부르는 쪽이 먼저 한다. */
export const TEACHER_LEVEL_PAST_DAYS = 14;
export type TeacherLevelScope = 'ok' | 'out_of_window' | 'not_your_student';

const LEVEL_YMD = /^\d{4}-\d{2}-\d{2}$/;
const LEVEL_SCOPE_STATUSES = ['active', 'postponed'];

export function teacherLevelScope(input: {
  uid: string;
  todayClasses: ReadonlyArray<any>;
  schedules: ReadonlyArray<any>;
  todayStr: string;
  uidOf: (row: any) => string | null;
}): TeacherLevelScope {
  const uid = String((input && input.uid) || '');
  const today = String((input && input.todayStr) || '');
  if (!uid || !LEVEL_YMD.test(today)) return 'not_your_student';
  const from = new Date(Date.parse(today + 'T00:00:00Z') - TEACHER_LEVEL_PAST_DAYS * 86400000).toISOString().slice(0, 10);
  let known = false;
  for (const c of input.todayClasses || []) {
    if (!c || c.kind !== 'class' || String(c.student_uid || '') !== uid) continue;
    known = true;
    if (c.class_state !== 'cancelled') return 'ok';
  }
  for (const r of input.schedules || []) {
    if (!r || input.uidOf(r) !== uid) continue;
    known = true;
    if (!LEVEL_SCOPE_STATUSES.includes(String(r.sched_status || 'active'))) continue;
    const d = String(r.scheduled_date || '').trim().slice(0, 10);
    if (d) {
      if (LEVEL_YMD.test(d) && d >= from && d <= today) return 'ok';
      continue;
    }
    if (r.day_of_week == null || String(r.day_of_week).trim() === '') continue;
    const so = normStartsOn(r.starts_on);
    if (!so || so <= today) return 'ok';
  }
  return known ? 'out_of_window' : 'not_your_student';
}

/* 🎚 (2026-10-28 사장님 「1번 확인창 전에 범위 밖이면 막아줘」) 일지 창이 «확인창을 띄우기 전에» 막을 수 있게,
      POST ?part=level 이 물을 것과 «같은» 판정을 학생마다 미리 실어 보낸다 — 수업 항목에 level_scope.
   ⛔ 화면에 판정을 복제하지 않는다 — 화면은 이 값을 «읽기만» 하고, 최종 판정은 그대로 서버 POST 다.
   ⚠️ 학생 수업 항목(kind 'class' · 아이디 있음)에만 붙인다. 같은 학생이 여러 번 나와도 판정은 한 번.
   ⚠️ 부르는 쪽은 POST 와 «같은» 네 값(오늘 목록 · 예약표 행 · 오늘 날짜 · 아이디 읽는 법)을 넘겨야 한다. */
export function attachLevelScope(items: ReadonlyArray<any>, input: {
  todayClasses: ReadonlyArray<any>;
  schedules: ReadonlyArray<any>;
  todayStr: string;
  uidOf: (row: any) => string | null;
}): void {
  const memo = new Map<string, TeacherLevelScope>();
  for (const it of items || []) {
    if (!it || it.kind !== 'class') continue;
    const uid = String(it.student_uid || '');
    if (!uid) continue;
    let v = memo.get(uid);
    if (!v) {
      v = teacherLevelScope({ uid, todayClasses: input.todayClasses, schedules: input.schedules, todayStr: input.todayStr, uidOf: input.uidOf });
      memo.set(uid, v);
    }
    it.level_scope = v;
  }
}

export interface SetStudentLevelInput {
  uid: string;
  level: unknown;
  by: string;
  byName: string;
  nowMs: number;
  source?: string;
}

/** 하나의 모양 — tsconfig 가 strictNullChecks:false 라 판별 유니온 좁히기가 안 된다(CLAUDE.md 2장). */
export interface SetStudentLevelResult {
  ok: boolean;
  error?: string;
  level?: string;
  previous?: string | null;
  unchanged?: boolean;
}

/** students_erp 의 level·updated_at 칸과 변경 기록 표 — 멱등. 없는 칸을 UPDATE 하다 죽지 않게 먼저 둔다. */
async function ensureLevelSchema(db: D1Database): Promise<void> {
  try { await db.prepare(`ALTER TABLE students_erp ADD COLUMN level TEXT`).run(); } catch { /* 이미 있음 */ }
  try { await db.prepare(`ALTER TABLE students_erp ADD COLUMN updated_at INTEGER`).run(); } catch { /* 이미 있음 */ }
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS student_level_log (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       user_id TEXT NOT NULL,
       old_level TEXT,
       new_level TEXT NOT NULL,
       changed_by TEXT,
       changed_by_name TEXT,
       source TEXT,
       created_at INTEGER NOT NULL
     )`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_student_level_log_uid ON student_level_log(user_id, created_at)`).run();
}

/**
 * 학생 레벨을 정한다. 같은 값이면 아무것도 안 쓴다(unchanged).
 *   레벨 UPDATE 와 변경 기록 INSERT 는 한 batch — 한쪽만 남지 않는다.
 *   DB 예외는 그대로 던진다(부르는 쪽이 db_error 로 말한다 — «저장했다» 고 거짓말하지 않기).
 */
export async function setStudentLevelByTeacher(db: D1Database, input: SetStudentLevelInput): Promise<SetStudentLevelResult> {
  const uid = String((input && input.uid) || '').trim();
  if (!uid) return { ok: false, error: 'student_uid_required' };
  const level = normalizeTeacherLevelChoice(input.level);
  if (!level) return { ok: false, error: 'bad_level' };

  await ensureLevelSchema(db);
  const row = await db.prepare(`SELECT level FROM students_erp WHERE user_id = ? LIMIT 1`).bind(uid).first<any>();
  if (!row) return { ok: false, error: 'not_found' };

  const previous = normalizeStudentLevel(row.level);
  if (previous === level) return { ok: true, level, previous, unchanged: true };

  const now = Number(input.nowMs) || Date.now();
  await db.batch([
    db.prepare(`UPDATE students_erp SET level = ?, updated_at = ? WHERE user_id = ?`).bind(level, now, uid),
    db.prepare(
      `INSERT INTO student_level_log (user_id, old_level, new_level, changed_by, changed_by_name, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(uid, previous, level, String(input.by || '') || null, String(input.byName || '') || null,
            String(input.source || 'teacher_log'), now),
  ]);
  return { ok: true, level, previous };
}
