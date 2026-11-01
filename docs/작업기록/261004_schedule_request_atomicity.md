# 일정 변경 신청의 저장 원자성·동시 변경 보호

- 날짜: 2026-10-04
- 작업자: dot
- 브랜치: fix/admin-audit-sequential-20261004
- 범위: 로컬 수정·검증. 원격 푸시/PR/병합/배포·운영 데이터 변경 없음.

## 1. 왜 했나

학생 연기·변경과 관리자 일정 조정 뒤 학생/강사/관리자의 시간표·예약방이 일치하는지 반복 검증 중 독립 QA가 여섯 결함을 각각 세 번 재현했다.

1. 직접 이동은 막는 강사 근무불가 날짜를 학생 신청 승인으로 우회함
2. 신청 결정 쓰기가 실패하면 수업만 이동함
3. 수업 쓰기 실패를 삼키고 승인 성공을 반환함
4. 신청 후 관리자가 바꾼 최신 시간을 오래된 신청 승인으로 덮음
5. 학생의 동시 중복 제출이 두 개의 pending 신청을 만듦
6. 동시에 반려된 신청을 오래된 pending 읽기로 승인하고 수업을 옮김

## 2. 무엇을 바꿨나

- `src/schedule-request-atomic.ts`: 요청 행 CAS, 원래 수업 행, 검증 대상 일정과 근무불가/휴가·강사·권한 표 스냅샷을 SQL CHECK guard로 대조한다. 모든 수업 변경과 pending 조건 결정 UPDATE가 한 D1 batch 안에 들어간다. 어느 SQL이 실패해도 전체 롤백한다.
- `src/api-admin.ts`: 승인 전 strict 이동 충돌/근무불가 검사, 저장 실패 시 오류 반환. 신규 관리자 신청은 서버 일정 스냅샷을 저장한다. 연기보강 표시는 신청 INSERT와 함께 저장한다.
- `src/api-mango.ts`: 학생 신원·소유권 검사는 유지하고 서버 일정 스냅샷을 저장한다. 중복 사전 조회뿐 아니라 단일 `INSERT … SELECT … WHERE NOT EXISTS`가 마지막으로 중복을 막는다.
- `src/student-schedule-request.ts`: nullable `schedule_snapshot` 칼럼만 추가한다. 옛 신청은 수정/삭제/백필하지 않는다.
- 관리자 `adm-r11.js` 및 `manager.html`: 오래된 신청·충돌·저장 실패의 실제 사유를 표시한다. manager는 pending409에서 반려 버튼을 살리고 캐시를 비운다. `already_decided`만 재결정을 잠근다. adm-r11 캐시 버전 v4 및 자산 원장 갱신.

## 3. 왜 이렇게 풀었나

- 수업 `updated_at`은 `max(현재 시각, 이전 값+1)`로 단조 증가시킨다. 시계가 같아도 A→B→A가 옛 스냅샷을 되살리지 않게 한다. 결정·감사 시각은 실제 시각을 유지한다.
- 날짜/시간만 대조하면 교사·학생·상태·갱신 시각 변경을 놓친다. 접수 당시 서버 `scheduleMoveVersion`을 저장해 승인 때 비교한다.
- 기존 날짜 지정 신청은 당시 버전을 증명할 수 없어 409로 보존하고, 반려 후 최신 일정에서 새 신청을 받는다. 이 정책은 사용자에게 설명하고 승인을 받았다. 현재 일정으로 스냅샷을 백필하는 방법은 사실을 지어내므로 쓰지 않는다.
- 반복 신청의 recorded-only 수동 조정 계약은 유지한다. 반복 회차 예외 모델을 새로 만들지 않는다.
- 직접 이동 서비스의 Cafe24 도장/감사 출처가 이 경로와 다르므로 그 서비스 자체를 호출하지 않는다. strict 충돌 판정은 공유하되, 기존 mirror 도장·postponed 재활성화·end_makeup·schedule-request 감사 출처를 유지한다.
- 기존 중복 신청이 있는 표에 unique index를 강제로 생성하거나 중복을 삭제하지 않는다. 원자적 조건 INSERT는 옛 중복을 그대로 두면서 추가 중복만 막는다.
- 성공 후 감사/알림은 기존 best-effort 계약이다. 부수 작업 실패로 이미 저장된 결과를 실패라고 반환하지 않는다.

## 4. 확인한 방법

로컬 실제 Worker 라우터/인증·SQLite D1 대체·고정 시계·가짜 KV로 검증했다. 외부 네트워크와 운영 DB는 사용하지 않았다.

- TypeScript `tsc --noEmit`: 통과
- 독립 lifecycle QA: 399 PASS / 0 FAIL, 세 가지 데이터·순서·시간대. 실행한 학생 신청 UI와 관리자/매니저 오류 복구 UI, 커밋 직전 근무불가 삽입, 레거시 반려→재접수→승인, 100개 바인드 한도, 알림/감사 실패 시 durable 결과, 고정 시계에서 승인/직접 이동 A→B→A와 강사 주간 달력까지 검증했다.
- `student_schedule_request_harness`: 117 PASS / 0 FAIL
- `class_postponed_harness`: 64 PASS / 0 FAIL
- `end_makeup_harness`: 22 PASS / 0 FAIL
- `manager_today_reschedule_harness`: 84 PASS / 0 FAIL
- `schedule_move_room_sync_harness`: 174 PASS / 0 FAIL (변이 검사 포함)
- `forbidden_teacher_who_harness`: 55 PASS / 0 FAIL
- 자산 버전 검사: 266 PASS / 0 FAIL
- `git diff --check`: 통과

기존 소스 추출 하니스에는 신규 실제 helper와 D1 batch 결과 형태를 연결했다. 단순히 성공 조건을 없애지 않았으며 기존 교사 변경·이력·반복 보호·mirror 계약을 계속 검사한다.

## 5. 남은 것 / 주의

- 전체 aggregate 두 차례 최종 실행은 최종 통합 검증에서 수행한다.
- 브라우저 DOM/함수 실행과 로컬 Worker 검증은 실제 운영 화면·실제 학생/강사 간 화상 접속 확인과 다르다. 운영 화면이나 실제 통화는 검증하지 않았다.
- 배포되지 않았다. 실제 기존 신청은 이 작업으로 수정되지 않았다.
