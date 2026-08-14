#!/usr/bin/env node
/**
 * 🔎 관리자 통합검색 — 「레벨테스트」가 찾던 카드로 가는지 (2026-08-06)
 *
 * 사고 내용
 *   사장님: "검색창에 레벨테스트라고 누르면 «레벨테스트 현황»이 나와.
 *            내가 원하는 건 레벨테스트 학생 등록 결과인데."
 *
 *   원인 두 겹.
 *   ① 찾던 카드(card-level-tests — 학생이 접수한 신청·등록 결과 표가 들어 있다)의
 *      라벨이 「📝 레벨 **테스트**」 로 «띄어쓰기» 가 있었다. 검색은 라벨 글자를
 *      그대로 대조하므로, 붙여 쓴 검색어 「레벨테스트」 에는 영영 안 걸렸다.
 *      대신 띄어쓰기가 없는 「🏅 레벨테스트 배치 현황」(카페24 집계) 만 떴다.
 *   ② 별칭표(MENU_ALIASES)에 '레벨테스트' 항목이 «있긴 했는데» 엉뚱하게
 *      card-students-mgmt(학생 관리) 를 가리키고 있었다.
 *
 * 이 하니스가 지키는 것
 *   - 공백을 무시한 대조가 살아 있을 것 (레벨테스트 ↔ 레벨 테스트)
 *   - 「레벨테스트」·「레벨 테스트」·「level test」 의 1순위가 card-level-tests 일 것
 *   - 그렇다고 「등록」 같은 일반어까지 이 카드가 가로채지 않을 것
 *   - 모든 별칭의 목적지 카드가 admin.html 에 실제로 존재할 것 (죽은 바로가기 금지)
 *   - 그 카드 안에 신청·등록 결과 표가 실제로 있을 것
 *
 * ⚠️ 실제 배포되는 searchAllFor() 소스를 그대로 떼어 실행한다. 로직을 베껴 쓰면
 *    베낀 쪽만 통과하는 «가짜 검사» 가 된다.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CORE = readFileSync(join(ROOT, 'cloudflare-deploy/public/js/adm-core.js'), 'utf8');
const HTML = readFileSync(join(ROOT, 'cloudflare-deploy/public/admin.html'), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
const check = (name, ok) => { if (ok) { PASS++; console.log('  ✅ ' + name); } else { FAIL++; FAILS.push(name); console.log('  ❌ ' + name); } };

console.log('\n════════ 관리자 통합검색 · 레벨테스트 ════════\n');

// ── 1. 실제 소스에서 searchAllFor 본문을 통째로 떼어 온다 ───────────────
function sliceFunction(src, header) {
  const start = src.indexOf(header);
  if (start < 0) return null;
  let i = src.indexOf('{', start), depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(start, j + 1); }
  }
  return null;
}
const fnSrc = sliceFunction(CORE, 'function searchAllFor(q)');
check('searchAllFor() 소스를 찾았다', !!fnSrc);
if (!fnSrc) { console.log('\n  통과 ' + PASS + ' · 실패 ' + FAIL + '\n'); process.exit(1); }

// ── 2. 별칭표(MENU_ALIASES)도 실제 소스에서 읽는다 ─────────────────────
const aliasBlock = CORE.slice(CORE.indexOf('var MENU_ALIASES = ['));
const aliasArr = aliasBlock.slice(aliasBlock.indexOf('['), aliasBlock.indexOf('];') + 1);
let ALIASES = [];
try { ALIASES = eval(aliasArr); } catch (e) { /* 아래 check 가 잡는다 */ }
check('MENU_ALIASES 를 파싱했다 (' + ALIASES.length + '건)', ALIASES.length > 10);

// ── 3. admin.html 의 진짜 메뉴카드 라벨 목록 ──────────────────────────
//    (buildMenuIndex 와 같은 방식: details.menu-card 의 summary span data-ko/en)
//    ⚠️ id 와 class 의 «순서» 는 파일마다 제각각이다. 한쪽 순서만 보는 정규식을 쓰면
//       카드를 몇 개 놓치고, 그 빠진 카드 때문에 순위 검사가 엉뚱하게 통과/실패한다.
const cards = [];
const cardRe = /<details([^>]*)>([\s\S]{0,900}?)<\/summary>/g;
for (const m of HTML.matchAll(cardRe)) {
  const attrs = m[1];
  if (!/class="[^"]*menu-card[^"]*"/.test(attrs)) continue;
  const id = (attrs.match(/id="([^"]+)"/) || [])[1];
  if (!id) continue;
  const ko = (attrs.match(/data-menu-label-ko="([^"]*)"/) || [])[1] || (m[2].match(/data-ko="([^"]*)"/) || [])[1];
  const en = (attrs.match(/data-menu-label-en="([^"]*)"/) || [])[1] || (m[2].match(/data-en="([^"]*)"/) || [])[1];
  if (ko) cards.push({ id, ko, en: en || ko });
}
//    ⚠️ 화면에서는 카드 라벨 앞 이모지가 런타임에 떨어져 나간다(브라우저에서 실측:
//       data-ko="💌 신규상담 → 등록 전환" → 실제 색인 라벨 "신규상담 → 등록 전환").
//       순위는 «매칭 위치» 로 갈리므로, 이모지를 붙인 채 검사하면 글자 위치가 2~3칸씩
//       밀려 화면과 다른 순위가 나온다 — 그대로 두면 이 하니스가 거짓말을 한다.
const _deEmoji = s => String(s || '').replace(/^[^a-zA-Z0-9가-힣ㄱ-ㅎ]+/u, '').trim();
cards.forEach(c => { c.ko = _deEmoji(c.ko); c.en = _deEmoji(c.en); });
check('admin.html 에서 메뉴카드 라벨을 읽었다 (' + cards.length + '개)', cards.length > 40);
check('찾던 카드 card-level-tests 가 존재한다', cards.some(c => c.id === 'card-level-tests'));
check('집계 카드 card-leveltest(배치 현황) 도 그대로 존재한다', cards.some(c => c.id === 'card-leveltest'));

// ── 4. 색인을 buildMenuIndex 와 동일한 순서·모양으로 구성 ─────────────
const _globalSearchIndex = cards.map(c => ({
  kind: 'menu', label: c.ko, labelEn: c.en, sub: '', _target: c.id
}));
const aliasIds = new Set(cards.map(c => c.id));
ALIASES.forEach(a => {
  _globalSearchIndex.push({
    kind: 'menu', label: a.label, labelEn: a.en || a.label,
    sub: a.kw, top: !!a.top, _target: a.card
  });
});

// 떼어 온 진짜 함수를 색인에 물려 실행
const searchAllFor = new Function('_globalSearchIndex', fnSrc + '; return searchAllFor;')(_globalSearchIndex);
const topHit = q => (searchAllFor(q)[0] || {})._target;
const hitIds = q => searchAllFor(q).map(h => h._target);

// ── 5. 본안 ───────────────────────────────────────────────────────────
check('①「레벨테스트」(붙여씀) 1순위 = card-level-tests  [현재: ' + topHit('레벨테스트') + ']',
  topHit('레벨테스트') === 'card-level-tests');
check('②「레벨 테스트」(띄어씀) 1순위 = card-level-tests  [현재: ' + topHit('레벨 테스트') + ']',
  topHit('레벨 테스트') === 'card-level-tests');
check('③「level test」(영문) 1순위 = card-level-tests  [현재: ' + topHit('level test') + ']',
  topHit('level test') === 'card-level-tests');
check('④「레벨」 1순위 = card-level-tests', topHit('레벨') === 'card-level-tests');

// 공백무시 대조 자체가 살아 있는가 — ①이 별칭 덕에만 통과하는 «가짜» 를 막는다
check('⑤ 공백무시 대조가 산다 —「레벨테스트」로 라벨이 「레벨 테스트」인 카드도 걸린다',
  hitIds('레벨테스트').includes('card-level-tests') &&
  /replace\(\/\\s\+\/g/.test(fnSrc));

// 집계 카드는 사라지면 안 된다 (없앤 게 아니라 순서만 바꾼 것)
check('⑥ 집계 카드(배치 현황)도 결과에 그대로 남는다',
  hitIds('레벨테스트').includes('card-leveltest'));

// 일반어 가로채기 금지
check('⑦「등록」의 1순위를 레벨테스트가 가로채지 않는다  [현재: ' + topHit('등록') + ']',
  topHit('등록') !== 'card-level-tests');
check('⑧「학생」의 1순위를 레벨테스트가 가로채지 않는다  [현재: ' + topHit('학생') + ']',
  topHit('학생') !== 'card-level-tests');
check('⑨ 한 글자 검색이 과매칭되지 않는다 (「ㄱ」 결과 0건)', searchAllFor('ㄱ').length === 0);

// ── 6. 죽은 바로가기 금지 — 별칭 목적지가 실제로 있는 id 여야 한다 ────
//    (이번 사고의 ②번: 별칭이 엉뚱한 카드를 가리켜도 아무도 몰랐다)
const SUB_IDS = new Set([...HTML.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
const dead = ALIASES.filter(a => !aliasIds.has(a.card) && !SUB_IDS.has(a.card)).map(a => a.card);
check('⑩ 모든 별칭의 목적지가 admin.html 에 실제로 있다' + (dead.length ? ' (없음: ' + dead.join(', ') + ')' : ''),
  dead.length === 0);
check('⑪ 레벨테스트 별칭이 학생관리(옛 오배선)로 가지 않는다',
  !ALIASES.some(a => /레벨테스트/.test(a.kw) && a.card === 'card-students-mgmt'));

// ── 7. 도착지에 «학생 등록 결과» 표가 실제로 있는가 ────────────────────
const ltCard = HTML.slice(HTML.indexOf('id="card-level-tests"'));
const ltBody = ltCard.slice(0, ltCard.indexOf('</details>') + 10);
check('⑫ 도착 카드 안에 「레벨테스트 신청 현황」 영역이 있다', /레벨테스트 신청 현황/.test(ltBody));
check('⑬ 그 영역의 검색·필터 입력(lt-apps-q)이 있다', /id="lt-apps-q"/.test(ltBody));
check('⑭ 목록 로더 loadLeveltestApps() 가 존재한다', /function loadLeveltestApps\s*\(/.test(CORE));
/* ⑮ (2026-08-13 수정요청 #02 로 계약이 바뀜)
   예전에는 «부팅 때 Promise.allSettled 안에서 부른다» 를 봤다. 이 검사가 지키려던 것은
   «검색·손자메뉴로 이 카드에 도착했을 때 표가 비어 있으면 안 된다» 이지, 부팅에 부르는 것 자체가
   아니었다. 부팅 통짜 로드가 첫 화면을 밀어내서(#02) 카드를 «열 때» 받도록 바꿨으므로,
   이제는 그 경로가 살아 있는지를 본다 —
     · CARD_LOADERS 의 card-level-tests 에 매달려 있고
     · 카드가 열리면 toggle 한 곳에서 그 로더를 돌린다
   도착 경로는 전부 카드를 «연다»(사이드바 c.open=true · ia6 showOnly · ph125Jump host.open=true)
   ⚠️ 되돌리려면 두 줄 다 되돌려야 한다. 한쪽만 지우면 도착했을 때 표가 빈 채로 남는다. */
check('⑮ 카드를 열면 loadLeveltestApps() 가 돌도록 매달려 있다',
  /'card-level-tests':\s*\[[^\]]*loadLeveltestApps[^\]]*\]/.test(CORE) &&
  /runCardLoaders\(d\.id\);/.test(CORE));

// ── 8. 사이드바 손자 메뉴(ph125) — «이름만 다르고 동작이 같은» 항목 금지 ──────
/* 2026-08-06: 이 카드의 손자 4개(레벨 테스트/결과 조회/레벨 변경/히스토리)는 전부 같은 동작이었다.
   ph125Jump 의 옛 방식이 «카드 안 N번째 details» 로 찾아가는데 이 카드엔 그런 게 0개라
   무엇을 눌러도 카드 전체가 한 번 반짝이고 끝났다 — 에러가 안 나서 아무도 몰랐다. */
const R25 = readFileSync(join(ROOT, 'cloudflare-deploy/public/js/adm-r25.js'), 'utf8');
const S11 = readFileSync(join(ROOT, 'cloudflare-deploy/public/js/adm-s11.js'), 'utf8');

const gcBlock = R25.slice(R25.indexOf("'card-level-tests':"));
const gcArr = gcBlock.slice(gcBlock.indexOf('['), gcBlock.indexOf('],') + 1);
let GC = [];
try { GC = eval(gcArr); } catch (e) { /* 아래 check 가 잡는다 */ }
check('⑯ 레벨테스트 손자를 파싱했다 (' + GC.length + '개)', GC.length >= 2);
check('⑰ 손자가 전부 «목적지를 가진 객체» 다 (문자열 = 위치로 찾아감 → 금지)',
  GC.length > 0 && GC.every(g => g && typeof g === 'object'));

/* ⚠️ 문자열 항목에 g.anchor 를 물으면 String.prototype.anchor(내장 함수)가 나와서
   «목적지가 있다» 로 오판한다. 반드시 객체인지 먼저 확인할 것. */
const isObj = g => !!g && typeof g === 'object';
const noDest = GC.filter(g => !(isObj(g) && (g.anchor || g.card || g.fn))).map(g => (isObj(g) && g.ko) || String(g));
check('⑱ 목적지 없는 손자가 0개' + (noDest.length ? ' (발견: ' + noDest.join(', ') + ')' : ''), noDest.length === 0);

// 서로 다른 곳으로 가는가 — 같은 목적지 둘이면 «이름만 다른 버튼» 이 다시 생긴 것
const dests = GC.map(g => isObj(g) ? ((g.card || 'card-level-tests') + '#' + (g.anchor || g.fn || '')) : 'card-level-tests#(위치로찾아감)');
check('⑲ 손자들의 목적지가 서로 다르다 (' + new Set(dests).size + '/' + dests.length + ')',
  new Set(dests).size === dests.length);

const badAnchor = GC.filter(g => isObj(g) && g.anchor && !new RegExp('id="' + g.anchor + '"').test(HTML)).map(g => g.anchor);
const badCard   = GC.filter(g => isObj(g) && g.card   && !new RegExp('id="' + g.card   + '"').test(HTML)).map(g => g.card);
const badFn     = GC.filter(g => isObj(g) && g.fn     && !new RegExp('function\\s+' + g.fn + '\\s*\\(').test(CORE)).map(g => g.fn);
check('⑳ 손자가 가리키는 앵커가 admin.html 에 실제로 있다' + (badAnchor.length ? ' (없음: ' + badAnchor.join(', ') + ')' : ''), badAnchor.length === 0);
check('㉑ 손자가 가리키는 카드가 실제로 있다' + (badCard.length ? ' (없음: ' + badCard.join(', ') + ')' : ''), badCard.length === 0);
check('㉒ 손자가 부르는 함수가 실제로 있다' + (badFn.length ? ' (없음: ' + badFn.join(', ') + ')' : ''), badFn.length === 0);
check('㉓ 한/영 라벨이 둘 다 있다 (강사·매니저 다수 필리핀)', GC.length > 0 && GC.every(g => isObj(g) && g.ko && g.en));
check('㉔ ph125Jump 가 앵커/다른카드/함수 분기를 가진다',
  /desc\.anchor/.test(R25) && /desc\.card/.test(R25) && /desc\.fn/.test(R25));

/* 🔴 이게 없으면 손자 메뉴를 «열 방법이 아예 없다».
   ph97(adm-s11.js)은 window 캡처에서 «.ph85-sub 안의 모든 클릭» 을 삼킨다.
   ▸ 토글은 그 .ph85-sub 의 자식이라 함께 삼켜져, 토글 리스너가 한 번도 실행되지 않았다. */
check('㉕ ph97 이 ▸ 손자 토글 클릭을 통과시킨다 (없으면 손자 메뉴를 열 수 없다)',
  /ph125-toggle[\s\S]{0,40}\)\s*\)\s*return;/.test(S11) || /closest\([^)]*ph125-toggle[^)]*\)\)\s*return;/.test(S11));

console.log(`\n─────────────────────────────────────────────`);
console.log(`  ✅ PASS ${PASS}    ⚠ FAIL ${FAIL}   (총 ${PASS + FAIL})`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach(f => console.log('   · ' + f)); }
console.log(`─────────────────────────────────────────────\n`);
process.exit(FAIL ? 1 : 0);
