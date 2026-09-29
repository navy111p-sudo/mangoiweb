// SIU BASIC 007 — 단원 파일(8판 형식). 본보기: units/001.mjs
// 원본과 다른 점:
//  - Q1 "Is it important to go to school? why?" → "Why?" 대문자
//  - Q2 "What will you do if you don't understand the lessons or topics your teacher teaches?" → "…the lessons your teacher teaches?" (간결하게)
//  - Q3 "if you fail in a test" → "if you fail a test"
//  - Q4 "Are you eating in the classrooms? how?" → "Do you eat in your classroom? Why or why not?" (문법·뜻 정리)
//  - Q5 "Are you active to any clubs now?" → "Are you active in any clubs now?"
//  - Q7 "Are rules important in school?" → 끝에 "Why?" 추가
//  - Keyword "Graduate(noun)" → 한글 뜻이 «졸업하다» 라 verb 로 고침 · "Rules" → "rule"
//  - 답 틀 "Yes/No, I'm Jugh because" → "Yes, I am. / No, I'm not."
export default {
 no: "007",
 title: "At School",
 book: "SIU BASIC 007 - At School",
 next: "008 Celebrations and Special Days",
 cover: { h1: "At", em: "School", goals: ["Talk about your school life", "Say what is happening now", "Give a short presentation"] },
 KW: [
  ["go", "verb", "가다", "to move from one place to another"],
  ["lesson", "noun", "수업", "a time when a teacher teaches something"],
  ["fail", "verb", "실패하다, 떨어지다", "to not pass a test or not reach a goal"],
  ["classroom", "noun", "교실", "a room in a school where students learn"],
  ["club", "noun", "동아리", "a group of people who share an interest"],
  ["art", "noun", "미술", "making pictures and things with your imagination"],
  ["rule", "noun", "규칙", "something that tells you what you must do"],
  ["graduate", "verb", "졸업하다", "to finish your studies at a school"],
  ["school subject", "noun", "과목", "math, art or English"],
  ["fashion", "noun", "패션", "a popular style of clothes"]
 ],
 QS: [
  "Is it important to go to school? Why?",
  "What will you do if you don't understand the lessons your teacher teaches?",
  "What will you do if you fail a test?",
  "Do you eat in your classroom? Why or why not?",
  "Are you active in any clubs now?",
  "Are you studying art at the moment?",
  "Are rules important in school? Why?",
  "What do you want to do after you graduate?",
  "Is English your favorite school subject?",
  "Are you a fashion icon at school?"
 ],
 IMG_E: ["scene-words/16456", "scene-words/18553", "scene-words/17151", "scene-clips/7309", "scene-words/15385", "scene-words/18030", "scene-words/16341", "scene-clips/7490", "scene-words/19258", "scene-words/18121"],
 IMG_H: ["scene-words/16384", "scene-words/12647", "scene-words/18551", "scene-words/12849", "scene-words/15385", "scene-words/14837", "scene-words/18537", "scene-words/14892", "scene-words/16931", "scene-words/15789"],
 PICS: {
  opener: "scene-words/16456",
  talk: "scene-clips/7477",
  group: "scene-words/19247",
  speech: "scene-words/15095",
  reporter: "scene-clips/7073",
  survey: "scene-clips/7215",
  pron: "scene-clips/7011",
  roleB: "scene-clips/7072",
  cover: "scene-words/18121",
  back: "scene-words/18131"
 },
 gram1: {
  can: "talk about what is happening now",
  title: "Present",
  em: "Continuous",
  rules: [
   ["Now", "I <b>am studying</b> English now."],
   ["These days", "She <b>is taking</b> an art class."],
   ["Future plan", "We <b>are having</b> a test on Monday."]
  ],
  hardNote: "now · at the moment · today · this week",
  say: ["The present continuous shows actions happening now.", "I am studying English now.", "We are having a test on Monday."]
 },
 gram2: {
  can: "ask \"Are you …ing?\"",
  cols: ["I · you · we · they", "he · she · it"],
  rows: [
   ["+", "You <b>are</b> study<mark>ing</mark>.", "She <b>is</b> study<mark>ing</mark>."],
   ["−", "We <b>aren't</b> eating.", "He <b>isn't</b> eating."],
   ["?", "<b>Are</b> you listening?", "<b>Is</b> it raining?"]
  ]
 },
 gapCan: "ask \"What is she doing?\"",
 role: {
  title: "The",
  em: "School Tour",
  tail: "",
  opener: "Welcome to our school! Can I show you around?",
  a: "Student guide",
  b: "Visiting student"
 },
 pron: {
  can: "say -ing clearly",
  title: "The",
  em: "-ing sound",
  game: "Teacher says a verb → you add -ing → you make a sentence: <i>\"I'm studying now.\"</i>"
 },
 E: {
  steps: ["Answer", "More"],
  model: [
   ["Yes, it is.", "I can learn and make friends at school."],
   ["I will ask my teacher.", "My teacher is very kind."],
   ["I will study more.", "I will try again next time."],
   ["No, I don't.", "We eat lunch in the lunchroom."],
   ["Yes, I am. I'm in the dance club.", "We practice on Fridays."],
   ["Yes, I am.", "I'm learning to draw animals."],
   ["Yes, they are.", "They keep us safe."],
   ["I want to go to a good middle school.", "Then I want to be a doctor."],
   ["Yes, it is.", "I love reading English books."],
   ["No, I'm not.", "But I like my new sneakers!"]
  ],
  frame: [
   "Yes, it is. I can ___ at school.",
   "I will ask ___.",
   "I will ___.",
   "Yes, I do. / No, I don't. We eat in the ___.",
   "Yes, I am. I'm in the ___ club. / No, I'm not.",
   "Yes, I am. I'm learning to ___.",
   "Yes, they are. They ___.",
   "After I graduate, I want to ___.",
   "Yes, it is. / No, it isn't. I like ___.",
   "Yes, I am. / No, I'm not. I like my ___."
  ],
  bank: [
   ["learn", "make friends", "play", "read"],
   ["my teacher", "my friend", "my mom", "my brother"],
   ["study more", "ask for help", "try again", "practice"],
   ["classroom", "lunchroom", "cafeteria", "yard"],
   ["dance", "soccer", "art", "science"],
   ["draw", "paint", "make clay", "color"],
   ["keep us safe", "help us learn", "are fair", "stop fights"],
   ["go to middle school", "be a doctor", "travel", "work"],
   ["English", "math", "art", "P.E."],
   ["shoes", "hat", "bag", "jacket"]
  ],
  more: [
   ["What do you like about school?", "What time does school start?"],
   ["Who helps you with homework?", "Is it OK to ask questions?"],
   ["How do you feel after a test?", "Who helps you study?"],
   ["What do you eat for lunch?", "Who do you eat with?"],
   ["What do you do in the club?", "Which club do you want to join?"],
   ["What are you drawing now?", "Who is your art teacher?"],
   ["What is one rule at your school?", "Which rule don't you like?"],
   ["What do you want to be?", "Why?"],
   ["Which subject is hard?", "Who is your favorite teacher?"],
   ["Do you wear a uniform?", "What is your favorite color?"]
  ],
  gram1: {
   chain: ["I am ___ now.", "My teacher is ___."],
   ex: "T: I am drinking coffee.<br>S: I am sitting on a chair.<br>T: I am …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["Are you sitting at a desk?", "Are you wearing a uniform?", "Are you drinking water?", "Are you smiling?", "Are you studying English now?"],
    ans: "Yes, I am. / No, I'm not. <b>+ one more sentence</b>"
   },
   b: {
    title: "Look around!",
    big: "My mom is ___ now. My friend is ___.",
    ans: "Then ask: <b>What is your family doing now?</b>"
   }
  },
  opener: { think: ["Look at the photo. Where are they?", "Do you like your school?", "What are you doing at school this week?"] },
  convo: [
   ["A", "Hi, Jun! What are you doing?"],
   ["B", "I'm {drawing a cat} for art class."],
   ["A", "Wow, it's great! Are you in a club?"],
   ["B", "Yes, I'm in the {soccer} club. How about you?"],
   ["A", "I'm in the {dance} club. We practice on {Fridays}."],
   ["B", "Cool! Can I watch?"],
   ["A", "Sure!"]
  ],
  swap: [["an activity", "drawing a cat"], ["your club", "soccer"], ["your partner's club", "dance"], ["a day", "Fridays"]],
  lang: [
   ["Ask about now", ["What are you doing?", "Are you busy?"]],
   ["Show interest", ["Wow!", "That's great!", "Cool!"]],
   ["Ask back", ["How about you?", "And you?"]]
  ],
  langPractice: ["I'm in the art club.", "I'm eating my lunch.", "I failed my math test.", "My favorite subject is P.E.", "I'm reading a comic book.", "I don't like school rules."],
  survey: {
   ask: "Are you",
   cols: ["Me", "My teacher"],
   rows: ["in a club", "studying art", "wearing a uniform", "good at math", "reading a book now", "happy today"],
   q: "Are you …?  → Yes, I am. / No, I'm not.",
   report: "I ___, but my teacher ___."
  },
  gap: {
   who: "Jisu",
   q: ["What is Jisu doing now?", "Which club is she in?", "What is her favorite subject?", "What does she want to be?"],
   A: [["doing now", "eating lunch"], ["club", "?"], ["favorite subject", "art"], ["wants to be", "?"]],
   B: [["doing now", "?"], ["club", "the dance club"], ["favorite subject", "?"], ["wants to be", "a designer"]],
   tip: "She → <b>is</b> eat<b>ing</b> · likes · wants"
  },
  role: {
   A: ["You show B your school.", "Ask 5 questions.", "Say what people are doing now."],
   B: ["You are visiting from another school.", "Choose: from Japan / Canada / Australia.", "Answer with 2 sentences."]
  },
  tts: {
   title: "Make a school day poster",
   steps: ["Pick 3 things you do at school.", "Ask your teacher about their school day.", "Find one thing that is the same.", "Draw it and tell!"],
   lang: ["At 9 o'clock, I'm ___.", "We both like ___!", "I ___, but my teacher ___."]
  },
  speech: {
   time: "1 min",
   model: ["Hello! My name is Jisu.", "I go to Hanbit Elementary School.", "My favorite subject is art.", "I'm in the dance club.", "Right now, I'm learning a new dance.", "Thank you!"],
   outline: ["Name", "Your school", "Favorite subject", "Your club", "What you are learning now"],
   check: ["Loud voice", "Look at your teacher", "Say 5 things"]
  },
  pron: {
   cols: [
    ["-ing", ["going", "eating", "reading"]],
    ["e → -ing", ["making", "writing", "coming"]],
    ["double", ["sitting", "running", "swimming"]]
   ],
   up: "Are you studying?",
   down: "What are you doing?"
  },
  review: ["I can talk about my school.", "I can use am / is / are + -ing.", "I can ask \"Are you …ing?\"", "I can say one more sentence."]
 },
 H: {
  steps: ["Answer", "Reason", "Example", "Ask back"],
  model: [
   ["Yes, I think it's very important to go to school.", "School teaches us more than just subjects.", "For example, I learn how to work in a team there.", "Do you think online school is just as good?"],
   ["If I don't understand a lesson, I will ask my teacher.", "Asking is better than worrying about it alone.", "Last week, I asked about a math problem after class.", "What do you do when you don't understand?"],
   ["If I fail a test, I will study harder for the next one.", "One bad score doesn't decide who I am.", "Once I failed a science quiz, but I passed the next test.", "How did you feel when you failed a test?"],
   ["No, we don't eat in the classroom.", "Our school has a big cafeteria for lunch.", "But sometimes we have snacks at a class party.", "Did you eat in your classroom as a student?"],
   ["Yes, I'm active in the robotics club.", "I enjoy solving problems with my friends.", "This month, we're building a robot for a contest.", "Were you in any clubs at school?"],
   ["Yes, I'm studying art at the moment.", "It's a great way to relax after hard classes.", "Right now, we're painting self-portraits.", "Do you like drawing or painting?"],
   ["Yes, I think rules are important in school.", "Without rules, classes would be noisy and unsafe.", "For example, the no-phone rule helps us focus.", "Which school rule do you think is unfair?"],
   ["After I graduate, I want to study design at university.", "I love clothes and making things look beautiful.", "I'm already taking an online drawing class.", "What did you do after you graduated?"],
   ["Yes, English is my favorite school subject.", "I can use it to watch movies and meet people.", "These days, I'm reading an English novel.", "What was your favorite subject?"],
   ["No, I'm not a fashion icon, but I like style.", "We wear uniforms, so it's hard to stand out.", "I show my style with my bag and shoes.", "Do you think students should wear uniforms?"]
  ],
  frame: [
   "Yes / No, I think … because …",
   "If I don't understand, I will … because …",
   "If I fail a test, I will … Once, I …",
   "Yes, we do. / No, we don't … because …",
   "Yes, I'm active in … These days, we're …",
   "Yes, I'm studying … / No, I'm not, but …",
   "I think rules are … For example, …",
   "After I graduate, I want to … because …",
   "Yes / No, my favorite subject is … because …",
   "I'm / I'm not a fashion icon. I show my style by …"
  ],
  more: [
   ["What is the most useful thing you learned at school?", "Should school start later in the morning?", "Can people learn everything online today?"],
   ["Why are some students afraid to ask questions?", "Is it better to ask a teacher or a friend?", "How can teachers make lessons easier?"],
   ["Are tests a good way to measure learning?", "How do you deal with stress before a test?", "What did a failure teach you?"],
   ["Should students be allowed to eat in class?", "What is school lunch like in Korea?", "What would your perfect school lunch be?"],
   ["What can students learn from clubs?", "Should clubs be required at school?", "What new club would you start?"],
   ["Is art as important as math and science?", "Can anyone learn to draw well?", "Should schools have more art classes?"],
   ["Which school rule would you change?", "Should students help make school rules?", "Are there too many rules at school?"],
   ["Should everyone go to university?", "Is it good to take a year off after school?", "What jobs will be popular in the future?"],
   ["Should English start in kindergarten?", "Which subject is most useful in real life?", "What new subject should schools teach?"],
   ["Are school uniforms a good idea?", "Why do people follow fashion trends?", "Who is a fashion icon you admire?"]
  ],
  gram1: {
   chain: ["This week, I'm ___.", "At the moment, my friends are ___."],
   ex: "T: This week, I'm reading a novel.<br>S: This week, I'm studying for a test.<br>T: This week, I'm …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["Are you taking any classes this month?", "Are you reading a good book these days?", "Are you preparing for a test?", "Are you learning anything new?", "Are you having a busy week?"],
    ans: "Yes, I am. / No, I'm not. <b>+ one more sentence</b>"
   },
   b: {
    title: "Right now…",
    big: "Right now, my ___ is ___, and my friends are probably ___.",
    ans: "Then ask: <b>What is your family doing now?</b>"
   }
  },
  opener: {
   think: [
    "What makes a school a good place to learn?",
    "What is the best and the worst part of a school day?",
    "Is school today different from your parents' school? How?"
   ]
  },
  convo: [
   ["A", "Hey, you look busy. What are you working on?"],
   ["B", "I'm {making a poster} for the {art} club."],
   ["A", "Nice! How's it going?"],
   ["B", "Not bad, but I'm running out of time."],
   ["A", "When is it due?"],
   ["B", "On {Friday}. We're having a school festival."],
   ["A", "Oh, right! Are you performing anything?"],
   ["B", "Yes, I'm {playing the drums} with my band."],
   ["A", "No way! I'll definitely come and watch."]
  ],
  swap: [["an activity", "making a poster"], ["a club", "art"], ["a day", "Friday"], ["a performance", "playing the drums"]],
  lang: [
   ["Ask about now", ["What are you working on?", "How's it going?"]],
   ["Show interest", ["Oh, really?", "That sounds fun!", "No way!"]],
   ["Ask for more", ["Can you tell me more?", "Why do you like it?"]],
   ["Agree / disagree", ["I think so too.", "I'm not so sure."]]
  ],
  langPractice: ["School starts too early.", "I'm studying for three tests.", "Uniforms are a great idea.", "I'm quitting my club.", "Art is a waste of time.", "I don't want to go to university."],
  survey: {
   ask: "Are you",
   cols: ["Me", "My teacher", "One more question"],
   rows: ["taking any classes now", "in a club this year", "reading a good book", "learning a new skill", "preparing for a test", "enjoying this week"],
   q: "Are you …? → Yes. → Ask: What? / Why? / Since when?",
   report: "My teacher and I both ___, but only I ___."
  },
  gap: {
   who: "Jisu",
   q: ["What is Jisu doing right now?", "Which club is she in? Why?", "What is her favorite subject?", "What does she do after a bad test?", "What will she do after she graduates?"],
   A: [["right now", "practicing a dance"], ["club + why", "?"], ["favorite subject", "art — she loves colors"], ["after a bad test", "?"], ["after graduating", "?"]],
   B: [["right now", "?"], ["club + why", "dance — it's fun"], ["favorite subject", "?"], ["after a bad test", "asks her teacher"], ["after graduating", "study design in Milan"]],
   tip: "She → <b>is</b> practic<b>ing</b> · likes · wants"
  },
  role: {
   A: ["You are a student guide.", "Show 3 places + say what's happening.", "Ask 5 questions + 2 follow-ups."],
   B: ["You are an exchange student.", "Choose: Japan / Canada / Brazil.", "Compare your school. Give reasons."]
  },
  tts: {
   title: "Create 3 new school rules",
   steps: ["Think: what is a problem at school?", "Ask your teacher 4 of today's questions.", "Agree on 3 rules together.", "Present your rules in 1 minute."],
   lang: ["I think we need a rule about ___ because ___.", "That's fair, but ___.", "So we agree that students should ___."]
  },
  speech: {
   time: "2 min",
   model: [
    "Hi everyone. Let me tell you about my school life.",
    "I'm in the second grade at Sinhan Middle School.",
    "My favorite subject is English because I love movies.",
    "I'm in the robotics club, and we're building a robot now.",
    "If I fail a test, I ask my teacher and study again.",
    "After I graduate, I want to study design abroad.",
    "Thanks for listening! Any questions?"
   ],
   outline: ["Hook — \"Let me tell you…\"", "Your school + grade", "Favorite subject + why", "Club + what you're doing now", "Your plan after graduation", "Ask for questions"],
   check: ["Clear voice", "Eye contact", "am / is / are + -ing", "Answer 1 question"]
  },
  pron: {
   cols: [
    ["-ing", ["studying", "failing", "learning"]],
    ["e → -ing", ["taking", "having", "graduating"]],
    ["double", ["getting", "planning", "beginning"]]
   ],
   up: "Are you taking an art class?",
   down: "What are you learning now?"
  },
  review: ["I can answer in 4 parts.", "I can use the present continuous.", "I can talk about school life and rules.", "I can give a short presentation."]
 }
};
