/**
 * 👥 그룹(1:N) 수업의 «한 방» 정본 — 2026-10-07
 * ─────────────────────────────────────────────────────────────────────────────
 * [무슨 일이 있었나]
 *   방 번호는 `class-{예약id}-{YYYYMMDD}` 로 결정론적이다(CLAUDE.md 0장). 그런데 그룹 수업은
 *   «학생마다 한 행» 이라(weekly-schedule·수강신청 확정 모두) 같은 수업의 학생 셋이 예약 id 셋을
 *   갖고, 그대로 방 번호를 만들면 **세 학생이 세 방으로 갈린다.** 교사는 자동 입장이
 *   «가장 가까운 한 수업» 을 고르므로 그중 한 방에만 들어가고, 나머지 학생은 혼자 기다린다.
 *   (2026-10-07 로컬 샌드박스 재현: 학생1→class-1 · 학생2→class-2 · 학생3→class-3 · 교사→class-1)
 *   운영 D1 실측(같은 날) 활성 1:N 수업은 0건 — 그래서 아무도 몰랐다.
 *
 * [규칙] 같은 날 «같은 강사 · 같은 시작 시각 · 같은 길이» 인 행들은 한 수업(합반)이다.
 *   이것은 새 규칙이 아니라 schedule-conflict.ts 의 «합반 예외» 와 **같은 판정**이다
 *   (거기서 이미 «같은 시각·같은 길이면 강사 겹침이 아니다» 로 허용하고 있다).
 *   그 무리의 방은 **가장 작은 예약 id** 로 정한다 → `class-{대표id}-{YYYYMMDD}`.
 *   ⟹ 1:1 수업(무리가 자기 하나)은 대표가 자기 자신이라 **방 번호가 한 글자도 안 바뀐다.**
 *
 * ⛔ 대표를 정하는 근거를 «호출한 쪽이 이미 읽은 행» 으로 두지 말 것 — 학생 화면은 자기 행만,
 *    강사 화면은 자기 행 전부를 읽으므로 각자 최소값이 달라진다. 여기서 **DB 를 다시 읽어** 정한다.
 * ⛔ 실패하면 막지 않는다(fail-open) — 빈 Map → 각자 자기 id = 고치기 전과 같다.
 * ⚠️ 취소(cancelled)만 뺀다. 연기된 행도 무리에 남긴다 — 빼면 대표가 바뀌어 방이 움직인다.
 * ⚠️ 자리표시(lms·type_seed)는 학생이 아니라 무리에 넣지 않는다(CLAUDE.md 2장 LMS 자리표시).
 */
import { selectInChunks } from './d1-chunk';

const PLACEHOLDER_UIDS = new Set(['lms', 'type_seed']);

/** '9:5' · '09:05' · '09:05:00' → '09:05'. 못 읽으면 '' */
export function normHM(t: any): string {
  const m = /^(\d{1,2}):(\d{1,2})/.exec(String(t ?? '').trim());
  if (!m) return '';
  const h = Number(m[1]), mi = Number(m[2]);
  if (!(h >= 0 && h < 24 && mi >= 0 && mi < 60)) return '';
  return String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0');
}

/** 길이 — sessions/today 와 같은 기본값(30) */
function durOf(r: any): number { return Number(r && r.duration_min) > 0 ? Number(r.duration_min) : 30; }

/** 무리를 가르는 열쇠. 강사가 없거나 자리표시면 null(= 혼자). */
export function groupKeyOf(r: any): string | null {
  if (!r) return null;
  const tid = String(r.teacher_id ?? '').trim();
  if (!tid) return null;
  if (PLACEHOLDER_UIDS.has(String(r.user_id ?? '').trim().toLowerCase())) return null;
  const hm = normHM(r.start_time);
  if (!hm) return null;
  return tid + '|' + hm + '|' + durOf(r);
}

const DOW: Record<string, number> = {
  sun: 0, sunday: 0, '일': 0, '일요일': 0, mon: 1, monday: 1, '월': 1, '월요일': 1,
  tue: 2, tues: 2, tuesday: 2, '화': 2, '화요일': 2, wed: 3, wednesday: 3, '수': 3, '수요일': 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, '목': 4, '목요일': 4, fri: 5, friday: 5, '금': 5, '금요일': 5,
  sat: 6, saturday: 6, '토': 6, '토요일': 6,
};
/** sessions/today 의 dowMatches 와 같은 폭(숫자·영문·한글·나열) */
export function dowHits(raw: any, target: number): boolean {
  for (const p of String(raw ?? '').split(/[,\s/·]+/)) {
    const q = p.trim();
    if (!q) continue;
    if (/^\d+$/.test(q)) { if (Number(q) === target) return true; continue; }
    const v = DOW[q.toLowerCase()];
    if (v != null && v === target) return true;
  }
  return false;
}

/** 그 날짜에 열리는 행인가 — 날짜가 있으면 날짜가 이긴다(sessions/today 와 같은 순서) */
export function occursOn(r: any, dateStr: string): boolean {
  const sd = String(r && r.scheduled_date || '').trim();
  if (sd) return sd === dateStr;
  if (r && r.day_of_week != null && String(r.day_of_week).trim() !== '') {
    const dow = new Date(dateStr + 'T00:00:00Z').getUTCDay();
    return dowHits(r.day_of_week, dow);
  }
  return false;
}

/** 순수 함수 — 후보 행들로 {예약id → 대표id} 를 만든다. 무리 밖(혼자)인 행은 Map 에 안 넣는다. */
export function pickGroupLeads(candidates: any[], dateStr: string): Map<number, number> {
  const minByKey = new Map<string, number>();
  const keyById = new Map<number, string>();
  const countByKey = new Map<string, number>();
  for (const r of candidates || []) {
    if (!r || String(r.status ?? '').toLowerCase() === 'cancelled') continue;
    if (!occursOn(r, dateStr)) continue;
    const k = groupKeyOf(r);
    const id = Number(r.id);
    if (!k || !Number.isFinite(id)) continue;
    keyById.set(id, k);
    countByKey.set(k, (countByKey.get(k) || 0) + 1);
    const cur = minByKey.get(k);
    if (cur === undefined || id < cur) minByKey.set(k, id);
  }
  const out = new Map<number, number>();
  for (const [id, k] of keyById) {
    if ((countByKey.get(k) || 0) < 2) continue;      // 혼자 = 1:1 — 그대로 둔다
    out.set(id, minByKey.get(k)!);
  }
  return out;
}

/** 대표 id(무리 밖이면 자기 자신) */
export function leadIdOf(leads: Map<number, number> | null | undefined, id: any): number {
  const n = Number(id);
  return (leads && leads.get(n)) || n;
}

/** 방 번호 — `class-{대표id}-{YYYYMMDD}` */
export function groupRoomId(leads: Map<number, number> | null | undefined, id: any, ymd: string): string {
  return `class-${leadIdOf(leads, id)}-${String(ymd).replace(/-/g, '')}`;
}

const SELECT_COLS = `id, user_id, student_name, teacher_id, start_time, duration_min, scheduled_date, day_of_week, status`;

/**
 * DB 를 다시 읽어 «이 행들» 의 대표를 정한다. 그 날짜(dateStr = YYYY-MM-DD) 기준.
 * ⛔ 던지지 않는다 — 실패하면 빈 Map(= 고치기 전과 같은 방).
 */
export async function loadGroupLeads(env: any, rows: any[], dateStr: string): Promise<Map<number, number>> {
  try {
    const tids = Array.from(new Set((rows || []).map(r => String(r && r.teacher_id || '').trim()).filter(Boolean)));
    if (!tids.length || !env || !env.DB) return new Map();
    const cands = await selectInChunks<any>(env.DB, tids,
      (ph) => `SELECT ${SELECT_COLS} FROM class_schedules
                WHERE status != 'cancelled' AND CAST(teacher_id AS TEXT) IN (${ph})
                  AND (scheduled_date = ? OR COALESCE(scheduled_date, '') = '')`,
      { tail: [dateStr], swallowErrors: false });
    return pickGroupLeads(cands, dateStr);
  } catch (e) {
    console.warn('[group-room] leads 조회 실패 — 예약 id 그대로', (e as any)?.message);
    return new Map();
  }
}

/**
 * 예약 id 만 들고 있을 때(강사 화면·결석 감지·목록) — 강사 번호를 먼저 읽고 위 함수로 넘긴다.
 * ⛔ 던지지 않는다 — 실패하면 빈 Map.
 */
export async function loadGroupLeadsForIds(env: any, ids: any[], dateStr: string): Promise<Map<number, number>> {
  try {
    const nums = Array.from(new Set((ids || []).map(Number).filter(n => Number.isFinite(n) && n > 0)));
    if (!nums.length || !env || !env.DB) return new Map();
    const rows = await selectInChunks<any>(env.DB, nums,
      (ph) => `SELECT id, teacher_id FROM class_schedules WHERE id IN (${ph})`, { swallowErrors: false });
    return await loadGroupLeads(env, rows, dateStr);
  } catch (e) {
    console.warn('[group-room] ids 조회 실패 — 예약 id 그대로', (e as any)?.message);
    return new Map();
  }
}

/**
 * 합반 방에서 «이 학생» 이 들어왔는가 — 출석 행(room 안 role=student)으로 판정한다.
 *   1:1 방은 «학생이 한 명이라도 있으면 입장» 으로 충분했지만(absent-sweep 의 옛 규칙),
 *   합반은 한 명만 들어와도 나머지 전원이 «입장» 으로 보여 결석을 못 잡는다.
 * 'joined' = 계정·기기id·이름 중 하나가 맞음 · 'absent' = 확인된 다른 학생만 있음
 * 'unknown' = 신원 없는 학생 행이 있어 그 사람이 이 학생일 수도 있음 → 부르는 쪽은 알리지 않는다
 *   (거짓 «결석» 이 class_no_show → 급여·학부모 문자로 번지는 쪽이 더 나쁘다).
 */
export function studentJoinedIn(rows: any[], uid: any, name: any): 'joined' | 'absent' | 'unknown' {
  const u = String(uid ?? '').trim().toLowerCase();
  const n = String(name ?? '').trim();
  let anon = false;
  for (const r of rows || []) {
    const acc = String(r && r.account_uid || '').trim().toLowerCase();
    const dev = String(r && r.user_id || '').trim().toLowerCase();
    const un = String(r && r.username || '').trim();
    if (u && (acc === u || dev === u || un.toLowerCase() === u)) return 'joined';
    if (n && un === n) return 'joined';
    if (!acc) anon = true;
  }
  return anon ? 'unknown' : 'absent';
}

/** 무리 크기(대표 id → 인원). 화면이 «합반 N명» 을 말할 때 쓴다. */
export function groupSizes(leads: Map<number, number>): Map<number, number> {
  const out = new Map<number, number>();
  for (const lead of leads.values()) out.set(lead, (out.get(lead) || 0) + 1);
  return out;
}

/** `class-123-20261007` → { id:123, ymd:'20261007', date:'2026-10-07' } */
export function parseClassRoom(roomId: any): { id: number; ymd: string; date: string } | null {
  const m = /^class-(\d+)-(\d{4})(\d{2})(\d{2})$/.exec(String(roomId ?? '').trim());
  if (!m) return null;
  return { id: Number(m[1]), ymd: m[2] + m[3] + m[4], date: `${m[2]}-${m[3]}-${m[4]}` };
}

/**
 * 역방향 — 방 번호 → 그 수업의 행 전부(1:1 이면 그 행 하나).
 * 반환 null = 모름(조회 실패). [] = 그 예약이 없음.
 */
export async function loadGroupMembers(env: any, roomId: any): Promise<any[] | null> {
  const p = parseClassRoom(roomId);
  if (!p) return [];
  try {
    const lead: any = await env.DB.prepare(`SELECT ${SELECT_COLS} FROM class_schedules WHERE id = ? LIMIT 1`).bind(p.id).first();
    if (!lead) return [];
    const k = groupKeyOf(lead);
    if (!k || !occursOn(lead, p.date)) return [lead];
    const rs: any = await env.DB.prepare(
      `SELECT ${SELECT_COLS} FROM class_schedules
        WHERE status != 'cancelled' AND CAST(teacher_id AS TEXT) = ?
          AND (scheduled_date = ? OR COALESCE(scheduled_date, '') = '')`
    ).bind(String(lead.teacher_id), p.date).all();
    const all = ((rs && rs.results) || []) as any[];
    const members = all.filter(r => occursOn(r, p.date) && groupKeyOf(r) === k);
    if (!members.some(r => Number(r.id) === p.id)) members.unshift(lead);
    return members.sort((a, b) => Number(a.id) - Number(b.id));
  } catch (e) {
    console.warn('[group-room] members 조회 실패', (e as any)?.message);
    return null;
  }
}
