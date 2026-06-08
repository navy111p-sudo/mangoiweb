# 망고아이 — 교재 예습/복습 동영상 자동 매칭 (Flask 예제)

수업방에서 교재를 열면, 그 교재에 연결된 3~5분짜리 예습/복습 동영상이
자동으로 매칭되어 화면에 함께 재생됩니다.

## 구성 파일
- `models.py` — 교재(Book) 모델. **`video_url` 필드 추가**가 핵심.
- `app.py` — Flask 앱 + API 라우트 `/api/get-lesson-video/<book_id>`.
- `templates/classroom.html` — 수업 화면. `fetch` 로 영상 주소를 받아 `<video>` 자동재생(음소거).

## 실행 방법
```bash
pip install flask flask_sqlalchemy
python app.py
```
브라우저에서 접속:
- 동영상 있는 교재: http://127.0.0.1:5000/classroom/1
- 동영상 없는 교재(안내 표시): http://127.0.0.1:5000/classroom/3
- API 직접 확인: http://127.0.0.1:5000/api/get-lesson-video/1

## 동작 흐름
1. 수업방(`/classroom/<id>`) 입장 → 페이지의 JS가 `fetch('/api/get-lesson-video/<id>')` 호출
2. Flask가 교재를 찾아 `video_url` 을 JSON 으로 반환
3. JS가 `video.src = video_url` 로 넣고 `muted + autoplay` 로 자동재생
4. 사용자가 “🔊 소리 켜기”를 누르면 음소거 해제

## 내 기존 교재 테이블에 붙이기
- 이미 `Book` 테이블이 있다면, 컬럼만 추가하면 됩니다(데이터 보존):
  ```sql
  ALTER TABLE books ADD COLUMN video_url   VARCHAR(500);
  ALTER TABLE books ADD COLUMN video_type  VARCHAR(20) DEFAULT 'preview';
  ALTER TABLE books ADD COLUMN video_title VARCHAR(200);
  ```
- `video_url` 에는 외부 URL(`https://...mp4`) 또는 서버 파일 경로(`/static/videos/xxx.mp4`)를 저장.
- 진도(단원)별로 다른 영상을 주고 싶으면, 교재를 단원 단위로 나누거나
  별도 `lesson_videos(book_id, unit, video_url)` 테이블을 만들어 매칭하면 됩니다.

## 자동재생(크롬 정책) 참고
- 크롬은 **소리 나는 영상의 자동재생은 차단**, **음소거 영상의 자동재생은 허용**합니다.
- 그래서 `<video autoplay muted playsinline>` 로 시작하고, 사용자 클릭 시 소리를 켭니다.
