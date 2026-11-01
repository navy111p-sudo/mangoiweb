// question-pool.mjs — «같은 질문 두 번 금지» 샌드박스가 함께 쓰는 질문 묶음·학생 답·모델 흉내 (2026-10-28)
//
// 왜 한 벌인가: 일반 A.i 말하기(warmup_no_repeat_question_harness)와 AI 영어친구(ai_friend_no_repeat_question_harness)가
//   같은 판정(src/question-memory.ts)을 쓴다. 정답 표를 두 벌로 두면 한쪽만 고쳐져 «같은 판정을 다른 기준으로» 채점하게 된다.
// ⚠️ 정답 표(개념 번호)는 판정 코드와 «따로» 적은 것이다 — 판정을 판정으로 채점하지 않으려고.
// ⚠️ 모델 흉내의 «다시 뽑기 힌트를 알아보는 글자» 는 화면마다 다르다(웜업 한국어 · AI 영어친구 영어) — talkKit 에 넘긴다.
// 질문 묶음: 개념 번호(정답 표)마다 «같은 질문의 여러 말». imply = 이 질문을 했으면 저 질문도 이미 다룬 것(이유를 물었으면 좋아하는지는 다룬 것).
// reveal = 학생 답이 알려 주는 개념(「작고 하얀 개」 → 크기·색). 판정 코드(question-memory.ts)와 «따로» 적었다.
const T = (noun, n2) => ({
  have: { q: [`Do you have a ${noun}?`, `Do you have a ${n2}?`] },
  like: { q: [`Do you like ${noun}s?`, `Do you love ${noun}s?`] },
  why: { q: [`Why do you like ${noun}s?`], imply: ['like'] },
  size: { q: [`Is your ${noun} big?`, `Is your ${noun} small?`, `Is your ${noun} big or small?`, `Is your ${n2} little?`] },
  color: { q: [`What color is your ${noun}?`, `Is your ${noun} black?`, `Is your ${noun} white?`, `Is your ${noun} brown?`] },
  name: { q: [`What is your ${noun}'s name?`, `What's your ${noun}'s name?`] },
  age: { q: [`How old is your ${noun}?`, `Is your ${noun} old?`] },
  walk: { q: [`Do you walk your ${noun}?`] },
  eat: { q: [`What does your ${noun} eat?`] },
  play: { q: [`Do you play with your ${noun}?`] },
  how: { q: [`How do you play with your ${noun}?`], imply: ['play'] },
  swim: { q: [`Can your ${noun} swim?`] },
  sleep: { q: [`Where does your ${noun} sleep?`] },
  trick: { q: [`Can your ${noun} do tricks?`] },
  run: { q: [`Can your ${noun} run fast?`] },
});
export const POOL = {
  dog: T('dog', 'puppy'),
  cat: T('cat', 'kitten'),
  food: {
    fav: { q: ['What is your favorite food?', "What's your favorite food?"] },
    pizza: { q: ['Do you like pizza?', 'Do you love pizza?'] },
    whyp: { q: ['Why do you like pizza?'], imply: ['pizza'] },
    breakfast: { q: ['What did you eat for breakfast?'] },
    cook: { q: ['Can you cook?'] },
    spicy: { q: ['Do you like spicy food?'] },
    fruit: { q: ['What fruit do you like?'] },
    dinner: { q: ['What do you eat for dinner?'] },
  },
  school: {
    like: { q: ['Do you like school?', 'Do you love school?'] },
    subject: { q: ['What is your favorite subject?'] },
    friend: { q: ['Who is your best friend at school?'] },
    teacher: { q: ['Is your teacher kind?'] },
    lunch: { q: ['What do you eat for lunch at school?'] },
    go: { q: ['How do you go to school?'] },
    homework: { q: ['Do you have a lot of homework?'] },
    size: { q: ['Is your school big?', 'Is your school small?'] },
  },
  weekend: {
    like: { q: ['Do you like weekends?'] },
    todo: { q: ['What do you like to do on weekends?'], imply: ['like'] },
    last: { q: ['What did you do last weekend?'] },
    park: { q: ['Do you go to the park on weekends?'] },
    late: { q: ['Do you sleep late on weekends?'] },
    grandma: { q: ['Do you visit your grandma on weekends?'] },
  },
  sports: {
    like: { q: ['Do you like sports?'] },
    fav: { q: ['What is your favorite sport?'] },
    soccer: { q: ['Can you play soccer?'] },
    swim: { q: ['Can you swim?'] },
    watch: { q: ['Do you watch soccer on TV?'] },
    run: { q: ['Can you run fast?'] },
  },
  family: {
    brother: { q: ['Do you have a brother?'] },
    sister: { q: ['Do you have a sister?'] },
    mom: { q: ['What does your mom like to cook?'] },
    dad: { q: ['Is your dad tall?', 'Is your dad short?'] },
    bage: { q: ['How old is your brother?'] },
    pet: { q: ['Does your family have a pet?'] },
  },
  colors: {
    fav: { q: ['What is your favorite color?', "What's your favorite color?"] },
    room: { q: ['What color is your room?'] },
    shirt: { q: ['What color is your shirt today?'] },
    sky: { q: ['Is the sky blue today?'] },
  },
  weather: {
    rain: { q: ['Do you like rainy days?'] },
    snow: { q: ['Do you like snow?'] },
    umbrella: { q: ['Do you have an umbrella?'] },
    season: { q: ['What is your favorite season?'] },
  },
  hobby: {
    draw: { q: ['Do you like to draw?'] },
    game: { q: ['What games do you play?'] },
    book: { q: ['What is your favorite book?'] },
    music: { q: ['Do you like music?'] },
    song: { q: ['What song do you like?'] },
    piano: { q: ['Can you play the piano?'] },
  },
};
// 학생 답 — [글, 이 답이 알려 주는 다른 개념]
export const ANSWERS = {
  have: [['Yes, I have one.', []], ['Yes! His name is Max.', ['name']], ['Yes, a small white one.', ['size', 'color']], ['yes he is three years old', ['age']]],
  size: [["It's small, 7 kg.", []], ['He is very big.', []]],
  color: [['He is white.', []], ['Black and white.', []]],
  name: [['His name is Coco.', []], ['Max.', []]],
  age: [['He is two years old.', []], ['Three.', []]],
  brother: [['Yes, he is ten years old.', ['bage']], ['Yes, one.', []]],
};
export const GENERIC = [['Yes.', []], ['No.', []], ['I like it a lot.', []], ['I don\'t know.', []], ['Every day!', []], ['Because it is fun.', []]];
export const REACT = ['Nice!', "Wow, that's cool!", 'I see.', 'That sounds fun!', 'Great answer!', 'Oh, very cool.', 'Me too!'];
export const PREFIX = ['', '', '', 'By the way, ', 'So, ', 'Oh, and ', 'And ', 'Still, ', 'Also, '];
export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
export const asQ = (r, q) => { const p = pick(r, PREFIX); return p ? p + q.charAt(0).toLowerCase() + q.slice(1) : q; };
export const TOPIC_SETS = [['dog', 'food'], ['cat', 'school'], ['weekend', 'sports'], ['family', 'colors'], ['weather', 'hobby'], ['dog', 'family', 'hobby'], ['cat', 'weekend', 'food'], ['school', 'sports', 'weather'], ['colors', 'dog', 'cat'], ['hobby', 'food', 'school']];
export const MODES = [{ drift: 0.15, obey: 1 }, { drift: 0.35, obey: 1 }, { drift: 0.7, obey: 1 }, { drift: 0.35, obey: 0.8 }];

/** M = 판정 정본 모듈(questionNorm·questionsIn), hintRe = «다시 뽑아라» 힌트를 알아보는 정규식. */
export function talkKit(M, hintRe) {
  // 질문 글 → 개념 번호(정답 표). 질문 묶음에 없는 글이면 null.
  const CID = new Map();
  for (const [topic, cs] of Object.entries(POOL)) for (const [c, v] of Object.entries(cs)) for (const q of v.q) CID.set(M.questionNorm(q), topic + '.' + c);
  const cidOf = (q) => CID.get(M.questionNorm(q)) || null;
  /* 모델 흉내: drift 확률로 «이미 다룬 질문» 의 다른 말(반대말·같은 뜻 낱말·접속사)을 내고, 아니면 새 질문.
     다시 뽑을 때(힌트를 받으면) obey 확률로 새 질문, 아니면 또 같은 질문. 가끔 맞장구 질문(Really?·How about you?)을 섞는다. */
  function makeTalk(seed, first, drift, obey) {
    const r = rng(seed);
    /* 고른 주제를 다 물으면 다른 주제로 넘어간다 — 실제 모델은 새 질문을 늘 지어낼 수 있으니 «물을 것이 바닥난» 상황은 만들지 않는다. */
    const topics = first.concat(Object.keys(POOL).filter((t) => !first.includes(t)));
    const covered = new Set();   // 정답 표 기준 «이미 다룬 개념»
    let topicAt = 0;
    const newQ = () => {
      for (let t = topicAt; t < topics.length; t++) {
        const cs = POOL[topics[t]];
        const left = Object.keys(cs).filter((c) => !covered.has(topics[t] + '.' + c));
        if (left.length) { topicAt = t; const c = pick(r, left); return asQ(r, pick(r, cs[c].q)); }
      }
      return null;
    };
    const oldQ = () => { const cov = [...covered].filter((x) => CID.size && x); if (!cov.length) return null; const id = pick(r, cov); const [t, c] = id.split('.'); return asQ(r, pick(r, POOL[t][c].q)); };
    const reply = (q) => { let s = pick(r, REACT) + ' '; if (r() < 0.1) s = 'Really? ' + s; s += q; if (r() < 0.1) s += ' How about you?'; return s; };
    return {
      r, covered,
      first() { const repeat = covered.size && r() < drift; const q = (repeat ? oldQ() : null) || newQ() || oldQ(); return reply(q); },
      retry(msgs) { const hinted = hintRe.test(msgs[msgs.length - 1].content); const q = (hinted && r() < obey ? newQ() : oldQ()) || newQ(); return reply(q); },
      answer(aiText) {
        const qs = M.questionsIn(aiText).map((q) => [q, cidOf(q)]).filter((x) => x[1]);
        let said = pick(r, GENERIC);
        for (const [, id] of qs) {
          const [t, c] = id.split('.');
          covered.add(id);
          for (const im of POOL[t][c].imply || []) covered.add(t + '.' + im);
          const pool = ANSWERS[c];
          if (pool) said = pick(r, pool);
          for (const rv of said[1]) covered.add(t + '.' + rv);
        }
        return said[0];
      },
    };
  }
  const repeatsIn = (text, covered) => M.questionsIn(text).map(cidOf).filter((id) => id && covered.has(id)).length;
  return { CID, cidOf, makeTalk, repeatsIn };
}
