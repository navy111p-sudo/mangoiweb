// SIU ADVANCE 002 — Job Interview (8판 형식, units/001.mjs 본보기)
// 원본과 다른 점:
//  - 원본 문법 = Reflexive Pronoun(재귀대명사). "Are used when…" 로 주어가 빠진 문장 → 쉬운 규칙 두 줄로 다시 씀
//  - Q3 "What is your expertise" → 물음표 추가, Q4 "Why do you look for a job?" → "Why are you looking for a job?"
//  - Q5 "why should…" · Q9 "what are…" → 첫 글자 대문자, Q10 "Where do you see yourself in five years" → 물음표 추가
//  - Keyword Look(verb) 뜻 "direct one's gaze…" → 질문 뜻(look for = 찾다)에 맞게 바로잡음
//  - Keyword Strength 뜻 "capacity of an object… to withstand force" → 사람의 강점 뜻으로 바로잡음
//  - Keyword See 뜻 "perceive with the eyes" → "see yourself" 뜻(상상하다)을 함께 씀
//  - 대답 틀 "I can see mysefl after five years as a" · "I deal any pressure in the way of" → 문법에 맞게 새로 씀
//  - 쉬운 판(중고생): 회사 면접 대신 «동아리·학생회·봉사단·아르바이트 면접» 으로 답하게 함
export default {
 no: "a002",
 title: "Job Interview",
 book: "SIU ADVANCE 002 - Job interview",
 next: "003 Make Your Point",
 cover: { h1: "The Job", em: "Interview", goals: ["Answer 10 common interview questions", "Talk about your strengths and goals", "Use myself, yourself, himself"] },
 KW: [
  ["yourself", "pronoun", "당신 자신", "you (when you are the one the action is about)"],
  ["company", "noun", "회사", "a business that sells goods or services"],
  ["expertise", "noun", "전문 지식", "special skill or knowledge in one area"],
  ["look for", "verb", "찾다", "to try to find something"],
  ["hire", "verb", "고용하다", "to give someone a job and pay them"],
  ["strength", "noun", "강점, 장점", "a good quality or something you do well"],
  ["weakness", "noun", "약점", "something you are not good at"],
  ["stress", "noun", "스트레스, 압박", "worry caused by a hard situation"],
  ["long-term", "adjective", "장기적인", "lasting or planned for a long time"],
  ["see", "verb", "보다, 상상하다", "to look at; to imagine something in the future"]
 ],
 QS: [
  "Can you tell us something about yourself?",
  "Why do you want to work for this company?",
  "What is your expertise?",
  "Why are you looking for a job?",
  "Why should we hire you?",
  "What are your greatest strengths?",
  "What do you consider to be your weaknesses?",
  "How do you deal with pressure or stressful situations?",
  "What are your long-term goals?",
  "Where do you see yourself in five years?"
 ],
 IMG_E: ["scene-words/16344", "scene-words/18660", "scene-words/21113", "scene-words/18585", "scene-words/20222", "scene-words/19836", "scene-words/18175", "scene-words/18414", "scene-words/17353", "scene-words/18570"],
 IMG_H: ["scene-clips/7495", "scene-words/15096", "scene-words/15040", "scene-words/19993", "scene-clips/7065", "scene-words/17308", "scene-words/21370", "scene-words/13306", "scene-words/15815", "scene-words/18672"],
 PICS: {
  opener: "scene-words/16343",
  talk: "scene-clips/7292",
  group: "scene-words/17399",
  speech: "scene-words/14020",
  reporter: "scene-words/16345",
  survey: "scene-words/18617",
  pron: "scene-words/16172",
  roleB: "scene-words/18159",
  cover: "scene-words/16343",
  back: "scene-words/18160"
 },
 gram1: {
  can: "use myself, yourself, himself",
  title: "Reflexive",
  em: "Pronouns",
  rules: [
   ["Same person", "I taught <b>myself</b> Excel."],
   ["By yourself = alone", "She did it <b>by herself</b>."]
  ],
  hardNote: "myself · yourself · himself · herself · itself · ourselves · themselves",
  say: [
   "We use a reflexive pronoun when the subject and the object are the same person.",
   "I taught myself Excel.",
   "She did it by herself."
  ]
 },
 gram2: {
  can: "ask \"Did you… by yourself?\"",
  cols: ["I · you · we", "he · she · they"],
  rows: [
   ["+", "I introduced <b>myself</b>.", "He prepared <b>himself</b> well."],
   ["−", "We didn't hurt <b>ourselves</b>.", "She doesn't blame <b>herself</b>."],
   ["?", "Did you make it <b>yourself</b>?", "Did they enjoy <b>themselves</b>?"]
  ]
 },
 gapCan: "ask \"What is her strength?\"",
 role: {
  title: "The",
  em: "Interview",
  tail: "Room",
  opener: "Welcome! Please have a seat and tell us about yourself.",
  a: "Interviewer",
  b: "Applicant"
 },
 pron: {
  can: "stress the right syllable",
  title: "Word",
  em: "stress",
  game: "Teacher says a job word → you clap the stress, then use it: <i>\"My STRENGTH is teamwork.\"</i>"
 },
 E: {
  steps: ["Answer", "More"],
  model: [
   ["I'm Jiho. I'm a second-year middle school student.", "I'm friendly and I love science."],
   ["I want to join this club because I love animals.", "I want to help at the animal shelter."],
   ["My expertise is drawing.", "I taught myself to draw cartoons."],
   ["I'm looking for a part-time job to save money.", "I want to buy a new laptop."],
   ["You should choose me because I'm responsible.", "I'm never late for school."],
   ["My greatest strength is teamwork.", "I listen to others in group projects."],
   ["My weakness is speaking in public.", "But I'm practicing every week."],
   ["I deal with stress by exercising.", "I go jogging when I feel stressed."],
   ["My long-term goal is to become a doctor.", "I want to help sick children."],
   ["In five years, I see myself at university.", "I'll be studying medicine."]
  ],
  frame: [
   "I'm ___. I'm ___ and I love ___.",
   "I want to join because I ___.",
   "My expertise is ___. I taught myself to ___.",
   "I'm looking for a job to ___.",
   "You should choose me because I'm ___.",
   "My greatest strength is ___.",
   "My weakness is ___. But I'm ___.",
   "I deal with stress by ___.",
   "My long-term goal is to become a/an ___.",
   "In five years, I see myself ___."
  ],
  bank: [
   ["friendly", "curious", "active", "calm"],
   ["love animals", "like helping", "want to learn", "enjoy teamwork"],
   ["drawing", "coding", "cooking", "video editing"],
   ["save money", "get experience", "meet people", "learn skills"],
   ["responsible", "hard-working", "creative", "honest"],
   ["teamwork", "patience", "leadership", "creativity"],
   ["shyness", "being late", "speaking in public", "practicing"],
   ["exercising", "listening to music", "talking to friends", "sleeping"],
   ["doctor", "engineer", "designer", "teacher"],
   ["at university", "abroad", "in a club", "working"]
  ],
  more: [
   ["What are your hobbies?", "What is your best subject?"],
   ["Which club do you want to join?", "What will you do there?"],
   ["How did you learn it?", "Can you show me?"],
   ["What job would you like?", "How much would you save?"],
   ["Are you a hard worker?", "Can you give an example?"],
   ["Who told you about your strength?", "How does it help you?"],
   ["How will you get better?", "Who can help you?"],
   ["When do you feel stressed?", "What helps you relax?"],
   ["Why do you want that job?", "What will you study?"],
   ["Where will you live?", "What will you do every day?"]
  ],
  gram1: {
   chain: ["I taught myself to ___.", "My friend made ___ by himself/herself."],
   ex: "T: I taught myself to cook.<br>S: I taught myself to swim.<br>T: …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["Did you make it yourself?", "Can you cook by yourself?", "Do you enjoy yourself?", "Did you teach yourself?", "Do you go home by yourself?"],
    ans: "Yes, I … myself. <b>+ one more</b>"
   },
   b: {
    title: "Introduce yourself",
    big: "Let me introduce myself. I'm ___. I taught myself ___.",
    ans: "Then ask: <b>Can you introduce yourself?</b>"
   }
  },
  opener: {
   think: ["Look at the photo. How does the student feel?", "Have you ever had an interview?", "What should you wear to an interview?"]
  },
  convo: [
   ["A", "Hello! Please tell me about yourself."],
   ["B", "I'm {Minji}. I'm fifteen."],
   ["A", "Why do you want to join our club?"],
   ["B", "Because I love {science}."],
   ["A", "What is your greatest strength?"],
   ["B", "I'm {very patient}."],
   ["A", "Great! We'll call you {next week}."]
  ],
  swap: [["your name", "Minji"], ["what you love", "science"], ["your strength", "very patient"], ["when", "next week"]],
  lang: [
   ["Start well", ["Nice to meet you.", "Thank you for having me."]],
   ["Buy time", ["That's a good question.", "Let me think."]],
   ["Finish well", ["Thank you for your time.", "I hope to hear from you."]]
  ],
  langPractice: ["Tell me about yourself.", "What is your strength?", "Why should we choose you?", "What is your weakness?", "What is your goal?", "Do you have any questions?"],
  survey: {
   ask: "Are you",
   cols: ["Me", "My teacher"],
   rows: ["good at teamwork", "shy with new people", "calm under stress", "good with computers", "always on time", "a good leader"],
   q: "Are you …?  → Yes, I am. / No, I'm not.",
   report: "I am ___, but my teacher is ___."
  },
  gap: {
   who: "Sora's interview",
   q: ["What club does Sora want to join?", "What is her strength?", "What is her weakness?", "What is her goal?"],
   A: [["club", "the art club"], ["strength", "?"], ["weakness", "shy"], ["goal", "?"]],
   B: [["club", "?"], ["strength", "creative"], ["weakness", "?"], ["goal", "to be a designer"]],
   tip: "<b>She</b> wants to … · She taught <b>herself</b> …"
  },
  role: {
   A: ["You are the club leader.", "Ask 5 interview questions.", "Choose the best answer."],
   B: ["You want to join a club.", "Choose: science / art / volunteer club.", "Answer with 2 sentences."]
  },
  tts: {
   title: "Make a \"Perfect applicant\" card",
   steps: ["Pick a club or job.", "Ask your teacher 3 questions.", "Choose 3 good qualities.", "Draw it and tell!"],
   lang: ["The perfect applicant is ___.", "He/She can ___ by himself/herself.", "We need someone who ___."]
  },
  speech: {
   time: "1 min",
   model: ["Hello! Let me introduce myself.", "My name is Jiho, and I'm fifteen.", "My greatest strength is teamwork.", "My weakness is that I'm a little shy.", "My goal is to become a doctor.", "Thank you for listening!"],
   outline: ["Hello + your name", "Your strength", "Your weakness", "Your goal", "Thank you!"],
   check: ["Clear voice", "Look at your teacher", "Smile!"]
  },
  pron: {
   cols: [["Oo", ["weakness", "expert", "stressful"]], ["oO", ["myself", "yourself", "succeed"]], ["Ooo", ["company", "interview", "confident"]]],
   up: "Can you work on weekends?",
   down: "Why should we choose you?"
  },
  review: ["I can introduce myself.", "I can talk about my strengths.", "I can use myself / yourself.", "I can say one more sentence."]
 },
 H: {
  steps: ["Answer", "Reason", "Example", "Ask back"],
  model: [
   ["I'm a marketing graduate with two years' experience.", "I enjoy mixing creativity and data.", "At my last job, I grew our followers by 40%.", "Would you like to hear more about that project?"],
   ["I want to join because your company values innovation.", "I want to grow in a place that tries new ideas.", "I read about your new eco-friendly product line.", "What do you look for in new team members?"],
   ["My expertise is digital marketing and data analysis.", "I can turn numbers into clear decisions.", "I taught myself Python to analyze customer data.", "Which skills matter most for this role?"],
   ["I'm looking for a job with more room to grow.", "My current role doesn't have many new challenges.", "I've done the same reports for two years.", "What growth opportunities does this role offer?"],
   ["You should hire me because I get results.", "I'm hard-working and I learn fast.", "I finished a six-month project in four months.", "What results do you expect in the first year?"],
   ["My greatest strength is communication.", "I can explain complex ideas simply.", "I trained ten new staff members at my last job.", "How important is teamwork here?"],
   ["My weakness is that I sometimes take on too much.", "I find it hard to say no.", "Now I use a planner and set clear limits.", "How does your team manage workload?"],
   ["I deal with pressure by breaking big tasks into steps.", "Small steps make a big job less scary.", "Before a launch, I make a checklist and do one item at a time.", "How do you handle stress yourself?"],
   ["My long-term goal is to lead a marketing team.", "I love helping people do their best work.", "I'm taking a leadership course online.", "What does career growth look like here?"],
   ["In five years, I see myself as a team manager.", "By then I'll have more experience and skills.", "I'd like to lead projects in other countries.", "Where do you see this company in five years?"]
  ],
  frame: [
   "I'm a … with … experience. At my last job, …",
   "I want to join because your company … I read …",
   "My expertise is … I taught myself …",
   "I'm looking for a job because … For example, …",
   "You should hire me because I … Once, I …",
   "My greatest strength is … For instance, …",
   "My weakness is … But now I …",
   "I deal with pressure by … Last time, …",
   "My long-term goal is to … because …",
   "In five years, I see myself … because …"
  ],
  more: [
   ["What would friends say about you?", "What's a surprising fact about you?", "Describe yourself in 3 words."],
   ["How much should you know about a company?", "Is a big company better than a startup?", "Would you work for a company you don't admire?"],
   ["Can you become an expert without a degree?", "How long does it take to gain expertise?", "Which skill will be valuable in 10 years?"],
   ["Is it okay to change jobs often?", "Is money the main reason people change jobs?", "What would make you leave a job?"],
   ["What makes an applicant stand out?", "Is confidence more important than skill?", "If you were the boss, who would you hire?"],
   ["Is a strength ever a weakness?", "How do you know your strengths?", "Which strength do you admire in others?"],
   ["Should you be honest about weaknesses?", "Can a weakness become a strength?", "What weakness are you working on now?"],
   ["Is some stress good for us?", "Are jobs more stressful now than before?", "What would you do if you couldn't handle it?"],
   ["Should everyone have a five-year plan?", "Do goals change as we get older?", "What if you never reach your goal?"],
   ["Will your job exist in five years?", "Would you work abroad?", "If you started over, what career would you pick?"]
  ],
  gram1: {
   chain: ["Last year, I taught myself ___.", "I'm proud of myself because ___."],
   ex: "T: Last year, I taught myself to code.<br>S: Last year, I taught myself …<br>T: …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["Did you teach yourself anything?", "Do you enjoy yourself at work?", "Do you push yourself too hard?", "Can you work by yourself?", "Are you proud of yourself?"],
    ans: "Yes, I … myself. / No, … <b>+ why?</b>"
   },
   b: {
    title: "Talk about others",
    big: "My friend taught himself/herself ___. He/She often pushes himself/herself to ___.",
    ans: "Then ask: <b>Who do you know that taught themselves something?</b>"
   }
  },
  opener: {
   think: ["What is the hardest interview question?", "Should you be 100% honest in an interview?", "What makes a great first impression?"]
  },
  convo: [
   ["A", "Thanks for coming in. Please, tell us about yourself."],
   ["B", "Sure. I'm {Hana}, and I studied {design}."],
   ["A", "Great. Why are you looking for a new job?"],
   ["B", "I'd like more chances to lead projects."],
   ["A", "I see. What's your greatest strength?"],
   ["B", "I'm {a quick learner}. I taught myself 3D design."],
   ["A", "Impressive. And your weakness?"],
   ["B", "I'm a perfectionist, but I'm learning to set deadlines."],
   ["A", "Good answer. We'll contact you {by Friday}."]
  ],
  swap: [["your name", "Hana"], ["your major", "design"], ["your strength", "a quick learner"], ["when", "by Friday"]],
  lang: [
   ["Open strongly", ["Thank you for having me.", "I'm excited to be here."]],
   ["Buy time", ["That's a great question.", "Let me think about that."]],
   ["Give proof", ["For example, at my last job …", "One thing I'm proud of is …"]],
   ["Close well", ["Do you have any other questions?", "I look forward to hearing from you."]]
  ],
  langPractice: ["Tell me about yourself.", "Why should we hire you?", "What's your biggest weakness?", "Why did you leave your last job?", "What salary do you expect?", "Do you have any questions for us?"],
  survey: {
   ask: "Are you",
   cols: ["Me", "My teacher", "One more question"],
   rows: ["a morning person", "good under pressure", "a team player", "comfortable with public speaking", "a fast learner", "good at saying no"],
   q: "Are you …? → Yes. → Ask: Can you give an example?",
   report: "My teacher and I are both ___, but only I am ___."
  },
  gap: {
   who: "Daniel, the applicant",
   q: ["What does Daniel do now?", "Why is he looking for a job?", "What is his strength?", "What is his weakness?", "Where does he see himself in 5 years?"],
   A: [["job now", "sales assistant"], ["why looking", "?"], ["strength", "great with customers"], ["weakness", "?"], ["in 5 years", "?"]],
   B: [["job now", "?"], ["why looking", "wants more responsibility"], ["strength", "?"], ["weakness", "too many tasks at once"], ["in 5 years", "running his own store"]],
   tip: "He sees <b>himself</b> … · <b>His</b> strength is …"
  },
  role: {
   A: ["You are a tough interviewer.", "Ask 5 questions + 2 hard follow-ups.", "Decide: hire or not? Explain why."],
   B: ["You are an applicant.", "Choose: designer / nurse / game developer.", "Give reasons and examples. Stay calm!"]
  },
  tts: {
   title: "Write the perfect job ad",
   steps: ["Think: what job do you want to hire for?", "Ask your teacher 4 of today's questions.", "Agree on 3 strengths the person needs.", "Present your job ad in 1 minute."],
   lang: ["We are looking for someone who ___.", "The person should be ___.", "We will hire someone who can ___ by himself/herself."]
  },
  speech: {
   time: "2 min",
   model: ["Good morning. Thank you for having me.", "My name is Hana, and I'm a graphic designer.", "My greatest strength is creativity, backed by data.", "At my last job, my designs raised sales by 20%.", "My weakness is perfectionism.", "Now I set clear deadlines for myself.", "In five years, I see myself leading a design team.", "Thank you. Do you have any questions?"],
   outline: ["Greeting + thanks", "Name + job", "Strength + proof", "Weakness + how you improve", "Five-year goal", "Ask for questions"],
   check: ["Confident voice", "Eye contact", "Real examples", "Answer 1 question"]
  },
  pron: {
   cols: [["Oo", ["weakness", "pressure", "stressful"]], ["oO", ["yourself", "career", "succeed"]], ["oOo", ["position", "impressive", "important"]]],
   up: "Can you start next month?",
   down: "What are your long-term goals?"
  },
  review: ["I can answer in 4 parts.", "I can talk about my strengths and weaknesses.", "I can use reflexive pronouns.", "I can give a 2-minute self-introduction."]
 }
};
