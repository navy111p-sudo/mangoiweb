#!/usr/bin/env node
/**
 * 🎯 홈 히어로 «2번 트랙»(A.i 학습) — 눌러서 「AI와 친구하기」 목록이 열리는가
 *
 * [왜 이 검사가 있나 — 2026-09-20 사장님 「2번은 A.i와 친구하기가 모두 나오게 해줘」]
 *   히어로 두 트랙 줄에서 2번(«8종 A.i 학습»)은 보기만 하는 글자였다. 누르면 그 목록이
 *   그 자리에서 열리게 바꿨는데, 이런 «눌리는가» 는 문자열 검사가 원리상 못 봅니다 —
 *   함수도 값도 다 «있고» 틀린 것은 «그 클릭이 어디로 가는가» 뿐입니다(CLAUDE.md 2장).
 *
 * ✅ 그래서 onclick 속성을 **오려 내 실제로 돌려** 답으로 묻습니다.
 *    「여는 함수가 있으면 그것을 부르고 주소 이동을 막는다」 옆에
 *    **「함수가 아직 없으면 «막지 않는다»(폴백이 산다)」를 짝으로** 둡니다 —
 *    짝이 없으면 «언제나 막기»(= href 폴백이 죽은 버튼)도 통과합니다.
 *
 * ⚠️ «무엇이 화면에 그려지는가»(대비·겹침·실제 클릭)는 여기서 못 잽니다.
 *    그쪽은 test-harness/manual/home-hero-track-browser.mjs — 자동으로 안 돕니다, 사람이 부릅니다.
 */
import { readFileSync } from 'node:fs';

/* ⛔ 변이시험 때 저장소 파일(공동 금지구역)을 직접 고쳤다 되돌리지 마세요 —
   HERO_SRC=<사본 경로> 로 가리킬 수 있습니다(CLAUDE.md 2장 「사본으로 되돌리세요」). */
const HTML = process.env.HERO_SRC || 'cloudflare-deploy/public/index.html';
const src = readFileSync(HTML, 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, d = '') => { c ? (pass++, console.log('  ✅ ' + n)) : (fail++, console.log('  ❌ ' + n + (d ? ' — ' + d : ''))); };

/* ── ① 2번 트랙이 «누를 수 있는 것» 인가 (마크업 계약) ───────────────────── */
console.log('① 2번 트랙 마크업');

// ⛔ 길이로 자르지 않습니다 — 여는 태그부터 짝이 되는 </a> 까지.
const openRe = /<a\b[^>]*class="ht-track ht-ai"[^>]*>/;
const om = openRe.exec(src);
ok('전제: <a class="ht-track ht-ai"> 를 찾았다', !!om);
if (!om) { console.log(`\n결과: PASS ${pass} / FAIL ${fail}`); process.exit(1); }
const openTag = om[0];
const end = src.indexOf('</a>', om.index);
const block = src.slice(om.index, end + 4);

ok('폴백 주소가 있다 (href="#" 아님)', /href="\/\?menu=aitools"/.test(openTag), openTag.slice(0, 120));
// ⛔ 두 i18n 엔진이 [data-ko] 요소의 textContent 를 통째로 갈아끼운다 — 안쪽 두 줄이 사라진다.
ok('⛔ <a> 자신에 data-ko/data-en 이 «없다»', !/\sdata-(ko|en)=/.test(openTag), openTag.slice(0, 160));
ok('설명은 data-ko-aria/data-en-aria 로 단다', /data-ko-aria=/.test(openTag) && /data-en-aria=/.test(openTag));

// 짝 — 안쪽 라벨은 여전히 번역된다(«전부 떼기» 도 통과하지 않게)
ok('짝: 안쪽 첫 줄은 여전히 data-ko/data-en 을 가진다', /class="ht-when"[^>]*data-ko=/.test(block));
ok('짝: 안쪽 둘째 줄 라벨도 data-ko/data-en 을 가진다', /<span data-ko="종 A\.i 학습"/.test(block));

// › 는 [data-ko] 요소의 «형제» 여야 한다 — 자식이면 🌐 한 번에 사라진다.
const what = /<span class="ht-what">([\s\S]*?)<\/span><\/a>/.exec(block.replace(/\s*<\/a>\s*$/, '</a>'));
const whatInner = what ? what[1] : (/<span class="ht-what">([\s\S]*)$/.exec(block) || ['', ''])[1];
ok('› 표시가 있다', /class="ht-go"[^>]*>(&rsaquo;|›)</.test(block), whatInner.slice(0, 160));
/* 🔴 «<a> 자신» 만 보면 반쪽입니다 — data-ko 를 «중간 어느 조상» 에 달아도 같은 사고가 납니다.
   두 i18n 엔진은 [data-ko] 요소의 textContent 를 통째로 갈아끼우므로, 그 «안» 에 있는
   <b>8</b> 과 <i>›</i> 가 DOM 에서 사라집니다(CLAUDE.md 2장 결재함 배지 건).
   ⚠️ 처음엔 이 검사가 `<span data-ko="…">…<i class="ht-go"` 라는 «모양» 만 봐서,
      .ht-what 에 data-ko 를 덧붙이는 변이를 20/0 으로 통과시켰습니다(실측).
      그래서 «조상 전부» 를 태그 짝으로 세어 봅니다. */
function elsWithDataKo(html) {
  const out = []; const re = /<(\w+)\b([^>]*?)(\/?)>/g; let m;
  while ((m = re.exec(html))) {
    if (m[3] === '/') continue;
    if (!/\sdata-(ko|en)=/.test(m[2])) continue;
    const name = m[1]; let depth = 1, end = -1;
    const tg = new RegExp('<(\\/?)' + name + '\\b[^>]*>', 'g'); tg.lastIndex = re.lastIndex;
    let t; while ((t = tg.exec(html))) { if (t[1]) { if (!--depth) { end = t.index; break; } } else depth++; }
    out.push({ name, attrs: m[2], inner: end >= 0 ? html.slice(re.lastIndex, end) : html.slice(re.lastIndex) });
  }
  return out;
}
const koEls = elsWithDataKo(block);
ok('전제: 트랙 안에 data-ko 요소가 실제로 있다 (라벨은 여전히 번역된다)', koEls.length >= 2, koEls.length + '개');
const swallow = koEls.filter(e => /<b\b/.test(e.inner) || /ht-go/.test(e.inner));
ok('⛔ <b>8</b>·<i>›</i> 를 «품은» data-ko 요소가 하나도 없다 (조상 전부)',
  swallow.length === 0, swallow.map(e => '<' + e.name + e.attrs + '>').join(' | ').slice(0, 180));

/* ── ② onclick 을 «실제로 돌려» 본다 ───────────────────────────────────── */
console.log('\n② onclick 을 오려 내 실제로 실행');
const oc = /onclick="([^"]+)"/.exec(openTag);
ok('전제: onclick 을 오려 냈다', !!oc);
if (oc) {
  const code = oc[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  let runner;
  try { runner = new Function('window', 'event', code); }
  catch (e) { ok('전제: onclick 이 문법상 실행 가능하다', false, String(e).slice(0, 120)); runner = null; }
  if (runner) {
    // ㉠ 여는 함수가 «있을 때»
    let called = 0, prevented = 0;
    const win = { openAiFriendsOverlay: () => { called++; } };
    const ev = { preventDefault: () => { prevented++; } };
    let ret;
    try { ret = runner.call(win, win, ev); } catch (e) { ok('함수가 있을 때 던지지 않는다', false, String(e).slice(0, 120)); }
    ok('함수가 있으면 그 함수를 부른다', called === 1, 'called=' + called);
    ok('함수가 있으면 주소 이동을 막는다', prevented === 1 && ret === false, 'prevented=' + prevented + ' ret=' + ret);

    // ㉡ 짝 — 아직 «없을 때» 는 막지 않는다(href 폴백이 산다)
    let called2 = 0, prevented2 = 0;
    const win2 = {};
    const ev2 = { preventDefault: () => { prevented2++; } };
    let ret2;
    try { ret2 = runner.call(win2, win2, ev2); } catch (e) { ok('함수가 없을 때 던지지 않는다', false, String(e).slice(0, 120)); }
    ok('짝: 함수가 없으면 아무것도 안 부른다', called2 === 0);
    ok('짝: 함수가 없으면 «막지 않는다» (폴백이 산다)', prevented2 === 0 && ret2 !== false, 'prevented=' + prevented2 + ' ret=' + ret2);
  }
}

/* ── ③ 그 이름이 «죽은 이름» 이 아닌가 ─────────────────────────────────── */
console.log('\n③ 부르는 이름이 실재하는가');
ok('window.openAiFriendsOverlay 를 같은 파일이 정의한다',
  /window\.openAiFriendsOverlay\s*=\s*function/.test(src));
// 폴백 주소를 받는 절도 살아 있어야 한다 (한쪽만 지우면 ①은 그대로 통과한다)
ok('짝: ?menu=aitools 를 «받는» 절이 살아 있다',
  /p\.get\('menu'\)\s*===\s*'aitools'/.test(src));

/* ── ④ 눌러도 되는 것처럼 «보이는가» (CSS 계약) ───────────────────────── */
console.log('\n④ CSS 계약');
const cssA = /\.home-tracks a\.ht-track\{([\s\S]*?)\}/.exec(src);
ok('전제: a.ht-track 규칙을 찾았다', !!cssA);
if (cssA) {
  ok('cursor:pointer', /cursor:\s*pointer/.test(cssA[1]));
  ok('밑줄·링크색을 지운다', /text-decoration:\s*none/.test(cssA[1]) && /color:\s*inherit/.test(cssA[1]));
}
ok('키보드 초점 표시가 있다', /\.home-tracks a\.ht-track:focus-visible\{/.test(src));
/* 손가락 표적을 «레이아웃을 안 바꾸고» 넓히는 자리 — 절대배치 가상요소라야 합니다.
   ⛔ padding·height 로 키우면 히어로 줄 높이가 함께 바뀝니다(사장님이 고른 배치). */
const hitCss = /\.home-tracks a\.ht-track::after\{([\s\S]*?)\}/.exec(src);
ok('손가락 표적을 넓히는 ::after 가 있다', !!hitCss);
if (hitCss) {
  ok('그 ::after 는 «흐름 밖» 이다 (position:absolute)', /position:\s*absolute/.test(hitCss[1]), hitCss[1]);
  ok('위아래로만 넓힌다 (좌우 0 — 옆 트랙 침범 금지)',
    /left:\s*0/.test(hitCss[1]) && /right:\s*0/.test(hitCss[1]) && /top:\s*-\d/.test(hitCss[1]) && /bottom:\s*-\d/.test(hitCss[1]), hitCss[1]);
  ok('짝: 그 기준이 되는 position:relative 가 <a> 에 있다',
    !!cssA && /position:\s*relative/.test(cssA[1]));
}
// ⛔ 금색은 밑의 CTA 몫 — 트랙이 금색을 쓰면 «지금 누를 것» 이 둘로 갈린다.
const goCss = /\.home-tracks \.ht-go\{([^}]*)\}/.exec(src);
ok('› 색이 CTA 금색(#fbbf24)이 아니다', !!goCss && !/#fbbf24/i.test(goCss[1]), goCss ? goCss[1] : 'none');

/* ── ⑤ 1번 트랙(화상수업)도 같은 계약을 지키는가 ──────────────────────
   [왜 2026-09-21 에 이었나] 둘이 똑같이 생겨 나란히 있는데 «오른쪽만» 눌려서,
   사장님이 「이거 두개 카드 연결된거야?」라고 물으셨습니다 — 화면이 어느 쪽이
   눌리는지 말해 주지 않던 상태입니다(CLAUDE.md 2장 「보이는데 안 눌리는 버튼」의 뒷면).
   ⛔ 이 절을 지우지 마세요 — 지우면 1번이 «다시 죽은 글자» 가 되어도 아무도 모릅니다. */
console.log('\n⑤ 1번 트랙(화상수업)');
const om1 = /<a\b[^>]*class="ht-track ht-live"[^>]*>/.exec(src);
ok('전제: <a class="ht-track ht-live"> 를 찾았다', !!om1);
if (om1) {
  const t1 = om1[0];
  const end1 = src.indexOf('</a>', om1.index);
  const blk1 = src.slice(om1.index, end1 + 4);
  ok('폴백 주소가 있다 (href="#" 아님)', /href="\/\?menu=about-tutor"/.test(t1), t1.slice(0, 120));
  ok('⛔ <a> 자신에 data-ko/data-en 이 «없다»', !/\sdata-(ko|en)=/.test(t1), t1.slice(0, 160));
  ok('설명은 data-ko-aria/data-en-aria 로 단다', /data-ko-aria=/.test(t1) && /data-en-aria=/.test(t1));
  ok('짝: 안쪽 두 줄은 여전히 번역된다', /class="ht-when"[^>]*data-ko=/.test(blk1) && /<span data-ko="원어민 화상수업"/.test(blk1));
  ok('› 표시가 있다 (2번과 같은 표시)', /class="ht-go"[^>]*>(&rsaquo;|›)</.test(blk1));
  const sw1 = elsWithDataKo(blk1).filter(e => /<b\b/.test(e.inner) || /ht-go/.test(e.inner));
  ok('⛔ <b>1:1</b>·<i>›</i> 를 «품은» data-ko 요소가 없다 (조상 전부)',
    sw1.length === 0, sw1.map(e => '<' + e.name + e.attrs + '>').join(' | ').slice(0, 180));

  /* onclick 을 오려 내 실제로 돌립니다 — 2번과 같은 이유(글자만 봐서는 «무슨 답이 나오는가» 를 못 봅니다) */
  const oc1 = /onclick="([^"]+)"/.exec(t1);
  ok('전제: onclick 을 오려 냈다', !!oc1);
  if (oc1) {
    let r1;
    try { r1 = new Function('window', 'event', oc1[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')); }
    catch (e) { ok('전제: onclick 이 실행 가능하다', false, String(e).slice(0, 120)); r1 = null; }
    if (r1) {
      let key = null, prevented = 0;
      const win = { openAboutMangoi: (k) => { key = k === undefined ? '(없음)' : k; } };
      let ret;
      try { ret = r1.call(win, win, { preventDefault: () => { prevented++; } }); }
      catch (e) { ok('함수가 있을 때 던지지 않는다', false, String(e).slice(0, 120)); }
      ok('함수가 있으면 그 함수를 부른다', key !== null, 'key=' + key);
      /* ⛔ 번호(data-i)가 아니라 «열쇠» 로 가리켜야 합니다 — 그 배열은 실제로 순서가 바뀐 적이 있습니다. */
      ok('카드를 «열쇠» 로 가리킨다 (번호가 아니라)', key === 'tutor', 'key=' + key);
      ok('주소 이동을 막는다', prevented === 1 && ret === false, 'prevented=' + prevented + ' ret=' + ret);

      let key2 = null, prevented2 = 0, ret2;
      const win2 = {};
      try { ret2 = r1.call(win2, win2, { preventDefault: () => { prevented2++; } }); }
      catch (e) { ok('함수가 없을 때 던지지 않는다', false, String(e).slice(0, 120)); }
      ok('짝: 함수가 없으면 «막지 않는다» (폴백이 산다)', prevented2 === 0 && ret2 !== false && key2 === null);
    }
  }
  ok('짝: 그 카드의 열쇠가 실제로 있다 (js/idx-about.js)',
    /key:\s*'tutor'/.test(readFileSync('cloudflare-deploy/public/js/idx-about.js', 'utf8')));
  ok('짝: ?menu=about-tutor 를 «받는» 절이 살아 있다',
    /menu'\)\s*===\s*'about-tutor'/.test(readFileSync('cloudflare-deploy/public/js/idx-about.js', 'utf8')));
  ok('짝: 그 파일의 ?v= 가 index.html 에 있다 (immutable 캐시)',
    /idx-about\.js\?v=\d+/.test(src));

  /* 🔑 열쇠 판정을 «오려 내 실제로 돌립니다» — 글자만 보면 «무슨 답이 나오는가» 를 못 봅니다.
     ⚠️ 이 절이 없으면 「모르는 열쇠에 아무거나 열기」 변이가 자동에서는 ❌0 으로 통과합니다
        (2026-09-21 실측 — 그때는 브라우저 검사만 잡았습니다). */
  const abSrc = readFileSync('cloudflare-deploy/public/js/idx-about.js', 'utf8');
  const skM = /window\.__abmShowKey\s*=\s*function\s*\(([^)]*)\)\s*\{/.exec(abSrc);
  ok('전제: __abmShowKey 를 찾았다', !!skM);
  if (skM) {
    const bodyStart = abSrc.indexOf('{', skM.index + skM[0].length - 1);
    let depth = 0, end = -1;
    for (let i = bodyStart; i < abSrc.length; i++) {
      if (abSrc[i] === '{') depth++;
      else if (abSrc[i] === '}') { if (!--depth) { end = i; break; } }
    }
    ok('전제: 그 몸통을 중괄호 짝으로 잘라 냈다', end > bodyStart);
    if (end > bodyStart) {
      const body = abSrc.slice(bodyStart + 1, end);
      let shown = [];
      let runner = null;
      try {
        runner = new Function('BENEFITS', 'showDetail', skM[1] || 'k',
          body.replace(/\bshowDetail\(/g, '__sd('));
      } catch (e) { ok('전제: 실행 가능하다', false, String(e).slice(0, 140)); }
      const run = (benefits, key) => {
        shown = [];
        const sd = (i) => shown.push(i);
        return new Function('BENEFITS', '__sd', 'k', body.replace(/\bshowDetail\(/g, '__sd('))
          (benefits, sd, key);
      };
      const B = [{ key: 'a' }, { key: 'tutor' }, {}, { key: 'z' }];
      ok('아는 열쇠는 «그» 카드를 연다', run(B, 'tutor') === true && shown.length === 1 && shown[0] === 1,
        JSON.stringify(shown));
      /* ⛔ 모르면 «지어내지» 않습니다 — 아무 카드나 열면 사장님이 가리킨 것과 다른 글이 뜹니다. */
      ok('짝: 모르는 열쇠는 아무것도 안 연다', run(B, '__없음__') === false && shown.length === 0,
        JSON.stringify(shown));
      ok('짝: 열쇠가 없는 항목에 빈 값으로 걸리지 않는다',
        run(B, undefined) === false && shown.length === 0, JSON.stringify(shown));
    }
  }
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
