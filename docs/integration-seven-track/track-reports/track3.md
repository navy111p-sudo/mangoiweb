# Track 3 — AI speaking and games: independent review

Base reviewed: `navy111p-sudo/mangoiweb`, main `27ec8ce91c624a80559ee82311fc425664b07319` (verified 2026-10-04 UTC).

Status: **Additional verification and decisions required.** A narrow client account-switch race is fixed locally. The requested continuous-learning system is not complete. No remote student writes, provider calls, production migration, push, PR, merge, or deployment was performed by this track.

## 1. Current problem

The current system has useful partial connections, but no durable, validated contract for all nine requested learning signals or complete speaking → games → speaking loop. A vocabulary loader also reused one pending Promise across different logged-in students.

## 2. Reproduction

The actual `game-vocab.js` was executed in an isolated JavaScript VM with delayed synthetic responses. A request started for A; the account switched to B while A's request was pending. B's `load()` returned the same Promise and received A's vocabulary. Logging out before A's completion also still delivered A's result. The strict regression harness initially reported 7 pass / 5 fail.

Existing server-side isolation concerns were separately reproduced in an earlier, isolated audit and reported to the coordinator. That investigation is paused; this document does not claim those routes are repaired or approved for further testing.

## 3. Confirmed causes

- `game-vocab.js` checked the cache's UID but not the owner of its single `_inflight` Promise.
- Completion handlers unconditionally cleared `_inflight`, so an older account's failure could clear a newer request.
- Raw conversation storage, vocabulary, game item counts and ephemeral correction state are separate data contracts.
- Game content selects vocabulary and textbook quizzes, not verified learning items from an AI speaking turn.
- Chat-friend can read game weak words, but that does not establish a durable, two-way learning system. The weak-word prompt is intentionally disabled for A1/A2 to preserve short, level-appropriate answers.

## 4. Local changes

The vocabulary loader now deduplicates only requests for the same UID, discards a response if the current account differs from its captured owner, and clears pending state only if the completing request is still the current request. No authentication policy, database schema, permissions, retention policy, or learning classification was changed.

## 5. Changed files and main logic

- `cloudflare-deploy/public/js/game-vocab.js`: owner-keyed pending request and stale-result guard.
- `cloudflare-deploy/public/student-game-rescue-voyage.html`: existing immutable script reference bumped from `game-vocab.js?v=1` to `?v=2`.
- `test-harness/game_vocab_account_race_harness.mjs`: strict, synthetic VM regression for actual client source.
- `test-harness/learning_loop_audit_harness.mjs`: earlier isolated audit artifact; not a production pass or approved ongoing probe.
- `test-harness/track3-evidence/`: preserved before/after evidence and client call inventory.

Asset-version ledger integration remains to be coordinated and verified. Do not deploy this partial change by itself or infer that cached clients have received it.

## 6. Harness tests

The strict client harness covers same-owner request deduplication; cache hit; cache expiration; concurrent A/B requests; old A response arriving after B login; B receiving only B content; logout during a pending request; stale A failure while B is pending; network failure; and retry recovery.

The earlier isolated data audit used canonical handler code and in-memory SQLite, not production data. It also confirmed existing duplicate-request effects and the absence of a stored speaking phrase in game-content results. Its successful assertions mean the observations were reproduced, not that the product passed the requested acceptance criteria.

## 7. Sandbox tests

Synthetic delayed responses, changed account, logout, rejected network Promise, cache expiration and retry were injected in a VM. All network operations were test doubles. This is an isolated logic sandbox, **not a browser UI or deployed staging end-to-end test**. Real student sessions, audio, AI providers and games were not exercised.

## 8. Test count

- Client pre-change strict harness: 12 assertions, 7 pass / 5 fail.
- Client post-change strict harness: 12 assertions × 3 runs = 36 pass / 0 fail.
- Client JavaScript syntax: 1 check, pass.
- Earlier isolated audit: 55 pre-change assertions; 56 after client fix. These are reproduction checks, not full-system acceptance checks.

## 9. Results

Local client account-switch regression: passed repeatedly. Full continuous-learning integration: failed/not implemented. Server permission changes: pending approval and supported execution path. Full browser integration, aggregate repository checks and real learner verification: not run.

## 10. Additional problems found

- Pending response after logout could still deliver personal content.
- Completion of an older request could interfere with the newer request's pending state.
- Existing repeated game-result submissions accumulate again; a durable idempotency key is not present in the inspected contract.
- A learning level selected for chat must not be mislabeled as an independently assessed level.
- Text transcription alone does not establish a pronunciation error.
- Existing learning keys are UID-based; the audit's synthetic tenant-labelled UIDs do not prove an authoritative tenant-membership boundary.

## 11. Additional corrections

Logout/stale-completion cases were corrected together with the narrow vocabulary race. Duplicate persistence, server permissions, durable signal schema and level semantics were not altered.

## 12. Retest

All 12 client assertions passed in each of three post-change runs. The earlier audit continued to identify unresolved product gaps. No live validation was attempted.

## 13. Regression

Same-owner in-flight deduplication, existing cache reuse/expiration, fallback on network failure and retry recovery still pass. Full game screens, AI speaking, asset ledger, repository-wide tests and deployment are not verified by these tests.

## 14. Performance comparison

No latency benchmark was conducted. Same-owner overlapping loads still result in one request; switching accounts correctly creates a separate request. No model call, database query or audio latency improvement is claimed.

## 15. Remaining risks

The complete loop and durable nine-category evidence are missing. Permissions require a separate approved fix. Duplicate events may inflate observations. Account switching is proven only at the loader boundary, not every game screen. Immutable-cache version ledger and aggregate testing remain. Teacher/admin visibility, tenant transfer semantics, retention and deletion require product decisions. Existing D1 development/production sharing makes remote sandbox assumptions unsafe.

## 16. Final verification status

**Partial local improvement; additional verification required.** The client race is corrected in the working copy and passes isolated repeated tests. Track 3 as a whole is not complete, merge-ready or deployment-ready.

---

# Data-contract decision needed before implementation

## Existing stores and what they actually prove

| Existing store | Current evidence | Limitation |
|---|---|---|
| `ai_friend_chats` | Per-UID user/assistant text, level and timestamp | Raw utterance is not proof of learned/mastered words; no nine-category events or stable turn relationship |
| `SESSION_STATE` key `aifriendfix:<uid>` | Correction-display memo | Six-hour expiry, designed for display cadence; not a durable learning record |
| `vocabulary` | Per-UID word, Korean meaning, example and review counters | No source speaking turn, confidence or verified-expression category |
| `game_progress` | Per-UID/language/item correct/wrong counts and pronunciation aggregates | Aggregated counts, no event uniqueness; game attribution can be overwritten by the latest game |
| `game_sessions` | Game session totals and times | No existing stable idempotency key; no item-level learning evidence |
| `voice_coaching` | Target/transcribed text, scores and feedback | Different activity; must not invent matching pronunciation evidence for chat-only speech |
| `students_erp` / chat `level` | Account/context level / requested conversation level | Source and meaning must remain distinct from assessed skill |

Source anchors: [chat and correction storage](https://github.com/navy111p-sudo/mangoiweb/blob/27ec8ce91c624a80559ee82311fc425664b07319/cloudflare-deploy/src/api-ai.ts#L469), [game content](https://github.com/navy111p-sudo/mangoiweb/blob/27ec8ce91c624a80559ee82311fc425664b07319/cloudflare-deploy/src/index.ts#L3403), [game record schema](https://github.com/navy111p-sudo/mangoiweb/blob/27ec8ce91c624a80559ee82311fc425664b07319/cloudflare-deploy/src/game-insights.ts#L104).

## Option A: limited connection using existing stores

After approved ownership enforcement and client compatibility validation, use existing vocabulary and item counters as a bounded practice working set. Keep source evidence labels: “saved vocabulary,” “used in conversation,” “game answer,” and “practice candidate.” Do not rename these to “mastered,” “pronunciation problem,” or “assessed level.” Existing games can reuse stored vocabulary, and speaking can reuse eligible weak words with age/level limits.

This requires no new persistent table, but it cannot meet all nine requested durable learning categories, exactly-once event processing, or source-level audit history. It is an incremental step, not completion.

## Option B: append-only learning-event contract (approval required)

Propose one additional durable event ledger rather than immediately replacing existing stores or introducing several new projections. No DDL or migration has been written/applied by this track.

Proposed fields to review:

- Authoritative server-resolved tenant identity and canonical student UID, with membership validated independently of client claims.
- Source activity (`speaking` or a named game), source turn/session/item ID and stable event ID.
- Event kind: word introduced/used, sentence introduced/used, verified correct expression, correction, difficult expression, pronunciation observation, recurring error observation or level observation.
- Normalized item plus original evidence reference; evidence type (model suggestion, student answer, evaluated pronunciation, selected level, assessed level).
- Observed timestamp, rule/model version, confidence if meaningful, and superseding/deletion reference when applicable.
- Unique key on owner + source + event ID, so retries do not count twice. Repeated genuine attempts use distinct IDs.

Do not copy complete transcripts/audio into this ledger by default. Reference the existing authorized source when possible. Do not infer good/bad expression quality simply from whether a correction card happened to display. Do not infer pronunciation from spelling. Do not declare recurrence from replayed duplicate requests. Selected chat level and assessed level must remain separate signals.

Potential flow after approval:

1. Save a verified speaking source turn and a bounded, attributable learning event.
2. Select practice items only for the authenticated current owner.
3. Games consume those items without changing the existing scoring contract.
4. Save result events with stable idempotency keys; update existing aggregates only once in the same transactional workflow where supported.
5. Later speaking selects a small, level-compatible subset of legitimate game difficulties.

The authoritative tenant resolver, transfer-between-organizations behavior, staff access and historical ownership require confirmation. Current UID-keyed tables are insufficient evidence that a new tenant scheme can be assumed safely.

## Required decisions

1. Approve the exact owner-check/client compatibility change separately before implementing access-control behavior.
2. Choose limited existing-store integration or the additional durable event ledger.
3. Confirm retention and deletion policy. No retention interval is established by the inspected code for a new ledger; do not silently choose one. Existing chat-clear semantics must be reconciled before retaining derived records after source deletion.
4. Confirm which teacher/admin roles may view which learning records. No new staff access should be added implicitly.
5. Confirm whether level is selected practice level, assessed level, or both with separate provenance.

## Acceptance plan after approvals

- Synthetic two-student and two-organization fixtures, plus account switching, logout and delayed responses.
- Verified speaking event → own game content → own result → later speaking practice, with direct source/event assertions at every step.
- Duplicate, reordered, partial, failed and retried submissions; no silently dropped or double-counted event.
- Malformed payloads and absent source references; no fabricated learning record.
- Missing/expired credentials and tenant membership changes, using a supported approved test path.
- Persistence failures with correct user-visible result, not a false “saved” success.
- Deletion/retention behavior and derived-record cleanup according to the approved policy.
- Existing AI level limits, normal game scoring/content and old clients preserved or explicitly migrated.
- Repeated local browser runs and a separately provisioned, verified non-production database before any actual learner acceptance test.
