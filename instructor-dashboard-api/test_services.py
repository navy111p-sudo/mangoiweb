"""
test_services.py
==========================================================================
services.py 핵심 로직에 대한 단위 테스트.
실제 Neo4j 없이, DB 세션을 목(mock)으로 대체하여 순수 집계/서술 로직을 검증한다.

실행:
    cd instructor-dashboard-api
    pip install pytest
    python -m pytest -v
==========================================================================
"""

from datetime import date
from unittest.mock import MagicMock

import pytest
from pydantic import ValidationError

import services
from schemas import LectureIngestRequest, MetricIn
from services import MOCK_INSTRUCTOR, MOCK_LECTURES, _derive_status


def _raw_from_mock() -> dict:
    """_fetch_dashboard_tx 가 돌려주는 구조를 목업 데이터로부터 재현."""
    return {
        "instructor_id": MOCK_INSTRUCTOR["id"],
        "instructor_name": MOCK_INSTRUCTOR["name"],
        "lectures": [
            {
                "lecture_id": lec["id"],
                "title": lec["title"],
                "date": lec["date"],
                "scores": {m["category"]: m["score"] for m in lec["metrics"]},
            }
            for lec in MOCK_LECTURES
        ],
    }


def _fake_db(read_return):
    """execute_read 가 read_return 을 돌려주는 가짜 database 객체."""
    fake_db, _ = _fake_db_session(read_return)
    return fake_db


def _fake_db_session(read_return):
    """검증용으로 session 목까지 함께 돌려주는 버전."""
    fake_db = MagicMock()
    session = MagicMock()
    session.execute_read.return_value = read_return
    fake_db.session.return_value.__enter__.return_value = session
    return fake_db, session


# --------------------------------------------------------------------------
# 레이더 차트: 전체 강의 평균이 올바른가
# --------------------------------------------------------------------------
def test_radar_average_matches_spec():
    dash = services.get_instructor_dashboard(_fake_db(_raw_from_mock()), "inst_01")
    radar = {item.category: item.average_score for item in dash.radar_chart_data}

    # (82 + 76 + 58) / 3 = 72  → 스펙 예시와 일치
    assert radar["Teacher_Talk_Ratio"] == 72
    assert radar["Praise_Count"] == 78          # (88+64+82)/3
    assert radar["Student_Engagement"] == 55    # (48+34+84)/3
    assert radar["Response_Delay"] == 35        # (58+22+26)/3


def test_radar_has_all_five_metrics_with_friendly_labels():
    dash = services.get_instructor_dashboard(_fake_db(_raw_from_mock()), "inst_01")
    assert len(dash.radar_chart_data) == 5
    # 사용자 노출 라벨에는 기술 코드가 아니라 친화적 문구가 들어가야 한다
    ttr = next(i for i in dash.radar_chart_data if i.category == "Teacher_Talk_Ratio")
    assert ttr.label_en == "Your Speaking Time"
    assert ttr.label_ko == "강사 발화 비중"


# --------------------------------------------------------------------------
# 라인 차트: 강의 3회가 시간순으로 나오는가
# --------------------------------------------------------------------------
def test_line_chart_is_chronological():
    dash = services.get_instructor_dashboard(_fake_db(_raw_from_mock()), "inst_01")
    dates = [pt.date for pt in dash.line_chart_data]
    assert dates == ["2026-06-01", "2026-06-15", "2026-06-29"]
    assert len(dash.line_chart_data) == 3
    assert dash.line_chart_data[0].scores["Teacher_Talk_Ratio"] == 82


# --------------------------------------------------------------------------
# 이중 언어: 두 언어 뷰가 모두 채워지는가
# --------------------------------------------------------------------------
def test_bilingual_views_are_populated():
    dash = services.get_instructor_dashboard(_fake_db(_raw_from_mock()), "inst_01")
    assert dash.english_view.summary
    assert dash.korean_view.summary
    assert dash.english_view.summary != dash.korean_view.summary
    assert len(dash.english_view.strengths) == len(dash.korean_view.strengths)
    assert len(dash.english_view.action_items) == len(dash.korean_view.action_items)


def test_conclusion_has_keep_improve_avoid_and_closing():
    dash = services.get_instructor_dashboard(_fake_db(_raw_from_mock()), "inst_01")
    for view in (dash.english_view, dash.korean_view):
        c = view.conclusion
        assert c is not None
        assert c.keep_doing == view.strengths       # 장점 = 강점
        assert c.improve == view.action_items        # 보완점 = 개선 항목
        assert len(c.avoid) >= 1                      # 하지 말 것(단점) 존재
        assert len(c.closing) > 40                    # 자세한 마무리 문단

    # 언어별 내용이 실제로 달라야 한다(이중 언어)
    assert dash.english_view.conclusion.closing != dash.korean_view.conclusion.closing
    # 하지 말 것에는 '발화 비중 과다' 회피 문구가 포함돼야 한다
    assert "설명으로만" in " ".join(dash.korean_view.conclusion.avoid)


def test_strengths_and_actions_reflect_data():
    dash = services.get_instructor_dashboard(_fake_db(_raw_from_mock()), "inst_01")
    # 칭찬(78)·반응속도(35=낮을수록좋음)는 강점으로 잡혀야 한다
    en_strengths = " ".join(dash.english_view.strengths).lower()
    assert "praise" in en_strengths
    # 발화 비중(72=Warning)은 개선 항목으로 잡혀야 한다
    en_actions = " ".join(dash.english_view.action_items).lower()
    assert "question" in en_actions or "3 seconds" in en_actions


# --------------------------------------------------------------------------
# 404 경로: 강사가 없으면 None
# --------------------------------------------------------------------------
def test_missing_instructor_returns_none():
    assert services.get_instructor_dashboard(_fake_db(None), "nobody") is None


# --------------------------------------------------------------------------
# 상태 유도: 지표 방향(higher/lower)에 따라 임계값이 올바른가
# --------------------------------------------------------------------------
def test_derive_status_higher_is_better():
    assert _derive_status("Praise_Count", 78) == "Good"
    assert _derive_status("Praise_Count", 55) == "Warning"
    assert _derive_status("Student_Engagement", 40) == "Bad"


def test_derive_status_lower_is_better():
    # 발화 비중/대기 시간은 낮을수록 좋음
    assert _derive_status("Response_Delay", 35) == "Good"
    assert _derive_status("Teacher_Talk_Ratio", 72) == "Warning"
    assert _derive_status("Teacher_Talk_Ratio", 90) == "Bad"


# ==========================================================================
# 강의 수집(Ingestion)
# ==========================================================================
def _sample_ingest() -> LectureIngestRequest:
    return LectureIngestRequest(
        instructor_id="inst_99",
        instructor_name="Jane Kim",
        lecture_id="lec_99",
        title="Intermediate English Ch.1",
        date="2026-07-01",
        metrics=[
            MetricIn(category="Praise_Count", score=88,
                     feedback_en="Great praise.", feedback_ko="칭찬이 훌륭해요."),
            MetricIn(category="Teacher_Talk_Ratio", score=82,
                     feedback_en="Talked a lot.", feedback_ko="발화가 많았어요."),
        ],
    )


def test_ingest_auto_derives_missing_status():
    fake_db, session = _fake_db_session(None)
    result = services.ingest_lecture(fake_db, _sample_ingest())

    assert result["metrics_ingested"] == 2
    # execute_write(_ingest_lecture_tx, payload) 의 payload 를 검사
    payload = session.execute_write.call_args.args[1]
    by_cat = {m["category"]: m for m in payload["metrics"]}
    # status 를 안 줬으므로 점수로부터 자동 유도돼야 한다
    assert by_cat["Praise_Count"]["status"] == "Good"     # 88, 높을수록 좋음
    assert by_cat["Teacher_Talk_Ratio"]["status"] == "Bad"  # 82 > 72 임계값(낮을수록 좋음)


def test_ingest_rejects_duplicate_categories():
    with pytest.raises(ValidationError):
        LectureIngestRequest(
            instructor_id="i", instructor_name="n", lecture_id="l",
            title="t", date="2026-07-01",
            metrics=[
                MetricIn(category="Praise_Count", score=80, feedback_en="a", feedback_ko="가"),
                MetricIn(category="Praise_Count", score=70, feedback_en="b", feedback_ko="나"),
            ],
        )


def test_ingest_rejects_bad_date_and_category():
    with pytest.raises(ValidationError):
        LectureIngestRequest(
            instructor_id="i", instructor_name="n", lecture_id="l",
            title="t", date="2026/07/01",  # 잘못된 형식
            metrics=[MetricIn(category="Praise_Count", score=80,
                              feedback_en="a", feedback_ko="가")],
        )
    with pytest.raises(ValidationError):
        MetricIn(category="Not_A_Metric", score=80, feedback_en="a", feedback_ko="가")


# ==========================================================================
# 정기 리포트 생성 + delta 비교
# ==========================================================================
def _window_raw(lectures) -> dict:
    return {
        "instructor_id": "inst_01",
        "instructor_name": "John Doe",
        "lectures": lectures,
    }


def test_generate_report_builds_and_stores_snapshot():
    lectures = [
        {"lecture_id": lec["id"], "title": lec["title"], "date": lec["date"],
         "scores": {m["category"]: m["score"] for m in lec["metrics"]}}
        for lec in MOCK_LECTURES
    ]
    fake_db, session = _fake_db_session(_window_raw(lectures))

    result = services.generate_report_for_instructor(
        fake_db, "inst_01", as_of=date(2026, 6, 29),
        cadence_days=14, window_days=28,
    )
    assert result["lectures_count"] == 3

    stored = session.execute_write.call_args.args[1]
    scores = dict(zip(stored["categories"], stored["average_scores"]))
    assert scores["Teacher_Talk_Ratio"] == 72   # 저장 스냅샷도 동일 평균
    assert stored["period_end"] == "2026-06-29"
    assert stored["period_start"] == "2026-06-01"  # 29 - 28일
    assert stored["summary_en"] and stored["summary_ko"]


def test_generate_report_skips_when_no_lectures():
    assert services.generate_report_for_instructor(
        _fake_db(_window_raw([])), "inst_01", as_of=date(2026, 6, 29)
    ) is None


def test_latest_report_computes_delta_vs_previous():
    cats = services.METRIC_ORDER
    latest = {
        "categories": cats, "average_scores": [58, 84, 82, 78, 26],
        "period_start": "2026-06-15", "period_end": "2026-06-29",
        "generated_at": "2026-06-29T00:00:00+00:00",
        "cadence_days": 14, "window_days": 28, "lectures_count": 2,
        "summary_en": "s", "summary_ko": "요약",
        "strengths_en": ["a"], "strengths_ko": ["가"],
        "actions_en": ["b"], "actions_ko": ["나"],
    }
    previous = {**latest, "average_scores": [82, 48, 88, 55, 58],
                "period_end": "2026-06-15"}

    raw = {"instructor_name": "John Doe", "reports": [latest, previous]}
    report = services.get_latest_report(_fake_db(raw), "inst_01")

    assert report.has_report and report.has_previous
    deltas = {c.category: c.delta for c in report.radar_chart_data}
    assert deltas["Teacher_Talk_Ratio"] == 58 - 82   # -24 (발화 비중 감소=개선)
    assert deltas["Student_Engagement"] == 84 - 48    # +36 (참여도 상승)
    # 다음 리포트 예정일 = 기간 종료일 + 주기
    assert report.next_report_estimate == "2026-07-13"


def test_latest_report_no_previous_has_null_delta():
    cats = services.METRIC_ORDER
    only = {
        "categories": cats, "average_scores": [72, 55, 78, 64, 35],
        "period_start": "2026-06-01", "period_end": "2026-06-29",
        "generated_at": "2026-06-29T00:00:00+00:00",
        "cadence_days": 14, "window_days": 28, "lectures_count": 3,
        "summary_en": "s", "summary_ko": "요약",
        "strengths_en": [], "strengths_ko": [],
        "actions_en": [], "actions_ko": [],
    }
    raw = {"instructor_name": "John Doe", "reports": [only]}
    report = services.get_latest_report(_fake_db(raw), "inst_01")
    assert report.has_report and not report.has_previous
    assert all(c.delta is None for c in report.radar_chart_data)


def test_latest_report_instructor_without_reports():
    raw = {"instructor_name": "New Teacher", "reports": []}
    report = services.get_latest_report(_fake_db(raw), "inst_new")
    assert report.has_report is False


def test_latest_report_missing_instructor_returns_none():
    assert services.get_latest_report(_fake_db(None), "nobody") is None


# ==========================================================================
# 스키마 제약조건 / 인덱스
# ==========================================================================
def test_ensure_schema_runs_all_statements():
    fake_db, session = _fake_db_session(None)
    n = services.ensure_schema(fake_db)
    assert n == len(services.SCHEMA_STATEMENTS)
    # 모든 스키마 구문이 session.run 으로 실행됐는지 확인
    assert session.run.call_count == len(services.SCHEMA_STATEMENTS)
    ran = " ".join(call.args[0] for call in session.run.call_args_list)
    assert "Instructor" in ran and "IS UNIQUE" in ran
    assert "Lecture" in ran and "Report" in ran


def test_schema_statements_are_idempotent():
    # 반복 실행 안전을 위해 모든 구문은 IF NOT EXISTS 를 포함해야 한다
    for stmt in services.SCHEMA_STATEMENTS:
        assert "IF NOT EXISTS" in stmt


# ==========================================================================
# 중복 노드 방지 회귀 테스트 (node-first MERGE + seed 가 Report 정리)
# ==========================================================================
def test_store_report_merges_node_before_relationship():
    tx = MagicMock()
    services._store_report_tx(tx, {})
    q = tx.run.call_args.args[0]
    # 관계 패턴이 아니라 노드를 id로 먼저 MERGE 해야 중복 Report 가 안 생긴다
    assert "MERGE (r:Report {id: $id})" in q
    assert "MERGE (i)-[:HAS_REPORT]->(r)" in q


def test_ingest_merges_lecture_node_before_relationship():
    tx = MagicMock()
    services._ingest_lecture_tx(tx, {})
    q = tx.run.call_args.args[0]
    assert "MERGE (l:Lecture {id: $lecture_id})" in q
    assert "MERGE (i)-[:TAUGHT]->(l)" in q


def test_seed_cleanup_also_deletes_reports():
    tx = MagicMock()
    services._seed_tx(tx)
    cleanup_q = tx.run.call_args_list[0].args[0]  # 첫 실행 = 정리 쿼리
    # orphan Report 가 쌓이지 않도록 정리 단계에서 Report 도 삭제해야 한다
    assert "HAS_REPORT" in cleanup_q and "rep" in cleanup_q


# ==========================================================================
# 리포트 히스토리
# ==========================================================================
def _stored_report(period_end, scores):
    cats = services.METRIC_ORDER
    return {
        "categories": cats,
        "average_scores": [scores[c] for c in cats],
        "period_start": "2026-06-01", "period_end": period_end,
        "generated_at": "2026-06-29T00:00:00+00:00",
        "cadence_days": 14, "window_days": 28, "lectures_count": 3,
    }


def test_report_history_returns_items_newest_first():
    r_new = _stored_report("2026-07-13", {"Teacher_Talk_Ratio": 63, "Student_Engagement": 69,
        "Praise_Count": 77, "Question_Quality": 73, "Response_Delay": 24})
    r_old = _stored_report("2026-06-29", {"Teacher_Talk_Ratio": 72, "Student_Engagement": 55,
        "Praise_Count": 78, "Question_Quality": 64, "Response_Delay": 35})
    raw = {"name": "John Doe", "reports": [r_new, r_old]}
    hist = services.get_report_history(_fake_db(raw), "inst_01")
    assert hist.count == 2
    assert hist.reports[0].period_end == "2026-07-13"
    assert hist.reports[0].scores["Student_Engagement"] == 69


def test_report_history_missing_instructor_returns_none():
    assert services.get_report_history(_fake_db(None), "nobody") is None


# ==========================================================================
# 관리자 개요
# ==========================================================================
def test_overview_flags_strength_and_focus():
    latest = _stored_report("2026-07-13", {"Teacher_Talk_Ratio": 72, "Student_Engagement": 55,
        "Praise_Count": 78, "Question_Quality": 64, "Response_Delay": 35})
    rows = [
        {"id": "inst_01", "name": "John Doe", "latest": latest},
        {"id": "inst_02", "name": "New Teacher", "latest": None},
    ]
    ov = services.list_instructors_overview(_fake_db(rows))
    assert ov.count == 2
    john = next(i for i in ov.instructors if i.instructor_id == "inst_01")
    assert john.has_report and john.good_count >= 1
    assert john.top_strength.category == "Praise_Count"     # 78 -> Good
    assert john.focus_area.category == "Teacher_Talk_Ratio"  # 72 -> Warning(개선 필요)
    newbie = next(i for i in ov.instructors if i.instructor_id == "inst_02")
    assert newbie.has_report is False and newbie.top_strength is None
