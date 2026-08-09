// schema_drift_harness.mjs — 코드의 CREATE TABLE 이 운영 실제와 어긋나는지 감시 (2026-08-09)
//
// 배경
//   스키마의 정본이 없었다. 표는 요청 처리 도중 코드가 만든다
//   (CREATE TABLE IF NOT EXISTS 324개 · ALTER TABLE ADD COLUMN 96개, migrations 폴더 없음).
//   그래서 같은 표를 여러 파일이 각자 만드는데 **모양이 서로 달랐다**:
//       students_erp        17벌 (컬럼 3~23개)  ← 운영 실제는 43개
//       class_schedules     14벌 (컬럼 5~16개)
//       student_evaluations  7벌 (컬럼 8~26개)
//
//   왜 위험한가: IF NOT EXISTS 라 **먼저 실행된 CREATE 가 이긴다**. 새 DB(개발용·복구본)에서
//   5컬럼짜리가 먼저 돌면 표가 5컬럼으로 만들어지고, 16컬럼을 기대하는 모든 코드가
//   런타임에 죽는다. 그 CREATE 들은 대부분 try{}catch{} 안이라 **조용히** 죽는다.
//   운영에서는 이미 만들어져 있어 아무 증상이 없다 — 새 환경에서만 터진다.
//
// 이 하니스가 막는 것
//   ① 코드의 CREATE 에 있는 컬럼이 운영 실제(schema-live.sql)에 없는 경우
//      → 그 코드는 운영에서 절대 성공하지 못한다(오타이거나 죽은 코드다)
//   ② 새로 «서로 다른 모양» 의 CREATE 가 추가되는 경우
//
// 기존 부채는 목록으로 인정하고 **새로 생기는 것만** 막는다.
// 목록 갱신:  node test-harness/schema_drift_harness.mjs --update
// 정본 갱신:  cloudflare-deploy/schema-live.sql 헤더의 명령 참고

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { columnsFromCreateBody, matchParen } from './sql-util.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dir, '../cloudflare-deploy/src');
const LIVE = join(__dir, 'schema-live-columns.json');
const SNAP = join(__dir, 'schema-drift-known.json');
const UPDATE = process.argv.includes('--update');

let live;
try { live = JSON.parse(readFileSync(LIVE, 'utf8').replace(/^﻿/, '')); }
catch (e) {
  console.log(`🚨 ${LIVE} 를 읽을 수 없습니다 — 검사가 꺼진 채로 통과시키지 않습니다.\n   ${e.message}`);
  process.exit(1);
}

// 컬럼 파싱은 sql-util.mjs 와 «같은 함수» 를 쓴다 — 두 벌이면 또 갈라진다.
const colsOf = columnsFromCreateBody;

const defs = [];
for (const f of readdirSync(SRC).filter(f => f.endsWith('.ts'))) {
  const t = readFileSync(join(SRC, f), 'utf8');
  const re = /CREATE TABLE IF NOT EXISTS\s+([A-Za-z_]\w*)\s*\(/gi;
  let m;
  while ((m = re.exec(t))) {
    const i = t.indexOf('(', m.index + m[0].length - 1);
    const end = matchParen(t, i);
    if (end < 0) continue;
    const line = t.slice(0, m.index).split('\n').length;
    defs.push({ table: m[1], file: f, line, cols: colsOf(t.slice(i + 1, end)) });
  }
}

// ── ① 운영에 없는 컬럼을 만드는 코드 ──
const ghosts = [];
for (const d of defs) {
  const lv = live[d.table];
  if (!lv) continue;                       // 운영에 없는 표는 여기서 판단하지 않는다(신규 기능일 수 있다)
  const missing = d.cols.filter(c => !lv.includes(c));
  if (missing.length) ghosts.push({ key: `${d.file}:${d.table}`, table: d.table, at: `${d.file}:${d.line}`, missing });
}

// ── ② 서로 다른 모양이 여러 벌인 표 ──
const byTable = new Map();
for (const d of defs) { if (!byTable.has(d.table)) byTable.set(d.table, []); byTable.get(d.table).push(d); }
const conflicts = [];
for (const [t, list] of byTable) {
  if (list.length < 2) continue;
  const sizes = new Set(list.map(x => x.cols.length));
  if (sizes.size > 1) conflicts.push({ key: t, n: list.length, min: Math.min(...sizes), max: Math.max(...sizes) });
}

console.log(`코드의 CREATE ${defs.length}개 · 운영 표 ${Object.keys(live).length}개`);
console.log(`  ① 운영에 없는 컬럼을 만드는 CREATE: ${ghosts.length}건`);
console.log(`  ② 모양이 서로 다른 표: ${conflicts.length}개`);

if (UPDATE) {
  writeFileSync(SNAP, JSON.stringify({
    ghosts: [...new Set(ghosts.map(g => `${g.key}|${g.missing.sort().join(',')}`))].sort(),
    conflicts: conflicts.map(c => c.key).sort(),
  }, null, 2) + '\n');
  console.log(`📌 기존 부채 고정 — ghosts ${ghosts.length} · conflicts ${conflicts.length}`);
  process.exit(0);
}

let known;
try { known = JSON.parse(readFileSync(SNAP, 'utf8').replace(/^﻿/, '')); }
catch (e) {
  console.log(`\n🚨 ${SNAP} 을 읽을 수 없습니다 — 검사가 꺼진 채로 통과시키지 않습니다.\n   ${e.message}`);
  console.log(`   최초 생성:  node test-harness/schema_drift_harness.mjs --update`);
  process.exit(1);
}

const knownG = new Set(known.ghosts || []);
const knownC = new Set(known.conflicts || []);
const newG = ghosts.filter(g => !knownG.has(`${g.key}|${g.missing.slice().sort().join(',')}`));
const newC = conflicts.filter(c => !knownC.has(c.key));

if (newG.length) {
  console.log(`\n🚨 운영에 없는 컬럼을 만드는 «새» CREATE ${newG.length}건 — 이 코드는 운영에서 성공할 수 없습니다:`);
  for (const g of newG.slice(0, 12)) console.log(`    ${g.at}  ${g.table} → ${g.missing.join(', ')}`);
}
if (newC.length) {
  console.log(`\n🚨 «새로» 모양이 갈라진 표 ${newC.length}개:`);
  for (const c of newC) console.log(`    ${c.key} — ${c.n}벌, 컬럼 ${c.min}~${c.max}개`);
  console.log(`\n  같은 표를 여러 곳에서 만들지 마세요. IF NOT EXISTS 는 먼저 실행된 것이 이깁니다.`);
}

const fail = newG.length + newC.length;
if (fail) { console.log(`\n${fail} FAIL`); process.exit(1); }
console.log(`\n✅ 새 스키마 어긋남 없음 (기존 부채 ghosts ${knownG.size} · conflicts ${knownC.size})`);
process.exit(0);
