// SIU ADVANCE 009 — Goals and Dreams (8판 형식, 001 본보기)
// 원본과 다른 점:
//  - 문법 제목 "What is a Auxiliary (or Helping) Verbs Verb?" 아래에 자동사(intransitive) 설명이 잘못 붙어 있었음 → 조동사(be·have·do·will) 설명으로 새로 씀
//  - 문법 예문 "Poes Sam write…" → "Does Sam write…"
//  - Q5 "Why most people goal is to earn money?" → "Why is earning money most people's goal?"
//  - Q8 "What was your nicest fantasy dream that you can remember?" → "…the nicest fantasy dream you can remember?"
//  - Q10 "Have you experience sleepwalking?" → "Have you ever experienced sleepwalking?"
//  - Keyword Current 의 품사 표기 깨짐 → adjective, Sleepwalking(verb) → noun, Hope(noun) 뜻을 짧게
//  - 대답 틀 "My current goals for my life is" → "My current goal is …" (수 일치)
export default {
 no: "a009",
 title: "Goals and Dreams",
 book: "SIU ADVANCE 009 - Goals and dreams",
 next: "010 Beauty",
 cover: { h1: "Goals", em: "and Dreams", goals: ["Talk about goals, plans and dreams", "Ask and answer 10 questions", "Use helping verbs: be · have · do · will"] },
 KW: [
  ["current", "adjective", "현재의", "happening or true now"],
  ["plan", "noun", "계획", "a set of steps you decide on to reach something"],
  ["achieve", "verb", "이루다, 성취하다", "to reach a goal by working hard"],
  ["hope", "noun", "희망", "a feeling that you want something good to happen"],
  ["earn", "verb", "(돈을) 벌다", "to get money for the work you do"],
  ["dream", "noun", "꿈, 소망", "something you really want to do or be one day"],
  ["nightmare", "noun", "악몽", "a scary or very bad dream"],
  ["fantasy", "noun", "공상, 환상", "an imagined story or world that is not real"],
  ["déjà vu", "noun", "기시감", "the feeling that you have lived this moment before"],
  ["sleepwalking", "noun", "몽유병, 잠결에 걷기", "walking around while you are asleep"]
 ],
 QS: [
  "What are your current goals in life?",
  "How do you plan to reach your goals?",
  "How would you feel if you failed to achieve one of your goals?",
  "What do you hope to have achieved by the time you're sixty?",
  "Why is earning money most people's goal?",
  "What do you think dreams mean?",
  "What's the worst nightmare you've ever had?",
  "What is the nicest fantasy dream you can remember?",
  "Do you believe in déjà vu?",
  "Have you ever experienced sleepwalking?"
 ],
 IMG_E: ["scene-words/15815", "scene-words/18775", "scene-words/19276", "scene-words/19413", "scene-words/18134", "scene-words/18181", "scene-words/19114", "scene-words/18830", "scene-words/18056", "scene-words/13276"],
 IMG_H: ["scene-words/17317", "scene-words/20024", "scene-words/12751", "scene-words/14621", "scene-words/19626", "scene-words/12605", "scene-words/19114", "scene-words/12959", "scene-words/16787", "scene-words/12417"],
 PICS: {
  opener: "scene-words/18672",
  talk: "scene-words/16799",
  group: "scene-words/10003",
  speech: "scene-words/12053",
  reporter: "scene-words/16345",
  survey: "scene-words/17317",
  pron: "scene-clips/7170",
  roleB: "scene-words/17392",
  cover: "scene-words/12605",
  back: "scene-words/12751"
 },
 gram1: {
  can: "use helping verbs",
  title: "Helping",
  em: "Verbs",
  rules: [
   ["be + -ing / have + -ed", "I <b>am</b> saving money. I <b>have</b> finished my plan."],
   ["do / will", "<b>Do</b> you have a goal? I <b>will</b> reach it."]
  ],
  hardNote: "be · have · do · will + main verb",
  say: [
   "Helping verbs work together with a main verb.",
   "I am saving money. I have finished my plan.",
   "Do you have a goal? I will reach it."
  ]
 },
 gram2: {
  can: "ask with Are you… / Have you… / Do you…",
  cols: ["be · have", "do · will"],
  rows: [
   ["+", "I <b>am</b> studying hard.", "I <b>will</b> travel abroad."],
   ["−", "I <b>haven't</b> decided yet.", "I <b>don't</b> give up easily."],
   ["?", "<b>Have</b> you ever had a nightmare?", "<b>Do</b> you believe in déjà vu?"]
  ]
 },
 gapCan: "ask \"What is she doing…?\"",
 role: {
  title: "The",
  em: "Dream",
  tail: "Coach",
  opener: "Welcome! So, what dream would you like to work on?",
  a: "Dream coach",
  b: "Client"
 },
 pron: {
  can: "say short forms of helping verbs",
  title: "Short forms of",
  em: "helping verbs",
  game: "Teacher says a goal → you answer with a short form: <i>\"I've started. I'm saving. I'll finish soon.\"</i>"
 },
 E: {
  steps: ["Answer", "More"],
  model: [
   ["My current goal is to pass my English test.", "I am studying one hour every day."],
   ["I plan to reach my goals step by step.", "I write a small goal on my calendar every week."],
   ["I would feel sad at first.", "But I would try again, because I don't give up easily."],
   ["I hope I will have traveled to thirty countries.", "I also hope I will have a happy family."],
   ["Most people need money to live.", "Money pays for food, a house and school."],
   ["I think dreams show what we really want.", "My dream is to become a game designer."],
   ["The worst nightmare I have had was about a big monster.", "I woke up and called my mom."],
   ["I once dreamed that I could fly.", "I flew over my school with my friends."],
   ["Yes, I do. It has happened to me.", "I felt I had seen the same classroom before."],
   ["No, I haven't.", "But my little brother has walked in his sleep."]
  ],
  frame: [
   "My current goal is to ___. I am ___ every day.",
   "I plan to reach my goals by ___.",
   "I would feel ___. But I would ___.",
   "I hope I will have ___ by sixty.",
   "Most people need money for ___.",
   "I think dreams show ___. My dream is to ___.",
   "The worst nightmare I have had was about ___.",
   "I once dreamed that I could ___.",
   "Yes, I do. / No, I don't. I felt ___.",
   "Yes, I have. / No, I haven't. ___"
  ],
  bank: [
   ["pass a test", "get fit", "make a team", "read more"],
   ["making a plan", "asking for help", "practicing daily", "taking small steps"],
   ["sad", "upset", "try again", "learn from it"],
   ["traveled a lot", "helped people", "written a book", "built a house"],
   ["food", "a house", "school", "travel"],
   ["our wishes", "our worries", "be a doctor", "be an artist"],
   ["a monster", "being lost", "falling", "a test"],
   ["fly", "breathe underwater", "talk to animals", "be invisible"],
   ["strange", "surprised", "confused", "curious"],
   ["It sounds scary.", "My dad did once.", "I talk in my sleep.", "I sleep well."]
  ],
  more: [
   ["What goal did you have last year?", "Is it a big or small goal?"],
   ["Who helps you with your plans?", "Do you use a calendar?"],
   ["Have you ever failed at something?", "What did you learn?"],
   ["What will you be doing at sixty?", "Where will you live?"],
   ["Is money the most important thing?", "What is more important?"],
   ["What did you dream last night?", "Do you remember your dreams?"],
   ["Do you have nightmares often?", "What do you do after one?"],
   ["What fantasy movie do you like?", "Would you like to live there?"],
   ["When did you feel déjà vu?", "Why do you think it happens?"],
   ["Do you talk in your sleep?", "How many hours do you sleep?"]
  ],
  gram1: {
   chain: ["Right now, I am ___.", "I have already ___, and I will ___."],
   ex: "T: Right now, I am learning to swim.<br>S: Right now, I am saving money.<br>T: I have already …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["Are you saving money?", "Have you made a plan?", "Do you have a dream?", "Will you study abroad?", "Have you ever won a prize?"],
    ans: "Yes, I am / have / do / will. / No, I'm not / haven't / don't / won't. <b>+ one more</b>"
   },
   b: {
    title: "My goal",
    big: "I have ___. Now I am ___. Next year, I will ___.",
    ans: "Then ask: <b>What are you working on now?</b>"
   }
  },
  opener: {
   think: ["Look at the photo. What is she dreaming about?", "What is one goal you have this year?", "What job would you like in the future?"]
  },
  convo: [
   ["A", "What are you doing this summer?"],
   ["B", "I'm {learning to code}. It's my goal this year."],
   ["A", "Cool! Have you started yet?"],
   ["B", "Yes, I have. I practice {every evening}."],
   ["A", "What's your big dream?"],
   ["B", "I want to {make my own game} one day."],
   ["A", "I'm sure you will! My dream is to {be a vet}."]
  ],
  swap: [["your goal", "learning to code"], ["how often", "every evening"], ["your big dream", "make my own game"], ["your partner's dream", "be a vet"]],
  lang: [
   ["Show interest", ["Really?", "That's cool!", "Good for you!"]],
   ["Ask for more", ["How will you do that?", "When did you start?"]],
   ["Encourage", ["You can do it!", "I'm sure you will!"]]
  ],
  langPractice: ["I want to be a singer.", "I failed my math test.", "I'm saving money for a bike.", "I had a scary dream.", "I want to live in London.", "I never give up."],
  survey: {
   ask: "Have you ever",
   cols: ["Me", "My teacher"],
   rows: ["made a plan for a goal", "won a prize", "had a nightmare", "dreamed about flying", "felt déjà vu", "saved money for something"],
   q: "Have you ever …? → Yes, I have. / No, I haven't.",
   report: "I have ___, but my teacher hasn't ___."
  },
  gap: {
   who: "Sora's dream",
   q: ["What is Sora's dream?", "What is she doing now?", "What has she already done?", "What will she do next year?"],
   A: [["dream", "to be a chef"], ["doing now", "?"], ["already done", "won a cooking contest"], ["next year", "?"]],
   B: [["dream", "?"], ["doing now", "taking cooking classes"], ["already done", "?"], ["next year", "work at a restaurant"]],
   tip: "She <b>is</b> taking · She <b>has</b> won · She <b>will</b> work"
  },
  role: {
   A: ["You are a dream coach.", "Ask 5 questions.", "Give one tip for the plan."],
   B: ["You have a big dream.", "Choose: singer / soccer player / scientist.", "Answer with 2 sentences."]
  },
  tts: {
   title: "Make a \"My dream map\"",
   steps: ["Write your big dream in the middle.", "Ask your teacher 3 of today's questions.", "Add 3 small steps to reach it.", "Show your map and tell!"],
   lang: ["My dream is to ___.", "First, I will ___.", "I have already ___."]
  },
  speech: {
   time: "1 min",
   model: ["Hello! Let me tell you about my dream.", "My dream is to become a vet.", "I love animals, and I want to help them.", "Right now, I am studying science hard.", "I have already volunteered at an animal shelter.", "Next year, I will join the science club.", "Thank you!"],
   outline: ["Hello", "Your dream", "Why", "What you are doing now", "What you have done", "Thank you!"],
   check: ["Loud voice", "Look at teacher", "am / have / will"]
  },
  pron: {
   cols: [["be", ["I'm", "you're", "she's"]], ["have", ["I've", "we've", "haven't"]], ["will / do", ["I'll", "won't", "don't"]]],
   up: "Have you ever had a nightmare?",
   down: "What is your dream?"
  },
  review: ["I can talk about goals and dreams.", "I can use am / have / do / will.", "I can ask \"Have you ever …?\"", "I can say one more sentence."]
 },
 H: {
  steps: ["Answer", "Reason", "Example", "Ask back"],
  model: [
   ["Right now, my main goal is to get a job abroad.", "I've always wanted to work in a different culture.", "I'm taking an online course and practicing English daily.", "What goals are you working on?"],
   ["I break big goals into small, clear steps.", "Small steps are easier to measure and keep.", "I have a monthly plan and check it every Sunday.", "How do you keep track of your goals?"],
   ["I'd be disappointed, but I'd try to learn from it.", "Failure shows you what doesn't work.", "I failed my driving test once, then passed.", "How do you handle failure?"],
   ["I hope I'll have traveled widely and raised a happy family.", "That matters more to me than a big title.", "My grandpa traveled after retiring and loved it.", "What about you?"],
   ["I think it's because money gives people security.", "Almost everything in modern life costs money.", "Many young people choose jobs for salary, not passion.", "Do you think money brings happiness?"],
   ["I think dreams mix our memories, fears and wishes.", "Our brain sorts the day while we sleep.", "When I'm stressed, I often dream I'm late for an exam.", "Do you think dreams have hidden meanings?"],
   ["My worst nightmare was being lost in an empty city.", "I felt completely alone and couldn't find anyone.", "I woke up at three a.m. and couldn't sleep again.", "Do you remember a nightmare?"],
   ["I once dreamed I was flying over the ocean.", "It felt so free and peaceful.", "I remember seeing whales below me.", "What's the best dream you've had?"],
   ["Yes, but I don't think it's magic.", "Scientists say it's a small memory glitch.", "Once a new café felt strangely familiar.", "Have you ever felt it?"],
   ["No, I haven't, but my cousin has.", "It often happens when people are stressed.", "He once opened the fridge while asleep!", "Do you know a sleepwalker?"]
  ],
  frame: [
   "Right now, my main goal is … because …",
   "I plan to reach it by … For example, …",
   "I'd feel …, but I'd …",
   "I hope I'll have … because …",
   "I think it's because … For example, …",
   "I think dreams … because … Once, …",
   "My worst nightmare was … I felt …",
   "I once dreamed … It felt …",
   "I do / don't believe in it because …",
   "I have / haven't … It happens when …"
  ],
  more: [
   ["Are long-term or short-term goals more useful?", "Should you tell others your goals?", "What goal would you set if you couldn't fail?"],
   ["Is a plan more important than talent?", "Do plans kill creativity?", "How would you plan a career change?"],
   ["Is failure necessary for success?", "Should parents let children fail?", "What would you do after a big failure?"],
   ["What does a successful life look like at sixty?", "Is it ever too late to start a new goal?", "Would you retire early if you could?"],
   ["Can money buy happiness?", "Would you take a boring job with a high salary?", "How much money is enough?"],
   ["Do dreams predict the future?", "Should we follow our dreams or be practical?", "Would you want to control your dreams?"],
   ["Why do people have nightmares?", "Are nightmares useful in any way?", "Do horror movies cause nightmares?"],
   ["Why do people love fantasy stories?", "Is daydreaming a waste of time?", "Which fantasy world would you live in?"],
   ["How would you explain déjà vu?", "Do you believe in any unexplained events?", "Would you want to see your future?"],
   ["Should you wake a sleepwalker?", "How does stress affect sleep?", "Would you try a sleep-tracking app?"]
  ],
  gram1: {
   chain: ["I've been ___ for ___, and I'm now ___.", "I haven't ___ yet, but I will ___ by ___."],
   ex: "T: I've been learning Spanish for a year, and I'm now reading novels.<br>S: I've been …<br>T: …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["Are you working toward a goal now?", "Have you ever changed a big plan?", "Do you write your goals down?", "Will you study something new this year?", "Have you achieved a goal recently?"],
    ans: "Yes, I am / have / do / will. <b>+ why? + example</b>"
   },
   b: {
    title: "Five years from now",
    big: "I haven't ___ yet, but by then I will have ___. Will you ___?",
    ans: "Then ask: <b>What will you have done by then?</b>"
   }
  },
  opener: {
   think: ["Is it better to have one big dream or many small goals?", "Does money make goals easier to reach?", "What dream have you given up — and why?"]
  },
  convo: [
   ["A", "You seem busy lately. What are you working on?"],
   ["B", "I'm {preparing for a marathon}. It's been my goal for years."],
   ["A", "Wow! Have you run one before?"],
   ["B", "No, I haven't. That's why I'm {training five days a week}."],
   ["A", "Do you think you'll finish?"],
   ["B", "I will. I've already {run twenty kilometers}."],
   ["A", "Impressive. What's your next dream after that?"],
   ["B", "I'd love to {climb Mount Kilimanjaro}."],
   ["A", "Let me know. I might {join you}!"]
  ],
  swap: [["your goal", "preparing for a marathon"], ["your plan", "training five days…"], ["what you've done", "run twenty km"], ["your next dream", "climb Kilimanjaro"]],
  lang: [
   ["Show interest", ["Wow, that's ambitious!", "How did you get into that?", "No way!"]],
   ["Ask about plans", ["How will you do it?", "What's your next step?", "When do you hope to finish?"]],
   ["Talk about progress", ["I've already …", "I'm still …", "I haven't … yet."]],
   ["Encourage", ["You'll get there.", "Keep going!"]]
  ],
  langPractice: ["I quit my job to travel.", "I want to be a millionaire by forty.", "I've never had a real goal.", "I failed the same exam twice.", "I dream in English sometimes.", "I think goals are overrated."],
  survey: {
   ask: "Have you ever",
   cols: ["Me", "My teacher", "One more question"],
   rows: ["set a New Year's goal", "given up on a dream", "changed your career plan", "had the same dream twice", "felt déjà vu", "talked in your sleep"],
   q: "Have you ever …? → Yes. → Ask: When? / Why? / What happened?",
   report: "My teacher and I have both ___, but only I have ___."
  },
  gap: {
   who: "Sora's career plan",
   q: ["What is Sora's dream job?", "What is she doing right now?", "What has she already achieved?", "What hasn't she done yet?", "What will she do next year?"],
   A: [["dream job", "head chef in Paris"], ["right now", "?"], ["achieved", "won a national contest"], ["not yet", "?"], ["next year", "?"]],
   B: [["dream job", "?"], ["right now", "working in a hotel kitchen"], ["achieved", "?"], ["not yet", "learned French"], ["next year", "move to France"]],
   tip: "What <b>is</b> she doing? · <b>Has</b> she …? · What <b>will</b> she …?"
  },
  role: {
   A: ["You are a dream coach.", "Ask 5 questions + 2 follow-ups.", "Make a 3-step plan with will."],
   B: ["You want to follow a big dream.", "Choose: start a business / live abroad / write a book.", "Say what you've done and what you're doing now."]
  },
  tts: {
   title: "Design a \"5-year dream plan\"",
   steps: ["Think: what dream matters most to you?", "Ask your teacher 4 of today's questions.", "Agree on 3 milestones and a deadline.", "Present your plan in 1 minute."],
   lang: ["By ___, I will have ___.", "I've already ___, so next I'll ___.", "The biggest risk is ___, so we'll ___."]
  },
  speech: {
   time: "2 min",
   model: ["Hi everyone. Today I'll talk about my biggest dream.", "I want to open a small bakery by the sea.", "I've loved baking since I was a child.", "Right now, I'm taking a pastry course on weekends.", "I've also been saving money for three years.", "I haven't found a location yet, but I'm looking.", "By thirty-five, I hope I'll have opened it.", "Thanks for listening! Any questions?"],
   outline: ["Hook — \"Today I'll talk about…\"", "Your dream + why", "What you're doing now", "What you've already done", "What you haven't done yet", "Ask for questions"],
   check: ["Clear voice", "Eye contact", "Helping verbs", "Answer 1 question"]
  },
  pron: {
   cols: [["be", ["I'm", "she's", "they're"]], ["have", ["I've", "she's done", "hasn't"]], ["will / do", ["I'll", "won't", "doesn't"]]],
   up: "Have you achieved your goal?",
   down: "How will you reach it?"
  },
  review: ["I can answer in 4 parts.", "I can use be / have / do / will.", "I can talk about progress and plans.", "I can give a short presentation."]
 }
};
