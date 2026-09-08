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

// ═══════ D. 이름 별칭표 — 표기가 달라 «강사가 없었다» 로 확정되던 사고 (2026-09-08) ═══════
//   [무슨 사고였나] class-1924: 원부 'FAR' ↔ 입장 표기 '교사 Teacher - Farrah'.
//     낱말 경계로도, 계정 해석으로도 안 붙어 ① 「강사 미입장」 푸시가 실제로 나갔고
//     (notified_push=1) ② present=false(=「없었다」 확정)라 급여 되돌림도 안 걸렸다.
//   ⛔ 이 절은 «붙는다» 만 세지 않는다. 별칭이 **부분일치를 열지 않았는지**(KRY↮KRYSTEL,
//      ANNA↮HANNAH)를 짝으로 본다 — 그쪽으로 틀리면 진짜 노쇼가 감춰지고 수업료가 전액 나간다.
console.log('\nD. 이름 별칭표 — 붙어야 할 것과 붙으면 안 될 것 (실제 실행)');
{
  const TRUTH = readFileSync(join(SRC_DIR, 'no-show-truth.ts'), 'utf8');

  /* 별칭표를 **소스에서 읽는다** — 하니스에 손으로 적으면 소스를 한 번도 안 보고 통과한다
     (CLAUDE.md 2장 「자기가 새로 만든 상수를 잡아 통과」의 형제). */
  //  ⚠️ 줄주석을 먼저 벗긴다 — 주석에 대괄호를 쓰면 그것을 그룹으로 세고 만다.
  const decl = /const NAME_ALIASES[^=]*=\s*\[([\s\S]*?)\n\];/.exec(
    TRUTH.replace(/^[ \t]*\/\/.*$/gm, ''));
  check('D-0 NAME_ALIASES 선언을 소스에서 읽었다', !!decl);
  const groups = decl
    ? [...decl[1].matchAll(/\[([^\]]*)\]/g)].map((m) =>
        m[1].split(',').map((t) => t.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean))
    : [];
  check('D-1 별칭 그룹이 하나 이상 있다', groups.length >= 1);
  check('D-2 모든 그룹이 2개 이상 · 대문자 · 앞뒤 공백 없음',
    groups.length > 0 && groups.every((g) => g.length >= 2 && g.every((n) => n === n.toUpperCase().trim() && !!n)));
  {
    // 한 이름이 두 그룹에 걸치면 «누구인지» 가 갈린다 — 그러면 남의 이름이 붙는다.
    const seen = new Set(); let dup = false;
    for (const g of groups) for (const n of g) { if (seen.has(n)) dup = true; seen.add(n); }
    check('D-3 같은 이름이 두 그룹에 들어 있지 않다', !dup);
  }

  const tmp = mkdtempSync(join(tmpdir(), 'nsa-'));
  const fix = (s) => s.replace(/from '\.\/([\w-]+)'/g, "from './$1.ts'");
  writeFileSync(join(tmp, 'no-show-truth.ts'), fix(TRUTH));
  writeFileSync(join(tmp, 'd1-chunk.ts'), fix(readFileSync(join(SRC_DIR, 'd1-chunk.ts'), 'utf8')));
  const runner = `
    import { teacherLiveInRoom, teacherPresenceByRoom } from './no-show-truth.ts';
    const NOW = 1_800_000_000_000, T = (m) => NOW - m * 60_000;
    // 실제 D1 링크 표 그대로(2026-09-08): 그 강사 계정은 mangoi_018 이라 «Teacher - Farrah» 는 안 풀린다
    const LINKS = [{ acct: 'MANGOI_018', tname: 'FAR' }, { acct: 'MANGOI_042', tname: 'HT NESS' }];
    const mkDb = (att) => ({ prepare(sql) { return { bind() { return { all: async () =>
      ({ results: /FROM attendance/.test(sql) ? att : LINKS }) }; } }; } });
    const one = (username) => mkDb([{ room_id: 'r', role: 'teacher', username, joined_at: T(7), out_at: T(0.5) }]);
    const out = [];
    const add = async (name, uname, teacher, student, want) => {
      const got = await teacherLiveInRoom(one(uname), 'r', teacher, student, NOW);
      out.push([name, got === want, got]);
    };
    // ── 붙어야 하는 것 ──
    await add('D-4 실사고 재현: 원부 FAR ↔ 입장 «교사 Teacher - Farrah» → true',
      '교사 Teacher - Farrah', 'FAR', '학생', true);
    await add('D-5 구분자가 달라도 같은 사람(하이픈 없는 «Teacher Farrah») → true',
      '교사 Teacher Farrah', 'FAR', '학생', true);
    await add('D-5b 같은 사람의 퇴사 표기(교사 HT FARRAH)도 FAR 로 붙는다 → true',
      '교사 HT FARRAH', 'FAR', '학생', true);
    await add('D-6 «되던 것» 안 깨짐 — 낱말 일치(KAYE) → true',
      '교사 Teacher Kaye', 'KAYE', '학생', true);
    await add('D-7 «되던 것» 안 깨짐 — 계정 해석(mangoi_042 → HT NESS) → true',
      '교사 mangoi_042', 'HT NESS', '학생', true);
    // ── 붙으면 «안» 되는 것 (부분일치를 연 것이 아님을 증명한다) ──
    await add('D-8 낱말 속 우연(ANNA ⊂ HANNAH) 은 여전히 막힌다 → false',
      '교사 HANNAH', 'ANNA', '학생', false);
    await add('D-9 별칭표에 없는 줄임말(KRY ⊂ KRYSTEL) 은 안 붙는다 → false',
      '교사 Teacher - Krystel', 'KRY', '학생', false);
    await add('D-10 별칭이 엉뚱한 사람을 붙이지 않는다(FAR ↮ HANNAH) → false',
      '교사 HANNAH', 'FAR', '학생', false);
    await add('D-11 이름 없이 «교사» 로만 들어온 접속은 그대로 못 붙인다 → false',
      '교사', 'FAR', '학생', false);
    // ── 안전장치가 살아 있나: 학생 이름과 구분이 안 되면 «모름»(null) 이지 «있었다» 가 아니다 ──
    {
      const m = await teacherPresenceByRoom(mkDb([
        { room_id: 'r', role: 'teacher', username: '교사 Farrah', joined_at: T(7), out_at: T(0.5) },
      ]), [{ room_id: 'r', missing_role: 'teacher', teacher_name: 'FAR', student_name: 'Farrah Kim' }]);
      const p = m.get('r');
      out.push(['D-12 학생 이름에도 걸리면 «모름»(null) — «있었다» 로 단정하지 않는다', p && p.present === null, p && p.present]);
    }
    // ── 급여: 오늘 class-1924 실제 값으로 되돌림이 걸리는가 ──
    {
      const K = (h, mi, s) => 1788793200000 + ((h * 3600 + mi * 60 + s) * 1000);
      const m = await teacherPresenceByRoom(mkDb([
        { room_id: 'c', role: 'teacher', username: '교사 Teacher - Farrah', joined_at: K(14, 0, 0), out_at: K(14, 21, 5) },
        { room_id: 'c', role: 'student', username: 'stu01', joined_at: K(14, 1, 52), out_at: K(14, 23, 28) },
      ]), [{ room_id: 'c', missing_role: 'teacher', teacher_name: 'FAR', student_name: '학생' }]);
      const p = m.get('c');
      out.push(['D-13 급여 되돌림 — 실제 class-1924 값으로 present=true · 접속 21분', !!p && p.present === true && p.minutes === 21, p && p.present + '/' + p.minutes]);
    }
    console.log(JSON.stringify(out));
  `;
  /* 🔴 별칭이 «다른 강사» 에 붙지 않는가 — 반례는 실측 명부에서 가져온다.
       `HT FARRAH` 는 teachers.id=3(active=0) 로 **실재하는 다른 행**이고, 이 저장소는
       api-mango.ts·c24-mirror.ts 두 곳에서 'FAR ⊂ HT FARRAH' 를 «남의 일정» 으로 못 박아 두었다.
       별칭을 상대의 «낱말» 에까지 넓히면 `words('HT FARRAH')` 의 'FARRAH' 에 걸려 붙는다.
     ✅ 그리고 그룹은 **소스에서 읽어** 전수로 돌린다 — 손으로 적으면 새 그룹은 행동 검사가 0건이 된다. */
  const extra = `
    /* ⚠️ D-15 는 «붙는가» 가 아니라 **«별칭이 «새로» 붙였는가»** 를 묻는다.
       별칭표를 비운 사본과 나란히 돌려 비교한다 — 안 그러면 옛 낱말 규칙이 원래부터
       붙이던 쌍('FARRAH' ⊂ 'HT FARRAH')까지 이 변경 탓으로 잡아 **거짓 FAIL** 이 난다. */
    /*  ⚠️ 'HT FARRAH' 는 **일부러 뺐다** — 2026-09-08 사장님 확인으로 FAR 와 같은 사람이라
        이제 그룹 안에 있다(D-14 가 «붙는다» 로 잰다). 대신 **'HT NESS'** 가 그 자리를 지킨다:
        낱말 'HT' 를 HT FARRAH 와 나눠 갖는 «남» 이라, 별칭을 낱말까지 넓히면 여기가 먼저 깨진다. */
    const OTHERS = ['HANNAH', 'HT NESS', 'KRYSTEL', 'KAYE', 'ANA', 'JANICE', 'JED', 'WIN'];
    const GROUPS = ${JSON.stringify(groups)};
    const { teacherLiveInRoom: liveNoAlias } = await import('./no-alias.ts');
    for (const g of GROUPS) {
      for (const a of g) for (const b of g) {
        if (a === b) continue;
        const got = await teacherLiveInRoom(one('교사 ' + b), 'r', a, '학생', NOW);
        out.push(['D-14 그룹 안끼리는 붙는다: ' + a + ' ↔ ' + b, got === true, got]);
      }
      for (const a of g) for (const o of OTHERS) {
        if (g.indexOf(o) >= 0) continue;
        const got  = await teacherLiveInRoom(one('교사 ' + o), 'r', a, '학생', NOW);
        const base = await liveNoAlias(one('교사 ' + o), 'r', a, '학생', NOW);
        //  별칭 없이도 붙던 쌍은 이 변경이 만든 것이 아니다(옛 규칙 그대로).
        out.push(['D-15 별칭이 «다른 강사» 를 새로 붙이지 않는다: ' + a + ' ↮ ' + o,
                  got === base, got + '(별칭없음=' + base + ')']);
      }
    }
    /* 🔴 D-16 «낱말 확장 금지» 를 직접 잰다 — 반례를 **그룹에서 자동으로 만든다.**
       그룹 원소 앞에 다른 낱말을 붙인 이름은 그룹에 «없으므로» 붙으면 안 된다.
       ⚠️ 실측 명부(OTHERS)만으로는 이 변이를 못 잡는다 — 지금 명부에 'FAR'·'FARRAH' 를
          낱말로 가진 다른 강사가 없기 때문이다(그래서 한 번 통과했다). 규칙 자체를 재야 한다. */
    for (const g of GROUPS) for (const a of g) for (const b of g) {
      const fake = 'ZZQ ' + b;                 // 그룹에 없는 이름인데 b 를 «낱말» 로 가진다
      const got  = await teacherLiveInRoom(one('교사 ' + fake), 'r', a, '학생', NOW);
      const base = await liveNoAlias(one('교사 ' + fake), 'r', a, '학생', NOW);
      /*  ⚠️ «붙는가» 가 아니라 «별칭이 «새로» 붙였는가» 로 묻는다 — 옛 규칙(「이름 전체가
          상대의 낱말 하나와 같으면 같은 사람」)은 'FAR' ↔ 'ZZQ FAR' 를 원래부터 붙인다.
          그것까지 위반으로 잡으면 멀쩡한 코드가 FAIL 난다(실제로 한 번 그렇게 짰다). */
      out.push(['D-16 별칭이 «낱말만 겹치는 남» 을 새로 붙이지 않는다: ' + a + ' ↮ ' + fake,
                got === base, got + '(별칭없음=' + base + ')']);
    }
    /* 🔴 D-17 «다른 사람» 이 그룹에 섞이지 않았는가 — 표를 잘못 적는 실수를 잡는다.
       ⚠️ D-15 는 「그룹에 있으면 건너뛴다」라서, 남을 그룹에 «넣어 버리면» 스스로 비켜난다.
          그래서 이 목록은 그 스킵 없이 **그룹 안에 있으면 FAIL** 로 못 박는다. */
    const NEVER = ['HT NESS', 'HANNAH', 'KRYSTEL', 'KAYE', 'ANA', 'JANICE', 'JED', 'WIN', 'SID'];
    for (const g of GROUPS) for (const n of NEVER) {
      out.push(['D-17 «다른 강사» 가 별칭 그룹에 없다: ' + n, g.indexOf(n) < 0, g.join('/')]);
    }
    console.log(JSON.stringify(out));
  `;
  //  별칭표를 비운 사본 — «옛 동작» 기준선이다.
  writeFileSync(join(tmp, 'no-alias.ts'),
    fix(TRUTH).replace(/const NAME_ALIASES[^=]*=\s*\[[\s\S]*?\n\];/, 'const NAME_ALIASES: readonly (readonly string[])[] = [];'));
  writeFileSync(join(tmp, 'run.mjs'), runner.replace("console.log(JSON.stringify(out));", extra));
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', join(tmp, 'run.mjs')], { encoding: 'utf8' });
  rmSync(tmp, { recursive: true, force: true });
  if (r.status !== 0) {
    check('D-4 별칭표 실행(타입 제거 import)', false);
    console.log('    ' + String(r.stderr || '').split('\n').slice(0, 6).join('\n    '));
  } else {
    const last = String(r.stdout || '').trim().split('\n').pop();
    for (const [name, ok, got] of JSON.parse(last)) check(name + (ok ? '' : ` (실제=${got})`), ok);
  }
}

console.log(`\n합계: PASS ${PASS} / FAIL ${FAIL}`);
if (FAIL) { console.log('실패: ' + FAILS.join(' | ')); process.exit(1); }
