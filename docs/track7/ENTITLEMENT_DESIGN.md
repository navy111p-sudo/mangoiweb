# Track 7: origin-linked entitlements, local proposal

Baseline: `27ec8ce91c624a80559ee82311fc425664b07319`. No production migration, backfill, route wiring, financial call, push, merge or deployment is included.

## Contract and authority

`student-entitlement-contract.ts` is a pure proposal imported only by offline tests. It does not replace `student-track.ts` or `student-track-roster.ts`. Historical teacher-review classification remains deliberately broader than current paid access. The existing B2B opt-in list is not proof of settlement.

The trusted adapter must resolve the authenticated canonical learner ID, verified settlement, immutable economic transaction/line identity, purchased class occurrences, and refund/attendance evidence. The contract cannot establish those facts from a browser request. Never expose this command input as an unvalidated API.

- Fully settled AI-only purchase: one source-specific paid duration; KST calendar-month semantics reuse `addMonthsKst`.
- Further AI purchase: queue, not simultaneous countdown; no duplicate origin grants.
- Fully paid regular video order: video grant plus included AI, from settlement until the final linked, non-refunded class's exclusive end instant.
- AI → video: preserve exact remaining milliseconds. Overlapping/re-enrolled video benefits pause the paid clock across their union; no double pause.
- Approved makeup: move the stable purchased occurrence to its approved schedule/time. Extend included AI through that final class. A late retrospective approval is held for reconciliation, because automatically applying it would lose paid days already consumed during the gap.
- End, cancellation or full video refund: remaining paid AI resumes. Subscription cancellation alone is not an origin cancellation; it only stops future renewals and must not revoke paid access.
- Partial refund: only explicitly selected, scheduled, future occurrences. Require a current unused/attendance check, matching occurrence revision and an atomic refund-reservation reference from track 5. Amount is explicitly approved/verified upstream and bounded by remaining paid money. No per-class price policy is invented.
- Cancellation and refund are separate. Cancellation revokes the source without falsely lowering revenue; only a verified financial refund reduces revenue.
- New AI money already settled during video-free AI: preserve the purchased value and emit a review event. The advisory renewal decision rejects a new automatic charge while included AI is active.
- Resume billing only with the existing three-day notice floor. The function is advisory and makes no billing mutation or provider call.

All timestamps are UTC epoch milliseconds. Class end bounds are exclusive; the upstream approved schedule must provide the real final lesson end instant. Paid time is duration, not number of AI requests. Remaining time is not rounded to whole days. A command earlier than the persisted clock is held for reconciliation, not silently rewritten to the present.

## Proposed storage

`001_entitlements.sql` is outside all runtime migrations. It creates only local-synthetic-sandbox tables:

1. Subjects: learner-scoped revision, monotonic clock, projection/hash and ledger head.
2. Origins: immutable settlement, product, amount, canonical learner, source/line and evidence reference.
3. Entitlements: rebuildable current source-specific balances/video class state.
4. Events: append-only idempotent command, ordered learner revision, transitions and hash chain.

The adapter executes origin + ledger + projection in one SQLite transaction. Optimistic expected-revision checks prevent lost updates across distinct orders for the same learner. Commands use normal JSON semantics before canonical key sorting and hashing: optional undefined object fields are omitted, so the equivalent JSON transport retry has the same fingerprint. Same command/body is a replay; same key with different body is a conflict. Origins also have global source/line uniqueness. Duplicate provenance across different source systems must be canonicalized by the trusted mapping adapter to the same economic-origin ID before submission.

SQL triggers reject UPDATE, DELETE, and INSERT OR REPLACE of immutable rows. The projection is mutable and reconstructible from replay. Reads and replay verification compare every derived grant row with the subject projection and fail closed for missing or inconsistent rows. These reads use one SQLite read transaction so a concurrent writer cannot produce a mixed-revision view; automatic repair is not implemented. Paid-grant duration columns explicitly disallow NULL within their kind-specific CHECK. These triggers are guardrails, not protection from a privileged operator dropping schema or triggers. Production permissions and backups still require review.

The local adapter uses `node:sqlite` and `BEGIN IMMEDIATE` for writes, with snapshot read transactions for cross-table validation. This is a fresh-sandbox proposal: reapplying CREATE TABLE IF NOT EXISTS does not retrofit revised CHECK constraints into an older local file; create a new synthetic sandbox instead. D1 transaction/batch equivalence, write-conflict behavior and production migration compatibility have NOT been tested. Do not copy the local adapter into a Worker. A production adapter needs its own D1 transaction/CAS tests before activation.

## Legacy mapping: explicit hold points

### payment_orders

- Require exact provider-verified `order_id`, canonical UID, program, settled amount/status and cancellation/refund state.
- `enrollments.notes LIKE '%order%'` is historical evidence for reconciliation, not a unique foreign key.
- Link enrollment-generated classes through verified exact `source = enroll:<order_id>` and UID; track 5 owns selection/unused/reservation checks. Use existing `class_schedules.id` as the stable purchased occurrence when track 6 preserves it; keep the current schedule row reference separate so approved replacement/makeup mapping remains traceable.
- Do not grant merely because an enrollment is active. An order marked paid but schedule allocation incomplete is an explicit reconciliation state.

### Cafe24 / student_payments

`cafe24-sync.ts:164–182` orders upstream payments by `p.pay_id`, but omits that ID from its SELECT output. It DELETEs imported `[cafe24]%` rows and INSERTs them again. The mirror's D1 `student_payments.id` is therefore not a stable economic key.

Before any backfill, preserve or separately verify the upstream immutable payment/line ID; establish canonical learner identity, actual product, full-payment/refund state, purchased occurrence links and correct timezone periods. Compare old and new snapshots read-only and quarantine ambiguous rows for staff review. Names, matching amounts, approximate timestamps, active historical reservations and room joins do not authorize paid access. Existing records remain intact. `legacy-readonly-audit.sql` is only a reviewable SELECT proposal and has not been run against production.

### B2B

- A roster/opt-in entry or draft invoice is not a paid grant.
- MGB paid invoices need frozen student-line membership, verified covered period and a reviewed allocation of invoice-level minimum/tier pricing. Do not count the entire invoice as revenue for every student. Zero-cost/fully sponsored lines need an explicit sponsor-benefit contract; this version must not fabricate positive per-student payments.
- MGT tuition top-up is prepaid organizational credit, not proof that one student has a fully paid regular video allocation. Use verified actual class allocation, not top-up receipt alone.
- Matching the same mirrored transaction through Cafe24 and payment_orders needs one canonical economic-origin ID to avoid cross-system duplicate grants.

## Planned integration boundaries (not executed)

| Owner/path | Required verified input or behavior |
|---|---|
| Track 5 activateEnrollment | after full settlement + valid class allocation, submit origin grant idempotently; retain legacy enrollment records |
| Track 5 finishRefund | submit verified done-at, receipt and only the reserved selected occurrences; unknown provider outcome stays pending |
| Track 6 schedule change | same purchased occurrence, revision, approved move/makeup, final end time; reservation must prevent conflicting move/refund |
| AI subscription charge | serialize grant and renewal claim per learner, recheck free benefit before outbound call, use provider idempotency, reconcile uncertain outcome |
| AI/chat/games gates | separate security approval and verified legacy coverage first; unknown mapping is not unpaid; no gate added here |
| Learning/evaluation | immutable learner + origin + entitlement/evaluation snapshot at event time; do not rewrite historical diagnosis or teacher workflow |
| Statistics/revenue | origin-specific gross/refund/net and zero included-AI revenue; reconcile external source allocation before using real totals |
| Administrator display | current entitlement label alongside separate historical diagnostic/roster interpretation and a visible unknown/review state |

Do not turn on global enforcement until a read-only shadow comparison has classified every affected existing population, unresolved cases have a reviewed transition policy, D1/provider/browser integration is tested, and the user has given final approval.

## Local execution

- `node sandbox/student-entitlements/create-sandbox.mjs /tmp/example.sandbox.sqlite`
- `node test-harness/student_entitlement_contract_harness.mjs`
- `node test-harness/student_entitlement_contract_mutations.mjs`
- `node test-harness/student_entitlement_review_oracle.mjs`
- `node sandbox/student-entitlements/current-routes-probe.mjs` intentionally exits nonzero for existing unmet route contracts; its provider calls are intercepted.

The creation script refuses existing files and paths outside `/tmp` or `/workspace` and uses no remote config. Synthetic fixture IDs have no relationship to real students. No secret, production record or provider key is required.
