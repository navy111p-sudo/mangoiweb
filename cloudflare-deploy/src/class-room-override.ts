/**
 * 「오늘은 이 방으로」 — 예약된 수업 한 건을 하루만 다른 회의방으로 돌린다.
 * ─────────────────────────────────────────────────────────────────────────────
 * [왜 만들었나 — 2026-09-10 사장님 지시]
 *   예약이 있는 학생이 «그 방 말고 선생님이 지정한 회의방» 으로 가야 할 때, 지금은 길이
 *   사실상 없다. 로비의 ⚙️「방 코드 직접 입력」은 **0.22초만 열린다** —
 *   로비가 뜨고 +50ms 에 vcRestoreCredentials 가 방 코드 칸을 강제로 비우고,
 *   +220ms 에 자동 입장한다(index.html 의 원클릭 입장 블록 주석). 톱니는 접혀 있다.
 *   ⟹ 학생이 번호를 넣을 시간이 «구조적으로» 없다.
 *
 * [그래서 무엇을 하나]
 *   학생 화면은 한 글자도 안 바꾼다. 로비는 이미 「빈 칸이면 오늘 예약 방을 물어보고
 *   자동으로 채우는」 동작을 한다(js/idx-main.js — 「빈 방코드 → 오늘 예약 방으로 자동 교정」).
 *   **그 답만 바꾼다.** 그래서 학생이 하는 일은 «평소처럼 수업 입장을 누르는 것» 뿐이다.
 *
 * [만료를 표에 박아 둔 이유]
 *   `ymd` 자체가 열쇠의 일부다 — 「오늘 하루」가 **구조적으로** 보장되고 따로 지우는
 *   작업이 필요 없다. ⛔ 「만료 컬럼 + 청소 크론」 으로 바꾸지 말 것. 이 저장소는
 *   «지우는 일을 잊어 다음 수업까지 끌고 가는» 사고를 이미 여러 번 냈다.
 *
 * ⚠️ 방 이름 규칙은 **화면과 같은 말을 해야 한다.** 2026-09-09 에 정확히 그것이 갈려
 *    「같은 번호인데 다른 방」 사고가 났다(회의방 모달은 meet-1234, 로비는 1234).
 *    그래서 아래 meetRoomId() 는 js/idx-vc-room.js 의 normalize()+PREFIX 와 같은 규칙이고,
 *    `class_room_override_harness.mjs` 가 **두 규칙을 오려 내 실제로 돌려 답을 대조**한다.
 *    ⛔ 한쪽만 고치지 말 것.
 */

import { selectInChunks } from './d1-chunk';   // D1 바인드 100개 한도 정본

export type OverrideRow = {
  schedule_id: number;
  ymd: string;
  room_id: string;
  note: string | null;
  created_by: string;
  created_at: number;
};

/** 지정할 수 있는 방 — 회의방(meet-…) 하나뿐이다.
 *  ⛔ class-… (예약 수업방) 을 지정하게 열지 말 것 — 남의 수업방으로 학생을 보내는 길이 된다.
 *  ⛔ mangoi-class (공용 연습방) 도 안 된다 — 모르는 사람과 마주친다. */
export function meetRoomId(code: string): string {
  /* js/idx-vc-room.js 의 normalize() 와 «같은» 규칙. 한쪽만 고치면 안 된다. */
  const slug = String(code || '').trim().toLowerCase()
    .replace(/^meet-/, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9가-힣-]/g, '');
  return slug ? 'meet-' + slug : '';
}

/** 'YYYYMMDD' (KST). sessions/today 가 쓰는 것과 같은 눈금이어야 한다. */
export function kstYmd(nowMs: number): string {
  const d = new Date(nowMs + 9 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`;
}

export async function ensureRoomOverrideTable(db: any): Promise<void> {
  await db.exec(
    `CREATE TABLE IF NOT EXISTS class_room_override (` +
    `schedule_id INTEGER NOT NULL, ` +
    `ymd TEXT NOT NULL, ` +
    `room_id TEXT NOT NULL, ` +
    `note TEXT, ` +
    `created_by TEXT NOT NULL, ` +
    `created_at INTEGER NOT NULL, ` +
    `PRIMARY KEY (schedule_id, ymd)` +
    `)`
  );
}

/**
 * 세션 목록의 room_id 를 «오늘 지정된 방» 으로 갈아 끼운다.
 *
 * ⚠️ **조회가 실패하면 아무것도 안 바꾼다(fail-open).** 이 함수는 학생이 «입장을 누르는»
 *    경로에 있다. 표가 없거나 D1 이 흔들릴 때 던지면 그 순간 수업 입장이 통째로 막힌다.
 *    지정이 안 걸리면 예약방으로 가므로 «고치기 전» 과 같은 상태일 뿐이다.
 *    ⛔ 조용히 넘기지는 않는다 — console.warn 으로 남긴다.
 */
export async function applyRoomOverrides(
  db: any,
  sessions: any[],
  ymd: string,
): Promise<void> {
  if (!sessions || !sessions.length) return;
  const ids = sessions.map(s => Number(s.schedule_id)).filter(n => Number.isFinite(n));
  if (!ids.length) return;
  try {
    /* D1 바인드 100개 한도 — ⛔ 손으로 90개씩 자르지 않는다.
       공용 정본 `selectInChunks`(src/d1-chunk.ts)를 쓴다(CLAUDE.md 2장 「새 IN (...) 목록」).
       ⛔ swallowErrors 는 쓰지 않는다 — 청크 하나가 실패했는데 나머지를 이어 붙이면
          «비지는 않았지만 불완전한» 결과가 되어, 지정이 걸린 수업이 조용히 빠진다.
          던지면 아래 catch 가 받아 «예약방 그대로» 로 떨어진다(그쪽이 정직하다). */
    const rows = await selectInChunks<OverrideRow>(
      db, ids,
      (ph) => `SELECT schedule_id, ymd, room_id, note, created_by, created_at
                 FROM class_room_override
                WHERE ymd = ? AND schedule_id IN (${ph})`,
      { lead: [ymd] },
    );
    const map = new Map<number, OverrideRow>();
    for (const r of rows) map.set(Number((r as any).schedule_id), r);
    if (!map.size) return;
    for (const s of sessions) {
      const o = map.get(Number(s.schedule_id));
      if (!o) continue;
      const room = String(o.room_id || '');
      /* 읽을 때도 한 번 더 본다 — 표에 이상한 값이 들어가 있어도 학생을 엉뚱한 곳으로
         보내지 않는다(쓰는 쪽이 이미 거르지만, 여기가 마지막 문이다). */
      if (!/^meet-/.test(room)) continue;
      s.room_id_original = s.room_id;
      s.room_id = room;
      s.room_override = true;
      s.room_override_note = o.note || null;
    }
  } catch (e) {
    console.warn('[room-override] 조회 실패 — 예약방 그대로 진행합니다', e);
  }
}

/** 지정하기. 모르는 값은 거절한다(빈 문자열을 반환). */
export function validateOverrideInput(scheduleId: any, code: any): { ok: boolean; schedule_id: number; room_id: string; error?: string } {
  const sid = Number(scheduleId);
  if (!Number.isFinite(sid) || sid <= 0) return { ok: false, schedule_id: 0, room_id: '', error: 'bad_schedule_id' };
  const room = meetRoomId(code);
  if (!room || room === 'meet-') return { ok: false, schedule_id: sid, room_id: '', error: 'bad_room_code' };
  /* ⛔ 예약 수업방·공용방으로는 못 보낸다 — meetRoomId() 가 이미 meet- 를 붙이므로
     여기 걸리는 것은 사람이 'class-849-20260910' 처럼 통째로 넣은 경우다. */
  if (/^meet-(class|c24|room|demo|mangoi)-/.test(room)) return { ok: false, schedule_id: sid, room_id: '', error: 'bad_room_code' };
  return { ok: true, schedule_id: sid, room_id: room };
}

/**
 * 「이 강사가 그 수업의 담당인가」 — **모르면 false(막는 쪽)** 로 실패한다.
 *
 * ⚠️ 근거를 «결정론적인 둘» 로만 제한한다:
 *   ① `teacher_account_links` 의 계정→강사원부 연결(대소문자 무시 완전일치)
 *   ② `class_schedules.teacher_id` 에 **로그인 계정명이 그대로** 들어간 행
 *      (teachers 원부에 이름이 없는 `mangoi_0XX` 류 계정 — api-teacher.ts 가 쓰는 것과 같은 경로)
 *
 * ⛔ 이름 낱말경계 매칭(api-teacher.ts 3순위)은 **여기서는 쓰지 않는다.**
 *    거기는 «내 수업을 보여 준다» 라 못 보면 문의하면 끝이지만, 여기는 «남의 학생을 다른 방으로
 *    보낸다» 라 되돌릴 수 없다. 강사 번호가 세 갈래인 이 저장소에서 이름으로 이으면
 *    조용히 남의 수업이 붙는다(CLAUDE.md 2장 「강사 이름을 붙였는데 남의 이름이 뜸」).
 *    연결이 없는 강사는 본사에 계정 연결을 요청하면 된다.
 */
export async function teacherOwnsSchedule(env: any, actor: any, scheduleRow: any): Promise<boolean> {
  try {
    const username = String(actor?.username || '').trim();
    if (!username) return false;
    const sTid = String(scheduleRow?.teacher_id ?? '').trim();
    if (!sTid) return false;

    // ② 계정명이 그대로 teacher_id 인 경우
    if (sTid.toLowerCase() === username.toLowerCase()) return true;

    // ① 계정 → 강사원부 연결
    const link: any = await env.DB.prepare(
      `SELECT teacher_id FROM teacher_account_links WHERE username = ? COLLATE NOCASE LIMIT 1`
    ).bind(username).first().catch(() => null);
    const linked = String(link?.teacher_id ?? '').trim();
    if (linked && linked === sTid) return true;

    return false;
  } catch (e) {
    console.warn('[room-override] 담당 확인 실패 — 막습니다', e);
    return false;   // ⛔ 모르면 막는다
  }
}
