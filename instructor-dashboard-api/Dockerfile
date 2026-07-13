# Mangoi 강사 대시보드 API — 컨테이너 이미지
# 참고: 이 FastAPI(Python) 앱은 Cloudflare Workers에서 실행되지 않습니다.
#       컨테이너 호스팅(Fly.io / Render / Railway / cafe24 서버 등)에 배포하고,
#       격주 리포트는 deploy/ 의 크론이 이 앱의 /api/v1/reports/run 을 호출합니다.
FROM python:3.11-slim

WORKDIR /app

# 의존성 먼저 설치(레이어 캐시)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 앱 소스
COPY . .

# 접속 정보는 런타임 환경변수로 주입 (.env 는 이미지에 포함하지 않음)
ENV SEED_ON_STARTUP=false \
    ENABLE_SCHEDULER=false \
    REPORT_CADENCE_DAYS=14 \
    REPORT_WINDOW_DAYS=28

EXPOSE 8000

# 프로덕션: reload 없이 uvicorn 구동
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
