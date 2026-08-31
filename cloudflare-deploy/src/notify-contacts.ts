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
 * ⚠️ 오늘 기준 `students_erp` 29,438행의 phone·student_phone·parent_phone 이 **전부 0건**이라
 *    이 함수는 늘 빈 값을 돌려준다(= 발송 0건, 지금과 같다). 적재 요청은
 *    `docs/구서버_Neo4j_전화번호_적재요청_2차_2026-08-30.md`.
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
  try {
    const row: any = await env.DB.prepare(
      `SELECT phone, student_phone, parent_phone FROM students_erp
        WHERE user_id = ? COLLATE NOCASE
        ORDER BY (user_id = ?) DESC, user_id ASC LIMIT 1`,
    ).bind(u, u).first();
    if (!row) return { student: '', parent: '' };
    return {
      student: normPhone(row.student_phone) || normPhone(row.phone),
      parent: normPhone(row.parent_phone),
    };
  } catch (e: any) {
    console.warn('[notify-contacts] 학생 번호 조회 실패:', e?.message);
    return { student: '', parent: '' };
  }
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
