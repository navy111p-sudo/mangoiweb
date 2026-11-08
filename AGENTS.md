# MANGOI shared agent instructions

Use project skills under `.agents/skills/` for relevant work. Skills are instructions, not extra permissions.
Merge and deploy rules follow `CLAUDE.md` sections 1-2 and 4-1-1. If this file and `CLAUDE.md` disagree, `CLAUDE.md` wins.
(병합·배포 규칙의 정본은 CLAUDE.md 1-2·4-1-1 입니다. 서로 다르면 CLAUDE.md 를 따릅니다.)

- Inspect implementation and tests before edits; preserve unrelated behavior.
- Video classes: never force camera on; protect reconnection, textbook state, annotations, and normal end-of-class behavior.
- Check affected AI speaking, dubbing, teacher/admin, desktop/mobile flows.
- Never log secrets or student/teacher personal data.
- Report exactly which checks passed, failed, or were not run.
- Work in a feature branch and PR; never commit to `main` directly.
- Merge: once every CI gate is green, merge the PR without asking (CLAUDE.md 4-1-1, owner directive 2026-08-17). A push to `main` auto-deploys through GitHub Actions, so check the deploy run afterwards and report the result.
- Red CI: find the cause and fix it until green, then merge. Never bypass gates or disable tests.
- Stop and ask a human first when: there is a real conflict (both sides changed the same file), D1 data would change (DELETE/UPDATE/DROP), something is deleted or reverted, the work goes beyond the request, or a shared no-go file is touched (CLAUDE.md 4-1-1 table).
- Manual production deploys (`deploy.ps1`, `wrangler deploy`) are only for an authorized person (CLAUDE.md 1-2).
