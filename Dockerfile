# ============================================================================
#  Dockerfile — 망고아이 FastAPI 백엔드(app/) 컨테이너 이미지
# ----------------------------------------------------------------------------
#  파이썬 3.11 슬림 이미지를 기반으로 의존성을 설치하고 uvicorn 으로 실행합니다.
#  호스팅사가 주는 $PORT 를 그대로 사용합니다(없으면 8010).
# ============================================================================
FROM python:3.11-slim

# 파이썬 로그가 버퍼링 없이 바로 출력되도록(배포 로그 확인 편의)
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# psycopg2-binary 등은 휠(wheel)로 설치되므로 별도 빌드도구는 대체로 불필요.
# 먼저 requirements 만 복사해서 캐시 레이어를 활용(코드만 바뀔 때 재설치 방지).
COPY requirements.txt ./
RUN pip install --upgrade pip && pip install -r requirements.txt

# 애플리케이션 코드 복사 (app/ 패키지)
COPY app ./app

# 문서/참고용 노출 포트(실제 바인딩은 아래 CMD 의 $PORT)
EXPOSE 8010

# $PORT 가 있으면 그 포트로, 없으면 8010 으로 실행.
# (sh -c 로 감싸야 ${PORT:-8010} 환경변수 치환이 동작합니다.)
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8010}"]
