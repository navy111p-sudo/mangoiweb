/* ═══════════════════════════════════════════════════════════════════════════
   📘 학생 «예약 수업» 요약 — 정본 한 곳
   ───────────────────────────────────────────────────────────────────────────
   왜 만들었나 (2026-09-15 사장님 「수업 입력했고 스케줄에도 있는데 왜 여기 없어?」)
     관리자 「수업 예약 등록」은 `class_schedules` 에만 쓴다. 그런데 학생 목록·
     상세 카드가 그리던 「수강 시작일·종료일·수업회수(주)·결제타입」은 전부
     `students_erp` 의 칸이고 **카페24가 정본**이라(created_at = 센티넬
     1751500000000) 우리가 채워도 매일 밤 03:00 동기화가 덮는다.
     ⟹ 두 표 사이에 배선이 «아예 없어» 수업을 넣어도 목록은 «—» 였다.
     실측(2026-09-15): `lee` 활성 2건 · `jeong` 활성 5건인데 두 화면 다 «—».

   ⛔ 그래서 이 모듈은 기존 칸을 «채우지» 않는다 — 칸을 새로 만든다.
      「수강 종료일」 자리에 «마지막 예약일» 을 넣으면 뜻이 달라진다(원래는
      «결제한 수강권이 끝나는 날», 예약 마지막 날은 «지금까지 잡아 둔 마지막
      수업» 이라 수업을 더 잡을 때마다 저절로 늘어난다 = 거짓).
      「수업회수(주)」도 마찬가지 — 일회성(one_off) 예약은 «주당 회수» 가 아니다.
      CLAUDE.md 2장 「측정할 수 없는 값을 그럴듯하게 채우고 싶을 때 ⛔ 지어내지
      마세요」가 그 자리다.

   ⚠️ 라벨(label_ko/label_en)은 **서버가 만들어 보낸다.**
      그리는 화면이 둘(학생 목록 `js/adm-core.js` · 학생 상세
      `public/admin/student.html`)이라, 화면이 각자 조립하면 한쪽만 고쳐져
      「화면마다 답이 다른」 상태가 된다.

   ⚠️ 「주 N회」와 「단건 M회」를 한 숫자로 합치지 않는다 — 뜻이 다르고, 상세
      화면의 스케줄 탭은 «지난 것까지» 총 N건으로 세므로 합치면 두 화면 숫자가
      어긋난 것처럼 보인다. 글자로 뜻을 밝혀 둔다.

   ⚠️ 그 「📅 스케줄」 탭(`GET /api/admin/class-schedules`)과는 축이 **셋** 다르다 —
      두 숫자를 «같아야 하는 것» 으로 읽지 말 것:
        ① 상태      여기 status='active'  · 탭 status != 'cancelled'(proposed 등 포함)
        ② 자리표시  여기 lms·type_seed 제외 · 탭 제외하지 않음
        ③ 동명 계정 여기 user_id 정확일치 · 탭은 «이름으로 통합» 하는 길이 있음
                    (그 경로의 STUDENT_NAME 이 저장소 어디에서도 대입되지 않아 지금은
                     이름이 유일한 학생에서만 켜진다 — 그때 탭이 더 많이 센다)
   ═══════════════════════════════════════════════════════════════════════════ */

/** 활성 예약만 · LMS/시드 자리표시 제외.
 *  ⚠️ `src/schedule-conflict.ts` 의 NOT_PLACEHOLDER 와 «같은 문자열» 이다.
 *     (그 파일은 다른 도메인이라 import 하지 않고 복제 — 같은 저장소의 기존 방식) */
export const SCHED_SUMMARY_WHERE =
  `status = 'active' AND LOWER(COALESCE(user_id,'')) NOT IN ('lms','type_seed')`;

export type SchedRowLike = {
  user_id?: any;
  schedule_kind?: any;
  scheduled_date?: any;
  /** 원부 번호(teachers.id) — 옛 행은 로그인 계정명이 들어 있기도 하다. */
  teacher_id?: any;
};

export type SchedSummary = {
  /** 매주 반복 건수 = «주 N회» */
  weekly: number;
  /** 앞으로 남은 일회성(날짜 지정) 건수 */
  upcoming: number;
  /** 이미 지난 일회성 */
  past: number;
  /** 활성 예약 전체(반복 + 일회성) */
  total: number;
  label_ko: string;
  label_en: string;
  /** 👩‍🏫 (2026-10-07 매니저 요청) 지금 담당 강사 이름 — 매주 반복 + 앞으로 남은 일회성만(지난 수업 제외).
   *  중복 제거, 처음 나온 순서. 이름을 «못 찾은» 번호는 넣지 않는다(지어내지 않음). */
  teachers: string[];
};

export const EMPTY_SCHED_SUMMARY: SchedSummary = {
  weekly: 0, upcoming: 0, past: 0, total: 0, label_ko: '—', label_en: '—', teachers: [],
};

/** 강사 번호 → 이름. 정본 경로 둘뿐이다:
 *   ① class_schedules.teacher_id = teachers.id (원부 번호)
 *   ② 옛 행은 그 칸에 «로그인 계정명» 이 들어 있다 → teacher_account_links(username) → teachers.id
 *  ⛔ 카페24 강사번호(9~196)와 섞지 않는다 — 겹치는 자리에서 남의 이름이 된다(CLAUDE.md 2장).
 *  ⚠️ 실패하면 «아무것도 모름» 함수(빈 문자열)를 돌려준다 — 명부는 그대로 떠야 한다. */
export async function loadTeacherNameOf(env: any): Promise<(tid: any) => string> {
  const byId = new Map<string, string>();
  const byAcct = new Map<string, string>();
  try {
    const rs = await env.DB.prepare(`SELECT id, name FROM teachers`).all();
    for (const r of (rs?.results || [])) {
      const nm = String(r?.name || '').trim();
      if (nm) byId.set(String(r.id), nm);
    }
  } catch (e: any) { console.warn('[sched-summary] teachers:', e?.message || e); }
  try {
    const rs = await env.DB.prepare(`SELECT username, teacher_id FROM teacher_account_links`).all();
    for (const r of (rs?.results || [])) {
      const nm = byId.get(String(r?.teacher_id ?? ''));
      const u = String(r?.username || '').trim().toLowerCase();
      if (nm && u) byAcct.set(u, nm);
    }
  } catch { /* 표가 없을 수 있다 — ①만으로 간다 */ }
  return (tid: any) => {
    const k = String(tid ?? '').trim();
    if (!k) return '';
    return byId.get(k) || byAcct.get(k.toLowerCase()) || '';
  };
}

/** KST 기준 오늘 (YYYY-MM-DD).
 *  ⚠️ UTC 로 재면 하루가 밀린다 — 저장된 scheduled_date 는 KST 날짜다. */
export function kstToday(nowMs: number = Date.now()): string {
  return new Date(nowMs + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 행 목록 → 요약. 순수 함수(하니스가 그대로 돌린다). */
export function summarizeStudentSchedules(
  rows: SchedRowLike[] | null | undefined,
  todayYmd: string,
  nameOf?: (tid: any) => string,
): SchedSummary {
  let weekly = 0, upcoming = 0, past = 0;
  const teachers: string[] = [];
  const addT = (r: SchedRowLike) => {
    if (!nameOf) return;
    const nm = nameOf(r?.teacher_id);
    if (nm && teachers.indexOf(nm) < 0) teachers.push(nm);
  };
  for (const r of rows || []) {
    /* ⚠️ 빈 값은 «반복» 으로 봅니다 — 표 DEFAULT 가 'recurring' 이고 읽는 쪽도
       `schedule_kind || 'recurring'`(api-mango.ts 두 곳)이라 저장소 관례가 그쪽입니다.
       ⛔ 반대로 두면(모르면 단건) 스키마가 다른 DB·옛 행에서 **반복 수업이 「단건」으로**
          찍힙니다. 지금 INSERT 8곳은 전부 값을 명시하므로 실피해는 0이고 방향만 맞춥니다.
       ℹ️ 'dated'(수강신청 확정 회차행)는 날짜가 있으니 그대로 단건으로 셉니다. */
    const kind = String(r?.schedule_kind || 'recurring').toLowerCase();
    if (kind === 'recurring') { weekly++; addT(r); continue; }
    // 일회성 — 날짜가 없으면 «언제인지 모름» 이므로 지난 것으로 세지 않는다.
    const d = String(r?.scheduled_date || '').slice(0, 10);
    if (!d) { upcoming++; addT(r); continue; }
    if (d >= todayYmd) { upcoming++; addT(r); } else past++;
  }
  const total = weekly + upcoming + past;
  return { weekly, upcoming, past, total, ...schedSummaryLabels(weekly, upcoming), teachers };
}

/** 라벨 — 두 화면이 같은 말을 하도록 여기서만 만든다. */
export function schedSummaryLabels(weekly: number, upcoming: number): { label_ko: string; label_en: string } {
  const ko: string[] = [], en: string[] = [];
  if (weekly > 0) { ko.push('주 ' + weekly + '회'); en.push(weekly + '/wk'); }
  if (upcoming > 0) { ko.push('단건 ' + upcoming + '회'); en.push(upcoming + ' one-off'); }
  if (!ko.length) return { label_ko: '—', label_en: '—' };
  return { label_ko: ko.join(' · '), label_en: en.join(' · ') };
}

/** 학생 여러 명 → user_id 별 요약 Map.
 *  ⚠️ 학생마다 조회하지 않는다(명부는 최대 2,000명). 활성 예약 전체를 한 번에
 *     읽어 메모리에서 묶는다 — 2026-09-15 실측 활성 1,518행 / 학생 492명.
 *  ⚠️ 실패하면 «빈 Map»(= 모름)으로 떨어진다. 이 값 때문에 명부가 통째로
 *     사라지면 안 된다(erp-list 는 어떤 에러든 삼켜 빈 배열을 준다). */
export async function loadSchedSummaryMap(env: any, nowMs: number = Date.now()): Promise<Map<string, SchedSummary>> {
  const out = new Map<string, SchedSummary>();
  try {
    const today = kstToday(nowMs);
    const rs = await env.DB.prepare(
      `SELECT user_id, schedule_kind, scheduled_date, teacher_id FROM class_schedules WHERE ${SCHED_SUMMARY_WHERE}`
    ).all();
    const byUid = new Map<string, SchedRowLike[]>();
    for (const r of (rs?.results || [])) {
      const uid = String(r?.user_id || '').trim();
      if (!uid) continue;
      const arr = byUid.get(uid);
      if (arr) arr.push(r); else byUid.set(uid, [r]);
    }
    const nameOf = await loadTeacherNameOf(env);
    for (const [uid, arr] of byUid) out.set(uid, summarizeStudentSchedules(arr, today, nameOf));
  } catch (e: any) {
    console.warn('[sched-summary] map failed:', e?.message || e);
  }
  return out;
}

/** 학생 한 명 → 요약 (상세 카드). 실패하면 «모름»(빈 요약). */
export async function loadSchedSummaryOne(env: any, uid: string, nowMs: number = Date.now()): Promise<SchedSummary> {
  try {
    const rs = await env.DB.prepare(
      `SELECT user_id, schedule_kind, scheduled_date, teacher_id FROM class_schedules
       WHERE user_id = ? AND ${SCHED_SUMMARY_WHERE}`
    ).bind(uid).all();
    return summarizeStudentSchedules(rs?.results || [], kstToday(nowMs), await loadTeacherNameOf(env));
  } catch (e: any) {
    console.warn('[sched-summary] one failed:', e?.message || e);
    return { ...EMPTY_SCHED_SUMMARY };
  }
}
