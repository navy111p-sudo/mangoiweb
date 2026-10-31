#!/usr/bin/env node
/* ============================================================
   sidebar_menu_parity_harness.mjs — 사이드바 «두 벌» 이 같은 말을 하는가

   이 저장소의 왼쪽 메뉴는 정본이 둘이다.
     ① 홈(index.html)의 인라인 드로어  #mg-drawer
     ② 그 밖 25개 화면의 공용 사이드바  js/mg-sidebar.js
   홈은 ②를 «싣지 않는다»(실측 2026-09-13: <script src> 25곳, index.html 없음).
   그래서 둘이 겹치지 않고 «한쪽만 고쳐도 아무 에러가 안 난다».
   ⚠️ mg-sidebar.js 첫머리의 `if (getElementById('mg-drawer')) return;` 은
      «혹시 실수로 실어도» 를 막는 안전망이지, 지금 실제로 도는 경로가 아니다.
      그것을 믿고 홈에 이 파일을 싣지 말 것(모양이 다른 메뉴가 겹친다).

   📜 2026-09-12 실측: 그렇게 11칸이 벌어져 있었다. AI 글쓰기 화면에서
      사이드바를 열어도 «AI 글쓰기»가 없어서, 새 AI 학습 도구로 가려면
      학생이 홈으로 나갔다 다시 들어와야 했다.

   ⚠️ 문자열로 «그 글자가 있는가» 를 묻지 않는다. 표와 렌더 함수를 오려 내
      실제로 돌려서 «무엇이 그려지는가» 를 보고, 기대값은 홈에서 «읽어» 온다
      (⛔ 주소·라벨을 이 파일에 손으로 적지 말 것 — 자기가 적은 값을 검사하게 된다).

   ⚠️ 홈의 mgGo(x) 는 공용의 mgGo 와 «다른 일» 을 한다 — 주소 이동이 아니라
      홈 안의 카드 버튼을 대신 클릭한다(index.html). 그래서 «주소가 같은가» 는
      홈이 location.href 로 직접 적은 항목에서만 묻고, 나머지는 «이름이 짝이
      맞는가» 로 묻는다.

   🪤 2026-09-13 함정 대조가 이 파일의 구멍 셋을 잡았다 — 셋 다 실측으로 재현했다.
      ㉠ ②절이 「GROUPS 등록 누락」이라는 «이름» 을 달고 실제로는 「ITEMS 에
         있는가」만 쟀다. buildNav 의 «기타» 안전망이 그룹 밖 항목을 다시 그려
         주므로 GROUPS 에서 빼도 nav 에는 남는다 → PASS 22 / exit 0 이었다.
      ㉡ ①절이 홈 라벨로 짝을 찾다 «못 찾으면 continue» 라, 한국어 라벨이
         어긋난 항목이 FAIL 이 아니라 «검사에서 조용히 사라졌다»(PASS 22→21).
      ㉢ 그래서 ITEMS 에서 항목을 통째로 지워도 초록불이었다(refund 실측).
      ⛔ ①을 다시 «ITEMS 를 돌며 홈을 찾는» 방향으로 되돌리지 말 것 —
         빠진 것을 원리상 못 본다. «홈에 갈 곳이 있는 메뉴» 쪽에서 물어야 한다.
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

/* ── 홈 드로어(정본)에서 «라벨 → 갈 곳» 을 읽어온다 ─────────── */
const s0 = home.indexOf('id="mg-drawer"');
const drawer = home.slice(s0, home.indexOf('</aside>', s0));
const homeMap = new Map();
for (const m of drawer.matchAll(/onclick="([^"]*)"[^>]*data-ko="([^"]*)"[^>]*data-en="([^"]*)"/g)) {
  const href = /location\.href='([^']+)'/.exec(m[1]);
  const go   = /mgGo\('([^']+)'\)/.exec(m[1]);
  homeMap.set(m[2], { url: href ? href[1] : null, go: go ? go[1] : null, en: m[3] });
}
homeMap.size >= 20
  ? ok(`전제: 홈 드로어에서 ${homeMap.size}개 항목을 읽었다`)
  : bad(`전제: 홈 드로어를 못 읽었다(${homeMap.size}개) — 아래 대조가 헛돈다`);

/* «갈 곳이 있는 메뉴» = 주소를 직접 적었거나, mgGo 코드가 공용 주소표에 있는 것.
   ⛔ 이 수를 상수로 못 박지 말 것(메뉴가 늘면 멀쩡한 수리가 빨간불이 된다) —
      «충분히 많이 대조했는가» 의 바닥만 둔다. */
const homeLinkable = [...homeMap].filter(([ko, h]) => ko !== '메뉴' && (h.url || (h.go && M.URLS[h.go])));
homeLinkable.length >= 10
  ? ok(`전제: 홈에서 «갈 곳이 있는» 메뉴 ${homeLinkable.length}개를 대조 대상으로 잡았다`)
  : bad(`전제: 대조 대상이 ${homeLinkable.length}개뿐 — 읽기가 깨졌다`);

/* ── ① 홈에 «갈 곳이 있는» 메뉴는 공용에도 같은 이름으로 있는가 ──
   🪤 방향이 중요하다. «홈 → 공용» 으로 물어야 «공용에서 빠진 것» 과
      «이름이 어긋난 것» 이 드러난다. 반대로 물으면 둘 다 조용히 지나간다. */
console.log('\n① 홈에 갈 곳이 있는 메뉴가 공용에도 «같은 이름·같은 주소» 로 있는가');
let checked = 0;
for (const [ko, h] of homeLinkable) {
  const it = M.ITEMS.find(x => x.ko === ko);
  if (!it) {
    bad(`${ko} — 홈에는 있는데(${h.url || 'mgGo:' + h.go}) 공용에 그 이름이 없다 — 라벨이 어긋났거나 빠졌다`);
    continue;
  }
  checked++;
  const mine = M.URLS[it.go];
  if (h.url && mine !== h.url)     bad(`${ko} — 주소 다름: 공용 ${mine} / 홈 ${h.url}`);
  else if (h.go && it.go !== h.go) bad(`${ko} — 코드 다름: 공용 '${it.go}' / 홈 '${h.go}'`);
  else if (h.en !== it.en)         bad(`${ko} — 영어 라벨 다름: "${it.en}" / 홈 "${h.en}"`);
  else ok(`${ko} -> ${mine}`);
}
checked === homeLinkable.length
  ? ok(`갈 곳이 있는 ${checked}개 전부 짝이 맞는다`)
  : bad(`${homeLinkable.length}개 중 ${checked}개만 짝을 찾았다 — 나머지는 위에 FAIL 로 찍혔다`);

/* ── ② 새 AI 학습 도구가 «제 그룹 안에» 그려지는가 ──────────
   ⛔ 「nav 에 있는가」로만 묻지 말 것 — buildNav 의 «기타» 안전망이
      그룹에서 빠진 항목도 다시 그려 준다(그래서 GROUPS 를 지워도 통과했다).
      ①«GROUPS 에 선언됐는가»(값을 본다) ②«기타 머리글보다 위에 그려졌는가»
      둘을 짝으로 묻는다. */
console.log('\n② AI 학습 도구가 홈 밖 25개 화면에서 «제 그룹 안에» 보이는가');
const restAt = nav.indexOf('data-ko="기타"');
for (const go of ['today','judgment','ai-friend','ai-write','micro-quiz','review-quiz-cn','vocab']) {
  const it = M.byGo(go);
  if (!it) { bad(`${go} — ITEMS 에서 사라짐`); continue; }
  const declared = M.GROUPS.some(g => g.go.indexOf(go) >= 0);
  const at = nav.indexOf(`mgGo('${go}')`);
  if (at < 0)                            bad(`${it.ko} — 아예 그려지지 않음`);
  else if (!declared)                    bad(`${it.ko} — GROUPS 에 등록 안 됨(«기타» 안전망으로만 그려진다)`);
  else if (restAt >= 0 && at > restAt)   bad(`${it.ko} — «기타» 아래로 밀렸다`);
  else ok(`${it.ko}`);
}

/* ── ③ 갈 곳 없는 버튼이 없는가 ───────────────────────────── */
console.log('\n③ 눌러도 홈으로만 가는 «죽은 버튼» 이 없는가');
const noUrl = M.ITEMS.filter(it => !M.URLS[it.go]);
noUrl.length ? bad('주소 없음: ' + noUrl.map(i => i.ko).join(', '))
             : ok(`${M.ITEMS.length}개 전부 갈 곳이 있다`);

/* ── ④ 홈에서만 도는 함수를 부르는 메뉴 — «사람 결정 대기» ──
   교사 소개·녹화 보기·체험수업은 홈에서만 도는 함수를 부른다(gridActions·MangoFlow·
   openTrialSignup). 그 함수는 홈 밖 25개 화면에 없고, 주소로 여는 길도 없다.
   길을 내려면 index.html(공동 금지구역·첫 화면 예산)에 파라미터를 새로 만들어야 한다.
   ⛔ 주소 없이 목록에 넣지 말 것 — «보이는데 눌러도 홈으로 가는» 버튼이 된다.
   ⚠️ 여기에는 «갈 곳이 없는» 것만 적는다. 갈 곳이 있는데 빠진 것은 ①이 FAIL 로
      잡는다 — 안 가르면 라벨이 어긋난 멀쩡한 메뉴를 «옮길 주소가 없다» 고
      «거짓으로» 설명하게 된다(2026-09-13 실측으로 그 상태였다). */
console.log('\n④ 홈에서만 도는 함수를 부르는 메뉴 (사람 결정 대기 · FAIL 아님)');
let pending = 0;
for (const [ko, h] of homeMap) {
  if (ko === '메뉴') continue;
  if (M.ITEMS.some(it => it.ko === ko)) continue;
  if (h.url || (h.go && M.URLS[h.go])) continue;   /* 갈 곳이 있는 것은 ①이 잡는다 */
  pending++;
  console.log(`  ..  ${ko} — 홈에서만 도는 함수를 불러서 옮길 주소가 없다`);
}
if (!pending) console.log('  (없음 — 옮길 수 있는 메뉴는 전부 옮겨져 있다)');

/* ── ⑤ «도착지가 홈» 인 죽은 버튼이 없는가 ───────────────────
   🪤 ③은 «주소가 «없는»가» 만 물어서 이 결함을 원리상 못 봤다. 「전체메뉴」는 주소가
      없는 게 아니라 «홈» 이라 `URLS[go]` 가 truthy 였고, ①도 홈·공용이 둘 다 '/' 라
      «일치» 로 통과시켰으며, ④는 «갈 곳이 있다» 며 건너뛰었다 — 세 절이 나란히 초록불인
      채로 사장님이 「전체 메뉴 누르면 홈화면으로만 가」를 제보하셨다(2026-09-14).
      공용 사이드바는 «주소로만» 옮겨 가므로(mgGo → location.href), 주소가 '/' 뿐이면
      그 화면에서 그 메뉴는 홈으로 «가기만» 하고 아무것도 열지 못한다.
   ⛔ ALLOW 를 «조용히 넘기는 자리» 로 쓰지 말 것 — 이름과 «왜 아직 그대로인가» 를 함께
      적고, 목록에 없는 것이 새로 생기면 FAIL 로 잡는다. */
const HOME_ONLY_ALLOW = {
  'about': '홈 퀵버튼 openAboutMangoi() 를 부른다 — ?menu=about 을 낼지 사람이 결정(2026-09-14)',
};
console.log('\n⑤ 공용에서 «홈으로 가기만 하는» 메뉴가 없는가');
const homeOnly = M.ITEMS.filter(it => M.URLS[it.go] === '/');
let waiting = 0;
for (const it of homeOnly) {
  if (HOME_ONLY_ALLOW[it.go]) { waiting++; console.log(`  🟡 남은 자리 — ${it.ko}: ${HOME_ONLY_ALLOW[it.go]}`); }
  else bad(`${it.ko}('${it.go}') — 주소가 '/' 뿐이다. 눌러도 홈으로만 가고 아무것도 안 열린다`);
}
ok(`'/' 로 가는 항목 ${homeOnly.length}개 — 그중 ${waiting}개가 «사람 결정 대기» 로 적혀 있다`);
/* 🪤 ALLOW 가 «죽은 항목» 으로 남지 않게 — 그 메뉴가 고쳐지거나 사라지면 그 줄은
   아무것도 안 잡으면서 «아직 남은 일이 있다» 고 거짓으로 말한다(CLAUDE.md 「죽은 검사」). */
for (const go of Object.keys(HOME_ONLY_ALLOW)) {
  homeOnly.some(it => it.go === go)
    ? ok(`ALLOW '${go}' — 아직 실재하는 자리다`)
    : bad(`ALLOW '${go}' — 이제 '/' 로 가지 않는다(고쳐졌거나 사라짐). 그 줄을 지우세요`);
}

/* ── ⑥ ?menu=X 로 보내 놓고 «받는 쪽» 이 없지 않은가 ─────────
   ⑤의 뒷면이다. 주소를 '/?menu=all-menu' 로 바꿔 두고 받는 절(js/idx-allmenu.js)을
   지우면, 버튼은 «갈 곳이 있으니» ③·⑤를 그대로 통과하는데 홈에 도착해서는 아무 일도
   일어나지 않는다 — 고친 것과 똑같은 죽은 버튼이 된다. 짝으로 묻는다.
   ⚠️ 이 절이 증명하는 것은 «받는 절이 «있다»» 까지다 — 조건을 `false &&` 로 막거나
      뒤집어도 그 글자는 남으므로 여기서는 통과한다. «실제로 무슨 일이 일어나는가» 는
      **⑦절이 오려 내 돌려서** 본다. 짝으로 읽을 것.
   ⚠️ `=== 'x'` 와 `!== 'x'` 를 둘 다 받는다 — 홈의 payment 갈래가 후자다. */
console.log('\n⑥ 공용이 ?menu= 로 보내는 곳마다 홈에 «받는 절» 이 있는가');
const receivers = new Set();
for (const f of [`${PUB}/index.html`, ...fs.readdirSync(`${PUB}/js`).filter(n => n.endsWith('.js')).map(n => `${PUB}/js/${n}`)]) {
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    if (line.indexOf("get('menu')") < 0) continue;
    for (const m of line.matchAll(/'([a-z0-9-]+)'/g)) receivers.add(m[1]);
  }
}
let sent = 0;
for (const [go, url] of Object.entries(M.URLS)) {
  const m = /^\/\?menu=([a-z0-9-]+)$/.exec(url || '');
  if (!m) continue;
  sent++;
  receivers.has(m[1]) ? ok(`?menu=${m[1]} — 받는 절이 있다`)
                      : bad(`?menu=${m[1]} — 보내기만 하고 홈에 받는 절이 없다(도착해도 아무 일도 안 일어난다)`);
}
sent >= 1 ? ok(`?menu= 로 보내는 주소 ${sent}개를 전부 대조했다`)
          : bad(`?menu= 주소를 한 개도 못 찾았다 — 읽기가 깨졌다(이 절이 헛돈다)`);

/* ── ⑦ 받는 절을 «오려 내 실제로 돌린다» ─────────────────────
   🪤 ⑥은 «그 코드가 menu 를 읽는 줄에 있는가» 까지만 본다. 조건을 `false &&` 로 막거나
      `===` 를 `!==` 로 **뒤집어도** `'all-menu'` 라는 글자는 그 줄에 그대로 남아
      ③·⑤·⑥이 **전부 통과합니다**(2026-09-14 함정 대조 → 실측 재현: 두 변이 다
      PASS 38 / exit 0). CLAUDE.md 「그 게이트를 라우트 «안» 에만 두지 마세요 …
      조건을 뒤집어도 그 글자가 그대로 남아 통과합니다」가 바로 이 자리다.
   🔴 하필 `!==` 뒤집기는 «파라미터가 없는 평범한 홈 방문마다 전체메뉴가 저절로 뜨는»
      회귀라, 걸리는 것이 학생 29,000명 전원의 첫 화면이다.
   ✅ 그래서 그 절을 소스에서 «오려 내» 가짜 location·history 로 **실제로 돌리고**
      «무슨 일이 일어나는가» 를 본다.
   ⚠️ 「열린다」 옆에 **«파라미터가 없으면 안 열린다» 를 짝으로** 둔다 —
      짝이 없으면 «언제나 열기» 도 통과한다.
   ⚠️ 「오려 냈다」를 **전제 검사 한 줄**로 박아 둔다 — 앵커가 어긋나면 아래가
      빈 문자열을 보고 조용히 통과한다. */
console.log('\n⑦ 받는 절(js/idx-allmenu.js)을 오려 내 실제로 돌린다');
const amSrc = fs.readFileSync(`${PUB}/js/idx-allmenu.js`, 'utf8');
const amAt = amSrc.indexOf('var _amQ = new URLSearchParams(location.search);');
let amBody = '';
if (amAt >= 0) {
  /* 중괄호 «짝» 으로 자른다 — 길이로 자르면 남의 코드가 딸려 온다(CLAUDE.md) */
  let d = 0, seen = false, end = -1;
  for (let i = amAt; i < amSrc.length; i++) {
    const c = amSrc[i];
    if (c === '{') { d++; seen = true; }
    else if (c === '}') { d--; if (seen && d === 0) { end = i + 1; break; } }
  }
  if (end > 0) amBody = amSrc.slice(amAt, end);
}
amBody.includes('openAllMenuOverlay()') && amBody.includes('replaceState')
  ? ok(`전제: 받는 절을 ${amBody.length}자 오려 냈다`)
  : bad('전제: 받는 절을 못 오려 냈다 — 아래 ⑦ 검사가 헛돈다(앵커 확인)');

/* 가짜 화면에서 한 번 돌려 본다. 돌려주는 것: 몇 번 열었나 · 남은 주소 */
function runReceiver(search) {
  const calls = [];
  const loc = { search, pathname: '/', hash: '' };
  const hist = { replaceState: (_a, _b, url) => { calls.push('url:' + url); } };
  let opened = 0;
  /* ⚠️ 부르는 자리까지 try 로 감싼다 — 변이가 문법을 깨뜨렸을 때 하니스가
     크래시하면 «무엇이 깨졌는지» 가 안 보인다(깔끔한 FAIL 로 떨어뜨린다) */
  try {
    new Function('location', 'history', 'openAllMenuOverlay', amBody)(
      loc, hist, () => { opened++; });
  } catch (e) { return { opened: -1, url: 'ERR:' + e.message }; }
  const u = calls.filter(x => x.startsWith('url:')).pop();
  return { opened, url: u ? u.slice(4) : null };
}

if (amBody) {
  const a = runReceiver('?menu=all-menu&x=1');
  a.opened === 1 ? ok('?menu=all-menu → 전체메뉴를 한 번 연다')
                 : bad(`?menu=all-menu 인데 ${a.opened}번 열었다 — 조건이 무력화됐다`);
  a.url === '/?x=1' ? ok('주소에서 menu «만» 지운다(다른 쿼리는 남긴다)')
                    : bad(`주소 정리가 틀렸다: ${JSON.stringify(a.url)} (기대 "/?x=1")`);

  /* 🪤 짝 — 이것이 없으면 «언제나 열기» 변이가 그대로 통과한다 */
  const b = runReceiver('?x=1');
  b.opened === 0 ? ok('파라미터가 없으면 «안» 연다(평범한 홈 방문은 그대로)')
                 : bad(`파라미터가 없는데 ${b.opened}번 열었다 — 홈을 여는 학생 전원이 걸린다`);
  b.url === null ? ok('파라미터가 없으면 주소를 건드리지 않는다')
                 : bad(`파라미터가 없는데 주소를 바꿨다: ${JSON.stringify(b.url)}`);

  const c = runReceiver('');
  c.opened === 0 ? ok('쿼리가 아예 없어도 «안» 연다')
                 : bad(`쿼리가 없는데 ${c.opened}번 열었다`);
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
