/**
 * retention.ts — 보관기간 만료 데이터 자동 파기
 * 명세서 §3.2 보관기간:
 *  - 녹화본: **6개월** (2026-09-02 사장님 결정. 그 전은 3개월, 더 전은 1개월)
 *    ⚠️ 이 기간은 «앞으로 만들어질» 녹화에만 붙는다 — `expires_at` 은 행을 만들 때 박히므로
 *       명세를 바꿔도 이미 있는 행은 안 따라온다. 그래서 한동안 3개월짜리와 6개월짜리가 섞여 있다.
 *       기존 2,098건은 학부모가 «3개월» 로 안내받고 동의한 것이라 **소급하지 않는다**(동의 범위).
 *       순서도 그래서 «동의 화면 문구 먼저(js/mango-consent.js) → 그 뒤 동의분부터 180일» 이다.
 *       기간을 정하는 정본은 `src/api-mango.ts` 의 `RETENTION_MS` 한 곳.
 *    ✅ 2026-09-02 사장님 승인으로 **실제 파기를 켰다** — D1 표시 + R2 실물 삭제.
 *       그때 옛 30일 값이 박혀 있던 1,483행의 expires_at 을 «수업일+90일» 로 소급 재계산했다
 *       (안 하면 켜는 순간 6~7월 녹화 1,313건 10.46GB 가 한꺼번에 사라진다 — 그건 «늘린» 것이
 *        아니라 동의 문구가 이미 3개월이었던 것에 **맞춘** 것이다).
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
  /** 녹화 R2 버킷. ⚠️ 옵셔널 — 바인딩이 없는 환경에서는 R2 삭제를 건너뛰고 D1 표시만 한다
      (파기가 «안 되는» 것이 파기가 «잘못 되는» 것보다 안전하다). */
  RECORDINGS?: R2Bucket;
}

/** 파기 옵션 */
export interface PurgeOptions {
  /** true 면 아무것도 지우지 않고 «몇 건이 지워질지» 만 센다 */
  dryRun?: boolean;
  /** 한 번에 R2 에서 지울 최대 개수. Worker 실행시간 보호용(기본 200). 나머지는 다음 실행에서 */
  maxRecordingDeletes?: number;
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
  /** R2 에서 실제로 지운 영상 파일 수 */
  recording_files_deleted?: number;
  /** R2 삭제에 실패해 다음 실행으로 미룬 수 (file_url 이 남아 다시 시도된다) */
  recording_files_failed?: number;
  /** 이번 실행에서 처리하지 못하고 남은 만료 건수(상한에 걸림) */
  recording_files_remaining?: number;
  /** dryRun 이었는가 */
  dry_run?: boolean;
}

export async function purgeExpired(env: PurgeEnv, opts: PurgeOptions = {}): Promise<PurgeResult> {
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
    errors: [],
    recording_files_deleted: 0,
    recording_files_failed: 0,
    recording_files_remaining: 0,
    dry_run: !!opts.dryRun
  };

  /* 1) 녹화 파기 — 만료된 영상의 R2 실물을 지우고 D1 에 반영한다.
        (2026-09-02 사장님 승인으로 켜짐. 그전에는 D1 에 표시만 하고 파일은 남겼다)

     ⚠️ 순서가 중요하다: **D1 표시가 먼저, R2 삭제가 나중.**
        반대로 하면 삭제 도중에 죽었을 때 «목록엔 완료인데 영상이 없는» 상태가 된다 —
        2026-08-26 에 실제로 났던 사고다. 이 순서면 최악이어도 «표시는 만료인데 파일이 남은»
        상태로 끝나고, 그건 파기 전과 같으므로 다음 실행이 다시 지운다.

     ⚠️ 조회 조건에 status 를 넣지 않는다. D1 표시 뒤 R2 삭제가 실패하면 그 행은 이미
        'deleted' 라서, status 로 거르면 **영영 재시도되지 않는다.** 판정 기준은
        «아직 키가 남아 있는가»(file_url) 이고, 그래서 삭제에 성공했을 때만 그 칸을 비운다.
        그 칸은 고아 청소기(recordings-cleanup.ts)가 보호 목록을 만들 때 읽는 값이기도 해서,
        비우는 순간 «보호할 이유»도 함께 사라진다.

     ⛔ 되돌릴 수 없다. 옵션 dryRun 으로 먼저 건수를 확인할 것. */
  try {
    const LIMIT = Math.max(1, Math.min(1000, opts.maxRecordingDeletes ?? 200));

    /* ⚠️ `file_url` 이 R2 키가 아닌 행이 있다 — 그 칸은 실패 진단에도 쓰인다:
          `DEBUG:`+업로드 로그 · `FATAL:`+예외 · 외부 녹화의 `https://…`
          (src/index.ts 의 `_saveDebug` 경로, api-mango.ts 의 외부 URL 분기).
       R2 `delete()` 는 **없는 키에도 예외를 던지지 않고 성공**하므로, 그대로 넘기면
       「지웠다」로 세고 그 칸을 비워 **저장 실패의 원자료를 영구히 잃는다.**
       그래서 진짜 R2 키(`rec/`)만 고른다 — 못 고른 것은 «안 지우는» 쪽으로 실패한다.
       [잰 것 — 2026-09-02 운영 D1] file_url 분포: `rec/` 2,071건 · 빈 값 27건 ·
       DEBUG/FATAL/외부주소 0건. 지금 반경은 0이지만 위 경로들이 살아 있어 구조적으로 생길 수 있다. */
    const KEY_COND = `file_url IS NOT NULL AND file_url LIKE 'rec/%'`;

    /* 남은 건수는 «따로» 센다. LIMIT 로 잘린 배열 길이로는 몇 건이 남았는지 알 수 없고
       (LIMIT+1 로 재면 언제나 «1건 남음» 이 된다), dryRun 이 세야 할 «전체 건수» 도 잘린다. */
    const cnt = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM recordings
        WHERE expires_at IS NOT NULL AND expires_at < ? AND ${KEY_COND}`
    ).bind(now).first<{ n: number }>();
    const totalExpired = Number(cnt?.n || 0);

    const rs = await env.DB.prepare(
      `SELECT id, file_url FROM recordings
        WHERE expires_at IS NOT NULL AND expires_at < ? AND ${KEY_COND}
        ORDER BY expires_at ASC LIMIT ?`
    ).bind(now, LIMIT).all<{ id: number; file_url: string }>();

    const rows = (rs.results || []).slice();
    result.recording_files_remaining = Math.max(0, totalExpired - rows.length);

    if (opts.dryRun) {
      result.recordings = totalExpired;          // 상한에 잘리지 않은 «진짜 건수»
    } else {
      const upd = await env.DB.prepare(
        `UPDATE recordings SET status = 'deleted'
         WHERE expires_at IS NOT NULL AND expires_at < ? AND status != 'deleted'`
      ).bind(now).run();
      result.recordings = upd.meta.changes || 0;

      for (const row of rows) {
        const key = String(row.file_url || '').trim();
        if (!key) continue;
        if (!env.RECORDINGS) {                 // 바인딩이 없는 환경 — 지우지 않고 미룬다
          result.recording_files_failed = (result.recording_files_failed || 0) + 1;
          continue;
        }
        try {
          await env.RECORDINGS.delete(key);
          await env.DB.prepare(`UPDATE recordings SET file_url = NULL WHERE id = ?`).bind(row.id).run();
          result.recording_files_deleted = (result.recording_files_deleted || 0) + 1;
        } catch {
          // 키를 남겨 둔다 → 다음 실행에서 다시 시도된다
          result.recording_files_failed = (result.recording_files_failed || 0) + 1;
        }
      }
    }
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
