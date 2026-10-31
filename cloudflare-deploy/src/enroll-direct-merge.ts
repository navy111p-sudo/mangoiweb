/* 🔀 «직접 배정» 수업을 수강신청(enrollments)으로 합치기 (2026-09-30 사장님)
 *
 * [왜] 주간 스케줄·학생 상세의 «수업 등록»(POST /api/admin/class-schedules)은 class_schedules 에만
 *   source='admin_ui' 로 쓰고 신청서를 안 남겼다. 그래서 수강신청 목록에 «직접 배정» 줄로 따로
 *   떠서 버튼(후속·취소·삭제·체크박스·내보내기)이 하나도 없었다. 사장님: 「배정 경로가 어떠하든
 *   수강신청 목록에는 모두 같은 조건과 버튼이 떠야 한다」.
 * [어떻게] 수강신청 확정이 만든 수업과 «같은 모양» 으로 만든다 — 신청서 한 줄을 만들고
 *   그 수업들의 source 를 `adm-enroll:<신청서id>` 로 바꾼다. 그러면 기존 기능이 그대로 걸린다:
 *     · 삭제 → 연결 수업 취소(api-admin.ts DELETE — source 로 찾음)
 *     · ⚙ 후속 → 계획이 «이미 N회 만들어짐» 을 보고 수업을 새로 만들지 않음(enroll-activate.ts)
 *     · 수강기간 채우기(백필) → 같은 source 로 잇는다
 * 묶는 기준은 목록과 같다(groupDirectClasses — 학생·강사·시각·길이·종류). 같은 묶음이 다시 배정되면
 *   (주간 스케줄은 날짜마다 1건씩 보낸다) 새 신청서를 또 만들지 않고 «살아 있는» 그 신청서에 붙인다.
 *
 * ⛔ 요금을 지어내지 않는다 — monthly_fee_krw 는 비워 둔다(목록은 «—»). 정기결제가 그 금액을 청구한다.
 * ⛔ 상태는 'confirmed' — 수업이 이미 잡혀 있다(대기로 두면 「확정 안 됨」 버튼이 뜬다).
 * ⚠️ 실패해도 수업 등록은 그대로다(그 행은 admin_ui 로 남아 목록의 «합치기» 버튼으로 다시 잇는다).
 */
import { groupDirectClasses } from './enroll-direct';
import type { DirectGroup } from './enroll-direct';

export const DIRECT_ENROLL_TYPE = 'schedule_direct';
export const DIRECT_KEY_PREFIX = 'direct-key:';
const SRC_PREFIX = 'adm-enroll:';
const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];
const PACKAGE_BY_TYPE: Record<string, string> = {
  regular: '정규수업', trial: '체험수업', level_test: '레벨테스트', makeup: '보강수업',
};

/** KST 그날 0시(ms). 형식이 아니면 null — 지어내지 않는다. */
function kstMidnight(day: string | null): number | null {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const t = Date.parse(day + 'T00:00:00+09:00');
  return Number.isFinite(t) ? t : null;
}

/** 묶음 → 신청서 칸. 순수 함수(하니스가 실제로 돌린다). */
export function directEnrollmentFields(g: DirectGroup) {
  return {
    student_user_id: g.user_id || null,
    student_name: g.student_name || g.user_id || '—',
    package: PACKAGE_BY_TYPE[g.class_type] || PACKAGE_BY_TYPE.regular,
    days_of_week: (g.dows || []).map((d) => DOW_KO[d] || '').filter(Boolean).join(',') || null,
    time: g.start_time || null,
    duration_min: g.duration_min > 0 ? g.duration_min : null,
    teacher_name: g.teacher_name || null,
    started_at: kstMidnight(g.first_date) ?? (g.created_at || null),
    end_date: g.kind === 'dated' ? (g.last_date || null) : null,
    type: DIRECT_ENROLL_TYPE,
    notes: DIRECT_KEY_PREFIX + g.key,
    status: 'confirmed',
  };
}

const ROW_SQL =
  `SELECT cs.id, cs.user_id, cs.student_name, cs.teacher_id, t.name AS teacher_name, cs.start_time, cs.duration_min,
          cs.schedule_kind, cs.day_of_week, cs.scheduled_date, cs.class_type, cs.created_at
     FROM class_schedules cs LEFT JOIN teachers t ON t.id = cs.teacher_id`;

/** 신청서 요약 칸을 «지금 붙어 있는 살아 있는 수업» 에서 다시 계산한다(날짜가 늘면 기간도 늘게). */
async function refreshEnrollment(env: any, eid: number): Promise<void> {
  const rs: any = await env.DB.prepare(
    ROW_SQL + ` WHERE cs.source = ? AND COALESCE(cs.status, 'active') <> 'cancelled'`
  ).bind(SRC_PREFIX + eid).all();
  const gs = groupDirectClasses(rs?.results || []);
  if (!gs.length) return;
  const g = gs[0];
  const f = directEnrollmentFields(g);
  await env.DB.prepare(
    `UPDATE enrollments SET days_of_week = ?, time = ?, duration_min = ?, teacher_name = COALESCE(?, teacher_name),
            started_at = COALESCE(?, started_at), end_date = ?, updated_at = ? WHERE id = ?`
  ).bind(f.days_of_week, f.time, f.duration_min, f.teacher_name, kstMidnight(g.first_date), f.end_date, Date.now(), eid).run();
}

export interface MergeResult {
  groups: number;
  rows: number;
  created_enrollments: number;
  attached_to_existing: number;
  linked_rows: number;
  failed: { key: string; detail: string }[];
}

/**
 * 주어진 수업 행(class_schedules, source='admin_ui')을 신청서로 잇는다.
 * rows 에는 ROW_SQL 모양(id·user_id·teacher_id·teacher_name·start_time·duration_min·scheduled_date·day_of_week·class_type·created_at)이 와야 한다.
 */
export async function mergeDirectRows(env: any, rows: any[], dry: boolean): Promise<MergeResult> {
  const out: MergeResult = { groups: 0, rows: 0, created_enrollments: 0, attached_to_existing: 0, linked_rows: 0, failed: [] };
  const groups = groupDirectClasses(rows || []);
  out.groups = groups.length;
  out.rows = groups.reduce((n, g) => n + g.ids.length, 0);
  if (dry) return out;
  const now = Date.now();
  for (const g of groups) {
    try {
      const f = directEnrollmentFields(g);
      /* 같은 묶음의 «살아 있는» 신청서가 있으면 거기에 붙인다 — 날짜마다 신청서가 생기지 않게 */
      const ex: any = await env.DB.prepare(
        `SELECT id FROM enrollments WHERE type = ? AND notes = ? AND status IN ('pending','confirmed','active') ORDER BY id DESC LIMIT 1`
      ).bind(DIRECT_ENROLL_TYPE, f.notes).first();
      let eid = Number(ex?.id || 0);
      if (eid) out.attached_to_existing++;
      else {
        const r: any = await env.DB.prepare(
          `INSERT INTO enrollments (student_user_id, student_name, package, started_at, status, notes, created_at, updated_at,
                                    days_of_week, time, type, teacher_name, end_date, duration_min)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(f.student_user_id, f.student_name, f.package, f.started_at, f.status, f.notes,
          g.created_at || now, now, f.days_of_week, f.time, f.type, f.teacher_name, f.end_date, f.duration_min).run();
        eid = Number(r?.meta?.last_row_id || 0);
        if (!eid) throw new Error('insert_no_id');
        out.created_enrollments++;
      }
      /* id 마다 한 줄 — IN 목록을 안 만든다(D1 바인드 100개 한도). source 가 아직 admin_ui 일 때만. */
      const stmt = env.DB.prepare(`UPDATE class_schedules SET source = ?, updated_at = ? WHERE id = ? AND source = 'admin_ui'`);
      const batch = g.ids.map((id) => stmt.bind(SRC_PREFIX + eid, now, id));
      for (let i = 0; i < batch.length; i += 50) {
        const res = await env.DB.batch(batch.slice(i, i + 50));
        for (const x of (res as any[])) out.linked_rows += Number(x?.meta?.changes || 0);
      }
      await refreshEnrollment(env, eid);
    } catch (e: any) {
      out.failed.push({ key: g.key, detail: String(e?.message || e).slice(0, 160) });
    }
  }
  return out;
}

/** 방금 등록한 수업 id 들을 읽어 신청서로 잇는다(POST /api/admin/class-schedules 뒤). 실패해도 던지지 않는다. */
export async function mergeDirectByIds(env: any, ids: number[]): Promise<MergeResult | null> {
  try {
    const rows: any[] = [];
    for (const id of ids.filter((n) => Number.isFinite(n) && n > 0)) {
      const r: any = await env.DB.prepare(ROW_SQL + ` WHERE cs.id = ? AND cs.source = 'admin_ui'`).bind(id).first();
      if (r) rows.push(r);
    }
    if (!rows.length) return null;
    return await mergeDirectRows(env, rows, false);
  } catch (e: any) {
    console.warn('[enroll-direct-merge] 신청서 연결 실패 — 수업은 그대로 등록됨:', e?.message || e);
    return null;
  }
}

/** 아직 신청서가 없는 «직접 배정» 수업 — 목록이 보여 주는 것과 같은 조건(취소 제외·30일 전 일회성 제외). */
export const UNMERGED_DIRECT_SQL = ROW_SQL +
  ` WHERE cs.source = 'admin_ui' AND COALESCE(cs.status, 'active') <> 'cancelled'
      AND (cs.scheduled_date IS NULL OR cs.scheduled_date = '' OR cs.scheduled_date >= date('now', '+9 hours', '-30 days'))
    ORDER BY cs.created_at DESC LIMIT 1000`;
