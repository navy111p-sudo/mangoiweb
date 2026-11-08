import { CAP_EXEMPT_RULES, CAP_UNCOUNTED_RULES, POINT_POLICY, kstDayStart } from './point-policy';

// Existing product amounts and daily limits. The caller cannot supply either value.
export const FRIEND_AWARDS = {
  ai_friend_chat: { amount:2, cap:10, label:'망고와 영어 수다' },
  ai_friend_word: { amount:5, cap:1, label:'오늘의 단어 사용' },
  ai_friend_voice: { amount:1, cap:5, label:'영어로 말하기' },
  ai_friend_listen: { amount:1, cap:5, label:'자막 가림 선택' },
} as const;
export function friendRequestId(value: unknown): string | null {
  return typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value) ? value.toLowerCase() : null;
}
/** Authentication, successful reply and saved-turn checks belong to the caller.
 * Atomic claim + wallet + both ledgers. A replay of the same turn/rule pays zero.
 */
export async function creditFriendAward(db: D1Database, uid: string, requestId: string, code: keyof typeof FRIEND_AWARDS, speakingSession?: string) {
  if (!uid || /^(guest|anon)/i.test(uid) || !friendRequestId(requestId) || !Object.prototype.hasOwnProperty.call(FRIEND_AWARDS,code)) throw new Error('Invalid verified friend award');
  requestId=friendRequestId(requestId)!;
  const rule=FRIEND_AWARDS[code],now=Date.now(),day=kstDayStart(now);
  const id=JSON.stringify(['friend',uid,requestId,code]),nonce=crypto.randomUUID();
  const guard='EXISTS (SELECT 1 FROM point_awards WHERE award_id=? AND room_id=?)';
  const skip=[...CAP_EXEMPT_RULES,...CAP_UNCOUNTED_RULES];
  const session=friendRequestId(speakingSession);
  const meta=JSON.stringify({request_id:requestId,...(session?{speaking_session:session}:{})});
  const out=await db.batch([
    db.prepare(`INSERT OR IGNORE INTO point_awards (award_id,user_id,room_id,credited_at) SELECT ?,?,?,?
      WHERE NOT EXISTS (SELECT 1 FROM point_rules WHERE code=? AND enabled=0)
      AND (SELECT COUNT(*) FROM point_rule_log WHERE user_id=? AND rule_code=? AND triggered_at>=?) < ?
      AND (SELECT COALESCE(SUM(amount),0) FROM point_transactions WHERE user_id=? AND type='earn' AND amount>0 AND created_at>=? AND (rule_code IS NULL OR rule_code NOT IN (${skip.map(()=>'?').join(',')}))) + ? <= ?`)
      .bind(id,uid,nonce,now,code,uid,code,day,rule.cap,uid,day,...skip,rule.amount,POINT_POLICY.DAILY_TOTAL_CAP),
    db.prepare(`INSERT OR IGNORE INTO student_points (user_id,balance,lifetime_earned,lifetime_spent,updated_at) SELECT ?,0,0,0,? WHERE ${guard}`).bind(uid,now,id,nonce),
    db.prepare(`UPDATE student_points SET balance=balance+?,lifetime_earned=lifetime_earned+?,last_earned_at=?,updated_at=? WHERE user_id=? AND ${guard}`).bind(rule.amount,rule.amount,now,now,uid,id,nonce),
    db.prepare(`INSERT INTO point_transactions (user_id,type,amount,balance_after,reason,rule_code,created_at,meta) SELECT ?,'earn',?,balance,?,?,?,? FROM student_points WHERE user_id=? AND ${guard}`).bind(uid,rule.amount,rule.label,code,now,meta,uid,id,nonce),
    db.prepare(`INSERT INTO point_rule_log (user_id,rule_code,amount,triggered_at,txn_id,meta) SELECT ?,?,?,?,last_insert_rowid(),? WHERE ${guard}`).bind(uid,code,rule.amount,now,meta,id,nonce),
  ]);
  return out[0]?.meta?.changes === 1 ? rule.amount : 0;
}
