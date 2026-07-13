"""
services.py
==========================================================================
핵심 비즈니스 로직 계층.
- 온톨로지(그래프 스키마) 상수 정의
- 목업 데이터 시딩 (강사 1명 + 강의 3회, 성장 스토리)
- 여러 강의를 가로질러 집계하는 Cypher 쿼리
- 기술 지표 -> 강사 친화적 이중 언어 코멘트로 변환하는 규칙 엔진

설계 노트
- 지표(Metric) 이름은 DB 내부에서는 코드값(Teacher_Talk_Ratio 등)으로 저장하지만,
  사용자에게 노출되는 텍스트에는 절대 기술 용어를 쓰지 않는다.
  (요구사항 1: 강사 친화적 언어)
- summary / strengths / action_items 는 영어와 한국어를 "동시에" 생성한다.
  (요구사항 2: 즉시 토글 가능한 이중 언어)
==========================================================================
"""

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Dict, List, Optional

from neo4j import Session, Transaction

from database import Neo4jDatabase
from schemas import (
    CategoryAverage,
    Conclusion,
    DashboardResponse,
    InstructorOverviewItem,
    InstructorsOverviewResponse,
    LabelPair,
    LanguageView,
    LectureIngestRequest,
    LineChartItem,
    RadarChartItem,
    ReportHistoryItem,
    ReportHistoryResponse,
    ReportResponse,
)

logger = logging.getLogger("mangoi.services")


# ==========================================================================
# 1) 온톨로지 지표 카탈로그
# --------------------------------------------------------------------------
# 5개 핵심 지표에 대한 메타데이터.
# - label_en/ko : 강사에게 보여줄 친화적 라벨 (기술 용어 금지)
# - direction   : "higher" = 점수가 높을수록 좋음 / "lower" = 낮을수록 좋음
# - strength_*  : 강점으로 뽑혔을 때 보여줄 칭찬 문구
# - action_*    : 개선 대상으로 뽑혔을 때 보여줄 실천 제안
# ==========================================================================
METRIC_CATALOG: Dict[str, dict] = {
    "Teacher_Talk_Ratio": {
        "label_en": "Your Speaking Time",
        "label_ko": "강사 발화 비중",
        "direction": "lower",  # 강사 발화 비중은 너무 높지 않을수록 좋음
        "strength_en": "You keep a healthy balance between talking and listening.",
        "strength_ko": "말하기와 들어주기의 균형을 아주 잘 유지하고 있습니다.",
        "action_en": "Pause for about 3 seconds after asking a question so students have room to speak.",
        "action_ko": "질문을 던진 후 약 3초간 기다려, 학생이 말할 여유를 만들어 주세요.",
        "avoid_en": "Avoid filling the entire lesson with your own explanations.",
        "avoid_ko": "수업 시간을 강사의 설명으로만 가득 채우지 마세요.",
    },
    "Student_Engagement": {
        "label_en": "Student Participation",
        "label_ko": "학생 참여도",
        "direction": "higher",
        "strength_en": "Your students actively take part in the lesson.",
        "strength_ko": "학생들이 수업에 적극적으로 참여하고 있습니다.",
        "action_en": "Gently invite quieter students by name to share their thoughts.",
        "action_ko": "말수가 적은 학생의 이름을 불러 생각을 나눌 기회를 부드럽게 만들어 주세요.",
        "avoid_en": "Don't rush the pace and move on before students can join in.",
        "avoid_ko": "진도를 서두르느라 학생이 참여하기 전에 넘어가지 마세요.",
    },
    "Praise_Count": {
        "label_en": "Encouragement & Praise",
        "label_ko": "칭찬과 격려",
        "direction": "higher",
        "strength_en": "Outstanding use of praise and warm encouragement.",
        "strength_ko": "적절한 칭찬과 따뜻한 격려 활용 능력이 우수합니다.",
        "action_en": "Add a short, specific compliment when a student makes an effort.",
        "action_ko": "학생이 노력할 때마다 짧고 구체적인 칭찬을 한마디 더 건네 보세요.",
        "avoid_en": "Don't point out only mistakes without any encouragement.",
        "avoid_ko": "격려 없이 학생의 실수만 지적하고 넘어가지 마세요.",
    },
    "Question_Quality": {
        "label_en": "Effective Questioning",
        "label_ko": "효과적인 질문 사용",
        "direction": "higher",
        "strength_en": "You ask thoughtful questions that make students think.",
        "strength_ko": "학생의 사고를 자극하는 좋은 질문을 잘 사용합니다.",
        "action_en": "Use more open-ended questions (Why / How) instead of yes-or-no ones.",
        "action_ko": "예/아니오로 끝나는 질문 대신 '왜/어떻게' 같은 열린 질문을 늘려 보세요.",
        "avoid_en": "Don't rely only on closed yes/no questions.",
        "avoid_ko": "예/아니오로만 답하는 닫힌 질문에만 의존하지 마세요.",
    },
    "Response_Delay": {
        "label_en": "Waiting Time for Student Answers",
        "label_ko": "학생 답변 대기 시간",
        "direction": "lower",  # 답변에 대한 피드백 반응이 빠를수록(지연이 낮을수록) 좋음
        "strength_en": "You respond to student answers quickly and supportively.",
        "strength_ko": "학생 답변에 대한 피드백 반응 속도가 빠르고 든든합니다.",
        "action_en": "Acknowledge each answer promptly so students feel heard.",
        "action_ko": "학생의 답변에 즉시 반응해 '잘 듣고 있다'는 느낌을 주세요.",
        "avoid_en": "Don't leave a student's answer hanging without a reaction.",
        "avoid_ko": "학생의 답변을 아무 반응 없이 오래 방치하지 마세요.",
    },
}

# 지표 표시 순서 (레이더 오각형 꼭짓점 순서 고정용)
METRIC_ORDER: List[str] = list(METRIC_CATALOG.keys())


# ==========================================================================
# 2) 목업 데이터 정의
# --------------------------------------------------------------------------
# 강사 1명이 3회의 강의를 진행하며 "성장하는" 스토리를 담는다.
#   - 1강(초기): 칭찬(Good) 우수하나 발화 비중 과다(Warning)
#   - 2강(중기): 반응 속도(Good) 좋으나, 너무 빠른 진행으로 참여도 저조(Bad)
#   - 3강(최근): 참여도(Good) + 발화 비중 균형(Good) -> 확연한 개선
# 각 Metric 은 온톨로지 스키마대로 category/score/status/feedback_en/ko 를 갖는다.
# ==========================================================================
MOCK_INSTRUCTOR = {"id": "inst_01", "name": "John Doe"}

MOCK_LECTURES: List[dict] = [
    {
        "id": "lec_01",
        "title": "Beginner English Ch.1",
        "date": "2026-06-01",
        "metrics": [
            {
                "category": "Praise_Count", "score": 88, "status": "Good",
                "feedback_en": "Wonderful! You praised students often and kept the mood positive.",
                "feedback_ko": "훌륭합니다! 학생들을 자주 칭찬하며 긍정적인 분위기를 유지했어요.",
            },
            {
                "category": "Teacher_Talk_Ratio", "score": 82, "status": "Warning",
                "feedback_en": "You spoke most of the time. Try leaving more space for students.",
                "feedback_ko": "강사님이 대부분의 시간을 이야기했어요. 학생에게 더 많은 여백을 주세요.",
            },
            {
                "category": "Student_Engagement", "score": 48, "status": "Warning",
                "feedback_en": "Participation was moderate. A few students stayed quiet.",
                "feedback_ko": "참여도는 보통이었어요. 일부 학생은 조용했습니다.",
            },
            {
                "category": "Question_Quality", "score": 55, "status": "Warning",
                "feedback_en": "Good start with questions. Add more 'why/how' prompts.",
                "feedback_ko": "질문 활용은 좋은 출발이에요. '왜/어떻게' 질문을 더 넣어보세요.",
            },
            {
                "category": "Response_Delay", "score": 58, "status": "Warning",
                "feedback_en": "Reactions were a bit slow at times. Respond a touch faster.",
                "feedback_ko": "반응이 가끔 느렸어요. 조금 더 빠르게 반응해 보세요.",
            },
        ],
    },
    {
        "id": "lec_02",
        "title": "Beginner English Ch.2",
        "date": "2026-06-15",
        "metrics": [
            {
                "category": "Response_Delay", "score": 22, "status": "Good",
                "feedback_en": "Great! You responded to answers quickly and warmly.",
                "feedback_ko": "좋아요! 학생 답변에 빠르고 따뜻하게 반응했습니다.",
            },
            {
                "category": "Student_Engagement", "score": 34, "status": "Bad",
                "feedback_en": "The pace felt fast, so students had little chance to join in.",
                "feedback_ko": "진행이 빨라 학생들이 참여할 틈이 부족했어요.",
            },
            {
                "category": "Teacher_Talk_Ratio", "score": 76, "status": "Warning",
                "feedback_en": "Still speaking quite a lot. Slow down and invite responses.",
                "feedback_ko": "여전히 발화가 많은 편이에요. 속도를 늦추고 응답을 유도해 보세요.",
            },
            {
                "category": "Praise_Count", "score": 64, "status": "Warning",
                "feedback_en": "Praise dipped a little this time. Keep encouraging effort.",
                "feedback_ko": "이번엔 칭찬이 조금 줄었어요. 노력에 대한 격려를 이어가세요.",
            },
            {
                "category": "Question_Quality", "score": 60, "status": "Warning",
                "feedback_en": "Questions are improving. Wait for answers before moving on.",
                "feedback_ko": "질문이 좋아지고 있어요. 답을 기다린 뒤 다음으로 넘어가세요.",
            },
        ],
    },
    {
        "id": "lec_03",
        "title": "Beginner English Ch.3",
        "date": "2026-06-29",
        "metrics": [
            {
                "category": "Student_Engagement", "score": 84, "status": "Good",
                "feedback_en": "Fantastic! Students participated actively throughout.",
                "feedback_ko": "환상적이에요! 학생들이 수업 내내 적극적으로 참여했습니다.",
            },
            {
                "category": "Teacher_Talk_Ratio", "score": 58, "status": "Good",
                "feedback_en": "Nicely balanced talking time. Students had room to speak.",
                "feedback_ko": "발화 시간이 잘 균형 잡혔어요. 학생들이 말할 여유가 있었습니다.",
            },
            {
                "category": "Praise_Count", "score": 82, "status": "Good",
                "feedback_en": "Warm, frequent praise kept everyone motivated.",
                "feedback_ko": "따뜻하고 잦은 칭찬이 모두에게 동기를 주었습니다.",
            },
            {
                "category": "Question_Quality", "score": 78, "status": "Good",
                "feedback_en": "Strong open-ended questions sparked real thinking.",
                "feedback_ko": "훌륭한 열린 질문이 실제 사고를 이끌어냈습니다.",
            },
            {
                "category": "Response_Delay", "score": 26, "status": "Good",
                "feedback_en": "Quick, supportive reactions made students feel heard.",
                "feedback_ko": "빠르고 든든한 반응으로 학생들이 존중받는다고 느꼈어요.",
            },
        ],
    },
]


# ==========================================================================
# 2.5) 스키마 제약조건 & 인덱스 (데이터 무결성 + 조회 성능)
# --------------------------------------------------------------------------
# - 유니크 제약: 동시 수집(ingest) 시에도 강사/강의/리포트 노드가 중복 생성되지
#   않도록 보장한다. (MERGE 만으로는 경합 상황에서 중복이 생길 수 있음)
# - 인덱스: 기간 필터(l.date 범위)와 리포트 정렬 성능을 높인다.
# 모두 `IF NOT EXISTS` 라 여러 번 실행해도 안전(멱등)하다. (Neo4j 5 문법)
# ==========================================================================
SCHEMA_STATEMENTS: List[str] = [
    "CREATE CONSTRAINT instructor_id IF NOT EXISTS "
    "FOR (i:Instructor) REQUIRE i.id IS UNIQUE",
    "CREATE CONSTRAINT lecture_id IF NOT EXISTS "
    "FOR (l:Lecture) REQUIRE l.id IS UNIQUE",
    "CREATE CONSTRAINT report_id IF NOT EXISTS "
    "FOR (r:Report) REQUIRE r.id IS UNIQUE",
    "CREATE INDEX lecture_date IF NOT EXISTS FOR (l:Lecture) ON (l.date)",
    "CREATE INDEX report_period_end IF NOT EXISTS FOR (r:Report) ON (r.period_end)",
]


def ensure_schema(database: Neo4jDatabase) -> int:
    """
    제약조건/인덱스를 보장한다. 앱 기동 시 1회 호출.
    스키마 변경(CREATE CONSTRAINT/INDEX)은 트랜잭션 함수가 아니라
    자동 커밋 쿼리로 실행해야 하므로 session.run 을 직접 사용한다.
    반환값: 실행한 구문 수.
    """
    with database.session() as session:
        for stmt in SCHEMA_STATEMENTS:
            session.run(stmt)
    logger.info("스키마 제약조건/인덱스 확인 완료 (%d개).", len(SCHEMA_STATEMENTS))
    return len(SCHEMA_STATEMENTS)


# ==========================================================================
# 3) 목업 데이터 시딩
# ==========================================================================
def _seed_tx(tx: Transaction) -> None:
    """
    쓰기 트랜잭션 내부에서 실행되는 시딩 로직.
    - 멱등성(idempotent) 보장: 실행 전 기존 목업 데이터를 지운 뒤 다시 생성한다.
    - MERGE 로 강사/강의를 만들고, 지표는 CREATE 로 붙인다.
    """
    # (1) 기존 목업 데이터 정리: 이 강사와 연결된 강의/지표/리포트를 모두 삭제 (멱등성)
    #     Report 도 함께 지워야 orphan(연결 끊긴) Report 가 쌓이지 않는다.
    tx.run(
        """
        MATCH (i:Instructor {id: $instructor_id})
        OPTIONAL MATCH (i)-[:TAUGHT]->(l:Lecture)-[:HAS_METRIC]->(m:Metric)
        OPTIONAL MATCH (i)-[:HAS_REPORT]->(rep:Report)
        DETACH DELETE i, l, m, rep
        """,
        instructor_id=MOCK_INSTRUCTOR["id"],
    )

    # (2) 강사 노드 생성
    tx.run(
        "CREATE (i:Instructor {id: $id, name: $name})",
        id=MOCK_INSTRUCTOR["id"],
        name=MOCK_INSTRUCTOR["name"],
    )

    # (3) 강의 + 지표 생성 및 관계 연결
    #     UNWIND 를 사용해 한 번의 쿼리로 강의별 지표 묶음을 효율적으로 적재한다.
    for lecture in MOCK_LECTURES:
        tx.run(
            """
            MATCH (i:Instructor {id: $instructor_id})
            CREATE (l:Lecture {id: $lec_id, title: $title, date: $date})
            CREATE (i)-[:TAUGHT]->(l)
            WITH l
            UNWIND $metrics AS metric
            CREATE (m:Metric {
                category:    metric.category,
                score:       metric.score,
                status:      metric.status,
                feedback_en: metric.feedback_en,
                feedback_ko: metric.feedback_ko
            })
            CREATE (l)-[:HAS_METRIC]->(m)
            """,
            instructor_id=MOCK_INSTRUCTOR["id"],
            lec_id=lecture["id"],
            title=lecture["title"],
            date=lecture["date"],
            metrics=lecture["metrics"],
        )


def seed_mock_data(database: Neo4jDatabase) -> dict:
    """
    목업 데이터를 DB에 적재한다. (앱 시작 시 또는 POST /seed 로 호출)
    반환값: 시딩 요약 정보.
    """
    with database.session() as session:
        # execute_write: 실패 시 자동 롤백 + 재시도 처리
        session.execute_write(_seed_tx)

    logger.info(
        "목업 데이터 시딩 완료: 강사 %s, 강의 %d회",
        MOCK_INSTRUCTOR["id"],
        len(MOCK_LECTURES),
    )
    return {
        "instructor_id": MOCK_INSTRUCTOR["id"],
        "lecture_count": len(MOCK_LECTURES),
    }


# ==========================================================================
# 4) 대시보드 집계 조회
# ==========================================================================
def _fetch_dashboard_tx(tx: Transaction, instructor_id: str) -> Optional[dict]:
    """
    특정 강사의 모든 강의/지표를 시간순으로 끌어온다.
    OPTIONAL MATCH 를 써서, 강사는 존재하지만 강의가 없어도 강사 정보는 반환한다.
    강사 자체가 없으면 결과 0행 -> None 반환 -> 상위에서 404 처리.
    """
    result = tx.run(
        """
        MATCH (i:Instructor {id: $instructor_id})
        OPTIONAL MATCH (i)-[:TAUGHT]->(l:Lecture)-[:HAS_METRIC]->(m:Metric)
        WITH i, l, m
        ORDER BY l.date ASC, m.category ASC
        RETURN
            i.id   AS instructor_id,
            i.name AS instructor_name,
            l.id   AS lecture_id,
            l.title AS lecture_title,
            l.date AS lecture_date,
            m.category AS category,
            m.score    AS score,
            m.status   AS status
        """,
        instructor_id=instructor_id,
    )
    rows = [record.data() for record in result]
    if not rows:
        return None  # 강사 없음

    instructor_name = rows[0]["instructor_name"]

    # 강의 단위로 지표를 묶는다. (날짜순 유지)
    lectures: Dict[str, dict] = {}
    for row in rows:
        lec_id = row["lecture_id"]
        if lec_id is None:
            continue  # 강사는 있으나 강의가 없는 경우
        lecture = lectures.setdefault(
            lec_id,
            {
                "lecture_id": lec_id,
                "title": row["lecture_title"],
                "date": row["lecture_date"],
                "scores": {},
            },
        )
        if row["category"] is not None:
            lecture["scores"][row["category"]] = row["score"]

    return {
        "instructor_id": instructor_id,
        "instructor_name": instructor_name,
        # dict 는 삽입 순서를 보존하므로 ORDER BY date 순서가 유지된다.
        "lectures": list(lectures.values()),
    }


def _derive_status(category: str, avg_score: int) -> str:
    """
    평균 점수로부터 지표 상태(Good/Warning/Bad)를 유도한다.
    지표의 방향(higher/lower)에 따라 임계값을 다르게 적용한다.
    """
    direction = METRIC_CATALOG[category]["direction"]
    if direction == "higher":
        # 높을수록 좋음
        if avg_score >= 70:
            return "Good"
        if avg_score >= 50:
            return "Warning"
        return "Bad"
    else:
        # 낮을수록 좋음 (발화 비중, 답변 대기 시간)
        if avg_score <= 45:
            return "Good"
        if avg_score <= 72:
            return "Warning"
        return "Bad"


def _build_language_view(
    averages: Dict[str, int],
    statuses: Dict[str, str],
    improved: bool,
    lang: str,
) -> LanguageView:
    """
    집계 결과로부터 한 언어(lang='en' 또는 'ko')의 서술형 뷰를 생성한다.
    - strengths : 상태가 Good 인 지표들 (최대 3개)
    - action_items : 개선이 필요한 지표들 (Bad 우선, 그다음 Warning; 최대 3개)
    - summary : 강점 + 개선점 + 성장 추세를 엮은 격려형 종합 코멘트
    """
    strength_key = "strength_en" if lang == "en" else "strength_ko"
    action_key = "action_en" if lang == "en" else "action_ko"
    avoid_key = "avoid_en" if lang == "en" else "avoid_ko"
    label_key = "label_en" if lang == "en" else "label_ko"

    # 강점: Good 지표 (표시 순서 유지)
    strength_cats = [c for c in METRIC_ORDER if statuses[c] == "Good"]
    strengths = [METRIC_CATALOG[c][strength_key] for c in strength_cats[:3]]

    # 개선점: Bad 를 먼저, 그다음 Warning. 각 그룹 내에서는 표시 순서 유지.
    bad_cats = [c for c in METRIC_ORDER if statuses[c] == "Bad"]
    warn_cats = [c for c in METRIC_ORDER if statuses[c] == "Warning"]
    action_cats = (bad_cats + warn_cats)[:3]
    action_items = [METRIC_CATALOG[c][action_key] for c in action_cats]

    # 하지 말 것(단점): 약한 지표(Bad 우선)에서 최대 2개
    avoid_items = [METRIC_CATALOG[c][avoid_key] for c in action_cats[:2]]

    # 종합 코멘트 구성
    top_strength_label = (
        METRIC_CATALOG[strength_cats[0]][label_key] if strength_cats else None
    )
    top_action_label = (
        METRIC_CATALOG[action_cats[0]][label_key] if action_cats else None
    )
    top_action_text = (
        METRIC_CATALOG[action_cats[0]][action_key] if action_cats else None
    )
    top_avoid_text = (
        METRIC_CATALOG[action_cats[0]][avoid_key] if action_cats else None
    )

    if lang == "en":
        parts: List[str] = []
        parts.append(
            "Excellent progress overall — your teaching is clearly getting stronger!"
            if improved
            else "Solid work overall — here is a clear picture of your teaching."
        )
        if top_strength_label:
            parts.append(f"You especially shine at \"{top_strength_label}\".")
        if top_action_label:
            parts.append(
                f"Looking across your recent lectures, focus next on "
                f"\"{top_action_label}\" to give students a little more room to grow."
            )
        summary = " ".join(parts)
    else:
        parts = []
        parts.append(
            "전반적으로 강의 역량이 눈에 띄게 발전하고 있습니다. 아주 잘하고 계세요!"
            if improved
            else "전반적으로 안정적인 강의입니다. 아래에서 강의 흐름을 한눈에 확인해 보세요."
        )
        if top_strength_label:
            parts.append(f"특히 \"{top_strength_label}\" 부분이 매우 뛰어납니다.")
        if top_action_label:
            parts.append(
                f"최근 수업들을 종합해 보면, 다음으로는 \"{top_action_label}\" 부분에 "
                f"조금만 더 신경 쓰시면 학생들이 성장할 여유가 더 생깁니다."
            )
        summary = " ".join(parts)

    # ------------------------------------------------------------------
    # 결론 · 실천 가이드 (교사가 읽고 바로 고칠 수 있도록 자세히)
    #   keep_doing(장점) / improve(보완점) / avoid(단점=하지 말 것) + closing 문단
    # ------------------------------------------------------------------
    conclusion = _build_conclusion(
        lang, strengths, action_items, avoid_items,
        top_strength_label, top_action_label, top_action_text, top_avoid_text,
    )

    return LanguageView(
        summary=summary,
        strengths=strengths,
        action_items=action_items,
        conclusion=conclusion,
    )


def _build_conclusion(
    lang, strengths, action_items, avoid_items,
    top_strength_label, top_action_label, top_action_text, top_avoid_text,
) -> Conclusion:
    """장점/보완점/하지 말 것 + 자세한 마무리 문단으로 구성된 최종 결론을 만든다."""
    if lang == "en":
        sentences: List[str] = ["In conclusion:"]
        if top_strength_label:
            sentences.append(
                f"Your clear strength is \"{top_strength_label}\" — keep leaning on it, "
                f"because it is already working well for your students."
            )
        else:
            sentences.append(
                "You have a balanced foundation across all areas — a great base to build on."
            )
        if top_action_label and top_action_text:
            sentences.append(
                f"The one area holding you back most right now is \"{top_action_label}\". "
                f"To improve it, {top_action_text[0].lower() + top_action_text[1:]}"
            )
        if top_avoid_text:
            sentences.append(
                f"Just as important, what NOT to do: {top_avoid_text[0].lower() + top_avoid_text[1:]}"
            )
        sentences.append(
            "Pick this single focus for the next two weeks; small, consistent changes "
            "show up clearly in your next report."
        )
        closing = " ".join(sentences)
    else:
        sentences = ["결론입니다."]
        if top_strength_label:
            sentences.append(
                f"선생님의 확실한 장점은 \"{top_strength_label}\" 입니다. "
                f"이미 학생들에게 잘 통하고 있으니 지금처럼 계속 유지하세요."
            )
        else:
            sentences.append(
                "모든 항목이 고르게 안정적입니다. 앞으로 더 성장할 좋은 토대예요."
            )
        if top_action_label and top_action_text:
            sentences.append(
                f"지금 가장 아쉬운(보완이 필요한) 부분은 \"{top_action_label}\" 입니다. "
                f"이를 개선하려면, {top_action_text}"
            )
        if top_avoid_text:
            sentences.append(f"반대로 하지 말아야 할 것은: {top_avoid_text}")
        sentences.append(
            "다음 2주 동안 이 한 가지에만 집중해 보세요. 작지만 꾸준한 변화가 "
            "다음 리포트에 분명하게 나타납니다."
        )
        closing = " ".join(sentences)

    return Conclusion(
        keep_doing=strengths,
        improve=action_items,
        avoid=avoid_items,
        closing=closing,
    )


def _compute_averages(lectures: List[dict]) -> Dict[str, int]:
    """강의 목록에 대해 지표별 평균 점수(정수)를 계산한다. 값이 없으면 0."""
    averages: Dict[str, int] = {}
    for category in METRIC_ORDER:
        values = [
            lec["scores"][category] for lec in lectures if category in lec["scores"]
        ]
        averages[category] = round(sum(values) / len(values)) if values else 0
    return averages


def _compute_statuses(
    averages: Dict[str, int], lectures: List[dict]
) -> Dict[str, str]:
    """
    지표별 상태를 유도하되, 기간 내 데이터가 하나도 없는 지표는 "NoData".
    ⚠ (2026-07-14 수정) 데이터 없음 → 평균 0 → lower 지표가 "Good"으로 둔갑해
      측정한 적 없는 항목을 강점으로 칭찬하던 버그 방지. NoData 는
      강점/개선점 산출(_build_language_view)에서 자동 제외된다.
    """
    measured = {c for lec in lectures for c in lec["scores"]}
    return {
        c: (_derive_status(c, averages[c]) if c in measured else "NoData")
        for c in METRIC_ORDER
    }


def _detect_improvement(lectures: List[dict]) -> bool:
    """첫 강의 대비 마지막 강의의 '학생 참여도'가 좋아졌으면 성장 중으로 판단."""
    if len(lectures) < 2:
        return False
    first = lectures[0]["scores"].get("Student_Engagement")
    last = lectures[-1]["scores"].get("Student_Engagement")
    return first is not None and last is not None and last > first


def get_instructor_dashboard(
    database: Neo4jDatabase, instructor_id: str
) -> Optional[DashboardResponse]:
    """
    강사 대시보드 데이터를 조립해서 반환한다.
    강사를 찾지 못하면 None (상위 라우터가 404 처리).
    """
    with database.session() as session:
        raw = session.execute_read(_fetch_dashboard_tx, instructor_id)

    if raw is None:
        return None

    lectures = raw["lectures"]

    # ------------------------------------------------------------------
    # (A) 레이더 차트: 지표별 전체 강의 평균
    # ------------------------------------------------------------------
    averages = _compute_averages(lectures)

    radar_chart_data = [
        RadarChartItem(
            category=category,
            label_en=METRIC_CATALOG[category]["label_en"],
            label_ko=METRIC_CATALOG[category]["label_ko"],
            average_score=averages[category],
        )
        for category in METRIC_ORDER
    ]

    # ------------------------------------------------------------------
    # (B) 라인 차트: 강의별 시간순 점수
    # ------------------------------------------------------------------
    line_chart_data = [
        LineChartItem(
            lecture_id=lec["lecture_id"],
            date=lec["date"],
            title=lec["title"],
            scores=lec["scores"],
        )
        for lec in lectures
    ]

    # ------------------------------------------------------------------
    # (C) 이중 언어 서술 뷰
    # ------------------------------------------------------------------
    statuses = _compute_statuses(averages, lectures)
    improved = _detect_improvement(lectures)

    english_view = _build_language_view(averages, statuses, improved, "en")
    korean_view = _build_language_view(averages, statuses, improved, "ko")

    return DashboardResponse(
        instructor_id=raw["instructor_id"],
        instructor_name=raw["instructor_name"],
        radar_chart_data=radar_chart_data,
        line_chart_data=line_chart_data,
        english_view=english_view,
        korean_view=korean_view,
    )


# ==========================================================================
# 5) 강의 분석 결과 수집 (Ingestion)
# --------------------------------------------------------------------------
# 외부 분석 파이프라인(녹화 -> 지표 추출)이 강의 1회분 결과를 이 함수로 보낸다.
# - 강사/강의는 MERGE(upsert)하여 재전송에도 안전(idempotent)하게 만든다.
# - 같은 강의를 다시 보내면 기존 지표를 지우고 새로 붙인다.
# ==========================================================================
def _ingest_lecture_tx(tx: Transaction, payload: dict) -> None:
    """강의 1회분(강사 + 강의 + 지표들)을 그래프에 upsert 한다."""
    tx.run(
        """
        // 강사 upsert (이름은 최신값으로 갱신)
        MERGE (i:Instructor {id: $instructor_id})
        SET i.name = $instructor_name

        // 강의 upsert: 노드를 id로 먼저 MERGE 한 뒤 관계를 MERGE
        //  (관계 패턴만 MERGE 하면 관계가 끊긴 노드가 있을 때 중복 노드가 생김)
        WITH i
        MERGE (l:Lecture {id: $lecture_id})
        SET l.title = $title, l.date = $date
        MERGE (i)-[:TAUGHT]->(l)

        // 재전송 대비: 이 강의의 기존 지표 제거 후 재생성
        WITH l
        OPTIONAL MATCH (l)-[:HAS_METRIC]->(old:Metric)
        DETACH DELETE old

        // ⚠ DISTINCT 필수: OPTIONAL MATCH 가 기존 지표 수(k)만큼 행을 늘리므로,
        //   이게 없으면 재전송마다 지표가 k×n 으로 기하급수 증식한다 (2026-07-14 수정)
        WITH DISTINCT l
        UNWIND $metrics AS metric
        CREATE (m:Metric {
            category:    metric.category,
            score:       metric.score,
            status:      metric.status,
            feedback_en: metric.feedback_en,
            feedback_ko: metric.feedback_ko
        })
        CREATE (l)-[:HAS_METRIC]->(m)
        """,
        **payload,
    )


def ingest_lecture(database: Neo4jDatabase, req: LectureIngestRequest) -> dict:
    """
    강의 분석 결과를 검증/보강하여 그래프에 적재한다.
    - status 가 비어 있으면 지표 방향에 맞춰 자동 유도한다.
    반환값: 적재 요약.
    """
    metrics_payload = []
    for m in req.metrics:
        # status 미지정 시 점수로부터 자동 계산 (분석기가 상태를 안 줘도 동작)
        status = m.status or _derive_status(m.category, m.score)
        metrics_payload.append(
            {
                "category": m.category,
                "score": m.score,
                "status": status,
                "feedback_en": m.feedback_en,
                "feedback_ko": m.feedback_ko,
            }
        )

    payload = {
        "instructor_id": req.instructor_id,
        "instructor_name": req.instructor_name,
        "lecture_id": req.lecture_id,
        "title": req.title,
        "date": req.date,
        "metrics": metrics_payload,
    }

    with database.session() as session:
        session.execute_write(_ingest_lecture_tx, payload)

    logger.info(
        "강의 수집 완료: instructor=%s lecture=%s metrics=%d",
        req.instructor_id,
        req.lecture_id,
        len(metrics_payload),
    )
    return {
        "instructor_id": req.instructor_id,
        "lecture_id": req.lecture_id,
        "metrics_ingested": len(metrics_payload),
    }


# ==========================================================================
# 6) 정기 리포트 생성 (격주 롤링 윈도우)
# --------------------------------------------------------------------------
# 온톨로지 확장:
#   (:Instructor)-[:HAS_REPORT]->(:Report)
#   :Report { id, period_start, period_end, generated_at, cadence_days,
#             window_days, lectures_count, categories[], average_scores[],
#             summary_en, summary_ko, strengths_en[], strengths_ko[],
#             actions_en[], actions_ko[] }
# - 리포트는 "기간 스냅샷"이라, 지난 기간과 비교(delta)해 성장/후퇴를 보여줄 수 있다.
# - 마이페이지는 최신 리포트를 자동으로 읽어와 표시한다.
# ==========================================================================
def _fetch_window_lectures_tx(
    tx: Transaction, instructor_id: str, start: str, end: str
) -> Optional[dict]:
    """
    지정 기간[start, end] 안의 강의/지표를 시간순으로 가져온다.
    날짜는 'YYYY-MM-DD' 문자열이라 사전식 비교로 기간 필터가 성립한다.
    강사가 없으면 None.
    """
    result = tx.run(
        """
        MATCH (i:Instructor {id: $instructor_id})
        OPTIONAL MATCH (i)-[:TAUGHT]->(l:Lecture)-[:HAS_METRIC]->(m:Metric)
        WHERE l.date >= $start AND l.date <= $end
        WITH i, l, m
        ORDER BY l.date ASC, m.category ASC
        RETURN i.id AS instructor_id, i.name AS instructor_name,
               l.id AS lecture_id, l.title AS lecture_title, l.date AS lecture_date,
               m.category AS category, m.score AS score
        """,
        instructor_id=instructor_id,
        start=start,
        end=end,
    )
    rows = [r.data() for r in result]
    if not rows:
        return None

    lectures: Dict[str, dict] = {}
    for row in rows:
        lec_id = row["lecture_id"]
        if lec_id is None:
            continue
        lec = lectures.setdefault(
            lec_id,
            {"lecture_id": lec_id, "title": row["lecture_title"],
             "date": row["lecture_date"], "scores": {}},
        )
        if row["category"] is not None:
            lec["scores"][row["category"]] = row["score"]

    return {
        "instructor_id": instructor_id,
        "instructor_name": rows[0]["instructor_name"],
        "lectures": list(lectures.values()),
    }


def _store_report_tx(tx: Transaction, report: dict) -> None:
    """계산된 리포트 스냅샷을 :Report 노드로 저장(upsert)한다."""
    tx.run(
        """
        MATCH (i:Instructor {id: $instructor_id})
        // 리포트 노드를 id로 먼저 MERGE 한 뒤 관계를 MERGE (중복 Report 방지)
        MERGE (r:Report {id: $id})
        MERGE (i)-[:HAS_REPORT]->(r)
        SET r.period_start   = $period_start,
            r.period_end     = $period_end,
            r.generated_at   = $generated_at,
            r.cadence_days   = $cadence_days,
            r.window_days    = $window_days,
            r.lectures_count = $lectures_count,
            r.categories     = $categories,
            r.average_scores = $average_scores,
            r.statuses       = $statuses,
            r.summary_en     = $summary_en,
            r.summary_ko     = $summary_ko,
            r.strengths_en   = $strengths_en,
            r.strengths_ko   = $strengths_ko,
            r.actions_en     = $actions_en,
            r.actions_ko     = $actions_ko,
            r.avoid_en       = $avoid_en,
            r.avoid_ko       = $avoid_ko,
            r.closing_en     = $closing_en,
            r.closing_ko     = $closing_ko
        """,
        **report,
    )


def generate_report_for_instructor(
    database: Neo4jDatabase,
    instructor_id: str,
    as_of: Optional[date] = None,
    cadence_days: int = 14,
    window_days: int = 28,
) -> Optional[dict]:
    """
    한 강사에 대해 '기간 리포트'를 생성/저장한다.
    - period_end = as_of(기준일), period_start = as_of - window_days
    - 해당 기간에 강의가 없으면 None (리포트 생성 안 함).
    """
    as_of = as_of or datetime.now(timezone.utc).date()
    period_end = as_of.isoformat()
    period_start = (as_of - timedelta(days=window_days)).isoformat()

    with database.session() as session:
        raw = session.execute_read(
            _fetch_window_lectures_tx, instructor_id, period_start, period_end
        )

    if raw is None or not raw["lectures"]:
        logger.info("리포트 스킵(기간 내 강의 없음): %s", instructor_id)
        return None

    lectures = raw["lectures"]
    averages = _compute_averages(lectures)
    statuses = _compute_statuses(averages, lectures)
    improved = _detect_improvement(lectures)

    en_view = _build_language_view(averages, statuses, improved, "en")
    ko_view = _build_language_view(averages, statuses, improved, "ko")

    report = {
        "instructor_id": instructor_id,
        "id": f"{instructor_id}:{period_end}",
        "period_start": period_start,
        "period_end": period_end,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "cadence_days": cadence_days,
        "window_days": window_days,
        "lectures_count": len(lectures),
        "categories": METRIC_ORDER,
        "average_scores": [averages[c] for c in METRIC_ORDER],
        # 지표별 상태 스냅샷 (NoData 포함) — 조회 시 평균 0 을 재판정해 "Good"으로
        # 둔갑시키지 않도록 생성 시점의 상태를 그대로 저장한다 (2026-07-14)
        "statuses": [statuses[c] for c in METRIC_ORDER],
        "summary_en": en_view.summary,
        "summary_ko": ko_view.summary,
        "strengths_en": en_view.strengths,
        "strengths_ko": ko_view.strengths,
        "actions_en": en_view.action_items,
        "actions_ko": ko_view.action_items,
        # 결론(하지 말 것 + 마무리 문단). keep_doing/improve 는 strengths/actions 재사용.
        "avoid_en": en_view.conclusion.avoid,
        "avoid_ko": ko_view.conclusion.avoid,
        "closing_en": en_view.conclusion.closing,
        "closing_ko": ko_view.conclusion.closing,
    }

    with database.session() as session:
        session.execute_write(_store_report_tx, report)

    logger.info(
        "리포트 생성: %s [%s ~ %s] 강의 %d회",
        instructor_id, period_start, period_end, len(lectures),
    )
    return {
        "instructor_id": instructor_id,
        "report_id": report["id"],
        "period_start": period_start,
        "period_end": period_end,
        "lectures_count": len(lectures),
    }


def _all_instructor_ids_tx(tx: Transaction) -> List[str]:
    result = tx.run("MATCH (i:Instructor) RETURN i.id AS id ORDER BY i.id")
    return [r["id"] for r in result]


def generate_periodic_reports(
    database: Neo4jDatabase,
    as_of: Optional[date] = None,
    cadence_days: int = 14,
    window_days: int = 28,
) -> dict:
    """
    모든 강사에 대해 정기 리포트를 일괄 생성한다.
    스케줄러(내부 APScheduler) 또는 외부 크론이 호출한다.
    """
    with database.session() as session:
        instructor_ids = session.execute_read(_all_instructor_ids_tx)

    generated, skipped = 0, 0
    for iid in instructor_ids:
        result = generate_report_for_instructor(
            database, iid, as_of=as_of,
            cadence_days=cadence_days, window_days=window_days,
        )
        if result:
            generated += 1
        else:
            skipped += 1

    logger.info("정기 리포트 배치 완료: 생성 %d / 스킵 %d", generated, skipped)
    return {
        "instructors": len(instructor_ids),
        "reports_generated": generated,
        "skipped_no_lectures": skipped,
    }


# ==========================================================================
# 7) 정기 리포트 조회 (마이페이지 자동 노출용)
# ==========================================================================
def _fetch_recent_reports_tx(
    tx: Transaction, instructor_id: str, limit: int
) -> Optional[dict]:
    """
    최신 리포트 최대 limit개를 기간 역순으로 가져온다.
    delta 계산을 위해 보통 limit=2 (최신 + 직전)로 호출한다.
    강사가 없으면 None.
    """
    result = tx.run(
        """
        MATCH (i:Instructor {id: $instructor_id})
        OPTIONAL MATCH (i)-[:HAS_REPORT]->(r:Report)
        WITH i, r ORDER BY r.period_end DESC
        RETURN i.name AS instructor_name, collect(r)[0..$limit] AS reports
        """,
        instructor_id=instructor_id,
        limit=limit,
    )
    record = result.single()
    if record is None:
        return None
    reports = [dict(r) for r in record["reports"] if r is not None]
    return {"instructor_name": record["instructor_name"], "reports": reports}


def _next_report_date(period_end: str, cadence_days: int) -> str:
    """다음 리포트 예정일 = 이번 기간 종료일 + 주기."""
    end = date.fromisoformat(period_end)
    return (end + timedelta(days=cadence_days)).isoformat()


def get_latest_report(
    database: Neo4jDatabase, instructor_id: str
) -> Optional[ReportResponse]:
    """
    마이페이지에 노출할 '최신 정기 리포트'를 조립한다.
    - 직전 리포트가 있으면 지표별 변화량(delta)을 함께 계산.
    - 강사가 없으면 None (404), 리포트가 아직 없으면 has_report=False.
    """
    with database.session() as session:
        raw = session.execute_read(_fetch_recent_reports_tx, instructor_id, 2)

    if raw is None:
        return None  # 강사 자체가 없음

    reports = raw["reports"]
    if not reports:
        # 강사는 있으나 아직 생성된 리포트가 없음
        return ReportResponse(
            instructor_id=instructor_id,
            instructor_name=raw["instructor_name"],
            has_report=False,
        )

    latest = reports[0]
    previous = reports[1] if len(reports) > 1 else None

    # 직전 리포트의 지표별 평균 (delta 계산용)
    prev_scores: Dict[str, int] = {}
    if previous:
        prev_scores = dict(zip(previous["categories"], previous["average_scores"]))

    cur_scores = dict(zip(latest["categories"], latest["average_scores"]))
    # 생성 시점에 저장된 상태 우선 사용 (NoData 보존). 구버전 리포트(statuses 없음)만 재판정.
    stored_statuses = dict(zip(latest["categories"], latest.get("statuses") or []))

    radar: List[CategoryAverage] = []
    for category in latest["categories"]:
        avg = cur_scores[category]
        status = stored_statuses.get(category) or _derive_status(category, avg)
        # 데이터 없던 지표는 delta 도 의미 없음 (0 기반 비교 방지)
        delta = (
            (avg - prev_scores[category])
            if category in prev_scores and status != "NoData"
            else None
        )
        radar.append(
            CategoryAverage(
                category=category,
                label_en=METRIC_CATALOG[category]["label_en"],
                label_ko=METRIC_CATALOG[category]["label_ko"],
                average_score=avg,
                delta=delta,
                status=status,
            )
        )

    return ReportResponse(
        instructor_id=instructor_id,
        instructor_name=raw["instructor_name"],
        has_report=True,
        period_start=latest["period_start"],
        period_end=latest["period_end"],
        generated_at=latest["generated_at"],
        cadence_days=latest["cadence_days"],
        window_days=latest["window_days"],
        lectures_count=latest["lectures_count"],
        next_report_estimate=_next_report_date(
            latest["period_end"], latest["cadence_days"]
        ),
        has_previous=previous is not None,
        radar_chart_data=radar,
        english_view=LanguageView(
            summary=latest["summary_en"],
            strengths=latest["strengths_en"],
            action_items=latest["actions_en"],
            conclusion=Conclusion(
                keep_doing=latest["strengths_en"],
                improve=latest["actions_en"],
                avoid=latest.get("avoid_en", []),
                closing=latest.get("closing_en", ""),
            ),
        ),
        korean_view=LanguageView(
            summary=latest["summary_ko"],
            strengths=latest["strengths_ko"],
            action_items=latest["actions_ko"],
            conclusion=Conclusion(
                keep_doing=latest["strengths_ko"],
                improve=latest["actions_ko"],
                avoid=latest.get("avoid_ko", []),
                closing=latest.get("closing_ko", ""),
            ),
        ),
    )


# ==========================================================================
# 8) 리포트 히스토리 (여러 기간에 걸친 성장 추적)
# ==========================================================================
def _fetch_report_history_tx(
    tx: Transaction, instructor_id: str, limit: int
):
    """최신순으로 최대 limit개의 리포트를 가져온다. 강사가 없으면 None."""
    result = tx.run(
        """
        MATCH (i:Instructor {id: $instructor_id})
        OPTIONAL MATCH (i)-[:HAS_REPORT]->(r:Report)
        WITH i, r ORDER BY r.period_end DESC
        RETURN i.name AS name, collect(r)[0..$limit] AS reports
        """,
        instructor_id=instructor_id,
        limit=limit,
    )
    record = result.single()
    if record is None:
        return None
    reports = [dict(r) for r in record["reports"] if r is not None]
    return {"name": record["name"], "reports": reports}


def get_report_history(
    database: Neo4jDatabase, instructor_id: str, limit: int = 12
) -> Optional[ReportHistoryResponse]:
    """
    강사의 정기 리포트 히스토리(최신순)를 반환한다.
    - 시간에 따른 지표 변화를 프론트에서 라인으로 그릴 수 있게 기간별 점수를 제공.
    - 강사가 없으면 None (404).
    """
    with database.session() as session:
        raw = session.execute_read(_fetch_report_history_tx, instructor_id, limit)

    if raw is None:
        return None

    items = [
        ReportHistoryItem(
            period_start=r["period_start"],
            period_end=r["period_end"],
            generated_at=r["generated_at"],
            lectures_count=r["lectures_count"],
            scores=dict(zip(r["categories"], r["average_scores"])),
        )
        for r in raw["reports"]
    ]
    return ReportHistoryResponse(
        instructor_id=instructor_id,
        instructor_name=raw["name"],
        count=len(items),
        reports=items,
    )


# ==========================================================================
# 9) 관리자 개요 (전체 강사 한눈에)
# ==========================================================================
def _label_pair(category: Optional[str]) -> Optional[LabelPair]:
    """지표 코드를 이중 언어 라벨 쌍으로. None이면 None."""
    if not category:
        return None
    return LabelPair(
        category=category,
        label_en=METRIC_CATALOG[category]["label_en"],
        label_ko=METRIC_CATALOG[category]["label_ko"],
    )


def _fetch_overview_tx(tx: Transaction):
    """모든 강사 + 각자의 최신 리포트 1건을 가져온다."""
    result = tx.run(
        """
        MATCH (i:Instructor)
        OPTIONAL MATCH (i)-[:HAS_REPORT]->(r:Report)
        WITH i, r ORDER BY r.period_end DESC
        WITH i, collect(r)[0] AS latest
        RETURN i.id AS id, i.name AS name, latest
        ORDER BY i.name
        """
    )
    return [record.data() for record in result]


def list_instructors_overview(
    database: Neo4jDatabase,
) -> InstructorsOverviewResponse:
    """
    관리자용 전체 강사 요약. 각 강사의 최신 리포트 기준으로
    강점 영역 / 개선 필요 영역 / Good 지표 수를 뽑아준다.
    """
    with database.session() as session:
        rows = session.execute_read(_fetch_overview_tx)

    items = []
    for row in rows:
        latest = row.get("latest")
        if not latest:
            items.append(
                InstructorOverviewItem(
                    instructor_id=row["id"],
                    instructor_name=row["name"],
                    has_report=False,
                )
            )
            continue

        averages = dict(zip(latest["categories"], latest["average_scores"]))
        # 저장된 상태 우선 (NoData 보존 + 카탈로그에 없는 category KeyError 방지)
        stored = dict(zip(latest["categories"], latest.get("statuses") or []))
        statuses = {
            c: stored.get(c) or _derive_status(c, averages.get(c, 0))
            for c in METRIC_ORDER
        }
        strength_cats = [c for c in METRIC_ORDER if statuses[c] == "Good"]
        bad = [c for c in METRIC_ORDER if statuses[c] == "Bad"]
        warn = [c for c in METRIC_ORDER if statuses[c] == "Warning"]
        action_cats = bad + warn

        items.append(
            InstructorOverviewItem(
                instructor_id=row["id"],
                instructor_name=row["name"],
                has_report=True,
                last_period_end=latest["period_end"],
                good_count=len(strength_cats),
                top_strength=_label_pair(strength_cats[0] if strength_cats else None),
                focus_area=_label_pair(action_cats[0] if action_cats else None),
            )
        )

    return InstructorsOverviewResponse(count=len(items), instructors=items)
