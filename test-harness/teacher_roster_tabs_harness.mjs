// -*- coding: utf-8 -*-
// 🗂 강사 명부 Active / Inactive / 전체 탭 (2026-11-11 직원 요청 «LMS 처럼 따로 보게»)
//   탭 판정·건수·드롭다운과의 관계를 adm-core.js 에서 «오려 내 실제로 돌려» 본다.
//   + 배선: 캐시를 «거르기 전» 에 채우는가 · 실제로 거르는가 · 상태 변경이 건수를 갱신하는가.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
const js = readFileSync(join(PUB, 'js', 'adm-core.js'), 'utf8');
const html = readFileSync(join(PUB, 'admin.html'), 'utf8');

let pass = 0, fail = 0;
const check = (n, ok, extra) => { if (ok) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (extra ? '  → ' + extra : '')); } };

/** start 문자열부터 중괄호 짝이 닫히는 곳까지 */
function block(src, start) {
  const i = src.indexOf(start);
  if (i < 0) return '';
  let d = 0, j = src.indexOf('{', i);
  for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}' && --d === 0) break; }
  return src.slice(i, j + 1);
}

console.log('\n① 화면 — 탭 세 개, 글자는 span 에만(i18n 이 버튼 textContent 를 갈아끼우면 건수 칸이 사라진다)');
const tabs = block(html, '<div id="tp-tabs"').length ? html.slice(html.indexOf('<div id="tp-tabs"'), html.indexOf('</div>', html.indexOf('<div id="tp-tabs"'))) : '';
check('#tp-tabs 가 있다', !!tabs);
for (const t of ['active', 'inactive', 'all']) {
  const m = tabs.match(new RegExp('<button[^>]*data-tab="' + t + '"[^>]*>([\\s\\S]*?)</button>'));
  check(`탭 ${t} 버튼`, !!m);
  check(`탭 ${t} — 버튼 자신에는 data-ko 가 없다`, m && !/<button[^>]*data-ko=/.test(m[0]));
  check(`탭 ${t} — 라벨 span(data-ko/data-en) + 건수 칸`, m && /<span data-ko="[^"]+" data-en="[^"]+">/.test(m[1]) && /class="tp-tab-n"/.test(m[1]));
}
check('탭 CSS 는 ID 접두로 전역 인디고 알약을 이긴다', /#tp-tabs button\.tp-tab\{[^}]*background:[^;]*!important/.test(html));
check('hover 에 transform 이 없다(1-3)', !/#tp-tabs button\.tp-tab:hover\{[^}]*transform:(?!none)/.test(html));

console.log('\n② 판정·건수 — 오려 내 실제로 돌린다');
const src = [
  block(js, 'function _tpIsWorking('),
  "var TP_STATUS_HIDDEN_FILTER = '__hidden__';",
  js.match(/var _tpTab = '[a-z]+';/)?.[0] || '',
  block(js, 'function _tpTabKeep('),
  block(js, 'function _tpTabSync('),
  block(js, 'window.tpSetTab = function'),
].join('\n');
check('네 조각을 모두 찾았다', !/\n\n/.test(src) && src.includes('_tpTabSync') && src.includes('tpSetTab'));

function mkBtn(tab) {
  const cls = new Set(), attrs = {}, n = { textContent: '—' };
  return { tab, cls, attrs, n,
    getAttribute: k => (k === 'data-tab' ? tab : attrs[k]),
    setAttribute: (k, v) => { attrs[k] = v; },
    classList: { contains: c => cls.has(c), toggle: (c, on) => { on ? cls.add(c) : cls.delete(c); } },
    querySelector: () => n };
}
function run(rows, sel) {
  const btns = ['active', 'inactive', 'all'].map(mkBtn);
  let loads = 0;
  const window = { _tpRowById: {} };
  rows.forEach((s, i) => { window._tpRowById[i + 1] = { id: i + 1, status: s }; });
  const document = {
    querySelectorAll: q => (q === '#tp-tabs .tp-tab' ? btns : []),
    getElementById: id => (id === 'tp-filter-status' ? sel : null),
  };
  const api = new Function('window', 'document', 'loadTeacherProfiles',
    src + '\nreturn { keep: _tpTabKeep, sync: _tpTabSync, set: window.tpSetTab, tab: () => _tpTab, setTab: v => { _tpTab = v; } };'
  )(window, document, () => { loads++; });
  return { api, btns, window, loads: () => loads };
}

const ROWS = ['활동중', '퇴사', '비활동', null, '재직', '', 'resigned'];   // 활동 4(활동중·null·재직·빈칸) · 비활동 3
const r = run(ROWS, { value: '' });
check('기본 탭은 Active', r.api.tab() === 'active');
r.api.sync();
const cnt = Object.fromEntries(r.btns.map(b => [b.tab, b.n.textContent]));
check('건수 — Active 4 · Inactive 3 · 전체 7', cnt.active === '4' && cnt.inactive === '3' && cnt.all === '7', JSON.stringify(cnt));
check('켜진 탭만 tp-tab-on + aria-selected', r.btns.every(b => b.cls.has('tp-tab-on') === (b.tab === 'active') && b.attrs['aria-selected'] === String(b.tab === 'active')));
const rows = Object.values(r.window._tpRowById);
const kept = () => rows.filter(r.api.keep).map(x => x.status);
check('Active 탭은 활동중만 남긴다(NULL·빈칸·옛 별칭 «재직» 포함)', JSON.stringify(kept()) === JSON.stringify(['활동중', null, '재직', '']), JSON.stringify(kept()));
r.api.setTab('inactive');
check('Inactive 탭은 비활동·퇴사만 남긴다(옛 별칭 resigned 포함)', JSON.stringify(kept()) === JSON.stringify(['퇴사', '비활동', 'resigned']), JSON.stringify(kept()));
r.api.setTab('all');
check('전체 탭은 다 남긴다', kept().length === ROWS.length);

console.log('\n③ 탭 누르기 — 드롭다운의 상태 값은 비우고(겹치면 0명) 🙈 안보임은 그대로');
const s1 = { value: '퇴사' }, a = run(ROWS, s1);
a.api.set('inactive');
check('상태 값이 비워진다', s1.value === '');
check('탭이 바뀌고 목록을 다시 읽는다', a.api.tab() === 'inactive' && a.loads() === 1);
const s2 = { value: '__hidden__' }, b = run(ROWS, s2);
b.api.set('active');
check('🙈 안보임(다른 축)은 그대로 둔다', s2.value === '__hidden__');
b.api.set('bogus');
check('모르는 값은 Active 로', b.api.tab() === 'active');

console.log('\n④ 배선 — loadTeacherProfiles · _tpStRepaint');
const load = block(js, 'async function loadTeacherProfiles(');
const iCache = load.indexOf('window._tpRowById = {}'), iFilter = load.indexOf('items.filter(_tpTabKeep)');
check('목록이 실제로 탭으로 걸러진다', iFilter > 0);
check('캐시를 «거르기 전» 에 채운다(건수·다른 탭 되돌리기)', iCache > 0 && iCache < iFilter);
check('캐시는 한 번만 비운다(거른 뒤 다시 비우면 건수가 탭 안만 셈)', load.split('window._tpRowById = {}').length === 2);
check('거르기 전에 탭 건수를 그린다', (() => { const k = load.indexOf('_tpTabSync()'); return k > iCache && k < iFilter; })());
check('드롭다운으로 상태를 고르면 탭이 «전체» 로', /if \(status && status !== TP_STATUS_HIDDEN_FILTER\) _tpTab = 'all';/.test(load));
check('상태를 그 자리에서 바꾸면 건수도 갱신', block(js, 'function _tpStRepaint(').includes('_tpTabSync()'));

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
