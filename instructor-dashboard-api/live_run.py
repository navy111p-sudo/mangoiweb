"""
live_run.py — 실제 Aura Neo4j 대상 전체 흐름 라이브 검증.
접속 정보는 .env(NEO4J_URI/PASSWORD). 사용자명은 후보(neo4j / dbid)를 순차 시도.
새 인스턴스 프로비저닝 지연을 고려해 짧게 재시도한다.
"""
import os
import time
from datetime import date

from dotenv import load_dotenv
load_dotenv()

from database import Neo4jDatabase
import services
from schemas import LectureIngestRequest, MetricIn

URI = os.getenv("NEO4J_URI")
PW = os.getenv("NEO4J_PASSWORD")
# dbid = URI 서브도메인 (예: a9052a07)
dbid = URI.split("//", 1)[-1].split(".", 1)[0] if URI else ""
CANDIDATE_USERS = list(dict.fromkeys([os.getenv("NEO4J_USERNAME", "neo4j"), "neo4j", dbid]))


def connect_with_retry():
    """프로비저닝 지연/사용자명 후보를 고려해 접속을 확보한다."""
    last = None
    for attempt in range(6):  # 최대 ~36초
        for user in CANDIDATE_USERS:
            os.environ["NEO4J_USERNAME"] = user
            dbx = Neo4jDatabase()
            try:
                dbx.connect()
                print(f"✅ 접속 성공 (user='{user}', try={attempt+1})")
                return dbx
            except Exception as e:
                last = e
                try:
                    dbx.close()
                except Exception:
                    pass
        print(f"   대기 중… 인스턴스 준비 확인 (try={attempt+1}) : {type(last).__name__}")
        time.sleep(6)
    raise SystemExit(f"❌ 접속 실패: {last}")


def show(title):
    print("\n" + "=" * 72 + f"\n{title}\n" + "=" * 72)


def main():
    print("접속 대상:", URI, "| 후보 사용자:", CANDIDATE_USERS)
    db = connect_with_retry()
    try:
        # 1) seed (강사1 + 강의3: 06-01/15/29)
        print("[1] seed:", services.seed_mock_data(db))

        # 2) ingest lec_04 (2026-07-13, 개선된 최근 수업)
        req = LectureIngestRequest(
            instructor_id="inst_01", instructor_name="John Doe",
            lecture_id="lec_04", title="Beginner English Ch.4", date="2026-07-13",
            metrics=[
                MetricIn(category="Student_Engagement", score=88, feedback_en="Even more!", feedback_ko="참여 더 상승!"),
                MetricIn(category="Teacher_Talk_Ratio", score=55, feedback_en="Balanced.", feedback_ko="균형 좋음."),
                MetricIn(category="Praise_Count", score=84, feedback_en="Great praise.", feedback_ko="칭찬 훌륭."),
                MetricIn(category="Question_Quality", score=80, feedback_en="Strong Qs.", feedback_ko="질문 좋음."),
                MetricIn(category="Response_Delay", score=24, feedback_en="Quick.", feedback_ko="반응 빠름."),
            ],
        )
        print("[2] ingest:", services.ingest_lecture(db, req))

        # 3) 격주 리포트 2회 생성 (지난 기간 + 이번 기간 → delta)
        print("[3] report#1:", services.generate_report_for_instructor(
            db, "inst_01", as_of=date(2026, 6, 29), cadence_days=14, window_days=28))
        print("    report#2:", services.generate_report_for_instructor(
            db, "inst_01", as_of=date(2026, 7, 13), cadence_days=14, window_days=28))

        # 4) 대시보드 (전체 집계)
        dash = services.get_instructor_dashboard(db, "inst_01")
        show("[4] DASHBOARD · 레이더 평균 (전체 강의, LIVE Aura)")
        for i in dash.radar_chart_data:
            print(f"  - {i.label_ko:<22} {i.average_score:>3}점")

        # 5) 최신 정기 리포트 + delta + 결론 (마이페이지 노출)
        rep = services.get_latest_report(db, "inst_01").model_dump()
        show("[5] 최신 정기 리포트 (LIVE Aura) — 기간/변화/결론")
        print(f"기간: {rep['period_start']} ~ {rep['period_end']} | 다음: {rep['next_report_estimate']} | 강의 {rep['lectures_count']}회")
        print("[지표 · 지난 기간 대비 변화]")
        for c in rep["radar_chart_data"]:
            d = c["delta"]; arr = ("▲+%d" % d if d and d > 0 else ("▼%d" % d if d else "—"))
            print(f"  - {c['label_ko']:<22} {c['average_score']:>3}점 (변화 {arr}, {c['status']})")
        cc = rep["korean_view"]["conclusion"]
        print("\n📋 결론 · 실천 가이드 (KO)")
        print(" ✅ 계속 유지(장점):", *["\n    · " + x for x in cc["keep_doing"]])
        print(" 🔧 더 잘할 것(보완점):", *["\n    · " + x for x in cc["improve"]])
        print(" ⛔ 하지 말 것(단점):", *["\n    · " + x for x in cc["avoid"]])
        print("\n 📝", cc["closing"])
    finally:
        db.close()


if __name__ == "__main__":
    main()
