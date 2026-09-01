// -*- coding: utf-8 -*-
// ⚡ 「자주 쓰는 기능」 바로가기 하네스 (2026-08-08 · 개편판)
//   실행: node test-harness/admin_quick_access_harness.mjs
//
//   ── 1차(08-08 오전) 에 못박은 것 — 그대로 유지한다 ─────────────────────
//   신고 ① 「레벨테스트 아이콘이 두 개다」
//     이 목록은 왼쪽에 SVG 아이콘을 «따로» 그린다. 라벨에 이모지를 넣으면 아이콘이 겹쳐 보인다.
//   신고 ② 「눌러도 아무 반응이 없다」
//     🔴 원인은 이 파일이 아니라 «그 뒤에 켜진» adm-ia6.js 다.
//        ia6 는 고른 항목의 카드만 남기고 나머지에 `.ia6-hide{display:none !important}` 를 건다.
//     🪤 우리가 감춤을 직접 되돌리면 안 된다 — 인라인 `style.display=''` 는 `!important` 를 못 이긴다.
//     → 대신 그 항목의 **사이드바 버튼을 대신 눌러 준다.** 버튼은 `data-card` 로 찾는다.
//
//   ── 2차(08-08 오후) 개편으로 새로 못박는 것 ────────────────────────────
//   ③ 기본 12개 (결재함 ＋ 출결 현황 · 결제/미납 · 평가서 · 문의/신규상담 ＋ 수업 관제탑)
//   ④ 🐞 역할 권한으로 감춰진 카드의 바로가기는 그리지 않는다.
//      역할 숨김(adm-core `_applyMenuVisibility`)은 **class**(.rbac-hide) 이고
//      ia6 의 카드 필터도 **class**(.ia6-hide) 다 — 이름이 달라 서로 구분된다.
//      ⚠️ 2026-08-18 이전에는 역할 숨김이 «인라인 style.display» 였다. #legacy-cards 의
//         display:block !important 에 져서 PC 에서 안 먹어 클래스 방식으로 옮겼다.
//         읽는 쪽 코드에는 옛 인라인 검사도 남겨 뒀으므로 아래 검사는 둘 다 인정한다.
//      (옛 코드는 카드의 «존재»만 봐서 지사·대리점에 열 수 없는 바로가기가 보였다.)
//   ⑤ 🐞 data-ko/data-en 은 **글자를 담은 <span>** 에만 붙인다.
//      adm-core 의 `applyAdminLangDom()` 이 `[data-ko]` 를 훑어 el.textContent 를 갈아치우므로,
//      바깥 div 에 붙어 있으면 🌐 를 누르는 순간 **안의 SVG 아이콘이 통째로 지워진다.**
//   ⑥ 순서는 개인 사용기록으로 정해지되, 동점이면 «항상» 기본 순서가 이긴다.
//   ⑦ 계측은 클릭마다 보내지 않는다 — 모았다가 떠날 때 sendBeacon 한 번(무버퍼링).
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const rd = (p) => { try { return readFileSync(resolve(__dir, p), 'utf8'); } catch { return ''; } };

const qa   = rd('../cloudflare-deploy/public/js/adm-quick-access.js');
const html = rd('../cloudflare-deploy/public/admin.html');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
}

// ── 아주 작은 DOM 흉내 ────────────────────────────────────────────────────
//   jsdom 이 없다. 이 파일이 실제로 하는 일(항목 렌더 · 버튼 찾기 · 이동)만 흉내 낸다.
//   🪤 실제 브라우저가 아니므로 «클릭이 ia6 까지 닿는가» 는 여기서 증명되지 않는다.
//      그건 admin_sidebar_ia6_click_harness.mjs 가 «ia6 는 window 캡처로 듣는다» 로 따로 못박는다.
function node() {
  return {
    tagName: 'DIV', style: {}, children: [],
    className: '', _attr: {},
    setAttribute(k, v) { this._attr[k] = v; },
    getAttribute(k) { return k in this._attr ? this._attr[k] : null; },
    appendChild(c) { this.children.push(c); return c; },
    querySelector() { return null; }
  };
}

function clist(init = []) {
  return { _s: new Set(init), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } };
}

// containerHidden = 카드들을 담은 바깥 컨테이너(#legacy-cards)가 display:none 인 상태.
//   🔴 이건 «권한 없음» 이 아니라 «지금 다른 화면을 보고 있음» 이다. 아래 ④-2 가 이걸 못박는다.
function makeDom({ ia6On = true, cardIds = [], roleHidden = [], containerHidden = false } = {}) {
  const log = { clicked: [], scrolled: [] };
  const cards = {};
  // 실제 admin.html 구조: <div id="legacy-cards"> … <details class="menu-card"> … </div>
  const legacy = {
    id: 'legacy-cards', tagName: 'DIV',
    style: containerHidden ? { display: 'none' } : {},
    classList: clist(['legacy-cards']), parentElement: null
  };
  cardIds.forEach((id) => {
    cards[id] = {
      id, tagName: 'DETAILS', open: false,
      style: roleHidden.includes(id) ? { display: 'none' } : {},
      classList: clist(['menu-card']),
      parentElement: legacy,
      scrollIntoView() { log.scrolled.push(id); }
    };
  });

  const box = { innerHTML: '', children: [], parentNode: null, nextSibling: null };
  const quick = {
    id: 'ph161-quick', style: {}, _kids: [],
    querySelector: (sel) => (sel === '.ph161-mode' ? (quick._kids.find((k) => k.className === 'ph161-mode') || null) : null),
    insertBefore(n) { quick._kids.push(n); return n; }
  };
  box.parentNode = quick;

  const doc = {
    readyState: 'complete',
    body: {},
    /* 🧾 클릭 핸들러를 기억해 둔다 — 「결재함을 누르면 정말 /work 로 가는가」를
       문자열이 아니라 **실제로 돌려서** 확인하기 위해서다(CLAUDE.md 「넘기는 모양」 함정). */
    _click: [],
    addEventListener(type, fn) { if (type === 'click') doc._click.push(fn); },
    /** key 로 표시된 칸을 실제로 누른다. onActivate 가 기대하는 최소한의 이벤트만 만든다. */
    __click(key) {
      const q = { getAttribute: (k) => (k === 'data-qa' ? key : null) };
      const t = { closest: (sel) => (sel === '.ph161-q' ? q : null) };
      const ev = { target: t, preventDefault() {}, stopPropagation() {} };
      doc._click.forEach((fn) => fn(ev));
    },
    createElement: () => node(),
    getElementById: (id) => {
      if (id === 'ph161-quick-items') return box;
      if (id === 'ph161-quick') return quick;
      return cards[id] || null;
    },
    querySelector: (sel) => {
      if (!ia6On) return null;                        // ia6 가 꺼져 있으면 버튼 자체가 없다
      const m = sel.match(/data-card="([^"]+)"/);
      if (!m || !cards[m[1]]) return null;
      return { __card: m[1], click() { log.clicked.push(m[1]); } };
    }
  };
  return { doc, box, quick, log, cards };
}

function memStore(seed = {}) {
  const m = new Map(Object.entries(seed));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    _dump: () => Object.fromEntries(m)
  };
}

function runQa(dom, store = memStore()) {
  /* 🧾 결재함 칸만 «딴 페이지로 간다» — location.href 대입이 그 증거다.
     실제 브라우저가 아니므로 가짜 location 을 하나 넣어 무엇으로 갔는지 받아 둔다. */
  dom.log.went = [];
  const loc = { set href(v) { dom.log.went.push(String(v)); }, get href() { return ''; } };
  const g = {
    document: dom.doc,
    location: loc,
    window: { addEventListener() {}, matchMedia: () => ({ matches: false }) },
    localStorage: store,
    setTimeout: (fn) => { try { fn(); } catch { /* 무시 */ } return 0; },
    navigator: {}                                     // sendBeacon 없음 → 계측은 조용히 건너뛴다
  };
  g.window.document = dom.doc;
  const fn = new Function('document', 'window', 'localStorage', 'setTimeout', 'navigator', 'location', qa);
  fn(g.document, g.window, g.localStorage, g.setTimeout, g.navigator, g.location);
  return g.window;
}

/** 렌더된 라벨을 순서대로 뽑는다 — data-ko 는 «span 에» 붙어 있어야 한다(⑤) */
const labelsOf = (h) =>
  [...h.matchAll(/<span style="flex:1"[^>]*>([^<]*)<\/span>/g)].map((m) => m[1]);

// 10개 전부의 대상 카드 (adm-ia6.js 의 cards[0] 과 같아야 한다)
const ALL = [
  'card-students-mgmt', 'card-admin-ghost', 'card-active-rooms', 'card-attendance-status',
  'card-enrollments', 'card-payments-b2b', 'card-level-tests', 'card-eval-mgmt', 'card-inquiry-mgmt'
];
const DAY = Math.floor((Date.now() + 32400000) / 86400000);   // KST 기준 일련일

/* 🧾 (2026-08-20) 「결재함」이 이 표의 **첫 칸**으로 들어왔다.
   그 전에는 이 표 «위» 에 초록 줄이 따로 떠 있었는데, 표 밖에 혼자 있어 어색했고
   사이드바에도 결재함이 생기면서 같은 입구가 셋이 됐다(사장님 지적) → 표 안으로 들였다.
   ⚠️ 다른 칸과 달리 **카드가 없다**(href 로 딴 페이지로 간다) — 아래 ④ 가 그래서 따로 검사한다. */
console.log('\n[ ① 기본 12개가 정해진 순서로 그려진다 ]');
const dom1 = makeDom({ cardIds: ALL });
const win1 = runQa(dom1);
const labels = labelsOf(dom1.box.innerHTML);
/* 2026-08-30 「수업 관제탑」이 들어와 12개가 되었다(사장님 「바로바로 들어가서 볼 수 있게」).
   ⚠️ 결재함과 같은 href 칸이라 카드가 없다 — 아래 ④ 의 검사 대상이 하나 더 늘었다. */
check(`항목이 12개 렌더된다 (실제: ${labels.length})`, labels.length === 12);
check(`첫 항목이 「결재함」이다 (실제: "${labels[0] || ''}")`, labels[0] === '결재함');
check(`그 다음이 「오늘 수업」이다 (실제: "${labels[1] || ''}")`, /^오늘 수업/.test(labels[1] || ''));
['출결 현황', '결제 · 미납', '평가서', '문의 · 신규상담'].forEach((l) =>
  check(`신규 항목이 들어 있다: ${l}`, labels.includes(l)));
check('바로가기 대상 카드 9종이 admin.html 에 실제로 있다',
  ALL.every((id) => html.includes(`id="${id}"`)));
check('결제·미납은 ia6 「결제」의 cards[0](=b2b)를 가리킨다 — 어긋나면 옛 경로로 빠진다',
  /card:\s*'card-payments-b2b'/.test(qa));

console.log('\n[ ② 아이콘 두 개 금지 — 라벨에 이모지를 넣지 않는다 ]');
const emojiish = (s) => /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u.test(s);
check('모든 라벨에 이모지가 없다', labels.every((l) => !emojiish(l)));
check('항목마다 SVG 아이콘은 그대로 하나씩 그린다',
  (dom1.box.innerHTML.match(/<svg /g) || []).length === labels.length);

console.log('\n[ ③ ia6 가 켜져 있으면 «사이드바 버튼» 을 대신 누른다 ]');
check('data-card 로 버튼을 찾는다 — 한글 키를 박아 넣지 않는다',
  /\[data-ia6-item\]\[data-card="/.test(qa) && !/data-ia6-item="student:/.test(qa));
win1.ph161Go('card-level-tests', null);
check('레벨테스트를 누르면 그 버튼이 눌린다', dom1.log.clicked.includes('card-level-tests'));
check('🪤 감춰진 카드로 곧바로 스크롤하지 않는다 (그게 «무반응» 의 정체였다)',
  dom1.log.scrolled.length === 0);
check('나머지 항목도 전부 같은 경로를 탄다 — 하나만 고치면 반쪽이다',
  ALL.every((id) => { dom1.log.clicked.length = 0; win1.ph161Go(id, null); return dom1.log.clicked.includes(id); }));

/* 🧾 결재함 칸만 «딴 페이지» 로 간다 — 나머지는 이 화면의 카드를 연다.
   ⚠️ 문자열로 「href 를 쓰는가」만 보면 안 된다(CLAUDE.md: «넘기는 모양» 은 실제로 돌려서 확인).
      여기서는 진짜로 눌러 보고 무엇으로 갔는지 잰다. */
{
  const dom = makeDom({ cardIds: ALL });
  runQa(dom);
  dom.doc.__click('결재함');
  check(`「결재함」을 누르면 /work 로 간다 (실제: "${dom.log.went[0] || ''}")`,
    dom.log.went[0] === '/work');
  check('그때 카드 버튼은 누르지 않는다 (화면이 두 벌이 되지 않게)',
    dom.log.clicked.length === 0);
}

console.log('\n[ ④ 역할 권한으로 감춰진 카드는 «바로가기도» 안 그린다 ]');
{
  // 지사 계정 흉내 — 평가서·결제 카드가 인라인 display:none 으로 잠겨 있다
  const dom = makeDom({ cardIds: ALL, roleHidden: ['card-eval-mgmt', 'card-payments-b2b'] });
  runQa(dom);
  const ls = labelsOf(dom.box.innerHTML);
  check('권한 없는 「평가서」가 목록에서 빠진다', !ls.includes('평가서'));
  check('권한 없는 「결제 · 미납」이 목록에서 빠진다', !ls.includes('결제 · 미납'));
  check(`나머지는 그대로 남는다 (실제: ${ls.length}개)`, ls.length === 10 && ls.includes('출결 현황'));
  /* 🪤 결재함은 «가리킬 카드» 가 없다 — 카드의 display 만 보고 판정하면 조용히 사라진다.
     결재는 지사·대리점도 올려야 하는 일이라 사라지면 안 된다. */
  check('카드가 없는 「결재함」은 권한 판정에서 빠지지 않는다', ls[0] === '결재함');
}
{
  // ia6 의 카드 필터(class)는 «권한 없음» 이 아니다 — 이걸 권한으로 오해하면 목록이 통째로 빈다
  const dom = makeDom({ cardIds: ALL });
  ALL.forEach((id) => dom.cards[id].classList.add('ia6-hide'));
  runQa(dom);
  check('.ia6-hide 는 권한 숨김이 아니다 — 12개가 그대로 남는다',
    labelsOf(dom.box.innerHTML).length === 12);
}
{
  // 🔴 (2026-08-08 실측 회귀) 바깥 컨테이너 #legacy-cards 가 display:none 인 순간이 있다.
  //    그걸 «권한 없음» 으로 읽었다가 바로가기가 10개 중 1개만 남았다(컨테이너 밖에 있던 결제만 생존).
  //    컨테이너의 display 는 «지금 무엇을 보여 주는가» 이지 «이 사람이 볼 수 있는가» 가 아니다.
  const dom = makeDom({ cardIds: ALL, containerHidden: true });
  runQa(dom);
  check('바깥 컨테이너가 감춰져 있어도 12개가 그대로 남는다 (권한과 화면전환을 구분한다)',
    labelsOf(dom.box.innerHTML).length === 12);
}

console.log('\n[ ⑤ 🐞 data-ko 는 «span 에만» — 바깥 div 에 붙으면 아이콘이 지워진다 ]');
check('.ph161-q 바깥 div 에는 data-ko 가 없다',
  !/class="ph161-q"[^>]*data-ko=/.test(dom1.box.innerHTML));
check('글자를 담은 span 에 data-ko/data-en 이 있다',
  /<span style="flex:1" data-ko="[^"]+" data-en="[^"]+">/.test(dom1.box.innerHTML));

console.log('\n[ ⑥ 순서는 내 사용기록으로 정해지고, 동점이면 기본 순서가 이긴다 ]');
{
  const seeded = memStore({
    mangoi_qa_use: JSON.stringify({ '문의상담': [[DAY, 20]], '평가서': [[DAY, 9]] })
  });
  const dom = makeDom({ cardIds: ALL });
  runQa(dom, seeded);
  const ls = labelsOf(dom.box.innerHTML);
  /* 📌 결재함은 pin 이라 사용기록과 무관하게 맨 앞을 지킨다 — 결재는 «누가 답을 기다리는» 일이라
     덜 눌렀다는 이유로 뒤로 밀리면 안 된다. 순서 학습은 그 다음 칸부터 적용된다. */
  check(`「결재함」은 사용기록과 무관하게 맨 위를 지킨다 (실제: "${ls[0]}")`, ls[0] === '결재함');
  check(`많이 쓴 「문의 · 신규상담」이 그 다음이다 (실제: "${ls[1]}")`, ls[1] === '문의 · 신규상담');
  check(`그 다음이 「평가서」다 (실제: "${ls[2]}")`, ls[2] === '평가서');
  check('기록 없는 나머지는 기본 순서를 그대로 지킨다 (동점 → 기본 순서)',
    ls[3] === '오늘 수업' && ls[4] === '수업 관찰');
}
{
  // 30일이 지난 기록은 잊는다 — 안 그러면 반년 전 습관에 순서가 묶인다
  const old = memStore({ mangoi_qa_use: JSON.stringify({ '문의상담': [[DAY - 400, 999]] }) });
  const dom = makeDom({ cardIds: ALL });
  runQa(dom, old);
  check('30일보다 오래된 기록은 순서에 영향을 주지 않는다',
    labelsOf(dom.box.innerHTML)[1] === '오늘 수업');
}
{
  // 「기본 순서」로 고정하면 사용기록을 무시한다 — 아무도 순서에 갇히지 않게
  const fixed = memStore({
    mangoi_qa_mode: 'fixed',
    mangoi_qa_use: JSON.stringify({ '문의상담': [[DAY, 99]] })
  });
  const dom = makeDom({ cardIds: ALL });
  runQa(dom, fixed);
  check('기본 순서 모드에서는 사용기록을 무시한다',
    labelsOf(dom.box.innerHTML)[1] === '오늘 수업');
}
check('망가진 사용기록(JSON 아님)에도 죽지 않는다', (() => {
  try {
    const bad = memStore({ mangoi_qa_use: '{{{망가짐' });
    const dom = makeDom({ cardIds: ALL });
    runQa(dom, bad);
    return labelsOf(dom.box.innerHTML).length === 12;
  } catch { return false; }
})());

console.log('\n[ ⑦ 무버퍼링 — 계측은 클릭마다 보내지 않는다 ]');
check('부팅 경로에 fetch/XHR 가 없다 (첫 화면이 네트워크를 기다리지 않는다)',
  !/\bfunction boot\b[\s\S]{0,1200}?\bfetch\s*\(/.test(qa));
check('계측은 sendBeacon 으로 보낸다 (메인스레드를 막지 않는다)', /sendBeacon\(/.test(qa));
check('보내는 시점은 pagehide / visibilitychange 다 — 클릭 때가 아니다',
  /addEventListener\('pagehide',\s*flush\)/.test(qa) && /visibilitychange/.test(qa));
check('클릭 핸들러는 모으기만 한다(track) — 거기서 곧바로 flush 하지 않는다', (() => {
  // 🪤 `[\s\S]*?` 로 «onActivate 안에 flush 없음» 을 검사하면 안 된다 —
  //    탐색이 함수 경계를 넘어 아래 boot() 의 flush 까지 잡아서 «있다» 고 거짓 실패한다(실제로 겪음).
  //    → onActivate 본문만 잘라 내서 그 안만 본다.
  const s = qa.indexOf('function onActivate');
  const e = qa.indexOf('function boot', s);
  if (s < 0 || e < 0) return false;
  const body = qa.slice(s, e);
  return body.includes('track(key);') && body.includes('ph161Go') && !/\bflush\s*\(/.test(body);
})());
check('기존 API 를 쓴다 — 새 엔드포인트를 만들지 않았다', /\/api\/games\/ux-track/.test(qa));
check('스크롤은 auto 다 — smooth 는 「왔다갔다 정신없다」로 이미 제거된 규칙',
  /behavior:\s*'auto'/.test(qa) && !/behavior:\s*'smooth'/.test(qa));

console.log('\n[ ⑧ ia6 를 끄면 옛 경로로 저절로 폴백한다 ]');
{
  const dom2 = makeDom({ ia6On: false, cardIds: ALL });
  const win2 = runQa(dom2);
  win2.ph161Go('card-level-tests', null);
  check('버튼이 없으면 옛 방식대로 카드를 펼치고 스크롤한다', dom2.log.scrolled.includes('card-level-tests'));
  check('그 카드를 펼친다', dom2.cards['card-level-tests'].open === true);
  check('감춤 클래스가 남아 있어도 벗겨 준다(보험)', !dom2.cards['card-level-tests'].classList.contains('ia6-hide'));
}

console.log('\n[ ⑨ 캐시 — 고친 js 가 실제로 내려가야 한다 ]');
{
  const m = html.match(/adm-quick-access\.js\?v=(\d+)/);
  check(`admin.html 이 버전과 함께 부른다 (?v=${m ? m[1] : '없음'})`, !!m);
  check('버전이 4 이상 (안 올리면 옛 파일이 캐시에서 나온다)', !!m && Number(m[1]) >= 4);
}

console.log('\n─────────────────────────────────────────────');
console.log(`  통과 ${PASS} · 실패 ${FAIL}`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach((f) => console.log('   · ' + f)); }
console.log('─────────────────────────────────────────────\n');
process.exit(FAIL ? 1 : 0);
