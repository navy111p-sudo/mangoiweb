/** class-days: extracted administrator domain routes. Caller authentication and route order are preserved. */
import type { MangoEnv } from './api-mango';
import { admDowMatches, normTeacherName, loadHolidayExemptNames, loadCafe24TeacherMap } from './admin-teacher-core';
import { dropCafe24SlotDuplicates } from './cafe24-slot-duplicates';
import { markHiddenCafe24 } from './cafe24-hidden-student';
import { WEEKLY_POSTPONE, prepareWeeklyPostpone } from './weekly-postpone';
import { json } from './api-util';
import { forbiddenTeacherBody } from './forbidden-teacher';
import { selectInChunks } from './d1-chunk';
import { enrichClassesToday } from './class-today-extras';
import { DEFAULT_CLASS_MINUTES } from './class-policy';
import { prepareScheduleRequestGuards, commitScheduleRequestDecision } from './schedule-request-atomic';
import { scheduleMoveVersion } from './class-schedule-move';
import { findScheduleConflicts, findScheduleMoveConflicts } from './schedule-conflict';
import { ensureScheduleChangeRequestTable } from './student-schedule-request';
import { enqueueNotification } from './api-notify';
import { loadContactPhones } from './notify-contacts';
import { getScope, scopeStudentCond } from './scope';
import { dropMirroredCafe24, EXEMPT_BY_NAME, cafe24HolidayTeacher } from './classes-now';
import { writeClassAudit, listClassAudit } from './class-audit';
import { kstToday } from './schedule-split';
import { oneWeekEligible, oneWeekMessage, prepareRecurringOneWeek, ONE_WEEK_FALLBACK } from './recurring-one-week';
import { loadPostponePayRules, postponePayPercent } from './postpone-pay';
import { planEndMakeup, END_MAKEUP_MARK_SQL } from './end-makeup';
import { getAdminActor } from './auth-admin';
import { teacherMoveDenyReason } from './class-teacher-move';
import { teacherOwnsSchedule, applyRoomOverrides } from './class-room-override';
import { loadHiddenStudents } from './student-override';
import { MIRROR_SOURCE, MIRROR_SOURCE_MANUAL } from './c24-mirror';
import { ensureStartsOnColumn, recurStartedOn } from './class-start-date';
import { isPostponedOccurrence, REACTIVATE_POSTPONED_SQL } from './class-postponed';
import { isCancelledOccurrence, liveOrCancelledInRangeSql, judgeClassChange, loadClassChangeAudits, loadMovedAwayEvents, judgeMovedAway, judgeMovedAwayUndo, movedAwayKey, loadRecurWeekChildren, recurWeekChildFor, slotKeyOf, movedAwayBlocked, movedAwayOrder, loadLiveDatedSlots, heldIdFor, HELD_UNDO_SOURCE } from './class-change-state';
import { loadHolidayClosure, isHolidayClosedFor } from './holiday-closure';

export async function handleAdminClassDaysApi(request: Request, url: URL, env: MangoEnv): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;



    // ═══════════════════════════════════════════════════════════════
    // 📅 Phase SR — 수업 연기·변경 요청 (강사 → 매니저/관리자)
    //   그동안 연기/변경은 학생용 데모 화면뿐이라 기록이 어디에도 안 남았음.
    //   이제 강사가 마이페이지에서 요청을 남기면 schedule_change_requests 에 저장되고,
    //   관리자가 admin.html 카드에서 시간 포함 전체 기록을 보고 승인/거절한다.
    //   승인 시 class_schedules 에 실제 반영(새 일시로 이동 or status='postponed').
    //   요청 row 자체가 변경 이력(기존 일시 → 새 일시, 누가, 언제)을 보존한다.
    // ═══════════════════════════════════════════════════════════════

    /* 표 정의 정본은 src/student-schedule-request.ts 한 곳(학생 경로도 같은 표를 쓴다). */
    const ensureScheduleRequestTable = () => ensureScheduleChangeRequestTable(env);


    // ── POST /api/admin/schedule-requests — 연기/변경 요청 제출 (강사 마이페이지) ──
    //   body: { schedule_id?, request_type:'postpone'|'change', requester_name, teacher_name,
    //           student_name?, orig_date?, orig_time?, new_date?, new_time?, reason? }
    //   schedule_id 가 있으면 기존 일시·학생은 서버가 class_schedules 에서 읽어 권위값으로 채움.
    if (method === 'POST' && path === '/api/admin/schedule-requests') {
      await ensureScheduleRequestTable();
      const body: any = await request.json().catch(() => ({}));
      /* ⏸ (2026-10-02 사장님 제안) «연기보강» — 이 회차를 수업 끝 다음 수업일로 옮긴다.
         날짜는 «서버가» 정한다(화면 값은 안 믿는다). preview:true 면 날짜만 돌려주고 아무것도 안 쓴다.
         그 밖에는 «지정한 날짜로 연기»(change) 와 같은 길 — 아래 INSERT·/decide 를 그대로 탄다.
         정본은 src/end-makeup.ts. */
      let _endMk: string | null = null;
      if (body && body.end_makeup === true) {
        const _emId = parseInt(body.schedule_id, 10) || 0;
        if (!_emId) return json({ ok: false, error: 'schedule_id_required' }, 400);
        const _emPlan = await planEndMakeup(env, _emId).catch((e: any) => ({ ok: false, reason: 'lookup_failed:' + String(e?.message || e) } as any));
        if (!_emPlan.ok) return json({ ok: false, error: 'end_makeup_' + _emPlan.reason }, 409);
        if (body.preview === true) return json({ ok: true, preview: true, ..._emPlan });
        body.request_type = 'change';
        body.new_date = _emPlan.new_date;
        body.new_time = _emPlan.new_time;
        _endMk = _emPlan.label || '연기보강';
      }
      const reqType = (body.request_type === 'change' || body.request_type === 'cancel') ? body.request_type : 'postpone';
      const teacherName = (body.teacher_name || body.requester_name || '').trim();
      if (!teacherName) return json({ ok: false, error: 'teacher_name_required' }, 400);
      const requesterUid = (body.student_uid || body.requester_uid || '').trim() || null;
      /* 🪪 (2026-09-22) «누가 냈는가» 를 사실대로 적는다.
         예전 줄은 `body.requester_role === 'student' ? 'student' : 'teacher'` 라
         값이 무엇이든 «teacher» 로 떨어뜨렸다 — 매니저 화면의 연기·변경 버튼이
         이 경로를 쓰면 **관리자가 한 일이 «강사가 요청했다» 로 기록**된다
         (admin/postponed-classes.html 의 roleLabel() 이 그 칸을 그려 사람에게 보여 준다).
         ⛔ body 를 믿지 않는다 — 서버가 세션으로 확인한 «강사가 아닌 관리자» 일 때만 'admin' 이다.
            강사·학생이 body 에 'admin' 을 적어 보내도 대개 여기서 떨어진다(로그인 없으면 ok:false).
         ⚠️ 다만 «언제나» 는 아니다 — getAdminActor 는 스코프 조회 실패를 삼켜(auth-admin.ts)
            scopeType='none' → role='staff' 로 떨어지므로, D1 이 흔들리는 순간 **강사가
            isTeacher:false 로 잡힐 수 있다**(CLAUDE.md 「getAdminActor().role 로 막았는데 D1 이
            한 번 흔들리면 그대로 통과」와 같은 자리). 여기서 걸리는 것은 **기록 라벨 하나**라
            반경이 작아 그대로 두었다 — ⛔ 이 값을 «권한» 판정에 재사용하지 말 것.
         ℹ️ 지사·대리점 계정도 관리자라 'admin' 으로 적힌다(의도 — 그들도 이 화면을 쓴다).
         ℹ️ 'admin' 은 roleLabel() 의 폴백이 이미 «관리자» 로 그린다 — 화면 수정이 필요 없다.
         ⚠️ 기존 강사·학생 제출 경로는 한 글자도 안 바뀝니다(그쪽은 body 에 'admin' 을 안 보낸다). */
      const _srcActor = await getAdminActor(request, env as any);
      const _byAdmin = body.requester_role === 'admin' && _srcActor.ok === true && _srcActor.isTeacher !== true;
      const requesterRole = _byAdmin ? 'admin' : (body.requester_role === 'student' ? 'student' : 'teacher');

      let origDate = (body.orig_date || '').trim() || null;
      let origTime = (body.orig_time || '').trim() || null;
      let studentName = (body.student_name || '').trim() || null;
      const scheduleId = parseInt(body.schedule_id, 10) || null;
      let scheduleSnapshot: string | null = null;
      let _srcCs: any = null;   // 👨‍🏫 강사 자동 반영의 담당 확인에 쓴다(아래)
      if (scheduleId) {
        const cs: any = await env.DB.prepare(`SELECT * FROM class_schedules WHERE id = ? LIMIT 1`).bind(scheduleId).first().catch(() => null);
        _srcCs = cs || null;
        if (cs) {
          scheduleSnapshot = scheduleMoveVersion(cs);
          origDate = String(cs.scheduled_date || origDate || '').replace(/\//g, '-').slice(0, 10) || origDate;
          origTime = cs.start_time || origTime;
          if (!studentName) studentName = cs.student_name || cs.user_id || null;
        }
      }
      const newDate = (body.new_date || '').trim() || null;
      const newTime = (body.new_time || '').trim() || null;
      if (reqType === 'change' && (!newDate || !newTime)) return json({ ok: false, error: 'new_date_time_required_for_change' }, 400);

      const now = Date.now();
      // 🆕 유료/무료 자동 판정 (연기·취소만): 원 수업 시작 30분 전보다 일찍 요청=무료, 이내=유료.
      //   변경(change)은 24시간 룰(무료/차단 정책)이라 요금 대상 아님 → null.
      let minutesBefore: number | null = null;
      let feeType: string | null = null;
      if (reqType !== 'change') {
        try {
          if (origDate && origTime) {
            const hhmm = String(origTime).slice(0, 5);
            const startKst = Date.parse(`${origDate}T${hhmm}:00+09:00`);   // KST 기준으로 원 수업 시작 해석
            if (!isNaN(startKst)) minutesBefore = Math.round((startKst - now) / 60000);
          }
        } catch {}
        if (minutesBefore === null && typeof body.minutes_before === 'number') minutesBefore = Math.round(body.minutes_before);
        if (minutesBefore !== null) feeType = minutesBefore > 30 ? 'free' : 'paid';
        else feeType = (body.fee_type === 'paid' || body.fee_type === 'free') ? body.fee_type : 'free';
      }
      const requesterName2 = (body.requester_name || teacherName).trim();
      const r: any = await env.DB.prepare(
        `INSERT INTO schedule_change_requests (schedule_id, request_type, requester_role, requester_name, requester_uid, teacher_name, student_name, orig_date, orig_time, new_date, new_time, fee_type, minutes_before, reason, status, created_at, schedule_snapshot, end_makeup)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',?,?,?)`
      ).bind(
        scheduleId, reqType, requesterRole,
        requesterName2, requesterUid, teacherName, studentName,
        origDate, origTime, newDate, newTime, feeType, minutesBefore, (body.reason || '').trim() || null, now, scheduleSnapshot, _endMk
      ).run();
      /* 👨‍🏫 (2026-11-02 사장님 「연기·변경 요청은 승인 자체가 필요 없어」) 강사가 «자기 수업» 에 낸
         연기·변경은 접수 즉시 반영한다 — 검사·저장은 학생 자동 반영과 같은 정본(student-auto-postpone.ts).
         🔒 근거는 서버 세션뿐: 진짜 강사 세션(isTeacher) + 그 수업의 담당(teacherOwnsSchedule — 모르면 false).
            body 의 requester_role 은 안 믿는다. 담당이 아니거나 겹침 등으로 못 옮기면 예전처럼 «대기».
         ⛔ 취소(cancel)는 여기서 반영하지 않는다(관리자 경로). */
      const _newReqId: number | null = r?.meta?.last_row_id ? Number(r.meta.last_row_id) : null;
      let _auto: { applied: string | null; reason: string | null } = { applied: null, reason: null };
      /* ⛔ 관리자 창(class-move-modal)은 requester_role:'admin' 으로 보내고 곧바로 /decide 를 부른다 — 여기서 먼저 반영하면 그 /decide 가 409. */
      if (requesterRole === 'teacher' && body.requester_role !== 'admin' && reqType !== 'cancel' && _newReqId && _srcCs
          && _srcActor.ok === true && _srcActor.isTeacher === true) {
        try {
          if (await teacherOwnsSchedule(env as any, _srcActor as any, _srcCs)) {
            const { autoApproveStudentPostpone } = await import('./student-auto-postpone');
            _auto = await autoApproveStudentPostpone(env as any, _newReqId);
          } else _auto = { applied: null, reason: 'not_your_class' };
        } catch (e: any) { _auto = { applied: null, reason: 'apply_failed' }; console.warn('[schedule-requests] teacher auto-apply failed:', e?.message || e); }
      }
      // 🔔 실시간 알림 — 관리자 카톡(나에게 보내기=kakao_memo 큐). 대시보드 배지는 GET pending_count 로 별도 표시.
      try {
        const typeKo = reqType === 'cancel' ? '취소' : reqType === 'change' ? '변경' : '연기';
        const feeKo = feeType === 'paid' ? '💰유료' : feeType === 'free' ? '🆓무료' : '';
        const whenKo = (origDate && origTime) ? `${origDate} ${String(origTime).slice(0, 5)}` : '';
        await enqueueNotification(env, {
          type: 'schedule_request',
          title: `📅 수업 ${typeKo} ${_auto.applied ? '자동 반영' : '요청'} ${feeKo}`.trim(),
          body: `${studentName || requesterName2 || '학생'} 님 · 강사 ${teacherName}${whenKo ? ` · 원수업 ${whenKo}` : ''}${reqType === 'change' && newDate ? ` → ${newDate} ${String(newTime || '').slice(0, 5)}` : ''}. ${_byAdmin ? '관리자가 직접 접수한 요청입니다.' : _auto.applied ? '강사 요청이 시간표에 바로 반영됐습니다.' : '관리자 페이지에서 승인/거절하세요.'}`,
          meta: { request_id: r?.meta?.last_row_id || null, request_type: reqType, requester_role: requesterRole, fee_type: feeType, minutes_before: minutesBefore, student_name: studentName, teacher_name: teacherName },
          channel: 'kakao_memo'
        });
      } catch (e: any) { console.warn('[schedule-requests] notify skipped:', e?.message || e); }
      return json({ ok: true, id: r?.meta?.last_row_id || null, status: _auto.applied ? 'approved' : 'pending', auto_applied: _auto.applied, auto_reason: _auto.reason, fee_type: feeType, minutes_before: minutesBefore, created_at: now, ...(_endMk ? { end_makeup: _endMk, new_date: newDate, new_time: newTime } : {}) });
    }


    // ── GET /api/admin/schedule-requests?status=&teacher_name=&limit= — 요청 목록 ──
    //   관리자 카드(전체) + 강사 마이페이지(본인 것만 teacher_name 필터) 공용.
    if (method === 'GET' && path === '/api/admin/schedule-requests') {
      await ensureScheduleRequestTable();
      const status = (url.searchParams.get('status') || '').trim();
      let teacher = (url.searchParams.get('teacher_name') || '').trim();
      const limit = Math.min(300, Math.max(1, parseInt(url.searchParams.get('limit') || '100', 10) || 100));
      // 🔐 강사 로그인 시엔 본인 요청만(타 강사 요청·학생명 노출 방지). pending_count 도 본인 기준.
      const _srActor = await getAdminActor(request, env as any);
      if (_srActor.isTeacher) {
        if (!_srActor.name) return json({ ok: true, pending_count: 0, rows: [] });
        teacher = _srActor.name;
      }
      /* 🔒 (2026-08-17 사장님) 지사·대리점도 연기·변경 요청을 처리한다 —
           «학부모·학생도 하고 학원장님도 한다» 는 확인을 받고 화면을 열었다.
         그런데 이 목록에는 **스코프 필터가 없었다.** 관리자면 전부 돌려줬으므로,
         화면만 켰다면 강남점 원장님이 서초점·부산지사 요청까지 보게 된다(학생 이름 포함).
         그래서 화면보다 **여기를 먼저** 고친다.

         잇는 길 — 요청 → class_schedules.user_id → students_erp → shop_name/franchise.
         schedule_change_requests 에는 지사·대리점 칸이 아예 없어서 이 경로뿐이다.

         ⚠️ **막는 쪽으로 실패한다(fail-closed).** schedule_id 가 비었거나 그 수업이
            students_erp 로 이어지지 않는 요청은 지사·대리점에게 **안 보인다.**
            학생 이름으로 맞추는 방법도 있지만, 동명이인이면 다른 대리점 학생이 새어 나간다 —
            덜 보이는 쪽이 잘못 보이는 쪽보다 낫다. 본사(hq)는 예전처럼 전부 본다.
         ⚠️ hq · none(내부직원) 은 cond 가 빈 문자열이라 **동작이 하나도 안 바뀐다.** */
      const _srScope = await getScope(env as any, request);
      const _srC = scopeStudentCond(_srScope);
      const _srScopeCond = _srC.cond
        ? `schedule_id IN (SELECT id FROM class_schedules WHERE user_id IN (SELECT user_id FROM students_erp WHERE ${_srC.cond}))`
        : '';

      const conds: string[] = []; const binds: any[] = [];
      if (status && status !== 'all') { conds.push('status = ?'); binds.push(status); }
      if (teacher) { conds.push('teacher_name = ?'); binds.push(teacher); }
      if (_srScopeCond) { conds.push(_srScopeCond); binds.push(..._srC.binds); }
      const where = conds.length ? ('WHERE ' + conds.join(' AND ')) : '';
      const rs: any = await env.DB.prepare(
        `SELECT * FROM schedule_change_requests ${where} ORDER BY (status='pending') DESC, created_at DESC LIMIT ?`
      ).bind(...binds, limit).all().catch(() => ({ results: [] }));
      // pending 카운트: 강사는 본인 것만, 지사·대리점은 자기 학생만, 본사는 전체
      const _pendConds: string[] = ["status='pending'"]; const _pendBinds: any[] = [];
      if (_srActor.isTeacher) { _pendConds.push('teacher_name = ?'); _pendBinds.push(teacher); }
      else if (_srScopeCond) { _pendConds.push(_srScopeCond); _pendBinds.push(..._srC.binds); }
      const pending: any = await env.DB.prepare(
        `SELECT COUNT(*) AS c FROM schedule_change_requests WHERE ${_pendConds.join(' AND ')}`
      ).bind(..._pendBinds).first().catch(() => null);
      return json({ ok: true, pending_count: pending?.c || 0, rows: rs.results || [], scope: _srScope.type });
    }


    // ── POST /api/admin/schedule-requests/decide — 승인/거절 (관리자) ──
    //   body: { id, action:'approve'|'reject', memo?, decided_by? }
    //   승인: 새 일시가 있으면 class_schedules 를 그 일시로 이동, 없으면(단순 연기) status='postponed'.
    if (method === 'POST' && path === '/api/admin/schedule-requests/decide') {
      const _srdActor = await getAdminActor(request, env as any);
      if (_srdActor.isTeacher) return json(forbiddenTeacherBody(_srdActor, '강사는 요청을 승인·거절할 수 없습니다.'), 403);
      await ensureScheduleRequestTable();
      const body: any = await request.json().catch(() => ({}));
      const id = parseInt(body.id, 10);
      const action = body.action === 'approve' ? 'approved' : body.action === 'reject' ? 'rejected' : null;
      if (!id || !action) return json({ ok: false, error: 'id_and_action_required' }, 400);
      const row: any = await env.DB.prepare(`SELECT * FROM schedule_change_requests WHERE id = ? LIMIT 1`).bind(id).first().catch(() => null);
      if (!row) return json({ ok: false, error: 'request_not_found' }, 404);
      /* 🔒 (2026-08-17) 남의 지사·대리점 요청은 승인·거절할 수 없다.
           목록만 걸러 두면 **id 만 알면 남의 요청도 승인**된다(id 는 1,2,3… 순번이다).
           목록과 «같은 조건» 으로 다시 확인한다 — 한쪽만 막으면 어긋난다
           (CLAUDE.md 의 «짝이 되는 API 끼리 판정이 어긋나지 않았는지» 함정). */
      const _sdScope = await getScope(env as any, request);
      const _sdC = scopeStudentCond(_sdScope);
      if (_sdC.cond) {
        const _own: any = await env.DB.prepare(
          `SELECT 1 AS ok FROM schedule_change_requests
            WHERE id = ?
              AND schedule_id IN (SELECT id FROM class_schedules WHERE user_id IN (SELECT user_id FROM students_erp WHERE ${_sdC.cond}))
            LIMIT 1`
        ).bind(id, ..._sdC.binds).first().catch(() => null);
        if (!_own) return json({ ok: false, error: 'forbidden_scope', scope: _sdScope.type,
          message: '이 요청은 다른 지사·대리점 것입니다.' }, 403);
      }
      if (row.status !== 'pending') return json({ ok: false, error: 'already_decided', status: row.status }, 409);

      const now = Date.now();
      const mutations: any[] = [];
      let guards: Awaited<ReturnType<typeof prepareScheduleRequestGuards>>;
      const decisionScope = _sdC.cond ? {
        sql: `EXISTS (SELECT 1 FROM class_schedules WHERE id = ? AND user_id IN (SELECT user_id FROM students_erp WHERE ${_sdC.cond}))`,
        args: [row.schedule_id, ..._sdC.binds],
      } : undefined;
      try { guards = await prepareScheduleRequestGuards(env, row, undefined, decisionScope); }
      catch { return json({ ok: false, error: 'request_lookup_failed' }, 503); }
      let applied: string | null = null;
      let _oneWeekApplied = false;   // 🔁 반복 수업 «그 주 하루만» 으로 반영했나(이력 문구용)
      let teacherChanged: { id: string; name: string | null } | null = null;   // 👨‍🏫 승인으로 담당 강사를 바꿨으면
      let _origTeacherId: any = null;   // 🔔 바꾸기 «전» 담당 — 강사 알림이 원래 강사에게 가게(teacher-change-alert.ts)
      if (action === 'approved' && row.schedule_id) {
        try {
          // ⚠️ 운영 스케줄은 대부분 반복(매주, scheduled_date=NULL) — 반복 row 를 덮어쓰면
          //   그 주만이 아니라 모든 주가 바뀌므로, 날짜 지정 수업일 때만 자동 반영한다.
          //   반복 수업은 요청 기록만 영구 보존(applied='recorded') → 시간표에서 수동 조정.
          await ensureStartsOnColumn(env);   // ⏭ skip_dates 칸이 «읽기 전» 에 있어야 guard 스냅샷이 맞는다
          const cs: any = await env.DB.prepare(
            `SELECT * FROM class_schedules WHERE id = ? LIMIT 1`
          ).bind(row.schedule_id).first();
          if (!cs) return json({ ok: false, error: 'schedule_not_found' }, 409);
          _origTeacherId = cs.teacher_id ?? null;
          const isDated = !!(cs && cs.scheduled_date);
          /* 🔁 (2026-10-09) 반복 수업은 «그 주 하루만» 반영할 수 있으면 그렇게 한다(recurring-one-week.ts).
             못 하는 사유가 «예전 요청이라 회차·스냅샷이 없음» 이면 예전처럼 기록만(recorded). */
          const _oneWeekWhy: string | null = isDated ? 'not_recurring' : oneWeekEligible(row, cs, kstToday(now));
          // Match direct atomic moves: a frozen clock / A→B→A must not revive a stale snapshot.
          const scheduleUpdatedAt = Math.max(now, (Number(cs.updated_at) || 0) + 1);
          // Old requests have no reliable teacher/status/version baseline. They may be
          // rejected, but a dated approval needs a newly submitted server snapshot.
          if (isDated && !row.schedule_snapshot) return json({ ok: false, error: 'request_snapshot_missing',
            message: '이전 요청의 원래 수업 정보를 확인할 수 없습니다. 반려 후 새 요청을 접수해 주세요.', message_en: 'The original class snapshot is unavailable. Reject this request, then submit a fresh request.' }, 409);
          if (row.schedule_snapshot && row.schedule_snapshot !== scheduleMoveVersion(cs)) return json({ ok: false, error: 'schedule_changed',
            message: '요청 후 수업이 변경되었습니다. 반려 후 최신 시간표에서 다시 요청해 주세요.', message_en: 'The class changed after this request. Reject it, then submit a fresh request from the current timetable.' }, 409);
          if (isDated && ['cancelled','ended','completed'].includes(String(cs.status || ''))) return json({ ok: false, error: 'schedule_not_movable' }, 409);
          guards = await prepareScheduleRequestGuards(env, row, cs, decisionScope);
          /* 🔒 (2026-09-22) 「사람 손이 이긴다」 도장 — 미러가 우리 수정을 덮지 않게 한다.
             [잰 것 — 2026-09-22, c24-mirror.ts 의 planMirror 를 있는 그대로 돌림]
               · 시각만 옮김(같은 날) — 도장 없으면 'ok'(새로 만들기 시도) / 있으면 'diverged'(손 안 대고 알림) ✅
               · 연기(status=postponed) — 없으면 'already' / 있으면 'manual_locked' ✅
               · 연기 뒤 카페24가 강사를 바꿈 — 없으면 **'update'(start_time·duration·teacher 를 덮어씀)** / 있으면 'manual_locked' ✅
             ⟹ 도장이 실제로 막는 것은 **«같은 날짜에 머무는» 수정**이다.
             ⛔ 「옮긴 수업이 밤사이 되돌아간다」로 적지 말 것 — 그 'update' 는 행이 카페24와
                **같은 (날짜,시각) 자리에 그대로 있을 때만** 닿는다(planMirror 의 sameSlot).
                한 번 옮기면 그 자리를 벗어나 'ok' 로 가므로 되돌림이 일어나지 않는다.

             🔴 **날짜가 바뀌는 이동에는 도장을 찍으면 «안 된다»** — 찍으면 오히려 유령이 생긴다.
                [잰 것 — 2026-09-22, 진짜 SQLite] 미러의 부분 유니크 인덱스는
                `ON class_schedules(notes) WHERE source='c24-mirror'` 라 도장을 찍은 행은 **그 밖**이다.
                  · 도장 없음 → 새 INSERT 가 UNIQUE 위반으로 **거절**(중복 없음)
                  · 도장 있음 → INSERT **성공** ⟹ **옛 날짜에 그 수업이 다시 생긴다**
                그것이 2026-09-01 「미러가 «실제로 없는 수업» 을 만듦 — 강사가 20분 헛기다리고
                학생 노쇼까지 찍힘」과 같은 모양이다.
             ✅ 그래서 **날짜가 그대로일 때만** 찍는다(연기는 날짜가 안 바뀌므로 언제나 찍는다).
                날짜가 바뀌는 이동은 도장 없이 — 예전 동작 그대로라 새로 잃는 것이 없다.
             ⛔ 도장을 나중에 «따로» 찍지 말 것 — 그 사이에 야간 미러가 돌 수 있고, 한 줄이
                실패하면 반쪽만 남는다. **같은 UPDATE 안에서** 찍는다(DELETE·PATCH 가 이미 쓰는 방식).
             ℹ️ 미러 행이 아니면 손대지 않는다 — 예전 동작 그대로다.
             🟡 더 나은 길(별건·사람이 정할 일): planMirror 의 `manual` 찾기를 «날짜» 가 아니라
                **notes(c24:<수업번호>)** 로 맞추면 날짜를 옮겨도 도장이 일한다. 미러의 심장을
                고치는 일이라 여기서는 안 건드렸다.
             ✅ (2026-11-08 사장님 «미러가 연기 수업 다시 만드는 것도 막아줘») 미러 쪽에서 그렇게 했다 — c24-mirror.ts
                loadMirrorMoved 가 «도장» 과 «이 승인·이동 기록» 을 수업번호로 모아, 원래 자리 재생성(planMirror 2-a)과
                옮긴 보강의 «사라진 수업» 취소(applyMirror)를 막는다. 운영 실측 #7730: 연기보강이 notes 에 이름을 덧붙여
                위 유니크 인덱스가 못 막았다(12분 뒤 #7772 재생성) · 원래 날짜가 지나자 11/11 보강이 취소됐다.
                ⛔ 그래서 여기 «날짜가 바뀌면 도장 없음» 은 그대로 둬도 된다(승인 기록이 근거가 된다). */
          const _isMirror = String((cs as any)?.source || '') === MIRROR_SOURCE;
          /* 👨‍🏫 (2026-09-30) 학생이 «교사로 연기» 에서 고른 강사(new_teacher_id) — 승인이 «실제로» 바꾼다.
             예전엔 이 경로에 teacher_id 를 바꾸는 코드가 한 줄도 없어서, 학생은 «선택됨» 을 보고 관리자는
             «승인·이동됨» 을 보는데 수업은 원래 강사 그대로였다(함정 대조가 잡음 — 에러 없음).
             🔒 게이트는 PATCH 담당 강사 변경과 같은 정본 teacherMoveDenyReason(본사만 · 강사 차단 · 모르면 막음).
             ⛔ 막히거나 못 바꾸면 «옮기지도 않는다» — 강사를 바꾸려던 요청인데 시각만 바꾸고 «완료» 라 하면 거짓이다.
             ⛔ 카페24 미러 수업을 «날짜를 바꾸면서» 강사까지 바꾸지 않는다(도장 → 옛 날짜에 유령. 위 🔴).
             ℹ️ 반복 수업은 여전히 'recorded' — 한 줄이 «매주 전부» 라 그 주만 바꿀 방법이 없다. */
          const _wantTid = String((row as any).new_teacher_id ?? '').trim();
          let _swap = (isDated || !_oneWeekWhy) && !!(row.new_date && row.new_time) && /^\d+$/.test(_wantTid) && _wantTid !== String((cs as any)?.teacher_id ?? '');
          let _swapBlock: { ko: string; en: string } | null = null;
          let _swapName: string | null = null;
          if (_swap) {
            if (_isMirror && String(row.new_date || '') !== String((cs as any)?.scheduled_date || '')) {
              _swapBlock = { ko: '카페24에서 온 수업은 날짜를 옮기면서 담당 강사까지 바꿀 수 없어요. 시간표에서 직접 조정해 주세요.', en: 'For Cafe24 classes the teacher cannot be changed together with a date change. Please adjust it in the timetable.' };
            } else {
              let _stScope: string | null = null;
              try {
                const _sr: any = await env.DB.prepare(`SELECT scope_type FROM admin_scope WHERE username = ? LIMIT 1`).bind(_srdActor.username).first();
                const _st = _sr ? String(_sr.scope_type ?? '').trim() : '';
                _stScope = _st || null;              // 모르면 정본 게이트가 막는다
              } catch { _stScope = null; }
              const _deny = teacherMoveDenyReason({ ok: _srdActor.ok, isTeacher: _srdActor.isTeacher, scopeType: _stScope });
              if (_deny) _swapBlock = { ko: _deny.message, en: 'Only head office can change the class teacher.' };
              else {
                const _tr: any = await env.DB.prepare(`SELECT name FROM teachers WHERE CAST(id AS TEXT) = ? AND COALESCE(active,1) = 1 LIMIT 1`).bind(_wantTid).first().catch(() => null);
                if (!_tr) _swapBlock = { ko: '고른 강사를 찾지 못했어요(퇴사했거나 번호가 바뀜). 시간표에서 직접 조정해 주세요.', en: 'The chosen teacher was not found (left or changed). Please adjust it in the timetable.' };
                else _swapName = String(_tr.name || '');
              }
            }
            if (_swapBlock) _swap = false;
          }
          if (_swapBlock) {
            return json({ ok: false, error: 'teacher_not_changed', applied: 'teacher_not_changed', message: _swapBlock.ko, message_en: _swapBlock.en }, 409);
          } else if (row.request_scope === WEEKLY_POSTPONE) {
            const weekly = await prepareWeeklyPostpone(env, row, cs, now);
            if (!weekly.ok) return json({ ok: false, error: weekly.error, message: '연기할 전체 일정이 달라졌거나 가능한 시간이 아닙니다. 최신 시간표를 확인해 주세요.' }, 409);
            mutations.push(...weekly.mutations);
            applied = 'moved';
          } else if (isDated && row.new_date && row.new_time) {
            // ⛔ (2026-08-04) 옮기기 전에 «그 자리가 비어 있는지» 확인한다.
            //   여기엔 겹침 검사가 없어서, 강사 요청을 승인하면 다른 수업과 겹쳐도 그대로 옮겨졌다.
            //   겹치거나 근무불가면 409 — 요청은 pending 으로 남아 반려·재접수가 가능하다.
            const target = { ...cs, scheduled_date: String(row.new_date), start_time: String(row.new_time), teacher_id: _swap ? _wantTid : cs.teacher_id };
            const targetTeacher: any = await env.DB.prepare(`SELECT name FROM teachers WHERE CAST(id AS TEXT) = ? LIMIT 1`).bind(String(target.teacher_id || '')).first();
            const strictConflict = await findScheduleMoveConflicts(env, target, String(targetTeacher?.name || ''), [row.schedule_id]);
            if (strictConflict) return json({ ok: false, ...strictConflict, message_en: strictConflict.error === 'teacher_unavailable' ? 'The teacher is unavailable or on leave at that time. Choose another teacher or time.' : strictConflict.error === 'conflict' ? 'The requested time overlaps another class. Choose another time.' : 'Availability could not be verified. Refresh and try again.' }, strictConflict.status);
            const conf = await findScheduleConflicts(env, {
              kind: 'one_off',
              userId: cs.user_id, teacherId: _swap ? _wantTid : cs.teacher_id,   // 👨‍🏫 바꿀 강사면 «그 강사» 가 비었는지
              schedDate: String(row.new_date), startTime: String(row.new_time),
              durationMin: Number(cs.duration_min) > 0 ? Number(cs.duration_min) : DEFAULT_CLASS_MINUTES,
              excludeId: row.schedule_id,
            // Strict move validation above owns overlap semantics, including H:MM/HH:MM
            // equivalence. Retain only this legacy helper's long-class capacity check.
            }, { student: [], teacher: [] });
            if (conf.has) {
              return json({ ok: false, error: 'conflict', applied: 'conflict', conflict: { ko: conf.ko, en: conf.en, student: conf.student.length, teacher: conf.teacher.length }, message: conf.ko, message_en: conf.en }, 409);
            } else {
              /* ⛔ 날짜가 바뀌면 도장을 찍지 않는다 — 찍으면 옛 날짜에 유령이 되살아난다(위 🔴). */
              const _stampMove = _isMirror && String(row.new_date || '') === String((cs as any)?.scheduled_date || '');
              const _mv = env.DB.prepare(
                _stampMove
                  ? `UPDATE class_schedules SET scheduled_date = ?, start_time = ?, source = '${MIRROR_SOURCE_MANUAL}', updated_at = ? WHERE id = ?`
                  : `UPDATE class_schedules SET scheduled_date = ?, start_time = ?, updated_at = ? WHERE id = ?`
              ).bind(row.new_date, row.new_time, scheduleUpdatedAt, row.schedule_id);
              /* 👨‍🏫 강사를 바꿀 때는 D1 batch(한 트랜잭션)로 «함께» — 둘로 따로 돌리면 한쪽만 남을 수 있다.
                 ⚠️ 위 UPDATE 문장은 손대지 않는다 — 하니스 둘(manager_today_reschedule·schedule_move_room_sync)이
                    그 글자를 오려 내 진짜 SQLite 로 돌린다. 강사를 안 바꾸는 승인은 예전과 같은 경로다. */
              /* ⏸ (2026-10-01) 연기했던 회차를 새 날짜로 «다시 잡는» 것이면 열린 수업으로 되돌린다 —
                 안 되돌리면 새 날짜에서도 'postponed' 라 오늘 수업·학생 입장에서 숨는다(class-postponed.ts).
                 연기 상태가 아니면 그 문장은 0행이라 아무것도 안 바뀐다. 같은 batch(한 트랜잭션)로 묶는다. */
              const _mvAll: any[] = [_mv];
              if (_swap) _mvAll.push(env.DB.prepare(`UPDATE class_schedules SET teacher_id = ? WHERE id = ?`).bind(_wantTid, row.schedule_id));
              if (String((cs as any)?.status || '') === 'postponed') _mvAll.push(env.DB.prepare(REACTIVATE_POSTPONED_SQL).bind(row.schedule_id));
              /* ⏸ (2026-10-02) 연기보강이면 옮긴 줄에 이름을 붙인다 — 같은 batch(한 트랜잭션). */
              if ((row as any).end_makeup) _mvAll.push(env.DB.prepare(END_MAKEUP_MARK_SQL).bind(String((row as any).end_makeup), row.schedule_id));
              mutations.push(..._mvAll);
              applied = 'moved';
              if (_swap) teacherChanged = { id: _wantTid, name: _swapName };
            }
          } else if (isDated) {
            mutations.push(env.DB.prepare(
              _isMirror
                ? `UPDATE class_schedules SET status = 'postponed', source = '${MIRROR_SOURCE_MANUAL}', updated_at = ? WHERE id = ?`
                : `UPDATE class_schedules SET status = 'postponed', updated_at = ? WHERE id = ?`
            ).bind(scheduleUpdatedAt, row.schedule_id));
            applied = 'postponed';
          } else if (_oneWeekWhy && ONE_WEEK_FALLBACK.includes(_oneWeekWhy)) {
            applied = 'recorded';   // 옛 요청(회차 날짜·스냅샷 없음) — 예전처럼 기록만, 시간표에서 수동 조정
          } else if (_oneWeekWhy) {
            const _m = oneWeekMessage(_oneWeekWhy);
            return json({ ok: false, error: _oneWeekWhy, message: _m.ko, message_en: _m.en }, 409);
          } else {
            const _ow = await prepareRecurringOneWeek(env, row, cs, now, { teacherId: _swap ? _wantTid : null, actor: _srdActor.username || 'admin' });
            if (!_ow.ok) {
              const _m = (_ow.conflict && _ow.conflict.ko) ? { ko: _ow.conflict.ko, en: _ow.conflict.en || oneWeekMessage('conflict').en } : (_ow.conflict && _ow.conflict.message) ? { ko: _ow.conflict.message, en: oneWeekMessage(String(_ow.error)).en } : oneWeekMessage(String(_ow.error));
              return json({ ok: false, error: _ow.error, applied: _ow.error === 'conflict' ? 'conflict' : undefined, message: _m.ko, message_en: _m.en }, _ow.status);
            }
            mutations.push(..._ow.mutations);
            applied = _ow.applied;
            _oneWeekApplied = true;
            if (_swap && _ow.applied === 'moved') teacherChanged = { id: _wantTid, name: _swapName };
          }
        } catch (e: any) { console.warn('[schedule-requests] apply err:', e?.message); return json({ ok: false, error: 'request_apply_failed' }, 503); }
      }
      const decision = env.DB.prepare(`UPDATE schedule_change_requests SET status = ?, decided_by = ?, decided_at = ?, decide_memo = ? WHERE id = ? AND status = 'pending'`)
        .bind(action, (body.decided_by || '관리자').trim(), now, (body.memo || '').trim() || null, id);
      try { await commitScheduleRequestDecision(env, guards, mutations, decision); }
      catch (e: any) {
        const changed = /schedule_request_snapshot/.test(String(e?.message || e));
        return json({ ok: false, error: changed ? 'request_or_schedule_changed' : 'request_apply_failed',
          message: changed ? '확인 중 요청·수업 정보가 변경되었습니다. 새로고침해 주세요.' : '저장하지 못했습니다. 요청과 시간표를 새로고침한 뒤 다시 시도해 주세요.',
          message_en: changed ? 'The request or class changed while checking. Refresh before trying again.' : 'Nothing was saved. Refresh the request and timetable, then try again.' }, changed ? 409 : 503);
      }
      // 📜 승인으로 수업이 실제 이동/연기된 경우 변경 이력에 기록(거절은 미기록)
      //   충돌·저장 실패는 위에서 돌아가므로 성공한 결정만 이력에 남는다.
      if (action === 'approved' && applied && applied !== 'conflict' && applied !== 'teacher_not_changed') {
        await writeClassAudit(env, {
          action: row.request_type === 'change' ? 'reschedule' : 'postpone',
          schedule_id: row.schedule_id,
          teacher_name: row.teacher_name || null,
          student_name: row.student_name || null,
          lesson_date: row.orig_date || null,
          lesson_time: row.orig_time || null,
          actor: (body.decided_by || _srdActor.name || '관리자').trim(),
          actor_role: 'admin',
          teacher_id: _origTeacherId,
          source: 'schedule-request',
          reason: row.reason || null,
          detail: [((row as any).end_makeup && applied === 'moved' ? String((row as any).end_makeup) : null),
                   ((row.new_date || row.new_time) ? `→ ${row.new_date || ''} ${row.new_time || ''}`.trim() : (applied === 'recorded' ? '반복수업 기록보존(수동조정 필요)' : (_oneWeekApplied && applied === 'postponed' ? `반복수업 ${row.orig_date} 회차만 연기` : null))),
                   (teacherChanged ? `담당 강사 → ${teacherChanged.name || ('#' + teacherChanged.id)}` : null)].filter(Boolean).join(' · ') || null,
        });
      }
      return json({
        ok: true, id, status: action, applied, decided_at: now,
        ...(teacherChanged ? { teacher_changed: teacherChanged } : {}),
      });
    }


    // ── GET /api/admin/classes/today — 📅 오늘 수업 전체 (매니저용) ──
    //   (2026-07-23) 매니저 요청: "오늘의 수업에서 바로 수업에 들어갈 수 있어야 한다.
    //   강사가 못 들어오면 매니저가 최대한 빨리 대신 맡는다."
    //   기존엔 '오늘 수업' 목록이 학생/강사 본인용(/api/class/today)뿐이라 매니저가 볼 방법이 없었다.
    //   room_id 규칙은 예약 기반 결정론 `class-{scheduleId}-{YYYYMMDD}` 로 api-mango.ts 와 동일해야 한다
    //   (다르면 매니저가 학생과 다른 방에 들어가 서로 못 만난다).
    /* 📅 (2026-08-25 8/25 매니저 보고서 ②③) 「오늘 전체 수업」이 늘 비어 있던 이유 — **원인이 둘이었다**
       ═══════════════════════════════════════════════════════════════════════════
       🔴 ① 이 경로가 **줄곧 404 였다.** `index.ts` 라우팅 목록(관문 ②)에는 있었지만
          `api-mango.ts` 위임 가드(관문 ③)에 없어서 `handleAdminApi` 까지 오지 못했다
          (2026-07-23 신설 이래 한 번도 등록된 적이 없다 — `git log -S` 로 확인).
          ⚠️ 화면에는 «고장» 으로 안 보였다: 404 본문 `{error:'Not Found'}` 에는 `ok` 칸이 없어
             `if (d.ok === false)` 를 통과하고 `d.sessions || []` 가 빈 배열이 되어
             **「오늘 예정된 수업이 없습니다」라는 정상 문구**로 그려졌다.
          → 2026-08-25 에 관문 ③에 등록했다. 회귀 감시는 `classes_today_cafe24_harness` ②-1
             (문자열이 아니라 **그 조건식을 실제로 돌려서** 판정한다).

       ② 그리고 관문을 뚫어도 이 API 는 `class_schedules` 만 읽었다. **실제 운영 수업은 카페24가 정본**이고
       카페24 예약은 그 표에 한 줄도 안 들어온다(cafe24-sync 는 `attendance` 에 `c24-{class_id}`
       씨앗으로만 넣는다). 그래서 매니저가 [Load] 를 눌러도 «No classes scheduled for today»
       였다 — 같은 시각 카페24에서는 수업 6건이 돌고 있었다(8/25 보고서 스크린샷 실측).
       → 두 갈래를 **한 목록으로 합쳐서** 준다. 어디서 온 줄인지는 `source` 로 구분한다.

       ⛔ 카페24 줄에는 [입장]·[참관] 버튼을 주지 않는다(`join_open`·`observable` = false).
          카페24 수업은 망고아이 화상방을 거치지 않아 **들어갈 방이 없다** — 버튼을 주면
          아무도 없는 방으로 보낸다(2026-08-24 에 같은 이유로 «오늘 목록에 안 넣는다» 했던 판단).
          동기화가 가져오는 속성에 강의실 URL 이 없어서(cafe24-sync.ts 의 Cypher) 링크도 못 건다.

       🔒 지사·대리점 격리 — 이 목록은 manager.html 도 쓰고, 그 화면은 지사·대리점도 쓴다.
          범위 밖 학생 이름이 나가면 개인정보가 샌다 → `scopeStudentCond` 로 자른다
          (`/api/admin/live-classes`·`classes-now` 와 같은 방식).
       ⛔ 강사는 아예 막는다 — 전사 학생 이름·강사 배정이 한 화면에 모인다. 강사가 볼 것은
          teacher.html 이 이미 준다. `scope.type='none'`(내부직원·교사)은 격리 대상이 아니라
          **스코프로는 못 막는다** → `isTeacher` 로 따로 끊는다(CLAUDE.md 2장 `canEditOrg` 함정과 같은 뿌리).

       🧹 자리표시 행(`user_id` = 'lms'·'type_seed')은 뺀다 — 학생이 안 붙은 «자리만 잡아 둔» 행이라
          매니저 목록에 섞이면 수백 건이 실제 수업처럼 보인다(실측 기준 lms 518·type_seed 140).
          ⚠️ 제외식은 `schedule-conflict.ts` 의 `NOT_PLACEHOLDER`·api-teacher.ts·churn-graph.ts 와
             **글자 하나까지 같게** 유지할 것 — 화면마다 다르게 세기 시작하면 아무도 못 고친다.

       📆 `?date=YYYY-MM-DD` — 없으면 오늘(KST). 「완료된 수업 기록」(보고서 ③)이 같은 API 다.
          날짜만 바꾸면 되므로 조회를 따로 만들지 않는다(둘이 어긋날 일이 없다). */
    if (method === 'GET' && path === '/api/admin/classes/today') {
      const _ctActor = await getAdminActor(request, env as any);
      if (_ctActor.isTeacher) return json(forbiddenTeacherBody(_ctActor), 403);
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS class_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, teacher_id TEXT, student_name TEXT, schedule_kind TEXT, day_of_week INTEGER, scheduled_date TEXT, start_time TEXT, duration_min INTEGER, status TEXT);`); } catch {}
      /* 🔄 (2026-08-28) 1회성 대체강사 오버레이 표 — enroll-ops.ts 의 ensureEnrollTables() 와 같은
         정의를 여기서도 방어적으로 한 번 더 만든다(그 핸들러가 먼저 안 돌았을 수도 있어서 —
         위 class_schedules 방어 생성과 같은 이유). */
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS class_substitutions (id INTEGER PRIMARY KEY AUTOINCREMENT, schedule_id INTEGER NOT NULL, sub_date TEXT NOT NULL, original_teacher_id TEXT, substitute_teacher_id TEXT NOT NULL, reason TEXT, created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER, status TEXT NOT NULL DEFAULT 'active');`); } catch {}
      /* ⚠️ (2026-08-30) 인덱스도 «같이» 만든다 — CREATE 만 베껴 두면 이 핸들러가 먼저 돌 새 DB 에서는
         (schedule_id, sub_date) UNIQUE 가 없는 표가 만들어져 UPSERT 가 «하루 한 명» 을 못 지킨다. */
      try { await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS uq_class_sub_slot ON class_substitutions(schedule_id, sub_date)`).run(); } catch {}
      /* ⚡ 하루치를 날짜로 집는 인덱스가 없었다(있는 것은 room_id 단독·(user_id,date)·(teacher_uid,date)).
         `date = ?` 로 거르므로 이 인덱스가 없으면 attendance 전체를 훑는다. 인덱스 추가는
         데이터 변경이 아니라 안전하다(CLAUDE.md 1-1 은 DELETE/UPDATE/DROP 금지). */
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_attendance_date_room ON attendance(date, room_id)`); } catch {}

      const KST = 9 * 60 * 60 * 1000;
      const nowMs = Date.now();
      const k = new Date(nowMs + KST);                       // KST 벽시계
      const p2 = (n: number) => String(n).padStart(2, '0');
      const todayStr = `${k.getUTCFullYear()}-${p2(k.getUTCMonth() + 1)}-${p2(k.getUTCDate())}`;
      /* 📆 조회할 날짜 — 모양이 안 맞으면 조용히 오늘로 (엉뚱한 문자열이 SQL 비교에 들어가면
         에러 없이 «빈 표» 가 되어 「수업이 없다」로 읽힌다. CLAUDE.md 2장 분기 비교 함정과 같은 뿌리) */
      const qDate = String(url.searchParams.get('date') || '').trim();
      const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(qDate) ? qDate : todayStr;
      const kY = Number(dateStr.slice(0, 4)), kMo = Number(dateStr.slice(5, 7)) - 1, kD = Number(dateStr.slice(8, 10));
      const kDow = new Date(Date.UTC(kY, kMo, kD)).getUTCDay();
      const ymd = `${kY}${p2(kMo + 1)}${p2(kD)}`;
      const OPEN_BEFORE = 10 * 60 * 1000;                    // 정규 수업: 시작 10분 전부터 입장 가능
      // ⏰ 레벨테스트만 30분 (api-mango.ts·leveltest-ticket.ts 와 같은 값 — 셋이 어긋나면 화면끼리 말이 달라진다)
      const OPEN_BEFORE_LEVELTEST = 30 * 60 * 1000;
      const LATE_AFTER = 15 * 60 * 1000;                     // 종료 15분 후까지 지각 입장 허용

      const _ctScope = await getScope(env as any, request);
      const _ctStu = scopeStudentCond(_ctScope, 'se');       // 본사·내부직원은 빈 조건(=전체)

      let rows: any = { results: [] };
      /* ✕ (2026-11-03 매니저 «취소해도 지우지 말고 취소·연기 상태를 칸으로») 취소된 회차도 «그 날짜면» 받는다.
         예전엔 `status != 'cancelled'` 로 통째로 걸러, 취소한 수업이 목록에서 사라졌다(데이터는 남아 있었다).
         ⛔ 날짜가 정해진 취소 행만 — 매주 반복 행의 cancelled 는 «회차» 가 아니다(정본 class-change-state.ts 규칙 ①).
         ⚠️ 바인드 순서: 이 조각의 (date, date) 가 스코프 바인드보다 «앞» 이다. */
      try {
        rows = await env.DB.prepare(
          `SELECT cs.*, t.name AS t_name, se.level AS se_level, se.textbook AS se_textbook, se.shop_name AS se_shop, se.korean_name AS se_name
             FROM class_schedules cs
             LEFT JOIN teachers t ON CAST(t.id AS TEXT) = CAST(cs.teacher_id AS TEXT)
             LEFT JOIN students_erp se ON se.user_id = cs.user_id
            WHERE ${liveOrCancelledInRangeSql('cs')}
              AND LOWER(COALESCE(cs.user_id,'')) NOT IN ('lms','type_seed')
              ${_ctStu.cond ? `AND (${_ctStu.cond})` : ''}`
        ).bind(dateStr, dateStr, ..._ctStu.binds).all<any>();
      } catch {
        /* students_erp 는 스키마 드리프트가 있는 표다 — 조인이 깨지면 조인 없이 다시 한 번.
           ⚠️ 단 **스코프가 걸린 요청은 폴백하지 않는다**: 조건이 사라지면 남의 지사 학생까지 나간다.
              폴백은 조건이 없는 본사·내부직원일 때만 안전하다. */
        if (_ctStu.cond) { rows = { results: [] } as any; }
        else rows = await env.DB.prepare(
          `SELECT * FROM class_schedules
            WHERE ${liveOrCancelledInRangeSql()}
              AND LOWER(COALESCE(user_id,'')) NOT IN ('lms','type_seed')`
        ).bind(dateStr, dateStr).all<any>().catch(() => ({ results: [] } as any));
      }

      /* 🔄 (2026-08-28) 이 날짜의 1회성 대체강사 오버레이 — schedule_id → 대체강사 id/이름.
         recurring 행의 teacher_id 는 그대로(=원래 강사)이므로, 화면에 보일 이름만 여기서 덮는다. */
      const subOverlay = new Map<string, { id: string; name: string | null }>();
      try {
        const subRows: any = await env.DB.prepare(
          `SELECT cs2.schedule_id, cs2.substitute_teacher_id, t2.name AS sub_name
             FROM class_substitutions cs2 LEFT JOIN teachers t2 ON CAST(t2.id AS TEXT) = CAST(cs2.substitute_teacher_id AS TEXT)
            WHERE cs2.sub_date = ? AND cs2.status = 'active'`
        ).bind(dateStr).all();
        for (const r of ((subRows?.results as any[]) || [])) {
          subOverlay.set(String(r.schedule_id), { id: String(r.substitute_teacher_id), name: r.sub_name || null });
        }
      } catch (e: any) { console.warn('[classes/today] substitution overlay:', e?.message); }

      /* ☎️ (2026-09-07 매니저 요청 «Please include student Name, ID, contact number, Academy»)
         연락처 — D1 에서 학생 번호가 실제로 남아 있는 표는 `student_retention` 하나뿐이다
         (+ 2026-09-10 부터 직원이 받아 둔 번호 `student_erp_override` — 정본 notify-contacts.ts loadContactPhones).
         📊 [재본 — 2026-09-07 운영 D1] `students_erp` 29,484행의 phone·parent_phone·student_phone 은
            **세 칸 전부 0건**이다(카페24 원본에 값이 없다 — CLAUDE.md 2장
            「학생 전화번호로 문자를 보내려는데 아무에게도 안 감」). 그래서 그 칸을 읽어 봐야
            영원히 빈칸이라 여기서는 읽지 않는다.
         ⚠️ `student_retention` 은 «이탈 위험 학생 스냅샷» 이지 전체 명부가 아니다 —
            카페24 서버가 밀어 넣고(handleRetentionIngest), 이번 스냅샷에 없는 학생은 **지워진다**.
            즉 «잘 다니는 학생은 원리상 없고», 있던 번호도 대상에서 벗어나면 사라진다.
            실측: 223행 중 199행에 번호가 있고, 예약이 잡힌 학생 444명 기준 **105명(23.6%)**.
            ⇒ «없음» 이 정상이다. 화면은 그 이유를 말해야 한다(빈칸은 «고장» 으로 읽힌다).
         ⛔ 없는 번호를 다른 칸으로 «그럴듯하게» 채우지 않는다(CLAUDE.md 2장
            「측정할 수 없는 값을 그럴듯하게 채우고 싶을 때」).
         🔒 번호는 **이미 스코프로 잘린 그날 목록의 학생만** 묻는다(아래 «목록 완성 뒤» 자리) —
            범위 밖 번호가 응답에 실릴 길이 없다. (2026-10-27 전에는 이탈위험 2,000행 맵을 통째로 읽었다)
         ⚠️ 이 조회가 실패해도 목록은 그대로 띄어야 한다 — 연락처 칸만 비우고 «확인 못 함» 이라고 말한다. */
      /* 🔒 연락처는 «본사·내부직원» 에게만 싣는다 — 이 API 는 `isAgencyAllowedApi` 에 올라 있어
         지사·대리점(manager.html)도 부른다. 지금까지 그 번호를 내주던 유일한 경로
         `/api/admin/retention` 은 **지사·대리점에게 403** 이었다. 즉 그냥 실으면
         **지사장·학원장이 처음으로 학생 전화번호를 보게 되는** 변경이 된다 —
         매니저 요청(«managers schedule»)에 없던 일이고 **사람이 정할 일**이다.
         ✅ 열려면 이 한 줄만 바꾸면 된다(범위 격리는 그대로라 자기 학생만 보인다).
         ℹ️ 학원(academy)·아이디는 그 청중이 이미 `/api/admin/students/erp-list` 로 보던 값이라 그대로 싣는다. */
      const _ctSeeContact = _ctScope.type === 'hq' || _ctScope.type === 'none';
      /* ☎ (2026-10-27 사장님 「매니저 화면도 직원이 넣은 번호 보이게 맞춰줘」) 번호는 정본 loadContactPhones
         (notify-contacts.ts — 직원이 받아 둔 번호 → 명부 → 이탈위험 스냅샷)로, 강사 화면과 «같은 답» 을 준다.
         예전엔 여기서 student_retention 2,000행을 통째로 읽어 맵을 만들었다 — 직원이 학생 상세·수강신청에서 넣은
         번호(student_erp_override)는 강사 화면에만 보이고 이 화면엔 안 보였다.
         ⚠️ 조회는 목록이 «다 만들어진 뒤» 아래에서 한다 — 스코프로 이미 잘린 그날 학생만 묻는다(범위 밖 번호가 응답에 실릴 길이 없다). */

      /* 🎌 (2026-10-09 사장님 「매니저 오늘 수업도 휴강 반영」) 그날이 공휴일 휴강이면 수업 줄을 «지우지 않고»
         상태를 'holiday' 로 바꾸고 입장을 닫는다 — 매니저는 «오늘 무엇이 쉬는지» 를 봐야 한다(지우면 «수업이 없어졌다» 로 읽힌다).
         판정 정본 holiday-closure.ts(중국어 수업 = 예외 강사는 그대로 연다 · 조회 실패 = 휴강 아님). */
      const _ctHol = await loadHolidayClosure(env.DB, dateStr);

      const sessions: any[] = [];
      // 🧾 「취소·연기」 칸 판정용 — schedule_id → 원본 행(상태·날짜·시각). 아래 «목록 완성 뒤» 에서 쓴다.
      const _ctRowById = new Map<string, any>();
      for (const s of (rows.results || [])) {
        /* ⛔ 매주 반복 행의 cancelled 는 «회차» 가 아니다 — 위 조회 조각이 이미 거르지만, 그 조각이 바뀌어도
           «취소된 매주 수업이 열린 수업으로 되살아나는» 일이 없게 여기서 한 번 더 막는다(정본 class-change-state.ts 규칙 ①). */
        if (String(s.status || '').trim().toLowerCase() === 'cancelled' && !isCancelledOccurrence(s)) continue;
        // 오늘 열리는 수업인가? (일회성=날짜 일치 / 반복=요일 일치)
        let occurs = false;
        if (s.scheduled_date) occurs = (String(s.scheduled_date).slice(0, 10) === dateStr);
        // ⚠️ Number() 로 비교하지 말 것 — 운영 값은 'Thu' 같은 문자열이라 NaN 이 된다(admDowMatches 주석 참고).
        else if (s.day_of_week != null && s.day_of_week !== '') occurs = admDowMatches(s.day_of_week, kDow) && recurStartedOn(s, dateStr);
        /* ⏭ (2026-10-09) 정본 recurStartedOn — «그 주만 빠진 날»·«시작일 전» 의 반복 줄은 오늘 목록에 안 뜬다
           (학생 입장·강사 화면과 같은 답. 전에는 여기만 이 판정을 안 거쳐 시작 전 수업까지 «오늘 수업» 이었다). */
        if (!occurs) continue;

        const [hh, mm] = String(s.start_time || '00:00').split(':').map((x: string) => Number(x));
        const start_ts = Date.UTC(kY, kMo, kD, hh || 0, mm || 0, 0) - KST;
        const dur = Number(s.duration_min || s.duration_minutes) || 30;
        const end_ts = start_ts + dur * 60000;
        const open_at_ts = start_ts - (String(s.class_type || '') === 'level_test' ? OPEN_BEFORE_LEVELTEST : OPEN_BEFORE);
        const close_at_ts = end_ts + LATE_AFTER;
        let status: string;
        if (nowMs < open_at_ts) status = 'early';
        else if (nowMs < start_ts) status = 'open';
        else if (nowMs <= close_at_ts) status = 'live';
        else status = 'ended';
        /* ✕ (2026-11-03) 취소된 회차 — 연기와 같은 원칙: 줄은 지우지 않고 상태를 'cancelled' 로, 입장·참관·옮기기는 닫는다.
           정본 src/class-change-state.ts(날짜가 정해진 행만). 취소가 «사실» 이라 아래 연기·휴강보다 나중에 덮어쓴다. */
        const _cancelled = isCancelledOccurrence(s);
        /* ⏸ (2026-10-01) 연기된 회차 — 줄은 지우지 않고(지우면 «수업이 없어졌다» 로 읽힌다)
           상태를 'postponed' 로, 입장은 닫는다. 정본 src/class-postponed.ts. */
        const _postponed = isPostponedOccurrence(s);
        if (_postponed) status = 'postponed';

        /* 🔄 대체강사가 배정된 회차면 화면에는 대체강사만 보인다 — 원래 강사 이름은
           substituted_from 에 남겨 「오늘 왜 다른 선생님이냐」 물었을 때 바로 답할 수 있게. */
        const sub = subOverlay.get(String(s.id));
        // 🎌 휴강 — 그날 실제로 가르칠 강사(대체강사가 있으면 그쪽)로 판정한다. 연기가 먼저(연기는 이미 «안 열림»).
        const _holOff = !_postponed && isHolidayClosedFor(_ctHol, sub ? sub.id : s.teacher_id);
        if (_holOff) status = 'holiday';
        if (_cancelled) status = 'cancelled';
        _ctRowById.set(String(s.id), { status: s.status, scheduled_date: s.scheduled_date, start_time: s.start_time });
        const origTeacherName = s.t_name || s.teacher_name || null;

        sessions.push({
          schedule_id: s.id,
          source: 'mangoi',            // 🏷 망고아이 예약 = 우리 방이 있다 → 입장·참관 가능
          observable: !_cancelled && !_postponed,     // ✕ 취소된 회차는 참관할 수업이 없다(빈 방을 열지 않는다)
          room_id: `class-${s.id}-${ymd}`,
          student_uid: s.user_id || null,
          // 🏷 (2026-09-28) 이름 칸이 빈 행(학생 상세 화면 등록분)은 명부 이름으로 보충 — 주간 스케줄과 같은 규칙
          student_name: s.student_name || s.se_name || null,
          /* 🏫☎️ (2026-09-07 매니저 요청) 학원(Academy)·연락처 — 수업에 안 들어오는 학생을
             그 자리에서 찾기 위해. 학원은 students_erp.shop_name(실측 29,079/29,484 = 98.6%),
             연락처는 아래 «목록이 다 만들어진 뒤» 정본으로 채운다. 모르면 null — 화면이 «—» 와 이유를 그린다. */
          academy: s.se_shop || null,
          contact_phone: null,
          /* 📚 (2026-08-25 보고서 ①) LMS 한 줄에 있던 「TEXTBOOK 배정 없음」 배지의 우리 쪽 대응.
             정본은 students_erp.textbook — 화상수업의 «배정 교재 자동 로드» 가 읽는 그 칸이다.
             비어 있으면 수업 전에 사람이 손써야 한다는 뜻이라, 강사·매니저가 먼저 봐야 한다. */
          level: s.se_level || null,
          textbook: s.se_textbook || null,
          textbook_assigned: !!String(s.se_textbook || '').trim(),
          teacher_id: sub ? sub.id : (s.teacher_id || null),
          teacher_name: sub ? sub.name : origTeacherName,
          substituted: !!sub,
          substituted_from: sub ? origTeacherName : null,
          start_time: s.start_time || null,
          duration_min: dur,
          start_ts, end_ts, status,
          join_open: !_postponed && !_holOff && !_cancelled && nowMs >= open_at_ts && nowMs <= close_at_ts,
          postponed: _postponed,
          /* ✕ 취소된 회차 — 화면은 이 칸을 «휴강·연기보다 먼저» 본다(입장·참관·연기 버튼 대신 «취소됨»).
             「취소·연기」 칸의 누가·언제는 아래 «목록 완성 뒤» change 로 붙인다. */
          cancelled: _cancelled,
          change: null,
          holiday: _holOff && !_cancelled,
          holiday_name: (_holOff && !_cancelled) ? (_ctHol.name || null) : null,
          /* 🧪 (2026-08-06 마이마이 요청) "레벨테스트와 일반수업을 한 화면에서 보고 싶다".
             레벨테스트도 예약을 잡는 순간 class_schedules 의 일회성(one_off) 행이 되므로
             목록은 이미 하나다. 다만 **구분이 안 돼서** 따로 있는 것처럼 보였다.
             → 별도 목록을 만들지 않고 종류만 실어 보낸다(화면에서 배지로 구분). */
          schedule_kind: s.schedule_kind || null,
          /* 🗓 (2026-09-22) «이 줄을 여기서 옮기거나 연기할 수 있는가» — 판정은 서버가 한다.
             매니저 화면의 「연기·변경」 버튼이 이 칸을 보고 조작을 줍니다.
             ⛔ 화면이 schedule_kind 로 추측하게 두면 안 된다 — 실측(2026-09-22) 그 칸은
                'one_off'(2,196) · **'dated'(72)** · 'recurring'(4) 으로 **세 가지**라
                `=== 'one_off'` 로 가르면 72건을 잘못 막는다.
             ✅ 근거는 **scheduled_date 가 있는가** 하나다 — /schedule-requests/decide 의
                `isDated` 와 **같은 칸**이다. 둘이 어긋나면 화면은 «된다» 고 하고
                서버는 'recorded'(자동 이동 불가)를 돌려준다.
             🔴 반복(매주) 수업에 «취소» 를 허용하면 **그 주만이 아니라 모든 주가 죽는다**
                (class_schedules 한 행이 매주를 뜻하므로). 그래서 화면이 아예 안 준다. */
          // ✕ 취소된 회차는 옮길 수 없다 — 서버 이동도 'schedule_not_movable' 로 거절한다(«눌러도 안 되는 버튼» 금지).
          can_move: !!s.scheduled_date && !_cancelled,
          /* 📅 (2026-10-08 매니저 「매니저는 그날만 연기할 수 있나? 아무 때나 연기하게 해줘」)
             매주 반복 줄도 «날짜별로 나누기»(src/schedule-split.ts) 를 먼저 하면 그 날 하나만 옮길 수 있다.
             연기·변경 창(js/class-move-modal.js)이 이 칸이 참일 때만 «나눈 뒤 처리» 를 준다.
             ⛔ 나누기는 본사 전용(enrollAdminHqOnly)이라 지사·대리점에는 안 준다(«눌러도 403 나는 버튼» 금지).
             ⛔ 카페24 미러 행은 나누지 않는다(미러가 다시 만든다 — planScheduleSplit 과 같은 판정). */
          can_split: !s.scheduled_date && !String(s.source || '').startsWith('c24-mirror')
            && (_ctScope.type === 'hq' || _ctScope.type === 'none'),
          is_level_test: /leveltest|level_test|level-test/i.test(String(s.source || '') + ' ' + String(s.notes || '')),
        });
      }
      /* ── ② 카페24 예약 수업 (attendance 의 `c24-{class_id}` 씨앗) ──────────────────
         실제 운영 수업이 여기 있다(하루 143건 안팎). 학생 이름은 명부에서 가져오면서
         **같은 조인으로 스코프를 자른다** — 명부에 없는 학생은 «범위를 확인할 수 없음» 이라
         지사·대리점에게는 보이지 않는다(`classes-now` 와 같은 규칙).
         ⛔ `attendance.teacher_name` 은 읽지 않는다 — 옛 동기화가 남의 이름을 넣어 둔 칸이다.
            강사 이름은 `loadCafe24TeacherMap` 을 거쳐 «유일하게 맞을 때만» 붙이고, 아니면 비운다. */
      let c24Rows: any[] = [];
      try {
        const rs: any = await env.DB.prepare(
          `SELECT a.room_id, a.user_id, a.username, a.status, a.joined_at, a.left_at, a.teacher_uid,
                  se.korean_name AS stu_ko, se.english_name AS stu_en,
                  se.level AS se_level, se.textbook AS se_textbook, se.shop_name AS se_shop
             FROM attendance a
             LEFT JOIN students_erp se ON se.user_id = a.user_id
            WHERE a.room_id LIKE 'c24-%' AND a.date = ?
              ${_ctStu.cond ? `AND (${_ctStu.cond})` : ''}
            ORDER BY a.joined_at ASC LIMIT 400`
        ).bind(dateStr, ..._ctStu.binds).all();
        c24Rows = (rs.results || []) as any[];
      } catch (e: any) { console.warn('[classes/today] cafe24 rows:', e?.message); }
      /* 🪞 (2026-10-20) 미러 줄이 있는 카페24 수업은 «복사본» 이라 뺀다 — 정본 dropMirroredCafe24(classes-now.ts).
         날짜·상태를 안 가리고 그 수업번호의 미러 줄을 찾는다(옮겼거나 취소한 줄도 «망고아이가 정본»).
         ⚠️ 청크 하나라도 실패하면 selectInChunks 가 던져 집합이 빈 채로 남는다 = 아무것도 안 뺀다
            (예전처럼 두 줄 — 수업이 사라지는 쪽보다 낫다). */
      let c24MirroredHidden = 0;
      if (c24Rows.length) {
        const _c24Ids = Array.from(new Set(c24Rows.map(r => String(r.room_id || '').replace(/^c24-/, '')).filter(Boolean)));
        const _mirrored = new Set<string>();
        try {
          const mr = await selectInChunks<any>(env.DB, _c24Ids.map(id => 'c24:' + id),
            (ph) => `SELECT notes FROM class_schedules WHERE source LIKE 'c24-mirror%' AND notes IN (${ph})`);
          for (const m of mr) { const id = String(m.notes || '').replace(/^c24:/, ''); if (id) _mirrored.add(id); }
        } catch (e: any) { console.warn('[classes/today] mirrored ids:', e?.message); }
        const _drop = dropMirroredCafe24(c24Rows, _mirrored);
        c24Rows = _drop.kept;
        c24MirroredHidden = _drop.hidden;
      }

      // Separately registered Mangoi schedules (e.g. #6827) have no c24 mirror note.
      // Hide only the exact student's LMS slot in this response; keep both stored records.
      const c24SlotDuplicates = dropCafe24SlotDuplicates(c24Rows, sessions);
      c24Rows = c24SlotDuplicates.kept;

      if (c24Rows.length) {
        const tmap = await loadCafe24TeacherMap(env as any, c24Rows.map(r => r.teacher_uid));
        // 🎌 카페24 줄도 휴강 판정 — 강사 열쇠는 관제탑과 같은 정본(cafe24HolidayTeacher).
        const _c24ExNames = _ctHol.closed ? await loadHolidayExemptNames(env, [_ctHol]) : new Set<string>();
        for (const r of c24Rows) {
          const start_ts = Number(r.joined_at) || 0;
          const end_ts = Number(r.left_at) || (start_ts + 30 * 60000);
          let status: string;
          if (nowMs < start_ts) status = 'early';
          else if (nowMs <= end_ts + LATE_AFTER) status = 'live';
          else status = 'ended';
          const _c24Key = _ctHol.closed ? cafe24HolidayTeacher(tmap.get(String(r.teacher_uid || '')), _c24ExNames, normTeacherName) : '';
          const _c24Hol = _ctHol.closed && _c24Key !== EXEMPT_BY_NAME && isHolidayClosedFor(_ctHol, _c24Key);
          if (_c24Hol) status = 'holiday';
          sessions.push({
            schedule_id: null,
            // 🗓 카페24 줄은 class_schedules 에 행이 아예 없다 — 여기서 옮길 방법이 없다(카페24가 정본).
            can_move: false,
            source: 'cafe24',          // 🏷 카페24 수업 = 우리 방이 없다 → 입장·참관 버튼을 주지 않는다
            observable: false,
            room_id: r.room_id,        // 표시용 식별자일 뿐 — 이 번호로 망고아이 방을 열 수 없다
            student_uid: r.user_id || null,
            student_name: r.stu_ko || r.username || r.stu_en || null,
            academy: r.se_shop || null,
            contact_phone: null,   // ☎ 아래에서 정본으로 채운다(망고아이 줄과 같은 자리)
            /* 🕓 (2026-10-27) 끝 시각을 «안다» 는 표시 — 위 end_ts 는 left_at 이 없으면 «시작+30분» 으로 지어낸 값이다.
               화면(adm-today-classes.js kstRange)은 false 면 시작만 그린다(지어낸 끝을 사실처럼 그리지 않게). */
            end_known: !!Number(r.left_at),
            level: r.se_level || null,
            textbook: r.se_textbook || null,
            textbook_assigned: !!String(r.se_textbook || '').trim(),
            teacher_id: null,
            teacher_name: (tmap.get(String(r.teacher_uid || '')) || {}).name || null,
            start_time: new Date(start_ts + KST).toISOString().slice(11, 16),
            duration_min: Math.max(1, Math.round((end_ts - start_ts) / 60000)),
            start_ts, end_ts, status,
            join_open: false,
            holiday: _c24Hol,
            holiday_name: _c24Hol ? (_ctHol.name || null) : null,
            cafe24_status: r.status || null,
            schedule_kind: null,
            is_level_test: false,
          });
        }
      }

      // Join/observe and room-linked enrichment must use the student/teacher room for this date.
      await applyRoomOverrides(env.DB, sessions.filter(s => s.source === 'mangoi'), ymd);

      /* 🧾 (2026-11-03) 「취소·연기」 칸 — 정본 class-change-state.ts(취소 > 연기 > 다른 날짜·시각에서 옮겨 옴).
         누가·왜는 연락처·평가와 같은 청중(_ctSeeContact = 본사·내부직원)에게만 싣는다 — 지사·대리점에 본사 직원 이름·
         내부 사유가 나가지 않게. 이력 조회가 실패해도 «취소·연기» 자체는 행 상태로 말한다(누가·언제만 비고,
         change_history='failed' 로 «못 물어봤다» 를 알린다). ⛔ 던지지 않는다 — 이 칸 때문에 목록이 죽으면 안 된다. */
      const _ctMg = sessions.filter(x => x.source === 'mangoi' && x.schedule_id != null);
      const _ctAu = await loadClassChangeAudits(env.DB, _ctMg.map(x => x.schedule_id));
      for (const x of _ctMg) {
        x.change = judgeClassChange(_ctRowById.get(String(x.schedule_id)), _ctAu.bySchedule.get(String(x.schedule_id)), { showActor: _ctSeeContact });
      }

      const postponed = _ctMg.filter(x => x.change?.kind === 'postponed');
      if (postponed.length) {
        try {
          const [rules, requests] = await Promise.all([
            loadPostponePayRules(env.DB),
            env.DB.prepare(`SELECT schedule_id, fee_type FROM schedule_change_requests
              WHERE orig_date = ? AND status = 'approved' AND request_type != 'change'
              ORDER BY created_at DESC, id DESC`).bind(dateStr).all<any>(),
          ]);
          const fees = new Map<string, string>();
          for (const r of requests.results || []) {
            const id = String(r.schedule_id);
            if (!fees.has(id)) fees.set(id, r.fee_type);
          }
          for (const row of postponed) {
            row.postpone_pay_pct = postponePayPercent(rules, fees.get(String(row.schedule_id)));
          }
        } catch (e: any) { console.warn('[classes/today] postpone pay:', e?.message); }
      }

      /* ⏸ (2026-11-04 매니저 Mai «Can we add another column state it is cancelled or postponed») 날짜를 정해 연기·변경한 수업은
         «같은 행» 이 새 날짜로 옮겨 가서(PR #1889 규칙 — 되돌리지 말 것) 원래 날짜 목록에서 통째로 사라졌다.
         원래 날짜에 «⏸ 연기됨 → 새 날짜» 줄을 «읽기 전용» 으로 남긴다 — 판정 정본 class-change-state.ts judgeMovedAway.
         🔒 행은 위 목록과 «같은 스코프 조건» 으로만 읽는다(지사·대리점에 남의 학생이 안 나가게 — 실패하면 줄을 안 만든다).
         ⛔ 입장·참관·옮기기 없음(join_open·observable·can_move·can_split=false, room_id=null) — 그 날 그 방에는 수업이 없다.
         ⛔ enrichClassesToday(출결·강사 입장)를 안 태운다 — 원래 방의 «입장 기록 없음» 을 «결석» 으로 그리면 거짓이다.
         ⛔ 던지지 않는다 — 이 줄 때문에 목록이 죽으면 안 된다(실패하면 change_history='failed'). */
      let _mvAwayOk = true;
      try {
        const _mvEv = await loadMovedAwayEvents(env.DB, dateStr, dateStr);
        _mvAwayOk = _mvEv.complete;
        const _onToday = new Set(sessions.filter(x => x.source === 'mangoi' && x.schedule_id != null).map(x => String(x.schedule_id)));
        const _mvIds = Array.from(new Set(Array.from(_mvEv.byKey.values()).map(e => Number(e.schedule_id))))
          .filter(n => Number.isSafeInteger(n) && n > 0 && !_onToday.has(String(n)));
        if (_mvIds.length) {
          const _mvRows = await selectInChunks<any>(env.DB, _mvIds,
            (ph) => `SELECT cs.*, t.name AS t_name, se.level AS se_level, se.textbook AS se_textbook, se.shop_name AS se_shop, se.korean_name AS se_name
                       FROM class_schedules cs
                       LEFT JOIN teachers t ON CAST(t.id AS TEXT) = CAST(cs.teacher_id AS TEXT)
                       LEFT JOIN students_erp se ON se.user_id = cs.user_id
                      WHERE cs.id IN (${ph})
                        AND LOWER(COALESCE(cs.user_id,'')) NOT IN ('lms','type_seed')
                        ${_ctStu.cond ? `AND (${_ctStu.cond})` : ''}`,
            { tail: _ctStu.binds });
          /* 🔁 매주 반복 수업을 «그 주 하루만» 옮긴 경우(2026-11-04) — 옮겨 간 곳은 그 하루짜리 줄이다(판정 정본 judgeMovedAway).
             같은 학생·같은 시각에 이 날 줄(연기 기록 줄·새로 잡은 수업)이 이미 있으면 반복 행 줄은 안 만든다(한 자리에 두 줄 금지).
             «옮겨 감» 줄끼리도 한 자리에 하나 — 날짜 지정 행을 먼저 넣고(movedAwayOrder) 넣을 때마다 그 자리를 적는다(movedAwayBlocked). */
          const _rwIds = _mvRows.filter((s: any) => !s.scheduled_date).map((s: any) => s.id);
          const _rw = _rwIds.length ? await loadRecurWeekChildren(env.DB, _rwIds) : null;
          if (_rw && !_rw.complete) _mvAwayOk = false;
          const _taken = new Set(sessions.filter(x => x.source === 'mangoi').map(x => slotKeyOf(dateStr, x.start_time, x.student_uid)));
          /* ↩ (2026-11-08) 원래 자리에 «같은 수업» 이 이미 열려 있나(같은 학생·시각·강사 — 카페24 미러가 다시 만든 경우 등) —
             되돌리기 API(undoHeldMove)와 «같은» 근거·판정. 못 읽으면 null → 그 버튼을 안 준다(예전 동작). 날짜 지정 행만. */
          const _heldSlots = await loadLiveDatedSlots(env.DB, dateStr, _mvRows.filter((s: any) => !!s.scheduled_date).map((s: any) => s.user_id));
          const _ghostAt = new Set<string>();
          for (const s of [..._mvRows].sort((a: any, b: any) => movedAwayOrder(a) - movedAwayOrder(b))) {
            const _isRecur = !s.scheduled_date;
            const _child = _isRecur ? recurWeekChildFor(_rw ? _rw.byParent.get(String(s.id)) : null, dateStr) : null;
            const ch = judgeMovedAway(s, _mvEv.byKey.get(movedAwayKey(s.id, dateStr)), { showActor: _ctSeeContact }, _child);
            if (!ch) continue;
            /* ↩ (2026-11-04) «원래대로» 버튼을 줄지 — 되돌리기 API 와 «같은» 판정 정본(judgeMovedAwayUndo). 화면은 ok 면 버튼,
               아니면 reason 으로 «왜 못 하는지» 를 글자로(누르면 거절되는 버튼을 두지 않는다). 권한(본사)은 화면이 한 번 더 가린다. */
            const _undo = judgeMovedAwayUndo(s, ch, _child, nowMs, _isRecur ? null : heldIdFor(_heldSlots, dateStr, ch.from_time, s.user_id, s.teacher_id, s.id));
            const _slot = slotKeyOf(dateStr, ch.from_time || s.start_time, s.user_id);
            if (movedAwayBlocked(_slot, _isRecur, _taken, _ghostAt)) continue;
            if (_slot) _ghostAt.add(_slot);
            const [mh, mm] = String(ch.from_time || s.start_time || '00:00').split(':').map((x: string) => Number(x));
            const start_ts = Date.UTC(kY, kMo, kD, mh || 0, mm || 0, 0) - KST;
            const dur = Number(s.duration_min || s.duration_minutes) || 30;
            sessions.push({
              schedule_id: s.id,
              source: 'mangoi',
              moved_away: true,            // ⏸ 이 날에서 다른 날로 옮겨 간 회차 — 입장·옮기기 없음, 「↩ 원래대로」(undo)만
              undo: _undo ? { ok: _undo.ok, reason: _undo.reason, historical_available: _undo.historical_available === true, from_date: _undo.from_date, from_time: _undo.from_time,
                /* ↩ (2026-11-06) 새 자리가 그 뒤 취소됐고 아직 시작 전 → 이 줄에서 «취소 수업 복원»(그 대상 행에 action:'restore') */
                restore_cancelled_available: _undo.restore_cancelled_available === true, target_id: _undo.target_id, target_date: _undo.target_date ?? null, target_time: _undo.target_time ?? null,
                /* ↩ (2026-11-08) 원래 시각에 같은 수업이 이미 열림 → 이 줄에서 «↩ 연기 되돌리기»(action:'undo_move', held:true) */
                held_available: _undo.held_available === true, held_id: _undo.held_id ?? null, held_copy_status: _undo.held_copy_status ?? null } : null,
              observable: false,
              room_id: null,
              student_uid: s.user_id || null,
              student_name: s.student_name || s.se_name || null,
              academy: s.se_shop || null,
              contact_phone: null,
              level: s.se_level || null,
              textbook: s.se_textbook || null,
              textbook_assigned: !!String(s.se_textbook || '').trim(),
              teacher_id: s.teacher_id || null,
              teacher_name: s.t_name || s.teacher_name || null,
              substituted: false, substituted_from: null,
              start_time: ch.from_time || s.start_time || null,
              duration_min: dur,
              start_ts, end_ts: start_ts + dur * 60000,
              status: 'moved_away',
              join_open: false, postponed: false, cancelled: false,
              change: ch,
              holiday: false, holiday_name: null,
              schedule_kind: s.schedule_kind || null,
              can_move: false, can_split: false,
              is_level_test: /leveltest|level_test|level-test/i.test(String(s.source || '') + ' ' + String(s.notes || '')),
              // enrichClassesToday 를 안 태우므로 그 칸들을 «모름» 으로 채워 둔다(화면이 «—» 를 그린다)
              class_date: dateStr, teacher_entry: null, attendance: null, pay_type: null,
              sched_label_ko: null, sched_label_en: null, last_eval: null, today_eval: null,
              eval_hidden: !_ctSeeContact, week_days: null, week_dates: null,
            });
          }
        }
      } catch (e: any) { _mvAwayOk = false; console.warn('[classes/today] moved-away rows:', e?.message); }

      /* 🙈 (2026-11-05 매니저 «mangoai_lee 를 연기하려는데 Move 버튼이 없다») 카페24 줄 중 «명부에서 숨긴(삭제) 계정» 에
         표시를 단다 — 정본 src/cafe24-hidden-student.ts. 숨긴 계정은 미러가 일부러 안 만들어 망고아이에 행이 없다(옮길 수 없음).
         ⛔ 줄은 빼지 않는다(숨긴 계정에도 진짜 수업이 남아 있다 — 실측 정우영2). 같은 시각·같은 강사의 망고아이 수업을 알려 줄 뿐.
         ⛔ 던지지 않는다 — 못 읽으면 표시 없이 예전 그대로. */
      let c24HiddenStudents = 0;
      try {
        const _hidUids = Array.from(new Set(sessions.filter(x => x.source === 'cafe24' && x.student_uid).map(x => String(x.student_uid))));
        if (_hidUids.length) {
          // 정본 loadHiddenStudents(student-override.ts — 미러의 student_hidden 과 같은 판정, fail-open)
          c24HiddenStudents = markHiddenCafe24(sessions, await loadHiddenStudents(env as any, _hidUids), normTeacherName);
        }
      } catch (e: any) { console.warn('[classes/today] hidden students:', e?.message); }

      /* ☎ 연락처 — 본사·내부직원(_ctSeeContact)일 때만, 이미 스코프로 잘린 이 목록(두 갈래 모두)에만 붙인다.
         정본이 «다 물어봤나»(complete)를 함께 주므로, 조회가 실패하면 화면이 «번호가 없다» 가 아니라
         «확인하지 못했다» 고 말한다(contact_source='failed'). ⛔ 던지지 않는다 — 연락처 때문에 목록이 죽으면 안 된다. */
      let _ctContactsOk = true;
      if (_ctSeeContact && sessions.length) {
        try {
          const _cp = await loadContactPhones(env, sessions.map(x => x.student_uid));
          _ctContactsOk = _cp.complete;
          // 정본은 아이디를 trim 해서 묻고 그 키로 돌려준다 — 찾을 때도 trim(카페24 행에 뒤 공백이 붙은 아이디가 실재한다)
          for (const x of sessions) x.contact_phone = _cp.phones.get(String(x.student_uid || '').trim()) || null;
        } catch (e: any) { _ctContactsOk = false; console.warn('[classes/today] contacts:', e?.message); }
      }

      /* 📋 (2026-09-23 매니저 요청) 날짜·강사 입장·결제유형·일정·지난/오늘 평가·출결 — 정본 class-today-extras.ts.
         절대 던지지 않는다(실패하면 그 칸만 null → 화면 «—»). */
      /* 🔒 (2026-09-23 사장님 지시) 평가 내용은 본사·내부직원에게만 — 지사·대리점(manager.html)에는 안 싣는다.
         판정은 연락처와 같은 _ctSeeContact(hq·none). 그 밖은 전부 숨김(모르는 스코프도 숨기는 쪽). */
      try { await enrichClassesToday(env as any, sessions.filter(x => !x.moved_away), dateStr, nowMs, { evals: _ctSeeContact, dowMatches: admDowMatches }); } catch (e: any) { console.warn('[classes/today] extras:', e?.message); }
      sessions.sort((a, b) => a.start_ts - b.start_ts);
      const c24Count = sessions.filter(x => x.source === 'cafe24').length;
      /* ☎️ 화면이 «왜 번호가 대부분 비어 있는지» 를 사람에게 말할 수 있도록 근거를 함께 준다.
         ⛔ 화면이 스스로 판정하게 두지 말 것 — 화면은 자기 역할도, 그 표의 성격도 모른다.
           'lookup'     = 「번호 원천(받아 둔 번호·명부·이탈위험 명단)에 다 물어봤다 — 없으면 정말 없다」(2026-10-27, 옛 'retention')
           'failed'     = 「조회가 실패해 모른다」 — «없다» 와 같은 글자로 말하지 않게
           'restricted' = 「이 계정에는 연락처를 주지 않는다」(지사·대리점)  */
      const contactSource = !_ctSeeContact ? 'restricted' : (_ctContactsOk ? 'lookup' : 'failed');
      const res = json({
        ok: true,
        contact_source: contactSource,
        // 🧾 「취소·연기」 칸의 누가·언제 근거 — 'ok' | 'failed'(이력을 못 읽어 «취소·연기» 만 말한다)
        change_history: (_ctAu.complete && _mvAwayOk) ? 'ok' : 'failed',
        contact_missing: sessions.filter(x => !x.contact_phone && !x.moved_away).length,   // ⏸ 다른 날로 옮긴 줄은 이 날 수업이 아니다
        // 🔁 `today` 는 옛 화면이 읽던 이름이라 그대로 둔다(값은 «조회한 날짜»). `date` 가 새 이름.
        today: dateStr, date: dateStr, is_today: dateStr === todayStr,
        now: nowMs, count: sessions.length, sessions,
        counts: {
          // ⏸ «다른 날로 옮겨 간» 줄(moved_away)은 이 날 열리는 수업이 아니라 망고아이 수업 수에서 뺀다
          mangoi: sessions.length - c24Count - sessions.filter(x => x.moved_away).length,
          cafe24: c24Count,
          // 🪞 미러 줄이 있어 뺀 카페24 «복사본» 수(위 dropMirroredCafe24) — 숫자가 줄어든 이유를 사람이 볼 수 있게
          cafe24_mirrored_hidden: c24MirroredHidden,
          cafe24_slot_duplicates_hidden: c24SlotDuplicates.hidden,
          // 🙈 «명부에서 숨긴 계정» 이라고 표시한 카페24 줄 수(빼지 않고 표시만 — 위 markHiddenCafe24)
          cafe24_hidden_student: c24HiddenStudents,
          joinable: sessions.filter(x => x.join_open).length,
          holiday: sessions.filter(x => x.holiday).length,
          // ✕⏸📅 (2026-11-03) 「취소·연기」 칸이 말하는 줄 수 — 화면 머리 줄이 «오늘 취소 N건» 을 말한다.
          cancelled: sessions.filter(x => x.cancelled).length,
          postponed: sessions.filter(x => x.postponed).length,
          moved: sessions.filter(x => x.change && x.change.kind === 'moved').length,
          // ⏸ (2026-11-04) 이 날에서 다른 날로 연기·변경해 «원래 날짜» 에 남긴 줄 수
          moved_away: sessions.filter(x => x.moved_away).length,
        },
        // 🎌 그날이 휴강일이면 이름과 쉬는 건수(화면이 머리 줄에 한 번 말한다). 평일이면 null.
        holiday: _ctHol.closed ? { name: _ctHol.name || null, closed: sessions.filter(x => x.holiday).length } : null,
        level_test_count: sessions.filter(x => x.is_level_test && !x.moved_away).length,
      });
      /* 🔒 이제 이 응답에 학생 전화번호가 실린다 — 공유 캐시에 앉으면 한 사람 것이 남에게 나간다
         (CLAUDE.md 2장 「자격증명을 응답에 실을 때」의 PII 판). 지금 CF 기본값은 /api/ 를
         캐시하지 않지만, 누가 「Cache Everything」을 걸면 그 전제가 깨진다. */
      res.headers.set('Cache-Control', 'private, no-store');
      return res;
    }


    // ── GET /api/admin/class-audit — 수업 변경 이력(연기/삭제/종료/이동) 조회 ──
    //   query: action(all|postpone|reschedule|remove|end), teacher_name, from(ms), to(ms), limit
    //   강사 로그인은 본인 수업 이력만.
    if (method === 'GET' && path === '/api/admin/class-audit') {
      const _caActor = await getAdminActor(request, env as any);
      const filter: any = {
        action: url.searchParams.get('action') || 'all',
        teacher_name: (url.searchParams.get('teacher_name') || '').trim() || undefined,
        limit: parseInt(url.searchParams.get('limit') || '300', 10) || 300,
      };
      const from = parseInt(url.searchParams.get('from') || '', 10); if (from) filter.from = from;
      const to = parseInt(url.searchParams.get('to') || '', 10); if (to) filter.to = to;
      if (_caActor.isTeacher) {
        if (!_caActor.name) return json({ ok: false, error: 'teacher_identity_missing' }, 403);
        filter.teacher_name = _caActor.name; // 강사는 본인 것만(요청 필터 무시)
      }
      const rows = await listClassAudit(env, filter);
      return json({ ok: true, rows });
    }


    // ── POST /api/admin/class-audit — 수업 '종료(end)' 등 이벤트 수동/클라이언트 기록 ──
    //   body: { action, schedule_id?, room_id?, teacher_name?, student_name?, lesson_date?, lesson_time?, reason?, detail? }
    //   행위자는 관리자 세션(getAdminActor)에서 서버가 판정한 값을 우선 사용.
    if (method === 'POST' && path === '/api/admin/class-audit') {
      const _cawActor = await getAdminActor(request, env as any);
      const body: any = await request.json().catch(() => ({}));
      const allowed = ['postpone', 'reschedule', 'remove', 'end', 'restore'];
      const action = String(body.action || '').trim();
      if (!allowed.includes(action)) return json({ ok: false, error: 'invalid_action', allowed }, 400);
      /* 🔒 (2026-11-04 함정 대조) 연기·변경·취소·복구 «이력» 은 화면에 줄을 만든다 — 원래 날짜 «⏸ 연기됨 →» 줄(class-change-state.ts
         loadMovedAwayEvents)·새 날짜 «📅 …에서 옮김» 글자. 이 경로로 강사가 아무 수업·아무 날짜로 적으면 그 줄을 지어낼 수 있다.
         서버가 직접 옮기는 경로(class-schedule-move·변경 요청 승인·AI 명령·수강 운영)는 writeClassAudit 를 «직접» 부르므로
         이 차단과 무관하다. 화면에서 이 POST 로 그 넷을 적는 곳은 0곳(2026-11-04 grep). ⛔ 'end' 는 그대로 둔다. */
      if (_cawActor.isTeacher && ['postpone', 'reschedule', 'remove', 'restore'].includes(action)) {
        return json(forbiddenTeacherBody(_cawActor, '강사는 수업 연기·변경·취소 이력을 직접 적을 수 없습니다.', 'Teachers cannot write class postpone/change/cancel history directly.'), 403);
      }
      await writeClassAudit(env, {
        action,
        schedule_id: body.schedule_id ?? null,
        room_id: body.room_id || null,
        teacher_name: body.teacher_name || (_cawActor.isTeacher ? _cawActor.name : null),
        student_name: body.student_name || null,
        lesson_date: body.lesson_date || null,
        lesson_time: body.lesson_time || null,
        actor: _cawActor.name || (body.actor ? String(body.actor).slice(0, 60) : '관리자'),
        actor_role: _cawActor.isTeacher ? 'teacher' : (_cawActor.name ? 'admin' : 'system'),
        /* 🔒 (2026-11-08) HELD_UNDO_SOURCE 는 서버 경로(undoHeldMove)만 쓴다 — 그 기록은 원래 날짜의 «옮겨 감» 줄을 지운다(이 길로 적으면 아무 줄이나 숨김). */
        source: String(body.source || 'ui').slice(0, 20) === HELD_UNDO_SOURCE ? 'ui' : String(body.source || 'ui').slice(0, 20),
        reason: body.reason ? String(body.reason).slice(0, 300) : null,
        detail: body.detail ? String(body.detail).slice(0, 500) : null,
      });
      return json({ ok: true });
    }


    // ── GET /api/admin/postponed-classes — ⏸ 연기 수업 통합 조회 (매니저 전용 화면) ──
    //   (2026-07-23 매니저 요청) "연기된 수업 목록 / 유료·무료 / 연기한 정확한 시각을 보고 싶다."
    //   데이터는 이미 두 곳에 나뉘어 있었다:
    //     ① schedule_change_requests — 학생·강사가 올린 연기/취소 요청. fee_type·minutes_before 있음.
    //     ② class_audit_log        — 관리자가 직접(화면·AI명령) 연기한 이력. 요금 정보가 없음.
    //   매니저는 둘을 따로 열어 대조해야 했다 → 여기서 하나로 합쳐 준다.
    //   ⚠️ ②는 요금이 저장돼 있지 않으므로 '수업 시작 30분 전' 규칙으로 서버가 되계산하고
    //      fee_estimated=1 로 표시한다(추정치임을 화면에서 숨기지 않기 위함).
    //   ⚠️ ①이 승인되면 ②에 source='schedule-request' 로 한 줄 더 쌓인다 → 중복이므로 제외.
    if (method === 'GET' && path === '/api/admin/postponed-classes') {
      const _pcActor = await getAdminActor(request, env as any);
      await ensureScheduleRequestTable();

      const FREE_IF_MINUTES_BEFORE_GT = 30;   // 정책: 시작 30분 전보다 일찍 = 무료
      const nowMs = Date.now();
      const days = Math.min(365, Math.max(1, parseInt(url.searchParams.get('days') || '30', 10) || 30));
      const to = parseInt(url.searchParams.get('to') || '', 10) || nowMs + 60000;
      const from = parseInt(url.searchParams.get('from') || '', 10) || (to - days * 86400000);
      const feeQ = (url.searchParams.get('fee') || 'all').trim();          // all|paid|free|unknown
      const kindQ = (url.searchParams.get('kind') || 'postpone').trim();   // postpone|cancel|change|all
      const statusQ = (url.searchParams.get('status') || 'all').trim();    // all|pending|approved|rejected|applied
      const limit = Math.min(1000, Math.max(1, parseInt(url.searchParams.get('limit') || '300', 10) || 300));
      let teacherQ = (url.searchParams.get('teacher_name') || '').trim();
      // 🔐 강사 로그인은 본인 수업만(타 강사·타 학생 노출 방지)
      if (_pcActor.isTeacher) {
        if (!_pcActor.name) return json({ ok: true, rows: [], summary: { total: 0 } });
        teacherQ = _pcActor.name;
      }

      // 원 수업 시작(KST) 기준으로 "몇 분 전에 연기했나" 계산
      const minsBefore = (d?: string | null, t?: string | null, at?: number | null): number | null => {
        if (!d || !t || !at) return null;
        const ms = Date.parse(`${String(d).slice(0, 10)}T${String(t).slice(0, 5)}:00+09:00`);
        if (isNaN(ms)) return null;
        return Math.round((ms - at) / 60000);
      };
      const feeOf = (m: number | null): string | null => (m === null ? null : (m > FREE_IF_MINUTES_BEFORE_GT ? 'free' : 'paid'));

      const out: any[] = [];

      // ① 연기·취소·변경 요청
      const reqRs: any = await env.DB.prepare(
        `SELECT * FROM schedule_change_requests WHERE created_at >= ? AND created_at < ? ORDER BY created_at DESC LIMIT 1000`
      ).bind(from, to).all().catch(() => ({ results: [] }));
      for (const r of (reqRs.results || [])) {
        const kind = r.request_type === 'cancel' ? 'cancel' : r.request_type === 'change' ? 'change' : 'postpone';
        let mb: number | null = (typeof r.minutes_before === 'number') ? r.minutes_before : null;
        if (mb === null) mb = minsBefore(r.orig_date, r.orig_time, r.created_at);
        const fee = (r.fee_type === 'paid' || r.fee_type === 'free') ? r.fee_type : (kind === 'change' ? null : feeOf(mb));
        out.push({
          key: 'req-' + r.id,
          origin: 'request',
          kind,
          postponed_at: r.created_at,                 // ⏱ 연기(요청)한 정확한 시각
          decided_at: r.decided_at || null,
          decided_by: r.decided_by || null,
          lesson_date: r.orig_date || null,
          lesson_time: r.orig_time ? String(r.orig_time).slice(0, 5) : null,
          new_date: r.new_date || null,
          new_time: r.new_time ? String(r.new_time).slice(0, 5) : null,
          teacher_name: r.teacher_name || null,
          student_name: r.student_name || null,
          requested_by: r.requester_name || null,
          requester_role: r.requester_role || null,
          fee_type: fee,
          fee_estimated: (r.fee_type === 'paid' || r.fee_type === 'free') ? 0 : (fee ? 1 : 0),
          minutes_before: mb,
          status: r.status || 'pending',
          reason: r.reason || null,
          note: r.decide_memo || null,
          schedule_id: r.schedule_id || null,
        });
      }

      // ② 관리자가 직접 연기·이동한 이력 (요청 승인분은 중복이라 제외)
      const auditRows = await listClassAudit(env, { from, to, limit: 1000 }).catch(() => [] as any[]);
      for (const a of auditRows) {
        if (a.action !== 'postpone' && a.action !== 'reschedule') continue;
        if (a.source === 'schedule-request') continue;                 // ①과 중복
        const mb = minsBefore(a.lesson_date, a.lesson_time, a.created_at);
        out.push({
          key: 'aud-' + a.id,
          origin: 'audit',
          kind: a.action === 'reschedule' ? 'change' : 'postpone',
          postponed_at: a.created_at,
          decided_at: null,
          decided_by: null,
          lesson_date: a.lesson_date || null,
          lesson_time: a.lesson_time ? String(a.lesson_time).slice(0, 5) : null,
          new_date: null,
          new_time: null,
          teacher_name: a.teacher_name || null,
          student_name: a.student_name || null,
          requested_by: a.actor || null,
          requester_role: a.actor_role || 'admin',
          fee_type: a.action === 'reschedule' ? null : feeOf(mb),
          fee_estimated: 1,                                            // 저장값이 아니라 규칙 되계산
          minutes_before: mb,
          status: 'applied',
          reason: a.reason || null,
          note: a.detail || null,
          schedule_id: a.schedule_id || null,
        });
      }

      // 필터 → 정렬 → 자르기
      let rows = out;
      if (kindQ !== 'all') rows = rows.filter(r => r.kind === kindQ);
      if (feeQ !== 'all') rows = rows.filter(r => (feeQ === 'unknown' ? !r.fee_type : r.fee_type === feeQ));
      if (statusQ !== 'all') rows = rows.filter(r => r.status === statusQ);
      if (teacherQ) {
        const tq = teacherQ.toLowerCase();
        rows = rows.filter(r => String(r.teacher_name || '').toLowerCase().includes(tq));
      }
      rows.sort((a, b) => (b.postponed_at || 0) - (a.postponed_at || 0));
      const matched = rows.length;
      rows = rows.slice(0, limit);

      const summary = {
        total: matched,
        paid: rows.filter(r => r.fee_type === 'paid').length,
        free: rows.filter(r => r.fee_type === 'free').length,
        unknown: rows.filter(r => !r.fee_type).length,
        pending: rows.filter(r => r.status === 'pending').length,
        teachers: new Set(rows.map(r => r.teacher_name).filter(Boolean)).size,
        students: new Set(rows.map(r => r.student_name).filter(Boolean)).size,
      };
      return json({
        ok: true, now: nowMs, from, to, matched, returned: rows.length,
        policy: { free_if_minutes_before_gt: FREE_IF_MINUTES_BEFORE_GT },
        summary, rows,
      });
    }
  return null;
}
