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

const HTML = 'cloudflare-deploy/public/index.html';
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
ok('› 는 data-ko 요소 «안» 에 있지 않다', !/<span data-ko="[^"]*"[^>]*>[^<]*<i class="ht-go"/.test(block));

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
// ⛔ 금색은 밑의 CTA 몫 — 트랙이 금색을 쓰면 «지금 누를 것» 이 둘로 갈린다.
const goCss = /\.home-tracks \.ht-go\{([^}]*)\}/.exec(src);
ok('› 색이 CTA 금색(#fbbf24)이 아니다', !!goCss && !/#fbbf24/i.test(goCss[1]), goCss ? goCss[1] : 'none');

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
