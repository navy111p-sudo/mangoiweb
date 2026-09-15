// -*- coding: utf-8 -*-
/**
 * ✏️ 학생 목록 → «상세 › 연락처·정보» 바로가기 감시 (2026-09-15)
 *   실행: node test-harness/student_contact_edit_harness.mjs
 *
 * [왜 있나]
 *   사장님 지시 「정보수정 → 상세 안의 연락처·정보 로 바로 가게」·「위에 것 말고」.
 *   즉 목록에 수정 «폼» 을 새로 만들지 않고, 이미 있는 화면(/admin/student 의
 *   «👨‍👩‍👧 연락처·정보» 탭)으로 보낸다. 그 탭은 `?tab=contact` 딥링크를 이미 받는다.
 *
 * [문자열로는 못 잡는 것]
 *   주소도 함수도 «있고» 틀리는 것은 «무슨 주소가 나오는가»·«눌러서 열리는가» 뿐이다.
 *   그래서 정본과 버튼 동작을 **소스에서 오려 내 가짜 DOM 으로 실제로 돌린다.**
 *
 * [짝으로 묻는다]
 *   「한 명이면 바로 연다」 옆에 「여러 명이면 함부로 안 연다」·「목록이 없으면 안 연다」를
 *   둔다. 앞만 보면 «언제나 열기» 도 통과한다.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const rd = (p) => { try { return readFileSync(resolve(__dir, p), 'utf8'); } catch { return ''; } };

const core    = rd(process.env.SCE_CORE_FILE || '../cloudflare-deploy/public/js/adm-core.js');
const admin   = rd('../cloudflare-deploy/public/admin.html');
const detail  = rd('../cloudflare-deploy/public/admin/student.html');
const mango   = rd('../cloudflare-deploy/src/api-mango.ts');

let PASS = 0, FAIL = 0; const FAILS = [];
const check = (name, cond) => { if (cond) { PASS++; console.log('  ✅ ' + name); } else { FAIL++; FAILS.push(name); console.log('  ❌ ' + name); } };

/** 중괄호 짝으로 함수 몸통을 자른다 — 정규식 «첫 `}`» 는 try·객체에서 끊긴다. */
function bodyAt(src, startIdx) {
  const open = src.indexOf('{', startIdx);
  if (open < 0) return '';
  let d = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (d === 0) return src.slice(startIdx, i + 1); }
  }
  return '';
}
/** 주석을 벗긴 사본 — 부정 검사가 «자기 주석» 을 잡지 않게(CLAUDE.md 2장). */
function strip(t) {
  let out = '', i = 0, inBlock = false, inLine = false, q = '';
  while (i < t.length) {
    const c = t[i], n = t[i + 1];
    if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i += 2; continue; } i++; continue; }
    if (inLine) { if (c === '\n') { inLine = false; out += c; } i++; continue; }
    if (q) { if (c === '\\') { out += c + (n || ''); i += 2; continue; } if (c === q) q = ''; out += c; i++; continue; }
    if (c === '/' && n === '*') { inBlock = true; i += 2; continue; }
    if (c === '/' && n === '/') { inLine = true; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; out += c; i++; continue; }
    out += c; i++;
  }
  return out;
}

console.log('\n[ ⓪ 전제 — 상세 화면이 `?tab=contact` 를 실제로 받는가 ]');
/* 이 전제가 깨지면 아래 검사가 전부 «주소는 맞는데 아무 데도 안 가는» 상태를 통과시킨다. */
check('상세에 «연락처·정보» 탭 버튼이 있다 (data-tab="contact")', /data-tab="contact"/.test(detail));
check('상세가 ?tab= 파라미터로 그 탭을 연다 (_initTab)',
  /URLSearchParams\(location\.search\)\.get\('tab'\)/.test(detail) && /\.tab\[data-tab="'\s*\+\s*_initTab/.test(detail));

console.log('\n[ ① 주소 정본 smContactUrl — 오려 내 «실제로» 돌린다 ]');
const uIdx = core.indexOf('function smContactUrl(');
const uSrc = uIdx >= 0 ? bodyAt(core, uIdx) : '';
check('전제: smContactUrl 을 오려 냈다', uSrc.length > 30);
let smContactUrl = null;
try { smContactUrl = new Function(uSrc + '; return smContactUrl;')(); } catch (e) { console.log('    (평가 실패: ' + e.message + ')'); }
check('전제: 그 함수를 평가했다', typeof smContactUrl === 'function');
if (typeof smContactUrl === 'function') {
  const u = smContactUrl('jeong');
  check('학생 상세 주소로 간다 (' + u + ')', /^\/admin\/student\?uid=jeong(&|$)/.test(u));
  check('«연락처·정보» 탭을 콕 집는다 (tab=contact)', /[?&]tab=contact(&|$)/.test(u));
  check('아이디를 인코딩한다 (공백·한글·&)', smContactUrl('a b&c').indexOf('uid=a%20b%26c') > 0);
  check('빈 아이디에도 던지지 않는다', typeof smContactUrl('') === 'string' && typeof smContactUrl(null) === 'string');
}

console.log('\n[ ② 두 입구가 «그 정본» 을 쓰는가 — 주소를 따로 조립하면 조용히 갈린다 ]');
const rowIdx = core.indexOf('_smRowHtml = (s) => {');
const rowSrc = rowIdx >= 0 ? bodyAt(core, rowIdx) : '';
check('전제: 행 HTML 생성기를 오려 냈다', rowSrc.length > 100);
check('행에 ✏️ 수정 링크가 있다', /✏️/.test(rowSrc));
check('행이 smContactUrl() 을 «부른다»', /\$\{smContactUrl\(/.test(rowSrc));
check('행이 tab=contact 를 손으로 적지 않는다', !/tab=contact/.test(strip(rowSrc)));
check('도구 줄에 「정보 수정」 버튼이 있다 (admin.html)', /id="sm-edit-student"/.test(admin));
check('그 버튼이 smOpenContactEdit 을 부른다',
  /id="sm-edit-student"[\s\S]{0,400}?smOpenContactEdit\s*&&\s*window\.smOpenContactEdit\(\)/.test(admin));
check('그 버튼은 「학생 등록」 옆에 있다 (사장님 지시 자리)',
  admin.indexOf('id="sm-add-student"') > 0 && admin.indexOf('id="sm-edit-student"') > admin.indexOf('id="sm-add-student"')
  && (admin.indexOf('id="sm-edit-student"') - admin.indexOf('id="sm-add-student"')) < 1600);

console.log('\n[ ③ 도구 줄 버튼 동작 — 가짜 DOM 으로 «실제로» 눌러 본다 ]');
const oIdx = core.indexOf('window.smOpenContactEdit = function');
const oSrc = oIdx >= 0 ? bodyAt(core, oIdx) : '';
const pIdx = core.indexOf('function smShowContactPicker(');
const pSrc = pIdx >= 0 ? bodyAt(core, pIdx) : '';
check('전제: 버튼 동작·고르기 창을 오려 냈다', oSrc.length > 100 && pSrc.length > 100);

function runOpen(rows, opts) {
  opts = opts || {};
  const opened = [], alerts = [], clicked = [];
  const mk = () => {
    const el = { style: {}, children: [], id: '', innerHTML: '', _cs: '' };
    el.set = (k, v) => { el[k] = v; return el; };
    el.click = () => clicked.push(el.id);
    el.addEventListener = () => {};
    el.appendChild = (c) => el.children.push(c);
    el.remove = () => {};
    el.querySelector = () => null;
    Object.defineProperty(el, 'cssText', { set(v) { el._cs = v; }, get() { return el._cs; } });
    return el;
  };
  const loadBtn = mk(); loadBtn.id = 'sm-load-students';
  const body = mk();
  const doc = {
    getElementById: (id) => (id === 'sm-load-students' ? (opts.noLoadBtn ? null : loadBtn) : null),
    createElement: () => { const e = mk(); e.style = { cssText: '' }; return e; },
    addEventListener: () => {}, removeEventListener: () => {},
    body,
  };
  const sandbox = {
    adminLang: 'ko', _smRows: rows, document: doc,
    alert: (t) => alerts.push(String(t)),
    mangoiOpenTab: (u) => { opened.push(u); return true; },
    _esc: (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
    window: {},
  };
  sandbox.window = sandbox;
  const code = uSrc + '\n' + pSrc + '\n' + oSrc + '\n; window.smOpenContactEdit();';
  const fn = new Function('window', 'document', 'adminLang', '_smRows', 'alert', 'mangoiOpenTab', '_esc',
    'var globalThisShim; ' + code);
  fn(sandbox, doc, 'ko', rows, sandbox.alert, sandbox.mangoiOpenTab, sandbox._esc);
  return { opened, alerts, clicked, body };
}

const ONE = [{ user_id: 'jeong', username: '정우영' }];
const MANY = [{ user_id: 'jeong', username: '정우영' }, { user_id: 'lee', username: '이철수' }];
let r1 = null, r2 = null, r0 = null;
try { r1 = runOpen(ONE); } catch (e) { console.log('    (1명 실행 실패: ' + e.message + ')'); }
try { r2 = runOpen(MANY); } catch (e) { console.log('    (여러 명 실행 실패: ' + e.message + ')'); }
try { r0 = runOpen([]); } catch (e) { console.log('    (빈 목록 실행 실패: ' + e.message + ')'); }
check('전제: 세 경우를 모두 돌렸다', !!r1 && !!r2 && !!r0);
if (r1) {
  check('한 명이면 «묻지 않고» 바로 연다', r1.opened.length === 1);
  check('그 주소가 연락처·정보 탭이다', /uid=jeong&tab=contact/.test(r1.opened[0] || ''));
}
/* 짝 — 앞만 보면 «언제나 열기» 도 통과한다. */
if (r2) {
  check('여러 명이면 함부로 열지 않는다', r2.opened.length === 0);
  check('여러 명이면 고르기 창을 띄운다', r2.body.children.length === 1);
  const html = String((r2.body.children[0] || {}).innerHTML || '');
  check('고르기 줄이 그 학생의 연락처·정보 주소를 건다',
    html.indexOf('uid=jeong&amp;tab=contact') > 0 || html.indexOf('uid=jeong&tab=contact') > 0);
  check('고르기 줄은 <a> 다 (버튼이면 전역 인디고 알약이 된다)',
    /<a [^>]*class="sm-cp-item"/.test(html) && !/<button[^>]*sm-cp-item/.test(html));
}
if (r0) {
  check('목록이 없으면 열지 않는다', r0.opened.length === 0);
  check('목록이 없으면 «불러오기» 를 눌러 준다(안내만 하지 않는다)', r0.clicked.indexOf('sm-load-students') >= 0);
  check('목록이 없으면 사람에게 말한다', r0.alerts.length >= 1);
}

console.log('\n[ ④ 표 칸 수 — col·th·td·colspan 이 서로 같은가 ]');
{
  const a = admin.indexOf('<table id="sm-students-table"');
  const b = admin.indexOf('</table>', a);
  const tbl = a >= 0 ? admin.slice(a, b) : '';
  const nCol = (tbl.match(/<col\b/g) || []).length;
  const nTh = (tbl.match(/<th\b/g) || []).length;
  const nTd = (rowSrc.match(/<td\b|\$\{_ct\(|\$\{_schedTd\(/g) || []).length;
  const spans = new Set((tbl.match(/colspan="(\d+)"/g) || []).map(x => x.replace(/\D/g, '')));
  /* 빈 줄 colspan 은 JS 쪽에도 있다(불러오는 중·데이터 없음·검색 0건·더 보기).
     ⚠️ 파일 전체에서 찾으면 **다른 표의 colspan** 이 딸려 와 언제나 어긋난다(실제로 밟았다).
        학생 목록을 그리는 세 함수의 «몸통 안» 에서만 센다. */
  let jsSpanSrc = '';
  for (const fn of ['async function loadStudentList', 'function renderStudentTable()', 'function _smMoreRow(']) {
    const i = core.indexOf(fn);
    if (i >= 0) jsSpanSrc += bodyAt(core, i);
  }
  check('전제: 학생 목록을 그리는 세 함수를 오려 냈다', jsSpanSrc.length > 500);
  for (const m of jsSpanSrc.matchAll(/colspan="(\d+)"/g)) spans.add(m[1]);
  check(`col(${nCol}) == th(${nTh})`, nCol === nTh && nCol > 0);
  check(`th(${nTh}) == 한 줄 td(${nTd})`, nTh === nTd);
  check(`빈 줄 colspan 이 전부 그 수와 같다 (${[...spans].join(',')})`,
    spans.size === 1 && Number([...spans][0]) === nTh);
}

console.log('\n[ ⑤ 서버 — 고친 번호가 «밤에» 사라지지 않는가 ]');
/* students_erp 의 parent_phone·student_phone·phone 은 카페24가 정본이라, 카페24가 값을 주면
   그쪽이 이긴다(2026-09-15 수리로 «빈 값으로 매일 밤 덮는» 것만 멈췄다).
   그래서 override 에도 함께 적어야 수업 안내문자가 그 번호로 간다. */
const cIdx = mango.indexOf("const m = path.match(/^\\/api\\/admin\\/student\\/([^\\/]+)\\/contact$/)");
const cSrc = cIdx >= 0 ? mango.slice(cIdx, mango.indexOf('\n    // /api/admin/student/:uid/extend', cIdx)) : '';
check('전제: contact PATCH 블록을 잘라 냈다', cSrc.length > 500);
check('번호를 student_erp_override 에도 적는다', /setOverridePhones\(/.test(cSrc));
check('마스킹된 표시값은 override 로도 안 간다', /isMaskedValue\(b\.student_phone\)/.test(cSrc) && /isMaskedValue\(b\.parent_phone\)/.test(cSrc));
check('보관 실패를 «조용히» 넘기지 않는다 (phone_kept 를 응답에 싣는다)', /phone_kept/.test(cSrc));

/* 🔴 «그 글자가 있는가» 로는 못 잡는다 — 호출이 둘(넣기·지우기)이라 **한쪽만 죽여도**
   그 낱말이 남아 통과한다(변이시험에서 실제로 뚫렸다). 그래서 그 절을 오려 내
   타입만 지우고 **가짜 setOverridePhones 로 실제로 돌려** «무엇을 몇 번 부르는가» 를 본다. */
const bStart = cSrc.indexOf('let phoneKept');
/* ⚠️ (2026-09-15 병합) 끝을 `return json(...)` 로 잡으면, 그 사이에 나중에 끼워진 다른 블록
   (가맹점·소속의 orgKept)까지 함께 오려져 이 절이 «모르는 변수»(_orgTouch 등)를 만나 던진다 —
   길이로 자르지 말고 그 다음 블록이 시작하는 자리(고유한 주석)까지만 본다. */
const bEnd0 = cSrc.indexOf('/* 🏢', bStart);
const bEnd = bEnd0 >= 0 ? bEnd0 : cSrc.indexOf('return json({ ok: true, updated_fields');
const bSrc = (bStart >= 0 && bEnd > bStart) ? cSrc.slice(bStart, bEnd) : '';
check('전제: 번호 보관 절을 오려 냈다', bSrc.length > 200);
const bJs = bSrc
  .replace(/:\s*boolean\s*\|\s*null/g, '')
  .replace(/:\s*any\b/g, '')
  .replace(/\s+as\s+any\b/g, '');

/** 그 절을 돌려 «누구를 어떤 인자로 불렀나» 와 phoneKept 를 돌려준다. */
async function runOv(o) {
  const calls = [];
  const fake = async (env, uid, phones, by) => {
    calls.push({ uid, phones: JSON.parse(JSON.stringify(phones)), by });
    if (o.throws) throw new Error('boom');
    return { ok: o.ok !== false, parent: '', student: '' };
  };
  const fn = new Function('_ovTouch', '_ovStu', '_ovPar', 'preRow', 'env', 'setOverridePhones', 'console',
    'return (async () => { ' + bJs + ' return phoneKept; })();');
  const kept = await fn(o.touch, o.stu, o.par, o.preRow === undefined ? { user_id: 'jeong' } : o.preRow,
    {}, fake, { warn() {} });
  return { calls, kept };
}

let ovErr = '';
const OV = {};
try {
  OV.both   = await runOv({ touch: true, stu: '01011112222', par: '01033334444' });
  OV.clear  = await runOv({ touch: true, stu: '', par: '' });
  OV.mixed  = await runOv({ touch: true, stu: '01011112222', par: '' });
  OV.none   = await runOv({ touch: false, stu: undefined, par: undefined });
  OV.failed = await runOv({ touch: true, stu: '01011112222', ok: false });
  OV.threw  = await runOv({ touch: true, stu: '01011112222', throws: true });
  OV.noUid  = await runOv({ touch: true, stu: '01011112222', preRow: null });
} catch (e) { ovErr = e.message; }
check('전제: 그 절을 실제로 돌렸다' + (ovErr ? ' (' + ovErr + ')' : ''), !ovErr && !!OV.both);
if (!ovErr && OV.both) {
  const put = OV.both.calls.find(c => c.phones && !c.phones.clear) || { phones: {} };
  check('번호 둘을 고치면 override 에 «그 번호로» 적는다',
    OV.both.calls.length === 1 && put.phones.student === '01011112222' && put.phones.parent === '01033334444');
  check('성공하면 phone_kept 가 참이다', OV.both.kept === true);
  /* 빈 칸 = «지우기». clear 없이 빈 값을 넘기면 override 에 옛 번호가 남아
     명부에서는 지웠는데 **문자는 계속 옛 번호로 간다.** */
  /* 🔴 이 절은 `_ovStu` 를 «직접 주입» 한다 — 그 값을 «만드는» 줄은 안 돌린다.
     그래서 「빈 칸 = 지우기」를 여기서만 초록으로 만들면 검사 이름이 실제 보장보다 넓어진다
     (함정 대조가 실제로 그 상태를 잡았다). 만드는 줄은 아래 ⑤-b 절이 따로 돌린다.
     ⚠️ 그러니 이 검사의 뜻은 「_ovStu 가 '' 로 «오면» 지우기로 넘긴다」까지다 —
        지금 화면은 그 값을 보내지 않으므로 **이 경로는 살아 있는 코드가 아니다.** */
  check('_ovStu 가 빈 문자열로 «오면» 지우기로 넘긴다 (지금 화면은 이 값을 안 보낸다 — ⑤-b)',
    OV.clear.calls.length === 1 && OV.clear.calls[0].phones.clear === true
    && OV.clear.calls[0].phones.student === '' && OV.clear.calls[0].phones.parent === '');
  check('하나는 넣고 하나는 지우는 것도 «둘 다» 반영한다',
    OV.mixed.calls.length === 2
    && OV.mixed.calls.some(c => !c.phones.clear && c.phones.student === '01011112222')
    && OV.mixed.calls.some(c => c.phones.clear === true && c.phones.parent === ''));
  /* 짝 — 앞만 보면 «언제나 쓰기» 도 통과한다. */
  check('번호를 안 고친 요청은 override 를 건드리지 않는다',
    OV.none.calls.length === 0 && OV.none.kept === null);
  check('학생을 못 찾으면(진짜 user_id 없음) 아무 데도 안 쓴다',
    OV.noUid.calls.length === 0 && OV.noUid.kept === false);
  check('보관이 실패하면 사실대로 phone_kept=false', OV.failed.kept === false);
  check('보관이 던져도 저장 자체는 안 막는다(안 던지고 false)', OV.threw.kept === false);
}

console.log('\n[ ⑤-b 그 값을 «만드는» 줄 — 화면이 실제로 보내는 payload 로 돌린다 ]');
/* 🔴 위 절은 _ovStu 를 직접 주입하므로 «만드는 줄» 을 한 번도 안 본다.
   화면(public/admin/student.html)은 빈 칸을 `value || null` 로 보내므로 여기서 갈린다. */
const dStart = cSrc.indexOf('const _ovStu =');
const dEnd = cSrc.indexOf('const preRow = (nameChanged', dStart);
const dJs = (dStart >= 0 && dEnd > dStart) ? cSrc.slice(dStart, dEnd).replace(/:\s*any\b/g, '').replace(/\s+as\s+any\b/g, '') : '';
check('전제: _ovStu/_ovPar/_ovTouch 를 만드는 줄을 오려 냈다', dJs.length > 80);
let derive = null;
try {
  derive = (b) => new Function('b', 'isMaskedValue', dJs + '; return { stu:_ovStu, par:_ovPar, touch:_ovTouch };')(
    b, (v) => typeof v === 'string' && /[*]/.test(v));
} catch (e) { console.log('    (평가 실패: ' + e.message + ')'); }
check('전제: 그 줄을 평가했다', typeof derive === 'function');
if (typeof derive === 'function') {
  /* 화면이 «실제로» 보내는 모양 — public/admin/student.html 의 `$('cStudentPhone').value || null` */
  const asScreen = derive({ student_phone: null, parent_phone: null });
  check('화면이 보내는 빈 칸(null)으로는 override 를 안 건드린다 — 즉 «빈 칸 = 지우기» 는 지금 닿지 않는다',
    asScreen.touch === false);
  const typed = derive({ student_phone: '010-1111-2222', parent_phone: null });
  check('번호를 적으면 그 값이 그대로 간다', typed.touch === true && typed.stu === '010-1111-2222');
  const masked = derive({ student_phone: '010-****-2222' });
  check('마스킹된 표시값은 만드는 줄에서 이미 걸린다', masked.touch === false);
  const nothing = derive({ school: '망고초' });
  check('번호 칸을 안 보낸 저장은 override 를 안 건드린다', nothing.touch === false);
}

console.log('\n[ ⑤-c 화면이 «보관 실패» 를 말하는가 — 조용히 넘기면 아무도 모른다 ]');
/* `phone_kept:false` 는 흔히 «숫자 9자리 미만» 이다. 그때 「저장되었습니다」만 띄우면
   번호는 students_erp 에만 들어가 그날 밤 사라지고 문자는 영영 안 간다. */
check('상세 화면이 phone_kept 를 읽는다', /j\.phone_kept\s*===\s*false/.test(detail));
check('그때 사람에게 «보관 안 됨» 을 말한다', /phoneNotKept/.test(detail) && /phoneNotKept:\{ko:/.test(detail));
/* 짝 — 앞만 보면 «언제나 경고» 도 통과한다. 번호를 안 고친 저장(null)은 조용해야 한다. */
check('번호를 안 고친 저장(phone_kept=null)에는 경고하지 않는다', !/j\.phone_kept\s*!==\s*true/.test(detail));

console.log('\n════════════════════════════════════════════');
console.log(`  결과: PASS ${PASS} / FAIL ${FAIL}`);
if (FAIL) { console.log('  ⚠ 실제 확인 필요:'); FAILS.forEach(f => console.log('   - ' + f)); }
process.exit(FAIL ? 1 : 0);
