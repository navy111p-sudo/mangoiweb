/* 🚨 «같은 수업인데 서로 다른 방» 감시 (2026-10-07)
   ═══════════════════════════════════════════════════════════════════════════
   [왜] 2026-10-06 21:10 delaware(김연숙) — LEN 선생님은 예약방 class-4397 에, 학생은 쌍둥이 계정의
        옛 예약방 class-4379 에 각자 혼자 앉아 20분을 보냈다. 출석 기록에는 둘 다 «접속» 으로 남아
        어느 화면도 이상하다고 말하지 않았다(room-split-guard 는 «워커가 갈렸나» 만 본다).

   [판정] 지금 진행 중인 망고아이 수업(class_schedules) 하나마다:
     ① 그 수업의 학생 계정(예약 user_id · 대소문자 무시 · 쌍둥이 `X`↔`mangoai_X`)이
        «지금 접속 중» 인데
     ② 그 접속이 예약방(오늘은 이 방 지정까지 반영한 room_id)이 «아닌» 방이고
     ③ 예약방에는 누군가(대개 선생님)가 «지금 접속 중» 이면
     → 「서로 다른 방」 경고.
     · «지금 접속 중» = last_seen_at 이 최근 3분 안 + left_at 이 비어 있음
       (배포 보류 게이트의 실접속 판정과 같은 기준).
     · 계정은 attendance.account_uid 로만 잇는다 — attendance.user_id 는 접속마다 새로 나오는
       기기 임시번호라 계정이 아니다(CLAUDE.md 2장 출결 항목). ⛔ 이름으로 잇지 않는다(동명이인).
     · 쌍둥이는 이름 대조 없이 접두사로만 넓힌다 — 경고(읽기) 전용이라 «놓치는 것» 이 더 나쁘다.
       그래서 결과에 via_twin 을 실어 사람이 판단하게 한다.
   ⛔ 예약방이 비어 있으면 경고하지 않는다(선생님이 아직 안 온 것과 구별할 수 없다 — 소음).
   ⛔ 아무것도 고치지 않는다 — 방을 옮기거나 끊는 일은 사람이 한다.
   감시: test-harness/room_mismatch_harness.mjs */

import { twinCandidate } from './student-alias';

export const LIVE_FRESH_MS = 3 * 60 * 1000;

export interface MismatchClass {
  schedule_id: number | null;
  room_id: string;
  phase: string;
  student_name?: string | null;
  teacher_name?: string | null;
  start_kst?: string;
}
export interface MismatchLive { account_uid?: any; room_id?: any; last_seen_at?: any; left_at?: any }
export interface RoomMismatch {
  schedule_id: number | null;
  expected_room: string;
  student_room: string;
  student_name: string | null;
  teacher_name: string | null;
  start_kst: string | null;
  via_twin: boolean;
}

/** 지금 접속 중인 행인가. 순수 함수. */
export function isLiveNow(lr: MismatchLive, now: number, freshMs = LIVE_FRESH_MS): boolean {
  const seen = Number(lr && lr.last_seen_at) || 0;
  const left = lr && lr.left_at;
  return seen > 0 && seen >= now - freshMs && (left == null || left === '' || Number(left) === 0);
}

/** 순수 함수. uidOf(schedule_id) → 그 예약의 학생 계정(없으면 null). */
export function findRoomMismatches(
  classes: MismatchClass[], live: MismatchLive[], uidOf: (scheduleId: number) => string | null, now: number,
): RoomMismatch[] {
  const alive = (live || []).filter(lr => isLiveNow(lr, now) && String(lr.room_id || '') !== '');
  const out: RoomMismatch[] = [];
  for (const c of classes || []) {
    if (!c || c.phase !== 'now' || c.schedule_id == null) continue;
    const uid = String(uidOf(Number(c.schedule_id)) || '').trim().toLowerCase();
    if (!uid) continue;
    const twin = String(twinCandidate(uid) || '').toLowerCase();
    const isStu = (lr: MismatchLive) => {
      const a = String(lr.account_uid ?? '').trim().toLowerCase();
      return !!a && (a === uid || (!!twin && a === twin));
    };
    const room = String(c.room_id || '');
    const stu = alive.filter(isStu);
    if (!stu.length || stu.some(lr => String(lr.room_id) === room)) continue;   // 학생이 없거나 이미 제자리
    if (!alive.some(lr => String(lr.room_id) === room)) continue;              // 예약방이 비었으면 소음
    const wrong = stu[0];
    out.push({
      schedule_id: Number(c.schedule_id),
      expected_room: room,
      student_room: String(wrong.room_id),
      student_name: c.student_name || null,
      teacher_name: c.teacher_name || null,
      start_kst: c.start_kst || null,
      via_twin: String(wrong.account_uid ?? '').trim().toLowerCase() !== uid,
    });
  }
  return out;
}
