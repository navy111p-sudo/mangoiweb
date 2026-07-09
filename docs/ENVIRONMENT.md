# 환경변수 · 시크릿 · 바인딩 전체 목록

워커 코드(`cloudflare-deploy/src/`)를 전수 검색해 실제 사용 중인 이름만 정리했습니다. (2026-07-09 기준)

## 확인 · 설정 명령

```powershell
cd cloudflare-deploy

# 현재 심어진 시크릿 이름 확인 (값은 안 보임 — 정상)
npx wrangler@latest secret list
npx wrangler@latest secret list --env production

# 시크릿 넣기/바꾸기 — 반드시 두 워커 모두!
npx wrangler@latest secret put 이름
npx wrangler@latest secret put 이름 --env production
```

> ⚠️ **시크릿은 기본 워커와 `-prod` 워커에 각각 따로 저장됩니다.** 한쪽만 넣으면 운영에서만 죽거나 테스트에서만 죽는 "반쪽 장애"가 납니다.

---

## 1. 메인 워커 `webrtc-unified-platform` (cloudflare-deploy/)

### 바인딩 (wrangler.toml에 선언 — 바꿀 일 거의 없음)

| 이름 | 종류 | 실체 | 용도 |
|---|---|---|---|
| `DB` | D1 | `mango-db` | 메인 DB (학생·포인트·출석·게임·정산 등) |
| `RECORDINGS` | R2 | `webrtc-class-recordings` | 수업 녹화 파일 |
| `PDF_STORE` | KV | | 수업 PDF |
| `SESSION_STATE` | KV | | 세션 상태 |
| `SIGNALING_ROOM` | DO | SignalingRoom | 1:1 시그널링(진단페이지 사용 — 삭제 금지) |
| `VIDEO_CALL_ROOM` | DO | VideoCallRoom | 화상수업 방 |
| `AI` | Workers AI | | TTS·LLM |
| `ASSETS` | Assets | `./public` | 정적 화면 |

### 일반 변수 (wrangler.toml `[vars]` — 직접 수정 가능, 단 [env.production]에도 복사)

| 이름 | 용도 |
|---|---|
| `MAX_RECORDING_MB` | 녹화 용량 상한 (기본 500) |
| `ALLOWED_RECORDING_MIME` | 녹화 허용 형식 |
| `BUILD_STAMP` | 배포 시각 — **deploy.ps1이 자동 갱신, 손대지 말 것** |

### 시크릿 (`wrangler secret put`으로 관리 — 파일에 없음)

| 그룹 | 이름 | 용도 | 비고 |
|---|---|---|---|
| 관리자 | `ADMIN_PASSWORD` | admin 로그인 | |
| 방 보안 | `ROOM_JWT_SECRET` | 화상 방 토큰 서명 | ⚠️ **미설정 상태** |
| 방 보안 | `REQUIRE_ROOM_TOKEN` | 방 토큰 강제 여부 | |
| 주소 | `PUBLIC_BASE_URL` | 외부 콜백용 기본 URL | |
| LiveKit | `LIVEKIT_API_KEY` `LIVEKIT_API_SECRET` `LIVEKIT_URL` | LiveKit 화상 (보조) | |
| TURN | `TURN_KEY_ID` `TURN_KEY_API_TOKEN` | Cloudflare TURN (화상 연결 중계) | |
| 알림톡 | `SOLAPI_API_KEY` `SOLAPI_API_SECRET` `SOLAPI_FROM_PHONE` `SOLAPI_PFID` | SOLAPI 카카오 알림톡/SMS | |
| 알림톡 | `SOLAPI_TEST_MODE` `AUTO_ALIMTALK` `ALIMTALK_TRACK` | 발송 on/off 스위치 | 미발송 시 1순위 확인 |
| 알림톡 템플릿 | `SOLAPI_TEMPLATE_ABSENCE` `_ATTENDANCE_RISK` `_CHAT_SUMMARY` `_LESSON_END` `_LESSON_START` `_MENTION` `_PAYMENT_OVERDUE` | 승인된 템플릿 ID 7종 | |
| 기프티콘 | `GIFTISHOW_API_BASE` `GIFTISHOW_API_KEY` `GIFTISHOW_USER_ID` `GIFTISHOW_CALLBACK_URL` `GIFTISHOW_TEST_MODE` | 기프티콘 발송 | |
| Neo4j | `NEO4J_QUERY_URL` `NEO4J_USER` `NEO4J_PASSWORD` | 카페24 Neo4j (**포트 8880**) | URL 예: `http://카페24IP:8880/db/neo4j/tx/commit` |
| 웹푸시 | `VAPID_PUBLIC_KEY` `VAPID_PRIVATE_KEY` `VAPID_SUBJECT` `WEB_PUSH_MODE` | 브라우저 푸시 알림 | |

## 2. AI 상담직원 워커 `mangoi-ai-avatar-cf`

| 이름 | 용도 |
|---|---|
| `TYPECAST_API_KEY` | Typecast TTS |
| `TYPECAST_VOICE_ID` / `TYPECAST_VOICE_ID_STUDENT` | 상담원/학생용 목소리 |

설정: `cd mangoi-ai-avatar-cf` 후 `npx wrangler secret put 이름`

## 3. 강사 리포트 cron 워커 `mangoi-reports-cron` (instructor-dashboard-api/deploy/cron-worker/)

| 이름 | 용도 | 비고 |
|---|---|---|
| `API_BASE` (vars) | FastAPI 서버 주소 | ⚠️ **placeholder 그대로 — 실주소로 교체 필요** |
| `INGEST_TOKEN` (secret) | FastAPI 호출 인증 키 | FastAPI 쪽 `.env`와 같은 값이어야 함 |

## 4. instructor-dashboard-api (Python/FastAPI — 카페24 아님, Docker/Railway류)

`.env` 파일(서버에만 존재, git에 없음): `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`, `INGEST_TOKEN` 등. 상세는 [instructor-dashboard-api/README.md](../instructor-dashboard-api/README.md).

---

## 새 시크릿을 추가할 때 규칙

1. 코드에서 `env.새이름` 으로 참조
2. `wrangler secret put 새이름` — **기본 + `--env production` 두 번**
3. 이 문서에 한 줄 추가 ← 이걸 빼먹으면 다음 사람(미래의 나)이 또 고생함
