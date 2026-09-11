// 🔄 1회성 대체강사 배정 하니스 — 2026-08-30
//
// [무엇을 지키나]
//   ① 「그 날짜에 이 수업이 열리나」 판정(subScheduleDow)이 «오늘 수업» 표와 같은 답을 낸다.
//      class_schedules.day_of_week 는 단일 숫자가 아니다 — 'Thu' 같은 영어 표기와 '1,3,5' 같은
//      나열이 실제로 들어 있어서 api-admin.ts 가 admDowMatches() 를 따로 두고 있다. 두 판정이
//      갈리면 표에는 🔄 버튼이 뜨는데 누르면 «그 날짜에 열리지 않습니다» 로 거절한다 —
//      「같은 배정을 두 API 가 서로 다르게 확인」(CLAUDE.md 2장)의 재발이다.
//   ② 새 관리자 «쓰기» API 가 강사를 막는다 — checkAdminSession 만으로는 강사도 통과한다.
//   ③ class_substitutions CREATE 문이 두 곳(enroll-ops·api-admin)에서 «같은 표» 를 만든다.
//      한쪽 모양만 바꾸면 새 DB 에서 «먼저 도는 쪽이 이기는» 사고가 난다(vc_quality 선례).
//   ④ 오버레이를 읽는 곳은 전부 status='active' 를 함께 본다(취소한 대체가 되살아나면 안 된다).
//   ⑤ (schedule_id, sub_date) 는 하루 한 명 — 진짜 SQLite 로 두 번 넣어 본다.
//   ⑥ LMS·시연 시드 자리표시 행에는 대체를 배정하지 않는다.
//
// [왜 문자열 검사만으로는 모자란가]
//   ①·⑤ 는 «무슨 답이 나오는가» 라서 눈으로는 안 보인다. 그래서 소스에서 함수와 SQL 을
//   오려 내 **실제로 돌린다**(운영 DB 무접촉 — 메모리 SQLite).
//
// 실행: node test-harness/substitute_assign_harness.mjs
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dir = dirname(fileURLToPath(import.meta.url));
const CF = resolve(__dir, '..', 'cloudflare-deploy');
const rd = (p) => { try { return readFileSync(resolve(__dir, p), 'utf8'); } catch { return ''; } };

const enroll = rd('../cloudflare-deploy/src/enroll-ops.ts');
const auth = rd('../cloudflare-deploy/src/auth-admin.ts');
const todayJs = rd('../cloudflare-deploy/public/js/adm-today-classes.js');
const admin = rd('../cloudflare-deploy/src/api-admin.ts');
const teacher = rd('../cloudflare-deploy/src/api-teacher.ts');
const mango = rd('../cloudflare-deploy/src/api-mango.ts');

let PASS = 0, FAIL = 0; const FAILS = [];
const check = (name, ok, extra) => {
  if (ok) { PASS++; console.log('  ✅ ' + name); }
  else { FAIL++; FAILS.push(name); console.log('  ❌ ' + name + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : '')); }
};

/** 부정 검사(«이 글자가 없어야 한다»)는 반드시 주석을 벗겨 낸 사본으로 — 안 그러면
 *  「왜 그렇게 안 했는지」 적어 둔 설명이 자기 검사에 걸린다(CLAUDE.md 2장).
 *  ⚠️ 블록주석을 정규식 한 줄로 지우지 말 것 — 문자열 안의 «/*» 하나에 그 뒤가 통째로
 *     사라진다(같은 장). 줄 단위로 «지금 블록주석 안인가» 를 추적한다. */
function stripComments(src) {
  const out = [];
  let inBlock = false;
  for (let line of String(src).split('\n')) {
    let res = '';
    for (let i = 0; i < line.length; i++) {
      if (inBlock) {
        if (line[i] === '*' && line[i + 1] === '/') { inBlock = false; i++; }
        continue;
      }
      if (line[i] === '/' && line[i + 1] === '*') { inBlock = true; i++; continue; }
      if (line[i] === '/' && line[i + 1] === '/') break;
      res += line[i];
    }
    out.push(res);
  }
  return out.join('\n');
}

/** 중괄호 짝으로 블록을 자른다 — 길이(slice(i, i+N))로 자르면 옆 함수가 딸려 들어와
 *  「대상 지정이 방 전체로 샌다」 같은 거짓 FAIL 이 난다(CLAUDE.md 2장). */
function blockAt(src, anchor) {
  const i = src.indexOf(anchor);
  if (i < 0) return '';
  const s = src.indexOf('{', i);
  if (s < 0) return '';
  let d = 0;
  for (let k = s; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  return src.slice(i);
}

/* ══ ① 「그 날짜에 열리나」 — 두 판정을 오려 내 실제로 돌리고 서로 대조 ═══════════ */
console.log('\n① 날짜·요일 판정 — subScheduleDow 대 admDowMatches (실제 실행)');
let esbuildApi = null;
try { esbuildApi = createRequire(join(CF, 'package.json'))('esbuild'); } catch { /* 미설치 */ }

const subFn = blockAt(enroll, 'function subScheduleDow');
const admFn = blockAt(admin, 'function admDowMatches');
const admMap = (admin.match(/const ADM_DOW_MAP[\s\S]*?\n\};/) || [])[0] || '';
check('subScheduleDow 를 소스에서 찾았다', subFn.length > 100);
check('admDowMatches 를 소스에서 찾았다', admFn.length > 50);

if (!esbuildApi) {
  console.log('  ⏭ esbuild 없음 — 실행 검증 건너뜀 (정적 검사만 유효)');
} else if (subFn && admFn) {
  const dowMap = (enroll.match(/const ENROLL_DOW_MAP[\s\S]*?\n\};/) || [])[0] || '';
  const dowFn = blockAt(enroll, 'export function enrollDowList');
  const js = esbuildApi.transformSync(
    admMap + '\n' + dowMap + '\n' + dowFn.replace('export ', '') + '\n' + subFn + '\n' + admFn +
    '\nexport { subScheduleDow, admDowMatches, enrollDowList };',
    { loader: 'ts', format: 'esm' }
  ).code;
  const mod = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
  const { subScheduleDow, admDowMatches, enrollDowList } = mod;

  // 2026-09-03 은 목요일(UTC 기준 4)
  const THU = '2026-09-03', SUN = '2026-09-06';
  const cases = [
    ['숫자 단일 — 맞는 요일', null, 4, THU, 4],
    ['숫자 단일 — 다른 요일', null, 2, THU, null],
    ['영어 표기 Thu', null, 'Thu', THU, 4],
    ['영어 표기 thursday', null, 'thursday', THU, 4],
    ['나열 1,3,5 — 목(4) 아님', null, '1,3,5', THU, null],
    ['나열 2,4,6 — 목(4) 포함', null, '2,4,6', THU, 4],
    ['나열 Mon,Thu — 포함', null, 'Mon,Thu', THU, 4],
    ['나열 Mon,Thu — 일요일엔 아님', null, 'Mon,Thu', SUN, null],
    ['날짜지정 행 — 그 날짜', THU, null, THU, 4],
    ['날짜지정 행 — 다른 날짜', SUN, null, THU, null],
    ['한글 표기 목', null, '목', THU, 4],
    ['한글 표기 목요일', null, '목요일', THU, 4],
    ['한글 나열 월,목', null, '월,목', THU, 4],
    ['한글 나열 월,수 — 목 아님', null, '월,수', THU, null],
    ['빈 값', null, '', THU, null],
  ];
  for (const [label, sd, dw, date, want] of cases) {
    check('subScheduleDow: ' + label, subScheduleDow(sd, dw, date) === want, { got: subScheduleDow(sd, dw, date), want });
  }
  // 요일 «목록» 자체 — 나열은 여러 날을 다 돌려줘야 한다(한 날만 돌려주면 충돌검사가 나머지를 놓친다)
  const listCases = [
    ['4', [4]], [4, [4]], ['Thu', [4]], ['목', [4]], ['목요일', [4]],
    ['1,3,5', [1, 3, 5]], ['Mon,Thu', [1, 4]], ['월,수,금', [1, 3, 5]],
    ['Tue/Thu', [2, 4]], ['', []], [null, []], ['9', []], ['월수금', []],
  ];
  for (const [raw, want] of listCases) {
    const got = enrollDowList(raw);
    check('enrollDowList(' + JSON.stringify(raw) + ')', JSON.stringify(got) === JSON.stringify(want), { got, want });
  }

  // 반복 행에서는 «오늘 수업» 표(admDowMatches)와 답이 같아야 한다
  for (const dw of [4, '4', 'Thu', 'thu', 'Thursday', '목', '목요일', '월,목', '1,3,5', '2,4,6', 'Mon,Thu', 'Mon Thu', 'Tue/Thu', '0', 'sun']) {
    const target = new Date(THU + 'T00:00:00Z').getUTCDay();
    const a = admDowMatches(dw, target);
    const b = subScheduleDow(null, dw, THU) !== null;
    check('두 판정이 같은 답 — day_of_week=' + JSON.stringify(dw), a === b, { admDowMatches: a, subScheduleDow: b });
  }
}

/* ══ ② 새 «쓰기»·«읽기» API 가 강사를 막는가 ═══════════════════════════════════ */
console.log('\n② 대체강사 API — 강사 차단(getAdminActor().isTeacher)');
for (const [label, anchor] of [
  ['후보 조회(GET)', "path === '/api/pay/enroll/admin/substitute-candidates'"],
  ['배정·취소(POST)', "path === '/api/pay/enroll/admin/substitute'"],
]) {
  const blk = blockAt(enroll, anchor);
  check(label + ' 라우트를 찾았다', blk.length > 200);
  const guardAt = blk.indexOf('isTeacher');
  /* 🪪 (2026-09-11) 거절 본문이 정본 헬퍼(forbiddenTeacherBody)로 바뀌었다 — 보장은 그대로다.
     ⛔ 옛 리터럴만 못 박으면 정당한 수리가 빨간불이 된다(CLAUDE.md 2장). */
  check(label + ' — isTeacher 403 가드가 있다', guardAt > 0 && /forbidden_teacher|forbiddenTeacherBody/.test(blk));
  // 가드가 DB 를 만지기 «전» 에 와야 한다 — 뒤에 있으면 강사가 조회·기록을 이미 마친 뒤다
  const firstDb = Math.min(...['env.DB.prepare', 'env.DB.exec', 'ensureEnrollTables']
    .map((k) => { const i = blk.indexOf(k); return i < 0 ? Number.MAX_SAFE_INTEGER : i; }));
  check(label + ' — 가드가 DB 접근보다 앞에 온다', guardAt > 0 && guardAt < firstDb, { guardAt, firstDb });
}
check('강사 차단이 checkAdminSession «만» 에 기대지 않는다',
  /getAdminActor/.test(blockAt(enroll, "path === '/api/pay/enroll/admin/substitute'")));

/* ══ ②-2 지사·대리점·지사본사는 «자기 소속 수업만» (2026-08-30 사장님 지시 2차) ═════
   처음엔 통째로 막았다가(차단), 사장님 지시로 «스코프로 자르기» 로 바꿨다.
   🔴 여기가 「오늘 수업」 표(`/api/admin/classes/today`)의 판정과 어긋나면 두 가지 사고가 난다 —
      더 좁으면 «화면엔 있는데 눌러도 안 되는 버튼», 더 넓으면 «남의 학원 수업을 바꿈».
      그래서 **같은 함수(scopeStudentCond)** 를 쓰는지 대조하고, 실제 SQLite 로 돌려 본다. */
console.log('\n②-2 조직 계정(지사·대리점·지사본사) — 자기 소속 수업만');
{
  const roleFn = blockAt(auth, 'export function isOrgScopedRole');
  check('isOrgScopedRole 판정이 auth-admin 에 있다', roleFn.length > 40);
  check("판정이 branch·agency·franchise 셋을 모두 본다",
    /'branch'/.test(roleFn) && /'agency'/.test(roleFn) && /'franchise'/.test(roleFn), roleFn.slice(0, 120));
  if (esbuildApi && roleFn) {
    const js2 = esbuildApi.transformSync(roleFn.replace('export ', '') + '\nexport { isOrgScopedRole };',
      { loader: 'ts', format: 'esm' }).code;
    const m2 = await import('data:text/javascript;base64,' + Buffer.from(js2).toString('base64'));
    for (const [role, want] of [['branch', true], ['agency', true], ['franchise', true],
      ['hq', false], ['none', false], ['staff', false], ['teacher', false], ['', false], [null, false]]) {
      check('isOrgScopedRole(' + JSON.stringify(role) + ')', m2.isOrgScopedRole(role) === want);
    }
  }

  const scopeFn = blockAt(enroll, 'async function subScopeDenied');
  check('스코프 판정 헬퍼(subScopeDenied)가 있다', scopeFn.length > 200);
  check('판정을 scope.ts 의 scopeStudentCond 로 한다(「오늘 수업」 표와 같은 함수)',
    /scopeStudentCond/.test(scopeFn) && /scopeStudentCond/.test(admin));
  check('본사·내부직원은 그대로 통과한다(조직 계정일 때만 자른다)',
    /if \(!isOrgScopedRole\(actorRole\)\) return null/.test(scopeFn));
  check('⛔ 조건이 비면 막는 쪽으로 실패한다(스코프 미상 = 전국이 열리면 안 된다)',
    /if \(!c\.cond\) return deny\(\)/.test(scopeFn));
  check('학생이 안 붙은 행도 막는다', /if \(!uid\) return deny\(\)/.test(scopeFn));
  check('판정 자체가 실패해도(catch) 막는 쪽으로', /catch[\s\S]{0,160}return deny\(\)/.test(scopeFn));
  check('⛔ 강사 차단을 이 안으로 옮기지 않았다(강사는 스코프가 none 이라 통과해 버린다)',
    !/isTeacher/.test(scopeFn));

  for (const [label, anchor, writeKeys] of [
    ['후보 조회(GET)', "path === '/api/pay/enroll/admin/substitute-candidates'", []],
    ['배정·취소(POST)', "path === '/api/pay/enroll/admin/substitute'", ['INSERT INTO class_substitutions', 'UPDATE class_substitutions', 'UPDATE class_schedules']],
  ]) {
    const blk = blockAt(enroll, anchor);
    const teacherAt = blk.indexOf('isTeacher');
    const scopeAt = blk.indexOf('subScopeDenied');
    check(label + ' — 강사 403 가드가 있다', teacherAt > 0 && /forbidden_teacher|forbiddenTeacherBody/.test(blk));
    check(label + ' — 조직 계정 스코프 검사를 부른다', scopeAt > 0);
    check(label + ' — 스코프 검사에 그 수업의 학생(user_id)을 넘긴다', /subScopeDenied\(env, request, actor\.role, row\.user_id\)/.test(blk));
    // 쓰기보다 «앞» 에 와야 한다 — 뒤에 있으면 이미 바꾼 뒤에 거절하는 꼴이다
    for (const k of writeKeys) {
      const w = blk.indexOf(k);
      check(label + ' — 스코프 검사가 «' + k.split(' ')[0] + ' ' + k.split(' ').pop() + '» 보다 앞에 온다',
        w < 0 || (scopeAt > 0 && scopeAt < w), { scopeAt, w });
    }
    check(label + ' — 강사 가드는 DB 접근보다 앞(스코프 검사 안으로 안 들어갔다)',
      teacherAt > 0 && (scopeAt < 0 || teacherAt < scopeAt));
  }

  /* 실제로 돌려 본다 — 대리점·지사·지사본사 조건이 «자기 학생만» 고르는가 (메모리 SQLite) */
  if (esbuildApi) {
    const out = join(mkdtempSync(join(tmpdir(), 'subscope-')), 'scope.mjs');
    let bundled = true;
    try {
      esbuildApi.buildSync({ entryPoints: [join(CF, 'src', 'scope.ts')], bundle: true, format: 'esm',
        platform: 'neutral', outfile: out, logLevel: 'silent' });
    } catch { bundled = false; }
    check('scope.ts 를 번들해 실제로 돌릴 수 있다', bundled);
    if (bundled) {
      const { scopeStudentCond } = await import('file://' + out.replace(/\\/g, '/'));
      const db = new DatabaseSync(':memory:');
      db.exec(`CREATE TABLE students_erp (user_id TEXT PRIMARY KEY, shop_name TEXT, franchise TEXT)`);
      for (const [u, shop, fr] of [
        ['stu_a', '강남학원', '서울지사'], ['stu_b', '분당학원', '경기지사'],
        ['stu_c', '강남학원', '서울지사'], ['stu_d', '부산학원', '부산지사'],
      ]) db.prepare(`INSERT INTO students_erp VALUES (?,?,?)`).run(u, shop, fr);

      // enroll-ops 가 쓰는 그 SQL 을 소스에서 오려 낸다 — 문장을 베껴 쓰면 갈린다
      const sqlM = scopeFn.match(/SELECT 1 AS ok FROM students_erp se WHERE se\.user_id = \? AND \(\$\{c\.cond\}\) LIMIT 1/);
      check('스코프 확인 SQL 을 소스에서 찾았다', !!sqlM);
      const run = (scope, uid) => {
        const c = scopeStudentCond(scope, 'se');
        const sql = `SELECT 1 AS ok FROM students_erp se WHERE se.user_id = ? AND (${c.cond}) LIMIT 1`;
        return !!db.prepare(sql).get(uid, ...c.binds);
      };
      const AGENCY = { type: 'agency', value: '강남학원', label: '' };
      const BRANCH = { type: 'branch', value: '서울', label: '' };
      const FRAN = { type: 'franchise', value: '서울지사,경기지사', label: '' };
      check('대리점: 우리 학원 학생은 통과', run(AGENCY, 'stu_a') === true);
      check('대리점: 남의 학원 학생은 막힘', run(AGENCY, 'stu_b') === false);
      check('대리점: 없는 학생은 막힘', run(AGENCY, 'stu_zzz') === false);
      check('지사: 우리 지사 학생은 통과', run(BRANCH, 'stu_c') === true);
      check('지사: 다른 지사 학생은 막힘', run(BRANCH, 'stu_d') === false);
      check('지사본사: 소유 지사 학생은 통과', run(FRAN, 'stu_b') === true);
      check('지사본사: 소유 밖 학생은 막힘', run(FRAN, 'stu_d') === false);
      // 본사·내부직원은 조건이 비어 있어야 한다(= 자르지 않는다)
      for (const t of ['hq', 'none']) {
        check(`${t} 는 조건이 비어 있다(전체)`, scopeStudentCond({ type: t, value: null, label: '' }, 'se').cond === '');
      }
      db.close();
    }
  }
}

/* ══ ②-3 화면 — 강사에게만 감추고, 조직 계정에는 보인다(목록이 이미 잘려 있다) ══════ */
console.log('\n②-3 관리자 화면의 버튼 노출 판정');
{
  check('버튼을 그리기 전에 역할을 본다(subAllowed)',
    /subAllowed\(\)/.test(todayJs) && /tc-sub-act/.test(todayJs));
  const fn = blockAt(todayJs, 'function subAllowed');
  check('강사에게는 안 그린다', /role !== 'teacher'/.test(fn), fn.slice(0, 140));
  check('조직 계정에는 그린다(차단 목록이 남아 있지 않다)',
    !/'branch'|'agency'|'franchise'/.test(stripComments(fn)), fn.slice(0, 200));
  check('신원을 모를 때는 막지 않는다(서버가 최종 판정)', /if \(!role\) return true/.test(fn));
  check('신원 정본은 서버가 확인한 window.__ADM_ME 다', /__ADM_ME/.test(fn));
  check("신원이 도착하면 다시 그린다 — document 에서 듣는다(발행처가 document)",
    /document\.addEventListener\('mangoi:identity'/.test(todayJs));
  check('⛔ 상주 감시(MutationObserver·setInterval)를 쓰지 않는다',
    !/MutationObserver|setInterval/.test(stripComments(todayJs)));
  check('안내 문구가 «우리 소속 학생의 수업만» 이라고 말한다',
    /우리 소속 학생의 수업만/.test(rd('../cloudflare-deploy/public/admin.html')));
}

/* ══ ③ CREATE 두 벌이 같은 표를 만드는가 (진짜 SQLite) ════════════════════════ */
console.log('\n③ class_substitutions — CREATE 두 벌이 같은 표를 만든다');
const createRe = /CREATE TABLE IF NOT EXISTS class_substitutions[^`]*?\)/g;
const cA = (enroll.match(createRe) || [])[0] || '';
const cB = (admin.match(createRe) || [])[0] || '';
check('enroll-ops.ts 에 CREATE 가 있다', cA.length > 50);
check('api-admin.ts 에도 방어 CREATE 가 있다', cB.length > 50);
if (cA && cB) {
  const cols = (sql) => {
    const db = new DatabaseSync(':memory:');
    db.exec(sql.replace(/;$/, ''));
    const r = db.prepare('PRAGMA table_info(class_substitutions)').all().map((x) => x.name + ':' + x.type);
    db.close();
    return r.join(',');
  };
  const a = cols(cA), b = cols(cB);
  check('두 CREATE 의 칸 구성이 정확히 같다', a === b, { enroll: a, admin: b });
}

/* ══ ④ 오버레이를 읽는 곳은 전부 status='active' 를 본다 ═════════════════════ */
console.log("\n④ 취소한 대체가 되살아나지 않는다 — 읽는 SQL 은 status='active'");
for (const [label, src] of [['enroll-ops', enroll], ['api-admin', admin], ['api-teacher', teacher], ['api-mango', mango]]) {
  const stmts = (src.match(/FROM class_substitutions[\s\S]{0,400}?(?=`)/g) || [])
    .concat(src.match(/class_substitutions cs2[\s\S]{0,400}?(?=`)/g) || []);
  const reads = stmts.filter((s) => /SELECT|JOIN/.test(s) || true);
  const bad = reads.filter((s) => !/status\s*=\s*'active'/.test(s));
  check(label + ' — class_substitutions 조회가 모두 active 만 본다', reads.length === 0 || bad.length === 0,
    bad.map((s) => s.slice(0, 90)));
}

/* ══ ⑤ 하루 한 명 — UNIQUE(schedule_id, sub_date) 를 진짜 SQLite 로 확인 ══════ */
console.log('\n⑤ 한 회차·한 날짜에 대체강사는 한 명 (실제 SQLite)');
{
  const idx = (enroll.match(/CREATE UNIQUE INDEX IF NOT EXISTS uq_class_sub_slot[^`]*/) || [])[0] || '';
  check('UNIQUE 인덱스 선언이 있다', /class_substitutions\(schedule_id, sub_date\)/.test(idx), idx.slice(0, 90));
  if (cA && idx) {
    const db = new DatabaseSync(':memory:');
    db.exec(cA.replace(/;$/, ''));
    db.exec(idx.replace(/;$/, ''));
    const up = (enroll.match(/INSERT INTO class_substitutions[\s\S]*?status = 'active'/) || [])[0] || '';
    check('등록 SQL 이 UPSERT(ON CONFLICT DO UPDATE) 다 — DELETE 로 지우지 않는다',
      /ON CONFLICT\(schedule_id, sub_date\) DO UPDATE/.test(up));
    if (up) {
      const sql = up.replace(/\s+/g, ' ');
      db.prepare(sql).run(7, '2026-09-03', '11', '26', '병가', 'admin', 1, 1);
      db.prepare(sql).run(7, '2026-09-03', '11', '24', '휴가', 'admin', 2, 2);
      const rows = db.prepare("SELECT substitute_teacher_id, reason, status FROM class_substitutions WHERE schedule_id=7 AND sub_date='2026-09-03'").all();
      check('두 번 배정해도 행은 하나 — 나중 것으로 덮인다',
        rows.length === 1 && String(rows[0].substitute_teacher_id) === '24' && rows[0].status === 'active', rows);
      // 취소는 status 만 바꾼다(행은 남아 이력이 된다)
      const cancel = (enroll.match(/UPDATE class_substitutions SET status = 'cancelled'[\s\S]*?'active'`/) || [])[0] || '';
      check('취소는 DELETE 가 아니라 status 만 바꾼다', /SET status = 'cancelled'/.test(cancel) && !/DELETE FROM class_substitutions/.test(enroll));
    }
    db.close();
  }
}

/* ══ ⑥ 자리표시(LMS·시연 시드) 행에는 배정하지 않는다 ═══════════════════════ */
console.log('\n⑥ LMS·시연 시드 자리표시 행 제외');
{
  const blk = blockAt(enroll, "path === '/api/pay/enroll/admin/substitute'");
  check("자리표시 행이면 거절한다(placeholder_row)",
    /'lms'/.test(blk) && /'type_seed'/.test(blk) && /placeholder_row/.test(blk));
  check('대체강사가 실재하는 활성 강사인지 검증한다(invalid_teacher)',
    /FROM teachers WHERE id = \? AND active = 1/.test(blk) && /invalid_teacher/.test(blk));
  check('대체 내역을 class_audit_log 에 남긴다(급여 확인 근거)',
    /writeClassAudit/.test(blk) && /teacher_change/.test(blk));
}

/* ══ ⑦ 가용성·충돌 판정 «네 곳» 이 전부 같은 판정을 쓰는가 ══════════════════════
   🔴 여기가 갈리면 조용히 이중배정이 난다 — 후보 목록에는 🟢(그 시간 가능)으로 나오고
   충돌검사도 통과한다. 2026-08-30 trap-check 가 실제로 이 반쪽 상태를 잡았다. */
console.log('\n⑦ 충돌·가용성 판정이 한 곳(enrollDowList)으로 모여 있는가');
{
  check('day_of_week 를 «앞 세 글자» 로 읽는 코드가 남아 있지 않다',
    !/day_of_week[^\n]*slice\(0, 3\)/.test(enroll) && !/DOW2?\[String\(r\.day_of_week/.test(enroll));
  const users = (enroll.match(/enrollDowList\(/g) || []).length;
  check('enrollDowList 를 쓰는 곳이 5곳 이상(선언 1 + 판정 4)', users >= 5, users);
  for (const [label, anchor] of [
    ['enrollConflicts', 'export async function enrollConflicts'],
    ['busyTimesForTeacher', 'export async function busyTimesForTeacher'],
    ['teachersFreeAt', 'export async function teachersFreeAt'],
  ]) {
    const blk = blockAt(enroll, anchor);
    check(label + ' 이 enrollDowList 를 쓴다', blk.includes('enrollDowList('), blk.slice(0, 60));
  }
}

/* ══ ⑧ 취소된 수업의 대체가 «그 시간 바쁨» 으로 남지 않는가 ═══════════════════ */
console.log('\n⑧ 원 수업이 취소되면 그 대체도 함께 빠진다');
for (const [label, src] of [['enroll-ops', enroll], ['api-teacher', teacher]]) {
  const joins = src.match(/class_substitutions cs2[\s\S]{0,600}?(?=`)/g) || [];
  const bad = joins.filter((s) => /JOIN class_schedules/.test(s) && !/cs\.status = 'active'/.test(s));
  check(label + ' — class_schedules 를 이을 때 그 수업의 status 도 본다', bad.length === 0,
    bad.map((s) => s.slice(0, 100)));
}

/* ══ ⑨ 방어 CREATE 쪽에도 UNIQUE 인덱스가 있는가 ═════════════════════════════ */
console.log('\n⑨ CREATE 를 베낀 곳에 인덱스도 함께 있다');
{
  const blk = admin.slice(admin.indexOf('CREATE TABLE IF NOT EXISTS class_substitutions'),
    admin.indexOf('CREATE TABLE IF NOT EXISTS class_substitutions') + 900);
  check('api-admin 의 방어 CREATE 옆에 uq_class_sub_slot 도 만든다',
    /uq_class_sub_slot/.test(blk));
}

console.log(`\n${FAIL === 0 ? '✅' : '❌'} PASS ${PASS} · FAIL ${FAIL}`);
if (FAIL) { console.log('실패: ' + FAILS.join(' / ')); process.exit(1); }
