# -*- coding: utf-8 -*-
"""
database.py — 데이터베이스 연결/세션 설정 (SQLAlchemy)

[이 파일이 하는 일]
  1) 데이터베이스에 연결하는 '엔진(engine)'을 만듭니다.
  2) 요청마다 잠깐 열었다 닫는 'DB 세션(SessionLocal)'을 만듭니다.
  3) 모든 ORM 모델이 상속할 부모 클래스 'Base' 를 제공합니다.
  4) FastAPI 라우터에서 Depends 로 주입해 쓰는 get_db() 를 제공합니다.

[DB 종류 바꾸는 법]
  - 기본값은 로컬 SQLite 파일(app/mangoi_backend.db) 입니다. 설치 없이 바로 실행됩니다.
  - 운영에서는 환경변수 DATABASE_URL 만 바꾸면 됩니다.
      예) MySQL      : mysql+pymysql://user:pw@host:3306/mangoi
          PostgreSQL : postgresql+psycopg2://user:pw@host:5432/mangoi
"""

import os

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# ── 1. 접속 주소 결정 ────────────────────────────────────────────
# 환경변수 DATABASE_URL 이 있으면 그걸 쓰고, 없으면 로컬 SQLite 파일을 씁니다.
# (같은 폴더(app/)에 mangoi_backend.db 파일이 자동 생성됩니다.)
_DEFAULT_SQLITE = "sqlite:///" + os.path.join(os.path.dirname(__file__), "mangoi_backend.db")
DATABASE_URL = os.getenv("DATABASE_URL", _DEFAULT_SQLITE)

# [Postgres 호환] Render/Railway/Heroku 등이 주는 주소는 'postgres://' 로 시작하는데,
# SQLAlchemy 2.0 은 'postgresql://' 만 인식합니다. 자동으로 바꿔줍니다.
# (psycopg2-binary 가 설치돼 있으면 postgresql://... 는 그대로 접속됩니다.)
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# ── 2. 엔진 생성 ────────────────────────────────────────────────
# SQLite 는 기본적으로 '한 스레드'만 접근을 허용하므로,
# FastAPI(여러 요청 동시 처리)에서 쓰려면 check_same_thread=False 가 필요합니다.
# (SQLite 가 아닐 때는 이 옵션이 필요 없어서 조건부로 넣습니다.)
_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=_connect_args, pool_pre_ping=True)

# ── 3. 세션 팩토리 ──────────────────────────────────────────────
# SessionLocal() 을 호출하면 DB와 대화할 '세션' 하나가 만들어집니다.
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)

# ── 4. 모든 모델의 부모(Base) ───────────────────────────────────
# 예) class StudentStreak(Base): ...  처럼 상속해서 테이블을 정의합니다.
Base = declarative_base()


# ── 5. FastAPI 의존성 주입용 세션 제공 함수 ─────────────────────
def get_db():
    """
    요청이 들어오면 DB 세션을 하나 열어주고,
    응답이 끝나면(성공/실패 상관없이) 반드시 닫아줍니다.
    라우터에서는 `db: Session = Depends(get_db)` 형태로 받아 씁니다.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
