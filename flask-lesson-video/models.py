# -*- coding: utf-8 -*-
"""
models.py — 데이터베이스 모델 정의 (SQLAlchemy ORM)

[이 파일이 하는 일]
  - '교재(Book)' 테이블을 파이썬 클래스로 정의합니다.
  - 여기에 예습/복습 동영상 주소를 담는 `video_url` 필드를 추가합니다.

[ORM 이란?]
  - ORM(Object Relational Mapping)은 '데이터베이스 표(table)'를 '파이썬 클래스'로,
    '표의 한 줄(row)'을 '객체(object)'로 다루게 해주는 기술입니다.
  - 즉, SQL 문을 직접 안 쓰고도 파이썬 코드로 DB를 다룰 수 있어요.
"""

from datetime import datetime
from flask_sqlalchemy import SQLAlchemy

# SQLAlchemy 객체 생성 (실제 앱과의 연결은 app.py 에서 db.init_app(app) 으로 함)
db = SQLAlchemy()


class Book(db.Model):
    """교재(Book) 테이블 — 한 권의 교재 = 이 클래스의 객체 1개"""

    # 실제 DB에 만들어질 표 이름
    __tablename__ = "books"

    # ── 기본 컬럼들 ─────────────────────────────────────────────
    # id: 각 교재를 구분하는 고유 번호(자동 증가). 기본키(primary key).
    id = db.Column(db.Integer, primary_key=True)

    # title: 교재 제목 (예: "Mangoi Starter Unit 3")
    title = db.Column(db.String(200), nullable=False)

    # unit: 진도/단원 정보 (예: "Lesson 5", "3과")
    unit = db.Column(db.String(100))

    # level: 레벨 (예: "Lv 1", "B2", "초급")
    level = db.Column(db.String(50))

    # publisher: 출판사 (예: "다락원", "망고아이") — 실제 교재 표의 '출판사' 컬럼과 매칭
    publisher = db.Column(db.String(100))

    # ── 🎬 이번에 새로 추가하는 핵심 컬럼 ───────────────────────
    # video_url: 예습/복습 동영상의 '주소'를 저장합니다.
    #   - 외부 URL 도 가능:  "https://cdn.mangoi.com/videos/u3_preview.mp4"
    #   - 서버 내부 파일도 가능: "/static/videos/u3_preview.mp4"
    #   - 비워둘 수도 있으므로 nullable=True (값이 없으면 동영상 없음으로 처리)
    video_url = db.Column(db.String(500), nullable=True)

    # video_type: 이 동영상이 '예습(preview)'인지 '복습(review)'인지 표시 (선택 사항)
    video_type = db.Column(db.String(20), default="preview")

    # video_title: 동영상 제목 (화면에 안내 문구로 보여줄 때 사용, 선택 사항)
    video_title = db.Column(db.String(200), nullable=True)

    # created_at: 이 교재가 등록된 시각 (자동 기록)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        """
        이 교재 객체를 '파이썬 딕셔너리(dict)'로 변환합니다.
        → 나중에 jsonify() 로 JSON 응답을 만들 때 편리합니다.
        """
        return {
            "id": self.id,
            "title": self.title,
            "unit": self.unit,
            "level": self.level,
            "publisher": self.publisher,
            "video_url": self.video_url,
            "video_type": self.video_type,
            "video_title": self.video_title,
        }

    def __repr__(self):
        # 디버깅 시 객체를 출력하면 보기 좋게 표시됩니다.
        return f"<Book {self.id} {self.title}>"
