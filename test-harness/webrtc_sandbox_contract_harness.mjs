// Contract test for the MANGOI WebRTC Harness + Sandbox project.
// This is intentionally dependency-free so CI can run it before the full browser harness.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const matrixPath = new URL('./webrtc-sandbox-matrix.json', import.meta.url);
const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));

let pass = 0;
function ok(value, message) {
  assert.ok(value, message);
  pass++;
}

ok(matrix.schema_version === 1, 'matrix schema version is pinned');
ok(Array.isArray(matrix.teacher_profiles), 'teacher profiles exist');
ok(matrix.teacher_profiles.includes('HOME'), 'HOME profile is covered');
ok(matrix.teacher_profiles.includes('OFFICE'), 'OFFICE profile is covered');
ok(Array.isArray(matrix.scenarios) && matrix.scenarios.length >= 10, 'broad impairment matrix exists');

const ids = new Set(matrix.scenarios.map(s => s.id));
for (const id of ['baseline','latency-100','latency-200','latency-300','loss-1','loss-3','loss-5','loss-10','jitter-80','bandwidth-500','disconnect-3000']) {
  ok(ids.has(id), 'scenario exists: ' + id);
}

const g = matrix.hard_guards || {};
ok(g.require_explicit_sandbox_flag === true, 'explicit sandbox flag is mandatory');
ok(g.forbid_production_room === true, 'production rooms are forbidden');
ok(g.forbid_production_credentials === true, 'production credentials are forbidden');
ok(g.forbid_impairment_in_live_class === true, 'live-class impairment is forbidden');

for (const s of matrix.scenarios) {
  ok(Number(s.latency_ms) >= 0, s.id + ': latency is non-negative');
  ok(Number(s.jitter_ms) >= 0, s.id + ': jitter is non-negative');
  ok(Number(s.packet_loss_pct) >= 0 && Number(s.packet_loss_pct) <= 100, s.id + ': loss is bounded');
  ok(Number(s.disconnect_ms) >= 0, s.id + ': disconnect is non-negative');
  if (s.bandwidth_kbps != null) ok(Number(s.bandwidth_kbps) > 0, s.id + ': bandwidth limit is positive');
}

const metrics = new Set(matrix.required_metrics || []);
for (const m of ['connect_success','rtt_ms','jitter_ms','packet_loss_pct','audio_conceal_pct','video_freeze_count','video_freeze_duration_ms','recovery_success','recovery_duration_ms','restart_ice_count','renegotiation_count','peer_rebuild_count','path','turn']) {
  ok(metrics.has(m), 'required metric exists: ' + m);
}

console.log('webrtc_sandbox_contract_harness: PASS ' + pass + ' / FAIL 0');
