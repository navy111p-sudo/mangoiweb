/** Pure classification shared by the aggregate runner and its regression fixtures. */
/** Only count result-shaped lines; quoted examples and ordinary prose are not summaries. */
export function hasReportedFailures(output) {
  for (const raw of String(output).split(/\r?\n/)) {
    const line = raw.replace(/\x1b\[[0-9;]*m/g, '')
      .replace(/"[^"\n]*"|'[^'\n]*'|`[^`\n]*`/g, '');
    // Optional suite title, result label and emoji/punctuation; require a count/result at the start.
    const plain = line.replace(/^[^\p{L}\p{N}]*/u, '');
    const prefix = (/^(?:PASS|FAIL|passed|failed|통과|실패)\s*[:=]\s*\d/i.test(plain)
      ? plain : plain.replace(/^[^"'`{}\[\]\n]*?:\s*/, ''))
      .replace(/^(?:결과|요약|TOTAL|SUMMARY|RESULTS?)(?:\s*[:：]\s*|\s+)/i, '')
      .replace(/^(?:\s*총\s*\d+건\s*중)/, '').replace(/^[^\p{L}\p{N}]*/u, '');
    if (!/^(?:(?:PASS|FAIL|passed|failed)(?=\s|\d|[:=]|$)|통과|실패|\d+\s*(?:건\s*)?(?:PASS\b|FAIL\b|passed\b|failed\b|통과|실패))/i.test(prefix)) continue;
    const labeled = [...line.matchAll(/(?:^|[^\w가-힣])(PASS|FAIL|passed|failed|통과|실패)\s*(?:[:=]\s*)?(\d+)(?:건)?(?=$|[\s/|,;:).·—–])/gi)];
    const counted = [...line.matchAll(/(?:^|[^\d])(\d+)\s*(?:건\s*)?(PASS\b|FAIL\b|passed\b|failed\b|통과(?![가-힣\w])|실패(?![가-힣\w]))/gi)];
    // Consume non-overlapping result/count pairs from left to right. In "5 PASS 1 FAIL",
    // "5 PASS" owns PASS, so the overlapping "PASS 1" cannot swallow the real failing 1.
    // Conversely, "PASS 5" owns 5 in "PASS 5 FAIL 0", preventing a spurious "5 FAIL".
    const totals = [
      ...labeled.map(m => ({ start:m.index, end:m.index+m[0].length, label:m[1], count:Number(m[2]) })),
      ...counted.map(m => ({ start:m.index, end:m.index+m[0].length, label:m[2], count:Number(m[1]) })),
    ].sort((a,b) => a.start-b.start);
    let end = -1;
    for (const total of totals) {
      if (total.start < end) continue;
      end = total.end;
      if (/^(?:FAIL|failed|실패)$/i.test(total.label) && total.count > 0) return true;
    }
  }
  return false;
}

export function classifyHarnessResult(r, isE2E) {
  const out = (r.stdout || '') + '\n' + (r.stderr || '');
  const timedOut = !!(r.error && (r.error.code === 'ETIMEDOUT' || r.error.signal === 'SIGTERM'));
  const crash = /ERR_CONNECTION_REFUSED|puppeteer|Cannot read properties|Protocol error|net::|TargetCloseError|Navigation timeout/i.test(out);
  const failCount = hasReportedFailures(out);
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
