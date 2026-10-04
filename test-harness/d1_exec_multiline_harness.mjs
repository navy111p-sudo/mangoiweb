/**
 * D1 exec() 는 입력을 «줄마다» 따로 실행한다 — 여러 줄 CREATE TABLE 은 운영에서만 실패한다.
 * (로컬 SQLite 의 exec 는 여러 줄을 받아 주므로 다른 하니스는 원리상 못 잡는다.)
 * 2026-10-04 실사고: schedule_move_guard·schedule_request_guard 가 운영 D1 에 한 번도 안 생겨
 * 주간 스케줄 이동·연기 요청 승인이 전부 503 이었다.
 *  - 저장 경로의 정본 두 파일: 여러 줄 exec 가 있으면 FAIL
 *  - 나머지: 이름만 찍는다(그 자리 대부분은 «이미 표가 있어» 실패해도 조용하다 — 사람이 볼 일)
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const SRC = fileURLToPath(new URL('../cloudflare-deploy/src/', import.meta.url));
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ FAIL ' + n); } };
// exec( + 백틱 문자열 안에 줄바꿈이 있는 자리
const multi = src => { const out = []; const re = /\.exec\(\s*`([^`]*)`/g; let m;
  while ((m = re.exec(src))) if (m[1].trim().includes('\n')) out.push(src.slice(0, m.index).split('\n').length); return out; };
for (const f of ['class-schedule-move.ts', 'schedule-request-atomic.ts']) {
  const s = readFileSync(join(SRC, f), 'utf8');
  ok(f + ': 여러 줄 exec() 없음', multi(s).length === 0);
  ok(f + ': guard 표를 prepare().run() 으로 만든다', /prepare\(`CREATE TABLE IF NOT EXISTS schedule_(move|request)_guard[\s\S]*?`\)\.run\(\)/.test(s));
}
// 판별식 자체가 동작하는가(짝)
ok('판별식: 여러 줄은 잡는다', multi("x.exec(`CREATE TABLE a (\n b)`)").length === 1);
ok('판별식: 한 줄은 안 잡는다', multi("x.exec(`CREATE TABLE a (b)`)").length === 0);
const others = [];
for (const f of readdirSync(SRC).filter(n => n.endsWith('.ts'))) {
  const lines = multi(readFileSync(join(SRC, f), 'utf8'));
  if (lines.length && !['class-schedule-move.ts', 'schedule-request-atomic.ts'].includes(f)) others.push(f + ':' + lines.join(','));
}
if (others.length) console.log('  ℹ️ 사람 확인 대기 — 여러 줄 exec() 가 남은 자리: ' + others.join(' · '));
console.log(`결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
