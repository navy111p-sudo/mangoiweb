"""
api_sample.py — 실제 FastAPI 라우트 + 실 Aura DB 풀스택 샘플.
TestClient 로 앱 lifespan(=Aura 접속+시딩)을 띄운 뒤, 실제 HTTP 엔드포인트를 호출해
반환 JSON을 그대로 출력한다. (라우팅 + Pydantic 직렬화 + 실 DB 왕복 전부 실검증)
"""
import json
import os
from datetime import date

# 앱 기동 시 Aura에 목업 시딩
os.environ["SEED_ON_STARTUP"] = "true"

from fastapi.testclient import TestClient
import main
import services
from database import db


def dump(title, obj):
    print("\n" + "=" * 74 + f"\n{title}\n" + "=" * 74)
    print(json.dumps(obj, ensure_ascii=False, indent=2))


with TestClient(main.app) as c:
    # 1) 강의 수집 (실제 POST /api/v1/lectures -> Aura 기록)
    ing = c.post("/api/v1/lectures", json={
        "instructor_id": "inst_01", "instructor_name": "John Doe",
        "lecture_id": "lec_04", "title": "Beginner English Ch.4", "date": "2026-07-13",
        "metrics": [
            {"category": "Student_Engagement", "score": 88, "feedback_en": "Even more!", "feedback_ko": "참여 더 상승!"},
            {"category": "Teacher_Talk_Ratio", "score": 55, "feedback_en": "Balanced.", "feedback_ko": "균형 좋음."},
            {"category": "Praise_Count", "score": 84, "feedback_en": "Great praise.", "feedback_ko": "칭찬 훌륭."},
            {"category": "Question_Quality", "score": 80, "feedback_en": "Strong Qs.", "feedback_ko": "질문 좋음."},
            {"category": "Response_Delay", "score": 24, "feedback_en": "Quick.", "feedback_ko": "반응 빠름."},
        ],
    })
    print("[POST /lectures]", ing.status_code, ing.json())

    # 2) 격주 리포트 2회 생성 (지난/이번 기간 -> delta) : 실 Aura에 Report 노드 기록
    services.generate_report_for_instructor(db, "inst_01", as_of=date(2026, 6, 29), cadence_days=14, window_days=28)
    services.generate_report_for_instructor(db, "inst_01", as_of=date(2026, 7, 13), cadence_days=14, window_days=28)
    print("[reports generated] 2 periods")

    # 3) 대시보드 (실제 GET) — 레이더 평균만 요약
    dash = c.get("/api/v1/instructors/inst_01/dashboard").json()
    radar = {i["label_ko"]: i["average_score"] for i in dash["radar_chart_data"]}
    dump("GET /api/v1/instructors/inst_01/dashboard  · 레이더 평균(전체)", radar)

    # 4) 최신 정기 리포트 (실제 GET) — 전체 JSON 그대로 (delta + 결론 포함)
    rep = c.get("/api/v1/instructors/inst_01/report").json()
    dump("GET /api/v1/instructors/inst_01/report  · 실제 API 응답 JSON", rep)
