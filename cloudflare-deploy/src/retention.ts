/**
 * retention.ts — 보관기간 만료 데이터 자동 파기
 * 명세서 §3.2 보관기간:
 *  - 녹화본: 3개월 (2026-08-06 사장님 결정. 그 전 명세는 1개월)
 *    🔴 아래 «1) 녹화» 가 하는 일은 D1 행에 status='deleted' 를 다는 것뿐이다.
 *       R2 의 실제 영상 파일은 이 경로로 지워지지 않는다. 상세는 그 자리 주석 참조.
 *  - 출결 기록: 수강 종료 후 3년
 *  - 보상 내역: 5년 (전자상거래법)
 *  - 카카오 ID: 탈퇴(동의 철회) 시 즉시
 *  - 음성 분석: 원음 즉시 폐기 (녹화는 별도), 분석 결과는 출결과 함께 보관
 *  - 비상 이벤트: 1년
 *  - 동의 기록: 영구 (감사 추적, 단 철회 시 PII는 마스킹)
 *  - AI 영작 첨삭 원문/기록: 30일 (아동 개인정보 최소보관 원칙)
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
  ai_writing: number;
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
    ai_writing: 0,
    errors: []
  };

  // 1) 녹화: expires_at 지난 것 (3개월)
  //
  // 🔴 여기는 «파기» 가 아니다 — D1 행에 status='deleted' 표시만 한다.
  //    R2 의 실제 영상 파일(webrtc-class-recordings)은 그대로 남는다.
  //    게다가 이 행은 UPDATE 라 계속 남아 있고 file_url 도 그대로여서,
  //    고아 청소기(recordings-cleanup.ts)가 «D1 에 기록이 있는 살아있는 파일» 로 보고
  //    보호한다 → 만료된 아동 화상수업 영상이 사실상 무기한 보관된다.
  //
  //    실제 파기를 켜려면 (1) 여기서 file_url 로 env.RECORDINGS.delete 호출
  //    (2) 고아 청소기의 보호 목록에서 status='deleted' 행 제외 — 두 가지가 함께 필요하다.
  //    되돌릴 수 없는 대량 삭제라 사장님 승인 + dryRun 선행 없이는 켜지 않는다.
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

  /* 4) 카카오 ID: 동의를 «철회» 했거나 카카오를 «거절» 한 사용자 즉시 파기
     ⚠️ (2026-09-01) 두 번째 조건의 `kakao_consent = 0` 은 **「거절했다」** 는 뜻이어야 한다.
        그런데 동의 화면(js/mango-consent.js)은 카카오를 **묻지 않는다** — 키 자체를 안 보낸다.
        그래서 그 전에는 「안 물어봄」도 0 이 되어, **동의를 남긴 모든 사용자**가 파기 대상이었다.

        [잰 것] 2026-09-01 D1: consents 11행의 kakao_consent 가 전부 0 · kakao_ids 50행은
          전부 2026-06-04 00:46:33 에 일괄로 들어왔고(`*_mgo…` 아이디, 전화 `010-00****`,
          명부에 있는 계정 1명) **동의 기록이 하나도 없다** ⟹ 두 집합의 교집합이 **0**이다.
        ⚠️ 「지금까지 지워진 적이 없다」는 **증명할 수 없다** — 지워지면 흔적이 안 남는다.
          (마지막 1회분만 `GET /api/retention/status` 의 retention:last_run 에서 볼 수 있다.)

        ✅ 막는 방법을 **둘** 두었다. 하나만으로는 이미 쌓인 행을 못 지킨다:
          ① 앞으로 들어올 행 — 「안 물어봄」이 **NULL** 로 저장된다(api-mango.ts POST /api/consents).
          ② 이미 쌓인 행 — `raw_payload` 에 그때 보낸 본문이 그대로 남아 있으므로,
             거기에 "kakao" 라는 키가 **실제로 실려 있었을 때만** 「거절」로 본다.
             ⚠️ raw_payload 가 NULL 이면 LIKE 결과도 NULL 이라 그 행은 파기 대상에서 빠진다 —
                «모르면 안 지운다» 는 안전한 방향이라 그대로 둔다.
          ⛔ ②를 지우면 2026-09-01 이전 11행이 다시 «거절» 이 되어, 그 학생이 나중에 카카오를
             연결하는 순간 그날 밤 지워진다. */
  try {
    const r = await env.DB.prepare(
      `DELETE FROM kakao_ids
       WHERE user_id IN (
         SELECT user_id FROM consents WHERE withdrawn_at IS NOT NULL
         AND withdrawn_at > (SELECT COALESCE(MAX(consented_at), 0) FROM consents c2 WHERE c2.user_id = consents.user_id AND c2.withdrawn_at IS NULL)
       )
       OR user_id IN (
         SELECT c.user_id FROM consents c WHERE c.kakao_consent = 0 AND c.withdrawn_at IS NULL
         AND c.raw_payload LIKE '%"kakao"%'
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

  // 5b) AI 영작 첨삭 원문/기록: 30일 지난 것 (테이블은 첫 사용 시 생성되므로 없으면 조용히 건너뜀)
  const thirtyDaysAgo = now - 30 * DAY;
  try {
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS ai_writing_corrections (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT, original_text TEXT NOT NULL, corrected_text TEXT, feedback TEXT, level TEXT, score INTEGER, created_at INTEGER NOT NULL);`);
    const r = await env.DB.prepare(
      `DELETE FROM ai_writing_corrections WHERE created_at < ?`
    ).bind(thirtyDaysAgo).run();
    result.ai_writing = r.meta.changes || 0;
  } catch (e: any) { result.errors.push('ai_writing: ' + e.message); }

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
