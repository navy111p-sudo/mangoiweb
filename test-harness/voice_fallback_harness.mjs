/* voice_fallback_harness.mjs — 「고른 친구가 아닌 목소리가 난다」 감시 (2026-08-31)
 *
 * 왜 필요한가
 *   사장님 제보 「번갈아를 안 눌렀는데 갑자기 Lily 목소리가 Emma 로 바뀌었다」.
 *   원인은 화면이 아니라 서버였고 «두 겹» 이었다.
 *     ① Aura-2 가 실패하면 Aura-1 로 폴백하는데, 여자 대체값이 'asteria' 였다.
 *        그런데 asteria 는 화면의 «Emma» 전용 목소리다 → Lily(delia)가 폴백하는
 *        순간 정확히 Emma 목소리가 된다. Noah(aries)는 orion 이라 안 겹쳤다.
 *     ② 그 폴백 음성을 «요청 화자(delia)» 키로 R2 에 캐시했다 → 한 번 어긋나면
 *        Aura-2 가 살아나도 그 문장은 영원히 Emma 목소리. 바로 아래 melotts 주석이
 *        같은 이유로 «캐시 금지» 를 못 박고 있었는데 이 한 단계만 빠져 있었다.
 *
 * 이 검사가 지키는 것 (문자열 훑기가 아니라 «폴백 표를 실제로 돌려서» 판정한다)
 *   ① 화면이 쓰는 친구들의 기본 화자가 폴백해도 서로 겹치지 않는다
 *   ② 어떤 화자도 Emma 전용 목소리(asteria)로 떨어지지 않는다 (Emma 자신 제외)
 *   ③ 폴백은 성별을 유지한다
 *   ④ Aura-1 폴백 음성은 «실제로 쓴 화자» 키로만 캐시한다
 *   ⑤ 화면 세 곳이 쓰는 화자가 서버 Aura-2 허용목록 안에 있다
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'cloudflare-deploy', 'src');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? (pass++, console.log('  ✅ ' + m)) : (fail++, console.log('  ❌ ' + m + (extra ? '\n       · ' + extra : ''))); };

console.log('■ TTS 화자 폴백 — 「고른 친구가 아닌 목소리」 방지');

const G = readFileSync(join(SRC, 'api-games.ts'), 'utf8');

/* ── 서버의 «목록과 폴백 규칙» 을 소스에서 오려 내 실제로 돌린다 ────────────────
   문자열로 「asteria 가 없는가」 를 보면, 정상 경로의 asteria 까지 걸려 못 쓴다. */
const grab = (name) => {
  const m = G.match(new RegExp('const ' + name + ' = new Set\\(\\[[^\\]]*\\]\\)'));
  if (!m) return null;
  return new Function('return ' + m[0].replace('const ' + name + ' = ', '') + ';')();
};
const AURA2 = grab('AURA2'), AURA2_MALE = grab('AURA2_MALE'), AURA1 = grab('AURA1');
ok(!!AURA2 && !!AURA2_MALE && !!AURA1, '서버의 화자 목록 셋을 읽었다');

const subM = G.match(/const AURA1_SUB: Record<string, string> = \{[\s\S]*?\n          \};/);
ok(!!subM, 'Aura-1 대체 화자 표(AURA1_SUB)가 있다',
  '없으면 여자 화자가 전부 한 목소리로 떨어져 「누구를 골라도 같은 소리」가 된다');
let SUB = null;
if (subM) {
  try { SUB = new Function('return ' + subM[0].replace('const AURA1_SUB: Record<string, string> = ', '').replace(/;$/, '') + ';')(); }
  catch (e) { ok(false, 'AURA1_SUB 를 평가할 수 있다', e.message); }
}

/* 서버의 폴백 한 줄을 그대로 옮겨 돌린다 — 규칙이 바뀌면 여기도 FAIL 나야 한다 */
const fallbackLine = G.match(/const spk1 = AURA1\.has\(requested\)[\s\S]{0,220}?;/);
ok(!!fallbackLine, '폴백 결정식(spk1)을 찾았다');
ok(!!fallbackLine && !/\?\s*'asteria'|:\s*'asteria'\)/.test(fallbackLine[0]),
  '폴백 기본값이 «Emma 전용» asteria 가 아니다',
  "asteria 로 떨어지면 Lily 를 골라도 Emma 목소리가 난다 — 2026-08-31 실사고");

const fb = (requested) => {
  if (!AURA1 || !SUB) return null;
  if (AURA1.has(requested)) return requested;
  return SUB[requested] || (AURA2_MALE.has(requested) ? 'orion' : 'luna');
};

/* ── 화면 세 곳이 쓰는 «사람 → 화자» 를 읽어 온다 ───────────────────────────── */
const readMap = (file, re, keyIdx, spkIdx) => {
  const t = readFileSync(join(PUB, file), 'utf8');
  const out = {}; let m;
  while ((m = re.exec(t))) out[m[keyIdx]] = m[spkIdx];
  return out;
};
const WARM = readMap('warmup.html', /(emma|jake|lily|noah):\s*\{[^}]*speaker:\s*'([a-z]+)'/g, 1, 2);
ok(Object.keys(WARM).length === 4, `웜업에서 네 친구의 화자를 읽었다 (${JSON.stringify(WARM)})`);

/* ── ① 폴백해도 서로 겹치지 않는가 ─────────────────────────────────────────── */
if (SUB && AURA1) {
  const after = {};
  for (const [who, spk] of Object.entries(WARM)) after[who] = fb(spk);
  console.log('   폴백 후:', JSON.stringify(after));
  const vals = Object.values(after);
  ok(new Set(vals).size === vals.length,
    `네 친구가 폴백해도 목소리가 서로 다르다 (${vals.join(', ')})`,
    '겹치면 「A 를 골랐는데 B 목소리」가 된다 — 사장님이 실제로 겪은 사고');

  const emmaSpk = WARM.emma;
  for (const [who, spk] of Object.entries(after)) {
    if (who === 'emma') continue;
    ok(spk !== emmaSpk, `${who}: 폴백해도 Emma 목소리(${emmaSpk})가 되지 않는다`,
      'Emma 는 asteria 를 쓴다 — 다른 친구의 대체값으로 쓰면 안 된다');
  }

  /* ── ③ 성별 유지 ── */
  const A1_MALE = new Set(['angus', 'arcas', 'orion', 'orpheus', 'zeus', 'perseus', 'helios']);
  for (const [who, spk] of Object.entries(WARM)) {
    const isMale = AURA2_MALE.has(spk);
    const got = fb(spk);
    ok(A1_MALE.has(got) === isMale, `${who}: 폴백이 성별을 유지한다 (${spk} → ${got})`);
  }

  /* 대체표의 값이 실제로 Aura-1 에 있는지 — 없으면 폴백이 또 실패한다 */
  for (const [from, to] of Object.entries(SUB)) {
    ok(AURA1.has(to), `대체값 ${from} → ${to} 가 Aura-1 목록에 있다`,
      '없는 이름으로 대체하면 폴백이 또 실패해 기계음까지 내려간다');
    ok(to !== 'asteria', `대체값 ${from} → ${to} 가 Emma 전용 asteria 가 아니다`);
  }
}

/* ── ④ 폴백 음성을 «요청 화자» 키로 캐시하지 않는가 ────────────────────────── */
const a1Block = G.match(/\/\* Aura-1 폴백[\s\S]*?catch \(auraErr/);
ok(!!a1Block, 'Aura-1 폴백 블록을 찾았다');
if (a1Block) {
  ok(!/await putCache\(/.test(a1Block[0]),
    'Aura-1 폴백은 putCache(요청 화자 키)를 쓰지 않는다',
    '요청 화자 키로 저장하면 일시 장애가 영구가 된다 — 2026-08-31 실사고의 «두 번째 겹»');
  /* ⚠️ 이 검사를 «그 코드 모양이 있는가» 로 쓰면 안 된다 — 표현만 바꿔도 FAIL 난다.
     물어야 할 것은 «저장 키를 실제로 쓴 화자(spk1)로 만드는가» 다. */
  ok(/putCacheAs\(\s*await ttsKey\(spk1\)|ttsKey\(spk1\)|spk1 \+ '\|' \+ text/.test(a1Block[0]),
    '폴백 캐시 키는 «실제로 쓴 화자(spk1)» 로 만든다',
    '그래야 ① 요청 화자 키가 비어 다음에 제대로 만들고 ② 그 화자를 진짜 고른 사람이 재사용한다');
}

/* ── ⑤ 화면 화자가 서버 허용목록 안에 있는가 + 진단 헤더 ───────────────────── */
if (AURA2) for (const [who, spk] of Object.entries(WARM)) {
  ok(AURA2.has(spk), `${who}: 화자 '${spk}' 가 서버 Aura-2 허용목록에 있다`,
    '목록 밖 이름은 서버가 조용히 asteria(=Emma) 로 바꾼다');
}
ok(/'X-TTS-Engine'/.test(G) && /'X-TTS-Speaker'/.test(G),
  '응답에 실제 사용한 엔진·화자를 실어 준다(X-TTS-Engine · X-TTS-Speaker)',
  '없으면 「고른 목소리가 아니다」 제보를 코드 추측으로만 가려야 한다');

/* 캐시 세대 — 오염된 옛 캐시가 그대로 재생되지 않게 */
ok(/'v4\|' \+ lang/.test(G), '캐시 세대가 v4 로 올라갔다 (폴백 오염분 무효화)',
  '올리지 않으면 이미 Emma 목소리로 저장된 Lily 문장이 계속 그대로 재생된다');

console.log(`\n${pass} PASS / ${fail} 실패`);
process.exit(fail ? 1 : 0);
