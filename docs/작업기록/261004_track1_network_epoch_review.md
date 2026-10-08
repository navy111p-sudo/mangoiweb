# 1번 업무: 화상수업 연결·안정성 검증 보고

작성: 2026-10-04 UTC. 기준 main: `27ec8ce91c624a80559ee82311fc425664b07319`.

**최종 판정: 추가 검증 필요.** 확인된 통계/재접속 상태 오류의 최소 수정과 로컬 검증은 진행했지만, 한국 학생과 필리핀 HOME/OFFICE 선생님의 실제 입장·양방향 음성/영상·장시간 수업은 검증하지 않았다. 코드 작성, 합성 검증, 현장 검증을 구분한다. 운영 DB/방/계정/미디어, 유료 API, 선생님 연락은 사용하지 않았다. 게시·병합·배포·스키마 변경은 하지 않았다.

## 1. 현재 문제

기존 PR [1357](https://github.com/navy111p-sudo/mangoiweb/pull/1357)의 영상 재협상 재시도와 Office AudioContext 복구 및 PR [1369](https://github.com/navy111p-sudo/mangoiweb/pull/1369)의 최신 main 변경을 기준으로 추가 빈틈을 조사했다. 이미 고친 기능을 다시 구현하지 않았다.

이번에 확인한 문제:
- 재접속/트랙 교체/통계 ID 변경/패킷 카운터 초기화 뒤 이전 미디어의 무수신 시간, 손실, concealment, freeze 수가 새 미디어에 섞인다.
- 새 피어/트랙의 첫 getStats가 지연되면 이전 60초 무수신 상태가 먼저 노출된다.
- 전환 전 손실 경고의 연속 횟수가 새 미디어로 넘어간다.
- candidate 정보가 없거나 불완전해도 Direct로 기록한다. 교체된 피어의 늦은 응답이 새 연결의 경로를 덮거나 동시에 시작된 경로 표본이 뒤섞일 수 있다.
- 기존 네트워크 E2E 도구는 명칭상 test인 실제 운영 도메인을 기본값으로 썼다. 실행하지 않았다.

## 2. 문제 재현 결과

main의 실제 `idx-vc-qlog.js` 전체를 VM에서 실행했다. 46개 최종 시나리오 중 **6 통과 / 40 실패 / 0 건너뜀**. 수정 소스는 **46 통과 / 0 실패 / 0 건너뜀**.

HOME와 OFFICE 이름을 붙인 고정 fixture를 각각 23개 실행했다. 이 구분은 공통 진단 코드에 대한 동일 조건 회귀 분리다. 실제 HOME/공유 OFFICE 회선, 국가 간 전송, 지역 지연 또는 서로 다른 현장 네트워크 특성을 재현했다는 뜻이 아니다.

## 3. 확인된 원인

수신 복구 판단에는 일부 미디어 identity 검사가 있었지만, 수신 손실·concealment·freeze 및 ghost-liveness용 무수신 횟수는 기존 `prev`가 있다는 이유만으로 비교했다. 이전 pc/track/stats의 누적값과 새 누적값을 비교할 수 있었다. 경로 탐침에는 현재 pc/요약 세대 확인과 중복 읽기 제한이 없었으며, `relay`가 아니면 Direct로 처리했다.

이것은 소스와 재현으로 확인한 결함이다. 특정 실제 수업 장애의 원인으로 확정한 것은 아니다.

## 4. 수정한 내용

- 같은 피어, 트랙, inbound stats ID, 유효한 증가 패킷 카운터인 경우에만 delta를 계산한다.
- 새 기준값은 무수신·손실·concealment·freeze 증가로 세지 않는다. 다음 유효 구간부터 정상 계산한다.
- 첫 비동기 응답 전에도 교체된 피어/트랙의 과거 무수신 상태를 비운다.
- 트랙 교체, 피어 교체, 요약 교체 뒤 도착한 오래된 응답을 버린다.
- 손실 경고 연속값을 새 미디어에 넘기지 않는다.
- Direct는 양쪽 후보가 host/srflx/prflx인 경우에만 인정한다. 한쪽 relay는 TURN의 충분한 근거로 유지한다. failed pair와 알 수 없는 경로는 알려진 표본으로 세지 않는다.
- getStats 경로 탐침은 피어당 한 번만 진행하며 실패 뒤 재시도할 수 있다.
- impairment 도구는 명시적 Sandbox 플래그, literal loopback origin, HOME/OFFICE label을 먼저 확인한다. 원격/운영/URL 자격증명 대상은 브라우저 모듈 import 전 차단한다.
- 과거 E2E 도구의 `balanced` 기대값을 이미 배포된 `maintain-framerate` 계약과 맞췄다. 이 도구의 실제 브라우저 실행은 이번 검증에 포함되지 않는다.

AAO, manual OFF, 기존 L0–L4 복구 단계/문턱, Office 처리 엔진, signaling, TURN 설정 및 수업방 ID는 변경하지 않았다.

## 5. 변경된 파일 및 주요 로직

- `cloudflare-deploy/public/js/idx-vc-qlog.js`: 위 수신/경로 표본의 identity, 카운터, 비동기 세대 가드
- `cloudflare-deploy/public/index.html`: qlog 캐시 버전 20 → 21 한 곳
- `test-harness/asset-versions.json`: 새 qlog 버전의 해시 한 항목
- `test-harness/vc_network_epoch_harness.mjs`: 실제 qlog 전체 소스의 46개 시나리오
- `test-harness/vc_network_epoch_mutations.mjs`: 유효 문법의 의도적 결함 13종을 넣고 실제 assertion 실패를 확인
- `test-harness/webrtc-sandbox-guard.mjs`: 외부/운영 대상 차단
- `test-harness/webrtc_sandbox_guard_harness.mjs`: 30개 입력/실제 entrypoint 차단 검사
- `test-harness/vc_netem_multiclient_harness.mjs`: 안전 가드를 import보다 먼저 적용, 기존 기대값 정합성
- 이 보고서

백엔드 API 및 DB 스키마는 수정하지 않았다.

## 6. Harness 테스트 내용

46개 새 시나리오에는 감소/증가 카운터 양쪽의 피어 재생성·트랙 교체·stats ID 변경, 실제 동일 ID 카운터 초기화, 첫 통계 지연, 통계 누락, 늦은 응답, 실패/불명 후보, partial relay 증거, 동시에 진행되는 탐침과 동기/비동기 getStats 실패가 포함된다.

수정과 짝인 13종 변이는 문법 검사를 먼저 통과해야 하며, 타임아웃/크래시가 아닌 완성된 행동 검사의 exit 1로 탐지됐는지 확인한다. Sandbox 30개 검사는 허용된 loopback과 잘못된 플래그/프로필/원격/운영/자격증명 URL을 짝으로 검증한다.

## 7. Sandbox 테스트 내용

Node VM에 합성 통계/피어/트랙 장애를 주입했다. 실제 미디어 패킷에 netem을 적용하지 않았다. 기존 Office 전체 IIFE의 suspended/interrupted/closed, mute 유지, 선택 마이크 복귀 등 15개 합성 시나리오도 회귀 실행했다.

실제 Chromium 루프백 검사 시도는 Unix socket EPERM으로 실행이 막혔다. 별도 loopback network namespace 준비도 netlink EPERM으로 실패했다. 제한을 우회하지 않았고 브라우저 성공으로 세지 않았다. 실제 KR/PH 왕복 RTT, 지터, 손실, Direct/TURN, 송수신 bitrate, 가용 대역폭, FPS/해상도, 영상 픽셀/수신 PCM, 네트워크 전환 및 장시간 수업 검증은 미실행이다.

CDP HTTP/WS 제한만으로 WebRTC UDP 미디어에 손실/지터가 적용됐다고 주장하면 안 된다.

## 8. 테스트 횟수

- 최종 새 수신/경로 시나리오: 46개, 추가 반복 10회 = 460개 시나리오 실행
- 최종 집중 회귀: 아래 18종을 2회, 각 회차 984개 검사, 실패/건너뜀 0
- 의도적 변이: 13종 전부 탐지
- 전체 게이트: 최종 로그 확인 결과는 아래 검증 기록에 적는다. 전체 fast 모드에는 선언된 E2E 20개 건너뜀이 있다.

18종/회차: network-epoch 46, sandbox-guard 30, fast-recovery 117, quality-blindspot 232, ghost-liveness 57, office-recovery 15, AAO-freeze 126, RX-stall 14, observer-camera 139, body-observer 9, office-gate 13, TURN-quality 38, teacher-network 15, ICE-queue 15, latency-tuning 34, lowstep-relay 20, root-cause 14, stability-checklist 50.

기존 회귀에는 소스 계약 검사와 합성 동작 검사가 섞여 있다. 위 숫자는 실제 수업 횟수가 아니다.

## 9. 성공·실패 결과

- 기준 소스: 새 46개 시나리오의 40개 실패로 결함 재현
- 수정 소스: 새 46개 및 Sandbox guard 30개 통과
- 최종 집중 회귀: 2회 모두 통과
- 현장/실기기/실제 브라우저: 검증되지 않음
- ordinary npm ci: 기존 Wrangler 3 / workers-types 5 peer dependency 충돌로 실패. `npm ci --legacy-peer-deps --ignore-scripts`로 공식 registry에서 설치했으며 package/lockfile은 변경하지 않았다.

## 10. 테스트 중 추가 발견된 문제

첫 수정 뒤에도 첫 통계 응답이 지연된 교체 피어/트랙의 무수신 상태와 이전 손실 경고 연속값이 남는 경우를 재현했다. 각각 새 검사로 추가하고 수정했다.

별도 통합 빈틈도 확인했다. `vc-teacher-network.ts`의 HOME/OFFICE 분류 함수 및 `vc-root-cause.ts`의 분류기는 존재하지만 production 호출자가 없다. 현재 quality-log INSERT와 admin quality 응답에는 HOME/OFFICE 연결이 없다. 세부 내용은 아래 제안에 기록했다.

## 11. 추가 문제 수정 내용

피어/트랙이 바뀌었음을 통계 요청 시작 전에 확인해 과거 무수신 streak를 비우고, 새 영상 baseline에서 손실 경고 연속값을 초기화한다. Sandbox 가드를 실행 가능한 검사로 보강했다. HOME/OFFICE 백엔드 통합은 schema/identity 결정을 받기 전에는 변경하지 않았다.

## 12. 재테스트 결과

추가 문제를 포함한 최종 46개 전부 통과하며 10회 반복에서 동일했다. 첫 수정 중간판의 새 pending-track 검사 실패도 남겨, 검사만 늘려 통과라고 한 것이 아님을 확인했다. 13개 변이도 최종 소스를 대상으로 다시 실행했다.

## 13. 회귀테스트 결과

기존 AAO/manual OFF, 건강한 오디오에서 불필요한 ICE restart를 하지 않는 검사, 1357의 재협상 실패/복귀, Office fallback과 mute/마이크 선택 보존, ghost-liveness, observer-camera, TURN 경로 및 ICE queue가 집중 회귀에서 통과했다. 실제 브라우저와 현장 사용은 이 결과로 대체하지 않는다.

## 14. 성능 개선 전·후 비교

실제로 측정한 합성 진단 정확성만 비교한다:

| 고정 fixture 관측값 | 기준 main | 수정 소스 |
|---|---:|---:|
| 낮은 카운터로 바뀐 미디어의 잘못된 무수신 시간 | 64초 | 0초 |
| 그 전환 표본에 새로 더해진 잘못된 freeze 수 | 8 | 0 |
| 새 baseline을 기존 누적값과 비교한 영상 손실 | 100%의 잘못된 표본 | 표본 없음(null) |
| 높은 카운터로 바뀐 미디어의 잘못된 영상 손실 | 약 5.263% | 표본 없음(null) |
| 새 유효 구간의 영상/음성 손실 및 concealment | 비교 불가한 전환값을 포함 | 각각 주입한 10%로 계산 |
| 최종 새 행동 시나리오 | 6 통과 / 40 실패 | 46 통과 / 0 실패 |

이 수치는 접속시간·복구시간 단축이나 실제 패킷 손실 감소를 뜻하지 않는다. 그런 전후 성능 수치는 아직 없다.

## 15. 남아 있는 위험요소

- HOME/OFFICE 단위의 production 분리 미연결 및 과거 소속 증거 부재
- quality-log의 uid/role이 인증되지 않은 클라이언트 입력이라, roster를 조인해도 발신자가 증명되지 않음
- 장치/browser/OS 및 KR/PH 현장망 차이 미검증
- 실제 높은 지연/손실/지터/낮은 bandwidth/순간 단절/네트워크 전환/카메라·마이크 장애의 패킷 수준 반복 미검증
- 기존 20 E2E skip 및 이 환경의 Chromium 실행 제한
- 신규 코드는 게시/원격 CI/배포되지 않았고 전체 7개 트랙 통합 뒤 별도 회귀가 필요

## 16. 최종 검증 상태

**확인한 수신·경로 통계 결함: 로컬 수정/재테스트 통과. 전체 1번 업무: 추가 검증 필요.**

필요한 다음 단계는 승인된 비운영 브라우저 CI, 실제 UDP shaping이 가능한 격리 Sandbox, HOME/OFFICE metadata 및 수집 identity 계약 승인, 그 후 따로 승인·준비한 한국/필리핀 endpoint의 장시간 검증이다. 운영 수업을 장애 실험에 사용하지 않는다.

## HOME/OFFICE 연결 제안: 아직 구현하지 않음

소스에서 확인한 연결:
- `teacher_profiles.group_name`: 기존 HOME/OFFICE 분류 helper가 해석하는 명부 필드
- `teacher_profiles.linked_teacher_id` → `teachers.id`: 명시적으로 확인해 연결하는 키
- `teacher_account_links.username` → `teacher_account_links.teacher_id`: 로그인명에서 위 teacher ID로 가는 연결
- `teachers.status`는 급여 쪽 office/home 필드도 있으나, 이를 profile group과 같다고 가정하거나 충돌을 덮으면 안 된다.

읽기 전용 현재 소속 투영을 추가한다면 `current_roster_network_type`와 CURRENT라는 명칭을 사용해야 한다. 정확한 username의 유일한 링크와 유일한 연결 profile에만 기존 helper를 적용하고, 링크 없음/중복/충돌/알 수 없는 label은 UNKNOWN으로 반환한다. 이름 추정, 대소문자 보정, teacher ID 숫자 추정으로 연결하지 않는다. 현시점 소속을 과거 수업 당시 소속으로 표현하지 않는다.

현재 quality-log는 무인증 POST에서 uid/role을 받는다. 따라서 위 read projection은 **현재 roster와 입력 UID가 일치한다**는 것만 말할 수 있다. 인증된 실제 발신자, 당시 국가/회선, 당시 HOME/OFFICE 소속을 증명하지 못한다. 기존 로그를 자동 재분류하거나 원인 확정에 사용하지 않는다.

과거 수업 당시의 검증된 분리에는 인증된 session/teacher identity와 기록 시점의 group snapshot·분류근거가 필요하다. 중요 데이터 구조 변경이므로 별도 설계를 보고하고 최종 승인을 받아야 한다. 입력 사용자 label을 그대로 저장하거나, 기존 정상 수업에 추가 DB 조회가 실패했다는 이유로 입장을 막는 방식은 피한다.

코드 근거:
- [현재 quality 수집](https://github.com/navy111p-sudo/mangoiweb/blob/27ec8ce91c624a80559ee82311fc425664b07319/cloudflare-deploy/src/api-mango.ts#L204-L280)
- [현재 admin quality 조회](https://github.com/navy111p-sudo/mangoiweb/blob/27ec8ce91c624a80559ee82311fc425664b07319/cloudflare-deploy/src/api-admin.ts#L620-L749)
- [명부와 계정 연결](https://github.com/navy111p-sudo/mangoiweb/blob/27ec8ce91c624a80559ee82311fc425664b07319/cloudflare-deploy/src/api-admin.ts#L4210-L4335)
- [기존 HOME/OFFICE 분류 helper](https://github.com/navy111p-sudo/mangoiweb/blob/27ec8ce91c624a80559ee82311fc425664b07319/cloudflare-deploy/src/vc-teacher-network.ts)

## 재현 명령

외부 endpoint/운영 계정 없이 실행:

```sh
node test-harness/vc_network_epoch_harness.mjs
node test-harness/webrtc_sandbox_guard_harness.mjs
node test-harness/vc_network_epoch_mutations.mjs
# 기준 counterfactual은 배포용 public 폴더 밖에 둔다.
git show 27ec8ce91c624a80559ee82311fc425664b07319:cloudflare-deploy/public/js/idx-vc-qlog.js > /tmp/qlog-baseline.js
QLOG_SOURCE=/tmp/qlog-baseline.js node test-harness/vc_network_epoch_harness.mjs
```

마지막 baseline 명령은 40개 실패/exit 1이 예상된다. 소스 원본을 수정하거나 실제 네트워크를 망가뜨리는 검사가 아니다.

## 전체 7개 보고용 1번 요약 행

| 작업 전 | 수정내용 | Harness | Sandbox | 회귀테스트 | 현재상태 | 남은 문제 |
|---|---|---|---|---|---|---|
| 재접속 표본·무수신 상태 혼합, 불명 경로를 Direct로 오인 | 미디어/통계 세대 가드와 loopback-only 시험 가드 | 새46 + 안전30, 변이13 | VM 합성만 실행 | 집중18종×2; 전체 gate 기록 아래 | 추가 검증 필요 | 실제 브라우저/UDP shaping/KR↔PH 장시간 통화, HOME/OFFICE 인증된 수집 연결 |

## 최종 검증 기록

코드 고정 후 전체 게이트 1회를 끝까지 실행했다: **472 PASS / 0 FAIL / 20 E2E SKIP**. TypeScript 오류 0, 인라인/외부 JS 581조각 오류 0, 버전 자산 266/266 통과. 개발 중 앞선 전체 실행도 같은 요약으로 통과했지만 코드가 바뀌던 실행이므로 최종 코드 2회 통과로 합산하지 않는다. 최종 집중 18종은 코드 고정 후 2회 모두 통과했다.

전체 게이트는 Node 프로세스의 외부 HTTP/fetch/TCP 차단과 offline npm 설정을 켜고 실행했다. 이는 OS 수준 packet shaping이나 실제 브라우저 네트워크 격리의 증거가 아니다. Root 하니스가 이미 설치된 esbuild를 찾도록 임시 node_modules 링크를 썼고, 검사 후 링크를 제거했다. 소스/lockfile 변경은 없었다. 최초 aggregate 시도는 npx 의존성 탐색 중 중단되어 최종 결과에 넣지 않았다.

최종 qlog SHA-256: `c43c7feab66b01e595b32a4ff0dd77580bb57aa45d962012e7c5b8de253b2716`.
