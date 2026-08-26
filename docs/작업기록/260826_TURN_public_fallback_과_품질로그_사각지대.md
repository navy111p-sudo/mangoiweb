# 「자꾸 튕겨나가」의 진짜 원인 — TURN 무료 폴백, 그리고 그것을 아무도 몰랐던 이유

**날짜** 2026-08-26 · **브랜치** `claude/face-size-control-ui-1dsntj`
**요청** 사장님 — 「필리핀이나 중국쪽에서 최대한 가볍게 했어? 무거우면 자꾸 튕겨나가」 → 「끊기는 원인 찾아줘」 → 「둘 다 해줘」

---

## 1. 왜 했나

크기바 작업 마무리 중에 사장님이 물으셨습니다. 「무거우면 자꾸 튕겨나가」.
처음엔 **무게 문제**로 읽고 크기바를 더 가볍게 다듬었습니다(PR #510, gzip 2.4KB + 상시 리스너 제거).
그런데 그건 곁가지였습니다.

D1 을 SELECT 로만 훑어 본 결과가 무게로는 설명이 안 됐습니다.

| 측정 | 값 | 뜻 |
|---|---|---|
| `attendance.disconnect_count` | **전 행 0** | 죽은 칸이라 아무 단서가 없다 |
| 강사 재입장 (실제 수업, 14일) | 21세션 중 **13세션(61.9%)**, 최다 8~10회 | 학생은 18세션 중 5(27.8%) |
| `vc_quality` RTT | **389~629 ms** | KR↔PH 직접은 60~90ms |
| 같은 구간 패킷 손실 | **0.7~4.2%** (낮음) | **회선이 나쁜 게 아니다** |

**손실은 낮은데 지연만 크다** — 회선 불량이 아니라 «경로가 멀다» 는 지문입니다.
그래서 사장님께 30초짜리 확인 하나를 부탁드렸습니다.

```
curl -sI https://mangoi.ai/api/turn-config | grep -i x-turn-source
```

답: **`public-fallback`**.

---

## 2. 그 한 줄이 뜻하는 것

`handleTurnConfig()`(`src/index.ts`)는 네 단계입니다.

| 순서 | `X-Turn-Source` | 뜻 |
|---|---|---|
| 0 | `kv-cache` | 1시간 캐시 (정상) |
| 1 | `cloudflare` | CF TURN 새로 발급 (정상) |
| 2 | `last-known-good` | CF 가 잠깐 흔들림 — 24시간 전 성공분 재사용 |
| 3 | **`public-fallback`** | 🔴 `openrelay.metered.ca` (무료 공용) |

3번에 닿으려면 **CF 호출이 실패하고 «동시에»** 24시간짜리 마지막 성공분
(`turn:ice-servers:last-good`)이 비어 있어야 합니다.
`wrangler.toml` 확인 결과 `SESSION_STATE` KV 는 두 워커 모두 정상 연결(`7fc5f228…`)이었습니다.
**저장할 곳은 멀쩡한데 저장된 게 없다 = 24시간 안에 한 번도 성공한 적이 없다**
→ `TURN_KEY_ID` / `TURN_KEY_API_TOKEN` 이 **애초에 설정돼 있지 않다**는 뜻입니다.

그 폴백의 코드 주석이 이미 경고하고 있었습니다.

> 그 서버는 50명을 받을 수 있는 서버가 아니라서, **아무 에러 없이 «영상만 안 나오는»** 상태가 된다.

### 덤 — 중국 대책도 함께 죽어 있었다

2026-08-21 중국어 수업(`class-851`) 뒤에 넣은 «강사별 강제 릴레이»(`vc_relay_force`)가
`api-mango.ts:1745` 에서 `hasCfTurn` 에 묶여 있습니다.

```ts
const hasCfTurn = !!(env.TURN_KEY_ID && env.TURN_KEY_API_TOKEN);
netRelay = hasCfTurn && !!(rrow && Number(rrow.enabled) === 1);
```

판단 자체는 맞습니다(무료 TURN 으로 «강제» 릴레이하면 더 나빠짐).
다만 「중국 대책을 넣었다」고 적힌 것이 **한 번도 동작한 적이 없는 상태**였습니다.

---

## 3. 진짜 문제는 «틀렸다» 가 아니라 «아무도 말해 주지 않았다»

사장님 지시는 「둘 다 해줘」였습니다. 고친 것은 **원인**이 아니라 **원인이 숨을 수 있었던 두 구멍**입니다.
(시크릿 등록 자체는 배포 권한자만 할 수 있고, 코드로 할 일이 아닙니다.)

### ① TURN 경로를 아무도 안 봤다

* `deploy.yml` 의 «Check required secrets» 는 `CLOUDFLARE_API_TOKEN`/`ACCOUNT_ID` **둘만** 봅니다.
* 2층 감시견(`ops/mangoi-watchdog.sh`)의 판정 네 가지(`http`·`domain`·`db`·`cron`)에도 **한 개도 안 걸립니다** —
  사이트는 200, D1 도 cron 도 정상이니까요. 전형적인 «조용한 장애» 입니다.
* 그래서 **언제부터 이랬는지조차 알 수 없었습니다.**

**고침**

* `deploy.yml` — 배포마다 두 워커의 `/api/turn-config` 를 불러 `X-Turn-Source` 를 요약(Job Summary)에 표로 찍습니다.
  `public-fallback` 이면 `::error::` 애노테이션 + 「고치는 법」(wrangler 명령 4줄)을 함께 남깁니다.
* `ops/mangoi-watchdog.sh` — **15분 연속**(`TURN_FAIL_THRESHOLD=3`) `public-fallback` 이면 문자를 1통 보냅니다.

### ② 진단 로그가 정작 필요한 사람을 안 찍었다

적응 루프(`js/idx-main.js`)에 이 줄이 있습니다.

```js
if (dSent + dLost < 25) return;   // 표본 부족 → 판단 보류
```

그 `return` 이 `vcQualityAcc()` **앞**이라, 영상 전송 패킷이 0 인 사람 —
**카메라를 껐거나 영상이 죽은 사람 = 「왜 안 보이나」를 알아야 할 바로 그 사람** — 은
기록이 **통째로** 안 남았습니다. 8/26 하루 예상 ~2,900건 중 실제 **25건(약 1%)**.

**고침** — 그 틱을 `loss = -1` 로 넘겨 `novideo`(영상 없던 틱 수)로 **세기만** 합니다.
표본이 하나도 없어도(`novideo` 만 있어도) 60초 요약은 나갑니다. 그게 핵심입니다.

---

## 4. 검토했다가 버린 방법

| 버린 방법 | 왜 |
|---|---|
| **표본 없음을 `loss = 0` 으로 기록** | 「표본이 없다」와 「손실 0%」는 다른 사실입니다. 0 으로 적으면 **영상이 죽은 사람이 «회선이 제일 좋은 사람»** 이 되어 원인 추적을 정반대로 이끕니다. 그래서 평균에는 안 섞고 `novideo` 로 따로 셉니다 |
| **TURN 이 없으면 배포를 «실패» 시키기** | TURN 없이도 수업은 (느리게) 됩니다. 여기서 막으면 이 문제와 무관한 수정까지 못 나갑니다. 경고는 크게, 배포는 통과(`exit 0`) |
| **감시견에서 «측정 실패(빈 값)»도 경보** | 「모름」을 「나쁨」으로 단정하면 거짓 경보가 나고, 거짓 경보는 감시를 죽입니다. 측정에 실패한 경우는 사이트 자체가 이상한 것이고 기존 얕은/심층 점검이 이미 담당합니다. 그래서 **오직 `public-fallback` 만** 나쁨이고, 빈 값은 어느 쪽으로도 상태를 안 바꿉니다 |
| **`last-known-good` 도 문자 보내기** | 그건 자격증명이 아직 «진짜» 이고 수업은 정상입니다. 배포 요약에는 ⚠️ 로 남기되 문자는 안 보냅니다 |
| **TURN 상태를 기존 장애 상태(`REASON`)에 섞기** | 복구 문자가 「사이트가 정상 복구되었습니다」로 나가 사람을 헷갈리게 합니다. `PREV_TURN`/`TFAILS` 로 **따로** 관리합니다 |
| **`novideo` 를 `CREATE TABLE` 에 추가** | `vc_quality` 의 CREATE 가 `api-mango.ts`·`api-admin.ts` **두 벌**입니다. `IF NOT EXISTS` 는 먼저 실행된 쪽이 이기므로 한쪽 모양만 바꾸면 새 DB 에서 결과가 갈립니다(`schema_drift_harness` 가 실제로 FAIL 을 냈습니다). → `attendance.host` 와 같이 **`ALTER` 로만** 붙였습니다 |
| **`vcQualityAcc` 를 idx-main.js 에 그대로 두고 고치기** | 첫 화면 예산 여유가 **351바이트**였습니다(실측). 대신 그 함수(1.5KB)를 `js/idx-vc-qlog.js`(defer)로 **내보내서** 예산을 **1,825바이트로 늘리고** 제자리 수정은 한 줄로 끝냈습니다 |
| **defer 파일에서 `vcQualityAcc` 를 «감싸서» 고치기** | 감싸는 쪽이 원본의 누적·전송을 못 건드립니다. 표본이 하나도 없으면 원본이 애초에 안 보내므로 감싸기로는 사각지대를 못 엽니다 |
| **`src/index.ts` 를 손대기** | 공동 금지구역이고, 애초에 **코드 문제가 아니라 시크릿 문제**라 고칠 코드가 없습니다 |

---

## 5. 바뀐 파일

| 파일 | 무엇 |
|---|---|
| `.github/workflows/deploy.yml` | 배포마다 두 워커의 `X-Turn-Source` 점검 + 요약·애노테이션·고치는 법 |
| `ops/mangoi-watchdog.sh` | TURN 경로 감시(별도 상태 `PREV_TURN`/`TFAILS`, 15분 임계, 상태 변화 때만 1회) |
| `cloudflare-deploy/public/js/idx-vc-qlog.js` | **신규(defer)** — `vcQualityAcc()` 이사 + `novideo` |
| `cloudflare-deploy/public/js/idx-main.js` | 그 함수 제거(−1,474B) · 표본 부족 틱에서 `vcQualityAcc(-1, rtt)` 호출 |
| `cloudflare-deploy/public/index.html` | 새 defer 태그 · `idx-main.js?v=38→39` |
| `cloudflare-deploy/public/teacher.html` | preload `?v=` 동기화 (`home_bg_preload_harness` ⑦) |
| `cloudflare-deploy/src/api-mango.ts` | `vc_quality.novideo` — `ensureSchemaOnce` + `ALTER` + INSERT |
| `test-harness/vc_turn_quality_harness.mjs` | **신규 38종** |
| `test-harness/vc_quality_log_harness.mjs` | 함수가 이사했으므로 두 파일을 함께 봄 + 새 검사 1종 |
| `CLAUDE.md` · `docs/ENVIRONMENT.md` · `docs/TROUBLESHOOTING.md` | 함정 2행 · TURN 확인 절차 |

---

## 6. 확인한 방법

* **타입체크** `node node_modules/typescript/bin/tsc --noEmit` → exit 0
  ⚠️ 이 컨테이너는 Node 22 라 `npm ci` 가 ERESOLVE 로 죽습니다(CLAUDE.md 2장, CI 는 Node 24).
  `--legacy-peer-deps` 로 설치했습니다 — 임시방편입니다.
* **회귀 하니스** `node test-harness/run.mjs --fast` → **PASS 216 / SKIP 20 / FAIL 0**
  (작업 도중 `schema_drift`·`vc_quality_log` 두 개가 실제로 FAIL 을 냈고, 둘 다 원인을 고쳤습니다 —
  전자는 CREATE 대신 ALTER 로, 후자는 이사한 파일까지 보도록.)
* **새 하니스가 «옛 동작에서 진짜 FAIL 하는지»** 를 되돌려 확인했습니다 →
  고침을 되돌리면 **29 PASS / 9 FAIL**. 통과만 확인하면 아무것도 지키지 못하는 하니스가 됩니다.
* **첫 화면 예산** 실측 — 여유 **351B → 1,825B** (`first_paint_budget_harness` 통과)
* **감시견** — 기존 30종이 그대로 통과(TURN 검사가 기존 판정을 흔들지 않음).
  ⚠️ 그 하니스 2부는 `node_modules/esbuild` 가 없어 이 컨테이너에서 실행되지 않습니다(작업 전부터 그랬습니다).
* **문자열 검사로는 못 잡는 부분**은 `vc_turn_quality_harness` 3부가
  `js/idx-vc-qlog.js` 를 `node:vm` 으로 **실제 실행**해 나가는 payload 를 읽습니다
  (평소/사각지대/섞임/60초 이전/누적 초기화 5가지).

---

## 6-2. 📌 배포 후 관측 — 값이 바뀌었는데 «왜» 는 모릅니다

PR #518 병합 → 배포 run #2717 성공(2분 28초). 그 배포에서 **이번에 새로 넣은
「TURN 경로 점검」 단계가 처음 돌았고**, 이렇게 찍혔습니다.

```
기본       → kv-cache → ✅ 정상
production → kv-cache → ✅ 정상
```

`TURN_CACHE_KEY` 는 **Cloudflare TURN API 호출이 성공했을 때만** 기록되고 수명은
1시간입니다(`src/index.ts` 4204행). 무료 폴백은 캐시에 절대 들어가지 않습니다.
→ **07:40:54 기준 최근 1시간 안에 발급이 실제로 성공했습니다. 지금은 정상입니다.**

⚠️ **그런데 왜 바뀌었는지는 확인하지 못했습니다.** 여기서 구분할 방법이 없습니다.

| 가능성 | 성립 조건 |
|---|---|
| (가) 그사이 시크릿을 등록했다 | 가장 자연스럽다 |
| (나) 시크릿은 원래 있었고 CF TURN API 가 장애였다가 복구됐다 | `public-fallback` 이 나오려면 24시간짜리 LKG 도 비어 있어야 하므로 **24시간 넘는 CF 장애**여야 한다 |

⚠️ 그래서 **「시크릿이 없었다」는 제 «추론» 이었고 «측정» 이 아니었습니다.**
측정된 것은 「그 시점에 무료 폴백을 타고 있었다」까지입니다. 위 두 원인 어느 쪽이든
같은 증상(RTT 389~629ms · 손실 낮음 · 재입장 61.9%)을 냅니다.

⛔ 어느 쪽이라고 단정해 문서에 적지 않았습니다. `docs/ENVIRONMENT.md` 에 **관측 표**
(시각 · 값 · 누가 어떻게 쟀나)로만 남겼고, 확인되면 **줄을 덧붙이되 윗줄은 지우지
말라**고 적어 뒀습니다 — 「하기로 한 것」이 「했다」로 적혀 6일 뒤 같은 사고가 재발한
전례가 이 저장소에 있습니다(CLAUDE.md 2장).

✅ 어느 쪽이든 **이제는 사람이 기억할 필요가 없습니다.** 이 PR 이 넣은 두 감시가
바로 그 일을 합니다 — 그리고 그 첫 실행이 위 출력입니다.

📌 참고: 제가 직접은 확인할 수 없습니다(`curl` → 프록시 403). 위 값은 GitHub 러너에서
잰 것이고, 그것이 이 환경에서 얻을 수 있는 유일한 실측입니다.

---

## 7. ⏳ 아직 안 된 것 — 사람이 해야 합니다

**시크릿 등록.** 이게 진짜 고침이고, 배포 권한자만 할 수 있습니다.

```bash
# Cloudflare 대시보드 → Calls → TURN 에서 키 발급 후
cd cloudflare-deploy
npx wrangler secret put TURN_KEY_ID
npx wrangler secret put TURN_KEY_API_TOKEN
npx wrangler secret put TURN_KEY_ID        --env production
npx wrangler secret put TURN_KEY_API_TOKEN --env production

# 확인 — cloudflare 가 나오면 정상
curl -sI https://mangoi.ai/api/turn-config | grep -i x-turn-source
```

⚠️ **워커 두 벌 모두**에 넣어야 합니다. 하나만 넣으면 한쪽 도메인 사용자만 고쳐집니다
(`test.mangoi.co.kr` = 기본 워커, `mangoi.ai` = `-prod` — CLAUDE.md 0장).

💰 Cloudflare TURN 은 월 1TB 무료입니다. 20분 1:1 수업이 대략 100~200MB 이므로
하루 143건이어도 여유가 큽니다.

📌 넣고 나면 이 문서와 `docs/ENVIRONMENT.md` 의 「🔴 2026-08-26 실측 «미설정»」 표시를
**확인한 날짜와 함께** 고쳐 주세요. 코드 밖 상태를 완료형으로 적었다가 6일 뒤 같은 사고가
재발한 전례가 있습니다(CLAUDE.md 2장 「문서에 「고쳤다」고 적혀 있는데 같은 사고가 또 남」).

⏳ **`attendance.disconnect_count` 가 전 행 0** 인 것은 이번에 안 건드렸습니다.
채우려면 화상수업 DO(`src/video-call-room.ts`, 공동 금지구역)를 봐야 하고,
`novideo` 가 들어오기 시작하면 그 값으로도 상당 부분 답할 수 있어 먼저 지켜보는 편이 낫습니다.
