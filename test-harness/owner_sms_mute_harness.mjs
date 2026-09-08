/* ══════════════════════════════════════════════════════════════════════
   📵 운영자 문자 «전체» 음소거  (2026-09-08 사장님 「일단 모두 꺼줘」)

   [무슨 일이 있었나] 9/6 에 「🚨 결석 위험」 문자 하나를 껐는데, 9/8 에
     「관리자 로그인 알림」이 또 왔습니다. 사장님이 PDF 보고서를 보시고
     «5명 중 1명만 껐다» 는 것을 확인한 뒤 「일단 모두 꺼줘」로 결정.

   [이 하니스가 지키는 것]
     ① 판정이 «정본 한 곳» 에 있고 순수 함수다 (문자열이 아니라 실제로 돌린다)
     ② 기본이 «음소거» — 값이 없거나 모르는 값이면 막는다
     ③ 되켜는 값은 'off' 하나뿐이고 실제로 켜진다  ← 짝이 없으면 «전부 막기» 도 통과
     ④ 운영자 «아닌» 번호는 절대 막지 않는다(학부모·강사 문자가 사라지면 훨씬 나쁘다)
     ⑤ 막는 자리가 «보내는 정본»(sendPlainSms) 안이고, 실제 발송보다 «앞» 이다
     ⑥ 조용히 사라지지 않는다(로그) · 거짓 성공을 말하지 않는다(ok:false + muted)
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
    .replace(/^\s*export\s+/gm, '')
    .replace(/:\s*string\s*\|\s*null\s*\|\s*undefined/g, '')
    .replace(/\)\s*:\s*boolean/g, ')')
    .replace(/\)\s*:\s*string/g, ')');
  return new Function(js + '\n; return { ownerMuteFromKv, isOwnerPhone, OWNER_MUTE_KV_KEY };')();
}
let F = null, loadErr = null;
try { F = loadFns(); } catch (e) { loadErr = e; }

console.log('\n📵 운영자 문자 전체 음소거\n');
console.log('[ ① 판정이 정본 한 곳에 있고 실제로 돈다 ]');
check('전제: 판정 함수를 실제로 불러왔다 (실패하면 아래가 전부 헛돈다)',
  !!F && typeof F.ownerMuteFromKv === 'function' && typeof F.isOwnerPhone === 'function');
if (loadErr) console.log('     ↳ 로드 오류:', String(loadErr.message || loadErr).slice(0, 120));
check('스위치 이름이 코드에 상수로 있다', !!F && F.OWNER_MUTE_KV_KEY === 'owner_alert_mute');
check('판정을 복제하지 않는다 (solapi-client 가 정본을 import)',
  /from '\.\/owner-sms-mute'/.test(sol)
  && /isOwnerPhone/.test(sol) && /ownerMuteFromKv/.test(sol));

console.log('\n[ ② 기본이 «음소거» — 모르면 막는다 ]');
if (F) {
  for (const [v, label] of [[undefined, '값 없음'], [null, 'null'], ['', '빈 값'],
                            ['on', "'on'"], ['ON', "'ON'"], ['yes', '모르는 값'], ['0', "'0'"]]) {
    check(`${label} → 막는다`, F.ownerMuteFromKv(v) === true);
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
  const OWNER = '01089862224';
  check('같은 번호 → 운영자로 본다', F.isOwnerPhone('01089862224', OWNER) === true);
  check('하이픈이 있어도 같은 번호', F.isOwnerPhone('010-8986-2224', OWNER) === true);
  check('+82 표기도 같은 번호', F.isOwnerPhone('+82 10-8986-2224', OWNER) === true);
  check('학부모 번호 → 막지 않는다', F.isOwnerPhone('01012345678', OWNER) === false);
  check('필리핀 강사 번호 → 막지 않는다', F.isOwnerPhone('09358444527', OWNER) === false);
  check('수신번호가 비면 막지 않는다', F.isOwnerPhone('', OWNER) === false);
  check('운영자 번호를 모르면 막지 않는다 (남의 문자까지 죽이면 안 된다)',
    F.isOwnerPhone('01012345678', undefined) === false && F.isOwnerPhone('01012345678', '') === false);
  check('한 자리만 달라도 남의 번호', F.isOwnerPhone('01089862225', OWNER) === false);
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
function runGate(env) {
  const m = send.match(/if \(isOwnerPhone[\s\S]*?\n  \}/);
  if (!m) return { err: 'gate_not_found' };
  const fn = new Function(
    'env', 'toPhone', 'text', 'mode', 'isOwnerPhone', 'ownerMuteFromKv', 'OWNER_MUTE_KV_KEY', 'console',
    `return (async () => {\n${m[0]}\n return { sent: true };\n})();`);
  const quiet = { warn() {}, log() {}, error() {} };
  return fn(env, '010-8986-2224', '[망고아이] 시험', 'live',
            F.isOwnerPhone, F.ownerMuteFromKv, F.OWNER_MUTE_KV_KEY, quiet);
}
if (F && send) {
  const OWNER = { OWNER_ALERT_PHONE: '01089862224' };
  const res = {};
  await (async () => {
    res.throws = await runGate({ ...OWNER, SESSION_STATE: { get() { throw new Error('KV 장애'); } } });
    res.noBind = await runGate({ ...OWNER });                                   // 바인딩 자체가 없음
    res.empty  = await runGate({ ...OWNER, SESSION_STATE: { async get() { return null; } } });
    res.off    = await runGate({ ...OWNER, SESSION_STATE: { async get() { return 'off'; } } });
    res.other  = await runGate({ OWNER_ALERT_PHONE: '01000000000',
                                 SESSION_STATE: { async get() { return null; } } });
  })();
  check('KV 조회가 «던져도» 막는다', res.throws?.muted === true);
  check('KV 바인딩이 없어도 막는다', res.noBind?.muted === true);
  check('KV 값이 비어 있어도 막는다', res.empty?.muted === true);
  check("KV 가 'off' 면 실제로 보낸다 (짝 — 없으면 «전부 막기» 도 통과)", res.off?.sent === true);
  check('운영자 번호가 아니면 게이트를 그냥 지나간다', res.other?.sent === true);
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
