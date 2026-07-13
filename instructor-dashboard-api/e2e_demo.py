"""
e2e_demo.py — 실제 Neo4j 대상 전체 흐름 데모.
seed -> ingest(새 강의) -> 정기 리포트 2회 생성(격주) -> dashboard/report 조회 후 출력.
접속 정보는 .env(NEO4J_URI/USERNAME/PASSWORD)에서 읽는다. (로컬/Aura 공용)
"""
import json
import os
from datetime import date

from database import db
from schemas import LectureIngestRequest, MetricIn
import services


def show(title, obj):
    print("\n" + "=" * 70)
    print(title)
    print("=" * 70)
    print(json.dumps(obj, ensure_ascii=False, indent=2))


def main():
    uri = os.getenv("NEO4J_URI", "(unset)")
    print("접속 대상 Neo4j:", uri)  # 비밀번호는 출력하지 않음
    db.connect()
    try:
        # 1) 시딩 (강사 1명 + 강의 3회: 2026-06-01/15/29)
        seed = services.seed_mock_data(db)
        print("[1] seed:", seed)

        # 2) 새 강의 1회 수집 (2026-07-13, 개선된 최근 수업)
        req = LectureIngestRequest(
            instructor_id="inst_01", instructor_name="John Doe",
            lecture_id="lec_04", title="Beginner English Ch.4", date="2026-07-13",
            metrics=[
                MetricIn(category="Student_Engagement", score=88,
                         feedback_en="Even more participation!", feedback_ko="참여도가 더 올랐어요!"),
                MetricIn(category="Teacher_Talk_Ratio", score=55,
                         feedback_en="Well balanced.", feedback_ko="균형이 좋습니다."),
                MetricIn(category="Praise_Count", score=84,
                         feedback_en="Great praise.", feedback_ko="칭찬이 훌륭해요."),
                MetricIn(category="Question_Quality", score=80,
                         feedback_en="Strong questions.", feedback_ko="질문이 좋아요."),
                MetricIn(category="Response_Delay", score=24,
                         feedback_en="Quick reactions.", feedback_ko="반응이 빠릅니다."),
            ],
        )
        print("[2] ingest:", services.ingest_lecture(db, req))

        # 3) 정기 리포트 2회 생성 (격주): 지난 기간 + 이번 기간 -> delta 확보
        r1 = services.generate_report_for_instructor(
            db, "inst_01", as_of=date(2026, 6, 29), cadence_days=14, window_days=28)
        r2 = services.generate_report_for_instructor(
            db, "inst_01", as_of=date(2026, 7, 13), cadence_days=14, window_days=28)
        print("[3] report#1:", r1)
        print("    report#2:", r2)

        # 4) 대시보드(전체 집계) — 레이더 평균만 요약 출력
        dash = services.get_instructor_dashboard(db, "inst_01")
        radar = {i.category: i.average_score for i in dash.radar_chart_data}
        show("[4] DASHBOARD radar averages (전체 강의)", radar)

        # 5) 최신 정기 리포트 + 지난 기간 대비 변화 + 결론
        rep = services.get_latest_report(db, "inst_01").model_dump()
        summary = {
            "period": f"{rep['period_start']} ~ {rep['period_end']}",
            "next_report_estimate": rep["next_report_estimate"],
            "lectures_count": rep["lectures_count"],
            "has_previous": rep["has_previous"],
            "delta(지난 기간 대비)": {c["category"]: c["delta"] for c in rep["radar_chart_data"]},
            "결론_KO": rep["korean_view"]["conclusion"],
        }
        show("[5] LATEST REPORT (마이페이지 노출 + 결론)", summary)
    finally:
        db.close()


if __name__ == "__main__":
    main()
