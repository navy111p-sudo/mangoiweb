# -*- coding: utf-8 -*-
"""
graph.py — Neo4j 그래프(학생·강사·피드백) API 라우터

[제공 API]  (prefix: /api/graph)
  * POST /api/graph/student                         : 학생 노드 추가
  * POST /api/graph/teacher                         : 강사 노드 추가
  * POST /api/graph/enroll                          : 학생-강사 관계(TAUGHT_BY) 연결
  * POST /api/graph/feedback                        : 수업 피드백 추가(+관계 연결)
  * GET  /api/graph/student/{student_id}/teachers-feedback : 학생의 강사+피드백 조회
  * POST /api/graph/seed-demo                       : 예시 데이터 시드(개발용)

[에러 처리]
  - 입력 검증은 Pydantic 이 담당(빈 값/타입 오류 → 422).
  - Neo4j 서버가 없거나 접속정보가 틀리면 크래시 대신 503 + 친절 안내.
  - 스트릭/웜업 라우터와 동일한 스타일(HTTPException).
"""

from fastapi import APIRouter, HTTPException, Path
from pydantic import BaseModel, Field

from app.services.neo4j_graph import MangoiGraph, Neo4jUnavailable

router = APIRouter(prefix="/api/graph", tags=["graph(그래프 DB: 학생·강사·피드백)"])

# 앱 전체에서 공유하는 그래프 접근 객체(드라이버는 첫 사용 시 지연 연결)
_graph = MangoiGraph()


# ══════════════════════════════════════════════════════════════════
# Pydantic 입력 모델
# ══════════════════════════════════════════════════════════════════
class StudentIn(BaseModel):
    student_id: str = Field(..., min_length=1, max_length=100, examples=["stu_1001"])
    name: str = Field(..., min_length=1, max_length=100, examples=["민준"])


class TeacherIn(BaseModel):
    teacher_id: str = Field(..., min_length=1, max_length=100, examples=["tch_01"])
    name: str = Field(..., min_length=1, max_length=100, examples=["Emma"])


class EnrollIn(BaseModel):
    student_id: str = Field(..., min_length=1, max_length=100)
    teacher_id: str = Field(..., min_length=1, max_length=100)


class FeedbackIn(BaseModel):
    feedback_id: str = Field(..., min_length=1, max_length=100, examples=["fb_1"])
    student_id: str = Field(..., min_length=1, max_length=100)
    teacher_id: str = Field(..., min_length=1, max_length=100)
    content: str = Field(..., min_length=1, max_length=1000, examples=["발음이 좋아졌어요!"])
    rating: int | None = Field(default=None, ge=1, le=5, description="1~5 별점(선택)")


# ══════════════════════════════════════════════════════════════════
# 공통 — Neo4j 연결 오류를 503 으로 변환
# ══════════════════════════════════════════════════════════════════
def _guard(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except Neo4jUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # 그 외 예기치 못한 오류
        raise HTTPException(status_code=500, detail=f"graph_error: {exc}") from exc


# ══════════════════════════════════════════════════════════════════
# 엔드포인트
# ══════════════════════════════════════════════════════════════════
@router.post("/student", summary="학생 노드 추가")
def add_student(payload: StudentIn):
    _guard(_graph.add_student, payload.student_id, payload.name)
    return {"ok": True, "student_id": payload.student_id}


@router.post("/teacher", summary="강사 노드 추가")
def add_teacher(payload: TeacherIn):
    _guard(_graph.add_teacher, payload.teacher_id, payload.name)
    return {"ok": True, "teacher_id": payload.teacher_id}


@router.post("/enroll", summary="학생-강사 관계(TAUGHT_BY) 연결")
def enroll(payload: EnrollIn):
    _guard(_graph.enroll, payload.student_id, payload.teacher_id)
    return {"ok": True, "student_id": payload.student_id, "teacher_id": payload.teacher_id}


@router.post("/feedback", summary="수업 피드백 추가(+관계 연결)")
def add_feedback(payload: FeedbackIn):
    _guard(_graph.add_feedback, payload.feedback_id, payload.student_id,
           payload.teacher_id, payload.content, payload.rating)
    return {"ok": True, "feedback_id": payload.feedback_id}


@router.get("/student/{student_id}/teachers-feedback",
            summary="학생이 배운 강사 목록 + 각 강사에게 받은 피드백")
def teachers_feedback(student_id: str = Path(..., min_length=1, max_length=100)):
    rows = _guard(_graph.get_teachers_and_feedback, student_id)
    return {"student_id": student_id, "teachers": rows}


@router.post("/seed-demo", summary="예시 데이터 시드(개발용)")
def seed_demo():
    _guard(_graph.seed_demo)
    return {"ok": True, "seeded": "학생 2 · 강사 2 · 피드백 4",
            "try": "/api/graph/student/stu_1001/teachers-feedback"}
