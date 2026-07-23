// -*- coding: utf-8 -*-
// 💰 (2026-07-24) 화상수업 쓰기 비용 절감 회귀 하네스 — 의존성 없음.
//   실행: node test-harness/vc_write_cost_harness.mjs
//   목적: "수업 중 자잘한 서버 쓰기" 빈도를 되돌리면(비용 폭증) 게이트에서 막는다.
//   근거: 800명·30교사 규모에서 KV/D1 무료 한도를 넘기던 주범이 아래 3개였다.
//     ① heartbeat KV 쓰기 — 그 키(hb:*)를 읽는 코드가 어디에도 없는 '죽은 쓰기'였다 → 제거
//     ② speaking-time·gaze D1 쓰기 10초 주기 → 30초
//     ③ vc_quality D1 쓰기 30초 → 60초
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dir = dirname(fileURLToPath(import.meta.url));
const R = (p) => readFileSync(resolve(__dir, p), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
function ok(name, cond){ if (cond) PASS++; else { FAIL++; FAILS.push(name); } console.log(`  ${cond ? '✅' : '❌'} ${name}`); }

const ATT  = R('../cloudflare-deploy/public/js/mango-attendance.js');
const GAZE = R('../cloudflare-deploy/public/js/mango-gaze.js');
const IDX  = R('../cloudflare-deploy/public/index.html');
const MANGO = R('../cloudflare-deploy/src/api-mango.ts');

console.log('\n[ ① heartbeat KV 쓰기 제거 (죽은 키였음) ]');
// 서버: hb: 키에 KV.put 을 더 이상 하지 않는다
ok('서버 heartbeat 가 KV 에 쓰지 않는다(no-op)',
   /\/api\/attendance\/heartbeat'[\s\S]{0,400}return json\(\{ ok: true, noop: true \}\)/.test(MANGO));
ok('서버 heartbeat 에 SESSION_STATE.put(hb:) 가 없다',
   !/hb:\$\{[\s\S]{0,80}SESSION_STATE\.put/.test(MANGO) && !/`hb:\$\{b\.room_id\}/.test(MANGO));
// 클라: heartbeat 호출 자체를 하지 않는다
ok('클라이언트가 /api/attendance/heartbeat 를 더 이상 호출하지 않는다',
   !/apiPost\('\/api\/attendance\/heartbeat'/.test(ATT));
// 🔴 만약 누군가 hb: 를 '읽는' 코드를 새로 추가하면, 이 제거가 기능을 깬 것이므로 경고.
//    (지금은 읽는 곳이 0곳이라 안전. 읽기가 생기면 KV 부활이 아니라 DO presence 로 구현할 것.)
ok('hb: 키를 읽는 코드가 여전히 없다(있으면 KV 부활이 아니라 DO 로 구현할 것)',
   !/SESSION_STATE\.get\([^)]*hb:/.test(MANGO) && !/get\(`hb:/.test(MANGO));

console.log('\n[ ② 발화시간·시선 보고 주기 10초 → 30초 ]');
{
  const m = ATT.match(/HEARTBEAT_INTERVAL_MS = (\d+)_?0*/);
  const val = m ? parseInt(m[1].length <= 2 ? m[1] + '000' : m[1], 10) : 0;
  // '30_000' → m[1]='30' → 30000
  const raw = ATT.match(/HEARTBEAT_INTERVAL_MS = ([\d_]+)/);
  const num = raw ? parseInt(raw[1].replace(/_/g, ''), 10) : 0;
  ok(`발화시간 보고 주기 ≥ 30초 (현재 ${num/1000}초)`, num >= 30000);
}
{
  const raw = GAZE.match(/REPORT_INTERVAL_MS = ([\d_]+)/);
  const num = raw ? parseInt(raw[1].replace(/_/g, ''), 10) : 0;
  ok(`시선 보고 주기 ≥ 30초 (현재 ${num/1000}초)`, num >= 30000);
}
ok('발화량은 로컬 누적 후 leave 에서 최종 확정(주기 늘려도 무손실)',
   /total_active_ms:\s*Math\.round\(state\.activeMs\)/.test(ATT) && /path = '\/api\/attendance\/leave'/.test(ATT));

console.log('\n[ ③ 회선품질(vc_quality) 보고 주기 30초 → 60초 ]');
ok('vc_quality 전송 주기 ≥ 60초',
   /Date\.now\(\) - Q\.sentAt < 60000/.test(IDX) && !/Q\.sentAt < 30000/.test(IDX));

console.log('\n[ ④ 캐시 버전이 올라갔는가(안 올리면 옛 고빈도 스크립트가 남음) ]');
{
  const a = IDX.match(/mango-attendance\.js\?v=(\d+)/);
  const g = IDX.match(/mango-gaze\.js\?v=(\d+)/);
  ok(`mango-attendance.js ?v ≥ 34 (현재 ${a?a[1]:'없음'})`, !!a && Number(a[1]) >= 34);
  ok(`mango-gaze.js ?v ≥ 35 (현재 ${g?g[1]:'없음'})`, !!g && Number(g[1]) >= 35);
}

console.log(`\n결과: ${PASS} 통과, ${FAIL} 실패`);
if (FAIL) { console.log('실패:', FAILS.join(', ')); process.exit(1); }
