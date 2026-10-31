// SIU ADVANCE 010 — Beauty (8판 형식, 001 본보기)
// 원본과 다른 점:
//  - 문법 설명 "complex sentences with include at least two clauses" → "…that include at least two clauses" 로 뜻을 살려 새로 씀
//  - Q2 "What do you think of tattoos?Is it art or showing bad image to our body?" → "Are tattoos art, or do they give a bad image?"
//  - Q1 "…in people of the opposite sex?" → "…in the opposite sex?" (쪽 넘침 때문에 짧게)
//  - Q3 번호가 "B." 로 깨져 있었음 → Q3
//  - Q5 "\"No Make-Up Pay\"" → "\"No Make-Up Day\"" (OCR 오타로 봄)
//  - Q7 "Poes beauty affect…" → "Does beauty affect…"
//  - Q10 "Why some people spend…" → "Why do some people spend…"
//  - Keyword Make-up 을 한 낱말로 "make-up (noun)", Image 뜻을 짧게, Support 뜻을 «지지하다» 로
//  - 쉬운 판(중고생): 성형(Q3)·이성(Q1)은 «자연스러운 모습·좋은 성격» 으로 답을 돌림 — 성형 이야기는 어려운 판에서만
export default {
 no: "a010",
 title: "Beauty",
 book: "SIU ADVANCE 010 - Beauty",
 next: "011 Crime",
 cover: { h1: "What Is", em: "Beauty?", goals: ["Give opinions about beauty and looks", "Ask and answer 10 questions", "Join ideas with when · because · although"] },
 KW: [
  ["opposite", "adjective", "반대의", "completely different from another thing"],
  ["image", "noun", "이미지, 인상", "the idea people have of how someone looks or is"],
  ["support", "verb", "지지하다, 찬성하다", "to agree with an idea and help it"],
  ["pageant", "noun", "미인 대회", "a contest where people are judged on looks and talent"],
  ["make-up", "noun", "화장품, 화장", "colors like lipstick that people put on their face"],
  ["prevent", "verb", "막다, 예방하다", "to stop something from happening"],
  ["beauty", "noun", "아름다움", "the quality of looking or being very nice"],
  ["appearance", "noun", "외모", "the way someone or something looks"],
  ["proverb", "noun", "속담", "a short, well-known saying that gives advice"],
  ["some", "pronoun", "일부, 어떤 사람들", "a number of people or things, but not all"]
 ],
 QS: [
  "What do you find most attractive in the opposite sex?",
  "Are tattoos art, or do they give a bad image?",
  "Do you support plastic surgery? Why or why not?",
  "What's your opinion of beauty pageants like Miss Universe?",
  "\"No Make-Up Day\": would this be a good idea?",
  "Can aging be prevented or slowed?",
  "Does beauty affect one's success in life?",
  "If you could change one thing about your appearance, what would it be?",
  "What do you think of the proverb \"Beauty is in the eye of the beholder\"?",
  "Why do some people spend too much time and money on beauty?"
 ],
 IMG_E: ["scene-words/16117", "scene-words/15762", "scene-words/17108", "scene-words/21109", "scene-words/17369", "scene-words/12199", "scene-words/12187", "scene-words/18184", "scene-words/18810", "scene-words/12506"],
 IMG_H: ["scene-words/18771", "scene-words/17121", "scene-words/10007", "scene-words/16396", "scene-words/18782", "scene-words/16880", "scene-words/16908", "scene-words/15207", "scene-words/18557", "scene-words/13289"],
 PICS: {
  opener: "scene-words/16172",
  talk: "scene-words/18557",
  group: "scene-words/10019",
  speech: "scene-words/15095",
  reporter: "scene-words/16345",
  survey: "scene-words/18770",
  pron: "scene-clips/7170",
  roleB: "scene-words/18782",
  cover: "scene-words/15789",
  back: "scene-words/15393"
 },
 gram1: {
  can: "join ideas with when · because · although",
  title: "Joining",
  em: "Words",
  rules: [
   ["Time", "<b>When</b> I feel nervous, I smile."],
   ["Reason / contrast", "I like her <b>because</b> she's kind. <b>Although</b> he's shy, he's fun."]
  ],
  hardNote: "when · whenever · as · because · although · if · unless",
  say: [
   "Subordinating conjunctions join a small clause to a main clause.",
   "When I feel nervous, I smile.",
   "I like her because she's kind. Although he's shy, he's fun."
  ]
 },
 gram2: {
  can: "ask \"What do you do when…?\"",
  cols: ["when · if · whenever", "because · although"],
  rows: [
   ["+", "<b>When</b> I smile, I feel better.", "I like him <b>because</b> he's funny."],
   ["−", "I <b>don't</b> wear make-up <b>when</b> I exercise.", "<b>Although</b> it isn't new, it looks great."],
   ["?", "What do you do <b>when</b> you're nervous?", "Why? — <b>Because</b> it's fun."]
  ]
 },
 gapCan: "ask \"Why does she…?\"",
 role: {
  title: "The",
  em: "Style",
  tail: "Advisor",
  opener: "Hi! How can I help you look and feel your best today?",
  a: "Style advisor",
  b: "Client"
 },
 pron: {
  can: "pause after a joining clause",
  title: "Pausing with",
  em: "clauses",
  game: "Teacher says the first half → you finish it with a clear pause: <i>\"When I'm tired, ‖ I take a walk.\"</i>"
 },
 E: {
  steps: ["Answer", "More"],
  model: [
   ["I like people who are kind and funny.", "A warm smile is attractive, too."],
   ["I think some tattoos look like art.", "But I think people should wait until they're adults."],
   ["No, I don't. I think natural faces are beautiful.", "Being healthy is more important."],
   ["I think they're a little old-fashioned.", "A talent show is fairer because everyone can join."],
   ["I think it's a good idea for schools.", "When nobody wears make-up, everyone feels equal."],
   ["Yes, I think it can be slowed.", "Sleeping well and eating fruit help a lot."],
   ["I think it helps a little.", "But kindness and hard work matter more."],
   ["I would change my hair color.", "I'd like to try blue hair for a day!"],
   ["I agree with it.", "Different people think different things are beautiful."],
   ["Because they want to look like stars.", "When they see ads, they want to buy more."]
  ],
  frame: [
   "I like people who are ___. ___ is attractive, too.",
   "I think tattoos are ___ because ___.",
   "Yes, I do. / No, I don't. I think ___.",
   "I think they are ___ because ___.",
   "I think it's a ___ idea. When ___, ___.",
   "I think aging can be slowed by ___.",
   "I think beauty ___. But ___ matters more.",
   "I would change my ___ because ___.",
   "I agree / don't agree because ___.",
   "Because they want to ___."
  ],
  bank: [
   ["kind", "funny", "honest", "smart"],
   ["art", "cool", "a bad idea", "forever"],
   ["be natural", "love yourself", "stay healthy", "smile more"],
   ["old-fashioned", "fun to watch", "unfair", "exciting"],
   ["good", "bad", "fun", "strange"],
   ["sleeping well", "eating fruit", "exercising", "smiling"],
   ["helps a little", "doesn't matter", "is important", "is not fair"],
   ["hair", "height", "eyes", "style"],
   ["tastes are different", "it's true", "it's kind", "people agree"],
   ["look like stars", "feel confident", "follow trends", "get likes"]
  ],
  more: [
   ["Who is your role model?", "What do you like about them?"],
   ["Do you know anyone with a tattoo?", "Would you get one later?"],
   ["What makes a person look happy?", "Do you like your natural look?"],
   ["Have you ever watched a contest show?", "Who should win a contest?"],
   ["Do students wear make-up at your school?", "Should schools have rules about it?"],
   ["How do you stay healthy?", "Do you want to look young at 60?"],
   ["Who is a successful person you know?", "Is he or she good-looking?"],
   ["What do you like about your looks?", "Do you ever change your style?"],
   ["What do you think is beautiful?", "Do you and your friends agree?"],
   ["How much do you spend on clothes?", "Do ads make you want things?"]
  ],
  gram1: {
   chain: ["When I feel ___, I ___.", "I like ___ because ___."],
   ex: "T: When I feel tired, I drink water.<br>S: When I feel happy, I sing.<br>T: I like …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["Why do you like pizza?", "What do you do when you're sad?", "Why do you like summer?", "When are you happy?", "What do you do when bored?"],
    ans: "When I …, I … <b>+ one more</b>"
   },
   b: {
    title: "Finish my sentence",
    big: "Although I'm not ___, I'm ___.",
    ans: "Then ask: <b>What are you good at?</b>"
   }
  },
  opener: {
   think: ["Look at the photo. Why does she look beautiful?", "Who is someone you think is beautiful — inside or out?", "Is a smile more important than a face?"]
  },
  convo: [
   ["A", "I love your {new haircut}!"],
   ["B", "Thanks! I changed it because I wanted {a fresh look}."],
   ["A", "It really suits you."],
   ["B", "Do you think looks are important?"],
   ["A", "A little. But when someone is {kind}, they look beautiful to me."],
   ["B", "I agree. My grandma is {always smiling}, and she looks great."],
   ["A", "That's true. A smile is the best style!"]
  ],
  swap: [["something new", "new haircut"], ["a reason", "a fresh look"], ["a personality word", "kind"], ["a habit", "always smiling"]],
  lang: [
   ["Give a compliment", ["I love your …!", "It really suits you.", "You look great!"]],
   ["Give an opinion", ["I think …", "In my opinion, …"]],
   ["Agree / disagree", ["I agree.", "That's true.", "I'm not so sure."]]
  ],
  langPractice: ["I got new glasses.", "Looks are very important.", "I want to be a model.", "My favorite singer has tattoos.", "I don't like my hair.", "Kind people are beautiful."],
  survey: {
   ask: "Do you",
   cols: ["Me", "My teacher"],
   rows: ["check the mirror every day", "like your hair color", "follow fashion trends", "care about brands", "watch beauty videos", "smile a lot"],
   q: "Do you …?  → Yes, I do. / No, I don't. + Why?",
   report: "I ___, but my teacher ___."
  },
  gap: {
   who: "Yuna's style",
   q: ["What does Yuna do when she's nervous?", "Why does she like her grandma's style?", "What does she wear when it's cold?", "Why doesn't she follow trends?"],
   A: [["when nervous", "she smiles"], ["grandma's style", "?"], ["when cold", "a long red coat"], ["no trends", "?"]],
   B: [["when nervous", "?"], ["grandma's style", "because it's simple"], ["when cold", "?"], ["no trends", "because they change fast"]],
   tip: "<b>When</b> she's nervous, she … · <b>Because</b> it's …"
  },
  role: {
   A: ["You are a style advisor.", "Ask 5 questions.", "Give one tip for a school event."],
   B: ["You have a school event soon.", "Choose: graduation / talent show / class photo.", "Answer with because / when."]
  },
  tts: {
   title: "Make a \"Beautiful people\" poster",
   steps: ["List 3 things that make a person beautiful.", "Ask your teacher 3 of today's questions.", "Pick your top 3 together.", "Show your poster and tell!"],
   lang: ["A person is beautiful when ___.", "I chose ___ because ___.", "Although ___, ___."]
  },
  speech: {
   time: "1 min",
   model: ["Hello! Let me tell you who I think is beautiful.", "It's my grandmother.", "Although she has wrinkles, she's beautiful to me.", "When she laughs, everyone laughs too.", "She always helps people because she's kind.", "Beauty is more than a face. Thank you!"],
   outline: ["Hello", "Who", "Although …", "When …", "Because …", "Thank you!"],
   check: ["Loud voice", "Look at teacher", "when / because / although"]
  },
  pron: {
   cols: [["time ‖", ["when", "whenever", "if"]], ["reason", ["because", "as", "since"]], ["contrast ‖", ["although", "though", "unless"]]],
   up: "Do you like your style?",
   down: "Why do you like it?"
  },
  review: ["I can give opinions about beauty.", "I can use when / because / although.", "I can give a compliment.", "I can say one more sentence."]
 },
 H: {
  steps: ["Answer", "Reason", "Example", "Ask back"],
  model: [
   ["Confidence and humor attract me most.", "Looks fade, but personality lasts.", "My best friend isn't a model, but everyone loves her.", "What about you?"],
   ["I think tattoos can be real art.", "Many tattoo artists are very skilled.", "My cousin's small tattoo honors her late dad.", "Would you ever get a tattoo?"],
   ["I support it when it's for health, but not for trends.", "Surgery always has risks.", "A friend fixed her eyelids because they blocked her vision.", "Where would you draw the line?"],
   ["I think pageants are outdated.", "They judge women mostly on their bodies.", "Some pageants now focus on speeches, which I like better.", "Have you ever watched one?"],
   ["I think it could be a great idea.", "It would reduce pressure and save time.", "When my office had one, people felt surprisingly relaxed.", "Would you join a No Make-Up Day?"],
   ["I think aging can be slowed, but not stopped.", "Diet, sleep and exercise make a big difference.", "My sixty-year-old aunt runs every morning and looks forty-five.", "What do you do to stay healthy?"],
   ["Sadly, yes, I think it does.", "Studies show attractive people are often hired first.", "Some companies still ask for photos on résumés.", "Do you think that's fair?"],
   ["I'd make myself a little taller.", "I sometimes feel small in crowds.", "At concerts, I can never see the stage!", "What would you change?"],
   ["I completely agree with that proverb.", "Beauty standards change across cultures and times.", "In old paintings, fuller bodies were seen as ideal.", "What's beautiful in your culture?"],
   ["I think social media is a big reason.", "People compare themselves to edited photos.", "Some of my friends spend half their pay on skincare.", "How much do you spend on your looks?"]
  ],
  frame: [
   "… attracts me most because …",
   "I think tattoos are … because …",
   "I support / don't support it when … because …",
   "I think pageants are … because …",
   "I think it would be … because … When …",
   "I think aging can be … because …",
   "I think beauty does / doesn't … because …",
   "I'd change my … because … Whenever …",
   "I agree / disagree because … Although …",
   "I think it's because … For example, …"
  ],
  more: [
   ["What matters more at first — looks or personality?", "Are beauty standards different for men and women?", "Can someone become more attractive over time?"],
   ["Should companies accept visible tattoos?", "Why do some cultures dislike tattoos?", "Would you get one?"],
   ["Why is plastic surgery so common in Korea?", "Should teenagers be allowed to have it?", "Would you ever consider it?"],
   ["Should pageants be banned?", "Are there male pageants too?", "How would you change a pageant?"],
   ["Why do people feel they must wear make-up?", "Should men wear make-up too?", "Would a No Make-Up Day work in Korea?"],
   ["Why are people afraid of aging?", "Is anti-aging just a business?", "Would you take a pill to look young forever?"],
   ["Is it fair that looks affect jobs?", "Should résumés have photos?", "How can society reduce lookism?"],
   ["Is it good to accept your appearance?", "Do filters change how we see ourselves?", "What do you like most about your looks?"],
   ["Is there a universal idea of beauty?", "Who sets beauty standards today?", "What would you tell a teen who feels ugly?"],
   ["Is spending on beauty an investment?", "Do ads create insecurity?", "How much is too much?"]
  ],
  gram1: {
   chain: ["Although ___, I think ___ because ___.", "Whenever I ___, I feel ___, unless ___."],
   ex: "T: Although looks matter, I think kindness matters more because it lasts.<br>S: Although …<br>T: …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["What do you do when you have a bad hair day?", "Why do people follow beauty trends?", "Would you get surgery if it were free?", "What do you notice first when you meet someone?", "Why do people use photo filters?"],
    ans: "When / If / Because / Although … <b>+ example</b>"
   },
   b: {
    title: "Two sides",
    big: "Although ___, ___. Because of this, I think ___. Do you agree?",
    ans: "Then ask: <b>What's your view?</b>"
   }
  },
  opener: {
   think: ["Is beauty mostly about looks, or about something deeper?", "Why do beauty standards change over time?", "Does social media make people feel less beautiful?"]
  },
  convo: [
   ["A", "Did you see that {skincare ad}? It says we'll look ten years younger."],
   ["B", "I did. Although it looks nice, I don't believe it."],
   ["A", "Why not?"],
   ["B", "Because {most of the photos are edited}."],
   ["A", "True. Whenever I scroll, I feel like I'm not good enough."],
   ["B", "Me too. That's why I {take breaks from social media}."],
   ["A", "Does it help?"],
   ["B", "A lot. When I stop comparing, I {feel much happier}."],
   ["A", "Maybe I'll try that. Thanks for the tip!"]
  ],
  swap: [["a beauty product", "skincare ad"], ["a reason", "edited photos"], ["your solution", "take breaks…"], ["the result", "feel much happier"]],
  lang: [
   ["Give an opinion", ["Personally, I think …", "To be honest, …", "The way I see it, …"]],
   ["Contrast", ["Although …, …", "On the other hand, …", "That's true, but …"]],
   ["Ask for reasons", ["Why do you think so?", "What makes you say that?"]],
   ["Agree / disagree", ["Exactly.", "I see your point, but …"]]
  ],
  langPractice: ["Beautiful people have easier lives.", "Tattoos look unprofessional.", "I'd never wear make-up.", "Pageants empower women.", "Plastic surgery is like braces.", "Aging is beautiful."],
  survey: {
   ask: "Do you think",
   cols: ["Me", "My teacher", "One more question"],
   rows: ["looks affect success", "tattoos are art", "pageants should end", "men should wear make-up", "filters are harmful", "beauty is in the eye of the beholder"],
   q: "Do you think …? → Yes. → Ask: Why? / Although …? / Example?",
   report: "Although my teacher thinks ___, I think ___ because ___."
  },
  gap: {
   who: "Yuna's job",
   q: ["Why is Yuna a make-up artist?", "What does she do when a client is nervous?", "Why doesn't she like heavy make-up?", "What does she do in her free time?", "What would she change?"],
   A: [["why", "she loved theater"], ["nervous client", "?"], ["heavy make-up", "it hides faces"], ["free time", "?"], ["change", "?"]],
   B: [["why", "?"], ["nervous client", "she tells a joke"], ["heavy make-up", "?"], ["free time", "teaches classes"], ["change", "shorter hours"]],
   tip: "<b>Why</b> did she …? — <b>Because</b> … · <b>When</b> a client …, she …"
  },
  role: {
   A: ["You are an image consultant.", "Ask 5 questions + 2 follow-ups.", "Give 3 tips with when / because / although."],
   B: ["You have a big job interview soon.", "Choose: bank / fashion brand / startup.", "Explain your worries and your style."]
  },
  tts: {
   title: "Plan a \"Real beauty\" campaign",
   steps: ["Think: what message about beauty matters?", "Ask your teacher 4 of today's questions.", "Agree on a slogan and 3 ideas.", "Present your campaign in 1 minute."],
   lang: ["We chose ___ because ___.", "Although many ads ___, we ___.", "When people see this, they'll ___."]
  },
  speech: {
   time: "2 min",
   model: ["Hi everyone. Today I'll talk about beauty and social media.", "When I was sixteen, I spent hours editing my photos.", "Although I looked perfect online, I felt worse offline.", "That's because I compared myself to everyone.", "So I deleted my editing apps last year.", "Now, whenever I post, I use real photos.", "I think beauty is being comfortable as you are.", "Thanks for listening! Any questions?"],
   outline: ["Hook — \"Today I'll talk about…\"", "When … (past story)", "Although … (the problem)", "Because … (the reason)", "What you changed", "Your opinion + questions"],
   check: ["Clear voice", "Eye contact", "Joining words", "Answer 1 question"]
  },
  pron: {
   cols: [["time ‖", ["when", "whenever", "as soon as"]], ["reason", ["because", "since", "as"]], ["contrast ‖", ["although", "even though", "unless"]]],
   up: "Would you ever get a tattoo?",
   down: "Why do people follow trends?"
  },
  review: ["I can answer in 4 parts.", "I can use when / because / although.", "I can give and support opinions.", "I can give a short presentation."]
 }
};
