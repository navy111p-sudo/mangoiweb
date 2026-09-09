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
