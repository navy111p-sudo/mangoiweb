# 손으로 돌리는 검사 (manual)

여기 있는 파일은 `test-harness/run.mjs` 가 **자동으로 돌리지 않는다** —
파일명이 `_harness.mjs` 로 끝나지 않으므로 목록에 안 잡힌다.

이유: 실제 브라우저(Chromium)가 필요한데, 저장소의 의존성이 아니다.
게이트에 넣으면 브라우저가 없는 환경에서 매번 걸린다.

---

## approval-offline-browser.mjs — 결재 끊김 대응

**무엇을 확인하나** — 「필리핀에서 회선이 끊겨도 쓴 것이 사라지지 않는가」를
실제 브라우저에서 눌러 본다. 문법 검사로는 못 잡는 실행 시점 버그를 잡으려는 것이다.

1. 쓰다 만 기안이 기기에 저장되는가
2. 앱을 다시 열어도 되살아나는가 (열쇠까지 그대로)
3. 끊긴 채로 「올리기」를 누르면 사진까지 담아 두는가
4. 연결이 돌아오면 자동으로 보내는가
5. 같은 것을 또 보내도 **기안이 두 건이 되지 않는가**

**왜 필요했나** — 2026-08-16, 이 검사가 실제 버그를 하나 잡았다.
`.outbox` 에 `display:none` 이 박혀 있어서, `hidden=false` 로 바꿔도
«보내지 못한 결재를 저장했습니다» 안내가 **한 번도 뜨지 않았다.**
CLAUDE.md 에 적힌 «hidden 인데 그대로 보임» 함정의 반대쪽이고,
정적 검사로는 보이지 않는다. (지금은 `approval_policy_harness.mjs` 가 그 줄을 감시한다)

**돌리는 법**

```bash
# 이 저장소에는 playwright 가 없다. 임시 폴더에 받아서 쓴다.
mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
cd /tmp/pw && node /경로/mangoiweb/test-harness/manual/approval-offline-browser.mjs
```

Chromium 은 `/opt/pw-browsers` 에서 찾는다(웹 세션 환경에 미리 깔려 있다).
없으면 `PLAYWRIGHT_BROWSERS_PATH` 를 맞춰 주거나 로컬 크롬 경로를 넣으면 된다.

서버는 띄우지 않는다 — `fetch` 를 가짜로 바꿔 응답을 물린다.
그래서 D1(운영 DB)에 아무것도 쓰지 않는다.
