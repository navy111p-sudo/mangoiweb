/** enrollments: extracted administrator domain routes. Caller authentication and route order are preserved. */
import type { MangoEnv } from './api-mango';
import { json, parseJsonBody, invalidBody } from './api-util';
import { forbiddenTeacherBody } from './forbidden-teacher';
import { ALLOWED_CLASS_MINUTES } from './class-policy';
import { computeMonthlyFee, weeklyCountFromDays } from './enroll-fee';
import { priceForUid, enrollAdminHqOnly } from './enroll-ops';
import { writeClassAudit } from './class-audit';
import { pickClassesToEnd, pickClassesToRestore, parseSavedIds } from './enroll-cancel-cascade';
import { getAdminActor, isOrgScopedRole } from './auth-admin';
import { groupDirectClasses } from './enroll-direct';
import { mergeDirectRows, UNMERGED_DIRECT_SQL } from './enroll-direct-merge';
import { handleEnrollActivateApi } from './enroll-activate';
import { setOverridePhones, loadOverridePhones } from './student-override';
let _enrSchemaReady = false;
export async function handleAdminEnrollmentsApi(request: Request, url: URL, env: MangoEnv): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;


    // ─── 수강신청 ─────────────────────────────────────────────────────────
    // 📚 확정 파이프라인 (.../:id/plan · .../:id/activate) — 아래 단순 CRUD 보다 먼저 잡는다
    //   ⚠️ 경로가 맞을 때만 actor 를 조회한다 — 여기는 관리자 API 가 전부 지나가는 길목이라
    //      무조건 getAdminActor() 를 부르면 호출마다 DB 왕복이 한 번씩 더 붙는다.
    if (/^\/api\/admin\/enrollments\/\d+\/(plan|activate)$/.test(path)) {
      const _actor = await getAdminActor(request, env).catch(() => null);
      const _act = await handleEnrollActivateApi(request, url, env, (_actor && _actor.username) || 'admin');
      if (_act) return _act;
    }
    /* 🔀 PUT {action:'merge_direct', dry} — 아직 신청서가 없는 «직접 배정» 수업을 신청서로 합친다
       (2026-09-30 사장님 — 배정 경로가 어떠하든 같은 조건과 버튼). 새 수업은 등록할 때 자동으로 이어지고,
       이것은 그 전에 만든 수업을 한 번 잇는 버튼이다.
       ⛔ 본사만(삭제와 같은 게이트 — canEditOrg 는 강사를 못 막는다). 모르는 action 은 거절한다.
       ⚠️ dry 가 기본이다 — 화면이 건수를 보여 주고 사람이 확인한 뒤 dry:false 로 다시 부른다. */
    if (method === 'PUT' && path === '/api/admin/enrollments') {
      /* 정본 게이트 — 강사 거절 + admin_scope 재조회 + 모르면 막기(getAdminActor 는 조회 실패를 staff 로 삼킨다) */
      const denyMerge = await enrollAdminHqOnly(request, env);
      if (denyMerge) return denyMerge;
      const b: any = await parseJsonBody(request).catch(() => null);
      if (!b || b.action !== 'merge_direct') return json({ ok: false, error: 'unknown_action', allowed: ['merge_direct'] }, 400);
      const dry = b.dry !== false;
      /* 목록 GET 이 스키마를 보강하지만, 이 경로가 먼저 불려도 쓰는 칸이 있게(멱등 — 이미 있으면 실패를 삼킨다) */
      if (!dry) for (const [c, t] of [['days_of_week', 'TEXT'], ['time', 'TEXT'], ['type', 'TEXT'], ['teacher_name', 'TEXT'], ['end_date', 'TEXT'], ['duration_min', 'INTEGER']]) {
        try { await env.DB.exec(`ALTER TABLE enrollments ADD COLUMN ${c} ${t}`); } catch {}
      }
      const rs: any = await env.DB.prepare(UNMERGED_DIRECT_SQL).all();
      const res = await mergeDirectRows(env, rs?.results || [], dry);
      return json({ ok: res.failed.length === 0, dry, ...res });
    }
    if ((method === 'GET' || method === 'POST') && path === '/api/admin/enrollments') {
      /* ⚡ (2026-09-29 사장님 «수강신청 목록 로딩이 느리다») 스키마 보강(CREATE + ALTER 13번)은
         워커 인스턴스당 «한 번만». 예전엔 목록을 열 때마다 DB 왕복 14번을 먼저 했다(ALTER 는
         이미 있는 칸이라 매번 실패하는 왕복). 실패는 삼키는 멱등 호출이라 플래그를 세워도 안전하다. */
      if (!_enrSchemaReady) {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS enrollments (id INTEGER PRIMARY KEY AUTOINCREMENT, student_user_id TEXT, student_name TEXT NOT NULL, package TEXT, started_at INTEGER, ended_at INTEGER, monthly_fee_krw INTEGER, status TEXT DEFAULT 'pending', notes TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
        // 🥭 Phase 37b — 누락 컬럼 자동 보강 (Phase 36 seed 가 사용하는 컬럼들)
        const _addEnrCol2 = async (col: string, type: string) => {
          try { await env.DB.exec(`ALTER TABLE enrollments ADD COLUMN ${col} ${type}`); } catch {}
        };
        await _addEnrCol2('days_of_week', 'TEXT');
        await _addEnrCol2('time', 'TEXT');
        await _addEnrCol2('class_size', 'TEXT');
        await _addEnrCol2('type', 'TEXT');
        await _addEnrCol2('teacher_name', 'TEXT');
        await _addEnrCol2('end_date', 'TEXT');
        // 🧑‍🏫 (2026-08-12) 등록 화면에서 «강사 이름 지정» 칸을 없애는 대신 남기는 값.
        //   'schedule' = 요일·시간 우선 / 'teacher' = 강사 적합도 우선. 「▸ 처리」 단계가 읽는다.
        await _addEnrCol2('assign_priority', 'TEXT');
        // 🗓️ (2026-08-14) ⑥ 수업 기간(회차) — '1' | '3' | '6' | '12' | 'unlimited'.
        //   숫자 개월이면 클라이언트가 시작일 + N개월을 end_date/ended_at 으로 같이 보내 온다.
        //   TEXT 인 이유: 'unlimited' 를 0·NULL 로 눌러 두면 «안 고른 것» 과 구분이 안 된다.
        await _addEnrCol2('duration_months', 'TEXT');
        // ⏱ (2026-08-26 사장님 지시) 수업 시간(분) — 20/30/40 중 선택, 안 고르면 기본 20분.
        //   enroll-activate.ts 의 buildEnrollPlan() 이 이 컬럼을 읽어 class_schedules.duration_min 을 정한다.
        await _addEnrCol2('duration_min', 'INTEGER');
        // 💰 (2026-08-26 사장님 지시) 곱하기 «전» 20분 기준가. `monthly_fee_krw` 는 «이미 곱해진 최종값» 이라
        //   되돌아볼 근거가 사라진다 — 그래서 기준가를 따로 남긴다(감사·재계산용).
        await _addEnrCol2('base_fee_krw', 'INTEGER');
        // 그 기준가를 «사람이 적었는지 · 대리점 단가로 자동으로 세웠는지». 후자는 아무도 치지 않은
        //   금액이라 확정 화면이 그렇게 말해 줘야 한다 — 추측하지 않도록 저장해 둔다.
        await _addEnrCol2('fee_source', 'TEXT');
        /* 📞 (2026-09-10 사장님 지시) 학부모 연락처 — 수업 전 안내문자가 «받는 사람» 이다.
           [왜 이 칸이 생겼나] 리마인더 cron 은 살아 있는데(7일간 671건 감지) 발송이 0건이었다.
             `students_erp` 의 번호 칸 네 개가 29,485행 전부 비어 있고, 카페24 원본에 번호가 없다
             (2026-09-16 재실측: 29,512행 중 번호가 든 행 4행 — 전부 우리 화면이 넣은 것이다).
           ⚠️ 여기 저장하는 것은 «이 신청서가 무슨 번호로 등록됐나» 라는 기록이다.
              **실제로 문자가 읽는 곳은 `student_erp_override`** 다 — 아래 INSERT 뒤에서 함께 적는다.
              그 표에 두는 이유: 카페24가 정본이라 그쪽이 번호를 주기 시작하면 `students_erp` 값은 덮인다.
              (2026-09-15 수리로 «빈 값으로 매일 밤 덮는» 것은 멈췄지만, «카페24 값이 이긴다» 는 그대로다.) */
        await _addEnrCol2('parent_phone', 'TEXT');
        _enrSchemaReady = true;
      }
      if (method === 'GET') {
        // 🥭 Phase 37b — user_id 필터 추가 (학생별 스케줄 fetch)
        const statusF = url.searchParams.get('status');
        const userIdF = url.searchParams.get('user_id');
        const lim = Math.max(1, Math.min(500, parseInt(url.searchParams.get('limit') || '100', 10)));
        const where: string[] = []; const binds: any[] = [];
        if (statusF) { where.push('status = ?'); binds.push(statusF); }
        if (userIdF) { where.push('student_user_id = ?'); binds.push(userIdF); }
        const sql = `SELECT * FROM enrollments${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT ?`;
        binds.push(lim);
        try {
          const rs = await env.DB.prepare(sql).bind(...binds).all<any>();
          const items = rs.results || [];
          /* 📞 (2026-09-10) 목록이 «지금 문자가 갈 번호» 를 사실대로 말한다.
             ⚠️ `enrollments.parent_phone` 은 «등록할 때 적은 값» 이지 «지금 발송이 읽는 값» 이 아니다.
                실제로 읽는 곳은 `student_erp_override` 하나이므로 그것을 실어 보낸다 —
                두 값이 갈렸을 때 화면이 옛 값을 보여 주면 「넣었는데 왜 안 가지」가 된다.
             ⚠️ IN 목록은 손으로 자르지 않는다(D1 바인드 100개 한도 — 공용 헬퍼가 센다).
             ⚠️ 실패해도 목록은 그대로 내려간다(번호 칸만 «모름» 이 된다). */
          /* 👤 역할은 한 번만 묻는다(번호 칸·직접 배정 줄이 같이 쓴다). 못 물어보면 둘 다 «안 싣는» 쪽. */
          let _enActor: any = null;
          try { _enActor = await getAdminActor(request, env as any); }
          catch (e: any) { console.warn('[enrollments] 역할 확인 실패 — 번호·직접배정 안 실음:', e?.message); }
          try {
            /* ⛔ **강사에게는 번호를 안 내려준다.** 이 경로는 `TEACHER_BLOCKED_PREFIXES` 에 없어
               강사도 통과하는데, 번호를 실으면 «남의 집 학부모 연락처가 한 화면에 모입니다»
               (규칙서가 `/api/admin/teacher-contacts` 를 막은 것과 같은 이유).
               ⚠️ 못 물어보면(조회 실패) **안 내려주는 쪽**으로 실패한다 — 번호 칸이 비는 것보다
                  모르는 사람에게 새는 쪽이 나쁘다. 화면은 그때 「문자 안 감」으로 보이는데,
                  그건 목록에서 고칠 수 없다는 뜻이라 본사 계정으로 다시 열면 제대로 보인다. */
            const a = _enActor;
            let maySeePhones = false;   // 모르면(역할 조회 실패 = a 가 null) 안 싣는 쪽
            if (a && a.ok !== false && !a.isTeacher) maySeePhones = true;
            const uids = maySeePhones ? items.map((r: any) => String(r.student_user_id || '')).filter(Boolean) : [];
            if (uids.length) {
              const pm = await loadOverridePhones(env as any, uids);
              for (const it of items) {
                const p = pm.get(String(it.student_user_id || ''));
                /* ⚠️ 학생 번호로 폴백하지 않는다 — 화면 라벨이 「학부모 연락처」인데 학생 번호가
                   그 자리에 뜨면, 거기서 고칠 때 출처가 섞인다(학생 번호가 parent 로 저장된다). */
                (it as any).notify_phone = p?.parent || '';
              }
            }
          } catch (e: any) { console.warn('[enrollments] 번호 조회 실패:', e?.message); }
          /* 📅 (2026-09-29 사장님 «주간 스케줄에서 배정한 수업이 수강신청 목록에 안 나온다»)
             주간 스케줄·학생 상세의 «수업 등록» 은 class_schedules(source='admin_ui') 에만 쓰고
             enrollments 에는 한 줄도 안 남긴다 — 그래서 이 목록에 원리상 안 떴다.
             그 수업을 «직접 배정» 묶음으로 따로 실어 보낸다(화면이 신청서와 섞지 않고 그린다).
             ⛔ enrollments 에 행을 만들어 «맞추지» 않는다 — 결제·확정 파이프라인이 그 행을 신청서로 읽는다.
             ⛔ 본사만: 지사·대리점·강사에게는 안 싣는다(이 조회는 스코프로 자르지 않는다).
             ⚠️ 상태 필터·학생 필터가 걸린 요청에는 안 싣는다(그 필터는 신청서의 상태다).
             ⚠️ 지난 날짜(30일 전보다 이전)의 일회성 수업은 뺀다 — 목록이 끝없이 길어진다. 실패하면 목록은 그대로. */
          let direct: any[] | undefined;
          if (!statusF && !userIdF && _enActor && _enActor.ok !== false && !_enActor.isTeacher && !isOrgScopedRole(_enActor.role)) {
            try {
              /* 조건 정본은 enroll-direct-merge.ts 의 UNMERGED_DIRECT_SQL — «합치기» 가 잇는 것과 같은 행이어야
                 버튼이 말한 건수와 실제로 합친 건수가 같다. */
              const ds = await env.DB.prepare(UNMERGED_DIRECT_SQL).all<any>();
              direct = groupDirectClasses(ds.results || []);
            } catch (e: any) { console.warn('[enrollments] 직접 배정 조회 실패:', e?.message); }
          }
          return json({ ok: true, items, ...(direct ? { direct } : {}) });
        } catch (e: any) {
          return json({ ok: true, items: [], warning: String(e?.message || e) });
        }
      }
      const b = await parseJsonBody(request);
      if (!b || !b.student_name || !b.package) return invalidBody(['student_name', 'package']);
      const now = Date.now();
      // 🥭 2026-08-08 — 요일·시간·인원방식·수업유형·강사를 여기서 «버리고» 있었다.
      //   등록 폼(Phase 24 다중 등록표)과 파일/카톡 import 는 이 값들을 다 받아 CSV 로
      //   내보내기까지 했는데, INSERT 목록에 없어서 DB 에는 한 번도 들어간 적이 없다.
      //   그래서 목록 표가 «패키지» 말고는 보여줄 것이 없었다. (컬럼은 위에서 이미 보강함)
      const _prio = b.assign_priority === 'teacher' ? 'teacher' : 'schedule';
      // 🗓️ (2026-08-14) ⑥ 수업 기간 — 화면이 보내는 값만 받는다. 모르는 값은 저장하지 않는다
      //   (오타·옛 폼이 보낸 쓰레기가 그대로 남으면 나중에 회차 계산이 조용히 틀어진다).
      //   🗓️ (2026-08-20 사장님 지시) 1·3·6·12 «수강권 단위» 만 받던 것을 **1~12** 로 넓혔다.
      //     2개월·4개월·5개월짜리를 넣을 방법이 아예 없었고, 화면에서 골라도 여기서 걸려
      //     **에러 없이 null** 이 되므로 「분명 골랐는데 기간이 비어 있다」가 된다.
      //   ⚠️ 화면 목록(`adm-core.js` 의 `durOptionsList`)과 **짝**이다. 한쪽만 넓히면 그 조용한 null 이 그대로 재현된다.
      const _durRaw = b.duration_months == null ? '' : String(b.duration_months).trim();
      const _dur = (_durRaw === 'unlimited' || /^([1-9]|1[0-2])$/.test(_durRaw)) ? _durRaw : null;
      // ⏱ (2026-08-26 사장님 지시) 수업 시간(분) — 화면 목록(adm-core.js 의 classMinOptionsList)과 짝.
      //   모르는 값은 저장하지 않는다(null) — enroll-activate.ts 의 buildEnrollPlan() 이 null 이면
      //   기본 20분(DEFAULT_CLASS_MINUTES)으로 읽으므로 «안 고름» 과 «모르는 값» 이 같은 결과가 된다.
      const _classMin = ALLOWED_CLASS_MINUTES.includes(Number(b.duration_min)) ? Number(b.duration_min) : null;
      /* 💰 (2026-08-26 사장님 지시) 월 수강료 = 20분 기준가 × 길이배수 (10원 절사).
         ⛔ **여기가 곱하는 유일한 자리다.** 저장 뒤 `monthly_fee_krw` 는 이미 곱해진 최종값이라
            확정 단계·정기결제 예약·CSV·워드 요약 어디서도 다시 곱하지 않는다.
         ⚠️ 기준가가 없으면 대리점 단가(`priceForUid`) × 주 횟수로 세운다. 그것도 못 구하면
            **지어내지 않고 null** — 확정 단계가 예전 그대로 「월 수강료가 0원입니다」 로 멈춘다.
         ⚠️ 단가 조회는 try/catch 로 감싼다: 요금을 못 구한다고 등록 자체가 막히면 안 된다. */
      let _w1 = 0;
      if (!(Number(b.monthly_fee_krw) > 0) && b.student_user_id) {
        try { _w1 = Number((await priceForUid(env, String(b.student_user_id)))?.weekly1Price) || 0; }
        catch (e: any) { console.warn('[enroll fee] 대리점 단가 조회 실패:', e?.message || e); }
      }
      const _fee = computeMonthlyFee({
        baseFeeKrw: b.monthly_fee_krw,
        minutes: _classMin,
        weekly1Price: _w1,
        weekly: weeklyCountFromDays(b.days_of_week),
      });
      /* 📞 학부모 연락처 — 숫자만 남기고 9자리 미만은 «없는 것» 으로 본다(정본과 같은 규칙).
         ⚠️ 필수로 만들지 않는다. 지금 등록되는 학생 중에는 번호를 모르는 경우가 실제로 있고,
            여기서 막으면 «번호 때문에 등록이 안 되는» 새 사고가 된다. 안 넣으면 예전 그대로다. */
      const _pPhone = String(b.parent_phone ?? '').replace(/[^0-9]/g, '');
      const _parentPhone = _pPhone.length >= 9 ? _pPhone : '';
      const r = await env.DB.prepare(
        `INSERT INTO enrollments (student_user_id, student_name, package, started_at, ended_at, monthly_fee_krw, status, notes, created_at, updated_at, days_of_week, time, class_size, type, teacher_name, end_date, assign_priority, duration_months, duration_min, base_fee_krw, fee_source, parent_phone) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        b.student_user_id || null, b.student_name, b.package,
        b.started_at ? Number(b.started_at) : now,
        b.ended_at ? Number(b.ended_at) : null,
        _fee.monthlyFeeKrw,
        b.status || 'pending', b.notes || null, now, now,
        b.days_of_week || null, b.time || null, b.class_size || null,
        b.type || null, b.teacher_name || null, b.end_date || null,
        _prio, _dur, _classMin, _fee.baseFeeKrw, _fee.source, _parentPhone || null
      ).run();
      /* 📞 문자가 실제로 읽는 자리에 함께 적는다 — `student_erp_override`(동기화가 못 덮는 표).
         ⚠️ **결과를 응답에 실어 화면이 말하게 한다.** 조용히 실패하면 사장님은 번호를 넣었다고
            믿는데 수업 전 문자는 계속 안 나가고, 아무도 이유를 모른다(규칙서 2장
            「보냈습니다라고 하는데 아무 데도 안 갔음」과 같은 뿌리).
         ⚠️ 여기서 throw 하면 등록 자체가 실패한다 — 번호는 나중에 채울 수 있지만 등록은 그렇지 않다.
            그래서 감싸되 «안 됐다» 는 사실은 반드시 돌려준다. */
      let _phoneSaved: any = null;
      if (_parentPhone && b.student_user_id) {
        try {
          const sv = await setOverridePhones(env as any, String(b.student_user_id), { parent: _parentPhone }, 'enroll');
          _phoneSaved = { ok: sv.ok, reason: sv.reason };
        } catch (e: any) {
          _phoneSaved = { ok: false, reason: String(e?.message || e).slice(0, 120) };
        }
      } else if (_parentPhone && !b.student_user_id) {
        // 아이디가 없으면 «누구의 번호인지» 를 모른다 — 신청서에만 남기고 문자 쪽에는 안 붙인다.
        _phoneSaved = { ok: false, reason: 'no_student_uid' };
      }
      // 화면이 «얼마로 잡혔는지» 를 그 자리에서 보여 줄 수 있게 계산 결과를 함께 돌려준다
      return json({ ok: true, id: r.meta.last_row_id, fee: _fee, phone_saved: _phoneSaved });
    }

    // 수강신청 상태 변경 (pending → confirmed → cancelled 등)
    if (method === 'PATCH' && /^\/api\/admin\/enrollments\/\d+$/.test(path)) {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS enrollments (id INTEGER PRIMARY KEY AUTOINCREMENT, student_user_id TEXT, student_name TEXT NOT NULL, package TEXT, started_at INTEGER, ended_at INTEGER, monthly_fee_krw INTEGER, status TEXT DEFAULT 'pending', notes TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
      const m = path.match(/^\/api\/admin\/enrollments\/(\d+)$/);
      const id = m ? parseInt(m[1], 10) : 0;
      const b = await parseJsonBody(request);
      /* 📞 (2026-09-10) 연락처만 고치러 오는 요청도 받는다 — **이미 등록된** 학생에게
         번호를 넣을 자리가 여기밖에 없다(등록 화면의 칸은 «앞으로 등록되는» 학생용이라,
         이것이 없으면 지금 수업 중인 학생에게는 안내문자를 영영 못 보낸다).
         ⚠️ 그래서 status 를 «선택» 으로 바꾼다. 단 **둘 다 없으면** 예전처럼 400 이다 —
            아무것도 안 보내는 요청을 200 으로 답하면 「저장됐다」는 거짓말이 된다. */
      const _pRaw = b && b.parent_phone !== undefined ? String(b.parent_phone ?? '').replace(/[^0-9]/g, '') : null;
      const _wantPhone = _pRaw !== null;
      if (!b || (!b.status && !_wantPhone)) return invalidBody(['status']);
      let _stRes: any = {};
      let _phoneSaved: any = null;
      if (b.status) {
        const allowed = new Set(['pending', 'confirmed', 'active', 'cancelled', 'expired']);
        if (!allowed.has(b.status)) return json({ ok: false, error: 'invalid_status', allowed: Array.from(allowed) }, 400);
        /* ✕ (2026-10-08 사장님 지시) «취소» 하면 그 신청이 만든 수업도 함께 종료한다.
           되돌리면(취소 → 다른 상태) 이번 취소가 내린 수업 중 아직 안 지난 것만 되살린다.
           규칙 정본은 src/enroll-cancel-cascade.ts — 여기서 다시 판정하지 않는다. */
        try { await env.DB.exec(`ALTER TABLE enrollments ADD COLUMN cancelled_class_ids TEXT`); } catch { /* 이미 있음 */ }
        let prevRow: any = await env.DB.prepare(`SELECT status, student_name, cancelled_class_ids FROM enrollments WHERE id = ?`).bind(id).first().catch(() => null);
        // 칸이 아직 없는 DB(ALTER 실패)에서 «없는 신청» 으로 오판하지 않게 한 번 더 — 되살리기 목록만 비게 된다
        if (!prevRow) prevRow = await env.DB.prepare(`SELECT status, student_name FROM enrollments WHERE id = ?`).bind(id).first().catch(() => null);
        if (!prevRow) return json({ ok: false, error: 'not_found' }, 404);
        const prevStatus = String(prevRow.status || '');
        const src = 'adm-enroll:' + id;
        const now = Date.now();
        /* ⛔ 취소(=수업 종료)·되살리기(=수업 다시 열기)는 둘 다 수업 행을 바꾼다 — 수업은 곧 급여라
           본사 전용. 판정은 정본 enrollAdminHqOnly(스코프를 다시 읽고 못 읽으면 막음) — 여기서 복제하지 않는다.
           이 경로는 TEACHER_BLOCKED_PREFIXES 에 없어 핸들러가 직접 막아야 한다. */
        const _touchesClasses = (b.status === 'cancelled') !== (prevStatus === 'cancelled');
        let _cActor: any = null;
        if (_touchesClasses) {
          const deny = await enrollAdminHqOnly(request, env);
          if (deny) return deny;
          try { _cActor = await getAdminActor(request, env as any); } catch {}
        }
        const _actorName = (_cActor && (_cActor.name || _cActor.username)) || '관리자';
        if (b.status === 'cancelled' && prevStatus !== 'cancelled') {
          /* ⚠️ 수업 목록을 못 읽으면 신청 상태도 안 바꾼다 — «취소됐는데 수업은 살아 있는» 상태를 만들지 않는다. */
          let rows: any[];
          try {
            const rs = await env.DB.prepare(`SELECT id, scheduled_date, start_time, status FROM class_schedules WHERE source = ? AND status = 'active'`).bind(src).all();
            rows = (rs.results || []) as any[];
          } catch (e: any) {
            return json({ ok: false, error: 'schedule_lookup_failed', detail: String(e?.message || e) }, 503);
          }
          const plan = pickClassesToEnd(rows, now);
          /* 수업 UPDATE 한 문장(json_each — 바인드 1개, 건수 무관) + 신청 UPDATE 를 한 batch 로: 둘 다 되거나 둘 다 안 된다. */
          const _ids = JSON.stringify(plan.end);
          try {
            await env.DB.batch([
              env.DB.prepare(`UPDATE class_schedules SET status='cancelled', updated_at=? WHERE source = ? AND status = 'active' AND id IN (SELECT value FROM json_each(?))`).bind(now, src, _ids),
              env.DB.prepare(`UPDATE enrollments SET status = ?, cancelled_class_ids = ?, updated_at = ? WHERE id = ?`).bind('cancelled', _ids, now, id),
            ]);
          } catch (e: any) {
            return json({ ok: false, error: 'cancel_failed', message: '취소하지 못했습니다(수업·신청 모두 그대로입니다). 잠시 뒤 다시 눌러 주세요.', message_en: 'Could not cancel (classes and enrollment unchanged). Please try again.', detail: String(e?.message || e) }, 503);
          }
          if (plan.end.length) {
            try {
              await writeClassAudit(env, {
                action: 'remove', student_name: prevRow.student_name || null,
                actor: _actorName, actor_role: 'admin', source: 'enrollment',
                reason: '수강신청 취소 → 남은 수업 종료',
                detail: JSON.stringify({ enrollment_id: id, ended: plan.end, past_kept: plan.past }),
              });
            } catch {}
          }
          _stRes = { ended_classes: plan.end.length, weekly_left: plan.weekly, past_kept: plan.past };
        } else {
        await env.DB.prepare(`UPDATE enrollments SET status = ?, updated_at = ? WHERE id = ?`).bind(b.status, now, id).run();
        }
        if (prevStatus === 'cancelled' && b.status !== 'cancelled') {
          /* ↩ 취소를 되돌림 — 이번 취소가 내린 수업만, 아직 안 지난 날짜 지정 수업만 되살린다.
             같은 학생·같은 시각(또는 같은 강사·같은 시각)에 이미 살아 있는 수업이 있으면 건너뛴다(두 벌 방지, 못 물어보면 건너뜀). */
          const saved = parseSavedIds(prevRow.cancelled_class_ids);
          let restored = 0, skipped = 0, restoreFailed = false;
          if (saved.length) {
            try {
              const rs = await env.DB.prepare(`SELECT id, user_id, teacher_id, scheduled_date, start_time, status FROM class_schedules WHERE source = ?`).bind(src).all();
              const rows = (rs.results || []) as any[];
              const pick = pickClassesToRestore(rows, saved, now);
              skipped = pick.skipped;
              for (const sid of pick.restore) {
                const row = rows.find((r) => Number(r.id) === sid);
                let dup: any = 'unknown';
                try {
                  dup = await env.DB.prepare(
                    `SELECT id FROM class_schedules WHERE id <> ? AND scheduled_date = ? AND substr(start_time,1,5) = substr(?,1,5) AND status != 'cancelled'
                       AND (user_id = ? OR (? <> '' AND teacher_id = ? AND LOWER(COALESCE(user_id,'')) NOT IN ('lms','type_seed'))) LIMIT 1`
                  ).bind(sid, String(row.scheduled_date || '').slice(0, 10), String(row.start_time || ''), row.user_id, String(row.teacher_id || ''), String(row.teacher_id || '')).first();
                } catch {}
                if (dup) { skipped++; continue; }
                const upd: any = await env.DB.prepare(`UPDATE class_schedules SET status='active', updated_at=? WHERE id=? AND status='cancelled'`).bind(now, sid).run();
                if (upd && upd.meta && upd.meta.changes > 0) restored++; else skipped++;
              }
              await env.DB.prepare(`UPDATE enrollments SET cancelled_class_ids = NULL WHERE id = ?`).bind(id).run();
              if (restored) {
                try {
                  await writeClassAudit(env, {
                    action: 'restore', student_name: prevRow.student_name || null,
                    actor: _actorName, actor_role: 'admin', source: 'enrollment',
                    reason: '수강신청 취소 되돌리기 → 수업 되살림',
                    detail: JSON.stringify({ enrollment_id: id, restored, skipped }),
                  });
                } catch {}
              }
            } catch (e: any) {
              console.warn('[enrollments] 취소 되돌리기 중 수업 복구 실패:', e?.message || e);
              restoreFailed = true;
            }
          }
          _stRes = restoreFailed ? { restore_failed: true, restored_classes: restored } : { restored_classes: restored, restore_skipped: skipped };
        }
      }
      if (_wantPhone) {
        /* ⛔ **강사는 남의 «발송 번호» 를 바꿀 수 없다.** 이 경로는 `TEACHER_BLOCKED_PREFIXES` 에
           없어 강사도 닿는데, 여기서 바꾼 번호로 **실제 문자가 나갑니다**(돈이 나가고 우리 이름으로).
           ⚠️ 못 물어보면 **막는 쪽**으로 실패한다 — 되돌리기 어려운 «바깥으로 나가는» 값이라
              모르면 안 바꾸는 것이 맞다(조회 실패로 번호를 못 넣으면 본사 계정으로 다시 하면 된다).
           ⚠️ status 변경은 위에서 이미 처리했다 — 그쪽 권한은 이 변경의 몫이 아니라 건드리지 않는다. */
        let mayEditPhone = false;
        /* ⚠️ try 안에서 const 로 두면 아래 거절 문구가 «누구로 들어와 있는지» 를 못 읽는다
           (블록 스코프). 조회가 실패하면 null 인 채로 남고, 그때는 헬퍼가 계정 줄을 빼고
           옛 문구 그대로 낸다 — 모르는 것을 지어내지 않는다. */
        let _phActor: any = null;
        try {
          const a = await getAdminActor(request, env as any);
          _phActor = a;
          mayEditPhone = !!a && a.ok !== false && !a.isTeacher;
        } catch (e: any) { console.warn('[enrollments] 역할 확인 실패 — 번호 저장 안 함:', e?.message); }
        if (!mayEditPhone) {
          return json({ ...forbiddenTeacherBody(_phActor, '연락처는 본사·관리자만 고칠 수 있습니다.'), detail: '연락처는 본사·관리자만 고칠 수 있습니다.' }, 403);
        }
        /* 빈 문자열로 보내면 «지운다» 는 뜻이다(「아직 안 받았다」와 구분). 9자리 미만은 안 받는다. */
        const clear = _pRaw === '';
        const phone = _pRaw.length >= 9 ? _pRaw : '';
        if (!clear && !phone) {
          _phoneSaved = { ok: false, reason: 'too_short' };
        } else {
          try { await env.DB.exec(`ALTER TABLE enrollments ADD COLUMN parent_phone TEXT`); } catch { /* 이미 있음 */ }
          try {
            await env.DB.prepare(`UPDATE enrollments SET parent_phone = ?, updated_at = ? WHERE id = ?`)
              .bind(phone || null, Date.now(), id).run();
          } catch (e: any) { console.warn('[enrollments] 번호 기록 실패:', e?.message); }
          /* ⚠️ 발송이 실제로 읽는 곳은 override 다 — 신청서에만 적으면 문자는 그대로 안 나간다.
             누구의 번호인지 알아야 하므로 학생 계정을 신청서에서 다시 읽는다. */
          const row: any = await env.DB.prepare(`SELECT student_user_id FROM enrollments WHERE id = ?`).bind(id).first().catch(() => null);
          const uid = String(row?.student_user_id || '').trim();
          if (!uid) _phoneSaved = { ok: false, reason: 'no_student_uid' };
          else {
            try {
              const sv = await setOverridePhones(env as any, uid, clear ? { clear: true, parent: '' } : { parent: phone }, 'enroll-edit');
              _phoneSaved = { ok: sv.ok, reason: sv.reason };
            } catch (e: any) { _phoneSaved = { ok: false, reason: String(e?.message || e).slice(0, 120) }; }
          }
        }
      }
      return json({ ok: true, id, status: b.status || null, phone_saved: _phoneSaved, ..._stRes });
    }

    /* 🗑️ DELETE — 수강신청 삭제 (2026-08-21, 사장님 지시: 수강신청 목록의 데모 항목 정리)
       ⛔ 본사만. `canEditOrg()`는 강사(scope 'none')까지 통과시키는 함정이 있어(CLAUDE.md
          trap) 쓰지 않는다 — 위 leveltest_applications 삭제와 같은 role==='hq'|'staff' 패턴.
       ⚠️ 되돌릴 수 없다. 확정·활성화된 신청은 enroll-activate.ts 가
          `class_schedules.source = 'adm-enroll:<id>'` 로 실제 수업을 만든다 — 신청서만
          지우면 강사·학생 달력에 담당 없는 유령 수업이 남는다. 삭제 전에 그 수업들을
          먼저 cancelled 로 정리한다(위 레벨테스트 삭제와 같은 이유). */
    if (method === 'DELETE' && (path === '/api/admin/enrollments' || /^\/api\/admin\/enrollments\/\d+$/.test(path))) {
      const actor = await getAdminActor(request, env as any);
      if (!actor.ok || actor.isTeacher || !(actor.role === 'hq' || actor.role === 'staff')) {
        return json({ ok: false, error: 'forbidden_scope', message: '수강신청 삭제는 본사만 할 수 있습니다.', message_en: 'Only HQ accounts can delete enrollments.' }, 403);
      }
      const pathId = path.match(/^\/api\/admin\/enrollments\/(\d+)$/);
      const delBody: any = await parseJsonBody(request).catch(() => null);
      const idsParam = url.searchParams.get('ids') || url.searchParams.get('id');
      let ids: number[] = [];
      if (pathId) ids = [Number(pathId[1])];
      else if (delBody && Array.isArray(delBody.ids)) ids = delBody.ids.map((x: any) => Number(x));
      else if (delBody && delBody.id != null) ids = [Number(delBody.id)];
      else if (idsParam) ids = idsParam.split(',').map((s: string) => Number(s.trim()));
      ids = Array.from(new Set(ids.filter((n) => Number.isFinite(n) && n > 0)));
      if (!ids.length) return invalidBody(['id']);
      if (ids.length > 90) return json({ ok: false, error: 'too_many', message: '한 번에 최대 90건까지 삭제할 수 있습니다.' }, 400);

      let actorName = 'admin';
      try { if (actor.name) actorName = actor.name; } catch {}
      const deleted: number[] = [];
      const notFound: number[] = [];
      for (const id of ids) {
        const row: any = await env.DB.prepare(`SELECT id, student_name FROM enrollments WHERE id = ? LIMIT 1`).bind(id).first();
        if (!row) { notFound.push(id); continue; }
        try {
          await env.DB.prepare(`UPDATE class_schedules SET status='cancelled', updated_at=? WHERE source = ? AND status != 'cancelled'`)
            .bind(Date.now(), 'adm-enroll:' + id).run();
        } catch (e: any) { console.warn('[enrollments delete] schedule cancel skipped:', e?.message || e); }
        try {
          await writeClassAudit(env, {
            action: 'delete', student_name: row.student_name || null,
            actor: actorName, actor_role: 'admin', source: 'enrollment',
            reason: '수강신청 삭제 (연결 수업 취소 처리)',
            detail: JSON.stringify({ enrollment_id: id }),
          });
        } catch {}
        await env.DB.prepare(`DELETE FROM enrollments WHERE id = ?`).bind(id).run();
        deleted.push(id);
      }
      return json({ ok: true, deleted, not_found: notFound });
    }
  return null;
}
