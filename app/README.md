# 망고아이 학습 백엔드 (FastAPI)

망고아이 메인 서비스는 **Cloudflare Workers(JS)** 기반이지만, 이 `app/` 은
파이썬 **FastAPI** 로 만든 **별도 마이크로 서비스**입니다. 두 가지 학습 기능을 담당합니다.

1. **스픽(Speak)식 연속 학습(불꽃 🔥) + 일일 복습 퀴즈** — `app/routers/streak.py`
2. **원어민 수업 10분 전 AI 웜업 롤플레이** — `app/services/ai_warmup.py` + `app/routers/warmup.py`

---

## 폴더 구조

```
app/
├── main.py              # FastAPI 진입점 (라우터 연결, DB 테이블 생성, /docs)
├── database.py          # SQLAlchemy 엔진/세션/Base (기본 SQLite, 환경변수로 교체)
├── routers/
│   ├── streak.py        # 불꽃 streak + 일일 퀴즈 API + StudentStreak 모델
│   └── warmup.py        # AI 웜업 대화 API
└── services/
    └── ai_warmup.py     # PreClassAIEngine (OpenAI, 세션별 대화 문맥 유지)
requirements.txt         # 의존 패키지
```

## 실행 방법

```bash
pip install -r requirements.txt

# (AI 웜업 사용 시) OpenAI 키 설정
#   PowerShell : $env:OPENAI_API_KEY="sk-..."
#   bash       : export OPENAI_API_KEY=sk-...

uvicorn app.main:app --reload --port 8010
```

- 대화형 API 문서: <http://127.0.0.1:8010/docs>
- 헬스체크: <http://127.0.0.1:8010/health>

DB는 기본적으로 `app/mangoi_backend.db`(SQLite)가 자동 생성됩니다.
운영에서는 환경변수 `DATABASE_URL` 만 바꾸면 MySQL/PostgreSQL로 전환됩니다.

---

## API 요약

### 불꽃 streak
| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/streak/{student_id}` | 현재 불꽃 수 + 오늘 퀴즈 완료 여부 조회 |
| POST | `/api/streak/complete-quiz` | 오늘 복습 퀴즈 완료 기록(불꽃 갱신) — body: `{"student_id":"..."}` |

**불꽃 계산 규칙(자정 기준):** 어제 활동 → +1 / 오늘 이미 완료 → 유지 / 이틀 이상 끊김 → 1로 리셋. `longest_streak`는 항상 최고 기록 보존.

### AI 웜업
| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/api/warmup/chat` | 학생 발화 → AI 답변(세션 문맥 유지) — body: `{"session_id":"...","student_input":"...","lesson_topic":"..."}` |
| DELETE | `/api/warmup/{session_id}` | 수업 종료 시 세션 대화 기록 정리 |

---

## 기존 망고아이와의 통합/연동 포인트

- **학생 식별자 통일**: `student_id` 는 기존 D1 `students_erp.user_id`(TEXT)와 **같은 값**을
  그대로 사용합니다. 별도 매핑 없이 바로 연동됩니다.
- **게임/퀴즈 완료 → 불꽃 유지**: 기존 `student-games.html`·복습퀴즈를 다 풀었을 때
  Workers(JS)에서 `POST /api/streak/complete-quiz` 를 호출하도록 연결하면,
  "게임 완료 = 오늘의 학습 달성 = 불꽃 유지"로 자연스럽게 이어집니다.
- **화상수업 방 = 웜업 세션**: 웜업의 `session_id` 에 기존 화상수업 `room_id`/예약 ID를
  넣으면 수업방과 워밍업 대화가 1:1로 매칭됩니다. `lesson_topic` 에 교재 unit을 넣으면
  워밍업이 실제 레슨과 이어집니다.
