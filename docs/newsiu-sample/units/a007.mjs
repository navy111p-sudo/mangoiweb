// SIU ADVANCE 007 — Advantages and Disadvantages (8판 형식, 001 본보기)
// 원본과 다른 점:
//  - 대답 틀 "The advantages and disadvantages … is" → "One advantage … is …. One disadvantage is …" 로 바로잡음(주어·동사 수 일치)
//  - Q3 "being a single" → "being single" · Q6 "being the only child" → "being an only child"
//  - Q9 "long distance relationship" → "a long-distance relationship" · Q10 문장 다듬음
//  - Keyword Only 품사 adv → adjective(“an only child” 뜻) · Single 뜻을 이 질문의 뜻(미혼)으로
//  - 문법 예문 "I will send the note for the doctor" → "I will send the note to the doctor"
// 민감 내용: 쉬운 판(중고생)은 결혼·연애·동성결혼을 «가족·친구·공정함·서로 존중» 으로만 다룸(연애 세부 없음).
//            Q8 은 두 판 모두 한쪽 입장을 강요하지 않고 «의견이 다르다·존중» 틀로 말하게 함.
export default {
 no: "a007",
 title: "Advantages and Disadvantages",
 book: "SIU ADVANCE 007 - Advantages and disadvantages",
 next: "008 Politics and Government",
 cover: { h1: "Advantages", em: "and Disadvantages", goals: ["Compare the good and bad sides", "Use verbs with an object", "Give a balanced opinion"] },
 KW: [
  ["man", "noun", "남자", "an adult male person"],
  ["woman", "noun", "여자", "an adult female person"],
  ["single", "adjective", "미혼인, 혼자인", "not married"],
  ["advantage", "noun", "장점, 이점", "something good that helps you"],
  ["eldest", "adjective", "맏이의, 가장 나이 많은", "the oldest child in a family"],
  ["only", "adjective", "유일한", "with no others; just one"],
  ["boss", "noun", "상사, 사장", "the person in charge of workers"],
  ["same", "adjective", "같은", "not different"],
  ["distance", "noun", "거리", "the space between two places or people"],
  ["robot", "noun", "로봇", "a machine that can do work by itself"]
 ],
 QS: [
  "What are the advantages and disadvantages of being a man?",
  "What are the advantages and disadvantages of being a woman?",
  "What are the advantages and disadvantages of being single?",
  "What are the advantages and disadvantages of being married?",
  "What are the advantages and disadvantages of being the eldest child?",
  "What are the advantages and disadvantages of being an only child?",
  "What are the advantages and disadvantages of being the boss?",
  "What are the advantages and disadvantages of same-sex marriage?",
  "What are the pros and cons of a long-distance relationship?",
  "What are the pros and cons of robots replacing humans at work?"
 ],
 IMG_E: ["scene-words/12080", "scene-words/16362", "scene-words/12542", "scene-words/12360", "scene-words/12054", "scene-words/12174", "scene-words/14829", "scene-words/17372", "scene-words/18144", "scene-words/14655"],
 IMG_H: ["scene-words/12664", "scene-words/18358", "scene-words/12542", "scene-words/14354", "scene-words/19015", "scene-words/12174", "scene-words/14797", "scene-words/15544", "scene-words/18077", "scene-words/14029"],
 PICS: {
  opener: "scene-words/18432",
  talk: "scene-clips/5038",
  group: "scene-words/18912",
  speech: "scene-words/16688",
  reporter: "scene-words/14885",
  survey: "scene-words/19029",
  pron: "scene-words/12151",
  roleB: "scene-words/19626",
  cover: "scene-words/18912",
  back: "scene-words/16380"
 },
 gram1: {
  can: "use verbs that need an object",
  title: "Transitive",
  em: "Verbs",
  rules: [
   ["Verb + object", "Please <b>carry</b> <b>the books</b> for me."],
   ["Ask \"What? / Who?\"", "I love … who? → I love <b>my family</b>."]
  ],
  hardNote: "love · carry · buy · kick · take · send — they need an object",
  say: [
   "A transitive verb needs an object. It does not make sense alone.",
   "Please carry the books for me.",
   "I love my family."
  ]
 },
 gram2: {
  can: "use verbs with an object",
  cols: ["verb + a person", "verb + a thing"],
  rows: [
   ["+", "I <b>help</b> my sister.", "She <b>takes</b> the bus."],
   ["−", "He doesn't <b>trust</b> his boss.", "I didn't <b>buy</b> it."],
   ["?", "Do you <b>miss</b> your friends?", "Did you <b>send</b> the message?"]
  ]
 },
 gapCan: "ask \"What does he manage?\"",
 role: {
  title: "The",
  em: "Big",
  tail: "Decision",
  opener: "So, you got an offer to be the boss. How do you feel?",
  a: "Career coach",
  b: "Worker"
 },
 pron: {
  can: "link a verb to its object",
  title: "Linking",
  em: "Sounds",
  game: "Teacher says a verb → you add an object and link: <i>\"I love it. I'll send it.\"</i>"
 },
 E: {
  steps: ["Good", "Bad", "Me"],
  model: [
   ["Men are often strong.", "In Korea, men must join the army.", "My brother is in the army now."],
   ["Women often live longer.", "Some people treat them unfairly.", "My mom works and cooks, too."],
   ["Single people have free time.", "But they may feel lonely.", "My uncle travels a lot."],
   ["Married people help each other.", "But they have less free time.", "My parents share the work."],
   ["The eldest gets new things first.", "But they have more rules.", "I'm the eldest in my family."],
   ["An only child gets lots of love.", "But they have no one to play with.", "My friend Jun is an only child."],
   ["The boss makes the rules.", "But the boss has a lot of stress.", "My dad is a boss at work."],
   ["People have different opinions.", "Some say it's fair; some disagree.", "I think we should respect everyone."],
   ["You can have your own time.", "But you miss the person a lot.", "My best friend moved to Canada."],
   ["Robots never get tired.", "But people can lose their jobs.", "A robot makes coffee at my mall."]
  ],
  frame: [
   "One advantage is ___. One disadvantage is ___.",
   "Women ___. But ___.",
   "Single people ___. But ___.",
   "Married people ___. But ___.",
   "The eldest ___. But ___.",
   "An only child ___. But ___.",
   "The boss ___. But ___.",
   "I think we should ___.",
   "You can ___. But you ___.",
   "Robots ___. But ___."
  ],
  bank: [
   ["strong", "the army", "tall", "sports"],
   ["live longer", "unfair", "strong", "kind"],
   ["free time", "lonely", "travel", "money"],
   ["help each other", "busy", "a family", "share"],
   ["new things", "more rules", "helps", "leader"],
   ["lots of love", "lonely", "a big room", "no fights"],
   ["makes the rules", "stress", "more money", "busy"],
   ["respect everyone", "be fair", "listen", "be kind"],
   ["own time", "miss", "video-call", "far away"],
   ["never tired", "lose jobs", "fast", "safe"]
  ],
  more: [
   ["Would you like to be a man or a woman?", "Why?"],
   ["What do women do well?", "Is it fair at school?"],
   ["Would you like to live alone?", "What would you do?"],
   ["What makes a good husband or wife?", "Do you want to get married?"],
   ["Are you the eldest?", "Is it good or bad?"],
   ["Do you have siblings?", "Do you want one?"],
   ["Would you like to be a boss?", "What rules would you make?"],
   ["Why do people have different opinions?", "How can we be fair?"],
   ["Do you have a friend far away?", "How do you talk?"],
   ["Would you like a robot helper?", "What would it do?"]
  ],
  gram1: {
   chain: ["I love ___.", "Yesterday, I bought ___."],
   ex: "T: I love my dog.<br>S: I love pizza.<br>T: I …"
  },
  gram2: {
   a: {
    title: "Add an object!",
    items: ["I miss …", "I often help …", "Please take …", "I want to buy …"],
    ans: "Finish the sentence <b>+ one more sentence</b>"
   },
   b: {
    title: "Good or bad?",
    big: "One advantage of ___ is ___.",
    ans: "Then ask: <b>What's a disadvantage?</b>"
   }
  },
  opener: {
   think: ["Look at the photo. What is she writing?", "Is it better to be old or young?", "What is good about your age?"]
  },
  convo: [
   ["A", "Do you have any brothers or sisters?"],
   ["B", "No, I'm an {only child}."],
   ["A", "Lucky you! You get all the {snacks}!"],
   ["B", "Ha! Yes, but I get lonely sometimes."],
   ["A", "I'm the {eldest}. I help my brother a lot."],
   ["B", "Is that good or bad?"],
   ["A", "Both! He {copies me} all the time."]
  ],
  swap: [["your family place", "only child"], ["an advantage", "snacks"], ["your partner's place", "eldest"], ["a disadvantage", "copies me"]],
  lang: [
   ["Good side", ["One advantage is …", "The good thing is …"]],
   ["Bad side", ["One disadvantage is …", "The bad thing is …"]],
   ["Balance", ["On the other hand, …", "Both!"]]
  ],
  langPractice: ["Being the eldest is great.", "Only children are lonely.", "Bosses are rich.", "Robots are better than people.", "Living alone is fun.", "Boys are stronger."],
  survey: {
   ask: "Would you like to",
   cols: ["Me", "My teacher"],
   rows: ["be the eldest child", "be an only child", "be the boss", "live alone someday", "have a robot helper", "have a friend far away"],
   q: "Would you like to …?  → Yes, I would. / No, I wouldn't.",
   report: "I would like to ___, but my teacher ___."
  },
  gap: {
   who: "Mr. Oh, the new boss",
   q: ["What does Mr. Oh manage?", "What does he like about it?", "What does he dislike?", "What does he want to buy?"],
   A: [["manages", "a team of ten"], ["likes", "?"], ["dislikes", "long meetings"], ["wants to buy", "?"]],
   B: [["manages", "?"], ["likes", "helping his team"], ["dislikes", "?"], ["wants to buy", "a coffee robot"]],
   tip: "He <b>manages</b> a team · He <b>likes</b> … · He <b>wants</b> …"
  },
  role: {
   A: ["You are a career coach.", "Ask 5 questions.", "Say: \"One advantage is …\""],
   B: ["You got an offer to be the boss.", "Choose: at a café / a school / a game company.", "Say one good and one bad thing."]
  },
  tts: {
   title: "Make a pros and cons chart",
   steps: ["Pick a topic: eldest, only child or boss.", "Ask your teacher for good and bad points.", "Write 3 pros and 3 cons together.", "Present your chart!"],
   lang: ["One advantage is ___.", "One disadvantage is ___.", "Overall, I think ___."]
  },
  speech: {
   time: "1 min",
   model: ["Hello! Let me talk about being the eldest.", "I'm the eldest in my family.", "One advantage is that I get new things first.", "One disadvantage is that I have more rules.", "Overall, I like it. I help my brother a lot.", "Thank you!"],
   outline: ["Hello", "Your topic", "One advantage", "One disadvantage", "Overall …"],
   check: ["Loud voice", "Look at your teacher", "Good + bad"]
  },
  pron: {
   cols: [["take + it", ["take it", "make it", "like it"]], ["send + a", ["send a", "find a", "need a"]], ["h drops", ["love her", "help him", "miss her"]]],
   up: "Are you the eldest?",
   down: "What's the advantage?"
  },
  review: ["I can talk about good and bad sides.", "I can use verbs with an object.", "I can say \"One advantage is …\"", "I can respect other opinions."]
 },
 H: {
  steps: ["Answer", "Reason", "Example", "Ask back"],
  model: [
   ["Men may face less pressure about their looks.", "However, society expects them to hide their feelings.", "My father never showed stress, even when he lost his job.", "Do you think men can show emotion freely?"],
   ["Women often build close support networks.", "However, many still face a pay gap at work.", "My aunt earns less than male coworkers with her job.", "Have you seen unfair treatment at work?"],
   ["Single people enjoy freedom and flexibility.", "However, they may lack daily support.", "My single friend travels often but hates being sick alone.", "Would you rather be single or in a couple?"],
   ["Marriage offers partnership and stability.", "However, it takes compromise and less freedom.", "My parents make every big decision together.", "What do you think makes a marriage work?"],
   ["The eldest often becomes responsible and mature.", "However, parents expect more from them.", "As the eldest, I babysat my siblings every weekend.", "Where are you in your family?"],
   ["An only child gets their parents' full attention.", "However, they may feel pressure and loneliness.", "My cousin, an only child, felt she had to be perfect.", "Would you want one child or more?"],
   ["The boss has power and a higher salary.", "However, they carry the blame when things go wrong.", "My former boss worked late almost every night.", "Would you want to be a boss someday?"],
   ["Supporters say it gives couples equal legal rights.", "Others oppose it for religious or cultural reasons.", "Several countries have legalized it in recent years.", "What's the view in your country?"],
   ["It can build trust and independence.", "However, the distance makes daily support hard.", "My friend's relationship lasted two years across time zones.", "Could you handle a long-distance relationship?"],
   ["Robots can do dangerous, repetitive work safely.", "However, many workers may lose their jobs.", "Factories near my city replaced half their staff with robots.", "Should companies pay a tax for robots?"]
  ],
  frame: [
   "One advantage is … However, …",
   "Women often … However, …",
   "Single people … However, …",
   "Marriage offers … However, …",
   "The eldest often … For example, …",
   "An only child … However, …",
   "The boss … but …",
   "Supporters say … Others …",
   "It can … However, …",
   "Robots can … but …"
  ],
  more: [
   ["Are gender roles changing in Korea?", "Should men and women do military service?", "What stereotype about men is unfair?"],
   ["Is the pay gap closing?", "What changes would help working mothers?", "Who has more pressure about looks?"],
   ["Why are more people staying single?", "Is living alone a trend or a choice?", "At what age should people marry?"],
   ["Is marriage still necessary today?", "What's the hardest part of marriage?", "Arranged or love marriage — which lasts longer?"],
   ["Does birth order shape personality?", "Is the eldest treated unfairly?", "Which position in a family is best?"],
   ["Are only children spoiled?", "Why are families getting smaller?", "How can only children learn to share?"],
   ["What makes a good boss?", "Would you rather have a strict or kind boss?", "Is it lonely at the top?"],
   ["How have views changed in your lifetime?", "Should laws follow public opinion?", "How can we discuss this respectfully?"],
   ["How has technology changed long-distance love?", "Would you move for a partner?", "What makes trust possible?"],
   ["Which jobs are safe from robots?", "Should robots have limits at work?", "Would you work under a robot boss?"]
  ],
  gram1: {
   chain: ["I really miss ___.", "I'd never lend ___ to anyone."],
   ex: "T: I really miss my grandmother's cooking.<br>S: I really miss my old school.<br>T: I …"
  },
  gram2: {
   a: {
    title: "Transitive or not?",
    items: ["She raised her hand.", "The sun rises.", "He lay down.", "Please lay the book down."],
    ans: "Does it need an object? <b>Explain why.</b>"
   },
   b: {
    title: "A tough choice",
    big: "If I became the boss, I would change ___ and I would reward ___.",
    ans: "Then ask: <b>What would you change?</b>"
   }
  },
  opener: {
   think: ["Is there anything in life with only advantages?", "What's a choice you made after weighing pros and cons?", "Do people focus more on advantages or disadvantages?"]
  },
  convo: [
   ["A", "I heard you got promoted! Congratulations."],
   ["B", "Thanks! But honestly, I have mixed feelings."],
   ["A", "Really? Why's that?"],
   ["B", "Well, the {higher salary} is great."],
   ["A", "But?"],
   ["B", "But I'll have to {manage my old friends}."],
   ["A", "I see. That could be awkward."],
   ["B", "Exactly. On the other hand, I can {improve the team}."],
   ["A", "Sounds like the pros win. Go for it!"]
  ],
  swap: [["a new role", "promoted"], ["an advantage", "higher salary"], ["a disadvantage", "manage my old friends"], ["another advantage", "improve the team"]],
  lang: [
   ["Weigh it up", ["On the one hand, …", "On the other hand, …"]],
   ["Add a point", ["What's more, …", "Not only that, …"]],
   ["Contrast", ["However, …", "That said, …"]],
   ["Conclude", ["All things considered, …", "Overall, …"]]
  ],
  langPractice: ["Being single is better.", "Only children are spoiled.", "Robots will save the economy.", "The eldest has it hardest.", "Bosses deserve high pay.", "Long-distance love never works."],
  survey: {
   ask: "Is it better to",
   cols: ["Me", "My teacher", "One more question"],
   rows: ["be the eldest or the youngest", "have siblings or be an only child", "be a boss or an employee", "live alone or with family", "work with robots or people", "live near or far from family"],
   q: "Is it better to … or …? → Ask: Why? / What's the downside?",
   report: "We both prefer ___, but we disagree about ___."
  },
  gap: {
   who: "Mr. Oh, the new boss",
   q: ["What does Mr. Oh manage?", "What does he enjoy?", "What stresses him?", "What did he change first?", "What does he miss about his old job?"],
   A: [["manages", "a design team of 12"], ["enjoys", "?"], ["stress", "firing people"], ["first change", "?"], ["misses", "?"]],
   B: [["manages", "?"], ["enjoys", "mentoring young staff"], ["stress", "?"], ["first change", "cut meetings in half"], ["misses", "drawing every day"]],
   tip: "He <b>manages</b> … · He <b>misses</b> … · He <b>changed</b> …"
  },
  role: {
   A: ["You are a career coach.", "Ask 5 questions + 2 follow-ups.", "Help B list pros and cons, then advise."],
   B: ["You've been offered a job as boss.", "Choose: a start-up / a hospital / your family business.", "Explain your worries and hopes."]
  },
  tts: {
   title: "Debate: Robots at work — yes or no?",
   steps: ["List 3 pros and 3 cons.", "Ask your teacher which side they take.", "Take opposite sides and debate for 3 minutes.", "Agree on a fair rule for robots at work."],
   lang: ["On the one hand, ___.", "That's true, but ___.", "All things considered, ___."]
  },
  speech: {
   time: "2 min",
   model: ["Is it better to be an only child? Let's look at both sides.", "On the one hand, only children get their parents' full attention.", "They often have more resources and quiet time.", "On the other hand, they can feel lonely or pressured.", "They also miss out on learning to share every day.", "All things considered, I think the advantages are bigger.", "Thanks! What do you think?"],
   outline: ["Hook — a question", "Advantage 1", "Advantage 2", "Disadvantage", "Your conclusion", "Ask for questions"],
   check: ["Clear voice", "Eye contact", "Both sides", "Answer 1 question"]
  },
  pron: {
   cols: [["-k + vowel", ["take on", "pick up", "look after"]], ["-d / -t + vowel", ["send out", "put up", "hold on"]], ["h drops", ["ask him", "tell her", "give him"]]],
   up: "Would you want to be the boss?",
   down: "What's the biggest disadvantage?"
  },
  review: ["I can answer in 4 parts.", "I can use transitive verbs.", "I can weigh pros and cons.", "I can give a balanced opinion."]
 }
};
