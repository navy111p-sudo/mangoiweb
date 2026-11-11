# Class operation status and teacher controls

Source: user-provided Google Doc 1rRXuvICMyT6F8CPYsr-_NvX_OuRUVvJR8bGYdx1mA2E.

The request is a BODA-like network diagnostics view and accessible Student Controls / Mute all / Lock Student Drawing / Focus Mode when the video pane is present.

Implementation reuses the existing receive statistics loop and outgoing samples. The dialog shows local-perspective connection states, outgoing loss/RTT, incoming audio/video loss, jitter, bitrate and FPS. No extra polling, automatic recovery action or data upload is added. Missing, silent, reset, replaced-track and stale samples are not reported as healthy. The existing teacher controls retain their IDs, handlers and role-based visibility, in a separate wrapping row above the material tabs.

Acceptance: controls remain clickable at desktop/tablet/mobile sizes, opening/closing diagnostics works, fresh/unknown values are distinct, student role cannot see staff controls, and reconnect/media lifecycle behavior remains unchanged.

Validation:
- TypeScript --noEmit passed.
- JavaScript syntax checks and git diff --check passed.
- New statistics harness passed (delta calculations, units, unknown/no packets, counter reset, replacement track, cleanup).
- Existing sizebar labels: 38 passed.
- Existing quality blindspot harness: 232 passed.
- Browser fixture prepared in test-harness/manual/vc-operation-browser.cjs; Chromium launch failed with socket() Operation not permitted. No visual verification claimed.
- Full fast suite started; cache-version gate fails as expected until the authorized version bump, and sparse checkout lacks some unrelated assets. Full gate is not green.

Pending protected-file authorization, per CLAUDE.md 4-1-1:
- cloudflare-deploy/public/index.html: idx-vc-qlog.js?v=22 -> v=23; idx-vc-sizebar.js?v=3 -> v=4.
- After authorization, update only these references, run asset version recording, rerun gates and browser checks. Do not merge this draft before all gates pass.

No production deployment or database changes were performed. Rollback, if authorized later, is a PR reverting this change with new asset versions; no stored data migration is involved.
