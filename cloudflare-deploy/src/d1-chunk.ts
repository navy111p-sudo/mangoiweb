// d1-chunk.ts — D1 `IN (...)` 목록을 파라미터 한도에 맞춰 잘라 질의하는 공용 헬퍼
//   (2026-08-07 신설. 순수 모듈 — env/전역 의존 없음 → 하니스가 직접 불러 검증합니다.)
//
// ── 왜 필요한가 ────────────────────────────────────────────────────────────
// D1 은 쿼리 하나에 바인드 파라미터 **100개**까지만 받습니다(101개부터
// "too many SQL variables"). `IN (${ids.map(()=>'?').join(',')})` 로 목록을
// 통째로 넣는 코드가 여기저기 있었는데, 학생 수가 늘면 어느 날 갑자기 넘습니다.
//
// 더 나쁜 건 **조용히 틀린다**는 점입니다. 이런 쿼리는 대개 try/catch 안에 있어서
// 예외가 삼켜지고 → 빈 결과 → "위험학생 0명" / "이름 없음" / "점수 없음" 으로
// 보입니다. 에러 로그도 안 남고 화면만 멀쩡해서 알아채기까지 오래 걸립니다.
//
// ── 왜 매직넘버 90 을 안 쓰나 ─────────────────────────────────────────────
// 기존 코드들은 전부 `i += 90` 이었습니다. 90 인 이유는 "뒤에 날짜 바인드 몇 개가
// 더 붙으니 여유를 두자"였는데, 여유가 몇 개면 되는지는 호출부마다 다릅니다.
// 여기서는 **lead/tail 로 실제로 넘긴 바인드 개수를 세서** 청크 크기를 정합니다.
// 호출부가 바인드를 하나 더 붙여도 자동으로 맞으므로, 다시 틀릴 여지가 없습니다.

/** D1 쿼리당 바인드 파라미터 하드 한도(실측: 101개부터 실패). */
export const D1_MAX_BIND = 100;

export interface D1ChunkOpts {
  /** IN 목록 **앞**에 오는 바인드 (예: teacher_id). SQL 의 ? 순서와 같아야 합니다. */
  lead?: any[];
  /** IN 목록 **뒤**에 오는 바인드 (예: since30, now). SQL 의 ? 순서와 같아야 합니다. */
  tail?: any[];
  /**
   * 청크 하나가 실패해도 무시하고 계속할지.
   *   true  — 테이블이 없을 수 있는 선택적 집계용(기존 try/catch 동작 보존)
   *   false — 실패를 그대로 올림(기본). 정산·이관처럼 조용히 비면 안 되는 곳.
   */
  swallowErrors?: boolean;
}

/**
 * 한도를 넘지 않도록 배열을 자릅니다.
 * @param reserved IN 목록 말고 같은 쿼리에 함께 나가는 바인드 개수(lead+tail).
 */
export function chunkBinds<T>(items: T[], reserved = 0, limit = D1_MAX_BIND): T[][] {
  const size = Math.max(1, limit - Math.max(0, reserved));
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** `?,?,?` 생성. */
export function placeholders(n: number): string {
  return new Array(Math.max(0, n)).fill('?').join(',');
}

/**
 * IN 목록을 청크로 나눠 SELECT 하고 **모든 청크의 행을 이어붙여** 돌려줍니다.
 *
 * ⚠️ 청크를 넘어 합쳐야 하는 집계에는 쓰지 마세요.
 *    GROUP BY / ROW_NUMBER 를 **IN 목록의 키로** 묶는 건 안전합니다 — 각 키는 한
 *    청크에만 있으므로 나눠 돌려도 결과가 같습니다. 반대로 ORDER BY + 전역 LIMIT,
 *    또는 전체 합계(COUNT(*) 하나)처럼 청크를 가로지르는 것은 나누면 달라집니다.
 */
export async function selectInChunks<R = any>(
  db: any,
  items: any[],
  buildSql: (ph: string) => string,
  opts: D1ChunkOpts = {},
): Promise<R[]> {
  const lead = opts.lead || [];
  const tail = opts.tail || [];
  if (!Array.isArray(items) || items.length === 0) return [];
  const out: R[] = [];
  for (const chunk of chunkBinds(items, lead.length + tail.length)) {
    try {
      const rs: any = await db.prepare(buildSql(placeholders(chunk.length)))
        .bind(...lead, ...chunk, ...tail).all();
      for (const r of ((rs?.results as R[]) || [])) out.push(r);
    } catch (e) {
      if (!opts.swallowErrors) throw e;
    }
  }
  return out;
}

/**
 * IN 목록을 청크로 나눠 UPDATE/DELETE 를 실행하고 **바뀐 행 수 합계**를 돌려줍니다.
 * ⚠️ 청크마다 별도 문(statement)이라 전체가 하나의 트랜잭션이 아닙니다.
 *    중간에 실패하면 앞 청크는 이미 반영된 상태입니다 — 멱등한 작업에만 쓰세요.
 */
export async function runInChunks(
  db: any,
  items: any[],
  buildSql: (ph: string) => string,
  opts: D1ChunkOpts = {},
): Promise<number> {
  const lead = opts.lead || [];
  const tail = opts.tail || [];
  if (!Array.isArray(items) || items.length === 0) return 0;
  let changed = 0;
  for (const chunk of chunkBinds(items, lead.length + tail.length)) {
    try {
      const r: any = await db.prepare(buildSql(placeholders(chunk.length)))
        .bind(...lead, ...chunk, ...tail).run();
      changed += Number(r?.meta?.changes || 0);
    } catch (e) {
      if (!opts.swallowErrors) throw e;
    }
  }
  return changed;
}
