# A.i 말하기 후속 PR 준비·배포 상태 확인

## 기준과 동시 작업

PR #2178은 main `70369c80c`, 후속 계정 캐시 PR #2185는 `4eb2e6079`로 다른 작업에서 이미 병합됐다. 최신 main을 로컬에 반영했고, #2185의 storage 이벤트 처리·reset·늦은 응답 세대 경계와 관련 회귀 검사를 보존했다. 현재 변경은 이 main 이후의 후속 수정이며 원래 PR을 다시 병합하지 않는다.

통합 중 재검토한 것은 모델 숫자의 측정 근거, 과거 캐시의 수치·보상 표시, 서버가 소유권을 확인한 세션과 원자적 지급의 관계, 동일 요청 동시 재시도, 계정 변경 중 결과 도착이다. 수치 평가는 비활성이고 정상 결과 UI·단어·교정·기존 보상과 배지는 유지한다. 현재 세션과 토큰뿐 아니라 요청 세대도 확인해 이전 계정 응답이 새 계정 요청을 지우거나 잠금 해제하지 못하게 했다.

## 확인한 기존 main의 배포

[배포 워크플로 42465748481](https://github.com/navy111p-sudo/mangoiweb/actions/runs/42465748481)은 commit `4eb2e60795d1a5bec3e72ec4ae03ecedb800f92f`에서 성공했다. 배포 job `128684742446` 로그는 BUILD_STAMP `2026-11-08T09:12:38Z`와 운영 Worker 버전 `d3ff6c5f-0c6c-4be7-9f24-71ca6efd6078` 업로드/배포를 기록한다.

Cloudflare 제어 API에서도 운영 Worker의 deployment `024b1e16-6fe7-4850-bfbc-c1f1b3335b34`, 생성 시각 `2026-11-08T09:13:19.132032Z`, 같은 버전 100%를 확인했다. 이는 기존 main의 배포 확인이다. 후속 수정이 배포됐거나 실제 화면·기기·마이크·평가 공급자가 검증됐다는 뜻은 아니다. 운영 DB와 학생 데이터는 조회·시험하지 않았다.

## PR 발행 경로

GitHub의 deploy.yml은 main push에서 실행되며 PR CI는 배포하지 않는다. Cloudflare Builds의 일반 브랜치 트리거는 `npm run build` 후 `npx wrangler versions upload`를 사용한다. 이는 [버전과 배포의 구분](https://developers.cloudflare.com/workers/versions-and-deployments/)에 따라 활성 트래픽 변경과 다르다. 운영 트래픽을 승격시키는 명령은 이 후속 PR에서 실행하지 않는다.

PR 자동 검사는 유지한다. 별도 브랜치와 Draft PR로 발행하고, 모든 필요 검사와 별도 리뷰·격리 staging 조건 전에는 병합하지 않는다. 운영 설정이나 Cloudflare 트리거를 변경하지 않는다.

Version URL은 [운영 자원을 사용하는 검토 버전](https://developers.cloudflare.com/workers/previews/compare-workflows/)이다. 이를 격리 staging으로 사용하거나 해당 URL에 테스트 요청을 보내지 않는다. 로컬 workerd/D1/KV와 차단된 공급자 fixture에서만 쓰기·재시도·롤백을 검증한다.

## 검증과 남은 조건

계정 수정 통합 뒤 단위 43건, 로그인 실제 HTML 24개 조합(320/390/768/1366px) 409 checks, 게스트·중단 스트림 8개 조합이 통과했다. 로그 `/tmp/speaking-pr-review-unit.log`, `/tmp/speaking-pr-browser.log`, `/tmp/speaking-pr-guest-browser.log`. 브라우저 응답은 합성 fixture이며 실제 기기 검증이 아니다. 전체 공통 게이트는 마지막 실행 결과를 아래에 기록한다.

안전한 제품 범위는 관측 결과·단어·교정·기존 원장 보상이다. 격리된 평가 서비스 자격증명과 검증된 평가 기준·표본이 없으므로 5영역 수치 평가는 계속 미측정이다. 기본/운영의 공유 D1·KV를 staging으로 쓰지 않는다. 운영과 분리한 자원·비밀키·접근 제어를 갖춘 원격 staging, 실제 모바일 마이크·기기와 라이브 화상/녹화 E2E, 별도 PR 검수가 남아 있다. 이 조건이 미충족이면 Draft를 유지하고 병합·운영 배포하지 않는다.

## 최종 로컬 결과

최신 main `4eb2e6079`를 통합한 `npm_config_cache=/tmp/mangoi-npm-cache bash test-harness/ci-gates.sh` 4종이 모두 통과했다. 회귀 PASS 724 / 라이브 수업 E2E SKIP 20 / FAIL 0, TypeScript·JS 문법 1,587조각·자산 341건도 통과했다. 로그 `/tmp/speaking-pr-final-gates.log`. 원격 PR 검사 결과와 구분하며, 검증한 트리와 발행 트리의 Git tree SHA 일치를 확인한다.
