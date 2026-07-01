# -*- coding: utf-8 -*-
"""
warmup.py — AI 웜업 롤플레이 엔드포인트(라우터)

[이 파일이 하는 일]
  - app/services/ai_warmup.py 의 PreClassAIEngine 을 HTTP API 로 노출합니다.
  - 학생 앱/수업 화면에서 이 API 를 호출하면, 수업 전 AI 대화가 실시간으로 오갑니다.

[제공 API]
  * POST /api/warmup/chat        : 학생 발화 1개 → AI 답변 1개(세션 문맥 유지)
  * DELETE /api/warmup/{session_id} : 수업 종료 시 세션 대화 기록 정리(선택)
"""

from fastapi import APIRouter, HTTPException, Path

from app.services.ai_warmup import (
    AIWarmupError,
    WarmupRequest,
    WarmupResponse,
    engine,
)

router = APIRouter(prefix="/api/warmup", tags=["warmup(수업 전 AI 웜업)"])


@router.post("/chat", response_model=WarmupResponse, summary="수업 전 AI 웜업 대화")
def warmup_chat(payload: WarmupRequest):
    """
    학생의 발화(payload.student_input)를 받아 AI 대화 친구의 답변을 돌려줍니다.

    - 입력은 Pydantic(WarmupRequest)이 자동 검증합니다(빈 값/길이 초과 거부).
    - AI 처리 중 오류(키 없음, API 실패 등)는 AIWarmupError → HTTP 502 로 변환합니다.
    """
    try:
        return engine.generate_ai_response(
            session_id=payload.session_id,
            student_input=payload.student_input,
            lesson_topic=payload.lesson_topic,
        )
    except AIWarmupError as exc:
        # 502 Bad Gateway: 외부 AI 서비스(OpenAI) 연동 단계의 문제라는 의미.
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.delete("/{session_id}", summary="세션 대화 기록 정리")
def clear_warmup_session(
    session_id: str = Path(..., min_length=1, max_length=200, description="정리할 세션 ID"),
):
    """수업이 끝났을 때 호출하면 해당 세션의 대화 기록을 메모리에서 지웁니다."""
    engine.clear_session(session_id)
    return {"session_id": session_id, "cleared": True}
