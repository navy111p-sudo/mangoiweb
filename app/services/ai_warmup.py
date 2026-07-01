# -*- coding: utf-8 -*-
"""
ai_warmup.py — 원어민 수업 10분 전 AI 웜업(warm-up) 롤플레이 엔진

[이 파일이 하는 일]
  - 원어민 선생님과의 화상 수업 '직전'에, 학생이 미리 입을 풀도록 도와주는
    AI 영어 대화 친구를 제공합니다.
  - 세션(session_id)별로 '이전 대화 기록'을 기억해서, 맥락이 이어지는 자연스러운
    대화를 실시간으로 주고받습니다.
  - 학생이 한국어로 "이걸 영어로 어떻게 해?" 라고 물으면, 자연스러운 영어 문장으로
    교정해주고 다시 영어로 말하도록 유도합니다.

[사용 기술]
  - OpenAI Chat Completions API (환경변수 OPENAI_API_KEY 필요).
  - openai 패키지가 없거나 키가 없으면, 서비스가 죽지 않도록 예외를 명확히 던집니다.

[기존 망고아이와의 연동 포인트]
  - session_id 는 기존 화상수업 방(room) 식별자(room_id)나 예약 ID를 그대로 쓰면,
    "수업방 = 웜업 대화 세션"으로 1:1 매칭되어 자연스럽게 융합됩니다.
  - lesson_topic 은 그날 배울 레슨 주제(교재 unit 등)를 넣으면 워밍업 대화가
    실제 수업 내용과 이어집니다.
"""

import os
from threading import Lock

from pydantic import BaseModel, Field

# ── 시스템 프롬프트 (AI 의 역할/규칙 정의) ─────────────────────────
# 요구사항에서 지정한 취지를 그대로 담았습니다. AI 대화의 '성격'을 결정하는 핵심입니다.
SYSTEM_PROMPT = (
    "너는 망고아이의 AI 대화 친구야. 학생의 레벨에 맞춰 최대 2문장 이내로 친절하게 질문해줘. "
    "만약 학생이 한국어로 '이걸 영어로 어떻게 해?'라고 물어보면 자연스러운 영어 문장으로 "
    "교정해주고 영어로 다시 말하도록 유도해줘."
)

# 사용할 OpenAI 모델. 환경변수로 바꿀 수 있게 열어둡니다(기본: gpt-4o-mini).
OPENAI_MODEL = os.getenv("OPENAI_WARMUP_MODEL", "gpt-4o-mini")


# ══════════════════════════════════════════════════════════════════
# 1) Pydantic 입력 검증 모델
# ══════════════════════════════════════════════════════════════════
class WarmupRequest(BaseModel):
    """웜업 대화 요청 검증 모델 — 라우터에서 이 형태로 입력을 받습니다."""

    session_id: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="대화 세션 ID (기존 화상수업 room_id/예약 ID 를 그대로 쓰면 연동됨)",
        examples=["room_20260701_0930"],
    )
    student_input: str = Field(
        ...,
        min_length=1,
        max_length=2000,
        description="학생이 말/입력한 내용(영어 또는 한국어 질문)",
        examples=["I want talk about my weekend"],
    )
    lesson_topic: str | None = Field(
        default=None,
        max_length=200,
        description="오늘 수업 주제(선택). 넣으면 워밍업이 실제 레슨과 이어집니다.",
        examples=["My Weekend Activities"],
    )


class WarmupResponse(BaseModel):
    """웜업 대화 응답 형태."""

    session_id: str
    ai_response: str = Field(description="AI 대화 친구의 답변")
    turn_count: int = Field(description="이 세션에서 지금까지 오간 학생 발화 수")


# ══════════════════════════════════════════════════════════════════
# 2) 서비스 전용 예외
# ══════════════════════════════════════════════════════════════════
class AIWarmupError(Exception):
    """
    AI 웜업 처리 중 발생하는 오류(키 없음, API 실패 등).
    라우터에서 이 예외를 잡아 적절한 HTTPException 으로 변환합니다.
    """


# ══════════════════════════════════════════════════════════════════
# 3) 핵심 엔진 클래스
# ══════════════════════════════════════════════════════════════════
class PreClassAIEngine:
    """
    수업 전(Pre-Class) AI 웜업 대화 엔진.

    - 세션별 대화 기록을 메모리에 보관해서 문맥을 유지합니다.
    - generate_ai_response() 한 번 = 학생 발화 1번 + AI 답변 1번.

    [주의] 대화 기록은 지금은 '프로세스 메모리'에 저장됩니다(간단/빠름).
           서버를 여러 대로 늘리거나 재시작해도 유지하려면, 뒤에서 Redis/DB로
           _histories 저장소만 바꿔 끼우면 됩니다(인터페이스는 그대로).
    """

    # 세션당 유지할 최대 '대화 turn' 수(오래된 건 잘라 토큰/비용 절약).
    MAX_TURNS_KEPT = 12

    def __init__(self):
        # {session_id: [ {"role": "user"/"assistant", "content": "..."} , ... ]}
        self._histories: dict[str, list[dict]] = {}
        # 여러 요청이 동시에 같은 딕셔너리를 건드릴 때를 대비한 잠금(thread-safe).
        self._lock = Lock()

    # ── 3-1. 세션 대화 기록 가져오기(없으면 시스템 프롬프트로 초기화) ──
    def _get_history(self, session_id: str, lesson_topic: str | None) -> list[dict]:
        if session_id not in self._histories:
            # 대화 첫 시작: 시스템 프롬프트를 맨 앞에 깔아줍니다.
            system_content = SYSTEM_PROMPT
            if lesson_topic:
                # 오늘 주제가 있으면 시스템 프롬프트에 살짝 덧붙여 맥락을 줍니다.
                system_content += f" 오늘의 대화 주제는 '{lesson_topic}' 이야."
            self._histories[session_id] = [{"role": "system", "content": system_content}]
        return self._histories[session_id]

    # ── 3-2. OpenAI 클라이언트 준비(키/패키지 확인) ──
    def _make_client(self):
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise AIWarmupError(
                "OPENAI_API_KEY 환경변수가 설정되어 있지 않습니다. "
                "AI 웜업을 쓰려면 OpenAI API 키를 환경변수로 넣어주세요."
            )
        try:
            # openai>=1.0 스타일 클라이언트.
            from openai import OpenAI
        except ImportError as exc:
            raise AIWarmupError(
                "openai 패키지가 설치되어 있지 않습니다. `pip install openai` 후 다시 시도하세요."
            ) from exc
        return OpenAI(api_key=api_key)

    # ── 3-3. 메인 함수: 학생 입력 → AI 답변 ──
    def generate_ai_response(
        self, session_id: str, student_input: str, lesson_topic: str | None = None
    ) -> WarmupResponse:
        """
        학생의 한 마디(student_input)를 받아 AI 답변을 돌려줍니다.
        세션별 이전 대화를 함께 넘겨서 문맥이 이어지게 합니다.

        예외:
          - 키/패키지 문제나 API 호출 실패 시 AIWarmupError 를 던집니다.
        """
        # 입력 방어(라우터에서 Pydantic 검증을 하지만, 직접 호출도 대비).
        if not session_id or not session_id.strip():
            raise AIWarmupError("session_id 가 비어 있습니다.")
        if not student_input or not student_input.strip():
            raise AIWarmupError("student_input 가 비어 있습니다.")

        with self._lock:
            history = self._get_history(session_id, lesson_topic)
            # 이번 학생 발화를 대화 기록에 추가.
            history.append({"role": "user", "content": student_input.strip()})

            # 너무 길어지면 앞부분(시스템 프롬프트는 유지)만 잘라 비용/속도 관리.
            self._trim_history(session_id)

            # API 로 넘길 메시지 스냅샷(잠금 안에서 복사).
            messages = list(self._histories[session_id])

        # ── 실제 OpenAI 호출(네트워크 구간은 잠금 밖에서) ──
        client = self._make_client()
        try:
            completion = client.chat.completions.create(
                model=OPENAI_MODEL,
                messages=messages,
                temperature=0.7,   # 너무 딱딱하지 않게 약간의 자연스러움
                max_tokens=200,    # '최대 2문장' 취지에 맞춰 짧게 제한
            )
            ai_text = (completion.choices[0].message.content or "").strip()
        except Exception as exc:  # API 오류, 네트워크 오류 등 전부 포함
            raise AIWarmupError(f"AI 응답 생성에 실패했습니다: {exc}") from exc

        # ── AI 답변도 대화 기록에 저장(다음 turn 문맥 유지용) ──
        with self._lock:
            self._histories[session_id].append({"role": "assistant", "content": ai_text})
            # 학생 발화 수 = user 역할 메시지 개수
            turn_count = sum(1 for m in self._histories[session_id] if m["role"] == "user")

        return WarmupResponse(session_id=session_id, ai_response=ai_text, turn_count=turn_count)

    # ── 3-4. 오래된 대화 자르기(시스템 프롬프트 1줄은 항상 보존) ──
    def _trim_history(self, session_id: str) -> None:
        history = self._histories[session_id]
        # user/assistant 메시지가 (MAX_TURNS_KEPT*2) 를 넘으면 오래된 것부터 제거.
        limit = self.MAX_TURNS_KEPT * 2
        if len(history) - 1 > limit:  # -1: 맨 앞 system 메시지 제외
            system_msg = history[0]
            recent = history[-limit:]
            self._histories[session_id] = [system_msg, *recent]

    # ── 3-5. 세션 종료 시 기록 비우기(선택적으로 호출) ──
    def clear_session(self, session_id: str) -> None:
        """수업이 끝나면 해당 세션의 대화 기록을 지워 메모리를 정리합니다."""
        with self._lock:
            self._histories.pop(session_id, None)


# 앱 전체에서 공유하는 단일 엔진 인스턴스(세션 기록을 한곳에 모으기 위함).
engine = PreClassAIEngine()
