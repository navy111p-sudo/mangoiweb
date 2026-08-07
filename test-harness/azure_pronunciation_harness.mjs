#!/usr/bin/env node
/**
 * 🎤 Azure 발음평가 하니스 (2026-08-08)
 *
 * 지키는 것 — «키가 없어도 서비스가 그대로 굴러간다» 가 최우선이다.
 *   ① 키가 없으면 조용히 null (예외를 던지면 음성코치 전체가 죽는다)
 *   ② WAV 가 아니면 null (Azure 는 webm 을 못 받는다 — 보내면 400 이 쏟아진다)
 *   ③ 한글·중국어 모범문장을 헤더에 담아도 안 터진다 (btoa 는 비ASCII 에서 던진다)
 *   ④ Azure 점수가 오면 «또렷함» 이 그것으로 «대체» 된다 (섞지 않는다)
 *   ⑤ 소리가 엉망이면 글자가 맞아도 «좋아요» 가 안 나온다 (종합 상한)
 *   ⑥ 딴말(langMismatch)은 Azure 로도 되살아나지 않는다
 *   ⑦ ⛔ 모범문장이 Whisper initial_prompt 로 새지 않는다 (2026-07-29 만점 사고)
 */
import { execSync } from 'child_process';
import { pathToFileURL, fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, unlinkSync, readFileSync } from 'fs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(ROOT, 'cloudflare-deploy', 'src');
const OUT = join(ROOT, 'test-harness', '.azure-pron.mjs');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' — ' + extra : '')); }
};

// ── 실제 코드를 esbuild 로 묶어 «진짜 실행» 한다(정규식 검사보다 강하다) ──
let M, V;
try {
  execSync(`npx --yes esbuild "${join(SRC, 'azure-pronunciation.ts')}" --bundle --format=esm --platform=node --outfile="${OUT}"`, { stdio: 'pipe' });
  M = await import(pathToFileURL(OUT).href + '?t=' + Date.now());
  const OUT2 = OUT.replace('.mjs', '-vs.mjs');
  execSync(`npx --yes esbuild "${join(SRC, 'voice-score.ts')}" --bundle --format=esm --platform=node --outfile="${OUT2}"`, { stdio: 'pipe' });
  V = await import(pathToFileURL(OUT2).href + '?t=' + Date.now());
  try { unlinkSync(OUT2); } catch {}
} catch (e) {
  console.error('FAIL: 컴파일/로드 실패 —', String(e?.message || e).split('\n')[0]);
  process.exit(1);
} finally {
  try { if (existsSync(OUT)) unlinkSync(OUT); } catch {}
}

// ── 도구: 16kHz mono WAV 만들기 ──
function makeWav(seconds) {
  const n = Math.round(16000 * seconds);
  const buf = new ArrayBuffer(44 + n * 2), dv = new DataView(buf);
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); ws(8, 'WAVE'); ws(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, 16000, true); dv.setUint32(28, 32000, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  ws(36, 'data'); dv.setUint32(40, n * 2, true);
  return buf;
}

// ── ② WAV 판별 ──
const w3 = M.wavSeconds(makeWav(3));
ok('WAV 길이를 읽는다 (3초)', w3 !== null && Math.abs(w3 - 3) < 0.05, 'got ' + w3);
ok('WAV 가 아니면 null (webm 흉내)', M.wavSeconds(new TextEncoder().encode('\x1aE\xdf\xa3webm...').buffer) === null);
ok('너무 짧은 버퍼도 null', M.wavSeconds(new ArrayBuffer(10)) === null);

/* ── ① 실패는 예외가 아니라 «사유가 붙은 실패» 로 돌아온다 ──
   🔑 사유가 없으면 «키가 틀렸나 / 소리를 못 알아들었나» 를 구분할 수 없다.
      실제로 붙이던 날 밤에 그게 안 갈려서 한참 헤맸다. 그래서 사유까지 검사한다. */
const K = { AZURE_SPEECH_KEY: 'k', AZURE_SPEECH_REGION: 'koreacentral' };
const why = async (env, audio, ref, lang) => (await M.assessPronunciation(env, audio, ref, lang))?.reason;
ok('키가 없으면 no_key (예외 아님)', (await why({}, makeWav(2), 'Hello there.', 'en')) === 'no_key');
ok('리전만 빠지면 no_region', (await why({ AZURE_SPEECH_KEY: 'k' }, makeWav(2), 'Hi.', 'en')) === 'no_region');
ok('모범문장이 없으면 no_reference', (await why(K, makeWav(2), '', 'en')) === 'no_reference');
ok('WAV 가 아니면 네트워크에 안 나가고 not_wav', (await why(K, new ArrayBuffer(500), 'Hi.', 'en')) === 'not_wav');
ok('30초 넘으면 too_long', (await why(K, makeWav(60), 'Hi.', 'en')) === 'too_long');
ok('지원 밖 언어는 lang_unsupported', String(await why(K, makeWav(2), 'Bonjour', 'xx')).startsWith('lang_unsupported'));
ok('실패에도 ok:false 가 붙는다', (await M.assessPronunciation({}, makeWav(2), 'Hi.', 'en')).ok === false);
// ⛔ 사유에 키가 섞여 들어가면 안 된다
const leak = await M.assessPronunciation({ AZURE_SPEECH_KEY: 'SUPERSECRETKEY123', AZURE_SPEECH_REGION: '' }, makeWav(2), 'Hi.', 'en');
ok('사유에 키가 새지 않는다', !JSON.stringify(leak).includes('SUPERSECRETKEY123'), JSON.stringify(leak));

// ── ③ 로케일 · 비ASCII ──
ok('en → en-US', M.azureLocale('en') === 'en-US');
ok('zh → zh-CN (중국어 음성코치가 쓴다)', M.azureLocale('zh') === 'zh-CN');
ok('ko → ko-KR', M.azureLocale('ko') === 'ko-KR');
ok('모르는 언어는 null', M.azureLocale('vi') === null);
// 한글이 든 모범문장으로 «호출 직전» 까지 가도 터지지 않아야 한다(btoa 함정).
let threw = null;
try { await M.assessPronunciation({ AZURE_SPEECH_KEY: '', AZURE_SPEECH_REGION: '' }, makeWav(2), '안녕하세요 반갑습니다', 'ko'); }
catch (e) { threw = e; }
ok('한글 모범문장에서 예외가 안 난다', threw === null, String(threw));

// ── ④⑤⑥ 점수판에 얹기 ──
const base = {
  accuracy: 100, pronunciation: 100, fluency: 100, completeness: 100,
  overall: 99, langMismatch: false, acoustic: false,
  counts: { ok: 6, close: 0, wrong: 0, wrongContent: 0, missing: 0, extra: 0 },
};
const good = V.applyAzurePronunciation(base, { accuracy: 96, fluency: 95, completeness: 100, pron: 96 });
ok('또렷함이 Azure 값으로 «대체» 된다', good.pronunciation === 96, 'got ' + good.pronunciation);
ok('음소 채점 표시가 붙는다', good.phoneme === true && good.acoustic === true);

// 🔴 이게 사장님 지적의 핵심: 글자는 맞는데 소리가 엉망인 경우
const mumbled = V.applyAzurePronunciation(base, { accuracy: 25, fluency: 60, completeness: 100, pron: 30 });
ok('글자가 맞아도 소리가 엉망이면 종합이 크게 내려간다', mumbled.overall <= 55, 'overall=' + mumbled.overall);
ok('  그때 등급이 «좋아요(B)» 이상이 아니다', V.scoreTier(mumbled.overall).tier !== 'S' && V.scoreTier(mumbled.overall).tier !== 'A' && V.scoreTier(mumbled.overall).tier !== 'B',
   'tier=' + V.scoreTier(mumbled.overall).tier);
// 🔁 역검증 — 상한을 없애면 위 검사가 잡아야 한다(지금 값이 우연히 통과한 게 아님을 보인다)
const noCapOverall = Math.min(Math.round(100 * 0.6 + 25 * 0.25 + 60 * 0.15), 112);
ok('  역검증: 상한이 없었다면 «좋아요» 였다', noCapOverall >= 70, 'nocap=' + noCapOverall);

ok('Azure 가 없으면 아무것도 안 바뀐다', JSON.stringify(V.applyAzurePronunciation(base, null)) === JSON.stringify(base));
const mismBase = { ...base, langMismatch: true, accuracy: 0, overall: 0 };
const mism = V.applyAzurePronunciation(mismBase, { accuracy: 99, fluency: 99, completeness: 99, pron: 99 });
ok('딴말은 Azure 로도 안 되살아난다 (원본 그대로)',
   JSON.stringify(mism) === JSON.stringify(mismBase), 'overall=' + mism.overall);
const junk = V.applyAzurePronunciation(base, { accuracy: NaN, fluency: 50, completeness: 50, pron: 50 });
ok('값이 이상하면 손대지 않는다', junk.pronunciation === base.pronunciation);

// ── ⑦ ⛔ 모범문장이 Whisper 로 새지 않는다 ──
const games = readFileSync(join(SRC, 'api-games.ts'), 'utf8');
const turboBlock = games.slice(games.indexOf('const turboParams'), games.indexOf('const turboParams') + 900);
ok('turboParams 에 paReference 가 없다 (정답유출 차단)', turboBlock.length > 0 && !turboBlock.includes('paReference'));
ok('initial_prompt 는 여전히 hintPrompt 만 쓴다',
   /turboParams\.initial_prompt\s*=\s*hintPrompt/.test(games));
ok('reference 는 Azure 호출에만 쓰인다',
   /assessPronunciation\(\s*env as any,\s*audio,\s*paReference/.test(games));
ok('예외가 나도 전사는 계속된다 (try/catch 로 감쌈)',
   /try \{ return await assessPronunciation[\s\S]{0,200}?catch/.test(games));
ok('실패 사유를 azure_diag 로 돌려준다', /azure_diag/.test(games));
ok('점수는 ok 일 때만 azure 로 나간다', /azure:\s*\(r && r\.ok\)\s*\?\s*r\s*:\s*null/.test(games));
/* 🔴 2026-08-08 실측 회귀 방지 — Whisper 와 «동시에» 부르면 Azure 쪽이 본문 없는 400 ·
   Network connection lost 로 들쭉날쭉 죽는다. 다시 Promise 로 겹치지 못하게 못 박는다. */
ok('⛔ Azure 를 Whisper 와 동시에 띄우지 않는다 (순차 호출)',
   !/const\s+azurePromise/.test(games) && /const runAzure = async/.test(games));

// ── 키가 짧게 들어간 경우(붙여넣기 실패) ──
ok('키가 너무 짧으면 네트워크에 안 나가고 key_too_short',
   (await why({ AZURE_SPEECH_KEY: 'ab', AZURE_SPEECH_REGION: 'koreacentral' }, makeWav(2), 'Hi.', 'en')) === 'key_too_short');
ok('  🔬 이 검사가 있는 이유: Azure 는 짧은 키에 401 이 아니라 «본문 없는 400» 을 준다',
   /key_too_short/.test(readFileSync(join(SRC, 'azure-pronunciation.ts'), 'utf8')));
ok('진단용 __PROBE__ 우회로는 제거됐다',
   !readFileSync(join(SRC, 'azure-pronunciation.ts'), 'utf8').includes('__PROBE__'));
ok('키 길이·모양을 응답에 싣지 않는다',
   !/keylen=/.test(readFileSync(join(SRC, 'azure-pronunciation.ts'), 'utf8')));

const html = readFileSync(join(ROOT, 'cloudflare-deploy', 'public', 'speech-coach.html'), 'utf8');
ok('프론트: WAV 만들기가 실패하면 예전 webm 으로 돌아간다', /processAudio\(wav \|\| webm\)/.test(html));
ok('프론트: reference 를 보낸다', /fd\.append\('reference'/.test(html));
ok('프론트: prompt 는 여전히 안 보낸다 (07-29 사고)', !/fd\.append\('prompt'/.test(html));

/* ── 🔬 프론트의 WAV 인코더를 «실제로 실행» 해 본다 ────────────────────────────
   여기가 제일 위험한 곳이다. 바이트 하나만 어긋나도 Azure 가 전부 400 을 뱉는데,
   눈으로는 «녹음은 되는데 발음평가만 안 되네» 로 보여 원인을 못 찾는다.
   HTML 에서 두 함수를 오려내 가짜 AudioContext 로 돌리고, 나온 바이트를
   **서버 쪽 파서(wavSeconds)로 되읽어** 서로 아귀가 맞는지 확인한다. */
{
  const s = html.indexOf('let _pcmCtx');
  const e = html.indexOf('async function toggleRec');
  const code = html.slice(s, e);
  ok('프론트에서 WAV 인코더를 오려냈다', s > 0 && e > s && code.includes('function pcmStopToWav'));

  const sandbox = { window: {}, Float32Array, Int16Array, ArrayBuffer, DataView, Blob, Math, Number };
  const fn = new Function('window', 'Blob', code + `
    ;return { start: pcmStart, stop: pcmStopToWav,
              feed: function(rate, parts){ _pcmCtx = {close(){}}; _pcmNode={disconnect(){}}; _pcmSrc={disconnect(){}};
                                           _pcmRate = rate; _pcmBuf = parts; } };`);
  const api = fn(sandbox.window, Blob);

  // 48kHz 로 1초치 사인파를 넣는다(실제 브라우저 기본 샘플레이트)
  const RATE = 48000, SECS = 1.0;
  const src = new Float32Array(RATE * SECS);
  for (let i = 0; i < src.length; i++) src[i] = Math.sin(2 * Math.PI * 440 * i / RATE) * 0.5;
  api.feed(RATE, [src]);
  const blob = api.stop();
  ok('WAV Blob 이 만들어진다', !!blob && blob.type === 'audio/wav');

  const bytes = await blob.arrayBuffer();
  const secs = M.wavSeconds(bytes);
  ok('서버 파서가 그 WAV 를 읽는다', secs !== null, 'got ' + secs);
  ok('길이가 맞는다 (1초 ±5%)', secs !== null && Math.abs(secs - SECS) < 0.05, 'got ' + secs);

  const dv = new DataView(bytes);
  ok('16kHz mono 16bit 로 나온다',
     dv.getUint32(24, true) === 16000 && dv.getUint16(22, true) === 1 && dv.getUint16(34, true) === 16,
     `rate=${dv.getUint32(24, true)} ch=${dv.getUint16(22, true)} bits=${dv.getUint16(34, true)}`);
  ok('RIFF 크기 필드가 실제 바이트수와 맞는다',
     dv.getUint32(4, true) === bytes.byteLength - 8,
     `${dv.getUint32(4, true)} vs ${bytes.byteLength - 8}`);
  // 무음이 아니어야 한다 — 리샘플이 0 을 뱉으면 Azure 는 "NoMatch" 만 돌려준다
  let peak = 0;
  const pcm = new Int16Array(bytes, 44);
  for (let i = 0; i < pcm.length; i += 7) peak = Math.max(peak, Math.abs(pcm[i]));
  ok('소리가 실제로 담긴다 (무음 아님)', peak > 8000, 'peak=' + peak);

  // 빈 녹음은 null → 서버로 보내지 않는다
  api.feed(RATE, []);
  ok('빈 녹음이면 null', api.stop() === null);
}

console.log('\n────────────────────────────');
console.log(fail === 0 ? `✅ ALL PASS — ${pass} 통과 / 0 실패` : `❌ ${pass} 통과 / ${fail} 실패`);
process.exit(fail === 0 ? 0 : 1);
