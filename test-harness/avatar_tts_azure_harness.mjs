// 🔊 A.i 상담사 워커 /api/tts — Typecast → Azure Speech + R2 캐시 (2026-10-26)
//   워커 모듈을 «실제로 불러» 가짜 Azure·R2(장애 포함)로 돌려 봅니다. 「된다」 옆에 「안 된다」를 짝으로 둡니다.
//   📄 docs/작업기록/261026_AI상담사_TTS_Azure전환.md
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.env.TTS_SRC || join(ROOT, 'mangoi-ai-avatar-cf/src/index.js');
const TOML = join(ROOT, 'mangoi-ai-avatar-cf/wrangler.toml');
const src = readFileSync(SRC, 'utf8');
const toml = readFileSync(TOML, 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ FAIL ' + name); } };

const mod = await import(pathToFileURL(SRC).href + '?t=' + Date.now());
const worker = mod.default;

// ── 가짜 외부 서비스 ──
let azureMode = 'ok', azureCalls = 0, lastReq = null;
globalThis.fetch = async (url, opt) => {
  if (!String(url).includes('tts.speech.microsoft.com')) throw new Error('unexpected fetch ' + url);
  azureCalls++; lastReq = { url: String(url), opt };
  if (azureMode === 'ok') return new Response(new Uint8Array(3000), { status: 200 });
  if (azureMode === '500') return new Response('err', { status: 500 });
  if (azureMode === 'empty') return new Response(new Uint8Array(10), { status: 200 });
  throw new Error('network down');
};
function fakeR2() {
  const store = new Map();
  return { store, async get(k) { const v = store.get(k); return v === undefined ? null : { body: new Response(v).body, text: async () => (typeof v === 'string' ? v : '') }; },
    async put(k, v) { store.set(k, v); } };
}
const KEY = { AZURE_SPEECH_KEY: 'k', AZURE_SPEECH_REGION: ' KoreaCentral ' };
const call = (body, env, method = 'POST') => worker.fetch(new Request('https://x/api/tts', { method, body: method === 'GET' ? undefined : body }), env, { waitUntil: (p) => p });

console.log('① 정적 — Typecast 를 안 부르고, 상수를 export 하지 않는다');
ok('워커 코드에 api.typecast.ai 호출이 없다', !/api\.typecast\.ai/.test(src));
const nonFn = Object.entries(mod).filter(([k, v]) => k !== 'default' && typeof v !== 'function').map(([k]) => k);
ok('named export 는 전부 함수(상수를 export 하면 Cloudflare 런타임이 시작부터 실패) ' + JSON.stringify(nonFn), nonFn.length === 0);
ok('wrangler.toml 에 R2 바인딩 TTS_CACHE', /binding\s*=\s*"TTS_CACHE"/.test(toml) && /bucket_name\s*=\s*"mangoi-avatar-tts-cache"/.test(toml));

console.log('② Azure 로 만들고, 두 번째는 캐시');
{
  const R2 = fakeR2(); const env = { ...KEY, TTS_CACHE: R2 };
  azureMode = 'ok'; azureCalls = 0;
  let r = await call(JSON.stringify({ text: '안녕하세요 관리자님! 😊' }), env);
  ok('첫 요청 200 audio/mpeg · azure', r.status === 200 && /audio\/mpeg/.test(r.headers.get('content-type')) && r.headers.get('X-TTS-Provider') === 'azure');
  ok('여성 한국어 기본 목소리 ko-KR-SunHiNeural', r.headers.get('X-TTS-Voice') === 'ko-KR-SunHiNeural');
  ok('리전은 공백·대소문자 정리(koreacentral)', lastReq && lastReq.url.startsWith('https://koreacentral.tts.speech.microsoft.com/'));
  ok('이모지는 Azure 로 보내지 않는다', lastReq && !/😊/u.test(lastReq.opt.body));
  r = await call(JSON.stringify({ text: '  안녕하세요   관리자님!  ' }), env);
  ok('띄어쓰기·이모지만 다른 같은 문장 → r2-cache, Azure 추가 호출 0', r.status === 200 && r.headers.get('X-TTS-Provider') === 'r2-cache' && azureCalls === 1);
  ok('키가 없어도 만들어 둔 소리는 난다', (await call(JSON.stringify({ text: '안녕하세요 관리자님!' }), { TTS_CACHE: R2 })).status === 200);
  const u = await (await worker.fetch(new Request('https://x/api/tts/usage'), env, {})).json();
  ok('사용량: 실제 Azure 호출 1회만 센다', u.azure_calls === 1 && u.azure_chars === '안녕하세요 관리자님!'.length && u.commit_recommended === false);
}

console.log('③ 비용 상한·입력 검사 (짝: 정상 입력은 통과)');
{
  const env = { ...KEY };
  azureMode = 'ok';
  ok('600자 → 통과', (await call(JSON.stringify({ text: '가'.repeat(600) }), env)).status === 200);
  ok('601자 → 413', (await call(JSON.stringify({ text: '가'.repeat(601) }), env)).status === 413);
  ok('숫자 text → 400', (await call('{"text":123}', env)).status === 400);
  ok('객체 text → 400', (await call('{"text":{"a":1}}', env)).status === 400);
  ok('이모지만 → 400', (await call('{"text":"😊😊"}', env)).status === 400);
  ok('JSON 아님 → 400', (await call('not json', env)).status === 400);
  ok('GET → 405', (await call(null, env, 'GET')).status === 405);
  ok('키 없음 → 503(화면이 브라우저 음성으로)', (await call('{"text":"안녕"}', {})).status === 503);
  await call(JSON.stringify({ text: 'A<B & "C" </voice><voice name=\'evil\'>' }), env);
  ok('SSML 이스케이프 — 태그 주입 불가', lastReq && lastReq.opt.body.includes('A&lt;B &amp; &quot;C&quot; &lt;/voice&gt;') && (lastReq.opt.body.match(/<voice /g) || []).length === 1);
  ok('잘못된 목소리 환경변수 → 기본값', mod.azureVoice({ AZURE_VOICE_KO: 'x"><bad' }, 'ko') === 'ko-KR-SunHiNeural');
  ok('운영비서 전용 목소리(선택)', mod.azureVoice({ AZURE_VOICE_KO_OPS: 'ko-KR-JiMinNeural' }, 'ko', 'ops') === 'ko-KR-JiMinNeural');
  ok('영어 문장 → 영어 목소리', mod.azureVoice({}, 'en') === 'en-US-JennyNeural');
}

console.log('④ 장애 — 오디오가 아닌 것을 «소리» 로 내보내거나 캐시에 넣지 않는다');
for (const m of ['500', 'empty', 'throw']) {
  const R2 = fakeR2(); azureMode = m;
  const r = await call(JSON.stringify({ text: '장애 시험 문장 ' + m }), { ...KEY, TTS_CACHE: R2 });
  ok(`Azure ${m} → 502 JSON · 캐시 저장 0`, r.status === 502 && /json/.test(r.headers.get('content-type')) && [...R2.store.keys()].every((k) => !k.startsWith('tts/')));
}
azureMode = 'ok';

console.log('⑤ 약정 권장 판단');
ok('6,399만 자 → 권장 안 함', mod.usageReport('2026-10', { chars: 63990000, calls: 1 }).commit_recommended === false);
ok('6,400만 자 → 권장', mod.usageReport('2026-10', { chars: 64000000, calls: 1 }).commit_recommended === true);
ok('월은 한국 시간 기준', mod.usageMonth(Date.UTC(2026, 9, 31, 16, 0)) === '2026-11');

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
