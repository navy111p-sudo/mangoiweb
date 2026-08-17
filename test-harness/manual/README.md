# 손으로 돌리는 검사 (manual)

여기 있는 파일은 `test-harness/run.mjs` 가 **자동으로 돌리지 않는다** —
파일명이 `_harness.mjs` 로 끝나지 않으므로 목록에 안 잡힌다.

이유: 실제 브라우저(Chromium)가 필요한데, playwright 는 이 저장소의 의존성이 아니다.
게이트에 넣으면 브라우저가 없는 환경에서 매번 걸린다.

---

## 돌리는 법

```bash
# playwright 를 밖에서 한 번 받아 둔다 (저장소는 그대로 둔다)
mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core

# 저장소 루트에서
cd /경로/mangoiweb
PW_DIR=/tmp/pw node test-harness/manual/approval-offline-browser.mjs
PW_DIR=/tmp/pw node test-harness/manual/approval-ui-browser.mjs
```

- Chromium 은 `/opt/pw-browsers` 에서 찾는다(웹 세션 환경에 미리 깔려 있다).
  다른 곳이면 `PLAYWRIGHT_BROWSERS_PATH` 로 알려 준다.
- 준비물이 없으면 **실패가 아니라 «건너뜀»** 으로 조용히 끝난다.
- 두 검사 모두 **서버를 띄우지 않는다.** `fetch` 를 가짜로 바꿔 응답을 물린다.
  그래서 D1(개발·운영 공용 DB)에 아무것도 쓰지 않는다.

---

## approval-offline-browser.mjs — 끊겨도 잃지 않는가 (17건)

한국↔필리핀 교환에서 가장 아픈 «끊김» 을 눌러서 확인한다.

1. 쓰다 만 기안이 기기에 저장되는가
2. 앱을 다시 열어도 되살아나는가 (같은 건 열쇠까지 그대로)
3. 끊긴 채로 「올리기」를 누르면 사진까지 담아 두는가
4. 연결이 돌아오면 자동으로 보내는가
5. 같은 것을 또 보내도 **기안이 두 건이 되지 않는가**

> **왜 필요했나** — 2026-08-16, 이 검사가 실제 버그를 하나 잡았다.
> `.outbox` 에 `display:none` 이 박혀 있어서 `hidden=false` 로 바꿔도
> «보내지 못한 결재를 저장했습니다» 안내가 **한 번도 뜨지 않았다.**
> CLAUDE.md 에 적힌 «hidden 인데 그대로 보임» 함정의 반대쪽이고, 정적 검사로는 안 보인다.
> (지금은 `approval_policy_harness.mjs` 가 그 줄을 감시한다)

## approval-ui-browser.mjs — 묶어서 승인 · 부재중(대결) (10건)

1. **묶어서 승인이 «점검을 통과한 건만» 묶는가** — 이게 핵심이다.
   중복청구·예산초과·첨부누락 경고가 붙은 건이나 마감을 넘긴 건까지 쓸어 승인해 버리면
   자동 점검이 있으나 마나가 된다. 그 건들은 목록에 그대로 남아야 한다.
2. 부재중(대결)을 켜면 대신할 사람 목록이 뜨고, 기간과 함께 서버로 가는가

---

## 새 검사를 더할 때

- 파일 이름을 `*_harness.mjs` 로 짓지 말 것 — 게이트가 물어 간다.
- 머리에 `import { requireBrowser } from './_pw.mjs';` 를 쓰면
  준비물 확인·건너뜀 처리가 한 줄로 끝난다.
- **운영 DB 를 건드리지 말 것.** 서버를 띄우지 말고 `fetch` 를 가짜로 바꿔 쓴다.
