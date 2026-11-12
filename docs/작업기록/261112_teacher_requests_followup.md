# Teacher requests follow-up — 2026-11-12

The owner requested another review of available-teacher search, class-change alerts, and dated fee summaries.

## Changes

- Availability uses strict, uncached holiday reads and strict mirror-exclusion reads. A lookup outage no longer certifies teachers as available. Other callers keep their existing holiday-entry fallback. Invalid calendar dates, invalid times and slots crossing midnight are rejected. An invalid new manager search invalidates pending older results.
- Class-change alert classification compares the exact lead time against 30 minutes, before display rounding. Changes one second after class starts are correctly described as after start. Alerts keep the owner's existing time-only policy; no new compensation policy is introduced. Alert setup guidance now includes cancellations/postponements/moves.
- Monthly finalized `payslips.bonus_krw` is exposed separately in dated fee summaries. Teacher identity comes from the authenticated username and a unique explicit roster link; a request cannot override it. Missing links, missing finalized records, duplicate records, null amounts and failed reads are distinguishable from a confirmed zero. No tables/data are written by the bonus reader.
- Monthly KRW bonuses are not converted into PHP or allocated to individual lessons/partial date ranges. The UI states this explicitly. The existing PHP lesson total remains unchanged.
- Fee date validation rejects impossible calendar dates. Malformed monthly responses show a load failure, not zero pay.

## Validation

Focused local results: fee summary 59/0; class-change alert 60/0; availability 46/0 including 300 randomized worlds; monthly incentive 13/0; existing holiday closure 82/0. TypeScript noEmit passed.

Full fast regression and remote browser CI are pending at PR creation. The local Chromium launch was attempted but blocked by socket() Operation not permitted in this executor. A dedicated browser workflow runs the shipped teacher page against synthetic API fixtures in English/Korean at 1280/820/390 widths, including separate monthly bonus display and unchanged PHP totals. This does not certify real device push delivery or authenticated production screens.

## Deliberate limits

No production data writes, test notifications to real teachers, or new payroll rate/rule are made. Saved monthly bonuses are read, not invented from evaluation scores or a new percentage. Existing time-only push and compensation eligibility rules are retained. A real teacher device is still needed to establish delivery on that device.

## Rollback

Use a reviewed follow-up PR to revert only these changes if necessary; no database migration or data rollback is needed. Do not bypass the deployment/class-window guard.
