/* topic_icon_harness.mjs — AI 영어친구 «주제 카드» 감시 (2026-09-09)
 *
 * 왜 필요한가
 *   사장님 지시 둘을 한 번에 지킨다.
 *     ① 「자유주제」·「가족과 친구」를 카드 «맨 앞 두 자리» 에 둔다.
 *     ② 「이모지가 너무 단순하다」 → 실사 아이콘(Higgsfield 로 뽑아 WebP 로 구움)으로 바꾼다.
 *
 *   ②가 조용히 무너지는 길이 이 저장소에 이미 두 번 있었다:
 *     · 아바타(2026-08-31) — 표만 고치고 «그림 파일을 커밋에 안 담아» 며칠간 폴백이 돌았다.
 *       화면은 멀쩡해 보여서 「목소리는 바뀌었는데 얼굴이 안 바뀌었어」가 세 번 반복됐다.
 *     · 글쓰기 그림 목록 — 항목만 늘리고 파일을 안 넣어 그 학생만 «빈 카드» 를 봤다.
 *   ⛔ 그래서 「표에 pic 이 적혀 있는가」로 묻지 않는다. **그 그림이 저장소에 실재하는가**로 묻는다.
 *      폴백(onerror → 이모지)이 있다고 이 검사를 빼면 안 된다 — 폴백은 «런타임 사고» 대비이고
 *      이 검사는 «커밋 누락» 대비라 막는 것이 서로 다르다.
 *
 * 이 검사가 지키는 것 (문자열 훑기가 아니라 «표를 실제로 평가해» 판정한다)
 *   ⓐ TOPICS 를 실제로 읽어 순서·개수·필수 칸을 본다
 *   ⓑ pic 이 가리키는 WebP 가 실재하고 120KB 이하인가 (첫 화면 무게)
 *   ⓒ 이모지 폴백이 «전부» 살아 있는가 + Unicode 13+ 금지(Win10 두부 방지 — CLAUDE.md 1-4)
 *   ⓓ 카드 마크업이 «한 곳»(topicCardHtml)에서만 나오는가 — 그리는 자리가 둘이라
 *      복제하면 반드시 한쪽만 고쳐진다(이 저장소의 반복 사고 형태)
 *   ⓔ .t-icon 이 «인라인이 아닌가» — span 에 display 를 안 적으면 브라우저가 width/height 를
 *      통째로 무시해 아이콘이 0px 이 된다(CLAUDE.md 「막대 채움이 안 보임」과 같은 뿌리).
 *      ⛔ 「display:flex 라고 적혀 있는가」로 못 박지 말 것 — grid 로 바꾸는 정당한 수리가
 *         빨간불이 된다. «인라인이 아닌가» 로 묻는다.
 *
 * ⚠️ 이 검사로는 «화면에 그려졌는가» 를 볼 수 없다. 좌표·겹침은 진짜 브라우저가 필요하다 →
 *    test-harness/manual/ai-friend-fix-card-browser.mjs 계열처럼 사람이 부르는 검사의 몫이다.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  c ? (pass++, console.log('  ✅ ' + m))
    : (fail++, console.log('  ❌ ' + m + (extra ? '\n       · ' + extra : '')));
};

console.log('■ AI 영어친구 주제 카드 (ai-friend.html)');

const AF = readFileSync(join(PUB, 'ai-friend.html'), 'utf8');

/* ── ⓐ TOPICS 를 «실제로 평가해» 손에 쥔다 ────────────────────────────────
   문자열로 훑으면 「그 이름이 파일에 있다」까지만 보이고 «몇 번째인가»·«칸이 다 있나» 는
   안 보인다. 배열 리터럴을 오려 내 그대로 실행한다. */
const m = AF.match(/const TOPICS = (\[[\s\S]*?\n {4}\];)/);
ok(!!m, 'TOPICS 배열을 찾았다');
let TOPICS = null;
if (m) {
  try { TOPICS = new Function('return ' + m[1].replace(/;$/, ''))(); }
  catch (e) { ok(false, 'TOPICS 를 평가할 수 있다', String(e && e.message)); }
}
ok(Array.isArray(TOPICS) && TOPICS.length >= 8,
  `주제가 ${TOPICS ? TOPICS.length : 0}개 있다`);

if (Array.isArray(TOPICS)) {
  /* 사장님이 정한 «맨 앞 두 자리». 뒤로 밀리면 첫 화면에서 안 보인다(폰은 2열이라 더 그렇다). */
  ok(TOPICS[0] && TOPICS[0].ko === '자유주제',
    '첫 카드가 「자유주제」다', TOPICS[0] && TOPICS[0].ko);
  ok(TOPICS[1] && TOPICS[1].ko === '가족과 친구',
    '둘째 카드가 「가족과 친구」다', TOPICS[1] && TOPICS[1].ko);

  /* 칸이 하나라도 비면 화면이 «undefined» 를 그리거나 서버가 주제를 못 받는다 */
  const missing = TOPICS.filter(t => !t || !t.ko || !t.en || !t.id || !t.msg || !t.e)
    .map(t => (t && (t.ko || t.id)) || '?');
  ok(missing.length === 0, '모든 주제에 ko·en·id·msg·e 가 있다', missing.join(', '));

  /* id 가 겹치면 localStorage 로 되살릴 때 «다른 주제» 가 잡힌다 */
  const ids = TOPICS.map(t => t && t.id);
  ok(new Set(ids).size === ids.length, '주제 id 가 서로 겹치지 않는다', ids.join(', '));

  /* ── ⓑ 그림이 «실재하는가» ─────────────────────────────────────────── */
  const withPic = TOPICS.filter(t => t && t.pic);
  ok(withPic.length === TOPICS.length,
    `모든 주제에 실사 아이콘(pic)이 붙어 있다 (${withPic.length}/${TOPICS.length})`,
    TOPICS.filter(t => t && !t.pic).map(t => t.ko).join(', '));

  const gone = [], heavy = [];
  for (const t of withPic) {
    const f = join(PUB, 'img', 'topics', t.pic + '.webp');
    if (!existsSync(f)) { gone.push(t.pic + '.webp'); continue; }
    const sz = statSync(f).size;
    if (sz > 122880) heavy.push(`${t.pic}.webp ${Math.round(sz / 1024)}KB`);
  }
  ok(gone.length === 0, '표가 가리키는 그림이 저장소에 «실제로» 있다', gone.join(', '));
  ok(heavy.length === 0, '아이콘이 저마다 120KB 이하다', heavy.join(', '));

  /* ── ⓒ 이모지 폴백 ────────────────────────────────────────────────
     그림을 못 받는 순간(캐시 없음·차단·오타)에 카드가 «빈 칸» 이 되지 않게 하는 마지막 줄.
     Unicode 13+ 는 Win10 에서 두부(□)로 보인다 — CLAUDE.md 1-4. */
  const tofu = [];
  for (const t of TOPICS) {
    for (const ch of [...String((t && t.e) || '')]) {
      const cp = ch.codePointAt(0);
      /* Unicode 13(2020) 이후에 들어온 이모지들. ⚠️ 「Symbols and Pictographs Extended-A」
         (U+1FA70~) «만» 보면 🥲 U+1F972·🥸 U+1F978 처럼 옛 구역에 끼워 넣은 것들을 놓친다 —
         검사 이름은 「Unicode 13+」인데 실제로는 한 구역만 재고 있었다(함정 대조 지적).
         구역이 아니라 «코드포인트 목록» 으로 막는다(Unicode 13·14·15 신규 이모지). */
      const U13_PLUS = new Set([
        0x1F972, 0x1F978, 0x1F979, 0x1F9CB, 0x1F90C, 0x1F90D, 0x1F90E, 0x1F9A3, 0x1F9A4,
        0x1F9AB, 0x1F9AC, 0x1F9AD, 0x1F9AE, 0x1F9AF, 0x1F6D6, 0x1F6D7, 0x1F6DC, 0x1F6DD,
        0x1F6DE, 0x1F6DF, 0x1F7F0, 0x1FAE0, 0x1FAF0, 0x1F1FA,
      ]);
      if ((cp >= 0x1FA70 && cp <= 0x1FAFF) || U13_PLUS.has(cp)) {
        tofu.push(`${t.ko}: U+${cp.toString(16).toUpperCase()}`);
      }
    }
  }
  ok(tofu.length === 0, '폴백 이모지에 Unicode 13+ 가 섞이지 않았다', tofu.join(', '));
}

/* ── ⓓ 카드 마크업이 «한 곳» 인가 ────────────────────────────────────────
   빈 화면(renderEmpty)과 주제 바꾸기(renderTopicPicker) 두 곳이 같은 카드를 그린다.
   마크업을 복제해 두면 한쪽만 고쳐져 「어떤 화면에서는 이모지, 어떤 화면에서는 사진」이 된다.
   ⚠️ «호출» 로 세야 한다 — 함수 «선언» 줄이 함께 잡히면 호출 하나를 지워도 통과한다
      (이 저장소가 두 번 밟은 형태). */
const declCount = (AF.match(/function topicCardHtml\s*\(/g) || []).length;
/* ⚠️ 「topicCardHtml(t,」 로 세면 «선언» 줄이 함께 잡혀, 호출 하나를 지워도 2가 남아 통과한다.
      실제로 그렇게 짰다가 함정 대조가 잡았다(이 저장소에서 세 번째다).
      «부르는» 모양(=> 뒤)만 센다. */
const callCount = (AF.match(/=>\s*topicCardHtml\s*\(/g) || []).length;
ok(declCount === 1, `topicCardHtml 선언이 정확히 하나다 (${declCount}개)`);
ok(callCount >= 2, `두 렌더 자리가 모두 그 헬퍼를 부른다 (호출 ${callCount}곳)`);

/* 그리고 그 «밖» 에 옛 방식(카드 마크업 직접 조립)이 남아 있지 않아야 한다.
   ⛔ 주석이 걸리지 않게 벗겨 낸 사본으로 판정한다(부정 검사의 기본 — CLAUDE.md 2장). */
const strip = t => t
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '')
  .replace(/<!--[\s\S]*?-->/g, '');
const bare = strip(AF);
const inlineCards = (bare.match(/'<div class="topic-card"/g) || []).length;
ok(inlineCards === 1,
  `카드 마크업이 헬퍼 한 곳에서만 조립된다 (${inlineCards}곳)`,
  inlineCards > 1 ? '렌더 자리에 마크업이 복제돼 있다' : '헬퍼를 못 찾았다');

/* 그림이 없을 때 되돌아갈 곳 — onerror 가 살아 있어야 «빈 칸» 이 안 남는다 */
ok(/onerror=[^>]*parentNode\.textContent/.test(AF),
  '그림을 못 받으면 이모지로 되돌린다(onerror 폴백)');

/* ── ⓔ 아이콘 칸이 «인라인이 아닌가» ──────────────────────────────────
   span 에 display 를 안 적으면 width/height 가 통째로 무시돼 0px 이 된다.
   ⛔ 값을 flex 로 못 박지 않는다 — grid 등으로 바꾸는 정당한 수리를 막지 않기 위해서. */
const iconRule = AF.match(/\.topic-card \.t-icon\s*\{([^}]*)\}/);
ok(!!iconRule, '.t-icon 규칙이 있다');
if (iconRule) {
  const disp = (iconRule[1].match(/display\s*:\s*([\w-]+)/) || [])[1];
  ok(!!disp && !/^inline$/.test(disp),
    `.t-icon 이 인라인이 아니다 (display:${disp || '없음'})`);
  ok(/width\s*:/.test(iconRule[1]) && /height\s*:/.test(iconRule[1]),
    '.t-icon 에 width·height 가 있다');
}
/* 사진이 칸을 넘치지 않게 — object-fit 이 없으면 1024px 원본이 그대로 늘어난다 */
const picRule = AF.match(/\.topic-card \.t-pic\s*\{([^}]*)\}/);
ok(!!picRule && /object-fit\s*:/.test(picRule[1]),
  '.t-pic 에 object-fit 이 있다(칸을 넘치지 않는다)');

console.log(`\n${pass} PASS / ${fail} 실패`);
process.exit(fail ? 1 : 0);
