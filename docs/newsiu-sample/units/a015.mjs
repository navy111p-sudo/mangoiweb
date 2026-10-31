// SIU ADVANCE 015 — Philosophy (8판 형식, 001 본보기)
// 원본과 다른 점:
//  - Q4 "How do you know that God exists? (Doesn't exist?)" → "Do you think God exists? Why or why not?" (믿지 않는 사람도 답할 수 있게, 존중하는 말투로)
//  - 대답 틀 "We should care others" → "care about others", "Gravity work in the way of" → "works", "If the society dont have any law" → "doesn't have any laws", "The only limits in human creativity is" → "…to human creativity are"
//  - Keyword Exist 뜻 "live, especially under adverse conditions" → "to be real" (질문 뜻에 맞게)
//  - Keyword Care 뜻이 명사풀이에 가까움 → 동사 care about 뜻으로 바로잡음
//  - 쉬운 판(중고등): Q4 신에 대한 질문은 «사람마다 믿음이 다르고 서로 존중한다» 로 답함(한쪽 입장을 가르치지 않음)
export default {
 no: "a015",
 title: "Philosophy",
 book: "SIU ADVANCE 015 - Philosophy",
 next: "016 Animals",
 cover: { h1: "Big Questions,", em: "Philosophy", goals: ["Talk about life's big questions", "Ask and answer 10 questions", "Say how often things happen"] },
 KW: [
  ["care", "verb", "신경 쓰다, 아끼다", "to feel that someone is important to you"],
  ["destiny", "noun", "운명", "the things that must happen to you in the future"],
  ["karma", "noun", "업보, 인과응보", "the idea that your actions come back to you"],
  ["exist", "verb", "존재하다", "to be real"],
  ["gravity", "noun", "중력", "the force that pulls things down toward the earth"],
  ["end", "noun", "끝, 종말", "the final part of something"],
  ["universe", "noun", "우주", "all of space with every star and planet"],
  ["creativity", "noun", "창의성", "the ability to make new and original things"],
  ["society", "noun", "사회", "people living together in a community"],
  ["wisdom", "noun", "지혜", "using what you know to make good choices"]
 ],
 QS: [
  "Why should we care about others?",
  "Do you believe in fate or destiny?",
  "Do you believe in karma?",
  "Do you think God exists? Why or why not?",
  "What is gravity and how does it work?",
  "When do you think the world will \"end\"?",
  "What do you think existed before the universe was created?",
  "Are there limits to human creativity?",
  "Can a society exist without laws?",
  "Is intelligence or wisdom more useful?"
 ],
 IMG_E: ["scene-words/12109", "scene-clips/7383", "scene-words/17386", "scene-words/15662", "scene-words/15437", "scene-words/14588", "scene-words/13364", "scene-words/15160", "scene-words/21283", "scene-words/14361"],
 IMG_H: ["scene-words/14245", "scene-words/18667", "scene-words/18467", "scene-words/21377", "scene-words/15437", "scene-words/16029", "scene-words/18164", "scene-words/13034", "scene-words/13074", "scene-words/21042"],
 PICS: {
  opener: "scene-words/21390",
  talk: "scene-clips/5032",
  group: "scene-words/16776",
  speech: "scene-words/12053",
  reporter: "scene-words/14950",
  survey: "scene-words/12265",
  pron: "scene-words/16193",
  roleB: "scene-words/18344",
  cover: "scene-clips/7383",
  back: "scene-words/14361"
 },
 gram1: {
  can: "say how often things happen",
  title: "Adverbs of",
  em: "Frequency",
  rules: [
   ["How often? (not exact)", "I <b>sometimes</b> think about the future."],
   ["Exact", "We visit my grandma <b>once a week</b>. He reads the news <b>daily</b>."]
  ],
  hardNote: "always · usually · often · sometimes · rarely · never · daily · weekly · once a year",
  say: [
   "Adverbs of frequency tell us how often something happens.",
   "They usually go before the main verb, but after be.",
   "I sometimes think about the future.",
   "We visit my grandma once a week."
  ]
 },
 gram2: {
  can: "ask \"How often…?\"",
  cols: ["Before the main verb", "After be"],
  rows: [
   ["+", "I <b>often</b> help my friends.", "She is <b>always</b> kind."],
   ["−", "I <b>never</b> lie to my parents.", "It <b>isn't always</b> easy."],
   ["?", "Do you <b>often</b> think about life?", "Are you <b>usually</b> lucky?"]
  ]
 },
 gapCan: "ask \"How often does he…?\"",
 role: {
  title: "The",
  em: "Big Questions",
  tail: "Podcast",
  opener: "Welcome to the show! Today's big question: what makes a good life?",
  a: "Podcast host",
  b: "Guest"
 },
 pron: {
  can: "stress frequency words",
  title: "Say it clearly:",
  em: "how often",
  game: "Teacher asks <i>\"How often do you…?\"</i> → you answer and stress the adverb: <i>\"I SOMEtimes do.\"</i>"
 },
 E: {
  steps: ["Answer", "More"],
  model: [
   ["We should care because everyone needs help sometimes.", "If I help others, they will help me, too."],
   ["Yes, I sometimes believe in destiny.", "I met my best friend by chance."],
   ["Yes, I believe in karma.", "If you are kind, good things usually happen."],
   ["I'm not sure. People believe different things.", "We should always respect each other's beliefs."],
   ["Gravity is the force that pulls things down.", "That's why an apple falls from a tree."],
   ["I think it will end very far in the future.", "I don't often worry about it."],
   ["I think nothing existed before the universe.", "It's hard to imagine!"],
   ["No, I don't think so.", "People always find new ideas."],
   ["No, it can't.", "Without laws, people would fight."],
   ["I think wisdom is more useful.", "Smart people can still make bad choices."]
  ],
  frame: [
   "We should care because ___.",
   "Yes, I ___ believe in destiny. / No, I don't.",
   "Yes, I believe in karma. If you ___, ___.",
   "I think ___. We should always respect ___.",
   "Gravity is the force that ___.",
   "I think it will end ___.",
   "I think ___ existed before the universe.",
   "Yes / No. People always ___.",
   "No, it can't. Without laws, ___.",
   "I think ___ is more useful because ___."
  ],
  bank: [
   ["everyone needs help", "it feels good", "we are a team", "kindness spreads"],
   ["sometimes", "often", "always", "never"],
   ["are kind", "help others", "lie", "good things happen"],
   ["God exists", "I'm not sure", "other beliefs", "each other"],
   ["pulls things down", "keeps us on the ground", "moves the planets", "makes things fall"],
   ["in the far future", "never", "in a million years", "when the sun dies"],
   ["nothing", "energy", "darkness", "another universe"],
   ["find new ideas", "make new things", "dream", "try again"],
   ["people would fight", "there would be chaos", "no one would be safe", "the strong would win"],
   ["wisdom", "intelligence", "you need both", "good choices matter"]
  ],
  more: [
   ["Who cares about you the most?", "How do you show you care?"],
   ["Do you believe in luck?", "Can you change your future?"],
   ["Have you seen karma happen?", "Do you always do the right thing?"],
   ["What do your friends believe?", "Why is it important to respect beliefs?"],
   ["What would happen without gravity?", "Would you like to float in space?"],
   ["Do you like movies about the end of the world?", "What would you do on the last day?"],
   ["Do you like thinking about space?", "What do you wonder about?"],
   ["Are you a creative person?", "When do you have the best ideas?"],
   ["What is one important rule at school?", "What rule would you change?"],
   ["Who is the wisest person you know?", "Does wisdom come with age?"]
  ],
  gram1: {
   chain: ["I always ___.", "I never ___."],
   ex: "T: I always drink coffee in the morning.<br>S: I always brush my teeth.<br>T: I never …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["Do you often help others?", "Are you always honest?", "Do you ever look at stars?", "Are you usually lucky?", "Do you often daydream?"],
    ans: "Answer with always / sometimes / never <b>+ one more</b>"
   },
   b: {
    title: "How often?",
    big: "I ___ help at home. I ___ think about the future.",
    ans: "Then ask: <b>How often do you …?</b>"
   }
  },
  opener: {
   think: ["Look at the photo. What is the boy thinking about?", "Do you ever wonder about big questions?", "What question would you ask a wise person?"]
  },
  convo: [
   ["A", "Do you ever think about the future?"],
   ["B", "Sometimes. Do you believe in {destiny}?"],
   ["A", "Not really. I think we make our own future."],
   ["B", "Hmm. I often think {luck} is important."],
   ["A", "Maybe. But {hard work} helps, too."],
   ["B", "That's true. My grandma always says that."],
   ["A", "She sounds {wise}!"]
  ],
  swap: [["a big idea", "destiny"], ["something important", "luck"], ["another idea", "hard work"], ["a good quality", "wise"]],
  lang: [
   ["Give an opinion", ["I think …", "In my opinion, …", "Maybe …"]],
   ["Agree / disagree", ["That's true.", "Not really.", "I'm not sure."]],
   ["Ask back", ["What do you think?", "Do you agree?"]]
  ],
  langPractice: ["I always believe in luck.", "I never think about space.", "Kind people are happier.", "Rules are boring.", "Smart people are always right.", "I sometimes daydream in class."],
  survey: {
   ask: "Do you",
   cols: ["Me", "My teacher"],
   rows: ["believe in luck", "often help others", "sometimes look at the stars", "always tell the truth", "think rules are important", "like big questions"],
   q: "Do you …?  → Yes, I do. / No, I don't.",
   report: "I ___, but my teacher ___."
  },
  gap: {
   who: "Mina's week",
   q: ["How often does Mina help her mom?", "How often does she read?", "When does she look at the stars?", "How often does she volunteer?"],
   A: [["helps her mom", "every day"], ["reads", "?"], ["looks at the stars", "on Fridays"], ["volunteers", "?"]],
   B: [["helps her mom", "?"], ["reads", "three times a week"], ["looks at the stars", "?"], ["volunteers", "once a month"]],
   tip: "How often <b>does</b> she…? · She <b>always</b> helps."
  },
  role: {
   A: ["You host a podcast.", "Ask 5 big questions.", "Say one thing you learned."],
   B: ["You are the guest.", "Choose: a student / a scientist / a grandpa.", "Answer with 2 sentences."]
  },
  tts: {
   title: "Make \"Our 3 life rules\"",
   steps: ["Think of 3 rules for a good life.", "Ask your teacher. Answer, too.", "Choose the 3 best rules.", "Make a poster and tell!"],
   lang: ["We should always ___.", "We should never ___.", "My teacher thinks ___."]
  },
  speech: {
   time: "1 min",
   model: ["Hello! Let me tell you my rules for a good life.", "First, always be kind to others.", "Second, never stop learning new things.", "Third, sometimes look at the sky and dream.", "I think these rules make people happy.", "Thank you!"],
   outline: ["Hello", "Rule 1 (always)", "Rule 2 (never)", "Rule 3 (sometimes)", "Thank you!"],
   check: ["Loud voice", "Look at teacher", "Use always / never"]
  },
  pron: {
   cols: [["Stress first", ["ALways", "USually", "SOMEtimes"]], ["Silent t", ["often", "listen", "fasten"]], ["-ly = /li/", ["rarely", "daily", "weekly"]]],
   up: "Do you believe in destiny?",
   down: "How often do you help others?"
  },
  review: ["I can talk about big questions.", "I can use always / sometimes / never.", "I can ask \"How often…?\"", "I can say one more sentence."]
 },
 H: {
  steps: ["Answer", "Reason", "Example", "Ask back"],
  model: [
   ["We should care about others because no one survives alone.", "Every society depends on trust and help.", "When I was sick last year, neighbors brought me food.", "Why do you think some people don't care?"],
   ["I don't really believe in destiny.", "I think our choices shape our future more than fate.", "I almost studied law, but I chose design, and it changed everything.", "Do you think anything is meant to be?"],
   ["I believe in a kind of everyday karma.", "How you treat people usually comes back to you.", "A coworker I helped once later recommended me for a job.", "Have you ever seen karma in action?"],
   ["Personally, I'm not certain either way.", "I think it's a question of faith, not proof.", "My parents are religious, but I'm still searching.", "What shaped your beliefs?"],
   ["Gravity is the force that pulls things together.", "The bigger the mass, the stronger the pull.", "It keeps the Moon around Earth and causes tides.", "Did you enjoy physics at school?"],
   ["I think the world won't end for billions of years.", "Scientists say the Sun will burn out eventually.", "I rarely worry about it, but climate change worries me more.", "Does the idea of the end scare you?"],
   ["Honestly, I don't think anyone knows.", "Maybe there was no \"before,\" because time began then too.", "I once read that asking this is like asking what's north of the North Pole.", "What do you think was there?"],
   ["I think creativity has almost no limits.", "Every generation builds on the ideas before it.", "People laughed at airplanes, and now we fly daily.", "Will AI ever be truly creative?"],
   ["No, I don't think a large society can.", "Without laws, the strongest would always win.", "Even small groups, like a soccer team, need rules.", "Which law do you think matters most?"],
   ["I'd say wisdom is more useful in the long run.", "Intelligence solves problems, but wisdom picks the right ones.", "My grandmother never went to college, but she gives the best advice.", "Would you rather be smart or wise?"]
  ],
  frame: [
   "We should care about others because … For example, …",
   "I do / don't believe in destiny because …",
   "I believe in … because … Once, …",
   "Personally, I think … because …",
   "Gravity is … It …",
   "I think the world will end … because …",
   "I think … existed before because …",
   "I think creativity has … because …",
   "I don't think a society can … because …",
   "I'd say … is more useful because …"
  ],
  more: [
   ["Is it possible to care too much?", "Should we care more about family or strangers?", "If everyone cared a little more, what would change?"],
   ["If you could see your future, would you look?", "Is believing in fate comforting or scary?", "Does free will really exist?"],
   ["Is karma just a way to feel better?", "Do bad people always get punished?", "What would the world be like if karma were real?"],
   ["Can science and religion both be right?", "Why do people believe different things?", "Should religion be taught at school?"],
   ["How would life change if gravity were weaker?", "Is science a kind of philosophy?", "Would you live on the Moon?"],
   ["Why are people fascinated by end-of-the-world stories?", "What is the biggest threat to humanity?", "If the world ended tomorrow, what would you do today?"],
   ["Can humans ever answer this question?", "Is it better to ask or to accept not knowing?", "Do you think other universes exist?"],
   ["Can creativity be taught?", "Does technology make us more or less creative?", "What if machines became more creative than us?"],
   ["Are there any laws you think are unnecessary?", "Is it ever right to break a law?", "Could a small village live without laws?"],
   ["Can you be smart without being wise?", "Does wisdom always come with age?", "If you could learn wisdom from one person, who?"]
  ],
  gram1: {
   chain: ["I rarely ___, but I often ___.", "I'm usually ___ when ___."],
   ex: "T: I rarely watch the news, but I often read books.<br>S: I rarely …<br>T: …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["How often do you think about your future?", "Do you ever change your mind about big ideas?", "Are you usually optimistic?", "How often do you do something kind?", "Have you ever felt something was meant to be?"],
    ans: "Answer with a frequency word <b>+ why?</b>"
   },
   b: {
    title: "Your philosophy",
    big: "I always try to ___. I never ___. I sometimes wonder ___.",
    ans: "Then ask: <b>What do you always try to do?</b>"
   }
  },
  opener: {
   think: ["Why do humans keep asking questions that have no clear answer?", "Is it more important to be happy or to be good?", "Which big question do you think about most often?"]
  },
  convo: [
   ["A", "Can I ask you a strange question?"],
   ["B", "Sure. I love strange questions."],
   ["A", "Do you think everything happens for a reason?"],
   ["B", "Hmm. I sometimes think so, but {science} says otherwise."],
   ["A", "Really? I usually believe in {destiny}."],
   ["B", "Why? Did something happen to you?"],
   ["A", "I met my {best friend} on a delayed flight."],
   ["B", "Wow. Maybe it was {just luck}, though."],
   ["A", "Maybe. I guess we'll never know!"]
  ],
  swap: [["a point of view", "science"], ["a belief", "destiny"], ["an important person", "best friend"], ["another explanation", "just luck"]],
  lang: [
   ["Give an opinion", ["I'd say …", "Personally, …", "It seems to me that …"]],
   ["Disagree politely", ["I see your point, but …", "Maybe, though …", "I'm not so sure."]],
   ["Ask for reasons", ["Why do you think so?", "What makes you say that?"]],
   ["Buy time", ["That's a deep question.", "Let me think."]]
  ],
  langPractice: ["Everything happens for a reason.", "Money always makes people happier.", "Laws are sometimes wrong.", "Smart people are rarely wise.", "Humans are naturally selfish.", "AI will never be creative."],
  survey: {
   ask: "Do you",
   cols: ["Me", "My teacher", "One more question"],
   rows: ["believe everything happens for a reason", "often think about death", "believe in karma", "usually trust strangers", "sometimes break small rules", "think humans are basically good"],
   q: "Do you …? → Yes. → Ask: Why? / How often? / Since when?",
   report: "My teacher and I both ___, but only I ___."
  },
  gap: {
   who: "Professor Kim's routine",
   q: ["How often does the professor meditate?", "What does he rarely do?", "How often does he read philosophy?", "What does he always carry?", "When does he write?"],
   A: [["meditates", "every morning"], ["rarely", "?"], ["reads philosophy", "weekly"], ["always carries", "?"], ["writes", "?"]],
   B: [["meditates", "?"], ["rarely", "watches TV"], ["reads philosophy", "?"], ["always carries", "a small notebook"], ["writes", "late at night, daily"]],
   tip: "How often <b>does</b> he…? · He <b>rarely</b> watches TV."
  },
  role: {
   A: ["You host a philosophy podcast.", "Ask 5 questions + 2 follow-ups.", "Challenge one answer politely."],
   B: ["You are a guest thinker.", "Choose: a scientist / a monk / an artist.", "Give reasons and a personal example."]
  },
  tts: {
   title: "Write \"A guide to a good life\"",
   steps: ["Think: what makes a life good?", "Ask your teacher 4 of today's questions.", "Agree on 3 principles.", "Present your guide in 1 minute."],
   lang: ["We believe people should always ___.", "We rarely agree on ___, but ___.", "The wisest idea is ___."]
  },
  speech: {
   time: "2 min",
   model: ["Hi everyone. Today I'll share my personal philosophy.", "I believe our choices matter more than destiny.", "I always try to treat people the way I want to be treated.", "I don't know if karma is real, but kindness usually comes back.", "I rarely worry about the end of the world.", "Instead, I often ask: what can I do well today?", "For me, wisdom means knowing what really matters.", "Thanks for listening! Any questions?"],
   outline: ["Hook — \"Today I'll share…\"", "Choice or destiny?", "A rule you always follow", "Your view on karma", "What wisdom means to you", "Ask for questions"],
   check: ["Clear voice", "Eye contact", "Frequency words", "Answer 1 question"]
  },
  pron: {
   cols: [["Stress first", ["ALways", "USually", "NEVer"]], ["Silent t", ["often", "listen", "whistle"]], ["-ly = /li/", ["rarely", "weekly", "annually"]]],
   up: "Do you believe in karma?",
   down: "How often do you think about it?"
  },
  review: ["I can answer in 4 parts.", "I can use adverbs of frequency.", "I can discuss big questions politely.", "I can give a short presentation."]
 }
};
