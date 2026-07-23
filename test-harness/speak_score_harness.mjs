/**
 * 🗣 따라 말하기 채점 정확도 하니스 — 2026-07-23
 *
 * 예전 채점은 "목표 단어가 몇 개 들렸나"(단어 집합 포함)라서 순서도, 잘못 말한 것도 안 봤다.
 *   목표 "I have a dog" 인데 "I have a cat" → 75점 → 통과  ← 실제로 통과하고 있었다.
 *
 * 새 채점(js/mangoi-speak-score.js)은 업계 표준(Azure Pronunciation Assessment, Speechace)처럼
 * **기준 문장과 단어 단위로 정렬**해서 누락·삽입·치환을 구분하고, 억양/인식 흔들림은 구제한다.
 *
 * 이 하니스가 지키는 두 가지 (둘 다 깨지면 안 된다):
 *   ① 뜻이 달라지는 실수는 반드시 잡는다 (dog → cat)
 *   ② 억양·인식기 흔들림은 틀렸다고 하지 않는다 (dog → dawg, 관사 누락)
 *
 * 실행: node test-harness/speak_score_harness.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = process.env.MANGOI_PUB || join(ROOT, 'cloudflare-deploy', 'public');

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  ❌ ' + name + (detail ? '\n       ' + detail : '')); }
}

const sandbox = { console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(PUB, 'js', 'mangoi-speak-score.js'), 'utf8'), sandbox);
const S = sandbox.MangoiScore;

/* ══ 1. 뜻이 달라지는 실수는 반드시 잡는다 ══ */
console.log('\n▶ 뜻이 달라지는 실수 (예전에 통과하던 것들)');
{
  const cases = [
    ['I have a dog',                    'I have a cat',                     'dog→cat'],
    ['I like blue cars',                'I like blue bikes',                'cars→bikes'],
    ['She goes to school every morning','She goes to work every morning',   'school→work'],
    ['My father is a doctor',           'My mother is a doctor',            'father→mother'],
    ['I want some water',               'I want some coffee',               'water→coffee'],
  ];
  for (const [t, said, label] of cases) {
    const r = S.grade(said, t);
    check(`${label} → 통과시키지 않음`, r.pass === false, `점수=${r.score} 통과=${r.pass} 팁="${r.tip}"`);
    check(`${label} → 무엇이 틀렸는지 알려줌`, /→|로 말했어요/.test(r.tip) || r.tip.length > 0, `팁="${r.tip}"`);
  }
}

/* ══ 2. 정확히 말한 것은 반드시 통과한다 ══ */
console.log('\n▶ 정확히 말한 경우');
{
  const T = 'I have a dog';
  const oks = [
    ['그대로',            'I have a dog'],
    ['소문자',            'i have a dog'],
    ['문장부호 붙음',      'I have a dog.'],
    ['느낌표 여러 개',     'I have a dog!!!'],
    ['앞뒤 군더더기',      'um I have a dog you know'],
    ['세션 끊겨 이어붙임',  'I have a dog'],
  ];
  for (const [label, said] of oks) {
    const r = S.grade(said, T);
    check(`${label} → 통과`, r.pass === true, `점수=${r.score}`);
  }
  check('정확히 말하면 100점', S.grade('I have a dog', T).score === 100, String(S.grade('I have a dog', T).score));
}

/* ══ 3. 억양·인식기 흔들림은 구제한다 (아이가 억울하면 안 된다) ══ */
console.log('\n▶ 억양·인식 흔들림 구제');
{
  const soft = [
    ['dog → dawg',        'I have a dawg',        'I have a dog'],
    ['blue → blew',       'I like blew cars',     'I like blue cars'],
    ['관사 a 누락',        'I have dog',           'I have a dog'],
    ['to 누락',           'She goes school every morning', 'She goes to school every morning'],
    ['school → skool',    'She goes to skool every morning', 'She goes to school every morning'],
  ];
  for (const [label, said, t] of soft) {
    const r = S.grade(said, t);
    check(`${label} → 통과(억울하지 않게)`, r.pass === true, `점수=${r.score} 팁="${r.tip}" 상태=${JSON.stringify(r.counts)}`);
  }
  check('dawg 는 dog 와 같은 소리로 본다', S.soundsClose('dog', 'dawg') === true);
  check('cat 은 dog 와 다른 소리로 본다', S.soundsClose('dog', 'cat') === false);
  check('bikes 는 cars 와 다른 소리로 본다', S.soundsClose('cars', 'bikes') === false);
}

/* ══ 4. 반만 말했거나 엉뚱한 말은 실패한다 ══ */
console.log('\n▶ 미완성·엉뚱한 발화');
{
  const bad = [
    ['절반만',      'I have',            'I have a dog'],
    ['한 단어만',   'dog',               'I have a dog'],
    ['완전 딴말',   'hello how are you', 'I have a dog'],
    ['빈 발화',     '',                  'I have a dog'],
  ];
  for (const [label, said, t] of bad) {
    const r = S.grade(said, t);
    check(`${label} → 실패`, r.pass === false, `점수=${r.score}`);
  }
}

/* ══ 5. 단어별 결과를 돌려준다 (Speechace 의 word-level 피드백에 해당) ══ */
console.log('\n▶ 단어별 결과');
{
  const r = S.grade('I have a cat', 'I have a dog');
  const map = r.words.map(w => w.w + ':' + w.status).join(' ');
  check('단어별 상태를 준다', r.words.length === 4, map);
  check('맞은 단어는 ok', /I:ok/i.test(map), map);
  check('틀린 단어는 wrong', /dog:wrong/.test(map), map);
  check('무슨 소리로 들렸는지 준다', (r.words.find(w => w.status === 'wrong') || {}).heard === 'cat', map);

  const r2 = S.grade('I have dog', 'I have a dog');
  check('빠뜨린 단어는 missing', r2.words.some(w => w.w === 'a' && w.status === 'missing'),
        r2.words.map(w => w.w + ':' + w.status).join(' '));

  const r3 = S.grade('I have a dawg', 'I have a dog');
  check('소리만 비슷하면 close', r3.words.some(w => w.w === 'dog' && w.status === 'close'),
        r3.words.map(w => w.w + ':' + w.status).join(' '));
}

/* ══ 6. 완성도(Completeness)를 따로 준다 ══ */
console.log('\n▶ 정확도 / 완성도 분리 (Azure 방식)');
{
  const r = S.grade('I have', 'I have a dog');
  check('절반만 말하면 완성도 0.5', Math.abs(r.completeness - 0.5) < 0.01, String(r.completeness));
  const r2 = S.grade('I have a dog', 'I have a dog');
  check('다 말하면 완성도 1.0', Math.abs(r2.completeness - 1) < 0.01, String(r2.completeness));
}

/* ══ 7. 예전 방식이었다면 실패했을 것 (역검증 대신 직접 비교) ══ */
console.log('\n▶ 예전 방식과 비교');
{
  const oldScore = (said, target) => {
    const norm = (s) => String(s).toLowerCase().replace(/[.,!?]/g, '').trim();
    const tw = norm(target).split(/\s+/).filter(Boolean), sw = norm(said).split(/\s+/);
    let h = 0; tw.forEach(w => { if (sw.indexOf(w) >= 0) h++; });
    return h / tw.length;
  };
  const old = oldScore('I have a cat', 'I have a dog');
  const now = S.grade('I have a cat', 'I have a dog');
  check('예전 방식은 통과시켰다(0.6 기준)', old >= 0.6, `옛점수=${(old * 100).toFixed(0)}`);
  check('새 방식은 막는다', now.pass === false, `새점수=${now.score}`);
  // 순서를 바꿔 말한 경우 — 예전 방식은 100점, 새 방식은 정렬로 잡는다
  const oldRev = oldScore('dog a have I', 'I have a dog');
  const nowRev = S.grade('dog a have I', 'I have a dog');
  check('예전 방식은 어순이 뒤죽박죽이어도 만점', oldRev === 1, String(oldRev));
  check('새 방식은 어순도 본다', nowRev.score < 100, `새점수=${nowRev.score}`);
}

/* ══ 8. 화면 배선 — 따라 말하기 두 곳이 실제로 새 채점기를 쓰는가 ══ */
console.log('\n▶ 화면 배선');
for (const f of ['index.html', 'student-games.html']) {
  const h = readFileSync(join(PUB, f), 'utf8');
  check(`${f} — 채점 모듈 인클루드`, /mangoi-speak-score\.js/.test(h));
  check(`${f} — _shadowGrade 로 판정`, /_shadowGrade\(said/.test(h));
  check(`${f} — 옛 0.6 단독 판정이 남아 있지 않음`,
        !/_shadowScore\(said,\s*text\)\s*>=\s*0\.6/.test(h), '옛 판정이 그대로 남음');
  check(`${f} — 모듈이 없으면 옛 방식으로 폴백`, /return \{ sc: [sv], pass: [sv] >= 0\.6/.test(h));
  check(`${f} — 틀린 단어를 화면에 알려줌`, /g\.tip/.test(h));
}

console.log('\n' + '═'.repeat(64));
console.log(`  ✅ PASS ${pass}    ❌ FAIL ${fail}`);
if (failures.length) { console.log('\n  실패 목록:'); failures.forEach(f => console.log('   - ' + f)); }
console.log('═'.repeat(64));
process.exit(fail ? 1 : 0);
