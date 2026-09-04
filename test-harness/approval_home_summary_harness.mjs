/*
 * 🧭 결재 맨 위 요약(D안) — 「아침에 30초」가 **사실을 말하는가** (2026-09-04)
 *
 *   [무엇이 걸려 있나]
 *     이 요약은 SQL 집계를 그대로 씁니다. C안(지출 정리)은 `canView` 를 못 걸어
 *     «행을 읽어 코드로» 셌는데, 여기는 범위를 **canView 가 무조건 통과시키는 두 가지**로만
 *     잡기 때문입니다 — ① 경영진 ② 본인이 올린 것.
 *     🔴 그 전제가 깨지면(예: 「본사 직원은 전체」) **인사·급여가 요약으로 샙니다.**
 *     그래서 그 조건을 «글자» 가 아니라 **진짜 SQLite 에 돌려** 확인합니다.
 *
 *   [짝으로 본다]
 *     「남의 것은 안 샌다」만 보면 **아무것도 안 세는 코드**가 통과합니다.
 *     그래서 「내 것은 실제로 센다」·「경영진은 전체를 본다」를 함께 셉니다.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, '..');
const SRC = join(ROOT, 'cloudflare-deploy/src');
const PUB = join(ROOT, 'cloudflare-deploy/public');

const P = await import(pathToFileURL(join(SRC, 'approval-policy.ts')).href);
const { foldHomeMoney, kstMonth, canView, isExec } = P;

const api = readFileSync(join(SRC, 'api-approval.ts'), 'utf8');
const work = readFileSync(join(PUB, 'work.html'), 'utf8');
const polSrc = readFileSync(join(SRC, 'approval-policy.ts'), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond, extra) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name + (extra ? ` — ${extra}` : '')); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${cond ? '' : (extra ? ` — ${extra}` : '')}`);
}
const cur = (list, c) => (list.find((x) => x.currency === c) || {}).total;

console.log('════════ 결재 맨 위 요약 하니스 ════════');

// ══ ① 달 눈금 ════════════════════════════════════════════════════════════
console.log('\n[①] KST 로 자르는가');
check('한국 자정 직후는 그날이 속한 달',
  kstMonth(Date.parse('2026-09-01T00:10:00+09:00')) === '2026-09',
  kstMonth(Date.parse('2026-09-01T00:10:00+09:00')));
check('한국 자정 직전은 앞 달',
  kstMonth(Date.parse('2026-08-31T23:50:00+09:00')) === '2026-08');

// ══ ② foldHomeMoney 를 실제로 돌린다 ═════════════════════════════════════
console.log('\n[②] 이번 달 · 올해로 접기');

const rows = [
  { cur: 'PHP', ym: '2026-09', n: 2, total: 3500, no_amt: 0 },
  { cur: 'KRW', ym: '2026-09', n: 1, total: 120000, no_amt: 0 },
  { cur: 'PHP', ym: '2026-08', n: 3, total: 700, no_amt: 1 },
  { cur: 'PHP', ym: '2025-09', n: 9, total: 999999, no_amt: 0 },   // 작년 — 안 세야 한다
];
const f = foldHomeMoney(rows, '2026-09');

check('이번 달 PHP 합계', cur(f.month, 'PHP') === 3500, JSON.stringify(f.month));
check('이번 달 KRW 도 따로', cur(f.month, 'KRW') === 120000);
check('⛔ 통화를 더한 숫자를 만들지 않는다', !f.month.some((b) => b.total === 123500));
check('올해는 이번 달 + 지난달', cur(f.year, 'PHP') === 4200, JSON.stringify(f.year));
check('⛔ 작년은 안 센다 (짝 검사 — 전부 세는 코드는 여기서 걸린다)',
  cur(f.year, 'PHP') === 4200 && f.year_count === 6, JSON.stringify([cur(f.year, 'PHP'), f.year_count]));
check('건수도 맞다 (이번 달 3 · 올해 6)', f.month_count === 3 && f.year_count === 6,
  JSON.stringify([f.month_count, f.year_count]));
check('금액 없는 건을 따로 센다 (0원으로 때우지 않는다)',
  f.month_no_amount === 0 && f.year_no_amount === 1,
  JSON.stringify([f.month_no_amount, f.year_no_amount]));

console.log('\n[②-2] 이상한 값');
check('빈 배열이어도 안 터진다', foldHomeMoney([], '2026-09').year_count === 0);
check('null 을 넘겨도 안 터진다', foldHomeMoney(null, '2026-09').year_count === 0);
check('total 이 NULL 이어도 건수·금액없음은 그대로 센다', (() => {
  const r = foldHomeMoney([{ cur: 'PHP', ym: '2026-09', n: 2, total: null, no_amt: 2 }], '2026-09');
  return (cur(r.month, 'PHP') || 0) === 0 && r.month_count === 2 && r.month_no_amount === 2;
})());
/* 🔴 못 읽는 값이 합계에 섞이면 화면에 «NaN» 이 뜬다 — 숫자가 아예 안 나오는 것보다
   나쁘다(사람이 고장으로 읽고, 그 옆의 맞는 숫자까지 못 믿게 된다). */
check('금액이 글자면 합계가 NaN 이 되지 않는다', (() => {
  const r = foldHomeMoney([{ cur: 'PHP', ym: '2026-09', n: 1, total: 'abc' }], '2026-09');
  const v = cur(r.month, 'PHP');
  return v === 0 && !isNaN(v);
})());
check('음수 금액도 합계를 깎지 않는다', (() => {
  const r = foldHomeMoney([{ cur: 'PHP', ym: '2026-09', n: 1, total: -500 }], '2026-09');
  return cur(r.month, 'PHP') === 0;
})());
check('통화를 안 적었으면 기본 통화로 (버리지 않는다)',
  cur(foldHomeMoney([{ ym: '2026-09', n: 1, total: 5 }], '2026-09').month, 'PHP') === 5);
check('달이 비면 세지 않는다 (엉뚱한 달로 넣지 않는다)',
  foldHomeMoney([{ cur: 'PHP', ym: '', n: 1, total: 5 }], '2026-09').year_count === 0);

// ══ ③ 🔴 범위 조건을 진짜 SQL 로 확인한다 ════════════════════════════════
console.log('\n[③] 범위 — 남의 인사·급여가 새지 않는가 (진짜 SQLite)');

let DatabaseSync;
try { ({ DatabaseSync } = await import('node:sqlite')); } catch { DatabaseSync = null; }
if (!DatabaseSync) {
  console.log('  ⏭  node:sqlite 없음 — 이 절은 SQL 을 실제로 돌려야 뜻이 있습니다.');
} else {
  /* 소스에서 그 SQL 을 **오려 내 실제로 평가**합니다 — 베껴 적으면 정본을 고쳐도 검사가
     안 바뀝니다. ⚠️ 그 SQL 은 삼항 연산자로 나뉜 템플릿이라 «글자» 로 오리면 JS 조각이
     그대로 섞여 SQLite 가 문법 오류를 냅니다. 식 전체를 잘라 `new Function` 으로
     **범위 조건까지 정본이 만들게** 합니다. */
  const at = api.indexOf("const st = env.DB.prepare(");
  let build = null;
  if (at >= 0) {
    const b0 = api.indexOf('`', at);
    // 마지막 백틱은 그 prepare 호출을 닫는 `\n      );` 앞이다
    const close = api.indexOf('\n      );', b0);
    const expr = api.slice(b0, close);
    /* 그 식이 쓰는 «바깥 값» 을 여기서 넘긴다.
       ⚠️ 소스에 새 변수가 끼어들면 호출할 때 ReferenceError 가 난다 — 그러면 **검사가
          통째로 죽어** 무엇이 깨졌는지 안 보인다(2026-09-04 실측). 아래에서 감싸
          «깔끔한 FAIL» 로 만든다. 그때 여기에 그 변수를 더해 주면 된다. */
    const YMD = "spent_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'";
    try {
      const fn = new Function('sumAll', 'YMD', 'return ' + expr);
      build = (all) => fn(all, YMD);
      String(build(true));                       // 지금 바로 한 번 돌려 본다
    } catch (e) { build = null; }
  }
  check('요약 SQL 식을 소스에서 오려 내 평가했다 (전제 — 못 하면 아래가 헛돈다)',
    !!build && /GROUP BY cur, ym/.test(String(build(true))), build ? '평가됨' : '못 함');

  if (build) {
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE approval_requests (
      id INTEGER PRIMARY KEY, req_type TEXT, requester_username TEXT,
      status TEXT, amount REAL, currency TEXT, spent_at TEXT, created_at INTEGER)`);
    const KST = (d) => Date.parse(d + 'T00:00:00+09:00') + 12 * 3600_000;
    const ins = db.prepare(`INSERT INTO approval_requests
      (id, req_type, requester_username, status, amount, currency, spent_at, created_at)
      VALUES (?,?,?,?,?,?,?,?)`);
    ins.run(1, 'expense',  'mgr_lby', 'approved', 1000,   'PHP', '2026-09-02', KST('2026-09-02'));
    ins.run(2, 'hr',       'admin',   'approved', 750000, 'KRW', null,         KST('2026-09-03'));
    ins.run(3, 'purchase', 'mgr_karl','approved', 2000,   'PHP', null,         KST('2026-09-03'));
    ins.run(4, 'expense',  'mgr_lby', 'pending',  9999,   'PHP', null,         KST('2026-09-03'));

    /* 🔴 범위 조건도 **정본이 만든 것**을 쓴다 — 여기서 손으로 적으면
       「본사 직원은 전체」로 넓히는 변이를 이 검사가 못 봅니다. */
    const sqlMine = String(build(false));
    const sqlAll  = String(build(true));
    /* 「금액 없음」을 좁히는 목록도 정본에서 만든다 — 손으로 적으면 분류를 늘릴 때 어긋난다.
       ⚠️ IN (?,?,…) 가 아니라 «콤마 문자열 한 개» 다(D1 바인드 한도 규칙). */
    const SPENDCSV = ',' + P.TYPES.filter((t) => t.wantsCategory).map((t) => t.key).join(',') + ',';
    check('두 범위의 SQL 이 실제로 다르다 (전제 — 같으면 아래 짝 검사가 뜻을 잃는다)',
      sqlMine !== sqlAll && /requester_username/.test(sqlMine) && !/requester_username/.test(sqlAll),
      JSON.stringify([sqlMine.includes('requester_username'), sqlAll.includes('requester_username')]));
    /* ⚠️ 깔끔한 FAIL 로 남긴다 — 범위 조건이 사라지면 바인드 수가 안 맞아 prepare 가
       던지는데, 감싸지 않으면 **검사가 통째로 죽어** 무엇이 깨졌는지 안 보인다
       (2026-09-04 변이시험에서 실제로 그랬다). */
    const runMine = (u) => { try { return db.prepare(sqlMine).all(SPENDCSV, u); } catch (e) { return null; } };
    const runAll = () => { try { return db.prepare(sqlAll).all(SPENDCSV); } catch (e) { return null; } };

    // ⓐ 직원(경영진 아님) → 본인 것만
    const lbyRows = runMine('mgr_lby');
    check('본인 범위 SQL 이 실제로 돈다 (전제)', !!lbyRows, lbyRows ? 'ok' : '실행 실패');
    const lby = foldHomeMoney(lbyRows || [], '2026-09');
    check('직원은 «내가 올린 것» 만 센다', cur(lby.month, 'PHP') === 1000, JSON.stringify(lby.month));
    check('⛔ 남의 인사·급여(KRW 750,000)가 안 섞인다',
      (cur(lby.month, 'KRW') || 0) === 0, JSON.stringify(lby.month));
    check('⛔ 남의 물품(PHP 2,000)도 안 섞인다', cur(lby.month, 'PHP') === 1000);
    check('⛔ 대기 중인 건은 «승인» 에 안 들어간다', cur(lby.month, 'PHP') === 1000);

    // ⓑ 경영진 → 전체
    const allRows = runAll();
    check('전체 범위 SQL 이 실제로 돈다 (전제)', !!allRows, allRows ? 'ok' : '실행 실패');
    const all = foldHomeMoney(allRows || [], '2026-09');
    check('경영진은 전체를 센다 (짝 검사 — 전부 막는 코드는 여기서 걸린다)',
      cur(all.month, 'PHP') === 3000 && cur(all.month, 'KRW') === 750000,
      JSON.stringify(all.month));

    /* 🔴 그 전제를 코드로도 확인한다 — canView 가 정말 그 둘을 통과시키는가.
       (SQL 이 맞아도 canView 전제가 틀리면 이 설계 자체가 무너진다) */
    const execActor  = { ok: true, username: 'admin', scopeType: 'hq' };
    const staffActor = { ok: true, username: 'mgr_lby', scopeType: 'hq' };
    check('전제 — 경영진은 인사·급여를 볼 수 있다',
      isExec(execActor) && canView(execActor, 'hr', 'someone', [], false));
    check('전제 — 경영진은 chain 도 본다', canView(execActor, 'expense', 'someone', [], false));
    check('전제 — 본인이 올린 것은 누구나 본다',
      canView(staffActor, 'hr', 'mgr_lby', [], false));
    check('전제 — 직원은 남의 인사·급여를 못 본다 (그래서 scope=mine 이어야 한다)',
      !canView(staffActor, 'hr', 'admin', [], false));

    /* 🔴 2026-09-04 함정 대조 — 「경영진은 세 열람등급을 전부 통과한다」는 **그대로는 거짓**이다.
       broadcast 분기는 isExec 가 아니라 **isHqStaff** 를 본다(실측: role 없는 exec 는 false).
       실제로 성립하는 이유는 ⓐ 운영 경영진이 본사 계정이고 ⓑ 라우트 가드가 본사 계정이
       아니면 403 이라 여기 닿지 못하기 때문이다. 둘 다 못 박는다 — 하나라도 바뀌면 FAIL. */
    const execHq   = { ok: true, username: 'admin', role: 'hq' };
    const execBare = { ok: true, username: 'admin', scopeType: 'hq' };   // 본사 계정이 아님
    check('전제 — 본사 계정인 경영진은 broadcast(긴급)까지 본다',
      canView(execHq, 'urgent', 'other', [], false));
    check('⚠️ 그런데 «경영진이기만» 해서는 broadcast 를 못 본다 (주석이 과장이 아닌지 확인)',
      isExec(execBare) && !canView(execBare, 'urgent', 'other', [], false));
    check('그래서 라우트 가드가 본사 계정이 아니면 403 으로 막는다 (이 전제를 떠받치는 자리)',
      /if \(!isHqStaff\(actor\) && !actor\.isTeacher\)[\s\S]{0,220}?403\)/.test(api));
    check('⛔ 주석이 그 사정을 적어 두었다 (다음 사람이 이 자리를 다시 재지 않게)',
      /broadcast 분기는 isExec 를[\s\S]{0,200}isHqStaff/.test(polSrc));

    // ⓒ 달 경계 — 지출일이 있으면 그것으로
    ins.run(5, 'expense', 'mgr_lby', 'approved', 55, 'PHP', '2026-08-31', KST('2026-09-01'));
    const lby2 = foldHomeMoney(runMine('mgr_lby') || [], '2026-09');
    check('지출일이 지난달이면 이번 달에 안 들어간다 (지출 정리와 같은 규칙)',
      cur(lby2.month, 'PHP') === 1000, JSON.stringify(lby2.month));
    check('그래도 올해에는 들어간다', cur(lby2.year, 'PHP') === 1055, JSON.stringify(lby2.year));
  }
}

// ══ ③-2 운영 실데이터 (2026-09-04 실측) ═════════════════════════════════
console.log('\n[③-2] 운영 실데이터 — 사장님(경영진) 화면이 오늘 말할 숫자');
/* 그날 운영 D1 에 위 SQL 을 그대로 돌려 나온 값이다. 「그럴듯한 예시」가 아니라
   **실제 결과**라, 화면이 오늘 무엇을 보여 줄지가 여기서 그대로 나온다. */
const REAL = foldHomeMoney([
  { cur: 'PHP', ym: '2026-08', n: 1, total: 1, no_amt: 0 },
  { cur: 'PHP', ym: '2026-09', n: 1, total: 2800, no_amt: 0 },
], '2026-09');
check('이번 달 승인 ₱2,800 (1건)', cur(REAL.month, 'PHP') === 2800 && REAL.month_count === 1,
  JSON.stringify(REAL.month));
check('올해 누적 ₱2,801 (2건)', cur(REAL.year, 'PHP') === 2801 && REAL.year_count === 2,
  JSON.stringify(REAL.year));
check('통화가 하나뿐이라 줄도 하나 (KRW 를 지어내지 않는다)', REAL.year.length === 1);
check('금액 없는 승인은 0건', REAL.year_no_amount === 0);

// ══ ④ 배선 ═══════════════════════════════════════════════════════════════
console.log('\n[④] 배선');

const workJs = work.replace(/<!--[\s\S]*?-->/g, '');
/* ⚠️ 범위를 «앞 N자» 로 자르지 않는다 — 함수가 길어지면 조용히 통과·실패가 뒤집힌다.
   그 함수만 **중괄호 짝**으로 잘라 그 «안» 을 본다(CLAUDE.md 2장). */
function fnBody(src, head) {
  const at = src.indexOf(head);
  if (at < 0) return '';
  let i = src.indexOf('{', at), d = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (d === 0) { i++; break; } }
  }
  return src.slice(at, i);
}

check('범위는 경영진일 때만 전체 (⛔ 본사 직원 전체로 넓히지 않았다)',
  /const sumAll = iAmExec;/.test(api));
check('그 밖에는 본인 조건을 SQL 에 건다',
  /sumAll \? '' : ' AND requester_username = \?'/.test(api));
check('화면이 어느 범위인지 말한다 (같은 타일에서 다른 숫자를 본다)',
  /money_scope/.test(api) && /money_scope === 'all'/.test(work));
check('「진행 중」은 정확한 수로 센다 (최근 15건으로 세지 않는다)',
  /SELECT COUNT\(\*\) AS c FROM approval_requests\s*\n\s*WHERE requester_username = \? AND status = 'pending'/.test(api));
check('「진행 중」은 언제나 내 것 (경영진도 전체로 넓히지 않는다)',
  !/sumAll[\s\S]{0,120}status = 'pending'/.test(api));
/* 🔴 「몇 건에서 찾았나」는 **진행 중인 것 중 화면에 있는 수** 여야 한다.
   mine.length(상태 무관 최근 15건)로 비교하면 my_open 과 모집단이 달라 두 방향으로 거짓이 된다
   (2026-09-04 함정 대조 지적) — ⓐ 최근 15건이 전부 승인·반려면 **침묵** ⓑ 그중 대기가 6건뿐이면 「15건 봤다」. */
check('「멈춤」을 «진행 중인 것 중 화면에 있는 수» 로 센다',
  /my_open_shown:\s*mine\.filter\(\(m: any\) => m\.status === 'pending'\)\.length/.test(api));
/* ⚠️ 「파일 어딘가에 그 이름이 있는가」로 쓰면 **내가 쓴 주석이 자기 검사를 통과시킵니다**
   (실측: `sm.mine_shown` 으로 되돌리는 변이가 그대로 통과 — 바로 위 주석에 그 낱말이 있어서).
   그래서 판정은 **그 값을 정하는 대입문 한 줄**로 합니다. */
const seenLine = (work.split('\n').find(l => /var seen\s*=/.test(l) && !/^\s*(\/\/|\*)/.test(l)) || '');
check('「몇 건에서 찾았나」를 정하는 줄을 찾았다 (전제 — 못 찾으면 아래가 헛돈다)',
  seenLine.length > 0);
check('화면도 그 값으로 비교한다 (mine_shown 이 아니라)',
  /sm\.my_open > seen/.test(work) && /sm\.my_open_shown/.test(seenLine));
check('⛔ 그 줄이 mine_shown 을 읽지 않는다',
  !/mine_shown/.test(seenLine));

/* 🔴 그 안내는 경고 상자 «밖» 에 있어야 한다 — 상자 안에 두면 창 안에 멈춘 건이 없을 때
   상자가 통째로 안 그려져 그 말까지 사라진다(정작 그때가 알려야 할 때다). */
const paintTopBody = fnBody(workJs, 'function paintTop()');
const paintChrome = fnBody(workJs, 'function paintRepChrome()') || '';
const stopBranch = paintTopBody.slice(0, paintTopBody.indexOf('stopHost.innerHTML = h;'));
check('paintTop 을 잘라 냈다 (전제)', paintTopBody.length > 500, paintTopBody.length + '자');
check('「창 밖은 못 봤다」가 경고 상자 «밖» 에 있다 (없을 때가 정작 필요한 때다)',
  stopBranch.indexOf('my_open > seen') < 0 && paintTopBody.indexOf('my_open > seen') > 0);

/* 조회가 실패하면 «0» 이 아니라 «모른다» — C안의 steps_missing 과 같은 자리. */
check('조회 실패를 내려보낸다', /money_unknown: moneyFailed/.test(api) && /open_unknown: openFailed/.test(api));
check('화면이 «0건» 대신 «—» 로 적는다',
  /sm\.money_unknown/.test(work) && /openN == null \? '—'/.test(work));
check('결재함 20건 상한을 알려 준다 (정확한 수처럼 보이지 않게)',
  /inbox_capped: inbox\.length >= 20/.test(api) && /inboxCap \? '\+' : ''/.test(work));

/* 🔴 「금액 없음」은 돈이 나가는 분류에서만 — 긴급·휴가·문서는 원래 금액이 없다.
   그것까지 세면 같은 화면의 지출 정리(C안)와 다른 숫자를 말한다. */
check('「금액 없음」을 돈이 나가는 분류로 좁힌다',
  /instr\(\?, ',' \|\| req_type \|\| ','\) > 0/.test(api));
check('그 목록을 정본(TYPES.wantsCategory)에서 만든다 (손으로 적지 않는다)',
  /TYPES\.filter\(t => t\.wantsCategory\)\.map\(t => t\.key\)/.test(api));
check('⛔ IN (?,?,…) 자리표시자를 만들지 않는다 (D1 바인드 한도 규칙)',
  !/map\(\(\) => '\?'\)/.test(api));
check('spent_at 형식을 SQL 이 거른다 (날짜가 아니면 올린 날로 — C안 monthOf 와 같은 판정)',
  /spent_at GLOB '\[0-9\]\[0-9\]\[0-9\]\[0-9\]-\[0-9\]\[0-9\]-\[0-9\]\[0-9\]'/.test(api));

/* 🔴 요약 조회는 304 «뒤» 에 — 앞에 두면 캐시로 끝나는 요청마다 GROUP BY 가 돈다. */
const i304 = api.indexOf("return new Response(null, { status: 304, headers });");
const iMoney = api.indexOf('const moneyRows = await safe');
const iOpen = api.indexOf('const openRow: any = await safe');
check('요약 조회가 304 반환 «뒤» 에 있다 (본문 0바이트 설계를 지킨다)',
  i304 > 0 && iMoney > i304 && iOpen > i304, `304@${i304} · money@${iMoney} · open@${iOpen}`);
check('응답 모양이 바뀌었으니 ETag 를 올렸다', (() => {
  const em = api.match(/W\/"a(\d+)-/);
  return !!em && Number(em[1]) >= 6;
})(), (api.match(/W\/"a(\d+)-/) || [])[0]);

/* ⛔ 손봐야 할 것이 없으면 그 줄을 아예 안 그린다 — 늘 뜨는 경고는 아무도 안 읽는다. */
check('손봐야 할 것이 없으면 경고 줄을 안 그린다',
  /if \(!stuck\.length\) \{\s*\n?\s*stopHost\.innerHTML = '';/.test(workJs));
/* ⚠️ 「앞 600자» 로 자르면 함수가 길어질 때 뒤쪽 fetch 를 못 본다(CLAUDE.md 2장).
   함수를 **중괄호 짝**으로 잘라 그 «안» 전체를 본다. */
check('맨 위 요약은 서버를 따로 부르지 않는다 (첫 화면 API 한 번)',
  fnBody(workJs, 'function paintTop()').indexOf('fetch(') < 0);
check('통화는 지출 정리와 같은 함수로 그린다 (규칙이 두 벌이 되지 않게)',
  /repMoney\(sm\.money\.month\)/.test(workJs));
check('멈춘 것을 지연보다 먼저 보여 준다 (지연은 기다리면 풀리지만 멈춤은 안 풀린다)',
  /a\.why === 'blocked' \? 0 : 1/.test(workJs));
const topGoBody = fnBody(workJs, 'window.topGo = function');
check('topGo 함수를 잘라 냈다 (전제)', topGoBody.length > 50, topGoBody.length + '자');
/* 🔴 한 화면이 «같은 말» 을 하는가 — 타일이 «전체» 인 사람에게 아래 지출 정리가
   «내가 올린 것» 으로 열리면 두 숫자가 다르게 보인다(2026-09-04 함정 대조). */
check('맨 위 타일이 «전체» 인 사람에게는 지출 정리도 «전체» 로 연다',
  /money_scope === 'all'/.test(paintChrome) && /sc\.value = 'all'/.test(paintChrome));
check('⛔ 사람이 이미 고른 값은 덮어쓰지 않는다',
  /var had = sc\.value/.test(paintChrome) && /if \(had\) sc\.value = had/.test(paintChrome));
check('⛔ 결재자 전원에게 «전체» 를 기본으로 주지는 않는다 (그 «전체» 는 타일과 다른 수다)',
  /D\.can_approve/.test(paintChrome));

check('그 건이 화면에 없으면 문서함으로 안내한다 (「눌러도 아무 일도 없음」 방지)',
  /toggleFind/.test(topGoBody) && /toast\(/.test(topGoBody));

console.log('\n──────────────────────────────────────');
if (FAIL) {
  console.log(`  ❌ ${FAIL}건 실패 / ${PASS + FAIL}건`);
  for (const f of FAILS) console.log('     ' + f);
  process.exit(1);
}
console.log(`  ✅ ${PASS}건 전부 통과 — 요약이 사실을 말합니다.`);
