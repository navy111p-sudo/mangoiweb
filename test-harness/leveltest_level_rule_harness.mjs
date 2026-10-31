#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// 🎚 leveltest_level_rule_harness — AI 레벨테스트의 «레벨을 정하는 규칙» 을 실제로 돌려 성질을 잰다
//
// [왜 이 검사가 생겼나 — 2026-09-22]
//   2026-09-21 에 제가 「순수 찍기로도 C2 26.1% · B2 이상 59.8%」라고 세 곳(PR #1073 본문 ·
//   작업기록 · 보고)에 적었는데 **틀린 숫자**였습니다. 26.1% 는 «한 레벨 통과 확률»(26.17%)
//   이고 그것을 «C2 도달 확률» 로 옮겨 적은 것입니다. 실제로 돌려 보면 C2 는 0.019% 입니다.
//   ⟹ 「찍어서 최상위가 나온다」는 사실이 아니었고, 그 틀린 숫자를 믿고 규칙을 «고치러» 가면
//      엉뚱한 것을 고치게 됩니다(CLAUDE.md 「심각도를 부풀린 문장이 규칙서에 박히면」).
//
// [그럼 진짜 결함은 무엇인가 — 재서 찾은 것]
//   각 레벨 4문항 중 **2개(50%)만** 맞히면 다음 레벨로 올라갑니다. 찍기 기댓값이 1개이므로
//   문턱이 «찍기보다 겨우 한 개» 위입니다 ⟹ 자기 레벨 위를 찍어서 한두 단계 더 올라갑니다.
//   실측(D1): `73점 → C2` · `64점 → C2`, 그리고 `51점 → A2` 인데 `50점 → B1`(뒤집힘).
//
// [⛔ 이 검사는 «규칙을 못 박는» 것이 아니다 — «바꾸면 무엇이 달라지는지» 를 숫자로 보여준다]
//   문턱을 올리면 과대평가는 줄지만 **과소평가가 훨씬 커집니다**(실측: 진짜 C2 학생 정확도가
//   94% → 50%. `break` 라 한 레벨에서 미끄러지면 거기서 끝나기 때문). 그래서 한쪽만 재면
//   「좋아졌다」로 보입니다 — **과대와 과소를 «짝으로»** 재고 둘을 합친 오차로 판정합니다.
//   ⚠️ 규칙을 바꾸는 것 자체는 «사람이 정할 일» 입니다. 이 검사는 그때 근거를 줍니다.
//
// [⛔ 규칙을 여기에 베껴 적지 말 것]
//   문항표·채점식·레벨 판정을 **소스(api-admin.ts)에서 오려 내 실제로 돌립니다.**
//   베껴 적으면 「내가 적은 상수를 내가 검사」가 되어, 정작 규칙이 바뀌어도 아무도 모릅니다.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.env.LEVELRULE_SRC || join(ROOT, 'cloudflare-deploy/src/api-admin.ts');
const src = readFileSync(SRC, 'utf8');

let pass = 0, fail = 0;
const ok = (cond, msg, detail) => {
  if (cond) { pass++; console.log('  ✅ ' + msg); }
  else { fail++; console.log('  ❌ ' + msg + (detail ? '\n       → ' + detail : '')); }
};
const note = (msg) => console.log('  📊 ' + msg);

/* ── 짝이 맞는 괄호까지 잘라 낸다. 길이로 자르면 옆 코드를 먹는다(CLAUDE.md). ── */
function balancedEnd(text, startIdx, open, close) {
  const i = text.indexOf(open, startIdx);
  if (i < 0) return null;
  let depth = 0;
  for (let k = i; k < text.length; k++) {
    const ch = text[k];
    if (ch === open) depth++;
    else if (ch === close) { depth--; if (depth === 0) return { from: i, to: k + 1 }; }
  }
  return null;
}
function sliceBalanced(text, startIdx, open, close) {
  const r = balancedEnd(text, startIdx, open, close);
  return r ? text.slice(r.from, r.to) : null;
}
/* ⛔ 배열 리터럴을 찾을 때 «선언 줄의 첫 [» 를 잡으면 안 된다 — TypeScript 의 `string[]`·
   `readonly string[]` 이 먼저 걸려 «빈 배열» 이 나오고, 그러면 아래 검사가 전부 헛돈다
   (2026-09-22 에 실제로 밟음: 문항표와 사다리가 둘 다 [] 로 평가됐다). `= [` 부터 센다. */
function sliceArrayAfterEq(text, startIdx) {
  const eq = text.indexOf('= [', startIdx);
  return eq < 0 ? null : sliceBalanced(text, eq, '[', ']');
}

console.log('\n⓪ 전제 — 규칙을 소스에서 «실제로» 오려 냈는가');

/* ① 문항표 — `const CEFR_BANK ... = [` 의 대괄호 짝까지 */
const bankAt = src.indexOf('const CEFR_BANK');
const bankLit = bankAt >= 0 ? sliceArrayAfterEq(src, bankAt) : null;
ok(!!bankLit, '문항표(CEFR_BANK)를 오려 냈다', bankLit ? '' : 'const CEFR_BANK 앵커를 못 찾았습니다');

let BANK = null;
let bankErr = '';
try { BANK = bankLit ? new Function('return ' + bankLit + ';')() : null; } catch (e) { BANK = null; bankErr = String(e && e.message); }
ok(Array.isArray(BANK) && BANK.length > 0, '문항표를 실제로 평가했다', BANK ? '' : ('평가 실패: ' + bankErr));

/* ② 레벨 판정 — `let level = 'Starter';` 부터 그 for 루프의 중괄호 짝까지 */
const lvAt = src.indexOf("let level = 'Starter';");
const forAt = lvAt >= 0 ? src.indexOf('for (', lvAt) : -1;
const lvBlk = forAt >= 0 ? balancedEnd(src, forAt, '{', '}') : null;
/* ⚠️ 블록«만» 자르면 `break` 가 for 밖에 놓여 SyntaxError 다 — for 문 전체를 가져온다. */
const lvBody = lvBlk ? src.slice(forAt, lvBlk.to) : null;
ok(!!lvBody, '레벨 판정 루프를 오려 냈다', lvBody ? '' : "let level = 'Starter' 앵커를 못 찾았습니다");

/* ③ 채점식(ai_score) — 그 줄을 통째로 */
const scoreLine = (src.match(/const ai_score = [^\n;]+;/) || [])[0] || null;
ok(!!scoreLine, '점수 계산식(ai_score)을 오려 냈다', scoreLine ? '' : '앵커를 못 찾았습니다');

if (!BANK || !lvBody || !scoreLine) {
  console.log('\n전제가 깨져 아래 검사를 돌릴 수 없습니다.');
  console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
  process.exit(1);
}

/* ── 사다리도 소스에서 읽는다(⛔ 손으로 적으면 사다리가 바뀔 때 여기만 옛것) ── */
const ladderSrc = readFileSync(join(ROOT, 'cloudflare-deploy/src/student-placement.ts'), 'utf8');
const ladderLit = sliceArrayAfterEq(ladderSrc, ladderSrc.indexOf('CEFR_LADDER'));
const ORDER = ladderLit ? new Function('return ' + ladderLit + ';')() : null;
ok(Array.isArray(ORDER) && ORDER.length > 0, '사다리(CEFR_LADDER)를 소스에서 읽었다');

const WEIGHT = Object.fromEntries(ORDER.map((L, i) => [L, i + 1]));

/* 오려 낸 판정 루프를 «그대로» 돌리는 함수 — 규칙이 바뀌면 이 검사도 그대로 따라온다 */
const decideLevel = new Function('CEFR_ORDER', 'totalByLevel', 'correctByLevel',
  "let level = 'Starter';\n" + lvBody + '\nreturn level;');
const calcScore = new Function('earned', 'maxScore', scoreLine.replace('const ai_score', 'const ai_score') + '\nreturn ai_score;');

/* ── 한 번 응시를 흉내낸다. 채점·판정은 위에서 «오려 낸 것» 을 쓴다 ── */
function attempt(rand, knowsAt) {
  const correctByLevel = {}, totalByLevel = {};
  for (const L of ORDER) { correctByLevel[L] = 0; totalByLevel[L] = 0; }
  let earned = 0, maxScore = 0;
  for (const item of BANK) {
    totalByLevel[item.cefr]++;
    maxScore += WEIGHT[item.cefr];
    const nChoices = (item.choices || []).length || 4;
    const p = knowsAt(item.cefr, nChoices);
    if (rand() < p) { correctByLevel[item.cefr]++; earned += WEIGHT[item.cefr]; }
  }
  return { level: decideLevel(ORDER, totalByLevel, correctByLevel), ai_score: calcScore(earned, maxScore) };
}
const seeded = (seed) => () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

console.log('\n① 문항 구성 — 표본이 레벨을 가를 만큼 있는가');
const perLevel = {};
for (const it of BANK) perLevel[it.cefr] = (perLevel[it.cefr] || 0) + 1;
const counts = ORDER.map(L => perLevel[L] || 0);
note('문항 ' + BANK.length + '개 · 레벨별 ' + ORDER.map((L, i) => L + ':' + counts[i]).join(' '));
ok(counts.every(c => c > 0), '모든 레벨에 문항이 있다', '레벨별: ' + counts.join(','));
ok(new Set(counts).size === 1, '레벨마다 문항 수가 같다(한 레벨만 유리·불리하지 않다)', '레벨별: ' + counts.join(','));
const choiceSizes = new Set(BANK.map(x => (x.choices || []).length));
ok(choiceSizes.size === 1, '선택지 수가 모든 문항에서 같다', '실측: ' + [...choiceSizes].join(','));
const nCh = [...choiceSizes][0] || 4;
const per = counts[0];
note('찍기 정답률 1/' + nCh + ' → 한 레벨 기대 정답 ' + (per / nCh).toFixed(2) + '개');

console.log('\n② 순수 찍기 — 아무렇게나 골라도 최상위가 나오는가');
/* ⛔ 「26.1%」 같은 값을 여기 적지 말 것 — 실제로 돌려서 잰다(이 검사가 생긴 이유). */
const N = 200000;
const guessCnt = {};
{
  const rand = seeded(20260922);
  for (let i = 0; i < N; i++) {
    const r = attempt(rand, (_L, n) => 1 / n);
    guessCnt[r.level] = (guessCnt[r.level] || 0) + 1;
  }
}
const topLevel = ORDER[ORDER.length - 1];
const guessTop = (guessCnt[topLevel] || 0) / N * 100;
const guessHigh = ORDER.slice(Math.ceil(ORDER.length / 2)).reduce((a, L) => a + (guessCnt[L] || 0), 0) / N * 100;
note('찍기 ' + N.toLocaleString() + '회 → ' + ORDER.map(L => L + ' ' + ((guessCnt[L] || 0) / N * 100).toFixed(2) + '%').join(' · '));
note('  최상위(' + topLevel + ') ' + guessTop.toFixed(3) + '% · 상위 절반 ' + guessHigh.toFixed(2) + '%');
ok(guessTop < 1, '찍기로 최상위가 나오는 비율이 1% 미만이다', '실측 ' + guessTop.toFixed(3) + '%');
ok(guessHigh < 5, '찍기로 상위 절반이 나오는 비율이 5% 미만이다', '실측 ' + guessHigh.toFixed(2) + '%');

console.log('\n③ 실력대로 나오는가 — 과대평가와 과소평가를 «짝으로» 본다');
/* ⚠️ 이 모델(아는 레벨 0.85 · 모르는 레벨은 찍기)은 «가정» 이다 — 실제 학생이 그렇다는 근거는
   없다(선생님 평가 0건). 그래서 이 숫자는 «절대 정확도» 가 아니라 «규칙을 바꿨을 때의 변화» 를
   보는 데 쓴다. ⛔ 이 값을 「우리 진단의 정확도는 N%」로 옮겨 적지 말 것. */
const KNOW = 0.85, M = 50000;
let over = 0, under = 0, exact = 0, far = 0, total = 0;
for (let t = 0; t < ORDER.length; t++) {
  const rand = seeded(777 + t);
  const cnt = {};
  for (let i = 0; i < M; i++) {
    const r = attempt(rand, (L) => (ORDER.indexOf(L) <= t ? KNOW : 1 / nCh));
    cnt[r.level] = (cnt[r.level] || 0) + 1;
  }
  for (const [lv, c] of Object.entries(cnt)) {
    const idx = ORDER.indexOf(lv);           // 'Starter' 는 -1 → 사다리 밖(아래쪽)
    const d = (idx < 0 ? -1 : idx) - t;
    total += c;
    if (d === 0) exact += c; else if (d > 0) over += c; else under += c;
    if (Math.abs(d) > 1) far += c;
  }
  const line = ORDER.map(L => ((cnt[L] || 0) / M * 100).toFixed(1).padStart(5)).join(' ');
  note('진짜 ' + ORDER[t].padEnd(3) + ' → ' + line + '   (Starter ' + (((cnt['Starter'] || 0) / M) * 100).toFixed(1) + '%)');
}
const pOver = over / total * 100, pUnder = under / total * 100, pExact = exact / total * 100, pFar = far / total * 100;
note('정확 ' + pExact.toFixed(1) + '% · 과대 ' + pOver.toFixed(1) + '% · 과소 ' + pUnder.toFixed(1) + '% · ±1 단계 밖 ' + pFar.toFixed(1) + '%');
/* 👉 한쪽만 재면 «맞바꿈» 이 숨는다. 문턱을 올리면 과대는 줄지만 과소가 커진다 — 그래서
      합친 오차(±1 밖)로 판정하고, 분해값은 위에 출력해 사람이 보게 한다. */
ok(pFar < 20, '±1 단계보다 멀리 벗어나는 비율이 20% 미만이다', '실측 ' + pFar.toFixed(1) + '%');
ok(pExact > 40, '자기 레벨이 그대로 나오는 비율이 40%를 넘는다', '실측 ' + pExact.toFixed(1) + '%');

console.log('\n④ 짝 — 다 아는 학생과 아무것도 모르는 학생');
{
  const rand = seeded(4242);
  let topHit = 0;
  for (let i = 0; i < 20000; i++) if (attempt(rand, () => 0.98).level === topLevel) topHit++;
  const p = topHit / 20000 * 100;
  note('전부 아는 학생(0.98) → 최상위 ' + p.toFixed(1) + '%');
  ok(p > 60, '실제로 다 아는 학생은 최상위로 나온다', '실측 ' + p.toFixed(1) + '%');
}
{
  const rand = seeded(2424);
  let starter = 0;
  for (let i = 0; i < 20000; i++) if (attempt(rand, () => 0.0).level === 'Starter') starter++;
  ok(starter === 20000, '한 문제도 못 맞히면 Starter 다', '실측 ' + starter + '/20000');
}

console.log('\n⑤ 점수와 레벨이 같은 방향인가 — 화면이 둘을 나란히 보여준다');
/* 📜 실측(D1 2026-09-21): 51점→A2 인데 50점→B1. 천장기법이라 점수와 레벨은 «다른 것» 을
   재므로 뒤집힘이 구조적으로 생긴다. ⛔ FAIL 로 만들지 않는다(규칙을 바꾸라는 뜻이 되어
   «사람이 정할 일» 을 검사가 대신 정하게 된다) — 대신 얼마나 생기는지 숫자로 남긴다. */
{
  const rand = seeded(31337);
  const rows = [];
  for (let i = 0; i < 20000; i++) {
    const t = Math.floor(rand() * ORDER.length);
    const r = attempt(rand, (L) => (ORDER.indexOf(L) <= t ? KNOW : 1 / nCh));
    rows.push(r);
  }
  let inv = 0, pairs = 0;
  for (let i = 0; i < rows.length; i += 2) {
    const a = rows[i], b = rows[i + 1];
    if (!b || a.ai_score === b.ai_score) continue;
    pairs++;
    const hi = a.ai_score > b.ai_score ? a : b, lo = a.ai_score > b.ai_score ? b : a;
    const hiIdx = ORDER.indexOf(hi.level), loIdx = ORDER.indexOf(lo.level);
    if (hiIdx < loIdx) inv++;
  }
  const pInv = inv / pairs * 100;
  note('두 학생을 견주면 «점수는 높은데 레벨은 낮은» 쌍이 ' + pInv.toFixed(1) + '% (' + inv.toLocaleString() + '/' + pairs.toLocaleString() + ')');
  note('  → 화면이 점수와 레벨을 나란히 보여줄 때 «이상해 보이는» 비율입니다(구조적 성질).');
  ok(pairs > 1000, '견줄 쌍을 충분히 만들었다(이 숫자가 헛돌지 않았다)', '쌍 ' + pairs);
}

console.log('\n⑥ 실측 재현 — D1 에 남은 값이 이 규칙으로 나올 수 있는가');
/* 📜 2026-09-21 D1: ysyt01 73점 C2 · jeong 64점 C2. 「점수가 낮은데 최상위」가 이 규칙에서
   가능한 일인지 본다(가능하다면 데이터 오염이 아니라 «규칙의 성질» 이다). */
{
  /* ⛔ 문턱을 여기 손으로 적지 말 것 — 그러면 규칙이 바뀌어도 이 숫자가 «50점» 에 굳는다
     (2026-09-22 변이시험에서 실제로 그 상태였다: 문턱을 3/4 로 올려도 50점 그대로). 
     오려 낸 «판정 함수» 에 모든 조합을 넣어 최상위가 나오는 최소 점수를 «찾는다». */
  const maxScore = BANK.reduce((a, it) => a + WEIGHT[it.cefr], 0);
  let best = null, bestMix = null;
  const mix = new Array(ORDER.length).fill(0);
  const walk = (i) => {
    if (i === ORDER.length) {
      const totalByLevel = {}, correctByLevel = {};
      let earned = 0;
      ORDER.forEach((L, k) => { totalByLevel[L] = per; correctByLevel[L] = mix[k]; earned += mix[k] * WEIGHT[L]; });
      if (decideLevel(ORDER, totalByLevel, correctByLevel) === topLevel) {
        if (best == null || earned < best) { best = earned; bestMix = [...mix]; }
      }
      return;
    }
    for (let c = 0; c <= per; c++) { mix[i] = c; walk(i + 1); }
  };
  walk(0);
  ok(best != null, '최상위에 닿는 조합이 실제로 있다(이 검사가 헛돌지 않았다)');
  const minTopScore = best == null ? null : Math.round(best / maxScore * 100);
  if (best != null) {
    note('최상위(' + topLevel + ')에 닿는 «가장 낮은» 점수 = ' + minTopScore + '점'
         + ' — 레벨별 정답 ' + ORDER.map((L, k) => L + ':' + bestMix[k]).join(' ') + ' (각 ' + per + '문항)');
    /* 👉 이 값이 낮을수록 «절반만 맞혀도 최상위» 라는 뜻이다. D1 실측(2026-09-21): 73점·64점이
          둘 다 C2 였다 — 규칙상 가능한 일이므로 데이터 오염이 아니라 «규칙의 성질» 이다. */
    /* ⛔ 이것을 FAIL 조건으로 두지 말 것 — 「64점 이하로 최상위가 나와야 한다」가 되어
       **규칙을 엄격하게 고치는 정당한 수리가 빨간불**이 된다(CLAUDE.md 「옛 값을 글자 그대로
       못 박아 강화한 수리에 FAIL」). 규칙이 바뀌면 이 관찰은 «역사» 가 되므로 숫자로만 남긴다.
       규칙이 후한지 엄한지는 ②(찍기)와 ③(과대·과소)이 판정한다. */
    note(minTopScore <= 64
      ? '  → 2026-09-21 D1 실측(ysyt01 73점 C2 · jeong 64점 C2)이 이 규칙으로 설명됩니다 — 데이터 오염이 아니라 규칙의 성질입니다.'
      : '  → 지금 규칙에서는 64점으로 최상위가 안 나옵니다. 2026-09-21 실측(64점 C2)은 «그때 규칙(각 레벨 2/4)» 의 결과입니다.');
  }
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail > 0) process.exit(1);
