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

import { getAdminActor, PH_MANAGERS, otherAccountOf } from './auth-admin';
// 🎚️ 학생 읽기 밴드(판단력 훈련) — KV 1회 조회. 수업 전에 강사가 "이 아이가 지금
//    어느 정도 문장을 읽나"를 알 수 있게 오늘 수업 목록에 얹는다.
import { getReadingBandFor } from './api-judgment';
// 🔢 IN(...) 목록을 D1 바인드 100개 한도에 맞춰 나눈다 — 손으로 90 씩 자르지 않는다
import { selectInChunks } from './d1-chunk';
import { enrichClassesToday } from './class-today-extras';   // 📋 오늘 수업 일곱 칸(관리자·매니저와 같은 정본)
import { ensureStartsOnColumn, startsOnSel, recurStartedOn } from './class-start-date';   // 📅 매주 반복 수업의 시작일 정본
import { applyRoomOverrides } from './class-room-override';   // 🚪 「오늘은 이 방으로」 — 학생 쪽과 같은 답을 받는다

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

/* 🆔 화면에 «학생 아이디» 로 보여줄 값 — 2026-09-22 제안
     「강사 페이지에서 망고아이 수업을 늘 학생 아이디와 함께 적어 달라」.
   왜 서버가 내려주나: 강사는 같은 수업을 «옛 LMS» 에서도 본다. 두 화면을 잇는 열쇠는
   이름이 아니라 아이디다(동명이인이 실재한다 — 김민서 71명·김민준 56명).
   ⛔ 자리표시 행은 학생이 아니다 — user_id 가 'lms'·'type_seed' 인 행의 그 값을
      아이디로 내려주면 강사 화면에 「lms 라는 학생」 이 생긴다. 비워서 보낸다.
      (같은 판정이 이 파일 아래 kind 계산에도 있다 — 한쪽만 고치지 말 것)
   ⚠️ 모듈 스코프에 둔다: 아이디를 싣는 자리가 이 파일 안에 흩어져 있어(주간표·앞으로 7일·
      오늘·대타·옛LMS 미러) 핸들러 «안» 에 두면 먼 자리에서 스코프 밖이 된다(실제로 밟았다). */
const studentUidOf = (s: any): string | null => {
  const u = String(s.user_id || '').trim();
  const lo = u.toLowerCase();
  if (!u || lo === 'lms' || lo === 'type_seed') return null;
  return u;
};

export async function handleTeacherApi(
  request: Request,
  url: URL,
  env: TeacherEnv
): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;

  if (path !== '/api/teacher/portal' || method !== 'GET') return null;

  /* 🔔 `?only=next` — «다음 수업 하나» 만 돌려주는 초경량 모드 (2026-08-09)
   *
   *  [왜] 매니저 화면(manager.html)이 「곧 수업이 있어요」 배너를 띄우려면 수업 시각이
   *       필요한데, 포털 응답 전체(주간 스케줄·공지·자료·평점·매니저 블록)를 받게 하면
   *       **배너 하나 때문에 화면에서 제일 무거운 응답을 주기적으로 받는 꼴**이 된다.
   *       집에서 일하는 필리핀 매니저 회선에서는 그게 곧 «멈춤» 이다.
   *  [무엇] 신원 판정(계정→강사원부)은 **그대로 재사용**하고, 응답만 몇백 바이트로 줄인다.
   *       새 경로를 만들지 않은 이유 = 같은 판정 로직을 두 벌 두면 반드시 어긋난다
   *       (이 파일 위쪽 'Anna → HANNAH' 사고가 그 이야기다).
   *  [건너뛰는 것] 공지·자료·평점 조회(D1 3회) · 매니저 블록(D1 2회, 오늘 전체 수업 스캔)
   *       · 학생 읽기밴드(KV). 즉 D1 왕복이 5회 줄고 본문이 수십 KB → 수백 B 가 된다.
   */
  const onlyNext = url.searchParams.get('only') === 'next';

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

  /* ✍ `?part=my_evals` — «내가 쓴 일지» 카드 전용 경량 응답 (2026-08-27 마이마이 8/26 ①)
   *
   *  [왜] 강사가 쓴 일지(student_evaluations)를 되볼 화면이 없었다. 쓰기(/api/eval/create)는
   *       되는데 조회 API(/api/eval/list)는 학생 서명토큰 기준이라 강사 세션과 안 맞는다.
   *  [왜 여기] 새 경로를 만들면 index.ts 게이트에 또 등록해야 하고(빠뜨리면 조용히 죽는
   *       CLAUDE.md 함정), 신원 판정도 두 벌이 된다. `?only=next` 와 같은 이유로 같은
   *       경로에 얹는다 — 신원은 위 getAdminActor 한 벌 그대로.
   *  [매칭] teacher_uid 는 이 화면이 저장할 때 넣는 값 = 로그인 아이디(DATA.me.username)다.
   *       아이디 완전일치(NOCASE)만 쓴다 — 이름 매칭은 'Anna → HANNAH' 사고의 길이다.
   *       teacher_uid 가 비어 있는 옛 행만 이름 **완전일치** 로 보조한다.
   *  [카드는 펼칠 때만 부른다] — 이 화면의 설계 계약 4번(첫 화면 API 1회)을 지키기 위해
   *       포털 본 응답에 싣지 않고 별도 part 로 뒀다. */
  if (url.searchParams.get('part') === 'my_evals') {
    const uname = String(actor.username || '').trim();
    const aname = String(actor.name || '').trim();
    if (!uname && !aname) return json({ ok: true, items: [] });
    // 빈 값을 바인드하면 teacher_uid='' 행 · teacher_name='' 행과 맞아 남의 행이 섞인다
    // — 값이 있는 축만 조건으로 만든다.
    const ors: string[] = []; const binds: string[] = [];
    if (uname) { ors.push(`(teacher_uid = ? COLLATE NOCASE)`); binds.push(uname); }
    if (aname) { ors.push(`((teacher_uid IS NULL OR teacher_uid = '') AND teacher_name = ? COLLATE NOCASE)`); binds.push(aname); }
    // note_en/note_ko/room_id 는 강사 1분 일지(/api/eval/create)만 채우는 칸 —
    // AI 자동보고(ai-lesson-report 자동저장)·관리자 일괄평가(bulk-create) 행이
    // «내가 쓴 일지» 로 둔갑하지 않게 이 표식으로 거른다.
    const rs: any = await env.DB.prepare(
      `SELECT id, student_name, lesson_date, score_overall,
              substr(COALESCE(note_en, teacher_comment, strengths, ''), 1, 600) AS note_en,
              substr(COALESCE(note_ko, ''), 1, 600) AS note_ko,
              parent_notified, viewed_by_parent, created_at
         FROM student_evaluations
        WHERE (${ors.join(' OR ')})
          AND (note_en IS NOT NULL OR note_ko IS NOT NULL OR room_id IS NOT NULL)
        ORDER BY created_at DESC LIMIT 40`
    ).bind(...binds).all<any>().catch((e: any) => {
      console.warn('[teacher-portal] my_evals:', e?.message); return null;
    });
    // DB 실패를 «일지 없음» 으로 위장하지 않는다 — 화면의 실패 문구가 뜨게 한다.
    if (!rs) return json({ ok: false, error: 'db_error' }, 500);
    return json({ ok: true, items: rs.results || [] });
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
  //   그래서 (a) username (b) teachers.name 대조로 얻은 id 들을 OR 로 건다.
  //   ⚠️ 부분일치는 api-mango 의 sessions/today 와 동일한 사유 — 계정명('강선생님')과
  //      teachers.name('중국어 강선생님') 표기가 달라 완전일치면 매칭이 통째로 깨진다.
  //   🔴 (2026-08-06) 그런데 이 파일만 «부분일치로 걸린 사람을 전부» 담당으로 붙이고 있었다.
  //      api-mango.ts:1463 에는 «완전일치가 있으면 그쪽만» 규칙이 이미 있는데 여기만 빠져 있었다.
  //      실제 사고: 계정 `hq_t_anna`(name='Anna') → 원부에 'Anna' 는 없고
  //      **'HANNAH' 안에 'anna' 가 들어 있어**(H-ANNA-H) id 24 에 붙었다.
  //      → Anna 로 로그인하면 HANNAH 의 오늘 수업·학생 이름이 보이고 그 방에 입장까지 됐다.
  //      남의 수업이다. 이름 문자열로 사람을 정하는 이상 이 사고는 또 난다.
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
  const [tidRs, noticeRs, resourceRs, ratingRow, linkRow] = await Promise.all([
    tname
      ? env.DB.prepare(
          // exact 는 «완전일치인가»를 표시만 한다(WHERE 는 그대로) — 후보를 넓히지 않는다.
          // COLLATE NOCASE: 원부는 대문자('ANA'), 계정은 섞여 쓴다('Ana'). 대소문자 차이로
          //   완전일치를 놓치면 부분일치로 떨어져 엉뚱한 사람에게 붙는다.
          `SELECT CAST(id AS TEXT) AS tid, name, (name = ? COLLATE NOCASE) AS exact FROM teachers
            WHERE name = ? OR name LIKE ('%' || ? || '%') OR (length(name) > 0 AND ? LIKE ('%' || name || '%'))`
        ).bind(tname, tname, tname, tname).all<any>()
         .catch((e) => { console.warn('[teacher-portal] teacher id lookup:', e?.message); return empty; })
      : Promise.resolve(empty),
    // ⚡ 공지·자료·평점은 배너에 쓰이지 않는다 → `?only=next` 면 조회 자체를 안 한다.
    onlyNext ? Promise.resolve(empty) : env.DB.prepare(
      `SELECT id, title, body, pinned, created_at FROM community_posts
        ORDER BY pinned DESC, created_at DESC LIMIT 5`
    ).all<any>().catch((e) => { console.warn('[teacher-portal] notices:', e?.message); return empty; }),
    onlyNext ? Promise.resolve(empty) : env.DB.prepare(
      `SELECT id, name, kind, level, size_bytes FROM textbook_files
        WHERE active = 1 ORDER BY created_at DESC LIMIT 8`
    ).all<any>().catch((e) => { console.warn('[teacher-portal] resources:', e?.message); return empty; }),
    (tname && !onlyNext)
      ? env.DB.prepare(
          `SELECT COUNT(*) AS n, AVG(score) AS avg FROM class_ratings
            WHERE teacher_name = ? AND created_at >= ?`
        ).bind(tname, now - 90 * 86400 * 1000).first<any>()
         .catch((e) => { console.warn('[teacher-portal] rating:', e?.message); return null; })
      : Promise.resolve(null),
    /* 🔗 관리자가 손으로 정해 준 «계정 = 강사» 정답표. 있으면 이름 추측을 건너뛴다.
       (관리자 화면: 강사 계정 연결 카드 / 표: teacher_account_links) */
    /* 🔤 (2026-08-24) 아이디 **대소문자를 무시**해서 찾는다.
       로그인이 대소문자를 무시하므로(auth-admin.ts) 세션에 담기는 아이디와
       본사가 연결해 둔 아이디의 대소문자가 갈릴 수 있다. 그때 연결을 못 찾으면
       화면이 「계정이 연결돼 있지 않다」고 말한다 — 실제로 그렇게 밟았다
       (`mangoi_167` 에 연결이 있는데 `Mangoi_167` 로 들어와 0건). */
    actor.username
      ? env.DB.prepare(`SELECT teacher_id, teacher_name FROM teacher_account_links WHERE username = ? COLLATE NOCASE LIMIT 1`)
          .bind(actor.username).first<any>()
          .catch(() => null)   // 표가 아직 없어도(첫 배포) 화면은 예전대로 돌아야 한다
      : Promise.resolve(null),
  ]);

  /* 🔒 계정 → 강사원부 확정 규칙. 위에서 적은 'Anna → HANNAH' 사고를 막는다.
   *
   *  ⚠️ "부분일치가 한 명뿐이면 그 사람" 은 **안 된다** — 그게 정확히 이 사고다.
   *     'Anna' 에 걸리는 사람은 HANNAH 딱 한 명이라, 「한 명뿐이니 확실하다」 로 판정하면
   *     그대로 남의 수업이 붙는다. 개수로는 진짜와 가짜를 못 가른다.
   *
   *  살려야 하는 부분일치와 막아야 하는 부분일치를 실제로 가르는 건 **낱말 경계**다.
   *     살릴 것 : '강선생님'      ⊂ '중국어 강선생님'  → 낱말 하나가 통째로 일치
   *               'Teacher Len' ⊃ 'LEN'             → (반대 방향도 같다)
   *     막을 것 : 'Anna'         ⊂ 'H·ANNA·H'        → 낱말 **속**에 우연히 들어간 것
   *
   *   1순위  완전일치(대소문자 무시)가 있으면 **그것만** 쓴다
   *   2순위  낱말 경계로 맞는 사람이 **정확히 1명**이면 그 사람
   *   3순위  그 외 — 낱말 경계 다중, 또는 낱말 속 우연일치뿐 — 이면 **아무도 붙이지 않는다**
   *
   *  ⚠️ 3순위가 핵심이다. «모르면 보여주지 않는다» 가 «아무나 보여준다» 보다 낫다 —
   *     못 보는 건 본사에 문의하면 끝이지만, 남의 학생 이름과 방은 되돌릴 수 없다.
   *  ⚠️ SQL 의 WHERE 는 그대로 둔다(후보를 넓게 긁는 역할). 좁히는 건 여기서만 한다.
   */
  const nrm = (s: any) => String(s || '').toUpperCase().trim();
  //   낱말 쪼개기 — 공백과, 표기에서 실제로 쓰이는 구분자들. ('중국어 강선생님', 'HT FARRAH')
  const words = (s: any) => nrm(s).split(/[\s·・,/()[\]-]+/).filter(Boolean);
  const wordMatch = (rosterName: string) => {
    const a = nrm(rosterName), b = nrm(tname);
    if (!a || !b) return false;
    if (a === b) return true;
    return words(a).indexOf(b) >= 0 || words(b).indexOf(a) >= 0;
  };

  const tidRows = (tidRs.results || []).filter((x: any) => x && x.tid);
  const exactRows = tidRows.filter((x: any) => Number(x.exact) === 1);
  const wordRows = tidRows.filter((x: any) => wordMatch(x.name));
  /* 0순위 — 사람이 정해 준 연결이 있으면 그것만 쓴다.
     이름이 'mangoi_033' 처럼 원부에 없는 계정도 이걸로 바로 붙는다.
     ⚠️ 이름 규칙(1~3순위)보다 **앞**이다. 관리자가 고른 것을 코드가 뒤집으면 안 된다. */
  const manualTid = linkRow && linkRow.teacher_id ? String(linkRow.teacher_id) : '';
  const resolvedRows = manualTid
    ? [{ tid: manualTid, name: String((linkRow && linkRow.teacher_name) || tname) }]
    : (exactRows.length ? exactRows : (wordRows.length === 1 ? wordRows : []));
  // 확정에 실패했지만 «비슷한 사람은 있다» — 본사에 누구와 헷갈리는지 그대로 보여 준다.
  //   (Anna 처럼 후보가 한 명이어도 확정하지 않았다면 여기 실린다. 이유를 알아야 고친다.)
  const ambiguousNames = resolvedRows.length ? [] : tidRows.map((x: any) => String(x.name || x.tid));

  for (const x of resolvedRows) { conds.push('cs.teacher_id = ?'); binds.push(x.tid); }

  /* 🔗 (2026-08-06 마이마이 제보 "no class in mangoi_033") 계정↔강사원부 연결이 끊긴 경우.
   *
   *  운영 실태: 로그인 계정 `mangoi_0XX` 20개 중 **18개가 name 을 한 번도 바꾸지 않아
   *  name === username** 이다('mangoi_033'). 배정은 class_schedules.teacher_id = teachers.id
   *  (예: '27' = MAIMAI) 로 걸리는데, 이 계정은 이름이 teachers 어디에도 없어
   *  teachers 조회가 0건 → 조건이 `teacher_id = 'mangoi_033'` 하나만 남고 → 0건.
   *
   *  ⚠️ 여기서 화면은 "배정된 예정 수업이 없어요" 라고 말했다. 이건 **거짓말이다**.
   *     수업이 없는 게 아니라 «누구인지 모르는» 것이다. 강사는 자기 수업이 취소된 줄 알고,
   *     매니저는 강사가 왜 안 들어오는지 모른다. 상태를 구분해서 알려 준다.
   *  ⛔ 계정 데이터를 코드가 임의로 고치지 않는다(누구인지는 운영이 정할 일). 사실만 알린다.
   */
  const linkedTeacherIds = resolvedRows.map((x: any) => x.tid);
  const identityUnlinked = !isManager && linkedTeacherIds.length === 0;
  // 🔀 '연결 안 됨'과 '누구인지 헷갈림'은 본사가 할 일이 다르다.
  //    전자는 이름을 채워 넣는 일, 후자는 둘 중 누구인지 고르는 일이다. 문구도 갈라 준다.
  const identityAmbiguous = !isManager && ambiguousNames.length > 0;

  /* 🔄 (2026-08-28) 1회성 대체강사 — 오늘 하루만. 강사 병가·휴가로 다른 강사가 이 회차를
   *  맡으면 원래 강사의 class_schedules.teacher_id 는 그대로다(다음 회차 자동복귀를 위해 —
   *  enroll-ops.ts (m-2)/(m-3) 참고). 그래서 위의 `conds`(teacher_id 매칭)만으로는:
   *    · 원래 강사 쪽엔 "오늘도 내 수업" 으로 여전히 뜬다 → 대체가 있는 날은 숨겨야 한다.
   *    · 대체강사 쪽엔 애초에 안 뜬다(teacher_id 가 자기가 아니므로) → 따로 끼워 넣어야 한다.
   *  ⚠️ **오늘 하루만** 처리한다 — 주간표(weekDays)·앞으로 7일(upcoming)은 day_of_week 로
   *     매주 반복 매칭하므로, 그 특정 날짜만 겹치는 오버레이를 거기에 정확히 끼워 넣으려면
   *     날짜별로 훨씬 더 손볼 곳이 많다(이 파일은 이미 사고 이력이 많은 파일이라 최소침습 우선).
   *     그래서 대체 회차는 오늘 목록에서만 정확하고, 주간표에는 아직 안 보인다(알려진 한계). */
  const hiddenToday = new Set<number>();
  const subToday: any[] = [];
  try {
    const myKeys = [...new Set([...linkedTeacherIds.map(String), actor.username ? String(actor.username) : ''].filter(Boolean))];
    if (myKeys.length) {
      const ph = myKeys.map(() => '?').join(',');
      const subRows: any = await env.DB.prepare(
        `SELECT cs2.schedule_id, cs2.substitute_teacher_id, cs2.original_teacher_id, cs2.reason,
                cs.user_id, cs.student_name, cs.start_time, COALESCE(cs.duration_min,20) AS dm,
                cs.class_type, cs.notes, cs.source,
                se.level AS level, se.textbook AS textbook, se.english_name AS student_en,
                t.name AS sub_name, t0.name AS orig_name
           FROM class_substitutions cs2
           JOIN class_schedules cs ON cs.id = cs2.schedule_id
           LEFT JOIN students_erp se ON se.user_id = cs.user_id
           LEFT JOIN teachers t ON CAST(t.id AS TEXT) = CAST(cs2.substitute_teacher_id AS TEXT)
           LEFT JOIN teachers t0 ON CAST(t0.id AS TEXT) = CAST(cs2.original_teacher_id AS TEXT)
          WHERE cs2.status = 'active' AND cs.status = 'active' AND cs2.sub_date = ?
            AND (cs2.substitute_teacher_id IN (${ph}) OR cs2.original_teacher_id IN (${ph}))`
      ).bind(todayStr, ...myKeys, ...myKeys).all<any>().catch(() => ({ results: [] } as any));
      for (const sr of ((subRows?.results as any[]) || [])) {
        if (myKeys.includes(String(sr.original_teacher_id || ''))) hiddenToday.add(Number(sr.schedule_id));
        if (myKeys.includes(String(sr.substitute_teacher_id || ''))) subToday.push(sr);
      }
    }
  } catch (e) { console.warn('[teacher-portal] substitution overlay:', (e as any)?.message); }

  const classes: any[] = [];
  // 📅 앞으로 7일 안의 일회성 수업 — 선언은 여기(반환문과 같은 스코프). 채우는 건 아래 루프.
  const upcoming: any[] = [];

  /* 🗓 (2026-08-06) 「내 주간 스케줄」.
     [왜] 강사에게 **자기 일정을 미리 보는 화면이 아예 없었다**. 마이페이지 탭 11개 중
          스케줄이 없고, /teacher 는 «오늘» 만 그린다. 관리자에게는 주간 통합 캘린더가
          있는데 정작 당사자인 강사는 못 본다 — 그래서 며칠 뒤 잡힌 레벨테스트를
          당일 아침에야 알게 됐다.
     ⚠️ D1 을 다시 조회하지 않는다. 위에서 이미 이 강사의 «전체» 예약을 읽어 두었으므로
        같은 rows 를 요일로 펼치기만 한다(필리핀처럼 지연 큰 회선에서 왕복이 곧 대기시간). */
  const weekParam = (url.searchParams.get('week') || '').trim();
  const mondayOf = (ms: number) => {
    const k2 = new Date(ms + KST);
    const wd = (k2.getUTCDay() + 6) % 7;            // 월=0 … 일=6
    return Date.UTC(k2.getUTCFullYear(), k2.getUTCMonth(), k2.getUTCDate()) - wd * 86400000;
  };
  const weekBaseMs = /^\d{4}-\d{2}-\d{2}$/.test(weekParam)
    ? mondayOf(Date.parse(weekParam + 'T00:00:00Z') - KST)
    : mondayOf(now);
  const weekDates: string[] = [];
  const weekDow: number[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekBaseMs + i * 86400000);
    weekDates.push(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`);
    weekDow.push(d.getUTCDay());
  }
  const weekDays: any[] = weekDates.map((date, i) => ({ date, dow: weekDow[i], is_today: date === todayStr, items: [] as any[] }));
  if (conds.length) {
    /* 🗓 (2026-08-19 Melca 8/19 제보 ①) 취소된 수업도 **받아는 온다.**
       예전엔 여기서 통째로 뺐다. 그런데 강사 입장에서는 «내 수업이 그냥 없어진» 것으로 보인다 —
       취소를 본 적이 없으니 「왜 없어졌지」가 된다.
       → 받아 와서 «오늘 것만» 회색으로 남기고, 내일부터는 그리지 않는다(아래 class_state).
       ⚠️ 주간 시간표(weekDays)·앞으로 7일(upcoming)에는 넣지 않는다 — 거기는 «앞으로 할 일» 이라
          취소된 것이 섞이면 시간표를 잘못 읽는다. */
    const whereSql = `(cs.status IS NULL OR cs.status <> 'cancelled' OR cs.scheduled_date = ?) AND (${conds.join(' OR ')})`;
    const _soSel = startsOnSel(await ensureStartsOnColumn(env), 'cs');   // 📅 매주 반복의 시작일
    // 교재·레벨은 students_erp 에서 — 스키마 드리프트가 있는 테이블이라 실패하면 조인 없이 재시도.
    const sqlJoin =
      `SELECT cs.id, cs.user_id, cs.student_name, cs.day_of_week, cs.scheduled_date, cs.start_time,
              cs.duration_min, cs.notes, cs.class_type, cs.source, cs.status AS sched_status${_soSel},
              se.level AS level, se.textbook AS textbook,
              se.english_name AS student_en, se.eval_band AS eval_band
         FROM class_schedules cs
         LEFT JOIN students_erp se ON se.user_id = cs.user_id
        WHERE ${whereSql}`;
    const sqlPlain =
      `SELECT cs.id, cs.user_id, cs.student_name, cs.day_of_week, cs.scheduled_date, cs.start_time,
              cs.duration_min, cs.notes, cs.class_type, cs.source, cs.status AS sched_status${_soSel}
         FROM class_schedules cs WHERE ${whereSql}`;
    let rows: any;
    // ⚠️ whereSql 맨 앞에 취소-예외용 ? 하나가 늘었다 — 바인드 순서를 반드시 맞춘다.
    const bindsAll = [todayStr, ...binds];
    try { rows = await env.DB.prepare(sqlJoin).bind(...bindsAll).all<any>(); }
    catch { try { rows = await env.DB.prepare(sqlPlain).bind(...bindsAll).all<any>(); } catch { rows = { results: [] }; } }

    /* ⏰ 입장 시간창 — 강사는 학생보다 **먼저(또는 같이)** 열려야 한다.
       (2026-08-02) 예전엔 값이 셋으로 갈라져 있었다: 학생 10분 / 마이페이지 30분 / 이 화면 5분.
       그래서 같은 수업인데 한 화면은 열려 있고 다른 화면은 닫혀 있었다 → 10분으로 통일했다.

       ⛔ 그런데 그 «통일» 이 (2026-08-07) 레벨테스트 30분 확대 때 **한쪽만** 적용돼 깨졌다:
          api-mango.ts(학생)·leveltest-ticket.ts 는 30분인데 이 파일만 10분 —
          레벨테스트에서 **학생은 들어와 있는데 강사 버튼은 20분 동안 잠긴** 상태가 됐다.
          처음 오는 학생을 빈 방에 20분 앉혀 두는 것이라 가장 나쁜 쪽으로 어긋났다.

       ✅ 원칙을 «같은 값» 이 아니라 «강사 창 ⊇ 학생 창» 으로 바꾼다.
          강사가 더 일찍 열리는 건 사고를 만들지 않는다(반대 방향으로만 안전하다).
          · 정규수업  : 학생 10분 · 강사 30분  ← 마이마이 요청 「교재를 미리 열어 두게 해 달라」
          · 레벨테스트: 학생 30분 · 강사 30분  ← 학생과 최소 동시. 절대 늦으면 안 된다.
          학생 쪽 값은 **건드리지 않는다** — 학생 29,000명 전체의 입장 시각이다.

       ⚠️ 학생 창을 늘리려면 api-mango.ts 의 OPEN_BEFORE 를 고칠 것. 그때 이 값이 그보다
          작아지지 않는지 반드시 확인한다(작아지면 위의 사고가 그대로 재발한다). */
    const OPEN_BEFORE_STUDENT = 10 * 60 * 1000;              // api-mango.ts 와 같은 값(참고용)
    const OPEN_BEFORE = 30 * 60 * 1000;                      // 정규수업 — 강사만 먼저
    const OPEN_BEFORE_LEVELTEST = 30 * 60 * 1000;            // 레벨테스트 — 학생과 동시(api-mango.ts 와 같은 값)
    const LATE_AFTER = 15 * 60 * 1000;   // 종료 15분 후까지 지각 입장 허용
    /* 🚪 (2026-08-07 마이마이 ⑤⑪ 「수업 전에도 열어 달라 / 아무 때나 들어가게 해 달라 —
          끝나고 닫히면 연장이 불가능하다」)
       위의 open/close 는 «지금이 수업 시간인가» 를 판정하는 값이라 그대로 둔다(상태 라벨·카운트다운이
       전부 여기에 걸려 있다). 대신 «문을 열어 줄 것인가» 를 **따로** 내려준다.
       · 강사는 오늘 잡힌 수업 방이면 **그날 00:00~24:00 언제든** 들어갈 수 있다.
         - 시작 전  : 교재를 미리 열어 두는 시간(요청 ⑤)
         - 종료 후  : 연장·마무리·다시 들어가기(요청 ⑪) — 「Done」 이라고 문을 잠그지 않는다.
       · 학생 창은 **건드리지 않았다**(api-mango.ts). 강사가 더 오래 열려 있는 건 사고를
         만들지 않는다 — 반대 방향(강사가 먼저 닫힘)만 사고가 된다.
       ⚠️ 오늘 목록에만 적용된다. 내일 수업은 애초에 이 목록에 없다(방도 아직 없다). */
    const enterFromTs = Date.UTC(kY, kMo, kD, 0, 0, 0) - KST;
    const enterUntilTs = enterFromTs + 86400000 - 1;
    /* 📅 (2026-08-06 마이마이 제보 "내일 수업이 안 보인다") 이 화면은 «오늘» 만 그린다.
       그래서 내일 잡힌 레벨테스트는 **당일이 되어서야** 처음 보인다. 레벨테스트는
       준비가 필요한 수업이다 — 처음 만나는 학생이고, 보호자가 옆에 있고, 끝나면 평가를
       남겨야 한다. 「오늘 갑자기 알게 되는」 구조는 그 준비를 불가능하게 만든다.
       → 오늘 목록은 그대로 두고, «앞으로 7일» 을 따로 모아 함께 내려준다. */
    const UPCOMING_DAYS = 7;
    const dayMs = 86400000;

    /* 🏷️ 수업 유형 판정 — **여기 한 곳에서만** 한다.
       (2026-08-08 마이마이 요청 「오늘 목록에 정규·체험·레벨테스트가 한 화면에 나오게」)
       예전엔 레벨테스트 판정식이 이 파일 안에서만 **세 벌 복제**돼 있었다(오늘·앞으로·주간).
       한 곳만 고치면 화면마다 다른 답이 나오는 구조라, 유형을 늘리기 전에 먼저 합친다.

       ⚠️ level_test 만 source/notes 까지 본다 — 옛 행에 class_type 이 비어 있어서다(기존 동작 그대로).
          trial·makeup 은 class_type 만 본다: notes 에 「체험」 같은 말이 들어간 **정규수업**이
          체험으로 잘못 표시되는 쪽이 안 보이는 것보다 나쁘다. */
    type ClassKind = 'level_test' | 'trial' | 'makeup' | 'regular';
    const classKindOf = (s: any): ClassKind => {
      const ct = String(s.class_type || '').toLowerCase();
      if (ct === 'level_test'
        || /leveltest|level_test|level-test/i.test(String(s.source || '') + ' ' + String(s.notes || ''))) return 'level_test';
      if (ct === 'trial') return 'trial';
      if (ct === 'makeup') return 'makeup';
      return 'regular';
    };


    const seen = new Set<number>();
    for (const s of (rows.results || [])) {
      /* 🗓 주간 스케줄 — 오늘/앞으로 판정과 «별개» 로 먼저 채운다.
         반복 수업도 넣는다: 여기는 «내 시간표» 라 그게 본래 목적이다.
         (앞의 upcoming 목록에는 일부러 안 넣었다 — 거기는 «특별한 한 건» 을 띄우는 자리다) */
      // 🗓 취소된 수업은 «오늘 목록» 에만 회색으로 남긴다 — 시간표·앞으로 7일에는 넣지 않는다.
      const _cancelled = String(s.sched_status || '') === 'cancelled';
      if (_cancelled) { /* 주간표 채우기 건너뜀 */ } else
      for (let wi = 0; wi < 7; wi++) {
        const hit = s.scheduled_date
          ? (String(s.scheduled_date).slice(0, 10) === weekDays[wi].date)
          : (s.day_of_week != null && s.day_of_week !== '' && dowMatches(s.day_of_week, weekDays[wi].dow) && recurStartedOn(s, weekDays[wi].date));
        if (!hit) continue;
        const [wh, wm] = String(s.start_time || '00:00').split(':').map((x: string) => Number(x));
        weekDays[wi].items.push({
          id: s.id,
          start_time: `${pad(wh || 0)}:${pad(wm || 0)}`,
          duration_min: Number(s.duration_min) || 30,
          student_uid: studentUidOf(s),
          student_name: s.student_name || s.student_en || null,
          student_name_en: s.student_en || null,
          kind: String(s.user_id || '').toLowerCase() === 'lms' ? 'lms'
              : (String(s.user_id || '').toLowerCase() === 'type_seed' ? 'sample' : 'class'),
          class_kind: classKindOf(s),
          is_level_test: classKindOf(s) === 'level_test',
        });
      }

      if (seen.has(s.id)) continue;
      let occurs = false;
      if (s.scheduled_date) occurs = (s.scheduled_date === todayStr);
      else if (s.day_of_week != null && s.day_of_week !== '') occurs = dowMatches(s.day_of_week, kDow) && recurStartedOn(s, todayStr);

      // 🔄 오늘은 다른 강사가 대체 — 내 「오늘 수업」 목록에는 안 뜬다(위 hiddenToday 주석 참고).
      if (occurs && hiddenToday.has(Number(s.id))) continue;

      if (!occurs) {
        /* 오늘이 아니면 «앞으로 7일» 안에 열리는지 본다.
           ⚠️ 반복 수업(day_of_week)은 매주 도니 여기 넣으면 목록이 그 강사의 시간표로
              가득 찬다 → **일회성(one_off)만**. 레벨테스트는 전부 일회성이라 정확히 걸린다. */
        if (_cancelled) continue;                     // 취소된 것은 «앞으로» 에 넣지 않는다
        if (!s.scheduled_date) continue;
        const d = String(s.scheduled_date).slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d <= todayStr) continue;
        const p = d.split('-').map(Number);
        const [uh, um] = String(s.start_time || '00:00').split(':').map((x: string) => Number(x));
        const uStart = Date.UTC(p[0], p[1] - 1, p[2], uh || 0, um || 0, 0) - KST;
        if (uStart - now > UPCOMING_DAYS * dayMs) continue;
        seen.add(s.id);
        upcoming.push({
          id: s.id,
          date: d,
          start_time: `${pad(uh || 0)}:${pad(um || 0)}`,
          start_ts: uStart,
          duration_min: Number(s.duration_min) || 30,
          student_uid: studentUidOf(s),
          student_name: s.student_name || s.student_en || null,
          student_name_en: s.student_en || null,
          level: s.level || null,
          textbook: s.textbook || null,
          class_kind: classKindOf(s),
          is_level_test: classKindOf(s) === 'level_test',
        });
        continue;
      }
      seen.add(s.id);

      const [hh, mm] = String(s.start_time || '00:00').split(':').map((x: string) => Number(x));
      const start_ts = Date.UTC(kY, kMo, kD, hh || 0, mm || 0, 0) - KST; // KST 벽시계 → UTC ms
      const dur = Number(s.duration_min) || 30;
      const end_ts = start_ts + dur * 60000;
      const _kind = classKindOf(s);
      // 레벨테스트는 학생 창(30분)과 **최소 동시**로 열어야 한다. 위 상수 주석 참고.
      const open_at_ts = start_ts - (_kind === 'level_test' ? OPEN_BEFORE_LEVELTEST : OPEN_BEFORE);
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
        student_uid: studentUidOf(s),
        student_name: s.student_name || s.student_en || null,
        // 🌐 학생 이름은 **번역하지 않는다** — 사람 이름을 기계번역하면 엉뚱한 말이 된다.
        //   대신 학생 원부에 이미 있는 영문명을 그대로 내려주고, 영어 화면이면 이걸 쓴다.
        //   (필리핀 강사가 '정우영' 을 읽지 못해 학생을 부르지 못하던 문제)
        student_name_en: s.student_en || null,
        level: s.level || null,
        textbook: s.textbook || null,
        // 🌱 (2026-08-24) 학년 데이터가 D1 에 사실상 0% 라(CLAUDE.md 2장) 자동 배정을 못 한다 —
        //   강사가 수업 중 직접 태그한 값을 그대로 보여준다. 미배정이면 null.
        eval_band: s.eval_band || null,
        note: s.notes || null,
        /* 🧪 (2026-08-06) 레벨테스트인지 알려 준다. 강사에겐 응대가 다르다 —
           처음 만나는 학생이고, 보호자가 옆에 있고, 끝나면 평가를 남겨야 한다.
           예전엔 평범한 수업과 똑같이 보여 «누가 신입인지» 알 방법이 없었다.
           (2026-08-08) 체험·보강도 같은 이유로 구분한다 → class_kind. is_level_test 는
           이미 쓰는 화면이 있어 그대로 둔다(둘은 항상 같은 판정에서 나온다). */
        class_kind: _kind,
        is_level_test: _kind === 'level_test',
        // 강사 창이 학생보다 얼마나 먼저 열리는지 — 화면에서 「미리 준비」 안내에 쓴다.
        open_lead_min: Math.round((start_ts - open_at_ts) / 60000),
        student_open_lead_min: Math.round(
          (_kind === 'level_test' ? OPEN_BEFORE_LEVELTEST : OPEN_BEFORE_STUDENT) / 60000),
        start_time: `${pad(hh || 0)}:${pad(mm || 0)}`,
        start_ts, end_ts, open_at_ts, close_at_ts,
        // 🚪 강사 전용 «문 열림» 창 — 위 상수 주석 참고. 화면은 이 값으로 버튼을 켠다.
        enter_from_ts: enterFromTs,
        enter_until_ts: enterUntilTs,
        duration_min: dur,
        status,
        /* 🏷 (2026-08-19 Melca 8/19 제보 ①) 「예정/진행중/완료/취소/노쇼가 구분되나」
           ─────────────────────────────────────────────────────────────────
           예전에는 화면이 이 값을 **자기가 다시 계산**했다(teacher.html 의 done/live/open).
           그래서 화면마다 답이 달라질 수 있었고, 취소·노쇼는 라벨 자체가 없었다.
           이제 **서버가 정해서 내려주고 화면은 그리기만 한다.**
           ⚠️ 위의 status(early/open/live/done)는 **그대로 둔다** — 버튼 열림 판정 등
              이미 쓰는 곳이 있다. 여기서 없애면 조용히 깨진다.
              class_state 는 «사람에게 보여줄 라벨» 이고 status 는 «문이 열렸나» 다.
           ⚠️ 노쇼는 여기서 판정하지 않는다 — 아래에서 class_no_show 기록을 그대로 읽는다.
              판정을 두 벌 두면 화면마다 다른 답이 나온다(src/no-show-truth.ts 의 원칙). */
        class_state: _cancelled ? 'cancelled'
                   : (status === 'live' ? 'ongoing'
                   : (status === 'done' ? 'done' : 'scheduled')),
        join_open: now >= open_at_ts && now <= close_at_ts,
        // ⚠️ join_open 은 «수업 시간인가» 다. «들어갈 수 있나» 는 이 값 — 둘을 섞지 말 것.
        can_enter: now >= enterFromTs && now <= enterUntilTs,
      });
    }

    /* 🔄 오늘 내가 대체로 들어가는 회차 — 위 hiddenToday/subToday 주석 참고.
       원래 강사 쪽 배정(cs.teacher_id)과 무관하게 여기서 직접 채운다. */
    for (const sr of subToday) {
      const [hh2, mm2] = String(sr.start_time || '00:00').split(':').map((x: string) => Number(x));
      const start_ts2 = Date.UTC(kY, kMo, kD, hh2 || 0, mm2 || 0, 0) - KST;
      const dur2 = Number(sr.dm) || 30;
      const end_ts2 = start_ts2 + dur2 * 60000;
      const kind2 = classKindOf(sr);
      const open_at_ts2 = start_ts2 - (kind2 === 'level_test' ? OPEN_BEFORE_LEVELTEST : OPEN_BEFORE);
      const close_at_ts2 = end_ts2 + LATE_AFTER;
      let status2: string;
      if (now < open_at_ts2) status2 = 'early';
      else if (now < start_ts2) status2 = 'open';
      else if (now <= close_at_ts2) status2 = 'live';
      else status2 = 'done';
      classes.push({
        kind: 'class',
        schedule_id: sr.schedule_id,
        room_id: `class-${sr.schedule_id}-${ymd}`,
        student_uid: studentUidOf(sr),
        student_name: sr.student_name || sr.student_en || null,
        student_name_en: sr.student_en || null,
        level: sr.level || null,
        textbook: sr.textbook || null,
        eval_band: null,
        note: sr.notes || null,
        class_kind: kind2,
        is_level_test: kind2 === 'level_test',
        open_lead_min: Math.round((start_ts2 - open_at_ts2) / 60000),
        student_open_lead_min: Math.round((kind2 === 'level_test' ? OPEN_BEFORE_LEVELTEST : OPEN_BEFORE_STUDENT) / 60000),
        start_time: `${pad(hh2 || 0)}:${pad(mm2 || 0)}`,
        start_ts: start_ts2, end_ts: end_ts2, open_at_ts: open_at_ts2, close_at_ts: close_at_ts2,
        enter_from_ts: enterFromTs, enter_until_ts: enterUntilTs,
        duration_min: dur2,
        status: status2,
        class_state: status2 === 'live' ? 'ongoing' : (status2 === 'done' ? 'done' : 'scheduled'),
        join_open: now >= open_at_ts2 && now <= close_at_ts2,
        can_enter: now >= enterFromTs && now <= enterUntilTs,
        // 🔄 대체강사로 들어가는 회차 — 「이거 내 수업 아닌데?」 를 화면이 바로 답할 수 있게.
        substitute: true,
        covering_for: sr.orig_name || null,
      });
    }
    classes.sort((a, b) => a.start_ts - b.start_ts);

    // 🎚️ 오늘 수업 학생들의 읽기 밴드 — 학생 수만큼 KV 조회(보통 5~10건, 병렬).
    //   · D1 조회가 아니라 KV 라 이 파일의 '한 번의 요청' 원칙을 깨지 않는다.
    //   · 판단력 훈련을 한 번도 안 한 학생은 값이 없어 아무것도 안 붙는다
    //     (없는 값을 기본값으로 채워 보여주면 강사가 "이 아이는 초급이구나" 하고 오해한다).
    //   · 실패해도 포털 전체를 막지 않는다.
    // ⚡ 읽기밴드는 수업 카드에만 쓰인다 → 배너용 호출(`?only=next`)에서는 KV 조회를 건너뛴다.
    if (!onlyNext) try {
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

  /* 🏫 옛 LMS 수업(카페24 동기화분) — 「일지 쓰기」가 붙을 자리 (2026-08-18)
   *
   *  [왜] 강사들은 **옛 LMS 에서 수업한다**(사장님 확인). 그 수업은 카페24→Neo4j→D1 로
   *       이미 들어와 있다 — attendance 의 room_id='c24-{class_id}' 행이 179,998건이다.
   *       그런데 이 화면은 class_schedules(예약표)만 보고 있었고, 거기엔 정규 수업이
   *       **0건**이다(2026-08-18 실측: 673행 중 lms·type_seed 자리표시를 빼면 15행,
   *       그나마 레벨테스트 신청이다). 그래서 강사 화면은 늘 비어 있었고,
   *       「일지 쓰기」 버튼은 끝난 수업이 있어야 그려지므로 **한 번도 뜬 적이 없다**
   *       (수업일지 누적 0건 — student_evaluations 104건은 전부 데모·시드였다).
   *
   *  [무엇] 끝난 LMS 수업을 «완료된 수업» 으로 함께 실어 준다. 화면은 이미 status='done'
   *       인 수업에 [일지 쓰기] 를 그리므로 화면 쪽 수정 없이 버튼이 살아난다.
   *
   *  ⚠️ 담당 판정은 **teacher_uid(=teachers.id)** 로만 한다. 위 예약 조회와 같은
   *     resolvedRows 를 쓴다 — 신원 판정을 두 벌 두면 반드시 어긋난다(이 파일 위쪽
   *     'Anna → HANNAH' 사고가 그 이야기다). 이름 문자열로는 절대 붙이지 않는다.
   *  ⚠️ 입장 창을 과거로 둔다 — 끝난 LMS 수업에 [입장] 을 주면 아무도 없는 방이 열린다.
   *     화면은 enter_from/until 로 판정하므로 [완료] + [일지 쓰기] 만 남는다.
   *  ⚠️ 카페24가 아직 강사 속성을 안 주면 teacher_uid 가 전부 NULL 이라 이 블록은
   *     조용히 0건이 된다(화면은 예전 그대로). cafe24-sync.ts 의 같은 날짜 주석 참고.
   */
  if (!onlyNext) {
    try {
      /* 🔴 (2026-08-19) 여기가 «남의 수업이 보일 뻔한» 자리다. 반드시 읽고 고칠 것.
         첫 판에서는 linkedTeacherIds(= D1 `teachers.id`, 지역 일련번호 1~29)를
         attendance.teacher_uid 와 곧바로 맞췄다. 그런데 teacher_uid 는
         **카페24 강사번호**(실측 9~196)다 — 완전히 다른 번호 체계다.
         번호가 우연히 겹치는 자리에서 정확히 «다른 사람» 이 걸렸다(실측):
           · HANNAH 계정(teachers.id=24) ↔ 카페24 24 = Teacher Mariane 의 수업 127건
           · MELCA  계정(teachers.id=26) ↔ 카페24 26 = Teacher Rica 의 수업 11건
         학생 이름이 함께 보이므로 «남의 수업이 보이는» 사고 그대로였다.
         (이 파일 위쪽 'Anna → HANNAH' 기록과 같은 종류의 사고다. 번호라서 더 안 보였다.)

         → 로그인 계정을 **카페24 강사번호로 따로 해석**한다. 경로는 하나뿐이다:
              teacher_profiles.korean_name/english_name
                ── 완전일치 ──▶ teacher_payroll_auto.teacher_name → teacher_id(카페24 번호)
            teacher_payroll_auto 는 카페24 서버가 «번호와 이름을 함께» 밀어넣은 표라
            그 안에서는 번호↔이름이 어긋나지 않는다.
         ⚠️ 완전일치만 쓴다. 부분일치는 절대 금지 — 'Anna' 가 'H-ANNA-H' 에 붙던 그 사고다.
         ⚠️ 후보가 2개 이상이면 **아무것도 붙이지 않는다**. 모르는 것보다 틀린 게 나쁘다.
         ⚠️ 못 찾으면 이 블록은 조용히 0건이 된다(화면은 예전 그대로). 안전한 실패다.
         ⛔ linkedTeacherIds 로 되돌리지 말 것. 번호가 겹치는 자리에서 조용히 남의 수업을 준다. */
      const cafe24Tids: string[] = [];
      const nameKeys = [String(actor.name || '').trim()].filter(Boolean);
      if (nameKeys.length) {
        const prof = await env.DB.prepare(
          `SELECT korean_name, english_name FROM teacher_profiles
            WHERE korean_name = ? COLLATE NOCASE OR english_name = ? COLLATE NOCASE LIMIT 2`
        ).bind(nameKeys[0], nameKeys[0]).all<any>().catch(() => ({ results: [] as any[] }));
        const rows = prof.results || [];
        // 프로필이 둘 이상 걸리면 누구인지 모르는 것이다 → 붙이지 않는다.
        if (rows.length === 1) {
          const cand = [rows[0].korean_name, rows[0].english_name].filter(Boolean);
          for (const nm of cand) {
            const pay = await env.DB.prepare(
              `SELECT DISTINCT teacher_id FROM teacher_payroll_auto
                WHERE teacher_name = ? COLLATE NOCASE LIMIT 2`
            ).bind(nm).all<any>().catch(() => ({ results: [] as any[] }));
            const pr = pay.results || [];
            if (pr.length === 1) { cafe24Tids.push(String(pr[0].teacher_id)); break; }
          }
        }
      }
      if (!cafe24Tids.length) throw new Error('no_cafe24_teacher_id');

      const tConds = cafe24Tids.map(() => 'a.teacher_uid = ?').join(' OR ');
      const LOOKBACK_DAYS = 14;                     // 일지는 기억이 남아 있을 때 쓴다. 2주면 충분.
      const sinceDate = new Date(now + KST - LOOKBACK_DAYS * 86400000).toISOString().slice(0, 10);
      // eval_band 컬럼은 /api/eval/create 가 처음 불릴 때 생긴다(ensureEvalTable) — 배포
      // 직후처럼 아직 없는 순간에 컬럼 하나 때문에 오늘 카페24 수업 목록이 통째로 사라지면
      // 안 되므로, 그 컬럼 없이도 조회되는 쿼리로 폴백한다(위 sqlJoin/sqlPlain과 같은 패턴).
      const lmsSqlJoin =
        `SELECT a.room_id, a.user_id, a.username, a.joined_at, a.left_at, a.date,
                a.teacher_uid, se.english_name AS student_en, se.level AS level, se.textbook AS textbook,
                se.eval_band AS eval_band
           FROM attendance a
           LEFT JOIN students_erp se ON se.user_id = a.user_id
          WHERE a.room_id LIKE 'c24-%' AND a.status = 'present'
            AND a.date >= ? AND a.date <= ?
            AND (${tConds})
          ORDER BY a.joined_at DESC
          LIMIT 200`;
      const lmsSqlPlain =
        `SELECT a.room_id, a.user_id, a.username, a.joined_at, a.left_at, a.date,
                a.teacher_uid, se.english_name AS student_en, se.level AS level, se.textbook AS textbook
           FROM attendance a
           LEFT JOIN students_erp se ON se.user_id = a.user_id
          WHERE a.room_id LIKE 'c24-%' AND a.status = 'present'
            AND a.date >= ? AND a.date <= ?
            AND (${tConds})
          ORDER BY a.joined_at DESC
          LIMIT 200`;
      let lmsRs: any;
      try { lmsRs = await env.DB.prepare(lmsSqlJoin).bind(sinceDate, todayStr, ...cafe24Tids).all<any>(); }
      catch { lmsRs = await env.DB.prepare(lmsSqlPlain).bind(sinceDate, todayStr, ...cafe24Tids).all<any>(); }

      const seen = new Set(classes.map((c: any) => String(c.room_id)));
      for (const r of (lmsRs.results || [])) {
        const rid = String(r.room_id || '');
        if (!rid || seen.has(rid)) continue;        // 예약표에서 이미 온 수업과 겹치지 않게
        seen.add(rid);
        const start_ts = Number(r.joined_at) || 0;
        if (!start_ts) continue;
        const end_ts = Number(r.left_at) > start_ts ? Number(r.left_at) : start_ts + 30 * 60000;
        const kk = new Date(start_ts + KST);
        classes.push({
          kind: 'class',
          source: 'lms',                            // 화면·로그에서 «어디서 온 수업인지» 구분용
          schedule_id: null,
          room_id: rid,
          student_uid: studentUidOf(r),
          student_name: r.username || r.user_id,
          student_name_en: r.student_en || null,
          level: r.level || null,
          textbook: r.textbook || null,
          eval_band: r.eval_band || null,
          note: null,
          class_kind: 'regular',
          is_level_test: false,
          start_time: `${pad(kk.getUTCHours())}:${pad(kk.getUTCMinutes())}`,
          start_ts, end_ts,
          // 이미 끝난 수업이다 — 모든 창을 과거로 닫아 [입장] 이 켜지지 않게 한다.
          open_at_ts: start_ts, close_at_ts: end_ts,
          enter_from_ts: start_ts, enter_until_ts: end_ts,
          duration_min: Math.max(1, Math.round((end_ts - start_ts) / 60000)),
          status: 'done',
          class_state: 'done',        // 🏷 화면이 한 규칙으로만 그리게 — 여기만 빠지면 라벨이 안 뜬다
          join_open: false,
          can_enter: false,
        });
      }
      classes.sort((a, b) => a.start_ts - b.start_ts);
    } catch (e: any) {
      // 카페24 번호를 못 찾았거나(no_cafe24_teacher_id) 조회가 실패해도
      // 오늘 예약 수업 표시는 살아 있어야 한다. 못 찾은 경우는 «안 보여주는» 쪽으로 실패한다.
      if (e?.message !== 'no_cafe24_teacher_id') console.warn('[teacher-portal] lms classes:', e?.message);
    }
  }

  /* 🚪 「오늘은 이 방으로」 — 학생 쪽(sessions/today)과 **같은 답**을 받아야 한다.
     ⚠️ 위 `room_id: \`class-${s.id}-${ymd}\`` 주석이 못 박아 둔 불변식이 바로 이것이다 —
        「api-mango.ts 의 sessions/today 와 반드시 같은 식」. 지정이 걸린 수업에서
        여기만 옛 방을 주면 **강사는 옛 방, 학생은 지정된 방**으로 갈려
        「같은 수업인데 둘 다 참여자 1명」이 **매번** 재현된다(이 저장소가 네 번 사고 낸 그 자리).
     ⚠️ 이 자리여야 한다 — 아래 노쇼·녹화 조회가 `room_id` 로 돌므로 **그 전에** 갈아 끼운다.
     ⚠️ 던지지 않는다(fail-open) — 지정이 안 걸리면 예약방 그대로다. 정본 src/class-room-override.ts */
  await applyRoomOverrides(env.DB, classes, ymd);

  /* 📋 (2026-09-23) 관리자·매니저 「오늘 수업」과 같은 일곱 칸 — 정본 class-today-extras.ts.
     ⚠️ 방 번호를 갈아 끼운 «뒤» 여야 한다(출석을 room_id 로 찾는다).
     강사 입장은 원부 이름으로 대조한다(계정 표시이름은 «교사 …» 가 붙어 있을 수 있다) —
     원부가 한 사람으로 확정될 때만 그 이름, 아니면 계정 이름(모르면 «확인 불가» 로 떨어진다).
     ⛔ 던지지 않는다 — 이 칸 때문에 강사가 오늘 수업을 못 보면 안 된다. 배너(?only=next)는 건너뛴다. */
  if (!onlyNext) {
    // 매니저가 이 화면을 열면 «누구의 입장인지» 를 모른다 → 이름을 안 붙인다(강사 입장 = 확인 불가).
    const _rosterName = isManager ? ''
      : (resolvedRows.length === 1 && (resolvedRows[0] as any).name ? String((resolvedRows[0] as any).name) : tname);
    for (const c of classes) if (!c.teacher_name && _rosterName) c.teacher_name = _rosterName;
    // 📅 이번 주 7칸(2026-09-23) — 관리자와 같은 규칙의 요일 파서를 넘긴다(평가는 안 넘김 = 그대로 숨김)
    try { await enrichClassesToday(env as any, classes, todayStr, now, { dowMatches }); } catch (e: any) { console.warn('[teacher-portal] extras:', e?.message); }
  }

  /* 🚫 노쇼 — 끝난 수업 중 «누군가 안 온» 기록이 있으면 라벨을 no_show 로 올린다.
     ⚠️ 새로 판정하지 않는다. class_no_show 에 이미 남은 것을 읽기만 한다
        (학생 브라우저가 5분 기다린 뒤 신고해 만든 행 — absent-sweep.ts).
        판정을 두 벌 두면 화면마다 다른 답이 나온다.
     ⚠️ **끝난 수업에만** 붙인다. 진행 중인 수업에 노쇼를 붙이면
        «지금 하고 있는데 노쇼» 라는 모순이 화면에 뜬다.
     ⚠️ 실패해도 목록은 그대로 나온다(라벨이 «완료» 로 남을 뿐) —
        노쇼 표시 하나 때문에 강사가 오늘 수업을 못 보면 안 된다.
     ⚠️ 배너용 호출(?only=next)에서는 건너뛴다 — 그쪽은 «다음 수업 한 건» 만 쓰는 가벼운 경로다. */
  if (!onlyNext) try {
    const doneRooms = classes.filter((c: any) => c.class_state === 'done' && c.room_id).map((c: any) => c.room_id);
    if (doneRooms.length) {
      const ns = await selectInChunks<any>(
        env.DB, doneRooms,
        (ph) => `SELECT room_id, missing_role FROM class_no_show WHERE room_id IN (${ph})`,
        { swallowErrors: true },
      );
      const miss = new Map<string, string>();
      for (const r of ns) {
        const k = String(r.room_id || '');
        if (!k) continue;
        const role = String(r.missing_role || '');
        // 같은 방에 학생·강사가 둘 다 있으면 «둘 다» 로 적는다
        miss.set(k, (miss.has(k) && miss.get(k) !== role) ? 'both' : role);
      }
      for (const c of (classes as any[])) {
        if (c.class_state !== 'done') continue;
        const m = miss.get(c.room_id);
        if (m) { c.class_state = 'no_show'; c.no_show_role = m; }
      }
    }
  } catch { /* 노쇼 표시가 없어도 목록은 정상 */ }

  /* ✍ 일지 배지 + 학생별 «지난 수업» (2026-08-27 마이마이 8/26 ①②)
   *
   *  (a) eval_written — 이 수업 방(room_id)에 일지가 이미 있으면 표시한다.
   *      마이마이 제보의 뿌리: Hannah 가 일지를 «썼는데»(DB 실측) 화면 어디에도
   *      흔적이 없어 «피드백이 안 보인다» 가 됐다. room_id 완전일치로만 판정한다 —
   *      /api/eval/create 가 저장하는 room_id 와 여기 room_id 는 같은 결정론 규칙이다.
   *  (b) prev_lesson — 오늘 학생마다 «오늘 이전» 마지막 일지 1건(날짜·강사·내용)을
   *      붙인다. 대타·레벨테스트에서 「이 학생을 지난번엔 누가 어떻게 가르쳤나」 가
   *      화면에 없어서 강사가 맨손으로 들어가던 것. 내용은 400자로 자른다(목록용).
   *  ⚠️ 실패해도 오늘 목록은 그대로 나온다 — 배지 하나 때문에 수업 목록을 막지 않는다.
   *  ⚠️ 배너용(?only=next)은 건너뛴다 — 그쪽은 «다음 수업 한 건» 만 쓰는 가벼운 경로다. */
  if (!onlyNext) try {
    const rooms = [...new Set(classes.filter((c: any) => c.room_id).map((c: any) => String(c.room_id)))];
    if (rooms.length) {
      const evs = await selectInChunks<any>(
        env.DB, rooms,
        (ph) => `SELECT room_id, MAX(id) AS eval_id FROM student_evaluations
                  WHERE room_id IN (${ph}) GROUP BY room_id`,
        { swallowErrors: true },
      );
      const written = new Map<string, number>();
      for (const r of evs) if (r.room_id) written.set(String(r.room_id), Number(r.eval_id));
      for (const c of (classes as any[])) {
        const eid = written.get(String(c.room_id || ''));
        if (eid) { c.eval_written = true; c.eval_id = eid; }
      }
    }
    const dayStartMs = Date.UTC(kY, kMo, kD, 0, 0, 0) - KST;   // 오늘 00:00 KST — «오늘 이전» 경계
    const uids = [...new Set(
      classes.filter((c: any) => c.kind === 'class' && c.student_uid)
             .map((c: any) => String(c.student_uid)))];
    if (uids.length) {
      // 옛 행은 student_uid 가 비고 user_id 만 있다(api-mango 경로) → COALESCE 로 한 키로 본다.
      // MAX(created_at) 곁의 나머지 열은 SQLite 규칙상 그 최댓값 행에서 온다(학생당 최신 1건).
      const prevRows = await selectInChunks<any>(
        env.DB, uids,
        (ph) => `SELECT COALESCE(NULLIF(student_uid, ''), user_id) AS suid,
                        teacher_name, lesson_date, score_overall,
                        substr(COALESCE(note_en, teacher_comment, strengths, ''), 1, 400) AS note_en,
                        substr(COALESCE(note_ko, ''), 1, 400) AS note_ko,
                        MAX(created_at) AS created_at
                   FROM student_evaluations
                  WHERE COALESCE(NULLIF(student_uid, ''), user_id) IN (${ph}) AND created_at < ?
                    AND (note_en IS NOT NULL OR note_ko IS NOT NULL OR room_id IS NOT NULL)
                  GROUP BY suid`,
        { tail: [dayStartMs], swallowErrors: true },
      );
      const prevBy = new Map<string, any>();
      for (const r of prevRows) if (r.suid) prevBy.set(String(r.suid), r);
      for (const c of (classes as any[])) {
        const p = prevBy.get(String(c.student_uid || ''));
        if (!p) continue;
        c.prev_lesson = {
          date: p.lesson_date || (p.created_at ? new Date(Number(p.created_at) + KST).toISOString().slice(0, 10) : null),
          teacher_name: p.teacher_name || null,
          note_en: p.note_en || null,
          note_ko: p.note_ko || null,
          score_overall: p.score_overall != null ? p.score_overall : null,
        };
      }
    }
  } catch { /* 배지·지난수업이 없어도 목록은 정상 */ }

  /* 🔔 `?only=next` — 여기서 끝낸다. 아래 매니저 블록·주간 스케줄·반환문은 타지 않는다.
   *
   *  고르는 규칙: «아직 안 끝난 것 중 가장 이른 하나». 끝난 수업은 배너로 부를 이유가 없다.
   *    ⚠️ `lms`(옛 LMS 점유 슬롯)·`sample`(시연 시드)은 **뺀다** — 들어갈 방이 없는 행이라
   *       배너가 「수업이 있어요」 하고 부르면 아무도 없는 방으로 보내게 된다.
   *    ⚠️ «몇 분 전부터 띄울지» 는 여기서 정하지 않는다. 서버는 사실(시각)만 주고
   *       띄울지 말지는 화면이 정한다 — 그래야 설정을 바꿀 때 서버를 안 건드린다.
   *  🌐 라벨은 한/영 두 벌. 학생 이름은 번역하지 않고 원부의 영문명을 쓴다(위 주석과 같은 이유).
   */
  if (onlyNext) {
    const GRACE_AFTER_END = 30 * 60 * 1000;   // 끝나고도 30분은 «진행 중» 으로 본다(연장·마무리)
    const cand = classes
      .filter((c: any) => c.kind === 'class' && now <= c.end_ts + GRACE_AFTER_END)
      .sort((a: any, b: any) => a.start_ts - b.start_ts)[0] || null;
    let next: any = null;
    if (cand) {
      const who = String(cand.student_name || '').trim();
      const whoEn = String(cand.student_name_en || cand.student_name || '').trim();
      // 🚪 입장 주소는 **서버가 만든다** — teacher.html 의 joinClass() 와 같은 규약이라
      //    화면마다 따로 조립하면 언젠가 어긋나 학생과 다른 방에 들어가게 된다.
      const vcName = '교사 ' + String(actor.name || 'Teacher');
      const enterUrl = '/?vc_autojoin=1&vc_role=teacher&vc_room=' + encodeURIComponent(cand.room_id)
                     + '&vc_name=' + encodeURIComponent(vcName);
      next = {
        label: cand.is_level_test ? ('레벨테스트' + (who ? ' · ' + who : ''))
                                  : (who ? who + ' 수업' : '수업'),
        label_en: cand.is_level_test ? ('Level test' + (whoEn ? ' · ' + whoEn : ''))
                                     : (whoEn ? 'Class with ' + whoEn : 'Class'),
        starts_at: cand.start_ts,
        ends_at: cand.end_ts,
        enter_from_ts: cand.enter_from_ts,
        can_enter: cand.can_enter,
        room_id: cand.room_id,
        enter_url: enterUrl,
      };
    }
    return json({ ok: true, now, today: todayStr, next });
  }

  // ── 🧑‍💼 매니저 전용 블록 (강사에게는 조회 자체를 안 한다 = 강사 화면은 1바이트도 안 무거워짐) ──
  //   매니저가 하루 종일 확인하는 것 두 가지만 담는다: 오늘 수업이 도는가 · 사고가 났는가.
  //   차트·집계 없음. 숫자와 목록뿐이라 응답이 몇 KB 를 넘지 않는다.
  let manager: any = null;
  if (isManager) {
    const dayStartMs = Date.UTC(kY, kMo, kD, 0, 0, 0) - KST;   // 오늘 00:00 KST 를 UTC ms 로
    const OPEN_BEFORE = 10 * 60 * 1000, LATE_AFTER = 15 * 60 * 1000;
    const _soSelM = startsOnSel(await ensureStartsOnColumn(env), 'cs');
    const [allRs, nsRs] = await Promise.all([
      env.DB.prepare(
        `SELECT cs.id, cs.user_id, cs.student_name, cs.day_of_week, cs.scheduled_date,
                cs.start_time, cs.duration_min, cs.teacher_id${_soSelM}, t.name AS teacher_name
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
        : (s.day_of_week != null && s.day_of_week !== '' && dowMatches(s.day_of_week, kDow) && recurStartedOn(s, todayStr));
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
  //   🧑‍💼 매니저는 강사와 규칙이 다르다. 필리핀 매니저만 영어, 나머지 본사 계정은 한국어.
  //      ⚠️ `mgr_` 접두사로 판정하면 안 된다 — mgr_jjw(장지웅)·mgr_lby(이병엽) 처럼
  //         **한국 본사 매니저도 같은 접두사**를 쓴다(2026-08-05 운영 DB 확인).
  //      ⚠️ 이름에 한글이 있는지로도 판정하면 안 된다 — 계정명이 "Melca (본사 매니저)" 라
  //         한글 꼬리표가 붙어 있어 영어만 읽는 매니저가 한국어 화면에 갇힌다.
  //      → 그래서 **명단**으로 못박는다. 필리핀 직원이 늘면 여기에 아이디를 추가할 것.
  const lang = isManager
    ? (PH_MANAGERS.indexOf(_uid) >= 0 ? 'en' : 'ko')
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
      // 🔗 true = 이 계정이 강사원부(teachers)의 누구와도 연결돼 있지 않다.
      //    화면은 "수업 없음"이 아니라 "계정 연결 안 됨"으로 말해야 한다.
      identity_unlinked: identityUnlinked,
      linked_teacher_ids: linkedTeacherIds,
      // 🔀 true = 이름이 원부의 여러 명에 걸려 «누구인지 확정하지 못했다».
      //    이때는 수업을 한 건도 보여주지 않는다(남의 수업이 섞이는 것보다 낫다).
      identity_ambiguous: identityAmbiguous,
      identity_candidates: ambiguousNames,
      // 👥 «이 사람은 계정이 하나 더 있다» — 있으면 화면이 한 줄로 안내한다.
      //    (auth-admin.ts SAME_PERSON_ACCOUNTS: 지금은 Maimai 한 사람뿐)
      also_account: otherAccountOf(actor.username || ''),
    },
    classes,
    // 📅 앞으로 7일 안의 «일회성» 수업(레벨테스트 포함). 오늘 목록과 별개로 미리 준비하라고 알린다.
    upcoming: upcoming.sort((a, b) => a.start_ts - b.start_ts),
    // 🗓 내 주간 스케줄 — ?week=YYYY-MM-DD 로 주 이동(그 주의 월요일로 맞춰진다)
    week: {
      start: weekDates[0], end: weekDates[6],
      days: weekDays.map(d => ({ ...d, items: d.items.sort((a: any, b: any) => a.start_time.localeCompare(b.start_time)) })),
    },
    notices, resources, rating,
    ...(manager ? { manager } : {}),
  });
}
