# 교재 라이브러리: 「Computer Games」를 MES 로 오인해 BTS 33 이 BTS 1 위로 가던 정렬 수정

- 날짜: 2026-10-06
- 작업자: 사장님(navy111p) + Claude
- 브랜치 / PR: `claude/jolly-johnson-gohj2q` / [#1387](https://github.com/navy111p-sudo/mangoiweb/pull/1387) (병합·배포 완료, 2026-10-06 19:08 KST)

## 1. 왜 했나

필리핀 강사 제보: 「새로 올린 BTS 교재와 옛 교재가 둘 다 숨겨졌다」. 스크린샷 두 장.
- 관리자 교재 표: 새 `BTS 1 001 (Welcome to school)` = Shown, `… (구본)` = Hidden.
- 수업 화면 교재 라이브러리: 맨 위에 `BTS 33 (001 - 003) Computer Games`(🎯 아이콘), 그다음 `BTS 1 002` … — **BTS 1 001 이 안 보임**. 각 줄 옆 숫자는 「1」.

## 2. 무엇을 바꿨나

- `cloudflare-deploy/public/js/idx-x3.js`
  - `courseIcon()` · `courseOrder()` · `_srvGuessCategory()` 세 곳의 `mes` 판정을 `indexOf('mes')` → 낱말 경계 `/(^|[^a-z])mes([^a-z]|$)/` 로.
- `cloudflare-deploy/public/index.html` — `idx-x3.js?v=12` → `?v=13` (공동 금지구역 — 사장님 승인. 글자 수 동일).
- `test-harness/asset-versions.json` — 새 버전 기록.

## 3. 진단 과정과 버린 길

**운영 D1 실측 (SELECT 만, 2026-10-06)**
- `textbook_hidden_books` 의 BTS 1 행 = **(구본) 11개뿐**(2026-09-28 「NEW BTS 교체 · 옛 교재 숨김」). 새 교재는 숨겨지지 않음 ⟹ 「둘 다 숨겨짐」은 사실이 아니었음.
- 새 이름 묶음에 옛 6/1 업로드 사본(`미분류 레슨 / SlideN.JPG` ×4)이 섞여 있었지만 **전부 `active=0`** — 목록·쪽수(001=21장)에 영향 없음. BTS 1 만 그런 모양(다른 권은 없음).
- 라이브러리가 부르는 `/api/textbook-files?group=1` 을 같은 SQL 로 재현 → BTS 1 001(21장) **포함**.
- 라이브러리 줄 옆 「1」은 쪽수가 아니라 **그 이름의 책 수**(서버 교재는 이름마다 1권) — 고장 아님.

**찾은 버그**: 정렬 함수를 그대로 돌리니 `BTS 33 … Computer Games` 의 순번이 MES(1) 로 나와 BTS(2) 보다 앞섬 — 「Ga**mes**」. 아이콘 🎯 도 같은 이유.
- 바로 위 `RETIRED_COURSES` 판정은 이미 낱말 경계를 쓰고 있어 그 화면에서 사라지지는 않았음(같은 파일에서 한 곳만 맞게 돼 있던 모양).

**BTS 1 001 누락**: 서버 목록·정렬 코드로는 설명되지 않음. 배포 뒤 강사가 Ctrl+Shift+R 로 새로고침하니 **001 이 보인다고 확인**(사장님 전달). 원인은 «브라우저가 옛 화면/스크립트를 들고 있었을» 가능성이 크나 **확인하지 못한 추정**.

**버린 길**
- `textbook_hidden_books`·`textbook_files` 를 D1 에서 고치기 — 데이터가 정상이라 필요 없음(1-1 금지이기도 함).
- 비활성 옛 사본 행 정리 — 화면에 안 닿아 이번 범위 아님.

## 4. 확인한 방법

- 정렬 함수 실행: `BTS 33 … Computer Games`→2(BTS), `MES 1`→1, `james`→99.
- `first_paint_budget_harness` 예산 유지 · `asset_version_harness` 267/267.
- `node test-harness/run.mjs --fast`: origin/main worktree 기준선과 FAIL 목록 `comm` 대조 — **새 FAIL 0건**(25건은 양쪽 동일, 이 컨테이너의 node_modules 부재 등 환경 사유).
- PR CI(배포 게이트) success → squash 병합 → `deploy.yml` run #3751 success(보류 아님, 헬스체크 통과).
- 사람 확인: 강사가 새로고침 뒤 BTS 1 001 이 보인다고 확인.

## 5. 남은 것 / 주의할 것

- `courseOrder`·`courseIcon` 의 다른 키워드(`bts`·`siu`·`master` 등)도 아직 부분일치입니다. 지금 교재 이름으로는 오인이 없지만, 짧은 키워드를 새로 넣으면 같은 함정을 밟습니다.
- 라이브러리 문제 제보를 받으면 **먼저 Ctrl+Shift+R** 부터 안내하세요(이번 001 누락이 그것으로 풀렸습니다).
- 이 수정에는 전용 하니스가 없습니다(정렬 판정을 문자열로 못 박는 검사 대신 직접 실행으로만 확인).
