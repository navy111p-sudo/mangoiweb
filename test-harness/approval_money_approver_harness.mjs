// -*- coding: utf-8 -*-
// 💳 결재권자 · 전결 · 확인 하니스 (의존성 없음 · node 로 바로 실행)
//   실행:  node test-harness/approval_money_approver_harness.mjs
//   대상:  cloudflare-deploy/src/approval-policy.ts · api-approval.ts · public/work.html
//
// ── 왜 이 파일이 있나 (2026-09-09 사장님 지시) ────────────────────────────────
//   「결재는 장지웅 부장이 하고, ₱5,000 미만이면 나는 확인만 하게 해줘.」
//
//   그전에는 돈이 나가는 결재의 1단계가 'staff'(본사 사람 아무나)였다. 그래서 필리핀에서
//   올라온 건이 대표님 화면에도 떴고, 실측상 물품 3건(₱2,500·₱4,600·₱2,800)을 **대표님이
//   혼자** 찍고 계셨다. 게다가 장 부장이 경영진 명단(EXEC_USERNAMES)에도 있어서 **전결**이
//   걸려, 큰돈 건조차 그가 1단계를 누르는 순간 2단계가 «건너뜀»으로 닫혔다
//   ⟹ 대표님 차례가 아예 열리지 않았다.
//
// ── 이 검사가 지키는 것 ──────────────────────────────────────────────────────
//   A. 결재선   — 물품·지출의 첫 도장은 «지정 결재권자»가 찍는다
//   B. 누가 누를 수 있나 — 결재권자 O · 경영진은 «대신» O · 그 밖의 본사 X · 필리핀 X
//   C. 누구에게 알리나   — 주 결재자에게만(경영진에게 알림이 가면 지시가 화면에서만 참이 된다)
//   D. 전결     — 물품·지출에서는 꺼져 있다 (인사·급여에서는 켜져 있다 ← 짝으로 본다)
//   E. 확인     — 「봤다」는 도장이 언제 뜨고 언제 안 뜨는가
//   F. 배선     — 서버·화면이 위 판정을 **실제로 부르는가**
//
// ── ⚠️ 이 파일을 고칠 때 ────────────────────────────────────────────────────
//   · 「막는다」와 「안 막는다」를 **반드시 짝으로** 둔다. 한쪽만 두면 «전부 막기»·
//     «전부 열기» 같은 반대 방향 사고가 그대로 통과한다.
//   · 사람 이름·역할 이름을 글자 그대로 못 박지 않는다. 정본 상수를 **읽어서** 쓴다
//     (2026-09-04 에 계정명을 박아 뒀다가 그 사람이 경영진이 되자 멀쩡한 코드가 FAIL 났다).

import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dir, '../cloudflare-deploy/src');
const POLICY_PATH = join(SRC, 'approval-policy.ts');
const P = await import(pathToFileURL(POLICY_PATH).href);

const {
  stagesFor, canDecideStage, isPrimaryApprover, isMoneyApprover,
  allowsStraightThrough, needsExecAck, isExec,
  blocksSameDecider, sameDeciderBlocked,
  MONEY_APPROVERS, EXEC_USERNAMES, TWO_STEP_THRESHOLD, TYPES,
} = P;

const API_SRC    = readFileSync(join(SRC, 'api-approval.ts'), 'utf8');
const POLICY_SRC = readFileSync(POLICY_PATH, 'utf8');
const WORK_SRC   = readFileSync(resolve(__dir, '../cloudflare-deploy/public/work.html'), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond, extra) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name + (extra ? ` — ${extra}` : '')); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${cond ? '' : (extra ? ` — ${extra}` : '')}`);
}

/* 중괄호 짝으로 «그 함수·그 라우트» 만 잘라 낸다 — 파일 전체에서 찾으면 딴 코드가 걸린다.
   ⚠️ 길이(slice(i, i+N))로 자르면 옆 함수가 딸려 들어온다(CLAUDE.md 2장). */
function blockFromSrc(src, anchorRe) {
  const m = src.match(anchorRe);
  if (!m) return '';
  /* ⚠️ TypeScript 는 «인자 목록»·«반환 타입» 안에도 { 가 나온다
     (Array<{ id: number }> · Promise<{ ok: boolean }>). 그냥 첫 { 를 잡으면
     타입을 몸통으로 오해해 엉뚱한 조각을 자른다(CLAUDE.md 2장 — 실제로 밟았다).
     ⟹ 괄호·꺾쇠 깊이가 0인 { 만 몸통으로 인정한다. */
  let i = -1, par = 0, ang = 0;
  for (let j = m.index + m[0].length - 1; j < src.length; j++) {
    const c = src[j];
    if (c === '(') par++;
    else if (c === ')') par--;
    else if (c === '<') ang++;
    else if (c === '>') { if (ang > 0) ang--; }
    else if (c === '{' && par <= 0 && ang <= 0) { i = j; break; }
  }
  if (i < 0) return '';
  let d = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') { d--; if (!d) return src.slice(i, j + 1); }
  }
  return '';
}

/* ── 등장인물 ──────────────────────────────────────────────────────────────
   ⛔ 계정명을 손으로 적지 않는다 — 정본 상수에서 골라 온다. */
const APPROVER_UID = String(MONEY_APPROVERS[0] || '');
/** 경영진이면서 결재권자는 «아닌» 계정 — 대표님 자리. */
const EXEC_UID = EXEC_USERNAMES.find(u => !MONEY_APPROVERS.includes(u));
/** 본사인데 경영진도 결재권자도 아닌 계정 — 「그 밖의 직원」 자리. */
const PLAIN_CANDIDATES = ['mgr_lby', 'mgr_staff', 'hq_office'];
const PLAIN_UID = PLAIN_CANDIDATES.find(u => !EXEC_USERNAMES.includes(u) && !MONEY_APPROVERS.includes(u));

const hq = (u, name) => ({ ok: true, username: u, name: name || u, role: 'hq', isTeacher: false });
const approver = hq(APPROVER_UID, '장 부장');
const boss     = hq(EXEC_UID, '대표');
const plain    = hq(PLAIN_UID, '본사 직원');
const phMgr    = hq('mgr_melca', 'Melca');
const teacher  = { ok: true, username: 'mangoi_018', name: 'Teacher Far', role: 'teacher', isTeacher: true };

const PHP_LIMIT = Number(TWO_STEP_THRESHOLD.PHP);
const SMALL = PHP_LIMIT - 100;     // ₱4,900 — 화면의 ₱2,500·₱4,600 과 같은 자리
const BIG   = PHP_LIMIT + 100;     // ₱5,100

console.log('════════ 결재권자 · 전결 · 확인 하니스 ════════');

/* ═══════════════════════════════════════════════════════════════════════════
 * ⓪ 전제 — 이 검사가 헛돌 수 있는 조건부터 막는다
 * ═════════════════════════════════════════════════════════════════════════ */
console.log('\n[⓪] 전제 — 등장인물을 실제로 고를 수 있는가');
check('결재권자 명단이 비어 있지 않다 (비면 아래 검사가 통째로 뜻을 잃는다)',
  MONEY_APPROVERS.length > 0, JSON.stringify(MONEY_APPROVERS));
check('경영진이면서 결재권자가 아닌 계정을 고를 수 있다',
  !!EXEC_UID, `EXEC=${JSON.stringify(EXEC_USERNAMES)} MONEY=${JSON.stringify(MONEY_APPROVERS)}`);
check('경영진도 결재권자도 아닌 본사 계정을 고를 수 있다', !!PLAIN_UID);
check('결재권자가 실제로 결재권자로 판정된다', isMoneyApprover(approver) === true);
check('그 밖의 본사 직원은 결재권자가 아니다', isMoneyApprover(plain) === false);

/* ═══════════════════════════════════════════════════════════════════════════
 * Ⓐ 결재선 — 돈이 나가는 건의 첫 도장은 «결재권자»
 * ═════════════════════════════════════════════════════════════════════════ */
console.log('\n[Ⓐ] 결재선 — 물품·지출의 첫 단계');
for (const k of ['purchase', 'expense']) {
  const small = stagesFor(k, SMALL, 'PHP');
  const big = stagesFor(k, BIG, 'PHP');
  check(`${k} 소액 — 1단계이고 결재권자가 찍는다`,
    small.length === 1 && small[0].role === 'mgr', JSON.stringify(small));
  check(`${k} 고액 — 결재권자 → 경영진 2단계`,
    big.length === 2 && big[0].role === 'mgr' && big[1].role === 'exec', JSON.stringify(big));
}
/* 🔴 짝 — 돈이 아닌 분류까지 결재권자에게 몰리면 안 된다.
      (그러면 문서·휴가까지 장 부장 한 사람이 병목이 된다) */
for (const k of ['doc', 'leave', 'complaint']) {
  check(`${k} 는 결재권자 단계가 아니다 (돈이 아닌 분류까지 몰지 않는다)`,
    stagesFor(k, null, 'PHP').every(s => s.role !== 'mgr'), JSON.stringify(stagesFor(k, null, 'PHP')));
}
check('인사·급여는 예전 그대로 경영진 1단계',
  (() => { const s = stagesFor('hr', null, 'KRW'); return s.length === 1 && s[0].role === 'exec'; })());
check('금액을 모르면 큰 건으로 본다 (한 번 더 보는 쪽)',
  stagesFor('purchase', null, 'PHP').length === 2);

/* ═══════════════════════════════════════════════════════════════════════════
 * Ⓑ 누가 누를 수 있나 — canDecideStage
 * ═════════════════════════════════════════════════════════════════════════ */
console.log('\n[Ⓑ] 결재 권한 — mgr 단계');
check('결재권자는 누를 수 있다', canDecideStage(approver, 'mgr', false) === true);
check('경영진은 «대신» 누를 수 있다 (부재중에 멈추지 않게)',
  canDecideStage(boss, 'mgr', false) === true);
check('그 밖의 본사 직원은 누를 수 없다', canDecideStage(plain, 'mgr', false) === false);
check('필리핀 매니저는 누를 수 없다 (올리는 쪽이다)',
  canDecideStage(phMgr, 'mgr', true) === false);
check('강사는 누를 수 없다', canDecideStage(teacher, 'mgr', false) === false);
/* 짝 — 옛 단계(staff)의 뜻이 바뀌지 않았는가. 이미 쌓인 결재가 그 역할로 박혀 있다. */
check('옛 staff 단계는 그대로 — 본사 직원이 누를 수 있다',
  canDecideStage(plain, 'staff', false) === true);
check('옛 exec 단계는 그대로 — 결재권자라도 경영진이 아니면 못 누른다',
  canDecideStage(hq('nobody_x', '아무개'), 'exec', false) === false);

/* 🔎 명단이 비면 «막지 않는» 쪽으로 실패하는가 — 사본을 만들어 **실제로 돌린다**.
      (문자열로 「그 조건이 있는가」만 보면, 조건을 뒤집어도 그 글자가 남아 통과한다) */
console.log('\n[Ⓑ-2] 결재권자 명단이 비었을 때 — 막지 않는 쪽으로 실패하는가');
{
  /* ⛔ 운영 소스 디렉터리(src/)에 쓰지 않는다 — 프로세스가 죽으면 남고,
        그 상태로 tsc·번들이 그 파일을 함께 읽는다(2026-09-09 함정 대조 지적).
        approval-policy.ts 는 import 가 없는 순수 파일이라 어디서든 돌아간다. */
  const tmp = join(tmpdir(), `__ha_empty_${Date.now()}.ts`);
  try {
    const patched = POLICY_SRC.replace(
      /export const MONEY_APPROVERS = \[[^\]]*\];/,
      'export const MONEY_APPROVERS: string[] = [];'
    );
    check('사본을 실제로 만들었다 (치환이 먹었는지 — 안 먹으면 아래가 헛돈다)',
      patched !== POLICY_SRC);
    writeFileSync(tmp, patched, 'utf8');
    const E = await import(pathToFileURL(tmp).href);
    check('명단이 비면 본사 직원도 누를 수 있다 (옛 동작으로 되돌아간다)',
      E.canDecideStage(plain, 'mgr', false) === true);
    check('명단이 비어도 필리핀 매니저는 여전히 못 누른다',
      E.canDecideStage(phMgr, 'mgr', true) === false);
    check('명단이 비면 알림도 옛 동작 — 본사 직원이 주 결재자가 된다',
      E.isPrimaryApprover(plain, 'mgr', false) === true);
  } finally {
    try { rmSync(tmp, { force: true }); } catch { /* 지워지면 그만 */ }
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Ⓒ 누구에게 알리나 — isPrimaryApprover
 * ═════════════════════════════════════════════════════════════════════════ */
console.log('\n[Ⓒ] 알림 대상 — «누를 수 있는 사람» 과 다르다');
check('결재권자는 알림을 받는다', isPrimaryApprover(approver, 'mgr', false) === true);
check('경영진은 mgr 단계 알림을 받지 않는다 (대신 누를 수는 있어도)',
  isPrimaryApprover(boss, 'mgr', false) === false);
check('그래도 경영진은 exec 단계 알림은 받는다 (짝 — 전부 끄면 결재가 멈춘다)',
  isPrimaryApprover(boss, 'exec', false) === true);
check('본사 직원은 staff 단계 알림을 받는다 (옛 동작 유지)',
  isPrimaryApprover(plain, 'staff', false) === true);
check('못 누르는 사람은 알림도 못 받는다',
  isPrimaryApprover(phMgr, 'mgr', true) === false);

/* 🔴 [Ⓒ-2] «결재권자 본인이 올린 건» — 알림이 아무에게도 안 가지 않는가.
     approversFor 는 기안자를 제외한다(자기 건은 자기가 결재 못 함). 그래서 주 결재자가
     그 한 사람뿐이면 목록이 **0명** 이 된다. 그때 화면의 「이대로는 처리되지 않습니다」는
     approverCounts(canDecideStage) 기준이라 **뜨지도 않는다** ⟹ 조용히 아무도 모른다.
     ⚠️ 문자열로 「isPrimaryApprover 를 부르는가」만 보면 이 구멍을 원리상 못 본다.
        그래서 함수를 **소스에서 오려 내 실제로 돌린다**. */
console.log('\n[Ⓒ-2] 결재권자 «본인» 이 올렸을 때 — 알림이 사라지지 않는가');
{
  const decl = /async function approversFor\([^)]*\)[^{]*\{/.exec(API_SRC);
  check('approversFor 를 소스에서 찾았다 (못 찾으면 아래가 헛돈다)', !!decl);
  if (decl) {
    const start = decl.index + decl[0].length;
    let depth = 1, i = start;
    while (i < API_SRC.length && depth > 0) {
      const ch = API_SRC[i];
      if (ch === '{') depth++; else if (ch === '}') depth--;
      i++;
    }
    const body = API_SRC.slice(start, i - 1)
      .replace(/:\s*ActorLike\s*=/g, ' =')
      .replace(/:\s*string\[\]\s*=/g, ' =')
      .replace(/ as any/g, '');
    const HQ = [
      { username: EXEC_UID, name: '대표' },
      { username: APPROVER_UID, name: '장 부장' },
      { username: PLAIN_UID, name: '본사 직원' },
      { username: 'mgr_melca', name: 'Melca' },
    ];
    const PH = ['mgr_melca', 'mgr_maimai', 'mgr_karl'];
    const approversFor = new Function(
      'hqAccounts', 'isPrimaryApprover', 'canDecideStage', 'isPhManager',
      `return async function approversFor(env, role, exceptUser) {${body}};`
    )(async () => HQ, isPrimaryApprover, canDecideStage,
      (a) => PH.includes(String(a.username || '').toLowerCase()));

    const by = async (who) => await approversFor(null, 'mgr', who);
    const fromPlain = await by(PLAIN_UID);
    const fromApprover = await by(APPROVER_UID);
    const fromBoss = await by(EXEC_UID);

    check('직원이 올리면 결재권자에게 알린다',
      fromPlain.length === 1 && fromPlain[0] === APPROVER_UID, JSON.stringify(fromPlain));
    check('🔴 결재권자 본인이 올려도 알림이 0명이 아니다',
      fromApprover.length > 0, JSON.stringify(fromApprover));
    check('그때는 경영진이 받는다 (누를 수 있는 사람으로 넓힌다)',
      fromApprover.includes(EXEC_UID), JSON.stringify(fromApprover));
    check('그때도 필리핀 매니저에게는 안 간다 (넓히되 아무에게나 보내지 않는다)',
      !fromApprover.some(u => PH.includes(u)), JSON.stringify(fromApprover));
    check('그때도 그 밖의 본사 직원에게는 안 간다 (mgr 단계를 못 누르므로)',
      !fromApprover.includes(PLAIN_UID), JSON.stringify(fromApprover));
    check('경영진이 올리면 결재권자에게 알린다 (평소 경로는 그대로)',
      fromBoss.length === 1 && fromBoss[0] === APPROVER_UID, JSON.stringify(fromBoss));
    /* 짝 — 폴백이 «언제나» 도는 것이 아님을 확인한다. 늘 돌면 경영진이 모든 mgr 건의
       알림을 받게 되어 「결재는 장 부장이 한다」가 다시 무너진다. */
    check('폴백은 주 결재자가 없을 때만 돈다',
      !fromPlain.includes(EXEC_UID) && !fromBoss.includes(EXEC_UID));
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Ⓓ 전결 — 물품·지출에서만 끈다
 * ═════════════════════════════════════════════════════════════════════════ */
console.log('\n[Ⓓ] 전결 — 중간 단계 건너뛰기');
check('물품 구입은 전결을 끈다', allowsStraightThrough('purchase') === false);
check('지출 정산은 전결을 끈다', allowsStraightThrough('expense') === false);
/* 🔴 짝 — 넓혀서 끄면 「대표님이 올린 인사·급여를 아무도 결재 못 하는」 8/30 사고로 간다. */
for (const k of ['hr', 'doc', 'leave', 'complaint', 'urgent']) {
  check(`${k} 는 전결이 살아 있다`, allowsStraightThrough(k) === true);
}
check('모르는 분류는 «일반 문서»로 보아 전결이 살아 있다',
  allowsStraightThrough('what_is_this') === true);

/* 🔎 서버가 그 판정을 **실제로 쓰는가** — 식을 오려 내 돌려 본다.
      ⚠️ 「그 함수 이름이 파일에 있는가」로는 못 잡는다: 조건을 && 에서 || 로 뒤집어도
         그 글자가 그대로 남아 통과한다. */
console.log('\n[Ⓓ-2] 전결 배선 — 소스의 식을 실제로 평가한다');
{
  const m = API_SRC.match(/const straightThrough = ([^;]+);/);
  check('decide 안에서 straightThrough 식을 찾았다 (못 찾으면 아래가 헛돈다)', !!m);
  if (m) {
    const expr = m[1];
    const fn = new Function('iAmExec', 'role', 'cur', 'allowsStraightThrough', `return (${expr});`);
    const money = { req_type: 'purchase' };
    const hrDoc = { req_type: 'hr' };
    check('경영진이 물품 1단계를 눌러도 전결이 안 걸린다 (대표 차례가 열린다)',
      fn(true, 'mgr', money, allowsStraightThrough) === false);
    check('경영진이 지출 1단계를 눌러도 전결이 안 걸린다',
      fn(true, 'mgr', { req_type: 'expense' }, allowsStraightThrough) === false);
    /* 짝 — 전부 꺼 버리는 변경이 통과하면 안 된다. */
    check('돈이 아닌 분류에서는 전결이 그대로 걸린다',
      fn(true, 'staff', hrDoc, allowsStraightThrough) === true);
    check('경영진이 아니면 애초에 전결이 아니다',
      fn(false, 'staff', hrDoc, allowsStraightThrough) === false);
    check('exec 단계는 전결이 아니다 (그 자리가 마지막이다)',
      fn(true, 'exec', hrDoc, allowsStraightThrough) === false);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Ⓔ 확인 — 「봤다」는 도장
 * ═════════════════════════════════════════════════════════════════════════ */
console.log('\n[Ⓔ] 확인 — 언제 뜨고 언제 안 뜨는가');
const ack = (o) => needsExecAck({
  reqType: 'purchase', status: 'approved', decidedBy: APPROVER_UID,
  ackAt: null, me: EXEC_UID, isExec: true, ...o,
});
check('소액 건을 결재권자가 승인했다 → 대표에게 확인이 뜬다', ack({}) === true);
check('지출 정산도 마찬가지', ack({ reqType: 'expense' }) === true);
/* 🔴 짝 — 아무 때나 뜨면 「확인할 것 30건」이 되어 정작 돈 건이 파묻힌다. */
/* ⚠️ 이름을 「큰돈 건은 안 뜬다」로 적지 말 것 — needsExecAck 는 **금액을 인자로 받지도
      않는다.** 재는 것은 「마지막 도장이 나인가」 하나뿐이다(2026-09-09 함정 대조 지적:
      검사 이름이 실제 보장보다 넓으면, 다음 사람이 안 지켜지는 것을 지켜진 줄 안다). */
check('내가 마지막 도장을 찍었으면 안 뜬다 (금액은 보지 않는다)',
  ack({ decidedBy: EXEC_UID }) === false);
check('취소된 건에는 도장을 찍지 않는다 (없애기로 한 지출)',
  ack({ cancelledById: 42 }) === false);
check('계정 표기가 대소문자만 달라도 «내가 찍은 것»으로 본다',
  ack({ decidedBy: String(EXEC_UID).toUpperCase() }) === false);
check('이미 확인한 건은 다시 안 뜬다', ack({ ackAt: 1757000000000 }) === false);
check('아직 결재 중인 건은 안 뜬다 (확인은 결재를 대신하지 않는다)',
  ack({ status: 'pending' }) === false);
check('반려된 건은 안 뜬다', ack({ status: 'rejected' }) === false);
check('회수된 건은 안 뜬다', ack({ status: 'withdrawn' }) === false);
check('경영진이 아니면 안 뜬다', ack({ isExec: false }) === false);
check('일반 문서는 안 뜬다 (돈이 나간 건만)', ack({ reqType: 'doc' }) === false);
check('휴가는 안 뜬다', ack({ reqType: 'leave' }) === false);
check('인사·급여는 안 뜬다', ack({ reqType: 'hr' }) === false);
check('긴급은 안 뜬다', ack({ reqType: 'urgent' }) === false);
check('결재자를 모르는 옛 건도 뜬다 (내가 찍은 것이 아니므로)',
  ack({ decidedBy: null }) === true);
check('내가 누구인지 모르면 안 뜬다 (지어내지 않는다)',
  ack({ me: '' }) === false);
check('상태 글자에 공백·대문자가 섞여도 알아본다',
  ack({ status: ' Approved ' }) === true);
check('ackAt 이 0 이면 «아직 안 함» 으로 본다 (0 을 «했다»로 읽지 않는다)',
  ack({ ackAt: 0 }) === true);

/* 🔴 [Ⓔ-2] 「확인은 대표만 보이게」 — 2026-09-09 사장님 지시.
     ⚠️ «결재권자에게 안 뜬다» 만 두면 «아무에게도 안 뜬다» 도 통과한다.
        반드시 «대표에게는 뜬다» 를 짝으로 둔다. */
console.log('\n[Ⓔ-2] 확인은 «결재권자가 아닌 경영진» 에게만');
check('결재권자에게는 확인이 뜨지 않는다 (결재를 하는 사람이지 확인하는 사람이 아니다)',
  ack({ me: APPROVER_UID, decidedBy: EXEC_UID, isApprover: true }) === false);
check('짝 — 같은 건이 대표에게는 뜬다 (전부 막는 코드도 통과하지 않게)',
  ack({ me: EXEC_UID, decidedBy: APPROVER_UID, isApprover: false }) === true);
check('isApprover 를 안 넘기면 옛 동작 그대로 (조용히 사라지지 않는다)',
  needsExecAck({ reqType: 'purchase', status: 'approved', decidedBy: APPROVER_UID,
                 ackAt: null, me: EXEC_UID, isExec: true }) === true);
check('결재권자라도 경영진이 아니면 애초에 안 뜬다',
  ack({ me: APPROVER_UID, isExec: false, isApprover: true }) === false);

/* ═══════════════════════════════════════════════════════════════════════════
 * Ⓕ 배선 — 서버·화면이 위 판정을 실제로 부르는가
 * ═════════════════════════════════════════════════════════════════════════ */
console.log('\n[Ⓕ] 배선 — 서버');
/* ⚠️ 「canDecideStage 가 아예 없어야 한다」로 쓰지 말 것 — 주 결재자가 0명일 때의
      폴백이 그것을 쓴다(Ⓒ-2). 물어야 할 것은 «주 결재자를 먼저 고르는가» 다. */
check('알림 대상을 isPrimaryApprover 로 «먼저» 고른다 (폴백은 그 뒤)',
  (() => {
    const i = API_SRC.indexOf('async function approversFor');
    if (i < 0) return false;
    const body = API_SRC.slice(i, i + 2600);
    const a = body.indexOf('isPrimaryApprover(');
    const b = body.indexOf('canDecideStage(');
    return a > 0 && (b < 0 || a < b);
  })());
check('주 결재자가 0명이면 넓혀서 알린다 (조용히 사라지지 않게)',
  (() => {
    const i = API_SRC.indexOf('async function approversFor');
    if (i < 0) return false;
    const body = API_SRC.slice(i, i + 2600);
    return /if \(out\.length\) return out;/.test(body) && body.includes('canDecideStage(');
  })());
check('«결재할 수 있는 사람 수» 는 여전히 canDecideStage 로 센다 (대신 결재도 세어야 한다)',
  (() => {
    const i = API_SRC.indexOf('async function approverCounts');
    return i >= 0 && API_SRC.slice(i, i + 1200).includes('canDecideStage(');
  })());
check('확인 칸 두 개를 멱등 ALTER 로 붙인다',
  API_SRC.includes('ADD COLUMN exec_ack_by TEXT') && API_SRC.includes('ADD COLUMN exec_ack_at INTEGER'));
check('목록 응답이 확인 도장을 싣는다 (화면이 그릴 수 있게)',
  /exec_ack_by: r\.exec_ack_by/.test(API_SRC) && /exec_ack_at: r\.exec_ack_at/.test(API_SRC));
check('확인 API 가 있다 (POST …/ack)',
  /mAck = path\.match\(\/\^\\\/api\\\/approval\\\/requests\\\/\(\\d\+\)\\\/ack\$\//.test(API_SRC));
check('확인 API 가 정본 needsExecAck 를 지난다',
  (() => {
    const i = API_SRC.indexOf('const mAck = path.match');
    if (i < 0) return false;
    const j = API_SRC.indexOf('const mDecide = path.match', i);
    const body = API_SRC.slice(i, j > i ? j : i + 3000);
    return body.includes('needsExecAck({') && body.includes('iAmExec');
  })());
check('확인 API 는 경영진만 (403)',
  (() => {
    const i = API_SRC.indexOf('const mAck = path.match');
    const j = API_SRC.indexOf('const mDecide = path.match', i);
    return i >= 0 && API_SRC.slice(i, j).includes('if (!iAmExec)');
  })());
check('확인은 조건부 UPDATE 로 — 동시에 눌러도 도장이 하나만 찍힌다',
  /UPDATE approval_requests SET exec_ack_by = \?, exec_ack_at = \?\s*\n?\s*WHERE id = \? AND status = 'approved' AND exec_ack_at IS NULL/.test(API_SRC));
check('확인은 결재 상태를 바꾸지 않는다 (막지 않는 표시라는 계약)',
  (() => {
    const i = API_SRC.indexOf('const mAck = path.match');
    const j = API_SRC.indexOf('const mDecide = path.match', i);
    const body = API_SRC.slice(i, j);
    /* ⚠️ SET~WHERE 구간만 본다. 파일 전체에서 「status =」를 찾으면 조건부 UPDATE 의
          WHERE status = 'approved' 에 걸려 **멀쩡한 코드가 거짓 FAIL** 난다(실제로 밟음). */
    const sets = body.match(/\bSET\b[\s\S]*?\bWHERE\b/g) || [];
    return sets.length > 0 && sets.every(x => !/\bstatus\s*=/.test(x));
  })());
check('확인 대기 조회가 취소된 건을 뺀다',
  /status = 'approved' AND exec_ack_at IS NULL AND cancelled_by_id IS NULL/.test(API_SRC));
check('확인 대기 조회는 대소문자를 가리지 않고 «내가 찍은 것» 을 뺀다',
  /LOWER\(IFNULL\(decided_by,''\)\) <> LOWER\(\?\)/.test(API_SRC));
/* ⚠️ 서명에 넣는 것과 «읽어서 쓰는 것» 은 다르다 — 둘 다 본다. 한쪽만 있으면
      확인을 눌러도 서명이 그대로라 다른 기기가 최대 한 시간 옛 목록을 보여 준다. */
check('확인 도장이 ETag 서명에 들어간다 (다른 기기에서 304 로 옛 목록이 남지 않게)',
  /IFNULL\(MAX\(IFNULL\(exec_ack_at,0\)\),0\) AS mk/.test(API_SRC) &&
  /\$\{sig\?\.mk \|\| 0\}/.test(API_SRC));
check('확인 API 가 취소 여부를 뽑아 정본에 넘긴다 (목록 SQL 과 답이 갈리지 않게)',
  (() => {
    const i = API_SRC.indexOf('const mAck = path.match');
    const j = API_SRC.indexOf('const mDecide = path.match', i);
    const body = API_SRC.slice(i, j);
    return body.includes('cancelled_by_id') && /cancelledById: cur\.cancelled_by_id/.test(body);
  })());
check('결재함에 «대신 결재» 표시를 실어 보낸다',
  /row\.by_proxy = !isPrimaryApprover\(actor, role, ph\)/.test(API_SRC));

console.log('\n[Ⓕ-2] 배선 — 화면');
check('확인 구역이 있다', WORK_SRC.includes('id="ackBox"') && WORK_SRC.includes('id="ackHead"'));
check('확인 목록을 서버 값(ack_pending)으로 그린다', /D\.ack_pending/.test(WORK_SRC));
check('확인 버튼이 ack API 를 부른다',
  /ackOne = function/.test(WORK_SRC) && /\/ack'/.test(WORK_SRC));
check('확인을 «못 보낸 결재» 큐에 넣지 않는다 (로그아웃 경고 숫자가 거짓이 되지 않게)',
  (() => {
    const i = WORK_SRC.indexOf('window.ackOne = function');
    if (i < 0) return false;
    return !WORK_SRC.slice(i, i + 1800).includes('outboxAdd(');
  })());
check('역할 이름에 결재권자가 있다', /role === 'mgr'/.test(WORK_SRC));
check('역할 이름을 한 곳(roleLabel)에서만 만든다',
  (WORK_SRC.match(/T\('Exec', '경영진'\)/g) || []).length === 1);
check('대신 결재 안내는 서버 판정(by_proxy)을 쓴다 — 화면이 스스로 정하지 않는다',
  /r\.by_proxy/.test(WORK_SRC));
check('확인 목록을 결재함에 합치지 않는다 (급한 건이 묻히지 않게)',
  !/paintList\('inbox', *\(D\.inbox *\|\| *\[\]\)\.concat/.test(WORK_SRC));

/* ═══════════════════════════════════════════════════════════════════════════
 * Ⓗ 같은 사람이 «두 단계 연달아» 못 누른다 — 2026-09-09 사장님 「1번 막아주고」
 *
 *   ⚠️ 「막는가」만 재면 «전부 막기» 도 통과한다. 절마다 **«그래도 되는 것은 된다»**
 *      를 짝으로 둔다.
 * ═════════════════════════════════════════════════════════════════════════ */
console.log('\n[Ⓗ] 같은 사람 연속 결재 금지');
const sd = (o) => sameDeciderBlocked({
  reqType: 'purchase', priorDeciders: [APPROVER_UID], me: APPROVER_UID, decision: 'approved', ...o,
});
check('앞 단계를 내가 승인했으면 이 단계는 막힌다', sd({}).blocked === true);
check('그때 사유는 same_decider', sd({}).reason === 'same_decider');
check('짝 — 다른 사람은 그대로 결재할 수 있다',
  sd({ me: EXEC_UID }).blocked === false);
check('짝 — 앞 단계에 아무도 없으면(1단계) 막지 않는다',
  sd({ priorDeciders: [] }).blocked === false);
check('대소문자만 달라도 같은 사람으로 본다',
  sd({ me: String(APPROVER_UID).toUpperCase() }).blocked === true);
check('앞뒤 공백이 섞여도 같은 사람으로 본다',
  sd({ priorDeciders: [' ' + APPROVER_UID + ' '] }).blocked === true);
check('앞 단계 결재자가 여럿이어도 그중 하나가 나면 막는다',
  sd({ priorDeciders: ['someone_else', APPROVER_UID] }).blocked === true);
check('앞 단계에 «도장을 안 찍은» 빈 값이 섞여 있어도 오판하지 않는다',
  sd({ priorDeciders: [null, ''], me: EXEC_UID }).blocked === false);

/* 🔴 조회 실패 = «모른다». 빈 배열로 떨어뜨리면 게이트가 통째로 풀린다. */
check('앞 단계를 조회하지 못하면 막는다 (모르면 막는 쪽으로 실패)',
  sd({ priorDeciders: null }).blocked === true && sd({ priorDeciders: null }).reason === 'lookup_failed');
check('undefined 도 «모른다» 로 본다', sd({ priorDeciders: undefined }).blocked === true);
check('인자를 통째로 안 넘겨도 막는다', sameDeciderBlocked(null).blocked === true);
check('누구인지 모르면 막는다', sd({ me: '' }).reason === 'unknown_actor');

/* 🔴 반려는 막지 않는다 — 돈이 나가지 않는 방향이다. */
check('반려는 앞 단계를 내가 결재했어도 막지 않는다',
  sd({ decision: 'rejected' }).blocked === false);
check('결정을 안 넘기면 막지 않는다 (승인에만 거는 규칙)',
  sd({ decision: null }).blocked === false);

/* 🔴 분류 — 돈이 나가는 둘에만. */
check('물품 구입에 걸린다', blocksSameDecider('purchase') === true);
check('지출 정산에 걸린다', blocksSameDecider('expense') === true);
check('인사·급여에는 안 걸린다', blocksSameDecider('hr') === false);
check('긴급에는 안 걸린다', blocksSameDecider('urgent') === false);
check('휴가에는 안 걸린다', blocksSameDecider('leave') === false);
check('문서에는 안 걸린다', blocksSameDecider('doc') === false);
check('모르는 분류에도 안 걸린다', blocksSameDecider('zzz') === false);
check('분류가 안 걸리면 앞 단계가 나여도 통과',
  sd({ reqType: 'hr' }).blocked === false);

/* 🔴 교착 — «누가 올렸느냐» 에 따라 큰돈 2단계가 멈추는가.
     ⛔ 예전 검사는 `EXEC_USERNAMES.filter(u => !MONEY_APPROVERS.includes(u)).length >= 1`
        한 줄이었는데 **「본인이 올린 건은 본인이 결재 못 함」을 모형에 안 넣어 언제나 참**
        이었다. 그 검사를 근거로 소스 주석·CLAUDE.md·작업기록 세 곳이 「교착이 없다」고
        적었고, 실제로는 **경영진이 올린 큰돈 건이 교착**한다(2026-09-09 함정 대조가 잡음).
     ✅ 그래서 이제 «기안자별로 1·2단계 후보를 실제로 세어» 사실 그대로 못 박는다. */
const ROSTER = [...new Set([...EXEC_USERNAMES, ...MONEY_APPROVERS, PLAIN_UID])].filter(Boolean);
/** 그 단계를 «지금» 누를 수 있는 사람 — 서버(api-approval decide)와 같은 순서로 거른다. */
function decidersFor({ reqType, role, requester, priorDeciders }) {
  return ROSTER.filter(u => {
    if (u === requester) return false;                               // 본인이 올린 건
    if (!canDecideStage(hq(u), role, false)) return false;           // 그 단계 권한
    return !sameDeciderBlocked({                                     // 같은 사람 연속 금지
      reqType, priorDeciders: priorDeciders || [], me: u, decision: 'approved',
    }).blocked;
  });
}
/** 큰돈 건을 «끝까지» 밟아 본다 — 1단계 후보마다 2단계 후보가 남는지. */
function bigMoneyWalk(requester) {
  const st = stagesFor('purchase', BIG, 'PHP');
  const s1 = decidersFor({ reqType: 'purchase', role: st[0].role, requester, priorDeciders: [] });
  return s1.map(first => ({
    first,
    second: decidersFor({ reqType: 'purchase', role: st[1].role, requester, priorDeciders: [first] }),
  }));
}
const walkPlain = bigMoneyWalk(PLAIN_UID);
const walkBoss  = bigMoneyWalk(EXEC_UID);
const walkAppr  = bigMoneyWalk(APPROVER_UID);

check('전제 — 큰돈은 2단계다 (아래 걸음이 뜻을 가지려면)',
  stagesFor('purchase', BIG, 'PHP').length === 2);
check('전제 — 1단계 후보가 있다 (0명이면 아래 검사가 통째로 헛돈다)',
  walkPlain.length > 0 && walkBoss.length > 0 && walkAppr.length > 0,
  `plain=${walkPlain.length} boss=${walkBoss.length} appr=${walkAppr.length}`);

/* ✅ 보통 경로(본사 직원·필리핀이 올린 건)는 어떤 1단계 결재자를 거쳐도 2단계가 열린다.
     ⛔ 이것이 깨지면 필리핀에서 올라오는 큰돈 결재가 통째로 멈춘다 — 진짜 사고다. */
check('보통 경로 — 남이 올린 큰돈은 어느 길로 가도 2단계 결재자가 남는다',
  walkPlain.length > 0 && walkPlain.every(w => w.second.length >= 1),
  JSON.stringify(walkPlain));

/* 🔴 지금 «사실» — 경영진 둘 중 하나가 «올린» 큰돈 건은 2단계가 0명이 되어 멈춘다.
     기안자 제외 + 같은 사람 연속 금지가 맞물린 결과이고, 2026-09-09 이 변경이 만든 것이다.
     ⚠️ 이 검사는 「그래도 된다」가 아니라 **「지금 이렇다」를 못 박는 것**이다 —
        문서 세 곳이 이 사실을 그대로 적고 있고, 규칙을 바꾸면 여기부터 빨간불이 되어야 한다.
     📌 실측(2026-09-09 D1): 물품·지출 4건은 전부 필리핀 매니저가 올렸고 모두 소액이라,
        오늘까지 이 교착에 실제로 걸린 건은 0건이다. */
const bossStuck = walkBoss.every(w => w.second.length === 0);
const apprStuck = walkAppr.every(w => w.second.length === 0);
check('지금 사실 — 경영진이 «올린» 큰돈은 2단계가 0명이다 (규칙을 바꾸면 여기가 먼저 빨간불)',
  bossStuck && apprStuck,
  `boss=${JSON.stringify(walkBoss)} approver=${JSON.stringify(walkAppr)}`);

/* ✅ 그리고 **화면이 그 사실을 말해야** 한다 — 「이대로는 처리되지 않습니다」 배너.
     approverCounts 가 sameDeciderBlocked 를 모르면 0명인 건에 배너가 안 뜬다
     (8/30 긴급 건이 5일 방치된 그 모양). */
const AC = blockFromSrc(API_SRC, /async function approverCounts\(/);
check('전제 — approverCounts 본문을 잘라 냈다', AC.length > 200, `len=${AC.length}`);
check('배너가 사실을 말한다 — approverCounts 가 같은 사람 연속 금지를 함께 센다',
  /sameDeciderBlocked\(/.test(AC));
check('그 판정에 «앞 단계 결재자» 를 실제로 넘긴다 (빈 값만 넘기면 언제나 안 막힌다)',
  /priorDeciders:\s*j\.priorDeciders/.test(AC));
check('home 이 그 근거를 채워 보낸다 (안 채우면 위 판정이 헛돈다)',
  /priorDeciders:\s*\(m\.steps \|\| \[\]\)/.test(API_SRC));

console.log('\n[Ⓗ-2] 배선 — 서버가 실제로 그 판정을 지나는가');
/* 결재(decide) 라우트만 잘라 본다 — 파일 전체에서 찾으면 딴 라우트의 코드가 걸린다. */
const DECIDE = blockFromSrc(API_SRC, /if \(method === 'POST' && mDecide\) \{/);
check('전제 — decide 라우트 본문을 잘라 냈다', DECIDE.length > 500, `len=${DECIDE.length}`);
check('decide 가 정본 sameDeciderBlocked 를 부른다', /sameDeciderBlocked\(/.test(DECIDE));
check('조건을 라우트 안에 다시 적지 않았다 (정본 하나로)',
  !/priorDeciders[\s\S]{0,200}indexOf\(/.test(DECIDE) && !/decided_by[^\n]*===[^\n]*actor\.username/.test(DECIDE));
check('앞 단계 결재자를 approval_steps 에서 읽는다',
  /SELECT decided_by[\s\S]{0,160}approval_steps/.test(DECIDE));
check('앞 단계만 본다 (seq < ?) — 다음 단계까지 세면 엉뚱한 것을 막는다',
  /seq < \?/.test(DECIDE));
check('승인 도장만 센다 (반려·건너뜀은 «앞 단계 결재» 가 아니다)',
  /status = 'approved'/.test(DECIDE));
check('조회 실패는 null 로 떨어진다 (빈 배열이면 게이트가 풀린다)',
  /\)\.map\(\(r: any\) => r\.decided_by[^\n]*\n?[\s\S]{0,40}, null\)/.test(DECIDE) ||
  /r\.decided_by as string \| null\)[\s\S]{0,20}, null\)/.test(DECIDE));
check('막히면 403 으로 끊는다', /if \(sd\.blocked\)[\s\S]{0,900}403\)/.test(DECIDE));
check('막는 판정이 «결재를 적기 전» 에 온다',
  DECIDE.indexOf('sd.blocked') > 0 &&
  DECIDE.indexOf('sd.blocked') < DECIDE.indexOf('UPDATE approval_requests'));
check('사람이 읽을 사유를 한국어·영어로 준다',
  /same_decider:[\s\S]{0,200}different approver/.test(DECIDE));

/* 🔴 「부르기는 하는데 안 막는다」를 잡는다.
     ⛔ 함정 대조 실측(2026-09-09): `decision` 인자를 `'rejected'` 리터럴로 못 박으면
        게이트가 **한 번도 막지 않는데** 위 검사들은 전부 초록이었다(부르고·403 이고·
        순서도 앞이라서). CLAUDE.md 2장이 두 번 못 박은 형태 —
        「«불렀는가» 만 보지 말고 «그 결과를 조건으로 쓰는가»·«무엇을 넘기는가» 도 볼 것」.
     ✅ 그래서 그 호출의 인자 묶음만 오려 내, «게이트가 채운 그 변수» 를 쓰는지 본다.
     ℹ️ 결재함 행(home)의 `decision: 'approved'` 리터럴은 정상이다 — 거기는 «승인할 수
        있는가» 를 미리 그려 주는 자리라 언제나 승인 기준으로 묻는다. 그래서 decide
        라우트만 잘라서 판정한다. */
function argsOf(src, callRe) {
  const m = src.match(callRe);
  if (!m) return '';
  let i = src.indexOf('(', m.index + m[0].length - 1);
  if (i < 0) return '';
  let d = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '(') d++;
    else if (src[j] === ')') { d--; if (!d) return src.slice(i, j + 1); }
  }
  return '';
}
const SD_ARGS = argsOf(DECIDE, /sameDeciderBlocked\(/);
check('전제 — decide 의 sameDeciderBlocked 인자를 오려 냈다', SD_ARGS.length > 40, `len=${SD_ARGS.length}`);
check('«결정» 을 리터럴로 못 박지 않았다 (박으면 게이트가 언제나 통과·언제나 차단)',
  /\bdecision\s*[,}]/.test(SD_ARGS) && !/decision\s*:\s*['"]/.test(SD_ARGS), SD_ARGS.replace(/\s+/g, ' '));
check('«앞 단계 결재자» 를 그 조회 결과 변수로 넘긴다',
  /\bpriorDeciders\s*[,}]/.test(SD_ARGS) && !/priorDeciders\s*:\s*\[/.test(SD_ARGS));
check('«나» 를 로그인한 계정에서 가져온다 (본문 값이 아니다)',
  /me\s*:\s*String\(actor\.username\)/.test(SD_ARGS));
check('앞 단계 도장이 비어도 요청 행의 decided_by 가 근거로 함께 간다 (best-effort 기록 대비)',
  /priorSteps\.concat\(\[[^\]]*decided_by/.test(DECIDE));

console.log('\n[Ⓗ-3] 배선 — 화면이 그 사실을 말하는가');
check('결재함 행에 same_decider 표시를 붙인다', /row\.same_decider = sameDeciderBlocked\(/.test(API_SRC));
check('그 표시를 정본으로 계산한다 (화면이 스스로 판정하지 않는다)',
  !/same_decider\s*=\s*[^=]*decided_by/.test(WORK_SRC));
/* 승인·반려 두 버튼을 그리는 그 «식» 만 오려 내 판정한다.
   ⛔ 예전에는 「파일 어딘가에 askWhy( 가 있는가」였는데, 반려 버튼까지 함께 감추는
      변이가 그대로 통과했다(2026-09-09 함정 대조 실측). 그러면 장 부장 화면에서 그 건은
      승인도 반려도 못 하는 채 남는다. */
const ACTS = (() => {
  /* ⚠️ 같은 글자가 «확인 카드»(ackOne)에도 있다 — 첫 번째를 잡으면 엉뚱한 조각이 온다.
        decide( 가 들어 있는 쪽, 즉 «결재 가능한» 카드의 식을 고른다. */
  const NEEDLE = `h += '<div class="acts">'`;
  for (let i = WORK_SRC.indexOf(NEEDLE); i >= 0; i = WORK_SRC.indexOf(NEEDLE, i + 1)) {
    /* ⚠️ 끝을 «why-» 로만 잡으면 확인 카드에서 시작한 조각이 결재 카드까지 삼켜
          decide( 를 품게 된다 — 둘 중 «먼저 오는» 표시까지만 자른다. */
    const a = WORK_SRC.indexOf("ack-", i), w = WORK_SRC.indexOf('why-', i);
    const j = (a >= 0 && w >= 0) ? Math.min(a, w) : Math.max(a, w);
    if (j < 0) continue;
    const seg = WORK_SRC.slice(i, j);
    if (seg.indexOf('decide(') >= 0) return seg;
  }
  return '';
})();
check('전제 — 승인·반려를 그리는 식을 오려 냈다', ACTS.length > 80, `len=${ACTS.length}`);
check('화면이 승인 버튼을 감춘다 (same_decider 가 그 버튼을 가린다)',
  /same_decider[^\n]*\?[^\n]*''[\s\S]{0,160}decide\([^\n]*approved/.test(ACTS));
/* 「가드 밖」은 «글자 거리» 로 재면 안 된다 — 승인·반려가 한 줄에 나란히 있어
   「200자 안에 askWhy 가 있다」로는 밖에 있어도 걸린다. 괄호 짝으로 «가드의 범위» 를
   구해 반려가 그 «안» 인지 «밖» 인지 본다. */
/* ⚠️ 가드가 «하나» 라고 가정하면 안 된다 — 반려까지 감싸는 두 번째 가드를 넣는 변이가
      첫 번째 가드만 보는 검사를 그대로 통과했다(2026-09-09 변이시험 실측).
      ⟹ same_decider 가 나오는 «모든» 자리의 범위를 구해, 반려가 그 어디에도 안 들어가는지 본다. */
const GUARDS = (() => {
  const out = [];
  for (let k = ACTS.indexOf('same_decider'); k >= 0; k = ACTS.indexOf('same_decider', k + 1)) {
    let open = -1;
    for (let j = k; j >= 0; j--) if (ACTS[j] === '(') { open = j; break; }
    if (open < 0) continue;
    let d = 0;
    for (let j = open; j < ACTS.length; j++) {
      if (ACTS[j] === '(') d++;
      else if (ACTS[j] === ')') { d--; if (!d) { out.push([open, j]); break; } }
    }
  }
  return out;
})();
const REJ = ACTS.indexOf('askWhy(');
check('전제 — 승인을 가리는 «가드의 범위» 를 괄호 짝으로 구했다', GUARDS.length >= 1, JSON.stringify(GUARDS));
check('짝 — 반려 버튼은 어느 가드 «안» 에도 없다 (돈이 안 나가는 방향이라 남겨야 한다)',
  REJ >= 0 && GUARDS.length >= 1 && GUARDS.every(g => REJ < g[0] || REJ > g[1]),
  `askWhy@${REJ} guards=${JSON.stringify(GUARDS)}`);
check('화면이 이유를 적는다', /앞 단계를 결재하셔서/.test(WORK_SRC));
check('묶음 승인에서 빠진다 (조용히 건수만 줄지 않게)',
  /if \(r\.same_decider\) return false;/.test(WORK_SRC));

console.log('\n[Ⓗ-4] 확인 목록도 결재권자에게는 안 나간다');
check('home 이 «결재권자가 아닌 경영진» 만 확인 대상으로 본다',
  /const iAmAckViewer = iAmExec && !iAmMoneyApprover;/.test(API_SRC));
check('확인 목록 조회가 그 판정을 쓴다', /const ackRs = iAmAckViewer \?/.test(API_SRC));
/* ⛔ 개수를 «2» 로 못 박지 않는다 — 함정 대조 실측(2026-09-09):
      isApprover 없이 새 호출부를 추가해도 2가 유지되어 **통과**했고(= 결재권자에게 확인이
      다시 뜨는데 초록불), 정당한 3번째 호출부를 추가하면 **거짓 FAIL** 이 났다.
      CLAUDE.md 2장 — 「«몇 개인가» 가 아니라 «그 목록에 그것이 들어 있는가»」. */
const ACK_CALLS = (API_SRC.match(/needsExecAck\(/g) || []).length;
const ACK_FLAGS = (API_SRC.match(/isApprover:\s*iAmMoneyApprover/g) || []).length;
check('전제 — needsExecAck 를 부르는 곳이 있다', ACK_CALLS >= 1, `calls=${ACK_CALLS}`);
check('모든 호출부가 isApprover 를 넘긴다 (한쪽만 넘기면 목록과 주소 호출이 어긋난다)',
  ACK_CALLS === ACK_FLAGS, `needsExecAck(=${ACK_CALLS} · isApprover=${ACK_FLAGS}`);

/* ═══════════════════════════════════════════════════════════════════════════
 * Ⓖ 규칙서가 같은 말을 하는가 — 여러 곳에 흩어진 단정이 어긋나지 않게
 * ═════════════════════════════════════════════════════════════════════════ */
console.log('\n[Ⓖ] 「쉬워 보이지만 가면 안 되는 길」이 소스에 적혀 있는가');
check('결재권자를 EXEC_USERNAMES 에서 빼는 방식을 금지해 두었다',
  /EXEC_USERNAMES 에서 빼기/.test(POLICY_SRC));
check('결재권자가 경영진 명단에도 남아 있다 (인사·급여 열람이 닫히지 않게)',
  MONEY_APPROVERS.every(u => EXEC_USERNAMES.includes(u)),
  `MONEY=${JSON.stringify(MONEY_APPROVERS)} EXEC=${JSON.stringify(EXEC_USERNAMES)}`);
check('StageRole 에 mgr 이 있다 (저장된 값이라 이름을 바꾸면 옛 결재가 죽는다)',
  /StageRole = 'staff' \| 'mgr' \| 'exec' \| 'any'/.test(POLICY_SRC));
check('돈이 나가는 분류는 둘뿐이라는 전제가 유지된다 (wantsCategory 와 짝)',
  TYPES.filter(t => t.wantsCategory).map(t => t.key).sort().join(',') === 'expense,purchase');

// ── 결과 ────────────────────────────────────────────────────────────────────
console.log('\n──────────────────────────────────────');
if (FAIL) {
  console.log(`  ❌ ${FAIL}건 실패 / ${PASS + FAIL}건`);
  for (const f of FAILS) console.log(`     ${f}`);
  console.log('  결재는 돈과 권한이 걸린 기능입니다. 위 항목을 고치세요.');
  process.exit(1);
} else {
  console.log(`  ✅ ${PASS}건 전부 통과 — 결재권자·전결·확인이 규칙대로 동작합니다.`);
}
