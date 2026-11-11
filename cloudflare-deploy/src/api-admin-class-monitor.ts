/** class-monitor: extracted administrator domain routes. Caller authentication and route order are preserved. */
import type { MangoEnv } from './api-mango';
import { admDowMatches, normTeacherName, loadHolidayExemptNames, loadCafe24TeacherMap } from './admin-teacher-core';
import { json } from './api-util';
import { forbiddenTeacherBody } from './forbidden-teacher';
import { selectInChunks } from './d1-chunk';
import { getScope, scopeStudentCond } from './scope';
import { buildMangoiClassesNow, mergeClassesNow, dropHolidayClosed, cafe24HolidayTeacher, classesNowScanDates, liveOverlaps } from './classes-now';
import { findRoomMismatches } from './room-mismatch';
import { getAdminActor } from './auth-admin';
import { kstYmd, applyRoomOverrides } from './class-room-override';
import { ensureStartsOnColumn, startsOnSel } from './class-start-date';
import { isPostponedOccurrence } from './class-postponed';
import { loadHolidayClosure, type HolidayClosure } from './holiday-closure';

export async function handleAdminClassMonitorApi(request: Request, url: URL, env: MangoEnv): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;


    /* 👥 GET /api/admin/live-classes?rooms=a,b,c   (2026-08-19 Melca 8/19 제보 ①·2-①)
       ═══════════════════════════════════════════════════════════════════════════
       「지금 진행 중인 수업」 목록에 **누구 수업인지**가 없었다. 화면에 뜨는 것은
       방 번호와 인원수뿐이라(`meet-123 · 2 participants`) 급히 참관해야 할 때
       어느 수업인지 알 수 없었다.

       [왜 별도 엔드포인트인가] 방 목록 자체는 `/api/active-rooms` 가 이미 준다.
          그 핸들러는 index.ts 에 있고 KV 정리·반환순서 같은 미묘한 동작을 가지고 있다
          (CLAUDE.md 4-2 공동 금지구역). **거기는 건드리지 않고**, 이미 받은 방 번호를
          받아 «이름만 붙여» 돌려주는 창구를 따로 둔다. 화면은 두 번 부르지만 이쪽은 작다.

       [방 번호 → 수업] room_id 는 `class-{예약id}-{YYYYMMDD}` 로 결정론적이다
          (api-mango.ts·absent-sweep.ts 와 같은 규칙). 그 규칙에 안 맞는 방
          (임시 회의방 `meet-123` 등)은 **비워서** 돌려준다 — 추측하지 않는다.

       🔴 강사 이름 — 번호가 세 벌인 함정을 여기서 다시 밟지 않는다.
          class_schedules.teacher_id 는 **원부번호**(teachers.id, 1~29)다.
          카페24 강사번호(9~196)를 여기 넣던 사고는 schedule-seed 쪽에서 이미 고쳐
          (loadCafe24TeacherMap 을 거쳐 원부번호로 변환해 넣는다) 지금은 이 칸이
          일관되게 원부번호다 → `LEFT JOIN teachers` 가 맞다.
          ⛔ attendance.teacher_name 은 여기서도 쓰지 않는다(남의 이름이 들어 있다).

       🔒 지사·대리점 격리 — 이 화면(manager.html)은 지사·대리점도 쓴다.
          자기 범위 밖 수업의 **학생 이름을 보여 주면 개인정보가 샌다.**
          scopeStudentCond 로 잘라, 범위 밖이면 이름 없이 «해당 없음» 으로만 답한다. */
    if (method === 'GET' && path === '/api/admin/live-classes') {
      const raw = String(url.searchParams.get('rooms') || '').trim();
      if (!raw) return json({ ok: true, rooms: {} });
      // 한 번에 200개까지 — 방이 그보다 많을 일은 없고, 넘으면 조용히 자르지 않고 자른 사실을 알린다
      const MAX_ROOMS = 200;
      const all = raw.split(',').map(x => x.trim()).filter(Boolean);
      const roomIds = all.slice(0, MAX_ROOMS);

      // class-{id}-{YYYYMMDD} 만 해석한다. 나머지는 «수업 방이 아님» 으로 그대로 둔다.
      const byScheduleId = new Map<string, string[]>();   // 예약id → [roomId,...]
      for (const rid of roomIds) {
        const m = rid.match(/^class-(\d+)-(\d{8})$/);
        if (!m) continue;
        const sid = m[1];
        if (!byScheduleId.has(sid)) byScheduleId.set(sid, []);
        byScheduleId.get(sid)!.push(rid);
      }

      const out: Record<string, any> = {};
      for (const rid of roomIds) out[rid] = null;         // 못 찾으면 null — 화면이 «미상» 으로 그린다

      const ids = [...byScheduleId.keys()];
      if (ids.length) {
        const sc = await getScope(env as any, request);
        const stuCond = scopeStudentCond(sc, 'se');
        try {
          const rows = await selectInChunks<any>(
            env.DB, ids,
            (ph) => `SELECT cs.id, cs.student_name, cs.user_id, cs.start_time, cs.duration_min,
                            cs.class_type, cs.teacher_id,
                            t.name  AS teacher_name,
                            se.korean_name AS stu_ko, se.english_name AS stu_en
                       FROM class_schedules cs
                       LEFT JOIN teachers t ON CAST(t.id AS TEXT) = CAST(cs.teacher_id AS TEXT)
                       LEFT JOIN students_erp se ON se.user_id = cs.user_id
                      WHERE CAST(cs.id AS TEXT) IN (${ph})
                        ${stuCond.cond ? `AND (${stuCond.cond})` : ''}`,
            { tail: stuCond.binds, swallowErrors: true },
          );
          for (const r of rows) {
            const rids = byScheduleId.get(String(r.id)) || [];
            for (const rid of rids) {
              out[rid] = {
                schedule_id: Number(r.id),
                // 이름은 명부(students_erp) 를 먼저 — class_schedules.student_name 은 옛 스냅샷일 수 있다
                student_name: r.stu_ko || r.student_name || r.stu_en || null,
                student_name_en: r.stu_en || null,
                // 못 이었으면 **비운다.** 모르는 것보다 틀린 이름이 나쁘다.
                teacher_name: r.teacher_name || null,
                start_time: r.start_time || null,
                duration_min: Number(r.duration_min) || null,
                class_type: r.class_type || null,
              };
            }
          }
        } catch (e: any) {
          return json({ ok: false, error: 'live_classes_failed', detail: String(e?.message || e) }, 500);
        }
      }
      return json({
        ok: true, rooms: out,
        ...(all.length > roomIds.length ? { truncated: all.length - roomIds.length } : {}),
      });
    }


    /* 🔴 GET /api/admin/classes-now   (2026-08-20 사장님 「지금 수업이 없어?」)
       ═══════════════════════════════════════════════════════════════════════════
       [무엇이 문제였나] 관리자 「🔴 실시간 수업 현황」 표는 **망고아이 화상방에 지금
          붙어 있는 사람**만 센다(`/api/active-rooms` → KV + Durable Object). 그런데
          카페24 예약 수업은 그 방을 거치지 않는다 — 실측(2026-08-20): `c24-*` 방에
          실접속(`last_seen_at > 0`)이 남은 행은 **전 기간 0건**이다.
          그래서 수업 4건이 진행 중이던 15:08 에도 화면은 «지금 진행 중인 수업이
          없습니다» 라고 말했다. 같은 사실인데 «오늘 한가하다» 로 읽힌다.

       [여기서 하는 일] «예약 기준으로 지금 진행 중이어야 할 수업» 을 돌려준다.
          화면은 이것을 «방에 붙어 있는 사람» 과 나란히 그려서
          「수업 4건 · 화상방 접속 0건」 으로 보여 준다.

       [접속 여부를 어떻게 아나] 같은 학생의 **실접속 행**(`last_seen_at > 0`)이 그 수업
          시간과 겹치는지로만 판정한다.
          ⛔ 방 번호로 잇지 않는다 — 카페24 방(`c24-…`)과 망고아이 방
             (`class-{예약id}-{YYYYMMDD}`)은 번호 체계가 아예 다르다.
          ⛔ 이름이 비슷하다고 잇지 않는다. `user_id` 완전일치, 아니면 학생 이름
             완전일치(공백·대소문자만 정규화)뿐이고 후보가 둘 이상이면 잇지 않는다.
          ✅ 못 이으면 `connected:false` 로 둔다. 화면 문구도 «미접속» 이 아니라
             **«접속 기록 없음»** 이다 — 우리가 아는 것은 딱 그만큼이다.

       🔴 강사 이름 — `attendance.teacher_name` 은 **읽지 않는다.** 옛 동기화가 카페24
          강사번호를 원부번호로 오인해 넣은 **남의 이름**이 섞여 있다(CLAUDE.md 2장,
          카페24 24 = Teacher Mariane 인데 HANNAH 로 적힌 행이 실재한다).
          번호(`teacher_uid`) → `loadCafe24TeacherMap()` 으로 매번 다시 찾고,
          못 찾으면 **비운다**(화면은 «미상»).

       🔒 지사·대리점 격리 — 학생 이름이 나가므로 `scopeStudentCond()` 로 자른다.
          범위 밖 수업은 목록에서 **빼고 건수에도 넣지 않는다**(건수만으로도 남의 지사
          규모가 새기 때문). 🔒 강사에게는 닫는다 — 전사 학생 이름이 한 화면에 모인다
          (`index.ts` 의 `TEACHER_BLOCKED_PREFIXES` 에도 함께 등록했다. 이중 방어).

       ⛔ SELECT 만 한다. 이 API 는 아무것도 고치지 않는다. */
    if (method === 'GET' && path === '/api/admin/classes-now') {
      const _actor = await getAdminActor(request, env as any);
      if (_actor.isTeacher) return json(forbiddenTeacherBody(_actor), 403);

      const now = Date.now();
      const AHEAD_MS = 15 * 60 * 1000;        // 곧 시작(15분 앞)까지 함께 보여 준다
      const GRACE_MS = 5 * 60 * 1000;         // 끝난 직후 5분은 «방금 끝남» 으로 남긴다
      const SCAN_MS = 6 * 60 * 60 * 1000;     // joined_at 인덱스 구간 — 6시간 넘는 수업은 없다
      const DEFAULT_LEN_MS = 30 * 60 * 1000;  // 끝시각이 없는 행의 길이 가정
      const kstHM = (ms: number) => new Date(ms + 9 * 3600 * 1000).toISOString().slice(11, 16);

      try {
        const sc = await getScope(env as any, request);
        const stu = scopeStudentCond(sc, 'se');
        /* 예약(카페24) 행. 학생 이름을 명부에서 가져오면서 같은 조인으로 스코프를 자른다 —
           명부에 없는 학생은 «범위를 확인할 수 없음» 이므로 지사·대리점에게는 안 보인다. */
        const rs: any = await env.DB.prepare(
          `SELECT a.room_id, a.user_id, a.username, a.status, a.joined_at, a.left_at, a.teacher_uid,
                  se.korean_name AS stu_ko, se.english_name AS stu_en
             FROM attendance a
             LEFT JOIN students_erp se ON se.user_id = a.user_id
            WHERE a.room_id LIKE 'c24-%'
              AND a.joined_at >= ? AND a.joined_at <= ?
              AND COALESCE(a.left_at, a.joined_at + ?) >= ?
              ${stu.cond ? `AND (${stu.cond})` : ''}
            ORDER BY a.joined_at ASC LIMIT 200`
        ).bind(now - SCAN_MS, now + AHEAD_MS, DEFAULT_LEN_MS, now - GRACE_MS, ...stu.binds).all();
        const rows = ((rs.results || []) as any[]);

        /* 실접속 행 — 오늘 «정말로 화상방에 붙은» 사람. 하루 수십 건이라 통째로 읽어도 가볍다.
           (`last_seen_at > 0` 이 카페24 씨앗과 실접속을 가르는 유일하게 확실한 표시다) */
        const liveRows = await (async () => {
          /* 🚨 (2026-10-07) account_uid 도 함께 뽑는다 — «서로 다른 방» 감시가 학생 «계정» 으로 잇는다
             (user_id 는 기기 임시번호). 그 칸이 없는 옛 DB 에서는 예전 SELECT 로 떨어진다. */
          const q = (cols: string) => env.DB.prepare(
            `SELECT ${cols}
               FROM attendance
              WHERE joined_at >= ? AND last_seen_at IS NOT NULL AND last_seen_at > 0
              LIMIT 500`
          ).bind(now - SCAN_MS - AHEAD_MS).all();
          try { const r: any = await q('user_id, username, account_uid, room_id, joined_at, left_at, last_seen_at'); return (r.results || []) as any[]; }
          catch {
            try { const r: any = await q('user_id, username, room_id, joined_at, left_at, last_seen_at'); return (r.results || []) as any[]; }
            catch { return [] as any[]; }
          }
        })();
        const normName = (v: any) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
        // 이름 → 실접속 행. 같은 이름이 둘 이상이면 «누구인지 모름» 이므로 잇지 않는다.
        const liveByName = new Map<string, any | null>();
        for (const lr of liveRows) {
          const k = normName(lr.username);
          if (!k) continue;
          liveByName.set(k, liveByName.has(k) ? null : lr);
        }

        const tmap = await loadCafe24TeacherMap(env as any, rows.map(r => r.teacher_uid));

        const overlaps = (lr: any, start: number, end: number) => liveOverlaps(lr, start, end, GRACE_MS);

        /* ── ① 카페24 예약 수업 (attendance 의 `c24-{class_id}` 씨앗) ───────────────── */
        const c24Classes = rows.map(r => {
          const start = Number(r.joined_at) || 0;
          const end = Number(r.left_at) || (start + DEFAULT_LEN_MS);
          const student = r.stu_ko || r.username || r.stu_en || null;
          // 접속 대조 — ① 계정 완전일치 ② 이름 완전일치(유일할 때만). 겹치는 시간대만 인정한다.
          let hit: any = null;
          for (const lr of liveRows) {
            if (String(lr.user_id || '') === String(r.user_id || '') && overlaps(lr, start, end)) { hit = lr; break; }
          }
          if (!hit && student) {
            const cand = liveByName.get(normName(student));
            if (cand && overlaps(cand, start, end)) hit = cand;
          }
          return {
            room_id: r.room_id,
            start_kst: kstHM(start), end_kst: kstHM(end),
            start_ms: start, end_ms: end,
            student_name: student,
            // 못 이었으면 비운다 — 모르는 것보다 틀린 이름이 나쁘다
            teacher_name: (tmap.get(String(r.teacher_uid || '')) || {}).name || null,
            cafe24_status: r.status || null,
            phase: (start > now ? 'soon' : (end < now ? 'ended' : 'now')) as 'soon' | 'now' | 'ended',
            connected: !!hit,
            live_room: hit ? String(hit.room_id || '') : null,
            /* 🏷 카페24 수업은 망고아이 방을 안 거친다 → 참관할 «방» 자체가 없다. */
            source: 'cafe24' as const,
            observable: false,
            schedule_id: null,
          };
        });

        /* ── ② 망고아이 예약 수업 (class_schedules) ──────────────────────────────────
           (2026-09-01 사장님 「수강신청 수업도 같이 뜨게 고쳐줘」)
           판정 정본은 `src/classes-now.ts` — 요일 표기·자정 넘김·미러 중복처럼
           **문자열 검사로는 안 보이는** 것들이라, 하니스가 실제로 돌려 볼 수 있게 뺐다.
           🔒 스코프(지사·대리점)와 강사 차단은 ①과 같은 것을 그대로 쓴다. */
        const scanDates = classesNowScanDates({ now, graceMs: GRACE_MS, aheadMs: AHEAD_MS });

        let schedRows: any[] = [];
        try {
          const _soSelCn = startsOnSel(await ensureStartsOnColumn(env), 'cs');
          const rs2: any = await env.DB.prepare(
            `SELECT cs.id, cs.user_id, cs.student_name, cs.class_type, cs.source, cs.notes,
                    cs.day_of_week, cs.scheduled_date, cs.start_time, cs.duration_min, cs.status, cs.teacher_id${_soSelCn},
                    t.name AS t_name, se.korean_name AS stu_ko, se.english_name AS stu_en
               FROM class_schedules cs
               LEFT JOIN teachers t ON CAST(t.id AS TEXT) = CAST(cs.teacher_id AS TEXT)
               LEFT JOIN students_erp se ON se.user_id = cs.user_id
              WHERE COALESCE(cs.status,'active') != 'cancelled'
                ${stu.cond ? `AND (${stu.cond})` : ''}`
          ).bind(...stu.binds).all();
          // ⏸ (2026-10-01) 연기된 회차는 «지금 수업» 이 아니다 — 참관할 방에 아무도 안 온다(class-postponed.ts)
          schedRows = ((rs2.results || []) as any[]).filter((r: any) => !isPostponedOccurrence(r));
        } catch (e: any) { console.warn('[classes-now] mangoi rows:', e?.message); }

        /* 🔄 그 날짜의 1회성 대체강사 — recurring 행의 teacher_id 는 원래 강사 그대로라
           화면에 보일 이름만 여기서 덮는다(`classes/today` 와 같은 방식).
           표가 없거나 조회가 깨져도 목록은 그대로 뜬다(이름만 원래 강사). */
        const subBy = new Map<string, string | null>();
        try {
          const ph = scanDates.map(() => '?').join(',');
          const sr: any = await env.DB.prepare(
            `SELECT cs2.sub_date, cs2.schedule_id, t2.name AS sub_name
               FROM class_substitutions cs2
               LEFT JOIN teachers t2 ON CAST(t2.id AS TEXT) = CAST(cs2.substitute_teacher_id AS TEXT)
              WHERE cs2.sub_date IN (${ph}) AND cs2.status = 'active'`
          ).bind(...scanDates).all();
          for (const r of ((sr?.results as any[]) || [])) subBy.set(`${r.sub_date}|${r.schedule_id}`, r.sub_name || null);
        } catch (e: any) { console.warn('[classes-now] substitution overlay:', e?.message); }

        const mgClasses = buildMangoiClassesNow(schedRows, { now, graceMs: GRACE_MS, aheadMs: AHEAD_MS }, {
          dowMatches: admDowMatches,
          subName: (d, id) => subBy.has(`${d}|${id}`) ? (subBy.get(`${d}|${id}`) ?? null) : undefined,
          liveRows,
        });

        // Resolve the same date-specific room as student/teacher schedule projections.
        // Use each occurrence's KST date, including yesterday/tomorrow near midnight.
        for (const ymd of new Set(mgClasses.map(c => kstYmd(c.start_ms)))) {
          await applyRoomOverrides(env.DB, mgClasses.filter(c => kstYmd(c.start_ms) === ymd), ymd);
        }
        // Presence belongs to the resolved room, never the original class-* room.
        for (const c of mgClasses) {
          const hit = liveRows.find(lr => String(lr.room_id || '') === c.room_id && overlaps(lr, c.start_ms, c.end_ms));
          c.connected = !!hit;
          c.live_room = hit ? String(hit.room_id || '') : null;
        }

        /* 🎌 (2026-10-09) 공휴일 휴강 — 그날 열리지 않는 망고아이 수업은 «지금 수업» 이 아니다.
           ⚠️ «합친 뒤» 에 뺀다: 먼저 빼면 그 수업의 카페24 짝(c24-<번호>)이 미러 짝을 잃고 되살아난다.
           카페24에만 있는 줄은 강사 번호 체계가 달라 예외(중국어)를 가릴 수 없어 그대로 둔다. */
        const _holBy: Record<string, HolidayClosure> = {};
        for (const d of scanDates) _holBy[d] = await loadHolidayClosure(env.DB, d);
        const _tOf = new Map<number, any>();
        for (const r of schedRows) _tOf.set(Number(r.id), r.teacher_id);
        /* 카페24 줄: 카페24 강사번호 → 원부 번호(loadCafe24TeacherMap — 이름이 유일하게 맞을 때만).
           못 이으면 이름으로 «중국어 강사인가» 만 한 번 더 본다(예외 강사 원부 이름 정확일치 · 「중국어」·chinese 포함).
           그래도 모르면 «예외 아님» = 휴강(망고아이의 «강사 미배정 = 휴강» 과 같은 규칙). */
        const _c24Tid = new Map<string, any>();
        if (Object.values(_holBy).some(h => h && h.closed)) {
          const _exNames = await loadHolidayExemptNames(env, Object.values(_holBy));
          for (const r of rows) {
            _c24Tid.set(String(r.room_id), cafe24HolidayTeacher(tmap.get(String(r.teacher_uid || '')), _exNames, normTeacherName));
          }
        }
        const _hol = dropHolidayClosed(mergeClassesNow(c24Classes as any, mgClasses),
          (c: any) => c.source === 'cafe24' ? _c24Tid.get(String(c.room_id)) : _tOf.get(Number(c.schedule_id)), _holBy);
        const classes = _hol.kept;
        const _mgOpen = mgClasses.filter(c => classes.indexOf(c) >= 0);

        /* 🚨 (2026-10-07) «같은 수업인데 서로 다른 방» — 학생은 다른 방에, 예약방에는 누군가 접속 중.
           판정 정본 src/room-mismatch.ts. 실패해도 목록은 그대로 뜬다(빈 배열). */
        let roomMismatch: any[] = [];
        try {
          const infoBySched = new Map<number, { uid: string; source: any }>();
          for (const r of schedRows) infoBySched.set(Number(r.id), { uid: String(r.user_id || ''), source: r.source });
          roomMismatch = findRoomMismatches(_mgOpen as any, liveRows, (id) => infoBySched.get(id) || null, now);
        } catch (e: any) { console.warn('[classes-now] room mismatch:', e?.message); }

        return json({
          ok: true,
          now_kst: kstHM(now),
          counts: {
            now: classes.filter(c => c.phase === 'now').length,
            soon: classes.filter(c => c.phase === 'soon').length,
            ended: classes.filter(c => c.phase === 'ended').length,
            connected: classes.filter(c => c.connected).length,
            // 🏷 출처별 건수 — 「카페24가 0건」과 「수업이 0건」은 다른 사실이다
            mangoi: classes.filter(c => c.source === 'mangoi').length,
            cafe24: classes.filter(c => c.source === 'cafe24').length,
            holiday_closed: _hol.closed,   // 🎌 공휴일 휴강으로 뺀 수업 수(망고아이+카페24)
          },
          holiday: _hol.name ? { name: _hol.name, closed: _hol.closed, closed_cafe24: _hol.closed_c24 } : null,
          classes,
          room_mismatch: roomMismatch,
        });
      } catch (e: any) {
        return json({ ok: false, error: 'classes_now_failed', detail: String(e?.message || e) }, 500);
      }
    }
  return null;
}
