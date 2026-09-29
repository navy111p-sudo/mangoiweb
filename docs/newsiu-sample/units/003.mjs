// SIU BASIC 003 — 단원 파일(8판 형식). 본보기: units/001.mjs
// 원본과 다른 점:
//  - Q1 "What holidays do you like best?" 그대로 · 답 틀 "My best holiday is…" → "My favorite holiday is…"
//  - Q2 답 틀 "I will advice him/her to…" → "I would advise him/her to…" (advice 명사 / advise 동사)
//  - Q5 "…and not go to school?" → "…without going to school?"
//  - Q6 "Which one do you like to attend, morning or afternoon classes?" → "Which do you prefer, morning or afternoon classes? Why?" · 답 틀 "I will prefer" → "I prefer"
//  - Q7 "If you shop today what are the 3 things you will buy?" → "If you went shopping today, what three things would you buy?"
//  - Q8 "If you are working, what is the most difficult part of your life?" → "If you had a job, what would be the most difficult part of your life?"
//  - Q9 답 틀 "Its better" → "It's better" · Q10 "If you are rich, what will you do?" → "If you were rich, what would you do?"
//  - 문법 설명 오타 "Tree or more syllable" → "three or more syllables"
export default {
 no: "003",
 title: "Are There Reasons Why",
 book: "SIU BASIC 003 - Are there reasons why",
 next: "004 Are You",
 cover: { h1: "Are There", em: "Reasons Why?", goals: ["Give reasons with because", "Talk about the best and the most", "Give advice to a friend"] },
 KW: [
  ["holiday", "noun", "휴일", "a special day when people don't work"],
  ["advice", "noun", "조언", "an idea about what someone should do"],
  ["student", "noun", "학생", "a person who studies at a school"],
  ["school", "noun", "학교", "a place where children go to learn"],
  ["surfing", "noun", "인터넷 서핑", "looking at many websites online"],
  ["morning", "noun", "아침", "the time from sunrise to 12 o'clock"],
  ["buy", "verb", "사다", "to get something by paying money"],
  ["difficult", "adjective", "어려운", "not easy; needing a lot of effort"],
  ["poor", "adjective", "가난한", "having very little money"],
  ["rich", "adjective", "부유한", "having a lot of money"]
 ],
 QS: [
  "What holidays do you like best? Why?",
  "If your friend is feeling down, what advice will you give?",
  "What is the hardest part of being a student?",
  "Is it important to go to school? Why?",
  "Can you learn by just surfing the internet, without going to school?",
  "Which do you prefer, morning or afternoon classes? Why?",
  "If you went shopping today, what three things would you buy?",
  "If you had a job, what would be the most difficult part of your life?",
  "Is it better to be rich or poor? Why?",
  "If you were rich, what would you do?"
 ],
 IMG_E: ["scene-words/15269", "scene-words/12233", "scene-words/12071", "scene-words/16456", "scene-words/17162", "scene-words/18787", "scene-words/12369", "scene-words/18527", "scene-words/19492", "scene-words/13381"],
 IMG_H: ["scene-words/18654", "scene-clips/5032", "scene-words/15033", "scene-words/18121", "scene-words/16333", "scene-clips/7200", "scene-words/12506", "scene-words/16866", "scene-words/20212", "scene-words/15136"],
 PICS: {
  opener: "scene-words/16384", talk: "scene-clips/5038", group: "scene-words/17375", speech: "scene-words/12053",
  reporter: "scene-words/13053", survey: "scene-clips/7445", pron: "scene-clips/7170", roleB: "scene-words/12071",
  cover: "scene-words/16384", back: "scene-words/18131"
 },
 gram1: {
  can: "say the biggest and the most",
  title: "Superlative",
  em: "Adjectives",
  rules: [
   ["Short words", "old → the <b>oldest</b> · big → the <b>biggest</b> · easy → the <b>easiest</b>"],
   ["Long words", "the <b>most</b> important · good → the <b>best</b>"]
  ],
  hardNote: "late → latest · happy → happiest · bad → worst",
  say: ["A superlative says the highest degree of a quality.", "Old, the oldest. Big, the biggest. Easy, the easiest.", "The most important. Good, the best."]
 },
 gram2: {
  can: "ask \"What is the best…?\"",
  cols: ["short words → -est", "long words → most"],
  rows: [
   ["+", "Chuseok is the <b>long<mark>est</mark></b> holiday.", "Math is the <b><mark>most</mark> difficult</b> subject."],
   ["−", "It isn't the <b>cheap<mark>est</mark></b> bag.", "It isn't the <b><mark>most</mark> expensive</b> bag."],
   ["?", "What is the <b>eas<mark>iest</mark></b> subject?", "What is the <b><mark>most</mark> important</b> thing?"]
  ]
 },
 gapCan: "ask \"Why does she…?\"",
 role: {
  title: "The", em: "Student Advice", tail: "Show",
  opener: "Welcome to our show! What is your problem today?",
  a: "Show host", b: "Student"
 },
 pron: {
  can: "say superlatives clearly",
  title: "Say", em: "the Best",
  game: "Teacher says an adjective → you say the superlative → you make a sentence: <i>\"Winter is the coldest season.\"</i>"
 },
 E: {
  steps: ["Answer", "Why?"],
  model: [
   ["My favorite holiday is Chuseok.", "I eat songpyeon with my family."],
   ["I would tell him to talk to his mom.", "Moms give the best advice."],
   ["The hardest part is homework.", "I have a lot of it every day."],
   ["Yes, because I learn new things.", "I also meet my friends."],
   ["No, because I need a teacher.", "A teacher can answer my questions."],
   ["I like morning classes.", "I am not sleepy in the morning."],
   ["I would buy a toy, a book and a cake.", "The cake is for my mom."],
   ["The most difficult part is getting up early.", "I love to sleep!"],
   ["It is better to be rich.", "You can buy food and help people."],
   ["I would buy a big house.", "I would give money to poor people, too."]
  ],
  frame: [
   "My favorite holiday is ___. I ___.",
   "I would tell him/her to ___.",
   "The hardest part is ___.",
   "Yes/No, because ___.",
   "Yes/No, because ___.",
   "I like ___ classes. I am ___.",
   "I would buy ___, ___ and ___.",
   "The most difficult part is ___.",
   "It is better to be ___ because ___.",
   "I would ___."
  ],
  bank: [
   ["Chuseok", "Seollal", "Christmas", "Children's Day"],
   ["talk to his mom", "take a walk", "eat snacks", "play a game"],
   ["homework", "tests", "getting up early", "long classes"],
   ["learn new things", "meet friends", "need a teacher", "can study at home"],
   ["need a teacher", "can watch videos", "have questions", "like my friends"],
   ["morning", "afternoon", "sleepy", "awake"],
   ["a toy", "a book", "shoes", "a cake"],
   ["getting up early", "working late", "a mean boss", "no free time"],
   ["rich", "happy", "help people", "buy food"],
   ["buy a big house", "travel", "help poor people", "buy a car"]
  ],
  more: [
   ["What do you eat on that day?", "Who do you see?"],
   ["What do you do when you feel down?", "Who helps you?"],
   ["What is the easiest part?", "What is your best subject?"],
   ["What is the best thing at school?", "Do you like your school?"],
   ["What do you learn online?", "Is it easy to learn online?"],
   ["What time do you get up?", "When are you sleepy?"],
   ["Which one is the most important?", "Where would you shop?"],
   ["What job do you want?", "What is the easiest job?"],
   ["Can money make you happy?", "What is the best thing money can buy?"],
   ["Who would you help first?", "What is the first thing you'd buy?"]
  ],
  gram1: {
   chain: ["___ is the biggest animal.", "___ is the most delicious food."],
   ex: "T: An elephant is the biggest animal.<br>S: A blue whale is the biggest animal!<br>T: A cheetah is the fastest …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["What is the best holiday?", "What is the easiest subject?", "Who is the tallest?", "What is the biggest animal?", "What is the coldest month?"],
    ans: "Answer + <b>because …</b>"
   },
   b: {
    title: "Your family",
    big: "The oldest person in my family is ___. The funniest is ___.",
    ans: "Then ask: <b>Who is the funniest in your family?</b>"
   }
  },
  opener: { think: ["Look at the photo. Where are they going?", "Do you like school? Why?", "What is the best day of the week?"] },
  convo: [
   ["A", "What is your favorite holiday?"],
   ["B", "It's {Chuseok}!"],
   ["A", "Why do you like it?"],
   ["B", "Because I eat {songpyeon}. It's the best food!"],
   ["A", "Cool! What is the hardest part of school?"],
   ["B", "{Math}. It's the most difficult subject."],
   ["A", "Me too! I like {English} the best."]
  ],
  swap: [["a holiday", "Chuseok"], ["holiday food", "songpyeon"], ["a hard subject", "Math"], ["your best subject", "English"]],
  lang: [
   ["Ask why", ["Why?", "Why do you think so?", "Really? Why?"]],
   ["Give a reason", ["Because …", "It's the best!", "I like it because …"]],
   ["Agree", ["I think so too!", "Me too!", "You're right!"]]
  ],
  langPractice: ["Summer is the best season.", "Math is the hardest subject.", "Pizza is the best food.", "Dogs are the cutest animals.", "Sunday is the best day.", "School is boring."],
  survey: {
   ask: "What is the best",
   cols: ["Me", "My teacher"],
   rows: ["holiday", "food", "season", "subject", "day of the week", "animal"],
   q: "What is the best …?  → ___ is the best because ___.",
   report: "I like ___ best. My teacher likes ___."
  },
  gap: {
   who: "Hana",
   q: ["What is Hana's favorite holiday?", "What is her hardest subject?", "Why does she like school?", "What would she buy?"],
   A: [["holiday", "Christmas"], ["hardest subject", "?"], ["likes school because", "her friends"], ["would buy", "?"]],
   B: [["holiday", "?"], ["hardest subject", "science"], ["likes school because", "?"], ["would buy", "a bike"]],
   tip: "Why does she …? → <b>Because</b> she …"
  },
  role: {
   A: ["You are a TV show host.", "Ask about the problem.", "Give 2 pieces of advice."],
   B: ["You are a student.", "Choose: too much homework / no friends / a sad pet.", "Say why it is hard."]
  },
  tts: {
   title: "Choose \"The Best Holiday\"",
   steps: ["Think of 2 holidays you like.", "Ask your teacher his/her best holiday and why.", "Choose one together.", "Tell 3 reasons!"],
   lang: ["___ is the best holiday because ___.", "We both like ___.", "It's the most fun day!"]
  },
  speech: {
   time: "1 min",
   model: ["Hello! I'm Minho.", "My favorite holiday is Chuseok.", "Chuseok is the best because I see my grandma.", "The hardest part of school is math.", "If I were rich, I would buy a big house.", "Thank you!"],
   outline: ["Name", "Best holiday", "Why?", "Hardest part of school", "If I were rich…"],
   check: ["Loud voice", "Say because", "Say 5 things"]
  },
  pron: {
   cols: [["-est", ["oldest", "biggest", "fastest"]], ["-iest", ["happiest", "easiest", "funniest"]], ["most …", ["most famous", "most difficult", "most important"]]],
   up: "Is it important to go to school?",
   down: "What is your favorite holiday?"
  },
  review: ["I can say the best / the most.", "I can give a reason with because.", "I can give advice.", "I can ask \"Why?\""]
 },
 H: {
  steps: ["Answer", "Reason", "Example", "Ask back"],
  model: [
   ["I like Chuseok the best.", "It's the only time my whole family meets.", "Last year we made songpyeon together until midnight.", "What holiday do you like best?"],
   ["I'd advise her to talk to someone she trusts.", "Keeping feelings inside makes things worse.", "When I was down, a long talk with my sister really helped.", "What advice would you give?"],
   ["The hardest part is managing my time.", "I have school, academies and homework every day.", "Some nights I only sleep five hours.", "What's the hardest part for you?"],
   ["Yes, it's one of the most important things in life.", "School teaches us how to work with people.", "I learned teamwork in a group science project.", "Do you think school is important?"],
   ["Partly, but not completely.", "You can learn facts online, but not social skills.", "I learned to code from videos, but I still needed a mentor.", "Have you learned something online?"],
   ["I prefer morning classes.", "My brain is the sharpest early in the day.", "I remember the most when I study before lunch.", "Are you a morning person?"],
   ["I'd buy running shoes, a book and a gift.", "The shoes are the most useful for me.", "The gift would be for my mom's birthday.", "What would you buy?"],
   ["The most difficult part would be the long hours.", "I'd have little time for family and hobbies.", "My father often works until nine at night.", "Do you think work-life balance is possible?"],
   ["It's better to be rich, but not the richest.", "Money gives you choices and safety.", "But some of the happiest people I know aren't rich.", "Would you rather be rich or happy?"],
   ["I'd travel and help others.", "Money is the most useful when you share it.", "I'd build a library in a poor village.", "What would you do first?"]
  ],
  frame: [
   "I like … the best because … Last year, …",
   "I'd advise him/her to … because …",
   "The hardest part is … For example, …",
   "Yes/No. School is … because …",
   "Partly. You can learn … but …",
   "I prefer … classes because …",
   "I'd buy …, … and … The most … is …",
   "The most difficult part would be … because …",
   "It's better to be … because … But …",
   "If I were rich, I'd … because …"
  ],
  more: [
   ["Which holiday is the most overrated?", "How have holidays changed?", "What new holiday should we have?"],
   ["What is the worst advice you've heard?", "Is it easy to take advice?", "Who gives you the best advice?"],
   ["Are students today busier than before?", "Should homework be banned?", "What would make school easier?"],
   ["What is the most useful thing you learned at school?", "Should school start later?", "Is homeschooling a good idea?"],
   ["Is the internet the best teacher?", "What are the dangers of learning online?", "Will schools exist in 50 years?"],
   ["Are you the most productive in the morning?", "Should classes start at 10 a.m.?", "How do you stay awake in class?"],
   ["Do you buy things you don't need?", "Is online shopping better?", "What is the best thing you've ever bought?"],
   ["What is the most stressful job?", "Is money the most important part of a job?", "What would your dream job be?"],
   ["Can money buy happiness?", "Is it harder to be rich or poor?", "What should rich people do for society?"],
   ["Would being rich change you?", "Would you keep working?", "What would you never buy?"]
  ],
  gram1: {
   chain: ["The most … thing I've ever done is …", "… is the best … in my city."],
   ex: "T: The scariest thing I've done is skydiving.<br>S: The most exciting thing I've done is …<br>T: The best cafe in my city …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["What is the most useful app?", "What is the hardest job?", "Who is the kindest person you know?", "What is the best age to be?", "What is the most beautiful place in Korea?"],
    ans: "I think … <b>+ a reason</b>"
   },
   b: {
    title: "Your city",
    big: "The busiest place in my city is ___, but the most relaxing is ___.",
    ans: "Then ask: <b>What is the best place in your city?</b>"
   }
  },
  opener: { think: ["Why do people need reasons to believe us?", "Is it better to be rich or happy?", "What is the most important thing school teaches?"] },
  convo: [
   ["A", "You look tired. Rough day?"],
   ["B", "Yeah. {Tests} are the hardest part of being a student."],
   ["A", "I know. Why is it so bad this week?"],
   ["B", "I have {three tests} and a project."],
   ["A", "My advice? Make a plan and take short breaks."],
   ["B", "Good idea. What helps you the most?"],
   ["A", "Studying in the {morning}. My brain is the sharpest then."],
   ["B", "Really? I'm the most awake at night!"],
   ["A", "Well, after the tests, let's celebrate with {pizza}!"]
  ],
  swap: [["a hard part of school", "Tests"], ["how much work", "three tests"], ["a time of day", "morning"], ["a treat", "pizza"]],
  lang: [
   ["Give reasons", ["The main reason is …", "That's because …", "For one thing, …"]],
   ["Give advice", ["You should …", "Why don't you …?", "If I were you, I'd …"]],
   ["Ask for reasons", ["What makes you say that?", "Why do you think so?"]],
   ["Agree / disagree", ["That makes sense.", "I see your point, but …"]]
  ],
  langPractice: ["School is a waste of time.", "Money is the most important thing.", "The internet is the best teacher.", "Morning classes are the worst.", "Holidays are too short.", "Rich people are happier."],
  survey: {
   ask: "What is the best",
   cols: ["Me", "My teacher", "Why?"],
   rows: ["holiday", "way to relax", "age to be", "job", "way to learn English", "thing money can buy"],
   q: "What is the best …? → Ask: Why? / Can you give an example?",
   report: "We both think ___ is the best, but we disagree about ___."
  },
  gap: {
   who: "Leo",
   q: ["What is Leo's favorite holiday? Why?", "What is the hardest part of his job?", "Does he prefer mornings? Why?", "What would he do if he were rich?", "What advice does he give?"],
   A: [["holiday + why", "Christmas — family"], ["hardest part", "?"], ["mornings?", "?"], ["if rich", "open a school"], ["advice", "?"]],
   B: [["holiday + why", "?"], ["hardest part", "long hours"], ["mornings?", "yes — quiet time"], ["if rich", "?"], ["advice", "never give up"]],
   tip: "Why does he …? → <b>Because</b> he …"
  },
  role: {
   A: ["You host an advice show.", "Ask 3 questions about the problem.", "Give 3 pieces of advice with reasons."],
   B: ["You are a stressed student or worker.", "Choose a problem: time / money / friends.", "Explain why it's the hardest thing now."]
  },
  tts: {
   title: "Make \"The Best Advice\" list",
   steps: ["Think: what are students' biggest problems?", "Ask your teacher for his/her best advice.", "Agree on the top 3 tips.", "Present your list in 1 minute."],
   lang: ["The most important tip is ___ because ___.", "I see your point, but ___.", "So our top 3 are ___."]
  },
  speech: {
   time: "2 min",
   model: ["Hi everyone. Is school really important? Let me tell you what I think.", "I believe it's one of the most important parts of life.", "You can learn facts online, but school teaches teamwork.", "The hardest part is managing time, so I make a plan every Sunday.", "My advice for students is simple: take short breaks.", "If I were rich, I'd build a library for kids.", "Thanks for listening! Do you agree?"],
   outline: ["Hook — a question", "My opinion", "Reason + example", "The hardest part", "My advice", "Ask the audience"],
   check: ["Clear voice", "Reasons with because", "Superlatives", "Answer 1 question"]
  },
  pron: {
   cols: [["-est", ["latest", "biggest", "cheapest"]], ["-iest", ["happiest", "busiest", "earliest"]], ["most …", ["most useful", "most stressful", "most expensive"]]],
   up: "Is it better to be rich?",
   down: "What is the hardest part of your job?"
  },
  review: ["I can answer in 4 parts.", "I can use superlatives.", "I can give advice with reasons.", "I can agree and disagree politely."]
 }
};
