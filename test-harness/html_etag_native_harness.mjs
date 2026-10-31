// html_etag_native_harness.mjs — HTML ETag 를 「배포 시각」이 아니라 「파일 내용」으로 (2026-09-15)
//
// 왜 만들었나
//   사장님 제보: "작업을 할 때마다 너무 로딩이 심해서 작업에 시간이 소요 돼."
//   (admin.html 화면 실측 스크린샷 첨부)
//
//   원인 — src/index.ts 의 htmlEtag304() 는 모든 HTML 파일의 ETag/Last-Modified 를
//   env.BUILD_STAMP 「하나」로만 만들었다. BUILD_STAMP 는 «그 파일이 바뀌었는가»가
//   아니라 «사이트 어딘가가 배포됐는가»다. 이 저장소는 하루에도 여러 번 배포되므로,
//   admin.html 을 한 글자도 안 고친 배포에도 그 화면 전체(1.3MB)가 다음 방문에서
//   매번 통째로 다시 내려가고 있었다 — 관리자가 「로딩이 무겁다」고 느끼는 것이 당연했다.
//
//   고침 — Cloudflare Assets 는 워커 「안」에서는 HTML 에도 파일별 ETag 를 실어 준다
//   (기존 주석 26-07-22 가 이미 확인해 둔 사실 — CF 가 밖으로 나갈 때 떼는 것뿐이다).
//   headers.get('ETag') 로 그 값을 읽어 «검증 기준»으로 쓰면, 같은 파일 내용은 배포가
//   몇 번이든 같은 ETag 를 유지해 304 가 나간다. BUILD_STAMP 는 native ETag 를 못 구했을
//   때만 쓰는 폴백(예전 동작 그대로)이다.
//
// ⚠️ 「고쳤다」고 적힌 코드가 실제로 그렇게 동작하는지는 읽어서는 안 보인다 — 돌려야 안다
//   (CLAUDE.md 「검사도 위치로 하세요」·「실제로 돌려서」 반복 원칙). 그래서 함수를
//   src/index.ts 에서 그대로 오려 내(중괄호 짝) TS 타입만 벗기고 new Function 으로
//   실제 실행한다 — 흉내 낸 재구현이 아니다.
//
// 짝 검사(한쪽만 두면 헛돈다):
//   「파일 내용이 같으면 배포가 갈려도 304」   ↔  「파일 내용이 다르면 304 를 안 준다」
//   「native ETag 가 있으면 그것을 기준으로」  ↔  「native ETag 가 없으면 예전(stamp)대로 동작」
//
// 변이시험 — 이 하니스를 만든 이유 그 자체(basis = stamp 로 되돌리기)를 실제로 넣어
//   FAIL 이 나는지 확인한다(맨 아래 M부). 되돌리면 반드시 FAIL 나야 이 검사가 유효하다.
//
// 실행: node test-harness/html_etag_native_harness.mjs

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..');
const SRC_PATH = join(ROOT, 'cloudflare-deploy/src/index.ts');

let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log('  ✅ ' + m); }
  else { fail++; console.log('  ❌ ' + m + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : '')); }
};

/* 중괄호 짝으로 함수 몸통 자르기 — 괄호/꺾쇠 깊이가 0인 여는 중괄호만 「진짜 몸통 시작」으로
   인정한다(TS 반환타입 `Response | null` 안의 문자는 괄호·꺾쇠가 아니라 안전하지만, 이 패턴을
   그대로 재사용해 다른 함수에도 안전하게 쓸 수 있게 맞춘다 — enroll_multi_teacher_harness.mjs
   와 같은 헬퍼). */
function bodyAt(s, anchor, from = 0) {
  const i = s.indexOf(anchor, from);
  if (i < 0) return '';
  let j = i, paren = 0, angle = 0, start = -1;
  for (; j < s.length; j++) {
    const c = s[j];
    if (c === '(') paren++; else if (c === ')') paren--;
    else if (c === '<') angle++; else if (c === '>') angle = Math.max(0, angle - 1);
    else if (c === '{' && paren === 0 && angle === 0) { start = j; break; }
  }
  if (start < 0) return '';
  let d = 0;
  for (let k = start; k < s.length; k++) {
    if (s[k] === '{') d++; else if (s[k] === '}') { d--; if (d === 0) return s.slice(start, k + 1); }
  }
  return '';
}
function fnAt(s, anchor, from = 0) {
  const i = s.indexOf(anchor, from);
  if (i < 0) return '';
  const body = bodyAt(s, anchor, from);
  if (!body) return '';
  const bodyStart = s.indexOf(body, i);
  return s.slice(i, bodyStart + body.length);
}

// TS → JS 최소 변환 (로직은 한 글자도 안 건드린다) — enroll_activate_harness.mjs 와 같은 패턴.
function stripTypes(s) {
  return s
    .replace(/^export /gm, '')
    .replace(/\bnew (Set|Map)<[^>]*>/g, 'new $1')
    .replace(/:\s*(?:Record|Set|Map|Array)<[^>]*>/g, '')
    .replace(/\):\s*[A-Za-z_$][\w$<>,\s[\]|]*?\s*\{/g, ') {')   // 반환 타입 (Response | null 포함)
    .replace(/:\s*[A-Za-z_$][\w$]*(\[\])?(?=\s*[,)=])/g, '');   // 매개변수 타입
}

function loadHtmlEtag304(src) {
  const raw = fnAt(src, 'function htmlEtag304(');
  if (!raw) return null;
  const js = stripTypes(raw);
  try {
    // eslint-disable-next-line no-new-func
    return new Function(`'use strict';\n${js}\nreturn htmlEtag304;`)();
  } catch (e) {
    console.log('  (실행 실패: ' + e.message + ')');
    return null;
  }
}

const indexSrc = readFileSync(SRC_PATH, 'utf8');

console.log('════════ 0부. 함수를 오려 내 실제로 실행할 수 있는가 ════════');
const rawFn = fnAt(indexSrc, 'function htmlEtag304(');
ok(!!rawFn, 'htmlEtag304 함수 전체를 src/index.ts 에서 찾았다(중괄호 짝)');
ok(/BUILD_STAMP/.test(rawFn) && /ETag/.test(rawFn), '오려낸 몸통이 실제 몸통이다(BUILD_STAMP·ETag 둘 다 있음)');
const htmlEtag304 = loadHtmlEtag304(indexSrc);
ok(typeof htmlEtag304 === 'function', '오려낸 뒤 new Function 으로 실제로 실행 가능한 함수가 됐다');

if (typeof htmlEtag304 !== 'function') {
  console.log('\n' + '═'.repeat(60));
  console.log(`  ✅ PASS ${pass}    ❌ FAIL ${fail}  (함수를 못 불러와 나머지 검사를 건너뜀)`);
  console.log('═'.repeat(60));
  process.exit(1);
}

// ── 헬퍼: 요청/응답 흉내 ───────────────────────────────────────────────
// Node 전역 Headers/Request/Response 를 그대로 쓴다(추가 스텁 불필요 — 함수가 쓰는 API 와 동일).
function makeRequest(ifNoneMatch, ifModifiedSince) {
  const h = new Headers();
  if (ifNoneMatch) h.set('If-None-Match', ifNoneMatch);
  if (ifModifiedSince) h.set('If-Modified-Since', ifModifiedSince);
  return { headers: h };
}
function makeAssetHeaders(nativeEtag) {
  const h = new Headers();
  if (nativeEtag) h.set('ETag', nativeEtag);
  return h;
}

console.log('\n════════ A부. 핵심 수리 — «배포는 갈려도 파일 내용이 같으면 304» ════════');
{
  // 라운드 1: 배포 A, 파일 내용은 그대로(native ETag = "abc123")
  const headers1 = makeAssetHeaders('"abc123"');
  const resp1 = htmlEtag304(makeRequest(), '/admin.html', { BUILD_STAMP: '20260915120000' }, headers1);
  const etagSentToClient = headers1.get('ETag');
  ok(!!etagSentToClient, '라운드1(첫 방문): 클라이언트에 ETag 를 실어 보냈다', etagSentToClient);
  ok(resp1 === null, '라운드1: If-None-Match 가 없으니 200(=null 반환, 정상 진행)');

  // 라운드 2: 배포 B로 사이트 전체가 새로 배포됨(BUILD_STAMP 값이 다름) — 그러나
  //   이 파일의 native ETag(="abc123")는 그대로(파일 내용 불변). 브라우저는 라운드1에서
  //   받은 ETag 를 그대로 If-None-Match 로 되돌려 보낸다.
  const headers2 = makeAssetHeaders('"abc123"');
  const req2 = makeRequest(etagSentToClient);
  const resp2 = htmlEtag304(req2, '/admin.html', { BUILD_STAMP: '20260916083000' /* 다른 배포 시각 */ }, headers2);
  ok(resp2 !== null && resp2.status === 304,
    '🔑 라운드2(다른 배포 뒤 재방문, 파일은 안 바뀜): 304 — 이 사고를 고친 바로 그 지점',
    resp2 ? resp2.status : resp2);
}

console.log('\n════════ A-2부. 파일이 실제로 바뀌면 여전히 304 를 안 준다(거짓 304 방지) ════════');
{
  const headers1 = makeAssetHeaders('"abc123"');
  const resp1 = htmlEtag304(makeRequest(), '/admin.html', { BUILD_STAMP: '20260915120000' }, headers1);
  const oldEtag = headers1.get('ETag');
  ok(!!oldEtag, '라운드1에서 ETag 를 받았다(다음 비교의 전제)');

  // 파일 내용이 실제로 바뀌었다 → native ETag 가 "xyz999"로 달라짐. 브라우저는 여전히
  // 옛 ETag(oldEtag)를 If-None-Match 로 보낸다.
  const headers2 = makeAssetHeaders('"xyz999"');
  const req2 = makeRequest(oldEtag);
  const resp2 = htmlEtag304(req2, '/admin.html', { BUILD_STAMP: '20260916083000' }, headers2);
  ok(resp2 === null,
    '파일 내용이 바뀌었으면(다른 native ETag) 옛 If-None-Match 와 안 맞아 200(=null) — 거짓 304 없음',
    resp2 ? resp2.status : resp2);
}

console.log('\n════════ B부. native ETag 를 못 구했을 때 — 예전(stamp) 동작이 그대로 살아있는가 ════════');
{
  // Assets 가 ETag 를 안 준 경우(설정 이상 등) — 헤더에 ETag 가 없다.
  const stamp = '20260915120000';
  const headers1 = makeAssetHeaders(null);
  const resp1 = htmlEtag304(makeRequest(), '/admin.html', { BUILD_STAMP: stamp }, headers1);
  const etag1 = headers1.get('ETag');
  ok(!!etag1, 'native ETag 가 없어도 stamp 기반 ETag 를 여전히 만들어 보낸다(폴백 살아있음)', etag1);

  const headers2 = makeAssetHeaders(null);
  const resp2 = htmlEtag304(makeRequest(etag1), '/admin.html', { BUILD_STAMP: stamp }, headers2);
  ok(resp2 !== null && resp2.status === 304, '같은 stamp + native 없음 + 옛 ETag 제시 → 304(예전 동작 그대로)');

  const headers3 = makeAssetHeaders(null);
  const resp3 = htmlEtag304(makeRequest(etag1), '/admin.html', { BUILD_STAMP: '20260916083000' }, headers3);
  ok(resp3 === null, 'stamp 가 실제로 바뀌고 native 도 없으면 200(=null) — 폴백에서는 이것이 정상(사고가 아님)');
}

console.log('\n════════ C부. 곁가지가 안 깨졌는가 (범위 밖 동작 보존) ════════');
{
  const r1 = htmlEtag304(makeRequest(), '/admin.js', { BUILD_STAMP: 'x' }, makeAssetHeaders('"a"'));
  ok(r1 === null, '.html 이 아닌 경로는 여전히 즉시 null(적용 대상 아님)');

  const r2 = htmlEtag304(makeRequest(), '/admin.html', {}, makeAssetHeaders(null));
  ok(r2 === null, 'BUILD_STAMP 도 native ETag 도 둘 다 없으면 여전히 null(아무 것도 못 함 — 안전)');

  // Last-Modified 폴백도 살아있는가 — If-None-Match 없이 If-Modified-Since 만 보낼 때.
  const stamp = '20260915120000';
  const hProbe = makeAssetHeaders(null);
  htmlEtag304(makeRequest(), '/admin.html', { BUILD_STAMP: stamp }, hProbe);
  const lastMod = hProbe.get('Last-Modified');
  ok(!!lastMod, 'Last-Modified 도 여전히 실어 보낸다', lastMod);
  const hIms = makeAssetHeaders(null);
  const rIms = htmlEtag304(makeRequest(undefined, lastMod), '/admin.html', { BUILD_STAMP: stamp }, hIms);
  ok(rIms !== null && rIms.status === 304, 'If-Modified-Since 단독 폴백도 여전히 304 를 준다(HTTP 스펙 우선순위 보존)');
}

console.log('\n════════ M부. 변이시험 — 되돌리면 실제로 FAIL 나는가 (이 하니스가 그 사고를 지키는지) ════════');
// ⚠️ 디스크의 src/index.ts 는 건드리지 않는다 — 이미 메모리에 읽어 둔 문자열(indexSrc)을
//   .replace() 로 「가짜로 고장 낸」 사본을 만들어 그 사본만 오려서 실행한다. 프로세스가
//   중간에 죽어도 실제 소스 파일은 원본 그대로다(파일을 직접 써서 복원하는 방식보다 안전).
{
  // 이 사고를 그대로 되살리는 변이: basis 를 native 무시하고 stamp 로만 고정.
  const mutatedSrc = indexSrc.replace(
    'const basis = nativeTag || stamp;',
    'const basis = stamp; // (변이) native 무시 — 2026-09-15 이전 동작으로 되돌림'
  );
  ok(mutatedSrc !== indexSrc, '변이 적용 대상 줄을 찾았다(치환이 실제로 일어났다 — 못 찾으면 조용히 통과하지 않는다)');
  const mutatedFn = loadHtmlEtag304(mutatedSrc);
  ok(typeof mutatedFn === 'function', '변이된 소스도 여전히 실행 가능한 함수로 오려진다');
  if (typeof mutatedFn === 'function') {
    const headers1 = makeAssetHeaders('"abc123"');
    mutatedFn(makeRequest(), '/admin.html', { BUILD_STAMP: '20260915120000' }, headers1);
    const etagSentToClient = headers1.get('ETag');
    const headers2 = makeAssetHeaders('"abc123"');
    const req2 = makeRequest(etagSentToClient);
    const resp2 = mutatedFn(req2, '/admin.html', { BUILD_STAMP: '20260916083000' }, headers2);
    // basis=stamp 로 되돌리면, 배포 시각이 달라졌으므로 ETag 도 달라져 304 가 「안」 나가야 한다
    // — 이것이 바로 고치기 전 사고(파일은 그대로인데 배포마다 통째로 다시 내려받음)다.
    ok(resp2 === null,
      '🪤 변이(native 무시) 적용 시 A부의 핵심 케이스가 실제로 무너진다(=하니스가 유효함)',
      resp2 ? resp2.status : resp2);
  }
}

console.log('\n' + '═'.repeat(60));
console.log(`  ✅ PASS ${pass}    ❌ FAIL ${fail}`);
console.log('═'.repeat(60));
process.exit(fail ? 1 : 0);
