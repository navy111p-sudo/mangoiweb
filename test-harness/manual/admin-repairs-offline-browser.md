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

No HTTP server is started. A synthetic `http://127.0.0.1:18763` origin is fulfilled
entirely by Playwright routes. Static bytes are read only below the realpath of
`cloudflare-deploy/public`; traversal and symlink escape are rejected. Unconfigured
API requests return a failing fixture response, unexpected mutation methods fail
the test, all nonlocal requests are aborted, WebSockets are closed without a
server connection, and service workers are blocked. There is no `route.continue`.
The OS namespace also denies any browser networking that bypasses page routing.
Browser online emulation is explicitly enabled so the teacher page's online-only
polling guard runs; the independent OS network isolation remains in force.

To reproduce on a Linux machine, use the install and namespace commands in the
workflow. Do not run the script directly in a network-capable namespace: it checks
the kernel interfaces and routes and intentionally refuses to proceed. No login,
secrets, Cloudflare configuration, or running application server is required.

## Bounded cases

- Weekly schedule, at both 1280px and 1024px: real mouse drag while locked; unlocked
  cancel; confirmed three-row versioned batch; held response without premature UI
  success; hit-testable undo using returned versions; restored positions; 409
  preserving the group; retry; unobstructed controls and horizontal overflow.
- Teacher: real week buttons/date input, reversed responses, selected week through
  full refresh, automatic timer and language redraw; failed navigation preserving
  last good content; stale full/automatic reads; both sides of a KST Monday boundary
  in UTC, Los Angeles, Seoul, and Manila.
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
