/** leveltest: extracted administrator domain routes. Caller authentication and route order are preserved. */
import type { MangoEnv } from './api-mango';
import { json, parseJsonBody, invalidBody } from './api-util';
import { selectInChunks } from './d1-chunk';
import { sendKakaoAlimtalk } from './solapi-client';
import { authUidFromRequest as authUidGlobal } from './auth-token';
import { applyPlacementLevel, cefrDisplay, CEFR_LADDER } from './student-placement';
import { verifyLtTicket, buildLtTicket, buildLtIcs, ltTicketUrl, ltTicketUrlMap, publicBase, OPEN_BEFORE_MS } from './leveltest-ticket';
import { createLeveltestSchedule, autoScheduleOnApply } from './leveltest-schedule';
import { scopeFragments, scopeStudentCond } from './scope';
import { sendPlainSms } from './solapi-client';
import { sendEmail, emailLayout } from './email';
import { writeClassAudit } from './class-audit';
import { getAdminActor, isOrgScopedRole } from './auth-admin';
import { resolveStudentTrack, leveltestStatusFor } from './student-track';
import { buildLeveltestReview, type LtBankItem } from './leveltest-review';

export async function handleAdminLeveltestApi(request: Request, url: URL, env: MangoEnv): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;


    // ─── 🎯 레벨테스트 신청 (학생 제출 → 서버 저장, 관리자·강사 열람) ─────────────
    //   공개  POST /api/leveltest/apply                        학생이 신청 (level-test.html / 홈 그리드)
    //   관리자 GET  /api/admin/leveltest/applications?status=&limit=   목록 + 대기건수(배지)
    //   관리자 POST /api/admin/leveltest/applications  {id, status?, assigned_teacher?, note?, final_level?}  상태/배정 변경
    //   ※ 발음점수(pron_score)는 voice_coaching, AI점수(ai_score)는 향후 진단엔진에서 채움(③ 단계)
    const ensureLtApps = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS leveltest_applications (id INTEGER PRIMARY KEY AUTOINCREMENT, student_name TEXT NOT NULL, student_uid TEXT, desired_date TEXT, desired_time TEXT, status TEXT DEFAULT 'pending', ai_score REAL, pron_score REAL, teacher_score REAL, final_level TEXT, assigned_teacher TEXT, source TEXT, note TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
      // 선생님 1:1 평가(3번째 축) 컬럼 — 기존 테이블에도 idempotent 보강
      // + 📱 연락처/이메일, 🧑‍🏫 자동배정 교사 상세, 🔔 교사 확인시각(마이페이지 빨간점 계산용)
      for (const [col, type] of [
        ['teacher_rubric', 'TEXT'], ['evaluated_by', 'TEXT'], ['evaluated_at', 'INTEGER'],
        ['phone', 'TEXT'], ['student_email', 'TEXT'],
        ['assigned_teacher_id', 'TEXT'], ['assigned_teacher_phone', 'TEXT'], ['assigned_teacher_email', 'TEXT'],
        ['assigned_reason', 'TEXT'], ['teacher_seen_at', 'INTEGER'], ['teacher_confirmed_at', 'INTEGER'],
        // 📚 (2026-07-22) 학부모 컴플레인 #6: 결과에 '추천 교재/다음 수업 안내'가 없던 문제
        ['recommended_textbook', 'TEXT'], ['next_class_guide', 'TEXT'], ['result_notified_at', 'INTEGER'],
        // 🔗 (2026-08-05) 신청 ↔ 실제 수업예약 연결고리. 이게 없어서 «완료» 처리를 해도 수업은
        //    한 건도 안 생겼고, 반대로 예약을 만들어도 신청서엔 아무 표시가 남지 않았다.
        ['schedule_id', 'INTEGER'],
      ] as [string, string][]) {
        try { await env.DB.exec(`ALTER TABLE leveltest_applications ADD COLUMN ${col} ${type}`); } catch {}
      }
    };
    // ── 🧑‍🏫 레벨테스트 교사 자동배정: 그 요일·시간 가능 교사 중 최고평가(동점 랜덤), 없으면 전체 최고평가 ──
    //    반환: { id, name, phone, email, reason } | null
    const autoAssignTeacher = async (desiredDate: string | null, desiredTime: string | null) => {
      try {
        // 요일(Mon..Sun) 계산 — desired_date 있을 때만 가용필터 적용
        const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        let wantDay: string | null = null;
        if (desiredDate && /^\d{4}-\d{2}-\d{2}$/.test(desiredDate)) {
          const p = desiredDate.split('-').map(Number);
          const dt = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
          wantDay = WD[dt.getUTCDay()];
        }
        const wantHour = desiredTime && /^\d{1,2}:/.test(desiredTime) ? parseInt(desiredTime, 10) : null;

        // 활동중 교사 + 평가 평균(수업평가 class_ratings 우선, 없으면 익명칭찬 teacher_praises)
        let rows: any[] = [];
        try {
          const rs: any = await env.DB.prepare(
            `SELECT tp.id AS id, tp.korean_name AS name, tp.english_name AS en_name, tp.phone AS phone, tp.email AS email,
                    tp.available_days AS days, tp.available_hours AS hours,
                    (SELECT AVG(cr.score) FROM class_ratings cr WHERE cr.teacher_name = tp.korean_name OR cr.teacher_name = tp.english_name) AS rating_avg,
                    (SELECT COUNT(*) FROM class_ratings cr WHERE cr.teacher_name = tp.korean_name OR cr.teacher_name = tp.english_name) AS rating_cnt,
                    (SELECT AVG(pr.star_rating) FROM teacher_praises pr WHERE pr.teacher_name = tp.korean_name OR pr.teacher_name = tp.english_name) AS praise_avg
               FROM teacher_profiles tp
              WHERE tp.status IS NULL OR tp.status = '' OR tp.status IN ('활동중','재직')
              LIMIT 500`
          ).all();
          rows = rs.results || [];
        } catch { rows = []; }
        if (!rows.length) return null;

        const listMatch = (csv: any, token: string | null): boolean => {
          if (!token) return true;                       // 요일/시간 미지정이면 통과
          const s = String(csv || '').trim();
          if (!s) return false;                          // 가용정보 없는 교사는 "가용필터"에선 탈락(폴백에서 구제)
          return s.toLowerCase().split(/[,\s;/]+/).some(x => x && (x === token.toLowerCase() || x.startsWith(token.toLowerCase())));
        };
        const hourMatch = (csv: any, hour: number | null): boolean => {
          if (hour == null) return true;
          const s = String(csv || '').trim();
          if (!s) return false;
          // "16:00,17:00" / "16-21" / "16 17 18" 등 관용 표기 지원
          const rangeM = s.match(/(\d{1,2})\s*[-~]\s*(\d{1,2})/);
          if (rangeM) return hour >= parseInt(rangeM[1], 10) && hour <= parseInt(rangeM[2], 10);
          return s.split(/[,\s;/]+/).map(x => parseInt(x, 10)).filter(n => !isNaN(n)).includes(hour);
        };
        /* 그 요일·시간에 이미 수업이 잡힌 교사(중복 배정 방지).
           🔴 (2026-08-06) 이 검사는 **한 번도 동작한 적이 없었다** — 이유가 둘이다.
             ① `day_of_week = 'fri'` 로 물었는데 운영 값은 `'Fri'` 다. SQLite 의 `=` 는
                대소문자를 가리므로 **항상 0건** → busy 가 늘 비어 있었다.
             ② 설령 걸렸어도 담은 값은 `class_schedules.teacher_id`(= teachers.id)인데
                비교 대상은 `teacher_profiles.id` 다. **번호 체계가 달라** 엉뚱한 교사를
                제외했을 것이다(Teacher Kaye = profiles 11 / teachers 8).
           → 요일은 표기를 전부 받아들이고, 일회성 수업(scheduled_date)도 함께 보고,
             비교는 번호가 아니라 **이름**으로 한다. 금요일 18시처럼 이미 17명이 차 있는
             슬롯에서 «찬 교사»가 배정되면, 뒤의 겹침 검사에 걸려 수업이 조용히 안 생긴다. */
        const busyNames = new Set<string>();
        const normT = (x: any) => String(x || '').toLowerCase().replace(/teacher/g, '').replace(/[^a-z0-9가-힣]/g, '');
        if (wantHour != null && (wantDay || desiredDate)) {
          try {
            const DOW_FORMS: Record<string, string[]> = {
              Sun: ['sun', 'sunday', '0', '7', '일', '일요일'], Mon: ['mon', 'monday', '1', '월', '월요일'],
              Tue: ['tue', 'tuesday', '2', '화', '화요일'], Wed: ['wed', 'wednesday', '3', '수', '수요일'],
              Thu: ['thu', 'thursday', '4', '목', '목요일'], Fri: ['fri', 'friday', '5', '금', '금요일'],
              Sat: ['sat', 'saturday', '6', '토', '토요일'],
            };
            const conds: string[] = []; const bind: any[] = [];
            const forms = wantDay ? (DOW_FORMS[wantDay] || []) : [];
            if (forms.length) {
              conds.push(`lower(COALESCE(cs.day_of_week,'')) IN (${forms.map(() => '?').join(',')})`);
              bind.push(...forms);
            }
            if (desiredDate) { conds.push(`cs.scheduled_date = ?`); bind.push(desiredDate); }
            if (conds.length) {
              const bs: any = await env.DB.prepare(
                `SELECT t.name AS name FROM class_schedules cs
                   JOIN teachers t ON CAST(t.id AS TEXT) = CAST(cs.teacher_id AS TEXT)
                  WHERE (cs.status IS NULL OR cs.status = 'active')
                    AND substr(cs.start_time, 1, 2) = ? AND (${conds.join(' OR ')})`
              ).bind(('0' + wantHour).slice(-2), ...bind).all();
              (bs.results || []).forEach((r: any) => { if (r.name) busyNames.add(normT(r.name)); });
            }
          } catch {}
        }

        const scoreOf = (t: any): number => {
          // class_ratings(0~5?) 우선. 칭찬 별점은 보조. 평가 없으면 중립값 2.5(신규교사 과도한 불이익 방지)
          if (t.rating_avg != null) return Number(t.rating_avg);
          if (t.praise_avg != null) return Number(t.praise_avg);
          return 2.5;
        };
        const notBusy = (t: any) => !busyNames.has(normT(t.name)) && !busyNames.has(normT(t.en_name));
        // 1순위: 요일+시간 가용 & 미배정
        let pool = rows.filter(t => notBusy(t) && listMatch(t.days, wantDay) && hourMatch(t.hours, wantHour));
        let reason = 'available_best_rated';
        // 폴백: 가용정보로 걸러진 교사가 없으면 → 전체 활동중(중복만 제외) 최고평가
        if (!pool.length) { pool = rows.filter(notBusy); reason = 'fallback_best_rated'; }
        if (!pool.length) { pool = rows; reason = 'fallback_any'; }
        if (!pool.length) return null;

        // 최고평가로 정렬 → 동점(±0.05)이면 그중 랜덤
        pool.sort((a, b) => scoreOf(b) - scoreOf(a) || (Number(b.rating_cnt || 0) - Number(a.rating_cnt || 0)));
        const top = scoreOf(pool[0]);
        const tied = pool.filter(t => Math.abs(scoreOf(t) - top) <= 0.05);
        const pick = tied[Math.floor(Math.random() * tied.length)] || pool[0];
        return {
          id: pick.id != null ? String(pick.id) : null,
          name: (pick.name || pick.en_name || '').toString(),
          phone: (pick.phone || '').toString(),
          email: (pick.email || '').toString(),
          reason,
        };
      } catch (e: any) {
        console.warn('[leveltest autoAssign] skipped:', e?.message || e);
        return null;
      }
    };
    if (method === 'POST' && path === '/api/leveltest/apply') {
      await ensureLtApps();
      const b = await parseJsonBody(request);
      const name = ((b && (b.student_name || b.name)) || '').toString().trim();
      if (!name) return invalidBody(['student_name']);
      const now = Date.now();
      /* 🔑 uid 붙이기 — 이게 비면 나중에 학생이 «내 신청»을 못 찾는다(마이페이지가 uid 로만 조회).
         프론트가 보낸 값을 우선 쓰되, 비어 있으면 로그인 토큰에서 직접 꺼낸다.
         프론트는 localStorage 키를 하나라도 놓치면 uid 를 못 실어 보내지만(실제로 그래서
         신청 13건 중 7건이 uid 없이 저장됐다), 토큰은 서명이 검증되므로 위조가 안 된다. */
      let uid = ((b && (b.student_uid || b.uid)) || '').toString().trim() || null;
      if (!uid) {
        try { uid = await authUidGlobal(request, url, env, b); } catch { uid = null; }
      }
      const desiredDate = ((b && (b.desired_date || b.date)) || '').toString().trim() || null;
      const desiredTime = ((b && (b.desired_time || b.time)) || '').toString().trim() || null;
      const phone = ((b && (b.phone || b.student_phone)) || '').toString().trim() || null;
      const email = ((b && (b.email || b.student_email)) || '').toString().trim() || null;
      const source = (b && b.source) || 'level-test';
      const escapeHtmlLT = (s: any) => String(s == null ? '' : s).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' } as any)[c]);

      // 🧑‍🏫 자동배정 — 그 요일·시간 가능 교사 중 최고평가(없으면 전체 최고평가)
      const teacher = await autoAssignTeacher(desiredDate, desiredTime);

      const r = await env.DB.prepare(
        `INSERT INTO leveltest_applications (student_name, student_uid, desired_date, desired_time, phone, student_email, status, assigned_teacher, assigned_teacher_id, assigned_teacher_phone, assigned_teacher_email, assigned_reason, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        name, uid, desiredDate, desiredTime, phone, email,
        teacher ? 'proposed' : 'pending',   // 소프트 배정 — 교사 수락 전까지 학생에게 교사명 미통보
        teacher ? teacher.name : null,
        teacher ? teacher.id : null,
        teacher ? (teacher.phone || null) : null,
        teacher ? (teacher.email || null) : null,
        teacher ? teacher.reason : null,
        source, now, now
      ).run();
      const appId = r.meta.last_row_id;

      /* 📅 (2026-08-06) 신청 즉시 «실제 수업» 까지 만든다.
         [왜] 예전엔 관리자가 「📅 수업 만들기」를 손으로 눌러야만 방이 생겼다. 안 누르면
              학생 티켓엔 입장 버튼이 안 생기고, 강사 화면·주간 캘린더 어디에도 안 뜬다.
              신청서만 쌓이고 아무도 못 들어가는 상태가 «에러 없이» 남는다.
              그런데 그 버튼이 하는 일은 신청서에 이미 있는 값(날짜·시간·배정교사)을
              옮겨 적는 것뿐이라 사람이 판단할 여지가 거의 없다.
         ⚠️ best-effort — 만들 수 없는 상황(과거 날짜·겹침·강사 미배정)이면 조용히 넘기고
            신청 자체는 성공시킨다. 그 경우는 관리자가 기존 버튼으로 처리하면 된다. */
      /* 🎟️ 티켓 주소는 응답에도 실어 준다. 문자만 믿으면 «문자가 늦거나 안 오는» 사람은
         자기 신청을 확인할 길이 사라진다. 신청한 본인에게 주는 것이라 노출 문제도 없다. */
      let ticketUrl = '';
      let autoSched: any = null;
      try {
        const appRowNew: any = await env.DB.prepare(
          `SELECT * FROM leveltest_applications WHERE id = ? LIMIT 1`).bind(appId).first();
        if (appRowNew) autoSched = await autoScheduleOnApply(env, appRowNew);
      } catch (e: any) { console.warn('[leveltest] auto-schedule skipped:', e?.message || e); }

      // 전화번호가 없어 문자를 못 보낸 경우에도 화면에는 링크를 줘야 한다
      if (!ticketUrl) { try { ticketUrl = await ltTicketUrl(Number(appId), env); } catch {} }

      // 📅 예약 표시용 문자열
      const whenLabel = (() => {
        if (!desiredDate) return desiredTime || '일정 협의';
        const p = desiredDate.split('-');
        const wk = ['일', '월', '화', '수', '목', '금', '토'];
        let dd = desiredDate;
        try { const d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); dd = `${+p[1]}월 ${+p[2]}일(${wk[d.getUTCDay()]})`; } catch {}
        return desiredTime ? `${dd} ${desiredTime}` : dd;
      })();
      const teacherLabel = teacher && teacher.name ? teacher.name : '담당 선생님';

      // 🔔 알림은 모두 best-effort — 실패해도 신청 자체는 성공 처리
      // 1) 신청자 "접수" 안내 — 담당 교사는 수락 후 확정 통보(과잉 약속 방지). 교사명은 아직 안 넣는다.
      if (phone) {
        /* 🎟️ 접수 문자에 «티켓 링크» 를 넣는다. 이전엔 문의 카톡 주소만 있어서, 신청자가
           자기 신청을 확인할 방법이 문자 한 통의 기억뿐이었다. 이 링크 하나가 확인·일정·
           장비점검·당일 입장까지 전부 담당한다(로그인 불필요). */
        let ticketLine = '';
        try { ticketUrl = await ltTicketUrl(Number(appId), env); ticketLine = `
▶ 확인·입장: ${ticketUrl}`; } catch {}
        const smsText = `[망고아이] ${name}님, 레벨테스트 신청이 접수됐어요! 🎯\n📅 희망: ${whenLabel}\n담당 선생님이 확정되면 다시 안내드릴게요.${ticketLine}\n문의: pf.kakao.com/_xlqnSxd`;
        try { await sendPlainSms(env, phone, smsText); }
        catch (e: any) { console.warn('[leveltest] applicant receipt skipped:', e?.message || e); }
      }
      // 2) 관리자(필리핀) 이메일 알림 — 한/영 이중언어
      try {
        const adminTo = (env as any).LEVELTEST_ADMIN_EMAIL;
        if (adminTo) {
          const html = emailLayout({
            title: '🎯 새 레벨테스트 신청 · New Level Test Request',
            bodyHtml: `
              <p><b>새 레벨테스트 신청이 접수되었습니다.</b><br>A new level test request has been received.</p>
              <table cellpadding="6" style="border-collapse:collapse;margin:10px 0;font-size:13.5px">
                <tr><td style="color:#64748b">학생 · Student</td><td><b>${escapeHtmlLT(name)}</b></td></tr>
                <tr><td style="color:#64748b">희망일시 · When</td><td>${escapeHtmlLT(whenLabel)}</td></tr>
                <tr><td style="color:#64748b">연락처 · Phone</td><td>${escapeHtmlLT(phone || '-')}</td></tr>
                <tr><td style="color:#64748b">배정교사 · Teacher</td><td>${escapeHtmlLT(teacherLabel)}${teacher && teacher.reason === 'fallback_best_rated' ? ' <span style="color:#f59e0b">(시간대 가용 교사 없음 → 최고평가 배정 · no time-match, assigned top-rated)</span>' : ''}</td></tr>
              </table>
              <p style="font-size:12.5px;color:#64748b">관리자 페이지 → 레벨테스트 신청 현황에서 확인/변경할 수 있습니다.<br>Review or reassign in Admin → Level Test Applications.</p>`,
          });
          await sendEmail(env, { to: adminTo, subject: `[망고아이] 새 레벨테스트 신청 · New Level Test — ${name}`, html });
        }
      } catch (e: any) { console.warn('[leveltest] admin email skipped:', e?.message || e); }
      // 3) 배정 후보 교사에게 "수락 요청" — 이메일 + 문자 + 마이페이지 빨간점(teacher_seen_at 미설정으로 자동)
      //    교사가 수락하면 그때 학생에게 확정 통보(아래 accept 분기).
      if (teacher) {
        const tMsg = `[망고아이] 새 레벨테스트 배정 제안이 왔어요.\n👦 학생: ${name}\n📅 ${whenLabel}\n마이페이지에서 수락/거절해 주세요.`;
        try { if (teacher.phone) await sendPlainSms(env, teacher.phone, tMsg); } catch (e: any) { console.warn('[leveltest] teacher sms skipped:', e?.message || e); }
        try {
          if (teacher.email) {
            const html = emailLayout({
              title: '🧑‍🏫 새 레벨테스트 배정 제안 · New Level Test — Please Confirm',
              bodyHtml: `
                <p><b>${escapeHtmlLT(teacher.name)}</b> 선생님, 새 레벨테스트가 배정 제안되었습니다. 마이페이지에서 <b>수락</b>해 주세요.<br>A new level test is proposed to you. Please <b>accept</b> it in your My Page.</p>
                <table cellpadding="6" style="border-collapse:collapse;margin:10px 0;font-size:13.5px">
                  <tr><td style="color:#64748b">학생 · Student</td><td><b>${escapeHtmlLT(name)}</b></td></tr>
                  <tr><td style="color:#64748b">일시 · When</td><td>${escapeHtmlLT(whenLabel)}</td></tr>
                </table>
                <p style="font-size:12.5px;color:#64748b">수락하면 학생에게 담당 선생님 확정 안내가 나갑니다. · Accepting sends the student a confirmation.</p>`,
            });
            await sendEmail(env, { to: teacher.email, subject: `[망고아이] 새 레벨테스트 배정 제안 · Please confirm — ${name}`, html });
          }
        } catch (e: any) { console.warn('[leveltest] teacher email skipped:', e?.message || e); }
      }

      return json({
        ok: true, id: appId,
        status: teacher ? 'proposed' : 'pending',
        proposed_teacher: teacher ? teacher.name : null,
        scheduled: whenLabel,
        // 📅 자동으로 수업까지 잡혔으면 그 사실을 알려 준다(화면이 «예약 완료» 라고 말할 근거)
        schedule_id: (autoSched && autoSched.schedule_id) || null,
        // 🎟️ 이 링크 하나가 «확인 + 입장» 이다. 로그인·계정 없이 열린다.
        ticket_url: ticketUrl || null,
      });
    }
    // ── 🧑‍🏫 교사 마이페이지: 나에게 배정된 레벨테스트 목록 + 미확인 배지 ──
    //   GET  /api/teacher/leveltest-assignments?teacher_name=이름[&teacher_id=]  → { items, unseen }
    //   POST /api/teacher/leveltest-assignments  { teacher_name|teacher_id, seen:true }        → 빨간점 제거(확인처리)
    //   POST /api/teacher/leveltest-assignments  { id, teacher_name, action:'accept'|'decline' } → 배정 수락/거절
    if (path === '/api/teacher/leveltest-assignments') {
      await ensureLtApps();
      const tname = (url.searchParams.get('teacher_name') || '').toString().trim();
      const tid = (url.searchParams.get('teacher_id') || '').toString().trim();
      if (method === 'GET') {
        if (!tname && !tid) return invalidBody(['teacher_name']);
        const where: string[] = []; const binds: any[] = [];
        if (tid)   { where.push('assigned_teacher_id = ?'); binds.push(tid); }
        if (tname) { where.push('assigned_teacher = ?');    binds.push(tname); }
        const rs = await env.DB.prepare(
          `SELECT id, student_name, desired_date, desired_time, phone, status, assigned_teacher, assigned_reason, teacher_seen_at, teacher_confirmed_at, created_at
             FROM leveltest_applications WHERE (${where.join(' OR ')}) ORDER BY created_at DESC LIMIT 100`
        ).bind(...binds).all();
        const items = (rs.results || []) as any[];
        const unseen = items.filter(a => !a.teacher_seen_at || a.created_at > a.teacher_seen_at).length;
        return json({ ok: true, items, unseen });
      }
      const bb = await parseJsonBody(request);
      const bn = ((bb && bb.teacher_name) || '').toString().trim();
      const bi = ((bb && bb.teacher_id) || '').toString().trim();
      const action = ((bb && bb.action) || '').toString().trim();
      // ── 배정 수락/거절 ──
      if ((action === 'accept' || action === 'decline') && bb && bb.id != null) {
        if (!bn && !bi) return invalidBody(['teacher_name']);
        const app = await env.DB.prepare(`SELECT * FROM leveltest_applications WHERE id = ? LIMIT 1`).bind(bb.id).first<any>();
        if (!app) return json({ ok: false, error: 'not_found' }, 404);
        // 소유 검증 — 나에게 제안된 건만 처리
        const owns = (bi && String(app.assigned_teacher_id) === bi) || (bn && app.assigned_teacher === bn);
        if (!owns) return json({ ok: false, error: 'not_your_assignment' }, 403);
        const now2 = Date.now();
        if (action === 'decline') {
          // 배정 해제 → pending 으로 되돌려 관리자가 재배정
          await env.DB.prepare(`UPDATE leveltest_applications SET status='pending', assigned_teacher=NULL, assigned_teacher_id=NULL, assigned_teacher_phone=NULL, assigned_teacher_email=NULL, assigned_reason='declined', teacher_confirmed_at=NULL, updated_at=? WHERE id=?`).bind(now2, bb.id).run();
          return json({ ok: true, status: 'pending' });
        }
        // accept → confirmed + 학생에게 담당 확정 통보
        await env.DB.prepare(`UPDATE leveltest_applications SET status='confirmed', teacher_confirmed_at=?, teacher_seen_at=?, updated_at=? WHERE id=?`).bind(now2, now2, now2, bb.id).run();
        // 📅 예약 문자열
        const wk = ['일', '월', '화', '수', '목', '금', '토'];
        let whenLabel2 = app.desired_time || '일정 협의';
        if (app.desired_date && /^\d{4}-\d{2}-\d{2}$/.test(app.desired_date)) {
          const p = String(app.desired_date).split('-');
          try { const d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); whenLabel2 = `${+p[1]}월 ${+p[2]}일(${wk[d.getUTCDay()]})` + (app.desired_time ? ` ${app.desired_time}` : ''); } catch {}
        }
        const tLabel = app.assigned_teacher || '담당 선생님';
        if (app.phone) {
          /* 🎟️ 예전엔 "예약 10분 전 카카오톡 채널로 화상 링크를 보내드립니다" 라고 «약속만» 했다.
             그 링크를 보내는 코드는 전화번호를 students_erp 에서만 찾아, 계정이 없는 신청자에겐
             구조적으로 못 갔다 — 지키지 못할 약속이었다. 이제는 링크를 «지금» 준다.
             수업 전엔 일정 확인, 10분 전부터 입장 버튼으로 바뀌는 같은 주소다. */
          // ⏰ 분 수는 상수에서 꺼낸다 — 문자에 숫자를 적어 두면 창을 늘렸을 때 문자만 거짓말을 한다
          const openMin = Math.round(OPEN_BEFORE_MS / 60000);
          let ticketLine2 = `\n※ 시작 ${openMin}분 전부터 입장할 수 있어요.`;
          try { ticketLine2 = `\n▶ 확인·입장: ${await ltTicketUrl(Number(app.id), env)}\n※ 시작 ${openMin}분 전부터 입장 버튼이 열려요.`; } catch {}
          const smsText = `[망고아이] ${app.student_name}님, 레벨테스트 담당 선생님이 확정됐어요! ✅\n📅 ${whenLabel2}\n👩‍🏫 담당: ${tLabel}${ticketLine2}\n문의: pf.kakao.com/_xlqnSxd`;
          try {
            const tmpl = (env as any).SOLAPI_TEMPLATE_LEVELTEST;
            if (tmpl) {
              await sendKakaoAlimtalk(env, {
                templateCode: tmpl, recipientPhone: app.phone, recipientName: app.student_name,
                variables: { '#{학생명}': app.student_name, '#{예약일시}': whenLabel2, '#{담당교사}': tLabel },
                fallbackSmsText: smsText,
                logContext: app.student_uid ? { userId: String(app.student_uid), reason: 'leveltest' } : undefined,
              });
            } else {
              await sendPlainSms(env, app.phone, smsText);
            }
          } catch (e: any) { console.warn('[leveltest] confirm notify skipped:', e?.message || e); }
        }
        return json({ ok: true, status: 'confirmed' });
      }
      // ── 확인처리(빨간점 제거) ──
      if (!bn && !bi) return invalidBody(['teacher_name']);
      const where: string[] = []; const binds: any[] = [];
      if (bi) { where.push('assigned_teacher_id = ?'); binds.push(bi); }
      if (bn) { where.push('assigned_teacher = ?');    binds.push(bn); }
      await env.DB.prepare(
        `UPDATE leveltest_applications SET teacher_seen_at = ? WHERE (${where.join(' OR ')}) AND (teacher_seen_at IS NULL OR teacher_seen_at < created_at)`
      ).bind(Date.now(), ...binds).run();
      return json({ ok: true });
    }
    /* ═══════════════════════════════════════════════════════════════════════
       🎟️ 티켓 — 「확인」과 「입장」을 링크 하나로  (leveltest-ticket.ts 참고)
         GET /api/leveltest/ticket?k=<토큰>      → 지금 보여줄 것 전부(JSON)
         GET /api/leveltest/ticket.ics?k=<토큰>  → 「내 캘린더에 추가」
       계정이 없어도 동작한다 — 서명 토큰이 곧 신원이다. 신청번호를 바꿔치기하면
       서명이 깨져 남의 티켓은 열리지 않는다.
       ═══════════════════════════════════════════════════════════════════════ */
    if (method === 'GET' && (path === '/api/leveltest/ticket' || path === '/api/leveltest/ticket.ics')) {
      await ensureLtApps();
      const k = (url.searchParams.get('k') || '').trim();
      const appId = await verifyLtTicket(k, env);
      if (!appId) {
        return json({ ok: false, error: 'invalid_ticket', message: '링크가 만료되었거나 올바르지 않습니다.', message_en: 'This link is expired or invalid.' }, 404);
      }
      // 🔒 p = 전화번호 뒷 4자리. 결과(점수·레벨·교재) 열람에만 쓰인다 —
      //    없거나 틀려도 일정·입장은 그대로 열린다(수업에 못 들어가는 일을 만들지 않는다).
      const pin = (url.searchParams.get('p') || '').trim();
      const t = await buildLtTicket(env, appId, k, pin);
      if (!t) return json({ ok: false, error: 'not_found' }, 404);
      if (path === '/api/leveltest/ticket.ics') {
        if (!t.start_ts) return json({ ok: false, error: 'no_schedule', message: '아직 일정이 확정되지 않았습니다.', message_en: 'The schedule is not confirmed yet.' }, 409);
        return new Response(buildLtIcs(t, `${publicBase(env)}/t.html?k=${k}`), {
          headers: {
            'Content-Type': 'text/calendar; charset=utf-8',
            'Content-Disposition': 'attachment; filename="mangoi-leveltest.ics"',
            'Cache-Control': 'no-store',
          },
        });
      }
      return json({ ok: true, ticket: t });
    }

    /* ═══════════════════════════════════════════════════════════════════════
       🙋 «내 레벨테스트» — 학생/학부모 본인 조회  GET /api/leveltest/my?uid=&token=
       ───────────────────────────────────────────────────────────────────────
       [왜] 신청은 저장되는데 «학생이 자기 신청을 읽는» 경로가 아예 없었다.
            읽기 API 는 관리자용·강사용 둘뿐이라, 마이페이지(parent.html)에서
            신청 현황을 보여줄 방법이 없었고 «신청했는데 안 보인다» 문의가 났다.
       [보안] 🔐 본인 것만. mango_token(uid 서명) 의 uid 와 요청 uid 가 같아야 함.
              이름(student_name)으로는 절대 매칭하지 않는다 — 동명이인이 많아
              (김민서 71명) 남의 신청·점수가 새어나간다.
              단 하나의 예외: student_uid 가 비어 있고 student_name 이 «내 uid 와
              문자열이 같은» 경우. 로그인 없이 신청하면서 이름칸에 자기 아이디를
              적은 흔한 케이스인데, uid 는 유일하므로 동명이인 위험이 없다.
       [노출범위] 교사명은 교사가 «수락»(confirmed/done)한 뒤에만 알려준다.
                  proposed(소프트 배정) 단계에서 이름이 새면 교사가 거절했을 때
                  «담당이 바뀌었다»는 혼선이 생긴다 — 2단계 승인 설계와 동일.
       ═══════════════════════════════════════════════════════════════════════ */
    if (method === 'GET' && path === '/api/leveltest/my') {
      await ensureLtApps();
      const myUid = (url.searchParams.get('uid') || '').trim();
      if (!myUid) return invalidBody(['uid']);
      const authUid = await authUidGlobal(request, url, env);
      if (!authUid || authUid !== myUid) {
        return json({ ok: false, error: 'auth_required', message: '로그인이 필요합니다.', message_en: 'Please sign in.' }, 401);
      }

      /* ═══════════════════════════════════════════════════════════════════════
         🔗 (2026-08-11) «PC 에서 신청한 것이 폰에서도 보이게» — 티켓 + 로그인 = 스스로 잇기
         ───────────────────────────────────────────────────────────────────────
         [왜] 비로그인으로 낸 신청은 서버가 만든 체험 계정 `lt{번호}` 에 붙는다(createTrialStudent).
              그 계정으로 로그인하는 사람은 세상에 없으므로, 자기 예약을 찾는 길이
              «신청한 그 브라우저에 남은 티켓» 하나뿐이 된다. 기기를 옮기면 통째로 사라진다.
              실사고: 신청 #17(pauljeong) — PC 에서는 티켓으로 보였는데 폰에서는 아무것도 없었다.
              계정은 `jeong`, 신청 주인은 `lt17_1` 이라 uid 조회가 영원히 0건이었다.
         [무엇] 티켓 서명(k) = «신청자 본인» 증명, mango_token = «계정 주인» 증명.
              **둘 다 가진 사람만** 자기 신청을 자기 계정으로 가져온다.
              한 번 이으면 그 뒤로는 로그인만 하면 어느 기기에서나 보인다.
         ⛔ 남의 신청을 뺏지 않는다 — 주인이 «없거나 체험 계정(lt*)» 인 건만 옮긴다.
            진짜 계정이 이미 붙어 있으면 서명이 맞아도 손대지 않는다.
         ⚠️ 수업 주인(class_schedules.user_id)도 반드시 같이 옮긴다. 신청서만 옮기면
            «연결은 됐는데 오늘 수업엔 안 뜨는» 반쪽이 된다 — link_student 가 밟았던 함정과 같다.
         ⚠️ 잇기가 실패해도 조회는 그대로 진행한다. 부가 기능이 본 기능을 막으면 안 된다.
         ═══════════════════════════════════════════════════════════════════════ */
      const claimK = (url.searchParams.get('k') || '').trim();
      if (claimK) {
        try {
          const claimId = await verifyLtTicket(claimK, env);
          if (claimId) {
            const row = await env.DB.prepare(
              `SELECT id, student_uid, schedule_id FROM leveltest_applications WHERE id = ? LIMIT 1`
            ).bind(claimId).first<any>();
            const owner = row ? String(row.student_uid || '') : '';
            const ownerIsTrial = /^lt\d+(_\d+)?$/i.test(owner);
            if (row && owner !== myUid && (!owner || ownerIsTrial)) {
              const claimAt = Date.now();
              await env.DB.prepare(`UPDATE leveltest_applications SET student_uid = ?, updated_at = ? WHERE id = ?`)
                .bind(myUid, claimAt, Number(row.id)).run();
              if (row.schedule_id) {
                try {
                  await env.DB.prepare(`UPDATE class_schedules SET user_id = ?, updated_at = ? WHERE id = ?`)
                    .bind(myUid, claimAt, Number(row.schedule_id)).run();
                } catch { /* 수업 이동 실패 — 신청서는 이미 이어졌다. 관리자 link_student 로 마저 옮길 수 있다 */ }
              }
              try {
                await writeClassAudit(env, {
                  action: 'leveltest_self_claim', schedule_id: row.schedule_id || null,
                  actor: myUid, actor_role: 'student', source: 'leveltest_ticket',
                  detail: JSON.stringify({ app_id: row.id, from: owner || null, to: myUid, from_was_trial: ownerIsTrial }),
                });
              } catch {}
            }
          }
        } catch { /* 잇기 실패는 조용히 넘긴다 — 아래 목록 조회는 그대로 */ }
      }

      const rs = await env.DB.prepare(
        `SELECT id, student_name, desired_date, desired_time, status, assigned_teacher, teacher_confirmed_at,
                ai_score, pron_score, teacher_score, final_level,
                recommended_textbook, next_class_guide, schedule_id, source, created_at, updated_at
           FROM leveltest_applications
          WHERE student_uid = ? OR (student_uid IS NULL AND student_name = ?)
          ORDER BY created_at DESC LIMIT 20`
      ).bind(myUid, myUid).all();
      const mine = (rs.results || []) as any[];
      // 🎤 발음 점수는 관리자 목록과 같은 원천(voice_coaching 최신)으로 오버레이 — 두 화면 숫자가 어긋나지 않게
      try {
        const vc = await env.DB.prepare(
          `SELECT pronunciation_score FROM voice_coaching WHERE student_uid = ? ORDER BY created_at DESC LIMIT 1`
        ).bind(myUid).first<any>();
        if (vc && vc.pronunciation_score != null) {
          mine.forEach(a => { if (a.pron_score == null) a.pron_score = vc.pronunciation_score; });
        }
      } catch { /* voice_coaching 미존재 시 무시 */ }
      const items = mine.map(a => ({
        ...a,
        assigned_teacher: (a.status === 'confirmed' || a.status === 'done') ? a.assigned_teacher : null,
        /* 🏷️ (2026-09-14) «C2» 를 사람이 읽게 — 이름·사다리 칸 수는 서버 정본(cefrDisplay)이 만든다.
           화면(idx-leveltest-card.js)은 그리기만 한다. 모르는 값이면 null → 화면은 원문 그대로. */
        level_display: cefrDisplay(a.final_level),
      }));
      return json({ ok: true, items });
    }
    if (path === '/api/admin/leveltest/applications') {
      await ensureLtApps();
      if (method === 'GET') {
        const statusF = url.searchParams.get('status');
        const lim = Math.max(1, Math.min(500, parseInt(url.searchParams.get('limit') || '100', 10)));
        /* 🔒 (2026-09-23) 지사·대리점 스코핑 — 이 표엔 franchise/shop_name 칸이 없어(체험 리드라
           계정이 아예 없는 신청도 많음) students_erp 를 student_uid 로 조인해서만 자를 수 있다.
           ⛔ 모르면(=uid 가 없으면) 막는 쪽으로 실패한다 — 계정 없는 체험 리드는 지사·대리점
           계정에는 «안 보인다»(우리 소속인지 증명할 방법이 없으므로). 본사(hq)·내부직원(none)은
           그대로 전체를 본다. */
        const _ltScope = await scopeFragments(env, request);
        let q = `SELECT * FROM leveltest_applications`;
        const whereParts: string[] = [];
        const binds: any[] = [];
        if (statusF) { whereParts.push(`status = ?`); binds.push(statusF); }
        if (_ltScope.scope.type !== 'hq' && _ltScope.scope.type !== 'none') {
          const _c = scopeStudentCond(_ltScope.scope, 'se');
          whereParts.push(`(student_uid IS NOT NULL AND student_uid <> '' AND EXISTS (SELECT 1 FROM students_erp se WHERE se.user_id = leveltest_applications.student_uid AND (${_c.cond})))`);
          binds.push(..._c.binds);
        }
        if (whereParts.length) q += ` WHERE ${whereParts.join(' AND ')}`;
        q += ` ORDER BY (status = 'pending') DESC, created_at DESC LIMIT ?`;
        binds.push(lim);
        const rs = await env.DB.prepare(q).bind(...binds).all();
        const items = (rs.results || []) as any[];
        // 🎤 발음 점수 자동 연결 — 학생이 speech-coach에서 남긴 최신 voice_coaching 점수를 오버레이(항상 최신)
        try {
          const uids = Array.from(new Set(items.filter(a => a.student_uid).map(a => a.student_uid)));
          if (uids.length) {
            // ⚠️ (2026-08-07) limit 이 최대 500 이라 uids 가 100개를 넘으면 D1 이 던지고,
            //    아래 catch 가 삼켜 발음 점수가 통째로 안 붙었습니다(빈 칸으로만 보임).
            //    GROUP BY 키가 IN 목록과 같은 student_uid 라 청크로 나눠도 결과는 동일합니다.
            const vcRows = await selectInChunks<any>(env.DB, uids,
              (ph) => `SELECT student_uid, pronunciation_score, MAX(created_at) AS mx FROM voice_coaching WHERE student_uid IN (${ph}) GROUP BY student_uid`);
            const pmap: Record<string, number> = {};
            vcRows.forEach((r: any) => { if (r.pronunciation_score != null) pmap[r.student_uid] = r.pronunciation_score; });
            items.forEach(a => { if (a.pron_score == null && a.student_uid && pmap[a.student_uid] != null) a.pron_score = pmap[a.student_uid]; });
          }
        } catch (e) { /* voice_coaching 미존재 시 무시 */ }
        /* 🎟️ (2026-08-07) 티켓 링크를 목록에 함께 내려준다.
           [왜] 링크는 지금까지 ①신청 직후 응답·문자 ②확정 문자 ③10분 전 리마인더,
                이 세 곳에서만 만들어졌다. 그래서 신청자가 문자를 못 찾으면 상담직원도
                꺼내 줄 데가 없었다 — 실제로 오늘 그 상황이 났다(신청 #15).
                링크 하나가 확인·일정·장비점검·당일 입장을 전부 담당하는데,
                운영자가 그걸 다시 건네줄 방법이 없던 것이다.
           [노출] 이 API 는 관리자 인증 게이트 뒤에 있다. 링크는 신청자 본인에게 주라고
                  만든 것이고, 운영자가 대신 전달하는 것이 이 기능의 목적이다.
           ⚠️ 행마다 서명하므로 키 import 는 한 번만 한다(ltTicketUrlMap). */
        try {
          const tmap = await ltTicketUrlMap(items.map(a => Number(a.id)), env);
          items.forEach(a => { a.ticket_url = tmap[Number(a.id)] || null; });
        } catch (e) { items.forEach(a => { a.ticket_url = null; }); }
        // pending 배지 숫자도 같은 스코프로 — 지사·대리점에 «전국 대기건수»가 보이면 그 자체로
        // 정보 유출은 아니지만 화면이 «우리 소속 기준» 이라는 착각을 준다(items 와 일관되게).
        let cntQ = `SELECT COUNT(*) AS n FROM leveltest_applications WHERE status = 'pending'`;
        const cntBinds: any[] = [];
        if (_ltScope.scope.type !== 'hq' && _ltScope.scope.type !== 'none') {
          const _c2 = scopeStudentCond(_ltScope.scope, 'se');
          cntQ += ` AND (student_uid IS NOT NULL AND student_uid <> '' AND EXISTS (SELECT 1 FROM students_erp se WHERE se.user_id = leveltest_applications.student_uid AND (${_c2.cond})))`;
          cntBinds.push(..._c2.binds);
        }
        const cnt = await env.DB.prepare(cntQ).bind(...cntBinds).all();
        const pending = (cnt.results && cnt.results[0] && (cnt.results[0] as any).n) || 0;
        return json({ ok: true, items, pending });
      }
      /* 🗑️ DELETE — 신청 삭제 (2026-08-21, 사장님 지시: 레벨테스트 신청현황의 데모 항목 정리)
         ⛔ 본사만. `canEditOrg()` 는 강사(scope 'none')까지 통과시키는 함정이 있어(CLAUDE.md
            trap) 쓰지 않는다 — 다른 "본사만" 엔드포인트와 같은 role==='hq'|'staff' 패턴.
         ⚠️ 되돌릴 수 없다. 연결된 수업(schedule_id)이 있으면 삭제 전에 먼저 cancelled 로
            정리한다 — 신청서만 지우면 강사·학생 달력에 담당 없는 유령 수업이 남는다
            (위 「취소했는데 수업은 살아 있다」 사고와 같은 뿌리). */
      if (method === 'DELETE') {
        const actor = await getAdminActor(request, env as any);
        if (!actor.ok || actor.isTeacher || !(actor.role === 'hq' || actor.role === 'staff')) {
          return json({ ok: false, error: 'forbidden_scope', message: '레벨테스트 신청 삭제는 본사만 할 수 있습니다.', message_en: 'Only HQ accounts can delete level-test applications.' }, 403);
        }
        const delBody: any = await parseJsonBody(request).catch(() => null);
        const idsParam = url.searchParams.get('ids') || url.searchParams.get('id');
        let ids: number[] = [];
        if (delBody && Array.isArray(delBody.ids)) ids = delBody.ids.map((x: any) => Number(x));
        else if (delBody && delBody.id != null) ids = [Number(delBody.id)];
        else if (idsParam) ids = idsParam.split(',').map((s: string) => Number(s.trim()));
        ids = Array.from(new Set(ids.filter((n) => Number.isFinite(n) && n > 0)));
        if (!ids.length) return invalidBody(['ids']);
        if (ids.length > 90) return json({ ok: false, error: 'too_many', message: '한 번에 최대 90건까지 삭제할 수 있습니다.' }, 400);

        let actorName = 'admin';
        try { if (actor.name) actorName = actor.name; } catch {}
        const deleted: number[] = [];
        const notFound: number[] = [];
        for (const id of ids) {
          const appRow: any = await env.DB.prepare(
            `SELECT id, schedule_id, student_name, desired_date, desired_time, assigned_teacher FROM leveltest_applications WHERE id = ? LIMIT 1`
          ).bind(id).first();
          if (!appRow) { notFound.push(id); continue; }
          if (appRow.schedule_id) {
            try {
              const sched: any = await env.DB.prepare(
                `SELECT id, status FROM class_schedules WHERE id = ? LIMIT 1`
              ).bind(Number(appRow.schedule_id)).first();
              if (sched && String(sched.status || 'active') !== 'cancelled') {
                await env.DB.prepare(`UPDATE class_schedules SET status='cancelled', updated_at=? WHERE id=?`)
                  .bind(Date.now(), Number(sched.id)).run();
              }
            } catch (e: any) { console.warn('[leveltest delete] schedule cancel skipped:', e?.message || e); }
          }
          try {
            await writeClassAudit(env, {
              action: 'delete', schedule_id: appRow.schedule_id || null,
              teacher_name: appRow.assigned_teacher || null,
              student_name: appRow.student_name || null,
              lesson_date: appRow.desired_date || null, lesson_time: appRow.desired_time || null,
              actor: actorName, actor_role: 'admin', source: 'leveltest_app',
              reason: '레벨테스트 신청 삭제 (연결 수업 취소 처리)',
              detail: JSON.stringify({ app_id: id }),
            });
          } catch {}
          await env.DB.prepare(`DELETE FROM leveltest_applications WHERE id = ?`).bind(id).run();
          deleted.push(id);
        }
        return json({ ok: true, deleted, not_found: notFound });
      }
      // POST → 상태/배정/메모 업데이트
      /* ⛔ (2026-09-23) 지사·대리점은 이 POST 전체를 막는다 — 아래 action 들(create_schedule =
         실제 수업 예약 생성·teacher 배정, link_student = class_schedules.user_id 까지 다시
         쓰는 계정 연결, link_candidates = students_erp 전화번호/이름 전국 조회)이 전부 스코프
         없이 전국을 대상으로 하는 쓰기다. GET(목록 조회)만 위에서 스코프를 걸어 열었고,
         DELETE 는 이미 본사만이었다 — 여기서 POST 도 같은 기준으로 맞춘다. */
      {
        const _ltPostActor = await getAdminActor(request, env as any);
        if (isOrgScopedRole(_ltPostActor.role)) {
          return json({ ok: false, error: 'forbidden_scope', message: '레벨테스트 신청 처리는 본사만 할 수 있습니다.', message_en: 'Only HQ accounts can process level-test applications.' }, 403);
        }
      }
      const b = await parseJsonBody(request);
      if (!b || !b.id) return invalidBody(['id']);

      /* ═══════════════════════════════════════════════════════════════════════
         🔗 1단계 (2026-08-05 사장님 지시) — 신청 → «실제 수업 예약» 만들기
         ───────────────────────────────────────────────────────────────────────
         [왜] 지금까지 신청을 «완료» 처리해도 수업은 한 건도 생기지 않았다.
              사장님 테스트 건(#13)은 사람이 D1 에 직접 넣어야 했다.
              두 표가 서로를 모르니 «달력에 뜬 것이 확정인지 희망인지» 도 구분이 안 됐다.
         [무엇] 희망일·희망시간·담당강사로 class_schedules 를 만들고,
              신청서에 schedule_id 를 박아 둘을 잇는다.
              예약이 있으면 방 번호가 class-{id}-{YYYYMMDD} 로 자동 결정되므로,
              강사·학생이 방 코드를 주고받다 엇갈리는 사고가 원천 차단된다.
         ⚠️ 새 라우트를 만들지 않고 «이미 열려 있는 이 POST» 에 action 으로 얹는다.
            새 경로는 src/index.ts 의 라우팅+인증게이트에 등록해야 하는데, 그 파일은
            사고 반경이 서비스 전체다. 여기 얹으면 인증은 이미 통과한 뒤다.
         ⚠️ 조용한 실패를 만들지 않는다 — 학생 계정·강사를 못 찾으면 «만들어 두고 모른 척»
            하지 않고 이유를 돌려준다. 계정 없는 예약은 학생 화면에 영영 안 뜬다.
         ═══════════════════════════════════════════════════════════════════════ */
      if (String(b.action || '') === 'create_schedule') {
        /* 🔗 신청 → «실제 수업». 로직은 leveltest-schedule.ts 한 곳에만 있다.
           같은 일을 신청 직후 자동으로도 하기 때문에(autoScheduleOnApply), 두 경로가
           서로 다르게 동작하면 «자동으로 만든 수업»과 «손으로 만든 수업»이 미묘하게
           달라져 나중에 아무도 원인을 못 찾는다. */
        const appRow: any = await env.DB.prepare(
          `SELECT * FROM leveltest_applications WHERE id = ? LIMIT 1`
        ).bind(Number(b.id)).first();
        if (!appRow) return json({ ok: false, error: 'not_found', message: '신청 건을 찾을 수 없습니다.', message_en: 'Application not found.' }, 404);

        let actorName = 'admin';
        try { const a = await getAdminActor(request, env as any); if (a?.name) actorName = a.name; } catch {}

        const res = await createLeveltestSchedule(env, appRow, {
          userId: b.user_id, scheduledDate: b.scheduled_date, startTime: b.start_time,
          durationMin: b.duration_min, force: !!b.force, actor: actorName,
          /* 관리자가 직접 누른 경우에도 계정이 없으면 만들어 준다 — 되묻는 순간 관리자는
             «아무 계정이나» 넣게 되고(실제로 그렇게 남의 학생 기록이 오염될 뻔했다),
             그 판단은 사람이 할 만한 일이 아니다. */
          allowCreateStudent: b.create_student !== false,
        });
        if (!res.ok) {
          const { status, ...rest } = res;
          return json(rest, status);
        }
        /* 수업이 잡혔으면 신청 상태도 확정으로 올린다(대기 중이던 건만)
           🎯 (2026-09-21) 'ai_done' 을 함께 넣은 이유 — 사람이 «이 건으로 수업을 잡았다» 는 것은
              그 건을 선생님 흐름으로 들인 행동이다. 안 넣으면 수업을 잡아 두고도 상태가
              «AI 자동진단 완료» 에 굳어 화면이 거짓말을 한다. 정본: src/student-track.ts */
        await env.DB.prepare(
          `UPDATE leveltest_applications SET status = CASE WHEN status IN ('pending','proposed','ai_done') THEN 'confirmed' ELSE status END, updated_at = ? WHERE id = ?`
        ).bind(Date.now(), Number(b.id)).run();
        return json(res);
      }

      /* ═══════════════════════════════════════════════════════════════════════
         🔗 신청 ↔ «진짜 학생 계정» 연결 (2026-08-07, 실사고에서 나옴)
         ───────────────────────────────────────────────────────────────────────
         [왜] 비로그인으로 낸 신청은 진짜 계정에 붙지 못한다. 서버가 대신
              체험 계정 `lt{신청번호}`(createTrialStudent)를 만들어 붙이는데,
              그 계정으로 로그인하는 사람은 세상에 없다. 그래서
                · 마이페이지 「내 레벨테스트」 — 안 뜸(조회는 uid 로만 한다)
                · 홈 「🎟️ 내 레벨테스트」 — 안 뜸
                · 그 학생의 «오늘 수업» — 수업 주인이 lt15 라 안 뜸
              전부 «에러 없이» 안 보인다. 실제 사고: 신청 #15(paul710619) —
              사장님이 자기 예약을 못 찾았다. #13 은 student_uid 가 아예 NULL.
              사람이 «이 신청 = 이 계정» 이라고 정해 주는 길이 아예 없었다.
         [무엇] ① link_candidates — 전화번호·이름으로 후보 계정을 찾아 준다.
                   ⚠️ 관리자가 손으로 아이디를 치게 하면 오타 한 번에 **남의 학생**
                      기록이 오염된다. 후보를 보여 주고 고르게 한다.
                ② link_student  — 신청서 uid 를 바꾸고, **이미 만들어진 수업의
                   주인(class_schedules.user_id)도 같이 바꾼다.**
                   ⚠️ 신청서만 바꾸면 화면엔 연결된 것처럼 보이는데 수업은 여전히
                      lt15 것이라 학생 화면에 안 뜬다 — 강사 동기화에서 똑같은
                      함정을 이미 한 번 밟았다(바로 아래 teacherSync 주석 참조).
         ⚠️ 새 라우트를 만들지 않는다 — src/index.ts 는 사고 반경이 서비스 전체다.
         ⛔ 체험 계정(lt*) 행 자체는 지우지 않는다. 되돌릴 수 없는 일은 하지 않는다.
         ═══════════════════════════════════════════════════════════════════════ */
      if (String(b.action || '') === 'link_candidates' || String(b.action || '') === 'link_student') {
        const appRow: any = await env.DB.prepare(
          `SELECT id, student_name, student_uid, phone, schedule_id, desired_date, desired_time FROM leveltest_applications WHERE id = ? LIMIT 1`
        ).bind(Number(b.id)).first();
        if (!appRow) return json({ ok: false, error: 'not_found', message: '신청 건을 찾을 수 없습니다.', message_en: 'Application not found.' }, 404);

        const digits = (s: any) => String(s || '').replace(/[^0-9]/g, '');
        const isTrial = (u: any) => /^lt\d+(_\d+)?$/i.test(String(u || ''));

        if (String(b.action) === 'link_candidates') {
          const ph = digits(appRow.phone);
          const nm = String(appRow.student_name || '').trim();
          const rows: any[] = [];
          const seen = new Set<string>();
          const push = (r: any, why: string) => {
            const uid = String(r.user_id || '');
            if (!uid || seen.has(uid)) return;
            seen.add(uid);
            rows.push({
              user_id: uid,
              name: r.student_name || r.korean_name || r.english_name || r.username || uid,
              phone: r.student_phone || r.parent_phone || r.phone || null,
              status: r.status || null,
              is_trial: isTrial(uid),
              why,
            });
          };
          // ① 전화번호 — 가장 강한 단서. 하이픈 차이를 무시하려고 숫자만 비교한다.
          if (ph.length >= 9) {
            try {
              const rs = await env.DB.prepare(
                `SELECT user_id, student_name, korean_name, english_name, username, student_phone, parent_phone, phone, status
                   FROM students_erp
                  WHERE REPLACE(REPLACE(COALESCE(student_phone,''),'-',''),' ','') = ?
                     OR REPLACE(REPLACE(COALESCE(parent_phone,''),'-',''),' ','') = ?
                     OR REPLACE(REPLACE(COALESCE(phone,''),'-',''),' ','') = ?
                  LIMIT 20`
              ).bind(ph, ph, ph).all();
              (rs.results || []).forEach((r: any) => push(r, 'phone'));
            } catch {}
          }
          // ② 이름·아이디 — 정확히 같은 것만. 부분일치는 «Anna 가 HANNAH 에 붙는» 사고를 낸다.
          if (nm) {
            try {
              const rs = await env.DB.prepare(
                `SELECT user_id, student_name, korean_name, english_name, username, student_phone, parent_phone, phone, status
                   FROM students_erp
                  WHERE user_id = ? OR login_id = ? OR student_name = ? OR korean_name = ? OR english_name = ?
                  LIMIT 20`
              ).bind(nm, nm, nm, nm, nm).all();
              (rs.results || []).forEach((r: any) => push(r, 'name'));
            } catch {}
          }
          // ③ 관리자가 직접 친 아이디 — 있으면 그것도 확인해 준다(없으면 없다고 말한다)
          const typed = String(b.q || '').trim();
          let typedFound: any = null;
          if (typed) {
            try {
              const r: any = await env.DB.prepare(
                `SELECT user_id, student_name, korean_name, english_name, username, student_phone, parent_phone, phone, status
                   FROM students_erp WHERE user_id = ? OR login_id = ? LIMIT 1`
              ).bind(typed, typed).first();
              if (r) { push(r, 'typed'); typedFound = String(r.user_id); }
            } catch {}
          }
          return json({
            ok: true,
            application: { id: appRow.id, student_name: appRow.student_name, student_uid: appRow.student_uid,
                           is_trial: isTrial(appRow.student_uid), phone: appRow.phone, schedule_id: appRow.schedule_id },
            typed_found: typed ? typedFound : undefined,
            candidates: rows,
          });
        }

        // ── 실제 연결 ──
        const newUid = String(b.student_uid || '').trim();
        if (!newUid) return invalidBody(['student_uid']);
        const target: any = await env.DB.prepare(
          `SELECT user_id, student_name, korean_name FROM students_erp WHERE user_id = ? OR login_id = ? LIMIT 1`
        ).bind(newUid, newUid).first();
        if (!target) {
          return json({ ok: false, error: 'student_not_found',
            message: `«${newUid}» 계정을 찾지 못했습니다. 아이디를 확인해 주세요.`,
            message_en: `Account "${newUid}" was not found. Please check the ID.` }, 404);
        }
        const prevUid = appRow.student_uid || null;
        const now2 = Date.now();
        await env.DB.prepare(`UPDATE leveltest_applications SET student_uid = ?, updated_at = ? WHERE id = ?`)
          .bind(String(target.user_id), now2, Number(appRow.id)).run();
        // 수업 주인도 같이 옮긴다 — 안 옮기면 «연결됐는데 수업은 안 보이는» 상태가 된다
        let scheduleMoved: any = null;
        if (appRow.schedule_id) {
          try {
            await env.DB.prepare(`UPDATE class_schedules SET user_id = ?, updated_at = ? WHERE id = ?`)
              .bind(String(target.user_id), now2, Number(appRow.schedule_id)).run();
            scheduleMoved = { schedule_id: appRow.schedule_id, user_id: String(target.user_id) };
          } catch (e: any) { scheduleMoved = { schedule_id: appRow.schedule_id, error: String(e?.message || e).slice(0, 80) }; }
        }
        let actorName2 = 'admin';
        try { const a = await getAdminActor(request, env as any); if (a?.name) actorName2 = a.name; } catch {}
        try {
          await writeClassAudit(env, {
            action: 'leveltest_link_student', schedule_id: appRow.schedule_id || null,
            student_name: appRow.student_name || null,
            lesson_date: appRow.desired_date || null, lesson_time: appRow.desired_time || null,
            actor: actorName2, actor_role: 'admin', source: 'leveltest_app',
            detail: JSON.stringify({ app_id: appRow.id, from: prevUid, to: String(target.user_id), from_was_trial: isTrial(prevUid) }),
          });
        } catch {}
        return json({
          ok: true, app_id: appRow.id, from: prevUid, to: String(target.user_id),
          student_name: target.student_name || target.korean_name || String(target.user_id),
          schedule: scheduleMoved,
          prev_was_trial: isTrial(prevUid),
        });
      }

      const fields: string[] = [];
      const binds: any[] = [];
      if (b.status != null)           { fields.push('status = ?');           binds.push(String(b.status)); }
      if (b.assigned_teacher != null) { fields.push('assigned_teacher = ?'); binds.push(String(b.assigned_teacher)); }
      if (b.note != null)             { fields.push('note = ?');             binds.push(String(b.note)); }
      if (b.final_level != null)      { fields.push('final_level = ?');      binds.push(String(b.final_level)); }
      // 🧑‍🏫 선생님 1:1 평가(3번째 축) — 루브릭 점수 + 평가자 + 확정 시 완료 처리
      if (b.teacher_score != null)    { fields.push('teacher_score = ?');    binds.push(Number(b.teacher_score)); }
      if (b.teacher_rubric != null)   { fields.push('teacher_rubric = ?');   binds.push(typeof b.teacher_rubric === 'string' ? b.teacher_rubric : JSON.stringify(b.teacher_rubric)); }
      if (b.evaluated_by != null)     { fields.push('evaluated_by = ?');     binds.push(String(b.evaluated_by)); }
      if (b.teacher_score != null || b.teacher_rubric != null) { fields.push('evaluated_at = ?'); binds.push(Date.now()); }
      // 📚 (2026-07-22) 추천 교재 / 다음 수업 안내 — 학부모 컴플레인 #6
      if (b.recommended_textbook != null) { fields.push('recommended_textbook = ?'); binds.push(String(b.recommended_textbook)); }
      if (b.next_class_guide != null)     { fields.push('next_class_guide = ?');     binds.push(String(b.next_class_guide)); }
      // 결과 확정(final_level)인데 추천 교재가 함께 오지 않으면 누락 경고를 응답에 실어 UI가 재확인하게 함
      if (!fields.length) return invalidBody(['status']);
      /* 🧹 (2026-08-13 사장님 지시) 취소·되돌리기 동기화를 위해 «바꾸기 전» 상태를 먼저 읽어 둔다 */
      let stPrev: any = null;
      if (b.status != null) {
        try {
          stPrev = await env.DB.prepare(
            `SELECT id, status, student_name, student_uid, desired_date, desired_time, assigned_teacher, schedule_id FROM leveltest_applications WHERE id = ? LIMIT 1`
          ).bind(Number(b.id)).first();
        } catch {}
      }
      fields.push('updated_at = ?'); binds.push(Date.now());
      binds.push(Number(b.id));
      await env.DB.prepare(`UPDATE leveltest_applications SET ${fields.join(', ')} WHERE id = ?`).bind(...binds).run();

      /* ═══════════════════════════════════════════════════════════════════════
         🧹 (2026-08-13 사장님 지시) 「취소했는데 수업은 살아 있다 + 누가 했는지 기록이 없다」
         ───────────────────────────────────────────────────────────────────────
         실사례: 신청 #19(paul7038) 를 취소했는데
           · 연결 수업 #862 는 status='active' 그대로 → 강사 주간표·달력에 유령 수업
           · 취소가 어디에도 안 남아 「누가 했나」 를 DB 로도 답할 수 없었다
         [무엇]
           ① 취소(cancelled)      → 연결 수업도 status='cancelled' 로 함께 정리
           ② 되돌리기(→ pending·proposed·confirmed) → 취소해 뒀던 수업을 다시 active 로
           ③ 두 경우 모두 class_audit_log 에 누가·언제·왜 를 남긴다 (best-effort)
         ⚠️ done 으로의 변경은 수업을 되살리지 않는다 — 이미 지나간 수업이다. */
      let scheduleSync: any = undefined;
      if (b.status != null && stPrev) {
        try {
          const newSt = String(b.status);
          const prevSt = String(stPrev.status || '');
          const toCancel  = newSt === 'cancelled' && prevSt !== 'cancelled';
          const toRestore = prevSt === 'cancelled' && ['pending', 'proposed', 'confirmed'].includes(newSt);
          if (toCancel || toRestore) {
            let actorName = 'admin';
            try { const a = await getAdminActor(request, env as any); if (a?.name) actorName = a.name; } catch {}
            if (stPrev.schedule_id) {
              const sched: any = await env.DB.prepare(
                `SELECT id, status, scheduled_date, start_time FROM class_schedules WHERE id = ? LIMIT 1`
              ).bind(Number(stPrev.schedule_id)).first();
              if (sched && toCancel && String(sched.status || 'active') !== 'cancelled') {
                await env.DB.prepare(`UPDATE class_schedules SET status='cancelled', updated_at=? WHERE id=?`)
                  .bind(Date.now(), Number(sched.id)).run();
                scheduleSync = { schedule_id: Number(sched.id), status: 'cancelled' };
              } else if (sched && toRestore && String(sched.status || '') === 'cancelled') {
                await env.DB.prepare(`UPDATE class_schedules SET status='active', updated_at=? WHERE id=?`)
                  .bind(Date.now(), Number(sched.id)).run();
                scheduleSync = { schedule_id: Number(sched.id), status: 'active' };
              }
            }
            await writeClassAudit(env, {
              action: toCancel ? 'cancel' : 'restore',
              schedule_id: stPrev.schedule_id || null,
              teacher_name: stPrev.assigned_teacher || null,
              student_name: stPrev.student_name || null,
              lesson_date: stPrev.desired_date || null,
              lesson_time: stPrev.desired_time || null,
              actor: actorName, actor_role: 'admin', source: 'leveltest_app',
              reason: toCancel ? '레벨테스트 신청 취소 (연결 수업 함께 정리)' : '레벨테스트 신청 되돌리기 (연결 수업 복구)',
              detail: JSON.stringify({ app_id: Number(b.id), from: prevSt, to: newSt, schedule_sync: scheduleSync || null }),
            });
          }
        } catch (e: any) { scheduleSync = { error: String(e?.message || e).slice(0, 80) }; }
      }

      /* 🔗 (2026-08-06) 강사를 바꿨으면 «이미 만들어진 수업»의 담당도 같이 바꾼다.
         [왜] 신청 즉시 수업이 자동으로 만들어지게 된 뒤로, 관리자가 목록에서 강사 드롭다운만
              바꾸면 **신청서와 수업의 담당이 어긋난다**. 화면에는 바꾼 이름이 보이니 바뀐 줄 알지만
              실제 수업은 옛 강사에게 남아, 새 강사 화면에는 영영 안 뜬다. 에러는 0.
              실제로 그렇게 됐다: 신청 #15 를 'Teacher Maimai' 로 바꿨는데 수업 #854 의 담당은
              BELLE 그대로였다 → 마이마이가 로그인해도 그 수업이 없다.
         ⚠️ 강사 번호는 신청서의 assigned_teacher_id(=teacher_profiles)를 쓰지 않는다. 그 번호는
            class_schedules 의 번호 체계(teachers.id)와 다른 사람을 가리킨다. 이름으로 되찾는다. */
      let teacherSync: any = undefined;
      if (b.assigned_teacher != null) {
        try {
          const appT: any = await env.DB.prepare(
            `SELECT id, schedule_id, assigned_teacher FROM leveltest_applications WHERE id = ? LIMIT 1`
          ).bind(Number(b.id)).first();
          if (appT?.schedule_id) {
            const normT = (s: any) => String(s || '').toLowerCase().replace(/teacher/g, '').replace(/[^a-z0-9가-힣]/g, '');
            const want = normT(appT.assigned_teacher);
            const ts: any = await env.DB.prepare(`SELECT id, name FROM teachers WHERE COALESCE(active,1) = 1`).all();
            const hit = (ts.results || []).find((r: any) => normT(r.name) === want);
            if (hit) {
              await env.DB.prepare(`UPDATE class_schedules SET teacher_id = ?, updated_at = ? WHERE id = ?`)
                .bind(String(hit.id), Date.now(), Number(appT.schedule_id)).run();
              teacherSync = { schedule_id: appT.schedule_id, teacher_id: String(hit.id), teacher: hit.name };
              /* 📜 (2026-08-12) 강사 교체가 이력에 안 남던 자리 —
                 「내 수업 강사가 언제 왜 바뀌었나」를 학생도 강사도 되짚을 수 없었다. */
              let _tsActor = 'admin';
              try { const _a = await getAdminActor(request, env as any); if (_a?.name) _tsActor = _a.name; }
              catch (e) { console.warn('[leveltest teacherSync] actor 조회 실패 — 감사기록에 이름 대신 admin 이 남습니다:', (e as any)?.message); }
              await writeClassAudit(env, {
                action: 'teacher_change', schedule_id: appT.schedule_id,
                teacher_name: hit.name || null,
                actor: _tsActor, actor_role: 'admin', source: 'leveltest_app',
                reason: '레벨테스트 신청서의 담당 강사 변경을 수업에 반영',
                detail: JSON.stringify({ app_id: appT.id, to_teacher_id: String(hit.id), to_teacher: hit.name }),
              });
            } else {
              // 못 찾으면 조용히 넘기지 않는다 — 화면은 «바뀐 것처럼» 보이는데 수업은 안 바뀐 상태다
              teacherSync = { schedule_id: appT.schedule_id, error: 'teacher_not_in_roster', candidate: appT.assigned_teacher };
            }
          }
        } catch (e: any) { teacherSync = { error: String(e?.message || e).slice(0, 80) }; }
      }

      // 📣 결과 확정 통보 — final_level 이 채워지는 순간 학부모/학생 번호로 1회 통보 (result_notified_at 으로 dedup)
      //    기존엔 접수/교사확정 알림만 있고 '결과' 통보가 없어 학부모가 결과·추천교재를 알 수 없었음.
      let resultNotify: any = undefined;
      if (b.final_level != null || b.recommended_textbook != null || b.next_class_guide != null) {
        try {
          const app2: any = await env.DB.prepare(`SELECT * FROM leveltest_applications WHERE id = ? LIMIT 1`).bind(Number(b.id)).first();
          // 레벨 + 추천 교재가 모두 채워진 시점에 1회만 발송 — 교재 없는 반쪽 결과 문자는 보내지 않는다
          if (app2 && app2.phone && !app2.result_notified_at && app2.final_level && String(app2.recommended_textbook || '').trim()) {
            const book = String(app2.recommended_textbook || '').trim();
            const guide = String(app2.next_class_guide || '').trim();
            const lines = [
              `[망고아이] ${app2.student_name}님 레벨테스트 결과가 나왔어요! 🎉`,
              `📊 레벨: ${app2.final_level}`,
            ];
            if (book) lines.push(`📚 추천 교재: ${book}`);
            if (guide) lines.push(`▶ 다음 단계: ${guide}`);
            lines.push(`정규 수업 상담: pf.kakao.com/_xlqnSxd`);
            const r = await sendPlainSms(env, app2.phone, lines.join('\n'));
            resultNotify = r && r.ok ? 'sent' : (r && (r.error || r.message)) || 'failed';
            if (r && r.ok) {
              await env.DB.prepare(`UPDATE leveltest_applications SET result_notified_at = ? WHERE id = ?`).bind(Date.now(), Number(b.id)).run();
            }
          }
        } catch (e: any) { resultNotify = 'error:' + String(e?.message || e).slice(0, 80); }
      }
      const missingBook = (b.final_level != null) && !String(b.recommended_textbook || '').trim();
      return json({ ok: true, result_notify: resultNotify, teacher_sync: teacherSync, schedule_sync: scheduleSync, warn: missingBook ? 'recommended_textbook_missing' : undefined });
    }

    // ─── 🧠 AI 자동 진단 (CEFR 객관식 배치테스트) ─────────────────────────────
    //   변별력·객관성의 핵심: 문항은행과 채점을 서버가 소유(클라이언트 조작 불가).
    //   레벨당 4문항(A1~C2, 총 24) · 천장기법(ceiling)으로 추정레벨 · 가중점수(0~100).
    //   GET  /api/leveltest/questions            → 정답 없이 문항 전달
    //   POST /api/leveltest/diagnose {answers,student_name,student_uid} → 서버채점 후 신청건에 자동첨부
    const CEFR_BANK: LtBankItem[] = [
      // A1
      { id: 'a1_1', cefr: 'A1', skill: 'grammar', q: 'She ___ a student.', choices: ['be', 'am', 'is', 'are'], a: 2, why: '주어가 3인칭 단수(She)면 be동사는 is 예요. I → am, You/We/They → are.' },
      { id: 'a1_2', cefr: 'A1', skill: 'vocab',   q: 'I have two ___.', choices: ['cat', 'cats', 'cates', 'caties'], a: 1, why: 'two 처럼 «둘 이상» 이면 명사 끝에 -s 를 붙여요. cat → cats.' },
      { id: 'a1_3', cefr: 'A1', skill: 'grammar', q: '___ is your name?', choices: ['What', 'Where', 'When', 'Who'], a: 0, why: '이름을 물을 때는 What 을 써요. Where=어디, When=언제, Who=누구.' },
      { id: 'a1_4', cefr: 'A1', skill: 'grammar', q: 'They ___ to school every day.', choices: ['goes', 'going', 'go', 'went'], a: 2, why: '주어가 They(복수)라 동사 원형 go 를 써요. goes 는 He/She/It 일 때만.' },
      // A2
      { id: 'a2_1', cefr: 'A2', skill: 'grammar', q: 'I ___ TV when the phone rang.', choices: ['watch', 'watched', 'was watching', 'am watching'], a: 2, why: '전화가 울린 «그 순간 하고 있던 일» 이라 과거진행(was/were + -ing)을 써요.' },
      { id: 'a2_2', cefr: 'A2', skill: 'grammar', q: 'This book is ___ than that one.', choices: ['interesting', 'more interesting', 'most interesting', 'interestinger'], a: 1, why: 'interesting 처럼 긴 형용사는 -er 대신 앞에 more 를 붙여 비교해요.' },
      { id: 'a2_3', cefr: 'A2', skill: 'grammar', q: 'We ___ finished our homework yet.', choices: ["didn't", "haven't", "don't", "aren't"], a: 1, why: 'yet 은 현재완료와 짝이에요 — have/has + not + 과거분사(finished).' },
      { id: 'a2_4', cefr: 'A2', skill: 'grammar', q: 'If it rains, we ___ stay home.', choices: ['will', 'would', 'were', 'have'], a: 0, why: 'if + 현재형으로 조건을 말하면 결과는 will + 동사원형으로 써요.' },
      // B1
      { id: 'b1_1', cefr: 'B1', skill: 'grammar', q: 'By the time we arrived, the movie ___.', choices: ['started', 'has started', 'had started', 'starts'], a: 2, why: '도착보다 «더 먼저» 일어난 일이라 과거완료(had + 과거분사)를 써요.' },
      { id: 'b1_2', cefr: 'B1', skill: 'grammar', q: 'He suggested ___ a taxi.', choices: ['to take', 'taking', 'take', 'took'], a: 1, why: 'suggest 뒤에는 to부정사가 아니라 동명사(-ing)가 와요.' },
      { id: 'b1_3', cefr: 'B1', skill: 'grammar', q: "I'm not used to ___ up early.", choices: ['get', 'getting', 'got', 'gets'], a: 1, why: 'be used to 뒤에는 동명사(-ing) — «~에 익숙하다». used to + 동사원형(«예전에 ~했다»)과 다릅니다.' },
      { id: 'b1_4', cefr: 'B1', skill: 'grammar', q: 'She asked me where ___.', choices: ['did I live', 'I lived', 'I live', 'lived I'], a: 1, why: '간접의문문은 «의문사 + 주어 + 동사» 순서라 did 를 쓰지 않아요.' },
      // B2
      { id: 'b2_1', cefr: 'B2', skill: 'grammar', q: '___ harder, he would have passed.', choices: ['If he studied', 'Had he studied', 'Did he study', 'He studied'], a: 1, why: '가정법 과거완료에서 If 를 빼면 had 가 주어 앞으로 나와요 (= If he had studied).' },
      { id: 'b2_2', cefr: 'B2', skill: 'grammar', q: 'The project, ___ took months, was a success.', choices: ['that', 'which', 'who', 'what'], a: 1, why: '쉼표로 덧붙이는 관계절에는 that 을 못 써요. 사물이면 which 입니다.' },
      { id: 'b2_3', cefr: 'B2', skill: 'grammar', q: "I'd rather you ___ smoke in here.", choices: ["don't", "didn't", "won't", 'not'], a: 1, why: 'would rather + 주어 뒤에는 과거형을 써서 «~하지 않으면 좋겠다» 를 나타내요.' },
      { id: 'b2_4', cefr: 'B2', skill: 'grammar', q: "It's high time we ___ a decision.", choices: ['make', 'made', 'making', 'have made'], a: 1, why: 'It is (high) time 뒤에는 과거형을 써서 «진작 했어야 한다» 를 나타내요.' },
      // C1
      { id: 'c1_1', cefr: 'C1', skill: 'grammar', q: 'No sooner ___ than it started to rain.', choices: ['we had left', 'had we left', 'we left', 'did we leave'], a: 1, why: '부정어 No sooner 가 문장 맨 앞에 오면 주어와 조동사가 뒤바뀌어요(도치).' },
      { id: 'c1_2', cefr: 'C1', skill: 'vocab',   q: "Closest in meaning to 'meticulous':", choices: ['careless', 'thorough', 'quick', 'rude'], a: 1, why: 'meticulous = 꼼꼼한. thorough(빈틈없는)와 가장 가까워요.' },
      { id: 'c1_3', cefr: 'C1', skill: 'vocab',   q: 'The negotiations ___ down over the issue of pay.', choices: ['broke', 'fell', 'came', 'went'], a: 0, why: 'break down = (협상이) 결렬되다 — 굳어진 표현이에요.' },
      { id: 'c1_4', cefr: 'C1', skill: 'grammar', q: 'Little ___ that he was being watched.', choices: ['he knew', 'did he know', 'he did know', 'knew he'], a: 1, why: '부정어 Little 이 맨 앞에 오면 도치가 일어나 did + 주어 + 동사원형이 돼요.' },
      // C2
      { id: 'c2_1', cefr: 'C2', skill: 'vocab',   q: "Closest in meaning to 'ubiquitous':", choices: ['rare', 'omnipresent', 'ancient', 'hidden'], a: 1, why: 'ubiquitous = 어디에나 있는. omnipresent(편재하는)와 같은 뜻이에요.' },
      { id: 'c2_2', cefr: 'C2', skill: 'vocab',   q: 'Her argument was so ___ that no one could refute it.', choices: ['cogent', 'vague', 'trivial', 'mundane'], a: 0, why: '아무도 반박(refute)하지 못했다 → cogent(설득력 있는). vague=모호한, trivial=사소한, mundane=평범한.' },
      { id: 'c2_3', cefr: 'C2', skill: 'vocab',   q: "'To throw in the towel' means to:", choices: ['give up', 'start a fight', 'clean up', 'win easily'], a: 0, why: '권투에서 수건을 던져 기권한 데서 온 관용구 — 포기하다.' },
      { id: 'c2_4', cefr: 'C2', skill: 'grammar', q: 'Choose the correct sentence:', choices: ['Scarcely had I sat down when the bell rang.', 'Scarcely I had sat down when the bell rang.', 'Scarcely did I had sat down when the bell rang.', 'Scarcely I sat down when the bell rang.'], a: 0, why: 'Scarcely 가 문장 맨 앞에 오면 도치가 필요해요 — had + 주어 + 과거분사.' },
    ];
    const CEFR_ORDER: string[] = [...CEFR_LADDER];   // 정본은 student-placement.ts — 홈 카드 게이지와 같은 눈금
    // 가중치 = 사다리 순번(A1=1 … C2=6). ⛔ 손으로 다시 적지 말 것 — 사다리가 바뀌면 여기만 옛것으로 남는다(2026-09-14 함정 대조 지적)
    const CEFR_WEIGHT: Record<string, number> = Object.fromEntries(CEFR_ORDER.map((L, i) => [L, i + 1]));
    if (method === 'GET' && path === '/api/leveltest/questions') {
      /* 정답(a)·해설(why)·skill 은 숨기고 문항만 전달.
         ⛔ why 를 여기에 실으면 시험 «전» 에 해설이 보인다 — 채점하기도 전에 답이 새는 길이다.
         정답·해설은 채점 뒤(diagnose)에 «틀린 문항만» 돌려준다(src/leveltest-review.ts). */
      const questions = CEFR_BANK.map(x => ({ id: x.id, cefr: x.cefr, q: x.q, choices: x.choices }));
      return json({ ok: true, questions, total: questions.length });
    }
    if (method === 'POST' && path === '/api/leveltest/diagnose') {
      await ensureLtApps();
      const b = await parseJsonBody(request);
      const answers = (b && b.answers) || {};
      const name = ((b && (b.student_name || b.name)) || '').toString().trim();
      const uid = (b && (b.student_uid || b.uid)) || null;
      // 서버 채점
      const correctByLevel: Record<string, number> = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0 };
      const totalByLevel: Record<string, number> = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0 };
      let earned = 0, maxScore = 0, correctCount = 0;
      for (const item of CEFR_BANK) {
        totalByLevel[item.cefr]++;
        maxScore += CEFR_WEIGHT[item.cefr];
        const picked = answers[item.id];
        if (picked != null && Number(picked) === item.a) {
          correctByLevel[item.cefr]++;
          earned += CEFR_WEIGHT[item.cefr];
          correctCount++;
        }
      }
      const ai_score = maxScore > 0 ? Math.round((earned / maxScore) * 100) : 0;
      // 천장기법: A1→C2 로 올라가며 각 레벨 50%(2/4) 이상 통과한 마지막 레벨을 추정레벨로.
      let level = 'Starter';
      for (const L of CEFR_ORDER) {
        if (totalByLevel[L] > 0 && correctByLevel[L] >= Math.ceil(totalByLevel[L] / 2)) level = L;
        else break;
      }
      const breakdown = CEFR_ORDER.map(L => ({ cefr: L, correct: correctByLevel[L], total: totalByLevel[L] }));
      // 신청건에 자동 첨부 (uid 우선 매칭 → 이름 → 없으면 새 신청 생성)
      const now = Date.now();
      let appId: number | null = null;
      if (uid) {
        const r = await env.DB.prepare(`SELECT id FROM leveltest_applications WHERE status IN ('pending','ai_done') AND student_uid = ? ORDER BY created_at DESC LIMIT 1`).bind(uid).all();
        if (r.results && r.results[0]) appId = (r.results[0] as any).id;
      }
      if (appId == null && name) {
        const r = await env.DB.prepare(`SELECT id FROM leveltest_applications WHERE status IN ('pending','ai_done') AND student_name = ? ORDER BY created_at DESC LIMIT 1`).bind(name).all();
        if (r.results && r.results[0]) appId = (r.results[0] as any).id;
      }
      /* 🎯 (2026-09-21) 화상수업 학생인지 먼저 본다 — 진단 결과를 어느 «상태» 로 적을지가 갈린다.
         [왜] 여기서 만들어지는 건은 지금까지 전부 status='pending' 이라 관리자 «처리 대기» 에
              들어갔다. 그런데 AI 학습도구만 쓰는 학생에게는 선생님 평가 단계가 없어서 그 대기가
              영영 안 풀린다(2026-09-21 실측: 7건 전부 pending · 선생님 평가 0건 · 아무도 «완료»
              를 안 눌렀다). 그대로 두면 진짜 신청이 들어오기 시작할 때 거기 파묻힌다.
         [🔒 본문 uid 를 믿지 않는다] 아래 placement 와 같은 이유로 «토큰으로 확인된 uid» 로만
              판정한다. 못 확인하면 track='unknown' → status='pending' 이라 **예전과 똑같다**.
              ⛔ authedUid 가 없을 때 본문 uid 로 폴백하지 말 것.
         ⚠️ 이 판정은 «추측» 이다(수강 종료·재등록 전이면 예약이 0건) — 그래서 막는 데 쓰지 않고
            상태 분류에만 쓴다. 관리자가 화면에서 되돌릴 수 있다. 정본: student-track.ts */
      let authedUid: string | null = null;
      try { authedUid = await authUidGlobal(request, url, env, b); } catch { authedUid = null; }
      const trackInfo = await resolveStudentTrack(env, authedUid);
      const appStatus = leveltestStatusFor(trackInfo.track);

      if (appId != null) {
        await env.DB.prepare(`UPDATE leveltest_applications SET ai_score = ?, final_level = ?, updated_at = ? WHERE id = ?`).bind(ai_score, level, now, appId).run();
        /* ⬆️ «ai_done → pending» 으로 되돌리는 한 방향만 둔다.
           [왜] 윗줄의 UPDATE 는 상태를 안 건드리므로, AI 전용이다가 화상수업을
                시작한 학생의 진단 건은 다시 진단해도 «ai_done» 에 굳어 선생님 목록에
                영영 안 뜬다(조용히 사라지는 방향).
           ⛔ 반대 방향(pending → ai_done)은 안 한다 — 이 판정은 «추측» 이라,
              선생님이 보려던 건을 예약이 잠시 0건이라는 이유로 뺀다.
           ⚠️ WHERE 에 status 를 걸어 «ai_done 인 행» 만 건드린다 — 사람이 이미
              done·confirmed 로 바꿔 둔 것을 되돌리면 안 된다. */
        if (appStatus === 'pending') {
          try {
            await env.DB.prepare(`UPDATE leveltest_applications SET status = 'pending', updated_at = ? WHERE id = ? AND status = 'ai_done'`).bind(now, appId).run();
          } catch (e: any) { console.warn('[leveltest] status promote skip:', e && e.message); }
        }
      } else {
        const ins = await env.DB.prepare(
          `INSERT INTO leveltest_applications (student_name, student_uid, status, ai_score, final_level, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'ai-diagnosis', ?, ?)`
        ).bind(name || (uid ? String(uid) : 'AI 진단'), uid, appStatus, ai_score, level, now, now).run();
        appId = ins.meta.last_row_id as number;
      }
      /* 🎯 (2026-09-02) 채점 결과를 «학생 명부» 에도 적는다 — 1단계 배선.
         [왜] 이 결과는 지금까지 leveltest_applications 에만 남고 students_erp.level 로
              흘러가지 않았다. 그런데 웜업·복습퀴즈·판단력이 읽는 칸은 그쪽이라,
              레벨테스트를 봐도 AI 학습도구는 그 학생 수준을 영영 몰랐다
              (2026-09-02 D1 실측: 학생 29,462명 중 level 채워진 사람 0명).
         [🔒 본문 uid 를 믿지 않는다] 이 경로는 무인증 공개다. 본문의 student_uid 를
              그대로 쓰면 아무나 남의 학생 레벨을 바꿀 수 있다(CLAUDE.md 「인증 없는 API 가
              본문에 적힌 «누구에게» 를 그대로 쓴다」). 그래서 **토큰으로 확인된 uid 로만**
              적는다. 화면(level-test-ai.html)은 이미 token 을 함께 보내고 있다.
              ⛔ authedUid 가 없을 때 uid 로 폴백하지 말 것 — 폴백하면 구멍이 그대로 남는다.
         ⚠️ 이미 레벨이 있으면 덮어쓰지 않는다(사람 손이 이긴다). 정본: student-placement.ts
         ⚠️ 실패해도 채점 결과는 그대로 돌려준다 — 학생이 시험을 다 보고 결과를 못 받으면 안 된다. */
      let placement: any = null;
      try {
        if (authedUid) placement = await applyPlacementLevel(env as any, authedUid, level);
      } catch (e: any) { console.warn('[leveltest] placement skip:', e && e.message); }
      /* 🎯 (2026-09-22) 학생 화면이 «다음 단계» 를 사실대로 말하려면 유형을 알아야 한다.
         [왜] 결과 화면이 모든 학생에게 「선생님 1:1 평가 후 최종 레벨이 문자로 안내됩니다」
              라고 말하는데, AI 학습만 하는 학생에게는 그 단계가 없다 — 오지 않을 문자를
              기다리게 하는 거짓말이다(2026-09-21 에 상태만 갈랐고 학생 화면은 그대로였다).
         ⛔ live_count 는 싣지 않는다 — 화면이 쓸 일이 없고, 그 학생의 예약 수까지 알릴 이유가 없다.
         ⚠️ authedUid 를 못 구하면 track='unknown' 이라 화면은 «예전 문구» 그대로다. */
      /* 📘 (2026-09-22 사장님 지시) 틀린 문항의 «정답 + 해설» 을 함께 돌려준다.
         [왜] 지금까지 이 화면은 점수·레벨·밴드 막대만 주고 «무엇을 왜 틀렸는지» 는 한 줄도
              말하지 않았다 — 진단만 있고 배움이 없었다.
         [🔒 정답이 새는 창] 이 경로는 무인증 공개다. 그래서 정본이 ①학생이 실제로 고른 문항만
              ②보기 범위 안의 정수일 때만 ③틀린 것만 싣는다 — 「답을 안 내고 호출해 24문항
              정답을 통째로 받는」 길을 막는다. 셋 중 하나라도 풀면 그 창이 넓어진다.
              ⛔ 여기서 bank 를 통째로 넘기지 말고 반드시 그 함수를 지나게 할 것.
         ⚠️ 실패해도 채점 결과는 그대로 돌려준다 — 해설을 못 만들었다고 점수까지 잃으면 안 된다. */
      /* 🔒 (2026-10-18 사장님 결정) 정답·해설은 «토큰으로 확인된 로그인 학생» 에게만 싣는다.
         [왜] 이 경로는 무인증 공개라 «전부 0번» 본문 한 번으로 정답키가 100% 복원됐다(위 주석 · 2026-09-22 실측).
         비로그인은 점수·레벨만 받고 review 칸이 아예 없다 → 화면은 «로그인하면 해설» 안내만 그린다.
         ⚠️ 막힌 것은 «익명 1회 호출» 뿐이다 — 아이디만 알면 로그인되는 계정이 대부분이라 완전한 차단은 아니다
            (근본 해결은 문항은행을 늘리는 것). ⛔ 본문 uid 로 폴백하지 말 것(위 placement 와 같은 이유). */
      const reviewLocked = !authedUid;
      let review: any[] | undefined = undefined;
      if (!reviewLocked) {
        try { review = buildLeveltestReview(CEFR_BANK, answers); }
        catch (e: any) { console.warn('[leveltest] review skip:', e && e.message); review = []; }
      }
      return json({ ok: true, ai_score, level, correct: correctCount, total: CEFR_BANK.length, breakdown, review, review_locked: reviewLocked, application_id: appId, placement, track: trackInfo.track });
    }
  return null;
}
