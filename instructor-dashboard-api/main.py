"""
main.py
==========================================================================
FastAPI 애플리케이션 진입점.
- 앱 수명주기(lifespan) 동안 Neo4j 드라이버를 딱 한 번 열고 닫는다.
- 강사 대시보드 집계 API 라우팅
- 이중 언어 에러 처리 (강사가 없으면 404 + 영/한 메시지)

실행 방법:
    cd instructor-dashboard-api
    pip install -r requirements.txt
    uvicorn main:app --reload
    -> http://127.0.0.1:8000/docs 에서 대화형 문서 확인
==========================================================================
"""

import hmac
import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from database import db
from schemas import (
    DashboardResponse,
    ErrorResponse,
    InstructorsOverviewResponse,
    LectureIngestRequest,
    LectureIngestResponse,
    ReportHistoryResponse,
    ReportResponse,
    ReportRunResponse,
    SeedResponse,
)
from services import (
    ensure_schema,
    generate_periodic_reports,
    get_instructor_dashboard,
    get_latest_report,
    get_report_history,
    ingest_lecture,
    list_instructors_overview,
    seed_mock_data,
)

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("mangoi.main")

# --------------------------------------------------------------------------
# 정기 리포트 설정 (env로 주기/창 조정 가능)
#   REPORT_CADENCE_DAYS : 리포트를 얼마나 자주 생성할지 (기본 14일 = 격주 추천)
#   REPORT_WINDOW_DAYS  : 한 리포트가 집계하는 기간 (기본 28일 = 4주 롤링)
#   ENABLE_SCHEDULER    : 앱 내부 스케줄러 사용 여부 (기본 false; 운영은 외부 크론 권장)
#   INGEST_TOKEN        : API 인증 토큰. 미설정 시 보호 API 전체가 503 (fail-closed)
#   ALLOW_INSECURE_NO_AUTH : "true" 로컬 개발시에만 무인증 허용 (운영 금지)
# --------------------------------------------------------------------------
REPORT_CADENCE_DAYS = int(os.getenv("REPORT_CADENCE_DAYS", "14"))
REPORT_WINDOW_DAYS = int(os.getenv("REPORT_WINDOW_DAYS", "28"))
INGEST_TOKEN = os.getenv("INGEST_TOKEN", "").strip()
ALLOW_INSECURE_NO_AUTH = os.getenv("ALLOW_INSECURE_NO_AUTH", "false").lower() == "true"


def require_api_key(x_api_key: str = Header(default="")) -> None:
    """
    API 보호용 의존성 (쓰기 + 강사 데이터 조회).
    🔐 (2026-07-14 보안) fail-closed 로 전환:
    - INGEST_TOKEN 미설정 = 배포 실수로 간주하고 503 거부 (예전엔 무인증 통과였음)
    - 로컬 개발에서만 ALLOW_INSECURE_NO_AUTH=true 로 우회 가능
    - 토큰 비교는 타이밍 공격 방지를 위해 hmac.compare_digest 사용
    """
    if not INGEST_TOKEN:
        if ALLOW_INSECURE_NO_AUTH:
            return
        raise HTTPException(
            status_code=503,
            detail={
                "error_en": "Server auth is not configured (INGEST_TOKEN missing).",
                "error_ko": "서버 인증이 설정되지 않았습니다(INGEST_TOKEN 누락). 관리자에게 문의하세요.",
            },
        )
    if not hmac.compare_digest(x_api_key.encode(), INGEST_TOKEN.encode()):
        raise HTTPException(
            status_code=401,
            detail={
                "error_en": "Invalid or missing API key.",
                "error_ko": "API 키가 올바르지 않거나 누락되었습니다.",
            },
        )


# ==========================================================================
# 애플리케이션 수명주기 관리 (드라이버 열기/닫기 + 선택적 스케줄러)
# ==========================================================================
_scheduler = None  # 내부 스케줄러 핸들 (사용 시에만 생성)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _scheduler
    # --- 시작(startup) ---
    db.connect()  # 드라이버(커넥션 풀) 1회 생성

    # 스키마 제약조건/인덱스 보장 (중복 노드 방지 + 조회 성능). 실패해도 기동은 계속.
    try:
        ensure_schema(db)
    except Exception as exc:
        logger.warning("스키마 보장 실패(무시하고 계속): %s", exc)

    # 환경변수 SEED_ON_STARTUP=true 이면 목업 데이터 자동 시딩
    if os.getenv("SEED_ON_STARTUP", "false").lower() == "true":
        try:
            seed_mock_data(db)
        except Exception as exc:  # 시딩 실패가 앱 기동을 막지 않도록 방어
            logger.warning("시작 시 목업 시딩 실패(무시하고 계속): %s", exc)

    # 내부 스케줄러 사용 시: 주기(cadence)마다 전체 강사 리포트 생성
    # 주의) 다중 워커 배포에서는 중복 실행을 피하려면 외부 크론으로
    #       POST /api/v1/reports/run 을 호출하는 방식이 더 안전하다.
    if os.getenv("ENABLE_SCHEDULER", "false").lower() == "true":
        try:
            from apscheduler.schedulers.background import BackgroundScheduler
            from apscheduler.triggers.interval import IntervalTrigger

            _scheduler = BackgroundScheduler(timezone="UTC")
            _scheduler.add_job(
                lambda: generate_periodic_reports(
                    db,
                    cadence_days=REPORT_CADENCE_DAYS,
                    window_days=REPORT_WINDOW_DAYS,
                ),
                trigger=IntervalTrigger(days=REPORT_CADENCE_DAYS),
                id="periodic_reports",
                replace_existing=True,
            )
            _scheduler.start()
            logger.info(
                "정기 리포트 스케줄러 시작: 매 %d일마다 (창 %d일)",
                REPORT_CADENCE_DAYS, REPORT_WINDOW_DAYS,
            )
        except Exception as exc:
            logger.warning("스케줄러 시작 실패(무시하고 계속): %s", exc)

    yield  # ---- 여기서 앱이 요청을 처리 ----

    # --- 종료(shutdown) ---
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
    db.close()  # 커넥션 누수 방지: 드라이버 정리


app = FastAPI(
    title="Mangoi 강사 대시보드 API",
    description="강사의 여러 강의를 분석해 성장 인사이트를 제공하는 마이페이지 백엔드",
    version="1.0.0",
    lifespan=lifespan,
)

# 프론트엔드(마이페이지)에서 직접 호출할 수 있도록 CORS 허용.
# 🔐 (2026-07-12 보안) 개인정보(강사 성과) API 라서 와일드카드 대신 허용 도메인만.
#   CORS_ALLOW_ORIGINS 환경변수(콤마구분)로 지정. 미설정 시 mangoi 도메인만 허용(운영 안전 기본값).
_cors_env = os.getenv("CORS_ALLOW_ORIGINS", "").strip()
CORS_ORIGINS = (
    [o.strip() for o in _cors_env.split(",") if o.strip()]
    if _cors_env
    else [
        "https://test.mangoi.co.kr",  # 실운영 프론트 (co.kr 루트는 구 PHP)
        "https://mangoi.co.kr",
        "https://www.mangoi.co.kr",
        "https://webrtc-unified-platform-prod.navy111p.workers.dev",
    ]
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-API-Key"],
)


# ==========================================================================
# 헬스체크
# ==========================================================================
@app.get("/health", tags=["system"])
def health_check():
    """DB 연결 상태를 포함한 헬스체크."""
    return {"status": "ok", "neo4j_connected": db.verify()}


# ==========================================================================
# 목업 데이터 시딩 (개발/데모용)
# ==========================================================================
@app.post("/api/v1/seed", response_model=SeedResponse, tags=["dev"], dependencies=[Depends(require_api_key)])
def seed():
    # 🔐 (2026-07-12) 데이터 변조 방지 — 무인증 시딩 차단(INGEST_TOKEN 설정 시 X-API-Key 필요)
    """강사 1명 + 강의 3회의 성장 시나리오 목업 데이터를 적재한다."""
    try:
        result = seed_mock_data(db)
    except Exception as exc:
        logger.exception("시딩 중 오류")
        raise HTTPException(
            status_code=500,
            detail={
                "error_en": "Failed to seed mock data.",
                "error_ko": "목업 데이터 적재에 실패했습니다.",
            },
        ) from exc

    return SeedResponse(
        message_en="Mock data seeded successfully.",
        message_ko="목업 데이터를 성공적으로 적재했습니다.",
        instructor_id=result["instructor_id"],
        lecture_count=result["lecture_count"],
    )


# ==========================================================================
# 강사 대시보드 집계 API (핵심 엔드포인트)
# ==========================================================================
@app.get(
    "/api/v1/instructors/{instructor_id}/dashboard",
    response_model=DashboardResponse,
    responses={404: {"model": ErrorResponse}},
    tags=["dashboard"],
    dependencies=[Depends(require_api_key)],  # 🔐 (2026-07-14) 강사 실명+평가 IDOR 차단
)
def instructor_dashboard(instructor_id: str):
    """
    특정 강사의 '모든 강의'를 가로질러 집계한 대시보드 데이터를 반환한다.
    🔐 브라우저에서 직접 호출하지 말고, 로그인 세션을 검증하는 서버(워커)가
       X-API-Key 를 붙여 프록시하는 구조로 연동할 것 (키를 프론트 JS에 넣지 말 것).
    - radar_chart_data : 5개 지표의 전체 평균 (오각형 차트)
    - line_chart_data  : 강의별 시간순 점수 (성장 추세)
    - english_view / korean_view : 즉시 토글 가능한 이중 언어 코멘트
    """
    try:
        dashboard = get_instructor_dashboard(db, instructor_id)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("대시보드 조회 중 오류: instructor_id=%s", instructor_id)
        raise HTTPException(
            status_code=500,
            detail={
                "error_en": "An unexpected error occurred while building the dashboard.",
                "error_ko": "대시보드를 생성하는 중 예기치 못한 오류가 발생했습니다.",
            },
        ) from exc

    # 강사를 찾지 못한 경우 -> 404 + 이중 언어 메시지
    if dashboard is None:
        raise HTTPException(
            status_code=404,
            detail={
                "error_en": f"Instructor '{instructor_id}' was not found.",
                "error_ko": f"'{instructor_id}' 강사를 찾을 수 없습니다.",
            },
        )

    return dashboard


# ==========================================================================
# 강의 분석 결과 수집 API (분석 파이프라인 -> 그래프)
# ==========================================================================
@app.post(
    "/api/v1/lectures",
    response_model=LectureIngestResponse,
    responses={401: {"model": ErrorResponse}},
    tags=["ingestion"],
    dependencies=[Depends(require_api_key)],
)
def ingest_lecture_endpoint(payload: LectureIngestRequest):
    """
    녹화 분석 결과(강의 1회분 + 지표들)를 그래프에 적재한다.
    - 같은 lecture_id 로 재전송하면 안전하게 덮어쓴다(idempotent).
    - metric.status 를 생략하면 점수로부터 자동 유도한다.
    """
    try:
        result = ingest_lecture(db, payload)
    except Exception as exc:
        logger.exception("강의 수집 중 오류: %s", payload.lecture_id)
        raise HTTPException(
            status_code=500,
            detail={
                "error_en": "Failed to ingest lecture analysis.",
                "error_ko": "강의 분석 결과 적재에 실패했습니다.",
            },
        ) from exc

    return LectureIngestResponse(
        message_en="Lecture analysis ingested successfully.",
        message_ko="강의 분석 결과를 성공적으로 적재했습니다.",
        instructor_id=result["instructor_id"],
        lecture_id=result["lecture_id"],
        metrics_ingested=result["metrics_ingested"],
    )


# ==========================================================================
# 정기 리포트 생성 트리거 (스케줄러/외부 크론이 호출)
# ==========================================================================
@app.post(
    "/api/v1/reports/run",
    response_model=ReportRunResponse,
    responses={401: {"model": ErrorResponse}},
    tags=["reports"],
    dependencies=[Depends(require_api_key)],
)
def run_reports_endpoint():
    """
    전체 강사에 대해 정기 리포트를 생성한다.
    운영에서는 외부 크론(Cloudflare Cron / 시스템 cron / GitHub Actions)이
    설정한 주기(기본 격주)로 이 엔드포인트를 호출하는 방식을 권장한다.
    """
    try:
        result = generate_periodic_reports(
            db,
            cadence_days=REPORT_CADENCE_DAYS,
            window_days=REPORT_WINDOW_DAYS,
        )
    except Exception as exc:
        logger.exception("정기 리포트 생성 중 오류")
        raise HTTPException(
            status_code=500,
            detail={
                "error_en": "Failed to generate periodic reports.",
                "error_ko": "정기 리포트 생성에 실패했습니다.",
            },
        ) from exc

    return ReportRunResponse(
        message_en="Periodic reports generated.",
        message_ko="정기 리포트를 생성했습니다.",
        instructors=result["instructors"],
        reports_generated=result["reports_generated"],
        skipped_no_lectures=result["skipped_no_lectures"],
    )


# ==========================================================================
# 최신 정기 리포트 조회 (마이페이지 자동 노출)
# ==========================================================================
@app.get(
    "/api/v1/instructors/{instructor_id}/report",
    response_model=ReportResponse,
    responses={404: {"model": ErrorResponse}},
    tags=["reports"],
    dependencies=[Depends(require_api_key)],  # 🔐 (2026-07-14) 강사 평가 IDOR 차단
)
def instructor_report(instructor_id: str):
    """
    강사 마이페이지에 표시할 '최신 정기 리포트'를 반환한다.
    - 지난 기간 대비 지표별 변화량(delta)을 포함해 성장/후퇴를 보여준다.
    - 아직 리포트가 없으면 has_report=False (강사는 존재).
    """
    try:
        report = get_latest_report(db, instructor_id)
    except Exception as exc:
        logger.exception("리포트 조회 중 오류: instructor_id=%s", instructor_id)
        raise HTTPException(
            status_code=500,
            detail={
                "error_en": "An unexpected error occurred while loading the report.",
                "error_ko": "리포트를 불러오는 중 예기치 못한 오류가 발생했습니다.",
            },
        ) from exc

    if report is None:
        raise HTTPException(
            status_code=404,
            detail={
                "error_en": f"Instructor '{instructor_id}' was not found.",
                "error_ko": f"'{instructor_id}' 강사를 찾을 수 없습니다.",
            },
        )

    return report


# ==========================================================================
# 리포트 히스토리 (여러 기간에 걸친 성장 추적)
# ==========================================================================
@app.get(
    "/api/v1/instructors/{instructor_id}/reports",
    response_model=ReportHistoryResponse,
    responses={404: {"model": ErrorResponse}},
    tags=["reports"],
    dependencies=[Depends(require_api_key)],  # 🔐 (2026-07-14) 강사 평가 IDOR 차단
)
def instructor_report_history(
    instructor_id: str,
    limit: int = Query(12, ge=1, le=100),  # 음수/0이면 Cypher 슬라이스가 오동작 → 검증
):
    """강사의 과거 정기 리포트 목록(최신순). 기간별 점수로 장기 추세를 그린다."""
    try:
        history = get_report_history(db, instructor_id, limit=limit)
    except Exception as exc:
        logger.exception("리포트 히스토리 조회 오류: %s", instructor_id)
        raise HTTPException(
            status_code=500,
            detail={
                "error_en": "Failed to load report history.",
                "error_ko": "리포트 히스토리를 불러오지 못했습니다.",
            },
        ) from exc

    if history is None:
        raise HTTPException(
            status_code=404,
            detail={
                "error_en": f"Instructor '{instructor_id}' was not found.",
                "error_ko": f"'{instructor_id}' 강사를 찾을 수 없습니다.",
            },
        )
    return history


# ==========================================================================
# 관리자 개요 (전체 강사 한눈에)
# ==========================================================================
@app.get(
    "/api/v1/instructors",
    response_model=InstructorsOverviewResponse,
    tags=["reports"],
    dependencies=[Depends(require_api_key)],  # 🔐 (2026-07-12) 전체 강사 일괄 노출 → 관리자 키 필요
)
def instructors_overview():
    """
    관리자용 전체 강사 요약. 각 강사의 최신 리포트 기준 강점/개선영역/Good 지표 수.
    조직(본사/지사)이 강사 코칭 우선순위를 잡는 데 사용.
    """
    try:
        return list_instructors_overview(db)
    except Exception as exc:
        logger.exception("강사 개요 조회 오류")
        raise HTTPException(
            status_code=500,
            detail={
                "error_en": "Failed to load instructor overview.",
                "error_ko": "강사 개요를 불러오지 못했습니다.",
            },
        ) from exc


# ==========================================================================
# HTTPException 을 이중 언어 스키마 형태로 일관되게 반환
# ==========================================================================
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc: HTTPException):
    """
    detail 이 이미 {error_en, error_ko} 형태면 그대로,
    아니라면 영/한 필드로 감싸서 반환한다. (프론트가 항상 동일 구조를 기대)
    """
    detail = exc.detail
    if isinstance(detail, dict) and "error_en" in detail and "error_ko" in detail:
        content = detail
    else:
        content = {"error_en": str(detail), "error_ko": str(detail)}
    return JSONResponse(status_code=exc.status_code, content=content)


if __name__ == "__main__":
    # 로컬에서 `python main.py` 로도 실행 가능하게 편의 제공
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
