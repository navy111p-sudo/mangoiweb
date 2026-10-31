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
// 검사 수를 «정확히 N» 으로 못 박지 않는다 — 절이 늘면 멀쩡한 변경이 빨간불이 된다(2026-10-18 PC 카드 절로 63→65).
// 바닥(63)만 두고 FAIL 0 을 요구한다 — 검사가 조용히 줄어드는 것은 여전히 잡는다.
const MIN_CHECKS = 63;
const restored = run();
const rs = /warmup-two-way-browser — PASS (\d+) \/ FAIL (\d+)/.exec(restored.stdout || '');
if (restored.error || restored.signal || restored.status !== 0 || !rs ||
    Number(rs[2]) !== 0 || Number(rs[1]) < MIN_CHECKS)
  throw new Error('Restored baseline must pass at least ' + MIN_CHECKS + ' checks with 0 FAIL; skip is not success');
console.log('PASS: restored baseline ' + rs[1] + '/0');
