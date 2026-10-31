// -*- coding: utf-8 -*-
// 💸 미납 독촉 «오발송» 방지 하니스 (의존성 없음 · node 로 바로 실행)
//   실행:  node test-harness/dunning_safety_harness.mjs
//   대상:  cloudflare-deploy/src/api-admin.ts
//            POST /api/admin/payments/notify-all-overdue   ← 실제로 문자가 나가는 자리
//            POST /api/admin/dunning/run                    ← 매일 03:00 cron (문구 생성만)
//
//   이 파일이 지키는 것 —
//     이 버튼은 눌리면 되돌릴 수 없다. 실제 학부모에게 돈 얘기 문자가 나간다.
//     2026-08-17 확인 시점의 운영 자료:
//        · 활동 학생                                28,672명
//        · student_payments 에 결제 이력이 있는 학생  1,345명
//        · students_erp 전화번호                     parent_phone 3 · phone 9 (29,398행 중)
//     즉 «결제 이력 없음» 은 «안 낸 사람» 이 아니라 «결제가 이 표에 안 들어오는 사람»
//     (카페24·대리점 수납)이다. 그런데 원래 코드는 그걸 미납으로 보고 daysOverdue=999
//     로 보냈다. 지금 사고가 안 난 유일한 이유는 **전화번호가 비어 있어서**다.
//     누군가 카페24에서 번호를 채우는 순간 2만 7천 명짜리 오발송이 된다.
//
//   검사 —
//     A. 결제 이력이 없으면 «건너뛴다» — 미납으로 치지 않는다 (핵심)
//     B. 기본이 미리보기(dry_run) — 보내려면 명시해야 한다
//     C. 인원 상한 — 한 번에 CAP 을 넘으면 사람이 그 수를 확인해야 보낸다
//     D. 세기 전에 보내지 않는다 — 대상자를 다 확정한 뒤에 발송 루프가 돈다
//     E. 문구는 solapi 템플릿이 정본 — 여기서 만들지 않는다
//     F. 매일 도는 cron(dunning/run)이 실제 발송으로 바뀌지 않았다

import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dir, '../cloudflare-deploy/src');
const txt = readFileSync(join(SRC, 'api-admin.ts'), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond, extra) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name + (extra ? ` — ${extra}` : '')); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${cond ? '' : (extra ? ` — ${extra}` : '')}`);
}

// ── 대상 블록만 잘라 본다 (파일 전체를 보면 다른 곳의 비슷한 코드에 걸린다) ──
const startIdx = txt.indexOf(`path === '/api/admin/payments/notify-all-overdue'`);
const endIdx   = txt.indexOf(`/api/admin/payments/overdue-log`, startIdx);
const blk = (startIdx >= 0 && endIdx > startIdx) ? txt.slice(startIdx, endIdx) : '';

console.log('\n💸 미납 독촉 오발송 방지');
console.log('\n  A. «결제 이력 없음» 을 미납으로 보지 않는다 (가장 중요)');
check('notify-all-overdue 블록을 찾았다', !!blk);
check('이력이 없으면 건너뛴다 (no_payment_record)',
      /no_payment_record/.test(blk),
      '건너뛰기 사유가 없다 — 이력 없는 학생에게 문자가 갈 수 있다');
check('«이력 없음 → 미납» 으로 되돌아가지 않았다',
      !/!\s*row\.last_paid_at\s*\|\|\s*row\.last_paid_at\s*<\s*cutoff/.test(blk),
      '`!row.last_paid_at || ... < cutoff` 가 되살아났다 — 2만 7천 명 오발송 조건');
check('daysOverdue 에 999 를 쓰지 않는다',
      !/:\s*999/.test(blk),
      '결제 이력이 없을 때 쓰던 가짜 일수(999)가 남아 있다');
check('유예 판정은 이력이 있을 때만 한다 (last_paid_at >= cutoff → 제외)',
      /row\.last_paid_at\s*>=\s*cutoff/.test(blk));

console.log('\n  B. 기본이 미리보기다');
check('dry_run 을 읽는다', /dry_run/.test(blk));
check('기본값이 «미리보기» 다 (dry_run !== false)',
      /body\.dry_run\s*!==\s*false/.test(blk),
      '기본이 «발송» 이면 실수로 눌렀을 때 그대로 나간다');
/* «dry_run 을 읽는다» 만으로는 부족하다 — 읽고 아무것도 안 해도 통과한다.
   미리보기가 **발송 전에 return 으로 빠져나가는지** 를 위치로 확인한다. */
check('미리보기는 목록만 돌려준다 (would_send_to)', /would_send_to/.test(blk));
check('미리보기 return 이 발송 호출보다 **앞**에 있다',
      blk.indexOf('dry_run: true') >= 0 &&
      blk.indexOf('dry_run: true') < blk.indexOf('sendPaymentOverdueAlert'),
      '미리보기 분기가 발송 뒤에 있으면 이미 보낸 뒤에 «미리보기» 라고 답하는 셈이다');

console.log('\n  C. 인원 상한');
check('상한(SEND_CAP)이 있다', /SEND_CAP/.test(blk));
check('상한을 넘으면 사람이 그 수를 적어야 한다 (confirm_send_over)',
      /confirm_send_over/.test(blk) && /too_many_recipients/.test(blk));
check('상한 검사가 발송 루프보다 **앞**에 있다',
      blk.indexOf('too_many_recipients') >= 0 &&
      blk.indexOf('too_many_recipients') < blk.indexOf('sendPaymentOverdueAlert'),
      '검사가 뒤에 있으면 이미 보낸 뒤에 막는 셈이다');

console.log('\n  D. 세기 전에 보내지 않는다');
check('대상자를 먼저 모은 뒤(targets) 발송 루프가 돈다',
      blk.indexOf('targets.push') >= 0 &&
      blk.indexOf('targets.push') < blk.indexOf('sendPaymentOverdueAlert'),
      '수집과 발송이 한 루프에 섞이면 «몇 명에게 갈지» 를 세기 전에 이미 나간다');

console.log('\n  E. 문구는 템플릿이 정본');
check('이 블록에서 문구를 만들지 않는다',
      !/fallbackSmsText|`\[망고아이\]/.test(blk),
      '발송 문구가 여기서 조립되고 있다 — 템플릿(solapi)이 정본이어야 한다');

console.log('\n  F. 매일 도는 cron(dunning/run)이 실제 발송으로 바뀌지 않았다');
{
  const dStart = txt.indexOf(`path === '/api/admin/dunning/run'`);
  const dEnd   = txt.indexOf(`/api/admin/dunning/log`, dStart);
  const dblk = (dStart >= 0 && dEnd > dStart) ? txt.slice(dStart, dEnd) : '';
  check('dunning/run 블록을 찾았다', !!dblk);
  /* ⚠️ 이건 «고쳐라» 가 아니라 «조용히 켜지지 마라» 는 감시다.
        이 경로는 매일 03:00 에 사람 없이 돈다(index.ts cron). 지금은 dunning_log 에
        문구만 적고 아무에게도 안 보낸다. 여기에 발송 호출이 생기면 **아무도 안 보는
        시간에 전사 발송**이 된다. 스코프도 없고 읽는 표(payments)도 17행짜리 껍데기다. */
  check('사람 없이 도는 cron 경로에 발송 호출이 없다',
        !/sendPaymentOverdueAlert|sendKakaoAlimtalk|sendPlainSms/.test(dblk),
        '매일 03:00 무인 실행 경로에 발송이 붙었다 — 스코프도 없어 전사 발송이 된다');

  /* ⏹ 2026-08-17 사장님 지시로 껐다. 스위치가 «꺼짐» 인지 여기서 못박는다.
       ⚠️ 이 검사는 «켜지 마라» 가 아니라 «켜려면 알고 켜라» 는 뜻이다.
          다시 켤 때는 위 주석의 다섯 가지(진짜 표·스코프·이름 치환·전화번호·중복발송)를
          해결한 뒤 이 하니스도 함께 고쳐야 한다. 조용히 되살아나는 것만 막는다. */
  check('자동 독촉 스위치가 있다 (DUNNING_RUN_ENABLED)',
        /const\s+DUNNING_RUN_ENABLED\s*=/.test(txt));
  check('스위치가 꺼져 있다',
        /const\s+DUNNING_RUN_ENABLED\s*=\s*false/.test(txt),
        '자동 독촉이 다시 켜졌다 — 진짜 표·스코프·이름치환·전화번호·중복발송을 먼저 확인했는가?');
  check('꺼진 상태에서 곧바로 되돌려준다 (DB 를 건드리지 않는다)',
        /if\s*\(\s*!DUNNING_RUN_ENABLED\s*\)[\s\S]{0,600}dunning_disabled/.test(dblk) ||
        /dunning_disabled/.test(dblk),
        '끄기 분기가 없다');
  check('끄기 응답이 사람이 읽을 message 를 담는다',
        /dunning_disabled[\s\S]{0,400}message:/.test(dblk),
        '오류 코드만 주면 화면에 «dunning_disabled» 라고만 뜬다');
}

console.log(`\n  ── PASS ${PASS} · FAIL ${FAIL}`);
if (FAIL) { console.log('\n  실패:'); for (const f of FAILS) console.log('   · ' + f); }
process.exit(FAIL ? 1 : 0);
