#!/usr/bin/env node
/**
 * 🙈 student_hide_button_harness — 학생 «명부에서 숨기기 / 되살리기» 버튼 (2026-09-24)
 * ═══════════════════════════════════════════════════════════════════════════
 * [왜]
 *   사장님 「잘못된 아이디(yahee1·yahee2)를 지우려는데 … ①번 숨김 버튼 만들어줘」.
 *   숨김 칸(student_erp_override.hidden)과 명부 거르기(hiddenExcludeCond)는 2026-08-20 부터
 *   있었지만 **화면에 버튼이 없어** D1 을 손으로 고쳐야만 숨길 수 있었다.
 *
 * [지키는 것]
 *   ① 숨기기는 «지우기» 가 아니다 — students_erp 는 한 글자도 안 바뀐다(카페24 학생을 DELETE 하면
 *      오늘 밤 되살아나고 붙은 기록만 주인을 잃는다 — CLAUDE.md 2장).
 *   ② 되살리기가 같은 행의 이름 고정·전화번호·memo 를 지우지 않는다(hidden 만 0).
 *   ③ 「숨긴 학생 보기」는 숨긴 학생«만» — 표를 못 쓰면 «전체» 가 아니라 «빈 목록».
 *   ④ 본사 전용 — 게이트(enrollAdminHqOnly)가 쓰기 «앞» 에 있다.
 *   ⑤ 상태를 «모르면» 버튼을 안 그린다(되살릴 길이 사라지는 쪽으로 틀리지 않게).
 *
 * [방법]
 *   ①②③⑤ 는 정본을 **실제로 돌린다** — student-override.ts 를 node 타입 제거로 불러
 *   진짜 SQLite(node:sqlite)를 D1 모양으로 감싸 물린다. 화면 함수는 오려 내 가짜 DOM 으로 돌린다.
 *   ④ 는 라우트 블록을 중괄호 짝으로 잘라 «위치» 로 본다.
 */
import { readFileSync, writeFileSync, mkdtempSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const CF = join(HERE, '..', 'cloudflare-deploy');
const SRC = join(CF, 'src');
const PUB = join(CF, 'public');
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
/** 주석을 벗긴 사본 — 줄 단위로 블록주석 안인가를 추적(정규식 한 줄로 지우면 코드까지 먹는다). */
function strip(t) {
  let out = '', inBlock = false;
  for (const line of String(t).split('\n')) {
    let l = line, res = '';
    while (l.length) {
      if (inBlock) { const e = l.indexOf('*/'); if (e < 0) { l = ''; break; } l = l.slice(e + 2); inBlock = false; continue; }
      const b = l.indexOf('/*'), c = l.search(/(^|[^:'"])\/\//);
      if (b >= 0 && (c < 0 || b < c)) { res += l.slice(0, b); l = l.slice(b + 2); inBlock = true; continue; }
      if (c >= 0) { res += l.slice(0, c + (l[c] === '/' ? 0 : 1)); l = ''; break; }
      res += l; l = '';
    }
    out += res + '\n';
  }
  return out;
}
/** 앵커 뒤 첫 `{` 부터 중괄호 짝까지. */
function blockAfter(src, anchorIdx) {
  const s = src.indexOf('{', anchorIdx); if (s < 0) return '';
  let d = 0;
  for (let i = s; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (d === 0) return src.slice(s, i + 1); } }
  return '';
}

console.log('\n🙈 student_hide_button_harness\n');

/* ───────── ① ② ③ ⑤(서버) — 정본을 진짜 SQLite 로 실제로 돌림 ───────── */
console.log('[A] 정본 실행 (student-override.ts × node:sqlite)');
const TMP = mkdtempSync(join(tmpdir(), 'hide-'));
writeFileSync(join(TMP, 'student-override.ts'),
  read(join(SRC, 'student-override.ts')).replace(/from '\.\/d1-chunk'/, "from './d1-chunk.ts'"));
copyFileSync(join(SRC, 'd1-chunk.ts'), join(TMP, 'd1-chunk.ts'));
const CHILD = `
import { DatabaseSync } from 'node:sqlite';
const M = await import(${JSON.stringify(join(TMP, 'student-override.ts'))});
const out = {};
function d1(db, broken){
  const wrap = (sql, args) => ({
    first: async () => { if (broken) throw new Error('boom'); return db.prepare(sql).get(...args) ?? null; },
    all:   async () => { if (broken) throw new Error('boom'); return { results: db.prepare(sql).all(...args) }; },
    run:   async () => { if (broken) throw new Error('boom'); const r = db.prepare(sql).run(...args); return { meta: { changes: r.changes } }; },
  });
  return { exec: async (s) => { if (broken) throw new Error('boom'); db.exec(s); }, prepare: (sql) => ({ ...wrap(sql, []), bind: (...a) => wrap(sql, a) }) };
}
const db = new DatabaseSync(':memory:');
db.exec("CREATE TABLE students_erp (user_id TEXT PRIMARY KEY, korean_name TEXT, parent_phone TEXT)");
db.exec("INSERT INTO students_erp VALUES ('yahee1','정예희','01011112222'),('yahee2','정예희','01011112222'),('ok1','김학생',NULL)");
const env = { DB: d1(db) };
const snap = () => JSON.stringify(db.prepare('SELECT * FROM students_erp ORDER BY user_id').all());
const before = snap();
await M.ensureStudentOverrideTable(env);
// 같은 행에 먼저 들어 있던 값(이름 고정·번호·memo) — 되살리기가 지우면 안 된다
db.prepare("INSERT INTO student_erp_override (user_id, korean_name, memo, parent_phone, created_at) VALUES ('yahee2','정예희(고정)','손으로 적은 메모','01099998888',1)").run();
out.noRow = await M.getStudentHiddenInfo(env, 'ok1');
out.set1 = await M.setStudentHidden(env, 'yahee1', true, 'admin', '잘못 만든 아이디');
out.set2 = await M.setStudentHidden(env, 'yahee2', true, 'admin', '');
out.info1 = await M.getStudentHiddenInfo(env, 'yahee1');
out.isHidden1 = await M.isStudentHidden(env, 'yahee1');
const ex = await M.hiddenExcludeCond(env, 's');
const only = await M.hiddenOnlyCond(env, 's');
const list = (c) => db.prepare('SELECT s.user_id FROM students_erp s WHERE ' + c + ' ORDER BY s.user_id').all().map(r => r.user_id);
out.listNormal = list(ex); out.listHidden = list(only);
out.erpAfterHide = snap() === before;
out.restore = await M.setStudentHidden(env, 'yahee2', false, 'admin', null);
out.row2 = db.prepare("SELECT * FROM student_erp_override WHERE user_id='yahee2'").get();
out.info2 = await M.getStudentHiddenInfo(env, 'yahee2');
out.listNormal2 = list(ex); out.listHidden2 = list(only);
out.erpAfterAll = snap() === before;
out.empty = await M.setStudentHidden(env, '  ', true, 'admin');
// 모르면 null — 표·조회가 깨진 DB
const bad = { DB: d1(new DatabaseSync(':memory:'), true) };
// 표 보장 여부는 모듈 안 변수(_ensured)에 캐시된다 — «처음부터 깨진» 환경은 새 모듈 인스턴스로 잰다.
const M2 = await import(${JSON.stringify(join(TMP, 'student-override.ts') + '?fresh')});
out.brokenInfo = await M.getStudentHiddenInfo(bad, 'yahee1');
out.brokenOnly = await M2.hiddenOnlyCond(bad, 's');
out.brokenSet = await M.setStudentHidden(bad, 'yahee1', true, 'admin');
console.log('@@' + JSON.stringify(out));
`;
const childFile = join(TMP, 'child.mjs');
writeFileSync(childFile, CHILD);
const pr = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', childFile], { encoding: 'utf8' });
const line = (pr.stdout || '').split('\n').find(l => l.startsWith('@@'));
let R = null;
try { R = line ? JSON.parse(line.slice(2)) : null; } catch { R = null; }
check('A-0 전제: 정본을 실제로 돌렸다', !!R, (pr.stderr || '').split('\n').slice(0, 4).join(' | '));
if (R) {
  check('A-1 행이 없는 학생은 «안 숨김»(모름 아님)', R.noRow && R.noRow.hidden === false);
  check('A-2 숨기기 성공', R.set1 && R.set1.ok === true && R.set2 && R.set2.ok === true);
  check('A-3 누가·왜가 남는다', R.info1 && R.info1.hidden === true && R.info1.by === 'admin' && R.info1.reason === '잘못 만든 아이디' && R.info1.at > 0);
  check('A-4 숨기면 로그인 차단 판정도 참', R.isHidden1 === true);
  check('A-5 평소 명부에서 빠진다', JSON.stringify(R.listNormal) === '["ok1"]', JSON.stringify(R.listNormal));
  check('A-6 「숨긴 학생 보기」는 숨긴 학생«만»', JSON.stringify(R.listHidden) === '["yahee1","yahee2"]', JSON.stringify(R.listHidden));
  check('A-7 ⛔ 숨겨도 students_erp 는 그대로(지우지 않음)', R.erpAfterHide === true);
  check('A-8 되살리기 성공 + 상태 반영', R.restore && R.restore.ok === true && R.info2 && R.info2.hidden === false);
  check('A-9 되살려도 같은 행의 이름 고정·번호·memo 는 그대로',
    R.row2 && R.row2.korean_name === '정예희(고정)' && R.row2.parent_phone === '01099998888' && R.row2.memo === '손으로 적은 메모',
    JSON.stringify(R.row2));
  check('A-10 되살리면 명부에 돌아오고 «숨긴 목록» 에서 빠진다',
    JSON.stringify(R.listNormal2) === '["ok1","yahee2"]' && JSON.stringify(R.listHidden2) === '["yahee1"]');
  check('A-11 ⛔ 끝까지 students_erp 무변경', R.erpAfterAll === true);
  check('A-12 빈 아이디는 거절', R.empty && R.empty.ok === false);
  check('A-13 조회가 깨지면 «모름»(null) — «안 숨김» 으로 지어내지 않음', R.brokenInfo === null);
  check('A-14 표를 못 쓰면 «숨긴 학생만» 조건은 빈 문자열(부르는 쪽이 1=0 으로 막음)', R.brokenOnly === '');
  check('A-15 저장 실패는 ok:false 로 말한다', R.brokenSet && R.brokenSet.ok === false);
}

/* ───────── ④ 서버 배선 ───────── */
console.log('\n[B] 서버 배선');
const MANGO = read(join(SRC, 'api-mango.ts'));
const iRoute = MANGO.indexOf('\\/hide$/');
const route = iRoute >= 0 ? blockAfter(MANGO, MANGO.indexOf("if (m && method === 'POST')", iRoute)) : '';
const routeS = strip(route);
check('B-0 전제: /hide 라우트 블록을 오려 냈다', route.length > 200);
const iGate = routeS.indexOf('enrollAdminHqOnly(request'), iSet = routeS.indexOf('setStudentHidden(');
check('B-1 본사 게이트가 쓰기보다 «앞»', iGate >= 0 && iSet > iGate);
check('B-2 게이트 결과로 실제로 막는다(if (deny) return deny)', /const\s+deny\s*=\s*await\s+enrollAdminHqOnly[\s\S]*?if\s*\(\s*deny\s*\)\s*return\s+deny/.test(routeS));
check('B-3 진짜 user_id 를 ERP_BY_UID 정본으로 찾는다', /ERP_BY_UID/.test(routeS) && /erpUidBinds\(uid\)/.test(routeS));
check('B-4 없는 학생은 404(아무 행도 안 만든다)', /student_not_found[\s\S]{0,40}404/.test(routeS) && routeS.indexOf('student_not_found') < iSet);
check('B-5 ⛔ 이 라우트에 DELETE/UPDATE students_erp 가 없다', !/DELETE\s+FROM\s+students_erp|UPDATE\s+students_erp/i.test(routeS));
check('B-6 hidden 은 불리언만 받는다', /typeof\s+b\.hidden\s*!==\s*'boolean'/.test(routeS));
const fullS = strip(MANGO);
check('B-7 /full 이 hidden_info·can_hide 를 싣는다', /hidden_info:\s*_erpRow\s*\?\s*await\s+getStudentHiddenInfo/.test(fullS) && /can_hide:/.test(fullS));
check('B-8 can_hide 는 강사·조직 계정에 거짓', /!a\.isTeacher\s*&&\s*!isOrgScopedRole\(a\.role\)/.test(fullS));
const ENR = read(join(SRC, 'enroll-ops.ts'));
check('B-9 enrollAdminHqOnly 를 내보낸다', /export\s+async\s+function\s+enrollAdminHqOnly/.test(ENR));

const ADMIN = strip(read(join(SRC, 'api-admin.ts')));
const iU = ADMIN.indexOf("path === '/api/admin/students/unified'");
const uni = iU >= 0 ? blockAfter(ADMIN, iU) : '';
check('B-10 전제: unified 블록', uni.length > 500);
check('B-11 ?hidden=only 면 hiddenOnlyCond, 못 쓰면 1 = 0', /hidden'\)\s*===\s*'only'/.test(uni) && /hiddenOnlyCond\(env as any, 's'\)/.test(uni) && /_onlyCond\s*\|\|\s*'1 = 0'/.test(uni));
check('B-12 평소에는 여전히 숨긴 학생을 뺀다(짝)', /hiddenExcludeCond\(env as any, 's'\)/.test(uni));

/* ───────── ⑤ 화면 — renderHideBox 를 오려 내 실제로 돌림 ───────── */
console.log('\n[C] 학생 상세 화면');
const STU = read(join(PUB, 'admin', 'student.html'));
check('C-0 전제: 상자 자리가 있다', /<div id="hideBox"><\/div>/.test(STU));
const iR = STU.indexOf('function renderHideBox(){');
const rfn = iR >= 0 ? 'function renderHideBox()' + blockAfter(STU, iR) : '';
function runBox(full, lang) {
  const box = { innerHTML: 'x' };
  try {
    const f = new Function('$', '_state', '_lang', rfn + '; renderHideBox(); return true;');
    f((id) => (id === 'hideBox' ? box : null), { full }, lang || 'ko');
  } catch (e) { return 'ERR ' + e.message; }
  return box.innerHTML;
}
const erp = { user_id: 'yahee1' };
const hHide = runBox({ erp, can_hide: true, hidden_info: { hidden: false } });
const hRest = runBox({ erp, can_hide: true, hidden_info: { hidden: true, by: 'admin', at: 1, reason: '<b>x</b>' } });
const hNo = runBox({ erp, can_hide: false, hidden_info: { hidden: false } });
const hNull = runBox({ erp, can_hide: true, hidden_info: null });
const hNoRest = runBox({ erp, can_hide: false, hidden_info: { hidden: true, by: 'admin', at: 1 } });
check('C-1 안 숨긴 학생 + 본사 → 「숨기기」 버튼', /toggleStudentHidden\(true\)/.test(hHide) && !/toggleStudentHidden\(false\)/.test(hHide));
check('C-2 숨긴 학생 + 본사 → 「되살리기」 버튼과 안내', /toggleStudentHidden\(false\)/.test(hRest) && /숨긴 학생/.test(hRest));
check('C-3 사유는 이스케이프된다', /&lt;b&gt;x&lt;\/b&gt;/.test(hRest) && !/<b>x<\/b>/.test(hRest));
check('C-4 본사가 아니면 버튼 없음(짝)', !/toggleStudentHidden/.test(hNo) && !/toggleStudentHidden/.test(hNoRest));
check('C-5 본사 아니어도 «숨긴 학생» 이라는 사실은 말한다', /숨긴 학생/.test(hNoRest));
check('C-6 상태를 모르면 버튼을 안 그리고 그렇게 말한다', !/toggleStudentHidden/.test(hNull) && /읽지 못했습니다/.test(hNull));
check('C-7 영어도 그린다', /Restore to list/.test(runBox({ erp, can_hide: true, hidden_info: { hidden: true } }, 'en')));
const iT = STU.indexOf('async function toggleStudentHidden(hide){');
const tfn = iT >= 0 ? blockAfter(STU, iT) : '';
check('C-8 /hide 로 POST', /'\/hide'/.test(tfn) && /method:\s*'POST'/.test(tfn));
check('C-9 성공은 «ok:true 라고 말했는가» 로 판정', /j\.ok\s*!==\s*true/.test(tfn));
check('C-10 숨기기 확인창이 «지우지 않음·로그인 불가·되살리기 가능» 을 말한다', /지우는 것이 아닙니다/.test(tfn) && /로그인이 안 됩니다/.test(tfn) && /되살릴 수 있습니다/.test(tfn));
check('C-11 renderCard 가 renderHideBox 를 부른다', /\$\('cardStatus'\)\.className[^\n]*\n\s*renderHideBox\(\);/.test(STU));

console.log('\n[D] 학생 명부');
const CORE = read(join(PUB, 'js', 'adm-core.js'));
const AH = read(join(PUB, 'admin.html'));
check('D-1 「숨긴 학생 보기」 버튼', /id="sm-show-hidden"[\s\S]{0,200}smToggleHidden/.test(AH));
check('D-2 켜면 ?hidden=only 를 붙여 부른다', /window\._smShowHidden\s*\?\s*\(_su\s*\+[^;]*'hidden=only'\)\s*:\s*_su/.test(CORE) && /fetch\(_suH,/.test(CORE));
check('D-3 라벨을 바꿀 때 data-ko/data-en 도 함께', /smToggleHidden[\s\S]{0,700}setAttribute\('data-ko'[\s\S]{0,80}setAttribute\('data-en'/.test(CORE));
check('D-4 빈 목록은 «숨긴 학생이 없습니다» 로 말한다', /숨긴 학생이 없습니다/.test(CORE));

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
