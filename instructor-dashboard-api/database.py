"""
database.py
==========================================================================
Neo4j 드라이버 초기화, 커넥션 풀링, 세션 수명 관리를 담당하는 모듈.

핵심 원칙
- 드라이버는 애플리케이션 전체에서 "단 하나"만 생성한다. (Neo4j 공식 권장)
  드라이버 내부에 커넥션 풀이 들어있으므로 요청마다 새로 만들면 안 된다.
- 세션은 요청 단위로 짧게 열고, 반드시 컨텍스트 매니저(with)로 닫는다.
  -> 커넥션 누수(leak) 방지.
==========================================================================
"""

import os
import logging
from contextlib import contextmanager
from typing import Iterator, Optional

from dotenv import load_dotenv
from neo4j import GraphDatabase, Driver, Session
from neo4j.exceptions import Neo4jError, ServiceUnavailable

# .env 파일에서 환경 변수 로드
load_dotenv()

logger = logging.getLogger("mangoi.database")


class Neo4jDatabase:
    """
    Neo4j 연결을 감싸는 얇은 래퍼 클래스.
    앱 시작 시 connect(), 종료 시 close()를 호출하여 드라이버 수명을 관리한다.
    """

    def __init__(self) -> None:
        # 환경 변수에서 접속 정보 읽기 (없으면 로컬 기본값)
        self._uri: str = os.getenv("NEO4J_URI", "bolt://localhost:7687")
        self._user: str = os.getenv("NEO4J_USERNAME", "neo4j")
        self._password: str = os.getenv("NEO4J_PASSWORD", "password")
        self._driver: Optional[Driver] = None

    # ---------------------------------------------------------------------
    # 드라이버 수명 관리
    # ---------------------------------------------------------------------
    def connect(self) -> None:
        """
        드라이버(=커넥션 풀)를 생성한다. 앱 기동 시 1회만 호출.
        max_connection_pool_size 등으로 풀 크기를 튜닝할 수 있다.
        """
        if self._driver is not None:
            return  # 이미 연결됨 (중복 생성 방지)

        self._driver = GraphDatabase.driver(
            self._uri,
            auth=(self._user, self._password),
            # 커넥션 풀 설정: 동시 요청이 많은 대시보드 API에 맞게 여유 있게 설정
            max_connection_pool_size=50,
            connection_acquisition_timeout=30,  # 풀에서 커넥션 확보 대기(초)
            max_connection_lifetime=3600,        # 커넥션 최대 수명(초)
        )

        # 접속 가능 여부를 즉시 검증하여 잘못된 설정을 조기에 발견
        try:
            self._driver.verify_connectivity()
            logger.info("Neo4j 연결 성공: %s", self._uri)
        except ServiceUnavailable as exc:
            logger.error("Neo4j 서버에 연결할 수 없습니다: %s", exc)
            raise

    def close(self) -> None:
        """드라이버를 안전하게 종료한다. 앱 종료 시 1회만 호출."""
        if self._driver is not None:
            self._driver.close()
            self._driver = None
            logger.info("Neo4j 연결을 종료했습니다.")

    # ---------------------------------------------------------------------
    # 세션 제공 (컨텍스트 매니저)
    # ---------------------------------------------------------------------
    @contextmanager
    def session(self, **kwargs) -> Iterator[Session]:
        """
        with 문으로 사용하는 세션 컨텍스트 매니저.
        블록을 벗어나면 예외 발생 여부와 무관하게 세션이 자동으로 닫힌다.

        사용 예:
            with db.session() as s:
                s.execute_read(...)
        """
        if self._driver is None:
            # 드라이버가 아직 준비되지 않은 상태에서의 호출을 명확한 에러로 안내
            raise RuntimeError(
                "Neo4j 드라이버가 초기화되지 않았습니다. connect()를 먼저 호출하세요."
            )

        session = self._driver.session(**kwargs)
        try:
            yield session
        finally:
            # 커넥션 누수 방지: 반드시 닫는다.
            session.close()

    def verify(self) -> bool:
        """헬스체크용. 연결이 살아있는지 확인."""
        if self._driver is None:
            return False
        try:
            self._driver.verify_connectivity()
            return True
        except (Neo4jError, ServiceUnavailable):
            return False


# 애플리케이션 전역에서 공유하는 단일 인스턴스
db = Neo4jDatabase()
