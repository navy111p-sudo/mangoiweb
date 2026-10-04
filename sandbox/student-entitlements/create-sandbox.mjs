#!/usr/bin/env node
// Explicit local sandbox creation only; no remote config, D1 command or network.
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, resolve, join } from 'node:path';
const requested = process.argv[2];
if (process.argv.length !== 3 || !requested || !basename(requested).endsWith('.sandbox.sqlite')) throw Error('Supply one NEW local *.sandbox.sqlite file');
const parent = realpathSync(dirname(resolve(requested))), path = join(parent, basename(requested));
if (!['/tmp/', '/workspace/'].some(root => path.startsWith(root)) || existsSync(path)) throw Error('Refusing non-sandbox location or existing file');
const db = new DatabaseSync(path);
try { db.exec(readFileSync(new URL('./001_entitlements.sql', import.meta.url), 'utf8')); }
finally { db.close(); }
console.log(JSON.stringify({ database: path, schema: 1, syntheticOnly: true, productionChanged: false }));
