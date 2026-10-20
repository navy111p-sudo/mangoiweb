# 수업 관찰 — 방 번호에 작은따옴표(')가 있으면 버튼이 통째로 죽던 것 수리 (2026-10-19)

## 왜 했나
전날 «예약 기준 지금 수업» 줄에 «🚪 직접 입장(보임)» 버튼을 붙인 뒤(#1651), 사장님 지시로
**하니스와 샌드박스(브라우저)로 수백 번 반복 검사해 문제가 없을 때까지** 돌렸다.

퍼즈(무작위 방 번호·이름을 넣어 adm-s1.js 를 실제로 돌리고 onclick 을 실제로 누르는 검사)가
**한 가지 문제**를 찾았다 — 방 번호에 작은따옴표(`'`)가 들어가면 그 줄의 👁·📋·🚪 버튼이
**눌러도 아무 일도 안 일어난다**(SyntaxError: missing ) after argument list).

## 원인
버튼의 `onclick="ghEnterRoom(decodeURIComponent('방번호'))"` 에 방 번호를 `encodeURIComponent`
로 넣는데, `encodeURIComponent` 는 `' ( ) ! ~ *` 를 **인코딩하지 않는다.** 그중 작은따옴표
하나가 onclick 안의 `'…'` 문자열을 닫아 버려 JS 가 깨진다.

- 방 번호는 `/api/active-rooms` 의 `?roomId=` 가 **서버 검증 없이** 그대로 흘러 들어오므로
  `'` 가 실재할 수 있다(그 roomId 로 WebSocket 에 접속하면 그대로 활성 방 목록에 뜬다).
- **이 버그는 이번에 새로 생긴 것이 아니라** 모든 onclick 자리(위쪽 «화상방» 표의
  👁 바로 참관·📋 양식 채우기·🚪 직접 입장 포함)에 **원래 있던** 잠재 결함이었다.
- ⛔ XSS 로는 안 터진다 — `;`·공백·`,`·연산자가 전부 `%` 인코딩되고, 어트리뷰트는 `"…"` 라
  `"` 는 `%22` 가 된다. 고치는 것은 «버튼이 죽는» 정확성 문제다.

## 한 일
- `public/js/adm-s1.js` — `ridArg(x) = encodeURIComponent(x).replace(/'/g, '%27')` 헬퍼를 만들어
  **모든 onclick 자리**가 그것을 거치게 했다(`_ghRoomRow` 의 `ridAttr`, `_ghSchedHtml` 의
  참관·입장 버튼). `decodeURIComponent('%27') === "'"` 라 방 번호는 원래대로 복원된다.
- `public/admin.html` — `adm-s1.js?v=14 → 15`, 원장(`asset-versions.json`)에 v=15 해시 기록.

## 검토했다가 버린 것
- **서버에서 `?roomId=` 를 검증·거절**: `src/index.ts`·`video-call-room.ts` 는 공동 금지구역이고,
  방 이름 규칙을 서버에서 좁히면 회의방·데모방 등 기존 방 이름 체계에 영향이 크다.
  화면이 onclick 을 «안전하게 만드는» 쪽이 반경이 작고 모든 자리를 한 번에 막는다.
- **`'` 를 esc() 로 처리**: esc 는 «보이는 글자»(HTML 본문)용이고 여기 문제는 «JS 문자열 리터럴»
  안쪽이라 다른 층이다. URL 인코딩 층(`%27`)에서 고쳐야 디코드 왕복이 보존된다.

## 확인한 방법
- 퍼즈 하니스(scratchpad, node:vm 로 adm-s1.js 실제 실행 + onclick 실제 실행):
  10+씨앗 × 400~1500회 ≈ **5,500회 / 약 9만 검사 — FAIL 0.** 불변식: onclick 에러 0 ·
  enter 버튼 수 = observe 버튼 수 · 눌러 열린 vc_room 이 그 줄의 방으로 디코드 · `vc_cam=off`
  ·`vc_role=teacher`·`vc_autojoin=1` · 참관은 `/?observe=`.
- 브라우저 샌드박스(실제 Chromium, admin.html 로드 후 무작위 데이터로 **실제 클릭**):
  4씨앗 × 240~320회 ≈ **1,040회 / 약 8,600클릭 — FAIL 0** (1440px·390px 두 폭).
- **변이시험**: `%27` 치환을 뺀 사본으로 돌리면 퍼즈 319건 FAIL · 브라우저 56건 FAIL
  (실제 `missing ) after argument list`) · 상시 하니스 3건 FAIL — 검사가 실제로 잡는다.
- 상시 하니스 `test-harness/booked_enter_visible_harness.mjs` 에 ⑨절(작은따옴표 방 roundtrip,
  예약 줄 + 위쪽 표) 추가 → **PASS 22 / FAIL 0**.
- adm-s1.js 를 읽는 관련 하니스 13종 전부 통과.
- `run.mjs --fast`: 기준선 유지(PASS 529 · SKIP 20) — **새 FAIL 0건**(FAIL 26건은 전부
  기준선과 동일 = 이 컨테이너에 `node_modules`·esbuild 없음, 환경 사유).
- ⚠️ 배포된 실제 화면은 프록시 때문에 못 봤습니다 — 병합 후 사람이 한 번 봐 주세요.
