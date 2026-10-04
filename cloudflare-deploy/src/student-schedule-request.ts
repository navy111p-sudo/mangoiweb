/* ═══════════════════════════════════════════════════════════════════════
   📅 학생이 직접 내는 수업 연기·변경 요청 — 판정 정본 (2026-09-30)
   ───────────────────────────────────────────────────────────────────────
   [왜] 학생 화면(/lesson-postpone-demo.html)의 저장이 /api/admin/schedule-requests 로
        가는데 그건 관리자 전용이라 학생은 늘 401 이었다 — 학생의 연기 요청은
        도입 이래 한 건도 저장되지 않았다(사장님 jeong 제보 2026-09-30).
   [무엇] POST /api/class/schedule/request (api-mango.ts) 가 이 판정을 «부르기만» 한다.
        /api/class/ 는 src/index.ts 라우팅에 이미 있어 공동 금지구역을 안 고친다.
   🔒 계약
     · 신원은 학생 토큰(mango_token)으로만 — 본문의 uid·이름은 믿지 않는다.
     · 그 수업(schedule_id)이 «그 학생의 것» 일 때만 받는다(남의 수업 연기 금지).
     · 원래 일시·학생 이름·담당 강사는 서버가 class_schedules 에서 읽는다.
     · 요청은 «접수» 일 뿐 — 승인은 관리자가 기존 /decide 로 한다(수업을 여기서 옮기지 않는다).
   ═══════════════════════════════════════════════════════════════════════ */

export const STUDENT_REQ_DAILY_CAP = 30;   // 한 학생이 하루에 낼 수 있는 요청 수(폭주 방지)

export type StudentReqInput = {
  tokUid: string | null;
  schedule: { user_id?: string | null; scheduled_date?: string | null; status?: string | null } | null;
  requestType: string;
  origDate: string | null;      // 반복 수업일 때 화면이 계산한 «그 회차» 날짜
  newDate: string | null;
  newTime: string | null;
  todayKst: string;             // YYYY-MM-DD
  recentCount: number | null;   // 최근 24시간 이 학생 요청 수(null = 못 셈)
  /* 같은 수업·같은 회차에 이미 «대기 중» 요청이 있는가(true/false, null = 못 봄).
     2026-10-01 jeong 이 같은 4건을 2분 사이 두 번 보내 대기 요청이 8건 쌓였다. */
  pendingDup?: boolean | null;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** 받을 수 있으면 { ok:true }, 아니면 사유 코드. 순수 함수 — 하니스가 경계값을 넣어 돌린다. */
/* ⚠️ 한 가지 모양 — tsconfig 가 strict:false 라 판별 유니온 좁히기가 안 된다(CLAUDE.md 2장). */
export type StudentReqGate = { ok: boolean; error: string | null; status: number };
export function studentRequestGate(i: StudentReqInput): StudentReqGate {
  if (!i.tokUid) return { ok: false, error: 'login_required', status: 401 };
  if (i.requestType !== 'postpone' && i.requestType !== 'change') return { ok: false, error: 'bad_request_type', status: 400 };
  if (!i.schedule) return { ok: false, error: 'schedule_not_found', status: 404 };
  /* 정확일치 — 대소문자만 다른 계정이 실재한다(Kim/kim). */
  if (String(i.schedule.user_id || '') !== i.tokUid) return { ok: false, error: 'not_your_class', status: 403 };
  if (String(i.schedule.status || 'active') === 'cancelled') return { ok: false, error: 'class_cancelled', status: 409 };
  /* 반복 수업이면 «어느 회차» 인지 화면이 알려 줘야 한다 — 오늘~60일 안의 날짜만. */
  if (!i.schedule.scheduled_date) {
    if (!i.origDate || !DATE_RE.test(i.origDate)) return { ok: false, error: 'orig_date_required', status: 400 };
    if (i.origDate < addDays(i.todayKst, -1) || i.origDate > addDays(i.todayKst, 60)) return { ok: false, error: 'orig_date_out_of_range', status: 400 };
  }
  /* 새 일시는 둘 다 있거나 둘 다 없어야 한다(연기는 «미정» 도 된다). 변경은 반드시 있어야 한다. */
  const hasNew = !!(i.newDate || i.newTime);
  if (hasNew && !(i.newDate && DATE_RE.test(i.newDate) && i.newTime && TIME_RE.test(i.newTime))) return { ok: false, error: 'bad_new_date_time', status: 400 };
  if (i.requestType === 'change' && !hasNew) return { ok: false, error: 'new_date_time_required_for_change', status: 400 };
  if (hasNew && (i.newDate! < i.todayKst || i.newDate! > addDays(i.todayKst, 90))) return { ok: false, error: 'new_date_out_of_range', status: 400 };
  /* 못 세었으면 막지 않는다(학생 요청이 조용히 사라지는 쪽이 더 나쁘다). */
  if (i.recentCount != null && i.recentCount >= STUDENT_REQ_DAILY_CAP) return { ok: false, error: 'too_many_requests', status: 429 };
  /* 중복은 되돌릴 수 없는 일이 아니라 «못 봤으면(null) 막지 않는다». */
  if (i.pendingDup === true) return { ok: false, error: 'already_pending', status: 409 };
  return { ok: true, error: null, status: 200 };
}

/** schedule_change_requests 표 — 정의 정본(관리자·학생 경로가 함께 쓴다). */
export async function ensureScheduleChangeRequestTable(env: any): Promise<void> {
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS schedule_change_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, schedule_id INTEGER, request_type TEXT DEFAULT 'postpone', requester_role TEXT DEFAULT 'teacher', requester_name TEXT, requester_uid TEXT, teacher_name TEXT, student_name TEXT, orig_date TEXT, orig_time TEXT, new_date TEXT, new_time TEXT, fee_type TEXT, minutes_before INTEGER, reason TEXT, status TEXT DEFAULT 'pending', decided_by TEXT, decided_at INTEGER, decide_memo TEXT, created_at INTEGER NOT NULL)`);
  try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_scr_status ON schedule_change_requests(status, created_at)`); } catch {}
  // 🆕 유료/무료 태깅(2026-07-14) — 기존 배포 DB 호환 컬럼 추가(멱등, 이미 있으면 무시)
  /* 👨‍🏫 (2026-09-30) new_teacher_id = «교사로 연기» 에서 학생이 고른 강사(원부 번호). teacher_name 은 «담당 강사» 그대로 둔다. */
  /* 2026-10-04 schedule_snapshot: server-captured scheduleMoveVersion. Never backfill old
     pending rows from today's timetable: that would invent their request-time baseline. */
  /* ⏸ (2026-10-02) end_makeup = «연기보강» 이름(예: 연기보강 (10월 2일 연기)). 있으면 승인 때 class_type='makeup' + 메모. */
  for (const col of ['fee_type TEXT', 'minutes_before INTEGER', 'requester_uid TEXT', 'new_teacher_id TEXT', 'end_makeup TEXT', 'schedule_snapshot TEXT']) {
    try { await env.DB.exec(`ALTER TABLE schedule_change_requests ADD COLUMN ${col}`); } catch {}
  }
}
