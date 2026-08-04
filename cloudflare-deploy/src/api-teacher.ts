// ────────────────────────────────────────────────────────────────────────────
// 🇵🇭 강사 전용 초경량 포털 API — /api/teacher/portal
//
// 왜 별도 파일인가:
//   · admin.html/mypage.html 은 화면 하나를 그리는 데 API 를 6~8번 호출한다.
//     한국 사무실에서는 안 보이지만, 필리핀 모바일 회선(RTT 300~600ms, 패킷손실)에서는
//     그 왕복 수가 그대로 체감 지연이 된다. 이 엔드포인트는 첫 화면에 필요한 전부를
//     **한 번의 요청**으로 내려주는 것이 유일한 존재 이유다.
//   · api-admin.ts(8,400줄)는 공동작업 충돌 반경이 커서 건드리지 않는다(CLAUDE.md 4-2).
//
// 보안:
//   · index.ts 의 세션 미들웨어가 이미 인증을 강제한다(isAdminPath 에 /api/teacher/ 등록).
//   · 여기서 한 번 더 **강사 본인 것만** 보게 막는다 — 쿼리스트링으로 teacher_name 을
//     받지 않는다. 신원은 오직 쿠키 세션에서만 나온다(타 강사 스케줄 열람 차단).
//
// 성능 원칙:
//   · 무거운 계산(월간 급여·공제 = computeLessonFeeMonth)은 **여기 넣지 않는다.**
//     첫 화면(오늘 수업)의 렌더를 막으면 안 되므로 페이지가 나중에 따로 부른다.
// ────────────────────────────────────────────────────────────────────────────

import { getAdminActor } from './auth-admin';
// 🎚️ 학생 읽기 밴드(판단력 훈련) — KV 1회 조회. 수업 전에 강사가 "이 아이가 지금
//    어느 정도 문장을 읽나"를 알 수 있게 오늘 수업 목록에 얹는다.
import { getReadingBandFor } from './api-judgment';

interface TeacherEnv {
  DB: D1Database;
  [k: string]: any;
}

const json = (data: any, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

// 🗓️ 요일 표기 관용 파서 — 저장 형식이 한 가지가 아니다.
//   숫자 '5' / 콤마목록 '1,3' / 영문 'Mon'(캘린더 드래그 PATCH) / 한글 '월'.
//   ⚠️ api-mango.ts 의 sessions/today 와 **같은 규칙**이어야 한다. 여기만 좁으면
//      강사 화면에는 수업이 안 보이는데 학생 화면에는 보이는 엇갈림이 생긴다.
const DOW_MAP: Record<string, number> = {
  sun: 0, sunday: 0, '일': 0, '일요일': 0, mon: 1, monday: 1, '월': 1, '월요일': 1,
  tue: 2, tuesday: 2, '화': 2, '화요일': 2, wed: 3, wednesday: 3, '수': 3, '수요일': 3,
  thu: 4, thursday: 4, '목': 4, '목요일': 4, fri: 5, friday: 5, '금': 5, '금요일': 5,
  sat: 6, saturday: 6, '토': 6, '토요일': 6,
};
function dowMatches(raw: any, target: number): boolean {
  for (const p of String(raw ?? '').split(/[,\s/·]+/)) {
    const t = p.trim();
    if (!t) continue;
    if (/^\d+$/.test(t) && Number(t) === target) return true;
    const k = DOW_MAP[t.toLowerCase()];
    if (k !== undefined && k === target) return true;
  }
  return false;
}

export async function handleTeacherApi(
  request: Request,
  url: URL,
  env: TeacherEnv
): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;

  if (path !== '/api/teacher/portal' || method !== 'GET') return null;

  // ── 신원: 쿠키 세션에서만 (클라이언트가 보내는 값은 일절 신뢰하지 않는다) ──
  const actor = await getAdminActor(request, env as any);
  if (!actor.ok) return json({ ok: false, error: 'auth_required' }, 401);

  // 🇵🇭 (2026-08-05) 본사 매니저도 이 화면을 쓴다. 필리핀 매니저(Melca·Maimai·Karl)는
  //   수업을 하지 않고 관리·IT 업무를 하지만, 하루 종일 붙잡고 있을 가벼운 화면이
  //   하나도 없어서 1MB 관리자 화면에 갇혀 있었다. 아주 급할 때 커버 수업도 한다.
  //   ⚠️ 매니저는 배정 수업이 0건이라 그대로 열면 빈 화면이 된다 → 아래에서 manager 블록을
  //      따로 실어 보낸다(오늘 전체 수업·노쇼). 커버 수업이 잡힌 날은 classes 에 그냥 뜬다
  //      (teachers 에 MELCA·MAIMAI·KARL 행이 있고, 아래 이름 매칭이 그것을 잡는다).
  const isManager = !actor.isTeacher && (actor.role === 'hq' || actor.role === 'staff');
  if (!actor.isTeacher && !isManager) {
    return json({
      ok: false, error: 'not_a_teacher',
      message: '강사 또는 본사 계정만 사용할 수 있는 화면입니다.',
      message_en: 'This page is for teacher or head-office accounts only.',
    }, 403);
  }

  const now = Date.now();
  const KST = 9 * 3600 * 1000;
  const k = new Date(now + KST);
  const kY = k.getUTCFullYear(), kMo = k.getUTCMonth(), kD = k.getUTCDate();
  const kDow = k.getUTCDay();
  const pad = (n: number) => String(n).padStart(2, '0');
  const ymd = `${kY}${pad(kMo + 1)}${pad(kD)}`;
  const todayStr = `${kY}-${pad(kMo + 1)}-${pad(kD)}`;

  // ── 담당 예약 조회 조건 ────────────────────────────────────────────────
  //   teacher_id 는 운영 DB 에서 TEXT("28") 이고, 계정 username 이 그대로 들어간 행도 있다.
  //   그래서 (a) username (b) teachers.name 부분일치로 얻은 id 들을 모두 OR 로 건다.
  //   ⚠️ 부분일치는 api-mango 의 sessions/today 와 동일한 사유 — 계정명('강선생님')과
  //      teachers.name('중국어 강선생님') 표기가 달라 완전일치면 매칭이 통째로 깨진다.
  const conds: string[] = [];
  const binds: any[] = [];
  if (actor.username) { conds.push('cs.teacher_id = ?'); binds.push(actor.username); }
  const tname = String(actor.name || '').trim();

  // ⚡ 서로 의존하지 않는 조회는 **한꺼번에** 던진다.
  //   예전엔 강사ID조회 → 예약 → 공지 → 자료 → 평점 을 하나씩 await 해서 D1 왕복이
  //   그대로 5번 쌓였다(필리핀처럼 지연이 큰 회선일수록 그대로 대기시간이 된다).
  //   지금은 [강사ID·공지·자료·평점]을 동시에 → 예약 1회. 왕복 5회가 2회로 줄었다.
  //   ⚠️ 예약(class_schedules)만은 강사ID 결과가 있어야 조건을 만들 수 있어 뒤에 남는다.
  //   ⚠️ 개별 실패가 화면 전체를 죽이지 않도록 각각 catch 로 빈 값을 준다(첫 화면 우선).
  const empty = { results: [] as any[] };
  const [tidRs, noticeRs, resourceRs, ratingRow] = await Promise.all([
    tname
      ? env.DB.prepare(
          `SELECT CAST(id AS TEXT) AS tid FROM teachers
            WHERE name = ? OR name LIKE ('%' || ? || '%') OR (length(name) > 0 AND ? LIKE ('%' || name || '%'))`
        ).bind(tname, tname, tname).all<any>()
         .catch((e) => { console.warn('[teacher-portal] teacher id lookup:', e?.message); return empty; })
      : Promise.resolve(empty),
    env.DB.prepare(
      `SELECT id, title, body, pinned, created_at FROM community_posts
        ORDER BY pinned DESC, created_at DESC LIMIT 5`
    ).all<any>().catch((e) => { console.warn('[teacher-portal] notices:', e?.message); return empty; }),
    env.DB.prepare(
      `SELECT id, name, kind, level, size_bytes FROM textbook_files
        WHERE active = 1 ORDER BY created_at DESC LIMIT 8`
    ).all<any>().catch((e) => { console.warn('[teacher-portal] resources:', e?.message); return empty; }),
    tname
      ? env.DB.prepare(
          `SELECT COUNT(*) AS n, AVG(score) AS avg FROM class_ratings
            WHERE teacher_name = ? AND created_at >= ?`
        ).bind(tname, now - 90 * 86400 * 1000).first<any>()
         .catch((e) => { console.warn('[teacher-portal] rating:', e?.message); return null; })
      : Promise.resolve(null),
  ]);

  for (const x of (tidRs.results || [])) { if (x.tid) { conds.push('cs.teacher_id = ?'); binds.push(x.tid); } }

  const classes: any[] = [];
  if (conds.length) {
    const whereSql = `cs.status != 'cancelled' AND (${conds.join(' OR ')})`;
    // 교재·레벨은 students_erp 에서 — 스키마 드리프트가 있는 테이블이라 실패하면 조인 없이 재시도.
    const sqlJoin =
      `SELECT cs.id, cs.user_id, cs.student_name, cs.day_of_week, cs.scheduled_date, cs.start_time,
              cs.duration_min, cs.notes, se.level AS level, se.textbook AS textbook,
              se.english_name AS student_en
         FROM class_schedules cs
         LEFT JOIN students_erp se ON se.user_id = cs.user_id
        WHERE ${whereSql}`;
    const sqlPlain =
      `SELECT cs.id, cs.user_id, cs.student_name, cs.day_of_week, cs.scheduled_date, cs.start_time,
              cs.duration_min, cs.notes
         FROM class_schedules cs WHERE ${whereSql}`;
    let rows: any;
    try { rows = await env.DB.prepare(sqlJoin).bind(...binds).all<any>(); }
    catch { try { rows = await env.DB.prepare(sqlPlain).bind(...binds).all<any>(); } catch { rows = { results: [] }; } }

    // ⏰ 입장 시간창 — 학생이 보는 /api/class/sessions/today 와 **같은 값**이어야 한다.
    //   (2026-08-02) 예전엔 값이 셋으로 갈라져 있었다:
    //     학생 API 10분 / 강사 마이페이지 30분 / 이 화면 5분.
    //   그래서 같은 수업인데 한 화면은 문이 열려 있고 다른 화면은 닫혀 있었다.
    //   → 10분으로 통일. 강사와 학생의 문이 **같은 순간**에 열려야
    //     "나는 들어와 있는데 상대가 없다" 가 안 생긴다. 마이페이지의 30분 버튼은 제거했다.
    //   ⚠️ 이 값을 바꾸려면 api-mango.ts 의 OPEN_BEFORE 도 같이 바꿀 것. 한쪽만 바꾸면 다시 어긋난다.
    const OPEN_BEFORE = 10 * 60 * 1000;
    const LATE_AFTER = 15 * 60 * 1000;   // 종료 15분 후까지 지각 입장 허용
    const seen = new Set<number>();
    for (const s of (rows.results || [])) {
      if (seen.has(s.id)) continue;
      let occurs = false;
      if (s.scheduled_date) occurs = (s.scheduled_date === todayStr);
      else if (s.day_of_week != null && s.day_of_week !== '') occurs = dowMatches(s.day_of_week, kDow);
      if (!occurs) continue;
      seen.add(s.id);

      const [hh, mm] = String(s.start_time || '00:00').split(':').map((x: string) => Number(x));
      const start_ts = Date.UTC(kY, kMo, kD, hh || 0, mm || 0, 0) - KST; // KST 벽시계 → UTC ms
      const dur = Number(s.duration_min) || 30;
      const end_ts = start_ts + dur * 60000;
      const open_at_ts = start_ts - OPEN_BEFORE;
      const close_at_ts = end_ts + LATE_AFTER;
      let status: string;
      if (now < open_at_ts) status = 'early';
      else if (now < start_ts) status = 'open';
      else if (now <= close_at_ts) status = 'live';
      else status = 'done';

      // 🏷️ 이 행이 '진짜 망고아이 수업'인지 판정한다.
      //   실측(2026-08-03) 활성 662행 중 진짜 수업은 4행뿐이고 나머지는 학생이 안 붙어 있다:
      //     · user_id='lms'       (518행, notes='LMS 수업중', source=lms_import_w26)
      //         → 강사가 **옛 LMS 에서 수업 중인 시간**을 표시한 점유 슬롯. 망고아이 수업이 아니다.
      //     · user_id='type_seed' (140행, source=type_seed_20260623) → 6월 시연용 시드 데이터.
      //   이 행들에는 학생이 없어서 학생 화면(/api/class/sessions/today)에도 절대 뜨지 않는다.
      //   그런데 강사 화면에서 [수업 입장] 을 주면 **아무도 없는 방**에 들어가게 된다.
      //   → 지우거나 숨기지 않고(운영 판단 영역), 정체를 밝히고 입장 버튼만 뺀다.
      const _uid = String(s.user_id || '').toLowerCase();
      const kind = _uid === 'lms' ? 'lms' : (_uid === 'type_seed' ? 'sample' : 'class');

      classes.push({
        kind,
        schedule_id: s.id,
        // 🔑 결정론적 방 번호 — api-mango.ts 의 sessions/today 와 **반드시 같은 식**.
        //    다르면 강사와 학생이 서로 다른 방에 들어가 수업이 성립하지 않는다.
        room_id: `class-${s.id}-${ymd}`,
        student_uid: s.user_id,
        student_name: s.student_name || s.student_en || null,
        // 🌐 학생 이름은 **번역하지 않는다** — 사람 이름을 기계번역하면 엉뚱한 말이 된다.
        //   대신 학생 원부에 이미 있는 영문명을 그대로 내려주고, 영어 화면이면 이걸 쓴다.
        //   (필리핀 강사가 '정우영' 을 읽지 못해 학생을 부르지 못하던 문제)
        student_name_en: s.student_en || null,
        level: s.level || null,
        textbook: s.textbook || null,
        note: s.notes || null,
        start_time: `${pad(hh || 0)}:${pad(mm || 0)}`,
        start_ts, end_ts, open_at_ts, close_at_ts,
        duration_min: dur,
        status,
        join_open: now >= open_at_ts && now <= close_at_ts,
      });
    }
    classes.sort((a, b) => a.start_ts - b.start_ts);

    // 🎚️ 오늘 수업 학생들의 읽기 밴드 — 학생 수만큼 KV 조회(보통 5~10건, 병렬).
    //   · D1 조회가 아니라 KV 라 이 파일의 '한 번의 요청' 원칙을 깨지 않는다.
    //   · 판단력 훈련을 한 번도 안 한 학생은 값이 없어 아무것도 안 붙는다
    //     (없는 값을 기본값으로 채워 보여주면 강사가 "이 아이는 초급이구나" 하고 오해한다).
    //   · 실패해도 포털 전체를 막지 않는다.
    try {
      const uids = [...new Set(classes.map((c) => String(c.student_uid || '')).filter(Boolean))];
      const found = new Map<string, any>();
      await Promise.all(uids.map(async (u) => {
        try { const b = await getReadingBandFor(env as any, u); if (b) found.set(u, b); } catch { /* 학생 1명 실패는 무시 */ }
      }));
      for (const c of classes) {
        const b = found.get(String(c.student_uid || ''));
        if (!b) continue;
        c.reading_band = b.band;
        c.reading_band_ko = b.name_ko;
        c.reading_band_en = b.name_en;
        c.reading_band_lv = b.lv;
      }
    } catch { /* 밴드 조회 실패가 오늘 수업 표시를 막지 않는다 */ }
  }

  // ── 🧑‍💼 매니저 전용 블록 (강사에게는 조회 자체를 안 한다 = 강사 화면은 1바이트도 안 무거워짐) ──
  //   매니저가 하루 종일 확인하는 것 두 가지만 담는다: 오늘 수업이 도는가 · 사고가 났는가.
  //   차트·집계 없음. 숫자와 목록뿐이라 응답이 몇 KB 를 넘지 않는다.
  let manager: any = null;
  if (isManager) {
    const dayStartMs = Date.UTC(kY, kMo, kD, 0, 0, 0) - KST;   // 오늘 00:00 KST 를 UTC ms 로
    const OPEN_BEFORE = 10 * 60 * 1000, LATE_AFTER = 15 * 60 * 1000;
    const [allRs, nsRs] = await Promise.all([
      env.DB.prepare(
        `SELECT cs.id, cs.user_id, cs.student_name, cs.day_of_week, cs.scheduled_date,
                cs.start_time, cs.duration_min, cs.teacher_id, t.name AS teacher_name
           FROM class_schedules cs
           LEFT JOIN teachers t ON CAST(t.id AS TEXT) = cs.teacher_id
          WHERE cs.status != 'cancelled' AND cs.user_id NOT IN ('lms','type_seed')`
      ).all<any>().catch((e) => { console.warn('[teacher-portal] mgr classes:', e?.message); return empty; }),
      env.DB.prepare(
        `SELECT id, missing_role, student_name, teacher_name, waited_min, created_at
           FROM class_no_show WHERE created_at >= ? ORDER BY created_at DESC LIMIT 20`
      ).bind(dayStartMs).all<any>()
       .catch((e) => { console.warn('[teacher-portal] mgr no-show:', e?.message); return empty; }),
    ]);

    const today: any[] = [];
    for (const s of (allRs.results || [])) {
      const occurs = s.scheduled_date
        ? (s.scheduled_date === todayStr)
        : (s.day_of_week != null && s.day_of_week !== '' && dowMatches(s.day_of_week, kDow));
      if (!occurs) continue;
      const [hh, mm] = String(s.start_time || '00:00').split(':').map((x: string) => Number(x));
      const start_ts = Date.UTC(kY, kMo, kD, hh || 0, mm || 0, 0) - KST;
      const end_ts = start_ts + (Number(s.duration_min) || 30) * 60000;
      today.push({
        schedule_id: s.id,
        start_time: `${pad(hh || 0)}:${pad(mm || 0)}`,
        start_ts, end_ts,
        teacher_name: s.teacher_name || s.teacher_id || null,
        student_name: s.student_name || null,
        live: (now >= start_ts - OPEN_BEFORE && now <= end_ts + LATE_AFTER),
        done: (now > end_ts + LATE_AFTER),
      });
    }
    today.sort((a, b) => a.start_ts - b.start_ts);

    manager = {
      total: today.length,
      live: today.filter((c) => c.live && !c.done).length,
      upcoming: today.filter((c) => now < c.start_ts - OPEN_BEFORE).length,
      done: today.filter((c) => c.done).length,
      // 지금 도는 것과 다음에 올 것만 — 전체 목록을 다 내리면 매니저도 눈으로 훑어야 한다.
      now_list: today.filter((c) => c.live && !c.done).slice(0, 12),
      next_list: today.filter((c) => now < c.start_ts - OPEN_BEFORE).slice(0, 8),
      no_shows: (nsRs.results || []).map((n: any) => ({
        id: n.id, missing_role: n.missing_role, student_name: n.student_name,
        teacher_name: n.teacher_name, waited_min: n.waited_min, created_at: n.created_at,
      })),
    };
  }

  // ── 위 Promise.all 결과를 화면용 모양으로 정리 (여기서는 DB 접근 없음) ──
  const notices = (noticeRs.results || []).map((n: any) => ({
    id: n.id, title: n.title, pinned: !!n.pinned, created_at: n.created_at,
    // 본문은 목록에서 미리보기만 — 전문을 다 실으면 첫 화면 응답이 무거워진다.
    excerpt: String(n.body || '').replace(/\s+/g, ' ').slice(0, 140),
  }));

  const resources = (resourceRs.results || []).map((f: any) => ({
    id: f.id, name: f.name, kind: f.kind, level: f.level, size_bytes: f.size_bytes,
    url: `/api/textbook-files/${f.id}/raw`,
  }));

  // 내 평점 (무기명 — 강사에게 학생 신원은 절대 노출하지 않는다)
  const _rn = Number((ratingRow as any)?.n || 0);
  const rating = {
    avg: _rn ? Math.round(Number((ratingRow as any).avg) * 10) / 10 : null,
    count: _rn, days: 90,
  };

  // 🌐 강사별 기본 언어 — 브라우저 저장값이 아니라 **서버가 정한다**.
  //   ⚠️ localStorage 'mangoi_lang' 에 의존하지 말 것 — 기기를 바꾸거나 누가 잘못 눌러 두면
  //      영어를 읽는 강사가 한국어 화면에 갇힌다(스스로 되돌리지 못한다).
  //
  //   🇵🇭🇺🇸 **기본은 무조건 영어.** 사장님 확인(2026-08-03):
  //      "kang 빼면 다 필리핀 교사" · "Janice 는 미국 교사".
  //      즉 강사진은 kang 한 명을 빼고 전원 영어권이다.
  //   🇰🇷 한국어는 아래 명시된 강사에게만.
  //
  //   ❗ 이름에 한글이 있는지로 '추측'하지 않는다(한때 그렇게 짰다가 되돌림).
  //      직원이 필리핀 강사 이름을 한글로 적어 두면(예: JENNY → '제니') 그 강사가
  //      읽지도 못하는 한국어 화면을 받는다. 틀렸을 때의 피해가 한쪽으로 크게 기운다:
  //        · 영어로 잘못 주면 → 한국어 하는 분은 영어도 읽고, 버튼으로 바꿀 수 있다.
  //        · 한국어로 잘못 주면 → 필리핀 강사는 버튼 글자마저 못 읽어 갇힌다.
  //      그래서 안전한 쪽(영어)을 기본값으로 두고, 예외만 적어 둔다.
  //
  //   새 한국어권 강사가 생기면 아래 목록에 아이디를 추가할 것.
  const KOREAN_SPEAKING_TEACHERS = ['hq_t_kang'];
  const _uid = String(actor.username || '').toLowerCase();
  //   🧑‍💼 매니저는 강사와 규칙이 다르다. 필리핀 매니저 계정은 `mgr_` 접두사로 만들어져 있고
  //      (mgr_melca·mgr_maimai·mgr_karl, 2026-08-05 운영 DB 확인) 전원 영어권이다.
  //      그 외 본사 계정(한국 직원)은 한국어가 기본이다.
  //      ⚠️ 이름에 한글이 있는지로 판정하면 안 된다 — 계정명이 "Melca (본사 매니저)" 라
  //         한글이 섞여 있어, 영어만 읽는 매니저가 한국어 화면에 갇힌다.
  const lang = isManager
    ? (/^mgr_/.test(_uid) ? 'en' : 'ko')
    : ((KOREAN_SPEAKING_TEACHERS.indexOf(_uid) >= 0
        // '중국어 …' 표기는 중국어 과정 담당(한국어권)에게만 붙는다 —
        // 필리핀 강사 이름에는 절대 나올 수 없어 오판 위험이 없다.
        || /중국어/.test(tname))
        ? 'ko' : 'en');

  return json({
    ok: true,
    now, today: todayStr,
    me: {
      username: actor.username, name: actor.name, role: actor.role,
      is_teacher: !isManager, is_manager: isManager, lang,
    },
    classes, notices, resources, rating,
    ...(manager ? { manager } : {}),
  });
}
