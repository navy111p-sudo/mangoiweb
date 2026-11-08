# MANGOI Agent Skills: Codex and Claude Code

## What is included
- `AGENTS.md`: shared repository instructions read by Codex.
- `.agents/skills/mangoi-{development,testing,deployment,recovery,security}/SKILL.md`: project skills for Codex-compatible agents.
- `.claude/skills/mangoi-*/SKILL.md`: Claude Code wrappers pointing to the shared procedures.

## Codex setup
1. Open Codex with the GitHub repository `navy111p-sudo/mangoiweb` (connect GitHub and select the repository if prompted).
2. Use the branch containing these files, or merge the reviewed PR into the default branch after verification.
3. Ask Codex: "Read AGENTS.md and list the five project skills in .agents/skills. Do not modify code." Confirm it can read all five.
4. For an actual task, ask: "Follow mangoi-development and mangoi-testing skills. Implement [specific change] on a branch, run available checks and open a PR. Do not merge or deploy."
5. Verify environment access and installed dependencies independently; repository files alone do not install the Codex application or grant GitHub/Cloudflare access.

## Claude Code setup
Clone/open the same repository in Claude Code, check that `.claude/skills/` is discoverable, and ask it to read the shared skill referenced by each wrapper. Verify before relying on automatic skill selection.

## Release safety
Production deploys and PR merges require passing relevant checks, environment authorization and explicit approval. Skills cannot trigger an unattended deployment or override permissions. Never include secrets in prompts, PRs or logs.

## Verification checklist
- [ ] Codex can read AGENTS.md
- [ ] Codex can discover and read all five shared skills
- [ ] Claude Code can discover all five wrappers and shared skill references
- [ ] Test task creates PR without altering production
- [ ] Relevant CI passes
- [ ] Approved merge and deployment verified separately
