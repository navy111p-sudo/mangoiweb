// -*- coding: utf-8 -*-
// 🗂️ «동시 열람» 형제 sub-item 이 새로 생겨도 data-keep-open 을 빠뜨리지 않는지 감시 (2026-09-21)
//   실행: node test-harness/sub_item_keep_open_harness.mjs
//
//   배경(CLAUDE.md 2장 「메뉴 하나당 하나만」 항목) —
//     adm-r25.js 의 reveal() 은 사이드바 손자를 눌러 <details class="sub-item"> 를 열 때,
//     «같은 부모 밑의 다른 형제 sub-item」을 자동으로 닫는다. 이건 등록 폼/엑셀 일괄 등록처럼
//     둘 중 하나만 보여야 하는 쌍에는 맞는 동작이지만, 회계의 「배정 못 한 결제/B2B/지출분류」
//     3형제(acc-payer-box·acc-b2b-box·acc-payee-box)처럼 «동시에 열어 두고 봐야» 하는 형제는
//     이 자동닫기 때문에 하나를 열면 나머지 둘이 닫혀 버렸다(2026-09-18 trap-check 실측).
//     고침은 그 셋에 data-keep-open 속성을 달고 reveal() 이 그 속성을 건너뛰게 한 것이다.
//
//   이 안전장치는 «opt-in» 이다 — 누군가 새로 «동시 열람이 필요한 형제 sub-item 쌍/트리오» 를
//   만들면서 data-keep-open 을 빠뜨리면 같은 사고가 조용히 재발한다. 에러가 안 나고 화면도
//   «닫힌다» 는 정상 동작처럼 보이므로 아무도 모른다. 그래서 이 하니스가 «구조로» 못 박는다.
//
//   무엇을 지키나 —
//     ① admin.html 을 실제로 태그 깊이를 세어 파싱해서(단순 grep 아님 — <details> 가 서로
//        중첩되는 문서라 grep 은 «누구의 형제인가» 를 모른다) 같은 부모 밑에 <details
//        class="…sub-item…"> 가 «2개 이상, 그리고 그중 2개 이상이 open 속성」 인 그룹을 찾는다.
//        그런 그룹은 «형제를 동시에 열어 두려는 의도」가 명백하므로, open 인 형제 전원이
//        data-keep-open 도 갖고 있어야 한다 — 하나라도 빠지면 사이드바로 그 형제를 열 때
//        나머지가 닫힌다(그 의도가 깨진다).
//     ② adm-r25.js 의 reveal() 안 형제 자동닫기 조건을 «소스에서 오려 내» 가짜 DOM 으로
//        실제로 돌려, data-keep-open 이 있는 형제는 살아남고 없는 형제는 닫히는지 확인한다
//        (문자열로 「그 속성 이름이 있는가」만 보면 조건을 `&&` → `||` 로 바꾸거나 통째로
//        지워도 «이름은 파일에 남아 있어» 속아 넘어간다 — CLAUDE.md 2장 반복 경고).
//     ③ ②의 검사에는 반드시 «막는다» 와 «막지 않으면 그대로 닫힌다」(즉 이 안전장치가 실제로
//        무언가를 바꾸고 있다)를 짝으로 둔다 — 짝이 없으면 «형제를 아무것도 안 닫는» 변이도
//        통과한다.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const rd = (p) => { try { return readFileSync(resolve(__dir, p), 'utf8'); } catch { return ''; } };

const html = rd('../cloudflare-deploy/public/admin.html');
const r25 = rd('../cloudflare-deploy/public/js/adm-r25.js');

let PASS = 0, FAIL = 0; const FAILS = [];
const check = (name, cond) => {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
};

console.log('\n════════ 「동시 열람」 형제 sub-item — data-keep-open 감시 ════════');

check('admin.html 을 읽었다', html.length > 0);
check('adm-r25.js 를 읽었다', r25.length > 0);

/* ─── ① admin.html 을 실제로 태그 깊이를 세어 파싱한다 ────────────────────
   grep 으로 <details class="sub-item"> 를 다 뽑아도 «누가 누구의 형제인가»는
   알 수 없다(중첩 깊이가 문서 전체에서 제각각이다). 그래서 일반 태그 스택을
   직접 굴려 각 <details> 의 «바로 위 부모 요소»를 구하고, 같은 부모를 공유하는
   <details class="…sub-item…"> 를 그룹으로 묶는다.
   ⚠️ <script>·<style>·주석(<!-- -->) 안의 «태그처럼 보이는 글자」에 속으면 안 되므로
      먼저 걷어낸다(길이를 그대로 유지 — 같은 공백으로 치환해 인덱스가 안 밀리게). */
function stripNonMarkup(src) {
  return src
    .replace(/<!--[\s\S]*?-->/g, (m) => ' '.repeat(m.length))
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (m) => ' '.repeat(m.length))
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, (m) => ' '.repeat(m.length));
}

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

// 각 요소: { tag, attrs, start, parentStart } — parentStart 는 «이 요소를 열 때 스택 맨 위였던 요소의 start」
function parseElements(src) {
  const clean = stripNonMarkup(src);
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)>/g;
  const stack = []; // { tag, start }
  const elements = [];
  let m;
  while ((m = tagRe.exec(clean))) {
    const closing = !!m[1];
    const tag = m[2].toLowerCase();
    const rawAttrs = m[3] || '';
    const selfClosed = /\/\s*$/.test(rawAttrs);
    if (closing) {
      // 스택에서 위에서부터 같은 태그를 찾아 그 위까지 통째로 pop (경미한 기형 HTML 도 버틴다)
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === tag) { stack.length = i; break; }
      }
      continue;
    }
    const parentStart = stack.length ? stack[stack.length - 1].start : -1;
    elements.push({ tag, attrs: rawAttrs, start: m.index, parentStart });
    if (!VOID_TAGS.has(tag) && !selfClosed) stack.push({ tag, start: m.index });
  }
  return elements;
}

const elements = parseElements(html);
check(`문서를 파싱해 태그를 찾았다 (${elements.length}개)`, elements.length > 1000);

const subItemDetails = elements.filter((e) => e.tag === 'details' && /\bclass\s*=\s*"[^"]*\bsub-item\b[^"]*"/.test(e.attrs));
check(`class="…sub-item…" <details> 를 찾았다 (${subItemDetails.length}개)`, subItemDetails.length > 0);
// grep 카운트와 대조 — 파서가 헛돌면 여기서 크게 어긋난다
const grepCount = (html.match(/class="sub-item"/g) || []).length;
check(`파서가 찾은 개수가 grep 대조와 맞다 (파서 ${subItemDetails.length} · grep(정확히 class="sub-item") ${grepCount} — 파서는 다중클래스도 잡으므로 ≥)`,
  subItemDetails.length >= grepCount);

// 같은 parentStart 로 그룹핑
const groups = new Map();
for (const el of subItemDetails) {
  const key = el.parentStart;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(el);
}

const riskyGroups = [];
for (const [, siblings] of groups) {
  if (siblings.length < 2) continue;
  const openOnes = siblings.filter((e) => /(^|\s)open(\s|=|>|$)/.test(e.attrs));
  if (openOnes.length < 2) continue; // 열려 있는 형제가 하나뿐이면 서로 닫힐 상대가 없다 — 무해
  riskyGroups.push({ siblings, openOnes });
}

console.log(`\n[ ① «동시에 열려 있어야 하는» 형제 그룹 — data-keep-open 누락 검사 ]`);
check(`현재 코드베이스의 위험 그룹 수가 알려진 것과 같다 (found ${riskyGroups.length}, expected 1 — 회계 3형제 하나)`,
  riskyGroups.length === 1);

let allOk = true;
for (const g of riskyGroups) {
  const idsOf = (arr) => arr.map((e) => (e.attrs.match(/\bid\s*=\s*"([^"]+)"/) || [, '(no id)'])[1]);
  const missing = g.openOnes.filter((e) => !/\bdata-keep-open\b/.test(e.attrs));
  const ok = missing.length === 0;
  if (!ok) allOk = false;
  check(
    `그룹 [${idsOf(g.siblings).join(', ')}] — open 형제 ${g.openOnes.length}개 전부 data-keep-open 을 갖고 있다` +
      (ok ? '' : ` — 빠진 것: ${idsOf(missing).join(', ')}`),
    ok,
  );
}
if (riskyGroups.length === 0) {
  check('(위험 그룹이 0개면 이 절은 걸릴 것이 없다 — ①의 개수 검사가 그 사실을 대신 지킨다)', true);
}

/* ─── ② reveal() 의 형제 자동닫기 조건을 오려 내 실제로 돌린다 ─────────────
   문자열로 «data-keep-open 이라는 글자가 있는가» 만 보면, 조건을 `&&` → `||` 로
   바꾸거나(늘 통과) 조건 자체를 지워도 그 이름이 다른 줄(주석 등)에 남아 있으면
   속아 넘어간다. 그래서 조건식을 실제로 실행해 «막는다» 와 «막지 않으면 그대로
   닫힌다」를 짝으로 확인한다. */
console.log('\n[ ② reveal() 의 형제 자동닫기 — 조건을 실제로 돌려 확인 ]');

const revealBody = (() => {
  const i = r25.indexOf('function reveal(card, target){');
  if (i < 0) return '';
  let depth = 0, start = -1;
  for (let p = i; p < r25.length; p++) {
    if (r25[p] === '{') { if (depth === 0) start = p; depth++; }
    else if (r25[p] === '}') { depth--; if (depth === 0) return r25.slice(start, p + 1); }
  }
  return '';
})();
check('reveal() 함수 몸통을 중괄호 짝으로 오려 냈다', revealBody.length > 200);

const forEachBlock = (() => {
  const i = revealBody.indexOf('[].forEach.call(par.children, function(x){');
  if (i < 0) return '';
  let depth = 0, start = -1;
  for (let p = i; p < revealBody.length; p++) {
    if (revealBody[p] === '{') { if (depth === 0) start = p; depth++; }
    else if (revealBody[p] === '}') { depth--; if (depth === 0) return revealBody.slice(start, p + 1); }
  }
  return '';
})();
check('형제를 훑는 forEach 콜백 몸통을 오려 냈다', forEachBlock.length > 20 && forEachBlock.includes('x.open'));

function makeFakeSibling(id, { subItem = true, keepOpen = false, open = true } = {}) {
  const classes = subItem ? ['sub-item'] : [];
  return {
    id,
    tagName: 'DETAILS',
    open,
    classList: { contains: (c) => classes.includes(c) },
    hasAttribute: (a) => (a === 'data-keep-open' ? keepOpen : false),
  };
}

function runForEachOn(target, siblings) {
  // par.children 을 흉내내는 가짜 배열에 실제로 [].forEach.call 을 그대로 태워 돌린다.
  const fn = new Function('target', `
    return function(x){
      ${forEachBlock.replace(/^\s*\[\]\.forEach\.call\(par\.children,\s*function\(x\)\{/, '').replace(/\}\);\s*$/, '')}
    };
  `)(target);
  siblings.forEach((s) => fn(s));
}

{
  const target = makeFakeSibling('acc-payer-box', { keepOpen: true, open: true });
  const kept1 = makeFakeSibling('acc-b2b-box', { keepOpen: true, open: true });
  const kept2 = makeFakeSibling('acc-payee-box', { keepOpen: true, open: true });
  const others = [target, kept1, kept2];
  runForEachOn(target, others);
  check('data-keep-open 이 있는 형제는 열린 채 남는다 (acc-b2b-box·acc-payee-box)', kept1.open === true && kept2.open === true);
}

{
  // 짝: keep-open 이 없는 «보통» 형제는 여전히 닫혀야 한다(이 안전장치가 다른 곳까지 무력화하면 안 됨)
  const target = makeFakeSibling('ct-form-wrap', { keepOpen: false, open: true });
  const plainSibling = makeFakeSibling('ct-bulk-wrap', { keepOpen: false, open: true });
  const others = [target, plainSibling];
  runForEachOn(target, others);
  check('data-keep-open 이 없는 «보통» 형제 sub-item 은 그대로 닫힌다(등록 vs 엑셀 일괄 등록 같은 쌍의 원래 동작이 안 깨졌다)', plainSibling.open === false);
}

{
  // 짝의 짝: sub-item 이 아닌 형제(예: 검색·목록 div)는 원래부터 이 로직이 안 건드린다
  const target = makeFakeSibling('acc-payer-box', { keepOpen: true, open: true });
  const notSubItem = { id: 'plain-div', tagName: 'DIV', open: undefined, classList: { contains: () => false }, hasAttribute: () => false };
  runForEachOn(target, [target, notSubItem]);
  check('<details> 도 아니고 sub-item 도 아닌 형제는 이 로직의 대상이 아니다(그대로 무관)', notSubItem.open === undefined);
}

console.log(`\n─────────────────────────────────────────────`);
console.log(`  통과 ${PASS} · 실패 ${FAIL}`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach((f) => console.log('   · ' + f)); }
console.log(`─────────────────────────────────────────────\n`);
process.exit(FAIL ? 1 : 0);
