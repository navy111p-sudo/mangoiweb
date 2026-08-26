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
| TURN | `TURN_KEY_ID` `TURN_KEY_API_TOKEN` | Cloudflare TURN (화상 연결 중계) | ✅ **`-prod` 에 둘 다 등록 확인**(2026-08-26 대시보드 실측). 그런데도 24시간 넘게 발급이 실패한 구간이 있었습니다 → 아래 「TURN 경로 확인」 |
| 알림톡 | `SOLAPI_API_KEY` `SOLAPI_API_SECRET` `SOLAPI_FROM_PHONE` `SOLAPI_PFID` | SOLAPI 카카오 알림톡/SMS | |
| 알림톡 | `SOLAPI_TEST_MODE` `AUTO_ALIMTALK` `ALIMTALK_TRACK` | 발송 on/off 스위치 | 미발송 시 1순위 확인 |
| 알림톡 템플릿 | `SOLAPI_TEMPLATE_ABSENCE` `_ATTENDANCE_RISK` `_CHAT_SUMMARY` `_LESSON_END` `_LESSON_START` `_MENTION` `_PAYMENT_OVERDUE` | 승인된 템플릿 ID 7종 | |
| 기프티콘 | `GIFTISHOW_API_BASE` `GIFTISHOW_API_KEY` `GIFTISHOW_USER_ID` `GIFTISHOW_CALLBACK_URL` `GIFTISHOW_TEST_MODE` | 기프티콘 발송 | |
| Neo4j | `NEO4J_QUERY_URL` `NEO4J_USER` `NEO4J_PASSWORD` | 카페24 Neo4j (**포트 8880**) | URL 예: `http://카페24IP:8880/db/neo4j/tx/commit` |
| 웹푸시 | `VAPID_PUBLIC_KEY` `VAPID_PRIVATE_KEY` `VAPID_SUBJECT` `WEB_PUSH_MODE` | 브라우저 푸시 알림 | |

### 🔴 TURN 경로 확인 (2026-08-26 추가)

`TURN_KEY_ID` / `TURN_KEY_API_TOKEN` 이 없어도 **배포는 성공하고 사이트도 200 을 줍니다.**
대신 `handleTurnConfig()`(`src/index.ts`)가 **무료 공개 TURN**(`openrelay.metered.ca`)으로
떨어지고, 그 코드의 주석이 직접 경고합니다 — 「50명을 받을 수 있는 서버가 아니라서,
**아무 에러 없이 «영상만 안 나오는»** 상태가 된다」.

### 📌 관측 기록 (2026-08-26) — 코드 밖 상태이므로 «누가·언제·어떻게» 를 함께 적습니다

| 시각(UTC) | 무엇 | 누가·어떻게 |
|---|---|---|
| 07:1x 이전 | `X-Turn-Source: **public-fallback**` | 사장님이 브라우저 F12 → Network 에서 `mangoi.ai/api/turn-config` 응답 헤더 확인 |
| **07:40:54** | `X-Turn-Source: **kv-cache**` (기본·production 둘 다) | 배포 run #2717 의 「TURN 경로 점검」 단계가 GitHub 러너에서 `workers.dev` 두 주소로 실측 |
| 08:0x | **시크릿 `TURN_KEY_ID`·`TURN_KEY_API_TOKEN` 이 «워커 두 벌 모두» 있음** | 사장님이 Cloudflare 대시보드 → 각 워커 → production → 설정 → 변수 및 비밀 에서 눈으로 확인 (`webrtc-unified-platform-prod`·`webrtc-unified-platform` 둘 다) |
| 08:0x | 사장님은 **그날 시크릿을 넣지 않으셨음** | 직접 확인 |

✅ **두 벌 다 등록돼 있습니다 — 넣을 것이 없습니다.**

`TURN_CACHE_KEY`(`turn:ice-servers:v1`)는 **Cloudflare TURN API 호출이 성공했을 때만**
기록되고 수명은 1시간입니다(`src/index.ts` 4204행). 무료 폴백은 캐시에 들어가지 않습니다.
→ **07:40 기준 최근 1시간 안에 Cloudflare TURN 발급이 실제로 성공했습니다. 지금은 정상입니다.**

### 🔴 결론 — 「시크릿이 없다」는 **틀린 추론이었습니다** (대시보드로 확정)

시크릿은 **워커 두 벌 모두에 있습니다.** 대시보드에서 직접 확인했고, 코드에서도 같은 결론이 나옵니다.

* `turn:ice-servers:v1` 을 **쓰는 곳은 `src/index.ts:4213` 단 한 곳**이고,
  `if (env.TURN_KEY_ID && env.TURN_KEY_API_TOKEN)` 안 + `cfResp.ok` 일 때만 실행됩니다
* 그 KV 네임스페이스(`7fc5f228…`)를 쓰는 워커는 **이 워커 한 벌뿐**입니다
  (`wrangler.toml` 62·189행 = 같은 워커의 기본/production 두 환경 — 그래서 **KV 는 공유**입니다)

> **⟹ 시크릿은 있는데도, 최근 24시간 동안 Cloudflare TURN 발급이 «단 한 번도»
> 성공하지 못한 구간이 있었고, 그것이 그날 아침에 끝난 것입니다.**
>
> 즉 고칠 것은 «키 등록» 이 아니라 **«왜 그 키로 발급이 24시간 넘게 실패했나»** 입니다.

LKG(`turn:ice-servers:last-good`)는 24시간 보관인데 두 워커가 같은 KV 를 쓰므로,
**어느 쪽이든 한 번만 성공하면 채워집니다.** 그게 비어 있었다는 것이 위 결론의 근거입니다.

⚠️ 왜 24시간 넘게 실패했는지는 **응답만 봐서는 구분할 수 없습니다** — CF 쪽 장애, 키
만료·회수, 사용량 한도 초과가 모두 같은 모습입니다(바로 아래 항목).

✅ **다만 답이 남아 있을 곳이 하나 있습니다 — Workers 로그.** 그 워커는 관찰 가능성
(Workers 로그)이 **켜져 있습니다**(2026-08-26 대시보드 확인). 코드가
`console.error('Cloudflare TURN API error:', cfResp.status, …)` 로 **HTTP 상태 코드를
그대로 남기므로**(`src/index.ts` 4209행), 대시보드 → 해당 워커 → **관찰 가능성 → 로그**
에서 `Cloudflare TURN` 또는 `turn-config` 로 검색하면 **403(키 문제)인지 429(한도)인지
5xx(CF 장애)인지가 그대로 보입니다.** 보존 기간 안이라면 그것이 유일한 확답입니다.

### 🔴 `public-fallback` 은 서로 다른 세 가지를 뭉뚱그립니다

| 실제 상황 | 나오는 값 | 해야 할 일 |
|---|---|---|
| 시크릿이 없다 | `public-fallback` | 키 등록 |
| CF API 가 거절했다 (403·429·한도초과) | `public-fallback` | 계정·키 확인 |
| CF 에 연결조차 안 됐다 | `public-fallback` | 장애 복구 대기 |

**2026-08-26 에 이것 때문에 반나절을 잘못 짚었습니다.** 코드는 `console.error` 로 이유를
남기지만(`src/index.ts` 4209·4211행) `wrangler tail` 을 켜고 있어야만 보이고 아무도 안 봅니다.

⏳ **아직 안 고쳤습니다** — `src/index.ts` 는 공동 금지구역이라 사람 판단이 필요합니다.
고친다면 응답 헤더에 이유를 한 줄 더 싣는 정도면 충분합니다(`X-Turn-Detail: no-secrets` /
`cf-http-403` / `cf-fetch-error`).

⛔ 원인을 **단정해 적지 마세요.** 「하기로 한 것」이 「했다」로 적혔다가 6일 뒤 같은 사고가
재발한 전례가 있습니다(CLAUDE.md 2장). 확인되면 위 표에 **한 줄을 덧붙이세요** —
윗줄을 지우지 말고. 그래야 「한 번 이랬던 적이 있다」가 남습니다.

✅ 지금부터는 사람이 기억할 필요가 없습니다 — 배포마다 `deploy.yml` 이 두 워커를 찍고,
2층 감시견이 15분 연속 `public-fallback` 이면 문자를 보냅니다.

---

그날 사장님 제보는 「무거우면 자꾸 튕겨나가」 였고,
D1 실측은 **RTT 389~629ms 인데 손실은 0.7~4.2%(낮음)** — 회선 불량이 아니라
릴레이 경유의 지문이었습니다. 강사 재입장률 21세션 중 13세션(61.9%).
⚠️ 그 측정 자체는 사실이지만, **그것이 곧 「시크릿이 없다」의 증거는 아니었습니다** —
무료 폴백을 타고 있었다는 것까지가 관측이고, 그 원인 세 가지는 모두 같은 증상을 냅니다.

**확인**

```bash
curl -sI https://mangoi.ai/api/turn-config | grep -i x-turn-source
```

| 값 | 뜻 |
|---|---|
| `cloudflare` · `kv-cache` | ✅ 정상 |
| `last-known-good` | ⚠️ Cloudflare TURN API 가 흔들리는 중 (자격증명은 아직 진짜라 수업은 정상) |
| `public-fallback` | 🔴 **무료 공개 TURN 사용 중 = 시크릿 미설정** |

`public-fallback` 이 나오려면 CF 호출 실패 **그리고** 24시간짜리 마지막 성공분
(`turn:ice-servers:last-good`)이 비어 있어야 합니다 — 잠깐 흔들린 게 아니라
**한 번도 성공한 적이 없다**는 뜻입니다.

**조치** — 🔴 **2026-08-26 기준 두 벌 다 등록돼 있으므로 아래를 실행할 일이 없습니다.**
같은 증상을 또 만나면 **먼저 「정말 없는지」부터 눈으로 확인하세요** —
Cloudflare 대시보드 → Workers & Pages → 해당 워커 → **Settings → Variables and Secrets**
에 이름이 뜹니다(값은 안 보입니다). ⛔ 있는데 덮어쓰면 «고쳤다» 는 기록만 남고 원인은
그대로 남습니다. 정말 없을 때만, 워커가 두 벌이므로 **둘 다** 넣습니다
(`test.mangoi.co.kr` = 기본 워커, `mangoi.ai` = `-prod`).

```bash
cd cloudflare-deploy
npx wrangler secret put TURN_KEY_ID
npx wrangler secret put TURN_KEY_API_TOKEN
npx wrangler secret put TURN_KEY_ID        --env production
npx wrangler secret put TURN_KEY_API_TOKEN --env production
```

> ⚠️ 이 시크릿이 없으면 **중국 회선용 «강제 릴레이»(`vc_relay_force`)도 함께 죽습니다** —
> `api-mango.ts` 의 `hasCfTurn` 조건에 묶여 있어, 켜 두어도 켜지지 않습니다.

**감시** — 2026-08-26 부터 두 곳이 자동으로 봅니다.
`deploy.yml` 이 배포마다 두 워커의 `X-Turn-Source` 를 요약에 찍고(배포를 막지는 않습니다),
2층 감시견 `ops/mangoi-watchdog.sh` 가 15분 연속 `public-fallback` 이면 문자를 보냅니다.

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
