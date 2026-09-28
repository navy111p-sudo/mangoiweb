// SIU BASIC 009 — 단원 파일(8판 형식). 본보기: units/001.mjs
// 원본과 다른 점:
//  - Q1 끝 ":" 정리 · Q2 "Who is your favorite singer or boy or girl band?" → "Who is your favorite singer or band?"
//  - Q3 "Where will you like to take a rest at the beach or at the mountains?" → "Where would you like to rest: at the beach or in the mountains?"
//  - Q4 원본 번호가 3 으로 겹침 · "what will you choose to get for your birthday, cash or gift?" → "What will you choose for your birthday: cash or a gift?"
//  - Q6 "without the permission of your parents" → "without your parents' permission"
//  - Q7 "…or you will say Hello to others first?" → "…or will you say hello first?"
//  - Q8 "What things that are important to remember?" → "What things are important to remember?"
//  - 문법 예문 "I will se her" → see · 부정 예문 "I will go to Korea"(부정 아님) → "I won't go"
export default {
 no: "009",
 title: "Concerning You",
 book: "SIU BASIC 009 - Concerning You",
 next: "010 Does It Matter",
 cover: { h1: "Concerning", em: "You", goals: ["Talk about your likes and memories", "Use will and be going to", "Give a short presentation"] },
 KW: [
  ["music", "noun", "음악", "sounds from voices or instruments"],
  ["singer", "noun", "가수", "a person who sings"],
  ["mountain", "noun", "산", "a very high, steep hill"],
  ["gift", "noun", "선물", "something you give someone; a present"],
  ["believe", "verb", "믿다", "to think that something is true"],
  ["permission", "noun", "허락", "when someone says you can do something"],
  ["party", "noun", "파티", "a time when people meet to eat and have fun"],
  ["remember", "verb", "기억하다", "to keep something in your mind"],
  ["memory", "noun", "기억, 추억", "something you remember from the past"],
  ["forget", "verb", "잊다", "to not remember something"]
 ],
 QS: [
  "What kind of music do you like to listen to: pop or classical?",
  "Who is your favorite singer or band?",
  "Where would you like to rest: at the beach or in the mountains? Why?",
  "What will you choose for your birthday: cash or a gift?",
  "Do you always follow or believe what your parents tell you? Why?",
  "Do you go to a friend's party without your parents' permission?",
  "At a party, will you wait for someone to say hello, or will you say hello first?",
  "What things are important to remember?",
  "What is your scariest memory?",
  "Are there some things or times that you will never forget?"
 ],
 IMG_E: ["scene-words/16266", "scene-words/16261", "scene-words/13117", "scene-words/15384", "scene-words/18493", "scene-words/18935", "scene-words/12216", "scene-words/16787", "scene-words/19114", "scene-words/21150"],
 IMG_H: ["scene-words/14668", "scene-words/12869", "scene-words/16534", "scene-words/16245", "scene-words/18493", "scene-words/16268", "scene-words/15597", "scene-words/18636", "scene-words/18569", "scene-words/18056"],
 PICS: {
  opener: "scene-words/15661",
  talk: "scene-words/19100",
  group: "scene-words/16050",
  speech: "scene-words/18040",
  reporter: "scene-words/16345",
  survey: "scene-clips/7465",
  pron: "scene-words/13279",
  roleB: "scene-words/16266",
  cover: "scene-words/12870",
  back: "scene-clips/7376"
 },
 gram1: {
  can: "talk about the future",
  title: "Simple",
  em: "Future",
  rules: [
   ["Decide now", "I'm thirsty. I <b>will</b> get some water."],
   ["Plan", "I <b>am going to</b> visit Busan tomorrow."]
  ],
  hardNote: "will = promise · offer · guess — be going to = plan",
  say: ["We use will and be going to to talk about the future.", "I'm thirsty. I will get some water.", "I am going to visit Busan tomorrow."]
 },
 gram2: {
  can: "ask \"Will you…?\" and \"Are you going to…?\"",
  cols: ["will", "be going to"],
  rows: [
   ["+", "I <b>will</b> call you.", "I'm <b>going to</b> call you."],
   ["−", "I <b>won't</b> forget.", "I'm <b>not going to</b> forget."],
   ["?", "<b>Will</b> you come?", "<b>Are</b> you <b>going to</b> come?"]
  ]
 },
 gapCan: "ask \"What is he going to do?\"",
 role: {
  title: "The",
  em: "Party",
  tail: "Invitation",
  opener: "Hi! I'm having a party on Saturday. Will you come?",
  a: "Party host",
  b: "Guest"
 },
 pron: {
  can: "say I'll and won't",
  title: "Short forms",
  em: "I'll · won't",
  game: "Teacher says a full sentence → you say it short → then make your own: <i>\"I will call you → I'll call you.\"</i>"
 },
 E: {
  steps: ["Answer", "More"],
  model: [
   ["I like to listen to pop music.", "It makes me happy."],
   ["My favorite singer is IU.", "Her songs are beautiful."],
   ["I will rest at the beach.", "I like to swim in the sea."],
   ["I will choose a gift.", "I love opening presents!"],
   ["Yes, I do.", "My parents know a lot."],
   ["No, I don't.", "I always ask my mom first."],
   ["I will say hello first.", "I like making new friends."],
   ["I think it's important to remember birthdays.", "My friends are happy when I remember."],
   ["My scariest memory is when I got lost.", "I was in a big mall."],
   ["Yes, there are.", "I will never forget my first trip to Jeju."]
  ],
  frame: [
   "I like to listen to ___ music.",
   "My favorite singer is ___. The songs are ___.",
   "I will rest at the ___. I like to ___.",
   "I will choose ___ because ___.",
   "Yes, I do. / No, I don't. My parents ___.",
   "No, I don't. I always ask ___ first.",
   "I will ___. I like ___.",
   "I think it's important to remember ___.",
   "My scariest memory is when ___.",
   "Yes, there are. I will never forget ___."
  ],
  bank: [
   ["pop", "classical", "K-pop", "rock"],
   ["IU", "BTS", "a band", "fun / beautiful"],
   ["beach", "mountains", "swim", "hike"],
   ["cash", "a gift", "I can save it", "it's a surprise"],
   ["know a lot", "love me", "are smart", "are kind"],
   ["my mom", "my dad", "my parents", "my grandma"],
   ["say hello first", "wait", "new friends", "talking"],
   ["birthdays", "names", "homework", "phone numbers"],
   ["I got lost", "I saw a ghost movie", "the lights went out", "a dog barked"],
   ["my first trip", "my birthday party", "my first pet", "my first school day"]
  ],
  more: [
   ["When do you listen to music?", "Can you sing a song?"],
   ["Have you seen them live?", "What is your favorite song?"],
   ["Who will you go with?", "What will you eat there?"],
   ["What gift do you want?", "What will you buy with cash?"],
   ["When don't you believe them?", "What do your parents say a lot?"],
   ["Do you go to many parties?", "What do you do at a party?"],
   ["What do you say first?", "Are you shy?"],
   ["What do you often forget?", "How do you remember things?"],
   ["Who helped you?", "Are you scared now?"],
   ["Who was with you?", "Why was it special?"]
  ],
  gram1: {
   chain: ["Tomorrow, I will ___.", "This weekend, I'm going to ___."],
   ex: "T: Tomorrow, I will drink coffee.<br>S: Tomorrow, I will play soccer.<br>T: Tomorrow, I will …"
  },
  gram2: {
   a: {
    title: "Will you…",
    items: ["…watch TV tonight?", "…go to bed early?", "…eat pizza this week?", "…visit your grandma?", "…sing a song for me?"],
    ans: "Yes, I will. / No, I won't. <b>+ one more sentence</b>"
   },
   b: {
    title: "This weekend",
    big: "On Saturday, I'm going to ___.",
    ans: "Then ask: <b>What are you going to do?</b>"
   }
  },
  opener: { think: ["Look at the photo. What is she doing?", "What music do you like?", "What will you do this weekend?"] },
  convo: [
   ["A", "Hi, Jun! Are you going to the party on {Saturday}?"],
   ["B", "Yes! I will bring {cookies}."],
   ["A", "Great! I'm going to bring {a speaker}."],
   ["B", "Cool! What music will you play?"],
   ["A", "{K-pop}, of course!"],
   ["B", "Did you ask your mom?"],
   ["A", "Yes. She said OK!"]
  ],
  swap: [["a day", "Saturday"], ["a food", "cookies"], ["a thing", "a speaker"], ["music", "K-pop"]],
  lang: [
   ["Invite", ["Will you come?", "Are you free on …?"]],
   ["Say yes / no", ["Sure, I'll come!", "Sorry, I can't."]],
   ["Ask back", ["How about you?", "And you?"]]
  ],
  langPractice: ["I love K-pop.", "I will go to the beach.", "I want a new bike for my birthday.", "I'm going to a party tomorrow.", "I got lost once.", "I never forget birthdays."],
  survey: {
   ask: "Will you",
   cols: ["Me", "My teacher"],
   rows: ["listen to music today", "go to a party this month", "go to the mountains", "get a gift this week", "call a friend tonight", "remember my name tomorrow"],
   q: "Will you …?  → Yes, I will. / No, I won't.",
   report: "I ___, but my teacher ___."
  },
  gap: {
   who: "Dan",
   q: ["What music does Dan like?", "Who is his favorite singer?", "What is he going to do this weekend?", "What will he get for his birthday?"],
   A: [["music", "pop"], ["favorite singer", "?"], ["this weekend", "go to a concert"], ["birthday", "?"]],
   B: [["music", "?"], ["favorite singer", "IU"], ["this weekend", "?"], ["birthday", "a new game"]],
   tip: "He → <b>is going to</b> go · <b>will</b> get"
  },
  role: {
   A: ["You are having a party.", "Invite B. Ask 5 questions.", "Say what you will do there."],
   B: ["You are invited.", "Say: \"I'll ask my parents.\"", "Answer with 2 sentences."]
  },
  tts: {
   title: "Plan a birthday party",
   steps: ["Think: food, music and a gift.", "Ask your teacher what they will bring.", "Choose the best ideas together.", "Tell your party plan!"],
   lang: ["We will ___ at the party.", "I'm going to bring ___.", "It will be fun because ___."]
  },
  speech: {
   time: "1 min",
   model: ["Hello! My name is Dan.", "I like pop music. My favorite singer is IU.", "I like the beach. I will go there this summer.", "For my birthday, I will choose a gift.", "I will never forget my first trip to Jeju.", "Thank you!"],
   outline: ["Name", "Music / singer", "Beach or mountains", "Cash or gift", "A memory"],
   check: ["Loud voice", "Look at your teacher", "Say 5 things"]
  },
  pron: {
   cols: [
    ["'ll", ["I'll", "you'll", "we'll"]],
    ["won't", ["I won't", "it won't", "they won't"]],
    ["going to", ["I'm going to", "he's going to", "we're going to"]]
   ],
   up: "Will you come to my party?",
   down: "What will you bring?"
  },
  review: ["I can talk about things I like.", "I can use will / won't.", "I can ask \"Will you…?\"", "I can say one more sentence."]
 },
 H: {
  steps: ["Answer", "Reason", "Example", "Ask back"],
  model: [
   ["I mostly listen to pop, but I like classical too.", "Pop gives me energy, and classical helps me focus.", "I play piano music when I study for tests.", "What kind of music do you listen to?"],
   ["My favorite singer is IU.", "Her voice is warm, and she writes her own songs.", "I've been listening to her since middle school.", "Who was your favorite singer growing up?"],
   ["I'd rather rest in the mountains.", "The air is fresh, and it's quieter than the beach.", "Last fall, I hiked Seoraksan and saw amazing leaves.", "Are you a beach person or a mountain person?"],
   ["I will choose cash for my birthday.", "I can save it for something I really need.", "Last year, I saved birthday money for headphones.", "Do you think cash is a boring gift?"],
   ["Not always, but I usually follow their advice.", "I'm old enough to think for myself.", "For example, I chose my own school club.", "Did you always listen to your parents?"],
   ["No, I don't. I always ask for permission first.", "My parents worry if they don't know where I am.", "Once I went without asking, and they were upset.", "At what age should kids decide for themselves?"],
   ["I'll probably say hello first.", "Waiting feels awkward, and people like friendly faces.", "At a party last month, I started a chat about music.", "Are you shy at parties?"],
   ["I think it's important to remember people's names.", "It shows you care about them.", "I save new names in my phone after I meet people.", "What do you often forget?"],
   ["My scariest memory is when I got lost in Tokyo.", "I didn't speak Japanese, and my phone was dead.", "A kind shop owner helped me find my hotel.", "What's the scariest thing that happened to you?"],
   ["Yes, there are. I'll never forget my grandpa's advice.", "He always told me to be kind to everyone.", "I think of his words when I have a hard day.", "What will you never forget?"]
  ],
  frame: [
   "I mostly listen to … because …",
   "My favorite singer is … because …",
   "I'd rather rest … because …",
   "I will choose … because … Last year, …",
   "Not always / Yes, I … because …",
   "I do / don't … because … Once, …",
   "I'll … because … At a party, …",
   "I think it's important to remember … because …",
   "My scariest memory is when … Luckily, …",
   "I'll never forget … because …"
  ],
  more: [
   ["Can music change your mood? How?", "Is classical music only for old people?", "Should music be a required subject?"],
   ["Why is K-pop popular around the world?", "Are fans sometimes too extreme?", "Would you like to be a famous singer?"],
   ["What makes a place relaxing?", "Is it better to travel or rest at home?", "Where would you build your dream house?"],
   ["Is cash a good gift? Why or why not?", "What is the best gift you've ever received?", "Is it the thought or the price that counts?"],
   ["When is it OK to disagree with parents?", "What advice from your parents was right?", "How will you raise your own children?"],
   ["At what age can teens go out alone?", "Are parents today too strict or too relaxed?", "How can teens earn their parents' trust?"],
   ["How can shy people make friends?", "Is small talk useful or a waste of time?", "What makes a great party?"],
   ["Do phones make our memory worse?", "What's the best way to remember new words?", "Should we remember everything? Why?"],
   ["Why do people enjoy scary movies?", "How can you calm down when you're scared?", "Do our fears change as we grow up?"],
   ["Why do we remember some days and forget others?", "Would you erase a bad memory if you could?", "How will people remember you?"]
  ],
  gram1: {
   chain: ["In ten years, I will ___.", "Next summer, I'm going to ___."],
   ex: "T: In ten years, I will live by the sea.<br>S: In ten years, I will be a designer.<br>T: Next summer, I'm going to …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["Will you travel this year?", "Will you learn a new skill soon?", "Are you going to see a concert?", "Are you going to change anything?", "Will people use cash in 20 years?"],
    ans: "I will … / I'm going to … <b>+ one more sentence</b>"
   },
   b: {
    title: "Next year",
    big: "Next year, I'm going to ___, but I won't ___.",
    ans: "Then ask: <b>What are you going to do next year?</b>"
   }
  },
  opener: {
   think: [
    "What do your favorite things say about you?",
    "Do you usually plan the future or just go with the flow?",
    "Which memories shape who you are?"
   ]
  },
  convo: [
   ["A", "Hey, are you going to {Mina}'s party on {Friday}?"],
   ["B", "I want to, but I'm not sure yet."],
   ["A", "Why not? It'll be fun!"],
   ["B", "I need to ask my parents for permission first."],
   ["A", "Oh, I see. They'll say yes, won't they?"],
   ["B", "Probably. I'll ask them tonight."],
   ["A", "Great! I'm going to bring {a cake}. What about you?"],
   ["B", "I'll make a {K-pop} playlist."],
   ["A", "Perfect! See you there. Don't forget!"]
  ],
  swap: [["a friend's name", "Mina"], ["a day", "Friday"], ["something to bring", "a cake"], ["music", "K-pop"]],
  lang: [
   ["Invite", ["Are you going to …?", "You should come!"]],
   ["Accept / decline", ["I'd love to!", "I'm afraid I can't."]],
   ["Promise", ["I'll be there.", "I won't forget."]],
   ["Agree / disagree", ["I think so too.", "I'm not so sure."]]
  ],
  langPractice: ["Classical music is boring.", "I'll never climb a mountain again.", "Cash is the best gift.", "Parents are always right.", "I'm going to be a singer.", "I forget everything."],
  survey: {
   ask: "Are you going to",
   cols: ["Me", "My teacher", "One more question"],
   rows: ["see a concert this year", "travel this summer", "buy a gift soon", "go to a party this month", "learn a new song", "make a new friend"],
   q: "Are you going to …? → Yes. → Ask: When? / Where? / Why?",
   report: "My teacher and I both ___, but only I ___."
  },
  gap: {
   who: "Dan",
   q: ["What music does Dan like? Why?", "Where will he rest? Why?", "What is he going to do this weekend?", "Cash or a gift? Why?", "What will he never forget?"],
   A: [["music + why", "K-pop — it's upbeat"], ["rest", "?"], ["this weekend", "?"], ["cash or gift", "cash — to save up"], ["never forget", "?"]],
   B: [["music + why", "?"], ["rest", "mountains — quiet"], ["this weekend", "see his favorite band"], ["cash or gift", "?"], ["never forget", "his first trip abroad"]],
   tip: "He → <b>is going to</b> see · <b>will</b> choose"
  },
  role: {
   A: ["You are planning a party.", "Invite B. Ask 5 questions + 2 follow-ups.", "Agree on music, food and a gift."],
   B: ["You are a guest.", "You need your parents' permission.", "Say what you will bring and why."]
  },
  tts: {
   title: "Plan a perfect day off",
   steps: ["Think: music, place and people.", "Ask your teacher 4 of today's questions.", "Agree on a plan for one perfect day.", "Present your plan in 1 minute."],
   lang: ["In the morning, we're going to ___.", "I think we should ___ because ___.", "That sounds great, but ___."]
  },
  speech: {
   time: "2 min",
   model: [
    "Hi everyone. Let me tell you a few things about me.",
    "I love music, especially pop and a little classical.",
    "My favorite singer is IU because she writes her own songs.",
    "I'd rather rest in the mountains than at the beach.",
    "My scariest memory is getting lost in Tokyo.",
    "Next year, I'm going to learn to play the guitar.",
    "Thanks for listening! Any questions?"
   ],
   outline: ["Hook — \"Let me tell you…\"", "Music + favorite singer", "Beach or mountains + why", "A memory you won't forget", "A plan for next year", "Ask for questions"],
   check: ["Clear voice", "Eye contact", "will / going to", "Answer 1 question"]
  },
  pron: {
   cols: [
    ["'ll", ["I'll", "she'll", "they'll"]],
    ["won't", ["won't go", "won't forget", "won't tell"]],
    ["going to", ["I'm going to", "he's going to", "we're going to"]]
   ],
   up: "Are you going to see a concert?",
   down: "What will you never forget?"
  },
  review: ["I can answer in 4 parts.", "I can use will and be going to.", "I can invite and answer politely.", "I can talk about memories."]
 }
};
