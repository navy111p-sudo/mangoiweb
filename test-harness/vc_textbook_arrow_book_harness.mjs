#!/usr/bin/env node
/* 📚 교재 화살표가 «지금 보는 책» 을 벗어나지 않는가 — js/idx-vc-mobilefix.js ⑮절
 * ═══════════════════════════════════════════════════════════════════════════
 * [왜 있나] 2026-09-04 사장님 중국어 수업(class-851) 「처음에 교사가 중국어 교재를 올릴 수
 *   없었고, 나중에 BTS 교재가 나타났다」. 뜬 것은 D1 에 실재하는 「BTS 1 007 (My classroom)」
 *   묶음의 한 장이었다. 화살표가 쓰는 목록(window._libSequence)은 «라이브러리를 한 번 연 흔적»
 *   인데 수업을 다시 들어가도, 강사가 다른 교재를 공유해도 지워지지 않고, pdfPrevPage/
 *   pdfNextPage 는 그 목록이 지금 보는 책의 것인지 확인하지 않는다.
 *
 * [왜 문자열 검사로는 안 되나] 함수도 값도 다 «있다». 틀린 것은 «무슨 책이 열리는가» 뿐이라
 *   수리 전에도 회귀 하니스가 전부 초록이었다. 그래서 여기서는 그 절을 소스에서 오려 내
 *   **가짜 window 로 실제로 돌려** 무엇이 열리는지 본다.
 *
 * ⚠️ 「막는다」 만 검사하면 «전부 막기» 도 통과한다 — «맞는 목록일 때는 예전 그대로 넘어간다»
 *    를 반드시 짝으로 둔다.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'cloudflare-deploy/public/js/idx-vc-mobilefix.js');
const src = readFileSync(SRC, 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
};

/* 소스에서 «중괄호 짝» 으로 블록을 오려 낸다 — 길이로 자르면 옆 절이 딸려 온다(CLAUDE.md). */
/* ⚠️ 앵커는 «그 절 안에만 있는 코드» 로 잡는다 — 절 제목으로 잡으면 파일 상단 목차가
      먼저 걸려 파일 전체 IIFE 를 오려 내게 된다(실제로 한 번 밟았다). */
function sliceIife(anchor) {
  const at = src.indexOf(anchor);
  if (at < 0) return null;
  const start = src.lastIndexOf('(function () {', at);
  if (start < 0) return null;
  let depth = 0, i = src.indexOf('{', start);
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(start, i + 1) + ')()';   // 「(function(){ … }」 + 「)()」
}
function sliceFn(name) {
  const at = src.indexOf('function ' + name + '(');
  if (at < 0) return null;
  let depth = 0, i = src.indexOf('{', at);
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(at, i + 1);
}

console.log('\n📚 교재 화살표 책맞춤 (idx-vc-mobilefix ⑮)\n');

// ── A. 정본이 한 곳인가 ────────────────────────────────────────────────
console.log('A. 판정 정본');
const bookOfSrc = sliceFn('tbBookOf');
ok('tbBookOf 가 파일 상단에 하나 있다', !!bookOfSrc);
ok('⑬절이 그 정본을 쓴다(자기 복제 없음)',
  /var bookOf = tbBookOf;/.test(src) && (src.match(/function tbBookOf\(/g) || []).length === 1);

const arrowSrc = sliceIife('function seqBook()');
ok('⑮절 블록을 오려 냈다', !!arrowSrc);
if (!arrowSrc || !bookOfSrc) { console.log('\n❌ 소스를 못 읽어 검사를 계속할 수 없습니다'); process.exit(1); }

// ── B. 실제로 돌려 본다 ────────────────────────────────────────────────
console.log('\nB. 가짜 window 로 실제 실행');

function run(scenario) {
  const win = {
    _libSequence: scenario.seq,
    _libSeqIdx: scenario.idx || 0,
    _vcCurrentPdfUrl: scenario.curUrl || '',
    _vcShownPdfUrl: '',
    _vcShownPdfName: scenario.curName || '',
    devicePixelRatio: 1,
  };
  const calls = [];
  const toasts = [];
  win.pdfPrevPage = function () { calls.push('prev'); };
  win.pdfNextPage = function () { calls.push('next'); };

  const sandbox = {
    window: win,
    navigator: { language: 'ko-KR', languages: ['ko-KR'] },
    console: { log() {} },
    toast: (m) => toasts.push(String(m)),
    zhLine: (m) => m,
  };
  const body = `
    ${bookOfSrc}
    ${arrowSrc};
    return { call: (fn) => window[fn](), calls, toasts, win: window };
  `;
  // eslint-disable-next-line no-new-func
  const fn = new Function('window', 'navigator', 'console', 'toast', 'zhLine', 'calls', 'toasts', body);
  return fn(win, sandbox.navigator, sandbox.console, sandbox.toast, sandbox.zhLine, calls, toasts);
}

const CN = '[다락원 중국어 마스터 3] 미분류 레슨 / 22.jpg';
const BTS = (n) => `[BTS 1 007 (My classroom)] 미분류 레슨 / Slide${n}.JPG`;
const btsSeq = [1, 2, 3].map((n) => ({ id: 'srv_' + n, url: '/api/textbook-files/' + n + '/raw', kind: 'image', name: BTS(n) }));
const cnSeq = [10, 11, 12].map((n) => ({ id: 'srv_' + n, url: '/api/textbook-files/' + n + '/raw', kind: 'image', name: `[다락원 중국어 마스터 3] 미분류 레슨 / ${n}.jpg` }));

// B-1 사고 재현: 교재가 하나도 없는데 옛 BTS 목록이 남아 있다
{
  const r = run({ seq: btsSeq.slice(), idx: 0, curUrl: '', curName: '' });
  r.call('pdfNextPage');
  ok('교재가 없으면 옛 목록으로 파일을 열지 않는다', r.calls.length === 0, '원본이 ' + r.calls.length + '회 불렸다');
  ok('그때 옛 목록을 버린다', !r.win._libSequence.length);
  ok('사람에게 이유를 말한다', r.toasts.length === 1 && /교재/.test(r.toasts[0]), JSON.stringify(r.toasts));
}

// B-2 사고 재현: 중국어를 보는 중인데 목록은 BTS
{
  const r = run({ seq: btsSeq.slice(), idx: 0, curUrl: '/api/textbook-files/99/raw', curName: CN });
  r.call('pdfNextPage');
  ok('보는 책과 목록의 책이 다르면 목록을 버린다', !r.win._libSequence.length);
  ok('그래도 원본은 부른다(서버에서 이 책으로 다시 만들게)', r.calls.length === 1);
}

// B-3 ⚠️ 짝 검사 — 맞는 목록일 때는 예전 그대로여야 한다
{
  const r = run({ seq: cnSeq.slice(), idx: 1, curUrl: '/api/textbook-files/11/raw', curName: cnSeq[1].name });
  r.call('pdfNextPage');
  ok('같은 책 목록은 건드리지 않는다', r.win._libSequence.length === 3 && r.win._libSeqIdx === 1);
  ok('그때 원본이 정상 호출된다', r.calls.length === 1 && r.calls[0] === 'next');
}

// B-4 ⚠️ 이름을 못 뽑는 목록(내 PC 에서 올린 파일)은 건드리지 않는다
{
  const upSeq = [{ id: 'up_1', url: '/api/video-call/pdf/x1', kind: 'image', name: 'IMG_2011.webp' }];
  const r = run({ seq: upSeq.slice(), idx: 0, curUrl: '/api/video-call/pdf/x1', curName: 'IMG_2011.webp' });
  r.call('pdfPrevPage');
  ok('책 이름을 모르면 목록을 그대로 둔다', r.win._libSequence.length === 1);
  ok('그때도 원본은 정상 호출된다', r.calls.length === 1 && r.calls[0] === 'prev');
}

// B-5 두 함수 모두 감싸져 있다
{
  const r = run({ seq: btsSeq.slice(), idx: 0, curUrl: '', curName: '' });
  r.call('pdfPrevPage');
  ok('◀(이전)도 같은 보호를 받는다', r.calls.length === 0);
}

// ── C. 책 이름 뽑기 규칙 (정본을 실제로 돌린다) ─────────────────────────
console.log('\nC. 교재명 판정');
{
  const f = new Function(bookOfSrc + '; return tbBookOf;')();
  ok('「[교재] 레슨 / 파일」에서 교재명을 뽑는다', f(CN) === '다락원 중국어 마스터 3');
  ok('슬래시가 없으면 교재로 보지 않는다(「[중요] 공지.pdf」)', f('[중요] 공지.pdf') === '');
  ok('빈 값·내 PC 파일 이름은 빈 문자열', f('') === '' && f('IMG_1.jpg') === '');
}

console.log(`\n${fail ? '❌' : '✅'} PASS ${pass} / FAIL ${fail}\n`);
process.exit(fail ? 1 : 0);
