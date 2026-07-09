# 망고아이 유지보수 매뉴얼 (오너용)

> 이 문서는 "개발자 없이 혼자 관리해야 하는 사람"을 위한 최상위 안내서입니다.
> 상세 문서: [환경변수·시크릿 목록](docs/ENVIRONMENT.md) · [문제 해결 가이드](docs/TROUBLESHOOTING.md) · [코드 분리 계획](docs/REFACTOR_PLAN.md)

최종 갱신: 2026-07-09

---

## 1. 한 줄 요약

**실서비스는 `cloudflare-deploy/` 폴더 하나입니다.** 나머지 폴더 대부분은 보조 프로젝트, 실험, 레거시, 문서 제작용입니다. 헷갈리면 `cloudflare-deploy/` 밖은 건드리지 마세요.

- 운영 주소: **mango-i.com** → Cloudflare Worker `webrtc-unified-platform-prod`
- 배포 방법: 리포 루트에서 `deploy.ps1` 실행 (또는 `배포하기.bat` 더블클릭)

## 2. 폴더 지도 — 어디가 뭐고, 건드려도 되는가

| 폴더 | 정체 | 직접 수정 |
|---|---|---|
| `cloudflare-deploy/` | **실서비스 전체** (워커 백엔드 + 웹 화면) | ⚠️ 아래 3번 참조 |
| `cloudflare-deploy/public/` | 웹 화면 (index.html, admin.html, 게임 등) | ⚠️ 텍스트·이미지 정도만 |
| `cloudflare-deploy/src/` | 백엔드 API (TypeScript) | ❌ 개발자 영역 |
| `mangoi-ai-avatar-cf/` | AI 상담직원 별도 워커 (정본 소스) | ❌ 개발자 영역 |
| `instructor-dashboard-api/` | 강사 성장리포트 백엔드 (Python/FastAPI + Neo4j) | ❌ 개발자 영역 |
| `mobile-app/` | 안드로이드 앱 래퍼 | ❌ 개발자 영역 |
| `modules/`, `public/`, `server.js` | 초기 통합 전 레거시 (지금 운영에 안 씀) | 🚫 무시. 지우지도 말 것 |
| `망고아이_사용설명서/` | 사용설명서 제작 파이프라인 | ✅ 자유 |
| `망고아이 테스트와 배포/` | 백업·가이드 모음 | ✅ 자유 (백업이므로 삭제 주의) |
| `docs/`, `*.md` | 문서 | ✅ 자유 |
| `.claude/worktrees/` | AI 작업용 임시 복사본 | 🚫 무시 |

## 3. 내가 직접 바꿔도 되는 것 vs 개발자가 해야 하는 것

### ✅ 관리자 화면(admin.html 접속)에서 바로 가능 — 코드 수정 불필요
- 공지·팝업·포스터: 📢 공지 스튜디오
- 권한 설정: 권한 매트릭스 (역할별 73개 카드 on/off)
- 자료실 방/비밀번호, 매뉴얼 파일
- 학생·강사·정산·리텐션 관련 운영 데이터 전부

### ✅ 파일을 열어 고쳐도 비교적 안전한 것 (고친 뒤 반드시 배포)
- 화면의 **문구, 안내 텍스트** (`cloudflare-deploy/public/*.html` — 단, `data-ko` 속성이 있는 곳은 짝 유지)
- 이미지 교체 (`cloudflare-deploy/public/img/` — 같은 파일명으로 덮어쓰기)
- `cloudflare-deploy/wrangler.toml`의 `[vars]` 값 (예: `MAX_RECORDING_MB`)
  - 주의: `[env.production]` 쪽에도 **같은 값이 한 벌 더** 있음. 둘 다 고쳐야 함.

### ❌ 개발자(또는 AI에게 맡기고 검증) 영역
- `cloudflare-deploy/src/` 전체 — 특히 `index.ts`(라우팅), `api-mango.ts`(API 1.2만 줄), Durable Object 파일들(`video-call-room.ts`, `signaling-room.ts` — **SignalingRoom 삭제 금지**, 진단페이지가 사용)
- `public/index.html`·`admin.html` 안의 `<script>` 로직
- `sw.js` (서비스워커 — 잘못 고치면 전 사용자 화면이 옛 버전에 갇힘)
- `deploy.ps1` 자체
- 시크릿 변경 (방법은 [ENVIRONMENT.md](docs/ENVIRONMENT.md))

## 4. 설치 · 실행 · 배포

### 처음 세팅 (새 PC)
```powershell
# 1) Node.js LTS 설치 후
cd C:\Users\Admin\Desktop\mangoi_develop2-main\cloudflare-deploy
npm install
# 2) Cloudflare 로그인 (브라우저 열림)
npx wrangler@latest login
```

### 배포 (정본 절차)
```powershell
# 리포 루트에서
.\deploy.ps1        # 또는 배포하기.bat 더블클릭
```
`deploy.ps1`이 하는 일: git 잠금 정리 → 캐시 삭제 → 빌드스탬프·서비스워커 버전 갱신 → HTML에 BUILD 주석 삽입 → git commit+push → **워커 2개(기본 + `-prod`) 모두 배포**.

- **`-prod`까지 배포돼야 실제 사용자 화면이 바뀝니다** (운영 도메인이 -prod 워커).
- 예약 작업(cron)은 **기본 워커에서만** 돌아갑니다(-prod는 cron 없음, 중복 발송 방지).

### 배포 스크립트가 여러 개인 이유
`deploy.ps1`(루트)가 **정본**입니다. `cloudflare-deploy/` 안의 `deploy-safe.ps1`(스테이징 먼저 배포 후 확인), `deploy-full.ps1`, `git-and-deploy.ps1`은 과거 버전/특수 용도 — 평소엔 쓰지 마세요.

### 로컬에서 미리 보기
```powershell
cd cloudflare-deploy
npx wrangler@latest dev
```
⚠️ Windows에서 wrangler dev가 가끔 크래시함 — 안 되면 그냥 배포 후 -prod가 아닌 기본 워커 주소에서 확인.

## 5. 서비스 구성 요소 (전체 그림)

```
사용자 브라우저 / 안드로이드 앱
        │
        ▼
Cloudflare Worker: webrtc-unified-platform(-prod)   ← cloudflare-deploy/
 ├─ 정적 화면: public/*.html
 ├─ API: src/index.ts → src/api-mango.ts 외
 ├─ D1 (SQLite DB): mango-db          ← 학생·포인트·출석·게임기록 등
 ├─ R2: webrtc-class-recordings       ← 수업 녹화
 ├─ KV: PDF_STORE, SESSION_STATE
 ├─ Durable Objects: VideoCallRoom(화상수업), SignalingRoom(진단용)
 └─ Workers AI: TTS·AI 기능
        │
        ├──▶ 카페24 서버 Neo4j (포트 8880)   ← 그래프 분석: 매칭·이탈·정산·웜업
        ├──▶ SOLAPI                          ← 카카오 알림톡/SMS
        ├──▶ Giftishow                       ← 기프티콘 발송
        └──▶ Typecast / Google TTS           ← 음성 안내

별도 워커: mangoi-ai-avatar-cf (AI 상담직원)
별도 서버: instructor-dashboard-api (FastAPI, 강사 리포트) + mangoi-reports-cron 워커가 격주 호출
매일 밤: 카페24 MySQL → Neo4j → D1 자동 동기화 (cron)
```

## 6. 알려진 미해결 사항 (2026-07-09 기준)

| 항목 | 내용 | 위험도 |
|---|---|---|
| `ROOM_JWT_SECRET` 미설정 | 코드는 참조하지만 시크릿이 안 심어져 있음 | 중 |
| `write-history` API | uid 토큰 인증 미적용 잔여분 | 중 |
| admin ivory(밝은) 테마 | 밝은 글자 위 밝은 배경 약 670곳 — 가독성 미완 | 낮음 |
| `mangoi-reports-cron`의 `API_BASE` | placeholder 값 그대로 | 중 |
| wrangler 버전 불일치 | package.json은 v3, 실제 배포는 `@latest`(v4) | 낮음 |
| 초대형 파일 | admin.html 4만 줄, index.html 2.6만 줄, api-mango.ts 1.2만 줄 | **높음** → [분리 계획](docs/REFACTOR_PLAN.md) |
| D1 자동 새로고침 | 야간 동기화 중 출석/포인트/성적 대용량 미완 | 중 |

## 7. 시연 계정

- 학원장(대리점): `wondang` / 학생: `student` (비밀번호 동일: `mango1234`)

## 8. 문서 인덱스

| 문서 | 내용 |
|---|---|
| [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) | 환경변수·시크릿 전체 목록 + 설정/확인 명령 |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | 증상별 "어디를 봐야 하나" |
| [docs/REFACTOR_PLAN.md](docs/REFACTOR_PLAN.md) | 초대형 파일 분리 계획 (전/후 구조) |
| [cloudflare-deploy/README.md](cloudflare-deploy/README.md) | 워커 기술 상세 (WebSocket 프로토콜 등) |
| [README.md](README.md) | 초기 통합 당시 개요 (레거시 내용 포함) |
