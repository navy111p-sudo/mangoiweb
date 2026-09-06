/*
 * ↩️🔁 결재 회수 · 다시 올리기 · 취소 결재 (2026-09-05)
 *
 *   [무엇이 걸려 있나]
 *     ① 회수  — 「내가 올린 것을 내가 내린다」. ⛔ 아무도 결재하기 «전» 에만.
 *               1단계가 승인된 뒤 내리면 **남의 결재를 지우는 것**이 된다.
 *     ② 다시 올리기 — 「수정」을 대신한다. 🔴 원래 올린 날을 이어받지 않으면
 *               「6일째」가 «오늘» 로 초기화되어 **지연이 조용히 감춰진다.**
 *     ③ 취소 결재 — 승인 건을 그 자리에서 지우지 않는다. 승인은 바깥으로 나간다
 *               (휴가→근무불가, 인사·급여→달 잠금). 새 결재를 올려 승인받는다.
 *
 *   [문자열로는 못 잡는다]
 *     함수도 값도 다 «있고» 틀리는 것은 «누가 통과하는가»·«무엇이 합계에 들어가는가»
 *     뿐이다. 그래서 정본 함수를 **실제로 돌리고**, SQL 은 **진짜 SQLite** 에 건다.
 *
 *   [짝으로 본다]
 *     「남의 건은 회수 못 한다」만 보면 **전부 막는 코드**가 통과한다.
 *     그래서 「내 건은 실제로 회수된다」를 반드시 함께 센다.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, '..');
const SRC = join(ROOT, 'cloudflare-deploy/src');
const PUB = join(ROOT, 'cloudflare-deploy/public');

const P = await import(pathToFileURL(join(SRC, 'approval-policy.ts')).href);
const {
  canWithdraw, canReverse, reverseTitle, countsAsSpend, isLive, isSpendRow,
  canDelete, isApprovalFileKey,
  STATUSES, STATUS_KEYS, statusSpec, summarizeApprovals, buildFindQuery,
} = P;

const api  = readFileSync(join(SRC, 'api-approval.ts'), 'utf8');
const hr   = readFileSync(join(SRC, 'approval-hr.ts'), 'utf8');
const pol  = readFileSync(join(SRC, 'approval-policy.ts'), 'utf8');
const work = readFileSync(join(PUB, 'work.html'), 'utf8');

let PASS = 0, FAIL = 0;
function check(name, ok, detail) {
  if (ok) { PASS++; console.log('  ✅ ' + name); }
  else { FAIL++; console.log('  ❌ ' + name + (detail ? (' — ' + detail) : '')); }
}
function sec(t) { console.log('\n' + t); }

/* 주석을 벗긴 사본 — «이 글자가 없어야 한다» 류는 여기에 물어야 한다.
   ⚠️ 블록주석을 정규식 한 줄로 지우면 문자열 속 «별표+슬래시» 에서 코드가 함께 날아간다.
      줄 단위로 «지금 블록주석 안인가» 를 추적한다(CLAUDE.md 2장). */
function stripComments(src) {
  const out = []; let inBlock = false;
  for (const line of src.split('\n')) {
    let s = line, r = '';
    while (s.length) {
      if (inBlock) {
        const e = s.indexOf('*/');
        if (e < 0) { s = ''; break; }
        s = s.slice(e + 2); inBlock = false;
      } else {
        const b = s.indexOf('/*'), l = s.indexOf('//');
        if (b < 0 && l < 0) { r += s; s = ''; break; }
        if (l >= 0 && (b < 0 || l < b)) { r += s.slice(0, l); s = ''; break; }
        r += s.slice(0, b); s = s.slice(b + 2); inBlock = true;
      }
    }
    out.push(r);
  }
  return out.join('\n');
}
const apiNC  = stripComments(api);
const workNC = stripComments(work);

/** 중괄호 짝으로 블록을 자른다 — «앞 N자» 로 자르면 옆 함수가 딸려 들어온다.
    🪤 그런데 «첫 번째 여는 중괄호» 부터 세면 안 된다 — 반환 타입의
       `Promise<{ ... }>` 가 먼저 걸려 서명만 잘리고 본문을 한 줄도 못 본다
       (실측: applyReversal 검사 6건이 그대로 헛돌았다).
       **줄 끝에 오는 여는 중괄호**(= 본문의 시작)부터 센다. */
function blockFrom(src, anchor) {
  const i = src.indexOf(anchor);
  if (i < 0) return '';
  let start = -1;
  for (let k = i; k < src.length; k++) {
    if (src[k] !== '{') continue;
    let j = k + 1;
    while (j < src.length && (src[j] === ' ' || src[j] === '\t' || src[j] === '\r')) j++;
    if (src[j] === '\n') { start = k; break; }
  }
  if (start < 0) return '';
  let d = 0;
  for (let k = start; k < src.length; k++) {
    const c = src[k];
    if (c === '{') d++;
    else if (c === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  return src.slice(i);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * [①] 회수 판정 — 정본을 실제로 돌린다
 * ═════════════════════════════════════════════════════════════════════════ */
sec('[①] 회수 — canWithdraw 를 실제로 돌린다');
{
  const base = { me: 'mgr_lby', requesterUsername: 'mgr_lby', status: 'pending', anyDecided: false, stageSeq: 1 };

  // 🔴 짝 검사 — 「되는 경우」가 없으면 전부 막는 코드가 통과한다
  check('내가 올린 대기 건은 회수된다 (짝 검사 — 전부 막는 코드는 여기서 걸린다)',
    canWithdraw(base).ok === true, JSON.stringify(canWithdraw(base)));

  check('⛔ 남이 올린 건은 회수할 수 없다',
    canWithdraw({ ...base, me: 'mgr_karl' }).reason === 'not_mine');
  check('⛔ 이미 승인된 건은 회수가 아니다 (③ 취소 결재로 간다)',
    canWithdraw({ ...base, status: 'approved' }).reason === 'not_pending');
  check('⛔ 반려된 건도 회수 대상이 아니다',
    canWithdraw({ ...base, status: 'rejected' }).reason === 'not_pending');
  check('⛔ 이미 회수한 건을 또 회수하지 않는다',
    canWithdraw({ ...base, status: 'withdrawn' }).reason === 'not_pending');
  check('🔴 누가 이미 결재를 눌렀으면 회수할 수 없다 (남의 결재를 지우게 된다)',
    canWithdraw({ ...base, anyDecided: true }).reason === 'already_decided');
  check('🔴 다단계에서 앞 단계가 승인된 건도 마찬가지 (stage_seq > 1)',
    canWithdraw({ ...base, stageSeq: 2 }).reason === 'already_decided');
  check('빈 계정으로는 통과하지 않는다 (신원을 못 읽었을 때 막는 쪽으로 실패)',
    canWithdraw({ ...base, me: '', requesterUsername: '' }).reason === 'not_mine');
}

/* ═══════════════════════════════════════════════════════════════════════════
 * [①-2] 삭제 판정 — 「없었던 것으로」
 * ═════════════════════════════════════════════════════════════════════════ */
sec('[①-2] 삭제 — canDelete 를 실제로 돌린다');
{
  const base = { me: 'admin', requesterUsername: 'admin', status: 'withdrawn', hasResubmitChild: false };

  check('회수한 내 건은 지울 수 있다 (짝 검사 — 전부 막는 코드는 여기서 걸린다)',
    canDelete(base).ok === true, JSON.stringify(canDelete(base)));

  check('⛔ 남이 올린 건은 못 지운다',
    canDelete({ ...base, me: 'mgr_lby' }).reason === 'not_mine');
  check('🔴 승인된 건은 못 지운다 — 돈이 나갔거나 바깥으로 나갔다(③ 취소 결재로 간다)',
    canDelete({ ...base, status: 'approved' }).reason === 'not_withdrawn');
  check('🔴 반려된 건도 못 지운다 — 결재자가 «아니오» 라고 판단한 기록이다',
    canDelete({ ...base, status: 'rejected' }).reason === 'not_withdrawn');
  check('🔴 대기 중인 건도 못 지운다 — 지금 남이 보고 있다(먼저 회수해야 한다)',
    canDelete({ ...base, status: 'pending' }).reason === 'not_withdrawn');
  check('⛔ 이미 취소된 건도 못 지운다',
    canDelete({ ...base, status: 'cancelled' }).reason === 'not_withdrawn');
  check('빈 계정으로는 통과하지 않는다 (막는 쪽으로 실패)',
    canDelete({ me: '', requesterUsername: '', status: 'withdrawn' }).reason === 'not_mine');

  /* 🔴 «회수 → 다시 올리기 → 원본 삭제» 가 지연을 지우는 우회로가 되면 안 된다.
     원본을 지우면 자식의 origin_created_at 이 NULL 이 되어 「N일째」가 오늘로 초기화된다 —
     ①②를 만들 때 막으려던 바로 그 구멍이 다시 열린다. */
  check('🔴 이어받아 다시 올린 결재가 있으면 원본을 못 지운다 (지연을 지우는 우회로 차단)',
    canDelete({ ...base, hasResubmitChild: true }).reason === 'has_child');
  check('짝 검사 — 이어받은 것이 없으면 지울 수 있다 (전부 막는 코드는 여기서 걸린다)',
    canDelete({ ...base, hasResubmitChild: false }).ok === true);
  /* 🔴 fail-closed — 자식 조회가 «실패» 했을 때 «없다» 로 떨어뜨리면 위 가드가 통째로 열린다.
     (함정 대조 2026-09-06: safe(…, null) → !!null → false → 삭제 진행) */
  check('🔴 자식 여부를 «모르면»(null) 지우지 않는다 — 되돌릴 수 없는 조작은 막는 쪽으로 실패',
    canDelete({ ...base, hasResubmitChild: null }).reason === 'lookup_failed');
  check('🔴 자식 여부를 «안 넘기면»(undefined) 도 지우지 않는다 — 안전장치가 꺼진 것이 기본값이면 안 된다',
    canDelete({ me: 'admin', requesterUsername: 'admin', status: 'withdrawn' }).reason === 'lookup_failed');
  check('짝 — 그래도 상태·소유자 판정이 먼저다 (승인 건은 모르든 말든 not_withdrawn)',
    canDelete({ ...base, status: 'approved', hasResubmitChild: null }).reason === 'not_withdrawn');

  /* 🔴 첨부 열쇠 — 그 칸에 다른 것이 들어 있으면 엉뚱한 파일을 지운다(되돌릴 수 없다). */
  check('결재 첨부 열쇠만 지울 수 있다고 판정한다',
    isApprovalFileKey('approval/1788421000581-vctzr1.jpg') === true);
  check('🔴 녹화 파일 열쇠는 «아니라고» 한다 (엉뚱한 것을 지우면 되돌릴 수 없다)',
    isApprovalFileKey('rec/2026-09/abc.webm') === false);
  check('⛔ 접두사만 있고 이름이 없으면 아니다', isApprovalFileKey('approval/') === false);
  check('⛔ 빈 값·null 도 아니다',
    isApprovalFileKey('') === false && isApprovalFileKey(null) === false);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * [②] 취소 결재 판정
 * ═════════════════════════════════════════════════════════════════════════ */
sec('[②] 취소 결재 — canReverse 를 실제로 돌린다');
{
  const base = { me: 'mgr_karl', isExec: false, requesterUsername: 'mgr_karl', status: 'approved' };

  check('올린 사람 본인은 취소를 요청할 수 있다 (짝 검사)',
    canReverse(base).ok === true, JSON.stringify(canReverse(base)));
  check('경영진은 남의 승인 건에도 취소를 요청할 수 있다 (짝 검사)',
    canReverse({ ...base, me: 'admin', isExec: true }).ok === true);

  check('⛔ 남의 건을 일반 직원이 취소 요청할 수 없다',
    canReverse({ ...base, me: 'mgr_lby' }).reason === 'not_allowed');
  check('⛔ 대기 중인 건은 취소 결재 대상이 아니다 (그건 ① 회수다)',
    canReverse({ ...base, status: 'pending' }).reason === 'not_approved');
  check('⛔ 반려된 건은 취소할 것이 없다',
    canReverse({ ...base, status: 'rejected' }).reason === 'not_approved');
  check('⛔ 이미 취소된 건은 다시 취소하지 않는다',
    canReverse({ ...base, status: 'cancelled' }).reason === 'already_cancelled');
  check('⛔ cancelled_by_id 가 있으면 상태와 무관하게 이미 취소된 것으로 본다',
    canReverse({ ...base, cancelledById: 7 }).reason === 'already_cancelled');
  check('⛔ 취소 결재가 이미 올라와 결재를 기다리면 두 벌 만들지 않는다',
    canReverse({ ...base, openReverseId: 12 }).reason === 'already_requested');

  check('취소 결재 제목은 원본을 가리킨다',
    reverseTitle('9월 사무용품') === '[취소] 9월 사무용품');
  check('제목이 아주 길어도 저장 상한(200자)을 넘기지 않는다',
    reverseTitle('가'.repeat(400)).length === 200);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * [③] 상태 어휘 — 새 상태가 «합계» 와 «찾기» 에 제대로 반영되는가
 * ═════════════════════════════════════════════════════════════════════════ */
sec('[③] 상태 어휘 — 정본 한 곳에서 나오는가');
{
  check('다섯 상태가 정본에 있다',
    ['pending', 'approved', 'rejected', 'withdrawn', 'cancelled'].every(k => STATUS_KEYS.indexOf(k) >= 0),
    JSON.stringify(STATUS_KEYS));
  check('상태마다 한국어·영어 이름이 있다 (화면·엑셀이 영문 코드를 날것으로 찍지 않게)',
    STATUSES.every(s => s.ko && s.en && s.ko !== s.key));
  check('모르는 상태에는 이름을 지어내지 않는다',
    statusSpec('zzz') === null && statusSpec(null) === null);

  // 🔴 합계에 들어가는가 — 이 한 줄이 지출 정리·맨 위 요약을 함께 좌우한다
  check('승인·대기는 지출 합계에 들어간다 (짝 검사)',
    countsAsSpend('approved') === true && countsAsSpend('pending') === true);
  check('🔴 회수·취소·반려는 «안 쓴 돈» 이라 합계에 안 들어간다',
    countsAsSpend('withdrawn') === false && countsAsSpend('cancelled') === false
    && countsAsSpend('rejected') === false);
  check('대기 중만 «살아 있는» 건이다',
    isLive('pending') === true && isLive('withdrawn') === false && isLive('cancelled') === false);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * [④] 지출 정리가 새 상태를 «따로» 세는가 — 정본을 실제로 돌린다
 * ═════════════════════════════════════════════════════════════════════════ */
sec('[④] 지출 정리 — 회수·취소가 금액에 섞이지 않고, 건수는 말해지는가');
{
  const rows = [
    { id: 1, req_type: 'expense',  status: 'approved',  amount: 1000, currency: 'PHP', category: 'supplies' },
    { id: 2, req_type: 'expense',  status: 'pending',   amount: 200,  currency: 'PHP', category: 'supplies' },
    { id: 3, req_type: 'expense',  status: 'withdrawn', amount: 9999, currency: 'PHP', category: 'supplies' },
    { id: 4, req_type: 'purchase', status: 'cancelled', amount: 8888, currency: 'PHP', category: 'equipment' },
    { id: 5, req_type: 'expense',  status: 'rejected',  amount: 7777, currency: 'PHP', category: 'supplies' },
  ];
  const s = summarizeApprovals(rows);
  const php = (arr) => (arr.find(m => m.currency === 'PHP') || { total: null }).total;

  check('승인 합계에 회수·취소 금액이 섞이지 않는다',
    php(s.approved_money) === 1000, JSON.stringify(s.approved_money));
  check('대기 합계도 마찬가지 (짝 검사 — 대기는 실제로 세어진다)',
    php(s.pending_money) === 200, JSON.stringify(s.pending_money));
  check('🔴 회수·취소를 «other» 로 묻지 않고 따로 센다 (사람이 「합계에 왜 없지」를 설명할 수 있게)',
    s.by_status.withdrawn === 1 && s.by_status.cancelled === 1 && s.by_status.other === 0,
    JSON.stringify(s.by_status));
  check('반려도 그대로 따로 센다',
    s.by_status.rejected === 1 && s.by_status.approved === 1 && s.by_status.pending === 1);

  /* 🔴 2026-09-05 함정 대조가 잡은 것 — 원본과 «취소 결재» 를 «짝» 으로 안 넣으면
     이 절이 통째로 헛돈다. 취소 결재는 원본의 금액·항목을 그대로 복사해 만들어지므로,
     안 거르면 ① 올린 순간 두 배로 세고 ② 승인돼도 총액이 한 푼도 안 준다. */
  const pair = (revStatus) => summarizeApprovals([
    { id: 10, req_type: 'expense', status: (revStatus === 'approved' ? 'cancelled' : 'approved'),
      amount: 500000, currency: 'KRW', category: 'supplies' },
    { id: 11, req_type: 'expense', status: revStatus, amount: 500000, currency: 'KRW',
      category: 'supplies', reverses_id: 10 },
  ]);
  const krw = (arr) => (arr.find(m => m.currency === 'KRW') || { total: 0 }).total;

  const p1 = pair('pending');
  check('🔴 취소 결재를 올린 순간 그 돈이 «두 번» 세어지지 않는다',
    krw(p1.approved_money) === 500000 && krw(p1.pending_money) === 0,
    JSON.stringify({ a: p1.approved_money, p: p1.pending_money }));
  check('🔴 그때 항목 합계도 두 배가 되지 않는다',
    (p1.by_category.find(c => c.key === 'supplies') || {}).count === 1,
    JSON.stringify(p1.by_category));

  const p2 = pair('approved');
  check('🔴 취소가 승인되면 총액이 실제로 «줄어든다» (원본이 빠진 자리를 취소 결재가 채우지 않는다)',
    krw(p2.approved_money) === 0, JSON.stringify(p2.approved_money));
  check('취소 결재 자신은 지출 행이 아니다 (정본 isSpendRow)',
    isSpendRow({ status: 'approved', reverses_id: 10 }) === false
    && isSpendRow({ status: 'approved' }) === true);

  const cat = s.by_category.find(c => c.key === 'supplies');
  check('항목별 집계에도 회수·취소가 안 들어간다',
    cat && cat.count === 2 && php(cat.money) === 1200, JSON.stringify(cat));
  check('취소된 물품 항목은 아예 줄이 안 생긴다 (「썼다」고 말하지 않는다)',
    !s.by_category.find(c => c.key === 'equipment'));
}

/* ═══════════════════════════════════════════════════════════════════════════
 * [⑤] 찾기 — 진짜 SQLite 에 걸어 본다
 * ═════════════════════════════════════════════════════════════════════════ */
sec('[⑤] 문서함 찾기 — buildFindQuery 를 진짜 SQLite 에 돌린다');
{
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE approval_requests (
    id INTEGER PRIMARY KEY, req_type TEXT, requester_username TEXT, requester_name TEXT,
    title TEXT, body TEXT, category TEXT, amount REAL, currency TEXT,
    status TEXT, created_at INTEGER, origin_id INTEGER, reverses_id INTEGER)`);
  const ins = db.prepare(`INSERT INTO approval_requests
    (id, req_type, requester_username, title, body, status, created_at)
    VALUES (?,?,?,?,?,?,?)`);
  const T0 = Date.UTC(2026, 8, 1, 0, 0, 0);
  ins.run(1, 'expense', 'mgr_lby', '가', '', 'pending',   T0);
  ins.run(2, 'expense', 'mgr_lby', '나', '', 'approved',  T0);
  ins.run(3, 'expense', 'mgr_lby', '다', '', 'rejected',  T0);
  ins.run(4, 'expense', 'mgr_lby', '라', '', 'withdrawn', T0);
  ins.run(5, 'expense', 'mgr_lby', '마', '', 'cancelled', T0);
  ins.run(6, 'expense', 'mgr_karl', '바', '', 'withdrawn', T0);

  const run = (inp) => {
    const q = buildFindQuery(inp);
    return db.prepare('SELECT id FROM approval_requests' + q.cond + q.order).all(...q.binds).map(r => r.id);
  };

  check('상태로 «회수됨» 을 찾을 수 있다 (짝 검사 — 목록을 손으로 적으면 여기서 걸린다)',
    JSON.stringify(run({ me: 'mgr_lby', scope: 'mine', status: 'withdrawn' })) === '[4]');
  check('상태로 «취소됨» 도 찾을 수 있다',
    JSON.stringify(run({ me: 'mgr_lby', scope: 'mine', status: 'cancelled' })) === '[5]');
  check('아는 상태만 조건이 된다 (모르는 값에 조건을 몰래 넣지 않는다)',
    run({ me: 'mgr_lby', scope: 'mine', status: 'zzz' }).length === 5);
  check('「반려·회수·취소」 함은 셋을 한자리에서 보여 준다',
    JSON.stringify(run({ me: 'mgr_lby', scope: 'rejected' }).sort()) === '[3,4,5]');
  check('⛔ 그 함에 남의 건이 섞이지 않는다',
    run({ me: 'mgr_lby', scope: 'rejected' }).indexOf(6) < 0);
  check('「진행 중」함에는 회수된 건이 안 남는다 (결재를 기다리지 않으므로)',
    JSON.stringify(run({ me: 'mgr_lby', scope: 'open' })) === '[1]');
  db.close();
}

/* ═══════════════════════════════════════════════════════════════════════════
 * [⑥] 중복 감지·요약 SQL — 소스에서 오려 내 진짜 SQLite 에 돌린다
 * ═════════════════════════════════════════════════════════════════════════ */
sec('[⑥] 중복 감지·요약 SQL — 회수·취소가 «쓴 돈» 으로 세어지지 않는가');
{
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE approval_requests (
    id INTEGER PRIMARY KEY, req_type TEXT, requester_username TEXT,
    amount REAL, currency TEXT, status TEXT, created_at INTEGER, spent_at TEXT,
    reverses_id INTEGER)`);
  const ins = db.prepare(`INSERT INTO approval_requests
    (id, req_type, requester_username, amount, currency, status, created_at) VALUES (?,?,?,?,?,?,?)`);
  const now = Date.now();
  ins.run(1, 'expense', 'mgr_lby', 500, 'PHP', 'approved',  now - 1000);
  ins.run(2, 'expense', 'mgr_lby', 500, 'PHP', 'withdrawn', now - 1000);
  ins.run(3, 'expense', 'mgr_lby', 500, 'PHP', 'cancelled', now - 1000);
  ins.run(4, 'expense', 'mgr_lby', 500, 'PHP', 'rejected',  now - 1000);
  // 🔁 취소 결재는 원본과 «금액이 같다» — 중복으로 세면 정상 재청구에 거짓 경고가 붙는다
  db.prepare(`INSERT INTO approval_requests
    (id, req_type, requester_username, amount, currency, status, created_at, reverses_id)
    VALUES (?,?,?,?,?,?,?,?)`).run(5, 'expense', 'mgr_lby', 500, 'PHP', 'approved', now - 1000, 1);

  // 소스에서 그 조건을 오려 낸다 — 손으로 베끼면 코드가 바뀌어도 검사가 안 따라온다.
  const m = apiNC.match(/SELECT COUNT\(\*\) AS c FROM approval_requests\s*\n\s*WHERE requester_username = \? AND req_type = \? AND currency = \?[\s\S]*?`/);
  check('중복 감지 SQL 을 소스에서 오려 냈다 (전제 — 못 오리면 아래가 헛돈다)', !!m);
  if (m) {
    const sql = m[0].replace(/`$/, '');
    const c = db.prepare(sql).get('mgr_lby', 'expense', 'PHP', 500, now - 30 * 86400000);
    check('🔴 회수·취소·반려는 «또 올린 것» 으로 세지 않는다 (승인 1건만)',
      Number(c.c) === 1, JSON.stringify(c));
  }
  db.close();
}

/* ═══════════════════════════════════════════════════════════════════════════
 * [⑦] 서버 배선 — 그 함정들을 실제로 안 밟았는가
 * ═════════════════════════════════════════════════════════════════════════ */
sec('[⑦] 서버 배선');
{
  const wBlock = blockFrom(api, "const mWithdraw = path.match(");
  check('회수 라우트를 잘라 냈다 (전제)', wBlock.length > 300);
  check('회수 판정을 정본(canWithdraw)에 맡긴다 — 라우트 안에 규칙을 다시 적지 않는다',
    /canWithdraw\(\{/.test(wBlock));
  check('«이미 누가 결재했나» 를 단계 표에서 직접 센다 (상태만 보면 다단계에서 놓친다)',
    /approval_steps[\s\S]{0,200}status IN \('approved','rejected'\)/.test(wBlock));
  check('🔴 조건부 UPDATE 로 경합을 DB 에서 한 번 더 막는다',
    /UPDATE approval_requests[\s\S]{0,400}WHERE id = \? AND status = 'pending' AND requester_username = \?/.test(wBlock));
  check('⛔ 회수를 rejected 로 쓰지 않는다 (「반려당함」과 다른 사실)',
    /status = 'withdrawn'/.test(wBlock) && !/SET status = 'rejected'/.test(stripComments(wBlock)));
  check('이력을 남긴다 — 남은 단계를 닫는다',
    /UPDATE approval_steps SET status = 'withdrawn'/.test(wBlock));
  check('기다리던 결재자에게 알린다 (결재함에서 사라진 이유를 말해 준다)',
    /notify\(env, targets, 'Withdrawn/.test(wBlock));
  /* 🔴 단계 조회가 실패했을 때 «아무도 안 눌렀다» 로 떨어뜨리면 결재 도장이 찍힌 건도 회수되고,
     이제는 그 뒤 삭제까지 이어져 결재자의 판단 기록이 통째로 사라진다. 모르면 회수하지 않는다. */
  check('🔴 회수도 fail-closed — 단계 조회가 실패하면 503 lookup_failed 로 거절한다',
    /let anyDecided: boolean \| null = null;/.test(wBlock)
    && /if \(anyDecided === null\)/.test(wBlock) && /error: 'lookup_failed'/.test(wBlock)
    && !/safe\(async \(\) => await env\.DB\.prepare\(\s*`SELECT COUNT\(\*\) AS c FROM approval_steps/.test(stripComments(wBlock)));

  const dBlock = blockFrom(api, "const mDel = path.match(");
  check('삭제 라우트를 잘라 냈다 (전제)', dBlock.length > 300);
  check('삭제 판정을 정본(canDelete)에 맡긴다', /canDelete\(\{/.test(dBlock));
  check('🔴 «이어받아 다시 올린 건» 이 있는지 서버가 실제로 조회한다',
    /SELECT id FROM approval_requests WHERE origin_id = \? LIMIT 1/.test(dBlock)
    && /hasResubmitChild: hasChild/.test(dBlock));
  /* 🔴 그 조회가 실패하면 «모른다»(null) 로 넘겨야 한다 — safe(…, null) 로 감싸 «없다» 에
     떨어뜨리면 가드가 fail-open 이다. 변수가 null 로 시작하고 try 안에서만 채워지는지 본다. */
  check('🔴 자식 조회는 fail-closed — null 로 시작해 성공했을 때만 채운다 (safe 로 «없다» 에 떨어뜨리지 않는다)',
    /let hasChild: boolean \| null = null;/.test(dBlock)
    && !/safe\(async \(\) => await env\.DB\.prepare\(\s*`SELECT id FROM approval_requests WHERE origin_id/.test(stripComments(dBlock)));
  check('🔴 모르면 503 으로 거절하고 화면에 «확인이 끝나지 않아 지우지 않았다» 고 말한다',
    /lookup_failed' \? 503 : 403/.test(dBlock) && /lookup_failed:\s*\['확인이 끝나지 않아 지우지 않았습니다/.test(dBlock));
  /* 🔴 TOCTOU — SELECT 시점의 자식 판정만 믿지 않는다. DELETE 의 WHERE 가 한 번 더 본다. */
  check('🔴 조건부 DELETE 의 WHERE 에도 «자식이 없다» 가 들어 있다 (그 사이에 다시 올려도 부모가 안 지워진다)',
    /DELETE FROM approval_requests[\s\S]{0,260}AND NOT EXISTS \(SELECT 1 FROM approval_requests c WHERE c\.origin_id = approval_requests\.id\)/.test(dBlock));
  check('0행이면 «자식이 생겼다» 와 «상태가 바뀌었다» 를 갈라 말한다',
    /AS kids/.test(dBlock) && /fail\('has_child', 403/.test(dBlock) && /fail\('changed', 409/.test(dBlock));
  check('⚠️ 404·409 에도 문구가 있다 — 지운 뒤 한 번 더 누른 것이 「지우지 못했습니다」로 읽히면 안 된다',
    /not_found:\s*\['이미 지워졌거나 없는 결재입니다/.test(dBlock) && /changed:\s*\['그사이 상태가 바뀌어/.test(dBlock)
    && /return fail\('not_found', 404\)/.test(dBlock));
  check('⚠️ 첨부를 못 지웠으면 «어느 파일인지» 를 돌려준다 (R2 청소기가 approval/ 을 안 치우므로 사람이 찾아야 한다)',
    /file_key: fileGone === false \? String\(cur\.file_key\) : undefined/.test(dBlock));
  check('본사 계정만 닿는다', /if \(!isHqStaff\(actor\)\) return json/.test(dBlock));
  check('🔴 행을 «조건부» 로 지운다 — 그사이 상태가 바뀌면 0행이고 아무것도 안 잃는다',
    /DELETE FROM approval_requests\s*\n\s*WHERE id = \? AND status = 'withdrawn' AND requester_username = \?/.test(dBlock));
  check('단계 이력도 함께 지운다 (고아 행을 안 남긴다)',
    /DELETE FROM approval_steps WHERE request_id = \?/.test(dBlock));
  check('🔴 첨부도 R2 에서 지운다 (영수증 사진이 고아로 남지 않게)',
    /RECORDINGS\.delete\(String\(cur\.file_key\)\)/.test(dBlock));
  check('🔴 그때 접두사를 확인한다 (엉뚱한 파일을 지우면 되돌릴 수 없다)',
    /isApprovalFileKey\(cur\.file_key\)/.test(dBlock));
  check('⛔ 첨부를 못 지웠으면 조용히 넘기지 않는다 (고아 파일이 남은 것을 사람이 알아야 한다)',
    /console\.error\('\[approval-delete\]/.test(dBlock) && /file_deleted/.test(dBlock));
  check('누가 무엇을 지웠는지 서버 로그에 남긴다 (「그 건 어디 갔지?」를 물을 수 있게)',
    /console\.log\('\[approval-delete\] 삭제'/.test(dBlock));
  check('⛔ 제목·본문은 로그에 안 남긴다 (지운 사람의 뜻은 «없었던 것으로» 다)',
    !/title: cur\.title|body: cur\.body/.test(dBlock));
  /* 🔴 순서 — R2 를 먼저 지우고 행 삭제가 0행이면 «결재는 남았는데 영수증만 사라진» 상태가 된다. */
  check('🔴 행을 먼저 지우고 그 뒤에 첨부를 치운다 (순서가 뒤집히면 첨부만 사라진다)',
    dBlock.indexOf('DELETE FROM approval_requests') < dBlock.indexOf('RECORDINGS.delete'));

  const rBlock = blockFrom(api, "const mReverse = path.match(");
  check('취소 결재 라우트를 잘라 냈다 (전제)', rBlock.length > 300);
  check('취소 판정을 정본(canReverse)에 맡긴다', /canReverse\(\{/.test(rBlock));
  check('🔴 결재선을 원본과 «같은 규칙» 으로 만든다 (취소가 더 쉽게 통과하면 안 된다)',
    /stagesFor\(reqType, amount, currency\)/.test(rBlock));
  check('⛔ 승인 건을 그 자리에서 지우거나 바꾸지 않는다 (새 결재를 만들 뿐)',
    !/UPDATE approval_requests[\s\S]{0,120}status = 'cancelled'/.test(stripComments(rBlock)));
  check('사유를 반드시 받는다 (결재자가 그것으로 판단한다)',
    /reason_required/.test(rBlock));
  check('원본을 가리켜 둔다 (reverses_id)', /reverses_id\)/.test(rBlock));
  check('⛔ 금액의 부호를 뒤집지 않는다 (원본이 합계에서 빠지므로 이중 차감이 된다)',
    !/-\s*Number\(cur\.amount\)|amount \* -1|-amount/.test(stripComments(rBlock)));

  const rev = blockFrom(api, 'async function applyReversal(');
  check('applyReversal 을 잘라 냈다 (전제)', rev.length > 300);
  check('🔴 원본을 «승인» 일 때만 무효로 한다 (두 번 되돌리지 않는다)',
    /WHERE id = \? AND status = 'approved'/.test(rev));
  check('🔴 근무불가는 «우리가 만든 것» 만 지운다 (사람이 손댄 자리는 안 건드린다)',
    /DELETE FROM teacher_unavailability WHERE id = \? AND created_by = '결재 자동반영'/.test(rev));
  check('🔴 달 잠금도 «그 결재가 건 것» 일 때만 푼다',
    /unlockPeriod\(env, String\(orig\.hr_kind\), String\(orig\.period\), originalId\)/.test(rev));
  check('되돌리지 못한 것을 «말한다» (조용히 넘어가지 않는다)',
    /left\.push\(/.test(rev) && /undone\.push\(/.test(rev));
  check('⚠️ 되돌아오지 않는 것(옮긴 수업·나간 정산)을 사람에게 알린다',
    /되돌아오지 않습니다/.test(rev));
  check('예외를 던지지 않는다 (취소 결재는 이미 승인된 뒤다)',
    /catch \(e\)/.test(rev) && /console\.error\('\[approval-reverse\]/.test(rev));

  const unlock = blockFrom(hr, 'export async function unlockPeriod(');
  check('unlockPeriod 는 request_id 까지 맞을 때만 지운다',
    /WHERE kind = \? AND period = \? AND request_id = \?/.test(unlock));

  // 승인 시 배선
  check('취소 결재가 승인되면 applyReversal 이 돈다',
    /if \(finalStatus === 'approved' && cur\.reverses_id\)[\s\S]{0,160}applyReversal\(/.test(apiNC));
  check('무엇을 되돌렸는지 응답에 실어 화면이 사람에게 말할 수 있게 한다',
    /reversal,/.test(apiNC));
}

/* ═══════════════════════════════════════════════════════════════════════════
 * [⑧] 다시 올리기 — 「6일째」가 초기화되지 않는가
 * ═════════════════════════════════════════════════════════════════════════ */
sec('[⑧] 다시 올리기 — 원래 올린 날이 이어지는가');
{
  check('🔴 origin_id 는 «내» «회수된» 건일 때만 붙는다 (아무 건에나 남의 날짜를 붙이지 못하게)',
    /WHERE id = \? AND requester_username = \? AND status = 'withdrawn'/.test(apiNC));
  check('여러 번 재작성해도 «맨 처음» 을 가리킨다 (사슬이 중간에서 끊기지 않게)',
    /originId = Number\(og\.origin_id \|\| og\.id\)/.test(apiNC));
  check('⛔ 모르는 값에 400 을 주지 않는다 (결재를 못 올리게 막는 쪽이 더 나쁘다)',
    !/bad_origin|origin_required/.test(apiNC));
  check('INSERT 에 origin_id 가 실린다', /hr_kind, period, origin_id\)/.test(apiNC));

  /* 🔴 rowOf 가 읽는 칸을 SELECT 가 실제로 뽑는가 —
     안 뽑으면 «에러 없이 늘 빈 값» 이 되고 「N일째」가 조용히 오늘로 돌아간다.
     (CLAUDE.md 「SELECT 별칭만 두면 헬퍼가 읽는 필드가 없다」의 형제) */
  check('rowOf 가 origin_created_at 을 읽는다 (전제)',
    /origin_created_at: r\.origin_created_at/.test(apiNC));
  /* 템플릿 리터럴(백틱) 안의 SELECT 만 오린다 — 칸 식에 'withdrawn' 같은 홑따옴표가 들어 있어
     [^`']* 로 자르면 거기서 끊겨 «SELECT 가 없다» 는 거짓 FAIL 이 난다(2026-09-06 실측). */
  const selects = apiNC.match(/`SELECT \*[^`]*FROM approval_requests[^`]*`/g) || [];
  const feedRowOf = selects.filter(q => /requester_username = \? ORDER BY created_at DESC LIMIT 15`$/.test(q));
  check('🔴 「내가 올린 것」 조회가 그 칸을 실제로 뽑는다',
    feedRowOf.length === 1 && /AS origin_created_at/.test(feedRowOf[0]),
    JSON.stringify(feedRowOf));
  check('🔴 문서함 조회도 그 칸을 뽑는다',
    /AS origin_created_at, ' \+[\s\S]{0,240}FROM approval_requests" \+ cond/.test(apiNC));
  check('응답 모양이 바뀌었으니 홈 ETag 를 올렸다',
    /W\/"a([8-9]|\d\d)-/.test(apiNC));

  /* 🗑️ has_child — 화면이 「삭제」를 그릴지 정하는 칸. 세 SELECT 가 «전부» 뽑아야 한다.
     한 곳만 빠지면 그 화면에서만 버튼이 뜨고 눌러야 403 이 온다(에러 없음). */
  check('rowOf 가 has_child 를 읽는다 (전제)', /has_child: !!Number\(r\.has_child \|\| 0\)/.test(apiNC));
  const hasChildCol = /CASE WHEN approval_requests\.status = 'withdrawn' THEN EXISTS\(SELECT 1 FROM approval_requests c WHERE c\.origin_id = approval_requests\.id\) ELSE 0 END AS has_child/;
  check('🔴 「내가 올린 것」 조회가 has_child 를 뽑는다', feedRowOf.length === 1 && hasChildCol.test(feedRowOf[0]));
  check('🔴 문서함 조회도 has_child 를 뽑는다',
    (apiNC.match(/AS origin_created_at, ' \+\s*"CASE WHEN approval_requests\.status = 'withdrawn'[^"]*AS has_child FROM approval_requests" \+ cond/) || []).length === 1);
  check('🔴 단건 조회도 has_child 를 뽑는다',
    /AS origin_created_at, CASE WHEN approval_requests\.status = 'withdrawn'[\s\S]{0,200}AS has_child\s*\n\s*FROM approval_requests WHERE id = \? LIMIT 1/.test(apiNC));
  check('origin_id 에 인덱스를 둔다 (자식 조회가 세 SELECT + 삭제 게이트에서 돈다)',
    /CREATE INDEX IF NOT EXISTS idx_appr_origin ON approval_requests\(origin_id\)/.test(apiNC));
}

/* ═══════════════════════════════════════════════════════════════════════════
 * [⑨] 화면 배선 — 「눌러도 아무 일도 안 일어남」을 막는다
 * ═════════════════════════════════════════════════════════════════════════ */
sec('[⑨] 화면 배선');
{
  /* 🔴 이 화면의 스크립트는 닫힌 스코프다 — 인라인 onclick 이 부르는 이름은
     반드시 window 에 붙어 있어야 한다. 아니면 ReferenceError 만 나고 화면은 멀쩡해 보인다. */
  const called = new Set();
  for (const m of workNC.matchAll(/onclick="([A-Za-z_$][\w$]*)\s*\(/g)) called.add(m[1]);
  const missing = [...called].filter(n => !new RegExp('window\\.' + n + '\\s*=').test(workNC));
  check('🔴 인라인 onclick 이 부르는 이름이 전부 window 에 붙어 있다',
    missing.length === 0, missing.join(', '));
  check('새로 만든 것들도 그 안에 있다 (전제 — 없으면 위 검사가 헛돈다)',
    ['askWithdraw', 'doWithdraw', 'reSubmit', 'askReverse', 'askDelete', 'doDelete']
      .every(n => called.has(n)), JSON.stringify([...called]));

  /* 🗑️ 삭제 — 되돌릴 수 없는 조작이라 «누르기 전에» 말해야 한다. */
  const askDel = blockFrom(workNC, 'window.askDelete = function(');
  check('삭제 확인 블록을 잘라 냈다 (전제)', askDel.length > 200);
  check('🔴 «되돌릴 수 없다» 를 누르기 전에 말한다', /되돌릴 수 없습니다/.test(work));
  check('첨부가 있으면 «파일도 함께 지워진다» 고 말한다', /r\.has_file/.test(askDel));
  check('「그대로 두기」도 함께 준다 (되돌릴 길)', /그대로 두기/.test(workNC));
  /* ⛔ «거리» 로 재지 않는다 — 함정 대조 실측: 버튼을 withdrawn 블록 «밖» 으로 옮겨도
     'withdrawn' 과 askDelete( 사이가 253자라 400자 창 안에 들어와 그대로 통과했다.
     중괄호 짝으로 그 블록을 잘라 «안에 있고, 밖에는 없다» 를 센다. */
  const wdBlock = blockFrom(workNC, "if (r.status === 'withdrawn') {");
  const delInBlock = (wdBlock.match(/onclick="askDelete\(/g) || []).length;
  const delTotal   = (workNC.match(/onclick="askDelete\(/g) || []).length;
  check('⛔ 삭제 버튼은 회수된 건 블록 «안» 에만 그린다 (밖에는 한 곳도 없다)',
    wdBlock.length > 80 && delInBlock === 1 && delTotal === delInBlock,
    JSON.stringify({ inBlock: delInBlock, total: delTotal }));
  check('🔴 이어받아 다시 올린 결재가 있는 건(has_child)에는 삭제 버튼을 안 그리고 이유를 적는다',
    /if \(r\.has_child\)\s*\{[\s\S]{0,400}이어받아 다시 올린 결재가 있어 지울 수 없습니다[\s\S]{0,400}\}\s*else\s*\{[\s\S]{0,300}onclick="askDelete\(/.test(wdBlock));
  check('⚠️ 첨부를 못 지웠으면 «어느 파일인지» 도 함께 보여준다', /res\.j\.file_key/.test(workNC));
  check('DELETE 메서드로 부른다', /method: 'DELETE'/.test(workNC));
  check('⚠️ 첨부를 못 지웠으면 «지웠다» 고만 말하지 않는다',
    /file_deleted === false/.test(workNC));

  check('🔴 「며칠째」를 원래 올린 날부터 센다 (다시 올려도 초기화되지 않게)',
    /Number\(r\.origin_created_at \|\| 0\) \|\| Number\(r\.created_at \|\| 0\)/.test(workNC));
  check('폼이 «다시 올리는 중» 이라고 말한다', /RESUBMIT_OF\)/.test(workNC) && /resubNote/.test(workNC));
  check('⛔ 폼을 닫으면 그 표식도 지운다 (다음 건에 남의 원본이 붙지 않게)',
    /CKEY = null; RESUBMIT_OF = null/.test(workNC));
  check('⛔ 다른 분류를 고르면 그 표식을 지운다',
    /PICK = found; OCR = null; FILE = null; RESUBMIT_OF = null/.test(workNC));
  check('제출 본문에 origin_id 를 싣는다',
    /fd\.append\('origin_id'/.test(workNC));

  check('회수는 «되돌릴 수 있다» 를 누르기 전에 말한다',
    /다시 올릴 수 있습니다/.test(work));
  check('🔴 취소 요청은 «지우는 것이 아니다» 를 누르기 전에 말한다',
    /지우는 것이 아닙니다/.test(work));
  check('판정을 «성공이라고 말했는가» 로 한다 (ok 칸이 없는 404 가 통과하지 않게)',
    (workNC.match(/res\.j && res\.j\.ok === true/g) || []).length >= 2);
  check('상태 이름은 서버가 준 것을 쓴다 (상태가 늘 때 화면만 모르지 않게)',
    /EN\(\) \? r\.status_en : r\.status_ko/.test(workNC));

  /* 아이콘이 아니라 «글자» 버튼이라 data-ko/data-en 함정은 없지만,
     터치 표적과 글자 크기는 확인한다(16px 아래면 iOS 가 화면을 확대한다). */
  const mini = work.match(/\.mini\{[^}]*\}/);
  check('작은 버튼의 글자가 16px 이상이다 (iOS 확대 방지)',
    !!mini && /font-size:16px/.test(mini[0]), mini ? mini[0] : '없음');
  check('터치 표적이 44px 이상이다', !!mini && /min-height:44px/.test(mini[0]));
  check('⛔ 안내 줄을 flex 로 감싸지 않는다 (짧은 문장이 낱글자로 쪼개진다)',
    !/\.whynote\{[^}]*display:flex/.test(work));
}

/* ═══════════════════════════════════════════════════════════════════════════
 * [⑩] 정본이 한 곳인가 — 규칙을 두 벌로 복제하지 않았는가
 * ═════════════════════════════════════════════════════════════════════════ */
sec('[⑩] 정본이 한 곳인가');
{
  check('상태 라벨을 엑셀이 손으로 적지 않는다 (STATUSES 에서 만든다)',
    /for \(const st of STATUSES\) STAT\[st\.key\] = st\.ko/.test(apiNC));
  check('찾기 상태 필터도 목록을 손으로 적지 않는다',
    /STATUS_KEYS\.indexOf\(st\) >= 0/.test(stripComments(pol)));
  check('지출 합계 판정이 정본 한 곳(isSpendRow)을 지난다',
    /const counted = isSpendRow\(r\)/.test(stripComments(pol)));
  check('그 정본이 countsAsSpend 를 품는다 (상태 판정을 두 벌로 안 만든다)',
    /export function isSpendRow[\s\S]{0,400}countsAsSpend\(row\.status\)/.test(stripComments(pol)));

  /* #14 — 부정·긍정 문구 검사는 **주석을 벗긴 사본**에 물어야 한다.
     원본(work)으로 물으면 화면에서 지우고 주석에만 남겨도 통과한다. */
  check('회수 안내가 «주석이 아니라 화면» 에 있다',
    /다시 올릴 수 있습니다/.test(workNC));
  check('취소 안내도 화면에 있다', /지우는 것이 아닙니다/.test(workNC));

  /* #15 — 화면 상태 목록도 손으로 적지 않는가 (서버만 넓히면 사람은 못 고른다) */
  check('🔴 화면 상태 필터도 서버 목록(D.statuses)으로 그린다',
    /\(D && D\.statuses\) \|\| \[\]/.test(workNC));
  check('서버가 그 목록을 실제로 내려준다',
    /statuses: STATUSES\.map\(/.test(apiNC));
  check('🔴 「반려함」 이름표가 셋을 담는다고 말한다 (「반려」라고만 하면 거짓말)',
    /안 된 것 \(반려·회수·취소\)/.test(work));

  /* 진행바 — 배지는 「회수됨」인데 바로 아래가 「대기」라고 말하면 한 카드가 서로 다른 말을 한다 */
  const trk = blockFrom(workNC, 'function trackHtml(');
  check('진행바를 잘라 냈다 (전제)', trk.length > 200);
  check('🔴 끝난 건의 남은 단계를 「대기」라고 말하지 않는다',
    /!isLiveStatus\(r\.status\)/.test(trk));
  check('«완료» 칸은 서버가 준 상태 이름을 쓴다 (상태가 늘 때 그 칸만 비지 않게)',
    /endLabel\(r\)/.test(trk));

  /* 다시 올리기 — 잘린 본문을 그대로 채우면 «내용이 말없이 바뀐다» */
  check('🔴 목록 본문이 잘렸으면 원문을 받아 온 뒤 채운다',
    /r\.body_truncated/.test(workNC) && /\/api\/approval\/requests\/' \+ id/.test(workNC));
  check('⛔ 못 받아 오면 아무것도 안 채운다 (잘린 채 「채웠습니다」가 더 나쁘다)',
    /아무것도 채우지 않았습니다/.test(workNC));
  check('서버가 «잘렸다» 를 말해 준다', /body_truncated: bodyCut/.test(apiNC));
  check('단건 조회는 목록과 «같은 판정»(canView)을 쓴다 — 여기만 느슨하면 새 구멍이다',
    /const mOne = path\.match[\s\S]{0,900}canView\(actor, r\.req_type/.test(apiNC));

  /* 토스트가 거짓말하지 않는가 — pick() 이 폼을 닫았는데 「채웠습니다」가 뜨면 안 된다 */
  check('채우기가 성공 여부를 돌려준다',
    /if \(!PICK\) return false;/.test(workNC) && /if \(fillFormFrom\(/.test(workNC));

  /* 주간 리포트 — 상태가 늘면 a+b+c ≠ total 이 되고, 회수가 평균을 오염시킨다 */
  check('🔴 주간 리포트가 회수·취소도 센다 (합이 안 맞는 문장을 안 보낸다)',
    /AS wd_n/.test(apiNC) && /AS cx_n/.test(apiNC) && /회수 '/.test(api));
  check('🔴 평균 처리 시간에서 회수를 뺀다 (기안자가 5분 만에 내린 것이 «빠른 결재» 로 섞인다)',
    /AVG\(decided_at - created_at\)[\s\S]{0,200}status IN \('approved','rejected'\)/.test(apiNC));

  /* 되돌리기 실패를 «사람이 손댔다» 로 단정하지 않는가 */
  check('🔴 「못 읽었다」와 「지울 것이 없었다」를 가른다 (원인을 단정하지 않는다)',
    /읽지 못했습니다/.test(api) && /사람이 손댔거나 이미 지워짐/.test(api));

  /* 맨 위 요약·중복 감지 SQL 도 취소 결재를 뺀다 */
  check('🔴 맨 위 요약 SQL 이 취소 결재를 뺀다 (안 빼면 총액이 한 푼도 안 준다)',
    /AND reverses_id IS NULL` \+ \(sumAll/.test(apiNC));
  check('중복 감지도 취소 결재를 «또 올린 것» 으로 안 센다',
    /status NOT IN \('rejected','withdrawn','cancelled'\)\s*\n\s*AND reverses_id IS NULL/.test(apiNC));
  check('⛔ 「approved || pending」 을 다시 손으로 적은 자리가 남아 있지 않다',
    !/st === 'approved' \|\| st === 'pending'/.test(stripComments(pol)));
  /* 🪤 처음엔 «setVal('f_title') 이 몇 번 나오는가» 로 셌는데, 그 글자는
     OCR 채움·음성 채움·다시 그릴 때 값 챙기기·초안 복원에도 나온다 — 서로 다른 일이다.
     **개수** 가 아니라 «지난번과 같이» 가 정본에 «맡기는가» 를 물어야 한다. */
  /* 다른 화면 셋(teacher·manager·admin)은 `j.pending` 숫자 하나만 읽어 배지를 그린다.
     그 숫자는 status='pending' 으로 세므로 회수하면 저절로 빠진다 — 그 전제를 못 박는다.
     ⚠️ 이 조건이 느슨해지면(예: status != 'rejected') 회수한 건이 배지에 계속 남는다. */
  check('배지 숫자는 «대기 중» 으로만 센다 (회수하면 저절로 빠진다)',
    /SELECT COUNT\(\*\) AS c FROM approval_requests WHERE status='pending' AND requester_username != \?/.test(apiNC));

  const reuseFn = blockFrom(workNC, 'window.reuse = function(');
  check('「지난번과 같이」 블록을 잘라 냈다 (전제)', reuseFn.length > 40, reuseFn.slice(0, 60));
  check('「지난번과 같이」가 채우기를 정본(fillFormFrom)에 맡긴다 — 규칙을 두 벌로 안 만든다',
    /fillFormFrom\(/.test(reuseFn));
  check('⛔ 그 안에서 칸을 직접 채우지 않는다 (한쪽만 고쳐지는 사고 방지)',
    !/setVal\(/.test(reuseFn), reuseFn);
}

console.log('\n──────────────────────────────────────');
console.log(FAIL ? ('  ❌ ' + FAIL + '건 실패 / ' + (PASS + FAIL) + '건')
                 : ('  ✅ ' + PASS + '건 전부 통과 — 회수·재작성·취소 결재가 사실을 말합니다.'));
process.exit(FAIL ? 1 : 0);
