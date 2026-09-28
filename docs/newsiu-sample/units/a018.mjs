// SIU ADVANCE 018 — Work (8판 형식, 001 본보기)
// 원본과 다른 점:
//  - 문법(부사절) 설명이 길고 어려워 «when · because · if · until 이 붙은 절 = 언제/왜/어떤 조건에서» 로 다시 정리. 예문은 원본(until her arms ached · once they saw it)의 뜻을 살려 일 주제로 바꿈
//  - Q2 "What do you think people who are commonly work from home?" → "What do you think of people who commonly work from home?"
//  - Q8 "…dress code, workspace, ete would you have?" → "…dress code and workspace would you have?" (ete 오타)
//  - Q10 "What basic benefits that emplyoyee can have in your country" → "What basic benefits can employees get in your country?"
//  - Keyword Fired 품사 verb → 질문 속 쓰임대로 fire(verb, 해고하다)로 바꾸고 뜻도 동사로
//  - Keyword Quit 뜻 "leave (a place), usually permanently" → 일을 그만두는 뜻으로 바로잡음
//  - Keyword Balance 뜻 "offset or compare the value…" → 일과 삶의 균형을 맞추는 뜻으로 바꿈
//  - 대답 틀 "When I was a child I want to be" → wanted (시제)
export default {
 no: "a018",
 title: "Work",
 book: "SIU ADVANCE 018 - Work",
 next: "019 Travel",
 cover: { h1: "The World", em: "of Work", goals: ["Talk about jobs and working life", "Ask and answer 10 questions", "Use when / because / if clauses"] },
 KW: [
  ["want", "verb", "원하다", "to wish to have or do something"],
  ["common", "adjective", "흔한, 일반적인", "happening often or to many people"],
  ["motivate", "verb", "동기를 부여하다", "to make someone want to work hard"],
  ["balance", "verb", "균형을 맞추다", "to give the right amount of time to two things"],
  ["quit", "verb", "(일을) 그만두다", "to leave your job or stop doing something"],
  ["increase", "verb", "늘리다, 올리다", "to become or make something bigger"],
  ["fire", "verb", "해고하다", "to make someone leave their job"],
  ["policy", "noun", "방침, 정책", "a set of rules that a company or group follows"],
  ["prepare", "verb", "준비하다", "to get ready for something"],
  ["benefit", "noun", "(회사의) 복지 혜택", "something extra a worker gets, like health insurance"]
 ],
 QS: [
  "When you were a child, what did you want to be?",
  "What do you think of people who commonly work from home?",
  "What motivates you to work hard?",
  "How do you balance work and your personal life?",
  "What would make you quit your job?",
  "Other than increasing salaries, how can employers make workers happy?",
  "What would you do if you were fired from your job?",
  "If you had your own company, what policies, dress code and workspace would you have?",
  "How do you prepare for a job interview?",
  "What basic benefits can employees get in your country?"
 ],
 IMG_E: ["scene-words/18611", "scene-clips/7018", "scene-words/19111", "scene-words/18596", "scene-words/14829", "scene-words/16591", "scene-words/14885", "scene-words/12253", "scene-words/16344", "scene-words/18544"],
 IMG_H: ["scene-words/12605", "scene-words/21074", "scene-words/18926", "scene-words/18596", "scene-words/14829", "scene-words/19626", "scene-words/14885", "scene-words/21112", "scene-words/18159", "scene-words/18614"],
 PICS: {
  opener: "scene-words/18570",
  talk: "scene-words/14226",
  group: "scene-words/18357",
  speech: "scene-words/17399",
  reporter: "scene-words/20024",
  survey: "scene-words/12477",
  pron: "scene-words/18310",
  roleB: "scene-words/17392",
  cover: "scene-words/12566",
  back: "scene-words/16591"
 },
 gram1: {
  can: "say when, why or if",
  title: "Adverb",
  em: "Clauses",
  rules: [
   ["When?", "I'll call you <b>when I finish work</b>."],
   ["Why?", "She works hard <b>because she loves her job</b>."]
  ],
  hardNote: "when · before · after · until · because · if · although",
  say: [
   "An adverb clause has a subject and a verb. It tells us when, why, how or where.",
   "I'll call you when I finish work.",
   "She works hard because she loves her job."
  ]
 },
 gram2: {
  can: "ask \"What do you do when…?\"",
  cols: ["Time: when / until", "Reason / condition: because / if"],
  rows: [
   ["+", "He worked <b>until his arms hurt</b>.", "I work hard <b>because I want a raise</b>."],
   ["−", "I don't check email <b>when I'm on vacation</b>.", "She didn't quit <b>because she likes her team</b>."],
   ["?", "What did you want to be <b>when you were a child</b>?", "Would you quit <b>if your boss yelled</b>?"]
  ]
 },
 gapCan: "ask \"What does she do when…?\"",
 role: {
  title: "The",
  em: "Career",
  tail: "Counselor",
  opener: "Welcome! So, what kind of job are you looking for?",
  a: "Career counselor",
  b: "Job seeker"
 },
 pron: {
  can: "say -ed endings clearly",
  title: "Three sounds of",
  em: "-ed",
  game: "Teacher says a verb → you say the past and a sentence: <i>\"prepare → prepared. I prepared for my interview.\"</i>"
 },
 E: {
  steps: ["Answer", "More"],
  model: [
   ["When I was a child, I wanted to be a pilot.", "I loved watching airplanes."],
   ["I think it's convenient for them.", "They don't waste time on buses."],
   ["Good grades motivate me.", "My parents' praise helps, too."],
   ["I finish my homework before dinner.", "Then I relax with my family."],
   ["I would quit if my boss was rude.", "I want a kind workplace."],
   ["They can give longer holidays.", "Free snacks would be nice, too!"],
   ["First, I'd talk to my family.", "Then I'd look for a new job."],
   ["Everyone could wear comfortable clothes.", "The office would have a game room."],
   ["I practice my answers when I'm free.", "I also prepare nice clothes."],
   ["Workers get health insurance.", "They also get paid holidays."]
  ],
  frame: [
   "When I was a child, I wanted to be a ___.",
   "I think it's ___ because ___.",
   "___ motivate(s) me.",
   "I ___ before ___.",
   "I would quit if ___.",
   "They can give ___.",
   "First, I'd ___. Then I'd ___.",
   "Everyone could ___.",
   "I ___ when I'm free.",
   "Workers get ___."
  ],
  bank: [
   ["pilot", "doctor", "teacher", "singer"],
   ["convenient", "relaxing", "lonely", "hard"],
   ["Good grades", "My parents", "My goals", "Prizes"],
   ["do homework", "study", "dinner", "bedtime"],
   ["my boss was rude", "the work was boring", "the pay was low", "I was very tired"],
   ["longer holidays", "free snacks", "a nice office", "thank-you notes"],
   ["talk to my family", "take a rest", "look for a job", "learn a new skill"],
   ["wear comfy clothes", "bring pets", "take naps", "work from home"],
   ["practice answers", "read about the company", "choose clothes", "sleep early"],
   ["health insurance", "paid holidays", "a bonus", "free lunch"]
  ],
  more: [
   ["What do you want to be now?", "Why did your dream change?"],
   ["Do your parents work from home?", "Would you like to?"],
   ["What makes you lazy?", "Who motivates you?"],
   ["Do you have enough free time?", "What do you do to relax?"],
   ["What is a bad job for you?", "Is it okay to quit easily?"],
   ["What makes you happy at school?", "Is money the most important thing?"],
   ["How would you feel?", "Who would help you?"],
   ["What would your company make?", "Would you have a uniform?"],
   ["What question is hard to answer?", "Do you get nervous?"],
   ["What benefit is best?", "Does your family get benefits?"]
  ],
  gram1: {
   chain: ["When I get home, I ___.", "I study hard because ___."],
   ex: "T: When I get home, I take a shower.<br>S: When I get home, I eat a snack.<br>T: I …"
  },
  gram2: {
   a: {
    title: "What do you do …",
    items: ["when you're bored?", "when you're tired?", "when it rains?", "when you're sad?", "when you're free?"],
    ans: "When I'm ___, I ___. <b>+ one more sentence</b>"
   },
   b: {
    title: "My dream job",
    big: "I want to be a ___ because ___. If I work hard, I ___.",
    ans: "Then ask: <b>Why do you like your job?</b>"
   }
  },
  opener: {
   think: ["Look at the photo. What jobs can you see?", "What does your family do for work?", "What job looks fun to you?"]
  },
  convo: [
   ["A", "What do you want to be in the future?"],
   ["B", "I want to be a {game designer}."],
   ["A", "Cool! Why?"],
   ["B", "Because I {love making stories}."],
   ["A", "What would you do first?"],
   ["B", "When I finish school, I'll {study computers}."],
   ["A", "Good plan! I want to be a {vet}."]
  ],
  swap: [["a job", "game designer"], ["a reason", "love making stories"], ["a first step", "study computers"], ["your partner's job", "vet"]],
  lang: [
   ["Say why", ["Because …", "I want to … so …"]],
   ["Say when", ["When I finish school, …", "After I …"]],
   ["Show interest", ["Cool!", "Good plan!", "Really? Why?"]]
  ],
  langPractice: ["I want to be a YouTuber.", "My dad works from home.", "I never get tired.", "I want to be rich.", "My mom works at night.", "I don't want a job."],
  survey: {
   ask: "Would you like to",
   cols: ["Me", "My teacher"],
   rows: ["work from home", "work in another country", "have your own company", "wear a uniform", "work at night", "work with animals"],
   q: "Would you like to …? → Yes, I would. / No, I wouldn't.",
   report: "I would like to ___, but my teacher ___."
  },
  gap: {
   who: "Suji's job",
   q: ["What is Suji's job?", "When does she start work?", "Why does she like it?", "What does she do when she's tired?"],
   A: [["job", "a nurse"], ["start time", "?"], ["likes it because", "she helps people"], ["when tired", "?"]],
   B: [["job", "?"], ["start time", "at 7 a.m."], ["likes it because", "?"], ["when tired", "drinks coffee"]],
   tip: "She <b>starts</b> · <b>When</b> she's tired, she …"
  },
  role: {
   A: ["You are a career counselor.", "Ask 5 questions.", "Suggest one job."],
   B: ["You are looking for a job.", "Choose: likes animals / computers / people.", "Answer with 2 sentences."]
  },
  tts: {
   title: "Make a \"Dream company\" poster",
   steps: ["Think of a company name.", "Ask your teacher about good workplaces.", "Choose 3 rules and 2 benefits.", "Show your poster and tell!"],
   lang: ["Our company makes ___.", "Workers can ___ when ___.", "We give ___ because ___."]
  },
  speech: {
   time: "1 min",
   model: ["Hello! Let me tell you about my dream job.", "When I was little, I wanted to be a pilot.", "Now I want to be a game designer.", "I like it because I love stories and computers.", "When I finish school, I will study hard.", "Thank you!"],
   outline: ["Hello", "Your childhood dream", "Your dream job now", "Why (because …)", "Your plan (when …)", "Thank you!"],
   check: ["Loud voice", "Look at teacher", "Use because / when"]
  },
  pron: {
   cols: [["/t/", ["worked", "helped", "asked"]], ["/d/", ["fired", "prepared", "played"]], ["/ɪd/", ["wanted", "needed", "started"]]],
   up: "Do you want a job?",
   down: "What do you want to be?"
  },
  review: ["I can talk about jobs.", "I can use when / because.", "I can say what I want to be.", "I can say one more sentence."]
 },
 H: {
  steps: ["Answer", "Reason", "Example", "Ask back"],
  model: [
   ["When I was a child, I wanted to be an astronaut.", "I was fascinated by space and rockets.", "I even built a cardboard rocket in our living room.", "What was your childhood dream?"],
   ["I think they're lucky, but it takes discipline.", "It's easy to get distracted at home.", "My sister works from home and keeps strict hours.", "Would you prefer the office or home?"],
   ["Clear goals motivate me the most.", "When I can see progress, I keep going.", "I track my study hours in an app every day.", "What keeps you motivated?"],
   ["I set a hard stop at 7 p.m.", "If I don't, work takes over my whole evening.", "After seven, my phone goes on silent.", "How do you switch off after work?"],
   ["I'd quit if I stopped learning anything new.", "A job without growth feels like a dead end.", "My friend left a well-paid job for that reason.", "Would you ever quit without another job?"],
   ["They can offer flexible hours and real praise.", "People want to feel trusted and valued.", "My old boss let us choose our hours, and we worked harder.", "What makes you feel valued at work?"],
   ["First, I'd ask for honest feedback.", "Understanding why helps me do better next time.", "Then I'd update my CV and contact old colleagues.", "Have you ever lost a job or a role?"],
   ["I'd have flexible hours and a casual dress code.", "Comfortable people are usually more creative.", "The office would have quiet rooms and a shared kitchen.", "What policy would you add?"],
   ["I research the company and practice with a friend.", "Preparation makes me much less nervous.", "Before my last interview, I prepared ten stories.", "What's the hardest interview question?"],
   ["Here, employees get health insurance and a pension.", "They also get paid leave and severance pay.", "Many companies also give meal allowances.", "What benefits do workers get in your country?"]
  ],
  frame: [
   "When I was a child, I wanted to be … because …",
   "I think they … , but … For example, …",
   "… motivates me because when I … , I …",
   "I … so that … After …, I …",
   "I'd quit if … because …",
   "They can … because people want …",
   "First, I'd … Then I'd …",
   "I'd have … because …",
   "I … before an interview because …",
   "Here, employees get … They also …"
  ],
  more: [
   ["How did your dream change as you grew up?", "Should kids choose a career early?", "Is it too late to follow a childhood dream?"],
   ["Will offices disappear in the future?", "Is home work more productive?", "What do remote workers miss most?"],
   ["Is money a good motivator?", "Can a boss motivate a team?", "What kills your motivation?"],
   ["Is work-life balance possible in Korea?", "Should work emails be banned after hours?", "Would you work less for less money?"],
   ["Is it brave or risky to quit?", "Is loyalty to a company still important?", "How long should you stay in a first job?"],
   ["Are salaries the most important thing?", "Should companies offer a four-day week?", "What benefit would you like most?"],
   ["How do people handle losing a job?", "Should companies help fired workers?", "Can being fired be a good thing?"],
   ["Should companies have dress codes?", "Is an open office a good idea?", "What rule would you never have?"],
   ["What should you never say in an interview?", "Are interviews a fair way to choose people?", "Would you use AI to prepare?"],
   ["Should the government pay for benefits?", "Which country has the best benefits?", "Are benefits more important than pay?"]
  ],
  gram1: {
   chain: ["When I'm stressed at work, I ___.", "I'd quit my job if ___."],
   ex: "T: When I'm stressed at work, I go for a walk.<br>S: When I'm stressed, I …<br>T: …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["What do you do when you can't focus?", "What did you do after you graduated?", "Would you move abroad if you got a job offer?", "Do you work better when it's quiet?", "What will you do when you retire?"],
    ans: "When / If / Because … <b>+ an example</b>"
   },
   b: {
    title: "Job advice",
    big: "Before you apply, ___. When you meet the boss, ___. If they ask about money, ___.",
    ans: "Then ask: <b>What would you add?</b>"
   }
  },
  opener: {
   think: ["Do we work to live, or live to work?", "What makes a job meaningful?", "Would you take a boring job for a high salary?"]
  },
  convo: [
   ["A", "You look worn out. Busy day?"],
   ["B", "Yes. I worked until {nine p.m.} again."],
   ["A", "That's too much. Why so late?"],
   ["B", "Because my boss {keeps adding projects}."],
   ["A", "Have you talked to him about it?"],
   ["B", "Not yet. I'm worried he'll {think I'm lazy}."],
   ["A", "If you don't say anything, nothing will change."],
   ["B", "True. Maybe I'll ask for {flexible hours}."],
   ["A", "Good idea. Tell me how it goes."]
  ],
  swap: [["a late time", "nine p.m."], ["a problem", "keeps adding projects"], ["a worry", "think I'm lazy"], ["a request", "flexible hours"]],
  lang: [
   ["Show concern", ["You look worn out.", "That's too much.", "Are you okay?"]],
   ["Give advice", ["If I were you, I'd …", "Have you tried …?", "Maybe you should …"]],
   ["Explain", ["The thing is, …", "Because …", "When …, I …"]],
   ["Encourage", ["Good idea.", "Tell me how it goes."]]
  ],
  langPractice: ["I work 60 hours a week.", "I want to quit my job.", "My boss never praises us.", "I love working from home.", "I got a promotion!", "I have a job interview tomorrow."],
  survey: {
   ask: "Would you",
   cols: ["Me", "My teacher", "One more question"],
   rows: ["take a job abroad", "work for less money if you loved it", "start your own business", "work four long days instead of five", "work from home every day", "retire early"],
   q: "Would you …? → Yes. → Ask: Why? / What if …?",
   report: "We both would ___, but only I ___."
  },
  gap: {
   who: "Daniel's career",
   q: ["What did Daniel want to be as a child?", "What is his job now?", "Why did he quit his first job?", "What motivates him now?", "What benefit does he like most?"],
   A: [["child dream", "a firefighter"], ["job now", "?"], ["why he quit", "the hours were too long"], ["motivation", "?"], ["best benefit", "?"]],
   B: [["child dream", "?"], ["job now", "a web designer"], ["why he quit", "?"], ["motivation", "seeing happy clients"], ["best benefit", "working from home on Fridays"]],
   tip: "He quit <b>because</b> … · <b>When</b> he was a child, …"
  },
  role: {
   A: ["You are a career counselor.", "Ask 5 questions + 2 follow-ups.", "Suggest 2 jobs and explain why."],
   B: ["You want to change jobs.", "Choose: bored / low pay / no free time.", "Give reasons with because / when / if."]
  },
  tts: {
   title: "Design the perfect workplace",
   steps: ["Think: what makes workers happy?", "Ask your teacher 4 of today's questions.", "Agree on 3 policies and 2 benefits.", "Present your company in 1 minute."],
   lang: ["I think we should ___ because ___.", "If workers ___, they will ___.", "We agree that ___."]
  },
  speech: {
   time: "2 min",
   model: ["Hi everyone. Today I'll talk about work-life balance.", "When I started working, I stayed late every day.", "I thought hard work meant long hours.", "But I was always tired, and my work got worse.", "So I set a rule: I stop working at seven.", "Now I rest better, and I actually get more done.", "I believe balance makes us better workers.", "Thanks for listening! Any questions?"],
   outline: ["Hook — \"Today I'll talk about…\"", "A problem you had", "What you believed", "What you changed", "The result", "Ask for questions"],
   check: ["Clear voice", "Eye contact", "Adverb clauses", "Answer 1 question"]
  },
  pron: {
   cols: [["/t/", ["worked", "stressed", "balanced"]], ["/d/", ["fired", "prepared", "received"]], ["/ɪd/", ["wanted", "motivated", "started"]]],
   up: "Would you quit your job?",
   down: "What motivates you?"
  },
  review: ["I can answer in 4 parts.", "I can use when / because / if clauses.", "I can give advice about work.", "I can give a short presentation."]
 }
};
