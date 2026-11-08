// ai_friend_reply_fuzz_harness.mjs — AI 영어친구 «모름·되묻기·답» 판정 반복 검사 (2026-11-08)
//   AI friend reply fuzz: thousands of labelled student sentences + hundreds of real-handler chats.
//
// 왜: 2026-11-05 F1~F5(「I don't know」 를 «천천히» 로 오해하지 않기 · 주제 유지 · 물으면 먼저 대답) 뒤 사장님
//     「샌드박스와 하니스로 수백 번 테스트 해서 문제없을 때까지 해줘」. 기존 샌드박스(ai_friend_no_repeat_question 대화 1,600회 ·
//     엘리더잼 7,920회)는 큰 횟수에서도 전부 초록이었지만, 그 대본은 «같은 질문 반복» 만 재고 학생 말의 «종류» 는 몇 개로 고정돼 있다.
//     그래서 학생 말을 «조합으로» 수천 개 만들어 판정 정본에 넣어 보니 19개가 틀렸다(2026-11-08 실측):
//       · «모른다» 인데 «평범한 답» 으로 읽힘 16개 — 「I really don't know」·「Uhm/Hm/Ah, I don't know」·「I don't know the answer」·
//         「I'm not really sure」·「Idk」·「I don't know, sorry teacher」 … → «쉽게 다시 묻기» 지시가 안 붙고 방금 질문이 «다룬 것» 으로 남는다
//       · «뜻을 모른다» 놓침 — 「I don't know what that word means」
//       · 한국어 «모르겠» 이 «문장 어디서나» 되묻기 — 「모르겠어요, 근데 저는 축구 좋아해요」 에 «천천히 다시 말해» 지시(11/5 영어 F1 과 같은 병)
//
// 무엇을 보나
//   ① 분류 말뭉치 — 판정 코드와 «따로» 적은 정답 표(R 되묻기 · D 모른다(그 말만) · A 답)를 앞말·뒷말·따옴표·대소문자로 불려
//      정본(isReaskRequest·isDontKnowAnswer)과 지시 쪽(api-ai.ts aiFriendIsMetaAsk — 소스에서 오려 냄)에 넣는다.
//      그리고 무작위 문장 수만 개로 «지시 쪽 = 정본» · «모른다와 되묻기는 겹치지 않는다» 를 실행해서 본다.
//   ② 실제 핸들러 — 대화 수백 번(절반 스트리밍 · 균형/자유 · 레벨 섞음)을 진짜 handleAiApi 로 돌려, 매 턴 모델에 넘어가는 지시를 읽는다:
//      R → «천천히·다시» 힌트 · D → «쉽게·두 개 중 고르기» 힌트 · A → 힌트 없음, 방금 질문은 «이미 물은 질문» 에 실림 ·
//      학생이 물으면 «먼저 대답» 규칙 · R/D 턴엔 균형 «교정 다시 묻기» 호출 0 · 답장이 깨지지 않음 · 대화가 기록에 남음.
//   ③ 속도 — 판정 정규식 다섯 줄(정본·지시 쪽 모두)이 긴 입력에서도 길이에 비례한다(키워드 × 공백 5만 자).
//
// 크기: AIF_FUZZ_CONVS(기본 120 — CI 몇 초) · AIF_FUZZ_SEED(기본 20261108). 크게: AIF_FUZZ_CONVS=3000 AIF_FUZZ_SEED=7
// 변이시험: AIF_SRC_DIR=<고친 src 사본> 으로 그 사본을 돌린다(저장소 파일은 안 건드린다).
// ⚠️ esbuild(cloudflare-deploy/node_modules)가 없으면 ② 를 못 돈다 — «건너뜀» 이 아니라 FAIL 로 말한다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleAiFriend, makeSandbox, rng } from './helpers/ai-friend-sandbox.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const SRC_DIR = process.env.AIF_SRC_DIR ? path.resolve(process.env.AIF_SRC_DIR) : path.join(root, 'cloudflare-deploy', 'src');
const CONVS = Math.max(1, Math.floor(Number(process.env.AIF_FUZZ_CONVS) || 120));
const SEED = Math.floor(Number(process.env.AIF_FUZZ_SEED) || 20261108);

let pass = 0, fail = 0;
const ok = (name, cond, info) => {
  if (cond) { pass++; console.log('  ✅', name); }
  else { fail++; console.log('  ❌ FAIL', name, info === undefined ? '' : '— ' + JSON.stringify(info).slice(0, 700)); }
};
const finish = () => {
  console.log(`ai_friend_reply_fuzz_harness — PASS ${pass} / FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
};

// ─── ⓪ 전제 ─────────────────────────────────────────────────────────────────
const b = await bundleAiFriend(SRC_DIR);
ok('⓪ 실제 핸들러·정본을 묶었다(전제 — 없으면 이 하니스의 핵심을 못 잰다)', !!b.M, b.error);
if (!b.M) finish();
const M = b.M;
const api = fs.readFileSync(path.join(SRC_DIR, 'api-ai.ts'), 'utf8');
let meta = null;
{
  // 지시 쪽 판정(aiFriendIsMetaAsk)은 핸들러 안 지역 함수라 import 를 못 한다 — 소스에서 오려 «실제로» 돌린다.
  const head = 'const aiFriendIsMetaAsk = (s: string) =>';
  const a = api.indexOf(head), e = a < 0 ? -1 : api.indexOf(';\n', a);
  try { meta = new Function('return (s) =>' + api.slice(a + head.length, e))(); } catch { meta = null; }
}
ok('⓪ 지시 쪽 판정(aiFriendIsMetaAsk)을 소스에서 오려 냈다(전제)', typeof meta === 'function' && meta('Can you say that again?') === true && meta('I like cats.') === false);
if (typeof meta !== 'function') finish();

// ─── ① 분류 말뭉치 — 정답은 판정 코드와 «따로» 적는다 ──────────────────────────────
console.log('① 분류 말뭉치 — R 되묻기 · D 모른다(그 말만) · A 답');
const uniq = (arr) => [...new Set(arr)];
const variants = (s) => uniq([s, s.replace(/'/g, '’'), s.toLowerCase()]);
// D — «답을 모른다» 그 말만. 앞말(망설임·부름)과 뒷말(선생님·미안·아직·웃음·ㅠㅠ)을 붙여 불린다.
const D_CORE = ["I don't know", 'I do not know', 'I dont know', "I really don't know", "I just don't know", "I don't really know", "I don't know the answer",
  'I dunno', 'idk', 'No idea', 'I have no idea', "I'm not sure", "I'm not really sure", 'Not sure'];
const D_PRE = ['', 'Um, ', 'Umm ', 'Uh, ', 'Uhm, ', 'Hm, ', 'Hmm... ', 'Ah, ', 'Er, ', 'Mmm, ', 'Well, ', 'Oh, ', 'Sorry, ', 'Actually, ', 'Honestly, ', 'Teacher, ', 'So, '];
const D_SUF = ['', '.', '!', '...', '?', ', teacher.', ', sorry.', ' yet.', ' haha', ' ㅠㅠ', ', sorry teacher.', ' either.'];
const D_KO = ['몰라요', '잘 몰라요', '몰라', '음 몰라요', '몰라요ㅠㅠ', '그건 잘 모르겠어요', '그건 모르겠어요.', '이건 진짜 모르겠어요', '어... 몰라요',
  '이거 모르겠어요', '그거는 진짜 모르겠어요ㅠㅠ', '음... 몰라요', '몰라요 선생님', '잘 몰라요ㅠ'];
const D = uniq([...D_CORE.flatMap((c) => D_PRE.flatMap((p) => D_SUF.flatMap((s) => variants(p + c + s)))), ...D_KO]);
// R — 못 알아들었다(다시·천천히·뜻을 모른다). 한국어 «모르겠어요» 는 «그 말만» 일 때 R 이다(한국어로는 «못 알아들었다» 로 더 자주 쓴다).
const R = uniq([
  'Can you say that again?', 'Can you say that again slowly?', 'Sorry, what?', 'What?', 'Huh?', 'Pardon?', "I don't understand.", "I don't understand the question.",
  'Can you speak slowly?', 'Please speak slowly.', 'Too fast!', 'Say it again, please.', 'Repeat please.', "I didn't hear you.", 'Can you use easy words?',
  "I don't know what that means.", "I don't know what that word means.", "I don't know what this word means, sorry.", "I don't know what you said.",
  "I don't know what you mean.", "I don't know what the word hobby means.", "I don't know what 'pet' means.", 'What does the word hobby mean?', "What does 'pet' mean, teacher?",
  'Um, what does that word mean?', 'What do you mean?', 'What does it mean?',
  '모르겠어요', '잘 모르겠어요', '음... 모르겠어요', '선생님 모르겠어요', '선생님, 무슨 말인지 모르겠어요', '무슨 말인지 모르겠어요', '뭔 소리인지 하나도 모르겠어요',
  '무슨 뜻인지 잘 모르겠어요.', '영어를 잘 모르겠어요', '질문을 모르겠어요', '잘 모르겠는데요?', '모르겠어요ㅠㅠ', '모르겠어요 선생님', '쌤 진짜 모르겠어요', '모르겠습니다.',
  '천천히 말해 주세요', '다시 말해 줘', '뭐라고요?', '못 알아들었어요', '이해가 안 가요', '모르겠어요. 다시 말해 주세요.', '모르겠어요, 천천히 말해 주세요',
  // 함정 대조(2026-11-08)가 짚은 «그 말만» 되묻기 — 첫 판이 «답» 으로 놓쳤다(일부는 화면 음성도 안 느려졌다)
  '너무 빨라서 모르겠어요', '무슨 말인지 모르겠어요 천천히요', '모르겠어요 천천히', '뭐라는지 모르겠어요', '무슨 소린지 모르겠어요', '뭔소린지 모르겠어요',
  '질문이 뭔지 모르겠어요', '모르겠어요 다시요', '어려워서 모르겠어요', '모르겠어요 ㅠ ㅠ', '저는 잘 모르겠어요', '저도 모르겠어요',
].flatMap(variants));
// A — 답(이야기). «모른다» 뒤에 이야기가 이어지거나 앞에 대답이 있으면 «그 말만» 이 아니다 — 학생이 꺼낸 얘기를 따라간다.
const A_STORY = [', anyway I like riding a bicycle.', '. But I love Beauty and the Beast.', ', but I like pizza.', ', maybe blue.', '. My favorite is soccer.', ', so let\'s talk about cats.'];
const A = uniq([
  ...D_CORE.flatMap((c) => A_STORY.map((s) => c + s)),
  'Maybe pizza, I don\'t know.', 'Pizza? I don\'t know.', "I don't know what to say.", "I don't know what it is.", "I don't know him.", "I don't know how to swim.",
  "I don't know his name.", "I don't know that.", "I don't know about that.", "I don't know what he said.", 'I like pizza but I don\'t know why.',
  "I don't know what kind of dog it is, but it is white.", "I don't know how to hear the sound.", "I didn't know that!", 'My mom doesn\'t know.', 'Nobody knows.',
  'Yes.', "No, I don't.", 'I like cats.', 'My dog is white.', 'Every day!', 'Because it is fun.', 'Yes, I know.', 'I know!', 'You know, I like cats.',
  'A snail is slow.', 'My sister is talking too fast.', "I don't understand it, but it is fun.",
  '모르겠어요, 근데 저는 축구 좋아해요.', 'I like dogs. 이유는 모르겠어요.', '이유는 모르겠어요', '몰라요, 근데 피자 좋아해요.', '왜 좋은지는 모르겠어요.', '엄마도 모르겠대요.',
  '아직 잘 모르겠지만 축구가 재밌어요.', '천천히 걸어요', '네',
  // 함정 대조(2026-11-08)가 짚은 «답» — 대명사·사람 이름의 «뜻» 은 낱말 질문이 아니다(첫 판이 되묻기로 삼켰다)
  'Yes. But sometimes I don\'t know what she means.', 'The doctor said something. I don\'t know what he meant.', "I don't know what they mean.",
  "I don't know what Grandpa means.", 'What does Mom mean?', 'What does she mean?', 'What does BTS mean?', 'What does Santa mean?', 'What does your dog mean to you?',
  // ⚠️ 따옴표·«the word» 없는 낱말 하나는 사람 이름과 가를 수 없어 «답» 으로 둔다(먼저 대답 규칙이 뜻을 설명하게 한다)
  "I don't know what hobby means.", 'What does hobby mean?',
].flatMap(variants));
// Q — 학생이 AI 에게 묻는다(답이기도 하다 — 힌트 없음).
const Q = ['What about you?', 'How about you?', 'Do you like pizza?', 'What is your favorite food?', 'Do you have a dog?', 'What is your hobby?'];
{
  const isR = (t) => M.isReaskRequest(t), isD = (t) => M.isDontKnowAnswer(t);
  const badR = R.filter((t) => !isR(t) || isD(t) || !meta(t));
  const badD = D.filter((t) => !isD(t) || isR(t) || meta(t));
  const badA = [...A, ...Q].filter((t) => isD(t) || isR(t) || meta(t));
  console.log(`  · 말뭉치 R ${R.length} · D ${D.length} · A ${A.length} · Q ${Q.length}`);
  ok(`①-1 «못 알아들었다»(R ${R.length}개)는 되묻기다 — 정본·지시 쪽 모두 · «모른다» 가 아니다`, badR.length === 0, badR.slice(0, 12));
  ok(`①-2 «모른다» 그 말만(D ${D.length}개 — 앞말·뒷말·따옴표·대소문자)은 «모른다» 답이다 · 되묻기가 아니다`, badD.length === 0, { n: badD.length, eg: badD.slice(0, 12) });
  ok(`①-3 이야기가 이어지거나 «모른다» 가 아닌 말(A ${A.length + Q.length}개)은 어느 쪽도 아니다(짝 — 넓히다 답을 삼키지 않는다)`, badA.length === 0, badA.slice(0, 12));
  ok('①-4 학생이 묻는 말(Q)은 «먼저 대답» 판정에 걸린다(전제 — ② 의 기대값)', Q.every((t) => M.aiFriendStudentAsked(t)), Q.filter((t) => !M.aiFriendStudentAsked(t)));
  // 무작위 문장 — 표에 없는 낱말 조합으로도 «지시 쪽 = 정본» 이고 두 판정이 겹치지 않는가
  const VOC = ["I", "don't", 'know', 'really', 'just', 'what', 'that', 'word', 'means', 'mean', 'does', 'hobby', 'um,', 'uh', 'hm,', 'sorry', 'teacher', 'please', 'say',
    'it', 'again', 'slowly', 'slow', 'down', 'too', 'fast', 'understand', 'not', 'sure', 'idk', 'no', 'idea', 'yes', 'like', 'pizza', 'but', 'anyway', 'the', 'answer',
    '모르겠어요', '잘', '몰라요', '무슨', '말인지', '선생님', '천천히', '말해', '주세요', '다시', '그건', '근데', '축구', '좋아해요', '뭐라고요', '영어를', 'ㅠㅠ', 'haha',
    '?', '.', '!', '...', ',', '’', "'"];
  const r = rng(SEED);
  let mismatch = [], both = [];
  const N = 30000;
  for (let i = 0; i < N; i++) {
    const n = 1 + Math.floor(r() * 7);
    const t = Array.from({ length: n }, () => VOC[Math.floor(r() * VOC.length)]).join(r() < 0.8 ? ' ' : '');
    if (meta(t) !== M.isReaskRequest(t)) mismatch.push(t);
    if (M.isReaskRequest(t) && M.isDontKnowAnswer(t)) both.push(t);
  }
  ok(`①-5 무작위 문장 ${N}개 — 지시 쪽(metaHint) 판정이 정본(isReaskRequest)과 언제나 같다`, mismatch.length === 0, mismatch.slice(0, 8));
  ok(`①-6 무작위 문장 ${N}개 — «모른다» 와 «되묻기» 는 한 번도 겹치지 않는다(지시가 두 힌트를 함께 받지 않게)`, both.length === 0, both.slice(0, 8));
}

// ─── ② 실제 핸들러 — 대화 수백 번 ──────────────────────────────────────────────
console.log(`② 실제 핸들러 — 대화 ${CONVS}번 (씨앗 ${SEED})`);
const SB = makeSandbox(M);
const META = /asking you to slow down \/ repeat \/ speak more simply/;
const DK = /does not know the answer to your last question/;
const ASKED_RULE = 'THE STUDENT JUST ASKED YOU SOMETHING';
const OLD_ANYWAY = /start your next question with "Anyway,"/;
// 모델이 낼 질문 — 대화마다 «주제» 를 한 번씩만 쓴다(같은 주제를 다른 말로 물으면 핸들러가 «같은 질문» 으로 다시 뽑는다 —
// 그 반복 검사는 ai_friend_no_repeat_question 가 맡고, 여기서는 학생 말의 «종류» 만 잰다).
const TOPICS = ['pizza', 'soccer', 'cats', 'rain', 'summer', 'music', 'math', 'movies', 'games', 'books', 'apples', 'swimming', 'drawing', 'robots', 'snow',
  'trains', 'cookies', 'dinosaurs', 'the beach', 'camping', 'baseball', 'piano', 'ice cream', 'puppies', 'space', 'cartoons'];
const FORMS = ['Do you like %?', 'Do you often think about %?', 'What do you think about %?', 'Is % fun for you?'];
const lastQuestion = (reply) => { const qs = M.questionsIn(reply); return qs.length ? qs[qs.length - 1] : ''; };
const CHEER = ['Nice!', 'Cool!', 'Great!', 'Wow!', 'Okay!'];
const pickW = (r, w) => { let x = r() * w.reduce((s, v) => s + v[1], 0); for (const [k, v] of w) { if ((x -= v) < 0) return k; } return w[w.length - 1][0]; };
const POOLS = { R, D, A, Q };
const stat = { convs: 0, turns: 0, stream: 0, byLabel: { R: 0, D: 0, A: 0, Q: 0 } };
const bad = { notOk: [], streamNotDone: [], R: [], D: [], A: [], Q: [], earlier: [], recheck: [], calls: [], rows: [] };
const t0 = Date.now();
// 핸들러의 진단 로그(「[student-twin] lookup failed」 등 — 가짜 D1 에 그 표가 없어서)는 이 절 동안 끈다. 판정은 반환값으로만 한다.
const quiet = { log: console.log, warn: console.warn, error: console.error };
console.warn = () => {}; console.error = () => {}; console.log = () => {};
try {
await SB.chat(await SB.guest(), 'Hi!');   // 표를 만든다(첫 호출이 ensureChatSchema 를 돈다)
for (let c = 0; c < CONVS; c++) {
  const r = rng(SEED * 31 + c);
  const g = await SB.guest();
  const stream = c % 2 === 1;
  const extra = { level: ['S3', 'S4', 'S6'][c % 3], correction_mode: c % 4 === 3 ? 'free' : 'balanced', ...(stream ? { stream: 1 } : {}) };
  const topics = TOPICS.slice();
  const nextQ = () => {
    const tp = topics.splice(Math.floor(r() * topics.length), 1)[0] || 'kites';
    return FORMS[Math.floor(r() * FORMS.length)].replace('%', tp);
  };
  SB.st.script = () => CHEER[Math.floor(r() * CHEER.length)] + ' ' + nextQ();
  stat.convs++;
  if (stream) stat.stream++;
  const turns = 5 + Math.floor(r() * 6);
  let said = 'Hi!', label = 'A', sent = 0, ended = false, prevQ = '';
  const answered = [];   // { q, label } — 그 질문에 학생이 무엇으로 답했나(R 로 답한 질문은 «아직 안 다룬 것» 이라 기억에 없다)
  for (let t = 0; t <= turns; t++) {
    const res = await SB.chat(g, said, extra);
    stat.turns++;
    const where = { c, t, said, label };
    if (!(res.status === 200 && res.ok === true && typeof res.reply === 'string' && res.reply.trim() && !/\[object Object\]|"reply"\s*:|^\s*[{[]/.test(res.reply))) {
      bad.notOk.push({ ...where, status: res.status, ok: res.ok, reply: res.reply }); ended = true; break;
    }
    sent++;
    if (stream && res.done !== 1) bad.streamNotDone.push(where);
    if (res.calls > 3) bad.calls.push({ ...where, calls: res.calls });
    if (t > 0) {
      stat.byLabel[label]++;
      const listed = res.sys.includes(JSON.stringify(prevQ) + ' →');
      const m = META.test(res.user), d = DK.test(res.user);
      if (label === 'R' && !(m && !d && !listed)) bad.R.push({ ...where, meta: m, dk: d, listed });
      if (label === 'D' && !(d && !m && !listed && !OLD_ANYWAY.test(res.sys))) bad.D.push({ ...where, meta: m, dk: d, listed });
      if (label === 'A' && !(!m && !d && listed)) bad.A.push({ ...where, meta: m, dk: d, listed });
      if (label === 'Q' && !(!m && !d && listed && res.sys.includes(ASKED_RULE))) bad.Q.push({ ...where, meta: m, dk: d, listed, asked: res.sys.includes(ASKED_RULE) });
      if ((label === 'R' || label === 'D') && res.rechecks.balanced !== 0) bad.recheck.push({ ...where, rechecks: res.rechecks });
      // 짝 — 방금 질문만 빠지고 «그 앞» 에 답을 들은 질문은 그대로 막는다(통째로 풀어 주면 같은 질문이 또 나간다)
      const earlier = [...answered].reverse().find((x) => x.label !== 'R');
      if (earlier && !res.sys.includes(JSON.stringify(earlier.q) + ' →')) bad.earlier.push({ ...where, earlier: earlier.q });
      if (prevQ) answered.push({ q: prevQ, label });
    }
    prevQ = lastQuestion(res.reply);   // 학생이 «실제로 들은» 답장의 질문(다시 뽑혔으면 그 결과)
    label = pickW(r, [['R', 3], ['D', 3], ['A', 3], ['Q', 1]]);
    const pool = POOLS[label];
    said = pool[Math.floor(r() * pool.length)];
  }
  if (!ended) {
    const rows = SB.rowsOf(g.uid);
    if (rows.length !== sent * 2) bad.rows.push({ c, rows: rows.length, want: sent * 2 });
  }
}
} finally {
  Object.assign(console, quiet);   // 던져도 로그는 되살린다(결과 줄이 안 나오면 «확인 못 함» 이 안 보인다)
}
console.log(`  · 대화 ${stat.convs}(스트리밍 ${stat.stream}) · 턴 ${stat.turns} · R ${stat.byLabel.R} · D ${stat.byLabel.D} · A ${stat.byLabel.A} · Q ${stat.byLabel.Q} · ${((Date.now() - t0) / 1000).toFixed(1)}초`);
ok(`② 대화를 실제로 돌렸다(전제) — 대화 ${stat.convs} · 턴 ${stat.turns} · 네 종류 모두 나옴`, stat.convs === CONVS && stat.turns >= CONVS * 6 && Object.values(stat.byLabel).every((n) => n > 0), stat);
ok('②-1 매 턴 정상 답(200 · ok · 빈 답·[object Object]·날 JSON 없음)', bad.notOk.length === 0, bad.notOk.slice(0, 3));
ok('②-2 스트리밍 대화는 매 턴 done 으로 끝난다', bad.streamNotDone.length === 0, bad.streamNotDone.slice(0, 3));
ok('②-3 R 턴 — «천천히·다시» 힌트만 붙고 방금 질문은 «이미 물은 질문» 에서 빠진다(다시 물어도 된다)', bad.R.length === 0, bad.R.slice(0, 4));
ok('②-4 D 턴 — «쉽게·두 개 중 고르기» 힌트만 붙고 방금 질문은 빠진다 · «Anyway, 다음 질문» 규칙 없음', bad.D.length === 0, bad.D.slice(0, 4));
ok('②-5 A 턴 — 힌트가 없고 방금 질문은 학생 답과 함께 «이미 물은 질문» 에 실린다(짝)', bad.A.length === 0, bad.A.slice(0, 4));
ok('②-6 Q 턴 — 학생이 물으면 «먼저 대답» 규칙이 실리고 힌트는 없다', bad.Q.length === 0, bad.Q.slice(0, 4));
ok('②-6b (짝) 어느 턴이든 «그 앞» 에 답을 들은 질문은 «이미 물은 질문» 에 남는다 — R·D 턴에 기억을 통째로 풀지 않는다', bad.earlier.length === 0, bad.earlier.slice(0, 4));
ok('②-7 R·D 턴은 균형 «교정 다시 묻기» 를 안 부른다(교정할 문장이 아니다 — 속도·비용 그대로)', bad.recheck.length === 0, bad.recheck.slice(0, 4));
ok('②-8 한 턴의 대화 모델 호출은 많아야 세 번(다시 뽑기 두 번까지)', bad.calls.length === 0, bad.calls.slice(0, 4));
ok('②-9 주고받은 말이 빠짐없이 기록에 남는다(학생 말 + AI 답 = 턴 × 2)', bad.rows.length === 0, bad.rows.slice(0, 4));

// ─── ③ 속도 — 판정 정규식이 긴 입력에서도 길이에 비례한다 ────────────────────────────
console.log('③ 속도 — 키워드 × 공백 5만 자');
{
  const lits = [];
  for (const m of api.slice(api.indexOf('const aiFriendIsMetaAsk'), api.indexOf("String(s || ''));", api.indexOf('const aiFriendIsMetaAsk')) + 20).matchAll(/(\/(?:\\.|[^/\n])+\/[a-z]*)\.test\(/g)) {
    try { lits.push(new Function('return ' + m[1])()); } catch { /* 아래 전제 검사가 말한다 */ }
  }
  ok('③ 전제: 지시 쪽 정규식 네 줄을 소스에서 읽었다', lits.length === 4, lits.length);
  const RES = [M.QM_REASK_KO, M.QM_REASK_EN, M.QM_REASK_ECHO, M.QM_REASK_DONT_KNOW_MEANING, ...lits];
  const KEYS = ['모르겠', '모르겠어요', '잘 모르겠', '선생님', '무슨 말인지', '뭔 소리인지', '영어를', '음', '어', 'ㅠ', '빨라서', '뭐라는지', '저는', '모르겠어요 ㅠ', "i don't know what", "i don't know what hobby",
    'what does', 'what does hobby', "what does 'hobby", 'what does the word', "i don't know what the word", 'um', 'sorry', 'teacher', '천천히 말', 'too fast', "i don't understand"];
  let worst = 0, at = '';
  for (const k of KEYS) for (const sep of [' ', ', ', '?', 'ㅠ', '. ']) {
    const t = k + sep.repeat(50000) + 'x', s0 = performance.now();
    for (const re of RES) re.test(t);
    const ms = performance.now() - s0;
    if (ms > worst) { worst = ms; at = JSON.stringify(k) + ' + ' + JSON.stringify(sep) + ' × 50000'; }
  }
  ok('③-1 되묻기 정규식(정본·지시 쪽 여덟 줄)이 5만 자에서도 1초 안', worst < 1000, { ms: Math.round(worst), at });
  let dkWorst = 0, dkAt = '';
  for (const k of ["i don't know", "i really don't know", 'um', 'uhm', 'hmm', 'mmm', 'idk', '그건', '몰라요', 'haha', 'ㅠ', 'x']) for (const sep of [' ', ', ', 'ㅠ', '... ']) {
    const t = k + sep.repeat(10000) + 'x', s0 = performance.now(); M.QM_DONT_KNOW.test(t);
    const ms = performance.now() - s0;
    if (ms > dkWorst) { dkWorst = ms; dkAt = JSON.stringify(k) + ' + ' + JSON.stringify(sep) + ' × 10000'; }
  }
  ok('③-2 «모른다» 정규식도 1만 자에서 300ms 안(앞 고정 ^ — 풀면 제곱)', dkWorst < 300, { ms: Math.round(dkWorst), at: dkAt });
}
finish();
