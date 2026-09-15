// voice_tts_cap_harness.mjs — 💸 무인증 /api/voice/tts 의 Azure 호출 상한 (2026-09-15)
//
// 왜 만들었나
//   그 라우트는 **로그인 없이 누구나** 부를 수 있는데 뒤에 Azure Speech(종량제)가 붙어 있다.
//   한 번에 나가는 돈은 이미 막혀 있었지만(300자 · 아는 성우 4명 · R2 캐시)
//   «몇 번 부를 수 있나» 를 세는 코드가 한 줄도 없었다.
//
// ⚠️ 문자열 검사로는 이 종류를 못 잡는다 — CLAUDE.md 「비용이 나가는 API」:
//    게이트를 라우트 «안» 에만 두면 `if (false && n >= CAP)` 처럼 조건을 뒤집어도
//    그 글자가 그대로 남아 통과한다(선례 judgment-sample-gate: 변이 3종이 43/43 통과).
//    그래서 이 하니스는 **판정을 오려 내 실제로 돌린다.**
//
// 🔴 이 하니스가 지키는 가장 중요한 것 두 가지
//    ① 막혀도 **소리는 난다** — 429 로 끊지 않고 예전 경로(구글 만다린)로 내려간다.
//       (소리가 아예 안 나는 것이 최악 — azure-tts.ts 머리말과 같은 방향)
//    ② 못 세면 **막지 않는다**(fail-open) — 고장 난 가드가 기능을 영구히 막는 쪽이 나쁘다.
//
// 변이시험 (전부 실제 FAIL 확인 — 2026-09-15, ⑥절이 스스로 돌린다)
//   Ⓐ `return n < cap` → `return true`            → ①절 FAIL (상한 무력화)
//   Ⓑ `n < cap` → `n < cap * 1000`                → ①절 FAIL (상한 1000배)
//   Ⓒ `return n < cap` → `return n < cap && false`→ ①절 FAIL (짝: 전부 막기)
//   Ⓓ fail-open 줄 지우기                          → ①절 FAIL
//   Ⓔ 키에서 IP 무시(전역 카운터)                   → ②절 FAIL
//   Ⓕ 키에서 KST 보정 지우기                        → ②절 FAIL
//   Ⓖ 라우트 `if (!azureTtsAllowed(...))` → `if (false && ...)` → ③⑤절 FAIL 3건
//   Ⓗ 라우트 `if (azVoice && !azFail)` → `if (azVoice)`          → ③절 FAIL
//   Ⓘ 카운터 put 한 줄 지우기(안 셈 = 상한이 영영 안 걸림)        → ④-2절 FAIL
//      🔴 Ⓘ 는 처음에 **통과했다**(58/0). 「SESSION_STATE 가 있는가」로 물었기 때문이다 —
//         get 만 남아도 그 글자는 있다. 그래서 ④-2 가 블록을 오려 내 가짜 KV 로 돌린다.
//   Ⓙ 올리는 값을 하드코딩(String(1))                            → ④-2절 FAIL
//   Ⓚ 막힌 요청도 카운터를 올리기                                 → ④-2절 FAIL (짝 검사)

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..', 'cloudflare-deploy');
const TS = readFileSync(join(ROOT, 'src', 'voice-tts-cap.ts'), 'utf8');
const GAMES = readFileSync(join(ROOT, 'src', 'api-games.ts'), 'utf8');

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ✅ ' + msg); } else { fail++; console.log('  ❌ ' + msg); } };

/* 주석을 벗겨 낸 사본 — 부정 검사는 반드시 이것으로 판정한다.
   (내가 적은 ⛔ 주석이 그 글자를 담고 있어 검사가 «자기 주석» 을 잡는 사고가 이 저장소에 있다) */
function strip(t) {
  let out = '', i = 0, n = t.length;
  let inBlock = false, inLine = false, q = '';
  while (i < n) {
    const c = t[i], d = t[i + 1];
    if (inBlock) { if (c === '*' && d === '/') { inBlock = false; i += 2; continue; } i++; continue; }
    if (inLine) { if (c === '\n') { inLine = false; out += c; } i++; continue; }
    if (q) { if (c === '\\') { out += c + (d || ''); i += 2; continue; } if (c === q) q = ''; out += c; i++; continue; }
    if (c === '/' && d === '*') { inBlock = true; i += 2; continue; }
    if (c === '/' && d === '/') { inLine = true; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') q = c;
    out += c; i++;
  }
  return out;
}

/* 중괄호 짝으로 블록을 자른다. ⛔ 길이로 자르지 말 것(옆 함수가 딸려 온다). */
function bodyAt(src, anchor) {
  const s = src.indexOf(anchor);
  if (s < 0) return '';
  let i = src.indexOf('{', s);
  if (i < 0) return '';
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(s, j + 1); }
  }
  return '';
}

/* 정본을 «타입만 벗겨» 실제로 돌린다. esbuild 없이 되게 의존성을 두지 않았다. */
function loadGate(source) {
  const js = source
    .replace(/^export\s+/gm, '')
    .replace(/:\s*(any|number|string|boolean)\b/g, '');
  const f = new Function(js + '\nreturn { AZURE_TTS_MAX_PER_IP_DAY, azureTtsAllowed, azureTtsCapKey };');
  return f();
}

let G = null, loadErr = '';
try { G = loadGate(TS); } catch (e) { loadErr = String(e && e.message); }

console.log('\n① 판정을 실제로 돌린다 — 경계값과 fail-open');
ok(!!G && typeof G.azureTtsAllowed === 'function', '전제: 정본을 오려 내 실행했다' + (loadErr ? ' — ' + loadErr : ''));
if (G) {
  const CAP = G.AZURE_TTS_MAX_PER_IP_DAY;   // ⛔ 하니스에 숫자를 손으로 적지 말 것
  ok(Number.isInteger(CAP) && CAP > 0, `상한을 소스에서 읽었다 (CAP=${CAP})`);
  const call = (v, c) => { try { return G.azureTtsAllowed(v, c); } catch (e) { return 'THREW:' + (e && e.message); } };

  // 경계 앞뒤 — «막는 선» 을 «넣을 수 있는 마지막 값» 으로 읽지 않게 둘 다 본다
  ok(call(0) === true, '0번 쓴 IP 는 통과한다');
  ok(call(CAP - 1) === true, `${CAP - 1}번(상한 직전)은 통과한다`);
  ok(call(CAP) === false, `${CAP}번(상한)에서 막힌다`);
  ok(call(CAP + 1) === false, `${CAP + 1}번(상한 초과)은 막힌다`);
  ok(call(999999) === false, '아주 많이 부른 IP 는 막힌다');

  // 짝 — «전부 막기» 가 아닌지. 이 짝이 없으면 return false 로 고정한 변이도 통과한다.
  ok(call(1) === true && call(Math.floor(CAP / 2)) === true, '짝: 평범한 사용은 안 막힌다');

  // fail-open — 못 세면 막지 않는다
  for (const bad of [null, undefined, NaN, -1, 'x', '', {}, [], Infinity]) {
    ok(call(bad) === true, `못 세면 막지 않는다 (${JSON.stringify(bad) ?? String(bad)})`);
  }
  // 문자열 숫자는 제대로 센다(KV 는 문자열을 돌려준다)
  ok(call(String(CAP)) === false, 'KV 가 돌려주는 문자열 숫자도 센다');
  ok(call(String(CAP - 1)) === true, '짝: 문자열이어도 상한 직전은 통과한다');
  // cap 인자를 넘기면 그 값을 쓴다(하니스가 경계를 직접 만들 수 있어야 한다)
  ok(call(5, 5) === false && call(4, 5) === true, '넘긴 상한 값을 실제로 쓴다');
}

console.log('\n② 카운터 키 — 누구를, 어느 하루로 세는가');
if (G) {
  const K = (ip, t) => { try { return G.azureTtsCapKey(ip, t); } catch (e) { return 'THREW'; } };
  const t = Date.UTC(2026, 8, 15, 3, 0, 0);
  ok(K('1.2.3.4', t) !== K('5.6.7.8', t), 'IP 가 다르면 칸이 갈린다(전역 카운터가 아니다)');
  ok(K('', t) === K(null, t) && /unknown/.test(K('', t)), 'IP 를 모르면 unknown 칸으로 모은다');
  // KST 자정에 갈린다
  const kstBefore = Date.UTC(2026, 8, 14, 14, 59, 0);   // KST 9/14 23:59
  const kstAfter  = Date.UTC(2026, 8, 14, 15, 0, 0);    // KST 9/15 00:00
  ok(K('1.2.3.4', kstBefore) !== K('1.2.3.4', kstAfter), 'KST 자정에 하루가 새로 시작한다');
  // 짝 — UTC 자정에는 «안» 갈려야 KST 보정이 실제로 일하는 것이다
  const utcBefore = Date.UTC(2026, 8, 14, 23, 59, 0);   // KST 9/15 08:59
  const utcAfter  = Date.UTC(2026, 8, 15, 0, 0, 0);     // KST 9/15 09:00
  ok(K('1.2.3.4', utcBefore) === K('1.2.3.4', utcAfter), '짝: UTC 자정에는 안 갈린다(=KST 보정이 실제로 돈다)');
  ok(typeof K('1.2.3.4', NaN) === 'string' && K('1.2.3.4', NaN).length > 0, '시각을 몰라도 칸은 만들어진다(세기는 한다)');
}

console.log('\n③ 라우트가 그 판정을 «부르고 그 결과를 쓴다»');
const routeRaw = bodyAt(GAMES, "path === '/api/voice/tts'");
const route = strip(routeRaw);
ok(routeRaw.length > 500, `전제: /api/voice/tts 라우트를 잘라 냈다 (len=${routeRaw.length})`);
ok(/from '\.\/voice-tts-cap'/.test(strip(GAMES)), '판정 정본을 import 한다');
ok(/azureTtsAllowed\s*\(/.test(route), '라우트가 판정 함수를 부른다');
ok(/azureTtsCapKey\s*\(/.test(route), '라우트가 키 함수를 부른다');
/* 🔴 «부르는가» 만 물으면 안 된다 — 부르기만 하고 결과를 안 쓰면 아무것도 안 막는다.
   그 결과가 실제로 Azure 호출을 가르는 조건인지 본다. */
ok(/if\s*\(\s*!\s*azureTtsAllowed\s*\(/.test(route), '그 답을 조건으로 쓴다(!allowed 면 막는다)');
ok(/if\s*\(\s*azVoice\s*&&\s*!\s*azFail\s*\)/.test(route), 'Azure 호출이 그 게이트를 통과했을 때만 일어난다');
/* 상한을 라우트가 «스스로 정하지» 않는가 — 정하면 정본을 고쳐도 한쪽만 바뀐다.
   ⛔ 「그 숫자가 라우트에 있나」로 묻지 말 것 — 무관한 숫자에 걸린다(실제로 밟았다:
      구글 응답 크기 검사 `gb.byteLength < 300` 이 상한값 300 과 우연히 같아 거짓 FAIL).
      물어야 할 것은 «상한을 어디서 가져오는가» 다. */
ok(!/azureTtsAllowed\s*\([^)]*,\s*\d/.test(route), '라우트가 상한 숫자를 손으로 넘기지 않는다(정본 기본값을 쓴다)');
ok(!/AZURE_TTS_MAX_PER_IP_DAY\s*=/.test(route), '라우트가 상한 상수를 다시 선언하지 않는다');
ok(/SESSION_STATE/.test(route), '카운터를 KV(SESSION_STATE)에 센다');
ok(/expirationTtl/.test(route), '카운터에 만료를 둔다(영원히 쌓이지 않는다)');

console.log('\n④ 어디서 세는가 — 위치가 곧 뜻이다');
const azBlockRaw = bodyAt(routeRaw, 'if (azVoice) {');
ok(azBlockRaw.length > 100, `전제: azVoice 블록을 잘라 냈다 (len=${azBlockRaw.length})`);
ok(/azureTtsAllowed/.test(strip(azBlockRaw)), '세는 자리가 «성우를 콕 집었을 때» 안에 있다(영어·메이는 안 센다)');
/* 캐시 적중은 Azure 를 안 부르므로 세면 안 된다 — 게이트가 그 return «뒤» 인지 위치로 본다 */
const iCacheHit = route.indexOf("'X-TTS-Engine': hitEng");
const iGate = route.indexOf('azureTtsAllowed');
ok(iCacheHit >= 0, '전제: 캐시 적중 응답을 찾았다');
ok(iCacheHit >= 0 && iGate > iCacheHit, '게이트가 «캐시 적중» 뒤에 있다(이미 만든 소리는 안 센다)');
const iAzCall = route.indexOf('azureTts(env');
ok(iAzCall >= 0 && iGate < iAzCall, '게이트가 «Azure 호출» 앞에 있다');

console.log('\n④-2 진짜로 «세는가» — 카운터 블록을 가짜 KV 로 돌린다');
/* 🔴 「SESSION_STATE 가 있는가」로 물으면 안 된다 — get 만 남아도 그 글자는 있다.
   카운터를 «안 세는» 변이(put 한 줄 삭제)는 상한을 영영 못 걸리게 만드는데,
   문자열 검사는 그대로 통과한다(2026-09-15 실측: 변이 Ⓘ 가 58/0 으로 통과).
   CLAUDE.md 「«세는 쪽» 과 «막는 쪽» 은 짝입니다」 — 그래서 실제로 돌려 본다. */
function runCap(stored, opts) {
  const o = opts || {};
  const js = azBlockRaw
    .replace(/\(env as any\)/g, 'env')
    .replace(/:\s*any\b/g, '')
    .replace(/\s+as\s+any\b/g, '');
  const puts = [];
  const kv = {
    get: async () => { if (o.getThrows) throw new Error('kv down'); return stored; },
    put: async (k, v, meta) => { if (o.putThrows) throw new Error('kv down'); puts.push({ k, v, meta }); },
  };
  let mk;
  try {
    mk = new Function('azVoice', 'request', 'env', 'azureTtsCapKey', 'azureTtsAllowed', 'console',
      'return (async function(){ let azFail = ""; ' + js + ' return azFail; })();');
  } catch (e) { return { err: 'BUILD:' + (e && e.message), puts }; }
  const req = { headers: { get: () => '1.2.3.4' } };
  try {
    return { p: mk(true, req, { SESSION_STATE: kv }, G.azureTtsCapKey, G.azureTtsAllowed, { warn() {} }), puts };
  } catch (e) { return { err: 'CALL:' + (e && e.message), puts }; }
}
if (G && azBlockRaw.length > 100) {
  const CAP = G.AZURE_TTS_MAX_PER_IP_DAY;
  const r1 = await (async () => { const r = runCap('5'); return { ...r, azFail: r.p ? await r.p : r.err }; })();
  ok(r1.azFail === '', '전제: 상한 아래에서는 막지 않는다 (' + r1.azFail + ')');
  ok(r1.puts.length === 1, `상한 아래에서 카운터를 실제로 쓴다 (${r1.puts.length}회)`);
  ok(r1.puts.length === 1 && r1.puts[0].v === '6', `기존값에서 하나 올린다 (${r1.puts[0] && r1.puts[0].v}) — 하드코딩이 아니다`);
  ok(r1.puts.length === 1 && /1\.2\.3\.4/.test(String(r1.puts[0].k)), '그 IP 칸에 쓴다');
  ok(r1.puts.length === 1 && Number(r1.puts[0].meta && r1.puts[0].meta.expirationTtl) > 0, '만료를 함께 준다');

  const r2 = await (async () => { const r = runCap(String(CAP)); return { ...r, azFail: r.p ? await r.p : r.err }; })();
  ok(r2.azFail === 'ip_cap', `상한에 닿으면 막는다 (azFail=${r2.azFail})`);
  ok(r2.puts.length === 0, '짝: 막힌 요청은 카운터를 더 올리지 않는다');

  const r3 = await (async () => { const r = runCap(null, { getThrows: true }); return { ...r, azFail: r.p ? await r.p : r.err }; })();
  ok(r3.azFail === '', 'KV 를 못 읽으면 막지 않는다(fail-open)');
  const r4 = await (async () => { const r = runCap('1', { putThrows: true }); return { ...r, azFail: r.p ? await r.p : r.err }; })();
  ok(r4.azFail === '', 'KV 쓰기가 죽어도 요청은 그대로 흐른다');
} else {
  ok(false, '전제: 카운터 블록을 돌릴 수 없었다');
}

console.log('\n⑤ 막혀도 소리는 난다 — 429 로 끊지 않는다');
const capBlock = strip(bodyAt(azBlockRaw, 'if (!azureTtsAllowed'));
ok(capBlock.length > 10, `전제: 막는 분기를 잘라 냈다 (len=${capBlock.length})`);
ok(!/return\s/.test(capBlock), '막을 때 그 자리에서 return 하지 않는다(폴백으로 내려간다)');
ok(!/429/.test(capBlock), '막을 때 429 로 끊지 않는다');
ok(/azFail\s*=/.test(capBlock), '막힌 사유를 azFail 에 적는다');
ok(/X-TTS-Fallback/.test(route), '짝: 그 사유가 화면에 전달된다(X-TTS-Fallback)');
ok(/gtts\s*\(/.test(route), '짝: 예전 경로(구글 만다린)가 그대로 살아 있다');

console.log('\n⑥ 변이 자가시험 — 이 검사가 실제로 잡는가');
const mutants = [
  ['Ⓐ 상한 무력화 (return true)', (s) => s.replace('return n < cap;', 'return true;')],
  ['Ⓑ 상한 1000배', (s) => s.replace('return n < cap;', 'return n < cap * 1000;')],
  ['Ⓒ 전부 막기(반대 방향)', (s) => s.replace('return n < cap;', 'return n < cap && false;')],
  ['Ⓓ fail-open 지우기', (s) => s.replace('if (!isFinite(n) || n < 0) return true;', '')],
  ['Ⓔ 키에서 IP 무시(전역 카운터)', (s) => s.replace("const who = String(ip || '').trim() || 'unknown';", "const who = 'all';")],
  ['Ⓕ KST 보정 지우기', (s) => s.replace('Math.floor((t + 9 * 3600000) / 86400000)', 'Math.floor(t / 86400000)')],
];
for (const [name, mut] of mutants) {
  const src = mut(TS);
  ok(src !== TS, `전제: ${name} — 치환이 실제로 일어났다`);
  let M = null;
  try { M = loadGate(src); } catch { M = null; }
  let caught = false;
  if (!M) caught = true;                       // 변이가 깨지면 그것도 «잡힘»
  else {
    const CAP = M.AZURE_TTS_MAX_PER_IP_DAY;
    const a = (v, c) => { try { return M.azureTtsAllowed(v, c); } catch { return 'THREW'; } };
    const k = (ip, t) => { try { return M.azureTtsCapKey(ip, t); } catch { return 'THREW'; } };
    // ①절이 보는 것들
    if (a(CAP) !== false || a(CAP + 1) !== false) caught = true;          // 상한이 안 먹음
    if (a(0) !== true || a(1) !== true) caught = true;                    // 전부 막음
    if (a(null) !== true || a('x') !== true) caught = true;               // fail-open 깨짐
    // ②절이 보는 것들
    const t0 = Date.UTC(2026, 8, 15, 3, 0, 0);
    if (k('1.2.3.4', t0) === k('5.6.7.8', t0)) caught = true;             // IP 가 안 갈림
    if (k('1.2.3.4', Date.UTC(2026, 8, 14, 23, 59, 0))
        !== k('1.2.3.4', Date.UTC(2026, 8, 15, 0, 0, 0))) caught = true;  // KST 보정 없음
  }
  ok(caught, `${name} → 이 하니스가 잡는다`);
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
