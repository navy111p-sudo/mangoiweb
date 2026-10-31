// cta_hero_status_harness.mjs — 홈 큰 버튼 두 개: 골드 채움 + «오늘 상태» 한 줄 (2026-09-09)
//
// ── 왜 ──────────────────────────────────────────────────────────────────────
// 사장님 제보 「메인 화면에 오늘의 AI 학습과 수업 입장 버튼이 있기는 하나 눈에 잘 띄지 않음」.
//
// 재 보니 «색을 더하는» 문제가 아니었다 — 이 두 버튼은 원래 골드 «채움» 인데,
// 파일 맨 뒤의 `#cta-transparent-override` 한 덩어리가
//   `background: rgba(245,158,11,0.10) !important`
// 로 덮고 있었다. [잰 것 — 2026-09-09 브라우저 실측] 계산값 backgroundColor
// rgba(245,158,11,0.1) · backgroundImage **none** · color rgb(251,191,36).
// 10% 만 칠해져 어두운 배경 사진 위에서 «테두리만 있는 빈 상자» 로 보였다.
//
// 사장님이 고르신 것: **색은 A안**(골드 되살리기) + **내용은 C안**(버튼 안 오늘 상태 한 줄).
//
// ── 이 하니스가 못 박는 것 ──────────────────────────────────────────────────
//   ① 투명 덮어쓰기가 되살아나지 않았다 (주석은 벗겨 내고 «규칙» 만 본다)
//   ② 상태 줄은 defer 파일이 맡는다 — index.html 첫 화면 예산을 쓰지 않는다
//   ③ 그 파일을 **가짜 DOM 으로 실제 실행**해서
//      · 아는 값이면 그린다 / **모르면 안 그린다**(지어내지 않는다) 를 «짝으로»
//      · 비회원에게는 조회조차 안 한다
//   ④ 상주 setInterval·MutationObserver 가 없다 — 그 둘이 홈을 통째로 멎게 한 전력이 있다
//      (2026-07-14 · 2026-08-27). 여기서는 «끝이 있는» 확인만 해야 한다.
//
// ⚠️ ③을 문자열로 보면 못 잡는다 — 「fetch 를 부르는가」·「span 을 만드는가」는 전부 «있고»
//    틀리는 것은 «모를 때 무엇을 그리는가» 뿐이다.
//
// 실행: node test-harness/cta_hero_status_harness.mjs

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'cloudflare-deploy/public');
const HTML = readFileSync(join(PUB, 'index.html'), 'utf8');
const JS = readFileSync(join(PUB, 'js/idx-cta-status.js'), 'utf8');

let PASS = 0, FAIL = 0;
const check = (name, cond, detail = '') => {
  if (cond) PASS++; else FAIL++;
  console.log(`  ${cond ? '✅' : '❌'} ${name}${cond || !detail ? '' : '  — ' + detail}`);
};

console.log('┌────────────────────────────────────────────────');
console.log('│ 🟡 홈 CTA — 골드 채움 + 오늘 상태 한 줄');
console.log('├────────────────────────────────────────────────');

/* ── ① 투명 덮어쓰기가 되살아나지 않았다 ──────────────────────────────────
   ⚠️ 부정 검사는 반드시 «주석을 벗겨 낸 사본» 으로 한다 — 왜 걷어냈는지 적어 둔
      우리 주석에 그 값이 그대로 들어 있어, 원본으로 보면 자기 주석을 잡는다
      (CLAUDE.md 「부정 검사가 자기 주석을 잡음」). */
const noComments = HTML
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ');
check('① #cta-transparent-override 가 없다', !/id\s*=\s*["']cta-transparent-override["']/.test(noComments));
/* «투명하게 덮는 규칙» 자체를 본다 — id 이름만 바꿔 되살리는 것도 막는다.
   .cta-pay/.cta-enter 를 알파 0.5 미만 배경으로 칠하는 규칙이 있으면 빨간불. */
const faint = [];
const ruleRe = /([^{}]*\.cta-(?:pay|enter)[^{}]*)\{([^}]*)\}/g;
let m;
while ((m = ruleRe.exec(noComments))) {
  const bg = (m[2].match(/background(?:-color)?\s*:\s*([^;]+)/i) || [])[1] || '';
  const a = bg.match(/rgba\([^)]*?,\s*(0?\.\d+|0)\s*\)/);
  if (a && parseFloat(a[1]) < 0.5 && !/hover|active|:disabled/.test(m[1])) faint.push(m[1].trim().slice(0, 60) + ' → ' + bg.trim());
}
check('① CTA 배경을 «반투명» 으로 칠하는 규칙이 없다 (10% 배경은 대비를 못 만든다)',
  faint.length === 0, faint.join(' | '));

/* ── ② 상태 줄은 defer 파일 ──────────────────────────────────────────────── */
const tag = (HTML.match(/<script[^>]*idx-cta-status\.js[^>]*>/) || [])[0] || '';
check('② index.html 이 idx-cta-status.js 를 싣는다', !!tag);
check('② 그 스크립트가 defer 다 (첫 화면을 막지 않는다)', /\bdefer\b/.test(tag), tag);
check('② 캐시 무효화용 ?v= 가 붙어 있다', /idx-cta-status\.js\?v=\d+/.test(tag), tag);

/* ── ④ 상주 타이머·관찰자가 없다 ─────────────────────────────────────────
   ⚠️ 주석에 그 이름을 적어 두었으므로 여기서도 주석을 벗겨 낸다. */
const jsNoCom = JS.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');
check('④ setInterval 을 쓰지 않는다 (홈에 상주하면 학생 폰을 계속 깨운다)',
  !/\bsetInterval\s*\(/.test(jsNoCom));
check('④ MutationObserver 를 쓰지 않는다 (홈을 통째로 멎게 한 전력이 두 번 있다)',
  !/\bMutationObserver\b/.test(jsNoCom));
check('④ 다시 보는 횟수가 «끝이 있다» (상수 배열로 못 박음)',
  /var WHEN\s*=\s*\[[^\]]+\]/.test(jsNoCom));

/* ── ③ 가짜 DOM 으로 «실제로» 돌린다 ─────────────────────────────────────── */
function makeDom(opts) {
  const nodes = [];
  function El(tag) {
    const el = {
      tagName: String(tag || 'div').toUpperCase(), _cls: new Set(), id: '', children: [], _text: '',
      style: {}, parentNode: null, _visible: true,
      get className() { return [...el._cls].join(' '); },
      set className(v) { el._cls = new Set(String(v).split(/\s+/).filter(Boolean)); },
      classList: {
        add: (...c) => c.forEach((x) => el._cls.add(x)),
        remove: (...c) => c.forEach((x) => el._cls.delete(x)),
        contains: (c) => el._cls.has(c),
      },
      get offsetParent() { return el._visible ? (el.parentNode || DOC.body) : null; },
      get textContent() { return el._text; },
      set textContent(v) { el._text = String(v); },
      appendChild(c) { c.parentNode = el; el.children.push(c); return c; },
      removeChild(c) { el.children = el.children.filter((x) => x !== c); c.parentNode = null; return c; },
      matches(sel) {
        return sel.split(',').map((s) => s.trim()).some((s) => {
          if (s.startsWith('#')) return el.id === s.slice(1);
          return s.split('.').filter(Boolean).every((c) => el._cls.has(c));
        });
      },
      querySelector(sel) { return el.querySelectorAll(sel)[0] || null; },
      querySelectorAll(sel) {
        const out = [];
        (function walk(n) { for (const c of n.children) { if (c.matches(sel)) out.push(c); walk(c); } })(el);
        return out;
      },
      addEventListener() {},
    };
    nodes.push(el);
    return el;
  }
  const mk = (tag, id, cls) => { const e = El(tag); e.id = id || ''; if (cls) e.className = cls; return e; };

  const body = mk('body');
  const head = mk('head');
  const hero = mk('div', 'hero-member');
  hero._visible = opts.member;
  hero.appendChild(mk('button', '', 'cta-enter'));
  hero.appendChild(mk('button', '', 'cta-pay'));
  body.appendChild(hero);

  const ncc = mk('div', 'next-class-countdown');
  ncc._visible = !!opts.ncc;
  if (opts.ncc) {
    const card = mk('div', '', 'ncc-card' + (opts.nccLive ? ' ncc-live' : ''));
    if (opts.nccSub) { const s = mk('div', '', 'ncc-sub'); s.textContent = opts.nccSub; card.appendChild(s); }
    ncc.appendChild(card);
  }
  body.appendChild(ncc);

  const byId = { 'hero-member': hero, 'next-class-countdown': ncc };
  const DOC = {
    body, head,
    getElementById: (id) => byId[id] || null,
    createElement: (t) => El(t),
    addEventListener() {},
    readyState: 'complete',
    querySelector: (s) => body.querySelector(s),
  };
  return { DOC, hero, ncc };
}

function run(label, opts) {
  const { DOC, hero } = makeDom(opts);
  let intervals = 0, fetches = 0;
  const store = {};
  const sandbox = {
    document: DOC,
    console: { log() {}, warn() {}, error() {} },
    setTimeout: (fn) => { try { fn(); } catch (e) {} return 0; },   // «끝이 있는» 확인이라 즉시 돌린다
    setInterval: () => { intervals++; return 0; },
    localStorage: { getItem: (k) => (k === 'mango_token' ? 'tok' : null), setItem() {} },
    sessionStorage: { getItem: () => null, setItem() {} },
    getLang: () => 'ko',
    getCurrentUser: () => (opts.member ? { uid: 'stu1', name: '테스트' } : null),
    fetch: (u) => {
      fetches++;
      return Promise.resolve({ json: () => Promise.resolve(opts.today) });
    },
  };
  sandbox.window = sandbox;
  sandbox.window.addEventListener = () => {};
  vm.createContext(sandbox);
  vm.runInContext(JS, sandbox, { timeout: 4000 });
  /* ⚠️ 여기서 바로 줄을 읽으면 «항상 없음» 이다 — 계획 줄은 fetch 뒤(마이크로태스크)에 그려진다.
     그래서 hero 를 그대로 돌려주고, 부르는 쪽이 tick() 으로 큐를 비운 «뒤» 에 읽는다.
     ⛔ 이걸 놓치면 「모르면 안 그린다」 검사가 «언제나 통과» 해 아무것도 안 지킨다. */
  const sub = (cls) => hero.querySelector(cls).querySelector('.mgcs-sub');
  return { label, intervals, fetches, get enter() { return sub('.cta-enter'); }, get pay() { return sub('.cta-pay'); } };
}

const okPlan = { ok: true, plan: { doneCount: 2, steps: [1, 2, 3] } };

// ⚠️ 이 절은 비동기 fetch 뒤에 그려지므로 마이크로태스크를 한 번 비워 준다
async function tick() { for (let i = 0; i < 8; i++) await Promise.resolve(); }

const A = run('회원+계획+수업', { member: true, ncc: true, nccSub: '오전 06:00 · 강사 강선생님', today: okPlan });
await tick();
check('③-1 다음 수업 줄을 «아래 카드에서 읽어» 그린다 (다시 조회하지 않는다)',
  !!A.enter && A.enter.textContent === '오전 06:00 · 강사 강선생님', A.enter && A.enter.textContent);
check('③-2 오늘 계획 줄을 그린다 (3개 중 1개 남음)',
  !!A.pay && A.pay.textContent === '3개 중 1개 남음', A.pay && A.pay.textContent);
check('④-1 상주 setInterval 을 만들지 않았다', A.intervals === 0, String(A.intervals));

const B = run('회원+계획없음', { member: true, ncc: false, today: { error: 'not_found' } });
await tick();
check('③-3 계획을 모르면 «지어내지 않고» 줄을 안 그린다', !B.pay, B.pay && B.pay.textContent);
check('③-4 다음 수업 카드가 없으면 그 줄도 안 그린다', !B.enter, B.enter && B.enter.textContent);

const C = run('회원+전부완료', { member: true, ncc: true, nccSub: '오전 06:00', today: { ok: true, plan: { doneCount: 3, steps: [1, 2, 3] } } });
await tick();
check('③-5 다 했으면 «완료» 로 말한다', !!C.pay && /완료/.test(C.pay.textContent), C.pay && C.pay.textContent);

const D = run('회원+진행중수업', { member: true, ncc: true, nccLive: true, nccSub: '오전 06:00', today: okPlan });
await tick();
check('③-6 지금 들어갈 수 있으면 그렇게 말한다',
  !!D.enter && /지금 입장/.test(D.enter.textContent), D.enter && D.enter.textContent);

const E = run('비회원', { member: false, ncc: true, nccSub: '오전 06:00', today: okPlan });
await tick();
check('③-7 비회원에게는 아무것도 안 그린다', !E.enter && !E.pay);
check('③-8 비회원에게는 계획 조회조차 안 한다 (쓸데없는 요청 금지)', E.fetches === 0, String(E.fetches));

const F = run('회원+계획0개', { member: true, ncc: false, today: { ok: true, plan: { doneCount: 0, steps: [] } } });
await tick();
check('③-9 오늘 계획이 0개면 줄을 안 그린다', !F.pay, F.pay && F.pay.textContent);

console.log('├────────────────────────────────────────────────');
console.log(`│ 🟡 cta_hero_status_harness — PASS ${PASS} / FAIL ${FAIL}`);
console.log('└────────────────────────────────────────────────');
process.exit(FAIL ? 1 : 0);
