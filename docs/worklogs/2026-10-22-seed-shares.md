# 2026-10-22 — Saved custom academy demo links

Adds immutable, publicly readable lesson snapshots in the existing SESSION_STATE KV under `seed-share:v1:lesson:`. No D1 operations, migrations, binding changes, domain/route configuration, authentication changes or AI credentials.

- `POST /api/seed-shares`: same-origin JSON, bounded body, server validation, whitelisted lesson fields only, awaited durable KV write and fresh 96-bit ID. Best-effort hourly hashed-IP KV save budget; not an atomic limiter.
- `GET /api/seed-shares/{id}`: returns only the saved title, vocabulary, core sentences and starter question. No listing, mutation or student result/history endpoint.
- `GET /s/{id}`: serves existing seed.html shell; the original short URL stays in the address bar. Snapshot load rebuilds the same deterministic worksheet/quiz and supplies its content to existing warmup AI. Each AI start uses a separate session. Microphone remains user-initiated.
- Saved links have no automatic expiration. Anyone possessing the link can read its lesson; UI explains this before saving. Editing and saving creates a new link, preserving previous versions.
- Failed snapshot loads block lesson activities rather than showing the default seed story. Retry and a link back to the default sample are available.
- Restores the default sample PDF href; custom lessons continue to use browser print/PDF.

Validation completed before commit: 32 backend checks (mock KV round trip with an independent reader, immutable links, data whitelist, validation, origin/content-type, oversized body, quota and storage failures), module TypeScript noEmit, inline JS syntax, browser UI save and new-tab short-link restoration. Full repository checks and real KV save/load will be verified after deployment; no deployment or live storage success is claimed here yet.

Rollback: revert this commit. Existing KV snapshots can remain unused without touching other prefixes. No live student data is changed.
