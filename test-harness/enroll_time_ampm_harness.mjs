#!/usr/bin/env node
// enroll_time_ampm_harness.mjs — 수강 등록·수업 옮기기의 «오전/오후» 사고 감시 (2026-10-30)
//
// [사고] 2026-10-29 매니저(영어 화면)가 저녁 7:40 수업을 등록했는데 수강 #93 의 목요일 20회가
//        전부 «오전 07:40» 으로 만들어졌다. 서버 파서(parseTimesByDow)가 'PM' 을 버리고 07:40 으로,
//        'Mon 7:30' 의 영어 요일을 무시하고 첫 시각을 모든 요일에 썼다 — 에러는 한 줄도 없었다.
//        그 뒤 «연기·변경» 창에서도 칩은 24시(07:40/19:40), 폰 시각 칸은 AM/PM 이라 또 헷갈렸다.
//
// [감시하는 것] 문자열이 아니라 «정본을 오려 내 실제로 돌려» 답을 대조한다(CLAUDE.md 2장).
//   A. 서버 normalizeTimeText·parseTimesByDow (src/enroll-activate.ts) — 정해진 답 + 전수(1,440분 × 표기 6종)
//   B. 화면 _enNormTimeText (js/adm-core.js) 와 서버가 «같은 글자» 를 내는가 — 생성 입력 수천 개 + 무작위 퍼즈
//   C. 화면 미리보기 _enTimeHint — 오전 경고가 «오전을 직접 적은 사람» 에게는 안 뜨는가(짝)
//   D. 배선 — 보내는 값(_readEnrollmentRows)·여러 강사 조합(_mtbClassifyCombo)·미리보기 칸·⏰ 빌더
//   E. 수업 옮기기 창(js/class-move-modal.js) mvAp·mvHmFull·mvFlip — 1,440 × 1,440 전수
//   F. 옛 입력(표시 없는 24시·한글 요일)은 «한 글자도» 안 바뀐다 — 고치는 김에 다른 사람 등록을 바꾸지 않는다
//   ⚠️ 브라우저로 실제 화면(연기된 수업 창·시간 칸 미리보기)을 누르는 검사는
//      test-harness/manual/move-modal-ampm-browser.mjs (자동으로 안 돕니다, 사람이 부릅니다).
//
// 실행: node test-harness/enroll_time_ampm_harness.mjs

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

const __dir = dirname(fileURLToPath(import.meta.url));
const R = p => readFileSync(join(__dir, '..', p), 'utf8');
const serverSrc = R('cloudflare-deploy/src/enroll-activate.ts');
const core = R('cloudflare-deploy/public/js/adm-core.js');
const modal = R('cloudflare-deploy/public/js/class-move-modal.js');

let pass = 0, fail = 0;
const fails = [];
const ok = (c, m, extra) => {
  if (c) { pass++; console.log('  ✅ ' + m); }
  else { fail++; fails.push(m); console.log('  ❌ ' + m + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : '')); }
};

/* 중괄호 짝으로 «function 이름(…) { … }» 전체를 자른다 — 괄호 깊이 0 인 첫 여는 중괄호가 몸통 시작 */
function fnAt(s, anchor) {
  const i = s.indexOf(anchor);
  if (i < 0) return '';
  let j = i, paren = 0, start = -1;
  for (; j < s.length; j++) {
    const c = s[j];
    if (c === '(') paren++; else if (c === ')') paren--;
    else if (c === '{' && paren === 0) { start = j; break; }
  }
  if (start < 0) return '';
  let d = 0;
  for (let k = start; k < s.length; k++) {
    if (s[k] === '{') d++; else if (s[k] === '}') { d--; if (d === 0) return s.slice(i, k + 1); }
  }
  return '';
}

/* 결정론적 난수(같은 씨앗 → 같은 입력) — 실패를 그대로 다시 재현할 수 있게 */
function rng(seed) { let x = seed >>> 0; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }
const pad2 = n => (n < 10 ? '0' : '') + n;

console.log('════════ 0부. 정본을 오려 낸다 (못 찾으면 아래 검사가 «헛돌며 통과» 하므로 전제로 둔다) ════════');
const consts = (serverSrc.match(/const DOW_KO[\s\S]*?const DOW_LABEL[^\n]*\n/) || [''])[0];
const sNorm = fnAt(serverSrc, 'export function normalizeTimeText(');
const sParse = fnAt(serverSrc, 'export function parseTimesByDow(');
ok(!!consts && !!sNorm && !!sParse, '(전제) 서버 normalizeTimeText·parseTimesByDow·요일 표를 찾았다');
let S = null;
try {
  const js = stripTypeScriptTypes(consts + sNorm.replace(/^export /, '') + '\n' + sParse.replace(/^export /, ''));
  S = new Function(js + '\nreturn { normalizeTimeText, parseTimesByDow };')();
} catch (e) { ok(false, '(전제) 서버 함수를 실제로 컴파일했다: ' + e.message); }
ok(!!S, '(전제) 서버 함수를 실제로 돌릴 수 있다');

const cNormSrc = fnAt(core, 'function _enNormTimeText(raw)');
const cHintSrc = fnAt(core, 'function _enTimeHint(raw)');
const cPaintSrc = fnAt(core, 'function _enPaintTimeHint(tr)');
ok(!!cNormSrc && !!cHintSrc && !!cPaintSrc, '(전제) 화면 _enNormTimeText·_enTimeHint·_enPaintTimeHint 를 찾았다');
let C = null;
try { C = new Function(cNormSrc + '\n' + cHintSrc + '\nreturn { norm: _enNormTimeText, hint: _enTimeHint };')(); }
catch (e) { ok(false, '(전제) 화면 함수를 실제로 컴파일했다: ' + e.message); }
ok(!!C, '(전제) 화면 함수를 실제로 돌릴 수 있다');
/* ⛔ 화면 파일에 뒤돌아보기 정규식을 «새로» 넣지 않는다 — 옛 iOS 사파리(16.4 미만)는 리터럴 하나로 파일 전체가 문법 오류.
   (adm-core.js 에는 예전부터 한 곳이 있다 — 별건이라 «이 함수들 안» 만 본다. 주석은 벗기고 본다.) */
const noComments = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
ok(!/\(\?<[!=]/.test(noComments(cNormSrc + cHintSrc + cPaintSrc)), '화면 정규화·미리보기 함수에 뒤돌아보기 정규식이 없다(옛 사파리 문법 오류 방지)');
ok(!/\(\?<[!=]/.test(noComments(sNorm)), '서버 normalizeTimeText 도 같은 규칙(뒤돌아보기 없음) — 두 곳이 글자 그대로 같은 방식');

if (!S || !C) { console.log('\n결과: PASS ' + pass + ' / FAIL ' + fail); process.exit(1); }

console.log('\n════════ A. 서버 — 정해진 답 ════════');
const D = [1, 3, 4]; // 월·수·목
const fixed = [
  ['7:40 PM', { 1: '19:40', 3: '19:40', 4: '19:40' }], ['7:40pm', { 1: '19:40', 3: '19:40', 4: '19:40' }],
  ['7:40 p.m.', { 1: '19:40', 3: '19:40', 4: '19:40' }], ['7:40P.M.', { 1: '19:40', 3: '19:40', 4: '19:40' }],
  ['PM 7:40', { 1: '19:40', 3: '19:40', 4: '19:40' }], ['오후 7:40', { 1: '19:40', 3: '19:40', 4: '19:40' }],
  ['오후7:40', { 1: '19:40', 3: '19:40', 4: '19:40' }], ['7:40 오후', { 1: '19:40', 3: '19:40', 4: '19:40' }],
  ['7:40 AM', { 1: '07:40', 3: '07:40', 4: '07:40' }], ['오전 7:40', { 1: '07:40', 3: '07:40', 4: '07:40' }],
  ['12:10 AM', { 1: '00:10', 3: '00:10', 4: '00:10' }], ['12:10 PM', { 1: '12:10', 3: '12:10', 4: '12:10' }],
  ['12:00 오전', { 1: '00:00', 3: '00:00', 4: '00:00' }], ['7pm', { 1: '19:00', 3: '19:00', 4: '19:00' }],
  ['7 PM', { 1: '19:00', 3: '19:00', 4: '19:00' }], ['12am', { 1: '00:00', 3: '00:00', 4: '00:00' }],
  ['19:40', { 1: '19:40', 3: '19:40', 4: '19:40' }], ['19:40 PM', { 1: '19:40', 3: '19:40', 4: '19:40' }],
  ['7:40', { 1: '07:40', 3: '07:40', 4: '07:40' }],
  ['Mon 7:30, Wed 8:00', { 1: '07:30', 3: '08:00', 4: '07:30' }],
  ['Monday 7:30pm, Wednesday 8 pm', { 1: '19:30', 3: '20:00', 4: '19:30' }],
  ['Thu 7:40 PM', { 1: '19:40', 3: '19:40', 4: '19:40' }],
  ['MON 6:00PM, THURS 7:20PM', { 1: '18:00', 3: '18:00', 4: '19:20' }],
  ['Tues 7:30 pm', {}],  // 화요일 시각뿐인데 고른 요일은 월·수·목 → 예전 규칙 그대로 «아무 요일도 안 채움»(지어내지 않는다)
  ['월 07:30, 수 08:00', { 1: '07:30', 3: '08:00', 4: '07:30' }],
  ['월 오후 7:30, 수 오후 8:00', { 1: '19:30', 3: '20:00', 4: '19:30' }],
  ['7:30 PM 8:00 PM', { 1: '19:30', 3: '19:30', 4: '19:30' }], // ⚠️ 앞 PM 이 뒤 시각에 붙으면 안 된다(순서 함정)
  ['', {}],
];
ok(JSON.stringify(S.parseTimesByDow('Tues 7:30 pm', [2])) === JSON.stringify({ 2: '19:30' }), '«Tues 7:30 pm» + 화요일 → 화 19:30');
for (const [t, want] of fixed) {
  const got = S.parseTimesByDow(t, D);
  ok(JSON.stringify(got) === JSON.stringify(want), 'parseTimesByDow(' + JSON.stringify(t) + ')', { got, want });
}
ok(S.normalizeTimeText('month 7:30') === 'month 7:30', '«month» 는 요일 «mon» 이 아니다(낱말 경계)');
ok(S.normalizeTimeText('Samuel 7:40') === 'Samuel 7:40', '«Samuel» 의 «am» 을 오전 표시로 읽지 않는다');
ok(S.normalizeTimeText('7:99 PM') === '7:99 PM', '없는 시각(7:99)은 바꾸지 않는다(지어내지 않는다)');

console.log('\n════════ A-2. 서버 — 전수: 1~12시 × 60분 × 오전/오후 × 표기 6종 ════════');
const spell = [
  (h, m, ap) => h + ':' + m + ' ' + ap, (h, m, ap) => h + ':' + m + ap.toLowerCase(),
  (h, m, ap) => h + ':' + m + ' ' + ap[0].toLowerCase() + '.m.', (h, m, ap) => ap + ' ' + h + ':' + m,
  (h, m, ap) => (ap === 'AM' ? '오전 ' : '오후 ') + h + ':' + m, (h, m, ap) => (ap === 'AM' ? '오전' : '오후') + h + ':' + m,
];
let aCnt = 0, aBad = [];
for (let h = 1; h <= 12; h++) for (let mi = 0; mi < 60; mi++) for (const ap of ['AM', 'PM']) {
  const want = pad2(ap === 'AM' ? (h === 12 ? 0 : h) : (h === 12 ? 12 : h + 12)) + ':' + pad2(mi);
  for (const sp of spell) {
    const t = sp(h, pad2(mi), ap);
    const got = S.parseTimesByDow(t, [4])['4'];
    aCnt++;
    if (got !== want && aBad.length < 5) aBad.push({ t, got, want });
  }
}
ok(aBad.length === 0, '서버가 ' + aCnt + '개 표기를 전부 맞는 24시로 바꾼다', aBad);

console.log('\n════════ F. 옛 입력은 한 글자도 안 바뀐다 (표시 없는 24시 · 한글 요일) ════════');
let fCnt = 0, fBad = [];
const KO = ['일', '월', '화', '수', '목', '금', '토'];
for (let h = 0; h < 24; h++) for (let mi = 0; mi < 60; mi++) {
  for (const t of [pad2(h) + ':' + pad2(mi), h + ':' + pad2(mi), KO[(h + mi) % 7] + ' ' + pad2(h) + ':' + pad2(mi) + ', ' + KO[(h + mi + 2) % 7] + h + ':' + pad2(mi)]) {
    fCnt++;
    if ((S.normalizeTimeText(t) !== t || C.norm(t) !== t) && fBad.length < 5) fBad.push({ t, s: S.normalizeTimeText(t), c: C.norm(t) });
  }
}
ok(fBad.length === 0, '옛 모양 ' + fCnt + '개가 서버·화면 모두 그대로 남는다(다른 사람 등록의 뜻이 안 바뀐다)', fBad);

console.log('\n════════ B. 화면 = 서버 (같은 입력 → 같은 글자) — 생성 입력 + 무작위 퍼즈 ════════');
const pool = [];
for (let h = 0; h <= 23; h++) for (let mi = 0; mi < 60; mi += 5) {
  const hm = h + ':' + pad2(mi);
  pool.push(hm, pad2(h) + ':' + pad2(mi), hm + ' PM', hm + 'am', 'PM ' + hm, '오후 ' + hm, '오전' + hm, hm + ' p.m.');
}
const days = ['Mon', 'monday', 'TUE', 'Tues', 'wed', 'Wednesday', 'Thu', 'thur', 'THURS', 'Fri', 'friday', 'Sat', 'sun', 'Sunday', '월', '화', '수', '목', '금', '토', '일'];
const marks = ['', ' PM', 'pm', ' AM', 'am', ' p.m.', ' a.m.', ' 오후', ' 오전'];
const pre = ['', 'PM ', 'AM ', '오후 ', '오전 '];
const junk = ['', ' ', ',', ', ', ' / ', '·', ' - ', '  ', ';', 'month ', 'Samuel ', 'xx', '7:', ':30', '13pm', '0:15 PM', '24:00', '7.40', '12', '\t'];
// 씨앗은 기본 고정(실패 재현) — 다른 입력으로 여러 번 돌리려면 AMPM_SEED=숫자 로 바꿔 부른다
const R1 = rng(Number(process.env.AMPM_SEED) || 20261030);
const pick = a => a[Math.floor(R1() * a.length)];
for (let i = 0; i < 3000; i++) {
  const parts = [];
  const n = 1 + Math.floor(R1() * 3);
  for (let k = 0; k < n; k++) {
    const h = Math.floor(R1() * 26), mi = Math.floor(R1() * 62);
    const t = (R1() < 0.5 ? h : pad2(h)) + (R1() < 0.08 ? '' : ':' + pad2(mi));
    parts.push((R1() < 0.6 ? pick(days) + (R1() < 0.5 ? ' ' : '') : '') + (R1() < 0.2 ? pick(pre) : '') + t + (R1() < 0.5 ? pick(marks) : ''));
  }
  pool.push(pick(junk) + parts.join(pick([', ', ' ', ',', ' / ', '; '])) + pick(junk));
}
let bCnt = 0, bBad = [];
for (const t of pool) {
  bCnt++;
  const s = S.normalizeTimeText(t), c = C.norm(t);
  if (s !== c && bBad.length < 5) bBad.push({ t, s, c });
}
ok(bBad.length === 0, '화면과 서버가 ' + bCnt + '개 입력에서 글자 하나까지 같은 답을 낸다', bBad);
let iBad = [];
for (const t of pool) { const once = C.norm(t); if (C.norm(once) !== once && iBad.length < 5) iBad.push({ t, once, twice: C.norm(once) }); }
ok(iBad.length === 0, '두 번 다듬어도 같다(멱등) — 화면이 다듬어 보낸 글자를 서버가 또 다듬어도 뜻이 안 바뀐다', iBad);
let pBad = [];
for (const t of pool) {
  const a = JSON.stringify(S.parseTimesByDow(t, [0, 1, 2, 3, 4, 5, 6]));
  const b = JSON.stringify(S.parseTimesByDow(C.norm(t), [0, 1, 2, 3, 4, 5, 6]));
  if (a !== b && pBad.length < 5) pBad.push({ t, raw: a, viaClient: b });
}
ok(pBad.length === 0, '«화면이 다듬어 보낸 것» 과 «원문을 서버가 받은 것» 이 같은 시간표를 만든다(' + pool.length + '개)', pBad);

console.log('\n════════ C. 미리보기 _enTimeHint — 오전 경고와 그 짝 ════════');
const h1 = C.hint('7:40');
ok(h1 && !h1.bad && h1.morning === true && h1.slots[0].hm === '07:40', '«7:40» → 07:40 이고 «오전» 경고를 켠다(이번 사고 모양)', h1);
const h2 = C.hint('7:40 PM');
ok(h2 && !h2.bad && h2.morning === false && h2.slots[0].hm === '19:40', '«7:40 PM» → 19:40, 경고 없음', h2);
const h3 = C.hint('7:40 AM');
ok(h3 && h3.morning === false && h3.slots[0].hm === '07:40', '짝: «7:40 AM» 처럼 오전을 직접 적으면 경고하지 않는다', h3);
ok(C.hint('오전 7:40').morning === false, '짝: «오전 7:40» 도 경고하지 않는다');
ok(C.hint('19:40').morning === false, '«19:40» → 경고 없음');
ok(C.hint('12:30').morning === false, '«12:30»(낮 12시) → 경고 없음');
const h4 = C.hint('Mon 7:30, Wed 20:00');
ok(h4 && h4.slots.length === 2 && h4.slots[0].day === '월' && h4.slots[1].hm === '20:00' && h4.morning === true, '«Mon 7:30, Wed 20:00» → 월 07:30(오전 경고) · 수 20:00', h4);
ok(C.hint('abc').bad === true, '«abc» → 읽지 못함(bad)');
ok(C.hint('') === null && C.hint('   ') === null, '빈 칸 → null(아무것도 안 그림)');
ok(C.hint('25:00').bad === true, '«25:00» → 읽지 못함(없는 시각을 지어내지 않는다)');
/* 전수: 0~23시 × 60분 «표시 없는 24시» — 경고는 정확히 1~11시에만 */
let cBad = [];
for (let h = 0; h < 24; h++) for (let mi = 0; mi < 60; mi++) {
  const r = C.hint(h + ':' + pad2(mi));
  const want = h >= 1 && h <= 11;
  if ((!r || r.bad || r.morning !== want || r.slots[0].hm !== pad2(h) + ':' + pad2(mi)) && cBad.length < 5) cBad.push({ h, mi, r });
}
ok(cBad.length === 0, '1,440분 전수 — 오전 경고가 정확히 1~11시에만 뜨고, 읽은 시각이 맞다', cBad);

console.log('\n════════ D. 배선 — 실제로 쓰는가 ════════');
/* D-1. 보내는 값: _readEnrollmentRows 를 가짜 행으로 실제로 돌린다 */
const readSrc = fnAt(core, 'function _readEnrollmentRows()');
const addMonthsSrc = fnAt(core, 'function _enAddMonths(startISO, months)');
ok(!!readSrc && !!addMonthsSrc, '(전제) _readEnrollmentRows·_enAddMonths 를 찾았다');
const field = v => ({ value: v == null ? '' : String(v) });
function makeRow(v) {
  const one = {
    '.en-row-uid': field(v.uid), '.en-row-name': field(''), '.en-row-package': field('정규'), '.en-row-fee': field(''),
    '.en-row-start': field('2026-11-05'), '.en-row-time': field(v.time), '.en-row-size': field('1:1'),
    '.en-row-classmin': field(20), '.en-row-priority': field('schedule'), '.en-row-teacher': field(''),
    '.en-row-duration': field('3'), '.en-row-phone': field(''),
  };
  const many = { '.en-row-type:checked': [{ value: 'regular' }], '.en-row-day:checked': (v.days || ['thu']).map(d => ({ value: d })) };
  return { dataset: v.plan ? { enMultiTeacherPlan: v.plan } : {}, querySelector: s => one[s] || null, querySelectorAll: s => many[s] || [] };
}
function runRead(rows) {
  const document = { querySelectorAll: sel => (sel === '#en-multi-rows tr' ? rows : []) };
  const am = new Function(addMonthsSrc + '\nreturn _enAddMonths;')();
  return new Function('document', '_enAddMonths', cNormSrc + '\n' + readSrc + '\nreturn _readEnrollmentRows;')(document, am)();
}
try {
  const out = runRead([makeRow({ uid: 'u1', time: '7:40 PM' }), makeRow({ uid: 'u2', time: 'Mon 7:30, Wed 8 pm', days: ['mon', 'wed'] }), makeRow({ uid: 'u3', time: '19:20' }), makeRow({ uid: 'u4', time: '' })]);
  ok(out[0].time === '19:40' && out[0]._time === '19:40', '«7:40 PM» 행은 서버에 «19:40» 으로 간다', out[0].time);
  ok(out[1].time === '월 7:30, 수 20:00', '«Mon 7:30, Wed 8 pm» 행은 «월 7:30, 수 20:00» 으로 간다', out[1].time);
  ok(out[2].time === '19:20', '짝: 옛 모양 «19:20» 은 그대로 간다', out[2].time);
  ok(out[3].time === null, '짝: 빈 칸은 예전처럼 null', out[3].time);
} catch (e) { ok(false, '_readEnrollmentRows 를 실제로 돌렸다: ' + e.message); }

/* D-2. 여러 강사 조합 판정: '7:40 PM' 을 «미완성» 으로 막지 않고 19:40 으로 받는다 */
const tbSrc = fnAt(core, 'function _tbTimeToParts(t)');
const clsSrc = fnAt(core, 'function _mtbClassifyCombo(teacher, days, timeRaw)');
try {
  const cls = new Function(cNormSrc + '\n' + tbSrc + '\n' + clsSrc + '\nreturn _mtbClassifyCombo;')();
  const r1 = cls('Kes', ['tue'], '7:40 PM');
  ok(r1.kind === 'valid' && r1.combo.time === '19:40', '«7:40 PM» 조합 → 유효 · 19:40', r1);
  const r2 = cls('Kes', ['tue'], '14:00');
  ok(r2.kind === 'valid' && r2.combo.time === '14:00', '짝: «14:00» 은 예전 그대로 유효', r2);
  ok(cls('Kes', ['tue'], 'abc').kind === 'partial', '짝: 못 읽는 시각은 여전히 «미완성»');
} catch (e) { ok(false, '_mtbClassifyCombo 를 실제로 돌렸다: ' + e.message); }

/* D-3. 미리보기 칸: 행 마크업에 있고, 칠 때마다 그리며, ⏰ 빌더가 값을 쓴 뒤에도 다시 그린다 */
const rowFn = fnAt(core, 'function _addEnrollmentRow(prefill)');
const timeTd = (/'<td class="en-c en-c-time"[\s\S]*?'<\/td>' \+/.exec(rowFn) || [''])[0];
ok(/class="en-time-hint"/.test(timeTd), '미리보기 칸(.en-time-hint)이 «시간» 칸 안에 있다');
/* ⛔ 그 칸 클래스에 «-row» 가 들어가면 관리자 CSS 의 옛 규칙이 바탕을 덮어 노란 경고가 사라진다(실제 렌더로 확인) — 규칙이 있는 한 짝으로 본다 */
const adminCss = R('cloudflare-deploy/public/css/admin-inline-c.css');
const hintCls = (/<div class="([^"]*)"[^>]*aria-live="polite"/.exec(timeTd) || [])[1] || '';
ok(/\[class\*="-row"\]/.test(adminCss) ? !/-row/.test(hintCls) && hintCls.length > 0 : hintCls.length > 0, '미리보기 칸 클래스(' + hintCls + ')가 옛 규칙 [class*="-row"] 에 안 걸린다');
ok(/\.en-row-time'\)[\s\S]{0,120}addEventListener\('input',\s*\(\)\s*=>\s*_enPaintTimeHint\(tr\)\)/.test(rowFn), '시간 칸에 «칠 때마다 미리보기» 를 단다(input 이벤트)');
ok(/_enPaintTimeHint\(tr\);\s*\}\s*\}/.test(rowFn), '행을 만들 때 한 번 그린다(불러온 값도 바로 보이게)');
const tbFn = fnAt(core, 'async function _openTimeBuilder(tr)') || fnAt(core, 'function _openTimeBuilder(tr)');
ok(!!tbFn && /timeInput\.value =[\s\S]*_enPaintTimeHint\(tr\);\s*close\(\);/.test(tbFn), '⏰ 빌더가 값을 쓴 뒤 미리보기를 다시 그린다(값 대입은 input 이벤트를 안 낸다)');
ok(!!tbFn && /_parseScheduleText\(_enNormTimeText\(currentTime\)\)/.test(tbFn), '⏰ 빌더가 «Mon 7:30 PM» 도 읽고 열린다(다듬은 뒤 파싱)');
ok(/const time = _enNormTimeText\(/.test(readSrc), '보내기 전에 다듬는다(위 D-1 의 실행이 그 증거 · 이 줄은 «다시 옛 모양으로 조립하지 않는가» 짝)');
ok(!/const time = tr\.querySelector\('\.en-row-time'\)\?\.value \|\| '';/.test(readSrc), '⛔ 옛 모양(원문 그대로 보내기)으로 되돌아가지 않았다');

/* D-4. 미리보기를 실제 가짜 DOM 에 그려 본다 — 색은 background-color(글자색은 관리자 CSS 가 덮는다) */
function fakeTr(val) {
  const input = { value: val };
  const box = { textContent: '', style: {} };
  return { input, box, tr: { querySelector: s => (s === '.en-row-time' ? input : s === '.en-time-hint' ? box : null) } };
}
try {
  const doc = { documentElement: { lang: 'en' } };
  const paint = new Function('document', 'window', cNormSrc + '\n' + cHintSrc + '\n' + cPaintSrc + '\nreturn _enPaintTimeHint;')(doc, { adminLang: 'en' });
  let f = fakeTr('7:40'); paint(f.tr);
  ok(/7:40 AM \(07:40\)/.test(f.box.textContent) && /MORNING/.test(f.box.textContent) && /19:40 or 7:40 PM/.test(f.box.textContent) && f.box.style.backgroundColor === '#fef3c7',
    'EN «7:40» → «7:40 AM (07:40) ⚠ MORNING … 19:40 or 7:40 PM» 노란 바탕', f.box);
  f = fakeTr('7:40 PM'); paint(f.tr);
  ok(/→ 7:40 PM \(19:40\)/.test(f.box.textContent) && !/MORNING/.test(f.box.textContent) && f.box.style.backgroundColor === '#ecfdf5', 'EN «7:40 PM» → «7:40 PM (19:40)» 초록, 경고 없음', f.box);
  f = fakeTr(''); paint(f.tr);
  ok(f.box.style.display === 'none' && f.box.textContent === '', '빈 칸 → 미리보기를 감춘다');
  const paintKo = new Function('document', 'window', cNormSrc + '\n' + cHintSrc + '\n' + cPaintSrc + '\nreturn _enPaintTimeHint;')({ documentElement: { lang: 'ko' } }, {});
  f = fakeTr('Thu 7:40'); paintKo(f.tr);
  ok(/목 오전 7:40 \(07:40\)/.test(f.box.textContent) && /오전 수업입니다/.test(f.box.textContent) && /«19:40» 또는 «오후 7:40» 처럼/.test(f.box.textContent), 'KO «Thu 7:40» → «목 오전 7:40 (07:40) ⚠ 오전 수업입니다 … «19:40» 또는 «오후 7:40» 처럼»', f.box);
  f = fakeTr('nonsense'); paintKo(f.tr);
  ok(/읽지 못했습니다/.test(f.box.textContent) && f.box.style.backgroundColor === '#fee2e2', 'KO 못 읽는 값 → 빨간 바탕 «읽지 못했습니다»', f.box);
} catch (e) { ok(false, '_enPaintTimeHint 를 실제로 돌렸다: ' + e.message); }

console.log('\n════════ E. 수업 옮기기 창 — mvAp·mvHmFull·mvFlip 전수 ════════');
const mAp = fnAt(modal, 'function mvAp(hm)');
const mFull = fnAt(modal, 'function mvHmFull(hm)');
const mFlip = fnAt(modal, 'function mvFlip(fromHm, toHm)');
const mFlipLine = fnAt(modal, 'function mvFlipLine(fromHm, toHm)');
ok(!!mAp && !!mFull && !!mFlip && !!mFlipLine, '(전제) mvAp·mvHmFull·mvFlip·mvFlipLine 을 찾았다');
const mk = en => new Function('isEn', 'T', mAp + '\n' + mFull + '\n' + mFlip + '\n' + mFlipLine + '\nreturn { mvAp, mvHmFull, mvFlip, mvFlipLine };')(() => en, (k, e) => (en ? e : k));
try {
  const E = mk(true), K = mk(false);
  let eBad = [];
  for (let h = 0; h < 24; h++) for (let mi = 0; mi < 60; mi++) {
    const hm = pad2(h) + ':' + pad2(mi);
    const h12 = (h % 12) || 12;
    const wantE = h12 + ':' + pad2(mi) + ' ' + (h < 12 ? 'AM' : 'PM');
    const wantK = (h < 12 ? '오전 ' : '오후 ') + h12 + ':' + pad2(mi);
    if ((E.mvAp(hm) !== wantE || K.mvAp(hm) !== wantK || E.mvHmFull(hm) !== hm + ' (' + wantE + ')' || E.mvHmFull(h + ':' + pad2(mi)) !== hm + ' (' + wantE + ')') && eBad.length < 5)
      eBad.push({ hm, e: E.mvAp(hm), k: K.mvAp(hm), full: E.mvHmFull(hm) });
  }
  ok(eBad.length === 0, '1,440분 전수 — 오전/오후·12시간 표기·24시 앞 0 이 맞다(영어·한국어)', eBad);
  ok(E.mvAp('12:00') === '12:00 PM' && E.mvAp('00:00') === '12:00 AM', '정오 = 12:00 PM · 자정 = 12:00 AM');
  ok(E.mvAp('') === '' && E.mvAp('abc') === 'abc' && E.mvHmFull('25:00') === '25:00', '모르는 모양은 그대로 돌려준다(지어내지 않는다)');
  let flipBad = 0, flipTrue = 0;
  for (let a = 0; a < 1440; a++) for (let b = 0; b < 1440; b++) {
    const A = pad2(Math.floor(a / 60)) + ':' + pad2(a % 60), B = pad2(Math.floor(b / 60)) + ':' + pad2(b % 60);
    const want = (a % 60 === b % 60) && Math.abs(Math.floor(a / 60) - Math.floor(b / 60)) === 12;
    const got = E.mvFlip(A, B);
    if (got) flipTrue++;
    if (got !== want) flipBad++;
  }
  ok(flipBad === 0 && flipTrue === 1440, '1,440 × 1,440 = 2,073,600 쌍 전수 — «오전/오후만 바뀜» 판정이 정확히 같은 분·12시간 차이에만 참(' + flipTrue + '쌍)', { flipBad, flipTrue });
  ok(/7:40 AM → 7:40 PM/.test(E.mvFlipLine('07:40', '19:40')) && /오전 7:40 → 오후 7:40/.test(K.mvFlipLine('07:40', '19:40')), '경고 문장이 «7:40 AM → 7:40 PM» / «오전 7:40 → 오후 7:40» 를 말한다');
} catch (e) { ok(false, '창의 시각 함수를 실제로 돌렸다: ' + e.message); }

/* E-2. 창 배선 — 그 함수들을 «실제로 부르는» 자리(확인창·메모·시각 옆 표시). 문자열 검사는 «다시 24시만 쓰는가» 짝이다.
   ⚠️ 화면을 실제로 누르는 확인은 manual/move-modal-ampm-browser.mjs 에서 한다. */
const runFn = fnAt(modal, 'function mvRun(r, day)');
ok(/newDate \+ ' ' \+ mvHmFull\(newTime\)/.test(runFn) && !/newDate \+ ' ' \+ newTime \+/.test(runFn), '«이번 한 번 옮기기» 확인창이 새 시각을 오전/오후와 함께 말한다(24시만 쓰는 옛 모양 없음)');
ok(/mvFlip\(hhmm\(r\.start_ts\), newTime\)/.test(runFn) && /\+ flipLine/.test(runFn), '확인창이 «오전·오후만 바뀜» 을 짚는다');
const serFn = fnAt(modal, 'function mvRunSeries(r, day, reason, swapTo, curT)');
ok(/mvHmFull\(it\.to_time\)/.test(serFn) && /\+ sflip/.test(serFn), '«앞으로 계속» 확인창도 새 시각 오전/오후 + 뒤집힘 경고');
const syncFn = fnAt(modal, 'function mvSync(r, day)');
ok(/\$\('tc-mv-time12'\)/.test(syncFn) && /mvAp\(nt0\)/.test(syncFn), '시각 칸 옆에 «= 7:40 PM» 을 그린다(고를 때마다 mvSync)');
ok(/id="tc-mv-time12"/.test(modal), '그 표시 자리(#tc-mv-time12)가 창에 있다');

console.log('\n════════ E-3. 연기된 수업 창 — 서버가 거절하는 버튼을 «눌러 보게» 두지 않는다 ════════');
const openFn = fnAt(modal, 'function tcOpenMoveModal(r, opt)');
ok(/var pp = \(r\.postponed === true\);/.test(openFn), '연기된 줄을 r.postponed 로 가른다');
ok(/\(pp \? '<span id="tc-mv-series-off"[\s\S]*?: mvBtn\('series'/.test(openFn), '연기된 줄은 «🔄 앞으로 계속» 버튼 대신 «다시 잡은 뒤에» 안내(서버 schedule_postponed 와 같은 말)');
ok(/\(pp \? '' : mvSubBtn\('hold'/.test(openFn), '연기된 줄에 «완전히 연기» 를 또 두지 않는다(요청만 하나 더 쌓인다)');
ok(/mvSubBtn\('date', T\('지정한 날짜로 연기', 'Postpone to a date'\), pp\)/.test(openFn), '연기된 줄은 «지정한 날짜로 연기»(=다시 잡기)가 처음부터 눌려 있다');
const ldFn = fnAt(modal, 'function mvLoadTeachers(r)');
ok(/if \(r\.postponed === true\) \{ box\.innerHTML = ppMsg; return; \}/.test(ldFn), '연기된 줄은 강사 목록을 묻지 않고 사실대로 말한다(서버가 일부러 거절)');
ok(/res\.j\.error === 'schedule_postponed'/.test(ldFn), '깃발이 없는 화면에서 와도 서버의 schedule_postponed 를 같은 말로 받는다');

console.log('\n결과: PASS ' + pass + ' / FAIL ' + fail);
if (fail) { console.log('실패:'); fails.forEach(f => console.log('  · ' + f)); process.exit(1); }
