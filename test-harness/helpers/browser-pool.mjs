// 브라우저 하니스의 «서로 독립인 사례» 를 탭 여러 개로 동시에 돌립니다 (2026-11-03).
//
// 왜: speech-preferences(50건)·ai-speaking(320건)이 사례를 하나씩 돌려 CI 4코어 러너에서
//     각각 2~4분을 썼습니다. 사례마다 새 브라우저 컨텍스트(저장소·쿠키가 따로)라 동시에 돌려도
//     서로를 못 봅니다 — 판정·사례 수·assertion 수는 그대로입니다.
//
// ⛔ 시각에 민감한 검사(avatar-viseme 처럼 «재생 구간 안에 그 그림이 나왔나») 에는 쓰지 마세요 —
//    CPU 를 나눠 쓰면 짧은 구간을 놓칩니다(CLAUDE.md «브라우저 검사가 짧은 구간 관측에서 시간초과»).
// ⛔ 동시 실행에서만 실패하면 시간초과를 늘리지 말고 BROWSER_JOBS 를 낮추세요.
//
// 몇 개를 동시에: BROWSER_JOBS=N (1 이면 예전처럼 하나씩). 기본은 CPU 수(최대 4).
import os from 'node:os';

export function browserJobs() {
  const raw = process.env.BROWSER_JOBS;
  if (raw !== undefined && raw !== '') {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1) throw new Error('BROWSER_JOBS 는 1 이상의 정수여야 합니다: ' + raw);
    return n;
  }
  const cpu = typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length;
  return Math.max(1, Math.min(4, cpu || 1));
}

// items 를 앞에서부터 꺼내 worker(item, index) 를 최대 jobs 개 동시에 돌립니다.
// 하나가 던지면 «새 사례는 그만 꺼내고», 이미 돌고 있는 사례가 끝나기를 기다린 뒤
// 가장 앞 번호의 오류를 던집니다 — 브라우저를 닫는 finally 가 남의 사례 도중에 돌지 않게.
// ℹ️ 브라우저는 하나를 같이 씁니다. 줄마다 브라우저를 따로 띄워 봤지만 더 빠르지 않았습니다
//    (2026-11-03 실측 — 4줄 모두 약 7초). 막는 것은 CPU 라 4줄이면 약 1.8배입니다.
export async function runPool(items, jobs, worker) {
  let next = 0;
  let stop = false;
  const failed = [];
  const lane = async () => {
    while (!stop && next < items.length) {
      const index = next++;
      try {
        await worker(items[index], index);
      } catch (error) {
        stop = true;
        failed.push({ index, error });
      }
    }
  };
  const lanes = Math.max(1, Math.min(jobs, items.length));
  await Promise.all(Array.from({ length: lanes }, lane));
  if (failed.length) {
    failed.sort((a, b) => a.index - b.index);
    throw failed[0].error;
  }
}
