// SIU BASIC 008 — 단원 파일(8판 형식). 본보기: units/001.mjs
// 원본과 다른 점:
//  - 단원 이름 "Celebrations Special Days" → "Celebrations and Special Days"
//  - Q1 "New Year's day" → "New Year's Day" · Q4~Q6 "memorial day" 등 명절 이름 대문자
//  - Q7 "Are you fun of celebrating children's day?" → "Are you a fan of Children's Day?"
//  - Q8 답 틀 "The most difficult part is" (질문과 안 맞음) → "We celebrate it by …"
//  - Q9 "(e.g. Santa Claus)" 괄호 정리, 답 틀 "My favorite holiday hastinas"(깨짐) → "My favorite holiday character is …"
//  - Q10 답 틀 "we do/dont" → "we do / we don't"
//  - 문법 설명 "continuous into the present" → "continues into the present"
//  - Keyword "Children" 정의(법률 문구)를 쉬운 말로 바꿈 · Q4 는 한국의 3·1절(March 1st)로 풀어 씀
export default {
 no: "008",
 title: "Celebrations and Special Days",
 book: "SIU BASIC 008 - Celebrations and Special Days",
 next: "009 Concerning You",
 cover: { h1: "Celebrations", em: "& Special Days", goals: ["Talk about holidays", "Say how long with have been + -ing", "Give a short presentation"] },
 KW: [
  ["New Year", "noun", "새해", "the start of a new year"],
  ["birthday", "noun", "생일", "the day you were born, every year"],
  ["celebrate", "verb", "축하하다, 기념하다", "to do something fun for a special day"],
  ["independence", "noun", "독립", "being free to rule yourself"],
  ["memorial", "noun", "추모, 기념비", "something that helps people remember"],
  ["liberation", "noun", "해방", "being set free"],
  ["children", "noun", "어린이들", "young boys and girls"],
  ["Buddha", "noun", "부처님", "the teacher who started Buddhism"],
  ["favorite", "adjective", "제일 좋아하는", "liked more than all the others"],
  ["Easter", "noun", "부활절", "a Christian spring holiday with eggs"]
 ],
 QS: [
  "Will you celebrate New Year's Day with your friends?",
  "How do you celebrate your birthday?",
  "Is celebrating Chuseok part of your family tradition?",
  "How do you celebrate Independence Day?",
  "How do you celebrate Memorial Day?",
  "How do you celebrate Liberation Day?",
  "Are you a fan of Children's Day?",
  "How do you celebrate Buddha's Birthday?",
  "Who is your favorite holiday character (like Santa Claus)? Why?",
  "Do you celebrate Easter in your country?"
 ],
 IMG_E: ["scene-words/18883", "scene-words/12216", "scene-words/18654", "scene-words/15484", "scene-words/15031", "scene-words/18051", "scene-words/12274", "scene-words/16627", "scene-words/19102", "scene-words/15356"],
 IMG_H: ["scene-words/16783", "scene-words/16614", "scene-words/15269", "scene-words/16844", "scene-words/15031", "scene-words/18051", "scene-words/16287", "scene-words/18054", "scene-words/12133", "scene-words/18430"],
 PICS: {
  opener: "scene-words/18053",
  talk: "scene-words/19411",
  group: "scene-words/12526",
  speech: "scene-words/16400",
  reporter: "scene-words/13053",
  survey: "scene-words/12152",
  pron: "scene-words/18360",
  roleB: "scene-words/15597",
  cover: "scene-words/18646",
  back: "scene-clips/7482"
 },
 gram1: {
  can: "say how long with have been + -ing",
  title: "Present Perfect",
  em: "Continuous",
  rules: [
   ["Started in the past", "We <b>have been celebrating</b> it for years."],
   ["Still going now", "She <b>has been cooking</b> since 10 a.m."]
  ],
  hardNote: "for + a time · since + a start · How long…?",
  say: ["This tense shows an action that started in the past and is still going on.", "We have been celebrating it for years.", "She has been cooking since 10 a.m."]
 },
 gram2: {
  can: "ask \"How long have you been…?\"",
  cols: ["I · you · we · they", "he · she · it"],
  rows: [
   ["+", "I <b>have been</b> wait<mark>ing</mark>.", "She <b>has been</b> wait<mark>ing</mark>."],
   ["−", "We <b>haven't been</b> sleeping.", "He <b>hasn't been</b> sleeping."],
   ["?", "<b>Have</b> you <b>been</b> studying?", "<b>Has</b> it <b>been</b> raining?"]
  ]
 },
 gapCan: "ask \"How long has she been…?\"",
 role: {
  title: "The",
  em: "Holiday",
  tail: "Interview",
  opener: "Hi! Can you tell our viewers about your favorite holiday?",
  a: "TV reporter",
  b: "Visitor"
 },
 pron: {
  can: "say th and holiday dates",
  title: "The",
  em: "th sound",
  game: "Teacher says a holiday → you say its date → you make a sentence: <i>\"Children's Day is on May 5th.\"</i>"
 },
 E: {
  steps: ["Answer", "More"],
  model: [
   ["No, I won't. I will celebrate with my family.", "We eat tteokguk together."],
   ["I celebrate my birthday with a party.", "My friends come to my house."],
   ["Yes, it is.", "We make songpyeon every year."],
   ["We celebrate it with flags.", "It is on March 1st."],
   ["We remember brave people.", "It is on June 6th."],
   ["We celebrate it with flags and songs.", "It is on August 15th."],
   ["Yes, I am!", "I get presents from my parents."],
   ["We go to a temple.", "We see pretty lanterns."],
   ["My favorite holiday character is Santa Claus.", "He brings gifts to children."],
   ["No, we don't.", "But some of my friends paint eggs."]
  ],
  frame: [
   "Yes, I will. / No, I won't. I will celebrate with ___.",
   "I celebrate my birthday with ___.",
   "Yes, it is. We ___ every year.",
   "We celebrate it with ___.",
   "We ___. It is on June 6th.",
   "We celebrate it with ___.",
   "Yes, I am! I ___.",
   "We go to ___. We see ___.",
   "My favorite holiday character is ___.",
   "Yes, we do. / No, we don't. We ___."
  ],
  bank: [
   ["my family", "my friends", "my cousins", "tteokguk"],
   ["a party", "a cake", "my friends", "my family"],
   ["make songpyeon", "visit Grandma", "bow", "play yut"],
   ["flags", "songs", "a parade", "a day off"],
   ["remember heroes", "visit a memorial", "are quiet", "say thank you"],
   ["flags", "songs", "fireworks", "a day off"],
   ["get presents", "go to the zoo", "eat out", "play all day"],
   ["a temple", "lanterns", "my family", "flowers"],
   ["Santa Claus", "Rudolph", "a snowman", "kind / funny"],
   ["paint eggs", "go to church", "eat chocolate", "hunt eggs"]
  ],
  more: [
   ["What do you eat on New Year's Day?", "What is your New Year wish?"],
   ["When is your birthday?", "What is your best birthday gift?"],
   ["Where does your family meet?", "What food do you like?"],
   ["Do you go to school that day?", "What do you do at home?"],
   ["Who do you remember?", "Is it a happy or quiet day?"],
   ["Why is this day important?", "Do you hang a flag?"],
   ["What gift do you want?", "Where do you go?"],
   ["Do you like lanterns?", "What color is your lantern?"],
   ["What do you want from Santa?", "Do you like Christmas?"],
   ["What is Easter?", "Do you like chocolate eggs?"]
  ],
  gram1: {
   chain: ["I have been ___ for ___.", "I have been ___ since ___."],
   ex: "T: I have been teaching for 5 years.<br>S: I have been learning English for 2 years.<br>T: I have been …"
  },
  gram2: {
   a: {
    title: "How long have you been…",
    items: ["…learning English?", "…living in your home?", "…going to your school?", "…sitting here?", "…awake today?"],
    ans: "I have been … <b>for</b> … / <b>since</b> …"
   },
   b: {
    title: "Your family",
    big: "My mom has been ___ since ___.",
    ans: "Then ask: <b>What has your dad been doing?</b>"
   }
  },
  opener: { think: ["Look at the photo. What are they celebrating?", "What is your favorite holiday?", "How do you celebrate your birthday?"] },
  convo: [
   ["A", "Happy Chuseok, Jun!"],
   ["B", "Happy Chuseok! What are you doing today?"],
   ["A", "I'm visiting my {grandma}. We make {songpyeon}."],
   ["B", "Yum! How long have you been making it?"],
   ["A", "Since {10 o'clock}! How about you?"],
   ["B", "My family is going to {the park}."],
   ["A", "Have fun!"]
  ],
  swap: [["a family member", "grandma"], ["a holiday food", "songpyeon"], ["a time", "10 o'clock"], ["a place", "the park"]],
  lang: [
   ["Holiday greetings", ["Happy New Year!", "Happy birthday!", "Merry Christmas!"]],
   ["Show interest", ["Yum!", "Sounds fun!", "Cool!"]],
   ["Ask back", ["How about you?", "And you?"]]
  ],
  langPractice: ["My birthday is in May.", "We make songpyeon on Chuseok.", "I love Children's Day.", "I got a new bike!", "We go to a temple.", "I believe in Santa."],
  survey: {
   ask: "Do you",
   cols: ["Me", "My teacher"],
   rows: ["like birthday parties", "eat tteokguk on New Year's Day", "make songpyeon", "get presents on Children's Day", "like Christmas", "paint eggs at Easter"],
   q: "Do you …?  → Yes, I do. / No, I don't.",
   report: "I ___, but my teacher ___."
  },
  gap: {
   who: "Yuna",
   q: ["What is Yuna's favorite holiday?", "How does she celebrate her birthday?", "What has she been making?", "How long has she been making it?"],
   A: [["favorite holiday", "Chuseok"], ["birthday", "?"], ["making", "songpyeon"], ["how long", "?"]],
   B: [["favorite holiday", "?"], ["birthday", "a party with friends"], ["making", "?"], ["how long", "for 2 hours"]],
   tip: "She → <b>has been</b> mak<b>ing</b> · <b>for</b> 2 hours"
  },
  role: {
   A: ["You are a TV reporter.", "Ask 5 questions about holidays.", "Write short notes."],
   B: ["You are a visitor from abroad.", "Choose: from the USA / China / Mexico.", "Answer with 2 sentences."]
  },
  tts: {
   title: "Make a holiday card",
   steps: ["Choose a holiday.", "Ask your teacher how they celebrate it.", "Find one thing that is the same.", "Draw a card and tell!"],
   lang: ["On ___, we ___.", "My teacher celebrates with ___.", "Happy ___!"]
  },
  speech: {
   time: "1 min",
   model: ["Hello! My name is Yuna.", "My favorite holiday is Chuseok.", "It is in September or October.", "I visit my grandma and make songpyeon.", "I have been making it since I was six.", "Thank you!"],
   outline: ["Name", "Favorite holiday", "When it is", "What you do", "How long you've done it"],
   check: ["Loud voice", "Look at your teacher", "Say 5 things"]
  },
  pron: {
   cols: [
    ["/θ/", ["birthday", "three", "month"]],
    ["/ð/", ["the", "with", "together"]],
    ["dates", ["May 5th", "June 6th", "August 15th"]]
   ],
   up: "Is your birthday in May?",
   down: "How do you celebrate it?"
  },
  review: ["I can talk about holidays.", "I can use have been + -ing.", "I can ask \"How long have you been…?\"", "I can say one more sentence."]
 },
 H: {
  steps: ["Answer", "Reason", "Example", "Ask back"],
  model: [
   ["No, I won't. I'll celebrate it with my family.", "In Korea, it's a family holiday, not a party.", "We bow to our grandparents and eat tteokguk.", "How do people celebrate it in your country?"],
   ["I usually celebrate my birthday with a small dinner.", "I prefer a quiet day with people I love.", "Last year, my friends surprised me with a cake at school.", "What's the best birthday you've ever had?"],
   ["Yes, it has been our tradition for many years.", "It's the only time the whole family gets together.", "We've been making songpyeon since I was little.", "What traditions does your family have?"],
   ["We celebrate Independence Movement Day on March 1st.", "It reminds us of people who fought for freedom.", "Many families hang a flag and learn about 1919.", "Does your country have a similar day?"],
   ["On Memorial Day, we remember people who died for Korea.", "It's a quiet and serious day, not a party.", "At 10 a.m., a siren sounds and everyone stands still.", "How do you think we should honor heroes?"],
   ["We celebrate Liberation Day on August 15th.", "It's the day Korea became free in 1945.", "There are ceremonies, and many people hang flags.", "What does freedom mean to you?"],
   ["Yes, I'm a big fan of Children's Day!", "It's a day just for kids to have fun.", "Last year, my family took me to an amusement park.", "Should adults have a special day too?"],
   ["We celebrate Buddha's Birthday at a temple.", "Even people who aren't Buddhist enjoy the festival.", "We've been going to the lantern parade for years.", "Have you ever seen a lantern festival?"],
   ["My favorite holiday character is Santa Claus.", "He stands for kindness and giving.", "As a child, I left cookies for him every year.", "Did you believe in Santa as a child?"],
   ["Not really. Easter isn't a big holiday in Korea.", "Only some churches celebrate it.", "My church gives out painted eggs every spring.", "How do people celebrate Easter where you're from?"]
  ],
  frame: [
   "Yes, I will / No, I won't … because …",
   "I usually celebrate by … Last year, …",
   "Yes, it has been our tradition … because …",
   "We celebrate it by … It reminds us of …",
   "On Memorial Day, we … because …",
   "We celebrate it by … It's important because …",
   "Yes / No, I'm … because … Last year, …",
   "We celebrate it by … We've been … for …",
   "My favorite holiday character is … because …",
   "Yes, we do / No, we don't … because …"
  ],
  more: [
   ["Do you make New Year's resolutions?", "Is the solar or lunar New Year more important?", "What would you like to change this year?"],
   ["Are birthday parties becoming too expensive?", "What makes a birthday gift special?", "Which birthday do you remember most?"],
   ["Are young people losing interest in traditions?", "Should traditions change over time?", "Which tradition would you keep forever?"],
   ["Why is it important to learn history?", "How can schools teach about this day?", "Which hero from Korean history do you admire?"],
   ["Should Memorial Day be quiet or a festival?", "How can young people honor veterans?", "Is it important to visit memorials? Why?"],
   ["What would Korea be like without liberation?", "How do other countries celebrate freedom?", "Should everyone know the national anthem?"],
   ["Are children too busy these days?", "What should parents give children on this day?", "What was your best Children's Day?"],
   ["Can people enjoy a religious holiday without the religion?", "Why are lanterns used in many festivals?", "What can festivals teach us about culture?"],
   ["Is it OK to tell children that Santa is real?", "Why do holidays need characters?", "Invent a new holiday character. What is it like?"],
   ["Why do some holidays spread to other countries?", "Should Korea have more foreign holidays?", "Which foreign holiday would you like to try?"]
  ],
  gram1: {
   chain: ["Lately, I've been ___.", "Since last year, I've been ___."],
   ex: "T: Lately, I've been baking bread.<br>S: Lately, I've been playing tennis.<br>T: Since last year, I've been …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["How long have you been studying English?", "What have you been doing this week?", "Have you been sleeping well lately?", "How long have you been living in your city?", "What have you been reading lately?"],
    ans: "I've been … <b>for</b> … / <b>since</b> … <b>+ one more sentence</b>"
   },
   b: {
    title: "Holiday prep",
    big: "Before the holiday, my family has been ___ since ___.",
    ans: "Then ask: <b>What have you been preparing?</b>"
   }
  },
  opener: {
   think: [
    "Why do people need special days and holidays?",
    "Which holiday means the most to your family? Why?",
    "Are holidays today more about fun or about meaning?"
   ]
  },
  convo: [
   ["A", "Hey! You look tired. What have you been doing?"],
   ["B", "I've been {cooking for Chuseok} all morning."],
   ["A", "Really? For how long?"],
   ["B", "Since {7 a.m.}! My whole family is coming over."],
   ["A", "Wow. What are you making?"],
   ["B", "{Jeon} and songpyeon. It's our family tradition."],
   ["A", "That sounds like a lot of work."],
   ["B", "It is, but it's worth it. What about you?"],
   ["A", "I'm going to {Jeju} with my friends."]
  ],
  swap: [["an activity", "cooking for Chuseok"], ["a time", "7 a.m."], ["a food", "Jeon"], ["a place", "Jeju"]],
  lang: [
   ["Holiday greetings", ["Happy holidays!", "Have a great Chuseok!"]],
   ["Ask how long", ["How long have you been …?", "Since when?"]],
   ["Show interest", ["That sounds like fun!", "No way!"]],
   ["Agree / disagree", ["I think so too.", "I'm not so sure."]]
  ],
  langPractice: ["I don't celebrate my birthday.", "Chuseok is too much work.", "I've been saving money for gifts.", "Christmas is my favorite holiday.", "Adults need a Children's Day too.", "Holidays are too commercial."],
  survey: {
   ask: "Have you ever",
   cols: ["Me", "My teacher", "One more question"],
   rows: ["been to a lantern festival", "had a surprise party", "made songpyeon", "visited a memorial", "celebrated a foreign holiday", "seen a New Year's countdown"],
   q: "Have you ever …? → Yes. → Ask: When? / Where? / How was it?",
   report: "My teacher and I both ___, but only I ___."
  },
  gap: {
   who: "Yuna",
   q: ["What is her favorite holiday? Why?", "How does she celebrate her birthday?", "What has she been preparing?", "How long has she been doing it?", "Who is her favorite character?"],
   A: [["favorite + why", "Chuseok — family time"], ["birthday", "?"], ["preparing", "?"], ["how long", "since last week"], ["favorite character", "?"]],
   B: [["favorite + why", "?"], ["birthday", "dinner with her grandma"], ["preparing", "a Christmas play"], ["how long", "?"], ["favorite character", "Santa — he's kind"]],
   tip: "She → <b>has been</b> prepar<b>ing</b>"
  },
  role: {
   A: ["You host a travel show.", "Ask 5 questions + 2 follow-ups.", "Compare it with a Korean holiday."],
   B: ["You are visiting Korea.", "Choose: USA (Thanksgiving) / China / Mexico.", "Explain how you celebrate, with reasons."]
  },
  tts: {
   title: "Invent a new holiday",
   steps: ["Think: what should we celebrate?", "Ask your teacher 4 of today's questions.", "Agree on a name, date and 3 activities.", "Present your holiday in 1 minute."],
   lang: ["We should celebrate ___ because ___.", "On this day, people will ___.", "That's a good idea, but ___."]
  },
  speech: {
   time: "2 min",
   model: [
    "Hi everyone. Let me tell you about my favorite holiday.",
    "It's Chuseok, the Korean harvest festival.",
    "It's usually in September, and it lasts three days.",
    "We visit my grandparents and make songpyeon together.",
    "We've been doing this since I was a baby.",
    "For me, it's not about food, but about family.",
    "Thanks for listening! Any questions?"
   ],
   outline: ["Hook — \"Let me tell you…\"", "Holiday + what it is", "When it is", "What your family does", "How long you've been doing it", "Why it matters to you"],
   check: ["Clear voice", "Eye contact", "have been + -ing", "Answer 1 question"]
  },
  pron: {
   cols: [
    ["/θ/", ["birthday", "Thanksgiving", "thirtieth"]],
    ["/ð/", ["the", "together", "gather"]],
    ["dates", ["March 1st", "June 6th", "August 15th"]]
   ],
   up: "Have you been to a festival?",
   down: "How long have you been waiting?"
  },
  review: ["I can answer in 4 parts.", "I can use the present perfect continuous.", "I can explain Korean holidays.", "I can give a short presentation."]
 }
};
