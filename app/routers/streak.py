# -*- coding: utf-8 -*-
"""
streak.py — 스픽(Speak)식 연속 학습(불꽃 🔥) + 일일 복습 퀴즈

[이 파일이 하는 일]
  - 학생이 매일 복습 퀴즈를 완료하면 '연속 학습 일수(불꽃 streak)'가 1씩 쌓입니다.
  - 하루라도 건너뛰면 불꽃이 꺼지고(1로 리셋), 최고 기록(longest_streak)은 따로 보관합니다.
  - 스픽 앱의 "연속 O일 학습 중!" UI 와 동일한 동기부여 장치입니다.

[제공 API]
  * GET  /api/streak/{student_id}      : 현재 불꽃 수 + 오늘 퀴즈 완료 여부 조회
  * POST /api/streak/complete-quiz     : 오늘 복습 퀴즈를 완료했다고 기록(불꽃 갱신)

[기존 망고아이와의 연동 포인트]
  - student_id 는 기존 D1 테이블 `students_erp.user_id`(TEXT)와 같은 값을 그대로 사용합니다.
    → 별도 매핑 없이 기존 학생 ID를 그대로 넣으면 됩니다.
  - '퀴즈 완료' 신호는 꼭 복습 퀴즈에서만 오는 게 아니라,
    기존 '학생게임(student-games.html)'이나 '복습퀴즈'를 다 풀었을 때
    Workers(JS) 쪽에서 이 POST /api/streak/complete-quiz 를 호출하도록 연결하면,
    "게임 완료 → 오늘의 학습 달성 → 불꽃 유지"로 자연스럽게 융합됩니다.
"""

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Path
from pydantic import BaseModel, Field
from sqlalchemy import Boolean, Column, Date, Integer, String
from sqlalchemy.orm import Session

from app.database import Base, get_db

# 이 파일의 모든 엔드포인트는 /api/streak 아래에 묶입니다.
router = APIRouter(prefix="/api/streak", tags=["streak(연속학습 불꽃)"])


# ══════════════════════════════════════════════════════════════════
# 1) 데이터베이스 모델 (표 정의)
# ══════════════════════════════════════════════════════════════════
class StudentStreak(Base):
    """
    학생 1명당 1줄(row) — 연속 학습 현황을 저장하는 표.

    [컬럼 설명]
      student_id             : 학생 고유 ID (기존 students_erp.user_id 와 동일한 TEXT 값). 기본키.
      current_streak         : 지금 이어지고 있는 연속 학습 일수(현재 불꽃 수).
      longest_streak         : 지금까지의 '최고' 연속 학습 일수(명예의 기록).
      last_activity_date     : 마지막으로 퀴즈를 완료한 '날짜'(시간 제외, 자정 기준).
      is_quiz_completed_today: 오늘 퀴즈를 이미 완료했는지 여부(빠른 조회용 플래그).
    """

    __tablename__ = "student_streaks"

    # student_id 는 정수가 아니라 문자열입니다.
    # 이유: 기존 망고아이 학생 식별자(students_erp.user_id)가 TEXT 이기 때문에 맞춰서 연동성을 확보.
    student_id = Column(String(100), primary_key=True, index=True)
    current_streak = Column(Integer, nullable=False, default=0)
    longest_streak = Column(Integer, nullable=False, default=0)
    last_activity_date = Column(Date, nullable=True)
    is_quiz_completed_today = Column(Boolean, nullable=False, default=False)


# ══════════════════════════════════════════════════════════════════
# 2) Pydantic 모델 (입력 검증 + 출력 형태 정의)
# ══════════════════════════════════════════════════════════════════
class CompleteQuizRequest(BaseModel):
    """POST /complete-quiz 의 요청 본문(JSON) 검증 모델."""

    # student_id 는 반드시 있어야 하고, 공백만 있는 값은 거부합니다(min_length=1).
    student_id: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="학생 ID (기존 students_erp.user_id 와 동일한 값)",
        examples=["stu_10023"],
    )


class StreakResponse(BaseModel):
    """API 응답으로 돌려줄 불꽃 현황 형태."""

    student_id: str
    current_streak: int = Field(description="현재 연속 학습 일수(불꽃 수)")
    longest_streak: int = Field(description="역대 최고 연속 학습 일수")
    last_activity_date: date | None = Field(description="마지막 학습 날짜(없으면 null)")
    is_quiz_completed_today: bool = Field(description="오늘 퀴즈 완료 여부")


# ══════════════════════════════════════════════════════════════════
# 3) 내부 도우미 — '오늘' 기준으로 불꽃 상태를 최신화
# ══════════════════════════════════════════════════════════════════
def _sync_today_flag(record: StudentStreak, today: date) -> None:
    """
    조회 시점 기준으로 'is_quiz_completed_today' 플래그를 실제 날짜와 맞춰줍니다.

    왜 필요한가?
      DB에는 마지막 학습 날짜만 저장돼 있으므로, 날짜가 바뀌면(자정을 넘기면)
      '오늘 완료' 플래그는 다시 False 여야 맞습니다. 조회할 때 이 보정을 해줍니다.
    """
    if record.last_activity_date == today:
        record.is_quiz_completed_today = True
    else:
        record.is_quiz_completed_today = False


# ══════════════════════════════════════════════════════════════════
# 4) API 엔드포인트
# ══════════════════════════════════════════════════════════════════
@router.get("/{student_id}", response_model=StreakResponse, summary="현재 불꽃/오늘 퀴즈 완료 여부 조회")
def get_streak(
    student_id: str = Path(..., min_length=1, max_length=100, description="학생 ID"),
    db: Session = Depends(get_db),
):
    """
    특정 학생의 현재 연속 학습(불꽃) 상태를 돌려줍니다.

    - 기록이 아직 없는 신규 학생이면 '0일, 오늘 미완료' 상태로 응답합니다(에러 아님).
    - 날짜가 바뀐 경우 '오늘 완료' 플래그를 자동 보정해서 정확한 값을 돌려줍니다.
    """
    today = date.today()  # 서버 로컬 자정 기준의 '오늘' 날짜(시간은 버림)

    record = db.query(StudentStreak).filter(StudentStreak.student_id == student_id).first()

    # 기록이 없으면 → 아직 아무 학습도 안 한 신규 학생. 빈(0) 상태로 응답.
    if record is None:
        return StreakResponse(
            student_id=student_id,
            current_streak=0,
            longest_streak=0,
            last_activity_date=None,
            is_quiz_completed_today=False,
        )

    # 날짜 경계 보정(자정 넘겼으면 오늘 완료=False 로).
    _sync_today_flag(record, today)

    return StreakResponse(
        student_id=record.student_id,
        current_streak=record.current_streak,
        longest_streak=record.longest_streak,
        last_activity_date=record.last_activity_date,
        is_quiz_completed_today=record.is_quiz_completed_today,
    )


@router.post("/complete-quiz", response_model=StreakResponse, summary="오늘 복습 퀴즈 완료 → 불꽃 갱신")
def complete_quiz(payload: CompleteQuizRequest, db: Session = Depends(get_db)):
    """
    오늘 복습 퀴즈(또는 연동된 학생게임)를 완료했을 때 호출합니다.

    [불꽃 계산 규칙 — 자정 기준]
      1) 오늘 이미 완료했다면      → 아무 변화 없이 현재 상태 그대로 반환(중복 방지).
      2) 어제 활동했다면          → 연속 성공! current_streak + 1.
      3) 그보다 오래 끊겼거나 처음  → 불꽃이 꺼졌으므로 current_streak = 1 로 리셋.
      4) 매번 계산 후 longest_streak 보다 크면 최고 기록 갱신.
    """
    # student_id 는 Pydantic 이 이미 검증했지만, 앞뒤 공백은 정리해서 저장 일관성 확보.
    student_id = payload.student_id.strip()
    if not student_id:
        # 공백만 들어온 경우(min_length 로 대부분 걸러지지만 방어적으로 한 번 더).
        raise HTTPException(status_code=422, detail="student_id 는 비어 있을 수 없습니다.")

    today = date.today()
    yesterday = today - timedelta(days=1)

    record = db.query(StudentStreak).filter(StudentStreak.student_id == student_id).first()

    if record is None:
        # ── 신규 학생: 첫 학습이므로 불꽃 1일부터 시작 ──
        record = StudentStreak(
            student_id=student_id,
            current_streak=1,
            longest_streak=1,
            last_activity_date=today,
            is_quiz_completed_today=True,
        )
        db.add(record)

    elif record.last_activity_date == today:
        # ── 규칙 1) 오늘 이미 완료: 변화 없음(하루에 한 번만 카운트) ──
        record.is_quiz_completed_today = True

    elif record.last_activity_date == yesterday:
        # ── 규칙 2) 어제 활동 → 연속 성공, +1 ──
        record.current_streak += 1
        record.last_activity_date = today
        record.is_quiz_completed_today = True

    else:
        # ── 규칙 3) 이틀 이상 끊김(또는 last_activity_date 가 None) → 리셋 후 1일부터 ──
        record.current_streak = 1
        record.last_activity_date = today
        record.is_quiz_completed_today = True

    # ── 규칙 4) 최고 기록 갱신 ──
    if record.current_streak > record.longest_streak:
        record.longest_streak = record.current_streak

    try:
        db.commit()
        db.refresh(record)
    except Exception as exc:  # DB 저장 실패 등 예기치 못한 오류
        db.rollback()
        raise HTTPException(status_code=500, detail=f"불꽃 저장 중 오류가 발생했습니다: {exc}") from exc

    return StreakResponse(
        student_id=record.student_id,
        current_streak=record.current_streak,
        longest_streak=record.longest_streak,
        last_activity_date=record.last_activity_date,
        is_quiz_completed_today=record.is_quiz_completed_today,
    )
