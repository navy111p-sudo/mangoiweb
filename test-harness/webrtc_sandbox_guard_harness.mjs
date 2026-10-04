import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { requireWebrtcSandbox } from './webrtc-sandbox-guard.mjs';
let pass = 0;
const env = { MANGOI_WEBRTC_SANDBOX: '1', BASE_URL: 'http://127.0.0.1:8791', TEACHER_PROFILE: 'HOME' };
for (const teacherProfile of ['HOME', 'OFFICE']) for (const base of ['http://127.0.0.1:8791', 'http://localhost:8791/', 'http://[::1]:8791']) {
  const r = requireWebrtcSandbox({ ...env, BASE_URL: base, TEACHER_PROFILE: teacherProfile });
  assert.equal(r.teacherProfile, teacherProfile); assert.equal(r.origin, new URL(base).origin); pass++;
}
for (const BASE_URL of [undefined, '', 'invalid', 'https://test.mangoi.co.kr', 'https://mangoi.ai', 'https://webrtc-unified-platform-prod.workers.dev', 'https://staging.example.com', 'http://localhost.attacker.invalid', 'http://127.0.0.1@external.invalid', 'file:///tmp/test', 'ws://localhost:8791', 'http://me:token@localhost:8791', 'http://localhost:8791/?token=synthetic', 'http://localhost:8791/#token', 'http://localhost:8791/production']) {
  assert.throws(() => requireWebrtcSandbox({ ...env, BASE_URL })); pass++;
}
for (const MANGOI_WEBRTC_SANDBOX of [undefined, '', '0', 'true']) { assert.throws(() => requireWebrtcSandbox({ ...env, MANGOI_WEBRTC_SANDBOX })); pass++; }
for (const TEACHER_PROFILE of [undefined, '', 'home', 'UNKNOWN']) { assert.throws(() => requireWebrtcSandbox({ ...env, TEACHER_PROFILE })); pass++; }
// The actual entrypoint must reject the production target before dependency
// resolution or browser launch. This child can never reach a remote endpoint.
const rejected = spawnSync(process.execPath, ['test-harness/vc_netem_multiclient_harness.mjs'], {
  encoding: 'utf8', timeout: 5000, env: { ...process.env, ...env, BASE_URL: 'https://test.mangoi.co.kr' },
});
assert.notEqual(rejected.status, 0); assert.match(rejected.stderr, /production and remote targets are forbidden/);
assert.doesNotMatch(rejected.stderr, /ERR_MODULE_NOT_FOUND|browserType|Failed to launch/); pass++;
console.log(`webrtc_sandbox_guard_harness: PASS ${pass} / FAIL 0 / SKIP 0`);
