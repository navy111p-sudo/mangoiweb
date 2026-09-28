// SIU BASIC 016 — I would like to (8판 형식, 001 본보기)
// 원본과 다른 점:
//  - Q1 "…in the library? why?" → "Why?" / Q4 "…for clothes? why?" → "Why?" (대문자)
//  - Q2 "western food" → "Western food" (고유명사 단원이라 대문자)
//  - Q3 "do you give a tip to the waiter?" → "do you give the waiter a tip?"
//  - Q5·Q6 "Will you work…?" → "Would you work…?" (단원 제목 would 에 맞추고, 미래 계획이 아니라 가정 질문)
//  - Q7 "if you won a lottery" → "if you won the lottery" / Q8 "super hero" → "superhero"
//  - 대답 틀 "If I will be a hero / animal / plant" → "If I could be …, I would be …" (if 절에 will 금지)
//  - Keyword Test(verb) → noun (뜻이 명사 뜻), Win(noun) → verb (뜻이 동사 뜻)
//  - 문법 슬라이드 제목 "How to use this Nouns" → "How to use these nouns", "Example's" → "Examples"
export default {
 no: "016",
 title: "I Would Like To",
 book: "SIU BASIC 016 - I would like to",
 next: "017 Internet",
 cover: { h1: "I Would", em: "Like To…", goals: ["Say what you would like", "Ask and answer 10 questions", "Use names with capital letters"] },
 KW: [
  ["test", "noun", "시험", "questions that check what you know"],
  ["Western", "adjective", "서양의", "from Europe or America"],
  ["tip", "noun", "팁", "extra money you give a waiter for good service"],
  ["clothes", "noun", "옷", "things you wear, like shirts and pants"],
  ["work", "noun", "일", "a job you do, usually for money"],
  ["night", "noun", "밤", "the dark time between evening and morning"],
  ["win", "verb", "이기다, 타다", "to be first or get a prize"],
  ["hero", "noun", "영웅", "a brave person who does great things"],
  ["animal", "noun", "동물", "a living thing that moves, like a dog or a lion"],
  ["plant", "noun", "식물", "a living thing that grows in the ground, like a tree or a flower"]
 ],
 QS: [
  "Where would you study for a big test: in your room or in the library? Why?",
  "What kind of Western food do you like to eat?",
  "When you eat at a restaurant, do you give the waiter a tip?",
  "Where do you shop for clothes? Why?",
  "Would you work on weekends and on holidays?",
  "Would you work the night shift?",
  "What would you do if you won the lottery?",
  "If you could be a superhero, which superhero would you be?",
  "If you could be an animal, what animal would you be?",
  "If you could be a plant, what plant would you choose to be?"
 ],
 IMG_E: ["scene-words/17151", "scene-words/18656", "scene-words/16352", "scene-words/12506", "scene-words/12477", "scene-words/17103", "scene-words/18068", "scene-words/16825", "scene-words/15171", "scene-words/12367"],
 IMG_H: ["scene-words/12401", "scene-words/14517", "scene-clips/7345", "scene-clips/7354", "scene-words/18590", "scene-words/14766", "scene-words/18068", "scene-words/19504", "scene-clips/7502", "scene-words/13353"],
 PICS: {
  opener: "scene-words/18649",
  talk: "scene-clips/5020",
  group: "scene-words/18672",
  speech: "scene-words/12053",
  reporter: "scene-words/16343",
  survey: "scene-words/16923",
  pron: "scene-words/13000",
  roleB: "scene-words/18529",
  cover: "scene-words/16287",
  back: "scene-words/18768"
 },
 gram1: {
  can: "tell common and proper nouns apart",
  title: "Common & Proper",
  em: "Nouns",
  rules: [
   ["Common = any one", "I'd like a <b>cookie</b>. Let's go to the <b>city</b>."],
   ["Proper = a name → Capital!", "I love <b>O</b>reos. Let's go to <b>S</b>an <b>F</b>rancisco."]
  ],
  hardNote: "names · cities · countries · days · months · brands · languages",
  say: [
   "A common noun is any person, place or thing. A proper noun is a special name, and it starts with a capital letter.",
   "I'd like a cookie. Let's go to the city.",
   "I love Oreos. Let's go to San Francisco."
  ]
 },
 gram2: {
  can: "ask \"Would you like…?\"",
  cols: ["Common noun", "Proper noun"],
  rows: [
   ["+", "I'd like a <b>cat</b>.", "Her name is <b>Cleopatra</b>."],
   ["−", "I wouldn't like to live in a big <b>city</b>.", "I wouldn't like to live in <b>Tokyo</b>."],
   ["?", "Would you like a <b>cookie</b>?", "Would you like an <b>Oreo</b>?"]
  ]
 },
 gapCan: "ask \"What would she like to…?\"",
 role: {
  title: "The",
  em: "Part-time Job",
  tail: "Interview",
  opener: "Thanks for coming! Would you like to work on weekends?",
  a: "Shop manager",
  b: "Job seeker"
 },
 pron: {
  can: "link would you and I'd like",
  title: "Linking",
  em: "would you",
  game: "Teacher says a food → you ask fast with linking: <i>\"Would you like some pizza?\"</i> → teacher answers → switch!"
 },
 E: {
  steps: ["Answer", "More"],
  model: [
   ["I would study in the library.", "It is very quiet there."],
   ["I like pizza and spaghetti.", "They are very tasty."],
   ["No, I don't.", "In Korea, people don't usually tip."],
   ["I shop for clothes at the mall.", "There are many stores there."],
   ["No, I wouldn't.", "I want to rest with my family."],
   ["No, I wouldn't.", "I am sleepy at night."],
   ["I would buy a big house.", "I would also help poor people."],
   ["I would be Spider-Man.", "He can climb walls!"],
   ["I would be a dolphin.", "Dolphins are smart and swim fast."],
   ["I would be a sunflower.", "It is tall and bright."]
  ],
  frame: [
   "I would study in ___. It is ___ there.",
   "I like ___ and ___.",
   "Yes, I do. / No, I don't. ___",
   "I shop for clothes at ___.",
   "Yes, I would. / No, I wouldn't. I want to ___.",
   "Yes, I would. / No, I wouldn't. I am ___ at night.",
   "I would buy ___.",
   "I would be ___. He/She can ___.",
   "I would be a/an ___. It is ___.",
   "I would be a/an ___. It is ___."
  ],
  bank: [
   ["my room", "the library", "quiet", "comfortable"],
   ["pizza", "hamburgers", "spaghetti", "steak"],
   ["people don't tip in Korea", "the waiter was kind", "my mom tips", "I don't eat out"],
   ["the mall", "the market", "online", "a small shop"],
   ["rest", "play", "earn money", "help"],
   ["sleepy", "awake", "scared", "busy"],
   ["a big house", "a car", "toys for kids", "a trip to Paris"],
   ["Spider-Man", "Wonder Woman", "fly", "run fast"],
   ["dolphin", "lion", "bird", "cat"],
   ["sunflower", "rose", "tree", "cactus"]
  ],
  more: [
   ["Do you study with music?", "When do you study?"],
   ["Do you like Korean food more?", "What is your favorite restaurant?"],
   ["Do you like eating out?", "What do you order?"],
   ["Who buys your clothes?", "What is your favorite shirt?"],
   ["What do you do on weekends?", "What would you like to be?"],
   ["What time do you go to bed?", "Who works at night?"],
   ["Who would you share it with?", "Where would you travel?"],
   ["What power would you like?", "Who would you save?"],
   ["Where would you live?", "What would you eat?"],
   ["Where would you grow?", "Do you have a plant at home?"]
  ],
  gram1: {
   chain: ["I'd like to go to ___ (a place name).", "I'd like to eat ___ (a food)."],
   ex: "T: I'd like to go to Paris.<br>S: I'd like to go to Jeju Island.<br>T: I …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["Would you like a pet?", "Would you like pizza?", "Would you like to fly?", "Would you like a cookie?", "Would you like to go to Japan?"],
    ans: "Yes, I would. / No, thank you. <b>+ one more sentence</b>"
   },
   b: {
    title: "Name it!",
    big: "A city: ___. A day: ___. A brand: ___.",
    ans: "Then say: <b>I'd like to go to ___ on ___.</b>"
   }
  },
  opener: {
   think: ["Look at the photo. What is he dreaming about?", "Where would you like to go?", "What would you like to be?"]
  },
  convo: [
   ["A", "Hi! What would you like to eat?"],
   ["B", "I'd like {pizza}, please."],
   ["A", "Would you like something to drink?"],
   ["B", "Yes, I'd like {orange juice}."],
   ["A", "Would you like {ice cream}, too?"],
   ["B", "No, thank you. I'm {full}!"],
   ["A", "Okay. Enjoy your meal!"]
  ],
  swap: [["a food", "pizza"], ["a drink", "orange juice"], ["a dessert", "ice cream"], ["how you feel", "full"]],
  lang: [
   ["Say what you want", ["I'd like …", "Can I have …?"]],
   ["Be polite", ["Yes, please.", "No, thank you.", "Thank you!"]],
   ["Ask back", ["How about you?", "What would you like?"]]
  ],
  langPractice: ["I'd like a puppy.", "I'd like to go to Disneyland.", "I'd like to be a doctor.", "I'd like a new phone.", "I'd like to fly.", "I'd like to meet BTS."],
  survey: {
   ask: "Would you like to",
   cols: ["Me", "My teacher"],
   rows: ["visit Paris", "be a superhero", "live on a farm", "have a robot", "eat Western food every day", "win a big prize"],
   q: "Would you like to …?  → Yes, I would. / No, I wouldn't.",
   report: "I'd like to ___, but my teacher wouldn't."
  },
  gap: {
   who: "Emma's dream day",
   q: ["Where would Emma like to go?", "What would she like to eat?", "Who would she like to meet?", "What would she like to buy?"],
   A: [["go to", "New York"], ["eat", "?"], ["meet", "Taylor Swift"], ["buy", "?"]],
   B: [["go to", "?"], ["eat", "a big hamburger"], ["meet", "?"], ["buy", "new sneakers"]],
   tip: "Names → <b>C</b>apital letters: <b>N</b>ew <b>Y</b>ork"
  },
  role: {
   A: ["You are a pizza shop manager.", "Ask 5 questions.", "Say \"You're hired!\" or \"Sorry!\""],
   B: ["You want a job.", "Choose: pizza shop / pet shop / toy store.", "Answer with \"I would …\""]
  },
  tts: {
   title: "Plan a \"Dream Day\"",
   steps: ["Pick a place, a food and a person.", "Ask your teacher. Answer, too.", "Make one dream day together.", "Draw it and tell!"],
   lang: ["I'd like to go to ___.", "My teacher would like to ___.", "We'd both like to ___."]
  },
  speech: {
   time: "1 min",
   model: ["Hello! Let me tell you my wishes.", "I'd like to go to Paris.", "I'd like to eat French bread there.", "If I could be an animal, I'd be a dolphin.", "Dolphins are smart and fun!", "Thank you!"],
   outline: ["Hello", "A place (Capital letter!)", "A food", "An animal + why", "Thank you!"],
   check: ["Loud voice", "Look at teacher", "Use I'd like"]
  },
  pron: {
   cols: [["would you", ["Would you", "Could you", "Did you"]], ["I would → I'd", ["I'd like", "you'd like", "she'd like"]], ["to → /tə/", ["like to", "want to", "go to"]]],
   up: "Would you like some pizza?",
   down: "What would you like to eat?"
  },
  review: ["I can say what I would like.", "I can use capital letters for names.", "I can ask \"Would you like …?\"", "I can say one more sentence."]
 },
 H: {
  steps: ["Answer", "Reason", "Example", "Ask back"],
  model: [
   ["I'd study in the library.", "At home I get distracted by my phone and my bed.", "Before my finals, I went there every day.", "Where do you focus best?"],
   ["I really like Italian food, especially pasta and pizza.", "The flavors are simple but rich.", "My favorite place is a small Italian restaurant near Hongdae.", "What Western food do you like?"],
   ["No, I usually don't.", "Tipping isn't common in Korea.", "But when I visited New York, I tipped about 20 percent.", "What do you think about tipping?"],
   ["I usually shop for clothes online.", "It's cheaper and I can compare prices.", "Last month I bought a jacket on Musinsa for half price.", "Do you prefer shopping online or in stores?"],
   ["I would, but only for a short time.", "Weekends are important for family and rest.", "My aunt works on Sundays at a café, and she's always tired.", "Would you give up your weekends?"],
   ["I'd rather not work the night shift.", "It's bad for your health and sleep.", "My uncle is a nurse, and night shifts made him exhausted.", "Could you stay awake all night?"],
   ["I would pay for my parents' house first.", "They've worked hard for our family.", "Then I'd travel around Europe and give some money to charity.", "What would you do with the money?"],
   ["I'd be Iron Man.", "He's smart and builds his own technology.", "I'd love to create a suit that helps people in disasters.", "Which superhero would you be?"],
   ["I'd be an eagle.", "Eagles are free and can see everything from the sky.", "I'd fly over the Rocky Mountains every morning.", "What animal are you most like?"],
   ["I'd be a pine tree.", "Pine trees are strong and stay green all year.", "I'd grow on a mountain on Jeju Island and live for hundreds of years.", "What plant would you be?"]
  ],
  frame: [
   "I'd study in … because …",
   "I like … food, especially … because …",
   "Yes / No, I … because … When I …",
   "I shop for clothes at / on … because …",
   "I would / wouldn't … because … My …",
   "I'd / I'd rather not … because …",
   "First, I would … Then, I'd …",
   "I'd be … because … I'd love to …",
   "I'd be a/an … because … I'd …",
   "I'd be a/an … because … I'd grow in …"
  ],
  more: [
   ["Do you study better alone or with friends?", "Is music helpful when you study?", "How do you avoid your phone?"],
   ["Is Western food healthier than Korean food?", "What Western dish would you like to cook?", "Which country has the best food?"],
   ["Should Korea start tipping?", "Is 20 percent a fair tip?", "Would you work harder for tips?"],
   ["Do brands matter to you?", "Is fast fashion bad for the planet?", "What would you never wear?"],
   ["Is a high salary worth losing weekends?", "What job would you like in the future?", "Should people work four days a week?"],
   ["Which jobs need night shifts?", "Should night workers get more money?", "Are you a morning or night person?"],
   ["Would winning the lottery make you happier?", "Would you tell your friends?", "Would you still work?"],
   ["What power would be most useful?", "Can normal people be heroes?", "Who is a real-life hero to you?"],
   ["Would you rather be a pet or a wild animal?", "Which animal is most like your best friend?", "Should zoos exist?"],
   ["Do you have plants at home?", "Why do plants make people calm?", "Would you like to be a farmer?"]
  ],
  gram1: {
   chain: ["I'd like to visit ___ (a city) because ___.", "I'd like to meet ___ (a person) someday."],
   ex: "T: I'd like to visit Kyoto because I love old temples.<br>S: I'd like to visit Rome because …<br>T: …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["Would you like to live abroad?", "Would you like to meet a famous person?", "Would you like to learn French?", "Would you like to run a café?", "Would you like to be famous?"],
    ans: "Yes, I would. / No, I wouldn't. <b>+ why? + a proper noun</b>"
   },
   b: {
    title: "Capital check",
    big: "Next ___ (month), I'd like to visit ___ (city) and eat ___ (brand/food).",
    ans: "Then ask: <b>Would you like to come?</b>"
   }
  },
  opener: {
   think: ["If you could change one thing about your life, what would you like to change?", "Is it better to dream big or be realistic?", "What would you like to do before you turn 30?"]
  },
  convo: [
   ["A", "Hi, welcome to Mario's. Would you like to see the menu?"],
   ["B", "Yes, please. What would you recommend?"],
   ["A", "Our {seafood pasta} is really popular."],
   ["B", "Sounds great. I'd like that, please."],
   ["A", "Would you like anything to drink?"],
   ["B", "I'd like a {lemonade}, thanks."],
   ["A", "And would you like {a salad} with that?"],
   ["B", "No, thanks. Could I have {garlic bread} instead?"],
   ["A", "Of course. It'll be ready soon."]
  ],
  swap: [["a main dish", "seafood pasta"], ["a drink", "lemonade"], ["a side dish", "a salad"], ["something else", "garlic bread"]],
  lang: [
   ["Order politely", ["I'd like …, please.", "Could I have …?", "I'll have …"]],
   ["Ask for advice", ["What would you recommend?", "What's popular here?"]],
   ["Say no nicely", ["No, thanks.", "I'm fine, thank you."]],
   ["Imagine", ["If I could …, I'd …", "I'd love to …"]]
  ],
  langPractice: ["I'd like to quit my job.", "I'd like to live in London.", "I'd like to be invisible.", "I'd never work at night.", "I'd like to win a gold medal.", "I'd like to be a cat."],
  survey: {
   ask: "Would you like to",
   cols: ["Me", "My teacher", "One more question"],
   rows: ["live in another country", "work from home", "win the lottery", "be famous", "work at night", "open your own shop"],
   q: "Would you like to …? → Yes. → Ask: Why? / Where? / What would you do?",
   report: "My teacher and I would both like to ___, but only I ___."
  },
  gap: {
   who: "Emma's dream year",
   q: ["Which city would Emma like to live in?", "What job would she like?", "What would she do on weekends?", "Who would she like to meet?", "What would she buy first?"],
   A: [["city", "Vancouver"], ["job", "?"], ["weekends", "hike in the mountains"], ["meet", "?"], ["buy first", "?"]],
   B: [["city", "?"], ["job", "a chef at a French restaurant"], ["weekends", "?"], ["meet", "Gordon Ramsay"], ["buy first", "a small car"]],
   tip: "What <b>would</b> she like …? · <b>V</b>ancouver"
  },
  role: {
   A: ["You manage a busy café.", "Ask 5 questions + 2 follow-ups.", "Decide: hire or not? Say why."],
   B: ["You want a part-time job.", "Choose: café / bookstore / hotel.", "Say what you would and wouldn't do. Use real names."]
  },
  tts: {
   title: "Plan a \"Dream Year\" together",
   steps: ["Think: where, what job, what hobby?", "Ask your teacher 4 of today's questions.", "Agree on one perfect plan together.", "Present your dream year in 1 minute."],
   lang: ["I'd like to ___ because ___.", "Would you like to ___?", "So we'd both like to ___."]
  },
  speech: {
   time: "2 min",
   model: ["Hi everyone. Let me tell you about my dream life.", "I'd like to live in Vancouver, Canada.", "It's close to nature, and people there are friendly.", "I'd like to work as a chef in a small restaurant.", "On weekends, I'd hike in the mountains.", "If I could be an animal, I'd be an eagle because it's free.", "I think dreaming is the first step to a plan.", "Thanks for listening! Any questions?"],
   outline: ["Hook — \"Let me tell you…\"", "A place (Proper noun!) + why", "A job you'd like", "Weekends / free time", "If I could be …, I'd …", "Ask for questions"],
   check: ["Clear voice", "Eye contact", "I'd like / I'd …", "Answer 1 question"]
  },
  pron: {
   cols: [["would you", ["Would you", "Could you", "Should you"]], ["I would → I'd", ["I'd like", "we'd love", "they'd rather"]], ["to → /tə/", ["like to", "love to", "need to"]]],
   up: "Would you like to live abroad?",
   down: "Where would you like to live?"
  },
  review: ["I can answer in 4 parts.", "I can use I'd like / I would.", "I can use proper nouns with capitals.", "I can give a short presentation."]
 }
};
