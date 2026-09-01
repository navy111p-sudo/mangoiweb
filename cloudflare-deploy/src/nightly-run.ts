/**
 * 🌙 nightly-run.ts — 야간 배치가 «어디까지 갔는지» 를 남긴다 (2026-08-31 신설)
 *
 * [왜 만들었나] 야간 작업 10개가 `ctx.waitUntil` 안의 **하나의 순차 체인**으로 돈다.
 *   각 작업은 try/catch 로 격리돼 있어 «던진 에러» 는 뒤 작업을 막지 않는다 — 그건 괜찮다.
 *   문제는 **CPU·subrequest 한도를 넘기면 격리(isolate) 자체가 종료**된다는 것이다.
 *   그건 try/catch 가 볼 수 없다. 그러면 그 뒤 작업들은 **아무 로그도 없이 그냥 안 돈다.**
 *   성공한 밤과 겉모습이 똑같아서, 몇 주가 지나도 아무도 모른다.
 *
 * [지금 상태] 잰 것: 2026-08-31 에 D1 \`decision_growth_snapshots.generated_at\` 최댓값이
 *   03:09:28 KST 였다. 거기서 내린 판단(측정이 아니다): 그 행이 이 cron 것이라면
 *   18:00 UTC 시작 후 약 9.5분이 걸린 셈이고, 15분 벽시계 예산의 3분의 2쯤이다.
 *   ⚠️ 그 행은 관리자 화면(\`POST /api/admin/judgment/snapshot\`)에서도 만들어질 수 있어
 *      cron 것이라는 보장이 없고, growth-snapshot 뒤에 auto-schedule(월요일만)이 더 있다.
 *      즉 «블록 전체가 몇 분인가» 는 아직 아무도 모른다 — 그것을 재려고 이 모듈을 만들었다.
 *   진짜 문제는 시간 자체가 아니라 **아무도 그 시간을 모르는 것**이다: 작업을 하나 더 얹어도,
 *   상류가 느려져도, 넘기 전까지는 신호가 없고 넘는 순간 조용히 뒤가 잘린다.
 *
 * [무엇을 하나] 새 표를 만들지 않는다 — 이미 있는 키-값 표(corpcard_meta)를 쓴다
 *   (bankacct-sync 가 `bank_last_sync_at` 을 남기는 것과 같은 방식).
 *     · nightly:<cron>:run      — 이번 판의 시작 시각·단계·완료 여부
 *     · nightly:<cron>:last_ok  — 마지막으로 «끝까지» 간 판의 요약
 *
 * 📖 읽는 법(사람이 D1 에서): SELECT v FROM corpcard_meta WHERE k LIKE 'nightly:%'
 *    · nightly:<cron>:run 에 finishedAt 이 없으면 그 판은 끝까지 못 갔다(step 이 마지막 지점).
 *    · nightly:<cron>:last_ok 의 steps[].ms 가 «평소 몇 분» 의 기준선이다.
 * ⛔ 이 파일은 «기록만» 한다. 작업 순서·내용을 바꾸지 않는다 —
 *    순서를 바꾸는 것은 라이브 야간 배치의 동작을 바꾸는 별건이고, 그 전에
 *    «어느 작업이 오래 걸리는지» 를 먼저 알아야 한다. 이 기록이 그 근거를 만든다.
 * ⚠️ 기록이 실패해도 야간 작업은 계속돼야 한다 — 모든 쓰기를 삼킨다.
 *    (감시 장치가 감시 대상을 죽이면 안 된다)
 */
/* 기존 키-값 표(corpcard_meta)를 그대로 쓴다 — 표를 새로 만들면 스키마가 또 하나 늘어난다.
   ⚠️ 맞바꾼 것: ensureTables 가 법인카드 표까지 함께 만든다(멱등 + wrapDbDdlOnce 로 격리당 1회라
      실해는 없다). 그 값을 좁히려고 여기서 CREATE TABLE 을 따로 쓰지는 않았다. */
import { metaSet, metaGet, ensureTables } from './corpcard-sync';

/** 벽시계 예산(분). cron 은 15분이 상한이라 그보다 낮은 값에서 미리 경고한다. */
const WARN_MINUTES = 10;

export interface NightlyRun {
  cron: string;
  startedAt: number;
  step: string;
  steps: Array<{ name: string; ms: number }>;
}

/** 판 시작 — 직전 판이 «끝까지 못 갔는지» 도 함께 알려 준다(그게 이 모듈의 핵심 목적). */
export async function beginNightlyRun(env: any, cron: string): Promise<NightlyRun | null> {
  const run: NightlyRun = { cron, startedAt: Date.now(), step: '(시작)', steps: [] };
  try {
    await ensureTables(env);
    /* 직전 판 확인 — 완료 표시가 없으면 «중간에 죽었다» 는 뜻이다.
       ⚠️ 지금 돌고 있는 판과 헷갈리면 안 되므로, 시작한 지 충분히 지난 것만 본다. */
    const prevRaw = await metaGet(env, `nightly:${cron}:run`);
    if (prevRaw) {
      try {
        const prev = JSON.parse(prevRaw);
        const ageMin = (Date.now() - Number(prev.startedAt || 0)) / 60000;
        if (!prev.finishedAt && ageMin > 30) {
          console.error('[nightly] 🚨 직전 판이 끝까지 가지 못했습니다 —',
            JSON.stringify({ cron, 마지막단계: prev.step, 시작: new Date(Number(prev.startedAt)).toISOString(), 경과분: Math.round(ageMin) }));
        }
      } catch { /* 옛 형식이면 무시 */ }
    }
    await metaSet(env, `nightly:${cron}:run`, JSON.stringify(run));
  } catch (e: any) {
    console.warn('[nightly] 기록 시작 실패(작업은 계속):', e?.message);
    return run;   // null 이 아니라 run 을 준다 — 기록만 못 할 뿐 단계 표시는 이어 간다
  }
  return run;
}

/** 한 작업이 «끝났다» 를 남긴다. 다음 작업에서 격리가 죽으면 여기까지가 마지막 기록이 된다. */
export async function markNightlyStep(env: any, run: NightlyRun | null, name: string): Promise<void> {
  if (!run) return;
  const prevMs = run.steps.reduce((a, s) => a + s.ms, 0);
  const ms = Date.now() - run.startedAt - prevMs;
  run.step = name;
  run.steps.push({ name, ms });
  try { await metaSet(env, `nightly:${run.cron}:run`, JSON.stringify(run)); }
  catch (e: any) { console.warn('[nightly] 단계 기록 실패(작업은 계속):', name, e?.message); }
}

/** 판 종료 — 여기까지 왔다는 것 자체가 «뒤가 잘리지 않았다» 는 증거다. */
export async function endNightlyRun(env: any, run: NightlyRun | null): Promise<void> {
  if (!run) return;
  const elapsedMs = Date.now() - run.startedAt;
  const done = { ...run, finishedAt: Date.now(), elapsedMs };
  /* 어느 작업이 오래 걸렸는지 한 줄로 — 나중에 «무엇을 떼어낼까» 를 이 숫자로 정한다.
     ⚠️ 짐작으로 순서를 바꾸지 말 것. 이 목록이 근거다. */
  const slowest = [...run.steps].sort((a, b) => b.ms - a.ms).slice(0, 3)
    .map((s) => `${s.name} ${Math.round(s.ms / 1000)}초`).join(' · ');
  console.log('[nightly] 완료', JSON.stringify({
    cron: run.cron, 경과초: Math.round(elapsedMs / 1000), 작업수: run.steps.length, 오래걸린것: slowest,
  }));
  if (elapsedMs > WARN_MINUTES * 60000) {
    console.error(`[nightly] ⚠️ ${WARN_MINUTES}분을 넘겼습니다(cron 상한 15분) — 오래 걸린 작업: ${slowest}`);
  }
  try {
    await metaSet(env, `nightly:${run.cron}:run`, JSON.stringify(done));
    await metaSet(env, `nightly:${run.cron}:last_ok`, JSON.stringify({
      finishedAt: done.finishedAt, elapsedMs, steps: run.steps,
    }));
  } catch (e: any) { console.warn('[nightly] 완료 기록 실패:', e?.message); }
}
