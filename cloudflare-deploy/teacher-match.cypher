// ============================================================================
//  teacher-match.cypher — 학생⇄강사 매칭 그래프 모델 · 정본 스펙
//  '강사관리 > MBTI' 메뉴가 받는 강사의 MBTI·취미/관심사·수업 스타일을
//  Neo4j 속성 그래프로 모델링하고, 학생의 관심사+MBTI 궁합 기준으로
//  최적 강사를 실시간 추천한다(기존 RDB 조건문 매칭 대체).
//
//  런타임은 Cloudflare Workers라 Bolt 드라이버를 못 쓴다. 실제 호출은
//  src/teacher-match.ts 가 Neo4j Aura "HTTP Query API"(/db/neo4j/query/v2)로
//  아래 4) 추천 쿼리를 그대로 전송한다. 이 파일은 (1) 모델 정본 문서이자
//  (2) Aura/Bolt 어디서든 그대로 쓰는 이식형 쿼리다.
//  D1(강사·학생 원자료) → 그래프 적재는 주기적 ETL(export)을 전제로 한다.
// ============================================================================

// ── 1) 스키마 / 제약 (유일성 + 탐색 인덱스) ──────────────────────────────────
CREATE CONSTRAINT student_id   IF NOT EXISTS FOR (s:Student)  REQUIRE s.student_id IS UNIQUE;
CREATE CONSTRAINT teacher_id   IF NOT EXISTS FOR (t:Teacher)  REQUIRE t.teacher_id IS UNIQUE;
CREATE CONSTRAINT interest_name IF NOT EXISTS FOR (i:Interest) REQUIRE i.name IS UNIQUE;
CREATE CONSTRAINT mbti_type    IF NOT EXISTS FOR (m:Mbti)     REQUIRE m.type IS UNIQUE;

//  노드:  (:Student {student_id, name})
//         (:Teacher {teacher_id, name, style, active})   // style = 수업 스타일
//         (:Interest {name})    // 학생·강사가 "공유"하는 참조 노드(공통 관심사 탐색의 핵심)
//         (:Mbti {type})        // 16종. 학생·강사가 "공유"하는 참조 노드
//  관계:  (Student|Teacher)-[:INTERESTED_IN]->(Interest)
//         (Student|Teacher)-[:HAS_MBTI]->(Mbti)          // 1:1
//         (Mbti)-[:COMPATIBLE_WITH]->(Mbti)              // 궁합(무방향 의미로 매칭)

// ── 2) MBTI 16종 + 궁합 시드 (등록 1회) ──────────────────────────────────────
//   궁합 표는 서비스 정책에 맞게 조정. 방향은 한쪽만 넣어도 추천 쿼리가
//   무방향 패턴 -[:COMPATIBLE_WITH]- 로 양방향 인정한다.
UNWIND $compatPairs AS pair          // 예: [{a:'ENFP', b:'INTJ'}, {a:'INFJ', b:'ENTP'}, ...]
  MERGE (a:Mbti {type: pair.a})
  MERGE (b:Mbti {type: pair.b})
  MERGE (a)-[:COMPATIBLE_WITH]->(b);

// ── 3) 적재 (D1 export → 파라미터 UNWIND, 멱등 MERGE) ─────────────────────────
// 강사 적재: MBTI · 관심사 · 수업 스타일
UNWIND $teachers AS t                // {teacher_id, name, style, active, mbti, interests:[...]}
  MERGE (tn:Teacher {teacher_id: t.teacher_id})
    SET tn.name = t.name, tn.style = t.style, tn.active = coalesce(t.active, true)
  MERGE (tm:Mbti {type: t.mbti})
  MERGE (tn)-[:HAS_MBTI]->(tm)
  WITH tn, t
  UNWIND t.interests AS topic
    MERGE (i:Interest {name: topic})
    MERGE (tn)-[:INTERESTED_IN]->(i);

// 학생 적재: MBTI · 관심사 (MBTI 빈값이면 HAS_MBTI 생략 — 관심사만 반영)
UNWIND $students AS s                 // {student_id, name, mbti, interests:[...]}
  MERGE (sn:Student {student_id: s.student_id})
    SET sn.name = s.name
  WITH sn, s WHERE s.mbti IS NOT NULL AND s.mbti <> ''
  MERGE (sm:Mbti {type: s.mbti})
  MERGE (sn)-[:HAS_MBTI]->(sm)
  WITH sn, s
  UNWIND s.interests AS topic
    MERGE (i:Interest {name: topic})
    MERGE (sn)-[:INTERESTED_IN]->(i);

// 소스에서 사라진 강사 비활성화(노드/관계 보존, 추천 후보에서만 제외)
MATCH (t:Teacher)
WHERE NOT t.teacher_id IN $activeIds   // $activeIds = 이번 적재된 강사 id 목록
SET t.active = false;

// ── 4) 추천 쿼리 (정본) — src/teacher-match.ts 가 이 텍스트를 그대로 전송 ──────
//   파라미터: $studentId(문자열), $limit(정수)
//   점수: 공통 관심사 개수 × 10  +  (MBTI 궁합 시 20, 아니면 0)
//   고득점순 정렬. 접점 0(totalScore=0)인 강사는 제외.
MATCH (s:Student {student_id: $studentId})
MATCH (t:Teacher)
WHERE coalesce(t.active, true) = true                 // 비활성 강사 제외

// (1) 공통 관심사 개수 — 공유 Interest 노드를 사이에 둔 경로 탐색
OPTIONAL MATCH (s)-[:INTERESTED_IN]->(i:Interest)<-[:INTERESTED_IN]-(t)
WITH s, t, count(DISTINCT i) AS sharedInterests

// (2) MBTI 궁합 — 동일 유형이거나 COMPATIBLE_WITH(무방향)이면 호환
OPTIONAL MATCH (s)-[:HAS_MBTI]->(sm:Mbti)
OPTIONAL MATCH (t)-[:HAS_MBTI]->(tm:Mbti)
WITH t, sharedInterests,
     CASE
       WHEN sm IS NULL OR tm IS NULL                THEN false
       WHEN sm = tm                                 THEN true
       WHEN EXISTS { (sm)-[:COMPATIBLE_WITH]-(tm) } THEN true
       ELSE false
     END AS mbtiCompatible

// (3) 점수 합산
WITH t, sharedInterests,
     sharedInterests * 10                        AS interestScore,
     CASE WHEN mbtiCompatible THEN 20 ELSE 0 END AS mbtiScore
WITH t, sharedInterests, interestScore, mbtiScore,
     interestScore + mbtiScore AS totalScore
WHERE totalScore > 0
RETURN t.teacher_id   AS teacherId,
       t.name         AS teacherName,
       t.style        AS teachingStyle,
       sharedInterests,
       interestScore,
       mbtiScore,
       totalScore
ORDER BY totalScore DESC, sharedInterests DESC
LIMIT $limit;
