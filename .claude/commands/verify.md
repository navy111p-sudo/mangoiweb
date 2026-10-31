---
description: 코드 수정 후 필수 검증 (타입체크 + 회귀 하니스) — CLAUDE.md 4-4장
---

CLAUDE.md 4-4장의 검증 절차를 순서대로 실행하고, **각 단계의 실제 출력**을 보여 주세요.

## 1단계 — 타입체크

```bash
cd cloudflare-deploy && node node_modules/typescript/bin/tsc --noEmit
```

⚠️ `npx tsc` 를 쓰지 마세요. npx 가 조용히 실패해도 «출력 없음» 이라 통과처럼 보입니다.
반드시 위의 `node node_modules/typescript/bin/tsc` 경로로 실행하세요.

## 2단계 — 회귀 하니스

```bash
cd "$(git rev-parse --show-toplevel)" && node test-harness/run.mjs --fast
```

⚠️ 하니스는 **리포 루트의 `test-harness/`** 에 있습니다.
1단계의 `cd cloudflare-deploy` 를 그대로 이어서 실행하면 `MODULE_NOT_FOUND` 가 납니다.
기준선은 대략 PASS 114 / SKIP 20 이고, 약 90초 걸립니다.

## 3단계 — 자산 버전 확인

`cloudflare-deploy/public/js/*.js` 나 `css/*.css` 를 고쳤다면,
그 파일을 부르는 HTML 의 `?v=` 를 함께 올렸는지 확인하세요.
안 올리면 `asset_version_harness.mjs` 가 FAIL 을 냅니다.

## 4단계 — 보고

- 통과/실패를 **사실대로** 적으세요. 실패하면 실패 출력을 그대로 붙이세요.
- 건너뛴 단계가 있으면 명시하세요.
- 화면(HTML/CSS)이 바뀌는 작업이면 **«사람이 브라우저에서 직접 봐야 끝»** 이라고 덧붙이세요.
  이 작업 환경에서는 배포된 실제 화면을 볼 수 없습니다.
