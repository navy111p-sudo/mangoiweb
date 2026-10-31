// SIU ADVANCE 013 — Education (8판 형식, 001 본보기)
// 원본과 다른 점:
//  - Q1 "What are the qualities of a teacher?" → "…of a good teacher?" (대답 틀이 "good teacher" 라 맞춤)
//  - Q3·Q10 첫 글자 OCR 오류(Po/Pid) → Do/Did, Q4 소문자·물음표 빠짐 → 대문자·물음표
//  - 대답 틀 "The qualities of a good teacher is" → are, "I'm good at subject but im bad at" → 새 틀, "I skip class when / I never tried skiping class" → 새 틀
//  - Keyword Bad(adv) → adjective(형용사), Skip(verb) 뜻 «깡충깡충 뛰다» → «빼먹다»(수업을 빠지다) 뜻으로 바로잡음
//  - Keyword Walk(verb) 뜻이 명사 뜻(an act of traveling on foot)이었음 → 동사 뜻으로
//  - 쉬운 판(중고등): Q4 성교육은 «몸 건강·안전·존중을 배우는 수업» 으로만 다룸(세부 없음), Q8 부정행위는 «규칙·공정함» 으로만 답함
export default {
 no: "a013",
 title: "Education",
 book: "SIU ADVANCE 013 - Education",
 next: "014 Entertainment",
 cover: { h1: "Talking about", em: "Education", goals: ["Talk about school life and learning", "Ask and answer 10 questions", "Say where things happen"] },
 KW: [
  ["qualities", "noun", "자질, 특성", "the good features that make a person special"],
  ["prefer", "verb", "선호하다", "to like one thing more than another"],
  ["funny", "adjective", "웃기는, 재미있는", "making you laugh"],
  ["agree", "verb", "동의하다", "to have the same opinion as someone"],
  ["smart", "adjective", "똑똑한", "quick at learning and understanding things"],
  ["bad", "adjective", "서투른, 못하는", "not good at doing something"],
  ["grade", "noun", "성적, 점수", "a letter or number that shows how well you did"],
  ["exam", "noun", "시험", "a formal test of what you know"],
  ["skip", "verb", "빼먹다, 거르다", "to not go to or not do something you should"],
  ["walk", "verb", "걷다", "to move along on foot"]
 ],
 QS: [
  "What are the qualities of a good teacher?",
  "Do you prefer public or private schools?",
  "Do you have any funny school stories?",
  "Do you agree with sex education in school?",
  "Are girls smarter than boys?",
  "What subjects were you good and bad at?",
  "Were good grades important to you?",
  "Have you ever cheated on an exam?",
  "Did you skip class very often?",
  "Did you ride a bus or walk to school?"
 ],
 IMG_E: ["scene-words/18948", "scene-words/16456", "scene-words/18022", "scene-words/18552", "scene-words/12418", "scene-words/19258", "scene-words/18465", "scene-words/18551", "scene-words/12849", "scene-words/16122"],
 IMG_H: ["scene-words/12229", "scene-words/16301", "scene-words/16508", "scene-words/17285", "scene-words/19451", "scene-words/18420", "scene-words/18465", "scene-words/17151", "scene-words/18535", "scene-words/16553"],
 PICS: {
  opener: "scene-clips/7011",
  talk: "scene-clips/7477",
  group: "scene-words/17285",
  speech: "scene-words/15095",
  reporter: "scene-words/16681",
  survey: "scene-words/16384",
  pron: "scene-words/16636",
  roleB: "scene-clips/7072",
  cover: "scene-words/16384",
  back: "scene-words/18131"
 },
 gram1: {
  can: "say where things happen",
  title: "Adverbs of",
  em: "Place",
  rules: [
   ["Where?", "Please put your bag <b>here</b>."],
   ["How far? / Which way?", "My school is <b>nearby</b>. We ran <b>outside</b>."]
  ],
  hardNote: "here · there · nearby · far away · abroad · upstairs · outside · everywhere",
  say: [
   "Adverbs of place tell us where something happens.",
   "They usually come after the verb or the object.",
   "Please put your bag here.",
   "My school is nearby."
  ]
 },
 gram2: {
  can: "ask \"Where…?\" and answer with a place word",
  cols: ["Where it is", "Where it goes"],
  rows: [
   ["+", "The library is <b>upstairs</b>.", "We went <b>outside</b> at lunch."],
   ["−", "My school isn't <b>nearby</b>.", "I didn't go <b>abroad</b>."],
   ["?", "Is the gym <b>downstairs</b>?", "<b>Where</b> did you study? — <b>At home</b>."]
  ]
 },
 gapCan: "ask \"Where does she…?\"",
 role: {
  title: "The",
  em: "School",
  tail: "Counselor",
  opener: "Hi! Let's talk about your school life. How is it going?",
  a: "School counselor",
  b: "Student"
 },
 pron: {
  can: "stress the important words",
  title: "Stress the",
  em: "place word",
  game: "Teacher asks \"Where…?\" → you answer and stress the place: <i>\"I study UPSTAIRS. I left it OVER THERE.\"</i>"
 },
 E: {
  steps: ["Answer", "More"],
  model: [
   ["A good teacher is patient and kind.", "She explains things again when we don't understand."],
   ["I prefer public schools.", "They are close to home and my friends go there."],
   ["Yes, I do. My friend fell asleep in class.", "He woke up and shouted \"Present!\""],
   ["Yes, I agree with it.", "We should learn to keep our bodies safe."],
   ["No, I don't think so.", "Everyone is smart in different ways."],
   ["I'm good at math, but I'm bad at history.", "I can't remember all the dates."],
   ["Yes, they are important to me.", "Good grades help me get into a good high school."],
   ["No, I haven't.", "Cheating is unfair to the students who study hard."],
   ["No, I never skip class.", "If I miss one class, I fall behind."],
   ["I ride a bus to school.", "The bus stop is nearby, so it's easy."]
  ],
  frame: [
   "A good teacher is ___ and ___.",
   "I prefer ___ schools because ___.",
   "Yes, I do. Once, ___. / No, I don't.",
   "Yes, I agree. Students should learn ___.",
   "I think ___ because everyone is ___.",
   "I'm good at ___, but I'm bad at ___.",
   "Yes / No. Good grades ___.",
   "No, I haven't. Cheating is ___.",
   "No, I never ___. / Sometimes, when ___.",
   "I ___ to school. It takes ___ minutes."
  ],
  bank: [
   ["patient", "kind", "funny", "fair"],
   ["public", "private", "close to home", "cheaper"],
   ["fell asleep", "forgot my bag", "laughed loudly", "wore the wrong shoes"],
   ["about health", "about safety", "respect", "body care"],
   ["girls are smarter", "boys are smarter", "no one is smarter", "smart in different ways"],
   ["math", "English", "science", "history"],
   ["help me", "make me proud", "aren't everything", "open doors"],
   ["unfair", "wrong", "against the rules", "not honest"],
   ["skip class", "miss a lesson", "I feel sick", "I have a doctor's visit"],
   ["ride a bus", "walk", "ride a bike", "go by subway"]
  ],
  more: [
   ["Who is your favorite teacher?", "What makes a teacher boring?"],
   ["Do you wear a school uniform?", "What is good about your school?"],
   ["Who is the funniest person in your class?", "Do teachers ever make you laugh?"],
   ["What health lessons do you have?", "What else should schools teach?"],
   ["Who is the smartest person you know?", "Can you become smarter?"],
   ["What is your favorite subject?", "Which subject is hardest?"],
   ["How do you study for tests?", "Who helps you with homework?"],
   ["What should a teacher do about cheating?", "How do you feel before an exam?"],
   ["Is it okay to miss class when you're sick?", "What do you do if you miss a lesson?"],
   ["How long does it take?", "Who do you go to school with?"]
  ],
  gram1: {
   chain: ["I study ___ (where?).", "My ___ is nearby / far away."],
   ex: "T: I study in the library.<br>S: I study at home.<br>T: My bank is nearby. S: …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["Is your school nearby?", "Do you study at home?", "Is the library upstairs?", "Do you eat lunch outside?", "Have you been abroad?"],
    ans: "Yes, it is. / No, it's far away. <b>+ one more sentence</b>"
   },
   b: {
    title: "My school map",
    big: "The gym is ___. The library is ___. My classroom is ___.",
    ans: "Then ask: <b>Where is the … in your school?</b>"
   }
  },
  opener: {
   think: ["Look at the photo. What are the students doing?", "What do you like most about school?", "What makes a class fun?"]
  },
  convo: [
   ["A", "How was school today?"],
   ["B", "It was great! We had {science} outside."],
   ["A", "Outside? That sounds fun!"],
   ["B", "Yes! Our teacher is really {funny}."],
   ["A", "Lucky you. My {math} class is so hard."],
   ["B", "I can help you. Let's study {in the library}."],
   ["A", "Thanks! Is it nearby?"],
   ["B", "Yes, it's just upstairs."]
  ],
  swap: [["a subject", "science"], ["a word for a teacher", "funny"], ["a hard subject", "math"], ["a place to study", "in the library"]],
  lang: [
   ["Show interest", ["Really?", "That sounds fun!", "Lucky you!"]],
   ["Ask back", ["How about you?", "Where do you study?"]],
   ["Offer help", ["I can help you.", "Let's study together."]]
  ],
  langPractice: ["I got an A in English.", "I hate math.", "I walk to school.", "My teacher is very strict.", "I study in the library.", "I fell asleep in class!"],
  survey: {
   ask: "Do you",
   cols: ["Me", "My teacher"],
   rows: ["walk to school", "study at home", "like group projects", "wear a uniform", "study in a library", "like exams"],
   q: "Do you …?  → Yes, I do. / No, I don't.",
   report: "I ___, but my teacher ___."
  },
  gap: {
   who: "Sora's school",
   q: ["Where does Sora study?", "How does she go to school?", "What is she good at?", "Where does she eat lunch?"],
   A: [["studies", "in the library"], ["goes to school", "?"], ["good at", "science"], ["eats lunch", "?"]],
   B: [["studies", "?"], ["goes to school", "by bus"], ["good at", "?"], ["eats lunch", "outside"]],
   tip: "Where <b>does</b> she study? · She studies <b>upstairs</b>."
  },
  role: {
   A: ["You are a school counselor.", "Ask 5 questions about school.", "Give one tip."],
   B: ["You are a student.", "Choose: bad at math / always tired / new school.", "Answer with 2 sentences."]
  },
  tts: {
   title: "Plan \"My dream school\"",
   steps: ["Think of 3 things your dream school has.", "Ask your teacher. Answer, too.", "Choose the best idea together.", "Draw a map and tell!"],
   lang: ["The library is ___.", "In my dream school, we ___.", "My teacher wants ___."]
  },
  speech: {
   time: "1 min",
   model: ["Hello! Let me tell you about my school.", "My school is nearby, so I walk there.", "My favorite subject is science.", "I'm bad at history, but I try hard.", "My best teacher is kind and funny.", "Thank you!"],
   outline: ["Hello", "Where your school is", "Good / bad subject", "Your best teacher", "Thank you!"],
   check: ["Loud voice", "Look at teacher", "Use a place word"]
  },
  pron: {
   cols: [["Place words", ["HERE", "THERE", "NEARby"]], ["Two words", ["far aWAY", "upSTAIRS", "outSIDE"]], ["In a sentence", ["I study HERE.", "It's upSTAIRS.", "Go outSIDE."]]],
   up: "Is your school nearby?",
   down: "Where do you study?"
  },
  review: ["I can talk about school.", "I can use here / there / nearby.", "I can ask \"Where …?\"", "I can say one more sentence."]
 },
 H: {
  steps: ["Answer", "Reason", "Example", "Ask back"],
  model: [
   ["I think patience is the most important quality.", "Students learn at different speeds.", "My English teacher once explained a rule five times.", "What quality do you value most in a teacher?"],
   ["Honestly, I prefer public schools.", "They mix students from all kinds of backgrounds.", "There I made friends from very different families.", "Which do you think is better?"],
   ["Yes, I have one I still laugh about.", "Our teacher tried a science experiment that went wrong.", "The foam overflowed and covered his shoes.", "What's the funniest thing that happened in your class?"],
   ["Yes, I agree with it.", "Teens need real facts, not internet rumors.", "Good programs also teach consent and respect.", "At what age do you think it should start?"],
   ["No, I don't think either is smarter.", "Differences come from how we're raised, not from gender.", "In my class the top students were half girls and half boys.", "Do you think teachers treat them differently?"],
   ["I was good at English but bad at chemistry.", "I loved languages, but formulas never stuck.", "I once mixed up two chemicals and failed a lab test.", "Which subject gave you the most trouble?"],
   ["Yes, they were very important to me.", "In Korea, grades decide which university you get into.", "I studied until midnight for most of high school.", "Do you think grades show real ability?"],
   ["I'll admit I once looked at a friend's answer.", "I panicked because I hadn't studied.", "I felt so guilty that I never did it again.", "Why do you think students cheat?"],
   ["No, I hardly ever skipped class.", "My parents would have been really upset.", "I only skipped once to watch a baseball final.", "Were you a rule-breaker at school?"],
   ["I walked to school most days.", "It was only ten minutes away.", "On rainy days my dad drove me there instead.", "How did you get to school?"]
  ],
  frame: [
   "… matters most because …",
   "I prefer … schools because … For example, …",
   "Yes — once, … / Not really, but …",
   "I agree / disagree because … It should start …",
   "I don't think … because … In my class, …",
   "I was good at … but bad at … because …",
   "Grades were / weren't important because …",
   "I'll admit … / No, never, because …",
   "I hardly ever / sometimes … because …",
   "I rode / walked … It took … On rainy days, …"
  ],
  more: [
   ["Can a strict teacher also be a good teacher?", "Are good teachers born or made?", "If you were a teacher, what would you do differently?"],
   ["Should private schools get government money?", "Is homeschooling a good option?", "Would you send your children abroad to study?"],
   ["Is humor important in the classroom?", "Should teachers be friends with students?", "What would make school more fun?"],
   ["Who should teach it — parents or schools?", "What else should schools teach about health?", "Is the internet a good teacher on this topic?"],
   ["Do girls and boys learn differently?", "Should schools be single-sex?", "Is intelligence mostly genes or environment?"],
   ["Why do we like some subjects more?", "Should students choose all their subjects?", "What subject is missing from schools?"],
   ["Do grades measure intelligence?", "Is there too much pressure on students in Korea?", "What if schools had no grades?"],
   ["Should cheating get you expelled?", "Is using AI for homework cheating?", "How can schools stop cheating?"],
   ["Is skipping class ever okay?", "Should attendance count toward grades?", "Would you skip school for a big opportunity?"],
   ["Should schools start later in the morning?", "Is it safe for kids to walk alone?", "How far is too far for a school commute?"]
  ],
  gram1: {
   chain: ["I usually study ___ because ___.", "My favorite place is ___ — it's ___ from my home."],
   ex: "T: I usually study in a café nearby because it's quiet.<br>S: I usually study upstairs because …<br>T: …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["Have you ever studied abroad?", "Do you work better at home or outside?", "Is there a good library nearby?", "Where do you go to relax?", "Did you live far away from your school?"],
    ans: "Answer with a place word <b>+ why?</b>"
   },
   b: {
    title: "Your best study place",
    big: "I study best ___ because ___. I never study ___.",
    ans: "Then ask: <b>Where do you focus best?</b>"
   }
  },
  opener: {
   think: ["What is the purpose of school — knowledge or life skills?", "What did school teach you that no textbook did?", "If you could change one thing about Korean education, what would it be?"]
  },
  convo: [
   ["A", "You look stressed. What's up?"],
   ["B", "I have a {chemistry} exam tomorrow."],
   ["A", "Are you ready for it?"],
   ["B", "Not really. I'm pretty bad at it."],
   ["A", "Why don't we study together {at the library}?"],
   ["B", "Good idea. Is it open late?"],
   ["A", "Yes, until ten. My {older brother} can help, too."],
   ["B", "Great! He's {really smart}, right?"],
   ["A", "Totally. Let's meet there at six."]
  ],
  swap: [["a subject", "chemistry"], ["a place", "at the library"], ["a helper", "older brother"], ["a good quality", "really smart"]],
  lang: [
   ["Show concern", ["You look stressed.", "Are you okay?", "That's tough."]],
   ["Suggest", ["Why don't we …?", "How about …?", "Let's …"]],
   ["Agree / disagree", ["Totally.", "Good idea.", "I'm not so sure."]],
   ["Ask where", ["Where should we meet?", "Is it nearby?"]]
  ],
  langPractice: ["I failed my history exam.", "I think uniforms are useless.", "I studied abroad for a year.", "My school had no air conditioning.", "Exams should be banned.", "I was the class clown."],
  survey: {
   ask: "Did you",
   cols: ["Me", "My teacher", "One more question"],
   rows: ["walk to school", "wear a uniform", "go to a private academy", "study abroad", "love exams", "have a favorite teacher"],
   q: "Did you …? → Yes. → Ask: Where? / Why? / How was it?",
   report: "My teacher and I both ___, but only I ___."
  },
  gap: {
   who: "Mr. Park's school days",
   q: ["Where did Mr. Park go to school?", "How did he get there?", "What was he good at?", "Where did he study after school?", "What was his funniest memory?"],
   A: [["school", "a small school by the sea"], ["got there", "?"], ["good at", "art"], ["studied", "?"], ["funniest memory", "?"]],
   B: [["school", "?"], ["got there", "walked 30 minutes"], ["good at", "?"], ["studied", "upstairs at his uncle's shop"], ["funniest memory", "a goat on the playground"]],
   tip: "Where <b>did</b> he study? · He studied <b>upstairs</b>."
  },
  role: {
   A: ["You are a school counselor.", "Ask 5 questions + 2 follow-ups.", "Suggest a 3-step study plan."],
   B: ["You are a stressed student.", "Choose: bad grades / skipped class / exam fear.", "Explain with reasons and examples."]
  },
  tts: {
   title: "Design \"The perfect school\"",
   steps: ["Think: what should a perfect school have?", "Ask your teacher 4 of today's questions.", "Agree on 3 rules and 3 places.", "Present your school in 1 minute."],
   lang: ["I think we should have ___ because ___.", "The library would be ___.", "We'd never ___."]
  },
  speech: {
   time: "2 min",
   model: ["Hi everyone. Today I'll talk about my school days.", "My school was nearby, so I walked there every day.", "I was good at English but terrible at chemistry.", "My best teacher was patient and very funny.", "Grades were important, and the pressure was huge.", "Looking back, the friends mattered more than the grades.", "If I could go back, I'd worry less and ask more questions.", "Thanks for listening! Any questions?"],
   outline: ["Hook — \"Today I'll talk about…\"", "Where your school was", "Good / bad subjects", "A great teacher + why", "What you learned", "Ask for questions"],
   check: ["Clear voice", "Eye contact", "Place words", "Answer 1 question"]
  },
  pron: {
   cols: [["Place words", ["HERE", "NEARby", "aBROAD"]], ["Two words", ["far aWAY", "downSTAIRS", "EVerywhere"]], ["In a sentence", ["I studied aBROAD.", "It's far aWAY.", "Go downSTAIRS."]]],
   up: "Did you study abroad?",
   down: "Where did you go to school?"
  },
  review: ["I can answer in 4 parts.", "I can use adverbs of place.", "I can give my opinion on education.", "I can give a short presentation."]
 }
};
