#!/usr/bin/env node
/**
 * 🔀 결재 자동화 14단계 (2026-09-25) — 잘못 고른 분류를 알려 주고, 누르면 그 분류로 옮겨 준다
 *
 * 사장님 「휴가신청에 잘못 결제 영수증이나 물품주문을 올리면 잘못 올렸다고 알림을 주고
 *          자동으로 물품으로 이동해서 올려주게」
 *
 * 무엇을 지키나
 *   ① misfileGuess — 제안한다 / 안 한다를 «짝으로». 섞이면(휴가 낱말 + 돈 낱말) 모른다 = null.
 *      휴가·문서 → 주문이면 물품 구입, 이미 낸 돈(영수증·정산)이면 지출 정산. 돈 결재 → 휴가는
 *      금액·영수증·돈 낱말이 «하나도» 없을 때만. 불만·긴급·인사급여는 건드리지 않는다.
 *   ② amountInText — 금액이 «정확히 하나» 일 때만 채운다(둘이면 어느 것인지 모른다).
 *   ③ 서버 배선 — 올릴 수 없는 분류는 권하지 않는다(canSubmit) · 휴가·문서는 AI 검토 없이 분류만 ·
 *      금액이 없으면 AI 를 부르지 않는다 · 목록(misfile_check)은 정본 MISFILE_FROM 하나.
 *   ④ 화면 — 분류 확인이 금액·날짜 칸 검사보다 «먼저» · 옮기기가 제목·내용·파일을 지키고
 *      **자동으로 올리지 않는다** · «그대로» 를 고르면 다시 안 묻는다 · 분류를 바꾸면 다시 묻는다.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dir, '..', 'cloudflare-deploy', 'src');
const PUB = join(__dir, '..', 'cloudflare-deploy', 'public');
const P = await import(pathToFileURL(process.env.POLICY_SRC || join(SRC, 'approval-policy.ts')).href);
const API = readFileSync(process.env.API_SRC || join(SRC, 'api-approval.ts'), 'utf8');
const WORK = readFileSync(process.env.WORK_SRC || join(PUB, 'work.html'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, why) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (why ? ' — ' + why : '')); }
}
function bodyAt(src, i) {
  const s = src.indexOf('{', i); if (s < 0 || i < 0) return '';
  let d = 0;
  for (let k = s; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(s, k + 1); }
  }
  return '';
}
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const fnAt = (src, i) => src.slice(i, src.indexOf('{', i)) + bodyAt(src, i);

console.log('\n① misfileGuess — 제안한다 / 안 한다');
try {
  const G = (reqType, title, body, extra) => P.misfileGuess(Object.assign({ reqType, title, body }, extra || {}));
  const to = g => (g ? g.to : null);
  // 제안한다
  ok('휴가에 «주문» → 물품 구입', to(G('leave', '프린터 잉크 주문', '교실 프린터 잉크 2개 ₱1,250')) === 'purchase');
  ok('휴가에 영수증·택시 → 지출 정산', to(G('leave', 'Taxi receipt', 'I paid the taxi fare ₱350 to the school')) === 'expense');
  ok('휴가에 영어 주문 → 물품 구입', to(G('leave', 'Order printer ink', 'Please buy supplies for the classroom')) === 'purchase');
  ok('일반 문서에 주문 + 금액 → 물품 구입', to(G('doc', '사무용품 주문', '볼펜 한 박스 ₱300')) === 'purchase');
  ok('물품 구입에 휴가 이야기만 → 휴가 신청', to(G('purchase', 'Day off request', 'I will be on leave next Monday')) === 'leave');
  ok('지출 정산에 병가 이야기만 → 휴가 신청', to(G('expense', '병가', '내일 병가 쓰겠습니다')) === 'leave');
  // 안 한다(짝)
  ok('휴가 신청에 휴가 이야기면 조용하다', G('leave', '연차 신청', '9/30 하루 쉬겠습니다') === null);
  ok('섞이면(휴가 + 돈) 모른다 = null', G('leave', '휴가 중 택시비', '휴가 가는 길 택시 영수증 ₱200') === null);
  ok('일반 문서는 돈 낱말 «하나» 로는 안 옮긴다', G('doc', '계약서 주문서 첨부', '거래처 계약서입니다') === null);
  ok('돈 낱말이 없으면(금액만 있어도) 휴가에서 안 옮긴다', G('leave', '9월 30일', '₱500') === null);
  ok('물품 구입에 휴가 낱말 + 금액 칸이 있으면 안 옮긴다', G('purchase', 'Day off', 'on leave', { amount: 500 }) === null);
  ok('물품 구입에 휴가 낱말 + 파일이 있으면 안 옮긴다', G('purchase', 'Day off', 'on leave', { hasFile: true }) === null);
  ok('물품 구입에 휴가 낱말 + 돈 낱말이면 안 옮긴다', G('purchase', 'Day off supplies', 'buy supplies before my day off') === null);
  ok('금액 0 은 «없음» 으로 본다(휴가로 옮길 수 있다)', to(G('purchase', 'Day off', 'on leave', { amount: 0 })) === 'leave');
  ok('불만·긴급·인사급여는 건드리지 않는다', G('complaint', '주문', '영수증 ₱100 주문') === null && G('urgent', '주문', '영수증 ₱100') === null && G('hr', 'day off', 'vacation') === null);
  ok('빈 글은 null', G('leave', '', '') === null);
  ok('모르는 분류는 null', G('bogus', '주문', '₱100 order') === null);
  ok('«order» 가 낱말 경계로만(«border» 는 아님)', G('leave', 'Border', 'the border of the room ₱100') === null);
  const g = G('leave', '잉크 주문', '₱1,250');
  ok('이유를 두 언어로', g && /물품 구입/.test(g.why_ko) && /Purchase/.test(g.why_en));
  ok('금액 힌트를 채운다', g && g.amount_hint && g.amount_hint.amount === 1250 && g.amount_hint.currency === 'PHP', JSON.stringify(g && g.amount_hint));
  ok('휴가로 옮길 때는 금액 힌트가 없다', G('purchase', 'Day off', 'on leave').amount_hint === null);
  ok('목록 정본', JSON.stringify(P.MISFILE_FROM) === JSON.stringify(['leave', 'doc', 'purchase', 'expense']));
} catch (e) { ok('misfileGuess 실행', false, e.message); }

console.log('\n② amountInText');
try {
  const A = P.amountInText;
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  ok('₱1,250 → 1250 PHP', eq(A('잉크 ₱1,250'), { amount: 1250, currency: 'PHP' }));
  ok('30,000원 → KRW', eq(A('택시 30,000원'), { amount: 30000, currency: 'KRW' }));
  ok('350 pesos → PHP', eq(A('paid 350 pesos'), { amount: 350, currency: 'PHP' }));
  ok('금액이 둘이면 null(어느 것인지 모름)', A('₱100 and ₱200') === null);
  ok('통화 없는 숫자는 금액이 아니다', A('2 boxes, room 301') === null);
  ok('0 은 null', A('₱0') === null);
  ok('빈 값 null', A('') === null && A(null) === null);
} catch (e) { ok('amountInText 실행', false, e.message); }

console.log('\n③ 서버 배선');
try {
  const code = strip(API);
  const pi = code.indexOf("path === '/api/approval/precheck'");
  const blk = bodyAt(code, pi);
  ok('전제: 점검 블록을 찾았다', pi > 0 && blk.length > 500);
  ok('분류 추측을 부른다', /misfileGuess\(\{ reqType,/.test(blk));
  ok('올릴 수 없는 분류는 권하지 않는다(canSubmit)', /misRaw && canSubmit\(actor, misRaw\.to, ph\)/.test(blk));
  const early = blk.indexOf('if (!spec.needsAmount) return json(');
  ok('휴가·문서는 분류만 보고 돌아간다', early > 0 && /misfile \}\)/.test(blk.slice(early, early + 160)));
  ok('그 조기 반환은 분류 추측 «뒤»', early > blk.indexOf('misfileGuess('));
  ok('그 조기 반환은 AI 검토 «앞»', early < blk.indexOf('aiReview('));
  ok('금액이 없으면 AI 를 부르지 않는다', /if \(ph && spec\.needsAmount && amount != null\)/.test(blk));
  const lastRet = blk.lastIndexOf('return json(');
  ok('마지막 응답에도 misfile', /misfile \}\)/.test(blk.slice(lastRet, lastRet + 140)));
  ok('기존 거절(분류·권한)은 그대로 앞에', blk.indexOf("'bad_req_type'") < blk.indexOf('misfileGuess(') && blk.indexOf("'forbidden_type'") < blk.indexOf('misfileGuess('));
  ok('화면 목록의 misfile_check 는 정본 MISFILE_FROM', /misfile_check: \(MISFILE_FROM as readonly string\[\]\)\.indexOf\(t\.key\) >= 0/.test(code));
  ok('제안 문구를 화면에서 다시 만들지 않는다(서버 why 를 그대로)', /why_ko: misRaw\.why_ko/.test(blk));
} catch (e) { ok('서버 배선', false, e.message); }

console.log('\n④ 화면');
try {
  const W = WORK;
  // ── misMove 를 오려 내 실제로 돌린다 ──
  const mi = W.indexOf('window.misMove = function(');
  ok('전제: misMove 를 찾았다', mi > 0);
  const src = fnAt(W, mi).replace(/^window\.misMove = /, '');
  const runMove = (opts) => {
    const vals = Object.assign({ f_title: '잉크 주문', f_body: '₱1,250', f_from: '', f_to: '', f_amount: '' }, opts.vals || {});
    const log = { picked: null, file: null, saved: 0, submitted: 0, cur: null, toast: '' };
    const types = [
      { key: 'leave', ko: '휴가 신청', en: 'Time off', wants_dates: true },
      { key: 'purchase', ko: '물품 구입', en: 'Purchase', needs_amount: true, wants_file: true, requires_file: true },
    ];
    const pbox = { innerHTML: '' };
    const S = {
      MIS_LAST: opts.last, MIS_OK: false, FILE: opts.file || null, D: { types },
      PICK: types[0],
      T: (en, ko) => ko, EN: () => false, toast: m => { log.toast = m; },
      getVal: id => vals[id] || '', setVal: (id, v) => { vals[id] = v; },
      pick: k => { log.picked = k; S.PICK = types.find(t => t.key === k); S.MIS_OK = false; S.FILE = null;
                   for (const k2 of ['f_title', 'f_body', 'f_from', 'f_to', 'f_amount']) vals[k2] = ''; },
      setCur: c => { log.cur = c; }, takeFile: f => { log.file = f; S.FILE = f; },
      draftSave: () => { log.saved++; }, submitReq: () => { log.submitted++; },
      esc: s => String(s), document: { getElementById: () => pbox },
    };
    const fn = new Function('S', 'with (S) { return (' + src + '); }')(S);
    fn();
    return { S, vals, log, pbox };
  };
  const last = { misfile: { to: 'purchase', to_ko: '물품 구입', to_en: 'Purchase', why_ko: 'x', why_en: 'x', amount_hint: { amount: 1250, currency: 'PHP' } } };
  const r = runMove({ last, file: { name: 'r.jpg' } });
  ok('옮기기 → 그 분류를 고른다', r.log.picked === 'purchase', r.log.picked);
  ok('제목·내용을 지킨다', r.vals.f_title === '잉크 주문' && r.vals.f_body === '₱1,250');
  ok('붙인 파일을 지킨다(영수증 판독이 다시 돈다)', r.log.file && r.log.file.name === 'r.jpg');
  ok('글 속 금액을 채운다', r.vals.f_amount === 1250 && r.log.cur === 'PHP');
  ok('⛔ 자동으로 올리지 않는다(사람이 확인하고 누른다)', r.log.submitted === 0);
  ok('같은 제안을 다시 하지 않는다(MIS_OK)', r.S.MIS_OK === true);
  ok('초안을 저장한다', r.log.saved === 1);
  ok('옮긴 사실을 말한다', /휴가 신청.*물품 구입.*옮겼습니다/.test(r.pbox.innerHTML), r.pbox.innerHTML);
  const r3 = runMove({ last: { misfile: Object.assign({}, last.misfile, { amount_hint: null }) } });
  ok('빠진 칸(금액·영수증 사진)을 알려 준다', /금액/.test(r3.pbox.innerHTML) && /영수증 사진/.test(r3.pbox.innerHTML), r3.pbox.innerHTML);
  const r4 = runMove({ last: { misfile: Object.assign({}, last.misfile, { to: 'expense' }) } });
  ok('올릴 수 없는 분류면 옮기지 않고 말한다', r4.log.picked === null && /올릴 수 없습니다/.test(r4.log.toast));
  const r5 = runMove({ last: null });
  ok('제안이 없으면 아무것도 안 한다', r5.log.picked === null && r5.log.saved === 0);

  // ── submitReq 순서: 분류 확인이 칸 검사보다 먼저 ──
  const si = W.indexOf('window.submitReq = function(');
  const sb = bodyAt(W, si);
  const ci = sb.indexOf('(PICK.needs_amount || PICK.misfile_check) && !PRE_OK');
  const fo = sb.indexOf('fieldsOk()');
  ok('분류 확인 대상이면 점검을 부른다', ci > 0);
  ok('분류 확인이 금액·날짜 칸 검사보다 «먼저»', ci > 0 && fo > ci, 'ci=' + ci + ' fo=' + fo);
  ok('옛 «금액을 넣어 주세요» 토스트가 제출 첫머리에 남아 있지 않다', sb.indexOf("'금액을 넣어 주세요.'") < 0);
  ok('제안이 오면 «그대로» 를 안 고른 경우만 띄운다', /if \(j\.misfile && !MIS_OK\) \{ paintMisfile\(j\); return; \}/.test(sb));
  ok('점검 실패는 막지 않는다(fail-open)', (sb.match(/afterCheck\(null\)/g) || []).length >= 2);

  // ── 실제로 돌려 순서를 본다: 휴가 폼 + 날짜 없음 + 제안 → 날짜 토스트가 아니라 제안 ──
  const runSubmit = async (j) => {
    const log = { toast: '', painted: 0, after: 0 };
    const S = {
      PICK: { key: 'leave', misfile_check: true, needs_amount: false, wants_dates: true },
      PRE_OK: false, MIS_OK: false, FILE: null, CUR: 'PHP', PHOTO_Q: '', OCR: null,
      T: (en, ko) => ko, toast: m => { log.toast = m; }, esc: s => String(s),
      getVal: id => (id === 'f_title' ? '잉크 주문' : ''),
      document: { getElementById: () => ({ innerHTML: '', disabled: false }) },
      fileHashOf: () => Promise.resolve(''),
      fetch: () => Promise.resolve({ json: () => Promise.resolve(j) }),
      paintMisfile: () => { log.painted++; },
      afterCheck: () => { log.after++; },
      fieldsOk: () => { log.toast = '휴가 시작일을 골라 주세요.'; return false; },
      JSON,
    };
    const fn = new Function('S', 'with (S) { return (function(){' + sb.slice(1, -1) + '}); }')(S);
    fn();
    for (let k = 0; k < 10; k++) await new Promise(res => setTimeout(res, 0));
    return log;
  };
  const a = await runSubmit({ ok: true, signal: 'green', misfile: { to: 'purchase' } });
  ok('실행: 제안이 있으면 날짜 토스트가 아니라 제안을 띄운다', a.painted === 1 && a.toast === '', JSON.stringify(a));
  const b = await runSubmit({ ok: true, signal: 'green', misfile: null });
  ok('실행(짝): 제안이 없으면 다음 걸음(afterCheck)으로', b.painted === 0 && b.after === 1, JSON.stringify(b));

  // ── 분류를 바꾸면 다시 묻는다 ──
  const pk = bodyAt(W, W.indexOf('window.pick = function('));
  ok('분류를 새로 고르면 «그대로» 선택을 지운다', /MIS_OK = false;/.test(pk) && /MIS_LAST = null;/.test(pk));
  // ── «그대로» 는 기존 점검 흐름으로 ──
  const kb = bodyAt(W, W.indexOf('window.misKeep = function('));
  ok('«그대로 올리기» 는 MIS_OK 를 세우고 원래 점검 흐름으로', /MIS_OK = true;/.test(kb) && /afterCheck\(MIS_LAST\)/.test(kb));
  // ── 표시 ──
  const pm = bodyAt(W, W.indexOf('function paintMisfile('));
  ok('두 버튼(옮기기 · 그대로) 을 그린다', /onclick="misMove\(\)"/.test(pm) && /onclick="misKeep\(\)"/.test(pm));
  ok('서버가 준 이유를 그대로 보여 준다', /m\.why_en : m\.why_ko/.test(pm));
  ok('옮기기 버튼 색이 있다(밝은·어두운)', /\.whybtns button\.ok\{/.test(W) && /html\.dark \.whybtns button\.ok\{/.test(W));
  ok('이유 줄 글자색(밝은·어두운)', /\.mistxt\{/.test(W) && /html\.dark \.mistxt\{/.test(W));
  // ── 파일 받기가 한 곳(takeFile) — 옮길 때 같은 경로를 쓴다 ──
  ok('파일 고르기가 takeFile 을 거친다', /function takeFile\(f\)\{/.test(W) && /takeFile\(/.test(bodyAt(W, W.indexOf('window.gotFile = function(')) || ''));
} catch (e) { ok('화면 실행', false, e.stack); }

console.log('\n결과: PASS ' + pass + ' / FAIL ' + fail);
if (fail) process.exit(1);
