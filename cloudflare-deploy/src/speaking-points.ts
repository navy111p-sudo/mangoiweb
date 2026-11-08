import { CAP_EXEMPT_RULES, CAP_UNCOUNTED_RULES, POINT_POLICY, kstDayStart } from './point-policy';

export async function awardSpeakingPoints(db: D1Database, award: {
  uid: string; rule: string; key: string; amount: number; label: string; dailyCap: number;
  meta: { session_id?: string; speaking_session?: string; speaking_turn?: string }; studentName?: string;
}) {
  const { uid, rule, key, amount, label, dailyCap, meta, studentName } = award;
  const now = Date.now();
  const today = kstDayStart(now);
  const excluded = [...CAP_EXEMPT_RULES, ...CAP_UNCOUNTED_RULES];
  const awardId = JSON.stringify(['speaking', uid, rule, key]);
  const metadata = JSON.stringify(meta);
  // Each write depends on the previous write in this transaction. A duplicate changes no rows.
  const [claim, , ledger, log] = await db.batch([
    db.prepare(`INSERT INTO point_awards (award_id,user_id,credited_at)
      SELECT ?,?,? WHERE (SELECT COUNT(*) FROM point_rule_log WHERE user_id=? AND rule_code=? AND triggered_at>=?) < ?
      AND (SELECT COALESCE(SUM(amount),0) FROM point_transactions WHERE user_id=? AND type='earn'
        AND amount>0 AND created_at>=? AND (rule_code IS NULL OR rule_code NOT IN (SELECT value FROM json_each(?)))) + ? <= ?
      AND (? IS NULL OR NOT EXISTS (SELECT 1 FROM point_transactions WHERE user_id=? AND rule_code=?
        AND created_at>=? AND CASE WHEN json_valid(meta) THEN json_extract(meta,'$.session_id') END=?))
      ON CONFLICT(award_id) DO NOTHING`)
      .bind(awardId, uid, now, uid, rule, today, dailyCap,
        uid, today, JSON.stringify(excluded), amount, POINT_POLICY.DAILY_TOTAL_CAP, meta.session_id ?? null, uid, rule, today, meta.session_id ?? null),
    db.prepare(`INSERT INTO student_points (user_id,student_name,balance,lifetime_earned,last_earned_at,updated_at)
      SELECT ?,?,?,?,?,? WHERE changes()=1 ON CONFLICT(user_id) DO UPDATE SET
      balance=balance+excluded.balance,lifetime_earned=lifetime_earned+excluded.lifetime_earned,
      student_name=COALESCE(excluded.student_name,student_points.student_name),
      last_earned_at=excluded.last_earned_at,updated_at=excluded.updated_at`)
      .bind(uid, studentName || null, amount, amount, now, now),
    db.prepare(`INSERT INTO point_transactions (user_id,student_name,type,amount,balance_after,reason,rule_code,created_at,meta)
      SELECT user_id,student_name,'earn',?,balance,?,?,?,? FROM student_points WHERE user_id=? AND changes()=1 RETURNING id,balance_after`)
      .bind(amount, label, rule, now, metadata, uid),
    db.prepare(`INSERT INTO point_rule_log (user_id,rule_code,amount,triggered_at,txn_id,meta)
      SELECT ?,?,?,?,last_insert_rowid(),? WHERE changes()=1`).bind(uid, rule, amount, now, metadata),
  ]);
  if (!claim.meta.changes) return null;
  const row = ledger.results[0] as { id: number; balance_after: number };
  if (!row || !log.meta.changes) throw new Error('point_award_not_recorded');
  return { txnId: row.id, newBalance: row.balance_after, signed: amount };
}
