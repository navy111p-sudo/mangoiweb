// SIU BASIC 019 — Jobs (8판 형식, 001 본보기와 같은 모양)
// 원본과 다른 점:
//  Q2 "…in the military? Why/why not?" → "…in the military? Why or why not?"
//  Q8 "Would you like a job in which you traveled a lots of place?" → "Would you like a job in which you travel to a lot of places?"
//  Q10 "…frequently asked…" → "…often asked…" (쉬운 말)
//  KW women: 원본 뜻풀이(an adult female human being)는 단수 뜻 → "adult female people (one woman, two women)"
//  KW 뜻풀이(enjoy·boring·volunteer·retirement·salary·interview)를 쉬운 영어로 줄임
//  문법: 원본 예문 "Barry and Sate" "She must weep, or she will die" "Neither a borrower, nor a lender be" 등 옛 문체 → 직업 주제의 쉬운 예문으로
export default {
 no: "019",
 title: "Jobs",
 book: "SIU BASIC 019 - Jobs",
 next: "020 Korea",
 cover: { h1: "Dream", em: "Jobs", goals: ["Talk about jobs and work", "Ask and answer 10 questions", "Present your dream job"] },
 KW: [
  ["enjoy", "verb", "즐기다", "to like doing something and feel happy"],
  ["women", "noun", "여성들", "adult female people (one woman, two women)"],
  ["farm", "noun", "농장", "land where people grow food or keep animals"],
  ["boring", "adjective", "지루한", "not interesting at all"],
  ["fun", "noun", "재미", "a happy time that makes you laugh or smile"],
  ["volunteer", "noun", "자원봉사자", "a person who helps others without getting paid"],
  ["retirement", "noun", "은퇴", "the time when you stop working, usually when you are old"],
  ["place", "noun", "장소", "a building, area, town or country"],
  ["salary", "noun", "월급", "money you get from your job every month"],
  ["interview", "noun", "면접", "a meeting where someone asks you questions for a job"]
 ],
 QS: [
  "Do you think it is more important to make a lot of money or to enjoy your job?",
  "Do you think it's acceptable for women to be in the military? Why or why not?",
  "Have you ever worked on a farm?",
  "What are some jobs that you think would be boring?",
  "What are some jobs that you think would be fun?",
  "What kind of volunteer work have you done?",
  "What plans have you made for your retirement?",
  "Would you like a job in which you travel to a lot of places?",
  "Does your job pay a good salary?",
  "What are some questions that are often asked in a job interview?"
 ],
 IMG_E: ["scene-words/12605", "scene-words/18878", "scene-words/16257", "scene-clips/7212", "scene-words/19055", "scene-clips/5035", "scene-words/14621", "scene-words/12309", "scene-words/19626", "scene-words/16343"],
 IMG_H: ["scene-words/12605", "scene-words/18878", "scene-words/16070", "scene-words/12253", "scene-words/16722", "scene-words/16535", "scene-words/20287", "scene-clips/5024", "scene-words/19419", "scene-clips/7292"],
 PICS: {
  opener: "scene-words/12477", talk: "scene-clips/7007", group: "scene-words/12566", speech: "scene-words/13179",
  reporter: "scene-words/16345", survey: "scene-words/12476", pron: "scene-clips/7495", roleB: "scene-words/16344",
  cover: "scene-words/12477", back: "scene-words/16535"
 },
 gram1: {
  can: "join ideas with and · but · or · because",
  title: "Join it with",
  em: "Conjunctions",
  rules: [
   ["Same kind", "I want to be a chef <b>or</b> a baker. It's fun <b>and</b> easy."],
   ["Different / reason", "It's hard, <b>but</b> I like it <b>because</b> I help people."]
  ],
  hardNote: "and · but · or · so · because · if · when · although",
  say: [
   "A conjunction is a word that joins words or sentences together.",
   "I want to be a chef or a baker.",
   "It's hard, but I like it because I help people."
  ]
 },
 gram2: {
  can: "give reasons with because · if · when",
  cols: ["and · but · or · so", "because · if · when"],
  rows: [
   ["+", "A pilot travels a lot, <b>so</b> it's fun.", "I want this job <b>because</b> I love animals."],
   ["−", "It pays well, <b>but</b> it isn't fun.", "I won't take the job <b>if</b> it's boring."],
   ["?", "Do you want money <b>or</b> fun?", "What will you do <b>when</b> you retire?"]
  ]
 },
 gapCan: "ask \"What does she do?\"",
 role: { title: "The", em: "Job", tail: "Interview", opener: "Welcome! Please sit down. Can you tell me about yourself?", a: "Interviewer", b: "Job seeker" },
 pron: { can: "say and · or · but softly", title: "Say it", em: "softly", game: "and → 'n' · or → 'er' · but → 'bət'. Teacher says two jobs → you join them fast: <i>\"a nurse 'n' a doctor\"</i>" },
 E: {
  steps: ["Answer", "More"],
  model: [
   ["I think enjoying my job is more important.", "I want to be happy every day."],
   ["Yes, I do. Women are strong and brave.", "My aunt is a soldier."],
   ["No, I haven't. But I visited a farm.", "I fed the cows."],
   ["I think an office job would be boring.", "You sit all day."],
   ["I think a zookeeper would be fun.", "I love animals."],
   ["I picked up trash in the park.", "It made me happy."],
   ["When I am old, I will travel.", "I want to go to Paris."],
   ["Yes, I would! I like airplanes.", "I want to be a pilot."],
   ["I don't have a job yet.", "I want a job with a good salary."],
   ["They ask, \"Why do you want this job?\"", "They also ask, \"What are you good at?\""]
  ],
  frame: [
   "I think ___ is more important.",
   "Yes, I do. / No, I don't. Women are ___.",
   "Yes, I have. / No, I haven't. I ___.",
   "I think a/an ___ would be boring.",
   "I think a/an ___ would be fun.",
   "I ___ in the ___.",
   "When I am old, I will ___.",
   "Yes, I would! / No, I wouldn't. I want to be a ___.",
   "I want a job with a good ___.",
   "They ask, \"What are you ___ at?\""
  ],
  bank: [
   ["enjoying my job", "money", "fun", "happy"],
   ["strong", "brave", "smart", "soldiers"],
   ["fed cows", "picked apples", "rode a horse", "farm"],
   ["office worker", "guard", "cashier", "sit all day"],
   ["zookeeper", "chef", "YouTuber", "game designer"],
   ["picked up trash", "helped", "park", "library"],
   ["travel", "garden", "fish", "rest"],
   ["pilot", "tour guide", "flight attendant", "reporter"],
   ["salary", "team", "boss", "place"],
   ["good", "bad", "great", "interested"]
  ],
  more: [
   ["What job do you want?", "Why do you want it?"],
   ["Do you know a soldier?", "Would you be a soldier?"],
   ["What animals live on a farm?", "Is farm work hard?"],
   ["What is a boring job for you?", "Why is it boring?"],
   ["What job does your mom have?", "Is her job fun?"],
   ["Who did you help?", "How did you feel?"],
   ["What will your grandma do?", "What do old people do?"],
   ["Where do you want to go?", "Do you like airplanes?"],
   ["What job pays a lot?", "Is money important?"],
   ["Are interviews scary?", "What would you say?"]
  ],
  gram1: {
   chain: ["I like ___ and ___.", "I like ___, but I don't like ___."],
   ex: "T: I like dogs and cats.<br>S: I like pizza, but I don't like carrots.<br>T: I …"
  },
  gram2: {
   a: { title: "This or that?", items: ["A chef or a pilot?", "Money or fun?", "Inside or outside?", "Alone or with a team?"], ans: "I want ___ <b>because</b> ___." },
   b: { title: "My dream job", big: "I want to be a ___ because ___.", ans: "Then ask: <b>What do you want to be?</b>" }
  },
  opener: { think: ["Look at the photo. What jobs can you see?", "What job does your mom or dad have?", "What do you want to be?"] },
  convo: [
   ["A", "Hi, Jun! What do you want to be?"],
   ["B", "I want to be a {chef}."],
   ["A", "Cool! Why?"],
   ["B", "Because I love {cooking}."],
   ["A", "Is it hard?"],
   ["B", "Yes, but it's {fun}. How about you?"],
   ["A", "I want to be a {vet}. I love animals!"]
  ],
  swap: [["a job", "chef"], ["something you love", "cooking"], ["a good word", "fun"], ["your partner's job", "vet"]],
  lang: [
   ["Show interest", ["Cool!", "Really?", "Wow!"]],
   ["Ask why", ["Why?", "Why do you like it?"]],
   ["Give a reason", ["Because I …", "It's fun!"]]
  ],
  langPractice: ["I want to be a doctor.", "My dad is a farmer.", "I don't like office jobs.", "I want to travel a lot.", "I helped at the library.", "My mom is a teacher."],
  survey: {
   ask: "Would you like to",
   cols: ["Me", "My teacher"],
   rows: ["work on a farm", "work in an office", "fly airplanes", "work with animals", "cook for people", "work at night"],
   q: "Would you like to …? → Yes, I would. / No, I wouldn't.",
   report: "I would like to ___, but my teacher wouldn't."
  },
  gap: {
   who: "Mr. Park",
   q: ["What does Mr. Park do?", "Where does he work?", "Does he like his job?", "What does he do after work?"],
   A: [["job", "chef"], ["works at", "?"], ["likes his job?", "yes — it's fun"], ["after work", "?"]],
   B: [["job", "?"], ["works at", "a hotel"], ["likes his job?", "?"], ["after work", "plays tennis"]],
   tip: "What <b>does</b> he do? · He work<b>s</b> · He like<b>s</b>"
  },
  role: {
   A: ["You are an interviewer.", "Ask 5 questions.", "Say \"Thank you!\" at the end."],
   B: ["You want a job.", "Choose: chef / zookeeper / pilot.", "Answer with 2 sentences."]
  },
  tts: {
   title: "Make a job poster",
   steps: ["Pick one fun job.", "Ask your teacher about it.", "Find 2 good things and 1 hard thing.", "Show your poster and tell!"],
   lang: ["This job is fun because ___.", "It's hard, but ___.", "You need to be ___."]
  },
  speech: {
   time: "1 min",
   model: ["Hello! My name is Minho.", "I want to be a pilot.", "Pilots fly to many places.", "It's hard, but it's exciting.", "I want to see the world.", "Thank you!"],
   outline: ["Name", "My dream job", "What they do", "Hard, but …", "Thank you!"],
   check: ["Loud voice", "Look at the camera", "Use because / but"]
  },
  pron: {
   cols: [["and", ["you 'n' me", "mom 'n' dad", "cats 'n' dogs"]], ["or", ["tea 'er' milk", "yes 'er' no", "red 'er' blue"]], ["but", ["but it's fun", "but I'm tired", "but why?"]]],
   up: "Is it fun?",
   down: "What do you want to be?"
  },
  review: ["I can talk about jobs.", "I can use and / but / or.", "I can give a reason with because.", "I can talk about my dream job."]
 },
 H: {
  steps: ["Answer", "Reason", "Example", "Ask back"],
  model: [
   ["I think enjoying your job matters more.", "We spend most of our lives at work.", "My uncle quit his bank job and is happier now.", "Which would you choose?"],
   ["Yes, I think it's acceptable.", "Skill matters, not gender.", "Many countries have women pilots.", "Should women have to serve?"],
   ["Yes, I once worked on my grandparents' farm.", "They needed help during the apple harvest.", "I picked apples for three days, and my back hurt a lot.", "Have you ever done hard physical work?"],
   ["I think data entry would be boring.", "You do the same thing again and again.", "Typing numbers all day with no people to talk to sounds tiring.", "What job would bore you?"],
   ["I think being a travel YouTuber would be fun.", "You get paid to explore new places.", "Some creators make money just by showing street food around the world.", "Would you enjoy being online all the time?"],
   ["I volunteered at a local animal shelter.", "I wanted to help animals without homes.", "I walked dogs and cleaned cages every Saturday for a year.", "Have you ever volunteered?"],
   ["I haven't made real plans yet, but I want to live by the sea.", "A quiet life near nature sounds relaxing.", "My grandparents moved to Jeju after they retired.", "Where would you like to live when you retire?"],
   ["Yes, I'd love a job with a lot of travel.", "Meeting new people and cultures keeps life exciting.", "Flight attendants can visit several countries in one month.", "Wouldn't you miss your home, though?"],
   ["I'm a student now, but my part-time job pays OK.", "I earn the minimum wage at a convenience store.", "It's enough for my phone bill and snacks.", "What do you think is a fair salary?"],
   ["They often ask, \"What are your strengths?\"", "They want to see if you fit the job.", "They also ask, \"Where do you see yourself in five years?\"", "What's the hardest interview question?"]
  ],
  frame: [
   "I think … matters more because …",
   "I think it is / isn't OK because …",
   "Yes, I have. / No, I haven't, but …",
   "I think … would be boring because …",
   "I think … would be fun because …",
   "I have volunteered at … because …",
   "When I retire, I will … because …",
   "Yes, I would, because … / No, I wouldn't because …",
   "Yes, it does. / No, it doesn't, but …",
   "They often ask, \"…\" because …"
  ],
  more: [
   ["Can money buy happiness?", "Would you do a boring job for double pay?", "Which job is most rewarding?"],
   ["Should everyone do military service?", "What jobs were once only for men?", "Which jobs are still hard for women?"],
   ["Why do fewer young people want to farm?", "Will robots do farm work in the future?", "Would you live in the countryside?"],
   ["Can a boring job become interesting?", "Is being bored sometimes good for us?", "What job would you never do?"],
   ["Should work be fun, or is that too much to ask?", "Can a hobby become a job?", "What job did you want as a child?"],
   ["Should volunteer work be required for students?", "Why do people volunteer for free?", "What volunteer work would you like to try?"],
   ["At what age should people retire?", "What will retirement look like in 2060?", "Is it good to work after 65?"],
   ["Would travel for work still feel fun after a few years?", "Is working from anywhere the future?", "Which country would you most like to work in?"],
   ["Should people talk openly about their salary?", "Which job deserves higher pay?", "Is a high salary worth long hours?"],
   ["How can you prepare for an interview?", "What should you never say in an interview?", "Are interviews a fair way to choose people?"]
  ],
  gram1: {
   chain: ["I'd like to be a ___ because ___.", "I'd take a job ___ if ___."],
   ex: "T: I'd like to be a chef because I love food.<br>S: I'd take a job abroad if it paid well.<br>T: I …"
  },
  gram2: {
   a: { title: "This or that?", items: ["Money or passion?", "An office or working from home?", "A big company or a startup?", "A team or working alone?", "Stable or exciting?"], ans: "I'd choose ___ <b>because</b> ___, <b>but</b> ___." },
   b: { title: "Job deal-breakers", big: "I would take a job if ___, but not if ___. Would you work at night if ___?", ans: "Then ask: <b>What would you do if …?</b>" }
  },
  opener: { think: ["What makes a job a \"good job\"?", "Would you rather be your own boss or work for a company?", "Which jobs will disappear in 20 years? Why?"] },
  convo: [
   ["A", "So, what do you want to do after you graduate?"],
   ["B", "I'm thinking about becoming a {nurse}."],
   ["A", "Really? What made you choose that?"],
   ["B", "I like {helping people}, and it's a stable job."],
   ["A", "That's true. But isn't it really tiring?"],
   ["B", "It is, but I think it's worth it."],
   ["A", "Would you work {night shifts}?"],
   ["B", "If the pay is good, sure. What about you?"],
   ["A", "I want to be a {game designer}, although it's competitive."]
  ],
  swap: [["a job", "nurse"], ["something you like", "helping people"], ["a hard part", "night shifts"], ["your partner's job", "game designer"]],
  lang: [
   ["Ask about plans", ["What do you want to do?", "Are you thinking about …?"]],
   ["Ask for reasons", ["What made you choose that?", "Why is that?", "How come?"]],
   ["Point out a problem", ["But isn't it …?", "Don't you think …?"]],
   ["Agree / disagree", ["That's true.", "I see your point, but …"]]
  ],
  langPractice: ["I want to be a lawyer for the money.", "My dream is to be a YouTuber.", "I'd never work in an office.", "Farming is a boring job.", "I want to retire at 40.", "Teachers should earn more."],
  survey: {
   ask: "Would you",
   cols: ["Me", "My teacher", "One more question"],
   rows: ["work on weekends for more pay", "take a job abroad", "work from home every day", "do a job you don't enjoy for money", "start your own business", "volunteer every month"],
   q: "Would you …? → Yes. → Ask: Why? / Under what conditions?",
   report: "My teacher would ___, but I wouldn't because ___."
  },
  gap: {
   who: "Mr. Park",
   q: ["What does Mr. Park do?", "Where does he work, and for how long?", "What does he enjoy about it?", "What is the hardest part?", "What are his plans for retirement?"],
   A: [["job", "head chef"], ["workplace", "?"], ["enjoys", "creating new dishes"], ["hardest part", "?"], ["retirement plan", "?"]],
   B: [["job", "?"], ["workplace", "a hotel in Busan — 12 years"], ["enjoys", "?"], ["hardest part", "long hours on weekends"], ["retirement plan", "open a small restaurant"]],
   tip: "What <b>does</b> he do? · He'<b>s</b> worked there <b>for</b> … · <b>because</b> / <b>but</b>"
  },
  role: {
   A: ["You are an interviewer.", "Ask 5 questions + 2 follow-ups.", "Decide: hire or not? Give a reason."],
   B: ["You want the job.", "Choose: flight attendant / game designer / nurse.", "Give reasons and examples. Hide one weakness — tell it only if asked \"Any weaknesses?\""]
  },
  tts: {
   title: "Create the perfect job ad",
   steps: ["Think: what job would students really want?", "Ask your teacher 4 of today's questions.", "Agree on the pay, place and 3 duties.", "Present your job ad in 1 minute."],
   lang: ["I think we should offer ___ because ___.", "That's a good idea, but ___.", "So we agree on ___."]
  },
  speech: {
   time: "2 min",
   model: [
    "Hi everyone. Let me tell you about my dream job.",
    "I want to be a flight attendant.",
    "I love meeting people, and I want to see the world.",
    "The job is tiring because of long flights, but it's exciting.",
    "My cousin is a flight attendant, and she has visited 30 countries.",
    "To prepare, I'm studying English and Chinese.",
    "If I work hard, I think I can do it.",
    "Thanks for listening! Any questions?"
   ],
   outline: ["Hook — \"Let me tell you…\"", "Dream job", "Why — and / because", "A hard part — but", "An example or a person", "How to prepare + questions"],
   check: ["Clear voice", "Eye contact", "Use 3 conjunctions", "Answer 1 question"]
  },
  pron: {
   cols: [["and", ["rock 'n' roll", "black 'n' white", "you 'n' me"]], ["or", ["more 'er' less", "one 'er' two", "now 'er' never"]], ["but", ["but it's worth it", "but isn't it", "but not now"]]],
   up: "Would you work at night?",
   down: "What made you choose that job?"
  },
  review: ["I can answer in 4 parts.", "I can join ideas with and / but / or / so.", "I can give reasons with because / if.", "I can present my dream job."]
 }
};
