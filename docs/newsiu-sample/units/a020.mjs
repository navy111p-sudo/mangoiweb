// SIU ADVANCE 020 — Relationship and Love (8판 형식, 001 본보기)
// 원본과 다른 점:
//  - 문법(주격 대명사) 예문 "We gave them a head start…" 등은 관계 주제의 짧은 예문으로 바꾸고, 주어 자리(I·you·he·she·it·we·they)를 +−? 표로 정리
//  - Q3 "Po opposites attract? or do similar people tend to fall in love?" → "Do opposites attract, or do similar people fall in love?" (tend to 는 칸에 맞게 뺌)
//  - Q6 "What can you say about long distance relationship? How could you manage it to stay long?" → "What do you think about long-distance relationships? How can you make one last?"
//  - Keyword Control 품사 noun → 질문 속 쓰임(control this emotion)대로 verb 로 바꾸고 뜻도 동사로
//  - Keyword Manage 뜻 "succeed in surviving… against heavy odds" → 관계를 «잘 꾸려 가다» 뜻으로
//  - Keyword Hit 뜻의 «weapon» 표현은 빼고 쉬운 뜻으로
//  - 대답 틀 "A: I more likely to …" 등 틀린 틀은 새로 씀
// 민감 내용: 쉬운 판은 데이트·연애 대신 우정·가족·학교생활로 답함(Q1 «지금은 공부와 친구가 먼저», Q10 «가족은 서로 존중해야»). 폭력 묘사 없음.
// 어려운 판은 이혼·질투·일부다처·데이트 비용·가정폭력(«절대 안 된다, 도움을 요청하라»)을 성숙하게 다룸.
export default {
 no: "a020",
 title: "Relationship and Love",
 book: "SIU ADVANCE 020 - Relationship and Love",
 next: "",
 cover: { h1: "Relationships", em: "and Love", goals: ["Talk about friends, family and love", "Ask and answer 10 questions", "Use subject pronouns: I, he, she, they"] },
 KW: [
  ["begin", "verb", "시작하다", "to start doing something"],
  ["blind date", "noun", "소개팅", "a date with someone you have never met before"],
  ["attract", "verb", "끌어당기다, 매력을 느끼게 하다", "to make someone like or be interested in you"],
  ["gender", "noun", "성별", "being male or female"],
  ["divorce", "noun", "이혼", "the legal end of a marriage"],
  ["manage", "verb", "(어려운 일을) 잘 해내다", "to succeed in dealing with something difficult"],
  ["control", "verb", "조절하다, 억누르다", "to make a feeling or action stay calm"],
  ["polygamy", "noun", "일부다처(다부)제", "having more than one husband or wife at the same time"],
  ["pay", "verb", "(돈을) 내다", "to give money for something you buy"],
  ["hit", "verb", "때리다", "to touch someone hard with your hand"]
 ],
 QS: [
  "What is the best age to begin dating?",
  "Have you ever been on a blind date? Is it good or bad?",
  "Do opposites attract, or do similar people fall in love?",
  "Would you like to know the gender of your child before it is born?",
  "What is your opinion about divorce?",
  "What do you think of long-distance relationships? How can you make one last?",
  "Jealousy: is it possible to control this emotion?",
  "What do you think of polygamy?",
  "Should the man pay on a date?",
  "Do you think it's okay for a man to hit his wife?"
 ],
 IMG_E: ["scene-words/18463", "scene-clips/5032", "scene-words/19012", "scene-words/19011", "scene-words/18493", "scene-words/18144", "scene-words/17168", "scene-words/18521", "scene-clips/7439", "scene-words/19307"],
 IMG_H: ["scene-words/16707", "scene-clips/7253", "scene-words/16117", "scene-words/19011", "scene-words/15544", "scene-words/17237", "scene-words/19720", "scene-words/18520", "scene-words/16661", "scene-words/21103"],
 PICS: {
  opener: "scene-words/17231",
  talk: "scene-words/15106",
  group: "scene-words/18521",
  speech: "scene-words/12360",
  reporter: "scene-words/10007",
  survey: "scene-words/19106",
  pron: "scene-words/21029",
  roleB: "scene-clips/7163",
  cover: "scene-words/19307",
  back: "scene-words/14354"
 },
 gram1: {
  can: "use I, you, he, she, we, they",
  title: "Subject",
  em: "Pronouns",
  rules: [
   ["Who does it?", "<b>She</b> listens to her friends."],
   ["Instead of a name", "Mina and Jun are close. <b>They</b> talk every day."]
  ],
  hardNote: "I · you · he · she · it · we · they → before the verb",
  say: [
   "A subject pronoun takes the place of a noun. It does the action of the verb.",
   "She listens to her friends.",
   "Mina and Jun are close. They talk every day."
  ]
 },
 gram2: {
  can: "ask \"Does she…?\" and \"Do they…?\"",
  cols: ["I · you · he · she · it", "we · they"],
  rows: [
   ["+", "<b>She</b> is kind to everyone.", "<b>They</b> met at school."],
   ["−", "<b>He</b> doesn't get jealous.", "<b>We</b> don't argue much."],
   ["?", "Is <b>she</b> your best friend?", "Do <b>they</b> live far apart?"]
  ]
 },
 gapCan: "ask \"How did they meet?\"",
 role: {
  title: "The",
  em: "Advice",
  tail: "Column",
  opener: "Hi! Thanks for writing to us. What's the problem?",
  a: "Advice writer",
  b: "Reader"
 },
 pron: {
  can: "use short forms with pronouns",
  title: "Short forms with",
  em: "pronouns",
  game: "Teacher says a long form → you say the short form: <i>\"She is my friend.\" → \"She's my friend.\"</i>"
 },
 E: {
  steps: ["Answer", "More"],
  model: [
   ["I think after high school.", "Now I want to focus on school and friends."],
   ["No, I've never been on one.", "I think it's for adults."],
   ["I think opposites attract.", "My best friend is very different from me."],
   ["No, I'd like it to be a surprise.", "Surprises are exciting!"],
   ["I think it's sad for the family.", "But sometimes it's the better choice."],
   ["It's hard, but video calls help.", "I talk to my friend in Canada every week."],
   ["Yes, I think we can control it.", "I try to be happy for my friends."],
   ["I think it's unfair.", "One husband and one wife is fair."],
   ["I think people should take turns.", "My friends and I split the bill."],
   ["No, it's never okay.", "Family members should be kind to each other."]
  ],
  frame: [
   "I think ___ is the best age.",
   "Yes, I have. / No, I've never been on one.",
   "I think ___ attract.",
   "Yes, I would. / No, I'd like ___.",
   "I think it's ___ for the family.",
   "It's ___, but ___ help(s).",
   "Yes / No. I try to ___.",
   "I think it's ___.",
   "I think ___ should pay.",
   "No, it's never okay. Family members should ___."
  ],
  bank: [
   ["after high school", "at 20", "at university", "later"],
   ["good", "bad", "scary", "for adults"],
   ["opposites", "similar people", "kind people", "funny people"],
   ["a surprise", "to know early", "a boy", "a girl"],
   ["sad", "hard", "the better choice", "painful"],
   ["hard", "lonely", "video calls", "messages"],
   ["be happy for them", "talk about it", "stay calm", "count to ten"],
   ["unfair", "strange", "wrong", "old-fashioned"],
   ["everyone", "the man", "the woman", "the person who asks"],
   ["be kind", "respect each other", "talk calmly", "help each other"]
  ],
  more: [
   ["When did your parents meet?", "What is important in a friend?"],
   ["How do you make new friends?", "Would you meet a friend's friend?"],
   ["How are you and your friend different?", "Do you like similar people?"],
   ["Do you like surprises?", "Boy or girl — does it matter?"],
   ["How can kids stay happy?", "Who can children talk to?"],
   ["Do you have a friend far away?", "How do you stay in touch?"],
   ["When do you feel jealous?", "How do you feel better?"],
   ["What is a good family to you?", "Is fairness important in a family?"],
   ["Who pays when you eat out with friends?", "Is it fair?"],
   ["What makes a family happy?", "Who can people ask for help?"]
  ],
  gram1: {
   chain: ["My best friend is funny. ___ always ___.", "My parents are busy. ___ ___ every day."],
   ex: "T: My best friend is funny. She always tells jokes.<br>S: My brother is kind. He …<br>T: …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["Is he your friend?", "Does she like music?", "Do they live near you?", "Are we late?", "Does he play sports?"],
    ans: "Yes, he is. / No, she doesn't. <b>+ one more sentence</b>"
   },
   b: {
    title: "My best friend",
    big: "My best friend is ___. He/She likes ___. We ___ together.",
    ans: "Then ask: <b>Who is your best friend?</b>"
   }
  },
  opener: {
   think: ["Look at the photo. How do they feel?", "Who is important in your life?", "What makes a good friend?"]
  },
  convo: [
   ["A", "Who is your best friend?"],
   ["B", "It's {Jisoo}. She's in my class."],
   ["A", "How did you meet?"],
   ["B", "We met in {art club}."],
   ["A", "Are you similar?"],
   ["B", "Not really! She's {quiet}, but I'm {loud}."],
   ["A", "Opposites attract, I guess!"]
  ],
  swap: [["a friend's name", "Jisoo"], ["a place", "art club"], ["your friend's personality", "quiet"], ["your personality", "loud"]],
  lang: [
   ["Describe people", ["He's kind.", "She's funny.", "They're close."]],
   ["Ask about people", ["How did you meet?", "What is he like?"]],
   ["Give an opinion", ["I think …", "Really? I don't think so."]]
  ],
  langPractice: ["My friend moved to Busan.", "My sister is always jealous.", "I have three best friends.", "My parents met online.", "I argued with my friend.", "I like quiet people."],
  survey: {
   ask: "Do you",
   cols: ["Me", "My teacher"],
   rows: ["have a best friend", "talk to friends every day", "feel jealous sometimes", "like surprises", "share food with friends", "call your grandparents"],
   q: "Do you …?  → Yes, I do. / No, I don't.",
   report: "I ___, but my teacher ___."
  },
  gap: {
   who: "Jun and Minho",
   q: ["How did they meet?", "What do they like?", "Where does Minho live now?", "How do they stay in touch?"],
   A: [["met", "at soccer camp"], ["like", "?"], ["Minho lives", "in Australia"], ["stay in touch", "?"]],
   B: [["met", "?"], ["like", "games and pizza"], ["Minho lives", "?"], ["stay in touch", "video calls on Sunday"]],
   tip: "<b>They</b> met … · <b>He</b> lives …"
  },
  role: {
   A: ["You write an advice column.", "Ask 5 questions.", "Give one piece of advice."],
   B: ["You have a friend problem.", "Choose: friend moved away / jealous friend / fight with a sibling.", "Answer with 2 sentences."]
  },
  tts: {
   title: "Make a \"Good friend\" guide",
   steps: ["Think of 3 things good friends do.", "Ask your teacher what they think.", "Agree on the top 3 tips.", "Show your guide and tell!"],
   lang: ["A good friend ___.", "When a friend is sad, ___.", "My teacher thinks ___."]
  },
  speech: {
   time: "1 min",
   model: ["Hello! Let me tell you about my best friend.", "Her name is Jisoo. She is in my class.", "We met in art club last year.", "She is quiet, but I am loud.", "We help each other every day.", "Thank you!"],
   outline: ["Hello", "Name and where you met", "What he/she is like", "What you do together", "Thank you!"],
   check: ["Loud voice", "Look at teacher", "Use he / she / we"]
  },
  pron: {
   cols: [["be", ["I'm", "she's", "they're"]], ["will", ["I'll", "he'll", "we'll"]], ["have", ["I've", "you've", "they've"]]],
   up: "Is she your best friend?",
   down: "How did you meet?"
  },
  review: ["I can talk about friends and family.", "I can use he, she, we, they.", "I can ask \"How did you meet?\"", "I can say one more sentence."]
 },
 H: {
  steps: ["Answer", "Reason", "Example", "Ask back"],
  model: [
   ["I'd say around 17 or 18.", "By then, people understand their feelings better.", "My first relationship at 15 was mostly awkward texting.", "When did people usually start dating where you grew up?"],
   ["Yes, I went on one in university.", "It can be good because friends know your type.", "Mine was awkward, but we became good friends.", "Would you trust a friend to set you up?"],
   ["I think similar people last longer.", "Shared values matter more than personality.", "My parents are very different, but they agree on money.", "Are you more attracted to opposites?"],
   ["Yes, I'd want to know early.", "It helps you plan and prepare.", "My cousin painted the baby's room once they knew.", "Would you rather be surprised?"],
   ["Divorce is painful, but sometimes necessary.", "Staying in an unhappy marriage can hurt everyone.", "My friend says her parents became kinder after they split.", "Is divorce too easy or too hard today?"],
   ["They're hard, but they can work.", "They need trust and a clear plan to live together.", "My sister dated someone in Canada for two years, then moved.", "Could you manage one?"],
   ["I think we can't stop it, but we can control it.", "Jealousy is natural; what matters is how you act.", "When I feel jealous, I talk about it instead of checking phones.", "How do you deal with jealousy?"],
   ["I don't support polygamy.", "It's hard for everyone to be treated equally.", "In some countries, it's legal but rare today.", "Why do you think some cultures allow it?"],
   ["No, I think couples should share the cost.", "Relationships should be equal from the start.", "My partner and I take turns paying for dinner.", "Who usually pays in your culture?"],
   ["No, never. Violence is never okay.", "No one deserves to be hurt by someone they love.", "Anyone in danger should call a helpline or the police.", "How can society protect victims better?"]
  ],
  frame: [
   "I'd say around … because …",
   "Yes, I … / No, I've never … I think it's …",
   "I think … attract because …",
   "Yes / No, I'd … because …",
   "I think divorce is … because …",
   "I think they're … They need …",
   "I think we can / can't … When I …, I …",
   "I don't / I support … because …",
   "I think … should pay because …",
   "No, never. … Anyone in danger should …"
  ],
  more: [
   ["Should parents set dating rules?", "Is online dating better than meeting in person?", "Are people dating later than before?"],
   ["What is the best way to meet a partner?", "Would you use a dating app?", "What makes a first date go well?"],
   ["What values must couples share?", "Can very different people be happy together?", "What attracts you first in a person?"],
   ["Why do some parents want a surprise?", "Do parents still prefer sons or daughters?", "Should gender reveal parties exist?"],
   ["How does divorce affect children?", "Should couples try counseling first?", "Why are divorce rates rising?"],
   ["What is the hardest part of distance?", "How often should couples talk?", "Would you move countries for love?"],
   ["Is some jealousy a sign of love?", "Is it okay to check a partner's phone?", "How is jealousy different from envy?"],
   ["Should the law decide how many partners you have?", "How has marriage changed over time?", "Is marriage still necessary?"],
   ["Should the person who asks pay?", "Is splitting the bill unromantic?", "How should couples handle money?"],
   ["Why do some victims stay silent?", "What can friends do to help?", "How can schools teach healthy relationships?"]
  ],
  gram1: {
   chain: ["My parents met when ___. They ___.", "A good partner listens. He/She ___."],
   ex: "T: My parents met when they were 25. They worked at the same company.<br>S: My parents met when …<br>T: …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["Do you think she'd like a surprise?", "Does he remember your birthday?", "Do they argue in front of others?", "Do we need love to be happy?", "Is it true that opposites attract?"],
    ans: "Yes, she does. / No, they don't. <b>+ why?</b>"
   },
   b: {
    title: "A couple you admire",
    big: "They met ___. He ___, and she ___. They ___.",
    ans: "Then ask: <b>What makes them a good couple?</b>"
   }
  },
  opener: {
   think: ["What makes a relationship last?", "Is love a feeling or a decision?", "Are friendships more important than romance?"]
  },
  convo: [
   ["A", "You look worried. What's up?"],
   ["B", "It's {my girlfriend}. She's moving to {London} for work."],
   ["A", "Oh wow. For how long?"],
   ["B", "Two years. I'm not sure we can manage it."],
   ["A", "Lots of couples do. What worries you most?"],
   ["B", "The {time difference}, I guess. And feeling jealous."],
   ["A", "Maybe you two should make a plan together."],
   ["B", "You're right. We could {visit each other} every few months."],
   ["A", "Exactly. If you trust each other, it can work."]
  ],
  swap: [["a person", "my girlfriend"], ["a city", "London"], ["a worry", "time difference"], ["a plan", "visit each other"]],
  lang: [
   ["Show concern", ["What's up?", "You look worried.", "That sounds tough."]],
   ["Give advice", ["Maybe you should …", "Have you talked to him/her?", "If I were you, I'd …"]],
   ["Show understanding", ["I can see why you feel that way.", "That makes sense."]],
   ["Encourage", ["It can work.", "You've got this."]]
  ],
  langPractice: ["My partner is always on his phone.", "I've never been in love.", "My parents are getting divorced.", "I met my wife online.", "My friend is jealous of me.", "I think marriage is old-fashioned."],
  survey: {
   ask: "Do you think",
   cols: ["Me", "My teacher", "One more question"],
   rows: ["love at first sight is real", "opposites attract", "couples should share bills", "long-distance love can work", "jealousy shows love", "marriage is still necessary"],
   q: "Do you think …? → Yes. → Ask: Why? / Can you give an example?",
   report: "We both think ___, but only I ___."
  },
  gap: {
   who: "Hana and Tom",
   q: ["How did they meet?", "How are they different?", "Why was it hard at first?", "How did they solve it?", "What are their plans?"],
   A: [["met", "on a blind date"], ["different", "?"], ["hard at first", "they lived in two countries"], ["solved it", "?"], ["plans", "?"]],
   B: [["met", "?"], ["different", "she's shy, he's outgoing"], ["hard at first", "?"], ["solved it", "he found a job in Seoul"], ["plans", "to get married next spring"]],
   tip: "How did <b>they</b> meet? · <b>She</b>'s shy, <b>he</b>'s outgoing."
  },
  role: {
   A: ["You write an advice column.", "Ask 5 questions + 2 follow-ups.", "Give 2 pieces of advice with reasons."],
   B: ["You have a relationship problem.", "Choose: long-distance / jealous partner / parents don't approve.", "Explain your feelings. Ask for advice."]
  },
  tts: {
   title: "Write \"5 rules for a healthy relationship\"",
   steps: ["Think: what makes love or friendship healthy?", "Ask your teacher 4 of today's questions.", "Agree on 5 rules together.", "Present your rules in 1 minute."],
   lang: ["I think we should add ___ because ___.", "I see your point, but ___.", "We agree that ___."]
  },
  speech: {
   time: "2 min",
   model: ["Hi everyone. Today I'll talk about a couple I admire.", "My grandparents met at a train station in 1970.", "He was a shy student, and she was a bold teacher.", "They're very different, but they respect each other.", "They've had hard times, like money problems.", "But they always talk and never go to bed angry.", "I think respect is the real secret of love.", "Thanks for listening! Any questions?"],
   outline: ["Hook — \"Today I'll talk about…\"", "How they met", "How they are different", "A hard time", "What keeps them together", "Ask for questions"],
   check: ["Clear voice", "Eye contact", "Subject pronouns", "Answer 1 question"]
  },
  pron: {
   cols: [["be", ["I'm", "she's", "they're"]], ["will / would", ["we'll", "he'd", "you'd"]], ["have", ["I've", "we've", "they've"]]],
   up: "Do opposites attract?",
   down: "What makes love last?"
  },
  review: ["I can answer in 4 parts.", "I can use subject pronouns.", "I can give relationship advice.", "I can give a short presentation."]
 }
};
