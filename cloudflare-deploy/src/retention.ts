/**
 * retention.ts — 보관기간 만료 데이터 자동 파기
 * 명세서 §3.2 보관기간:
 *  - 녹화본: 1개월
 *  - 출결 기록: 수강 종료 후 3년
 *  - 보상 내역: 5년 (전자상거래법)
 *  - 카카오 ID: 탈퇴(동의 철회) 시 즉시
 *  - 음성 분석: 원음 즉시 폐기 (녹화는 별도), 분석 결과는 출결과 함께 보관
 *  - 비상 이벤트: 1년
 *  - 동의 기록: 영구 (감사 추적, 단 철회 시 PII는 마스킹)
 */

export interface PurgeEnv {
  DB: D1Database;
  SESSION_STATE?: KVNamespace;
}

export interface PurgeResult {
  executed_at: number;
  recordings: number;
  attendance: number;
  speaking_data: number;
  rewards: number;
  kakao_ids: number;
  emergency_events: number;
  consents_masked: number;
  errors: string[];
}

export async function purgeExpired(env: PurgeEnv): Promise<PurgeResult> {
  const now = Date.now();
  const DAY = 24 * 3600 * 1000;
  const result: PurgeResult = {
    executed_at: now,
    recordings: 0,
    attendance: 0,
    speaking_data: 0,
    rewards: 0,
    kakao_ids: 0,
    emergency_events: 0,
    consents_masked: 0,
    errors: []
  };

  // 1) 녹화: expires_at 지난 것 (1개월)
  try {
    const r = await env.DB.prepare(
      `UPDATE recordings SET status = 'deleted'
       WHERE expires_at IS NOT NULL AND expires_at < ? AND status != 'deleted'`
    ).bind(now).run();
    result.recordings = r.meta.changes || 0;
  } catch (e: any) { result.errors.push('recordings: ' + e.message); }

  // 2) 출결: left_at으로부터 3년 지난 것 (left_at 없으면 joined_at 기준)
  const threeYearsAgo = now - 3 * 365 * DAY;
  try {
    const r = await env.DB.prepare(
      `DELETE FROM attendance
       WHERE COALESCE(left_at, joined_at) < ?`
    ).bind(threeYearsAgo).run();
    result.attendance = r.meta.changes || 0;
    result.speaking_data = result.attendance; // 발화 데이터는 attendance에 같이 저장됨
  } catch (e: any) { result.errors.push('attendance: ' + e.message); }

  // 3) 보상: 5년 지난 것
  const fiveYearsAgo = now - 5 * 365 * DAY;
  try {
    const r = await env.DB.prepare(
      `DELETE FROM rewards WHERE issued_at < ?`
    ).bind(fiveYearsAgo).run();
    result.rewards = r.meta.changes || 0;
  } catch (e: any) { result.errors.push('rewards: ' + e.message); }

  // 4) 카카오 ID: 동의 철회한 사용자 즉시 파기
  try {
    const r = await env.DB.prepare(
      `DELETE FROM kakao_ids
       WHERE user_id IN (
         SELECT user_id FROM consents WHERE withdrawn_at IS NOT NULL
         AND withdrawn_at > (SELECT COALESCE(MAX(consented_at), 0) FROM consents c2 WHERE c2.user_id = consents.user_id AND c2.withdrawn_at IS NULL)
       )
       OR user_id IN (
         SELECT c.user_id FROM consents c WHERE c.kakao_consent = 0 AND c.withdrawn_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM consents c2 WHERE c2.user_id = c.user_id AND c2.consented_at > c.consented_at AND c2.kakao_consent = 1 AND c2.withdrawn_at IS NULL)
       )`
    ).run();
    result.kakao_ids = r.meta.changes || 0;
  } catch (e: any) { result.errors.push('kakao_ids: ' + e.message); }

  // 5) 비상 이벤트: 1년 지난 것
  const oneYearAgo = now - 365 * DAY;
  try {
    const r = await env.DB.prepare(
      `DELETE FROM emergency_events WHERE triggered_at < ?`
    ).bind(oneYearAgo).run();
    result.emergency_events = r.meta.changes || 0;
  } catch (e: any) { result.errors.push('emergency_events: ' + e.message); }

  // 6) 동의 철회 레코드의 PII 마스킹 (username, raw_payload에 담긴 개인정보)
  //    → 완전 삭제하지 않고 감사 추적을 위해 마스킹만
  try {
    const r = await env.DB.prepare(
      `UPDATE consents
       SET username = NULL, guardian_contact = NULL,
           raw_payload = '{"masked":true}', ip_address = NULL, user_agent = NULL
       WHERE withdrawn_at IS NOT NULL
         AND (username IS NOT NULL OR raw_payload NOT LIKE '%"masked":true%')
         AND withdrawn_at < ?`
    ).bind(now - 7 * DAY).run(); // 철회 7일 후 마스킹 (실수 복구 기간)
    result.consents_masked = r.meta.changes || 0;
  } catch (e: any) { result.errors.push('consents: ' + e.message); }

  // 실행 로그 저장 (KV에 마지막 실행 결과)
  try {
    if (env.SESSION_STATE) {
      await env.SESSION_STATE.put('retention:last_run', JSON.stringify(result), { expirationTtl: 90 * 24 * 3600 });
    }
  } catch (_) {}

  return result;
}
