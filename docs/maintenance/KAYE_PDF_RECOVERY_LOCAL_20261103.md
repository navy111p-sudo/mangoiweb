# Kaye PDF 필기 및 경계 후속 — 로컬 검토용, 영속화 활성화 금지

기준 ddf086d96e62fcac81c12480dea2c73e534e1245. 운영/원격 게시/배포 없음.

기본 실행 경로: 교재가 완료되기 전에 도착한 replay/live 필기를 해당 방/계정/연결/문서 요청에 묶어 대기한다. 교재·연결 변경과 중지는 폐기하며 2000프레임/4MiB 한도를 초과한 불완전 replay는 적용하지 않는다. 문서 로드 후 해당 페이지에 재생한다. 공유가 중지된 교재는 재생/실시간 필기 대상이 아니며, 이전 교재 URL을 따로 기억하여 stop 뒤 다른 책에 옛 필기를 섞지 않는다. 문서 전환 시 remote stroke ID 캐시도 분리한다. 세대/ACK 없는 legacy replay가 이미 기록이 있는 로컬 문서에 도착하면 기존 필기를 보호하려고 덮어쓰기를 보류하고 안내한다. 이 경우 오프라인 동안 누락된 원격 필기를 자동 병합했다고 주장하지 않는다.

서버 user-joined 자체는 이전 left 종료 epoch를 무효화하지만 ICE나 미디어가 건강하다고 판정하지 않는다. 3초 PeerConnection 생성 전 종료 타이머가 먼저 도는 재현을 막으며, 이후 새 명시 left의 종료 positive control은 유지한다. 실제 Kaye 연결 사고 원인/회선/기기는 미확정이다. 카메라/ICE/liveness/소음제거/Office Mode/배경은 변경하지 않는다.

칠판 실험 경계: 실패한 reset을 SQLite pending/generation 행으로 표시하고, 참가자·참관자 모든 replay에 동일한 차단을 적용한다. 마지막 소켓 소실/복원 조회 반복 실패/SQL 삭제 성공 후 attachment 갱신 실패/실험 off 상태의 편집·clear를 검사한다. oversized 단건은 복원 backlog에서 제외하고 안내하며 다음 정상 쓰기를 독립적으로 저장한다. SQL 성공과 attachment 실패를 혼동해 clear 방송을 생략하지 않는다. SQL 세대가 더 새로운 성공 clear를 증명하면 이전 소켓 fence 때문에 새 기록을 숨기지 않는다.

PDF 영속화는 완성 기능이 아니라 로컬 실험이다. 단일 방 SQLite의 vc_pdf_history/parts/reset namespace에 schema1, session, 활성 교재 및 문서별 필기 스냅샷을 원자 저장한다. 교재·페이지별 clear/undo/shape를 현재 상태로 축약하며 사라지는 펜은 영속화하지 않는다. 총 2000개 문서/필기 객체와 4MiB payload를 넘으면 기존 스냅샷을 유지하고 새 쓰기를 거절한다. 정상 snapshot은 재시작 뒤 복원하고, 공유 중지와 다른 책/수업 세대 및 저장 실패를 구분한다. 알 수 없는 schema는 보류하고 명시 reshare만으로 조용히 삭제하지 않는다. 기본 off의 legacy KV 경로를 유지하며 SQL이 권위 저장소인 실험 모드에서는 compatibility KV 실패로 이미 성공한 SQL commit을 실패 취급하지 않는다. SQL namespace adapter는 내부 SQL의 고정 table prefix만 바꾸며 사용자 payload는 bound parameter로 유지한다. 운영 스키마/마이그레이션을 적용하지 않았다.

**두 영속화 실험은 운영 활성화 불가하다.** 플랫폼이 호출하는 state/env 두 인자 생성자에서는 환경 flag가 on이어도 실행되지 않는다. 격리 하니스가 명시한 세 번째 replayPrototype 옵션에서만 실험한다. 배포 설정에 flag를 추가하지 않았다.

활성화 차단 증거:
- SQL reset 표시와 KV 경계 쓰기가 모두 실패하고 모든 소켓이 사라지면 이전 PDF 이력이 재노출되는 복합 실패를 재현했다. DO 저장소와 독립된 신뢰 가능한 수업 세대 증명이 필요하다. 이 경로를 해결됐다고 주장하지 않는다.
- 서버에서 새 본인 필기가 저장된 뒤 이전 in-flight authoritative snapshot이 도착하면 본인 화면에서 필기를 지우는 경합을 실제 서버/화면 함수의 합성 결합으로 재현했다. ACK/revision 병합 barrier가 필요하다. 이 numeric-session 경로는 로컬 실험에서만 발생하며 정상 runtime에는 활성화할 수 없다.
- 스냅샷 전체를 매 점마다 복사/저장하므로 쓰기 증폭이 크다. benchmark script는 논리 payload bytes와 시간만 기록하며 실제 물리 쓰기량·Cloudflare 비용·실기기 성능을 주장하지 않는다. 증분 journal/compaction 설계를 검증해야 한다.

따라서 Kaye 요청 전체 완료/운영 해결/무손실 보장은 아니다. 정상 재시작, 지우기, 전환, 저장 오류, 한도, 동시성의 통과 자료와 위 의도된 실패 probe를 함께 제공한다. 전체 gate의 PASS와 별개인 비운영 실패를 숨기지 않는다. 실제 browser는 이전 sandbox launch 실패 때문에 미검증이며 실제 수업/마이크/운영 API·DB/메일·SMS/계정은 사용하지 않았다.


첫 화면 예산 후속: 필기/포인터 수신 및 replay를 idx-vc-pdf-annotations.js(defer)로 분리했다. idx-main의 작은 bootstrap은 초기 프레임을 방/계정/연결별로 제한 보관하고 모듈 로딩과 교재 완료 순서를 검증한다. 오류 재시도는 제한하며 online 시 재시도할 수 있다. 포인터는 최신 1건만 해당 문서/계정/연결에 한정하고 레이저 수명을 넘겨 재생하지 않는다. 첫 화면 예산 기준은 수정하지 않았다. 실제 브라우저 실행은 아직 미검증이므로 DOM/네트워크 실측 완료를 주장하지 않는다.


전송 대기 버퍼는 30초를 넘기면 보류하고 안내한다. 이는 진행 중인 수업의 저장 기록 삭제가 아니라, 세대가 불명확한 오래된 미적용 프레임을 새 교재에 적용하지 않기 위한 제한이다. 이후 정상 live 필기는 계속 수신하며 누락된 legacy 이력의 자동 병합을 완료했다고 주장하지 않는다. 정상 runtime은 SQL getter가 없는 legacy 저장소에서도 두 실험의 저장소를 조회하지 않는 검사를 포함한다.
