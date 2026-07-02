# 🔗 망고아이 Neo4j 그래프 DB 가이드

학생(Student)·강사(Teacher)·수업 피드백(Feedback)을 **그래프**로 저장/조회하는 프로토타입입니다.
"누가-누구에게-무엇을" 같은 연결(추천·학습경로)에 강한 구조라, 나중에 강사 추천·보충학습 경로로
확장하기 좋습니다.

## 그래프 스키마

```
(:Student {id, name})
(:Teacher {id, name})
(:Feedback {id, content, rating, created_at, teacher_id})

(:Student)-[:TAUGHT_BY]->(:Teacher)     # 학생이 이 강사에게 배웠다
(:Student)-[:RECEIVED]->(:Feedback)     # 학생이 이 피드백을 받았다
(:Feedback)-[:GIVEN_BY]->(:Teacher)     # (확장) 이 피드백은 이 강사가 남겼다
```

## 파일

| 파일 | 역할 |
|---|---|
| `app/services/neo4j_graph.py` | 연결·CRUD·조회(`MangoiGraph` 클래스) + 단독 실행 데모 + 추천 Cypher 예시 |
| `app/routers/graph.py` | FastAPI 라우터(`/api/graph/*`) — 학생/강사/피드백 추가·조회 |

---

## 1) Neo4j 띄우기 (둘 중 하나)

### 방법 A — 로컬 Docker (가장 빠름)
```bash
docker run -d --name mangoi-neo4j \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/testpassword \
  neo4j:5
```
- 브라우저 콘솔: <http://localhost:7474> (초기 로그인 neo4j / testpassword)
- Bolt 접속: `bolt://localhost:7687`

### 방법 B — Neo4j Aura (무료 클라우드)
1. <https://neo4j.com/cloud/aura-free/> 에서 **AuraDB Free** 인스턴스 생성.
2. 생성 시 나오는 **Connection URI**(예: `neo4j+s://xxxx.databases.neo4j.io`)와
   **비밀번호**를 안전하게 저장(비밀번호는 이때 한 번만 보여줌).
3. `NEO4J_URI` 에 그 URI, `NEO4J_PASSWORD` 에 그 비밀번호를 넣습니다.

> 🔐 실제 URI/비밀번호는 **본인이 직접** 환경변수/.env 에 넣으세요. 코드/깃에는 남기지 않습니다.

## 2) 환경변수(.env) 설정
`app/.env.example` 를 참고해 `.env` 또는 셸 환경변수에 넣습니다.
```
NEO4J_URI=bolt://localhost:7687        # Aura면 neo4j+s://... 로
NEO4J_USER=neo4j
NEO4J_PASSWORD=testpassword            # 본인 비밀번호
```
PowerShell 예: `$env:NEO4J_PASSWORD="testpassword"`

## 3) 설치
```bash
pip install -r requirements.txt        # neo4j 드라이버 포함
```

## 4) 실행

### (a) 단독 데모 (시드 + 조회 출력)
```bash
python -m app.services.neo4j_graph
```
→ 예시 학생/강사/피드백을 넣고, 학생 `stu_1001` 의 강사·피드백을 출력합니다.
→ 서버가 없으면 크래시 대신 **"Neo4j 연결 실패: 서버/환경변수 확인"** 안내가 뜹니다.

### (b) FastAPI 서버로
```bash
uvicorn app.main:app --reload --port 8010
# 문서: http://127.0.0.1:8010/docs
```

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/api/graph/student` | 학생 추가 `{"student_id","name"}` |
| POST | `/api/graph/teacher` | 강사 추가 `{"teacher_id","name"}` |
| POST | `/api/graph/enroll` | 학생-강사 연결 `{"student_id","teacher_id"}` |
| POST | `/api/graph/feedback` | 피드백 추가 `{"feedback_id","student_id","teacher_id","content","rating?"}` |
| GET | `/api/graph/student/{student_id}/teachers-feedback` | 강사 목록 + 각 강사 피드백 조회 |
| POST | `/api/graph/seed-demo` | 예시 데이터 시드(개발용) |

빠른 확인:
```bash
curl -X POST http://127.0.0.1:8010/api/graph/seed-demo
curl http://127.0.0.1:8010/api/graph/student/stu_1001/teachers-feedback
```

---

## 5) 기존 망고아이와의 통합 포인트
- **학생/강사 식별자 통일**: `student_id`·`teacher_id` 는 기존 D1 `students_erp.user_id`·강사 ID와
  같은 값을 쓰면 그래프가 기존 데이터와 바로 연결됩니다(별도 매핑 불필요).
- **피드백 소스**: 화상수업 종료 후 강사 평가/코멘트를 `POST /api/graph/feedback` 로 흘려보내면
  그래프에 누적 → 추천/리포트로 확장 가능.
- **추천 확장(보너스, 코드에 Cypher 스텁 포함)**:
  - (a) `RECOMMEND_TEACHERS_CYPHER` — 비슷한 강사군을 공유하는(성향 유사) 학생들이 높은 평점을 준 강사 추천.
  - (b) `WEAK_CONCEPT_PATH_CYPHER` — 취약 개념의 선수학습·보충 콘텐츠 경로(스키마에 `:Concept`/`:Content` 추가 시).
- 이 파이썬 서비스는 **wrangler 워커 배포 대상이 아닙니다**(별도 FastAPI 서비스).
