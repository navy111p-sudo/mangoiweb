/* ══════════════════════════════════════════════════════════════════════════
   🔎 「강사 미입장」이 정말 미입장이었나 — 출석 기록과 대조하는 판정 (2026-08-19)

   [왜 필요한가] `class_no_show` 의 «강사 미입장» 행은 **학생 브라우저가** 만든다.
     5분을 기다려도 상대가 화면에 안 보이면 신고하는 구조라, «상대가 안 왔다» 가 아니라
     «내 화면에 안 보였다» 가 기록된다. 두 사람이 서로 다른 워커의 방에 있던 동안
     (test.mangoi.co.kr = 기본 워커 / mangoi.ai = -prod, CLAUDE.md 0장·2장 참고
      — 🔴 2026-08-26 대시보드 실측 기준 **아직 갈려 있다.** 「8/19 에 -prod 로 합쳤다」는
        서술은 사실이 아니었고, 8/25 class-895 에서 같은 사고가 재발했다)
     강사는 매번 들어와 13분씩 수업 화면을 지키고 있었는데도 알림이 떴다.
     실측(2026-08-19): 강사 미입장 13건 중 **11건이 오판**. 강사 잘못이 아닌데
     그 숫자가 강사 90일 평가 지표에 그대로 들어가고 있었다.

   [고치는 방향] ⛔ 기록을 지우거나 고쳐 쓰지 않는다. 그때 학생이 못 본 것은 사실이고,
     지우면 «왜 수업이 성립하지 않았나» 라는 더 중요한 사실까지 사라진다.
     대신 **읽을 때 출석 기록과 대조해서 «오판» 이라고 함께 알려 준다.**

   [판정 규칙 — 안전한 방향으로만 틀리게]
     · 오판(=강사 있었음)으로 «올리는» 근거는 **이름 일치뿐**이다.
       ⛔ `attendance.role='teacher'` 만으로는 판정하지 않는다 — role 은 클라이언트가
          보내는 값이고, 「먼저 들어온 학생이 강사 역할을 받는다」 사고 전례가 있다
          (api-mango.ts verify-room 주석). 그걸 믿으면 **진짜 노쇼가 오판으로 감춰진다.**
     · 이름은 **낱말 경계**로 맞춘다. api-teacher.ts 의 계정↔원부 규칙과 같은 판정이다:
         살릴 것 : '교사 강선생님' → '강선생님' ⊂ '중국어 강선생님' (낱말 하나가 통째로)
         막을 것 : 'Anna' ⊂ 'H·ANNA·H'                            (낱말 속 우연)
     · 이름을 알 수 없으면(teacher_name 이 비었거나 출석행 username 이 전부 null)
       **'모름'(null)** 을 돌려준다. 모르는 것을 «오판» 이라고 단정하지 않는다.

   ⚠️ 판정을 두 벌 두지 않으려고 이 파일 하나로 모았다. 노쇼 리포트와 강사 90일 지표가
      같은 함수를 쓴다 — 한쪽만 고치면 화면마다 다른 답이 나온다(이 저장소의 단골 사고).
   ══════════════════════════════════════════════════════════════════════════ */
import { selectInChunks } from './d1-chunk';

/** 역할 접두사를 뗀다. 화상수업 입장 이름은 '교사 {이름}' 규약이다(teacher.html joinClass). */
const stripRolePrefix = (s: any): string =>
  String(s || '').replace(/^\s*(?:교사|강사|선생님|Teacher|Tutor)\s+/i, '').trim();

const nrm = (s: any): string => String(s || '').toUpperCase().trim();
/** 표기에서 실제로 쓰이는 구분자들 — '중국어 강선생님' · 'HT FARRAH' */
const words = (s: any): string[] => nrm(s).split(/[\s·・,/()[\]-]+/).filter(Boolean);

/** 낱말 경계로 같은 사람인가. api-teacher.ts 의 wordMatch 와 같은 규칙. */
export function sameTeacherByWord(a: any, b: any): boolean {
  const x = nrm(stripRolePrefix(a)), y = nrm(stripRolePrefix(b));
  if (!x || !y) return false;
  if (x === y) return true;
  return words(x).indexOf(y) >= 0 || words(y).indexOf(x) >= 0;
}

export interface TeacherPresence {
  /** true=있었음(오판) · false=흔적 없음(진짜) · null=판정 불가 */
  present: boolean | null;
  from: number | null;
  to: number | null;
  minutes: number | null;
}

export interface NoShowRowLike {
  room_id?: string | null;
  missing_role?: string | null;
  /** ⚠️ **이 이름 그대로** 실어 보낼 것. `AS tn` 같은 별칭만 두면 이름이 빈 값이 되어
   *   전부 «모름» 이 되고 오판이 하나도 안 걸러진다 — 에러 없이 조용히 무효화된다
   *   (2026-08-19 강사 90일 지표에서 실제로 밟음). */
  teacher_name?: string | null;
  /** 있으면 «강사와 학생 이름이 둘 다 걸리는» 애매한 접속을 걸러내는 데 쓴다(없어도 동작). */
  student_name?: string | null;
}

/**
 * 「강사 미입장」 행들에 대해 방마다 «강사가 실제로 접속해 있었는가» 를 판정한다.
 * @returns room_id → TeacherPresence (강사 미입장 행이 있는 방만 담긴다)
 *
 * ⚠️ 실패해도 던지지 않는다 — 이 대조는 **덤**이고, 노쇼 리포트 자체가 안 뜨면 더 나쁘다.
 *    조회가 실패하면 빈 Map 을 돌려주고 화면은 예전과 100% 동일하게 동작한다.
 */
export async function teacherPresenceByRoom(
  db: any,
  rows: NoShowRowLike[],
): Promise<Map<string, TeacherPresence>> {
  const out = new Map<string, TeacherPresence>();
  const nameOf = new Map<string, string>();
  const stuOf = new Map<string, string>();
  for (const r of rows || []) {
    if (String(r?.missing_role || '') !== 'teacher') continue;
    const room = String(r?.room_id || '').trim();
    if (!room) continue;
    // 같은 방에 노쇼 행이 두 개인 경우가 실제로 있다(중복 신고) → 이름은 처음 것만 쓴다.
    if (!nameOf.has(room)) {
      nameOf.set(room, String(r?.teacher_name || '').trim());
      stuOf.set(room, String(r?.student_name || '').trim());
    }
  }
  if (!nameOf.size) return out;

  const rooms = Array.from(nameOf.keys());
  let att: any[] = [];
  try {
    // ⚠️ D1 바인드 100개 한도 — 손으로 자르지 말고 공용 selectInChunks 를 쓴다(CLAUDE.md 2장).
    att = await selectInChunks<any>(db, rooms, (ph) =>
      `SELECT room_id, role, username, joined_at, COALESCE(left_at, last_seen_at) AS out_at
         FROM attendance WHERE room_id IN (${ph})`);
  } catch (e: any) {
    console.warn('[no-show-truth] attendance 조회 실패 — 대조 생략:', e?.message);
    return out;
  }

  const byRoom = new Map<string, any[]>();
  for (const a of att) {
    const k = String(a?.room_id || '');
    if (!k) continue;
    const list = byRoom.get(k) || [];
    list.push(a);
    byRoom.set(k, list);
  }

  for (const room of rooms) {
    const tname = nameOf.get(room) || '';
    const list = byRoom.get(room) || [];
    if (!tname) { out.set(room, { present: null, from: null, to: null, minutes: null }); continue; }
    // 이름이 붙은 출석행이 하나도 없으면 «판정 불가» 다 — «없었다» 가 아니다.
    const named = list.filter((a) => String(a?.username || '').trim());
    if (!named.length) { out.set(room, { present: null, from: null, to: null, minutes: null }); continue; }

    /* ⚠️ 낱말 경계는 «낱말 속 우연»(Anna ⊂ HANNAH)은 막지만 «낱말 자체가 겹치는» 경우는 못 막는다 —
       강사명이 한 낱말이면(예: 'Len') 같은 방의 다른 사람 'Len Kim' 이 걸린다.
       그 방향의 오판정은 **진짜 노쇼를 감추고 수업료를 전액 내보내므로** 가장 나쁘다.
       → 그 방의 «학생 이름» 에도 똑같이 걸리는 접속은 강사로 세지 않는다. 그렇게 걸러 낸 뒤
         남는 것이 없으면 «없었다» 가 아니라 **«모름»** 이다(모르는 것을 단정하지 않는다). */
    const sname = stuOf.get(room) || '';
    const hit = named.filter((a) => sameTeacherByWord(a.username, tname));
    const mine = sname ? hit.filter((a) => !sameTeacherByWord(a.username, sname)) : hit;
    if (!mine.length) {
      const ambiguous = hit.length > 0;   // 걸리긴 했는데 학생과 구분이 안 된다
      out.set(room, { present: ambiguous ? null : false, from: null, to: null, minutes: null });
      continue;
    }

    let from = Infinity, to = -Infinity;
    for (const a of mine) {
      const j = Number(a.joined_at || 0);
      const o = Number(a.out_at || 0);
      if (j > 0 && j < from) from = j;
      if (o > 0 && o > to) to = o;
    }
    const f = Number.isFinite(from) ? from : null;
    const t = to > 0 ? to : null;
    out.set(room, {
      present: true, from: f, to: t,
      minutes: (f && t && t > f) ? Math.round((t - f) / 60000) : null,
    });
  }
  return out;
}
