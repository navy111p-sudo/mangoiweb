---
name: mangoi-deployment
description: deployment workflow for mangoi.ai.
---
# MANGOI deployment
Confirm branch, CI, deployment target and rollback plan. Never publish secrets. Merge to `main` only after every relevant CI gate is green (CLAUDE.md 4-1-1); a push to `main` auto-deploys through GitHub Actions. Manual `deploy.ps1` is only for an authorized person (CLAUDE.md 1-2). Ask a human first for D1 data changes, deletions or reverts, real conflicts, out-of-scope work or shared no-go files. After deployment verify the deploy run log, uploaded asset list and health check. Stop and report failures.
