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
import { readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dir = dirname(fileURLToPath(import.meta.url));
const CF = resolve(__dir, '..', 'cloudflare-deploy');
const rd = (p) => { try { return readFileSync(resolve(__dir, p), 'utf8'); } catch { return ''; } };

const enroll = rd('../cloudflare-deploy/src/enroll-ops.ts');
const admin = rd('../cloudflare-deploy/src/api-admin.ts');
const teacher = rd('../cloudflare-deploy/src/api-teacher.ts');
const mango = rd('../cloudflare-deploy/src/api-mango.ts');

let PASS = 0, FAIL = 0; const FAILS = [];
const check = (name, ok, extra) => {
  if (ok) { PASS++; console.log('  ✅ ' + name); }
  else { FAIL++; FAILS.push(name); console.log('  ❌ ' + name + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : '')); }
};

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
  check(label + ' — isTeacher 403 가드가 있다', guardAt > 0 && /forbidden_teacher/.test(blk));
  // 가드가 DB 를 만지기 «전» 에 와야 한다 — 뒤에 있으면 강사가 조회·기록을 이미 마친 뒤다
  const firstDb = Math.min(...['env.DB.prepare', 'env.DB.exec', 'ensureEnrollTables']
    .map((k) => { const i = blk.indexOf(k); return i < 0 ? Number.MAX_SAFE_INTEGER : i; }));
  check(label + ' — 가드가 DB 접근보다 앞에 온다', guardAt > 0 && guardAt < firstDb, { guardAt, firstDb });
}
check('강사 차단이 checkAdminSession «만» 에 기대지 않는다',
  /getAdminActor/.test(blockAt(enroll, "path === '/api/pay/enroll/admin/substitute'")));

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
