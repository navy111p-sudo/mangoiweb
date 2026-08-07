// -*- coding: utf-8 -*-
// ⚡ «요청마다 반복하던 준비 DDL» 1회화 하니스 (의존성 없음 · node 로 바로 실행)
//   실행:  node test-harness/once_per_isolate_harness.mjs
//   대상:  cloudflare-deploy/src/once-per-isolate.ts (순수 모듈)
//
//   이 파일이 지키는 것 —
//     ensureTable(env) 이 핸들러 첫 줄마다 있어서, 그 API 로 요청이 올 때마다
//     `CREATE TABLE IF NOT EXISTS` 가 D1 으로 한 번씩 더 나가고 있었다.
//     격리 수명 동안 한 번이면 충분하다 — 다만 «한 번»이 정말 한 번인지,
//     그리고 **실패했을 때 그 격리가 영영 테이블 없이 돌지 않는지**가 핵심이다.
//
//     A. 여러 번 불러도 실제 실행은 한 번
//     B. 동시에 몰려와도 한 번 (in-flight 합류)
//     C. 실패는 기억하지 않는다 — 다음 호출이 다시 시도
//     D. 한 번 성공한 뒤에는 다시 실행하지 않는다
//     E. 실패가 호출자에게 그대로 전달된다 (조용히 삼키지 않음)
//     F. 회귀 감시 — ensureTable 이 감싸지 않은 채로 되돌아가지 않았는지

import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dir, '../cloudflare-deploy/src');
const { oncePerIsolate } = await import(pathToFileURL(join(SRC, 'once-per-isolate.ts')).href);

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond, extra) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name + (extra ? ` — ${extra}` : '')); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${cond ? '' : (extra ? ` — ${extra}` : '')}`);
}

console.log('\nA·D. 여러 번 불러도 실제 실행은 한 번');
{
  let runs = 0;
  const once = oncePerIsolate(async () => { runs++; });
  await once({}); await once({}); await once({});
  check('3번 호출 → 실행 1번', runs === 1, 'runs=' + runs);
  await once({});
  check('성공 후 재호출해도 그대로 1번', runs === 1, 'runs=' + runs);
}

console.log('\nB. 동시에 몰려와도 한 번');
{
  let runs = 0;
  const once = oncePerIsolate(async () => {
    runs++;
    await new Promise(r => setTimeout(r, 20));   // 느린 DDL 흉내
  });
  await Promise.all(Array.from({ length: 25 }, () => once({})));
  check('동시 25건 → 실행 1번', runs === 1, 'runs=' + runs);
}

console.log('\nC·E. 실패는 기억하지 않는다 (그 격리가 영영 못 만드는 일 방지)');
{
  let runs = 0;
  const once = oncePerIsolate(async () => {
    runs++;
    if (runs === 1) throw new Error('D1 일시 오류');
  });

  let got = null;
  try { await once({}); } catch (e) { got = e; }
  check('첫 실패가 호출자에게 그대로 전달', got instanceof Error, String(got));

  // ⚠️ 여기서 그냥 await 하면, «실패를 기억하는» 회귀가 났을 때 하니스가 스택트레이스로
  //    죽어버려 무엇이 틀렸는지 안 보인다. 잡아서 명시적으로 보고한다.
  let retryErr = null;
  try { await once({}); } catch (e) { retryErr = e; }
  check('실패 후 다음 호출이 재시도', runs === 2,
    retryErr ? '재시도하지 않고 «기억된 실패»를 그대로 다시 던졌다 — 그 격리는 영영 테이블을 못 만든다'
             : 'runs=' + runs);

  await once({}); await once({});
  check('재시도 성공 뒤에는 다시 안 함', runs === 2, 'runs=' + runs);
}

console.log('\nC-2. 동시 호출이 함께 실패해도 다음 요청은 다시 시도');
{
  let runs = 0;
  const once = oncePerIsolate(async () => { runs++; throw new Error('계속 실패'); });
  await Promise.allSettled([once({}), once({}), once({})]);
  check('동시 3건 실패 → 실행 1번(합류)', runs === 1, 'runs=' + runs);
  await Promise.allSettled([once({})]);
  check('그 뒤 호출은 새로 시도', runs === 2, 'runs=' + runs);
}

console.log('\nF. 회귀 감시 — ensureTable 이 다시 «매 요청» 으로 돌아가지 않았는지');
{
  const offenders = [];
  for (const f of readdirSync(SRC).filter(x => x.endsWith('.ts'))) {
    const body = readFileSync(join(SRC, f), 'utf8');
    // 핸들러마다 부르는 ensureTable 을 가진 파일은 반드시 oncePerIsolate 로 감싸야 한다
    if (/^async function ensureTable\(/m.test(body) && /await ensureTable\(/.test(body)) {
      offenders.push(f);
    }
  }
  check('감싸지 않은 ensureTable 없음', offenders.length === 0,
    offenders.length ? offenders.join(', ') + ' → oncePerIsolate 로 감쌀 것' : '');
}

console.log('\n' + '─'.repeat(56));
console.log(`  ${PASS} PASS · ${FAIL} FAIL`);
if (FAIL) { console.log('\n  실패:'); FAILS.forEach(x => console.log('   - ' + x)); }
process.exit(FAIL ? 1 : 0);
