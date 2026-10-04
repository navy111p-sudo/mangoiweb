#!/usr/bin/env bash
# CI-only entry point. The workflow must first isolate the network and clear env.
set -euo pipefail
test "$(ip -o link show | wc -l)" -eq 1
ip link show dev lo >/dev/null
test -z "$(ip -4 route show default)"
test -z "$(ip -6 route show default)"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
: "${PW_DIR:?pinned Playwright installation required}"
: "${PLAYWRIGHT_BROWSERS_PATH:?pinned Chromium installation required}"
: "${SEVEN_TRACK_BROWSER_OUTPUT:?separate artifact directory required}"
export CHROMIUM_PATH
CHROMIUM_PATH="$(node -e 'const p=require(process.env.PW_DIR+"/node_modules/playwright/package.json");if(p.version!=="1.63.0")throw Error("unexpected Playwright version");process.stdout.write(require(process.env.PW_DIR+"/node_modules/playwright").chromium.executablePath())')"
test -x "$CHROMIUM_PATH"
run_logged() {
  local log="$1"; shift
  local status=0
  "$@" > "$log" 2>&1 || status=$?
  cat "$log"
  return "$status"
}
for round in 1 2; do
  OUT="$SEVEN_TRACK_BROWSER_OUTPUT/round-$round"
  mkdir -p "$OUT/admin" "$OUT/payment"
  OFFLINE_BROWSER_OUTPUT="$OUT/admin" run_logged "$OUT/admin.log" node test-harness/manual/admin-repairs-offline-browser.mjs
  grep -Eq '^admin-repairs-offline-browser: PASS [1-9][0-9]* / FAIL 0 / SKIP 0$' "$OUT/admin.log"
  node -e 'const r=require(process.argv[1]);if(r.passes<135||r.failures!==0||r.cases.length!==13)throw Error("incomplete admin fixture result")' "$OUT/admin/fixture-report.json"
  RESULT_PATH="$OUT/voice.json" run_logged "$OUT/voice.log" node test-harness/manual/ai-friend-turn-latency-browser.mjs
  node -e 'const r=require(process.argv[1]);if(r.length!==3||r.some(x=>!x.canceledMicResumedWithin3s||x.staleAvatarStopped))throw Error("incomplete voice fixture result")' "$OUT/voice.json"
  OUTPUT_DIR="$OUT/payment" run_logged "$OUT/payment.log" node test-harness/manual/payment-integrity-browser.mjs
  grep -Fq '"browserPass":10,"browserFail":0' "$OUT/payment.log"
done
# These distinct gaps run once; the repeated baseline above remains unchanged.
OUT="$SEVEN_TRACK_BROWSER_OUTPUT/focused-races"
mkdir -p "$OUT/voice" "$OUT/handover"
OUTPUT_DIR="$OUT/voice" run_logged "$OUT/voice.log" node test-harness/manual/voice-client-races-browser.mjs
grep -Eq '^voice-client-races-browser: PASS [1-9][0-9]* / FAIL 0 / SKIP 0$' "$OUT/voice.log"
OUTPUT_DIR="$OUT/handover" run_logged "$OUT/handover.log" node test-harness/manual/daily-handover-races-browser.mjs
grep -Eq '^daily-handover-races-browser: PASS [1-9][0-9]* / FAIL 0 / SKIP 0$' "$OUT/handover.log"
for fixture in "$OUT/voice/fixture-report.json" "$OUT/handover/fixture-report.json"; do
  node -e 'const r=require(process.argv[1]);if(!(r.passed>0)||r.failed!==0||r.skipped!==0||!Array.isArray(r.cases)||r.cases.length===0)throw Error("incomplete focused browser fixture result")' "$fixture"
done
echo 'seven-track-browser: PASS 8 suites / FAIL 0 / SKIP 0'
