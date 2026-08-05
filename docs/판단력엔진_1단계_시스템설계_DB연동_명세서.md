# 판단력 엔진 — 1단계 시스템 설계 및 DB 연동 명세서

> **버전** v1.0 · **작성일** 2026-07-16 · **작성** 수석 AI 아키텍트
> **범위** 마스터플랜 3단계 로드맵 중 **1단계(설계 및 스키마)** — 기존 코드 스캔 결과에 기반한 RDB↔Neo4j 연동 확장 스키마 설계
> **목표** '지식 암기' → 'AI 활용 판단력 훈련' 전환을 위한 데이터 기반 마련. 실시간 수업 무중단 + 비동기 분석 + 개인화 그래프.

---

## 0. 요약 (Executive Summary)

1. **원자 단위 = 판단 이벤트(Judgment Event)**: "상황 제시 → 표현 후보 중 선택 → 이유 설명 → AI가 ①선택 적절성 ②이유 논리 두 축 채점". 모든 점수·그래프·리포트가 이 단위에서 파생.
2. **RDB(D1)**: 신규 5개 테이블 — `judgment_events`, `judgment_analysis`, `misconception_taxonomy`, `decision_growth_snapshots`, `analysis_perf_log`. 기존 mango-db self-healing DDL 관례를 따름.
3. **Neo4j**: 라이브 `:Student {student_id}` 노드에 판단 경로 그래프를 **충돌 없이** 접합. 신규 라벨 5종·관계 9종(기존 예약어 회피).
4. **비동기 아키텍처**: 캡처·응답은 엣지(Workers)에서 즉시(202) 처리, 무거운 LLM/그래프 연산은 백그라운드로 분리. **2가지 배포 모드**를 정의하고, 무인프라로 즉시 가능한 **Mode A(엣지)** 를 v1으로, NCP 이전 완료 시 **Mode B(FastAPI+Celery+Redis)** 로 승격.
5. **판단력 지수(Judgment Index)**: 5축(선택 적절성/이유 논리/자기교정/어투 민감도/일관성) 가중합 0~100. 기간별 델타 = '판단력 성장 추이'.

> **1단계 산출물은 본 명세서(설계+스키마)이며, 코드 이식은 2단계에서 진행한다.**

---

## 1. 기존 시스템 스캔 결과 (설계 전제)

### 1.1 확정 사실
| 축 | 현실 | 근거 |
|---|---|---|
| 엣지 런타임 | Cloudflare Workers (TS), 단일 D1 `mango-db` | `wrangler.toml:27-30`, `:109-112` |
| 스키마 방식 | **런타임 self-healing DDL** (`CREATE TABLE IF NOT EXISTS` + `ALTER ADD COLUMN`). 마이그레이션 디렉터리 없음 | `schema.sql` + 각 `api-*.ts` |
| LLM | **OpenAI 아님. Cloudflare Workers AI `@cf/meta/llama-3.3-70b-instruct-fp8-fast`** (`callLLM()` 단일 추상화). STT=`@cf/openai/whisper` | `ai-command.ts:13,17`; `api-points.ts:530` |
| 수업 종료 훅 | `vcLeaveRoom()` → 교사 코칭카드 → `POST /api/ai-feedback/generate` | `index.html:12709/12722`; `teacher-feedback.js:190`; `api-points.ts:418` |
| Neo4j 접근 | Cafe24 `:8880` **HTTP Query API** `runCypher(env, stmt, params, mode)` (Workers는 Bolt 불가) | `teacher-match.ts:301-383` |
| 라이브 학생 키 | **`:Student {student_id}`** (teacher-match / warmup / churn-contagion 공유) | scan §4 |
| 야간 파이프라인 | 02:00 KST MySQL→Neo4j(서버 `mangoi-sync.sh`) → 03:00 KST Neo4j→D1(`cafe24-sync.ts`) + D1→Neo4j ETL(teacher-match/warmup/contagion) | `index.ts:1615,1718-1745` |
| 비동기 큐 | **없음** (Celery/Redis/RQ/BackgroundTasks 전무). 유일 = instructor-dashboard-api APScheduler(기본 off) | scan §3 |
| Python 백엔드 | 2개 FastAPI(`app/`, `instructor-dashboard-api/`) — Bolt 사용, 별도 DB. 후자는 `INGEST_TOKEN`(`X-API-Key`) 인증 | `main.py:72` |
| 학생 리포트 | `admin/student.html` Chart.js 레이더(Speaking/Listening/Grammar/Focus) | `student.html:1957` |
| 판단력 데이터 | **전무**. 가장 근접 = `ai_writing_corrections.issues[]`(구조화 오류), warmup `STRUGGLED_WITH`(문장 단위 약점 그래프) | scan §5 |

### 1.2 반드시 피해야 할 함정
- **Neo4j 예약어 충돌**: `ASSIGNED_TO`(Student→Teacher & Student→Textbook), `TEACHES`(Teacher→Class & Content→Concept), `THEN`(churn 시계열)은 **이미 중복 사용**. 판단 그래프는 새 이름 사용.
- **기존 학생 키 재사용**: 스펙 파일엔 `uid`/`user_id`/`id` 변형이 있으나 **라이브는 `student_id`**. 반드시 `student_id`로 접합(그래야 warmup 개인화와 융합).
- **야간 전체 재생성**: 02:00 서버 스크립트가 Neo4j를 MySQL에서 재생성 → MySQL에 없는 판단 노드는 **자체 03:00 ETL로 재적재** 필요(teacher-match/warmup이 그렇게 매일 MERGE 재실행).
- **스키마 드리프트**: `class_schedules` 등 핵심 테이블은 다중 정의 존재. 신규 테이블은 **단일 소유 파일**에서만 DDL 정의.
- **Workers Bolt 불가**: 신규 그래프 쓰기는 반드시 `runCypher`(HTTP) 경유.

---

## 2. 도메인 모델 — 판단 이벤트(Judgment Event)

### 2.1 개념
```
상황(Situation) ─┬─ 표현후보 A ─┐
                 ├─ 표현후보 B ─┤→ 학생 선택(chosen) + 이유(reasoning)
                 └─ 표현후보 C ─┘        │
                                         ▼
                        AI 채점: choice_score(선택 적절성) + reasoning_score(이유 논리)
                                         │
                        오답이면 → misconception_tag(오답 유형 분류)
```
- 암기 정답률이 아니라 **판단의 질**을 잰다는 철학이 스키마에 각인되는 지점.
- 발생원(`source`): `in_class`(수업 중 실시간 판단 순간) · `warmup` · `writing` · `review_quiz` · `game`.

### 2.2 판단력 지수(Judgment Index) — 5축 정의
| 축 | 코드 | 산출 소스 | 설명 |
|---|---|---|---|
| 선택 적절성 | `axis_choice` | `judgment_analysis.choice_score` 평균 | 최선 표현을 골랐는가 |
| 이유 논리 | `axis_reasoning` | `reasoning_score` 평균 | 왜 그 표현인지 논리·깊이 |
| 자기교정력 | `axis_selfcorrection` | 동일 misconception 재발 감소율 | 틀린 유형을 다음에 고치는가 |
| 어투·상황 민감도 | `axis_register` | `reasoning_features.register_awareness` | 격식/맥락 인지 |
| 일관성 | `axis_consistency` | 점수 분산의 역수(정규화) | 판단 안정성 |

**Judgment Index** = `0.30·choice + 0.30·reasoning + 0.15·selfcorrection + 0.15·register + 0.10·consistency` (0~100).
**성장 추이** = 기간별 `judgment_index`의 델타(`delta_index`). 시각화 = 레이더(5축) + 추세선(index 시계열).

---

## 3. RDB(D1) 확장 스키마

> 규칙: 신규 테이블은 **`src/api-judgment.ts` 단일 소유**. `ensureJudgmentTables(env)`에서 `CREATE TABLE IF NOT EXISTS`로 self-heal(기존 관례 준수). 타임스탬프 = epoch-ms INTEGER. 실제 FK 제약 대신 컬럼 규약(`student_uid` = `students_erp.user_id` = `:Student.student_id`).

### 3.1 `judgment_events` — 판단 이벤트 원본 로그(RDB 권한)
```sql
CREATE TABLE IF NOT EXISTS judgment_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  event_uid     TEXT UNIQUE,          -- 클라이언트 생성 idempotency 키
  student_uid   TEXT NOT NULL,        -- = students_erp.user_id / :Student.student_id
  student_name  TEXT,
  room_id       TEXT,
  schedule_id   INTEGER,
  lesson_date   TEXT,                 -- YYYY-MM-DD
  source        TEXT NOT NULL,        -- in_class|warmup|writing|review_quiz|game
  situation_id  TEXT,                 -- 시나리오 뱅크 참조(없으면 ad-hoc)
  situation_text TEXT,
  skill_tag     TEXT,                 -- 대상 판단 스킬(예: request-politely)
  options_json  TEXT,                 -- 제시된 표현 후보 배열
  chosen_option TEXT,
  chosen_index  INTEGER,
  reasoning_text TEXT,                -- 학생의 '왜'
  lang          TEXT DEFAULT 'en',
  analyzed      INTEGER DEFAULT 0,    -- 0=대기,1=완료,2=실패 (큐 상태)
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_je_student ON judgment_events(student_uid, created_at);
CREATE INDEX IF NOT EXISTS idx_je_pending ON judgment_events(analyzed);
```

### 3.2 `judgment_analysis` — AI 채점 결과(1:1)
```sql
CREATE TABLE IF NOT EXISTS judgment_analysis (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id      INTEGER UNIQUE,       -- judgment_events.id
  student_uid   TEXT NOT NULL,
  choice_score  INTEGER,              -- 선택 적절성 0~100
  best_option   TEXT,                 -- AI 판단 최선 표현
  is_optimal    INTEGER,              -- 학생이 최선을 골랐나 0/1
  reasoning_score INTEGER,            -- 이유 논리 0~100
  reasoning_features_json TEXT,       -- {depth,register_awareness,self_correction,...}
  misconception_tag TEXT,             -- misconception_taxonomy.code (오답 시)
  feedback_ko   TEXT,
  feedback_en   TEXT,
  model         TEXT,                 -- 사용 모델(감사)
  cache_hit     INTEGER DEFAULT 0,
  latency_ms    INTEGER,              -- 성능 로깅
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ja_student ON judgment_analysis(student_uid, created_at);
CREATE INDEX IF NOT EXISTS idx_ja_misc ON judgment_analysis(misconception_tag);
```

### 3.3 `misconception_taxonomy` — 오답 유형 사전(시드)
```sql
CREATE TABLE IF NOT EXISTS misconception_taxonomy (
  code        TEXT PRIMARY KEY,       -- REGISTER_MISMATCH, DIRECT_TRANSLATION, TENSE_CONFUSION ...
  label_ko    TEXT, label_en TEXT,
  dimension   TEXT,                   -- 어느 판단 축에 해당(choice|reasoning|register...)
  description TEXT,
  sort_order  INTEGER DEFAULT 0,
  enabled     INTEGER DEFAULT 1,
  updated_at  INTEGER
);
```
초기 시드(예): `REGISTER_MISMATCH`(격식 불일치), `DIRECT_TRANSLATION`(직역투), `TENSE_CONFUSION`(시제 혼동), `WORD_CHOICE`(어휘 부적절), `OVER_LITERAL_REASON`(이유가 표면적), `NO_CONTEXT`(맥락 미고려), `GRAMMAR_FORM`(형태 오류).

### 3.4 `decision_growth_snapshots` — 성장 추이 집계(learning_trend_snapshots 패턴 준수)
```sql
CREATE TABLE IF NOT EXISTS decision_growth_snapshots (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  period        TEXT NOT NULL,        -- YYYY-MM 또는 YYYY-Www
  student_uid   TEXT NOT NULL,
  student_name  TEXT,
  events_count  INTEGER,
  axis_choice   REAL, axis_reasoning REAL, axis_selfcorrection REAL,
  axis_register REAL, axis_consistency REAL,
  judgment_index REAL,               -- 가중합 0~100
  delta_index   REAL,                -- 직전 기간 대비 성장
  top_misconceptions TEXT,           -- json [{code,count}]
  generated_at  INTEGER,
  UNIQUE(period, student_uid)
);
```

### 3.5 `analysis_perf_log` — 작업별 성능 모니터링(마스터플랜 요구)
```sql
CREATE TABLE IF NOT EXISTS analysis_perf_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  task        TEXT NOT NULL,         -- judgment_analyze|neo4j_sync|growth_snapshot
  ref_id      TEXT,                  -- event_uid / student_uid / period
  duration_ms INTEGER,
  cache_hit   INTEGER DEFAULT 0,
  status      TEXT,                  -- ok|error|timeout
  detail      TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_perf_task ON analysis_perf_log(task, created_at);
```
> 병목 감지: `task`별 `duration_ms` p95 집계 쿼리 + 임계 초과 시 기존 `push_queue`/알림 재사용.

---

## 4. Neo4j 판단 경로 그래프 설계

> 라이브 `:Student {student_id}`에 접합. 모든 쓰기는 `runCypher(env, stmt, params, 'WRITE')`(HTTP). 신규 라벨/관계는 스캔 §4·§5 예약어와 **전부 비충돌** 확인 완료.

### 4.1 신규 노드 라벨
| 라벨 | 키 | 속성 | 비고 |
|---|---|---|---|
| `:Situation` | `situation_id` | `text, skill` | 시나리오 |
| `:Expression` | `expr_id` | `text, register` | 표현 후보 |
| `:JudgmentEvent` | `event_uid` | `created_at, source, choice_score, reasoning_score, is_optimal` | 판단 1건 |
| `:Misconception` | `code` | `label` | 오답 유형(=taxonomy). `:Concept`(F-stub)과 구분 |
| `:DecisionSkill` | `name` | — | 판단 스킬(`:Skill` 미사용 → 명확화) |

### 4.2 신규 관계 (예약어 회피)
| 관계 | 패턴 | 속성 |
|---|---|---|
| `MADE` | `(Student)-[:MADE]->(JudgmentEvent)` | — |
| `IN_SITUATION` | `(JudgmentEvent)-[:IN_SITUATION]->(Situation)` | — |
| `CHOSE` | `(JudgmentEvent)-[:CHOSE]->(Expression)` | — |
| `REJECTED` | `(JudgmentEvent)-[:REJECTED]->(Expression)` | — |
| `REVEALS` | `(JudgmentEvent)-[:REVEALS]->(Misconception)` | — |
| `REQUIRES` | `(Situation)-[:REQUIRES]->(DecisionSkill)` | — |
| `EXPRESSES` | `(Expression)-[:EXPRESSES]->(DecisionSkill)` | — |
| `WEAK_IN` | `(Student)-[:WEAK_IN]->(DecisionSkill)` | `count, last_at` (`WEAK_AT` stub과 구분) |
| `NEXT_DECISION` | `(JudgmentEvent)-[:NEXT_DECISION]->(JudgmentEvent)` | `gap_days` (판단 경로 시퀀스, `THEN` 회피) |

### 4.3 제약/인덱스
```cypher
CREATE CONSTRAINT je_uid IF NOT EXISTS FOR (e:JudgmentEvent) REQUIRE e.event_uid IS UNIQUE;
CREATE CONSTRAINT sit_id IF NOT EXISTS FOR (s:Situation) REQUIRE s.situation_id IS UNIQUE;
CREATE CONSTRAINT expr_id IF NOT EXISTS FOR (x:Expression) REQUIRE x.expr_id IS UNIQUE;
CREATE CONSTRAINT misc_code IF NOT EXISTS FOR (m:Misconception) REQUIRE m.code IS UNIQUE;
CREATE INDEX je_created IF NOT EXISTS FOR (e:JudgmentEvent) ON (e.created_at);
```

### 4.4 ETL upsert (warmup-graph.ts 템플릿 복제 → 신규 `src/decision-graph.ts`)
```cypher
-- D1 judgment_events + judgment_analysis 조인 결과를 배치로 전달
UNWIND $rows AS r
MATCH (st:Student {student_id: r.student_uid})
MERGE (e:JudgmentEvent {event_uid: r.event_uid})
  SET e.created_at=r.created_at, e.source=r.source,
      e.choice_score=r.choice_score, e.reasoning_score=r.reasoning_score,
      e.is_optimal=r.is_optimal
MERGE (st)-[:MADE]->(e)
MERGE (sit:Situation {situation_id: r.situation_id}) SET sit.text=r.situation_text, sit.skill=r.skill_tag
MERGE (e)-[:IN_SITUATION]->(sit)
MERGE (chosen:Expression {expr_id: r.chosen_expr_id}) SET chosen.text=r.chosen_option
MERGE (e)-[:CHOSE]->(chosen)
FOREACH (rej IN r.rejected_exprs |
  MERGE (rx:Expression {expr_id: rej.expr_id}) SET rx.text=rej.text
  MERGE (e)-[:REJECTED]->(rx))
FOREACH (_ IN CASE WHEN r.misconception_tag IS NULL THEN [] ELSE [1] END |
  MERGE (m:Misconception {code: r.misconception_tag})
  MERGE (e)-[:REVEALS]->(m)
  MERGE (sk:DecisionSkill {name: r.skill_tag})
  MERGE (st)-[w:WEAK_IN]->(sk) SET w.count=coalesce(w.count,0)+1, w.last_at=r.created_at)
```
> 시퀀스 엣지 `NEXT_DECISION`은 학생별 `created_at` 정렬 후 별도 패스로 연결(warmup의 2-pass 방식과 동일).

### 4.5 조회 쿼리 (3단계 개인화 훈련 API의 기반)
```cypher
-- 약점 스킬 상위 N + 대표 오답 유형
MATCH (st:Student {student_id:$sid})-[w:WEAK_IN]->(sk:DecisionSkill)
OPTIONAL MATCH (st)-[:MADE]->(:JudgmentEvent)-[:REVEALS]->(m:Misconception)
RETURN sk.name AS skill, w.count AS weak_count,
       collect(DISTINCT m.code)[..3] AS misconceptions
ORDER BY w.count DESC LIMIT $n
```
→ 이 결과로 취약 패턴 기반 맞춤 시나리오를 출제(3단계).

---

## 5. 비동기 아키텍처 & 성능 최적화

### 5.1 데이터 흐름 (수업 무중단 원칙)
```
[수업/게임 클라이언트]
   │  판단 순간마다 POST /api/judgment/event  (event_uid 멱등)
   ▼
[Workers 엣지]  → D1 judgment_events(analyzed=0) INSERT → 즉시 202 반환   (실시간 절대 무블로킹)
   │
   ├── Mode A(v1, 무인프라):  ctx.waitUntil( analyzeJudgment() )
   │        └ env.AI.run(llama-3.3-70b) 채점 → judgment_analysis 기록
   │        └ KV(SESSION_STATE) 반복 캐시 조회/저장
   │        └ analysis_perf_log 기록
   │
   └── Mode B(NCP 이전 후 승격):  POST NCP /api/v1/judgment/analyze  (X-API-Key: INGEST_TOKEN)
            └ FastAPI가 202 → Celery enqueue(Redis broker)
            └ worker: LLM 채점 + Neo4j upsert + Redis 반복캐시
            └ 콜백: POST Workers /api/judgment/ingest-result 로 D1 반영
   ▼
[야간 03:00 KST]  decision-graph.ts ETL → Neo4j MERGE  +  growth_snapshot 집계
```

### 5.2 두 배포 모드 비교 (아키텍트 권고)
| | **Mode A — 엣지 네이티브 (권고: v1)** | **Mode B — NCP FastAPI+Celery+Redis** |
|---|---|---|
| 신규 인프라 | **없음** (기존 Workers AI·KV 재사용) | Redis+worker 프로세스 신설(NCP) |
| LLM | Workers AI llama-3.3-70b(무료·저지연) | 모델 자유(OpenAI 등) |
| 반복 캐시 | KV | Redis |
| 마스터플랜 부합 | 비동기·캐시·모니터링 요건 충족(용어만 다름) | Celery/Redis 문구 그대로 충족 |
| 적합 시점 | **지금** — 클래스 종료 훅 재사용 | NCP 이전 완료·대규모/고급모델 필요 시 |

> **권고**: 요구된 Celery/Redis 스택은 **NCP 이전과 직결**되므로, ingest 계약(`/api/judgment/event`, `/api/judgment/ingest-result`)을 **모드 불문 동일 인터페이스**로 지금 확정한다. v1은 Mode A로 즉시 가동(무인프라), NCP 준비되면 동일 계약 위에서 Mode B로 무중단 승격. 이 결정은 **provider 전환(Workers AI→OpenAI) 여부**와 함께 2단계 착수 전 사장님 확정 필요. → §8 결정사항.

### 5.3 Redis/KV 반복 캐시 규약
- **캐시 키**: `judg:v1:{sha256(situation_id + '|' + normalize(chosen_option) + '|' + normalize(reasoning_text))}`
- **값**: `judgment_analysis` 채점 JSON. **TTL 30일**.
- 효과: 동일 상황·동일 선택·동일 취지 이유의 반복 학습 요청은 **LLM 재호출 없이 즉시** 응답.

### 5.4 성능 모니터링
- 모든 비동기 작업은 `analysis_perf_log(task, duration_ms, cache_hit, status)` 기록.
- 기존 구조화 로깅(`console` + Cloudflare) 병행. p95 임계 초과 시 `push_queue` 재사용해 관리자 알림.

---

## 6. 클래스 종료 훅 연동 (2단계 이식 지점 명시)

- **실시간 판단 캡처**(주 경로): 수업 중 각 판단 순간 → `POST /api/judgment/event`. `vcLeaveRoom` 종료만 기다리지 않음.
- **종료 시 일괄/보강**: 기존 교사 코칭 훅과 **병렬**로 학생용 판단 요약을 트리거.
  - 클라이언트: `index.html:12786-12789`(학생 분기, 현재 `MangoFlow.open('class')`) 옆에 `judgment.summarize(room_id, student_uid)` 추가.
  - 서버: `api-points.ts:418`(`/api/ai-feedback/generate`)와 **동일 파일 계열의 신규 핸들러** `/api/judgment/*`(신규 `src/api-judgment.ts`) 신설. 라우팅은 `index.ts` 게이트에 등록(관례).
- 교사 카드(`teacher_class_feedback`)는 **교사 대상 유지**, 판단 리포트는 **학생/학부모 대상 신규 표면**.

---

## 7. 시각화 리포트 연동 (설계 예약)

- 데이터 소스: `decision_growth_snapshots`(레이더 5축 + index 추세선), 드릴다운 = `judgment_analysis` 최근 이벤트.
- 재사용: `admin/student.html:1957` Chart.js 레이더 패턴 확장(기존 4축 → 판단 5축 탭 추가). destroy/rebuild 관례(`:1956,:2166`) 준수.
- 신규 엔드포인트(2단계): `GET /api/judgment/growth?uid=&period=` → 스냅샷 반환. 학부모용은 `monthly_reports` 서술에 index 델타 문장 삽입.

---

## 8. 2단계 착수 전 확정 필요 결정사항

| # | 결정 | 옵션 | 아키텍트 권고 |
|---|---|---|---|
| D1 | 비동기 배포 모드 | Mode A(엣지) / Mode B(NCP Celery) | **A로 시작 → 계약 고정 → NCP 후 B 승격** |
| D2 | 판단 채점 LLM | Workers AI llama-3.3-70b / OpenAI | **llama 유지**(무료·기설치). 고급 필요 시 Mode B에서 교체 |
| D3 | 판단 캡처 범위 | in_class만 / 전 발생원(warmup·writing·quiz·game) | **writing·review_quiz부터**(기존 구조화 오류 데이터 재활용) → 점진 확대 |
| D4 | 시나리오 뱅크 | 신규 `situations` 테이블 / 기존 교재 문장 재활용 | **교재 문장(warmup Sentence) 재활용**으로 콜드스타트 회피 |

---

## 9. 산출물 체크리스트 (1단계 완료 정의)
- [x] 기존 RDB/Neo4j/Python/AI 훅 전수 스캔
- [x] 판단 이벤트 도메인 모델 + 판단력 지수 5축 정의
- [x] D1 신규 5개 테이블 DDL(self-healing 관례)
- [x] Neo4j 신규 라벨 5·관계 9 (예약어 비충돌 검증) + ETL/조회 Cypher
- [x] 비동기 2-모드 아키텍처 + 캐시/모니터링 규약
- [x] 클래스 종료 훅 이식 지점 명시(파일:라인)
- [x] 2단계 착수 전 결정사항 정리

---

## 부록 A. 신규 파일 배치(2단계 예정)
| 파일 | 역할 |
|---|---|
| `src/api-judgment.ts` | `ensureJudgmentTables`, `/api/judgment/*` 핸들러, 판단 채점 로직 |
| `src/decision-graph.ts` | Neo4j ETL/조회 (warmup-graph.ts 템플릿) |
| `index.ts` scheduled() | 03:00 블록에 `runDecisionGraphSync` + `runGrowthSnapshot` 등록 |
| `public/js/judgment.js` | 클라이언트 캡처/요약 브리지 |

## 부록 B. 예약어 비충돌 근거 (스캔 §4·§5 대조)
- 신규 라벨 `Situation/Expression/JudgmentEvent/Misconception/DecisionSkill` → 기존 라벨 집합에 없음.
- 신규 관계 중 `CHOSE/REJECTED/REVEALS/MADE/IN_SITUATION/REQUIRES/EXPRESSES/WEAK_IN/NEXT_DECISION` → 기존 관계 집합에 없음. `THEN`(회피)·`ASSIGNED_TO`(회피)·`TEACHES`(회피)·`WEAK_AT`(stub, `WEAK_IN`으로 구분) 확인.
