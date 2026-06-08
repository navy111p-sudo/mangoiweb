# -*- coding: utf-8 -*-
"""
app.py — Flask 메인 애플리케이션

[이 파일이 하는 일]
  1) Flask 앱과 데이터베이스를 연결합니다.
  2) 교재 id 를 받아 그 교재의 정보 + 동영상 주소(video_url)를 JSON 으로 돌려주는
     API 엔드포인트(/api/get-lesson-video/<book_id>)를 만듭니다.
  3) 수업 화면(classroom.html)을 보여주는 페이지 라우트를 만듭니다.
  4) 처음 실행 시 테스트용 교재 데이터를 자동으로 넣어줍니다(seed).

[실행 방법]
  $ pip install flask flask_sqlalchemy
  $ python app.py
  브라우저에서  http://127.0.0.1:5000/classroom/1  접속
"""

from flask import Flask, jsonify, render_template
from models import db, Book

# ── 1. Flask 앱 생성 및 설정 ────────────────────────────────────
app = Flask(__name__)

# 데이터베이스 파일 위치 지정 (여기서는 간단히 SQLite 파일 하나 사용)
#   - 실제 운영에서는 MySQL/PostgreSQL 주소로 바꾸면 됩니다.
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///mangoi.db"
# 불필요한 경고를 끄는 설정 (성능에 영향 없음)
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

# models.py 에서 만든 db 객체를 이 앱과 연결
db.init_app(app)


# ── 2. 핵심 API: 교재 id → 동영상 정보 반환 ─────────────────────
@app.route("/api/get-lesson-video/<int:book_id>")
def get_lesson_video(book_id):
    """
    수업방 입장 시 프론트엔드가 호출하는 API.
    예) GET /api/get-lesson-video/1

    동작:
      - book_id 로 교재를 찾는다.
      - 교재가 없으면 404 + 실패 메시지.
      - 교재는 있는데 동영상이 없으면 has_video=False 로 알려준다.
      - 동영상이 있으면 교재 정보 + video_url 을 JSON 으로 돌려준다.
    """

    # (1) book_id 로 교재 한 권을 데이터베이스에서 찾는다.
    #     - SQLAlchemy 2.x: db.session.get(Book, book_id)
    book = db.session.get(Book, book_id)

    # (2) 교재가 존재하지 않는 경우 → 404 응답
    if book is None:
        return jsonify({
            "success": False,
            "message": f"{book_id}번 교재를 찾을 수 없습니다."
        }), 404

    # (3) 교재는 있지만 매칭된 동영상이 없는 경우
    #     → 프론트엔드가 '동영상 없음'을 자연스럽게 처리할 수 있게 알려준다.
    if not book.video_url:
        return jsonify({
            "success": True,
            "has_video": False,
            "book": book.to_dict(),
            "message": "이 교재에는 연결된 예습/복습 동영상이 아직 없습니다."
        })

    # (4) 정상: 교재 정보 + 동영상 주소를 함께 반환
    return jsonify({
        "success": True,
        "has_video": True,
        "book": book.to_dict(),        # 교재 제목·레벨·단원 등
        "video_url": book.video_url,   # ★ 프론트가 <video src> 에 넣을 주소
        "video_type": book.video_type,         # 'preview'(예습) / 'review'(복습)
        "video_title": book.video_title or book.title
    })


# ── 3. 수업 화면 페이지 ─────────────────────────────────────────
@app.route("/classroom/<int:book_id>")
def classroom(book_id):
    """
    수업방 화면을 보여준다.
    templates/classroom.html 을 렌더링하면서, 현재 열려는 교재 id 를 넘겨준다.
    프론트엔드 JS 가 이 id 로 위의 API 를 호출한다.
    """
    return render_template("classroom.html", book_id=book_id)


# ── 4. 첫 실행 시 테스트 데이터 자동 입력 (seed) ────────────────
def init_db_and_seed():
    """테이블을 만들고, 비어 있으면 예시 교재 몇 개를 넣어준다."""
    with app.app_context():
        db.create_all()  # books 테이블이 없으면 생성

        # 이미 데이터가 있으면 중복 입력하지 않음
        if Book.query.first() is None:
            samples = [
                Book(
                    title="BTS 1 001 (Welcome to school)",
                    unit="Lesson 1", level="Lv 1", publisher="망고아이",
                    video_type="preview",
                    video_title="예습 영상 — Welcome to school",
                    # 예시용 공개 샘플 영상 (실제로는 망고아이 CDN 주소를 넣으면 됩니다)
                    video_url="https://www.w3schools.com/html/mov_bbb.mp4",
                ),
                Book(
                    title="BTS 10 Korea (Weather)",
                    unit="Lesson 10", level="Lv 10", publisher="망고아이",
                    video_type="review",
                    video_title="복습 영상 — Weather",
                    video_url="https://www.w3schools.com/html/movie.mp4",
                ),
                Book(
                    # 동영상이 아직 없는 교재 예시 (has_video=False 동작 확인용)
                    title="007. Commercials",
                    unit="Lesson 7", level="-", publisher="다락원",
                    video_url=None,
                ),
            ]
            db.session.add_all(samples)
            db.session.commit()
            print("✅ 테스트용 교재 데이터를 넣었습니다. (id 1,2,3)")


# ── 5. 앱 실행 ──────────────────────────────────────────────────
if __name__ == "__main__":
    init_db_and_seed()          # DB 준비 + 테스트 데이터
    # debug=True 는 개발용 (코드 저장 시 자동 새로고침). 실제 배포에서는 False 권장.
    app.run(debug=True)
