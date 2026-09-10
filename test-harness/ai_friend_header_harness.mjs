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
/* ⚠️ 부정 검사(«이 글자가 없어야 한다»)는 «주석을 벗겨 낸» 사본으로 판정한다.
      「왜 이렇게 하면 안 되는지」 적은 주석이 그 글자를 담고 있어 자기 주석을 잡는다
      — 이 작업에서만 세 번 밟았다(CLAUDE.md 2장). */
const bareScript = script.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
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
ok(!/new MutationObserver/.test(bareScript), '시트 코드에 상주 MutationObserver 가 없다');
ok(!/setInterval/.test(bareScript), '시트 코드에 상주 setInterval 이 없다');
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
  '⚙ 요약이 «글자»(.ot-lv)와 «꺼짐 표시»(.ot-flag)로 나뉘어 있다');
ok(!/\.opts-toggle\s+\.ot-sum\s*\{[^}]*display\s*:\s*none/.test(bare),
  '좁은 폭에서 ⚙ 요약을 «통째로» 숨기지 않는다',
  '.ot-sum 을 숨기면 👁·🔇 까지 함께 사라진다 — 접는 것은 .ot-lv 뿐이다');
ok(/\.ot-flag['"]\)\s*\.textContent|querySelector\(\s*'\.ot-flag'\s*\)/.test(script),
  '꺼짐 표시를 실제로 그린다(.ot-flag 에 값을 쓴다)');
/* 그 짝 — «무엇이 꺼졌나» 를 소리까지 본다. 자막만 보면 🔊 를 시트로 내린 뒤
   «소리 꺼짐» 이 화면 어디에도 안 남는다(그것도 함정 대조가 잡았다). */
ok(/flags\s*\+=\s*'🔇'/.test(bareScript),
  '소리가 꺼져 있으면 🔇 를 요약에 «더한다»(🔊 는 시트 안이라 안 보인다)');
ok(/flags\s*\+=\s*'👁'/.test(bareScript), '자막이 꺼져 있으면 👁 를 요약에 «더한다»');

/* ── ⓚ ⚙ 버튼이 «무엇을 여는 버튼인지» 말하는가 ────────────────────────
   📜 2026-09-10 사장님 「이거 설정 톱니바퀴로 바꿔줘. 톱니바퀴 옆에 설정이라고 단어도 추가해줘」
      — 그전에는 이 자리에 레벨 요약(«1단계 · A1»)이 있었고 폰에서는 그것마저 접혀
      톱니바퀴만 남았다(title 툴팁은 폰에 hover 가 없어 안 뜬다).
   ⛔ 「설정」이라는 글자가 파일 어딘가에 있는가로 묻지 말 것 — 시트 제목·라벨에 널려 있다.
      ⚙ 버튼 «안의 그 span» 을 콕 집어 본다. */
const otLv = AF.match(/<span class="ot-lv"[^>]*>[^<]*<\/span>/);
ok(!!otLv, '⚙ 버튼 안에 글자 칸(.ot-lv span)이 있다',
  '못 찾으면 아래 검사가 통째로 헛돈다');
ok(!!otLv && />설정</.test(otLv[0]),
  '⚙ 톱니바퀴 옆에 «설정» 이라는 말이 있다',
  '톱니바퀴만 있으면 «무엇을 여는 버튼인지» 알 길이 없다(폰에는 hover 가 없다)');
/* 짝 — 🌐 를 눌렀을 때도 따라오는가. 한쪽만 보면 «한국어로만 박아 두기» 도 통과한다. */
ok(!!otLv && /data-ko="설정"/.test(otLv[0]) && /data-en="Settings"/.test(otLv[0]),
  '그 말이 KO/EN 둘 다 있다(🌐 를 누르면 따라온다)');
/* ⛔ data-ko/data-en 은 «글자만 담은 span» 에만 — ⚙ 나 .ot-sum 에 달면 두 i18n 엔진이
      textContent 를 통째로 갈아끼워 톱니바퀴와 꺼짐 표시(.ot-flag)가 DOM 에서 사라진다
      (CLAUDE.md 「아이콘 버튼에 data-ko 를 달았더니」·「글자 + 배지를 함께 담은 요소」). */
ok(!/<span class="ot-sum"[^>]*data-(ko|en)=/.test(bareScript)
   && !/<span class="ot-flag"[^>]*data-(ko|en)=/.test(bareScript),
  'data-ko/data-en 을 ⚙ 요약 상자(.ot-sum)나 꺼짐 표시(.ot-flag)에 달지 않았다',
  '거기 달면 i18n 이 textContent 를 갈아끼워 톱니바퀴·👁·🔇 가 사라진다');
/* 다시 그릴 때도 레벨로 되돌아가지 않는가 — 이 한 줄이 이 변경의 전부다. */
ok(!/ot-lv[^\n]*textContent\s*=\s*r\.lv/.test(bareScript),
  '다시 그릴 때 헤더에 레벨을 되돌려 쓰지 않는다',
  '사장님이 «설정» 으로 바꾸라고 하신 자리다(2026-09-10)');
ok(/ot-lv[\s\S]{0,220}?'설정'/.test(bareScript),
  '다시 그릴 때도 그 칸에 «설정»(또는 Settings)을 쓴다',
  '안 쓰면 시트를 한 번 연 뒤 그 말이 빈칸이 된다');
/* 폰에서 접지 않는가 — 접으면 톱니바퀴만 남아 2026-09-10 지시가 그대로 되돌아간다.
   ⚠️ 부정 검사라 주석을 벗겨 낸 사본(bare)으로 본다. */
ok(!/\.opts-toggle\s+\.ot-lv\s*\{[^}]*display\s*:\s*none/.test(bare),
  '좁은 폭에서 «설정» 글자를 접지 않는다',
  '접으면 톱니바퀴만 남는다 — 폰에는 hover 가 없어 title 툴팁도 안 뜬다');
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

/* ── ⓚ ✨ 오늘의 단어 — 첫 화면 카드 (A안 목업의 마지막 조각) ──────────
   시트에 두면 «설정을 열어야 보이는 것» 이 되어 아무도 안 본다. */
ok(/id="wodCard"/.test(AF), '오늘의 단어 «주차장»(#wodCard)이 있다');
/* 🔴 카드는 빈 화면 «안»(#wodSlot)에 그린다 — 밖에 두면 그만큼 대화창이 줄어든다
      (실측: PC 1280 에서 59.0% → 52.6%). A안의 취지가 그 높이였다. */
ok(/id="wodSlot"/.test(AF) && /wod-card"\s+id="wodSlot"/.test(AF),
  '카드 자리는 빈 화면 «안»(#wodSlot)에 있다');
ok(/#wodCard\s*\{[^}]*display\s*:\s*none/.test(bare),
  '주차장은 «늘 숨김» 이라 대화창 높이를 먹지 않는다');
/* 🛟 지우기 «직전» 에 피신 — 두 곳 다. 하나만 하면 그 경로에서 칩이 파괴되고
      updateHUD 가 던져 퀘스트 갱신 4줄이 함께 죽는다. */
const clears = (AF.match(/getElementById\('chat'\)\.innerHTML\s*=\s*''/g) || []).length;
const parks  = (AF.match(/window\.wodPark\(\)/g) || []).length;
ok(clears > 0 && parks >= clears,
  `대화창을 지우는 곳(${clears})마다 «지우기 직전» 피신이 있다 (${parks}곳)`);
ok(/if \(window\.wodPark\) window\.wodPark\(\);\n\s*document\.getElementById\('chat'\)\.innerHTML/.test(AF)
   || /window\.wodPark\(\);[\s\S]{0,240}?getElementById\('chat'\)\.innerHTML\s*=\s*''/.test(AF),
  '피신이 지우기보다 «앞» 이다(뒤면 이미 파괴된 뒤라 아무 소용이 없다)');
ok(/function wodPark\(\)\s*\{\s*try\s*\{/.test(script),
  '피신 함수는 던지지 않는다(대화를 보내는 길 위에 있다)');
ok(/wodCard\.appendChild\(\s*wodChip\s*\)/.test(script),
  '칩을 «옮긴다»(새로 만들지 않는다)',
  '새로 만들면 updateHUD 의 getElementById 가 null → 그 함수는 null 검사가 없어 «던진다»');
/* 🔴 순서 — .hud 를 시트에 넣기 «전» 에 꺼내야 한다. 뒤로 가면 시트가 아직 document 에
      없어 getElementById 가 null 이고, 옮기기가 «에러 없이» 통째로 건너뛰어진다. */
/* 🪤 앵커를 `getElementById('wodChip')` 로 잡으면 헛돈다 — 그 문자열이 스크립트에
      «두 곳»(syncWodTap 과 여기)이고 indexOf 는 늘 앞의 것을 잡아 언제나 통과한다
      (변이시험에서 실측). 그 자리에만 있는 «꺼내는 모양» 으로 잡는다. */
const iWod = script.search(/var\s+wodChip\s*=\s*document\.getElementById\(\s*'wodChip'\s*\)/);
ok(iWod >= 0 && iHud >= 0 && iWod < iHud,
  '오늘의 단어 칩도 «.hud 를 시트에 넣기 전에» 꺼낸다',
  iWod < 0 ? 'wodChip 을 안 찾는다' : `칩 꺼내기(${iWod})가 hud 이동(${iHud}) «뒤» 에 있다`);
/* «보여라/숨겨라» 를 부르는 쪽이 정하지 않는다 — 화면을 보고 정해야 부르는 자리를
   하나 빠뜨려도 어긋나지 않는다. */
/* ⚠️ «식 모양» 을 글자 그대로 못 박지 말 것 — 구현을 더 낫게 고치면 보장은 세졌는데
      검사만 빨간불이 된다(이 저장소가 여러 번 밟은 함정). 뜻으로 묻는다:
      «부르는 쪽이 정하는가» 대 «화면을 보고 정하는가». */
const wodSyncBody = (() => {
  const i = bareScript.indexOf('function wodSync(');
  if (i < 0) return '';
  const b = bareScript.indexOf('{', i);
  let d = 0;
  for (let k = b; k < bareScript.length; k++) {
    if (bareScript[k] === '{') d++;
    else if (bareScript[k] === '}' && --d === 0) return bareScript.slice(b, k + 1);
  }
  return '';
})();
ok(wodSyncBody.length > 60, 'wodSync 본문을 잘라냈다(전제)', '못 자르면 아래가 헛돈다');
ok(/getElementById\(\s*'wodSlot'\s*\)|querySelector\(\s*'[^']*empty-state/.test(wodSyncBody),
  '카드를 어디에 둘지는 «화면을 보고» 정한다(부르는 쪽이 인자로 정하지 않는다)');
ok(!/function wodSync\s*\([^)]+\)/.test(bareScript),
  'wodSync 는 «보여라/숨겨라» 를 인자로 받지 않는다',
  '인자로 받으면 부르는 자리를 하나 빠뜨릴 때 조용히 어긋난다');
ok(/appendChild\(\s*chip\s*\)/.test(wodSyncBody),
  '자리를 옮길 때도 «새로 만들지 않고» 옮긴다');
/* 그 짝 — 감싸는 자리가 둘 다 있는가. 하나만 있으면 한쪽 방향으로 어긋난 채 남는다. */
ok(/window\.renderEmpty\s*=/.test(script) && /window\.appendMsg\s*=/.test(script),
  '그리는 자리(renderEmpty)와 대화 시작(appendMsg) «둘 다» 에 곁들여 부른다');
ok(!/new MutationObserver|setInterval/.test(bareScript.slice(bareScript.indexOf('function wireWod'), bareScript.indexOf('function init'))),
  '카드 배선에 상주 감시가 없다(홈을 통째로 멎게 한 전력)');
/* 안내 글자는 가상요소로 — data-ko/data-en 을 칩에 달면 i18n 엔진이 안 글자를 갈아끼운다 */
ok(/content\s*:\s*attr\(\s*data-tap\s*\)/.test(AF),
  '«눌러서 들어요» 를 가상요소(content:attr)로 그린다',
  'data-ko/data-en 으로 달면 i18n 엔진이 카드 안 단어를 통째로 갈아끼운다');
ok(!/id="wodChip"[^>]*\bdata-ko=/.test(AF), '칩 자신에 data-ko 를 달지 않는다');

/* ── 첫 방문 안내 — 설정이 헤더에서 사라졌으니 한 번은 말해 줘야 한다 ── */
ok(/data-hint/.test(script), '첫 방문에 «설정은 여기로 옮겼어요» 를 한 번 알려 준다');
ok(!/setAttribute\('data-ko'|setAttribute\('data-en'/.test(script.match(/data-hint[\s\S]{0,400}/)?.[0] || ''),
  '그 안내를 data-ko/data-en 으로 달지 않는다(그 둘은 버튼 글자를 통째로 갈아끼운다)');

console.log(`\n${pass} PASS / ${fail} 실패`);
process.exit(fail ? 1 : 0);
