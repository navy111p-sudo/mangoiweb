// -*- coding: utf-8 -*-
/* ═══════════════════════════════════════════════════════════════════════════
   🏫 「오늘 수업」 학원·강사 드롭다운 — 두 벌 판정 대조 (2026-09-23 신설)

   [왜] 매니저 Karl 요청으로 admin.html(js/adm-today-classes.js)과 manager.html 「오늘 전체 수업」에
        학원·강사 고르기를 넣었다. manager.html 은 «외부 스크립트 0개» 계약이라 판정(pickKey·pickMatch·
        pickOptions·fillPick)이 **두 벌**이다 — 한쪽만 고치면 «화면마다 목록이 다른» 상태가 에러 없이 생긴다.
   [무엇을] ① 두 파일에서 네 함수를 **중괄호 짝으로 오려 내 실제로 돌려** 같은 입력에 같은 답인지
           ② 빈 값·공백 차이·미배정이 «조용히 사라지지 않는가» (짝: 이름은 이름대로 남는가)
           ③ 배선 — 그리는 함수가 fillPick 이 돌려준 «그 값» 으로 거르는가(이름은 소스에서 읽는다)
   브라우저 검사(무엇이 그려지는가)는 test-harness/manual/today-class-pickers-browser.mjs — 사람이 부른다.
   ═══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
const ADM = readFileSync(join(PUB, 'js', 'adm-today-classes.js'), 'utf8');
const MGR = readFileSync(join(PUB, 'manager.html'), 'utf8');

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra) => {
  if (cond) { PASS++; console.log('  ✅ ' + name); }
  else { FAIL++; console.log('  ❌ FAIL ' + name + (extra ? '  → ' + extra : '')); }
};

/* 선언 뒤 첫 «{» 부터 짝이 맞는 «}» 까지 (JS 라 반환 타입이 없다) */
function fnSrc(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return '';
  let j = src.indexOf('{', i), d = 0;
  for (let k = j; k < src.length; k++) {
    const ch = src[k];
    if (ch === '{') d++;
    else if (ch === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  return '';
}
function build(src, label) {
  const none = (src.match(/var PICK_NONE = ('[^']*');/) || [])[1];
  const parts = ['pickKey', 'pickMatch', 'pickOptions', 'fillPick'].map(n => fnSrc(src, n));
  ok(`[${label}] 네 함수와 PICK_NONE 을 오려 냈다 (전제)`, !!none && parts.every(Boolean));
  try {
    /* fillPick 은 $() 또는 document.getElementById 로 요소를 찾는다 — 둘 다 가짜로 준다 */
    return new Function('esc', '$', 'document',
      'var PICK_NONE = ' + none + ';\n' + parts.join('\n')
      + '\nreturn { NONE: PICK_NONE, pickKey: pickKey, pickMatch: pickMatch, pickOptions: pickOptions, fillPick: fillPick };');
  } catch (e) { ok(`[${label}] 오려 낸 코드가 컴파일된다`, false, e.message); return null; }
}
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function run(factory) {
  const els = {};
  const get = id => (els[id] = els[id] || { value: '', innerHTML: '' });
  /* 가짜 <select> — 진짜처럼 innerHTML 을 갈면 선택이 첫 항목으로 돌아가고, 없는 값은 받지 않는다 */
  const sel = id => {
    const o = get(id);
    if (!o._wrapped) {
      o._wrapped = true; let v = '', html = '';
      Object.defineProperty(o, 'innerHTML', { get: () => html, set: h => { html = h; v = ''; } });
      Object.defineProperty(o, 'value', {
        get: () => v,
        set: x => { const vals = [...html.matchAll(/value="([^"]*)"/g)].map(m => m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"')); v = (html === '' || vals.includes(x)) ? x : ''; },
      });
    }
    return o;
  };
  const doc = { getElementById: sel };
  try { return { api: factory(esc, sel, doc), sel }; } catch (e) { return { api: null, err: e }; }
}

const FIX = [
  { academy: 'BNJ어학원', teacher_name: 'FAR' },
  { academy: 'BNJ어학원', teacher_name: 'HANNAH' },
  { academy: 'BNJ  어학원 ', teacher_name: 'FAR' },   // 공백만 다른 이름 → 'BNJ 어학원' 한 항목
  { academy: 'BNJ 어학원', teacher_name: 'Kaye' },
  { academy: 'CAG영수학원', teacher_name: 'HANNAH' },
  { academy: '', teacher_name: 'Kaye' },
  { academy: null, teacher_name: null },
  { academy: '학원10', teacher_name: 'Belle' },
  { academy: '학원2', teacher_name: 'Belle' },
  { academy: 'bnj어학원', teacher_name: 'far' },     // 대소문자만 다른 것은 «다른» 항목(합치지 않는다)
];

console.log('\n── ① 두 벌 판정을 실제로 돌린다 ──');
const A = build(ADM, 'admin'), M = build(MGR, 'manager');
const ra = A && run(A), rm = M && run(M);
ok('[admin] 실행된다', !!(ra && ra.api), ra && ra.err && ra.err.message);
ok('[manager] 실행된다', !!(rm && rm.api), rm && rm.err && rm.err.message);

if (ra && ra.api && rm && rm.api) {
  const a = ra.api, m = rm.api;
  const oa = JSON.stringify(a.pickOptions(FIX, 'academy')), om = JSON.stringify(m.pickOptions(FIX, 'academy'));
  ok('학원 목록이 두 화면에서 같다', oa === om, oa + ' ≠ ' + om);
  ok('강사 목록이 두 화면에서 같다',
    JSON.stringify(a.pickOptions(FIX, 'teacher_name')) === JSON.stringify(m.pickOptions(FIX, 'teacher_name')));
  const opts = a.pickOptions(FIX, 'academy');
  const vals = opts.map(o => o.value);
  console.log('     학원 목록: ' + opts.map(o => o.value + '(' + o.n + ')').join(' · '));
  ok('빈 값(""·null)은 «미지정» 한 항목으로 모이고 맨 끝이다', vals[vals.length - 1] === a.NONE && opts[opts.length - 1].n === 2);
  ok('   짝: 이름 있는 학원은 이름 그대로 남는다', vals.includes('BNJ어학원') && vals.includes('CAG영수학원'));
  ok('공백만 다른 이름은 한 항목(공백 축약)', vals.includes('BNJ 어학원') && opts.find(o => o.value === 'BNJ 어학원').n === 2 && !vals.includes('BNJ  어학원 '));
  ok('   짝: 대소문자만 다른 이름은 합치지 않는다(다른 학원일 수 있다)', vals.includes('bnj어학원') && vals.includes('BNJ어학원'));
  ok('숫자는 사람이 읽는 차례(학원2 < 학원10)', vals.indexOf('학원2') < vals.indexOf('학원10'));
  ok('건수 합 = 줄 수 (한 줄도 안 빠진다)', opts.reduce((s, o) => s + o.n, 0) === FIX.length);

  for (const [label, api] of [['admin', a], ['manager', m]]) {
    const hit = sel => FIX.filter(r => api.pickMatch(r, 'academy', sel)).length;
    ok(`[${label}] «전체»('') 는 모두 통과`, hit('') === FIX.length);
    ok(`[${label}] 'BNJ 어학원' 은 공백만 다른 두 줄을 잡는다`, hit('BNJ 어학원') === 2);
    ok(`[${label}] «미지정» 은 빈 값 두 줄만`, hit(api.NONE) === 2);
    ok(`[${label}] 없는 값은 0줄 (부분일치로 넓히지 않는다)`, hit('BNJ') === 0);
  }

  console.log('\n── ② fillPick — 고른 값이 없어지면 «전체» 로 돌아가는가 ──');
  for (const [label, r] of [['admin', ra], ['manager', rm]]) {
    const id = label === 'admin' ? 'tc-academy' : 'taAcademy';
    const el = r.sel(id);
    let v = r.api.fillPick(id, r.api.pickOptions(FIX, 'academy'), '전체', '(미지정)');
    ok(`[${label}] 처음엔 «전체»`, v === '' && /value=""/.test(el.innerHTML));
    el.value = 'CAG영수학원';
    v = r.api.fillPick(id, r.api.pickOptions(FIX, 'academy'), '전체', '(미지정)');
    ok(`[${label}] 다시 그려도 고른 값이 남는다`, v === 'CAG영수학원' && el.value === 'CAG영수학원', v);
    v = r.api.fillPick(id, r.api.pickOptions(FIX.filter(x => x.academy !== 'CAG영수학원'), 'academy'), '전체', '(미지정)');
    ok(`[${label}]   짝: 새 목록에 없으면 «전체» 로 돌린다 (이유 없는 0건 방지)`, v === '' && el.value === '', v);
    ok(`[${label}] 선택지 글자에 건수를 붙인다`, /\(2\)/.test(el.innerHTML));
    ok(`[${label}] 학원 이름을 이스케이프한다`, (() => {
      r.api.fillPick(id, [{ value: '<b>x', n: 1 }], '전체', '-'); return !/<b>x/.test(el.innerHTML) && /&lt;b&gt;x/.test(el.innerHTML);
    })());
  }
}

console.log('\n── ③ 배선 — 그리는 함수가 «고른 그 값» 으로 거르는가 ──');
function wiring(src, fnName, label) {
  const body = fnSrc(src, fnName).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ok(`[${label}] ${fnName} 몸통을 오려 냈다 (전제)`, body.length > 200);
  /* fillPick 결과를 받는 변수 이름을 «소스에서 읽는다» — 하니스에 이름을 못 박지 않는다 */
  const ac = (body.match(/var (\w+) = fillPick\(\s*'(?:tc-academy|taAcademy)'/) || [])[1];
  const te = (body.match(/var (\w+) = fillPick\(\s*'(?:tc-teacher|taTeacher)'/) || [])[1];
  ok(`[${label}] 학원·강사 드롭다운을 fillPick 으로 채운다`, !!ac && !!te, `ac=${ac} te=${te}`);
  const acUse = new RegExp(`pickMatch\\(\\s*\\w+\\s*,\\s*'academy'\\s*,\\s*${ac}\\s*\\)`).test(body);
  const teUse = new RegExp(`pickMatch\\(\\s*\\w+\\s*,\\s*'teacher_name'\\s*,\\s*${te}\\s*\\)`).test(body);
  ok(`[${label}] 표시할 줄을 «그 값» 으로 거른다 (학원·강사 둘 다)`, acUse && teUse);
  ok(`[${label}] 죽은 조건(if (false …)·&& false)이 없다`, !/if\s*\(\s*(false|true)\b|&&\s*false\b|\|\|\s*true\b/.test(body));
  return { body, ac, te };
}
const wa = wiring(ADM, 'render', 'admin');
ok('[admin] 거르는 중 표시(filtering)에 학원·강사가 들어간다 — 0건 때 «원래 없음» 으로 말하지 않게',
  new RegExp(`var filtering = [^;]*\\b${wa.ac}\\b[^;]*\\b${wa.te}\\b`).test(wa.body));
ok('[admin] 두 드롭다운 모두 change 에 render 를 건다',
  /\['tc-academy',\s*'tc-teacher'\]\.forEach[\s\S]{0,200}addEventListener\('change', render\)/.test(ADM));
const wm = wiring(MGR, 'paintTodayAll', 'manager');
ok('[manager] 아직 안 불러왔으면 그리지 않는다(드롭다운을 먼저 만져도 오류 상자를 안 띄움)',
  /^\s*if \(!D\.todayAll\) return;/m.test(wm.body.split('\n').slice(1, 3).join('\n')));
ok('[manager] 두 드롭다운이 paintTodayAll 을 부르고, 그것이 전역에 있다',
  /id="taAcademy" onchange="paintTodayAll\(\)"/.test(MGR) && /id="taTeacher" onchange="paintTodayAll\(\)"/.test(MGR)
  && /window\.paintTodayAll = paintTodayAll;/.test(MGR));
ok('[manager] 거르는 중이면 서버 합계(c.*)를 눈앞의 줄로 다시 센다', /if \(picking\) \{\s*c = \{/.test(wm.body));


console.log('\n── ④ 거르는 식을 오려 내 실제로 돌린다 (조건 뒤집기·죽이기를 잡는다) ──');
function filterExpr(body, head) {
  const i = body.indexOf(head);
  if (i < 0) return '';
  let j = body.indexOf('(', i + head.length - 1), d = 0;
  for (let k = j; k < body.length; k++) {
    if (body[k] === '(') d++;
    else if (body[k] === ')') { d--; if (d === 0) return body.slice(i, k + 1); }
  }
  return '';
}
for (const [label, w, api, head, base] of [
  ['admin', wa, ra && ra.api, 'var rows = _rows.filter(', '_rows'],
  ['manager', wm, rm && rm.api, 'var rows = all.filter(', 'all'],
]) {
  const ex = filterExpr(w.body, head);
  ok(`[${label}] 거르는 식을 오려 냈다 (전제)`, !!ex && !!api);
  if (!ex || !api) continue;
  const runF = (acV, teV) => {
    try {
      return new Function(base, 'pickMatch', w.ac, w.te, 'onlyLive', 'night', 'src', 'q', 'inNight', 'rowText',
        ex.replace(/^var rows = /, 'return ') + ';')(FIX, api.pickMatch, acV, teV, false, '', '', '', () => true, () => '').length;
    } catch (e) { return 'ERR ' + e.message; }
  };
  ok(`[${label}] 아무것도 안 고르면 전부 보인다`, runF('', '') === FIX.length, runF('', ''));
  ok(`[${label}] 학원을 고르면 그 학원 줄만`, runF('BNJ어학원', '') === 2, runF('BNJ어학원', ''));
  ok(`[${label}] 강사를 고르면 그 강사 줄만`, runF('', 'Kaye') === 2, runF('', 'Kaye'));
  ok(`[${label}] 둘 다 고르면 교집합`, runF('BNJ 어학원', 'Kaye') === 1, runF('BNJ 어학원', 'Kaye'));
}

console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`);
process.exit(FAIL ? 1 : 0);
