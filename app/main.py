# -*- coding: utf-8 -*-
"""
main.py — 망고아이 FastAPI 백엔드의 진입점(entry point)

[이 파일이 하는 일]
  1) FastAPI 앱을 만들고, 두 기능(streak, warmup) 라우터를 연결합니다.
  2) 시작 시 DB 테이블을 자동 생성합니다(없을 때만).
  3) 헬스체크(/health)와 간단한 안내(/) 엔드포인트를 제공합니다.

[실행 방법]
  $ pip install -r requirements.txt
  $ set OPENAI_API_KEY=sk-...        (Windows PowerShell: $env:OPENAI_API_KEY="sk-...")
  $ uvicorn app.main:app --reload --port 8010

  - 대화형 API 문서:  http://127.0.0.1:8010/docs
"""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app.routers import streak, warmup

# ── 1. DB 테이블 생성 ───────────────────────────────────────────
# 모델(StudentStreak 등)에 해당하는 표가 DB에 없으면 자동으로 만들어줍니다.
# (이미 있으면 건드리지 않습니다.)
Base.metadata.create_all(bind=engine)

# ── 2. FastAPI 앱 생성 ─────────────────────────────────────────
app = FastAPI(
    title="망고아이 학습 백엔드 (Mangoi Learning Backend)",
    description="스픽식 연속 학습(불꽃 streak) + 수업 전 AI 웜업 롤플레이 서비스",
    version="1.0.0",
)

# ── 3. CORS 설정 ───────────────────────────────────────────────
# 망고아이 웹(브라우저)에서 이 API 를 fetch 로 부를 수 있게 허용 오리진을 지정합니다.
#
# [설정 방법]
#   - 환경변수 CORS_ALLOW_ORIGINS 에 콤마(,)로 구분해 도메인을 넣으면 그 목록을 사용합니다.
#       예) CORS_ALLOW_ORIGINS="https://test.mangoi.co.kr,https://mangoi.co.kr"
#   - 지정하지 않으면 아래 기본값(망고아이 프론트 도메인 + 로컬 개발)을 사용합니다.
#   - 모든 오리진을 열려면 CORS_ALLOW_ORIGINS="*" (개발용, 운영에서는 권장하지 않음).
#
# [주의] 브라우저 규칙상 allow_origins="*" 와 allow_credentials=True 는 함께 못 씁니다.
#        우리 프론트는 쿠키/인증정보를 보내지 않으므로 credentials 는 False 로 둡니다.
_DEFAULT_ORIGINS = [
    "https://test.mangoi.co.kr",
    "https://mangoi.co.kr",
    "https://www.mangoi.co.kr",
    "https://webrtc-unified-platform.navy111p.workers.dev",
    "https://webrtc-unified-platform-prod.navy111p.workers.dev",
    "http://localhost:8010",
    "http://127.0.0.1:8010",
]
_cors_env = os.getenv("CORS_ALLOW_ORIGINS", "").strip()
if _cors_env == "*":
    _allow_origins = ["*"]
elif _cors_env:
    # 콤마로 구분된 목록 → 공백 제거 후 리스트로
    _allow_origins = [o.strip() for o in _cors_env.split(",") if o.strip()]
else:
    _allow_origins = _DEFAULT_ORIGINS

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allow_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── 4. 라우터 연결 ─────────────────────────────────────────────
app.include_router(streak.router)   # /api/streak/...
app.include_router(warmup.router)   # /api/warmup/...


# ── 5. 기본/헬스체크 엔드포인트 ────────────────────────────────
@app.get("/", tags=["기본"])
def root():
    """서비스가 살아있는지 + 어떤 기능이 있는지 간단 안내."""
    return {
        "service": "mangoi-learning-backend",
        "features": ["streak(연속학습 불꽃)", "warmup(수업 전 AI 웜업)"],
        "docs": "/docs",
    }


@app.get("/health", tags=["기본"])
def health():
    """로드밸런서/모니터링용 헬스체크."""
    return {"status": "ok"}
