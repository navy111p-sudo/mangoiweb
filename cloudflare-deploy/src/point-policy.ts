// ═══════════════════════════════════════════════════════════════
// 🪙 포인트 정책 정본 (2026-08-07 사장님 승인)
//
//   그동안 포인트는 «규칙표(point_rules)» 로만 굴러가서, 규칙마다 금액·한도가 따로 놀고
//   유효기간·교환 최소·회수 같은 «전체에 걸리는 규칙» 은 아예 없었다.
//   승인된 7가지를 여기 한 곳에 적어 두고, 각 창구가 이걸 읽게 한다.
//
//   ⚠️ 금액을 바꿀 일이 생기면 **여기만** 고친다. 화면 안내(GET /api/points/rules)도
//      같은 표를 읽으므로 «안내한 적 없는 규칙» 이 다시 생기지 않는다.
// ═══════════════════════════════════════════════════════════════

export const POINT_POLICY = {
  /** ① 적립 금액 — 승인된 4가지 */
  EARN: {
    attendance: 10,     // 출석 1회
    praise: 5,          // 칭찬 1개
    game_quiz_daily: 30, // 게임·퀴즈는 «하루 최대 30점»(횟수가 아니라 점수 상한)
    homework: 10,       // 숙제 제출
  },
  /** ② 하루 전체 상한 — 규칙을 몇 개 쓰든 하루에 이 점수를 넘지 않는다(과열 방지) */
  DAILY_TOTAL_CAP: 100,
  /** ③ 유효기간 — 마지막 «적립» 으로부터. 만료 30일 전에 한 번 알린다 */
  EXPIRY_MONTHS: 12,
  EXPIRY_NOTICE_DAYS: 30,
  /** ④ 교환 최소 단위 */
  MIN_REDEEM: 3000,
  /** ⑤ 환불·수업 취소 시 — 그 수업으로 받은 포인트만 회수. 이미 교환한 것은 회수하지 않는다 */
  CLAWBACK_ON_REFUND: true,
  /** ⑥ 체험(게스트) — 적립은 되되 교환은 불가 (기존 코드도 이미 이렇게 동작) */
  GUEST_CAN_EARN: true,
  GUEST_CAN_REDEEM: false,
  /** ⑦ 관리자 수동 조정 — 사유 필수 + 기록 영구 보관 */
  ADMIN_ADJUST_REASON_REQUIRED: true,
} as const;

/** 게임·퀴즈로 분류되는 규칙 — 이 묶음에 «하루 30점» 상한이 따로 걸린다. */
export const GAME_QUIZ_RULES = [
  'rescue_sentence', 'speech_master', 'ai_writing_rewrite',
  'micro_quiz_done', 'review_quiz_done', 'vocab_review', 'game_score',
];

const KST_OFF = 9 * 3600 * 1000;

/** KST 자정 기준 «오늘 시작» ms — 저장소 전체가 이 경계를 쓴다(today() 와 일치). */
export function kstDayStart(now = Date.now()): number {
  return Math.floor((now + KST_OFF) / 86400000) * 86400000 - KST_OFF;
}

/** 🎖 «오늘 다시 오지 않는» 마디 보상은 하루 총량 상한에서 뺀다.
 *
 *  [왜] 7일 연속 영작 보너스는 `wStreak % 7 === 0` 인 날에만 발화한다. 그날 상한에 걸려
 *    막히면 기록이 안 남고 다음 날은 wStreak=8 이라 조건이 거짓 — **그 마디는 영영 돌아오지
 *    않는다.** 50점은 상한의 절반이라 칭찬을 스무 번 받은 날이면 바로 걸린다.
 *    재시도할 자리가 없는 보상에 총량 상한을 걸면 «막는 것» 이 아니라 «빼앗는 것» 이 된다.
 *  ⛔ 여기에 «반복되는» 적립을 넣지 말 것 — 그 순간 상한이 뚫린다.
 *     들어올 자격은 「하루에 많아야 한 번 + 놓치면 다시 안 옴」 둘 다 만족할 때뿐이다. */
export const CAP_EXEMPT_RULES = ['ai_writing_streak', 'attendance_streak'];

/** 오늘 이 학생이 «적립» 으로 받은 점수 합계.
 *  ⚠️ 차감(spend)·회수만 빼는 게 아니라 **환불·관리자 지급도 뺀다** — 그 둘은 «오늘 벌었다» 가
 *     아니다. 3,000P 기프티콘 환불 한 건이 그날 적립을 통째로 막아 버리기 때문이다
 *     (applyPointTransaction 의 isCredit 이 refund·admin_grant 도 양수로 적는다). */
export async function earnedToday(env: any, userId: string): Promise<number> {
  try {
    const marks = CAP_EXEMPT_RULES.map(() => '?').join(',');
    const row: any = await env.DB.prepare(
      `SELECT COALESCE(SUM(amount),0) AS s FROM point_transactions
        WHERE user_id = ? AND amount > 0 AND created_at >= ?
          AND type = 'earn'
          AND (rule_code IS NULL OR rule_code NOT IN (${marks}))`
    ).bind(userId, kstDayStart(), ...CAP_EXEMPT_RULES).first();
    return Number(row?.s || 0);
  } catch { return 0; }   // 못 세면 막지 않는다 — 적립이 조회 실패로 죽으면 안 된다
}

/** 게임·퀴즈 묶음으로 오늘 받은 점수 합계 (하루 30점 상한용). */
export async function earnedTodayForGames(env: any, userId: string): Promise<number> {
  try {
    const marks = GAME_QUIZ_RULES.map(() => '?').join(',');
    const row: any = await env.DB.prepare(
      `SELECT COALESCE(SUM(amount),0) AS s FROM point_transactions
        WHERE user_id = ? AND amount > 0 AND created_at >= ? AND rule_code IN (${marks})`
    ).bind(userId, kstDayStart(), ...GAME_QUIZ_RULES).first();
    return Number(row?.s || 0);
  } catch { return 0; }
}

/**
 * 적립해도 되는지 판정. 넘치면 «깎아서라도» 주지 않고 그냥 막는다 —
 * 반쪽 적립은 학생에게 «왜 5점만 들어왔지?» 라는 더 큰 혼란이 된다.
 */
export async function checkEarnAllowed(
  env: any, userId: string, ruleCode: string, amount: number
): Promise<{ ok: boolean; error?: string; cap?: number; used?: number }> {
  // 🎖 다시 오지 않는 마디 보상은 상한을 지나지 않는다(위 CAP_EXEMPT_RULES 주석 참고)
  if (CAP_EXEMPT_RULES.includes(ruleCode)) return { ok: true };
  const today = await earnedToday(env, userId);
  if (today + amount > POINT_POLICY.DAILY_TOTAL_CAP) {
    return { ok: false, error: 'daily_total_cap_reached', cap: POINT_POLICY.DAILY_TOTAL_CAP, used: today };
  }
  if (GAME_QUIZ_RULES.includes(ruleCode)) {
    const g = await earnedTodayForGames(env, userId);
    if (g + amount > POINT_POLICY.EARN.game_quiz_daily) {
      return { ok: false, error: 'game_daily_cap_reached', cap: POINT_POLICY.EARN.game_quiz_daily, used: g };
    }
  }
  return { ok: true };
}

/** 승인된 금액을 규칙표에 반영(멱등). 규칙이 없으면 만들고, 있으면 금액만 맞춘다. */
export async function syncApprovedRuleAmounts(env: any): Promise<void> {
  const now = Date.now();
  const rows: Array<[string, string, number, string]> = [
    ['attendance', '출석', POINT_POLICY.EARN.attendance, '수업에 출석하면 지급'],
    ['teacher_praise_point', '선생님 칭찬 포인트', POINT_POLICY.EARN.praise, '수업 중 선생님이 준 칭찬 1개당 지급'],
    ['homework_submit', '숙제 제출', POINT_POLICY.EARN.homework, '숙제를 제출하면 지급'],
  ];
  for (const [code, label, amount, desc] of rows) {
    try {
      await env.DB.prepare(
        `INSERT INTO point_rules (code, label, amount, cooldown_sec, daily_cap, enabled, description, updated_at)
              VALUES (?,?,?,0,NULL,1,?,?)
         ON CONFLICT(code) DO UPDATE SET amount = excluded.amount, updated_at = excluded.updated_at`
      ).bind(code, label, amount, desc, now).run();
    } catch { /* 규칙표가 아직 없으면 다음 호출에서 맞춰진다 */ }
  }
}

// ── ③ 유효기간 ────────────────────────────────────────────────────
//   «마지막 적립일 + 12개월» 에 소멸. 30일 전에 한 번 알린다.
//   ⚠️ 알림·소멸 모두 **한 번만** 일어나야 한다 → point_expiry_log 로 멱등 보장.
//   ⚠️ 잔액이 0이면 아무것도 하지 않는다(알릴 것도 소멸시킬 것도 없다).

async function ensureExpiryLog(env: any): Promise<void> {
  await env.DB.exec(
    `CREATE TABLE IF NOT EXISTS point_expiry_log (` +
    `id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, kind TEXT NOT NULL, ` +
    `due_at INTEGER, amount INTEGER, created_at INTEGER NOT NULL, UNIQUE(user_id, kind, due_at))`
  );
}

const MONTH_MS = 30 * 86400000;   // 안내·소멸 판정용 근사(달력 달을 정확히 셀 필요는 없다)

export interface ExpirySweepResult {
  ok: boolean; checked: number; notified: number; expired: number; error?: string;
}

/**
 * 하루 1회 도는 소멸 처리. dryRun 이면 셈만 하고 아무것도 바꾸지 않는다.
 * 반환값을 로그로 남겨 «몇 명에게 알렸고 몇 명이 소멸됐는지» 를 눈으로 볼 수 있게 한다.
 */
export async function runPointExpirySweep(
  env: any, opts: { dryRun?: boolean } = {}
): Promise<ExpirySweepResult> {
  const out: ExpirySweepResult = { ok: true, checked: 0, notified: 0, expired: 0 };
  try {
    await ensureExpiryLog(env);
    const now = Date.now();
    const lifeMs = POINT_POLICY.EXPIRY_MONTHS * MONTH_MS;
    const noticeMs = POINT_POLICY.EXPIRY_NOTICE_DAYS * 86400000;

    // 잔액이 남아 있고 마지막 적립이 «안내 시점» 을 지난 사람만 본다.
    const rs = await env.DB.prepare(
      `SELECT user_id, student_name, balance, last_earned_at FROM student_points
        WHERE balance > 0 AND last_earned_at IS NOT NULL AND last_earned_at <= ?
        ORDER BY last_earned_at ASC LIMIT 500`
    ).bind(now - (lifeMs - noticeMs)).all();

    for (const r of (rs.results || []) as any[]) {
      out.checked++;
      const dueAt = Number(r.last_earned_at) + lifeMs;
      const uid = String(r.user_id);

      if (now >= dueAt) {
        // 소멸 — 잔액 전부를 회수 거래로 남긴다(그냥 0으로 덮으면 이유가 안 남는다).
        const dup: any = await env.DB.prepare(
          `SELECT 1 AS x FROM point_expiry_log WHERE user_id=? AND kind='expired' AND due_at=?`
        ).bind(uid, dueAt).first();
        if (dup) continue;
        if (!opts.dryRun) {
          const { applyPointTransaction } = await import('./api-points');
          await applyPointTransaction(env, {
            userId: uid, studentName: r.student_name || undefined, type: 'expire',
            amount: Number(r.balance),
            reason: `유효기간 ${POINT_POLICY.EXPIRY_MONTHS}개월 경과로 소멸`,
            actorId: 'system', actorName: '자동',
          } as any).catch(() => {});
          await env.DB.prepare(
            `INSERT OR IGNORE INTO point_expiry_log (user_id, kind, due_at, amount, created_at) VALUES (?,'expired',?,?,?)`
          ).bind(uid, dueAt, Number(r.balance), now).run();
        }
        out.expired++;
      } else {
        // 만료 30일 전 안내 — 실제 발송은 알림 계층이 맡고, 여기서는 «알렸다» 만 기록한다.
        const dup: any = await env.DB.prepare(
          `SELECT 1 AS x FROM point_expiry_log WHERE user_id=? AND kind='notice' AND due_at=?`
        ).bind(uid, dueAt).first();
        if (dup) continue;
        if (!opts.dryRun) {
          await env.DB.prepare(
            `INSERT OR IGNORE INTO point_expiry_log (user_id, kind, due_at, amount, created_at) VALUES (?,'notice',?,?,?)`
          ).bind(uid, dueAt, Number(r.balance), now).run();
        }
        out.notified++;
      }
    }
    return out;
  } catch (e: any) {
    return { ...out, ok: false, error: String(e?.message || e) };
  }
}

/**
 * ⑤ 환불·수업 취소 시 회수 — 그 수업으로 받은 포인트만.
 *   ⚠️ 이미 «교환(spend)» 에 쓴 포인트는 회수하지 않는다(승인 규칙). 그래서 잔액이 모자라면
 *      모자란 만큼만 깎고 음수로 만들지 않는다 — 마이너스 잔액은 학생 화면에서 설명이 불가능하다.
 */
export async function clawbackClassPoints(
  env: any, userId: string, roomId: string
): Promise<{ ok: boolean; clawed: number; reason?: string }> {
  if (!POINT_POLICY.CLAWBACK_ON_REFUND) return { ok: true, clawed: 0, reason: 'disabled' };
  try {
    const row: any = await env.DB.prepare(
      `SELECT COALESCE(SUM(amount),0) AS s FROM point_transactions
        WHERE user_id = ? AND amount > 0 AND meta LIKE ?`
    ).bind(userId, `%${roomId}%`).first();
    const earned = Number(row?.s || 0);
    if (earned <= 0) return { ok: true, clawed: 0 };
    const bal: any = await env.DB.prepare(`SELECT balance FROM student_points WHERE user_id=?`).bind(userId).first();
    const clawed = Math.max(0, Math.min(earned, Number(bal?.balance || 0)));
    if (clawed <= 0) return { ok: true, clawed: 0, reason: 'already_spent' };
    const { applyPointTransaction } = await import('./api-points');
    await applyPointTransaction(env, {
      userId, type: 'clawback', amount: clawed,
      reason: `수업 취소·환불로 회수 (${roomId})`, actorId: 'system', actorName: '자동',
    } as any);
    return { ok: true, clawed };
  } catch (e: any) {
    return { ok: false, clawed: 0, reason: String(e?.message || e) };
  }
}
