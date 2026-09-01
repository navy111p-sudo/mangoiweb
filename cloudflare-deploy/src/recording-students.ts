/**
 * 🎓 녹화 한 건에 «누가 학생이었나» 를 붙이는 정본
 * ════════════════════════════════════════════════════════════════════════
 *
 * [왜 필요한가 — 2026-09-01 사장님]
 *   관리자 「🎬 녹화 목록」의 「교사」 칸에는 `heyst`·`cys01`·`mby1` 같은 **학생 계정**이
 *   그대로 찍힌다. 그 방을 «먼저 켠 사람» 이 녹화 시작 요청을 보내고, 그 요청의
 *   `teacher_name` 을 서버가 그대로 적기 때문이다(학생이 먼저 들어오면 학생 이름이 적힌다).
 *   그래서 목록만 보고는 **그 수업이 어느 학생 것인지 알 수 없었다.** → 「학생」 칸을 만든다.
 *
 * [무엇을 근거로 «학생» 이라고 말하는가 — 두 가지뿐]
 *   ① 방 번호가 `class-<예약id>-<날짜>` 면 `class_schedules` 의 그 예약 행
 *      (`user_id`·`student_name`). 방 번호는 결정론적이라 어긋날 일이 없다.
 *   ② 녹화 행에 적힌 계정들(`participant_ids` ∪ `consented_user_ids`) 중
 *      **`students_erp` 에 실제로 있는 계정**. 「있으면 학생」이라 추측이 없다.
 *
 *   ⛔ 이름으로 사람을 찾지 않는다(CLAUDE.md 2장 「남의 이름이 뜸」). 여기 매칭은
 *      전부 `user_id`(PRIMARY KEY) **완전일치**다. 못 찾으면 **빈 값**으로 둔다.
 *   ⛔ `participant_names` 를 그대로 학생 이름으로 쓰지 않는다. 그 배열에는 교사 표시이름과
 *      «접속할 때마다 새로 생기는 임시 번호»(`z6nn4uhuwt95py0f4o6hvm` 같은)가 섞여 있다
 *      — 실측(2026-09-01): 최근 15건 중 9건이 그 임시 번호를 이름 자리에 갖고 있었다.
 *   ⚠️ 대소문자는 «적힌 그대로» 찾는다(NOCASE 아님). `students_erp.user_id` 는 BINARY PK 라
 *      `Kim`/`kim` 처럼 대소문자만 다른 행이 실재하는데(CLAUDE.md 2장), NOCASE 로 넓히면
 *      **둘 중 아무나** 집어 남의 이름을 붙이게 된다.
 *
 * [숨긴 계정(student_erp_override.hidden)은 거르지 않는다]
 *   그 기능은 «명부» 에서 중복 계정을 감추기 위한 것이다. 여기서 거르면 그 계정으로 찍힌
 *   녹화의 학생 칸이 **아무 설명 없이 비어** 「학생을 못 찾는 고장」처럼 보인다.
 *   이 화면은 명부가 아니라 «그 녹화가 누구 것인가» 를 말하는 자리라 사실대로 적는다.
 *
 * [실패하면 조용히 빈 값]
 *   이 조회가 죽어도 녹화 목록 자체는 그대로 떠야 한다 — 학생 칸만 «—» 가 된다.
 *   ⛔ 여기서 예외를 던지지 말 것.
 *
 * 감시: test-harness/recording_student_column_harness.mjs
 */

import { selectInChunks } from './d1-chunk';

export interface RecStudentEnv { DB: D1Database; [k: string]: any }

/** 녹화 목록에서 이 세 칸만 본다(테스트에서 가짜 행을 만들기 쉽게 최소로 잡는다). */
export interface RecRowLike {
  room_id?: string | null;
  participant_ids?: string | null;
  consented_user_ids?: string | null;
}

/** 화면이 그리는 한 사람 — 계정(uid)과 이름. 이름을 못 찾으면 uid 를 그대로 쓴다. */
export interface RecStudent {
  uid: string;
  name: string;
  /** 이 예약(class_schedules)의 학생인가 — 화면이 이 사람을 맨 앞에 놓는다. */
  scheduled?: boolean;
}

/** `["a","b"]` 문자열을 안전하게 문자열 배열로. 깨져 있으면 빈 배열. */
export function parseIdList(raw: any): string[] {
  if (Array.isArray(raw)) return raw.map(v => String(v || '').trim()).filter(Boolean);
  if (!raw) return [];
  try {
    const v = JSON.parse(String(raw));
    if (!Array.isArray(v)) return [];
    return v.map((x: any) => String(x == null ? '' : x).trim()).filter(Boolean);
  } catch { return []; }
}

/** `class-1086-20260901` → 1086. 공용방(`mangoi-class`·`meet-*`)이면 null. */
export function scheduleIdFromRoom(roomId: any): number | null {
  const m = /^class-(\d+)-/.exec(String(roomId || ''));
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return isNaN(n) ? null : n;
}

/**
 * 녹화 행 배열을 받아 **행마다** 학생 목록을 돌려준다(입력과 같은 순서·같은 길이).
 * 실패해도 던지지 않는다 — 전부 빈 배열이 된다.
 */
export async function resolveRecordingStudents(
  env: RecStudentEnv,
  rows: RecRowLike[],
): Promise<RecStudent[][]> {
  const out: RecStudent[][] = rows.map(() => []);
  if (!rows.length) return out;

  try {
    // ── ① 후보 모으기 ───────────────────────────────────────────────
    const schedIds = new Set<number>();
    const candidates: string[][] = rows.map(r => {
      const ids = parseIdList(r.participant_ids).concat(parseIdList(r.consented_user_ids));
      const seen = new Set<string>();
      return ids.filter(id => (seen.has(id) ? false : (seen.add(id), true)));
    });
    for (const r of rows) {
      const sid = scheduleIdFromRoom(r.room_id);
      if (sid != null) schedIds.add(sid);
    }

    // ── ② 예약 → 그 수업의 학생(계정·이름) ──────────────────────────
    const schedById = new Map<number, { uid: string; name: string }>();
    if (schedIds.size) {
      const srows = await selectInChunks<any>(
        env.DB, Array.from(schedIds),
        ph => `SELECT id, user_id, student_name FROM class_schedules WHERE id IN (${ph})`,
      );
      for (const s of srows) {
        schedById.set(Number(s.id), {
          uid: String(s.user_id || '').trim(),
          name: String(s.student_name || '').trim(),
        });
      }
    }

    // ── ③ 「이 계정이 학생인가」 + 실제 이름 ─────────────────────────
    const uidSet = new Set<string>();
    for (const list of candidates) for (const id of list) uidSet.add(id);
    for (const s of schedById.values()) if (s.uid) uidSet.add(s.uid);

    const nameByUid = new Map<string, string>();
    if (uidSet.size) {
      const erows = await selectInChunks<any>(
        env.DB, Array.from(uidSet),
        ph => `SELECT user_id, korean_name FROM students_erp WHERE user_id IN (${ph})`,
      );
      for (const e of erows) nameByUid.set(String(e.user_id), String(e.korean_name || '').trim());
    }

    // ── ④ 행마다 조립 ──────────────────────────────────────────────
    rows.forEach((r, i) => {
      const list: RecStudent[] = [];
      const used = new Set<string>();
      const sid = scheduleIdFromRoom(r.room_id);
      const sched = sid == null ? null : schedById.get(sid);

      // 예약에 적힌 학생이 맨 앞 — 「이 수업은 원래 누구 것인가」가 제일 중요하다.
      if (sched && sched.uid) {
        list.push({ uid: sched.uid, name: nameByUid.get(sched.uid) || sched.name || sched.uid, scheduled: true });
        used.add(sched.uid);
      }
      // 나머지는 «students_erp 에 실제로 있는 계정» 만. 임시 번호·강사 계정은 여기서 걸러진다.
      for (const uid of candidates[i]) {
        if (used.has(uid) || !nameByUid.has(uid)) continue;
        list.push({ uid, name: nameByUid.get(uid) || uid });
        used.add(uid);
      }
      out[i] = list;
    });
  } catch (e: any) {
    console.error('[recordings] 학생 칸 조회 실패(목록은 그대로 표시):', e?.message || e);
    return rows.map(() => []);
  }

  return out;
}
