# Admin repairs: strictly offline browser gate

The `Admin repairs offline browser` PR workflow runs the checked-out, shipped
`admin.html`, `teacher.html`, `admin/weekly-schedule.html`, and `admin/health.html`
in real Chromium. It runs the exact PR head and has only `contents: read` permission.
It never deploys, invokes Wrangler, loads bindings, or uses production accounts.

## Isolation and prerequisites

Playwright Core is pinned to **1.63.0** and installed into `RUNNER_TEMP` from the
official npm registry; its official Chromium installation happens before testing.
Neither the repository package manifests nor lockfiles are changed. Checkout
credentials are not persisted. Node and Chromium run as the runner user, with an
empty environment except for explicitly listed paths, inside a new Linux network
namespace containing only loopback and no default routes. A fresh HOME and TMPDIR
keep browser profiles separate. Namespace creation, privilege dropping, missing
tooling, browser launch failure, and test failure all fail the gate. There are no
passing skips and no network-enabled fallback.
Each case has a real-Node 90-second deadline. Held-response body completion and
clock advances have 12-second deadlines with phase labels; a stalled fixture fails
instead of keeping the workflow alive indefinitely. Response-order assertions wait
for the actual body and renderer task turns, independent of the virtual clock.
The native-fetch observer consumes a cloned response without delaying or replacing
the application's original response. This also proves arrival when the application
correctly rejects an obsolete response before reading its body, a case where
Chromium's generic request-finished wait can remain pending indefinitely.
Reports are checkpointed after each case and before failure cleanup. Context/browser
cleanup and report writes also have deadlines; cleanup failure or fewer than all
13 completed cases makes the run fail and exit nonzero.

No HTTP server is started. A synthetic `http://127.0.0.1:18763` origin is fulfilled
entirely by Playwright routes. Static bytes are read only below the realpath of
`cloudflare-deploy/public`; traversal and symlink escape are rejected. Unconfigured
API requests return a failing fixture response, unexpected mutation methods fail
the test, all nonlocal requests are aborted, WebSockets are closed without a
server connection, and service workers are blocked. There is no `route.continue`.
The OS namespace also denies any browser networking that bypasses page routing.
The teacher fixture explicitly controls `navigator.onLine` and dispatches browser
online/offline events so the page's polling guard is tested in both states.
Chromium detects the loopback-only namespace as offline even after Playwright's
offline toggle. This fixture input does not change OS networking or routed fetches.

To reproduce on a Linux machine, use the install and namespace commands in the
workflow. Do not run the script directly in a network-capable namespace: it checks
the kernel interfaces and routes and intentionally refuses to proceed. No login,
secrets, Cloudflare configuration, or running application server is required.

## Bounded cases

- Weekly schedule, at both 1280px and 1024px: real mouse drag while locked; unlocked
  cancel; confirmed three-row versioned batch; held response without premature UI
  success; hit-testable undo using returned versions; restored positions; 409
  preserving the group; retry; unobstructed controls and horizontal overflow.
  Saved-message and undo rectangles must not overlap at either width, including
  an actual in-case viewport resize in each direction. Both toasts must remain
  present for this assertion; disappearance cannot masquerade as separation.
  The first-visit guide is dismissed through its actual close button before grid
  interaction; hit testing remains required after dismissal.
- Teacher: real week buttons/date input, reversed responses, selected week through
  full refresh, automatic timer and language redraw; failed navigation preserving
  last good content; stale full/automatic reads; both sides of a KST Monday boundary
  in UTC, Los Angeles, Seoul, and Manila; polling suppressed offline and resumed by
  the online event without losing the selected week.
- Health: initial/automatic passive-only calls; no-selection and canceled-confirm
  no-ops; worker-only and D1-only explicit choices; canceled late response ignored.
- Admin identity: visible failed/stalled retry, recovery, double clicks, a genuine
  cross-tab `storage` event, and late stale account responses. A test-only native
  fetch observer tags `/me` requests by their call stack so other shipped `/me`
  callers are counted separately. It removes the identity request's AbortSignal
  to exercise the documented defense against fetch wrappers ignoring cancellation.
  No production script is edited or replaced.

Identity fixtures follow the two distinct shipped contracts: `/api/admin/me`
returns `role: hq` for HQ scope and `role: teacher` for teacher scope
(`auth-admin.ts`, `resolveRole`). Stored login sessions use the separate
`resolveUiIdentity` roles `hq_mgr` and `hq_teacher`. Weekly manager/edit checks use
the stored UI role. The full-dashboard case uses its supported `?full=1` entry;
Worker-side role redirects are source-audited, not executed by this static harness.

Only synthetic fixture request/assertion logs and viewport screenshots are uploaded.
Unconfigured unrelated dashboard reads, blocked external assets, and page errors
are recorded in `fixture-report.json`; this is a scoped regression gate, not a claim
that every unrelated dashboard card works offline. The workflow must complete on
the final PR head before reporting browser verification as passed.
