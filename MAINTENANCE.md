# 망고아이 유지보수 매뉴얼 (오너용)

> 이 문서는 "개발자 없이 혼자 관리해야 하는 사람"을 위한 최상위 안내서입니다.
> 상세 문서: [환경변수·시크릿 목록](docs/ENVIRONMENT.md) · [문제 해결 가이드](docs/TROUBLESHOOTING.md) · [코드 분리 계획](docs/REFACTOR_PLAN.md)

최종 갱신: 2026-07-14 (대규모 코드분리 36차 반영)

---

## 1. 한 줄 요약

**실서비스는 `cloudflare-deploy/` 폴더 하나입니다.** 나머지 폴더 대부분은 보조 프로젝트, 실험, 레거시, 문서 제작용입니다. 헷갈리면 `cloudflare-deploy/` 밖은 건드리지 마세요.

- 운영 주소: **https://test.mangoi.co.kr** → Cloudflare Worker `webrtc-unified-platform-prod`
- 배포 방법: 리포 루트에서 `deploy.ps1` 실행 (또는 `배포하기.bat` 더블클릭)

> **주소 관련 주의 (2026-07-28 정정)**
> 이 문서를 포함해 여러 곳에 운영 주소가 `mango-i.com` 으로 적혀 있었는데, **그런 도메인은 없습니다.**
> 등록 자체가 안 되어 있어 DNS 가 아예 응답하지 않습니다(공개 DNS·.com 레지스트리 양쪽 확인).
> - 실제 서비스 주소: **test.mangoi.co.kr** (Cloudflare 존 `mangoi.co.kr`, Worker 가 응답)
> - `mangoi.co.kr` / `www.mangoi.co.kr` → 118.219.234.180 **구 서버**(옛 LMS). Worker 화면·API 없음
> - 그래서 배포 후 검증을 `mango-i.com` 으로 하면 "고쳤는데 확인이 안 된다"가 아니라 **주소가 없어서** 실패합니다
> - 나중에 `mango-i.com` 을 실제로 구입·연결하게 되면 이 항목을 다시 고쳐 주세요

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
- `cloudflare-deploy/src/` 전체 — 특히 `index.ts`(라우팅+admin 인증게이트), Durable Object 파일들(`video-call-room.ts`, `signaling-room.ts` — **SignalingRoom 삭제 금지**, 진단페이지가 사용)

#### 📦 백엔드 모듈 지도 (2026-07-14 대분리 후 — "이 기능 어디 있지?" 찾을 때)
| 파일 | 담당 |
|---|---|
| `src/api-mango.ts` (3.5천줄) | 라우팅 진입점 + 소수 잔여(수업입장 class/*, 번역, omnisearch) |
| `src/api-admin.ts` (6.6천줄) | 관리자: 통계·KPI·급여·강사관리·팝업·스케줄·노쇼·구독·NPS·가족·동문회·레벨테스트·교재파일 |
| `src/api-games.ts` | 단어장·마이크로러닝·복습퀴즈·배지·스트릭·음성코칭 |
| `src/api-points.ts` | 포인트·기프티콘(기프티쇼)·수업 별점평가 |
| `src/api-students.ts` | 학부모(대시보드·다이제스트·상담챗)·학생 로그인/가입·소셜로그인 |
| `src/api-lessons.ts` | 평가서·숙제·캘린더·AI 학습리포트 |
| `src/api-notify.ts` | 알림톡·웹푸시·채팅영속화·카카오 양방향 |
| `src/api-ai.ts` | AI 영작첨삭·영어친구챗·AI 명령 라우터 |
| `src/api-reports.ts` | 월간 학습보고서(크론 포함) |
| `src/api-util.ts` / `auth-token.ts` / `scope.ts` | 공용 응답·CSV·토큰·지사격리 |

#### 📦 프런트 분리 파일 (외부 js — 원복법은 각 파일 머리주석)
- `public/js/adm-core.js` + `adm-p*/q*/r*/s*.js` (68개) — admin.html 에서 추출된 로직
- `public/js/idx-*.js` + `idx-x1~8.js` — index.html 에서 추출 (⚠ index.html 의 화상수업(VC)·부팅 코드는 의도적으로 인라인 유지)
- 배포 시 `?v=` 캐시버스터를 올려야 즉시 반영
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

### 🔑 로그인 세션이 «두 갈래»다 — 가장 자주 밟는 함정

> 2026-08-13, 필리핀 IT매니저 Karl 「Double Login Issue」 로 드러남.
> 이미 «Teacher Win» 으로 로그인한 강사가 메뉴 → 「녹화 보기」를 누르면 로그인 창이 한 번 더 떴다.

같은 «로그인» 이라도 **누가 로그인했느냐에 따라 저장되는 것이 전혀 다릅니다.**

| 로그인한 사람 | 브라우저(localStorage) | 서버 인증 수단 |
|---|---|---|
| **학생·학부모** | `mangoi_logged_user` (+ 미러 `mango_user`, `mangoi_uid`) | `mango_token` (uid 서명토큰) |
| **교사·본사·지사·대리점** | `mangoi_admin_session` | `admin_sessions` **쿠키** — 토큰은 **안 만듦** |

즉 **교사에게는 `mango_token` 이 아예 없습니다.** 그래서 이런 일이 생깁니다.

- 화면 코드가 `mangoi_logged_user` 만 보고 로그인 여부를 판단하면 → 교사는 «로그인 안 한 사람» 이 됩니다.
- 서버 API 가 `mango_token` 만 받으면 → 교사 요청은 **401** 로 떨어집니다.
- 증상은 늘 같습니다: **「분명히 로그인했는데 또 로그인하라고 한다」.**
  (2026-07-30 강사 Kaye 17번 「홈을 눌렀더니 갑자기 로그아웃됐다」도 같은 뿌리입니다)

**⛔ 이렇게 고치면 안 됩니다** — 교사 로그인 때 `mangoi_logged_user` 를 같이 만들어 주는 방식.
편해 보이지만 **교사 계정으로 학생 전용 기능이 통째로 열립니다.** 일부러 안 만드는 것입니다.
필요한 화면·API 에서 **«교사 세션도 인정»** 하는 쪽으로 고치세요.

**새 화면·새 API 를 만들 때 확인할 것**

1. 이 기능을 **교사·본사도 쓰는가?** 쓴다면 학생 키만 보면 안 됩니다.
2. 서버 쪽은 토큰이 없을 때 `checkAdminSession()`(`src/auth-admin.ts`)도 봐야 합니다.
   개인정보 API 는 `resolveOwnerScope()` 를 쓰면 이 판정이 한 번에 됩니다.
3. **짝이 되는 API 끼리 판정이 어긋나지 않았는지** 보세요. Karl 건이 딱 이 경우로,
   녹화 «재생»(`/api/recording/play`)은 관리자 세션을 받는데 «목록»(`/api/student/recordings`)만
   안 받는 한쪽짜리 게이트였습니다.

**역할 판정 로직이 복제된 곳 (하나 고치면 나머지도 반드시 함께 볼 것)**

- `public/index.html` — 학생홈 통합 로그인 폴백(`tryAdminLoginFallback`)
- `public/admin/login.html` — 관리자 로그인 화면
- `public/js/idx-user-session.js` — 상단바 표시·이동 분기
- 접두사 규칙 자체의 정본은 `src/auth-admin.ts` 의 `resolveUiIdentity()`

회귀 방지 하니스: `test-harness/teacher_recording_login_harness.mjs`
(가짜 브라우저에서 실제 `flow.js` 를 돌려 Karl 이 본 화면을 재현합니다)

## 6. 알려진 미해결 사항 (2026-07-09 기준)

| 항목 | 내용 | 위험도 |
|---|---|---|
| ✅ admin API 무인증 노출 | isAdminPath allowlist 누락으로 수십개 공개됐던 것 → **default-deny로 근본수정(커밋됨, 배포 필요)**. 상세: [크몽 진단 검증](docs/크몽_진단_검증.md) | ~~높음~~ 수정됨 |
| ✅ write-history IDOR | uid만 알면 남의 첨삭이력 조회되던 것 → mango_token 인증 요구(커밋됨, 배포 필요) | ~~중~~ 수정됨 |
| ✅ `ROOM_JWT_SECRET` 설정 | 강한 랜덤값을 기본+prod 두 워커에 설정 완료(2026-07-10). 폴백 제거됨 | ~~중~~ 완료 |
| ⏳ Neo4j 8880 포트 개방 | 학생 PII가 평문 HTTP로 열린 포트 노출(SRS §7.4 P1). Cloudflare Tunnel/iptables로 잠글 것 | **높음** |
| ⏳ ai-analyze/student 공개 | parent.html에 학부모 인증 부재 → 학부모 로그인 도입 후 잠글 것 | 중 |
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
