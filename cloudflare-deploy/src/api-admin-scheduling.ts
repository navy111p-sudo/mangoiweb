/** scheduling: extracted administrator domain routes. Caller authentication and route order are preserved. */
import type { MangoEnv } from './api-mango';
import { loadCafe24TeacherMap } from './admin-teacher-core';
import { json, parseJsonBody, invalidBody, today } from './api-util';
import { forbiddenTeacherBody } from './forbidden-teacher';
import { selectInChunks } from './d1-chunk';
import { teacherPresenceByRoom } from './no-show-truth';
import { DEFAULT_CLASS_MINUTES } from './class-policy';
import { enrollAdminHqOnly } from './enroll-ops';
import { moveSchedulesAtomically, scheduleMoveVersion } from './class-schedule-move';
import { undoMovedClass, undoHeldMove } from './class-undo-move';
import { findScheduleConflicts, findScheduleMoveConflicts, loadScheduleMoveFacts, activeRowsFor, sameDayAddNotice, type ScheduleSlotQuery } from './schedule-conflict';
import { sendPushToUser } from './api-notify';
import { getScope, canEditOrg } from './scope';
import { writeClassAudit } from './class-audit';
import { runScheduleSplit } from './schedule-split';
import { getAdminActor, isOrgScopedRole } from './auth-admin';
import { inboxDenied, listInbox, ackInbox } from './notice-inbox';
import { mergeDirectByIds } from './enroll-direct-merge';
import { teacherMoveDenyReason, moveFieldConflict } from './class-teacher-move';
import { ensureRoomOverrideTable, validateOverrideInput, teacherOwnsSchedule, kstYmd } from './class-room-override';
import { SITE_ORIGIN } from './site-url';
import { MIRROR_SOURCE, MIRROR_SOURCE_MANUAL } from './c24-mirror';
import { ensureStartsOnColumn, startsOnSel, normStartsOn, kstYmdOfMs, recurSkippedOn } from './class-start-date';
import { isPostponedOccurrence } from './class-postponed';
import { isCancelledOccurrence, judgeClassChange, loadClassChangeAudits, loadMovedAwayEvents, judgeMovedAway, loadRecurWeekChildren, recurWeekChildFor, slotKeyOf, movedAwayBlocked, movedAwayOrder } from './class-change-state';

export async function handleAdminSchedulingApi(request: Request, url: URL, env: MangoEnv): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;



    // ═══════════════════════════════════════════════════════════════
    // 📢 Phase POP 끝
    // ═══════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════
    // 🥭 주간스케줄(WS)·수업스케줄 CRUD·노쇼 리포트 (admin 5회차 이동)
    // ═══════════════════════════════════════════════════════════════
    // ────────────────────────────────────────────────
    // 🥭 Phase WS — GET /api/admin/schedules?week=YYYY-MM-DD
    //   주간 전체 스케줄 그리드(admin/weekly-schedule.html)용.
    //   class_schedules 를 요청 주(월~일)로 펼쳐 강사별 슬롯 배열로 반환.
    //   반환 슬롯: { teacher_id, date, hour, start_time, type, students[], duration_min, note, start_date, end_date }
    // ────────────────────────────────────────────────
    if (method === 'GET' && path === '/api/admin/schedules') {
      try {
        await env.DB.exec(
          `CREATE TABLE IF NOT EXISTS class_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, student_name TEXT, schedule_kind TEXT NOT NULL DEFAULT 'recurring', class_type TEXT NOT NULL DEFAULT 'regular', day_of_week TEXT, scheduled_date TEXT, start_time TEXT NOT NULL, duration_min INTEGER DEFAULT 20, teacher_id TEXT, status TEXT DEFAULT 'active', source TEXT, created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER, notes TEXT)`
        );
      } catch {}

      const mondayOf = (d: Date): Date => {
        const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
        const wd = (x.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
        x.setUTCDate(x.getUTCDate() - wd);
        return x;
      };
      const isoOf = (d: Date) => d.toISOString().slice(0, 10);
      const weekParam = url.searchParams.get('week');
      /* 🕘 (2026-08-21) `?week=` 없이 열면(기본 = "이번 주") 서버 UTC 시각을 그대로 썼다.
         KST 는 UTC+9 라 UTC 15:00~23:59(=KST 00:00~08:59, 하루 중 9시간)에는 "오늘"이
         이미 KST 로는 다음 날로 넘어갔는데 여기만 하루 전 요일로 주를 나눴다 — 그 창에서는
         매니저 '오늘 수업'(/api/admin/classes/today, KST 로 계산)과 이 강사 스케줄 캘린더가
         서로 다른 요일을 "오늘"로 보고 반복수업(day_of_week)을 서로 다른 칸에 꽂았다.
         2026-08-06 에 매니저 '오늘 수업' 쪽에서 겪은 것과 같은 뿌리(KST 미보정) — 그때 고친
         세 곳(학생·강사·매니저 경로)에 이 강사 스케줄만 빠져 있었다. */
      const KST_MS = 9 * 60 * 60 * 1000;
      const start = (weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam))
        ? mondayOf(new Date(weekParam + 'T00:00:00Z'))
        : mondayOf(new Date(Date.now() + KST_MS));
      const dowKey = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const weekDates: string[] = [];
      const dateToDow: Record<string, string> = {};
      for (let i = 0; i < 7; i++) {
        const d = new Date(start); d.setUTCDate(d.getUTCDate() + i);
        const s = isoOf(d); weekDates.push(s); dateToDow[s] = dowKey[i];
      }
      const weekStartISO = weekDates[0], weekEndISO = weekDates[6];

      const mapType = (ct: string): string => {
        const c = String(ct || '').toLowerCase();
        // 🎯 레벨테스트는 정규수업과 성격이 달라 캘린더에서 한눈에 구분돼야 한다.
        //    예전엔 아래 기본값에 걸려 평범한 '1:1' 로 그려졌다 — 있어도 못 알아봤다.
        if (c === 'level_test' || c === 'leveltest' || c === '레벨테스트') return 'leveltest';
        if (c === 'group' || c === '1:2' || c === 'g' || c === '그룹') return 'group';
        // 🟣 (2026-10-06 사장님) 보강수업(makeup)도 'temp' 칸으로 — 주간 스케줄의 «임시» 를 «보강» 으로 바꿨다
        //    (2026-10-07 «보충» → «보강» 으로 이름 통일). 그 화면은 'temp' 로 만든 수업을 class_type='makeup' 으로
        //    저장하는데(SLOT_TYPE_TO_CLASS_TYPE), 여기서 makeup 을 모르면 다시 읽을 때 '1on1'(정규)로 떨어졌다.
        if (c === 'temp' || c === 'substitute' || c === '대체' || c === 'makeup' || c === '보충' || c === '보강') return 'temp';
        // 🟢 (2026-10-07 사장님 «정규·보강·체험·레벨테스트로 통일») 체험수업이 기본값에 걸려 '1on1'(정규)로 그려졌다.
        if (c === 'trial' || c === '체험') return 'trial';
        if (c === 'blocked' || c === 'off' || c === '휴무') return 'blocked';
        return '1on1';
      };
      const hourOf = (t: string): number => {
        const m = String(t || '').match(/(\d{1,2})/);
        return m ? parseInt(m[1], 10) : 0;
      };
      const normDow = (s: string): string => {
        const v = String(s || '').trim().toLowerCase();
        const map: Record<string, string> = {
          'mon': 'Mon', 'monday': 'Mon', '월': 'Mon', '월요일': 'Mon',
          'tue': 'Tue', 'tuesday': 'Tue', '화': 'Tue', '화요일': 'Tue',
          'wed': 'Wed', 'wednesday': 'Wed', '수': 'Wed', '수요일': 'Wed',
          'thu': 'Thu', 'thursday': 'Thu', '목': 'Thu', '목요일': 'Thu',
          'fri': 'Fri', 'friday': 'Fri', '금': 'Fri', '금요일': 'Fri',
          'sat': 'Sat', 'saturday': 'Sat', '토': 'Sat', '토요일': 'Sat',
          'sun': 'Sun', 'sunday': 'Sun', '일': 'Sun', '일요일': 'Sun',
        };
        // 숫자('0'~'6', 0=일…6=토)도 받는다 — 주간스케줄 마법사(wizFinalize)가 숫자로
        // 저장하고, 학생·강사 화면(dowMatches)은 숫자를 이미 읽는데 이 캘린더만 못 읽어
        // «저장은 됐는데 새로고침하면 사라지는» 반쪽이 됐다(2026-08-27 발견).
        if (/^[0-6]$/.test(v)) return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][Number(v)];
        return map[v] || '';
      };

      let rows: any[] = [];
      try {
        const rs: any = await env.DB.prepare(
          `SELECT * FROM class_schedules WHERE (status IS NULL OR status='active')`
        ).all();
        rows = rs.results || [];
      } catch (e: any) {
        return json({ ok: true, week: weekStartISO, count: 0, items: [], schedules: [], _err: String(e?.message || e) });
      }

      /* 🏷 (2026-09-28) 이름 칸이 빈 수업은 명부(students_erp)에서 이름을 찾아 붙인다 — DB 는 안 고친다.
         [왜] 학생 상세 화면에서 등록한 수업이 student_name=NULL 로 저장돼(STUDENT_NAME 미정의)
              이 캘린더에 «20m» 만 있는 빈 카드로 보였다. 명부에도 이름이 없으면 아이디를 쓴다
              (관리자 전용 화면 — 빈 카드는 «누구 수업인지 모르는 칸» 으로 읽힌다).
         ⚠️ JOIN 으로 풀지 말 것 — 위 WHERE 의 status 가 students_erp 에도 있어 ambiguous 로
            조회가 통째로 죽는다(CLAUDE.md 2장). 별도 조회라 실패해도 캘린더는 그대로 뜬다. */
      const nameByUid = new Map<string, string>();
      try {
        const nr: any = await env.DB.prepare(
          `SELECT user_id, korean_name FROM students_erp
            WHERE user_id IN (SELECT user_id FROM class_schedules
                               WHERE (status IS NULL OR status='active')
                                 AND (student_name IS NULL OR TRIM(student_name)=''))`
        ).all();
        for (const x of (nr.results || [])) {
          const nm = String(x.korean_name || '').trim();
          if (x.user_id && nm) nameByUid.set(String(x.user_id), nm);
        }
      } catch { /* 이름 보충 실패가 캘린더 전체를 막지 않게 */ }

      /* 🗓️ (2026-08-24) 「코스 기간」이 시작일=종료일(그 날 하루)로 뜨는 문제.
         [왜] enroll-activate.ts 가 수강신청을 확정하면 6개월치 화·목 수업을
              **회당 한 행**(schedule_kind='dated', scheduled_date=그날짜)으로 심는다
              (INSERT ... VALUES (…'dated'…scheduled_date…)). 그래서 한 행 = 그 날 하루일 뿐,
              등록 전체 기간이 아니다. 그런데 아래 one-off 분기가 그 한 행의 scheduled_date
              를 그대로 start_date/end_date 로 써서, 모달에 "시작일=종료일=이 날" 로 보였다
              (실제 6개월 신청인데 하루짜리처럼 보이는 것이 바로 이 계산).
         [해법] 같은 신청(class_schedules.source, enroll-activate.ts 의 SRC_PREFIX+id)으로
              생성된 행들의 scheduled_date 중 최소/최대를 실제 코스 기간으로 쓴다.
              DB 를 새로 만들지 않는다 — 위에서 이미 다 읽어 온 rows 를 한 번 더 돈다.
              source 가 없거나(=진짜 하루짜리 대체수업 등) 겹치는 행이 자기 하나뿐이면
              min=max=그날 그대로라 기존 동작과 같다. */
      const sourceRange: Record<string, { min: string; max: string }> = {};
      for (const r of rows) {
        const src = String(r.source || '');
        const sd = String(r.scheduled_date || '');
        if (!src || !sd) continue;
        /* 🧾 (2026-11-03) 취소·연기 행은 «코스 기간» 을 넓히지 않는다 — rows 에는 원래 active 만 오지만,
           아래 «취소·연기» 조회를 rows 에 합치는 사람이 생겨도 기간이 틀리지 않게 한 겹 둔다. */
        if (String(r.status || 'active').trim().toLowerCase() !== 'active') continue;
        /* 🪞 (2026-08-31) 카페24 미러 행은 이 «기간 묶기» 에서 뺀다.
           위 계산은 «같은 source = 같은 수강신청» 을 전제로 하는데(enroll-activate 가
           신청마다 source 를 다르게 단다), 미러는 학생·날짜가 달라도 source 가 전부
           'c24-mirror' 로 **하나**다. 그대로 두면 9/1 수업 카드에도 「9/1~9/15」 가 붙어
           «이 학생이 6주짜리 코스를 등록했다» 로 읽힌다. 미러 행은 한 행이 하루 하나다. */
        if (src === MIRROR_SOURCE || src === MIRROR_SOURCE_MANUAL) continue;
        const cur = sourceRange[src];
        if (!cur) sourceRange[src] = { min: sd, max: sd };
        else { if (sd < cur.min) cur.min = sd; if (sd > cur.max) cur.max = sd; }
      }

      const items: any[] = [];
      for (const r of rows) {
        if (r.teacher_id == null || r.teacher_id === '') continue;
        const tnum = Number(r.teacher_id);
        const teacher_id = Number.isFinite(tnum) ? tnum : r.teacher_id;
        const _uidRaw = String(r.user_id || '').trim();
        const _isPh = ['lms', 'type_seed'].includes(_uidRaw.toLowerCase());
        const _nm = String(r.student_name || '').trim() || (_isPh ? '' : (nameByUid.get(_uidRaw) || _uidRaw));
        const students = _nm ? [{ name: _nm, uid: _uidRaw }] : [];
        /* 🏷 (2026-08-11) 「이 칸이 진짜 망고아이 수업이냐」 를 캘린더가 알 수 있게 내려준다.
           실측(2026-08-11) 활성 667행 중 진짜 수업은 9행뿐이고, 나머지는 학생이 안 붙은 자리표시다:
             · user_id='lms'       518행 (source=lms_import_w26, notes='LMS 수업중')
                 → 강사가 **옛 LMS 에서 수업 중이라 못 쓰는 시간**. 망고아이 수업이 아니다.
             · user_id='type_seed' 140행 (source=type_seed_20260623) → 6월 시연용 시드
           학생이 없으니 카드에 이름이 안 뜨고, 그래서 매니저는 이걸 «누군지 모를 1:1 수업» 으로
           읽어 왔다(2026-08-11 사장님 확인 요청의 발단).
           ⚠️ 판정식은 api-teacher.ts 의 `kind` 와 **글자 하나까지 같게** 유지할 것 —
              두 화면이 같은 행을 다르게 부르기 시작하면 어느 쪽이 맞는지 아무도 모르게 된다. */
        const _uid = String(r.user_id || '').toLowerCase();
        const origin = _uid === 'lms' ? 'lms' : (_uid === 'type_seed' ? 'sample' : 'class');
        const base = {
          id: r.id,                       // ← 드래그 이동 영구 저장(PATCH)에 필요
          move_version: scheduleMoveVersion(r),
          teacher_id,
          hour: hourOf(r.start_time),
          start_time: r.start_time,
          type: mapType(r.class_type),
          origin,                         // 'class' | 'lms' | 'sample'
          students,
          duration_min: r.duration_min || DEFAULT_CLASS_MINUTES,
          note: r.notes || '',
          /* 🚚 (2026-09-11) 드래그로 옮길 때 «어느 칸을 고쳐야 하는가».
             ⛔ 화면이 이 판정을 복제하면 안 된다 — 바로 아래 `kind === 'one_off' || r.scheduled_date`
                와 한 글자라도 어긋나는 순간 조용히 틀린 칸을 고친다.
             🔴 실제로 밟았다(2026-09-11): 화면이 `slot.recurring` 으로 갈랐는데 이 `base` 에는
                그 칸이 **아예 없어**(recurring 은 teacher_unavailability 쪽 base2 에만 실린다)
                진짜 수업이 예외 없이 false → **언제나 scheduled_date** 를 보냈다. 그러면
                반복 행에 날짜가 박혀 sessions/today 가 그 하루만 열고 «매주» 가 죽는다.
             ⚠️ 값을 바꾸면 weekly-schedule.html 의 confirmMoveDo 와 짝이 어긋난다. */
          move_field: ((String(r.schedule_kind || 'recurring') === 'one_off') || r.scheduled_date)
            ? 'scheduled_date' : 'day_of_week',
        };
        const kind = String(r.schedule_kind || 'recurring');
        if (kind === 'one_off' || r.scheduled_date) {
          const d = String(r.scheduled_date || '');
          if (d >= weekStartISO && d <= weekEndISO) {
            const range = sourceRange[String(r.source || '')];
            items.push({ ...base, date: d, start_date: range ? range.min : d, end_date: range ? range.max : d });
          }
        } else {
          const want = normDow(r.day_of_week);
          if (!want) continue;
          for (const d of weekDates) {
            if (dateToDow[d] === want) {
              /* ⏭ (2026-11-03) «그 주 하루만» 연기·변경한 반복 수업은 그 날 열리지 않는다(정본 class-start-date.ts
                 recurSkippedOn — 학생 입장·강사 화면·오늘 수업이 이미 따르는 규칙). 이 캘린더만 몰라서 연기한 날에도
                 «그대로 있는 수업» 으로 그렸다. 새 날짜 없이 연기했으면 그 자리에 postponed 자리표시 행이 있어
                 아래 off_items 가 «연기됨» 을 말한다. ⚠️ 새 날짜로 옮겼으면(recurring-one-week.ts) 원래 날짜에는
                 행이 없어 빈칸이고, 이력도 부모 반복 행 id 로만 남아 보강 칸에 «옮겨 옴» 설명이 안 붙는다(별건).
                 ⛔ starts_on(시작일 전) 판정은 일부러 안 넣었다 — 이 화면이 «시작 전 반복 수업» 을 어떻게 그릴지는 별건. */
              if (recurSkippedOn(r, d)) continue;
              items.push({ ...base, date: d, start_date: weekStartISO, end_date: weekEndISO });
            }
          }
        }
      }

      /* 🧾 (2026-11-03 사장님 「주간 시간표도 똑같이」) 취소·연기된 «날짜 회차» 를 지우지 않고 따로 내려준다.
         [왜] 위 조회가 `status IS NULL OR status='active'` 라 수업을 취소하거나 연기하면 이 캘린더에서
              통째로 사라졌다 — «오늘 수업» 과 강사 시간표에서 고친 바로 그 사고(class-change-state.ts 머리말).
         [규칙] ① 날짜가 정해진 행만(정본 isCancelledOccurrence / isPostponedOccurrence) — 매주 반복 행의
                  cancelled 는 «회차» 가 아니다(나누기·수강 종료가 원본 매주 줄을 내린다).
                ② LMS·시드 자리표시는 안 싣는다(수업이 아니다 — 정리 버튼이 cancelled 로 내린 658행).
                ③ **`items` 와 섞지 않는다** — 열려 있던 옛 화면(배포 전에 연 탭)은 off 를 몰라서, 섞으면
                  취소·연기된 수업을 «살아 있는 수업» 으로 그린다. 그 칸을 끌면 /move 가 취소 행은 409 로
                  거절하지만 **연기 행은 받아서 active 로 되살린다**(class-schedule-move.ts). 새 화면만 이 칸을 읽는다.
                ④ id·move_field 를 안 싣는다 — 이 칸으로는 아무것도 옮기거나 지울 수 없게.
                ⑤ 따로 조회한다 — 실패해도 위 캘린더는 그대로 뜨고 off_complete=false 로 «못 물어봤다» 를 알린다.
         누가·사유는 «오늘 수업» 과 같은 청중(본사·내부직원)에게만(judgeClassChange showActor).
         ⛔ 스코프만 보면 강사가 샌다 — 이 API 는 강사 차단 목록에 없고, 강사 계정의 스코프는 'none'(autoSeedOne
            기본값)이나 잘못 세팅된 'hq' 일 수 있다(index.ts 의 «항상 role 기준» 주석). 그래서 역할(isTeacher)로 한 번 더
            끈다. 역할을 못 읽으면 끈다(같은 이력 API /class-audit 도 강사에겐 본인 것만). */
      const offItems: any[] = [];
      let offComplete = true;
      let _offScope: any = null;
      try { _offScope = await getScope(env as any, request); } catch { _offScope = null; }
      let _offIsTeacher = true;
      try { const _offActor = await getAdminActor(request, env as any); _offIsTeacher = !_offActor || !_offActor.ok || !!_offActor.isTeacher; } catch { _offIsTeacher = true; }
      const _offShowActor = !_offIsTeacher && !!_offScope && (_offScope.type === 'hq' || _offScope.type === 'none');
      try {
        const or: any = await env.DB.prepare(
          `SELECT * FROM class_schedules
            WHERE status IN ('cancelled','postponed')
              AND substr(COALESCE(scheduled_date,''),1,10) BETWEEN ? AND ?`
        ).bind(weekStartISO, weekEndISO).all();
        const offRows: any[] = ((or && or.results) || []).filter((r: any) => {
          if (r.teacher_id == null || r.teacher_id === '') return false;
          if (['lms', 'type_seed'].includes(String(r.user_id || '').trim().toLowerCase())) return false;
          return isCancelledOccurrence(r) || isPostponedOccurrence(r);
        });
        /* 이력(누가·언제·사유) — 실패해도 칸은 상태만 말한다(정본 loadClassChangeAudits 는 안 던진다). */
        const au = await loadClassChangeAudits(env.DB, offRows.map((r: any) => r.id));
        if (!au.complete) offComplete = false;
        for (const r of offRows) {
          const tnum = Number(r.teacher_id);
          const uid = String(r.user_id || '').trim();
          const nm = String(r.student_name || '').trim() || nameByUid.get(uid) || uid;
          const change = judgeClassChange(r, au.bySchedule.get(String(r.id)), { showActor: _offShowActor });
          if (!change) continue;
          offItems.push({
            off: change.kind,                          // 'cancelled' | 'postponed'
            teacher_id: Number.isFinite(tnum) ? tnum : r.teacher_id,
            date: String(r.scheduled_date || '').slice(0, 10),
            hour: hourOf(r.start_time),
            start_time: r.start_time,
            type: mapType(r.class_type),
            students: nm ? [{ name: nm, uid }] : [],
            duration_min: r.duration_min || DEFAULT_CLASS_MINUTES,
            note: r.notes || '',
            change,
          });
        }
      } catch { offComplete = false; /* 취소·연기 조회 실패가 캘린더 전체를 막지 않게 */ }

      /* ⏸ (2026-11-04 매니저 Mai «Can we add another column state it is cancelled or postponed» — 주간 시간표 판)
         날짜를 정해 연기·변경한 회차는 «같은 행» 이 새 날짜로 옮겨 가(PR #1889 — 되돌리지 말 것) 원래 날짜 칸이 그냥 비었다.
         원래 날짜 칸에 «⏸ 연기됨 → 새 날짜» 를 «보기 전용» 으로 남긴다 — 판정 정본 class-change-state.ts judgeMovedAway
         («오늘 수업»·강사 시간표와 같은 함수). 매주 반복 수업을 «그 주 하루만» 옮긴 경우도 같은 판정이 맡는다.
         off:'postponed' 로 싣는다 — 두 화면(admin/weekly-schedule.html · js/adm-q6.js ph54OffCard)이 이미 change.label_* 를
         그대로 그리므로 화면은 안 고친다. ④ 그대로 id·move_field 없음(이 칸으로는 아무것도 못 옮긴다).
         ⚠️ 칸은 «지금 행의 담당 강사» 줄에 놓인다(옮기며 강사를 바꿨으면 새 강사 줄 — 기록에 옛 강사 번호가 없다).
         스코프·누가·사유는 위 취소·연기 칸과 같다(이 API 는 학생 스코프로 자르지 않는다 — 기존 동작 그대로).
         ⛔ 던지지 않는다 — 실패하면 off_complete=false. */
      try {
        const _mvW = await loadMovedAwayEvents(env.DB, weekStartISO, weekEndISO);
        if (!_mvW.complete) offComplete = false;
        const _mvWIds = Array.from(new Set(Array.from(_mvW.byKey.values()).map(e => Number(e.schedule_id))))
          .filter(n => Number.isSafeInteger(n) && n > 0);
        if (_mvWIds.length) {
          const _mvWRows = await selectInChunks<any>(env.DB, _mvWIds, (ph) => `SELECT * FROM class_schedules WHERE id IN (${ph})`);
          const _mvWById = new Map<string, any>(_mvWRows.map((r: any) => [String(r.id), r]));
          const _rwW = await loadRecurWeekChildren(env.DB, _mvWRows.filter((r: any) => !r.scheduled_date).map((r: any) => r.id));
          if (!_rwW.complete) offComplete = false;
          const _takenW = new Set<string>();
          for (const x of [...items, ...offItems]) {
            if (!x || x.source === 'unavailability') continue;
            for (const st of (x.students || [])) _takenW.add(slotKeyOf(x.date, x.start_time, st && st.uid));
          }
          const _ghostW = new Set<string>();
          const _evW = Array.from(_mvW.byKey.values())
            .sort((a, b) => movedAwayOrder(_mvWById.get(String(a.schedule_id))) - movedAwayOrder(_mvWById.get(String(b.schedule_id))));
          for (const ev of _evW) {
            const r = _mvWById.get(String(ev.schedule_id));
            if (!r || r.teacher_id == null || r.teacher_id === '') continue;
            const uid = String(r.user_id || '').trim();
            if (['lms', 'type_seed'].includes(uid.toLowerCase())) continue;
            const _recur = !r.scheduled_date;
            const ch = judgeMovedAway(r, ev, { showActor: _offShowActor },
              _recur ? recurWeekChildFor(_rwW.byParent.get(String(r.id)), ev.from_date) : null);
            if (!ch) continue;
            const st = ch.from_time || r.start_time;
            const _slotW = slotKeyOf(ev.from_date, st, uid);
            if (movedAwayBlocked(_slotW, _recur, _takenW, _ghostW)) continue;   // 한 자리에 하나(«오늘 수업» 과 같은 규칙)
            if (_slotW) _ghostW.add(_slotW);
            const tnum = Number(r.teacher_id);
            const nm = String(r.student_name || '').trim() || nameByUid.get(uid) || uid;
            offItems.push({
              off: 'postponed', moved_away: true,
              teacher_id: Number.isFinite(tnum) ? tnum : r.teacher_id,
              date: ev.from_date,
              hour: hourOf(st),
              start_time: st,
              type: mapType(r.class_type),
              students: nm ? [{ name: nm, uid }] : [],
              duration_min: r.duration_min || DEFAULT_CLASS_MINUTES,
              note: r.notes || '',
              change: ch,
            });
          }
        }
      } catch { offComplete = false; /* 옮겨 간 칸 조회 실패가 캘린더 전체를 막지 않게 */ }

      /* 📅 다른 날짜·시각에서 «옮겨 온» 날짜 회차에는 그 사실을 붙인다(«오늘 수업» 의 「취소 · 연기」 칸과 같은 정본).
         화면은 hover 설명에만 쓴다 — 칸 색·옮기기·지우기는 그대로. 이력을 못 읽으면 그냥 안 붙인다. */
      try {
        const datedRows = rows.filter((r: any) => r.scheduled_date && String(r.scheduled_date).slice(0, 10) >= weekStartISO && String(r.scheduled_date).slice(0, 10) <= weekEndISO);
        if (datedRows.length) {
          const au2 = await loadClassChangeAudits(env.DB, datedRows.map((r: any) => r.id));
          const rowById = new Map<string, any>(datedRows.map((r: any) => [String(r.id), r]));
          for (const it of items) {
            if (it.id == null || it.source === 'unavailability') continue;
            const row = rowById.get(String(it.id));
            if (!row) continue;
            const ch = judgeClassChange(row, au2.bySchedule.get(String(it.id)), { showActor: _offShowActor });
            if (ch && ch.kind === 'moved') it.change = ch;
          }
        }
      } catch { /* 이동 표시는 덤 — 실패해도 캘린더는 그대로 */ }

      /* 🚫 (2026-08-08 마이마이 요청) 「강사가 언더타임이라 수업을 못 할 때 매니저가 그 시간을
         막을 수 있으면 좋겠다」 — 막는 기능(teacher_unavailability)은 이미 있었는데
         **주간 캘린더가 그걸 안 읽어서**, 막아 놓고도 캘린더에는 빈칸으로 보였다.
         그래서 매니저는 자기가 막은 시간에 또 수업을 넣었다. 여기서 같이 내려준다.

         ⚠️ class_schedules 와 **id 가 겹친다**(둘 다 1,2,3…). 프런트가 드래그 이동에서
            id 로 PATCH 를 쏘므로 그대로 두면 «휴식시간을 드래그 → 엉뚱한 수업이 이동» 한다.
            → id 는 넘기지 않고 source:'unavailability' 로 못박아 프런트가 잠그게 한다. */
      try {
        const tu: any = await env.DB.prepare(
          `SELECT id, teacher_id, teacher_name, kind, start_date, end_date, day_of_week, start_time, end_time, reason FROM teacher_unavailability`
        ).all();
        const dowIdxToKey = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        for (const b of (tu.results || [])) {
          if (b.teacher_id == null || b.teacher_id === '') continue;
          const tnum2 = Number(b.teacher_id);
          const st = String(b.start_time || '') || '00:00';
          const et = String(b.end_time || '') || '23:59';
          const mins = (t: string) => { const m = String(t).match(/(\d{1,2}):(\d{2})/); return m ? (+m[1]) * 60 + (+m[2]) : 0; };
          const dur = Math.max(10, mins(et) - mins(st));
          const base2 = {
            block_id: b.id,                 // 삭제용. id 로는 넘기지 않는다(위 주석 참고)
            source: 'unavailability',
            origin: 'block',                // 위 class 슬롯의 origin 과 같은 축(정체 표시용)
            teacher_id: Number.isFinite(tnum2) ? tnum2 : b.teacher_id,
            hour: hourOf(st), start_time: st, end_time: et,
            type: 'blocked', students: [], duration_min: dur,
            note: b.reason || '', reason: b.reason || '',
          };
          if (String(b.kind) === 'weekly') {
            const want2 = dowIdxToKey[Number(b.day_of_week)] || '';
            if (!want2) continue;
            for (const d of weekDates) if (dateToDow[d] === want2) items.push({ ...base2, date: d, recurring: true });
          } else {
            const s0 = String(b.start_date || '').slice(0, 10);
            const e0 = String(b.end_date || b.start_date || '').slice(0, 10);
            if (!s0) continue;
            for (const d of weekDates) if (d >= s0 && d <= (e0 || s0)) items.push({ ...base2, date: d, recurring: false });
          }
        }
      } catch { /* 휴식시간 조회 실패가 수업 캘린더 전체를 막지 않게 한다 */ }

      return json({ ok: true, week: weekStartISO, count: items.length, items, schedules: items,
        off_items: offItems, off_complete: offComplete });
    }


    // 🥭 Phase WS-2 — GET /api/admin/unassigned-students
    //   아직 어떤 수업(class_schedules)에도 배정되지 않은 '재학중' 학생 목록.
    //   weekly-schedule.html 좌측 '미배정 학생 대기 풀'이 호출.
    //   반환: { ok, count, students:[{uid,name,level}], items:[…동일] }
    // ────────────────────────────────────────────────
    if (method === 'GET' && path === '/api/admin/unassigned-students') {
      // class_schedules 테이블이 없으면 모든 학생이 미배정이므로, 안전하게 생성만 보장
      try {
        await env.DB.exec(
          `CREATE TABLE IF NOT EXISTS class_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, student_name TEXT, schedule_kind TEXT NOT NULL DEFAULT 'recurring', class_type TEXT NOT NULL DEFAULT 'regular', day_of_week TEXT, scheduled_date TEXT, start_time TEXT NOT NULL, duration_min INTEGER DEFAULT 20, teacher_id TEXT, status TEXT DEFAULT 'active', source TEXT, created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER, notes TEXT)`
        );
      } catch {}
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '200', 10), 500);
      try {
        // 재학생(status 정상/미지정) 중, 활성 수업이 한 건도 없는 학생만 추림.
        // user_id 매칭 + 동명(korean_name) 매칭 모두 고려해 누락/중복 방지.
        const rs: any = await env.DB.prepare(
          `SELECT s.user_id AS uid,
                  COALESCE(s.korean_name, s.english_name, s.user_id) AS name
             FROM students_erp s
            WHERE (s.status IN ('정상','활동','active') OR s.status IS NULL OR s.status = '')
              AND NOT EXISTS (
                    SELECT 1 FROM class_schedules cs
                     WHERE (cs.status IS NULL OR cs.status = 'active')
                       AND (cs.user_id = s.user_id OR cs.student_name = s.korean_name)
                  )
            ORDER BY name ASC
            LIMIT ?`
        ).bind(limit).all();
        const students = (rs.results || []).map((r: any) => ({
          uid: r.uid, name: r.name, level: ''
        }));
        return json({ ok: true, count: students.length, students, items: students });
      } catch (e: any) {
        // 테이블 미존재 등 → 빈 목록(프론트는 데모 폴백)
        return json({ ok: true, count: 0, students: [], items: [], _err: String(e?.message || e) });
      }
    }


    // 🥭 Phase WS-3 — POST /api/admin/notify-queue
    //   드래그 배정/이동 시 '학부모 알림톡'을 발송 대기 큐에 적재.
    //   실제 발송은 별도 큐 워커(SOLAPI)가 처리. 여기서는 영구 기록만.
    //   body: { uid, name, teacher_id, date, hour, kind? }
    // ────────────────────────────────────────────────
    if (method === 'POST' && path === '/api/admin/notify-queue') {
      try {
        await env.DB.exec(
          `CREATE TABLE IF NOT EXISTS parent_notify_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, student_name TEXT, teacher_id TEXT, scheduled_date TEXT, hour INTEGER, kind TEXT DEFAULT 'schedule_assigned', status TEXT DEFAULT 'queued', payload TEXT, created_at INTEGER NOT NULL, sent_at INTEGER)`
        );
      } catch {}
      let body: any = {};
      try { body = await request.json(); } catch {}
      try {
        const now = Date.now();
        const r: any = await env.DB.prepare(
          `INSERT INTO parent_notify_queue (user_id, student_name, teacher_id, scheduled_date, hour, kind, status, payload, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?)`
        ).bind(
          body.uid || null,
          body.name || null,
          (body.teacher_id != null) ? String(body.teacher_id) : null,
          body.date || null,
          (body.hour != null && body.hour !== '') ? Number(body.hour) : null,
          body.kind || 'schedule_assigned',
          JSON.stringify(body || {}),
          now
        ).run();
        return json({ ok: true, queued: true, id: r?.meta?.last_row_id ?? null });
      } catch (e: any) {
        return json({ ok: false, queued: false, error: String(e?.message || e) }, 200);
      }
    }


    // 🥭 Phase 22 — GET /api/admin/class-schedules
    //   학생별/기간별 수업 스케줄 조회 (학생 상세 페이지에서 호출)
    //   query: ?user_id=X&from_date=YYYY-MM-DD&to_date=YYYY-MM-DD&kind=recurring|one_off|all
    // ────────────────────────────────────────────────
    if (method === 'GET' && path === '/api/admin/class-schedules') {
      // 테이블 없으면 자동 생성 (첫 GET 호출 대응)
      try {
        await env.DB.exec(
          `CREATE TABLE IF NOT EXISTS class_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, student_name TEXT, schedule_kind TEXT NOT NULL DEFAULT 'recurring', class_type TEXT NOT NULL DEFAULT 'regular', day_of_week TEXT, scheduled_date TEXT, start_time TEXT NOT NULL, duration_min INTEGER DEFAULT 20, teacher_id TEXT, status TEXT DEFAULT 'active', source TEXT, created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER, notes TEXT)`
        );
      } catch {}
      const url = new URL(request.url);
      const userId = url.searchParams.get('user_id');
      const studentName = url.searchParams.get('student_name'); // ★ Phase 6f: 동명 학생 통합
      const fromDate = url.searchParams.get('from_date');
      const toDate = url.searchParams.get('to_date');
      const kind = url.searchParams.get('kind') || 'all';
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500);

      /* 🔴 (2026-09-11) WHERE 의 컬럼에는 반드시 `cs.` 를 붙인다 — `teachers` 에도
         **`status` 와 `user_id` 가 있어서**(실측 스키마) JOIN 을 붙이는 순간
         `ambiguous column name: status` 로 아래 sqlWithJoin 이 통째로 죽는다.
         그러면 catch 가 «JOIN 없는» 폴백으로 떨어뜨려 teacher_name 칸이 응답에서
         사라지고, 화면은 «번호는 있는데 이름이 없다» 로 읽어 모든 예약을
         「강사 미확인」으로 그린다(2026-09-11 실사고 — `status != 'cancelled'` 기준 1,262건 전부).
         ⛔ 서브쿼리 «안»(students_erp)의 user_id 에는 붙이지 말 것 — 붙이면 상관
            서브쿼리가 되어 매 행마다 전수 스캔한다(2026-08-27 그 사고).
         ✅ 감시: test-harness/class_schedules_join_harness.mjs 가 두 SQL 을 오려 내
            운영과 같은 스키마의 진짜 SQLite 에 실제로 돌린다. */
      const where: string[] = [`cs.status != 'cancelled'`];
      const binds: any[] = [];

      // ★ Phase 7b: user_id 또는 student_name 둘 다로 동명 학생 통합 조회 (강화)
      let mergeInfo: any = null;
      if (userId) {
        // 1) 다양한 키로 학생 이름 찾기 (user_id / login_id / id 중 어떤 것이든)
        let nameForUid: string | null = null;
        try {
          const r = await env.DB.prepare(
            // ⚠️ (2026-08-27) ('stu_' || id)·('stu_id_' || id) 는 students_erp 에 없는 컬럼이라
            //    `no such column: id` 로 죽어 이 조회가 통째로 무동작이었다(catch 가 삼킴).
            `SELECT COALESCE(korean_name, username) AS name FROM students_erp WHERE user_id = ? OR login_id = ? LIMIT 1`
          ).bind(userId, userId).first<any>();
          /* 🔴 (2026-08-27 trap-check) 이 이름은 «uid 에서 유추한» 것이라 근거가 약하다.
             그대로 effectiveName 이 되면 아래 WHERE 가
               (user_id = ? OR user_id IN (같은 이름 전원) OR student_name = ?)
             로 넓어져 **남의 수업**이 섞인다. 화면은 그 목록으로 일정변경(PATCH)·삭제(DELETE)까지
             하므로(admin/student.html) 잘못 섞이면 남의 수업을 지울 수 있다.
             ⚠️ 2026-08-27 까지는 이 조회 자체가 없는 컬럼 id 로 죽어 늘 null 이었다 — 되살리는
                김에 그 시절의 «넓은» 동작을 그대로 켜면 안 된다.
             ✅ 이름이 **한 계정으로만** 떨어질 때만 쓴다(같은 파일 POST 경로·sessions/today 와 같은 규칙).
             ℹ️ 사람이 직접 넣은 studentName 은 «의도한 통합 조회» 이므로 그대로 둔다.
             📌 실측(2026-08-27): 예약이 걸린 학생 중 동명이인 계정을 가진 사람은 0명 —
                지금 사고가 안 나는 것은 «아직» 겹치는 쌍이 없어서일 뿐이다. */
          if (r?.name) {
            const dupN = await env.DB.prepare(
              `SELECT COUNT(*) AS n FROM students_erp WHERE korean_name = ? OR username = ?`
            ).bind(r.name, r.name).first<any>();
            if (Number(dupN?.n || 0) === 1) nameForUid = r.name;
          }
        } catch {}
        // 2) studentName 파라미터가 있으면 그것도 우선 사용 (프론트가 알고 있는 이름)
        const effectiveName = studentName || nameForUid;
        // 3) 같은 이름의 모든 user_id 수집 (status 무관 - 병합된 row 도 포함하여 schedule 가져오기)
        let allUids: string[] = [userId];
        if (effectiveName) {
          try {
            const rs = await env.DB.prepare(
              // ⚠️ (2026-08-27) 없는 컬럼 id 참조로 죽어 있었다 → allUids 가 늘 [userId] 하나였다.
              `SELECT COALESCE(user_id, login_id) AS uid FROM students_erp WHERE korean_name = ? OR username = ?`
            ).bind(effectiveName, effectiveName).all<any>();
            const ids = (rs.results || []).map((r: any) => r.uid).filter(Boolean);
            allUids = [...new Set([userId, ...ids])];
          } catch {}
          mergeInfo = { name: effectiveName, user_ids: allUids, merged_count: allUids.length };
        }
        // 4) WHERE: user_id IN (...) OR student_name = name (양쪽 매칭)
        //    ⚠️ (2026-08-07) 예전엔 allUids 를 통째로 바인드했습니다. 동명이인이 늘면서
        //       한 이름이 이미 71명(운영 DB 실측)이라 D1 바인드 100개 한도에 근접했습니다.
        //       allUids 를 만든 쿼리를 **그대로 서브쿼리로** 넣으면 결과는 같으면서
        //       바인드는 2개로 고정됩니다(이름 수가 아무리 늘어도 안전).
        /* 🔴 (2026-08-27) 여기 있던 ('stu_' || id) 는 students_erp 에 없는 컬럼이다. 단독으로 돌리면
           `no such column: id` 인데, 이 문자열은 class_schedules 를 도는 쿼리 «안» 에 서브쿼리로 들어가서
           SQLite 가 그 id 를 **바깥 class_schedules.id** 로 해석했다 — 죽지 않고 «상관 서브쿼리» 가 되어
           매 행마다 students_erp 를 전수 스캔했다(운영 D1 실측: 4.3초 / 2,348만 행 읽기).
           빼면 상관관계가 끊겨 의미도 정확해지고 빨라진다. */
        const SAME_NAME_UIDS =
          `SELECT COALESCE(user_id, login_id) FROM students_erp WHERE korean_name = ? OR username = ?`;
        if (effectiveName) {
          where.push(`(cs.user_id = ? OR cs.user_id IN (${SAME_NAME_UIDS}) OR cs.student_name = ?)`);
          binds.push(userId, effectiveName, effectiveName, effectiveName);
        } else {
          where.push('cs.user_id = ?');
          binds.push(userId);
        }
      } else if (studentName) {
        // 학생 이름으로 직접 조회 (모든 동명 학생 통합)
        //  ⚠️ (2026-08-07) uid 목록을 따로 조회해 통째로 바인드하던 것을 서브쿼리로 바꿨습니다.
        //     동명이인이 100명을 넘으면 D1 바인드 한도에 걸립니다(현재 최다 71명).
        //     동명이인이 하나도 없으면 IN 이 공집합이라 student_name 조건만 남습니다 — 기존과 동일.
        where.push(
          // ⚠️ (2026-08-27) 위 SAME_NAME_UIDS 와 같은 상관 서브쿼리 문제 — id 제거로 해소.
          `(cs.user_id IN (SELECT COALESCE(user_id, login_id) FROM students_erp WHERE korean_name = ? OR username = ?) OR cs.student_name = ?)`);
        binds.push(studentName, studentName, studentName);
      }
      if (fromDate) { where.push('(cs.scheduled_date IS NULL OR cs.scheduled_date >= ?)'); binds.push(fromDate); }
      if (toDate) { where.push('(cs.scheduled_date IS NULL OR cs.scheduled_date <= ?)'); binds.push(toDate); }
      if (kind === 'recurring') where.push(`cs.schedule_kind = 'recurring'`);
      else if (kind === 'one_off') where.push(`cs.schedule_kind = 'one_off'`);

      binds.push(limit);
      // 1차: teachers JOIN 시도 (강사명 함께)
      const _soSel = startsOnSel(await ensureStartsOnColumn(env), 'cs');
      const sqlWithJoin = `SELECT cs.id, cs.user_id, cs.student_name, cs.schedule_kind, cs.class_type, cs.day_of_week, cs.scheduled_date, cs.start_time, cs.duration_min, cs.teacher_id, cs.status, cs.source, cs.notes, cs.created_at${_soSel}, t.name AS teacher_name FROM class_schedules cs LEFT JOIN teachers t ON CAST(t.id AS TEXT) = cs.teacher_id WHERE ${where.join(' AND ')} ORDER BY cs.schedule_kind ASC, cs.scheduled_date ASC, cs.start_time ASC LIMIT ?`;
      // 2차: JOIN 없이 (teachers 테이블 미존재 등에 대비)
      const sqlNoJoin = `SELECT cs.id, cs.user_id, cs.student_name, cs.schedule_kind, cs.class_type, cs.day_of_week, cs.scheduled_date, cs.start_time, cs.duration_min, cs.teacher_id, cs.status, cs.source, cs.notes, cs.created_at${_soSel} FROM class_schedules cs WHERE ${where.join(' AND ')} ORDER BY cs.schedule_kind ASC, cs.scheduled_date ASC, cs.start_time ASC LIMIT ?`;
      try {
        let rows;
        try {
          rows = await env.DB.prepare(sqlWithJoin).bind(...binds).all<any>();
        } catch (joinErr: any) {
          console.warn('[class-schedules] JOIN failed, fallback no-JOIN:', joinErr?.message);
          rows = await env.DB.prepare(sqlNoJoin).bind(...binds).all<any>();
        }
        // Phase 7g: server-side 변환 제거 - client 가 visible week/month 기준으로 1회성 위치 계산
        return json({ ok: true, count: (rows.results || []).length, items: rows.results || [], merge_info: mergeInfo });
      } catch (e: any) {
        console.warn('[class-schedules] both queries failed:', e?.message);
        return json({ ok: true, count: 0, items: [], warning: String(e?.message || e), merge_info: mergeInfo });
      }
    }



    // 🔔 (2026-11-11) GET/POST /api/admin/no-shows/inbox — 관리자·매니저 화면 «알림 종»(강사 미입장 + 확인).
    //   정본 src/notice-inbox.ts. 이 경로를 쓴 이유: /api/admin/no-shows 접두사가 라우팅·위임에 이미 있어
    //   공동 금지구역(src/index.ts)을 안 건드린다. 지사·대리점은 index.ts 스코프 관문이 이미 403.
    if (path === '/api/admin/no-shows/inbox' && (method === 'GET' || method === 'POST')) {
      const actor = await getAdminActor(request, env as any);
      const deny = inboxDenied(actor);
      if (deny === 401) return json({ ok: false, error: 'unauthorized' }, 401);
      if (deny === 403) return json(actor.isTeacher ? forbiddenTeacherBody(actor, '강사 권한으로는 볼 수 없는 정보입니다.', 'This information is not available with a teacher account.') : { ok: false, error: 'forbidden' }, 403);
      try {
        if (method === 'GET') return json(await listInbox(env.DB, Date.now()));
        const b: any = await request.json().catch(() => ({}));
        const ack = await ackInbox(env.DB, b.id, actor.name || actor.username, Date.now());
        return ack ? json({ ok: true, ack }) : json({ ok: false, error: 'not_found' }, 404);
      } catch (e: any) {
        console.warn('[notice-inbox]', e?.message || e);
        return json({ ok: false, error: 'inbox_failed' }, 500);
      }
    }

    // 🥭 Phase RM — GET /api/admin/no-shows — 노쇼(수업 미입장) 리포트
    //   class_no_show(2단계 노쇼 감지 기록) 조회 + 요약. 관리자 전용(index.ts isAdminPath 미들웨어 자동 인증).
    if (method === 'GET' && path === '/api/admin/no-shows') {
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS class_no_show (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT, schedule_id INTEGER, missing_role TEXT, missing_uid TEXT, student_name TEXT, teacher_name TEXT, lesson_title TEXT, waited_min INTEGER, notified_push INTEGER DEFAULT 0, notified_kakao INTEGER DEFAULT 0, created_at INTEGER NOT NULL)`); } catch {}
      const url = new URL(request.url);
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500);
      let rows: any = { results: [] };
      try {
        // 예약(schedule_id)→학생 연락처 조인: '즉시 연락' tel 링크용 (안 온 사람이 강사여도 학생/학부모 연락처 노출)
        rows = await env.DB.prepare(`SELECT ns.id, ns.room_id, ns.schedule_id, ns.missing_role, ns.missing_uid, ns.student_name, ns.teacher_name, ns.lesson_title, ns.waited_min, ns.notified_push, ns.notified_kakao, ns.created_at, se.phone AS student_phone, se.parent_phone AS parent_phone FROM class_no_show ns LEFT JOIN class_schedules cs ON cs.id = ns.schedule_id LEFT JOIN students_erp se ON se.user_id = cs.user_id ORDER BY ns.created_at DESC LIMIT ?`).bind(limit).all<any>();
      } catch (e: any) {
        console.warn('[no-shows] join query failed, fallback no-join:', e?.message);
        try { rows = await env.DB.prepare(`SELECT id, room_id, schedule_id, missing_role, missing_uid, student_name, teacher_name, lesson_title, waited_min, notified_push, notified_kakao, created_at FROM class_no_show ORDER BY created_at DESC LIMIT ?`).bind(limit).all<any>(); } catch {}
      }
      const items = rows.results || [];
      /* 🔎 (2026-08-19) 「강사 미입장」이 정말 미입장이었나 — 출석 기록과 대조한다.
         이 행은 **학생 브라우저가** 만든다: 5분을 기다려도 상대가 안 보이면 신고하는 구조라
         «상대가 안 왔다» 가 아니라 «내 화면에 안 보였다» 가 기록된다. 두 사람이 서로 다른
         워커의 방에 있던 동안(CLAUDE.md 2장) 강사는 매번 들어와 있었는데도 알림이 떴다 —
         실측 13건 중 11건이 오판. ⛔ 기록은 지우지 않는다(학생이 못 본 것은 사실이다).
         대신 «오판» 이라고 화면이 함께 알려 준다. 판정 정본은 src/no-show-truth.ts. */
      let presence = new Map<string, any>();
      try { presence = await teacherPresenceByRoom(env.DB, items); }
      catch (e: any) { console.warn('[no-shows] 강사 출석 대조 생략:', e?.message); }

      const now = Date.now();
      const weekAgo = now - 7 * 86400 * 1000;
      const dayAgo = now - 86400 * 1000;
      let week = 0, today = 0, teacherMiss = 0, studentMiss = 0, teacherFalse = 0, teacherUnknown = 0;
      for (const r of items) {
        if (r.created_at >= weekAgo) week++;
        if (r.created_at >= dayAgo) today++;
        if (r.missing_role === 'teacher') {
          teacherMiss++;
          const p = presence.get(String(r.room_id || ''));
          // present: true=있었음(오판) · false=흔적 없음(진짜) · null/미조회=모름
          r.teacher_present = p ? p.present : null;
          r.teacher_seen_from = p ? p.from : null;
          r.teacher_seen_to = p ? p.to : null;
          r.teacher_seen_min = p ? p.minutes : null;
          r.false_alarm = r.teacher_present === true;
          if (r.false_alarm) teacherFalse++;
          else if (r.teacher_present === null) teacherUnknown++;
        } else studentMiss++;
      }
      return json({
        ok: true, count: items.length, today, this_week: week,
        by_missing: {
          teacher: teacherMiss, student: studentMiss,
          // 「강사 미입장」 중 실제로는 강사가 접속해 있던 건 / 판정할 수 없는 건
          teacher_false_alarm: teacherFalse,
          teacher_unknown: teacherUnknown,
          teacher_real: Math.max(0, teacherMiss - teacherFalse - teacherUnknown),
        },
        no_shows: items,
      });
    }


    // 🥭 Phase RM — POST /api/admin/no-shows/contact — 노쇼 대상에게 재알림(웹푸시) + 접촉 기록
    //   body: { id } (class_no_show 행). 안 온 사람 uid 로 웹푸시 재발송(구독 없으면 스킵) + (SOLAPI_TEMPLATE_NO_SHOW 설정시 알림톡).
    if (method === 'POST' && path === '/api/admin/no-shows/contact') {
      const b: any = await request.json().catch(() => ({}));
      const id = Number(b.id);
      if (!id) return json({ ok: false, error: 'id_required' }, 400);
      let row: any = null;
      try { row = await env.DB.prepare(`SELECT * FROM class_no_show WHERE id = ? LIMIT 1`).bind(id).first<any>(); } catch {}
      if (!row) return json({ ok: false, error: 'not_found' }, 404);
      const roomUrl = `${new URL(request.url).origin}/?go=videocall`;
      const missing = row.missing_role === 'teacher' ? 'teacher' : 'student';
      const title = missing === 'teacher' ? '⏰ [재알림] 학생이 기다렸어요' : '⏰ [재알림] 수업에 입장해 주세요';
      const bodyMsg = missing === 'teacher'
        ? `${row.student_name || '학생'} 학생의 '${row.lesson_title || '영어 수업'}' 수업 미입장 건입니다. 확인 부탁드려요.`
        : `'${row.lesson_title || '영어 수업'}' 수업에 입장하지 않으셨어요. 재예약이 필요하면 안내드릴게요.`;
      let push: any = { skipped: true };
      if (row.missing_uid) push = await sendPushToUser(env, row.missing_uid, title, bodyMsg, roomUrl, `no-show-recontact-${id}`);
      // 접촉 시각 기록 (컬럼 없으면 추가)
      try { await env.DB.exec(`ALTER TABLE class_no_show ADD COLUMN contacted_at INTEGER`); } catch {}
      try { await env.DB.prepare(`UPDATE class_no_show SET contacted_at = ? WHERE id = ?`).bind(Date.now(), id).run(); } catch {}
      return json({ ok: true, push, missing_role: missing });
    }


    // 🥭 Phase 6g — POST /api/admin/students/merge-duplicates
    //   동명 학생들을 자동 통합 (가장 오래된 row 가 canonical, 나머지의 schedule 이전 후 비활성화)
    if (method === 'POST' && path === '/api/admin/students/merge-duplicates') {
      const merged: any[] = [];
      try {
        // 1) 같은 이름으로 그룹화 (korean_name 또는 username)
        const groups = await env.DB.prepare(
          `SELECT COALESCE(korean_name, username) AS name, COUNT(*) AS cnt
           FROM students_erp
           WHERE COALESCE(korean_name, username) IS NOT NULL
             AND COALESCE(korean_name, username) != ''
             AND COALESCE(status, '정상') IN ('정상','활동','active')
           GROUP BY COALESCE(korean_name, username)
           HAVING cnt > 1`
        ).all<any>();

        for (const g of (groups.results || [])) {
          const name = g.name;
          // 2) 같은 이름의 모든 학생 - id 오름차순 (가장 오래된이 canonical)
          /* 🔴 (2026-08-27) 이 쿼리는 students_erp 에 없는 컬럼 id 를 SELECT·ORDER BY 하므로
             `no such column: id` 로 죽는다 = 이 병합 API 는 지금 아무 일도 하지 않는다.
             ⛔ 일부러 안 고쳤다 — 되살리는 순간 실제 학생 계정을 «병합» 하기 시작하는데,
                개발·운영이 같은 D1 이라 되돌릴 수 없다(CLAUDE.md 1-1). 고치려면 rowid 로 바꾸고
                dry_run → 사람 확인 2단계를 함께 붙여야 한다. 사장님 판단이 필요한 별건. */
          const dups = await env.DB.prepare(
            `SELECT id, COALESCE(user_id, login_id, ('stu_' || id)) AS uid, korean_name, username, signup_date
             FROM students_erp
             WHERE (korean_name = ? OR username = ?)
               AND COALESCE(status, '정상') IN ('정상','활동','active')
             ORDER BY id ASC`
          ).bind(name, name).all<any>();
          const rows = dups.results || [];
          if (rows.length < 2) continue;

          const canonical = rows[0];
          const canonicalUid = canonical.uid;
          const dupUids = rows.slice(1).map((r: any) => r.uid);

          // 3) class_schedules 의 user_id 를 canonical 로 일괄 변경
          /* 📜 (2026-08-12) 여기에 감사 기록이 없었다 — 수업 주인을 «통째로» 옮기는 자리인데
             누가·언제·어느 계정에서 어느 계정으로 옮겼는지 어디에도 안 남았다.
             병합은 되돌리기 어려운 작업이라 기록이 특히 필요하다.
             ⚠️ 실제로 옮겨진 행이 있을 때만 남긴다 — 0건 로그가 쌓이면 진짜 사건이 묻힌다. */
          let mergeActor = 'admin';
          try { const _ma = await getAdminActor(request, env as any); if (_ma?.name) mergeActor = _ma.name; }
          catch (e) { console.warn('[student-merge] actor 조회 실패 — 감사기록에 이름 대신 admin 이 남습니다:', (e as any)?.message); }
          let scheduleMoved = 0, scheduleFailed = 0;
          for (const dupUid of dupUids) {
            try {
              const upd = await env.DB.prepare(
                `UPDATE class_schedules SET user_id = ?, updated_at = ? WHERE user_id = ?`
              ).bind(canonicalUid, Date.now(), dupUid).run();
              const movedNow = (upd?.meta?.changes as number) || 0;
              scheduleMoved += movedNow;
              if (movedNow > 0) {
                await writeClassAudit(env, {
                  action: 'owner_merge', student_name: name || null,
                  actor: mergeActor, actor_role: 'admin', source: 'student-merge',
                  reason: '중복 학생 계정 병합',
                  detail: JSON.stringify({ from: dupUid, to: canonicalUid, schedules_moved: movedNow }),
                });
              }
            } catch (e) {
              /* ⚠️ 여기가 조용히 죽으면 scheduleMoved 가 0 인 채로 «병합 성공» 이 응답에 실린다.
                 관리자는 옮겨진 줄 알고 넘어가고, 학생 수업은 옛 계정에 남는다. 반드시 남긴다. */
              scheduleFailed++;
              console.warn('[student-merge] 수업 주인 이동 실패', dupUid, '→', canonicalUid, ':', (e as any)?.message);
            }
          }
          // 4) 중복 학생 row 비활성화 (status='병합됨')
          for (const dup of rows.slice(1)) {
            try {
              await env.DB.prepare(
                `UPDATE students_erp SET status = '병합됨' WHERE id = ?`
              ).bind(dup.id).run();
            } catch {}
          }
          merged.push({
            name,
            canonical_user_id: canonicalUid,
            canonical_id: canonical.id,
            duplicates_merged: rows.length - 1,
            duplicate_user_ids: dupUids,
            schedules_moved: scheduleMoved,
            /* ⚠️ 실패 건수를 응답에 싣는다 — 0 이 아니면 그 학생 수업은 옛 계정에 남아 있다.
               화면이 «병합 완료» 만 보여주면 관리자가 그대로 넘어간다. */
            schedules_failed: scheduleFailed
          });
        }
        return json({
          ok: true,
          groups_merged: merged.length,
          total_duplicates_removed: merged.reduce((sum, m) => sum + m.duplicates_merged, 0),
          total_schedules_moved: merged.reduce((sum, m) => sum + m.schedules_moved, 0),
          details: merged
        });
      } catch (e: any) {
        return json({ ok: false, error: 'merge_failed', detail: String(e?.message || e) }, 500);
      }
    }



    /* ─── 🗓 지난 수업에서 «수업 일정» 만들기 (2026-08-19 사장님 A안) ─────────────────
       왜 —
         학생 상세보기의 「📅 일정변경」 버튼도, 주간 시간표도 class_schedules 를 본다.
         그런데 운영 D1 실측(2026-08-18) 결과 그 표에 **진짜 학생 것은 6명 15건뿐**이었다
         (673행 중 658행이 user_id='lms'·'type_seed' 자리표시자). 학생 29,398명 중 6명이다.
         반면 **실제 수업 기록은 attendance 에 182,612건** 있다. 즉 자료가 없는 게 아니라
         «앞으로의 일정» 칸으로 옮겨지지 않았을 뿐이다.
         → 지난 기록에서 «매주 화 19:00, 강사 KES» 같은 주간 패턴을 뽑아 일정으로 만든다.

       ⚠️ 왜 «미리보기» 가 따로 있나 (사장님 A안) —
          실서비스 학생 데이터다. 조건을 잘못 잡으면 그만둔 학생에게 수업이 잡히고,
          「내 일정에 왜 이게 있냐」 가 수백 건 들어온다. 그래서 **읽기(preview)와
          쓰기(apply)를 나누고, 쓰기는 사람이 화면에서 고른 것만** 받는다.
          ⛔ apply 가 스스로 패턴을 다시 뽑아 «전부» 넣게 고치지 말 것. 그러면 A안이 B안이 된다.

       ⚠️ 요일 번호 — attendance 는 strftime('%w') = 0(일)~6(토) 이고 class_schedules 도
          같은 체계다(POST /api/admin/class-schedules 의 DOW_IN 참고). 여기서는 변환이 없다.
          화면(주간 시간표)만 0=월 이라 거기서 바꾼다 — 헷갈리면 «월요일로 골랐는데 일요일» 사고가 난다.

       ⚠️ 되돌리기 — 만든 행에 source='attendance_seed' 를 찍는다.
          잘못 들어갔을 때 그 표시로만 골라낼 수 있다(사람이 판단해서 지운다). */
    if (path === '/api/admin/schedule-seed/preview' && method === 'GET') {
      const _seedSc = await getScope(env as any, request);
      if (!canEditOrg(_seedSc)) {
        return json({ ok: false, error: 'forbidden_scope', message: '본사만 사용할 수 있습니다.' }, 403);
      }
      const to = (url.searchParams.get('to') || today()).slice(0, 10);
      const fromRaw = url.searchParams.get('from');
      const from = (fromRaw && /^\d{4}-\d{2}-\d{2}$/.test(fromRaw))
        ? fromRaw
        : new Date(Date.parse(to + 'T00:00:00Z') - 56 * 86400000).toISOString().slice(0, 10);  // 기본 8주
      const minSeen = Math.max(2, Math.min(20, parseInt(url.searchParams.get('min_seen') || '3', 10) || 3));

      /* 10분 격자로 스냅해서 묶는다 — 접속 시각은 19:03·19:05 처럼 흔들려서, 분까지 그대로
         묶으면 같은 수업이 여러 패턴으로 쪼개진다(최빈값이 1이 되어 아무것도 안 걸린다). */
      const rs = await env.DB.prepare(
        `SELECT a.user_id                                             AS user_id,
                CAST(strftime('%w', a.date) AS INTEGER)               AS dow,
                printf('%02d:%02d',
                       CAST(strftime('%H', datetime(a.joined_at/1000,'unixepoch','+9 hours')) AS INTEGER),
                       (CAST(strftime('%M', datetime(a.joined_at/1000,'unixepoch','+9 hours')) AS INTEGER)/10)*10
                )                                                     AS start_time,
                COUNT(*)                                              AS seen,
                MAX(a.date)                                           AS last_date,
                AVG(COALESCE(a.total_session_ms, 0))                   AS avg_ms,
                MAX(a.teacher_uid)                                    AS teacher_uid
           FROM attendance a
          WHERE a.role = 'student' AND a.joined_at IS NOT NULL
            AND a.date BETWEEN ? AND ?
          GROUP BY a.user_id, dow, start_time
         HAVING COUNT(*) >= ?
          ORDER BY seen DESC, a.user_id`
      ).bind(from, to, minSeen).all().catch(() => ({ results: [] as any[] }));
      const rows: any[] = (rs.results || []) as any[];

      // 학생 이름·수강 상태 — 없는 학생(퇴원·명부 밖)은 화면에서 기본 해제로 보여 준다
      const uids = Array.from(new Set(rows.map(r => String(r.user_id))));
      const stuMap = new Map<string, any>();
      for (const r of await selectInChunks<any>(env.DB, uids,
        ph => `SELECT user_id, korean_name, student_name, status, shop_name FROM students_erp WHERE user_id IN (${ph})`,
        { swallowErrors: true })) stuMap.set(String(r.user_id), r);

      // 이미 같은 (학생·요일·시각) 일정이 있으면 또 만들지 않는다 — 두 번 눌러도 안 늘어난다
      const haveKey = new Set<string>();
      for (const r of await selectInChunks<any>(env.DB, uids,
        ph => `SELECT user_id, day_of_week, start_time FROM class_schedules WHERE status <> 'cancelled' AND user_id IN (${ph})`,
        { swallowErrors: true })) {
        for (const d of String(r.day_of_week || '').split(',').filter(Boolean)) {
          haveKey.add(`${r.user_id}|${d}|${String(r.start_time || '').slice(0, 5)}`);
        }
      }
      const DOW_TXT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

      /* 👩‍🏫 강사 — 번호(카페24)로 이름·원부번호를 다시 찾는다.
         ⛔ attendance.teacher_name 은 읽지 않는다(옛 동기화가 남의 이름을 넣어 둔 칸이다).
            자세한 이유는 loadCafe24TeacherMap 주석. */
      const tMapSeed = await loadCafe24TeacherMap(env, rows.map(r => r.teacher_uid));

      const items = rows.map(r => {
        const uid = String(r.user_id);
        const st = stuMap.get(uid);
        const dow = Number(r.dow);
        const startTime = String(r.start_time);
        const tInfo = r.teacher_uid ? tMapSeed.get(String(r.teacher_uid)) : undefined;
        // 수업 길이 — 접속 시간 평균을 10분 단위로. 기록이 없으면 기본 20분(class-policy).
        const mins = Math.round(Number(r.avg_ms || 0) / 60000 / 10) * 10;
        return {
          user_id: uid,
          student_name: (st && (st.korean_name || st.student_name)) || null,
          shop_name: (st && st.shop_name) || null,
          in_roster: !!st,
          active: !!st && String(st.status || '') === 'active',
          dow, dow_text: DOW_TXT[dow] || '',
          start_time: startTime,
          duration_min: Math.max(10, Math.min(60, mins || DEFAULT_CLASS_MINUTES)),
          teacher_uid: r.teacher_uid || null,
          teacher_name: tInfo?.name || null,
          teacher_id: tInfo?.teacherId || null,      // 원부(teachers.id) — 못 이으면 null 로 둔다
          teacher_linked: !!tInfo?.teacherId,
          seen: Number(r.seen || 0),
          last_date: r.last_date || null,
          already: haveKey.has(`${uid}|${DOW_TXT[dow]}|${startTime}`),
        };
      });

      /* ✅ 기본 체크 규칙 — 명부에 있고, 수강 중이고, 아직 일정이 없는 것만.
         화면은 이 값을 그대로 체크박스 초기값으로 쓴다(규칙을 화면에 또 적지 않는다). */
      const recommended = items.filter(i => i.in_roster && i.active && !i.already);
      return json({
        ok: true, from, to, min_seen: minSeen,
        items,
        totals: {
          patterns: items.length,
          students: new Set(items.map(i => i.user_id)).size,
          recommended: recommended.length,
          skip_already: items.filter(i => i.already).length,
          skip_not_active: items.filter(i => i.in_roster && !i.active).length,
          skip_not_in_roster: items.filter(i => !i.in_roster).length,
          /* 강사가 안 붙는 것도 숫자로 보여 준다 — 「일정은 생겼는데 강사가 없다」를 미리 알린다 */
          no_teacher: recommended.filter(i => !i.teacher_name).length,
          teacher_unlinked: recommended.filter(i => i.teacher_name && !i.teacher_id).length,
        },
      });
    }


    /* ── POST /api/admin/schedule-seed/apply — 사람이 고른 것만 만든다 ──
       body: { items:[{ user_id, dow, start_time, duration_min?, teacher_uid?, teacher_name? }, …] }
       ⛔ 여기서 패턴을 다시 뽑지 않는다. 화면이 보여 준 것 중 «사람이 고른 것» 만 받는다. */
    if (path === '/api/admin/schedule-seed/apply' && method === 'POST') {
      const _seedSc = await getScope(env as any, request);
      if (!canEditOrg(_seedSc)) {
        return json({ ok: false, error: 'forbidden_scope', message: '본사만 사용할 수 있습니다.' }, 403);
      }
      const b: any = await parseJsonBody(request);
      const list: any[] = Array.isArray(b?.items) ? b.items : [];
      if (!list.length) return invalidBody(['items']);
      if (list.length > 500) return json({ ok: false, error: 'too_many', message: '한 번에 500건까지만 만듭니다. 나눠서 눌러 주세요.' }, 400);

      const DOW_TXT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const now = Date.now();
      const actor = await getAdminActor(request, env as any);
      let created = 0; const skipped: any[] = [];

      /* 👩‍🏫 강사 칸 — 화면이 보내 준 번호를 그대로 쓰지 않고 **서버가 다시 찾는다.**
         ⛔ class_schedules.teacher_id 는 원부(teachers.id) 번호다. 카페24 번호를 그대로
            넣으면 겹치는 자리에서 남의 이름이 뜬다(이 표를 읽는 화면들이 LEFT JOIN teachers 를 한다).
         못 이으면 **비워 둔다** — 「강사 미배정」은 눈에 띄지만 틀린 강사는 안 띈다. */
      const tMapApply = await loadCafe24TeacherMap(env, list.map((it: any) => it?.teacher_uid));
      let withTeacher = 0;

      for (const it of list) {
        const uid = String(it?.user_id || '').trim();
        const dow = Number(it?.dow);
        const startTime = String(it?.start_time || '').slice(0, 5);
        if (!uid || !(dow >= 0 && dow <= 6) || !/^\d{2}:\d{2}$/.test(startTime)) {
          skipped.push({ user_id: uid, reason: 'invalid' }); continue;
        }
        const dowTxt = DOW_TXT[dow];
        // 같은 것이 이미 있으면 건너뛴다 — 두 번 눌러도 안 늘어난다(멱등)
        const dup: any = await env.DB.prepare(
          `SELECT id FROM class_schedules WHERE user_id = ? AND day_of_week = ? AND start_time = ? AND status <> 'cancelled' LIMIT 1`
        ).bind(uid, dowTxt, startTime).first().catch(() => null);
        if (dup) { skipped.push({ user_id: uid, reason: 'already' }); continue; }

        const stu: any = await env.DB.prepare(
          `SELECT korean_name, student_name, status FROM students_erp WHERE user_id = ? LIMIT 1`
        ).bind(uid).first().catch(() => null);
        // 명부에 없거나 수강 중이 아니면 만들지 않는다 — 화면이 실수로 보내도 서버가 막는다
        if (!stu) { skipped.push({ user_id: uid, reason: 'not_in_roster' }); continue; }
        if (String(stu.status || '') !== 'active') { skipped.push({ user_id: uid, reason: 'not_active' }); continue; }

        const dur = Math.max(10, Math.min(60, Number(it?.duration_min) || DEFAULT_CLASS_MINUTES));
        const teacherId = (it?.teacher_uid ? tMapApply.get(String(it.teacher_uid))?.teacherId : null) || null;
        await env.DB.prepare(
          `INSERT INTO class_schedules (user_id, student_name, schedule_kind, class_type, day_of_week, start_time, duration_min, teacher_id, status, source, created_by, created_at, updated_at)
           VALUES (?,?,'recurring','regular',?,?,?,?,'active','attendance_seed',?,?,?)`
        ).bind(uid, stu.korean_name || stu.student_name || null, dowTxt, startTime, dur,
               teacherId, actor.name || 'admin', now, now).run();
        created++;
        if (teacherId) withTeacher++;
      }
      return json({
        ok: true, created, with_teacher: withTeacher, without_teacher: created - withTeacher,
        skipped_count: skipped.length, skipped: skipped.slice(0, 50),
      });
    }


    // 🥭 Phase 6d — POST /api/admin/class-schedules/seed-demo
    //   클릭 한 번에 정규+체험+레벨 3개 데모 스케줄 생성 (시스템 동작 즉시 확인용)
    //   (2026-07-24 강사 피드백) "오늘 수업이 없어서 교재/영상/퀴즈·레벨테스트·피드백 화면을 못 본다" →
    //   ?teacher_id= 를 함께 주면 그 강사 담당으로, 오늘 바로 입장 가능한 수업도 하나 추가로 만든다.
    if (method === 'POST' && path === '/api/admin/class-schedules/seed-demo') {
      const url = new URL(request.url);
      let userId = url.searchParams.get('user_id') || '';
      let seedTeacherId = (url.searchParams.get('teacher_id') || '').trim() || null;
      const seedTeacherNameQ = (url.searchParams.get('teacher_name') || '').trim();
      if (!seedTeacherId && seedTeacherNameQ) {
        try {
          const tName = seedTeacherNameQ.replace(/(선생님?|쌤)$/, '').trim() || seedTeacherNameQ;
          const t = await env.DB.prepare(`SELECT id FROM teachers WHERE name = ? OR name LIKE ? LIMIT 1`).bind(seedTeacherNameQ, '%' + tName + '%').first<any>();
          if (t?.id) seedTeacherId = String(t.id);
        } catch {}
      }
      /* 🔴 (2026-08-27) 아래 두 조회도 없는 컬럼 id 를 참조해 죽는다(catch 가 삼킴) →
         user_id 를 안 주면 이 API 는 no_student 로 끝난다 = 데모 시드가 만들어지지 않는다.
         ⛔ 일부러 안 고쳤다 — 되살리면 class_schedules 에 시드 행이 다시 생기는데, 6월 시드
            140행이 «이미 예약된» 자리표시로 배정을 막던 사고가 이미 있었다(CLAUDE.md 2장).
            지금은 죽어 있는 편이 안전하다. 필요해지면 그때 사람이 판단해서 되살릴 것. */
      // user_id 안 주면 students_erp 첫 학생 사용
      if (!userId) {
        try {
          const r = await env.DB.prepare(`SELECT COALESCE(user_id, login_id, 'stu_' || id) AS uid, COALESCE(korean_name, username) AS name FROM students_erp WHERE COALESCE(status,'정상') IN ('정상','활동','active') ORDER BY rowid DESC LIMIT 1`).first<any>();
          if (r?.uid) userId = r.uid;
        } catch {}
        if (!userId) return json({ ok: false, error: 'no_student' }, 400);
      }
      // 학생 이름 조회
      let studentName = '데모학생';
      try {
        const s = await env.DB.prepare(`SELECT COALESCE(korean_name, username) AS name FROM students_erp WHERE COALESCE(user_id, login_id) = ? OR ('stu_' || id) = ? LIMIT 1`).bind(userId, userId).first<any>();
        if (s?.name) studentName = s.name;
      } catch {}
      // 테이블 보강
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS class_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, student_name TEXT, schedule_kind TEXT NOT NULL DEFAULT 'recurring', class_type TEXT NOT NULL DEFAULT 'regular', day_of_week TEXT, scheduled_date TEXT, start_time TEXT NOT NULL, duration_min INTEGER DEFAULT 20, teacher_id TEXT, status TEXT DEFAULT 'active', source TEXT, created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER, notes TEXT)`); } catch {}
      const csCols: Array<[string,string]> = [['student_name','TEXT'],['schedule_kind','TEXT'],['class_type','TEXT'],['day_of_week','TEXT'],['scheduled_date','TEXT'],['duration_min','INTEGER'],['teacher_id','TEXT'],['status','TEXT'],['source','TEXT'],['created_by','TEXT'],['updated_at','INTEGER'],['notes','TEXT']];
      for (const [c,t] of csCols) { try { await env.DB.exec('ALTER TABLE class_schedules ADD COLUMN ' + c + ' ' + t); } catch {} }
      const now = Date.now();
      const todayKst = new Date(now + 9*3600*1000).toISOString().slice(0,10);
      // 3가지 type 데모: 월/수 정규 / 화 체험 / 다음주 월 레벨
      // ★ Phase 7 비즈니스 규칙: trial/level_test = one_off, regular = recurring
      const tomorrow = new Date(now + 86400000 + 9*3600000).toISOString().slice(0,10);
      const nextWeek = new Date(now + 7*86400000 + 9*3600000).toISOString().slice(0,10);
      const seeds = [
        { kind:'recurring', type:'regular',    day:'mon,wed', date:null,     time:'15:00', label:'데모 - 매주 월·수 정규수업' },
        { kind:'one_off',   type:'trial',      day:null,      date:tomorrow, time:'16:00', label:'데모 - 체험수업 (1회)' },
        { kind:'one_off',   type:'level_test', day:null,      date:nextWeek, time:'17:00', label:'데모 - 레벨테스트 (1회)' }
      ];
      // 🎯 오늘 바로 입장해볼 수 있는 데모 수업 — KST 기준 지금부터 5분 뒤 (join_open 창 30분전~40분후에 걸리도록)
      const kstNow = new Date(now + 9*3600000);
      const soon = new Date(kstNow.getTime() + 5*60000);
      const soonTime = String(soon.getUTCHours()).padStart(2,'0') + ':' + String(soon.getUTCMinutes()).padStart(2,'0');
      seeds.push({ kind:'one_off', type:'regular', day:null, date:todayKst, time:soonTime, label:'데모 - 오늘 바로 입장 테스트용' });
      const inserted: any[] = [];
      for (const s of seeds) {
        try {
          const ins = await env.DB.prepare(
            `INSERT INTO class_schedules (user_id, student_name, schedule_kind, class_type, day_of_week, scheduled_date, start_time, duration_min, teacher_id, status, source, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 'demo_seed', ?, ?)`
          ).bind(userId, studentName, s.kind, s.type, s.day, s.date, s.time, DEFAULT_CLASS_MINUTES, seedTeacherId, 'admin', now).run();
          inserted.push({ id: ins?.meta?.last_row_id, ...s });
        } catch (e: any) {
          inserted.push({ error: String(e?.message||e), ...s });
        }
      }
      return json({ ok: true, user_id: userId, student_name: studentName, count: inserted.length, items: inserted });
    }



    // 🥭 (2026-07-24) POST /api/admin/class-schedules — 수업 예약 신규 등록
    //   ▸ 왜 지금 만드나: 지금까지 예약을 '만드는' 경로가 관리자 AI 명령(ai-command.ts) 하나뿐이었다.
    //     화면에 등록 폼이 없어 담당자가 예약을 직접 잡을 수 없었고, 그래서 교사·학생이 방 코드를
    //     손으로 주고받다 서로 다른 방에 들어가는 사고가 반복됐다(2026-07-23 실수업 12분 손실).
    //     예약이 있으면 room_id 가 class-{id}-{YYYYMMDD} 로 결정돼 엇갈림이 원천 차단된다.
    //   body: { student_name(필수), user_id?, teacher_name?|teacher_id?,
    //           schedule_kind:'recurring'|'one_off', days:[0-6]|day_of_week, scheduled_date:'YYYY-MM-DD',
    //           start_time:'HH:MM'(필수), duration_min?, class_type?, notes?, force? }
    //   ⚠️ day_of_week 는 반드시 '숫자 0=일~6=토' 로 저장한다 — /api/class/sessions/today 가
    //      그 형식을 기준으로 오늘 수업을 계산한다. 반복 수업이 여러 요일이면 요일당 1행.
    /* 🚪 「오늘은 이 방으로」 — 예약 한 건을 하루만 회의방으로 돌린다 (2026-09-10 사장님 지시)
       ─────────────────────────────────────────────────────────────────────────
       ⚠️ **왜 PUT 인가** — 새 경로를 만들려면 `src/index.ts` 의 라우팅 허용목록에 한 줄을
          넣어야 하는데 그 파일은 «공동 금지구역» 이다. 그 목록의 등록은 **메서드를 안 가리므로**
          이미 등록된 `/api/admin/class-schedules`(정확일치)의 **비어 있는 메서드**에 얹는다
          (실측: 이 경로는 GET·POST 만 쓴다). CLAUDE.md 2장 「②가 금지구역이라 못 고칠 때」.
       ⛔ 그래서 본문에 `action` 을 두고 **모르는 값은 거절한다** — 안 그러면 나중에 이 경로에
          다른 뜻을 넣을 때 «모르는 요청» 이 조용히 흘러 들어간다.
       판정 정본은 `src/class-room-override.ts`(방 이름 규칙은 화면과 같은 말을 해야 한다). */
    if (method === 'PUT' && path === '/api/admin/class-schedules') {
      const b: any = await request.json().catch(() => ({}));
      const act = String(b.action || '').trim();
      if (act !== 'room_override' && act !== 'room_override_clear') {
        return json({ ok: false, error: 'unknown_action', message: '모르는 요청입니다.' }, 400);
      }

      /* 누가 지정할 수 있나 — 본사(hq) 와 **그 수업 담당 강사**.
         ⛔ 지사·대리점은 막는다(isOrgScopedRole) — 남의 수업을 다른 방으로 돌리는 조작이다.
         ⛔ canEditOrg() 로 막지 말 것 — 그 함수는 'none'(내부직원·교사)에도 true 라 강사를 못 가린다
            (CLAUDE.md 2장 「본사 전용으로 막았는데 강사가 그대로 실행됨」). */
      const _roActor = await getAdminActor(request, env as any);
      if (!_roActor || (_roActor as any).ok === false) return json({ ok: false, error: 'unauthorized' }, 401);
      if (isOrgScopedRole((_roActor as any).role)) {
        return json({ ok: false, error: 'forbidden_scope', message: '본사 또는 담당 강사만 지정할 수 있습니다.' }, 403);
      }
      /* 🔴 (2026-09-10 함정 대조) 차단목록만 두면 **fail-open 이 됩니다.**
         `getAdminActor` 는 `getScope()`·이름 조회를 각각 try/catch 로 삼키고 실패하면
         `scope='none'`·`name=''` 으로 떨어뜨리는데, 그러면 `resolveRole` 이 `'staff'` 를 줘서
         `isTeacher === false` → **담당 확인이 통째로 건너뛰어집니다.** D1 이 한 번 흔들리면
         아무나 남의 수업을 다른 방으로 돌릴 수 있다는 뜻입니다.
         ⟹ 「본사인가」를 **양성으로** 묻고, 그 밖은 전부 담당 확인을 지나게 합니다. */
      /* `resolveRole` 이 실제로 내는 값은 teacher·franchise·branch·agency·hq·staff 뿐이고,
         **`'hq'` 만 본사**다(본사 매니저도 스코프가 hq 라 여기에 든다).
         ⚠️ `'staff'` 는 «스코프를 못 읽었을 때» 떨어지는 값이기도 하다 — 그래서 본사로 안 친다. */
      const _roIsHq = String((_roActor as any).role || '') === 'hq';

      const sid = Number(b.schedule_id);
      if (!Number.isFinite(sid) || sid <= 0) return json({ ok: false, error: 'bad_schedule_id' }, 400);

      // 그 예약이 실재하는지 + 담당 강사가 누구인지
      /* ⚠️ «못 찾았다» 와 «못 물어봤다» 를 갈라 말한다 — `.catch(() => null)` 로 뭉치면
         D1 이 흔들렸을 뿐인데 화면이 「그 수업이 없습니다」라고 **거짓 사유**를 말한다
         (CLAUDE.md 2장 「«모른다»(null) 를 별도 사유(`lookup_failed`)로」). 둘 다 막는 것은 같다. */
      let row: any = null;
      try {
        row = await env.DB.prepare(
          `SELECT id, user_id, student_name, teacher_id, status FROM class_schedules WHERE id = ?`
        ).bind(sid).first();
      } catch (e) {
        console.warn('[room-override] 예약 조회 실패', e);
        return json({ ok: false, error: 'lookup_failed', message: '수업 정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.' }, 503);
      }
      if (!row || !row.id) return json({ ok: false, error: 'schedule_not_found' }, 404);

      /* 강사면 «자기 수업» 인지 확인한다. 못 확인하면 **막는 쪽으로 실패**한다 —
         남의 학생을 다른 방으로 보내는 조작이라 「모르면 통과」가 되면 안 된다. */
      if (!_roIsHq) {
        const mine = await teacherOwnsSchedule(env as any, _roActor as any, row);
        if (mine !== true) return json({ ok: false, error: 'forbidden_not_my_class', message: '내 수업만 지정할 수 있습니다.' }, 403);
      }

      const ymd = String(b.ymd || '').trim() || kstYmd(Date.now());
      if (!/^\d{8}$/.test(ymd)) return json({ ok: false, error: 'bad_ymd' }, 400);
      /* ⛔ 지난 날짜에는 못 건다 — 「오늘 하루」가 이 기능의 전부다. */
      if (ymd < kstYmd(Date.now())) return json({ ok: false, error: 'past_ymd', message: '지난 날짜에는 지정할 수 없습니다.' }, 400);

      await ensureRoomOverrideTable(env.DB);

      if (act === 'room_override_clear') {
        await env.DB.prepare(`DELETE FROM class_room_override WHERE schedule_id = ? AND ymd = ?`).bind(sid, ymd).run();
        return json({ ok: true, cleared: true, schedule_id: sid, ymd });
      }

      const v = validateOverrideInput(sid, b.room_code);
      if (!v.ok) return json({ ok: false, error: v.error || 'bad_room_code', message: '방 번호를 확인해 주세요.' }, 400);

      const now = Date.now();
      /* ⛔ 메모는 «받지 않는다». 화면이 안 보내는 죽은 칸인데 서버가 받아 저장하고
         `room_override_note` 로 **학생 응답에 실어 보내고** 있었다 — 누가 채우는 순간
         «선생님 메모가 학생 화면으로» 가는 길이 된다(2026-09-10 함정 대조).
         칸은 남겨 둔다(나중에 «학생에게 보여 줄 한 줄» 로 쓸 수 있다) — 지금은 늘 null. */
      const note: string | null = null;
      await env.DB.prepare(
        `INSERT INTO class_room_override (schedule_id, ymd, room_id, note, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(schedule_id, ymd) DO UPDATE SET
           room_id = excluded.room_id, note = excluded.note,
           created_by = excluded.created_by, created_at = excluded.created_at`
      ).bind(sid, ymd, v.room_id, note, String((_roActor as any).username || 'unknown'), now).run();

      return json({
        ok: true, schedule_id: sid, ymd, room_id: v.room_id, note,
        student_name: row.student_name || null,
        /* 화면이 그대로 보여 줄 링크 — 도메인은 정본 한 곳에서만 온다(CLAUDE.md 0장). */
        link: `${SITE_ORIGIN}/?meet=${encodeURIComponent(v.room_id.replace(/^meet-/, ''))}`,
      });
    }


    if (method === 'POST' && path === '/api/admin/class-schedules') {
      try {
        await env.DB.exec(
          `CREATE TABLE IF NOT EXISTS class_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, student_name TEXT, schedule_kind TEXT NOT NULL DEFAULT 'recurring', class_type TEXT NOT NULL DEFAULT 'regular', day_of_week TEXT, scheduled_date TEXT, start_time TEXT NOT NULL, duration_min INTEGER DEFAULT 20, teacher_id TEXT, status TEXT DEFAULT 'active', source TEXT, created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER, notes TEXT)`
        );
      } catch {}
      const body: any = await request.json().catch(() => ({}));
      const bad = (error: string, ko: string, en: string, extra: any = {}, code = 400) =>
        json({ ok: false, error, message: ko, message_en: en, ...extra }, code);

      // ── 학생 신원 (uid 우선, 없으면 이름으로 조회) ──
      let studentName = String(body.student_name || '').trim();
      let userId = String(body.user_id || '').trim();
      if (!userId && studentName) {
        try {
          /* ⚠️ (2026-08-27) 여기 있던 ('stu_' || id) 는 students_erp 에 없는 컬럼이라 죽어 있었고
             (catch 가 삼킴) 그래서 «이름만 주고 등록» 은 늘 student_not_found 로 끝났다.
             ⛔ 되살릴 때 옛 `LIMIT 1` 을 그대로 두면 안 된다 — 동명이인이 실재하므로(김민서 71명)
                «아무나» 집어 남의 계정에 수업이 등록된다. 이름이 **정확히 한 계정으로만** 떨어질
                때만 쓰고, 아니면 안 채운다(아래에서 student_not_found 로 사람에게 되묻는다).
             — sessions/today 의 이름 구제와 같은 규칙(CLAUDE.md 2장 «모르는 것보다 틀린 게 나쁘다»). */
          const rs = await env.DB.prepare(
            `SELECT COALESCE(user_id, login_id) AS uid FROM students_erp WHERE korean_name = ? OR username = ?`
          ).bind(studentName, studentName).all<any>();
          const uids = Array.from(new Set((rs.results || []).map((x: any) => x.uid).filter(Boolean)));
          if (uids.length === 1) userId = String(uids[0]);
        } catch {}
      }
      if (!userId) return bad('student_not_found', '학생을 찾지 못했습니다. 이름을 확인하거나 user_id 를 함께 보내주세요.', 'Student not found. Check the name or send user_id as well.');
      /* 🆔 (2026-09-29) «아이디만» 적은 줄(require_known_uid)은 명부에 있는지 확인 — 오타가 «아무도 안 오는 수업» 이 된다.
         정확일치 우선, 없으면 대소문자만 다른 후보가 «하나» 일 때만 명부 표기로. 조회 실패는 막지 않음. */
      if (body.require_known_uid) {
        let found: string | null = null, looked = false;
        try {
          const rs = ((await env.DB.prepare(`SELECT user_id FROM students_erp WHERE user_id = ? COLLATE NOCASE LIMIT 3`).bind(userId).all<any>()).results || []).map((x: any) => String(x.user_id));
          found = rs.includes(userId) ? userId : (rs.length === 1 ? rs[0] : null); looked = true;
        } catch {}
        if (looked && !found) return bad('student_not_found', `아이디 «${userId}» 를 학생 명부에서 찾지 못했습니다. 철자를 확인해 주세요.`, `Student ID «${userId}» not found. Check the spelling.`);
        if (found) userId = found;
      }
      /* 🏷 (2026-09-28) 아이디만 오고 이름이 비었으면 명부에서 이름을 채운다.
         [왜] 학생 상세 화면(admin/student.html)이 읽던 STUDENT_NAME 변수가 어디에도 정의돼 있지
              않아 그 화면에서 등록한 수업은 전부 student_name=NULL 로 저장됐고, 이름 칸만 보는
              주간 전체 스케줄에 «20m» 만 남는 빈 카드가 됐다(정예희 yahee · Zee·Krystel 실제로 밟음).
         ✅ user_id **정확일치** 한 행에서만 읽는다(이름 짐작 없음). 못 읽으면 예전처럼 NULL. */
      if (!studentName) {
        try {
          const nr = await env.DB.prepare(`SELECT korean_name FROM students_erp WHERE user_id = ? LIMIT 1`)
            .bind(userId).first<any>();
          if (nr && String(nr.korean_name || '').trim()) studentName = String(nr.korean_name).trim();
        } catch {}
      }

      // ── 강사 매칭 (teachers 테이블 기준. '선생님/쌤' 접미사 제거 후 부분일치) ──
      //   ⚠️ teacher_profiles 에만 있고 teachers 에 없는 강사는 여기서 안 잡힌다 →
      //      teacher_matched:false 로 돌려줘 화면이 경고할 수 있게 한다(등록 자체는 진행).
      let teacherId = String(body.teacher_id || '').trim();
      let teacherName: string | null = null;
      let teacherMatched = !!teacherId;
      const tRaw = String(body.teacher_name || '').trim();
      if (teacherId) {
        /* 🔴 (2026-09-22) id 로 고른 경우 이름을 «id 로» 되찾는다 — 짐작이 없다.
           ⚠️ 이 줄이 없으면 teacherName 이 null 이라 아래 one_off 휴가 충돌 검사가
              통째로 건너뛰어진다(자유 입력 경로는 받던 검사다).
           ⛔ 못 읽었을 때 body.teacher_name 으로 떨어뜨리지 말 것 — 화면이 보낸 글자로
              «막는» 검사를 돌리는 것이 되고, 그 자리에서는 지금처럼 «검사 안 함» 이 맞다. */
        try {
          const t = await env.DB.prepare(`SELECT name FROM teachers WHERE id = ? LIMIT 1`)
            .bind(teacherId).first<any>();
          if (t?.name) teacherName = String(t.name);
        } catch {}
      } else if (tRaw) {
        /* ⛔ 이 «부분일치 + LIMIT 1» 은 자유 입력 폴백 전용이다 — 넓히지 말 것.
           2026-09-22 운영 D1 실측: 'FAR'(재직 22) 을 정확히 쳐도 'HT FARRAH'(퇴사 3) 가 붙는다. */
        const tName = tRaw.replace(/(선생님?|쌤)$/, '').trim() || tRaw;
        try {
          const t = await env.DB.prepare(`SELECT id, name FROM teachers WHERE name = ? OR name LIKE ? LIMIT 1`)
            .bind(tRaw, '%' + tName + '%').first<any>();
          if (t?.id) { teacherId = String(t.id); teacherName = String(t.name); teacherMatched = true; }
        } catch {}
      }

      // ── 시간 ──
      const rawTime = String(body.start_time || '').trim();
      if (!/^\d{1,2}:\d{2}$/.test(rawTime)) return bad('invalid_time', '시작 시간을 HH:MM 형식으로 입력해 주세요.', 'Enter start time as HH:MM.');
      const [rh, rm] = rawTime.split(':');
      if (Number(rh) > 23 || Number(rm) > 59) return bad('invalid_time', '시작 시간이 올바르지 않습니다.', 'Start time is out of range.');
      const startTime = String(Number(rh)).padStart(2, '0') + ':' + rm;
      // ⏱ (2026-08-26) 안 보내면 30분이 아니라 정책 기본값(20분) — class-policy.ts 머리말이
      //   경고하는 «운영 DB 옛 스키마 DEFAULT 30» 이 여기로 새어 들어오지 않게 명시적으로 20을 쓴다.
      //   명시된 값은 그대로 존중한다(주간 스케줄 화면은 20/30/40 만 보내지만, 이 API 자체는
      //   그 세 값으로 좁히지 않는다 — 기존에 열려 있던 상한 240분은 그대로 유지).
      const durationMin = Number.isFinite(Number(body.duration_min)) && Number(body.duration_min) > 0 ? Math.min(Number(body.duration_min), 240) : DEFAULT_CLASS_MINUTES;
      const classType = ['regular', 'trial', 'level_test', 'makeup'].includes(String(body.class_type || '')) ? String(body.class_type) : 'regular';
      const notes = body.notes ? String(body.notes).slice(0, 500) : null;

      // ── 반복(요일) / 일회성(날짜) ──
      const DOW_IN: Record<string, number> = {
        sun: 0, sunday: 0, '일': 0, '일요일': 0, mon: 1, monday: 1, '월': 1, '월요일': 1,
        tue: 2, tuesday: 2, '화': 2, '화요일': 2, wed: 3, wednesday: 3, '수': 3, '수요일': 3,
        thu: 4, thursday: 4, '목': 4, '목요일': 4, fri: 5, friday: 5, '금': 5, '금요일': 5,
        sat: 6, saturday: 6, '토': 6, '토요일': 6,
      };
      const toDow = (v: any): number | null => {
        const q = String(v ?? '').trim();
        if (!q) return null;
        if (/^\d$/.test(q)) { const n = Number(q); return (n >= 0 && n <= 6) ? n : null; }
        const x = DOW_IN[q.toLowerCase()];
        return x == null ? null : x;
      };
      const kind = String(body.schedule_kind || '').toLowerCase() === 'one_off' ? 'one_off' : 'recurring';
      const rawDays: any[] = Array.isArray(body.days) ? body.days
        : (body.day_of_week != null ? String(body.day_of_week).split(/[,\s]+/) : []);
      const days: number[] = [];
      for (const d of rawDays) { const n = toDow(d); if (n != null && !days.includes(n)) days.push(n); }
      const schedDate = String(body.scheduled_date || '').trim();

      if (kind === 'recurring' && !days.length) return bad('day_required', '반복 수업은 요일을 하나 이상 선택해 주세요.', 'Pick at least one weekday for a recurring class.');
      if (kind === 'one_off' && !/^\d{4}-\d{2}-\d{2}$/.test(schedDate)) return bad('date_required', '일회성 수업은 날짜(YYYY-MM-DD)를 입력해 주세요.', 'Enter a date (YYYY-MM-DD) for a one-off class.');
      /* 📅 (2026-09-24) 매주 반복의 «시작일» — 없으면 오늘(KST). 정본 src/class-start-date.ts.
         ⛔ scheduled_date 로 받지 말 것(그 칸이 있으면 «그 하루만» 이 된다). */
      let startsOn: string | null = null;
      if (kind === 'recurring') {
        const rawSo = String(body.starts_on || '').trim();
        if (rawSo && !normStartsOn(rawSo)) return bad('invalid_start_date', '시작일은 YYYY-MM-DD 형식이어야 합니다.', 'Start date must be YYYY-MM-DD.');
        startsOn = normStartsOn(rawSo) || (kstYmdOfMs(Date.now()) as string);
      }
      const hasStartsOn = kind === 'recurring' ? await ensureStartsOnColumn(env) : false;

      // ── ⛔ 시간 겹침 검사 (2026-08-04 보강) ─────────────────────────────
      //   [기존 문제 1] `start_time = ?` 로 '시작 시각이 완전히 같은' 예약만 잡았다.
      //     → 09:00 (50분) 수업이 있는데 09:30 수업을 넣으면 20분이 겹치는데도 그냥 통과했다.
      //     이제 duration_min 을 반영한 '구간 겹침' 으로 판정한다.
      //   [기존 문제 2] user_id(학생) 기준만 봤다. 같은 강사가 같은 시간에 다른 학생 수업을
      //     이미 갖고 있어도 아무도 막지 않았다 = 강사가 동시에 두 방에 들어가야 하는 상태.
      //     화상수업에서는 물리적으로 불가능해 수업 당일 사고로 직결된다.
      //   ⚠️ 단, '같은 시각·같은 길이' 는 합반(그룹) 수업이 정상적으로 만들어내는 모양이므로
      //     강사 겹침에서 제외한다. 막으면 멀쩡한 합반 등록이 깨진다.
      //   응답 코드는 기존과 같은 'conflict' 를 유지한다 → 화면(admin/student.html)이
      //     이미 409+conflict 를 확인창으로 처리하고 있어 프론트 수정이 필요 없다.
      //   판정은 schedule-conflict.ts 한 곳에만 둔다 — 경로마다 복사하면 또 어긋난다.
      const slotQ: ScheduleSlotQuery = { kind, userId, teacherId, days, schedDate, startTime, durationMin };
      const stuDay = kind === 'one_off' ? await activeRowsFor(env, 'user_id', userId, slotQ) : null;   // 한 번만 읽어 겹침·같은 날 둘 다에 쓴다
      const conf = await findScheduleConflicts(env, slotQ, stuDay ? { student: stuDay } : undefined);
      if (conf.has && !body.force) {
        return bad('conflict', conf.ko + ' 그래도 등록하려면 다시 확인해 주세요.', conf.en + ' Confirm again to register anyway.',
          { conflicts: conf.student, teacher_conflicts: conf.teacher }, 409);
      }
      /* ➕ (2026-11-11) 같은 날 다른 시각에 수업이 있으면 «옮기기» 를 «추가» 로 한 것일 수 있다 — 한 번 되묻는다.
         'conflict' 로 돌려주는 이유: 화면 두 곳(weekly-schedule·student.html)이 이미 409 conflict 를 «확인창 → force» 로 처리한다. */
      const sameDay = !conf.has && stuDay ? sameDayAddNotice(stuDay, schedDate) : null;
      if (sameDay && !body.force) {
        return bad('conflict', sameDay.ko, sameDay.en, { conflicts: stuDay, same_day: sameDay.times }, 409);
      }

      // ── 🚫 강사 근무불가(휴가·휴식시간) 검사 — 강사 피드백(2026-07-24):
      //   "강사가 휴가일 때 그 시간에 학생이 예약 못 하게 막아야 한다." force:true 로도 우회 못 하게
      //   (강사가 실제로 없는 시간에 등록되면 수업 진행 자체가 불가능해 conflict 와는 성격이 다르다)
      const teacherBlocks: any[] = [];
      if (teacherId) {
        try {
          await env.DB.exec(
            `CREATE TABLE IF NOT EXISTS teacher_unavailability (id INTEGER PRIMARY KEY AUTOINCREMENT, teacher_id TEXT NOT NULL, teacher_name TEXT, kind TEXT NOT NULL DEFAULT 'date_range', start_date TEXT, end_date TEXT, day_of_week INTEGER, start_time TEXT, end_time TEXT, reason TEXT, created_by TEXT, created_at INTEGER NOT NULL)`
          );
          const toMin = (hhmm: string) => { const [h, m] = String(hhmm || '00:00').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
          const classStartMin = toMin(startTime);
          const classEndMin = classStartMin + durationMin;
          const rs = await env.DB.prepare(`SELECT * FROM teacher_unavailability WHERE teacher_id = ?`).bind(teacherId).all<any>();
          const overlaps = (b: any) => {
            const bStart = b.start_time ? toMin(b.start_time) : 0;
            const bEnd = b.end_time ? toMin(b.end_time) : 24 * 60;
            return classStartMin < bEnd && bStart < classEndMin;
          };
          for (const b of (rs.results || [])) {
            if (kind === 'one_off') {
              if (b.kind === 'date_range' && b.start_date && b.end_date && schedDate >= b.start_date && schedDate <= b.end_date && overlaps(b)) teacherBlocks.push(b);
              else if (b.kind === 'weekly' && b.day_of_week != null) {
                const dow = new Date(schedDate + 'T00:00:00').getDay();
                if (Number(b.day_of_week) === dow && overlaps(b)) teacherBlocks.push(b);
              }
            } else {
              if (b.kind === 'weekly' && b.day_of_week != null && days.includes(Number(b.day_of_week)) && overlaps(b)) teacherBlocks.push(b);
            }
          }
        } catch {}
      }
      // ── 🏖 기존 "캘린더 관리(휴가·공휴일)" 카드에 등록된 종일 휴가와도 충돌 검사 ──
      //   calendar_events 는 teacher_id 를 저장하지 않아(항상 NULL) teacher_name 문자열로만 대조 가능.
      //   (일회성 예약만 검사 — 반복 예약은 특정 날짜가 없어 종일 휴가와 대조할 기준일이 없음)
      if (kind === 'one_off' && teacherName) {
        try {
          const vac = await env.DB.prepare(
            `SELECT id, title, date, end_date FROM calendar_events WHERE event_type = 'vacation' AND teacher_name = ? AND date <= ? AND COALESCE(end_date, date) >= ? LIMIT 1`
          ).bind(teacherName, schedDate, schedDate).first<any>();
          if (vac) teacherBlocks.push({ kind: 'calendar_vacation', ...vac });
        } catch {}
      }
      if (teacherBlocks.length) {
        return bad('teacher_unavailable', '이 시간은 강사가 근무 불가(휴가/휴식시간)로 등록되어 있어 예약할 수 없습니다.', 'The teacher is marked unavailable (time off / break) during this time — booking is blocked.', { teacher_blocks: teacherBlocks }, 409);
      }

      // ── 등록 (반복 수업은 요일당 1행 — sessions/today 가 요일 1개를 전제로 계산) ──
      const now = Date.now();
      let actorName = 'admin';
      let mergeOk = false;   // 🔀 신청서 자동 연결은 본사만 — 강사·조직 계정·모름이면 admin_ui 로 남긴다(목록의 «합치기» 로 본사가 잇는다)
      try { const a = await getAdminActor(request, env as any); if (a?.name) actorName = a.name; mergeOk = !!(a && a.ok && !a.isTeacher && !isOrgScopedRole(a.role)); } catch {}
      const created: any[] = [];
      const failed: any[] = [];
      const targets = kind === 'recurring'
        ? days.map(d => ({ dow: String(d), date: null as string | null }))
        : [{ dow: null as string | null, date: schedDate }];
      for (const t of targets) {
        try {
          const ins = (hasStartsOn && startsOn)
            ? await env.DB.prepare(
                `INSERT INTO class_schedules (user_id, student_name, schedule_kind, class_type, day_of_week, scheduled_date, start_time, duration_min, teacher_id, status, source, created_by, created_at, notes, starts_on) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 'admin_ui', ?, ?, ?, ?)`
              ).bind(userId, studentName || null, kind, classType, t.dow, t.date, startTime, durationMin, teacherId || null, actorName, now, notes, startsOn).run()
            : await env.DB.prepare(
                `INSERT INTO class_schedules (user_id, student_name, schedule_kind, class_type, day_of_week, scheduled_date, start_time, duration_min, teacher_id, status, source, created_by, created_at, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 'admin_ui', ?, ?, ?)`
              ).bind(userId, studentName || null, kind, classType, t.dow, t.date, startTime, durationMin, teacherId || null, actorName, now, notes).run();
          created.push({ id: (ins?.meta?.last_row_id as number) ?? null, day_of_week: t.dow, scheduled_date: t.date, start_time: startTime, starts_on: (hasStartsOn ? startsOn : null) });
        } catch (e: any) {
          failed.push({ day_of_week: t.dow, scheduled_date: t.date, detail: String(e?.message || e).slice(0, 200) });
        }
      }
      if (!created.length) return bad('insert_failed', '예약 등록에 실패했습니다.', 'Failed to create the schedule.', { failed }, 500);

      // 📜 수업 변경 이력 — best-effort
      for (const c of created) {
        try {
          await writeClassAudit(env, {
            action: 'add', schedule_id: c.id,
            teacher_name: teacherName, student_name: studentName || null,
            lesson_date: c.scheduled_date || null, lesson_time: startTime,
            actor: actorName, actor_role: 'admin', source: 'ui', reason: null,
          });
        } catch {}
      }

      /* 🔀 (2026-09-30 사장님 «배정 경로가 어떠하든 수강신청 목록에 같은 조건과 버튼») 방금 만든 수업을
         신청서로 잇는다 — 같은 묶음(학생·강사·시각·길이)의 살아 있는 신청서가 있으면 거기에 붙인다.
         ⚠️ 실패해도 수업 등록은 그대로다(목록의 «합치기» 로 다시 잇는다) — 던지지 않는 함수다. */
      const enrollmentMerge = mergeOk ? await mergeDirectByIds(env, created.map((c: any) => Number(c.id))) : null;

      return json({
        ok: true, created, failed, enrollment_merge: enrollmentMerge,
        // force:true 로 겹침을 무릅쓰고 등록한 경우, 무엇과 겹쳤는지 그대로 돌려준다
        conflicts: conf.student, teacher_conflicts: conf.teacher,
        user_id: userId, student_name: studentName || null,
        teacher_id: teacherId || null, teacher_name: teacherName, teacher_matched: teacherMatched,
        schedule_kind: kind, start_time: startTime, duration_min: durationMin,
        starts_on: hasStartsOn ? startsOn : null,
        // 강사가 teachers 에 없으면 교사 쪽 '오늘 내 수업' 조회가 비게 된다 → 화면이 경고하도록
        warning: (!teacherMatched && tRaw) ? '강사 "' + tRaw + '" 를 강사 명단(teachers)에서 찾지 못해 담당 강사 없이 등록했습니다. 강사 명단에 등록한 뒤 다시 지정해 주세요.' : null,
        warning_en: (!teacherMatched && tRaw) ? 'Teacher "' + tRaw + '" was not found in the teacher list, so the class was created without an assigned teacher. Add the teacher first, then reassign.' : null,
      });
    }


    // 🥭 Phase 22 — DELETE /api/admin/class-schedules/:id (스케줄 삭제 또는 취소)
    if (method === 'DELETE' && /^\/api\/admin\/class-schedules\/\d+$/.test(path)) {
      const id = parseInt(path.split('/').pop() || '0', 10);
      if (!id) return json({ ok: false, error: 'invalid_id' }, 400);
      // 📜 삭제 전 수업 정보 확보(이력에 남기기 위해) + 행위자
      const _delActor = await getAdminActor(request, env as any);
      /* 🔒 (2026-11-04 사장님 «권한 분리») 수업 «취소» 는 본사 계정만 — 화면(연기·변경 창)은 강사·지사에게 취소 버튼을
         안 주는데(canCancel), 서버는 강사 세션의 직접 호출을 막지 않았다(이 경로는 강사 차단 접두사에 없다 —
         강사는 같은 경로의 PATCH(옮기기)를 쓴다). 지사·대리점은 index.ts 스코프 관문이 이미 403 이다.
         ⚠️ 역할 기준(isTeacher)으로 막는다 — 강사 계정 스코프가 잘못 'hq' 로 세팅된 사례가 있다(index.ts «항상 role 기준»).
         ⛔ 역할을 못 읽으면(ok=false) 막는다 — 되돌릴 수 없는 쪽은 «모르면 막기». 화면은 403 을 «본사 계정에서 합니다» 로 읽는다. */
      if (!_delActor || !_delActor.ok || _delActor.isTeacher) {
        return json(forbiddenTeacherBody(_delActor, '수업 «취소» 는 본사 계정에서 합니다.', 'Cancelling a class is done by an HQ account.'), 403);
      }
      const _delRow: any = await env.DB.prepare(`SELECT * FROM class_schedules WHERE id = ? LIMIT 1`).bind(id).first().catch(() => null);
      let _delReason: string | null = null;
      try { const b: any = await request.json(); _delReason = (b && b.reason) ? String(b.reason).slice(0, 300) : null; } catch {}
      try {
        /* 🪞 (2026-08-31) 지우는 것도 «사람 손» 이다 — 도장을 함께 찍는다.
           안 찍으면 미러가 다음 실행에서 그 수업을 «없네?» 하고 다시 만든다. */
        const _delMirror = _delRow && String(_delRow.source || '') === MIRROR_SOURCE;
        await env.DB.prepare(
          _delMirror
            ? `UPDATE class_schedules SET status='cancelled', source='${MIRROR_SOURCE_MANUAL}', updated_at=? WHERE id=?`
            : `UPDATE class_schedules SET status='cancelled', updated_at=? WHERE id=?`
        ).bind(Date.now(), id).run();
        // 📜 수업 변경 이력(삭제) 기록 — best-effort
        await writeClassAudit(env, {
          action: 'remove', schedule_id: id,
          teacher_name: _delRow ? (_delRow.teacher_name || null) : null,
          student_name: _delRow ? (_delRow.student_name || null) : null,
          lesson_date: _delRow ? (_delRow.scheduled_date || null) : null,
          lesson_time: _delRow ? (_delRow.start_time || null) : null,
          actor: _delActor.name || '관리자',
          actor_role: _delActor.isTeacher ? 'teacher' : 'admin',
          source: 'ui', reason: _delReason,
        });
        return json({ ok: true, id, status: 'cancelled' });
      } catch (e: any) {
        return json({ ok: false, error: 'delete_failed', detail: String(e?.message || e) }, 500);
      }
    }


    /* 📅 POST /api/admin/class-schedules/:id  { action:'split', dry_run? } — 2026-10-02 사장님 지시
       매주 수업 한 줄을 날짜별 수업으로 나눈다(수강 종료일까지, 없으면 12주). 그래야 «그날 하루만»
       연기·변경이 된다. 정본은 src/schedule-split.ts. ⛔ dry_run 이 기본이다.
       🔒 본사 전용(enrollAdminHqOnly) — 이 경로는 강사 차단 접두사에 없어 핸들러가 직접 막는다. */
    if (method === 'POST' && /^\/api\/admin\/class-schedules\/\d+$/.test(path)) {
      const id = parseInt(path.split('/').pop() || '0', 10);
      if (!id) return json({ ok: false, error: 'invalid_id' }, 400);
      const deny = await enrollAdminHqOnly(request, env);
      if (deny) return deny;
      const body: any = await request.json().catch(() => ({}));
      /* ↩ (2026-11-04 매니저 Mai «no restore or undo postponement option») { action:'undo_move', from_date } — 날짜를 정해
         연기·변경한 수업을 원래 날짜·시각으로 되돌린다(원래 날짜 «⏸ 연기됨 → 새 날짜» 줄의 「↩ 원래대로」 버튼).
         판정·이동은 정본 src/class-undo-move.ts 한 곳 — 원래 자리는 화면 값이 아니라 서버의 이동 기록에서 찾는다.
         🔒 본사 전용(위 enrollAdminHqOnly) — «연기 취소»(restore)와 같은 선. */
      if (body && body.action === 'undo_move') {
        const actor = await getAdminActor(request, env as any);
        /* ↩ (2026-11-08) held:true — 원래 시각에 «같은 수업» 이 이미 열려 있을 때의 «연기 되돌리기»(정본 class-undo-move.ts undoHeldMove).
           새 수업을 열지 않는다: 옮겨 간 사본(시작 전이면)을 취소하고 원래 날짜의 «옮겨 감» 줄을 정리한다. */
        const result: any = body.held === true
          ? await undoHeldMove(env, actor, id, body.from_date, Date.now())
          : await undoMovedClass(env, actor, id, body.from_date, Date.now(), body.historical_correction === true);
        return json(result, result.status);
      }
      /* ↩ (2026-10-07 매니저 요청 4) { action:'restore' } — 잘못 «수업 종료» 한 수업을 되살린다.
         학생 상세 「🗓️ 종료·연장」이 DELETE(=cancelled) 로 내린 행을 그 자리 그대로 active 로 돌린다.
         ⛔ source 는 안 바꾼다 — DELETE 가 미러 행에 찍은 'c24-mirror:manual' 이 남아야 미러가 그 행을
            «사람 손» 으로 보고 덮지도·두 벌 만들지도 않는다.
         ⛔ 같은 학생·같은 날짜·같은 시각에 이미 살아 있는 수업이 있으면 되살리지 않는다(두 벌 방지).
         ⛔ 지난 날짜는 되살리지 않는다(지난 수업을 «예정» 으로 만들면 결석 감지·급여가 엉킨다). */
      if (body && body.action === 'restore') {
        const actor = await getAdminActor(request, env as any);
        const row: any = await env.DB.prepare(`SELECT * FROM class_schedules WHERE id = ? LIMIT 1`).bind(id).first().catch(() => null);
        if (!row) return json({ ok: false, error: 'not_found' }, 404);
        /* ⏸ (2026-10-29 매니저 «how to undo the postponement») 연기된 회차도 같은 길로 되돌린다 —
           「⏸ 연기됨 — 새 날짜 미정」 줄의 「↩ 연기 취소」 버튼. 원래 날짜·시각 그대로 active 로.
           아래 지난 날짜·중복 확인을 그대로 탄다(연기 사이에 그 자리에 다른 수업이 들어왔을 수 있다). */
        const fromSt = String(row.status || '');
        if (fromSt !== 'cancelled' && fromSt !== 'postponed') return json({ ok: false, error: 'not_cancelled', status: row.status || null }, 409);
        if (fromSt === 'postponed') {
          // Use the same conflict snapshots and atomic audit as an ordinary move.
          // A stale/double restore must never revive a subsequently changed class.
          const result = await moveSchedulesAtomically(env, actor, { ids: [id], patch: {} }, [row], { restorePostponed: true });
          return json(result.ok ? { ...result, id, status: 'active', from: fromSt } : result, result.status);
        }
        const result = await moveSchedulesAtomically(env, actor, { ids: [id], patch: {}, reason: body.reason }, [row], { restoreCancelled: true });
        return json(result.ok ? { ...result, id, status: 'active', from: fromSt } : result, result.status);
      }
      if (!body || body.action !== 'split') return json({ ok: false, error: 'unknown_action' }, 400);
      const dry = body.dry_run !== false;
      const actor = await getAdminActor(request, env as any);
      try {
        /* 📅 (2026-10-08) focus_date — 「오늘 수업·학생 목록·캘린더」 의 연기·변경·취소 창이 매주 수업을
           «그 날 하나만» 다루려고 먼저 나눌 때 보낸다. 응답 focus_id 가 그 날의 날짜 수업 id 다. */
        const r = await runScheduleSplit(env, id, { dry, actor: actor.username || actor.name || 'admin', focusDate: body.focus_date != null ? String(body.focus_date) : null });
        if (!dry && r.cancelled) {
          await writeClassAudit(env, {
            action: 'split', schedule_id: id,
            actor: actor.name || actor.username || '관리자', actor_role: 'admin', source: 'ui',
            detail: JSON.stringify({ from: r.plan.from, until: r.plan.until, made: r.made, existing: r.existing.length, skipped: r.skipped }),
          });
        }
        return json({ ...r, dry_run: dry }, r.ok ? 200 : 409);
      } catch (e: any) {
        return json({ ok: false, error: 'split_failed', detail: String(e?.message || e) }, 500);
      }
    }


    // 🚫 강사 근무불가(휴가·휴식시간) 관리 — 강사 피드백(2026-07-24):
    //   "강사 스케줄/휴식시간 관리를 찾을 수 없다. 휴가일 때 학생이 예약 못 하게 막아야 한다."
    //   등록해두면 위 /api/admin/class-schedules 등록 시 자동으로 막힌다(teacher_unavailable 409).
    const TU_TABLE_SQL = `CREATE TABLE IF NOT EXISTS teacher_unavailability (id INTEGER PRIMARY KEY AUTOINCREMENT, teacher_id TEXT NOT NULL, teacher_name TEXT, kind TEXT NOT NULL DEFAULT 'date_range', start_date TEXT, end_date TEXT, day_of_week INTEGER, start_time TEXT, end_time TEXT, reason TEXT, created_by TEXT, created_at INTEGER NOT NULL)`;


    /* 🧹 LMS·시드 «자리표시» 일괄 정리 — 2026-08-24 사장님 지시
     * ═══════════════════════════════════════════════════════════════════════
     * [무엇인가] class_schedules 활성 행의 대부분은 진짜 수업이 아니라 자리표시다:
     *     · user_id='lms'       — 옛 LMS 점유 (source=lms_import_w26, notes='LMS 수업중')
     *     · user_id='type_seed' — 6월 시연용 시드 (source=type_seed_20260623)
     *   학생이 안 붙어 있어 화면엔 「LMS」·「시드」 배지로만 보인다.
     *
     * [왜 지우나] 2026-08-24 에 먼저 «판정만 바꿔» 그 칸에도 배정할 수 있게 했지만,
     *   칸이 화면에 그대로 남아 실제 운영에서는 달라진 게 없다는 판단(사장님).
     *   → 「실제 데이터가 아니고 지워도 망고아이 데이터에 영향이 없다」는 확인 아래 정리한다.
     *
     * [어떻게 지우나] **status='cancelled'** 로 내린다 — 이 저장소에서 «삭제» 는 이미
     *   그 뜻이다(DELETE /api/admin/class-schedules/:id 가 같은 방식). 화면은 전부
     *   `status='active'` 만 읽으므로 즉시 사라지고, 잘못됐을 때 되돌릴 수 있다.
     *   ⛔ 행을 물리적으로 지우지 않는다 — 개발·운영이 같은 DB라 되돌릴 방법이 없어진다.
     *
     * ⚠️ 학생이 붙어 있는 행은 **절대** 건드리지 않는다. user_id 가 정확히 그 둘일 때만.
     * ⚠️ 강사·지사·대리점은 실행할 수 없다(아래 게이트). 본사만.
     * ℹ️ dry_run=true 면 «몇 건인지» 만 세어 돌려준다 — 화면이 먼저 보여 주고 묻는다.
     * 📜 감사 로그는 **요약 한 줄**만 남긴다(수백 줄을 남기면 이력이 그것으로 덮인다).
     */
    if (method === 'POST' && path === '/api/admin/class-schedules/purge-placeholders') {
      const _pActor = await getAdminActor(request, env as any);
      if (_pActor.isTeacher) return json(forbiddenTeacherBody(_pActor), 403);
      const _pScope = await getScope(env as any, request);
      if (!canEditOrg(_pScope)) return json({ ok: false, error: 'forbidden_scope' }, 403);

      const body: any = await request.json().catch(() => ({}));
      const which = String(body?.which || 'both');
      /* 지울 대상은 «표시자 목록» 으로만 정한다 — 조건을 자유 문자열로 받지 않는다.
         (자유 조건을 받으면 언젠가 진짜 수업까지 지우는 요청이 만들어진다) */
      const UIDS = which === 'lms' ? ['lms'] : which === 'seed' ? ['type_seed'] : ['lms', 'type_seed'];
      const ph = UIDS.map(() => '?').join(',');
      const WHERE = `WHERE LOWER(COALESCE(user_id,'')) IN (${ph})
                       AND (status IS NULL OR status = 'active')`;
      try {
        const cnt: any = await env.DB.prepare(
          `SELECT COUNT(*) AS n,
                  SUM(CASE WHEN LOWER(COALESCE(user_id,'')) = 'lms' THEN 1 ELSE 0 END) AS lms,
                  SUM(CASE WHEN LOWER(COALESCE(user_id,'')) = 'type_seed' THEN 1 ELSE 0 END) AS seed
             FROM class_schedules ${WHERE}`
        ).bind(...UIDS).first();
        const total = Number(cnt?.n || 0);
        if (body?.dry_run) {
          return json({ ok: true, dry_run: true, count: total,
            lms: Number(cnt?.lms || 0), seed: Number(cnt?.seed || 0) });
        }
        if (!total) return json({ ok: true, count: 0, message: '정리할 자리표시가 없습니다.' });

        await env.DB.prepare(
          `UPDATE class_schedules SET status = 'cancelled', updated_at = ? ${WHERE}`
        ).bind(Date.now(), ...UIDS).run();

        await writeClassAudit(env, {
          action: 'remove', schedule_id: null,
          actor: _pActor.name || '관리자', actor_role: 'admin', source: 'ui',
          reason: `LMS·시드 자리표시 일괄 정리 (${which}) — ${total}건`,
        }).catch(() => {});

        return json({ ok: true, count: total,
          lms: Number(cnt?.lms || 0), seed: Number(cnt?.seed || 0), status: 'cancelled' });
      } catch (e: any) {
        return json({ ok: false, error: 'purge_failed', detail: String(e?.message || e) }, 500);
      }
    }


    if (method === 'GET' && path === '/api/admin/teacher-unavailability') {
      try { await env.DB.exec(TU_TABLE_SQL); } catch {}
      const teacherIdQ = (url.searchParams.get('teacher_id') || '').trim();
      try {
        const rs = teacherIdQ
          ? await env.DB.prepare(`SELECT * FROM teacher_unavailability WHERE teacher_id = ? ORDER BY created_at DESC`).bind(teacherIdQ).all<any>()
          : await env.DB.prepare(`SELECT * FROM teacher_unavailability ORDER BY created_at DESC LIMIT 500`).all<any>();
        return json({ ok: true, items: rs.results || [] });
      } catch (e: any) {
        return json({ ok: false, error: 'list_failed', detail: String(e?.message || e) }, 500);
      }
    }


    if (method === 'POST' && path === '/api/admin/teacher-unavailability') {
      try { await env.DB.exec(TU_TABLE_SQL); } catch {}
      const body: any = await request.json().catch(() => ({}));
      const bad = (error: string, ko: string, en: string, code = 400) => json({ ok: false, error, message: ko, message_en: en }, code);

      // 강사 지정 — id 를 직접 주거나(선택), 기존 캘린더 휴가 폼과 같은 UX 로 이름만 입력해도 teachers 테이블에서 매칭.
      let teacherId = String(body.teacher_id || '').trim();
      let teacherName: string | null = body.teacher_name ? String(body.teacher_name).slice(0, 100) : null;
      if (!teacherId && teacherName) {
        try {
          const tName = teacherName.replace(/(선생님?|쌤)$/, '').trim() || teacherName;
          const t = await env.DB.prepare(`SELECT id, name FROM teachers WHERE name = ? OR name LIKE ? LIMIT 1`).bind(teacherName, '%' + tName + '%').first<any>();
          if (t?.id) { teacherId = String(t.id); teacherName = String(t.name); }
        } catch {}
      }
      if (!teacherId) return bad('teacher_required', '강사 명단(teachers)에서 이름을 찾지 못했습니다. 강사 명단에 먼저 등록해 주세요.', 'Could not find this teacher in the teacher list. Add them there first.');
      const kind = body.kind === 'weekly' ? 'weekly' : 'date_range';
      const timeRe = /^\d{1,2}:\d{2}$/;
      const startTime = body.start_time && timeRe.test(String(body.start_time)) ? String(body.start_time) : null;
      const endTime = body.end_time && timeRe.test(String(body.end_time)) ? String(body.end_time) : null;
      if ((startTime && !endTime) || (!startTime && endTime)) return bad('time_range_incomplete', '시작/종료 시간은 둘 다 입력하거나 둘 다 비워주세요(비우면 하루 종일 차단).', 'Enter both start and end time, or leave both empty to block the whole day.');

      if (!teacherName) {
        try { const t = await env.DB.prepare(`SELECT name FROM teachers WHERE id = ? LIMIT 1`).bind(teacherId).first<any>(); if (t?.name) teacherName = String(t.name); } catch {}
      }

      let startDate: string | null = null, endDate: string | null = null, dayOfWeek: number | null = null;
      if (kind === 'date_range') {
        startDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body.start_date || '')) ? String(body.start_date) : null;
        endDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body.end_date || '')) ? String(body.end_date) : startDate;
        if (!startDate) return bad('date_required', '휴가 시작 날짜(YYYY-MM-DD)를 입력해 주세요.', 'Enter a start date (YYYY-MM-DD).');
        if (endDate! < startDate) return bad('date_range_invalid', '종료 날짜가 시작 날짜보다 빠릅니다.', 'End date is before start date.');
      } else {
        const n = Number(body.day_of_week);
        if (!Number.isFinite(n) || n < 0 || n > 6) return bad('day_required', '반복 휴식시간은 요일(0~6)을 지정해 주세요.', 'Pick a weekday (0-6) for the recurring block.');
        dayOfWeek = n;
      }

      const actor = await getAdminActor(request, env as any);
      const now = Date.now();
      try {
        const ins = await env.DB.prepare(
          `INSERT INTO teacher_unavailability (teacher_id, teacher_name, kind, start_date, end_date, day_of_week, start_time, end_time, reason, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`
        ).bind(teacherId, teacherName, kind, startDate, endDate, dayOfWeek, startTime, endTime, body.reason ? String(body.reason).slice(0, 300) : null, actor.name || 'admin', now).run();
        return json({ ok: true, id: (ins?.meta?.last_row_id as number) ?? null });
      } catch (e: any) {
        return json({ ok: false, error: 'insert_failed', detail: String(e?.message || e) }, 500);
      }
    }


    if (method === 'DELETE' && /^\/api\/admin\/teacher-unavailability\/\d+$/.test(path)) {
      const id = parseInt(path.split('/').pop() || '0', 10);
      if (!id) return json({ ok: false, error: 'invalid_id' }, 400);
      try {
        await env.DB.prepare(`DELETE FROM teacher_unavailability WHERE id = ?`).bind(id).run();
        return json({ ok: true, id });
      } catch (e: any) {
        return json({ ok: false, error: 'delete_failed', detail: String(e?.message || e) }, 500);
      }
    }


    if (method === 'PATCH' && path === '/api/admin/class-schedules/move') {
      const body: any = await request.json().catch(() => ({}));
      const actor = await getAdminActor(request, env as any);
      // Time-only moves retain the existing teacher path; reassignment is HQ-only.
      if (actor.isTeacher && (body.patch || body).teacher_id != null) return json(forbiddenTeacherBody(actor, '담당 강사 변경은 강사 권한으로 할 수 없습니다.'), 403);
      if (!body.expected) return json({ ok: false, error: 'schedule_version_required', message: '수업을 새로고침한 뒤 다시 시도해 주세요.' }, 400);
      const result = await moveSchedulesAtomically(env, actor, body);
      return json(result, result.status as any);
    }


    // Read-only replacement preview shares the exact server-side move validator.
    if (method === 'GET' && path === '/api/admin/class-schedules/teacher-options') {
      const ids = Array.from(new Set(String(url.searchParams.get('ids') || '').split(',').filter(x => /^\d+$/.test(x))));
      if (!ids.length || ids.length > 50) return json({ ok: false, error: 'invalid_ids' }, 400);
      try {
        const actor = await getAdminActor(request, env as any);
        const scope: any = await env.DB.prepare(`SELECT scope_type FROM admin_scope WHERE username = ? LIMIT 1`).bind(actor.username).first();
        const deny = teacherMoveDenyReason({ ok: actor.ok, isTeacher: actor.isTeacher, scopeType: scope?.scope_type || null });
        if (deny) return json({ ok: false, ...deny }, deny.status as any);
        const sources: any[] = [];
        for (const id of ids) {
          const row = await env.DB.prepare(`SELECT * FROM class_schedules WHERE id = ? LIMIT 1`).bind(id).first();
          if (!row) return json({ ok: false, error: 'schedule_not_found' }, 404);
          sources.push(row);
        }
        const teachers: any = await env.DB.prepare(`SELECT id, name FROM teachers`).all();
        if (!teachers || teachers.success === false || !Array.isArray(teachers.results)) throw new Error('teacher_lookup_failed');
        const facts = await loadScheduleMoveFacts(env);
        const options: Record<string, any> = {};
        for (const teacher of teachers.results) {
          let blocked: any = null;
          for (const row of sources) {
            blocked = await findScheduleMoveConflicts(env, { ...row, teacher_id: String(teacher.id) }, String(teacher.name || ''), ids, facts);
            if (blocked) break;
          }
          options[String(teacher.id)] = { available: !blocked, error: blocked?.error || null, message: blocked?.message || null };
        }
        return json({ ok: true, options });
      } catch {
        return json({ ok: false, error: 'availability_check_failed', message: '강사 가능 시간을 확인하지 못했습니다. 다시 시도해 주세요.' }, 503);
      }
    }


    // 🥭 Phase WS — PATCH/PUT /api/admin/class-schedules/:id (드래그 이동: 요일/시간/지속/날짜 수정)
    //   body: { day_of_week?, start_time?('HH:MM'), duration_min?, scheduled_date?('YYYY-MM-DD') }
    //   허용된 필드만 동적으로 UPDATE → 캘린더 드래그앤드롭 영구 저장에 사용.
    if ((method === 'PATCH' || method === 'PUT') && /^\/api\/admin\/class-schedules\/\d+$/.test(path)) {
      const id = parseInt(path.split('/').pop() || '0', 10);
      if (!id) return json({ ok: false, error: 'invalid_id' }, 400);
      const body: any = await request.json().catch(() => ({}));
      // 요일 표기 정규화(월/Mon/monday → 'Mon' …)
      const normDow = (v: string): string => {
        const k = String(v || '').trim().toLowerCase();
        const map: Record<string, string> = {
          'mon': 'Mon', 'monday': 'Mon', '월': 'Mon', '월요일': 'Mon',
          'tue': 'Tue', 'tuesday': 'Tue', '화': 'Tue', '화요일': 'Tue',
          'wed': 'Wed', 'wednesday': 'Wed', '수': 'Wed', '수요일': 'Wed',
          'thu': 'Thu', 'thursday': 'Thu', '목': 'Thu', '목요일': 'Thu',
          'fri': 'Fri', 'friday': 'Fri', '금': 'Fri', '금요일': 'Fri',
          'sat': 'Sat', 'saturday': 'Sat', '토': 'Sat', '토요일': 'Sat',
          'sun': 'Sun', 'sunday': 'Sun', '일': 'Sun', '일요일': 'Sun',
        };
        return map[k] || '';
      };
      const sets: string[] = [];
      const binds: any[] = [];
      if (body.day_of_week != null) {
        const d = normDow(body.day_of_week);
        if (d) { sets.push('day_of_week = ?'); binds.push(d); }
      }
      if (body.start_time != null && /^\d{1,2}:\d{2}$/.test(String(body.start_time))) {
        sets.push('start_time = ?'); binds.push(String(body.start_time));
      }
      if (body.duration_min != null && Number.isFinite(Number(body.duration_min))) {
        sets.push('duration_min = ?'); binds.push(Number(body.duration_min));
      }
      if (body.scheduled_date != null && /^\d{4}-\d{2}-\d{2}$/.test(String(body.scheduled_date))) {
        sets.push('scheduled_date = ?'); binds.push(String(body.scheduled_date));
      }
      // 📜 이동 전 정보(이력용) + 행위자 — 담당 강사 가드가 이 둘을 쓰므로 sets 검사보다 «앞» 이다.
      const _pchActor = await getAdminActor(request, env as any);
      let _pchRow: any;
      try { _pchRow = await env.DB.prepare(`SELECT * FROM class_schedules WHERE id = ? LIMIT 1`).bind(id).first(); }
      catch { return json({ ok: false, error: 'schedule_read_failed', message: '수업 정보를 읽지 못했습니다. 잠시 후 다시 시도해 주세요.' }, 503); }
      if (!_pchRow) return json({ ok: false, error: 'schedule_not_found', message: '수업을 찾을 수 없습니다.' }, 404);
      // Reject malformed input rather than silently applying only the other fields.
      if (body.start_time != null && !/^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(String(body.start_time))
        || body.duration_min != null && (!Number.isInteger(Number(body.duration_min)) || Number(body.duration_min) <= 0 || Number(body.duration_min) > 240)
        || body.day_of_week != null && !normDow(body.day_of_week)
        || body.scheduled_date != null && (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.scheduled_date))
          || !Number.isFinite(Date.parse(String(body.scheduled_date) + 'T00:00:00Z'))
          || new Date(String(body.scheduled_date) + 'T00:00:00Z').toISOString().slice(0, 10) !== String(body.scheduled_date))) {
        return json({ ok: false, error: 'invalid_schedule', message: '수업 날짜·시간·길이를 확인해 주세요.' }, 400);
      }

      /* 🧑‍🏫 (2026-09-11) 담당 강사 변경 — 드래그로 «다른 강사 열» 에 놓았을 때.
       *
       *  [왜 생겼나] 주간 전체 스케줄(admin/weekly-schedule.html)의 드래그는 확인 모달에
       *  「⚡ 담당 교사도 함께 변경됩니다」라고 **약속하고 「✅ 이동됨」까지 띄웠지만**,
       *  하는 일은 메모리 객체 한 줄(SLOTS[key]=slot)이 전부였다 — 서버에 요청이 한 건도
       *  나가지 않아 새로고침하면 조용히 되돌아갔다. 2026-09-11 실사고: 사장님이 정우영
       *  학생의 금 14:20 수업을 강선생님 → MAIMAI 로 옮기셨는데 홈 화면은 계속 강선생님을
       *  가리켰다(class_schedules 2332 의 teacher_id 는 '29' 그대로였다).
       *  같은 병의 형제가 이 저장소에 이미 둘 있다 — 「화면에서 수업을 잡았는데 학생은
       *  «오늘 수업 없음»」(2026-08-24)·「직원을 등록했는데 로그인이 안 돼요」(2026-08-18).
       *
       *  🔒 [왜 여기만 게이트가 더 센가] 이 PATCH 는 TEACHER_BLOCKED_PREFIXES 에 없어서
       *     **강사도 부를 수 있다.** 요일·시각 이동은 그대로 두더라도 «담당 강사» 는
       *     다르다 — 수업이 곧 급여라(no-show-truth.ts·payroll) 강사가 남의 수업을
       *     자기에게 가져오거나 남에게 떠넘길 수 있다. CLAUDE.md 가 «수업 강사 변경» 을
       *     되돌릴 수 없는 조작의 예로 직접 들고 있다.
       *  ⛔ canEditOrg() 로 막으면 안 된다 — 그 함수는 scope 'none'(내부직원·**교사**)에도
       *     true 라 강사를 못 막는다(CLAUDE.md 2장 「본사 전용으로 막았는데 강사가 그대로
       *     실행됨」). 그래서 enrollAdminHqOnly 와 «같은 모양» 으로 판정한다.
       *  🔴 «모른다» 를 «본사» 로 읽지 않는다 — getAdminActor 는 스코프를 못 구해도
       *     scopeType='none' → resolveRole 이 'staff'(본사 동급)로 떨어뜨린다. 그래서
       *     근거(admin_scope.scope_type)를 **삼키지 않고 한 번 더 읽고, 못 읽으면 막는다.**
       *  ⚠️ 판정을 복제하지 않는다 — «조직인가» 는 정본 isOrgScopedRole() 이 답한다.
       *     (enroll-ops.ts 의 enrollAdminHqOnly 는 그 파일 밖으로 내보내지 않는 비공개
       *      함수다 — 같은 판정을 여기 옆에 두는 것이 이 저장소의 방식이다.
       *      NOT_PLACEHOLDER 가 다섯 파일에 복제돼 있는 것과 같은 사정.)
       *  ℹ️ 강사를 «안 바꾸는» 요청(요일·시각만)은 이 블록을 통째로 비켜 간다 — 기존
       *     드래그 이동의 권한은 한 톨도 좁히지 않았다. */
      /* 🗓 반복 수업에 날짜를 박으면 «매주» 가 죽는다 — 정본 moveFieldConflict 가 판정한다.
         화면(weekly-schedule.html)이 서버의 move_field 를 그대로 쓰므로 정상 경로에서는
         닿지 않지만, 옛 캐시 화면·다른 호출자를 위한 2차 방어다. */
      {
        const _mfDeny = moveFieldConflict(_pchRow, body);
        if (_mfDeny) return json({ ok: false, error: _mfDeny.error, message: _mfDeny.message }, _mfDeny.status as any);
      }

      let _tchFrom: string | null = null;      // 감사 이력용 — ⛔ body 에 끼워 넣지 말 것(아래 주석)
      let _tchToName: string | null = null;
      if (body.teacher_id != null && String(body.teacher_id).trim() !== '') {
        const _tid = String(body.teacher_id).trim();
        if (!/^\d+$/.test(_tid)) {
          return json({ ok: false, error: 'invalid_teacher_id', message: '담당 강사 번호가 올바르지 않습니다.' }, 400);
        }
        const _cur = String(_pchRow?.teacher_id ?? '').trim();
        if (_cur !== _tid) {                       // 같은 강사면 바꿀 것이 없다 — 게이트도 안 탄다
          /* 🪞 행을 못 읽었으면 «담당 강사» 는 바꾸지 않는다. 그 행이 카페24 미러가 만든 것이면
             아래 「사람 손이 이긴다」 도장(source='c24-mirror:manual')이 함께 빠지고, 미러의
             UPDATE 가 teacher_id 를 통째로 되돌린다(c24-mirror.ts) — 즉 「옮겼는데 밤에
             되돌아감」이 급여까지 끌고 간다. 요일·시각만 바꾸는 요청은 예전대로 통과한다. */
          if (!_pchRow) {
            return json({ ok: false, error: 'schedule_read_failed', message: '수업 정보를 읽지 못해 담당 강사를 바꾸지 않았습니다. 잠시 후 다시 시도해 주세요.' }, 503);
          }
          let _scopeType: string | null = null;
          try {
            const _sr: any = await env.DB.prepare(
              `SELECT scope_type FROM admin_scope WHERE username = ? LIMIT 1`
            ).bind(_pchActor.username).first();
            const _st = _sr ? String(_sr.scope_type ?? '').trim() : '';
            _scopeType = _st || null;              // 행이 없거나 칸이 비면 «모름»
          } catch (e: any) {
            console.warn('[class-schedules] teacher move scope:', e?.message);
            _scopeType = null;
          }
          /* 🔒 판정 정본은 src/class-teacher-move.ts 하나다 — 라우트 안에 조건을 늘어놓으면
             하니스가 «그 글자가 있는가» 로만 보게 되고, 조건을 뒤집어도 통과한다(실측). */
          const _deny = teacherMoveDenyReason({ ok: _pchActor.ok, isTeacher: _pchActor.isTeacher, scopeType: _scopeType });
          if (_deny) return json(
            _deny.error === 'forbidden_teacher'
              ? forbiddenTeacherBody(_pchActor, _deny.message)
              : { ok: false, error: _deny.error, message: _deny.message },
            _deny.status as any);

          /* 🆔 실재하는 강사인가 — 없는 번호를 넣으면 그 수업은 «강사가 누구인지 모르는» 행이
             되고, 화면·급여·노쇼 판정이 전부 이름을 못 붙인다. 모르면 안 바꾼다.
             ⚠️ class_schedules.teacher_id 는 teachers.id 도메인이다(카페24 강사번호가 아니다
                — CLAUDE.md 2장 「강사 번호가 세 벌」). 화면 목록도 /api/admin/teachers 의 id 다. */
          let _trow: any;
          try { _trow = await env.DB.prepare(
            `SELECT CAST(id AS TEXT) AS tid, name FROM teachers WHERE CAST(id AS TEXT) = ? LIMIT 1`
          ).bind(_tid).first(); }
          catch { return json({ ok: false, error: 'teacher_lookup_failed', message: '강사 정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.' }, 503); }
          if (!_trow) {
            return json({ ok: false, error: 'teacher_not_found', message: '그 번호의 강사를 찾을 수 없습니다.' }, 400);
          }
          // Validate the effective destination, not just the unchanged source time.
          // force=true is intentionally not an override for an unsafe reassignment.
          try {
            const destination = { ..._pchRow, teacher_id: _tid,
              ...(body.scheduled_date != null ? { scheduled_date: String(body.scheduled_date) } : {}),
              ...(body.day_of_week != null ? { day_of_week: normDow(body.day_of_week) } : {}),
              ...(body.start_time != null ? { start_time: String(body.start_time) } : {}),
              ...(body.duration_min != null ? { duration_min: Number(body.duration_min) } : {}) };
            const conflict = await findScheduleMoveConflicts(env, destination, String(_trow.name || ''));
            if (conflict) return json({ ok: false, ...conflict }, conflict.status as any);
          } catch {
            return json({ ok: false, error: 'availability_check_failed', message: '강사의 수업·휴가 정보를 확인하지 못해 변경하지 않았습니다. 잠시 후 다시 시도해 주세요.' }, 503);
          }
          sets.push('teacher_id = ?'); binds.push(_tid);
          /* ⛔ 상태를 `body` 에 끼워 넘기지 말 것 — body 는 request.json() 이라 클라이언트가
             그 칸을 그대로 보낼 수 있다. 강사 변경이 없어도 감사 이력(class_audit_log)에
             거짓 줄을 남길 수 있고, 이 PATCH 는 강사도 부를 수 있어 «급여 근거» 가 오염된다.
             (2026-09-11 함정 대조 지적) */
          _tchFrom = _pchRow?.teacher_id ?? null;
          _tchToName = _trow.name || _tid;
        }
      }

      if (!sets.length) return json({ ok: false, error: 'no_valid_fields' }, 400);
      /* 🪞 (2026-08-31) 「사람 손이 이긴다」 도장 — 사장님 결정.
         카페24 미러가 만든 행(source='c24-mirror')을 사람이 고치면 그 자리에서
         'c24-mirror:manual' 로 바꾼다. 그 뒤로 미러는 그 행을 **영영 안 건드린다**
         (c24-mirror.ts 의 UPDATE 가 WHERE source='c24-mirror' 라 0행이 된다).
         ⛔ 도장을 나중에 «따로» 찍는 방식으로 바꾸지 말 것 — 그 사이에 야간 미러가 돌면
            사람이 고친 값이 카페24 값으로 되돌아간다. 같은 UPDATE 안에서 찍어야 한다. */
      if (_pchRow && String(_pchRow.source || '') === MIRROR_SOURCE) {
        sets.push('source = ?'); binds.push(MIRROR_SOURCE_MANUAL);
      }
      /* ⏸ (2026-10-01) 연기했던 회차를 새 날짜·시각으로 «다시 잡으면» 열린 수업으로 되돌린다 —
         안 되돌리면 옮긴 자리에서도 'postponed' 라 오늘 수업·학생 입장에서 숨는다(class-postponed.ts).
         ⛔ 강사만 바꾸는 요청에는 손대지 않는다(다시 잡은 것이 아니다). */
      if (isPostponedOccurrence(_pchRow) && sets.some((x) => x.startsWith('scheduled_date') || x.startsWith('start_time'))) {
        sets.push(`status = 'active'`);
      }
      sets.push('updated_at = ?'); binds.push(Date.now());
      binds.push(id);
      // Legacy single-row PATCH/PUT shares the same transactional write/validation path.
      const validatedPatch: any = {};
      sets.forEach((set, i) => {
        const field = /^(teacher_id|scheduled_date|day_of_week|start_time|duration_min) = \?$/.exec(set);
        if (field) validatedPatch[field[1]] = binds[i];
      });
      const result = await moveSchedulesAtomically(env, _pchActor, { ids: [id], patch: validatedPatch, expected: body.expected }, [_pchRow]);
      return json({ ...result, id, ...(result.ok ? { updated_fields: sets.length - 1 } : {}) }, result.status as any);

    }
  return null;
}
