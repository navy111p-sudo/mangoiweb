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
  /**
   * 🔴 R2 파일을 «실제로 지울지». 기본 false — 분석만 하고 지우지 않는다(2026-08-05 사장님 지시).
   *    상태 정리 스윕(준비중·크기0)은 이 값과 무관하게 돈다(파일을 안 건드리므로).
   */
  deleteOrphans?: boolean;
  /**
   * R2 list prefix — 청소 대상 폴더.
   * 🔴 기본값이 'rec/' 다(2026-08-05 사장님 지시). 「전체」가 아니다.
   *    명시적으로 '' 를 넣으면 전 버킷을 훑지만, 그건 아래 경고를 읽고 판단할 것.
   */
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
  /** ⏳ 「준비중」에 갇힌 녹화 정리 결과 (dryRun 이면 없음) */
  stuck_sweep?: StuckSweepResult;
  /** 🩹 「완료인데 크기 0」 바로잡기 결과 (dryRun 이면 없음) */
  zero_size_sweep?: StuckSweepResult;
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
/* ══════════════════════════════════════════════════════════════════════════
   ⏳ 「준비중」에 영영 갇힌 녹화 정리 (2026-08-05 사장님 지시)
   ──────────────────────────────────────────────────────────────────────────
   [무엇이 문제인가] 녹화는 브라우저가 시작(status='recording')하고 브라우저가 끝낸다.
     그런데 탭이 죽거나, 「나가기」를 안 누르고 창을 닫거나, 회선이 끊기면 끝내는 쪽이
     영영 오지 않는다. 그 행은 status='recording' 인 채로 남고, 학부모·강사 화면에는
     **영원히 「⏳ 준비중」**으로 보인다. 기다리면 될 것처럼 보이지만 절대 안 된다.
     [실측 2026-08-05] 최근 3일 5건이 이 상태였다.

   [어떻게 정리하는가] 6시간이 지난 'recording' 행을 훑는다. 수업은 길어야 2시간이라
     6시간이 지났으면 끝낼 주체가 이미 사라진 것이 확실하다.
     ⚠️ 바로 실패로 찍지 않는다. **R2 에 실물이 있는지 먼저 본다.**
        파트가 올라가 객체가 만들어졌는데 마무리만 못 한 경우가 실제로 있었다
        (그때는 화면에만 실패로 보이고 파일은 멀쩡하다).
        실물이 있으면 completed 로 «살려낸다» — 강사가 볼 수 있게 된다.
        없으면 upload_failed 로 바꿔 「준비중」이라는 거짓 기대를 끊는다.
   ⚠️ UPDATE 에 status='recording' 조건을 다시 건다. 지금 막 마무리 중인 녹화와
      부딪혀 정상 완료를 덮어쓰지 않게 하는 잠금이다.
   ══════════════════════════════════════════════════════════════════════════ */
export interface StuckSweepResult {
  checked: number;
  recovered: number;   // R2 에 실물이 있어 completed 로 살려낸 건
  failed: number;      // 실물이 없어 upload_failed 로 정리한 건
  errors: string[];
}

export async function sweepStuckRecordings(
  env: CleanupEnv,
  options: { olderThanMs?: number; limit?: number } = {}
): Promise<StuckSweepResult> {
  const now = Date.now();
  const olderThanMs = options.olderThanMs ?? 6 * 3600 * 1000;   // 6시간
  const limit = options.limit ?? 200;
  const out: StuckSweepResult = { checked: 0, recovered: 0, failed: 0, errors: [] };
  if (!env.DB || !env.RECORDINGS) return out;

  let rows: any;
  try {
    rows = await env.DB.prepare(
      `SELECT id, file_url FROM recordings
        WHERE status = 'recording' AND started_at IS NOT NULL AND started_at < ?
        ORDER BY started_at ASC LIMIT ?`
    ).bind(now - olderThanMs, limit).all();
  } catch (e: any) {
    out.errors.push('대상 조회 실패: ' + (e?.message || e));
    return out;
  }

  for (const r of (rows?.results || []) as Array<{ id: number; file_url: string | null }>) {
    out.checked++;
    let size = 0;
    try {
      if (env.RECORDINGS && r.file_url) {
        const head = await env.RECORDINGS.head(r.file_url);
        if (head?.customMetadata?.recoveredFrom === 'snapshot') continue; // finalizer owns recovery
        size = head ? (head.size || 0) : 0;
      }
      if (!size) {
        const part = await env.DB.prepare(`SELECT 1 AS n FROM recording_parts WHERE recording_id = ? LIMIT 1`)
          .bind(r.id).first();
        if (part) continue;
        if (r.file_url && (await env.RECORDINGS.head(r.file_url + '.snap'))?.size) continue;
      }
    } catch (e: any) {
      out.errors.push('id=' + r.id + ' 저장 확인 보류: ' + (e?.message || e));
      continue; // storage errors are not evidence of lost video
    }

    try {
      if (size > 0) {
        await env.DB.prepare(
          `UPDATE recordings SET status='completed', size_bytes=?, ended_at=COALESCE(ended_at, ?)
            WHERE id=? AND status='recording'`
        ).bind(size, now, r.id).run();
        out.recovered++;
      } else {
        await env.DB.prepare(
          `UPDATE recordings SET status='upload_failed', ended_at=COALESCE(ended_at, ?)
            WHERE id=? AND status='recording'`
        ).bind(now, r.id).run();
        out.failed++;
      }
    } catch (e: any) {
      out.errors.push('id=' + r.id + ' 갱신 실패: ' + (e?.message || e));
    }
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
   🩹 「완료」인데 크기가 0인 녹화 바로잡기 (2026-08-05)
   ──────────────────────────────────────────────────────────────────────────
   [무엇이 문제인가] status='completed' 인데 size_bytes=0 인 행이 있다. 목록에는
     「▶ 재생」으로 멀쩡히 보이는데 눌러도 아무것도 안 나온다.
     「저장 실패」보다 나쁘다 — 실패는 포기라도 하지만, 이건 될 줄 알고 기다리게 만든다.
     [실측 2026-08-05] 51건 · 총 4시간 분량 · 정규수업 3건 포함.
     발생 시기가 2026-07-07 ~ 08-02 에 몰려 있고 그 뒤로는 새로 안 생긴다
     (멀티파트 파트 크기 문제를 고친 시점과 맞물린다). 즉 «과거에 쌓인 것» 을 치우는 일이다.

   [어떻게] R2 에 실물이 있는지 본다.
     · 있으면 → 크기를 채워 넣는다. 목록도 맞아지고 재생도 정상이 된다.
     · 없으면 → upload_failed 로 내린다. 「재생」이라는 거짓 약속을 없앤다.
   ⚠️ 방금 끝난 녹화(1시간 이내)는 건드리지 않는다 — complete 직후 크기 기록이
      아직 안 들어온 찰나를 실패로 오판하지 않기 위해서다.
   ⚠️ UPDATE 조건에 원래 상태를 다시 건다(동시성 잠금).
   ══════════════════════════════════════════════════════════════════════════ */
export async function sweepZeroSizeCompleted(
  env: CleanupEnv,
  options: { minAgeMs?: number; limit?: number } = {}
): Promise<StuckSweepResult> {
  const now = Date.now();
  const minAgeMs = options.minAgeMs ?? 3600 * 1000;   // 1시간
  const limit = options.limit ?? 200;
  const out: StuckSweepResult = { checked: 0, recovered: 0, failed: 0, errors: [] };
  if (!env.DB || !env.RECORDINGS) return out;

  let rows: any;
  try {
    rows = await env.DB.prepare(
      `SELECT id, file_url FROM recordings
        WHERE status = 'completed' AND COALESCE(size_bytes, 0) = 0
          AND file_url IS NOT NULL AND file_url <> ''
          AND COALESCE(ended_at, started_at, 0) < ?
        ORDER BY started_at DESC LIMIT ?`
    ).bind(now - minAgeMs, limit).all();
  } catch (e: any) {
    out.errors.push('대상 조회 실패: ' + (e?.message || e));
    return out;
  }

  for (const r of (rows?.results || []) as Array<{ id: number; file_url: string }>) {
    out.checked++;
    let size = 0;
    try {
      const head = await env.RECORDINGS.head(r.file_url);
      size = head ? (head.size || 0) : 0;
    } catch { /* 조회 실패 = 없음으로 본다 */ }

    try {
      if (size > 0) {
        await env.DB.prepare(
          `UPDATE recordings SET size_bytes = ?
            WHERE id = ? AND status = 'completed' AND COALESCE(size_bytes, 0) = 0`
        ).bind(size, r.id).run();
        out.recovered++;
      } else {
        await env.DB.prepare(
          `UPDATE recordings SET status = 'upload_failed'
            WHERE id = ? AND status = 'completed' AND COALESCE(size_bytes, 0) = 0`
        ).bind(r.id).run();
        out.failed++;
      }
    } catch (e: any) {
      out.errors.push('id=' + r.id + ' 갱신 실패: ' + (e?.message || e));
    }
  }
  return out;
}

export async function purgeOrphanedRecordings(
  env: CleanupEnv,
  options: CleanupOptions = {}
): Promise<CleanupResult> {
  const now = Date.now();
  const dryRun = options.dryRun ?? false;
  const graceMs = options.graceMs ?? 24 * 3600 * 1000; // 24h
  const maxDeleteRatio = options.maxDeleteRatio ?? 0.5; // 50%
  /* 🔴🔴 (2026-08-05 사장님 지시) 고아는 «rec/ 안에서만» 찾는다.
     [무슨 일이 있었나] 예전 기본값은 «전 버킷» 이었다. 그런데 이 버킷에는 녹화 말고도
       다른 것이 들어 있다 — 특히 레거시 업로드(index.ts handleRecordingUpload)가
       «방번호/날짜/파일명» 으로 접두사 없이 저장하고 D1 에 기록도 남기지 않는다.
       그 결과 실제 운영에서 이렇게 나왔다:
         R2 객체 42,264개 · D1 등록 key 1,873개 → 고아 판정 41,880개(99.1%)
       50% 안전장치가 걸려 삭제 0건으로 중단됐다. 그 장치 하나가 4만 개 파일을 지켰다.
     [무엇이 위험했나] 「고아가 99%나 되니 한도를 올리자」는 판단이 한 번이라도 내려지면
       녹화가 아닌 수업 자료까지 전부 지워진다. 되돌릴 수 없다.
     [그래서] 후보를 만들 때부터 rec/ 밖은 «쳐다보지도 않는다». 안전장치에 기대지 않는다.
       현재 D1 의 key 1,373건이 전부 rec/ 접두사라, 정상 녹화는 하나도 놓치지 않는다.
     ⚠️ 전 버킷을 훑고 싶으면 prefix: '' 를 명시해야 한다. 실수로 그렇게 되지 않는다. */
  const prefix = (options.prefix === undefined) ? 'rec/' : options.prefix;

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

  /* ⏳ 「준비중」에 갇힌 녹화 먼저 정리한다.
     여기에 붙이는 이유: 이 함수가 이미 매일 도는 유일한 녹화 정비 작업이고,
     크론 등록부(src/index.ts)는 손대면 안 되는 파일이다. 새 크론을 만들지 않고 얹는다.
     실패해도 아래 고아 파일 청소는 그대로 진행한다 — 한쪽 사고가 다른 쪽을 막지 않게. */
  if (!dryRun) {
    try {
      result.stuck_sweep = await sweepStuckRecordings(env);
    } catch (e: any) {
      result.errors.push('준비중 정리 실패: ' + (e?.message || e));
    }
    /* 🩹 「완료인데 크기 0」 — 목록엔 재생 버튼이 있는데 눌러도 안 나오는 행들 */
    try {
      result.zero_size_sweep = await sweepZeroSizeCompleted(env);
    } catch (e: any) {
      result.errors.push('크기0 완료 정리 실패: ' + (e?.message || e));
    }
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

  // ── 2) R2: 대상 폴더(prefix, 기본 rec/)만 순회하며 고아 후보 수집 ────────
  //    ⚠️ 「전체」가 아니다. 위 prefix 주석의 사고 경위를 반드시 읽을 것.
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

  /* 🔴🔴 (2026-08-05 사장님 지시) 파일 삭제는 «명시적으로 켜야만» 한다.
     [왜] 오늘 고아 판정 범위를 rec/ 로 좁히기 전까지, 이 함수는 매일 새벽
       «전 버킷» 을 훑으며 4만 개를 고아로 세고 있었다. 50% 안전장치 하나가
       수업 자료 전량 삭제를 막고 있던 셈이다.
       범위를 좁혀 지금은 정상(512개 중 169개, 33%)이지만, 판정이 옳다는 확신이
       실제 운영에서 며칠 쌓이기 전까지 «자동으로 지우게» 두지 않는다.
       삭제는 되돌릴 수 없고, 녹화는 학부모·강사에게 다시 만들어 줄 수 없는 자료다.
     [지금 동작] 분석은 그대로 한다(orphan_count·용량이 결과에 남는다). 지우지만 않는다.
       지우려면 호출부가 deleteOrphans: true 를 «직접» 넘겨야 한다.
     ⚠️ 상태 정리 스윕(준비중·크기0)은 이 스위치와 무관하게 돈다 —
        그건 파일을 건드리지 않고 D1 상태만 바로잡는 일이라 안전하다. */
  const doDelete = options.deleteOrphans === true;
  if (!doDelete) {
    result.errors.push(
      `ℹ️ 삭제 안 함(기본값) — 고아 ${orphans.length}건 · ${humanBytes(orphans.reduce((s, o) => s + o.size, 0))} 확인만 함. ` +
      `실제로 지우려면 deleteOrphans: true 로 호출할 것.`
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
