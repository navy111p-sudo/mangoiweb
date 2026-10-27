/**
 * 📵 notify-contacts.ts — 알림 «받는 사람» 은 서버가 정한다 (2026-09-01 신설)
 *
 * [무엇을 막나] `/api/notify/*` 다섯 경로가 **요청 «본문» 에 적힌 전화번호로 그대로 발송**하고
 *   있었다. 인증이 없으므로 누구나 아무 번호에나 「망고아이」 이름으로 문자를 보낼 수 있었다
 *   (돈이 나가고, 우리 이름으로 남을 속일 수 있다).
 *
 * [2026-09-01 — 잰 것]
 *   · `class_no_show` 38건 **전부 `notified_kakao = 0`** (no-show 알림톡은 직접 측정)
 *   · `students_erp` 29,438행의 phone·student_phone·parent_phone 이 **전부 0건**
 * [코드로 확인한 것]
 *   화면이 번호를 꺼내는 곳이 `demoStudents`(js/idx-user-session.js) 인데 **데모 5명짜리
 *   하드코딩이고 전화번호 칸이 없다.** git 이력에도 그 자리에 번호가 들어간 커밋이 0건이다. 그래서
 *     · lesson-started 는 `if (!s || !s.phone) return;` 에서 늘 되돌아갔고(호출 0회)
 *     · lesson-ended·chat-summary 는 실학생이 `demoStudents` 에 없어 `if (!s) return;`
 * [거기서 내린 판단 — 측정 아님] 이 넷은 실제로 발송된 적이 없을 것이다.
 *   ⚠️ **`alimtalk_log` 로는 이걸 확인할 수 없다** — 기록은 `logContext` 가 있을 때만 남는데
 *      sendLessonStartAlert·sendLessonEndAlert·sendChatSummaryAlert·sendMentionAlert 는
 *      그것을 넘기지 않는다(solapi-client.ts). 그 표가 비었다고 «안 보냈다» 의 증거로 쓰지 말 것.
 *   ⟹ 어느 쪽이든 게이트를 걸어도 «되던 알림» 이 깨질 일은 없다. 규칙서 2장에 「호출자가 학생
 *      화면이라 관리자 쿠키를 못 실어서 게이트를 걸면 수업 종료 알림이 깨진다」고 적어 두었는데,
 *      그 전제는 사실이 아니었다.
 *
 * [그래서 어떻게 고쳤나] 게이트를 거는 대신 **번호를 본문에서 안 받는다.**
 *   ⛔ 게이트로 막으면 나중에 전화번호가 들어왔을 때 학생 화면이 다시 막힌다(그때 또 뚫게 된다).
 *   ✅ 번호는 계정(uid)·강사번호로 D1 에서 찾는다 — 아무 번호나 넣을 방법이 사라진다.
 *   ⚠️ **다섯 중 넷은 호출자가 uid 를 «안 보낸다»**(js/idx-main.js 3662·3689·3700·13842행).
 *      그래서 전화번호가 적재돼도 그 넷은 그대로 빈손이다 — 「적재되면 저절로 나간다」가 아니다.
 *      살리려면 화면이 body 에 `student_uid` 를 함께 실어야 하는데, 그건 첫 화면 예산·담당
 *      영역이 걸린 별건이다. no-show 만 uid 를 보낸다.
 *
 * ⚠️ `students_erp` 의 phone·student_phone·parent_phone 은 **사실상 비어 있다**
 *    (2026-09-16 재실측 29,512행 중 번호가 든 행은 **4행**뿐 — 카페24 원본에 번호가 없다).
 *    📞 (2026-09-15) 「우리가 손으로 넣어도 동기화가 **매일 밤 덮는다**」는 이제 옛말이다 —
 *    `cafe24-sync.ts` 의 UPSERT 가 COALESCE 로, DELETE 보존 목록에 번호 세 칸이 들어갔다.
 *    ⛔ 그래도 아래 «override 에 둔다» 는 **그대로**다: 카페24가 번호를 주기 시작하면 그쪽이 이기고
 *       (정본이 카페24라 맞는 동작), 그 순간 우리가 넣은 값이 덮인다. 적재 요청은
 *    `docs/구서버_Neo4j_전화번호_적재요청_2차_2026-08-30.md`.
 * ✅ (2026-09-10) 그래서 «우리 화면에서 받은 번호» 는 `student_erp_override` 에 두고
 *    `phonesForStudent` 가 그것을 **먼저** 본다(정본 `src/student-override.ts`).
 *    ⟹ 이 함수는 이제 «명부에는 없지만 우리가 받아 둔» 학생에게는 번호를 돌려준다.
 *    ⚠️ 그래도 위 넷(lesson-started·lesson-ended·chat-summary·mention)은 호출자가 uid 를
 *       안 보내므로 그대로 빈손이다 — 번호가 생겼다고 그 넷이 저절로 살아나지 않는다.
 * ⛔ 못 찾았다고 본문 값으로 되돌아가지 말 것 — 그러면 구멍이 그대로다.
 *    모르면 «안 보낸다» 가 맞다(규칙서: 모르는 것보다 틀린 게 나쁘다).
 *
 * ⚠️ **이걸로 다 막힌 게 아니다.** `/api/notify/*` 는 여전히 **무인증**이다(index.ts 의 허용목록에
 *    접두사로 있고 isAdminPath 에는 없다). 이번에 막은 것은 «아무 번호로 보내기» 와
 *    «남의 수업에 엉뚱한 강사 이름 심기» 두 가지뿐이고, **노쇼 사건 자체를 심는 것은 그대로**다.
 *    (이름이 맞게 들어가므로 그 강사의 출석 기록이 있으면 no-show-truth 가 오판으로 걸러 준다.)
 *    ⚠️ 그리고 이름 위조 차단은 방 번호가 `class-{예약id}-{YYYYMMDD}` 일 때만이다 —
 *       `meet-123` 같은 방을 보내면 예약을 못 풀어 본문 이름이 그대로 들어간다.
 */

import { findTeacherContact } from './absent-sweep';   // 강사 연락처 판정 정본(복제 금지)
import { getOverridePhones, loadOverridePhones } from './student-override'; // 📞 우리 화면에서 받아 둔 번호(동기화가 못 덮는 자리)
import { selectInChunks } from './d1-chunk';             // IN 목록은 손으로 자르지 않는다(D1 바인드 100개)

/** 한 사람에게 보낼 번호 묶음. 못 찾은 자리는 빈 문자열이다(= 그 역할은 발송 안 함). */
export interface NotifyPhones {
  student: string;
  parent: string;
  teacher: string;
}

const EMPTY: NotifyPhones = { student: '', parent: '', teacher: '' };

/** 숫자만 남긴다. 형식이 아니라 «있는가» 만 본다 — 국가별 표기가 섞여 있다. */
function normPhone(v: any): string {
  const s = String(v ?? '').replace(/[^0-9]/g, '');
  return s.length >= 9 ? s : '';
}

/**
 * 학생 계정(uid)으로 학생·학부모 번호를 찾는다.
 * ⚠️ `user_id` 는 BINARY 라 대소문자가 갈린다 — 로그인과 같은 규칙으로 «정확일치 우선,
 *    없으면 대소문자 무시» 로 찾는다(규칙서 2장 「같은 사람인데 계정이 두 개」).
 */
export async function phonesForStudent(env: any, uid: string): Promise<{ student: string; parent: string }> {
  const u = String(uid || '').trim();
  if (!u || !env?.DB) return { student: '', parent: '' };
  /* 📞 (2026-09-10) **우리가 받아 둔 번호를 «먼저» 본다.**
     `students_erp` 의 번호 칸은 카페24 동기화가 매일 밤 덮었고(실측 2026-09-10: 29,485행 전부 0건
     — 그 «무조건 덮기» 는 2026-09-15 에 cafe24-sync.ts 에서 막았지만 카페24가 값을 주면 그쪽이 이긴다),
     화면에서 받은 번호는 `student_erp_override` 에 둔다 — 정본·이유는 src/student-override.ts.
     ⚠️ 칸 단위로 떨어진다: 학부모 번호만 받아 뒀으면 학생 번호는 그대로 명부에서 찾는다.
     ⚠️ 이 조회는 실패해도 throw 하지 않는다(빈 값) — 그러면 아래 명부 조회로 이어져
        «고치기 전» 과 똑같이 동작한다. */
  let ovParent = '', ovStudent = '';
  try {
    const ov = await getOverridePhones(env, u);
    ovParent = ov.parent; ovStudent = ov.student;
  } catch { /* fail-open — 명부로 간다 */ }
  try {
    const row: any = await env.DB.prepare(
      `SELECT phone, student_phone, parent_phone FROM students_erp
        WHERE user_id = ? COLLATE NOCASE
        ORDER BY (user_id = ?) DESC, user_id ASC LIMIT 1`,
    ).bind(u, u).first();
    if (!row) return { student: ovStudent, parent: ovParent };
    return {
      student: ovStudent || normPhone(row.student_phone) || normPhone(row.phone),
      parent: ovParent || normPhone(row.parent_phone),
    };
  } catch (e: any) {
    console.warn('[notify-contacts] 학생 번호 조회 실패:', e?.message);
    /* ⚠️ 명부 조회가 깨져도 우리가 받아 둔 번호는 살아 있다 — 그것까지 버리면
       「번호를 넣었는데 안 나간다」가 된다. */
    return { student: ovStudent, parent: ovParent };
  }
}

/**
 * ☎ 화면에 «연락처 한 개» 를 보여줄 때 — 여러 학생을 한 번에 (2026-10-27 강사 제안 «일부 학생 연락처가 여전히 안 보인다»).
 *
 * [왜] 강사 화면(api-teacher.ts)은 `students_erp.phone·parent_phone` 만 읽었는데 그 칸은 사실상 비어 있다
 *   (위 머리말 — 29,512행 중 4행). 그래서 매니저 화면에는 번호가 뜨는 학생도 강사 화면에서는 늘 «—» 였다.
 *   매니저 화면(api-admin.ts classes/today)은 `student_retention.phone` 을 읽는다 — 카페24가 «이탈 위험»
 *   (만료·휴면) 학생에 한해 복호화해 넣는 표라, 실번호가 있는 거의 유일한 자리다.
 * [순서] ① 우리 화면에서 받아 둔 번호(`student_erp_override` — 학생 → 학부모)
 *        ② 명부(`students_erp` — student_phone → phone → parent_phone)
 *        ③ 이탈 위험 스냅샷(`student_retention.phone`)
 *   ①·② 의 학생/학부모 우선순위는 `phonesForStudent` 와 같은 자리(받아 둔 값이 명부를 이긴다)를 따른다.
 * ⚠️ «표시용» 이다 — 발송 번호는 여전히 `phonesForStudent`(학생·학부모를 갈라서 준다)를 쓸 것.
 * ⚠️ ③ 은 «전체 명부» 가 아니다 — 잘 다니는 학생은 원리상 없다. 그래서 «없음» 이 정상이고,
 *    화면은 그 이유를 말해야 한다(빈칸은 «고장» 으로 읽힌다).
 * ⛔ 없는 번호를 다른 칸으로 «그럴듯하게» 채우지 않는다. 숫자 9자리 미만은 번호로 안 본다(normPhone).
 * ⚠️ 정확일치(user_id) — 여러 명을 한꺼번에 볼 때 대소문자 후보를 섞으면 누구의 번호인지 흐려진다.
 * ⚠️ fail-open — 어느 표가 없거나 조회가 실패해도 던지지 않는다(그 원천만 빠진다). 연락처 때문에
 *    수업 목록이 안 뜨면 안 된다.
 * ⚠️ 대신 «못 물어봤다» 를 `complete:false` 로 돌려준다 — 화면이 «번호가 없다» 와 «못 물어봤다» 를
 *    같은 글자로 말하지 않게(2026-10-27 함정 대조: D1 이 죽어도 «명부에 번호가 없다» 고 말하던 것).
 *    명부·이탈위험 조회는 swallowErrors 를 쓰지 않고 여기서 잡아 그 사실을 남긴다.
 *    받아 둔 번호(loadOverridePhones)도 `report` 로 «다 물어봤나» 를 받는다. ⚠️ 2026-10-27 엔 «그 표는 드물게만
 *    채워져 있어 빠져도 크게 안 틀린다» 며 일부러 안 봤는데 2026-10-28 무작위 반복 검사 뒤 뒤집었다 — 그 표는
 *    직원이 손으로 넣은 번호라, 빠지면 바로 그 학생이 «명부에 번호가 없다» 는 거짓 안내를 받는다.
 * @returns phones = uid → 화면에 그릴 번호(명부·스냅샷은 저장된 표기 그대로, 받아 둔 번호는 숫자만 —
 *          normPhone 을 거쳐 저장된다). 없는 uid 는 맵에 없다. complete = 모든 원천에 물어봤는가.
 */
export async function loadContactPhones(env: any, uids: string[]): Promise<{ phones: Map<string, string>; complete: boolean }> {
  const out = new Map<string, string>();
  let complete = true;
  const want = Array.from(new Set((uids || []).map(u => String(u || '').trim()).filter(Boolean)));
  if (!want.length) return { phones: out, complete };
  if (!env?.DB) return { phones: out, complete: false };
  const firstValid = (...vals: any[]): string => {
    for (const v of vals) { const s = String(v ?? '').trim(); if (normPhone(s)) return s; }
    return '';
  };
  const fill = (uid: any, phone: string) => {
    const u = String(uid || '').trim();
    if (u && phone && !out.has(u)) out.set(u, phone);
  };
  try {
    // report — 이 표를 다 못 읽었으면 «다 물어봤다» 가 거짓이다(2026-10-28 무작위 반복 검사). 받은 번호는 쓰고 나머지는 다음 원천에서.
    const st = { complete: true };
    const ov = await loadOverridePhones(env, want, { report: st });
    for (const [u, p] of ov) fill(u, firstValid(p.student, p.parent));
    if (!st.complete) { complete = false; console.warn('[notify-contacts] 받아 둔 번호 일부를 못 물어봤다'); }
  } catch (e: any) { complete = false; console.warn('[notify-contacts] 받아 둔 번호 조회 실패:', e?.message); }
  const rest = () => want.filter(u => !out.has(u));
  if (rest().length) {
    // `SELECT *` — 명부는 스키마 드리프트가 있는 표다(student_phone·phone 중 한 칸이 없는 DB 가 있다).
    //   칸 이름을 적으면 없는 칸 하나에 조회 전체가 죽는다.
    try {
      const erp = await selectInChunks<any>(env.DB, rest(),
        (ph) => `SELECT * FROM students_erp WHERE user_id IN (${ph})`);
      for (const r of erp) fill(r && r.user_id, firstValid(r && r.student_phone, r && r.phone, r && r.parent_phone));
    } catch (e: any) { complete = false; console.warn('[notify-contacts] 명부 번호 조회 실패:', e?.message); }
  }
  if (rest().length) {
    try {
      const ret = await selectInChunks<any>(env.DB, rest(),
        (ph) => `SELECT user_id, phone FROM student_retention WHERE user_id IN (${ph})`);
      for (const r of ret) fill(r && r.user_id, firstValid(r && r.phone));
    } catch (e: any) { complete = false; console.warn('[notify-contacts] 이탈위험 번호 조회 실패:', e?.message); }
  }
  return { phones: out, complete };
}

/**
 * 강사 번호를 찾는다 — 원부 강사번호(`teachers.id` = `class_schedules.teacher_id`)로 찾는다.
 *
 * ⚠️ 처음에 「이 저장소엔 강사 전화번호 칸이 없다」고 적었는데 **틀렸다**(2026-09-01 trap-check 지적).
 *    `teacher_profiles.phone` 이 있고 값도 있다 — 다만 실측 22건 중 21건이 09xx 필리핀 번호다.
 *
 * ⛔ 직접 잇지 않고 **정본 `findTeacherContact`(absent-sweep.ts)에 위임**한다. 그 함수는
 *    ① 관리자가 손으로 정한 연결(`linked_teacher_id`)이 있으면 그것만 쓰고
 *    ② 없으면 **낱말 경계** 이름 일치로 찾고(부분일치 금지 — 'Anna' 가 'HANNAH' 에 붙은 전례)
 *    ③ 후보가 둘 이상이면 **아무에게도 안 보낸다.**
 *    같은 판정을 여기에 복제하면 반드시 어긋난다(규칙서 2장 — no-show-truth.ts 가 그 선례).
 */
export async function phoneForTeacher(env: any, teacherId: any): Promise<string> {
  const tid = String(teacherId || '').trim();
  if (!tid || !env?.DB) return '';
  try {
    const c = await findTeacherContact(env, tid);
    return normPhone(c?.phone);
  } catch (e: any) {
    console.warn('[notify-contacts] 강사 번호 조회 실패:', e?.message);
    return '';
  }
}

/**
 * 알림 한 건에 쓸 번호를 한 번에 푼다. **본문 값은 쳐다보지 않는다.**
 */
export async function resolveNotifyPhones(
  env: any,
  who: { studentUid?: any; parentUid?: any; teacherId?: any },
): Promise<NotifyPhones> {
  if (!env?.DB) return EMPTY;
  const out: NotifyPhones = { student: '', parent: '', teacher: '' };
  const sUid = String(who.studentUid || '').trim();
  if (sUid) {
    const p = await phonesForStudent(env, sUid);
    out.student = p.student;
    out.parent = p.parent;
  }
  /* 학부모 계정이 따로 있으면 그쪽 번호를 우선한다 — 자녀 행의 parent_phone 보다
     본인이 적은 번호가 최신이다. */
  const pUid = String(who.parentUid || '').trim();
  if (pUid && pUid !== sUid) {
    const p = await phonesForStudent(env, pUid);
    if (p.student) out.parent = p.student;
  }
  /* ⚠️ 강사는 «계정» 이 아니라 **원부 번호**(teachers.id)로 찾는다 — 계정·카페24·원부 세 갈래가
     겹치는 구간에서 서로 다른 사람이라, 계정으로 이으면 조용히 남의 번호가 걸린다(규칙서 2장). */
  const tId = String(who.teacherId || '').trim();
  if (tId) out.teacher = await phoneForTeacher(env, tId);
  // 같은 번호가 두 역할에 걸리면 한 번만 보낸다(학부모 컴플레인 #1, 2026-07-22)
  if (out.student && out.student === out.parent) out.student = '';
  return out;
}

/**
 * 방 번호·예약 번호로 «그 수업의 강사·학생이 누구인지» 를 서버가 푼다.
 *
 * [왜 필요한가] `class_no_show.teacher_name` 은 **급여가 걸린 값**이다.
 *   읽는 쪽(`no-show-truth.ts`)이 그 이름을 출석부와 맞춰 «오판» 인지 가리는데,
 *   급여는 `present === true` 일 때만 되돌린다. 즉 **이름이 틀리면 되돌아가지 않아
 *   들어와 수업한 강사에게 0원이 나간다.** 그 이름이 지금까지 «요청 본문» 이었다 —
 *   인증이 없으므로 누구나 남의 수업에 엉뚱한 이름으로 노쇼를 심을 수 있었다.
 *
 * ⚠️ **기록하는 «그 순간» 에 풀어야 한다.** 나중에 읽을 때 풀면 안 된다 —
 *    `class_schedules` 는 나중에 바뀐다(실측: class-895 는 그 뒤 취소되고 강사가
 *    HANNAH → HT FARRAH 로 바뀌어 있다). 나중에 풀면 역사를 덮어쓴다.
 *
 * ⚠️ 못 풀면 **null** 을 돌려준다. 부르는 쪽이 본문 값으로 되돌아갈지 정한다 —
 *    실측 38건 중 2건은 예약행이 지워져 서버가 못 푼다.
 */
export async function partiesForRoom(
  env: any,
  roomId: string,
  scheduleId?: any,
): Promise<{ teacherName: string | null; studentName: string | null; studentUid: string | null; teacherId: string | null } | null> {
  if (!env?.DB) return null;
  let sid = Number(scheduleId);
  if (!Number.isFinite(sid) || sid <= 0) {
    // 방 번호는 `class-{예약id}-{YYYYMMDD}` 로 결정론적이다(규칙서 0장)
    const m = /^class-(\d+)-\d{8}$/.exec(String(roomId || '').trim());
    if (!m) return null;
    sid = Number(m[1]);
  }
  if (!Number.isFinite(sid) || sid <= 0) return null;
  try {
    const row: any = await env.DB.prepare(
      `SELECT cs.user_id AS uid, cs.student_name AS sname, cs.teacher_id AS tid, t.name AS tname
         FROM class_schedules cs
         LEFT JOIN teachers t ON CAST(t.id AS TEXT) = CAST(cs.teacher_id AS TEXT)
        WHERE cs.id = ? LIMIT 1`,
    ).bind(sid).first();
    if (!row) return null;
    const tn = String(row.tname || '').trim();
    const sn = String(row.sname || '').trim();
    const uid = String(row.uid || '').trim();
    const tid = String(row.tid || '').trim();
    return {
      teacherName: tn || null,
      studentName: sn || null,
      studentUid: uid || null,
      teacherId: tid || null,
    };
  } catch (e: any) {
    console.warn('[notify-contacts] 예약 조회 실패:', e?.message);
    return null;
  }
}
