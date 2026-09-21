// 📅 학생 상세 캘린더 — «취소된 수업이 되살아나는» 자리 감시 — 2026-09-21
//
// [무엇이 문제였나]
//   사장님: 「아직도 이게 왜 나타나? 이유가 뭐지??」 (학생 상세 › 주간 › 금 14:20 「체험수업」)
//   학생 상세의 주간·월간 캘린더는 **enrollments(«신청서»)** 를 보고 «매주 N요일» 카드를
//   그린다. 그런데 실제 수업(class_schedules)을 전부 취소해도 신청서는 confirmed 로 남는다
//   — 두 표 사이에 배선이 없다. GET /api/admin/class-schedules 는 `cs.status != 'cancelled'`
//   로 취소분을 이미 걸러 주므로 **같은 화면 아래쪽 «스케줄 목록» 에는 안 보이는데
//   캘린더에만 남아**, 한 화면이 두 표를 각각 보고 서로 다른 말을 했다.
//   실측(2026-09-21 운영 D1): 신청 14건 중 1건 — 정우영(jeong) 체험수업,
//   class_schedules 2332~2335 네 건이 전부 cancelled 인데 enrollments 103 은 confirmed.
//
// [왜 문자열 검사만으로는 모자란가]
//   표도 값도 함수도 전부 «있다». 틀린 것은 «무엇이 그려지는가» 하나뿐이라
//   수리 전에도 회귀가 전부 초록이었다. 그래서 판정 함수를 화면 소스에서 **오려 내
//   실제로 돌려** «숨기는가» 를 답으로 묻고, 서버 SQL 은 진짜 SQLite 에 돌린다.
//
// [짝으로 묻는 이유]
//   「취소된 것은 숨긴다」만 보면 «전부 숨기기» 도 통과한다 — 그러면 멀쩡한 수업이
//   캘린더에서 통째로 사라져 지금보다 나쁘다. 그래서 「살아 있는 수업은 그대로 그린다」·
//   「아직 수업을 안 만든 신청도 그린다」·「서버가 칸을 안 주면 예전대로 그린다」를 짝으로 둔다.
//
// 실행: node test-harness/enroll_calendar_cancelled_harness.mjs
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, '..');
const HTML = readFileSync(resolve(ROOT, 'cloudflare-deploy/public/admin/student.html'), 'utf8');
const SRC_ADMIN = process.env.ENRCAL_SRC_ADMIN
  ? readFileSync(process.env.ENRCAL_SRC_ADMIN, 'utf8')
  : readFileSync(resolve(ROOT, 'cloudflare-deploy/src/api-admin.ts'), 'utf8');
const SRC_HTML = process.env.ENRCAL_SRC_HTML ? readFileSync(process.env.ENRCAL_SRC_HTML, 'utf8') : HTML;
/* 📅 (2026-09-21) 조회·판정 정본은 **한 파일** 이다 — 이전에는 api-admin.ts 안에 인라인으로
   있었는데, 같은 사실을 보는 통로가 **셋**(캘린더 · 종료·연장 탭 · 학생 명부)이라
   복제하면 반드시 한쪽만 고쳐진다(규칙서 「같은 판정이 두 곳이면…」). */
const SRC_MOD = process.env.ENRCAL_SRC_MOD
  ? readFileSync(process.env.ENRCAL_SRC_MOD, 'utf8')
  : readFileSync(resolve(ROOT, 'cloudflare-deploy/src/enrollment-class-count.ts'), 'utf8');
const SRC_MANGO = process.env.ENRCAL_SRC_MANGO
  ? readFileSync(process.env.ENRCAL_SRC_MANGO, 'utf8')
  : readFileSync(resolve(ROOT, 'cloudflare-deploy/src/api-mango.ts'), 'utf8');
const SRC_CORE = process.env.ENRCAL_SRC_CORE
  ? readFileSync(process.env.ENRCAL_SRC_CORE, 'utf8')
  : readFileSync(resolve(ROOT, 'cloudflare-deploy/public/js/adm-core.js'), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
const check = (name, ok, extra) => {
  if (ok) { PASS++; console.log('  ✅ ' + name); }
  else { FAIL++; FAILS.push(name); console.log('  ❌ ' + name + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : '')); }
};

/* 중괄호 짝으로 함수 몸통을 자른다 — 길이(slice)로 자르면 옆 함수가 딸려 들어온다
   (규칙서 「검사 범위를 «길이» 로 자르지 마세요」). */
function bodyAt(src, declRe) {
  const m = declRe.exec(src);
  if (!m) return null;
  const open = src.indexOf('{', m.index);
  if (open < 0) return null;
  let d = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '{') d++;
    else if (c === '}') { d--; if (d === 0) return src.slice(m.index, i + 1); }
  }
  return null;
}

/* 주석을 벗긴 사본 — 부정 검사는 이것으로 판정한다(자기 설명 주석을 잡는 사고 방지).
   ⛔ `//` 를 정규식으로 일괄 삭제하면 문자열 안의 https:// 가 잘린다 → 글자를 훑는다. */
function stripComments(t) {
  let out = '', i = 0, inS = null, inLine = false, inBlk = false;
  while (i < t.length) {
    const c = t[i], n = t[i + 1];
    if (inLine) { if (c === '\n') { inLine = false; out += c; } i++; continue; }
    if (inBlk) { if (c === '*' && n === '/') { inBlk = false; i += 2; } else i++; continue; }
    if (inS) { if (c === '\\') { out += c + (n || ''); i += 2; continue; } if (c === inS) inS = null; out += c; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { inS = c; out += c; i++; continue; }
    if (c === '/' && n === '/') { inLine = true; i += 2; continue; }
    if (c === '/' && n === '*') { inBlk = true; i += 2; continue; }
    out += c; i++;
  }
  return out;
}

console.log('\n📅 학생 상세 캘린더 — 취소된 수업 되살아남 감시\n');

// ─────────────────────────────────────────────────────────────
console.log('Ⓐ 판정 함수를 오려 내 실제로 돌린다');
const fnSrc = bodyAt(SRC_HTML, /function\s+enrCalHidden\s*\(/);
check('Ⓐ-0 전제: enrCalHidden 을 오려 냈다', !!fnSrc && fnSrc.length > 80, fnSrc ? fnSrc.length : null);

let hidden = null;
if (fnSrc) {
  try { hidden = new Function(fnSrc + '\nreturn enrCalHidden;')(); }
  catch (e) { check('Ⓐ-0b 전제: 오려 낸 함수가 돌아간다', false, String(e && e.message)); }
}
const H = (o) => { try { return hidden(o); } catch (e) { return 'THREW:' + (e && e.message); } };

if (typeof hidden === 'function') {
  // 사장님이 X 친 바로 그 행 (운영 D1 실측값)
  const 실사고 = { id: 103, status: 'confirmed', type: '체험수업', days_of_week: '금',
                   time: '14:20', end_date: '2026-10-11', class_total: 4, class_active: 0 };
  check('Ⓐ-1 실사고 행(수업 4건 전부 취소)을 숨긴다', H(실사고) === true, H(실사고));

  // ── 짝: 숨기면 안 되는 것들 ──
  check('Ⓐ-2 짝) 살아 있는 수업이 있으면 그대로 그린다',
    H({ status: 'confirmed', class_total: 4, class_active: 4 }) === false);
  check('Ⓐ-3 짝) 일부만 취소면 그대로 그린다',
    H({ status: 'confirmed', class_total: 4, class_active: 1 }) === false);
  check('Ⓐ-4 짝) 아직 수업을 안 만든 신청(0건)은 그대로 그린다',
    H({ status: 'confirmed', class_total: 0, class_active: 0 }) === false);
  check('Ⓐ-5 짝) 서버가 칸을 안 주면(옛 캐시·조회 실패) 예전대로 그린다',
    H({ status: 'confirmed' }) === false);
  check('Ⓐ-6 짝) 칸이 null 이어도 예전대로 그린다',
    H({ status: 'confirmed', class_total: null, class_active: null }) === false);
  check('Ⓐ-7 짝) 모르는 status 는 그대로 그린다(모르면 안 숨김)',
    H({ status: 'weird_new_state', class_total: 2, class_active: 2 }) === false);

  // ── 신청서 자체가 끝난 것 ──
  for (const st of ['cancelled', 'canceled', 'rejected', 'ended', 'expired']) {
    check('Ⓐ-8 신청 status=' + st + ' 은 숨긴다',
      H({ status: st, class_total: 2, class_active: 2 }) === true);
  }
  check('Ⓐ-9 대문자·공백이 섞여도 숨긴다', H({ status: '  CANCELLED ' }) === true);
  check('Ⓐ-10 빈 객체·null 에 안 던진다', H({}) === false && H(null) === false);
}

// ─────────────────────────────────────────────────────────────
console.log('\nⒷ 배선 — 두 캘린더가 «그 판정을 실제로 쓰는가»');
const htmlNoCmt = stripComments(SRC_HTML);
const decl = (htmlNoCmt.match(/function\s+enrCalHidden\s*\(/g) || []).length;
check('Ⓑ-1 판정 정본은 «하나» 다(복제 금지)', decl === 1, decl);

const loops = (htmlNoCmt.match(/for\s*\(\s*const\s+enr\s+of\s*\(\s*_dSchedState\.enrollments/g) || []).length;
const calls = (htmlNoCmt.match(/if\s*\(\s*enrCalHidden\s*\(\s*enr\s*\)\s*\)\s*continue\s*;/g) || []).length;
/* ⛔ 개수를 «2» 로 못 박지 않는다 — 나중에 뷰(예: 일간)가 정당하게 늘면 멀쩡한 수리가
   빨간불이 된다(규칙서 「하니스가 «목록·개수» 를 못 박아 두어…」). 물어야 할 것은
   «둘 이상 있는가» 와 «그 전부가 판정을 부르는가» 짝이다. */
check('Ⓑ-2 enrollments 를 도는 캘린더 루프가 둘 이상이다(주간·월간)', loops >= 2, loops);
check('Ⓑ-3 그 루프 «전부» 가 판정을 부르고 건너뛴다', calls === loops && calls > 0, { loops, calls });

/* 선언이 최상위여야 한다 — 다른 함수 «안» 에 들어가면 그 밖의 호출부는 ReferenceError 인데
   문자열 검사는 «선언도 있고 호출도 있다» 로 통과한다(규칙서 「선언 위치는 문자열로 안 보인다」). */
const iDecl = htmlNoCmt.indexOf('function enrCalHidden');
const iCall = htmlNoCmt.indexOf('if (enrCalHidden(enr))');
check('Ⓑ-4 선언이 호출보다 «앞» 이다', iDecl > 0 && iDecl < iCall, { iDecl, iCall });

/* ⚠️ 「선언과 호출의 깊이가 같은가」로 물으면 안 된다 — 호출은 «함수 안의 for 루프 안» 이라
   깊이가 2인 것이 정상이다(2026-09-21 에 그렇게 짰다가 멀쩡한 코드가 빨간불이 났다).
   물어야 할 것은 **«선언 자체가 최상위인가»** 다: 그 <script> 블록 처음부터 선언까지 깊이 0. */
{
  const blocks = [...SRC_HTML.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const owner = blocks.find((b) => /function\s+enrCalHidden\s*\(/.test(b));
  check('Ⓑ-5 전제: 선언이 든 <script> 블록을 찾았다', !!owner);
  if (owner) {
    const clean = stripComments(owner);
    const at = clean.indexOf('function enrCalHidden');
    let d = 0;
    for (const ch of clean.slice(0, at)) { if (ch === '{') d++; else if (ch === '}') d--; }
    check('Ⓑ-6 선언이 «최상위» 다(다른 함수 안이 아니다 → 호출부가 ReferenceError 안 난다)', d === 0, d);
  }
}

// ─────────────────────────────────────────────────────────────
console.log('\nⒸ 서버 — «수업 수» 를 진짜 SQLite 에 돌려 본다');
let DatabaseSync = null;
try { ({ DatabaseSync } = await import('node:sqlite')); } catch {}
if (!DatabaseSync) {
  console.log('  ⏭  건너뜀 — 이 node 에는 node:sqlite 가 없습니다(Node 22+ 필요)');
} else {
  // 정본 SQL 을 소스에서 오려 낸다 — 하니스에 베껴 적으면 «내가 쓴 것을 검사» 가 된다
  const m = /SELECT substr\(source, 12\) AS enr_id[\s\S]*?GROUP BY source/.exec(SRC_MOD);
  check('Ⓒ-0 전제: 서버 SQL 을 오려 냈다', !!m);
  if (m) {
    const sql = m[0];
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE class_schedules (id INTEGER PRIMARY KEY, user_id TEXT, status TEXT, source TEXT)`);
    const ins = db.prepare(`INSERT INTO class_schedules (id,user_id,status,source) VALUES (?,?,?,?)`);
    // 신청 103 — 수업 4건 전부 취소 (실사고 그대로)
    [2332, 2333, 2334, 2335].forEach((id) => ins.run(id, 'jeong', 'cancelled', 'adm-enroll:103'));
    // 신청 104 — 살아 있는 수업 2건 + 취소 1건
    ins.run(3001, 'kim', 'active', 'adm-enroll:104');
    ins.run(3002, 'kim', 'active', 'adm-enroll:104');
    ins.run(3003, 'kim', 'cancelled', 'adm-enroll:104');
    // 다른 출처 — 이 신청서가 만든 것이 아니므로 걸리면 안 된다
    ins.run(4001, 'lee', 'active', 'ai_enroll');
    ins.run(4002, 'lee', 'active', 'admin_ui');
    ins.run(4003, 'lee', 'active', 'enroll:ORDER-103');
    // 앞자리가 겹치는 신청(1031) — 콤마 경계가 없으면 103 으로 새어 들어온다
    ins.run(5001, 'park', 'active', 'adm-enroll:1031');

    /* ⚠️ 바인드 개수는 «돌리기 전» 에 본다 — instr 조건을 지우는 변이는 `?` 가 0개가 되어
       prepare().all(인자1개) 가 **던진다**. 그러면 ❌ 가 0건으로 찍혀 «검출 못 함» 이
       «통과» 로 위장한다(규칙서 「변이가 크래시가 되면 ❌ 0건으로 위장합니다」). */
    check('Ⓒ-6 바인드는 «한 개» 다(IN 목록을 만들지 않는다 — D1 100개 한도)',
      (sql.match(/\?/g) || []).length === 1, (sql.match(/\?/g) || []).length);
    check('Ⓒ-6b 신청 id 로 «좁히는» 조건이 있다(없으면 남의 신청 수업까지 센다)',
      /\binstr\s*\(/.test(sql), sql.slice(0, 200));

    const run = (ids) => {
      try {
        const rows = db.prepare(sql).all(',' + ids.join(',') + ',');
        const out = {};
        for (const r of rows) out[String(r.enr_id)] = { total: Number(r.total_n), active: Number(r.active_n) };
        return out;
      } catch (e) { return { __threw: String(e && e.message) }; }
    };

    const r1 = run([103, 104]);
    check('Ⓒ-0b 전제: 그 SQL 이 실제로 돌아간다', !r1.__threw, r1.__threw);
    check('Ⓒ-1 신청 103 = 수업 4건·살아있음 0건 (실사고 재현)',
      r1['103'] && r1['103'].total === 4 && r1['103'].active === 0, r1['103']);
    check('Ⓒ-2 짝) 신청 104 = 수업 3건·살아있음 2건',
      r1['104'] && r1['104'].total === 3 && r1['104'].active === 2, r1['104']);
    check('Ⓒ-3 다른 출처(ai_enroll·admin_ui·enroll:주문번호)는 안 걸린다',
      Object.keys(r1).length === 2, Object.keys(r1));
    check('Ⓒ-4 앞자리가 겹치는 신청(1031)이 103 으로 안 샌다',
      !r1['1031'], r1['1031']);
    const r2 = run([1031]);
    check('Ⓒ-5 짝) 1031 을 물으면 1031 만 나온다',
      r2['1031'] && r2['1031'].total === 1 && Object.keys(r2).length === 1, r2);

    // 실사고 행을 서버 답 → 화면 판정으로 이어 본다(끝에서 끝까지)
    /* ⚠️ r1 에 그 키가 없을 수 있다(SQL 을 깨뜨리는 변이) — 그때 g.total 이 **던져**
       결과줄조차 안 나온다. «깨끗한 FAIL» 로 만든다
       (규칙서 「변이가 크래시가 되면 ❌ 0건으로 위장합니다」). */
    if (typeof hidden === 'function') {
      const g = r1['103'] || {};
      check('Ⓒ-7 서버 답을 그대로 화면 판정에 넣으면 «숨김» 이 된다',
        hidden({ status: 'confirmed', class_total: g.total, class_active: g.active }) === true, g);
      const g2 = r1['104'] || {};
      check('Ⓒ-8 짝) 살아 있는 신청은 그대로 그려진다',
        hidden({ status: 'confirmed', class_total: g2.total, class_active: g2.active }) === false, g2);
    }
    db.close();
  }
}

// ─────────────────────────────────────────────────────────────
console.log('\nⒹ 서버 — 조회한 값을 «응답에 싣는가» (오려 내 실제로 돌린다)');
/* ⚠️ Ⓒ절은 SQL 만 본다. 「조회는 하는데 items 에 안 싣는」 변이는 그 절을 통째로 통과하는데,
   그러면 화면이 예전대로 그려 **이 사고가 그대로 재현**된다(2026-09-21 변이시험에서 실측).
   그래서 그 블록을 오려 내 가짜 D1 으로 실제로 돌리고 «무엇이 실렸는가» 를 답으로 묻는다.
   ⛔ 「그 글자가 있는가」로 물으면 하드코딩(class_total = 4)을 못 본다 — 그래서 가짜 D1 이
      돌려주는 값을 바꿔 가며 **그 값이 그대로 실리는지** 본다. */
const _attachFn = bodyAt(SRC_MOD, /export async function attachEnrollmentClassCounts\s*\(/);
const blkM = _attachFn ? [_attachFn.slice(_attachFn.indexOf('{') + 1, _attachFn.lastIndexOf('}'))] : null;
check('Ⓓ-0 전제: 서버 블록을 오려 냈다', !!blkM, blkM ? blkM[0].length : null);
if (blkM) {
  // TypeScript 표기를 걷어낸다 — 배열 표기를 «먼저» 지운다(규칙서: as any[] 를 나중에 지우면 깨진다)
  const js = blkM[0]
    .replace(/\bas any\[\]/g, '')
    .replace(/\.all<[^>]*>\(/g, '.all(')
    .replace(/new Map<[^>]*>\(/g, 'new Map(')
    .replace(/\bas any\b/g, '')
    .replace(/\(([a-zA-Z_$][\w$]*): any\)/g, '($1)');
  const mkEnv = (rows) => ({
    DB: { prepare: () => ({ bind: () => ({ all: async () => ({ results: rows }) }) }) }
  });
  /* ⚠️ 정본이 기대는 상수(ENROLL_CLASS_COUNT_SQL)를 **주입**한다 — 안 주면
     ReferenceError 가 정본의 try/catch 에 삼켜져 «칸을 안 싫는다» 로 보이고,
     그러면 이 절이 통째로 헛돕다(규칙서 「이름을 그대로 평가하면 … 조용히 catch 로」).
     그래서 경고를 받아 둔 뒤 «삼켜진 예외가 없는가» 를 전제 검사로 둠. */
  const SQL_CONST = (/export const ENROLL_CLASS_COUNT_SQL = (`[\s\S]*?`)/.exec(SRC_MOD) || [])[1];
  check('Ⓓ-0b 전제: 정본 SQL 상수를 오려 냈다', !!SQL_CONST);
  let _warns = [];
  const runBlk = async (items, rows) => {
    _warns = [];
    const f = new Function('items', 'env', 'console', 'ENROLL_CLASS_COUNT_SQL',
      'return (async () => {' + js + '})();');
    await f(items, mkEnv(rows), { warn(...a) { _warns.push(a.map(String).join(' ')); } },
      SQL_CONST ? eval(SQL_CONST) : '');
    return items;
  };
  try {
    const items = [{ id: 103 }, { id: 104 }, { id: 999 }];
    await runBlk(items, [
      { enr_id: '103', total_n: 4, active_n: 0 },
      { enr_id: '104', total_n: 3, active_n: 2 },
    ]);
    check('Ⓓ-0c 전제: 돌리는 중 삼켜진 예외가 없다(있으면 아래 절이 헛돈다)',
      _warns.length === 0, _warns);
    check('Ⓓ-1 조회한 값이 그 신청 행에 실린다(103 → 4건·0건)',
      items[0].class_total === 4 && items[0].class_active === 0, items[0]);
    check('Ⓓ-2 짝) 값이 «하드코딩» 이 아니다(104 → 3건·2건)',
      items[1].class_total === 3 && items[1].class_active === 2, items[1]);
    check('Ⓓ-3 짝) 조회에 안 나온 신청에는 칸을 안 만든다(화면이 예전대로 그린다)',
      items[2].class_total === undefined && items[2].class_active === undefined, items[2]);

    // 값을 바꿔 다시 — 그대로 따라오면 «받은 값을 쓴다» 는 뜻이다
    const items2 = [{ id: 103 }];
    await runBlk(items2, [{ enr_id: '103', total_n: 7, active_n: 5 }]);
    check('Ⓓ-4 짝) 다른 값을 주면 그 값이 실린다(7·5)',
      items2[0].class_total === 7 && items2[0].class_active === 5, items2[0]);

    // 조회가 던져도 목록은 그대로여야 한다(fail-open)
    const items3 = [{ id: 103, student_name: '정우영' }];
    const boom = { DB: { prepare: () => { throw new Error('D1 흔들림'); } } };
    const f2 = new Function('items', 'env', 'console', 'return (async () => {' + js + '})();');
    let threw = false;
    try { await f2(items3, boom, { warn() {} }); } catch { threw = true; }
    check('Ⓓ-5 조회가 실패해도 던지지 않는다(목록이 통째로 죽으면 안 된다)', !threw);
    check('Ⓓ-6 짝) 그때는 칸을 안 실어 화면이 예전대로 그린다',
      items3[0].class_total === undefined && items3[0].student_name === '정우영', items3[0]);
  } catch (e) {
    check('Ⓓ-x 블록을 돌리는 중 예외', false, String(e && e.message));
  }
}

// ─────────────────────────────────────────────────────────────
console.log('\nⒺ 두 판정이 «같은 말» 을 하는가 (화면 enrCalHidden ↔ 서버 isEnrollmentGone)');
/* ⚠️ 화면(admin/student.html)과 서버(enrollment-class-count.ts)는 다른 파일이라 한 함수를
   공유할 수 없다. 그래서 «같은 규칙» 을 두 곳에 두고 **둘을 나란히 돌려 답을 대조**한다.
   ⛔ 기대값을 여기 손으로 적지 말 것 — 두 함수를 서로의 기대값으로 삼는다.
   ⚠️ 그러면 «둘 다 같이 망가뜨리는» 변이는 못 본다 → Ⓐ절이 화면 쪽 답을 따로 못 박는다. */
{
  const goneSrc = bodyAt(SRC_MOD, /export function isEnrollmentGone\s*\(/);
  check('Ⓔ-0 전제: 서버 판정 함수를 오려 냈다', !!goneSrc);
  let gone = null;
  if (goneSrc) {
    const js = goneSrc
      .replace(/^export /, '')
      .replace(/\(enr: any\)/, '(enr)')
      .replace(/\): boolean \{/, ') {');
    try { gone = new Function(js + '; return isEnrollmentGone;')(); } catch (e) {
      check('Ⓔ-0b 전제: 그 함수가 실제로 돌아간다', false, String(e && e.message));
    }
  }
  if (typeof gone === 'function' && typeof hidden === 'function') {
    check('Ⓔ-0b 전제: 그 함수가 실제로 돌아간다', true);
    /* 경우를 «표» 로 만들어 전수로 돌린다 — 상태 8종 × 수업 수 6종 = 48가지 */
    const STATES = ['confirmed', 'pending', 'cancelled', 'canceled', 'rejected', 'ended', 'expired', 'weird'];
    const COUNTS = [
      {},                                   // 칸 없음(옛 응답·조회 실패)
      { class_total: 0,  class_active: 0 }, // 아직 수업을 안 만든 신청
      { class_total: 4,  class_active: 0 }, // 실사고 — 전부 취소
      { class_total: 4,  class_active: 1 },
      { class_total: 1,  class_active: 1 },
      { class_total: null, class_active: null },
    ];
    let diff = 0, gTrue = 0, gFalse = 0;
    for (const st of STATES) for (const c of COUNTS) {
      const enr = Object.assign({ status: st }, c);
      const a = hidden(enr) === true, b = gone(enr) === true;
      if (a !== b) { diff++; if (diff <= 3) console.log('     ↳ 어긋남', JSON.stringify(enr), 'screen=' + a, 'server=' + b); }
      if (b) gTrue++; else gFalse++;
    }
    check('Ⓔ-1 48가지 경우에서 두 판정의 답이 «전부» 같다', diff === 0, diff);
    /* ⛔ 짝이 없으면 «둘 다 항상 false» 같은 엉터리도 통과한다 */
    check('Ⓔ-2 짝) 숨기는 경우가 실제로 있다', gTrue > 0, gTrue);
    check('Ⓔ-3 짝) 안 숨기는 경우도 실제로 있다', gFalse > 0, gFalse);
    check('Ⓔ-4 실사고(확정 + 수업 4건 전부 취소)를 서버 판정도 숨긴다',
      gone({ status: 'confirmed', class_total: 4, class_active: 0 }) === true);
    check('Ⓔ-5 짝) 칸이 없으면 «안 숨긴다»(조회 실패에 멀쩡한 수업이 사라지면 안 된다)',
      gone({ status: 'confirmed' }) === false);

    /* Ⓔ-6 「상태 목록」을 손으로 적지 않는다 — 신청 관리 화면(adm-core.js)이 이미
       EN_STATUS_META(아는 상태)와 EN_LIVE(그중 «아직 살아 있는» 것)를 들고 있다.
       ⚠️ 그 화면에 «끝난 상태» 가 하나 늘었는데 판정이 그것을 모르면, 그 신청서의
          카드가 캘린더에만 또 되살아난다 — 그래서 두 목록을 **읽어서** 대조한다. */
    const metaM = /const EN_STATUS_META = \{([\s\S]*?)\n\};/.exec(SRC_CORE);
    const liveM = /const EN_LIVE = \[([^\]]*)\]/.exec(SRC_CORE);
    check('Ⓔ-6a 전제: 신청 화면의 상태 목록을 읽었다', !!metaM && !!liveM);
    if (metaM && liveM) {
      const known = [...metaM[1].matchAll(/^\s*([a-z_]+)\s*:/gm)].map((m) => m[1]);
      const live = [...liveM[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
      const dead = known.filter((k) => !live.includes(k));
      check('Ⓔ-6b 전제: 아는 상태·살아있는 상태를 둘 다 뽑았다', known.length > 0 && live.length > 0 && dead.length > 0, { known, live, dead });
      const missedDead = dead.filter((st) => gone({ status: st }) !== true);
      check('Ⓔ-6 화면이 아는 «끝난 상태» 를 판정이 전부 숨긴다', missedDead.length === 0, missedDead);
      /* ⛔ 짝이 없으면 «전부 숨기기» 도 통과한다 — 살아 있는 상태는 그대로 그려야 한다 */
      const wrongLive = live.filter((st) => gone({ status: st }) !== false);
      check('Ⓔ-7 짝) 살아 있는 상태는 그대로 그린다', wrongLive.length === 0, wrongLive);
    }
  }
}

// ─────────────────────────────────────────────────────────────
console.log('\nⒻ 배선 — 신청서를 받아 가는 «세 통로» 가 전부 그 정본을 쓰는가');
/* 🔴 사장님 「이거 재발 안하도록 반드시 모두 수정해줘」 —
   한 곳만 고치면 «같은 화면이 두 말을 하는» 상태가 남는다. 통로는 셋이다:
     ① GET /api/admin/enrollments        (api-admin.ts)  → 주간·월간 캘린더
     ② GET /api/admin/students/unified   (api-admin.ts)  → 학생 명부 「수강신청」 칸
     ③ GET /api/admin/student/:uid/full  (api-mango.ts)  → 🗓️ 종료·연장 「활성 패키지」 */
{
  const callsAdmin = (SRC_ADMIN.match(/attachEnrollmentClassCounts\s*\(/g) || []).length;
  const callsMango = (SRC_MANGO.match(/attachEnrollmentClassCounts\s*\(/g) || []).length;
  check('Ⓕ-1 api-admin.ts 가 정본을 «두 번» 부른다(① 캘린더 · ② 학생 명부)', callsAdmin === 2, callsAdmin);
  check('Ⓕ-2 api-mango.ts 가 정본을 부른다(③ 종료·연장 탭)', callsMango >= 1, callsMango);
  check('Ⓕ-3 두 파일이 정본을 import 한다',
    /from '\.\/enrollment-class-count'/.test(SRC_ADMIN) && /from '\.\/enrollment-class-count'/.test(SRC_MANGO));
  /* ⛔ 조회를 복제하면 한쪽만 고쳐진다 — SQL 이 정본 «밖» 에 또 있으면 FAIL */
  const dupA = (stripComments(SRC_ADMIN).match(/substr\(source, 12\)/g) || []).length;
  const dupM = (stripComments(SRC_MANGO).match(/substr\(source, 12\)/g) || []).length;
  check('Ⓕ-4 그 SQL 이 정본 밖에 복제돼 있지 않다', dupA === 0 && dupM === 0, { dupA, dupM });
  /* ② 학생 명부 — 감춘 뒤 «왜 비었는지» 를 같은 행에 싣는가(감추기만 하면 아무도 정리하지 않는다) */
  const uni = stripComments(SRC_ADMIN);
  check('Ⓕ-5 ② 명부는 서버 판정(isEnrollmentGone)으로 거른다', /isEnrollmentGone\s*\(/.test(uni));
  check('Ⓕ-6 짝) 감출 때 «사유» 를 같은 행에 싣는다(조용히 지우지 않는다)',
    /enroll_hidden_reason\s*=/.test(uni));
  /* 화면(adm-core.js) — 그 사유를 실제로 옮기고 말하는가 */
  const core = stripComments(SRC_CORE);
  check('Ⓕ-7 화면 매핑이 그 사유를 행으로 옮긴다(안 옮기면 셀이 볼 값이 없다)',
    /enroll_hidden_reason:\s*s\.enroll_hidden_reason/.test(core));
  check('Ⓕ-8 「수강신청」 셀이 사유를 말한다(_enrTd)', /\$\{_enrTd\(s\)\}/.test(core));
  /* ⚠️ 범위를 안 좁히면 같은 파일의 _enrTd 가 대신 걸려 **CSV 에서 사유를 빼도 통과**한다
     (2026-09-21 변이시험 실측). 내보내기 함수 몸통만 중괄호 짝으로 잘라서 본다. */
  const csvBody = bodyAt(SRC_CORE, /function\s+smExportStudentsCsv\s*\(/);
  check('Ⓕ-9a 전제: 내보내기 함수 몸통을 잘라 냈다', !!csvBody);
  check('Ⓕ-9 짝) 내보내기에서도 «끝났다» 를 잃지 않는다',
    !!csvBody && /enroll_hidden_reason/.test(stripComments(csvBody))
             && /_enrGoneLab\s*\(/.test(stripComments(csvBody)));
  /* ⚠️ 라벨 헬퍼가 renderStudentTable 안에 있으면 CSV 내보내기가 ReferenceError 로 죽는다
     (규칙서 「함수 선언을 다른 함수 «안» 에 넣으면…」 — 실제로 한 번 밟았다). */
  const labIdx = SRC_CORE.indexOf('const _enrGoneLab =');
  check('Ⓕ-10 라벨 헬퍼가 «최상위» 다(표와 CSV 가 서로 다른 함수라 안에 두면 죽는다)',
    labIdx > 0 && SRC_CORE[labIdx - 1] === '\n' && !/^\s/.test(SRC_CORE.slice(labIdx, labIdx + 1)));
  /* ③ 종료·연장 탭 — 화면이 같은 판정으로 「활성 패키지」를 거르는가 */
  const htmlNC = stripComments(SRC_HTML);
  check('Ⓕ-11 ③ 「활성 패키지」도 같은 판정으로 거른다(캘린더만 고치면 화면이 두 말을 한다)',
    /enrolls\.filter\(\s*e\s*=>\s*!enrCalHidden\(e\)\s*\)/.test(htmlNC), null);
  check('Ⓕ-12 짝) 그때 «왜 비었는지» 를 말한다(그냥 «—» 면 «없는 학생» 과 같아진다)',
    /_pkgSub/.test(htmlNC));
}

// ─────────────────────────────────────────────────────────────
console.log('\nⒼ ② 학생 명부 SQL — «신청 상태» 가 진짜 최신 신청서의 것인가 (진짜 SQLite)');
/* 🔴 그 조회는 SQLite 의 «MAX() 와 함께 적은 맨몸 컬럼은 그 최대 행에서 온다» 규칙에 기대고 있다
   (원래 주석이 `package` 에 대해 그렇게 적어 두었다). 여기에 `status` 를 하나 더 얹었으므로,
   **둘이 «같은 행» 에서 오는지**를 진짜 SQLite 로 확인한다 — 어긋나면 「최신 신청은 정규수업인데
   상태는 옛 신청의 것」이 되어, 멀쩡한 신청서가 명부에서 사라진다(고치려던 것의 반대 방향).
   ⚠️ 스키마는 손으로 적되 **이 조회가 실제로 읽는 칸만** 만든다 — prepare 가 통과하는 것 자체가
      「JOIN 을 붙였더니 ambiguous 로 죽는」 사고(규칙서)의 방어이기도 하다. */
if (DatabaseSync) {
  const i0 = SRC_ADMIN.indexOf('WITH page AS (');
  const i1 = SRC_ADMIN.indexOf('ORDER BY COALESCE(p.created_at,0) DESC, p._rid DESC`', i0);
  check('Ⓖ-0 전제: 명부 SQL 을 오려 냈다', i0 > 0 && i1 > i0);
  if (i0 > 0 && i1 > i0) {
    const sql = (SRC_ADMIN.slice(i0, i1) + 'ORDER BY COALESCE(p.created_at,0) DESC, p._rid DESC')
      .replace('${where}', 'WHERE s.user_id IS NOT NULL');
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE students_erp (user_id TEXT PRIMARY KEY, korean_name TEXT, student_name TEXT,
      username TEXT, english_name TEXT, school TEXT, grade TEXT, level TEXT, textbook TEXT,
      student_phone TEXT, parent_phone TEXT, kakao_id TEXT, status TEXT, signup_date TEXT, points INTEGER,
      created_at INTEGER, payment_type TEXT, end_date TEXT, classes_per_week INTEGER, teacher_phone TEXT,
      shop_name TEXT, hq_name TEXT, branch1_name TEXT, branch2_name TEXT, franchise TEXT)`);
    db.exec(`CREATE TABLE attendance (user_id TEXT, date TEXT)`);
    db.exec(`CREATE TABLE enrollments (id INTEGER PRIMARY KEY, student_user_id TEXT, package TEXT, status TEXT)`);
    db.prepare(`INSERT INTO students_erp (user_id, username, status) VALUES (?,?,?)`).run('jeong', '정우영', 'active');
    /* 옛 신청(취소) → 최신 신청(확정). 상태가 옛 행에서 오면 «확정» 이 아니라 «취소» 가 나온다 */
    db.prepare(`INSERT INTO enrollments (id,student_user_id,package,status) VALUES (?,?,?,?)`).run(54, 'jeong', '체험수업', 'cancelled');
    db.prepare(`INSERT INTO enrollments (id,student_user_id,package,status) VALUES (?,?,?,?)`).run(103, 'jeong', '정규수업', 'confirmed');
    let rows = null, err = null;
    try { rows = db.prepare(sql).all(); } catch (e) { err = String(e && e.message); }
    check('Ⓖ-1 그 SQL 이 진짜 SQLite 에서 실제로 컴파일·실행된다', !err, err);
    if (rows && rows.length) {
      const r = rows[0];
      check('Ⓖ-2 enroll_id 가 «최신» 신청이다', Number(r.enroll_id) === 103, r.enroll_id);
      check('Ⓖ-3 enroll_package 가 그 최신 신청의 것이다', r.enroll_package === '정규수업', r.enroll_package);
      check('Ⓖ-4 enroll_status 도 «같은 행» 에서 온다(옛 신청의 cancelled 가 아니다)',
        r.enroll_status === 'confirmed', r.enroll_status);
      /* ⛔ 짝) 학생 자신의 status 와 섞이지 않는다 — 이름이 같아 조용히 뒤바뀌기 쉽다 */
      check('Ⓖ-5 짝) 학생 status 와 신청 status 가 서로 다른 칸이다',
        r.status === 'active' && r.enroll_status === 'confirmed', { s: r.status, e: r.enroll_status });
    } else if (!err) {
      check('Ⓖ-2 전제: 행이 나왔다', false, rows);
    }
    db.close();
  }
}

console.log('\n결과: PASS ' + PASS + ' / FAIL ' + FAIL);
if (FAIL) { console.log('⚠ 실제 확인 필요:\n  - ' + FAILS.join('\n  - ')); process.exit(1); }
