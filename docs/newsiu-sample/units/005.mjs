// SIU BASIC 005 — 단원 파일(8판 형식). 본보기: units/001.mjs
// 원본과 다른 점:
//  - Q1 "What parents don't understand about teenagers?" → "What don't parents understand about teenagers?"
//    답 틀 "What parents don't understand is because teenagers are" → "What parents don't understand is that teenagers are …"
//  - Q2 답 틀도 같게 "…is that parents are …"
//  - Q3 "school uniform good for students ? why?" → "…good for students? Why?"
//  - Q5 끝에 물음표 추가 · Q7 "a child or adult" → "a child or an adult"
//  - Q9 "drink Liquor" → "drink liquor" · Q10 답 틀 "I think rock videos today is" → "I think rock music today is …"
//  - 문법 표 "refers to a group or things" → collective noun = a group of people or things (설명 칸이 뒤바뀐 것 바로잡음)
export default {
 no: "005",
 title: "At a Certain Age",
 book: "SIU BASIC 005 - At a certain age",
 next: "006 All Around Me",
 cover: { h1: "At a Certain", em: "Age", goals: ["Talk about teenagers and parents", "Give opinions with because", "Use countable and uncountable nouns"] },
 KW: [
  ["parent", "noun", "부모", "a mother or a father"],
  ["understand", "verb", "이해하다", "to know what something means or why it happens"],
  ["school uniform", "noun", "교복", "clothes for school"],
  ["bad language", "noun", "나쁜 말", "rude words that hurt or shock people"],
  ["freedom", "noun", "자유", "the right to do what you want"],
  ["teenager", "noun", "십대", "a person from 13 to 19 years old"],
  ["child", "noun", "아이", "a young boy or girl"],
  ["problem", "noun", "문제", "something that is hard and needs to be fixed"],
  ["liquor", "noun", "술", "a strong alcoholic drink, only for adults"],
  ["rock music", "noun", "록 음악", "loud popular music with a strong beat"]
 ],
 QS: [
  "What don't parents understand about teenagers?",
  "What don't teenagers understand about parents?",
  "Is wearing a school uniform good for students? Why?",
  "Does it matter if teenagers use bad language?",
  "Do you think it is a good idea to give teenagers lots of freedom?",
  "What do teenagers like to do?",
  "Do you think you are still a child or an adult?",
  "What are some problems teenagers face these days?",
  "Is it good for a teenager to drink liquor?",
  "What do you think about rock music today?"
 ],
 IMG_E: ["scene-words/18493", "scene-words/18639", "scene-words/16606", "scene-words/18145", "scene-words/18182", "scene-words/13329", "scene-words/12843", "scene-words/12035", "scene-words/18046", "scene-words/12869"],
 IMG_H: ["scene-clips/7451", "scene-words/18553", "scene-words/18121", "scene-words/14680", "scene-clips/7376", "scene-clips/7046", "scene-words/19845", "scene-words/18465", "scene-words/12047", "scene-words/12870"],
 PICS: {
  opener: "scene-clips/7046", talk: "scene-clips/5032", group: "scene-clips/7016", speech: "scene-words/18040",
  reporter: "scene-words/13053", survey: "scene-clips/7445", pron: "scene-clips/7170", roleB: "scene-words/13329",
  cover: "scene-words/12021", back: "scene-words/12870"
 },
 gram1: {
  can: "name people, places and things",
  title: "Nouns —",
  em: "Naming Words",
  rules: [
   ["Person · thing · place", "<b>Jun</b> sits on a <b>chair</b> in the <b>classroom</b>."],
   ["Count it or not?", "two <b>books</b> · three <b>friends</b> · some <b>water</b>"]
  ],
  hardNote: "common · proper · collective · compound · abstract (love, freedom)",
  say: ["A noun names a person, an animal, a place or a thing.", "Jun sits on a chair in the classroom.", "Two books. Three friends. Some water."]
 },
 gram2: {
  can: "use many and much",
  cols: ["countable → many", "uncountable → much"],
  rows: [
   ["+", "Teens have <b>a lot of problem<mark>s</mark></b>.", "Teens want <b>a lot of freedom</b>."],
   ["−", "I don't have <b><mark>many</mark> friends</b>.", "I don't have <b><mark>much</mark> money</b>."],
   ["?", "How <b><mark>many</mark> books</b> do you read?", "How <b><mark>much</mark> free time</b> do you have?"]
  ]
 },
 gapCan: "ask \"How much…?\" and \"How many…?\"",
 role: {
  title: "The", em: "Teen Life", tail: "Talk Show",
  opener: "Welcome! Tell us — what is it really like to be a teenager?",
  a: "Show host", b: "Teenager"
 },
 pron: {
  can: "say -teen and -ty clearly",
  title: "-teen or", em: "-ty?",
  game: "Teacher says a number → you say \"-teen\" or \"-ty\" → you make a sentence: <i>\"My cousin is fifteen.\"</i>"
 },
 E: {
  steps: ["Answer", "More"],
  model: [
   ["Parents don't understand that teens are tired.", "We have a lot of homework."],
   ["Teens don't understand that parents are busy.", "They work very hard."],
   ["Yes, because it is easy.", "I don't have to choose clothes."],
   ["Yes, it matters.", "Bad words hurt people."],
   ["Yes, a little freedom is good.", "But they need rules, too."],
   ["Teenagers like to play games.", "They also like K-pop."],
   ["I think I'm still a child.", "My mom makes my breakfast!"],
   ["Teens have a lot of homework.", "They don't have much free time."],
   ["No, it isn't.", "Liquor is only for adults."],
   ["I think rock music is loud.", "But it is exciting!"]
  ],
  frame: [
   "Parents don't understand that teens are ___.",
   "Teens don't understand that parents are ___.",
   "Yes/No, because ___.",
   "Yes, it matters. Bad words ___.",
   "Yes/No, because teens need ___.",
   "Teenagers like to ___.",
   "I think I'm still a ___.",
   "Teens have a lot of ___.",
   "No, it isn't. Liquor is ___.",
   "I think rock music is ___."
  ],
  bank: [
   ["tired", "busy", "stressed", "grown up"],
   ["busy", "tired", "worried", "kind"],
   ["it is easy", "it looks nice", "it is not cool", "it is hot"],
   ["hurt people", "are rude", "make people sad", "are not nice"],
   ["rules", "freedom", "help", "time"],
   ["play games", "listen to K-pop", "use phones", "hang out"],
   ["child", "kid", "teenager", "big kid"],
   ["homework", "tests", "stress", "rules"],
   ["bad for kids", "for adults", "not healthy", "dangerous"],
   ["loud", "exciting", "cool", "noisy"]
  ],
  more: [
   ["Do your parents understand you?", "What do you tell them?"],
   ["Are your parents busy?", "How do you help them?"],
   ["Do you wear a uniform?", "What color is it?"],
   ["What do you say when you're angry?", "Do your friends use bad words?"],
   ["What do you want to do alone?", "What rules do you have?"],
   ["What do you like to do?", "Do you like K-pop?"],
   ["When will you be an adult?", "What do you want to do as an adult?"],
   ["What is your biggest problem?", "Who helps you?"],
   ["What do kids drink?", "What is your favorite drink?"],
   ["What music do you like?", "Can you sing a song?"]
  ],
  gram1: {
   chain: ["I have two ___s.", "I drink some ___."],
   ex: "T: I have two cats.<br>S: I have three pencils.<br>T: I drink some water …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["How many pets do you have?", "How much milk?", "How many books?", "How much TV do you watch?", "How many friends?"],
    ans: "I have … <b>+ one more</b>"
   },
   b: {
    title: "Your family",
    big: "There are ___ people in my family. We have many ___.",
    ans: "Then ask: <b>How many people are in your family?</b>"
   }
  },
  opener: { think: ["Look at the photo. How old are they?", "Do you want to be a teenager?", "What do big kids do?"] },
  convo: [
   ["A", "Hi, Yuna! How old is your sister?"],
   ["B", "She's {fifteen}. She's a teenager."],
   ["A", "What does she like to do?"],
   ["B", "She likes {K-pop}. She sings all day!"],
   ["A", "Does she have a lot of homework?"],
   ["B", "Yes! She has {five tests} this week."],
   ["A", "Oh no! Is she OK?"],
   ["B", "She's fine. She eats {pizza} and feels better!"]
  ],
  swap: [["an age", "fifteen"], ["something teens like", "K-pop"], ["how much work", "five tests"], ["a food", "pizza"]],
  lang: [
   ["Give an opinion", ["I think …", "In my opinion, …"]],
   ["Say yes or no", ["Yes, I think so.", "No, I don't think so."]],
   ["Ask for an opinion", ["What do you think?", "Do you agree?"]]
  ],
  langPractice: ["Teenagers are lazy.", "Uniforms are cool.", "Kids need a phone.", "Rock music is too loud.", "Parents are strict.", "Being a kid is the best!"],
  survey: {
   ask: "Do you like",
   cols: ["Me", "My teacher"],
   rows: ["school uniforms", "rock music", "K-pop", "video games", "school rules", "big family dinners"],
   q: "Do you like …?  → Yes, I do. / No, I don't.",
   report: "I like ___, but my teacher likes ___."
  },
  gap: {
   who: "Tom (14)",
   q: ["What does Tom like to do?", "How much free time does he have?", "How many friends does he have?", "What is his problem?"],
   A: [["likes to", "skateboard"], ["free time", "?"], ["friends", "five close friends"], ["problem", "?"]],
   B: [["likes to", "?"], ["free time", "not much"], ["friends", "?"], ["problem", "too many tests"]],
   tip: "How <b>many</b> friends? · How <b>much</b> time?"
  },
  role: {
   A: ["You are a TV show host.", "Ask 5 questions about teen life.", "Say \"Thank you!\" at the end."],
   B: ["You are a teenager (age 15).", "Answer with 2 sentences.", "Say one thing you like and one problem."]
  },
  tts: {
   title: "Make \"Rules for a Happy Family\"",
   steps: ["Think of 3 rules for kids.", "Ask your teacher for 3 rules for parents.", "Choose the best rules together.", "Tell your rules!"],
   lang: ["Kids should ___.", "Parents should ___.", "Our best rule is ___!"]
  },
  speech: {
   time: "1 min",
   model: ["Hello! I'm Dami.", "I am ten. I am still a child.", "I like school uniforms. They are easy.", "Teens have many problems, like tests.", "I like K-pop more than rock music.", "Thank you!"],
   outline: ["Name / age", "Child or teen?", "Uniforms?", "Teen problems", "Music I like"],
   check: ["Loud voice", "Say I think …", "Say 5 things"]
  },
  pron: {
   cols: [["-teen  • ●", ["thirteen", "fifteen", "nineteen"]], ["-ty  ● •", ["thirty", "fifty", "ninety"]], ["teen", ["teenager", "teens", "teenage"]]],
   up: "Do you like rock music?",
   down: "What do teenagers like to do?"
  },
  review: ["I can give my opinion.", "I can use many and much.", "I can talk about teen life.", "I can say one more sentence."]
 },
 H: {
  steps: ["Answer", "Reason", "Example", "Ask back"],
  model: [
   ["Parents don't understand that teens need privacy.", "We need space to grow.", "My mom once read my messages, and it hurt.", "Did you have privacy as a teen?"],
   ["Teens don't understand how much parents worry.", "Parents know the world can be dangerous.", "Once I came home late, and my dad was scared.", "Do parents worry too much?"],
   ["Yes, I think uniforms are good for students.", "Nobody is judged by expensive clothes.", "At my school, rich and poor kids look the same.", "Did you wear a uniform?"],
   ["Yes, it matters.", "Words show respect for other people.", "Some of my classmates swear all the time, and it sounds rude.", "Do you think swearing is a big deal?"],
   ["It's a good idea, but only step by step.", "Teens learn responsibility from freedom.", "I got a later curfew after I proved I was careful.", "How much freedom did you have as a teen?"],
   ["Teenagers like to hang out and be online.", "Friends are the center of their world.", "My friends and I play games and chat until late.", "What did you like to do as a teen?"],
   ["I think I'm somewhere in between.", "I make choices, but I still need help.", "I can cook, but my parents pay for everything.", "When did you feel like an adult?"],
   ["Teens face pressure from school and social media.", "They compare themselves to others.", "My friends stress about grades and likes.", "What was your biggest teen problem?"],
   ["No, it isn't.", "A young brain and body can be damaged by alcohol.", "In Korea, it's even illegal until you're nineteen.", "What do you think the drinking age should be?"],
   ["I think rock music today is less popular.", "Most teens listen to K-pop and hip-hop now.", "But rock festivals still draw big crowds.", "What kind of music did you grow up with?"]
  ],
  frame: [
   "Parents don't understand that teens …",
   "Teens don't understand that parents …",
   "Yes/No, uniforms are … because …",
   "Yes/No, it matters because …",
   "I think it's a good/bad idea because …",
   "Teenagers like to … because …",
   "I think I'm … because …",
   "Teens face problems like … because …",
   "No, it isn't. … For example, …",
   "I think rock music today is … because …"
  ],
  more: [
   ["How can parents and teens understand each other?", "Should parents check teens' phones?", "Is the generation gap bigger now?"],
   ["What's the hardest part of being a parent?", "Would you be a strict parent?", "What did your parents do right?"],
   ["Should uniforms be banned?", "Do uniforms help students focus?", "What would your ideal uniform be?"],
   ["Why do teens use bad language?", "Should schools punish swearing?", "Is online bad language worse?"],
   ["At what age should teens have phones?", "Should teens have a curfew?", "Can too much freedom be dangerous?"],
   ["Are teens today different from 20 years ago?", "Do teens spend too much time online?", "What hobby should every teen try?"],
   ["When does a child become an adult?", "Is 19 too young to vote?", "What makes someone mature?"],
   ["How can schools help stressed teens?", "Is social media good or bad for teens?", "Who should teens talk to about problems?"],
   ["Why do some teens try drinking?", "Should the drinking age be higher?", "How can parents talk about it?"],
   ["Is rock music dying?", "Can music change society?", "Should parents choose their kids' music?"]
  ],
  gram1: {
   chain: ["I don't have much ___, but I have many ___.", "Teenagers need more ___ and less ___."],
   ex: "T: I don't have much time, but I have many ideas.<br>S: I don't have much money, but I have many friends.<br>T: Teens need more sleep …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["How much freedom did you have as a teen?", "How many hours do you sleep?", "How much homework is too much?", "How many close friends do you have?", "How much money do teens need?"],
    ans: "I think … <b>+ a reason</b>"
   },
   b: {
    title: "Teens today",
    big: "Teens today have too much ___ and too many ___, but not enough ___.",
    ans: "Then ask: <b>Do you agree? Why?</b>"
   }
  },
  opener: { think: ["What was the best age of your life so far? Why?", "Is being a teenager harder now than before?", "What makes someone an adult?"] },
  convo: [
   ["A", "You look stressed. What's up?"],
   ["B", "My parents took my {phone} away."],
   ["A", "Oh no. What happened?"],
   ["B", "I came home {an hour} late. I forgot to call."],
   ["A", "Well, they were probably really worried."],
   ["B", "I know, but I need more {freedom}. I'm sixteen!"],
   ["A", "Maybe show them you're responsible first."],
   ["B", "Like what?"],
   ["A", "Call them every time. Then ask for a later {curfew}."]
  ],
  swap: [["something taken away", "phone"], ["how late", "an hour"], ["something teens want", "freedom"], ["a rule", "curfew"]],
  lang: [
   ["Give opinions", ["In my opinion, …", "I strongly believe …", "It seems to me that …"]],
   ["Understand both sides", ["On the one hand, …", "On the other hand, …"]],
   ["Ask for opinions", ["Where do you stand on …?", "What's your take?"]],
   ["Agree / disagree", ["I couldn't agree more.", "I see it differently."]]
  ],
  langPractice: ["Teens should have no curfew.", "School uniforms kill creativity.", "Parents never understand teens.", "Rock music is dead.", "Teens today are lazy.", "18 is too young to be an adult."],
  survey: {
   ask: "Should teens",
   cols: ["Me", "My teacher", "Why?"],
   rows: ["wear uniforms", "have a curfew", "have smartphones at 12", "get a part-time job", "choose their own clothes", "vote at 16"],
   q: "Should teens …? → Ask: Why? / At what age?",
   report: "My teacher and I agree about ___, but we disagree about ___."
  },
  gap: {
   who: "Ella (16)",
   q: ["What does Ella like to do?", "How much freedom does she have?", "What is her biggest problem?", "How does she get along with her parents?", "What music does she like? Why?"],
   A: [["likes to", "make videos"], ["freedom", "?"], ["biggest problem", "?"], ["parents", "close to her mom"], ["music", "?"]],
   B: [["likes to", "?"], ["freedom", "curfew at 10 p.m."], ["biggest problem", "exam stress"], ["parents", "?"], ["music", "rock — it's honest"]],
   tip: "How <b>much</b> freedom? · How <b>many</b> rules?"
  },
  role: {
   A: ["You host a talk show about teens.", "Ask 5 questions + 2 follow-ups.", "Sum up the guest's main message."],
   B: ["You are a 16-year-old guest.", "Talk about freedom, parents and problems.", "Give reasons and a real example."]
  },
  tts: {
   title: "Write \"A Deal Between Teens and Parents\"",
   steps: ["Think: what do teens and parents fight about?", "Ask your teacher the parent side.", "Agree on 3 fair rules.", "Present your deal in 1 minute."],
   lang: ["Teens should ___ if parents ___.", "That's fair, but ___.", "So our deal is ___."]
  },
  speech: {
   time: "2 min",
   model: ["Hi everyone. Is it hard to be a teenager today? I think it is.", "Teens face many problems, like exams and social media.", "Many parents don't understand how much pressure we feel.", "But teens don't always understand that parents worry.", "I believe teens need freedom, step by step.", "For example, I got a later curfew after I showed I was careful.", "Thanks for listening! What do you think?"],
   outline: ["Hook — a question", "Teen problems", "Parents' side", "Teens' side", "My opinion + example", "Ask the audience"],
   check: ["Clear voice", "Opinion language", "Reasons and examples", "Answer 1 question"]
  },
  pron: {
   cols: [["-teen  • ●", ["thirteen", "sixteen", "eighteen"]], ["-ty  ● •", ["thirty", "sixty", "eighty"]], ["teen", ["teenager", "teenage", "in my teens"]]],
   up: "Should teens have a curfew?",
   down: "How much freedom did you have?"
  },
  review: ["I can answer in 4 parts.", "I can use many / much.", "I can see both sides.", "I can give a strong opinion."]
 }
};
