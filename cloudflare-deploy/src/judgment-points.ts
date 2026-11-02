/* 🪙 판단력 훈련 포인트 (2026-11-02 사장님 결정: 정답 1문제당 2P)
   정본 — 채점 경로(/api/judgment/answer)가 «부르기만» 합니다.

   ⛔ 화면이 보낸 정답(correct_index)으로 주지 않습니다 — 서버 KV 정답지(trusted)로 맞힌 것만.
      안 그러면 본문 한 줄(correct_index = 고른 번호)로 무한히 적립됩니다.
   ⛔ 같은 문항(sid)으로 두 번 주지 않습니다 — 다시 보내기·새로고침으로 불어나지 않게.
   ⛔ 본인 토큰(scope 'self')일 때만 — 관리자 세션이 학생 아이디로 보내도, 게스트도 적립하지 않습니다.
   ✅ 하루 상한은 정본 checkEarnAllowed — 게임·퀴즈 묶음(30점)과 하루 전체(100점) 안에서만.
   ✅ 던지지 않습니다 — 포인트가 채점을 막으면 안 됩니다(실패는 status:'unknown').
   반환 status: got · none(틀림) · not_trusted · guest · capped · dup · unknown */

export const JUDGMENT_RULE = 'judgment_correct';
export const JUDGMENT_POINTS = 2;

export type JudgmentPointResult = {
  status: 'got' | 'none' | 'not_trusted' | 'guest' | 'capped' | 'dup' | 'unknown';
  amount: number;
  earned_today: number | null;
  cap?: number | null;
  cap_error?: string | null;
};

type Deps = {
  checkEarnAllowed: (env: any, uid: string, code: string, amount: number) => Promise<{ ok: boolean; error?: string; cap?: number }>;
  applyPointTransaction: (env: any, p: any) => Promise<{ txnId?: any }>;
  ensurePointTables?: (env: any) => Promise<any>;
};

const KST_OFF = 9 * 3600 * 1000;
const todayStartMs = (now: number) => Math.floor((now + KST_OFF) / 86400000) * 86400000 - KST_OFF;

async function sumToday(env: any, uid: string, now: number): Promise<number | null> {
  try {
    const r: any = await env.DB.prepare(`SELECT COALESCE(SUM(amount),0) AS s FROM point_rule_log WHERE user_id=? AND rule_code=? AND triggered_at>=?`)
      .bind(uid, JUDGMENT_RULE, todayStartMs(now)).first();
    const n = Number(r?.s);
    return Number.isFinite(n) ? n : null;
  } catch { return null; }
}

export async function awardJudgmentPoint(env: any, a: {
  uid: string; scope: string; sid: string | null; trusted: boolean; correct: boolean; studentName?: string | null; now?: number;
}, deps: Deps): Promise<JudgmentPointResult> {
  const now = a.now ?? Date.now();
  const uid = String(a.uid || '');
  if (a.scope !== 'self' || !uid || /^guest/i.test(uid)) return { status: 'guest', amount: 0, earned_today: null };
  try {
    if (deps.ensurePointTables) await deps.ensurePointTables(env);
    if (!a.correct) return { status: 'none', amount: 0, earned_today: await sumToday(env, uid, now) };
    if (!a.trusted || !a.sid) return { status: 'not_trusted', amount: 0, earned_today: await sumToday(env, uid, now) };
    const sid = String(a.sid).slice(0, 80);
    const dup: any = await env.DB.prepare(`SELECT 1 AS x FROM point_rule_log WHERE user_id=? AND rule_code=? AND meta=? LIMIT 1`)
      .bind(uid, JUDGMENT_RULE, JSON.stringify({ sid })).first();
    if (dup) return { status: 'dup', amount: 0, earned_today: await sumToday(env, uid, now) };
    const allow = await deps.checkEarnAllowed(env, uid, JUDGMENT_RULE, JUDGMENT_POINTS);
    if (!allow.ok) return { status: 'capped', amount: 0, earned_today: await sumToday(env, uid, now), cap: allow.cap ?? null, cap_error: allow.error || null };
    const r = await deps.applyPointTransaction(env, {
      userId: uid, studentName: a.studentName || undefined, type: 'earn',
      amount: JUDGMENT_POINTS, reason: '판단력 훈련 정답', ruleCode: JUDGMENT_RULE,
    });
    await env.DB.prepare(`INSERT INTO point_rule_log (user_id, rule_code, amount, triggered_at, txn_id, meta) VALUES (?,?,?,?,?,?)`)
      .bind(uid, JUDGMENT_RULE, JUDGMENT_POINTS, now, r?.txnId ?? null, JSON.stringify({ sid })).run();
    return { status: 'got', amount: JUDGMENT_POINTS, earned_today: await sumToday(env, uid, now) };
  } catch (e: any) {
    console.warn('[judgment-points] skip:', e?.message || e);
    return { status: 'unknown', amount: 0, earned_today: null };
  }
}
