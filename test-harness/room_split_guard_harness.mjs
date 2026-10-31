// room_split_guard_harness.mjs — «같은 방 번호인데 다른 교실» 을 감시견이 잡는가 (2026-09-01)
//
// ── 왜 ──────────────────────────────────────────────────────────────────────
// 도메인이 서로 다른 워커에 붙으면 DO 네임스페이스가 갈려, 같은 방 번호를 넣어도
// 두 사람이 서로 못 만난다. D1·KV·R2 는 공유하므로 **출석 기록만 보면 정상으로 보인다.**
// 네 번 났다 — 2026-08-19(강선생님 8회) · 08-25(class-895) · 08-27(ubckt01 7회) ·
// 09-01(class-848, 강선생님 mangoi.ai ↔ 사장님 test.mangoi.co.kr).
//
// 그때마다 규칙서에 「고쳤다」고 적혔지만 **두 번은 실제로 옮겨지지 않았고**, 완료형 문장을
// 믿고 아무도 다시 확인하지 않았다. 2026-09-01 실측으로 8/27 의 「두 도메인에서 demo-1 에
// 들어가 서로 보이는 것까지 확인했다」는 진술이 **사실이 아님**이 드러났다(그날 demo-1 접속은
// mangoi.ai 에서 1건뿐, test.mangoi.co.kr 에서 0건).
// ⟹ 문서로 막는 것은 두 번 실패했다. 그래서 «측정» 으로 옮겼고, 이 하니스가 그것을 지킨다.
//
// ── 이 하니스가 못 박는 것 ──────────────────────────────────────────────────
//   · 지문이 갈리면 «split» 이 되고 문자가 **한 번** 나간다(15분마다 스팸하지 않는다)
//   · 지문이 같으면 조용하다 ← 도메인을 합친 뒤 «멀쩡한데 문자» 가 오면 알림이 무뎌진다
//   · 기록이 하나뿐이거나 오래됐으면 «모름» 으로 침묵한다(옛 값으로 계속 문자하지 않는다)
//   · 오래돼 판단을 못 하게 된 것을 «복구됐다» 고 말하지 않는다(거짓말 방지)
//   · 모르는 Host 는 기록하지 않는다 (Host 헤더는 호출자가 마음대로 보낸다)
//   · 어떤 경우에도 **던지지 않는다** — 감시 장치가 던지면 출석 기록과 감시견이 함께 멈춘다
//
// ⚠️ 문자열 검사로는 이걸 못 본다 — 함수도 값도 전부 «있는» 채로 «어느 갈래에서 무엇이
//    나오는가» 만 틀리면 조용히 통과한다. 그래서 모듈을 **실제로 실행**한다.
//
// 실행: node test-harness/room_split_guard_harness.mjs

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRCDIR = join(__dir, '../cloudflare-deploy/src');
const read = (f) => readFileSync(join(SRCDIR, f), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? '  — ' + detail : ''}`); }
};

const GUARD = read('room-split-guard.ts');
const SITEURL = read('site-url.ts');
const MANGO = read('api-mango.ts');
const UPTIME = read('api-uptime.ts');

/* ── TS → JS ───────────────────────────────────────────────────────────────
   ⚠️ typescript 는 cloudflare-deploy/node_modules 에 있다(ci-gates.sh 가 npm ci 를 먼저 돌린다).
      없으면 이 하니스만 건너뛴다 — 같은 게이트의 tsc 가 먼저 빨간불이 되므로
      «검사가 꺼진 채 통과» 하는 상태는 만들어지지 않는다. */
let ts = null;
try {
  ts = (await import(pathToFileURL(join(__dir, '../cloudflare-deploy/node_modules/typescript/lib/typescript.js')).href)).default;
} catch (e) {
  console.log('  ⏭ typescript 를 못 찾아 건너뜀 (' + String(e.message).slice(0, 80) + ')');
  process.exit(0);
}
const toJs = (src) => ts.transpileModule(src, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

/* import 두 줄만 걷어 내고 그 자리에 진짜 SITE_HOSTS 와 가짜 sendPlainSms 를 넣는다.
   ⛔ SITE_HOSTS 를 손으로 베껴 적지 않는다 — 그러면 정본에서 도메인이 빠져도 이 검사가
      그것을 못 본다. site-url.ts 를 실제로 돌려 값을 가져온다. */
/* `export` 를 떼어 내 «그냥 최상위 선언» 으로 만든다 — vm 문맥에는 모듈 시스템이 없다.
   ⚠️ 함수 본문은 한 글자도 건드리지 않는다(검사 대상이 진짜 코드여야 한다). */
const stripExports = (src) => src.replace(/^export (?=(?:const|let|function|async function|type|class)\b)/gm, '');
const guardNoImports = stripExports(GUARD.replace(/^import .*?;$/gm, ''));
const siteJs = toJs(stripExports(SITEURL)) + '\nglobalThis.__SITE_HOSTS = SITE_HOSTS;\n';
const guardJs = toJs(guardNoImports) +
  '\nglobalThis.__fp = roomNamespaceFingerprint;' +
  '\nglobalThis.__record = recordHostRoomNamespace;' +
  '\nglobalThis.__check = checkRoomSplit;' +
  '\nglobalThis.__FRESH = NS_FRESH_MS;' +
  '\nglobalThis.__PROBE = NS_PROBE_NAME;\n';

/** 모듈을 새 문맥에 올리고, 그때그때의 가짜 sendPlainSms 를 갈아 끼울 수 있게 한다. */
function load() {
  const sms = [];
  const ctx = {
    JSON, Object, Array, Math, String, Number, Date, Set, Boolean, Error, RegExp, Promise,
    console: { log() {}, warn() {}, error() {} },
    sendPlainSms: async (_env, phone, text) => { sms.push({ phone, text }); return { ok: true }; },
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(siteJs, ctx);
  ctx.SITE_HOSTS = ctx.__SITE_HOSTS;
  vm.runInContext(guardJs, ctx);
  return { ctx, sms, SITE_HOSTS: ctx.__SITE_HOSTS };
}

/** 진짜처럼 «쓴 값이 다음 읽기에 보이는» KV. */
function makeKV(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    store,
    async get(k) { const v = store.get(k); return v === undefined ? null : v; },
    async put(k, v) { store.set(k, String(v)); },
    async delete(k) { store.delete(k); },
  };
}
/** 방 세계(DO 네임스페이스) 하나 — 같은 ns 이름이면 같은 지문, 다르면 다른 지문. */
const fakeDO = (nsSeed) => ({ idFromName: (n) => (nsSeed + ':' + n).padEnd(32, '0').replace(/[^0-9a-f]/g, 'a').slice(0, 32) });
const envOf = (kv, nsSeed) => ({ SESSION_STATE: kv, VIDEO_CALL_ROOM: fakeDO(nsSeed), OWNER_ALERT_PHONE: '01000000000' });

const NOW = Date.now();
const rec = (ns, ageMs = 0) => JSON.stringify({ ns, at: NOW - ageMs });
const HEX = (c) => c.repeat(32);

// ── ① 지문 ────────────────────────────────────────────────────────────────
console.log('\n[ ① DO 네임스페이스 지문 — 방이 갈리는 원인 그 자체를 잰다 ]');
{
  const { ctx } = load();
  ok('네임스페이스가 다르면 지문도 다르다 (이것이 방이 갈리는 이유)',
    ctx.__fp(envOf(makeKV(), 'aaaa')) !== ctx.__fp(envOf(makeKV(), 'bbbb')));
  ok('같은 네임스페이스면 지문도 같다',
    ctx.__fp(envOf(makeKV(), 'aaaa')) === ctx.__fp(envOf(makeKV(), 'aaaa')));
  let asked = null;
  ctx.__fp({ VIDEO_CALL_ROOM: { idFromName: (n) => { asked = n; return HEX('a'); } } });
  ok('고정된 이름 하나로만 물어본다 (진짜 방을 만들지 않는다)', asked === ctx.__PROBE, String(asked));
  ok('DO 바인딩이 없으면 «모름»(null) — 확신 없으면 알리지 않는다', ctx.__fp({}) === null);
  ok('모양이 다른 값이 오면 «모름»(null)', ctx.__fp({ VIDEO_CALL_ROOM: { idFromName: () => 'nope' } }) === null);
}

// ── ② 기록 ────────────────────────────────────────────────────────────────
console.log('\n[ ② 도메인–워커 배치 기록 (출석 checkin 옆에서 돈다) ]');
{
  const { ctx, SITE_HOSTS } = load();
  ok('SITE_HOSTS 에 test.mangoi.co.kr 이 아직 있다 (빠지면 그 도메인을 감시하지 못한다)',
    SITE_HOSTS.includes('test.mangoi.co.kr'), SITE_HOSTS.join(','));
  ok('SITE_HOSTS 에 mangoi.ai 가 있다', SITE_HOSTS.includes('mangoi.ai'));

  const kv = makeKV(); const env = envOf(kv, 'aaaa');
  await ctx.__record(env, 'mangoi.ai');
  ok('아는 도메인은 기록된다', !!kv.store.get('roomns:mangoi.ai'));
  await ctx.__record(env, 'evil.example.com');
  ok('🔐 모르는 Host 는 기록하지 않는다 (Host 헤더는 호출자가 마음대로 보낸다)',
    !kv.store.get('roomns:evil.example.com'), [...kv.store.keys()].join(','));
  await ctx.__record(env, 'MANGOI.AI:443');
  ok('대소문자·포트가 붙어도 같은 칸에 들어간다', kv.store.size === 1, [...kv.store.keys()].join(','));

  const before = kv.store.get('roomns:mangoi.ai');
  await new Promise((r) => setTimeout(r, 5));
  await ctx.__record(env, 'mangoi.ai');
  ok('값이 그대로면 다시 쓰지 않는다 (입장마다 KV 쓰기가 생기지 않게)',
    kv.store.get('roomns:mangoi.ai') === before);

  await ctx.__record(envOf(kv, 'bbbb'), 'mangoi.ai');
  ok('워커가 바뀌면 곧바로 새 값으로 갱신된다',
    kv.store.get('roomns:mangoi.ai') !== before);
}

// ── ③ 판정 + 문자 ─────────────────────────────────────────────────────────
console.log('\n[ ③ 감시견 판정과 문자 ]');
{
  // 정상 — 도메인을 합친 뒤의 상태
  const { ctx, sms } = load();
  const kv = makeKV({ 'roomns:mangoi.ai': rec(HEX('a')), 'roomns:test.mangoi.co.kr': rec(HEX('a')) });
  const r = await ctx.__check(envOf(kv, 'aaaa'));
  ok('지문이 같으면 «ok»', r.state === 'ok', JSON.stringify(r));
  ok('정상일 때는 문자가 안 간다 ← 멀쩡한데 문자가 오면 알림이 무뎌진다', sms.length === 0);
}
{
  // 🔴 2026-09-01 실사고 형태
  const { ctx, sms } = load();
  const kv = makeKV({ 'roomns:mangoi.ai': rec(HEX('a')), 'roomns:test.mangoi.co.kr': rec(HEX('b')) });
  const r = await ctx.__check(envOf(kv, 'aaaa'));
  ok('🔴 지문이 갈리면 «split» (2026-09-01 class-848 형태)', r.state === 'split', JSON.stringify(r));
  ok('문자가 한 번 나간다', sms.length === 1 && r.smsSent === true);
  ok('문자에 «갈린 두 도메인» 이 모두 들어간다 (어디를 옮겨야 하는지 바로 알 수 있게)',
    sms.length === 1 && sms[0].text.includes('mangoi.ai') && sms[0].text.includes('test.mangoi.co.kr'),
    sms[0]?.text);
  ok('문자에 옮길 워커 이름이 적혀 있다',
    sms.length === 1 && sms[0].text.includes('webrtc-unified-platform-prod'));

  const r2 = await ctx.__check(envOf(kv, 'aaaa'));
  ok('같은 상태가 이어지면 두 번째 15분에는 문자가 안 간다 (스팸 방지)',
    sms.length === 1 && r2.state === 'split');

  // 고친 뒤 — 복구 문자
  await kv.put('roomns:test.mangoi.co.kr', rec(HEX('a')));
  const r3 = await ctx.__check(envOf(kv, 'aaaa'));
  ok('도메인을 합치면 «ok» 로 돌아오고 복구 문자가 1회 간다',
    r3.state === 'ok' && sms.length === 2 && sms[1].text.includes('합쳐졌'), JSON.stringify(sms));
}
{
  const { ctx, sms } = load();
  const kv = makeKV({ 'roomns:mangoi.ai': rec(HEX('a')) });
  const r = await ctx.__check(envOf(kv, 'aaaa'));
  ok('기록이 하나뿐이면 «모름» — 침묵한다 (그 도메인으로 아직 아무도 안 들어온 것뿐)',
    r.state === 'unknown' && sms.length === 0, JSON.stringify(r));
}
{
  const { ctx, sms } = load();
  // 한쪽이 오래된 기록 — 그 값으로 계속 문자하면 안 된다
  const kv = makeKV({
    'roomns:mangoi.ai': rec(HEX('a')),
    'roomns:test.mangoi.co.kr': rec(HEX('b'), 20 * 24 * 60 * 60 * 1000),
  });
  const r = await ctx.__check(envOf(kv, 'aaaa'));
  ok('14일 넘은 기록은 무시한다 → «모름», 문자 0건 (옛 값으로 계속 알리지 않는다)',
    r.state === 'unknown' && sms.length === 0, JSON.stringify(r));
}
{
  const { ctx, sms } = load();
  // split 을 알린 뒤 기록이 오래돼 판단을 못 하게 된 경우
  const kv = makeKV({
    'roomns:mangoi.ai': rec(HEX('a'), 20 * 24 * 60 * 60 * 1000),
    'roomns:test.mangoi.co.kr': rec(HEX('b'), 20 * 24 * 60 * 60 * 1000),
    'roomns:alerted': '1',
  });
  const r = await ctx.__check(envOf(kv, 'aaaa'));
  ok('오래돼 «모름» 이 된 것을 «복구됐다» 고 말하지 않는다 (거짓말 방지)',
    r.state === 'unknown' && sms.length === 0, JSON.stringify(sms));
  ok('다만 표시는 지워, 나중에 진짜로 갈리면 다시 알릴 수 있다',
    !kv.store.get('roomns:alerted'));
}
{
  const { ctx, sms } = load();
  const kv = makeKV({ 'roomns:mangoi.ai': rec(HEX('a')), 'roomns:test.mangoi.co.kr': rec(HEX('b')) });
  const env = envOf(kv, 'aaaa'); env.OWNER_ALERT_PHONE = '';
  const r = await ctx.__check(env);
  ok('전화번호가 없어도 판정은 하고 죽지 않는다', r.state === 'split' && sms.length === 0);
}

// ── ④ 절대 던지지 않는다 ──────────────────────────────────────────────────
console.log('\n[ ④ 감시 장치가 감시 대상을 멈추지 않는다 ]');
{
  const { ctx } = load();
  const boom = { get() { throw new Error('kv down'); }, put() { throw new Error('kv down'); }, delete() { throw new Error('kv down'); } };
  const env = { SESSION_STATE: boom, VIDEO_CALL_ROOM: fakeDO('aaaa'), OWNER_ALERT_PHONE: '01000000000' };
  let threw = null;
  try { await ctx.__record(env, 'mangoi.ai'); } catch (e) { threw = e; }
  ok('KV 가 전부 던져도 recordHostRoomNamespace 는 안 던진다 (출석 기록이 멈추면 안 된다)', !threw, String(threw));
  threw = null;
  try { await ctx.__check(env); } catch (e) { threw = e; }
  ok('KV 가 전부 던져도 checkRoomSplit 은 안 던진다 (감시견이 멈추면 안 된다)', !threw, String(threw));
  threw = null;
  try { await ctx.__record({}, null); await ctx.__check({}); } catch (e) { threw = e; }
  ok('env 가 비어 있어도 안 던진다', !threw, String(threw));
}

// ── ⑤ 배선 ────────────────────────────────────────────────────────────────
console.log('\n[ ⑤ 실제로 그 자리에 연결돼 있는가 ]');
{
  ok('출석 checkin(/api/attendance/join)이 배치를 기록한다',
    /attendance\/join[\s\S]{0,900}?recordHostRoomNamespace\s*\(/.test(MANGO));
  /* ⛔ `\([^)]*\)` 로 인자를 잡지 않는다 — 인자 안에 `request.headers.get('Host')` 처럼
        괄호가 중첩되면 첫 `)` 에서 끊겨 **멀쩡한 코드가 FAIL** 한다(첫 판에서 실제로 밟았다).
        여기서 물어야 할 것은 «인자 모양» 이 아니라 «try 안에 있는가» 뿐이다. */
  ok('그 호출이 try/catch 로 감싸여 있다 (던지면 출석이 막힌다)',
    /try\s*\{\s*await recordHostRoomNamespace[\s\S]{0,160}?\}\s*catch/.test(MANGO));
  ok('감시견(runSiteWatchdog)이 checkRoomSplit 을 부른다',
    /runSiteWatchdog[\s\S]*?checkRoomSplit\s*\(env\)/.test(UPTIME));
  ok('그 호출이 .catch 로 감싸여 있다 (던지면 감시견 전체가 멈춘다)',
    /checkRoomSplit\(env\)\s*\.catch\(/.test(UPTIME));
}

console.log(`\n[room_split_guard] PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
