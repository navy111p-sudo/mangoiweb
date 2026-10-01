#!/usr/bin/env node
/* 공용 «수업 연기·변경» 창(js/class-move-modal.js) — 싣는 화면들의 ?v= 가 서로 같은가.
   [왜] 그 창을 «누를 때만» 동적으로 싣는 화면(manager·branch·admin/student)은 `sc.src = '…?v=N'` 모양이라
        asset_version_harness 의 `src="…"` 정규식에 안 걸린다. 모달을 고쳐 번호를 올릴 때 한 곳만 빠뜨려도
        아무 검사가 FAIL 하지 않고, 그 화면만 immutable 캐시에 옛 판이 1년 남는다(2026-10-01 trap-check 지적).
   ✅ «몇 곳인가» 가 아니라 «전부 같은 번호인가» 로 묻는다(정당하게 화면이 늘어도 빨간불이 아니다). */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
let pass = 0, fail = 0;
const check = (n, ok, extra) => { if (ok) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (extra ? '  → ' + extra : '')); } };

function walk(d, out) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    const st = statSync(p);
    if (st.isDirectory()) { if (f !== 'node_modules') walk(p, out); }
    else if (/\.(html|js)$/.test(f)) out.push(p);
  }
  return out;
}

const hits = [];
for (const f of walk(PUB, [])) {
  const s = readFileSync(f, 'utf8');
  const re = /class-move-modal\.js\?v=(\d+)/g;
  let m;
  while ((m = re.exec(s))) hits.push({ file: relative(ROOT, f), v: m[1] });
}

console.log('공용 연기·변경 창 ?v= 일치');
check('(전제) 그 창을 싣는 화면이 둘 이상 있다', hits.length >= 2, String(hits.length));
check('(전제) 동적으로 싣는 학생 상세도 목록에 있다', hits.some(h => /admin[\\/]student\.html$/.test(h.file)));
const vs = [...new Set(hits.map(h => h.v))];
check('싣는 화면 전부가 같은 ?v= 를 쓴다', vs.length === 1, hits.map(h => h.file + '=v' + h.v).join(' · '));

console.log('결과: PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
