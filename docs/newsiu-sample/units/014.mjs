// SIU BASIC 014 — Friends (8판 형식, 001 본보기)
// 원본과 다른 점:
//  - Q3 "Do you have any childhood friends that are still strong today?" → "…childhood friends you are still close to today?" (우정이 strong 이지 친구가 strong 이 아님)
//  - Q6 "there is an end to any true friendships" → "a true friendship can ever end?"
//  - Q8 "friends who would risk their life" → "their lives"
//  - 문법 슬라이드 오타: "been 9the past participle" → "(the past participle)", "S had v-ing (past particple)" → "S + had been + v-ing"
//  - 대답 틀 "I sometimes talk/ignore/confront/backbike" → backbite 는 쓰지 않음(쉬운 판 talk / wait / say sorry)
//  - Keyword Risk(verb) 의 뜻이 명사 뜻이었음 → 동사 뜻으로 바로잡음
export default {
 no: "014",
 title: "Friends",
 book: "SIU BASIC 014 - Friends",
 next: "015 Habits",
 cover: { h1: "Friends", em: "& Friendship", goals: ["Talk about your friends", "Ask and answer 10 questions", "Say what had been happening"] },
 KW: [
  ["need", "verb", "필요하다", "to must have something because it is important"],
  ["describe", "verb", "묘사하다", "to say what someone or something is like"],
  ["childhood", "noun", "어린 시절", "the time when you are a child"],
  ["Internet", "noun", "인터넷", "the world network that connects computers"],
  ["misunderstanding", "noun", "오해", "when people do not understand each other correctly"],
  ["believe", "verb", "믿다", "to feel sure that something is true"],
  ["borrow", "verb", "빌리다", "to take something and give it back later"],
  ["risk", "verb", "위험을 무릅쓰다", "to do something even if it may be dangerous"],
  ["steal", "verb", "훔치다", "to take something that is not yours without asking"],
  ["trust", "verb", "믿다, 신뢰하다", "to believe that someone is good and honest"]
 ],
 QS: [
  "Why do we need friends?",
  "Describe one of your closest friends.",
  "Do you have any childhood friends you are still close to today?",
  "Have you made any friends over the Internet?",
  "What do you do when you have a misunderstanding with a friend?",
  "Do you believe that a true friendship can ever end?",
  "Is it a good idea to borrow money from a friend? Why or why not?",
  "Do you have any friends who would risk their lives to save you?",
  "Have you ever stolen anything from a friend?",
  "Do you trust all of your friends? Why?"
 ],
 IMG_E: ["scene-words/12021", "scene-words/19351", "scene-words/17231", "scene-words/17162", "scene-words/14879", "scene-words/18463", "scene-words/15599", "scene-words/16058", "scene-words/19750", "scene-words/18638"],
 IMG_H: ["scene-words/12021", "scene-words/19351", "scene-words/17231", "scene-words/17162", "scene-words/18145", "scene-words/19720", "scene-words/15599", "scene-words/18711", "scene-words/19750", "scene-words/18638"],
 PICS: {
  opener: "scene-words/18002",
  talk: "scene-clips/7477",
  group: "scene-words/18146",
  speech: "scene-words/12053",
  reporter: "scene-words/13053",
  survey: "scene-clips/5032",
  pron: "scene-clips/5038",
  roleB: "scene-words/18145",
  cover: "scene-words/12021",
  back: "scene-words/15414"
 },
 gram1: {
  can: "say what had been happening",
  title: "Past Perfect",
  em: "Continuous",
  rules: [
   ["How long", "We <b>had been playing</b> for an hour when it rained."],
   ["Why", "I was tired because I <b>had been running</b>."]
  ],
  hardNote: "for · since · all morning · by the time · when",
  say: [
   "The past perfect continuous shows an action that was going on up to a time in the past.",
   "We had been playing for an hour when it rained.",
   "I was tired because I had been running."
  ]
 },
 gram2: {
  can: "ask \"Had you been …?\"",
  cols: ["I · you · we · they", "he · she · it"],
  rows: [
   ["+", "We <b>had been talking</b> for hours.", "She <b>had been waiting</b> for me."],
   ["−", "I <b>hadn't been sleeping</b> well.", "He <b>hadn't been studying</b>."],
   ["?", "<b>Had</b> you <b>been waiting</b> long?", "<b>Had</b> she <b>been crying</b>?"]
  ]
 },
 gapCan: "ask about someone's friend",
 role: {
  title: "The",
  em: "Friend",
  tail: "Advice Show",
  opener: "Welcome to the show! What happened with your friend?",
  a: "Show host",
  b: "Guest"
 },
 pron: {
  can: "say I'd · hadn't · been smoothly",
  title: "Short forms with",
  em: "had",
  game: "Teacher says a long form → you say the short form in a sentence: <i>\"I'd been waiting for you!\"</i>"
 },
 E: {
  steps: ["Answer", "More"],
  model: [
   ["We need friends because they make us happy.", "We can play and laugh together."],
   ["My best friend is Yuna. She likes dancing.", "She is tall and very funny."],
   ["Yes, I do. Minho was my friend in kindergarten.", "We still play together on weekends."],
   ["No, I haven't made friends online.", "I only play with friends at school."],
   ["I talk to my friend and say sorry.", "Then we are friends again."],
   ["I believe true friends stay together.", "My mom and her friend are still friends."],
   ["I think it is a bad idea.", "We may fight if I can't give it back."],
   ["Yes, I do. My brother would save me.", "He is very brave."],
   ["No, I haven't stolen anything.", "Stealing is wrong."],
   ["I trust my best friends.", "They keep my secrets."]
  ],
  frame: [
   "We need friends because they ___.",
   "My best friend is ___. He/She is ___.",
   "Yes, I do. ___ was my friend in ___.",
   "Yes, I have. / No, I haven't made friends online.",
   "I ___ and say sorry.",
   "I believe / don't believe true friends ___.",
   "I think it is a good / bad idea because ___.",
   "Yes, I do. ___ would save me.",
   "No, I haven't. Stealing is ___.",
   "I trust ___ because they ___."
  ],
  bank: [
   ["make us happy", "help us", "play with us", "listen to us"],
   ["kind", "funny", "tall", "smart"],
   ["kindergarten", "first grade", "my town", "church"],
   ["games", "videos", "school", "online class"],
   ["talk", "wait a little", "write a note", "hug"],
   ["stay together", "never fight", "can move away", "forgive"],
   ["we may fight", "it's easy", "they help me", "I can't pay it back"],
   ["My brother", "My dad", "My best friend", "My mom"],
   ["wrong", "bad", "not nice", "unfair"],
   ["my best friends", "some friends", "keep secrets", "tell the truth"]
  ],
  more: [
   ["How many friends do you have?", "Who is your newest friend?"],
   ["How did you meet?", "What do you do together?"],
   ["What did you play when you were little?", "Do you have old photos?"],
   ["Do you play games online?", "Is it fun to chat online?"],
   ["When did you last fight with a friend?", "Who said sorry first?"],
   ["Who is your oldest friend?", "Can friends live far away?"],
   ["What do you borrow from friends?", "Do you lend your things?"],
   ["Who is the bravest person you know?", "Would you help a friend?"],
   ["What would you do if a friend took your pencil?", "Is it okay to borrow without asking?"],
   ["Who do you tell secrets to?", "How can you be a good friend?"]
  ],
  gram1: {
   chain: ["I was tired because I had been ___.", "I was happy because I had been ___."],
   ex: "T: I was tired because I had been running.<br>S: I was hungry because I had been swimming.<br>T: I …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["Had you been sleeping?", "Had you been eating?", "Had you been playing games?", "Had you been reading?", "Had you been waiting long?"],
    ans: "Yes, I had. / No, I hadn't. <b>+ one more sentence</b>"
   },
   b: {
    title: "Before class",
    big: "Before class, I had been ___ for ___ minutes.",
    ans: "Then ask: <b>What had you been doing?</b>"
   }
  },
  opener: {
   think: ["Look at the photo. What are they doing?", "Who is your best friend?", "What do you like to do with friends?"]
  },
  convo: [
   ["A", "Hi! Who is that boy with you?"],
   ["B", "That's {Minho}. He's my best friend."],
   ["A", "How did you meet him?"],
   ["B", "We met at {soccer club}."],
   ["A", "Cool! What do you do together?"],
   ["B", "We {ride bikes}. It's fun!"],
   ["A", "He looks {funny}!"]
  ],
  swap: [["a friend's name", "Minho"], ["a place", "soccer club"], ["an activity", "ride bikes"], ["a word for your friend", "funny"]],
  lang: [
   ["Show interest", ["Really?", "Cool!", "That's nice!"]],
   ["Ask back", ["How about you?", "And you?"]],
   ["Say one more", ["We also …", "He is so …"]]
  ],
  langPractice: ["My friend moved away.", "I have a new friend.", "My friend lent me a pen.", "We had a fight.", "My friend is from Japan.", "We said sorry."],
  survey: {
   ask: "Do you",
   cols: ["Me", "My teacher"],
   rows: ["have a best friend", "have an old friend", "have an online friend", "lend things to friends", "tell friends secrets", "say sorry first"],
   q: "Do you …?  → Yes, I do. / No, I don't.",
   report: "I ___, but my teacher ___."
  },
  gap: {
   who: "Sora's best friend",
   q: ["What is her name?", "Where did they meet?", "What do they do together?", "What is she like?"],
   A: [["name", "Mia"], ["met at", "?"], ["together", "draw pictures"], ["she is", "?"]],
   B: [["name", "?"], ["met at", "art class"], ["together", "?"], ["she is", "kind and shy"]],
   tip: "They <b>met</b> at … · She <b>is</b> …"
  },
  role: {
   A: ["You are a TV show host.", "Ask 5 questions.", "Give one piece of advice."],
   B: ["You had a fight with a friend.", "Choose: a lost toy / a secret / a game.", "Answer with 2 sentences."]
  },
  tts: {
   title: "Make a \"Good friend\" poster",
   steps: ["Think of 3 things good friends do.", "Ask your teacher. Answer, too.", "Pick the best 3 together.", "Draw it and tell!"],
   lang: ["A good friend ___.", "My teacher thinks ___.", "We both think ___."]
  },
  speech: {
   time: "1 min",
   model: ["Hello! Let me tell you about my best friend.", "Her name is Yuna.", "We met in first grade.", "She is kind and very funny.", "We draw and play games together.", "Thank you!"],
   outline: ["Friend's name", "How you met", "What he/she is like", "What you do together", "Thank you!"],
   check: ["Loud voice", "Look at teacher", "Say 5 things"]
  },
  pron: {
   cols: [["I had → I'd", ["I'd been", "we'd been", "she'd been"]], ["had not", ["hadn't", "hadn't been", "hadn't slept"]], ["-ing", ["talking", "waiting", "playing"]]],
   up: "Had you been waiting long?",
   down: "What had you been doing?"
  },
  review: ["I can talk about my friends.", "I can use had been + -ing.", "I can ask \"Had you been …?\"", "I can say one more sentence."]
 },
 H: {
  steps: ["Answer", "Reason", "Example", "Ask back"],
  model: [
   ["I think we need friends because nobody can do everything alone.", "Friends support us when life gets hard.", "When I failed a test, my friends cheered me up all week.", "Why do you think friends matter?"],
   ["One of my closest friends is Jisoo.", "She's honest and always makes time for people.", "She once stayed up late to help me finish a project.", "Who is your closest friend?"],
   ["Yes, I still see my friend Hana from elementary school.", "We grew up together, so she knows me really well.", "We had been neighbors for ten years before she moved.", "Do you keep in touch with old friends?"],
   ["Yes, I've made a few friends online.", "We share the same hobbies, like drawing and games.", "I met one of them in person last summer.", "Have you ever met an online friend?"],
   ["I usually wait a day and then talk calmly.", "If I talk when I'm angry, I say the wrong things.", "Last month a friend and I had been arguing for days, so I called her.", "How do you fix a fight?"],
   ["I believe some friendships can end.", "People change, and some friends just drift apart.", "I had a close friend in middle school, but we don't talk now.", "Do you think true friends last forever?"],
   ["I think it's usually a bad idea.", "Money can create stress between friends.", "My cousin lent money to a friend and they stopped talking.", "Have you ever lent money to anyone?"],
   ["I think my best friend would.", "She's loyal and very brave.", "She once jumped in the river to help a kid who had fallen in.", "Would you risk your life for a friend?"],
   ["No, I've never stolen anything from a friend.", "Trust is the most important thing in a friendship.", "Once I borrowed a book and forgot, so I returned it with a note.", "What would you do if a friend stole from you?"],
   ["No, I don't trust all of them equally.", "Trust has to be earned over time.", "I only share secrets with two friends who have never told anyone.", "How do you know you can trust someone?"]
  ],
  frame: [
   "I think we need friends because … For example, …",
   "One of my closest friends is … He/She is … because …",
   "Yes / No, … We had been friends for … when …",
   "Yes, I've … / No, I haven't … because …",
   "When we have a misunderstanding, I … because …",
   "I believe / don't believe … because … Once, …",
   "I think it's a good / bad idea because …",
   "I think … would, because … Once, …",
   "No, I've never … because … Once, …",
   "I trust / don't trust … because …"
  ],
  more: [
   ["Can people be happy without friends?", "What kind of friend are you?", "Is it harder to make friends as an adult?"],
   ["What do you and your friend argue about?", "How is your friend different from you?", "What do you admire about your friend?"],
   ["Why do some childhood friendships last?", "What had you been doing with your friends back then?", "Would you like to meet an old friend again?"],
   ["Are online friends real friends?", "What should you never share online?", "How is online talk different from face-to-face?"],
   ["What causes most misunderstandings?", "Is texting worse for misunderstandings?", "Is it hard for you to say sorry?"],
   ["What can end a friendship?", "Can a friendship come back after a fight?", "Can men and women be close friends?"],
   ["Is borrowing things different from borrowing money?", "What if a friend never pays you back?", "Should friends start a business together?"],
   ["What makes someone loyal?", "Is it fair to ask a friend for a big favor?", "Who is a hero in your life?"],
   ["Why do some people steal?", "Would you tell a teacher if a friend stole?", "Is copying homework a kind of stealing?"],
   ["What breaks trust fastest?", "Can you trust someone you met online?", "Is it okay to tell a friend's secret to protect them?"]
  ],
  gram1: {
   chain: ["I had been ___ for ___ when ___.", "By the time I got home, I had been ___ all day."],
   ex: "T: I had been studying for two hours when my friend called.<br>S: I had been sleeping for ten minutes when …<br>T: …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["Had you been working all day?", "Had you been studying before class?", "Had you been feeling tired this week?", "Had you been waiting long for this class?", "Had you been using your phone?"],
    ans: "Yes, I had. / No, I hadn't. <b>+ why?</b>"
   },
   b: {
    title: "A friend story",
    big: "My friend and I had been ___ for ___ when ___. Had you ever ___?",
    ans: "Then ask: <b>How long had you been friends?</b>"
   }
  },
  opener: {
   think: ["What makes a friendship last for years?", "Is one close friend better than many friends?", "What had you been doing with friends last weekend?"]
  },
  convo: [
   ["A", "You look upset. What's wrong?"],
   ["B", "I had a misunderstanding with {Jisoo}."],
   ["A", "Oh no. What happened?"],
   ["B", "She thought I had been {talking about her} behind her back."],
   ["A", "Had you been?"],
   ["B", "No! I had been {planning her birthday party}."],
   ["A", "Ha! So it was a surprise. Why don't you tell her?"],
   ["B", "Then the surprise would be ruined."],
   ["A", "Maybe tell {her sister}. She can help."]
  ],
  swap: [["a friend's name", "Jisoo"], ["what she thought", "talking about her"], ["what you were really doing", "planning her party"], ["someone who can help", "her sister"]],
  lang: [
   ["Show sympathy", ["Oh no!", "That must be hard.", "I'm sorry to hear that."]],
   ["Ask for more", ["What happened?", "How did you feel?", "Then what?"]],
   ["Give advice", ["Why don't you …?", "Maybe you should …"]],
   ["Agree / disagree", ["That's true.", "I see it differently."]]
  ],
  langPractice: ["My friend didn't reply for a week.", "I lent my friend money.", "My best friend moved abroad.", "I made a friend in a game.", "My friend told my secret.", "We had been friends for ten years."],
  survey: {
   ask: "Do you",
   cols: ["Me", "My teacher", "One more question"],
   rows: ["still talk to a childhood friend", "have an online friend", "lend money to friends", "trust all your friends", "say sorry first", "keep friends' secrets"],
   q: "Do you …? → Yes. → Ask: Why? / How long? / Since when?",
   report: "My teacher and I both ___, but only I ___."
  },
  gap: {
   who: "Sora's best friend",
   q: ["What is her friend's name?", "How long had they been friends when Mia moved?", "What was their big misunderstanding?", "How did they fix it?", "How do they keep in touch now?"],
   A: [["name", "Mia"], ["friends for", "?"], ["misunderstanding", "a lost diary"], ["fixed it by", "?"], ["keep in touch", "?"]],
   B: [["name", "?"], ["friends for", "eight years"], ["misunderstanding", "?"], ["fixed it by", "writing a letter"], ["keep in touch", "video calls on Sundays"]],
   tip: "How long <b>had</b> they <b>been</b> …?"
  },
  role: {
   A: ["You host a radio advice show.", "Ask 5 questions + 2 follow-ups.", "Give 2 pieces of advice."],
   B: ["You had a fight with a close friend.", "Choose: money / a secret / a lie.", "Explain what had been happening before it."]
  },
  tts: {
   title: "Write \"5 rules of a good friendship\"",
   steps: ["List ideas: what makes a friendship strong?", "Ask your teacher 4 of today's questions.", "Agree on the 5 best rules together.", "Present your rules in 1 minute."],
   lang: ["I think rule 1 should be ___ because ___.", "That's true, but ___.", "So we agree that ___."]
  },
  speech: {
   time: "2 min",
   model: ["Hi everyone. I want to talk about my best friend.", "Her name is Hana, and we met in first grade.", "We had been neighbors for ten years before she moved to Busan.", "She's honest, and she always listens to me.", "Once we had a big misunderstanding about a secret.", "We talked it out, and now we trust each other even more.", "For me, a true friend is someone who stays.", "Thanks for listening! Any questions?"],
   outline: ["Hook — \"I want to talk about…\"", "How you met", "What had been happening (had been + -ing)", "What he/she is like", "A problem you solved", "Ask for questions"],
   check: ["Clear voice", "Eye contact", "had been + -ing", "Answer 1 question"]
  },
  pron: {
   cols: [["I had → I'd", ["I'd been", "they'd been", "he'd been"]], ["had not", ["hadn't", "hadn't been", "hadn't heard"]], ["-ing", ["arguing", "trusting", "borrowing"]]],
   up: "Had you been friends for long?",
   down: "How long had you been waiting?"
  },
  review: ["I can answer in 4 parts.", "I can use had been + -ing.", "I can give advice about friends.", "I can give a short presentation."]
 }
};
