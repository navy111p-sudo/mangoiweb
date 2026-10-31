#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# 🚦 배포 차단 게이트 — 단일 정본 (2026-08-13)
#
# [왜 스크립트로 뺐나]
#   이 4개 검사는 .github/workflows/deploy.yml 안에 step 4개로 적혀 있었다.
#   그런데 그 워크플로는 `push: branches:[main]` 에서만 돈다 —
#   **PR 에서는 어떤 검사도 돌지 않았다.** 머지해야 비로소 검사가 돌고,
#   실패하면 「배포가 안 나간 채로」 끝난다. 리뷰어는 머지 전에 알 방법이 없었다.
#
#   그래서 PR 용 워크플로(ci.yml)를 새로 만드는데, 검사 목록을 **복사**하면
#   이 저장소가 반복해서 밟은 그 함정이 된다 — deploy.yml 주석이 직접 말한다:
#   「목록이 둘이라 한쪽만 고치면 이렇게 된다」.
#   그래서 목록은 여기 한 곳에만 두고, 두 워크플로가 이 파일을 부른다.
#
# [규칙] 게이트를 추가·수정할 일이 생기면 **이 파일만** 고친다.
#        워크플로 두 개를 다시 고칠 필요가 없어야 이 분리가 의미를 갖는다.
#
# [전제] cloudflare-deploy/node_modules 가 이미 설치돼 있어야 한다(npm ci).
#        호출하는 워크플로가 책임진다 — 여기서 설치하지 않는다(캐시 설정이 워크플로 쪽에 있다).
#
# 사람이 로컬에서 그대로 돌려도 된다:  bash test-harness/ci-gates.sh
# ═══════════════════════════════════════════════════════════════════════
set -euo pipefail

# 어디서 부르든 리포 루트에서 동작하게 — deploy.yml 은 작업 디렉터리가 cloudflare-deploy 다.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

fail=0
step() {
  echo ""
  echo "═══ $1 ═══"
  shift
  if "$@"; then
    echo "✅ 통과"
  else
    echo "❌ 실패"
    fail=1
  fi
}

# ─── ① 컴파일 게이트 ───────────────────────────────────────────────────
# 2026-08-09 이전엔 deploy.yml 에 continue-on-error: true 가 붙어 있어서
#   「검사는 하는데 실패해도 그냥 배포」 였다. 검사한 척만 하는 상태다.
#
# ⚠️ npx 는 쓰지 않는다 — npx 가 조용히 실패해도 «출력 없음 + exit 0» 이라 통과와
#    화면이 똑같다(CLAUDE.md 함정 목록에 있는 그것). node 로 로컬 typescript
#    바이너리를 직접 부르면 그 착시가 없다. deploy.ps1 과 같은 방식이어야
#    두 배포 경로의 검사 수준이 같아진다.
tsc_check() { ( cd "$ROOT/cloudflare-deploy" && node node_modules/typescript/bin/tsc --noEmit ); }
step "① TypeScript 컴파일 (src/*.ts)" tsc_check

# ─── ② 회귀 하니스 ─────────────────────────────────────────────────────
# 하니스 하나하나가 «예전에 이렇게 고장 났었다» 는 사고 기록이다.
# 2026-08-09 이전 CI 는 그중 2개(문법·캐시버전)만 돌렸고 전체 게이트는 로컬
# deploy.ps1 에만 걸려 있었다 — main 으로 배포하면 검사를 사실상 안 받고 나갔다.
#
# ⚠️ 하니스는 **리포 루트**의 test-harness/ 에 있다. cloudflare-deploy/test-harness/ 에도
#    같은 이름의 폴더가 있지만 그 안엔 run.mjs 가 없다(CLAUDE.md 4-4 의 그 함정).
# E2E 20개는 라이브 화상수업·브라우저 상태가 필요해 헤드리스에서 자동 제외된다.
step "② 회귀 하니스 (run.mjs --fast)" node test-harness/run.mjs --fast

# ─── ③ 인라인 JS 문법 게이트 ───────────────────────────────────────────
# 2026-07-23 장애: 폰트 일괄치환이 JS 문자열 안 CSS 를 건드려 문자열이 끊겼고
#   index.html 인라인 script 10블록이 통째로 SyntaxError → 수업 입장 함수가
#   아예 정의되지 않아 전 사용자가 수업에 못 들어갔다. 그런데
#     · ① 의 tsc 는 src/*.ts 만 본다
#     · 배포 후 헬스체크는 HTTP 200 여부만 본다 (내용이 깨져도 200 이다)
#   이 두 개로는 절대 못 잡는다. 검사 대상은 public 이하 HTML 인라인 <script> + .js 전수.
step "③ 인라인 JS 문법 (HTML <script> + .js 전수)" node test-harness/inline_js_syntax_harness.mjs

# ─── ④ 정적자산 캐시버전 게이트 ────────────────────────────────────────
# deploy.ps1 은 sw.js 의 CACHE_NAME 만 자동으로 올린다. js/css 의 ?v= 는 사람이 손으로 올린다.
# 안 올리면 «배포는 됐는데 기존 사용자에게는 옛 파일이 그대로» 가 된다 —
# 화면은 새것, 스크립트는 옛것이라 원인 찾기가 특히 어렵다.
# 2026-08-07 하루에만 두 번 걸렸다: /js/adm-tlink.js (v=1) · /js/adm-core.js (v=39).
step "④ 정적자산 캐시버전 (?v= 누락)" node test-harness/asset_version_harness.mjs

echo ""
echo "──────────────────────────────────────────────────────────"
if [ "$fail" -ne 0 ]; then
  # 한 개가 깨져도 나머지를 다 돌린 뒤에 실패한다 — 고칠 것을 한 번에 보여주기 위해서다.
  echo "❌ 배포 게이트 실패 — 위에서 ❌ 표시된 단계를 고쳐야 한다."
  exit 1
fi
echo "✅ 배포 게이트 4종 전부 통과."
