# -*- coding: utf-8 -*-
"""
neo4j_graph.py — 망고아이 그래프 DB(Neo4j) 연동 프로토타입

[이 파일이 하는 일]
  학생(Student)·강사(Teacher)·수업 피드백(Feedback)을 '그래프'로 저장하고 조회합니다.
  관계형 표(SQLAlchemy)로는 표현이 번거로운 "누가-누구에게-무엇을" 같은 연결을
  그래프로 다루면 직관적이고, 나중에 추천(비슷한 학생/보충 콘텐츠 경로)까지 확장하기 좋습니다.

[그래프 스키마]
  노드:  (:Student {id, name})
         (:Teacher {id, name})
         (:Feedback {id, content, rating, created_at, teacher_id})
  관계:  (:Student)-[:TAUGHT_BY]->(:Teacher)     # 학생이 이 강사에게 배웠다
         (:Student)-[:RECEIVED]->(:Feedback)     # 학생이 이 피드백을 받았다
         (:Feedback)-[:GIVEN_BY]->(:Teacher)     # (확장) 이 피드백은 이 강사가 남겼다
                                                 #   → "그 강사에게 받은 피드백" 조회를 위해 추가

[연결 정보 — 환경변수]
  NEO4J_URI       (기본: bolt://localhost:7687)
  NEO4J_USER      (기본: neo4j)
  NEO4J_PASSWORD  (기본: neo4j)   ← 실제 비밀번호는 사용자가 .env 로 넣습니다.

[단독 실행(데모)]
  $ python -m app.services.neo4j_graph
    → 예시 학생/강사/피드백을 시드하고, 한 학생의 강사·피드백을 조회해 출력합니다.
    → Neo4j 서버가 없거나 접속정보가 틀리면 크래시 대신 친절한 안내를 출력합니다.
"""

import os
from datetime import datetime, timezone


# ── 연결 정보(환경변수, 기본값은 로컬 Docker/Neo4j) ─────────────────
NEO4J_URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "neo4j")


# ══════════════════════════════════════════════════════════════════
# 예외 — 연결/드라이버 문제를 하나로 모아 라우터/데모에서 친절히 처리
# ══════════════════════════════════════════════════════════════════
class Neo4jUnavailable(Exception):
    """Neo4j 서버 미기동·접속정보 오류·라이브러리 미설치 등 '연결 불가' 상황."""


# ══════════════════════════════════════════════════════════════════
# 핵심 클래스
# ══════════════════════════════════════════════════════════════════
class MangoiGraph:
    """
    망고아이 그래프 DB 접근 객체.

    - 드라이버(연결)는 '지연 생성'합니다: 실제로 쿼리를 쓸 때 처음 연결하고,
      neo4j 라이브러리가 없거나 서버가 꺼져 있으면 Neo4jUnavailable 을 던집니다.
      (덕분에 서버 없이도 FastAPI 앱 자체는 정상 기동합니다.)
    - with 문(컨텍스트 매니저)으로도 쓸 수 있습니다.
    """

    def __init__(self, uri: str = None, user: str = None, password: str = None):
        self._uri = uri or NEO4J_URI
        self._user = user or NEO4J_USER
        self._password = password or NEO4J_PASSWORD
        self._driver = None

    # ── 드라이버 준비(지연 연결 + 친절한 에러) ─────────────────────
    def _driver_or_connect(self):
        if self._driver is not None:
            return self._driver
        # neo4j 라이브러리는 여기서만 import → 미설치 시 앱 전체가 죽지 않음
        try:
            from neo4j import GraphDatabase
        except ImportError as exc:
            raise Neo4jUnavailable(
                "neo4j 파이썬 라이브러리가 설치되어 있지 않습니다. "
                "`pip install neo4j` (또는 requirements.txt 설치) 후 다시 시도하세요."
            ) from exc
        try:
            driver = GraphDatabase.driver(self._uri, auth=(self._user, self._password))
            driver.verify_connectivity()   # 접속 즉시 확인(문제 시 예외)
        except Exception as exc:
            raise Neo4jUnavailable(
                f"Neo4j 연결 실패: 서버가 켜져 있는지, 환경변수(NEO4J_URI/USER/PASSWORD)가 "
                f"맞는지 확인하세요. (uri={self._uri}) 상세: {exc}"
            ) from exc
        self._driver = driver
        return driver

    def close(self):
        if self._driver is not None:
            try:
                self._driver.close()
            finally:
                self._driver = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        self.close()

    # ── 내부 실행 도우미 ───────────────────────────────────────────
    def _run_write(self, cypher: str, params: dict = None):
        driver = self._driver_or_connect()
        with driver.session() as session:
            return session.execute_write(lambda tx: list(tx.run(cypher, **(params or {}))))

    def _run_read(self, cypher: str, params: dict = None):
        driver = self._driver_or_connect()
        with driver.session() as session:
            return session.execute_read(lambda tx: [r.data() for r in tx.run(cypher, **(params or {}))])

    # ══════════════════════════════════════════════════════════════
    # 2) 노드/관계 생성 (요구사항 2)
    # ══════════════════════════════════════════════════════════════
    def add_student(self, student_id: str, name: str):
        """학생 노드 생성(있으면 이름만 갱신)."""
        self._run_write(
            "MERGE (s:Student {id: $id}) SET s.name = $name RETURN s",
            {"id": student_id, "name": name},
        )

    def add_teacher(self, teacher_id: str, name: str):
        """강사 노드 생성(있으면 이름만 갱신)."""
        self._run_write(
            "MERGE (t:Teacher {id: $id}) SET t.name = $name RETURN t",
            {"id": teacher_id, "name": name},
        )

    def enroll(self, student_id: str, teacher_id: str):
        """관계 생성: (:Student)-[:TAUGHT_BY]->(:Teacher). 두 노드가 없으면 만들어 연결."""
        self._run_write(
            """
            MERGE (s:Student {id: $sid})
            MERGE (t:Teacher {id: $tid})
            MERGE (s)-[:TAUGHT_BY]->(t)
            """,
            {"sid": student_id, "tid": teacher_id},
        )

    def add_feedback(self, feedback_id: str, student_id: str, teacher_id: str,
                     content: str, rating: int = None):
        """
        수업 피드백 노드 생성 + 관계 3종을 한 번에 연결.
          (:Student)-[:RECEIVED]->(:Feedback)-[:GIVEN_BY]->(:Teacher)
          (:Student)-[:TAUGHT_BY]->(:Teacher)   # 아직 없다면 함께 보장
        """
        ts = datetime.now(timezone.utc).isoformat()
        self._run_write(
            """
            MERGE (s:Student {id: $sid})
            MERGE (t:Teacher {id: $tid})
            MERGE (f:Feedback {id: $fid})
              SET f.content = $content, f.rating = $rating,
                  f.teacher_id = $tid, f.created_at = $ts
            MERGE (s)-[:RECEIVED]->(f)
            MERGE (f)-[:GIVEN_BY]->(t)
            MERGE (s)-[:TAUGHT_BY]->(t)
            """,
            {"sid": student_id, "tid": teacher_id, "fid": feedback_id,
             "content": content, "rating": rating, "ts": ts},
        )

    # ══════════════════════════════════════════════════════════════
    # 3) 조회 — 특정 학생의 강사 목록 + 그 강사에게 받은 피드백
    # ══════════════════════════════════════════════════════════════
    def get_teachers_and_feedback(self, student_id: str) -> list:
        """
        한 학생이 배운 강사들과, 각 강사에게 받은 피드백을 함께 반환.

        반환 예:
          [ { "teacher_id": "t1", "teacher_name": "Emma",
              "feedbacks": [ {"content": "발음이 좋아졌어요", "rating": 5}, ... ] }, ... ]
        """
        rows = self._run_read(
            """
            MATCH (s:Student {id: $sid})-[:TAUGHT_BY]->(t:Teacher)
            OPTIONAL MATCH (s)-[:RECEIVED]->(f:Feedback)-[:GIVEN_BY]->(t)
            WITH t, f ORDER BY f.created_at
            RETURN t.id AS teacher_id, t.name AS teacher_name,
                   collect(CASE WHEN f IS NULL THEN NULL
                                ELSE {content: f.content, rating: f.rating} END) AS feedbacks
            ORDER BY teacher_name
            """,
            {"sid": student_id},
        )
        # collect 안의 NULL(피드백 없는 강사) 제거해서 깔끔하게
        for r in rows:
            r["feedbacks"] = [fb for fb in r.get("feedbacks", []) if fb]
        return rows

    # ── 데모용: 예시 데이터 시드 ───────────────────────────────────
    def seed_demo(self):
        """예시 학생/강사/피드백을 넣는다(여러 번 실행해도 중복 없이 MERGE)."""
        self.add_student("stu_1001", "민준")
        self.add_student("stu_1002", "서연")
        self.add_teacher("tch_01", "Emma")
        self.add_teacher("tch_02", "Liam")
        # 민준: Emma·Liam 에게 배우고 각각 피드백
        self.add_feedback("fb_1", "stu_1001", "tch_01", "오늘 발음이 훨씬 자연스러워졌어요!", 5)
        self.add_feedback("fb_2", "stu_1001", "tch_01", "과거형을 잘 활용했어요. 아주 좋아요.", 5)
        self.add_feedback("fb_3", "stu_1001", "tch_02", "자신감 있게 말했어요. 어휘를 더 늘려봐요.", 4)
        # 서연: Emma 에게 배우고 피드백
        self.add_feedback("fb_4", "stu_1002", "tch_01", "질문에 또박또박 대답했어요. 훌륭해요.", 5)


# ══════════════════════════════════════════════════════════════════
# 보너스 — 추천/학습경로용 Cypher 예시 (스키마 확장 여지, 실행 스텁)
# ══════════════════════════════════════════════════════════════════
# 아래는 사용자가 설명한 3대 기능 방향을 그래프로 풀 때의 '쿼리 뼈대'입니다.
# 실제 사용하려면 스키마에 (:Concept), (:Content), 학생↔개념 숙련도 관계 등을 추가하세요.

# (a) 비슷한 성향의 학생들이 '만족'한 강사 추천
#     - 가정: (:Student)-[:RECEIVED]->(:Feedback {rating})-[:GIVEN_BY]->(:Teacher)
#     - 나와 같은 강사군을 공유하는(=성향 비슷한) 다른 학생들이 높은 평점을 준 강사를 추천
RECOMMEND_TEACHERS_CYPHER = """
MATCH (me:Student {id: $sid})-[:TAUGHT_BY]->(shared:Teacher)<-[:TAUGHT_BY]-(peer:Student)
WHERE peer <> me
MATCH (peer)-[:RECEIVED]->(f:Feedback)-[:GIVEN_BY]->(rec:Teacher)
WHERE f.rating >= 4 AND NOT (me)-[:TAUGHT_BY]->(rec)
RETURN rec.id AS teacher_id, rec.name AS teacher_name,
       avg(f.rating) AS avg_rating, count(*) AS positive_count
ORDER BY avg_rating DESC, positive_count DESC
LIMIT 5
"""

# (b) 취약 개념 → 선수학습/보충 콘텐츠 경로 (스켈레톤)
#     - 가정: (:Concept)-[:PREREQUISITE_OF]->(:Concept),
#             (:Content)-[:TEACHES]->(:Concept),
#             (:Student)-[:WEAK_AT]->(:Concept)
#     - 학생이 취약한 개념의 '선수 개념'을 가르치는 보충 콘텐츠를 경로로 추천
WEAK_CONCEPT_PATH_CYPHER = """
MATCH (s:Student {id: $sid})-[:WEAK_AT]->(weak:Concept)
OPTIONAL MATCH path = (pre:Concept)-[:PREREQUISITE_OF*1..3]->(weak)
OPTIONAL MATCH (c:Content)-[:TEACHES]->(pre)
RETURN weak.name AS weak_concept,
       collect(DISTINCT pre.name) AS prerequisites,
       collect(DISTINCT c.title) AS suggested_contents
"""


# ══════════════════════════════════════════════════════════════════
# 4) 단독 실행 데모 — 시드 + 조회까지
# ══════════════════════════════════════════════════════════════════
def _demo():
    print("🔗 Neo4j 연결 시도:", NEO4J_URI, f"(user={NEO4J_USER})")
    graph = MangoiGraph()
    try:
        graph.seed_demo()
        print("✅ 예시 데이터 시드 완료 (학생 2 · 강사 2 · 피드백 4)\n")

        target = "stu_1001"
        print(f"🔎 학생 '{target}' 이(가) 배운 강사 + 받은 피드백:")
        result = graph.get_teachers_and_feedback(target)
        for row in result:
            print(f"\n  👩‍🏫 {row['teacher_name']} (id={row['teacher_id']})")
            if row["feedbacks"]:
                for fb in row["feedbacks"]:
                    star = ("⭐" * fb["rating"]) if fb.get("rating") else ""
                    print(f"     - {fb['content']} {star}")
            else:
                print("     - (아직 피드백 없음)")
        print("\n🎉 데모 완료.")
    except Neo4jUnavailable as e:
        # 서버가 없어도 크래시 대신 친절 안내
        print("\n⚠️  Neo4j 연결 실패: 서버/환경변수를 확인하세요.")
        print("   -", e)
        print("\n   [빠른 해결] 로컬 Docker 로 띄우기:")
        print("     docker run -d --name mangoi-neo4j -p7474:7474 -p7687:7687 \\")
        print("       -e NEO4J_AUTH=neo4j/testpassword neo4j:5")
        print("   그 뒤 환경변수: NEO4J_PASSWORD=testpassword  (자세한 건 app/NEO4J.md)")
    finally:
        graph.close()


if __name__ == "__main__":
    _demo()
