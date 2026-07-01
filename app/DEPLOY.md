# 🚀 망고아이 FastAPI 백엔드 배포 가이드

이 문서는 `app/` FastAPI 백엔드(스픽식 불꽃 streak + AI 웜업)를 실제 서버에 올리는
단계별 안내입니다. **Render** 또는 **Railway** 중 하나만 고르면 됩니다. 둘 다 GitHub 레포를
연결하면 자동으로 빌드·배포되고, 공개 URL(https://...)을 줍니다.

> 준비물: ① GitHub 계정(이 레포), ② OpenAI API 키(https://platform.openai.com/api-keys)

---

## 0. 이 배포에 쓰이는 파일들

| 파일 | 역할 |
|---|---|
| `Dockerfile` | python:3.11-slim 이미지, uvicorn 으로 `app.main:app` 실행, `$PORT` 대응 |
| `.dockerignore` | 이미지에 불필요/비밀 파일 제외 |
| `render.yaml` | Render Blueprint 배포 설정(헬스체크 `/health`, 환경변수) |
| `railway.json` | Railway 배포 설정(Dockerfile 빌드, 헬스체크) |
| `Procfile` | `web: uvicorn ...` — Railway/Heroku 계열 공통 실행 명령 |
| `app/.env.example` | 환경변수 예시(복사해서 값 채우기) |

---

## 1-A. Render 로 배포 (권장, 웹 UI 만으로 완료)

1. https://render.com 로그인 → **New** → **Blueprint**.
2. 이 GitHub 레포를 선택. Render 가 `render.yaml` 을 자동 인식합니다.
3. **Apply** 하면 `mangoi-backend` 웹 서비스가 생성됩니다.
4. 서비스 → **Environment** 탭에서 값 입력(아래 [2. 환경변수] 참고):
   - `OPENAI_API_KEY` = 본인 키 (필수)
   - `DATABASE_URL` = (선택, 비우면 SQLite)
   - `CORS_ALLOW_ORIGINS` = 기본값 그대로 두거나 프론트 도메인으로 조정
5. 저장하면 자동 재배포. 완료되면 상단에 **공개 URL**(예: `https://mangoi-backend.onrender.com`)이 뜹니다.

> 무료 플랜은 트래픽이 없으면 잠들었다가 첫 요청에 몇 초 지연될 수 있습니다.

## 1-B. Railway 로 배포 (대안)

1. https://railway.app 로그인 → **New Project** → **Deploy from GitHub repo** → 이 레포 선택.
2. Railway 가 `railway.json`/`Dockerfile` 을 인식해 빌드합니다.
3. **Variables** 탭에서 환경변수 입력(아래 [2] 참고). `OPENAI_API_KEY` 필수.
4. **Settings → Networking → Generate Domain** 으로 공개 URL 을 만듭니다
   (예: `https://mangoi-backend-production.up.railway.app`).

---

## 2. 환경변수 (입력 위치: Render=Environment / Railway=Variables)

| 키 | 필수 | 설명 |
|---|:--:|---|
| `OPENAI_API_KEY` | ✅ | OpenAI 키. AI 웜업 대화에 사용. |
| `DATABASE_URL` | ⬜ | 비우면 SQLite(재배포 시 초기화). 영구 저장은 Postgres 주소. |
| `CORS_ALLOW_ORIGINS` | ⬜ | 콤마 구분 허용 도메인. 미설정 시 망고아이 기본 도메인 허용. |
| `OPENAI_WARMUP_MODEL` | ⬜ | 웜업 모델(기본 `gpt-4o-mini`). |

> `$PORT` 는 Render/Railway 가 **자동으로** 넣어줍니다. 직접 설정하지 마세요.

---

## 3. 배포 후 동작 확인

브라우저에서 공개 URL 뒤에 아래를 붙여 확인하세요.

- `.../health` → `{"status":"ok"}` 가 보이면 정상 기동.
- `.../docs` → Swagger 문서에서 `/api/streak/*`, `/api/warmup/chat` 를 직접 테스트 가능.

---

## 4. 프론트(망고아이 웹)에 연결하기

배포로 받은 공개 URL 을 `<배포URL>` 이라고 할 때:

### ① 웜업 페이지 — 가장 간단
```
https://test.mangoi.co.kr/warmup.html?api=<배포URL>
```
`?api=` 로 한 번 열면 브라우저에 저장되어 다음부터는 그냥 `warmup.html` 로 들어가도 됩니다.
수업방·교재까지 연결하려면:
```
https://test.mangoi.co.kr/warmup.html?api=<배포URL>&room=<room_id>&unit=<교재unit>
```

### ② 학습 불꽃 서버 동기화 — 페이지에서 지정
게임 스트릭을 서버에도 저장하려면, 페이지 로드시 아래 중 하나를 설정:
```html
<script>window.MANGOI_API_BASE = '<배포URL>';</script>
```
또는 콘솔/코드에서:
```js
MangoiStreak.setApiBase('<배포URL>');   // localStorage 에 저장되어 계속 적용
```
미설정 시에도 스트릭은 localStorage 로 정상 동작하며, 설정하면 추가로
`POST <배포URL>/api/streak/complete-quiz` 로 조용히 동기화됩니다.

---

## 5. (선택) Postgres 붙여서 데이터 영구 저장

SQLite 는 재배포 때 초기화되므로, 실제 운영은 Postgres 를 권장합니다.

**Render**
1. Dashboard → **New** → **PostgreSQL** 생성(무료 플랜 가능).
2. 생성된 DB 의 **Internal Database URL** 복사.
3. 웹 서비스 → Environment → `DATABASE_URL` 에 붙여넣기 → 재배포.
   (또는 `render.yaml` 하단의 `databases:` 주석을 풀어 자동 연결.)

**Railway**
1. 프로젝트에서 **New** → **Database** → **Add PostgreSQL**.
2. Postgres 서비스의 **Variables** 에 있는 `DATABASE_URL` 을 참조(백엔드 서비스 Variables 에
   `DATABASE_URL=${{Postgres.DATABASE_URL}}` 형태로 연결).

> 코드가 `postgres://` → `postgresql://` 변환과 `psycopg2-binary` 드라이버를 이미 처리하므로,
> URL 만 넣으면 표(테이블)는 서버 기동 시 자동 생성됩니다.

---

## 6. 로컬에서 먼저 테스트하고 싶다면

```bash
pip install -r requirements.txt
cp app/.env.example app/.env      # 값 채우기(OPENAI_API_KEY 등)
# PowerShell:  $env:OPENAI_API_KEY="sk-..."
uvicorn app.main:app --reload --port 8010
# → http://127.0.0.1:8010/docs 에서 확인
# → 프론트 연결: warmup.html?api=http://127.0.0.1:8010
```

도커로 로컬 확인:
```bash
docker build -t mangoi-backend .
docker run -p 8010:8010 -e OPENAI_API_KEY=sk-... mangoi-backend
```
