// 🔁 관리자 「오늘 수업」 — 새로고침해도 날짜·학원·강사가 남는가 (2026-11-10 매니저 제안)
//   js/adm-today-classes.js 의 tcView* 블록을 «오려 내 가짜 DOM 으로 실제로 돌린다» (글자 검사 아님).
//   짝: «보고 있었으면 되돌린다» ↔ «안 보고 있었으면 끌고 가지 않는다» · «지난 날짜는 적는다» ↔ «오늘은 안 적는다»
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'cloudflare-deploy', 'public');
const SRC = readFileSync(join(ROOT, 'js', 'adm-today-classes.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) pass++; else { fail++; console.log('  FAIL ' + name); } };

const from = SRC.indexOf("var TC_VIEW_KEY");
const to = SRC.indexOf("function bind()", from);
ok('tcView 블록을 잘라 냈다(전제)', from > 0 && to > from);
const BLOCK = SRC.slice(from, to);
const TODAY = '2026-11-10';

/** 가짜 화면 한 벌 — el: {id: {...}} · store: sessionStorage 내용 */
function world(el, store, hasSidebar) {
  const went = [];
  const env = {
    $: (id) => el[id] || null,
    pickVal: (id) => (el[id] ? String(el[id].value || '') : ''),
    kstTodayStr: () => TODAY,
    esc: (s) => String(s),
    sessionStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } },
    window: { ph161Go: (c, s) => went.push(c + '>' + s) },
    document: { querySelector: () => (hasSidebar ? {} : null) },
    setTimeout: () => {},   // 다시 보기는 돌리지 않는다(사이드바 없으면 «안 간다» 만 본다)
  };
  const fn = new Function(...Object.keys(env), BLOCK + '\nreturn { snap: tcViewSnap, save: tcViewSave, restore: tcViewRestore };');
  return { api: fn(...Object.values(env)), went, store };
}
const dom = (o) => ({
  'sm-today-classes': { open: o.open, offsetParent: o.vis ? {} : null },
  'tc-date': { value: o.date || '' },
  'tc-academy': { value: o.a || '', innerHTML: '' },
  'tc-teacher': { value: o.t || '', innerHTML: '' },
});

// ① 적기
let w = world(dom({ open: true, vis: true, date: '2026-11-09', t: 'Teacher Kaye' }), {}, true);
w.api.save();
let v = JSON.parse(w.store.adm_tc_view_v1);
ok('보고 있었으면 on·날짜·강사를 적는다', v.on === true && v.d === '2026-11-09' && v.t === 'Teacher Kaye');
ok('오늘 날짜는 적지 않는다(내일 어제에 안 갇힘)', world(dom({ open: true, vis: true, date: TODAY }), {}, true).api.snap().d === '');
ok('다른 메뉴에 가 있었으면(안 보임) on=false', world(dom({ open: true, vis: false }), {}, true).api.snap().on === false);
ok('접혀 있었으면 on=false', world(dom({ open: false, vis: true }), {}, true).api.snap().on === false);

// ② 되돌리기
const saved = JSON.stringify({ on: true, d: '2026-11-09', a: 'UMC', t: 'Teacher Kaye' });
let el = dom({});
w = world(el, { adm_tc_view_v1: saved }, true);
w.api.restore();
ok('날짜·학원·강사를 다시 앉힌다', el['tc-date'].value === '2026-11-09' && el['tc-academy'].value === 'UMC' && el['tc-teacher'].value === 'Teacher Kaye');
ok('오늘 수업 칸을 다시 연다', w.went.join() === 'card-students-mgmt>sm-today-classes');

el = dom({});
w = world(el, { adm_tc_view_v1: JSON.stringify({ on: false, d: '2026-11-09', t: 'Teacher Kaye' }) }, true);
w.api.restore();
ok('안 보고 있었으면 아무것도 안 건드린다(짝)', w.went.length === 0 && el['tc-date'].value === '' && el['tc-teacher'].value === '');

el = dom({});
w = world(el, { adm_tc_view_v1: JSON.stringify({ on: true, d: TODAY, t: '' }) }, true);
w.api.restore();
ok('저장된 날짜가 오늘이면 날짜 칸은 비워 둔다', el['tc-date'].value === '' && w.went.length === 1);

w = world(dom({}), { adm_tc_view_v1: '{깨진 값' }, true);
let threw = false; try { w.api.restore(); } catch (e) { threw = true; }
ok('깨진 저장값에도 던지지 않고 처음 화면', !threw && w.went.length === 0);

w = world(dom({}), { adm_tc_view_v1: saved }, false);
w.api.restore();
ok('사이드바가 아직 없으면 억지로 열지 않는다', w.went.length === 0);

ok('bind 가 되돌리기·떠날 때 적기를 건다', /tcViewRestore\(\);\s*window\.addEventListener\('pagehide', tcViewSave\)/.test(SRC));
ok('admin.html ?v= 를 올렸다', +((readFileSync(join(ROOT, 'admin.html'), 'utf8').match(/\/js\/adm-today-classes\.js\?v=(\d+)/) || [])[1] || 0) >= 67);

console.log(`결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
