/** retention: extracted administrator domain routes. Caller authentication and route order are preserved. */
import type { MangoEnv } from './api-mango';
import { json, today } from './api-util';
import { recordCareContact, lastContacts, CARE_CONTACT_ACTIONS, CARE_CONTACT_STATUSES } from './care-contact';
import { selectInChunks } from './d1-chunk';
import { enrollAdminHqOnly } from './enroll-ops';
import { sendPushToUser } from './api-notify';
import { phonesForStudent } from './notify-contacts';
import { studentScopeWhere } from './scope';
import { sendPlainSms } from './solapi-client';
import { getAdminActor, isOrgScopedRole } from './auth-admin';
import { ensureAttendanceAccountUid, ATTENDANCE_ACCOUNT_KEY, ATTENDANCE_BY_UID_LIST, attUidListBinds } from './attendance-uid';

export async function handleAdminRetentionApi(request: Request, url: URL, env: MangoEnv): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;

    // ═══════════════════════════════════════════════════════════════
    // 🌟 Phase PR 끝
    // ═══════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════
    // 🚨 Phase ARR — 학생 이탈 위험 AI 감지
    // ═══════════════════════════════════════════════════════════════
    //   조건: 출석 하락, 점수 하락, 장기 결석, 평가점수 낮음
    //   AI 가 종합 → 위험도 점수 (0~100) + 사유 + 권장 액션
    if (method === 'GET' && path === '/api/admin/retention/risk') {
      try {
        // 🔧 students_erp 스키마 충돌 호환 — 컬럼 이름이 student_name / name / korean_name 중 하나일 수 있음
        //   → PRAGMA table_info 로 존재하는 컬럼 발견 후 동적 매핑
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS attendance (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT, user_id TEXT, username TEXT, role TEXT, joined_at INTEGER, left_at INTEGER, status TEXT, date TEXT);`);
        let nameCol = 'user_id';   // 안전한 폴백
        let parentPhoneCol: string | null = null;
        let parentNameCol: string | null = null;
        try {
          const cols: any = await env.DB.prepare(`PRAGMA table_info(students_erp)`).all();
          const colNames = ((cols.results || []) as any[]).map(c => c.name);
          // ⚠️ 2026-10-09: 운영 D1 은 student_name 칸이 «있지만» 29,551명 중 12명만 채워져 있고 실제 이름은
          //    korean_name(전원)에 있습니다. 한 칸만 고르면 이름이 비어 아이디로 떨어지므로, 있는 칸을 전부 COALESCE.
          const _nc = ['student_name', 'korean_name', 'name'].filter(c => colNames.includes(c));
          if (_nc.length) nameCol = 'COALESCE(' + _nc.map(c => `NULLIF(TRIM(${c}),'')`).join(', ') + ", '')";
          if (colNames.includes('parent_phone')) parentPhoneCol = 'parent_phone';
          if (colNames.includes('parent_name')) parentNameCol = 'parent_name';
        } catch {}

        const now = Date.now();
        const since14 = now - 14 * 86400000;
        const since30 = now - 30 * 86400000;
        const since60 = now - 60 * 86400000;
        const since90 = now - 90 * 86400000;

        const selectCols = [
          'user_id',
          `${nameCol} AS student_name`,
          parentPhoneCol ? 'parent_phone' : `'' AS parent_phone`,
          parentNameCol ? 'parent_name' : `'' AS parent_name`,
        ].join(', ');
        const _swRisk = await studentScopeWhere(env, request);  // 🔒 지사/대리점 격리

        // ⚡ KV 캐시(scope 별 키, 180초) — 반복 열람 시 무거운 스캔 생략. 케어 발송 등 변경 후엔 자연 만료.
        const _rrKey = 'retrisk3:' + nameCol + ':' + ((_swRisk.cond || 'all') + '|' + (_swRisk.binds || []).join(','));
        /* 📞 (2026-10-13 케어 보드 2단계) «마지막 연락» 은 캐시 «밖» 에서 붙인다 — 정본 lastContacts.
           캐시(180초) 안에 넣으면 방금 문자를 보내도 3분 동안 «연락 안 함» 으로 보여 또 보내게 된다.
           ⚠️ 원천이 하나라도 실패하면 last_contact_ok=false — 화면은 그 줄을 아예 안 그린다
              («연락 기록 없음» 으로 위장하면 또 연락하게 만든다). 목록 자체는 그대로 낸다. */
        const _rrWithContact = async (body: string, hdr: Record<string, string>) => {
          try {
            const o = JSON.parse(body);
            const list: any[] = Array.isArray(o.at_risk) ? o.at_risk : [];
            const { map: m, failed } = await lastContacts(env.DB, list.map(x => x.user_id));
            for (const x of list) { const c = m.get(String(x.user_id)); x.last_contact = c ? { at: c.at, via: c.via } : null; }
            o.last_contact_ok = failed === 0;
            return new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json', ...hdr } });
          } catch (e: any) {
            console.warn('[retention/risk] last_contact 실패:', e?.message);
            return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json', ...hdr } });
          }
        };
        try {
          const _hit = await env.SESSION_STATE.get(_rrKey);
          if (_hit) return await _rrWithContact(_hit, { 'X-Adm-Cache': 'hit' });
        } catch { /* 캐시 miss 무시 */ }

        /* 🎯 (2026-10-13 이탈 케어 보드 1단계) 누구를 볼 것인가 — «최근 90일에 수업 흔적이 있는 학생».
           🔴 그전에는 `… WHERE status 활성 LIMIT 500` 이라 명부 29,000명 중 «정렬 없이 아무» 500명만 봤습니다.
              그래서 심각+주의+관찰 합(486)이 «위험 학생 수» 가 아니라 «그 500명 거의 전원» 이었고,
              진짜 위험한 학생이 그 500명 밖이면 화면에 아예 안 나왔습니다(사장님 캡처 2026-10-13).
           ✅ 후보 = ① 최근 90일 출석·예약 기록이 있는 계정(실접속은 account_uid, 카페24 씨앗은 user_id —
              정본 ATTENDANCE_ACCOUNT_KEY) ② 카페24 이탈 스냅샷(student_retention — 만료·장기 미수강).
              90일 넘게 흔적이 없는 학생은 «이탈 위험» 이 아니라 이미 떠난 학생이라 빼고, 그 수를 응답에 적습니다.
           ✅ 상한(RISK_SCAN_MAX)을 넘으면 «가장 조용한 학생부터»(마지막 기록이 오래된 순) 보고 truncated 로 말합니다.
              ⛔ 정렬 없는 LIMIT 으로 되돌리지 마세요. */
        const RISK_SCAN_MAX = 1000;
        await ensureAttendanceAccountUid(env);
        const _lastSeen = new Map<string, number>();   // 계정 → 최근 90일 안 마지막 기록(ms). 0 = 스냅샷에만 있음
        try {
          const ar: any = await env.DB.prepare(
            `SELECT ${ATTENDANCE_ACCOUNT_KEY} AS k, MAX(joined_at) AS j FROM attendance
              WHERE joined_at >= ? AND joined_at <= ? AND COALESCE(role,'student') = 'student'
              GROUP BY k`).bind(since90, now).all();
          for (const r of (ar.results || [])) if (r.k) _lastSeen.set(String(r.k), Number(r.j) || 0);
        } catch (e: any) { console.warn('[retention/risk] 후보(출석) 조회 실패:', e?.message); }
        try {
          const sr: any = await env.DB.prepare(`SELECT user_id FROM student_retention`).all();
          for (const r of (sr.results || [])) if (r.user_id && !_lastSeen.has(String(r.user_id))) _lastSeen.set(String(r.user_id), 0);
        } catch { /* 스냅샷 표가 없는 환경 — 출석 후보만 */ }

        // ⚠️ status 값: 카페24 동기화가 영어 'active'/'inactive'로 적재. 레거시 '정상'/'활동'도 함께 인정(하위호환).
        const _activeCond = `(status IN ('정상','활동','active') OR status IS NULL OR status = '')${_swRisk.cond ? ' AND ' + _swRisk.cond : ''}`;
        let activeTotal: number | null = null;
        try {
          const ct: any = await env.DB.prepare(`SELECT COUNT(*) AS n FROM students_erp WHERE ${_activeCond}`).bind(..._swRisk.binds).first();
          activeTotal = Number(ct?.n) || 0;
        } catch { /* 표시용 — 못 세면 null */ }
        let _cands: any[] = [];
        if (_lastSeen.size) {
          const sRs: any = await env.DB.prepare(
            `SELECT ${selectCols} FROM students_erp WHERE user_id IN (SELECT value FROM json_each(?)) AND ${_activeCond}`
          ).bind(JSON.stringify([..._lastSeen.keys()]), ..._swRisk.binds).all();
          _cands = (sRs.results || []) as any[];
        }
        // 가장 조용한 학생부터(마지막 기록 오래된 순 · 스냅샷에만 있는 학생이 맨 앞) — 동점은 아이디로 고정
        _cands.sort((a, b) => ((_lastSeen.get(a.user_id) || 0) - (_lastSeen.get(b.user_id) || 0)) || String(a.user_id).localeCompare(String(b.user_id)));
        const students = _cands.slice(0, RISK_SCAN_MAX);
        const scanMeta = {
          active_total: activeTotal,          // 명부 활성 학생(스코프 안)
          candidates: _cands.length,          // 그중 최근 90일 흔적 또는 이탈 스냅샷에 있는 학생
          scanned: students.length,           // 실제로 점수를 매긴 학생
          truncated: _cands.length > students.length,
          window_days: 90,
        };
        if (!students.length) return json({ ok: true, count: 0, at_risk: [], scan: scanMeta, schema: { name_col: nameCol } });

        // ⚡ N+1 제거 — 학생당 반복 쿼리(≈8×N=수천건)를 그룹 쿼리 9개로 일괄 집계 후 메모리에서 점수 계산.
        //    점수 로직(S1~S10)·응답 형태는 원본과 100% 동일, 데이터 수집 방식만 변경.
        const _ids = students.map(s => s.user_id);
        const _num = (v: any) => (typeof v === 'number' ? v : Number(v) || 0);
        // ⚠️ D1 하드 한도: 쿼리당 바인드 파라미터 100개(실측: 101개부터 "too many SQL variables").
        //    IN(...) 목록이 이를 넘으면 쿼리 전체가 실패하고, 아래 try/catch 가 이를 삼켜
        //    빈 집계=모든 위험신호 0=위험학생 0명으로 조용히 오작동한다(활성 100명↑ 범위 전부).
        //    → 학생 id 를 90개씩(뒤 날짜 바인드 여유 포함) 청크로 나눠 질의 후 병합.
        //    각 user_id 는 한 청크에만 속하므로 GROUP BY / ROW_NUMBER 결과는 분할해도 동일.
        //    → 청크 분할은 공용 selectInChunks(src/d1-chunk.ts)로 일원화(2026-08-07).
        //      청크 크기는 tail 바인드 개수를 세서 정하므로 매직넘버 90이 필요 없습니다.
        const _groupMap = async (build: (ph: string) => string, tail: any[], keyCol: string, pick: (r: any) => any): Promise<Map<string, any>> => {
          const m = new Map<string, any>();
          // 테이블이 없을 수 있는 선택적 집계 → 청크 오류는 스킵(원본 try/catch 동작과 동일)
          const rows = await selectInChunks<any>(env.DB, _ids, build, { tail, swallowErrors: true });
          for (const r of rows) m.set(String(r[keyCol]), pick(r));
          return m;
        };
        // 출석 전용 — 계정 목록을 JSON 하나로 넘기므로(json_each) 청크가 필요 없습니다. 실패하면 빈 Map(예전 swallow 동작과 같음).
        const _attMap = async (sql: string, tail: any[]): Promise<Map<string, any>> => {
          const m = new Map<string, any>();
          try {
            const rs: any = await env.DB.prepare(sql).bind(...attUidListBinds(_ids), ...tail).all();
            for (const r of (rs.results || [])) if (r.k != null) m.set(String(r.k), _num(r.v));
          } catch (e: any) { console.warn('[retention/risk] 출석 집계 실패:', e?.message); }
          return m;
        };
        try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, amount INTEGER, due_at INTEGER, paid_at INTEGER, status TEXT);`); } catch {}

        const [att30M, att60M, att90M, lastJoinM, evalM, payM, hwM, ptM, _trendRows, absentStreakM] = await Promise.all([
          /* 📌 (2026-10-13) 출석 네 신호는 «계정» 으로 셉니다 — 정본 ATTENDANCE_BY_UID_LIST / ATTENDANCE_ACCOUNT_KEY.
             🔴 그전에는 `attendance.user_id IN (계정들)` 이었는데 그 칸은 실접속에선 «기기 임시번호» 라
                실제로 화상수업을 듣는 학생도 「30일 출석 0회 · 마지막 입장 수백 일 전」이 됐습니다.
             ✅ 그리고 «지금 이후» 행(카페24가 미리 만드는 예약 씨앗)은 출석이 아니므로 joined_at <= now 로 자릅니다. */
          _attMap(`SELECT ${ATTENDANCE_ACCOUNT_KEY} AS k, COUNT(DISTINCT date) AS v FROM attendance WHERE ${ATTENDANCE_BY_UID_LIST} AND joined_at >= ? AND joined_at <= ? GROUP BY k`, [since30, now]),
          _attMap(`SELECT ${ATTENDANCE_ACCOUNT_KEY} AS k, COUNT(DISTINCT date) AS v FROM attendance WHERE ${ATTENDANCE_BY_UID_LIST} AND joined_at >= ? AND joined_at < ? GROUP BY k`, [since60, since30]),
          _attMap(`SELECT ${ATTENDANCE_ACCOUNT_KEY} AS k, COUNT(DISTINCT date) AS v FROM attendance WHERE ${ATTENDANCE_BY_UID_LIST} AND joined_at >= ? AND joined_at < ? GROUP BY k`, [since90, since60]),
          _attMap(`SELECT ${ATTENDANCE_ACCOUNT_KEY} AS k, MAX(joined_at) AS v FROM attendance WHERE ${ATTENDANCE_BY_UID_LIST} AND joined_at <= ? GROUP BY k`, [now]),
          _groupMap(ph => `SELECT student_uid, AVG(score_overall) a, COUNT(*) n FROM student_evaluations WHERE student_uid IN (${ph}) AND created_at >= ? GROUP BY student_uid`, [since60], 'student_uid', r => ({ a: _num(r.a), n: _num(r.n) })),
          _groupMap(ph => `SELECT user_id, MIN(due_at) earliest_due, SUM(amount) total FROM payments WHERE user_id IN (${ph}) AND (paid_at IS NULL OR paid_at = 0) AND due_at < ? GROUP BY user_id`, [now], 'user_id', r => ({ earliest_due: _num(r.earliest_due), total: _num(r.total) })),
          _groupMap(ph => `SELECT user_id, COUNT(*) n FROM homework_submissions WHERE user_id IN (${ph}) AND status = 'missed' AND created_at >= ? GROUP BY user_id`, [since30], 'user_id', r => _num(r.n)),
          _groupMap(ph => `SELECT user_id, COUNT(*) n FROM point_log WHERE user_id IN (${ph}) AND created_at >= ? GROUP BY user_id`, [since14], 'user_id', r => _num(r.n)),
          // ROW_NUMBER 의 PARTITION 키가 IN 목록과 같은 student_uid → 청크로 나눠도 순위는 동일
          selectInChunks<any>(env.DB, _ids,
            (ph) => `SELECT student_uid, score_overall, rn FROM (SELECT student_uid, score_overall, ROW_NUMBER() OVER (PARTITION BY student_uid ORDER BY created_at DESC) rn FROM student_evaluations WHERE student_uid IN (${ph})) WHERE rn <= 6`,
            { swallowErrors: true }),
          /* 🚷 (2026-08-30 v4 제안서 17) 연속 결석 횟수 — 「3회 이상이면 위험도를 심각으로 올려 달라」.
             ⚠️ 「최근 30일 출석 0」(S2)과는 **다른 사실**이다. 수업이 원래 드문 학생은 S2 만으로는
                안 걸리고, 반대로 방학처럼 수업 자체가 없던 기간은 «연속 결석» 이 아니다.
             🧮 세는 방법(최신 수업일부터 거꾸로, present 를 만나면 멈춤)은 「장기 결석생」 화면
                (/api/admin/attendance/long-absent)과 같다.
             ⚠️ (2026-10-13) 단, 이제 «묶는 키» 가 다르다 — 여기는 계정(ATTENDANCE_ACCOUNT_KEY)으로
                실접속 행과 카페24 씨앗을 한 줄로 잇고, long-absent 는 아직 a.user_id 로 묶고 기간 하한도
                있다. 그래서 같은 학생이 두 화면에서 다른 숫자를 말할 수 있다. 맞출지는 사람이 정할 일.
             ⚙️ 기간 하한이 없지만 풀스캔은 아니다 — 로컬 SQLite EXPLAIN QUERY PLAN 실측:
                MULTI-INDEX OR (idx_attendance_account_date · idx_attendance_user_date). 운영 D1 은 미측정.
             ⚠️ 미래 예약(status='scheduled', joined_at 이 2030년까지 있다)을 결석으로 세지 않도록
                date <= 오늘(KST) 로 자른다. */
          // 🚷 연속 결석도 «계정» 으로 묶어 셉니다(위와 같은 이유). 실접속 행과 카페24 씨앗이 한 줄로 이어집니다.
          _attMap(`WITH ranked AS (
                       SELECT ${ATTENDANCE_ACCOUNT_KEY} AS k, date, status,
                              ROW_NUMBER() OVER (PARTITION BY ${ATTENDANCE_ACCOUNT_KEY} ORDER BY date DESC, id DESC) AS rn
                         FROM attendance
                        WHERE COALESCE(role,'student') = 'student' AND ${ATTENDANCE_BY_UID_LIST}
                          AND date IS NOT NULL AND date <= ?
                     )
                     SELECT k, COALESCE(MIN(CASE WHEN status = 'present' THEN rn END) - 1, MAX(rn)) AS v
                       FROM ranked GROUP BY k`, [today()]),
        ]);

        // 평가 추세 — 최근3회 vs 직전3회 평균 (원본 recent3/prev3 동등)
        const _trendAgg = new Map<string, { recent: number[]; prev: number[] }>();
        for (const r of (_trendRows as any[])) {
          const k = String(r.student_uid);
          if (!_trendAgg.has(k)) _trendAgg.set(k, { recent: [], prev: [] });
          const g = _trendAgg.get(k)!;
          if (_num(r.rn) <= 3) g.recent.push(_num(r.score_overall)); else g.prev.push(_num(r.score_overall));
        }
        const _avg = (a: number[]) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;

        const atRisk: any[] = [];
        for (const s of students) {
          const attRecent = att30M.get(s.user_id) || 0;
          const attPrev = att60M.get(s.user_id) || 0;
          const att90val = att90M.get(s.user_id) || 0;
          const _lastJ = lastJoinM.get(s.user_id) || 0;
          const daysSinceLastJoin = _lastJ ? Math.floor((now - _lastJ) / 86400000) : 999;

          const _ev = evalM.get(s.user_id);
          const evalAvg = _ev ? Math.round(_ev.a || 0) : 0;
          const evalCount = _ev ? (_ev.n || 0) : 0;
          let evalTrend = 0;
          const _tg = _trendAgg.get(s.user_id);
          if (_tg) { const _ra = _avg(_tg.recent), _pa = _avg(_tg.prev); if (_ra != null && _pa != null) evalTrend = Math.round((_ra - _pa) * 10) / 10; }

          const _pay = payM.get(s.user_id);
          let overdueDays = 0, overdueAmount = 0;
          if (_pay && _pay.earliest_due) { overdueDays = Math.floor((now - _pay.earliest_due) / 86400000); overdueAmount = _pay.total || 0; }

          const hwMissed = hwM.get(s.user_id) || 0;
          const recentPoints = ptM.get(s.user_id) || 0;
          const absentStreak = absentStreakM.get(s.user_id) || 0;   // 🚷 연속 결석 (v4 제안서 17)

          // ════════════════════════════════════════════════
          // 🧮 위험 점수 — 10가지 신호 가중 합산 (Babbel / VIPKID / 학원CRM 벤치마킹)
          // ════════════════════════════════════════════════
          let risk = 0;
          const reasons: string[] = [];
          const signals: any = {};

          // S1: 마지막 입장 기준 (가장 강력한 신호)
          // ⚠️ 기록이 아예 없으면(999) «999일 전» 이라고 지어내지 않고 사실대로 적습니다.
          if (daysSinceLastJoin >= 21)      { risk += 45; reasons.push(_lastJ ? `📵 마지막 입장 ${daysSinceLastJoin}일 전` : '📵 출석 기록 없음'); signals.lastJoin = 'critical'; }
          else if (daysSinceLastJoin >= 14) { risk += 35; reasons.push(`📵 마지막 입장 ${daysSinceLastJoin}일 전`); signals.lastJoin = 'high'; }
          else if (daysSinceLastJoin >= 7)  { risk += 18; reasons.push(`⏰ 최근 1주 미출석`); signals.lastJoin = 'medium'; }

          // S2: 최근 30일 출석 0
          if (attRecent === 0 && daysSinceLastJoin < 999) { risk += 25; reasons.push('📉 최근 30일 출석 0회'); signals.attendance = 'zero'; }

          // S3: 출석 감소 추세 (60일→30일 50% 이상 감소)
          if (attPrev > 0 && attRecent < attPrev * 0.5) {
            risk += 22; reasons.push(`📊 출석 ${attPrev}→${attRecent}회 (-${Math.round((1 - attRecent/attPrev)*100)}%)`); signals.attendanceTrend = 'declining';
          }

          // S4: 3개월 연속 하락 (90→60→30)
          if (att90val > attPrev && attPrev > attRecent && attRecent > 0) {
            risk += 12; reasons.push(`📉 3개월 연속 출석 감소 (${att90val}→${attPrev}→${attRecent})`); signals.continuousDecline = true;
          }

          // S5: 평가 점수 저조
          if (evalCount > 0 && evalAvg < 5) { risk += 18; reasons.push(`⭐ 평가 평균 ${evalAvg}점 (낮음)`); signals.evalLow = true; }
          else if (evalCount > 0 && evalAvg < 7) { risk += 8; reasons.push(`⭐ 평가 평균 ${evalAvg}점`); }

          // S6: 평가 추세 하락 (-2점 이상)
          if (evalTrend < -2) { risk += 15; reasons.push(`📉 평가 추세 ${evalTrend > 0 ? '+' : ''}${evalTrend}점`); signals.evalTrend = 'declining'; }

          // S7: 평가서 미작성 (관리 사각지대 신호)
          if (evalCount === 0 && daysSinceLastJoin < 60) { risk += 8; reasons.push('📝 최근 평가서 없음'); }

          // S8: 미납 (강력)
          if (overdueDays >= 30)      { risk += 30; reasons.push(`💰 ${overdueDays}일 미납 (${(overdueAmount/10000).toFixed(0)}만원)`); signals.payment = 'overdue-long'; }
          else if (overdueDays >= 7)  { risk += 15; reasons.push(`💰 ${overdueDays}일 미납`); signals.payment = 'overdue'; }

          // S9: 숙제 미제출
          if (hwMissed >= 5)      { risk += 12; reasons.push(`📚 숙제 ${hwMissed}회 미제출`); signals.homework = 'high-miss'; }
          else if (hwMissed >= 3) { risk += 6; reasons.push(`📚 숙제 ${hwMissed}회 미제출`); }

          // S10: 포인트/활동 정지
          if (recentPoints === 0 && daysSinceLastJoin < 30) { risk += 6; reasons.push('🎮 최근 2주 학습 활동 정지'); signals.engagement = 'frozen'; }

          /* S11: 🚷 연속 결석 (2026-08-30 v4 제안서 17)
             「연속 3회 이상이면 이탈 위험도를 HIGH(심각)로 자동 승격」이 지시다.
             ⚠️ 점수만 올리면 승격이 «가끔» 된다 — 다른 신호가 없는 학생은 합계가 70에 못 미친다.
                그래서 점수와 **별개로** 등급을 못 박는다(아래 forcedHigh).
             ⚠️ 그래도 점수는 함께 올린다 — 목록이 위험도 내림차순 정렬이라, 점수를 안 올리면
                «심각» 인데 목록 아래쪽에 묻힌다. */
          const forcedHigh = absentStreak >= 3;
          if (absentStreak >= 5)      { risk += 40; reasons.push(`🚷 연속 결석 ${absentStreak}회`); signals.absentStreak = 'critical'; }
          else if (forcedHigh)        { risk += 30; reasons.push(`🚷 연속 결석 ${absentStreak}회`); signals.absentStreak = 'high'; }
          else if (absentStreak === 2) { risk += 10; reasons.push('🚷 연속 결석 2회'); signals.absentStreak = 'watch'; }

          if (risk >= 25 || forcedHigh) {
            const riskLevel = (forcedHigh || risk >= 70) ? 'high' : risk >= 50 ? 'medium' : 'low';
            // 💡 추천 액션 — 위험 신호 조합 기반 정교화
            const actions: string[] = [];
            if (overdueDays >= 7) actions.push('💳 결제 안내 카톡');
            if (riskLevel === 'high') actions.push('🚨 학부모 직접 전화');
            if (signals.lastJoin === 'critical') actions.push('🎁 컴백 기프트 + 무료 보강 1회');
            else if (signals.lastJoin === 'high') actions.push('📞 학부모 안부 전화');
            if (signals.evalLow || signals.evalTrend === 'declining') actions.push('🤝 강사 교체 검토 / 1:1 멘토링');
            if (signals.homework === 'high-miss') actions.push('📚 숙제 코디네이터 배정');
            if (signals.engagement === 'frozen') actions.push('🎮 포인트 보너스 이벤트 초대');
            if (!actions.length) actions.push('📧 격려 푸시 + 학부모 안부 문자');

            atRisk.push({
              user_id: s.user_id,
              student_name: s.student_name || s.user_id,
              name_known: !!(s.student_name && s.student_name !== s.user_id),  // 화면 「학생이름」 칸: 이름이 없으면 아이디를 이름처럼 그리지 않기
              parent_name: s.parent_name || null,
              parent_phone: s.parent_phone || null,
              risk_score: Math.min(risk, 100),
              risk_level: riskLevel,
              absent_streak: absentStreak,                 // 🚷 연속 결석 (v4 제안서 17)
              promoted_by_absence: forcedHigh,             // «점수가 아니라 결석 때문에 심각» 임을 화면이 말할 수 있게
              reasons,
              signals,
              attendance_30d: attRecent,
              attendance_30to60d: attPrev,
              attendance_60to90d: att90val,
              days_since_last_join: daysSinceLastJoin,
              eval_avg: evalAvg,
              eval_trend: evalTrend,
              eval_count_60d: evalCount,
              overdue_days: overdueDays,
              overdue_amount: overdueAmount,
              hw_missed_30d: hwMissed,
              recommended_actions: actions,
              recommended_action: actions[0], // 호환 — 기존 UI
            });
          }
        }
        // 위험도 내림차순
        atRisk.sort((a, b) => b.risk_score - a.risk_score);
        const _rrPayload = JSON.stringify({ ok: true, count: atRisk.length, at_risk: atRisk, scan: scanMeta, schema: { name_col: nameCol } });
        try { await env.SESSION_STATE.put(_rrKey, _rrPayload, { expirationTtl: 180 }); } catch { /* 캐시 저장 실패 무시 */ }
        return await _rrWithContact(_rrPayload, {});
      } catch (e: any) {
        console.warn('[retention/risk] error:', e?.message);
        return json({ ok: false, error: e?.message || 'risk_failed' }, 500);
      }
    }

    // ════════════════════════════════════════════════
    // 🎁 Phase ARR-2 — 위험 학생 케어 액션 발송
    //   POST /api/admin/retention/care
    //   body: { user_id, action_type, message?, gift_type?, event_id? }
    //   action_type: 'kakao' | 'sms' | 'gift' | 'event' | 'comeback_bundle'
    // ════════════════════════════════════════════════
    /* 📵 로그·화면에 전화번호를 통째로 남기지 않는다 — 케어 기록은 관리자 여럿이 본다. */
    const maskPhoneForLog = (v: any) => {
      const d = String(v || '').replace(/[^0-9]/g, '');
      if (!d) return '';
      return d.length <= 4 ? d : d.slice(0, d.length - 4).replace(/\d/g, '*') + d.slice(-4);
    };
    if (method === 'POST' && path === '/api/admin/retention/care') {
      try {
        const b = await request.json<any>().catch(() => ({}));
        const uid = String(b.user_id || '').trim();
        const actionType = String(b.action_type || '').trim();
        if (!uid || !actionType) return json({ ok: false, error: 'user_id + action_type required' }, 400);

        await env.DB.exec(`CREATE TABLE IF NOT EXISTS retention_care_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, action_type TEXT, message TEXT, gift_type TEXT, event_id TEXT, status TEXT, error TEXT, created_at INTEGER);`);

        const now = Date.now();
        const message = String(b.message || '').slice(0, 1000);
        const giftType = String(b.gift_type || '').slice(0, 50);
        const eventId = String(b.event_id || '').slice(0, 100);
        let status = 'sent';
        let detail = '';

        // 학생/학부모 정보
        let parentPhone = '', studentPhone = '', studentName = uid;
        try {
          const cols: any = await env.DB.prepare(`PRAGMA table_info(students_erp)`).all();
          const colNames = ((cols.results || []) as any[]).map(c => c.name);
          const nCol = colNames.includes('student_name') ? 'student_name' : (colNames.includes('korean_name') ? 'korean_name' : (colNames.includes('name') ? 'name' : 'user_id'));
          const pPhoneCol = colNames.includes('parent_phone') ? 'parent_phone' : `''`;
          // 학부모 번호가 없을 때 학생 번호로 떨어질 수 있게 함께 읽는다 — 없는 번호로 «보냈다» 고 하면 안 된다
          const sPhoneCol = colNames.includes('student_phone') ? 'student_phone' : (colNames.includes('phone') ? 'phone' : `''`);
          const s: any = await env.DB.prepare(`SELECT ${nCol} AS sn, ${pPhoneCol} AS pp, ${sPhoneCol} AS sp FROM students_erp WHERE user_id = ?`).bind(uid).first();
          if (s) { studentName = s.sn || uid; parentPhone = s.pp || ''; studentPhone = s.sp || ''; }
        } catch {}

        /* 📮 액션 분기 — 2026-08-30 수리: 카톡·문자가 **실제로 나가게** 했다.
           [무엇이 틀렸었나] 예전에는 둘 다 로그 한 줄만 남기고 status='queued' 로 응답했고,
           화면은 `if (!d.ok) throw` 만 보고 «✅ 발송됨» 을 띄웠다. 그런데 그 큐를 읽어
           보내는 코드는 저장소에 없다 — 즉 아무 데도 안 가는데 화면은 보냈다고 말하고 있었다
           (CLAUDE.md 「그럴듯한 거짓말」·「시연 껍데기」와 같은 종류).
           이제 solapi 로 실제로 보내고, 못 보내면 **못 보냈다고** 말한다.
           ⚠️ 자유 문구는 **알림톡으로 못 보낸다** — 알림톡은 사전 승인 템플릿만 나간다.
              그래서 [카톡] 버튼도 문자(LMS)로 보내고, 그 사실을 detail 에 적는다.
           ℹ️ 「장기 결석생」 화면의 퀵케어는 이 경로가 아니라 sms:·tel: 링크라 손대지 않았다
              (그쪽은 폰의 문자앱을 열어 줄 뿐이라 «보냈다» 고 말하지 않는다). */
        const _careTo = parentPhone || studentPhone || '';
        /* 📣 (2026-10-07 매니저 요청 3) 'class_notice' — 「오늘 수업」 줄에서 «강사가 기술 문제로 못 하게 됐다» 같은
           안내를 그 학생에게 바로 보낸다(카페24 「메시지 보내기」 PUSH+SMS 에 해당).
           - 받는 곳 둘: ① 웹푸시(그 학생 계정이 알림을 켰을 때만) ② 문자(번호는 정본 phonesForStudent —
             화면에서 받아 둔 번호(override)를 먼저 본다. 위 _careTo 는 명부만 봐서 그 번호를 못 본다).
           - 🔒 돈이 나가고 우리 이름으로 나가는 문자라 강사·지사·대리점은 막는다(모르면 막는 쪽).
           - ⚠️ «하나라도 닿았는가» 로 sent/failed 를 가른다 — 둘 다 0이면 «보냈다» 고 하지 않는다. */
        if (actionType === 'class_notice') {
          //    판정은 정본 enrollAdminHqOnly(스코프를 다시 읽고 못 읽으면 막음 — getAdminActor 의 fail-open 을 안 탄다).
          const _cnDeny = await enrollAdminHqOnly(request, env);
          if (_cnDeny) return _cnDeny;
          if (!message) return json({ ok: false, error: 'empty_message' }, 400);
          const _wantPush = b.push !== false, _wantSms = b.sms !== false;
          const parts: string[] = [];
          let reached = 0;
          if (_wantPush) {
            const pr: any = await sendPushToUser(env as any, uid, String(b.title || '망고아이 안내').slice(0, 60), message, '/', 'class-notice-' + now).catch((e: any) => ({ ok: false, error: e?.message }));
            const n = Number(pr && pr.sent) || 0;
            reached += n;
            parts.push(n > 0 ? '푸시 ' + n + '대 전송' : (pr && pr.msg === 'no_subscriptions' ? '푸시: 이 학생은 알림을 켜지 않았습니다' : '푸시: 못 보냄'));
          }
          if (_wantSms) {
            let to = '';
            try { const ph = await phonesForStudent(env as any, uid); to = ph.parent || ph.student || ''; } catch {}
            if (!to) to = _careTo;
            if (!to || to.replace(/[^0-9]/g, '').length < 10) parts.push('문자: 보낼 번호가 없습니다');
            else {
              const r: any = await sendPlainSms(env as any, to, message, { subject: String(b.title || '망고아이 안내').slice(0, 30) });
              if (r.ok && r.mode !== 'mock') { reached++; parts.push('문자 발송 → ' + maskPhoneForLog(to)); }
              else if (r.ok) parts.push('문자: 테스트 모드라 실제로는 안 나갔습니다');
              else parts.push('문자 실패: ' + (r.message || r.error || 'unknown'));
            }
          }
          status = reached > 0 ? 'sent' : 'failed';
          detail = parts.join(' · ');
          await env.DB.prepare(`INSERT INTO retention_care_log (user_id, action_type, message, gift_type, event_id, status, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
            .bind(uid, actionType, message, '', '', status, status === 'failed' ? detail : null, now).run();
          return json({ ok: true, status, detail, reached });
        }
        if (actionType === 'kakao' || actionType === 'sms') {
          if (!message) { status = 'failed'; detail = '보낼 내용이 비어 있습니다.'; }
          else if (!_careTo) {
            status = 'failed';
            detail = '보낼 번호가 없습니다 — 학부모·학생 연락처가 모두 비어 있습니다.';
          } else {
            const r = await sendPlainSms(env as any, _careTo, message, { subject: '망고아이 안내' });
            if (r.ok) {
              status = (r.mode === 'mock') ? 'mock' : 'sent';
              detail = (actionType === 'kakao'
                ? '카톡 자유문구는 알림톡으로 못 보내 문자(LMS)로 보냈습니다 → '
                : '문자 발송 → ') + maskPhoneForLog(_careTo)
                + (r.mode === 'mock' ? ' [테스트 모드 — 실제로는 안 나갔습니다]' : '');
            } else {
              status = 'failed';
              detail = '발송 실패: ' + (r.message || r.error || 'unknown') + ' (' + r.mode + ')';
            }
          }
        }
        /* 📞 전화 — «보내는» 것이 아니라 «사람이 한 일» 을 적는 것이다.
           그래서 status 를 sent 로 쓰지 않는다. 통화 내용은 message 로 함께 남긴다. */
        else if (actionType === 'call') {
          status = 'logged';
          detail = '📞 통화 기록: ' + (maskPhoneForLog(_careTo) || '번호 없음')
                 + (message ? ' — ' + message.slice(0, 120) : '');
        }
        else if (actionType === 'gift') {
          // 포인트 보너스 적립
          try {
            await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_points (user_id TEXT PRIMARY KEY, student_name TEXT, balance INTEGER DEFAULT 0, lifetime_earned INTEGER DEFAULT 0, lifetime_spent INTEGER DEFAULT 0, last_earned_at INTEGER, last_spent_at INTEGER, updated_at INTEGER);`);
            const giftAmt = giftType === 'comeback' ? 500 : giftType === 'bonus' ? 200 : 100;
            await env.DB.prepare(`INSERT INTO student_points (user_id, student_name, balance, lifetime_earned, last_earned_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET balance = balance + ?, lifetime_earned = lifetime_earned + ?, last_earned_at = ?, updated_at = ?`)
              .bind(uid, studentName, giftAmt, giftAmt, now, now, giftAmt, giftAmt, now, now).run();
            detail = `🎁 ${giftAmt}P 보너스 적립`;
          } catch (ge: any) { status = 'failed'; detail = ge?.message || 'gift_fail'; }
        }
        /* 🎪 이벤트 초대 — 기록만 남는다. 이 저장소에 이 큐를 읽어 보내는 코드는 없다.
           그래서 status 를 sent 로 두지 않는다(그게 카톡·문자가 오래 하던 거짓말이었다). */
        else if (actionType === 'event') {
          status = 'queued';
          detail = `이벤트 초대 기록: ${eventId} — 안내는 아직 자동으로 나가지 않습니다(문자 버튼으로 따로 보내 주세요).`;
        }
        else if (actionType === 'comeback_bundle') {
          // 컴백 번들: 카톡 + 기프트(500P) + 무료 보강 1회
          try {
            await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_points (user_id TEXT PRIMARY KEY, student_name TEXT, balance INTEGER DEFAULT 0, lifetime_earned INTEGER DEFAULT 0, lifetime_spent INTEGER DEFAULT 0, last_earned_at INTEGER, last_spent_at INTEGER, updated_at INTEGER);`);
            await env.DB.prepare(`INSERT INTO student_points (user_id, student_name, balance, lifetime_earned, last_earned_at, updated_at) VALUES (?, ?, 500, 500, ?, ?) ON CONFLICT(user_id) DO UPDATE SET balance = balance + 500, lifetime_earned = lifetime_earned + 500, last_earned_at = ?, updated_at = ?`)
              .bind(uid, studentName, now, now, now, now).run();
            /* ⚠️ 실제로 일어난 일만 적는다 — 이 갈래는 포인트만 적립한다.
               카톡 안내도, 보강 예약도 여기서 하지 않는다(보내는 코드가 없다).
               ⛔ 여기에 문자 발송을 붙이지 말 것 — 이 액션에는 «일괄» 버튼이 있어
                  그 순간 학부모 전원 대량 발송이 된다. 안내는 [문자] 로 한 명씩. */
            status = 'sent';
            detail = '🎁 컴백 보너스 500P 적립 완료 — 안내 문자와 보강 배정은 따로 해 주세요.';
          } catch (ce: any) { status = 'failed'; detail = ce?.message || 'bundle_fail'; }
        } else {
          return json({ ok: false, error: 'unknown action_type' }, 400);
        }

        // 로그 기록
        await env.DB.prepare(`INSERT INTO retention_care_log (user_id, action_type, message, gift_type, event_id, status, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(uid, actionType, message, giftType, eventId, status, status === 'failed' ? detail : null, now).run();

        /* 📞 (2026-10-13 케어 보드 2단계) 실제로 연락했으면 «한 곳» 에도 적는다 — 정본 care-contact.ts.
           그래야 B(AI 매출·이탈 요약)·E(수강권 만료) 화면도 «연락함» 으로 보여 두 번 연락하지 않는다.
           ⚠️ 연락으로 세는 것만(카톡·문자·전화 · sent/logged). 실패·테스트모드·포인트는 아니다.
           🔒 강사·조직(지사·대리점) 계정은 적지 않는다 — 같은 표의 정식 경로(/api/admin/forecast/*)가 막는 계정이다.
              작성자를 «모르면» 적지 않는다(모르면 막는 쪽). 연락 자체는 이미 끝났으니 응답은 그대로. */
        const careWriterOk = (a: any) => !!(a && a.ok && a.username && !a.isTeacher && !isOrgScopedRole(a.role));
        let careRecorded = false;
        if ((CARE_CONTACT_ACTIONS as readonly string[]).includes(actionType) && (CARE_CONTACT_STATUSES as readonly string[]).includes(status)) {
          let _a: any = null;
          try { _a = await getAdminActor(request, env as any); } catch (e) { console.warn('[retention/care] 작성자 조회 실패 — 케어 기록 생략:', (e as any)?.message); }
          if (careWriterOk(_a)) careRecorded = await recordCareContact(env as any, uid, _a.username, now);
        }

        return json({ ok: true, status, detail, care_recorded: careRecorded });
      } catch (e: any) {
        console.warn('[retention/care] error:', e?.message);
        return json({ ok: false, error: e?.message || 'care_failed' }, 500);
      }
    }
    // GET /api/admin/retention/care/logs — 발송 이력
    if (method === 'GET' && path === '/api/admin/retention/care/logs') {
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS retention_care_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, action_type TEXT, message TEXT, gift_type TEXT, event_id TEXT, status TEXT, error TEXT, created_at INTEGER);`);
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 500);
        const uid = url.searchParams.get('user_id');
        const rs = uid
          ? await env.DB.prepare(`SELECT * FROM retention_care_log WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`).bind(uid, limit).all()
          : await env.DB.prepare(`SELECT * FROM retention_care_log ORDER BY created_at DESC LIMIT ?`).bind(limit).all();
        return json({ ok: true, items: rs.results || [] });
      } catch (e: any) {
        return json({ ok: false, error: e?.message }, 500);
      }
    }
  return null;
}
