// turn_detail_harness.mjs — `X-Turn-Detail` 이 «왜 그 경로였나» 를 정확히 말하는지 (2026-08-26)
//
// ── 왜 ──────────────────────────────────────────────────────────────────────
// `X-Turn-Source: public-fallback` 하나가 **서로 완전히 다른 세 가지**를 뭉뚱그렸다 —
//   ① 시크릿이 없다  ② CF API 가 거절했다(403·429·한도초과)  ③ 연결조차 안 됐다
// 해야 할 일이 각각 «키 등록»·«계정 확인»·«장애 대기» 로 다른데 나오는 글자는 똑같다.
//
// 2026-08-26 에 그것 때문에 반나절을 잘못 짚었다. 「시크릿이 없다」고 단정하고 사장님께
// 키 발급을 안내했는데, 대시보드 실측 결과 **워커 두 벌 모두 등록돼 있었다.**
// 진짜 원인은 「시크릿은 있는데 24시간 넘게 발급이 한 번도 성공하지 못했다」였다.
// 사장님이 안 넣으셨기에 망정이지, 넣으셨다면 이미 있는 키를 덮어쓰고 «고쳤다» 는
// 기록만 남을 뻔했다.
//
// ── 이 하니스가 못 박는 것 ──────────────────────────────────────────────────
//   · 네 갈래(캐시·성공·LKG·무료폴백)마다 detail 이 «서로 다른» 값으로 나온다
//   · 특히 `no-secrets` 와 `cf-http-4xx` 가 **절대 같은 값이 되지 않는다** ← 사고의 핵심
//   · CF 응답 «본문» 이 헤더로 새지 않는다 (이 API 는 로그인 없이 누구나 부른다)
//   · detail 을 넣느라 기존 동작(어느 경로로 가는가·KV 저장)이 바뀌지 않았다
//
// ⚠️ 문자열 검사로는 «어느 갈래에서 어떤 값이 되는가» 를 볼 수 없다 — 값도 조건도 전부
//    «있는» 채로 순서만 틀리면 조용히 통과한다(CLAUDE.md 2장의 반복 실측).
//    그래서 이 하니스는 `handleTurnConfig` 를 **소스에서 오려 내 실제로 실행**한다.
//
// 실행: node test-harness/turn_detail_harness.mjs

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(__dir, '../cloudflare-deploy/src/index.ts'), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? '  — ' + detail : ''}`); }
};

/* ── 소스에서 그 함수만 오려 낸다 ──────────────────────────────────────────
   ⚠️ 「그 줄이 있는가」가 아니라 「돌려 보면 어떤 값이 나오는가」를 보기 위해서다.
      잘라 내기에 실패하면 **통과시키지 않는다** — 검사가 꺼진 채로 초록불이 되면
      아무것도 지키지 못한다. */
const START = SRC.indexOf("const TURN_CACHE_KEY = 'turn:ice-servers:v1'");
const FN = SRC.indexOf('async function handleTurnConfig');
const END = SRC.indexOf('\n// ArrayBuffer → base64', FN);
if (START < 0 || FN < 0 || END < 0) {
  console.log('🚨 handleTurnConfig 를 소스에서 잘라 내지 못했습니다 — 검사를 통과시키지 않습니다.');
  console.log('   (함수 이름이나 그 뒤 주석이 바뀌었다면 위 표식을 함께 고치세요)');
  process.exit(1);
}
const tsSrc = SRC.slice(START, END) + '\nglobalThis.__handleTurnConfig = handleTurnConfig;\n';

/* ⚠️ typescript 는 cloudflare-deploy/node_modules 에 있다(ci-gates.sh 전제: npm ci 가 먼저 돈다).
   없으면 이 하니스만 건너뛴다 — 하니스 전체가 죽는 것이 더 나쁘다.
   ⛔ 다만 «조용히» 넘어가지는 않는다. CI 에서는 같은 게이트의 tsc 가 먼저 돌므로
      node_modules 가 없으면 그쪽이 먼저 빨간불이 된다 = 검사가 꺼진 채 통과할 수 없다. */
let jsSrc = null, tsWhy = '';
try {
  const ts = (await import(pathToFileURL(join(__dir, '../cloudflare-deploy/node_modules/typescript/lib/typescript.js')).href)).default;
  jsSrc = ts.transpileModule(tsSrc, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
} catch (e) { tsWhy = e.message; }

if (!jsSrc) {
  console.log('  ⏭ typescript 를 못 찾아 건너뜀 (' + tsWhy.slice(0, 80) + ')');
  process.exit(0);
}

/* ── 가짜 환경 ─────────────────────────────────────────────────────────────
   KV 는 진짜처럼 «쓴 값이 다음 읽기에 보이게» 만든다(캐시 저장 검사를 위해). */
function makeKV(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    store,
    async get(k) { const v = store.get(k); return v === undefined ? null : v; },
    async put(k, v) { store.set(k, JSON.parse(v)); },
  };
}

async function run({ kv = makeKV(), secrets = false, cf = null } = {}) {
  const ctx = {
    console: { error() {}, warn() {}, log() {} },
    JSON, Object, Array, Math, String, Number,
    Response: class {
      constructor(body, init) { this.body = body; this.status = init.status; this._h = init.headers; }
      get headers() { return { get: (n) => this._h[Object.keys(this._h).find((k) => k.toLowerCase() === n.toLowerCase())] }; }
    },
    fetch: async () => {
      if (cf === 'throw') throw new Error('network down');
      if (cf && cf.status && cf.status !== 200) {
        return { ok: false, status: cf.status, async text() { return cf.body ?? 'CF-SECRET-BODY'; } };
      }
      return { ok: true, status: 200, async json() { return { iceServers: [{ urls: 'turn:cf.example:3478' }] }; } };
    },
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(jsSrc, ctx);
  const env = { SESSION_STATE: kv };
  if (secrets) { env.TURN_KEY_ID = 'kid'; env.TURN_KEY_API_TOKEN = 'tok'; }
  const res = await ctx.__handleTurnConfig(env);
  return { src: res.headers.get('X-Turn-Source'), det: res.headers.get('X-Turn-Detail'), kv, body: res.body };
}

const CACHED = { iceServers: [{ urls: 'turn:cached.example:3478' }] };

console.log('\n[ 1부. ▶ 네 갈래를 실제로 돌려 본다 ]');

const r1 = await run({ kv: makeKV({ 'turn:ice-servers:v1': CACHED }) });
ok('① 캐시 히트 → source=kv-cache · detail=cache', r1.src === 'kv-cache' && r1.det === 'cache', JSON.stringify(r1.det));

const r2 = await run({ secrets: true });
ok('② CF 성공 → source=cloudflare · detail=ok', r2.src === 'cloudflare' && r2.det === 'ok', JSON.stringify(r2.det));
ok('② 성공하면 캐시와 마지막성공분을 «둘 다» 저장한다 (기존 동작 유지)',
   r2.kv.store.has('turn:ice-servers:v1') && r2.kv.store.has('turn:ice-servers:last-good'));

const r3 = await run({ secrets: false, kv: makeKV({ 'turn:ice-servers:last-good': CACHED }) });
ok('③ 시크릿 없음 + 마지막성공분 있음 → source=last-known-good · detail=no-secrets',
   r3.src === 'last-known-good' && r3.det === 'no-secrets', `${r3.src}/${r3.det}`);

const r4 = await run({ secrets: false });
ok('④ 시크릿 없음 + 아무것도 없음 → source=public-fallback · detail=no-secrets',
   r4.src === 'public-fallback' && r4.det === 'no-secrets', `${r4.src}/${r4.det}`);

console.log('\n[ 2부. 🔴 사고의 핵심 — «없다» 와 «거절당했다» 가 갈리는가 ]');

const r5 = await run({ secrets: true, cf: { status: 403 } });
ok('⑤ 키는 있는데 CF 가 403 → detail=cf-http-403', r5.det === 'cf-http-403', `${r5.src}/${r5.det}`);

const r6 = await run({ secrets: true, cf: { status: 429 } });
ok('⑥ 사용량 한도(429) 도 그대로 보인다 → detail=cf-http-429', r6.det === 'cf-http-429', r6.det);

const r7 = await run({ secrets: true, cf: 'throw' });
ok('⑦ 연결 자체가 실패 → detail=cf-fetch-error', r7.det === 'cf-fetch-error', r7.det);

/* 🔴 이 한 줄이 이 하니스의 존재 이유다. 이 넷이 같은 값이 되는 순간
   2026-08-26 의 오진이 그대로 되돌아온다. */
const four = [r4.det, r5.det, r6.det, r7.det];
ok('🔴 «키 없음»·«403»·«429»·«연결실패» 가 서로 다른 값이다 (이게 갈리지 않아 오진했다)',
   new Set(four).size === 4, four.join(' / '));

ok('🔴 넷 다 source 는 public-fallback 이다 — 그래서 source 만으로는 절대 구분이 안 된다',
   [r4, r5, r6, r7].every((r) => r.src === 'public-fallback'),
   [r4, r5, r6, r7].map((r) => r.src).join(' / '));

console.log('\n[ 3부. 🔒 새는 것이 없는가 ]');

/* 이 API 는 `Access-Control-Allow-Origin: *` 라 로그인 없이 누구나 부른다.
   CF 응답 본문에는 계정·키 관련 문구가 들어올 수 있으므로 상태 «코드» 까지만 싣는다. */
const r8 = await run({ secrets: true, cf: { status: 403, body: 'CF-SECRET-BODY-DO-NOT-LEAK' } });
ok('⑧ CF 응답 «본문» 이 헤더로 새지 않는다', !String(r8.det).includes('SECRET') && !String(r8.det).includes('DO-NOT-LEAK'), r8.det);
ok('⑧ 응답 본문(iceServers)에도 안 샌다', !String(r8.body).includes('DO-NOT-LEAK'));
ok('⑧ detail 은 짧은 기계용 토큰이다 (공백·따옴표 없음, 40자 이하)',
   four.every((d) => /^[a-z0-9-]{1,40}$/.test(d)), four.join(' / '));

console.log('\n[ 4부. 기존 동작이 바뀌지 않았는가 ]');

ok('⑨ 무료 폴백은 openrelay 세 줄을 그대로 준다', String(r4.body).includes('openrelay.metered.ca'));
ok('⑨ 마지막성공분이 있으면 무료 폴백으로 «떨어지지 않는다»', r3.src === 'last-known-good');
ok('⑨ 어떤 갈래든 응답은 200 이다 (진단 헤더가 수업을 막지 않는다)',
   [r1, r2, r3, r4, r5, r7].every((r) => r.body && String(r.body).includes('iceServers')));
ok('⑨ detail 이 초기값 unknown 으로 새어 나가는 갈래가 없다',
   ![r1, r2, r3, r4, r5, r6, r7].some((r) => r.det === 'unknown'),
   [r1, r2, r3, r4, r5, r6, r7].map((r) => r.det).join(' / '));

console.log('\n[ 5부. 읽는 쪽 — 알려 주는 사람이 «무엇을 하라» 까지 말하는가 ]');

/* detail 을 «싣기만» 하고 읽는 쪽이 예전 문구 그대로면 아무것도 나아지지 않는다.
   2026-08-26 의 오진은 「키를 넣으시라」는 안내였다 — 키는 이미 있었다. */
const deployYml = readFileSync(join(__dir, '../.github/workflows/deploy.yml'), 'utf8');
const watchdog = readFileSync(join(__dir, '../ops/mangoi-watchdog.sh'), 'utf8');

ok('⑩ deploy.yml 이 X-Turn-Detail 을 읽는다', /[Xx]-[Tt][Uu][Rr][Nn]-[Dd][Ee][Tt][Aa][Ii][Ll]/.test(deployYml));
ok('⑩ 감시견도 X-Turn-Detail 을 읽는다', /[Xx]-[Tt][Uu][Rr][Nn]-[Dd][Ee][Tt][Aa][Ii][Ll]/.test(watchdog));

/* 🔴 여기가 핵심 — 「키가 없다」와 「키가 무효다」의 «할 일» 이 갈려야 한다. */
for (const [what, text] of [['deploy.yml', deployYml], ['감시견', watchdog]]) {
  ok(`⑪ ${what} 이 no-secrets 와 cf-http-403 을 «다르게» 안내한다`,
     /no-secrets\)/.test(text) && /cf-http-403/.test(text));
  ok(`⑪ ${what} 이 429(사용량 한도)도 따로 안내한다`, /cf-http-429/.test(text));
  ok(`⑪ ${what} 이 연결 실패(cf-fetch-error)도 따로 안내한다`, /cf-fetch-error/.test(text));
  /* ⚠️ 모르는 값을 만나면 «표시만» 해야 한다 — 값은 앞으로 늘어난다. */
  ok(`⑫ ${what} 에 «모르는 값» 갈래(*)가 있다`, /\*\)/.test(text));
}

/* ⛔ 「키를 넣으라」는 안내가 no-secrets 조건 «밖» 에서 무조건 나오면 사고가 되풀이된다. */
ok('🔴 deploy.yml 이 «no-secrets 가 아니면 키를 새로 넣지 말라» 고 못 박는다',
   /no-secrets\\` 가 아니면 키를 새로 넣지 마세요/.test(deployYml));
ok('🔴 감시견 문자가 403 일 때 «없다가 아니다» 라고 짚어 준다',
   /키는 이미 등록돼 있으니/.test(watchdog));

/* 🔴 2026-08-26 에 실제로 «고치다 만» 자리다 — ::error:: 문구는 고쳤는데 바로 위
   판정 라벨에 「TURN 시크릿 미설정」이 그대로 남아 있었다(배포 로그를 읽다 발견).
   그 한 문장이 오늘 나를 잘못 이끈 바로 그 단정이다. detail 을 실어 놓고도 라벨이
   원인을 단정하면 읽는 사람은 라벨만 보고 또 키를 넣으러 간다. */
ok('🔴 배포 요약 라벨이 public-fallback 을 «시크릿 미설정» 이라고 단정하지 않는다',
   !/무료 공개 TURN 사용 중 — TURN 시크릿 미설정/.test(deployYml));

console.log(`\n  ${fail ? '❌' : '🎉'} ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
