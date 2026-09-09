/* ai_friend_header_harness.mjs — AI 영어친구 «말끔한 한 줄» 헤더 감시 (2026-09-09)
 *
 * 왜 필요한가
 *   사장님 「대시보드가 너무 복잡하고 산만해」 → 제안서 4안 중 **A안** 채택.
 *   설정 25개·퀘스트 4개를 헤더에서 내리고 «아래에서 올라오는 시트» 로 옮겼다.
 *
 *   📐 잰 것 (Chromium, 설정 펼친 상태 → A안 적용 뒤)
 *        PC 1920x1080  390 → 194px   대화창 51.5% → 69.6%
 *        PC 1280x800   390 → 194px   대화창 34.5% → 59.0%
 *        폰 390x844    342 → 139px   대화창 47.0% → 71.1%
 *        폰 360x640    342 → 139px   대화창 30.8% → 62.5%
 *
 * 이 검사가 지키는 것 — «구조 계약» 이다. 높이·겹침은 문자열로 볼 수 없다.
 *   ⓐ 옛 «전부 아니면 전무» 접기(body:not(.opts-open))가 되살아나지 않았는가
 *   ⓑ 시트가 요소를 «만들지 않고 옮기는가» — #streakN·#ptsN·#qTalkN·#lvName 처럼
 *      id 로 갱신하는 코드가 여럿이라, 다시 그리면 그 갱신이 조용히 죽는다
 *   ⓒ 칩 꺼내기가 .hud 이동 «앞» 인가 — 🔴 실제로 밟은 결함이다. 시트를 document 에
 *      붙이기 전에 그 안으로 옮기면 getElementById 가 null 을 돌려주고,
 *      «에러 없이» 옮기기가 통째로 건너뛰어진다
 *   ⓓ 닫는 길이 셋(닫기 버튼·바깥 누르기·Esc) 다 있는가 — 시트는 화면을 덮는다
 *   ⓔ 공용 바 합치기가 «끝이 있는» 확인인가 — 상주 MutationObserver·setInterval 은
 *      홈 화면을 통째로 멎게 한 전력이 있다(2026-07-14 · 2026-08-27)
 *   ⓕ .top .info 에 min-width:0 이 있는가 — 없으면 flex 자식 기본값(auto) 때문에
 *      이름이 길 때 칩·버튼을 화면 밖으로 밀어낸다
 *   ⓖ 늘 보여야 하는 두 가지(연속일·오늘 포인트)를 시트에 숨기지 않았는가
 *
 * ⚠️ «화면에 어떻게 그려졌는가» 는 이 검사로 볼 수 없다. 높이·한 줄·겹침·시트 동작은
 *    test-harness/manual/ai-friend-header-browser.mjs (사람이 직접 부른다)
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  c ? (pass++, console.log('  ✅ ' + m))
    : (fail++, console.log('  ❌ ' + m + (extra ? '\n       · ' + extra : '')));
};

console.log('■ AI 영어친구 헤더 — A안 «말끔한 한 줄» (ai-friend.html)');

const AF = readFileSync(join(PUB, 'ai-friend.html'), 'utf8');
/* 부정 검사는 주석을 벗겨 낸 사본으로 — 「왜 없앴는지」 적은 주석이 자기를 잡는다 */
const bare = AF
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '')
  .replace(/<!--[\s\S]*?-->/g, '');

/* ── ⓐ 옛 «전부 아니면 전무» 접기가 되살아나지 않았는가 ─────────────────── */
ok(!/body:not\(\.opts-open\)/.test(bare),
  '옛 «전부 아니면 전무» 접기(body:not(.opts-open))가 없다',
  '그 방식은 자막 하나 바꾸려 해도 25개를 다 펼쳤다');
ok(/class="opts-sheet"|\.opts-sheet\s*\{/.test(AF), '설정 시트(.opts-sheet)가 있다');

/* ── ⓑ «만들지 않고 옮기는가» ─────────────────────────────────────────
   ⛔ 「appendChild 라는 글자가 있는가」로 묻지 않는다 — 무엇을 옮기는지가 요점이다. */
const script = (() => {
  const s = AF.indexOf('⚙ 설정 시트 — A안');
  const e = AF.indexOf('else init();', s);
  return (s >= 0 && e > s) ? AF.slice(s, e + 12) : '';
})();
/* 🔴 전제 — 조각을 «실제로» 잘라냈는가. 이 줄이 없으면 자르기가 실패했을 때
   아래 부정 검사들이 «빈 문자열» 에서 전부 통과한다(처음에 실제로 그랬다). */
ok(script.length > 1500, `시트 스크립트를 잘라냈다 (${script.length}자)`,
  '못 잘라내면 아래 검사가 통째로 헛돈다');
for (const [sel, why] of [
  ['quests', '오늘의 할 일'],
  ['hud',    '상태(레벨·오늘의 단어)'],
  ['opts',   '설정 25개'],
]) {
  const re = new RegExp('body\\.appendChild\\(\\s*' + sel + '\\s*\\)');
  ok(re.test(script), `${why} 를 «옮긴다»(새로 만들지 않는다)`,
    `body.appendChild(${sel}) 를 못 찾음`);
}
ok(/querySelector\(\s*'\.opts'\s*\)/.test(script) && /querySelector\(\s*'\.quests'\s*\)/.test(script),
  '옮길 줄을 화면에서 «찾아» 온다(마크업을 복제하지 않는다)');

/* ── ⓒ 순서 — 칩 꺼내기가 .hud 이동보다 «앞» 인가 ─────────────────────
   🔴 이 순서가 뒤집히면 시트가 아직 document 에 없어 getElementById 가 null 이 되고,
      옮기기가 «에러 없이» 통째로 건너뛰어진다(실제로 그렇게 짰다가 실측으로 잡았다). */
const iChip = script.indexOf("getElementById('streakChip')");
const iHud  = script.search(/body\.appendChild\(\s*hud\s*\)/);
ok(iChip >= 0 && iHud >= 0 && iChip < iHud,
  '연속일·포인트 칩을 «.hud 를 시트에 넣기 전에» 꺼낸다',
  iChip < 0 ? 'streakChip 을 안 찾는다' : iHud < 0 ? 'hud 이동을 못 찾음'
    : `칩 꺼내기(${iChip})가 hud 이동(${iHud}) «뒤» 에 있다 — 그러면 조용히 건너뛴다`);

/* ── ⓓ 닫는 길이 셋 다 있는가 ──────────────────────────────────────── */
ok(/sheet-close/.test(script) && /\.onclick/.test(script), '시트에 «닫기» 버튼이 있다');
ok(/scrim\.onclick/.test(script), '바깥(어두운 곳)을 눌러도 닫힌다');
ok(/key\s*===\s*'Escape'/.test(script), 'Esc 로도 닫힌다');
ok(/aria-expanded|setAttribute\('aria-expanded'/.test(script),
  '⚙ 버튼이 열림/닫힘을 aria-expanded 로 알린다');

/* ── ⓔ 공용 바 합치기 — «끝이 있는» 확인인가 ─────────────────────────
   상주 감시는 홈 화면을 통째로 멎게 한 전력이 있다(CLAUDE.md 「body class 를
   MutationObserver 로 지켜봤더니 화면이 멎음」). */
ok(/mergeGlobalBar/.test(script), '공용 상단바(🏠 홈 · 🌐 EN)를 헤더로 합친다');
ok(!/new MutationObserver/.test(script), '시트 코드에 상주 MutationObserver 가 없다');
ok(!/setInterval/.test(script), '시트 코드에 상주 setInterval 이 없다');
const wait = script.match(/barTries\s*>\s*(\d+)/);
ok(!!wait && Number(wait[1]) > 0 && Number(wait[1]) <= 60,
  `공용 바를 기다리는 확인에 «끝» 이 있다 (최대 ${wait ? wait[1] : '?'}회)`);

/* ── ⓕ 헤더가 이름 때문에 넘치지 않는가 (CSS 계약) ──────────────────── */
const infoRule = AF.match(/\.top \.info\s*\{([^}]*)\}/g) || [];
ok(infoRule.some(r => /min-width\s*:\s*0/.test(r)),
  '.top .info 에 min-width:0 이 있다(없으면 긴 이름이 칩을 밀어낸다)');
ok(/\.top \.name[^{]*\{[^}]*text-overflow\s*:\s*ellipsis/.test(AF),
  '이름이 넘치면 «…» 로 줄어든다(줄바꿈으로 헤더가 두 줄이 되지 않는다)');

/* ── ⓖ 늘 보여야 하는 두 가지를 숨기지 않았는가 ────────────────────── */
ok(/insertBefore\(\s*streak\s*,/.test(script) && /insertBefore\(\s*pts\s*,/.test(script),
  '연속일·오늘 포인트는 헤더에 남긴다(시트에 숨기지 않는다)');
/* 그 짝 — 설정·퀘스트는 반대로 시트로 내려가야 한다. 한쪽만 보면
   «전부 헤더에 두기» 도 통과한다. */
ok(!/insertBefore\(\s*(opts|quests)\s*,/.test(script),
  '설정·퀘스트는 헤더로 되돌리지 않는다');

/* ── ⓗ 폰에서 «꺼짐» 표시가 살아남는가 ────────────────────────────────
   🔴 함정 대조가 잡은 것 — 좁은 폭에서 .ot-sum 을 통째로 숨겨, 자막·소리를 끈 학생에게
      «지금 꺼져 있다»(👁·🔇)를 말해 줄 자리가 화면에서 사라졌었다. 되돌아올 길이 없어진다. */
ok(/\.ot-lv\b/.test(AF) && /\.ot-flag\b/.test(AF),
  '⚙ 요약이 «레벨»(.ot-lv)과 «꺼짐 표시»(.ot-flag)로 나뉘어 있다');
ok(!/\.opts-toggle\s+\.ot-sum\s*\{[^}]*display\s*:\s*none/.test(bare),
  '좁은 폭에서 ⚙ 요약을 «통째로» 숨기지 않는다',
  '.ot-sum 을 숨기면 👁·🔇 까지 함께 사라진다 — 접는 것은 .ot-lv 뿐이다');
ok(/\.ot-flag['"]\)\s*\.textContent|querySelector\(\s*'\.ot-flag'\s*\)/.test(script),
  '꺼짐 표시를 실제로 그린다(.ot-flag 에 값을 쓴다)');
/* 그 짝 — «무엇이 꺼졌나» 를 소리까지 본다. 자막만 보면 🔊 를 시트로 내린 뒤
   «소리 꺼짐» 이 화면 어디에도 안 남는다(그것도 함정 대조가 잡았다). */
/* ⚠️ «그 글자가 스크립트 안에 있는가» 로 묻지 말 것 — 바로 위 주석에 그 글자가 있어
      표시를 실제로 지워도 통과한다(변이시험에서 실측). «값에 더하는가» 로 묻는다. */
const bareScript = script.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
ok(/flags\s*\+=\s*'🔇'/.test(bareScript),
  '소리가 꺼져 있으면 🔇 를 요약에 «더한다»(🔊 는 시트 안이라 안 보인다)');
ok(/flags\s*\+=\s*'👁'/.test(bareScript), '자막이 꺼져 있으면 👁 를 요약에 «더한다»');
/* 그리고 그 둘이 서로 다른 조건에서 켜지는가 — 한 조건에 묶으면 «소리만 껐을 때» 가 안 뜬다 */
ok(/classList\.contains\(\s*'off'\s*\)/.test(bareScript) && /dataset\.sub/.test(bareScript),
  '자막 상태와 소리 상태를 «따로» 본다');

/* ── ⓘ 옛 «떠 있는 공용 바» 전제로 만든 여백이 되살아나지 않았는가 ────
   ⚠️ 이 검사는 주석을 벗겨 낸 사본으로 본다 — 「왜 지웠는지」 적은 주석이 그 값을
      담고 있어, 원본으로 보면 자기 주석을 잡는다(이 저장소가 여러 번 밟은 함정). */
ok(!/\.top\s*\{[^}]*padding-top\s*:\s*48px/.test(bare),
  '폰에서 헤더를 공용 바 «아래» 로 밀던 여백이 없다');
ok(!/\.top\s*\{[^}]*padding-right\s*:\s*190px/.test(bare),
  '헤더 오른쪽에 공용 바 자리를 비우던 190px 구멍이 없다',
  '그 바는 이제 헤더 «안» 에 있다 — 되살리면 오른쪽이 텅 빈다');

/* ── ⓙ 🌐 옆 글자를 접지 않았는가 ──────────────────────────────────
   지구본만 남기면 «누르면 무슨 말이 되는가» 를 알 길이 없다. 폰에는 hover 가 없어
   title 툴팁도 안 뜬다(CLAUDE.md 「폰에서는 안 뜸」). */
ok(!/\.lang-label-sync\s*\{\s*display\s*:\s*none/.test(bare)
   && !/,\s*\n?\s*\.top #mangoi-global-bar \.lang-label-sync\s*\{\s*display\s*:\s*none/.test(bare),
  '🌐 옆 언어 글자(«EN»/«한국어»)를 접지 않는다');

/* ── 첫 방문 안내 — 설정이 헤더에서 사라졌으니 한 번은 말해 줘야 한다 ── */
ok(/data-hint/.test(script), '첫 방문에 «설정은 여기로 옮겼어요» 를 한 번 알려 준다');
ok(!/setAttribute\('data-ko'|setAttribute\('data-en'/.test(script.match(/data-hint[\s\S]{0,400}/)?.[0] || ''),
  '그 안내를 data-ko/data-en 으로 달지 않는다(그 둘은 버튼 글자를 통째로 갈아끼운다)');

console.log(`\n${pass} PASS / ${fail} 실패`);
process.exit(fail ? 1 : 0);
