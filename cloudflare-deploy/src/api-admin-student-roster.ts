/** student-roster: extracted administrator domain routes. Caller authentication and route order are preserved. */
import type { MangoEnv } from './api-mango';
import { admDowMatches } from './admin-teacher-core';
import { admCacheHit, admCachePut } from './admin-cache';
import { json, parseJsonBody, invalidBody, today } from './api-util';
import { loadSchedSummaryMap, EMPTY_SCHED_SUMMARY } from './student-schedule-summary';
import { attachRosterExtras } from './student-roster-extras';
import { scopeFragments, studentScopeWhere, getScope, franchiseList } from './scope';
import { runCypher, Neo4jNotConfiguredError } from './teacher-match';
import { importCafe24Students } from './cafe24-sync';
import { applyPIIScope, canViewPII } from './pii-mask';
import { getAdminActor } from './auth-admin';
import { hiddenExcludeCond, hiddenOnlyCond } from './student-override';
import { duplicateGate } from './student-duplicate';
import { attachRosterTracks, enrolledNowExpr, loadTrackSummary } from './student-track-roster';
import { ensureAttendanceAccountUid, ATTENDANCE_ACCOUNT_KEY, ATTENDANCE_BY_UID_LIST, attUidListBinds } from './attendance-uid';

export async function handleAdminStudentRosterApi(request: Request, url: URL, env: MangoEnv): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;


    // ═══════════════════════════════════════════════════════════════
    // 🚨 Phase ARR 끝
    // ═══════════════════════════════════════════════════════════════

    // ===== 👨‍🎓 학생 목록 (Phase 9 학생관리 메뉴 — 학생 목록) =====
    //   GET /api/admin/students/list?limit=200
    //   attendance 테이블에서 distinct user_id + 최근 활동 집계
    if (method === 'GET' && path === '/api/admin/students/list') {
      const lim = Math.max(1, Math.min(1000, parseInt(url.searchParams.get('limit') || '200', 10)));
      const _sfList = await scopeFragments(env, request);  // 🔒 지사/대리점 격리
      const rs = await env.DB.prepare(
        `SELECT user_id,
                MAX(username) AS username,
                MAX(role)     AS role,
                MIN(joined_at) AS first_seen,
                MAX(joined_at) AS last_seen,
                COUNT(*)       AS sessions
         FROM attendance
         WHERE user_id IS NOT NULL AND user_id != ''${_sfList.uidScope}
         GROUP BY user_id
         ORDER BY MAX(joined_at) DESC
         LIMIT ?`
      ).bind(..._sfList.binds, lim).all();
      return json({ ok: true, items: rs.results || [] });
    }


    // 👨‍🎓 카페24 학생 이관 — Neo4j (:Student 2.9만) → D1 students_erp (cafe24-sync.ts)
    //   GET /api/admin/students/import-cafe24?offset=0&limit=3000 (페이지네이션, 멱등)
    if (method === 'GET' && path === '/api/admin/students/import-cafe24') {
      const off = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10));
      const lim = Math.max(1, Math.min(5000, parseInt(url.searchParams.get('limit') || '3000', 10)));
      try {
        const r = await importCafe24Students(env, off, lim);
        return json({ ok: true, imported_this_page: r.imported, offset: off, next_offset: r.done ? null : off + lim, done: r.done });
      } catch (e: any) {
        if (e instanceof Neo4jNotConfiguredError) return json({ ok: false, code: 'NEO4J_NOT_CONFIGURED', error: e.message }, 503);
        console.warn('[students/import-cafe24] 실패:', e?.message || e);
        return json({ ok: false, code: 'IMPORT_FAILED', error: String(e?.message || e) }, 502);
      }
    }


    // 🕸️ 그래프 학생 명부 — Neo4j 실데이터 조회 (자체 호스팅 bolt 서버/Aura 공용)
    //   GET /api/admin/students/graph-list?limit=1000&q=검색어
    //   (:Student) 노드 + 가족(FAMILY_OF)·학부모(:Parent) 관계를 MATCH 로 읽어
    //   /students/unified 와 동일한 필드 모양(students:[...])으로 반환한다.
    //   프론트(admin.html loadStudentList)는 이 API 를 1차로 호출하고,
    //   미설정(503)/연결 실패(502)면 D1(unified)로 폴백한다.
    if (method === 'GET' && path === '/api/admin/students/graph-list') {
      const limitG = Math.max(1, Math.min(2000, parseInt(url.searchParams.get('limit') || '1000', 10)));
      const qG = (url.searchParams.get('q') || '').trim().toLowerCase();
      // 🔒 (2026-07-18) 그래프 학생 명부도 세션 스코프로 서버에서 격리(이중 안전장치).
      //   본사(hq)·내부직원(none) = 조건 없음 → 기존 '전체 보기' 동작 변화 0.
      //   지사(branch) = franchise 접두, 대리점(agency) = shop_name 일치, 지사본사(franchise) = 소유 지사 목록만.
      //   라우팅 화이트리스트 게이트(index.ts isAgencyAllowedApi)에 더한 방어라, 게이트가 뚫려도 데이터가 안 샘.
      const _gScope = await getScope(env, request);
      const _gp: Record<string, any> = { q: qG, limit: limitG };
      let _gScopeClause = '';
      if (_gScope.type === 'agency' && _gScope.value) {
        _gScopeClause = ' AND s.shop_name = $scopeVal'; _gp.scopeVal = _gScope.value;
      } else if (_gScope.type === 'branch' && _gScope.value) {
        _gScopeClause = " AND coalesce(s.franchise, '') STARTS WITH $scopeVal"; _gp.scopeVal = _gScope.value;
      } else if (_gScope.type === 'franchise') {
        const _fl = franchiseList(_gScope.value);
        if (!_fl.length) { _gScopeClause = ' AND false'; }                                  // 소유 지사 없음 → 아무것도 안 보이게
        else { _gScopeClause = " AND coalesce(s.franchise, '') IN $scopeList"; _gp.scopeList = _fl; }
      }
      // hq | none → _gScopeClause = '' (전체)
      // ⚡ KV 캐시(120초) — Neo4j 외부 홉 절감. ⚠️ 학부모전화 등 PII 포함이므로 scope(type:value)를 키에 넣어 크로스테넌트 격리(retention/risk 캐시와 동일 원칙). q·limit 도 키에 포함.
      const _glKeyStu = 'gl:students:' + (_gScope.type || 'all') + ':' + (_gScope.value || '') + ':' + limitG + ':' + qG;
      { const _hit = await admCacheHit(env, _glKeyStu); if (_hit) return _hit; }
      const GRAPH_STUDENT_LIST_QUERY = `
MATCH (s:Student)
WHERE ($q = ''
   OR toLower(coalesce(s.name, s.korean_name, ''))       CONTAINS $q
   OR toLower(coalesce(s.student_id, s.user_id, ''))     CONTAINS $q)${_gScopeClause}
OPTIONAL MATCH (s)-[:FAMILY_OF]-(fam:Student)
OPTIONAL MATCH (par:Parent)-[]->(s)
WITH s,
     collect(DISTINCT coalesce(fam.name, fam.student_id)) AS family,
     collect(DISTINCT coalesce(par.name, par.parent_id))[0] AS parent_name,
     collect(DISTINCT par.phone)[0]                         AS parent_phone_g
RETURN coalesce(s.student_id, s.user_id)                         AS user_id,
       coalesce(s.name, s.korean_name, s.student_id, s.user_id)  AS name,
       s.english_name                                            AS english_name,
       s.grade                                                   AS grade,
       s.level                                                   AS level,
       coalesce(s.status, 'active')                              AS status,
       s.student_phone                                           AS student_phone,
       coalesce(parent_phone_g, s.parent_phone)                  AS parent_phone,
       parent_name                                               AS parent_name,
       s.teacher_phone                                           AS teacher_phone,
       s.shop_name                                               AS shop_name,
       s.hq_name                                                 AS hq_name,
       s.branch1_name                                            AS branch1_name,
       s.branch2_name                                            AS branch2_name,
       s.franchise                                               AS franchise,
       s.payment_type                                            AS payment_type,
       s.signup_date                                             AS signup_date,
       s.end_date                                                AS end_date,
       s.classes_per_week                                        AS classes_per_week,
       s.points                                                  AS points,
       family                                                    AS family
ORDER BY name
LIMIT $limit`;
      try {
        const { fields, values } = await runCypher(
          env, GRAPH_STUDENT_LIST_QUERY, _gp, 'READ',
        );
        const students = values.map(row => Object.fromEntries(fields.map((f, i) => [f, row[i]])));
        return admCachePut(env, _glKeyStu, { ok: true, source: 'neo4j', count: students.length, students });
      } catch (e: any) {
        if (e instanceof Neo4jNotConfiguredError) {
          return json({ ok: false, code: 'NEO4J_NOT_CONFIGURED', error: e.message }, 503);
        }
        console.warn('[graph-list] Neo4j 조회 실패:', e?.message || e);
        return json({ ok: false, code: 'NEO4J_UNREACHABLE', error: String(e?.message || e) }, 502);
      }
    }


    // 📚 학생 교재 일괄 배정 — 학생관리 카드 '일괄 교재 배정' 모달용 (adm-bulkbook.js).
    //   body: { textbook_title, level?, q?, only_empty?(기본 true), dry?, force? }
    //   대상 = 스코프(본사/지사/대리점) 내 학생 ∩ (q=이름·아이디 검색) ∩ (only_empty=교재 미배정만).
    //   dry=true → 대상 인원수만 반환(실행 전 미리보기). 2000명 초과는 force=true 필요(오배정 방지).
    //   students_erp.textbook/level 이 화상수업 '배정 교재 자동 로드'가 읽는 정본이며,
    //   student_textbook_assignments 에 이력도 남긴다.
    if (method === 'POST' && path === '/api/admin/students/bulk-assign-textbook') {
      const b: any = await parseJsonBody(request);
      if (!b || !String(b.textbook_title || '').trim()) return invalidBody(['textbook_title']);
      const title = String(b.textbook_title).trim();
      const level = String(b.level || '').trim();
      const q = String(b.q || '').trim();
      const onlyEmpty = b.only_empty !== false;   // 기본 = 미배정 학생만 (기존 배정 실수 덮어쓰기 방지)
      const dry = !!b.dry;

      /* 🎯 (2026-09-08) «그 학생만» 정확일치 배정 — 매니저 「오늘 수업」의 교재 배지에서 온다.
         ⛔ q(부분일치)로 대신하지 말 것 — 아이디 조각 하나(`kim`)로 남의 계정까지 걸리고,
            only_empty 가 기본이며 2026-09-08 실측으로 학생 29,485명이 **전원 미배정** 이라
            그대로 수백 명이 함께 배정된다. 그래서 정확일치 입구를 따로 둔다.
         ⚠️ IN (?,?,…) 로 펴지 않는다 — D1 바인드 100개 한도이고, d1_bind_limit_harness 가
            `map(() => '?')` 를 잡아 FAIL 낸다. **콤마 문자열 한 개**를 바인딩해 정확일치로 본다
            (실측: students_erp.user_id 에 콤마 0건·빈 값 0건이라 이 방식이 성립한다).
         ⚠️ login_id 는 보지 않는다 — 화면이 보내는 것은 class_schedules.user_id·attendance.user_id 이고
            그 값이 students_erp.user_id 와 맞는 것을 실측했다(992/1,000 · 2,408/2,409).
            넓히면 «다른 학생이 걸릴» 여지가 생긴다. 못 찾으면 targets 0 으로 «아무것도 안 하는» 쪽이 맞다.
         ⚠️ 대소문자를 무시하지 않는다 — 대소문자만 다른 학생 계정이 실재한다(Kim/kim).
            «둘 중 아무나» 집으면 남의 계정에 배정된다. */
      /* 🔴 «배열이 아닌 모양» 을 조용히 «목록 없음» 으로 읽으면 안 된다 — 그 순간 이 조건이
         통째로 빠져 스코프 전체가 대상이 된다(fail-open). 실측: `"jeong"`·`"a,b"`·`{0:'x',length:1}`·`123`
         이 전부 []  로 떨어졌다. 2026-09-08 실측대로 학생이 **전원 미배정** 이라 only_empty 가
         아무것도 못 걸러 주므로, 2,000명 미만 스코프에서는 **그 스코프 학생 전원이 한 번에**
         배정되고 응답은 {ok:true} 다. ⟹ «모른다» 는 별도 사유로 **거절**한다
         (CLAUDE.md 2장 「되돌릴 수 없는 조작의 가드를 fail-open 으로 두지 말 것」).
         ⚠️ 지금 화면은 언제나 배열을 보내므로 «오늘의 사고» 가 아니라 «다음 호출자» 를 막는 것이다. */
      if (b.user_ids != null && !Array.isArray(b.user_ids)) return json({ ok: false, error: 'invalid_user_ids' }, 400);
      const rawIds: any[] = Array.isArray(b.user_ids) ? b.user_ids : [];
      const userIds = Array.from(new Set(rawIds.map((v: any) => String(v == null ? '' : v).trim()).filter(Boolean)));
      if (rawIds.length && !userIds.length) return json({ ok: false, error: 'invalid_user_ids' }, 400);
      if (userIds.length > 50) return json({ ok: false, error: 'too_many_user_ids', count: userIds.length }, 400);
      if (userIds.some(v => v.indexOf(',') >= 0)) return json({ ok: false, error: 'invalid_user_ids' }, 400);

      // textbook/level 컬럼은 기본 DDL 에 없음(운영 DB엔 있을 수 있음) → 멱등 보강
      for (const ddl of [`ALTER TABLE students_erp ADD COLUMN textbook TEXT`, `ALTER TABLE students_erp ADD COLUMN level TEXT`]) {
        try { await env.DB.exec(ddl); } catch {}
      }

      const sw: any = await studentScopeWhere(env, request);
      if (sw?.scope?.type === 'none') return json({ ok: false, error: 'no_scope' }, 403);
      const conds: string[] = [];
      const binds: any[] = [];
      if (sw.cond) { conds.push(sw.cond); binds.push(...sw.binds); }
      if (q) {
        conds.push(`(korean_name LIKE ? OR english_name LIKE ? OR username LIKE ? OR user_id LIKE ? OR login_id LIKE ?)`);
        const like = `%${q}%`;
        binds.push(like, like, like, like, like);
      }
      if (onlyEmpty) conds.push(`(textbook IS NULL OR textbook = '')`);
      /* 🎯 정확일치 — 콤마로 감싸 «부분일치» 가 되지 않게 한다(`,jeong,` 안에 `,eon,` 은 없다) */
      if (userIds.length) { conds.push(`instr(?, ',' || user_id || ',') > 0`); binds.push(',' + userIds.join(',') + ','); }
      const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

      const cnt: any = await env.DB.prepare(`SELECT COUNT(*) AS n FROM students_erp ${where}`).bind(...binds).first();
      const targets = Number(cnt?.n || 0);
      /* 📌 «무엇으로 좁혔는지» 를 함께 돌려준다 — 화면이 「전체가 대상」인지 「이 학생만」인지
         사실대로 말할 수 있어야 한다(그 둘을 헷갈리면 수백 명이 한 번에 배정된다). */
      if (dry) return json({ ok: true, dry: true, targets, textbook_title: title, level: level || null, only_empty: onlyEmpty, q: q || null, user_ids: userIds.length ? userIds : null });
      if (!targets) return json({ ok: true, updated: 0, targets: 0 });
      if (targets > 2000 && !b.force) return json({ ok: false, error: 'too_many_targets', targets, hint: 'force=true 로 재요청하면 실행합니다' }, 400);

      const now = Date.now();
      // 이력 먼저 (UPDATE 후엔 only_empty 조건이 더 이상 같은 대상을 가리키지 않음)
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_textbook_assignments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, textbook_id INTEGER, textbook_name TEXT, level TEXT, started_at INTEGER, ended_at INTEGER, progress_pct REAL, status TEXT DEFAULT 'active', created_at INTEGER)`);
        await env.DB.prepare(
          `INSERT INTO student_textbook_assignments (user_id, textbook_name, level, started_at, status, created_at)
           SELECT COALESCE(user_id, login_id), ?, CASE WHEN ? = '' THEN level ELSE ? END, ?, 'active', ? FROM students_erp ${where}`
        ).bind(title, level, level, now, now, ...binds).run();
      } catch (e: any) { console.warn('[bulk-assign-textbook] history insert skipped:', e?.message); }
      const upd: any = await env.DB.prepare(
        `UPDATE students_erp SET textbook = ?, level = CASE WHEN ? = '' THEN level ELSE ? END ${where}`
      ).bind(title, level, level, ...binds).run();
      const updated = Number(upd?.meta?.changes ?? targets);
      return json({ ok: true, updated, targets, textbook_title: title, level: level || null, user_ids: userIds.length ? userIds : null });
    }


    // 🧑‍🎓 통합 학생관리 — students_erp(ERP 명부) + attendance(세션·최근방문) 단일 합본
    //   GET /api/admin/students/unified?q=  → {ok, count, students:[...]}
    if (method === 'GET' && path === '/api/admin/students/unified') {
      const q = (url.searchParams.get('q') || '').trim();
      /* 🎥🤖 (2026-09-24) 학생 트랙 — 화상+AI / AI만. 전부 «선택» 파라미터라 옛 호출은 그대로다.
           track=1        → 행마다 track(live_ai|ai_only|none|unknown)
           summary=1      → track_summary(스코프 전체 두 무리 인원 + 대리점별) — 1000명 제한과 무관
           summary_only=1 → 명부는 안 읽고 track_summary 만(대시보드·본사 조직표용 — 가볍게)
           shop=<이름>    → 그 대리점 학생만(완전일치, 스코프와 AND). '__none__' = 대리점 미지정
         판정 정본은 student-track.ts(= A.i 사용료 청구와 같은 규칙). ⛔ 여기서 다시 짜지 말 것. */
      const _summaryOnly = url.searchParams.get('summary_only') === '1';
      const _wantSummary = _summaryOnly || url.searchParams.get('summary') === '1';
      const _wantTrack = url.searchParams.get('track') === '1';
      const _shop = (url.searchParams.get('shop') || '').trim();
      const like = '%' + q.replace(/[%_]/g, '') + '%';
      // 🔒 역할별 데이터 범위 제한(scoping): 지사=branch1_name, 대리점=shop_name, 교사=teacher_phone, 학부모=parent_phone, 학생=user_id
      const SCOPE_FIELDS: Record<string, string> = {
        branch1_name: 's.branch1_name', shop_name: 's.shop_name', hq_name: 's.hq_name',
        franchise: 's.franchise', teacher_phone: 's.teacher_phone',
        parent_phone: 's.parent_phone', user_id: 's.user_id'
      };
      const _ssw = await studentScopeWhere(env, request, 's');
      const conds: string[] = [];
      const binds: any[] = [];
      if (q) {
        // 🔍 (2026-08-12 수정요청 #02) 이름·아이디뿐 아니라 가맹점(학원)명·지사명, 그리고
        //    원장·담당자 이름(centers.manager / franchises.owner_name)으로도 학생을 찾을 수 있게.
        //    centers·franchises 는 운영 D1 에 이미 존재(schema-live.sql 확인).
        //    🐢 (2026-08-13 수정요청 #01) 이 두 줄이 원래 EXISTS 상관 서브쿼리였다.
        //       «학생 한 명마다» centers 921행·franchises 241행을 새로 훑어서, 검색 한 번에
        //       D1 이 2,690만 행을 읽고 1,361ms 를 썼다(실측). 검색창은 500ms 디바운스 뒤
        //       매번 이걸 부르므로 «타자를 치면 화면이 느려지는» 것의 정체가 이것이다.
        //       IN (비상관 서브쿼리) 로 바꾸면 SQLite 가 목록을 **한 번만** 만들어 재사용한다.
        //       → 2,690만 행 → 9.6만 행 · 1,361ms → 48ms (실측, 같은 검색어 '김').
        //       ⚠️ 의미는 완전히 같다 — EXISTS(c.name = s.shop_name AND c.manager LIKE ?)
        //          와 s.shop_name IN (SELECT name FROM centers WHERE manager LIKE ?) 는
        //          바깥 컬럼이 등호 하나로만 묶여 있어 서로 바꿔 쓸 수 있다.
        //          운영 D1 에서 두 형태의 결과 집합을 대조 확인했다(양방향 차집합 0건):
        //            · '임창문'(centers.manager 경로) 10건 = 10건
        //            · '지사'(franchises.owner_name 경로) 7,742건 = 7,742건
        conds.push(`(s.korean_name LIKE ? OR s.english_name LIKE ? OR s.student_name LIKE ? OR s.user_id LIKE ? OR s.student_phone LIKE ?
          OR s.shop_name LIKE ? OR s.franchise LIKE ?
          OR s.shop_name IN (SELECT c.name FROM centers c WHERE c.manager LIKE ?)
          OR s.franchise IN (SELECT f.name FROM franchises f WHERE f.owner_name LIKE ?))`);
        binds.push(like, like, like, like, like, like, like, like, like);
      }
      if (_ssw.cond) { conds.push(_ssw.cond); binds.push(..._ssw.binds); }
      if (_shop === '__none__') conds.push(`(s.shop_name IS NULL OR TRIM(s.shop_name) = '')`);
      else if (_shop) { conds.push(`TRIM(s.shop_name) = ?`); binds.push(_shop); }   // 요약이 TRIM 해서 묶으므로 같게
      if (_summaryOnly) {
        const _hx = await hiddenExcludeCond(env as any, 's');
        const track_summary = await loadTrackSummary(env as any, _ssw.cond, _ssw.binds, _hx);
        return json({ ok: true, count: 0, students: [], track_summary });
      }
      /* 🧹 (2026-08-20) 숨김 지정한 중복 계정은 명부에서 뺀다.
         students_erp 는 카페24가 정본이라 지워도 밤에 되살아나므로 «읽을 때» 거른다.
         표가 없으면 빈 문자열이 와서 아무것도 안 거른다(fail-open) — 이유는 student-override.ts. */
      /* 🙈 (2026-09-24) `?hidden=only` — 「숨긴 학생 보기」. 숨긴 학생«만» 돌려준다(되살리려고 찾는 용도).
         ⚠️ 표를 못 쓰면 조건이 빈 문자열이라 «전체» 가 나올 뻔한다 — 그때는 1=0 으로 빈 목록을 준다
            (숨긴 목록을 보여 달랐는데 전원을 보여 주면 «전원이 숨겨졌다» 로 읽힌다).
         ⚠️ 스코프(_ssw)는 그대로 걸린다 — 지사는 자기 학생 중 숨긴 것만 본다. */
      const _hiddenOnly = url.searchParams.get('hidden') === 'only';
      if (_hiddenOnly) {
        const _onlyCond = await hiddenOnlyCond(env as any, 's');
        conds.push(_onlyCond || '1 = 0');
      } else {
        const _hideEx = await hiddenExcludeCond(env as any, 's');
        if (_hideEx) conds.push(_hideEx);
      }
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      /* 🐢 (2026-08-13 수정요청 #01) 「학생 목록을 누르면 한참 걸린다」
         원인은 위 SELECT 목록에 매달려 있던 «상관 서브쿼리 3개» 였다. 학생 한 줄을 만들 때마다
         attendance(18.3만행)를 두 번, enrollments 를 한 번 다시 뒤졌다.
           실측(운영 D1, students_erp 29,397 / attendance 183,074):
             · 옛 형태 그대로            → 183만 행 읽기 · 294ms
             · attendance 를 통짜 GROUP BY 로 조인 → 27만 행 · 79ms
             · ↓ 아래처럼 «뽑은 1000명 것만» 집계     → 12.5만 행 · 63ms   ← 14.7배 · 4.7배
         핵심은 «먼저 1000명을 확정하고, 그 1000명 것만 집계한다» 이다. 그래서 CTE(page)를
         먼저 만들고 attendance 집계에도 그 목록을 그대로 물려 준다.
         ⚠️ 돌려주는 값·컬럼 이름·정렬·건수는 종전과 100% 같다. 화면·CSV 는 손댈 필요가 없다.
         ⚠️ sessions 는 예전에 COUNT(*) 라 «없으면 0» 이었다. LEFT JOIN 은 없으면 NULL 이므로
            COALESCE 로 0 을 유지한다. last_seen 은 예전에도 NULL 이었으니 그대로 둔다.
         ⚠️ enrollments 조인의 MAX(id) 는 장식이 아니다 — SQLite 는 GROUP BY 에
            MAX() 가 있으면 함께 적은 «맨몸 컬럼»(package)을 그 최대 행에서 가져온다.
            즉 옛 `ORDER BY e.id DESC LIMIT 1` 과 같은 값이다(lemuel: id 54·55 중 55 = '정규수업' 로 대조 확인).
            빼면 아무 행이나 집히므로 지우지 말 것. */
      const rs = await env.DB.prepare(
        `WITH page AS (
           SELECT s.user_id,
                  COALESCE(s.korean_name, s.student_name, s.username, s.user_id) AS name,
                  s.english_name, s.school, s.grade, s.level, s.textbook,
                  s.student_phone, s.parent_phone, s.kakao_id, s.status, s.signup_date, s.points, s.created_at,
                  s.payment_type, s.end_date, s.classes_per_week, s.teacher_phone,
                  s.shop_name, s.hq_name, s.branch1_name, s.branch2_name, s.franchise,
                  ${enrolledNowExpr('s')} AS enrolled_now,
                  s.rowid AS _rid
             FROM students_erp s
             ${where}
            ORDER BY COALESCE(s.created_at,0) DESC, s.rowid DESC
            LIMIT 1000
         )
         SELECT p.user_id, p.name,
                p.english_name, p.school, p.grade, p.level, p.textbook,
                p.student_phone, p.parent_phone, p.kakao_id, p.status, p.signup_date, p.points, p.created_at,
                p.payment_type, p.end_date, p.classes_per_week, p.teacher_phone,
                p.shop_name, p.hq_name, p.branch1_name, p.branch2_name, p.franchise,
                p.enrolled_now,
                e.package               AS enroll_package,
                COALESCE(a.sessions, 0) AS sessions,
                a.last_seen             AS last_seen
           FROM page p
           LEFT JOIN (SELECT user_id, COUNT(*) AS sessions, MAX(date) AS last_seen
                        FROM attendance
                       WHERE user_id IN (SELECT user_id FROM page)
                       GROUP BY user_id) a ON a.user_id = p.user_id
           LEFT JOIN (SELECT student_user_id, MAX(id) AS _latest_id, package
                        FROM enrollments
                       GROUP BY student_user_id) e ON e.student_user_id = p.user_id
          ORDER BY COALESCE(p.created_at,0) DESC, p._rid DESC`
      ).bind(...binds).all();
      const _piiStudents = applyPIIScope(rs.results || [], _ssw.scope);  // 🔒 권한별 PII 마스킹
      /* 🗓️ (2026-10-13 사장님 «중요한 정보를 오른쪽에») 「수업 기록」 칸 — 위 CTE 의 sessions·last_seen 은
         attendance.user_id(=접속마다 바뀌는 기기번호)로만 세서, 카페24에 없는 학생은 늘 0 이었다
         (CLAUDE.md 「출결만 통째로 0」). 여기서 정본(account_uid OR user_id, 학생 키로 묶음)으로 «다시» 센다.
         · 오늘 이후 날짜는 안 센다 — 카페24 씨앗은 «예약» 이라 미래 날짜가 섞여 있다(최근 수업이 미래가 되면 거짓).
         · 바인드는 JSON 배열 하나(json_each) — D1 100개 한도와 무관.
         ⚠️ 카페24 씨앗을 포함하므로 «출석» 이 아니라 «수업 기록» 이다(KPI 와 같은 말).
         ⛔ 실패하면 위 CTE 값을 그대로 둔다(fail-open — 그 칸만 옛 값). */
      try {
        const _uids = (_piiStudents as any[]).map((x: any) => String(x?.user_id || '')).filter(Boolean);
        if (_uids.length) {
          await ensureAttendanceAccountUid(env as any);
          const _today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
          const _ar = await env.DB.prepare(
            `SELECT ${ATTENDANCE_ACCOUNT_KEY} AS uid, COUNT(*) AS n, MAX(date) AS last_d
               FROM attendance
              WHERE ${ATTENDANCE_BY_UID_LIST} AND date <= ?
              GROUP BY uid`
          ).bind(...attUidListBinds(_uids), _today).all();
          const _am = new Map<string, any>();
          for (const r of ((_ar as any).results || [])) _am.set(String(r.uid), r);
          for (const _st of (_piiStudents as any[])) {
            const r = _am.get(String(_st?.user_id || ''));
            _st.sessions = r ? Number(r.n) || 0 : 0;
            _st.last_seen = r ? (r.last_d || null) : null;
          }
        }
      } catch (e) { console.warn('[students/unified] 수업 기록 다시 세기 실패(옛 값 유지):', (e as any)?.message || e); }
      /* 📘 (2026-09-21) 「예약」 칸 — erp-list 와 «같은» 정본을 여기에도 싣는다.
         2026-09-15 에 그 칸을 만들 때 erp-list 에만 실었는데, 학생 명부 표가 실제로
         부르는 것은 이쪽(unified)이라 **도입 이래 한 번도 값이 안 닿아** 늘 «—» 였다
         (사장님 제보 jeong — 활성 5건인데 «—»). 화면 쪽 매핑(adm-core.js apiItems)에도
         sched 를 옮기는 줄이 없어 **두 겹**으로 빠져 있었다 — 둘 다 고쳐야 닿는다.
         ⚠️ 왼쪽 네 칸(결제타입·수강시작·수강종료·수업회수)을 이 값으로 «채우지» 않는다 —
            뜻이 다르고 그쪽은 카페24가 정본이다(정본 머리말 참고).
         ⚠️ 실패하면 빈 Map → 그 칸만 «—» 이고 명부는 그대로 뜬다(fail-open). */
      const _schedMap = await loadSchedSummaryMap(env as any);
      for (const _st of (_piiStudents as any[])) {
        _st.sched = _schedMap.get(String(_st?.user_id || '').trim()) || { ...EMPTY_SCHED_SUMMARY };
      }
      /* 💰📅 «최근 결제»·«다음 수업» (2026-10-13 사장님 지시) — 정본 student-roster-extras.ts.
         ⛔ 실패해도 명부는 그대로(그 두 칸만 «—»). 요일 해석은 정본 admDowMatches 를 주입한다. */
      /* 🔒 결제 금액은 강사에게 안 싣는다 — 같은 student_payments 를 보여 주는 /api/admin/payments 가
         강사에게 막혀 있다(TEACHER_BLOCKED_PREFIXES «결제·정산»). 이 칸으로 그 차단을 비켜 가면 안 된다.
         ⚠️ 신원을 못 읽으면 «안 싣는» 쪽으로 실패한다(돈 정보). */
      let _rxWithPay = false;
      try { _rxWithPay = !(await getAdminActor(request, env as any)).isTeacher; } catch { _rxWithPay = false; }
      try { await attachRosterExtras(env as any, _piiStudents as any[], Date.now(), admDowMatches, { withPay: _rxWithPay }); }
      catch (e: any) { console.warn('[students/unified] roster extras 실패(그 칸만 비움):', e?.message || e); }
      const _out: any = { ok: true, count: _piiStudents.length, students: _piiStudents, can_view_pii: canViewPII(_ssw.scope), hidden_only: _hiddenOnly };
      // 🎥🤖 트랙 — 조회가 실패해도 명부는 그대로 뜬다(그 칸만 «모름»). ⛔ 실패를 «AI만» 으로 그리지 말 것.
      if (_wantTrack) _out.track_ok = await attachRosterTracks(env as any, _piiStudents as any[]);
      if (_wantSummary) {
        const _hx = await hiddenExcludeCond(env as any, 's');
        _out.track_summary = await loadTrackSummary(env as any, _ssw.cond, _ssw.binds, _hx);
      }
      return json(_out);
    }


    // ➕ 학생 수동 등록 — 카페24 명부에 없는 학생(체험·특수 케이스)을 관리자가 직접 만든다.
    //   POST /api/admin/students/create  body:{ user_id, name, student_phone?, parent_phone?, shop_name?, notes? }
    //   ⚠️ students_erp 는 카페24가 매일 밤 DELETE+INSERT 로 갈아엎지만(CLAUDE.md 2장 「학생 이름·계정을
    //      D1 에서 고치거나 지웠는데 다음날 원복됨」), 그 삭제 조건은 created_at = CAFE24_STUDENT_SENTINEL
    //      (1751500000000) 인 행만이다. 여기서는 Date.now() 로 넣으므로 야간 동기화에서 지워지지 않는다
    //      (self_signup·레벨테스트 체험계정과 같은 검증된 패턴 — api-students.ts:399, leveltest-schedule.ts:83).
    //   본사·직원만 — 강사·지사·대리점은 막는다(staff-create 와 같은 기준. index.ts 라우팅 허용목록에도 등록 필요).
    if (method === 'POST' && path === '/api/admin/students/create') {
      const actor = await getAdminActor(request, env as any);
      if (!actor.ok) return json({ ok: false, error: 'auth_required' }, 401);
      if (actor.isTeacher || !(actor.role === 'hq' || actor.role === 'staff')) {
        return json({ ok: false, error: 'forbidden',
          message: '본사 관리자만 학생을 등록할 수 있습니다.',
          message_en: 'Only head-office admins can register students.' }, 403);
      }

      let body: any;
      try { body = await request.json(); } catch { body = null; }
      const uid = String(body?.user_id || '').trim();
      const name = String(body?.name || '').trim();
      // 🔑 (2026-08-25 사장님 요청) 관리자가 비밀번호를 직접 정할 수 있게 — 비우면 예전처럼
      //   서버가 임시 비밀번호를 만든다(아래). 기준은 자가등록·재설정과 같다(4자 이상,
      //   api-students.ts 참고 — 「관리자 수동 등록과 짝」이라 적힌 그 규칙).
      const customPwd = String(body?.password || '').trim();
      const studentPhone = String(body?.student_phone || '').trim() || null;
      const parentPhone = String(body?.parent_phone || '').trim() || null;
      const shopName = String(body?.shop_name || '').trim() || null;
      const notes = String(body?.notes || '').trim() || null;

      // 검증 — 홈 회원가입(/api/student/register)과 동일 규칙
      if (!uid || uid.length < 4 || uid.length > 20) {
        return json({ ok: false, error: 'invalid_user_id', message: '아이디는 4~20자여야 합니다.' }, 400);
      }
      if (!/^[a-zA-Z0-9_]+$/.test(uid)) {
        return json({ ok: false, error: 'invalid_user_id', message: '아이디는 영문/숫자/밑줄(_)만 가능합니다.' }, 400);
      }
      if (!name) return json({ ok: false, error: 'name_required', message: '학생 이름을 입력하세요.' }, 400);
      if (customPwd && customPwd.length < 4) {
        return json({ ok: false, error: 'weak_password', message: '비밀번호는 4자 이상이어야 합니다.' }, 400);
      }

      await env.DB.exec(`CREATE TABLE IF NOT EXISTS students_erp (user_id TEXT PRIMARY KEY, student_name TEXT, parent_name TEXT, parent_phone TEXT, parent_user_id TEXT, program TEXT, status TEXT, created_at INTEGER);`);
      for (const [col, type] of [['student_id', 'TEXT'], ['login_id', 'TEXT'], ['korean_name', 'TEXT'], ['username', 'TEXT'], ['student_phone', 'TEXT'], ['notes', 'TEXT'],
                                  ['shop_name', 'TEXT'], ['source', 'TEXT'], ['password_hash', 'TEXT'], ['last_login_at', 'INTEGER'], ['phone', 'TEXT'],
                                  ['updated_at', 'INTEGER']] as [string, string][]) {
        try { await env.DB.exec(`ALTER TABLE students_erp ADD COLUMN ${col} ${type}`); } catch {}
      }

      /* 🔤 (2026-08-25) 중복 검사는 **대소문자를 무시**한다 — `/api/student/login` 이
         `WHERE user_id = ? COLLATE NOCASE` 로 찾기 때문이다. 여기서만 구분하면
         `jeong` 이 있는데 `Jeong` 이 그대로 만들어지고(PK 는 BINARY 라 UNIQUE 에 안 걸린다),
         로그인은 둘 중 «아무 행이나» 집는다. 계정이 두 벌로 갈리면 출석·포인트·수업이
         함께 쪼개진다(CLAUDE.md 2장 「같은 사람인데 계정이 두 개」 — admin_account 판과 같은 뿌리).
         ⛔ 스키마를 COLLATE NOCASE 로 바꿔서 풀지 말 것 — 운영 DB 에 이미 그런 행이
            있으면 표를 다시 만들어야 한다. 찾는 쪽만 맞춘다.
         무엇과 부딪혔는지 그대로 알려 준다(대소문자만 다르면 사람이 눈으로 못 찾는다). */
      const dup = await env.DB.prepare(
        `SELECT user_id FROM students_erp WHERE user_id = ? COLLATE NOCASE LIMIT 1`
      ).bind(uid).first<{ user_id: string }>();
      if (dup) {
        const caseOnly = String(dup.user_id) !== uid;
        return json({ ok: false, error: 'exists',
          message: caseOnly
            ? `이미 «${dup.user_id}» 가 있습니다(대소문자만 다릅니다). 학생 로그인은 대소문자를 구분하지 않으니 다른 아이디를 쓰세요.`
            : '이미 사용 중인 아이디입니다.',
          existing: dup.user_id }, 409);
      }

      /* 👥 (2026-09-14 사장님 지시) «같은 사람이 이미 있는가» 를 한 번 더 본다.
         실사고: 정예희 학생이 yahee·yahee1·yahee2 세 계정으로 1분 안에 세 번 등록됐다(전부
         admin_manual · 각각 비밀번호 있음 → 셋 다 로그인됨). 아이디 중복 검사(위)는 «아이디» 만
         보므로 번호를 붙여 다시 누르면 그대로 통과한다. 뿌리는 «첫 등록이 됐는지 몰라서 또 누른 것»
         이라 막는 자리는 로그인이 아니라 «등록» 이다.
         ✅ 판정 정본은 src/student-duplicate.ts 의 duplicateGate(순수 함수) — 이름 완전일치 + 부모/학생 번호가
            «숫자만 남겨» 같을 때만. ⛔ 이름만으로 막지 말 것(동명이인 실재 — 「김사랑」 계정 6개).
            ⛔ «묻는가» 결정을 이 라우트의 if 에 다시 적지 말 것 — 조건 뒤집기 변이가 문자열 검사를 통과한다.
         ✅ 막지 않고 «묻는다»(409 possible_duplicate + existing 목록) — 화면이 「그래도 등록」을 누르면
            force:true 로 다시 오고 그때는 통과. 진짜 다른 아이(형제 등)일 수 있어 사람이 정한다.
         ⚠️ 조회가 실패하면 «묻지 않고» 통과(예전 동작) — 등록 자체가 막히는 쪽이 더 나쁘다.
            조용히 넘기지 않는다: console.warn + 성공 응답 dup_check:'skipped'.
         ⚠️ LIMIT 을 두지 말 것 — 동명이인이 50명 넘는 이름(김민서 71명)에서 진짜 중복이 조회 밖으로 빠진다. */
      let sameRows: any[] | null = null;
      try {
        const rs = await env.DB.prepare(
          `SELECT user_id, student_name, korean_name, parent_phone, student_phone, phone, source
             FROM students_erp
            WHERE student_name = ? OR korean_name = ? OR username = ?`
        ).bind(name, name, name).all();
        sameRows = rs.results || [];
      } catch (e: any) {
        // 조회 실패 = «묻지 않고» 통과(예전 동작). ⚠️ 조용히 넘기지 않는다 — 로그 + 응답 표식(dup_check:'skipped').
        console.warn('[students/create] dup-check query failed — skipping duplicate check:', e?.message || e);
        sameRows = null;
      }
      const gate = duplicateGate(body?.force, name, parentPhone, studentPhone, sameRows);
      if (gate.ask) {
        const ids = gate.existing.map(c => c.user_id).join(', ');
        return json({ ok: false, error: 'possible_duplicate',
          message: `이미 같은 이름·같은 연락처의 학생이 있습니다: ${ids}. 같은 학생이면 그 아이디를 쓰고, 다른 학생이면 「그래도 등록」을 누르세요.`,
          message_en: `A student with the same name and phone already exists: ${ids}. Use that ID if it is the same student, or press "Register anyway".`,
          existing: gate.existing }, 409);
      }

      // 비밀번호 — 직접 입력했으면 그대로, 아니면 임시 비밀번호를 만든다.
      //   해시는 /api/student/login 이 검증하는 것과 같은 방식(SHA-256 + salt).
      //   ⚠️ auth-admin.ts 의 hashPassword() 는 관리자 계정용 다른 솔트라 여기 쓰면 학생이 로그인하지 못한다.
      let tempPw = customPwd;
      if (!tempPw) {
        const ALPHA = 'abcdefghijkmnpqrstuvwxyz23456789';
        const rnd = crypto.getRandomValues(new Uint8Array(12));
        tempPw = '';
        for (let i = 0; i < rnd.length; i++) tempPw += ALPHA[rnd[i] % ALPHA.length];
        tempPw = tempPw.slice(0, 4) + '-' + tempPw.slice(4, 8) + '-' + tempPw.slice(8, 12);
      }
      const pwdBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(tempPw + '|mangoi-salt-2026'));
      const pwdHash = Array.from(new Uint8Array(pwdBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

      const now = Date.now();
      await env.DB.prepare(
        /* student_id·login_id 도 user_id 로 함께 채운다 — 카페24 동기화 행 29,494건이 전부 그 모양이고,
           비워 두면 그 두 칸으로 찾는 옛 조회(학생 상세·수정·연장)에서 «없는 학생» 이 된다(2026-09-14 yahee 사고).
           읽는 쪽도 user_id 를 보게 고쳤지만(api-mango.ts ERP_BY_UID) 행 모양까지 맞춰 두 겹으로 막는다. */
        `INSERT INTO students_erp (user_id, student_id, login_id, korean_name, student_name, username, status, signup_date,
           student_phone, parent_phone, shop_name, notes, source, password_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, '정상', ?, ?, ?, ?, ?, 'admin_manual', ?, ?, ?)`
      ).bind(uid, uid, uid, name, name, name, today(), studentPhone, parentPhone, shopName, notes, pwdHash, now, now).run();

      return json({
        ok: true, user_id: uid, name,
        dup_check: gate.check,   // 'skipped' 면 중복 확인을 못 한 채 등록된 것 — 화면이 그 사실을 말한다
        temp_password: tempPw,
        message: '학생을 등록했습니다. 아래 임시 비밀번호는 지금 이 화면에서만 보입니다 — 학생·학부모에게 전달하세요.',
      });
    }
  return null;
}
