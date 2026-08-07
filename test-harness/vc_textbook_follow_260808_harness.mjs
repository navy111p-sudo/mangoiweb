// -*- coding: utf-8 -*-
// 📖 「교사가 교재를 열었는데 학생은 교재 버튼을 눌러야 보인다」 하네스 (마이마이 ⑤, 2026-08-08)
//   실행: node test-harness/vc_textbook_follow_260808_harness.mjs
//
//   마이마이 원문: "처음에 입장하면 화면만 나오는데 거기서 교사가 교재를 열었는데 학생이 몰랐다.
//                   학생이 교재를 누르지 않으면 교재가 보이지 않는다."
//
//   [원인] vcApplySharedPdf 의 탭 전환이 함수 **아래쪽**에 있어서, 위의 두 조기반환
//          ①「이미 같은 교재/페이지」 ②「같은 교재, 페이지만 다름」 에 걸리면 통째로 건너뛰어졌다.
//          학생은 입장 시 폴링(pdfState)이 이미 그 교재를 받아 키를 세워 두는 일이 많아,
//          정작 교사가 교재를 열면 «이미 갖고 있다» 며 화면이 그대로였다.
//
//   ⚠️ 글자 매칭이 아니라 index.html 에서 그 함수를 떼어내 **가짜 브라우저에서 실제로 실행**한다.
//      🔴 ctx.window = ctx 로 자기참조를 걸지 않으면 맨 이름이 ReferenceError 로 죽고
//         try/catch 에 먹혀 «아무 일도 안 했는데 통과» 한다. (블랙아웃 하네스에서 실제로 겪음)
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dir = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(__dir, '../cloudflare-deploy/public/index.html'), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond, extra) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${!cond && extra !== undefined ? '  → ' + JSON.stringify(extra) : ''}`);
}

const START = 'window.vcApplySharedPdf = function(';
const i0 = html.indexOf(START);
if (i0 < 0) { console.log('❌ vcApplySharedPdf 를 찾지 못했습니다'); process.exit(1); }
const END = '\n};\nwindow.vcStartPdfPoll';
const i1 = html.indexOf(END, i0);
if (i1 < 0) { console.log('❌ 함수 끝을 찾지 못했습니다'); process.exit(1); }
const SRC = html.slice(i0, i1 + 3);

const URL_A = 'https://x/api/textbook-files/1.jpg';

/** 가짜 브라우저에서 vcApplySharedPdf 를 돌린다. tabs = 전환된 탭 기록. */
function makeCtx(pre = {}) {
  const tabs = [], toasts = [], loaded = [];
  const ctx = {
    console, Promise,
    location: { origin: 'https://x' },
    vcSwitchTab: (t) => tabs.push(t),
    showToast: (m) => toasts.push(m),
    pdfLoad: (u, k) => { loaded.push({ u, k }); return Promise.resolve(); },
    pdfGoToPage: () => {},
    pdfRender: () => {},
    pdfSyncSeqIdx: () => {},
    pdfPageNum: 1,
    pdfCurrentId: null,
  };
  ctx.window = ctx;                       // ← 브라우저와 같게: window.x 와 x 가 한 몸
  Object.assign(ctx, pre);                // _vcShownPdfKey / _vcShownPdfUrl 등 사전 상태
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return { ctx, tabs, toasts, loaded, apply: (...a) => ctx.vcApplySharedPdf(...a) };
}

console.log('\n[ 🔴 교사가 «지금» 교재를 열면 학생 화면이 교재로 간다 ]');
{
  // 학생이 입장할 때 폴링이 이미 같은 교재를 받아 둔 상태 — 이게 실제 운영에서 흔한 경우다
  const s = makeCtx({ _vcShownPdfKey: URL_A + '|1', _vcShownPdfUrl: URL_A });
  s.apply(URL_A, 'image', 1, 'p1', '교재A', true);      // ← 교사 pdf-share
  check('🔴 이미 같은 교재를 들고 있어도 교재 탭으로 데려간다', s.tabs.includes('pdf'), { tabs: s.tabs });
  check('학생에게 «선생님이 교재를 열었어요» 를 알린다', s.toasts.some((t) => /선생님이 교재를 열었/.test(t)), s.toasts);
  check('PDF 를 다시 로드하지는 않는다 (깜빡임 방지 가드는 그대로)', s.loaded.length === 0, s.loaded);
}
{
  // 같은 교재인데 페이지만 다른 경우 — 두 번째 조기반환 경로
  const s = makeCtx({ _vcShownPdfKey: URL_A + '|1', _vcShownPdfUrl: URL_A });
  s.apply(URL_A, 'image', 5, 'p1', '교재A', true);
  check('🔴 페이지만 바뀐 신호에서도 교재 탭으로 데려간다', s.tabs.includes('pdf'), { tabs: s.tabs });
}
{
  // 처음 받는 교재 — 원래도 되던 경로가 안 깨졌는지
  const s = makeCtx({});
  s.apply(URL_A, 'image', 1, 'p1', '교재A', true);
  check('처음 받는 교재는 실제로 로드된다', s.loaded.length === 1, s.loaded);
  check('그때도 교재 탭으로 간다', s.tabs.includes('pdf'));
}

console.log('\n[ 🛡 폴링(주기 복원)은 학생을 끌고 가면 안 된다 ]');
{
  // 학생이 칠판/게임을 보는 중에 3초 폴링이 교재로 끌어가면 수업이 안 된다
  const s = makeCtx({ _vcShownPdfKey: URL_A + '|1', _vcShownPdfUrl: URL_A });
  s.apply(URL_A, 'image', 1, 'p1', '교재A');            // ← 마지막 인자 없음 = 폴링
  check('🔴 폴링은 탭을 바꾸지 않는다 (학생이 보던 화면을 뺏지 않는다)', !s.tabs.includes('pdf'), { tabs: s.tabs });
  check('폴링은 토스트도 띄우지 않는다', !s.toasts.some((t) => /선생님이 교재를 열었/.test(t)), s.toasts);
}
{
  // 폴링이라도 «처음 받는» 교재면 예전처럼 로드+표시해야 한다 (입장 직후 복원 경로)
  const s = makeCtx({});
  s.apply(URL_A, 'image', 1, 'p1', '교재A');
  check('폴링이라도 처음 받는 교재는 로드해 보여준다 (입장 직후 복원)',
    s.loaded.length === 1 && s.tabs.includes('pdf'), { loaded: s.loaded, tabs: s.tabs });
}

console.log('\n[ 🧷 곁가지 ]');
check('blob 교재는 여전히 거른다 (다른 기기에서 못 연다)', (() => {
  const s = makeCtx({});
  s.apply('blob:abc', 'image', 1, 'p1', 'x', true);
  return s.tabs.length === 0 && s.loaded.length === 0;
})());
check('호출부가 pdf-share 에서 «교사 신호» 로 표시해 부른다',
  /vcApplySharedPdf\(sUrl, msg\.data\.kind, msg\.data\.currentPage, sPid, msg\.data\.name, true\)/.test(html));
check('폴링 호출부는 그 표시를 하지 않는다',
  /vcApplySharedPdf\(d\.pdfState\.url,[^)]*d\.pdfState\.name\)/.test(html));

console.log('\n[ 🧪 하네스가 진짜로 돌고 있는가 — 헛통과 방지 ]');
check('가짜 브라우저에서 함수가 실제로 실행된다 (안 돌면 위 검사 전부 무의미)', (() => {
  const s = makeCtx({});
  s.apply(URL_A, 'image', 1, 'p1', 'x', true);
  return s.tabs.length > 0 && s.loaded.length > 0;
})());

console.log('\n─────────────────────────────────────────────');
console.log(`  통과 ${PASS} · 실패 ${FAIL}`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach((f) => console.log('   · ' + f)); }
console.log('─────────────────────────────────────────────\n');
process.exit(FAIL ? 1 : 0);
