/* 🚪 «학생이 다른 방에 있어요» — 강사 화면용 (2026-10-21)
   ═══════════════════════════════════════════════════════════════════════════
   [왜] 필리핀 강사 요청(BODA 처럼 «학생 방에 직접 들어가기»): 학생과 강사가 서로 다른 방에
        앉아 20분을 보내는 사고가 실제로 났다(2026-10-06 delaware — 쌍둥이 계정의 옛 예약방).
        관리자·매니저 화면에는 그 감시가 있지만(src/room-mismatch.ts), 정작 방에서 기다리는
        «강사 자신» 의 화면(teacher.html 「오늘 수업」)에는 아무 표시가 없었다.

   [판정] 강사 «자기» 수업 하나마다(kind='class' · 취소·연기 아님 · 학생 계정 있음 ·
          지금이 시작 15분 전 ~ 닫힘 사이):
     ① 그 학생 계정(대소문자 무시 · 쌍둥이 `X`↔`mangoai_X`)이 «지금 접속 중» 이고
     ② 그 접속이 이 수업 방(오늘은 이 방 지정까지 반영한 room_id)이 «아닌» 방이고
     ③ 이 수업 방에는 그 학생의 접속이 하나도 없으면
     → c.student_elsewhere = { room, room_kind, others, via_twin, seen_at }
     · «지금 접속 중» 은 room-mismatch.ts 의 isLiveNow 와 같은 기준이다(최근 3분 + 퇴장 기록 없음).
       ⛔ 기준을 여기에 다시 적지 않는다 — 화면마다 «지금» 이 달라진다.
     · 계정은 attendance.account_uid 로만 잇는다 — user_id 는 접속마다 새로 나오는 기기
       임시번호라 계정이 아니다(CLAUDE.md 2장 출결 항목). ⛔ 이름으로 잇지 않는다(동명이인).

   [room-mismatch.ts 와 다른 점 — 일부러]
     · 그쪽은 «예약방에 누군가 접속 중» 일 때만 울린다(관리자 화면의 소음 방지).
       여기는 그 조건을 «안» 건다 — 강사는 대개 예약방을 나와 이 화면(포털)을 보고 있는데,
       그 조건을 걸면 정작 이 화면을 볼 때 경고가 사라진다.

   [안전]
     · 읽기 전용이다 — 아무 방도 옮기거나 끊지 않는다. 들어갈지는 강사가 정한다.
     · others(그 방에 학생 말고 몇 명이 더 있나)를 함께 실어, 강사가 «남의 수업» 에
       들어가기 전에 화면이 확인을 받게 한다. ⛔ 그 사람들의 이름은 싣지 않는다
       (강사가 원래 못 보는 정보다).
     · 수업 관찰(투명 참관)은 여기서 열지 않는다 — 매니저 전용 그대로다.
     · 던지지 않는다(fail-open) — 조회가 실패하면 아무것도 안 붙는다(예전 화면 그대로).

   감시: test-harness/teacher_student_elsewhere_harness.mjs */

import { isLiveNow, LIVE_FRESH_MS } from './room-mismatch';
import { twinCandidate } from './student-alias';

/** 시작 몇 분 전부터 보나 — 학생이 일찍 들어와 엉뚱한 방에 앉아 있는 경우까지 잡는다. */
export const ELSEWHERE_LEAD_MS = 15 * 60 * 1000;
/** 접속 행을 얼마나 거슬러 읽나 — joined_at 인덱스로 자른다(오래 앉아 있는 공용방 학생 포함). */
export const ELSEWHERE_SCAN_MS = 12 * 60 * 60 * 1000;

export interface ElsewhereLive {
  account_uid?: any; user_id?: any; room_id?: any; last_seen_at?: any; left_at?: any;
}
export interface StudentElsewhere {
  room: string;
  room_kind: 'public' | 'meeting' | 'class' | 'other';
  others: number;
  via_twin: boolean;
  seen_at: number;
}

/** 방 종류 — 화면 문구를 고르는 데만 쓴다. 순수 함수. */
export function roomKindOf(room: string): StudentElsewhere['room_kind'] {
  const r = String(room || '');
  if (r === 'mangoi-class') return 'public';
  if (/^meet-/i.test(r)) return 'meeting';
  if (/^class-\d+-\d{8}$/.test(r)) return 'class';
  return 'other';
}

/** 이 수업을 지금 볼 대상인가. 순수 함수. */
export function elsewhereEligible(c: any, now: number): boolean {
  if (!c || c.kind !== 'class') return false;
  if (c.class_state === 'cancelled' || c.class_state === 'postponed') return false;
  if (!String(c.student_uid || '').trim() || !String(c.room_id || '').trim()) return false;
  const st = Number(c.start_ts), close = Number(c.close_at_ts);
  if (!Number.isFinite(st) || !Number.isFinite(close)) return false;
  return now >= st - ELSEWHERE_LEAD_MS && now <= close;
}

/** 수업 하나에 대한 판정. 순수 함수 — 해당 없으면 null. */
export function findStudentElsewhere(c: any, live: ElsewhereLive[], now: number): StudentElsewhere | null {
  if (!elsewhereEligible(c, now)) return null;
  const uid = String(c.student_uid || '').trim().toLowerCase();
  const twin = String(twinCandidate(uid) || '').toLowerCase();
  const room = String(c.room_id || '');
  const alive = (live || []).filter(lr => isLiveNow(lr as any, now, LIVE_FRESH_MS) && String(lr.room_id || '') !== '');
  const acct = (lr: ElsewhereLive) => String(lr.account_uid ?? '').trim().toLowerCase();
  const mine = alive.filter(lr => { const a = acct(lr); return !!a && (a === uid || (!!twin && a === twin)); });
  if (!mine.length) return null;                                    // 학생이 지금 아무 데도 없다
  if (mine.some(lr => String(lr.room_id) === room)) return null;    // 이미 제자리(기기가 여럿이어도)
  // 가장 최근에 살아 있던 접속 하나를 «학생이 있는 방» 으로 본다
  const best = mine.slice().sort((a, b) => (Number(b.last_seen_at) || 0) - (Number(a.last_seen_at) || 0))[0];
  const sroom = String(best.room_id);
  // 그 방에 학생 말고 누가 있나 — 계정(없으면 기기번호)으로 사람을 센다
  const who = new Set<string>();
  for (const lr of alive) {
    if (String(lr.room_id) !== sroom) continue;
    const a = acct(lr);
    if (a && (a === uid || (!!twin && a === twin))) continue;
    const k = a || ('dev:' + String(lr.user_id ?? '').trim());
    if (k !== 'dev:') who.add(k);
  }
  return {
    room: sroom,
    room_kind: roomKindOf(sroom),
    others: who.size,
    via_twin: acct(best) !== uid,
    seen_at: Number(best.last_seen_at) || 0,
  };
}

/** 여러 수업에 판정을 붙인다(제자리에 붙임). 붙인 개수를 돌려준다. 순수 함수. */
export function markStudentElsewhere(classes: any[], live: ElsewhereLive[], now: number): number {
  let n = 0;
  for (const c of classes || []) {
    const r = findStudentElsewhere(c, live, now);
    if (r) { c.student_elsewhere = r; n++; }
  }
  return n;
}

/**
 * 강사 포털에서 부른다 — 대상 수업이 없으면 D1 을 아예 안 읽는다.
 * ⛔ account_uid 로 미리 거르지 않는다 — «그 방에 몇 명 더 있나»(others)는 계정 없는 접속
 *    (로그인 안 한 기기·계정이 안 실리는 강사 화면)까지 세어야 «0명» 이라는 거짓말을 안 한다.
 * ⚠️ 던지지 않는다. 조회가 실패하면 0 을 돌려주고 아무것도 안 붙는다(예전 화면 그대로).
 */
export async function applyStudentElsewhere(db: any, classes: any[], now: number): Promise<number> {
  try {
    if (!db || !(classes || []).some(c => elsewhereEligible(c, now))) return 0;
    const rs: any = await db.prepare(
      `SELECT account_uid, user_id, room_id, last_seen_at, left_at
         FROM attendance
        WHERE joined_at >= ? AND last_seen_at IS NOT NULL AND last_seen_at >= ?
        LIMIT 500`
    ).bind(now - ELSEWHERE_SCAN_MS, now - LIVE_FRESH_MS).all();
    return markStudentElsewhere(classes, (rs && rs.results) || [], now);
  } catch (e: any) {
    console.warn('[teacher-portal] student_elsewhere:', e?.message || e);
    return 0;
  }
}
