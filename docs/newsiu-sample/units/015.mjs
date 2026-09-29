// SIU BASIC 015 — Habits (8판 형식, 001 본보기)
// 원본과 다른 점:
//  - 문법 예문 "You're driving too fast, you're going to hit the car" (be going to) → will 단원이라 will 예문으로 바꿈
//  - 문법 예문 "for request promising. I'm afraid we will be late." 줄이 뒤섞여 있어 쓰임(약속·결심·예측) 두 줄로 정리
//  - Q4 "Do you think fishing is a boring habit?" → "…a boring hobby?" (낚시는 습관이 아니라 취미)
//  - Keyword Sleep(verb) 의 뜻이 명사 뜻이었음 → 동사 뜻으로 바로잡음
//  - Keyword Late(adv) 뜻 "something that happens or Someone that arrives…" → "after the usual or expected time"
//  - 대답 틀 "A: Eating while eating are good habits" → 쉬운 판 틀로 새로 씀
export default {
 no: "015",
 title: "Habits",
 book: "SIU BASIC 015 - Habits",
 next: "016 I Would Like To",
 cover: { h1: "Good", em: "Habits", goals: ["Talk about good and bad habits", "Ask and answer 10 questions", "Make promises with will"] },
 KW: [
  ["habit", "noun", "습관", "something you do often, almost without thinking"],
  ["stop", "verb", "멈추다, 그만두다", "to finish doing something"],
  ["eat", "verb", "먹다", "to put food in your mouth and swallow it"],
  ["fishing", "noun", "낚시", "catching fish for food or for fun"],
  ["sleep", "verb", "자다", "to rest with your eyes closed"],
  ["improve", "verb", "향상시키다", "to make something better"],
  ["late", "adverb", "늦게", "after the usual or expected time"],
  ["easy", "adjective", "쉬운", "not hard to do"],
  ["successful", "adjective", "성공한", "getting what you worked for"],
  ["develop", "verb", "기르다, 발전시키다", "to grow or make something stronger over time"]
 ],
 QS: [
  "What are good habits to have?",
  "How can you stop bad habits?",
  "What are good and bad eating habits?",
  "Do you think fishing is a boring hobby?",
  "Do you sleep in class?",
  "What are some habits that can improve your English?",
  "Is always coming late a bad habit?",
  "Is it easy to get rid of a bad habit?",
  "What habits should you have to be successful?",
  "How can you develop a good habit?"
 ],
 IMG_E: ["scene-words/17235", "scene-words/17261", "scene-words/12383", "scene-words/14343", "scene-words/13341", "scene-words/17179", "scene-words/17164", "scene-words/18903", "scene-words/17260", "scene-words/17341"],
 IMG_H: ["scene-words/17341", "scene-words/17269", "scene-words/17258", "scene-words/14343", "scene-words/16757", "scene-words/17179", "scene-words/17164", "scene-words/18903", "scene-words/15743", "scene-words/15027"],
 PICS: {
  opener: "scene-words/18944",
  talk: "scene-clips/7477",
  group: "scene-words/18775",
  speech: "scene-words/12053",
  reporter: "scene-words/16345",
  survey: "scene-words/18588",
  pron: "scene-words/16300",
  roleB: "scene-words/17269",
  cover: "scene-words/19206",
  back: "scene-words/12383"
 },
 gram1: {
  can: "make promises with will",
  title: "Simple",
  em: "Future",
  rules: [
   ["Decide now", "I'm tired. I <b>will</b> go to bed early."],
   ["Guess", "Winter <b>will</b> come soon."]
  ],
  hardNote: "tomorrow · soon · later · next week · in June",
  say: [
   "We use will for decisions, promises and guesses about the future.",
   "I'm tired. I will go to bed early.",
   "Winter will come soon."
  ]
 },
 gram2: {
  can: "ask \"Will you…?\"",
  cols: ["Promise / decision", "Guess"],
  rows: [
   ["+", "I <b>will</b> read every day.", "It <b>will</b> be easy."],
   ["−", "I <b>won't</b> eat junk food.", "It <b>won't</b> be hard."],
   ["?", "<b>Will</b> you exercise tomorrow?", "<b>Will</b> it rain soon?"]
  ]
 },
 gapCan: "ask \"What will he do…?\"",
 role: {
  title: "The",
  em: "Habit",
  tail: "Coach",
  opener: "Hi! Which habit would you like to change?",
  a: "Habit coach",
  b: "Client"
 },
 pron: {
  can: "say I'll and won't clearly",
  title: "Short forms of",
  em: "will",
  game: "Teacher says a habit → you make a promise with a short form: <i>\"I'll drink more water. I won't skip breakfast.\"</i>"
 },
 E: {
  steps: ["Answer", "More"],
  model: [
   ["Brushing my teeth is a good habit.", "I brush them three times a day."],
   ["I can stop by making a plan.", "My mom can help me, too."],
   ["Eating vegetables is a good habit.", "Eating candy every day is a bad habit."],
   ["No, I don't think so.", "Fishing is fun with my dad."],
   ["No, I don't.", "I go to bed early."],
   ["Reading English books helps.", "I also watch English cartoons."],
   ["Yes, it is.", "My friends have to wait for me."],
   ["No, it isn't easy.", "It takes a long time."],
   ["You should work hard.", "You should also sleep well."],
   ["I will do it every day.", "I will check my chart."]
  ],
  frame: [
   "___ is a good habit. I ___ every day.",
   "I can stop by ___.",
   "Eating ___ is good. Eating ___ is bad.",
   "Yes, I do. / No, I don't. Fishing is ___.",
   "Yes, I sometimes do. / No, I don't. I ___.",
   "___ helps my English.",
   "Yes, it is. / No, it isn't. ___",
   "Yes / No. It is ___.",
   "You should ___.",
   "I will ___ every day."
  ],
  bank: [
   ["Brushing teeth", "Reading", "Saving money", "Exercising"],
   ["making a plan", "asking for help", "trying again", "starting small"],
   ["vegetables", "fruit", "candy", "late at night"],
   ["boring", "fun", "quiet", "relaxing"],
   ["go to bed early", "listen", "take notes", "drink water"],
   ["Reading books", "Watching cartoons", "Singing songs", "Talking"],
   ["friends wait", "it's rude", "you miss things", "people worry"],
   ["hard", "not easy", "easy", "slow"],
   ["work hard", "sleep well", "read books", "be kind"],
   ["read", "exercise", "practice", "write"]
  ],
  more: [
   ["What good habit do you have?", "When do you do it?"],
   ["What bad habit do you have?", "Who can help you?"],
   ["What do you eat for breakfast?", "Do you eat snacks at night?"],
   ["Have you ever gone fishing?", "What is a boring hobby for you?"],
   ["What time do you go to bed?", "Do you feel sleepy in class?"],
   ["What English books do you like?", "How often do you practice?"],
   ["Are you ever late?", "Why are people late?"],
   ["What habit is hard to stop?", "Did you ever stop a habit?"],
   ["Who is a successful person?", "What habits do they have?"],
   ["What habit will you start?", "When will you start?"]
  ],
  gram1: {
   chain: ["Tomorrow, I will ___.", "I won't ___ anymore."],
   ex: "T: Tomorrow, I will drink more water.<br>S: Tomorrow, I will read a book.<br>T: I …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["Will you read?", "Will you run?", "Will you eat fruit?", "Will you sleep early?", "Will you play games?"],
    ans: "Yes, I will. / No, I won't. <b>+ one more sentence</b>"
   },
   b: {
    title: "My promise",
    big: "Next week, I will ___. I won't ___.",
    ans: "Then ask: <b>What will you do next week?</b>"
   }
  },
  opener: {
   think: ["Look at the photo. What is he doing?", "What do you do every morning?", "What is one good habit you have?"]
  },
  convo: [
   ["A", "You look tired. What's wrong?"],
   ["B", "I {played games} until late."],
   ["A", "Oh no! That's a bad habit."],
   ["B", "I know. I will stop."],
   ["A", "What will you do instead?"],
   ["B", "I will {read a book} before bed."],
   ["A", "Good idea! I will {go to bed early}, too."]
  ],
  swap: [["a bad habit", "played games"], ["a good habit", "read a book"], ["your partner's promise", "go to bed early"], ["how you feel", "tired"]],
  lang: [
   ["Show interest", ["Really?", "Good idea!", "Me too!"]],
   ["Ask back", ["How about you?", "What will you do?"]],
   ["Make a promise", ["I will …", "I won't …"]]
  ],
  langPractice: ["I eat candy every day.", "I go to bed at 11.", "I read every night.", "I'm always late.", "I brush my teeth after lunch.", "I play games for 3 hours."],
  survey: {
   ask: "Do you",
   cols: ["Me", "My teacher"],
   rows: ["eat breakfast every day", "brush your teeth after lunch", "go to bed before 10", "read every day", "exercise every week", "eat snacks at night"],
   q: "Do you …?  → Yes, I do. / No, I don't.",
   report: "I ___, but my teacher ___."
  },
  gap: {
   who: "Jun's plan",
   q: ["What will Jun do in the morning?", "What will he eat?", "What will he stop?", "When will he go to bed?"],
   A: [["morning", "run in the park"], ["eat", "?"], ["stop", "eating candy"], ["bedtime", "?"]],
   B: [["morning", "?"], ["eat", "more fruit"], ["stop", "?"], ["bedtime", "at 9 o'clock"]],
   tip: "He <b>will</b> run · He <b>won't</b> eat candy"
  },
  role: {
   A: ["You are a habit coach.", "Ask 5 questions.", "Give one tip."],
   B: ["You have a bad habit.", "Choose: late to bed / too much candy / always late.", "Answer with 2 sentences."]
  },
  tts: {
   title: "Make a \"My habit chart\"",
   steps: ["Pick 3 good habits.", "Ask your teacher. Answer, too.", "Choose one habit to start.", "Draw your chart and tell!"],
   lang: ["I will ___ every day.", "My teacher will ___.", "We will both ___."]
  },
  speech: {
   time: "1 min",
   model: ["Hello! Let me tell you about my habits.", "I have a good habit. I read every night.", "I have a bad habit, too.", "I eat candy every day.", "From now on, I will eat fruit instead.", "Thank you!"],
   outline: ["Hello", "One good habit", "One bad habit", "Your promise (I will …)", "Thank you!"],
   check: ["Loud voice", "Look at teacher", "Use will"]
  },
  pron: {
   cols: [["I will → I'll", ["I'll", "you'll", "we'll"]], ["will not", ["won't", "won't eat", "won't stop"]], ["want ≠ won't", ["want", "won't", "wants"]]],
   up: "Will you read tonight?",
   down: "What will you do tomorrow?"
  },
  review: ["I can talk about habits.", "I can use will / won't.", "I can ask \"Will you …?\"", "I can say one more sentence."]
 },
 H: {
  steps: ["Answer", "Reason", "Example", "Ask back"],
  model: [
   ["I think getting up early is one of the best habits.", "It gives you quiet time before the day gets busy.", "I get up at six and read for twenty minutes.", "What good habit are you proud of?"],
   ["You can stop a bad habit by finding what triggers it.", "If you know the trigger, you can avoid it.", "I used to check my phone in bed, so now I charge it in the kitchen.", "How did you stop a bad habit?"],
   ["Eating slowly and eating vegetables are good habits.", "Skipping breakfast and snacking late at night are bad ones.", "I used to skip breakfast, and I felt tired all morning.", "What are your eating habits like?"],
   ["No, I don't think fishing is boring.", "It's relaxing and it teaches you patience.", "My uncle and I once waited three hours and caught one fish.", "Would you try fishing?"],
   ["I sometimes feel sleepy, but I try not to sleep.", "If I sleep, I miss important things.", "When I get sleepy, I drink water or stretch a little.", "Did you ever fall asleep in class?"],
   ["Watching shows with English subtitles really helps.", "You hear how people speak naturally.", "I watch one episode a day and write down five new words.", "How do you practice English?"],
   ["Yes, I think it's a bad habit.", "It shows you don't respect other people's time.", "My friend is always late, so now I tell him an earlier time.", "How do you feel when someone is late?"],
   ["No, I don't think it's easy.", "Habits are automatic, so you do them without thinking.", "It took me two months to stop biting my nails.", "What habit was hardest for you to break?"],
   ["Successful people plan their day and keep learning.", "Small daily habits add up over time.", "My aunt reads a book a month, and she runs a company.", "Who do you think is successful?"],
   ["You can develop a good habit by starting small.", "Small goals are easier to keep every day.", "I will start with five push-ups a day, not fifty.", "What habit will you start this month?"]
  ],
  frame: [
   "I think … is a good habit because …",
   "You can stop a bad habit by … For example, …",
   "… is a good habit, but … is a bad one because …",
   "I think fishing is … because … Once, …",
   "I sometimes / never … because …",
   "… can improve your English because …",
   "I think it is / isn't … because …",
   "I think it is / isn't easy because … It took me …",
   "I think successful people … because …",
   "You can develop a habit by … I will …"
  ],
  more: [
   ["How long does it take to form a habit?", "Are habits more important than talent?", "What habit would change your life most?"],
   ["Why are bad habits so hard to stop?", "Is it better to stop at once or slowly?", "Can other people help you stop a habit?"],
   ["Is fast food always unhealthy?", "Should schools ban junk food?", "How are Korean eating habits changing?"],
   ["What hobby do you find boring? Why?", "Do you prefer active or quiet hobbies?", "Will you try a new hobby this year?"],
   ["How many hours of sleep do you need?", "Should school start later?", "Do phones hurt our sleep?"],
   ["What English habit will you start tomorrow?", "Is studying every day better than studying a lot once?", "Which app or show helps you most?"],
   ["Is being late ever okay?", "Are some cultures more relaxed about time?", "Will you be on time for everything this week?"],
   ["What makes a habit stick?", "Can you replace a bad habit with a good one?", "Will technology make habits easier to change?"],
   ["What does success mean to you?", "Is luck more important than habits?", "What habit will you need in five years?"],
   ["How do you stay motivated?", "Should you reward yourself?", "What will you do if you miss a day?"]
  ],
  gram1: {
   chain: ["From now on, I will ___ because ___.", "I won't ___ anymore — it ___."],
   ex: "T: From now on, I will walk to work because I need exercise.<br>S: From now on, I will …<br>T: …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["Will you wake up early tomorrow?", "Will you exercise this weekend?", "Will you cook dinner tonight?", "Will you read before bed?", "Will you use your phone less?"],
    ans: "Yes, I will. / No, I won't. <b>+ why?</b>"
   },
   b: {
    title: "Guess the future",
    big: "In ten years, people will ___, but they won't ___. Will you ___?",
    ans: "Then ask: <b>What will change most?</b>"
   }
  },
  opener: {
   think: ["Which daily habit has the biggest effect on your life?", "Are habits a choice or just automatic?", "What will you do differently tomorrow?"]
  },
  convo: [
   ["A", "You look exhausted. Are you okay?"],
   ["B", "Not really. I was {on my phone} until two a.m."],
   ["A", "Again? That's becoming a habit."],
   ["B", "I know. I really need to stop."],
   ["A", "What will you do about it?"],
   ["B", "I'll {leave my phone in the kitchen} at night."],
   ["A", "That's a smart plan. Will you stick to it?"],
   ["B", "I'll try. Maybe I'll {read a book} instead."],
   ["A", "Good idea. I'll {check on you} next week!"]
  ],
  swap: [["a bad habit", "on my phone"], ["your plan", "leave my phone…"], ["a better habit", "read a book"], ["a friend's promise", "check on you"]],
  lang: [
   ["Show concern", ["Are you okay?", "That sounds tough.", "Again?"]],
   ["Ask about plans", ["What will you do?", "How will you do that?", "When will you start?"]],
   ["Make a promise", ["I'll …", "I won't … anymore.", "I promise."]],
   ["Encourage", ["You can do it!", "That's a smart plan."]]
  ],
  langPractice: ["I skip breakfast every day.", "I always check my phone in bed.", "I'm going to start running.", "I bite my nails.", "I study best at night.", "I never exercise."],
  survey: {
   ask: "Do you",
   cols: ["Me", "My teacher", "One more question"],
   rows: ["get up before seven", "skip breakfast", "check your phone in bed", "exercise every week", "arrive early", "plan your day"],
   q: "Do you …? → Yes. → Ask: Why? / How often? / Will you change it?",
   report: "My teacher and I both ___, but only I ___."
  },
  gap: {
   who: "Jun's 30-day plan",
   q: ["What habit will Jun start?", "What will he stop doing?", "How will he remember?", "Who will help him?", "What will he do if he fails?"],
   A: [["start", "running 10 minutes"], ["stop", "?"], ["remember", "a chart on the fridge"], ["helper", "?"], ["if he fails", "?"]],
   B: [["start", "?"], ["stop", "late-night snacks"], ["remember", "?"], ["helper", "his older sister"], ["if he fails", "start again the next day"]],
   tip: "What <b>will</b> he …? · He <b>won't</b> …"
  },
  role: {
   A: ["You are a habit coach.", "Ask 5 questions + 2 follow-ups.", "Make a 3-step plan with will."],
   B: ["You want to change a habit.", "Choose: phone / snacks / always late.", "Give reasons. Promise 2 things with will."]
  },
  tts: {
   title: "Design a \"30-day habit challenge\"",
   steps: ["Think: which habit would help most?", "Ask your teacher 4 of today's questions.", "Agree on one habit and 3 rules.", "Present your challenge in 1 minute."],
   lang: ["I think we should ___ because ___.", "We will ___, and we won't ___.", "If we miss a day, we'll ___."]
  },
  speech: {
   time: "2 min",
   model: ["Hi everyone. Today I'll talk about my habits.", "I have a good habit: I read every night before bed.", "It helps me relax, and I learn new things.", "But I also have a bad habit. I check my phone too much.", "Last week I used it for six hours a day!", "So from now on, I'll leave my phone in the kitchen at night.", "I think small changes will make a big difference.", "Thanks for listening! Any questions?"],
   outline: ["Hook — \"Today I'll talk about…\"", "One good habit + why", "One bad habit + example", "Your plan with will", "What you think will happen", "Ask for questions"],
   check: ["Clear voice", "Eye contact", "will / won't", "Answer 1 question"]
  },
  pron: {
   cols: [["I will → I'll", ["I'll", "she'll", "they'll"]], ["will not", ["won't", "won't skip", "won't forget"]], ["want ≠ won't", ["I want to", "I won't", "we want"]]],
   up: "Will you stick to it?",
   down: "What habit will you start?"
  },
  review: ["I can answer in 4 parts.", "I can use will / won't.", "I can make a plan to change a habit.", "I can give a short presentation."]
 }
};
