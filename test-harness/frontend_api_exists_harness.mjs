// frontend_api_exists_harness.mjs — 「화면이 부르는 API 가 서버에 실재하는가」 (2026-08-10)
//
// 배경
//   route_inventory / mango_gate 하니스는 «서버가 등록한 라우트» 쪽을 지켰다.
//   반대 방향의 구멍이 있었다: **화면이 fetch 하는데 서버엔 핸들러가 없는** 경로다.
//   부르면 404/405 가 나고 화면은 «❌ 실패» 만 띄운다. 서버엔 아무 신호가 안 남는다.
//
//   2026-08-10 배포 검증 중 발견하고 라이브(test.mangoi.co.kr)로 실증했다 — 전부 404:
//       /api/battle/{challenge,accept,decline,submit-score,word-set,active,incoming}
//       /api/dictionary
//       /api/report/comparison
//   battle 은 서버에 leaderboard·history «관리자 조회» 만 있고, 학생이 쓰는 도전장 흐름
//   7종이 통째로 없다. dictionary·report/comparison 도 처리 코드가 없다.
//   (셋 다 index.ts 의 «전달 게이트» 에는 등록돼 handleMangoApi 로 넘어가지만,
//    그 아래 처리하는 핸들러가 없어 404 로 떨어진다 — «반쪽 배선».)
//
// 판정 방식 — «소스에서 게이트 범위를 문자 인덱스로 추론» 하지 않는다.
//   그 방식은 게이트 안/밖 경계를 잘못 잡아 오판했다(2026-08-10 에 그 함정을 밟았다).
//   대신 «라이브 404 로 실증한 죽은 경로» 를 정본으로 두고,
//   화면(public)이 그 경로를 «새로 더» 부르기 시작하면 잡는다.
//
//   ⚠️ 없는 API 를 만들라고 요구하지 않는다. 기능 완성/삭제는 사람이 정한다.
//      죽은 목록을 갱신할 땐(핸들러를 만들었거나 호출을 지웠으면):
//        node test-harness/frontend_api_exists_harness.mjs --update

import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const PUB = join(__dir, '../cloudflare-deploy/public');
const SNAP = join(__dir, 'frontend-api-dead.json');
const UPDATE = process.argv.includes('--update');

// 라이브에서 404 로 실증된 «죽은» 경로 (2026-08-10). 핸들러를 만들거나 호출을 지우면 여기서 빼고 --update.
const DEAD = new Set([
  '/api/battle/accept', '/api/battle/active', '/api/battle/challenge',
  '/api/battle/decline', '/api/battle/incoming', '/api/battle/submit-score',
  '/api/battle/word-set', '/api/dictionary', '/api/report/comparison',
]);

function walk(dir, acc) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) { if (!/vendor|library|models|video|audio|img|node_modules/.test(e)) walk(p, acc); }
    else if (/\.(html|js)$/.test(e)) acc.push(p);
  }
  return acc;
}

// 화면이 fetch 하는 «죽은 경로» 를 파일:줄 과 함께 모은다
const hits = [];
for (const file of walk(PUB, [])) {
  const lines = readFileSync(file, 'utf8').split('\n');
  // 경로를 «public 기준 상대경로» 로 — Windows 는 join 이 \ 를 쓰므로 양쪽을 / 로 정규화한 뒤 자른다
  const rel = file.replace(/\\/g, '/').replace(PUB.replace(/\\/g, '/') + '/', '');
  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i].matchAll(/fetch\(\s*[`'"](\/api\/[a-z0-9/_-]+)/gi)) {
      const path = m[1].replace(/\/+$/, '');
      if (DEAD.has(path)) hits.push({ path, at: `${rel}:${i + 1}` });
    }
  }
}
const calledDead = [...new Set(hits.map(h => h.path))].sort();
const notCalled = [...DEAD].filter(p => !calledDead.includes(p)).sort();

console.log(`라이브 404 로 확인된 죽은 경로 ${DEAD.size}개 · 그중 화면이 실제로 부르는 것 ${calledDead.length}개`);

if (UPDATE) {
  writeFileSync(SNAP, JSON.stringify({
    dead_and_called: calledDead,
    call_sites: hits.sort((a, b) => a.path.localeCompare(b.path)),
  }, null, 2) + '\n');
  console.log(`📌 현재 상태 고정 — 화면이 부르는 죽은 경로 ${calledDead.length}개`);
  process.exit(0);
}

let snap;
try { snap = JSON.parse(readFileSync(SNAP, 'utf8').replace(/^﻿/, '')); }
catch (e) {
  console.log(`\n🚨 ${SNAP} 을 읽을 수 없습니다 — 검사가 꺼진 채로 통과시키지 않습니다.\n   ${e.message}`);
  console.log(`   최초 생성:  node test-harness/frontend_api_exists_harness.mjs --update`);
  process.exit(1);
}

const knownCalled = new Set(snap.dead_and_called || []);
const fresh = calledDead.filter(p => !knownCalled.has(p));

if (fresh.length) {
  console.log(`\n🚨 화면이 «새로» 죽은 API 를 부르기 시작했습니다 ${fresh.length}개 — 누르면 404 입니다:`);
  for (const p of fresh) for (const h of hits.filter(x => x.path === p)) console.log(`    ${p}   ← ${h.at}`);
  console.log(`\n  서버에 핸들러를 만들거나(+ 게이트 등록), 화면에서 그 호출을 지우세요.`);
  console.log(`\n${fresh.length} FAIL`);
  process.exit(1);
}

console.log(`\n✅ 새로 죽은 호출 없음`);
if (calledDead.length) {
  console.log(`  ⚠ 여전히 화면이 부르는 죽은 경로 ${calledDead.length}개 (기능 완성/삭제는 사람 판단 대기):`);
  for (const p of calledDead) console.log(`     ${p}  ← ${hits.find(h => h.path === p).at}`);
}
if (notCalled.length) console.log(`  · 죽었지만 아무도 안 부르는 것: ${notCalled.join(', ')}`);
process.exit(0);
