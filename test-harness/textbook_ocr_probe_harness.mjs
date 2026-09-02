// ═══════════════════════════════════════════════════════════════════════
// 🧪 textbook_ocr_probe_harness — 교재 본문 추출 시험 (src/textbook-ocr.ts)
//
// [무엇을 지키는가 — 2026-09-02]
//   교재가 활성 17,246행 중 17,199장이 이미지라(2026-09-02 D1 실측) 복습퀴즈·웜업이 쓸 «본문» 이 한 글자도 없다.
//   OCR 로 뽑을 수 있는지 재 보는 것이 그 파일이고, 이 하네스가 그 «판정» 을 지킨다.
//
//   🔴 이 시험에서 제일 위험한 결함은 «못 읽는 것» 이 아니라
//      **«설명문을 본문으로 세는 것»** 이다. 비전 모델은 못 읽으면 조용히 실패하지 않고
//      「The image shows a page with some text」를 토한다. 그것을 성공으로 세면
//      「OCR 이 된다」는 결론이 통째로 거짓이 되고, 그 거짓 위에 본격 추출을 설계하게 된다.
//
// [⛔ 문자열로 검사하지 않는다]
//   결함이 「함수도 값도 있는데 답이 틀린」 모양이라, 정본을 번들해 **실제로 돌린다.**
//   그리고 두 방향을 «짝으로» 본다 —
//     · 설명문·잡음을 걸러내는가        (놓치면 시험 결과가 거짓이 된다)
//     · **진짜 교재 본문을 안 버리는가**  (거짓 양성이면 「OCR 이 안 된다」는 반대 거짓)
//   한쪽만 검사하면 「전부 0을 돌려주는 판정기」도 초록불이 된다.
// ═══════════════════════════════════════════════════════════════════════
import { readFileSync, mkdtempSync, existsSync } from 'node:fs';
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
  console.log(`  ${cond ? '✅' : '❌'} ${name}${!cond && extra ? '\n       ↳ ' + String(extra).slice(0, 240) : ''}`);
}
function skip(n) { SKIP++; console.log(`  ⏭ ${n}`); }

/** 주석을 «줄 단위로» 벗긴다.
 *  ⛔ 블록주석을 정규식 한 줄(/\*[\s\S]*?\*\/)로 지우지 말 것 — 문자열 안의 짝 없는
 *     «별표+슬래시» 하나에 그 뒤가 통째로 사라진다(이 저장소가 실제로 두 번 밟았다). */
function stripComments(t) {
  const out = []; let inBlock = false;
  for (let line of t.split('\n')) {
    let res = '', i = 0;
    while (i < line.length) {
      if (inBlock) {
        const e = line.indexOf('*/', i);
        if (e < 0) { i = line.length; } else { inBlock = false; i = e + 2; }
      } else {
        const b = line.indexOf('/*', i), l = line.indexOf('//', i);
        if (l >= 0 && (b < 0 || l < b)) { res += line.slice(i, l); i = line.length; }
        else if (b >= 0) { res += line.slice(i, b); inBlock = true; i = b + 2; }
        else { res += line.slice(i); i = line.length; }
      }
    }
    out.push(res);
  }
  return out.join('\n');
}

console.log('\n═══ 교재 본문 추출 시험 ═══');

/* ═══ A. 정본을 번들해 실제로 돌린다 ═══════════════════════════════ */
console.log('\n[ A. 설명문·잡음을 걸러내는가 ]');
let esbuildApi = null;
try { esbuildApi = createRequire(join(CF, 'package.json'))('esbuild'); } catch {}
let M = null;
if (!esbuildApi) skip('esbuild 없음 — 실행 검증 생략(정적 검사만 유효)');
else {
  const out = join(mkdtempSync(join(tmpdir(), 'tbocr-')), 'm.mjs');
  let ok = true;
  try {
    esbuildApi.buildSync({ entryPoints: [join(CF, 'src', 'textbook-ocr.ts')], bundle: true,
      format: 'esm', platform: 'neutral', outfile: out, logLevel: 'silent' });
  } catch (e) { ok = false; console.log('       ↳ ' + String(e).slice(0, 240)); }
  check('textbook-ocr.ts 를 번들해 실제로 돌릴 수 있다', ok);
  if (ok) M = await import('file://' + out.replace(/\\/g, '/'));
}

const ENG = { id: 'x', label: 'x', shape: 'bytes' };

if (M) {
  /* ── 설명문 감지 — 비전 모델의 전형적인 실패 ─────────────────── */
  const prose = [
    'The image shows a textbook page with several sentences.',
    'The page contains four short sentences.',
    'This image contains a page from a children’s English book.',
    'This picture shows a worksheet.',
    'It appears to be a worksheet with pictures.',
    'It seems to be a page from a workbook.',
    'Here is the text from the image:',
    'Here is the transcription:',
    'Here\'s the text:',
    'I can see a page with the words "cat" and "dog".',
    'I see the text on the page.',
    'I cannot read the text in this image.',
    'Sure! Here is the text.',
    'Of course! Here is what I read.',
  ];
  for (const p of prose) {
    check(`설명문으로 본다 — ${p.slice(0, 42)}...`, M.looksLikeProse(p) === true);
  }

  /* 🔴 짝 검사 — 여기가 이 하네스의 심장이다.
     설명문과 교재 본문은 **구조가 똑같다.** 시작하는 낱말만 보면 반드시 한쪽이 무너진다:
     좁히면 진짜 사고를 놓치고, 넓히면 멀쩡한 본문을 버려 「OCR 이 안 된다」는 반대 거짓이 난다.
     아래는 위 설명문 목록과 **짝을 이루는** 교재 문장들이다 — 실제로 BTS 에 나오는 모양. */
  const realBody = [
    'I can see a bird.\nThe bird is blue.',     // 짝: 'I can see a page with...'
    'I see a red apple.',                        // 짝: 'I can see a picture...'
    'It looks good.',                            // 짝: 'It appears to be a worksheet.'
    'It seems easy!',                            // 짝: 'It seems to be a page.'
    'Sure!',                                     // 짝: 'Sure! Here is the text.' (교재 대화문)
    'Of course, I will help you.',               // 짝: 'Of course! Here is...'
    'Here is my book.',                          // 짝: 'Here is the text from the image:'
    'Here is the ball.',                         // 짝: 'Here is the transcription:'
    'This is my school.\nMy school is big.',    // 짝: 'This image contains...'
    /* 🔴 함정 대조 검사가 실측으로 잡아 준 것들 — 처음 판이 이것들을 전부 설명문으로
       판정했고, 설명문이면 그 장의 본문이 통째로 버려진다(judgeOcrText 가 lines=[]).
       주석에 «짝» 만 적어 두고 정작 그 문장을 안 넣어서 하니스가 못 잡았다. */
    'I can see a picture.',                      // 짝: 'I can see a page with the words…'
    'I can see a picture of a cat.',
    'I see a picture.',
    'I can see a photo.',
    'The picture shows a dog.',                  // 짝: 'This picture shows a worksheet.'
    'The photo shows my family.',
    'Here is the page number.',                  // 짝: 'Here is the transcription:'
    'I cannot read the sign.',                   // 짝: 'I cannot read the text in this image.'
    'The document is on the desk.',
    'I can see a page.',
    'The page is white.',                        // 「The page」로 시작하지만 동사가 다르다
    'Hello. My name is Mina.',
    'It is sunny today.',
    'The cat is on the mat.',
    'This is a picture of my family.',           // 「picture」가 들어 있지만 교재 문장이다
  ];
  for (const b of realBody) {
    check(`본문으로 본다 — ${b.split('\n')[0].slice(0, 40)}`, M.looksLikeProse(b) === false);
  }

  /* ── 영어 줄 고르기 ────────────────────────────────────────── */
  check('여러 줄을 줄 단위로 본다 (전체에 isEnglishText 를 걸면 \\n 하나에 통째로 탈락한다)',
    M.englishLines('I like apples.\nShe is my friend.\nWe go to school.').length === 3);

  check('한국어 설명 줄은 빼고 영어 줄만 고른다',
    JSON.stringify(M.englishLines('Unit 1\n이번 과의 목표입니다\nI am happy.'))
      === JSON.stringify(['Unit 1', 'I am happy.']));

  check('중국어·병음 줄은 뺀다 (교재가 영어 전용이 아니다)',
    M.englishLines('nǐhaǒ cāochǎng\nI like apples.').length === 1);

  check('빈 줄은 세지 않는다', M.englishLines('\n\nI am here.\n\n').length === 1);

  /* 낱말 수 — 사장님 정보(레벨별 글자 양)를 숫자로 확인하는 핵심 지표 */
  check('영어 낱말을 센다 (5낱말)', M.countEnglishWords(['The cat is on the']) === 5);
  check('여러 줄의 낱말을 합쳐 센다', M.countEnglishWords(['I am here.', 'You are there.']) === 6);
  check('아포스트로피가 든 낱말을 쪼개지 않는다 (don’t = 1낱말)',
    M.countEnglishWords(['I don’t know']) === 3);

  /* ── 최종 판정 ─────────────────────────────────────────────── */
  console.log('\n[ B. 최종 판정 — 성공/실패를 무엇으로 가르는가 ]');

  const jGood = M.judgeOcrText(ENG, 'Unit 3\nI like apples.\nShe is my friend.', 120);
  check('본문을 읽었으면 ok', jGood.ok === true);
  check('본문의 낱말 수를 센다', jGood.words === 8, `words=${jGood.words}`);
  check('원문을 그대로 남긴다 (사람이 눈으로 봐야 «왜» 를 안다)', jGood.raw.indexOf('Unit 3') === 0);

  /* 🔴 여기가 이 하네스의 핵심 — 설명문을 성공으로 세면 시험 결과가 통째로 거짓이 된다 */
  const jProse = M.judgeOcrText(ENG, 'The image shows a page with the words cat, dog, and bird on it.', 90);
  check('설명문은 실패로 본다', jProse.ok === false);
  check('설명문의 낱말을 본문으로 세지 않는다 (세면 「OCR 이 된다」가 거짓이 된다)',
    jProse.words === 0, `words=${jProse.words}`);
  check('설명문이라고 표시한다 (화면이 «왜» 를 말할 수 있어야 한다)', jProse.prose === true);

  const jNone = M.judgeOcrText(ENG, 'NONE', 40);
  check('NONE 은 실패로 본다', jNone.ok === false && jNone.words === 0);

  const jErr = M.judgeOcrText(ENG, '', 10, 'model unavailable');
  check('모델이 죽으면 실패이고 이유가 남는다', jErr.ok === false && jErr.error === 'model unavailable');

  const jMix = M.judgeOcrText(ENG, '제1과 인사하기\nHello.\nHow are you?', 100);
  check('섞인 페이지에서 영어 줄만 건진다', jMix.lines.length === 2, JSON.stringify(jMix.lines));
  check('날것의 줄 수도 함께 남긴다 (얼마나 섞였는지 보여야 한다)', jMix.line_total === 3);

  /* ── 엔진 목록 ─────────────────────────────────────────────── */
  console.log('\n[ C. 엔진 — 하나만 걸고 넘어지지 않는가 ]');
  check('엔진이 둘 이상이다 (하나가 죽어도 답이 남아야 한다)', M.OCR_ENGINES.length >= 2,
    `${M.OCR_ENGINES.length}개`);
  check('입력 모양이 두 가지 다 있다 (신형은 bytes 를 안 받는다 — 한 모양만 지원하면 «되는데 안 되는 것으로» 판정한다)',
    new Set(M.OCR_ENGINES.map((e) => e.shape)).size === 2);
  check('엔진 id 가 중복되지 않는다',
    new Set(M.OCR_ENGINES.map((e) => e.id)).size === M.OCR_ENGINES.length);
  check('모르는 엔진 id 는 받지 않는다 (본문으로 임의 모델을 부르면 비용이 샌다)',
    M.ocrEngineById('@cf/anything/else') === null && M.ocrEngineById(M.OCR_ENGINES[0].id) !== null);

  /* ── 실제 호출 — 가짜 AI 바인딩으로 «절대 안 던지는가» 를 본다 ── */
  console.log('\n[ D. 한 엔진이 죽어도 나머지 답이 남는가 ]');
  const deadAI = { run: async () => { throw new Error('boom'); } };
  /* ⚠️ try/catch 로 감싼다 — 정본이 던지면 여기서 크래시해 스택트레이스만 남고
     «무엇이 깨졌는지» 가 안 보인다. 깔끔한 FAIL 로 나와야 한다. */
  let rs1 = null, threw1 = '';
  try { rs1 = await M.probeImage(deadAI, null, new Uint8Array([1, 2, 3]), 'image/jpeg'); }
  catch (e) { threw1 = String(e && e.message || e); }
  check('전부 죽어도 던지지 않는다 (시험 자체가 멈추면 안 된다)', Array.isArray(rs1), threw1 && '던졌다: ' + threw1);
  check('죽은 엔진도 결과 줄이 남는다 (어느 엔진이 왜 죽었는지 보여야 한다)',
    !!rs1 && rs1.length === M.OCR_ENGINES.length && rs1.every((r) => r.ok === false && r.error));

  let calls = 0;
  const mixedAI = {
    run: async (model) => {
      calls++;
      if (/llava/.test(model)) throw new Error('not available');
      return { response: 'I like apples.\nShe is my friend.' };
    },
  };
  let rs2 = null, threw2 = '';
  try { rs2 = await M.probeImage(mixedAI, null, new Uint8Array([1, 2, 3]), 'image/jpeg'); }
  catch (e) { threw2 = String(e && e.message || e); }
  check('한 엔진이 죽어도 다른 엔진의 답은 살아 있다',
    !!rs2 && rs2.some((r) => r.ok === true) && rs2.some((r) => r.error),
    threw2 ? '던졌다: ' + threw2 : JSON.stringify((rs2 || []).map((r) => [r.engine, r.ok])));
  check('엔진 수만큼만 부른다 (비용이 예측 가능해야 한다)',
    calls === M.OCR_ENGINES.length, `calls=${calls}`);

  let only = null;
  try { only = await M.probeImage(mixedAI, null, new Uint8Array([1]), 'image/jpeg', [M.OCR_ENGINES[0].id]); }
  catch (e) { /* 위 검사가 이미 «던지면 안 된다» 를 잡는다 */ }
  check('엔진을 지정하면 그것만 부른다', !!only && only.length === 1 && only[0].engine === M.OCR_ENGINES[0].id);

  /* 🔴 비용 — 함정 대조 검사가 실측으로 잡은 자리.
     `ocrEngineById` 는 «모르는 id» 만 걸렀고 **같은 id 를 여러 번 넣는 것** 은 안 걸렀다.
     실측: 같은 id 500개 → 모델 호출 500회. 라우트 주석의 「한 요청 = 엔진 수만큼」이
     본문 한 줄로 깨진다. 상한은 «부르는 쪽» 이 아니라 **정본이** 들어야 한다.
     ⚠️ `ocrEngineById` 만 시험하면 이 결함이 안 잡힌다 — `probeImage` 를 돌려야 한다. */
  {
    let n = 0;
    const countAI = { run: async () => { n++; return { response: 'Hello.' }; } };
    const many = new Array(500).fill(M.OCR_ENGINES[0].id);
    let rs = null;
    try { rs = await M.probeImage(countAI, null, new Uint8Array([1]), 'image/jpeg', many); } catch {}
    check(`같은 엔진을 500번 넣어도 호출은 엔진 수 이하다 (실제 호출 ${n}회)`,
      n > 0 && n <= M.OCR_ENGINES.length);
    check('결과 줄도 엔진 수를 넘지 않는다', !!rs && rs.length <= M.OCR_ENGINES.length, `${rs && rs.length}줄`);

    n = 0;
    const mixed = [...new Array(50).fill(M.OCR_ENGINES[0].id), '@cf/nope/nope'];
    try { await M.probeImage(countAI, null, new Uint8Array([1]), 'image/jpeg', mixed); } catch {}
    check(`모르는 id 를 섞어도 상한이 유지된다 (실제 호출 ${n}회)`, n > 0 && n <= M.OCR_ENGINES.length);
  }

  /* 🔴 «많이 뽑았다 ≠ 잘 읽었다» — 2026-09-02 실사고.
     LLaVA 가 한 장에서 84줄·647낱말을 64초 동안 뱉었는데 내용은 몇 줄의 반복이었고,
     화면이 그것을 «제일 많이 뽑은 엔진» 으로 세어 낱말 평균이 179 로 부풀려졌다.
     그 숫자가 이 시험의 결론 지표(「이 교재는 글자가 많은가」)다. */
  {
    const rep = ['I am a square.', 'I go round and round.', 'I am a square.', 'I go round and round.',
                 'I am a square.', 'I go round and round.', 'I am a square.', 'I go round and round.'];
    check('같은 줄이 되풀이되면 그 비율을 잰다', M.repeatRatio(rep) >= 0.7, `ratio=${M.repeatRatio(rep)}`);
    const j = M.judgeOcrText(ENG, rep.join('\n'), 100);
    check('반복을 걷어낸 낱말 수를 따로 준다 (평균은 이 값으로 세야 부풀려지지 않는다)',
      j.unique_words < j.words, `unique=${j.unique_words} words=${j.words}`);
    check('반복 비율을 결과에 실어 화면이 말할 수 있다', j.repeat >= 0.7);

    /* ⚠️ 짝 검사 — 교재에는 «일부러 반복되는» 줄이 실제로 있다(노래 후렴).
       반복이 있다고 실패로 만들면 멀쩡한 교재를 버린다. */
    const song = ['Warm Up', 'The Shape Song', 'I am a square', 'You can see me everywhere',
                  'I have four sides', 'I am a circle', 'I go round and round', 'I have only one side'];
    check('되풀이가 없는 본문은 비율이 0 이다', M.repeatRatio(song) === 0);
    const js = M.judgeOcrText(ENG, song.join('\n'), 100);
    check('되풀이가 없으면 낱말 수가 깎이지 않는다', js.unique_words === js.words);
    check('반복이 있어도 실패로 만들지는 않는다 (사람이 원문을 보고 판단한다)',
      M.judgeOcrText(ENG, rep.join('\n'), 100).ok === true);
    check('짧은 글은 반복으로 보지 않는다', M.repeatRatio(['A', 'A']) === 0);
  }

  /* 🔴 저작권 푸터가 낱말 수를 지배한다 — 2026-09-02 첫 실행 실측.
     교재 «모든» 장에 「January 2019 Mangoi.com. Do not reproduce or distribute. Page N」
     이 있고 그것만 10~11낱말이다. 그대로 세면 낮은 권 26 · 높은 권 31 로 «비슷해» 보이는데,
     빼면 10 대 50 으로 **5배** 차이가 난다 — 이 시험이 답하려는 질문이 푸터에 가려진다.
     ⚠️ 아래 문장들은 사장님 화면에 **실제로 나온 것** 을 그대로 넣었다. */
  {
    const boiler = [
      'January 2019 Mangoi.com . Do not reproduce or distribute.',
      'January 2019 Mangoi.com. Do not reproduce or distribute',
      'January 2019 Mangoi.com. Do not reproduce or distribute page 1',
      'Page 1', 'Page 8', 'page 18',
      'Scan me',
      'https://www.youtube.com/watch?v=fCG5hKZWlU8t-7J8',
      'All rights reserved.',
      '© 2019 Mangoi',
    ];
    for (const b of boiler) {
      check(`저작권·머리말로 본다 — ${b.slice(0, 42)}`, M.isBoilerplateLine(b) === true);
    }

    /* 🔴 짝 검사 — 여기서 진짜 본문을 버리면 「이 교재는 쓸 게 없다」는 반대 거짓이 난다.
       아래는 사장님 화면에 나온 **진짜 교재 본문** 이다. */
    const body = [
      'Warm Up', 'The Shape Song', "I'm a square", 'You can see me everywhere',
      'People and Adjectives', 'Talk about the people!', 'Picture Talk!',
      'Possibilities', 'What do you think?', 'Taking Risks',
      'Steve Irwin: The Crocodile Hunter', '34 REVIEW', 'Hopes and Dreams',
      'USE THE WORD/PHRASE IN A SENTENCE.', 'LIFESTYLE', 'POTENTIAL',
      'Think about some fiction stories. Which one\'s are realistic?',
      'Do you think your dreams are realistic?',
      'Who was Steve Irwin? Do you think he had an exciting life?',
      'Level 8 Bubble Tea 34 Unit 2',      // 과 표시 — 애매해서 «본문 쪽» 으로 둔다
      'BTS 2 Unit 3 009',
      'Turn to page 5.',                    // ⛔ 「page」가 들어 있지만 본문이다
      'I can see a page.',
      'Visit https://mangoi.ai for more.',  // ⛔ 주소가 들어 있지만 문장이다
      'Scan me with your phone and answer.',
    ];
    for (const b of body) {
      check(`본문으로 남긴다 — ${b.slice(0, 42)}`, M.isBoilerplateLine(b) === false);
    }

    /* 실제로 세어 본다 — 사장님 화면의 그 장 그대로 */
    const page = [
      'BTS 2 Unit 3 008',
      'People and Adjectives',
      'Talk about the people!',
      'Picture Talk!',
      'January 2019 Mangoi.com . Do not reproduce or distribute.',
      'Page 8',
    ].join('\n');
    const j = M.judgeOcrText(ENG, page, 100);
    check('저작권으로 뺀 낱말 수를 따로 준다 (화면이 그 사실을 말해야 한다)',
      j.boiler_words >= 8, `boiler=${j.boiler_words}`);
    check('본문 낱말이 날것보다 적다 (푸터를 빼면 레벨 차이가 드러난다)',
      j.unique_words < j.words, `unique=${j.unique_words} words=${j.words}`);
    check('본문은 남는다 (People and Adjectives / Talk about the people! / Picture Talk!)',
      j.unique_words >= 8, `unique=${j.unique_words}`);

    /* 🔴 이 시험의 결론 — 푸터를 빼야 낮은 권과 높은 권이 갈린다 */
    const high = [
      'Level 8 Bubble Tea 34 Unit 2',
      'Possibilities',
      'What do you think?',
      "1. Think about some fiction stories. Which one's are realistic? Which one's aren't?",
      '2. Do you think your dreams are realistic?',
      'January 2019 Mangoi.com. Do not reproduce or distribute page 10',
    ].join('\n');
    const jh = M.judgeOcrText(ENG, high, 100);
    check(`푸터를 빼면 높은 권이 낮은 권보다 본문이 많다 (${j.unique_words} 대 ${jh.unique_words})`,
      jh.unique_words > j.unique_words * 2);
    check(`푸터를 안 빼면 그 차이가 가려진다 (날것 ${j.words} 대 ${jh.words})`,
      jh.words / Math.max(1, j.words) < jh.unique_words / Math.max(1, j.unique_words));
  }

  /* 🟡 길이 상한에 걸려 «조용히 사라지는» 줄 — 이 시험의 가설과 반대 방향으로 위험하다.
     사장님 정보가 「높은 레벨은 글자가 많다」인데, 글자가 많을수록 더 많이 깎이면
     「높은 권도 낱말이 적네」라는 정반대 결론이 난다. 화면이 그 사실을 말해야 한다. */
  {
    const longLine = 'The quick brown fox jumps over the lazy dog. '.repeat(20).trim();  // 880자
    const j = M.judgeOcrText(ENG, 'Unit 5\n' + longLine, 100);
    check('길어서 버린 줄을 세어 남긴다 (조용히 사라지면 높은 권을 과소평가한다)',
      j.too_long >= 1, `too_long=${j.too_long}`);
    check('길어서 버려도 나머지 줄은 살아 있다', j.lines.length >= 1);
    const j2 = M.judgeOcrText(ENG, 'Unit 5\nI like apples.', 100);
    check('짧은 줄만 있으면 too_long 은 0 이다', j2.too_long === 0);
    /* 한국어 줄은 «길어서» 가 아니라 «영어가 아니라서» 떨어진 것 — 섞어 세면 안 된다 */
    const j3 = M.judgeOcrText(ENG, '이번 과의 목표는 인사말을 배우는 것입니다', 50);
    check('영어가 아니라 떨어진 줄을 «길어서» 로 세지 않는다', j3.too_long === 0, `too_long=${j3.too_long}`);
  }

  /* base64 — 큰 이미지에서 btoa 가 «인자 너무 많음» 으로 죽던 자리 */
  if (typeof globalThis.btoa === 'function') {
    const big = new Uint8Array(200000).fill(65);
    let bok = true; try { M.bytesToBase64(big); } catch { bok = false; }
    check('200KB 이미지도 base64 로 바꿀 수 있다 (btoa 인자 한도)', bok);
  } else skip('btoa 없음 — base64 검사 생략');
}

/* ═══ E. 배선 — 관문·권한·저장하지 않음 ═══════════════════════════ */
console.log('\n[ E. 배선 ]');
{
  const api = rd('cloudflare-deploy/src/api-admin.ts');
  const idx = rd('cloudflare-deploy/src/index.ts');
  const mango = rd('cloudflare-deploy/src/api-mango.ts');

  /* 🔴 관문 셋 — 하나만 빠져도 404 「Not Found」 이고, 그 404 는 «없다» 가 아니라
     «오늘은 자료가 없나 보다» 로 읽힌다(ok 칸이 없어 d.ok===false 검사를 통과한다). */
  check('② 라우팅 허용목록에 이미 등록된 경로를 쓴다 (src/index.ts 는 공동 금지구역이라 한 줄도 안 건드린다)',
    /\/\^\\\/api\\\/admin\\\/textbook-files\\\/\\d\+\$\//.test(idx.replace(/\s/g, '')) ||
    idx.includes('/^\\/api\\/admin\\/textbook-files\\/\\d+$/'));
  check('③ 위임 가드가 그 접두사를 통과시킨다',
    /path\.startsWith\('\/api\/admin\/textbook-files'\)/.test(mango));

  /* 라우트 블록만 잘라서 본다 — 파일 전체에서 찾으면 옆 라우트의 코드가 걸린다 */
  const anchor = "if (method === 'POST' && /^\\/api\\/admin\\/textbook-files\\/\\d+$/.test(path)) {";
  const at = api.indexOf(anchor);
  check('POST 라우트가 있다', at >= 0);
  let block = '';
  if (at >= 0) {
    let d = 0, i = api.indexOf('{', at), s0 = i;
    for (; i < api.length; i++) {
      if (api[i] === '{') d++;
      else if (api[i] === '}') { d--; if (d === 0) break; }
    }
    block = api.slice(s0, i + 1);
  }
  const bc = stripComments(block);

  check('강사를 막는다 (⛔ canEditOrg 는 \'none\'=교사에 true 라 못 막는다)',
    /isTeacher/.test(bc) && /forbidden_teacher/.test(bc));
  check('지사·대리점을 막는다', /isOrgScopedRole/.test(bc) && /forbidden_scope/.test(bc));
  check('막는 것이 DB·R2 를 만지기 «전» 이다',
    bc.indexOf('isOrgScopedRole') >= 0 && bc.indexOf('RECORDINGS') >= 0
      && bc.indexOf('isOrgScopedRole') < bc.indexOf('RECORDINGS'));

  /* 🔴 여기는 «비용을 지키는» 자리라 문자열로 검사하면 안 된다 —
     조건을 `!==` → `===` 로 뒤집어도 그 글자가 그대로 남아 통과한다(함정 대조 검사 지적).
     ⟹ 판정을 정본 `ocrGate()` 로 빼고, 라우트는 그것을 «부르기만» 하는지 본다. */
  check('입구 판정을 라우트에 다시 적지 않고 정본 ocrGate() 를 부른다',
    /ocrGate\(/.test(bc) && !/!==\s*'ocr_probe'/.test(bc));
  if (M) {
    const G = (o) => M.ocrGate(o);
    const OK = { action: 'ocr_probe', mime: 'image/jpeg', ext: 'jpg', sizeBytes: 90000 };
    check('정상 요청은 통과한다 (막기만 하는 게이트도 초록불이 된다 — 짝으로 본다)', G(OK) === null);
    check('모르는 action 은 거절한다 (다른 뜻을 넣을 때 조용히 OCR 로 흘러 비용이 나가면 안 된다)',
      G({ ...OK, action: 'something' })?.error === 'unknown_action');
    check('action 이 없으면 거절한다', G({ ...OK, action: undefined })?.error === 'unknown_action');
    check('PDF 는 거절한다 (6MB 를 모델에 넣으면 시간·비용만 쓴다)',
      G({ ...OK, mime: 'application/pdf', ext: 'pdf' })?.error === 'not_an_image');
    check('mime 이 비어도 확장자로 이미지면 통과한다', G({ ...OK, mime: '' }) === null);
    check('큰 파일을 거절한다', G({ ...OK, sizeBytes: 5_000_000 })?.error === 'too_large');
    /* ⚠️ `size_bytes` 는 스키마상 NOT NULL 이 아니다 — NULL 이면 옛 검사를 그냥 통과했다 */
    check('size_bytes 가 NULL 이어도 «실제 받은 길이» 로 막는다 (스키마상 NOT NULL 이 아니다)',
      G({ ...OK, sizeBytes: null, actualBytes: 5_000_000 })?.error === 'too_large');
    check('size_bytes 가 NULL 이고 실물도 작으면 통과한다',
      G({ ...OK, sizeBytes: null, actualBytes: 90000 }) === null);
  }

  /* 🔴 D1 의 LIKE 패턴 한도는 **50자** 다(2026-09-02 실측: 50자 통과·51자에서
     `LIKE or GLOB pattern too complex`). 교재 이름이 긴 13개는 `[이름]%` 가 그 한도를
     넘어 **조회 자체가 통째로 실패**했고, 화면에는 D1_ERROR 가 그대로 떴다.
     ⚠️ 문자열로 「instr 가 있는가」만 보면 옆 라우트의 것이 걸린다 — 교재 목록 조회에
        LIKE 가 «남아 있지 않은지» 를 함께 본다. */
  {
    const bookLike = api.match(/if \(book\) \{[^}]*\}/g) || [];
    check(`교재 이름 필터가 LIKE 를 쓰지 않는다 (D1 패턴 한도 50자 — 긴 이름 13개가 통째로 실패했다) — ${bookLike.length}곳`,
      bookLike.length >= 2 && bookLike.every((b) => /instr\(name, \?\) = 1/.test(b) && !/LIKE/.test(b)),
      bookLike.join(' | ').slice(0, 200));
  }

  /* 🔴 `mime` 을 그대로 믿으면 신형 모델이 전부 거절한다 —
     업로더가 `application/octet-stream` 으로 저장한 파일이 대부분이다(실측 246/246). */
  check('mime 이 이미지가 아니면 확장자로 만들어 넘긴다 (실측: Llama 4 Scout 6장 6실패의 원인)',
    /\/\^image\\\/\/\.test\(mime\)\s*\?\s*mime\s*:/.test(bc) || /safeMime/.test(bc));
  /* ⚠️ `[^)]*` 로 자르지 말 것 — 인자에 `(env as any)` 가 있어 그 괄호에서 멈춘다
     (멀쩡한 코드가 FAIL 났다). 줄 전체를 잡아서 본다. */
  {
    const call = (bc.match(/^.*probeImage\(.*$/m) || [''])[0];
    check('모델에 넘기는 것은 날것 mime 이 아니라 그 값이다',
      /safeMime/.test(call) && !/,\s*mime\s*[,)]/.test(call), call.trim().slice(0, 160));
  }

  /* ⚠️ «시험이라 저장하지 않는다» — 이것이 이 단계의 약속이다.
     저장을 붙이려면 «무엇을 어디에» 를 먼저 설계해야 하고, 그때 이 검사를 함께 고친다. */
  check('시험 결과를 D1 에 쓰지 않는다',
    !/\b(INSERT|UPDATE)\s+/i.test(bc), (bc.match(/\b(INSERT|UPDATE)\s+\w+/i) || [])[0]);
  check('화면에 «저장하지 않았다» 고 말해 준다', /saved:\s*false/.test(bc));
  check('모델을 몇 번 불렀는지 돌려준다 (비용이 보여야 한다)', /calls:/.test(bc));
}

/* ═══ F. 화면 ═════════════════════════════════════════════════════ */
console.log('\n[ F. 화면 ]');
{
  const P = 'cloudflare-deploy/public/admin/textbook-ocr.html';
  check('시험 화면이 있다', existsSync(join(ROOT, P)));
  const h = existsSync(join(ROOT, P)) ? rd(P) : '';

  /* 📌 사장님 정보(2026-09-02) — 「BTS 는 레벨이 낮으면 글자가 적고 높으면 많다」.
     낮은 권 하나로만 시험하면 「OCR 해도 소용없다」는 잘못된 결론이 난다.
     그래서 이 화면은 «두 권을 나란히» 놓는 것이 존재 이유다. */
  /* ⚠️ `data-slot=` 을 그냥 세면 안 된다 — 스크립트 안의 선택자 문자열
     (`'[data-slot=' + slot + ']'`)까지 세어, 칸을 하나 지워도 2개가 남는다.
     실제로 변이시험에서 그 상태로 «통과» 했다. **화면에 실재하는 칸** 을 센다. */
  const hBody = h.replace(/<script[\s\S]*?<\/script>/gi, '');
  const slots = (hBody.match(/<div class="col" data-slot="[A-Z]"/g) || []).length;
  check(`권을 두 칸에 나란히 놓는다 (한쪽만 보면 잘못된 결론이 난다) — ${slots}칸`, slots >= 2);
  check('영어 낱말 수를 보여 준다 (레벨별 글자 양을 숫자로 비교하는 자리)',
    /s-words/.test(h));
  check('«저장하지 않는다» 고 화면이 말한다', /저장하지 않습니다|저장하지 않는/.test(h));
  /* ⚠️ 「파일에 그 글자가 있는가」로 검사하면 주석에 걸려 헛돈다 —
     변이시험에서 실제로 그 상태로 통과했다. **평균을 정하는 그 줄** 을 본다.
     `best` 를 갱신하는 줄이 전부 unique_words 를 거쳐야 한다. */
  {
    const bestLines = (h.match(/^.*best\s*=\s*[\w.]+\s*;.*$/gm) || [])
      .filter((l) => !/var best = 0/.test(l));
    check(`낱말 평균을 unique_words 로 센다 (반복해 토한 엔진이 이기면 결론이 거짓이 된다) — ${bestLines.length}곳`,
      bestLines.length >= 2 && bestLines.every((l) => /\bw\b/.test(l)) && /unique_words != null/.test(h),
      bestLines.join(' | ').slice(0, 200));
  }
  check('같은 줄 반복을 화면이 말한다', /r\.repeat/.test(h));
  check('저작권으로 뺀 낱말 수를 화면이 말한다 (숫자가 조용히 바뀌면 아무도 이유를 모른다)',
    /r\.boiler_words/.test(h));
  check('낱말 라벨이 «본문» 임을 밝힌다', /본문 낱말/.test(h));
  check('엔진별로 나눠 보여 준다 («어느 엔진이 되는가» 가 이 시험의 첫 질문이다)',
    /s-eng/.test(h) && /stats\.eng/.test(h));
  check('비용이 든다고 말한다', /비용/.test(h));

  /* ⛔ /admin/ 밑에는 js·css 자산을 두지 않는다 — 로그인 게이트가 그 요청까지 삼켜
     «화면이 조용히 반쪽» 이 된다(src/index.ts isAdminPath 주석). */
  const localAsset = /<(?:script|link)[^>]+(?:src|href)="\/admin\//i.test(h);
  check('/admin/ 밑의 js·css 를 부르지 않는다 (게이트가 그 요청까지 삼킨다)', !localAsset);

  /* 판정은 «실패라고 말했는가» 가 아니라 «성공이라고 말했는가» 로 —
     종단 404 본문에는 ok 칸이 없어 d.ok===false 는 그냥 통과한다. */
  check('응답 판정을 d.ok === true 로 한다', /\.ok\s*!==\s*true/.test(h));

  /* 한 장씩 차례로 — 한꺼번에 보내면 뉴런 소진을 몰아 맞아 어느 엔진이 되는지 못 가린다 */
  check('멈출 수 있다 (비용 통제)', /data-role=stop|data-role="stop"/.test(h));

  /* 나가는 문 — 판정 정본은 back-nav.js 하나. href 폴백이 있어야 «무반응» 이 안 된다 */
  check('나가는 문이 있고 href 폴백이 있다',
    /id="lnk-back"/.test(h) && /href="\/admin\.html"/.test(h));
  check('뒤로 판정을 복제하지 않는다 (정본은 window.mangoiGoBack)',
    /mangoiGoBack/.test(h) && !/history\.back\(\)/.test(h));

  /* 한자 폰트 983KB — 본문(주석·script 제외)에 장식 문자가 있으면 통째로 받는다 */
  const body = h.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  let han = 0, deco = 0;
  for (const ch of body) {
    const c = ch.codePointAt(0);
    if ((c >= 0x4E00 && c <= 0x9FFF) || (c >= 0x3400 && c <= 0x4DBF) || (c >= 0xF900 && c <= 0xFAFF)) han++;
    else if ((c >= 0x3000 && c <= 0x303F) || (c >= 0xFF00 && c <= 0xFFEF)) deco++;
  }
  check(`한자 없는 화면이 장식 문자로 983KB 폰트를 부르지 않는다 (장식 ${deco}자)`, han > 0 || deco === 0);
}

console.log(`\n${'─'.repeat(45)}\n  통과 ${PASS} · 실패 ${FAIL}${SKIP ? ' · 건너뜀 ' + SKIP : ''}\n${'─'.repeat(45)}`);
if (FAIL) { console.log('실패:'); FAILS.forEach((f) => console.log('  · ' + f)); process.exit(1); }
