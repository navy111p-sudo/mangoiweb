// ═══════════════════════════════════════════════════════════════════════
// 🎥🤖 명부용 «트랙» — 화상+AI / AI만 (2026-09-24 사장님 「추천 조합으로 진행」)
//
// [판정 정본은 A.i 사용료 청구와 «같은» 것이다 — ai-billing.ts 의 LIVE_UIDS_SQL · loadLiveUids]
//   화상반 = 활성 예약(자리표시 제외) ∪ 카페24 예약 씨앗(최근 30일~) ∪ 망고아이 수업방 접속(최근 30일)
//   A.i반  = 재원(exec-summary.ts enrolledCond) − 화상반
//   ⛔ student-track.ts 의 resolveStudentTrack(활성 예약만)으로 명부를 칠하지 마세요 — 카페24 수업 학생
//      (청구 쪽 실측 화상반 496명 중 약 350명)이 전부 «AI만» 으로 잘못 나옵니다.
//      두 판정이 다르면 명부와 청구서가 서로 다른 인원을 말합니다.
//   ⚠️ resolveStudentTrack(레벨테스트 진단 상태)은 아직 좁은 규칙 그대로다 — 넓히면 진단 건이
//      «선생님 대기» 로 더 들어간다(사람이 정할 일). 여기서는 건드리지 않는다.
//
// [네 갈래]
//   'live_ai' 화상반 · 'ai_only' 재원 중인데 화상반 아님 · 'none' 재원도 화상도 아님(퇴원·휴원)
//   'unknown' 화상반 목록을 못 읽음 — ⛔ 'ai_only' 로 떨어뜨리지 않는다(청구 쪽과 같은 방향).
//
// ⛔ students_erp 에 이 값을 저장하지 않는다 — 카페24 야간 동기화가 덮어쓴다. 볼 때마다 계산.
// ═══════════════════════════════════════════════════════════════════════

import { loadLiveUids, LIVE_UIDS_SQL, LIVE_LOOKBACK_DAYS } from './ai-billing';   // 🎥 화상반 판정 — A.i 사용료 청구와 같은 정본
import { enrolledCond } from './exec-summary';   // 재원 판정 정본

export type RosterTrack = 'live_ai' | 'ai_only' | 'none' | 'unknown';

/** 한 줄의 트랙. live 가 null(조회 실패)이면 'unknown'. 대소문자는 청구 쪽처럼 무시한다. */
export function rosterTrackOf(uid: any, enrolledNow: any, live: Set<string> | null): RosterTrack {
  if (!live) return 'unknown';
  const id = String(uid || '').trim().toLowerCase();
  if (!id) return 'unknown';
  if (live.has(id)) return 'live_ai';
  return Number(enrolledNow) === 1 ? 'ai_only' : 'none';
}

/** 명부 행들에 track 칸을 붙인다(한 번만 조회). 돌려주는 값은 조회 성공 여부. */
export async function attachRosterTracks(env: any, rows: any[]): Promise<boolean> {
  const live = await loadLiveUids(env);
  for (const r of rows) {
    if (!r) continue;
    r.track = rosterTrackOf(r.user_id, r.enrolled_now, live);
  }
  return !!live;
}

/** «이 행이 지금 재원인가» — 명부 SELECT 에 끼워 넣는 칸 식(별칭 필수). */
export function enrolledNowExpr(alias: string): string {
  return `CASE WHEN ${enrolledCond(alias)} THEN 1 ELSE 0 END`;
}

export interface TrackOrgRow { franchise: string; shop_name: string; live: number; ai_only: number }
export interface TrackSummary {
  ok: boolean;
  live: number;
  ai_only: number;
  orgs: TrackOrgRow[];
  lookback_days: number;
}

/**
 * 스코프 전체(명부 1000명 제한과 무관)의 두 무리 인원 — 대리점(shop_name) 단위로 묶어 준다.
 *   scopeCond/hiddenCond 는 별칭 's' 기준 조각(없으면 빈 문자열).
 * ⚠️ 실패하면 ok:false · 숫자 0 — 부르는 쪽은 «모름» 으로 그린다(0명으로 그리지 않는다).
 * ⚠️ 화상반 목록은 SQL 안에서 한 번 만든다(IN 비상관 서브쿼리 — 행마다 다시 안 만든다).
 */
export async function loadTrackSummary(env: any, scopeCond: string, scopeBinds: any[], hiddenCond: string): Promise<TrackSummary> {
  const fail: TrackSummary = { ok: false, live: 0, ai_only: 0, orgs: [], lookback_days: LIVE_LOOKBACK_DAYS };
  try {
    const since = Date.now() - LIVE_LOOKBACK_DAYS * 86400 * 1000;
    const where = [scopeCond, hiddenCond].filter(Boolean).join(' AND ');
    const sql = `WITH lv AS (SELECT DISTINCT LOWER(uid) AS u FROM (${LIVE_UIDS_SQL}))
      SELECT COALESCE(NULLIF(TRIM(s.franchise),''),'') AS franchise,
             COALESCE(NULLIF(TRIM(s.shop_name),''),'') AS shop_name,
             SUM(CASE WHEN LOWER(s.user_id) IN (SELECT u FROM lv) THEN 1 ELSE 0 END) AS live_n,
             SUM(CASE WHEN LOWER(s.user_id) NOT IN (SELECT u FROM lv) AND (${enrolledCond('s')}) THEN 1 ELSE 0 END) AS ai_n
        FROM students_erp s
       ${where ? 'WHERE ' + where : ''}
       GROUP BY 1, 2`;
    const r = await env.DB.prepare(sql).bind(since, since, ...scopeBinds).all();
    const orgs: TrackOrgRow[] = [];
    let live = 0, ai = 0;
    for (const x of (r.results || []) as any[]) {
      const l = Number(x.live_n) || 0, a = Number(x.ai_n) || 0;
      if (!l && !a) continue;
      live += l; ai += a;
      orgs.push({ franchise: String(x.franchise || ''), shop_name: String(x.shop_name || ''), live: l, ai_only: a });
    }
    orgs.sort((p, q) => (q.live + q.ai_only) - (p.live + p.ai_only));
    return { ok: true, live, ai_only: ai, orgs, lookback_days: LIVE_LOOKBACK_DAYS };
  } catch (e: any) {
    console.warn('[student-track] summary failed:', e && e.message);
    return fail;
  }
}
