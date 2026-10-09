// 매일보고 → 결재 길 안내(2026-10-09) — 정본 src/handover-routing.ts 를 «실제로» 돌린다.
// 「잡는다」 옆에 「평범한 보고 줄은 안 잡는다」·「AI 가 지어낸 줄은 안 받는다」를 짝으로 둔다
// (짝이 없으면 «전부 결재로» 나 «아무것도 안 잡기» 가 통과한다).
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'cloudflare-deploy');
const SRC = process.env.ROUTE_SRC || join(ROOT, 'src', 'handover-routing.ts');
let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) pass++; else { fail++; console.log('❌ FAIL', name); } };

let M;
try {
  const js = stripTypeScriptTypes(readFileSync(SRC, 'utf8'));
  const dir = mkdtempSync(join(tmpdir(), 'hroute-'));
  const f = join(dir, 'm.mjs'); writeFileSync(f, js);
  M = await import(pathToFileURL(f).href);
} catch (e) { console.log('❌ FAIL 정본을 불러오지 못함:', e.message); process.exit(1); }

const T = (line) => M.ruleTypeOf(line);
// ① 잡아야 하는 줄
ok('₱ 금액 + 사야 → purchase', T('프린터 잉크 ₱1,200 사야 함') === 'purchase');
ok('영어 구입 → purchase', T('Need to buy headset PHP 850') === 'purchase');
ok('원 금액 + 주문 → purchase', T('마이크 3만원 주문 필요') === 'purchase');
ok('사비 + 영수증 → expense', T('택시비 사비로 ₱300 냄, 영수증 있음') === 'expense');
ok('reimburse → expense', T('Paid for printer ink out of pocket 450 pesos, please reimburse') === 'expense');
ok('휴가 → leave', T('다음 주 금요일 연차 쓰고 싶습니다') === 'leave');
ok('day off → leave', T('I need a day off on Oct 15') === 'leave');
ok('인사·급여는 안내하지 않음(전용 폼에 글을 옮길 칸이 없음)', T('Teacher Kaye 급여 인상 요청') === null && !M.ROUTE_TYPES.includes('hr'));
ok('급여 명세서 발송 완료 → 안 잡음', T('급여 명세서 발송 완료') === null);
ok('지난 휴가 «알림» 은 안 잡음', T('Teacher A 휴가 중이라 대신 수업함') === null && T('연차 다녀옴, 오늘 복귀') === null);
// ② 잡으면 안 되는 줄 (짝)
ok('평범한 보고 줄', T('카카오 문의 3건 답변') === null);
ok('수업 일정 확인', T('내일 수업 일정 확인 완료') === null);
ok('학생 결제 받음(매출)', T('학생 결제 5만원 받음') === null);
ok('교재 구입비 입금 받음(매출 — 구입 낱말이 있어도)', T('학부모가 교재 구입비 3만원 입금함') === null);
ok('입금 확인', T('Received payment from parent PHP 2,000') === null);
ok('이미 결재 올림', T('휴가 결재 올림') === null);
ok('이미 승인 받음', T('프린터 잉크 ₱1,200 구입 승인 받음') === null);
ok('금액만 있음(지어내지 않음)', T('수업료 문의 5만원') === null);
ok('Group 3 — p+숫자 오인 없음', M.parseAmount('Group 3 class review') === null);

// ③ 금액 읽기
const a = M.parseAmount('잉크 ₱1,200 사야 함');
ok('₱1,200 → 1200 PHP', a && a.amount === 1200 && a.currency === 'PHP');
const b = M.parseAmount('마이크 3만원');
ok('3만원 → 30000 KRW', b && b.amount === 30000 && b.currency === 'KRW');


// ③-2 함정 대조가 찾은 것(2026-10-09) — 줄 앞 숫자·낱말 오탐·학생 이야기·지출/수입 순서·조사 붙은 원
const L1 = M.approvalHints({ work: '1,200페소 마우스 구입', no_issue: true, no_open: true });
ok('줄 앞 금액이 안 잘림(1,200 → 1200)', L1.length === 1 && L1[0].amount === 1200 && L1[0].line.startsWith('1,200'));
const L2 = M.approvalHints({ work: '3만원 교재 구입 필요', no_issue: true, no_open: true });
ok('줄 앞 «3만원» 도 읽힘', L2.length === 1 && L2[0].amount === 30000);
ok('머리 번호는 벗김', M.linesOf('1. 카카오 답변\n2) 잉크 ₱300 사야 함')[1] === '잉크 ₱300 사야 함');
ok('학부모 결제 + 영수증 발송 = 매출', T('학부모 결제 완료, 영수증 발송') === null);
ok('학생 조퇴 ≠ 직원 휴가', T('학생 조퇴함') === null);
ok('「원에」 도 금액으로 읽음', T('마우스 12,000원에 구입 예정') === 'purchase');
ok('사비 + 영수증 받음은 여전히 지출 정산', T('택시비 사비로 ₱300 냄, 영수증 받음') === 'expense');
// 계정이 못 올리는 분류는 뺌 + 판정이 던져도 안 죽음(짝: 허용하면 남음)
const D2 = { work: '잉크 ₱300 사야 함\n다음 주 월요일 연차 쓰고 싶어요', no_issue: true, no_open: true };
ok('허용 안 하면 뺌', M.approvalHints(D2, null, t => t !== 'leave').map(x => x.type).join() === 'purchase');
ok('AI 가 hr 을 줘도 안 받음', M.approvalHints({ work: '교재 복사', no_issue: true, no_open: true }, [{ line: '교재 복사', type: 'hr' }]).length === 0);
ok('허용 함수가 없으면 그대로', M.approvalHints(D2).length === 2);
ok('허용 판정이 던지면 그 분류만 뺌', M.approvalHints(D2, null, () => { throw new Error('x'); }).length === 0);

// ④ 본문 전체 + AI 결과 합치기
const d = { work: '카카오 문의 3건 답변\n프린터 잉크 ₱1,200 사야 함', issue: '', no_issue: true, open: '다음 주 금요일 연차', no_open: false };
const h = M.approvalHints(d, [
  { line: '프린터 잉크 ₱1,200 사야 함', type: 'purchase' },          // 규칙과 겹침 → 한 번만
  { line: '사장님께 노트북 사 달라고 함', type: 'purchase' },          // 원문에 없음 → 버림
  { line: '카카오 문의 3건 답변', type: 'bogus' },                     // 모르는 종류 → 버림
]);
ok('규칙이 두 줄을 잡음', h.length === 2);
ok('같은 줄은 한 번만', h.filter(x => x.line.includes('잉크')).length === 1);
ok('AI 가 지어낸 줄은 없음', !h.some(x => x.line.includes('노트북')));
ok('금액이 실림', h.find(x => x.type === 'purchase')?.amount === 1200);
ok('이유가 한/영 둘 다', h.every(x => x.reason_ko && x.reason_en));
const h2 = M.approvalHints({ work: '교재 복사', issue: '', no_issue: true, open: '', no_open: true },
  [{ line: '교재 복사', type: 'purchase' }]);
ok('AI 가 원문 줄을 고르면 받음(source=ai)', h2.length === 1 && h2[0].source === 'ai');
ok('문제없음 체크면 그 칸은 안 봄', M.approvalHints({ work: 'x 보고', issue: '연차 신청', no_issue: true, open: '', no_open: true }).length === 0);
ok('AI 결과가 이상한 모양이어도 안 죽음', Array.isArray(M.approvalHints(d, { not: 'array' })));

// ⑤ 배선 — 서버가 실어 보내고, 화면이 그리고, 결재 화면이 받는가
const dh = readFileSync(join(ROOT, 'src', 'daily-handover.ts'), 'utf8');
ok('서버가 approval_hints 를 응답에 실음', /reply\(\{ok:true,check,suggestion,ai_state,approval_hints\}\)/.test(dh));
ok('서버가 정본을 부름(AI 결과·계정 허용 판정을 넘김)', /approvalHints\(data,aiApproval,[\s\S]{0,80}canSubmit\(actor,t,ph\)/.test(dh));
const js = readFileSync(join(ROOT, 'public', 'js', 'daily-handover.js'), 'utf8');
ok('화면이 approval_hints 를 그림', /paintRoute\(j\.approval_hints\)/.test(js));
ok('화면이 /work?type= 로 보냄', /'\/work\?type='\+encodeURIComponent\(h\.type\)/.test(js));
ok('자동 제출 없음(화면이 approval API 를 안 부름)', !/\/api\/approval\/(?!handover)/.test(js));
const html = readFileSync(join(ROOT, 'public', 'daily-handover.html'), 'utf8');
ok('상자 자리 있음', html.includes('id="mh-route"'));
const w = readFileSync(join(ROOT, 'public', 'work.html'), 'utf8');
ok('결재 화면이 같은 키를 읽음', w.includes("'mangoi_work_prefill_v1'") && js.includes("'mangoi_work_prefill_v1'"));
ok('결재 화면은 채우기만(초안 있으면 안 덮음)', /if \(WANT_TYPE && PICK && takePrefill\(WANT_TYPE, true\)\)/.test(w));
ok('계정이 다르면 안 채움', /d\.user && d\.user !== me/.test(w) && /user:me&&me\.username/.test(js));

console.log(`handover_approval_route_harness — PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
