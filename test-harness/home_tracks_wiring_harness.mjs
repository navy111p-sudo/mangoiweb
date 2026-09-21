/* home_tracks_wiring_harness.mjs — 홈 «두 트랙 줄» 배선이 살아 있는가 (2026-09-21)
 * ─────────────────────────────────────────────────────────────────────────────
 * [왜] 사장님 제보 — 「1번, 2번 모두 눌러도 카드로 들어가지 않아」.
 *   그때는 클릭 배선이 «아예» 없었다. 지금은 있지만, 그것을 지키는 검사가
 *   manual/home-tracks-click-browser.mjs 하나뿐이면 **게이트가 안 물어 갑니다** —
 *   누가 .ht-live 이름을 바꾸거나 <script defer src> 한 줄을 지우면 arm() 이
 *   아무것도 못 찾고 조용히 포기해, 사장님이 신고하신 그 상태로 «에러 없이» 돌아갑니다.
 *
 * ⚠️ 이 하니스는 «눌러서 무엇이 열리는가» 는 못 봅니다(그건 브라우저 검사 몫).
 *    여기서 잡는 것은 «배선이 서로를 가리키고 있는가» 뿐입니다.
 * ⚠️ 「막힌다」 옆에 「그래도 멀쩡한 것은 멀쩡하다」를 짝으로 둡니다.
 */
import fs from 'node:fs';

const PUB = 'cloudflare-deploy/public';
const html = fs.readFileSync(`${PUB}/index.html`, 'utf8');
const wire = fs.readFileSync(`${PUB}/js/idx-home-tracks.js`, 'utf8');
const about = fs.readFileSync(`${PUB}/js/idx-about.js`, 'utf8');

/* ⛔ 부정 검사(«이 글자가 없어야 한다»)는 주석을 벗겨 낸 사본으로 판정한다 —
   「왜 안 썼는지」 적은 설명 주석이 자기를 잡는다(CLAUDE.md 「자기 주석을 잡음」).
   2026-09-21 에 실제로 밟았다: ⑤의 「MutationObserver 없음」이 내 ⛔ 주석에 걸렸다.
   ⚠️ 문자열 안의 «//»(URL 등)까지 가리지는 못한다 — 이 파일들에는 없다(확인함). */
function stripComments(src) {
  const out = [];
  let inBlock = false;
  for (const line of src.split('\n')) {
    let res = '', i = 0;
    while (i < line.length) {
      if (inBlock) {
        const end = line.indexOf('*/', i);
        if (end === -1) { i = line.length; } else { inBlock = false; i = end + 2; }
      } else {
        const b = line.indexOf('/*', i), l = line.indexOf('//', i);
        if (b !== -1 && (l === -1 || b < l)) { res += line.slice(i, b); inBlock = true; i = b + 2; }
        else if (l !== -1) { res += line.slice(i, l); i = line.length; }
        else { res += line.slice(i); i = line.length; }
      }
    }
    out.push(res);
  }
  return out.join('\n');
}
const wireCode = stripComments(wire);

let P = 0, F = 0;
const t = (name, got, want) => {
  const ok = String(got) === String(want); ok ? P++ : F++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name} → ${JSON.stringify(got)}${ok ? '' : ' (기대 ' + JSON.stringify(want) + ')'}`);
};

console.log('① 그리는 쪽과 배선하는 쪽이 서로를 가리킨다');
t('index.html 이 배선 파일을 싣는다', /<script[^>]+idx-home-tracks\.js\?v=\d+/.test(html), true);
t('그 태그가 defer 다(첫 화면 예산 0바이트)', /<script\s+defer\s+src="\/js\/idx-home-tracks\.js/.test(html), true);

/* ⛔ 선택자를 여기 손으로 적지 않는다 — 배선 파일에서 «읽어» 마크업과 대조한다 */
const sels = [...wire.matchAll(/sel:\s*'([^']+)'/g)].map(m => m[1]);
t('배선 파일이 트랙 선택자를 둘 갖고 있다', sels.length, 2);
for (const sel of sels) {
  const cls = sel.split('.').pop();            // '.home-tracks .ht-live' → 'ht-live'
  t(`그 선택자(${cls})가 index.html 마크업에 실재한다`, new RegExp(`class="[^"]*\\b${cls}\\b`).test(html), true);
}

console.log('② 트랙에 data-ko/data-en 을 달지 않았다 (textContent 를 통째로 갈아끼운다)');
const trackBlock = (html.match(/<div class="home-tracks"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/) || [''])[0];
/* ⛔ 부정 검사에 쓰므로 HTML 주석을 벗긴 사본도 둔다 — 「왜 글자로 안 넣었나」를
   <!-- --> 로 적는 순간 멀쩡한 코드가 거짓 FAIL 이 된다(이 파일 20~23행과 같은 이유). */
const trackCode = trackBlock.replace(/<!--[\s\S]*?-->/g, '');
t('트랙 블록을 잘라 냈다(전제)', trackBlock.includes('ht-live') && trackBlock.includes('ht-ai'), true);
t('ht-track 여는 태그에 data-ko= 가 없다', /<div class="ht-track[^>]*\sdata-ko=/.test(trackCode), false);
t('짝 — 안쪽 span 은 여전히 data-ko 로 번역된다', /<span[^>]+data-ko="[^"]+"/.test(trackBlock), true);

console.log('③ 카드를 «순번» 이 아니라 «key» 로 찾는다');
t('BENEFITS 에 key 가 심겨 있다', /key:\s*'live-class'/.test(about), true);
t('목록 버튼이 그 key 를 data-key 로 내보낸다', /data-key="'\+b\.key\+'"/.test(about), true);
t('밖에서 여는 입구가 전역에 있다', /window\.openAboutMangoiCard\s*=/.test(about), true);
t('배선 파일이 그 key 를 쓴다', wire.includes("'live-class'"), true);
t('짝 — 순번(data-i)으로 상세를 여는 코드가 배선 파일에 없다', /data-i=/.test(wireCode), false);

console.log('④ 🔴 key 를 끼워 넣어 카드 census 를 죽이지 않았다');
/* today_plan_harness 의 카드 census 는 «ic: 바로 뒤 t:» 만 잡는다. 그 사이에 key: 를
   끼우면 그 카드가 census 에서 조용히 빠지고, 그 위에 선 부정 검사(1-3 「3분 48초 줄」)가
   그 카드에 대해 눈이 먼다. 2026-09-21 에 실제로 밟았다(14장 → 13장). */
const census = [...about.matchAll(/\{ic:\s*'([^']*)',\s*t:\s*'([^']*)'/g)].map(m => m[2]);
t('census 가 카드를 14장 이상 잡는다', census.length >= 14, true);
t('«1:1 / 1:2» 카드가 census 에 들어 있다', census.some(x => /1:1 \/ 1:2/.test(x)), true);
t('짝 — 맨 앞은 여전히 영상 카드다(1-3)', /홍보영상/.test(census[0] || ''), true);

console.log('⑤-2 🔴 스타일을 «실제로» 붙이는가 (안 붙이면 화살표·포커스 윤곽선이 통째로 죽는다)');
/* [왜] 2026-09-21 함정 대조 실측 — `if (armedNow) styleOnce();` 한 줄을 지우면
   화살표도 :focus-visible 윤곽선도 hover 배경도 통째로 안 붙는데 «자동» 하니스는
   추가 FAIL 0건이었습니다(브라우저 검사만 잡았고, 그쪽은 게이트가 안 물어 갑니다). */
const armBody = (function () {
  const i = wireCode.indexOf('function arm()');
  if (i < 0) return '';
  const s0 = wireCode.indexOf('{', i); let d = 0;
  for (let j = s0; j < wireCode.length; j++) {
    if (wireCode[j] === '{') d++;
    else if (wireCode[j] === '}') { d--; if (!d) return wireCode.slice(s0, j + 1); }
  }
  return '';
})();
t('전제 — arm() 몸통을 중괄호 짝으로 잘라 냈다', armBody.length > 100, true);
t('arm() 이 styleOnce() 를 부른다', /styleOnce\s*\(/.test(armBody), true);
t('styleOnce 가 <head> 에 실제로 붙인다', /document\.head\.appendChild/.test(wireCode), true);

console.log('⑤ 상주 감시를 두지 않았다 (홈을 멎게 한 전력)');
t('전제 — 주석 제거가 실제로 일했다', wireCode.length < wire.length, true);
t('전제 — 트랙 블록을 실제로 잘라 냈다', trackCode.length > 200, true);
t('body class MutationObserver 없음', /MutationObserver/.test(wireCode), false);
t('짝 — 그 경고는 주석에 그대로 남아 있다', /MutationObserver/.test(wire), true);
t('setInterval 은 끝이 있다(tries 상한)', /tries\s*>=\s*\d+/.test(wireCode), true);

console.log('⑥ › 화살표를 «가상요소» 로 그린다 (2026-09-21 사장님 지시)');
/* 폰에는 손가락 커서도 :hover 도 없어 «누를 수 있다» 는 신호가 0개였다.
   ⛔ 글자로 넣으면 i18n 두 엔진이 .ht-what 안 <span> 의 textContent 를 갈아끼울 때
   함께 사라지고, 사전이 전체 문자열 일치라 「원어민 화상수업」과 「원어민 화상수업 ›」를
   다른 말로 본다(CLAUDE.md 「data-ko 가 달린 표 머리글에 정렬 화살표를 달아야 할 때」).
   ⚠️ «그려졌는가·토글을 견뎌도 살아남는가·폰에서 안 넘치는가» 는 브라우저 검사 몫이다.
   여기서는 «모양» 만 못 박는다 — 그래야 게이트가 물어 간다(manual/ 은 안 물어 감). */
t('화살표를 ::after 로 그린다', /\.ht-what::after\{content:/.test(wireCode), true);
const chevSel = (wireCode.match(/\.home-tracks[^{]*\.ht-what::after/) || [''])[0];
t('전제 — 화살표 선택자를 찾았다', chevSel.length > 10, true);
t('그 규칙이 [role="button"] 일 때만 걸린다(배선 전엔 안 그린다)',
  /\.ht-track\[role="button"\]/.test(chevSel), true);
/* ⛔ :hover·:focus 로 좁히면 «폰에서 영영 안 보이는» 화살표가 된다 — 고치려던 그 문제다.
   위 검사만으로는 «[role="button"]:hover ...» 도 통과하므로 짝으로 막는다. */
t('짝 — :hover·:focus 로 좁히지 않았다', /:hover|:focus/.test(chevSel), false);
t('짝 — index.html 트랙 마크업에는 화살표 글자가 없다', /›/.test(trackCode), false);
t('짝 — 배선 파일이 textContent·innerHTML 로 화살표를 넣지 않는다',
  /(textContent|innerHTML)\s*\+?=\s*[^;]*›/.test(wireCode), false);
/* ⚠️ 이 줄은 role="button" 이라 «::after 의 글자가 낭독 이름에 그대로 섞입니다»
   (CDP 접근성 트리로 실측: 「…원어민 화상수업›」). CSS 대체 텍스트 «/ ""» 로 뺍니다.
   ⛔ 그 한 줄만 두면 그 문법을 모르는 옛 브라우저가 선언을 통째로 버려 화살표가
   사라집니다 — «대체 텍스트 없는 줄» 을 앞에 두어 폴백으로 남깁니다(짝). */
t('낭독 이름에서 빼는 대체 텍스트가 있다', /content:"\\\\203A"\s*\/\s*""/.test(wireCode), true);
t('짝 — 옛 브라우저용 폴백 줄이 앞에 남아 있다', /content:"\\\\203A";/.test(wireCode), true);
/* 🔴 «그려졌다» 와 «보인다» 는 다릅니다 — 2026-09-21 함정 대조 실측: opacity 를 0 으로
   바꾸면 화살표가 안 보이는데 ⑥(content 만 읽음)도 ⑨-4(대체 텍스트라 이름에도 없음)도
   통과했습니다. 브라우저 검사(⑨-3b)가 잡지만 **manual/ 은 게이트가 안 물어 갑니다** —
   그래서 «값을 죽이는» 변이를 여기서도 한 겹 막습니다.
   ⛔ 숫자를 여기 못 박지 말고 «너무 흐리지 않은가» 로 물으세요(0.6 → 0.8 은 멀쩡한 손질). */
const chevOpacity = parseFloat((chevSel && (wireCode.slice(wireCode.indexOf(chevSel)).match(/opacity:\s*([0-9.]+)/) || [])[1]) || 'NaN');
t('전제 — 화살표 규칙에서 opacity 를 읽었다', Number.isFinite(chevOpacity), true);
t('화살표가 투명하지 않다(opacity > .25)', chevOpacity > 0.25, true);

console.log(`\n결과: PASS ${P} / FAIL ${F}`);
if (F) process.exit(1);   /* ⛔ 실패하고도 exit 0 이면 --fast 합계가 안 움직인다 */
