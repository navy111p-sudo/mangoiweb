// silent_catch_harness.mjs — «쓰기 옆의 완전히 조용한 catch» 가 새로 생기는 것을 막는다 (2026-08-09)
//
// 왜 이게 중요한가 — 이번에 실제로 겪은 사고
//   POST /api/admin/schedule/approve (AI 주간 시간표) 는
//     INSERT 가 「no such column」 으로 매번 실패 → catch {} 가 삼킴 → inserted 는 0
//     → return { ok:true, inserted:0 } 로 **성공했다고 답했다.**
//   한 건도 저장하지 않으면서 화면엔 성공으로 보였다. 아무 신호가 없어 아무도 몰랐다.
//
// 무엇이 «잘못» 인가 (중요)
//   삼키는 것 자체가 늘 잘못은 아니다. 예: 결제 웹훅에서 알림 문자 발송이 실패했다고
//   결제 처리를 실패시키면 안 된다 — 삼키는 게 옳다.
//   잘못된 건 **아무 기록도 안 남기는 것**이다. 그러면 「문자가 안 갔다」를 영원히 모른다.
//   → 그래서 이 하니스는 catch 를 없애라고 하지 않는다. **한 줄이라도 남기라**고 한다.
//
// 무엇을 재나
//   catch 블록이 완전히 비어 있고(`catch {}` · `catch (e) {}`),
//   그 직전 try 본문에 **쓰기**(INSERT/UPDATE/DELETE/.run()/.put()/.delete())가 있는 경우.
//   읽기 실패는 화면이 비어 보이지만, 쓰기 실패는 「저장된 줄 알았는데 아닌」 상태를 만든다.
//
// 기존 부채는 목록으로 인정하고 **새로 생기는 것만** 막는다.
// 목록 갱신:  node test-harness/silent_catch_harness.mjs --update

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dir, '../cloudflare-deploy/src');
const SNAP = join(__dir, 'silent-catch-known.json');
const UPDATE = process.argv.includes('--update');

const EMPTY = /catch\s*(?:\([^)]*\))?\s*\{\s*\}/g;
const WRITE = /INSERT\s+INTO|INSERT\s+OR|UPDATE\s+\w+\s+SET|DELETE\s+FROM|\.run\(\)|\.put\(|\.delete\(/i;
// 스키마 보강(멱등)은 실패가 «정상» 이다 — 이미 있으면 던진다. 이건 세지 않는다.
const IDEMPOTENT = /ALTER\s+TABLE|CREATE\s+(TABLE|INDEX|UNIQUE)/i;

const found = [];
for (const f of readdirSync(SRC).filter(x => x.endsWith('.ts'))) {
  const text = readFileSync(join(SRC, f), 'utf8');
  const lines = text.split('\n');
  EMPTY.lastIndex = 0;
  let m;
  while ((m = EMPTY.exec(text))) {
    const ln = text.slice(0, m.index).split('\n').length;
    const before = lines.slice(Math.max(0, ln - 13), ln - 1).join('\n');
    if (!WRITE.test(before)) continue;
    if (IDEMPOTENT.test(before)) continue;
    // 키는 파일+«주변 코드의 모양» 으로 잡는다. 줄 번호로 잡으면 위에 한 줄만 넣어도 전부 새 항목이 된다.
    const sig = (lines[ln - 2] || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    found.push({ f, ln, key: `${f}|${sig}`, sig });
  }
}

console.log(`쓰기 옆의 «완전히 조용한» catch: ${found.length}건 (스키마 보강용 제외)`);

if (UPDATE) {
  writeFileSync(SNAP, JSON.stringify({ known: [...new Set(found.map(x => x.key))].sort() }, null, 2) + '\n');
  console.log(`📌 기존 부채 ${found.length}건 고정`);
  process.exit(0);
}

let known;
try { known = new Set(JSON.parse(readFileSync(SNAP, 'utf8').replace(/^﻿/, '')).known || []); }
catch (e) {
  console.log(`\n🚨 ${SNAP} 을 읽을 수 없습니다 — 검사가 꺼진 채로 통과시키지 않습니다.\n   ${e.message}`);
  console.log(`   최초 생성:  node test-harness/silent_catch_harness.mjs --update`);
  process.exit(1);
}

const fresh = found.filter(x => !known.has(x.key));
if (fresh.length) {
  console.log(`\n🚨 «새로» 생긴 조용한 catch ${fresh.length}건 — 쓰기가 실패해도 아무도 모릅니다:`);
  for (const x of fresh.slice(0, 15)) console.log(`    ${x.f}:${x.ln}   ${x.sig}`);
  console.log(`\n  catch 를 없애라는 게 아닙니다. **한 줄이라도 남기세요**:`);
  console.log(`      } catch (e) { console.warn('[여기가어디인지]', (e as any)?.message); }`);
  console.log(`  전건 실패가 «성공» 으로 보이면 안 되는 곳이면, 세어서 응답에 실으세요.`);
  console.log(`\n${fresh.length} FAIL`);
  process.exit(1);
}

console.log(`\n✅ 새로 생긴 조용한 catch 없음 (기존 부채 ${known.size}건)`);
process.exit(0);
