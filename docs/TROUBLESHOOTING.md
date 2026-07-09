# 문제 해결 가이드 — "이럴 땐 여기를 봐라"

증상별로 확인 순서를 정리했습니다. 실제 겪었던 장애 사례 기반. (2026-07-09)

## 만능 도구 3가지 (제일 먼저 익혀둘 것)

```powershell
cd cloudflare-deploy

# 1) 실시간 서버 로그 — 운영에서 에러가 날 때 (Ctrl+C로 종료)
npx wrangler@latest tail --env production

# 2) DB 직접 조회 — 데이터가 이상할 때 (--remote 필수! 없으면 로컬 빈 DB를 봄)
npx wrangler@latest d1 execute mango-db --remote --command "SELECT * FROM students LIMIT 5"

# 3) 배포 상태 확인
npx wrangler@latest deployments list --env production
```

---

## 배포했는데 화면이 안 바뀜

1. `deploy.ps1`로 배포했는가? (이 스크립트가 캐시 버전을 자동으로 올려줌. 수동 `wrangler deploy`만 하면 서비스워커 캐시 때문에 옛 화면이 계속 보임)
2. **`-prod`까지 배포 성공했는가?** 스크립트 출력에서 "프로덕션(webrtc-unified-platform-prod) 배포" 성공 확인. 기본 워커만 성공하면 사용자 화면은 그대로.
3. 휴대폰: 사이트 데이터 삭제 또는 시크릿 모드로 확인. PWA로 설치돼 있으면 앱 제거 후 재설치.
4. 그래도 안 바뀌면: 페이지 소스에서 `<!-- BUILD:숫자 -->` 주석이 방금 배포한 타임스탬프인지 확인.

## API가 500 에러 / 기능이 조용히 죽음

1. `npx wrangler tail --env production` 켜놓고 해당 기능 재현 → 에러 메시지 확인
2. 에러에 `env.무엇무엇 undefined` 류가 보이면 → 시크릿 미설정. [ENVIRONMENT.md](ENVIRONMENT.md) 보고 `secret put` (기본+prod 둘 다!)
3. 새로 만든 `/api/...` 경로가 **404**면 → `src/index.ts`의 라우팅 게이트에 그 경로가 등록 안 된 것. api 파일에 함수만 만들면 안 되고 index.ts에도 연결해야 함.

## 화상수업 문제

| 증상 | 확인 |
|---|---|
| 상대가 안 보임/연결 안 됨 | TURN 시크릿(`TURN_KEY_ID/TOKEN`) → wrangler tail로 `/api/turn-config` 에러 확인 |
| "남의 방" 들어가짐/차단됨 | 예약 기반 room_id + verify-room 로직 (`api-mango.ts`) — 예약 시간과 시간게이트 확인 |
| 새로고침 후 연결 실패 | ICE 후보 큐잉 회귀 여부 — 루트의 `test-harness.html`로 회귀 테스트 |
| 진단 페이지 죽음 | SignalingRoom DO를 지웠는지 확인 (VideoCallRoom과 별개, 둘 다 필요) |

## 음성(TTS)이 무음

1. Workers AI가 429(한도 초과)를 뱉으면 그 에러 응답이 오디오로 흘러가 무음이 됨 — 가드가 있으니, 재발 시 `/api/voice/tts` 쪽 ok+audio 검증 로직 확인
2. 사이드바 안내/AI비서 목소리(`/api/ops-tts`)는 Typecast — 크레딧 소진 시 Google TTS 폴백으로 넘어가는지 확인
3. Typecast 시크릿은 `mangoi-ai-avatar-cf` 워커에 있음

## admin 페이지 문제

| 증상 | 원인/조치 |
|---|---|
| admin.html이 자꾸 로그인으로 튕김 | admin은 쿠키가 아니라 **localStorage `mangoi_admin_session`** 사용. 마이페이지의 [상세 관리자 페이지] 버튼으로 들어가면 자동으로 채워짐 |
| /admin/ 하위 페이지(정산 등)가 안 열림 | 하위 페이지가 서버쿠키만 요구하면 튕김 — localStorage 역할 폴백이 있어야 함 (과거 수정 사례 있음) |
| 사이드바 메뉴가 통째로 사라짐 | 학생 프리뷰 역할시뮬(`mangoi_user_role`)이 권한 필터에 새던 버그 — 수정됨. 재발 시 localStorage에서 `mangoi_user_role` 삭제 후 새로고침 |
| 밝은(ivory) 테마에서 글자 안 보임 | 알려진 미완성 (~670곳). 급하면 다크 테마 사용 |

## 알림톡이 안 감

1. `SOLAPI_TEST_MODE`, `AUTO_ALIMTALK` 스위치 값 확인 (테스트 모드면 실발송 안 됨)
2. cron 발송은 **기본 워커에서만** 돎 (-prod에는 cron 없음 — 정상 설계, 중복 발송 방지)
3. 템플릿 ID 시크릿 7종이 심어져 있는지 `secret list`로 확인
4. wrangler tail을 기본 워커(`npx wrangler tail`)로 걸고 cron 시각에 로그 확인

## Neo4j 연동 기능이 죽음 (강사매칭·이탈위험·웜업 개인화·학생목록)

1. 카페24 서버의 Neo4j가 떠 있는지: 브라우저에서 `NEO4J_QUERY_URL`의 호스트:8880 접속
2. **포트는 8880** (7474 아님 — Cloudflare에서 비표준 포트 접근 문제로 이동했음)
3. 시크릿 `NEO4J_QUERY_URL/USER/PASSWORD` 확인
4. 야간 동기화(MySQL→Neo4j→D1)가 안 돌았으면 데이터가 하루 이상 뒤처질 수 있음

## 로컬 개발 서버(wrangler dev)가 Windows에서 크래시

알려진 문제. 우회: 기본 워커로 먼저 배포해서 확인하거나(운영은 -prod라 안전), WSL에서 실행.

## git push 실패 (deploy.ps1 5단계)

- "원격이 앞서 있음" → `git pull --no-rebase origin main` 후 다시 `deploy.ps1`
- 배포 자체는 git과 무관하게 진행되므로, push 실패해도 화면 반영은 됨 (나중에 push만 다시)

## 데이터가 이상함 (학생 수, 포인트 등)

```powershell
# 예시들
npx wrangler d1 execute mango-db --remote --command "SELECT COUNT(*) FROM students"
npx wrangler d1 execute mango-db --remote --command "SELECT * FROM student_points WHERE student_id='...'"
```
- 학생 정본은 카페24 MySQL → Neo4j(29,287명) → D1 순으로 흐름. D1이 이상하면 동기화부터 의심.
- 연속출석(streak)은 attendance 테이블 기준 단일 계산 — 배지와 API가 같은 로직 사용.

## 에러 신고를 받았을 때 표준 순서

1. 언제, 어느 화면, 어느 계정인지 확보 (시연 계정 `wondang`/`student`, pw `mango1234`로 재현 시도)
2. `wrangler tail --env production` 켜고 재현
3. 에러가 시크릿/설정이면 → [ENVIRONMENT.md](ENVIRONMENT.md)
4. 코드 버그면 → 해당 파일 위치 메모해서 개발자(또는 AI)에게 전달: "이 파일 몇 줄 근처, 이 에러"
