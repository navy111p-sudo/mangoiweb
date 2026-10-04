// Manual counterfactual test: each intentionally broken qlog must be rejected by
// the behavioral harness. Never edit the shipping source for a mutation run.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
const source = fs.readFileSync(new URL('../cloudflare-deploy/public/js/idx-vc-qlog.js', import.meta.url), 'utf8');
const mutants = {
  'omit-peer-identity': source.replace('prev.pc === pc && ', '').replace('if (prev && prev.pc !== pc)', 'if (false)'),
  'retain-pending-peer-silence': source.replace('if (prev && prev.pc !== pc)', 'if (false)'),
  'retain-loss-warning-streak': source.replace('if (window.__vcRxBad) window.__vcRxBad[id] = 0;', ''),
  'omit-track-identity': source.replace(' && prev.trackId === track.id', '').replace('if (previous && previous.trackId !== track.id)', 'if (false)'),
  'retain-pending-track-silence': source.replace('if (previous && previous.trackId !== track.id)', 'if (false)'),
  'omit-stat-identity': source.replace('prev.statId === s.id && ', ''),
  'accept-counter-reset': source.replace(' && rec >= prev.rec', ''),
  'accept-replaced-track': source.replace(' || r.track !== track', ''),
  'accept-old-summary': source.replaceAll(' || window.__vcQ !== Q', ''),
  'guess-unknown-direct': source.replace("        if (!relay && (!['host', 'srflx', 'prflx'].includes(lc.candidateType)\n            || !['host', 'srflx', 'prflx'].includes(rc.candidateType))) return;", ''),
  'accept-retired-path': source.replace('        if ((window.vcPeerConnections || {})[id] !== pc || window.__vcQ !== Q) return;', ''),
  'overlap-path-probes': source.replace(' || pc.__vcPathReading', ''),
  'accept-failed-pair': source.replace(" || pair.state !== 'succeeded'", ''),
};
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-network-mutants-'));
try {
  for (const [name, candidate] of Object.entries(mutants)) {
    assert.notEqual(candidate, source, `mutation ${name} must change source`);
    new vm.Script(candidate); // A syntax error is not behavioral falsification.
    const target = path.join(directory, name + '.js'); fs.writeFileSync(target, candidate);
    const result = spawnSync(process.execPath, ['test-harness/vc_network_epoch_harness.mjs'], {
      cwd: root, env: { ...process.env, QLOG_SOURCE: target }, encoding: 'utf8', timeout: 10000,
    });
    assert.equal(result.status, 1, `${name} must exit with an assertion failure, not a timeout/crash`);
    const summary = result.stdout.match(/vc_network_epoch_harness: PASS (\d+) \/ FAIL ([1-9]\d*) \/ SKIP 0/);
    assert.ok(summary, `${name} must produce the complete behavioral report: ${result.stderr}`);
    console.log(`DETECTED ${name}: ${summary[2]} failed scenarios`);
  }
  console.log(`vc_network_epoch_mutations: PASS ${Object.keys(mutants).length} / FAIL 0 / SKIP 0`);
} finally { fs.rmSync(directory, { recursive: true, force: true }); }
