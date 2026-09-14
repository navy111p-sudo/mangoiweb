/* 🀄 중국어 «진짜 남성 성우»(Azure Speech) 가드 — 2026-09-14
 *
 * 📜 사장님 「남자목소리를 가져올 방법??」 으로 붙인 길입니다.
 *    그전에는 서버 zh 갈래가 구글 만다린 «한 목소리»(여성)뿐이라, 화면이 그 소리를
 *    브라우저에서 굵게 만들어 남자처럼 들리게 했습니다.
 *
 * 🔴 여기서 지켜야 할 것은 셋입니다.
 *    ① 돈이 나가는 API 다 — «아는 이름» 만 받고, 글자 수 상한을 정본이 든다.
 *    ② 실패하면 «소리가 나는 쪽» 으로 떨어진다 — 소리가 아예 안 나는 것이 최악이다.
 *    ③ 되던 것을 깨지 않는다 — 메이(여자)·영어는 이 갈래를 타지 않는다.
 *
 * ⚠️ 문자열로 「그 함수를 부르는가」만 물으면 아무것도 안 지켜집니다 —
 *    판정을 실제로 돌리고, 라우트는 중괄호 짝으로 잘라 «어느 값을 쓰는가» 를 봅니다.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const TS = read('cloudflare-deploy/src/azure-tts.ts');
const GAMES = read('cloudflare-deploy/src/api-games.ts');
const SAMPLE = (() => { try { return read('cloudflare-deploy/public/zh-voice-sample.html'); } catch { return null; } })();

/* 🔴 부정·존재 검사는 «주석을 벗겨 낸 사본» 으로 판정한다 —
   「왜 이렇게 했는지」 적은 주석이 그 낱말을 담고 있어 검사가 자기 주석을 잡는다.
   실제로 밟았습니다: 폴백 사유 헤더를 통째로 지웠는데 주석에 그 이름이 남아 초록이었습니다.
   ⛔ `//` 를 정규식으로 일괄 지우지 마세요 — 문자열 안 `https://` 가 잘려 뒤가 사라집니다.
      글자를 훑으며 «블록 안인가 · 줄주석인가 · 문자열 안인가» 를 함께 추적합니다. */
const stripComments = (src) => {
  let out = '', i = 0, n = src.length;
  let inBlock = false, inLine = false, q = '';
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (inBlock) { if (c === '*' && d === '/') { inBlock = false; i += 2; } else i++; continue; }
    if (inLine) { if (c === '\n') { inLine = false; out += c; } i++; continue; }
    if (q) { if (c === '\\') { out += c + (d || ''); i += 2; continue; } if (c === q) q = ''; out += c; i++; continue; }
    if (c === '/' && d === '*') { inBlock = true; i += 2; continue; }
    if (c === '/' && d === '/') { inLine = true; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; out += c; i++; continue; }
    out += c; i++;
  }
  return out;
};

let PASS = 0, FAIL = 0; const FAILS = [];
const check = (name, ok, why = '') => {
  if (ok) { PASS++; console.log('  ✅ ' + name); }
  else { FAIL++; FAILS.push(name); console.log('  ❌ ' + name + (why ? ' — ' + why : '')); }
};

/* TS 를 «타입만 지워» 그대로 돌린다(esbuild 없이). 정본을 실제로 실행하는 것이 요점이다. */
const esbuild = (() => {
  try { return createRequire(join(ROOT, 'cloudflare-deploy/package.json'))('esbuild'); }
  catch { return null; }
})();
if (!esbuild) {
  console.log('\n[ 건너뜀 ] esbuild 없음 — 이 컨테이너에는 node_modules 가 없습니다.');
  console.log('  ⚠️ 「확인 안 함」이지 「문제없음」이 아닙니다.');
  process.exit(0);
}
const built = esbuild.transformSync(TS, { loader: 'ts', format: 'cjs' }).code;
/* ⚠️ esbuild 의 cjs 출력은 `module.exports` 를 «갈아끼웁니다» — exports 객체만 넘기면
   내보낸 것이 하나도 안 보입니다(빈 객체를 보고 「없다」로 오진하게 됩니다). */
const holder = { exports: {} };
new Function('exports', 'module', built)(holder.exports, holder);
const mod = holder.exports;

console.log('\n[ ① 아는 이름만 받는다 (돈이 나가는 API) ]');
const { azureZhVoice, AZURE_ZH_VOICES, xmlEscape, azureTts, AZURE_TTS_MAX_CHARS } = mod;
const names = Object.keys(AZURE_ZH_VOICES);
check(`전제: 목소리 목록을 읽었다 (${names.length}명)`, names.length >= 2, JSON.stringify(names));
check('목록에 있는 이름은 Azure 보이스로 풀린다',
  names.every((n) => /^zh-CN-[A-Za-z]+Neural$/.test(azureZhVoice(n))),
  JSON.stringify(names.map((n) => azureZhVoice(n))));
/* 🔴 짝 — 없으면 «본문 값을 그대로 쓰기» 도 통과한다(모르는 이름으로 돈이 나갑니다) */
check('모르는 이름은 받지 않는다 (짝)',
  ['', null, undefined, 'zh-CN-XiaoxiaoNeural', '__proto__', 'constructor', 'toString', 'yunxi; drop']
    .every((v) => azureZhVoice(v) === null),
  '실제: ' + JSON.stringify(['__proto__', 'toString', 'zh-CN-XiaoxiaoNeural'].map((v) => azureZhVoice(v))));
check('대소문자·앞뒤 공백은 같은 이름으로 본다',
  azureZhVoice(' YunXi ') === azureZhVoice('yunxi'), '실제: ' + azureZhVoice(' YunXi '));

console.log('\n[ ② SSML 은 XML — 학생 글자를 반드시 이스케이프한다 ]');
check('&<>"\' 를 전부 바꾼다', xmlEscape(`&<>"'`) === '&amp;&lt;&gt;&quot;&apos;', '실제: ' + xmlEscape(`&<>"'`));
check('중국어 글자는 그대로 둔다', xmlEscape('你好！') === '你好！', '실제: ' + xmlEscape('你好！'));
check('태그를 넣어도 SSML 이 되지 않는다',
  !/[<>]/.test(xmlEscape('</voice><voice name="x">')), '실제: ' + xmlEscape('</voice><voice name="x">'));

console.log('\n[ ③ 실패는 전부 «소리가 나는 쪽» 으로 — 던지지 않는다 ]');
const run = async (env, text, voice) => {
  try { return await azureTts(env, text, voice, 'zh-CN'); }
  catch (e) { return { threw: String(e && e.message) }; }
};
const KEY = { AZURE_SPEECH_KEY: 'k', AZURE_SPEECH_REGION: 'koreacentral' };
const r1 = await run({}, '你好', 'zh-CN-YunxiNeural');
check('키가 없으면 조용히 물러난다 (안 던짐)', r1.ok === false && r1.reason === 'no_key', JSON.stringify(r1));
const r2 = await run({ AZURE_SPEECH_KEY: 'k' }, '你好', 'zh-CN-YunxiNeural');
check('지역이 없으면 물러난다', r2.ok === false && r2.reason === 'no_region', JSON.stringify(r2));
const r3 = await run(KEY, '你'.repeat(AZURE_TTS_MAX_CHARS + 1), 'zh-CN-YunxiNeural');
check(`글자 수 상한을 정본이 든다 (${AZURE_TTS_MAX_CHARS}자)`, r3.ok === false && r3.reason === 'too_long', JSON.stringify(r3));
check('상한이 너무 크지 않다 (요금이 곧 글자 수)', AZURE_TTS_MAX_CHARS <= 600, '실제: ' + AZURE_TTS_MAX_CHARS);
const r4 = await run(KEY, '你好', 'zh-CN-Yunxi');
check('보이스 이름 형식이 아니면 부르지 않는다', r4.ok === false && r4.reason === 'bad_voice', JSON.stringify(r4));

/* 🔴 «실제로 부르는» 경로도 던지지 않아야 한다 — 그 자리는 수업 중 소리가 나는 길이다. */
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('network down'); };
const r5 = await run(KEY, '你好', 'zh-CN-YunxiNeural');
globalThis.fetch = async () => new Response('nope', { status: 401 });
const r6 = await run(KEY, '你好', 'zh-CN-YunxiNeural');
globalThis.fetch = async () => new Response(new Uint8Array(40), { status: 200 });
const r7 = await run(KEY, '你好', 'zh-CN-YunxiNeural');
globalThis.fetch = async () => new Response(new Uint8Array(4000), { status: 200 });
const r8 = await run(KEY, '你好', 'zh-CN-YunxiNeural');
globalThis.fetch = realFetch;
check('통신이 끊겨도 안 던진다', r5.ok === false && r5.reason === 'fetch_error', JSON.stringify(r5));
check('권한 오류(401)도 안 던지고 사유를 남긴다', r6.ok === false && r6.reason === 'http_401', JSON.stringify(r6));
/* 🔴 에러 본문을 «소리» 로 내보내면 안 된다(429 JSON 을 오디오로 내보내 «소리가 안 나던» 그 사고) */
check('너무 작은 응답은 소리로 내보내지 않는다', r7.ok === false && /^empty_/.test(r7.reason), JSON.stringify(r7));
/* 🔴 짝 — 없으면 «전부 실패시키기» 도 통과한다 */
check('제대로 오면 소리를 돌려준다 (짝)',
  r8.ok === true && r8.bytes && r8.bytes.byteLength === 4000 && r8.voice === 'zh-CN-YunxiNeural',
  JSON.stringify({ ok: r8.ok, len: r8.bytes && r8.bytes.byteLength, voice: r8.voice }));

console.log('\n[ ④ 라우트 배선 — 되던 것을 깨지 않는가 ]');
/* 중괄호 짝으로 zh 갈래만 잘라 본다 — 파일 전체에서 글자를 찾으면 영어 갈래가 섞인다. */
const bodyAt = (src, anchor) => {
  const i = src.indexOf(anchor);
  if (i < 0) return '';
  let d = 0, j = i + anchor.length - 1;
  for (; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') { d--; if (!d) break; }
  }
  return src.slice(i, j + 1);
};
const zhBlock = bodyAt(GAMES, "if (lang.startsWith('zh') || lang === 'cn') {");
check('전제: zh 갈래를 잘라 냈다', zhBlock.length > 400, 'len=' + zhBlock.length);
check('zh 갈래가 Azure 를 먼저 시도한다',
  zhBlock.indexOf('azureTts(') > 0 && zhBlock.indexOf('azureTts(') < zhBlock.indexOf('gtts(text'),
  'azure=' + zhBlock.indexOf('azureTts(') + ' gtts=' + zhBlock.indexOf('gtts(text'));
/* 🔴 짝 — 없으면 «Azure 가 실패하면 소리도 안 난다» 는 변이가 통과한다 */
check('Azure 가 실패해도 예전 경로로 내려간다 (짝)', zhBlock.includes('gtts(text'),
  '소리가 아예 안 나는 것이 최악입니다');
const zhCode = stripComments(zhBlock);
check('전제: zh 갈래에서 주석을 벗겨 냈다', zhCode.length > 200 && zhCode.length < zhBlock.length,
  'code=' + zhCode.length + ' / raw=' + zhBlock.length);
check('왜 폴백했는지 화면에 말해 준다', /X-TTS-Fallback/.test(zhCode),
  '사유가 없으면 «되는데 왜 여자 목소리지?» 를 아무도 못 가립니다');
/* 🔴 이름을 콕 집었을 때만 탄다 — 넓히면 메이(여자)까지 바뀌어 지금 나는 소리를 깨뜨린다 */
const azLine = GAMES.match(/const azVoice = ([^;]+);/);
check('전제: azVoice 판정을 오려 냈다', !!azLine, azLine ? '' : '없음');
if (azLine) {
  const decide = (lang, body) => {
    try {
      return new Function('lang', 'b', 'azureZhVoice', 'return ' + azLine[1])(lang, body, azureZhVoice);
    } catch (e) { return 'ERR:' + e.message; }
  };
  check('이름을 콕 집었을 때만 Azure 를 탄다',
    decide('zh', { azure_voice: 'yunxi' }) === 'zh-CN-YunxiNeural', '실제: ' + decide('zh', { azure_voice: 'yunxi' }));
  /* 🔴 짝 — 없으면 «중국어 전부» 로 넓힌 변이가 통과한다(메이가 남자 목소리가 됩니다) */
  check('안 집으면 예전 경로 그대로다 (짝)',
    decide('zh', {}) === null && decide('zh', { speaker: 'long' }) === null,
    '실제 빈본문=' + decide('zh', {}) + ' speaker만=' + decide('zh', { speaker: 'long' }));
  check('영어는 이 갈래를 타지 않는다 (짝)',
    decide('en', { azure_voice: 'yunxi' }) === null, '실제: ' + decide('en', { azure_voice: 'yunxi' }));
}
/* 🔴 캐시를 안 가르면 같은 문장의 «옛 여성 캐시본» 이 먼저 걸려 남자 목소리가 영영 안 난다.
   ⛔ 접두사 글자(`'azure:'`)를 못 박지 않는다 — 오염분을 버리려고 세대를 올리는
      정당한 수리가 빨간불이 된다(2026-09-14 실제로 밟음). «가르는가» 로 묻는다. */
check('캐시 키를 «실제로 쓴 목소리» 로 가른다',
  /azVoice \?\s*'[a-z0-9:-]*'\s*\+\s*azVoice\s*:/.test(stripComments(GAMES)),
  '안 가르면 옛 여성 캐시본이 이겨 이 변경이 통째로 헛돕니다');

if (SAMPLE) {
  console.log('\n[ ⑤ 견본 화면 — 「소리가 났다」를 「그 성우로 났다」로 읽지 않는가 ]');
  check('견본이 서버에 이름을 실어 보낸다', /azure_voice:\s*v\.id/.test(SAMPLE));
  check('견본의 이름이 전부 서버가 아는 이름이다',
    [...SAMPLE.matchAll(/\{ id:'([a-z]+)'/g)].map((m) => m[1]).every((n) => azureZhVoice(n) !== null),
    '목록=' + JSON.stringify([...SAMPLE.matchAll(/\{ id:'([a-z]+)'/g)].map((m) => m[1])));
  const sampleCode = stripComments(SAMPLE);
  check('전제: 견본에서 주석을 벗겨 냈다', sampleCode.length < SAMPLE.length,
    'code=' + sampleCode.length + ' / raw=' + SAMPLE.length);
  /* 🔴 «그 글자가 있는가» 로 물으면 안 된다 — 값을 상수로 못 박아도 주석에 이름이 남아 통과한다.
     물어야 할 것은 «그 헤더에서 «읽어» 판정하는가» 이다. */
  check('엔진 이름을 응답 헤더에서 읽는다',
    /eng\s*=\s*String\(\s*r\.headers\.get\('X-TTS-Engine'/.test(sampleCode),
    '상수로 두면 폴백(여자 목소리)을 «그 성우» 로 읽어 사장님이 잘못 고르십니다');
  check('그 값으로 «폴백인가» 를 가린다',
    /eng\.indexOf\('azure'\)\s*<\s*0/.test(sampleCode) && /X-TTS-Fallback/.test(sampleCode),
    '읽어만 두고 안 쓰면 아무것도 안 막습니다');
  /* 🔴 이미 남자인 소리를 또 굽지 않는다 — 두 번 낮아지면 «괴물 목소리» 가 된다 */
  const azBlock = SAMPLE.slice(SAMPLE.indexOf("/* 🎙 Azure 성우"), SAMPLE.indexOf('/* 📱 이 기기에'));
  check('전제: 견본의 Azure 절을 잘라 냈다', azBlock.length > 500, 'len=' + azBlock.length);
  check('Azure 소리는 굽지 않는다', !/deepen\(/.test(azBlock),
    '이미 남자라 또 낮추면 두 번 낮아집니다');
  check('Azure 소리는 배속을 나누지 않는다', /_audio\.playbackRate = rate\(\);/.test(azBlock),
    '굽지 않았으니 되돌릴 것도 없습니다');
}

/* ─────────────────────────────────────────────────────────────────────────
   ⑥ 캐시가 «누구 목소리인가» 를 거짓말하지 않는가  (2026-09-14 실사고)

   사장님 「이거 4개 모두 여자 목소리야.」 — 사슬이 둘이었다.
     ⓐ gtts 폴백이 «요청» 키(=azure:윈시)에 여성 음성을 써 넣었다(캐시 오염).
     ⓑ 캐시 적중 헤더가 «요청이 azure 였나» 로 판정해 그 여성 음성을
        «azure» 라고 말했다 → 화면이 경고를 못 하고 그대로 들려줬다.
   ⚠️ 문자열로 「putCache 가 있는가」를 물으면 못 잡는다 — 둘 다 «있었다».
      물어야 할 것은 «어느 키에 쓰는가»·«무엇을 읽어 판정하는가» 이다.
   ───────────────────────────────────────────────────────────────────────── */
console.log('\n[ ⑥ 캐시가 «누구 목소리인가» 를 거짓말하지 않는가 ]');

const gttsBody = bodyAt(GAMES, 'const gtts = async (txt: string, tl: string) => {');
check('전제: gtts 몸통을 잘라 냈다', gttsBody.length > 200, 'len=' + gttsBody.length);
const gttsCode = stripComments(gttsBody);
check('전제: gtts 에서 주석을 벗겨 냈다', gttsCode.length < gttsBody.length,
  'code=' + gttsCode.length + ' / raw=' + gttsBody.length);
/* 🔴 putCache(=요청 키) 를 쓰면 azure 키에 여성 음성이 들어간다 */
check('gtts 폴백은 «요청» 키에 저장하지 않는다',
  !/\bputCache\s*\(/.test(gttsCode),
  'putCache 는 cacheKey(요청 키)다 — Azure 를 콕 집은 요청이 실패하면 그 키가 azure 키다');
/* 🔴 짝 — 없으면 «아예 저장 안 하기» 도 통과한다(매번 구글을 다시 불러 느려진다) */
check('그래도 «실제로 쓴 화자» 키에는 저장한다 (짝)',
  /putCacheAs\(\s*await ttsKey\(/.test(gttsCode),
  '저장을 통째로 없애면 같은 문장을 매번 새로 만듭니다');
check('그 저장분에 «무엇이 만들었나» 를 적어 둔다',
  /putCacheAs\([^;]*,\s*'gtts'\s*\)/.test(gttsCode),
  '안 적으면 캐시 적중 때 «모름» 이 되어 azure 로 넘겨짚게 됩니다');

/* 🔴 `r2.get(cacheKey)` 는 이 파일에 «둘» 이다 — 그냥 indexOf 하면 다른 라우트의
   캐시 블록이 걸려 엉뚱한 응답을 검사한다(2026-09-14 실제로 밟음). 라우트로 먼저 좁힌다. */
const hitBlock = (() => {
  const r = GAMES.indexOf("path === '/api/voice/tts'");
  if (r < 0) return '';
  const i = GAMES.indexOf('const hit = await r2.get(cacheKey);', r);
  return i < 0 ? '' : GAMES.slice(i, i + 700);
})();
check('전제: 캐시 적중 블록을 잘라 냈다', hitBlock.length > 200, 'len=' + hitBlock.length);
const hitCode = stripComments(hitBlock);
/* 🔴 「요청이 azure 였나」로 넘겨짚으면 폴백 바이트가 azure 로 둔갑한다 */
check('캐시 적중은 «저장된 표시» 를 읽어 엔진을 말한다',
  /customMetadata\s*\?\.\s*eng|customMetadata\)\s*\?\./.test(hitCode) || /customMetadata/.test(hitCode),
  '저장할 때 붙인 표시를 안 읽으면 «무엇이 들어 있나» 를 알 방법이 없습니다');
check('요청 값(azVoice)으로 엔진을 넘겨짚지 않는다',
  !/azVoice\s*\?\s*'r2-cache/.test(hitCode),
  '그것은 «무엇을 달라고 했나» 이지 «무엇이 저장돼 있나» 가 아닙니다');
/* 🔴 «그 글자가 있는가» 로는 «조건 뒤집기» 를 못 본다(`false &&` 한 번이면 통과).
   식을 오려 내 «실제로 돌려» 답으로 묻는다. */
{
  const m = hitCode.match(/'X-TTS-Engine':\s*([^,\n]+)/);
  check('전제: 캐시 적중의 엔진 식을 오려 냈다', !!m, '못 찾으면 아래가 조용히 통과합니다');
  let f0 = null;
  try { f0 = m ? new Function('hitEng', 'return (' + m[1] + ');') : null; } catch { f0 = null; }
  /* ⚠️ «만들기» 만 감싸면 안 된다 — 부를 때 던지는 변이(밖의 값을 참조)가
     깔끔한 FAIL 이 아니라 하니스 크래시가 되어 결과줄조차 안 나온다(실제로 밟음). */
  const f = (v) => { try { return String(f0(v)); } catch (e) { return 'THREW:' + (e && e.message); } };
  let live = false;
  try { if (f0) { f0('azure'); live = true; } } catch { live = false; }
  check('전제: 그 식을 «불러» 볼 수 있다', live,
    (m ? m[1] : '(없음)') + ' → ' + (f0 ? f('azure') : '(만들기 실패)'));
  if (live) {
    check('저장된 표시가 azure 면 azure 라고 말한다',
      f('azure').indexOf('azure') >= 0, '실제: ' + f('azure'));
    /* 🔴 짝 — 없으면 «언제나 azure» 도 통과한다(바로 이번 사고) */
    check('표시가 없으면 azure 라고 말하지 않는다 (짝)',
      f('').indexOf('azure') < 0, '실제: ' + f(''));
    check('표시가 gtts 면 gtts 라고 말한다 (짝)',
      f('gtts').indexOf('azure') < 0 && f('gtts').indexOf('gtts') >= 0, '실제: ' + f('gtts'));
  }
}
/* 🔴 짝 — 진단 헤더 자체가 사라지면 화면이 판정할 근거를 잃는다 */
check('캐시 적중에도 진단 헤더 둘을 싣는다 (짝)',
  /'X-TTS-Engine':/.test(hitCode) && /'X-TTS-Speaker':/.test(hitCode),
  '빼면 화면이 「지금 소리가 고른 목소리인가」를 캐시 때만 못 봅니다');

/* 🔴 «넘기는가» 만 보면 구멍이 남는다 — putCacheAs 가 그 인자를 «무시» 해도 통과한다
   (변이 실측: 표시를 안 적게 바꿔도 58/0 초록이었다). «받아서 쓰는가» 를 함께 묻는다.
   그러면 azure 성공분에 표시가 안 붙어, 두 번째 재생부터 화면이 «못 받았다» 는
   거짓 경고를 하게 된다(성우가 나오는데도 못 듣게 됩니다). */
{
  const putBody = bodyAt(GAMES, 'const putCacheAs = async (key: string, bytes: ArrayBuffer | Uint8Array, eng?: string) => {');
  check('전제: putCacheAs 몸통을 잘라 냈다', putBody.length > 120, 'len=' + putBody.length);
  const putCode = stripComments(putBody);
  check('putCacheAs 는 받은 표시(eng)를 실제로 적는다',
    /customMetadata/.test(putCode) && /\beng\b/.test(putCode),
    '인자만 받고 안 쓰면 캐시 적중이 언제나 «모름» 이 되어 거짓 경고가 납니다');
}
check('Azure 성공분에는 «azure» 표시를 달아 저장한다',
  /putCacheAs\(\s*cacheKey\s*,\s*az\.bytes\s*,\s*'azure'\s*\)/.test(stripComments(zhBlock)),
  '표시가 없으면 다음 요청의 캐시 적중이 그것을 «모름» 으로 봅니다');
/* 🔴 이미 오염된 옛 항목을 그대로 쓰면 고쳐도 사장님 화면은 그대로다 */
check('오염된 옛 azure 캐시 항목을 버렸다(키 세대)',
  /'azure2:'\s*\+\s*azVoice/.test(stripComments(GAMES)) && !/'azure:'\s*\+\s*azVoice/.test(stripComments(GAMES)),
  "옛 키(azure:)를 그대로 두면 이미 저장된 여성 음성이 계속 나옵니다");

if (SAMPLE) {
  /* 🔴 견본 화면 — 눌렀던 버튼이 «■ 멈추기» 인 채 남던 것(사장님 사진에 4개 전부) */
  const sc = stripComments(SAMPLE);
  check('성우 버튼도 공용 _curBtn 으로 추적한다',
    /_curBtn === b/.test(sc) && /_curBtn = b;/.test(sc),
    'stopNow() 가 _curBtn 만 되돌리므로 따로 들고 있으면 영영 «멈추기» 로 남습니다');
  check('그 절에 지역 변수 cur 이 남아 있지 않다 (짝)',
    !/\bvar\s+cache\s*=\s*\{\}\s*,\s*cur\b/.test(sc) && !/\bcur\s*=\s*b;/.test(sc),
    '둘이 같이 있으면 어느 쪽이 참인지 화면이 모릅니다');
  check('폴백일 때 소리를 내지 않는다',
    /indexOf\('azure'\)\s*<\s*0\)\s*\{[\s\S]{0,400}?return;/.test(sc),
    '여자 목소리를 «윈시» 로 듣고 고르시게 됩니다');
  /* 🔴 위 검사는 «조건 뒤집기» 를 못 본다 — `if(false && o.eng.indexOf('azure')<0)` 로
     막아도 그 글자가 그대로 남는다. 조건을 오려 내 실제로 돌려 답으로 묻는다. */
  {
    /* ⚠️ `[^{]*` 로 잡으면 앞 문장(`if(mine !== _seq) return;`)까지 딸려 온다 —
       세미콜론·줄바꿈을 막아 «가장 가까운 if» 만 잡는다(실제로 밟음). */
    const m = sc.match(/if\s*\(([^{};\n]*indexOf\('azure'\)[^{};\n]*)\)\s*\{/);
    check('전제: 견본의 폴백 판정 조건을 오려 냈다', !!m, '못 찾으면 아래가 조용히 통과합니다');
    let g0 = null;
    try { g0 = m ? new Function('o', 'return (' + m[1] + ');') : null; } catch { g0 = null; }
    /* ⚠️ 위와 같은 이유로 «부를 때» 도 감싼다 — 크래시는 FAIL 이 아니라 «안 보임» 이다. */
    const g = (o) => { try { return g0(o); } catch (e) { return 'THREW:' + (e && e.message); } };
    let glive = false;
    try { if (g0) { g0({ eng: 'gtts' }); glive = true; } } catch { glive = false; }
    check('전제: 그 조건을 «불러» 볼 수 있다', glive,
      (m ? m[1] : '(없음)') + ' → ' + (g0 ? String(g({ eng: 'gtts' })) : '(만들기 실패)'));
    if (glive) {
      check('폴백(gtts)이면 «못 받았다» 로 간다', g({ eng: 'gtts', why: 'http_401' }) === true,
        '실제: ' + g({ eng: 'gtts', why: 'http_401' }));
      /* 🔴 짝 — 없으면 «전부 경고» 도 통과해 성우가 나와도 못 듣게 된다 */
      check('진짜 성우면 그대로 들려준다 (짝)', g({ eng: 'azure', why: '' }) === false,
        '실제: ' + g({ eng: 'azure', why: '' }));
      check('azure 캐시본도 그대로 들려준다 (짝)', g({ eng: 'r2-cache:azure', why: '' }) === false,
        '실제: ' + g({ eng: 'r2-cache:azure', why: '' }));
    }
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   ⑦ 웜업이 그 성우를 «실제로» 쓰는가  (2026-09-14 사장님 지시로 윈시 배선)

   🔴 여기서 틀리면 «두 번 낮아진 괴물 목소리» 가 된다 — 진짜 남성 성우를 받아 놓고
      또 굵게 구우면 ZH_MALE_PITCH 만큼 한 번 더 내려간다.
   ⚠️ 판정 근거는 «성우를 달라고 했나» 가 아니라 «무엇이 만들어 왔나»(X-TTS-Engine) 다.
      서버가 못 만들면 여성 음성이 그대로 내려오고, 그때는 굽기가 «있어야» 남자가 된다.
   ───────────────────────────────────────────────────────────────────────── */
console.log('\n[ ⑦ 웜업이 그 성우를 실제로 쓰는가 ]');
const WARM = (() => { try { return read('cloudflare-deploy/public/warmup.html'); } catch { return null; } })();
if (!WARM) { check('전제: warmup.html 을 읽었다', false, '못 읽으면 아래가 조용히 사라집니다'); }
else {
  const wc = stripComments(WARM);
  const nameM = wc.match(/var ZH_MALE_AZURE\s*=\s*'([a-z]+)'/);
  check('웜업이 쓸 성우 이름이 있다', !!nameM, '없으면 예전처럼 여성 음성을 굽기만 합니다');
  /* 🔴 모르는 이름이면 서버가 null 로 보고 조용히 예전 경로로 간다 — 에러가 안 난다 */
  check('그 이름을 서버가 안다 (정본 목록과 대조)',
    !!nameM && AZURE_ZH_VOICES && Object.prototype.hasOwnProperty.call(AZURE_ZH_VOICES, nameM[1]),
    '실제: ' + (nameM ? nameM[1] : '(없음)') + ' / 아는 이름: ' + Object.keys(AZURE_ZH_VOICES || {}).join(','));
  check('요청 본문에 그 이름을 싣는다', /azure_voice:\s*_zhMaleWanted\(\)\s*\?\s*ZH_MALE_AZURE/.test(wc),
    '안 실으면 서버가 예전 경로로만 갑니다');
  /* 🔴 짝 — 조건 없이 실으면 메이(여자)·영어까지 남자 성우가 된다 */
  check('중국어 «남자» 일 때만 싣는다 (짝)',
    /azure_voice:[^,\n]*_zhMaleWanted\(\)/.test(wc) && !/azure_voice:\s*ZH_MALE_AZURE\s*[,}]/.test(wc),
    '조건 없이 실으면 메이(여자)와 영어까지 남자 목소리가 됩니다');
  check('응답에서 «무엇이 만들었나» 를 읽는다',
    /eng\s*=\s*String\(\s*r\.headers\.get\('X-TTS-Engine'/.test(wc),
    '안 읽으면 진짜 성우인지 폴백인지 구별할 방법이 없습니다');

  /* «굽는가» 판정을 오려 내 실제로 돌린다 — 글자로 물으면 조건 뒤집기를 못 본다 */
  const gm = wc.match(/if\s*\(([^{};\n]*indexOf\('azure'\)[^{};\n]*)\)\s*\{\s*play0\(u,\s*false\)/);
  check('전제: 웜업의 굽기 판정을 오려 냈다', !!gm, '못 찾으면 아래가 조용히 통과합니다');
  let w0 = null;
  try { w0 = gm ? new Function('eng', 'return (' + gm[1] + ');') : null; } catch { w0 = null; }
  const w = (v) => { try { return w0(v); } catch (e) { return 'THREW:' + (e && e.message); } };
  let wlive = false;
  try { if (w0) { w0('azure'); wlive = true; } } catch { wlive = false; }
  check('전제: 그 판정을 «불러» 볼 수 있다', wlive, gm ? gm[1] : '(없음)');
  if (wlive) {
    check('진짜 성우(azure)면 굽지 않는다', w('azure') === true, '실제: ' + w('azure'));
    check('캐시본(r2-cache:azure)도 굽지 않는다', w('r2-cache:azure') === true, '실제: ' + w('r2-cache:azure'));
    /* 🔴 짝 — 없으면 «전부 안 굽기» 도 통과해 여자 목소리가 그대로 납니다(고치기 전 상태) */
    check('폴백(gtts)이면 예전처럼 굵게 굽는다 (짝)', w('gtts') === false, '실제: ' + w('gtts'));
    check('헤더가 없어도(옛 배포) 굵게 굽는다 (짝)', w('') === false, '실제: ' + w(''));
  }
  /* 🔴 캐시가 엔진을 안 기억하면 «두 번째 재생부터» 또 굽는다 — 첫 재생만 들어 보면 못 본다 */
  check('캐시가 «무엇이 만들었나» 를 함께 기억한다', /_ttsEng\[key\]\s*=\s*o\.eng/.test(wc),
    '안 기억하면 캐시에서 꺼낼 때 진짜 성우를 또 굽습니다');
  check('캐시 적중 때 그것을 함께 넘긴다 (짝)', /play\(_ttsCache\[key\],\s*_ttsEng\[key\]\)/.test(wc),
    '기억만 하고 안 넘기면 아무 일도 안 합니다');
}

console.log('\n─────────────────────────────────────────────');
console.log(`  통과 ${PASS} · 실패 ${FAIL}`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach((f) => console.log('   · ' + f)); process.exit(1); }
process.exit(0);
