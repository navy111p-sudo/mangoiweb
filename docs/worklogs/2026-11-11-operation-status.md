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

Follow-up (2026-11-12 KST), after owner requested continuation:
- Scoped HTML cache references and the asset manifest were updated.
- Added GitHub browser verification because local Chromium cannot create its socket.
- Fixed diagnostics mounting in a document-free statistics harness; added the repository-required Git checkout cache step to the new workflow.
- Rechecked existing quality (232), sizebar (38), fast recovery (117), reconnect (37), teacher controls (39), camera drag (15), statistics and TypeScript successfully before the follow-up fixes.
- Full CI and browser verification remain required before merge. No claim of completed production deployment.

Rollback, if authorized later, is a PR reverting the feature with fresh asset versions; no stored data migration is involved.
