// ═══════════════════════════════════════════════════════════════════════
// 📅 레벨테스트 신청 → «실제 수업» 만들기 (한 곳에서만)
// ───────────────────────────────────────────────────────────────────────
// [왜 이 파일이 생겼나]
//   지금까지 이 일은 관리자가 「📅 수업 만들기」 버튼을 **손으로 눌러야만** 일어났다.
//   안 누르면 방이 없고, 방이 없으면 학생 티켓에 입장 버튼이 안 생기고, 강사 화면에도
//   안 뜬다. 신청서만 쌓이고 아무도 못 들어가는 상태가 조용히 남는다.
//   그런데 그 버튼이 하는 일은 «신청서에 이미 있는 것»(날짜·시간·배정교사)을 그대로
//   옮겨 적는 것뿐이다. 사람이 판단할 여지가 거의 없다 → 신청 즉시 자동으로 한다.
//
//   ⚠️ 그래서 로직을 여기 한 곳에 모았다. 자동(신청 시)과 수동(관리자 버튼)이 서로
//      다르게 동작하면, 「자동으로 만든 수업」과 「손으로 만든 수업」이 미묘하게 달라져
//      나중에 아무도 원인을 못 찾는다.
//
// [계정이 없는 사람 문제]
//   레벨테스트는 «우리를 처음 알아보는 사람»이 받는다. 계정이 있을 리 없다.
//   그런데 수업(class_schedules)은 학생 계정(user_id)에 걸려야 학생 화면에 뜬다.
//   그래서 예전엔 관리자에게 "계정 아이디를 지정해 주세요" 라고 되물었고, 관리자는
//   아무 계정이나 넣거나(실제 학생 기록이 오염된다) 포기했다.
//   → 신청서의 이름·전화로 **체험 계정을 자동으로 만든다**. 나중에 정식 등록되면
//     그 계정을 그대로 쓰면 되므로 학습기록이 끊기지 않는다.
// ═══════════════════════════════════════════════════════════════════════

import { writeClassAudit } from './class-audit';
import { DEFAULT_CLASS_MINUTES } from './class-policy';

/* ⚠️ 성공/실패를 «구분된 유니온» 으로 쓰지 않는다 — 이 리포의 tsconfig 는
   `strictNullChecks: false` 라 `ok: true | false` 로는 좁혀지지 않아
   (`res.error` 가 없다는 컴파일 오류가 난다) 한 벌짜리 형태로 둔다. */
export type LtScheduleResult = {
  ok: boolean;
  // 성공일 때
  schedule_id?: number; scheduled_date?: string; start_time?: string; duration_min?: number;
  teacher?: string; teacher_id?: string; user_id?: string; room_id?: string;
  student_created?: boolean; already?: boolean;
  // 실패일 때
  status?: number; error?: string;
  conflict_id?: number; candidate?: string; desired_date?: string; today?: string;
  // 공통 — 한/영 두 벌 (강사 다수가 필리핀)
  message: string; message_en: string;
};

/** 강사 원부(teachers)와 배정 이름(teacher_profiles 표기)을 견주기 위한 정규화.
 *  'Teacher Maimai' ↔ 'MAIMAI' 처럼 표기가 달라 글자 그대로는 절대 안 맞는다. */
const normTeacher = (s: any) =>
  String(s || '').toLowerCase().replace(/teacher/g, '').replace(/[^a-z0-9가-힣]/g, '');

const toMin = (hhmm: string) => { const p = String(hhmm || '0:0').split(':'); return Number(p[0]) * 60 + Number(p[1] || 0); };

/** 이미 있는 계정 찾기 — students_erp 우선, 없으면 users. */
async function findStudent(env: any, cand: string): Promise<string | null> {
  if (!cand) return null;
  try {
    const e: any = await env.DB.prepare(
      `SELECT user_id FROM students_erp WHERE user_id = ? OR login_id = ? LIMIT 1`).bind(cand, cand).first();
    if (e?.user_id) return String(e.user_id);
  } catch {}
  try {
    const u: any = await env.DB.prepare(`SELECT user_id FROM users WHERE user_id = ? LIMIT 1`).bind(cand).first();
    if (u?.user_id) return String(u.user_id);
  } catch {}
  return null;
}

/**
 * 체험 계정 자동 생성. 아이디는 `lt{신청번호}` — 짧고, 신청 하나당 하나라 충돌이 없고,
 * 나중에 사람이 봐도 «레벨테스트에서 들어온 사람» 임을 바로 안다.
 * ⚠️ 비밀번호는 만들지 않는다. 본인 확인이 필요한 화면(parent.html)은 비번 미설정 계정을
 *    스스로 막고 «설정하기» 로 유도하므로, 남이 열람할 위험이 생기지 않는다.
 */
async function createTrialStudent(env: any, app: any): Promise<string | null> {
  const base = `lt${Number(app.id)}`;
  let uid = base;
  for (let i = 0; i < 5; i++) {
    if (!(await findStudent(env, uid))) break;
    uid = `${base}_${i + 1}`;
  }
  if (await findStudent(env, uid)) return null;
  try {
    await env.DB.prepare(
      `INSERT INTO students_erp (user_id, login_id, student_name, korean_name, phone, status, source, created_at)
       VALUES (?, ?, ?, ?, ?, 'active', 'leveltest', ?)`
    ).bind(uid, uid, app.student_name || uid, app.student_name || uid, app.phone || null, Date.now()).run();
    return uid;
  } catch { return null; }
}

/**
 * 신청서 한 건으로 수업을 만든다. 자동(신청 직후)·수동(관리자 버튼) 공용.
 *
 * opts.userId        관리자가 계정을 직접 지정한 경우
 * opts.scheduledDate 관리자가 날짜를 고쳐 보낸 경우(희망일이 이미 지났을 때)
 * opts.force         겹침을 알고도 만들 때(합반·연강)
 * opts.actor         감사 로그에 남길 사람
 * opts.allowCreateStudent 계정이 없으면 만들어도 되는가 (자동 경로 = true)
 */
export async function createLeveltestSchedule(
  env: any,
  app: any,
  opts: { userId?: string; scheduledDate?: string; startTime?: string; durationMin?: number;
          force?: boolean; actor?: string; allowCreateStudent?: boolean } = {}
): Promise<LtScheduleResult> {
  // 이미 이어져 있으면 또 만들지 않는다 (버튼 두 번 / 자동+수동 이중 생성 방지)
  if (app.schedule_id) {
    const dup: any = await env.DB.prepare(
      `SELECT id, scheduled_date, start_time, duration_min, teacher_id, user_id FROM class_schedules WHERE id = ? LIMIT 1`
    ).bind(Number(app.schedule_id)).first().catch(() => null);
    if (dup) {
      return {
        ok: true, already: true, schedule_id: dup.id, scheduled_date: dup.scheduled_date,
        start_time: dup.start_time, duration_min: Number(dup.duration_min) || DEFAULT_CLASS_MINUTES,
        teacher: String(app.assigned_teacher || ''), teacher_id: String(dup.teacher_id || ''),
        user_id: String(dup.user_id || ''), student_created: false,
        room_id: `class-${dup.id}-${String(dup.scheduled_date || '').replace(/-/g, '')}`,
        message: `이미 수업 #${dup.id} 로 연결돼 있습니다.`,
        message_en: `Already linked to class #${dup.id}.`,
      };
    }
    // 연결된 예약이 지워졌다면 다시 만들 수 있게 흘려보낸다
  }

  const dDate = String(opts.scheduledDate || app.desired_date || '').trim();
  const dTime = String(opts.startTime || app.desired_time || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dDate)) {
    return { ok: false, status: 400, error: 'no_desired_date',
      message: '희망 날짜가 비어 있어 수업을 만들 수 없습니다. 신청서에서 날짜를 먼저 채워 주세요.',
      message_en: 'No preferred date on this application. Fill the date first.' };
  }
  if (!/^\d{1,2}:\d{2}$/.test(dTime)) {
    return { ok: false, status: 400, error: 'no_desired_time',
      message: '희망 시간이 비어 있어 수업을 만들 수 없습니다.',
      message_en: 'No preferred time on this application.' };
  }
  /* ⛔ 지난 날짜로는 만들지 않는다 — 만들어도 오늘 수업·강사·학생 화면 어디에도 안 뜨는
     «죽은 수업» 이 된다. 실제로 그렇게 만들어진 건이 있었다(신청 #11 → 수업 #853). */
  const kToday = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  if (dDate < kToday) {
    return { ok: false, status: 400, error: 'past_date', desired_date: dDate, today: kToday,
      message: `희망 날짜(${dDate})가 이미 지났습니다. 지난 날짜로 만들면 오늘 수업·강사·학생 화면 어디에도 뜨지 않습니다. 새 날짜를 정해 주세요.`,
      message_en: `The preferred date (${dDate}) is already past. A class created in the past never appears in Today's Classes, or on the teacher/student screens. Please pick a new date.` };
  }

  const startTime = String(Number(dTime.split(':')[0])).padStart(2, '0') + ':' + dTime.split(':')[1];
  const durationMin = Number.isFinite(Number(opts.durationMin)) && Number(opts.durationMin) > 0
    ? Number(opts.durationMin) : DEFAULT_CLASS_MINUTES;

  // ── 학생 계정 ── 지정 > 신청서의 계정 > 이름으로 조회 > (허용 시) 체험 계정 생성
  let studentUid = String(opts.userId || app.student_uid || '').trim();
  let resolved = await findStudent(env, studentUid);
  if (!resolved) resolved = await findStudent(env, String(app.student_name || '').trim());
  let studentCreated = false;
  if (!resolved && opts.allowCreateStudent) {
    const made = await createTrialStudent(env, app);
    if (made) { resolved = made; studentCreated = true; }
  }
  if (!resolved) {
    const cand = studentUid || String(app.student_name || '');
    return { ok: false, status: 400, error: 'student_not_found', candidate: cand,
      message: `학생 계정 '${cand}' 을(를) 찾을 수 없습니다. 실제 계정 아이디를 지정해 주세요.`,
      message_en: `Student account '${cand}' not found. Specify a real account id.` };
  }
  studentUid = resolved;

  // ── 담당 강사 ── assigned_teacher 는 «이름» 이고 class_schedules.teacher_id 는 teachers 의 «id».
  //    ⚠️ 신청서의 assigned_teacher_id 를 그대로 쓰면 안 된다 — 그건 teacher_profiles 번호라
  //       같은 숫자가 원부에서는 다른 사람이다(Teacher Kaye = profiles 11 / teachers 8).
  const tName = String(app.assigned_teacher || '').trim();
  if (!tName) {
    return { ok: false, status: 400, error: 'no_teacher',
      message: '담당 강사가 지정되지 않았습니다. 먼저 강사를 배정해 주세요.',
      message_en: 'No teacher assigned yet. Assign a teacher first.' };
  }
  let teacherId: string | null = null;
  let teacherMatched = '';
  try {
    const ts: any = await env.DB.prepare(`SELECT id, name FROM teachers WHERE COALESCE(active,1) = 1`).all();
    const want = normTeacher(tName);
    const hit = (ts.results || []).find((r: any) => normTeacher(r.name) === want);
    if (hit) { teacherId = String(hit.id); teacherMatched = String(hit.name); }
  } catch {}
  if (!teacherId) {
    return { ok: false, status: 400, error: 'teacher_not_found', candidate: tName,
      message: `강사 '${tName}' 이(가) 강사 명부에 없습니다. 강사 관리에서 등록한 뒤 다시 시도해 주세요.`,
      message_en: `Teacher '${tName}' is not in the teacher roster. Register them first.` };
  }

  // ── ⛔ 시간 겹침 ── 같은 강사가 같은 시간에 두 방에 들어갈 수는 없다.
  //    분 단위 구간으로 본다(시작 시각만 보면 18:00 50분 옆의 18:30 을 놓친다).
  const s1 = toMin(startTime), e1 = s1 + durationMin;
  if (!opts.force) {
    try {
      const sameDay: any = await env.DB.prepare(
        `SELECT id, student_name, start_time, duration_min, teacher_id, user_id FROM class_schedules
          WHERE (status IS NULL OR status = 'active') AND scheduled_date = ?`).bind(dDate).all();
      const clash = (sameDay.results || []).find((r: any) => {
        const s2 = toMin(r.start_time), e2 = s2 + (Number(r.duration_min) || 30);
        if (!(s1 < e2 && s2 < e1)) return false;
        return String(r.teacher_id || '') === teacherId || String(r.user_id || '') === studentUid;
      });
      if (clash) {
        return { ok: false, status: 409, error: 'conflict', conflict_id: clash.id,
          message: `그 시간에 이미 수업이 있습니다 (예약 #${clash.id} · ${clash.start_time}). 그래도 만들려면 다시 눌러 주세요.`,
          message_en: `Overlapping class already exists (#${clash.id} at ${clash.start_time}). Press again to create anyway.` };
      }
    } catch { /* 겹침 검사 실패가 예약 자체를 막지는 않는다 */ }
  }

  const actorName = opts.actor || 'admin';
  const nowTs = Date.now();
  const ins: any = await env.DB.prepare(
    `INSERT INTO class_schedules (user_id, student_name, schedule_kind, class_type, day_of_week, scheduled_date, start_time, duration_min, teacher_id, status, source, created_by, created_at, notes)
     VALUES (?, ?, 'one_off', 'level_test', NULL, ?, ?, ?, ?, 'active', 'leveltest_app', ?, ?, ?)`
  ).bind(studentUid, app.student_name || null, dDate, startTime, durationMin, teacherId, actorName, nowTs,
         `레벨테스트 신청 #${app.id} 에서 생성 / Created from level-test application #${app.id}`).run();
  const schedId = (ins?.meta?.last_row_id as number) ?? null;
  if (!schedId) {
    return { ok: false, status: 500, error: 'insert_failed',
      message: '예약 생성에 실패했습니다.', message_en: 'Failed to create the class.' };
  }

  await env.DB.prepare(
    `UPDATE leveltest_applications SET schedule_id = ?, student_uid = COALESCE(student_uid, ?), updated_at = ? WHERE id = ?`
  ).bind(schedId, studentUid, nowTs, Number(app.id)).run();

  try {
    await writeClassAudit(env, {
      action: 'add', schedule_id: schedId,
      teacher_name: teacherMatched, student_name: app.student_name || null,
      lesson_date: dDate, lesson_time: startTime,
      actor: actorName, actor_role: 'admin', source: 'leveltest_app', reason: null,
    });
  } catch {}

  return {
    ok: true, schedule_id: schedId, scheduled_date: dDate, start_time: startTime,
    duration_min: durationMin, teacher: teacherMatched, teacher_id: teacherId,
    user_id: studentUid, student_created: studentCreated,
    room_id: `class-${schedId}-${dDate.replace(/-/g, '')}`,
    message: `수업 #${schedId} 생성됨 — ${dDate} ${startTime} (${durationMin}분) · ${teacherMatched}`
             + (studentCreated ? ` · 체험 계정 '${studentUid}' 자동 생성` : ''),
    message_en: `Class #${schedId} created — ${dDate} ${startTime} (${durationMin}min) · ${teacherMatched}`
             + (studentCreated ? ` · trial account '${studentUid}' created` : ''),
  };
}

/**
 * 🤖 신청 직후 자동 배정 — best-effort. 실패해도 신청 자체는 성공으로 둔다.
 *   자동으로 만들 수 없는 상황(날짜 없음·과거·겹침·강사 미배정)이면 조용히 넘기고
 *   관리자가 「수업 만들기」로 처리하면 된다. 즉 자동은 «대부분을 덜어주는» 장치이고,
 *   수동 경로는 그대로 남는다.
 *
 * ⛔ 공개 엔드포인트(누구나 신청 가능)에서 불리므로 남용 방지가 필요하다:
 *    같은 번호로 24시간에 3건까지만 자동 생성한다. 그 이상은 신청만 저장되고
 *    관리자가 눈으로 보고 처리한다.
 * 🔌 킬스위치 = KV 'leveltest_autoschedule' = 'off'
 */
export async function autoScheduleOnApply(env: any, app: any): Promise<any> {
  try {
    if ((await env.SESSION_STATE?.get('leveltest_autoschedule')) === 'off') return { skipped: 'killswitch' };
  } catch {}
  if (!app || !app.desired_date || !app.desired_time || !app.assigned_teacher) return { skipped: 'incomplete' };

  if (app.phone) {
    try {
      const r: any = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM leveltest_applications
          WHERE phone = ? AND schedule_id IS NOT NULL AND created_at >= ?`
      ).bind(String(app.phone), Date.now() - 86400000).first();
      if (r && Number(r.n) >= 3) return { skipped: 'rate_limited' };
    } catch {}
  }

  const res = await createLeveltestSchedule(env, app, { actor: 'auto', allowCreateStudent: true });
  if (!res.ok) return { skipped: res.error };
  return { schedule_id: res.schedule_id, room_id: res.room_id, user_id: res.user_id, student_created: res.student_created };
}
