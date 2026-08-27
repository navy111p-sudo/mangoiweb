# 같은 방 번호인데 서로 못 만난 수업 — delaware · Farrah 8/25 21:30 조사 — 2026-08-25

- **날짜**: 2026-08-25 (조사 2026-08-27)
- **작업자**: 사장님(정우영) 제보 · Claude Code 조사
- **브랜치**: `claude/classroom-connection-issue-vki673`
- **성격**: **조사 보고서.** 운영 코드는 한 줄도 바꾸지 않았습니다.
- **보고서(그림 포함)**: Artifact 「같은 방 번호, 다른 교실」

---

## 1. 왜 했나

사장님 제보(화면 사진 2장):

| | 학생 delaware (김연숙) | 강사 mangoi_167 (Farrah) |
|---|---|---|
| 방 번호 | `class-895-20260825` | `class-895-20260825` |
| 참여자 | **1명** | **Users: 1** |
| 기기 | 안드로이드 세로 | PC · **앱 창(주소창 없음)** |
| 화면 | 「선생님을 부르는 중… (0:10)」 | 혼자 · 교재만 |

둘 다 정상 입장했고 방 번호도 같은데 서로를 보지 못했습니다.

---

## 2. 결론

**워커가 두 벌이라 화상수업 «방» 이 갈렸습니다.** 2026-08-19 중국인 강선생님 건
(`260819_강선생님_수업방_안보임_워커두벌_DO분리.md`)과 **같은 뿌리**입니다.

- 이 저장소는 배포마다 워커를 두 벌 올립니다 — `webrtc-unified-platform`(기본) · `webrtc-unified-platform-prod`(운영).
- `wrangler.toml` 이 **환경마다 `new_sqlite_classes = ["VideoCallRoom"]` 을 따로 선언**합니다.
  Durable Object 네임스페이스는 **스크립트마다** 만들어지므로 `idFromName("class-895-20260825")` 이
  워커마다 **다른 방**을 엽니다.
- WebSocket 주소는 `location.host` 로 만들어집니다(`public/js/idx-main.js` `createWebSocket`)
  → **어느 도메인으로 열었느냐가 곧 어느 방이냐**.

### 사진에서 읽어낸 것

- 🔴 **학생은 `mangoi.ai` 였습니다.** 화면 맨 아래 안드로이드 안내문이
  `mangoi.ai: 전체 화면을 종료하려면…` 으로 시작합니다. 안드로이드가 «지금 보고 있는 사이트 주소» 를
  그대로 찍어 주는 문구라 확정입니다.
- ⚠️ **강사 쪽은 주소를 알 수 없습니다.** 창 제목이 「Mangoi 화상솔루션 - Mangoi Video Solution」 =
  `manifest.json` 의 앱 이름 + 영어로 번역된 페이지 제목 → **설치한 앱(바로가기) 창**.
  앱 창에는 주소창이 없어 **강사 본인도 우리도 볼 수 없습니다.** 이 사고가 안 보이는 가장 큰 이유입니다.

---

## 3. 무엇을 확인했나 — 다른 설명을 하나씩 지웠다

D1 접근이 없는 환경이라 **코드·설정·회귀 하니스**로만 판정했습니다.

| 확인 | 결과 |
|---|---|
| 방 번호 계산식이 강사·학생 다른가 | ❌ 같다. `class-{예약id}-{YYYYMMDD}`. `worker_do_split_harness` ④ 가 `api-mango.ts`(학생)·`api-teacher.ts`(강사)가 같은 식을 쓰는지 못 박고 있고 **11건 전부 통과** |
| 화면 글자와 실제 접속 방이 다를 수 있나 | ❌ 같다. `vc-room-name.textContent = vcRoomId` 이고 접속도 같은 `vcRoomId`. 입력값은 `.trim()` 을 거친다(보이지 않는 공백 불가) |
| 「참여자 1명」이 화면이 대충 센 값인가 | ❌ 아니다. `updateUserCount()` 는 DO 가 보낸 `room-joined`·`user-joined`·`user-left` 의 값만 쓴다 = **방 서버가 «한 명» 이라고 답한 것** |
| 한 워커 «안에서» 갈릴 수 있나 | ❌ 없다. `idFromName(roomId)` 을 그대로 넘기는 것이 전부. 역할별 분리·샤딩 없음, 정원 10명, 재접속 인계 키 `clientId` 는 **탭마다 난수**(`sessionStorage`)라 남의 소켓을 닫을 수 없다 |
| 강사 화면의 «P2P: Connected» 가 «만났다» 는 증거인가 | ⚠️ **증거 아니다.** 그 글자를 쓰는 곳은 `pc.oniceconnectionstatechange` **한 군데뿐이고 지워 주는 곳이 없다** → 한 번 «연결됨» 이 되면 상대가 나가도 그대로 남는다(앞선 접속의 잔상일 수 있음) |

**남는 결론**: 같은 방 이름 + 양쪽 다 「1명」 + 같은 시간대 → 서로 다른 워커의 방.
⚠️ 다만 **«같은 시간대였는가» 는 사진만으로 확정 불가** — 아래 검사 1 이 가려 줍니다.

---

## 4. 사람이 해야 하는 확정 절차 (전부 SELECT · 서비스 무영향)

### 검사 1 — 두 사람이 정말 같은 시간에 있었나 (제일 먼저)

```sql
SELECT role, username, user_id,
       datetime(joined_at/1000,'unixepoch','+9 hours') AS 입장_KST,
       datetime(COALESCE(left_at,last_seen_at)/1000,'unixepoch','+9 hours') AS 퇴장_KST,
       total_active_ms/1000 AS 활성초, disconnect_count
FROM attendance
WHERE room_id = 'class-895-20260825'
ORDER BY joined_at;
```

구간이 **겹치는데 서로 못 봤다면 워커 분리가 확정**입니다
(D1·KV·R2 는 두 워커가 공유하므로 «둘 다 그 방에 있었다» 로 남습니다 — 갈리는 건 DO 하나뿐).
안 겹치면 단순 엇갈림입니다.

### 검사 2 — 강사가 어느 주소에 있는지 알아내기

수업 화면 왼쪽 아래 **「🐞 Report bug」** 버튼이 `page_url: location.href` 를 그대로 저장합니다
(`bug_reports.page_url`, `api-admin.ts:11562`). Farrah 에게 수업 중 한 줄 보내 달라고 하면 주소가 잡힙니다.
이미 보낸 적이 있으면 지금 확인되고, **한 사람이 아니라 전원**을 훑습니다.

```sql
SELECT id, reporter_name, reporter_uid, page_url,
       datetime(created_at/1000,'unixepoch','+9 hours') AS KST
FROM bug_reports ORDER BY created_at DESC LIMIT 100;
```

`page_url` 이 `mangoi.ai`·`www.mangoi.ai`·`test.mangoi.co.kr` 셋 중 하나가 아니면 그 사람은 갈라진 워커에 있습니다.

### 검사 3 — 2분 만에 재현 (실제 수업 무접촉)

회의방(`/?meet=`)은 방 이름이 `meet-<번호>` 라 예약 수업방과 절대 섞이지 않습니다.

- 창 A: `https://mangoi.ai/?meet=split-test`
- 창 B: `https://webrtc-unified-platform.navy111p.workers.dev/?meet=split-test`
- 이어서 창 B 를 `https://test.mangoi.co.kr/?meet=split-test` 로도 한 번

서로 안 보이면 그 두 주소는 다른 워커입니다.
**`test.mangoi.co.kr` 조합이 안 보이면 8/19 에 옮긴 도메인이 되돌아간 것**이라 즉시 고쳐야 합니다.

### 검사 4 — 대시보드에서 눈으로

도메인이 어느 워커에 붙어 있는지는 **코드 어디에도 없습니다**(`wrangler.toml` 에 `routes` 없음).
**Workers & Pages ▸ 워커 ▸ Settings ▸ Domains & Routes** 를 두 워커 각각 열어,
사람이 쓰는 도메인이 **`-prod` 한쪽에만** 있는지 확인하세요.

---

## 5. 조치

### 지금 (사람 · 코드 변경 없음)

- Farrah 는 앱 창 말고 **일반 크롬 창에서 `https://mangoi.ai`** 로 입장 → 다음 수업은 만납니다.
- 기존 망고아이 앱(바로가기)을 **삭제**하고 `https://mangoi.ai` 에서 다시 설치.
  **앱의 주소는 설치할 때 굳어져서 나중에 바뀌지 않습니다.**
- 🔴 **급여가 걸려 있습니다.** 학생이 5분 기다리면 `class_no_show` 에 「강사 미입장」이 남고
  그 상태면 그 수업은 **수업료 0원**입니다. 8/19 에 만든 오판 표시(`src/no-show-truth.ts`)가
  출석과 대조해 걸러 주게 돼 있지만 **이번 건이 실제로 «오판» 으로 표시되는지 눈으로 확인**할 것.

  ```sql
  SELECT room_id, missing_role, teacher_name, student_name, waited_min,
         datetime(created_at/1000,'unixepoch','+9 hours') AS KST
  FROM class_no_show WHERE room_id = 'class-895-20260825';
  ```

### 이번 주 (코드 · 공동 금지구역 아님)

**기본 워커 주소를 사람에게 내주는 곳이 아직 세 군데 남아 있습니다.**

| 위치 | 무엇 |
|---|---|
| `src/api-reports.ts:16` | `MONTHLY_SITE_ORIGIN` — 월간 AI 리포트 링크 기본값 |
| `src/exec-summary.ts:311` | 경영브리핑 문자의 대시보드 링크 |
| `public/admin/student.html:225` | 학생 상세 화면 「망고아이」 로고 → «학생 홈페이지로 이동» |

셋 다 `src/site-url.ts` 의 `SITE_ORIGIN` 으로 바꿔야 합니다.
⚠️ 기존 `outgoing_link_domain_harness`(71건 통과)는 **이 세 곳을 보고 있지 않습니다** — 함께 등재할 것.

### 구조 (배포 권한자 · 공동 금지구역 포함)

⚠️ **「워커를 한 벌로 합치면 되지 않나」는 간단하지 않습니다.**
**cron 5개가 «기본» 워커에만 등록돼 있습니다** — `[triggers]` 는 기본 환경, `[env.production.triggers]` 는 `crons = []`.
즉 **손님이 쓰는 쪽은 `-prod`, 밤에 일하는 쪽은 기본 워커**입니다. 기본 워커를 지우면
카페24 동기화·정기결제·미납독촉·경영브리핑·15분 감시견이 전부 멈춥니다. cron 이전을 포함하는 별건 작업입니다.

**대신 기본 워커에서 «수업 입구» 만 막습니다.** 지금 워커는 자기가 어느 워커인지 모릅니다 →
`[vars] WORKER_ROLE = "cron"` / `[env.production.vars] WORKER_ROLE = "live"` 한 줄씩 달고,
`live` 가 아닌 워커에서는 ① `/ws/video-call` 업그레이드 거절 ② 수업 화면에 「이 주소에서는 수업에
들어갈 수 없어요 → mangoi.ai」 안내. 그러면 **«조용히 다른 교실» 이 사라집니다**(사람이 즉시 알아챕니다).

**사후 추적**: `attendance` 에 접속 host 한 칸을 남기면 다음부터는 SQL 한 줄로 끝납니다
(기록 위치 `src/api-mango.ts` 487·501·706행). ⚠️ 컬럼 추가는 운영 DB 변경이라 **승인 후**.

---

## 6. 검토했다가 버린 방법

### ⛔ 버림 ①: `wrangler.toml` 에 `routes` 를 적어 도메인 못 박기

`routes` 는 «추가» 가 아니라 **«전체 목록»** 입니다. 한 줄만 적으면 **`mangoi.ai` 가 떨어져 서비스가 내려갑니다.**
덤으로 `workers_dev` 가 `false` 로 추론돼 배포 확인 스크립트 3개가 함께 깨집니다.
(8/19 에도 사장님 요청이 있었지만 같은 이유로 넣지 않았습니다.)

### ⛔ 버림 ②: `test.mangoi.co.kr` → `mangoi.ai` 리다이렉트

오리진이 바뀌면 그 도메인에 등록된 **패스키 6건이 무효화**되고 앱 사용자의 `localStorage` 로그인이 날아갑니다.
**도메인을 «옮기면» 오리진이 그대로**라 아무것도 잃지 않습니다 — 8/19 에 그렇게 했습니다.

### ⛔ 버림 ③: WebSocket 접속 호스트를 코드에 못 박기

`createWebSocket` 의 `location.host` 를 `-prod` 로 고정하면 코드만으로 끝나 보입니다.
**8/19 에도 검토하고 버린 안**입니다 — `public/index.html`·`idx-main.js` 는 사고 반경이 화상수업 전체이고,
도메인 한 줄을 옮기면 되는 일을 코드로 우회하면 뿌리가 그대로 남습니다.
위의 「기본 워커에서 입구만 막기」가 같은 목적을 안전한 쪽에서 이룹니다.

### ⛔ 버림 ④: 노쇼 기록을 지우거나 UPDATE 로 «정리»

학생이 선생님을 못 본 것은 **사실**입니다. 지우면 「왜 이 수업이 성립하지 않았나」가 함께 사라집니다.
읽을 때 출석과 대조해 «오판» 이라고 알려 주는 지금 방식(`src/no-show-truth.ts`)이 맞습니다.

### ⛔ 버림 ⑤: 사진의 «P2P: Connected» 를 「만났다」의 근거로 삼기

그 라벨은 **초기화되지 않습니다**(쓰는 곳 1군데, 지우는 곳 0군데). 근거로 쓰면 없는 사실을 만듭니다.

---

## 7. 함께 확인할 것 — 이번 건과 별개

`CLAUDE.md` 에 **2026-08-24 실측**으로 `mangoi_167`(7/30 · **HANNAH 로 연결됨**)과
`Mangoi_167`(8/24 · 연결 없음)이 나란히 있었다고 적혀 있습니다(대소문자 문제 자체는 8/24 수리).

그런데 **이번 제보에서는 `mangoi_167` 이 Farrah** 입니다. 연결이 HANNAH 로 남아 있다면
강사 화면의 수업 목록·출근·**급여**가 다른 사람 것으로 흐릅니다. 뿌리는 다르지만 같은 계정 문제라 함께 볼 것.

```sql
SELECT username, teacher_id, teacher_name,
       datetime(linked_at/1000,'unixepoch','+9 hours') AS KST
FROM teacher_account_links WHERE LOWER(username) = 'mangoi_167';

SELECT LOWER(username) k, COUNT(*) n, GROUP_CONCAT(username)
FROM admin_account GROUP BY k HAVING n > 1;
```

---

## 8. 확인 방법과 한계

- `node test-harness/worker_do_split_harness.mjs` → **11건 전부 통과**(방 이름 계산식 일치 포함)
- `node test-harness/outgoing_link_domain_harness.mjs` → **71건 전부 통과**
  (⚠️ 통과했지만 5장의 세 곳은 이 하니스의 검사 대상이 아닙니다)
- 🔴 **배포된 실제 화면과 운영 DB 는 확인하지 못했습니다** — 작업 환경 프록시가 `mangoi.ai` 를 막습니다
  (CLAUDE.md 4-1-1). 4장의 검사 1~4 는 **사람이 실행해야** 확정됩니다.
