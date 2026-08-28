// portrait_textbook_top_harness.mjs — 세로 «교재를 위로» 학생 전용 옵션 (2026-08-28)
//
// ── 왜 ──────────────────────────────────────────────────────────────────────
// 사장님 지시 「휴대폰 세로에서 얼굴과 교재의 자리를 바꾸는 옵션을 ☰ 기능 메뉴에.
// 강사는 되었고 학생만 켜게」. 배치를 바꾸는 일이라 조용히 어긋날 자리가 많다:
//   · 순서(order)의 기본값은 «DOM 순서» 가 아니라 0 이다 → 한쪽만 주면 아무 일도 안 일어난다
//   · 얼굴이 아래로 내려오면 하단 독(#vc-dock)이 학생 얼굴을 덮는다 (지금은 교재 여백을 덮어 티가 안 났다)
//   · 세로에는 «떠 있는» 모드(pip·facepip·full·solo·free)가 있고 거기엔 위아래가 없다
//   · 「학생만」을 vcMyRole 하나로 판정하면 jeong(사장님)처럼 admin 으로 굳는 계정이 샌다
//
// ⚠️ 문자열 검사만으로는 이 중 어느 것도 못 잡는다 — 함수도 값도 전부 «있는» 채로
//    «어느 쪽에 걸리는가»·«몇 px 인가» 만 틀린다(CLAUDE.md 2장의 반복 실측).
//    그래서 이 하니스는 ⑬절 IIFE 를 **소스에서 오려 내 실제로 실행**한다.
//
// ⚠️ 화면에 «그려진 결과»(정말 교재가 위로 갔는가·독이 얼굴을 덮지 않는가)는 여기서 볼 수 없다.
//    그건 사람이 부르는 브라우저 검사다:
//      PW_DIR=/tmp/pw node test-harness/manual/portrait-textbook-top-browser.mjs
//
// 실행: node test-harness/portrait_textbook_top_harness.mjs

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dir = dirname(fileURLToPath(import.meta.url));
const PUB = join(__dir, '../cloudflare-deploy/public');
const CODE = readFileSync(join(PUB, 'js', 'idx-vc-mobilefix.js'), 'utf8');
const HTML = readFileSync(join(PUB, 'index.html'), 'utf8');

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? '  — ' + detail : ''}`); }
};

console.log('\n📖 세로 «교재를 위로» (학생 전용) — 검사\n');

/* ── ⑬절만 오려 낸다 ──────────────────────────────────────────────────────
   ⚠️ 길이(slice(i, i+N))로 자르지 않는다 — 옆 절이 딸려 들어와 거짓 FAIL 이 난다.
      중괄호 짝을 세어 «구조» 로 자른다(CLAUDE.md 2장). 잘라 내기에 실패하면
      통과시키지 않는다 — 검사가 꺼진 채로 초록불이 되면 아무것도 못 지킨다. */
function cutIife(src, marker) {
  const i = src.indexOf(marker);
  if (i < 0) return '';
  let d = 0, started = false;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '{') { d++; started = true; }
    else if (c === '}') { d--; if (started && d === 0) return src.slice(i, j + 1) + ')();'; }
  }
  return '';
}
const SEC = cutIife(CODE, '(function tbTopOption() {');
if (!SEC) {
  console.log('🚨 ⑬절(tbTopOption)을 오려 내지 못했습니다 — 검사를 통과시키지 않습니다.');
  console.log('   (함수 이름을 바꿨다면 이 하니스의 표식도 함께 고치세요)');
  process.exit(1);
}

/* ── 실행용 스텁 — ⑬절을 진짜로 돌려 본다 ────────────────────────────────
   ⚠️ CSS 도 «소스에 그 글자가 있는가» 로 보지 않는다. 이 절의 선택자는 문자열을
      이어 붙여 만들기 때문에 소스에는 통째로 안 나온다 — 실제로 돌려서 «만들어진
      CSS» 를 읽는다(첫 판에 그것 때문에 멀쩡한 코드가 FAIL 났다). */
function makeEl(id) {
  const cls = new Set();
  const el = {
    id: id || '', tagName: 'DIV', textContent: '', title: '', type: '',
    attrs: {}, children: [], _removed: false,
    classList: {
      contains: c => cls.has(c), add: c => cls.add(c), remove: c => cls.delete(c), _set: cls,
    },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    addEventListener(t, fn) { (this._on || (this._on = {}))[t] = fn; },
    appendChild(c) { this.children.push(c); if (c.id) REG[c.id] = c; return c; },
    remove() { this._removed = true; if (this.id) delete REG[this.id]; },
    getBoundingClientRect() { return this._rect || { top: 0, height: 0 }; },
    style: { setProperty(k, v) { VARS[k] = v; }, },
  };
  if (id) REG[id] = el;
  return el;
}
let REG = {}, VARS = {}, LS = {};

function boot(opts) {
  opts = opts || {};
  REG = {}; VARS = {}; LS = Object.assign({}, opts.store || {});
  const body = makeEl('');
  const row = makeEl('vc-main-row');
  (opts.rowClasses || ['video-half']).forEach(c => row.classList.add(c));
  const tabbar = makeEl('');
  /* 화면 아래에 떠 있는 것들 — 폰에서 실제로 얼굴을 덮는 것은 ☰ 기능 버튼과 ⋯ 다
     (독은 ⋯ 뒤에 접혀 display:none). 검사에서도 그 셋을 따로 세운다. */
  const dock = makeEl('vc-dock');
  dock._rect = opts.dockRect || { top: 0, height: 0 };          // 기본은 «접힘»
  const more = makeEl('vc-dock-more');
  more._rect = opts.moreRect || { top: 0, height: 0 };
  const fab = makeEl('');
  fab._rect = opts.fabRect || { top: 0, height: 0 };
  const win = {
    innerHeight: opts.innerHeight || 844,
    vcMyRole: opts.role || 'student',
    getLang: () => opts.lang || 'ko',
    addEventListener() {},
    closePheroMenu() { win._menuClosed = true; },
    vcScreenSet(m) { win._screenSet = m; row.classList._set.clear(); row.classList.add('video-' + m); },
  };
  if (opts.vcIsStaffNow !== undefined) win.vcIsStaffNow = opts.vcIsStaffNow;
  const doc = {
    readyState: 'complete', body, documentElement: makeEl(''),
    addEventListener() {},
    createElement: () => makeEl(''),
    getElementById: id => (id === 'vc-dock' ? (opts.noDock ? null : dock) : (REG[id] || null)),
    querySelector: s => {
      if (s.indexOf('tab-bar') >= 0) return opts.noTabBar ? null : tabbar;
      if (s === '#vc-dock') return opts.noDock ? null : dock;
      if (s === '#vc-dock-more') return more;
      if (s === '.vc-phero-ctrl') return fab;
      return null;
    },
  };
  body.classList.add('vc-in-call');
  (opts.bodyClasses || []).forEach(c => body.classList.add(c));
  const ctx = vm.createContext({
    window: win, document: doc,
    localStorage: {
      getItem: k => (k in LS ? LS[k] : null),
      setItem: (k, v) => { LS[k] = String(v); },
      removeItem: k => { delete LS[k]; },
    },
    mgRemoteTeacherPresent: opts.remoteTeacher === undefined ? undefined
      : () => !!opts.remoteTeacher,
    setTimeout, clearTimeout, setInterval, clearInterval, console, Math,
  });
  ctx.globalThis = ctx;
  let ran = true, err = '';
  try { vm.runInContext(SEC, ctx, { timeout: 3000 }); } catch (e) { ran = false; err = e.message; }
  return { ran, err, win, doc, body, row, tabbar, dock };
}


/* 한 번 돌려 «실제로 붙는» CSS 를 얻는다 */
const GEN = boot({});
const GENCSS = (GEN.doc.getElementById('mg-tbtop-css') || { textContent: '' }).textContent;
if (!GENCSS) { console.log('🚨 ⑬절이 CSS 를 붙이지 못했습니다 — 검사를 통과시키지 않습니다.'); process.exit(1); }

/* ══════════════════════════════════════════════════════════════════════════
   ① 첫 화면 예산 — 이 기능은 defer 파일 안에서 끝나야 한다
   ══════════════════════════════════════════════════════════════════════════ */
const tag = (HTML.match(/<script[^>]*idx-vc-mobilefix\.js[^>]*>/) || [''])[0];
check('① index.html 에 defer 로 붙어 있다 (blocking 이 되면 첫 화면 예산을 먹는다)',
  /\bdefer\b/.test(tag), tag || '태그 없음');
check('① 파일을 고쳤으면 ?v= 도 올라가 있다 (asset_version 하니스와 짝)',
  /idx-vc-mobilefix\.js\?v=\d+/.test(tag), tag);
check('① index.html 안에 ⑬절 코드가 새로 들어가지 않았다 (공동 금지구역)',
  !/mg-tb-top/.test(HTML) && !/mg-tbtop-btn/.test(HTML),
  'index.html 은 ?v= 한 글자만 바뀌어야 한다');

/* ══════════════════════════════════════════════════════════════════════════
   ② 2026-07-14 결정을 지웠는가 — «위 얼굴 / 아래 교재» 는 손대면 안 된다
   ══════════════════════════════════════════════════════════════════════════ */
check('② index.html 의 2026-07-14 세로 기본 배치 주석이 그대로 있다',
  /2026-07-14\)? 사장님 요청 세로폰 기본 배치/.test(HTML));
check('② 그 규칙의 얼굴 칸 상한(32vh)이 그대로다',
  /max-height:\s*32vh\s*!important/.test(HTML));
check('② 「기본(half)」 의 얼굴 칸 높이(48vh)가 그대로다',
  /height:\s*48vh\s*!important/.test(HTML));

/* 🔴 index.html 17472행(2026-07-28)이 같은 두 칸의 order 를 «id 두 개» 로 못 박고,
   세로에서는 다시 «얼굴=1 / 교재=2» 로 되돌린다. 우리 규칙이 클래스 선택자면 진다 —
   첫 판에 실제로 밟았고 브라우저 실측으로만 보였다. 그 전제가 사라지면 여기가 FAIL 해야 한다. */
check('② index.html 이 세로에서 얼굴=1·교재=2 로 되돌리는 규칙이 그대로 있다 (우리가 이겨야 할 상대)',
  /#vc-main-row > #vc-content-pane \{ order: 2 !important; \}/.test(HTML) &&
  /#vc-main-row > #vc-video-pane \{\s*order: 1 !important;/.test(HTML));
check('② 그래서 ⑬절도 id 를 두 개 쓴다 (클래스만으로는 못 이긴다)',
  /#vc-main-row[^{]*> #vc-content-pane\{order:1/.test(GENCSS) &&
  /#vc-main-row[^{]*> #vc-video-pane\{order:2/.test(GENCSS),
  GENCSS.slice(0, 200));
check('② 빈자리를 padding 으로 둔다 — 교재 칸의 바깥 크기를 건드리지 않는다',
  /padding-bottom:var\(--mg-tb-gap/.test(GENCSS) && !/margin-bottom:var\(--mg-tb-gap/.test(GENCSS));
check('② 얼굴 칸 높이를 직접 계산하지 않는다 (index.html 의 32vh·48vh 와 어긋날 자리를 안 만든다)',
  !/calc\([0-9]+vh/.test(GENCSS));

/* ══════════════════════════════════════════════════════════════════════════
   ③ order 는 «두 칸 다» 명시해야 한다 — 기본값이 0 이라 한쪽만 주면 안 먹는다
   ══════════════════════════════════════════════════════════════════════════ */
check('③ 교재 칸에 order 를 명시한다', /#vc-content-pane\{order:1 !important\}/.test(GENCSS));
check('③ 얼굴 칸에도 order 를 명시한다 (한쪽만 주면 기본 0 이라 안 바뀐다)',
  /#vc-video-pane\{[^}]*order:2 !important/.test(GENCSS));

/* ══════════════════════════════════════════════════════════════════════════
   ④ 세로에서만 — PC·가로에 닿으면 안 된다
   ══════════════════════════════════════════════════════════════════════════ */
check('④ 미디어쿼리로 세로에만 건다', /@media \(max-width:900px\) and \(orientation:portrait\)/.test(GENCSS));
check('④ 900px 이다 (2단으로 쌓는 규칙이 사는 미디어쿼리와 같은 폭)',
  !/max-width:920px/.test(GENCSS));
check('④ 통화 중에만 건다 (body.vc-in-call)', /body\.vc-in-call\.mg-tb-top/.test(GENCSS));
/* ⚠️ 「order:」 를 그냥 세면 «border:» 안의 order 까지 걸린다 — 첫 판에 실제로 밟았다.
   여는 중괄호·세미콜론 바로 뒤의 것만 «진짜 order 선언» 이다. */
const orderDecls = (GENCSS.match(/[;{]order:/g) || []).length;
check('④ 배치 규칙이 «전부» 통화 중 + 세로 조건 안에 있다',
  orderDecls === 2 &&
  GENCSS.split(/[;{]order:/).slice(0, -1).every(seg => /body\.vc-in-call\.mg-tb-top/.test(seg)),
  'order 선언 ' + orderDecls + '개');

/* ══════════════════════════════════════════════════════════════════════════
   ⑤ 떠 있는 모드 제외 — CSS 목록과 JS 목록이 «같은 말» 을 해야 한다
   ══════════════════════════════════════════════════════════════════════════ */
const cssNot = (GENCSS.match(/:not\(\.video-[a-z]+\)/g) || []).map(s => s.replace(/:not\(\.|\)/g, ''));
const jsList = (SEC.match(/var FLOATING = \[([^\]]*)\]/) || ['', ''])[1]
  .split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean);
const uniqCss = [...new Set(cssNot)].sort().join(',');
check('⑤ 떠 있는 모드 목록이 CSS 와 JS 에서 일치한다',
  uniqCss === [...jsList].sort().join(',') && jsList.length === 5,
  'CSS[' + uniqCss + '] · JS[' + jsList.sort().join(',') + ']');
['video-pip', 'video-facepip', 'video-full', 'video-solo', 'video-free'].forEach(m => {
  check('⑤ ' + m + ' 는 제외된다 (위아래 개념이 없는 모드)', jsList.indexOf(m) >= 0);
});

/* ══════════════════════════════════════════════════════════════════════════
   ⑥ 겹침 — 독 높이를 «재서» 넣는가
   ══════════════════════════════════════════════════════════════════════════ */
check('⑥ 얼굴 칸 아래에 빈자리를 둔다 (하단 독이 얼굴을 덮지 않게)',
  /padding-bottom:var\(--mg-tb-gap/.test(GENCSS));
check('⑥ 그 크기를 하드코딩하지 않고 «화면 아래에 떠 있는 것들» 을 실제로 잰다',
  /BOTTOM_FURNITURE/.test(SEC) && /getBoundingClientRect/.test(SEC));
check('⑥ #vc-dock 하나만 재지 않는다 (폰에서 독은 ⋯ 뒤에 접혀 있어 0px 이다)',
  /'#vc-dock-more'/.test(SEC) && /'\.vc-phero-ctrl'/.test(SEC));
check('⑥ 못 재도 화면이 깨지지 않게 기본값이 있다', /var\(--mg-tb-gap,\s*76px\)/.test(GENCSS));

/* ══════════════════════════════════════════════════════════════════════════
   ⑦ CLAUDE.md 금지 두 건
   ══════════════════════════════════════════════════════════════════════════ */
check('⑦ body class 를 MutationObserver 로 지켜보지 않는다 (홈 전체를 멎게 한 전력)',
  !/MutationObserver/.test(SEC));
check('⑦ 상주 타이머를 남기지 않는다 (setInterval 은 입장 직후 끝이 있는 확인 하나뿐)',
  (SEC.match(/setInterval\s*\(/g) || []).length === 1 && /clearInterval\(iv\)/.test(SEC));
check('⑦ 있을 때만 지우고 없을 때만 더한다 (무조건 classList 를 쓰면 class 속성이 다시 쓰인다)',
  /if \(want && !has\)/.test(SEC) && /else if \(!want && has\)/.test(SEC));

/* ══════════════════════════════════════════════════════════════════════════
   ⑧ i18n — 상태에 따라 글자가 바뀌는 버튼
   ══════════════════════════════════════════════════════════════════════════ */
check('⑧ 그릴 때 data-ko/data-en 을 함께 갱신한다 (🌐 를 눌러도 따라오게)',
  /setAttribute\('data-ko',/.test(SEC) && /setAttribute\('data-en',/.test(SEC));
check('⑧ 설명 말풍선은 data-ko-title/data-en-title 로만 단다 (data-ko 는 본문을 갈아끼운다)',
  /setAttribute\('data-ko-title',/.test(SEC) && /setAttribute\('data-en-title',/.test(SEC));
check('⑧ 언어가 바뀌면 다시 그린다', /mangoi:lang-changed/.test(SEC));

/* ══════════════════════════════════════════════════════════════════════════
   ⑨ 오려 내 «실제로 돌린다» — 여기서부터가 문자열로 못 보는 부분
   ══════════════════════════════════════════════════════════════════════════ */
{
  const b = boot({});
  check('⑨ ⑬절이 브라우저 없이도 끝까지 실행된다', b.ran, b.err);
  check('⑨ 검사용 손잡이를 전역으로 내놓는다',
    typeof b.win.mgTbTopApply === 'function' && typeof b.win.mgTbTopEnsureBtn === 'function' &&
    typeof b.win.mgTbTopIsStudent === 'function');
}

/* ── ⑩ 기본은 꺼짐 — 아무것도 안 한 학생 화면은 지금과 똑같아야 한다 ────── */
{
  const b = boot({});
  b.win.mgTbTopApply();
  check('⑩ 기본은 꺼짐 (저장값이 없으면 body 에 클래스를 안 붙인다)',
    !b.body.classList.contains('mg-tb-top'));
  b.win.mgTbTopEnsureBtn();
  const btn = b.tabbar.children[0];
  check('⑩ 꺼진 상태의 버튼 글자는 「교재를 위로」', btn && btn.textContent === '⇅ 교재를 위로',
    btn ? btn.textContent : '버튼 없음');
  check('⑩ 영어 라벨도 함께 박아 둔다', btn && btn.getAttribute('data-en') === '⇅ Textbook on top');
}

/* ── ⑪ 「학생만」 — 네 가지 경우 ───────────────────────────────────────── */
{
  const cases = [
    { name: '학생 계정',                     o: { role: 'student' },                                   want: true },
    { name: '강사 계정 (상대는 학생)',        o: { role: 'teacher', remoteTeacher: false },             want: false },
    { name: '관리자 계정 (상대는 학생)',      o: { role: 'admin', remoteTeacher: false },               want: false },
    { name: 'jeong 사고형 — admin 인데 상대에 교사가 있음', o: { role: 'admin', remoteTeacher: true }, want: true },
    { name: '참관(Ghost)',                   o: { role: 'admin', bodyClasses: ['vc-observer'] },       want: false },
  ];
  cases.forEach(c => {
    const b = boot(c.o);
    check('⑪ ' + c.name + ' → ' + (c.want ? '학생 자리(버튼 보임)' : '학생 아님(버튼 없음)'),
      b.win.mgTbTopIsStudent() === c.want, '판정 ' + b.win.mgTbTopIsStudent());
  });
}
{
  /* 강사에게는 «만들지 않는다» + 이미 있으면 «지운다» */
  const b = boot({ role: 'teacher', remoteTeacher: false });
  b.win.mgTbTopEnsureBtn();
  check('⑪ 강사에게는 메뉴 항목을 아예 만들지 않는다', b.tabbar.children.length === 0);

  const b2 = boot({ role: 'student' });
  b2.win.mgTbTopEnsureBtn();
  check('⑪ 학생에게는 만든다', b2.tabbar.children.length === 1);
  b2.win.vcMyRole = 'teacher';                 // 역할이 늦게 «교사» 로 정정된 경우
  b2.win.mgTbTopEnsureBtn();
  check('⑪ 뒤늦게 강사로 밝혀지면 항목을 지운다', b2.tabbar.children[0]._removed === true);
}
{
  /* 강사 계정이 켜 둔 값이 남아 있어도 화면에는 안 걸려야 한다 */
  const b = boot({ role: 'teacher', remoteTeacher: false, store: { mangoi_vc_portrait_order: 'tbtop' } });
  b.win.mgTbTopApply();
  check('⑪ 저장값이 켜짐이어도 강사 화면에는 적용되지 않는다',
    !b.body.classList.contains('mg-tb-top'));
}

/* ── ⑫ 켜고 끄기 ──────────────────────────────────────────────────────── */
{
  const b = boot({ role: 'student' });
  b.win.mgTbTopEnsureBtn();
  const btn = b.tabbar.children[0];
  btn._on.click();
  check('⑫ 누르면 켜진다', b.body.classList.contains('mg-tb-top'));
  check('⑫ 켜면 글자가 「얼굴을 위로」 로 바뀐다', btn.textContent === '⇅ 얼굴을 위로', btn.textContent);
  check('⑫ 켜면 data-ko 도 함께 바뀐다', btn.getAttribute('data-ko') === '⇅ 얼굴을 위로');
  check('⑫ 누르면 메뉴가 닫힌다 (결과가 바로 보이게)', b.win._menuClosed === true);
  btn._on.click();
  check('⑫ 다시 누르면 꺼진다', !b.body.classList.contains('mg-tb-top'));
  check('⑫ 꺼지면 저장값도 지운다 (기본으로 돌아감)', !('mangoi_vc_portrait_order' in LS));
}
{
  const b = boot({ role: 'student', store: { mangoi_vc_portrait_order: 'tbtop' } });
  b.win.mgTbTopApply();
  check('⑫ 다음 수업에도 기억한다 (기기별)', b.body.classList.contains('mg-tb-top'));
}

/* ── ⑬ 떠 있는 모드에서 켜면 먼저 2단으로 옮긴다 ──────────────────────── */
{
  const b = boot({ role: 'student', rowClasses: ['video-pip'] });
  b.win.mgTbTopEnsureBtn();
  b.tabbar.children[0]._on.click();
  check('⑬ pip(교재 전체+작은 얼굴)에서 켜면 먼저 half 로 옮긴다 (아무 일도 안 일어나는 것 방지)',
    b.win._screenSet === 'half', '옮긴 모드: ' + b.win._screenSet);
  check('⑬ 그리고 켜진다', b.body.classList.contains('mg-tb-top'));
}
{
  const b = boot({ role: 'student', rowClasses: ['video-half'] });
  b.win.mgTbTopEnsureBtn();
  b.tabbar.children[0]._on.click();
  check('⑬ 이미 2단(half)이면 모드를 건드리지 않는다', b.win._screenSet === undefined);
}

/* ── ⑭ «화면 아래에 떠 있는 것» 재기 ─────────────────────────────────── */
{
  /* 폰 실측(390×844, 2026-08-28): ☰ 기능 top 791 · ⋯ top 802 · 독은 접혀 0px.
     제일 위로 올라온 것(☰)을 써야 얼굴이 안 가려진다. */
  const b = boot({ role: 'student', innerHeight: 844,
    fabRect: { top: 791, height: 45 }, moreRect: { top: 802, height: 32 } });
  b.win.mgTbTopMeasureGap();
  check('⑭ 보이는 것들 중 «제일 위로 올라온 것» 을 쓴다 (844−791+6 = 59px)',
    VARS['--mg-tb-gap'] === '59px', VARS['--mg-tb-gap']);

  const b2 = boot({ role: 'student', innerHeight: 844,
    fabRect: { top: 791, height: 45 }, dockRect: { top: 734, height: 60 } });
  b2.win.mgTbTopMeasureGap();
  check('⑭ 독을 펴면 그만큼 더 비운다 (844−734+6 = 116px)', VARS['--mg-tb-gap'] === '116px', VARS['--mg-tb-gap']);

  const b3 = boot({ role: 'student', noDock: true });   // 전부 0px = 아직 안 그려짐
  b3.win.mgTbTopMeasureGap();
  check('⑭ 하나도 못 재면 안전한 기본값(76px)', VARS['--mg-tb-gap'] === '76px', VARS['--mg-tb-gap']);

  const b4 = boot({ role: 'student', innerHeight: 844, fabRect: { top: 840, height: 20 } });
  b4.win.mgTbTopMeasureGap();
  check('⑭ 너무 작은 값은 40px 로 올린다 (가리는 것을 못 막는다)', VARS['--mg-tb-gap'] === '40px', VARS['--mg-tb-gap']);

  const b5 = boot({ role: 'student', innerHeight: 844, dockRect: { top: 100, height: 700 } });
  b5.win.mgTbTopMeasureGap();
  check('⑭ 너무 큰 값은 160px 로 자른다 (얼굴이 사라진다)', VARS['--mg-tb-gap'] === '160px', VARS['--mg-tb-gap']);
}

/* ── ⑮ 탭바가 아직 없을 때 조용히 죽지 않는다 ────────────────────────── */
{
  const b = boot({ role: 'student', noTabBar: true });
  let threw = false;
  try { b.win.mgTbTopEnsureBtn(); } catch (e) { threw = true; }
  check('⑮ 탭바가 늦게 그려져도 예외를 던지지 않는다', !threw);
}

console.log(`\n결과: PASS ${pass} · FAIL ${fail}\n`);
process.exit(fail ? 1 : 0);
