// 매일보고 → 결재 길 안내 — «수백 개 문장» 대량 검사 (2026-10-09 사장님 「테스트 수백번 해줘」)
//
// handover_approval_route_harness.mjs 가 «손으로 고른» 사례를 본다면, 이 하니스는
//   ① 문장을 «조합으로 생성» 해 수백 줄을 판정하고(잡아야 할 줄 · 잡으면 안 되는 줄을 짝으로)
//   ② 시드 고정 난수로 보고서 1,000건을 만들어 «언제나 지켜야 할 성질» 을 확인하고
//   ③ 깨진 입력·AI 의 엉터리 응답을 수백 번 넣어 «죽지 않는가» 를 본다.
// 정본 src/handover-routing.ts 를 «그대로» 실행한다(ROUTE_SRC 로 변이본을 넣을 수 있다).
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'cloudflare-deploy');
const SRC = process.env.ROUTE_SRC || join(ROOT, 'src', 'handover-routing.ts');
let pass = 0, fail = 0; const fails = [];
const ok = (name, cond) => { if (cond) pass++; else { fail++; if (fails.length < 40) fails.push(name); } };

let M;
try {
  const js = stripTypeScriptTypes(readFileSync(SRC, 'utf8'));
  const dir = mkdtempSync(join(tmpdir(), 'hcorpus-'));
  const f = join(dir, 'm.mjs'); writeFileSync(f, js);
  M = await import(pathToFileURL(f).href);
} catch (e) { console.log('❌ FAIL 정본을 불러오지 못함:', e.message); process.exit(1); }

// 시드 고정 난수 — 실패가 나면 같은 입력으로 다시 재현된다
let seed = 20261009;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = a => a[Math.floor(rnd() * a.length)];

// ───────── ① 금액 읽기 — 숫자·형식 조합 ─────────
const fmt = n => n.toLocaleString('en-US');
const NUMS = [300, 450, 850, 1200, 2500, 4600, 12000, 35000, 150000, 1234567];
let amountCases = 0;
for (const n of NUMS) {
  const php = [`₱${fmt(n)}`, `₱ ${n}`, `PHP ${fmt(n)}`, `php${n}`, `${fmt(n)}페소`, `${n} 페소`, `${fmt(n)} pesos`, `${n} peso`];
  for (const s of php) { const a = M.parseAmount(`잉크 ${s} 사야 함`); amountCases++; ok(`PHP 금액 «${s}»`, a && a.amount === n && a.currency === 'PHP'); }
  const krw = [`${fmt(n)}원`, `${n} 원`, `₩${fmt(n)}`, `KRW ${n}`, `${fmt(n)}원에`, `${fmt(n)}원으로`, `${fmt(n)}원짜리`];
  for (const s of krw) { const a = M.parseAmount(`마우스 ${s} 구입`); amountCases++; ok(`KRW 금액 «${s}»`, a && a.amount === n && a.currency === 'KRW'); }
}
for (const man of [1, 3, 5, 12, 2.5]) { const a = M.parseAmount(`교재 ${man}만원 주문`); amountCases++; ok(`만원 «${man}»`, a && a.amount === Math.round(man * 10000) && a.currency === 'KRW'); }
// 금액이 아닌 숫자 — 지어내지 않는다
for (const s of ['Group 3 class review', 'Class 5 done', '3건 답변', '10월 15일 수업', 'BTS 12 교재', 'Lv 3 학생', 'p3 페이지', '2026-10-09 보고', '원어민 2명', '원격 수업 1회']) {
  amountCases++; ok(`금액 아님 «${s}»`, M.parseAmount(s) === null);
}

// ───────── ② 생성 문장 — 잡아야 할 줄 ─────────
const ITEMS_KO = ['프린터 잉크', '헤드셋', '마이크', '마우스', '웹캠', '화이트보드 마커', 'A4 용지', '노트북 충전기', '키보드', '공유기'];
const ITEMS_EN = ['printer ink', 'headset', 'microphone', 'mouse', 'webcam', 'whiteboard markers', 'bond paper', 'laptop charger', 'keyboard', 'router'];
const AMT_KO = ['₱1,200', 'PHP 850', '1,200페소', '450 pesos', '3만원', '12,000원', '₩5000', '12,000원에'];
const AMT_EN = ['₱1,200', 'PHP 850', '450 pesos', '2,500 PHP'];
const BUY_KO = ['사야 함', '구입 필요', '주문 필요', '구매 예정', '교체 필요', '살 예정'];
const BUY_EN = ['Need to buy', 'Purchase', 'Need to order', 'Need to get', 'Must replace'];
const POS = []; // [line, type]
for (const it of ITEMS_KO) for (const a of AMT_KO) for (const v of BUY_KO) POS.push([`${it} ${a} ${v}`, 'purchase']);
for (const it of ITEMS_EN) for (const a of AMT_EN) for (const v of BUY_EN) POS.push([`${v} ${it} ${a}`, 'purchase']);
const EXP_KO = [
  (it, a) => `${it} 사비로 ${a} 냄`,
  (it, a) => `${it} ${a} 자비로 결제, 정산 부탁드립니다`,
  (it, a) => `${it} ${a} 대신 냄 — 영수증 있음`,
  (it, a) => `${it} 영수증 첨부, ${a} 환급 요청`,
];
const EXP_EN = [
  (it, a) => `Paid for ${it} out of pocket ${a}, please reimburse`,
  (it, a) => `Bought ${it} myself ${a}, receipt attached`,
  (it, a) => `${it} ${a} paid out of my pocket, refund me please`,
];
for (const it of ITEMS_KO) for (const a of AMT_KO) for (const t of EXP_KO) POS.push([t(it, a), 'expense']);
for (const it of ITEMS_EN) for (const a of AMT_EN) for (const t of EXP_EN) POS.push([t(it, a), 'expense']);
const DAYS_KO = ['다음 주 금요일', '10월 15일', '내일', '다음 달 3일', '월요일', '이번 주 목요일 오후'];
const LEAVE_KO = ['연차 쓰고 싶습니다', '반차 신청하려고 합니다', '휴가 내고 싶어요', '병가가 필요합니다', '월차 쓰겠습니다', '조퇴해야 할 것 같습니다'];
const DAYS_EN = ['on Oct 15', 'next Friday', 'tomorrow', 'on Monday', 'next week'];
const LEAVE_EN = [d => `I need a day off ${d}`, d => `Requesting vacation ${d}`, d => `I'd like to take leave ${d}`, d => `Need sick leave ${d}`, d => `Asking for 2 days off ${d}`];
for (const d of DAYS_KO) for (const l of LEAVE_KO) POS.push([`${d} ${l}`, 'leave']);
for (const d of DAYS_EN) for (const l of LEAVE_EN) POS.push([l(d), 'leave']);

for (const [line, type] of POS) ok(`잡음 [${type}] «${line}»`, M.ruleTypeOf(line) === type);
// 금액이 실리는가 — 구입·정산 줄은 금액을 읽어 넘긴다
for (const [line, type] of POS) if (type !== 'leave') {
  const h = M.approvalHints({ work: line, no_issue: true, no_open: true });
  ok(`금액 실림 «${line}»`, h.length === 1 && h[0].amount != null && h[0].amount === M.parseAmount(line)?.amount);
}

// ───────── ③ 생성 문장 — 잡으면 안 되는 줄(짝) ─────────
const NEG = [];
const ROUTINE = [
  '카카오 문의 3건 답변', '내일 수업 일정 확인 완료', '신규 학생 2명 레벨테스트 진행', '교재 BTS 12 업로드 완료', '강사 출근 확인',
  '학부모 상담 1건 진행', 'Zoom 대신 화상수업 링크 재발송', '수업 녹화 점검', '체험수업 3건 배정', '결석 학생 보강 일정 잡음',
  'Answered 5 parent inquiries on Kakao', 'Checked tomorrow class schedule', 'Uploaded new BTS lesson slides', 'Teacher attendance confirmed',
  'Followed up on trial class students', 'Reviewed recording quality', 'Updated student contact list', 'Sent class link again',
  '사무실 청소 및 정리', '공지사항 게시', '주간 회의 참석', '강사 교육 자료 정리', '시간표 변경 반영', '레벨테스트 결과 안내 문자 발송',
  '급여 명세서 발송 완료', '인상적인 수업 사례 공유', '학생 피드백 정리', '교재 복사', '수업 품질 점검 5건',
];
for (const s of ROUTINE) NEG.push([s, '평범한 보고']);
const NAMES = ['김민서', '이준', 'Ana', 'Leo', '박서연'];
for (const n of NAMES) for (const a of ['50,000원', '3만원', '₱2,000', 'PHP 1,500']) {
  NEG.push([`학생 ${n} 수강료 ${a} 입금 확인`, '매출']);
  NEG.push([`학부모 결제 ${a} 받음`, '매출']);
  NEG.push([`${n} 학부모가 교재 구입비 ${a} 입금함`, '매출(구입 낱말)']);
  NEG.push([`Received payment ${a} from ${n}'s parent`, '매출']);
}
for (const [line] of POS.filter((_, i) => i % 7 === 0)) {
  for (const done of [' — 결재 올림', ' (승인 받음)', ', 결재 요청함', ' — approved', ' already submitted']) NEG.push([line + done, '이미 결재']);
}
for (const n of NAMES) for (const s of ['조퇴함', '결석 — 병가', '오늘 휴가로 결석', '결근 연락 옴']) NEG.push([`학생 ${n} ${s}`, '학생 이야기']);
for (const n of ['Teacher A', 'Kaye', '강선생님']) for (const s of ['휴가 중이라 대신 수업함', '연차 다녀와서 오늘 복귀', 'was on leave, covered for her', 'returned from vacation today', '병가 중 — 대타 수업']) NEG.push([`${n} ${s}`, '지난 휴가 알림']);
for (const a of ['5만원', '₱3,000', '12,000원', 'PHP 900']) for (const s of ['수업료 문의', '견적 문의 받음', '환불 문의 상담', '가격 안내함']) NEG.push([`${s} ${a}`, '금액만 있음']);

for (const [line, why] of NEG) ok(`안 잡음 [${why}] «${line}»`, M.ruleTypeOf(line) === null);

// ───────── ④ 시드 난수 보고서 1,000건 — «언제나» 지켜야 할 성질 ─────────
const POOL = [...POS.map(([l, t]) => ({ l, t })), ...NEG.map(([l]) => ({ l, t: null }))];
const norm = s => String(s).toLowerCase().replace(/\s+/g, ' ').trim();
const BULLETS = ['', '- ', '• ', '1. ', '2) ', '* ', '  '];
let reports = 0;
for (let k = 0; k < 1000; k++) {
  const make = () => Array.from({ length: Math.floor(rnd() * 5) }, () => pick(POOL));
  const W = make(), I = make(), O = make();
  const no_issue = rnd() < 0.4, no_open = rnd() < 0.4;
  const join = arr => arr.map(x => pick(BULLETS) + x.l).join(rnd() < 0.2 ? '; ' : '\n');
  const d = { work: join(W), issue: join(I), open: join(O), no_issue, no_open };
  const visible = [...W, ...(no_issue ? [] : I), ...(no_open ? [] : O)];
  const hidden = [...(no_issue ? I : []), ...(no_open ? O : [])].filter(x => !visible.some(v => v.l === x.l));
  // AI 가 섞어 주는 것: 원문 줄 · 지어낸 줄 · 모르는 종류
  const ai = [];
  if (rnd() < 0.5) for (let j = 0; j < 3; j++) {
    const r = rnd();
    if (r < 0.4 && visible.length) ai.push({ line: pick(visible).l, type: pick(['purchase', 'expense', 'leave']) });
    else if (r < 0.7) ai.push({ line: '사장님께 노트북 사 달라고 함 ' + k, type: 'purchase' });
    else ai.push({ line: visible.length ? pick(visible).l : 'x', type: pick(['hr', 'bogus', '', 'PURCHASE ']) });
  }
  let h; try { h = M.approvalHints(d, ai.length ? ai : null); } catch (e) { ok(`보고서 #${k} 안 죽음`, false); continue; }
  reports++;
  const visLines = visible.map(x => norm(x.l));
  ok(`#${k} 최대 5개`, h.length <= 5);
  ok(`#${k} 종류는 셋 중 하나`, h.every(x => M.ROUTE_TYPES.includes(x.type)));
  ok(`#${k} 모든 안내 줄이 «보이는 칸» 원문에 있음`, h.every(x => visLines.some(v => v === norm(x.line) || v.includes(norm(x.line)))));
  ok(`#${k} 지어낸 줄 없음`, !h.some(x => x.line.includes('사장님께 노트북')));
  ok(`#${k} 숨긴 칸(문제없음·남은일없음)만의 줄 없음`, !h.some(x => hidden.some(hd => norm(hd.l) === norm(x.line)) && !visLines.includes(norm(x.line))));
  ok(`#${k} 같은 줄 두 번 없음`, new Set(h.map(x => norm(x.line))).size === h.length);
  ok(`#${k} 규칙 안내는 규칙 판정과 같음`, h.filter(x => x.source === 'rule').every(x => M.ruleTypeOf(x.line) === x.type));
  ok(`#${k} 한/영 이유`, h.every(x => x.reason_ko && x.reason_en));
  ok(`#${k} 금액 = parseAmount`, h.every(x => (x.type === 'leave' ? x.amount === null : (x.amount ?? null) === (M.parseAmount(x.line)?.amount ?? null))));
  // 잡아야 할 줄이 다 잡혔는가(5개 상한 안에서) — «아무것도 안 잡기» 변이를 막는 짝
  const expect = [...new Set(visible.filter(x => x.t).map(x => norm(x.l)))];
  const ruleGot = h.filter(x => x.source === 'rule').map(x => norm(x.line));
  ok(`#${k} 잡아야 할 줄을 놓치지 않음`, expect.slice(0, 5).every(e => ruleGot.includes(e)) || h.length === 5);
  // 같은 입력 → 같은 답
  ok(`#${k} 결정론`, JSON.stringify(M.approvalHints(d, ai.length ? ai : null)) === JSON.stringify(h));
}

// ───────── ⑤ 계정이 못 올리는 분류 — 수백 조합 ─────────
const TYPES = ['purchase', 'expense', 'leave'];
let allowCases = 0;
for (let mask = 0; mask < 8; mask++) {
  const allowed = TYPES.filter((_, i) => mask & (1 << i));
  for (let k = 0; k < 40; k++) {
    const lines = Array.from({ length: 4 }, () => pick(POS)[0]);
    const h = M.approvalHints({ work: lines.join('\n'), no_issue: true, no_open: true }, null, t => allowed.includes(t));
    allowCases++; ok(`허용 ${allowed.join('+') || '없음'} #${k}`, h.every(x => allowed.includes(x.type)));
  }
}

// ───────── ⑥ 깨진 입력·AI 엉터리 응답 — 죽지 않는가 ─────────
const JUNK = [null, undefined, 0, 1, '', ' ', '\n\n\n', '{}', '[]', 'null', NaN, true, {}, [], [null], [1, 2, 3],
  'x'.repeat(20000), '₱'.repeat(500), '1,'.repeat(3000), '🥭'.repeat(1000), '\u0000\u0001\u0002', '<script>alert(1)</script>',
  "'; DROP TABLE x; --", '사야'.repeat(2000), '휴가\n'.repeat(400)];
let fuzz = 0;
for (const a of JUNK) for (const b of JUNK.slice(0, 10)) {
  fuzz++;
  let h = null, threw = false;
  try { h = M.approvalHints({ work: a, issue: b, open: a, no_issue: !!(fuzz % 2), no_open: !!(fuzz % 3) }, b); } catch { threw = true; }
  ok(`퍼즈 #${fuzz} 안 죽음`, !threw && Array.isArray(h) && h.length <= 5);
}
for (let k = 0; k < 200; k++) {
  const chars = '가나다사야구입휴가연차₱원페소0123456789,. -\n•;abcdefPHPpesos승인결재올림';
  const s = Array.from({ length: 5 + Math.floor(rnd() * 120) }, () => pick(chars)).join('');
  fuzz++;
  let threw = false, h = null; try { h = M.approvalHints({ work: s }, [{ line: s.slice(0, 20), type: pick(TYPES) }]); } catch { threw = true; }
  ok(`난수 문자열 #${k} 안 죽음`, !threw && h.length <= 5 && h.every(x => s.includes(x.line) || norm(s).includes(norm(x.line))));
}

console.log(`문장 판정: 잡을 줄 ${POS.length} · 안 잡을 줄 ${NEG.length} · 금액 ${amountCases} · 난수 보고서 ${reports} · 권한 조합 ${allowCases} · 퍼즈 ${fuzz}`);
if (fails.length) console.log('❌ FAIL 예:\n  ' + fails.join('\n  '));
console.log(`handover_route_corpus_harness — PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
