// Keep the learning result/report regressions in the shared PR and deployment gate.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const result = spawnSync(process.execPath, ['--test',
  'cloudflare-deploy/test/ai-speaking-progress.test.ts',
  'cloudflare-deploy/test/ai-speaking-vocabulary.test.ts',
  'cloudflare-deploy/test/ai-speaking-progress-view.test.cjs',
  'cloudflare-deploy/test/warmup-learning-report.test.ts',
], {cwd: root, stdio: 'inherit'});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
