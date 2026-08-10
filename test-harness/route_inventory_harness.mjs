// route_inventory_harness.mjs — 라우트 목록 고정 + 고아 핸들러 탐지 (2026-08-09)
//
// 왜 필요한가
//   CLAUDE.md 함정: 「새 API 추가 — src/index.ts 의 라우팅 + 인증 게이트에 반드시 등록해야 동작」.
//   등록을 빠뜨리면 핸들러는 멀쩡히 있는데 URL 로는 404 다. 배포도 성공하고 tsc 도 통과한다.
//   아무 신호가 없어서, 보통 「기능이 안 된다」는 제보로 며칠 뒤에 발견된다.
//
// 이 하니스가 하는 일
//   ① 라우트 목록을 뽑아 route-inventory.json 에 고정한다.
//      → 리팩토링 중 라우트가 «조용히 사라지면» 잡는다. (추가는 허용, 소실은 차단)
//   ② handleXxx 로 정의됐는데 «아무 데서도 호출되지 않는» 핸들러를 찾는다.
//      → 그게 바로 「만들었는데 404 인」 기능이다.
//
// 목록을 의도적으로 갱신할 때:  node test-harness/route_inventory_harness.mjs --update

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dir, '../cloudflare-deploy/src');
const SNAP = join(__dir, 'route-inventory.json');
const UPDATE = process.argv.includes('--update');

const files = readdirSync(SRC).filter(f => f.endsWith('.ts'));
const src = new Map();
for (const f of files) src.set(f, readFileSync(join(SRC, f), 'utf8'));

// ── ① 라우트 수집 ──
const routes = new Set();
for (const [f, t] of src) {
  for (const m of t.matchAll(/path\s*===\s*['"`]([^'"`]+)['"`]/g)) routes.add(m[1]);
  for (const m of t.matchAll(/path\.startsWith\(\s*['"`]([^'"`]+)['"`]/g)) routes.add(m[1] + '*');
}
const routeList = [...routes].sort();

// ── ② 고아 핸들러 탐지 ──
// 정의: `async function handleXxx(` / `function handleXxx(`
// 호출: 정의가 아닌 곳에서 `handleXxx(` 또는 `handleXxx,` (참조 전달) 등장
const defined = new Map();   // 이름 → 정의된 파일
for (const [f, t] of src) {
  for (const m of t.matchAll(/(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s+(handle[A-Z]\w*)\s*\(/g)) {
    defined.set(m[1], f);
  }
}
const orphans = [];
for (const [name, defFile] of defined) {
  let used = false;
  for (const [f, t] of src) {
    // 정의 줄 자체는 빼고 센다
    const withoutDef = t.replace(new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*\\(`, 'g'), '');
    if (new RegExp(`\\b${name}\\b`).test(withoutDef)) { used = true; break; }
  }
  if (!used) orphans.push({ name, file: defFile });
}

// ── 보고 ──
console.log(`라우트 ${routeList.length}개 · 핸들러 ${defined.size}개 (src/*.ts ${files.length}개)`);

let fail = 0;

if (orphans.length) {
  console.log(`\n⚠ 정의됐지만 아무 데서도 호출되지 않는 핸들러 ${orphans.length}개 — 「만들었는데 404」 후보:`);
  for (const o of orphans) console.log(`    ${o.file}  ${o.name}()`);
  fail += orphans.length;
}

if (UPDATE) {
  writeFileSync(SNAP, JSON.stringify({ routes: routeList, orphans: orphans.map(o => o.name) }, null, 2) + '\n');
  console.log(`\n📌 목록 고정: 라우트 ${routeList.length}개 · 알려진 고아 ${orphans.length}개`);
  process.exit(0);
}

let snap = null;
try { snap = JSON.parse(readFileSync(SNAP, 'utf8').replace(/^﻿/, '')); }
catch (e) {
  // 여기서 조용히 넘어가면 게이트가 꺼진 채 초록불이 된다 — baseline.json 에서 이미 밟은 함정.
  console.log(`\n🚨 route-inventory.json 을 읽을 수 없습니다 — 검사가 꺼진 채로 통과시키지 않습니다.`);
  console.log(`   ${e.message}`);
  console.log(`   최초 생성:  node test-harness/route_inventory_harness.mjs --update`);
  process.exit(1);
}

const known = new Set(snap.orphans || []);
const newOrphans = orphans.filter(o => !known.has(o.name));
const lost = (snap.routes || []).filter(r => !routes.has(r));
const added = routeList.filter(r => !(snap.routes || []).includes(r));

if (lost.length) {
  console.log(`\n🚨 사라진 라우트 ${lost.length}개 — 리팩토링 중 배선이 끊겼을 수 있습니다:`);
  for (const r of lost) console.log(`    ${r}`);
  fail += lost.length;
}
if (added.length) console.log(`\n➕ 새 라우트 ${added.length}개 (정상 — 의도한 것이면 --update):\n    ` + added.join('\n    '));

// 알려진 고아는 통과시킨다(기존 부채). 새로 생긴 고아만 막는다.
if (newOrphans.length) {
  console.log(`\n🚨 새로 생긴 고아 핸들러 ${newOrphans.length}개 — 라우팅 등록을 빠뜨렸습니다.`);
  fail += newOrphans.length;
} else if (orphans.length) {
  console.log(`   (위 ${orphans.length}개는 기존에 알려진 부채 — 새로 늘지 않았으므로 통과)`);
  fail -= orphans.length;
}

if (fail > 0) { console.log(`\n${fail} FAIL`); process.exit(1); }
console.log('\n✅ 라우트 목록 유지 · 새 고아 없음');
process.exit(0);
