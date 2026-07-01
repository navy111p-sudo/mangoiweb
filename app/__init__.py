# -*- coding: utf-8 -*-
"""
app 패키지 — 망고아이(Mangoi) FastAPI 백엔드 서비스

[이 서비스가 하는 일]
  망고아이 메인 서비스는 Cloudflare Workers(JS) 기반이지만,
  이 `app/` 은 파이썬(FastAPI)으로 만든 "별도 마이크로 서비스" 입니다.
  다음 두 가지 기능을 담당합니다.

    1) 스픽(Speak)식 연속 학습(불꽃 streak) + 일일 복습 퀴즈
       → app/routers/streak.py
    2) 원어민 수업 10분 전 AI 웜업 롤플레이(영어 대화 친구)
       → app/services/ai_warmup.py  +  app/routers/warmup.py

[기존 망고아이와의 관계]
  - 학생 식별자는 기존 D1 테이블 `students_erp.user_id`(TEXT)와 동일한 값을 그대로 사용합니다.
    그래서 이 서비스의 student_id 에 기존 학생 ID를 그대로 넣으면 바로 연동됩니다.
  - Workers(JS) 쪽에서는 이 파이썬 서비스의 REST API를 fetch 로 호출하면 됩니다.
"""
