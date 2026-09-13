#!/usr/bin/env node
/* ============================================================
   sidebar_menu_parity_harness.mjs — 사이드바 «두 벌» 이 같은 말을 하는가

   이 저장소의 왼쪽 메뉴는 정본이 둘이다.
     ① 홈(index.html)의 인라인 드로어  #mg-drawer
     ② 그 밖 26개 화면의 공용 사이드바  js/mg-sidebar.js
   ②는 홈에서 스스로 물러나므로(mg-sidebar.js 첫머리) 둘이 겹치지 않고,
   그래서 «한쪽만 고쳐도 아무 에러가 안 난다».

   📜 2026-09-12 실측: 그렇게 11칸이 벌어져 있었다. AI 글쓰기 화면에서
      사이드바를 열어도 «AI 글쓰기»가 없어서, 새 AI 학습 도구로 가려면
      학생이 홈으로 나갔다 다시 들어와야 했다.

   ⚠️ 문자열로 «그 글자가 있는가» 를 묻지 않는다. 표와 렌더 함수를 오려 내
      실제로 돌려서 «무엇이 그려지는가» 를 보고, 기대값은 홈에서 «읽어» 온다
      (⛔ 주소·라벨을 이 파일에 손으로 적지 말 것 — 자기가 적은 값을 검사하게 된다).

   ⚠️ 홈의 mgGo(x) 는 공용의 mgGo 와 «다른 일» 을 한다 — 주소 이동이 아니라
      홈 안의 카드 버튼을 대신 클릭한다(index.html). 그래서 주소 대조는 홈이
      location.href 로 «주소를 직접 적은» 항목에서만 성립하고, 나머지는 ④가
      «라벨» 로 짝을 확인한다.
   ============================================================ */
import fs from 'node:fs';

const PUB  = 'cloudflare-deploy/public';
const src  = fs.readFileSync(`${PUB}/js/mg-sidebar.js`, 'utf8');
const home = fs.readFileSync(`${PUB}/index.html`, 'utf8');

let pass = 0, fail = 0;
const ok  = (t) => { pass++; console.log('  OK  ' + t); };
const bad = (t) => { fail++; console.log('  X   ' + t); };

/* ── 공용 사이드바를 실제로 돌린다 ─────────────────────────── */
let M = null, nav = '';
try {
  const i = src.indexOf('var URLS = {');
  const j = src.indexOf('function inject()', i);
  if (i < 0 || j < 0) throw new Error('표·렌더 함수를 못 오려냄');
  M = new Function(src.slice(i, j) + '\n; return { URLS, ITEMS, GROUPS, buildNav, byGo };')();
  nav = M.buildNav();
} catch (e) {
  bad('전제: 공용 사이드바를 오려 내 실행 — ' + e.message);
}
if (!M || !nav) {                       /* 전제가 깨지면 아래 검사가 조용히 사라진다 */
  console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
  process.exit(1);
}
ok(`전제: 공용 사이드바를 실행해 ${M.ITEMS.length}개 항목을 그렸다`);

/* ── 홈 드로어(정본)에서 «라벨 → 주소» 를 읽어온다 ─────────── */
const s0 = home.indexOf('id="mg-drawer"');
const drawer = home.slice(s0, home.indexOf('</aside>', s0));
const homeMap = new Map();
for (const m of drawer.matchAll(/onclick="([^"]*)"[^>]*data-ko="([^"]*)"[^>]*data-en="([^"]*)"/g)) {
  const href = /location\.href='([^']+)'/.exec(m[1]);
  homeMap.set(m[2], { url: href ? href[1] : null, en: m[3] });
}
homeMap.size >= 20
  ? ok(`전제: 홈 드로어에서 ${homeMap.size}개 항목을 읽었다`)
  : bad(`전제: 홈 드로어를 못 읽었다(${homeMap.size}개) — 아래 대조가 헛돈다`);

/* ── ① 홈이 주소를 직접 적은 메뉴는 같은 곳을 가리키는가 ──── */
console.log('\n① 홈이 주소를 직접 적은 메뉴는 «같은 이름·같은 주소» 인가');
let checked = 0;
for (const it of M.ITEMS) {
  const h = homeMap.get(it.ko);
  if (!h || !h.url) continue;
  checked++;
  const mine = M.URLS[it.go];
  if (mine !== h.url)      bad(`${it.ko} — 주소 다름: 공용 ${mine} / 홈 ${h.url}`);
  else if (h.en !== it.en) bad(`${it.ko} — 영어 라벨 다름: "${it.en}" / 홈 "${h.en}"`);
  else ok(`${it.ko} -> ${mine}`);
}
checked >= 7
  ? ok(`주소까지 대조한 항목 ${checked}개`)
  : bad(`대조한 항목이 ${checked}개뿐 — 라벨이 어긋나 짝을 못 찾고 있다`);

/* ── ② 새 AI 학습 도구가 홈 밖 화면에서도 «그려지는가» ────── */
console.log('\n② AI 학습 도구가 홈 밖 26개 화면에서도 보이는가');
for (const go of ['today','judgment','ai-friend','ai-write','micro-quiz','review-quiz-cn','vocab']) {
  const it = M.byGo(go);
  if (!it)                                 bad(`${go} — ITEMS 에서 사라짐`);
  else if (!nav.includes(`mgGo('${go}')`)) bad(`${it.ko} — 그려지지 않음(GROUPS 등록 누락)`);
  else ok(`${it.ko}`);
}

/* ── ③ 갈 곳 없는 버튼이 없는가 ───────────────────────────── */
console.log('\n③ 눌러도 홈으로만 가는 «죽은 버튼» 이 없는가');
const noUrl = M.ITEMS.filter(it => !M.URLS[it.go]);
noUrl.length ? bad('주소 없음: ' + noUrl.map(i => i.ko).join(', '))
             : ok(`${M.ITEMS.length}개 전부 갈 곳이 있다`);

/* ── ④ 홈에만 있는 것 — FAIL 이 아니라 «이름을 찍어» 알린다 ──
   교사 소개·녹화 보기·체험수업은 홈에서만 도는 함수를 부른다(gridActions·MangoFlow·
   openTrialSignup). 그 함수는 홈 밖 26개 화면에 없고, 주소로 여는 길도 없다.
   길을 내려면 index.html(공동 금지구역·첫 화면 예산)에 파라미터를 새로 만들어야 한다.
   ⛔ 주소 없이 목록에 넣지 말 것 — «보이는데 눌러도 홈으로 가는» 버튼이 된다. */
console.log('\n④ 홈에만 있고 공용에는 없는 메뉴 (사람 결정 대기 · FAIL 아님)');
let pending = 0;
for (const [ko] of homeMap) {
  if (ko === '메뉴' || ko === '망고아이란?') continue;
  if (M.ITEMS.some(it => it.ko === ko)) continue;
  pending++;
  console.log(`  ..  ${ko} — 홈에서만 도는 함수를 불러서 옮길 주소가 없다`);
}
if (!pending) console.log('  (없음 — 두 메뉴판의 항목이 같다)');

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
