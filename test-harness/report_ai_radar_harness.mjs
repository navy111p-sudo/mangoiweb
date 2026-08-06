// 🌟 성적표 오각형 — AI 학습기록으로 빈 축 채우기 하니스 — 2026-08-07
//   배경: 오각형 5축 중 발음만 voice_coaching(=AI)에서 나오고, 어휘·문장구성·태도·참여도
//         4축은 전부 student_evaluations, 즉 «강사가 손으로 쓴 평가서» 에서만 나왔다.
//         그래서 강사 없이 AI 만 쓰는 학원은 평가서가 0행 → 성적표가 빈 종이로 나간다.
//         경쟁사가 Lexile·WPM 숫자를 내놓는 자리에 우리는 낼 것이 없었다.
//
//   이 하니스가 고정하는 것 — 셋 다 어기면 성적표가 «거짓말하는 종이» 가 된다:
//     ① 강사 점수가 우선. AI 는 그 축이 비어 있을 때만 채운다. 강사 점수를 덮으면 안 된다.
//     ② 근거가 모자라면 채우지 않는다. 표본 미달이면 null 로 남긴다(지어낸 점수 금지).
//     ③ 무엇으로 쟀는지 반드시 같이 낸다 — 서버는 radar_source/radar_basis 로,
//        화면은 «AI 학습기록» 표시와 근거 문구로. 표시가 없으면 학부모가 AI 활동 점수를
//        «선생님이 매긴 점수» 로 읽는다.
//
//   ⚠️ grep 만으로 통과하는 하니스는 아무것도 지키지 않는다 →
//      esbuild 로 실제 함수를 떼어내 «가짜 D1» 을 물려 진짜로 실행한다.
//
//   실행: node test-harness/report_ai_radar_harness.mjs
import { readFileSync } from 'fs';

import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const require = createRequire(import.meta.url);

const src = readFileSync(join(ROOT, 'cloudflare-deploy', 'src', 'api-reports.ts'), 'utf8');
const mrep = readFileSync(join(ROOT, 'cloudflare-deploy', 'public', 'monthly-report.html'), 'utf8');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : '')); }
}

/* ═══════════════════════════════════════════════════════════
   준비 — computeAiRadar 를 소스에서 떼어내 실제로 실행할 수 있게 만든다
   ═══════════════════════════════════════════════════════════ */
console.log('\n[ 준비: 실제 함수를 떼어내 가짜 D1 로 실행 ]');

const from = src.indexOf('function clamp100');
const to = src.indexOf('// 직전 리포트(');
check('computeAiRadar 블록을 소스에서 찾았다', from > 0 && to > from, { from, to });

let computeAiRadar = null, toHundredFn = null;
if (from > 0 && to > from) {
  // toHundred 는 이 블록 밖에 있으므로 같이 떼어온다(문장 구성력 축이 쓴다)
  const th = src.match(/function toHundred[\s\S]*?\n}/);
  const block = (th ? th[0] + '\n' : '') + src.slice(from, to);
  const ts = block + '\nexport { computeAiRadar, clamp100, toHundred };\n';
  const esbuild = require(join(ROOT, 'cloudflare-deploy', 'node_modules', 'esbuild'));
  const js = esbuild.transformSync(ts, { loader: 'ts', format: 'esm' }).code;
  const dir = mkdtempSync(join(tmpdir(), 'mangoi-radar-'));
  const file = join(dir, 'radar.mjs');
  writeFileSync(file, js, 'utf8');
  const mod = await import(pathToFileURL(file).href);
  computeAiRadar = mod.computeAiRadar;
  toHundredFn = mod.toHundred;
  check('떼어낸 함수가 실제로 로드된다', typeof computeAiRadar === 'function');
}

/* 가짜 D1 — SQL 문자열을 보고 미리 정해 둔 답을 돌려준다.
   실제 스키마의 컬럼 이름을 그대로 쓰므로, 쿼리가 엉뚱한 컬럼을 보면 여기서 드러난다. */
/* ⚠️ 패턴은 «먼저 맞는 것» 이 이긴다. 참여도 쿼리는 UNION 안에서 vocab_review_log·
   review_quiz_results·ai_friend_chats 를 모두 참조하므로, 반드시 COUNT(DISTINCT day) 를
   맨 앞에 두어야 한다. (안 그러면 참여도 답으로 어휘 답이 돌아가 하니스가 헛돈다 — 실제로 겪음) */
function fakeDb(answers) {
  const seen = [];
  return {
    seen,
    prepare(sql) {
      seen.push(sql.replace(/\s+/g, ' ').trim());
      return {
        bind() { return this; },
        async first() {
          for (const [pat, val] of answers) if (pat.test(sql)) return val;
          return null;
        },
      };
    },
  };
}
const T0 = 1754000000000, T1 = T0 + 60 * 86400000;   // 60일 구간

/* ═══════════════════════════════════════════════════════════
   ① 근거가 있으면 채운다 — 그리고 숫자가 맞는가
   ═══════════════════════════════════════════════════════════ */
console.log('\n[ ① 근거가 충분하면 채우고, 숫자가 맞는가 ]');

if (computeAiRadar) {
  const db = fakeDb([
    [/COUNT\(DISTINCT day\)/, { n: 18 }],
    [/FROM vocab_review_log/, { n: 40, ok: 30 }],                 // 40문항 중 30개 정답
    [/FROM review_quiz_results/, { sessions: 5, s: 30, t: 60 }],  // 60문항 중 30개 → 합계 100문항 중 60개
    [/FROM ai_writing_corrections/, { n: 0, avg: null }],         // 첨삭 없음 → 대화 길이로 근사
    [/FROM ai_friend_chats WHERE/, { n: 24, words: 6 }],          // 24번, 평균 6단어
    [/FROM student_streaks/, { current_streak: 5, longest_streak: 7 }],
  ]);
  const r = await computeAiRadar({ DB: db }, 'stu1', T0, T1);

  check('어휘: 100문항 중 60개 정답 → 60점', r.vocab.score === 60, r.vocab);
  check('어휘: 근거 문구가 한/영 두 벌로 나온다',
    /100문항 중 60개/.test(r.vocab.basis_ko) && /60 correct out of 100/.test(r.vocab.basis_en), r.vocab);
  check('문장구성: 첨삭이 없으면 대화 길이로 근사 (6단어/12 → 50점)', r.sentence.score === 50, r.sentence);
  check('태도: 최장 스트릭 7일/14 → 50점', r.attitude.score === 50, r.attitude);
  check('태도: 무엇을 쟀는지 근거에 밝힌다(«꾸준함»)', /꾸준함/.test(r.attitude.basis_ko), r.attitude);
  // 60일 구간 → 목표 = round(60/7*3) = 26일. 18/26 = 69.2 → 69
  check('참여도: 60일 중 18일 학습 → 69점(주 3회 기준)', r.participation.score === 69, r.participation);
  check('참여도: 횟수가 아니라 «날 수» 로 센다(DISTINCT day)',
    db.seen.some(s => /COUNT\(DISTINCT day\)/.test(s)));
  check('모든 축이 0~100 안에 있다',
    ['vocab', 'sentence', 'attitude', 'participation'].every(k => r[k].score >= 0 && r[k].score <= 100));

  // 첨삭이 있으면 그쪽을 «우선» 쓰는가
  const db2 = fakeDb([
    [/FROM vocab_review_log/, { n: 0, ok: 0 }],
    [/FROM review_quiz_results/, { sessions: 0, s: 0, t: 0 }],
    [/FROM ai_writing_corrections/, { n: 6, avg: 82 }],
    [/FROM ai_friend_chats WHERE/, { n: 99, words: 12 }],   // 대화도 많지만 첨삭이 이겨야 한다
    [/FROM student_streaks/, { current_streak: 0, longest_streak: 0 }],
    [/COUNT\(DISTINCT day\)/, { n: 0 }],
  ]);
  const r2 = await computeAiRadar({ DB: db2 }, 'stu2', T0, T1);
  check('문장구성: 첨삭이 3편 이상이면 대화 길이가 아니라 첨삭 점수를 쓴다',
    r2.sentence.score === 82 && /첨삭 6편/.test(r2.sentence.basis_ko), r2.sentence);
}

/* ═══════════════════════════════════════════════════════════
   ② ⛔ 근거가 모자라면 «지어내지 않는다»
   ═══════════════════════════════════════════════════════════ */
console.log('\n[ ② ⛔ 표본이 모자라면 점수를 만들지 않는다 ]');

if (computeAiRadar) {
  const thin = fakeDb([
    [/COUNT\(DISTINCT day\)/, { n: 1 }],                          // 1일 — 2 미만
    [/FROM vocab_review_log/, { n: 4, ok: 4 }],                   // 4문항 — 10 미만
    [/FROM review_quiz_results/, { sessions: 1, s: 3, t: 3 }],    // 합계 7문항 → 여전히 미달
    [/FROM ai_writing_corrections/, { n: 2, avg: 95 }],           // 2편 — 3 미만
    [/FROM ai_friend_chats WHERE/, { n: 4, words: 20 }],          // 4번 — 10 미만
    [/FROM student_streaks/, { current_streak: 1, longest_streak: 2 }],  // 2일 — 3 미만
  ]);
  const r = await computeAiRadar({ DB: thin }, 'stu3', T0, T1);
  check('어휘: 7문항(10 미만)이면 만점이어도 채우지 않는다', r.vocab.score === null, r.vocab);
  check('문장구성: 첨삭 2편·대화 4번이면 채우지 않는다', r.sentence.score === null, r.sentence);
  check('태도: 스트릭 2일이면 채우지 않는다', r.attitude.score === null, r.attitude);
  check('참여도: 학습 1일이면 채우지 않는다', r.participation.score === null, r.participation);

  const empty = fakeDb([]);   // 아무 데이터도 없음 (모든 쿼리가 null)
  const r0 = await computeAiRadar({ DB: empty }, 'stu4', T0, T1);
  check('데이터가 하나도 없으면 네 축 모두 null',
    ['vocab', 'sentence', 'attitude', 'participation'].every(k => r0[k].score === null), r0);

  // 테이블 자체가 없어 조회가 터져도 리포트 전체가 죽으면 안 된다
  const boom = { prepare() { throw new Error('no such table'); } };
  let survived = true, r5 = null;
  try { r5 = await computeAiRadar({ DB: boom }, 'stu5', T0, T1); } catch { survived = false; }
  check('테이블이 없어 쿼리가 터져도 함수는 살아남는다(리포트 전체 보호)', survived);
  check('그 경우에도 네 축은 null 로 남는다',
    !!r5 && ['vocab', 'sentence', 'attitude', 'participation'].every(k => r5[k].score === null));
}

/* ═══════════════════════════════════════════════════════════
   ③ ⛔ 강사 점수를 덮지 않는가 (합치는 쪽 로직)
   ═══════════════════════════════════════════════════════════ */
console.log('\n[ ③ ⛔ 강사 점수가 있으면 AI 가 덮지 않는가 ]');

const mergeBlock = src.slice(src.indexOf('const radarSource'), src.indexOf('const prevRadar'));
check('합치기 블록을 찾았다', mergeBlock.length > 100);
check('강사 점수가 있는 축은 건너뛴다 (radar[k] != null → continue)',
  /if \(radar\[k\] != null\) continue;/.test(mergeBlock));
check('AI 점수가 null 이면 채우지 않는다 (ai[k].score == null → continue)',
  /if \(ai\[k\]\.score == null\) continue;/.test(mergeBlock));
check('빈 축이 하나도 없으면 AI 조회 자체를 안 한다(불필요한 D1 읽기 방지)',
  /if \(radar\.vocab == null \|\| radar\.sentence == null \|\| radar\.attitude == null \|\| radar\.participation == null\)/.test(mergeBlock));
check('발음 축은 원래부터 AI(voice_coaching) 라고 표시한다',
  /pronunciation: radar\.pronunciation == null \? null : 'ai'/.test(mergeBlock));
check('AI 가 채운 축만 basis 를 남긴다', /radarBasis\[k\] = \{ ko:/.test(mergeBlock));

// 실제로 합치기 로직을 그대로 떼어 돌려 본다 — 강사 점수가 덮이는지 눈으로 확인
{
  const radar = { pronunciation: 70, vocab: 88, sentence: null, attitude: null, participation: null };
  const ai = {
    vocab: { score: 10, basis_ko: 'x', basis_en: 'x' },          // 강사 88 을 덮으면 안 된다
    sentence: { score: 55, basis_ko: 'a', basis_en: 'b' },
    attitude: { score: null, basis_ko: '', basis_en: '' },        // 근거 없음 → 비워 둬야 한다
    participation: { score: 40, basis_ko: 'c', basis_en: 'd' },
  };
  const radarSource = { pronunciation: 'ai', vocab: 'teacher', sentence: null, attitude: null, participation: null };
  const radarBasis = {};
  for (const k of ['vocab', 'sentence', 'attitude', 'participation']) {
    if (radar[k] != null) continue;
    if (ai[k].score == null) continue;
    radar[k] = ai[k].score; radarSource[k] = 'ai'; radarBasis[k] = { ko: ai[k].basis_ko, en: ai[k].basis_en };
  }
  check('강사 점수 88 이 AI 10 으로 덮이지 않는다', radar.vocab === 88 && radarSource.vocab === 'teacher', radar);
  check('빈 축은 AI 로 채워진다', radar.sentence === 55 && radarSource.sentence === 'ai');
  check('AI 근거도 없는 축은 끝까지 비어 있다', radar.attitude === null && radarSource.attitude === null);
  check('AI 로 채운 축만 basis 를 갖는다', Object.keys(radarBasis).sort().join() === 'participation,sentence');
}

/* ═══════════════════════════════════════════════════════════
   ④ ⛔ 출처를 감추지 않는가 (서버 응답 + 화면)
   ═══════════════════════════════════════════════════════════ */
console.log('\n[ ④ ⛔ «AI 가 매긴 점수» 임을 감추지 않는가 ]');

check('서버가 radar_source 를 함께 낸다', /radar_source: radarSource/.test(src));
check('서버가 radar_basis 를 함께 낸다', /radar_basis: radarBasis/.test(src));
check('서버가 AI 로 채운 축 수를 낸다(0이면 종전과 동일한 리포트)', /radar_ai_axis_count: aiAxisCount/.test(src));
check('화면이 radar_source·radar_basis 를 실제로 받아 쓴다',
  /svgRadar\(d\.radar, d\.radar_source, d\.radar_basis\)/.test(mrep));
check('화면이 AI 축에 «AI 학습기록» 표시를 붙인다',
  /src\[a\.k\]==='ai'/.test(mrep) && /AI 학습기록/.test(mrep));
check('표시가 한/영 두 벌이다', /t\('AI 학습기록','From AI activity'\)/.test(mrep));
check('화면이 근거 문구도 함께 보여 준다', /rbasis/.test(mrep) && /esc\(t\(b\.ko, b\.en\)\)/.test(mrep));
check('카드 아래에 «선생님 평가가 아니다» 를 한 번 더 밝힌다',
  /radar-note/.test(mrep) && /선생님 평가가 아니라/.test(mrep));
check('인쇄본에서도 표시가 남는다(색이 아니라 글자 + print 스타일)',
  /@media print\{[^}]*\.radar-list \.rsrc/.test(mrep.replace(/\s+/g, ' ')) || /@media print\{ \.radar-list \.rsrc/.test(mrep));
check('발음 축도 근거를 밝힌다 — 표시만 붙고 근거가 없으면 «이건 뭐지» 가 된다',
  /radarBasis\.pronunciation = \{/.test(src) && /AI 음성코치 \$\{voiceStats\.n\}회/.test(src));
check('AI 학습 기록만 있어도 «기록이 적다» 로 처리되지 않는다',
  /hasSignal = evalRows\.length > 0 \|\| \(att\?\.d \|\| 0\) > 0 \|\| !!judgment \|\| aiAxisCount > 0/.test(src));
check('AI 로 채운 축은 모델에게도 «강사가 말했다고 쓰지 말라» 고 알려 준다',
  /강사가 말했다고 쓰지 말 것/.test(src) && /\$\{aiBasisLine\}/.test(src));

/* ═══════════════════════════════════════════════════════════
   ⑤ 역검증 — 기능을 도로 빼면 이 하니스가 «실제로» 실패하는가
      ⚠️ git HEAD 와 비교하지 않는다 — 커밋하는 순간 HEAD 에 기능이 들어가서
         역검증이 스스로 무너진다(실제로 한 번 겪었다). 지금 소스에서 기능 줄을
         걷어낸 합성본으로 검사하면 커밋 여부와 무관하게 영원히 유효하다.
   ═══════════════════════════════════════════════════════════ */
console.log('\n[ ⑤ 역검증 — 기능을 도로 빼면 검사가 실패하는가 ]');

const stripSrc = (t) => t.split('\n')
  .filter(l => !/(computeAiRadar|radar_source|radar_basis|radar_ai_axis_count|radarSource|radarBasis|aiAxisCount|aiBasisLine|clamp100|AiAxis|NO_AXIS|ai_friend_chats|student_streaks)/.test(l))
  .join('\n');
const stripRep = (t) => t.split('\n')
  .filter(l => !/(radar_source|radar_basis|AI 학습기록|From AI activity|rsrc|rbasis|radar-note)/.test(l))
  .join('\n');

const srcCore = (t) => [
  /computeAiRadar/.test(t),                 // AI 축 계산이 있다
  /radar_source: radarSource/.test(t),      // 출처를 낸다
  /ai_friend_chats/.test(t),                // AI 대화를 실제로 본다
  /aiAxisCount > 0/.test(t),                // AI 기록만 있어도 «근거 있음»
];
const repCore = (t) => [
  /svgRadar\(d\.radar, d\.radar_source, d\.radar_basis\)/.test(t),
  /AI 학습기록/.test(t),
  /radar-note/.test(t),
];

{
  const now = srcCore(src), before = srcCore(stripSrc(src));
  check('서버: 지금은 핵심 4개가 모두 참이다', now.every(Boolean), now);
  check('서버: 기능을 빼면 핵심 4개가 모두 거짓이 된다(하니스가 진짜로 잡는다)',
    before.every((v) => v === false), before);
  const nowR = repCore(mrep), beforeR = repCore(stripRep(mrep));
  check('화면: 지금은 출처 표시 3개가 모두 참이다', nowR.every(Boolean), nowR);
  check('화면: 표시를 빼면 3개가 모두 거짓이 된다', beforeR.every((v) => v === false), beforeR);
}

console.log('\n─────────────────────────────────────────────');
console.log(`  통과 ${pass} · 실패 ${fail}`);
console.log('─────────────────────────────────────────────');
process.exit(fail ? 1 : 0);
