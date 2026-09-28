// SIU BASIC 017 — Internet (8판 형식, 001 본보기)
// 원본과 다른 점:
//  - Q3 "What are some security issues you must think about when you access the Internet?" → "What security problems should you think about online?" (짧게)
//  - Q4 "Vo you use…" → "Do you use…" (오타)
//  - Q6 "Do you think that the Internet safe for children? Why" → "Do you think the Internet is safe for children? Why?"
//  - Q8 "Have you try bought something online?" → "Have you ever bought something online?"
//  - Q10 "How can you protect our computers against cyber criminal?" → "How can you protect your computer against cybercriminals?"
//  - Keyword Hour 의 뜻이 Western 뜻으로 잘못 복사돼 있었음 → "a period of 60 minutes"
//  - 대답 틀 "Yes I'm often use it" → "Yes, I often use it", "Im using Internet about" → "I use the Internet about", "I think its" → "it's"
//  - 문법 예문 "The lady were wearing funny hats" (단수 예문인데 were) → "The lady was wearing a funny hat."
export default {
 no: "017",
 title: "Internet",
 book: "SIU BASIC 017 - Internet",
 next: "018 Health",
 cover: { h1: "The", em: "Internet", goals: ["Talk about how you use the Internet", "Ask and answer 10 questions", "Use singular and plural nouns"] },
 KW: [
  ["often", "adverb", "자주", "many times"],
  ["hour", "noun", "시간", "a period of 60 minutes"],
  ["security", "noun", "보안", "keeping people and things safe from danger"],
  ["education", "noun", "교육", "teaching and learning, like at school"],
  ["dangerous", "adjective", "위험한", "likely to hurt you"],
  ["safe", "adjective", "안전한", "not in danger"],
  ["game", "noun", "게임", "something you play with rules, for fun"],
  ["online", "adjective", "온라인의", "on the Internet"],
  ["meet", "verb", "만나다", "to see and talk to someone"],
  ["criminal", "noun", "범죄자", "a person who breaks the law"]
 ],
 QS: [
  "Do you often use the Internet?",
  "About how many hours a day do you use the Internet?",
  "What security problems should you think about online?",
  "Do you use the Internet for fun or for education?",
  "Is it dangerous to meet people on the Internet?",
  "Do you think the Internet is safe for children? Why?",
  "Is playing online games a good or bad habit for young people?",
  "Have you ever bought something online?",
  "Would you go on a date with someone you met on the Internet?",
  "How can you protect your computer against cybercriminals?"
 ],
 IMG_E: ["scene-words/17162", "scene-words/18554", "scene-words/18583", "scene-words/19364", "scene-words/18076", "scene-words/19624", "scene-clips/7446", "scene-words/12213", "scene-words/18144", "scene-words/15311"],
 IMG_H: ["scene-clips/7028", "scene-clips/7339", "scene-words/14560", "scene-words/16333", "scene-words/19453", "scene-words/19624", "scene-words/16414", "scene-words/19318", "scene-words/16707", "scene-words/19839"],
 PICS: {
  opener: "scene-words/17237",
  talk: "scene-words/19453",
  group: "scene-clips/7016",
  speech: "scene-words/12053",
  reporter: "scene-clips/7247",
  survey: "scene-words/18341",
  pron: "scene-words/12261",
  roleB: "scene-words/18583",
  cover: "scene-clips/7016",
  back: "scene-words/19333"
 },
 gram1: {
  can: "use singular and plural nouns",
  title: "Singular &",
  em: "Plural Nouns",
  rules: [
   ["One → singular", "I have a <b>laptop</b> and a <b>box</b>."],
   ["More → plural", "two <b>laptops</b> · <b>boxes</b> · <b>cities</b>"]
  ],
  hardNote: "-s · -es (s, sh, ch, x) · -ies (y) · child → children",
  say: [
   "A singular noun means one. A plural noun means more than one. We usually add s, es or ies.",
   "I have a laptop and a box.",
   "two laptops, boxes, cities"
  ]
 },
 gram2: {
  can: "ask \"Is there / Are there…?\"",
  cols: ["Singular (one)", "Plural (more)"],
  rows: [
   ["+", "I read one <b>story</b>.", "I read many <b>stor<mark>ies</mark></b>."],
   ["−", "I don't have a <b>tablet</b>.", "I don't have many <b>app<mark>s</mark></b>."],
   ["?", "Is there a <b>virus</b>?", "Are there any <b>virus<mark>es</mark></b>?"]
  ]
 },
 gapCan: "ask \"How many … does she…?\"",
 role: {
  title: "The",
  em: "Online Safety",
  tail: "Helpline",
  opener: "Hello, Online Safety Helpline. How can I help you?",
  a: "Helper",
  b: "Caller"
 },
 pron: {
  can: "stress long words correctly",
  title: "Word",
  em: "stress",
  game: "Teacher says a word → you clap on the strong part → make a sentence: <i>\"My comPUter is slow.\"</i>"
 },
 E: {
  steps: ["Answer", "More"],
  model: [
   ["Yes, I often use it.", "I watch videos every day."],
   ["I use it about two hours a day.", "I use it after school."],
   ["I must keep my password secret.", "I don't tell my friends."],
   ["I use it for fun and for education.", "I play games and study English."],
   ["Yes, I think it's dangerous.", "Some people tell lies online."],
   ["I think it's safe with parents.", "My mom checks my apps."],
   ["I think it's bad if you play too much.", "One hour is okay."],
   ["Yes, I have. I bought a toy.", "It came in two days."],
   ["No, I wouldn't.", "I don't know them."],
   ["I need a strong password.", "I don't click strange links."]
  ],
  frame: [
   "Yes, I often use it. / No, I don't. I ___.",
   "I use it about ___ hours a day.",
   "I must keep my ___ secret.",
   "I use it for ___. I ___.",
   "Yes / No, I think it's ___.",
   "I think it's ___ because ___.",
   "I think it's good / bad because ___.",
   "Yes, I have. I bought ___. / No, I haven't.",
   "Yes, I would. / No, I wouldn't. ___",
   "I need ___. I don't ___."
  ],
  bank: [
   ["watch videos", "play games", "chat", "study"],
   ["one", "two", "three", "four"],
   ["password", "name", "address", "phone number"],
   ["fun", "education", "games", "homework"],
   ["dangerous", "not dangerous", "lies", "strangers"],
   ["safe", "not safe", "parents check", "bad websites"],
   ["too much", "fun", "friends", "one hour"],
   ["a toy", "clothes", "books", "shoes"],
   ["I don't know them", "It's scary", "My mom says no", "Maybe"],
   ["a strong password", "click strange links", "share passwords", "open strange emails"]
  ],
  more: [
   ["What do you do online?", "What is your favorite website?"],
   ["When do you use it?", "Is it too much?"],
   ["Who knows your password?", "Is your password long?"],
   ["What do you learn online?", "What games do you play?"],
   ["Do you talk to strangers online?", "What would you do if a stranger messaged you?"],
   ["Who checks your phone?", "What apps are good for kids?"],
   ["What online games do you play?", "How long do you play?"],
   ["Who buys things online at home?", "What would you like to buy?"],
   ["Do you have online friends?", "Would you meet them with a parent?"],
   ["What is a bad link?", "Who helps you with your computer?"]
  ],
  gram1: {
   chain: ["I have one ___. My friend has two ___.", "I see many ___ online."],
   ex: "T: I have one phone. My friend has two phones.<br>S: I have one box. My friend has two boxes.<br>T: …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["Do you have games?", "Do you watch videos?", "Do you use apps?", "Do you get emails?", "Do you have passwords?"],
    ans: "Yes, I do. I have three ___. <b>+ one more sentence</b>"
   },
   b: {
    title: "Count it!",
    big: "I have ___ apps, ___ games and one ___.",
    ans: "Then ask: <b>How many apps do you have?</b>"
   }
  },
  opener: {
   think: ["Look at the photo. What is she doing?", "What do you do on the Internet?", "Who do you talk to online?"]
  },
  convo: [
   ["A", "What are you doing?"],
   ["B", "I'm watching {videos} on my tablet."],
   ["A", "Cool! How many hours do you use it?"],
   ["B", "About {two hours} a day."],
   ["A", "Wow! What's your favorite app?"],
   ["B", "I like {YouTube}. How about you?"],
   ["A", "I like {drawing apps}!"]
  ],
  swap: [["something you do online", "videos"], ["how long", "two hours"], ["your favorite app", "YouTube"], ["your partner's favorite", "drawing apps"]],
  lang: [
   ["Show interest", ["Cool!", "Wow!", "Really?"]],
   ["Ask back", ["How about you?", "And you?"]],
   ["Say one more", ["I also …", "It's fun!"]]
  ],
  langPractice: ["I have three games.", "I watch videos every day.", "I don't have a phone.", "My password is long.", "I bought shoes online.", "I play games for two hours."],
  survey: {
   ask: "Do you",
   cols: ["Me", "My teacher"],
   rows: ["use the Internet every day", "have a phone", "play online games", "watch videos", "buy things online", "have a strong password"],
   q: "Do you …?  → Yes, I do. / No, I don't.",
   report: "I ___, but my teacher ___."
  },
  gap: {
   who: "Lily online",
   q: ["How many hours does Lily use the Internet?", "What does she watch?", "What games does she play?", "What did she buy online?"],
   A: [["hours a day", "two hours"], ["watches", "?"], ["games", "puzzle games"], ["bought", "?"]],
   B: [["hours a day", "?"], ["watches", "cat videos"], ["games", "?"], ["bought", "two books"]],
   tip: "one hour → two hour<b>s</b> · one box → two box<b>es</b>"
  },
  role: {
   A: ["You work at a helpline.", "Ask 5 questions.", "Give one safety tip."],
   B: ["You have a problem online.", "Choose: lost password / strange message / game costs money.", "Answer with 2 sentences."]
  },
  tts: {
   title: "Make an \"Internet safety\" poster",
   steps: ["Think of 3 safety rules.", "Ask your teacher. Answer, too.", "Pick the best 3 rules together.", "Draw it and tell!"],
   lang: ["Don't ___.", "Always ___.", "We both think ___."]
  },
  speech: {
   time: "1 min",
   model: ["Hello! Let me tell you about me and the Internet.", "I use it about two hours a day.", "I watch cat videos and play puzzle games.", "I also study English online.", "I never share my password.", "Thank you!"],
   outline: ["Hello", "How many hours", "What you do online", "One safety rule", "Thank you!"],
   check: ["Loud voice", "Look at teacher", "Use plurals (-s)"]
  },
  pron: {
   cols: [["● first", ["Internet", "password", "dangerous"]], ["● second", ["computer", "security", "connection"]], ["● third", ["education", "information", "engineer"]]],
   up: "Do you often use the Internet?",
   down: "How many hours do you use it?"
  },
  review: ["I can talk about the Internet.", "I can use plural nouns (-s, -es, -ies).", "I can ask \"How many …?\"", "I can say one more sentence."]
 },
 H: {
  steps: ["Answer", "Reason", "Example", "Ask back"],
  model: [
   ["Yes, I use the Internet all the time.", "I need it for school, news and chatting.", "I check my messages as soon as I wake up.", "How often do you go online?"],
   ["I'd say about four or five hours a day.", "Most of it is for studying and videos.", "Last week my phone said my screen time was 32 hours!", "Is that more or less than you?"],
   ["Passwords and personal information are big issues.", "Hackers can steal your accounts easily.", "My friend was hacked because her password was 1234.", "How do you protect your accounts?"],
   ["Honestly, I use it more for fun than education.", "Videos and games are easy to reach.", "But I've taken two free online courses in coding.", "What do you usually do online?"],
   ["It can be dangerous if you're not careful.", "People can lie about who they are.", "My cousin met a gamer who turned out to be much older.", "Would you meet an online friend?"],
   ["I think it's safe only with some rules.", "Kids can see harmful videos by accident.", "My little brother uses a kids' app with time limits.", "What rules should parents make?"],
   ["I think it's fine in small amounts.", "Games can teach teamwork and quick thinking.", "But one of my classmates plays until 3 a.m. and sleeps in class.", "How many hours is too many?"],
   ["Yes, I often buy things online.", "It's cheaper and it saves time.", "Last month I ordered a pair of sneakers, and they arrived the next day.", "Have you ever had a bad online order?"],
   ["Maybe, but only after we talked for a long time.", "You never really know someone from their profile.", "I'd meet in a busy café in the daytime and tell my friends.", "Do you know a couple who met online?"],
   ["First, I'd use strong passwords for every account.", "Criminals often guess simple ones.", "I also update my software and never click links in strange emails.", "What do you do to stay safe?"]
  ],
  frame: [
   "Yes, I use it … because … For example, …",
   "About … hours a day, mostly for …",
   "… is a big issue because …",
   "I use it more for … because …",
   "I think it can be … because …",
   "I think it's safe / not safe because …",
   "I think it's good / bad because … But …",
   "Yes, I have. I bought … / No, because …",
   "Maybe / No, because … I'd …",
   "First, I'd … Then, I'd …"
  ],
  more: [
   ["Could you live without the Internet for a week?", "What did people do before the Internet?", "Is the Internet making us smarter?"],
   ["How do you feel when you're offline?", "Should phones be banned in class?", "What is a healthy amount of screen time?"],
   ["Do you use the same password for everything?", "Should companies keep our personal data?", "Have you ever received a scam message?"],
   ["Can online classes replace real teachers?", "What's the best website for learning?", "What skill did you learn online?"],
   ["What are warning signs of a fake profile?", "Why do people lie online?", "Should online games have age checks?"],
   ["At what age should kids get a phone?", "Should parents check their kids' messages?", "What is the worst thing about social media?"],
   ["Are e-sports real sports?", "Can games be a career?", "Should games have a time limit by law?"],
   ["Are online reviews trustworthy?", "Will stores disappear in the future?", "What's the best thing you bought online?"],
   ["Is online dating safe?", "What would you check before a first date?", "Can you fall in love online?"],
   ["Who should stop cybercriminals — police or companies?", "Have you ever lost data?", "Should kids learn cybersecurity at school?"]
  ],
  gram1: {
   chain: ["I have too many ___ on my phone.", "There are lots of ___ and ___ online."],
   ex: "T: I have too many apps on my phone.<br>S: I have too many photos on my phone.<br>T: …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["How many apps do you have?", "How many passwords do you use?", "How many hours are you online?", "How many emails do you get a day?", "How many online friends do you have?"],
    ans: "Answer with a number + plural. <b>+ why?</b>"
   },
   b: {
    title: "Irregular plurals",
    big: "child → ___ · person → ___ · man → ___ · mouse → ___",
    ans: "Then say: <b>Many people / children …</b>"
   }
  },
  opener: {
   think: ["How would your day change without the Internet?", "Has the Internet made friendships better or worse?", "What is the biggest danger online today?"]
  },
  convo: [
   ["A", "You look worried. What's up?"],
   ["B", "I got a weird message from {my bank}."],
   ["A", "What did it say?"],
   ["B", "It asked for my {password} and a code."],
   ["A", "Don't reply! That sounds like a scam."],
   ["B", "Really? It looked so real."],
   ["A", "Scammers copy real logos. Call {the bank} yourself."],
   ["B", "Good idea. Should I delete it?"],
   ["A", "Yes, and change your {passwords}, too."]
  ],
  swap: [["who it's from", "my bank"], ["what it wants", "password"], ["who to call", "the bank"], ["what to change", "passwords"]],
  lang: [
   ["Show concern", ["What's up?", "That sounds strange.", "Are you sure?"]],
   ["Give advice", ["Don't …!", "You should …", "Why don't you …?"]],
   ["Ask for details", ["What did it say?", "When did it arrive?"]],
   ["Agree / disagree", ["Good idea.", "I'm not so sure."]]
  ],
  langPractice: ["I use the same password for everything.", "I bought glasses online.", "I've never been hacked.", "My friend met his girlfriend online.", "I spend five hours on social media.", "I don't read online reviews."],
  survey: {
   ask: "Do you",
   cols: ["Me", "My teacher", "One more question"],
   rows: ["go online as soon as you wake up", "use different passwords", "buy things online every week", "play online games", "have online friends", "take online courses"],
   q: "Do you …? → Yes. → Ask: How many? / How often? / Why?",
   report: "My teacher and I both ___, but only I ___."
  },
  gap: {
   who: "Lily's online life",
   q: ["How many hours is Lily online a day?", "How many passwords does she use?", "What did she buy online last week?", "How many online friends does she have?", "What online class is she taking?"],
   A: [["hours a day", "four hours"], ["passwords", "?"], ["bought", "two phone cases"], ["online friends", "?"], ["online class", "?"]],
   B: [["hours a day", "?"], ["passwords", "twelve different ones"], ["bought", "?"], ["online friends", "about thirty"], ["online class", "Spanish"]],
   tip: "How many <b>hours</b> …? · two phone <b>cases</b>"
  },
  role: {
   A: ["You work at a safety helpline.", "Ask 5 questions + 2 follow-ups.", "Give 3 clear steps to fix it."],
   B: ["You have a big problem online.", "Choose: hacked account / online scam / fake seller.", "Explain what happened in detail."]
  },
  tts: {
   title: "Write \"5 rules for a safe online life\"",
   steps: ["List ideas: passwords, strangers, screen time…", "Ask your teacher 4 of today's questions.", "Agree on the 5 best rules together.", "Present your rules in 1 minute."],
   lang: ["I think rule 1 should be ___ because ___.", "That's true, but ___.", "So we agree that ___."]
  },
  speech: {
   time: "2 min",
   model: ["Hi everyone. Today I'll talk about me and the Internet.", "I'm online about four hours a day, mostly on my phone.", "I use it for classes, videos and chatting with friends.", "The Internet is useful, but it has dangers, too.", "Last year a friend's account was hacked because of an easy password.", "Now I use different passwords and never click strange links.", "I think we should control the Internet, not let it control us.", "Thanks for listening! Any questions?"],
   outline: ["Hook — \"Today I'll talk about…\"", "How many hours + where", "What you use it for", "One danger + a story", "How you stay safe", "Ask for questions"],
   check: ["Clear voice", "Eye contact", "Correct plurals", "Answer 1 question"]
  },
  pron: {
   cols: [["● first", ["Internet", "password", "criminal"]], ["● second", ["computer", "important", "connection"]], ["● third", ["education", "information", "entertainment"]]],
   up: "Is it safe for children?",
   down: "How can you protect your computer?"
  },
  review: ["I can answer in 4 parts.", "I can use regular and irregular plurals.", "I can give advice about online safety.", "I can give a short presentation."]
 }
};
