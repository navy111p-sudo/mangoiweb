# Local class recovery after original start

Initial validation was local only, based on e7c16ddbc. The user subsequently authorized GitHub review, merge and deployment after checks and existing deployment safety gates pass. This document records implementation and local evidence; publication/deployment results must be verified separately. No real class records are to be modified.

## Behavior

The HQ manager/admin moved-away row offers a separate **Correct past record** action when the original start has passed and the current dated destination is still active and unstarted. Explicit confirmation shows both full dates/times in KST and says the current future slot is removed. The same schedule ID returns to the original date/time with status **postponed**, never active/completed/attended. Existing attendance, payment and payroll records are not written. The restore audit records `historical_correction` and resulting status in the same transaction.

A cancelled future destination is restored separately on its own date. Manager simple/detail views and admin today view offer Restore cancelled class. Confirmation explains activation and normal attendance/billing consequences. This action now uses the shared atomic restore engine instead of an exact-start duplicate query and an independent UPDATE/audit. It checks started dates, student/teacher overlaps (including staggered and recurring), teacher availability, attendance and room overrides, and snapshot races. Audit failure rolls back the status change.

Existing HQ gate remains: scoped agency/branch managers and teachers cannot perform either action. No new student/teacher mutation controls. Postponed records also return `observable:false` in the manager API so historical correction cannot offer observation. Completed/started/attended destinations remain blocked. Unknown history/lookups fail closed. Ordinary undo without explicit historical consent still rejects a past original time.

Rejected approach: remove the original-time check and activate the past class. That could create attendance/no-show and payroll consequences. Historical correction deliberately returns a closed postponed record. This does remove the future booking after confirmation; it does not preserve both bookings or create another schedule ID.

## Validation

TypeScript noEmit passed. Atomic group move: 254 pass, 0 fail. Undo/history: 89 pass, 0 fail including mutation tests. Student/teacher/manager room integration: 405 pass, 0 fail. Cancelled visibility/permissions: 180 pass, 0 fail. Asset versions: 332 pass, 0 fail. See local logs `/tmp/restore-*.log`; Final `npm_config_cache=/tmp/mangoi-npm-cache node test-harness/run.mjs --fast`: 686 PASS, 0 FAIL, 20 E2E SKIP (188 seconds). Fast mode intentionally excludes those E2E cases; the separate Chromium recovery test covers the changed UI functions. Added actual SQLite scenarios for historical correction, repeated actions, A→B→C history, original/destination attendance, concurrent edits, cancelled/started targets, real HQ route and agency denial. Added cancelled future restore cases for same-day past time, overlap, leave, booking race, repeated restore and audit rollback.

Browser: `PW_DIR=/opt/codex/runtimes/codex-primary-runtime/dependencies/node node test-harness/manual/class-recovery-browser.mjs`: 22 checks, zero failures at 390/1360 widths. Runs actual shipped manager/admin functions with intercepted fixture responses; it is not a full authenticated production page test. Cancel confirmation sends no request, historical action is distinct, future cancellation restore is distinct, HQ visibility checked.

## Limits

- No automatic historical activation, attendance, refund, rebilling, payroll recomputation or notifications.
- No-date past postponed rows continue to use existing explicit rebooking; this patch's historical correction is for a dated move with authoritative origin history.
- A cancelled destination must be restored at its future date first; historical correction will not silently revive it.
- Already started destinations, attendance, unknown origins and missing recurring children remain blocked. Historical correction of a recurring parent/weekly child is deliberately unavailable: the original parent room and split lineage require additional guards. Ordinary future weekly undo keeps its existing behavior.
- Browser coverage uses manager recovery functions and fixture network responses. Full authenticated pages and real production data were not exercised.
- Existing room-sync harness covers student/teacher/admin routing and postponed/attendance/ERP preservation; no claim of live deployment.
