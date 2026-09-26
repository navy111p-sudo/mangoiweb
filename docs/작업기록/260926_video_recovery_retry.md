# 2026-09-26 영상 멈춤 복구 재시도

## 제보와 확인 범위

중국어 수업 녹화 ID 2958, 2963에서 중간 멈춤이 반복됐다는 제보.
녹화 링크는 이 실행 환경에서 403 응답으로 열리지 않았고, 운영 D1/Workers 로그는
확보하지 못했다. 아래는 코드로 재현한 결함이며 두 수업의 확정 원인이 아니다.
서명된 녹화 URL은 저장소에 기록하지 않는다.

## 재현한 결함과 수정

- L2 영상 재협상은 `vcRecoveryNegotiate` 결과를 기다리기 전에 `done[2]`를 설정했다.
  신호 소켓 닫힘, 12초 쿨다운, createOffer 예외로 실제 offer를 보내지 못해도 해당
  복구 단계가 영구히 소진됐다. 기존 코드는 새 socket 재현 검사에서 실패했다.
- 성공 결과에서만 완료를 기록하고, 실패한 시도는 기존 수신 틱에서 최소 12초 간격으로
  다시 시도한다. 진행 중 promise 중복과 오래된 peer/복구 구간 결과를 차단한다.
- `vcRecoveryElement` 카메라 꺼짐 가드가 함수에 없는 `ice`를 참조했다.
  영상 요소 복구는 수동 꺼짐/AAO 모두 그대로 존중하고 false로 종료한다.
- 캐시 버전 18 → 19. 새 타이머, 추가 getStats, 강제 카메라 켜기, liveness 변경 없음.

## 검증

- `vc_fast_recovery_harness`: 73 PASS / 0 FAIL. 기존 59개 + 신규 14개.
- 신규: 닫힌 socket/협상 cooldown/offer 오류 뒤 재시도, 성공 후 반복 금지,
  pending 중복 방지, 프레임 회복/peer 교체 뒤 오래된 결과 무효화, 수동 OFF/AAO 가드.
- TypeScript `node node_modules/typescript/bin/tsc --noEmit`: exit 0.
- AAO 126/0, 회선 품질 232/0, rx-stall 14/0, body observer 9/0.
- 로컬 전체 fast 검사는 sparse checkout의 누락 파일과 의존성 설치 중 시작한 영향으로
  실패가 섞였다. 전체 회귀 통과로 보고하지 않는다. GitHub의 전체 checkout CI와
  실제 RTCPeerConnection 브라우저 워크플로를 별도로 실행한다.

## 제외한 변경과 남은 확인

원인 기록 없이 중국 회선, 교사 기기, TURN 서버를 원인으로 단정하거나 교체하지 않는다.
정상 음성 연결에 ICE 재시작을 반복하는 방법도 사용하지 않는다.
녹화 두 건의 방 ID/시간과 vc_quality, 접속 이력, 복구 로그를 대조해야 사건 원인을
확정할 수 있다. 실수업 재검증과 실제 배포 반영 여부는 별도 확인 대상이다.
