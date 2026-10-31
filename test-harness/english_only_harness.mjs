// 영어 학습 콘텐츠 «영어만» 게이트 하니스 — 웜업 + 게임 (2026-08-26)
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
//   실행: node test-harness/english_only_harness.mjs
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

const gateSrc  = read('cloudflare-deploy/src/english-only.ts');
const graphSrc = read('cloudflare-deploy/src/warmup-graph.ts');
const indexSrc = read('cloudflare-deploy/src/index.ts');
const warmupHtml = read('cloudflare-deploy/public/warmup.html');
const graphCode = strip(graphSrc);
const indexCode = strip(indexSrc);

console.log('\n[ ① 판정 정본이 전용 파일 «하나» 에 있다 ]');
check('src/english-only.ts 가 isEnglishText 를 내보낸다',
  /export function isEnglishText\(raw: unknown, maxLen = 80\)/.test(gateSrc));
check('src/english-only.ts 가 isEnglishQuestion 을 내보낸다',
  /export function isEnglishQuestion/.test(gateSrc));
check('warmup-graph.ts 는 그 정본을 import 해서 쓴다 (규칙을 다시 쓰지 않았다)',
  /import \{ isEnglishText, isEnglishQuestion \} from '\.\/english-only'/.test(graphSrc)
  && !/^const CJK_KANA_RE/m.test(graphCode));
check('index.ts 도 같은 정본을 import 한다 (웜업·게임이 한 규칙을 쓴다)',
  /import \{ isEnglishText, isEnglishQuestion \} from '\.\/english-only'/.test(indexSrc));
check('⛔ 규칙(문자범위)을 다른 파일에 복사하지 않았다',
  !/\\u3040-\\u30ff/.test(graphCode) && !/\\u3040-\\u30ff/.test(indexCode));
/* 📜 2026-09-13 — 웜업 화면에 «대화 언어» 축(영어/중국어)이 생겼습니다. 그래서 화면에는
   중국어 고정 인사말과 모델에게 보내는 지시문("Add pinyin …")이 «데이터로» 들어 있습니다.
   ⇒ 「pinyin 이라는 낱말이 있는가」는 더 이상 «판정 규칙을 복사했는가» 를 묻지 못합니다
      (그 낱말 하나로 멀쩡한 지시문이 빨간불이 됐습니다).
   ✅ 지켜야 할 것은 그대로입니다 — 화면이 «무슨 말인지 스스로 가리지» 않는다:
      ① 게이트 이름(isEnglishText/isEnglishQuestion)을 쓰지 않는다
      ② 언어를 가르는 «문자범위 정규식» 을 화면에 복사하지 않는다
   ⛔ 이 검사를 「중국어 글자가 없다」로 되돌리지 마세요 — 인사말이 실제로 중국어입니다.
   📜 2026-09-14 — ①도 «주석을 벗겨 낸 사본» 으로 판정하도록 고쳤습니다. 원문으로 보면
      「이 소재는 서버가 isEnglishText 로 걸러 영어만 준다」는 «왜 그렇게 했는지» 설명
      주석 한 줄에 빨간불이 났습니다(CLAUDE.md 2장 «부정 검사가 자기 주석을 잡는다»).
      ②는 처음부터 strip 을 쓰고 있었으니, 둘의 기준을 맞춘 것이기도 합니다.
      ✅ 지키는 것은 그대로입니다 — «코드가» 그 이름을 쓰면 여전히 빨간불입니다. */
const warmupHtmlC = strip(warmupHtml);
check('⛔ 화면(warmup.html)에는 판정 규칙을 복사하지 않았다 (서버가 거른 것을 그대로 그린다)',
  !/isEnglish/.test(warmupHtmlC)
  && !/\\u3040-\\u30ff|\\u4e00-\\u9fff|\\u3400-\\u9fff/.test(warmupHtmlC));

console.log('\n[ ② ETL 세 입구가 모두 게이트를 지난다 ]');
check('교재 문장 추출(extractSentences)이 문항 게이트를 먼저 지난다',
  /function extractSentences[\s\S]{0,400}?if \(!isEnglishQuestion\(q\)\) continue;/.test(graphCode));
check('교재 문장 추출이 글자 게이트로 판정한다',
  /function extractSentences[\s\S]{0,600}?if \(isEnglishText\(s\)/.test(graphCode));
check('구 데이터 재채점(regradeWrongs)이 문항 게이트를 지난다',
  /function regradeWrongs[\s\S]{0,700}?if \(!isEnglishQuestion\(q\)\) continue;/.test(graphCode));
check('구 데이터 재채점이 글자 게이트로 판정한다',
  /function regradeWrongs[\s\S]{0,1600}?if \(wrong && isEnglishText\(text\)\)/.test(graphCode));
check('신규 detail 추출(detailWrongs)이 글자 게이트로 판정한다',
  /function detailWrongs[\s\S]{0,1400}?if \(isEnglishText\(text\)\)/.test(graphCode));
/* 🔴 detail 행에는 정답 문자열만 남고 지문·선택지가 없다 — 원본 문항을 함께 넘기지 않으면
   성조부호 없는 병음(accept:['caochang'])이 «적재의 주 경로» 로 그대로 들어간다.
   (2026-08-26 trap-check 가 「detailWrongs 만 게이트가 한 겹」이라고 잡아 준 자리) */
check('🔴 detailWrongs 가 원본 문항(questions)을 함께 받아 문항 게이트도 태운다',
  /function detailWrongs\([\s\S]{0,300}?quizQuestions\?: string \| null/.test(graphCode)
  && /function detailWrongs[\s\S]{0,1200}?if \(q !== undefined && !isEnglishQuestion\(q\)\) continue;/.test(graphCode));
check('ETL 이 그 questions 를 실제로 넘긴다 (안 넘기면 위 게이트가 조용히 헛돈다)',
  /detailWrongs\(\{ user_id: r\.user_id, detail: r\.detail, created_at: r\.created_at \}, quiz\.textbook, quiz\.questions\)/.test(graphCode));
check('⛔ 옛 판정 `/[a-zA-Z]/` 이 코드에 하나도 안 남았다 (「라틴 글자 하나면 영어」)',
  !/\[a-zA-Z\]/.test(graphCode));

console.log('\n[ ③ 읽을 때도 거른다 — 이미 적재된 옛 데이터는 MERGE 라 안 사라진다 ]');
check('getWeakSentences 가 돌려주기 전에 글자 게이트로 거른다',
  /export async function getWeakSentences[\s\S]{0,1600}?\.filter\(\(w\) => isEnglishText\(w\.text\)\)/.test(graphCode));
check('④ 거르기 전에 넉넉히 받아 온다 (요청 5건이 전부 중국어면 0건이 된다)',
  /const fetchLimit = Math\.min\(safeLimit \* 4, 40\)/.test(graphCode)
  && /limit: fetchLimit,/.test(graphCode));
check('그래도 최종 건수는 요청한 만큼으로 자른다',
  /\.slice\(0, safeLimit\)/.test(graphCode));

/* 🎮 게임 쪽 (2026-08-26 사장님 「게임 쪽도 고쳐줘」) — 같은 표를 읽는 index.ts 세 곳.
   실측: 다락원 활성 문항 178개 중 라틴 글자를 가진 것 14개가 «전부 단일 낱말 병음» 이고
   (dìtiě·jīpiào·cāochǎng·shuāngyǎnpí…), 두 낱말 이상은 0개다.
   그래서 낱말 수 하한이 없는 handleGamesVocab 이 그 14개를 영어 게임 문장으로 내보냈다. */
console.log('\n[ ④-2 게임 API 세 곳도 같은 게이트를 지난다 ]');
check('warmupLessonContext 가 문항·글자 게이트를 지난다 (웜업 AI 프롬프트)',
  /async function warmupLessonContext[\s\S]{0,2600}?if \(!isEnglishQuestion\(q\)\) continue;[\s\S]{0,300}?if \(isEnglishText\(s\)/.test(indexCode));
check('handleGamesVocab 의 pushSentence 가 글자 게이트를 쓴다 (길이 상한 90 유지)',
  /const pushSentence[\s\S]{0,700}?if \(!isEnglishText\(s, 90\)\) return;/.test(indexCode));
check('handleGamesVocab 이 문항 게이트도 지난다',
  /async function handleGamesVocab[\s\S]{0,3000}?if \(!isEnglishQuestion\(q\)\) continue;[\s\S]{0,200}?pushSentence\(/.test(indexCode));
check('학생 단어장(vocabulary)도 게이트를 지난다 (길이 상한 30 유지)',
  /if \(!ko \|\| !isEnglishText\(en, 30\)\) continue;/.test(indexCode));
check('handleGamesLessons 의 영어 갈래가 문항·글자 게이트를 지난다',
  /if \(!isEnglishQuestion\(q\)\) continue;[\s\S]{0,260}?if \(!isEnglishText\(en, 90\)\) continue;/.test(indexCode));
check('⛔ 낱말 수 하한으로 풀지 않았다 (영어 정답이 한 낱말인 문항이 많다)',
  !/isEnglishText\([^)]*\)[\s\S]{0,120}?split\(\/\\s\+\/\)[\s\S]{0,60}?length < 2/.test(indexCode));

/* 🔗 레벨 폴백 — 웜업과 게임이 «같은 조건» 이어야 한다 (2026-08-26 사장님 지시로 맞춤).
   review_quizzes 는 영어 전용 표가 아니라, 이 조건이 없으면 「그 레벨의 아무 교재나」가
   걸린다. 실측: level='Lv 3' 인 활성 퀴즈는 전부 중국어 교재 「다락원」이다. */
console.log('\n[ ④-2-b 레벨 폴백이 웜업과 같은 조건이다 ]');
const lvlFallbacks = indexCode.match(/tries\.push\(\{ sql: `SELECT questions FROM review_quizzes WHERE active=1 AND LOWER\(level\)=LOWER\(\?\)[^`]*`/g) || [];
check('review_quizzes 를 레벨로 긁는 자리가 «둘» 이다 (웜업 · 게임)',
  lvlFallbacks.length === 2);
check('🔴 둘 다 «교재에 안 묶인 문제은행» 으로 한정한다 (한쪽만 빠지면 엉뚱한 교재가 걸린다)',
  lvlFallbacks.length === 2
  && lvlFallbacks.every((q) => /AND \(textbook IS NULL OR textbook=''\)/.test(q)));
check('건수 상한은 자리마다 그대로 둔다 (웜업 2 · 게임 4)',
  lvlFallbacks.some((q) => /LIMIT 2`$/.test(q)) && lvlFallbacks.some((q) => /LIMIT 4`$/.test(q)));
check('⛔ 중국어 표(zh_vocab·zh_passage)의 레벨 조건은 건드리지 않았다',
  /FROM zh_vocab[\s\S]{0,400}?LOWER\(level\)=LOWER/.test(indexCode)
  || /LOWER\(level\)=LOWER[\s\S]{0,400}?FROM zh_vocab/.test(indexCode));

console.log('\n[ ④-3 영어 «코스 목록» 에서 중국어 교재를 뺀다 ]');
/* 🔴 문장을 걸러도 코스 목록은 안 고쳐진다 — 목록은 review_quizzes 를 통째로 훑는다.
   실측: 다락원이 활성 15건으로 최대 → 목록 1위 → courses[0] 이 기본 코스라
   교재 미배정 학생(현재 students_erp 29,417명 전원)에게 기본 코스가 다락원이 된다. */
check('zh_vocab 을 「중국어 교재」 이름표로 읽는다 (새 규칙을 만들지 않았다)',
  /const zhCourses = new Set<string>\(\)/.test(indexCode)
  && /SELECT DISTINCT textbook FROM zh_vocab/.test(indexCode));
check('영어 갈래일 때만 그 조회를 한다',
  /if \(glang !== 'zh'\) \{[\s\S]{0,200}?zh_vocab/.test(indexCode));
check('그 이름표로 영어 코스 목록에서 걸러 낸다',
  /if \(zhCourses\.has\(rawTb\.toLowerCase\(\)\)[\s\S]{0,80}?\) continue;/.test(indexCode));
/* 🔴 정확일치만 보면 「다락원 001」 같은 이름이 들어오는 순간 «에러 없이» 헛돈다.
   (2026-08-26 trap-check 가 짚어 준 자리 — 파싱된 코스명도 함께 본다) */
check('원문과 «파싱된 코스명» 을 둘 다 본다 (정확일치만 보면 조용히 헛돈다)',
  /zhCourses\.has\(rawTb\.toLowerCase\(\)\) \|\| zhCourses\.has\(p\.course\.trim\(\)\.toLowerCase\(\)\)/.test(indexCode));
check('parseEn 을 먼저 부른 뒤에 거른다 (p.course 가 있어야 위 판정이 선다)',
  indexCode.indexOf('const p = parseEn(rawTb);') < indexCode.indexOf('if (zhCourses.has(rawTb.toLowerCase())'));
check('그 조회에 상한을 뒀다 (표가 커져도 무제한으로 읽지 않는다)',
  /SELECT DISTINCT textbook FROM zh_vocab[^`]*LIMIT 200/.test(indexCode));

/* 🔴 한 번 틀리게 적었다가 정정한 자리다 — count 는 «퀴즈 건수» 가 아니라
   «그 코스로 묶이는 distinct textbook 문자열 수»(cc.count = cc.keys.length).
   다락원은 문자열이 하나라 count=1 이고 «기본 코스» 가 되지 않는다.
   심각도를 부풀린 문장이 코드 주석·규칙서에 박히면 다음 사람이 엉뚱한 것을 고친다. */
check('⛔ 「기본 코스가 다락원이었다」로 되돌아가지 않았다 (정정된 사실이 코드 주석에 남아 있다)',
  /count 는 «퀴즈 건수» 가 아니라/.test(indexSrc)
  && !/기본 코스가 다락원/.test(indexCode));
check('⛔ zh_vocab 조회가 실패해도 영어 목록이 멈추지 않는다 (try/catch)',
  /try \{[\s\S]{0,400}?SELECT DISTINCT textbook FROM zh_vocab[\s\S]{0,400}?\} catch \{\}/.test(indexCode));
check('⛔ 교재 «이름» 을 보고 중국어라고 짐작하지 않는다',
  !/다락원/.test(indexCode));

console.log('\n[ ⑤ 문자범위를 소스에 직접 적지 않고 \\u 이스케이프로 쓴다 ]');
check('한자·가나 범위가 \\u 이스케이프다 (부정 검사 하니스가 그 글자를 잡는 사고 방지)',
  /const CJK_KANA_RE = \/\[\\u3040-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\]\//.test(gateSrc));
check('허용 문자 범위도 \\u 이스케이프다',
  /\/\^\[\\x20-\\x7E\\u2018\\u2019\\u201c\\u201d\\u2013\\u2014\\u2026\]\+\$\//.test(gateSrc));

/* 🔴 여기가 핵심이다 — 위 문자열 검사는 「부르는가」만 본다.
   「무엇을 버리는가」는 함수를 실제로 돌려야만 보인다.
   ⚠️ typescript 는 cloudflare-deploy/node_modules 에 있다(npm ci 가 먼저 돈다는 전제).
      없으면 이 묶음만 건너뛴다 — 하니스 전체가 죽는 것이 더 나쁘다. */
console.log('\n[ ⑥ 게이트를 컴파일해 실제 문항·문자열로 돌려 본다 ]');
let mod = null, tsWhy = '';
try {
  const ts = (await import(pathToFileURL(resolve(__dir, '../cloudflare-deploy/node_modules/typescript/lib/typescript.js')).href)).default;
  const js = ts.transpileModule(gateSrc, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  mod = await import('data:text/javascript;base64,' + Buffer.from(js, 'utf8').toString('base64'));
} catch (e) { tsWhy = e.message; }

if (!mod) {
  console.log('  ⏭ typescript 를 못 찾아 건너뜀 (' + String(tsWhy).slice(0, 90) + ')');
} else {
  const okText = (s, n) => mod.isEnglishText(s, n);
  const okQ = (q) => mod.isEnglishQuestion(q);

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

  console.log('  · 🎮 게임 — D1 다락원 활성 문항에서 실제로 나온 라틴 글자 14개 (전부 병음)');
  const REAL_PINYIN = ['dìtiě','jīpiào','dìzhǐ','dòngwùyuán','diànhuà','yīyuàn','kělè',
                       'cāochǎng','wéijīn','shuāngyǎnpí','lánqiú','yùxí','túshūguǎn','Hànyǔ'];
  check('14개 전부 게임 상한(90)에서도 탈락한다',
    REAL_PINYIN.every((w) => !okText(w, 90)));
  check('단어장 상한(30)에서도 탈락한다',
    REAL_PINYIN.every((w) => !okText(w, 30)));
  check('길이 상한은 부르는 쪽이 정한다 (웜업 80 · 게임 90)',
    okText('x'.repeat(85), 90) === true && okText('x'.repeat(85)) === false);
  check('게임의 영어 문장은 상한이 90 이라 그대로 통과한다',
    okText('I visited my grandparents last weekend and we cooked dinner together.', 90));
}

console.log('\n' + (fail ? '⚠ FAIL ' + fail + ' / PASS ' + pass : '✅ 전부 통과 (' + pass + '건)'));
process.exit(fail ? 1 : 0);
