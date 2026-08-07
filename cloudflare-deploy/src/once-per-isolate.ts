// once-per-isolate.ts — "한 번만 하면 되는 준비 작업"을 요청마다 반복하지 않게 묶는다.
//   (2026-08-07 신설. 순수 모듈 — 하니스가 직접 불러 검증합니다.)
//
// ── 왜 필요한가 ────────────────────────────────────────────────────────────
// 모듈마다 `ensureTable(env)` 이 있고, **핸들러 첫 줄에서 매번 부릅니다.**
//   export async function getTraits(env, uid) { await ensureTable(env); ... }
// 그래서 그 API 로 요청이 올 때마다 `CREATE TABLE IF NOT EXISTS ...` 가
// D1 으로 한 번 더 나갑니다. 테이블이 이미 있어도 왕복은 그대로 발생합니다.
// (8개 모듈 · 호출 지점 26곳)
//
// 테이블이 생기는 건 **격리(isolate) 수명 동안 한 번이면 충분**합니다.
// DDL 은 멱등이라 여러 번 해도 결과는 같고, 그래서 지금까지 눈에 안 띄었을 뿐입니다.
//
// ⚠️ 합치지 **않는** 것: 각 모듈의 DDL 내용은 서로 다릅니다(만드는 테이블이 다름).
//    그건 중복이 아니라 각자의 스키마라 그대로 둡니다. 여기서 없애는 건
//    «요청마다 반복»이라는 **패턴**뿐입니다.

/**
 * `fn` 을 감싸서, 이 격리(isolate) 안에서 **처음 한 번만** 실제로 실행합니다.
 * 이후 호출은 같은 Promise 를 그대로 돌려받습니다(동시 호출도 한 번으로 합쳐짐).
 *
 * 실패하면 기억해 두지 않습니다 — 다음 호출이 다시 시도합니다.
 * (한 번의 일시적 D1 오류로 그 격리가 영영 테이블 없이 도는 일을 막기 위함)
 */
export function oncePerIsolate<E>(fn: (env: E) => Promise<void>): (env: E) => Promise<void> {
  let inflight: Promise<void> | null = null;
  return (env: E): Promise<void> => {
    if (!inflight) {
      inflight = fn(env).catch((e) => {
        inflight = null;   // 실패는 기억하지 않는다 → 다음 요청에서 재시도
        throw e;
      });
    }
    return inflight;
  };
}
