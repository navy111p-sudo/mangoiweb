// -*- coding: utf-8 -*-
// 🧪 수업 일지 Phase 0 회귀 하니스 (2026-08-09)
//   실행: node test-harness/lesson_log_phase0_harness.mjs
//
//   무엇을 지키는가 — 실측으로 확인된 두 가지 사고를 되돌아가지 못하게 못 박는다.
//
//   ① 급여 공제 판정이 「1분 평가」를 못 본 문제
//      강사가 /teacher 에서 쓴 평가는 student_evaluations 에 들어가는데,
//      공제 판정(fbOk)은 teacher_class_feedback / 승인된 feedback_drafts 두 곳만 봤다
//      → 성실하게 쓴 강사도 «미작성» 으로 잡혀 수업 1건당 ₱25 씩 깎였다.
//
//   ② 강사가 쓴 평가가 학부모에게 한 번도 안 간 문제
//      서버는 body 에 전화번호가 실려 올 때만 보내는데 강사 화면은 그 값을 보내지 않았다
//      (번호는 화면이 다룰 값이 아니다) → 운영 104건 중 학부모 열람 0건.
//      이제 `notify_parent: true` 면 **서버가** students_erp 에서 번호를 찾는다.
//      ⚠️ 관리자 화면(adm-q1/adm-r6)은 이 플래그를 보내면 안 된다 —
//         보내는 순간 관리자가 평가를 저장할 때마다 학부모에게 문자가 나간다.
//
//   ③ 야간 발송 금지 (22:00~07:59 KST)
//      운영 시간표에 21:30 이후 시작 수업이 65건 있다. 그대로 두면 자정 넘어 문자가 간다.

import { readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allSrc } from './_srcbundle.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
const read = (p) => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
}

const SRC = allSrc();
const TEACHER = read(join(PUB, 'teacher.html'));
const ADM_Q1 = read(join(PUB, 'js', 'adm-q1.js'));
const ADM_R6 = read(join(PUB, 'js', 'adm-r6.js'));

console.log('\n════════ 수업 일지 Phase 0 ════════');

// ── ① 공제 판정이 평가서를 본다 ────────────────────────────────────────
console.log('\n[1] 급여 공제 — 「1분 평가」도 당일 피드백으로 인정');

// 판정 소스를 채우는 구간만 잘라서 본다(파일 전체에서 단어만 찾으면 엉뚱한 곳에 걸린다).
const fbBlock = (() => {
  const i = SRC.indexOf('const fbs: any = await env.DB.prepare(`SELECT room_id, teacher_name, created_at FROM teacher_class_feedback');
  const j = SRC.indexOf('let fbOk: boolean | null = null;');
  return (i >= 0 && j > i) ? SRC.slice(i, j) : '';
})();

check('판정 소스 구간을 찾았다', fbBlock.length > 0);
check('teacher_class_feedback 를 본다 (기존)', /FROM teacher_class_feedback/.test(fbBlock));
check('승인된 feedback_drafts 를 본다 (기존)', /FROM feedback_drafts WHERE status = 'approved'/.test(fbBlock));
check('🔑 student_evaluations 도 본다 (이번 수정)', /FROM student_evaluations/.test(fbBlock));
check('평가서는 room_id 가 있는 행만 인정', /room_id IS NOT NULL/.test(fbBlock));
check('평가서로 fbByRoom 을 채운다', /fbByRoom\[e\.room_id\]\s*=\s*kstDay\(e\.created_at\)/.test(fbBlock));
check('⚠ 평가서에는 «강사명+같은 날» 폴백을 주지 않는다 (1건으로 하루 전체가 면제되면 안 됨)',
  !/fbByTeacherDay\[[^\]]*e\./.test(fbBlock));

// 공제 계산 미러 — fbOk 가 true 면 no_feedback_day 가 붙지 않아야 한다
function deductions({ status, fbOk, feeNoFb = 25 }) {
  const d = [];
  if (status === 'finish' && fbOk === false && feeNoFb > 0) d.push('no_feedback_day');
  return d;
}
check('평가를 쓴 수업은 공제 없음', deductions({ status: 'finish', fbOk: true }).length === 0);
check('아무것도 안 쓴 수업은 공제 있음', deductions({ status: 'finish', fbOk: false })[0] === 'no_feedback_day');
check('완료 아닌 수업은 공제 없음', deductions({ status: 'postponed', fbOk: null }).length === 0);

// ── ② 학부모 발송 배선 ─────────────────────────────────────────────────
console.log('\n[2] 학부모 발송 — 번호는 서버가 찾는다');

check('서버에 번호 조회 함수가 있다', /const lookupParentPhone\s*=/.test(SRC));
check('students_erp 에서 학부모/학생 번호를 찾는다',
  /FROM students_erp WHERE user_id = \? OR login_id = \?[\s\S]{0,400}parent_phone \|\| stu\.student_phone/.test(SRC));
check('🔑 notify_parent === true 일 때만 서버가 번호를 찾는다 (관리자 저장이 문자로 새지 않게)',
  /body\.notify_parent === true/.test(SRC));
check('강사 화면이 notify_parent 를 보낸다', /notify_parent:\s*true/.test(TEACHER));
check('강사 화면은 전화번호를 보내지 않는다 (PII 는 화면이 다루지 않는다)',
  !/parent_phone/.test(TEACHER) && !/student_phone/.test(TEACHER));
check('⚠ 관리자 화면(adm-q1)은 notify_parent 를 보내지 않는다', ADM_Q1.length > 0 && !/notify_parent/.test(ADM_Q1));
check('⚠ 관리자 화면(adm-r6)은 notify_parent 를 보내지 않는다', ADM_R6.length > 0 && !/notify_parent/.test(ADM_R6));
check('문자 본문은 한국어 고정 템플릿 + 링크 (강사가 쓴 영어를 그대로 보내지 않는다)',
  /fallbackSmsText: `\[망고아이\]/.test(SRC) && /평가서가 도착했어요/.test(SRC));
/* 🔴 죽은 링크 방지 — `mango-i.com` 은 등록조차 안 된 도메인이다(NXDOMAIN 실측 2026-08-09).
      CLAUDE.md 머리에 운영 주소로 적혀 있어 한 번 밟았다. 학부모에게 나가는 링크라 되돌아가면 안 된다. */
check('🔑 평가서 링크가 살아 있는 도메인을 쓴다 (test.mangoi.co.kr)',
  /const evalUrl = `https:\/\/test\.mangoi\.co\.kr\/eval\.html\?id=\$\{evalId\}`/.test(SRC));
check('⚠ 학부모 문자에 mango-i.com 이 들어가지 않는다',
  !/mango-i\.com[^`'"]*eval/.test(SRC));

check('발송에 성공해야 parent_notified 를 세운다',
  /notifyResult\.sent\.length > 0[\s\S]{0,200}SET parent_notified=1/.test(SRC));

// ── ③ 야간 발송 금지 ───────────────────────────────────────────────────
console.log('\n[3] 야간(22:00~07:59 KST)에는 보내지 않고 미룬다');

check('야간 판정 함수가 있다', /const isQuietHour\s*=/.test(SRC));
check('KST 로 시각을 잰다 (UTC+9)', /Date\.now\(\) \+ 9 \* 3600 \* 1000\)\.getUTCHours\(\)/.test(SRC));
check('야간이면 보내지 않고 notify_pending 으로 미룬다',
  /if \(isQuietHour\(\)\)[\s\S]{0,300}SET notify_pending = 1/.test(SRC));
check('미뤄 둔 발송을 내보내는 경로가 있다', /const flushPendingEvalNotifies\s*=/.test(SRC));
check('flush 는 조용한 시간엔 아무것도 하지 않는다',
  /flushPendingEvalNotifies = async \(\) => \{\s*\n?\s*if \(isQuietHour\(\)\) return;/.test(SRC));
check('flush 는 한 번에 20건까지만 (곁다리 경로가 길어지면 안 된다)',
  /notify_pending = 1[\s\S]{0,300}LIMIT 20/.test(SRC));
check('평가 작성 때 flush 를 함께 돈다', /await flushPendingEvalNotifies\(\);/.test(SRC));
check('보류 컬럼이 마이그레이션 목록에 있다',
  /\['notify_pending','INTEGER'\],\['notify_phone','TEXT'\]/.test(SRC));

/* 시간 경계 — ⚠️ 미러 함수만 두면 소스를 지워도 하니스가 통과한다(실제로 겪음).
   그래서 «소스에 그 경계식이 실제로 있는지» 를 먼저 못 박고, 그 다음에 경계를 계산한다. */
check('🔑 소스에 22시~08시 경계식이 그대로 있다', /h >= 22 \|\| h < 8/.test(SRC));
const quietAt = (kstHour) => kstHour >= 22 || kstHour < 8;
check('21시는 발송 시간', quietAt(21) === false);
check('22시는 야간(보류)', quietAt(22) === true);
check('자정은 야간(보류)', quietAt(0) === true);
check('07시는 야간(보류)', quietAt(7) === true);
check('08시는 발송 시간', quietAt(8) === false);
check('15시(수업 한창)는 발송 시간', quietAt(15) === false);

// ── ④ Phase 1 — 영어로 쓰면 한국어로 나간다 ────────────────────────────
console.log('\n[4] 영어 → 학부모용 한국어 (mode=note)');

check('translate 에 note 모드가 있다', /if \(b\.mode === 'note'\)/.test(SRC));
check('🔑 한 번의 호출로 en·ko 를 함께 받는다 (두 번 부르지 않는다)',
  /Reply with STRICT JSON only: \{"en":"<polished English>","ko":"<Korean for the parent>"\}/.test(SRC));
check('🔒 학생 실명은 가려서 보낸다', /const MASK = '\{\{STUDENT\}\}'/.test(SRC) && /stuName \? raw\.split\(stuName\)\.join\(MASK\)/.test(SRC));
check('🔒 돌아오면 실명을 되돌린다', /outEn\.split\(MASK\)\.join\(stuName\)/.test(SRC));
check('🔴 한국어가 없으면 ok:false (화면이 발송을 막아야 한다)',
  /const hasKo = \/\[가-힣\]\/\.test\(outKo\);[\s\S]{0,120}error: 'no_korean'/.test(SRC));
check('존댓말을 강제한다', /The Korean MUST use polite speech/.test(SRC));
check('어미 중첩(합니다요)을 코드로 교정한다', /\(습니다\|합니다\|입니다\|ㅂ니다\)요/.test(SRC));
check('「숙제」 오역을 막는다', /"숙제" is school homework, never housework or a job/.test(SRC));
check('단정적 표현·비교를 프롬프트에서 눌러 준다',
  /Soften blunt or judgemental wording/.test(SRC) && /Never compare the child with other students/.test(SRC));
check('⚠ note 모드는 chat 모드의 «첫 줄만» 처리를 타지 않는다 (일지가 잘리면 안 된다)',
  SRC.indexOf("if (b.mode === 'note')") < SRC.indexOf('out.split(/\\r?\\n/)[0]'));
/* 🪤 (2026-08-10 실측) 응답에서 글자를 꺼내는 방법이 모델마다 다르다.
      `typeof resp.response === 'string'` 만 보고 아니면 '' 로 떨어뜨렸더니 매번 빈 문자열이 나와
      **영어 다듬기가 통째로 죽고 폴백만 돌았다**. 한국어는 폴백이 만들어 주니 «되는 것처럼» 보였다. */
check('🔑 모델 응답을 문자열이 아니어도 꺼낸다 (빈 문자열로 떨어뜨리지 않는다)',
  /const pickText = \(r: any\): string =>/.test(SRC) && /if \(r && r\.response\) return JSON\.stringify\(r\.response\);/.test(SRC));
check('폴백에도 순화 규칙이 있다 (폴백만 돌 때 「게으르다」가 그대로 나갔다)',
  /Soften blunt or judgemental wording into what the child did and what will help next\. '\s*\n\s*\+ 'Never compare the child with other students\. '/.test(SRC));
check('⚠ note 모드는 KV 캐시를 쓰지 않는다 (자유서술은 재사용률 0)',
  !/mode === 'note'[\s\S]{0,2500}kv\.put/.test(SRC));

console.log('\n[5] 일지 본문 저장·발송');
check('note_en/note_ko/note_chips 를 저장한다', /noteEn, noteKo, noteChips,/.test(SRC));
check('컬럼 마이그레이션에 들어 있다', /\['note_en','TEXT'\],\['note_ko','TEXT'\],\['note_chips','TEXT'\]/.test(SRC));
check('🔑 서버도 «한국어가 아니면» 발송을 막는다 (화면만 믿지 않는다)',
  /error: 'note_not_korean'/.test(SRC) && /hangul < noteKo\.length \* 0\.3/.test(SRC));
check('문자에 한국어 본문을 실어 보낸다 (링크만 보내면 안 읽는다)',
  /학생의 오늘 수업 일지가 도착했어요[\s\S]{0,80}bodyKo\.slice\(0, 300\)/.test(SRC));
check('밤에 미뤄 둔 것도 본문과 함께 나간다', /notify_phone, note_ko FROM student_evaluations/.test(SRC));

console.log('\n[6] 강사 화면 — 실제 코드를 오려내 실행한다');
// ⚠️ 미러 함수로 재구현하면 화면을 고쳐도 통과한다(이미 한 번 겪음).
//    그래서 teacher.html 에서 규칙 본문을 «그대로 오려내» 실행한다.
const banSrc = (TEACHER.match(/var BAN = \[[\s\S]*?\];/) || [''])[0];
const pfSrc  = (TEACHER.match(/function preflight\(ko\)\{[\s\S]*?\n    \}/) || [''])[0];
check('화면에서 자동 점검 규칙을 찾았다', banSrc.length > 0 && pfSrc.length > 0);

let preflight = null;
try {
  // T() 는 화면의 번역 헬퍼 — 한국어를 돌려주게 두면 실제 문구 그대로 검사할 수 있다
  preflight = new Function('T', banSrc + '\n' + pfSrc + '\nreturn preflight;')((en, ko) => ko);
} catch (e) { console.log('  (실행 실패: ' + e.message + ')'); }
check('규칙 함수를 실행할 수 있다', typeof preflight === 'function');

if (typeof preflight === 'function') {
  const ok = preflight('오늘 서연이가 과거형 질문을 잘 연습했습니다. 발음을 조금 더 보면 좋겠습니다.');
  check('정상 문장은 차단도 경고도 없다', ok.hard.length === 0 && ok.soft.length === 0);

  const eng = preflight('He did very well today and answered every question.');
  check('🔴 영어가 그대로면 차단한다 (학부모는 한국어만 읽는다)', eng.hard.length === 1);

  check('🔴 비어 있으면 차단한다', preflight('').hard.length === 1);

  const blunt = preflight('오늘 도윤이가 게으르고 전혀 듣지 않았습니다.');
  check('🟠 단정적 표현은 붙잡는다', blunt.hard.length === 0 && blunt.soft.length >= 1);
  check('   같은 사유는 한 줄로만 (길면 안 읽는다)', blunt.soft.length === 1);

  const cmp = preflight('도윤이가 다른 학생보다 못했습니다.');
  check('🟠 다른 아이와 비교도 붙잡는다', cmp.soft.some(s => s.indexOf('비교') >= 0));

  const mixed = preflight('오늘 도윤이가 게으르고 다른 학생보다 못했습니다.');
  check('   사유가 둘이면 두 줄', mixed.soft.length === 2);
}

console.log('\n[7] 강사 화면 — 가볍게·안 멈추게');
check('낙관적 저장 — 누르면 즉시 닫는다', /btn\.disabled = true;\s*\n\s*close\(\);/.test(TEACHER));
check('실패하면 큐에 넣는다', /\.catch\(function\(\)\{ qPush\(payload\); \}\)/.test(TEACHER));
check('다시 열 때 자동 재시도한다', /if \(!document\.hidden\) qFlush\(\);/.test(TEACHER));
check('⚠ 외부 리소스 0개 계약 유지 (script src·link 없음)',
  !/<script[^>]+src=/i.test(TEACHER) && !/<link[^>]+rel=["']?stylesheet/i.test(TEACHER));
check('⚠ 애니메이션 금지 계약 유지 (transition·animation 없음)',
  !/transition\s*:/i.test(TEACHER) && !/@keyframes/i.test(TEACHER));
check('칩은 손가락 크기(44px 이상)', /\.tchip\{[\s\S]{0,220}min-height:44px/.test(TEACHER));

// ── 결과 ───────────────────────────────────────────────────────────────
console.log('\n──────────────────────────────────────────');
console.log(`  총 ${PASS + FAIL}건 중 ✅ ${PASS} 통과 / ❌ ${FAIL} 실패`);
if (FAIL) { console.log('\n  실패 항목:'); FAILS.forEach(f => console.log('   - ' + f)); }
process.exit(FAIL ? 1 : 0);
