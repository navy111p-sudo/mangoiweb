// ═══════════════════════════════════════════════════════════════════════
// 🔒 동시접속 1세션 차단 — 회귀 하니스
//
//   auth-token.ts 의 «실제 함수»를 TypeScript 원문에서 오려내 그대로 실행한다.
//   (거대 파일 속 로직을 «읽어서 판단»하면 통과했다고 착각하기 쉬워, 실제로 돌려서 확인한다.)
//
//   지키려는 것 — 이 4가지가 깨지면 실서비스 학생 29,000명이 로그아웃되거나,
//   반대로 아이디 공유가 그대로 뚫린다:
//     ① 스위치 off  → 아무 일도 없어야 한다 (배포만으로는 아무도 안 튕긴다)
//     ② 하위호환    → sid 없는 «기존 토큰»은 스위치를 켜도 통과해야 한다
//     ③ 실제 차단   → 스위치 on + 새 로그인 → 이전 기기 토큰은 죽어야 한다
//     ④ fail-open   → KV 가 없거나 기록이 없으면 통과해야 한다 (인프라 사고 ≠ 전원 로그아웃)
// ═══════════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..', 'cloudflare-deploy', 'src', 'auth-token.ts');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } };

// ── auth-token.ts 를 «실행 가능한 JS» 로 변환 ──
//   ⚠️ 정규식으로 타입을 걷어내면 `function f(s: string): Uint8Array {` 같은 형태에서 조용히 깨진다
//      (실제로 겪음). **진짜 TypeScript 컴파일러**로 트랜스파일해서 원문 그대로 실행한다.
async function loadAuthToken() {
  const src = fs.readFileSync(SRC, 'utf8');          // ⚠️ 반드시 utf8 명시 (한글 주석 깨짐 방지)
  let ts;
  try {
    const tsPath = path.join(HERE, '..', 'cloudflare-deploy', 'node_modules', 'typescript', 'lib', 'typescript.js');
    ts = (await import('file://' + tsPath.replace(/\\/g, '/'))).default;
  } catch {
    console.log('  ⏭ SKIP — cloudflare-deploy/node_modules/typescript 가 없습니다.');
    console.log('     복구: cd cloudflare-deploy && npm install   (비어 있으면 배포 tsc 게이트도 함께 죽습니다)');
    process.exit(0);
  }
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  // CommonJS 로 뽑아 exports 객체를 그대로 받는다
  const exportsObj = {};
  new Function('exports', 'require', 'module', js)(exportsObj, () => ({}), { exports: exportsObj });
  return exportsObj;
}

// ── 가짜 KV (실제 Workers KV 와 같은 최소 인터페이스) ──
function fakeKV() {
  const m = new Map();
  return {
    _m: m,
    async get(k) { return m.has(k) ? m.get(k) : null; },
    async put(k, v) { m.set(k, v); },
  };
}

console.log('═'.repeat(66));
console.log(' 🔒 동시접속 1세션 차단 하니스');
console.log('═'.repeat(66));

const A = await loadAuthToken();
const SECRET = { ROOM_JWT_SECRET: 'test-secret-single-session' };

// ── 0) 로드 자체 확인 ──
ok(typeof A.signUidToken === 'function', 'signUidToken 로드');
ok(typeof A.verifyUidToken === 'function', 'verifyUidToken 로드');
ok(typeof A.startSession === 'function', 'startSession 로드 — 로그인 시 세션을 여는 함수가 존재해야 한다');
ok(typeof A.singleSessionOn === 'function', 'singleSessionOn 킬 스위치 로드');

// ── 1) 스위치 off — 배포만으로는 아무 일도 없어야 한다 ──
{
  const env = { ...SECRET, SESSION_STATE: fakeKV(), SINGLE_SESSION: 'off' };
  const sid1 = await A.startSession('stu1', env);
  const tok1 = await A.signUidToken('stu1', env, undefined, sid1);
  await A.startSession('stu1', env);                       // 다른 기기에서 로그인
  const uid = await A.verifyUidToken(tok1, env);
  ok(uid === 'stu1', '① 스위치 off → 새 로그인이 있어도 옛 토큰이 살아 있다 (dormant)');
  ok(A.singleSessionOn(env) === false, '① singleSessionOn(off) === false');
}

// ── 2) 하위호환 — sid 없는 기존 토큰은 켜도 통과 ──
{
  const env = { ...SECRET, SESSION_STATE: fakeKV(), SINGLE_SESSION: 'on' };
  const legacy = await A.signUidToken('stu2', env);         // sid 없이 발급 = 기존 토큰
  await A.startSession('stu2', env);                        // 그 뒤 누가 로그인해도
  const uid = await A.verifyUidToken(legacy, env);
  ok(uid === 'stu2', '② 하위호환 — sid 없는 기존 토큰은 스위치를 켜도 통과 (기존 로그인자 안 튕김)');
}

// ── 3) 실제 차단 — 이게 이 기능의 본체 ──
{
  const env = { ...SECRET, SESSION_STATE: fakeKV(), SINGLE_SESSION: 'on' };
  const sidPhone = await A.startSession('stu3', env);
  const tokPhone = await A.signUidToken('stu3', env, undefined, sidPhone);
  ok(await A.verifyUidToken(tokPhone, env) === 'stu3', '③ 첫 기기는 정상 통과');

  const sidTablet = await A.startSession('stu3', env);      // 두 번째 기기 로그인
  const tokTablet = await A.signUidToken('stu3', env, undefined, sidTablet);

  ok(await A.verifyUidToken(tokPhone, env) === null, '③ 🔒 두 번째 로그인 후 **첫 기기 토큰이 죽는다** — 동시접속 차단의 본체');
  ok(await A.verifyUidToken(tokTablet, env) === 'stu3', '③ 최신 기기는 계속 쓸 수 있다');
  ok(sidPhone !== sidTablet, '③ 로그인마다 sid 가 새로 발급된다');
}

// ── 4) fail-open — 인프라 사고가 «전원 로그아웃» 이 되면 안 된다 ──
{
  const envNoKV = { ...SECRET, SINGLE_SESSION: 'on' };       // SESSION_STATE 바인딩 자체가 없음
  const sid = 'someSid';
  const tok = await A.signUidToken('stu4', envNoKV, undefined, sid);
  ok(await A.verifyUidToken(tok, envNoKV) === 'stu4', '④ KV 바인딩이 없으면 통과 (fail-open)');

  const envEmpty = { ...SECRET, SESSION_STATE: fakeKV(), SINGLE_SESSION: 'on' };
  const tok2 = await A.signUidToken('stu5', envEmpty, undefined, 'sidWithNoRecord');
  ok(await A.verifyUidToken(tok2, envEmpty) === 'stu5', '④ KV 에 기록이 없으면(만료) 통과 (fail-open)');

  const envThrow = { ...SECRET, SINGLE_SESSION: 'on', SESSION_STATE: { async get() { throw new Error('KV down'); }, async put() {} } };
  const sid3 = await A.startSession('stu6', envThrow);       // put 이 던져도 로그인은 되어야
  const tok3 = await A.signUidToken('stu6', envThrow, undefined, sid3);
  ok(await A.verifyUidToken(tok3, envThrow) === 'stu6', '④ KV 가 예외를 던져도 통과 (fail-open)');
}

// ── 5) 기존 보안이 약해지지 않았는지 (위조·만료는 여전히 막혀야) ──
{
  const env = { ...SECRET, SESSION_STATE: fakeKV(), SINGLE_SESSION: 'on' };
  const sid = await A.startSession('stu7', env);
  const tok = await A.signUidToken('stu7', env, undefined, sid);
  ok(await A.verifyUidToken(tok.slice(0, -3) + 'xyz', env) === null, '⑤ 서명 위조는 여전히 거부');
  ok(await A.verifyUidToken(await A.signUidToken('stu7', env, -1000, sid), env) === null, '⑤ 만료 토큰은 여전히 거부');
  ok(await A.verifyUidToken(tok, { ...env, ROOM_JWT_SECRET: 'other' }) === null, '⑤ 다른 시크릿으로는 검증 불가');
}

// ── 6) uid 대소문자 — 로그인은 NOCASE 인데 KV 키가 갈리면 «항상 통과» 하는 구멍이 된다 ──
{
  const env = { ...SECRET, SESSION_STATE: fakeKV(), SINGLE_SESSION: 'on' };
  const sid1 = await A.startSession('Stu8', env);
  const tok1 = await A.signUidToken('Stu8', env, undefined, sid1);
  await A.startSession('stu8', env);                          // 같은 사람이 소문자로 재로그인
  ok(await A.verifyUidToken(tok1, env) === null,
     '⑥ 대소문자가 달라도 같은 세션으로 본다 — 아니면 «대문자로 로그인» 하나로 차단이 뚫린다');
}

console.log('─'.repeat(66));
console.log(`  PASS ${pass}    ⚠ FAIL ${fail}`);
console.log('═'.repeat(66));
process.exit(fail ? 1 : 0);
