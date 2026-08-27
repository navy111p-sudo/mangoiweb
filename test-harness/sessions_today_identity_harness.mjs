// 🎓 오늘수업 신원 매칭 하니스 — 2026-08-27 (heyst·ubckt01 수업 불성립 실사고)
//
// [무엇이 문제였나]
//   /api/class/sessions/today 의 학생 신원 폴백(비로그인)이 두 겹으로 죽어 있었다.
//   ① 로비 입력칸은 «아이디» 를 묻는데, 폴백은 이름 칸(korean_name·username)만 대조했다.
//      → 아이디를 친 비로그인 학생은 예약이 있어도 항상 「오늘 예약된 수업이 없어요」
//      → 공용방(mangoi-class) 폴백으로 흘러 강사와 영영 못 만났다.
//   ② 이름 구제 SQL 이 없는 컬럼('stu_' || id)을 참조해 no such column 으로 죽고,
//      try/catch 가 삼켜 «이름 구제가 있다» 고 믿는 동안 실체는 cs.student_name 한 줄뿐이었다.
//   실측(2026-08-27 밤): heyst(김사랑)·ubckt01(조연희)이 정확히 이 경로로 수업 불성립.
//
// [왜 문자열 검사만으로는 모자란가]
//   ②가 바로 «문자열로는 초록» 인 종류다 — SQL 은 «있고» 호출도 «되며» 죽는 것은 실행뿐.
//   그래서 소스에서 SQL 을 그대로 오려 내, 운영과 같은 컬럼 구성(id 컬럼 없음!)의
//   진짜 SQLite 에 돌린다(저장소 관례: login_username_case_harness 와 같은 방식).
//
// 실행: node test-harness/sessions_today_identity_harness.mjs
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

let DatabaseSync;
try { ({ DatabaseSync } = await import('node:sqlite')); }
catch {
  console.log('⏭  건너뜀 — 이 node 에는 node:sqlite 가 없습니다(Node 22+ 필요)');
  process.exit(0);
}

const __dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(__dir, '../cloudflare-deploy/src/api-mango.ts'), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
const check = (name, ok, extra) => {
  if (ok) { PASS++; console.log('  ✅ ' + name); }
  else { FAIL++; FAILS.push(name); console.log('  ❌ ' + name + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : '')); }
};

// ── sessions/today 블록만 잘라 낸다 (길이가 아니라 «다음 라우트 주석» 앵커로) ──
const start = src.indexOf("path === '/api/class/sessions/today'");
const end = src.indexOf('/api/class/my-schedule', start);
const block = start >= 0 ? src.slice(start, end > start ? end : start + 20000) : '';
check('sessions/today 블록을 찾았다', block.length > 500);

/* ══ ① 죽어 있던 SQL 이 되살아났는가 — 소스의 SQL 을 오려 내 실제로 돌린다 ═══════ */
console.log('\n① students_erp 조회 SQL — 운영과 같은 컬럼 구성(id 없음)에서 실행');

const db = new DatabaseSync(':memory:');
// 운영 D1 실측 컬럼의 부분집합 — 핵심은 «id 컬럼이 없다» 는 것 (2026-08-27 pragma 실측)
db.exec(`CREATE TABLE students_erp (
  user_id TEXT PRIMARY KEY, korean_name TEXT, english_name TEXT, username TEXT,
  login_id TEXT, student_id TEXT, student_name TEXT, password_hash TEXT)`);
db.exec(`INSERT INTO students_erp (user_id, korean_name, username, login_id) VALUES
  ('heyst',   '김사랑', '김사랑', 'heyst'),
  ('heys',    '이수현', '이수현', 'heys'),
  ('ubckt01', '조연희', '조연희', 'ubckt01'),
  ('Kim',     '김민수', '김민수', NULL),
  ('kim',     '김민수', '김민수', NULL),
  ('dup1',    '김민서', '김민서', NULL),
  ('dup2',    '김민서', '김민서', NULL)`);

// 소스에서 students_erp 를 읽는 SQL 리터럴을 전부 오려 낸다 (백틱 문자열)
const sqls = [...block.matchAll(/`(SELECT[^`]*FROM students_erp[^`]*)`/g)].map(m => m[1]);
check('students_erp 조회 SQL 이 2개 있다 (아이디 구제 + 이름 구제)', sqls.length === 2, sqls.length);

for (const q of sqls) {
  const binds = (q.match(/\?/g) || []).length;
  let ok = true, err = '';
  try { db.prepare(q).all(...Array(binds).fill('heyst')); } catch (e) { ok = false; err = String(e); }
  check('SQL 이 실제 SQLite 에서 에러 없이 돈다: ' + q.slice(0, 60) + '…', ok, err);
}
// ⚠️ 부정 검사는 주석을 벗겨 낸 사본으로 — «왜 죽어 있었나» 설명 주석이 그 문자열을 담는다(CLAUDE.md 2장)
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
check("없는 컬럼 참조('stu_' || id)가 코드(주석 제외)에서 사라졌다", strip(block).indexOf("'stu_' || id") < 0);

/* ══ ② 아이디 구제 — 정확일치 우선 · 대소문자만 다른 후보는 1건일 때만 ═══════════ */
console.log('\n② 아이디 구제 SQL 의 실제 선택 결과');

const idSql = sqls.find(q => /COLLATE NOCASE/.test(q) && /login_id/.test(q));
check('아이디 구제 SQL 이 NOCASE + login_id 를 본다', !!idSql);
const runId = (typed) => {
  const binds = (idSql.match(/\?/g) || []).length;
  const rows = idSql ? db.prepare(idSql).all(...Array(binds).fill(typed)) : [];
  // 소스의 pick 규칙과 같은 판정 (아래 ④가 소스와의 일치를 못 박는다)
  const cand = rows.filter(x => x.user_id);
  const ex = cand.filter(x => Number(x.exact) === 1);
  return (ex.length ? ex : (cand.length === 1 ? cand : [])).map(x => x.user_id);
};
check("'heyst' 를 치면 heyst 계정 1건으로 확정된다 (실사고 재현 → 이제 찾는다)", JSON.stringify(runId('heyst')) === '["heyst"]', runId('heyst'));
check("'Heyst'(자동 대문자) 도 후보가 1건뿐이라 heyst 로 확정된다", JSON.stringify(runId('Heyst')) === '["heyst"]', runId('Heyst'));
check("'ubckt01' 을 치면 ubckt01 로 확정된다", JSON.stringify(runId('ubckt01')) === '["ubckt01"]', runId('ubckt01'));
check("'kim' 은 정확일치(kim)만 고른다 — Kim 을 함께 붙이지 않는다", JSON.stringify(runId('kim')) === '["kim"]', runId('kim'));
check("'KIM' 은 정확일치가 없고 후보가 2건이라 아무도 안 붙인다 (모르면 안 붙임)", runId('KIM').length === 0, runId('KIM'));
check("'김사랑'(이름을 친 경우) 은 아이디 구제에 안 걸린다 (이름 구제 몫)", runId('김사랑').length === 0);

/* ══ ③ 이름 구제 — 유일하게 떨어질 때만 계정을 잇는다 ═══════════════════════════ */
console.log('\n③ 이름 구제 SQL 의 실제 선택 결과');

const nameSql = sqls.find(q => /korean_name/.test(q));
check('이름 구제 SQL 이 korean_name·username 을 본다', !!nameSql && /username/.test(nameSql));
const runName = (typed) => {
  const rows = nameSql ? db.prepare(nameSql).all(typed, typed) : [];
  const uids = [...new Set(rows.map(x => x.uid).filter(Boolean))];
  return uids.length === 1 ? uids : [];
};
check("'김사랑' → heyst 유일 확정", JSON.stringify(runName('김사랑')) === '["heyst"]', runName('김사랑'));
check("'김민서'(동명이인 2계정) → 아무도 안 붙인다", runName('김민서').length === 0, runName('김민서'));

/* ══ ④ 소스가 위 규칙 그대로인가 — 규칙 문자열을 못 박는다 ═══════════════════════ */
console.log('\n④ 소스의 판정 규칙 대조');
// ⚠️ 코드 «모양» 을 통째로 못 박지 않는다(리포맷·변수명 변경에 거짓 FAIL) — 뜻을 담는 낱말만 본다
const code = strip(block);
check('아이디 구제에 «정확일치 우선» 판정이 있다 (exact 를 계산해 가른다)', /AS exact/.test(code) && /exact\b/.test(code.slice(code.indexOf('AS exact'))));
check('대소문자만 다른 후보는 «1건일 때만» 채택한다', /cand\.length === 1/.test(code));
check('이름 구제는 유일할 때만 잇는다 (uids.length === 1)', /uids\.length === 1/.test(code));
check('예약 행 표기 어긋남 구제 — cs.user_id 를 NOCASE(LOWER) 로 잇는다', /LOWER\(cs\.user_id\) = LOWER\(\?\)/.test(code));
check('로그인 uid 1차 조회(condsUid)도 표기 어긋남을 구제한다', /condsUid\.push\('LOWER\(cs\.user_id\) = LOWER\(\?\)'\)/.test(code));
check('기존 이름 직접 일치(cs.student_name)는 그대로 남아 있다 (좁히기 없음)', /condsName\.push\('cs\.student_name = \?'\)/.test(block));

// ═══════════════ 결과 ═══════════════
console.log('\n====================================================');
console.log(`🎯 총 ${PASS + FAIL}건 중 ✅ ${PASS} 통과 / ❌ ${FAIL} 실패`);
if (FAIL) { console.log('실패 항목:'); FAILS.forEach(f => console.log('  - ' + f)); }
else console.log('🎉 오늘수업 신원 매칭(아이디·이름 구제) 전부 통과');
console.log('====================================================');
process.exit(FAIL ? 1 : 0);
