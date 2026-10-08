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
  grep -Fq '"browserPass":21,"browserFail":0' "$OUT/payment.log"
done
# These distinct gaps run once; the repeated baseline above remains unchanged.
OUT="$SEVEN_TRACK_BROWSER_OUTPUT/focused-races"
mkdir -p "$OUT/voice" "$OUT/handover" "$OUT/schedule-lock" "$OUT/calendar-consumers"
OUTPUT_DIR="$OUT/voice" run_logged "$OUT/voice.log" node test-harness/manual/voice-client-races-browser.mjs
grep -Eq '^voice-client-races-browser: PASS [1-9][0-9]* / FAIL 0 / SKIP 0$' "$OUT/voice.log"
OUTPUT_DIR="$OUT/handover" run_logged "$OUT/handover.log" node test-harness/manual/daily-handover-races-browser.mjs
grep -Eq '^daily-handover-races-browser: PASS [1-9][0-9]* / FAIL 0 / SKIP 0$' "$OUT/handover.log"
OUTPUT_DIR="$OUT/schedule-lock" run_logged "$OUT/schedule-lock.log" node test-harness/manual/weekly-schedule-lock-browser.mjs
grep -Eq '^weekly-schedule-lock-browser: PASS [1-9][0-9]* / FAIL 0 / SKIP 0$' "$OUT/schedule-lock.log"
OUTPUT_DIR="$OUT/calendar-consumers" run_logged "$OUT/calendar-consumers.log" node test-harness/manual/schedule-consumer-approval-browser.mjs
grep -Eq '^schedule-consumer-approval-browser: PASS [1-9][0-9]* / FAIL 0 / SKIP 0$' "$OUT/calendar-consumers.log"
node -e 'const r=require(process.argv[1]);const expected=["automatic-student-change-updates-projections-cache-and-room","student-request-existing-admin-approval-crosses-week-and-teacher","versioned-admin-move-refresh-reload-old-slot-removal-and-join"];if(r.cases.length!==3||r.cases.some((c,i)=>c.name!==expected[i]||c.passed!==true)||r.navigations.length!==3||!r.assertions.some(a=>a.name==="negative control rejects stale visible teacher name with correct API data"&&a.passed)||!r.assertions.some(a=>a.name==="negative control rejects retained old visible slot beside correct new slot"&&a.passed))throw Error("incomplete joined calendar-consumer evidence")' "$OUT/calendar-consumers/fixture-report.json"
for fixture in "$OUT/voice/fixture-report.json" "$OUT/handover/fixture-report.json" "$OUT/schedule-lock/fixture-report.json" "$OUT/calendar-consumers/fixture-report.json"; do
  node -e 'const r=require(process.argv[1]);if(!(r.passed>0)||r.failed!==0||r.skipped!==0||!Array.isArray(r.cases)||r.cases.length===0)throw Error("incomplete focused browser fixture result")' "$fixture"
done
mkdir -p "$OUT/admin-schedule-consistency"
OFFLINE_BROWSER_OUTPUT="$OUT/admin-schedule-consistency" run_logged "$OUT/admin-schedule-consistency.log" node test-harness/manual/admin-schedule-consistency-browser.mjs
grep -Eq '^admin-schedule-consistency-browser: PASS [1-9][0-9]* / FAIL 0 / SKIP 0$' "$OUT/admin-schedule-consistency.log"
node -e 'const r=require(process.argv[1]);if(r.failure||!r.summary||r.summary.failed!==0||r.summary.skipped!==0||r.summary.passed!==11||r.cases.length!==11||r.cases.some(c=>c.status!=="passed")||r.unknownReads.length||r.denied.length||r.unexpectedWrites.length||r.routeErrors.length||r.pageErrors.length)throw Error("incomplete admin/student consistency browser evidence")' "$OUT/admin-schedule-consistency/schedule-fixture-report.json"
mkdir -p "$OUT/termination"
TERMINATION_SOURCE_ROOT="$ROOT" \
TERMINATION_SOURCE_COMMIT="$(git rev-parse HEAD)" \
TERMINATION_SOURCE_TREE="$(git rev-parse HEAD^{tree})" \
TERMINATION_BROWSER_OUTPUT="$OUT/termination" \
  run_logged "$OUT/termination.log" node test-harness/manual/student-termination-browser.mjs
grep -Eq '^student-termination-browser: PASS [1-9][0-9]* / FAIL 0 / SKIP 0$' "$OUT/termination.log"
node -e 'const r=require(process.argv[1]);if(r.failure||r.summary.passed!==21||r.summary.failed!==0||r.summary.skipped!==0||r.summary.assertionsFailed!==0||r.cases.length!==21||r.cases.some(c=>c.status!=="passed")||r.unknownReads.length||r.denied.length||r.unexpectedWrites.length||r.routeErrors.length||r.pageErrors.length||!r.testedCommit||!r.testedTree||!r.sourcePageSha256)throw Error("incomplete termination browser evidence")' "$OUT/termination/termination-fixture-report.json"
echo 'seven-track-browser: PASS 12 suites / FAIL 0 / SKIP 0'
