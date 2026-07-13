# 코드 분리(리팩터링) 계획 — 초대형 파일 해체 로드맵

작성: 2026-07-09. **아직 실행 전 — 계획서입니다.** 한 단계씩 실행하고, 매 단계마다 배포+검증 후 다음으로 넘어갑니다.

## 왜 필요한가 (현재 구조의 문제)

| 파일 | 크기 | 문제 |
|---|---|---|
| `cloudflare-deploy/public/admin.html` | **40,239줄 / 2.5MB** | 관리자 콘솔 전체(수십 개 기능)가 한 파일. 수정 시 다른 기능을 깨뜨릴 확률이 가장 높음 |
| `cloudflare-deploy/public/index.html` | 25,996줄 / 1.4MB | 학생/수업 화면 전체. 일부는 이미 `/js/idx-*.js`로 추출됨(전례 있음) |
| `cloudflare-deploy/src/api-mango.ts` | 12,205줄 / 822KB | 백엔드 API 대부분이 한 파일 |

추가 문제: 배포 스크립트 5종 중복, 린트/포맷/테스트 도구 부재, `.claude/worktrees/`에 리포 전체 복사본, 레거시 폴더(`modules/`, `public/`, `server.js`)와 운영 코드가 뒤섞임.

## 원칙 (이걸 어기면 사고남)

1. **한 번에 한 기능만** 떼어내고 → 배포 → 실화면 확인 → 커밋. 대개편 금지.
2. **동작 불변**: 분리 단계에서는 로직을 절대 고치지 않는다. 옮기기만 한다.
3. `index.html`은 **인라인 유지 대상 코드가 있음** (초기 로딩·인증 등) — 기존 idx-*.js 추출 때 정리된 기준을 따른다.
4. HTML의 `data-ko` 다국어 관례, 쌍둥이 코드(같은 로직이 index.html과 게임 파일에 이중 존재) 동기화 주의.
5. 각 단계 후 회귀 확인: 로그인 → 수업 입장 → 게임 1개 → admin 접속.

## 단계별 계획 (안전한 순서대로)

### 1단계 — 백엔드 `api-mango.ts` 도메인별 분리 ★추천 시작점
TypeScript라 `npx tsc`(빌드)가 실수를 잡아줘서 **가장 안전**합니다. 이미 `src/`에 accounting-*.ts, warmup-graph.ts 등 분리된 전례가 많음.

```
전:  src/api-mango.ts (12,205줄 — 전부)
후:  src/api-mango.ts        (라우팅 진입 + 공용 헬퍼만, ~1,000줄 목표)
     src/api-students.ts     (학생·출석·포인트)
     src/api-lessons.ts      (수업·예약·방배정·평가)
     src/api-games.ts        (게임 vocab·진행·리포트)
     src/api-notify.ts       (알림톡·웹푸시·기프티콘)
     src/api-admin.ts        (admin 전용)
```
검증: `npx tsc --noEmit` 통과 + 기본 워커 배포 후 주요 API 호출.

### 2단계 — `admin.html` 스크립트 추출 (`/js/adm-*.js`)
idx-*.js 방식 그대로: IIFE 블록 단위로 파일로 뽑고 `<script src>` 연결.
```
전:  public/admin.html (40,239줄)
후:  public/admin.html          (마크업 + 초기화만, ~15,000줄 1차 목표)
     public/js/adm-students.js  (학생목록·상세)
     public/js/adm-retention.js (리텐션 센터 4카드)
     public/js/adm-settlement.js(정산)
     public/js/adm-notice.js    (공지 스튜디오·포스터)
     public/js/adm-perms.js     (권한 매트릭스)
```
한 번에 한 파일씩. 주의: sw.js 캐시 대상에 새 js가 포함되는지 확인.

### 3단계 — `index.html` 잔여 추출 (idx-*.js 확장)
이미 4블록 추출된 방식 연장. 인라인 유지 대상(부팅·인증·인트로)은 남긴다.

### 4단계 — 정리 작업 (코드 이동 없음, 위험 낮음)
- 배포 스크립트 일원화: `deploy.ps1`만 남기고 나머지는 `scripts/legacy/`로 이동
- `cloudflare-deploy/package.json`: `"deploy": "wrangler publish"` → `"wrangler deploy"`, wrangler v4로 버전 정합
- 레거시(`modules/`, 루트 `public/`, `server.js`) → `legacy/` 폴더로 이동 (삭제 아님)
- `.claude/worktrees/` 정리

### 5단계 — 안전망 구축 (분리와 병행 가능)
- **API 스모크 테스트**: ✅ 완료(2026-07-14) — `cloudflare-deploy/scripts/smoke-test.ps1` 15종
  (게임 도메인 5 + 보안게이트 401 생존 6 + 핵심 라우트 4). deploy.ps1 v3.1에 연결:
  [0/7] 배포 전 게이트(tsc+라이브 스모크, 실패 시 배포 중단) + [6b/7] 배포 후 재검증(실패 시 롤백 안내).
  급할 때 우회: `-SkipSmoke`. ⚠ PS5.1 함정: BOM 없는 UTF-8은 파싱 깨짐(BOM 필수), 4xx 본문은 gzip이라 HttpClient+AutomaticDecompression 사용
- Prettier(포맷) + ESLint 최소 설정 — 새로 만드는 파일부터 적용
- 화상수업 회귀는 기존 `test-harness.html` 계속 사용

## 예상 효과

| 지금 | 이후 |
|---|---|
| "포인트 로직 어디지?" → 4만 줄에서 검색 | `api-students.ts` / `adm-students.js` 열면 됨 |
| 한 기능 수정이 다른 기능을 깨뜨림 | 파일 단위로 격리 |
| AI에게 시켜도 파일이 너무 커서 느리고 위험 | 파일 단위 작업으로 빠르고 안전 |
| 배포 후에야 오류 발견 | 배포 전 tsc + 스모크 테스트가 차단 |

## 진행 기록

| 날짜 | 단계 | 내용 | 결과 |
|---|---|---|---|
| 2026-07-09 | 0 | 계획 수립, 문서화 3종 완료 | ✅ |
| 2026-07-09 | 1 | 공용 헬퍼 `api-util.ts` 분리 (json, parseJsonBody) | ✅ tsc·드라이런 통과 |
| 2026-07-09 | 1 | AI 음성일기 5라우트 → `api-diary.ts` 분리 (첫 도메인, -171줄) | ✅ tsc·드라이런 통과, 배포 후 일기 화면 확인 필요 |
| 2026-07-10 | 보안 | `isAdminPath` allowlist → **default-deny** (admin API 무인증 노출 근본수정) | ✅ 커밋 ad5e17a2, 배포 대기 |
| 2026-07-10 | 보안 | 공개예외 3→1 (leaderboard 신설/카탈로그 자동시드) + write-history 토큰인증 | ✅ 커밋 19e7dc56, 배포 대기 |
| 2026-07-14 | 1 | 게임 도메인 → `api-games.ts` 분리: Phase VOC(단어장 10라우트) + Phase ML(마이크로러닝 8라우트), api-mango 15,441→14,725줄 | ✅ tsc·드라이런 통과 + 실서버 스모크 OK(vocab list/stats/leaderboard) |
| 2026-07-14 | 1 | Phase RQ(복습퀴즈 학생6+관리자6) → `api-games.ts` 2차 합류, 위임 4-prefix 통합(RQ 자리), api-mango 14,725→14,223줄 | ✅ tsc·드라이런 통과 + 두 워커 배포 + 실서버 스모크 OK(rq list/auto). ⚠ 다음 후보 메모: parent/student 는 7구역 산재라 블록이동 불가(라우트별 이동 필요), BG·ST 는 checkAndAwardBadges 클로저를 12604줄(ST 밖)이 공유 → env 파라미터화 후 함께 이동해야 함 |
| 2026-07-14 | 1 | Phase BG(배지3)+ST(스트릭4) → `api-games.ts` 3차, 클로저 3종 env 파라미터화(checkAndAwardBadges 는 export 로 api-mango 영작이 역수입), reconcileAllStreaks·computeAttendanceStreak 동반 이동(index.ts cron import 변경), api-mango 14,223→13,777줄 | ✅ tsc·드라이런·게이트 배포·스모크 15/15 |
| | | | |

### 분리 작업 표준 절차 (1단계에서 확립된 패턴)
1. 도메인 라우트 블록을 `src/api-도메인.ts`의 `handle도메인Api(request, url, env): Promise<Response|null>`로 **그대로** 이동 (로직 무변경)
2. 공용 헬퍼는 `api-util.ts`에서 import (api-mango 역참조는 `import type`만 허용)
3. handleMangoApi의 원래 위치에 `if (path.startsWith('/api/도메인/')) { const r = await handle도메인Api(...); if (r) return r; }` 위임 삽입 — null 반환 시 기존 라우팅 계속이라 동작 동일
4. 검증: `npx tsc --noEmit` (기존 에러 1건 제외 새 에러 0) + `npx wrangler deploy --dry-run --outdir .wrangler-drycheck`
5. 커밋 → 다음 배포 때 실화면 확인
