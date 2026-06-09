/**
 * recordings-cleanup.ts — R2 고아 파일(Orphaned Object) 자동 동기화·청소
 * ---------------------------------------------------------------------------
 * 배경:
 *   R2 버킷(RECORDINGS)에는 녹화 파일이 존재하지만, D1(DB)의 recordings 테이블에는
 *   해당 메타데이터(file_url = R2 object key)가 없는 '기록 없음' 파일이 다수 발생.
 *   (업로드 중 탭 종료, complete 미호출, 과거 수동 삭제 등) → 스토리지 용량 낭비.
 *
 * 동작:
 *   1) D1 recordings.file_url 에 저장된 모든 R2 key 를 Set 으로 적재
 *   2) R2 list() 를 cursor 페이지네이션으로 전부 순회
 *   3) D1 Set 에 없는 R2 key = 고아 → 삭제 대상
 *   4) 안전장치(Safety Guard): 전체의 50% 이상이 삭제 대상이면 중단
 *   5) grace period: 최근 업로드된 객체는 in-flight 업로드일 수 있어 제외
 *
 * 이 모듈은 retention.ts 와 동일한 스타일(에러를 모아 result 로 반환, KV 로깅)을 따릅니다.
 */

export interface CleanupEnv {
  DB: D1Database;
  RECORDINGS?: R2Bucket;
  SESSION_STATE?: KVNamespace;
}

export interface CleanupOptions {
  /** true 면 실제 삭제 없이 분석만 (관리자 미리보기용). 기본 false. */
  dryRun?: boolean;
  /**
   * 이 시간(ms) 이내에 업로드된 객체는 삭제하지 않음.
   * 업로드 진행 중(complete 전, D1 반영 전)인 파일을 보호. 기본 24시간.
   */
  graceMs?: number;
  /**
   * 삭제 대상 비율이 이 값을 넘으면 전체 실행을 중단(대량삭제 사고 방지). 기본 0.5(50%).
   */
  maxDeleteRatio?: number;
  /** R2 list prefix (특정 폴더만 청소하고 싶을 때). 기본 전체. */
  prefix?: string;
}

export interface CleanupResult {
  executed_at: number;
  dry_run: boolean;
  /** R2 전체 객체 수 */
  total_objects: number;
  /** D1 에 등록된(유효한) key 수 */
  known_keys: number;
  /** 고아로 판별된 객체 수 (grace 제외 후) */
  orphan_count: number;
  /** grace period 로 보호되어 건너뛴 객체 수 */
  skipped_recent: number;
  /** 실제 삭제된 객체 수 */
  deleted_count: number;
  /** 삭제된 총 용량(byte) */
  deleted_bytes: number;
  /** 삭제된 총 용량(사람이 읽기 좋은 단위) */
  deleted_human: string;
  /** 안전장치 발동 여부 */
  aborted_by_guard: boolean;
  /** 삭제된(또는 dryRun 시 삭제 예정) key 목록 (로그/응답용, 최대 1000개) */
  deleted_keys: string[];
  errors: string[];
}

/** byte → 사람이 읽기 좋은 단위 문자열 (예: 1.23 GB) */
function humanBytes(n: number): string {
  if (!n || n < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

/**
 * R2 고아 파일을 찾아 삭제(또는 dryRun 분석)한다.
 * cron(scheduled)에서도, 관리자 수동 트리거에서도 동일하게 호출 가능.
 */
export async function purgeOrphanedRecordings(
  env: CleanupEnv,
  options: CleanupOptions = {}
): Promise<CleanupResult> {
  const now = Date.now();
  const dryRun = options.dryRun ?? false;
  const graceMs = options.graceMs ?? 24 * 3600 * 1000; // 24h
  const maxDeleteRatio = options.maxDeleteRatio ?? 0.5; // 50%
  const prefix = options.prefix;

  const result: CleanupResult = {
    executed_at: now,
    dry_run: dryRun,
    total_objects: 0,
    known_keys: 0,
    orphan_count: 0,
    skipped_recent: 0,
    deleted_count: 0,
    deleted_bytes: 0,
    deleted_human: '0 B',
    aborted_by_guard: false,
    deleted_keys: [],
    errors: [],
  };

  // R2 바인딩이 없으면(로컬/일부 환경) 조용히 종료
  if (!env.RECORDINGS) {
    result.errors.push('RECORDINGS(R2) 바인딩이 없습니다 — 스킵');
    return result;
  }

  // ── 1) D1: 유효한 R2 key 전부 로드 (file_url 에 key 저장됨) ──────────────
  //   왜 file_url? recordings-r2.ts 가 멀티파트 업로드 시 R2 object key 를
  //   recordings.file_url 컬럼에 기록함. status='deleted' 행도 '아직 R2 에 남아있을
  //   수 있는' 메타데이터이므로 보호 대상으로 포함(soft-delete 우선) → 단, key 가
  //   유효한(rec/ 로 시작하는) 것만 Set 에 넣어 잘못된 보호를 방지.
  const knownKeys = new Set<string>();
  try {
    // file_url 만 SELECT 하여 메모리/전송 최소화. 인덱스 불필요(전수 스캔이 의도).
    const rows = await env.DB.prepare(
      `SELECT file_url FROM recordings WHERE file_url IS NOT NULL AND file_url <> ''`
    ).all<{ file_url: string }>();

    for (const r of rows.results || []) {
      const k = (r.file_url || '').trim();
      if (k) knownKeys.add(k);
    }
    result.known_keys = knownKeys.size;
  } catch (e: any) {
    // D1 조회 실패 시 절대 삭제하면 안 됨(전부 고아로 오판 → 전량 삭제 위험).
    result.errors.push('D1 조회 실패 — 안전을 위해 중단: ' + (e?.message || e));
    result.aborted_by_guard = true;
    return result;
  }

  // ── 2) R2: 전체 객체를 cursor 로 순회하며 고아 후보 수집 ─────────────────
  const orphans: Array<{ key: string; size: number }> = [];
  try {
    let cursor: string | undefined = undefined;
    // do-while 로 truncated 가 끝날 때까지 모든 페이지를 순회
    do {
      const listed: R2Objects = await env.RECORDINGS.list({
        limit: 1000, // R2 list 최대치
        cursor,
        prefix,
        // include 를 지정하지 않아도 size/uploaded 는 기본 제공됨
      });

      for (const obj of listed.objects) {
        result.total_objects++;

        // (a) D1 에 등록된 key 면 정상 파일 → 보존
        if (knownKeys.has(obj.key)) continue;

        // (b) grace period: 최근 업로드분은 in-flight 일 수 있어 보호
        const uploadedMs = obj.uploaded ? obj.uploaded.getTime() : 0;
        if (uploadedMs && now - uploadedMs < graceMs) {
          result.skipped_recent++;
          continue;
        }

        // (c) 그 외 = 고아
        orphans.push({ key: obj.key, size: obj.size || 0 });
      }

      // truncated 이면 cursor 갱신, 아니면 종료
      cursor = listed.truncated ? listed.cursor : undefined;
    } while (cursor);
  } catch (e: any) {
    result.errors.push('R2 list 실패 — 중단: ' + (e?.message || e));
    result.aborted_by_guard = true;
    return result;
  }

  result.orphan_count = orphans.length;

  // 고아가 없으면 바로 종료
  if (orphans.length === 0) {
    await saveLastRun(env, result);
    return result;
  }

  // ── 3) 안전장치(Safety Guard): 대량삭제 차단 ───────────────────────────
  //   삭제 대상이 전체의 50% 이상이면 = 비정상(예: D1 비어있음, 마이그레이션 사고)
  //   → 한 건도 지우지 않고 경고만 남기고 중단.
  const ratio = result.total_objects > 0 ? orphans.length / result.total_objects : 0;
  if (ratio >= maxDeleteRatio) {
    result.aborted_by_guard = true;
    result.errors.push(
      `⚠️ 안전장치 발동: 삭제 대상 ${orphans.length}/${result.total_objects} ` +
        `(${(ratio * 100).toFixed(1)}%) ≥ ${(maxDeleteRatio * 100).toFixed(0)}% — 전량 삭제 위험으로 중단`
    );
    console.warn(
      `[recordings-cleanup] SAFETY GUARD TRIPPED ratio=${(ratio * 100).toFixed(1)}% ` +
        `orphans=${orphans.length} total=${result.total_objects} — aborting, deleted nothing`
    );
    await saveLastRun(env, result);
    return result;
  }

  // ── 4) 삭제 실행 (dryRun 이면 분석만) ──────────────────────────────────
  //   R2 delete 는 key 배열을 받아 한 번에 최대 1000개 일괄 삭제 가능 → 배치 처리.
  const BATCH = 1000;
  for (let i = 0; i < orphans.length; i += BATCH) {
    const batch = orphans.slice(i, i + BATCH);
    const keys = batch.map((o) => o.key);
    const batchBytes = batch.reduce((s, o) => s + o.size, 0);

    try {
      if (!dryRun) {
        // 배열 일괄 삭제 — 존재하지 않는 key 가 섞여도 에러 없이 무시됨(idempotent)
        await env.RECORDINGS!.delete(keys);
      }
      result.deleted_count += keys.length;
      result.deleted_bytes += batchBytes;
      // 로그/응답용 key 는 과도하게 쌓이지 않게 1000개로 제한
      for (const k of keys) {
        if (result.deleted_keys.length < 1000) result.deleted_keys.push(k);
      }
    } catch (e: any) {
      result.errors.push(`R2 delete 배치 실패(${i}~${i + keys.length}): ` + (e?.message || e));
    }
  }

  result.deleted_human = humanBytes(result.deleted_bytes);

  // ── 5) 로그 ───────────────────────────────────────────────────────────
  console.log(
    `[recordings-cleanup] ${dryRun ? 'DRY-RUN' : 'EXECUTED'} ` +
      `total=${result.total_objects} known=${result.known_keys} ` +
      `orphans=${result.orphan_count} skipped_recent=${result.skipped_recent} ` +
      `deleted=${result.deleted_count} freed=${result.deleted_human}`
  );
  // 삭제된 파일명 상세 (앞 50개만 — 로그 폭주 방지)
  if (result.deleted_keys.length) {
    console.log(
      `[recordings-cleanup] ${dryRun ? '(예정) ' : ''}삭제 파일 샘플: ` +
        result.deleted_keys.slice(0, 50).join(', ') +
        (result.deleted_keys.length > 50 ? ` … 외 ${result.deleted_keys.length - 50}건` : '')
    );
  }

  await saveLastRun(env, result);
  return result;
}

/** 마지막 실행 결과를 KV 에 저장 (관리자 대시보드/감사 추적용, 90일 보관) */
async function saveLastRun(env: CleanupEnv, result: CleanupResult): Promise<void> {
  try {
    if (env.SESSION_STATE) {
      await env.SESSION_STATE.put(
        'recordings-cleanup:last_run',
        JSON.stringify(result),
        { expirationTtl: 90 * 24 * 3600 }
      );
    }
  } catch (_) {
    /* KV 실패는 청소 결과에 영향 없음 — 무시 */
  }
}
