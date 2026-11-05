/** teachers: extracted administrator domain routes. Caller authentication and route order are preserved. */
import type { MangoEnv } from './api-mango';
import { classifyEvalGrade, VALID_TEACHER_STATUS, hrNormName, hrGradeLabel, ensurePayrollSchema, calcWeightedTotal } from './admin-teacher-core';
import { handleTeacherClassTransfer } from './teacher-class-transfer';
import { json, parseJsonBody, invalidBody } from './api-util';
import { forbiddenTeacherBody } from './forbidden-teacher';
import { workplaceOf } from './recording-teacher';
import { teacherPresenceByRoom } from './no-show-truth';
import { classTenMinUnits } from './class-policy';
import { TEACHER_STATUSES, canonTeacherStatus, isTeacherStatus, toTeacherListHidden, teacherVisibleSql } from './teacher-status';
import { resolveTeacherRegion, teacherRegionMatches } from './teacher-region';
import { getAdminActor, sameTeacherName, isOrgScopedRole } from './auth-admin';

export async function handleAdminTeachersApi(request: Request, url: URL, env: MangoEnv): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;


    // ════════════════════════════════════════════════════════════
    // 🥭 Phase 34 — 강사 정보 (Teacher Profiles) CRUD
    //   GET    /api/admin/teacher-profiles          (목록, ?status=&group=)
    //   POST   /api/admin/teacher-profiles          (등록)
    //   GET    /api/admin/teacher-profiles/:id      (단건 조회)
    //   PATCH  /api/admin/teacher-profiles/:id      (수정)
    //   DELETE /api/admin/teacher-profiles/:id      (제거)
    // ════════════════════════════════════════════════════════════
    /* 🔑 강사 → 로그인 아이디 (2026-09-01) — 목록 조회와 단건 조회가 «같은 계정» 을 고르도록
       문장을 한 곳에 둔다. 조인이 아니라 서브쿼리라 링크가 몇 개든 행이 늘지 않는다. */
    const PICK_LOGIN_USERNAME = `(SELECT tal.username FROM teacher_account_links tal
                                   WHERE CAST(tal.teacher_id AS TEXT) = CAST(tp.linked_teacher_id AS TEXT)
                                   ORDER BY COALESCE(tal.linked_at, 0) DESC, tal.username ASC
                                   LIMIT 1) AS login_username`;
    /* 🔴 (2026-09-01) 원부(teachers.active)를 «함께» 내려준다 — 두 표가 어긋나는 것을 화면이 알아채게.
         발단: 사장님이 「Mariane 은 퇴사했는데 왜 아직 명부에 있나」. 재직 여부가 두 곳에 따로 있어서였다 —
           · teachers.active      (0/1)  … 스케줄·배정·카페24 미러가 본다
           · teacher_profiles.status(글자) … 이 명부 화면이 본다
         한쪽만 바꿔도 에러가 안 나므로 «명부에선 사라졌는데 수업은 계속 잡히는» 상태가 조용히 생긴다.
         실제로 그날 양쪽 방향으로 다 났다 — 내가 원부만 내려 명부에 남았고(Mariane·Jinette),
         사장님이 화면에서 명부만 내려 원부에 남았다(Rica·FAYE, 11:00~11:01 실측).
       ⛔ 여기서 «자동으로 맞추지» 않는다. 읽는 곳에서 고치면 어느 쪽이 정본인지 알 수 없다.
          맞추는 것은 쓰는 곳(PATCH) 한 곳이고, 여기는 **다르다는 사실만** 보여 준다.
       ⚠️ 조인이 아니라 서브쿼리다 — 위 login_username 과 같은 이유(조인은 행을 늘린다). */
    const ROSTER_ACTIVE = `(SELECT t.active FROM teachers t
                              WHERE t.id = tp.linked_teacher_id LIMIT 1) AS roster_active`;
    const ROSTER_NAME = `(SELECT t.name FROM teachers t
                            WHERE t.id = tp.linked_teacher_id LIMIT 1) AS roster_name`;
    /* 연결이 두 개 이상이면 화면이 그 사실을 말해야 한다 — 골라 보여 주고 «감추지» 않는다. */
    const LOGIN_LINK_COUNT = `(SELECT COUNT(*) FROM teacher_account_links tal2
                                WHERE CAST(tal2.teacher_id AS TEXT) = CAST(tp.linked_teacher_id AS TEXT)) AS login_link_count`;

    // ⚠ env.DB.exec() 는 단일 라인 SQL 만 허용 — 여러 줄 쓰면 SQL_STATEMENT_ERROR
    const ensureTeacherProfilesSchema = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS teacher_profiles (id INTEGER PRIMARY KEY AUTOINCREMENT, korean_name TEXT NOT NULL, english_name TEXT, email TEXT, phone TEXT, kakao_id TEXT, dob TEXT, gender TEXT, image_url TEXT, intro_video_url TEXT, active_region TEXT, origin_region TEXT, fee_per_10min INTEGER, group_name TEXT, status TEXT DEFAULT '활동중', join_date TEXT, leave_date TEXT, education TEXT, career TEXT, certifications TEXT, available_days TEXT, available_hours TEXT, bank_name TEXT, bank_account TEXT, mbti TEXT, notes TEXT, created_at INTEGER NOT NULL, updated_at INTEGER);`);
      // 기존 DB 에 mbti 컬럼 없으면 보강(이미 있으면 SQLite throw → 흡수)
      try { await env.DB.exec(`ALTER TABLE teacher_profiles ADD COLUMN mbti TEXT`); } catch {}
      // 🌏 (2026-07-23 사장님 지시) 국적 — 이 값이 로그인 계정으로 흘러가 화면 언어를 정한다.
      //   ISO 3166-1 alpha-2 대문자 2글자('KR' | 'PH' | 'US' …). 'KR' 만 한국어, 나머지는 영어.
      try { await env.DB.exec(`ALTER TABLE teacher_profiles ADD COLUMN nationality TEXT`); } catch {}
      /* 🔗 (2026-07-30) teachers(급여·스케줄용, 사진/MBTI 없음) ↔ teacher_profiles(사진·MBTI 있음)
         연결 컬럼 — 제보 #2-1. 이름으로 자동 매칭 시도했더니 29명 중 1명만 우연히 일치해서
         자동 조인이 불가능함을 확인(잘못 매칭하면 다른 강사 사진이 나가는 사고가 됨).
         그래서 사람이 직접 확인하며 연결하는 컬럼을 둔다 — 관리자 화면 "강사 사진 연결" 탭에서 채움. */
      try { await env.DB.exec(`ALTER TABLE teacher_profiles ADD COLUMN linked_teacher_id INTEGER`); } catch {}
      /* 🙈 (2026-09-01 사장님 「활동, 비활동, 그리고 안보임」) 명부에서 감출지 — status 와 «다른 축».
         ⛔ 「안보임」을 status 값으로 만들면 «퇴사했지만 정산이 남아 명부에 남길 사람» 과
            «활동중인데 감추고 싶은 행»(실측: 테스트강사·파라테스트)을 동시에 표현할 수 없다.
         ⚠️ 지연 ALTER 라 첫 목록 조회가 돌아야 칸이 생긴다 — 배포 직후 SQL 에
            `no such column: list_hidden` 이 나오는 것은 배포 실패가 아니다
            (attendance.host·vc_quality.novideo 와 같은 방식). 읽는 쪽은 COALESCE 로 버틴다. */
      try { await env.DB.exec(`ALTER TABLE teacher_profiles ADD COLUMN list_hidden INTEGER DEFAULT 0`); } catch {}
      // 🔑 (2026-08-24) 로그인 아이디를 강사 프로필 화면에서 보여주려면 이 표가 있어야 한다 —
      //   teacher_account_links(admin_account.username ↔ teachers.id, "강사 계정 연결" 카드가 채움)가
      //   아직 한 번도 안 열렸으면 없을 수 있어 여기서도 보강한다.
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS teacher_account_links (username TEXT PRIMARY KEY, teacher_id TEXT NOT NULL, teacher_name TEXT, linked_by TEXT, linked_at INTEGER);`); } catch {}
    };

    if (method === 'GET' && path === '/api/admin/teacher-profiles') {
      try { await ensureTeacherProfilesSchema(); }
      catch (e: any) { return json({ ok: false, error: '테이블 생성 실패: ' + String(e?.message || e) }, 500); }
      const fStatus = url.searchParams.get('status') || '';
      const fGroup  = url.searchParams.get('group') || '';
      const where: string[] = []; const binds: any[] = [];
      if (fStatus) { where.push('status = ?'); binds.push(fStatus); }
      if (fGroup)  { where.push('group_name = ?'); binds.push(fGroup); }
      // 🔐 강사 로그인 시엔 본인 프로필만(타 강사 계좌·연락처·단가 노출 방지)
      const _tpActor = await getAdminActor(request, env as any);
      if (_tpActor.isTeacher) {
        if (!_tpActor.name) return json({ ok: true, items: [] });
        where.push('(LOWER(TRIM(korean_name))=LOWER(TRIM(?)) OR LOWER(TRIM(english_name))=LOWER(TRIM(?)))');
        binds.push(_tpActor.name, _tpActor.name);
      }
      /* 🙈 (2026-09-01) 명부 숨김 — status 와 «다른 축» 이라 조건도 따로 건다.
           (없음)            → 보이는 행만        ← 기본
           ?hidden=1         → 숨긴 행만          ← 화면 필터의 「🙈 안보임」
           ?include_hidden=1 → 전부
         ⚠️ 숨김은 «삭제» 가 아니다. 위 ensureTeacherProfilesSchema() 가 먼저 돌아
            칸을 만들어 두므로 여기서 COALESCE 로 읽어도 안전하다. */
      const fHidden = url.searchParams.get('hidden') || '';
      if (fHidden === '1') where.push(`COALESCE(tp.list_hidden, 0) = 1`);
      /* ⚠️ 강사 본인 조회에는 걸지 않는다 — 위에서 이미 «자기 행 하나» 로 좁혔으므로,
         관리자가 그 강사를 명부에서 숨긴 순간 본인 화면이 빈손이 된다. 숨김은
         «관리자 목록에서 안 보이게» 하려는 것이지 본인에게 감추려는 것이 아니다. */
      else if (!_tpActor.isTeacher && (url.searchParams.get('include_hidden') || '') !== '1') {
        where.push(teacherVisibleSql('tp'));
      }
      /* 🔑 (2026-08-24) login_username — linked_teacher_id(teachers.id)로 그 강사의 실제
         로그인 아이디를 함께 내려준다(연결이 없으면 NULL, 추측 아님).

         🔴 (2026-09-01) LEFT JOIN 이 아니라 «서브쿼리» 인 이유 — 조인은 행을 늘린다.
            teacher_account_links 에 같은 teacher_id 가 두 줄이면 프로필 하나가
            **두 줄로 그려진다.** 사장님 제보 「왜 Len 이 두 명이나 있지?」가 그것이었다:
            원부 18번(LEN)에 `mangoi_168` 과 `Mangoi_168`(대문자 M) 두 링크가 걸려 있었고
            — 뿌리는 CLAUDE.md 의 「대소문자만 다른 계정이 두 벌 생긴다」 함정 —
            명부에 사진·전화·MBTI 까지 똑같은 줄이 나란히 나왔다.
            ⛔ 「연결 카드에서 둘 다 연결하지 마세요」라는 경고만으로는 못 막는다.
               조인 자체가 행을 못 늘리게 하는 것이 근본이다.
         ⚠️ 어느 계정을 고르나 — «가장 최근에 연결한 것». 실측(2026-09-01)에서도 그쪽이
            실제로 쓰는 계정이었다(Mangoi_168 로그인 26회 대 mangoi_168 3회).
            동점이면 username 으로 갈라 **결과가 매번 같게** 한다.
         ✅ 그렇다고 중복을 «감추지» 는 않는다 — login_link_count 를 함께 내려
            화면이 「연결 2개」라고 말하게 한다(감추면 아무도 정리하지 않는다). */
      const sql = `SELECT tp.*,
                          ${PICK_LOGIN_USERNAME},
                          ${LOGIN_LINK_COUNT},
                          ${ROSTER_ACTIVE},
                          ${ROSTER_NAME}
                   FROM teacher_profiles tp
                   ${where.length ? ' WHERE ' + where.join(' AND ') : ''}
                   ORDER BY tp.status='활동중' DESC, tp.korean_name ASC`;
      try {
        const rs = await env.DB.prepare(sql).bind(...binds).all<any>();
        let items = rs.results || [];
        /* 🌏 (2026-09-01) 구분(필리핀·북미·중국) — 판정은 src/teacher-region.ts 한 곳뿐이고,
           그 결과를 행에 실어 내려준다. ⛔ 화면이나 SQL 에서 다시 판정하지 말 것(두 벌이 되면 어긋난다).
           ⚠️ SQL WHERE 가 아니라 «읽은 뒤 거르기» 인 이유 — 판정이 nationality 뿐 아니라
              origin_region·active_region·group_name 글자까지 보기 때문이다. 같은 규칙을 SQL 로
              옮겨 적으면 그 순간 정본이 두 벌이 된다. 이 목록은 쪽나눔이 없어(전체 33행) 안전하다. */
        for (const r of items as any[]) { if (r) r.region = resolveTeacherRegion(r); }
        const fRegion = url.searchParams.get('region') || '';
        if (fRegion) items = items.filter((r: any) => teacherRegionMatches(fRegion, (r && r.region) || ''));
        /* 🔎 어긋난 행을 «세어서» 함께 내려준다. 화면은 이 숫자로 한 줄 경고를 띄운다.
           ⚠️ 연결이 없는 프로필(linked_teacher_id NULL)은 어긋남이 아니다 — 셀 대상이 아니라
              «아직 안 이어진» 것이고, 그건 별도 항목으로 이미 보인다. */
        const mismatch = items.filter((r: any) => {
          if (r == null || r.linked_teacher_id == null) return false;
          if (r.roster_active == null) return false;            // 원부에 그 번호가 없다 → 연결이 깨진 것(아래에서 따로)
          const live = String(r.status || '') === '활동중';
          return live !== (Number(r.roster_active) === 1);
        }).map((r: any) => ({
          id: r.id, name: r.korean_name || r.english_name || null,
          status: r.status || null, roster_name: r.roster_name || null,
          roster_active: Number(r.roster_active) === 1 ? 1 : 0,
        }));
        /* 연결 번호는 있는데 원부에 그 행이 없는 경우 — 끊어진 연결. 이것도 조용하면 안 된다. */
        const brokenLink = items.filter((r: any) =>
          r && r.linked_teacher_id != null && r.roster_active == null
        ).map((r: any) => ({ id: r.id, name: r.korean_name || r.english_name || null }));
        return json({ ok: true, items, roster_mismatch: mismatch, roster_broken_link: brokenLink });
      } catch (e: any) {
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }
    }

    /* 🔗 (2026-07-31) 제보 #2-1 후속 — "이미 DB에 들어가 있으니 찾아서 자동으로 매칭한 뒤 틀린 것만
       확인하는 게 낫다"는 피드백 반영. 이전엔 원문 그대로("Teacher Belle" vs "BELLE") 비교해서
       29명 중 1명만 우연히 맞았지만, "Teacher " 접두사를 떼고 대소문자를 맞추면 실제로는 대부분
       정확히 일치한다. 정확히 일치하는 것만 자동 연결하고, 애매하거나 안 맞는 것만 관리자가 보게 한다
       (틀리게 매칭되면 다른 강사 사진이 나가는 사고라 fuzzy 매칭은 자동 적용하지 않음). */
    if (method === 'POST' && path === '/api/admin/teacher-profiles/auto-match') {
      const _amActor = await getAdminActor(request, env as any);
      if (_amActor.isTeacher) return json(forbiddenTeacherBody(_amActor), 403);
      try { await ensureTeacherProfilesSchema(); }
      catch (e: any) { return json({ ok: false, error: '테이블 생성 실패: ' + String(e?.message || e) }, 500); }

      const norm = (s: any) => String(s || '').trim().toUpperCase().replace(/^TEACHER\s+/, '').replace(/\s+/g, ' ').trim();

      let teachers: any[] = [];
      let profiles: any[] = [];
      try {
        teachers = (await env.DB.prepare(`SELECT id, name FROM teachers`).all<any>()).results || [];
        profiles = (await env.DB.prepare(`SELECT id, korean_name, english_name, linked_teacher_id FROM teacher_profiles`).all<any>()).results || [];
      } catch (e: any) {
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }

      // 정규화 이름이 겹치는 teacher 가 2명 이상이면 그 이름은 애매한 것으로 취급(자동매칭 제외)
      const byNorm = new Map<string, any[]>();
      for (const t of teachers) {
        const n = norm(t.name);
        if (!n) continue;
        if (!byNorm.has(n)) byNorm.set(n, []);
        byNorm.get(n)!.push(t);
      }

      const usedTeacherIds = new Set<number>(profiles.filter(p => p.linked_teacher_id).map(p => p.linked_teacher_id));
      const matched: any[] = [];
      const unmatched: any[] = [];
      const now = Date.now();

      for (const p of profiles) {
        if (p.linked_teacher_id) continue; // 이미 연결된 건 건드리지 않음(기존 수동 작업 보존)
        const cands = byNorm.get(norm(p.korean_name)) || byNorm.get(norm(p.english_name)) || [];
        const cand = cands.length === 1 ? cands[0] : null;
        if (cand && !usedTeacherIds.has(cand.id)) {
          try {
            await env.DB.prepare(`UPDATE teacher_profiles SET linked_teacher_id = ?, updated_at = ? WHERE id = ?`)
              .bind(cand.id, now, p.id).run();
            usedTeacherIds.add(cand.id);
            matched.push({ profile_id: p.id, profile_name: p.korean_name, teacher_id: cand.id, teacher_name: cand.name });
          } catch (e: any) {
            unmatched.push({ profile_id: p.id, profile_name: p.korean_name, reason: 'update_failed: ' + String(e?.message || e) });
          }
        } else {
          // 참고용 추천(자동 적용 X) — 이름에 서로를 포함하는 정도로만 힌트 제공
          const pn = norm(p.korean_name) || norm(p.english_name);
          const suggestion = teachers.find(t => !usedTeacherIds.has(t.id) && pn && (norm(t.name).includes(pn) || pn.includes(norm(t.name))));
          unmatched.push({
            profile_id: p.id, profile_name: p.korean_name,
            reason: cands.length > 1 ? 'ambiguous(동명이인)' : (cand ? 'teacher_already_linked' : 'no_match'),
            suggested_teacher: suggestion ? { id: suggestion.id, name: suggestion.name } : null,
          });
        }
      }

      return json({ ok: true, matched, unmatched, matched_count: matched.length, unmatched_count: unmatched.length });
    }

    if (method === 'POST' && path === '/api/admin/teacher-profiles') {
      const _tpwActor = await getAdminActor(request, env as any);
      if (_tpwActor.isTeacher) return json(forbiddenTeacherBody(_tpwActor, '강사는 강사 프로필을 등록할 수 없습니다.'), 403);
      try { await ensureTeacherProfilesSchema(); }
      catch (e: any) { return json({ ok: false, error: '테이블 생성 실패: ' + String(e?.message || e) }, 500); }
      const b = await parseJsonBody(request);
      if (!b || !b.korean_name) return invalidBody(['korean_name']);
      const now = Date.now();
      try {
        const r = await env.DB.prepare(
          `INSERT INTO teacher_profiles
           (korean_name, english_name, email, phone, kakao_id, dob, gender,
            image_url, intro_video_url, active_region, origin_region, fee_per_10min,
            group_name, status, join_date, leave_date, education, career, certifications,
            available_days, available_hours, bank_name, bank_account, mbti, nationality, notes,
            created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          b.korean_name, b.english_name || null, b.email || null, b.phone || null, b.kakao_id || null,
          b.dob || null, b.gender || null,
          b.image_url || null, b.intro_video_url || null, b.active_region || null, b.origin_region || null,
          b.fee_per_10min || null, b.group_name || null, b.status || '활동중',
          b.join_date || null, b.leave_date || null, b.education || null, b.career || null, b.certifications || null,
          b.available_days || null, b.available_hours || null, b.bank_name || null, b.bank_account || null,
          (b.mbti ? String(b.mbti).toUpperCase().slice(0, 4) : null),
          (b.nationality ? String(b.nationality).toUpperCase().trim().slice(0, 2) : null),
          b.notes || null, now, now
        ).run();
        return json({ ok: true, id: r.meta?.last_row_id });
      } catch (e: any) {
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }
    }

    // 📥 강사 정보 대량 임포트 — 로스터(구글시트) 붙여넣기 업서트. english_name/korean_name 매칭.
    //   body: { rows: [{ name?, korean_name?, english_name?, phone?, email?, kakao_id?,
    //                    available_days?, available_hours?, mbti?, group_name?, status?, fee_per_10min?, active_region?, notes? }...], dry_run?: bool }
    //   기존행=제공된(빈칸 아닌) 필드만 UPDATE(빈값은 건너뜀·기존값 보존), 없으면 INSERT. mbti 유효시 teacher_mbti(tp-id) 동기화(+사진).
    if (method === 'POST' && path === '/api/admin/teacher-profiles/import') {
      const _impActor = await getAdminActor(request, env as any);
      if (_impActor.isTeacher) return json(forbiddenTeacherBody(_impActor, '강사는 임포트할 수 없습니다.'), 403);
      try { await ensureTeacherProfilesSchema(); }
      catch (e: any) { return json({ ok: false, error: '스키마 실패: ' + String(e?.message || e) }, 500); }
      const body = await parseJsonBody(request);
      const rows: any[] = (body && Array.isArray(body.rows)) ? body.rows : [];
      const dryRun = !!(body && body.dry_run);
      if (!rows.length) return invalidBody(['rows']);
      const now = Date.now();
      const existing: any = await env.DB.prepare(`SELECT id, korean_name, english_name FROM teacher_profiles`).all().catch(() => ({ results: [] }));
      const byName = new Map<string, any>();
      for (const t of (existing.results || [])) {
        if (t.korean_name) byName.set(String(t.korean_name).trim().toLowerCase(), t);
        if (t.english_name) byName.set(String(t.english_name).trim().toLowerCase(), t);
      }
      const UPD_COLS = ['korean_name','english_name','email','phone','kakao_id','group_name','status','available_days','available_hours','fee_per_10min','active_region','notes'];
      const clean = (v: any) => { const s = (v == null ? '' : String(v)).trim(); return s === '' ? undefined : s; };
      const validMbti = (v: any) => { const m = (v == null ? '' : String(v)).toUpperCase().trim(); return /^[IE][NS][TF][JP]$/.test(m) ? m : undefined; };
      const results: any[] = [];
      let created = 0, updated = 0, skipped = 0;
      for (const raw of rows) {
        const name = clean(raw.english_name) || clean(raw.name) || clean(raw.korean_name);
        if (!name) { results.push({ name: null, action: 'skip', reason: 'no_name' }); skipped++; continue; }
        const mbti = validMbti(raw.mbti);
        const match = byName.get(name.toLowerCase());
        const fields: any = {};
        for (const c of UPD_COLS) { const val = clean(raw[c]); if (val !== undefined) fields[c] = val; }
        if (clean(raw.name) && !fields.english_name) fields.english_name = clean(raw.name);
        if (mbti) fields.mbti = mbti;
        /* 🧑‍🏫 (2026-09-01) 상태는 «아는 값» 만 받는다 — UPD_COLS 에 'status' 가 있어서
           구글시트에 적힌 문자열이 그대로 들어가고 있었다. 「휴직」·「Active」 같은 값이
           저장되면 그 강사는 배정 후보·급여·순위 어디에도 안 잡힌다(전부 '활동중' 으로 거른다).
           ⛔ 한 행 때문에 임포트 전체를 400 으로 막지는 않는다 — 붙여넣기 작업이라 나머지가
              멀쩡하면 넣는 편이 낫다. 대신 **그 칸만 빼고, 뺐다는 사실을 화면에 돌려준다.**
              (조용히 넣지도, 조용히 버리지도 않는다) */
        let statusIgnored: string | null = null;
        if (fields.status !== undefined) {
          const _canon = canonTeacherStatus(fields.status);
          if (_canon) fields.status = _canon;
          else { statusIgnored = String(fields.status); delete fields.status; }
        }
        if (dryRun) {
          results.push({ name, action: match ? 'update' : 'create', id: match ? match.id : null, fields: Object.keys(fields), mbti: mbti || null, status_ignored: statusIgnored });
          if (match) updated++; else created++;
          continue;
        }
        try {
          let tid = 0;
          if (match) {
            const keys = Object.keys(fields);
            if (keys.length) {
              const sets = keys.map(k => `${k} = ?`); sets.push('updated_at = ?');
              const binds = keys.map(k => fields[k]); binds.push(now, match.id);
              await env.DB.prepare(`UPDATE teacher_profiles SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
            }
            tid = match.id; updated++;
            results.push({ name, action: 'update', id: tid, changed: keys, status_ignored: statusIgnored });
          } else {
            const kn = fields.korean_name || fields.english_name || name;
            const en = fields.english_name || name;
            const r = await env.DB.prepare(
              `INSERT INTO teacher_profiles (korean_name, english_name, email, phone, kakao_id, group_name, status, available_days, available_hours, fee_per_10min, active_region, notes, mbti, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
            ).bind(kn, en, fields.email||null, fields.phone||null, fields.kakao_id||null, fields.group_name||null, fields.status||'활동중',
                   fields.available_days||null, fields.available_hours||null, fields.fee_per_10min||null, fields.active_region||null, fields.notes||null, fields.mbti||null, now, now).run();
            tid = Number(r.meta?.last_row_id || 0); created++;
            byName.set(name.toLowerCase(), { id: tid, korean_name: kn, english_name: en });
            results.push({ name, action: 'create', id: tid, status_ignored: statusIgnored });
          }
          if (mbti && tid) {
            try {
              await env.DB.exec(`CREATE TABLE IF NOT EXISTS teacher_mbti (teacher_uid TEXT PRIMARY KEY, teacher_name TEXT, mbti TEXT, hobby TEXT, teaching_style TEXT, intro TEXT, photo_url TEXT, updated_at INTEGER);`);
              const prof: any = await env.DB.prepare(`SELECT korean_name, english_name, image_url FROM teacher_profiles WHERE id=?`).bind(tid).first();
              await env.DB.prepare(
                `INSERT INTO teacher_mbti (teacher_uid, teacher_name, mbti, photo_url, updated_at) VALUES (?,?,?,?,?)
                 ON CONFLICT(teacher_uid) DO UPDATE SET teacher_name=excluded.teacher_name, mbti=excluded.mbti, photo_url=COALESCE(excluded.photo_url, teacher_mbti.photo_url), updated_at=excluded.updated_at`
              ).bind('tp-' + tid, (prof?.korean_name || prof?.english_name || name), mbti, (prof?.image_url || null), now).run();
            } catch { /* 그래프 동기화 best-effort */ }
          }
        } catch (e: any) {
          skipped++;
          results.push({ name, action: 'error', error: String(e?.message || e) });
        }
      }
      return json({ ok: true, dry_run: dryRun, summary: { created, updated, skipped, total: rows.length }, results });
    }

    // /:id 단건 (GET / PATCH / DELETE)
    const tpMatch = path.match(/^\/api\/admin\/teacher-profiles\/(\d+)$/);
    if (tpMatch) {
      try { await ensureTeacherProfilesSchema(); } catch {}
      const id = parseInt(tpMatch[1], 10);
      // 🔐 강사: 본인 프로필 단건만 조회 가능, 수정·삭제는 불가(자기 단가·계좌 임의변경도 차단)
      const _tpiActor = await getAdminActor(request, env as any);
      if (_tpiActor.isTeacher && method !== 'GET') {
        return json(forbiddenTeacherBody(_tpiActor, '강사는 강사 프로필을 수정·삭제할 수 없습니다.'), 403);
      }
      /* 📦 (2026-11-05 매니저 «Krystel 을 퇴사로 바꿨는데 수업이 그대로») 남은 수업 보기·넘기기 — 정본 src/teacher-class-transfer.ts.
         ℹ️ 이 경로의 «비어 있던 POST» 를 쓴다(GET·PATCH·DELETE 만 쓰고 있었다) — src/index.ts·api-mango.ts 관문은 메서드를
            안 가리고 이 경로를 이미 통과시킨다(CLAUDE.md 2장 「새 API 추가」의 «비어 있는 HTTP 메서드»). 모르는 action 은 정본이 400. */
      if (method === 'POST') {
        const _hoBody: any = await request.json().catch(() => ({}));
        const _ho = await handleTeacherClassTransfer(env as any, _tpiActor, id, _hoBody, Date.now());
        const _hoRes = json(_ho.body, _ho.status as any);
        _hoRes.headers.set('Cache-Control', 'private, no-store');
        return _hoRes;
      }
      if (method === 'GET') {
        /* 🔑 login_username — 목록 조회와 **똑같은 문장**을 쓴다(위 주석 참고).
           ⚠️ 여기만 LEFT JOIN 으로 두면 명부와 수정 모달이 «서로 다른 계정» 을 보여 준다
              (.first() 는 둘 중 아무거나 집는다). 고르는 규칙이 한 곳이어야 한다. */
        const row = await env.DB.prepare(
          `SELECT tp.*,
                  ${PICK_LOGIN_USERNAME},
                  ${LOGIN_LINK_COUNT}
             FROM teacher_profiles tp
            WHERE tp.id = ?`
        ).bind(id).first<any>();
        if (!row) return json({ ok: false, error: 'not_found' }, 404);
        if (_tpiActor.isTeacher && !sameTeacherName(_tpiActor.name, row.korean_name) && !sameTeacherName(_tpiActor.name, row.english_name)) {
          return json(forbiddenTeacherBody(_tpiActor, '본인 프로필만 조회할 수 있습니다.'), 403);
        }
        return json({ ok: true, item: row });
      }
      if (method === 'PATCH') {
        const b = await parseJsonBody(request);
        if (!b) return invalidBody(['body']);
        const allowed = ['korean_name','english_name','email','phone','kakao_id','dob','gender',
          'image_url','intro_video_url','active_region','origin_region','fee_per_10min',
          'group_name','status','join_date','leave_date','education','career','certifications',
          'available_days','available_hours','bank_name','bank_account','mbti','nationality','notes',
          'linked_teacher_id',   // 🔗 (2026-07-30) 제보 #2-1 — 급여용 teachers.id 와 수동 연결
          'list_hidden'];        // 🙈 (2026-09-01) 명부에서 감출지 (0/1) — status 와 다른 축
        /* 🧑‍🏫 (2026-09-01) 상태는 «아는 값» 만 저장한다.
           전에는 어떤 문자열이든 그대로 들어가서, 오타 하나가 조용히 저장되면 그 강사가
           어느 목록에도 안 잡혔다(배정 후보·급여·순위가 전부 '활동중' 으로 거른다).
           ⛔ 모르는 값을 조용히 null 로 눕히지 않는다 — 그러면 「화면에서 골랐는데 그 값만
              저장이 안 됨」(CLAUDE.md 2장)이 된다. 400 으로 되돌려 화면이 말하게 한다.
           ℹ️ 빈 값('')은 종전대로 «미지정»(=활동중으로 읽힘)이라 허용한다. */
        if (b.hasOwnProperty('status')) {
          const _stRaw = b.status;
          const _stEmpty = (_stRaw === null || _stRaw === undefined || String(_stRaw).trim() === '');
          if (!_stEmpty && !isTeacherStatus(_stRaw)) {
            return json({ ok: false, error: 'bad_status',
              message: '모르는 상태값입니다: "' + String(_stRaw) + '" (허용: ' + TEACHER_STATUSES.join(' · ') + ')' }, 400);
          }
          if (!_stEmpty) b.status = canonTeacherStatus(_stRaw);   // '재직' 같은 옛 별칭을 정본으로 눕힌다
        }
        /* 📜 상태·숨김 변경은 배정·급여·학생 홈 노출까지 흔든다 — 바꾸기 «전» 값을 먼저 읽어 둔다.
           ⚠️ 실패해도 수정 자체는 진행한다(기록이 본 작업을 막으면 안 된다). */
        const _tpLogged = b.hasOwnProperty('status') || b.hasOwnProperty('list_hidden');
        let _tpBefore: any = null;
        if (_tpLogged) {
          try {
            _tpBefore = await env.DB.prepare(
              `SELECT korean_name, status, list_hidden FROM teacher_profiles WHERE id = ?`
            ).bind(id).first<any>();
          } catch (e: any) { console.error('[teacher-status] before:', e?.message); }
        }
        const sets: string[] = []; const binds: any[] = [];
        allowed.forEach(k => {
          if (b.hasOwnProperty(k)) {
            let v = b[k] === '' ? null : b[k];
            if (k === 'list_hidden') v = toTeacherListHidden(b[k]);   // 화면 체크 → 0/1
            if (k === 'mbti' && v) v = String(v).toUpperCase().slice(0, 4);   // 표준화 (예: intj → INTJ)
            // 🌏 국적 — ISO 2글자 대문자로 표준화(예: ph → PH). 이 값이 화면 언어를 정한다.
            if (k === 'nationality' && v) v = String(v).toUpperCase().trim().slice(0, 2);
            if (k === 'linked_teacher_id') v = (v === null ? null : (parseInt(v, 10) || null));
            sets.push(k + ' = ?'); binds.push(v);
          }
        });
        if (sets.length === 0) return json({ ok: false, error: 'no_fields' }, 400);
        sets.push('updated_at = ?'); binds.push(Date.now());
        binds.push(id);
        try {
          await env.DB.prepare(
            `UPDATE teacher_profiles SET ${sets.join(', ')} WHERE id = ?`
          ).bind(...binds).run();
          /* 📜 「내가 안 바꿨는데?」에 답할 수 있게 한 줄 남긴다. 표는 관리자 통제 로그와 공용.
             ⚠️ 통째로 try/catch — 기록이 던지면 방금 성공한 수정이 실패로 보인다. */
          if (_tpLogged) {
            try {
              await env.DB.exec(`CREATE TABLE IF NOT EXISTS admin_audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, admin_uid TEXT NOT NULL, action TEXT NOT NULL, target_room TEXT, target_user TEXT, meta TEXT, ip TEXT, created_at INTEGER NOT NULL);`);
              await env.DB.prepare(
                `INSERT INTO admin_audit_logs (admin_uid, action, target_user, meta, created_at) VALUES (?,?,?,?,?)`
              ).bind(
                String(_tpiActor.username || _tpiActor.name || 'unknown'),
                'teacher_status_change',
                String((_tpBefore && _tpBefore.korean_name) || ('#' + id)),
                JSON.stringify({
                  teacher_profile_id: id,
                  before: { status: (_tpBefore && _tpBefore.status) || null, list_hidden: Number((_tpBefore && _tpBefore.list_hidden) || 0) },
                  after:  {
                    status: b.hasOwnProperty('status') ? (b.status || null) : undefined,
                    list_hidden: b.hasOwnProperty('list_hidden') ? toTeacherListHidden(b.list_hidden) : undefined,
                  },
                }),
                Date.now()
              ).run();
            } catch (e: any) { console.error('[teacher-status] audit:', e?.message); }
          }

          /* 🔴 (2026-09-01) 재직 여부를 «원부에도» 함께 반영한다 — 두 표가 갈리는 것을 여기서 막는다.
               발단: 사장님 「Mariane 은 퇴사했는데 왜 아직 명부에 있나」. 재직 여부가 두 곳에 있다 —
                 · teacher_profiles.status … 이 명부 화면이 본다
                 · teachers.active        … 스케줄·배정·카페24 미러가 본다
               한쪽만 바꿔도 에러가 안 나서, 같은 날 **양쪽 방향으로 다** 어긋났다:
                 내가 원부만 내려 명부에 남았고(Mariane·Jinette),
                 사장님이 화면에서 명부만 내려 원부에 남았다(Rica·FAYE — 11:00~11:01 실측).
               그래서 «쓰는 곳 한 군데» 에서 맞춘다. 읽는 곳에서 맞추면 어느 쪽이 정본인지 사라진다.
             ⚠️ status 를 «보냈을 때만» 손댄다 — 전화번호만 고치는 요청이 원부를 건드리면 안 된다.
             ⚠️ 「안보임」(list_hidden)은 다른 축이라 여기서 손대지 않는다 — 감추는 것은 재직 여부가 아니다.
             ⚠️ 연결이 없으면(linked_teacher_id NULL) 할 일이 없다. 이름으로 추측해 잇지 않는다
                (번호·이름 추측으로 남의 일정·급여가 붙은 사고가 이 저장소에 세 번 있다).
             ⚠️ 실패해도 프로필 저장은 성공으로 둔다 — 사람이 방금 누른 저장을 되돌리는 것이 더 나쁘고,
                어긋남은 목록의 roster_mismatch 가 계속 알려 준다. 대신 무엇이 안 됐는지 응답에 싣는다. */
          let rosterSync: any = null;
          if (b.hasOwnProperty('status')) {
            const wantLive = String(b.status || '') === '활동중';
            try {
              const prof: any = await env.DB.prepare(
                `SELECT linked_teacher_id FROM teacher_profiles WHERE id = ?`
              ).bind(id).first();
              const tid = prof && prof.linked_teacher_id != null ? Number(prof.linked_teacher_id) : 0;
              if (!tid) {
                rosterSync = { changed: 0, reason: 'not_linked' };
              } else {
                const r: any = await env.DB.prepare(
                  `UPDATE teachers SET active = ?, updated_at = ? WHERE id = ? AND active <> ?`
                ).bind(wantLive ? 1 : 0, Date.now(), tid, wantLive ? 1 : 0).run();
                rosterSync = { changed: Number(r?.meta?.changes || 0), teacher_id: tid, active: wantLive ? 1 : 0 };

                /* 🪞 내릴 때는 카페24 미러도 함께 막는다.
                     화이트리스트는 «적혀 있으면 켠다» 라, 안 적어 두면 전환일(mode='all')에
                     그 강사의 잔재 예약이 전부 만들어진다(실측: 퇴사한 Mariane 앞으로 30건).
                   ⛔ 반대로 «되살릴» 때는 자동으로 켜지 않는다 — 미러를 켜는 것은 사람이 정할 일이고,
                      한 번 막힌 강사가 복직으로 조용히 다시 켜지는 쪽이 더 위험하다. */
                if (!wantLive) {
                  try {
                    await env.DB.exec(`CREATE TABLE IF NOT EXISTS c24_mirror_teachers (teacher_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0, note TEXT, updated_by TEXT, updated_at INTEGER);`);
                    await env.DB.prepare(
                      `INSERT INTO c24_mirror_teachers (teacher_id, enabled, note, updated_by, updated_at)
                       VALUES (?, 0, ?, ?, ?)
                       ON CONFLICT(teacher_id) DO UPDATE SET enabled = 0, note = excluded.note,
                         updated_by = excluded.updated_by, updated_at = excluded.updated_at`
                    ).bind(
                      String(tid),
                      '명부에서 «' + String(b.status || '') + '» 으로 내려 자동 차단 — 전환일(mode=all)에도 만들지 않는다',
                      String(_tpiActor.username || _tpiActor.name || 'profile-status'),
                      Date.now()
                    ).run();
                    rosterSync.mirror_blocked = true;
                  } catch (e2: any) { rosterSync.mirror_error = String(e2?.message || e2); }
                }
              }
            } catch (e1: any) {
              rosterSync = { changed: 0, error: String(e1?.message || e1) };
            }
          }
          /* 🌏 (2026-09-01) 구분은 서버만 판정한다(src/teacher-region.ts).
               국적을 바꿨으면 «바뀐 구분» 을 응답에 실어 준다 — 화면이 같은 판정을 한 벌 더
               갖지 않게 하려는 것이다(두 벌이 되면 반드시 어긋난다).
             ⚠️ 다시 읽는 이유: 구분은 국적만이 아니라 출신·활동 지역 글자도 본다.
             ⚠️ 실패해도 저장은 성공으로 둔다 — 화면은 region 이 없으면 목록을 다시 읽는다. */
          let regionAfter: string | undefined;
          if (b.hasOwnProperty('nationality')) {
            try {
              const rowAfter: any = await env.DB.prepare(
                `SELECT nationality, origin_region, active_region, group_name FROM teacher_profiles WHERE id = ?`
              ).bind(id).first();
              regionAfter = resolveTeacherRegion(rowAfter);
            } catch (e: any) { console.error('[teacher-region] after:', e?.message); }
          }
          return json({ ok: true, id, roster_sync: rosterSync, region: regionAfter });
        } catch (e: any) {
          return json({ ok: false, error: String(e?.message || e) }, 500);
        }
      }
      if (method === 'DELETE') {
        try {
          await env.DB.prepare(`DELETE FROM teacher_profiles WHERE id = ?`).bind(id).run();
          return json({ ok: true, id });
        } catch (e: any) {
          return json({ ok: false, error: String(e?.message || e) }, 500);
        }
      }
    }

    // ════════════════════════════════════════════════════════════
    // 📊 강사 인사평가 근거 분석 — 목록의 인사평가 점수를 누르면 "왜 이 점수인가"
    //   GET /api/admin/teacher-hr-analysis            → 전체 강사 요약(목록 셀 채우기)
    //   GET /api/admin/teacher-hr-analysis?id=<tp_id> → 단건 상세(근거 + 최근 학생 피드백)
    //
    //   ⚠ 원칙: 점수는 **실제 D1 기록에서만** 계산한다. 근거가 없는 항목은 score:null
    //     ('미측정')로 내려보내고 남은 항목끼리 가중치를 재정규화한다.
    //     인사·급여에 쓰이는 숫자를 추정치로 지어내지 않기 위함.
    //   🔐 강사 로그인은 본인 것만 조회 가능(남의 인사평가 열람 차단).
    // ════════════════════════════════════════════════════════════
    if (method === 'GET' && path === '/api/admin/teacher-hr-analysis') {
      try { await ensureTeacherProfilesSchema(); } catch {}
      const _hrActor = await getAdminActor(request, env as any);
      const oneId = parseInt(url.searchParams.get('id') || '0', 10);

      // 집계는 강사 전원 공통이라 KV 에 5분 캐시 (목록 열 때마다 6개 집계쿼리 도는 것 방지)
      const HR_CACHE_KEY = 'adm:hr-analysis:v1';
      let cachedItems: any[] | null = null;
      try {
        const c = await (env as any).SESSION_STATE.get(HR_CACHE_KEY);
        if (c) cachedItems = JSON.parse(c);
      } catch { /* 캐시는 최적화일 뿐 */ }

      const profRows: any = cachedItems ? { results: [] } : await env.DB.prepare(
        `SELECT id, korean_name, english_name, status, join_date FROM teacher_profiles`
      ).all().catch(() => ({ results: [] }));
      const profiles: any[] = profRows.results || [];
      //   ※ 수업기록 테이블들은 teacher_id 가 아니라 teacher_name(자유문자열)으로 남는다.
      //      그래서 아래 집계는 전부 이름 정규화(hrNormName)로 프로필과 이어붙인다.

      const now = Date.now();
      const D = 86400000;
      const since90ms  = now - 90 * D;
      const since180ms = now - 180 * D;
      const dstr = (ms: number) => new Date(ms).toISOString().slice(0, 10);
      const since90d = dstr(since90ms);
      const cut30d   = dstr(now - 30 * D);

      const q = async (sql: string, ...binds: any[]): Promise<any[]> => {
        try {
          const r: any = await env.DB.prepare(sql).bind(...binds).all();
          return r?.results || [];
        } catch { return []; }   // 테이블 미생성 등 — 해당 지표만 '미측정'
      };

      // ── 실제 신호 수집 (전부 teacher_name GROUP BY — 파라미터 1개씩이라 D1 100개 제한 무관) ──
      const [rateRows, schedRows, lateRows, noshowRows, evalRows, praiseRows] = cachedItems
        ? [[], [], [], [], [], []] as any[][]
        : await Promise.all([
        // ⭐ 학생이 수업 직후 매긴 별점 (1~7)
        q(`SELECT teacher_name AS tn, AVG(score) AS avg_score, COUNT(*) AS n,
                  SUM(CASE WHEN score <= 3 THEN 1 ELSE 0 END) AS low_n
             FROM class_ratings WHERE created_at >= ? AND teacher_name IS NOT NULL
            GROUP BY teacher_name`, since180ms),
        // 📅 수업 예약 — 학생별 첫/마지막 수업일 (재등록 유지율 + 수업 건수의 분모)
        q(`SELECT teacher_name AS tn, user_id AS uid,
                  MIN(scheduled_date) AS first_d, MAX(scheduled_date) AS last_d, COUNT(*) AS c
             FROM class_schedules
            WHERE scheduled_date >= ? AND teacher_name IS NOT NULL
              AND (status IS NULL OR status NOT IN ('cancelled','canceled','deleted'))
            GROUP BY teacher_name, user_id`, since90d),
        // ⏰ 지각 분 (관리자 입력) — schedule_id 로 강사 연결
        q(`SELECT cs.teacher_name AS tn, COUNT(*) AS n, SUM(lm.minutes) AS mins
             FROM lesson_late_minutes lm JOIN class_schedules cs ON cs.id = lm.schedule_id
            WHERE lm.lesson_date >= ? AND lm.minutes > 0 AND cs.teacher_name IS NOT NULL
            GROUP BY cs.teacher_name`, since90d),
        /* 🚫 강사 노쇼 (수업에 강사가 안 들어옴)
           🔎 (2026-08-19) **오판을 빼고 센다.** 이 행은 학생 브라우저가 «내 화면에 안 보였다» 로
              만드는 것이라, 두 사람이 서로 다른 워커의 방에 있으면 강사가 멀쩡히 들어와 있어도
              쌓인다(CLAUDE.md 2장). 실측 13건 중 11건이 오판이었고, 그대로 세면 잘못이 없는
              강사의 90일 평가가 내려간다. 판정은 노쇼 리포트와 **같은 함수**를 쓴다
              (src/no-show-truth.ts) — 두 벌로 두면 화면마다 다른 답이 나온다.
           ⚠️ GROUP BY 를 서버에서 하지 않고 원본 행을 받아 TS 에서 접는다. 낱말 경계 이름 비교를
              SQL 로 흉내 내면 그게 바로 「이름으로 사람 정하기」 함정이라 정확히 못 한다.
           ⚠️ 판정 불가(모름)는 **빼지 않는다** — 모르는 것을 «오판» 으로 단정하면 진짜 노쇼가 감춰진다. */
        (async () => {
          /* ⚠️ `teacher_name` 을 **별칭 없이도** 실어 보낸다. teacherPresenceByRoom 은 그 이름의
             필드를 읽으므로, `AS tn` 만 두면 이름이 빈 값이 되어 전부 «모름» 이 되고
             **오판이 한 건도 제외되지 않는다**(에러는 안 난다 — 조용히 예전과 같아진다).
             2026-08-19 실제로 밟았고, 아래 GROUP BY 접기가 `tn` 을 쓰기 때문에 둘 다 필요하다. */
          const raw = await q(
            `SELECT teacher_name, teacher_name AS tn, room_id, missing_role, student_name FROM class_no_show
              WHERE created_at >= ? AND missing_role = 'teacher' AND teacher_name IS NOT NULL`, since90ms);
          let pres = new Map<string, any>();
          try { pres = await teacherPresenceByRoom(env.DB, raw as any[]); }
          catch (e: any) { console.warn('[hr-signals] 노쇼 대조 생략:', e?.message); }
          const cnt = new Map<string, number>();
          for (const r of raw) {
            const p = pres.get(String(r.room_id || ''));
            if (p && p.present === true) continue;          // 오판 — 강사는 접속해 있었다
            const k = String(r.tn || '');
            cnt.set(k, (cnt.get(k) || 0) + 1);
          }
          return Array.from(cnt, ([tn, n]) => ({ tn, n }));
        })(),
        // 📝 강사가 작성한 학생 평가서 (행정 성실도)
        q(`SELECT teacher_name AS tn, COUNT(*) AS n FROM student_evaluations
            WHERE created_at >= ? AND teacher_name IS NOT NULL GROUP BY teacher_name`, since90ms),
        // 💛 익명 칭찬 (조직 기여)
        q(`SELECT teacher_name AS tn, AVG(star_rating) AS avg_star, COUNT(*) AS n
             FROM teacher_praises WHERE created_at >= ? AND teacher_name IS NOT NULL
            GROUP BY teacher_name`, since180ms),
      ]);

      // 이름 키로 접기
      const pick = (rows: any[], f: (acc: any, r: any) => any, init: () => any) => {
        const m = new Map<string, any>();
        rows.forEach(r => {
          const k = hrNormName(r.tn);
          if (!k) return;
          m.set(k, f(m.get(k) || init(), r));
        });
        return m;
      };
      const mRate = pick(rateRows,
        (a, r) => ({ sum: a.sum + Number(r.avg_score || 0) * Number(r.n || 0), n: a.n + Number(r.n || 0), low: a.low + Number(r.low_n || 0) }),
        () => ({ sum: 0, n: 0, low: 0 }));
      const mLate = pick(lateRows, (a, r) => ({ n: a.n + Number(r.n || 0), mins: a.mins + Number(r.mins || 0) }), () => ({ n: 0, mins: 0 }));
      const mNoShow = pick(noshowRows, (a, r) => ({ n: a.n + Number(r.n || 0) }), () => ({ n: 0 }));
      const mEval = pick(evalRows, (a, r) => ({ n: a.n + Number(r.n || 0) }), () => ({ n: 0 }));
      const mPraise = pick(praiseRows,
        (a, r) => ({ sum: a.sum + Number(r.avg_star || 0) * Number(r.n || 0), n: a.n + Number(r.n || 0) }),
        () => ({ sum: 0, n: 0 }));
      // 수업 예약: 학생 단위 → 강사 단위로 접기
      const mSched = new Map<string, any>();
      schedRows.forEach(r => {
        const k = hrNormName(r.tn);
        if (!k) return;
        const a = mSched.get(k) || { classes: 0, students: 0, eligible: 0, retained: 0 };
        a.classes += Number(r.c || 0);
        a.students += 1;
        // '유지'의 정의: 30일 이전부터 다니던 학생(eligible)이 최근 30일에도 수업이 있으면 retained
        if (String(r.first_d || '') <= cut30d) {
          a.eligible += 1;
          if (String(r.last_d || '') >= cut30d) a.retained += 1;
        }
        mSched.set(k, a);
      });

      const keyOf = (p: any) => {
        const a = hrNormName(p.korean_name), b = hrNormName(p.english_name);
        return { a, b };
      };
      const get2 = (m: Map<string, any>, p: any) => {
        const { a, b } = keyOf(p);
        return m.get(a) || (b && b !== a ? m.get(b) : null) || null;
      };

      const items = profiles.map(p => {
        const rate = get2(mRate, p), sched = get2(mSched, p), late = get2(mLate, p);
        const noshow = get2(mNoShow, p), evl = get2(mEval, p), praise = get2(mPraise, p);
        const classes = sched ? sched.classes : 0;
        const cats: any[] = [];

        // 🌐 강사 다수가 필리핀·외국인 — 라벨뿐 아니라 **근거 문장까지** 한/영 두 벌로 내려보낸다.
        //    (fact/fact_en, source/source_en. 한쪽만 채우면 영어 화면에 한국어가 남는다)

        // ① 수업 우수성 25% — 학생 별점 (1~7 → 0~100)
        if (rate && rate.n > 0) {
          const avg = Math.round((rate.sum / rate.n) * 10) / 10;
          cats.push({ key: 'cls', label: '수업 우수성', label_en: 'Teaching', weight: 0.25,
            score: Math.max(0, Math.min(100, Math.round((((rate.sum / rate.n) - 1) / 6) * 1000) / 10)),
            fact: `학생 별점 ${avg}/7점 · ${rate.n}건` + (rate.low > 0 ? ` (낮은 평가 ${rate.low}건)` : ''),
            fact_en: `Student rating ${avg}/7 · ${rate.n} reviews` + (rate.low > 0 ? ` (${rate.low} low)` : ''),
            source: '학생 수업평가(class_ratings) · 최근 180일',
            source_en: 'Student class ratings · last 180 days' });
        } else {
          cats.push({ key: 'cls', label: '수업 우수성', label_en: 'Teaching', weight: 0.25, score: null,
            fact: '최근 180일 학생 별점 기록 없음', fact_en: 'No student ratings in the last 180 days',
            source: '학생 수업평가(class_ratings)', source_en: 'Student class ratings' });
        }

        // ② 재등록·유지 30% — 30일 이전부터 다니던 학생이 지금도 남아있는 비율
        if (sched && sched.eligible >= 3) {
          cats.push({ key: 'ret', label: '재등록·유지', label_en: 'Retention', weight: 0.30,
            score: Math.round((sched.retained / sched.eligible) * 1000) / 10,
            fact: `기존 학생 ${sched.eligible}명 중 ${sched.retained}명 유지 · 담당 ${sched.students}명`,
            fact_en: `${sched.retained} of ${sched.eligible} existing students retained · ${sched.students} assigned`,
            source: '수업 예약(class_schedules) · 최근 90일',
            source_en: 'Lesson bookings · last 90 days' });
        } else {
          cats.push({ key: 'ret', label: '재등록·유지', label_en: 'Retention', weight: 0.30, score: null,
            fact: sched ? `기존 학생 ${sched.eligible}명 — 표본 3명 미만이라 계산 안 함` : '최근 90일 수업 예약 기록 없음',
            fact_en: sched ? `Only ${sched.eligible} existing students — fewer than 3, not scored` : 'No lesson bookings in the last 90 days',
            source: '수업 예약(class_schedules)', source_en: 'Lesson bookings' });
        }

        // ③ 근태 20% — 지각 비율 + 강사 노쇼
        if (classes > 0) {
          const lateN = late ? late.n : 0, lateMin = late ? late.mins : 0, nsN = noshow ? noshow.n : 0;
          const penalty = Math.min(100, (lateN / classes) * 100 * 1.5 + nsN * 12);
          cats.push({ key: 'punct', label: '근태·성실', label_en: 'Punctuality', weight: 0.20,
            score: Math.max(0, Math.round((100 - penalty) * 10) / 10),
            fact: `수업 ${classes}회 중 지각 ${lateN}회(${lateMin}분) · 강사 노쇼 ${nsN}회`,
            fact_en: `${lateN} late arrivals (${lateMin} min) in ${classes} lessons · ${nsN} teacher no-shows`,
            source: '지각기록(lesson_late_minutes) + 노쇼(class_no_show) · 최근 90일',
            source_en: 'Late-arrival log + no-show log · last 90 days' });
        } else {
          cats.push({ key: 'punct', label: '근태·성실', label_en: 'Punctuality', weight: 0.20, score: null,
            fact: '최근 90일 수업 기록이 없어 계산 안 함', fact_en: 'No lessons in the last 90 days — not scored',
            source: '지각기록 + 노쇼', source_en: 'Late-arrival + no-show logs' });
        }

        // ④ 행정 15% — 수업 대비 학생 평가서 작성률
        if (classes > 0) {
          const wrote = evl ? evl.n : 0;
          cats.push({ key: 'admin', label: '행정·서류', label_en: 'Admin', weight: 0.15,
            score: Math.max(0, Math.min(100, Math.round((wrote / classes) * 1000) / 10)),
            fact: `수업 ${classes}회 중 평가서 ${wrote}건 작성`,
            fact_en: `${wrote} student reports written for ${classes} lessons`,
            source: '학생 평가서(student_evaluations) · 최근 90일',
            source_en: 'Student reports · last 90 days' });
        } else {
          cats.push({ key: 'admin', label: '행정·서류', label_en: 'Admin', weight: 0.15, score: null,
            fact: '최근 90일 수업 기록이 없어 계산 안 함', fact_en: 'No lessons in the last 90 days — not scored',
            source: '학생 평가서(student_evaluations)', source_en: 'Student reports' });
        }

        // ⑤ 조직 기여 10% — 익명 칭찬 (별점 70% + 건수 30%)
        if (praise && praise.n > 0) {
          const star = Math.round((praise.sum / praise.n) * 10) / 10;
          cats.push({ key: 'contr', label: '조직 기여', label_en: 'Contribution', weight: 0.10,
            score: Math.round((((praise.sum / praise.n) / 5) * 100 * 0.7 + Math.min(praise.n, 10) / 10 * 100 * 0.3) * 10) / 10,
            fact: `칭찬 ${praise.n}건 · 평균 ${star}/5점`,
            fact_en: `${praise.n} praises · ${star}/5 average`,
            source: '익명 칭찬(teacher_praises) · 최근 180일',
            source_en: 'Anonymous praise · last 180 days' });
        } else {
          cats.push({ key: 'contr', label: '조직 기여', label_en: 'Contribution', weight: 0.10, score: null,
            fact: '최근 180일 칭찬 기록 없음', fact_en: 'No praise records in the last 180 days',
            source: '익명 칭찬(teacher_praises)', source_en: 'Anonymous praise' });
        }

        // ── 총점: 측정된 항목만 가중치 재정규화 ──
        const measured = cats.filter(c => c.score != null);
        const wSum = measured.reduce((s, c) => s + c.weight, 0);
        const total = wSum > 0
          ? Math.round((measured.reduce((s, c) => s + c.score * c.weight, 0) / wSum) * 10) / 10
          : null;
        measured.forEach(c => { c.contribution = Math.round((c.score * c.weight / wSum) * 10) / 10; });

        return {
          id: p.id, korean_name: p.korean_name, english_name: p.english_name,
          total, grade: hrGradeLabel(total),
          confidence: Math.round(wSum * 100),          // 몇 %의 가중치가 실제 데이터로 채워졌나
          measured_count: measured.length, categories: cats,
          window: { classes, ratings: rate ? rate.n : 0 },
        };
      });

      // 순위 — 활동중 + 측정된 강사끼리만 (데이터 없는 강사를 꼴찌로 몰지 않는다)
      const activeIds = new Set(profiles
        .filter(p => !p.status || p.status === '활동중')
        .map(p => p.id));
      const ranked = items
        .filter(i => i.total != null && activeIds.has(i.id))
        .sort((a: any, b: any) => b.total - a.total);
      const rankMap = new Map<number, number>();
      ranked.forEach((it: any, i) => rankMap.set(it.id, i + 1));
      items.forEach((it: any) => { it.rank = rankMap.get(it.id) || null; it.ranked_total = ranked.length; });

      const rows: any[] = cachedItems || items;
      if (!cachedItems) {
        try { await (env as any).SESSION_STATE.put(HR_CACHE_KEY, JSON.stringify(items), { expirationTtl: 300 }); }
        catch { /* 캐시 저장 실패 무시 */ }
      }

      // ── 단건 상세: 최근 학생 피드백 + 관리자 수동 평가 첨부 ──
      if (oneId) {
        const it: any = rows.find((x: any) => x.id === oneId);
        if (!it) return json({ ok: false, error: 'not_found' }, 404);
        if (_hrActor.isTeacher &&
            !sameTeacherName(_hrActor.name, it.korean_name) && !sameTeacherName(_hrActor.name, it.english_name)) {
          return json(forbiddenTeacherBody(_hrActor, '본인 인사평가만 조회할 수 있습니다.'), 403);
        }
        const kn = it.korean_name || '', en = it.english_name || kn;
        it.recent_feedback = await q(
          `SELECT student_name, score, tags, feedback, rated_date FROM class_ratings
            WHERE created_at >= ? AND (LOWER(TRIM(teacher_name)) = LOWER(TRIM(?)) OR LOWER(TRIM(teacher_name)) = LOWER(TRIM(?)))
              AND (feedback IS NOT NULL AND feedback != '')
            ORDER BY created_at DESC LIMIT 5`, since180ms, kn, en);
        const manual = await q(
          `SELECT te.year, te.month, te.score_instruction, te.score_retention, te.score_punctuality,
                  te.score_admin, te.score_contribution, te.weighted_total, te.grade,
                  te.strengths, te.improvements, te.evaluator
             FROM teacher_evaluations te JOIN teachers t ON t.id = te.teacher_id
            WHERE LOWER(TRIM(t.name)) = LOWER(TRIM(?)) OR LOWER(TRIM(t.name)) = LOWER(TRIM(?))
            ORDER BY te.year DESC, te.month DESC LIMIT 1`, kn, en);
        it.manual_evaluation = manual[0] || null;   // 급여·평가 카드에서 사람이 입력한 5점 척도 평가
        if (it.manual_evaluation) {
          // 등급 라벨도 영어 한 벌 (강사가 영어로 볼 수 있어야 함)
          const GRADE_EN: Record<string, string> = {
            '최우수': 'Outstanding', '매우 우수': 'Excellent', '우수': 'Good',
            '개선 요망': 'Needs improvement', '미평가': 'Not evaluated',
          };
          it.manual_evaluation.grade_en = GRADE_EN[String(it.manual_evaluation.grade || '')] || it.manual_evaluation.grade || null;
        }
        return json({ ok: true, item: it, generated_at: now });
      }

      // 목록용 — 강사는 본인 행만
      let out = rows;
      if (_hrActor.isTeacher) {
        out = rows.filter((i: any) => sameTeacherName(_hrActor.name, i.korean_name) || sameTeacherName(_hrActor.name, i.english_name));
      }
      return json({ ok: true, items: out, cached: !!cachedItems, generated_at: now });
    }

    // ════════════════════════════════════════════════════════════
    // 🧠 교사 본인 MBTI 자가기록 — 교사 마이페이지에서 검사 후 저장
    //   GET  /api/teacher/mbti-self   → 내 현재 MBTI 조회(폼 프리필용)
    //   POST /api/teacher/mbti-self   { mbti:'INTJ', hobby?, teaching_style? }
    //   본인(teacher_profiles.korean_name|english_name == actor.name) 프로필에만 기록.
    //   매칭 그래프 소스(teacher_mbti)에도 동기화 → [[teacher-match-graph]] 추천에 반영.
    // ════════════════════════════════════════════════════════════
    if (path === '/api/teacher/mbti-self') {
      const actor = await getAdminActor(request, env as any);
      if (!actor.ok || !actor.isTeacher || !actor.name) {
        return json({ ok: false, error: 'forbidden', message: '강사 로그인이 필요합니다.' }, 403);
      }
      try { await ensureTeacherProfilesSchema(); } catch {}
      const myProfile = await env.DB.prepare(
        `SELECT id, korean_name, english_name, mbti FROM teacher_profiles
          WHERE LOWER(TRIM(korean_name))=LOWER(TRIM(?)) OR LOWER(TRIM(english_name))=LOWER(TRIM(?)) LIMIT 1`
      ).bind(actor.name, actor.name).first<any>();

      if (method === 'GET') {
        return json({ ok: true, found: !!myProfile, mbti: myProfile?.mbti || null, name: myProfile?.korean_name || myProfile?.english_name || actor.name });
      }
      if (method === 'POST') {
        if (!myProfile) return json({ ok: false, error: 'profile_not_found', message: '내 강사 프로필을 찾을 수 없습니다. 관리자에게 문의하세요.' }, 404);
        const b = await parseJsonBody(request);
        const mbti = String((b && b.mbti) || '').toUpperCase().replace(/[^IENSTFJP]/g, '').slice(0, 4);
        if (!/^[IE][NS][TF][JP]$/.test(mbti)) {
          return json({ ok: false, error: 'invalid_mbti', message: 'MBTI 4글자를 확인하세요 (예: INTJ).' }, 400);
        }
        const now = Date.now();
        const hobby = (b && b.hobby) ? String(b.hobby).slice(0, 300) : null;
        const style = (b && b.teaching_style) ? String(b.teaching_style).slice(0, 300) : null;
        // 1) 내 프로필에 기록
        await env.DB.prepare(`UPDATE teacher_profiles SET mbti = ?, updated_at = ? WHERE id = ?`).bind(mbti, now, myProfile.id).run();
        // 2) 매칭 그래프 소스(teacher_mbti) 동기화 — 없으면 생성. hobby/style 은 있을 때만 덮어씀.
        try {
          await env.DB.exec(`CREATE TABLE IF NOT EXISTS teacher_mbti (teacher_uid TEXT PRIMARY KEY, teacher_name TEXT, mbti TEXT, hobby TEXT, teaching_style TEXT, intro TEXT, updated_at INTEGER);`);
          await env.DB.prepare(
            `INSERT INTO teacher_mbti (teacher_uid, teacher_name, mbti, hobby, teaching_style, updated_at) VALUES (?,?,?,?,?,?)
             ON CONFLICT(teacher_uid) DO UPDATE SET teacher_name=excluded.teacher_name, mbti=excluded.mbti,
               hobby=COALESCE(excluded.hobby, teacher_mbti.hobby),
               teaching_style=COALESCE(excluded.teaching_style, teacher_mbti.teaching_style),
               updated_at=excluded.updated_at`
          ).bind('tp-' + myProfile.id, myProfile.korean_name || myProfile.english_name || actor.name, mbti, hobby, style, now).run();
        } catch (e: any) { console.warn('[teacher mbti-self] graph sync skipped:', e?.message || e); }
        return json({ ok: true, mbti, teacher_id: myProfile.id, name: myProfile.korean_name || myProfile.english_name });
      }
      return json({ ok: false, error: 'method_not_allowed' }, 405);
    }

    // 강사 목록
    /* 🔗 (2026-08-08) 강사 ↔ 로그인 아이디 연결
       왜 필요한가 — 출근/지각을 계산하려면 «출석 기록의 로그인 계정» 과 «강사» 를 이어야 한다.
       라이브 실측: teacher_account_links 0행, teachers 29명 중 user_id 보유 7명,
       최근 30일 출석 4,954행 중 강사와 매칭되는 행 0건. 이 연결이 없으면 근태는 계산 불가.
       ⚠️ 자동 매칭은 «하지 않는다». teacher_legacy_accounts.teacher_name 은 아이디를 그대로
          복사한 값(mangoi_006)이라 이름 근거가 전혀 없다. 추측으로 이으면 엉뚱한 사람의
          근태·급여가 된다. 사람이 화면에서 고른 것만 저장한다.
       경로를 '/api/admin/teachers/…' 로 지은 이유: api-mango 게이트의
       startsWith('/api/admin/teachers') 에 이미 걸려 라우팅 추가가 최소로 끝난다. */
    if (method === 'GET' && path === '/api/admin/teachers/links') {
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS teacher_account_links (username TEXT PRIMARY KEY, teacher_id TEXT NOT NULL, teacher_name TEXT, linked_by TEXT, linked_at INTEGER)`);
      } catch {}
      /* ⛔ 퇴사자(active=0)를 여기서 걸러 내지 말 것 — 화면(adm-teacher-links.js)이 기본으로
         숨기고 「퇴사 강사도 보기」로 되돌릴 수 있게 해 두었다. 서버가 미리 지우면 그 체크박스가
         조용히 무동작이 되고, 이미 퇴사자에게 이어진 계정이 「연결 안 됨」으로 보인다. */
      const tRs = await env.DB.prepare(`SELECT id, name, active FROM teachers ORDER BY active DESC, name ASC`).all();
      const aRs = await env.DB.prepare(
        `SELECT username, last_login_at FROM teacher_legacy_accounts ORDER BY last_login_at DESC`
      ).all();
      const lRs = await env.DB.prepare(
        `SELECT username, teacher_id, teacher_name, linked_by, linked_at FROM teacher_account_links`
      ).all();
      return json({
        ok: true,
        teachers: (tRs.results || []),
        accounts: (aRs.results || []),
        links: (lRs.results || []),
      });
    }

    // 연결 저장 / 해제 — { username, teacher_id }  (teacher_id 가 비면 해제)
    if (method === 'POST' && path === '/api/admin/teachers/links') {
      const _lkActor = await getAdminActor(request, env as any);
      if (_lkActor.isTeacher) return json(forbiddenTeacherBody(_lkActor), 403);
      /* ⛔ 지사·대리점도 막는다 — 강사↔계정 연결은 전국 강사 근태·급여 계산의 근거라
         스코프 없이 아무 지사·대리점이나 바꾸면 남의 강사 근태가 뒤틀린다. */
      if (isOrgScopedRole(_lkActor.role)) {
        return json({ ok: false, error: 'forbidden_scope', message: '본사 계정만 강사 연결을 바꿀 수 있습니다.' }, 403);
      }
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS teacher_account_links (username TEXT PRIMARY KEY, teacher_id TEXT NOT NULL, teacher_name TEXT, linked_by TEXT, linked_at INTEGER)`);
      } catch {}
      const b: any = await request.json().catch(() => null);
      const username = String(b?.username || '').trim();
      const teacherId = String(b?.teacher_id ?? '').trim();
      if (!username) return json({ ok: false, error: 'username_required' }, 400);

      if (!teacherId) {
        await env.DB.prepare(`DELETE FROM teacher_account_links WHERE username = ?`).bind(username).run();
        return json({ ok: true, unlinked: true, username });
      }
      // 존재하는 강사인지 확인 — 오타로 유령 id 가 박히면 조용히 틀린 근태가 된다
      const t = await env.DB.prepare(`SELECT id, name FROM teachers WHERE CAST(id AS TEXT) = ? LIMIT 1`)
        .bind(teacherId).first<any>();
      if (!t) return json({ ok: false, error: 'teacher_not_found', teacher_id: teacherId }, 400);

      await env.DB.prepare(
        `INSERT INTO teacher_account_links (username, teacher_id, teacher_name, linked_by, linked_at)
         VALUES (?,?,?,?,?)
         ON CONFLICT(username) DO UPDATE SET teacher_id=excluded.teacher_id,
           teacher_name=excluded.teacher_name, linked_by=excluded.linked_by, linked_at=excluded.linked_at`
      ).bind(username, String(t.id), t.name || null, _lkActor?.username || _lkActor?.role || 'admin', Date.now()).run();
      return json({ ok: true, username, teacher_id: String(t.id), teacher_name: t.name });
    }

    if (method === 'GET' && path === '/api/admin/teachers') {
      await ensurePayrollSchema(env);
      const includeInactive = url.searchParams.get('include_inactive') === '1';
      const sql = includeInactive
        ? `SELECT * FROM teachers ORDER BY active DESC, name ASC`
        : `SELECT * FROM teachers WHERE active = 1 ORDER BY name ASC`;
      const rs = await env.DB.prepare(sql).all();
      let teacherRows = (rs.results || []) as any[];
      // 🔐 강사·지사·대리점 로그인 시엔 급여단가·계좌 등 민감 칼럼을 제거해서 내려준다(스케줄용 이름·id 는 유지).
      // ⛔ isTeacher 만 보던 것을 isOrgScopedRole 까지 넓힘 — 지사·대리점 계정에 admin.html 을 열어 줄 때
      //    이 칸이 안 가려지면 전국 강사 급여·계좌번호가 그대로 새 나간다(회계관리 제외 원칙 위반).
      const _tlActor = await getAdminActor(request, env as any);
      if (_tlActor.isTeacher || isOrgScopedRole(_tlActor.role)) {
        const _hide = ['rate_per_10min_php','fee_per_10min','bank_account','bank_name','salary','monthly_salary','monthly_salary_php','pay_php','account_no'];
        teacherRows = teacherRows.map(r => { const o = { ...r }; for (const k of _hide) delete o[k]; return o; });
      }
      /* 🏠/🏢 (2026-10-07 사장님 「담당 강사 옆에 전체·홈·사무실 칸」) 근무지 — 화면이 거르는 데 쓴다.
         ⚠️ 정본은 teachers.status 가 아니라 강사 명부 teacher_profiles.group_name 이다
            (2026-10-07 D1 실측: CHAINE·KRYSTEL·WIN 은 status='office' 인데 명부는 Home-based,
             LEN 은 반대 — 명부 화면·녹화 목록이 이미 group_name 으로 판정한다. 같은 규칙 workplaceOf).
         ⛔ 원부 번호(linked_teacher_id)로만 잇고, 프로필이 둘 이상인데 서로 다르면 '' (모름) — 지어내지 않는다.
         ⚠️ 이 조회가 실패해도 목록은 그대로 — workplace 만 '' 로 남는다(화면은 «전체» 에서만 보인다). */
      try {
        const _wpRs = await env.DB.prepare(
          `SELECT linked_teacher_id, group_name FROM teacher_profiles WHERE linked_teacher_id IS NOT NULL ORDER BY id DESC`
        ).all();
        const _wpBy = new Map<string, 'home' | 'office' | ''>();
        for (const p of ((_wpRs.results || []) as any[])) {
          const k = String(p.linked_teacher_id);
          const w = workplaceOf(p.group_name);
          if (!_wpBy.has(k)) _wpBy.set(k, w);
          else if (_wpBy.get(k) !== w) _wpBy.set(k, '');
        }
        teacherRows = teacherRows.map(r => ({ ...r, workplace: _wpBy.get(String(r.id)) || '' }));
      } catch (e: any) {
        console.error('[teachers] 근무지 조회 실패(목록은 그대로):', e?.message || e);
        teacherRows = teacherRows.map(r => ({ ...r, workplace: '' }));
      }
      // items/teachers/data 별칭 모두 제공(프론트 호환: weekly-schedule.html 등)
      return json({ ok: true, items: teacherRows, teachers: teacherRows, data: teacherRows });
    }

    // 강사 등록 (새 모델: name + status + years + rate_per_10min_php)
    if (method === 'POST' && path === '/api/admin/teachers') {
      const _tnActor = await getAdminActor(request, env as any);
      if (_tnActor.isTeacher) return json(forbiddenTeacherBody(_tnActor, '강사는 강사를 등록할 수 없습니다.'), 403);
      /* ⛔ 지사·대리점도 막는다 — 급여단가(rate_per_10min_php)를 실어 등록하는 조작이라
         회계관리 예외 그대로다(GET 은 열되 이 쓰기는 계속 막음). canEditOrg() 는 'none'(교사)
         에도 true 라 못 막으니 isOrgScopedRole 로 따로 막는다. */
      if (isOrgScopedRole(_tnActor.role)) {
        return json({ ok: false, error: 'forbidden_scope', message: '본사 계정만 강사를 등록할 수 있습니다.' }, 403);
      }
      await ensurePayrollSchema(env);
      const b = await parseJsonBody(request);
      if (!b || !b.name || !b.status || b.rate_per_10min_php == null) {
        return invalidBody(['name', 'status', 'rate_per_10min_php']);
      }
      if (!VALID_TEACHER_STATUS.includes(b.status)) {
        return json({ ok: false, error: 'invalid_status', allowed: VALID_TEACHER_STATUS }, 400);
      }
      const rate = Number(b.rate_per_10min_php);
      if (isNaN(rate) || rate < 0) return json({ ok: false, error: 'invalid_rate' }, 400);
      const now = Date.now();
      const res = await env.DB.prepare(
        `INSERT INTO teachers (user_id, name, center_id, status, years, rate_per_10min_php, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`
      ).bind(
        b.user_id || null, b.name, b.center_id || null,
        b.status, b.years != null ? Number(b.years) : null, rate,
        now, now
      ).run();
      return json({ ok: true, id: res.meta.last_row_id });
    }

    // 강사 수정 (부분 업데이트 — 모든 필드 선택적)
    if (method === 'PATCH' && /^\/api\/admin\/teachers\/\d+$/.test(path)) {
      const _tuActor = await getAdminActor(request, env as any);
      if (_tuActor.isTeacher) return json(forbiddenTeacherBody(_tuActor, '강사는 강사 정보를 수정할 수 없습니다.'), 403);
      /* ⛔ 지사·대리점도 막는다 — rate_per_10min_php(급여단가)를 스코프 없이 전국 아무 강사나
         고칠 수 있는 조작이다(회계관리 제외 원칙). GET(명부 조회, 급여칸 가림)은 열되 이 쓰기는
         계속 막는다 — canEditOrg() 는 'none'(교사)에도 true 라 여기 못 쓴다. */
      if (isOrgScopedRole(_tuActor.role)) {
        return json({ ok: false, error: 'forbidden_scope', message: '본사 계정만 강사 정보를 수정할 수 있습니다.' }, 403);
      }
      await ensurePayrollSchema(env);
      const m = path.match(/^\/api\/admin\/teachers\/(\d+)$/);
      const id = m ? parseInt(m[1], 10) : 0;
      if (!id) return invalidBody(['id(path)']);
      const b = await parseJsonBody(request);
      if (!b) return invalidBody(['<any field>']);
      if (b.status && !VALID_TEACHER_STATUS.includes(b.status)) {
        return json({ ok: false, error: 'invalid_status', allowed: VALID_TEACHER_STATUS }, 400);
      }
      const sets: string[] = [];
      const binds: any[] = [];
      if (b.name !== undefined)               { sets.push('name = ?');               binds.push(b.name); }
      if (b.status !== undefined)             { sets.push('status = ?');             binds.push(b.status); }
      if (b.years !== undefined)              { sets.push('years = ?');              binds.push(b.years); }
      if (b.rate_per_10min_php !== undefined) { sets.push('rate_per_10min_php = ?'); binds.push(b.rate_per_10min_php); }
      if (b.center_id !== undefined)          { sets.push('center_id = ?');          binds.push(b.center_id); }
      if (b.active !== undefined)             { sets.push('active = ?');             binds.push(b.active ? 1 : 0); }
      if (sets.length === 0) return json({ ok: false, error: 'nothing_to_update' }, 400);
      sets.push('updated_at = ?'); binds.push(Date.now());
      binds.push(id);
      await env.DB.prepare(`UPDATE teachers SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
      return json({ ok: true, id });
    }

    // 월별 수업 수 입력 (20분 단위 수업 횟수)
    if (method === 'PUT' && path === '/api/admin/teacher-classes') {
      const _tcActor = await getAdminActor(request, env as any);
      if (_tcActor.isTeacher) return json(forbiddenTeacherBody(_tcActor, '강사는 수업 수를 입력할 수 없습니다.'), 403);
      await ensurePayrollSchema(env);
      const b = await parseJsonBody(request);
      if (!b || !b.teacher_id || !b.year || !b.month || b.class_count == null) {
        return invalidBody(['teacher_id', 'year', 'month', 'class_count']);
      }
      const now = Date.now();
      // 🕐 (2026-08-17) 길이가 섞이면 «수업 횟수» 만으로는 급여를 못 낸다.
      //   total_minutes(그 달에 실제로 가르친 분 합계)를 함께 받으면 그것으로 계산한다.
      //   안 보내면 예전대로 «전부 20분» 으로 본다 — 기존 호출부가 그대로 돌아간다.
      const _tcCount = Math.max(0, parseInt(b.class_count, 10) || 0);
      const _tcMinutes = Number(b.total_minutes);
      const _tcUnits = _tcMinutes > 0
        ? Math.round(classTenMinUnits(_tcMinutes) * 100) / 100    // 분 → 10분 토막
        : null;
      await env.DB.prepare(
        `INSERT INTO teacher_monthly_classes (teacher_id, year, month, class_count, total_10min_units, notes, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(teacher_id, year, month) DO UPDATE SET
           class_count = excluded.class_count,
           -- ⚠️ COALESCE 필수 — total_minutes 없이 «수업 수만» 다시 저장하는 호출이
           --   기존 길이 합계를 NULL 로 지우면, 급여가 조용히 «전부 20분» 으로 되돌아간다
           total_10min_units = COALESCE(excluded.total_10min_units, teacher_monthly_classes.total_10min_units),
           notes = excluded.notes, updated_at = excluded.updated_at`
      ).bind(b.teacher_id, b.year, b.month, _tcCount, _tcUnits, b.notes || null, now).run();
      return json({ ok: true, class_count: _tcCount, total_10min_units: _tcUnits });
    }

    // 월별 평가 입력 (5개 카테고리 점수 + 코멘트)
    if (method === 'PUT' && path === '/api/admin/teacher-evaluation') {
      const _teActor = await getAdminActor(request, env as any);
      if (_teActor.isTeacher) return json(forbiddenTeacherBody(_teActor, '강사는 평가를 입력할 수 없습니다.'), 403);
      await ensurePayrollSchema(env);
      const b = await parseJsonBody(request);
      if (!b || !b.teacher_id || !b.year || !b.month) return invalidBody(['teacher_id', 'year', 'month']);
      // 점수 범위 검증 (1~5, 빈 칸 허용)
      const fields = ['score_instruction', 'score_retention', 'score_punctuality', 'score_admin', 'score_contribution'] as const;
      const vals: Record<string, number | null> = {};
      for (const f of fields) {
        if (b[f] == null || b[f] === '') { vals[f] = null; continue; }
        const v = Number(b[f]);
        if (isNaN(v) || v < 1 || v > 5) return json({ ok: false, error: 'invalid_score', field: f, allowed: '1.0~5.0' }, 400);
        vals[f] = Math.round(v * 10) / 10;
      }
      const weighted = calcWeightedTotal(vals as any);
      const grade = weighted != null ? classifyEvalGrade(weighted) : null;
      const now = Date.now();
      await env.DB.prepare(
        `INSERT INTO teacher_evaluations
           (teacher_id, year, month, score_instruction, score_retention, score_punctuality,
            score_admin, score_contribution, weighted_total, grade,
            strengths, improvements, evaluator, evaluated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(teacher_id, year, month) DO UPDATE SET
           score_instruction  = excluded.score_instruction,
           score_retention    = excluded.score_retention,
           score_punctuality  = excluded.score_punctuality,
           score_admin        = excluded.score_admin,
           score_contribution = excluded.score_contribution,
           weighted_total     = excluded.weighted_total,
           grade              = excluded.grade,
           strengths          = excluded.strengths,
           improvements       = excluded.improvements,
           evaluator          = excluded.evaluator,
           evaluated_at       = excluded.evaluated_at`
      ).bind(
        b.teacher_id, b.year, b.month,
        vals.score_instruction, vals.score_retention, vals.score_punctuality,
        vals.score_admin, vals.score_contribution, weighted, grade,
        b.strengths || null, b.improvements || null, b.evaluator || 'admin', now
      ).run();
      return json({ ok: true, weighted_total: weighted, grade });
    }
  return null;
}
