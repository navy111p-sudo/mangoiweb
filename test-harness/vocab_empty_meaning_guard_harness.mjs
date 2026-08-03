// 단어 뜻(korean) 빈 값 방어 하니스 — 2026-08-03
//   배경: 운영 D1 vocabulary 163행 중 90행의 뜻이 빈 문자열이었다.
//         원인은 /api/vocab/auto-generate 가 AI 응답을 검증 없이 그대로 INSERT 한 것.
//         (AI 가 example 은 주고 korean 만 비워서 응답하는 경우가 실제로 있었다 — 시도 14회 중 9회)
//         뜻이 비면 gen-quiz 에서 영영 출제되지 않는데(뜻이 곧 정답 보기),
//         화면은 ok:true 를 받아 "성공"으로 판단하고 0점 결과창을 띄웠다 = 거짓 성공.
//   이 하니스는 (1) 빈 뜻이 저장되지 않는지 (2) 못 만들면 성공이라 하지 않는지 를 고정한다.
//   실행: node test-harness/vocab_empty_meaning_guard_harness.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const api = readFileSync(join(__dirname, '..', 'cloudflare-deploy', 'src', 'api-games.ts'), 'utf8');
const html = readFileSync(join(__dirname, '..', 'cloudflare-deploy', 'public', 'micro-quiz.html'), 'utf8');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : '')); }
}

// ── 1. auto-generate 의 뜻 필터를 소스에서 그대로 뽑아 실제로 돌려본다 ──
const fm = api.match(/words = words\.filter\(\(w: any\) => ([^\n]+?)\);/);
check('auto-generate: AI 응답 뜻 필터가 존재', !!fm);
if (fm) {
  const expr = fm[1];
  const keep = new Function('w', 'return !!(' + expr + ');');

  // 운영에서 실제로 관측된 실패 모양: word/example 은 있고 korean 만 빈 문자열
  check('빈 뜻("") 단어는 버려짐', keep({ word: 'cloud', korean: '', example: 'The cloud is blocking the sun.' }) === false);
  check('공백뿐인 뜻도 버려짐', keep({ word: 'pencil', korean: '   ', example: 'I need a pencil.' }) === false);
  check('korean 키 자체가 없어도 버려짐', keep({ word: 'big', example: 'This house is big.' }) === false);
  check('korean:null 도 버려짐', keep({ word: 'dog', korean: null, example: 'I have a dog.' }) === false);
  check('단어가 비면 버려짐', keep({ word: '', korean: '구름', example: 'x' }) === false);
  // 정상 응답은 반드시 살아남아야 한다 (과잉 차단 방지)
  check('정상 단어는 통과', keep({ word: 'nephew', korean: '조카', example: 'My nephew is very cute.' }) === true);
  check('예문이 없어도 뜻만 있으면 통과', keep({ word: 'sibling', korean: '형제, 자매' }) === true);

  // 관측된 실제 배치(10개 전부 뜻 없음) → 하나도 안 남아야 하고,
  // 그래야 뒤의 "폴백: 레벨별 기본 단어" 분기가 살아난다.
  const observed = ['cloud','friend','happy','pencil','run','big','book','cold','dog','eat']
    .map(w => ({ word: w, korean: '', example: 'example for ' + w }));
  check('관측된 실패 배치 10개 → 0개 생존', observed.filter(keep).length === 0);
  const mixed = [{ word:'apple', korean:'사과' }, { word:'cloud', korean:'' }, { word:'book', korean:'책' }];
  check('일부만 빈 경우 정상분만 생존', mixed.filter(keep).length === 2);
}

// ── 2. 저장 직전 이중 방어 + 폴백이 살아있는지 ──
check('auto-generate: 저장 직전 빈 뜻 차단', /if \(!korean\) \{ skippedNoMeaning\+\+; continue; \}/.test(api));
check('auto-generate: INSERT 에 검증된 korean 사용', /\.bind\(userId, word, korean, String\(w\.example \|\| ''\)\.trim\(\)/.test(api));
check('auto-generate: 응답에 skipped_no_meaning 노출', api.includes('skipped_no_meaning'));
check('auto-generate: 하드코딩 폴백 단어 유지', /words = fallback\[level\] \|\| fallback\['A2'\]/.test(api));
check('auto-generate: 폴백 단어에는 뜻이 있음', /\{ word:'apple', korean:'사과'/.test(api));

// ── 3. gen-quiz — 빈 뜻은 애초에 안 뽑고, 못 만들면 성공이라 하지 않는다 ──
check('gen-quiz: 내단어 조회에서 빈 뜻 제외(SQL)',
  /FROM vocabulary\s*\n?\s*WHERE user_id = \? AND korean IS NOT NULL AND TRIM\(korean\) != ''/.test(api));
check('gen-quiz: 빈 단어장 vs 출제불가 구분', api.includes("error: 'no_usable_words'") && api.includes("error: 'no_words'"));
check('gen-quiz: 0문항이면 ok:true 로 반환하지 않음', /if \(!quizzes\.length\) \{[\s\S]{0,400}?ok: false/.test(api));
check('gen-quiz: 오답 풀은 여전히 빈 뜻 제외(08-03 인코딩 조치 유지)',
  api.includes("korean IS NOT NULL AND korean != ''"));
// 거짓 성공 회귀 방지: 예전 코드는 조건 없이 ok:true 로 끝났다
const genQuiz = api.slice(api.indexOf("path === '/api/vocab/gen-quiz'"));
const tail = genQuiz.slice(0, genQuiz.indexOf("path === '/api/vocab/quiz-submit'"));
const okTrueIdx = tail.indexOf('ok: true, quizzes');
const guardIdx = tail.indexOf('if (!quizzes.length)');
check('gen-quiz: 0문항 가드가 ok:true 반환보다 앞에 있음', guardIdx > -1 && okTrueIdx > -1 && guardIdx < okTrueIdx, { guardIdx, okTrueIdx });

// ── 4. 한/영 동시 제공 (강사·학생 다국어) ──
check('gen-quiz: no_usable_words 한국어 안내', /message: '단어장에 단어는 있지만 뜻이 저장되지 않아/.test(api));
check('gen-quiz: no_usable_words 영어 안내', api.includes('message_en'));
check('gen-quiz: no_words 도 영어 안내 포함', /error: 'no_words',[\s\S]{0,200}message_en/.test(api));

// ── 5. 화면 — 0점 결과창으로 새지 않는지 ──
check('micro-quiz: no_usable_words 분기 처리', html.includes("d.error === 'no_usable_words'"));
check('micro-quiz: 안내용 emptyNote 요소 존재', html.includes('id="emptyNote"'));
check('micro-quiz: 문항 0개면 결과창 대신 안내', /if \(!quizzes\.length\) \{[\s\S]{0,300}?introMsg/.test(html));
check('micro-quiz: 서버 영문 메시지 사용', html.includes('d.message_en'));
// 회귀 방지: quizzes 를 준비한 뒤 곧장 renderQuiz 로 가버리면 0점 화면이 다시 생긴다
const prep = html.indexOf('quizzes = prepareQuizzes(d.quizzes)');
const guard = html.indexOf('if (!quizzes.length)', prep);
const render = html.indexOf('renderQuiz();', prep);
check('micro-quiz: 0문항 가드가 renderQuiz 앞에 있음', prep > -1 && guard > -1 && render > -1 && guard < render, { prep, guard, render });

console.log('\n' + (fail === 0 ? '✅ ALL PASS' : '❌ FAILURES') + `  (pass ${pass} / fail ${fail})`);
process.exit(fail === 0 ? 0 : 1);
