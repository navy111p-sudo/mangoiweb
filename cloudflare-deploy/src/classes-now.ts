/* 🔴 「예약 기준 지금 수업」 판정 정본  (GET /api/admin/classes-now)
 * ═══════════════════════════════════════════════════════════════════════════
 * [왜 이 파일이 따로 있나 — 2026-09-01]
 *   그 API 는 오래도록 `attendance` 의 `room_id LIKE 'c24-%'` 씨앗만 읽었다.
 *   그래서 **수강신청 확정으로 만든 망고아이 수업**(`class_schedules`,
 *   `source='adm-enroll:*'`)은 카페24에 기록이 없어 **한 번도 뜬 적이 없다.**
 *   실측(2026-09-01 21:52 KST): 그 시각 진행 중이던 망고아이 수업 8건
 *   (최윤서·김선우·김사랑·이수현·김연숙·박주형·김수희·지승연)이 전부 빠져 있었다.
 *   위쪽 «화상방 접속» 목록은 사람이 실제로 붙어야 뜨므로, 21:20 수업은 강사가
 *   들어온 21:23 까지 **어느 목록에도 없었다** — 정작 그때가 「왜 아직 아무도 안
 *   들어왔지」 하고 봐야 할 시각이다.
 *
 * [왜 «핸들러 안» 이 아니라 이 파일인가]
 *   여기서 틀리는 것은 전부 **문자열 검사로 안 보이는** 종류다 — 요일 표기,
 *   자정을 넘는 창, 미러 중복. 그래서 하니스가 **실제로 돌려** 볼 수 있게 순수
 *   함수로 뺐다(`test-harness/classes_now_mangoi_harness.mjs`).
 *
 * ⛔ 요일 파서를 여기서 새로 만들지 않는다 — `admDowMatches`(api-admin.ts)를
 *    **주입받는다.** 이 저장소는 같은 판정을 복제했다가 「학생은 수업이 보이는데
 *    매니저에게만 안 보이는」 사고를 이미 겪었다(2026-08-06).
 */
import { mirrorNoteClassId } from './c24-mirror';

/** 화면이 «참관 버튼을 달아도 되는가» 를 가르는 값. */
export type ClassesNowSource = 'mangoi' | 'cafe24';

export interface ClassesNowRow {
  room_id: string;
  start_kst: string; end_kst: string;
  start_ms: number; end_ms: number;
  student_name: string | null;
  teacher_name: string | null;
  cafe24_status: string | null;
  phase: 'soon' | 'now' | 'ended';
  connected: boolean;
  live_room: string | null;
  source: ClassesNowSource;
  /** 참관할 «방» 이 결정론적으로 있는가. 망고아이 수업은 아무도 안 붙어도 true. */
  observable: boolean;
  schedule_id: number | null;
  substituted?: boolean;
  substituted_from?: string | null;
  is_level_test?: boolean;
  c24_class_id?: string | null;
}

/** 접속 기록 한 줄(‘그 시간대에 정말 붙어 있었나’ 대조용). */
export interface LiveRow { user_id?: any; username?: any; room_id?: any; joined_at?: any; left_at?: any; last_seen_at?: any }

export interface ClassesNowWindow {
  now: number;
  /** 끝난 뒤 이만큼은 «방금 끝남» 으로 남긴다 */
  graceMs: number;
  /** 이만큼 앞서 시작하는 수업까지 «곧 시작» 으로 함께 보여 준다 */
  aheadMs: number;
}

const KST9 = 9 * 60 * 60 * 1000;
const p2 = (n: number) => String(n).padStart(2, '0');

/** UTC ms → KST 「HH:MM」 */
export function kstHm(ms: number): string {
  return new Date(ms + KST9).toISOString().slice(11, 16);
}
/** UTC ms → KST 「YYYY-MM-DD」 */
export function kstYmd(ms: number): string {
  return new Date(ms + KST9).toISOString().slice(0, 10);
}

/** 창의 «양끝» KST 날짜.
 *  ⚠️ 하루만 보면 23:50 에 다음 날 00:00 수업이 사라지고, 00:03 에 방금 끝난
 *     어제 수업이 사라진다. 그래서 반드시 양끝을 각각 본다(대개 1개, 자정 근처에서 2개). */
export function classesNowScanDates(w: ClassesNowWindow): string[] {
  return [...new Set([kstYmd(w.now - w.graceMs), kstYmd(w.now + w.aheadMs)])];
}

/** 그 접속 기록이 수업 시간과 겹치는가. */
export function liveOverlaps(lr: LiveRow, start: number, end: number, graceMs: number): boolean {
  const ls = Number(lr.joined_at) || 0;
  const le = Number(lr.left_at) || Number(lr.last_seen_at) || ls;
  return ls <= end + graceMs && le >= start - graceMs;
}

/** class_schedules 한 줄(이 판정이 읽는 칸만). */
export interface SchedRow {
  id: any; user_id?: any; student_name?: any; class_type?: any; source?: any; notes?: any;
  day_of_week?: any; scheduled_date?: any; start_time?: any; duration_min?: any; teacher_id?: any;
  t_name?: any; stu_ko?: any; stu_en?: any;
}

export interface MangoiDeps {
  /** 요일 표기 관용 파서 — 정본(api-admin.ts `admDowMatches`)을 주입받는다. */
  dowMatches: (raw: any, target: number) => boolean;
  /** 그 날짜의 1회성 대체강사 이름. 배정이 없으면 undefined(‘없음’과 ‘이름 모름’은 다르다). */
  subName?: (dateStr: string, scheduleId: any) => string | null | undefined;
  liveRows?: LiveRow[];
}

/** 🏷 이 목록에서 «수업이 아닌» 자리표시.
 *  ⛔ 문자열을 바꾸지 말 것 — `schedule-conflict.ts`·`enroll-ops.ts`·`api-admin.ts` 와 같은 값이어야 한다. */
export const CN_PLACEHOLDER_UIDS = ['lms', 'type_seed'];

/** class_schedules → 「지금 창」에 걸리는 망고아이 수업 줄들. */
export function buildMangoiClassesNow(rows: SchedRow[], w: ClassesNowWindow, deps: MangoiDeps): ClassesNowRow[] {
  const live = deps.liveRows || [];
  const out: ClassesNowRow[] = [];
  for (const d of classesNowScanDates(w)) {
    const kY = Number(d.slice(0, 4)), kMo = Number(d.slice(5, 7)) - 1, kD = Number(d.slice(8, 10));
    const dow = new Date(Date.UTC(kY, kMo, kD)).getUTCDay();
    const ymd = `${kY}${p2(kMo + 1)}${p2(kD)}`;
    for (const s of rows) {
      // 자리표시(옛 LMS 점유·시연 시드)는 진짜 수업이 아니다
      if (CN_PLACEHOLDER_UIDS.indexOf(String(s.user_id ?? '').toLowerCase()) >= 0) continue;

      // 오늘 열리는가 — 일회성=날짜 일치 / 반복=요일 일치
      // ⛔ Number() 로 비교하지 말 것: 운영 값에 'Thu'·'목'·'1,3,5' 가 섞여 있어 조용히 NaN 이 된다
      let occurs = false;
      if (s.scheduled_date) occurs = (String(s.scheduled_date).slice(0, 10) === d);
      else if (s.day_of_week != null && s.day_of_week !== '') occurs = deps.dowMatches(s.day_of_week, dow);
      if (!occurs) continue;

      const hm = String(s.start_time || '00:00').split(':');
      const start = Date.UTC(kY, kMo, kD, Number(hm[0]) || 0, Number(hm[1]) || 0, 0) - KST9;
      const end = start + ((Number(s.duration_min) || 30) * 60000);
      if (start > w.now + w.aheadMs) continue;    // 아직 멀었다
      if (end < w.now - w.graceMs) continue;      // 끝난 지 오래됐다

      const roomId = `class-${s.id}-${ymd}`;
      /* 접속 대조 — 방 번호가 결정론적이라 «그 방에 붙은 기록» 만 본다.
         ⛔ 이름으로 추측해 잇지 않는다(동명이인이 실재한다 — CLAUDE.md 2장). */
      let hit: LiveRow | null = null;
      for (const lr of live) {
        if (String(lr.room_id || '') === roomId && liveOverlaps(lr, start, end, w.graceMs)) { hit = lr; break; }
      }
      const sub = deps.subName ? deps.subName(d, s.id) : undefined;
      const origTeacher = s.t_name || null;

      out.push({
        room_id: roomId,
        start_kst: kstHm(start), end_kst: kstHm(end),
        start_ms: start, end_ms: end,
        // 명부 이름을 먼저 — class_schedules.student_name 은 옛 스냅샷일 수 있다
        student_name: s.stu_ko || s.student_name || s.stu_en || null,
        teacher_name: sub !== undefined ? sub : origTeacher,
        substituted: sub !== undefined,
        substituted_from: sub !== undefined ? origTeacher : null,
        cafe24_status: null,
        phase: start > w.now ? 'soon' : (end < w.now ? 'ended' : 'now'),
        connected: !!hit,
        /* ⛔ live_room 에 방 번호를 그냥 넣지 않는다 — 그 칸의 뜻은 «접속이 확인된 방» 이라,
           채우면 화면이 「접속 기록 없음」이라 쓰면서 접속했다고 말하는 셈이 된다.
           참관 버튼은 observable 로 가른다. */
        live_room: hit ? String(hit.room_id || '') : null,
        source: 'mangoi',
        observable: true,
        schedule_id: Number(s.id),
        is_level_test: /leveltest|level_test|level-test/i.test(String(s.source || '') + ' ' + String(s.notes || '')),
        c24_class_id: mirrorNoteClassId(s.notes),
      });
    }
  }
  return out;
}

/** 두 갈래를 합친다.
 *  🪞 카페24 미러가 만든 망고아이 행은 `notes` 에 `c24:<수업번호>` 를 달고 있고, 같은 수업이
 *     ①에도 `c24-<수업번호>` 로 있다 → **망고아이 쪽만 남긴다**(그쪽만 참관할 방이 있다). */
export function mergeClassesNow(c24: ClassesNowRow[], mangoi: ClassesNowRow[]): ClassesNowRow[] {
  const mirrored = new Set(
    mangoi.map(c => c.c24_class_id).filter(Boolean).map(id => `c24-${id}`)
  );
  return [...c24.filter(c => !mirrored.has(String(c.room_id))), ...mangoi]
    .sort((a, b) => (a.start_ms - b.start_ms) || String(a.room_id).localeCompare(String(b.room_id)));
}
