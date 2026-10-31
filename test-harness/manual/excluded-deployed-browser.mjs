// Strict runner for all 18 previously excluded DOM fixtures plus maintained change QA.
// Real signaling/media is deliberately separate: vc_netem_multiclient_harness.mjs.
// BASE_URL=https://mangoi.ai node test-harness/manual/excluded-deployed-browser.mjs
// Dependencies: puppeteer-core and Chrome. No missing dependency/failure is a SKIP.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const base = process.env.BASE_URL || 'https://mangoi.ai';
if (!/^https?:$/.test(new URL(base).protocol)) throw new Error('BASE_URL must be HTTP(S)');
const out = process.env.E2E_REPORT_DIR ? resolve(process.env.E2E_REPORT_DIR) : mkdtempSync(join(tmpdir(), 'mangoi-excluded-e2e-'));
mkdirSync(out, {recursive: true});
const files = readdirSync(join(root, 'test-harness')).filter(f => f.endsWith('_harness.mjs') && /\bfrom\s+['"]puppeteer/.test(readFileSync(join(root, 'test-harness', f), 'utf8')) && f !== 'vc_netem_multiclient_harness.mjs');
const only = process.argv.slice(2);
const results = [];
for (const file of ['changes_qa_harness.mjs', ...files].filter(f => !only.length || only.includes(f))) {
  let log = ''; const started = Date.now(); let timedOut = false;
  const child = spawn(process.execPath, [...(file === 'changes_qa_harness.mjs' ? [] : ['--import', new URL('../helpers/deployed-browser-readonly.mjs', import.meta.url).href]), join(root, 'test-harness', file)], {cwd: root, env: {...process.env, BASE_URL: base}, windowsHide: true});
  child.stdout.on('data', b => log += b); child.stderr.on('data', b => log += b);
  const timer = setTimeout(() => { timedOut = true; child.kill(); }, file === 'changes_qa_harness.mjs' ? 300000 : 90000);
  const code = await new Promise(resolve => { child.on('error', error => { log += error.stack; resolve(null); }); child.on('exit', resolve); });
  clearTimeout(timer);
  writeFileSync(join(out, file + '.log'), log);
  // Some maintained suites print 'PASS 33 ❌ FAIL 0' even on success.
  // Ignore only that zero-failure summary; exit status still independently gates.
  const failures = log.split('\n').filter(l => /❌|\[E2E_(?:RUNTIME|INTERCEPTION)_ERROR\]|^FAIL\s|Error:/.test(l.replace(/❌\s*FAIL\s+0\b/, '')));
  const result = {file, code, timedOut, ms: Date.now() - started, ok: !timedOut && code === 0 && failures.length === 0, failures};
  results.push(result); console.log(JSON.stringify(result));
  writeFileSync(join(out, 'summary.json'), JSON.stringify({base, patchedAssets: process.env.E2E_PATCH_ASSETS === '1', results}, null, 2));
}
if (!results.length) throw new Error('No matching tests');
console.log('Report: ' + out);
process.exitCode = results.every(r => r.ok) ? 0 : 1;
