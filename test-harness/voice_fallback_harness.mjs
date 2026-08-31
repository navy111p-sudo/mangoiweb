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

/* 🔴 같은 친구가 화면마다 다른 목소리를 내면 안 된다 — 「웜업에서는 Lily 인데
   AI 영어친구에서는 딴 사람」. 화자 이름이 세 파일에 복제돼 있어서, 톤을 바꾸려고
   한 곳만 고치면 정확히 그렇게 된다(에러는 안 난다). */
{
  const FRIEND_RE = () => /(emma|jake|lily|noah):\s*\{[^}]*speaker:\s*'([a-z]+)'/g;
  for (const f of ['ai-friend.html', 'speech-coach.html']) {
    let other = {};
    try { other = readMap(f, FRIEND_RE(), 1, 2); } catch { }
    ok(Object.keys(other).length === 4, `${f} 에서도 네 친구의 화자를 읽었다`, JSON.stringify(other));
    for (const who of ['emma', 'jake', 'lily', 'noah']) {
      ok(other[who] === WARM[who], `${f}: ${who} 화자가 웜업과 같다 (${other[who] || '없음'})`,
        `웜업 ${WARM[who]} — 한 곳만 고치면 화면마다 다른 목소리가 난다`);
    }
  }
}

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

/* ── ⑥ «들어볼 수 있는 화자» 목록이 서버와 같은 말을 하는가 ─────────────────
   2026-08-31 사장님 제보 「Lily 목소리가 슬퍼 보인다」로 화면의 ?vf=·?vm= 후보를
   서버가 아는 Aura-2 전부로 넓혔다. 이 목록이 서버와 어긋나면 «주소로 바꿔 봤는데
   아무 일도 안 일어나거나 엉뚱한 목소리가 나는» 상태가 되는데 에러는 안 난다
   (목록 밖 이름을 서버가 조용히 asteria = Emma 목소리로 바꾸기 때문). */
{
  const WU = readFileSync(join(PUB, 'warmup.html'), 'utf8');
  const keys = (name) => {
    const m = WU.match(new RegExp('var ' + name + ' = \\{([\\s\\S]*?)\\};'));
    return m ? new Set([...m[1].matchAll(/([a-z]+)\s*:\s*1/g)].map((x) => x[1])) : null;
  };
  const tryF = keys('VOICE_TRY_F'), tryM = keys('VOICE_TRY_M');
  ok(!!tryF && !!tryM, '화면의 들어보기 후보 목록 둘을 읽었다',
    `F=${tryF ? tryF.size : 0} · M=${tryM ? tryM.size : 0}`);
  if (tryF && tryM && AURA2 && AURA2_MALE) {
    const outF = [...tryF].filter((x) => !AURA2.has(x));
    const outM = [...tryM].filter((x) => !AURA2.has(x));
    ok(outF.length === 0 && outM.length === 0,
      '후보가 전부 서버 Aura-2 허용목록 안이다', `목록 밖: ${outF.concat(outM).join(',') || '없음'}`);
    // 성별이 섞이면 「Noah 를 골랐는데 여자 목소리」가 된다 — 얼굴은 그대로다
    ok([...tryM].every((x) => AURA2_MALE.has(x)), '남자 후보에 여자 화자가 섞이지 않았다',
      [...tryM].filter((x) => !AURA2_MALE.has(x)).join(',') || '없음');
    ok([...tryF].every((x) => !AURA2_MALE.has(x)), '여자 후보에 남자 화자가 섞이지 않았다',
      [...tryF].filter((x) => AURA2_MALE.has(x)).join(',') || '없음');
    // 서버가 아는 화자를 «들어볼 수 없는» 채로 두지 않는다(톤을 고르려면 다 들어봐야 한다)
    const missF = [...AURA2].filter((x) => !AURA2_MALE.has(x) && !tryF.has(x));
    const missM = [...AURA2].filter((x) => AURA2_MALE.has(x) && !tryM.has(x));
    ok(missF.length === 0 && missM.length === 0,
      '서버가 아는 화자를 전부 들어볼 수 있다', `빠진 화자: ${missF.concat(missM).join(',') || '없음'}`);
  }
  /* ⚠️ Aura 에는 음높이·톤 파라미터가 없다 — 있는 것처럼 보내면 조용히 무시된다.
     톤을 바꾸는 길은 «화자 교체» 하나뿐이라는 것을 코드에도 못 박아 둔다. */
  ok(/preservesPitch\s*=\s*true/.test(WU),
    '배속 슬라이더가 음높이를 안 건드린다(preservesPitch=true)',
    'false 로 두면 «천천히» 를 고른 학생의 목소리가 함께 낮아진다');
}

/* 캐시 세대 — 오염된 옛 캐시가 그대로 재생되지 않게 */
ok(/'v4\|' \+ lang/.test(G), '캐시 세대가 v4 로 올라갔다 (폴백 오염분 무효화)',
  '올리지 않으면 이미 Emma 목소리로 저장된 Lily 문장이 계속 그대로 재생된다');

/* ── ⑦ 「목소리가 계속 변해」 — 한 문장만 다른 사람이 읽지 않는가 (2026-08-31) ──
   사장님 제보: Noah 를 골라 뒀는데 문장마다 목소리가 바뀐다.
   화면이 화자를 바꾼 것이 아니라 «소리를 만들어 오는 길» 이 문장마다 달라진 것이다.
   ⑤까지가 «누구로 떨어지는가» 를 지킨다면, 여기는 «떨어지기 전에 한 번 더 물어보는가»
   와 «대체된 음성을 캐시해 굳히지 않는가» 를 지킨다. 둘 다 에러 없이 조용히 깨진다. */
{
  const a2Block = G.match(/const spk2 = AURA2\.has\(requested\)[\s\S]{0,1200}?await putCache\(buf\);/);
  ok(!!a2Block, 'Aura-2 정상 경로 블록을 찾았다');
  if (a2Block) {
    const runs = (a2Block[0].match(/auraRun\('@cf\/deepgram\/aura-2-en'/g) || []).length;
    ok(runs >= 2, 'Aura-2 가 실패하면 «한 번 더» 물어본 뒤에만 Aura-1 로 내려간다',
      '한 번에 포기하면 일시적 흔들림 한 번이 그 문장만 다른 화자(aries→orion)로 읽게 만든다');
    ok(/isQuota\(firstErr\?\.message\)|quota \|\| isQuota/.test(a2Block[0]),
      '뉴런 소진(429)에는 재시도하지 않는다',
      '답이 같은데 시간만 늘어난다 — 학생은 그만큼 오래 기다린다');
  }
  ok(/'X-TTS-Engine': 'r2-cache'/.test(G),
    '캐시 적중 응답에도 진단 헤더를 실어 준다',
    '없으면 화면이 「지금 소리가 고른 목소리인가」를 캐시 적중 때만 판정하지 못한다');

  const WU2 = readFileSync(join(PUB, 'warmup.html'), 'utf8');
  const sp = WU2.match(/function _ttsSpeak\([\s\S]*?\n\}/);
  ok(!!sp, 'warmup: 서버 TTS 요청이 _ttsSpeak 한 곳에 모여 있다');
  if (sp) {
    ok(/tryNo\s*===\s*0/.test(sp[0]) && /_ttsSpeak\(text, spk, key, btn, seq, done, play, 1\)/.test(sp[0]),
      'warmup: 한 번 실패했다고 곧바로 기기 목소리로 가지 않는다(한 번 더 물어봄)',
      '기기 목소리는 원어민 음성과 전혀 달라서 «목소리가 변했다» 로 제일 크게 들린다');
    ok(/_synthSpeak\(text, btn, done\)/.test(sp[0]),
      'warmup: 그래도 안 되면 기기 목소리로 읽는다(폴백을 없애지 않았다)',
      '소리가 아예 안 나는 것이 더 나쁘다 — 앱 WebView·뉴런 소진 때는 그것뿐이다');
    ok(/X-TTS-Speaker/.test(sp[0]) && /if\(!o\.got \|\| o\.got===spk\)/.test(sp[0]),
      'warmup: 서버가 대체한 화자의 음성은 캐시하지 않는다',
      '캐시하면 그 문장은 세션 내내 남의 목소리로 굳는다 — 서버 R2 캐시와 같은 이유');
    ok(/seq!==_speakSeq/.test(sp[0]),
      'warmup: 늦게 도착한 응답은 새 발화를 덮지 않는다(_speakSeq)',
      '400ms 뒤 재시도라 그 사이 학생이 다음 말을 보내면 두 문장이 겹쳐 재생된다');
  }
  ok(/function _ttsSpeak\(/.test(WU2) && !/\n\s{2,}function _ttsSpeak\(/.test(WU2),
    'warmup: _ttsSpeak 이 스크립트 «최상위» 에 있다',
    '다른 함수 안에 넣으면 바깥 호출부가 ReferenceError 인데 문자열 검사는 통과한다');

  /* ⑦-2 같은 규칙이 «세 화면 전부» 에 있는가 (2026-08-31 사장님 「영어친구랑 음성코치도」)
     화면마다 소리를 내는 통로가 다르다 — 웜업은 자기 fetch, AI 영어친구·게임들은 공용
     모듈 js/game-tts.js, 음성코치는 자기 fetch. 한 곳만 고치면 「어떤 화면은 되고
     어떤 화면은 그대로」가 되는데 에러는 안 난다(이 저장소가 반복해 밟은 형태). */
  const GT = readFileSync(join(PUB, 'js', 'game-tts.js'), 'utf8');
  ok(/tryNo\s*===\s*0|!tryNo/.test(GT) && /setTimeout\([^)]*attempt\(1\)|attempt\(1\)/.test(GT),
    'game-tts: 한 번 실패했다고 곧바로 기기 목소리로 가지 않는다',
    'AI 영어친구·판단력 훈련·게임 여러 종이 이 모듈 하나로 소리를 낸다');
  ok(/synthSpeak\(text,/.test(GT), 'game-tts: 그래도 안 되면 기기 목소리로 읽는다(폴백 유지)');
  ok(/X-TTS-Speaker/.test(GT) && /if\(!want \|\| !o\.got \|\| o\.got===want\) cache\[key\]=u;/.test(GT),
    'game-tts: 서버가 대체한 화자의 음성은 캐시하지 않는다',
    '캐시하면 그 문장이 세션 내내 남의 목소리로 굳는다');
  ok(/noRetry\s*=\s*\(r\.status===429\|\|r\.status===503\)/.test(GT),
    'game-tts: 뉴런 소진(429·503)에는 재시도하지 않는다');
  /* ⚠️ 재시도가 «멈춘 뒤» 도착하면 마이크가 열린 채 AI 목소리가 재생된다
     — 2026-07-23 「음성인식이 AI 말을 받아 적던」 사고의 재발 경로다. */
  ok(/function stop\(\)\{\s*\n\s*seq\+\+;/.test(GT) && /mine!==seq/.test(GT),
    'game-tts: stop() 이 번호를 올리고 늦게 온 응답이 물러난다',
    '없으면 마이크를 켠 뒤에 AI 목소리가 재생돼 음성인식이 그것을 받아 적는다');

  const SC = readFileSync(join(PUB, 'speech-coach.html'), 'utf8');
  const scFn = SC.match(/async function scFetchTtsUrl\([\s\S]*?\n\}/);
  ok(!!scFn, '음성코치: 서버 TTS 요청이 scFetchTtsUrl 한 곳에 모여 있다',
    '예전에는 speakWord·speakTarget 이 같은 블록을 각자 복사해 갖고 있었다');
  if (scFn) {
    ok(/scFetchTtsUrl\(t, lang, 1\)/.test(scFn[0]),
      '음성코치: 한 번 실패했다고 곧바로 기기 목소리로 가지 않는다');
    ok(/X-TTS-Speaker/.test(scFn[0]) && /if \(!want \|\| !got \|\| got === want\)/.test(scFn[0]),
      '음성코치: 서버가 대체한 화자의 음성은 캐시하지 않는다');
    ok(/noRetry = \(resp\.status === 429 \|\| resp\.status === 503\)/.test(scFn[0]),
      '음성코치: 뉴런 소진(429·503)에는 재시도하지 않는다');
  }
  ok((SC.match(/mine !== scTtsSeq/g) || []).length >= 2,
    '음성코치: 두 발화 함수 모두 늦게 온 응답이 물러난다(scTtsSeq)',
    '한쪽만 고치면 그 함수에서만 옛 문장이 새 문장을 덮는다');
  ok(!/const resp = await fetch\('\/api\/voice\/tts'/.test(SC.replace(scFn ? scFn[0] : '', '')),
    '음성코치: 헬퍼 밖에 남은 서버 TTS 복사본이 없다',
    '복사본이 남으면 한쪽만 고쳐지는 사고가 그대로 재현된다');

  // 공용 모듈을 «고정 버전» 으로 싣는 화면은 ?v= 가 함께 올라가야 옛 파일이 안 남는다
  const pinned = ['ai-friend.html', 'judgment.html', 'battle-3d.html'];
  for (const f of pinned) {
    const h = readFileSync(join(PUB, f), 'utf8');
    const m = h.match(/game-tts\.js\?v=(\d+)/);
    ok(!!m && Number(m[1]) >= 6, `${f}: game-tts.js ?v= 가 6 이상이다`,
      'immutable 캐시에 옛 모듈이 남으면 고친 화면만 안 고쳐진 것처럼 보인다');
  }
}

console.log(`\n${pass} PASS / ${fail} 실패`);
process.exit(fail ? 1 : 0);
