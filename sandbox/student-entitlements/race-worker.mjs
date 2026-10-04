import { parentPort, workerData } from 'node:worker_threads';
import { DatabaseSync } from 'node:sqlite';
import { createSandboxStore } from './store.mjs';
const contract = await import(workerData.contractUrl);
const db = new DatabaseSync(workerData.path);
const store = createSandboxStore(db, contract);
const sync = new Int32Array(workerData.sync);
Atomics.add(sync, 0, 1); Atomics.notify(sync, 0);
Atomics.wait(sync, 1, 0);
try { const r = store.apply(workerData.command); parentPort.postMessage({ ok: true, duplicate: r.duplicate }); }
catch (e) { parentPort.postMessage({ ok: false, error: e.code || e.message }); }
finally { db.close(); }
