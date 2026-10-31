// Node 24. Dry-run by default. Never stores credentials in the review plan.
// Scan: node cloudflare-deploy/scripts/repair-korean-vocab.mjs --translate --plan /secure/gloss-plan.json
// Apply reviewed plan: node cloudflare-deploy/scripts/repair-korean-vocab.mjs --apply /secure/gloss-plan.json
// Requires CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_DATABASE_ID.
import { readFile, writeFile } from 'node:fs/promises';
import { hasForeignGloss, isKoreanGloss, repairKoreanGlosses } from '../src/korean-vocab.ts';

const targets = [
  { table: 'vocabulary', column: 'korean', word: 'word', example: 'example' },
  { table: 'en_vocab', column: 'ko', word: 'en', example: "''" },
  { table: 'vocab_synonyms', column: 'meaning_ko', word: 'synonym', example: 'example' },
];
const arg = name => process.argv[process.argv.indexOf(name) + 1];
const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_DATABASE_ID: database } = process.env;
if (!token || !account || !database) throw new Error('Cloudflare token, account ID and database ID are required. No database changes made.');
const base = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}`;
async function api(path, body) {
  const response = await fetch(base + path, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok || data.success === false) throw new Error(`Cloudflare request failed (${response.status}); no credentials logged.`);
  return data.result;
}
async function query(sql, params = []) {
  const result = await api(`/d1/database/${encodeURIComponent(database)}/query`, { sql, params });
  if (!result?.[0]?.success) throw new Error('D1 query failed');
  return result[0];
}
const ai = process.argv.includes('--translate') ? { run: (model, input) => api('/ai/run/' + model, input) } : undefined;
if (process.argv.includes('--apply')) {
  const plan = JSON.parse(await readFile(arg('--apply'), 'utf8'));
  if (plan.version !== 1 || plan.account !== account || plan.database !== database || !Array.isArray(plan.items)) throw new Error('Plan does not match the target database');
  let changed = 0, conflicts = 0, unresolved = 0;
  for (const item of plan.items) {
    const target = targets.find(t => t.table === item.table && t.column === item.column);
    if (!target || !Number.isSafeInteger(item.id) || typeof item.before !== 'string' || !hasForeignGloss(item.before)) throw new Error('Invalid repair plan entry');
    if (typeof item.after !== 'string' || !isKoreanGloss(item.after) || item.after.length > 120) { unresolved++; continue; }
    // Compare-and-swap preserves concurrent teacher edits; the plan is also the original-value backup.
    const result = await query(`UPDATE ${target.table} SET ${target.column} = ? WHERE id = ? AND ${target.column} = ?`, [item.after, item.id, item.before]);
    if (result.meta?.changes === 1) changed++; else conflicts++;
  }
  console.log(JSON.stringify({ changed, conflicts, unresolved, next: 'Run a fresh scan to verify remaining mixed-script glosses.' }));
  if (conflicts || unresolved) process.exitCode = 2;
} else {
  const items = [], counts = {};
  for (const target of targets) {
    let cursor = 0, scanned = 0;
    // Snapshot upper ID ensures newly inserted rows cannot make this scan run forever.
    const upper = Number((await query(`SELECT MAX(id) AS n FROM ${target.table}`)).results[0]?.n || 0);
    while (cursor < upper) {
      const result = await query(`SELECT id, ${target.word} AS word, ${target.column} AS korean, ${target.example} AS example FROM ${target.table} WHERE id > ? AND id <= ? ORDER BY id LIMIT 250`, [cursor, upper]);
      const rows = result.results || [];
      if (!rows.length) break;
      scanned += rows.length;
      cursor = rows[rows.length - 1].id;
      const mixed = rows.filter(row => hasForeignGloss(row.korean));
      const repaired = await repairKoreanGlosses(mixed, ai);
      mixed.forEach((row, index) => items.push({ table: target.table, column: target.column, id: row.id, word: row.word, before: row.korean, after: isKoreanGloss(repaired[index].korean) ? repaired[index].korean : null }));
    }
    counts[target.table] = scanned;
  }
  const planPath = process.argv.includes('--plan') ? arg('--plan') : null;
  if (!planPath) throw new Error('Supply --plan with a secure output path; scan made no database changes.');
  await writeFile(planPath, JSON.stringify({ version: 1, account, database, created_at: new Date().toISOString(), counts, items }, null, 2), { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify({ scanned: counts, mixed: items.length, repairable: items.filter(i => i.after !== null).length, unresolved: items.filter(i => i.after === null).length, plan: planPath, database_changed: false }));
}
