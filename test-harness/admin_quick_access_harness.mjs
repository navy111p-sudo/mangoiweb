// -*- coding: utf-8 -*-
// ⚡ 「자주 쓰는 기능」 바로가기 하네스 (2026-08-08)
//   실행: node test-harness/admin_quick_access_harness.mjs
//
//   신고 ① 「레벨테스트 아이콘이 두 개다」
//     이 목록은 왼쪽에 SVG 아이콘을 «따로» 그린다. 라벨에 이모지를 넣으면 아이콘이 겹쳐 보인다.
//     → 라벨에 이모지 금지. (기존 5항목은 원래부터 이모지가 없었다)
//
//   신고 ② 「눌러도 아무 반응이 없다」
//     🔴 원인은 이 파일이 아니라 «그 뒤에 켜진» adm-ia6.js 다.
//        ia6 는 고른 항목의 카드만 남기고 나머지에 `.ia6-hide{display:none !important}` 를 건다.
//        그래서 바로가기가 곧바로 scrollIntoView 를 하면 **감춰진 카드로** 가느라 화면이 안 움직인다.
//        (레벨테스트만이 아니라 5개 항목 전부 같은 상태였다.)
//     🪤 여기서 우리가 감춤을 직접 되돌리면 안 된다 —
//        ph97 이 같은 실수를 이미 했다. 인라인 `style.display=''` 는 `!important` 를 못 이긴다.
//     → 대신 그 항목의 **사이드바 버튼을 대신 눌러 준다.** ia6 자신의 로직이 그대로 돈다.
//     → 버튼은 한글 키가 아니라 `data-card` 로 찾는다(항목 이름이 바뀌어도 안 깨지게).
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
//   jsdom 이 없다. 이 파일이 실제로 하는 일(항목 렌더 · 버튼 찾기 · 클릭 위임)만 흉내 낸다.
//   🪤 실제 브라우저가 아니므로 «클릭이 ia6 까지 닿는가» 는 여기서 증명되지 않는다.
//      그건 admin_sidebar_ia6_click_harness.mjs 가 «ia6 는 window 캡처로 듣는다» 로 따로 못박는다.
function makeDom({ ia6On, cardIds }) {
  const log = { clicked: [], scrolled: [] };
  const cards = {};
  cardIds.forEach((id) => {
    cards[id] = {
      id, tagName: 'DETAILS', open: false, style: {},
      classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } },
      parentElement: null,
      scrollIntoView() { log.scrolled.push(id); }
    };
  });
  const box = { innerHTML: '', children: [] };
  const doc = {
    readyState: 'complete',
    body: {},
    addEventListener() {},
    getElementById: (id) => (id === 'ph161-quick-items' ? box : (cards[id] || null)),
    querySelector: (sel) => {
      if (!ia6On) return null;                        // ia6 가 꺼져 있으면 버튼 자체가 없다
      const m = sel.match(/data-card="([^"]+)"/);
      if (!m || !cards[m[1]]) return null;
      return { __card: m[1], click() { log.clicked.push(m[1]); } };
    }
  };
  return { doc, box, log, cards };
}

function runQa(dom) {
  const g = {
    document: dom.doc,
    window: { addEventListener() {}, matchMedia: () => ({ matches: false }) },
    localStorage: { getItem: () => 'ko' },
    setTimeout: (fn) => { try { fn(); } catch {} return 0; }
  };
  g.window.document = dom.doc;
  const fn = new Function('document', 'window', 'localStorage', 'setTimeout', qa);
  fn(g.document, g.window, g.localStorage, g.setTimeout);
  return g.window;
}

const CARDS = ['card-students-mgmt', 'card-admin-ghost', 'card-active-rooms', 'card-enrollments', 'card-level-tests'];

console.log('\n[ ① 레벨테스트 항목이 목록 «맨 끝» 에 있다 ]');
const dom1 = makeDom({ ia6On: true, cardIds: CARDS });
const win1 = runQa(dom1);
const labels = [...dom1.box.innerHTML.matchAll(/<span style="flex:1">([^<]*)<\/span>/g)].map((m) => m[1]);
check(`항목이 6개 렌더된다 (실제: ${labels.length})`, labels.length === 6);
check(`맨 끝이 레벨테스트다 (실제: "${labels[labels.length - 1] || ''}")`, labels[labels.length - 1] === '레벨테스트');
check('바로가기 대상 카드가 admin.html 에 실제로 있다', /id="card-level-tests"/.test(html));

console.log('\n[ ② 아이콘 두 개 금지 — 라벨에 이모지를 넣지 않는다 ]');
// 기본 다국어면(Basic Multilingual Plane 밖) 이모지로 본다. 한글·영문·괄호·중점은 통과.
const emojiish = (s) => /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u.test(s);
labels.forEach((l) => check(`라벨에 이모지 없음: "${l}"`, !emojiish(l)));
check('항목마다 SVG 아이콘은 그대로 하나씩 그린다',
  (dom1.box.innerHTML.match(/<svg /g) || []).length === labels.length);

console.log('\n[ ③ ia6 가 켜져 있으면 «사이드바 버튼» 을 대신 누른다 ]');
check('data-card 로 버튼을 찾는다 — 한글 키를 박아 넣지 않는다',
  /\[data-ia6-item\]\[data-card="/.test(qa) && !/data-ia6-item="student:/.test(qa));
win1.ph161Go('card-level-tests', null);
check('레벨테스트를 누르면 그 버튼이 눌린다', dom1.log.clicked.includes('card-level-tests'));
check('🪤 감춰진 카드로 곧바로 스크롤하지 않는다 (그게 «무반응» 의 정체였다)',
  dom1.log.scrolled.length === 0);
check('나머지 4개 항목도 같은 경로를 탄다 — 레벨테스트만 고치면 반쪽이다',
  CARDS.slice(0, 4).every((id) => { dom1.log.clicked.length = 0; win1.ph161Go(id, null); return dom1.log.clicked.includes(id); }));

console.log('\n[ ④ ia6 를 끄면 옛 경로로 저절로 폴백한다 ]');
const dom2 = makeDom({ ia6On: false, cardIds: CARDS });
const win2 = runQa(dom2);
win2.ph161Go('card-level-tests', null);
check('버튼이 없으면 옛 방식대로 카드를 펼치고 스크롤한다', dom2.log.scrolled.includes('card-level-tests'));
check('그 카드를 펼친다', dom2.cards['card-level-tests'].open === true);
check('감춤 클래스가 남아 있어도 벗겨 준다(보험)', !dom2.cards['card-level-tests'].classList.contains('ia6-hide'));

console.log('\n[ ⑤ 캐시 — 고친 js 가 실제로 내려가야 한다 ]');
{
  const m = html.match(/adm-quick-access\.js\?v=(\d+)/);
  check(`admin.html 이 버전과 함께 부른다 (?v=${m ? m[1] : '없음'})`, !!m);
  check('버전이 3 이상 (안 올리면 옛 파일이 캐시에서 나온다)', !!m && Number(m[1]) >= 3);
}

console.log('\n─────────────────────────────────────────────');
console.log(`  통과 ${PASS} · 실패 ${FAIL}`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach((f) => console.log('   · ' + f)); }
console.log('─────────────────────────────────────────────\n');
process.exit(FAIL ? 1 : 0);
