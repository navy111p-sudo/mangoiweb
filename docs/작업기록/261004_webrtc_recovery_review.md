# 화상수업 복구 재시도와 사무실 모드 무음 방지 검토

- 날짜: 2026-10-04 KST (2026-10-03 UTC)
- 기준: main `03944d85e3333700013e7237f817a7856dd5ee84` (작업 중 #1356 반영, 충돌 없이 재기반)
- 브랜치: `fix/webrtc-recovery-review-20261003`
- 범위: 검토용 수정. 병합·운영 배포 승인 아님.

## 왜 했나

미병합 PR #1234(영상 복구 재시도), #1331(사무실 모드 AudioContext 정지 시 원음 복구)를
최신 main 위에서 다시 검사했다. 이 수정으로 특정 수업 사고의 원인이 확정되는 것은 아니다.
Cloudflare Builds의 하위 저장소 갱신 실패도 함께 조사해, `.gitmodules` 없이 남은 gitlink를 확인했다.

## 무엇을 바꿨나

- `mangoi-speech-patch/mangoi_Speech`의 gitlink만 추적 해제했다. 독립 저장소용 로컬 체크아웃은
  삭제하지 않았고 `.gitignore`에 해당 경로만 추가했다. 패치 README와 스크립트는 그대로다.
- `idx-vc-qlog.js`: #1234의 L2 완료/재시도·오래된 결과 방지·영상 요소 OFF 가드를 반영했다.
  큰 ID 쪽의 재협상 **요청 전송**은 offer 전송 성공으로 세지 않는다. 작은 ID 쪽은 실제 offer를
  보낸 뒤에만 요청 token을 소진한다. busy/cooldown/createOffer 실패 후 같은 token으로 다시 시도한다.
  기존 통계 틱을 사용하며 재시도 간격은 12초다. 성공한 같은 token의 offer는 반복하지 않는다.
- `createOffer`와 `setLocalDescription`을 기다리는 사이 WebSocket이 닫히는 경우도 다시 확인한다.
  보내지 못한 local offer가 여전히 이 시도의 SDP이고 `have-local-offer`일 때만 rollback한다.
  수신 offer가 이긴 상태는 건드리지 않는다. 로컬 영상이 먼저 살아나면 기다리던 시도도 취소한다.
- `idx-vc-officemode.js`: 정지한 AudioContext에 resume을 한 번 시도하고, 1초 후 실행 기회에도
  멈춰 있으면 기존 `disable(true)`로 표준 마이크를 복구한다. 40틱 대신 실제 경과 시간을 재서
  숨은 탭의 느린 타이머에 대응한다. resume rejection을 처리한다. 저장된 사무실 모드/마이크 선택과
  음소거를 보존하며, 이 페이지에서는 자동으로 다시 켜지 않는다. 사람의 명시적 재시도는 가능하다.
- `public/index.html`은 해당 두 자산의 `?v=`만 변경했다(qlog 20, officemode 8).
  기존 미병합 PR의 19/7과 같은 URL에 다른 내용을 기록하지 않도록 구분했다.
- 기존 읽기 전용 브라우저 검증 워크플로에 이 브랜치와 새 오디오 검사를 등록했다.
  운영 배포 워크플로·시그널링 서버·AAO/생존 판정은 변경하지 않았다.

## 왜 이렇게 풀었나

- 새 ACK 프로토콜이나 서버 상태를 만들지 않았다. 요청자는 실제 영상 회복까지 기존 틱으로
  재요청하고, offer 소유자는 성공 token을 중복 처리하지 않는다. 요청과 실제 offer를 혼동하지 않는 것이 핵심이다.
- 오디오가 흐르는 영상 고장에 ICE restart/peer rebuild를 추가하지 않았다.
- 사람이 끈 카메라나 AAO를 강제로 켜지 않는다. AudioContext 복구도 사용자 음소거를 풀지 않는다.
- Cloudflare checkout만 고쳐 곧바로 운영 배포가 살아나는 위험 때문에, 중복 자동 운영 배포 경로의
  차단 상태를 외부에서 확인하기 전에는 이 브랜치를 게시하지 않는다. 이 코드 자체가 그 설정을 바꾸지는 않는다.

## 로컬에서 확인한 것

- TypeScript: 설치된 컴파일러를 직접 실행해 오류 0.
- 인라인 JS: HTML 124개와 JS 254개, 579조각 문법 오류 0.
- 자산 버전: 264/264 통과.
- 영상 복구 상태형 하니스: 117/0. 두 endpoint의 실제 복구 함수와 offer handler를 별도 VM에서
  연결해 busy/cooldown/첫 offer 실패, 재요청, 성공 중복 억제, 실제 프레임 이후 중단을 검사했다.
  WebSocket이 두 SDP await 중 닫히거나 send가 throw하는 경우, rollback, glare winner도 검사했다.
- 주변 회귀: AAO 126/0, liveness 57/0, observer camera 139/0, quality 232/0,
  rx-stall 14/0, body observer 9/0.
- 오디오 전체 소스 IIFE: 15개 동작 시나리오 통과. suspended/interrupted/closed × 음소거 여부,
  모든 sender 교체, 선택 마이크와 기본 장치 폴백, resume reject/throw/pending, 숨은 탭,
  저장값, 자동 재활성화 금지, 수동 재시도와 오래된 엔진 callback을 검사했다.
- 오디오 gate tuning 13/0. 오디오 변이 8종 모두 FAIL, 영상의 조기 성공 반환/조기 token 소진/rollback 제거 변이 3종도 FAIL.
- gitlink가 index에서 없어졌고, 로컬 디렉터리는 남았으며 해당 하위 경로가 ignore되는 것을 확인했다.

## 아직 확인하지 못한 것

- `npm ci`는 기존 Wrangler 3와 workers-types 5 peer dependency 충돌로 실패했다.
  기존 브라우저 워크플로와 같은 `--legacy-peer-deps`로 설치한 뒤 위 검사를 수행했다.
  package/lockfile이나 게이트를 완화하지 않았다.
- 전체 `ci-gates.sh`/`run.mjs --fast`는 실행 환경 중단으로 끝까지 결과를 받지 못했다.
  기준 main과 수정본 모두 전체 회귀 통과라고 주장하지 않는다. PR CI에서 최종 확인이 필요하다.
- 실제 Chromium 실행은 시작 단계의 `socket() Operation not permitted`로 막혔다.
  새 `manual/vc-office-recovery-browser.mjs`는 실제 WebRTC 수신 PCM을 검사하도록 준비했지만
  **브라우저 동작 단언은 실행되지 않았다**. 기존 실제 영상 브라우저 검사도 같은 사유로 미검증이다.
  Chromium에 native interrupted 상태가 없어 그 경우는 native suspended 위에 상태 이름만 주입한다.
- 운영 수업·실기기·배포 후 동작은 검증하지 않았다. 병합/운영 배포는 별도 승인과 검사 결과 확인이 필요하다.
