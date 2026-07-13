"""
schemas.py
==========================================================================
Pydantic v2 응답/요청 모델 정의.

프론트엔드 MyPage 대시보드를 "그대로" 그릴 수 있도록,
- 레이더(오각형) 차트 데이터
- 시간순 라인 차트 데이터
- 영어/한국어 이중 언어 뷰
구조를 명시적으로 정의한다.
==========================================================================
"""

from datetime import date as _date
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator

# 허용되는 5개 지표 코드 (온톨로지 카탈로그와 일치해야 함)
MetricCategory = Literal[
    "Teacher_Talk_Ratio",
    "Student_Engagement",
    "Praise_Count",
    "Question_Quality",
    "Response_Delay",
]
MetricStatus = Literal["Good", "Warning", "Bad"]


class RadarChartItem(BaseModel):
    """오각형(레이더) 차트의 꼭짓점 1개 = 지표 1개의 전체 강의 평균."""

    category: str = Field(..., description="내부 지표 코드 (예: Teacher_Talk_Ratio)")
    label_en: str = Field(..., description="강사에게 보여줄 영어 라벨")
    label_ko: str = Field(..., description="강사에게 보여줄 한국어 라벨")
    average_score: int = Field(..., description="전체 강의에 걸친 평균 점수(0~100)")


class LineChartItem(BaseModel):
    """시간순 라인 차트의 한 점 = 특정 강의 1회의 지표별 점수."""

    lecture_id: str
    date: str
    title: str
    # 지표코드 -> 점수. 예: {"Teacher_Talk_Ratio": 82, "Student_Engagement": 48, ...}
    scores: Dict[str, int]


class Conclusion(BaseModel):
    """
    교사가 실제로 수정에 활용하는 '최종 결론 · 실천 가이드'.
    장점 / 단점(하지 말 것) / 보완점 을 명확히 구분해 자세히 전달한다.
    """

    keep_doing: List[str] = Field(default_factory=list, description="장점 — 계속 유지할 것")
    improve: List[str] = Field(default_factory=list, description="보완점 — 더 잘해야 할 것")
    avoid: List[str] = Field(default_factory=list, description="단점 — 하지 말아야 할 것")
    closing: str = Field("", description="자세한 종합 결론 문단 (교사가 읽고 바로 실천)")


class LanguageView(BaseModel):
    """한 언어(영/한)에 대한 서술형 분석 뷰."""

    summary: str = Field(..., description="종합 코멘트 (강사 친화적 문장)")
    strengths: List[str] = Field(default_factory=list, description="잘하고 있는 점")
    action_items: List[str] = Field(default_factory=list, description="개선 제안(실천 항목)")
    # 결과 맨 마지막에 노출되는 '결론 · 실천 가이드'
    conclusion: Optional[Conclusion] = Field(None, description="최종 결론 (장점/단점/보완점)")


class DashboardResponse(BaseModel):
    """GET /api/v1/instructors/{id}/dashboard 최종 응답 스키마."""

    instructor_id: str
    instructor_name: str
    radar_chart_data: List[RadarChartItem]
    line_chart_data: List[LineChartItem]
    english_view: LanguageView
    korean_view: LanguageView


class SeedResponse(BaseModel):
    """목업 데이터 시딩 결과."""

    message_en: str
    message_ko: str
    instructor_id: str
    lecture_count: int


class ErrorResponse(BaseModel):
    """이중 언어 에러 응답. (404 등에서 사용)"""

    error_en: str
    error_ko: str


# ==========================================================================
# 강의 분석 결과 수집(Ingestion) 요청/응답
# ==========================================================================
class MetricIn(BaseModel):
    """분석 파이프라인이 보내는 지표 1개."""

    category: MetricCategory
    score: int = Field(..., ge=0, le=100, description="0~100 점수")
    # status 는 선택: 없으면 서버가 점수로부터 자동 유도
    status: Optional[MetricStatus] = None
    feedback_en: str = Field(..., min_length=1)
    feedback_ko: str = Field(..., min_length=1)


class LectureIngestRequest(BaseModel):
    """강의 1회분 분석 결과 수집 요청."""

    instructor_id: str = Field(..., min_length=1)
    instructor_name: str = Field(..., min_length=1)
    lecture_id: str = Field(..., min_length=1)
    title: str = Field(..., min_length=1)
    date: str = Field(..., description="강의 날짜 (YYYY-MM-DD)")
    metrics: List[MetricIn] = Field(..., min_length=1)

    @field_validator("date")
    @classmethod
    def _validate_date(cls, v: str) -> str:
        # ISO 날짜 형식 강제 (기간 필터가 사전식 비교에 의존하므로 형식이 중요)
        try:
            _date.fromisoformat(v)
        except ValueError as exc:
            raise ValueError("date 는 'YYYY-MM-DD' 형식이어야 합니다.") from exc
        return v

    @field_validator("metrics")
    @classmethod
    def _no_duplicate_categories(cls, v: List[MetricIn]) -> List[MetricIn]:
        cats = [m.category for m in v]
        if len(cats) != len(set(cats)):
            raise ValueError("동일한 지표(category)가 중복될 수 없습니다.")
        return v


class LectureIngestResponse(BaseModel):
    message_en: str
    message_ko: str
    instructor_id: str
    lecture_id: str
    metrics_ingested: int


# ==========================================================================
# 정기 리포트 (마이페이지 자동 노출용)
# ==========================================================================
class CategoryAverage(BaseModel):
    """리포트 레이더 항목 1개 + 지난 기간 대비 변화량(delta)."""

    category: str
    label_en: str
    label_ko: str
    average_score: int
    delta: Optional[int] = Field(
        None, description="직전 리포트 대비 변화(+개선/-후퇴). 첫 리포트면 null"
    )
    status: MetricStatus


class ReportResponse(BaseModel):
    """마이페이지에 표시할 최신 정기 리포트."""

    instructor_id: str
    instructor_name: str
    has_report: bool = Field(..., description="아직 생성된 리포트가 없으면 False")

    # 리포트가 있을 때만 채워지는 필드들
    period_start: Optional[str] = None
    period_end: Optional[str] = None
    generated_at: Optional[str] = None
    cadence_days: Optional[int] = None
    window_days: Optional[int] = None
    lectures_count: Optional[int] = None
    next_report_estimate: Optional[str] = Field(
        None, description="다음 리포트 예정일 (기간 종료일 + 주기)"
    )
    has_previous: bool = False

    radar_chart_data: List[CategoryAverage] = Field(default_factory=list)
    english_view: Optional[LanguageView] = None
    korean_view: Optional[LanguageView] = None


class ReportRunResponse(BaseModel):
    """정기 리포트 배치 생성 결과."""

    message_en: str
    message_ko: str
    instructors: int
    reports_generated: int
    skipped_no_lectures: int


# ==========================================================================
# 리포트 히스토리 (여러 기간에 걸친 성장 추적)
# ==========================================================================
class ReportHistoryItem(BaseModel):
    """과거 정기 리포트 1건의 요약."""

    period_start: str
    period_end: str
    generated_at: str
    lectures_count: int
    scores: Dict[str, int] = Field(..., description="지표코드 -> 평균 점수")


class ReportHistoryResponse(BaseModel):
    """특정 강사의 리포트 히스토리(최신순)."""

    instructor_id: str
    instructor_name: str
    count: int
    reports: List[ReportHistoryItem] = Field(default_factory=list)


# ==========================================================================
# 관리자 개요 (전체 강사 한눈에)
# ==========================================================================
class LabelPair(BaseModel):
    """지표 코드 + 이중 언어 라벨."""

    category: str
    label_en: str
    label_ko: str


class InstructorOverviewItem(BaseModel):
    """관리자 목록의 강사 1명 요약 (최신 리포트 기준)."""

    instructor_id: str
    instructor_name: str
    has_report: bool
    last_period_end: Optional[str] = None
    good_count: Optional[int] = Field(None, description="상태가 Good 인 지표 수(0~5)")
    top_strength: Optional[LabelPair] = Field(None, description="가장 강한 영역")
    focus_area: Optional[LabelPair] = Field(None, description="가장 개선이 필요한 영역")


class InstructorsOverviewResponse(BaseModel):
    """관리자 개요 — 전체 강사 요약 목록."""

    count: int
    instructors: List[InstructorOverviewItem] = Field(default_factory=list)
