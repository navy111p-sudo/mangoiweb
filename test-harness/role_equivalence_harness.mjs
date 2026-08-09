// role_equivalence_harness.mjs — 역할 판정 통합이 «동작을 바꾸지 않았는지» 대조 (2026-08-09)
//
// 화면 두 곳의 접두사 추측을 지우고 서버 resolveUiIdentity() 하나로 모았다.
// 리팩토링이 맞으려면 **같은 입력에 같은 답**이 나와야 한다.
// 그래서 지우기 전의 옛 로직(admin/login.html 판 — 학생/학부모 분기까지 있던 완전한 쪽)을
// 여기에 그대로 박아 두고, 새 서버 함수와 결과를 비교한다.
//
// ⚠️ 이 파일의 oldLogic 은 «과거의 사진» 이다. 규칙이 의도적으로 바뀌면 여기도 같이 고친다.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dir, '../cloudflare-deploy/src');

// ── 옛 로직 (admin/login.html:190~233 에 있던 것을 그대로 옮김) ──
function oldLogic(uid, dataName, isTeacher) {
  let role = 'hq_mgr', branch_id = null, agency_id = null, name = uid;
  if (uid === 'capitown' || uid.indexOf('capi') === 0) { role = 'capitown'; name = dataName || '캐피타운 본사'; }
  else if (uid === 'admin' || uid === 'hq_exec' || uid === 'exec') { role = 'hq_exec'; name = '본사 경영진'; }
  else if (uid.indexOf('hq_t') === 0) { role = 'hq_teacher'; name = '본사 교사'; }
  else if (uid.indexOf('hq_') === 0) { role = 'hq_mgr'; name = '본사 관리자'; }
  else if (uid.indexOf('branch_') === 0) { role = 'branch'; branch_id = uid.replace(/^branch_/, ''); name = '지사 (' + branch_id + ')'; }
  else if (uid.indexOf('agency_') === 0) { role = 'agency'; agency_id = uid.replace(/^agency_/, ''); name = '대리점 (' + agency_id + ')'; }
  else if (uid === 'parent' || uid.indexOf('parent_') === 0) { role = 'parent'; name = '학부모'; }
  else if (uid === 'student' || uid.indexOf('student_') === 0) { role = 'student'; name = '학생'; }
  if (isTeacher) { role = 'hq_teacher'; if (dataName) name = dataName; }
  if (dataName && dataName !== uid) name = dataName;
  return { ui_role: role, branch_id, agency_id, display_name: name };
}

// ── 새 로직 (auth-admin.ts 의 resolveUiIdentity 본문을 소스에서 떼어내 실행) ──
const ts = readFileSync(join(SRC, 'auth-admin.ts'), 'utf8');
const m = ts.match(/export function resolveUiIdentity\([\s\S]*?\n\}/);
if (!m) { console.log('1 FAIL — auth-admin.ts 에서 resolveUiIdentity 를 못 찾음'); process.exit(1); }
// TypeScript 타입 표기만 벗겨 낸다(로직은 순수 JS).
// ⚠️ 순서 중요 — 유니언(`: string | null`)을 **먼저** 지워야 한다.
//    `: string` 을 먼저 지우면 `| null` 이 남아 `let branch_id | null = null;` 이 된다(실제로 밟았다).
const jsBody = m[0]
  .replace(/export function/, 'function')
  .replace(/\)\s*:\s*\{[^}]*\}\s*\{/, ') {')                 // 반환 타입
  .replace(/\s*:\s*[A-Za-z]+\s*\|\s*null/g, '')              // 유니언 (먼저!)
  .replace(/\s*:\s*(string|boolean|number)\b/g, '');         // 단순 타입
let newLogic;
try { newLogic = new Function(`${jsBody}; return resolveUiIdentity;`)(); }
catch (e) { console.log(`1 FAIL — resolveUiIdentity 를 실행 가능한 JS 로 못 바꿈: ${e.message}`); process.exit(1); }

// ── 대조 ──
const NAMES = ['', '정우영(교사)', '캐피 강남 지사', 'mgr_kim'];
const UIDS = [
  'capitown', 'capi_gangnam', 'admin', 'hq_exec', 'exec',
  'hq_t_001', 'hq_t_kang', 'hq_mgr_a', 'hq_sales',
  'branch_seoul', 'branch_01', 'agency_wondang', 'agency_7',
  'parent', 'parent_123', 'student', 'student_9',
  'jeong', 'mangoi_042', 'mgr_kim', 'unknown_person',
];

let checked = 0, bad = 0;
for (const uid of UIDS) for (const nm of NAMES) for (const isT of [false, true]) {
  const a = oldLogic(uid, nm, isT);
  const b = newLogic(uid, nm, isT);
  checked++;
  const diff = ['ui_role', 'branch_id', 'agency_id', 'display_name'].filter(k => (a[k] ?? null) !== (b[k] ?? null));
  if (diff.length) {
    bad++;
    if (bad <= 10) {
      console.log(`  🚨 불일치  uid='${uid}' name='${nm}' is_teacher=${isT}`);
      for (const k of diff) console.log(`       ${k}: 옛='${a[k]}'  새='${b[k]}'`);
    }
  }
}

console.log(`\n대조 ${checked}건 (아이디 ${UIDS.length} × 이름 ${NAMES.length} × is_teacher 2)`);
if (bad) { console.log(`\n${bad} FAIL — 통합이 동작을 바꿨습니다`); process.exit(1); }
console.log('✅ 옛 로직과 새 서버 함수가 모든 조합에서 같은 답을 냅니다');
process.exit(0);
