// -*- coding: utf-8 -*-
// 🇨🇳 중국어 수업 → 강선생님 스케줄 자동 배정 하니스 (의존성 없음)
//   실행:  node test-harness/chinese_class_routing_harness.mjs
//   대상:  mangoi-ai-avatar-cf/src/index.js 의 enrollParseFields / enrollIntent
//
//   배경: AI 운영 비서가 "중국어 수업은 제공하지 않습니다" 라고 잘못 답하던 문제.
//        진범은 코드가 아니라 PERSONA_OPS 의 '사실 블록' 에 중국어가 아예 없었던 것.
//        (그 블록엔 "여기 적힌 사실로만 답하라" 규칙이 붙어 있어 LLM 이 '없다'고 단정)
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dir, '../mangoi-ai-avatar-cf/src/index.js');
const src = readFileSync(SRC, 'utf8');
const W = await import('file://' + SRC.replace(/\\/g, '/'));
const { enrollParseFields, enrollIntent } = W;

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond, extra) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name + (extra ? ` — ${extra}` : '')); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${cond ? '' : (extra ? ` — ${extra}` : '')}`);
}
const KANG = '중국어 강선생님';
const parse = (m) => enrollParseFields(m);
const intent = (m) => { const f = parse(m); return enrollIntent(m, f); };

console.log('\n[ A. 중국어라고만 해도 강선생님이 배정되는가 ]');
{
  for (const msg of [
    '정우영 학생 중국어 수업 하라고 해',
    '중국어 수업 화목 16:00 으로 넣어줘',
    '민서 중국어 레슨 등록해줘',
    'please add a chinese lesson on tue thu 16:00',
  ]) check(`"${msg}" → ${KANG}`, parse(msg).teacher_name === KANG, `실제=${parse(msg).teacher_name || '(없음)'}`);
}

console.log('\n[ B. 강사를 직접 말하면 그 강사가 이긴다 (덮어쓰기 금지) ]');
{
  const f = parse('중국어 수업인데 김선생님으로 화목 16:00 등록해줘');
  check('사용자가 지정한 강사를 유지한다', f.teacher_name && f.teacher_name !== KANG, `실제=${f.teacher_name || '(없음)'}`);
}

console.log('\n[ C. 중국어가 아니면 자동 배정하지 않는다 ]');
{
  for (const msg of ['정우영 학생 영어 수업 화목 16:00 등록해줘', '수강신청 메뉴 어디 있어?']) {
    check(`"${msg}" → 강선생님 아님`, parse(msg).teacher_name !== KANG, `실제=${parse(msg).teacher_name || '(없음)'}`);
  }
}

console.log('\n[ D. 등록 동사가 없어도 중국어+수업이면 등록 의도로 본다 ]');
{
  check('"정우영 학생 중국어 수업 하라고 해" = 등록 의도', intent('정우영 학생 중국어 수업 하라고 해') === true);
  check('"중국어 수업 시켜줘" = 등록 의도', intent('중국어 수업 시켜줘') === true);
  check('중국어라도 수업 얘기가 없으면 등록 의도 아님', intent('중국어 잘하는 선생님 있어?') === false);
}

console.log('\n[ E. 메뉴 위치 질문은 여전히 등록으로 새지 않는다 ]');
{
  check('"수강신청 어디 있어?" 는 등록 아님', intent('수강신청 어디 있어?') === false);
  check('"중국어 수업 메뉴 어디야?" 는 등록 아님', intent('중국어 수업 메뉴 어디야?') === false);
}

console.log('\n[ F. 요일·시간은 그대로 파싱된다 (추가 등록에 필수) ]');
{
  const f = parse('정우영 중국어 수업 화목 16:00 로 추가해줘');
  check('요일 화·목', JSON.stringify(f.days) === JSON.stringify(['tue', 'thu']), JSON.stringify(f.days));
  check('시간 16:00', f.time === '16:00', f.time);
  check('강사 = 강선생님', f.teacher_name === KANG, f.teacher_name);
}

console.log('\n[ G. 페르소나 사실 블록에 중국어가 들어갔는가 (오답의 진짜 원인) ]');
{
  check('관리자 비서(한국어) 사실에 중국어 수업 명시', /현재 중국어 담당은/.test(src));
  check("관리자 비서에 '없다고 답하지 말라' 지시", /'중국어 수업은 없다'고 답하지 마세요/.test(src));
  check('관리자 비서(영어) 사실에 중국어 명시', /Mangoi ALSO offers Chinese lessons/.test(src));
  check('영어 비서가 Chinese 미제공이라 답하지 않도록 지시', /Never say that Chinese lessons are not offered/.test(src));
  check('학생·학부모 비서(한국어)에도 중국어 명시', /영어 외에 중국어 수업도 운영합니다/.test(src));
  check('학생·학부모 비서(영어)에도 중국어 명시', /Chinese lessons are offered as well/.test(src));
  check('중국어 강사가 늘어날 때를 대비한 주석이 있다', /늘어나면 여기 대신 teachers 조회로/.test(src));
}

console.log('\n[ H. 기본 수업 20분 — 영어·중국어 공통 (사장님 확정 2026-07-23) ]');
{
  const SRCDIR = resolve(__dir, '../cloudflare-deploy/src');
  const PUB = resolve(__dir, '../cloudflare-deploy/public');
  const rd = (p) => readFileSync(resolve(SRCDIR, p), 'utf8');
  const policy = rd('class-policy.ts');
  check('정책 상수가 한 곳에만 정의된다', /export const DEFAULT_CLASS_MINUTES = 20;/.test(policy));

  const files = ['ai-command.ts', 'api-admin.ts', 'enroll-ops.ts', 'api-mango.ts'];
  for (const f of files) {
    const s = rd(f);
    check(`${f} — class_schedules 기본값 30분 잔재 없음`,
      !/class_schedules[\s\S]{0,400}?duration_min INTEGER DEFAULT 30/.test(s));
  }
  // 상담 슬롯은 수업이 아니므로 30분 그대로여야 한다(무분별한 일괄치환 방지)
  check('상담 슬롯(counseling_slots)은 30분 유지', /counseling_slots[\s\S]{0,200}?duration_min INTEGER DEFAULT 30/.test(rd('api-admin.ts')));

  // 운영 DB 는 옛 스키마(DEFAULT 30)라 INSERT 에서 생략하면 30 이 들어간다 → 반드시 명시해야 함
  for (const f of ['ai-command.ts', 'api-admin.ts']) {
    const s = rd(f);
    const bad = [...s.matchAll(/INSERT INTO class_schedules\s*\(([^)]*)\)/g)]
      .filter((m) => !m[1].includes('duration_min') && m[1].includes('start_time'));
    check(`${f} — 모든 수업 INSERT 가 duration 을 명시한다`, bad.length === 0, `누락 ${bad.length}건`);
  }
  check('NULL 폴백도 20분', !/COALESCE\(duration_min, 30\)/.test(rd('ai-command.ts') + rd('enroll-ops.ts')));

  const front = readFileSync(resolve(PUB, 'js/mango-class-time.js'), 'utf8') + readFileSync(resolve(PUB, 'js/adm-q6.js'), 'utf8');
  check('화면 표시 폴백도 20분', !/duration_min \|\| 30/.test(front));
}

console.log('\n════════════════════════════════════════');
// ⚠️ run.mjs 는 tail 의 `숫자+FAIL/실패` 를 실패로 읽는다 → 실패 수를 먼저 쓴다
console.log(`  ${FAIL ? '⚠' : '✅'} 실패 ${FAIL}건 / 통과 ${PASS}건`);
if (FAIL) { FAILS.forEach((f) => console.log('   ❌ ' + f)); process.exitCode = 1; }
console.log('════════════════════════════════════════\n');
