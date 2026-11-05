/** Administrator statistics and KPI routes. Access gates remain in the caller. */
import type { MangoEnv } from './api-mango';
import { admCacheHit, admCachePut } from './admin-cache';
import { json, parseJsonBody } from './api-util';
import { notSeedSql } from './accounting-reports';
import { selectInChunks } from './d1-chunk';
import { DEFAULT_CLASS_MINUTES } from './class-policy';
import { scopeFragments, getScope, scopeStudentCond } from './scope';
import { getAdminActor } from './auth-admin';
import { orgScopeVerdict, readScopeType, orgScopeDenyResponse } from './org-scope-guard';
import { kstMonthBounds, kstMidnight, kstDateStr, activeBinds, activeCountSql, overdueSql, absentSql, classDaysSql, trendPct, KPI_DEF_VERSION, OVERDUE_GRACE_DAYS, ABSENT_DAYS, ACTIVE_WINDOW_DAYS } from './kpi-active';

export async function handleAdminStatsApi(request: Request, url: URL, env: MangoEnv): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;


    // ════════════════════════════════════════════════════════════
    // 💵 Phase 15 — 매출 / 학생 흐름 통계
    //   GET /api/admin/stats/revenue?period=day|month|quarter|half|year&from=YYYY-MM-DD&to=YYYY-MM-DD
    //     · student_payments 테이블 기준 (status='paid' 만 합산)
    //     · period 별 그룹핑 (날짜·연월·연-Q1~Q4·연-1H/2H·연도)
    //   GET /api/admin/stats/student-flow?from=&to=
    //     · students_erp 의 signup_date / end_date 기준
    //     · 일자별 신규(new), 탈락(dropped), 활성(active) 카운트
    // ════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════════
    // 📊 강사 가동률 (Teacher Utilization) — 2026-08-04 신규
    //   GET /api/admin/stats/teacher-utilization
    //
    //   왜 —
    //     화상수업 사업의 원가는 결국 «강사 시간» 이다. 강사 수·수업 수는 이미 보이지만
    //     "열어둔 시간 중 실제로 얼마나 찼는가" 가 없어서 강사를 더 뽑을지 줄일지 판단할
    //     근거가 없었다. 해외 튜터링 관리 제품이 관리자 지표 1순위로 꼽는 값이다.
    //
    //   정의 (임의 상수를 쓰지 않고 실제 데이터에서 끌어낸다) —
    //     · 운영시간대 = 지금 잡혀 있는 정기수업들의 «가장 이른 시작 ~ 가장 늦은 종료»
    //       (수업이 하나도 없으면 06:00~23:00 으로만 대체)
    //     · 가능시간  = 7일 × 운영시간대 − 그 강사가 등록한 주간 근무불가(teacher_unavailability.kind='weekly')
    //     · 배정시간  = 지난 7일(KST, 오늘 제외)에 날짜가 잡힌 활성 수업 + 날짜 없는 옛 매주 반복 행의 duration 합계
    //     · 가동률    = 배정시간 ÷ 가능시간
    //   ※ 2026-09-30 변경 — 예전엔 «매주 반복(recurring)» 만 세서 카페24 미러(one_off)·수강신청(dated)
    //     수업이 전부 빠져 명부가 전원 0% 였다. 지금은 날짜 기준으로 센다(아래 SELECT 주석).
    // ═══════════════════════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════════════════════
    // 🎚️ GET /api/admin/stats/judgment-bands — 판단력 훈련 읽기 난이도 분포·적중도
    //   ⚠️ 담당 밖(B) 이 추가한 핸들러입니다 — CLAUDE.md 4-2. 기존 코드는 건드리지 않고
    //      이 블록만 덧붙였습니다. 옮기거나 지우셔도 판단력 기능 자체는 영향받지 않습니다.
    //
    //   이 수치가 이 기능의 유일한 성공 지표입니다. 밴드별 정답률이 목표 85%
    //   (Wilson et al., Nature Comm. 2019 — 학습이 가장 빠른 지점)에서 얼마나 벗어났는지 봅니다.
    //     · 85% 보다 훨씬 높다 → 그 밴드가 너무 쉽다(문장 기준을 올릴 것)
    //     · 85% 보다 훨씬 낮다 → 너무 어렵다(내릴 것)
    //   원천은 judgment_analysis.reasoning_features_json.reading_band — 새 테이블 없음.
    //   ⚠️ 표본이 적으면 정답률은 의미가 없습니다. 그래서 n 을 반드시 함께 내려보냅니다.
    // ═══════════════════════════════════════════════════════════════════
    if (method === 'GET' && path === '/api/admin/stats/judgment-bands') {
      /* ⛔ 게스트(guest*)는 뺀다 — 2026-09-05 에 판단력 훈련을 «맛보기» 로 열면서 로그인 없는
         방문자도 문제를 풀게 됐다. 대충 눌러 보고 나가는 사람의 정답률이 이 평균에 섞이면,
         바로 위 주석이 말하는 «너무 어렵다 → 내릴 것» 판단이 **실제 학생과 무관하게** 내려간다.
         students 칸도 게스트를 «학생» 으로 센다. */
      try {
        const rs = await env.DB.prepare(
          `SELECT CAST(json_extract(reasoning_features_json,'$.reading_band') AS INTEGER) AS band,
                  COUNT(*) AS n,
                  ROUND(AVG(is_optimal) * 100, 1) AS pct_correct,
                  COUNT(DISTINCT student_uid) AS students
             FROM judgment_analysis
            WHERE json_extract(reasoning_features_json,'$.reading_band') IS NOT NULL
              AND LOWER(COALESCE(student_uid,'')) NOT LIKE 'guest%'
            GROUP BY band ORDER BY band`
        ).all<any>();
        const rows = (rs.results || []).map((r: any) => ({
          band: Number(r.band), n: Number(r.n) || 0,
          pct_correct: r.pct_correct == null ? null : Number(r.pct_correct),
          students: Number(r.students) || 0,
          // 목표에서 얼마나 떨어졌는지 — 부호까지 봐야 올릴지 내릴지 판단할 수 있습니다
          off_target: r.pct_correct == null ? null : Math.round((Number(r.pct_correct) - 85) * 10) / 10,
        }));
        const total = rows.reduce((s, r) => s + r.n, 0);
        return json({
          ok: true, target_pct: 85, total, bands: rows,
          // 표본이 적을 때 정답률을 근거로 쓰지 않도록 화면에 경고 문구를 띄우기 위한 신호
          enough_data: total >= 100,
          note_ko: total >= 100 ? null : '표본이 적어 정답률은 아직 참고용입니다.',
          note_en: total >= 100 ? null : 'Sample is small — accuracy is indicative only.',
        });
      } catch (e: any) {
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }
    }

    if (method === 'GET' && path === '/api/admin/stats/teacher-utilization') {
      try {
        const toMin = (hhmm: any) => {
          const [h, m] = String(hhmm || '00:00').split(':').map(Number);
          return (h || 0) * 60 + (m || 0);
        };
        const dowsOf = (v: any): number[] => {
          const out: number[] = [];
          for (const p of String(v ?? '').split(/[,\s]+/)) {
            const q = p.trim(); if (!q) continue;
            const n = /^\d$/.test(q) ? Number(q) : ({ sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 } as any)[q.toLowerCase()];
            if (n != null && n >= 0 && n <= 6 && !out.includes(n)) out.push(n);
          }
          return out;
        };

        const safeAll = async (sql: string, ...b: any[]): Promise<any[]> => {
          try { const rs = await env.DB.prepare(sql).bind(...b).all<any>(); return rs.results || []; }
          catch { return []; }
        };

        // 지난 7일 = KST 오늘 -7일 ~ 어제 (오늘은 아직 안 끝난 수업이 섞여 제외)
        const kstDay = (offset: number) => new Date(Date.now() + 9 * 3600e3 + offset * 86400e3).toISOString().slice(0, 10);
        const winFrom = kstDay(-7), winTo = kstDay(-1);

        const [scheds, teachers, blocks] = await Promise.all([
          /* 🧹 (2026-08-30) LMS·시드 «자리표시» 행 제외 — 학생이 안 붙은 점유 행이라 진짜 수업이 아니다.
             같은 제외식이 schedule-conflict.ts·api-teacher.ts·churn-graph.ts·enroll-ops.ts 에도 있다
             (CLAUDE.md 2장 「주간 스케줄에서 어떤 요일만 수업이 안 들어감」). 다섯 곳의 문자열을 맞춰 둔다. */
          /* 📅 (2026-09-30 사장님 「지난 7일 기준으로」) 옛 판은 schedule_kind = 'recurring' «만» 셌는데,
             지금 수업은 카페24 미러(one_off)·수강신청 확정(dated)이 «날짜마다 한 줄» 로 만든다
             (운영 D1 실측 활성: one_off 2,832 · dated 406 · recurring 6) → 명부가 전원 0% 였다.
             ⟹ «지난 7일(오늘 제외, KST)에 날짜가 잡힌 활성 수업» + «날짜 없는 옛 매주 반복 행» 을 센다.
             ⛔ 날짜가 있으면 날짜가 이긴다(sessions/today 와 같은 규칙) — 요일로 한 번 더 세지 않는다. */
          safeAll(`SELECT teacher_id, day_of_week, start_time, duration_min, scheduled_date FROM class_schedules
                    WHERE status = 'active' AND teacher_id IS NOT NULL AND teacher_id <> ''
                      AND LOWER(COALESCE(user_id,'')) NOT IN ('lms','type_seed')
                      AND ( (scheduled_date >= ? AND scheduled_date <= ?)
                         OR ((scheduled_date IS NULL OR scheduled_date = '') AND schedule_kind = 'recurring') )`, winFrom, winTo),
          safeAll(`SELECT id, name, COALESCE(active, 1) AS active FROM teachers`),
          safeAll(`SELECT teacher_id, day_of_week, start_time, end_time FROM teacher_unavailability WHERE kind = 'weekly'`),
        ]);

        // ── 운영시간대: 실제 잡힌 수업에서 관측 (없으면 06:00~23:00)
        let openMin = 24 * 60, closeMin = 0;
        for (const s of scheds) {
          const st = toMin(s.start_time);
          const en = st + (Number(s.duration_min) > 0 ? Number(s.duration_min) : DEFAULT_CLASS_MINUTES);
          if (st < openMin) openMin = st;
          if (en > closeMin) closeMin = en;
        }
        if (!scheds.length || closeMin <= openMin) { openMin = 6 * 60; closeMin = 23 * 60; }
        const windowPerDay = closeMin - openMin;

        const nameById = new Map<string, string>();
        for (const t of teachers) nameById.set(String(t.id), String(t.name || ''));

        // ── 강사별 집계
        type Agg = { assigned: number; classes: number; blocked: number; byDow: number[] };
        const agg = new Map<string, Agg>();
        const ensure = (id: string): Agg => {
          if (!agg.has(id)) agg.set(id, { assigned: 0, classes: 0, blocked: 0, byDow: [0, 0, 0, 0, 0, 0, 0] });
          return agg.get(id)!;
        };

        /* 🔴 (2026-08-30 v4 제안서 13) 예전에는 agg 가 «class_schedules 에 나온 강사» 로만 채워져,
           수업이 한 건도 안 잡힌 강사는 목록에서 **통째로 사라졌다.** 그게 「전체 강사가 안 나온다」의
           정체다 — 2026-08-30 운영 D1 실측: 활성 강사 **29명**인데 활성 정기수업에 나오는 강사는 **1명**.
           즉 화면에 한 줄만 떴다. 가동률 0% 인 강사야말로 이 지표로 봐야 할 사람이다.
           ⟹ 먼저 «활성 강사 전원» 을 0으로 깔고, 그 위에 배정을 더한다.
           ⚠️ 퇴사자(active=0)는 넣지 않는다 — 그건 «전수» 가 아니라 «과거» 다. */
        for (const t of teachers) {
          if (Number(t.active) === 0) continue;
          ensure(String(t.id));
        }

        /* 그룹 수업은 «학생마다 한 행» 이라 같은 강사·같은 날·같은 시각이 여러 줄이다 — 강사 시간은
           한 번만 쓰이므로 그 칸 하나로 묶는다(가장 긴 길이). 안 묶으면 3명 그룹이 3배로 잡힌다. */
        const slot = new Map<string, { id: string; dur: number; dows: number[] }>();
        for (const s of scheds) {
          const id = String(s.teacher_id);
          const dur = Number(s.duration_min) > 0 ? Number(s.duration_min) : DEFAULT_CLASS_MINUTES;
          const date = String(s.scheduled_date || '').trim();
          let dows: number[]; let key: string;
          if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            dows = [new Date(date + 'T00:00:00Z').getUTCDay()];
            key = id + '|' + date + '|' + String(s.start_time || '');
          } else {
            // 날짜 없는 옛 매주 반복 행 — 한 행에 여러 요일이 담긴 과거 데이터도 있어 요일 수만큼 센다
            dows = dowsOf(s.day_of_week);
            key = id + '|w:' + dows.join(',') + '|' + String(s.start_time || '');
          }
          const prev = slot.get(key);
          if (!prev || dur > prev.dur) slot.set(key, { id, dur, dows });
        }
        for (const v of slot.values()) {
          const a = ensure(v.id);
          const n = v.dows.length || 1;
          a.assigned += v.dur * n;
          a.classes += n;
          for (const d of v.dows) a.byDow[d] += v.dur;
        }

        for (const b of blocks) {
          const id = String(b.teacher_id || '');
          if (!id) continue;
          const bs = Math.max(openMin, b.start_time ? toMin(b.start_time) : openMin);
          const be = Math.min(closeMin, b.end_time ? toMin(b.end_time) : closeMin);
          if (be <= bs) continue;
          const dows = dowsOf(b.day_of_week);
          ensure(id).blocked += (be - bs) * (dows.length || 1);
        }

        const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];
        const DOW_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const rows = [...agg.entries()].map(([id, a]) => {
          const available = Math.max(0, windowPerDay * 7 - a.blocked);
          const util = available > 0 ? Math.round((a.assigned / available) * 1000) / 10 : null;
          let top = 0;
          for (let i = 1; i < 7; i++) if (a.byDow[i] > a.byDow[top]) top = i;
          return {
            teacher_id: id,
            name: nameById.get(id) || ('#' + id),
            assigned_min: a.assigned,
            blocked_min: a.blocked,
            available_min: available,
            utilization_pct: util,             // null = 가능시간 0 (전부 근무불가로 막힘)
            class_count: a.classes,
            busiest_dow: a.byDow[top] > 0 ? top : null,
            busiest_dow_ko: a.byDow[top] > 0 ? DOW_KO[top] : null,
            busiest_dow_en: a.byDow[top] > 0 ? DOW_EN[top] : null,
          };
        }).sort((x, y) => ((y.utilization_pct ?? -1) - (x.utilization_pct ?? -1))
                      || String(x.name).localeCompare(String(y.name)));

        const withUtil = rows.filter(r => r.utilization_pct != null);
        const totalAssigned = rows.reduce((s, r) => s + r.assigned_min, 0);
        const totalAvailable = rows.reduce((s, r) => s + r.available_min, 0);

        const hhmm = (m: number) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
        return json({
          ok: true,
          window: { open: hhmm(openMin), close: hhmm(closeMin), per_day_min: windowPerDay, days_per_week: 7, from: winFrom, to: winTo },
          summary: {
            teacher_count: rows.length,
            avg_utilization_pct: withUtil.length
              ? Math.round((withUtil.reduce((s, r) => s + (r.utilization_pct || 0), 0) / withUtil.length) * 10) / 10
              : null,
            overall_utilization_pct: totalAvailable > 0 ? Math.round((totalAssigned / totalAvailable) * 1000) / 10 : null,
            total_assigned_min: totalAssigned,
            total_available_min: totalAvailable,
            observed_from_schedules: scheds.length > 0,
          },
          teachers: rows,
          note: '가동률 = 지난 7일(' + winFrom + ' ~ ' + winTo + ', 오늘 제외) 잡혀 있던 수업시간 ÷ (운영시간대 7일 − 강사가 등록한 주간 근무불가). 취소된 수업과 LMS·시드 자리표시는 빼고, 같은 시각 그룹 수업은 한 번만 셉니다. 활성 강사는 수업이 없어도 0%로 함께 표시합니다.',
          note_en: 'Utilization = class minutes scheduled in the last 7 days (' + winFrom + ' ~ ' + winTo + ', today excluded) ÷ (operating window × 7 days − the teacher\'s weekly unavailability). Cancelled classes and LMS/seed placeholders are excluded; a group class at the same time counts once; active teachers with no class are listed at 0%.',
        });
      } catch (e: any) {
        return json({ ok: false, error: 'utilization_failed', message: String(e?.message || e).slice(0, 300) }, 500);
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // 🪑 대기자 명단 (Waitlist) — 2026-08-04 신규
    //   GET  /api/admin/stats/waitlist            목록 + 희망시간에 «여유 있는 강사» 자동 매칭
    //   POST /api/admin/stats/waitlist            {action:'add'|'resolve'|'cancel', ...}
    //
    //   왜 —
    //     지금은 원하는 시간에 자리가 없으면 상담이 그대로 끝난다. 이미 관심을 보인 고객이라
    //     신규 광고보다 회수 단가가 훨씬 싸다. 줄을 세워두고 자리가 나면 연락하기 위한 최소 기능.
    //
    //   ⚠️ 경로가 /stats/ 아래인 이유 —
    //     새 API 경로는 src/index.ts 의 라우팅 게이트 + 인증 게이트 «두 곳» 에 등록해야 동작하는데
    //     index.ts 는 공동 금지구역이다. '/api/admin/stats/' 는 두 게이트에 이미 열려 있어
    //     금지구역을 건드리지 않고 안전하게 붙일 수 있는 유일한 접두사였다.
    //     (index.ts 를 열 수 있게 되면 /api/admin/waitlist 로 옮기는 편이 이름에 맞다)
    // ═══════════════════════════════════════════════════════════════════
    if (path === '/api/admin/stats/waitlist' && (method === 'GET' || method === 'POST')) {
      const WL_DDL = `CREATE TABLE IF NOT EXISTS class_waitlist (
        id INTEGER PRIMARY KEY AUTOINCREMENT, student_name TEXT, phone TEXT, uid TEXT,
        teacher_pref TEXT, day_pref TEXT, time_pref TEXT, note TEXT,
        status TEXT NOT NULL DEFAULT 'waiting', created_at INTEGER NOT NULL,
        created_by TEXT, resolved_at INTEGER, resolved_by TEXT)`;
      try { await env.DB.exec(WL_DDL.replace(/\s+/g, ' ')); } catch { }
      /* ⚠️ shop_name·franchise 를 위 CREATE 에 **일부러 안 넣었다.**
           CREATE TABLE IF NOT EXISTS 는 표가 이미 있으면 아무것도 안 한다 —
           운영 표에는 그 칸이 안 생기는데 코드만 «있다» 고 적히면 서로 어긋난다
           (schema_drift_harness 가 바로 이걸 잡는다). 이 파일의 teachers·payslips 도
           나중에 생긴 칸은 전부 아래 ALTER 쪽에만 있다. 같은 방식을 따른다. */
      /* 🔒 (2026-08-17 사장님) 대기자도 지사·대리점끼리 격리한다.
           연기·변경 요청을 막고 나서 보니 **대기자만 안 막혀 있었다** — 강남점 원장님이
           서초점·부산지사 대기자 이름과 전화번호까지 그대로 봤다(2026-08-04 신설 이래).

         ⚠️ class_waitlist 에는 소속 칸이 아예 없었다. 그래서 칸을 두 개 새로 만든다.
            이미 있으면 ALTER 가 던지고, 그건 정상이라 삼킨다(이 파일의 기존 방식과 같다).
            **칸을 더하기만 한다 — 기존 행의 값은 건드리지 않는다.**

         ⚠️ 칸 이름을 students_erp 와 **똑같이** shop_name · franchise 로 맞췄다.
            그래야 공용 scopeStudentCond() 가 만든 조건을 이 표에 **그대로** 쓸 수 있다.
            이름을 다르게 지으면 격리 로직을 한 벌 더 쓰게 되고, 한쪽만 고쳐 어긋난다. */
      for (const sql of [`ALTER TABLE class_waitlist ADD COLUMN shop_name TEXT`,
                         `ALTER TABLE class_waitlist ADD COLUMN franchise TEXT`]) {
        try { await env.DB.exec(sql); } catch { }
      }

      /* 누가 어디까지 보는가 —
           본사(hq)·내부직원(none) : 조건이 빈 문자열 → **동작이 하나도 안 바뀐다.**
           대리점(agency)          : shop_name 이 자기 대리점인 것
           지사(branch)            : franchise 가 자기 지역으로 시작하는 것
           지사본사(franchise)     : 자기 소유 지사들

         ⚠️ 옛 행에는 이 칸이 비어 있다(이 변경 이전에 넣은 것). 비었으면 **안 보인다** —
            연기·변경 요청과 같은 «막는 쪽으로 실패» 원칙이다. 다만 그러면 원장님이
            직접 넣어 둔 대기자까지 사라지므로, **created_by 가 나인 행은 계속 보인다.**
            내가 넣은 것을 내가 보는 것이라 새는 것이 없고, 옛 자료도 안 잃는다.
         ⚠️ uid → students_erp 로 잇는 길은 **일부러 안 썼다.** 대기자는 아직 등록 전
            학생이라 uid 가 거의 비어 있어 얻는 것이 적은데, 조건이 두 벌이 되면
            지사본사(지사 80개)에서 바인드가 100개를 넘어 조용히 빈 결과가 된다. */
      const _wlScope = await getScope(env as any, request);
      const _wlC = scopeStudentCond(_wlScope);
      const _wlActor = await getAdminActor(request, env as any);
      const _wlOwn = String(_wlActor?.name || '');
      // 조건 + 바인드를 한 번에 만든다 — 목록·개수·수정이 **같은 것**을 쓰게 하기 위해서다
      const _wlCond = _wlC.cond ? `(${_wlC.cond} OR created_by = ?)` : '';
      const _wlBinds = _wlC.cond ? [..._wlC.binds, _wlOwn] : [];

      if (method === 'POST') {
        const body: any = await parseJsonBody(request) ?? {};
        const action = String(body.action || 'add').toLowerCase();
        let actor = 'admin';
        try { const a = await getAdminActor(request, env as any); if (a?.name) actor = a.name; } catch { }

        if (action === 'add') {
          const name = String(body.student_name || '').trim();
          if (!name) return json({ ok: false, error: 'name_required', message: '학생 이름을 입력해 주세요.', message_en: 'Student name is required.' }, 400);
          /* 넣을 때 소속을 찍는다 — 안 찍으면 아무에게도 안 보이는 행이 된다.
               대리점이 넣으면 그 대리점 + **그 대리점이 속한 지사**까지 찍는다.
               지사 칸을 같이 안 찍으면 지사 원장님은 산하 대리점이 넣은 대기자를 못 본다.
             ⚠️ 본사(hq)가 넣은 것은 비워 둔다 — 본사는 전체를 보므로 막힐 일이 없고,
                엉뚱한 대리점 이름을 찍으면 그 대리점 자료로 굳어 버린다. */
          let wShop: string | null = null, wFran: string | null = null;
          if (_wlScope.type === 'agency' && _wlScope.value) {
            wShop = _wlScope.value;
            const f = await env.DB.prepare(`SELECT franchise FROM students_erp WHERE shop_name = ? AND franchise IS NOT NULL AND franchise <> '' LIMIT 1`)
              .bind(wShop).first<{ franchise: string }>().catch(() => null);
            wFran = f?.franchise || null;
          } else if (_wlScope.type === 'branch' && _wlScope.value) {
            wFran = _wlScope.value;
          }
          try {
            const ins = await env.DB.prepare(
              `INSERT INTO class_waitlist (student_name, phone, uid, teacher_pref, day_pref, time_pref, note, status, created_at, created_by, shop_name, franchise)
               VALUES (?,?,?,?,?,?,?,'waiting',?,?,?,?)`
            ).bind(name, String(body.phone || '').trim() || null, String(body.uid || '').trim() || null,
              String(body.teacher_pref || '').trim() || null, String(body.day_pref ?? '').trim() || null,
              String(body.time_pref || '').trim() || null, String(body.note || '').trim() || null,
              Date.now(), actor, wShop, wFran).run();
            return json({ ok: true, id: (ins?.meta?.last_row_id as number) ?? null });
          } catch (e: any) {
            return json({ ok: false, error: 'insert_failed', message: String(e?.message || e).slice(0, 200) }, 500);
          }
        }

        if (action === 'resolve' || action === 'cancel') {
          const id = Number(body.id);
          if (!Number.isFinite(id)) return json({ ok: false, error: 'id_required' }, 400);
          /* 🔒 처리(등록완료·취소)도 **자기 대기자만.** 목록을 막아도 여기를 안 막으면
                id 만 바꿔 넣어 남의 대리점 대기자를 취소할 수 있다(연기·변경 /decide 와 같은 구멍).
                목록과 **똑같은 조건**을 쓴다 — 한쪽만 고쳐서 어긋나는 것을 막으려고 위에서 한 번만 만들었다. */
          try {
            const upd: any = await env.DB.prepare(
              `UPDATE class_waitlist SET status = ?, resolved_at = ?, resolved_by = ? WHERE id = ?`
              + (_wlCond ? ` AND ${_wlCond}` : '')
            ).bind(action === 'resolve' ? 'enrolled' : 'cancelled', Date.now(), actor, id, ..._wlBinds).run();
            // 한 줄도 안 바뀌었다 = 내 대기자가 아니거나 없는 id. «없다» 와 «남의 것» 을 구분해 알려주지 않는다.
            if (_wlCond && !(upd?.meta?.changes > 0)) {
              return json({ ok: false, error: 'forbidden_scope', message: '이 대기자를 처리할 권한이 없습니다.', message_en: 'Not allowed for this waitlist entry.' }, 403);
            }
            return json({ ok: true });
          } catch (e: any) {
            return json({ ok: false, error: 'update_failed', message: String(e?.message || e).slice(0, 200) }, 500);
          }
        }
        return json({ ok: false, error: 'unknown_action', message: '알 수 없는 요청입니다.', message_en: 'Unknown action.' }, 400);
      }

      // ── GET: 목록 + «희망 시간에 여유 있는 강사» 자동 매칭 ──
      try {
        const status = String(url.searchParams.get('status') || 'waiting');
        const wConds: string[] = []; const wBinds: any[] = [];
        if (status !== 'all') { wConds.push('status = ?'); wBinds.push(status); }
        if (_wlCond) { wConds.push(_wlCond); wBinds.push(..._wlBinds); }
        const wWhere = wConds.length ? ('WHERE ' + wConds.join(' AND ')) : '';
        const list = (await env.DB.prepare(
          `SELECT * FROM class_waitlist ${wWhere} ORDER BY created_at DESC LIMIT 300`
        ).bind(...wBinds).all<any>()).results || [];

        const toMin2 = (hhmm: any) => { const [h, m] = String(hhmm || '').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
        const dow1 = (v: any): number | null => {
          const q = String(v ?? '').trim();
          if (/^\d$/.test(q)) return Number(q);
          const n = ({ sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 } as any)[q.toLowerCase()];
          return n == null ? null : n;
        };
        const safeAll2 = async (sql: string): Promise<any[]> => {
          try { const r = await env.DB.prepare(sql).all<any>(); return r.results || []; } catch { return []; }
        };
        const [teachers, scheds, blocks] = await Promise.all([
          safeAll2(`SELECT id, name FROM teachers`),
          safeAll2(`SELECT teacher_id, day_of_week, start_time, duration_min FROM class_schedules
                     WHERE status='active' AND schedule_kind='recurring' AND teacher_id IS NOT NULL AND teacher_id <> ''`),
          safeAll2(`SELECT teacher_id, day_of_week, start_time, end_time FROM teacher_unavailability WHERE kind='weekly'`),
        ]);

        // 희망 요일·시간이 적힌 대기자에 한해, 그 시간이 비어 있는 강사를 계산해 붙인다.
        const withMatch = list.map((w: any) => {
          const d = dow1(w.day_pref);
          const t = String(w.time_pref || '').trim();
          if (d == null || !/^\d{1,2}:\d{2}$/.test(t)) return { ...w, free_teachers: null };
          const s = toMin2(t), e = s + DEFAULT_CLASS_MINUTES;
          const busy = new Set<string>();
          for (const r of scheds) {
            const rd = String(r.day_of_week ?? '').split(/[,\s]+/).map(dow1);
            if (!rd.includes(d)) continue;
            const rs2 = toMin2(r.start_time);
            const re2 = rs2 + (Number(r.duration_min) > 0 ? Number(r.duration_min) : DEFAULT_CLASS_MINUTES);
            if (s < re2 && rs2 < e) busy.add(String(r.teacher_id));
          }
          for (const b of blocks) {
            if (dow1(b.day_of_week) !== d) continue;
            const bs = b.start_time ? toMin2(b.start_time) : 0;
            const be = b.end_time ? toMin2(b.end_time) : 24 * 60;
            if (s < be && bs < e) busy.add(String(b.teacher_id));
          }
          const free = teachers.filter(x => !busy.has(String(x.id))).map(x => ({ id: String(x.id), name: String(x.name || '') }));
          return { ...w, free_teachers: free.slice(0, 8), free_teacher_count: free.length };
        });

        let counts: any = {};
        try {
          // 개수도 같은 조건으로 — 목록은 3명인데 «대기 40명» 이 뜨면 그게 곧 남의 자료를 알려 주는 것이다
          const c = await env.DB.prepare(
            `SELECT status, COUNT(*) AS n FROM class_waitlist ${_wlCond ? 'WHERE ' + _wlCond : ''} GROUP BY status`
          ).bind(..._wlBinds).all<any>();
          for (const r of (c.results || [])) counts[String(r.status)] = Number(r.n) || 0;
        } catch { }

        return json({
          ok: true, rows: withMatch, counts,
          note: '희망 요일·시간이 적힌 대기자는 그 시간에 수업이 없고 근무불가도 아닌 강사를 «지금 배정 가능» 으로 표시합니다.',
          note_en: 'For entries with a preferred weekday and time, teachers with no class and no block at that slot are shown as immediately assignable.',
        });
      } catch (e: any) {
        return json({ ok: false, error: 'waitlist_failed', message: String(e?.message || e).slice(0, 300) }, 500);
      }
    }

    // 🥭 Phase 20 — 오늘의 KPI 4박스 통합 엔드포인트
    //   GET /api/admin/stats/today
    //   - 오늘(KST) 매출 / 출석 학생수 / 결석률 / 신규 등록 4개 값을 한 번에 반환
    //   - 결석률 = (활성 학생수 - 오늘 출석 학생수) / 활성 학생수 * 100
    //   - student_payments / attendance / students_erp 3개 테이블 사용
    if (method === 'GET' && path === '/api/admin/stats/today') {
      // 🥭 Phase 20d 핫픽스 — production D1 에 테이블/컬럼이 없을 수 있으므로
      //  ① 필요한 모든 테이블을 IF NOT EXISTS 로 자동 생성
      //  ② 4개 쿼리를 개별 try/catch 로 격리 (하나 실패해도 나머지 살아있음)
      //  ③ 컬럼 누락 등 어떤 에러든 0 으로 graceful degradation, 전체 200 OK 유지

      // ⚡ KV 캐시(60초, 스코프 격리) — 페이지 진입마다 4쿼리+CREATE 3회 재실행 방지
      const _tf = await scopeFragments(env, request);
      const _tKey = 'admtoday:' + new Date(Date.now() + 9*3600*1000).toISOString().slice(0,10)
                  + ':' + (_tf.erpScope || 'all') + '|' + _tf.binds.join(',');
      const _tHit = await admCacheHit(env, _tKey);
      if (_tHit) return _tHit;

      // 자동 자가치유 — 누락된 테이블 생성 (이미 있으면 NOOP)
      try {
        await env.DB.exec(
          `CREATE TABLE IF NOT EXISTS student_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, paid_at INTEGER, period_start TEXT, period_end TEXT, amount_krw INTEGER NOT NULL, method TEXT, memo TEXT, status TEXT DEFAULT 'paid', created_at INTEGER NOT NULL);`
        );
      } catch {}
      try {
        await env.DB.exec(
          `CREATE TABLE IF NOT EXISTS students_erp (user_id TEXT PRIMARY KEY, korean_name TEXT, english_name TEXT, status TEXT DEFAULT '정상', signup_date TEXT, end_date TEXT, created_at INTEGER);`
        );
      } catch {}
      try {
        await env.DB.exec(
          `CREATE TABLE IF NOT EXISTS attendance (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL, user_id TEXT NOT NULL, username TEXT, role TEXT DEFAULT 'student', joined_at INTEGER NOT NULL, left_at INTEGER, status TEXT DEFAULT 'present', date TEXT, total_session_ms INTEGER DEFAULT 0, total_active_ms INTEGER DEFAULT 0, disconnect_count INTEGER DEFAULT 0);`
        );
      } catch {}

      const todayKst = new Date(Date.now() + 9*3600*1000).toISOString().slice(0,10);
      const startMs = new Date(todayKst + 'T00:00:00+09:00').getTime();
      const endMs = startMs + 86400000;

      // 각 쿼리를 안전 헬퍼로 감싸 — 개별 실패가 전체 실패를 일으키지 않도록
      const safe = async <T,>(fn: () => Promise<T>, fallback: T): Promise<T> => {
        try { return await fn(); } catch { return fallback; }
      };

      // 🔒 역할별 데이터 범위 — 지사/대리점/교사/학부모/학생은 자기 범위만 집계
      // 🔒 세션 기반 강제 스코프(대리점/지사는 자기 범위만, 본사는 전체/?as= 드릴다운)
      const _sf = _tf;   // 위 캐시 키 계산에서 이미 조회 — 재호출 낭비 방지
      const _uidScope = _sf.uidScope, _erpScope = _sf.erpScope, _sb = _sf.binds;

      const [revRow, attRow, activeRow, signupRow, schedRow] = await Promise.all([
        safe(() => env.DB.prepare(
          `SELECT COALESCE(SUM(amount_krw), 0) AS revenue, COUNT(*) AS pay_count
           FROM student_payments
           WHERE status = 'paid' AND paid_at IS NOT NULL AND ${notSeedSql()}
             AND paid_at >= ? AND paid_at < ?${_uidScope}`
        ).bind(startMs, endMs, ..._sb).first<{ revenue: number; pay_count: number }>(),
        { revenue: 0, pay_count: 0 } as any),

        safe(() => env.DB.prepare(
          // 🪤 (2026-08-08) 예전엔 status 를 안 보고 **그날의 모든 행**을 셌다.
          //    attendance 에는 «예정(scheduled)» 행도 함께 들어온다(카페24 동기화).
          //    그래서 「오늘 출석 8명」이 사실은 «예정 7 + 실제출석 1» 이었다.
          //    실측 08-07: 모든 행 190 · 실제 출석 125 · 예정 92.
          `SELECT COUNT(DISTINCT user_id) AS attended
           FROM attendance
           WHERE date = ? AND status IN ('present','left','attended')${_uidScope}`
        ).bind(todayKst, ..._sb).first<{ attended: number }>(),
        { attended: 0 } as any),

        safe(() => env.DB.prepare(
          // 🧮 (2026-08-08) status 를 함께 본다. 예전엔 end_date 만 봐서
          //    status='inactive' 인 385명이 «재원» 으로 세어지고 있었다(실측).
          `SELECT COUNT(*) AS active
           FROM students_erp
           WHERE (end_date IS NULL OR end_date = '' OR end_date >= ?)
             AND (status IS NULL OR status <> 'inactive')${_erpScope}`
        ).bind(todayKst, ..._sb).first<{ active: number }>(),
        { active: 0 } as any),

        safe(() => env.DB.prepare(
          `SELECT COUNT(*) AS signups
           FROM students_erp WHERE signup_date = ?${_erpScope}`
        ).bind(todayKst, ..._sb).first<{ signups: number }>(),
        { signups: 0 } as any),

        // 📅 오늘 «예정» 과 «그중 안 온 사람» — 결석률의 분모·분자.
        //
        //   🔑 출처는 attendance 다. 카페24 동기화가 예약을 `status='scheduled'` 로 미리 넣어 둔다
        //      (room_id 가 c24-*). 즉 «오늘 누가 수업인지» 는 처음부터 여기 있었다.
        //      ⚠️ class_schedules 를 쓰면 안 된다 — 666행이지만 학생은 6명뿐이고 140행은
        //         type_seed 데모다. 실제 수업과 연결돼 있지 않다(실측 확인).
        //
        //   결석 = «예정된 사람» 중 그날 present/left/attended 기록이 하나도 없는 사람.
        //   실측 08-07: 예정 92 · 출석 125 · 결석 65 → 70.7%.
        //   (출석이 예정보다 많은 것은 예약 없이 들어온 수업이 있기 때문이다. 정상이다.)
        // 📅 카페24 «수업 1건 = 행 1개» 를 상태별로 센다.
        //   cafe24-sync.ts: room_id=`c24-{class_id}`, class_state 2 → 'present'(완료), 그 외 → 'scheduled'(미실시).
        //   즉 한 방에 한 행뿐이라 예정·출석이 «겹치지 않는» 것이 정상이다.
        //   ⚠️ 세는 단위는 **수업(행)** 이지 학생이 아니다. 한 학생이 하루에 여러 수업을 듣는다.
        //   ⚠️ 오늘 값으로 «미실시율» 을 내면 안 된다 — 아침엔 100% 가 나온다(아직 안 했으니까).
        //      그래서 오늘은 «완료/예약» 진행상황만 주고, 비율은 **직전 영업일** 것을 준다.
        //
        //   🪤🪤 그런데 «직전 영업일» 값도 **아직 확정이 아니다.** (2026-08-09 실측)
        //      cafe24-sync 의 야간 증분은 **최근 14일만** 다시 가져온다(nightlyCafe24Refresh).
        //      그래서 어떤 날이든 15일째에 값이 «굳고», 그 전까지는 완료(class_state=2)가 계속 들어온다.
        //      굳은 날 vs 아직 움직이는 날을 요일별로 갈라 재니 **일관되게 +5~8%p** 차이가 났다:
        //        월 21.6 → 28.4 · 화 28.3 → 33.1 · 수 29.8 → 44.3 · 목 33.9 → 40.1 · 금 44.3 → 51.1
        //      즉 어제 숫자만 보면 **항상 실제보다 나쁘게 보인다.** 그 편차를 보정하지는 않는다
        //      (없는 숫자를 지어내는 것이다). 대신 **잣대를 같이 준다** —
        //      `weekday_avg_pct` = 같은 요일의 **굳은 날(15일 이상 지난 날)** 평균. 최근 60일.
        //      화면은 「8-07(금) 51.2% · 금 확정평균 44%」처럼 둘을 나란히 적는다.
        //   📌 요일 편차는 지연이 아니라 진짜다 — 굳은 날 기준으로도 월 21.6% ↔ 금 44.3% 다.
        //
        //   🧹 테스트·교육용 대리점 제외 (2026-08-09 실측) — 이 4곳은 **60일간 169건을 예약하고
        //      완료가 0건**이다. 실수업이 아니라 시연·연습용 계정이 매주 예약을 만드는 것이다.
        //        무료수업(지인) 90건 · 망고아이 기본대리점 43 · 교육용 대리점 27 · 테스트대리점 9  (전부 완료 0)
        //      빼면 미실시율이 월 21.6→21.0 · 금 44.3→42.7 로 내려간다. 크지 않지만 **가짜 숫자**다.
        //      ⚠️ 이름으로 거르지 않는다 — 「라이크테스트프랩어학원」은 이름만 비슷한 **실제 학원**이다
        //         (예약 0건이라 무해하지만, LIKE '%테스트%' 로 걸렀으면 멀쩡한 학원을 지웠을 것이다).
        //         그래서 **대리점 이름 4개를 명시적으로 못박는다.** 새 테스트 대리점이 생기면 여기 추가.
        //      ⚠️ 재원 수(active)에는 적용하지 않는다 — 그건 사장님이 대외적으로 쓰는 숫자라
        //         내 판단으로 정의를 바꾸지 않는다. 여기서 빼는 것은 «미실시율» 하나뿐이다.
        safe(() => env.DB.prepare(
          `WITH ghost AS (
             SELECT user_id FROM students_erp
              WHERE shop_name IN ('무료수업(지인)','망고아이 기본대리점','교육용 대리점','테스트대리점')),
           prev AS (
             SELECT date, COUNT(*) AS n, SUM(CASE WHEN status='present' THEN 1 ELSE 0 END) AS done
               FROM attendance
              WHERE room_id LIKE 'c24-%' AND date < ? AND date >= date(?, '-14 days')
                AND user_id NOT IN (SELECT user_id FROM ghost)
              GROUP BY date HAVING COUNT(*) >= 20
              ORDER BY date DESC LIMIT 1),
           wd AS (
             SELECT SUM(n) AS n, SUM(done) AS done FROM (
               SELECT COUNT(*) AS n, SUM(CASE WHEN status='present' THEN 1 ELSE 0 END) AS done
                 FROM attendance
                WHERE room_id LIKE 'c24-%'
                  AND date >= date(?, '-60 days')
                  AND date <= date(?, '-15 days')          -- 굳은 날만
                  AND user_id NOT IN (SELECT user_id FROM ghost)
                  AND strftime('%w', date) = (SELECT strftime('%w', date) FROM prev)
                GROUP BY date HAVING COUNT(*) >= 20))
           SELECT
             (SELECT COUNT(*) FROM attendance
               WHERE room_id LIKE 'c24-%' AND date = ?
                 AND user_id NOT IN (SELECT user_id FROM ghost)${_uidScope}) AS booked_today,
             (SELECT COUNT(*) FROM attendance
               WHERE room_id LIKE 'c24-%' AND date = ? AND status = 'present'
                 AND user_id NOT IN (SELECT user_id FROM ghost)${_uidScope}) AS done_today,
             (SELECT date FROM prev) AS prev_date,
             (SELECT n    FROM prev) AS prev_booked,
             (SELECT done FROM prev) AS prev_done,
             (SELECT n    FROM wd)   AS wd_booked,
             (SELECT done FROM wd)   AS wd_done`
        ).bind(todayKst, todayKst, todayKst, todayKst, todayKst, ..._sb, todayKst, ..._sb)
         .first<{ booked_today: number; done_today: number; prev_date: string | null;
                  prev_booked: number; prev_done: number; wd_booked: number; wd_done: number }>(),
        { booked_today: 0, done_today: 0, prev_date: null, prev_booked: 0, prev_done: 0,
          wd_booked: 0, wd_done: 0 } as any)
      ]);

      const revenue = revRow?.revenue || 0;
      const payCount = revRow?.pay_count || 0;
      const attended = attRow?.attended || 0;
      const active = activeRow?.active || 0;
      const signups = signupRow?.signups || 0;

      // 📉 결석률 — 분모는 «오늘 수업이 예정된 학생» 이어야 한다 (2026-08-08 수정)
      //
      //   무엇이 틀렸었나 — 분모가 **전체 재원 학생**이었다.
      //     absentCount = active - attended  →  8,052 - 8 = 8,044  →  99.9%
      //   오늘 수업이 없는 학생까지 전부 «결석» 으로 셌다. 그래서 화면에는 매일
      //   빨간 글씨로 99.9% 가 떠 있었고, 진짜 결석이 늘어도 아무도 알아챌 수 없었다.
      //   (실측 2026-08-08: 재원 8,052 · 오늘 출석 8 · 오늘 예정 조회 결과는 아래 참고)
      //
      //   그런데 «오늘 예정» 을 정확히 아는 데이터가 아직 없다 —
      //     class_schedules 666행 중 학생은 **6명**(140행은 type_seed 데모)
      //     enrollments 에 요일이 있는 것은 **50명**
      //   즉 8,052명 중 대다수는 «언제 수업인지» 가 기록돼 있지 않다.
      //
      //   그래서 **지어내지 않는다.** 예정 정보가 없으면 비율을 내지 않고 null 을 준다.
      //   화면은 null 을 «–» 로 그린다. 이 저장소에는 같은 이유로 만들어진 하니스가 있다
      //   (attendance_no_fabrication_harness — 없는 기록을 계산식으로 만들어 붙였다가
      //    그 «지어낸 지각» 이 강사 급여를 깎을 뻔했다). 같은 실수를 KPI 에서 반복하지 않는다.
      // 📊 오늘은 «진행상황», 비율은 «직전 영업일» — 이렇게 나눈 이유는 아래 주석 참조.
      const bookedToday = Math.max(0, Number(schedRow?.booked_today || 0));
      const doneToday   = Math.max(0, Number(schedRow?.done_today || 0));
      const prevBooked  = Math.max(0, Number(schedRow?.prev_booked || 0));
      const prevDone    = Math.max(0, Number(schedRow?.prev_done || 0));
      const prevRate    = prevBooked > 0
        ? Math.round(((prevBooked - prevDone) * 1000 / prevBooked)) / 10
        : null;
      // 📏 같은 요일의 «굳은 날» 평균 — 어제 숫자를 재는 잣대.
      //   어제 값은 아직 완료 처리가 덜 들어와 항상 나쁘게 나온다(위 SQL 주석의 실측표).
      //   보정하지 않고 **둘을 나란히 보여 준다.**
      const wdBooked = Math.max(0, Number(schedRow?.wd_booked || 0));
      const wdDone   = Math.max(0, Number(schedRow?.wd_done || 0));
      const wdRate   = wdBooked >= 100      // 표본이 너무 적으면 잣대가 못 된다
        ? Math.round(((wdBooked - wdDone) * 1000 / wdBooked)) / 10
        : null;
      const scheduledToday = Math.max(0, bookedToday - doneToday);   // 오늘 아직 안 한 수업
      const absentCount = scheduledToday;

      // 📌 왜 «오늘의 비율» 을 안 내는가 (2026-08-09, 연동 코드까지 읽고 정리)
      //
      //   앞서 두 번 틀렸다. 기록해 둔다 —
      //     ① 분모가 «전체 재원» 이었다 → 8,052−8 = 99.9%. 오늘 수업 없는 학생까지 결석으로 셌다.
      //     ② 그다음엔 «예정 학생 중 출석 안 한 학생» 으로 고쳤다 → 70.7%. 이것도 틀렸다.
      //        학생 단위로 맞추려 했는데, 한 학생이 하루에 여러 수업을 듣기 때문이다.
      //        «겹치는 방이 0건» 인 것을 «두 피드가 끊겼다» 고 오해하기도 했다.
      //
      //   진실은 cafe24-sync.ts 에 있었다 — 카페24 **수업 1건 = attendance 행 1개**이고,
      //   class_state 2 면 'present'(완료), 아니면 'scheduled'(미실시)로 **같은 행의 상태**만 갈린다.
      //   그러니 한 방에 한 행뿐인 게 정상이고, 세는 단위는 학생이 아니라 **수업(행)** 이다.
      //
      //   그런데 «오늘» 로 비율을 내면 여전히 거짓말이 된다 — 아침 9시엔 오늘 수업이
      //   하나도 안 끝났으니 미실시율 100% 다. 시간이 갈수록 저절로 내려간다.
      //   → 오늘은 «완료 M / 예약 N» 이라는 **진행상황**만 말하고,
      //     판단에 쓸 비율은 **직전 영업일**(수업이 다 끝나 값이 굳은 날) 것을 준다.
      //   실측 미실시율: 08-06 30.1% · 08-05 43.4% · 08-04 32.1% · 08-03 31.2%
      //     (예약 200건이 넘는 금요일만 ~50% 로 튄다 — 그건 들여다볼 «사실» 이다)
      const hasSchedule = false;   // 오늘 비율은 내지 않는다(위 이유). 대신 prev_* 를 쓴다.
      const absenceRate: number | null = hasSchedule
        ? Math.round((absentCount * 100 / scheduledToday) * 10) / 10
        : null;

      return admCachePut(env, _tKey, {
        ok: true,
        date: todayKst,
        revenue: { amount_krw: revenue, pay_count: payCount },
        students: { attended, active },
        // rate_pct 는 «모르면 null». 화면은 null 을 «–» 로 그린다(숫자를 지어내지 않는다).
        //   known=false 면 오늘 예정 정보가 아예 없다는 뜻 — 0% 도 100% 도 사실이 아니다.
        // scheduled·absent 는 «사실» 이므로 그대로 내보낸다. rate_pct 만 null 이다.
        //   reason 은 화면이 «왜 못 내는지» 를 사람 말로 보여주기 위한 것.
        absence: {
          rate_pct: absenceRate, absent: absentCount, scheduled: scheduledToday,
          known: hasSchedule, reason: hasSchedule ? null : 'today_in_progress',
          // 오늘 진행상황(사실) + 직전 영업일 미실시율(판단용)
          booked_today: bookedToday, done_today: doneToday,
          prev_date: schedRow?.prev_date || null, prev_rate_pct: prevRate,
          prev_booked: prevBooked, prev_done: prevDone,
          // 📏 잣대 — 같은 요일 «굳은 날»(15일 이상 지난 날, 최근 60일) 평균 미실시율.
          //    표본 100건 미만이면 null(잣대로 못 씀). 화면은 있을 때만 나란히 그린다.
          weekday_avg_pct: wdRate, weekday_sample: wdBooked,
        },
        signups: { count: signups }
      }, 60);
    }

    // ═══════════════════════════════════════════════════════════════
    // 📊 Phase D1~D2 — 운영 KPI 통합 대시보드
    // ═══════════════════════════════════════════════════════════════

    // ── GET /api/admin/kpi/dashboard — 학원 핵심 KPI 한 번에 ──
    if (method === 'GET' && path === '/api/admin/kpi/dashboard') {
      // 🔒 세션 기반 강제 스코프 — 지사/대리점은 자기 범위만(본사=전체). 누수 차단.
      const _sf = await scopeFragments(env, request);
      const _uidScope = _sf.uidScope, _erpScope = _sf.erpScope, _sb = _sf.binds;

      // ⚡ KV 캐시(180초) — 대시보드 진입마다 20여 개 D1 쿼리를 다시 돌지 않게.
      //   스코프(cond+binds)를 키에 포함해 지사/대리점 크로스테넌트 격리(retrisk 와 동일 원칙).
      const _kpiKey = 'admkpi2:' + (_erpScope || 'all') + '|' + _sb.join(',');
      const _kpiHit = await admCacheHit(env, _kpiKey);
      if (_kpiHit) return _kpiHit;

      // 안전망 - 필요 테이블 모두 ensure (캐시 미스일 때만 → 요청당 왕복 절약)
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS students_erp (user_id TEXT PRIMARY KEY, username TEXT, name TEXT, phone TEXT, parent_phone TEXT, status TEXT, created_at INTEGER);`); } catch {}
      /* ⚠️ memo 칸이 빠져 있으면 notSeedSql() 이 «no such column: memo» 로 죽는다.
         (지금은 fetch1 이 삼켜서 KPI 가 조용히 0 이 될 뿐이지만, 새 환경에서 매출이
          0 으로 보이는 게 더 나쁘다.) 다른 ensure 문들과 같은 모양으로 맞춘다. */
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, paid_at INTEGER, amount_krw INTEGER NOT NULL, method TEXT, memo TEXT, status TEXT DEFAULT 'paid', created_at INTEGER NOT NULL);`); } catch {}
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS class_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, scheduled_date TEXT, status TEXT, created_at INTEGER);`); } catch {}

      const now = Date.now();
      // 📊 (2026-10-13) 기간은 KST 달력 기준. 비교는 «지난달 같은 날수» — 예전엔 이번 달 13일치를
      //   지난달 한 달 전체와 비교해 매달 초 늘 빨간불(−80%)이었다. 정본 src/kpi-active.ts.
      const _mb = kstMonthBounds(now);
      const thisMonthStart = _mb.thisStart, thisMonthEnd = _mb.thisEnd;
      const lastMonthStart = _mb.lastStart, lastMonthEnd = _mb.lastEnd, lastSameEnd = _mb.lastSameEnd;
      // 30일/7일
      const last30Start = now - 30*86400*1000;
      const last7Start = now - 7*86400*1000;

      const fetch1 = async (sql: string, ...binds: any[]): Promise<any> => {
        try { return await env.DB.prepare(sql).bind(...binds).first(); }
        catch (e) { console.warn('[kpi] query failed', (e as any)?.message); return {}; }
      };
      const fetchAll = async (sql: string, ...binds: any[]): Promise<any[]> => {
        try { const rs = await env.DB.prepare(sql).bind(...binds).all(); return rs.results || []; }
        catch (e) { return []; }
      };

      // 상담/푸시 테이블 안전망 (아래 병렬 배치가 참조)
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS inquiries (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, phone TEXT, message TEXT, created_at INTEGER);`); } catch {}
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS push_subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, endpoint TEXT NOT NULL UNIQUE, enabled INTEGER DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`); } catch {}
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS push_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, endpoint TEXT, queued_at INTEGER NOT NULL, fetched_at INTEGER);`); } catch {}

      // ⚡ 26-07-22 성능: 독립 쿼리는 전부 Promise.all 병렬 + 7일 매출은 GROUP BY 1쿼리로 배칭.
      const cutoff35 = now - OVERDUE_GRACE_DAYS * 86400 * 1000;
      const revBase = kstMidnight(now) - 6 * 86400000;   // KST 6일 전 자정(첫 버킷)
      const _ab = activeBinds(now);

      const [
        studentTotal, studentNewThisMonth, studentNewLastMonth,
        revThisMonth, revLastMonth,
        a1, a2, e1, o1, p1, c1, oc, i1, ps, pq, revBuckets,
        rosterTotal, revLastSame, absentRow, a2full
      ] = await Promise.all([
        // «활동 학생» = 최근 30일 수업 예약·카페24 예약·실접속이 있는 학생 (명부 전체가 아님)
        fetch1(activeCountSql(_erpScope), ..._ab, ..._sb),
        fetch1(`SELECT COUNT(*) AS n FROM students_erp WHERE created_at >= ? AND created_at < ?${_erpScope}`, thisMonthStart, now, ..._sb),
        fetch1(`SELECT COUNT(*) AS n FROM students_erp WHERE created_at >= ? AND created_at < ?${_erpScope}`, lastMonthStart, lastSameEnd, ..._sb),
        fetch1(`SELECT IFNULL(SUM(amount_krw),0) AS sum, COUNT(*) AS n FROM student_payments WHERE status='paid' AND ${notSeedSql()} AND paid_at >= ? AND paid_at < ?${_uidScope}`, thisMonthStart, thisMonthEnd, ..._sb),
        fetch1(`SELECT IFNULL(SUM(amount_krw),0) AS sum, COUNT(*) AS n FROM student_payments WHERE status='paid' AND ${notSeedSql()} AND paid_at >= ? AND paid_at < ?${_uidScope}`, lastMonthStart, lastMonthEnd, ..._sb),
        // «수업 기록» 회수 = attendance (학생·날짜 한 번). 예전엔 «출석 포인트 지급 건수»(point_rule_log)였다.
        fetch1(classDaysSql(_erpScope), thisMonthStart, now, ..._sb),
        fetch1(classDaysSql(_erpScope), lastMonthStart, lastSameEnd, ..._sb),
        fetch1(`SELECT IFNULL(AVG(score_overall),0) AS avg, COUNT(*) AS n, IFNULL(SUM(parent_notified),0) AS notified FROM student_evaluations WHERE created_at >= ? AND created_at < ?`, thisMonthStart, thisMonthEnd),
        fetch1(`SELECT COUNT(*) AS n FROM payment_overdue_log WHERE status='sent' AND sent_at >= ? AND sent_at < ?`, thisMonthStart, thisMonthEnd),
        fetch1(`SELECT IFNULL(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END),0) AS earned, IFNULL(SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END),0) AS spent FROM point_transactions WHERE created_at >= ? AND created_at < ?`, thisMonthStart, thisMonthEnd),
        fetch1(`SELECT COUNT(*) AS n FROM chat_messages WHERE sent_at >= ? AND sent_at < ?`, thisMonthStart, thisMonthEnd),
        // «미납» = 결제 기록이 한 번이라도 있는 활동 학생 중 35일 넘게 결제 없음
        fetch1(overdueSql(_erpScope), ..._ab, cutoff35, ..._sb),
        fetch1(`SELECT COUNT(*) AS n FROM inquiries WHERE created_at >= ?`, last30Start),
        fetch1(`SELECT COUNT(*) AS n FROM push_subscriptions WHERE enabled = 1`),
        fetch1(`SELECT COUNT(*) AS sent, IFNULL(SUM(CASE WHEN fetched_at IS NOT NULL THEN 1 ELSE 0 END),0) AS fetched FROM push_queue WHERE queued_at >= ? AND queued_at < ?`, thisMonthStart, thisMonthEnd),
        fetchAll(`SELECT CAST((paid_at - ?) / 86400000 AS INTEGER) AS d, IFNULL(SUM(amount_krw),0) AS sum
                   FROM student_payments WHERE status='paid' AND ${notSeedSql()} AND paid_at >= ? AND paid_at < ?${_uidScope} GROUP BY d`,
                 revBase, revBase, revBase + 7 * 86400000, ..._sb),
        fetch1(`SELECT COUNT(*) AS n FROM students_erp WHERE (status IN ('정상','활동','active') OR status IS NULL OR status = '')${_erpScope}`, ..._sb),
        fetch1(`SELECT IFNULL(SUM(amount_krw),0) AS sum, COUNT(*) AS n FROM student_payments WHERE status='paid' AND ${notSeedSql()} AND paid_at >= ? AND paid_at < ?${_uidScope}`, lastMonthStart, lastSameEnd, ..._sb),
        fetch1(absentSql(_erpScope), ..._ab, now - ABSENT_DAYS * 86400000, now, ..._sb),
        fetch1(classDaysSql(_erpScope), lastMonthStart, lastMonthEnd, ..._sb),
      ]) as any[];

      const attendanceThisMonth = a1?.n || 0;
      const attendanceLastMonth = a2?.n || 0;
      const evalAvgThisMonth = Math.round((e1?.avg || 0) * 10) / 10;
      const evalCountThisMonth = e1?.n || 0;
      const evalNotifiedThisMonth = e1?.notified || 0;
      const overdueNotifyThisMonth = o1?.n || 0;
      const pointsEarnedThisMonth = p1?.earned || 0;
      const pointsSpentThisMonth = p1?.spent || 0;
      const chatMessagesThisMonth = c1?.n || 0;
      const overdueCount = oc?.overdue || 0;
      const overduePaidEver = oc?.paid_ever || 0;
      const inquiryLast30 = i1?.n || 0;

      const pushKpi: any = { active_subs: 0, queued_this_month: 0, fetched_this_month: 0, delivery_rate: 0 };
      pushKpi.active_subs = ps?.n || 0;
      pushKpi.queued_this_month = pq?.sent || 0;
      pushKpi.fetched_this_month = pq?.fetched || 0;
      pushKpi.delivery_rate = pushKpi.queued_this_month > 0 ? Math.round((pushKpi.fetched_this_month / pushKpi.queued_this_month) * 100) : 0;

      // 최근 7일 일별 매출 — GROUP BY 버킷을 7일 배열로 펼침(빈 날=0, 기존 루프와 동일 결과)
      const bucketMap: Record<number, number> = {};
      for (const r of (revBuckets || [])) bucketMap[Number(r.d)] = r.sum || 0;
      const dailyRev: any[] = [];
      for (let i = 0; i < 7; i++) {
        dailyRev.push({ date: kstDateStr(revBase + i * 86400000).slice(5, 10), revenue: bucketMap[i] || 0 });
      }

      // 비율 계산 — «지난달 같은 날수» 와 비교. 비교 대상이 0 이면 null(비교 불가) — 100% 로 지어내지 않는다.
      const trend = trendPct;

      return admCachePut(env, _kpiKey, {
        ok: true,
        ts: now,
        period: { this_month_start: thisMonthStart, this_month_end: thisMonthEnd, last_month_start: lastMonthStart,
                  last_month_same_end: lastSameEnd, elapsed_days: _mb.elapsedDays, compare: 'same_days' },
        def_version: KPI_DEF_VERSION,
        kpi: {
          students: {
            total: studentTotal?.n || 0,          // «활동 학생»(최근 30일 수업이 있는 학생) — 명부 전체 아님
            roster_total: rosterTotal?.n || 0,    // 명부(students_erp) 전체 — 참고용
            active_window_days: ACTIVE_WINDOW_DAYS,
            absent_14d: absentRow?.n || 0,        // 활동 학생 중 최근 14일 수업 기록 없음
            new_this_month: studentNewThisMonth?.n || 0,
            new_last_month: studentNewLastMonth?.n || 0,
            trend: trend(studentNewThisMonth?.n || 0, studentNewLastMonth?.n || 0),
          },
          revenue: {
            this_month: revThisMonth?.sum || 0,
            last_month: revLastMonth?.sum || 0,          // 지난달 한 달 전체(참고)
            last_month_same: revLastSame?.sum || 0,      // 지난달 같은 날수 — 비교 기준
            this_month_count: revThisMonth?.n || 0,
            trend: trend(revThisMonth?.sum || 0, revLastSame?.sum || 0),
          },
          attendance: {
            // «수업 기록» 회수(학생·날짜 한 번, 카페24 예약 포함) — 출석 포인트 건수가 아님
            this_month: attendanceThisMonth,
            last_month: attendanceLastMonth,             // 지난달 같은 날수
            last_month_full: a2full?.n || 0,
            trend: trend(attendanceThisMonth, attendanceLastMonth),
          },
          evaluation: {
            avg_score: evalAvgThisMonth,
            count: evalCountThisMonth,
            notified: evalNotifiedThisMonth,
          },
          overdue: {
            count: overdueCount,           // 결제 기록이 있는 활동 학생 중 35일 넘게 결제 없음
            paid_ever: overduePaidEver,    // 그 분모(결제 기록이 있는 활동 학생)
            notified_this_month: overdueNotifyThisMonth,
          },
          points: {
            earned_this_month: pointsEarnedThisMonth,
            spent_this_month: pointsSpentThisMonth,
          },
          chat: {
            messages_this_month: chatMessagesThisMonth,
          },
          inquiry: {
            last_30_days: inquiryLast30,
          },
          push: pushKpi,
        },
        daily_revenue: dailyRev,
      }, 180);
    }
    // ═══════════════════════════════════════════════════════════════
    // 📊 Phase D1~D2 끝
    // ═══════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════
    // 💵 Phase 15 — 매출/랭킹/학생흐름/저장소 통계 (읽기전용)
    // ═══════════════════════════════════════════════════════════════
    if (method === 'GET' && path === '/api/admin/stats/revenue') {
      // 신규 환경에서 student_payments 가 없을 수 있으니 자동 생성
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, paid_at INTEGER, period_start TEXT, period_end TEXT, amount_krw INTEGER NOT NULL, method TEXT, memo TEXT, status TEXT DEFAULT 'paid', created_at INTEGER NOT NULL);`);

      const period = (url.searchParams.get('period') || 'day').toLowerCase();
      const fromStr = url.searchParams.get('from') || '';
      const toStr = url.searchParams.get('to') || '';
      const validPeriods = new Set(['day', 'month', 'quarter', 'half', 'year']);
      if (!validPeriods.has(period)) {
        return json({ ok: false, error: 'invalid_period', allowed: Array.from(validPeriods) }, 400);
      }

      // 기본 기간: 최근 90일 (period 가 day) / 최근 1년 (그 외)
      const now = Date.now();
      let fromMs = 0, toMs = now + 86400000;
      // 사용자 입력 YYYY-MM-DD 는 KST 기준으로 해석 (기존 UTC 해석은 KST 0~9시 데이터를 누락시킴)
      if (/^\d{4}-\d{2}-\d{2}$/.test(fromStr)) fromMs = new Date(fromStr + 'T00:00:00+09:00').getTime();
      else if (period === 'day') fromMs = now - 90 * 86400000;
      else fromMs = now - 365 * 86400000;
      if (/^\d{4}-\d{2}-\d{2}$/.test(toStr)) toMs = new Date(toStr + 'T23:59:59+09:00').getTime();

      // SQLite expression: KST 기준 date() 변환 (paid_at = ms → seconds → +9h shift)
      const kstDate = `date((paid_at + 32400000) / 1000, 'unixepoch')`;
      let groupExpr = '';
      let labelExpr = '';
      if (period === 'day') {
        groupExpr = kstDate; labelExpr = kstDate;
      } else if (period === 'month') {
        groupExpr = `substr(${kstDate}, 1, 7)`;
        labelExpr = groupExpr;
      } else if (period === 'quarter') {
        // YYYY-Qn
        groupExpr = `substr(${kstDate}, 1, 4) || '-Q' || ((CAST(substr(${kstDate}, 6, 2) AS INTEGER) + 2) / 3)`;
        labelExpr = groupExpr;
      } else if (period === 'half') {
        groupExpr = `substr(${kstDate}, 1, 4) || '-' || (CASE WHEN CAST(substr(${kstDate}, 6, 2) AS INTEGER) <= 6 THEN '1H' ELSE '2H' END)`;
        labelExpr = groupExpr;
      } else { // year
        groupExpr = `substr(${kstDate}, 1, 4)`;
        labelExpr = groupExpr;
      }

      const _sf = await scopeFragments(env, request);
      const _uidScope = _sf.uidScope, _sb = _sf.binds;

      try {
        const rows = await env.DB.prepare(
          `SELECT ${labelExpr} AS label, SUM(amount_krw) AS revenue, COUNT(*) AS pay_count
           FROM student_payments
           WHERE status = 'paid' AND paid_at IS NOT NULL AND ${notSeedSql()} AND paid_at BETWEEN ? AND ?${_uidScope}
           GROUP BY ${groupExpr}
           ORDER BY label ASC`
        ).bind(fromMs, toMs, ..._sb).all<{ label: string; revenue: number; pay_count: number }>();

        const items = (rows.results || []);
        const total = items.reduce((s, r) => s + (r.revenue || 0), 0);

        // 추가 요약: 일/월/분기/반기/연 매출 (현재 시점 기준)
        const todayKst = new Date(Date.now() + 9*3600*1000).toISOString().slice(0,10);
        const thisMonth = todayKst.slice(0, 7);
        const thisYear = todayKst.slice(0, 4);
        const thisMonthNum = parseInt(todayKst.slice(5, 7), 10);
        const thisQuarter = thisYear + '-Q' + (Math.floor((thisMonthNum - 1) / 3) + 1);
        const thisHalf = thisYear + '-' + (thisMonthNum <= 6 ? '1H' : '2H');

        const summaryRows = await env.DB.prepare(
          `SELECT
             COALESCE(SUM(CASE WHEN ${kstDate} = ? THEN amount_krw END), 0) AS today_rev,
             COALESCE(SUM(CASE WHEN substr(${kstDate}, 1, 7) = ? THEN amount_krw END), 0) AS month_rev,
             COALESCE(SUM(CASE WHEN substr(${kstDate}, 1, 4) || '-Q' || ((CAST(substr(${kstDate}, 6, 2) AS INTEGER) + 2) / 3) = ? THEN amount_krw END), 0) AS quarter_rev,
             COALESCE(SUM(CASE WHEN substr(${kstDate}, 1, 4) || '-' || (CASE WHEN CAST(substr(${kstDate}, 6, 2) AS INTEGER) <= 6 THEN '1H' ELSE '2H' END) = ? THEN amount_krw END), 0) AS half_rev,
             COALESCE(SUM(CASE WHEN substr(${kstDate}, 1, 4) = ? THEN amount_krw END), 0) AS year_rev
           FROM student_payments
           WHERE status = 'paid' AND paid_at IS NOT NULL${_uidScope}`
        ).bind(todayKst, thisMonth, thisQuarter, thisHalf, thisYear, ..._sb).first<any>();

        return json({
          ok: true,
          period,
          from: new Date(fromMs).toISOString().slice(0, 10),
          to:   new Date(toMs).toISOString().slice(0, 10),
          items,
          total,
          summary: summaryRows || { today_rev:0, month_rev:0, quarter_rev:0, half_rev:0, year_rev:0 }
        });
      } catch (e: any) {
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }
    }

    // 🏆 학생 랭킹 — 발화·시선·집중도 3개 지표 통합 (Phase 15c)
    //   GET /api/admin/stats/student-rankings?period=day|week|month|quarter|custom&from=&to=&sort_by=speaking|gaze|focus&limit=10
    //   - 발화 (active_ms / session_ms 비율)
    //   - 시선 (avg gaze_score 0~100)
    //   - 집중도 (composite: 시선 50% + 발화비율 40% - 끊김 10%)
    if (method === 'GET' && path === '/api/admin/stats/student-rankings') {
      /* 🔒 (2026-09-22) 본사 전용 — 이 집계는 스코프를 안 걸어 전국 학생(아이디 포함)이 나온다.
         `/api/admin/stats/` 가 지사·대리점 허용목록에 통째로 있어 여기서 막는다. 정본 src/org-scope-guard.ts */
      {
        const _rkActor = await getAdminActor(request, env as any);
        const _rkDeny = orgScopeDenyResponse(orgScopeVerdict(await readScopeType(env, _rkActor.username), _rkActor.role));
        if (_rkDeny) return _rkDeny;
      }
      const period = (url.searchParams.get('period') || 'week').toLowerCase();
      const fromStr = url.searchParams.get('from') || '';
      const toStr = url.searchParams.get('to') || '';
      const sortBy = (url.searchParams.get('sort_by') || 'focus').toLowerCase();
      const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get('limit') || '10', 10)));

      // 기간 자동 계산 (period 우선, custom 이면 from/to 사용)
      const now = Date.now();
      let fromMs = 0, toMs = now + 1;
      if (period === 'custom' && /^\d{4}-\d{2}-\d{2}$/.test(fromStr)) {
        // KST 기준 해석 (다른 stats 엔드포인트와 통일)
        fromMs = new Date(fromStr + 'T00:00:00+09:00').getTime();
        toMs = /^\d{4}-\d{2}-\d{2}$/.test(toStr) ? new Date(toStr + 'T23:59:59+09:00').getTime() : now + 1;
      } else if (period === 'day') {
        fromMs = now - 1 * 86400000;
      } else if (period === 'week') {
        fromMs = now - 7 * 86400000;
      } else if (period === 'month') {
        fromMs = now - 30 * 86400000;
      } else if (period === 'quarter') {
        fromMs = now - 90 * 86400000;
      } else {
        fromMs = now - 7 * 86400000;   // default: 1주
      }

      try {
        // 학생별 집계 (role='student' 만)
        const rows = await env.DB.prepare(
          `SELECT user_id,
                  COALESCE(MAX(username), user_id) AS username,
                  COUNT(*) AS session_count,
                  COALESCE(SUM(total_active_ms), 0) AS active_ms,
                  COALESCE(SUM(total_session_ms), 0) AS session_ms,
                  COALESCE(SUM(disconnect_count), 0) AS disconnect_sum,
                  AVG(CASE WHEN gaze_score IS NOT NULL THEN gaze_score END) AS avg_gaze,
                  COUNT(CASE WHEN gaze_score IS NOT NULL THEN 1 END) AS gaze_count,
                  MIN(room_id) AS room_min, MAX(room_id) AS room_max,
                  MAX(joined_at) AS last_seen
           FROM attendance
           WHERE joined_at BETWEEN ? AND ?
             AND COALESCE(role, 'student') = 'student'
           GROUP BY user_id
           HAVING session_ms > 0 OR session_count > 0`
        ).bind(fromMs, toMs).all<any>();

        /* 👤 (2026-10-09) 학생 이름 — `user_id` 는 접속마다 새로 나는 기기 번호일 수 있어서
           (CLAUDE.md 「출결만 통째로 0」) 계정(`account_uid`) → 로그인 이름(`username`) →
           `user_id` 순으로 학생 명부(`students_erp.user_id`) **완전일치**로만 이름을 찾는다.
           ⛔ 부분일치·대소문자 무시 금지(동명이인·Kim/kim). 못 찾으면 null(지어내지 않음).
           조회가 실패해도 랭킹은 그대로 나가야 하므로 전부 fail-open. */
        const _rkRows: any[] = rows.results || [];
        const _rkAcct = new Map<string, string>();
        try {
          const ar = await env.DB.prepare(
            `SELECT user_id, MAX(account_uid) AS account_uid FROM attendance
              WHERE joined_at BETWEEN ? AND ? AND account_uid IS NOT NULL AND TRIM(account_uid) <> ''
              GROUP BY user_id`
          ).bind(fromMs, toMs).all<any>();
          for (const a of (ar.results || [])) _rkAcct.set(String(a.user_id), String(a.account_uid).trim());
        } catch (_) { /* account_uid 칸이 아직 없는 DB — 이름만 덜 붙는다 */ }
        /* 🔗 (2026-10-09) 「임시번호」 행 — 시선 점수만 보내는 화면(mango-gaze)이 계정 없이
           화상방 접속 번호(peer id)로 행을 만든다. 두 근거로 누구인지 찾는다:
             ① vc_roster(room_id, peer_id) → 그 접속의 계정 (사실)
             ② 방 번호 class-<예약id>-<날짜> → 그 예약의 학생 (추정 — 그 접속이 강사 화면일 수도 있음)
           ②는 화면이 «예약 기준» 이라고 함께 말한다. 방이 둘 이상 섞인 행은 ②를 쓰지 않는다. */
        const _rkRoom = (r: any): string => (r.room_min && r.room_min === r.room_max) ? String(r.room_min) : '';
        const _rkRoster = new Map<string, { acct: string; name: string; role: string }>();
        try {
          const peers = Array.from(new Set(_rkRows.filter(r => _rkRoom(r)).map(r => String(r.user_id))));
          const rr = await selectInChunks<any>(env.DB, peers,
            ph => `SELECT room_id, peer_id, account_uid, name, role FROM vc_roster WHERE peer_id IN (${ph})`,
            { swallowErrors: true });
          for (const x of rr) _rkRoster.set(String(x.room_id) + '|' + String(x.peer_id),
            { acct: String(x.account_uid || '').trim(), name: String(x.name || '').trim(), role: String(x.role || '') });
        } catch (_) { /* 로스터 없이 */ }
        const _rkRosterOf = (r: any) => _rkRoom(r) ? _rkRoster.get(_rkRoom(r) + '|' + String(r.user_id)) : undefined;
        const _rkSched = new Map<number, { uid: string; name: string }>();
        try {
          const ids = Array.from(new Set(_rkRows.map(r => {
            const m = /^class-(\d+)-\d{8}$/.exec(_rkRoom(r)); return m ? Number(m[1]) : 0;
          }).filter(n => n > 0)));
          const sr = await selectInChunks<any>(env.DB, ids,
            ph => `SELECT id, user_id, student_name FROM class_schedules WHERE id IN (${ph})`,
            { swallowErrors: true });
          for (const x of sr) _rkSched.set(Number(x.id), { uid: String(x.user_id || '').trim(), name: String(x.student_name || '').trim() });
        } catch (_) { /* 예약 없이 */ }
        const _rkSchedOf = (r: any) => {
          const m = /^class-(\d+)-\d{8}$/.exec(_rkRoom(r)); return m ? _rkSched.get(Number(m[1])) : undefined;
        };
        const _rkCands = (r: any): string[] => {
          const out: string[] = [];
          const ro = _rkRosterOf(r);
          const sc = _rkSchedOf(r);
          for (const v of [_rkAcct.get(String(r.user_id)), r.username, r.user_id, ro && ro.acct, sc && sc.uid]) {
            const t = String(v == null ? '' : v).trim();
            if (t && out.indexOf(t) < 0) out.push(t);
          }
          return out;
        };
        const _rkNames = new Map<string, string>();
        try {
          const keys = Array.from(new Set(_rkRows.flatMap(_rkCands)));
          const nr = await selectInChunks<any>(env.DB, keys,
            ph => `SELECT user_id, korean_name, student_name, english_name FROM students_erp WHERE user_id IN (${ph})`,
            { swallowErrors: true });
          for (const n of nr) {
            const uid = String(n.user_id || '');
            const nm = [n.korean_name, n.student_name, n.english_name]
              .map(x => String(x == null ? '' : x).trim()).find(x => x && x !== uid);
            if (uid && nm) _rkNames.set(uid, nm);
          }
        } catch (_) { /* 이름 없이 랭킹만 */ }
        /* basis: 'account'(접속 기록의 계정) · 'roster'(화상방 접속 명단) · 'schedule'(그 방 예약 학생 — 추정) */
        const _rkNameOf = (r: any): { name: string | null; uid: string | null; basis: string | null } => {
          for (const v of [_rkAcct.get(String(r.user_id)), r.username, r.user_id]) {
            const k = String(v == null ? '' : v).trim(); const nm = k && _rkNames.get(k);
            if (nm) return { name: nm, uid: k, basis: 'account' };
          }
          const ro = _rkRosterOf(r);
          if (ro && ro.acct) {
            const nm = _rkNames.get(ro.acct);
            if (nm) return { name: nm, uid: ro.acct, basis: 'roster' };
            if (ro.name && ro.name !== ro.acct) return { name: ro.name, uid: ro.acct, basis: 'roster' };
          }
          /* 화상방 명단이 «강사» 라고 하면 예약 학생으로 추정하지 않는다 */
          if (ro && /teacher|admin|observer/i.test(ro.role)) return { name: null, uid: null, basis: null };
          const sc = _rkSchedOf(r);
          if (sc && sc.uid) {
            const nm = _rkNames.get(sc.uid) || (sc.name && sc.name !== sc.uid ? sc.name : '');
            if (nm) return { name: nm, uid: sc.uid, basis: 'schedule' };
          }
          return { name: null, uid: null, basis: null };
        };
        const items = _rkRows.map(r => {
          const _nm = _rkNameOf(r);
          const activeRatio = r.session_ms > 0 ? (r.active_ms / r.session_ms * 100) : 0;
          const avgGaze = r.avg_gaze != null ? Number(r.avg_gaze) : null;
          // 집중도 composite: 시선 50% + 발화 비율 40% - 끊김 페널티 10%
          // 시선 데이터 없으면 발화 비율 70% + 끊김 30% 만 사용
          let focus;
          if (avgGaze != null) {
            const dcPenalty = Math.min(100, (r.disconnect_sum / Math.max(1, r.session_count)) * 20);
            focus = avgGaze * 0.5 + activeRatio * 0.4 - dcPenalty * 0.1;
          } else {
            const dcPenalty = Math.min(100, (r.disconnect_sum / Math.max(1, r.session_count)) * 20);
            focus = activeRatio * 0.7 - dcPenalty * 0.3;
          }
          focus = Math.max(0, Math.min(100, focus));
          return {
            user_id: r.user_id,
            username: r.username,
            student_name: _nm.name,       // 학생 명부 이름(못 찾으면 null)
            student_uid: _nm.uid,         // 그 이름을 찾은 계정
            student_name_basis: _nm.basis, // account·roster·schedule(추정)
            session_count: r.session_count,
            active_ms: r.active_ms,
            session_ms: r.session_ms,
            active_ratio: Math.round(activeRatio * 10) / 10,
            avg_gaze: avgGaze != null ? Math.round(avgGaze * 10) / 10 : null,
            gaze_count: r.gaze_count,
            disconnect_sum: r.disconnect_sum,
            focus_score: Math.round(focus * 10) / 10,
            last_seen: r.last_seen
          };
        });

        // 정렬
        const sorters: Record<string, (a:any,b:any)=>number> = {
          speaking: (a, b) => b.active_ms - a.active_ms,
          gaze:     (a, b) => (b.avg_gaze ?? -1) - (a.avg_gaze ?? -1),
          focus:    (a, b) => b.focus_score - a.focus_score,
          ratio:    (a, b) => b.active_ratio - a.active_ratio,
          sessions: (a, b) => b.session_count - a.session_count
        };
        items.sort(sorters[sortBy] || sorters.focus);

        return json({
          ok: true,
          period,
          from: new Date(fromMs).toISOString().slice(0, 10),
          to: new Date(toMs).toISOString().slice(0, 10),
          sort_by: sortBy,
          total: items.length,
          items: items.slice(0, limit)
        });
      } catch (e: any) {
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }
    }

    if (method === 'GET' && path === '/api/admin/stats/student-flow') {
      // students_erp 의 signup_date / end_date 기준 일자별 흐름
      const fromStr = url.searchParams.get('from') || '';
      const toStr = url.searchParams.get('to') || '';
      const today = new Date(Date.now() + 9*3600*1000).toISOString().slice(0,10);
      const from = /^\d{4}-\d{2}-\d{2}$/.test(fromStr) ? fromStr
                 : new Date(Date.now() - 90*86400000 + 9*3600*1000).toISOString().slice(0,10);
      const to = /^\d{4}-\d{2}-\d{2}$/.test(toStr) ? toStr : today;

      const _sf = await scopeFragments(env, request);
      try {
        // 신규 가입 (signup_date 기준)
        const newRows = await env.DB.prepare(
          `SELECT signup_date AS date, COUNT(*) AS cnt
           FROM students_erp
           WHERE signup_date IS NOT NULL AND signup_date BETWEEN ? AND ?` + _sf.erpScope + `
           GROUP BY signup_date ORDER BY signup_date ASC`
        ).bind(from, to, ..._sf.binds).all<{ date: string; cnt: number }>();

        // 탈락 (end_date < 오늘 + status 가 정상 아님)
        const dropRows = await env.DB.prepare(
          `SELECT end_date AS date, COUNT(*) AS cnt
           FROM students_erp
           WHERE end_date IS NOT NULL AND end_date BETWEEN ? AND ?
             AND end_date < ?
             AND status NOT IN ('정상','활동','active')` + _sf.erpScope + `
           GROUP BY end_date ORDER BY end_date ASC`
        ).bind(from, to, today, ..._sf.binds).all<{ date: string; cnt: number }>();

        // 전체 학생 수 (현재 활성 — 종료일 미만이거나 미설정)
        const activeRow = await env.DB.prepare(
          `SELECT COUNT(*) AS active
           FROM students_erp
           WHERE (end_date IS NULL OR end_date >= ?)` + _sf.erpScope + ``
        ).bind(today, ..._sf.binds).first<{ active: number }>();

        const totalNew = (newRows.results || []).reduce((s, r) => s + (r.cnt || 0), 0);
        const totalDropped = (dropRows.results || []).reduce((s, r) => s + (r.cnt || 0), 0);

        return json({
          ok: true,
          from, to,
          new_by_date: newRows.results || [],
          dropped_by_date: dropRows.results || [],
          active: activeRow?.active || 0,
          total_new: totalNew,
          total_dropped: totalDropped,
          net_growth: totalNew - totalDropped
        });
      } catch (e: any) {
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }
    }

    // ===== 📊 UX 사용률 통계 =====
    //   GET /api/admin/ux/stats?days=14 — 기능(key)별 클릭수·사용자수 + 일별 추이 (뷰어: /ux-stats.html)
    //   수집원 = POST /api/games/ux-track (ux_events). 테이블 미생성(수집 전)이면 빈 결과.
    if (method === 'GET' && path === '/api/admin/ux/stats') {
      try {
        const days = Math.min(90, Math.max(1, parseInt(url.searchParams.get('days') || '14', 10) || 14));
        const since = new Date(Date.now() + 9 * 3600 * 1000 - (days - 1) * 86400000).toISOString().slice(0, 10);
        let byKey: any[] = [], byDay: any[] = [];
        try {
          const rs = await env.DB.prepare(
            `SELECT key, SUM(hits) AS hits, COUNT(DISTINCT uid) AS users, COUNT(DISTINCT day) AS active_days
             FROM ux_events WHERE day >= ? GROUP BY key ORDER BY hits DESC LIMIT 300`
          ).bind(since).all();
          byKey = (rs.results as any[]) || [];
          const rd = await env.DB.prepare(
            `SELECT day, SUM(hits) AS hits, COUNT(DISTINCT uid) AS users
             FROM ux_events WHERE day >= ? GROUP BY day ORDER BY day ASC`
          ).bind(since).all();
          byDay = (rd.results as any[]) || [];
        } catch { /* 수집 전(테이블 없음) → 빈 결과 */ }
        return json({ ok: true, days, since, by_key: byKey, by_day: byDay });
      } catch (e: any) {
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }
    }

    // ===== 💰 저장소·비용 통계 (Phase 7) =====
    //   GET /api/admin/stats/storage
    //   - D1 테이블별 row 수 + 녹화 총 size_bytes
    //   - R2 객체 수·총 size (list 1페이지 = 최대 1,000 객체, 초과 시 truncated)
    //   - KV 는 list() 가 일일 한도 소비라 측정 제외 (dashboard 안내)
    //   - 집계가 무거워 리소스 한도 503 이력 → KV 5분 캐시 + R2 나열 1페이지 제한
    if (method === 'GET' && path === '/api/admin/stats/storage') {
      const started = Date.now();

      const STORAGE_STATS_CACHE_KEY = 'admin:stats:storage:v1';
      try {
        const hit = await env.SESSION_STATE.get(STORAGE_STATS_CACHE_KEY);
        if (hit) {
          return json({ ...JSON.parse(hit), cached: true, latencyMs: Date.now() - started });
        }
      } catch { /* 캐시 조회 실패 시 실측으로 진행 */ }

      // D1 비즈니스 메트릭 — 병렬 조회. notification_queue 는 미생성 환경에서 fail 가능 → catch
      const safe = (p: Promise<any>) => p.catch(() => null);
      const [recCount, recSize, recByStatus, attCount, attTotals, emergCount, rewardCount, notifByStatus] = await Promise.all([
        safe(env.DB.prepare(`SELECT COUNT(*) AS c FROM recordings`).first()),
        safe(env.DB.prepare(`SELECT COALESCE(SUM(size_bytes), 0) AS total FROM recordings`).first()),
        safe(env.DB.prepare(`SELECT status, COUNT(*) AS c FROM recordings GROUP BY status`).all()),
        safe(env.DB.prepare(`SELECT COUNT(*) AS c FROM attendance`).first()),
        safe(env.DB.prepare(`SELECT COALESCE(SUM(total_session_ms), 0) AS total_session, COALESCE(SUM(total_active_ms), 0) AS total_active FROM attendance`).first()),
        safe(env.DB.prepare(`SELECT COUNT(*) AS c FROM emergency_events`).first()),
        safe(env.DB.prepare(`SELECT COUNT(*) AS c FROM rewards`).first()),
        safe(env.DB.prepare(`SELECT status, COUNT(*) AS c FROM notification_queue GROUP BY status`).all())
      ]);

      // R2 객체 카운트 — 1페이지(최대 1,000 개)만. 더 크면 truncated=true 로 알림
      let r2Count = 0;
      let r2Size = 0;
      let r2Truncated = false;
      const envAny = env as any;
      if (envAny.RECORDINGS) {
        try {
          const ls: any = await envAny.RECORDINGS.list({ limit: 1000 });
          for (const obj of (ls.objects || [])) {
            r2Count++;
            r2Size += obj.size || 0;
          }
          r2Truncated = !!ls.truncated;
        } catch (e) {
          // 측정 실패해도 D1 메트릭은 반환
        }
      }

      const storagePayload = {
        ok: true,
        timestamp: Date.now(),
        latencyMs: Date.now() - started,
        d1: {
          recordings: {
            count: (recCount as any)?.c || 0,
            total_size_bytes: (recSize as any)?.total || 0,
            by_status: (recByStatus as any)?.results || []
          },
          attendance: {
            count: (attCount as any)?.c || 0,
            total_session_ms: (attTotals as any)?.total_session || 0,
            total_active_ms:  (attTotals as any)?.total_active  || 0
          },
          emergency_events: (emergCount as any)?.c || 0,
          rewards: (rewardCount as any)?.c || 0,
          notification_queue_by_status: (notifByStatus as any)?.results || []
        },
        r2: {
          configured: !!envAny.RECORDINGS,
          object_count: r2Count,
          total_size_bytes: r2Size,
          truncated: r2Truncated,
          note: r2Truncated ? '1,000 객체 초과 — 정확한 사용량은 Cloudflare dashboard 에서 확인' : null
        },
        kv: {
          note: 'KV 사용량(list/get/put 호출 수) 은 Cloudflare dashboard 에서 확인. list() 호출 자체가 일일 한도 소비라 셀프 측정 제외.'
        }
      };

      try { await env.SESSION_STATE.put(STORAGE_STATS_CACHE_KEY, JSON.stringify(storagePayload), { expirationTtl: 300 }); } catch { /* 캐시 저장 실패 무시 */ }
      return json(storagePayload);
    }
  return null;
}
