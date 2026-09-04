// -*- coding: utf-8 -*-
// 🔐 출석 소프트 인증(_attnSoftAuthOk)이 «계정 아이디» 와 비교하는지 — 가짜 요청으로 실제로 돌리는 하니스
//   실행:  node test-harness/attendance_soft_auth_harness.mjs
//   변이시험(고치기 «전» 소스로 돌려 FAIL 이 나는지):
//         git show origin/main:cloudflare-deploy/src/api-mango.ts > /tmp/old.ts
//         ATTN_SRC_FILE=/tmp/old.ts node test-harness/attendance_soft_auth_harness.mjs   # → FAIL 이어야 한다
//
//   [무슨 사고였나 — 2026-09-03 진단]
//     헬퍼는 「토큰이 있으면 토큰 uid 가 claimedUid 와 같아야 통과」인데, 출석 호출부 둘(join·checkin)이
//     b.user_id 를 넘겼다. 그런데 mango-attendance.js 의 user_id 는 계정이 아니라 기기 식별자(`u_`+난수)
//     또는 DO 임시번호이고, 계정은 account_uid 로 따로 실린다. 로그인한 학생은 mango_token 도 보내므로
//     토큰 uid(jye46712) ≠ user_id(u_j4cs5c65bp) → 항상 403 uid_mismatch.
//     운영 D1 실측: attendance.account_uid 가 남은 계정이 전 기간 4개뿐.
//
//   [왜 문자열 검사가 아니라 실행인가]
//     함수도 조건도 «있고» 틀린 것은 «무엇과 비교하는가» 뿐이다. 「_attnSoftAuthOk 를 부르는가」·
//     「uid_mismatch 를 돌려주는가」를 문자열로 세면 사고 상태에서도 전부 초록이다.
//     그래서 ① 헬퍼 본문과 ② 호출부 넷의 «인자식» 을 소스에서 오려 내, 가짜 checkAdminSession·
//     authUidGlobal·body 를 물려 실제로 평가한다. 호출부가 b.user_id 로 되돌아가면 (a) 가 실제로 FAIL 난다.
//
//   [검사]
//     A. 헬퍼 단독 — 관리자 세션 / 토큰 없음 / 토큰=계정 / 토큰≠계정 / 계정 비움(옛 클라) / 검증 중 예외
//     B. 호출부 × 시나리오 — join·checkin 은 «실제 클라이언트 모양» 의 body(user_id=u_…, account_uid=계정)로,
//        consents POST·withdraw 는 «그 파일이 보내는 모양»(user_id=계정)으로
//     C. 변이 대조 — 옛 인자(b.user_id)를 같은 시나리오에 넣으면 (a) 가 막힌다는 것을 하니스 자신이 보여 준다
//     D. 클라이언트 계약 — mango-attendance.js 가 account_uid·token 을 싣고, mango-consent.js 가 user_id 에 계정을 싣는다
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CF = join(__dirname, '..', 'cloudflare-deploy');
const read = (p) => readFileSync(join(CF, p), 'utf8');

const SRC_FILE = process.env.ATTN_SRC_FILE || join(CF, 'src', 'api-mango.ts');
const src = readFileSync(SRC_FILE, 'utf8');
const attnJs = read('public/js/mango-attendance.js');
const consentJs = read('public/js/mango-consent.js');

let PASS = 0, FAIL = 0; const out = [];
const ok = (c, l) => { c ? (PASS++, out.push('  ✅ ' + l)) : (FAIL++, out.push('  ❌ ' + l)); };

// ── 중괄호 짝으로 자르기(길이로 자르지 않는다 — 규칙서 2장) ──
function braceBlock(text, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return text.slice(openIdx, i + 1); }
  }
  return '';
}
function handlerBlock(pathLit) {
  const i = src.indexOf(`path === '${pathLit}'`);
  if (i < 0) return '';
  const open = src.indexOf('{', i);
  return braceBlock(src, open);
}

// ── ① 헬퍼를 오려 내 실제 함수로 만든다 ──
const helperAt = src.indexOf('const _attnSoftAuthOk = async (');
ok(helperAt > 0, '헬퍼 _attnSoftAuthOk 가 소스에 있다');
let helperFn = null;
if (helperAt > 0) {
  const arrowStart = src.indexOf('async (', helperAt);
  const bodyOpen = src.indexOf('{', src.indexOf('=>', arrowStart));
  const body = braceBlock(src, bodyOpen);
  const head = src.slice(arrowStart, bodyOpen);            // async (a: string, b: any): Promise<boolean> =>
  const params = head.slice(head.indexOf('(') + 1, head.indexOf(')')).split(',').map(s => s.split(':')[0].trim()).join(', ');
  const expr = `async (${params}) => ${body.replace(/\s+as\s+any/g, '')}`;
  try {
    // request·url·env·checkAdminSession·authUidGlobal 은 클로저 변수 — 여기서 주입한다.
    const mk = new Function('checkAdminSession', 'authUidGlobal', 'request', 'url', 'env', 'return (' + expr + ');');
    helperFn = (deps) => mk(deps.checkAdminSession, deps.authUidGlobal, deps.request || {}, deps.url || {}, deps.env || {});
    ok(true, '헬퍼를 오려 내 실행 가능한 함수로 만들었다');
  } catch (e) {
    ok(false, '헬퍼를 실행 가능한 함수로 만들지 못함: ' + String(e && e.message));
  }
}

// ── ② 호출부 넷의 «인자식» 을 오려 낸다 ──
const CALLERS = [
  { key: 'join',     path: '/api/attendance/join',     kind: 'attendance' },
  { key: 'checkin',  path: '/api/attendance/checkin',  kind: 'attendance' },
  { key: 'consent',  path: '/api/consents',            kind: 'consent'    },
  { key: 'withdraw', path: '/api/consents/withdraw',   kind: 'consent'    },
];
const argFns = {};
for (const c of CALLERS) {
  const blk = handlerBlock(c.path);
  const m = blk.match(/_attnSoftAuthOk\(([^,()]+),\s*b\)/);
  ok(!!m, `${c.path} — 핸들러 안에서 _attnSoftAuthOk(<인자>, b) 를 부른다`);
  if (!m) continue;
  const argExpr = m[1].trim();
  try {
    // checkin 의 지역변수 userId(=b.user_id 를 trim 한 것)도 평가할 수 있게 넘긴다 — 되돌리면 그 값이 비교된다.
    argFns[c.key] = new Function('b', 'userId', 'return (' + argExpr + ');');
    ok(true, `${c.path} — 인자식 «${argExpr}» 을 평가 가능하게 오려 냈다`);
  } catch (e) {
    ok(false, `${c.path} — 인자식 «${argExpr}» 평가 불가: ${String(e && e.message)}`);
  }
}

// ── 가짜 자격증명 ──
const adminYes = async () => ({ ok: true, username: 'hq_t_kang' });
const adminNo  = async () => ({ ok: false });
const tokenOf  = (uid) => async (_req, _url, _env, body) => (body && body.token) ? uid : null;   // 토큰이 실려 왔을 때만 uid
const tokenNone = async () => null;
const tokenThrows = async () => { throw new Error('kv down'); };

// 실제 클라이언트가 보내는 모양(mango-attendance.js 178~192행)
const STUDENT_BODY = (over) => Object.assign({
  room_id: 'class-1016-20260904',
  user_id: 'u_j4cs5c65bp',        // 기기 식별자 — 계정이 아니다
  username: '정예은',
  role: 'student',
  timestamp: 1756950000000,
  account_uid: 'jye46712',        // 계정
  token: 'signed.token.value',    // 로그인 학생은 토큰을 싣는다
}, over || {});
// mango-consent.js 82~95행 모양
const CONSENT_BODY = (over) => Object.assign({
  user_id: 'jye46712', token: 'signed.token.value', username: '정예은', role: 'student',
  consent_version: 'v1.1', recording: 1, attendance: 1,
}, over || {});

async function decide(caller, deps, body) {
  const fn = helperFn(deps);
  const userId = body && body.user_id != null ? String(body.user_id).trim() : '';
  const claimed = argFns[caller](body, userId);
  return fn(claimed, body);
}

if (helperFn && Object.keys(argFns).length === 4) {
  // ── A. 헬퍼 단독 ──
  const H = (deps) => helperFn(deps);
  ok(await H({ checkAdminSession: adminYes, authUidGlobal: tokenOf('jeong') })('someone_else', { token: 'x' }) === true,
    'A-1 관리자 세션이면 대상 계정과 무관하게 통과(교사)');
  ok(await H({ checkAdminSession: adminNo, authUidGlobal: tokenNone })('jye46712', {}) === true,
    'A-2 자격증명이 아예 없으면 통과(7/19 결석률 버그 방어 — 회귀 0)');
  ok(await H({ checkAdminSession: adminNo, authUidGlobal: tokenOf('jye46712') })('jye46712', { token: 'x' }) === true,
    'A-3 토큰 uid == 계정 → 통과');
  ok(await H({ checkAdminSession: adminNo, authUidGlobal: tokenOf('jye46712') })('delaware', { token: 'x' }) === false,
    'A-4 토큰 uid != 계정 → 거부(남의 계정에 적으려는 위조)');
  ok(await H({ checkAdminSession: adminNo, authUidGlobal: tokenOf('jye46712') })('', { token: 'x' }) === true,
    'A-5 토큰은 있는데 계정 칸이 비어 있으면(옛 클라이언트) 통과 — 남의 계정에 적힐 것이 없다');
  ok(await H({ checkAdminSession: adminNo, authUidGlobal: tokenOf('jye46712') })(undefined, { token: 'x' }) === true,
    'A-6 계정 칸이 undefined 여도 통과(옛 클라이언트가 키 자체를 안 보냄)');
  ok(await H({ checkAdminSession: adminNo, authUidGlobal: tokenOf('jye46712') })('  jye46712  ', { token: 'x' }) === true,
    'A-7 앞뒤 공백은 잘라서 비교한다');
  ok(await H({ checkAdminSession: adminNo, authUidGlobal: tokenThrows })('delaware', { token: 'x' }) === true,
    'A-8 검증 중 예외는 출석을 막지 않는다(보수적)');

  // ── B. 호출부 × 시나리오 ──
  for (const key of ['join', 'checkin']) {
    const S = (deps, body) => decide(key, deps, body);
    ok(await S({ checkAdminSession: adminNo, authUidGlobal: tokenOf('jye46712') }, STUDENT_BODY()) === true,
      `B-${key} (a) 로그인 학생: 토큰 uid = account_uid, user_id = u_… → 통과  ← 사고 전엔 여기가 403 이었다`);
    ok(await S({ checkAdminSession: adminNo, authUidGlobal: tokenOf('jye46712') }, STUDENT_BODY({ account_uid: 'delaware' })) === false,
      `B-${key} (b) 토큰 uid ≠ account_uid → 403 (남의 계정 위조)`);
    ok(await S({ checkAdminSession: adminNo, authUidGlobal: tokenNone }, STUDENT_BODY({ account_uid: undefined, token: undefined })) === true,
      `B-${key} (c) 토큰 없음(비로그인 학생) → 통과`);
    ok(await S({ checkAdminSession: adminYes, authUidGlobal: tokenNone }, STUDENT_BODY({ role: 'teacher', account_uid: 'hq_t_kang', token: undefined })) === true,
      `B-${key} (d) 관리자 세션(교사) → 통과`);
    ok(await S({ checkAdminSession: adminNo, authUidGlobal: tokenOf('jye46712') }, STUDENT_BODY({ account_uid: undefined })) === true,
      `B-${key} (e) 옛 클라이언트: 토큰은 있는데 account_uid 키가 없음 → 통과(회귀 0)`);
    ok(await S({ checkAdminSession: adminNo, authUidGlobal: tokenOf('jye46712') }, STUDENT_BODY({ user_id: 'z6nn4uhuwt95py0f4o6hvm' })) === true,
      `B-${key} (f) user_id 가 DO 임시번호여도 통과 — user_id 는 비교 대상이 아니다`);
  }
  for (const key of ['consent', 'withdraw']) {
    const S = (deps, body) => decide(key, deps, body);
    ok(await S({ checkAdminSession: adminNo, authUidGlobal: tokenOf('jye46712') }, CONSENT_BODY()) === true,
      `B-${key} 본인 토큰 + user_id(=계정) → 통과`);
    ok(await S({ checkAdminSession: adminNo, authUidGlobal: tokenOf('jye46712') }, CONSENT_BODY({ user_id: 'delaware' })) === false,
      `B-${key} 남의 계정을 user_id 에 넣으면 → 403`);
    ok(await S({ checkAdminSession: adminNo, authUidGlobal: tokenNone }, CONSENT_BODY({ token: undefined })) === true,
      `B-${key} 토큰 없음 → 통과(로그인 없이 들어온 학생도 동의를 남긴다)`);
  }

  // ── C. 변이 대조 — 옛 인자(b.user_id)를 같은 시나리오에 넣으면 (a) 가 막힌다 ──
  const oldArg = new Function('b', 'userId', 'return (b.user_id);');
  const fn = helperFn({ checkAdminSession: adminNo, authUidGlobal: tokenOf('jye46712') });
  const oldResult = await fn(oldArg(STUDENT_BODY()), STUDENT_BODY());
  ok(oldResult === false,
    'C-1 «옛 인자 b.user_id» 로 같은 요청을 돌리면 로그인 학생이 막힌다(false) — 이 하니스는 그 차이를 본다');
  ok((argFns.join.toString().includes('account_uid')) && (argFns.checkin.toString().includes('account_uid')),
    'C-2 join·checkin 의 인자식이 account_uid 를 가리킨다(인자식 자체를 오려 낸 것이라 주석에 속지 않는다)');
}

// ── D. 클라이언트 계약 ──
ok(/body\.account_uid\s*=\s*state\.accountUid/.test(attnJs), 'D-1 mango-attendance.js — 로그인했으면 account_uid 를 싣는다');
ok(/body\.token\s*=\s*_t/.test(attnJs), 'D-2 mango-attendance.js — 학생은 mango_token 을 싣는다(교사는 안 싣는다)');
// ⚠️ 주석 낱말(«기기 식별자»)은 검사하지 않는다 — 글자 검사는 주석을 다듬는 순간 헛돈다(규칙서 2장).
ok(/user_id:\s*state\.userId/.test(attnJs), 'D-3 mango-attendance.js — user_id 는 state.userId(기기·DO 번호)이지 계정이 아니다');
ok(/user_id:\s*uid,/.test(consentJs) && /cu\.uid\s*\|\|\s*cu\.user_id\s*\|\|\s*cu\.id/.test(consentJs),
  'D-4 mango-consent.js — user_id 칸에 «계정»(getCurrentUser 의 uid)을 싣는다 → consents 호출부는 user_id 비교가 맞다');

console.log('\n🔐 출석 소프트 인증 — «무엇과 비교하는가» 실행 하니스' + (process.env.ATTN_SRC_FILE ? `  (소스: ${SRC_FILE})` : ''));
console.log(out.join('\n'));
console.log(`\n결과: ${PASS} PASS / ${FAIL} FAIL`);
process.exit(FAIL ? 1 : 0);
