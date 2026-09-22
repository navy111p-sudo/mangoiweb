#!/usr/bin/env node
/* 🥭 담당 강사 «드롭다운» 회귀 하니스
 *
 *   [왜] 2026-09-22 사장님 「이거 선생님도 스크롤해서 선택하게 할 수 있어?」
 *   수업 예약 등록의 담당 강사 칸이 «자유 입력» 이었고, 서버가 그 글자를
 *   `name = ? OR name LIKE ? LIMIT 1` 로 찾았다. 운영 D1 실측(2026-09-22):
 *
 *       SELECT id,name FROM teachers WHERE name='FAR' OR name LIKE '%FAR%' LIMIT 1
 *         → id 3 · 'HT FARRAH' (퇴사)          ← 「FAR」(재직 22) 을 «정확히» 쳤는데도
 *
 *   즉 규칙서가 2026-08-26 사고로 못 박은 「퇴사 강사가 드롭다운에 떠서 잘못 이어짐」의
 *   쌍이 그대로 살아 있었다. 드롭다운은 «id» 를 보내 그 짐작을 아예 안 탄다.
 *
 *   ⚠️ 문자열 하니스로는 못 잡는다 — 함수도 값도 다 «있고» 틀린 것은 «누가 붙는가» 뿐이다.
 *      그래서 서버 SQL 은 진짜 SQLite 에 돌리고, 화면 함수는 오려 내 실제로 실행한다.
 *   ✅ 「붙는다」 옆에 「엉뚱한 것은 안 붙는다」를 «짝으로» 둔다 — 짝이 없으면
 *      «전부 막기»·«전부 붙이기» 같은 엉터리 수리도 통과한다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = path.join(ROOT, 'cloudflare-deploy/public/admin/student.html');
const API = path.join(ROOT, 'cloudflare-deploy/src/api-admin.ts');

const html = fs.readFileSync(process.env.PICKER_HTML_SRC || HTML, 'utf8');
const api = fs.readFileSync(process.env.PICKER_API_SRC || API, 'utf8');

let pass = 0, fail = 0;
const check = (name, ok, extra) => {
  if (ok) { pass++; console.log('  OK   ' + name); }
  else { fail++; console.log('  ❌   ' + name + (extra ? '  — ' + extra : '')); }
};

/* ⛔ 길이로 자르지 않는다 — 함수가 조금만 자라면 정작 볼 부분이 창 밖으로 나가 거짓 통과한다.
   JS 선언에는 반환 타입이 없으니 «선언 뒤 첫 중괄호» 부터 짝만 맞추면 된다. */
function bodyAt(src, decl) {
  const i = src.indexOf(decl);
  if (i < 0) return '';
  const j = src.indexOf('{', i);
  if (j < 0) return '';
  let d = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  return '';
}

/* 부정 검사는 주석을 벗겨 낸 사본으로 — 「왜 이렇게 했는지」 적은 주석이 자기를 잡는다.
   ⛔ `//` 를 정규식으로 일괄 삭제하지 않는다(문자열 안 `https://` 가 잘린다). */
function strip(code) {
  let out = '', i = 0, inBlock = false, inLine = false, q = '';
  while (i < code.length) {
    const c = code[i], n = code[i + 1];
    if (inLine) { if (c === '\n') { inLine = false; out += c; } i++; continue; }
    if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i += 2; } else i++; continue; }
    if (q) { if (c === '\\') { out += c + (n || ''); i += 2; continue; } if (c === q) q = ''; out += c; i++; continue; }
    if (c === '/' && n === '*') { inBlock = true; i += 2; continue; }
    if (c === '/' && n === '/') { inLine = true; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') q = c;
    out += c; i++;
  }
  return out;
}

console.log('\n── ⓪ 전제 — 정본 블록을 실제로 오려 냈다 ──');
const SRC = {
  active: bodyAt(html, 'function nsTeacherActive('),
  build: bodyAt(html, 'function nsBuildTeacherOptions('),
  sync: bodyAt(html, 'function nsSyncTeacherOptions('),
  esc: bodyAt(html, 'function nsEsc('),
  picked: bodyAt(html, 'function nsPickedTeacher('),
  fallback: bodyAt(html, 'function nsFallbackToText('),
  load: bodyAt(html, 'function nsLoadTeachers('),
};
for (const [k, v] of Object.entries(SRC)) {
  check('전제 — ' + k + ' 를 잘라 냈다', v.length > 40, 'len=' + v.length);
}

/* ── ① 화면: «재직/퇴사» 를 갈라 그리는가 ─────────────────────────────── */
console.log('\n── ① 목록을 실제로 그려 본다 ──');
let build = null, active = null, picked = null;
try {
  const mk = new Function(SRC.esc + '\n' + SRC.active + '\n' + SRC.build +
    '\nreturn { build: nsBuildTeacherOptions, active: nsTeacherActive };');
  const m = mk();
  build = m.build; active = m.active;
} catch (e) {
  check('전제 — 목록 함수를 돌릴 수 있다', false, e.message);
}

// 운영 D1 에 실재하는 그 쌍(2026-09-22) + 경계값
const ROWS = [
  { id: 22, name: 'FAR', active: 1 },
  { id: 3, name: 'HT FARRAH', active: 0 },
  { id: 29, name: '강선생님', active: 1 },
  { id: 27, name: 'MAIMAI', active: null },   // ⚠️ NULL 은 «재직»
  { id: 31, name: '  ', active: 1 },          // 이름이 빈 행은 버린다
];

const grp = (out, label) => (out.match(new RegExp('<optgroup label="' + label + '[^"]*">([\\s\\S]*?)<\\/optgroup>')) || [, ''])[1];

if (build) {
  /* 🚪 기본(체크 안 함) — 퇴사는 «안 보인다». 2026-08-26 사고가 그 목록에서 죽은 행을 고른 것이다. */
  let off = '';
  try { off = build(ROWS, false); } catch (e) { check('목록을 그릴 수 있다', false, e.message); }
  const live = grp(off, '재직');

  check('재직 묶음에 FAR(22) 이 있다', /value="22"/.test(live), live.slice(0, 90));
  check('재직 묶음에 강선생님(29) 이 있다', /value="29"/.test(live));
  check('active 가 NULL 이면 재직이다 (MAIMAI 27)', /value="27"/.test(live));
  check('기본에서는 퇴사 강사가 안 나온다 (HT FARRAH 3)', !/value="3"/.test(off), off.slice(0, 120));
  check('이름이 빈 행은 안 그린다 (31)', !/value="31"/.test(off));
  check('«지정 안 함» 이 맨 앞에 있다', /^<option value="">/.test(off));
  check('값은 이름이 아니라 id 다', !/value="FAR"/.test(off));

  /* 🔴 짝 — «감춘다» 만 보면 «전부 감추기» 도 통과한다. 체크하면 «반드시» 나와야 한다.
        (서버에서 걸러 버리면 이 체크박스가 조용히 무동작이 된다 — 규칙서의 그 줄.) */
  let on = '';
  try { on = build(ROWS, true); } catch (e) { check('체크한 목록을 그릴 수 있다', false, e.message); }
  const gone = grp(on, '퇴사');
  check('[짝] 체크하면 퇴사 강사가 나온다 (HT FARRAH 3)', /value="3"/.test(gone), gone.slice(0, 90));
  check('[짝] 그때도 «(퇴사)» 로 표시된다', /\(퇴사\)/.test(gone));
  check('[짝] 퇴사 강사가 재직 묶음에 섞이지 않는다', !/value="3"/.test(grp(on, '재직')));
  check('[짝] 체크해도 재직은 그대로 있다', /value="22"/.test(grp(on, '재직')));

  // 짝 — 목록이 비면 묶음을 만들지 않는다(빈 optgroup 이 뜨지 않게)
  let empty = '';
  try { empty = build([], true); } catch (_) {}
  check('[짝] 강사가 0명이면 묶음을 안 만든다', !/optgroup/.test(empty), empty.slice(0, 80));
}

/* ── ①-2 체크박스 — 감춘 것을 «말해 주는가» · 다시 그려도 고른 값이 남는가 ── */
console.log('\n── ①-2 「퇴사 강사도 보기」 체크박스 ──');
if (SRC.sync.length > 40 && build) {
  /* 🔴 가짜 <select> 는 «진짜처럼» 굴어야 한다 — 평범한 객체로 두면 innerHTML 을 갈아도
        .value 가 그대로 남아, 「고른 값 보존」 검사가 «무엇을 지워도» 통과한다(실측). */
  const fakeSelect = (v) => {
    const o = { _html: '', _v: v || '', style: { display: '' } };
    Object.defineProperty(o, 'innerHTML', {
      get() { return o._html; },
      /* 진짜 <select> 는 options 를 갈아 끼우면 선택이 «맨 앞» 으로 돌아간다 — 늘 지운다. */
      set(h) { o._html = String(h); o._v = ''; },
    });
    Object.defineProperty(o, 'value', {
      get() { return o._v; },
      set(x) { const y = String(x == null ? '' : x); o._v = (o._html.indexOf('value="' + y + '"') >= 0 || y === '') ? y : ''; },
    });
    return o;
  };
  const mkSync = (rows, checked) => {
    const sel = fakeSelect('');
    const wrap = { style: { display: 'none' } };
    const lb = { textContent: '' };
    const fn = new Function('selEl', 'teacherRows', 'leftChkEl', 'leftWrapEl', 'leftLbEl',
      'nsBuildTeacherOptions', 'nsTeacherActive',
      SRC.sync + '\nnsSyncTeacherOptions(); return { sel: selEl, wrap: leftWrapEl, lb: leftLbEl };');
    return fn(sel, rows, { checked }, wrap, lb, build, active);
  };
  let r = null;
  try { r = mkSync(ROWS, false); } catch (e) { check('전제 — 동기화를 돌릴 수 있다', false, e.message); }
  if (r) {
    check('감춘 사람이 있으면 체크박스를 보여 준다', r.wrap.style.display === 'flex', r.wrap.style.display);
    check('감춘 «명 수» 를 말해 준다 (1명)', /\(1명\)/.test(r.lb.textContent), r.lb.textContent);
    check('기본에서는 퇴사가 안 그려진다', !/value="3"/.test(r.sel.innerHTML));
  }
  let r2 = null;
  try { r2 = mkSync(ROWS, true); } catch (_) {}
  if (r2) check('[짝] 체크하면 그려진다', /value="3"/.test(r2.sel.innerHTML));

  // 짝 — 퇴사가 0명이면 체크박스 자체를 안 보인다(잃는 정보가 없다)
  let r3 = null;
  try { r3 = mkSync(ROWS.filter(t => t.id !== 3), false); } catch (_) {}
  if (r3) check('[짝] 퇴사가 0명이면 체크박스를 안 보인다', r3.wrap.style.display === 'none', r3.wrap.style.display);

  // ⚠️ 다시 그리면 고른 값이 날아간다 — 되돌려 놓는가
  try {
    const sel = fakeSelect('');
    sel.innerHTML = '<option value="22">FAR</option>';
    sel.value = '22';
    check('전제 — 가짜 select 가 22 를 들고 있다', sel.value === '22', sel.value);
    const fn = new Function('selEl', 'teacherRows', 'leftChkEl', 'leftWrapEl', 'leftLbEl',
      'nsBuildTeacherOptions', 'nsTeacherActive',
      SRC.sync + '\nnsSyncTeacherOptions(); return selEl.value;');
    const v = fn(sel, ROWS, { checked: true }, { style: {} }, { textContent: '' }, build, active);
    check('다시 그려도 고른 값이 남는다 (22)', String(v) === '22', String(v));
  } catch (e) { check('고른 값 보존을 잴 수 있다', false, e.message); }
}

if (active) {
  check('active=1 → 재직', active({ active: 1 }) === true);
  check('active=0 → 퇴사', active({ active: 0 }) === false);
  check('active=null → 재직 (숨기는 쪽으로 실패하지 않는다)', active({ active: null }) === true);
  check('active 칸이 아예 없어도 재직', active({}) === true);
  check("active='' → 재직", active({ active: '' }) === true);
  check("[짝] active='0' 문자열은 퇴사", active({ active: '0' }) === false);
}

/* ── ② 고른 값이 «id» 로 나가는가 ─────────────────────────────────────── */
console.log('\n── ② 무엇을 보내는가 ──');
function runPicked(selDisplay, selValue, rows, txtValue) {
  const mk = new Function('selEl', 'txtEl', 'teacherRows',
    SRC.picked + '\nreturn nsPickedTeacher();');
  return mk(
    selDisplay === null ? null : { style: { display: selDisplay }, value: selValue },
    { value: txtValue },
    rows
  );
}
try {
  const a = runPicked('', '22', ROWS, '아무거나');
  check('드롭다운에서 고르면 id 를 보낸다', a.id === '22', JSON.stringify(a));
  check('그 이름도 함께 싣는다', a.name === 'FAR', JSON.stringify(a));
  // 🔴 이것이 이 작업의 전부다 — 이름으로 보내면 서버가 3(퇴사)을 붙인다.
  check('[핵심] 이름(FAR)을 보내지 않고 id 로 보낸다', a.id === '22' && a.id !== 'FAR');

  const b = runPicked('', '', ROWS, '아무거나');
  check('[짝] «지정 안 함» 이면 아무것도 안 보낸다', !b.id && !b.name, JSON.stringify(b));

  const c = runPicked('none', '22', ROWS, '강선생님');
  check('[짝] 폴백(텍스트) 중이면 id 를 안 보내고 친 이름을 보낸다',
    !c.id && c.name === '강선생님', JSON.stringify(c));

  const d = runPicked('', '999', ROWS, '');
  check('목록에 없는 id 라도 id 는 그대로 보낸다', d.id === '999' && d.name === '', JSON.stringify(d));
} catch (e) {
  check('전제 — nsPickedTeacher 를 돌릴 수 있다', false, e.message);
}

/* ── ③ 배선 — payload 가 그 함수를 «실제로» 쓰는가 ───────────────────── */
console.log('\n── ③ 배선 ──');
const submitBody = bodyAt(html, 'async function submit(force)');
check('전제 — submit() 을 잘라 냈다', submitBody.length > 200, 'len=' + submitBody.length);
const sClean = strip(submitBody);
check('submit 이 nsPickedTeacher() 를 부른다', /nsPickedTeacher\s*\(\s*\)/.test(sClean));
check('payload 가 teacher_id 를 싣는다', /teacher_id:\s*_nsT\.id/.test(sClean));
check('payload 가 teacher_name 을 함께 싣는다', /teacher_name:\s*_nsT\.name/.test(sClean));
/* ⛔ 옛 모양으로 되돌아가지 않았는가 — 「ns-teacher 칸의 글자를 그대로 보내기」 */
check('[짝] 옛 «텍스트 칸을 그대로 보내기» 로 되돌아가지 않았다',
  !/teacher_name:\s*\(\(document\.getElementById\('ns-teacher'\)/.test(sClean));
check('목록을 로드하는 호출이 있다', /nsLoadTeachers\s*\(\s*\)/.test(strip(html)));
/* 🚪 받은 목록을 «동기화» 로 그린다 — 그래야 체크박스 상태가 반영된다.
   ⛔ selEl.innerHTML = nsBuildTeacherOptions(rows) 로 되돌리면 체크박스가 무동작이 된다. */
check('받은 목록을 nsSyncTeacherOptions() 로 그린다', /nsSyncTeacherOptions\s*\(\s*\)/.test(strip(SRC.load)));
check('[짝] 체크박스 change 가 다시 그리게 배선돼 있다',
  /leftChkEl\.addEventListener\(\s*'change'\s*,\s*nsSyncTeacherOptions\s*\)/.test(strip(html)));

/* ── ④ 폴백 — 목록을 못 받으면 «되던 것» 으로 떨어지는가 ───────────── */
console.log('\n── ④ 폴백 ──');
try {
  const sel = { style: { display: '' }, innerHTML: '' };
  const txt = { style: { display: 'none' } };
  const lw = { style: { display: 'flex' } };
  let said = '';
  const mk = new Function('selEl', 'txtEl', 'leftWrapEl', 'say',
    SRC.fallback + '\nreturn nsFallbackToText;');
  mk(sel, txt, lw, (h) => { said = String(h); })('HTTP 403');
  check('목록을 못 받으면 드롭다운을 감춘다', sel.style.display === 'none');
  check('[짝] 그리고 옛 텍스트 칸이 다시 보인다', txt.style.display === '');
  check('[짝] 체크박스도 함께 감춘다 (고를 것이 없다)', lw.style.display === 'none', lw.style.display);
  check('[짝] 왜 그런지 화면이 말한다', /강사 목록/.test(said) && /403/.test(said), said.slice(0, 80));
} catch (e) {
  check('전제 — nsFallbackToText 를 돌릴 수 있다', false, e.message);
}
const lClean = strip(SRC.load);
/* 규칙서: 404 본문은 {error:'Not Found'} 라 ok 칸이 없다 — `j.ok === false` 만 보면 그냥 통과한다. */
check('«성공이라고 말했는가» 로 가른다 (j.ok === true)', /j\.ok\s*!==\s*true/.test(lClean));
check('HTTP 상태도 함께 본다 (r.ok)', /\.r\.ok|res\.r\.ok/.test(lClean));
check('통신 오류도 폴백으로 간다 (catch)', /catch\s*\(/.test(lClean) && /nsFallbackToText/.test(lClean));
check('퇴사까지 받으려고 include_inactive=1 로 부른다', /include_inactive=1/.test(lClean));

/* ── ⑤ 서버 — id 로 고른 강사가 «그대로» 붙는가 (진짜 SQLite) ───────── */
console.log('\n── ⑤ 서버 SQL 을 진짜 SQLite 에 돌린다 ──');
const db = new DatabaseSync(':memory:');
db.exec('CREATE TABLE teachers (id INTEGER PRIMARY KEY, name TEXT, active INTEGER)');
// 운영 D1 에 실재하는 그 쌍 — 순서도 운영과 같게(id 3 이 먼저 스캔된다)
for (const r of [[3, 'HT FARRAH', 0], [22, 'FAR', 1], [29, '강선생님', 1]]) {
  db.prepare('INSERT INTO teachers (id,name,active) VALUES (?,?,?)').run(r[0], r[1], r[2]);
}

// 소스에서 SQL 을 «오려 낸다» — 하니스에 베껴 적으면 자기가 적은 상수를 검사하게 된다.
const teacherBlock = api.slice(
  api.indexOf("let teacherId = String(body.teacher_id || '').trim();"),
  api.indexOf('// ── 시간 ──', api.indexOf("let teacherId = String(body.teacher_id || '').trim();"))
);
check('전제 — 서버 강사 매칭 블록을 잘라 냈다', teacherBlock.length > 200, 'len=' + teacherBlock.length);

const byId = (teacherBlock.match(/`(SELECT name FROM teachers WHERE id = \?[^`]*)`/) || [])[1];
const byName = (teacherBlock.match(/`(SELECT id, name FROM teachers WHERE name = \?[^`]*)`/) || [])[1];
check('id 로 이름을 되찾는 질의가 있다', !!byId, String(byId));
check('이름으로 찾는 폴백 질의는 그대로 남아 있다', !!byName, String(byName));

if (byId) {
  const got = db.prepare(byId).get('22');
  check('[핵심] id 22 로 물으면 FAR 이 나온다', got && got.name === 'FAR', JSON.stringify(got));
  const g3 = db.prepare(byId).get('3');
  check('[짝] id 3 으로 물으면 HT FARRAH 가 나온다', g3 && g3.name === 'HT FARRAH', JSON.stringify(g3));
  const g9 = db.prepare(byId).get('999');
  check('[짝] 없는 id 는 아무것도 안 준다 (지어내지 않는다)', !g9, JSON.stringify(g9));
}
if (byName) {
  /* 🔴 대조 — 옛 «이름으로 보내기» 경로는 실제로 남의 강사를 붙인다.
     이 줄이 초록이라는 것은 「드롭다운이 필요한 이유」가 아직 사실이라는 뜻이다.
     ⛔ 이 검사를 「그러니 고쳐라」로 읽지 말 것 — 자유 입력 폴백은 일부러 남겨 둔 경로다. */
  const wrong = db.prepare(byName).get('FAR', '%FAR%');
  check('[대조] 이름 「FAR」로 찾으면 여전히 HT FARRAH(3) 가 붙는다',
    wrong && String(wrong.id) === '3', JSON.stringify(wrong));
}

// 구조 — teacher_id 가 있으면 «부분일치» 를 안 탄다
const tClean = strip(teacherBlock);
check('teacher_id 가 있으면 id 갈래로 간다', /if\s*\(\s*teacherId\s*\)/.test(tClean), tClean.slice(0, 60));
check('이름 갈래는 else 로 밀려났다 (teacher_id 와 동시에 안 돈다)', /}\s*else if\s*\(\s*tRaw\s*\)/.test(tClean));
/* ⛔ 못 읽었을 때 화면이 보낸 이름으로 떨어뜨리면, 화면 글자로 «막는» 검사를 돌리게 된다. */
check('[짝] id 를 못 읽으면 body 의 이름으로 떨어뜨리지 않는다',
  !/teacherName\s*=\s*tRaw/.test(tClean));
/* «항상 참/거짓» 인 죽은 조건이 없는가 — if (false) 한 글자로 무력화되는 것을 막는다 */
/* ⚠️ 앞자리만 보면 `if (teacherId && false)` 를 놓친다 — 괄호 «안» 어디에 있어도 잡는다. */
check('[짝] 죽은 조건(항상 참/거짓)이 없다',
  !/if\s*\([^)]*\b(false|true)\b[^)]*\)/.test(tClean), tClean.slice(0, 60));

/* ── ⑥ 서버 블록을 «실제로» 돌린다 ───────────────────────────────────
   🔴 ⑤ 는 «질의가 있는가» 까지만 본다 — 그 결과를 teacherName 에 «안 받아 쓰면»
      휴가 충돌 검사가 통째로 죽는데 ⑤ 는 전부 초록이다(변이 Ⓛ 로 실측).
   ✅ 그래서 블록을 오려 내 «가짜 env.DB» 로 돌려 «무슨 값이 남는가» 를 답으로 묻는다. */
console.log('\n── ⑥ 서버 블록을 실제로 돌려 본다 ──');
async function runServerBlock(body) {
  const js = teacherBlock
    .replace(/:\s*string\s*\|\s*null/g, '')
    .replace(/\.first<any>\(\)/g, '.first()')
    .replace(/<any>/g, '');
  const fakeEnv = {
    DB: {
      prepare(sql) {
        return {
          bind(...args) {
            return { async first() { return db.prepare(sql).get(...args) || null; } };
          },
        };
      },
    },
  };
  const fn = new Function('env', 'body', 'return (async () => {\n' + js +
    '\nreturn { teacherId, teacherName, teacherMatched };\n})();');
  return fn(fakeEnv, body);
}
try {
  const r1 = await runServerBlock({ teacher_id: '22', teacher_name: 'FAR' });
  check('[핵심] id 22 를 보내면 그대로 22 가 붙는다', r1.teacherId === '22', JSON.stringify(r1));
  check('[핵심] 그 이름을 id 로 «받아서» 채운다 (휴가 검사가 산다)',
    r1.teacherName === 'FAR', JSON.stringify(r1));

  const r2 = await runServerBlock({ teacher_name: 'FAR' });
  check('[대조] 이름만 보내던 옛 경로는 여전히 HT FARRAH(3) 를 붙인다',
    r2.teacherId === '3', JSON.stringify(r2));

  const r3 = await runServerBlock({ teacher_id: '999', teacher_name: '아무개' });
  check('[짝] 없는 id 면 이름을 지어내지 않는다', r3.teacherName === null, JSON.stringify(r3));
  check('[짝] 그래도 보낸 id 는 버리지 않는다', r3.teacherId === '999', JSON.stringify(r3));

  const r4 = await runServerBlock({});
  check('[짝] 아무것도 안 보내면 강사가 안 붙는다',
    !r4.teacherId && r4.teacherName === null && r4.teacherMatched === false, JSON.stringify(r4));
} catch (e) {
  check('전제 — 서버 블록을 돌릴 수 있다', false, e.message);
}

console.log('\n결과: PASS ' + pass + ' / FAIL ' + fail + '\n');
if (fail) process.exit(1);
