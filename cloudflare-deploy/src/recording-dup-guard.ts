/**
 * 🎥 같은 방 «동시 녹화» 방지 — 판정 정본 (2026-09-08)
 * ─────────────────────────────────────────────────────────────────────────
 * [왜 만들었나 — 사장님 제보 「왜 자꾸 동시에 두번씩 녹화가 되는 거지?」]
 *   9/8 운영 D1 실측(class-* 방):
 *     class-1924 → 14:00:15 「교사 Teacher - Farrah」(강사 기기) + 14:01:58 「ysyt01」(학생 기기)
 *     class-2069 → 12:23:41 「교사 Teacher Kaye」        + 12:33:48 「mby1」
 *   두 파일은 **내용이 같다**(둘 다 화면 전체를 합성해 찍는다). 강사 기기 한 벌이
 *   1920×1080 소프트웨어 인코딩 + 약 200MB/24분 업로드를 실시간 영상과 같은 CPU·회선에서 한다.
 *
 *   2026-09-02 에 그걸 막으려고 화면 쪽에 「강사 기기는 자동 녹화 안 함」(isStaffSkipRecording)
 *   을 넣었는데, 날짜별로 갈렸다 — 9/4 강사 녹화 0건인데 9/8 은 4건.
 *   ⚠️ 왜 안 걸렸는지는 **아직 못 쟀다.** 후보 셋: ① 강사가 배지를 손으로 눌렀다(설계상 허용)
 *      ② 그 브라우저가 옛 index.html/mango-rec.js 를 캐시로 물고 있다 ③ 역할 판정이 학생으로 떨어졌다.
 *      recordings 표에 자동/수동 구분 칸이 없어 D1 만으로는 가릴 수 없다.
 *   ⟹ 그래서 이 게이트는 «왜» 를 묻지 않는다. 어느 경로로 오든 **두 번째를 거절**한다.
 *
 * [설계 원칙 — 「가장 수업에 덜 지장있는 것」(2026-09-08 사장님 지시)]
 *   막다가 녹화가 0벌이 되는 쪽이 두 벌보다 나쁘다. 그래서 모든 실패는 «찍는 쪽» 으로 떨어진다:
 *     · 조회가 실패했다(rows = null)            → 안 막는다
 *     · 살아있음 시각을 모른다(alive_at 없음)     → 그 행은 없는 셈 친다
 *     · 미래 시각이다                            → 믿지 않는다(안 막는다)
 *   ⛔ 이 방향을 뒤집지 말 것. 「되돌릴 수 없는 조작은 막는 쪽으로 실패」(CLAUDE.md)의 **반대**인데,
 *      여기서 잃는 것이 «수업 녹화 그 자체» 이기 때문이다.
 *
 * [무엇을 «살아 있다» 로 보나 — recording_parts.created_at]
 *   ⚠️ recordings 표에는 «마지막으로 살아 있었던 시각» 칸이 없다. 그래서 새 칸을 ALTER 로 붙이려다
 *      말았다 — 이 저장소의 지연 ALTER 는 없는 DB 에서 `no such column` 으로 조회를 죽인다.
 *      대신 **이미 있는** recording_parts.created_at(파트마다 서버가 찍는다)의 최댓값을 쓴다.
 *   · 파트는 5MiB 마다 올라간다 = 0.9Mbps 기준 약 47초. 회선이 나빠 화질이 내려가면 더 길어진다.
 *   · 첫 파트가 생기기 «전» 구간은 alive_at 이 started_at 으로 떨어진다(그때도 최근이라 살아 있음).
 *   ⟹ 창을 3분으로 둔다. 짧으면 느린 회선의 «살아 있는» 녹화를 죽은 것으로 봐 두 벌이 다시 생기고,
 *      길면 유령(브라우저가 신호 없이 죽은 행)이 그만큼 오래 남는다.
 *   ⚠️ 유령이 남아도 «영영» 은 아니다 — 막힌 기기가 60초마다 다시 시도하므로 창이 지나면 이어받는다
 *      (mango-rec.js 의 dupBlockedRetryAt). 최악의 손실은 그 3분이다.
 */

/** 같은 방에서 «아직 녹화 중» 인 행 (조회 결과 한 줄) */
export interface LiveRecordingRow {
  id?: number | null;
  teacher_name?: string | null;
  /** recording_parts.created_at 의 최댓값, 없으면 started_at */
  alive_at?: number | null;
}

export interface DupGateInput {
  /** 조회 결과. **null·undefined = «모른다»** 이고, 그때는 막지 않는다 */
  rows: LiveRecordingRow[] | null | undefined;
  now: number;
  /** 살아있음으로 볼 창 (기본 3분) */
  windowMs?: number;
}

export interface DupGateResult {
  block: boolean;
  /** 막았을 때 «누가 찍고 있나» — 화면이 사람에게 보여 준다 */
  by: string;
  /** 막은 상대 녹화의 id (로그용) */
  holderId: number | null;
  /** 판정 사유 — lookup_failed · none · stale · future · live */
  reason: 'lookup_failed' | 'none' | 'stale' | 'live';
}

/** 살아있음 창 — 3분. 근거는 파일 머리말 참고 */
export const REC_DUP_LIVE_WINDOW_MS = 3 * 60 * 1000;

/**
 * 시계 오차 허용치. 이보다 «앞선» 시각은 믿지 않는다.
 * ⚠️ 미래 시각을 살아 있음으로 세면, 잘못 적힌 행 하나가 그 방의 녹화를 영구히 막는다
 *    (CLAUDE.md 「미래 시각을 «살아 있음» 으로 세지 마세요」와 같은 이유).
 */
const FUTURE_SLACK_MS = 60 * 1000;

export function recordingDupGate(input: DupGateInput): DupGateResult {
  const pass = (reason: DupGateResult['reason']): DupGateResult =>
    ({ block: false, by: '', holderId: null, reason });

  // 조회 자체를 못 했다 = «모른다» → 찍게 둔다
  if (!input || !Array.isArray(input.rows)) return pass('lookup_failed');

  const now = Number(input.now);
  if (!Number.isFinite(now)) return pass('lookup_failed');

  const windowMs = Number.isFinite(input.windowMs as number) && (input.windowMs as number) > 0
    ? (input.windowMs as number)
    : REC_DUP_LIVE_WINDOW_MS;

  let sawRow = false;
  for (const r of input.rows) {
    if (!r) continue;
    sawRow = true;
    const alive = Number(r.alive_at);
    if (!Number.isFinite(alive) || alive <= 0) continue;      // 모르면 없는 셈
    if (alive > now + FUTURE_SLACK_MS) continue;              // 미래는 안 믿는다
    if (alive < now - windowMs) continue;                     // 너무 오래됨 = 유령
    const id = Number(r.id);
    return {
      block: true,
      by: String(r.teacher_name || '').trim(),
      holderId: Number.isFinite(id) ? id : null,
      reason: 'live',
    };
  }
  return pass(sawRow ? 'stale' : 'none');
}
