// ═══════════════════════════════════════════════════════════════════════
// 🧪 quiz_quality_harness — AI 가 만든 복습퀴즈 문항 검사기 (src/quiz-quality.ts)
//
// [무엇을 지키는가 — 2026-09-02]
//   `rqAiGenerate` 의 영어 갈래는 프롬프트로 규칙을 **지시만** 하고 결과를 한 번도
//   확인하지 않았다. 이 저장소의 반복 실측은 「지시만으로는 안 지켜진다」이고
//   (판단력 「Want play with me」·AI친구 전보문), 복습퀴즈는 학생이 **정답으로 외우는**
//   문장이라 더 나쁘다. 이 하네스가 그 검사기를 지킨다.
//
// [⛔ 문자열로 검사하지 않는다]
//   검사기의 결함은 「함수도 값도 있는데 답이 틀린」 모양이다. 그래서 정본을 번들해
//   **실제로 돌린다.** 그리고 두 방향을 «짝으로» 본다:
//     · 잡아야 할 것을 잡는가          (놓치면 깨진 문항이 학생에게 나간다)
//     · **멀쩡한 것을 안 잡는가**       (거짓 양성이면 은행이 영영 안 채워진다)
//   한쪽만 검사하면 「전부 떨어뜨리는 검사기」도 초록불이 된다.
// ═══════════════════════════════════════════════════════════════════════
import { readFileSync, mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CF = join(ROOT, 'cloudflare-deploy');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');

let PASS = 0, FAIL = 0, SKIP = 0; const FAILS = [];
function check(name, cond, extra) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${!cond && extra ? '\n       ↳ ' + String(extra).slice(0, 200) : ''}`);
}
function skip(n) { SKIP++; console.log(`  ⏭ ${n}`); }

console.log('\n═══ 복습퀴즈 문항 검사기 ═══');

/* ═══ A. 정본을 번들해 실제로 돌린다 ═══════════════════════════════ */
console.log('\n[ A. 잡아야 할 것을 잡는가 ]');
let esbuildApi = null;
try { esbuildApi = createRequire(join(CF, 'package.json'))('esbuild'); } catch {}
let M = null;
if (!esbuildApi) skip('esbuild 없음 — 실행 검증 생략(정적 검사만 유효)');
else {
  const out = join(mkdtempSync(join(tmpdir(), 'qq-')), 'q.mjs');
  let ok = true;
  try {
    esbuildApi.buildSync({ entryPoints: [join(CF, 'src', 'quiz-quality.ts')], bundle: true,
      format: 'esm', platform: 'neutral', outfile: out, logLevel: 'silent' });
  } catch (e) { ok = false; console.log('       ↳ ' + String(e).slice(0, 200)); }
  check('quiz-quality.ts 를 번들해 실제로 돌릴 수 있다', ok);
  if (ok) M = await import('file://' + out.replace(/\\/g, '/'));
}

const LOW = 'Lv 1';    // 기초 — 3~5단어, 문법 검사 켜짐
const MID = 'Lv 13';   // 초중급 — 8~12단어

if (M) {
  const bad = (q, level, must) => {
    const rs = M.checkQuizQuestion(q, level);
    const hit = rs.some((r) => r.indexOf(must) >= 0);
    check(`잡는다 — ${must}`, hit, rs.length ? rs.join(' / ') : '(아무것도 안 잡음)');
  };

  /* 🎧 프롬프트가 요구만 하고 아무도 확인 안 하던 것 — 정답이 보기에 없으면
     학생은 무엇을 골라도 틀린다. 화면·서버 어디에도 에러가 안 난다. */
  bad({ type: 'listen', q: '들으세요', audio_text: 'I like apples.',
        opts: ['I like bananas.', 'She is tall.', 'We run fast.', 'He is kind.'], answer: 0 },
      MID, '들려준 문장이 보기에 없습니다');

  bad({ type: 'listen', q: '들으세요', audio_text: 'I like apples.',
        opts: ['I like bananas.', 'I like apples.', 'We run.', 'He is kind.'], answer: 0 },
      MID, '정답 번호가 들려준 문장을 가리키지 않습니다');

  bad({ type: 'choice', q: '고르세요', opts: ['a', 'b', 'c', 'd'], answer: 7 },
      MID, '정답 번호가 보기 범위 밖입니다');

  bad({ type: 'choice', q: '고르세요', opts: ['cat', 'cat', 'dog', 'bird'], answer: 0 },
      MID, '같은 보기가 두 번 나옵니다');

  bad({ type: 'choice', q: '고르세요', opts: ['cat', '', 'dog', 'bird'], answer: 0 },
      MID, '빈 보기가 있습니다');

  bad({ type: 'write', q: '쓰세요', answer_text: '' }, MID, '정답 문장(answer_text)이 없습니다');

  /* 🈶 영어 학생에게 병음·한자가 나가면 안 된다 — 정본 isEnglishQuestion */
  bad({ type: 'write', q: '쓰세요', answer_text: '你好' }, MID, '중국어');

  /* 📏 레벨 규격 — 기초(Lv 1)에 긴 문장 */
  bad({ type: 'speak', q: '읽으세요',
        answer_text: 'Yesterday I went to the amusement park with my whole family and we rode everything.' },
      LOW, '너무 깁니다');

  /* 🔴 전보문 의문문 — 「Do you have a dog?」가 「You have dog?」로 나오는 그 사고 */
  bad({ type: 'listen', q: '들으세요', audio_text: 'You have dog?',
        opts: ['You have dog?', 'I am fine.', 'He runs.', 'We go.'], answer: 0 },
      LOW, '문법이 깨진 의문문입니다');

  bad({ type: 'speak', q: '읽으세요', answer_text: 'Dog is big?' }, LOW, '문법이 깨진 의문문입니다');

  bad({ type: 'nonsense', q: 'x' }, MID, '모르는 문항 종류');

  /* ═══ B. 멀쩡한 것을 안 잡는가 — 거짓 양성이 더 무섭다 ═══════════ */
  console.log('\n[ B. 멀쩡한 문항을 떨어뜨리지 않는가 (거짓 양성) ]');
  const good = [
    ['기초 듣기', { type: 'listen', q: '🎧 잘 듣고 알맞은 답을 고르세요.', audio_text: 'I like cats.',
       opts: ['I like cats.', 'I like dogs.', 'She is tall.', 'We run fast.'], answer: 0, explain: '고양이를 좋아해요.' }, LOW],
    ['기초 쓰기', { type: 'write', q: '다음 뜻의 영어 문장을 쓰세요: 나는 배고파요.', answer_text: 'I am hungry.',
       accept: ["I'm hungry."], explain: '배고프다' }, LOW],
    ['기초 말하기', { type: 'speak', q: '🎤 아래 문장을 또박또박 읽어보세요.', answer_text: 'I go to school.', explain: '학교에 가요' }, LOW],
    ['기초 객관식', { type: 'choice', q: '「사과」는 영어로?', opts: ['apple', 'banana', 'grape', 'melon'], answer: 0, explain: '사과' }, LOW],
    ['기초 올바른 의문문', { type: 'speak', q: '읽으세요', answer_text: 'Do you have a dog?' }, LOW],
    ['기초 Is 의문문', { type: 'speak', q: '읽으세요', answer_text: 'Is the dog big?' }, LOW],
    ['중급 긴 문장', { type: 'write', q: '쓰세요', answer_text: 'I visited my grandmother last weekend.' }, MID],
    ['레벨 모름(길이 검사 안 함)', { type: 'speak', q: '읽으세요',
       answer_text: 'Yesterday I went to the amusement park with my whole family and we rode everything.' }, ''],
  ];
  for (const [name, q, lv] of good) {
    const rs = M.checkQuizQuestion(q, lv);
    check(`통과 — ${name}`, rs.length === 0, rs.join(' / '));
  }

  /* ⛔ 정본 계약: 전보문 검사는 «기초(plain)» 에서만. 상급으로 넓히면
     「So you like dogs?」 같은 구어체를 잡는다(CLAUDE.md 명시).
     ⚠️ 이 한 줄은 «이중 안전» 이다 — 정본 aiFriendBrokenQuestions 자신이 첫 줄에서
        `if (!spec.plain) return []` 로 막으므로, 우리 쪽 plain 조건을 지워도 결과는 같다.
        즉 **변이시험으로는 이 검사가 확인되지 않는다.** 그래도 남기는 이유는,
        정본이 언젠가 그 가드를 옮기면 여기서 바로 드러나게 하기 위해서다. */
  const collo = M.checkQuizQuestion({ type: 'speak', q: '읽으세요', answer_text: 'So you like dogs?' }, 'Lv 31');
  check('⛔ 상급 레벨에서는 구어체 의문문을 잡지 않는다', collo.length === 0, collo.join(' / '));

  /* ═══ C. 묶음 거르기 ══════════════════════════════════════════ */
  console.log('\n[ C. 묶음 거르기 ]');
  const set = [
    { type: 'write', q: '쓰세요', answer_text: 'I am happy.' },
    { type: 'write', q: '쓰세요(다른 지문)', answer_text: 'I am happy.' },        // 같은 정답 → 중복
    { type: 'choice', q: '고르세요', opts: ['a', 'b', 'c', 'd'], answer: 9 },     // 범위 밖
    { type: 'speak', q: '읽으세요', answer_text: 'We play soccer.' },
  ];
  const f = M.filterQuizQuestions(set, MID);
  check(`통과 2 · 탈락 2 (통과 ${f.kept.length} · 탈락 ${f.dropped.length})`,
    f.kept.length === 2 && f.dropped.length === 2, JSON.stringify(f.dropped));
  check('중복을 「같은 문항이 이미 있습니다」로 잡는다',
    f.dropped.some((d) => d.reasons.some((r) => r.indexOf('이미 있습니다') >= 0)));
  check('탈락 이유에 몇 번째 문항인지 남는다', f.dropped.every((d) => Number.isInteger(d.index)));
  check('요약 문구를 만든다', typeof M.summarizeRejects(f.dropped) === 'string' && M.summarizeRejects(f.dropped).length > 0,
    M.summarizeRejects(f.dropped));
  check('빈 입력·이상한 입력에도 던지지 않는다',
    M.filterQuizQuestions(null).kept.length === 0 && M.filterQuizQuestions([null, 3, 'x']).dropped.length === 3);
}

/* ═══ D. 배선 ═════════════════════════════════════════════════ */
console.log('\n[ D. 배선 ]');
/* ⚠️ 부정 검사(«이 글자가 없어야 한다»)는 반드시 주석을 벗긴 사본으로 한다 —
   「왜 그렇게 안 했는지」 적은 설명 주석이 자기 자신을 잡는다(이 하네스도 실제로 잡혔다).
   ⛔ 블록주석을 정규식 한 줄로 지우면 안 된다(짝 없는 별표+슬래시 하나에 뒤가 통째로
      사라진다 — CLAUDE.md 함정). 줄 단위로 «지금 블록주석 안인가» 를 추적한다. */
function stripComments(src) {
  const out = []; let inBlock = false;
  for (let line of String(src).split('\n')) {
    if (inBlock) {
      const e = line.indexOf('*' + '/');
      if (e < 0) { out.push(''); continue; }
      line = line.slice(e + 2); inBlock = false;
    }
    for (;;) {
      const b = line.indexOf('/' + '*');
      if (b < 0) break;
      const e = line.indexOf('*' + '/', b + 2);
      if (e < 0) { line = line.slice(0, b); inBlock = true; break; }
      line = line.slice(0, b) + line.slice(e + 2);
    }
    out.push(line.replace(/^[ \t]*\/\/.*$/, ''));
  }
  return out.join('\n');
}
const games = rd('cloudflare-deploy/src/api-games.ts');
const gamesCode = stripComments(games);

/* 🔴 중국어에 걸면 전부 떨어진다 — 검사기는 영어용(isEnglishQuestion)이고
   중국어는 이미 zh_vocab 그라운딩으로 「목록 밖 글자 금지」가 걸려 있다. */
check('중국어는 검사를 건너뛴다 (걸면 전부 떨어진다)',
  /if \(isZh\) return \{ ok: true as const, questions: parsed\.list/.test(games));
check('영어 갈래는 filterQuizQuestions 를 실제로 통과시킨다',
  /const f = filterQuizQuestions\(parsed\.list, o\.level\)/.test(games) && /questions: f\.kept/.test(games));

/* 🎓 학생이 기다리는 경로 — 다 떨어져도 «고장» 처럼 보이면 안 된다 */
const autoStart = games.indexOf("path === '/api/review-quiz/auto'");
const autoEnd = games.indexOf("/api/admin/review-quiz/ai-generate", autoStart);
const autoBody = autoStart > 0 && autoEnd > autoStart ? games.slice(autoStart, autoEnd) : '';
check('학생 즉석 출제 핸들러를 찾았다', autoBody.length > 500);
check('  통과 문항이 0이면 한 번 더 출제한다', /검사 통과 문항 0/.test(autoBody) && /gen = await rqAiGenerate/.test(autoBody));
check('  그래도 0이면 «퀴즈 없음»(ok:true, quiz:null)으로 답한다 — 화면이 이미 아는 모양',
  /quality_blocked: true/.test(autoBody) && /quiz: null/.test(autoBody));
const autoCode = autoBody ? stripComments(autoBody) : '';
check('  ⛔ 502 + 영문 코드로 답하지 않는다 (학생에게 「고장」으로 읽힌다)',
  !/quiz_quality_failed/.test(autoCode), autoCode.slice(-260));

/* 🏗️ 관리자 — 무엇이 왜 걸렸는지 보여야 프롬프트·레벨을 고칠 수 있다 */
check('관리자 미리보기가 탈락 이유를 함께 돌려준다',
  /dropped_summary: summarizeRejects/.test(games) && /raw_count/.test(games));
check('은행 생성이 탈락 수를 응답에 싣는다',
  (games.match(/dropped: dropped\.length/g) || []).length >= 2);

const q4 = rd('cloudflare-deploy/public/js/adm-q4.js');
check('관리자 화면이 «검사에서 N개 제외» 를 보여준다', /검사에서 .*개 제외/.test(q4));
check('  은행 생성도 탈락 수를 누적해 보여준다', /droppedAll/.test(q4) && /data\.dropped/.test(q4));
check('  낡은 배포 안내(deploy.bat)를 고쳤다', !/deploy\.bat/.test(q4));

/* 🗂️ 공동 금지구역을 안 건드렸는가 — 학생 화면은 index.html 의 blocking 스크립트다 */
check('⛔ index.html·idx-x8.js 를 건드리지 않았다 (공동 금지구역·첫 화면 예산)',
  !/quality_blocked/.test(stripComments(rd('cloudflare-deploy/public/js/idx-x8.js'))));

console.log('\n====================================================');
console.log(`🎯 총 ${PASS + FAIL}건 중 ✅ ${PASS} 통과 / ❌ ${FAIL} 실패 (건너뜀 ${SKIP})`);
if (FAIL) { console.log('실패 항목:'); FAILS.forEach((f) => console.log('  - ' + f)); process.exitCode = 1; }
else console.log('🎉 복습퀴즈 문항 검사기 전부 통과');
console.log('====================================================');
