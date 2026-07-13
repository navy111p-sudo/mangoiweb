# Mangoi 강사 대시보드 API

강사의 여러 강의 녹화 분석 결과를 **Neo4j 그래프 온톨로지**에 저장하고,
강사 마이페이지 대시보드를 위한 **FastAPI 엔드포인트**로 제공하는 백엔드입니다.

## 특징
- 🧑‍🏫 **강사 친화적 언어**: 기술 지표명을 직관적인 교육 용어로 자동 변환
- 🌐 **영/한 이중 언어**: 모든 서술형 분석(summary/strengths/action_items)을 두 언어로 동시 제공 → 프론트에서 즉시 토글
- 📈 **다중 강의 집계**: 여러 강의를 가로질러 평균(레이더)과 추세(라인)를 계산

## 온톨로지(그래프 스키마)
```
(:Instructor)-[:TAUGHT]->(:Lecture)-[:HAS_METRIC]->(:Metric)
(:Instructor)-[:HAS_REPORT]->(:Report)      // 정기 리포트 스냅샷
```
| 노드 | 주요 속성 |
|------|-----------|
| Instructor | id, name |
| Lecture | id, title, date |
| Metric | category, score, status(Good/Warning/Bad), feedback_en, feedback_ko |
| Report | period_start, period_end, generated_at, cadence_days, window_days, lectures_count, average_scores[], summary_en/ko, strengths_en/ko[], actions_en/ko[] |

**무결성(제약조건/인덱스)**: 앱 기동 시 `ensure_schema()` 가 `Instructor.id`/`Lecture.id`/`Report.id`
유니크 제약과 `Lecture.date`·`Report.period_end` 인덱스를 보장합니다(`IF NOT EXISTS`, 멱등).
→ 동시 수집 시 **중복 노드 방지** + 기간 조회 성능. 수집/리포트 쓰기는 "노드 id로 MERGE 후 관계 MERGE"
패턴이라, 관계가 끊긴 노드가 있어도 중복이 생기지 않습니다.

## 지표 라벨 매핑 (내부코드 → 강사용 라벨)
| 내부 코드 | EN | KO |
|-----------|----|----|
| Teacher_Talk_Ratio | Your Speaking Time | 강사 발화 비중 |
| Student_Engagement | Student Participation | 학생 참여도 |
| Praise_Count | Encouragement & Praise | 칭찬과 격려 |
| Question_Quality | Effective Questioning | 효과적인 질문 사용 |
| Response_Delay | Waiting Time for Student Answers | 학생 답변 대기 시간 |

## 실행
```bash
cd instructor-dashboard-api
pip install -r requirements.txt

# .env 의 NEO4J_* 값을 실제 접속 정보로 수정
uvicorn main:app --reload
```
- 대화형 문서: http://127.0.0.1:8000/docs

## 엔드포인트
| 메서드 | 경로 | 설명 | 인증 |
|--------|------|------|------|
| GET | `/health` | DB 연결 상태 확인 | — |
| POST | `/api/v1/seed` | 목업 데이터(강사 1명 + 강의 3회) 적재 | 🔑 |
| GET | `/api/v1/instructors/{id}/dashboard` | 전체 강의 집계 대시보드 | 🔑 |
| **POST** | **`/api/v1/lectures`** | **강의 1회분 분석 결과 수집(ingest)** | 🔑 |
| **POST** | **`/api/v1/reports/run`** | **정기 리포트 일괄 생성(스케줄러/크론용)** | 🔑 |
| **GET** | **`/api/v1/instructors/{id}/report`** | **마이페이지 최신 정기 리포트(+지난 기간 대비 변화)** | 🔑 |
| **GET** | **`/api/v1/instructors/{id}/reports`** | **리포트 히스토리(최신순, 기간별 점수 → 장기 추세)** | 🔑 |
| **GET** | **`/api/v1/instructors`** | **관리자 개요(전체 강사 강점/개선영역/Good 수)** | 🔑 |

🔑 = `X-API-Key: <INGEST_TOKEN>` 헤더 필수.
- 🔐 **fail-closed (2026-07-14)**: `INGEST_TOKEN` 미설정이면 보호 API 전체가 503 거부됩니다(예전의 "미설정=무인증 허용" 폐지 — 배포 실수로 강사 PII가 공개되는 사고 방지). 로컬 개발에서만 `ALLOW_INSECURE_NO_AUTH=true` 로 우회하세요.
- 강사 데이터 GET 도 인증 필수입니다. 프론트(마이페이지)는 키를 브라우저에 넣지 말고, 로그인 세션을 검증하는 서버(워커)가 X-API-Key 를 붙여 프록시하는 구조로 연동하세요.

`.env` 에서 `SEED_ON_STARTUP=true` 이면 앱 기동 시 목업이 자동 적재됩니다.

## 결론 · 실천 가이드 (교사가 읽고 바로 고치는 부분)
`/dashboard` 와 `/report` 응답의 `english_view.conclusion` / `korean_view.conclusion` 에는
교사가 스스로 수정할 수 있도록 **명확히 구분된 최종 결론**이 EN/KO 로 담깁니다.

| 필드 | 의미 |
|------|------|
| `keep_doing` | ✅ 계속 유지할 점 (장점) |
| `improve` | 🔧 더 잘해야 할 점 (보완점) |
| `avoid` | ⛔ 하지 말아야 할 점 (단점) |
| `closing` | 📋 장점→보완점→하지 말 것을 엮은 자세한 마무리 문단 (다음 2주 실천 지시) |

데모(`demo.html`) 맨 아래에 이 결론이 3색 카드(초록/노랑/빨강) + 마무리 문단으로 항상 노출됩니다.

## 정기 리포트 주기 — 왜 격주(14일)인가
교사의 습관 교정(발화 비중·대기 시간·질문 방식)은 *행동 → 결과*를 연결하는 피드백 루프입니다.

| 주기 | 평가 |
|------|------|
| 매주(7) | 빠르지만 주간 강의 수가 적으면 평균이 출렁여 노이즈로 보이고 알림 피로 |
| **격주(14) ⭐ 기본** | 데이터가 안정적으로 쌓이고 "바꿔보고 → 효과 확인"하는 코칭 사이클과 일치 |
| 월(30) | 큰 흐름엔 좋지만 나쁜 습관을 한 달 방치 후 피드백 → 개선용으론 느림 |

- **노이즈 완화**: 리포트는 격주로 생성하되 집계 창은 **직전 4주(28일) 롤링**(`REPORT_WINDOW_DAYS`).
- `.env` 한 줄로 조정: `REPORT_CADENCE_DAYS`(주기), `REPORT_WINDOW_DAYS`(집계 창).

## 배포 & 자동화 산출물
컨테이너 배포(`Dockerfile`)와 격주 크론 템플릿은 [`deploy/`](deploy/README.md) 참고.
- Cloudflare Cron Worker(권장) / GitHub Actions / 시스템 crontab 3방식
- ⚠️ 이 FastAPI(Python) 앱은 Cloudflare **Workers에서 실행 불가** → 컨테이너로 호스팅하고 크론이 API 호출

## 스케줄링 방법 (택1)
**A. 외부 크론 (운영 권장 — 다중 워커 중복 실행 방지)**
```bash
# 격주 월요일 09:00에 리포트 생성 트리거 (crontab 예시)
0 9 * * 1  [ $(( ($(date +\%s)/86400) \% 14 )) -eq 0 ] && \
  curl -fsS -X POST https://<host>/api/v1/reports/run -H "X-API-Key: $INGEST_TOKEN"
```
Cloudflare Cron Trigger / GitHub Actions `schedule` 로도 동일하게 이 엔드포인트를 호출하면 됩니다.

**B. 앱 내부 스케줄러 (단일 인스턴스/데모)**
`.env` 에 `ENABLE_SCHEDULER=true` → APScheduler가 `REPORT_CADENCE_DAYS`마다 자동 실행.

## 분석 결과 수집(ingest) 예시
```bash
curl -X POST http://127.0.0.1:8000/api/v1/lectures \
  -H "Content-Type: application/json" -H "X-API-Key: $INGEST_TOKEN" \
  -d '{
    "instructor_id":"inst_01","instructor_name":"John Doe",
    "lecture_id":"lec_04","title":"Beginner English Ch.4","date":"2026-07-13",
    "metrics":[
      {"category":"Praise_Count","score":85,"feedback_en":"Great praise.","feedback_ko":"칭찬이 훌륭해요."},
      {"category":"Teacher_Talk_Ratio","score":60,"feedback_en":"Well balanced.","feedback_ko":"균형이 좋아요."}
    ]
  }'
# status 를 생략하면 점수로부터 자동 유도됩니다.
```

## 빠른 확인
```bash
curl -X POST http://127.0.0.1:8000/api/v1/seed
curl http://127.0.0.1:8000/api/v1/instructors/inst_01/dashboard
# 없는 강사 → 404 + {"error_en": "...", "error_ko": "..."}
curl -i http://127.0.0.1:8000/api/v1/instructors/nobody/dashboard
```

## 목업 시나리오 (성장 스토리)
| 강의 | 날짜 | 하이라이트 |
|------|------|-----------|
| Ch.1 | 2026-06-01 | 칭찬 우수(Good), 발화 비중 과다(Warning) |
| Ch.2 | 2026-06-15 | 반응 속도 빠름(Good), 빠른 진행으로 참여도 저조(Bad) |
| Ch.3 | 2026-06-29 | 참여도 우수(Good) + 발화 비중 균형(Good) → 개선 |
