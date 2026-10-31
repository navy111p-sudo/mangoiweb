// warmup_fix_trace_harness — 웜업 교정 «판정 사유» 기록(src/warmup-fix-trace.ts) 검사 (2026-10-31)
// 실행: node test-harness/warmup_fix_trace_harness.mjs
// 확인하는 것:
//   · 정상 기록 한 줄이 들어간다(사유·모드·태그가 그대로)
//   · DB 가 없거나 던져도 호출한 쪽에 예외를 던지지 않는다(대화를 멈추지 않는다)
//   · 표는 한 번만 만든다(매 턴 CREATE 를 보내지 않는다)
//   · 학생 발화·문장은 어디에도 실리지 않는다(함수가 받는 필드만 저장)
//   · 판정 블록이 index.ts 에 실제로 연결돼 있다(사유를 세는 줄 전부)

import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ FAIL ' + name + (extra ? ' — ' + String(extra).slice(0, 200) : '')); }
};

const src = readFileSync(join(root, 'cloudflare-deploy/src/warmup-fix-trace.ts'), 'utf8');
// 모듈 수준 캐시(표 만들기 완료 여부)가 검사 사이에 새지 않도록, 검사마다 새 모듈 인스턴스를 받는다.
const load = () => import('data:text/javascript,' + encodeURIComponent(stripTypeScriptTypes(src)) + '//' + Math.random());
let M;
try {
  M = await load();
} catch (e) {
  ok('정본을 읽어 실행할 수 있다', false, e?.message || e);
  console.log(`\nwarmup_fix_trace_harness — PASS ${pass} / FAIL ${fail}`);
  process.exit(1);
}

function fakeDb({ failCreate = false, failInsert = false } = {}) {
  const log = { creates: 0, inserts: [] };
  return {
    log,
    prepare(sql) {
      return {
        run: async () => {
          if (/CREATE TABLE/.test(sql)) { log.creates++; if (failCreate) throw new Error('create down'); return {}; }
          if (failInsert) throw new Error('insert down');
          return {};
        },
        bind: (...args) => ({
          run: async () => { if (failInsert) throw new Error('insert down'); log.inserts.push({ sql, args }); return {}; },
        }),
      };
    },
  };
}

const row = { userId: 'kim01', sessionId: 's1', lang: 'en', mode: 'focused', reason: 'held_gap', tag: 'tense' };

console.log('\n[1] 정상 기록');
{
  const db = fakeDb();
  await M.logWarmupFixTrace({ DB: db }, row);
  ok('한 줄이 들어간다', db.log.inserts.length === 1, db.log.inserts.length);
  const a = db.log.inserts[0]?.args || [];
  ok('사유·모드·태그·언어가 그대로 들어간다', a[4] === 'held_gap' && a[3] === 'focused' && a[5] === 'tense' && a[2] === 'en', a);
  ok('저장 칸은 정해진 일곱 개뿐이다(학생 발화 칸이 없다)', a.length === 7, a.length);
}

console.log('\n[2] 표는 한 번만 만든다');
{
  M = await load();
  const db = fakeDb();
  for (let i = 0; i < 5; i++) await M.logWarmupFixTrace({ DB: db }, row);
  ok('다섯 번 불러도 CREATE 는 한 번', db.log.creates === 1, db.log.creates);
  ok('다섯 번 모두 기록된다', db.log.inserts.length === 5, db.log.inserts.length);
}

console.log('\n[3] 실패해도 던지지 않는다');
{
  let threw = false;
  try { await M.logWarmupFixTrace(undefined, row); await M.logWarmupFixTrace({}, row); } catch { threw = true; }
  ok('DB 가 없으면 조용히 넘어간다', !threw);
  threw = false;
  try { await M.logWarmupFixTrace({ DB: fakeDb({ failCreate: true }) }, row); } catch { threw = true; }
  ok('표 만들기가 실패해도 던지지 않는다', !threw);
  threw = false;
  try { await M.logWarmupFixTrace({ DB: fakeDb({ failInsert: true }) }, row); } catch { threw = true; }
  ok('기록(INSERT)이 실패해도 던지지 않는다', !threw);
}

console.log('\n[4] 실패한 표 만들기는 다음 턴에 다시 시도한다');
{
  M = await load();
  // 첫 번째 시도만 실패하게 — 그 뒤엔 살아난다고 보고 다시 만들기를 시도해야 한다.
  let calls = 0;
  const db = { prepare: (sql) => ({ run: async () => { if (/CREATE/.test(sql)) { calls++; if (calls === 1) throw new Error('once'); } return {}; }, bind: () => ({ run: async () => ({}) }) }) };
  await M.logWarmupFixTrace({ DB: db }, row);
  await M.logWarmupFixTrace({ DB: db }, row);
  ok('첫 실패 뒤 다음 턴에 CREATE 를 다시 보낸다', calls === 2, calls);
}

console.log('\n[5] 판정 블록이 index.ts 에 연결돼 있다');
{
  const idx = readFileSync(join(root, 'cloudflare-deploy/src/index.ts'), 'utf8');
  const callLines = idx.split('\n').filter(l => /logWarmupFixTrace\(env,/.test(l));
  ok('턴마다 기록을 부르는 줄이 정확히 하나', callLines.length === 1, callLines.length);
  const reasonSets = idx.split('\n').filter(l => /traceReason = /.test(l)).length;
  ok('사유를 바꾸는 대입이 셋 이상(없음/거절은 한 줄, 보류·가림·보여줌)', reasonSets >= 3, reasonSets);
  ok('엘리더잼 표시를 교정 판정에 넘기지 않는다', !/resolveWarmupHonest\([^)]*eleader:/.test(idx));
}

console.log(`\nwarmup_fix_trace_harness — PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
