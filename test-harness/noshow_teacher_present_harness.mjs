// -*- coding: utf-8 -*-
// 🧪 「강사 미입장」 알림 억제 검증 — 강사가 이미 방에 있으면 push·알림톡을 보내지 않는다 (2026-09-04)
//   실행:  node test-harness/noshow_teacher_present_harness.mjs
//
//   [무슨 사고였나]
//     2026-09-03 class-1079: 강사가 7분 전부터 방에 있었는데 학생 화면이 입장 버튼을 누른 «순간»
//     (소켓·카메라 연결 전) 「강사 미입장」을 신고해 푸시가 나갔다. 그 즉시 호출의 waited_minutes:0 은
//     서버의 `|| 5` 에 걸려 「5분째」로 적혔다.
//     ⚠️ 출석 소프트인증(«계정» 대 «기기 번호» 비교) 쪽은 PR #795 의
//        test-harness/attendance_soft_auth_harness.mjs 가 감시한다 — 여기서는 다루지 않는다.
//
//   [이 하니스가 실제로 하는 일 — 문자열 검사만 하지 않는다]
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
    // 10~11) 미래 시각 = 카페24 «예약» 씨앗이지 접속이 아니다. 지나간 신호만 «살아 있음» 으로 센다.
    //   ⚠️ 짝으로 둔다 — «미래를 막는다» 만 넣으면 전부 막아도 통과한다.
    await add('B-10 out_at 이 1시간 «미래»(예약 씨앗) → false — 진짜 노쇼를 감추지 않는다',
      mkDb([{ room_id: 'r', role: 'teacher', username: '교사 Teacher - Krystel', joined_at: T(-30), out_at: T(-60) }]),
      ['r', 'KRYSTEL', '김선우', NOW], false);
    await add('B-11 out_at 이 10초 «미래»(서버 시각 오차) → true — 되던 것을 깨지 않는다',
      mkDb([{ room_id: 'r', role: 'teacher', username: '교사 Teacher - Krystel', joined_at: T(7), out_at: NOW + 10_000 }]),
      ['r', 'KRYSTEL', '김선우', NOW], true);
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
