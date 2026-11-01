// Maintained replacement for the June 2026 change-set snapshot. The old harness
// depended on a clean git checkout, deleted practice.html, removed promo code and
// a copied authentication implementation. Execute current source tests instead.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const suites = [
  'inline_js_syntax_harness.mjs',
  'student_erp_lookup_harness.mjs',
  'promo_video_popup_harness.mjs',
  'sidebar_three_level_harness.mjs',
  'sidebar_menu_parity_harness.mjs',
  'speech_recognition_harness.mjs',
];
let failed = 0;
for (const suite of suites) {
  const r = spawnSync(process.execPath, [fileURLToPath(new URL(suite, import.meta.url))], {
    cwd: root, encoding: 'utf8', timeout: 180000, windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
  });
  process.stdout.write(r.stdout || '');
  process.stderr.write(r.stderr || '');
  const ok = !r.error && r.status === 0;
  console.log(`${ok ? 'PASS' : 'FAIL'} maintained QA: ${suite}`);
  if (!ok) { failed++; if (r.error) console.error(r.error.message); }
}
process.exitCode = failed ? 1 : 0;
