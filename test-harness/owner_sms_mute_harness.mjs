/* ══════════════════════════════════════════════════════════════════════
   📵 운영자 문자 «전체» 음소거  (2026-09-08 사장님 「일단 모두 꺼줘」)

   [무슨 일이 있었나] 9/6 에 「🚨 결석 위험」 문자 하나를 껐는데, 9/8 에
     「관리자 로그인 알림」이 또 왔습니다. 사장님이 PDF 보고서를 보시고
     «5명 중 1명만 껐다» 는 것을 확인한 뒤 「일단 모두 꺼줘」로 결정.

   [후속] 2026-09-09 사장님 「사이트 장애랑 감시견만 다시 켜줘」 —
     `uptime`·`room-split` 두 종류만 음소거에서 뺐습니다(⑧절).

   [이 하니스가 지키는 것]
     ① 판정이 «정본 한 곳» 에 있고 순수 함수다 (문자열이 아니라 실제로 돌린다)
     ② 기본이 «음소거» — 종류를 안 밝히면 값이 없거나 모르는 값일 때 막는다
     ③ 되켜는 값은 'off' 하나뿐이고 실제로 켜진다  ← 짝이 없으면 «전부 막기» 도 통과
     ④ 운영자 «아닌» 번호는 절대 막지 않는다(학부모·강사 문자가 사라지면 훨씬 나쁘다)
     ⑤ 막는 자리가 «보내는 정본»(sendPlainSms) 안이고, 실제 발송보다 «앞» 이다
     ⑥ 조용히 사라지지 않는다(로그) · 거짓 성공을 말하지 않는다(ok:false + muted)
     ⑧ 예외는 «두 종류만» 이고, 그 예외를 실제로 받는 호출부도 그 둘뿐이다
        ← «막는다» 만 검사하면 예외가 죽어도 초록이고, «보낸다» 만 검사하면
          결제·로그인이 몰래 예외를 받아도 초록이다. 둘을 **짝으로** 둔다.
   ══════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const HERE = dirname(fileURLToPath(import.meta.url));
const rd = (p) => readFileSync(join(HERE, p), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
}

const SRC = '../cloudflare-deploy/src';
const mute = rd(`${SRC}/owner-sms-mute.ts`);
const sol  = rd(`${SRC}/solapi-client.ts`);
/* 🪤 «이 글자가 없어야 한다» 류는 주석을 걷어내고 본다 — 왜 그러면 안 되는지 적어 둔
   설명 주석 자체에 걸린다(이 저장소가 여러 번 밟은 함정). */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const solCode = strip(sol);

/* ── 정본을 «실제로» 돌린다 ────────────────────────────────────────────
   타입 표기만 걷어내면 그대로 자바스크립트다. 문자열 검사로는
   「무슨 답이 나오는가」를 볼 수 없다(이 저장소의 반복 실측). */
function loadFns() {
  let js = mute
    .replace(/^\s*export\s+type\s+[^;\n]*;?\s*$/gm, '')      // `export type OwnerSmsKind = …`
    .replace(/^\s*export\s+/gm, '')
    .replace(/\s+as\s+readonly\s+string\[\]/g, '')           // `(X as readonly string[])`
    .replace(/\s+as\s+const/g, '')                           // `= [...] as const`
    .replace(/:\s*readonly\s+string\[\]/g, '')
    .replace(/:\s*string\s*\|\s*null\s*\|\s*undefined/g, '')
    .replace(/\?:\s*string\s*\|\s*null/g, '')                // `kind?: string | null` → `kind`
    .replace(/\)\s*:\s*boolean/g, ')')
    .replace(/\)\s*:\s*string/g, ')');
  return new Function(js +
    '\n; return { ownerMuteFromKv, ownerSmsBlocked, isOwnerPhone, OWNER_MUTE_KV_KEY, OWNER_ALWAYS_KINDS };')();
}
let F = null, loadErr = null;
try { F = loadFns(); } catch (e) { loadErr = e; }

console.log('\n📵 운영자 문자 전체 음소거\n');
console.log('[ ① 판정이 정본 한 곳에 있고 실제로 돈다 ]');
check('전제: 판정 함수를 실제로 불러왔다 (실패하면 아래가 전부 헛돈다)',
  !!F && typeof F.ownerSmsBlocked === 'function' && typeof F.isOwnerPhone === 'function');
if (loadErr) console.log('     ↳ 로드 오류:', String(loadErr.message || loadErr).slice(0, 120));
check('스위치 이름이 코드에 상수로 있다', !!F && F.OWNER_MUTE_KV_KEY === 'owner_alert_mute');
check('예외 목록이 코드에 «선언된 값» 으로 있다 (주석 글자가 아니라)',
  !!F && Array.isArray(F.OWNER_ALWAYS_KINDS));
check('판정을 복제하지 않는다 (solapi-client 가 정본을 import)',
  /from '\.\/owner-sms-mute'/.test(sol)
  && /isOwnerPhone/.test(sol) && /ownerSmsBlocked/.test(sol));

console.log('\n[ ② 기본이 «음소거» — 종류를 안 밝히면 모를 때 막는다 ]');
if (F) {
  for (const [v, label] of [[undefined, '값 없음'], [null, 'null'], ['', '빈 값'],
                            ['on', "'on'"], ['ON', "'ON'"], ['yes', '모르는 값'], ['0', "'0'"]]) {
    check(`${label} → 막는다`, F.ownerMuteFromKv(v) === true);
    check(`${label} + 종류 안 밝힘 → 막는다`, F.ownerSmsBlocked(v) === true
      && F.ownerSmsBlocked(v, undefined) === true && F.ownerSmsBlocked(v, '') === true);
  }
}

console.log('\n[ ③ 되켜는 값은 «off» 하나 — «전부 막기» 가 아님을 증명하는 짝 ]');
if (F) {
  check("'off' → 보낸다", F.ownerMuteFromKv('off') === false);
  check("'OFF' → 보낸다 (대소문자 무시)", F.ownerMuteFromKv('OFF') === false);
  check("' off ' → 보낸다 (앞뒤 공백 무시)", F.ownerMuteFromKv(' off ') === false);
}

console.log('\n[ ④ 운영자 «아닌» 번호는 절대 막지 않는다 ]');
if (F) {
  /* 🔒 실번호를 적지 않는다 — 검사는 isOwnerPhone 의 «양쪽» 을 다 통제하므로 가짜로도 같은 답이다. */
  const OWNER = '01000000001';
  check('같은 번호 → 운영자로 본다', F.isOwnerPhone('01000000001', OWNER) === true);
  check('하이픈이 있어도 같은 번호', F.isOwnerPhone('010-0000-0001', OWNER) === true);
  check('+82 표기도 같은 번호', F.isOwnerPhone('+82 10-0000-0001', OWNER) === true);
  check('학부모 번호 → 막지 않는다', F.isOwnerPhone('01012345678', OWNER) === false);
  check('필리핀 강사 번호 → 막지 않는다', F.isOwnerPhone('09358444527', OWNER) === false);
  check('수신번호가 비면 막지 않는다', F.isOwnerPhone('', OWNER) === false);
  check('운영자 번호를 모르면 막지 않는다 (남의 문자까지 죽이면 안 된다)',
    F.isOwnerPhone('01012345678', undefined) === false && F.isOwnerPhone('01012345678', '') === false);
  check('한 자리만 달라도 남의 번호', F.isOwnerPhone('01000000002', OWNER) === false);
}

console.log('\n[ ⑤ 막는 자리가 «보내는 정본» 안이고 실제 발송보다 앞이다 ]');
/* 🪤 «앞 N자» 로 자르지 않는다 — 이 저장소가 그 창 때문에 헛돈 전례가 있다.
   함수 몸통을 중괄호 짝으로 잘라 그 «안» 에 있는지 위치로 본다. */
/* ⚠️ 처음엔 «선언 뒤 첫 `{`» 를 몸통으로 잡았는데, 이 함수의 반환 타입이
      `): Promise<{ ok: boolean; ... }>` 라 **타입의 중괄호**를 잘라 냈다(전제 검사가 잡음).
      그래서 괄호·꺾쇠 깊이를 함께 세어 «파라미터·반환타입 밖» 의 `{` 만 몸통으로 본다. */
function bodyOf(src, sigNeedle) {
  const i = src.indexOf(sigNeedle);
  if (i < 0) return '';
  let par = 0, ang = 0, open = -1;
  for (let j = i + sigNeedle.length; j < src.length; j++) {
    const c = src[j];
    if (c === '(') par++;
    else if (c === ')') par--;
    else if (c === '<') ang++;
    else if (c === '>') { if (ang > 0) ang--; }
    else if (c === '{') {
      if (par === 0 && ang === 0) { open = j; break; }
      let d = 0;                                  // 타입·기본값 안의 { } 는 짝을 맞춰 건너뛴다
      for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (d === 0) break; } }
    }
  }
  if (open < 0) return '';
  let d = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') { d--; if (d === 0) return src.slice(open, j + 1); }
  }
  return '';
}
const send = bodyOf(solCode, 'export async function sendPlainSms');
check('전제: sendPlainSms 몸통을 잘라 냈다', send.length > 200);
const iGate = send.indexOf('isOwnerPhone');
const iFetch = send.search(/fetch\s*\(/);
check('음소거 판정이 sendPlainSms «안» 에 있다', iGate >= 0);
check('실제 발송(fetch)보다 «앞» 에서 막는다', iGate >= 0 && iFetch >= 0 && iGate < iFetch);
check('막으면 그 자리에서 돌아간다 (아래로 안 흐른다)',
  /if \(muted\)[\s\S]{0,400}?return \{/.test(send));

console.log('\n[ ⑤-2 KV 를 못 읽어도 «안 보냄» 으로 떨어진다 ]');
/* 🪤 이 절이 없을 때 변이시험 M4(`let muted = false`)가 **31/31 통과**했다 —
      「KV 가 흔들리면 문자가 다시 간다」를 검사가 원리상 못 봤다. 지시와 정반대 방향이라
      «있는가» 가 아니라 **게이트를 오려 내 실제로 돌려서** 확인한다. */
function runGate(env, kind) {
  const m = send.match(/if \(isOwnerPhone[\s\S]*?\n  \}/);
  if (!m) return { err: 'gate_not_found' };
  const fn = new Function(
    'env', 'toPhone', 'text', 'opts', 'mode', 'isOwnerPhone', 'ownerSmsBlocked', 'OWNER_MUTE_KV_KEY', 'console',
    `return (async () => {\n${m[0]}\n return { sent: true };\n})();`);
  const quiet = { warn() {}, log() {}, error() {} };
  return fn(env, '010-0000-0001', '[망고아이] 시험', kind ? { kind } : undefined, 'live',
            F.isOwnerPhone, F.ownerSmsBlocked, F.OWNER_MUTE_KV_KEY, quiet);
}
if (F && send) {
  const OWNER = { OWNER_ALERT_PHONE: '01000000001' };
  const res = {};
  await (async () => {
    res.throws = await runGate({ ...OWNER, SESSION_STATE: { get() { throw new Error('KV 장애'); } } });
    res.noBind = await runGate({ ...OWNER });                                   // 바인딩 자체가 없음
    res.empty  = await runGate({ ...OWNER, SESSION_STATE: { async get() { return null; } } });
    res.off    = await runGate({ ...OWNER, SESSION_STATE: { async get() { return 'off'; } } });
    res.other  = await runGate({ OWNER_ALERT_PHONE: '01000000000',
                                 SESSION_STATE: { async get() { return null; } } });
    // 📌 예외 둘은 KV 가 흔들려도 나가야 한다 — 그러라고 되켠 것이다
    res.upThrow  = await runGate({ ...OWNER, SESSION_STATE: { get() { throw new Error('KV 장애'); } } }, 'uptime');
    res.splitNul = await runGate({ ...OWNER, SESSION_STATE: { async get() { return null; } } }, 'room-split');
    res.upAll    = await runGate({ ...OWNER, SESSION_STATE: { async get() { return 'all'; } } }, 'uptime');
  })();
  check('KV 조회가 «던져도» 막는다', res.throws?.muted === true);
  check('KV 바인딩이 없어도 막는다', res.noBind?.muted === true);
  check('KV 값이 비어 있어도 막는다', res.empty?.muted === true);
  check("KV 가 'off' 면 실제로 보낸다 (짝 — 없으면 «전부 막기» 도 통과)", res.off?.sent === true);
  check('운영자 번호가 아니면 게이트를 그냥 지나간다', res.other?.sent === true);
  check('사이트 장애는 KV 가 «던져도» 나간다', res.upThrow?.sent === true);
  check('방 갈림 감시견은 KV 값이 없어도 나간다', res.splitNul?.sent === true);
  check("KV 가 'all' 이면 예외까지 막는다 (완전 침묵으로 되돌릴 길)", res.upAll?.muted === true);
}

console.log('\n[ ⑧ 예외는 «두 종류만» — 넓히면 9/8 지시가 통째로 되돌아간다 ]');
if (F) {
  check("'uptime' → 보낸다 (사이트 장애)", F.ownerSmsBlocked(null, 'uptime') === false);
  check("'room-split' → 보낸다 (방 갈림 감시견)", F.ownerSmsBlocked(null, 'room-split') === false);
  check("'UPTIME' → 보낸다 (대소문자·공백 무시)",
    F.ownerSmsBlocked(null, ' UPTIME ') === false);
  /* ⛔ 목록을 «길이·순서» 로 못 박지 않는다 — 나중에 정당하게 늘 때 멀쩡한 수리가 빨간불이 된다.
     물어야 할 것은 «지금 꺼져 있어야 할 것이 켜져 있지 않은가» 다. */
  for (const k of ['payment', 'refund', 'login', 'lead', 'absent', 'no-show', '', 'all', 'off'])
    check(`'${k || '(빈 값)'}' → 여전히 막힌다`, F.ownerSmsBlocked(null, k) === true);
  check("'off' 는 종류와 무관하게 전부 보낸다",
    F.ownerSmsBlocked('off', 'payment') === false && F.ownerSmsBlocked('off') === false);
}

/* ── 예외를 «실제로 받는» 호출부가 그 둘뿐인가 ──────────────────────────
   ⚠️ 목록만 좁게 두고 결제 쪽에서 `kind:'uptime'` 을 달면 그대로 새어 나간다.
      그래서 소스 전체에서 «kind 를 넘기는 sendPlainSms 호출» 을 세어 파일을 대조한다. */
{
  const { readdirSync } = await import('node:fs');
  /* 🪤 하위 폴더가 생기는 날 조용히 안 보게 되지 않도록 «재귀» 로 훑는다.
        (지금 src/ 는 하위 폴더가 없지만, «없어서 통과» 와 «봐서 통과» 는 다르다) */
  function allTs(rel) {
    const out = [];
    for (const e of readdirSync(join(HERE, rel), { withFileTypes: true })) {
      if (e.isDirectory()) out.push(...allTs(`${rel}/${e.name}`));
      else if (e.name.endsWith('.ts')) out.push(`${rel}/${e.name}`);
    }
    return out;
  }
  const files = allTs(SRC);
  const EXEMPT_FILES = ['api-uptime.ts', 'room-split-guard.ts'];
  /* 🔴 따옴표 «한 종류» 만 보면 안 된다 — 함정 대조에서 실제로 뚫렸다:
        결제 알림에 `{ kind: "uptime" }`(쌍따옴표)를 달았더니 tsc 도 통과하고
        이 검사도 **65/65 초록**이었다. 이 PR 의 핵심 보장이 따옴표 하나로 사라졌다.
        ⚠️ 인자 안에 `;` 가 들어간 호출은 여전히 못 본다(지금 호출부에는 없다). */
  const KIND_RE = /sendPlainSms\([^;]*?kind:\s*['"`]([a-z-]+)['"`]/g;
  const tagged = [];   // [파일, kind]
  for (const rel of files) {
    const f = rel.split('/').pop();
    for (const m of strip(rd(rel)).matchAll(KIND_RE)) tagged.push([f, m[1]]);
  }
  const byFile = new Map();
  for (const [f, k] of tagged) byFile.set(f, (byFile.get(f) || new Set()).add(k));
  check(`전제: src 를 재귀로 훑어 예외 호출을 실제로 찾았다 (파일 ${files.length}개)`,
    files.length > 50 && tagged.length > 0);
  /* ⛔ «몇 개인가» 로 못 박지 않는다 — 나중에 장애 알림이 하나 늘면 보장은 세졌는데
        검사만 빨간불이 된다(이 저장소가 여러 번 밟은 함정).
        물어야 할 것은 **«그 파일에서 kind 를 빠뜨린 운영자 호출이 없는가»** 다. */
  for (const f of EXEMPT_FILES) {
    const src = strip(rd(`${SRC}/${f}`));
    const all = [...src.matchAll(/sendPlainSms\(/g)].length;
    const withKind = [...src.matchAll(KIND_RE)].length;
    check(`${f} 의 sendPlainSms 호출이 «전부» 예외를 받는다 (${withKind}/${all})`,
      all > 0 && withKind === all);
  }
  check('사이트 장애가 예외를 받는다 (api-uptime.ts)',
    tagged.some(([f, k]) => f === 'api-uptime.ts' && k === 'uptime'));
  check('방 갈림 감시견이 예외를 받는다 (room-split-guard.ts)',
    tagged.some(([f, k]) => f === 'room-split-guard.ts' && k === 'room-split'));
  const strayFile = [...byFile.keys()].filter(f => !EXEMPT_FILES.includes(f));
  check('결제·환불·로그인·상담 리드는 예외를 «안» 받는다' +
        (strayFile.length ? ` — 샌 파일: ${strayFile.join(', ')}` : ''), strayFile.length === 0);
  const strayKind = [...new Set(tagged.map(([, k]) => k))]
    .filter(k => !F?.OWNER_ALWAYS_KINDS?.includes(k));
  check('호출부가 «목록에 없는» 종류를 쓰지 않는다 (오타는 조용히 막힌다)' +
        (strayKind.length ? ` — ${strayKind.join(', ')}` : ''), strayKind.length === 0);
}

console.log('\n[ ⑥ 조용히 안 사라지고, 거짓 성공을 말하지 않는다 ]');
check('막을 때 로그를 남긴다', /console\.warn\('\[owner-sms\]/.test(send));
check('«보냈다» 고 거짓말하지 않는다 (ok:false)',
  /return \{ ok: false, mode, muted: true/.test(send));
check('부르는 쪽이 «음소거» 를 구분할 수 있다 (muted 를 반환 타입에 실었다)',
  /muted\?: boolean/.test(sol));
check('로그에 본문 전체를 남기지 않는다 (PII)', /\.slice\(0, 40\)/.test(send));
check('되켜는 방법이 코드에 적혀 있다',
  /owner_alert_mute/.test(mute) && /배포 불필요|배포 없이/.test(mute + sol));

console.log('\n[ ⑦ ⛔ 번호 자체를 지우는 방식이 아니다 ]');
/* 시크릿을 지우면 되돌리기 어렵고 «하나만 다시 켜기» 도 못 한다.
   그래서 OWNER_ALERT_PHONE 은 그대로 두고 수신번호로만 판정한다. */
check('OWNER_ALERT_PHONE 을 여전히 읽는다 (지우지 않았다)',
  /OWNER_ALERT_PHONE\?: string/.test(sol) && /env\.OWNER_ALERT_PHONE/.test(solCode));

console.log('\n─────────────────────────────────────────────');
console.log(`  통과 ${PASS} · 실패 ${FAIL}`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach(f => console.log('   · ' + f)); }
console.log('─────────────────────────────────────────────');
process.exit(FAIL ? 1 : 0);
