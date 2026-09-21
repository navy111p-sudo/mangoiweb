// Run only against an isolated local checkout; always restore the original page.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const page = 'cloudflare-deploy/public/warmup.html';
const original = readFileSync(page, 'utf8');
const anchor = "if(t.getAttribute('data-way')){";
if (original.split(anchor).length !== 2) throw new Error('Expected exactly one two-way click handler');
function run() {
  const result = spawnSync(process.execPath, ['test-harness/manual/warmup-two-way-browser.mjs'],
    { encoding: 'utf8', timeout: 120000 });
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  return result;
}
try {
  writeFileSync(page, original.replace(anchor, "if(false && t.getAttribute('data-way')){"));
  const result = run();
  const summary = /warmup-two-way-browser — PASS (\d+) \/ FAIL (\d+)/.exec(result.stdout || '');
  if (result.error || result.signal || result.status !== 1 || !summary || Number(summary[2]) === 0)
    throw new Error('Mutation must finish with a FAIL summary, not crash, timeout, or pass');
  console.log('PASS: broken two-way wiring is detected and the suite finishes cleanly');
} finally {
  writeFileSync(page, original);
}
const restored = run();
if (restored.error || restored.signal || restored.status !== 0 ||
    !/warmup-two-way-browser — PASS 63 \/ FAIL 0/.test(restored.stdout || ''))
  throw new Error('Restored baseline must pass all 63 checks; skip is not success');
console.log('PASS: restored baseline 63/0');
