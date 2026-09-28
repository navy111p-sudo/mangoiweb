// SIU BASIC 026 — Should You (8판 형식, 001 본보기와 같은 모양)
// 원본과 다른 점:
//  - Q1 "sleep on the park" → "sleep in the park"
//  - Q2 "require children to do house work" → "make children do housework" (Keyword house → housework 로 뜻 맞춤)
//  - Q3 "Should teachers be strict of their students" → "Should teachers be strict with their students?"
//  - Q4 "and you feel depressed" → "and you felt depressed" (가정법 시제), Keyword Depress → depressed(형용사)
//  - Q5 "protect our environment" → "protect the environment"
//  - Q6 "do their homework everyday" → "do homework every day"
//  - Q7 "if you found a wallet which had 2,000 dollars" → "with 2,000 dollars in it"
//  - Q8 "if you get stress with debt and bills" → "if you are stressed about debt and bills?"
//  - Q9·Q10 물음표 추가, "get rich quickly" 유지
//  - 답 틀의 "I think its" → "I think it's", "I will do … and … in order to protect it" 는 should 문형으로 정리
export default {
 no: "026",
 title: "Should You",
 book: "SIU BASIC 026 - Should you",
 next: "027 Weather and the Seasons",
 cover: { h1: "What", em: "Should You Do?", goals: ["Give advice with should", "Ask and answer 10 questions", "Give a short presentation"] },
 KW: [
  ["allow", "verb", "허용하다", "to say someone can do something"],
  ["housework", "noun", "집안일", "cleaning, cooking and washing at home"],
  ["strict", "adjective", "엄격한", "wanting people to follow the rules"],
  ["depressed", "adjective", "우울한", "very sad for a long time"],
  ["environment", "noun", "환경", "the air, water and land around us"],
  ["homework", "noun", "숙제", "schoolwork you do at home"],
  ["wallet", "noun", "지갑", "a small case for money and cards"],
  ["debt", "noun", "빚", "money you owe to someone"],
  ["gain", "verb", "(체중이) 늘다", "to get more of something"],
  ["quickly", "adverb", "빨리", "at a fast speed"]
 ],
 QS: [
  "Should homeless people be allowed to sleep in the park or in the subway?",
  "Should parents make children do housework?",
  "Should teachers be strict with their students?",
  "If your girlfriend or boyfriend left you, what should you do?",
  "What should you do to protect the environment?",
  "Should teachers make students do homework every day?",
  "What should you do if you found a wallet with 2,000 dollars in it?",
  "What should you do if you are stressed about debt and bills?",
  "What should you do if you gained a lot of weight?",
  "What should you do if you want to get rich quickly?"
 ],
 IMG_E: ["scene-words/14958", "scene-words/15267", "scene-words/12229", "scene-words/16270", "scene-words/18186", "scene-words/16910", "scene-words/19412", "scene-words/19419", "scene-words/19206", "scene-words/12693"],
 IMG_H: ["scene-words/14958", "scene-words/18493", "scene-words/14292", "scene-words/16269", "scene-words/18188", "scene-words/18522", "scene-words/19750", "scene-words/20247", "scene-words/16581", "scene-words/18134"],
 PICS: {
  opener: "scene-words/12233",
  talk: "scene-words/18146",
  group: "scene-clips/7041",
  speech: "scene-words/16400",
  reporter: "scene-words/13053",
  survey: "scene-words/18493",
  pron: "scene-clips/7477",
  roleB: "scene-words/16866",
  cover: "scene-words/18949",
  back: "scene-words/18131"
 },
 gram1: {
  can: "name male and female nouns",
  title: "Gender of",
  em: "Nouns",
  rules: [
   ["A different word", "<b>father</b> / <b>mother</b> · <b>king</b> / <b>queen</b>"],
   ["Add -ess", "<b>prince</b> / <b>princ<mark>ess</mark></b> · <b>host</b> / <b>host<mark>ess</mark></b>"]
  ],
  hardNote: "today many people say actor, server, flight attendant for everyone",
  say: ["Some nouns are for males and some are for females.", "Father and mother. King and queen.", "Prince and princess. Waiter and waitress."]
 },
 gram2: {
  can: "use he / she nouns in sentences",
  cols: ["Male (he)", "Female (she)"],
  rows: [
   ["+", "He is an <b>actor</b>.", "She is an <b>actr<mark>ess</mark></b>."],
   ["−", "He isn't my <b>grandfather</b>.", "She isn't my <b>grandmother</b>."],
   ["?", "Is he a <b>prince</b>?", "Is she a <b>princ<mark>ess</mark></b>?"]
  ]
 },
 gapCan: "ask \"What should he do?\"",
 role: {
  title: "The",
  em: "Advice",
  tail: "Show",
  opener: "Welcome to the Advice Show! What's your problem today?",
  a: "Show host",
  b: "Caller with a problem"
 },
 pron: {
  can: "say should / shouldn't clearly",
  title: "Silent",
  em: "L",
  game: "Teacher says a problem → you give advice with the right sound: <i>\"You shouldn't worry.\"</i>"
 },
 E: {
  steps: ["Answer", "More"],
  model: [
   ["No, they should sleep in a warm shelter.", "The park is too cold at night."],
   ["Yes, they should.", "Kids can wash dishes and clean their rooms."],
   ["Yes, a little.", "Strict teachers help students learn."],
   ["You should talk to your family.", "You should also play outside."],
   ["You should use less plastic.", "You should also turn off the lights."],
   ["No, they shouldn't.", "Kids need time to play."],
   ["You should give it to the police.", "It is not your money."],
   ["You should talk to your parents.", "They can help you make a plan."],
   ["You should exercise every day.", "You should eat fewer snacks."],
   ["You should save your money.", "There is no quick way!"]
  ],
  frame: [
   "No, they should ___. / Yes, they should.",
   "Yes, they should. Kids can ___.",
   "Yes, a little. / No. Teachers should be ___.",
   "You should ___. You should also ___.",
   "You should ___. You should also ___.",
   "Yes, they should. / No, they shouldn't. Kids need ___.",
   "You should give it to ___.",
   "You should talk to ___.",
   "You should ___ and ___.",
   "You should ___."
  ],
  bank: [
   ["a warm shelter", "a safe place", "a home", "the park"],
   ["wash dishes", "clean their rooms", "feed the pet", "make the bed"],
   ["kind", "fair", "strict", "funny"],
   ["talk to your family", "play outside", "listen to music", "see a friend"],
   ["use less plastic", "recycle", "turn off the lights", "walk"],
   ["time to play", "rest", "practice", "sleep"],
   ["the police", "the owner", "a teacher", "your parents"],
   ["your parents", "a teacher", "a bank", "a friend"],
   ["exercise", "eat vegetables", "walk more", "eat fewer snacks"],
   ["save money", "work hard", "study", "sell things"]
  ],
  more: [
   ["Have you seen a homeless person?", "How can we help them?"],
   ["What housework do you do?", "Do you like it?"],
   ["Is your teacher strict?", "Do you like strict teachers?"],
   ["What do you do when you are sad?", "Who makes you happy?"],
   ["Do you recycle at home?", "What else can you do?"],
   ["How much homework do you have?", "When do you do it?"],
   ["Have you found money before?", "What did you do?"],
   ["Do you save your pocket money?", "What do you spend it on?"],
   ["What exercise do you like?", "What healthy food do you like?"],
   ["What would you do with a lot of money?", "Is money important?"]
  ],
  gram1: {
   chain: ["My ___ is a man.", "My ___ is a woman."],
   ex: "T: My father is a man. My mother is a woman.<br>S: My uncle is a man. My aunt is a woman.<br>T: My …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["Is your grandmother kind?", "Is your uncle tall?", "Is your aunt funny?", "Is your brother strict?", "Is your sister busy?"],
    ans: "Yes, he/she is. / No, he/she isn't. <b>+ one more sentence</b>"
   },
   b: {
    title: "He or she?",
    big: "A king and a ___. A prince and a ___. A waiter and a ___.",
    ans: "Then say: <b>My grandfather and my ___ live in ___.</b>"
   }
  },
  opener: {
   think: ["Look at the photo. What is the man saying?", "Who gives you good advice?", "What should you do when you are tired?"]
  },
  convo: [
   ["A", "You look sad, {Jun}. What's wrong?"],
   ["B", "I have too much {homework}."],
   ["A", "Oh no! You should {make a plan}."],
   ["B", "Good idea. What else?"],
   ["A", "You shouldn't {play games} first."],
   ["B", "OK. Thanks for the advice!"],
   ["A", "No problem!"]
  ],
  swap: [["your name", "Jun"], ["a problem", "homework"], ["good advice", "make a plan"], ["a bad idea", "play games"]],
  lang: [
   ["Give advice", ["You should …", "You shouldn't …", "Why don't you …?"]],
   ["Say thanks", ["Good idea!", "Thanks!"]],
   ["Show you care", ["What's wrong?", "Oh no!"]]
  ],
  langPractice: ["I'm tired.", "I'm hungry.", "I lost my pencil.", "I have a cold.", "I'm bored.", "I have a test."],
  survey: {
   ask: "Should kids",
   cols: ["Me", "My teacher"],
   rows: ["do housework", "have a phone", "go to bed at nine", "do homework every day", "have a pet", "get pocket money"],
   q: "Should kids …?  → Yes, they should. / No, they shouldn't.",
   report: "Kids should ___. My teacher says no."
  },
  gap: {
   who: "Tom",
   q: ["What is Tom's problem?", "What should he do first?", "What shouldn't he do?", "Who can help him?"],
   A: [["problem", "a bad cold"], ["first", "?"], ["shouldn't", "go outside"], ["helper", "?"]],
   B: [["problem", "?"], ["first", "drink warm water"], ["shouldn't", "?"], ["helper", "his mom"]],
   tip: "He → <b>should</b> rest · <b>shouldn't</b> go"
  },
  role: {
   A: ["You host a radio advice show.", "Ask about the problem.", "Give 3 pieces of advice."],
   B: ["You have a problem.", "Choose: lost dog / bad grade / no friends.", "Answer with 2 sentences."]
  },
  tts: {
   title: "Make a \"Happy Kid\" rule list",
   steps: ["Pick 3 of today's questions.", "Ask your teacher's advice.", "Choose the 3 best rules.", "Draw your list and tell!"],
   lang: ["Kids should ___.", "Kids shouldn't ___.", "My teacher thinks ___."]
  },
  speech: {
   time: "1 min",
   model: ["Hello! I'm Yuna.", "Here is my advice for kids.", "You should help with housework.", "You should save your money.", "You shouldn't use plastic bags.", "Thank you!"],
   outline: ["Name", "Advice 1 — home", "Advice 2 — money", "Advice 3 — Earth", "Thank you!"],
   check: ["Loud voice", "Look at the camera", "Say 3 pieces of advice"]
  },
  pron: {
   cols: [["should", ["should", "could", "would"]], ["shouldn't", ["shouldn't", "couldn't", "wouldn't"]], ["silent L", ["walk", "talk", "half"]]],
   up: "Should I help?",
   down: "What should I do?"
  },
  review: ["I can give advice with should.", "I can say he / she nouns.", "I can ask \"What should I do?\"", "I can say one more sentence."]
 },
 H: {
  steps: ["Answer", "Reason", "Example", "Ask back"],
  model: [
   ["No, but we shouldn't punish them either.", "The real problem is a lack of safe housing.", "Shelters are often full in winter.", "What should the city do?"],
   ["Yes, parents should make kids do housework.", "It teaches responsibility and life skills.", "I started doing laundry at twelve, and now I can live alone.", "Did you do chores as a kid?"],
   ["Teachers should be strict, but also fair.", "Clear rules make a class feel safe.", "I learned the most from my strictest teacher.", "Who was your strictest teacher?"],
   ["You should let yourself feel sad for a while.", "Hiding your feelings only makes it worse.", "My friend joined a running club and felt better.", "How do you deal with sadness?"],
   ["We should cut down on single-use plastic.", "It fills our oceans and never really goes away.", "I carry a tumbler, so I never buy plastic cups.", "What do you do for the environment?"],
   ["I don't think homework should be daily.", "Students also need time to rest and explore.", "Finland gives little homework but still has great schools.", "How much homework is too much?"],
   ["You should hand it in to the police right away.", "Someone is probably panicking about that money.", "A student in Busan returned a wallet and got a thank-you letter.", "Would you be tempted to keep it?"],
   ["You should make a budget and ask for help.", "Ignoring debt only makes the stress grow.", "My cousin listed every bill and paid the smallest first.", "How do you handle money stress?"],
   ["You should change your habits slowly.", "Crash diets don't last.", "I lost five kilos by walking to school instead of taking the bus.", "Have you ever tried to get fit?"],
   ["Honestly, you shouldn't try to get rich quickly.", "Fast money plans are often scams.", "Many people lost everything in risky coin investments.", "Do you believe in getting rich fast?"]
  ],
  frame: [
   "I think they should / shouldn't … because …",
   "Parents should … because … For example, …",
   "Teachers should be … because …",
   "You should … because … Once, …",
   "We should … because … I …",
   "Homework should … because …",
   "You should … because …",
   "You should … For example, …",
   "You should … because … Last time, …",
   "You should … because …"
  ],
  more: [
   ["Whose job is it to help homeless people?", "Shelters or cash — which helps more?", "What causes homelessness?"],
   ["Should kids get paid for chores?", "Should chores be shared equally by boys and girls?", "Which chore do you hate most?"],
   ["What makes a teacher respected?", "Can a teacher be too nice?", "Should students grade their teachers?"],
   ["Should you stay friends with an ex?", "Is it good to talk to a counselor?", "How long does sadness last?"],
   ["Should plastic bags be banned everywhere?", "Is the government or each person more responsible?", "What will the planet look like in 50 years?"],
   ["Does homework really help you learn?", "Should schools replace homework with projects?", "Do you do homework better alone or with friends?"],
   ["Should finders get a reward?", "Would you keep 2 dollars? 200? Where is the line?", "Is honesty always the best policy?"],
   ["Should schools teach money management?", "Is it OK to borrow money from friends?", "Credit cards: helpful or dangerous?"],
   ["Is weight a health issue or a personal choice?", "Should junk food be taxed?", "Why do people give up on diets?"],
   ["Is it possible to be rich and happy?", "Should the lottery be allowed?", "What does \"rich\" mean to you?"]
  ],
  gram1: {
   chain: ["My ___ is a man, and my ___ is a woman.", "A ___ becomes a ___ with -ess."],
   ex: "T: My uncle is a man, and my aunt is a woman.<br>S: A prince becomes a princess with -ess.<br>T: …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["Is your grandfather strict?", "Is your landlord kind?", "Is your favorite actress Korean?", "Would you like to be a prince or princess for a day?", "Is your aunt good at giving advice?"],
    ans: "Answer <b>+ reason and example</b>"
   },
   b: {
    title: "Old or new word?",
    big: "Some people say \"stewardess,\" but now we say ___. I think ___ because ___.",
    ans: "Then ask: <b>Should we use the same word for everyone?</b>"
   }
  },
  opener: {
   think: ["When do people ask you for advice?", "Is it easy to take advice from others? Why?", "What is the best advice you've ever received?"]
  },
  convo: [
   ["A", "Hey, you seem stressed. Is everything OK?"],
   ["B", "Not really. I spent too much money on {clothes}."],
   ["A", "Oh no. Can you still pay your {phone bill}?"],
   ["B", "I'm not sure. What should I do?"],
   ["A", "I think you should {make a budget}."],
   ["B", "That's a good idea, but it sounds hard."],
   ["A", "It's easier than it sounds. Start small."],
   ["B", "OK. And what shouldn't I do?"],
   ["A", "You shouldn't {borrow money} from friends!"]
  ],
  swap: [["something you bought", "clothes"], ["a bill", "phone bill"], ["good advice", "make a budget"], ["bad advice", "borrow money"]],
  lang: [
   ["Give advice", ["You should …", "If I were you, I'd …", "Why don't you …?"]],
   ["Warn", ["You'd better not …", "You shouldn't …", "Be careful."]],
   ["Accept / refuse", ["That's a great idea.", "I'll try that.", "I'm not sure that'll work."]],
   ["Show sympathy", ["That sounds tough.", "I'm sorry to hear that."]]
  ],
  langPractice: ["I can't sleep.", "I failed my test.", "My friend is angry at me.", "I spend too much on games.", "I want to quit my job.", "I found 50,000 won."],
  survey: {
   ask: "Should",
   cols: ["Me", "My teacher", "One more question"],
   rows: ["kids get paid for chores", "teachers give homework daily", "phones be banned in class", "plastic cups be banned", "finders keep lost money", "students choose their own school"],
   q: "Should …? → Yes. → Ask: Why? / What if…? / Is there an exception?",
   report: "My teacher and I both think ___, but we disagree about ___."
  },
  gap: {
   who: "Tom",
   q: ["What is Tom's problem?", "Why is he stressed?", "What should he do first?", "What shouldn't he do? Why?", "Who can help him?"],
   A: [["problem", "credit card debt"], ["why stressed", "?"], ["first", "list all his bills"], ["shouldn't", "?"], ["helper", "?"]],
   B: [["problem", "?"], ["why stressed", "rent is due Friday"], ["first", "?"], ["shouldn't", "borrow more — more debt"], ["helper", "a money counselor"]],
   tip: "He → <b>should</b> list · <b>shouldn't</b> borrow"
  },
  role: {
   A: ["You host a late-night advice show.", "Ask 5 questions + 2 follow-ups.", "Give 3 pieces of advice with reasons."],
   B: ["You call with a problem.", "Choose: debt / breakup / strict boss.", "Explain details. Push back once: \"But what if…?\""]
  },
  tts: {
   title: "Write a \"Should\" law for your city",
   steps: ["Think: what problem does your city have?", "Ask your teacher 4 of today's questions.", "Agree on 1 new law and 2 reasons.", "Present your law in 1 minute."],
   lang: ["People should ___ because ___.", "That's fair, but what about ___?", "So we agree that ___."]
  },
  speech: {
   time: "2 min",
   model: ["Hi everyone. Today I'd like to give you three pieces of advice.", "First, you should do some housework every day.", "It teaches responsibility, and your family will thank you.", "Second, you shouldn't try to get rich quickly.", "Fast money plans are usually scams.", "Third, you should protect the environment.", "I carry a tumbler, and it's easy. You can do it too.", "Thanks for listening! Any questions?"],
   outline: ["Hook — \"I'd like to give…\"", "Advice 1 + reason", "Advice 2 + example", "Advice 3 + what I do", "Short summary", "Ask for questions"],
   check: ["Clear voice", "Eye contact", "First / Second / Third", "Answer 1 question"]
  },
  pron: {
   cols: [["should", ["should", "could", "would"]], ["shouldn't", ["shouldn't", "couldn't", "wouldn't"]], ["silent L", ["walk", "calm", "half"]]],
   up: "Should I tell the police?",
   down: "What should I do next?"
  },
  review: ["I can answer in 4 parts.", "I can use male and female nouns.", "I can give and react to advice.", "I can give a short presentation."]
 }
};
