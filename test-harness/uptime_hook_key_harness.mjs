/* ══════════════════════════════════════════════════════════════════════
   🔐 장애 웹훅 열쇠 — 시험용 칸을 더해도 «잠긴 채로» 남는가

   [왜] 2026-09-09 사장님 「시뮬레이션 훅 쏴서 문자 오는지 확인해줘」.
     `UPTIME_HOOK_KEY_NEW` 는 Cloudflare 시크릿이라 값을 다시 볼 수 없고 실제 값은
     카페24 서버 안에만 있습니다. 그래서 «확인만» 하려고 `UPTIME_HOOK_KEY_TEST` 칸을
     더했는데, 이 경로는 **누구나 부를 수 있고 통과하면 문자가 나갑니다.**

   [이 하니스가 지키는 것]
     ① 판정을 복제하지 않는다 (공용 `keyMatchesAny` 를 그대로 쓴다)
     ② 값이 비면 «아무 열쇠도 안 통한다» — 안 넣는 것이 곧 꺼진 상태
     ③ 두 칸 «모두» 통한다 (한쪽만 통하면 2층 감시견이나 사장님 확인이 죽는다)
     ④ 남의 값·빈 값·공백은 막는다
     ⚠️ ②와 ③을 짝으로 둡니다 — ②만 보면 «전부 막기» 도 통과하고,
        ③만 보면 «전부 열기» 도 통과합니다.
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
const uptime = rd(`${SRC}/api-uptime.ts`);
const util = rd(`${SRC}/api-util.ts`);
/* 🪤 «이 글자가 없어야 한다» 류는 주석을 걷어내고 본다 — 왜 그러면 안 되는지 적어 둔
   설명 주석 자체에 걸린다(이 저장소가 여러 번 밟은 함정). */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const uptimeCode = strip(uptime);

console.log('\n🔐 장애 웹훅 열쇠\n');

/* ── 정본을 «실제로» 돌린다 ────────────────────────────────────────────
   「그 줄이 있는가」로는 «어느 값이 통과하는가» 를 원리상 볼 수 없다. */
console.log('[ ① 판정을 복제하지 않는다 — 공용 함수를 그대로 쓴다 ]');
let keyMatchesAny = null, loadErr = null;
try {
  const m = util.match(/export function keyMatchesAny[\s\S]*?\n\}/);
  if (!m) throw new Error('keyMatchesAny 를 못 찾았다');
  const js = m[0]
    .replace(/^\s*export\s+/, '')
    .replace(/:\s*unknown/g, '')
    .replace(/:\s*\(string \| undefined \| null\)\[\]/g, '')
    .replace(/\)\s*:\s*boolean/g, ')');
  keyMatchesAny = new Function(js + '\n; return keyMatchesAny;')();
} catch (e) { loadErr = e; }
check('전제: 공용 판정 함수를 실제로 불러왔다 (실패하면 아래가 전부 헛돈다)',
  typeof keyMatchesAny === 'function');
if (loadErr) console.log('     ↳ 로드 오류:', String(loadErr.message || loadErr).slice(0, 120));
check('웹훅이 그 공용 함수를 쓴다 (판정을 옆에 다시 적지 않았다)',
  /keyMatchesAny\(/.test(uptimeCode) && /from '\.\/api-util'/.test(uptime));

/* ── 게이트를 소스에서 오려 내 «후보 목록» 을 읽는다 ───────────────────
   ⛔ 이름을 손으로 적어 두지 않는다 — 그러면 소스에서 칸을 빼도 초록이 된다. */
/* ⚠️ `[^)]*` 로 자르면 인자 안의 `(env as any)` 괄호에 먼저 걸려 **아무것도 못 찾습니다**
      (실제로 한 번 밟았습니다). 여는 괄호부터 «짝이 맞는» 닫는 괄호까지 세어 자릅니다. */
function argsOf(src, needle) {
  const i = src.indexOf(needle);
  if (i < 0) return null;
  let d = 0;
  for (let j = i + needle.length - 1; j < src.length; j++) {
    if (src[j] === '(') d++;
    else if (src[j] === ')') { d--; if (d === 0) return src.slice(i + needle.length, j); }
  }
  return null;
}
const gateArgs = argsOf(uptimeCode, 'keyMatchesAny(');
check('전제: 열쇠 게이트를 잘라 냈다', !!gateArgs && /given/.test(gateArgs));
const slots = gateArgs ? [...gateArgs.matchAll(/\.(UPTIME_HOOK_KEY_[A-Z_]+)/g)].map(m => m[1]) : [];
console.log('     ↳ 소스가 인정하는 칸:', slots.join(' · ') || '(없음)');

/* 🔴 아래를 «손으로 적은 인자» 로 돌리면 안 됩니다 — 변이시험 실측(2026-09-09):
      소스에서 칸을 통째로 빼도(=고치기 전 상태로 되돌려도) **16/16 초록**이었습니다.
      제가 적은 두 값으로만 돌아서 소스를 한 번도 안 봤기 때문입니다.
      그래서 게이트 «식» 을 오려 내 소스가 인정하는 칸으로 만든 가짜 env 에 물려 돌립니다. */
const SLOT_VAL = Object.fromEntries(slots.map((s, i) => [s, `열쇠${i}-${s.toLowerCase()}`]));
function gateAllows(given, env = SLOT_VAL) {
  if (!keyMatchesAny || !gateArgs) return null;
  const fn = new Function('keyMatchesAny', 'given', 'env',
    `return keyMatchesAny(${gateArgs.replace(/\(env as any\)/g, 'env')});`);
  return fn(keyMatchesAny, given, env);
}

console.log('\n[ ② 값이 비면 아무 열쇠도 안 통한다 — 안 넣는 것이 곧 «꺼짐» ]');
check('칸이 다 비면 아무 값도 못 통과한다', gateAllows('아무거나', {}) === false);
check('빈 열쇠·공백으로는 못 들어온다', gateAllows('') === false && gateAllows('   ') === false);
check('공백만 든 칸은 «값이 있는 것» 으로 치지 않는다',
  gateAllows('   ', Object.fromEntries(slots.map(s => [s, '   ']))) === false);

console.log('\n[ ③ 소스가 인정하는 칸이 «전부» 통한다 — 짝이 없으면 «전부 막기» 도 통과한다 ]');
check('전제: 인정하는 칸이 둘 이상이다 (2층 감시견 + 사장님 확인용)', slots.length >= 2);
for (const s of slots) {
  check(`${s} 값으로 통과한다`, gateAllows(SLOT_VAL[s]) === true);
  /* 「다른 칸이 비어도 이 칸은 산다」 — 한 칸이 비면 나머지가 죽는 배선을 잡는다 */
  check(`${s} 는 «다른 칸이 비어 있어도» 그대로 통한다`,
    gateAllows(SLOT_VAL[s], { [s]: SLOT_VAL[s] }) === true);
}

console.log('\n[ ④ 남의 값은 막는다 ]');
check('모르는 값은 막는다', gateAllows('남의값') === false);
check('앞부분만 같아도 막는다 — 짧은 쪽', gateAllows(String(SLOT_VAL[slots[0]]).slice(0, 4)) === false);
/* ⚠️ 부분일치는 «양쪽» 을 봐야 합니다 — 짧은 쪽만 시험하면 `given.startsWith(후보)` 변이를
      놓칩니다(실측으로 한 번 놓쳤습니다). */
check('앞부분만 같아도 막는다 — 뒤에 덧붙인 쪽', gateAllows(SLOT_VAL[slots[0]] + '-extra') === false);
check('대소문자가 다르면 막는다', gateAllows(String(SLOT_VAL[slots[0]]).toUpperCase()) === false);
check('사장님이 넣지 않은 안내 문구(<열쇠>)로는 못 들어온다', gateAllows('<열쇠>') === false);

console.log('\n[ ⑥ 게이트가 «실제로 막는다» — 조건 뒤집기·무력화를 잡는다 ]');
/* 🔴 ②~④ 는 «판정이 무슨 답을 내는가» 만 봅니다. 그래서 `if (false && !keyMatchesAny(...))`
      처럼 **게이트를 통째로 무력화하는 변이가 그대로 통과했습니다**(2026-09-09 변이시험 실측).
      물어야 할 것은 «막고 돌아가는 return 403 이 그 조건에 달려 있는가» 입니다. */
const gateIf = uptimeCode.match(/if\s*\(([^\n]*keyMatchesAny[^\n]*)\)\s*\{\s*return ([^\n]*)/);
check('전제: 열쇠 게이트의 if 문을 잘라 냈다', !!gateIf);
if (gateIf) {
  const cond = gateIf[1].trim();
  check('조건이 «판정이 거짓이면» 하나뿐이다 (false·true 를 곁들여 무력화하지 않았다)',
    cond.startsWith('!keyMatchesAny(') && !/\b(false|true)\b/.test(cond)
    && !/(&&|\|\|)/.test(cond.slice(0, cond.indexOf('keyMatchesAny'))));
  check('막을 때 403 으로 돌아간다 (아래로 안 흐른다)',
    /403/.test(gateIf[2]) && /forbidden/.test(gateIf[2]));
}
/* 열쇠 확인이 «무슨 일이든 하기 전» 이어야 한다 — 뒤로 밀리면 그 사이 동작이 무료가 된다.
   ⚠️ 파일 전체에서 찾으면 맨 위 **import 줄의 `sendPlainSms`** 가 먼저 걸려 멀쩡한 코드가
      FAIL 납니다(실제로 밟았습니다). 핸들러 «몸통» 만 잘라서 봅니다. */
const bodyStart = uptimeCode.indexOf('export async function handleUptimeApi');
const handler = bodyStart >= 0 ? uptimeCode.slice(bodyStart) : '';
check('전제: 웹훅 핸들러 몸통을 잘라 냈다', handler.length > 500);
const iGate = handler.indexOf('keyMatchesAny(');
const iWork = handler.search(/get\('run'\)\s*===|sendPlainSms\(/);
check('열쇠 확인이 «실제 동작(문자 발송·점검)» 보다 앞이다',
  iGate >= 0 && iWork >= 0 && iGate < iWork);

console.log('\n[ ⑤ 칸이 늘어도 «시크릿» 으로만 둔다 ]');
/* ⛔ [vars] 는 평문이라 저장소·배포 로그에 값이 남는다. */
const toml = rd('../cloudflare-deploy/wrangler.toml');
const varLines = toml.split('\n').filter(l => !l.trim().startsWith('#'));
for (const slot of slots.length ? slots : ['UPTIME_HOOK_KEY_NEW']) {
  check(`${slot} 이 wrangler.toml 에 «평문 값» 으로 없다`,
    !varLines.some(l => new RegExp(`^\\s*${slot}\\s*=`).test(l)));
}
/* ⛔ 후보에 «항상 통과하는 값»(리터럴 문자열·true)을 끼워 넣으면 열쇠가 통째로 무의미해진다.
      인자를 실제로 쪼개 «env 에서 읽은 UPTIME_HOOK_KEY_* 뿐인가» 로 묻는다. */
const gateOther = gateArgs
  ? gateArgs.split(',').map(s => s.trim()).slice(1)
      .filter(s => s && !/^\(env as any\)\.UPTIME_HOOK_KEY_[A-Z_]+$/.test(s) && !/^env\.UPTIME_HOOK_KEY_[A-Z_]+$/.test(s))
  : ['(못 잘랐음)'];
check('후보가 «환경변수 UPTIME_HOOK_KEY_*» 뿐이다 — 항상 통과하는 값이 안 섞였다'
      + (gateOther.length ? ` — 섞인 것: ${gateOther.join(' / ')}` : ''),
  slots.length >= 1 && gateOther.length === 0);

console.log('\n─────────────────────────────────────────────');
console.log(`  통과 ${PASS} · 실패 ${FAIL}`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach(f => console.log('   · ' + f)); }
console.log('─────────────────────────────────────────────');
process.exit(FAIL ? 1 : 0);
