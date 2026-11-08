import { CAP_EXEMPT_RULES, CAP_UNCOUNTED_RULES, POINT_POLICY, kstDayStart } from './point-policy';
import { WARMUP_POINT_RULE, WARMUP_POINT_AMOUNT, WARMUP_POINT_MIN_TURNS } from './warmup-points';

/** Called only after authentication and server-history/owner validation.
 * Claim, balance, transaction and rule log commit together or roll back together.
 * Existing point_awards is reused; no production schema migration is required.
 */
export async function creditWarmupPoints(db: D1Database, userId: string, sessionId: string, turns: number) {
  if (!userId || /^(guest|anon)/i.test(userId) || !sessionId || !Number.isSafeInteger(turns) || turns < WARMUP_POINT_MIN_TURNS) throw new Error('Invalid verified warmup claim');
  const now = Date.now(), day = kstDayStart(now), amount = WARMUP_POINT_AMOUNT;
  const awardId = JSON.stringify([WARMUP_POINT_RULE, userId, day]);
  const sessionAwardId = JSON.stringify([WARMUP_POINT_RULE, userId, 'session', sessionId]);
  const nonce = crypto.randomUUID();
  const meta = JSON.stringify({ session_id: sessionId, turns });
  const skip = [...CAP_EXEMPT_RULES, ...CAP_UNCOUNTED_RULES];
  const claim = 'EXISTS (SELECT 1 FROM point_awards WHERE award_id=? AND room_id=?)';
  const statements = [
    db.prepare(`INSERT OR IGNORE INTO point_awards (award_id,user_id,room_id,credited_at)
      SELECT ?,?,?,? WHERE
      EXISTS (SELECT 1 FROM point_rules WHERE code=? AND enabled=1 AND amount=? AND daily_cap=1)
      AND NOT EXISTS (SELECT 1 FROM point_awards WHERE award_id=?)
      AND NOT EXISTS (SELECT 1 FROM point_rule_log WHERE user_id=? AND rule_code=? AND triggered_at>=?)
      AND (SELECT COALESCE(SUM(amount),0) FROM point_transactions WHERE user_id=? AND type='earn' AND amount>0 AND created_at>=? AND (rule_code IS NULL OR rule_code NOT IN (${skip.map(() => '?').join(',')}))) + ? <= ?`)
      .bind(awardId,userId,nonce,now,WARMUP_POINT_RULE,amount,sessionAwardId,userId,WARMUP_POINT_RULE,day,userId,day,...skip,amount,POINT_POLICY.DAILY_TOTAL_CAP),
    db.prepare(`INSERT INTO point_awards (award_id,user_id,room_id,credited_at) SELECT ?,?,?,? WHERE ${claim}`).bind(sessionAwardId,userId,nonce,now,awardId,nonce),
    db.prepare(`INSERT OR IGNORE INTO student_points (user_id,balance,lifetime_earned,lifetime_spent,updated_at) SELECT ?,0,0,0,? WHERE ${claim}`).bind(userId,now,awardId,nonce),
    db.prepare(`UPDATE student_points SET balance=balance+?,lifetime_earned=lifetime_earned+?,last_earned_at=?,updated_at=? WHERE user_id=? AND ${claim}`).bind(amount,amount,now,now,userId,awardId,nonce),
    db.prepare(`INSERT INTO point_transactions (user_id,type,amount,balance_after,reason,rule_code,created_at,meta)
      SELECT ?,'earn',?,balance,'A.i 말하기 연습',?,?,? FROM student_points WHERE user_id=? AND ${claim}`).bind(userId,amount,WARMUP_POINT_RULE,now,meta,userId,awardId,nonce),
    db.prepare(`INSERT INTO point_rule_log (user_id,rule_code,amount,triggered_at,txn_id,meta)
      SELECT ?,?,?,?,last_insert_rowid(),? WHERE ${claim}`).bind(userId,WARMUP_POINT_RULE,amount,now,meta,awardId,nonce),
    db.prepare('SELECT balance FROM student_points WHERE user_id=?').bind(userId),
  ];
  const result = await db.batch(statements);
  const credited = result[0]?.meta?.changes === 1;
  if (!credited) return { ok:false, error:'claim_not_awarded', signed:0 };
  return { ok:true, signed:amount, newBalance:(result[6]?.results?.[0] as any)?.balance, rule:{code:WARMUP_POINT_RULE,amount} };
}
