/* ═══════════════════════════════════════════════════════════════════════════
   👩‍🏫 화상방 번호 → 그 수업의 담당 강사 이름 (2026-10-08 신설)
   ───────────────────────────────────────────────────────────────────────────
   왜: 학생 상세 「수업」 탭의 접속 기록(attendance)은 방 번호만 들고 있다.
     예약방은 `class-{예약id}-{YYYYMMDD}` 로 결정론적이라 방 번호만으로
     «그 날 그 수업의 강사» 를 되찾을 수 있다.

   근거는 둘뿐:
     ① class_schedules.teacher_id (원부 번호)
     ② 그 날짜의 대체강사 오버레이 class_substitutions(status='active') — 있으면 이긴다
     → 이름은 정본 loadTeacherNameOf(원부 번호 → 계정 연결)로만.

   ⛔ attendance.teacher_name 을 쓰지 말 것 — 2026-08-18 동기화가 남의 이름을 넣었다(CLAUDE.md 2장).
   ⛔ 카페24 강사번호로 잇지 말 것 — 원부 번호와 겹치는 구간에서 다른 사람이다.
   ⚠️ 예약방이 아닌 방(meet-·mangoi-class·c24-)은 «모름» 이다 — 지어내지 않는다.
   ⚠️ 실패해도 던지지 않는다 — 이름만 비고 화면은 그대로 떠야 한다.
   ═══════════════════════════════════════════════════════════════════════════ */
import { selectInChunks } from './d1-chunk';
import { loadTeacherNameOf } from './student-schedule-summary';

/** `class-123-20261008` → { scheduleId:'123', date:'2026-10-08' }. 예약방이 아니면 null. */
export function parseClassRoom(roomId: any): { scheduleId: string; date: string } | null {
  const m = /^class-(\d+)-(\d{4})(\d{2})(\d{2})$/.exec(String(roomId ?? '').trim());
  if (!m) return null;
  return { scheduleId: m[1], date: `${m[2]}-${m[3]}-${m[4]}` };
}

/** 예약 행·대체 행을 받아 «방 번호 → 원부 강사 번호» 를 만든다(순수 함수 — 하니스가 그대로 돌린다). */
export function roomTeacherIds(
  roomIds: any[],
  schedRows: Array<{ id: any; teacher_id: any }>,
  subRows: Array<{ schedule_id: any; sub_date: any; substitute_teacher_id: any }>,
): Map<string, string> {
  const base = new Map<string, string>();
  for (const r of schedRows || []) {
    const t = String(r?.teacher_id ?? '').trim();
    if (t) base.set(String(r.id), t);
  }
  const sub = new Map<string, string>();
  for (const r of subRows || []) {
    const t = String(r?.substitute_teacher_id ?? '').trim();
    if (t) sub.set(String(r.schedule_id) + '|' + String(r.sub_date), t);
  }
  const out = new Map<string, string>();
  for (const rid of roomIds || []) {
    const p = parseClassRoom(rid);
    if (!p) continue;
    const t = sub.get(p.scheduleId + '|' + p.date) || base.get(p.scheduleId) || '';
    if (t) out.set(String(rid), t);
  }
  return out;
}

/** 방 번호 목록 → (방 번호 → 강사 이름) 조회 함수. 모르면 ''. */
export async function loadRoomTeacherNames(env: any, roomIds: any[]): Promise<(roomId: any) => string> {
  const none = () => '';
  try {
    const rooms = Array.from(new Set((roomIds || []).map((x: any) => String(x ?? '').trim()).filter((x) => parseClassRoom(x))));
    if (!rooms.length) return none;
    const ids = Array.from(new Set(rooms.map((r) => Number(parseClassRoom(r)!.scheduleId))));  // 숫자로 바인딩 — CAST 하면 기본키 인덱스를 못 탄다
    const sched = await selectInChunks(env.DB, ids,
      (ph) => `SELECT id, teacher_id FROM class_schedules WHERE id IN (${ph})`,
      { swallowErrors: true });
    const subs = await selectInChunks(env.DB, ids,
      (ph) => `SELECT schedule_id, sub_date, substitute_teacher_id FROM class_substitutions
                WHERE status = 'active' AND schedule_id IN (${ph})`,
      { swallowErrors: true });
    const tidOf = roomTeacherIds(rooms, sched as any[], subs as any[]);
    if (!tidOf.size) return none;
    const nameOf = await loadTeacherNameOf(env);
    return (roomId: any) => nameOf(tidOf.get(String(roomId ?? '').trim()) || '');
  } catch (e: any) {
    console.warn('[room-teacher]', e?.message || e);
    return none;
  }
}
