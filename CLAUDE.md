# 망고아이 — Claude 작업 규칙

> 이 파일은 Claude Code가 이 저장소에서 작업할 때 **매번 자동으로 읽는** 규칙서입니다.
> 사람이 읽는 상세 문서는 [MAINTENANCE.md](MAINTENANCE.md)입니다. 작업 전에 함께 참고하세요.
>
> **2인 공동 유지보수 중입니다.** 내 판단만으로 남의 영역을 바꾸지 마세요.

---

## 0. 가장 먼저 알아야 할 것

- **실서비스는 `cloudflare-deploy/` 폴더 하나.** 나머지는 보조·실험·레거시입니다.
- 운영 주소: **mango-i.com** → Cloudflare Worker `webrtc-unified-platform-prod`
- `modules/`, `public/`, `server.js` 는 **레거시**. 운영에 안 씁니다. 수정도 삭제도 하지 마세요.
- **실제 학생 29,000명이 쓰는 라이브 서비스입니다.** 실험은 실서비스에서 하지 않습니다.

---

## 1. ⛔ 절대 하지 말 것

### 1-1. 데이터베이스

- **D1 `mango-db` 는 개발/운영이 같은 DB입니다.** 테스트용 DB가 따로 없습니다.
  `wrangler.toml` 의 기본 환경과 `[env.production]` 이 같은 `database_id` 를 가리킵니다.
- 따라서 **DELETE / UPDATE / DROP 를 테스트 목적으로 실행하지 마세요.** 실제 학생 데이터입니다.
- 데이터 확인은 **SELECT 만**. 변경이 필요하면 사람에게 먼저 알리세요.

### 1-2. 배포

- **배포 권한이 있는 사람만 `deploy.ps1` 을 실행합니다.** 권한 없는 작업자는 코드만 고치고 PR로 넘깁니다.
- `deploy.ps1` 은 **로컬 `cloudflare-deploy/public/` 폴더를 통째로 업로드**합니다.
  커밋하지 않은 미완성 파일도 그대로 실서비스에 올라갑니다. 실행 전 `git status` 확인은 필수입니다.
- 배포 경로가 두 개입니다. 중복 배포로 서로 덮어쓰지 않게 주의하세요.
  - 로컬: `deploy.ps1`
  - 자동: `main` 브랜치에 `cloudflare-deploy/**` 변경이 push되면 GitHub Actions가 자동 배포

### 1-3. 되살리면 안 되는 것 (과거에 의도적으로 제거함)

아래는 문제가 있어서 **일부러 없앤 것들**입니다. "없네?" 하고 다시 넣지 마세요.

- 관리자 사이드바 hover 상세 카드 (`#mi-menu-fly`), 파란 플라이아웃 (`#ph123-flyout`)
- 관리자 화면의 서비스워커 등록, `controllerchange` 시 자동 reload
- 화상수업 독(dock)의 웜업 버튼, 상단바 X 버튼
- 인트로 화면의 별도 입장 버튼
- 관리자 KPI 타일의 이모지
- 판단력 훈련 UI의 게임 요소

### 1-4. 기타 금지

- `src/signaling-room.ts` (SignalingRoom Durable Object) **삭제 금지** — 진단 페이지가 사용 중
- 화상수업의 저대역폭 오디오 전용 모드(AAO+DTX) **제거 금지**
- 화상수업에서 `dropped` 상태로 수업을 자동 종료하지 말 것 — `left` 만 종료
- 이모지는 **Unicode 13 이상 사용 금지** (Win10에서 두부 표시됨)
- 관리자 PC 확대는 각 페이지에서 `zoom:1.3`. 공용 CSS로 묶지 말 것

---

## 2. ⚠️ 자주 밟는 함정

| 함정 | 실제로 이렇습니다 |
|---|---|
| wrangler 명령 | wrangler 4에는 `r2 put`, `kv` 에 **`--remote` 옵션이 없습니다** |
| `deploy.ps1` 위치 | **리포 루트**입니다. `cloudflare-deploy/` 안이 아닙니다 |
| 배포 후 curl 검증 | CDN에 구버전이 남아 있을 수 있습니다. `curl --compressed` + 캐시 우회로 확인 |
| D1 쿼리 | 파라미터 **100개 제한**. `IN` 절은 90개 이하로 잘라서 실행 |
| `wrangler.toml` 값 수정 | `[vars]` 와 `[env.production.vars]` 에 **같은 값이 한 벌 더** 있습니다. 둘 다 고쳐야 함 |
| 언어 설정 키 | 공통 키는 `mangoi_lang` 입니다. `mango_lang` 은 구버전 키 |
| i18n 사전 | 전체 문자열 일치 방식입니다. 라벨에서 이모지만 떼도 번역이 깨집니다 |
| TTS 검증 | Cloudflare발 구글 TTS(한국어·중국어)는 **깨진 음성**이 나옵니다. 서버 TTS는 영어만 정상 |
| 셸에서 한글 POST | UTF-8 파일로 저장해서 보내세요. 인라인 한글은 깨집니다 |
| 새 API 추가 | `src/index.ts` 의 라우팅 + 인증 게이트에 **반드시 등록**해야 동작합니다 |
| 브라우저 애니메이션 | 백그라운드 탭·저전력 모드에서 CSS transition과 rAF가 멈춥니다. `opacity:0` 으로 시작하는 요소는 영영 안 보일 수 있습니다 |

---

## 3. 백엔드 파일 지도 — "이 기능 어디 있지?"

| 파일 | 담당 |
|---|---|
| `src/index.ts` | 라우팅 진입점 + 관리자 인증 게이트 |
| `src/api-mango.ts` | 수업 입장(`class/*`), 번역, 통합검색 |
| `src/api-admin.ts` | 관리자 전반: 통계·KPI·급여·강사·팝업·스케줄·구독·레벨테스트 |
| `src/api-games.ts` | 단어장·마이크로러닝·복습퀴즈·배지·스트릭·음성코칭 |
| `src/api-points.ts` | 포인트·기프티콘·수업 별점평가 |
| `src/api-students.ts` | 학부모 대시보드·학생 로그인/가입·소셜로그인 |
| `src/api-lessons.ts` | 평가서·숙제·캘린더·AI 학습리포트 |
| `src/api-notify.ts` | 알림톡·웹푸시·채팅 영속화·카카오 |
| `src/api-ai.ts` | AI 영작첨삭·영어친구챗·AI 명령 라우터 |
| `src/video-call-room.ts` | 화상수업 Durable Object (실사용) |
| `src/signaling-room.ts` | 구 시그널링 DO (진단용, 삭제 금지) |

화면(`cloudflare-deploy/public/`)은 HTML 53개. 주요 파일은 `index.html`(홈+화상수업), `admin.html`(관리자), `student.html`(학생).

---

## 4. 작업 방식

### 4-1. 브랜치

`main` 에 직접 커밋하지 마세요. 작업용 브랜치를 만들고 PR로 올립니다.

```bash
git pull
git checkout -b 작업내용-요약
```

### 4-2. 2인 분담 원칙

같은 파일을 동시에 고치면 충돌합니다. 작업을 시작하기 전에 **어느 파일을 만질지** 상대에게 알리세요.
특히 `index.html`, `admin.html` 은 파일이 매우 커서 충돌 시 해결이 어렵습니다.

### 4-3. 검증 — 코드를 고쳤으면 반드시

1. `cd cloudflare-deploy && npx tsc --noEmit` — 컴파일 통과
2. `node test-harness/run.mjs --fast` — 회귀 하니스 (약 25초)
3. 화면 변경이면 실제 브라우저에서 확인

**"고쳤습니다"라고만 말하지 말고, 무엇으로 확인했는지 함께 보고하세요.**
서버 배포 후에는 배포 스탬프(`BUILD_STAMP`)로 실제 반영 여부를 확인합니다.

### 4-4. 보고 방식

- 사실만. 테스트가 실패했으면 실패했다고 출력과 함께 말할 것
- 건너뛴 단계가 있으면 명시할 것
- 확인되지 않은 것을 "됐습니다"라고 하지 말 것

---

## 5. 환경·문서 링크

- 유지보수 매뉴얼(사람용): [MAINTENANCE.md](MAINTENANCE.md)
- 환경변수·시크릿: [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md)
- 장애 대응: [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)
- 공동작업 안내(직원용): [docs/개발_공동작업_안내_직원용.md](docs/개발_공동작업_안내_직원용.md)

`.env`, `.dev.vars` 는 깃에 없습니다. 없으면 사람에게 요청하세요. **깃에 올리지 마세요.**

---

*이 파일은 두 사람이 공유합니다. 새 함정을 발견하면 여기에 추가하고 PR에 포함하세요.*
