/**
 * c24-mirror.ts — 카페24 수업 → 망고아이 시간표(class_schedules) 미러 (2026-08-31)
 *
 * ═══ 왜 만들었나 ═══
 *   카페24 예약은 망고아이로 자동으로 넘어오지 않는다. 그래서 파일럿 기간에는
 *   같은 수업을 **두 번**(카페24 + 망고아이) 잡아야 했고, 언젠가 «한날 한시» 에
 *   전환할 때는 그때까지 한 번도 안 해 본 일을 급하게 해야 한다.
 *   → 지금부터 매일 «옮겨 봤다면 어떻게 됐을지» 를 세어 두면, 전환일에는
 *     스위치만 올리면 된다. 이 파일이 그 엔진이다.
 *
 * ═══ 3단계 ═══
 *   ① off       — 그림자. 계획만 계산해 리포트로 보여 주고 **아무것도 안 쓴다**.
 *   ② whitelist — 켠 강사만 실제로 class_schedules 를 만든다(파일럿).
 *   ③ all       — 전원. 전환일에 여기로 올린다. 문제가 생기면 ②로 되돌린다.
 *   ⚠️ 이 파일은 ①의 «계획 계산» 까지만 담당한다. 실제 쓰기(②③)는 승인 후 별도로 붙인다.
 *
 * ═══ 절대 규칙 (사고 방지) ═══
 *   1. 미러가 만든 행은 `source='c24-mirror'` **하나만** 손댄다.
 *      파일럿 수업(`adm-enroll:*`)·손으로 넣은 수업은 이름이 달라 애초에 대상이 아니다.
 *   2. 사람이 망고아이에서 고치면 그 수정이 **이긴다**(2026-08-31 사장님 결정).
 *      고치는 순간 `source='c24-mirror:manual'` 로 도장이 찍히고, 미러는 그 행을
 *      영영 안 건드린다. 대신 «카페24와 어긋남» 으로 리포트에 남긴다.
 *   3. 강사·학생을 **못 찾으면 만들지 않는다**. 번호로 추측해 이었다가 남의 이름이
 *      붙은 사고가 이 저장소에 세 번 있었다(CLAUDE.md 2장). 모르면 비워 두고 알린다.
 *   4. 창(window)은 **양쪽 끝을 반드시** 지정한다. 상한 없이 지우면 미래 예약이
 *      전멸한다(`cafe24-sync.ts` importCafe24Attendance 주석의 교훈).
 *
 * ═══ 강사 번호 (제일 자주 밟는 함정) ═══
 *   카페24 강사번호(9~196) ≠ 원부 `teachers.id`(1~30). 겹치는 자리에서 «다른 사람» 이다.
 *   그래서 번호로 직접 잇지 않고 **이름을 거쳐** 잇는다:
 *     카페24 번호 → teacher_payroll_auto(번호와 이름을 함께 받은 유일한 표) → 이름
 *                 → 정규화 → teachers 에서 **유일하게** 맞을 때만 원부번호
 *   ⛔ `teachers` 를 번호로 직접 조회하지 말 것.
 *   ℹ️ 같은 판정이 api-admin.ts 의 loadCafe24TeacherMap() 에도 있다. 여기서 import 하지
 *      않는 이유는 순환 참조(api-admin → accounting-reports → 이 파일)를 만들기 때문이고,
 *      그래서 **두 함수가 같은 답을 내는지 하니스가 실제로 돌려서 대조**한다
 *      (`test-harness/c24_mirror_harness.mjs`). enroll-ops.ts 가 쓰는 방식과 같다.
 */

import { selectInChunks } from './d1-chunk';   // 🔢 IN 목록은 공용 헬퍼로 — D1 바인드 100개 한도
import { loadHiddenStudents } from './student-override';   // 🙈 명부에서 숨긴 학생은 안 만든다

/** 미러 동작 단계 */
export type MirrorMode = 'off' | 'whitelist' | 'all';

/** 미러가 만든 행임을 나타내는 표식 — 이 값이 아닌 행은 미러가 절대 안 건드린다 */
export const MIRROR_SOURCE = 'c24-mirror';
/** 사람이 손댄 미러 행 — 「사람 손이 이긴다」의 도장 */
export const MIRROR_SOURCE_MANUAL = 'c24-mirror:manual';
/** 미러 행의 notes 접두사 — `c24:511923` 처럼 카페24 수업 번호를 적어 둔다.
    ⛔ 이 형식을 바꾸면 «사라진 수업 되짚기» 가 조용히 헛돈다(취소가 한 건도 안 된다). */
export const MIRROR_NOTE_PREFIX = 'c24:';
/** notes 에서 카페24 수업 번호를 되읽는다. 형식이 아니면 null. */
export function mirrorNoteClassId(notes: any): string | null {
  const m = String(notes ?? '').match(/(?:^|\s)c24:([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

/** 카페24에서 읽어 온 수업 한 건 (Neo4j :Class 그대로) */
export interface C24Class {
  class_id: string;
  user_id: string;          // 학생 계정 (students_erp.user_id 와 같은 체계)
  date: string;             // YYYY-MM-DD
  start_ms: number;
  end_ms: number;
  class_state: number;      // 2 = 완료, 그 외 = 예정
  teacher_id: string | null;   // 카페24 강사번호
}

/** 망고아이에 이미 있는 수업 한 건 (class_schedules) */
export interface ExistingRow {
  id: number;
  user_id: string;
  teacher_id: string | null;
  scheduled_date: string | null;
  start_time: string | null;
  duration_min: number | null;
  source: string | null;
  status: string | null;
  /** 미러가 «어느 카페24 수업으로 만든 행인가» 를 적어 두는 자리 (`c24:<class_id>`).
      ⚠️ 이게 있어야 «카페24에서 사라진 수업» 을 되짚어 취소할 수 있다. */
  notes?: string | null;
}

/** 카페24 강사번호 → 이름·원부번호 */
export interface TeacherLink {
  name: string | null;
  teacherId: string | null;
  /* 🔴 (2026-09-01) 재직 원부에서 못 찾았을 때 «퇴사자 명부» 에서는 찾았는가.
       발단: 사장님이 Mariane 을 퇴사 처리하자 그 사람의 카페24 잔재 30건이 화면에서
       **말없이 사라졌다** — 판정이 no_teacher 가 되는데 화면은 그것을 그리지도 세지도 않았다.
     ⚠️ 「강사 못 이음」 하나로 뭉치면 안 된다. 둘은 할 일이 정반대다:
          퇴사자 잔재 → 할 일 없음(카페24에서 정리되면 사라진다)
          원부에 없음 → **사람이 등록해야 한다**. 전환일에 이게 안 보이면 그 강사 수업이
                        통째로 안 만들어지는데 아무도 모른다(실측 전례: Teacher Ness 13건).
     ⛔ 이 번호로 수업을 만들지 않는다 — 오직 «왜 못 이었는지» 를 말하기 위한 것이다. */
  leftTeacherId?: string | null;
}

export type Verdict =
  | 'ok'               // 그대로 만들면 됨
  | 'already'          // 이미 미러로 만들어져 있고 값도 같음
  | 'update'           // 미러 행은 있는데 카페24 쪽이 바뀜 → 고쳐야 함
  | 'manual_locked'    // 사람이 손댐 — 건드리지 않는다
  | 'diverged'         // 사람이 손댄 값과 카페24 값이 다름 → 사람이 판단할 일
  | 'no_teacher'       // 강사를 못 이음 — 원부에 그런 사람이 없다(등록이 필요할 수 있다)
  | 'no_teacher_left'  // 퇴사한 강사의 잔재 — 카페24에만 남아 있다(할 일 없음)
  | 'no_student'       // 학생을 못 찾음
  | 'student_hidden'    // 명부에서 «숨긴» 계정 — 일부러 뺀 것이라 만들지 않는다(고쳐야 할 것이 아님)
  | 'not_whitelisted'  // 아직 안 켠 강사
  | 'suspect_dup'      // 강사 변경 잔재로 의심 — 사람이 확인할 때까지 만들지 않는다
  | 'conflict';        // 그 시간에 다른 출처(파일럿·수동) 수업이 이미 있음

export interface PlanRow {
  class_id: string;
  date: string;
  start_time: string;
  duration_min: number;
  /* 🔎 (2026-08-31) 카페24 원본 상태값을 «뭉개지 말고 그대로» 싣는다.
     발단: 그림자 1일차에 사장님이 「허윤아 17:00 은 Zee 뿐이고 Kes·Sid 는 없다」고 확인해 주셨다.
     그런데 그 넷이 `attendance` 에서는 전부 status='scheduled' 로 똑같이 보인다 —
     importCafe24Attendance 가 «2면 present, 아니면 scheduled» 로 **두 값으로 뭉개기** 때문이다.
     ⟹ 유령 수업을 가려낼 단서가 그 뭉갬에서 사라진다. 그래서 여기서는 원본을 그대로 둔다.
     ⛔ 이 값의 «뜻» 을 추측해서 판정에 쓰지 말 것 — 무엇이 취소인지는 카페24가 정한다.
        지금은 **보여 주기만** 하고, 뜻이 확인된 뒤에 거르는 것이 순서다. */
  class_state: number;
  c24_teacher_id: string | null;
  teacher_name: string | null;
  teacher_id: string | null;
  student_uid: string;
  student_name: string | null;
  verdict: Verdict;
  detail?: string;
  /** 이 계획이 가리키는 기존 class_schedules 행(있을 때만). update 가 이 번호로 고친다. */
  existing_id?: number | null;
}

/* ═══════════════ 순수 함수 (하니스가 이걸 실제로 돌린다) ═══════════════ */

/** 강사 이름 정규화 — api-admin.ts 의 normTeacherName 과 «같은 규칙» 이어야 한다(하니스가 대조) */
export function mirrorNormTeacherName(v: any): string {
  return String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/^teacher\s+/, '');
}

/** epoch ms → KST 'HH:MM'. 카페24 start_ms 는 UTC 기준이라 +9h 해서 읽는다. */
export function msToKstHm(ms: number): string {
  const d = new Date(Number(ms) + 9 * 3600 * 1000);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** 수업 길이(분). 값이 이상하면 기본 20분 — 0분·음수·하루치가 들어오는 것을 막는다. */
export function classMinutes(start: number, end: number): number {
  const raw = Math.round((Number(end) - Number(start)) / 60000);
  if (!Number.isFinite(raw) || raw <= 0 || raw > 240) return 20;
  return raw;
}

/**
 * 🔗 강사 원부(teachers) 이름 → 원부번호 판정기. **순수 함수라 하니스가 그대로 돌린다.**
 *
 *   ① 접두사(`Teacher `)를 뗀 **완전일치**
 *   ② 그래도 없으면 «접두어가 붙은 경우» 만 **낱말 단위**로 한 번 더
 *      (카페24 «Teacher Ness» → 'ness' ↔ 원부 «HT NESS» → 'ht ness')
 *
 * 🔴 왜 ②가 필요한가 — 2026-08-31 그림자 1일차 실측에서 막힌 14건 중 **13건이 이 한 사람**이었다.
 *    이름은 한 글자도 안 틀렸고 접두어 «HT » 때문에 못 이었다.
 * ℹ️ 내가 새로 만든 규칙이 아니다 — `js/adm-q6.js` 의 ph54ResolveTeacherId 가 이미 같은 방식이고
 *    `teacher_weekly_calendar_id_space_harness` 가 「HT NESS 는 단어 단위로 맞다」로 못 박아 두었다.
 * ⛔ 부분일치(substring)는 절대 금지 — 'FAR' 가 'HT FARRAH' 에 걸려 남의 일정이 뜬 사고가 있었다.
 *    낱말 **전체** 가 같을 때만이라 'farr' 는 'farrah' 에 안 걸린다.
 * ⛔ 후보가 둘 이상이면 **잇지 않는다**(null). 모르는 것보다 틀린 것이 나쁘다(CLAUDE.md 2장).
 *    그래서 'ht' 처럼 여럿이 나눠 갖는 낱말은 자동으로 «모름» 이 된다.
 */
export function buildRosterResolver(
  roster: { id: any; name: any }[],
): (name: any) => string | null {
  const byName = new Map<string, string | null>();
  const byWord = new Map<string, string | null>();
  for (const t of (roster || [])) {
    const k = mirrorNormTeacherName(t?.name);
    if (!k) continue;
    const id = String(t.id);
    byName.set(k, byName.has(k) && byName.get(k) !== id ? null : id);
    for (const w of k.split(/\s+/)) {
      if (!w) continue;
      byWord.set(w, byWord.has(w) && byWord.get(w) !== id ? null : id);
    }
  }
  return (name: any): string | null => {
    const k = mirrorNormTeacherName(name);
    if (!k) return null;
    if (byName.has(k)) return byName.get(k) ?? null;
    if (!k.includes(' ')) return byWord.get(k) ?? null;   // 한 낱말일 때만 낱말 조회
    return null;
  };
}

/**
 * 🕰️ «슬롯» 열쇠 — (학생, 카페24 강사번호, 시작시각). 이력에서 «이 자리가 몇 번 잡혔나» 를 셀 때 쓴다.
 *   ⚠️ 날짜는 일부러 뺀다. 묻는 것이 「이 시각이 그 학생·그 강사에게 «되풀이되는 자리» 인가」이기 때문이다.
 */
export function slotKey(uid: string, c24tid: string | null, hm: string): string {
  return `${uid}|${c24tid == null ? '' : c24tid}|${hm}`;
}

/** 같은 수업인가 — 학생·날짜·시작시각이 모두 같으면 같은 수업으로 본다. */
function sameSlot(a: { user_id: string; date: string; time: string }, b: ExistingRow): boolean {
  return String(b.user_id || '') === a.user_id
      && String(b.scheduled_date || '') === a.date
      && String(b.start_time || '').slice(0, 5) === a.time;
}

/**
 * 🧠 미러 계획 — **이 함수가 이 파일의 심장이다.**
 *   순수 함수라 DB·Neo4j 없이 그대로 돌려 볼 수 있다(하니스가 그렇게 검증한다).
 *
 * @param classes  카페24에서 읽은 수업들
 * @param links    카페24 강사번호 → 이름·원부번호
 * @param students 존재하는 학생 계정 → 이름 (없으면 no_student)
 * @param existing 창 안에 이미 있는 class_schedules 행들
 * @param mode     off | whitelist | all
 * @param enabled  whitelist 모드에서 켜 둔 원부번호 집합
 */
export function planMirror(
  classes: C24Class[],
  links: Map<string, TeacherLink>,
  students: Map<string, string | null>,
  existing: ExistingRow[],
  mode: MirrorMode,
  enabled: Set<string>,
  /* 🪞 (2026-09-01) 명부에서 숨긴 학생 — 이 계정의 수업은 만들지 않는다.
       발단: 사장님 확인 「MANGO AI는 테스트 계정이야, 미러에서 빼줘」.
       카페24에는 그 계정으로 앞으로 10건이 잡혀 있고, 그중 3자리는 여러 강사가
       같은 시각에 겹쳐 있었다(시험용이라 그렇다).
     ⛔ no_student 로 뭉뚱그리지 않는다 — 그건 「계정이 없다」는 거짓이고 화면에 경고로 떠서
        «고쳐야 할 것» 으로 읽힌다. 일부러 뺀 것은 그렇게 말해야 한다.
     ⚠️ 기본값은 빈 집합이다(옛 호출부·하니스가 그대로 돈다). */
  hiddenStudents: Set<string> = new Set(),
  /* 🕰️ (2026-09-01) 카페24 이력에서 «그 슬롯이 지금까지 몇 번 잡혔나» — slotKey() 로 센 값.
       아래 «강사 변경 잔재» 판정이 이것 하나로 갈린다.
     ⚠️ 비어 있으면(=이력을 못 읽었거나 스위치를 껐으면) 그 판정을 **통째로 건너뛴다**.
        「0건이었다」와 「안 봤다」를 구분하지 못하면 멀쩡한 수업이 무더기로 막힌다
        (같은 방어가 이 파일의 «취소 단계 건너뛰기» 에도 있다).
     ⚠️ 기본값은 빈 Map 이다 — 옛 호출부·하니스가 그대로 돈다. */
  slotSeen: Map<string, number> = new Map(),
): PlanRow[] {
  const out: PlanRow[] = [];

  /* 같은 학생·같은 날에 카페24가 몇 건을 들고 있나. 잔재 판정의 «입구» 조건이다. */
  const perDay = new Map<string, number>();
  for (const c of classes) {
    const k = `${String(c.user_id || '')}|${String(c.date || '')}`;
    perDay.set(k, (perDay.get(k) || 0) + 1);
  }

  for (const c of classes) {
    const date = String(c.date || '');
    const time = msToKstHm(c.start_ms);
    const dur = classMinutes(c.start_ms, c.end_ms);
    const uid = String(c.user_id || '');
    const c24tid = c.teacher_id == null || c.teacher_id === '' ? null : String(c.teacher_id);
    const link = c24tid ? links.get(c24tid) : undefined;
    const teacherName = link?.name ?? null;
    const teacherId = link?.teacherId ?? null;

    const base = {
      class_id: String(c.class_id || ''),
      date, start_time: time, duration_min: dur, class_state: Number(c.class_state) || 0,
      c24_teacher_id: c24tid, teacher_name: teacherName, teacher_id: teacherId,
      student_uid: uid, student_name: students.get(uid) ?? null,
    };
    const push = (verdict: Verdict, detail?: string, existingId?: number | null) =>
      out.push({ ...base, verdict, detail, existing_id: existingId ?? null });

    // ── 1) 만들 수 없는 것부터 걸러 낸다. ⛔ 추측해서 잇지 않는다 ──
    if (!uid || !students.has(uid)) { push('no_student', uid ? `학생 계정 ${uid} 없음` : '학생 없음'); continue; }
    /* 🙈 명부에서 숨긴 계정(시험용 등)은 «일부러» 만들지 않는다 — 사실대로 말한다. */
    if (hiddenStudents.has(uid)) {
      push('student_hidden', `«${students.get(uid) || uid}»(${uid}) 은 명부에서 숨긴 계정입니다 — 일부러 만들지 않습니다`);
      continue;
    }
    if (!c24tid) { push('no_teacher', '카페24에 강사 번호가 없음'); continue; }
    if (!teacherId) {
      /* 🚪 퇴사자인가 — 같은 «못 이음» 이라도 사람이 할 일이 정반대라 갈라서 말한다. */
      if (link?.leftTeacherId) {
        push('no_teacher_left', `«${teacherName}»(카페24 ${c24tid}) 은 퇴사한 강사입니다 — 카페24에만 남은 잔재`);
        continue;
      }
      push('no_teacher', teacherName
        ? `«${teacherName}»(카페24 ${c24tid}) 이 강사 원부와 안 이어짐`
        : `카페24 ${c24tid} 번 이름을 찾지 못함`);
      continue;
    }

    // ── 2) 이미 있는 행과 맞춰 본다 ──
    const mine = existing.filter(e => String(e.status || '') !== 'cancelled' && sameSlot({ user_id: uid, date, time }, e));
    const manual = existing.find(e =>
      String(e.source || '') === MIRROR_SOURCE_MANUAL
      && String(e.user_id || '') === uid
      && String(e.scheduled_date || '') === date);
    if (manual) {
      // 🔒 사람이 손댄 수업. 미러는 손대지 않는다. 값이 다르면 «어긋남» 으로 알린다.
      const sameTime = String(manual.start_time || '').slice(0, 5) === time;
      if (sameTime) push('manual_locked', '사람이 고친 수업 — 미러가 건드리지 않습니다', manual.id);
      else push('diverged', `카페24 ${time} ↔ 망고아이 ${String(manual.start_time || '').slice(0, 5)} (사람이 고침)`, manual.id);
      continue;
    }
    const mirrored = mine.find(e => String(e.source || '') === MIRROR_SOURCE);
    if (mirrored) {
      const sameTeacher = String(mirrored.teacher_id || '') === teacherId;
      const sameDur = Number(mirrored.duration_min || 0) === dur;
      if (sameTeacher && sameDur) push('already', undefined, mirrored.id);
      else push('update', sameTeacher ? `수업 길이 ${mirrored.duration_min}분 → ${dur}분` : `강사 변경 → ${teacherName}`, mirrored.id);
      continue;
    }
    const other = mine.find(e => String(e.source || '') !== MIRROR_SOURCE);
    if (other) { push('conflict', `그 시간에 이미 수업이 있습니다 (${other.source || '출처 미상'})`); continue; }

    /* ── 2-b) 🔴 «강사 변경 잔재» 막기 (2026-09-01 실사고) ────────────────────
       발단: Zee 를 켠 날, 강사 화면에 **없는 수업**이 떴다 — 9/1 17:40 허윤아(카페24 511745).
             카페24가 강사를 바꿀 때 옛 예약을 지우지 않고 남기는데, 미러는 카페24를 정본으로
             삼으므로 그것을 그대로 만든다. 강사는 20분을 헛기다렸고 학생 노쇼까지 찍혔다.

       ⛔ 「같은 학생·같은 날 2건이면 잔재」로 막으면 **안 된다** — 허윤아는 진짜로 하루 두 번
          (17:00·21:30) 수업한다. 그렇게 막았으면 멀쩡한 수업이 사라졌다.
       ✅ 실제로 가르는 신호는 **«그 자리가 되풀이되는가»** 하나뿐이다. 실측(2026-09-01):
            허윤아·Zee 21:30 → 이력 4건(8/31·9/1·9/2·9/4)  = 진짜
            허윤아·Zee 17:40 → 이력 **1건**(그 유령 자신뿐) = 잔재
            한채아·Belle 15:10 → 2건(8/25 실제 수업 포함)   = 진짜
       ⚠️ 그래서 조건이 **둘 다** 맞아야 한다 — ① 그날 그 학생에게 카페24 수업이 2건 이상이고
          ② 그중 이 자리가 이력에 한 번뿐. ①이 없으면 «새로 생긴 주간 수업» 이 전부 막힌다.
       ⛔ 이미 만들어진 행은 건드리지 않는다(위 already/update/conflict 가 먼저 continue 한다).
          이 판정은 «새로 만드는 것» 만 막는 예방책이지, 지난 일을 되짚어 지우지 않는다.
       ✅ 실패 방향은 «안 만드는 쪽» 이다 — 진짜 수업이 하루 늦게 뜨는 것보다, 없는 수업을
          기다리게 하는 쪽이 나쁘다(파일럿이라 강사는 카페24로 들어갈 수 있다).

       ✅ **켜기 전에 «지금 살아 있는 행 전부» 에 돌려 봤다**(2026-09-01, 운영 D1 실측).
            미러가 만들어 둔 active 48건 중 **47건은 그대로 통과**했고 걸린 것은 **1건뿐**인데,
            그 1건(한채아·Belle 9/1 21:00)은 사람이 따로 의심해 두었던 바로 그 건이었다.
            ⟹ 오검출 0건. 하루 두 번 수업하는 학생(허윤아 17:00/21:30, 손현규, 이다연, 이선우)도
               전부 통과했다. **새 판정을 넣을 때는 이렇게 «지금 맞는 것을 깨지 않는가» 를 먼저 재라.**

       ⚠️ **이 판정은 완전하지 않다 — 그렇게 적어 둔다.** 카페24가 «같은 자리» 에 잔재를 둘 이상
          남기면 이력이 2건이 되어 그냥 통과한다. 실제로 그런 모양이 있다: 허윤아·Far 17:00 은
          8/27·9/1 두 건인데 8/27 에 실제로 있었던 수업은 17:20 이었다(그 17:00 도 잔재로 보인다).
          ⟹ 근본 해결은 **카페24가 취소·변경을 어떻게 표시하는지 확인해 그것으로 거르는 것**이다.
             그 답을 찾으려고 성적표에 `prop_keys`(:Class 속성 이름)를 함께 싣는다. 그때까지
             이 판정은 «자주 나는 한 유형» 만 막는 임시 방어다. */
    const dayCount = perDay.get(`${uid}|${date}`) || 0;
    const suspect = slotSeen.size > 0
      && dayCount > 1
      && (slotSeen.get(slotKey(uid, c24tid, time)) || 0) < 2;

    // ── 3) 만들 수 있다. 모드에 따라 실제로 만들지가 갈린다 ──
    if (!(mode === 'all' || (mode === 'whitelist' && enabled.has(teacherId)))) {
      /* ⚠️ 아직 안 켠 강사는 판정을 바꾸지 않는다(집계가 흐트러진다). 대신 «켜기 전에 볼 것» 을
         한 줄 덧붙인다 — 이 신호가 성적표에 안 보이면 다음 강사를 켤 때 같은 사고가 난다. */
      push('not_whitelisted',
        (mode === 'off' ? '그림자 단계 — 아직 만들지 않습니다' : '아직 켜지 않은 강사')
        + (suspect ? ' ⚠ 이 자리는 «강사 변경 잔재» 로 의심됩니다 — 켜기 전에 카페24에서 확인하세요' : ''));
      continue;
    }
    if (suspect) {
      push('suspect_dup',
        `그날 이 학생의 카페24 수업이 ${dayCount}건인데, 그중 이 ${time} 자리는 이력에 한 번뿐입니다`
        + ' — 강사 변경 잔재로 의심되어 만들지 않았습니다. 카페24에서 확인해 주세요');
      continue;
    }
    push('ok');
  }

  return out;
}

/** 판정별 건수 — 화면 성적표의 윗줄 */
export function summarize(rows: PlanRow[]): Record<Verdict, number> {
  const z: Record<Verdict, number> = {
    ok: 0, already: 0, update: 0, manual_locked: 0, diverged: 0,
    no_teacher: 0, no_teacher_left: 0, no_student: 0, student_hidden: 0, not_whitelisted: 0,
    suspect_dup: 0, conflict: 0,
  };
  for (const r of rows) z[r.verdict]++;
  return z;
}

/* ═══════════════ 여기부터는 DB·Neo4j 를 만진다 (읽기만) ═══════════════ */

export interface MirrorEnv { DB: D1Database; [k: string]: any; }

/** 설정·화이트리스트 표 — 없으면 만든다(모드 기본값 off = 그림자) */
export async function ensureMirrorTables(env: MirrorEnv): Promise<void> {
  try {
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS c24_mirror_config (k TEXT PRIMARY KEY, v TEXT NOT NULL, updated_at INTEGER)`);
  } catch { /* 표가 이미 있으면 그대로 */ }
  try {
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS c24_mirror_teachers (teacher_id TEXT PRIMARY KEY, enabled INTEGER DEFAULT 1, note TEXT, updated_by TEXT, updated_at INTEGER)`);
  } catch { /* 같음 */ }
  /* 🔴 «같은 카페24 수업을 두 번 만들지 않는다» 를 DB 가 보증한다 (2026-08-31 자동 실행과 함께).
     왜 필요한가 — 자동 실행이 두 갈래(15분 감시견 · 야간 cron)인데, **18:00 UTC 정각에는
     둘이 동시에 운다.** 두 호출이 각각 «아직 없네» 로 읽고 나란히 INSERT 하면 같은 수업이
     두 벌 생긴다(코드로는 못 막는다 — 서로 다른 워커 호출이라 순서를 알 수 없다).
     부분 유니크 인덱스라 **미러 행에만** 걸리고 사람이 만든 수업은 건드리지 않는다.
     ⚠️ 두 번째 INSERT 는 실패하고 그 사유가 결과의 errors 에 남는다 — 조용히 삼켜지지 않는다.
     ⛔ notes 형식(`c24:<class_id>`)을 바꾸면 이 보증이 통째로 풀린다. */
  try {
    await env.DB.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_c24_mirror_class ON class_schedules(notes) WHERE source='c24-mirror'`);
  } catch { /* 이미 있거나, 옛 중복이 남아 있으면 만들지 않는다(사람이 정리) */ }
}

/** 지금 모드. 읽기 실패·미설정이면 **가장 안전한 'off'**(그림자)로 떨어진다. */
export async function getMirrorMode(env: MirrorEnv): Promise<MirrorMode> {
  try {
    const r: any = await env.DB.prepare(`SELECT v FROM c24_mirror_config WHERE k='mode' LIMIT 1`).first();
    const v = String(r?.v || '');
    if (v === 'all' || v === 'whitelist') return v;
  } catch { /* 표 없음 = 아직 안 켬 */ }
  return 'off';
}

/** 켜 둔 강사(원부번호) 집합 */
export async function getMirrorTeachers(env: MirrorEnv): Promise<Set<string>> {
  const s = new Set<string>();
  try {
    const rs: any = await env.DB.prepare(`SELECT teacher_id FROM c24_mirror_teachers WHERE enabled = 1`).all();
    for (const r of (rs.results || [])) s.add(String(r.teacher_id));
  } catch { /* 표 없음 = 켠 강사 없음 */ }
  return s;
}

/**
 * ⛔ **명시적으로 «끈» 강사**(c24_mirror_teachers.enabled = 0).
 *
 * 🔴 왜 «없음» 과 다른가 — 화이트리스트는 «적혀 있으면 켠다» 이므로 «없는 강사» 는
 *    whitelist 모드에서만 안 만들어지고 **mode='all' 에서는 전부 만들어진다.**
 *    그런데 전환일에는 반드시 'all' 로 올린다. 그때 **퇴사 강사의 잔재까지 함께 만들어진다.**
 *    2026-09-01 실측: 퇴사한 Teacher Mariane(카페24 24)의 카페24 예약이 앞으로 30건 남아 있고,
 *    그중 6건은 «다른 강사와 같은 학생·같은 시각» 이었다(사장님 확인 — 그만두어 수업 안 함).
 *    'all' 로 올리는 순간 그 30건이 학생 시간표에 생긴다.
 * ✅ 그래서 enabled=0 은 «아직 안 켬» 이 아니라 **«켜지 마라»** 는 뜻이고, 'all' 도 이깁니다.
 */
export async function getMirrorBlocked(env: MirrorEnv): Promise<Set<string>> {
  const s = new Set<string>();
  try {
    const rs: any = await env.DB.prepare(`SELECT teacher_id FROM c24_mirror_teachers WHERE enabled = 0`).all();
    for (const r of (rs.results || [])) s.add(String(r.teacher_id));
  } catch { /* 표 없음 = 막은 강사 없음 */ }
  return s;
}

/** 카페24 강사번호 → 이름·원부번호 (파일 머리말의 «강사 번호» 규칙 그대로) */
export async function loadTeacherLinks(env: MirrorEnv, uids: (string | null)[]): Promise<Map<string, TeacherLink>> {
  const out = new Map<string, TeacherLink>();
  const want = new Set(uids.map(u => String(u ?? '').trim()).filter(Boolean));
  if (!want.size) return out;

  /* 원부 이름 → id. 같은 이름이 둘 이상이면 «잇지 않음»(null) 으로 못 박는다.
     🔴 (2026-08-31 그림자 1일차 실측) 이름이 한 글자도 안 틀렸는데 **접두어** 때문에
        못 잇는 강사가 있었다 — 카페24 «Teacher Ness» → 'ness' 인데 원부는 «HT NESS» → 'ht ness'.
        막힌 14건 중 13건이 이 한 사람이었다.
     ✅ 그래서 «접두어가 붙은 경우만 단어 단위로» 한 번 더 본다. 이 규칙은 내가 새로 만든 것이
        아니라 이 저장소가 이미 쓰는 것이다(`js/adm-q6.js` 의 ph54ResolveTeacherId,
        `teacher_weekly_calendar_id_space_harness` 가 「HT NESS 는 단어 단위로 맞다」로 못 박음).
     ⛔ 부분일치(substring)는 절대 금지 — 'FAR' 가 'HT FARRAH' 에 걸려 남의 일정이 뜬 사고가
        실제로 있었다. 낱말 «전체» 가 같을 때만이고, 그래서 'farr' 는 'farrah' 에 안 걸린다.
     ⛔ 그리고 후보가 둘 이상이면 잇지 않는다 — 모르는 것보다 틀린 것이 나쁘다(CLAUDE.md 2장).
        (실제로 'ht' 라는 낱말은 HT NESS·HT FARRAH 둘이 나눠 가지므로 자동으로 «모름» 이 된다) */
  let roster: { id: any; name: any }[] = [];
  try {
    const rs: any = await env.DB.prepare(`SELECT id, name FROM teachers WHERE active = 1`).all();
    roster = (rs.results || []) as any[];
  } catch { /* 원부가 없으면 이름만 준다 */ }
  const resolveRoster = buildRosterResolver(roster);

  /* 🚪 퇴사자 명부 — «못 이었다» 와 «퇴사해서 안 잇는다» 를 가르기 위한 것뿐이다.
     ⛔ 이 결과로 수업을 만들지 않는다(만드는 것은 verdict 'ok' 뿐이고 퇴사자는 절대 ok 가 안 된다).
     ⚠️ 실패해도 그냥 넘어간다 — 못 읽으면 예전처럼 «원부에 없음» 으로 보일 뿐, 더 안전한 쪽이다. */
  let leftRoster: { id: any; name: any }[] = [];
  try {
    const rs: any = await env.DB.prepare(`SELECT id, name FROM teachers WHERE active = 0`).all();
    leftRoster = (rs.results || []) as any[];
  } catch { /* 없으면 가르지 않는다 */ }
  const resolveLeft = buildRosterResolver(leftRoster);

  try {
    // 오름차순 — 같은 번호가 여러 달 있으면 «최근 달 이름» 이 남는다(개명 반영)
    const rs: any = await env.DB.prepare(
      `SELECT CAST(teacher_id AS TEXT) AS c24, teacher_name FROM teacher_payroll_auto
        WHERE teacher_name IS NOT NULL AND teacher_name <> '' ORDER BY year ASC, month ASC`
    ).all();
    for (const r of (rs.results || [])) {
      const c24 = String(r.c24 || '');
      if (!want.has(c24)) continue;
      const nm = String(r.teacher_name || '').trim();
      const tid = resolveRoster(nm);
      out.set(c24, {
        name: nm || null,
        teacherId: tid,
        // 재직 원부에서 못 찾았을 때만 퇴사자 명부를 본다(재직이 언제나 이긴다)
        leftTeacherId: tid ? null : resolveLeft(nm),
      });
    }
  } catch { /* 급여 표가 없으면 이름 없이 진행 */ }
  return out;
}

/** 학생 계정 존재 확인 (있으면 이름도) — 없는 계정에는 수업을 만들지 않는다
 *  ⚠️ IN 목록은 손으로 자르지 않는다. D1 바인드 100개 한도는 공용 헬퍼가 센다(CLAUDE.md 2장).
 *     swallowErrors — students_erp 가 없는 옛 DB 에서도 «학생 못 찾음» 으로 이어져야 하고,
 *     그 결과는 «만들지 않는» 쪽이라 조용히 비어도 안전하다. */
export async function loadStudents(env: MirrorEnv, uids: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const want = Array.from(new Set(uids.filter(Boolean)));
  if (!want.length) return out;
  const rows = await selectInChunks<any>(
    env.DB, want,
    (ph) => `SELECT user_id, korean_name FROM students_erp WHERE user_id IN (${ph})`,
    { swallowErrors: true },
  );
  for (const r of rows) out.set(String(r.user_id), r.korean_name ? String(r.korean_name) : null);
  return out;
}

/** 창 안의 기존 시간표. ⚠️ 양쪽 경계 필수 */
export async function loadExisting(env: MirrorEnv, since: string, until: string): Promise<ExistingRow[]> {
  try {
    const rs: any = await env.DB.prepare(
      `SELECT id, user_id, teacher_id, scheduled_date, start_time, duration_min, source, status, notes
         FROM class_schedules
        WHERE scheduled_date IS NOT NULL AND scheduled_date >= ? AND scheduled_date <= ?`
    ).bind(since, until).all();
    return (rs.results || []) as ExistingRow[];
  } catch { return []; }
}

/**
 * 🕰️ 카페24 «슬롯 이력» — (학생, 강사, 시각) 조합이 지금까지 몇 번 잡혔나.
 *   「강사 변경 잔재」 판정의 유일한 근거다(planMirror 의 suspect_dup 주석 참고).
 *
 * ℹ️ 왜 Neo4j 가 아니라 `attendance` 인가 — 그 표에는 야간 동기화가 카페24 :Class 를
 *    **-60일 ~ +180일** 로 이미 넣어 두었다(`importCafe24Attendance`). 미러의 창(3일·14일)보다
 *    훨씬 넓어서 「되풀이되는 자리인가」를 제대로 셀 수 있고, Neo4j 를 한 번 더 부르지 않는다.
 * ⚠️ 그래서 «오늘 카페24에 새로 잡힌 수업» 은 야간 동기화 전까지 이력이 0건이다. 그때는
 *    (그날 2건 이상일 때만) 하루 보류됐다가 다음 날 저절로 만들어진다 — 안전한 방향의 실패다.
 * ⛔ status 로 거르지 않는다 — 하는 일이 «세기» 라 넓게 잡는 쪽이 맞다(좁히면 유령이 샌다).
 * ⚠️ IN 목록은 손으로 자르지 않는다(D1 바인드 100개 한도). swallowErrors — 표가 없으면
 *    빈 Map 이 되고, 빈 Map 은 «판정을 건너뛴다» 는 뜻이라 옛 동작 그대로가 된다.
 */
export async function loadSlotHistory(env: MirrorEnv, uids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const want = Array.from(new Set(uids.filter(Boolean)));
  if (!want.length) return out;
  const rows = await selectInChunks<any>(
    env.DB, want,
    (ph) => `SELECT user_id, teacher_uid,
                    strftime('%H:%M', joined_at/1000, 'unixepoch', '+9 hours') AS hm,
                    COUNT(*) AS n
               FROM attendance
              WHERE room_id LIKE 'c24-%' AND user_id IN (${ph})
              GROUP BY user_id, teacher_uid, hm`,
    { swallowErrors: true },
  );
  for (const r of rows) {
    out.set(
      slotKey(String(r.user_id || ''), r.teacher_uid == null ? null : String(r.teacher_uid), String(r.hm || '')),
      Number(r.n) || 0,
    );
  }
  return out;
}

/** 🔌 「강사 변경 잔재」 판정 스위치. 기본은 켬 — `c24_mirror_config` 에 `dup_guard='off'` 면 끈다.
 *  ⚠️ 끄면 잔재가 그대로 만들어진다. 전환일에 이 판정이 헛돌 때의 **되돌리는 길**로만 둔 것이다. */
export async function getDupGuard(env: MirrorEnv): Promise<boolean> {
  try {
    const r: any = await env.DB.prepare(`SELECT v FROM c24_mirror_config WHERE k='dup_guard' LIMIT 1`).first();
    return String(r?.v ?? 'on') !== 'off';
  } catch { return true; }
}

/**
 * 🔎 카페24 :Class 가 실제로 들고 있는 속성 «이름» 목록 (값은 안 가져온다).
 *   왜 — 「카페24는 취소를 어떻게 표시하나」를 아직 모른다. `class_state` 는 잔재와 진짜가
 *   같은 값(1)이라 못 가른다. 우리가 안 읽고 있는 칸이 답을 들고 있을 수 있으므로 **이름만**
 *   성적표에 실어 카페24에 물어볼 근거로 삼는다(선례: `c24-expense-filter.ts` 의 prop_keys).
 * ⛔ 이 값으로 판정하지 말 것 — 뜻이 확인된 뒤에 거르는 것이 순서다.
 * ⚠️ 리포트(읽기)에서만 부른다. 쓰기 경로(applyMirror)는 건드리지 않는다.
 */
export async function fetchC24ClassPropKeys(
  env: MirrorEnv,
  runCypher: (env: any, q: string, p: Record<string, unknown>, m: 'READ' | 'WRITE') => Promise<{ fields: string[]; values: any[][] }>,
  since: string, until: string,
): Promise<string[]> {
  try {
    const { fields, values } = await runCypher(env,
      `MATCH (c:Class) WHERE c.date >= $since AND c.date <= $until
        UNWIND keys(c) AS k
        RETURN DISTINCT k AS k ORDER BY k LIMIT 200`,
      { since, until }, 'READ');
    const i = Math.max(0, fields.indexOf('k'));
    return values.map(v => String(v[i]));
  } catch { return []; }
}

/** 카페24 :Class 읽기 — importCafe24Attendance 와 «같은 모양» 으로 뽑는다 */
export async function fetchC24Classes(
  env: MirrorEnv,
  runCypher: (env: any, q: string, p: Record<string, unknown>, m: 'READ' | 'WRITE') => Promise<{ fields: string[]; values: any[][] }>,
  since: string, until: string, limit = 3000,
): Promise<C24Class[]> {
  const { fields, values } = await runCypher(env,
    `MATCH (c:Class) WHERE c.date >= $since AND c.date <= $until
      RETURN c.class_id AS class_id, c.user_id AS user_id, c.start_ms AS start_ms, c.end_ms AS end_ms,
             c.date AS date, c.class_state AS class_state,
             coalesce(c.teacher_id, c.teacher_no, c.t_id) AS teacher_id
      ORDER BY c.date, c.start_ms LIMIT $lim`,
    { since, until, lim: limit }, 'READ');
  return values.map(row => {
    const o: any = Object.fromEntries(fields.map((f, i) => [f, row[i]]));
    return {
      class_id: String(o.class_id ?? ''),
      user_id: String(o.user_id ?? ''),
      date: String(o.date ?? ''),
      start_ms: Number(o.start_ms) || 0,
      end_ms: Number(o.end_ms) || 0,
      class_state: Number(o.class_state) || 0,
      teacher_id: o.teacher_id == null ? null : String(o.teacher_id),
    };
  });
}

/**
 * 📋 그림자 리포트 — «옮겼다면 어떻게 됐을지» 를 계산만 한다. **아무것도 쓰지 않는다.**
 *   창 기본값: 오늘 ~ +14일 (KST). 양쪽 경계를 반드시 준다.
 */
export async function c24MirrorReport(
  env: MirrorEnv,
  runCypher: (env: any, q: string, p: Record<string, unknown>, m: 'READ' | 'WRITE') => Promise<{ fields: string[]; values: any[][] }>,
  opt: { since?: string; until?: string } = {},
): Promise<{
  ok: true; mode: MirrorMode; since: string; until: string;
  total: number; summary: Record<Verdict, number>;
  by_state: Record<string, number>;
  /** 마지막 «자동 실행» 기록 — 「cron 이 정말 돌고 있나」를 성적표에서 바로 본다.
      비어 있으면 아직 한 번도 안 돌았다는 뜻이다(모드가 off 면 건너뛴 기록이 남는다). */
  last_runs: Record<string, any>;
  by_date: { date: string; total: number; ok: number; blocked: number }[];
  rows: PlanRow[];
  /* 🔎 (2026-09-01) 카페24 :Class 의 속성 «이름» 목록. 「취소를 어떻게 표시하나」를
     카페24에 물어볼 근거다 — 값이 아니라 이름만이고, 판정에는 쓰지 않는다. */
  prop_keys: string[];
  /** 「강사 변경 잔재」 판정이 켜져 있나 (dup_guard). 꺼져 있으면 성적표가 그렇게 말해야 한다. */
  dup_guard: boolean;
  /* 🖥️ (2026-09-01) 관리자 화면에서 «지금 켠/막은 강사» 를 보여 주려고 더했다.
     읽기만 추가한 것이라 기존 호출자는 그대로다(하니스가 이 필드를 요구하지 않는다). */
  enabled_teachers: string[];
  blocked_teachers: string[];
}> {
  await ensureMirrorTables(env);
  const kstToday = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const since = opt.since || kstToday;
  const until = opt.until || new Date(Date.now() + 9 * 3600 * 1000 + 14 * 86400000).toISOString().slice(0, 10);

  const [mode, enabled, blocked, lastRuns, dupGuard] = await Promise.all([
    getMirrorMode(env), getMirrorTeachers(env), getMirrorBlocked(env), getMirrorLastRuns(env), getDupGuard(env),
  ]);
  const classes = await fetchC24Classes(env, runCypher, since, until);
  const [links, students, existing] = await Promise.all([
    loadTeacherLinks(env, classes.map(c => c.teacher_id)),
    loadStudents(env, classes.map(c => c.user_id)),
    loadExisting(env, since, until),
  ]);

  const hidden = await loadHiddenStudents(env as any, Array.from(students.keys()));
  const slotSeen = dupGuard ? await loadSlotHistory(env, classes.map(c => c.user_id)) : new Map<string, number>();
  const rows = planMirror(classes, links, students, existing, mode, enabled, hidden, slotSeen);
  const summary = summarize(rows);

  const byDate = new Map<string, { date: string; total: number; ok: number; blocked: number }>();
  for (const r of rows) {
    const d = byDate.get(r.date) || { date: r.date, total: 0, ok: 0, blocked: 0 };
    d.total++;
    if (r.verdict === 'ok' || r.verdict === 'already') d.ok++;
    if (r.verdict === 'no_teacher' || r.verdict === 'no_teacher_left'
        || r.verdict === 'no_student' || r.verdict === 'conflict'
        || r.verdict === 'suspect_dup') d.blocked++;
    byDate.set(r.date, d);
  }

  /* 🔎 카페24 원본 상태값 분포 — «유령 수업» 을 가려낼 단서가 여기 있는지 보려는 것이다.
     값이 한 가지뿐이면 상태로는 못 가른다는 뜻이고, 그때는 다른 속성을 찾아야 한다. */
  const byState: Record<string, number> = {};
  for (const r of rows) byState[String(r.class_state)] = (byState[String(r.class_state)] || 0) + 1;

  return {
    ok: true, mode, since, until,
    total: rows.length, summary, by_state: byState, last_runs: lastRuns,
    by_date: Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date)),
    rows,
    prop_keys: await fetchC24ClassPropKeys(env, runCypher, since, until),
    dup_guard: dupGuard,
    enabled_teachers: Array.from(enabled).sort(),
    blocked_teachers: Array.from(blocked).sort(),
  };
}

/* ═══════════════ 2단계 — 실제로 만든다 (쓰기) ═══════════════
   2026-08-31 사장님 승인: 「Ana 한 사람만 켜서 실제로 만들어 보자」.

   ⛔ 절대 규칙 (위 머리말 1~4번의 실행판)
     · 손대는 행은 `source='c24-mirror'` **하나뿐**. 파일럿(`adm-enroll:*`)·수동 수업·
       도장 찍힌 행(`c24-mirror:manual`)은 SQL 조건에서 애초에 제외한다.
     · 만들 수 있는 것(`ok`)만 만든다. 강사·학생을 못 이었으면 **안 만든다**.
     · 지우지 않는다 — `status='cancelled'` 로만 내린다(되돌릴 수 있다).
     · dry_run 이 **기본값**이다. 「건수 확인 → 사람 확인 → 실행」 두 단계
       (`purge-placeholders` 가 쓰는 것과 같은 방식).
*/

/** 실행 결과 — 계획과 실제를 «따로» 센다. 계획만 세고 못 쓴 것이 있으면 그대로 드러난다. */
export interface MirrorApplyResult {
  ok: true;
  dry_run: boolean;
  mode: MirrorMode;
  since: string;
  until: string;
  enabled_teachers: string[];
  /** ⛔ 명시적으로 끈 강사 — mode='all' 에서도 안 만든다(퇴사자 잔재 방지) */
  blocked_teachers: string[];
  planned: { create: number; update: number; cancel: number };
  applied: { created: number; updated: number; cancelled: number };
  summary: Record<Verdict, number>;
  by_state: Record<string, number>;
  /** 실제로 만든/고친/내린 것 (사람이 눈으로 확인할 수 있게) */
  changes: { action: 'create' | 'update' | 'cancel'; class_id: string | null; date: string | null;
             start_time: string | null; student: string | null; teacher_id: string | null; id?: number }[];
  /** 못 한 것 — 조용히 삼키지 않는다 */
  errors: string[];
  /** ⚠️ 취소 단계를 건너뛴 이유(있을 때만). 「0건이었다」와 「안 봤다」는 다르다. */
  cancel_skipped?: string;
}

/**
 * 🔧 미러 실행. `dry_run` 이 true(기본)면 **한 줄도 쓰지 않고** 계획만 돌려준다.
 *
 * @param opt.dry_run  기본 true. false 로 줘야 실제로 쓴다.
 * @param opt.only_teacher_id  원부번호 하나로 더 좁힌다(첫 시험용). 화이트리스트와 **둘 다** 만족해야 한다.
 */
export async function applyMirror(
  env: MirrorEnv,
  runCypher: (env: any, q: string, p: Record<string, unknown>, m: 'READ' | 'WRITE') => Promise<{ fields: string[]; values: any[][] }>,
  opt: { since?: string; until?: string; dry_run?: boolean; only_teacher_id?: string; actor?: string } = {},
): Promise<MirrorApplyResult> {
  await ensureMirrorTables(env);
  const dryRun = opt.dry_run !== false;         // ⛔ 기본은 «안 쓴다». 명시적으로 false 를 줘야 쓴다.
  const actor = String(opt.actor || 'c24-mirror');
  const kstToday = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const since = opt.since || kstToday;
  const until = opt.until || new Date(Date.now() + 9 * 3600 * 1000 + 14 * 86400000).toISOString().slice(0, 10);

  const [mode, enabled, blocked, dupGuard] = await Promise.all([
    getMirrorMode(env), getMirrorTeachers(env), getMirrorBlocked(env), getDupGuard(env),
  ]);
  const classes = await fetchC24Classes(env, runCypher, since, until);
  const [links, students, existing] = await Promise.all([
    loadTeacherLinks(env, classes.map(c => c.teacher_id)),
    loadStudents(env, classes.map(c => c.user_id)),
    loadExisting(env, since, until),
  ]);

  const hidden = await loadHiddenStudents(env as any, Array.from(students.keys()));
  /* 🕰️ 「강사 변경 잔재」 판정의 근거. 못 읽으면 빈 Map 이고, 빈 Map 은 «그 판정을 건너뛴다» 다. */
  const slotSeen = dupGuard ? await loadSlotHistory(env, classes.map(c => c.user_id)) : new Map<string, number>();
  const rows = planMirror(classes, links, students, existing, mode, enabled, hidden, slotSeen);
  const summary = summarize(rows);
  const byState: Record<string, number> = {};
  for (const r of rows) byState[String(r.class_state)] = (byState[String(r.class_state)] || 0) + 1;

  /* 「이번 실행이 손댈 강사」 — 화이트리스트 ∩ only_teacher_id.
     ⛔ only_teacher_id 를 준다고 화이트리스트를 건너뛰지 않는다(둘 다 만족해야 함). */
  const touch = (tid: string | null): boolean => {
    if (!tid) return false;
    /* ⛔ 명시적으로 «끈» 강사는 mode='all' 도 이긴다 — 퇴사자의 잔재를 전환일에 만들지 않는다.
       ⚠️ 이 줄을 mode 검사 «뒤» 로 옮기면 보호가 통째로 풀린다. 반드시 맨 앞. */
    if (blocked.has(tid)) return false;
    if (opt.only_teacher_id && String(opt.only_teacher_id) !== tid) return false;
    return mode === 'all' || enabled.has(tid);
  };

  const creates = rows.filter(r => r.verdict === 'ok' && touch(r.teacher_id));
  const updates = rows.filter(r => r.verdict === 'update' && touch(r.teacher_id) && r.existing_id);

  /* ── 카페24에서 «사라진» 수업 되짚기 ──────────────────────────────
     카페24가 정본이므로 없어진 수업은 망고아이에서도 내려야 한다.
     🔴 그런데 이 단계가 제일 위험하다 — 카페24 조회가 한 번 비면 그 순간 전부 내려간다.
        그래서 «비면 아예 손대지 않는다». teacher-match.ts 의 「강사 0건이면 전체
        비활성화 사고 방지로 skip」 과 같은 방어다. 건너뛰면 그 이유를 결과에 적는다. */
  let cancels: ExistingRow[] = [];
  let cancelSkipped: string | undefined;
  if (!classes.length) {
    cancelSkipped = '카페24에서 읽은 수업이 0건 — 취소 단계를 건너뜁니다(조회 실패와 구분할 수 없습니다)';
  } else {
    const liveIds = new Set(classes.map(c => String(c.class_id)));
    cancels = existing.filter(e =>
      String(e.source || '') === MIRROR_SOURCE          // ⛔ 내가 만든 행만
      && String(e.status || '') !== 'cancelled'
      && touch(e.teacher_id == null ? null : String(e.teacher_id))
      && (() => { const cid = mirrorNoteClassId(e.notes); return !!cid && !liveIds.has(cid); })());
  }

  const result: MirrorApplyResult = {
    ok: true, dry_run: dryRun, mode, since, until,
    enabled_teachers: Array.from(enabled).sort(),
    blocked_teachers: Array.from(blocked).sort(),
    planned: { create: creates.length, update: updates.length, cancel: cancels.length },
    applied: { created: 0, updated: 0, cancelled: 0 },
    summary, by_state: byState, changes: [], errors: [],
  };
  if (cancelSkipped) result.cancel_skipped = cancelSkipped;

  const brief = (action: 'create' | 'update' | 'cancel', r: PlanRow) => ({
    action, class_id: r.class_id, date: r.date, start_time: r.start_time,
    student: r.student_name || r.student_uid, teacher_id: r.teacher_id,
  });
  if (dryRun) {
    for (const r of creates) result.changes.push(brief('create', r));
    for (const r of updates) result.changes.push(brief('update', r));
    for (const e of cancels) result.changes.push({ action: 'cancel', class_id: mirrorNoteClassId(e.notes),
      date: e.scheduled_date, start_time: e.start_time, student: e.user_id, teacher_id: e.teacher_id, id: e.id });
    return result;
  }

  const now = Date.now();
  for (const r of creates) {
    try {
      await env.DB.prepare(
        `INSERT INTO class_schedules
           (user_id, student_name, schedule_kind, class_type, scheduled_date, start_time,
            duration_min, teacher_id, status, source, created_by, created_at, notes)
         VALUES (?, ?, 'one_off', 'regular', ?, ?, ?, ?, 'active', ?, ?, ?, ?)`
      ).bind(r.student_uid, r.student_name, r.date, r.start_time, r.duration_min,
             r.teacher_id, MIRROR_SOURCE, actor, now, MIRROR_NOTE_PREFIX + r.class_id).run();
      result.applied.created++;
      result.changes.push(brief('create', r));
    } catch (e: any) { result.errors.push(`create ${r.class_id}: ${String(e?.message || e)}`); }
  }
  for (const r of updates) {
    try {
      /* ⛔ WHERE 에 source 를 반드시 건다 — 그 사이 사람이 손댔으면(도장이 찍혔으면)
         이 UPDATE 는 0행이 되어 «사람 손이 이긴다» 가 경합 상황에서도 지켜진다. */
      await env.DB.prepare(
        `UPDATE class_schedules SET start_time = ?, duration_min = ?, teacher_id = ?, updated_at = ?
          WHERE id = ? AND source = ?`
      ).bind(r.start_time, r.duration_min, r.teacher_id, now, r.existing_id, MIRROR_SOURCE).run();
      result.applied.updated++;
      result.changes.push({ ...brief('update', r), id: r.existing_id ?? undefined });
    } catch (e: any) { result.errors.push(`update ${r.class_id}: ${String(e?.message || e)}`); }
  }
  for (const e of cancels) {
    try {
      await env.DB.prepare(
        `UPDATE class_schedules SET status='cancelled', updated_at = ? WHERE id = ? AND source = ?`
      ).bind(now, e.id, MIRROR_SOURCE).run();
      result.applied.cancelled++;
      result.changes.push({ action: 'cancel', class_id: mirrorNoteClassId(e.notes), date: e.scheduled_date,
        start_time: e.start_time, student: e.user_id, teacher_id: e.teacher_id, id: e.id });
    } catch (err: any) { result.errors.push(`cancel ${e.id}: ${String(err?.message || err)}`); }
  }
  return result;
}

/** 모드 바꾸기 (off | whitelist | all) */
export async function setMirrorMode(env: MirrorEnv, mode: MirrorMode): Promise<void> {
  await ensureMirrorTables(env);
  await env.DB.prepare(
    `INSERT INTO c24_mirror_config (k, v, updated_at) VALUES ('mode', ?, ?)
       ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at`
  ).bind(mode, Date.now()).run();
}

/** 강사 한 명 켜기/끄기 (원부번호 기준) */
export async function setMirrorTeacher(
  env: MirrorEnv, teacherId: string, enabled: boolean, actor?: string, note?: string,
): Promise<void> {
  await ensureMirrorTables(env);
  await env.DB.prepare(
    `INSERT INTO c24_mirror_teachers (teacher_id, enabled, note, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(teacher_id) DO UPDATE SET enabled = excluded.enabled, note = excluded.note,
         updated_by = excluded.updated_by, updated_at = excluded.updated_at`
  ).bind(String(teacherId), enabled ? 1 : 0, note ?? null, actor ?? null, Date.now()).run();
}

/* ═══════════════ 3단계 — 자동 실행 (cron 이 부른다) ═══════════════
   2026-08-31 사장님 지시: 「자동 실행도 넣어줘」.

   ⛔ **새 cron 은 못 만든다** — Cloudflare 계정 cron 한도가 5개이고 이미 5개를 다 쓴다
      (`wrangler.toml` crons). 여섯 번째를 등록하면 배포가 code 10072 로 거절된다.
      그래서 기존 트리거에 «얹는다».

   두 갈래로 도는 이유 — 카페24 예약이 «당일에도» 채워지기 때문이다.
   2026-08-31 실측: Ana 의 8/31 수업이 11건인데 9월 이후 예약은 4건뿐이었다.
   하루 한 번만 돌면 그날 오후에 들어온 수업을 놓친다.

     ① 좁은 창 (오늘~+2일)  — 15분 감시견 트리거를 탄다. 당일 추가분을 빨리 따라잡는다.
     ② 넓은 창 (오늘~+14일) — 야간 cron `0 18 * * *`(KST 03:00). 멀리 있는 예약까지 맞춘다.

   ⛔ 「시(hour)」로 가르지 말 것 — 15분 트리거 때문에 하루 네 번 참이 되고 정각에는
      전용 cron 이 별도 호출로 한 번 더 들어와 «동시에» 돈다(CLAUDE.md 2장·index.ts 주석).
   ✅ 끄는 방법은 **모드 하나**다 — `c24_mirror_config.mode='off'` 면 이 함수가 카페24를
      부르지도 않고 그 자리에서 돌아온다(Neo4j 왕복 96회/일을 아끼는 것도 겸한다).
*/

/** 자동 실행 결과 — 「돌았는데 아무것도 안 했다」와 「아예 안 돌았다」를 구분해서 적는다. */
export interface MirrorSweepResult {
  ok: true;
  label: string;
  /** 건너뛴 이유(있을 때만). 없으면 실제로 돌았다는 뜻이다. */
  skipped?: 'mode_off' | 'no_teacher_enabled';
  mode?: MirrorMode;
  since?: string;
  until?: string;
  applied?: { created: number; updated: number; cancelled: number };
  errors?: string[];
  cancel_skipped?: string;
}

/**
 * 🕐 cron 이 부르는 자동 실행. **실패해도 절대 던지지 않는다** — 부르는 쪽이 감시견이라
 *   여기서 예외가 나면 사이트 감시까지 함께 죽는다.
 *
 * @param days  창 길이(일). 좁은 창 2, 넓은 창 14.
 * @param label 기록용 이름('watchdog' | 'nightly'). 마지막 실행이 이 이름으로 남는다.
 */
export async function runMirrorSweep(
  env: MirrorEnv,
  runCypher: (env: any, q: string, p: Record<string, unknown>, m: 'READ' | 'WRITE') => Promise<{ fields: string[]; values: any[][] }>,
  opt: { days: number; label: string },
): Promise<MirrorSweepResult> {
  const label = String(opt.label || 'cron');
  try {
    await ensureMirrorTables(env);
    const mode = await getMirrorMode(env);
    // ⛔ 꺼져 있으면 카페24를 부르지도 않는다 — 이것이 유일한 «끄는 스위치» 다.
    if (mode === 'off') return { ok: true, label, skipped: 'mode_off' };
    const enabled = await getMirrorTeachers(env);
    // 화이트리스트인데 켠 강사가 없으면 할 일이 없다(빈 조회를 아낀다)
    if (mode === 'whitelist' && !enabled.size) return { ok: true, label, skipped: 'no_teacher_enabled' };

    const kstNow = Date.now() + 9 * 3600 * 1000;
    const since = new Date(kstNow).toISOString().slice(0, 10);
    const until = new Date(kstNow + Math.max(0, opt.days) * 86400000).toISOString().slice(0, 10);

    const r = await applyMirror(env, runCypher, { since, until, dry_run: false, actor: `cron:${label}` });
    const out: MirrorSweepResult = {
      ok: true, label, mode: r.mode, since, until, applied: r.applied,
      errors: r.errors, cancel_skipped: r.cancel_skipped,
    };
    /* 마지막 실행을 남긴다 — 「자동으로 도는가」를 사람이 확인할 방법이 이것뿐이다.
       ⚠️ 이 기록이 실패해도 본 작업은 이미 끝났으므로 조용히 넘긴다. */
    try {
      await env.DB.prepare(
        `INSERT INTO c24_mirror_config (k, v, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at`
      ).bind(`last_run:${label}`, JSON.stringify(out).slice(0, 4000), Date.now()).run();
    } catch { /* 기록 실패는 무시 */ }
    return out;
  } catch (e: any) {
    /* ⛔ 던지지 않는다. 대신 «못 돌았다» 를 남겨, 조용히 멈춘 것을 나중에 알아챌 수 있게 한다. */
    const out: MirrorSweepResult = { ok: true, label, errors: [String(e?.message || e)] };
    try {
      await env.DB.prepare(
        `INSERT INTO c24_mirror_config (k, v, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at`
      ).bind(`last_run:${label}`, JSON.stringify(out).slice(0, 4000), Date.now()).run();
    } catch { /* 기록 실패는 무시 */ }
    return out;
  }
}

/** 마지막 자동 실행 기록 — 성적표가 「자동으로 돌고 있나」를 함께 보여 준다 */
export async function getMirrorLastRuns(env: MirrorEnv): Promise<Record<string, any>> {
  const out: Record<string, any> = {};
  try {
    const rs: any = await env.DB.prepare(
      `SELECT k, v, updated_at FROM c24_mirror_config WHERE k LIKE 'last_run:%'`
    ).all();
    for (const r of (rs.results || [])) {
      const key = String(r.k || '').replace(/^last_run:/, '');
      let parsed: any = null;
      try { parsed = JSON.parse(String(r.v || '')); } catch { parsed = String(r.v || ''); }
      out[key] = { at: Number(r.updated_at) || 0, result: parsed };
    }
  } catch { /* 표가 없으면 «아직 안 돌았다» */ }
  return out;
}
