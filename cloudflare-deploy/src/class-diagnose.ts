/* 🔎 「이 학생의 오늘 수업, 양쪽이 어디에 들어갔나」 진단 (2026-10-01)
   ═══════════════════════════════════════════════════════════════════════════
   [왜] 2026-10-01 장지웅(jjy2323) 학생과 Win 강사가 «서로 못 만났고, 나중에 만났지만
        선생님 목소리가 학생에게 안 들렸다» 는 제보. 이걸 가르려면 그날 그 학생의
        ① 예약(어느 방이어야 했나) ② 실제 접속(누가 어느 방·어느 도메인으로 들어왔나)
        ③ 화상방 명단(vc_roster — 재접속 횟수) ④ 회선·소리 기록(vc_quality·spk_diag)
        를 한 화면에 모아야 하는데, 지금은 D1 콘솔에서 SQL 을 여러 번 쳐야만 보인다.
        → 관리자 주소 하나로 그 넷을 한 번에 돌려준다(읽기 전용).

   [쓰는 법] GET /api/admin/room-attendance?uid=<학생아이디>&date=YYYY-MM-DD
            (date 를 빼면 오늘 KST). 기존 ?room_id= 동작은 그대로다.

   ⛔ 아무것도 쓰지 않는다 — SELECT 뿐이다(개발·운영이 같은 DB, CLAUDE.md 1-1).
   ⛔ 판정하지 않는다 — «원인» 을 지어내지 않고 사실만 모은다. 다만 사람이 바로 읽게
      `hints` 에 «잰 것» 만 짧게 적는다(방이 둘로 갈렸다 · 강사 마이크 꺼짐 기록 등).
   ⚠️ 표·칸이 없는 DB 에서도 죽지 않게 각 조회를 따로 감싼다(못 읽은 것은 `errors` 에). */

import { selectInChunks } from './d1-chunk';

const KST = 9 * 3600000;

function dowMatches(raw: any, target: number): boolean {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return false;
  const map: Record<string, number> = {
    sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
    '일': 0, '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6,
  };
  return s.split(/[,\s/·]+/).some((p) => {
    if (!p) return false;
    if (/^[0-6]$/.test(p)) return Number(p) === target;
    const k = p.replace(/요일$/, '');
    const v = map[k] ?? map[k.slice(0, 3)];
    return v === target;
  });
}

export function kstDayRange(ymd: string): { start: number; end: number; dow: number; compact: string } {
  const start = new Date(ymd + 'T00:00:00.000Z').getTime() - KST;
  const dow = new Date(ymd + 'T00:00:00.000Z').getUTCDay();
  return { start, end: start + 86400000, dow, compact: ymd.replace(/-/g, '') };
}

/** 그 날짜에 열리는 예약인가 — 날짜가 있으면 날짜가 이긴다(sessions/today 와 같은 규칙). */
export function scheduleHitsDate(r: any, ymd: string, dow: number): boolean {
  const d = String(r?.scheduled_date ?? '').trim();
  if (d) return d.slice(0, 10) === ymd;
  return dowMatches(r?.day_of_week, dow);
}

const toKst = (ms: any) => {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n + KST).toISOString().slice(0, 19).replace('T', ' ');
};

export async function diagnoseStudentDay(env: any, uidRaw: string, ymdRaw: string | null) {
  const uid = String(uidRaw || '').trim();
  const ymd = /^\d{4}-\d{2}-\d{2}$/.test(String(ymdRaw || ''))
    ? String(ymdRaw)
    : new Date(Date.now() + KST).toISOString().slice(0, 10);
  const { start, end, dow, compact } = kstDayRange(ymd);
  const errors: string[] = [];
  const hints: string[] = [];

  // ① 예약
  let schedules: any[] = [];
  try {
    const rs: any = await env.DB.prepare(
      `SELECT cs.id, cs.user_id, cs.student_name, cs.teacher_id, t.name AS teacher_name,
              cs.scheduled_date, cs.day_of_week, cs.start_time, cs.duration_min,
              cs.status, cs.source, cs.schedule_kind
         FROM class_schedules cs LEFT JOIN teachers t ON t.id = cs.teacher_id
        WHERE cs.user_id = ? AND cs.status != 'cancelled'
        ORDER BY cs.start_time LIMIT 300`
    ).bind(uid).all();
    schedules = (rs.results || [])
      .filter((r: any) => scheduleHitsDate(r, ymd, dow))
      .map((r: any) => ({ ...r, expected_room: `class-${r.id}-${compact}` }));
  } catch (e: any) { errors.push('class_schedules: ' + String(e?.message || e)); }

  let overrides: any[] = [];
  if (schedules.length) {
    try {
      overrides = await selectInChunks(env.DB, schedules.map((x) => x.id),
        (ph) => `SELECT schedule_id, ymd, room_id, note, created_by, created_at FROM class_room_override
                  WHERE ymd = ? AND schedule_id IN (${ph})`, { lead: [ymd] });
    } catch { /* 표가 없으면 지정도 없다 */ }
  }
  const expectedRooms = new Set<string>(schedules.map((s) => s.expected_room));
  for (const o of overrides) if (o.room_id) expectedRooms.add(String(o.room_id));

  // ② 그날 그 학생이 «실제로» 들어간 방 (계정 칸 · 옛 기기칸 · 이름칸 모두)
  let mine: any[] = [];
  try {
    const rs: any = await env.DB.prepare(
      `SELECT * FROM attendance
        WHERE joined_at >= ? AND joined_at < ?
          AND (account_uid = ? OR user_id = ? OR username = ?)
        ORDER BY joined_at LIMIT 200`
    ).bind(start, end, uid, uid, uid).all();
    mine = rs.results || [];
  } catch (e: any) { errors.push('attendance(mine): ' + String(e?.message || e)); }
  const studentRooms = new Set<string>(mine.map((r) => String(r.room_id || '')).filter(Boolean));

  // ③ 그 방들(예약방 + 학생이 실제로 간 방)에 그날 누가 있었나
  const rooms = Array.from(new Set<string>([...expectedRooms, ...studentRooms])).slice(0, 40);
  let roomRows: any[] = [];
  let roster: any[] = [];
  let quality: any[] = [];
  if (rooms.length) {
    try {
      roomRows = await selectInChunks(env.DB, rooms,
        (ph) => `SELECT * FROM attendance WHERE joined_at >= ? AND joined_at < ? AND room_id IN (${ph})
                  ORDER BY joined_at LIMIT 400`, { lead: [start, end] });
    } catch (e: any) { errors.push('attendance(rooms): ' + String(e?.message || e)); }
    try {
      const rr: any[] = await selectInChunks(env.DB, rooms,
        (ph) => `SELECT room_id, name, account_uid, role, COUNT(*) AS connects,
                        MIN(updated_at) AS first_at, MAX(updated_at) AS last_at
                   FROM vc_roster WHERE updated_at >= ? AND updated_at < ? AND room_id IN (${ph})
                  GROUP BY room_id, account_uid, name, role ORDER BY room_id, first_at`, { lead: [start, end] });
      roster = rr.map((r: any) => ({ ...r, first_at: toKst(r.first_at), last_at: toKst(r.last_at) }));
    } catch (e: any) { errors.push('vc_roster: ' + String(e?.message || e)); }
    try {
      const qr: any[] = await selectInChunks(env.DB, rooms,
        (ph) => `SELECT * FROM vc_quality WHERE ts >= ? AND ts < ? AND room IN (${ph}) ORDER BY ts LIMIT 400`,
        { lead: [start, end] });
      quality = qr.map((r: any) => ({ ...r, ts_kst: toKst(r.ts) }));
    } catch (e: any) { errors.push('vc_quality: ' + String(e?.message || e)); }
  }

  const fmt = (r: any) => ({
    room_id: r.room_id, username: r.username, role: r.role, account_uid: r.account_uid ?? null,
    host: r.host ?? null, joined: toKst(r.joined_at), left: toKst(r.left_at),
    last_seen: toKst(r.last_seen_at), spk_diag: r.spk_diag ?? null, status: r.status,
  });

  // «잰 것» 만 짧게
  const realStudentRooms = Array.from(studentRooms).filter((r) => !/^c24-/.test(r));
  if (schedules.length && realStudentRooms.length && !realStudentRooms.some((r) => expectedRooms.has(r)))
    hints.push(`학생이 들어간 방(${realStudentRooms.join(', ')})이 예약방(${Array.from(expectedRooms).join(', ')})과 다릅니다.`);
  const hostsByRoom = new Map<string, Set<string>>();
  for (const r of roomRows) {
    if (!r.host) continue;
    const s = hostsByRoom.get(r.room_id) || new Set<string>();
    s.add(String(r.host)); hostsByRoom.set(r.room_id, s);
  }
  for (const [room, hs] of hostsByRoom) if (hs.size > 1) hints.push(`${room} 에 도메인이 ${hs.size}개(${Array.from(hs).join(', ')}) 섞여 있습니다.`);
  for (const r of roomRows) {
    if (r.spk_diag && /mic=0/.test(String(r.spk_diag)))
      hints.push(`${r.room_id} · ${r.username || r.user_id}: 마지막 보고에서 마이크가 꺼져 있었습니다 (${r.spk_diag}).`);
  }
  if (!schedules.length) hints.push('그 날짜에 열리는 예약이 없습니다(학생 입장이 공용방으로 갈 수 있습니다).');

  return {
    ok: true, uid, date: ymd,
    schedules, overrides,
    student_attendance: mine.map(fmt),
    room_attendance: roomRows.map(fmt),
    roster, quality, hints, errors,
  };
}
