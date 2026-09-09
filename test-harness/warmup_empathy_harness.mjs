// warmup_empathy_harness.mjs — 「힘들다고 했는데 AI 가 칭찬한다」를 막는 두 겹 (2026-09-09)
//
// ── 왜 ──────────────────────────────────────────────────────────────────────
// 사장님 제보 —
//   학생: `I don't like school`
//   Emma: `Haha nice! What do you like to do after school?`
//   「학교를 좋아하지 않는다고 했는데 nice 라는 답변은 일반적이지 않아 보임.」
//
// 뿌리는 «규칙» 이었다. 웜업 프롬프트에 [칭찬] 은 있고 [공감] 이 없었고, 돌려 쓸 말 목록에
// **「Haha nice!」가 실제로 들어 있었다.** AI 영어친구는 더 세다 — 「영어로 쓰면 SHORT cheer 로
// 시작하라」에 조건이 아예 없다. 즉 모델은 규칙을 지킨 것이고, 지어낸 말이 아니었다.
//
// ── 이 하니스가 못 박는 것 ──────────────────────────────────────────────────
//   A. 정본(src/warmup-empathy.ts)을 **타입 제거로 실제 실행** — 사장님 화면의 그 문장 그대로
//   B. «떼는가» 와 «함부로 안 떼는가» 를 **짝으로** 본다
//      ⚠️ 앞만 보면 전부 떼는 코드도 통과하고, 뒤만 보면 아무것도 안 떼는 코드도 통과한다.
//   C. 공감 말머리(Oh / Don't worry / Sorry)는 **떼지 않는다** — 그건 지금 «맞는» 말이다
//   D. 🔗 **두 프롬프트의 «돌려 쓸 칭찬» 목록을 소스에서 읽어** 전부 CHEER_LEADS 에 있는지 대조
//      (프롬프트에 새 칭찬을 추가하고 목록에 안 넣으면 그 말만 조용히 안 걸린다)
//   E. 배선 — 두 화면이 «같은 판정» 을 쓰고, 저장(히스토리·D1) «전» 에 지나간다
//      ⚠️ 뒤에 두면 학생이 본 문장과 모델이 다음 턴에 보는 문장이 어긋난다.
//   F. fail-open — 이 모듈은 절대 던지지 않는다(여기서 던지면 멀쩡한 대화가 500 이 된다)
//
// ⚠️ 문자열 검사로는 이 사고를 원리상 못 잡는다 — 함수도 값도 전부 «있는» 채로
//    «무슨 말이 나오는가» 만 틀린다. 그래서 A~D 는 전부 «실행» 이다.
//
// 실행: node test-harness/warmup_empathy_harness.mjs

import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = join(ROOT, 'cloudflare-deploy/src');
const MOD = readFileSync(join(SRC_DIR, 'warmup-empathy.ts'), 'utf8');
const INDEX = readFileSync(join(SRC_DIR, 'index.ts'), 'utf8');
const AI = readFileSync(join(SRC_DIR, 'api-ai.ts'), 'utf8');

let PASS = 0, FAIL = 0;
const check = (name, cond, detail = '') => {
  if (cond) PASS++; else FAIL++;
  console.log(`  ${cond ? '✅' : '❌'} ${name}${cond || !detail ? '' : '  — ' + detail}`);
};

console.log('┌────────────────────────────────────────────────');
console.log('│ 💛 웜업·AI친구 공감 — 힘들다는 아이에게 칭찬으로 시작하지 않기');
console.log('├────────────────────────────────────────────────');

/* ── D. 두 프롬프트의 «돌려 쓸 칭찬» 을 소스에서 읽는다 (대조용) ──────────── */
function cheersFromWarmup() {
  const line = (INDEX.match(/"\[칭찬\][^"]*"/) || [])[0] || '';
  const tail = line.split('돌려 쓰고')[0];
  // 「Wow!, Awesome!, …」 처럼 «영문 + 종결부호 + 쉼표» 로 나열된 것만 뽑는다
  return (tail.match(/[A-Za-z][A-Za-z' ]*[!.?]/g) || [])
    .map((s) => s.replace(/[!.?]+$/, '').trim().toLowerCase()).filter(Boolean);
}
function cheersFromFriend() {
  const i = AI.indexOf('Rotate freely:');
  if (i < 0) return [];
  const tail = AI.slice(i + 'Rotate freely:'.length).split('\n')[0];
  return (tail.match(/[A-Za-z][A-Za-z' ]*[!.?]/g) || [])
    .map((s) => s.replace(/[!.?]+$/, '').trim().toLowerCase()).filter(Boolean);
}
const promptCheers = [...new Set([...cheersFromWarmup(), ...cheersFromFriend()])];
check('D-0 두 프롬프트에서 «돌려 쓸 칭찬» 목록을 실제로 읽어 냈다 (5개 이상)',
  promptCheers.length >= 5, `읽은 것: ${promptCheers.length}개`);

/* ── A~C·F. 정본을 타입 제거로 «실제로» 돌린다 ─────────────────────────── */
const tmp = mkdtempSync(join(tmpdir(), 'wemp-'));
writeFileSync(join(tmp, 'warmup-empathy.ts'), MOD);
const runner = `
  import { studentSoundsNegative, stripCheerLead, applyEmpathyGuard, CHEER_LEADS,
           WARMUP_EMPATHY_RULE, FRIEND_EMPATHY_RULE } from './warmup-empathy.ts';
  const out = [];
  const eq = (name, got, want) => out.push([name, got === want, JSON.stringify(got)]);

  // ── A. 사장님 화면의 그 턴을 그대로 ──────────────────────────────────────
  eq('A-1 「I don\\'t like school」 을 부정으로 본다', studentSoundsNegative("I don't like school"), true);
  eq('A-2 그 턴의 답장에서 「Haha nice!」 를 떼어 낸다',
     applyEmpathyGuard("I don't like school", 'Haha nice! What do you like to do after school?'),
     'What do you like to do after school?');
  eq('A-3 떼고 나서 첫 글자가 대문자다',
     /^[A-Z]/.test(applyEmpathyGuard("I don't like school", 'Haha nice! what do you like?')), true);

  // ── B. «떼는가» 와 «함부로 안 떼는가» 는 짝이다 ─────────────────────────
  eq('B-1 학생이 긍정이면 칭찬을 그대로 둔다',
     applyEmpathyGuard('I like school!', 'Haha nice! What do you like to do after school?'),
     'Haha nice! What do you like to do after school?');
  eq('B-2 「I like school」 은 부정이 아니다', studentSoundsNegative('I like school'), false);
  eq('B-3 「That is not bad」 를 부정으로 오해하지 않는다', studentSoundsNegative("That's not bad"), false);
  eq('B-4 「I want to play」 는 부정이 아니다', studentSoundsNegative('I want to play soccer'), false);
  eq('B-5 부정이어도 칭찬이 «없으면» 문장을 안 건드린다',
     applyEmpathyGuard('I hate math', 'Oh, really? What part is hard?'), 'Oh, really? What part is hard?');
  eq('B-6 칭찬 뒤 종결부호가 없으면 «문장의 일부» 라 안 뗀다',
     applyEmpathyGuard('I hate math', 'Nice sentence you wrote there.'), 'Nice sentence you wrote there.');
  eq('B-7 통째로 칭찬뿐이면 원문 유지(빈 말풍선 금지)',
     applyEmpathyGuard('I hate math', 'Wow! Awesome!'), 'Wow! Awesome!');

  // ── C. 공감 말머리는 떼지 않는다 ────────────────────────────────────────
  for (const [i, s] of [['C-1','Oh, really? That is okay. What part is hard?'],
                        ['C-2',"Don't worry! We can try together."],
                        ['C-3','Sorry to hear that. What happened?'],
                        ['C-4','No worries. Tell me more.'],
                        ['C-5','I see. What was hard?']]) {
    eq(i + ' 공감 말머리는 그대로 둔다: ' + s.slice(0, 18), applyEmpathyGuard('I hate school', s), s);
  }

  // ── 한국어 신호 ─────────────────────────────────────────────────────────
  for (const [i, s] of [['K-1','학교 가기 싫어요'],['K-2','너무 힘들어요'],['K-3','재미없어'],
                        ['K-4','오늘 너무 피곤해'],['K-5','영어 어려워요']]) {
    eq(i + ' 한국어 부정 신호: ' + s, studentSoundsNegative(s), true);
  }
  eq('K-6 「재미있어요」 는 부정이 아니다', studentSoundsNegative('오늘 재미있어요'), false);

  // ── 이모지가 앞에 붙어도 뗀다 (모델이 자주 붙인다) ──────────────────────
  eq('E-1 이모지+칭찬도 떼어 낸다',
     applyEmpathyGuard('I hate school', '🎉 Great job! What happened today?'), 'What happened today?');

  // ── F. 절대 던지지 않는다 ───────────────────────────────────────────────
  let threw = false;
  try { studentSoundsNegative(null); stripCheerLead(undefined); applyEmpathyGuard(null, null);
        studentSoundsNegative({ toString() { throw new Error('boom'); } });
        stripCheerLead({ toString() { throw new Error('boom'); } }); } catch (e) { threw = true; }
  eq('F-1 이상한 값을 넣어도 던지지 않는다 (여기서 던지면 대화가 500 이 된다)', threw, false);
  eq('F-2 모르는 값이면 «고치기 전» 과 같다(원문 유지)', applyEmpathyGuard(null, 'Wow! Hi.'), 'Wow! Hi.');

  // ── D. 프롬프트의 칭찬이 전부 목록에 있는가 ─────────────────────────────
  const cheers = ${JSON.stringify(promptCheers)};
  const missing = cheers.filter((c) => stripCheerLead(c + '! Tell me more.') === (c + '! Tell me more.'));
  out.push(['D-1 두 프롬프트가 돌려 쓰라고 적은 칭찬을 «전부» 떼어 낸다', missing.length === 0,
            '못 떼는 것: ' + JSON.stringify(missing)]);

  // 목록에 «공감 말» 이 섞여 들어가지 않았는가 (섞이면 위 C 가 무너진다)
  const bad = ['oh', "don't worry", 'no worries', 'sorry', 'i see', 'really', 'okay', "that's okay"]
    .filter((w) => CHEER_LEADS.map(String).includes(w));
  out.push(['D-2 CHEER_LEADS 에 «공감 말» 이 섞여 있지 않다', bad.length === 0, JSON.stringify(bad)]);

  // ── 규칙 문구가 실제로 내용을 담고 있는가 ───────────────────────────────
  out.push(['G-1 웜업 규칙이 «칭찬으로 시작하지 마» 를 말한다',
            /\\[공감\\]/.test(WARMUP_EMPATHY_RULE) && /칭찬/.test(WARMUP_EMPATHY_RULE), '']);
  out.push(['G-2 친구 규칙이 영어이고 cheer 를 금지한다',
            /do NOT open with a cheer/i.test(FRIEND_EMPATHY_RULE), '']);

  console.log(JSON.stringify(out));
`;
writeFileSync(join(tmp, 'run.mjs'), runner);
const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', join(tmp, 'run.mjs')], { encoding: 'utf8' });
rmSync(tmp, { recursive: true, force: true });
if (r.status !== 0) {
  check('A-0 정본 실행(타입 제거) — 실패하면 아래 검사가 통째로 뜻을 잃으므로 통과시키지 않는다', false);
  console.log(r.stderr.slice(0, 900));
} else {
  check('A-0 정본 실행(타입 제거)', true);
  const line = r.stdout.trim().split('\n').filter((l) => l.startsWith('[[')).pop();
  for (const [name, okv, det] of JSON.parse(line)) check(name, okv, det);
}

/* ── E. 배선 — 두 화면이 같은 판정을 «저장 전» 에 쓴다 ─────────────────────
   ⚠️ 「그 이름이 파일에 있는가」로 보면 주석·import 만 남겨도 통과한다.
      그래서 «호출 모양» 으로 세고, «어디에 있는가» 를 위치로 본다. */
const callIdx = (src, re) => { const m = src.match(re); return m ? src.indexOf(m[0]) : -1; };

const wCall = callIdx(INDEX, /applyEmpathyGuard\(\s*studentInput\s*,\s*aiText\s*\)/);
const wSave = INDEX.indexOf('// ── 히스토리 갱신(최근 N턴만) + 6시간 TTL 저장 ──');
check('E-1 웜업이 정본을 부른다 — 학생 발화로 판정하고 답장을 다듬는다', wCall >= 0);
check('E-2 웜업: 히스토리에 «저장하기 전» 에 지난다 (화면과 기억이 어긋나지 않게)',
  wCall >= 0 && wSave >= 0 && wCall < wSave, `call=${wCall} save=${wSave}`);
check('E-3 웜업 프롬프트에 [공감] 규칙이 실려 있다',
  /WARMUP_EMPATHY_RULE,/.test(INDEX) && INDEX.includes("import { applyEmpathyGuard, WARMUP_EMPATHY_RULE }"));

const aCall = callIdx(AI, /applyEmpathyGuard\(\s*msg\s*,\s*reply\s*\)/);
const aSave = AI.indexOf("INSERT INTO ai_friend_chats");
check('E-4 AI 영어친구도 «같은» 정본을 부른다 (한쪽만 고치면 화면마다 답이 달라진다)', aCall >= 0);
check('E-5 친구: D1 에 «저장하기 전» 에 지난다', aCall >= 0 && aSave >= 0 && aCall < aSave, `call=${aCall} save=${aSave}`);
check('E-6 친구 프롬프트에 FRIEND_EMPATHY_RULE 이 실려 있다', /\$\{FRIEND_EMPATHY_RULE\}/.test(AI));
/* 판정이 두 벌이 되지 않았는가 — 정본은 한 파일뿐이어야 한다 */
const dupes = [INDEX, AI].filter((s) => /function\s+studentSoundsNegative|function\s+stripCheerLead/.test(s));
check('E-7 판정을 화면 쪽에 복제하지 않았다 (정본은 warmup-empathy.ts 한 곳)', dupes.length === 0);

console.log('├────────────────────────────────────────────────');
console.log(`│ 💛 warmup_empathy_harness — PASS ${PASS} / FAIL ${FAIL}`);
console.log('└────────────────────────────────────────────────');
process.exit(FAIL ? 1 : 0);
