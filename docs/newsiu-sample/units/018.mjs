// SIU BASIC 018 — Health (8판 형식, 001 본보기와 같은 모양)
// 원본과 다른 점:
//  Q1 "How often you go to a gym for exercise?" → "How often do you go to the gym to exercise?" (do 빠짐·관사)
//  Q2 "Do think that you need to lose weight?" → "Do you think that you need to lose weight?" (you 빠짐)
//  Q3 "Po you ever get migraine or headaches?" → "Do you ever get migraines or headaches?" (오타·복수)
//  Q9 "What kind of pollution is the most risky?" → "…the most dangerous?" (자연스러운 말)
//  KW medical: 원본 뜻풀이는 «건강검진(a medical)» 명사 뜻 → 형용사 뜻(의료의)으로 바로잡음
//  KW exercise·supplement·pollution·allergy 뜻풀이를 쉬운 영어로 줄임
export default {
 no: "018",
 title: "Health",
 book: "SIU BASIC 018 - Health",
 next: "019 Jobs",
 cover: { h1: "Stay", em: "Healthy", goals: ["Talk about health habits", "Ask and answer 10 questions", "Give a short health talk"] },
 KW: [
  ["exercise", "noun", "운동", "activity that moves your body and keeps you fit"],
  ["weight", "noun", "몸무게", "how heavy a person or thing is"],
  ["headache", "noun", "두통", "a pain inside your head"],
  ["medical", "adjective", "의료의", "about doctors and keeping your body healthy"],
  ["dentist", "noun", "치과의사", "a doctor who takes care of your teeth"],
  ["allergy", "noun", "알레르기", "when your body reacts badly to food, dust or pollen"],
  ["supplement", "noun", "영양제", "a pill you take to add something good to your diet"],
  ["donate", "verb", "기부하다", "to give something to help people"],
  ["pollution", "noun", "오염", "dirty air, water or land that can hurt living things"],
  ["sick", "adjective", "아픈", "not well or healthy"]
 ],
 QS: [
  "How often do you go to the gym to exercise?",
  "Do you think that you need to lose weight?",
  "Do you ever get migraines or headaches?",
  "Do you go for regular medical check-ups?",
  "How often do you go to the dentist?",
  "Do you have any allergies?",
  "Do you take vitamins or mineral supplements?",
  "Have you ever donated blood?",
  "What kind of pollution is the most dangerous?",
  "When was the last time you were sick?"
 ],
 IMG_E: ["scene-words/19206", "scene-clips/7388", "scene-words/15450", "scene-words/14666", "scene-words/12077", "scene-words/18953", "scene-words/15817", "scene-words/13134", "scene-words/13185", "scene-words/12260"],
 IMG_H: ["scene-words/16746", "scene-words/16581", "scene-words/15450", "scene-words/20116", "scene-words/19679", "scene-words/18513", "scene-words/15816", "scene-words/17312", "scene-words/20314", "scene-words/18991"],
 PICS: {
  opener: "scene-words/18959", talk: "scene-words/10010", group: "scene-words/18442", speech: "scene-words/12691",
  reporter: "scene-words/12381", survey: "scene-words/12199", pron: "scene-words/19073", roleB: "scene-words/12260",
  cover: "scene-words/15192", back: "scene-clips/7179"
 },
 gram1: {
  can: "use countable and uncountable nouns",
  title: "Count it?",
  em: "Yes or No",
  rules: [
   ["Countable", "I eat <b>an apple</b>. I eat <b>two apples</b>."],
   ["Uncountable", "I drink <b>water</b>. (no a, no -s)"]
  ],
  hardNote: "many · a few + countable   |   much · a little + uncountable",
  say: [
   "Countable nouns can be counted. Uncountable nouns cannot be counted.",
   "I eat an apple. I eat two apples.",
   "I drink water."
  ]
 },
 gram2: {
  can: "ask \"How many…?\" and \"How much…?\"",
  cols: ["Countable", "Uncountable"],
  rows: [
   ["+", "I take <b>a vitamin</b> every day.", "I drink <b>some water</b> every day."],
   ["−", "I don't have <b>any allergies</b>.", "I don't eat <b>much sugar</b>."],
   ["?", "<b>How many</b> times do you exercise?", "<b>How much</b> water do you drink?"]
  ]
 },
 gapCan: "ask \"How often does she…?\"",
 role: { title: "At the", em: "Clinic", tail: "", opener: "Hello! What seems to be the problem today?", a: "Doctor", b: "Patient" },
 pron: { can: "stress the right part of a word", title: "Word", em: "Stress", game: "Teacher says a word → you clap the strong part → you make a sentence: <i>\"I see the DEN-tist.\"</i>" },
 E: {
  steps: ["Answer", "More"],
  model: [
   ["I exercise three times a week.", "I play soccer at school."],
   ["No, I don't. I am healthy.", "I eat fruit and vegetables."],
   ["Yes, I do. I get headaches sometimes.", "I rest when my head hurts."],
   ["Yes, I do. I go once a year.", "The doctor checks my height."],
   ["I go to the dentist two times a year.", "I brush my teeth every day."],
   ["Yes, I do. I have a dust allergy.", "I sneeze a lot."],
   ["Yes, I do. I take vitamins every morning.", "My mom gives them to me."],
   ["No, I haven't. I am too young.", "My dad donates blood."],
   ["I think air pollution is the most dangerous.", "It is bad for our lungs."],
   ["I was sick last month.", "I had a cold and a fever."]
  ],
  frame: [
   "I exercise ___ times a week.",
   "No, I don't. I am ___. / Yes, I do.",
   "Yes, I do. I get ___ sometimes. / No, I don't.",
   "Yes, I do. I go once a ___.",
   "I go to the dentist ___ times a year.",
   "Yes, I do. I have a ___ allergy. / No, I don't.",
   "Yes, I do. I take ___ every ___.",
   "No, I haven't. / Yes, I have.",
   "I think ___ pollution is the most dangerous.",
   "I was sick last ___. I had a ___."
  ],
  bank: [
   ["two", "three", "four", "run / swim"],
   ["healthy", "strong", "active", "fit"],
   ["headaches", "stomachaches", "colds", "toothaches"],
   ["year", "month", "check-up", "doctor"],
   ["one", "two", "three", "brush / floss"],
   ["dust", "food", "pollen", "cat"],
   ["vitamins", "fish oil", "morning", "day"],
   ["too young", "scared", "blood", "help people"],
   ["air", "water", "trash", "noise"],
   ["week", "month", "cold", "fever"]
  ],
  more: [
   ["What exercise do you like?", "Who do you exercise with?"],
   ["What healthy food do you eat?", "Do you eat snacks?"],
   ["What do you do then?", "Do you drink water?"],
   ["Do you like doctors?", "Are you scared of shots?"],
   ["Is the dentist scary?", "How often do you brush?"],
   ["What makes you sneeze?", "What do you do then?"],
   ["What vitamin do you take?", "Do they taste good?"],
   ["Would you like to donate?", "What else can you give?"],
   ["What makes the air dirty?", "What can we do?"],
   ["What did you do?", "Who took care of you?"]
  ],
  gram1: {
   chain: ["I eat ___ apples. (countable)", "I drink some ___. (uncountable)"],
   ex: "T: I eat two bananas every day.<br>S: I drink some milk every day.<br>T: I …"
  },
  gram2: {
   a: { title: "Ask 4 times", items: ["How much milk do you drink?", "How many eggs do you eat?", "How many hours do you sleep?", "How much candy do you eat?"], ans: "A lot. / A little. <b>+ one more sentence</b>" },
   b: { title: "My healthy day", big: "I eat a lot of ___. I don't eat much ___.", ans: "Then ask: <b>How much … do you eat?</b>" }
  },
  opener: { think: ["Look at the photo. What are they doing?", "Are you healthy? Why?", "What do you do to stay healthy?"] },
  convo: [
   ["A", "Hi, Jun! You look tired. Are you OK?"],
   ["B", "I have a {headache}."],
   ["A", "Oh no! Did you drink water today?"],
   ["B", "Only a little. I drank {soda}."],
   ["A", "Drink some water. It helps!"],
   ["B", "OK. What do you do to stay healthy?"],
   ["A", "I {ride my bike} every day. It's fun!"]
  ],
  swap: [["a problem", "headache"], ["a drink", "soda"], ["a good drink", "water"], ["exercise", "ride my bike"]],
  lang: [
   ["Show you care", ["Are you OK?", "Oh no!", "Poor you!"]],
   ["Give advice", ["Drink some water.", "Get some rest."]],
   ["Say one more", ["It helps!", "I also …"]]
  ],
  langPractice: ["I have a headache.", "I have a cold.", "I ran 1 km today.", "I don't eat vegetables.", "My tooth hurts.", "I sleep 10 hours."],
  survey: {
   ask: "Do you",
   cols: ["Me", "My teacher"],
   rows: ["exercise every day", "drink a lot of water", "eat vegetables", "sleep 8 hours", "brush your teeth 3 times a day", "eat a lot of candy"],
   q: "Do you …?  → Yes, I do. / No, I don't.",
   report: "I ___, but my teacher ___."
  },
  gap: {
   who: "Sora",
   q: ["How often does Sora exercise?", "What sport does she play?", "Does she have an allergy?", "What does she drink every day?"],
   A: [["exercises", "3 times a week"], ["sport", "?"], ["allergy", "cats"], ["drinks", "?"]],
   B: [["exercises", "?"], ["sport", "tennis"], ["allergy", "?"], ["drinks", "a lot of water"]],
   tip: "How often <b>does</b> she …? · She play<b>s</b> · She drink<b>s</b>"
  },
  role: {
   A: ["You are a doctor.", "Ask 5 questions.", "Give one piece of advice."],
   B: ["You are a patient.", "Choose: headache / cold / toothache.", "Answer with 2 sentences."]
  },
  tts: {
   title: "Make a healthy week plan",
   steps: ["Pick 3 healthy habits.", "Ask your teacher about them.", "Choose the best 3 together.", "Show your plan and tell!"],
   lang: ["On Monday, I will ___.", "I will eat a lot of ___.", "I won't eat much ___."]
  },
  speech: {
   time: "1 min",
   model: ["Hello! My name is Yuna.", "I am healthy and strong.", "I exercise three times a week.", "I eat a lot of fruit.", "I don't eat much candy.", "Thank you!"],
   outline: ["Name", "Exercise", "Healthy food", "Food I don't eat much", "Thank you!"],
   check: ["Loud voice", "Look at the camera", "Say 5 things"]
  },
  pron: {
   cols: [["Oo", ["DOC-tor", "DEN-tist", "HEAD-ache"]], ["Ooo", ["EX-er-cise", "VI-ta-min", "MED-i-cal"]], ["oOo", ["pol-LU-tion", "to-MOR-row", "ba-NA-na"]]],
   up: "Are you sick?",
   down: "Where does it hurt?"
  },
  review: ["I can talk about my health.", "I can use a / some / much / many.", "I can ask \"How often do you …?\"", "I can give one piece of advice."]
 },
 H: {
  steps: ["Answer", "Reason", "Example", "Ask back"],
  model: [
   ["I go to the gym about three times a week.", "It helps me handle stress from school.", "I usually run on the treadmill for thirty minutes.", "How often do you work out?"],
   ["Honestly, I think I should lose a little weight.", "I've been eating too much fast food lately.", "I'm trying to walk home instead of taking the bus.", "Do you watch what you eat?"],
   ["Yes, I get headaches when I'm stressed.", "I think it's because I sleep too little.", "Before exams, I sometimes get one every day.", "What do you do when you have a headache?"],
   ["Yes, I have a check-up once a year.", "It's better to find problems early.", "Last time, the doctor checked my eyes and blood.", "Do you think check-ups are necessary?"],
   ["I go to the dentist about twice a year.", "I had a painful cavity once, so I'm careful now.", "They clean my teeth and take X-rays.", "Are you scared of the dentist?"],
   ["Yes, I'm allergic to pollen.", "Every spring my eyes get itchy and red.", "I take allergy medicine in April and May.", "Do you have any allergies?"],
   ["Yes, I take vitamin C and fish oil.", "I don't always eat enough fruit.", "I keep them next to my toothbrush so I don't forget.", "Do you think supplements really work?"],
   ["No, I haven't, but I'd like to someday.", "One donation can help save a life.", "My uncle donates blood every few months.", "Would you ever donate blood?"],
   ["I think air pollution is the most dangerous.", "We can't avoid breathing, so it affects everyone.", "On fine dust days, many people wear masks.", "Which kind worries you the most?"],
   ["I was sick about two weeks ago.", "I caught a bad cold from my classmate.", "I had a fever, so I stayed home for two days.", "When were you last sick?"]
  ],
  frame: [
   "I go to the gym … times a week because …",
   "I think I (don't) need to … because …",
   "Yes, I get headaches when … / No, I rarely …",
   "Yes, I have a check-up … It's important because …",
   "I go to the dentist about … a year. Last time, …",
   "Yes, I'm allergic to … / No, I don't have any …",
   "Yes, I take … because … / No, I don't because …",
   "No, I haven't, but … / Yes, I have. It felt …",
   "I think … pollution is the most dangerous because …",
   "I was sick … ago. I had … so I …"
  ],
  more: [
   ["Is it better to exercise alone or with friends?", "What stops people from exercising?", "Should gyms be free for students?"],
   ["Why do many people worry about their weight?", "Does social media affect how we see our bodies?", "What is a healthy way to lose weight?"],
   ["What causes stress in your life?", "Do phones and screens give us headaches?", "How do you relax after a long day?"],
   ["Should check-ups be free for everyone?", "Why do some people avoid doctors?", "Do you trust health advice on the internet?"],
   ["Why are many people afraid of the dentist?", "Should schools teach how to brush teeth?", "Is sugar the biggest problem for teeth?"],
   ["Why do more people have allergies these days?", "Should restaurants list allergy foods on menus?", "How can allergies change your daily life?"],
   ["Is it better to get vitamins from food or pills?", "Why are supplements so popular in Korea?", "Can you take too many vitamins?"],
   ["Why don't more people donate blood?", "Should donors get a reward? Why or why not?", "What else can people donate to help others?"],
   ["What causes fine dust in Korea?", "What can one person do to reduce pollution?", "Should cars be banned in city centers?"],
   ["Should students go to school when they are a little sick?", "What home remedy do you believe in?", "How do you take care of a sick family member?"]
  ],
  gram1: {
   chain: ["I eat a lot of ___, but not many ___.", "I drink a little ___, but not much ___."],
   ex: "T: I eat a lot of rice, but not many apples.<br>S: I drink a little coffee, but not much milk.<br>T: I …"
  },
  gram2: {
   a: { title: "Ask 5 times", items: ["How much sleep do you get?", "How many hours do you sit a day?", "How much coffee do you drink?", "How many steps do you walk?", "How much time do you spend outside?"], ans: "Answer + <b>Is that enough? Why?</b>" },
   b: { title: "My habits", big: "I eat too much ___, but not enough ___. How much ___ do you eat?", ans: "Then ask: <b>How many … do you …?</b>" }
  },
  opener: { think: ["What does \"healthy\" mean to you — body, mind, or both?", "Which is harder: eating well or exercising?", "Are young people healthier today than 30 years ago?"] },
  convo: [
   ["A", "Hey, you don't look so good. What's wrong?"],
   ["B", "I've had a {headache} since this morning."],
   ["A", "That's awful. Did you sleep well last night?"],
   ["B", "Not really. I stayed up late {playing games}."],
   ["A", "That might be why. You should get more rest."],
   ["B", "You're right. I also skipped {breakfast}."],
   ["A", "Try to eat something and drink some water."],
   ["B", "Thanks. What do you do to stay healthy?"],
   ["A", "I {go swimming} twice a week. You should come!"]
  ],
  swap: [["a health problem", "headache"], ["a bad habit", "playing games"], ["a meal", "breakfast"], ["exercise", "go swimming"]],
  lang: [
   ["Show concern", ["What's wrong?", "That's awful.", "I'm sorry to hear that."]],
   ["Give advice", ["You should …", "Why don't you …?", "Try to …"]],
   ["Buy time", ["Hmm, let me think.", "That's a good question."]],
   ["Accept / refuse", ["Good idea, thanks.", "I'll try, but …"]]
  ],
  langPractice: ["I only sleep five hours a night.", "I drink three coffees a day.", "I never eat breakfast.", "My back hurts from sitting.", "I have a toothache.", "I want to lose weight fast."],
  survey: {
   ask: "Do you",
   cols: ["Me", "My teacher", "One more question"],
   rows: ["exercise three times a week", "drink enough water", "sleep 7 hours or more", "eat fast food often", "take supplements", "see a dentist every year"],
   q: "Do you …? → Yes. → Ask: How often? / Why? / Since when?",
   report: "My teacher and I both ___, but only I ___."
  },
  gap: {
   who: "Sora",
   q: ["How often does Sora exercise?", "What is she allergic to?", "How much water does she drink?", "When did she last see a doctor?", "What is her bad habit?"],
   A: [["exercises", "3 times a week — gym"], ["allergy", "?"], ["water", "2 liters a day"], ["last doctor visit", "?"], ["bad habit", "?"]],
   B: [["exercises", "?"], ["allergy", "cats and pollen"], ["water", "?"], ["last doctor visit", "last March — flu"], ["bad habit", "stays up late"]],
   tip: "How <b>much</b> water · How <b>many</b> times · <b>does</b> she"
  },
  role: {
   A: ["You are a doctor.", "Ask 5 questions + 2 follow-ups.", "Give 3 pieces of advice."],
   B: ["You are a patient.", "Choose: back pain / can't sleep / allergy.", "Explain when it started and why. Hide one bad habit — tell it only if asked \"Anything else?\""]
  },
  tts: {
   title: "Design a 7-day health challenge",
   steps: ["Think: what habit do most students need?", "Ask your teacher 4 of today's questions.", "Agree on 3 daily goals together.", "Present your challenge in 1 minute."],
   lang: ["I think we should include ___ because ___.", "That's a good idea, but ___.", "So we agree on ___."]
  },
  speech: {
   time: "2 min",
   model: [
    "Hi everyone. Today I'll talk about my health.",
    "I think I'm fairly healthy, but not perfect.",
    "I go to the gym three times a week to lower stress.",
    "I eat a lot of vegetables, but I drink too much soda.",
    "Every spring, my pollen allergy makes me sneeze.",
    "My goal is to sleep seven hours every night.",
    "I think small habits make the biggest difference.",
    "Thanks for listening! Any questions?"
   ],
   outline: ["Hook — \"Today I'll talk about…\"", "How healthy you are + why", "Exercise habit", "Food — too much / not enough", "A health problem", "A goal + ask for questions"],
   check: ["Clear voice", "Eye contact", "Reasons and examples", "Answer 1 question"]
  },
  pron: {
   cols: [["Oo", ["DEN-tist", "HEAD-ache", "DON-ate"]], ["Ooo", ["EX-er-cise", "VI-ta-min", "MED-i-cal"]], ["oOo", ["pol-LU-tion", "al-LER-gic", "ex-AM-ple"]]],
   up: "Do you have any allergies?",
   down: "How often do you exercise?"
  },
  review: ["I can answer in 4 parts.", "I can use much / many / a little / a few.", "I can give advice with \"You should …\".", "I can give a short health talk."]
 }
};
