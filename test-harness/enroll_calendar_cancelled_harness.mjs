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
check('Ⓑ-2 enrollments 를 도는 캘린더 루프가 2개다(주간·월간)', loops === 2, loops);
check('Ⓑ-3 그 루프 «전부» 가 판정을 부르고 건너뛴다', calls === loops && calls === 2, { loops, calls });

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
  const m = /SELECT substr\(source, 12\) AS enr_id[\s\S]*?GROUP BY source/.exec(SRC_ADMIN);
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
    if (typeof hidden === 'function') {
      const g = r1['103'];
      check('Ⓒ-7 서버 답을 그대로 화면 판정에 넣으면 «숨김» 이 된다',
        hidden({ status: 'confirmed', class_total: g.total, class_active: g.active }) === true);
      const g2 = r1['104'];
      check('Ⓒ-8 짝) 살아 있는 신청은 그대로 그려진다',
        hidden({ status: 'confirmed', class_total: g2.total, class_active: g2.active }) === false);
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
const blkM = /try \{\s*\n\s*const enrIds = items\.map[\s\S]*?\[enrollments\] 수업 수 조회 실패[^\n]*\n/.exec(SRC_ADMIN);
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
  const runBlk = async (items, rows) => {
    const f = new Function('items', 'env', 'console', 'return (async () => {' + js + '})();');
    await f(items, mkEnv(rows), { warn() {} });
    return items;
  };
  try {
    const items = [{ id: 103 }, { id: 104 }, { id: 999 }];
    await runBlk(items, [
      { enr_id: '103', total_n: 4, active_n: 0 },
      { enr_id: '104', total_n: 3, active_n: 2 },
    ]);
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

console.log('\n결과: PASS ' + PASS + ' / FAIL ' + FAIL);
if (FAIL) { console.log('⚠ 실제 확인 필요:\n  - ' + FAILS.join('\n  - ')); process.exit(1); }
