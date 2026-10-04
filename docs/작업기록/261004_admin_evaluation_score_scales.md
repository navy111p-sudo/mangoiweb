# 관리자 평가 점수 척도 수정 (순차 수리 3단계)

## 상태와 범위

코드와 격리 테스트만 변경했다. 운영 API/DB에는 접근하거나 쓰지 않았고 배포하지 않았다.
관리자 평가서 목록과 그 목록의 전체 평균만 정규화한다. 학생·강사 이름, 날짜 스키마 통합은 다음 단계다.

## 확인한 입력 계약

- 강사 일지와 관리자 수동 평가 폼: 1–5. 새 POST `/api/eval/manual-create`.
- 관리자 AI 초안의 직접 저장: 0–10. 새 POST `/api/eval/draft-create`.
- 일괄 평가 폼: 0–10. 기존 `/api/eval/bulk-create`.
- AI 수업 분석: 0–100. 기존 `/api/eval/ai-lesson-report`.
- 학생 상세 평가/발음 기록: 0–100. 기존 `/api/admin/student/:uid/evaluations`.

서버가 경로별 `evaluation_source`와 `score_scale`을 지정한다. 본문에 온 메타데이터는 신뢰하지 않는다.
입력 범위를 검증하고 0점과 빈 입력을 구별한다. AI의 유효한 0점을 기본값 75점으로 바꾸던 것도 수정했다.

## 과거 데이터와 호환성

`score_overall`, `score_total` 등 기존 점수값은 고치지 않는다. 계산용 필드는 읽기 결과에만 더한다.

과거 행의 확실한 근거는 다음으로 제한했다.

- `ai_lesson_reports.evaluation_id`가 연결된 평가: 100점. 낮은 4점도 4/100으로 읽는다.
- `score_total`만 있는 학생 상세 평가: 100점.
- 강사 화면만 쓰는 `note_chips`가 NULL이 아니며 학생·강사·방 식별자가 모두 있는 행: 5점.
  빈 칩 배열은 빈 문자열로 저장되므로 허용한다. `note_en`/`note_ko`는 나중에 수정할 수 있어 단독 근거로 쓰지 않는다.
- 나머지는 척도 미확인. 숫자가 5보다 크거나 작다는 사실만으로 척도를 정하지 않는다.

과거 `/api/eval/create`에는 5점 수동 폼과 10점 AI 초안이 함께 들어왔다.
열려 있던 옛 화면과 강사 오프라인 큐를 막지 않도록 이 경로는 계속 저장하되,
`evaluation_source='legacy_unclassified'`, `score_scale=NULL`로 기록한다.
응답에 새로고침 안내를 보내고 평균에서는 제외한다. 현재 화면과 큐 재전송 코드는 새 고정 척도 경로를 쓴다.

## 읽기 계약

정본은 `src/evaluation-scores.ts`다. 목록과 전체 집계가 같은 SQL 투영을 쓴다.
목록 LIMIT은 전체 평균에 영향을 주지 않는다. 원래 행의 점수/이름/날짜/알림/링크 필드를 보존한다.

추가 행 필드: `score_value`, `score_max`, `score_source`, `score_status`, `score_normalized_100`.
상태는 `ok`, `missing`, `unknown_scale`, `invalid_score`, `invalid_metadata`다.
평균 `avg_score`는 100점 환산값이며 `avg_score_scale=100`이다. 계산할 점수가 없으면 NULL이다.
`scored_count`, `excluded_score_count`, `unknown_scale_count`, `invalid_score_count`, `missing_score_count`를 함께 제공한다.
화면은 `/5`, `/10`, `/100`과 100점 환산 평균의 실제 포함 건수를 표시하고, 제외 건수를 알린다.
척도가 미확인인 행에는 별점이나 분모를 추측해서 그리지 않는다.

## 배포할 때 필요한 것 (아직 실행하지 않음)

- Worker와 현재 HTML/JS를 함께 배포해야 한다. 새 두 경로의 index.ts 허용목록 포함.
- 기존 자가 치유 스키마 경로에서 `evaluation_source TEXT`, `score_scale INTEGER`를 가산한다.
  원본 데이터의 UPDATE, 역산값의 영구 저장, 테이블 재작성은 없다.
- 메타데이터 열은 점수 쓰기 경로에서만 보장한다. 추가가 실패하면 새 평가를 무척도로 계속 쓰지 않고 실패 처리한다. 읽기는 기존 열만으로 투영하며, 상담·결제 같은 다른 상세 탭을 이 마이그레이션에 종속시키지 않는다.
- 기존 NOT NULL `user_id`/`eval_at` 스키마에서도 bulk/AI 저장이 가능하도록 신규 INSERT에 호환값을 넣었다.
- adm-q1/adm-r6의 캐시 버전을 올렸다. 자산 원장은 전용 하니스가 생성했다.
- 되돌려도 가산 열은 그대로 두어도 된다. 운영 DB 열을 삭제하는 되돌리기는 이 작업에 포함하지 않는다.

## 검증

`evaluation_score_scales_harness.mjs`: 실제 SQLite에서 SQL과 핸들러 실행, 네트워크/AI/알림은 격리.
새/레거시 스키마, 0점, 수동4/5·일괄4/10·AI4/100 혼합, 불명확/잘못된 척도 제외,
표본수·LIMIT 독립성·원본 불변, 네 작성 경로와 새 두 경로, 메타데이터 위조 무시,
옛 화면 호환 저장, 상세 입력 0점 보존, 가짜 DOM 렌더링과 실패 응답 시 통계/목록 오류 표시를 확인한다.
실제 Worker를 번들해 진입 라우팅과 세션 인증을 확인한다(무인증401, 유효 세션+빈 본문400).

로컬 브라우저 시각 검증은 환경의 소켓/localhost 차단으로 불가능하다는 이전 단계의 확인을 따른다.
이를 운영 사이트에서 대체 검증하지 않았다. 전체 게이트 결과는 최종 수리 보고에 기록한다.

## 남은 인접 문제 (이번 단계에서 변경하지 않음)

- `api-admin.ts`: 월간 KPI, 학생 분석, 이탈 위험 평균/추이, 7일 브리핑의 원시 점수 집계.
- `api-reports.ts`, `api-students.ts`, `learning-insights.ts`: 월간/주간/학습 추이 원시 평균.
- `marketing-studio.ts`, `api-games.ts`: 원시 점수 기준 세그먼트/보상 임계값.
- `eval.html`, `report.html`, `parent.html`, `eval-quick-view.js`, `class-today-extras.ts`: 값 크기로 척도를 추정하는 미리보기/상세 화면.
- 강사 과거 평가 배지, 월간 그래프, AI 월간 프롬프트의 고정 5점 표현.

새 목록에서 점수가 올바르게 보이는 것이 모든 하위 화면과 위험 점수가 수정됐다는 뜻은 아니다.
