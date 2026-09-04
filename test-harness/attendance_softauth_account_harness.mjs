// -*- coding: utf-8 -*-
// 🧪 출석 소프트인증 «비교 대상» + 「강사 미입장」 알림 억제 검증 (2026-09-04)
//   실행:  node test-harness/attendance_softauth_account_harness.mjs
//
//   [무슨 사고였나]
//     /api/attendance/join·checkin 의 _attnSoftAuthOk 가 «토큰 uid(계정)» 와 «user_id(기기 번호)» 를
//     비교해, 로그인한 학생(토큰 있음)은 2026-07-19 부터 전부 403 uid_mismatch 였다.
//     출석 행은 시선 API 폴백이 만든 «이름·host·계정 없는» 행만 남았다(9/3 실측 학생 22행 중 19행).
//     같은 날 class-1079: 강사가 7분 전부터 방에 있었는데 학생 화면이 「강사 미입장」을 신고해 푸시가 나갔다.
//
//   [이 하니스가 실제로 하는 일 — 문자열 검사만 하지 않는다]
//     A. api-mango.ts 에서 _attnSoftAuthOk·_attnClaimedAccount 를 오려 내 가짜 세션·토큰으로 **실제로 돌린다**.
//        «토큰 uid = account_uid, user_id = 기기번호» 가 통과하는지 — 고치기 전 코드로는 이 검사가 FAIL 난다(변이시험).
//     B. no-show-truth.ts 의 teacherLiveInRoom 을 **컴파일 없이(node 타입 제거) 실제로 실행**한다 — 가짜 D1 로
//        «이름이 맞는 강사가 방금까지 살아 있었나» 를 묻고, role 만 맞는 접속·오래된 접속·모르는 이름은 false 인지 본다.
//     C. api-notify.ts 의 no-show 핸들러를 중괄호 짝으로 잘라, waited 계산을 **실제로 평가**하고(0 은 0),
//        teacherLive 가 push·kakao «둘 다» 를 막으며 기록(INSERT)은 그대로인지 본다.

import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = join(ROOT, 'cloudflare-deploy/src');
const MANGO = readFileSync(join(SRC_DIR, 'api-mango.ts'), 'utf8');
const NOTIFY = readFileSync(join(SRC_DIR, 'api-notify.ts'), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
}

/** 여는 중괄호 위치부터 짝이 맞는 닫는 중괄호까지 (문자열·주석은 대충이 아니라 건너뛴다) */
function braceBlock(src, openIdx) {
  let depth = 0, i = openIdx, inStr = null, inLine = false, inBlock = false;
  for (; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (inLine) { if (c === '\n') inLine = false; continue; }
    if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i++; } continue; }
    if (inStr) { if (c === '\\') { i++; continue; } if (c === inStr) inStr = null; continue; }
    if (c === '/' && n === '/') { inLine = true; i++; continue; }
    if (c === '/' && n === '*') { inBlock = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(openIdx, i + 1); }
  }
  return src.slice(openIdx);
}

// ═══════════════ A. _attnSoftAuthOk 를 오려 내 실제로 돌린다 ═══════════════
console.log('\nA. _attnSoftAuthOk — «계정» 을 비교하는가 (실제 실행)');
{
  const a0 = MANGO.indexOf('const _attnSoftAuthOk = async (');
  check('A-0 _attnSoftAuthOk 정의가 있다', a0 > 0);
  const fnHead = MANGO.slice(a0);
  const bodyOpen = fnHead.indexOf('{');
  const fnBody = braceBlock(fnHead, bodyOpen);
  const c0 = MANGO.indexOf('const _attnClaimedAccount = ');
  check('A-1 _attnClaimedAccount 헬퍼가 있다', c0 > 0);
  const claimedLine = MANGO.slice(c0, MANGO.indexOf('\n', c0));

  // 타입 표기만 벗겨 낸다(이 두 함수는 그 외에는 순수 JS 다)
  const strip = (s) => s
    .replace(/\(claimedUid: string, body: any\): Promise<boolean>/, '(claimedUid, body)')
    .replace(/\(body: any\): string/, '(body)')
    .replace(/env as any/g, 'env');
  const code = strip(`const _attnSoftAuthOk = async (claimedUid, body) => ${fnBody};\n${claimedLine}\nreturn { _attnSoftAuthOk, _attnClaimedAccount };`);

  const make = (adminOk, tokenUid) => {
    const checkAdminSession = async () => ({ ok: adminOk });
    const authUidGlobal = async (_r, _u, _e, body) => (body && body.token) ? tokenUid : null;
    // eslint-disable-next-line no-new-func
    return new Function('checkAdminSession', 'authUidGlobal', 'request', 'env', 'url', code)(checkAdminSession, authUidGlobal, {}, {}, {});
  };
  const run = async (adminOk, tokenUid, body) => {
    const { _attnSoftAuthOk, _attnClaimedAccount } = make(adminOk, tokenUid);
    return _attnSoftAuthOk(_attnClaimedAccount(body), body);
  };

  // 실제 클라이언트 모양(mango-attendance.js): user_id = 기기번호, account_uid = 계정, token = 그 계정의 토큰
  check('A-2 로그인 학생(토큰 uid = account_uid, user_id 는 기기번호) → 통과',
    await run(false, 'jye46712', { user_id: 'u_j4cs5c65bp', account_uid: 'jye46712', token: 't' }) === true);
  check('A-3 남의 계정을 적으려는 요청(토큰 uid ≠ account_uid) → 거부',
    await run(false, 'jye46712', { user_id: 'u_j4cs5c65bp', account_uid: 'cys01', token: 't' }) === false);
  check('A-4 토큰 없음(로그인 안 한 학생) → 통과(회귀 0)',
    await run(false, null, { user_id: 'u_x', account_uid: null }) === true);
  check('A-5 관리자·교사 세션 → 통과(대상 무관)',
    await run(true, 'someone', { user_id: 'u_x', account_uid: 'other', token: 't' }) === true);
  check('A-6 토큰은 있는데 account_uid 를 안 보낸 옛 클라이언트 → 통과(주장한 계정이 없다)',
    await run(false, 'jye46712', { user_id: 'u_x', token: 't' }) === true);
  check('A-7 대소문자·공백만 다른 계정은 «같은 계정» 이 아니다(정확일치 — 남의 행 방지)',
    await run(false, 'jye46712', { user_id: 'u_x', account_uid: 'JYE46712', token: 't' }) === false);

  // 호출부 — join·checkin 은 계정 헬퍼를, consents 는 여전히 user_id(=계정) 를 넘긴다
  const joinIdx = MANGO.indexOf("path === '/api/attendance/join' && method === 'POST'");
  const joinBlk = braceBlock(MANGO, MANGO.indexOf('{', joinIdx));
  const chkIdx = MANGO.indexOf("path === '/api/attendance/checkin'");
  const chkBlk = braceBlock(MANGO, MANGO.indexOf('{', chkIdx));
  check('A-8 join 핸들러가 _attnClaimedAccount(b) 를 넘긴다', /_attnSoftAuthOk\(_attnClaimedAccount\(b\)/.test(joinBlk));
  check('A-9 checkin 핸들러가 _attnClaimedAccount(b) 를 넘긴다', /_attnSoftAuthOk\(_attnClaimedAccount\(b\)/.test(chkBlk));
  check('A-10 join·checkin 어디에도 옛 호출(user_id 비교)이 남아 있지 않다',
    !/_attnSoftAuthOk\((b\.user_id|userId),/.test(joinBlk) && !/_attnSoftAuthOk\((b\.user_id|userId),/.test(chkBlk));
  const consIdx = MANGO.indexOf("path === '/api/consents' && method === 'POST'");
  const consBlk = braceBlock(MANGO, MANGO.indexOf('{', consIdx));
  check('A-11 consents 는 user_id 가 곧 계정이라 그대로 b.user_id 를 넘긴다(건드리지 않음)', /_attnSoftAuthOk\(b\.user_id, b\)/.test(consBlk));
}

// ═══════════════ B. teacherLiveInRoom — 컴파일 없이 실제 실행 ═══════════════
console.log('\nB. teacherLiveInRoom — «지금 살아 있는 강사» 판정 (실제 실행, node 타입 제거)');
{
  // 확장자 없는 import 는 node 타입 제거 모드에서 못 푼다 → 사본에 .ts 를 붙여 임시 폴더에서 돌린다
  const tmp = mkdtempSync(join(tmpdir(), 'nst-'));
  const fix = (s) => s.replace(/from '\.\/([\w-]+)'/g, "from './$1.ts'");
  writeFileSync(join(tmp, 'no-show-truth.ts'), fix(readFileSync(join(SRC_DIR, 'no-show-truth.ts'), 'utf8')));
  writeFileSync(join(tmp, 'd1-chunk.ts'), fix(readFileSync(join(SRC_DIR, 'd1-chunk.ts'), 'utf8')));
  const runner = `
    import { teacherLiveInRoom } from './no-show-truth.ts';
    const NOW = 1_800_000_000_000;
    const mkDb = (attRows, linkRows = []) => ({
      prepare(sql) { return { bind() { return { all: async () => ({ results: /FROM attendance/.test(sql) ? attRows : linkRows }) }; } }; }
    });
    const T = (min) => NOW - min * 60_000;
    const cases = [];
    const add = async (name, db, args, want) => { const got = await teacherLiveInRoom(db, ...args); cases.push([name, got === want, got]); };
    // 1) 이름이 맞는 강사가 30초 전까지 살아 있었다 → true
    await add('B-1 이름 일치 + 30초 전 하트비트 → true',
      mkDb([{ room_id: 'r', role: 'teacher', username: '교사 Teacher - Krystel', joined_at: T(7), out_at: T(0.5) }]),
      ['r', 'KRYSTEL', '김선우', NOW], true);
    // 2) 같은 사람인데 10분 전에 나갔다(left_at 이 out_at) → false
    await add('B-2 이름 일치인데 10분 전에 나감 → false',
      mkDb([{ room_id: 'r', role: 'teacher', username: '교사 Teacher - Krystel', joined_at: T(30), out_at: T(10) }]),
      ['r', 'KRYSTEL', '김선우', NOW], false);
    // 3) role 만 teacher 이고 이름은 다른 사람 → false (role 을 믿지 않는다)
    await add('B-3 role=teacher 지만 이름이 다름 → false',
      mkDb([{ room_id: 'r', role: 'teacher', username: '교사 Teacher - Hannah', joined_at: T(7), out_at: T(0.5) }]),
      ['r', 'KRYSTEL', '김선우', NOW], false);
    // 4) 낱말 속 우연(Anna ⊂ HANNAH) 은 같은 사람이 아니다 → false
    await add('B-4 낱말 속 우연(ANNA ⊂ HANNAH) → false',
      mkDb([{ room_id: 'r', role: 'teacher', username: '교사 HANNAH', joined_at: T(7), out_at: T(0.5) }]),
      ['r', 'ANNA', '김선우', NOW], false);
    // 5) 계정아이디로 찍힌 출석 + 링크 표로 원부 이름이 풀림 → true
    await add('B-5 출석 이름이 계정(mangoi_169)인데 링크로 KRYSTEL 로 풀림 → true',
      mkDb([{ room_id: 'r', role: 'teacher', username: '교사 mangoi_169', joined_at: T(7), out_at: T(0.5) }],
           [{ acct: 'MANGOI_169', tname: 'KRYSTEL' }]),
      ['r', 'KRYSTEL', '김선우', NOW], true);
    // 6) 방에 아무도 없음 → false · 7) 조회가 던짐 → false · 8) 강사 이름 모름 → false
    await add('B-6 출석 행 없음 → false', mkDb([]), ['r', 'KRYSTEL', '김선우', NOW], false);
    await add('B-7 D1 조회가 던져도 false(알림을 막는 쪽으로 틀리지 않음)',
      { prepare() { throw new Error('boom'); } }, ['r', 'KRYSTEL', '김선우', NOW], false);
    await add('B-8 강사 이름이 비어 있으면 false', mkDb([{ room_id: 'r', role: 'teacher', username: '교사 X', joined_at: T(1), out_at: T(0.1) }]), ['r', '', '', NOW], false);
    // 9) 학생 이름과도 겹치는 접속은 강사로 안 센다(정본 규칙 그대로) → false
    await add('B-9 강사·학생 이름 둘 다에 걸리는 접속 → false(모름은 안 보냄 쪽이 아니라 «판정 불가»)',
      mkDb([{ room_id: 'r', role: 'teacher', username: 'Len', joined_at: T(1), out_at: T(0.1) }]),
      ['r', 'Len', 'Len Kim', NOW], false);
    console.log(JSON.stringify(cases));
  `;
  writeFileSync(join(tmp, 'run.mjs'), runner);
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', join(tmp, 'run.mjs')], { encoding: 'utf8' });
  rmSync(tmp, { recursive: true, force: true });
  if (r.status !== 0) {
    check('B-0 teacherLiveInRoom 실행(타입 제거 import)', false);
    console.log(r.stderr.slice(0, 800));
  } else {
    const lines = r.stdout.trim().split('\n');
    const cases = JSON.parse(lines[lines.length - 1]);
    for (const [name, ok, got] of cases) check(`${name} (실제 ${got})`, ok);
  }
}

// ═══════════════ C. api-notify no-show 핸들러 배선 ═══════════════
console.log('\nC. /api/notify/no-show — waited 0 은 0 · teacherLive 가 push·kakao 를 막고 기록은 남긴다');
{
  const h0 = NOTIFY.indexOf("path === '/api/notify/no-show'");
  check('C-0 no-show 핸들러가 있다', h0 > 0);
  const blk = braceBlock(NOTIFY, NOTIFY.indexOf('{', h0));

  // waited 계산을 오려 내 실제로 평가한다
  const m = blk.match(/const _wRaw = ([^;]+);\s*\n\s*const waited = ([^;]+);/);
  check('C-1 waited 계산식이 있다', !!m);
  if (m) {
    // eslint-disable-next-line no-new-func
    const calc = new Function('body', `const _wRaw = ${m[1]}; const waited = ${m[2]}; return waited;`);
    check('C-2 waited_minutes:0(학생 입장 즉시 호출) → 0 (옛 코드는 5)', calc({ waited_minutes: 0 }) === 0);
    check('C-3 waited_minutes:5 → 5', calc({ waited_minutes: 5 }) === 5);
    check('C-4 waited_minutes 없음 → 기본 5', calc({}) === 5);
    check('C-5 쓰레기 값(-3, "abc") → 기본 5', calc({ waited_minutes: -3 }) === 5 && calc({ waited_minutes: 'abc' }) === 5);
  }

  // teacherLive 가 «먼저» 정해지고, push·kakao 둘 다 그것으로 막힌다(한쪽만 막으면 반쪽)
  const iLive = blk.indexOf('teacherLive = await teacherLiveInRoom(');
  const iPushGate = blk.indexOf('if (teacherLive) push = ');
  const iPushSend = blk.indexOf('sendPushToUser(');
  const iKakaoGate = blk.indexOf('if (teacherLive) kakao = ');
  const iKakaoSend = blk.indexOf('sendKakaoAlimtalk(');
  const iInsert = blk.indexOf('INSERT INTO class_no_show');
  check('C-6 강사 생존 판정을 정본(teacherLiveInRoom)으로 한다', iLive > 0);
  check('C-7 판정이 push 발송보다 앞에 있다', iLive > 0 && iLive < iPushSend);
  check('C-8 push 는 teacherLive 로 막힌다(발송 호출 직전)', iPushGate > 0 && iPushGate < iPushSend);
  check('C-9 kakao 도 teacherLive 로 막힌다(발송 호출 직전)', iKakaoGate > 0 && iKakaoGate < iKakaoSend);
  check('C-10 기록(INSERT class_no_show)은 그대로 남는다 — 지우거나 건너뛰지 않는다', iInsert > 0 && iInsert > iKakaoGate);
  check('C-11 waitingFor=student 쪽은 판정을 안 한다(학생 미입장 알림은 그대로)', /if \(waitingFor === 'teacher'\) \{\s*\n?\s*try \{ teacherLive = /.test(blk));
  check('C-12 응답에 teacher_present 를 실어 «왜 안 보냈는지» 를 말한다', /teacher_present: teacherLive/.test(blk));
  check('C-13 no-show-truth 를 import 한다', /import \{ teacherLiveInRoom \} from '\.\/no-show-truth'/.test(NOTIFY));
}

console.log(`\n합계: PASS ${PASS} / FAIL ${FAIL}`);
if (FAIL) { console.log('실패: ' + FAILS.join(' | ')); process.exit(1); }
