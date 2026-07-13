/**
 * mangoi-reports-cron — Cloudflare Cron Trigger 워커.
 * 매주 트리거되지만 "격주(2주에 한 번)"에만 실제로 리포트 생성을 호출한다.
 * (cron 문법에는 격주가 없으므로 주 번호 짝/홀로 게이트)
 *
 * 배포:
 *   wrangler deploy
 *   wrangler secret put INGEST_TOKEN     # 백엔드 .env 의 INGEST_TOKEN 과 동일
 *   # wrangler.toml 의 [vars] API_BASE 를 실제 API 주소로 변경
 */
export default {
  async scheduled(event, env, ctx) {
    // epoch 주 번호(1970 이후 몇 번째 주). 짝수 주에만 실행 → 격주.
    const weekIndex = Math.floor(Date.now() / (7 * 24 * 3600 * 1000));
    if (weekIndex % 2 !== 0) {
      console.log(`홀수 주(${weekIndex}) — 이번 주는 스킵(격주)`);
      return;
    }
    const url = `${env.API_BASE.replace(/\/$/, "")}/api/v1/reports/run`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "X-API-Key": env.INGEST_TOKEN || "" },
    });
    const body = await res.text();
    console.log(`reports/run → ${res.status}: ${body.slice(0, 300)}`);
    if (!res.ok) throw new Error(`reports/run 실패: ${res.status}`);
  },
};
