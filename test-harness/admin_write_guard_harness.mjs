// admin_write_guard_harness.mjs — 「강사가 부를 수 있는 관리자 쓰기 API」 탐지 (2026-08-09)
//
// 배경 (index.ts:313 의 주석 그대로)
//   「⚠️ 이건 '차단 목록'이라 새 API 를 추가하면 기본이 '교사 허용'이다.
//     교사가 볼 수 없어야 할 API 를 새로 만들면 이 목록에 반드시 추가할 것.
//     (근본 해결 = 허용 목록 방식 default-deny. 별도 작업으로 예정)」
//
//   지사·대리점은 이미 허용목록(default-deny)인데 **강사만 차단목록**이다.
//   그래서 새로 만든 /api/admin/* 는 아무 표시 없이 강사에게 열린다.
//   이미 두 번 밟았다:
//     · /api/admin/briefing (전사 매출·미납) — 목록 누락으로 강사에게 열려 있었다 (index.ts:337)
//     · /api/admin/payroll/seed-demo — 전 강사 급여 단가를 덮어쓰는 POST 인데 가드가 없었다 (2026-08-09)
//
// 이 하니스가 막는 것
//   /api/admin/* 의 **쓰기(POST/PUT/PATCH/DELETE)** 핸들러 중
//     ① TEACHER_BLOCKED_PREFIXES 로도 안 막히고
//     ② 핸들러 안에 강사 판정(isTeacher 등)도 없는 것
//   을 찾는다. 둘 다 없으면 강사가 그대로 실행할 수 있다.
//
// 목록에 남은 48건은 **미검토 부채가 아니라 검토 후 허용**이다.
//   2026-08-09 사장님 확정: monthly-report/approve·send, exam/delete,
//   microlearn/send-all, feedback-drafts/approve, forbidden-words 등
//   「강사도 해도 된다」. 그래서 닫지 않는다.
//   (닫은 것은 돈과 직결된 6건뿐 — payroll/seed-demo, points 3종, gifts 2종)
// 이 하니스의 목적은 「지금 열린 것을 닫는 것」이 아니라
//   **앞으로 새로 열리는 것을 사람이 반드시 보게 하는 것** 이다.
// 목록 갱신:  node test-harness/admin_write_guard_harness.mjs --update

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dir, '../cloudflare-deploy/src');
const SNAP = join(__dir, 'admin-write-guard-known.json');
const UPDATE = process.argv.includes('--update');

// ── 차단 목록 읽기 ──
const idx = readFileSync(join(SRC, 'index.ts'), 'utf8');
const bm = idx.match(/const TEACHER_BLOCKED_PREFIXES\s*=\s*\[([\s\S]*?)\];/);
if (!bm) { console.log('1 FAIL — TEACHER_BLOCKED_PREFIXES 를 못 찾음 (index.ts 구조 변경?)'); process.exit(1); }
const blocked = [...bm[1].matchAll(/['"]([^'"]+)['"]/g)].map(m => m[1]);

// ── /api/admin/* 쓰기 핸들러 수집 ──
// 가드로 인정하는 표현. 새 가드 패턴을 도입하면 여기에도 추가해야 한다 —
// 안 그러면 실제로는 막았는데 하니스가 「무방비」로 계속 세어 개선이 안 보인다(실제로 밟았다).
const GUARD = /isTeacher|forbidden_teacher|denyTeacher|ownName|teacherName|actor\.role/;
const found = [];
for (const f of readdirSync(SRC).filter(f => f.endsWith('.ts'))) {
  const lines = readFileSync(join(SRC, f), 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/method\s*===\s*['"](POST|PUT|PATCH|DELETE)['"]\s*&&\s*path\s*===\s*['"](\/api\/admin\/[^'"]+)['"]/);
    if (!m) continue;
    const [, method, route] = m;
    if (blocked.some(b => route.startsWith(b))) continue;      // 차단 목록이 막아 준다
    // 이 분기 본문(다음 라우트 분기 전까지, 최대 50줄)에 강사 판정이 있나
    let body = '';
    for (let j = i + 1; j < Math.min(i + 50, lines.length); j++) {
      if (/method\s*===\s*['"]\w+['"]\s*&&\s*path\s*===|^\s*if \(method/.test(lines[j])) break;
      body += lines[j] + '\n';
    }
    if (GUARD.test(body)) continue;                            // 핸들러가 스스로 막는다
    found.push({ route, method, at: `${f}:${i + 1}` });
  }
}

console.log(`차단 목록 ${blocked.length}개 · 무방비 관리자 쓰기 API ${found.length}개`);

if (UPDATE) {
  writeFileSync(SNAP, JSON.stringify({ known: found.map(x => `${x.method} ${x.route}`).sort() }, null, 2) + '\n');
  console.log(`📌 기존 부채 ${found.length}건을 알려진 목록으로 고정`);
  process.exit(0);
}

let known = new Set();
try {
  known = new Set(JSON.parse(readFileSync(SNAP, 'utf8').replace(/^﻿/, '')).known || []);
} catch (e) {
  console.log(`\n🚨 ${SNAP} 을 읽을 수 없습니다 — 검사가 꺼진 채로 통과시키지 않습니다.`);
  console.log(`   ${e.message}`);
  console.log(`   최초 생성:  node test-harness/admin_write_guard_harness.mjs --update`);
  process.exit(1);
}

const fresh = found.filter(x => !known.has(`${x.method} ${x.route}`));
if (fresh.length) {
  console.log(`\n🚨 강사가 그대로 실행할 수 있는 «새» 관리자 쓰기 API ${fresh.length}개:`);
  for (const x of fresh) console.log(`    [${x.method}] ${x.route}   ${x.at}`);
  console.log(`\n  둘 중 하나를 하세요:`);
  console.log(`    ① index.ts 의 TEACHER_BLOCKED_PREFIXES 에 경로 추가`);
  console.log(`    ② 핸들러 첫 줄에 강사 가드 추가 —`);
  console.log(`       const a = await getAdminActor(request, env as any);`);
  console.log(`       if (a.isTeacher) return json({ ok:false, error:'forbidden_teacher' }, 403);`);
  console.log(`\n  강사에게 열어도 되는 것이면:  --update 로 목록에 등록`);
  console.log(`\n${fresh.length} FAIL`);
  process.exit(1);
}

console.log(`\n✅ 새로 생긴 무방비 관리자 쓰기 API 없음 (기존 부채 ${known.size}건은 알려진 목록)`);
process.exit(0);
