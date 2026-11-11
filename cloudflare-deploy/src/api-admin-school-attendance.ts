/** school-attendance: extracted administrator domain routes. Caller authentication and route order are preserved. */
import type { MangoEnv } from './api-mango';
import { json, today } from './api-util';
import { scopeFragments, getScope, scopeStudentCond } from './scope';
import { applyPIIScope, canViewPII } from './pii-mask';

export async function handleAdminSchoolAttendanceApi(request: Request, url: URL, env: MangoEnv): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;


    /* ── 🚷 GET /api/admin/attendance/long-absent — 장기 결석생 (2026-08-13 수정요청 #05) ──
     *   「연속 3회 이상 결석한 학생을 모아서 보고 싶다」
     *
     *   🔑 출처는 attendance 다. class_schedules 를 쓰면 안 된다 —
     *      673행뿐이고 학생은 6명, 대부분 type_seed 데모라 실수업과 연결돼 있지 않다
     *      (같은 함정을 오늘 KPI 쪽에서 이미 겪었다. 이 파일 위쪽 '결석률' 주석 참고).
     *      카페24 동기화가 «수업 1건 = 행 1개» 로 넣고 class_state=2 → 'present'(완료),
     *      그 외 → 'scheduled'(미실시) 다. 즉 미실시 = 그날 안 온 것.
     *
     *   🧮 연속 횟수 — 최신 수업일부터 거꾸로 세다가 «출석» 을 만나면 멈춘다.
     *      ROW_NUMBER() 로 학생별 역순 번호를 매기고, 첫 출석 행의 번호 - 1 이 곧 연속 결석 수다.
     *      중간에 출석이 있으면 거기서 번호가 끊기므로 리셋이 «저절로» 된다(요구사항 4).
     *
     *   🪤 함정 셋 — 전부 실측으로 확인하고 막았다(2026-08-13, 운영 D1):
     *      ① 미래 수업이 섞인다. attendance.date 최대값이 **2030-02-20** 이다(예약이 미리 들어온다).
     *         date <= 오늘(KST) 로 자르지 않으면 «아직 오지도 않은 수업» 을 결석으로 센다.
     *      ② «출석 기록이 아예 없는» 학생이 압도적으로 많다. 연속 3회 이상 후보 207명 중
     *         **132명은 students_erp 명부에 아예 없고**(테스트·구데이터 uid), 13명은 명부엔 있지만
     *         이 기간에 present 가 한 번도 없다. 그런 사람은 «결석» 이 아니라 «데이터가 없는» 것이다.
     *         → 기본 목록에서 빼되 **숫자로 같이 돌려준다**(요구사항의 «제외하거나 별도 표기»).
     *      ③ 수강이 끝난 학생(end_date 지남)·비활성 학생도 당연히 안 나온다. 결석이 아니다.
     *      실측 정리: 후보 207 → 명부없음 132 · 출석기록없음 13 · 수강종료 8 · 비활성 1
     *                 → **실제 챙겨야 할 학생 53명**
     *
     *   ⏳ 최근 며칠은 아직 «확정» 이 아니다. cafe24 야간 증분이 최근 14일만 다시 가져오므로
     *      (nightlyCafe24Refresh) 그 사이 'scheduled' 는 «완료 신호가 아직 안 온 것» 일 수 있다.
     *      숫자를 임의로 깎지 않는다 — 대신 recent_unsettled 로 «그중 몇 건이 확정 전인지» 같이 준다.
     *
     *   👨‍🏫 담당 강사 — class_schedules → teachers 로 잇는다. 다만 **지금은 거의 다 빈다**:
     *      실측상 이 후보들 중 class_schedules 행이 있는 학생이 0명이고, students_erp.teacher_phone 은
     *      29,398명 **전원이 비어 있다**. 그래서 화면에는 대리점(학원)·지사를 함께 보여 준다
     *      (연락은 그쪽으로 한다). 새 수강신청이 enroll-activate 로 시간표를 만들면 자동으로 채워진다.
     */
    if (method === 'GET' && path === '/api/admin/attendance/long-absent') {
      const _laToday = today();
      const _laMin   = Math.max(2, Math.min(50, parseInt(url.searchParams.get('min') || '3', 10) || 3));
      const _laDays  = Math.max(30, Math.min(730, parseInt(url.searchParams.get('days') || '180', 10) || 180));
      const _laLimit = Math.max(1, Math.min(500, parseInt(url.searchParams.get('limit') || '300', 10) || 300));
      const _laAll   = url.searchParams.get('include') === 'all';   // 제외된 것까지 보고 싶을 때
      const _laQ     = (url.searchParams.get('q') || '').trim();
      const _laLike  = '%' + _laQ.replace(/[%_]/g, '') + '%';
      const _laSince = new Date(Date.parse(_laToday + 'T00:00:00Z') - _laDays * 86400000).toISOString().slice(0, 10);
      const _laSettleCut = new Date(Date.parse(_laToday + 'T00:00:00Z') - 14 * 86400000).toISOString().slice(0, 10);
      // 🔒 지사/대리점은 자기 학생만 (본사·내부직원은 조건 없음)
      const _laScope = await scopeFragments(env, request);
      const _laSort = ({
        streak:       'k.streak DESC, k.last_present ASC',
        last_present: 'k.last_present ASC, k.streak DESC',
        name:         'name ASC',
      } as Record<string, string>)[url.searchParams.get('sort') || 'streak'] || 'k.streak DESC, k.last_present ASC';

      const _laSql =
        `WITH ranked AS (
           SELECT a.user_id, a.date, a.status,
                  ROW_NUMBER() OVER (PARTITION BY a.user_id ORDER BY a.date DESC, a.id DESC) AS rn
             FROM attendance a
            WHERE COALESCE(a.role,'student') = 'student'
              AND a.date IS NOT NULL AND a.date <= ? AND a.date >= ?${_laScope.uidScope}
         ),
         agg AS (
           SELECT user_id,
                  MIN(CASE WHEN status = 'present' THEN rn END)   AS fp,
                  MAX(rn)                                          AS rows_n,
                  MAX(CASE WHEN status = 'present' THEN date END)  AS last_present,
                  MAX(date)                                        AS last_class
             FROM ranked GROUP BY user_id
         ),
         streaks AS (
           SELECT user_id, fp, last_present, last_class, COALESCE(fp - 1, rows_n) AS streak
             FROM agg WHERE COALESCE(fp - 1, rows_n) >= ?
         )
         SELECT k.user_id, k.streak, k.last_present, k.last_class,
                COALESCE(s.korean_name, s.student_name, s.username, k.user_id) AS name,
                s.student_phone, s.parent_phone, s.shop_name, s.franchise, s.classes_per_week,
                tj.teacher_name,
                COALESCE(ru.n, 0) AS recent_unsettled,
                CASE WHEN s.user_id IS NULL                       THEN 'no_roster'
                     WHEN k.fp IS NULL                            THEN 'never_present'
                     WHEN COALESCE(s.status,'active') <> 'active' THEN 'inactive'
                     WHEN s.end_date IS NOT NULL AND s.end_date <> '' AND s.end_date < ? THEN 'ended'
                     ELSE NULL END AS exclude_reason
           FROM streaks k
           LEFT JOIN students_erp s ON s.user_id = k.user_id
           LEFT JOIN (SELECT cs.user_id AS uid, MAX(cs.id) AS _latest, t.name AS teacher_name
                        FROM class_schedules cs
                        JOIN teachers t ON CAST(t.id AS TEXT) = CAST(cs.teacher_id AS TEXT)
                       GROUP BY cs.user_id) tj ON tj.uid = k.user_id
           LEFT JOIN (SELECT r.user_id AS uid, COUNT(*) AS n
                        FROM ranked r JOIN agg g ON g.user_id = r.user_id
                       WHERE r.status <> 'present' AND r.date > ?
                         AND (g.fp IS NULL OR r.rn < g.fp)  /* 연속 구간 안의 것만 */
                       GROUP BY r.user_id) ru ON ru.uid = k.user_id
          WHERE (? = '' OR COALESCE(s.korean_name, s.student_name, s.username, k.user_id) LIKE ?
                        OR k.user_id LIKE ? OR s.shop_name LIKE ?)
          ORDER BY ${_laSort}
          LIMIT ?`;

      const _laRs = await env.DB.prepare(_laSql).bind(
        _laToday, _laSince, ..._laScope.binds,
        _laMin, _laToday, _laSettleCut,
        _laQ, _laLike, _laLike, _laLike,
        _laLimit
      ).all<any>();

      const _laRows = (_laRs.results || []) as any[];
      const _laExcluded = { no_roster: 0, never_present: 0, inactive: 0, ended: 0 };
      const _laItems: any[] = [];
      for (const r of _laRows) {
        const why = r.exclude_reason as keyof typeof _laExcluded | null;
        if (why) { if (why in _laExcluded) _laExcluded[why]++; if (!_laAll) continue; }
        _laItems.push(r);
      }
      return json({
        ok: true,
        as_of: _laToday, min: _laMin, days: _laDays, since: _laSince,
        settle_cut: _laSettleCut,           // 이 날짜 이후는 카페24 동기화가 아직 «확정 전»
        count: _laItems.length,
        candidates: _laRows.length,         // 걸러내기 «전» 후보 수
        excluded: _laExcluded,              // 왜 몇 명이 빠졌는지 (요구사항의 «별도 표기»)
        included_excluded: _laAll,
        students: applyPIIScope(_laItems, _laScope.scope),   // 🔒 권한별 전화번호 마스킹
        can_view_pii: canViewPII(_laScope.scope),
      });
    }


    /* ── 📊 GET /api/admin/attendance/school-stats — 학원별 학생 수업현황 (SLP 출석 통계) ──
     *   (2026-08-19) admin.html 이 카드를 만들 때 데모 16행(데모지사1·데모학당A~F·DEMOID_01…)을
     *   그대로 하드코딩해 둔 채 실서비스에 배포돼 있었다. 실제 지사·학당·학생으로 바꾼다.
     *
     *   🔑 출처는 attendance 다 — class_schedules 는 안 쓴다. 바로 위 long-absent 주석에서
     *      이미 확인한 이유와 같다(673행뿐이고 대부분 데모 시드라 실수업과 안 이어진다).
     *      카페24 동기화는 room_id=`c24-{class_id}` 로 «수업 1건 = 행 1개» 를 넣고
     *      class_state 2 → 'present'(출석), 그 외 → 'scheduled'(미실시=결석)로 채운다.
     *   🧹 ghost 학원(무료수업(지인)·망고아이 기본대리점·교육용 대리점·테스트대리점)은
     *      명부(students_erp) 단계에서 뺀다 — 화면에 데모/테스트 지사가 다시 보이지 않게 하는 것이
     *      이번 요청의 핵심이다.
     *   🔒 지사·대리점 로그인은 scopeStudentCond 로 자기 범위만 본다(다른 화면과 동일 규칙).
     *   ⏳ 아직 오지 않은 날은 «결석» 이 아니라 «미실시» 일 뿐이므로 오늘(KST)까지만 센다.
     *
     *   ?meta=1 이면 무거운 출결 집계 없이, 드롭다운(지사·학당)용 실제 (지사,학당) 조합만 돌려준다
     *   — adm-core.js 의 smFillAgencyFilter() 와 같은 원칙: 서버가 스코프로 이미 자른 실데이터에서
     *   목록을 만들어야 지사 계정에 다른 지사 학원이 섞여 나오지 않는다.
     */
    if (method === 'GET' && path === '/api/admin/attendance/school-stats') {
      const _saToday = today();
      const _saNow = new Date();
      const _saYearIn = parseInt(url.searchParams.get('year') || '', 10);
      const _saYear = (_saYearIn >= 2020 && _saYearIn <= 2100) ? _saYearIn : _saNow.getUTCFullYear();
      const _saMonthIn = parseInt(url.searchParams.get('month') || '', 10);
      const _saMonth = (_saMonthIn >= 1 && _saMonthIn <= 12) ? _saMonthIn : 0;
      const _pad2 = (n: number) => String(n).padStart(2, '0');
      const _saFrom = _saMonth ? `${_saYear}-${_pad2(_saMonth)}-01` : `${_saYear}-01-01`;
      const _saToExcl = _saMonth
        ? new Date(Date.UTC(_saYear, _saMonth, 1)).toISOString().slice(0, 10)
        : `${_saYear + 1}-01-01`;
      const _saToCap = _saToExcl < _saToday ? _saToExcl : _saToday; // 미래분은 안 센다

      const _saScope = await getScope(env as any, request);
      const _saCond = scopeStudentCond(_saScope, 's');
      const GHOST_SHOPS = ['무료수업(지인)', '망고아이 기본대리점', '교육용 대리점', '테스트대리점'];

      const _saMetaWhere: string[] = [
        `s.shop_name NOT IN (${GHOST_SHOPS.map(() => '?').join(',')})`,
        `s.franchise IS NOT NULL AND s.franchise <> ''`,
        `s.shop_name IS NOT NULL AND s.shop_name <> ''`,
      ];
      const _saMetaBinds: any[] = [...GHOST_SHOPS];
      if (_saCond.cond) { _saMetaWhere.push(_saCond.cond); _saMetaBinds.push(..._saCond.binds); }

      if (url.searchParams.get('meta') === '1') {
        const rs = await env.DB.prepare(
          `SELECT DISTINCT s.franchise AS franchise, s.shop_name AS shop_name
             FROM students_erp s WHERE ${_saMetaWhere.join(' AND ')}
            ORDER BY s.franchise, s.shop_name LIMIT 4000`
        ).bind(..._saMetaBinds).all<any>().catch(() => ({ results: [] }));
        return json({ ok: true, pairs: rs.results || [], scope: { type: _saScope.type, label: _saScope.label } });
      }

      const _saFranchise = (url.searchParams.get('franchise') || '').trim();
      const _saShop = (url.searchParams.get('shop_name') || url.searchParams.get('academy') || '').trim();
      const _saQ = (url.searchParams.get('q') || '').trim();
      const _saLike = '%' + _saQ.replace(/[%_]/g, '') + '%';
      const _saResult = (url.searchParams.get('result') || '').trim();
      const _saLimit = Math.max(1, Math.min(200, parseInt(url.searchParams.get('limit') || '50', 10) || 50));
      const _saOffset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);

      const _saWhere: string[] = [
        `s.shop_name NOT IN (${GHOST_SHOPS.map(() => '?').join(',')})`,
        `(COALESCE(s.status,'정상') IN ('정상','활동','active') OR s.status IS NULL OR s.status = '')`,
      ];
      const _saBinds: any[] = [...GHOST_SHOPS];
      if (_saCond.cond) { _saWhere.push(_saCond.cond); _saBinds.push(..._saCond.binds); }
      if (_saFranchise) { _saWhere.push('s.franchise = ?'); _saBinds.push(_saFranchise); }
      if (_saShop) { _saWhere.push('s.shop_name = ?'); _saBinds.push(_saShop); }
      if (_saQ) {
        _saWhere.push(`(COALESCE(s.korean_name, s.student_name, s.username, '') LIKE ? OR s.english_name LIKE ? OR s.user_id LIKE ? OR s.login_id LIKE ?)`);
        _saBinds.push(_saLike, _saLike, _saLike, _saLike);
      }

      const _saResultCond =
        _saResult === 'excellent' ? `AND rate >= 90` :
        _saResult === 'warning'   ? `AND rate >= 70 AND rate < 90` :
        _saResult === 'fail'      ? `AND rate IS NOT NULL AND rate < 70` : '';

      const _saCte =
        `WITH base AS (
           SELECT s.user_id AS user_id,
                  COALESCE(s.korean_name, s.student_name, s.username, s.user_id) AS name,
                  s.english_name AS english_name, s.shop_name AS shop_name, s.franchise AS franchise
             FROM students_erp s WHERE ${_saWhere.join(' AND ')}
         ),
         att AS (
           SELECT a.user_id AS user_id,
                  SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) AS attended_n,
                  COUNT(*) AS total_n
             FROM attendance a
            WHERE a.room_id LIKE 'c24-%'
              AND COALESCE(a.role,'student') = 'student'
              AND a.date >= ? AND a.date < ?
              AND a.user_id IN (SELECT user_id FROM base)
            GROUP BY a.user_id
         ),
         merged AS (
           SELECT b.user_id, b.name, b.english_name, b.shop_name, b.franchise,
                  COALESCE(att.attended_n, 0) AS attended_n,
                  COALESCE(att.total_n, 0)    AS total_n,
                  CASE WHEN COALESCE(att.total_n, 0) = 0 THEN NULL
                       ELSE ROUND(100.0 * COALESCE(att.attended_n, 0) / att.total_n) END AS rate
             FROM base b LEFT JOIN att ON att.user_id = b.user_id
         ) `;
      const _saDateBinds = [_saFrom, _saToCap];

      const _saKpiRow = await env.DB.prepare(
        `${_saCte}
         SELECT COUNT(*) AS n,
                SUM(total_n) AS total_classes, SUM(attended_n) AS total_attended,
                COUNT(DISTINCT shop_name) AS schools,
                SUM(CASE WHEN rate IS NOT NULL AND rate <= 70 THEN 1 ELSE 0 END) AS risk
           FROM merged WHERE 1=1 ${_saResultCond}`
      ).bind(..._saBinds, ..._saDateBinds).first<any>().catch(() => null);

      const _saRows = await env.DB.prepare(
        `${_saCte}
         SELECT * FROM merged WHERE 1=1 ${_saResultCond}
          ORDER BY franchise, shop_name, name LIMIT ? OFFSET ?`
      ).bind(..._saBinds, ..._saDateBinds, _saLimit, _saOffset).all<any>().catch(() => ({ results: [] }));

      return json({
        ok: true,
        year: _saYear, month: _saMonth || null, from: _saFrom, to_excl: _saToExcl, counted_to: _saToCap,
        total: Number(_saKpiRow?.n || 0),
        limit: _saLimit, offset: _saOffset,
        kpi: {
          rate: _saKpiRow?.total_classes ? Math.round(100 * Number(_saKpiRow.total_attended || 0) / Number(_saKpiRow.total_classes)) : null,
          schools: Number(_saKpiRow?.schools || 0),
          students: Number(_saKpiRow?.n || 0),
          risk: Number(_saKpiRow?.risk || 0),
        },
        items: _saRows.results || [],
        scope: { type: _saScope.type, label: _saScope.label },
      });
    }


    // ── GET /api/admin/attendance/today?room_id= — 오늘 출석 명단 (QR 출결 카드) ──
    //   🐛 fix(2026-07-14): admin.html QR 출결 카드가 태초부터 미구현 API 를 호출해
    //   404 였음. 학생용 /api/attendance/checkin 이 남기는 attendance 행을 KST 오늘
    //   기준으로 조회. 프런트 계약: { ok, list:[{joined_at, username|user_id, room_id, status}] }
    if (method === 'GET' && path === '/api/admin/attendance/today') {
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS attendance (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL, user_id TEXT NOT NULL, username TEXT, role TEXT DEFAULT 'student', joined_at INTEGER NOT NULL, left_at INTEGER, status TEXT DEFAULT 'present', date TEXT, attended_at INTEGER, total_session_ms INTEGER DEFAULT 0, total_active_ms INTEGER DEFAULT 0, disconnect_count INTEGER DEFAULT 0);`); } catch {}
      const day = String(url.searchParams.get('date') || today());
      const roomQ = (url.searchParams.get('room_id') || '').trim();
      try {
        const sql = roomQ
          ? `SELECT user_id, username, room_id, status, COALESCE(attended_at, joined_at) AS joined_at FROM attendance WHERE date = ? AND room_id = ? ORDER BY joined_at ASC LIMIT 500`
          : `SELECT user_id, username, room_id, status, COALESCE(attended_at, joined_at) AS joined_at FROM attendance WHERE date = ? ORDER BY joined_at ASC LIMIT 500`;
        const rs = roomQ
          ? await env.DB.prepare(sql).bind(day, roomQ).all()
          : await env.DB.prepare(sql).bind(day).all();
        const list = (rs.results || []) as any[];
        return json({ ok: true, date: day, count: list.length, list });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'query_failed' }, 500);
      }
    }
  return null;
}
