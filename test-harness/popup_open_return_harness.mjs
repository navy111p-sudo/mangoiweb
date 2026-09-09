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
const HAS_NOOPENER = /window\.open\s*\([^)]*['"]noopener['"]\s*\)/;

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

/* ── ② 고친 자리들이 «보호를 잃지 않았는가» — noopener 를 뺐으면 opener 를 끊어야 한다 ── */
const GUARDED = [
  ['cloudflare-deploy/public/js/adm-core.js', 'mangoiOpenTab'],
  ['cloudflare-deploy/public/js/monitor-wall.js', 'openTab'],
  ['cloudflare-deploy/public/admin/ghost-view.html', 'ghdOpenTab'],
  ['cloudflare-deploy/public/js/adm-promo-setup.js', null],
  /* index.html 은 공동 금지구역이라 되돌아가기 쉽다 — 여기서 못 박는다.
     ⚠️ 이 파일에는 `rel="noopener"`(HTML 속성)가 따로 있는데 그건 무해하다.
        ①절이 «기능 문자열» 만 보므로 둘이 섞이지 않는다. */
  ['cloudflare-deploy/public/index.html', 'openKakao'],
];
for (const [rel, fnName] of GUARDED) {
  const src = readFileSync(join(ROOT, rel), 'utf8');
  const name = rel.split('/').pop() + (fnName ? ` (${fnName})` : '');
  check(`② ${name} 이 opener 를 끊는다 (noopener 를 뺀 만큼 손으로 건다)`,
    /\.opener\s*=\s*null/.test(src));
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
