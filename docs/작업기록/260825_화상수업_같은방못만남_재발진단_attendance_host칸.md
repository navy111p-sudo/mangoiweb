# 화상수업 「같은 방인데 서로 못 만남」 재발 진단 — Farrah/delaware class-895-20260825

- 날짜: 2026-08-25
- 작업자: 사장님(mangoi@mangoi.co.kr) 제보(화면 사진 2장) · Claude Code 조사
- 브랜치: `claude/classroom-connection-issue-dp815q`

## 1. 왜 했나

사장님 제보:

1. 학생 `delaware`(김연숙), 강사 `mangoi_167`(Farrah)
2. 2026-08-25(화) 09:30 수업
3. 강사·학생 **둘 다 입장은 정상**, 방 이름도 똑같이 `class-895-20260825`
4. 그런데 **서로 못 만났다**

첨부 스크린샷 2장이 이걸 그대로 보여준다.

| | 강사(사진 1 — 데스크톱) | 학생(사진 2 — 모바일) |
|---|---|---|
| 창 제목 | `Mangoi 화상솔루션 - Mangoi Video Solution` | (앱 웹뷰) |
| 방 번호 | `class-895-20260825` | `class-895-20260825` |
| 참여자 | **Users: 1** | **1** (헤더 `👤1`) |

이 신호는 **2026-08-19 「중국인 강선생님이 안 보임」 건**(`docs/작업기록/260819_강선생님_수업방_안보임_워커두벌_DO분리.md`)과
글자 그대로 같다 — 「같은 방 번호인데 둘 다 참여자 1명」. 그 건은 `test.mangoi.co.kr` 이 당시
**기본 워커**(`webrtc-unified-platform`)에 붙어 있어, `mangoi.ai`(`-prod`) 쪽 상대와
Durable Object 네임스페이스가 갈렸던 것이 원인이었고, 그날 `test.mangoi.co.kr` 을 `-prod` 로
옮겨 해결했다(CLAUDE.md 0장·2장에 기록됨). 그런데 그 조치가 있고 **6일 뒤** 같은 신호가 다시 나왔다.

## 2. 무엇을 확인했나 (그리고 무엇을 확인 "못" 했나)

### ① 코드 레벨 재확인 — 뿌리 구조는 그대로다

- `cloudflare-deploy/wrangler.toml` — 기본 환경과 `[env.production]` 이 **여전히 각자
  `new_sqlite_classes = ["VideoCallRoom"]` 을 따로 선언**한다(19~27행 주석에 이미 사고 이력이
  적혀 있음). 즉 워커가 두 벌(`webrtc-unified-platform` / `webrtc-unified-platform-prod`)이고,
  DO 네임스페이스는 지금도 스크립트마다 갈린다 — 이 구조 자체는 안 바뀌었다(바꾸는 것 자체가
  위험하다는 것도 이미 문서화돼 있음, 4장 참고).
- `cloudflare-deploy/public/js/idx-main.js:126` — `createWebSocket()` 이 여전히
  `` `${protocol}//${location.host}${path}` `` 로 방을 정한다. **어느 도메인으로 열었느냐가
  곧 어느 방이냐**라는 전제는 그대로다.
- `cloudflare-deploy/public/manifest.json` — `start_url: "/"`, `scope: "/"`, `display: "standalone"`.
  강사 사진의 창(주소창 없는 앱 창, 제목 「Mangoi 화상솔루션 - Mangoi Video Solution」)은
  **데스크톱에 설치된 PWA**로 보인다(제목이 manifest 의 `name` 과 정확히 일치, standalone 표시가
  이 모양을 만든다). **PWA 는 설치할 때의 origin 에 영구히 묶인다** — 상대경로 `start_url` 은
  설치 시점 페이지의 origin 으로 해석되고, 그 뒤로는 아이콘을 눌러도 항상 그 origin 으로 연다.
  Android APK 도 같은 문제가 있어 `START_URL` 이 바이너리에 박혀 있다는 것이 CLAUDE.md 0장에
  이미 적혀 있는데, **데스크톱 PWA 설치도 같은 성격의 함정**이라는 점은 이번에 새로 확인한 것이다
  (기존 문서는 APK 만 언급했다).

### ② 실측 확인 — 못 했다 (환경 한계, 추측 아님)

- **Cloudflare 대시보드**(Workers & Pages > 각 워커 > Domains & Routes)를 열어 지금 어떤
  도메인이 어느 워커에 붙어 있는지 — **이 세션에서는 접근 불가.** 인증된 `wrangler login` 세션이
  없다(`npx wrangler whoami` → `You are not authenticated`).
- **D1 SELECT** 로 `attendance`·`admin_login_history` 를 직접 조회 — 같은 이유로 불가
  (원격 D1 접근에도 인증된 wrangler 세션이 필요하다).
- **mangoi.ai·test.mangoi.co.kr 직접 curl** — 프록시가 403 으로 막는다(CLAUDE.md 4-1-1 에 이미
  적힌 환경 제약. `CONNECT tunnel failed, response 403` 실측).
- 따라서 **오늘 이 특정 수업이 실제로 어느 도메인/워커로 갈렸는지는 코드만으로 확정할 수 없다.**
  강한 정황(신호가 8/19 건과 동일)은 있지만, 「PWA 설치 origin이 원인이다」는 **가설**이지
  확인된 사실이 아니다.

## 3. 무엇을 바꿨나

코드로 두 워커를 하나로 합치거나(=서비스 전체가 걸린 도메인 재구성, 사람 승인 필요) WS 접속
호스트를 강제로 고정하는 방법(8/19 건에서 이미 「⛔ 버림」으로 기록됨 — `공동 금지구역`을
건드리는 데다 도메인 문제를 코드로 우회하는 것이라 뿌리를 안 고침)은 이번에도 택하지 않았다.

대신, **이 사고가 다시 나도 다음엔 D1 만으로 즉시 확인되게** 진단 칸 하나를 추가했다.

- `cloudflare-deploy/src/api-mango.ts`
  - `attendance` 표에 `host TEXT` 컬럼 추가(자가치유 `ALTER TABLE ... ADD COLUMN host TEXT`,
    기존 `account_uid`·`last_seen_at`·`spk_diag` 와 같은 패턴).
  - `POST /api/attendance/join` — INSERT 에 `host = request.headers.get('Host')` 를 함께 적는다.
  - `POST /api/attendance/checkin`(결석률 100% 버그 방어의 핵심 엔드포인트) — INSERT/UPDATE
    양쪽에 `host`(UPDATE 는 `COALESCE(host, ?)` 로 기존 값 보존)를 함께 적는다.

**왜 여기인가** — CLAUDE.md 2장에 이미 「D1·KV·R2 는 두 워커가 같은 id 를 공유한다 → 출석·토큰은
한 DB 에 같이 쌓여 «둘 다 같은 방에 있었다» 로 보인다. 갈리는 건 DO 하나뿐이라 DB 만 보면
못 찾는다」고 적혀 있다. 8/19 건이 오래 안 밝혀진 것도 이 때문이었다. `host` 를 남겨 두면
다음엔 아래 한 줄로 확인된다.

```sql
SELECT user_id, role, host FROM attendance WHERE room_id = 'class-895-...';
```

두 사람의 `host` 가 다르면 그게 원인이고(어느 도메인이 어느 워커에 붙어 있는지는 대시보드에서
확인), 같으면 이번 건은 8/19 건과 다른 원인이라는 뜻이다 — **둘 다 유용한 답**이다.

## 4. 왜 그렇게 풀었나 — 검토했다가 버린 방법

### ⛔ 버림 ①: `location.host` 를 `-prod` 호스트로 고정 (WS 접속 강제)

8/19 건에서 이미 검토·기각된 방법과 같다. `public/index.html`·`js/idx-main.js` 는
「🚫 공동 금지구역」이고, 도메인 라우팅 문제를 코드로 우회하면 뿌리(도메인이 어느 워커에
붙어 있는지 대시보드에서 계속 어긋날 수 있다는 사실)를 그대로 둔다.

### ⛔ 버림 ②: 두 워커를 하나로 합치기

가장 근본적인 해법처럼 보이지만, 사고 반경이 서비스 전체(운영 배포 파이프라인·DO 마이그레이션)라
사람 승인 없이 벌일 수 없다. 이번 지시 범위(진단 + 재발 시 즉시 확인 가능하게)를 벗어난다.

### ⛔ 버림 ③: attendance 표를 지금 SELECT 해서 오늘 건의 원인을 확정하기

시도했으나 **이 세션에 D1/Cloudflare 대시보드 접근 권한이 없어** 못 했다(2장 참고). 억지로
추측해서 "원인은 이것이다"라고 단정하지 않고, 확인 안 된 부분은 명시적으로 «확인 못 함» 으로
남겼다 — CLAUDE.md 4-5 「확인되지 않은 것을 "됐습니다"라고 하지 말 것」.

## 5. 확인한 방법

| 무엇 | 결과 |
|---|---|
| `cd cloudflare-deploy && node node_modules/typescript/bin/tsc --noEmit` | 통과 (0 에러) |
| `node test-harness/run.mjs --fast` (리포 루트) | PASS 207 / SKIP 20 / FAIL 0 |
| `node test-harness/attendance_last_seen_harness.mjs` 단독 | 35/35 통과 |

⚠️ `attendance_last_seen_harness.mjs` 가 처음엔 FAIL 했다 — `host` 칸을 추가하면서
① 하니스가 만드는 가짜 SQLite 스키마에 `host` 컬럼이 없어 INSERT 가 그대로 실패했고,
② `checkin INSERT 의 last_seen_at 바인딩이 srvNow 다` 검사가 **placeholder 개수(9개)와
`srvNow).run()` 이 바로 붙어 있는 모양을 그대로 못 박아** 뒀던 것이 새 칸(`host`)이 그 뒤에
붙으면서 깨졌다. CLAUDE.md 2장 「하니스가 «객체 모양» 을 정규식으로 못 박아 두어 칸 하나
늘렸더니 FAIL」과 정확히 같은 패턴이라, 그 항목의 지침대로 **뜻(= INSERT 가 last_seen_at 자리에
srvNow 를 바인딩하는가)만 검사**하도록 정규식을 풀었다(`test-harness/attendance_last_seen_harness.mjs`).
가짜 스키마에도 `host TEXT` 를 추가했다.

### 확인하지 못한 것 (중요)

- 🔴 **오늘 이 수업(class-895-20260825)에서 강사·학생이 실제로 어느 도메인/워커를 썼는지.**
  이 세션은 Cloudflare 대시보드도 D1 실측도 볼 수 없다(2장 참고). 아래 「남은 것」의 ①②가
  이걸 사람이 확인해야 하는 이유다.
- `host` 컬럼을 추가한 배포가 아직 나가지 않았으므로, 이번 사고 자체는 이 칸으로 사후 조회할
  수 없다(로그에도 남아 있지 않을 가능성이 높다 — Workers Logs 는 `head_sampling_rate = 0.05`
  라 5%만 샘플링된다).

## 6. 남은 것 / 주의할 것

1. 🔴 **사람이 Cloudflare 대시보드에서 확인해야 하는 것**: `webrtc-unified-platform` 과
   `webrtc-unified-platform-prod` 각각의 Settings → Domains & Routes 를 열어, `mangoi.ai` ·
   `www.mangoi.ai` · `test.mangoi.co.kr` 이 **전부 `-prod` 하나에만** 붙어 있는지 확인.
   (8/19 에 `test.mangoi.co.kr` 을 옮긴 뒤로 되돌아갔거나, 제3의 도메인이 기본 워커에
   남아 있을 가능성을 배제할 수 없다.)
2. 🔴 **Farrah(`mangoi_167`) 본인 확인 필요**: 화면 1(데스크톱, 창 제목 「Mangoi 화상솔루션」)이
   맞다면 이건 **바탕화면/시작메뉴에 설치된 PWA 아이콘**일 가능성이 크다. 그 아이콘을 처음 설치한
   시점에 열려 있던 주소가 무엇이었는지에 따라 지금도 그 주소로 고정돼 있을 수 있다(마치 옛 APK가
   `test.mangoi.co.kr` 을 계속 보는 것과 같은 성격 — 단, 이건 데스크톱 PWA라 CLAUDE.md 0장의
   APK 항목과는 다른, 이번에 새로 짚은 경로다). **확실한 조치**: 그 아이콘을 지우고,
   `https://mangoi.ai` 를 새로 열어 다시 "설치"하도록 안내. (오리진이 이미 `mangoi.ai` 였다면
   재설치해도 잃는 것은 없다 — 로그인은 오리진 기준 `localStorage` 이므로 같은 오리진 재설치는
   영향 없음.)
3. **다음 수업에서 재확인**: `host` 칸이 배포된 뒤 같은 두 사람이 다시 수업하면
   `SELECT user_id, role, host FROM attendance WHERE room_id LIKE 'class-895-%'` 로 즉시 확인 가능.
4. 이번 건은 CLAUDE.md 2장에 **새 함정 표 항목을 추가하지 않았다** — 8/19 건과 뿌리가 같은
   재발이라 그 표의 기존 항목(「같은 방 번호인데 서로 안 보이고 둘 다 「참여자 1명」」)이 이미
   덮는다. 다만 그 항목 본문에 "도메인 이전(8/19)으로 해결됨"이라고 과거형으로 적혀 있어,
   이번처럼 재발할 수 있다는 점과 데스크톱 PWA 설치 origin 이라는 새 경로는 아직 반영돼 있지
   않다 — 대시보드 확인 결과가 나오면(위 1·2번) 그 결과에 맞춰 CLAUDE.md 항목을 갱신할 것.
