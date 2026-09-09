// -*- coding: utf-8 -*-
// 🔗 강사↔계정 연결 — 「퇴사 강사를 기본 목록에서 뺀다」 계약 검사 (2026-09-09)
//
//   왜 이 파일이 따로 있나 —
//     브라우저 검사(`manual/teacher-links-left-hidden-browser.mjs`)는 서버를 **스텁으로
//     가로채기** 때문에, 서버가 `active` 를 안 내려줘도 33종이 전부 통과합니다(실측).
//     즉 그쪽은 «서버 계약» 을 원리상 못 잽니다. 여기서 그 절반을 맡습니다.
//
//   재는 것
//     ① 두 roster 질의가 `active` 를 «뽑는가» — 안 뽑으면 화면이 거를 수조차 없다
//     ② 서버가 `WHERE active=1` 로 «거르지는» 않는가 — 거르면 「퇴사 강사도 보기」가 무동작
//     ③ 화면 두 곳의 판정(`tlIsLeft`·`tlkIsLeft`)이 **같은 답**을 내는가
//        (두 화면이 서로를 import 하지 않아 복제인데, 한쪽만 고치면 화면마다 답이 달라진다)
//     ④ 그 판정이 «모르면 재직» 으로 실패하는가 (숨기는 쪽으로 실패하면 멀쩡한 강사가 사라진다)
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => readFileSync(join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
const check = (n, ok, extra) => {
  if (ok) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (extra ? '  → ' + extra : '')); }
};

/* 주석을 벗긴 사본 — 부정 검사(«이 글자가 없어야 한다»)가 자기 설명 주석을 잡지 않게.
   ⛔ 블록주석을 정규식 한 줄로 지우면 문자열 안의 짝 없는 «별표+슬래시» 하나에 뒤가 통째로
      날아간다(CLAUDE.md 2장) — 줄 단위로 «지금 블록주석 안인가» 를 추적한다. */
function strip(src) {
  const out = [];
  let inBlock = false;
  for (const line of src.split('\n')) {
    let s = line;
    if (inBlock) {
      const e = s.indexOf('*/');
      if (e < 0) { out.push(''); continue; }
      s = s.slice(e + 2); inBlock = false;
    }
    for (;;) {
      const b = s.indexOf('/*');
      if (b < 0) break;
      const e = s.indexOf('*/', b + 2);
      if (e < 0) { s = s.slice(0, b); inBlock = true; break; }
      s = s.slice(0, b) + s.slice(e + 2);
    }
    out.push(s.replace(/^[ \t]*\/\/.*$/, ''));
  }
  return out.join('\n');
}

const API = strip(R('cloudflare-deploy/src/api-admin.ts'));

console.log('\n[ ① 서버가 active 를 «뽑는가» — 안 뽑으면 화면이 거를 수조차 없다 ]');
/* 두 화면의 roster 질의를 각각 콕 집는다.
   ⚠️ 「파일 어딘가에 active 가 있나」로 물으면 무관한 질의에 걸려 헛돈다 —
      `FROM teachers` 를 담은 질의문 «그 자체» 를 잘라서 본다. */
const rosterSqls = (API.match(/`SELECT[^`]*FROM teachers[^`]*`/g) || []);
check('roster 질의를 소스에서 찾았다', rosterSqls.length >= 2, String(rosterSqls.length));

const sqlOf = (needle) => rosterSqls.find(q => q.includes(needle)) || '';
// ① 화면 — GET /api/admin/teachers/links
const q1 = sqlOf('ORDER BY active DESC');
check('① 화면 roster 질의가 active 를 뽑는다', /\bactive\b/.test(q1), q1 || '(못 찾음)');
// ② 화면 — GET /api/admin/teacher-links (CAST(id AS TEXT) 로 시작하는 그것)
const q2 = rosterSqls.find(q => q.includes('CAST(id AS TEXT) AS id, name') && q.includes('ORDER BY name'));
check('② 화면 roster 질의를 찾았다', !!q2, '(못 찾음)');
check('② 화면 roster 질의가 active 를 뽑는다', !!q2 && /\bactive\b/.test(q2),
  q2 || '(못 찾음)  ← 이게 빠지면 adm-tlink.js 가 퇴사자를 걸러 낼 근거가 없다');

console.log('\n[ ② 서버가 «거르지는» 않는가 — 거르면 「퇴사 강사도 보기」가 조용히 무동작 ]');
for (const [nm, q] of [['① 화면', q1], ['② 화면', q2]]) {
  check(nm + ' roster 질의에 WHERE active=1 이 없다',
    !!q && !/WHERE[^`]*\bactive\s*=\s*1/.test(q), q || '(못 찾음)');
}

console.log('\n[ ③ 화면 두 곳의 판정이 «같은 답» 을 내는가 (복제 대조) ]');
/* 소스에서 함수를 오려 내 **실제로 돌린다** — 「그 함수가 있는가」로는 답이 갈리는 것을 못 본다. */
function cut(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return null;
  let d = 0, started = false;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '{') { d++; started = true; }
    else if (c === '}') { d--; if (started && d === 0) return src.slice(i, j + 1); }
  }
  return null;
}
const f1src = cut(strip(R('cloudflare-deploy/public/js/adm-teacher-links.js')), 'tlIsLeft');
const f2src = cut(strip(R('cloudflare-deploy/public/js/adm-tlink.js')), 'tlkIsLeft');
check('① 화면의 tlIsLeft 를 오려 냈다', !!f1src);
check('② 화면의 tlkIsLeft 를 오려 냈다', !!f2src);

let f1 = null, f2 = null;
try { f1 = new Function(f1src + '; return tlIsLeft;')(); } catch (e) { /* 아래에서 잡힌다 */ }
try { f2 = new Function(f2src + '; return tlkIsLeft;')(); } catch (e) { /* 아래에서 잡힌다 */ }
check('두 판정을 실제로 실행할 수 있다', typeof f1 === 'function' && typeof f2 === 'function');

if (typeof f1 === 'function' && typeof f2 === 'function') {
  /* [t, 기대값] — 기대는 «퇴사인가» 다. 모르는 값은 전부 false(=재직) 여야 한다. */
  const CASES = [
    [{ active: 0 }, true,  '0 이면 퇴사'],
    [{ active: '0' }, true, "'0'(문자열) 도 퇴사 — D1 이 문자열로 줄 수 있다"],
    [{ active: 1 }, false, '1 이면 재직'],
    [{ active: '1' }, false, "'1' 도 재직"],
    [{ active: null }, false, 'NULL 은 «모름» → 재직 (숨기면 멀쩡한 강사가 사라진다)'],
    [{ active: undefined }, false, '칸이 없으면 재직 (서버가 안 뽑는 옛 응답 방어)'],
    [{}, false, '빈 객체도 재직'],
    [null, false, '행이 없으면 재직 쪽으로 (던지지 않는다)'],
  ];
  for (const [t, want, why] of CASES) {
    let a, b;
    try { a = f1(t); } catch (e) { a = 'throw:' + e.message; }
    try { b = f2(t); } catch (e) { b = 'throw:' + e.message; }
    check('①: ' + why, a === want, String(a));
    check('②: ' + why, b === want, String(b));
    check('①②가 같은 답 — ' + JSON.stringify(t), a === b, a + ' vs ' + b);
  }
}

console.log('\n[ ④ 화면이 그 판정을 «쓰는가» — 부르기만 하면 아무것도 안 막는다 ]');
const S1 = strip(R('cloudflare-deploy/public/js/adm-teacher-links.js'));
const S2 = strip(R('cloudflare-deploy/public/js/adm-tlink.js'));
check('① 화면이 판정 결과로 <option> 을 건너뛴다',
  /if\s*\(\s*left\s*&&\s*!\s*mine\s*&&\s*!\s*_tlShowLeft\s*\)\s*return\s*;/.test(S1));
check('② 화면이 판정 결과로 <option> 을 건너뛴다',
  /if\s*\(\s*left\s*&&\s*!\s*mine\s*&&\s*!\s*_tlkShowLeft\s*\)\s*continue\s*;/.test(S2));
// ↔ 짝: «이미 이어진 사람(mine)» 을 빼먹으면 그 줄이 「연결 안 됨」으로 보인다
for (const [nm, S] of [['①', S1], ['②', S2]]) {
  check(nm + ' 화면이 mine 을 예외로 둔다 (이어진 퇴사자는 안 숨김)', /!\s*mine/.test(S));
}

console.log('\n[ ⑤ 되돌릴 길이 화면에 있는가 ]');
const H = R('cloudflare-deploy/public/admin.html');
for (const id of ['tl-show-left', 'tlk-show-left']) {
  const n = (H.match(new RegExp('id="' + id + '"', 'g')) || []).length;
  check('체크박스 #' + id + ' 가 정확히 하나 있다', n === 1, String(n));
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
