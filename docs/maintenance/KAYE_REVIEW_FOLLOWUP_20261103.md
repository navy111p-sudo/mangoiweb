# Kaye 수업 복구 독립 검토 후속 — 로컬 검증 단계

기준 5aabca01c7dc2e455972715f63ff60cfe7be8d99. 원격 게시·운영 적용 없음.

수정: 실패한 이전 수업 칠판 정리의 소켓 attachment fence를 재구성 후에도 존중하고 새 참가자에게 전파한다. A 저장/B 실패/C 저장 때 원자적인 bounded snapshot으로 보충하여 warm/cold 이력을 일치시킨다. 복원 SELECT 실패와 새 수업 reset 실패를 구분하고 재조회·명시 clear를 허용한다. 진행 중 단독 참가자 또는 짧은 빈방 뒤 재입장 기록은 나이만으로 삭제하지 않는다.

안전 격리: VC_WHITEBOARD_HISTORY=on을 명시한 경우만 SQL journal을 사용하며 기본 꺼짐이다. 배포 설정에 이 값을 추가하지 않았다. off는 기존 live 메모리 replay를 유지한다. 저장 실패 직후, 보충 저장 이전에 서버가 사라지면 미저장 필기는 복원할 수 없다. 현재 전송 프로토콜에는 durable ACK/클라이언트 재송신 계약이 없다. 따라서 이 코드만으로 무손실 복원을 보장하거나 기능을 운영에서 켜면 안 된다. attachment 저장 자체의 플랫폼 오류와 실제 hibernation 타이밍은 미검증이다. SQL byte/op cap은 무한 이력 보관이 아니다.

교재: pending 중복 제거에 요청 scope 유효성을 반영한다. 같은 책·9쪽 로딩 중 userId가 바뀐 재입장은 새 요청으로 처리한다. 실제 pdfLoad의 기존 두 인자 함수 서명과 generation/room 가드를 보존하고 선택적 세 번째 요청 가드를 commit 직전에 검사한다. 강사 공유 중지/원격 중지는 generation 및 coordinator 요청을 무효화한다. 학생의 권한 거부는 진행 중 로더를 취소하지 않는다. 원래 Eric 로더의 본문은 이 guard 추가 때문에 byte-identical하지 않으며 기존 회귀 검사를 다시 실행한다.

번역: 완료/취소 시 캡처한 수신자 안내를 복원하지 않고 실제 현재 수신자로 placeholder를 다시 그린다. 실제 수신자 setter와 translation wrapper를 함께 검사하여 Alice→전체 취소 후 private draft 자동전송이 없고 다음 수동 전송이 현재 전체 대상과 일치하는지 확인한다. 실제 번역 API 호출 없음.

미해결: PDF 위 필기는 여전히 서버 메모리뿐이다. 실제 DO 함수에서 필기 1개→서버 재구성→0개를 격리 SQLite로 재현했다. 기존 replay가 비동기 교재 로딩보다 먼저 도착하는 경우도 별도 검증이 필요하다. 방·수업 세대·교재 URL/쪽 scope, 공유 중지/새 수업/쓰기실패의 원자적 수명 설계 없이 칠판 journal을 무작정 재사용하지 않았다.

짧은 연결 끊김: 단독 dropped/미상 경로는 자동 종료하지 않았다. 추가로 명시 left→빠른 재입장→dropped 순서에서 이전 명시 퇴장 표시와 타이머가 나중 순단을 종료시키는 조건부 결함을 실제 hook/poll의 가상 clock으로 재현했다. 비명시 퇴장과 피어 복귀는 이전 종료 epoch를 무효화하고, 타이머는 해당 방/자기ID를 검사한다. 현재 명시 left의 정상 종료 positive control은 보존한다. Kaye의 실제 종료 원인은 로그·기기·회선 증거가 없어 미확정이다. ICE/restartIce/카메라/생존 알람은 변경하지 않았다. 실기기 소음 제거·Office Mode·배경은 미시험이다.

검증 산출물은 별도 evidence ZIP으로 제공한다. 전체 gate에는 browser 검사가 제외될 수 있으며 Chromium sandbox 실패로 실제 browser 시나리오 실행은 완료되지 않았다. 이 단계는 여섯 독립 finding의 로컬 보완 및 안전 격리이며 Kaye의 세 요청 전체 해결 완료나 운영 해결을 뜻하지 않는다. 독립 재검토와 PDF 필기/실기기 연결 검증이 계속 필요하다.
