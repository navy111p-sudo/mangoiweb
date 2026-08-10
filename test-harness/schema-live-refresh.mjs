// schema-live-refresh.mjs — 운영 D1 의 «실제» 스키마를 다시 뽑아 정본을 갱신한다 (2026-08-09)
//
// 쓰는 법 (리포 루트에서):
//   cd cloudflare-deploy
//   npx wrangler d1 execute mango-db --remote --json ^
//     --command "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'" > %TEMP%\schema-dump.json
//   cd ..
//   node test-harness/schema-live-refresh.mjs %TEMP%\schema-dump.json
//
// 만드는 것
//   · cloudflare-deploy/schema-live.sql        — 사람이 읽는 정본
//   · test-harness/schema-live-columns.json    — schema_drift_harness 가 대조에 쓰는 표
//
// ⚠️ 읽기(SELECT)만 한다. 운영 DB 를 건드리지 않는다.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { columnsFromCreateBody, matchParen } from './sql-util.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const DUMP = process.argv[2];
if (!DUMP) { console.log('사용법: node test-harness/schema-live-refresh.mjs <wrangler 덤프 json 경로>'); process.exit(1); }

const raw = readFileSync(DUMP, 'utf8').replace(/^﻿/, '');
const rows = JSON.parse(raw.slice(raw.indexOf('[')))[0].results;

const tables   = rows.filter(r => r.type === 'table').sort((a, b) => a.name.localeCompare(b.name));
const indexes  = rows.filter(r => r.type === 'index').sort((a, b) => a.name.localeCompare(b.name));
const triggers = rows.filter(r => r.type === 'trigger');

const head = `-- schema-live.sql — 운영 D1(mango-db)의 «실제» 모양.
--
-- 왜 이 파일이 필요한가
--   여태 스키마의 정본이 없었다. 표는 요청 처리 도중 코드가 만든다
--   (src/*.ts 에 CREATE TABLE IF NOT EXISTS 322개 · ALTER TABLE ADD COLUMN 96개, migrations 폴더 없음).
--   그래서 「지금 DB가 어떤 모양인가」를 알려면 322군데를 다 읽어야 했고,
--   같은 표를 여러 파일이 각자 만드는데 **모양이 서로 달랐다**:
--       students_erp        17벌 (컬럼 3~23개)   ← 운영 실제는 43개
--       class_schedules     14벌 (컬럼 5~16개)
--       student_evaluations  7벌 (컬럼 8~26개)
--
--   왜 위험한가: IF NOT EXISTS 라 **먼저 실행된 CREATE 가 이긴다**.
--   새 DB(개발용·복구본)에서 5컬럼짜리가 먼저 돌면 표가 5컬럼으로 만들어지고,
--   16컬럼을 기대하는 코드가 전부 런타임에 죽는다. 그 CREATE 들은 대부분
--   try{}catch{} 안이라 **조용히** 죽는다. 운영에선 이미 만들어져 있어 증상이 없다 —
--   새 환경에서만 터진다. 즉 **코드로는 이 DB 를 재현할 수 없었다.**
--
-- ⚠️ 손으로 고치지 말 것. 갱신은 test-harness/schema-live-refresh.mjs 로.
--
-- 표 ${tables.length}개 · 인덱스 ${indexes.length}개 · 트리거 ${triggers.length}개
`;

const body = [
  '\n-- ═══════════════════ 표 ═══════════════════\n',
  ...tables.map(t => `${t.sql.trim()};\n`),
  '\n-- ═══════════════════ 인덱스 ═══════════════════\n',
  ...indexes.map(t => `${t.sql.trim()};\n`),
  ...(triggers.length ? ['\n-- ═══════════════════ 트리거 ═══════════════════\n', ...triggers.map(t => `${t.sql.trim()};\n`)] : []),
].join('');

writeFileSync(join(__dir, '../cloudflare-deploy/schema-live.sql'), head + body);

const cols = {};
for (const t of tables) {
  const i = t.sql.indexOf('(');
  const end = matchParen(t.sql, i);
  cols[t.name] = columnsFromCreateBody(t.sql.slice(i + 1, end));
}
writeFileSync(join(__dir, 'schema-live-columns.json'), JSON.stringify(cols, null, 2) + '\n');

console.log(`schema-live.sql       — 표 ${tables.length} · 인덱스 ${indexes.length} · 트리거 ${triggers.length}`);
console.log(`schema-live-columns.json — ${Object.keys(cols).length}표`);
