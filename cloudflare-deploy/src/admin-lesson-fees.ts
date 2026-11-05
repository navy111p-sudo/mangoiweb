/** Request-local lesson fee calculator. SQL and deduction policy are preserved. */
import type { MangoEnv } from './api-mango';
import { loadHoldRanges, heldOnFor, attendedStudentRooms } from './absence-hold';
import { selectInChunks } from './d1-chunk';
import { teacherPresenceByRoom } from './no-show-truth';
import { splitOriginsFromNotes, splitPastDay } from './schedule-split';
import { RECUR_WEEK_SOURCE_PREFIX } from './recurring-one-week';
import { recurSkippedOn } from './class-start-date';
import { loadHolidayClosure, isHolidayClosedFor, type HolidayClosure } from './holiday-closure';
export function createLessonFeeCalculator(env: MangoEnv) {



    // ═══════════════════════════════════════════════════════════════
    // 💼 Phase G1~G2 — 강사 급여 자동 정산
    // ═══════════════════════════════════════════════════════════════

    const ensurePayrollTable = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS teacher_payroll (id INTEGER PRIMARY KEY AUTOINCREMENT, teacher_id INTEGER NOT NULL, teacher_name TEXT, year INTEGER NOT NULL, month INTEGER NOT NULL, lesson_count INTEGER DEFAULT 0, total_minutes INTEGER DEFAULT 0, fee_per_10min INTEGER DEFAULT 0, calculated_amount INTEGER DEFAULT 0, adjusted_amount INTEGER, paid_amount INTEGER, status TEXT DEFAULT 'pending', paid_at INTEGER, memo TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, UNIQUE(teacher_id, year, month));`);
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_payroll_period ON teacher_payroll(year, month)`); } catch {}
      // 💼 G3 — 공제(deduction) 반영 정산: 공제합계·실지급액 컬럼 추가(기존 배포 DB 호환 ALTER)
      try { await env.DB.exec(`ALTER TABLE teacher_payroll ADD COLUMN deduction_total INTEGER DEFAULT 0`); } catch {}
      try { await env.DB.exec(`ALTER TABLE teacher_payroll ADD COLUMN final_amount INTEGER`); } catch {}
    };


    // ── 💼 G3 — 공제(Deduction) 규칙 테이블 ──
    //   마이마이 요청(2026-07): "당일 피드백 미작성 -50 PHP" 같은 공제를 관리자가
    //   금액·켜기/끄기로 조절. rule_type: per_lesson(수업 1건당 차감) | policy_percent(지급률 정책)
    const ensureDeductionRules = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS payroll_deduction_rules (code TEXT PRIMARY KEY, label_ko TEXT, label_en TEXT, rule_type TEXT DEFAULT 'per_lesson', amount REAL DEFAULT 0, enabled INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0, updated_at INTEGER)`);
      const now = Date.now();
      const cnt: any = await env.DB.prepare(`SELECT COUNT(*) AS c FROM payroll_deduction_rules`).first().catch(() => null);
      if (!cnt || !(cnt.c > 0)) {
        const seed: any[] = [
          // rule_type: per_lesson(수업 1건당) | per_minute(지각 1분당) | policy_percent(지급률 정책)
          ['no_feedback_day',    '당일 피드백 미작성 (수업 1건당 차감)',       'No feedback within the day (per lesson)',  'per_lesson',    25, 1, 1],
          ['late_no_extend',     '지각 수업 연장 실패 (지각 1분당 차감)',       'Late lesson not extended (per late min)',  'per_minute',    10, 1, 2],
          ['teacher_no_show',    '강사 미입장·노쇼 (수업 1건당 차감)',         'Teacher no-show (per lesson)',             'per_lesson',     0, 0, 3],
          ['absent_pay_percent', '학생 결석 시 지급률(%)',                     'Pay rate when student is absent (%)',      'policy_percent', 0, 1, 4],
        ];
        for (const s of seed) {
          try { await env.DB.prepare(`INSERT OR IGNORE INTO payroll_deduction_rules (code,label_ko,label_en,rule_type,amount,enabled,sort_order,updated_at) VALUES (?,?,?,?,?,?,?,?)`).bind(s[0], s[1], s[2], s[3], s[4], s[5], s[6], now).run(); } catch {}
        }
      }
      // ── 기존 배포 DB 호환 마이그레이션(멱등) ──
      //   ① 지각 연장실패(per_minute) 규칙이 없으면 추가 (2026-07-14 신규 정책)
      try {
        await env.DB.prepare(`INSERT OR IGNORE INTO payroll_deduction_rules (code,label_ko,label_en,rule_type,amount,enabled,sort_order,updated_at) VALUES ('late_no_extend','지각 수업 연장 실패 (지각 1분당 차감)','Late lesson not extended (per late min)','per_minute',10,1,2,?)`).bind(now).run();
      } catch {}
      /*   ③ (2026-08-08) 연기된 수업의 지급률 — 마이마이 요청 「수업료 상태에 연기를 넣어 달라」.
             ⚠️ 기본값을 **100** 으로 넣는다. 지금까지 연기된 수업은 그냥 «완료» 로 섞여 전액
             지급돼 왔다 — 여기서 0 으로 시작하면 아무 공지 없이 강사 급여가 깎인다.
             «보이게» 만드는 것과 «금액을 바꾸는» 것은 다른 결정이라 분리한다.
             금액 정책은 관리자 화면의 공제 규칙에서 사장님이 정하면 된다. */
      try {
        await env.DB.prepare(`INSERT OR IGNORE INTO payroll_deduction_rules (code,label_ko,label_en,rule_type,amount,enabled,sort_order,updated_at) VALUES ('postponed_pay_percent','연기된 수업 지급률(%)','Pay rate for postponed lessons (%)','policy_percent',100,1,5,?)`).bind(now).run();
      } catch {}
      /*   ④ (2026-08-07) 「30분보다 일찍 연기한 수업」 의 지급률 — 마이마이 문서 ② 의 규칙:
             · 시작 30분 이내 연기 → 전액(위 postponed_pay_percent, 기본 100)
             · 30분보다 이른 연기  → 0
           ✅ (2026-08-13) **사장님이 「30분전 연기는 0으로」 지시하셨다 → 켠다.**
              8/7 에는 «급여를 조용히 깎지 않는다» 는 이유로 enabled=0 으로 넣어 두었고,
              오늘 사람이 결정했으므로 스위치를 올린다. amount 는 그대로 0(%).
              끄고 싶으면 관리자 → 급여 → 공제 규칙에서 [사전 연기 지급률] 을 끄면
              즉시 예전 계산(전액 지급)으로 돌아간다. */
      try {
        await env.DB.prepare(`INSERT OR IGNORE INTO payroll_deduction_rules (code,label_ko,label_en,rule_type,amount,enabled,sort_order,updated_at) VALUES ('postponed_early_pay_percent','사전 연기(시작 30분보다 이전) 지급률(%)','Pay rate when postponed more than 30 min before (%)','policy_percent',0,1,6,?)`).bind(now).run();
      } catch {}
      /*   ④-b (2026-08-13) 이미 배포된 DB 에는 위 행이 **enabled=0 으로 이미 들어가 있다**
             (INSERT OR IGNORE 라 위 문장은 아무 일도 하지 않는다). 그래서 1회 마이그레이션으로
             스위치를 올린다 — 위의 nofb_25 와 같은 방식이다.
           ⚠️ 관리자가 **일부러 꺼 둔 것**까지 되켜면 안 되므로 플래그로 딱 한 번만 돈다.
              amount 는 손대지 않는다(사장님이 0 이외의 값을 넣어 두셨다면 그 값을 지킨다). */
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS payroll_meta (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)`);
        const earlyFlag: any = await env.DB.prepare(`SELECT value FROM payroll_meta WHERE key = 'early_postpone_on_260813'`).first().catch(() => null);
        if (!earlyFlag) {
          await env.DB.prepare(`UPDATE payroll_deduction_rules SET enabled = 1, updated_at = ? WHERE code = 'postponed_early_pay_percent'`).bind(now).run().catch(() => {});
          await env.DB.prepare(`INSERT OR REPLACE INTO payroll_meta (key,value,updated_at) VALUES ('early_postpone_on_260813','1',?)`).bind(now).run().catch(() => {});
        }
      } catch {}
      //   ② 당일 피드백 미작성 공제: 정책 변경 -50 → -25. 관리자가 손대지 않은 옛 기본값(50)만 1회 갱신.
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS payroll_meta (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)`);
        const flag: any = await env.DB.prepare(`SELECT value FROM payroll_meta WHERE key = 'nofb_25_migrated'`).first().catch(() => null);
        if (!flag) {
          await env.DB.prepare(`UPDATE payroll_deduction_rules SET amount = 25, updated_at = ? WHERE code = 'no_feedback_day' AND amount = 50`).bind(now).run().catch(() => {});
          await env.DB.prepare(`INSERT OR REPLACE INTO payroll_meta (key,value,updated_at) VALUES ('nofb_25_migrated','1',?)`).bind(now).run().catch(() => {});
        }
      } catch {}
    };


    // ── 💼 강사 등급(Level) — 등급별 기본 요율(per 20분 수업). 참고사 포맷의 "Teacher's level (rate)".
    //   기본(Teacher 1)=₱50, 상위(Teacher 2)=₱70. 관리자가 등급 요율을 조정하고,
    //   강사에게 등급을 지정하면 그 강사의 fee_per_10min 이 등급 요율/2 로 자동 세팅된다(수정 가능).
    const ensureTeacherLevels = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS payroll_levels (code TEXT PRIMARY KEY, label_ko TEXT, label_en TEXT, rate_per_20min REAL DEFAULT 0, sort_order INTEGER DEFAULT 0, updated_at INTEGER)`);
      const now = Date.now();
      const cnt: any = await env.DB.prepare(`SELECT COUNT(*) AS c FROM payroll_levels`).first().catch(() => null);
      if (!cnt || !(cnt.c > 0)) {
        const seed: any[] = [
          ['teacher_1', 'Teacher 1 (기본)', 'Teacher 1 (Basic)',  50, 1],
          ['teacher_2', 'Teacher 2 (상위)', 'Teacher 2 (Senior)', 70, 2],
        ];
        for (const s of seed) {
          try { await env.DB.prepare(`INSERT OR IGNORE INTO payroll_levels (code,label_ko,label_en,rate_per_20min,sort_order,updated_at) VALUES (?,?,?,?,?,?)`).bind(s[0], s[1], s[2], s[3], s[4], now).run(); } catch {}
        }
      }
      // teacher_profiles 에 등급 컬럼(기존 배포 DB 호환)
      try { await env.DB.exec(`ALTER TABLE teacher_profiles ADD COLUMN level TEXT`); } catch {}
    };


    // ── 💼 G3 — 월별 수업 한 건씩(Lesson Fee Summary) + 공제 자동 계산 ──
    //   class_schedules(수업) + class_no_show(결석/노쇼) + teacher_class_feedback(당일 피드백)을
    //   JS에서 매칭(스케줄 날짜 포맷이 '2026-07-01'/'2026/07/01' 혼재라 SQL 조인 대신 안전한 JS 매칭).
    //   수업↔피드백 정확 연결: 예약기반 결정론 room_id = `class-{scheduleId}-{YYYYMMDD}` (Phase RM 규칙 재사용)
    const computeLessonFeeMonth = async (year: number, month: number) => {
      await ensurePayrollTable();
      await ensureDeductionRules();
      await ensureTeacherLevels();
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS teacher_profiles (id INTEGER PRIMARY KEY AUTOINCREMENT, korean_name TEXT NOT NULL, english_name TEXT, fee_per_10min INTEGER, status TEXT DEFAULT '활동중', email TEXT, phone TEXT);`); } catch {}
      // 📌 지각 연장실패 수동 입력(관리자가 상세표에서 수업별 지각분 기입) — 근태 자동로그 도입 전까지 사용
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS lesson_late_minutes (schedule_id INTEGER NOT NULL, lesson_date TEXT NOT NULL, minutes INTEGER DEFAULT 0, updated_by TEXT, updated_at INTEGER, PRIMARY KEY (schedule_id, lesson_date));`); } catch {}
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS class_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, teacher_id INTEGER, teacher_name TEXT, scheduled_date TEXT, day_of_week INTEGER, start_time TEXT, duration_minutes INTEGER, status TEXT);`); } catch {}
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS class_no_show (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT, schedule_id INTEGER, missing_role TEXT, missing_uid TEXT, student_name TEXT, teacher_name TEXT, lesson_title TEXT, waited_min INTEGER, notified_push INTEGER DEFAULT 0, notified_kakao INTEGER DEFAULT 0, created_at INTEGER NOT NULL)`); } catch {}
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS teacher_class_feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL, teacher_uid TEXT, teacher_name TEXT, student_name TEXT, duration_min INTEGER, metrics_json TEXT, feedback_ko TEXT, feedback_en TEXT, source TEXT, created_at INTEGER NOT NULL, UNIQUE(room_id));`); } catch {}

      // 공제 규칙 로드
      const ruleRows: any = await env.DB.prepare(`SELECT * FROM payroll_deduction_rules ORDER BY sort_order, code`).all().catch(() => ({ results: [] }));
      const rules: any = {};
      (ruleRows.results || []).forEach((r: any) => { rules[r.code] = r; });
      const absentPct = (rules.absent_pay_percent && rules.absent_pay_percent.enabled) ? Math.max(0, Math.min(100, Number(rules.absent_pay_percent.amount) || 0)) : 0;
      /* 연기 지급률 — 규칙이 아예 없는 DB(옛 배포)에서는 100 으로 본다.
         «규칙이 없다» 를 «0% 지급» 으로 읽으면, 마이그레이션이 안 돈 순간 급여가 0 이 된다. */
      const postponePct = rules.postponed_pay_percent
        ? (rules.postponed_pay_percent.enabled ? Math.max(0, Math.min(100, Number(rules.postponed_pay_percent.amount) || 0)) : 100)
        : 100;
      /* ⏸⏱ (2026-08-07 마이마이 ② 「수업료 상태를 이렇게 나눠 달라」)
           문서에 적힌 규칙은 «연기 = 얼마» 가 아니라 **언제 연기했느냐로 갈린다**:
             · 시작 30분 이내에 연기 → 50php(=그 수업 전액). 그 시간엔 슬롯을 못 채운다.
             · 30분보다 일찍 연기     → 0php. 다른 수업을 넣을 시간이 있었다.
           우리 DB 는 이미 요청 시점에 그 판정을 해 두었다(schedule_change_requests.fee_type:
           paid=30분 이내 / free=그 이전). 여기서 **다시 계산하지 않고 그 값을 읽는다** —
           양쪽에서 계산하면 화면과 급여가 갈라진다.
         ✅ (2026-08-13) 사장님 지시 「30분전 연기는 0으로」 → 규칙을 **켠 상태**로 바꿨다
            (위 ensureDeductionRules ④·④-b). 이제 사전 연기(30분보다 이른 연기)는 0% 지급이다.
            되돌리려면 관리자 → 급여 → 공제 규칙에서 [사전 연기 지급률] 을 끄면 즉시 전액 지급으로 복귀. */
      const earlyPostponeRule = rules.postponed_early_pay_percent;
      const earlyPostponeOn = !!(earlyPostponeRule && earlyPostponeRule.enabled);
      const earlyPostponePct = earlyPostponeOn
        ? Math.max(0, Math.min(100, Number(earlyPostponeRule.amount) || 0))
        : postponePct;
      const feeNoFb = (rules.no_feedback_day && rules.no_feedback_day.enabled) ? Math.max(0, Number(rules.no_feedback_day.amount) || 0) : 0;
      const feeTNoShow = (rules.teacher_no_show && rules.teacher_no_show.enabled) ? Math.max(0, Number(rules.teacher_no_show.amount) || 0) : 0;
      const feeLateMin = (rules.late_no_extend && rules.late_no_extend.enabled) ? Math.max(0, Number(rules.late_no_extend.amount) || 0) : 0;

      // 등급(Level) 요율표 로드
      const lvlRows: any = await env.DB.prepare(`SELECT * FROM payroll_levels ORDER BY sort_order, code`).all().catch(() => ({ results: [] }));
      const levelMap: any = {};
      (lvlRows.results || []).forEach((r: any) => { levelMap[r.code] = r; });

      // 수업별 지각(연장실패) 분 — 관리자 수동 입력값
      const lateRows: any = await env.DB.prepare(`SELECT schedule_id, lesson_date, minutes FROM lesson_late_minutes`).all().catch(() => ({ results: [] }));
      const lateMap: any = {};
      (lateRows.results || []).forEach((r: any) => { lateMap[`${r.schedule_id}|${r.lesson_date}`] = Math.max(0, Number(r.minutes) || 0); });

      // 강사 목록 + 단가 + 등급
      //   ⚠️ (2026-08-12) 강사 번호 체계가 **둘**이다 — class_schedules.teacher_id 는 원부
      //   teachers.id 인데 단가·등급·이름은 teacher_profiles 에 있고, 두 id 는 서로 다른
      //   일련번호다(예: KAYE = teachers 8 / profiles 11). 예전엔 tMap[l.teacher_id] 로
      //   프로필을 번호 직조회했는데, 라이브 대조 결과 **우연히라도 일치하는 강사가 0명** —
      //   전원이 남의 프로필(=남의 단가·남의 이름)에 붙어 있었다.
      //   → 원부(teachers)를 함께 읽어 ① linked_teacher_id(관리자 「🔗 강사 연결」/auto-match 가
      //     채우는 수동 연결) ② 정규화 이름 «유일» 일치(auto-match 와 같은 규칙) 순서로
      //     «teachers.id → 프로필» 다리를 놓는다. 동명이인·부분일치는 자동 연결하지 않는다
      //     (틀린 연결 = 남의 급여). linked_teacher_id 컬럼이 없는 배포본도 SELECT * 라 안 죽는다.
      const teachers: any = await env.DB.prepare(
        `SELECT * FROM teacher_profiles WHERE status = '활동중' OR status IS NULL ORDER BY korean_name`
      ).all().catch(() => ({ results: [] }));
      const tByName: any = {};
      for (const t of (teachers.results || [])) { if (t.korean_name) tByName[t.korean_name] = t; if (t.english_name) tByName[t.english_name] = t; }
      const tRows: any = await env.DB.prepare(`SELECT id, name FROM teachers`).all().catch(() => ({ results: [] }));
      const normTeacher = (s: any) => String(s || '').trim().toUpperCase().replace(/^TEACHER\s+/, '').replace(/\s+/g, ' ');
      const teacherNameById: any = {};   // String(teachers.id) → 원부 이름 (프로필 미연결 강사 표시용)
      const profByTeacherId: any = {};   // String(teachers.id) → teacher_profiles 행
      {
        const byNorm = new Map<string, any[]>();
        for (const t of (tRows.results || [])) {
          teacherNameById[String(t.id)] = t.name;
          const n = normTeacher(t.name);
          if (!n) continue;
          if (!byNorm.has(n)) byNorm.set(n, []);
          byNorm.get(n)!.push(t);
        }
        // 1패스: 관리자가 손으로 확인한 연결(linked_teacher_id)이 항상 우선
        for (const p of (teachers.results || [])) {
          const linkTid = (p.linked_teacher_id != null && p.linked_teacher_id !== '') ? String(p.linked_teacher_id) : '';
          if (linkTid && !profByTeacherId[linkTid]) profByTeacherId[linkTid] = p;
        }
        // 2패스: 나머지는 정규화 이름이 «유일하게» 일치할 때만
        for (const p of (teachers.results || [])) {
          if (p.linked_teacher_id != null && p.linked_teacher_id !== '') continue;
          const cands = byNorm.get(normTeacher(p.korean_name)) || byNorm.get(normTeacher(p.english_name)) || [];
          if (cands.length === 1 && !profByTeacherId[String(cands[0].id)]) profByTeacherId[String(cands[0].id)] = p;
        }
      }

      // 이 달 수업 (취소 제외)
      //   ⚠️ 실제 운영 class_schedules 스키마는 코드 DDL과 다르다(2026-07-10 확인):
      //   duration_min(≠duration_minutes), teacher_name 컬럼 없음, teacher_id 는 TEXT("28"),
      //   그리고 전 행이 schedule_kind='recurring'(요일 반복, scheduled_date=NULL).
      //   → SELECT * 로 어떤 스키마든 읽고, 반복 스케줄은 해당 월의 날짜 인스턴스로 전개한다.
      const ymPrefix = `${year}-${String(month).padStart(2, '0')}`;
      //   ⚠️ (2026-08-12) user_id 가 'lms'(구 LMS 점유 슬롯 — 수업이 아니라 자리 표시,
      //   운영 667행 중 대부분)·'type_seed'(시드 데이터)인 행은 급여·출석 계산에서 제외한다.
      //   안 거르면 점유 슬롯이 «완료 수업» 으로 잡혀 급여에 그대로 합산된다.
      const ls: any = await env.DB.prepare(
        `SELECT * FROM class_schedules WHERE COALESCE(status,'active') != 'cancelled' AND teacher_id IS NOT NULL
            AND LOWER(COALESCE(user_id,'')) NOT IN ('lms','type_seed')`
      ).all().catch(() => ({ results: [] }));

      /* 💰 (2026-10-08) «날짜별로 나눈» 매주 줄 — 나누면 원본이 cancelled 가 되어 위 SELECT 에서 빠진다.
         그러면 이미 가르친 «나눈 날 이전» 회차가 급여에서 사라진다. 그 회차만 «원래 id 그대로» 다시 센다
         (노쇼·연기·지각·피드백이 전부 class-{원래id}-날짜 기준이라 새 id 로 만들면 상태가 끊긴다).
         ⚠️ 못 읽으면 빈 목록 — 예전과 같은 결과(빠짐)로 떨어진다. */
      let splitPast: any[] = [];
      try {
        const sk: any = await env.DB.prepare(
          `SELECT notes, MIN(created_at) AS created_at FROM class_schedules
            WHERE scheduled_date IS NOT NULL AND notes LIKE '%을 날짜별로 나눔%' GROUP BY notes`
        ).all();
        const origins = splitOriginsFromNotes((sk && sk.results) || []);
        const sc: any = await env.DB.prepare(
          `SELECT * FROM class_schedules WHERE status = 'cancelled' AND (scheduled_date IS NULL OR scheduled_date = '')
              AND teacher_id IS NOT NULL AND LOWER(COALESCE(user_id,'')) NOT IN ('lms','type_seed')`
        ).all();
        for (const r of ((sc && sc.results) || [])) {
          const day = splitPastDay(r, origins);
          if (day) splitPast.push({ row: r, before: day });
        }
      } catch (e: any) { console.warn('[payroll] 나눈 매주 줄 조회 생략:', e?.message); }
      const DOW: any = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, '일': 0, '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6 };
      const dowOf = (v: any): number | null => {
        if (v == null || v === '') return null;
        if (typeof v === 'number') return (v >= 0 && v <= 6) ? v : null;
        const s = String(v).trim().toLowerCase();
        if (/^\d+$/.test(s)) { const n = parseInt(s, 10); return (n >= 0 && n <= 6) ? n : null; }
        const a = DOW[s.slice(0, 3)]; if (a !== undefined) return a;
        const b = DOW[s.slice(0, 1)]; return b !== undefined ? b : null;
      };
      const daysInMonth = new Date(year, month, 0).getDate();
      const instances: any[] = [];
      for (const row of (ls.results || [])) {
        const mins = row.duration_min ?? row.duration_minutes ?? 30;
        const dated = String(row.scheduled_date || '').replace(/\//g, '-').slice(0, 10);
        if (dated) {
          // 날짜 지정 수업 — 이 달 것만
          if (dated.startsWith(ymPrefix)) instances.push({ ...row, _date: dated, _mins: mins });
          continue;
        }
        // 반복 수업 — 이 달의 해당 요일 날짜들로 전개
        const dw = dowOf(row.day_of_week);
        if (dw == null) continue;
        for (let d = 1; d <= daysInMonth; d++) {
          if (new Date(Date.UTC(year, month - 1, d)).getUTCDay() === dw) {
            const _ymd = `${ymPrefix}-${String(d).padStart(2, '0')}`;
            /* ⏭ (2026-10-09) «그 주만 연기·변경» 한 날은 반복 줄로 세지 않는다 — 그 수업은
               옮긴 하루짜리 줄(또는 '연기' 기록 줄)로 따로 잡힌다(recurring-one-week.ts). 두 번 세지 않게.
               ⚠️ starts_on 은 여기서 일부러 안 본다 — 급여가 바뀌는 별건이다(사람이 정할 일). */
            if (recurSkippedOn(row, _ymd)) continue;
            instances.push({ ...row, _date: _ymd, _mins: mins });
          }
        }
      }
      // 💰 나눈 매주 줄의 «나눈 날 이전» 회차 — 원래 id 그대로(위 splitPast 주석)
      for (const sp of splitPast) {
        const row = sp.row;
        const mins = row.duration_min ?? row.duration_minutes ?? 30;
        const dw = dowOf(row.day_of_week);
        if (dw == null) continue;
        for (let d = 1; d <= daysInMonth; d++) {
          const ds = `${ymPrefix}-${String(d).padStart(2, '0')}`;
          if (ds >= sp.before) break;
          if (new Date(Date.UTC(year, month - 1, d)).getUTCDay() === dw) instances.push({ ...row, status: 'active', _date: ds, _mins: mins });   // 나누기 «전» 상태 그대로
        }
      }
      instances.sort((a, b) => (a._date + (a.start_time || '')).localeCompare(b._date + (b.start_time || '')));

      /* 🎌 (2026-10-09) 공휴일 휴강 — 그날 열리지 않은 수업은 수업료 0(상태 'holiday'), 공제도 안 붙는다.
         중국어 수업(예외 강사)·«이날은 수업함» 으로 연 날은 평소대로. 정본 src/holiday-closure.ts.
         날짜당 한 번 조회(그 달 수업이 있는 날만). 던지지 않는다 — 못 읽으면 «휴강 아님»(예전과 같음). */
      const holByDate: Record<string, HolidayClosure> = {};
      for (const ds of new Set(instances.map((i: any) => String(i._date)))) holByDate[ds] = await loadHolidayClosure(env.DB, ds);

      // 이 달 노쇼·피드백 (KST 기준 월 범위 ms)
      const mStart = Date.parse(`${ymPrefix}-01T00:00:00+09:00`);
      const mEnd = month === 12
        ? Date.parse(`${year + 1}-01-01T00:00:00+09:00`)
        : Date.parse(`${year}-${String(month + 1).padStart(2, '0')}-01T00:00:00+09:00`);
      const kstDay = (ms: number) => new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10);

      // teacher_name·student_name 을 함께 읽는다 — 아래 «오판» 대조(이름 일치 + 학생과의 혼동 배제)에 필요하다.
      const noShows: any = await env.DB.prepare(`SELECT room_id, schedule_id, missing_role, teacher_name, student_name, created_at FROM class_no_show WHERE created_at >= ? AND created_at < ?`).bind(mStart, mEnd).all().catch(() => ({ results: [] }));
      const nsByRoom: any = {}; const nsBySched: any = {};
      for (const n of (noShows.results || [])) {
        if (n.room_id) nsByRoom[n.room_id] = n;
        if (n.schedule_id != null) nsBySched[`${n.schedule_id}|${kstDay(n.created_at)}`] = n;
      }
      /* 🔎 (2026-08-19) 「강사 미입장」이 **정말** 미입장이었나를 출석 기록과 대조한다.
         [왜 급여에서까지] 아래 상태 판정이 teacher_no_show 면 그 수업은 **수업료가 0원**이 된다
         (amount 는 finish·student_absent·postponed 에만 붙는다). 그런데 이 행은 학생 브라우저가
         «내 화면에 안 보였다» 로 만드는 것이라, 두 사람이 서로 다른 워커의 방에 있으면
         강사가 멀쩡히 들어와 있어도 쌓인다(CLAUDE.md 2장) — 실측 13건 중 11건이 오판이었다.
         그대로 두면 «들어와서 수업한 강사에게 0원을 주는» 계산이 된다.
         ⚠️ 판정 정본은 노쇼 리포트·강사 지표와 **같은 함수**다(src/no-show-truth.ts).
            세 곳이 다른 답을 내면 「화면엔 오판이라는데 급여는 0원」이 된다.
         ⚠️ «모름»(판정 불가)은 살려 주지 않는다 — 모르는 것을 «있었다» 로 단정하면
            진짜 노쇼에 수업료가 나간다. 확실히 있었을 때만 되돌린다. */
      let nsPresence = new Map<string, any>();
      try { nsPresence = await teacherPresenceByRoom(env.DB, (noShows.results || []) as any[]); }
      catch (e: any) { console.warn('[payroll] 노쇼 대조 생략:', e?.message); }
      const nsIsFalseAlarm = (n: any): boolean => {
        const p = n && n.room_id ? nsPresence.get(String(n.room_id)) : null;
        return !!(p && p.present === true);
      };

      const fbs: any = await env.DB.prepare(`SELECT room_id, teacher_name, created_at FROM teacher_class_feedback WHERE created_at >= ? AND created_at < ?`).bind(mStart, mEnd).all().catch(() => ({ results: [] }));
      const fbByRoom: any = {}; const fbByTeacherDay: any = {};
      for (const f of (fbs.results || [])) {
        const dkey = kstDay(f.created_at);
        if (f.room_id && !fbByRoom[f.room_id]) fbByRoom[f.room_id] = dkey;
        if (f.teacher_name) fbByTeacherDay[`${f.teacher_name}|${dkey}`] = true;
      }
      /* ⏸ 승인된 연기·취소 요청 — «언제 요청했나»(fee_type)를 수업 행에 붙이기 위해 읽는다.
         · 월 범위로 자르지 않는다: 요청은 지난달에 하고 수업은 이번 달일 수 있다.
           대신 status='approved' + 연기/취소만이라 행 수가 작다(운영 실측 수십 건).
         · 키는 schedule_id|orig_date — 반복 수업은 같은 schedule_id 가 여러 날짜로 도니
           날짜까지 맞춰야 «그날의» 연기가 된다. */
      const prRows: any = await env.DB.prepare(
        `SELECT schedule_id, orig_date, fee_type, minutes_before, created_at
           FROM schedule_change_requests
          WHERE status = 'approved' AND request_type != 'change'`
      ).all().catch(() => ({ results: [] }));
      const postponeReq: any = {};
      for (const r of (prRows.results || [])) {
        if (r.schedule_id == null) continue;
        const d = String(r.orig_date || '').slice(0, 10);
        if (!d) continue;
        const k = `${r.schedule_id}|${d}`;
        // 같은 수업에 요청이 여러 번이면 **마지막 승인** 이 실제로 적용된 것이다.
        const prev = postponeReq[k];
        if (!prev || (Number(r.created_at) || 0) > (Number(prev.created_at) || 0)) postponeReq[k] = r;
      }

      // 📝 Phase FD — AI 초안을 강사가 '승인'한 것도 당일 피드백으로 인정 (승인 시각 기준)
      const fds: any = await env.DB.prepare(`SELECT room_id, approved_at FROM feedback_drafts WHERE status = 'approved' AND approved_at >= ? AND approved_at < ?`).bind(mStart, mEnd).all().catch(() => ({ results: [] }));
      for (const f of (fds.results || [])) {
        if (f.room_id && !fbByRoom[f.room_id]) fbByRoom[f.room_id] = kstDay(f.approved_at);
      }

      /* 📝 (2026-08-09) 강사 화면의 「1분 평가」도 당일 피드백으로 인정한다.
         지금까지 이 판정은 teacher_class_feedback 과 «승인된» feedback_drafts 두 곳만 봤다.
         그런데 강사가 /teacher 에서 실제로 쓰는 평가는 student_evaluations 에 들어간다
         (teacher.html 의 「1분 평가」 → POST /api/eval/create).
         → 성실하게 평가를 쓴 강사도 «미작성» 으로 잡혀 수업 1건당 ₱25 씩 깎이고 있었다.
            강사 화면 맨 위 「⚠ 피드백 미작성」 경고에도 그대로 떴다.
         ⚠️ room_id 정확 매칭만 인정한다 — 위의 «강사명+같은 날» 폴백은 주지 않는다.
            평가 1건으로 그날 수업 전부를 «작성함» 으로 만들면 반대 방향 오류(과소 공제)가 난다.
         ⚠️ 데모/시드 행은 room_id 가 NULL 이라 자연히 걸리지 않는다(운영 104행 중 102행). */
      const evs: any = await env.DB.prepare(
        `SELECT room_id, created_at FROM student_evaluations
          WHERE created_at >= ? AND created_at < ? AND room_id IS NOT NULL AND room_id <> ''`
      ).bind(mStart, mEnd).all().catch(() => ({ results: [] }));
      for (const e of (evs.results || [])) {
        if (e.room_id && !fbByRoom[e.room_id]) fbByRoom[e.room_id] = kstDay(e.created_at);
      }

      // 학생 이름 맵 (students_erp 컬럼 구성이 배포본마다 달라 순차 폴백)
      //   운영 class_schedules 에는 student_name 이 행에 직접 있어 이 맵은 폴백용.
      const uids: any[] = [...new Set(instances.filter((l: any) => !l.student_name).map((l: any) => l.user_id).filter(Boolean))];
      const stuName: any = {};
      // ⚠️ (2026-08-07) 예전엔 uids 를 IN 목록에 통째로 넣고 `<= 500` 으로만 막았습니다.
      //    D1 한도는 100개라 101명부터는 쿼리가 던지고 → 세 컬럼 폴백이 모두 실패 →
      //    이름이 조용히 전부 빈칸이 됐습니다(에러 없이 화면만 비어 보임).
      //    이제 청크로 나눠 질의하므로 인원 수 제한이 필요 없습니다.
      //    컬럼 폴백 동작은 그대로 — 컬럼이 없으면 첫 청크에서 던져 다음 컬럼으로 넘어갑니다.
      if (uids.length) {
        for (const col of ['student_name', 'korean_name', 'name']) {
          try {
            const rows = await selectInChunks<any>(env.DB, uids,
              (ph) => `SELECT user_id, ${col} AS nm FROM students_erp WHERE user_id IN (${ph})`);
            let hit = false;
            for (const r of rows) { if (r.nm) { stuName[r.user_id] = r.nm; hit = true; } }
            if (hit) break;
          } catch {}
        }
      }

      /* ⏸ (2026-09-25 사장님 결정) 연속 결석 «보류» — 보류 기간 수업은 강사비 0%.
         정본 src/absence-hold.ts. 못 읽으면 빈 Map = «보류 없음»(예전과 같음). */
      const holdRanges = await loadHoldRanges(env as any);
      // 보류 구간이라도 학생이 실제로 들어온 회차는 «수업함» — 그 방 번호만 한 번에 묻는다.
      // 못 읽으면 null → 아래에서 보류를 적용하지 않는다(가르친 수업을 0원으로 만들지 않는 쪽).
      const heldRooms = instances
        .filter((l: any) => holdRanges.size && heldOnFor(holdRanges, l.user_id, l._date))
        .map((l: any) => `class-${l.id}-${String(l._date).replace(/-/g, '')}`);
      const heldAttended = heldRooms.length ? await attendedStudentRooms(env as any, heldRooms) : new Set<string>();

      // 오늘(KST) — 아직 시작 전인 예정 수업은 지급 계산에서 제외(status: upcoming)
      const nowKstIso = new Date(Date.now() + 9 * 3600 * 1000).toISOString();
      const todayKey = nowKstIso.slice(0, 10);
      const nowHm = nowKstIso.slice(11, 16);

      const lessons: any[] = [];
      const perTeacher: any = {};
      for (const l of instances) {
        const dateStr = l._date;
        const roomId = `class-${l.id}-${dateStr.replace(/-/g, '')}`;
        // teacher_id(원부 teachers.id) → 연결된 프로필. 번호 직조회(tMap[l.teacher_id])는
        // 다른 번호 체계라 남의 프로필이 나온다 — 위 profByTeacherId 다리로만 건넌다.
        const prof = profByTeacherId[String(l.teacher_id)] || tByName[l.teacher_name || ''] || null;
        const mins = l._mins;
        const teacherName = l.teacher_name || (prof ? prof.korean_name : null) || teacherNameById[String(l.teacher_id)] || null;
        // 등급(Level) + 요율: 개별 fee_per_10min 우선, 없으면 등급 기본요율(rate_per_20min/2)
        const levelCode: string | null = (prof && prof.level) ? String(prof.level) : null;
        const lvl = levelCode ? levelMap[levelCode] : null;
        const rate20 = (prof && prof.fee_per_10min) ? Number(prof.fee_per_10min) * 2 : (lvl ? Number(lvl.rate_per_20min) || 0 : 0);
        const fee = rate20 / 2; // per-10분 환산 — 기존 금액식(mins/10×fee) 그대로
        // 수업 유형(운영 스키마별 컬럼 폴백) — 기본 'Regular Lesson'
        const lessonType = l.lesson_type || l.class_type || l.lesson_kind || l.type || 'Regular Lesson';
        // 종료 시각(HH:MM) — 참고 포맷의 "14:00-14:20" 표기용
        const _st = String(l.start_time || '').slice(0, 5);
        let endTime = '';
        if (/^\d{2}:\d{2}$/.test(_st)) {
          const tot = parseInt(_st.slice(0, 2), 10) * 60 + parseInt(_st.slice(3, 5), 10) + mins;
          endTime = `${String(Math.floor(tot / 60) % 24).padStart(2, '0')}:${String(tot % 60).padStart(2, '0')}`;
        }

        const upcoming = dateStr > todayKey || (dateStr === todayKey && String(l.start_time || '00:00') > nowHm);
        const ns = nsByRoom[roomId] || nsBySched[`${l.id}|${dateStr}`] || null;
        /* ⏸ (2026-08-08) 연기된 수업 — 매니저가 강사 요청을 승인하면
           class_schedules.status 가 'postponed' 가 된다(위 /schedule-requests/decide).
           그런데 이 계산은 그 값을 **한 번도 보지 않았다**. 결과가 두 가지로 나빴다:
             ① 하지도 않은 수업이 '완료' 로 잡혀 전액 지급됐고,
             ② 그 수업엔 피드백이 있을 리 없어 «당일 피드백 미작성» 공제까지 붙었다.
                (없던 수업 때문에 강사가 벌점을 받고 있었다)
           → 상태로 분리한다. ②는 여기서 바로 사라진다(아래 공제는 finish 에만 붙는다).
              ①의 «얼마를 줄지» 는 정책이라 postponed_pay_percent 로 뺐다(기본 100 = 현행 유지). */
        const schedStatus = String(l.status || 'active').toLowerCase();
        let st = 'finish';
        if (schedStatus === 'postponed') st = 'postponed';
        else if (isHolidayClosedFor(holByDate[dateStr], l.teacher_id)) st = 'holiday';   // 🎌 공휴일 휴강 — 지급 0
        else if (upcoming) st = 'upcoming';
        /* ⏸ 연속 결석 보류 기간 — 강사는 기다리지 않고 매니저에게 확인한다(사장님 결정: 0%).
           보류를 건 날(두 번째 결석) 수업은 기존 «학생 결석» 규칙 그대로다(구간이 그 «다음» 부터). */
        else if (heldAttended && !heldAttended.has(roomId) && heldOnFor(holdRanges, l.user_id, dateStr)) st = 'absence_hold';
        else if (ns && ns.missing_role === 'student') st = 'student_absent';
        /* 🔎 오판이면 «미입장» 으로 보지 않는다 — 강사가 실제로 들어와 수업한 건이다.
           그러면 아래 흐름을 그대로 타고 'finish'(정상 수업, 전액)로 남는다. 위 nsIsFalseAlarm 주석 참고. */
        else if (ns && ns.missing_role === 'teacher' && !nsIsFalseAlarm(ns)) st = 'teacher_no_show';

        const base = Math.round((mins / 10) * fee);
        /* ⏸ 연기 수업의 지급률 — 「언제 연기했나」로 갈린다(위 earlyPostponePct 주석 참고).
           요청 기록이 없는 연기(관리자가 직접 상태만 바꾼 경우)는 판정할 근거가 없으므로
           기존 규칙(postponePct)을 그대로 쓴다. 모르는 것을 «사전 연기» 로 단정하지 않는다. */
        /* 🔁 (2026-10-09) 반복 수업 «그 주만» 연기는 요청이 «반복 줄» 번호로 남고 연기 기록은 새 줄이다
           (source='recurring-week:<반복 줄 id>') — 그 번호로 한 번 더 찾는다. */
        const _rwSrc = String(l.source || '');
        const _rwParent = _rwSrc.indexOf(RECUR_WEEK_SOURCE_PREFIX) === 0 ? _rwSrc.slice(RECUR_WEEK_SOURCE_PREFIX.length) : '';
        const pReq = (st === 'postponed') ? (postponeReq[`${l.id}|${dateStr}`] || (_rwParent ? postponeReq[`${_rwParent}|${dateStr}`] : null) || null) : null;
        const pFeeType: string | null = pReq ? (pReq.fee_type || null) : null;
        const pPct = (st === 'postponed')
          ? (pFeeType === 'free' ? earlyPostponePct : postponePct)
          : 0;
        let amount = 0;
        if (st === 'finish') amount = base;
        else if (st === 'student_absent') amount = Math.round(base * absentPct / 100);
        else if (st === 'postponed') amount = Math.round(base * pPct / 100);

        // 당일 피드백 여부 — 완료 수업만 판정. room_id 정확 매칭 → (구 데이터 폴백) 강사명+같은 날
        let fbOk: boolean | null = null;
        if (st === 'finish') {
          fbOk = fbByRoom[roomId] === dateStr || !!fbByTeacherDay[`${teacherName}|${dateStr}`];
        }

        // 지각 연장실패(분당 차감) — 완료 수업에 관리자가 입력한 지각분 × 요율
        const lateMin = (st === 'finish') ? (lateMap[`${l.id}|${dateStr}`] || 0) : 0;

        const dedus: any[] = [];
        if (st === 'finish' && fbOk === false && feeNoFb > 0) dedus.push({ code: 'no_feedback_day', amount: feeNoFb });
        if (st === 'finish' && lateMin > 0 && feeLateMin > 0) dedus.push({ code: 'late_no_extend', amount: Math.round(lateMin * feeLateMin), minutes: lateMin });
        if (st === 'teacher_no_show' && feeTNoShow > 0) dedus.push({ code: 'teacher_no_show', amount: feeTNoShow });
        const dSum = dedus.reduce((a, b) => a + (b.amount || 0), 0);
        const netAmount = Math.max(0, amount - dSum); // 참고 포맷의 'Total'(수업별 순지급)

        lessons.push({
          schedule_id: l.id, room_id: roomId, date: dateStr, start_time: l.start_time || '', end_time: endTime,
          duration_minutes: mins, user_id: l.user_id || null,
          student_name: l.student_name || stuName[l.user_id] || null,
          teacher_id: l.teacher_id, profile_id: prof ? prof.id : null, teacher_name: teacherName,
          lesson_type: lessonType,
          level_code: levelCode, level_label_ko: lvl ? lvl.label_ko : null, level_label_en: lvl ? lvl.label_en : null,
          rate_per_20min: rate20,
          status: st, fee_per_10min: fee, base_amount: base, amount,
          // ⏸ 연기 수업만 채워진다 — 강사 화면이 «왜 이 금액인지» 를 설명할 수 있게.
          postpone_fee_type: pFeeType,                                   // paid=30분 이내 / free=그 이전
          postpone_minutes_before: pReq ? pReq.minutes_before : null,
          postpone_pay_percent: (st === 'postponed') ? pPct : null,
          late_minutes: lateMin,
          feedback_ok: fbOk, deductions: dedus, deduction_total: dSum, net_amount: netAmount,
        });

        // 집계 키: 연결된 프로필 id(급여 화면 로스터·teacher_payroll 저장이 프로필 기준).
        // 프로필 미연결 강사는 't{원부id}' — 원부 번호를 그대로 키로 쓰면 같은 번호의
        // 프로필(=다른 강사) 줄에 합산되는 사고가 나서 접두사로 격리한다.
        const aggKey = prof ? String(prof.id) : ('t' + String(l.teacher_id));
        const agg = perTeacher[aggKey] || (perTeacher[aggKey] = {
          teacher_id: l.teacher_id, profile_id: prof ? prof.id : null, teacher_name: teacherName,
          lesson_count: 0, upcoming_count: 0, finish_count: 0,
          absent_count: 0, postponed_count: 0, teacher_no_show_count: 0, no_feedback_count: 0,
          total_minutes: 0, base_amount: 0, pay_amount: 0, deduction_total: 0, final_amount: 0,
        });
        if (st === 'upcoming') { agg.upcoming_count++; continue; }
        // ⏸ 보류 수업은 «수업 수·시간» 에 넣지 않는다 — 열리지 않은 수업이다(지급 0).
        if (st === 'absence_hold') { agg.hold_count = (agg.hold_count || 0) + 1; continue; }
        // 🎌 공휴일 휴강도 «열리지 않은 수업» 이다 — 수업 수·시간·금액에 넣지 않는다.
        if (st === 'holiday') { agg.holiday_count = (agg.holiday_count || 0) + 1; continue; }
        agg.lesson_count++;
        agg.total_minutes += mins;
        if (st === 'finish') agg.finish_count++;
        if (st === 'student_absent') agg.absent_count++;
        if (st === 'postponed') agg.postponed_count++;
        if (st === 'teacher_no_show') agg.teacher_no_show_count++;
        if (fbOk === false) agg.no_feedback_count++;
        agg.base_amount += base;
        agg.pay_amount += amount;
        agg.deduction_total += dSum;
        /* 💸 (2026-08-18 사장님 확인) 0 하한 — 단가 미지정(수업료 0) 강사에게 피드백 미작성
           공제만 붙어 «실지급 -350» 이 화면·CSV 에 그대로 나오던 것. 수업별 순지급(net_amount)은
           이미 Math.max(0,…) 인데 월 합계만 음수가 될 수 있었다. 공제 합계는 그대로 보여 주고
           (얼마가 깎였는지는 사실이므로) 지급액만 음수로 내려가지 않게 한다. */
        agg.final_amount = Math.max(0, agg.pay_amount - agg.deduction_total);
      }

      return { rules: ruleRows.results || [], levels: lvlRows.results || [], levelMap, absent_pay_percent: absentPct, postponed_pay_percent: postponePct, lessons, perTeacher, teachers: teachers.results || [], teacherNames: teacherNameById };
    };
  return { ensurePayrollTable, ensureDeductionRules, ensureTeacherLevels, computeLessonFeeMonth };
}
