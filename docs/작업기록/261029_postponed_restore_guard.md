# Postponed class restore and permanent time-change recovery

- Date: 2026-10-29 UTC
- Base: f41dc98 (Claude PR #1889 preserved)
- Branch: fix/postponed-class-correction

## Problem and behavior

A manager reported selecting 07:40 instead of 19:40 and seeing Class not found when attempting a permanent change. No student identity was supplied; this work does not change or claim to verify any real student timetable.

PR #1889 adds restore for a dated postponed row. Its live deployment was verified separately. This patch supplements that implementation: the shared manager/admin move modal offers HQ restore, and inactive-class responses distinguish postponed from missing IDs after ownership checks. Scoped managers keep the existing rebook path; HQ authorization is unchanged.

Postponed restores use the existing atomic move engine. The transaction guards schedule/availability/attendance/room-override snapshots and includes the restore audit. Past or started occurrences, templates, cancelled/completed classes, occupied student/teacher slots, unavailable teachers, attended rooms, stale rows and concurrent changes are rejected. The existing cancelled-class restore path is preserved.

## Why this approach

Do not remove the active-status check or revive a class merely because a permanent change was requested. Restore/rebook is explicit, then permanent change uses the existing series planner. Date-specific postponement moves the original row in place; an active moved target is not restored into another source row. Recurring templates retain their existing split/one-week policies. No merge of older unrelated PR #1568 is included.

## Validation

- TypeScript noEmit and build: pass.
- schedule_group_move_harness: 247 pass, 0 fail, including real SQLite rollback, audit failure, attendance race, room overrides, double restore and original-time collision cases.
- schedule_move_room_sync_harness: 400 pass, 0 fail. Actual admin/enrollment/teacher/student handlers and SQLite exercise restore 07:40, permanent 19:40 across three occurrences, duplicate apply, historical/attendance/ERP preservation, HQ/teacher/scoped-manager permissions, moved-row lineage, past-date rebooking, 100 distinct fixture variants plus repeat restores, and mutation checks.
- class_series_move_harness: 27 pass, 0 fail.
- Additional isolated actual-route ownership/error cases: 20 pass.
- Chrome with actual local handlers/SQLite: double-click restore then permanent 19:40 for two rows passed, same IDs retained, no browser errors. Separate error/permission browser tests passed.
- Inline JS and cache manifest checks passed before final publication; final CI must repeat them at the exact PR head.
- Local full-suite baseline comparison is subject to Windows ESM paths, missing binary fixtures and restricted child-process execution. Exact-head Linux CI is the publication/merge gate; failures must not be bypassed.

## Deployment and limits

At preparation time the supplemental patch is local only. No production database writes, real schedule edits, notifications, paid APIs, credentials or security settings were used. Merge/deploy results, if authorized and completed, are reported with the PR and workflow rather than assumed from this document.
