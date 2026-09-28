// SIU BASIC 004 — 단원 파일(8판 형식). 본보기: units/001.mjs
// 원본과 다른 점:
//  - Q1 "How will you know if you are healthy?" → "How do you know if you are healthy?" · 답 틀 "You will know it by" → "You can tell by …"
//  - Q2 "What will you do to make you healthy?" → "What do you do to stay healthy?"
//  - Q5 "How will you know if a person is honest?" → "How can you tell if a person is honest?" · Honest 품사 noun → adjective
//  - Q6 "How would you know if a person is lazy?" → "How can you tell if a person is lazy?"
//  - Q10 "Which one is more important to you to be rich or to be happy?" → "Which is more important to you: being rich or being happy?"
//  - 문법 설명 "it describe Jane" → "it describes Jane", "Word of order" → "Word order"
export default {
 no: "004",
 title: "Are You",
 book: "SIU BASIC 004 - Are you",
 next: "005 At a Certain Age",
 cover: { h1: "Are", em: "You …?", goals: ["Describe people with adjectives", "Talk about health, happiness and success", "Put adjectives in the right order"] },
 KW: [
  ["know", "verb", "알다", "to have information about something"],
  ["healthy", "adjective", "건강한", "well and not sick"],
  ["nice", "adjective", "친절한", "kind and friendly"],
  ["smart", "adjective", "똑똑한", "quick at learning and thinking"],
  ["honest", "adjective", "정직한", "telling the truth; not lying or stealing"],
  ["lazy", "adjective", "게으른", "not wanting to work or try hard"],
  ["happiness", "noun", "행복", "the feeling of being happy"],
  ["success", "noun", "성공", "getting what you worked for"],
  ["college", "noun", "대학", "a school you can go to after high school"],
  ["important", "adjective", "중요한", "having great value; you need it"]
 ],
 QS: [
  "How do you know if you are healthy?",
  "What do you do to stay healthy?",
  "What are some examples of being nice to others?",
  "How do you know if a person is smart or intelligent?",
  "How can you tell if a person is honest?",
  "How can you tell if a person is lazy?",
  "What is the meaning of happiness?",
  "What is the meaning of success?",
  "Why is it important to finish college?",
  "Which is more important to you: being rich or being happy?"
 ],
 IMG_E: ["scene-words/12381", "scene-words/12199", "scene-words/12109", "scene-words/12418", "scene-words/18467", "scene-words/12417", "scene-words/15384", "scene-words/12718", "scene-words/16603", "scene-words/17107"],
 IMG_H: ["scene-words/18442", "scene-words/12268", "scene-words/14245", "scene-words/18369", "scene-words/19750", "scene-clips/7484", "scene-words/18056", "scene-words/17260", "scene-words/14254", "scene-words/18636"],
 PICS: {
  opener: "scene-words/13329", talk: "scene-clips/7115", group: "scene-words/18121", speech: "scene-words/15095",
  reporter: "scene-words/16345", survey: "scene-clips/7445", pron: "scene-clips/7170", roleB: "scene-words/16344",
  cover: "scene-words/12274", back: "scene-words/16469"
 },
 gram1: {
  can: "describe people with adjectives",
  title: "Adjectives",
  em: "Describe Nouns",
  rules: [
   ["Before a noun", "Jane is a <b>clever</b> girl."],
   ["Order", "a <b>lovely</b> <b>small</b> <b>old</b> <b>red</b> bag"]
  ],
  hardNote: "opinion → size → shape → age → color → origin → material → purpose",
  say: ["An adjective describes a noun or a pronoun.", "Jane is a clever girl.", "A lovely small old red bag."]
 },
 gram2: {
  can: "ask \"Is he…?\" and \"Are you…?\"",
  cols: ["adjective + noun", "be + adjective"],
  rows: [
   ["+", "He is an <b>honest</b> boy.", "He <b>is</b> <b>honest</b>."],
   ["−", "She isn't a <b>lazy</b> student.", "She <b>isn't</b> <b>lazy</b>."],
   ["?", "Is he a <b>smart</b> kid?", "<b>Are</b> you <b>healthy</b>?"]
  ]
 },
 gapCan: "ask \"Is she…?\"",
 role: {
  title: "The", em: "Class Captain", tail: "Interview",
  opener: "Hi! Why do you want to be our class captain?",
  a: "Teacher", b: "Candidate"
 },
 pron: {
  can: "stress adjectives correctly",
  title: "Adjective", em: "Stress",
  game: "Teacher says an adjective → you clap the strong part → you describe someone: <i>\"My dad is honest.\"</i>"
 },
 E: {
  steps: ["Answer", "More"],
  model: [
   ["I know I'm healthy because I'm not sick.", "I can run and play all day."],
   ["I eat fruit and vegetables.", "I also play soccer."],
   ["I can share my snacks.", "I can help a friend with homework."],
   ["A smart person answers fast.", "She knows a lot of things."],
   ["An honest person tells the truth.", "He gives back lost things."],
   ["A lazy person sleeps a lot.", "He doesn't do his homework."],
   ["Happiness is playing with my friends.", "It makes me smile."],
   ["Success means doing my best.", "I try hard every day."],
   ["It is important because you learn a lot.", "You can get a good job."],
   ["Being happy is more important.", "Money can't buy smiles."]
  ],
  frame: [
   "I know I'm healthy because I ___.",
   "I eat ___. I also ___.",
   "I can ___.",
   "A smart person ___.",
   "An honest person ___.",
   "A lazy person ___.",
   "Happiness is ___.",
   "Success means ___.",
   "It is important because ___.",
   "Being ___ is more important."
  ],
  bank: [
   ["am not sick", "can run fast", "sleep well", "eat well"],
   ["fruit", "vegetables", "play soccer", "sleep early"],
   ["share", "help", "say hello", "say thank you"],
   ["answers fast", "reads a lot", "solves problems", "knows a lot"],
   ["tells the truth", "gives back things", "keeps promises", "says sorry"],
   ["sleeps a lot", "watches TV all day", "doesn't clean", "is always late"],
   ["playing with friends", "my family", "a sunny day", "ice cream"],
   ["doing my best", "winning", "being happy", "getting 100"],
   ["you learn a lot", "you get a good job", "you meet friends", "you grow up"],
   ["happy", "rich", "kind", "healthy"]
  ],
  more: [
   ["Are you healthy?", "When were you sick?"],
   ["What is your favorite healthy food?", "Do you eat candy?"],
   ["Who is nice to you?", "How are you nice at home?"],
   ["Who is the smartest person you know?", "Are you smart?"],
   ["Are you always honest?", "Who is the most honest person you know?"],
   ["Are you lazy sometimes?", "When are you lazy?"],
   ["When are you happiest?", "What makes your family happy?"],
   ["Who is a success to you?", "What do you want to win?"],
   ["Do you want to go to college?", "What do you want to study?"],
   ["Is money important?", "Are rich people happy?"]
  ],
  gram1: {
   chain: ["My friend is a ___ girl/boy.", "I have a ___ ___ bag."],
   ex: "T: My mom is a kind woman.<br>S: My dad is a funny man.<br>T: I have a big red bag …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["Are you healthy?", "Are you honest?", "Are you lazy?", "Are you smart?", "Are you nice?"],
    ans: "Yes, I am. / No, I'm not. <b>+ one more sentence</b>"
   },
   b: {
    title: "Your family",
    big: "My mom is a ___ woman. She is ___ and ___.",
    ans: "Then ask: <b>Is your mom nice?</b>"
   }
  },
  opener: { think: ["Look at the photo. What are they like?", "Are you kind? Are you funny?", "Is your best friend smart?"] },
  convo: [
   ["A", "Who is your best friend?"],
   ["B", "It's {Mina}. She is really {nice}."],
   ["A", "Cool! What is she like?"],
   ["B", "She's {smart}. She helps me with math."],
   ["A", "Is she healthy?"],
   ["B", "Yes! She plays {tennis} every day."],
   ["A", "Wow, she's great!"]
  ],
  swap: [["a friend's name", "Mina"], ["a nice word", "nice"], ["another nice word", "smart"], ["a sport", "tennis"]],
  lang: [
   ["Describe", ["She's very kind.", "He's so funny!", "She's really smart."]],
   ["Ask what someone is like", ["What is he like?", "Is she nice?"]],
   ["Say a little", ["a little lazy", "very honest", "really healthy"]]
  ],
  langPractice: ["My brother is lazy.", "My teacher is smart.", "I'm very healthy.", "My dog is naughty.", "My friend is honest.", "I'm a little shy."],
  survey: {
   ask: "Are you",
   cols: ["Me", "My teacher"],
   rows: ["healthy", "honest", "lazy on weekends", "a good cook", "shy", "happy today"],
   q: "Are you …?  → Yes, I am. / No, I'm not.",
   report: "I am ___, but my teacher is ___."
  },
  gap: {
   who: "Mr. Han",
   q: ["What is Mr. Han like?", "Is he healthy?", "Is he lazy?", "What does happiness mean to him?"],
   A: [["like", "kind and funny"], ["healthy", "?"], ["lazy", "no — works hard"], ["happiness", "?"]],
   B: [["like", "?"], ["healthy", "yes — runs"], ["lazy", "?"], ["happiness", "his family"]],
   tip: "Is he …? → Yes, he <b>is</b>. / No, he <b>isn't</b>."
  },
  role: {
   A: ["You are the teacher.", "Ask 5 questions.", "Choose the class captain."],
   B: ["You want to be class captain.", "Say 3 good adjectives about you.", "Give an example for each."]
  },
  tts: {
   title: "Draw \"A Great Friend\"",
   steps: ["Think of 3 words for a great friend.", "Ask your teacher his/her 3 words.", "Choose the best 3 together.", "Draw and tell!"],
   lang: ["A great friend is ___.", "My teacher thinks a friend is ___.", "We both said ___!"]
  },
  speech: {
   time: "1 min",
   model: ["Hello! I'm Jiho.", "I am a happy boy.", "I am healthy because I play soccer.", "I am nice. I share my snacks.", "Sometimes I'm a little lazy on Sundays!", "Thank you!"],
   outline: ["Name", "Happy?", "Healthy?", "Nice?", "Lazy?"],
   check: ["Loud voice", "Use adjectives", "Say 5 things"]
  },
  pron: {
   cols: [["● •", ["healthy", "honest", "lazy"]], ["● • •", ["beautiful", "wonderful", "happiness"]], ["• ● •", ["important", "successful", "delicious"]]],
   up: "Are you healthy?",
   down: "What is your friend like?"
  },
  review: ["I can describe people.", "I can put adjectives before nouns.", "I can ask \"Are you …?\"", "I can say one more sentence."]
 },
 H: {
  steps: ["Answer", "Reason", "Example", "Ask back"],
  model: [
   ["You can tell by how much energy you have.", "A healthy body doesn't get tired easily.", "I can climb five floors without stopping.", "How do you check your health?"],
   ["I exercise and try to eat healthy food.", "My family has a history of heart disease.", "I jog three times a week and avoid fast food.", "What do you do to stay healthy?"],
   ["Being nice means helping without being asked.", "Small kind acts make a big difference.", "I often hold the door for people with heavy bags.", "What's a nice thing someone did for you?"],
   ["You can tell by the questions a person asks.", "Smart people are curious about everything.", "My friend always asks \"why\" and finds the answer.", "Is being smart the same as getting good grades?"],
   ["You can tell by the way the person keeps promises.", "Honest people do what they say.", "My coworker returned extra change to a cashier.", "Do you think honesty is always the best policy?"],
   ["You can tell by the way the person avoids work.", "Lazy people make excuses all the time.", "One classmate always said he forgot his homework.", "Are you ever lazy?"],
   ["Happiness is feeling calm and thankful.", "It's not about having more things.", "I feel happiest on quiet Sunday mornings with coffee.", "What does happiness mean to you?"],
   ["Success means reaching the goals you set.", "Everyone's goals are different.", "For me, finishing a marathon was a huge success.", "How do you define success?"],
   ["It's important because it opens more doors.", "Many good jobs need a degree.", "My cousin found a great job after college.", "Is college necessary for everyone?"],
   ["Being happy is more important to me.", "Money can't buy peace of mind.", "Some rich people I know are always stressed.", "Which would you choose?"]
  ],
  frame: [
   "You can tell by … because …",
   "I … and … because …",
   "Being nice means … For example, …",
   "You can tell by … Smart people …",
   "You can tell by the way the person …",
   "You can tell by the way the person …",
   "Happiness is … It's not about …",
   "Success means … For me, …",
   "It's important because … For example, …",
   "Being … is more important because …"
  ],
  more: [
   ["Are young people healthier than before?", "Is mental health as important as body health?", "What is the unhealthiest habit?"],
   ["Is it easy to stay healthy in a busy life?", "Are diets a good idea?", "What healthy habit would you like to start?"],
   ["Is it possible to be too nice?", "Are people nicer in small towns?", "Should we be nice to rude people?"],
   ["Are smart people always successful?", "Can you become smarter?", "Which is better: smart or hardworking?"],
   ["Is a white lie OK?", "Would you tell a friend a hard truth?", "Can you trust someone who lied once?"],
   ["Is being lazy sometimes good?", "Are people lazier because of phones?", "How do you beat laziness?"],
   ["Can money buy happiness?", "Are children happier than adults?", "Which country seems the happiest?"],
   ["Is success the same as being famous?", "Who is the most successful person you know?", "Can failure lead to success?"],
   ["Should college be free?", "Is experience better than a degree?", "What would you study?"],
   ["Can you be both rich and happy?", "Do rich people worry more?", "What would you give up for happiness?"]
  ],
  gram1: {
   chain: ["I have a(n) ___ ___ ___ (noun).", "My best friend is a(n) ___ ___ person."],
   ex: "T: I have a lovely small wooden box.<br>S: I have a big old black bike.<br>T: My friend is a funny tall …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["Are you an honest person?", "Are you a healthy eater?", "Is your boss nice?", "Are you lazy on weekends?", "Is your best friend smart?"],
    ans: "Yes, … / No, … <b>+ an example</b>"
   },
   b: {
    title: "Someone you admire",
    big: "___ is a ___ ___ person. He/She is ___, and he/she isn't ___.",
    ans: "Then ask: <b>Who do you admire? What is he/she like?</b>"
   }
  },
  opener: { think: ["What three adjectives would your friends use for you?", "Can you judge a person in 5 minutes?", "Which matters more: being smart or being kind?"] },
  convo: [
   ["A", "I heard you have a new manager. What's she like?"],
   ["B", "She's really {smart}. She solves problems fast."],
   ["A", "That's great. Is she nice to the team?"],
   ["B", "Yes, very. She's also {honest} about mistakes."],
   ["A", "How can you tell?"],
   ["B", "She told us about her own mistake at the {first meeting}."],
   ["A", "Wow. That shows real confidence."],
   ["B", "Exactly. What's your manager like?"],
   ["A", "Honestly? He's a bit {lazy}, but he's kind."]
  ],
  swap: [["a good quality", "smart"], ["another quality", "honest"], ["a time", "first meeting"], ["a bad quality", "lazy"]],
  lang: [
   ["Describe people", ["She's really easygoing.", "He's a bit stubborn.", "She's the kind of person who …"]],
   ["Soften", ["a bit …", "kind of …", "not very …"]],
   ["Ask for proof", ["How can you tell?", "What makes you say that?"]],
   ["Agree / disagree", ["That's true.", "I'm not sure about that."]]
  ],
  langPractice: ["My boss is lazy.", "Smart people are boring.", "I'm the healthiest person I know.", "Honest people don't get rich.", "Happiness is a choice.", "College is a waste of money."],
  survey: {
   ask: "Are you",
   cols: ["Me", "My teacher", "Example"],
   rows: ["a healthy eater", "always honest", "lazy on Sundays", "a morning person", "easy to please", "happy with your job"],
   q: "Are you …? → Ask: Can you give an example?",
   report: "My teacher and I are both ___, but only I ___."
  },
  gap: {
   who: "Ms. Park",
   q: ["What is Ms. Park like?", "How does she stay healthy?", "Is she honest? How can you tell?", "What does success mean to her?", "Did she finish college?"],
   A: [["like", "calm and smart"], ["stays healthy", "?"], ["honest?", "?"], ["success", "helping others"], ["college", "?"]],
   B: [["like", "?"], ["stays healthy", "yoga every morning"], ["honest?", "yes — admits mistakes"], ["success", "?"], ["college", "yes — in Busan"]],
   tip: "Is she …? → She <b>is</b> … because she …"
  },
  role: {
   A: ["You interview a class captain candidate.", "Ask 5 questions + 2 follow-ups.", "Decide: yes or no? Explain why."],
   B: ["You want to be class captain.", "Describe yourself with 4 adjectives.", "Give a true example for each one."]
  },
  tts: {
   title: "Describe \"The Perfect Leader\"",
   steps: ["Think: what makes a good leader?", "Ask your teacher for 3 adjectives.", "Agree on the top 3 qualities.", "Present with examples in 1 minute."],
   lang: ["A good leader should be ___ because ___.", "I agree, but ___ is more important.", "So the top 3 are ___."]
  },
  speech: {
   time: "2 min",
   model: ["Hi everyone. What does a successful life look like?", "For me, it starts with being healthy.", "I jog three times a week and I eat simple, healthy food.", "I also try to be honest, even when it's hard.", "To me, success means reaching my own goals.", "But happiness is more important than money.", "Thanks for listening! What do you think?"],
   outline: ["Hook — a question", "Health habit", "A personality value", "Meaning of success", "Rich or happy?", "Ask the audience"],
   check: ["Clear voice", "Adjectives in order", "Reasons and examples", "Answer 1 question"]
  },
  pron: {
   cols: [["● •", ["honest", "healthy", "clever"]], ["● • •", ["positive", "sensitive", "beautiful"]], ["• ● •", ["important", "successful", "creative"]]],
   up: "Is your boss honest?",
   down: "What does success mean to you?"
  },
  review: ["I can answer in 4 parts.", "I can use adjectives in order.", "I can describe people with examples.", "I can talk about happiness and success."]
 }
};
