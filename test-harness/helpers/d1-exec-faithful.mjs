// d1-exec-faithful.mjs — 운영 D1 의 exec() 처럼 «줄마다 따로» 실행하는 가짜 (2026-10-28)
//
// 왜: Cloudflare 문서 — exec() 의 「input can be one or multiple queries separated by \n」.
//   즉 여러 줄로 쓴 CREATE 는 첫 줄(`CREATE TABLE … (`)에서 «incomplete input» 으로 죽는다.
//   하니스의 가짜 DB 가 node:sqlite 의 exec 를 그대로 쓰면 여러 줄을 한 문장으로 받아 줘서
//   그 사고를 «원리상» 못 잡았다 — 여러 줄 exec 로만 만드는 표 6개가 운영에 하나도 없었는데
//   (2026-10-28 실측) 관련 하니스는 전부 초록이었다. 그 때문에 9/20(#1044) 뒤로는 리마인더가 원리상 한 건도
//   못 나갔다(판단 — 표가 없다는 것은 그 CREATE 가 한 번도 성공하지 못했다는 뜻).
//
// 한 벌만 둔다 — 두 벌이 되면 한쪽만 운영과 달라진다.

/** node:sqlite DatabaseSync 를 받아, 운영 D1 처럼 줄마다 따로 실행하는 exec 를 돌려준다.
 *  빈 줄은 건너뛴다 — 운영이 빈 줄을 어떻게 다루는지는 재지 않았다(더 엄격하다면 그 경우만큼은 이 가짜가 관대하다).
 *  지금은 d1_exec_multiline_harness A-2 가 여러 줄 리터럴 자체를 막아 그 경우에 닿지 않는다. */
export function d1ExecLikeProd(raw) {
  return async (sql) => {
    let count = 0;
    for (const line of String(sql).split('\n')) {
      if (!line.trim()) continue;
      raw.exec(line);   // 줄이 완결된 문장이 아니면 node:sqlite 도 «incomplete input» 으로 던진다
      count++;
    }
    return { count, duration: 0 };
  };
}
