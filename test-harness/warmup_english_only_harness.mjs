// 🇰🇷🇨🇳 수업 전 AI 웜업 — «영어만» 게이트 하니스 (2026-08-26)
//
//   왜 필요한가 —
//     사장님 제보: 「수업 전 AI 웜업」 첫 화면의 «🎯 오늘의 연습 포인트» 에
//     중국어 병음 "cāochǎng"·"shuāngyǎnpí" 가 떴다. 웜업은 영어 전용 화면이다.
//
//     뿌리는 «복습퀴즈 은행(review_quizzes)이 영어 전용 표가 아니다» 라는 사실이다.
//     실측(2026-08-26 D1): 활성 퀴즈 31건 중 15건이 중국어 교재 「다락원」이고,
//     그 안에 이런 문항이 있다 —
//         { type:'write', q:'다음 한자의 병음을 알파벳으로 쓰세요: (한자)',
//           answer_text:'cāochǎng', explain:'(한자) (cāochǎng) = 운동장' }
//     옛 판정은 `/[a-zA-Z]/.test(s)` 하나였다 = 「라틴 글자가 한 자라도 있으면 영어」.
//     병음은 라틴 글자로 적으므로 그 검사를 그대로 통과한다. 그래서 학생 jeong 이
//     다락원 퀴즈 28·30번에서 틀린 병음이 Neo4j 취약문장으로 적재되고,
//     영어 웜업 화면에 「오늘의 연습 포인트」로 되돌아 나왔다.
//
//   이 하니스가 못 박는 것 —
//     ① 판정이 한 파일(src/warmup-graph.ts)에만 있다 — 화면·다른 API 에 복사하지 않았다
//     ② ETL 세 입구(교재문장·재채점·detail)가 «모두» 그 게이트를 지난다
//     ③ 🔴 읽을 때도 한 번 더 거른다 — 이미 Neo4j 에 들어간 옛 데이터는 MERGE 라 안 사라진다
//     ④ 그래서 Cypher LIMIT 을 넉넉히 받아 온다 (5건이 전부 중국어면 걸러서 0건이 된다)
//     ⑤ 🔴 **게이트 함수를 컴파일해 실제로 돌린다** — 사장님 화면에 떴던 그 문자열 그대로.
//        문자열 검사는 「부르는가」만 볼 뿐 「무엇을 버리는가」는 못 본다
//        (CLAUDE.md 2장 「헬퍼에 행을 넘겼는데 아무 일도 안 일어남」).
//
//   실행: node test-harness/warmup_english_only_harness.mjs
import { readFileSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join, resolve } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dir);
const read = (p) => readFileSync(join(root, p), 'utf8');

let pass = 0, fail = 0;
const check = (name, ok) => { if (ok) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name); } };

/** 부정 검사(«이 글자가 없어야 한다»)는 주석을 벗긴 사본으로 판정한다 —
 *  왜 그렇게 고쳤는지 적은 설명 주석이 자기 검사에 걸린다
 *  (CLAUDE.md 2장 「하니스에 부정 검사를 넣었는데 내 주석 때문에 FAIL」). */
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const graphSrc = read('cloudflare-deploy/src/warmup-graph.ts');
const warmupHtml = read('cloudflare-deploy/public/warmup.html');
const graphCode = strip(graphSrc);

console.log('\n[ ① 판정 정본이 한 파일에 있다 ]');
check('warmup-graph.ts 가 isEnglishWarmupText 를 내보낸다',
  /export function isEnglishWarmupText/.test(graphSrc));
check('warmup-graph.ts 가 isEnglishWarmupQuestion 을 내보낸다',
  /export function isEnglishWarmupQuestion/.test(graphSrc));
check('⛔ 화면(warmup.html)에는 판정 규칙을 복사하지 않았다 (서버가 거른 것을 그대로 그린다)',
  !/isEnglishWarmup/.test(warmupHtml) && !/병음|pinyin/i.test(strip(warmupHtml)));

console.log('\n[ ② ETL 세 입구가 모두 게이트를 지난다 ]');
check('교재 문장 추출(extractSentences)이 문항 게이트를 먼저 지난다',
  /function extractSentences[\s\S]{0,400}?if \(!isEnglishWarmupQuestion\(q\)\) continue;/.test(graphCode));
check('교재 문장 추출이 글자 게이트로 판정한다',
  /function extractSentences[\s\S]{0,600}?if \(isEnglishWarmupText\(s\)/.test(graphCode));
check('구 데이터 재채점(regradeWrongs)이 문항 게이트를 지난다',
  /function regradeWrongs[\s\S]{0,700}?if \(!isEnglishWarmupQuestion\(q\)\) continue;/.test(graphCode));
check('구 데이터 재채점이 글자 게이트로 판정한다',
  /function regradeWrongs[\s\S]{0,1600}?if \(wrong && isEnglishWarmupText\(text\)\)/.test(graphCode));
check('신규 detail 추출(detailWrongs)이 글자 게이트로 판정한다',
  /function detailWrongs[\s\S]{0,1400}?if \(isEnglishWarmupText\(text\)\)/.test(graphCode));
/* 🔴 detail 행에는 정답 문자열만 남고 지문·선택지가 없다 — 원본 문항을 함께 넘기지 않으면
   성조부호 없는 병음(accept:['caochang'])이 «적재의 주 경로» 로 그대로 들어간다.
   (2026-08-26 trap-check 가 「detailWrongs 만 게이트가 한 겹」이라고 잡아 준 자리) */
check('🔴 detailWrongs 가 원본 문항(questions)을 함께 받아 문항 게이트도 태운다',
  /function detailWrongs\([\s\S]{0,300}?quizQuestions\?: string \| null/.test(graphCode)
  && /function detailWrongs[\s\S]{0,1200}?if \(q !== undefined && !isEnglishWarmupQuestion\(q\)\) continue;/.test(graphCode));
check('ETL 이 그 questions 를 실제로 넘긴다 (안 넘기면 위 게이트가 조용히 헛돈다)',
  /detailWrongs\(\{ user_id: r\.user_id, detail: r\.detail, created_at: r\.created_at \}, quiz\.textbook, quiz\.questions\)/.test(graphCode));
check('⛔ 옛 판정 `/[a-zA-Z]/` 이 코드에 하나도 안 남았다 (「라틴 글자 하나면 영어」)',
  !/\[a-zA-Z\]/.test(graphCode));

console.log('\n[ ③ 읽을 때도 거른다 — 이미 적재된 옛 데이터는 MERGE 라 안 사라진다 ]');
check('getWeakSentences 가 돌려주기 전에 글자 게이트로 거른다',
  /export async function getWeakSentences[\s\S]{0,1600}?\.filter\(\(w\) => isEnglishWarmupText\(w\.text\)\)/.test(graphCode));
check('④ 거르기 전에 넉넉히 받아 온다 (요청 5건이 전부 중국어면 0건이 된다)',
  /const fetchLimit = Math\.min\(safeLimit \* 4, 40\)/.test(graphCode)
  && /limit: fetchLimit,/.test(graphCode));
check('그래도 최종 건수는 요청한 만큼으로 자른다',
  /\.slice\(0, safeLimit\)/.test(graphCode));

console.log('\n[ ⑤ 문자범위를 소스에 직접 적지 않고 \\u 이스케이프로 쓴다 ]');
check('한자·가나 범위가 \\u 이스케이프다 (부정 검사 하니스가 그 글자를 잡는 사고 방지)',
  /const CJK_KANA_RE = \/\[\\u3040-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\]\//.test(graphSrc));
check('허용 문자 범위도 \\u 이스케이프다',
  /\/\^\[\\x20-\\x7E\\u2018\\u2019\\u201c\\u201d\\u2013\\u2014\\u2026\]\+\$\//.test(graphSrc));

/* 🔴 여기가 핵심이다 — 위 문자열 검사는 「부르는가」만 본다.
   「무엇을 버리는가」는 함수를 실제로 돌려야만 보인다.
   ⚠️ typescript 는 cloudflare-deploy/node_modules 에 있다(npm ci 가 먼저 돈다는 전제).
      없으면 이 묶음만 건너뛴다 — 하니스 전체가 죽는 것이 더 나쁘다. */
console.log('\n[ ⑥ 게이트를 컴파일해 실제 문항·문자열로 돌려 본다 ]');
let mod = null, tsWhy = '';
try {
  const ts = (await import(pathToFileURL(resolve(__dir, '../cloudflare-deploy/node_modules/typescript/lib/typescript.js')).href)).default;
  // teacher-match import 를 지운 사본을 돌린다 — 게이트는 그 모듈에 기대지 않는다
  const solo = graphSrc.replace(/^import .*from '\.\/teacher-match';$/m, '');
  const js = ts.transpileModule(solo, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  mod = await import('data:text/javascript;base64,' + Buffer.from(js, 'utf8').toString('base64'));
} catch (e) { tsWhy = e.message; }

if (!mod) {
  console.log('  ⏭ typescript 를 못 찾아 건너뜀 (' + String(tsWhy).slice(0, 90) + ')');
} else {
  const okText = (s) => mod.isEnglishWarmupText(s);
  const okQ = (q) => mod.isEnglishWarmupQuestion(q);

  console.log('  · 🔴 사장님 화면에 실제로 떴던 병음 (2026-08-26 스크린샷 · D1 퀴즈 28·30번)');
  check('"cāochǎng" 은 영어가 아니다', !okText('cāochǎng'));
  check('"shuāngyǎnpí" 는 영어가 아니다', !okText('shuāngyǎnpí'));
  check('D1 에 실재하는 나머지 병음도 전부 걸러진다',
    ['dìtiě', 'jīpiào', 'dìzhǐ', 'dòngwùyuán', 'diànhuà', 'yīyuàn', 'kělè', 'wéijīn']
      .every((w) => !okText(w)));

  console.log('  · 다른 문자 (한자·한글·가나)');
  check('한자 문장은 영어가 아니다', !okText('他叫金民浩。'));
  check('한글 문장은 영어가 아니다', !okText('새 학기가 시작되었어요.'));
  check('가나 문장은 영어가 아니다', !okText('こんにちは'));
  check('영어에 한글이 한 자만 섞여도 뺀다', !okText('I am a 학생'));

  console.log('  · 🔴 잘못 버리면 안 되는 것 (영어 취약문장이 사라지는 쪽도 나쁘다)');
  check('"I am a teacher" 는 남긴다', okText('I am a teacher'));
  check('"The ball is red" 는 남긴다', okText('The ball is red'));
  check('한 낱말 정답 "red" 도 남긴다 (BTS 2 «빨간색의 영어 단어를 쓰세요»)',
    okText('red'));
  check('축약형 "I\'m a doctor" 도 남긴다', okText("I'm a doctor"));
  check('물음표·쉼표가 있어도 남긴다', okText('How are you today, Mango?'));
  check('둥근 따옴표·대시가 섞여도 남긴다', okText('It’s a big — really big — dog…'));

  console.log('  · 가장자리');
  check('빈 값·null·숫자에 터지지 않는다',
    !okText('') && !okText(null) && !okText(undefined) && !okText('12345'));
  check('80자를 넘으면 뺀다 (문장이 아니라 지문 덩어리다)', !okText('a'.repeat(81)));
  check('앞뒤 공백은 다듬어 판정한다', okText('  My classroom  '));

  console.log('  · 문항 게이트 — 성조부호 없는 병음까지 막는 두 번째 겹');
  check('중국어 병음 문항은 통째로 뺀다 (성조 없는 accept 표기까지)',
    !okQ({ type: 'write', q: '한자의 병음을 알파벳으로 쓰세요',
           answer_text: 'caochang', accept: ['caochang'] }));
  check('선택지에 한자가 있으면 뺀다',
    !okQ({ type: 'choice', q: '알맞은 답을 고르세요', opts: ['操场', '医院'], answer: 0 }));
  check('해설에 「중국어」라고 적혀 있으면 뺀다',
    !okQ({ type: 'write', q: '다음 뜻의 단어를 쓰세요', answer_text: 'x', explain: '중국어 단어입니다' }));
  check('일본어 강의 문항도 뺀다',
    !okQ({ type: 'write', q: '다음 일본어 단어를 쓰세요', answer_text: 'x' }));
  check('🔴 한국어 지문의 «영어» 문항은 남긴다 (이 표의 문제 지문은 원래 한국어다)',
    okQ({ type: 'listen', q: '잘 듣고 알맞은 답을 고르세요.',
          opts: ['I am a teacher', 'I am a student'], answer: 0, audio_text: 'I am a teacher',
          explain: '교사라는 뜻의 영어 문장을 듣고 고르세요.' }));
  check('한 낱말 영어 정답 문항도 남긴다',
    okQ({ type: 'write', q: '빨간색의 영어 단어를 쓰세요:', answer_text: 'red', accept: ['Red'] }));
  check('빈 문항·null 에 터지지 않는다',
    okQ({}) === true && okQ(null) === false && okQ('x') === false);
  /* detail 경로가 실제로 막는 모양 — 성조 없는 병음은 글자 게이트를 «통과» 하므로
     문항 게이트가 없으면 그대로 적재된다. 그 전제 자체를 못 박아 둔다. */
  check('🔴 성조 없는 병음 "caochang" 은 글자 게이트를 통과한다 (그래서 문항 게이트가 필요하다)',
    okText('caochang') === true);
  check('그 문항을 함께 보면 막힌다',
    !okQ({ type: 'write', q: '한자의 병음을 알파벳으로 쓰세요', answer_text: 'caochang', accept: ['caochang'] }));
}

console.log('\n' + (fail ? '⚠ FAIL ' + fail + ' / PASS ' + pass : '✅ 전부 통과 (' + pass + '건)'));
process.exit(fail ? 1 : 0);
