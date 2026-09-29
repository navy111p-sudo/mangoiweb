// SIU ADVANCE 005 — Technology and Inventions (8판 형식, 001 본보기)
// 원본과 다른 점:
//  - 문법(관계사절) 예문 "the time when he kissed me for the first time" → 중고등 판에 맞게 사물·사람 예문으로 바꿈
//  - Q3 "What technology, if any, has made our homes more comfortable?" 그대로 · 대답 틀 "that make" → "that makes"
//  - Q7 "Who famous inventors do you know? and what in his/her inventions?" → "Which famous inventors do you know, and what did they invent?"
//  - Q8 "Vo you think time machine is possible to be invented?" → "Do you think a time machine could be invented?"
//  - Q9 대답 틀 "I think people is" → "I think people will …"
//  - Q10 "What would you invent if your a scientist?" → "What would you invent if you were a scientist?" (틀 "If Im a scientist I will" → "If I were a scientist, I would")
//  - Keyword Believe 뜻의 깨진 글자 정리 · Famous(adj) 품사 표기 정리
export default {
 no: "a005",
 title: "Technology and Inventions",
 book: "SIU ADVANCE 005 - Technology and Inventions",
 next: "006 Meaning of Life",
 cover: { h1: "Technology", em: "and Inventions", goals: ["Talk about technology in daily life", "Describe people and things with who / which / that", "Pitch your own invention"] },
 KW: [
  ["technology", "noun", "기술", "machines and tools made using science"],
  ["lifestyle", "noun", "생활 방식", "the way a person or group lives"],
  ["comfortable", "adjective", "편안한", "making you feel relaxed and easy"],
  ["method", "noun", "방법", "a way of doing something"],
  ["replace", "verb", "대신하다, 대체하다", "to take the place of something"],
  ["invention", "noun", "발명품, 발명", "a new thing that someone makes for the first time"],
  ["famous", "adjective", "유명한", "known by many people"],
  ["possible", "adjective", "가능한", "able to happen or be done"],
  ["believe", "verb", "믿다", "to feel sure that something is true"],
  ["scientist", "noun", "과학자", "a person who studies science as a job"]
 ],
 QS: [
  "What technology would it be difficult to live without today?",
  "Has social media changed our everyday lifestyle?",
  "What technology, if any, has made our homes more comfortable?",
  "Has technology changed education methods?",
  "Will online education one day replace the classroom?",
  "What invention has had the greatest impact on our lives?",
  "Which famous inventors do you know, and what did they invent?",
  "Do you think a time machine could be invented?",
  "Do you believe people will one day live on the moon or other planets?",
  "What would you invent if you were a scientist?"
 ],
 IMG_E: ["scene-words/12356", "scene-words/19453", "scene-words/14171", "scene-clips/7016", "scene-words/17162", "scene-words/19431", "scene-words/19429", "scene-words/16382", "scene-words/18833", "scene-words/12502"],
 IMG_H: ["scene-words/14630", "scene-words/18788", "scene-words/14171", "scene-clips/7016", "scene-clips/7018", "scene-words/18089", "scene-words/15434", "scene-words/16382", "scene-words/15545", "scene-words/10018"],
 PICS: {
  opener: "scene-words/18411",
  talk: "scene-words/19453",
  group: "scene-words/15385",
  speech: "scene-words/16400",
  reporter: "scene-words/20229",
  survey: "scene-words/18607",
  pron: "scene-words/18073",
  roleB: "scene-words/12641",
  cover: "scene-words/20107",
  back: "scene-words/18592"
 },
 gram1: {
  can: "describe things with who / which / that",
  title: "Relative",
  em: "Clauses",
  rules: [
   ["People → who", "Bell is the man <b>who</b> invented the phone."],
   ["Things → which / that", "A robot is a machine <b>that</b> works by itself."],
   ["Places → where", "This is the lab <b>where</b> she works."]
  ],
  hardNote: "whose (owner) · when (time) · why (reason)",
  say: [
   "A relative clause gives more information about a person or a thing.",
   "Bell is the man who invented the phone.",
   "A robot is a machine that works by itself.",
   "This is the lab where she works."
  ]
 },
 gram2: {
  can: "join two ideas with who / that",
  cols: ["who (people)", "which / that (things)"],
  rows: [
   ["+", "I know a girl <b>who</b> builds robots.", "I have a phone <b>that</b> answers me."],
   ["−", "He isn't the man <b>who</b> invented it.", "It's not an app <b>which</b> I need."],
   ["?", "Is she the scientist <b>who</b> won?", "Is this the app <b>that</b> you use?"]
  ]
 },
 gapCan: "ask \"What did she invent?\"",
 role: {
  title: "The",
  em: "Invention",
  tail: "Pitch",
  opener: "Welcome! So, what have you invented?",
  a: "Investor",
  b: "Inventor"
 },
 pron: {
  can: "say word stress clearly",
  title: "Word",
  em: "Stress",
  game: "Teacher says a word → you clap the strong part → make a sentence: <i>\"I believe robots will help us.\"</i>"
 },
 E: {
  steps: ["Answer", "Why", "More"],
  model: [
   ["It would be hard to live without my phone.", "I use it every day.", "I talk to my friends with it."],
   ["Yes, I think it has.", "People look at their phones a lot.", "We share photos every day."],
   ["Our robot vacuum.", "It cleans the floor by itself.", "My mom loves it."],
   ["Yes, it has.", "We use tablets in class.", "We watch videos, too."],
   ["No, I don't think so.", "We need teachers and friends.", "School is more fun together."],
   ["The internet has had the greatest impact.", "We can find anything online.", "I use it for homework."],
   ["I know Thomas Edison.", "He invented the light bulb.", "He was very famous."],
   ["No, I don't think it's possible.", "Time only goes forward.", "But it would be cool!"],
   ["Yes, I believe it.", "Science is getting better.", "Maybe on Mars!"],
   ["I would invent a homework robot.", "It would help students.", "I would have more free time."]
  ],
  frame: [
   "It would be hard to live without my ___.",
   "Yes, I think ___. / No, I don't. People ___.",
   "Our ___ makes home comfortable.",
   "Yes, it has. We use ___ in class.",
   "Yes / No. We need ___.",
   "The ___ has had the greatest impact.",
   "I know ___. He/She invented ___.",
   "I think it's ___ because ___.",
   "Yes, I do. / No, I don't. ___",
   "If I were a scientist, I would invent ___."
  ],
  bank: [
   ["phone", "computer", "internet", "tablet"],
   ["share photos", "chat more", "read less", "shop online"],
   ["robot vacuum", "air conditioner", "smart TV", "washer"],
   ["tablets", "videos", "apps", "online tests"],
   ["teachers", "friends", "a classroom", "real talk"],
   ["internet", "phone", "car", "light bulb"],
   ["Edison", "Bell", "Tesla", "Marie Curie"],
   ["possible", "impossible", "science", "time"],
   ["Mars", "the moon", "a space city", "science"],
   ["robot", "flying car", "translator", "food maker"]
  ],
  more: [
   ["How many hours do you use it?", "Can you live without it for a day?"],
   ["What app do you use most?", "Is it good or bad?"],
   ["What machine do you use at home?", "What machine do you want?"],
   ["Do you like online classes?", "What app helps you study?"],
   ["Which is better for you?", "Why?"],
   ["What invention do you use most?", "What invention is not useful?"],
   ["Which inventor do you like?", "What would you ask him or her?"],
   ["Where would you go in time?", "Who would you meet?"],
   ["Would you go to Mars?", "What would you take?"],
   ["Who would use it?", "What would it look like?"]
  ],
  gram1: {
   chain: ["A phone is a thing that ___.", "A teacher is a person who ___."],
   ex: "T: A robot is a machine that cleans.<br>S: A pilot is a person who flies planes.<br>T: A …"
  },
  gram2: {
   a: {
    title: "Guess what it is!",
    items: ["It's a thing that tells the time.", "It's a person who fixes cars.", "It's a machine that washes clothes.", "It's a person who invents things."],
    ans: "Answer. Then make <b>your own riddle</b>!"
   },
   b: {
    title: "My best gadget",
    big: "My ___ is a gadget that ___.",
    ans: "Then ask: <b>What is a gadget that you use every day?</b>"
   }
  },
  opener: {
   think: ["Look at the photo. What is different about the two phones?", "What gadget do you use every day?", "What will phones look like in the future?"]
  },
  convo: [
   ["A", "Wow, is that a new {smartwatch}?"],
   ["B", "Yes! It's a watch that {counts my steps}."],
   ["A", "That's cool. Is it useful?"],
   ["B", "Very useful. I use it every day."],
   ["A", "I want a gadget that {helps me study}."],
   ["B", "Me too! Someone should invent it."],
   ["A", "Maybe we can be the {inventors}!"]
  ],
  swap: [["a gadget", "smartwatch"], ["what it does", "counts my steps"], ["a gadget you want", "helps me study"], ["a job", "inventors"]],
  lang: [
   ["Show interest", ["That's cool!", "Really?", "Wow!"]],
   ["Give an opinion", ["I think …", "In my opinion, …"]],
   ["Agree / disagree", ["I agree.", "I'm not sure."]]
  ],
  langPractice: ["I can't live without my phone.", "Robots will replace teachers.", "Online class is boring.", "I want to live on Mars.", "Social media is fun.", "Time machines are possible."],
  survey: {
   ask: "Do you",
   cols: ["Me", "My teacher"],
   rows: ["use a phone every day", "like online classes", "play games online", "use a robot vacuum at home", "want to go to space", "want to be an inventor"],
   q: "Do you …?  → Yes, I do. / No, I don't.",
   report: "I ___, but my teacher ___."
  },
  gap: {
   who: "Dr. Mina Park",
   q: ["What does Dr. Park do?", "What did she invent?", "Where does she work?", "Who does her invention help?"],
   A: [["job", "scientist"], ["invention", "?"], ["works in", "a lab in Daejeon"], ["helps", "?"]],
   B: [["job", "?"], ["invention", "a talking glove"], ["works in", "?"], ["helps", "people who can't hear"]],
   tip: "She is a scientist <b>who</b> … · It's a glove <b>that</b> …"
  },
  role: {
   A: ["You are an investor.", "Ask 5 questions about the invention.", "Decide: Will you buy it?"],
   B: ["You are a young inventor.", "Choose: a flying bike / a homework robot / a talking pet collar.", "Say what it does with that / which."]
  },
  tts: {
   title: "Invent a gadget for students",
   steps: ["Think of a problem at school.", "Ask your teacher about it.", "Invent a gadget together.", "Present it: name, job, price!"],
   lang: ["It's a gadget that ___.", "It's for students who ___.", "It costs ___."]
  },
  speech: {
   time: "1 min",
   model: ["Hello! Let me show you my invention.", "It's a robot that does homework checks.", "It's for students who make mistakes.", "It reads your answers and gives tips.", "I think every student needs one.", "Thank you!"],
   outline: ["Hello", "What it is (a … that …)", "Who it's for", "What it does", "Why it's great"],
   check: ["Loud voice", "Look at your teacher", "Use who / that"]
  },
  pron: {
   cols: [["Oo", ["robot", "planet", "method"]], ["oO", ["invent", "replace", "believe"]], ["oOo", ["invention", "computer", "important"]]],
   up: "Is it possible?",
   down: "What would you invent?"
  },
  review: ["I can talk about technology.", "I can use who / which / that.", "I can describe an invention.", "I can give my opinion."]
 },
 H: {
  steps: ["Answer", "Reason", "Example", "Ask back"],
  model: [
   ["It would be really difficult to live without the internet.", "I study, shop and chat online every day.", "When the Wi-Fi died, I couldn't even pay for lunch.", "Which technology could you give up easily?"],
   ["Yes, social media has completely changed how we live.", "We share everything and compare ourselves.", "My friends and I plan everything in group chats now.", "Do you think it brings people closer or apart?"],
   ["Smart devices have made our homes comfortable.", "They save time and energy without any effort.", "Our robot vacuum cleans while I'm at school.", "Do you use any smart devices at home?"],
   ["Yes, technology has changed teaching methods a lot.", "Students can learn at their own speed with apps.", "I learned coding from an app that my school uses.", "Did you learn differently when you were young?"],
   ["I don't think it will fully replace the classroom.", "Students need real people who can motivate them.", "During COVID, many friends lost focus at home.", "Would you prefer to study online or in person?"],
   ["I think the smartphone has had the greatest impact.", "It's a device that is a phone, camera and PC in one.", "My grandma, who is 80, video-calls us weekly.", "Which invention changed the world most?"],
   ["I know Nikola Tesla, who worked on electricity.", "His ideas made modern power systems possible.", "A famous car company is named after him.", "Which inventor do you admire?"],
   ["Honestly, I don't think a time machine is possible.", "Going back in time breaks the laws of physics.", "Still, I love movies where people change the past.", "If you could travel in time, where would you go?"],
   ["I believe people will live on Mars within 100 years.", "Companies are building rockets that can be reused.", "Some plan to send people to Mars in the 2030s.", "Would you move to another planet?"],
   ["If I were a scientist, I'd invent an ocean cleaner.", "Plastic that ends up in the sea is killing marine life.", "A robot that collects trash could work day and night.", "What problem would you solve with an invention?"]
  ],
  frame: [
   "It would be difficult to live without … because …",
   "Social media has … For example, …",
   "… makes home comfortable because …",
   "Technology has changed … Students can now …",
   "I (don't) think online education will … because …",
   "The … has had the biggest impact because …",
   "I know …, who invented … He/She …",
   "I (don't) think a time machine … because …",
   "I believe / doubt that people will … because …",
   "If I were a scientist, I would invent … that …"
  ],
  more: [
   ["Are we too dependent on technology?", "How is life different from 20 years ago?", "Could you live one week without your phone?"],
   ["Should there be an age limit for social media?", "Is social media good for mental health?", "How would life change if it disappeared?"],
   ["Are smart homes safe from hackers?", "Which home device is the most useful?", "Will all homes be smart in the future?"],
   ["Is technology in class helpful or distracting?", "Should students use AI for homework?", "What is the best way to learn a language?"],
   ["What can a classroom give that a screen can't?", "Is online learning fair for everyone?", "Would you take a university degree online?"],
   ["Which invention would you remove from the world?", "The car or the airplane — which mattered more?", "What will be the next great invention?"],
   ["Are inventors born or made?", "Why are there fewer famous women inventors?", "Would you rather be rich or famous for an invention?"],
   ["What would you change in the past?", "Is it better to know the future or not?", "Could a time machine be dangerous?"],
   ["Should we fix Earth before going to space?", "Who should own the moon?", "What would daily life on Mars be like?"],
   ["Should inventors share ideas for free?", "New ideas or better old ones — which matter more?", "What invention could make people happier?"]
  ],
  gram1: {
   chain: ["I admire people who ___.", "I can't live without a gadget that ___."],
   ex: "T: I admire people who work hard.<br>S: I admire people who never give up.<br>T: I …"
  },
  gram2: {
   a: {
    title: "Define it in one sentence",
    items: ["an inventor", "a smartphone", "a laboratory", "a robot", "a search engine"],
    ans: "It's a person / thing / place <b>who / that / where</b> … <b>+ an example</b>"
   },
   b: {
    title: "Two ideas → one sentence",
    big: "Tesla worked on electricity. He was born in 1856. → Tesla, who ___, ___.",
    ans: "Then make one about <b>your favorite inventor</b>."
   }
  },
  opener: {
   think: ["How has technology changed life since your grandparents were young?", "Is there any technology you wish had never been invented?", "Does technology make us smarter or lazier?"]
  },
  convo: [
   ["A", "Did you see the news about {self-driving cars}?"],
   ["B", "Yes! Cars that drive themselves are finally on the road."],
   ["A", "Honestly, I'm not sure I'd trust one."],
   ["B", "Why not? They might be safer than people."],
   ["A", "Maybe, but what if the software fails?"],
   ["B", "Fair point. Still, I think they'll {reduce accidents}."],
   ["A", "I'd rather have a {robot cook}, to be honest."],
   ["B", "Ha! A machine that makes dinner? Count me in."],
   ["A", "Let's see which one gets invented first."]
  ],
  swap: [["a new technology", "self-driving cars"], ["a possible benefit", "reduce accidents"], ["an invention you want", "robot cook"], ["a worry", "software fails"]],
  lang: [
   ["Give an opinion", ["In my view, …", "I'd say that …", "Personally, …"]],
   ["Express doubt", ["I'm not convinced.", "I doubt it.", "What if …?"]],
   ["Speculate", ["It might …", "It could …", "Chances are …"]],
   ["Concede a point", ["Fair point.", "That's true, but …"]]
  ],
  langPractice: ["AI will replace most jobs.", "Kids shouldn't have smartphones.", "Online school is better.", "We'll live on Mars soon.", "Social media makes us lonely.", "Time travel will be possible."],
  survey: {
   ask: "Would you",
   cols: ["Me", "My teacher", "One more question"],
   rows: ["ride in a self-driving car", "use a robot as a teacher", "live one day without the internet", "move to Mars", "wear a smart chip in your hand", "buy a flying car"],
   q: "Would you …? → Yes / No. → Ask: Why? / What if …?",
   report: "My teacher would ___, but I wouldn't because ___."
  },
  gap: {
   who: "Dr. Mina Park",
   q: ["What does Dr. Park research?", "What did she invent?", "Who is it for?", "How does it work?", "What is her next goal?"],
   A: [["research", "sign language and AI"], ["invention", "?"], ["for", "people who can't hear"], ["how it works", "?"], ["next goal", "?"]],
   B: [["research", "?"], ["invention", "a glove that speaks"], ["for", "?"], ["how it works", "sensors read hand signs"], ["next goal", "a free phone app"]],
   tip: "a glove <b>that</b> … · people <b>who</b> … · the lab <b>where</b> …"
  },
  role: {
   A: ["You are an investor on a TV show.", "Ask 5 questions + 2 follow-ups.", "Decide: invest or not? Give reasons."],
   B: ["You are an inventor.", "Choose: a sleep-tracking pillow / an AI tutor / a trash-collecting drone.", "Explain the problem, the solution and the price."]
  },
  tts: {
   title: "Rank the 5 greatest inventions",
   steps: ["List 8 inventions you think are important.", "Ask your teacher for their top 3.", "Agree on a final top 5 together.", "Present your ranking in 1 minute."],
   lang: ["I'd put ___ first because ___.", "I see your point, but ___.", "So we agree that ___ comes first."]
  },
  speech: {
   time: "2 min",
   model: ["Imagine a world without light at night.", "That was life before the light bulb, which Edison improved in 1879.", "It's an invention that changed how we work, study and sleep.", "Factories could run at night, and cities became safer.", "However, it also created light pollution that affects animals.", "Still, I believe it's the invention that shaped modern life most.", "Thank you! Which invention would you choose?"],
   outline: ["Hook — \"Imagine a world without …\"", "The invention + who made it", "How it changed life", "One downside", "Your conclusion", "Ask for questions"],
   check: ["Clear voice", "Eye contact", "Use 3 relative clauses", "Answer 1 question"]
  },
  pron: {
   cols: [["Oo", ["gadget", "method", "future"]], ["oOo", ["invention", "computer", "electric"]], ["oOoo", ["technology", "photography", "society"]]],
   up: "Would you trust a robot?",
   down: "Which invention matters most?"
  },
  review: ["I can answer in 4 parts.", "I can use who / which / that / where.", "I can discuss pros and cons of technology.", "I can pitch an invention."]
 }
};
