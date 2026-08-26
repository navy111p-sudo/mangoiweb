// enroll_fee_length_harness.mjs — 수강료가 «수업 시간 배수» 를 타는지 (2026-08-26 사장님 지시)
//
// ── 왜 ──────────────────────────────────────────────────────────────────────
// 관리자 수강신청 등록이 `monthly_fee_krw` 를 사람이 적은 값 그대로 저장해서, 40분을 골라도
// 20분 값으로 청구됐다. `class-policy.ts` 가 직접 경고하는 상황이다 —
// 「수업료와 강사료가 반드시 같은 배수를 써야 한다. 한쪽만 바꾸면 강사가 30분을 가르치고
//   20분 값을 받는다」.
//
// ── 이 하니스가 지키는 것 ───────────────────────────────────────────────────
// 🔴 제일 무서운 것은 «두 번 곱하기» 다. 화면이 곱해서 보내고 서버가 또 곱하면 40분이 **4배**가
//    되어 그대로 과금 사고다. 그래서 「곱하는 자리가 «하나뿐인가»」를 세어서 못 박는다.
// 🔴 그 다음은 «지어내기» 다. 기준가를 못 구했는데 아무 숫자나 넣으면 그 금액이 실제로 청구된다.
//    못 구하면 null 이어야 한다(확정 단계가 「월 수강료가 0원입니다」 로 멈춘다 = 오늘과 같은 동작).
//
// ⚠️ 문자열 검사만으로는 «얼마가 되는가» 를 볼 수 없다 — 그래서 계산 정본을 **컴파일해서
//    실제로 돌린다**(이 저장소의 turn_detail·english_only 하니스와 같은 방식).
//
// 실행: node test-harness/enroll_fee_length_harness.mjs

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CF = join(ROOT, 'cloudflare-deploy');
const PUB = process.env.MANGOI_PUB || join(CF, 'public');

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  ❌ ' + name + (detail ? '\n       ' + detail : '')); }
}

const feeSrc   = readFileSync(join(CF, 'src', 'enroll-fee.ts'), 'utf8');
const apiAdmin = readFileSync(join(CF, 'src', 'api-admin.ts'), 'utf8');
const activate = readFileSync(join(CF, 'src', 'enroll-activate.ts'), 'utf8');
const apiPay   = readFileSync(join(CF, 'src', 'api-pay.ts'), 'utf8');
const core     = readFileSync(join(PUB, 'js', 'adm-core.js'), 'utf8');

const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

console.log('\n💰 수강료 × 수업 시간 배수 검사\n');

/* ── ① 곱하는 자리가 «하나뿐» 인가 (두 번 곱하면 40분이 4배) ───────────────── */
{
  // 계산 정본 안에서만 배수를 곱한다
  check('① 길이 배수를 쓰는 곳이 계산 정본(enroll-fee.ts) 하나다',
    /classLengthMultiplier/.test(feeSrc));
  const adminCode = strip(apiAdmin);
  check('① 서버 등록 경로는 스스로 곱하지 않고 계산 정본을 부른다',
    /computeMonthlyFee\(/.test(adminCode) && !/classLengthMultiplier\s*\(/.test(adminCode),
    'api-admin.ts 가 직접 곱하면 정본과 두 번 곱해진다');
  check('① 화면(adm-core.js)은 금액을 곱하지 않는다',
    !/length_multiplier\s*\*/.test(strip(core)) && !/\*\s*p\.length_multiplier/.test(strip(core)),
    '화면이 곱하면 서버 값과 두 번 곱해진다');
  const actCode = strip(activate);
  check('① 확정 단계는 금액을 곱하지 않는다 (저장된 값이 이미 최종값)',
    !/monthly_fee_krw[^;\n]*classLengthMultiplier/.test(actCode) &&
    !/classLengthMultiplier[^;\n]*monthly_fee_krw/.test(actCode));
  check('① 토스 결제 자동활성화는 손대지 않았다 (그 금액은 이미 길이배수를 거친 실제 결제액)',
    !/computeMonthlyFee/.test(apiPay),
    '여기서 또 곱하면 그대로 과금 사고');
}

/* ── ② 저장할 때 «한 번» 곱하고, 기준가를 따로 남기는가 ───────────────────── */
{
  const ins = (apiAdmin.match(/INSERT INTO enrollments \(([^)]*)\) VALUES \(([^)]*)\)/) || []);
  const cols = (ins[1] || '').split(',').map(x => x.trim());
  const marks = (ins[2] || '').split(',').length;
  check('② INSERT 의 칸 수와 물음표 수가 같다', cols.length > 0 && cols.length === marks,
    '칸 ' + cols.length + '개 vs ? ' + marks + '개');
  check('② 곱하기 «전» 기준가를 base_fee_krw 로 남긴다 (근거가 사라지면 되돌아볼 수 없다)',
    cols.includes('base_fee_krw') && /_addEnrCol2\('base_fee_krw',\s*'INTEGER'\)/.test(apiAdmin));
  check('② monthly_fee_krw 에는 계산 결과를 넣는다 (사람이 보낸 값을 그대로 넣지 않는다)',
    /_fee\.monthlyFeeKrw/.test(apiAdmin) &&
    !/b\.monthly_fee_krw != null \? Number\(b\.monthly_fee_krw\) : null,/.test(apiAdmin));
  check('② 대리점 단가 조회는 try/catch 로 감싼다 (요금을 못 구한다고 등록이 막히면 안 된다)',
    /try \{[^}]*priceForUid/.test(apiAdmin));
}

/* ── ③ 사람이 확정 «전에» 근거를 본다 ────────────────────────────────────── */
check('③ 확정 계획이 기준가·배수를 함께 내려준다', /base_fee_krw:/.test(activate) && /length_multiplier:/.test(activate));
check('③ 확정 패널이 요금 근거를 그린다', /요금 근거/.test(core));

/* ── ④ 계산 정본을 실제로 돌려서 확인 ────────────────────────────────────── */
{
  const ts = await import(pathToFileURL(join(CF, 'node_modules', 'typescript', 'lib', 'typescript.js')).href)
    .then(m => m.default || m).catch(() => null);
  if (!ts) {
    console.log('  ⏭  typescript 가 없어 실행 검사는 건너뜁니다 (npm ci 필요)');
  } else {
    const policy = readFileSync(join(CF, 'src', 'class-policy.ts'), 'utf8');
    // import 를 지우고 두 파일을 한 덩어리로 붙여 실제로 돌린다
    const merged = policy.replace(/^export /gm, '') + '\n' +
      feeSrc.replace(/^import[^;]*;$/gm, '').replace(/^export /gm, '') +
      '\n;globalThis.__fee = { computeMonthlyFee, weeklyCountFromDays, floor10, feeExplain };';
    const js = ts.transpileModule(merged, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None } }).outputText;
    (0, eval)(js);
    const { computeMonthlyFee, weeklyCountFromDays } = globalThis.__fee;

    const r20 = computeMonthlyFee({ baseFeeKrw: 100000, minutes: 20 });
    check('④ 20분은 그대로다 (1.0배)', r20.monthlyFeeKrw === 100000, '결과 ' + r20.monthlyFeeKrw);
    const r30 = computeMonthlyFee({ baseFeeKrw: 100000, minutes: 30 });
    check('④ 30분은 1.5배다', r30.monthlyFeeKrw === 150000, '결과 ' + r30.monthlyFeeKrw);
    const r40 = computeMonthlyFee({ baseFeeKrw: 100000, minutes: 40 });
    check('④ 40분은 2.0배다', r40.monthlyFeeKrw === 200000, '결과 ' + r40.monthlyFeeKrw);

    // 🔴 분당 단가가 길이와 무관해야 한다 — class-policy.ts 가 「깎아 주면 손해」라고 못 박은 규칙
    const per = m => computeMonthlyFee({ baseFeeKrw: 100000, minutes: m }).monthlyFeeKrw / m;
    check('④ 분당 단가가 20·30·40분에서 모두 같다 (길이로 깎아 주면 그 순간 손해)',
      Math.abs(per(20) - per(30)) < 0.01 && Math.abs(per(20) - per(40)) < 0.01,
      [per(20), per(30), per(40)].join(' / '));

    const rOdd = computeMonthlyFee({ baseFeeKrw: 33333, minutes: 30 });
    check('④ 10원 단위로 절사한다', rOdd.monthlyFeeKrw === 49990, '결과 ' + rOdd.monthlyFeeKrw);

    const rNone = computeMonthlyFee({ baseFeeKrw: null, minutes: 40 });
    check('④ 기준가가 없으면 «지어내지 않고» null 이다', rNone.monthlyFeeKrw === null && rNone.source === 'none',
      JSON.stringify(rNone));

    const rAg = computeMonthlyFee({ baseFeeKrw: null, minutes: 30, weekly1Price: 60000, weekly: 2 });
    check('④ 기준가가 없으면 대리점 단가 × 주 횟수로 세운다',
      rAg.baseFeeKrw === 120000 && rAg.monthlyFeeKrw === 180000 && rAg.source === 'agency_price',
      JSON.stringify(rAg));
    check('④ 사람이 적은 값이 대리점 단가를 이긴다 (협의가를 덮어쓰면 안 된다)',
      computeMonthlyFee({ baseFeeKrw: 50000, minutes: 20, weekly1Price: 60000, weekly: 3 }).monthlyFeeKrw === 50000);

    const rBad = computeMonthlyFee({ baseFeeKrw: 100000, minutes: 25 });
    check('④ 허용 목록 밖 값(25분·꺼둔 스위치)은 기본 20분으로 본다',
      rBad.minutes === 20 && rBad.monthlyFeeKrw === 100000, JSON.stringify(rBad));

    check('④ 요일 글자에서 주 횟수를 센다 (월수금=3)', weeklyCountFromDays('월수금') === 3);
    check('④ 같은 요일이 겹쳐 적혀도 한 번만 센다', weeklyCountFromDays('월월수') === 2);
    check('④ 영어 요일도 센다', weeklyCountFromDays('mon,wed') === 2);
    check('④ 비어 있으면 0 (0이면 대리점 단가 경로가 안 걸려 null 이 된다)',
      weeklyCountFromDays('') === 0 && weeklyCountFromDays(null) === 0);

    // 🔴 두 번 곱히면 어떻게 되는지 — 그 상태를 «틀린 값» 으로 못 박아 둔다
    const twice = computeMonthlyFee({ baseFeeKrw: computeMonthlyFee({ baseFeeKrw: 100000, minutes: 40 }).monthlyFeeKrw, minutes: 40 });
    check('④ 두 번 곱하면 4배가 된다는 것을 못 박는다 (그래서 곱하는 자리는 하나여야 한다)',
      twice.monthlyFeeKrw === 400000, '결과 ' + twice.monthlyFeeKrw);
  }
}

console.log('\n' + '─'.repeat(56));
console.log(`  ✅ PASS ${pass}   ❌ FAIL ${fail}`);
if (fail) { console.log('\n실패:'); failures.forEach(f => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);
