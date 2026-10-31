// 🚪 «지금 들어갈 수업» 고르기 — 겹친 두 수업에서 답이 뒤집히지 않는가 (2026-09-30 jjy2323 실사고)
//   정본 src/class-current-pick.ts 를 --experimental-strip-types 로 «실제로» 돌린다.
//   배선: api-mango.ts 의 current 가 그 정본을 부르고, 옛 «가장 가까운 것» 식이 없는가.
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.env.PICK_SRC || join(ROOT, 'cloudflare-deploy/src/class-current-pick.ts');
const MANGO = process.env.MANGO_SRC || join(ROOT, 'cloudflare-deploy/src/api-mango.ts');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✅', n); } else { fail++; console.log('  ❌ FAIL', n, x ?? ''); } };

const tmp = mkdtempSync(join(tmpdir(), 'pick-'));
writeFileSync(join(tmp, 'pick.ts'), readFileSync(SRC, 'utf8'));
const M = 60000, T = (h, m) => Date.UTC(2026, 8, 30, h - 9, m);
const cases = {
  kes: { id: 'kes', start_ts: T(11, 40), end_ts: T(12, 0) },
  win: { id: 'win', start_ts: T(11, 50), end_ts: T(12, 10) },
};
writeFileSync(join(tmp, 'run.mjs'), `
import { pickCurrentSession } from './pick.ts';
const C = ${JSON.stringify(cases)};
const LATE = 15*60000, OPEN = 10*60000;
const mk = (now) => Object.values(C).map(s => ({ ...s, join_open: now >= s.start_ts - OPEN && now <= s.end_ts + LATE }));
const at = (now) => { const p = pickCurrentSession(mk(now), now); return p ? p.id : null; };
const out = {};
for (const [h,m] of [[11,31],[11,41],[11,44],[11,45],[11,46],[11,49],[11,52],[11,59],[12,1],[12,9],[12,12],[12,24],[12,26]]) out[h+':'+String(m).padStart(2,'0')] = at(Date.UTC(2026,8,30,h-9,m));
out.empty = pickCurrentSession([], 0);
out.closed = pickCurrentSession([{ start_ts: 0, end_ts: 1, join_open: false }], 5);
console.log(JSON.stringify(out));
`);
const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', join(tmp, 'run.mjs')], { encoding: 'utf8' });
let o = null; try { o = JSON.parse(r.stdout.trim().split('\n').pop()); } catch (e) {}
ok('정본을 실제로 돌렸다', !!o, r.stderr.slice(0, 300));
if (o) {
  ok('11:31 — 둘 다 입장 전, 먼저 열린 Kes', o['11:31'] === 'kes', o['11:31']);
  ok('11:41 — Kes 진행 중', o['11:41'] === 'kes', o['11:41']);
  ok('11:44 — Kes', o['11:44'] === 'kes', o['11:44']);
  ok('11:45 — (옛 규칙이 뒤집히던 경계) 여전히 Kes', o['11:45'] === 'kes', o['11:45']);
  ok('11:46 — 여전히 Kes (옛 규칙은 Win)', o['11:46'] === 'kes', o['11:46']);
  ok('11:49 — 여전히 Kes', o['11:49'] === 'kes', o['11:49']);
  ok('11:52 — 둘 다 진행 중이면 먼저 시작한 Kes', o['11:52'] === 'kes', o['11:52']);
  ok('11:59 — Kes', o['11:59'] === 'kes', o['11:59']);
  ok('12:01 — Kes 끝남 → 진행 중인 Win (짝: 영영 Kes 가 아니다)', o['12:01'] === 'win', o['12:01']);
  ok('12:09 — Win', o['12:09'] === 'win', o['12:09']);
  ok('12:12 — 둘 다 끝, 지각창 → 최근에 끝난 Win', o['12:12'] === 'win', o['12:12']);
  ok('12:24 — Win 지각창', o['12:24'] === 'win', o['12:24']);
  ok('12:26 — 둘 다 닫힘 → 없음', o['12:26'] === null, o['12:26']);
  ok('빈 목록 → null', o.empty === null);
  ok('입장 창 닫힌 것만 → null', o.closed === null);
}

// 배선
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const m = readFileSync(MANGO, 'utf8');
const ms = strip(m);
ok('api-mango.ts 가 정본을 import', /import\s*\{[^}]*pickCurrentSession[^}]*\}\s*from\s*'\.\/class-current-pick'/.test(m));
ok('current 를 정본으로 고른다', /current\s*=\s*pickCurrentSession\(\s*joinable\s*,\s*now\s*\)/.test(ms));
ok('옛 «가장 가까운 것» 식이 남아 있지 않다', !/Math\.abs\(a\.start_ts\s*-\s*now\)/.test(ms));
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
