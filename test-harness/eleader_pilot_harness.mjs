// Runs the isolated SQLite/API tests; never accesses deployment bindings.
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
assert.match(readFileSync('cloudflare-deploy/src/index.ts','utf8'), /path\.startsWith\('\/api\/ai\/eleader\/'\)/);
assert.match(readFileSync('cloudflare-deploy/src/api-ai.ts','utf8'), /return handleEleaderApi\(request, url, env, eleaderEngines\)/);
const result=spawnSync(process.execPath,['--test','test-harness/eleader/api.test.mjs','test-harness/eleader/worker.test.mjs','test-harness/eleader/recorder.test.mjs','test-harness/eleader/staged.test.mjs','test-harness/eleader/expansion.test.mjs'],{stdio:'inherit'});
process.exit(result.status ?? 1);
