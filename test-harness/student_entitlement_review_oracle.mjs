#!/usr/bin/env node
// Independent tick oracle: no production routes, network or financial providers.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { createSandboxStore } from '../sandbox/student-entitlements/store.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temp = mkdtempSync(join(tmpdir(), 'entitlement-review-oracle-'));
globalThis.fetch = () => { throw Error('OUTBOUND_TRAFFIC_FORBIDDEN'); };
try {
  const aiPath = join(temp, 'ai-pass.ts'), contractPath = join(temp, 'contract.ts');
  writeFileSync(aiPath, readFileSync(join(root, 'cloudflare-deploy/src/ai-pass.ts')));
  writeFileSync(contractPath, readFileSync(join(root, 'cloudflare-deploy/src/student-entitlement-contract.ts'), 'utf8')
    .replace("from './ai-pass'", `from '${pathToFileURL(aiPath).href}'`));
  const C = await import(pathToFileURL(contractPath).href);
  const schema = readFileSync(join(root, 'sandbox/student-entitlements/001_entitlements.sql'), 'utf8');
  const T = Date.UTC(2026, 0, 15), DAY = 86400000;
  let commands = 0, checks = 0;
  const origin = (id, product, at) => ({ id, studentUid: 'synthetic-review', sourceSystem: 'payment_orders', sourceRef: id,
    lineRef: '1', evidenceRef: 'synthetic-proof', product, currency: 'KRW', expectedAmount: 100,
    paidAmount: 100, settledAt: at, settlementStatus: 'paid' });
  for (let seed = 0; seed < 200; seed++) {
    const db = new DatabaseSync(':memory:'); db.exec(schema);
    try {
      const store = createSandboxStore(db, C), videos = new Map();
      let expectedPaidMs = 0;
      const run = (body, at) => store.apply({ id: 'review-' + commands++, studentUid: 'synthetic-review', at,
        expectedRevision: store.read('synthetic-review').revision, ...body }).state;
      for (let tick = 0; tick < 50; tick++) {
        const now = T + tick * DAY;
        // Every benefit boundary is on a day boundary. A benefit ending now
        // covered the entire preceding tick; consumption is computed separately.
        if (tick > 0 && ![...videos.values()].some(end => end >= now)) expectedPaidMs = Math.max(0, expectedPaidMs - DAY);
        if (tick === 0 || (tick + seed) % 13 === 0) {
          const id = 'a' + tick;
          const state = run({ type: 'grant_paid_ai', origin: origin(id, 'paid_ai', now), months: 1 }, now);
          expectedPaidMs += state.paidAi.at(-1).purchasedMs;
        }
        if ((tick + seed) % 9 === 1) {
          const id = 'v' + tick, end = now + (2 + seed % 8) * DAY;
          run({ type: 'grant_video', origin: origin(id, 'video_bundle', now), paidClassCount: 1,
            classes: [{ id, scheduleId: id, startAt: end - 1000, endAt: end, state: 'scheduled', revision: 0 }] }, now);
          videos.set(id, end);
        }
        if ((tick + seed) % 11 === 3) {
          const active = [...videos.entries()].find(([, end]) => end > now);
          if (active) { run({ type: 'cancel_origin', originId: active[0], evidenceRef: 'synthetic-approved' }, now); videos.delete(active[0]); }
        }
        assert.equal(C.entitlementView(store.read('synthetic-review'), now).paidRemainingMs, expectedPaidMs, `seed=${seed},tick=${tick}`);
        checks++;
      }
      store.verifyReplay('synthetic-review');
    } finally { db.close(); }
  }
  console.log(JSON.stringify({ suite: 'independent_paid_duration_oracle', histories: 200, ticksEach: 50,
    balanceChecks: checks, commands, scope: 'stacked_purchases_overlap_expiry_cancellation', pass: true,
    productionRouteCoverage: false, liveProviderCalls: 0 }));
} finally { rmSync(temp, { recursive: true, force: true }); }
