/** Pure classification shared by the aggregate runner and its regression fixtures. */
/** 이 하니스가 정말 브라우저(E2E)를 쓰는가 — **실제 import/require 로만** 판정한다.
 *  ⚠️ 예전엔 /puppeteer/ 로 본문 아무 데나 찾았다. 그래서 주석에 그 단어를 한 번 쓴
 *     순수 정적 하니스가 통째로 SKIP 됐다 — 게이트가 조용히 꺼진 것이다(2026-08-09 실제 발생).
 *     「검사가 사라져도 FAIL 은 0」 이라 초록불로 보인다. 이름 언급과 실제 사용을 구분한다. */
export function usesPuppeteer(body) {
  return /\bfrom\s+['"]puppeteer(?:-\w+)?['"]|\brequire\(\s*['"]puppeteer(?:-\w+)?['"]\s*\)|\bimport\(\s*['"]puppeteer(?:-\w+)?['"]\s*\)/.test(body);
}

export function classifyHarnessResult(r, isE2E) {
  const out = (r.stdout || '') + '\n' + (r.stderr || '');
  const timedOut = !!(r.error && (r.error.code === 'ETIMEDOUT' || r.error.signal === 'SIGTERM'));
  const tail = out.split('\n').slice(-25).join('\n');
  const crash = /ERR_CONNECTION_REFUSED|puppeteer|Cannot read properties|Protocol error|net::|TargetCloseError|Navigation timeout/i.test(out);
  // 실제 '0 아닌' 실패 카운트만 잡는다 ("0 실패"/"0 FAIL" 은 통과)
  const failCount = /(?:^|[^\d])([1-9]\d*)\s*(?:FAIL\b|실패(?![가-힣\w]))/.test(tail) || /passed,\s*[1-9]/.test(tail);
  // 🖥 puppeteer(브라우저 E2E) 하니스는 활성 화상수업/특정 DOM 상태가 없으면 UI 단언이 실패하는데
  //   exit 0 으로 끝내는 경우가 있다(브라우저는 떴으니 crash 아님). 헤드리스로는 원래 불가한 검사이므로
  //   'puppeteer 를 쓰는데 실패 카운트만 있는' 경우는 진짜 회귀가 아니라 E2E → SKIP.
  //   (실제 소스/fetch 하니스는 puppeteer 를 안 쓰므로 이 완화에 안 걸린다 = 진짜 FAIL 은 그대로 FAIL)
  if (timedOut) return isE2E
    ? ['SKIP', '⏱  timeout(90s) — netem 다중클라이언트 E2E', out]
    : ['FAIL', '⚠  소스/로컬 하니스 timeout(90s)', out];
  // ⚠️ 2026-08-09 수정 — 이 완화들은 **E2E 하니스에만** 적용한다.
  //   그전엔 E2E 여부를 안 보고 crash 면 무조건 SKIP 이었다. 그래서
  //   순수 소스/fetch 하니스가 «Cannot read properties» 같은 **진짜 버그**로 죽어도
  //   SKIP 으로 내려가 초록불이 됐다 — 경보기 안에 있던 경보기 고장이다.
  //   E2E 가 아닌 하니스가 죽으면 그건 브라우저 환경 탓이 아니라 코드 탓이다 → FAIL.
  if (crash) return isE2E
    ? ['SKIP', '⏭  E2E(로컬서버/활성 화상수업 상태 필요)', out]
    : ['FAIL', '⚠  하니스가 오류로 죽음(E2E 아님 — 코드 문제)', out];
  if (r.status === 0 && !failCount) return ['PASS', '✅', out];
  if (isE2E) return ['SKIP', '⏭  E2E(브라우저는 떴으나 활성 수업 상태 필요 — 헤드리스 불가)', out];
  return ['FAIL', '⚠  실제 확인 필요', out];
}
