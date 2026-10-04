# Seven-track local integration evidence map

Baseline: `4e559303e56ee3a894fe51403f9de613c4cbc48d`. Final validation pin: `3280843917a75464e6b0604528be2a9d2905c3ba`. Full results are recorded in `integration-manifest.json`.

No complete-track acceptance is claimed. Original per-track reports retain their source baselines and component-only counts; the integration manifest governs the combined source.

| Track | Before / defect | Local change | Harness / sandbox | Regression | Current status | Remaining acceptance |
|---|---|---|---|---|---|---|
| 1. 학생·선생님 화상 접속 안정성 | See [16-field report](track-reports/track1.md) | 피어/트랙/stats 세대와 카운터 초기화 가드, Direct/TURN 판정 및 loopback Sandbox 대상 제한 | In-process fixtures / VM or local SQLite only | 486/0/20 fast suite outcomes twice; targeted repeats pass | partial | HOME/OFFICE 수집 identity 및 과거 소속 계약 결정; 승인된 격리 브라우저/UDP shaping 환경; 한국·필리핀 실기기 장시간 실제 영상·음성 검증 |
| 2. AI 말하기 자연스러움·응답속도 | See [16-field report](track-reports/track2.md) | 취소/재시작/오래된 STT·TTS 응답 배제, 타이밍 계측, 웜업 첫 문장 처리, 최신 개인별 속도 설정 보존 및 복원 경쟁 수정 | In-process fixtures / VM or local SQLite only | 486/0/20 fast suite outcomes twice; targeted repeats pass | partial | 실제 마이크·발음 데이터·모델 제공자 기반 정확도/지연 평가; 장기 대화 의미·학생 말 끊김·침묵 관찰; 실제 브라우저 재검증 |
| 3. AI 말하기 ↔ AI 게임 학습 연동 | See [16-field report](track-reports/track3.md) | game-vocab의 학생별 진행 중 요청 분리와 계정 전환/로그아웃 후 오래된 결과 폐기 | In-process fixtures / VM or local SQLite only | 486/0/20 fast suite outcomes twice; targeted repeats pass | blocked | 서버 소유자 검사 변경 승인 및 허용된 검증 경로; 기존 저장소 제한 연동 vs 새 이벤트 원장 설계 결정; 테넌트/직원 열람·보존/삭제·수준 및 발음 근거 정책 |
| 4. 매일 보고 미작성·미확인 알림 | See [16-field report](track-reports/track4.md) | 기존 보고별 큐/응답 모델 보존, 실패 재시도·자정 경계·지연 표시·확인 후 오래된 본문 차단 | In-process fixtures / VM or local SQLite only | 486/0/20 fast suite outcomes twice; targeted repeats pass | partial | 의무 작성 대상·마감·휴가·수신자·경고 간격 운영 기준; 실기기 수신·읽음 검증; 최종 조회 뒤 발송 경합·이미 표시된 알림 회수 불가 |
| 5. 수업 신청·결제·스케줄·잔여횟수 | See [16-field report](track-reports/track5.md) | 결제 금액/상태 검증, 생성 복구 표식과 전량 batch, 선택 회차 환불 대사·최종 쓰기 CAS, 미확정 정기청구 보호 | In-process fixtures / VM or local SQLite only | 486/0/20 fast suite outcomes twice; targeted repeats pass | blocked | 환불 권한 fail-open 별도 승인·허용된 검증; 실제 PG/브라우저/수업 전체 흐름; PG 처리 중 상태변경 후 관리자의 미배분 대사; enrollment와 수업 생성 전체 트랜잭션 아님; 과거 불명확 누락 자동 복원 안 함 |
| 6. 학생·관리자 연기 및 일정 완전 동기화 | See [16-field report](track-reports/track6.md) | Cafe24 원본 ID+소유권 보호, 이동 후 재동기화 중복/취소 방지, 기존 학생/관리자 일정·방 투영 보존 | In-process fixtures / VM or local SQLite only | 486/0/20 fast suite outcomes twice; targeted repeats pass | partial | 기존 중복·손상 데이터 별도 읽기 전용 현황과 승인; 실제 D1 규모·Cafe24 연동·드래그 브라우저 회귀; 변경 후 학생/교사 실제 영상·음성 입장 |
| 7. AI 전용 / 화상수업+무료 AI 구분 | See [16-field report](track-reports/track7.md) | 운영 라우트와 분리된 이용권 계약·로컬 SQLite 제안 스키마·원장·기간/환불/전환 모형 | In-process fixtures / VM or local SQLite only | 486/0/20 fast suite outcomes twice; targeted repeats pass | blocked | 이용권 schema·auth/접근 gate·청구 연동 최종 설계 승인; Cafe24/B2B 안정적 출처 매핑·과거 데이터 처리; 학습/평가/매출/통계/관리자 UI 실제 연결 및 E2E |

## Final integrated result

- Focused: 18 suites × 3 rounds = 54 passed runs, 0 failures, 0 transport attempts.
- Full fast gate: 486 passed, 0 failed, 20 declared exclusions in each of two completed runs. Internal legacy skips remain distinct from successful behavior tests.
- 1,511 source/test files unchanged before and after; manifest SHA-256 `ff3fba82f78d63abc6409f107a33d43231c106b910c980cbcc6e3ca2298f6ea0`.
- TypeScript exit 0, 583 JavaScript fragments with 0 syntax errors, 268 valid cache references, unchanged first-paint budget passed.
- No real user/browser/media/provider acceptance or remote CI run is implied.

## Required approval and decision boundaries

- No push, pull request publication, merge, deployment, production migration or production data mutation has occurred.
- Track 3: owner enforcement and client compatibility need the separate authorization and a permitted execution path; the paused server audit is not being rerun. The durable learning-event contract, retention/deletion, authoritative tenant ownership, teacher/admin access and evidence semantics remain decisions.
- Track 5: the known refund authorization fail-open is intentionally unchanged pending separate approval. The local final-write race repair changes only lesson eligibility predicates.
- Track 7: local sandbox schema work was already authorized and implemented. That does not authorize production schema, runtime gates, charging adapters, legacy backfill or rollout. Existing track labels remain independent of current paid access.
- Track 1: HOME/OFFICE identity/history collection has not been wired into production. Its identity/schema policy needs review before adding it.
- Track 4: current opt-in settings are preserved. Mandatory employee roster, deadlines, time zones, holidays/leave, recipient mapping and warning intervals need operational confirmation.
- Prepared offline CI is local source only. It has not been published or executed remotely. Browser/UDP impairment, physical devices, real provider measurements and KR/PH trials still need an authorized non-production environment.

## Integration discoveries

- Daily handover script-reference context and additive cache-ledger entries overlapped; merged narrowly without restoring old versions. qlog v21, daily-handover v11, game-vocab v2, speech-preferences v4 and all associated current hashes are preserved.
- Refund eligibility could change after its final read and before the cancellation write. The payment owner added final SQL eligibility predicates and two regression cases: 186 → 188 checks.
- Whole regression exposed student-games first-paint blocking payload 320KB, exceeding the 305KB baseline plus 12KB allowance. The owner moved historical comments to docs; executable representation and script order are unchanged. Source bytes fell15,687 →11,446; the unchanged gate passes at316KB. This is not a real-page latency measurement.
- Existing npm update checks and deployment-window live probing were blocked before transport. The final runner disables the update check and uses the existing SKIP_LIVE_PROBE option with a minimal, credential-free child environment. The ICE queue test now provides an explicit failing fetch fixture instead of inheriting the host network. Shipping connection/deployment behavior is unchanged.
- Direct-file output capture is used for focused tests because one legacy harness calls process.exit immediately and can truncate piped stdout. This does not alter production source or assertions.
- An independent reviewer returned preliminary scope/cache findings and the payment race, then hit a cybersecurity-risk tooling block. No retry or alternate bypass was attempted; the overall independent integration review is incomplete.

## Performance statement limits

- Track 1 statistics improvements are deterministic synthetic diagnostic corrections, not lower real packet loss or faster reconnection.
- Track 2 25,800ms → 750ms is a virtual-clock cancelled-face-speech lifecycle comparison, not observed service latency. STT accuracy, real model/TTS latency and long-context naturalness are unmeasured.
- Track 5 240 lesson inserts become one lesson INSERT plus a marker UPDATE in one batch, but enrollment plus schedule creation is not one transaction and no D1 latency improvement is claimed.
- No provider Sandbox, actual financial transaction, real user media session, physical push receipt or browser layout run is counted as passed.

## Identity and incident-attribution boundary

Existing Track 6 tests cover a stable upstream origin ID with a mismatched UID, duplicate manual identities and an identity appearing at insertion time. A retained display name does not authorize merging students or assigning ownership. Genuinely different upstream origin IDs are not automatically treated as aliases. No live account deletion or data cleanup is part of this integration. A room-entry record alone is not proof of a particular network defect or the cause of a missed meeting.

## Evidence packaging

The accompanying `seven-track-evidence.tar.gz` preserves all raw logs byte-for-byte, including intermediate failures and the interrupted run. Raw console logs are not normalized or treated as source code; committed JSON summaries and before/after source manifests provide the indexed results.
