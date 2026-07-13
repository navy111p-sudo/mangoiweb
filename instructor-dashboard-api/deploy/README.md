# 배포 & 격주 리포트 자동화

## 1) 앱 호스팅 (컨테이너)
이 FastAPI(Python) 앱은 **Cloudflare Workers에서 실행되지 않습니다**(Workers는 JS/WASM 런타임).
컨테이너 플랫폼에 배포하세요.

```bash
cd instructor-dashboard-api
docker build -t mangoi-dashboard-api .
docker run -p 8000:8000 \
  -e NEO4J_URI="neo4j+s://<dbid>.databases.neo4j.io" \
  -e NEO4J_USERNAME="<user>" \
  -e NEO4J_PASSWORD="<password>" \
  -e INGEST_TOKEN="<쓰기-API-보호-토큰>" \
  mangoi-dashboard-api
```
- 후보 호스팅: Fly.io / Render / Railway / cafe24 서버(Docker)
- Neo4j: 운영은 카페24:8880(기존 인프라) 또는 Aura. 접속정보는 런타임 env로만 주입.

## 2) 격주 리포트 자동화 (택1)
정기 리포트 생성은 앱의 `POST /api/v1/reports/run` 을 **격주로 호출**하면 됩니다.
cron 문법에 "격주"가 없어, 매주 트리거 + 주 번호 짝/홀 게이트로 격주를 구현합니다.

| 방식 | 파일 | 적합 |
|------|------|------|
| Cloudflare Cron Worker | `cron-worker/` (worker.js, wrangler.toml) | **기존 CF 스택과 일치(권장)** |
| GitHub Actions | `github-actions-reports.yml` | 저장소 기반 스케줄 |
| 시스템 crontab | `crontab.example` | 서버에 직접 |

공통 준비물: **API 주소**(`API_BASE`)와 **`INGEST_TOKEN`**(앱 `.env` 값과 동일).

### Cloudflare Worker (권장)
```bash
cd deploy/cron-worker
# wrangler.toml 의 API_BASE 를 실제 주소로 변경
wrangler deploy
wrangler secret put INGEST_TOKEN     # 앱과 동일 토큰
```

> 주기 변경: 앱은 `REPORT_CADENCE_DAYS`/`REPORT_WINDOW_DAYS` env로 조정.
> 크론 쪽 격주 게이트(`week % 2`)도 함께 맞추세요. 매주로 바꾸려면 게이트 제거.

## 3) 테스트 CI
`ci-tests.github-workflow.yml` 를 `.github/workflows/` 로 복사하면 push/PR 시
26개 유닛 테스트가 자동 실행됩니다. (목업 기반이라 DB/시크릿 불필요)

## 4) 운영 주의
- 다중 인스턴스로 앱을 띄우면 앱 내부 스케줄러(`ENABLE_SCHEDULER`) 대신 **외부 크론**을 쓰세요(중복 실행 방지).
- 쓰기 API(`/lectures`, `/reports/run`)는 `INGEST_TOKEN` 을 반드시 설정.
