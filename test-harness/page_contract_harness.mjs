// page_contract_harness.mjs — 「버튼이 부르는 함수가 실제로 있는가」 (2026-08-09)
//
// 왜 필요한가
//   index.html 33,458줄 / admin.html 11,682줄 을 파일로 쪼개려 한다.
//   그런데 쪼개는 순간 «안 깨졌다» 를 증명할 수단이 없다 —
//   기존 하니스는 대부분 특정 기능의 소스를 문자열로 확인하는 방식이라
//   코드가 다른 파일로 옮겨가면 전부 의미를 잃는다.
//
//   분해에서 실제로 깨지는 것은 거의 항상 하나다:
//     **버튼의 onclick 이 부르는 함수가 옮기는 과정에서 사라지거나 스코프 밖으로 나가는 것.**
//   외부 파일(classic script)은 전역 스코프를 공유하므로 «정의가 어딘가에 있으면» 동작한다.
//   그래서 「인라인 핸들러가 부르는 이름」 ↔ 「그 페이지가 로드하는 모든 스크립트의 전역 정의」
//   를 대조하면, 분해가 배선을 끊었는지 정적으로 잡을 수 있다.
//
// ⚠️ puppeteer 를 쓰지 않는다 — run.mjs --fast(배포 게이트)가 puppeteer 하니스를 제외하기
//    때문이다. 게이트에서 안 돌면 게이트가 아니다.
//
// 기존에 이미 끊어져 있는 것은 목록으로 인정하고 **새로 끊기는 것만** 막는다.
// 목록 갱신:  node test-harness/page_contract_harness.mjs --update

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const PUB = join(__dir, '../cloudflare-deploy/public');
const SNAP = join(__dir, 'page-contract-known.json');
const UPDATE = process.argv.includes('--update');

const PAGES = ['index.html', 'admin.html', 'teacher.html', 'student-games.html', 'student.html'];

// 브라우저가 기본으로 주는 것 + JS 키워드. 여기 없으면 «정의 없음» 으로 잡힌다.
// ⚠️ 이 목록이 부실하면 가짜 경보가 나고, 가짜가 섞이면 게이트를 아무도 안 믿는다.
const BUILTINS = new Set([
  // 함수처럼 보이는 JS 키워드 — `(async()=>{…})()` 의 async, `await(…)` 등
  'async', 'await', 'function', 'return', 'typeof', 'void', 'new', 'delete', 'in', 'of',
  'if', 'else', 'for', 'while', 'do', 'switch', 'try', 'catch', 'finally', 'throw', 'yield',
  // 전역 함수·생성자
  'alert', 'confirm', 'prompt', 'open', 'close', 'print', 'focus', 'blur', 'scrollTo', 'scrollBy',
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'fetch', 'requestAnimationFrame',
  'cancelAnimationFrame', 'postMessage', 'queueMicrotask', 'structuredClone', 'btoa', 'atob',
  'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI', 'parseInt', 'parseFloat',
  'isNaN', 'isFinite', 'String', 'Number', 'Boolean', 'Array', 'Object', 'JSON', 'Math', 'Date',
  'RegExp', 'Promise', 'Error', 'Symbol', 'BigInt', 'Set', 'Map', 'WeakMap', 'WeakSet', 'Proxy',
  'Intl', 'console', 'Blob', 'File', 'FileReader', 'FormData', 'URL', 'URLSearchParams',
  'ClipboardItem', 'Image', 'Audio', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent',
  'Response', 'Request', 'Headers', 'AbortController', 'IntersectionObserver', 'MutationObserver',
  'ResizeObserver', 'Notification', 'Worker', 'WebSocket', 'AudioContext', 'MediaRecorder',
  // 흔히 쓰는 전역 객체
  'event', 'this', 'window', 'document', 'location', 'history', 'navigator', 'localStorage',
  'sessionStorage', 'performance', 'screen', 'top', 'parent', 'self', 'globalThis',
]);

// 핸들러 문자열 안에 CSS 가 섞여 있는 경우가 많다:
//   this.style.background='linear-gradient(135deg,…)'  →  gradient() 를 «함수 호출» 로 오인한다.
// 그래서 «작은따옴표·백틱 문자열» 을 먼저 지운 뒤에 호출을 찾는다.
// (속성은 큰따옴표로 감싸이므로 안쪽 문자열은 항상 작은따옴표나 백틱이다)
function stripInnerStrings(code) {
  return String(code).replace(/'(?:\\.|[^'\\])*'/g, "''").replace(/`(?:\\.|[^`\\])*`/g, '``');
}

/** 페이지가 로드하는 스크립트 본문 전부(인라인 + 외부 js) */
function scriptCorpusOf(page) {
  const html = readFileSync(join(PUB, page), 'utf8');
  let corpus = '';
  // 인라인 <script> 본문
  for (const m of html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) corpus += '\n' + m[1];
  // 외부 스크립트 — 실제로 존재하는 파일만
  for (const m of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/g)) {
    const src = m[1].split('?')[0];
    if (/^https?:/.test(src)) continue;                 // CDN 은 대조 대상 밖
    const p = join(PUB, src);
    if (existsSync(p)) corpus += '\n' + readFileSync(p, 'utf8');
  }
  return { html, corpus };
}

/** 전역에 노출되는 이름들 */
function globalsOf(corpus) {
  const g = new Set();
  for (const m of corpus.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)) g.add(m[1]);
  for (const m of corpus.matchAll(/\bwindow\.([A-Za-z_$][\w$]*)\s*=(?![=>])/g)) g.add(m[1]);
  for (const m of corpus.matchAll(/\b(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function|\()/g)) g.add(m[1]);
  for (const m of corpus.matchAll(/\bwindow\[['"]([^'"]+)['"]\]\s*=(?![=])/g)) g.add(m[1]);
  return g;
}

/** 인라인 핸들러가 «부르는» 최상위 이름들
 *
 *  ⚠️ HTML 만 보면 안 된다. 이 저장소는 JS 가 문자열로 HTML 을 만들어 넣는 곳이 많고,
 *     그 문자열 안에도 onclick="…" 이 들어 있다. 그리고 그런 코드는 «분해» 로 .js 파일로 옮겨간다.
 *     실제로 밟았다 — index.html 의 큰 블록을 idx-main.js 로 옮겼더니
 *     검사 대상이 159종 → 141종으로 **줄었다**. 쪼갤수록 게이트가 약해지는 구조였다.
 *     그래서 HTML 과 «그 페이지가 로드하는 스크립트 본문» 을 모두 훑는다. */
function calledNamesOf(html, corpus) {
  const calls = new Map();   // 이름 → 첫 등장 줄
  const lines = (html + '\n/*── 아래는 이 페이지가 로드하는 스크립트 본문 ──*/\n' + corpus).split('\n');
  const ATTR = /\bon(?:click|change|input|submit|load|error|focus|blur|keyup|keydown|keypress|mouseenter|mouseleave|touchstart|touchend)\s*=\s*"([^"]*)"/g;
  for (let i = 0; i < lines.length; i++) {
    ATTR.lastIndex = 0;
    let a;
    while ((a = ATTR.exec(lines[i]))) {
      const code = stripInnerStrings(a[1]);
      // `window.foo && foo()` 처럼 «있으면 부른다» 로 스스로 방어한 호출은 끊긴 게 아니다.
      const guarded = new Set([...code.matchAll(/window\.([A-Za-z_$][\w$]*)\s*&&/g)].map(g => g[1]));
      // `foo(` 형태의 호출만. 메서드 호출(x.foo()) 은 대상 밖.
      for (const c of code.matchAll(/(?:^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) {
        const name = c[1];
        if (BUILTINS.has(name) || guarded.has(name)) continue;
        if (!calls.has(name)) calls.set(name, i + 1);
      }
    }
  }
  return calls;
}

const broken = [];
const summary = [];
for (const page of PAGES) {
  if (!existsSync(join(PUB, page))) continue;
  const { html, corpus } = scriptCorpusOf(page);
  const globals = globalsOf(corpus);
  const calls = calledNamesOf(html, corpus);
  let bad = 0;
  for (const [name, line] of calls) {
    if (globals.has(name)) continue;
    broken.push({ page, name, line, key: `${page}|${name}` });
    bad++;
  }
  summary.push(`${page.padEnd(20)} 핸들러가 부르는 함수 ${String(calls.size).padStart(3)}종 · 정의 ${String(globals.size).padStart(4)}종 · 미정의 ${bad}`);
}

summary.forEach(s => console.log(s));

if (UPDATE) {
  writeFileSync(SNAP, JSON.stringify({ known: [...new Set(broken.map(b => b.key))].sort() }, null, 2) + '\n');
  console.log(`\n📌 기존에 끊어져 있는 것 ${new Set(broken.map(b => b.key)).size}종 고정`);
  process.exit(0);
}

let known;
try { known = new Set(JSON.parse(readFileSync(SNAP, 'utf8').replace(/^﻿/, '')).known || []); }
catch (e) {
  console.log(`\n🚨 ${SNAP} 을 읽을 수 없습니다 — 검사가 꺼진 채로 통과시키지 않습니다.\n   ${e.message}`);
  console.log(`   최초 생성:  node test-harness/page_contract_harness.mjs --update`);
  process.exit(1);
}

const fresh = broken.filter(b => !known.has(b.key));
if (fresh.length) {
  console.log(`\n🚨 «새로» 배선이 끊긴 버튼 ${fresh.length}건 — 누르면 아무 일도 안 일어납니다:`);
  for (const b of fresh.slice(0, 20)) console.log(`    ${b.page}:${b.line}   ${b.name}() 정의 없음`);
  console.log(`\n  코드를 다른 파일로 옮겼다면, 그 파일이 이 페이지에서 로드되는지 확인하세요.`);
  console.log(`  (외부 classic script 는 전역을 공유하므로 «로드만 되면» 동작합니다)`);
  console.log(`\n${fresh.length} FAIL`);
  process.exit(1);
}

console.log(`\n✅ 새로 끊긴 버튼 없음 (기존 부채 ${known.size}종)`);
process.exit(0);
