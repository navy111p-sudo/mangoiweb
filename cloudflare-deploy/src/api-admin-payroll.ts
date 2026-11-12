import { loadTeacherMonthlyIncentive } from './teacher-monthly-incentive';
/** Payroll routes. The shared admin authentication gate remains unchanged. */
import type { MangoEnv } from './api-mango';
import { createLessonFeeCalculator } from './admin-lesson-fees';
import { json, parseJsonBody, invalidBody, toCSV, csvResponse } from './api-util';
import { forbiddenTeacherBody } from './forbidden-teacher';
import { selectInChunks } from './d1-chunk';
import { DEFAULT_CLASS_MINUTES } from './class-policy';
import { enqueueNotification } from './api-notify';
import { getAdminActor, sameTeacherName } from './auth-admin';
import { PAYROLL_PHP_TO_KRW, EVAL_WEIGHTS, classifyEvalGrade, VALID_TEACHER_STATUS, ensurePayrollSchema, calcWeightedTotal, normTeacherName, loadCafe24PayrollMonth, longClassTeacherIds, calcPayrollOne } from './admin-teacher-core';
export async function handleAdminPayrollApi(request: Request, url: URL, env: MangoEnv): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;
  const { ensurePayrollTable, ensureDeductionRules, ensureTeacherLevels, computeLessonFeeMonth } = createLessonFeeCalculator(env);


    // ── GET /api/admin/payroll/calculate?year=&month= — 월별 강사 급여 자동 계산 ──
    //   💼 G3 업그레이드: 수업 한 건씩 계산(computeLessonFeeMonth)을 합산 —
    //   학생 결석(지급률 정책)·강사 노쇼·당일 피드백 미작성 공제가 자동 반영되고,
    //   아직 시작 전인 예정 수업(upcoming)은 금액에서 제외된다.
    //   결과는 메모리에서만 반환 (DB 저장은 별도 POST /save)
    if (method === 'GET' && path === '/api/admin/payroll/calculate') {
      const now = new Date();
      const year = parseInt(url.searchParams.get('year') || String(now.getFullYear()), 10);
      const month = parseInt(url.searchParams.get('month') || String(now.getMonth() + 1), 10);

      // 🔐 강사(teacher) 로그인 시 본인 급여만 — 서버에서 강제(클라 필터는 우회 가능)
      const _prActor = await getAdminActor(request, env as any);
      const _prOwn = _prActor.isTeacher ? _prActor.name : '';

      const data = await computeLessonFeeMonth(year, month);

      // 기존 저장된 정산 (지급 상태 확인용)
      const saved: any = await env.DB.prepare(
        `SELECT * FROM teacher_payroll WHERE year = ? AND month = ?`
      ).bind(year, month).all().catch(() => ({ results: [] }));
      const savedMap: any = {};
      (saved.results || []).forEach((s: any) => { savedMap[s.teacher_id] = s; });

      /* 📦 (2026-08-18 사장님 요청 3안) 카페24가 보낸 그 달 급여를 함께 싣는다.
         [왜] 이 화면은 D1 class_schedules(예약표)로만 계산하는데, 실제 수업은 옛 LMS 에서
              이뤄져 예약표에는 «자리 표시»만 들어온다. 실측(2026-08-18): 673행 중 lms·시드를
              빼면 15행·강사 5명뿐이라, 33명 중 28명이 0회로 나왔다(사장님 캡처).
         [무엇] D1 계산이 0회인 강사는 카페24 값으로 채운다. **0회일 때만** 채우는 이유는,
              이 화면의 공제·상세가 전부 예약표 수업 한 건씩에서 나오기 때문이다. 둘을 섞으면
              합계와 상세가 서로 다른 이야기를 하게 된다.
         [공제] 카페24로 채운 줄에는 공제를 붙이지 않는다 — 그 값에는 수업별 피드백·지각
              판정 근거가 없다. 없는 근거로 깎으면 그게 곧 잘못된 임금 삭감이다. */
      const c24 = await loadCafe24PayrollMonth(env, year, month);

      const rows: any[] = [];
      let totalAmount = 0, totalLessons = 0, totalDeduction = 0, totalFinal = 0, paidCount = 0;
      for (const t of (data.teachers || [])) {
        // 강사 본인 뷰: 자신의 행만 계산·노출
        if (_prOwn && !sameTeacherName(_prOwn, t.korean_name) && !sameTeacherName(_prOwn, t.english_name)) continue;
        const a = data.perTeacher[t.id] || { lesson_count: 0, upcoming_count: 0, finish_count: 0, absent_count: 0, teacher_no_show_count: 0, no_feedback_count: 0, total_minutes: 0, base_amount: 0, pay_amount: 0, deduction_total: 0, final_amount: 0 };
        // 등급 요율: 개별 fee_per_10min 우선, 없으면 등급 기본요율
        const _lvl = t.level ? (data.levelMap || {})[t.level] : null;
        const rate20 = t.fee_per_10min ? Number(t.fee_per_10min) * 2 : (_lvl ? Number(_lvl.rate_per_20min) || 0 : 0);
        const fee = rate20 / 2;
        // 🎖 단가가 하나도 없는 강사(개별 단가도, 등급도 없음) — 수업이 있어도 수업료가 0 으로
        //    계산된다. 화면이 «금액이 0» 과 «단가가 없어 계산 불가» 를 구분할 수 있게 표시한다.
        const rateMissing = !(rate20 > 0);
        const s = savedMap[t.id];

        /* 📦 카페24 보충 — D1 예약표에 이 달 수업이 한 건도 없을 때만. 이름으로 잇는다(번호 금지). */
        const cf = c24.find(t.korean_name, t.english_name);
        const useC24 = !!cf && a.lesson_count === 0 && Number(cf.completed_classes) > 0;
        const c24Minutes = cf
          ? (Number(cf.total_minutes) > 0
              ? Number(cf.total_minutes)
              // 분을 아직 안 보내면 예전 규칙(전부 20분)으로 «환산해 보여 준다». 정확한 값이
              // 아니라는 것은 c24_minutes_real: false 로 화면이 구분한다.
              : Number(cf.completed_classes || 0) * DEFAULT_CLASS_MINUTES)
          : 0;
        const rowLessons  = useC24 ? Number(cf.completed_classes || 0) : a.lesson_count;
        const rowMinutes  = useC24 ? c24Minutes : a.total_minutes;
        const rowAmount   = useC24 ? Math.round(Number(cf.pay_php) || 0) : a.pay_amount;
        const rowDeduct   = useC24 ? 0 : a.deduction_total;
        const rowFinal    = useC24 ? rowAmount : a.final_amount;

        totalAmount += rowAmount;
        totalLessons += rowLessons;
        totalDeduction += rowDeduct;
        totalFinal += rowFinal;
        if (s && s.status === 'paid') paidCount++;
        rows.push({
          teacher_id: t.id,
          korean_name: t.korean_name,
          english_name: t.english_name,
          fee_per_10min: fee,
          level_code: t.level || null,
          level_label_ko: _lvl ? _lvl.label_ko : null,
          level_label_en: _lvl ? _lvl.label_en : null,
          rate_per_20min: rate20,
          // 카페24 금액을 쓰는 줄은 «단가 미지정» 경고를 띄우지 않는다 — 금액이 이미 카페24에서 온다
          rate_missing: rateMissing && !useC24,
          lesson_count: rowLessons,
          total_minutes: rowMinutes,
          calculated_amount: rowAmount,
          // 💼 G3 — 공제 반영 필드
          deduction_total: rowDeduct,
          final_amount: rowFinal,
          // 📦 이 줄의 숫자가 어디서 왔나 — 'd1'(예약표 계산) / 'cafe24'(카페24 인제스트)
          amount_source: useC24 ? 'cafe24' : 'd1',
          // 카페24가 «분» 을 보냈나. false 면 «완료 수업 × 20분» 으로 환산한 참고값이다.
          c24_minutes_real: useC24 ? Number(cf.total_minutes) > 0 : null,
          c24_pay_php: cf ? Math.round(Number(cf.pay_php) || 0) : null,
          c24_lessons: cf ? Number(cf.completed_classes || 0) : null,
          finish_count: a.finish_count,
          absent_count: a.absent_count,
          teacher_no_show_count: a.teacher_no_show_count,
          no_feedback_count: a.no_feedback_count,
          upcoming_count: a.upcoming_count,
          // 저장된 정산이 있으면 그 값 우선
          adjusted_amount: s?.adjusted_amount ?? null,
          paid_amount: s?.paid_amount ?? null,
          status: s?.status || 'pending',
          paid_at: s?.paid_at || null,
          memo: s?.memo || null,
          payroll_id: s?.id || null,
        });
      }
      // 프로필 미연결 강사(원부 teachers 에만 있고 teacher_profiles 연결이 안 된 강사)의 수업 —
      // 예전엔 같은 번호의 «다른 강사» 프로필 줄에 합산됐다. 이제 별도 행으로 분리해 보여 준다.
      // 단가 정보(프로필·등급)가 없어 금액은 0 — 관리자 「🔗 강사 연결」로 프로필을 이으면
      // 다음 계산부터 그 강사 줄에 정상 단가로 붙는다.
      for (const k of Object.keys(data.perTeacher || {})) {
        if (!/^t\d+$/.test(k)) continue;
        const a = (data.perTeacher as any)[k];
        if (_prOwn && !sameTeacherName(_prOwn, a.teacher_name)) continue;
        const s = savedMap[k];
        totalAmount += a.pay_amount;
        totalLessons += a.lesson_count;
        totalDeduction += a.deduction_total;
        totalFinal += a.final_amount;
        if (s && s.status === 'paid') paidCount++;
        rows.push({
          teacher_id: k, korean_name: a.teacher_name, english_name: null,
          unlinked_profile: true,
          fee_per_10min: 0, level_code: null, level_label_ko: null, level_label_en: null, rate_per_20min: 0,
          lesson_count: a.lesson_count, total_minutes: a.total_minutes,
          calculated_amount: a.pay_amount, deduction_total: a.deduction_total, final_amount: a.final_amount,
          finish_count: a.finish_count, absent_count: a.absent_count,
          teacher_no_show_count: a.teacher_no_show_count, no_feedback_count: a.no_feedback_count,
          upcoming_count: a.upcoming_count,
          adjusted_amount: s?.adjusted_amount ?? null, paid_amount: s?.paid_amount ?? null,
          status: s?.status || 'pending', paid_at: s?.paid_at || null, memo: s?.memo || null, payroll_id: s?.id || null,
        });
      }
      return json({
        ok: true, year, month,
        summary: {
          teacher_count: rows.length,
          total_lessons: totalLessons,
          total_amount: totalAmount,
          total_deduction: totalDeduction,
          total_final: totalFinal,
          paid_count: paidCount,
          unpaid_count: rows.length - paidCount,
        },
        levels: (data.levels || []).map((r: any) => ({ code: r.code, label_ko: r.label_ko, label_en: r.label_en, rate_per_20min: r.rate_per_20min })),
        /* 📦 카페24에는 있는데 화면 명부와 이름이 안 이어진 강사 — 조용히 빠지면 «급여를 안 준»
           사람이 생긴다. 관리자 화면이 몇 명인지 알려 줄 수 있게 함께 내려준다.
           (실측 2026-08-18: 32명 중 「테스트 강사」·「test teacher」·「스케줄변경중」 같은
            실제 강사가 아닌 이름이 섞여 있어, 0 이 아니라고 곧 사고인 것은 아니다)

           🔴 강사 본인 로그인에게는 **빈 배열**을 준다. 위 루프가 «본인이 아니면 continue» 로
              건너뛰므로 matched 에 자기 이름 하나만 담기고, unmatched() 가 **나머지 31명의
              이름·완료수업·pay_php 를 통째로** 실어 보내게 된다(2026-08-18 함정 대조에서 잡음).
              화면(adm-q3)이 강사 뷰에서 안 그리는 것만으로는 부족하다 — CLAUDE.md 의
              「서버 403 과 화면 감추기 둘 다」 그대로, 화면만 막으면 API 를 직접 불러 뚫린다.
              /api/admin/payroll/ 은 강사가 «본인 급여명세» 를 보라고 일부러 열어 둔 경로라
              더더욱 서버에서 잘라야 한다. */
        c24_unmatched: _prOwn ? [] : c24.unmatched(),
        rows,
      });
    }


    // ── GET /api/admin/payroll/lessons?year=&month=&teacher_id=|teacher_name= ──
    //   💼 G3 — 강사 1명의 수업별 상세(Lesson Fee Summary): 날짜·시간·학생·상태·단가·금액·피드백·공제.
    //   관리자 카드 「📋 상세」와 강사 마이페이지 '🧾 수업료 정산' 탭이 함께 사용
    //   (admin 세션 쿠키 필수 — index.ts default-deny 미들웨어가 인증 강제).
    if (method === 'GET' && path === '/api/admin/payroll/lessons') {
      const now = new Date();
      const year = parseInt(url.searchParams.get('year') || String(now.getFullYear()), 10);
      const month = parseInt(url.searchParams.get('month') || String(now.getMonth() + 1), 10);
      const tidParamRaw = (url.searchParams.get('teacher_id') || '').trim();
      let tid = parseInt(tidParamRaw, 10) || 0;
      // 프로필 미연결 강사 행(/calculate 가 만든 합성 키 teacher_id='t{원부id}')의 상세 조회 지원
      let rawTid = /^t\d+$/i.test(tidParamRaw) ? tidParamRaw.slice(1) : '';
      let tname = (url.searchParams.get('teacher_name') || '').trim();
      // 🔐 강사(teacher) 로그인 시엔 요청한 teacher_id/teacher_name 을 무시하고 항상 본인 것만.
      //   (강사가 남의 teacher_id 를 넣어 타인의 수업별 단가·공제를 조회하는 것을 서버에서 차단)
      const _lsActor = await getAdminActor(request, env as any);
      if (_lsActor.isTeacher) {
        if (!_lsActor.name) return json({ ok: false, error: 'teacher_identity_missing' }, 403);
        tid = 0;
        rawTid = '';
        tname = _lsActor.name;
      }

      // ── all=1 : 강사 구분 없이 그 달 전체 수업 (2026-08-05) ──────────────────
      //   왜 넣었나: 출석현황 카드(adm-p5.js)가 서버 엔드포인트가 없어서
      //   **실제 강사 이름으로 가짜 지각·결강·별점을 지어내고 있었다.** 그 숫자가 엑셀로
      //   빠져나가면 경고 배너가 사라져 실기록처럼 보인다 → 급여 사고로 직결.
      //   여기서 급여와 **같은 계산(computeLessonFeeMonth)** 을 그대로 내려준다.
      //   같은 원천을 쓰므로 출석현황과 급여가 서로 어긋날 수 없다(요청 8·22 «한곳에서»).
      //   🔐 강사는 전면 차단 — 전 강사의 단가·공제가 담긴다.
      if (url.searchParams.get('all') === '1') {
        if (_lsActor.isTeacher) return json(forbiddenTeacherBody(_lsActor), 403);
        const dAll = await computeLessonFeeMonth(year, month);
        return json({
          ok: true, year, month, all: true,
          lessons: dAll.lessons,
          rules: (dAll.rules || []).map((r: any) => ({ code: r.code, label_ko: r.label_ko, label_en: r.label_en, rule_type: r.rule_type, amount: r.amount, enabled: r.enabled })),
          absent_pay_percent: dAll.absent_pay_percent,
        });
      }

      if (!tid && !rawTid && !tname) return json({ ok: false, error: 'teacher_id_or_teacher_name_required' }, 400);

      const data = await computeLessonFeeMonth(year, month);
      let teacher: any = null;
      if (tid) teacher = (data.teachers || []).find((t: any) => t.id === tid) || null;
      else if (!rawTid) {
        teacher = (data.teachers || []).find((t: any) => sameTeacherName(t.korean_name, tname) || sameTeacherName(t.english_name, tname)) || null;
        if (teacher) tid = teacher.id;
      }
      /* ⚠️ (2026-08-12) 두 번호 체계 — l.teacher_id 는 원부 teachers.id, tid 는 teacher_profiles.id.
         예전엔 String(l.teacher_id) === String(tid) 로 번호끼리 직접 비교해서, 프로필 번호와
         같은 번호의 «다른 강사» 수업이 나왔다(라이브 대조 결과 우연 일치 0명 — 전원 남의 수업).
         이제 수업 행에 실어 둔 profile_id(연결된 프로필)로 거른다. */
      const lessons = data.lessons.filter((l: any) =>
        (rawTid && String(l.teacher_id) === rawTid) ||
        (tid && String(l.profile_id ?? '') === String(tid)) ||
        (tname && sameTeacherName(l.teacher_name, tname)));

      // 필터된 수업으로 요약 재계산 (이름만 일치하는 프로필 없는 강사도 지원)
      const sum: any = { lesson_count: 0, upcoming_count: 0, finish_count: 0, absent_count: 0, postponed_count: 0, teacher_no_show_count: 0, no_feedback_count: 0, total_minutes: 0, base_amount: 0, pay_amount: 0, deduction_total: 0, final_amount: 0 };
      for (const l of lessons) {
        if (l.status === 'upcoming') { sum.upcoming_count++; continue; }
        sum.lesson_count++;
        sum.total_minutes += l.duration_minutes;
        if (l.status === 'finish') sum.finish_count++;
        if (l.status === 'student_absent') sum.absent_count++;
        if (l.status === 'postponed') sum.postponed_count++;
        if (l.status === 'teacher_no_show') sum.teacher_no_show_count++;
        if (l.feedback_ok === false) sum.no_feedback_count++;
        sum.base_amount += l.base_amount;
        sum.pay_amount += l.amount;
        sum.deduction_total += l.deduction_total;
      }
      // 💸 0 하한 — 목록(/calculate)과 같은 규칙. 상세만 음수면 두 화면이 서로 어긋난다.
      sum.final_amount = Math.max(0, sum.pay_amount - sum.deduction_total);

      const _tLvl = teacher && teacher.level ? (data.levelMap || {})[teacher.level] : null;
      const incentive = await loadTeacherMonthlyIncentive(env.DB, year, month, _lsActor.isTeacher
        ? { username: _lsActor.username }
        : { rosterId: rawTid || String(teacher?.linked_teacher_id || '') });
      return json({
        ok: true, year, month,
        teacher: teacher ? {
          id: teacher.id, korean_name: teacher.korean_name, english_name: teacher.english_name,
          fee_per_10min: teacher.fee_per_10min || 0,
          level_code: teacher.level || null,
          level_label_ko: _tLvl ? _tLvl.label_ko : null,
          level_label_en: _tLvl ? _tLvl.label_en : null,
          rate_per_20min: teacher.fee_per_10min ? Number(teacher.fee_per_10min) * 2 : (_tLvl ? Number(_tLvl.rate_per_20min) || 0 : 0),
        } : { id: rawTid ? ('t' + rawTid) : (tid || null), korean_name: tname || (rawTid ? ((data as any).teacherNames || {})[rawTid] || null : null) },
        monthly_incentive: incentive,
        summary: sum,
        rules: (data.rules || []).map((r: any) => ({ code: r.code, label_ko: r.label_ko, label_en: r.label_en, rule_type: r.rule_type, amount: r.amount, enabled: r.enabled })),
        levels: (data.levels || []).map((r: any) => ({ code: r.code, label_ko: r.label_ko, label_en: r.label_en, rate_per_20min: r.rate_per_20min })),
        absent_pay_percent: data.absent_pay_percent,
        postponed_pay_percent: data.postponed_pay_percent,
        lessons,
      });
    }


    // ── GET /api/admin/payroll/deduction-rules — 공제 규칙 목록 ──
    if (method === 'GET' && path === '/api/admin/payroll/deduction-rules') {
      await ensureDeductionRules();
      const rs: any = await env.DB.prepare(`SELECT * FROM payroll_deduction_rules ORDER BY sort_order, code`).all().catch(() => ({ results: [] }));
      return json({ ok: true, rules: rs.results || [] });
    }


    // ── GET /api/admin/payroll/levels — 강사 등급 요율표 + 강사별 등급 현황 ──
    if (method === 'GET' && path === '/api/admin/payroll/levels') {
      await ensureTeacherLevels();
      const rs: any = await env.DB.prepare(`SELECT * FROM payroll_levels ORDER BY sort_order, code`).all().catch(() => ({ results: [] }));
      // 강사(teacher) 로그인은 본인 것만
      const _lvActor = await getAdminActor(request, env as any);
      let tq = `SELECT id, korean_name, english_name, fee_per_10min, level FROM teacher_profiles WHERE status = '활동중' OR status IS NULL ORDER BY korean_name`;
      const teachers: any = await env.DB.prepare(tq).all().catch(() => ({ results: [] }));
      let tlist = teachers.results || [];
      if (_lvActor.isTeacher && _lvActor.name) {
        tlist = tlist.filter((t: any) => sameTeacherName(_lvActor.name, t.korean_name) || sameTeacherName(_lvActor.name, t.english_name));
      }
      return json({ ok: true, levels: rs.results || [], teachers: tlist });
    }


    // ── POST /api/admin/payroll/levels — 등급 기본요율(per 20분) 수정 ──
    //   body: { levels: [{ code, rate_per_20min }] }
    if (method === 'POST' && path === '/api/admin/payroll/levels') {
      const _lvwActor = await getAdminActor(request, env as any);
      if (_lvwActor.isTeacher) return json(forbiddenTeacherBody(_lvwActor, '강사는 등급 요율을 변경할 수 없습니다.'), 403);
      await ensureTeacherLevels();
      const body: any = await request.json().catch(() => ({}));
      if (!Array.isArray(body.levels)) return json({ ok: false, error: 'levels_array_required' }, 400);
      const now = Date.now();
      let updated = 0;
      for (const l of body.levels) {
        if (!l || !l.code) continue;
        try {
          await env.DB.prepare(`UPDATE payroll_levels SET rate_per_20min = ?, updated_at = ? WHERE code = ?`)
            .bind(Math.max(0, Number(l.rate_per_20min) || 0), now, String(l.code)).run();
          updated++;
        } catch {}
      }
      return json({ ok: true, updated });
    }


    // ── POST /api/admin/payroll/teacher-level — 강사에게 등급 지정 ──
    //   body: { teacher_id, level_code, fee_per_10min? }
    //   등급 지정 시 그 강사 fee_per_10min = 등급요율/2 자동세팅(fee_per_10min 명시하면 그 값 우선).
    if (method === 'POST' && path === '/api/admin/payroll/teacher-level') {
      const _tlActor = await getAdminActor(request, env as any);
      if (_tlActor.isTeacher) return json(forbiddenTeacherBody(_tlActor, '강사는 등급을 변경할 수 없습니다.'), 403);
      await ensureTeacherLevels();
      const body: any = await request.json().catch(() => ({}));
      const tid = parseInt(body.teacher_id, 10);
      const code = String(body.level_code || '').trim();
      if (!tid || !code) return json({ ok: false, error: 'teacher_id_and_level_code_required' }, 400);
      const lvl: any = await env.DB.prepare(`SELECT * FROM payroll_levels WHERE code = ? LIMIT 1`).bind(code).first().catch(() => null);
      if (!lvl) return json({ ok: false, error: 'level_not_found' }, 404);
      const fee = (body.fee_per_10min != null && body.fee_per_10min !== '')
        ? Math.max(0, Number(body.fee_per_10min) || 0)
        : Math.round((Number(lvl.rate_per_20min) || 0) / 2);
      try {
        await env.DB.prepare(`UPDATE teacher_profiles SET level = ?, fee_per_10min = ? WHERE id = ?`).bind(code, fee, tid).run();
      } catch (e: any) { return json({ ok: false, error: 'update_failed', message: e?.message }, 500); }
      return json({ ok: true, teacher_id: tid, level_code: code, fee_per_10min: fee, rate_per_20min: Number(lvl.rate_per_20min) || 0 });
    }


    /* ── GET /api/admin/payroll/late-detect?year=&month= — 지각 «자동 감지» (참고용) ──────
     *
     * [왜] 지각분은 지금까지 관리자가 손으로 세어 넣었다(아래 late-minutes). 강사 20명 × 한 달치를
     *      사람이 세는 일이라 빠지거나 틀리기 쉽다. 원천 데이터(attendance.joined_at)는 이미 있다.
     *
     * ⛔ **자동으로 급여를 깎지 않는다.** 이 창구는 «세어 보니 이렇습니다» 만 돌려준다.
     *    공제에 반영되는 값은 여전히 lesson_late_minutes(사람이 확정한 값)뿐이다.
     *    돈은 사람이 확정한다 — 접속 기록이 곧 지각은 아니다(회선 끊김·재입장·시계 오차).
     *
     * 🔑 방 이름 규약으로 수업과 접속을 잇는다: room_id = class-{schedule_id}-{YYYYMMDD}
     * ⚠️ 강사의 «가장 이른» 입장만 본다. 끊겼다 다시 들어온 것을 지각으로 세면 안 된다.
     */
    if (method === 'GET' && path === '/api/admin/payroll/late-detect') {
      const _ldActor = await getAdminActor(request, env as any);
      if (_ldActor.isTeacher) return json(forbiddenTeacherBody(_ldActor), 403);
      const y = parseInt(url.searchParams.get('year') || '', 10);
      const mo = parseInt(url.searchParams.get('month') || '', 10);
      if (!y || !mo || mo < 1 || mo > 12) return invalidBody(['year', 'month']);
      const p2 = (n: number) => String(n).padStart(2, '0');
      const from = `${y}-${p2(mo)}-01`;
      const to = `${y}-${p2(mo)}-31`;
      // 몇 분부터 «지각» 으로 볼지 — 기본 3분(시계 오차·입장 지연을 지각으로 세지 않기 위한 여유)
      const grace = Math.max(0, Math.min(30, parseInt(url.searchParams.get('grace') || '3', 10) || 3));
      try {
        const empty = { results: [] as any[] };
        const [attRs, manRs] = await Promise.all([
          env.DB.prepare(
            `SELECT room_id, user_id, username, MIN(joined_at) AS first_join, date
               FROM attendance
              WHERE role = 'teacher' AND date >= ? AND date <= ? AND room_id LIKE 'class-%'
              GROUP BY room_id`
          ).bind(from, to).all<any>().catch(() => empty),
          env.DB.prepare(
            `SELECT schedule_id, lesson_date, minutes FROM lesson_late_minutes WHERE lesson_date >= ? AND lesson_date <= ?`
          ).bind(from, to).all<any>().catch(() => empty),
        ]);
        const manual: Record<string, number> = {};
        for (const m of (manRs.results || []) as any[]) manual[`${m.schedule_id}|${m.lesson_date}`] = Number(m.minutes) || 0;

        // 방 이름에서 schedule_id 를 뽑아, 그 수업의 예정 시작 시각을 한 번에 읽는다.
        const rows = (attRs.results || []) as any[];
        const sids = Array.from(new Set(rows.map((r) => {
          const m = /^class-(\d+)-\d{8}$/.exec(String(r.room_id || ''));
          return m ? Number(m[1]) : 0;
        }).filter(Boolean)));
        const startById: Record<number, { start: string; teacher: string }> = {};
        // ⚠️ D1 은 쿼리당 바인드 100개 한도 — 손으로 끊지 말고 공용 헬퍼를 쓴다(가드가 지킨다)
        const schedRows = await selectInChunks<any>(
          env.DB, sids, (ph) => `SELECT id, start_time, teacher_id FROM class_schedules WHERE id IN (${ph})`
        );
        for (const s of schedRows) {
          startById[Number(s.id)] = { start: String(s.start_time || ''), teacher: String(s.teacher_id || '') };
        }

        const toMin = (hhmm: string) => {
          const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || ''));
          return m ? Number(m[1]) * 60 + Number(m[2]) : null;
        };
        const out: any[] = [];
        for (const r of rows) {
          const m = /^class-(\d+)-\d{8}$/.exec(String(r.room_id || ''));
          if (!m) continue;
          const sid = Number(m[1]);
          const sched = startById[sid];
          if (!sched || !sched.start) continue;
          const planned = toMin(sched.start);
          if (planned == null || !r.first_join) continue;
          // 입장 시각을 KST 분 단위로 (예정 시각도 KST 기준으로 적혀 있다)
          const d = new Date(Number(r.first_join) + 9 * 3600 * 1000);
          const actual = d.getUTCHours() * 60 + d.getUTCMinutes();
          const lateMin = actual - planned;
          if (lateMin <= grace) continue;                       // 여유 안이면 지각 아님
          const key = `${sid}|${r.date}`;
          out.push({
            schedule_id: sid, lesson_date: r.date, room_id: r.room_id,
            teacher: r.username || sched.teacher || '', planned_start: sched.start,
            actual_start: `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`,
            detected_minutes: lateMin,
            entered_minutes: manual[key] ?? null,               // 사람이 이미 넣은 값(비교용)
            differs: manual[key] != null && manual[key] !== lateMin,
          });
        }
        out.sort((a, b) => b.detected_minutes - a.detected_minutes);
        return json({
          ok: true, year: y, month: mo, grace_minutes: grace, count: out.length, rows: out,
          note: '참고용입니다. 공제에 반영되는 값은 관리자가 확정한 지각분(late-minutes)뿐입니다.',
          note_en: 'Advisory only. Only the manually confirmed late minutes affect payroll deductions.',
        });
      } catch (e: any) {
        return json({ ok: false, error: 'late_detect_failed', message: String(e?.message || e).slice(0, 200) }, 500);
      }
    }


    // ── POST /api/admin/payroll/late-minutes — 수업별 '지각 연장실패' 분 수동 입력 ──
    //   body: { schedule_id, lesson_date(YYYY-MM-DD), minutes }
    //   근태 자동로그 도입 전까지 관리자가 상세표에서 직접 기입 → late_no_extend 공제에 반영.
    if (method === 'POST' && path === '/api/admin/payroll/late-minutes') {
      const _lmActor = await getAdminActor(request, env as any);
      if (_lmActor.isTeacher) return json(forbiddenTeacherBody(_lmActor, '강사는 지각분을 입력할 수 없습니다.'), 403);
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS lesson_late_minutes (schedule_id INTEGER NOT NULL, lesson_date TEXT NOT NULL, minutes INTEGER DEFAULT 0, updated_by TEXT, updated_at INTEGER, PRIMARY KEY (schedule_id, lesson_date));`); } catch {}
      const body: any = await request.json().catch(() => ({}));
      const sid = parseInt(body.schedule_id, 10);
      const ldate = String(body.lesson_date || '').replace(/\//g, '-').slice(0, 10);
      const minutes = Math.max(0, Math.min(600, Math.round(Number(body.minutes) || 0)));
      if (!sid || !/^\d{4}-\d{2}-\d{2}$/.test(ldate)) return json({ ok: false, error: 'schedule_id_and_lesson_date_required' }, 400);
      const now = Date.now();
      try {
        await env.DB.prepare(
          `INSERT INTO lesson_late_minutes (schedule_id, lesson_date, minutes, updated_by, updated_at) VALUES (?,?,?,?,?)
           ON CONFLICT(schedule_id, lesson_date) DO UPDATE SET minutes = excluded.minutes, updated_by = excluded.updated_by, updated_at = excluded.updated_at`
        ).bind(sid, ldate, minutes, _lmActor.name || '관리자', now).run();
      } catch (e: any) { return json({ ok: false, error: 'save_failed', message: e?.message }, 500); }
      return json({ ok: true, schedule_id: sid, lesson_date: ldate, minutes });
    }


    // ── POST /api/admin/payroll/deduction-rules — 공제 규칙 저장 ──
    //   body: { rules: [{ code, amount, enabled }] } — 금액·켜기/끄기만 수정(라벨은 시드 유지)
    if (method === 'POST' && path === '/api/admin/payroll/deduction-rules') {
      const _drActor = await getAdminActor(request, env as any);
      if (_drActor.isTeacher) return json(forbiddenTeacherBody(_drActor, '강사는 공제 규칙을 변경할 수 없습니다.'), 403);
      await ensureDeductionRules();
      const body: any = await request.json().catch(() => ({}));
      if (!Array.isArray(body.rules)) return json({ ok: false, error: 'rules_array_required' }, 400);
      const now = Date.now();
      let updated = 0;
      for (const r of body.rules) {
        if (!r || !r.code) continue;
        try {
          await env.DB.prepare(`UPDATE payroll_deduction_rules SET amount = ?, enabled = ?, updated_at = ? WHERE code = ?`)
            .bind(Math.max(0, Number(r.amount) || 0), r.enabled ? 1 : 0, now, String(r.code)).run();
          updated++;
        } catch {}
      }
      return json({ ok: true, updated });
    }


    // ── POST /api/admin/payroll/save — 정산 결과 D1에 저장/업데이트 ──
    //   body: { year, month, rows: [{ teacher_id, lesson_count, total_minutes, fee_per_10min, calculated_amount, adjusted_amount?, memo? }] }
    if (method === 'POST' && path === '/api/admin/payroll/save') {
      const _svActor = await getAdminActor(request, env as any);
      if (_svActor.isTeacher) return json(forbiddenTeacherBody(_svActor, '강사는 급여 정산을 저장할 수 없습니다.'), 403);
      await ensurePayrollTable();
      const body: any = await request.json().catch(() => ({}));
      const year = parseInt(body.year, 10);
      const month = parseInt(body.month, 10);
      if (!year || !month || !Array.isArray(body.rows)) return json({ ok: false, error: 'year_month_rows_required' }, 400);
      const now = Date.now();
      let saved = 0;
      for (const r of body.rows) {
        try {
          await env.DB.prepare(
            `INSERT INTO teacher_payroll (teacher_id, teacher_name, year, month, lesson_count, total_minutes, fee_per_10min, calculated_amount, deduction_total, final_amount, adjusted_amount, memo, status, created_at, updated_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
             ON CONFLICT(teacher_id, year, month) DO UPDATE SET
               teacher_name = excluded.teacher_name,
               lesson_count = excluded.lesson_count,
               total_minutes = excluded.total_minutes,
               fee_per_10min = excluded.fee_per_10min,
               calculated_amount = excluded.calculated_amount,
               deduction_total = excluded.deduction_total,
               final_amount = excluded.final_amount,
               adjusted_amount = excluded.adjusted_amount,
               memo = excluded.memo,
               updated_at = excluded.updated_at`
          ).bind(
            r.teacher_id, r.teacher_name || null, year, month,
            r.lesson_count || 0, r.total_minutes || 0, r.fee_per_10min || 0,
            r.calculated_amount || 0, r.deduction_total || 0,
            r.final_amount ?? ((r.calculated_amount || 0) - (r.deduction_total || 0)),
            r.adjusted_amount ?? null,
            r.memo || null, 'pending', now, now
          ).run();
          saved++;
        } catch (e: any) {
          console.warn('[payroll] save err:', e?.message);
        }
      }
      return json({ ok: true, year, month, saved });
    }


    // ── POST /api/admin/payroll/mark-paid — 지급 완료 처리 ──
    //   body: { payroll_id?, teacher_id?, year?, month?, paid_amount?, memo? }
    if (method === 'POST' && path === '/api/admin/payroll/mark-paid') {
      const _mpActor = await getAdminActor(request, env as any);
      if (_mpActor.isTeacher) return json(forbiddenTeacherBody(_mpActor, '강사는 지급 상태를 변경할 수 없습니다.'), 403);
      await ensurePayrollTable();
      const body: any = await request.json().catch(() => ({}));
      const now = Date.now();
      if (body.payroll_id) {
        await env.DB.prepare(
          `UPDATE teacher_payroll SET status='paid', paid_at=?, paid_amount=?, memo=COALESCE(?, memo), updated_at=? WHERE id=?`
        ).bind(now, body.paid_amount || null, body.memo || null, now, body.payroll_id).run();
        return json({ ok: true, payroll_id: body.payroll_id, status: 'paid' });
      }
      if (body.teacher_id && body.year && body.month) {
        await env.DB.prepare(
          `UPDATE teacher_payroll SET status='paid', paid_at=?, paid_amount=?, memo=COALESCE(?, memo), updated_at=? WHERE teacher_id=? AND year=? AND month=?`
        ).bind(now, body.paid_amount || null, body.memo || null, now, body.teacher_id, body.year, body.month).run();
        return json({ ok: true, teacher_id: body.teacher_id, year: body.year, month: body.month, status: 'paid' });
      }
      return json({ ok: false, error: 'payroll_id_or_teacher_year_month_required' }, 400);
    }


    // ── GET /api/admin/payroll/csv?year=&month= — 정산 CSV 다운로드 ──
    if (method === 'GET' && path === '/api/admin/payroll/csv') {
      await ensurePayrollTable();
      const year = parseInt(url.searchParams.get('year') || String(new Date().getFullYear()), 10);
      const month = parseInt(url.searchParams.get('month') || String(new Date().getMonth() + 1), 10);
      // 🔐 강사(teacher) 로그인 시엔 본인 행만 CSV 로 내려준다(전체 강사 급여 export 차단)
      const _csvActor = await getAdminActor(request, env as any);
      const _csvOwn = _csvActor.isTeacher ? _csvActor.name : '';
      const rs: any = _csvOwn
        ? await env.DB.prepare(
            `SELECT * FROM teacher_payroll WHERE year = ? AND month = ? AND LOWER(TRIM(teacher_name)) = LOWER(TRIM(?)) ORDER BY teacher_name`
          ).bind(year, month, _csvOwn).all().catch(() => ({ results: [] }))
        : await env.DB.prepare(
            `SELECT * FROM teacher_payroll WHERE year = ? AND month = ? ORDER BY teacher_name`
          ).bind(year, month).all().catch(() => ({ results: [] }));
      const rows = rs.results || [];
      const header = '강사ID,강사명,년월,수업횟수,총수업분,단가(10분),수업료,공제,실지급액,조정금액,지급금액,상태,지급일,메모';
      const csv = [header].concat(
        rows.map((r: any) => [
          r.teacher_id,
          (r.teacher_name||'').replace(/,/g,' '),
          `${r.year}-${String(r.month).padStart(2,'0')}`,
          r.lesson_count || 0,
          r.total_minutes || 0,
          r.fee_per_10min || 0,
          r.calculated_amount || 0,
          r.deduction_total || 0,
          r.final_amount ?? ((r.calculated_amount || 0) - (r.deduction_total || 0)),
          r.adjusted_amount ?? '',
          r.paid_amount ?? '',
          r.status || 'pending',
          r.paid_at ? new Date(r.paid_at).toISOString().slice(0,10) : '',
          (r.memo||'').replace(/,/g,' ').replace(/\n/g,' '),
        ].join(','))
      ).join('\n');
      // UTF-8 BOM 추가 (Excel 한글 깨짐 방지)
      const bom = '﻿';
      return new Response(bom + csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="payroll_${year}_${String(month).padStart(2,'0')}.csv"`,
        }
      });
    }


    // ═══════════════════════════════════════════════════════════════
    // 💼 Phase G1 끝
    // ═══════════════════════════════════════════════════════════════

    // ===== 💼 강사 급여·평가 (Phase 8 v2: 10분단가 + 5카테고리 평가) =====

    // 시스템 설정 조회 (UI 안내용 — 환율, 가중치, 등급 임계값)
    if (method === 'GET' && path === '/api/admin/payroll/rates') {
      return json({
        ok: true,
        currency: 'PHP',
        php_to_krw: PAYROLL_PHP_TO_KRW,
        valid_status: VALID_TEACHER_STATUS,
        eval_weights: EVAL_WEIGHTS,
        grade_thresholds: [
          { grade: '최우수',    min: 4.75, max: 5.00 },
          { grade: '매우 우수', min: 4.50, max: 4.74 },
          { grade: '우수',      min: 3.50, max: 4.49 },
          { grade: '개선 요망', min: 1.00, max: 3.49 },
        ]
      });
    }


    // 개별 강사 월별 통합 조회 (계산 + 평가)
    //   🔐 강사는 임의 teacher_id 로 남의 급여명세서를 볼 수 없다 — 본인 id 만 허용.
    if (method === 'GET' && /^\/api\/admin\/payroll\/\d+$/.test(path)) {
      await ensurePayrollSchema(env);
      const m = path.match(/^\/api\/admin\/payroll\/(\d+)$/);
      const id = m ? parseInt(m[1], 10) : 0;
      const year  = parseInt(url.searchParams.get('year')  || '0', 10);
      const month = parseInt(url.searchParams.get('month') || '0', 10);
      if (!id || !year || !month) return invalidBody(['teacher_id(path)', 'year', 'month']);
      const result = await calcPayrollOne(env, id, year, month);
      const _oneActor = await getAdminActor(request, env as any);
      if (_oneActor.isTeacher && !(result.ok && sameTeacherName(_oneActor.name, result.teacher_name))) {
        return json(forbiddenTeacherBody(_oneActor, '본인 급여명세서만 조회할 수 있습니다.'), 403);
      }
      return json(result, result.ok ? 200 : 404);
    }


    // 일괄 — 활성 강사 전원 (월별 dashboard 용)
    //   🔐 강사 본인 뷰(card-payroll)도 이 엔드포인트를 쓴다 → 강사면 서버가 본인 항목만 반환.
    //      (기존엔 전체를 내려주고 admin.html 이 화면에서만 걸렀음 = 우회 가능했던 취약점)
    if (method === 'GET' && path === '/api/admin/payroll/all') {
      await ensurePayrollSchema(env);
      const year  = parseInt(url.searchParams.get('year')  || '0', 10);
      const month = parseInt(url.searchParams.get('month') || '0', 10);
      if (!year || !month) return invalidBody(['year', 'month']);
      const _allActor = await getAdminActor(request, env as any);
      const _allOwn = _allActor.isTeacher ? _allActor.name : '';
      const rs = await env.DB.prepare(`SELECT id FROM teachers WHERE active = 1 ORDER BY name ASC`).all();
      const longIds = await longClassTeacherIds(env);   // 🪧 길이를 채워야 하는 강사 명단(C안)
      const items: any[] = [];
      let totalPhp = 0;
      for (const t of (rs.results || []) as any[]) {
        const r = await calcPayrollOne(env, t.id, year, month);
        if (!r.ok) continue;
        if (_allOwn && !sameTeacherName(_allOwn, r.teacher_name)) continue;  // 강사 본인 것만
        // 참고 표시 — «긴 수업이 있는데 길이가 안 들어온» 줄을 화면이 붉게 띄운다.
        r.has_long_class = longIds.has(Number(t.id));
        items.push(r); totalPhp += r.monthly_salary_php || 0;
      }
      const totalKrw = Math.round(totalPhp * PAYROLL_PHP_TO_KRW);
      // 등급 분포 카운트
      const gradeCounts: Record<string, number> = {};
      for (const it of items) {
        const g = it.grade || '미평가';
        gradeCounts[g] = (gradeCounts[g] || 0) + 1;
      }
      return json({
        ok: true, year, month, count: items.length,
        total_salary_php: Math.round(totalPhp * 100) / 100,
        total_salary_krw: totalKrw,
        php_to_krw: PAYROLL_PHP_TO_KRW,
        grade_counts: gradeCounts,
        currency: 'PHP', items
      });
    }


    // 마감 (payslips 잠금)
    if (method === 'POST' && path === '/api/admin/payroll/finalize') {
      const _finActor = await getAdminActor(request, env as any);
      if (_finActor.isTeacher) return json(forbiddenTeacherBody(_finActor, '강사는 급여를 마감할 수 없습니다.'), 403);
      await ensurePayrollSchema(env);
      const b = await parseJsonBody(request);
      if (!b || !b.year || !b.month) return invalidBody(['year', 'month']);
      const finalizedBy = (b.finalized_by || 'admin').toString().slice(0, 64);
      const now = Date.now();
      const rs = await env.DB.prepare(`SELECT id FROM teachers WHERE active = 1`).all();
      let saved = 0, skipped = 0, totalPhp = 0;
      for (const t of (rs.results || []) as any[]) {
        const r = await calcPayrollOne(env, t.id, b.year, b.month);
        if (!r.ok) continue;
        try {
          // 회계 보고서가 SELECT 하는 period/payment_krw/payment_php/evaluation_score 도 함께 저장
          const period = `${r.year}-${String(r.month).padStart(2, '0')}`;
          const paymentKrw = Math.round((r.monthly_salary_php || 0) * PAYROLL_PHP_TO_KRW);
          await env.DB.prepare(
            `INSERT INTO payslips (teacher_id, year, month, period, status, class_count, rate_per_10min_php,
                                    monthly_salary_php, payment_php, payment_krw, weighted_total, evaluation_score,
                                    grade, finalized_at, finalized_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            r.teacher_id, r.year, r.month, period, r.status, r.class_count, r.rate_per_10min_php,
            r.monthly_salary_php, r.monthly_salary_php, paymentKrw,
            r.weighted_total, r.weighted_total, r.grade, now, finalizedBy
          ).run();
          saved++;
          totalPhp += r.monthly_salary_php || 0;
        } catch (e) { skipped++; }
      }
      await enqueueNotification(env, {
        type: 'payroll_finalized',
        title: `💼 ${b.year}-${String(b.month).padStart(2,'0')} 급여 마감`,
        body: `강사 ${saved}명 정산 완료 (skipped ${skipped}). 합계 PHP ${Math.round(totalPhp).toLocaleString()} ≈ KRW ${Math.round(totalPhp * PAYROLL_PHP_TO_KRW).toLocaleString()}.`,
        meta: { year: b.year, month: b.month, saved, skipped, total_php: totalPhp, php_to_krw: PAYROLL_PHP_TO_KRW, finalized_by: finalizedBy, finalized_at: now }
      });
      return json({ ok: true, year: b.year, month: b.month, saved, skipped, total_php: Math.round(totalPhp), finalized_by: finalizedBy });
    }


    // 🌱 데모 데이터 시드 — salary-heatmap.pages.dev 의 21명 강사를 한번에 등록
    //   (강사 등록 + 평가 5점수 + 수업수). 이미 같은 이름이 있으면 skip.
    //   POST /api/admin/payroll/seed-demo  body: { year, month }
    if (method === 'POST' && path === '/api/admin/payroll/seed-demo') {
      // 🔐 (2026-08-09) 강사 차단 — 바로 위 finalize 에는 이 가드가 있는데 여기만 없었다.
      //   이 핸들러는 UPDATE teachers SET rate_per_10min_php=… 로 **전 강사의 급여 단가**를
      //   하드코딩된 데모값으로 덮어쓴다. 그런데 /api/admin/payroll/* 는
      //   TEACHER_BLOCKED_PREFIXES(차단 목록)에 없어서 강사도 도달할 수 있다
      //   — 그 목록은 «차단 목록» 이라 새 API 의 기본값이 «강사 허용» 이기 때문이다(index.ts:313).
      //   payroll 의 다른 엔드포인트들은 각자 본인-필터로 막고 있었고, 이것만 빠져 있었다.
      const _seedActor = await getAdminActor(request, env as any);
      if (_seedActor.isTeacher) return json(forbiddenTeacherBody(_seedActor, '강사는 급여 데모 데이터를 생성할 수 없습니다.'), 403);
      await ensurePayrollSchema(env);
      const b = await parseJsonBody(request);
      const year  = (b && b.year)  ? Number(b.year)  : new Date().getFullYear();
      const month = (b && b.month) ? Number(b.month) : (new Date().getMonth() + 1);
      // [name, status, years, rate_per_10min_php, classes, inst, ret, punct, admin, contrib]
      const SEED: any[] = [
        ['KES',      'office', 5, 29.58,  51, 5, 5, 4, 4, 5],
        ['BELLE',    'home',   1, 35.00, 104, 4, 5, 5, 5, 5],
        ['HT FARRAH','office', 5, 50.32, 157, 5, 4, 5, 5, 5],
        ['RICA',     'office', 5, 32.86, 134, 5, 5, 4, 5, 5],
        ['CINDY',    'office', 2, 34.09, 307, 5, 4, 5, 5, 5],
        ['JANE',     'office', 5, 28.57, 235, 5, 4, 5, 5, 5],
        ['ANA',      'office', 2, 30.00, 215, 5, 4, 5, 5, 5],
        ['KAYE',     'office', 1, 28.47, 333, 5, 4, 5, 5, 5],
        ['ZEE',      'office', 5, 29.33, 175, 4, 4, 5, 5, 5],
        ['HT NESS',  'home',   5, 30.00, 241, 5, 4, 5, 5, 5],
        ['MARIANE',  'home',   1, 25.79, 127, 5, 4, 5, 5, 5],
        ['JINETTE',  'home',   2, 25.52, 169, 5, 4, 5, 5, 5],
        ['JENNY',    'home',   2, 25.00,  34, 5, 5, 5, 4, 5],
        ['SID',      'office', 1, 29.59, 206, 5, 3, 4, 4, 5],
        ['CHAINE',   'office', 5, 25.82, 213, 5, 4, 5, 5, 5],
        ['KRYSTEL',  'office', 1, 25.06, 193, 4, 4, 5, 5, 4],
        ['SHAS',     'office', 1, 28.41, 222, 5, 4, 5, 5, 5],
        ['LEN',      'home',   1, 25.06, 165, 4, 4, 3, 2, 3],
        ['WIN',      'office', 1, 28.46, 148, 5, 4, 3, 1, 5],
        ['JED',      'home',   1, 25.00,  58, 5, 5, 1, 4, 2],
        ['FAYE',     'home',   5, 28.67, 141, 3, 5, 1, 3, 1],
      ];
      const now = Date.now();
      let created = 0, updated = 0, evals = 0, classes = 0;
      for (const row of SEED) {
        const [name, status, years, rate, classCount, inst, ret, punct, adminScore, contrib] = row;
        // 이미 있는지 확인 (이름 기준)
        const existing: any = await env.DB.prepare(`SELECT id FROM teachers WHERE name = ? LIMIT 1`).bind(name).first();
        let teacherId: number;
        if (existing && existing.id) {
          teacherId = existing.id;
          await env.DB.prepare(
            `UPDATE teachers SET status = ?, years = ?, rate_per_10min_php = ?, active = 1, updated_at = ? WHERE id = ?`
          ).bind(status, years, rate, now, teacherId).run();
          updated++;
        } else {
          const r = await env.DB.prepare(
            `INSERT INTO teachers (name, status, years, rate_per_10min_php, active, created_at, updated_at)
             VALUES (?, ?, ?, ?, 1, ?, ?)`
          ).bind(name, status, years, rate, now, now).run();
          teacherId = Number(r.meta.last_row_id);
          created++;
        }
        // 평가 upsert
        const weighted = calcWeightedTotal({
          score_instruction: inst, score_retention: ret, score_punctuality: punct,
          score_admin: adminScore, score_contribution: contrib
        });
        const grade = weighted != null ? classifyEvalGrade(weighted) : null;
        await env.DB.prepare(
          `INSERT INTO teacher_evaluations (teacher_id, year, month, score_instruction, score_retention, score_punctuality,
                                             score_admin, score_contribution, weighted_total, grade,
                                             evaluator, evaluated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(teacher_id, year, month) DO UPDATE SET
             score_instruction = excluded.score_instruction,
             score_retention = excluded.score_retention,
             score_punctuality = excluded.score_punctuality,
             score_admin = excluded.score_admin,
             score_contribution = excluded.score_contribution,
             weighted_total = excluded.weighted_total,
             grade = excluded.grade,
             evaluator = excluded.evaluator,
             evaluated_at = excluded.evaluated_at`
        ).bind(teacherId, year, month, inst, ret, punct, adminScore, contrib, weighted, grade, 'seed-demo', now).run();
        evals++;
        // 수업수 upsert
        await env.DB.prepare(
          `INSERT INTO teacher_monthly_classes (teacher_id, year, month, class_count, notes, updated_at)
           VALUES (?, ?, ?, ?, 'seed-demo', ?)
           ON CONFLICT(teacher_id, year, month) DO UPDATE SET
             class_count = excluded.class_count, updated_at = excluded.updated_at`
        ).bind(teacherId, year, month, classCount, now).run();
        classes++;
      }
      return json({ ok: true, year, month, total: SEED.length, created, updated, evaluations: evals, class_records: classes });
    }


    // CSV — Mangoi 평가 + 급여 통합 (회계 + 평가팀 공용)
    /* ═══════════════════════════════════════════════════════════════════
       🤖 GET /api/admin/payroll/auto-evaluate?year=&month=
          5대 평가 항목을 **LMS 실제 기록에서 계산해 «제안»** 한다 (2026-08-30).

       [왜] 강사 평가 5개 항목을 매달 사람이 손으로 넣어야 했다. 안 넣으면 grade 가
            «미평가» 로 남고, 그 상태가 급여 인센티브 근거가 되지 못한다.

       ⛔ **자동으로 저장하지 않는다.** 이 값은 급여로 이어진다 — 틀리면 곧 임금 사고다.
          화면이 제안값을 채워 주고, 사람이 확인해 [저장] 을 눌러야 teacher_evaluations 에 들어간다.
       ⛔ **표본이 없으면 숫자를 지어내지 않는다.** 못 잰 항목은 null 로 두고 이유를 함께 준다
          (CLAUDE.md 「화면에 «측정할 수 없는 값» 을 그럴듯하게 채우고 싶을 때」).
          지금 잴 수 있는 것은 두 축뿐이다:
            · 수업(instruction)   ← class_ratings 학생 별점 평균
            · 행정/조직(admin)     ← 수업일지(student_evaluations) 작성률
          나머지 셋(유지·근태·기여)은 이 저장소에 «그 달의 사실» 을 담은 표가 아직 없다.
          ⚠️ 근태를 노쇼 기록으로 계산하고 싶어질 텐데, 그 기록은 **학생 브라우저가 만든**
             「내 화면에 안 보였다」이고 실측 13건 중 11건이 오판이었다(CLAUDE.md 2장).
             그대로 감점 근거로 쓰면 멀쩡한 강사의 급여가 깎인다. 그래서 여기서는 안 쓴다.
       ⚠️ 이름으로 잇는다 — 번호로 이으면 **다른 사람**이 걸린다(강사 번호가 세 벌).
          normTeacherName() 으로 정규화해 **후보가 정확히 하나일 때만** 붙이고, 아니면 비운다.
       ═══════════════════════════════════════════════════════════════════ */
    if (method === 'GET' && path === '/api/admin/payroll/auto-evaluate') {
      const _aeActor = await getAdminActor(request, env as any);
      if (_aeActor.isTeacher) return json(forbiddenTeacherBody(_aeActor, '강사는 전체 자동 평가를 조회할 수 없습니다.'), 403);
      await ensurePayrollSchema(env);
      const year  = parseInt(url.searchParams.get('year')  || '0', 10);
      const month = parseInt(url.searchParams.get('month') || '0', 10);
      if (!year || !month) return invalidBody(['year', 'month']);
      const ym = `${year}-${String(month).padStart(2, '0')}`;

      const safeAllAE = async (sql: string, ...b: any[]): Promise<any[]> => {
        try { const rs = await env.DB.prepare(sql).bind(...b).all<any>(); return rs.results || []; }
        catch { return []; }
      };

      const [tRows, ratingRows, logRows, classRows] = await Promise.all([
        safeAllAE(`SELECT id, name FROM teachers WHERE active = 1 ORDER BY name ASC`),
        // 학생 별점 — rated_date 는 'YYYY-MM-DD'
        safeAllAE(`SELECT teacher_name, COUNT(*) AS n, AVG(score) AS avg_score
                     FROM class_ratings
                    WHERE teacher_name IS NOT NULL AND teacher_name <> ''
                      AND substr(COALESCE(rated_date,''),1,7) = ?
                    GROUP BY teacher_name`, ym),
        /* 수업일지 — ⚠️ student_evaluations 에는 «서로 다른 두 기능» 이 같이 산다(CLAUDE.md).
           강사의 1분 수업일지는 student_uid 가 채워진 행이다. 그 조건이 없으면
           옛 «학생 상세» 월간평가까지 섞여 작성률이 부풀려진다. */
        safeAllAE(`SELECT teacher_name, COUNT(*) AS n
                     FROM student_evaluations
                    WHERE student_uid IS NOT NULL AND teacher_name IS NOT NULL AND teacher_name <> ''
                      AND substr(COALESCE(lesson_date,''),1,7) = ?
                    GROUP BY teacher_name`, ym),
        // 그 달 수업 수 — 급여 계산이 쓰는 것과 같은 표를 본다(둘이 다른 이야기를 하면 안 된다)
        safeAllAE(`SELECT teacher_id, class_count FROM teacher_monthly_classes WHERE year = ? AND month = ?`, year, month),
      ]);

      // 이름 → 값. 같은 이름이 둘이면 «잇지 않는다»(모르는 것이 틀린 것보다 낫다).
      const byName = (rows: any[], key: string) => {
        const m: Record<string, any> = {}; const dupe = new Set<string>();
        for (const r of rows) {
          const k = normTeacherName(r[key]);
          if (!k) continue;
          if (m[k]) dupe.add(k); else m[k] = r;
        }
        for (const k of dupe) delete m[k];
        return m;
      };
      const ratingBy = byName(ratingRows, 'teacher_name');
      const logBy    = byName(logRows, 'teacher_name');
      const classBy: Record<string, number> = {};
      for (const c of classRows) classBy[String(c.teacher_id)] = Number(c.class_count) || 0;

      const MIN_N = 3;   // 표본이 이보다 적으면 «잴 수 없다» 로 둔다
      const rateToScore = (r: number) =>
        r >= 0.95 ? 5 : r >= 0.80 ? 4 : r >= 0.60 ? 3 : r >= 0.40 ? 2 : 1;

      const out = tRows.map((t: any) => {
        const key = normTeacherName(t.name);
        const rt = key ? ratingBy[key] : null;
        const lg = key ? logBy[key] : null;
        const lessons = classBy[String(t.id)] || 0;

        const unmeasured: Array<{ axis: string; reason: string; reason_en: string }> = [];
        let sInst: number | null = null;
        if (rt && Number(rt.n) >= MIN_N) {
          sInst = Math.round(Number(rt.avg_score) * 10) / 10;
        } else {
          unmeasured.push({
            axis: 'score_instruction',
            reason: rt ? `학생 별점이 ${Number(rt.n)}건뿐입니다(최소 ${MIN_N}건).` : '이 달 학생 별점이 없습니다.',
            reason_en: rt ? `Only ${Number(rt.n)} student rating(s) (need ${MIN_N}).` : 'No student ratings this month.',
          });
        }

        let sAdmin: number | null = null;
        let logRate: number | null = null;
        if (lessons >= MIN_N) {
          logRate = Math.min(1, (lg ? Number(lg.n) : 0) / lessons);
          sAdmin = rateToScore(logRate);
        } else {
          unmeasured.push({
            axis: 'score_admin',
            reason: `이 달 수업 수가 ${lessons}건이라 작성률을 낼 수 없습니다(최소 ${MIN_N}건).`,
            reason_en: `Only ${lessons} lesson(s) recorded this month (need ${MIN_N}).`,
          });
        }

        for (const [axis, ko, en] of [
          ['score_retention',    '유지율을 그 달 기준으로 담은 표가 아직 없습니다. 사람이 넣어 주세요.', 'No monthly retention source yet — enter manually.'],
          ['score_punctuality',  '노쇼 기록은 학생 화면이 만든 «안 보였다» 라 감점 근거로 쓰지 않습니다. 사람이 넣어 주세요.', 'No-show records are student-reported and unreliable for scoring — enter manually.'],
          ['score_contribution', '조직 기여는 시스템이 잴 수 있는 값이 아닙니다. 사람이 넣어 주세요.', 'Contribution cannot be measured by the system — enter manually.'],
        ] as const) {
          unmeasured.push({ axis, reason: ko, reason_en: en });
        }

        return {
          teacher_id: t.id,
          teacher_name: t.name,
          matched: !!key && (!!rt || !!lg || lessons > 0),
          suggested: { score_instruction: sInst, score_admin: sAdmin },
          basis: {
            rating_n: rt ? Number(rt.n) : 0,
            rating_avg: rt ? Math.round(Number(rt.avg_score) * 100) / 100 : null,
            lesson_count: lessons,
            lesson_log_n: lg ? Number(lg.n) : 0,
            lesson_log_rate: logRate == null ? null : Math.round(logRate * 1000) / 10,
          },
          unmeasured,
        };
      });

      return json({
        ok: true, year, month,
        min_sample: MIN_N,
        teachers: out,
        measurable_axes: ['score_instruction', 'score_admin'],
        note: '이 값은 «제안» 입니다. 확인하고 저장해야 평가에 반영됩니다. 잴 수 없는 항목은 빈칸으로 두었습니다 — 0 으로 채우지 않습니다(0점과 미평가는 다른 사실이고, 이 점수는 급여 인센티브 근거가 됩니다).',
        note_en: 'These are suggestions only — review and save to apply. Unmeasurable axes are left blank on purpose (a blank is not a zero, and these scores feed pay incentives).',
        weights: { instruction: 25, retention: 30, punctuality: 20, admin: 15, contribution: 10 },
        weights_note: '보고서의 «행정/조직 25%» 는 이 시스템에서 행정 15% + 조직기여 10% 로 나뉘어 있습니다(합계 동일).',
      });
    }


    if (method === 'GET' && path === '/api/admin/export/payroll.csv') {
      await ensurePayrollSchema(env);
      const year  = parseInt(url.searchParams.get('year')  || '0', 10);
      const month = parseInt(url.searchParams.get('month') || '0', 10);
      if (!year || !month) return invalidBody(['year', 'month']);
      const rs = await env.DB.prepare(`SELECT id, name FROM teachers WHERE active = 1 ORDER BY name ASC`).all();
      const rows: any[] = [];
      for (const t of (rs.results || []) as any[]) {
        /* 🛡 (2026-08-30 v4 제안서 08) 한 강사 계산이 터져도 파일 전체를 잃지 않는다.
           예전에는 여기서 예외가 나면 요청이 500 이 되고, 그것을 새 탭으로 열던 화면에는
           «흰 화면» 만 남았다(그게 「CSV 백화」의 정체 절반이다. 나머지 절반은 화면 쪽 —
           adm-core.js downloadPayrollCSV 주석 참고).
           ⚠️ 조용히 빠뜨리지 않는다 — 이름과 사유를 한 줄로 남겨 «왜 이 사람이 비었나» 를 남긴다.
              (CLAUDE.md 2장 「화면이 모르면 모른다고 말하게」) */
        let r: any;
        try {
          r = await calcPayrollOne(env, t.id, year, month);
        } catch (e: any) {
          r = { ok: false, error: String(e?.message || e).slice(0, 120) };
        }
        if (!r || !r.ok) {
          rows.push({
            teacher_id: t.id,
            teacher_name: t.name || ('#' + t.id),
            year, month,
            improvements: '계산 실패: ' + String(r?.error || 'unknown'),
          });
          continue;
        }
        const e = r.evaluation || {};
        rows.push({
          teacher_id:         r.teacher_id,
          teacher_name:       r.teacher_name,
          status:             r.status,
          years:              r.years,
          year:               r.year,
          month:              r.month,
          class_count:        r.class_count,
          total_minutes:      r.total_minutes,        // 🕐 급여 근거 — 30분 수업이 섞이면 회수만으론 못 맞춘다
          length_recorded:    r.length_recorded ? 1 : 0,   // 0 = 길이 미입력(전부 20분으로 계산)
          rate_per_10min_php: r.rate_per_10min_php,
          monthly_salary_php: r.monthly_salary_php,
          monthly_salary_krw: r.monthly_salary_krw,
          score_instruction:  e.score_instruction,
          score_retention:    e.score_retention,
          score_punctuality:  e.score_punctuality,
          score_admin:        e.score_admin,
          score_contribution: e.score_contribution,
          weighted_total:     r.weighted_total,
          grade:              r.grade,
          strengths:          e.strengths,
          improvements:       e.improvements,
          /* ✅ «평가했는가» 를 칸으로 못 박는다.
             ⛔ 미평가를 0 으로 채우지 않는다 — 0점과 «아직 평가 안 함» 은 다른 사실이고,
                이 표는 인센티브 근거로 쓰인다. 0 으로 적으면 안 한 평가가 «최하점» 이 된다.
                대신 이 칸(0/1)과 grade='미평가' 로 화면·엑셀이 갈라 볼 수 있게 한다. */
          evaluated:          r.evaluation ? 1 : 0,
        });
      }
      const csv = toCSV(rows, [
        { key: 'teacher_id',         label: 'teacher_id' },
        { key: 'teacher_name',       label: 'teacher_name' },
        { key: 'status',             label: 'status' },
        { key: 'years',              label: 'years' },
        { key: 'year',               label: 'year' },
        { key: 'month',              label: 'month' },
        { key: 'class_count',        label: 'class_count' },
        { key: 'total_minutes',      label: 'total_minutes' },
        { key: 'length_recorded',    label: 'length_recorded' },
        { key: 'rate_per_10min_php', label: 'rate_per_10min_php' },
        { key: 'monthly_salary_php', label: 'monthly_salary_php' },
        { key: 'monthly_salary_krw', label: 'monthly_salary_krw' },
        { key: 'score_instruction',  label: 'inst_25%' },
        { key: 'score_retention',    label: 'ret_30%' },
        { key: 'score_punctuality',  label: 'punct_20%' },
        { key: 'score_admin',        label: 'admin_15%' },
        { key: 'score_contribution', label: 'contrib_10%' },
        { key: 'weighted_total',     label: 'weighted_total' },
        { key: 'grade',              label: 'grade' },
        { key: 'evaluated',          label: 'evaluated(1=yes)' },
        { key: 'strengths',          label: 'strengths' },
        { key: 'improvements',       label: 'improvements' },
      ]);
      const fname = `mangoi_payroll_${year}-${String(month).padStart(2,'0')}.csv`;
      return csvResponse(fname, csv);
    }
  return null;
}
