// -*- coding: utf-8 -*-
/* ═══════════════════════════════════════════════════════════════════════════
   🪟 window.open — «반환값을 쓰는데 noopener 를 준» 자리 감시  (2026-09-02 신설)

   [무엇이 문제였나]
   `window.open(url, '_blank', 'noopener')` 는 표준상 **탭은 열리는데 반환값이 null** 이다.
   그래서 반환값으로 «막혔나» 를 판정하면 **언제나 «막혔다»** 가 된다.
   2026-09-02 사장님 화면 실측: 관리자 「수업 관찰」·관제탑에서 참관을 누르면
   탭은 열렸는데 「⚠ 브라우저가 새 창을 막았습니다」 상자가 떴고, 그 링크를 누르면
   **탭이 하나 더** 열렸다. `ghost-view`·`adm-promo-setup` 은 더 나빠서
   `if (!w) location.href = url` 이라 **탭이 열리고 + 현재 창까지 이동**했다.

   [브라우저 실측 — 크로미움]
     window.open(u,'_blank','noopener') → 반환 null   · 탭 1→2 (열림)
     window.open(u,'_blank')            → 반환 object · 탭 2→3 (열림)
     고친 방식(기능문자열 없이 + w.opener=null) → 반환 object · w.opener null · 헛경고 0건

   [규칙]
   · 반환값을 «쓰는» 호출에는 'noopener' 를 기능 문자열로 주지 않는다.
     대신 연 뒤에 `w.opener = null` 로 같은 보호를 건다.
   · 반환값을 안 쓰는 호출(그냥 열기만)은 'noopener' 를 그대로 둬도 무해하다.
   · 그렇다고 **폴백(`location.href`)을 없애지 않는다** — 인앱 브라우저는 진짜로 null 을
     돌려주므로, 지우면 그 사람들에게 «아무 일도 안 일어난다»(④절이 짝으로 못 박는다).

   실행: node test-harness/popup_open_return_harness.mjs
   ═══════════════════════════════════════════════════════════════════════════ */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');

let PASS = 0, FAIL = 0;
const check = (n, ok, why) => {
  if (ok) { PASS++; console.log('  ✅ ' + n); }
  else { FAIL++; console.log('  ❌ ' + n + (why ? '\n' + why : '')); }
};

console.log('\n🪟 window.open — 반환값을 쓰는데 noopener 를 준 자리\n');

/* 훑을 파일 — public 밑의 .js·.html 전부 */
function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { if (f !== 'node_modules') walk(p, out); }
    else if (/\.(js|html)$/i.test(f)) out.push(p);
  }
  return out;
}

/* «반환값을 쓴다» 의 판정 — 호출 «바로 앞» 글자를 본다.
   `= window.open(` · `!window.open(` · `return window.open(` 셋이면 값을 쓰는 것이다.
   ⚠️ 「앞 N줄」 같은 어림짐작을 쓰지 않는다(CLAUDE.md 2장) — 한 표현 안에서 판정한다. */
const USES_RETURN = /(?:[=!]\s*|return\s+)window\.open\s*\(/;
/* 🪤 (2026-09-09 정정) 예전엔 «따옴표 안이 정확히 noopener 이고 곧바로 `)`» 만 봤다
   (`['"]noopener['"]\s*\)`). 그래서 실제로 같은 사고를 내는 세 모양을 통째로 놓쳤다 —
   `'noopener,noreferrer'` · `'noopener,width=500'` · `'width=500,noopener'`.
   함정 대조에서 «'noopener,noreferrer' 로 되돌리고 가드도 제거» 라는 **사고 완전 재현**이
   8/8 초록으로 통과했다. ⟹ 기능 문자열 «안에» 낱말로 들어 있으면 잡는다.
   ⚠️ HTML 속성 `rel="noopener"` 는 앞에 `window.open(` 이 없어 안 걸린다(실측). */
const HAS_NOOPENER = /window\.open\s*\([^)]*['"][^'"]*\bnoopener\b[^'"]*['"]/;

/* ⚠️ 아직 «못 고친» 자리 — 숨기지 않고 이름으로 적어 둔다.
   목록에 남겨 두는 것은 «봐준다» 가 아니라 «사람 결정을 기다리는 중» 이라는 뜻이다.
   ⛔ 고쳤으면 그 줄을 지우세요(대신 아래 ②절 GUARDED 에 그 파일을 올려 보호를 못 박습니다).
   ✅ 2026-09-09 현재 비어 있습니다 — public/index.html 의 두 자리(`toKakao`·`window.openKakao`)가
      사장님 승인으로 고쳐졌습니다. 그전에는 홈·수업화면(vc-dock 「상담」)이 전부 그것을 불러
      «카톡 탭이 열리고 + 보던 화면까지 카톡으로 이동» 했고, 수업 중이면 곧 «수업에서 나가기» 였습니다. */
/* 🪤 (2026-09-02 정정) 예전엔 «파일:줄번호» 로 못 박아 두었는데, 그 파일 위쪽에 줄이
   몇 줄만 늘어도 아래가 통째로 밀려 **뜻은 그대로인데 검사만 깨졌다**(실제로 밟음 —
   index.html 4330행에 주석 8줄이 들어가자 9220→9228 · 14121→14129 로 밀려
   등록분이 «새 자리» 로 잡히고 pending 은 0건이 됐다).
   ⟹ 줄번호로 세지 않고 **«그 파일에 몇 건 남아 있는가»** 로 센다. 줄이 밀려도 안 깨지고,
      그 파일에 새 자리가 생기면 건수가 늘어 그대로 FAIL 이 난다.
   ⚠️ 맞바꾼 것: 같은 파일에서 하나를 고치고 동시에 하나를 새로 만들면 건수가 같아 못 잡는다.
      줄번호 방식도 밀리는 순간 무력해지므로 이쪽이 실용적으로 낫다고 보았다. */
const PENDING_FILES = new Map([
  // (비어 있음 — 새로 «사람 결정 대기» 가 생기면 여기에 «파일 → 건수» 로 적습니다)
]);

const offenders = [];
const pending = [];
for (const p of walk(PUB)) {
  const src = readFileSync(p, 'utf8');
  src.split('\n').forEach((line, i) => {
    if (!HAS_NOOPENER.test(line)) return;
    if (!USES_RETURN.test(line)) return;          // 그냥 열기만 하는 자리는 무해
    const rel = relative(ROOT, p).split('\\').join('/');
    const at = `${rel}:${i + 1}`;
    (PENDING_FILES.has(rel) ? pending : offenders).push(`${at}  ${line.trim().slice(0, 120)}`);
  });
}

check(`① 반환값을 쓰면서 'noopener' 를 준 «새» 자리가 없다 (실측 ${offenders.length}건)`,
  offenders.length === 0,
  offenders.map(o => '      · ' + o).join('\n'));

if (pending.length) {
  console.log(`  ⚠️  아직 못 고친 자리 ${pending.length}건 — 사람 결정 대기 중`);
  pending.forEach(o => console.log('      · ' + o));
  console.log('      🔴 그 자리는 지금 «탭이 열리는데 + 보던 화면까지 그 주소로 이동» 합니다.');
  console.log('         수업 화면에서 그런 버튼을 누르면 그것이 곧 «수업에서 나가기» 입니다.');
}
const PENDING_TOTAL = [...PENDING_FILES.values()].reduce((a, b) => a + b, 0);
check(`①-2 못 고친 자리가 «목록에 적힌 그만큼뿐» 이다 (실측 ${pending.length}건 / 등록 ${PENDING_TOTAL}건)`,
  pending.length === PENDING_TOTAL,
  pending.length < PENDING_TOTAL
    ? '      · 고쳤다면 PENDING_FILES 의 건수를 줄이세요(0이면 그 줄 자체를 지웁니다)'
    : '      · 그 파일에 «새» 자리가 생겼습니다 — 아래 목록을 보세요');

/* ── ② 고친 자리들이 «보호를 잃지 않았는가» — noopener 를 뺐으면 opener 를 끊어야 한다 ──
   🪤 (2026-09-09 정정) 예전엔 **파일 전체**에서 `.opener = null` 을 찾았다. 그런데 한 파일에
      고친 자리가 둘 이상이면(`index.html` = toKakao·openKakao, `adm-core.js` = 두 곳)
      **한쪽만 되돌려도 다른 쪽이 검사를 대신 만족시킵니다.** 함정 대조 실측으로
      「openKakao 의 가드만 제거」가 8/8 초록으로 통과했다.
   ⟹ 앵커(함수 이름) 뒤 «첫 window.open( 호출» 을 찾아 **그 호출 둘레만** 본다.
   ⚠️ 범위를 «길이» 로만 자르지 않는다(CLAUDE.md) — 다음 window.open( 이 먼저 나오면 거기서 끊는다.
   ℹ️ 여기 없는 «반환값을 쓰는» 호출 13건은 애초에 noopener 를 안 준 옛 코드라 이 검사 밖이다
      (opener 보호를 그쪽까지 넓히는 것은 별건 — 사람이 정할 일). */
/* 🪤 앵커는 «선언» 모양으로 잡는다 — 이름만으로 찾으면 **호출부가 먼저 걸린다**
      (`adm-core.js` 는 1968행 호출이 1991행 정의보다 위라 엉뚱한 자리를 검사했다).
   🪤 그리고 «주석» 을 벗긴 사본에서 찾는다 — 주석에 적어 둔 설명용 예시
      `window.open(u,'_blank','noopener')` 가 첫 매치로 걸린다(`adm-promo-setup.js` 에서 실측).
      ⚠️ 정규식 한 줄로 지우지 말 것(CLAUDE.md) — 글자를 훑으며 «지금 어디 안인가» 를 추적한다.

   🪤 (2026-09-11 정정) 예전엔 **블록주석만** 벗겼다. 그래서 가드를 지우는 대신
      `// w.opener=null` 로 **줄주석 처리만 해도** ②절이 그 주석을 보고 통과했다
      (함정 대조 지적 → 제가 되돌려 실측: 그 변이가 **21/21 초록**이었다).
      CLAUDE.md 「부정 검사는 주석을 벗겨 낸 사본으로」의 바로 그 자리다.
   ⚠️ 그렇다고 `//` 를 무턱대고 지우면 **문자열 안의 `https://`** 가 잘려 나가
      멀쩡한 코드가 «없다» 로 판정된다. 그래서 따옴표(`'` `"` 백틱) 안인지도 함께 추적한다. */
const stripComments = (t) => {
  let out = '', i = 0, inBlock = false, q = ''; // q: 지금 열려 있는 따옴표(없으면 '')
  while (i < t.length) {
    const c = t[i], n = t[i + 1];
    if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i += 2; } else { i++; } continue; }
    if (q) {                                    // 문자열 안 — 주석으로 보지 않는다
      if (c === '\\') { out += c + (n ?? ''); i += 2; continue; }
      if (c === q) q = '';
      if (c === '\n' && q !== '`') q = '';       // ' " 는 줄을 못 넘는다(깨진 코드 방어)
      out += c; i++; continue;
    }
    if (c === '/' && n === '*') { inBlock = true; i += 2; continue; }
    if (c === '/' && n === '/') { while (i < t.length && t[i] !== '\n') i++; continue; }
    if (c === '\'' || c === '"' || c === '`') q = c;
    out += c; i++;
  }
  return out;
};
const GUARDED = [
  ['cloudflare-deploy/public/js/adm-core.js', 'function mangoiOpenTab'],
  ['cloudflare-deploy/public/js/monitor-wall.js', 'function openTab'],
  ['cloudflare-deploy/public/admin/ghost-view.html', 'function ghdOpenTab'],
  ['cloudflare-deploy/public/js/adm-promo-setup.js', null],
  /* index.html 은 공동 금지구역이라 되돌아가기 쉽다 — 두 자리를 «각각» 못 박는다.
     ⚠️ 이 파일에는 `rel="noopener"`(HTML 속성)가 따로 있는데 그건 무해하다.
        ①절이 앞에 `window.open(` 을 요구하므로 둘이 섞이지 않는다(실측). */
  /* ⚠️ `window.openKakao` 로만 적으면 toKakao 안의 «호출부»
        (`if (window.openKakao) return window.openKakao();`)가 먼저 걸려
        toKakao 의 가드를 보고 통과한다 — 실제로 밟았다. 대입문 모양으로 잡는다. */
  ['cloudflare-deploy/public/index.html', 'function toKakao'],
  ['cloudflare-deploy/public/index.html', 'window.openKakao = function'],
];
/* ④ «막힌다» 의 짝 — 진짜로 막혔을 때 «나가는 길» 이 남아 있는가.
   noopener 를 뺀 것은 «반환값을 믿을 수 있게» 하려던 것이지 폴백을 없애려던 것이 아니다.
   그 폴백(`location.href`)이 애초에 이 코드가 생긴 이유다 — 카톡·문자앱 인앱 브라우저는
   진짜로 null 을 돌려주므로, 지우면 그 사람들에게 **조용히 아무 일도 안 일어난다.**
   🪤 ②만 두면 «폴백을 통째로 지우는» 변이가 그대로 통과한다(2026-09-11 실측 21/21 초록).
   ⚠️ 목록을 넓히지 말 것 — 나머지 네 자리는 폴백이 «안내 상자» 라 구조가 다르다
      (실측: 그 넷의 창에는 location.href 가 없다). 넓히면 멀쩡한 코드가 빨간불이 된다. */
const FALLBACK_KEPT = new Set([
  'cloudflare-deploy/public/index.html|function toKakao',
  'cloudflare-deploy/public/index.html|window.openKakao = function',
]);

for (const [rel, anchor] of GUARDED) {
  const src = stripComments(readFileSync(join(ROOT, rel), 'utf8'));
  const name = rel.split('/').pop() + (anchor ? ` (${anchor})` : '');
  const from = anchor ? src.indexOf(anchor) : 0;
  /* 전제: 앵커를 못 찾으면 아래 검사가 통째로 헛돈다 — 그것부터 FAIL 로 드러낸다 */
  check(`②-0 ${name} — 검사할 자리를 찾았다`, anchor ? from >= 0 : true);
  const calls = [...src.matchAll(/window\.open\s*\(/g)].map(m => m.index).filter(i => i >= from);
  const start = calls[0];
  check(`②-1 ${name} — 그 자리에 window.open 호출이 있다`, start !== undefined);
  const next = calls[1];
  const win = start === undefined ? '' : src.slice(start, Math.min(next ?? Infinity, start + 600));
  check(`② ${name} 이 opener 를 끊는다 (noopener 를 뺀 만큼 손으로 건다)`,
    /\.opener\s*=\s*null/.test(win));
  if (FALLBACK_KEPT.has(`${rel}|${anchor}`)) {
    check(`④ ${name} 이 «진짜로 막혔을 때 나가는 길» 을 그대로 둔다 (인앱 브라우저)`,
      /location\.href/.test(win),
      '      · 인앱 브라우저는 진짜로 null 을 돌려줍니다 — 지우면 그 사람들에게 아무 일도 안 일어납니다');
  }
}

/* ── ③ 헛경고를 다시 만들지 않았는가 — «막혔다» 판정이 반환값 하나에만 걸려 있어도
      이제는 그 반환값이 진짜라서 괜찮다. 여기서는 그 판정이 «남아 있는지» 만 본다
      (지우면 진짜로 막혔을 때 조용히 실패한다 — 그게 이 코드가 생긴 이유다). ── */
{
  const core = readFileSync(join(ROOT, 'cloudflare-deploy/public/js/adm-core.js'), 'utf8');
  check('③ 진짜로 막혔을 때 알려 주는 안내는 그대로 남아 있다 (조용히 실패 금지)',
    /브라우저가 새 창을 막았습니다/.test(core));
}

console.log(`\n${FAIL ? '💥' : '🎉'} PASS ${PASS} / FAIL ${FAIL}\n`);
process.exit(FAIL ? 1 : 0);
