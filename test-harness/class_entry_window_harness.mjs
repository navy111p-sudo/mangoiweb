// -*- coding: utf-8 -*-
// 🧪 수업 «입장 시간창» 감시 — 강사가 나가면 다시 못 들어오던 것 (2026-09-11 마이마이 제보)
//   실행:  node test-harness/class_entry_window_harness.mjs
//
//   [무슨 사고였나 — 실측]
//     class-2332-20260911 (15:00~15:20, 창은 종료+15분 = 15:35:00 에 닫힘)
//       15:34:04 강사 재입장 → 15:35:28 퇴장 → 그 뒤 입장 기록 0건.
//     같은 수업에 문이 둘이고 서로 다른 답을 했다 — 강사 포털은 2026-08-07 부터 하루 종일
//     열려 있는데(enter_from_ts/enter_until_ts) 홈 화면만 종료+15분에 닫혔다.
//     수업에서 「나가기」를 누르면 홈으로 떨어지므로 강사가 만나는 것은 늘 닫힌 쪽이었다.
//
//   [이 하니스가 실제로 하는 일 — 문자열 검사만 하지 않는다]
//     A. src/class-entry-window.ts 를 **컴파일 없이(node 타입 제거) 실제로 실행**해 경계값을 넣어 본다.
//        ⚠️ 「그 함수가 있는가」로는 이 사고를 원리상 못 본다 — 함수도 값도 다 «있고»
//           틀린 것은 «무슨 답이 나오는가» 뿐이라 수리 전에도 --fast 가 전부 초록이었다.
//     B. api-mango.ts 가 그 정본을 **실제로 배선**했는지 (블록을 중괄호 짝으로 잘라서).
//     C. js/idx-main.js 가 «문» 은 can_enter 로, «라벨» 은 status 로 가르는지 — **짝으로** 묻는다.
//        부정 검사(「옛 하드블록이 없다」)는 **주석을 벗겨 낸 사본**으로 판정한다
//        (CLAUDE.md — 부정 검사가 자기 주석을 잡는 함정).
//     D. 고친 js 를 부르는 HTML 의 ?v= 가 **두 곳 모두** 같은지 (index.html · teacher.html preload).
//
//   [변이시험 — 손으로 돌려 «실제로» FAIL 나는 것을 확인했다 (2026-09-11)]
//     · 바닥(Math.max) 제거            → A-3·A-5 FAIL   (간격 0분인 287회차가 지금보다 짧아짐)
//     · 다음수업 상한(Math.min) 제거   → A-4 FAIL
//     · 강사 분기 제거                 → A-1·A-2 FAIL
//     · idx-main.js 를 옛 코드로 되돌림 → C-1·C-2 FAIL
//     · enterBlockedMsg 를 한국어 전용으로 → A-11·A-12 FAIL

import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'cloudflare-deploy/src');
const PUB = join(ROOT, 'cloudflare-deploy/public');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
}

/** 여는 중괄호부터 짝이 맞는 닫는 중괄호까지 — 문자열·주석 안의 괄호는 세지 않는다. */
function braceBlock(src, openIdx) {
  let depth = 0, inStr = null, inLine = false, inBlock = false;
  for (let i = openIdx; i < src.length; i++) {
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

/** 주석을 «줄 단위로» 벗긴다 — 블록주석을 정규식 한 줄로 지우면 문자열 안의 짝 없는
 *  «슬래시+별표» 하나에 그 뒤가 통째로 사라진다(CLAUDE.md 2장에서 실제로 밟은 함정). */
function stripComments(t) {
  const out = []; let inBlock = false;
  for (let line of t.split('\n')) {
    let res = '';
    for (let i = 0; i < line.length; i++) {
      const c = line[i], n = line[i + 1];
      if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i++; } continue; }
      if (c === '/' && n === '*') { inBlock = true; i++; continue; }
      if (c === '/' && n === '/') break;
      res += c;
    }
    out.push(res);
  }
  return out.join('\n');
}

// ═══════════════ A. 정본을 실제로 돌린다 ═══════════════
console.log('\nA. src/class-entry-window.ts — 경계값을 넣어 실제로 실행');
{
  const tmp = mkdtempSync(join(tmpdir(), 'cew-'));
  writeFileSync(join(tmp, 'class-entry-window.ts'), readFileSync(join(SRC, 'class-entry-window.ts'), 'utf8'));
  const runner = `
    import { entryWindow, canEnterNow, enterBlockedMsg, nextStartAfter,
             ENTER_FLOOR_MS, ENTER_MAX_MS, NEXT_GUARD_MS } from './class-entry-window.ts';
    const KST = 9 * 3600 * 1000;
    const dayStartTs = Date.UTC(2026, 8, 11, 0, 0, 0) - KST;
    const start = Date.UTC(2026, 8, 11, 15, 0, 0) - KST;
    const end   = start + 20 * 60000;
    const openAtTs = start - 10 * 60000;
    const S = (nextStartTs) => entryWindow({ isTeacher: false, dayStartTs, openAtTs, endTs: end, nextStartTs });
    const T = entryWindow({ isTeacher: true, dayStartTs, openAtTs, endTs: end, nextStartTs: end });
    const out = {
      teacherFrom:   T.from === dayStartTs,
      teacherUntil:  T.until === dayStartTs + 86400000 - 1,
      studentFrom:   S(null).from === openAtTs,
      studentNotAllDay: S(null).until < dayStartTs + 86400000 - 1,
      noNext:        S(null).until === end + ENTER_MAX_MS,
      gapZero:       S(end).until === end + ENTER_FLOOR_MS,
      gap20:         S(end + 20 * 60000).until === end + ENTER_FLOOR_MS,
      gap30:         S(end + 30 * 60000).until === end + 30 * 60000 - NEXT_GUARD_MS,
      gap90:         S(end + 90 * 60000).until === end + ENTER_MAX_MS,
      overlap:       S(start).until === end + ENTER_FLOOR_MS,
      nowBeforeFrom: canEnterNow(S(null), openAtTs - 1) === false,
      nowAtFrom:     canEnterNow(S(null), openAtTs) === true,
      nowAtUntil:    canEnterNow(S(null), S(null).until) === true,
      nowAfterUntil: canEnterNow(S(null), S(null).until + 1) === false,
      teacherLateOk: canEnterNow(T, end + 6 * 3600 * 1000) === true,
      msgEarlyKo:    /[가-힣]/.test(enterBlockedMsg(S(null), openAtTs - 1)),
      msgEarlyEn:    /[A-Za-z]{4,}/.test(enterBlockedMsg(S(null), openAtTs - 1)),
      msgLateKo:     /[가-힣]/.test(enterBlockedMsg(S(null), S(null).until + 1)),
      msgLateEn:     /[A-Za-z]{4,}/.test(enterBlockedMsg(S(null), S(null).until + 1)),
      nextDup:       nextStartAfter([start, start, start + 3600000], start) === start + 3600000,
      nextNone:      nextStartAfter([start], start) === null,
      nextUnsorted:  nextStartAfter([start + 7200000, start + 3600000], start) === start + 3600000,
    };
    console.log(JSON.stringify(out));
  `;
  writeFileSync(join(tmp, 'run.mjs'), runner);
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', join(tmp, 'run.mjs')], { encoding: 'utf8' });
  let o = null;
  try { o = JSON.parse((r.stdout || '').trim().split('\n').pop()); } catch { /* 아래에서 FAIL */ }
  check('A-0 전제: 정본을 실제로 실행했다', !!o);
  if (!o) console.log('    ' + String(r.stderr || '').split('\n').slice(0, 4).join('\n    '));
  else {
    // 강사 — 강사 포털(api-teacher.ts)과 «같은 답» 이어야 두 화면이 안 갈린다
    check('A-1 강사: 그날 00:00 부터', o.teacherFrom);
    check('A-2 강사: 그날 끝까지', o.teacherUntil);
    check('A-3 강사: 종료 6시간 뒤에도 들어갈 수 있다', o.teacherLateOk);
    // 학생 — 「열린다」와 「무한정은 아니다」를 짝으로 (한쪽만 보면 «전부 열기» 도 통과한다)
    check('A-4 학생: 시작 10분 전부터', o.studentFrom);
    check('A-5 학생: 하루 종일은 아니다(강사와 다르다)', o.studentNotAllDay);
    check('A-6 학생: 다음 수업이 없으면 종료+60분', o.noNext);
    check('A-7 학생: 다음 수업이 바로 붙어 있으면 종료+15분(바닥 — 지금과 같음)', o.gapZero);
    check('A-8 학생: 간격 20분이어도 바닥 아래로 안 내려간다', o.gap20);
    check('A-9 학생: 간격 30분이면 다음 수업 5분 전까지', o.gap30);
    check('A-10 학생: 간격 90분이어도 상한 60분을 안 넘는다', o.gap90);
    check('A-11 학생: 다음 수업이 겹쳐 있어도 바닥은 지킨다', o.overlap);
    check('A-12 경계: 여는 시각 직전은 막힌다', o.nowBeforeFrom);
    check('A-13 경계: 여는 시각은 열린다', o.nowAtFrom);
    check('A-14 경계: 닫는 시각은 열린다', o.nowAtUntil);
    check('A-15 경계: 닫는 시각 직후는 막힌다', o.nowAfterUntil);
    // 문구 — 한국어 전용이면 필리핀·중국인 강사에게는 «읽을 수 없는 것» 이다
    check('A-16 문구(이름): 한국어가 있다', o.msgEarlyKo);
    check('A-17 문구(이름): 영어도 함께 있다', o.msgEarlyEn);
    check('A-18 문구(지남): 한국어가 있다', o.msgLateKo);
    check('A-19 문구(지남): 영어도 함께 있다', o.msgLateEn);
    // 그룹 수업은 서버에 «학생마다 한 행» 이라 같은 시각이 둘일 수 있다
    check('A-20 다음수업: 같은 시각이 둘이어도 자기 자신을 고르지 않는다', o.nextDup);
    check('A-21 다음수업: 뒤에 없으면 null', o.nextNone);
    check('A-22 다음수업: 목록이 정렬 안 돼 있어도 가장 이른 것', o.nextUnsorted);
  }
}

// ═══════════════ B. 서버 배선 ═══════════════
console.log('\nB. api-mango.ts — sessions/today 가 정본을 실제로 쓰는가');
{
  const t = readFileSync(join(SRC, 'api-mango.ts'), 'utf8');
  check('B-1 정본을 import 한다', /import\s*\{[^}]*\bentryWindow\b[^}]*\}\s*from\s*'\.\/class-entry-window'/.test(t));
  const i = t.indexOf('const dayStartTs = Date.UTC(kY, kMo, kD, 0, 0, 0) - KST;');
  check('B-2 전제: 배선 블록을 찾았다', i > 0);
  if (i > 0) {
    // 그 블록을 감싸는 `{` 부터 짝까지 — 길이로 자르면 옆 코드가 딸려 온다
    const open = t.lastIndexOf('{', i);
    const blk = braceBlock(t, open);
    check('B-3 세션마다 돌린다(루프 안이다)', /for\s*\(const\s+\w+\s+of\s+sessions\)/.test(blk));
    check('B-4 정본 entryWindow 를 부른다', /entryWindow\(\{/.test(blk));
    check('B-5 다음 수업을 정본 함수로 구한다', /nextStartAfter\(/.test(blk));
    check('B-6 can_enter 를 실어 보낸다', /\.can_enter\s*=\s*canEnterNow\(/.test(blk));
    check('B-7 enter_until_ts 를 실어 보낸다', /\.enter_until_ts\s*=/.test(blk));
    check('B-8 막을 때 문구를 서버가 만든다', /enter_msg\s*=\s*enterBlockedMsg\(/.test(blk));
    check('B-9 역할을 그대로 넘긴다(강사/학생이 갈린다)', /isTeacher/.test(blk));
    // ⛔ 짝 — close_at_ts 를 늘려서 풀면 끝난 수업이 «진행중» 으로 뜬다
    check('B-10 close_at_ts 는 안 건드린다', !/close_at_ts\s*=/.test(stripComments(blk)));
  }
  // 「수업 시간인가」(join_open)는 그대로 살아 있어야 한다 — 라벨·카운트다운이 거기 걸려 있다
  check('B-11 join_open 판정은 그대로 남아 있다', /const join_open = now >= open_at_ts && now <= close_at_ts;/.test(t));
}

// ═══════════════ C. 화면 — 문과 라벨을 가르는가 ═══════════════
console.log('\nC. js/idx-main.js — 「문」은 can_enter, 「라벨」은 status');
{
  const t = readFileSync(join(PUB, 'js/idx-main.js'), 'utf8');
  const bare = stripComments(t);

  const fi = t.indexOf('async function vcJoinMyClass()');
  check('C-0 전제: vcJoinMyClass 를 찾았다', fi > 0);
  const body = fi > 0 ? braceBlock(t, t.indexOf('{', fi)) : '';
  const bareBody = stripComments(body);

  check('C-1 can_enter 가 false 일 때만 막는다', /target\.can_enter === false/.test(bareBody));
  check('C-2 옛 하드블록(status===\'ended\')이 없다', !/target\.status === 'ended'/.test(bareBody));
  check('C-3 서버가 준 문구를 보여 준다', /alert\(target\.enter_msg/.test(bareBody));
  // 짝 — 「막힌다」만 두면 «전부 막기» 도 통과한다
  const gate = bareBody.indexOf('target.can_enter === false');
  const enter = bareBody.indexOf('vcEnterResolvedRoom(target');
  check('C-4 짝: 막히지 않으면 입장까지 간다', gate > 0 && enter > gate);
  // 아직 이른 수업은 예전처럼 카운트다운 — can_enter 가 그것을 밀어내면 안 된다
  check('C-5 짝: 아직 이른 수업은 카운트다운 그대로', /target\.status === 'early'/.test(bareBody)
    && bareBody.indexOf("target.status === 'early'") < gate);

  // 강사용 수업 선택 목록
  check('C-6 고를 수 있나 = can_enter', /var dis = s\.can_enter === false;/.test(bare));
  check('C-7 짝: 「종료」 라벨은 status 로 그대로 그린다', /s\.status === 'ended' \?/.test(bare));
}

// ═══════════════ D. 캐시 버전 ═══════════════
console.log('\nD. ?v= — 고친 js 를 부르는 HTML 이 두 곳이다');
{
  const idx = readFileSync(join(PUB, 'index.html'), 'utf8');
  const tea = readFileSync(join(PUB, 'teacher.html'), 'utf8');
  const a = /\/js\/idx-main\.js\?v=(\d+)/.exec(idx);
  const b = /\/js\/idx-main\.js\?v=(\d+)/.exec(tea);
  check('D-1 index.html 이 ?v= 로 부른다', !!a);
  check('D-2 teacher.html preload 도 같은 주소다', !!b);
  check('D-3 두 곳의 ?v= 가 같다', !!a && !!b && a[1] === b[1]);
}

console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`);
if (FAIL) { console.log('실패:\n  - ' + FAILS.join('\n  - ')); process.exit(1); }
