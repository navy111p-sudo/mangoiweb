// role_single_source_harness.mjs — 역할 판정 정본이 하나인지 지킨다 (2026-08-09)
//
// 배경
//   「이 아이디는 본사인가 지사인가 대리점인가」를 정하는 접두사 규칙이 세 곳에 복사돼 있었고
//   **이미 갈라져 있었다** — admin/login.html 엔 parent/student 분기가 있고 index.html 엔 없었다.
//   규칙을 한 번 고치려면 여러 곳을 다 고쳐야 했고, 한 곳을 잊으면
//   「어떤 사람은 되고 어떤 사람은 안 되는」 버그가 됐다.
//
//   2026-08-09 에 서버 auth-admin.ts resolveUiIdentity() 하나로 모았다.
//   화면은 로그인 응답의 ui_role · branch_id · agency_id · display_name 을 그대로 쓴다.
//
// 이 하니스가 막는 것
//   화면 파일에 접두사 기반 역할 추측이 **다시 나타나는 것**.
//   (급할 때 "여기서 한 줄만" 이 복사본의 시작이다 — 실제로 그렇게 세 벌이 됐다)

import { readFileSync } from 'node:fs';
import { readPageSource } from './page-source.mjs';   // 분해 대응
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const PUB = join(__dir, '../cloudflare-deploy/public');
const SRC = join(__dir, '../cloudflare-deploy/src');

// 화면에서 금지 — 아이디 접두사로 역할을 정하는 패턴
const BANNED = [
  { re: /indexOf\(\s*['"]branch_['"]\s*\)\s*===?\s*0/, why: "uid.indexOf('branch_')===0 로 지사 판정" },
  { re: /indexOf\(\s*['"]agency_['"]\s*\)\s*===?\s*0/, why: "uid.indexOf('agency_')===0 로 대리점 판정" },
  { re: /indexOf\(\s*['"]hq_t['"]\s*\)\s*===?\s*0/,    why: "uid.indexOf('hq_t')===0 로 강사 판정" },
  { re: /startsWith\(\s*['"]branch_['"]\s*\)/,          why: "uid.startsWith('branch_') 로 지사 판정" },
  { re: /startsWith\(\s*['"]agency_['"]\s*\)/,          why: "uid.startsWith('agency_') 로 대리점 판정" },
];
const FILES = ['index.html', 'admin/login.html', 'admin.html'];

let fail = 0;
for (const f of FILES) {
  let t = '';
  try { t = readFileSync(join(PUB, f), 'utf8'); } catch { continue; }
  const lines = t.split('\n');
  for (const b of BANNED) {
    for (let i = 0; i < lines.length; i++) {
      if (!b.re.test(lines[i])) continue;
      if (/^\s*(\/\/|\*|<!--)/.test(lines[i])) continue;          // 주석은 봐준다
      console.log(`  🚨 ${f}:${i + 1} — ${b.why}`);
      console.log(`     ${lines[i].trim().slice(0, 100)}`);
      fail++;
    }
  }
}

// 화면이 서버 값을 «실제로 쓰는지» — 서버가 보내도 화면이 안 읽으면 아무 소용이 없다.
//   (2026-08-09 브라우저 실측으로 4케이스 확인: admin→hq_exec · branch_seoul→branch/seoul ·
//    agency_wondang→agency/wondang · jeong(is_teacher)→hq_teacher. 그 배선을 여기서 고정한다)
const CONSUMERS = [
  { f: 'index.html',       need: ['data.ui_role', 'data.display_name'] },
  { f: 'admin/login.html', need: ['data.ui_role', 'data.display_name', 'data.branch_id', 'data.agency_id'] },
];
for (const c of CONSUMERS) {
  // ⚠️ readPageSource 를 쓴다 — index.html 의 로그인 코드는 분해로 /js/idx-user-session.js 로
  //    옮겨갔다. HTML 만 보면 「안 읽는다」는 가짜 경보가 난다(내가 이 검사를 만들자마자 밟았다).
  let t = '';
  try { t = readPageSource(c.f); } catch { continue; }
  for (const n of c.need) {
    if (!t.includes(n)) {
      console.log(`  🚨 ${c.f} 이 ${n} 를 읽지 않습니다 — 서버가 보내도 화면이 안 쓰면 소용없습니다.`);
      fail++;
    }
  }
}

// 정본이 제자리에 있는지도 확인 — 지워지면 화면이 조용히 폴백('hq_mgr')으로 돌아간다
const auth = readFileSync(join(SRC, 'auth-admin.ts'), 'utf8');
if (!/export function resolveUiIdentity\s*\(/.test(auth)) {
  console.log('  🚨 auth-admin.ts 에 resolveUiIdentity() 가 없습니다 — 역할 판정의 정본이 사라졌습니다.');
  fail++;
}
for (const k of ['ui_role', 'branch_id', 'agency_id', 'display_name']) {
  if (!auth.includes(k)) { console.log(`  🚨 로그인 응답에 ${k} 가 없습니다 — 화면이 역할을 못 받습니다.`); fail++; }
}

if (fail) { console.log(`\n  고치는 법: 화면에서 추측하지 말고 로그인 응답의 ui_role 을 쓰세요.`); console.log(`\n${fail} FAIL`); process.exit(1); }
console.log('✅ 역할 판정 정본 1곳 유지 (auth-admin.ts resolveUiIdentity) · 화면에 접두사 추측 없음');
process.exit(0);
