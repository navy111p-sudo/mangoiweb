// -*- coding: utf-8 -*-
// 🔤 단어 퀴즈 깨진 글자(인코딩) 차단 하니스 (의존성 없음 · node 로 바로 실행)
//   실행:  node test-harness/vocab_encoding_guard_harness.mjs
//   대상:  cloudflare-deploy/src/api-games.ts 의 /api/vocab/gen-quiz 오답 선택지 생성
//
//   배경(2026-08-03 사고) — 학생 화면에 보기 하나가 「���� ����」로 떴습니다.
//     ① QA 계정(`__qa_vocab_...`)이 셸에서 한글을 인라인으로 넣어 EUC-KR 바이트가 그대로 저장됨
//        (CLAUDE.md §2 '셸에서 한글 POST' 함정)
//     ② 오답 풀 쿼리가 `user_id != ?` 라 **다른 사람 전부**를 긁어와 QA 데이터가 실제 학생 보기로 샘
//   ②가 진짜 원인 — 깨진 행을 지워도 테스트 계정이 또 생기면 재발합니다.
//   이 하니스는 그 두 겹의 방어가 코드에서 사라지지 않도록 고정합니다.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
const __dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(__dir, '../cloudflare-deploy/src/api-games.ts'), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond, extra) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name + (extra ? ` — ${extra}` : '')); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${cond ? '' : (extra ? ` — ${extra}` : '')}`);
}

// gen-quiz 핸들러 구간만 잘라서 본다 (다른 곳의 비슷한 코드에 속지 않도록)
const start = src.indexOf(`path === '/api/vocab/gen-quiz'`);
const end = src.indexOf(`path === '/api/vocab/quiz-submit'`);
const genQuiz = (start >= 0 && end > start) ? src.slice(start, end) : '';

console.log('\n[ A. 깨진 글자 판별 함수가 있는가 ]');
{
  check('isCleanText 가 정의돼 있다', /export function isCleanText/.test(src));
  // U+FFFD 한 글자라도 있으면 원본은 이미 복구 불가 — 화면에 내보내면 안 됩니다
  check('U+FFFD 를 실제로 검사한다', /isCleanText[\s\S]{0,600}fromCharCode\(0xFFFD\)/.test(src));
  // 소스에 리터럴로 박아 두면 파일 인코딩이 바뀌는 순간 검사가 조용히 무력화됩니다
  check('리터럴이 아니라 코드포인트로 만든다(인코딩 사고 방지)',
    /isCleanText[\s\S]{0,600}indexOf\(String\.fromCharCode\(0xFFFD\)\) === -1/.test(src));
  check('빈 문자열·null 도 걸러낸다', /isCleanText[\s\S]{0,600}if \(!t\) return false/.test(src));
}

console.log('\n[ B. DB 쿼리가 오염원을 걸러내는가 ]');
{
  check('gen-quiz 핸들러를 찾았다', genQuiz.length > 500, `길이 ${genQuiz.length}`);
  check('내 단어장 오답 풀에서 깨진 뜻을 제외한다 (char(65533))',
    /vocabulary WHERE user_id != \?[\s\S]{0,240}char\(65533\)/.test(genQuiz));
  check('내 단어장 오답 풀에서 내부(__) 계정을 제외한다',
    /vocabulary WHERE user_id != \?[\s\S]{0,300}user_id NOT LIKE '\\\\_\\\\_%' ESCAPE/.test(genQuiz),
    '테스트 계정 데이터가 실제 학생 보기로 새어 들어갑니다');
  check('어휘은행 오답 풀에서도 깨진 뜻을 제외한다',
    /en_vocab[\s\S]{0,240}ko NOT LIKE '%'\|\|char\(65533\)\|\|'%'/.test(genQuiz));
}

console.log('\n[ C. 코드에도 마지막 방어선이 있는가 — DB 필터를 빠져나온 값 대비 ]');
{
  check('남의 단어 오답에 isCleanText 를 건다', /const distractors = [\s\S]{0,160}isCleanText/.test(genQuiz));
  check('내 단어 오답에도 isCleanText 를 건다', /const myDistractors = [\s\S]{0,160}isCleanText/.test(genQuiz));
  check('정답(뜻)이 깨진 단어는 출제 자체를 건너뛴다',
    /if \(!isCleanText\(w\.korean\)\) continue/.test(genQuiz),
    '문제 자체가 읽을 수 없게 됩니다');
}

console.log('\n[ D. 다 걸러져 문제가 0개가 되면 안내로 돌려보내는가 ]');
{
  // 빈 배열을 ok:true 로 내보내면 화면이 '문제 0개짜리 결과창'으로 떨어집니다
  // (2026-08-04) 오류코드를 no_words / no_usable_words 로 나눴습니다 —
  //   "단어장이 빔" 과 "단어는 있는데 뜻이 없어 못 냄" 은 학생이 할 일이 다릅니다.
  //   여기서 지켜야 할 계약은 코드 이름이 아니라 'ok:true 로 내보내지 않는다' 입니다.
  const mqHtml = readFileSync(resolve(__dir, '../cloudflare-deploy/public/micro-quiz.html'), 'utf8');
  check('quizzes 가 비면 ok:false 로 응답한다',
    /if \(!quizzes\.length\)[\s\S]{0,400}?ok: false, error: '(no_words|no_usable_words)'/.test(genQuiz));
  check('클라이언트가 그 오류를 안내 화면으로 처리한다',
    /d\.error === 'no_words'/.test(mqHtml) && /d\.error === 'no_usable_words'/.test(mqHtml));
}

console.log('\n[ E. 들어오는 쪽(파일 업로드)의 인코딩 복구가 살아 있는가 ]');
{
  // 내보내는 쪽(isCleanText)만으로는 원본을 되살릴 수 없습니다.
  // 단어 일괄 업로드는 EUC-KR 로 저장된 파일을 다시 디코딩해 '깨지기 전'에 살려내는 유일한 지점이라
  // 이 폴백이 사라지면 한글 단어 파일이 통째로 깨져 들어옵니다.
  check('업로드 텍스트에서 깨짐을 감지한다', /한글 깨짐[\s\S]{0,120}EUC-KR 재시도/.test(src));
  check('깨짐이 많으면 EUC-KR 로 다시 디코딩한다',
    /TextDecoder\('euc-kr' as any\)\.decode\(buf\)/.test(src));
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`단어 퀴즈 인코딩 가드 하니스: ✅ ${PASS} 통과 / ❌ ${FAIL} 실패`);
if (FAIL) { console.log('\n실패 항목:'); FAILS.forEach((f) => console.log('  · ' + f)); }
process.exit(FAIL ? 1 : 0);
