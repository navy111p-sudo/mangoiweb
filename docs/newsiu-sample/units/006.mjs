// SIU BASIC 006 — 단원 파일(8판 형식). 본보기: units/001.mjs
// 원본과 다른 점:
//  - Q2 "Are there old people who are living in your apartment building?" → "Are there old people living in your apartment building?"
//  - Q3 "Do you help your neighbors sometimes?" → "Do you sometimes help your neighbors?" (빈도부사 위치)
//  - Q4 "on a weekend" → "on the weekend"
//  - Q5 "T.G.IF. (thanks God it's friday)" → "\"T.G.I.F.\" (Thank God it's Friday)"
//  - Q7 "Do you Believe In Life On Other Planets?" → 대문자 정리
//  - Q8 "Do you like to join Summer camp?" → "Do you like to go to summer camp?"
//  - Q10 "Do like to go in another country?" → "Would you like to go to another country?"
//  - 답 틀 "My summer vaction" → vacation, "No I dont" → "No, I don't"
//  - 문법 원본 표의 오타(at the airports / in the garages / in a books) 는 쓰지 않고 at·in·on 을 시간·장소 두 갈래로 다시 설명
export default {
 no: "006",
 title: "All Around Me",
 book: "SIU BASIC 006 - All around me",
 next: "007 At School",
 cover: { h1: "All", em: "Around Me", goals: ["Talk about your neighborhood", "Use at, in and on", "Give a short presentation"] },
 KW: [
  ["neighbor", "noun", "이웃", "a person who lives next to or near you"],
  ["apartment", "noun", "아파트", "a home in a building with many homes"],
  ["do", "verb", "하다", "to perform an action or a job"],
  ["weekend", "noun", "주말", "Saturday and Sunday, when many people rest"],
  ["people", "noun", "사람들", "men, women and children"],
  ["vacation", "noun", "방학", "a time to rest from school or work"],
  ["planet", "noun", "행성", "a big round body in space that moves around a star"],
  ["summer camp", "noun", "여름 캠프", "a fun summer trip for kids"],
  ["city", "noun", "도시", "a big town where many people live close together"],
  ["country", "noun", "나라", "a nation with its own land and government"]
 ],
 QS: [
  "How many of your neighbors do you know?",
  "Are there old people living in your apartment building?",
  "Do you sometimes help your neighbors?",
  "What do you like to do on the weekend?",
  "Why do some people say \"T.G.I.F.\" (Thank God it's Friday)?",
  "When is your summer vacation?",
  "Do you believe in life on other planets?",
  "Do you like to go to summer camp?",
  "Do you like living in the city?",
  "Would you like to go to another country?"
 ],
 IMG_E: ["scene-words/19469", "scene-words/12074", "scene-words/15428", "scene-words/19694", "scene-words/17114", "scene-words/12180", "scene-words/16029", "scene-words/14751", "scene-words/12848", "scene-words/12746"],
 IMG_H: ["scene-words/15730", "scene-clips/7032", "scene-words/16361", "scene-words/19694", "scene-words/17114", "scene-words/18055", "scene-words/14588", "scene-words/12831", "scene-words/17300", "scene-clips/5024"],
 PICS: {
  opener: "scene-words/15462",
  talk: "scene-words/15730",
  group: "scene-words/19286",
  speech: "scene-words/18040",
  reporter: "scene-words/13053",
  survey: "scene-words/17113",
  pron: "scene-words/12421",
  roleB: "scene-words/17236",
  cover: "scene-words/17300",
  back: "scene-words/19694"
 },
 gram1: {
  can: "use at, in and on",
  title: "Prepositions",
  em: "at · in · on",
  rules: [
   ["Time", "<b>at</b> 7 o'clock · <b>on</b> Friday · <b>in</b> July"],
   ["Place", "<b>at</b> school · <b>on</b> the bus · <b>in</b> Seoul"]
  ],
  hardNote: "at night · on the weekend · in the morning",
  say: ["A preposition shows time or place.", "I get up at seven. I play soccer on Friday.", "I live in Seoul."]
 },
 gram2: {
  can: "ask \"When…?\" and \"Where…?\"",
  cols: ["Time", "Place"],
  rows: [
   ["+", "My class is <b>at</b> 5 p.m.", "I live <b>in</b> an apartment."],
   ["−", "It isn't <b>on</b> Monday.", "He isn't <b>at</b> home."],
   ["?", "Is your birthday <b>in</b> May?", "Is she <b>on</b> the bus?"]
  ]
 },
 gapCan: "ask \"Where does…?\" and \"When…?\"",
 role: {
  title: "The",
  em: "New Neighbor",
  tail: "",
  opener: "Hi! I live next door. Did you just move in?",
  a: "Neighbor",
  b: "New neighbor"
 },
 pron: {
  can: "link words smoothly",
  title: "Linking",
  em: "words",
  game: "Teacher reads a phrase → you say it smoothly → you make a sentence: <i>\"I live in_an apartment.\"</i>"
 },
 E: {
  steps: ["Answer", "More"],
  model: [
   ["I know three of my neighbors.", "One of them has a cute dog."],
   ["Yes, there are.", "An old woman lives on the first floor."],
   ["Yes, I do.", "I help them carry their bags."],
   ["I like to ride my bike on the weekend.", "I go to the park with my dad."],
   ["I think it is because Friday is the last school day.", "The weekend starts on Friday night!"],
   ["My summer vacation is in July.", "It starts on July 20th."],
   ["Yes, I do.", "I think space is very, very big."],
   ["Yes, I do.", "I can swim and make friends there."],
   ["Yes, I do.", "There are many shops and parks."],
   ["Yes, I would. I want to go to Japan.", "I want to eat sushi there."]
  ],
  frame: [
   "I know ___ of my neighbors.",
   "Yes, there are. An old ___ lives on the ___ floor.",
   "Yes, I do. I help them ___. / No, I don't.",
   "I like to ___ on the weekend.",
   "I think it is because ___.",
   "My summer vacation is in ___.",
   "Yes, I do. / No, I don't, because ___.",
   "Yes, I do. At camp, I can ___.",
   "Yes, I do. / No, I don't. The city is ___.",
   "I want to go to ___. I want to ___ there."
  ],
  bank: [
   ["two", "five", "none", "all"],
   ["man", "woman", "first", "tenth"],
   ["carry bags", "open doors", "feed pets", "say hello"],
   ["ride my bike", "sleep late", "watch movies", "visit Grandma"],
   ["no school", "the weekend", "rest", "play"],
   ["July", "August", "June", "December"],
   ["space is big", "I saw a movie", "stars", "no air"],
   ["swim", "hike", "sing", "make friends"],
   ["busy", "fun", "noisy", "exciting"],
   ["Japan", "the USA", "France", "see / eat"]
  ],
  more: [
   ["Who is your favorite neighbor?", "Do you say hello to them?"],
   ["How many floors does your building have?", "Do you talk to them?"],
   ["Who helps you?", "How do you feel when you help?"],
   ["Who do you spend it with?", "What did you do last weekend?"],
   ["What is your favorite day?", "What do you do on Friday night?"],
   ["What will you do?", "Where do you want to go?"],
   ["What do aliens look like?", "Do you want to go to space?"],
   ["What do you do at camp?", "Do you like sleeping in a tent?"],
   ["Do you live in a city?", "What is your favorite city?"],
   ["Who will you go with?", "What will you bring?"]
  ],
  gram1: {
   chain: ["I get up at ___.", "On Saturday, I ___."],
   ex: "T: I get up at 7.<br>S: I get up at 8.<br>T: On Saturday, I …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["When do you get up?", "When is your birthday?", "Where do you live?", "Where is your school?", "When is your vacation?"],
    ans: "Use <b>at · in · on</b> <b>+ one more sentence</b>"
   },
   b: {
    title: "Your weekend",
    big: "On Saturday, I ___ at ___. In the evening, I ___.",
    ans: "Then ask: <b>What do you do on Sunday?</b>"
   }
  },
  opener: { think: ["Look at the photo. What is she doing?", "Do you know your neighbors?", "What is near your home?"] },
  convo: [
   ["A", "Hi! I'm Mina. I live next door."],
   ["B", "Hi, Mina! I'm {Jun}. I just moved in."],
   ["A", "Welcome! What do you do on the weekend?"],
   ["B", "I {ride my bike} in the park."],
   ["A", "Cool! There is a big park on {Maple Street}."],
   ["B", "Great! Do you want to go on {Saturday}?"],
   ["A", "Sure! See you then!"]
  ],
  swap: [["your name", "Jun"], ["a weekend activity", "ride my bike"], ["a street name", "Maple Street"], ["a day", "Saturday"]],
  lang: [
   ["Say hello", ["Hi! I live next door.", "Welcome!"]],
   ["Ask back", ["How about you?", "And you?"]],
   ["Make a plan", ["Do you want to …?", "See you then!"]]
  ],
  langPractice: ["I live on the tenth floor.", "I have a new neighbor.", "I go to the park on Sunday.", "My vacation is in August.", "I love summer camp.", "I want to visit Canada."],
  survey: {
   ask: "Do you",
   cols: ["Me", "My teacher"],
   rows: ["know your neighbors", "live in an apartment", "like weekends", "go to summer camp", "like big cities", "want to visit another country"],
   q: "Do you …?  → Yes, I do. / No, I don't.",
   report: "I ___, but my teacher ___."
  },
  gap: {
   who: "Sora",
   q: ["Where does Sora live?", "What does she do on weekends?", "When is her vacation?", "Where does she want to go?"],
   A: [["lives in", "an apartment in Seoul"], ["weekends", "?"], ["vacation", "in August"], ["wants to go to", "?"]],
   B: [["lives in", "?"], ["weekends", "rides her bike"], ["vacation", "?"], ["wants to go to", "Australia"]],
   tip: "She → <b>does</b> · lives · wants · <b>in</b> August"
  },
  role: {
   A: ["You live next door.", "Say hello. Ask 5 questions.", "Invite B to the park."],
   B: ["You just moved in.", "Choose: from Busan / Jeju / Canada.", "Answer with 2 sentences."]
  },
  tts: {
   title: "Plan a fun weekend",
   steps: ["Think of 3 fun things to do.", "Ask your teacher what they like.", "Choose the best plan together.", "Tell your plan!"],
   lang: ["On Saturday, we will ___.", "We can go to ___ at ___.", "It will be fun because ___."]
  },
  speech: {
   time: "1 min",
   model: ["Hello! My name is Sora.", "I live in an apartment in Seoul.", "I know my neighbors. They are kind.", "On the weekend, I ride my bike in the park.", "My summer vacation is in August.", "Thank you!"],
   outline: ["Name", "Where you live", "Your neighbors", "Your weekend", "Your vacation"],
   check: ["Loud voice", "Look at your teacher", "Say 5 things"]
  },
  pron: {
   cols: [
    ["in +", ["in_a city", "in_April", "in_English"]],
    ["on +", ["on_a bus", "on_it", "on_August 1st"]],
    ["at +", ["at_eight", "at_a park", "at_a camp"]]
   ],
   up: "Do you know your neighbors?",
   down: "When is your vacation?"
  },
  review: ["I can talk about my neighborhood.", "I can use at / in / on.", "I can ask \"Where…?\" and \"When…?\"", "I can say one more sentence."]
 },
 H: {
  steps: ["Answer", "Reason", "Example", "Ask back"],
  model: [
   ["I know about five of my neighbors by name.", "We often meet in the elevator.", "The man next door always asks about my school.", "How well do you know your neighbors?"],
   ["Yes, there are a few old people in my building.", "Many of them have lived there for years.", "A woman on the third floor grows flowers on her balcony.", "Are there many elderly people where you live?"],
   ["Yes, I do, but only sometimes.", "I think neighbors should look after each other.", "Last winter, I helped my neighbor clear snow.", "Do you ever help your neighbors?"],
   ["On the weekend, I like to go hiking with my family.", "After a busy week, fresh air helps me relax.", "Last Saturday, we climbed a mountain near the city.", "What do you usually do on weekends?"],
   ["I think it's because Friday ends the work week.", "People feel free and can finally rest.", "My dad always smiles more on Friday evenings.", "Do you feel the same on Fridays?"],
   ["My summer vacation is in late July.", "It's usually about four weeks long.", "This year, I'm going to visit my grandparents in Jeju.", "When is your vacation?"],
   ["Yes, I believe in life on other planets.", "The universe is too big for us to be alone.", "For example, scientists found signs of water on Mars.", "Do you think aliens have visited Earth?"],
   ["Yes, I like going to summer camp.", "It's a great way to make new friends.", "Last year, I learned to set up a tent at an English camp.", "Did you go to camp as a child?"],
   ["I like living in the city, but it can be stressful.", "There's a lot to do, but it's crowded and noisy.", "It takes me an hour to get to school by bus.", "Would you rather live in the city or the country?"],
   ["Yes, I'd love to live in another country for a while.", "I want to learn about a new culture.", "I'd like to study in Canada because nature there is beautiful.", "Which country would you like to visit?"]
  ],
  frame: [
   "I know … of my neighbors. We …",
   "Yes, there are … / No, there aren't … because …",
   "Yes, I do. Once, I … / No, I don't, because …",
   "On the weekend, I like to … because …",
   "I think it's because … For example, …",
   "My summer vacation is in … This year, I …",
   "I do / don't believe … because …",
   "I like / don't like summer camp because …",
   "I like / don't like the city because … but …",
   "I'd like to go to … because … First, I'd …"
  ],
  more: [
   ["Is it important to know your neighbors? Why?", "How has neighborhood life changed?", "What makes a good neighbor?"],
   ["How can young people help elderly neighbors?", "What can we learn from older people?", "Should apartments have spaces for all ages?"],
   ["Why do some people not help their neighbors?", "Have you ever had a problem with a neighbor?", "Should neighbors share things like tools?"],
   ["Is it better to rest or be active on weekends?", "Should people work or study on weekends?", "What would your perfect weekend look like?"],
   ["Which day of the week do you like least? Why?", "Should the weekend be three days long?", "How do people in other countries end the week?"],
   ["Are school vacations too long or too short?", "What is the best vacation you've had?", "Should students do homework on vacation?"],
   ["Should countries spend money on space travel?", "Would you live on Mars if you could?", "What would you say to an alien?"],
   ["What skills can children learn at camp?", "Is it good for kids to be away from home?", "Would you like to work at a summer camp?"],
   ["What is the biggest problem in cities today?", "How can cities be greener?", "Where will most people live in the future?"],
   ["What is hard about living abroad?", "Should everyone travel before age thirty?", "What would you miss about Korea?"]
  ],
  gram1: {
   chain: ["At night, I usually ___.", "In the summer, I ___."],
   ex: "T: I usually read at night.<br>S: I usually game at night.<br>T: In the summer, I …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["When is the busiest day of your week?", "Where do you spend your free time?", "When do you feel most relaxed?", "Where do you like to study?", "When is your next vacation?"],
    ans: "Use <b>at · in · on</b> <b>+ one more sentence</b>"
   },
   b: {
    title: "Your neighborhood",
    big: "My favorite place is ___. I go there on/at/in ___. Where do you go on ___?",
    ans: "Then ask: <b>Where do you go on weekends?</b>"
   }
  },
  opener: {
   think: [
    "What makes a neighborhood a good place to live?",
    "Is it important to know the people who live near you?",
    "Would you rather live in a quiet town or a busy city? Why?"
   ]
  },
  convo: [
   ["A", "Excuse me, did you just move in next door?"],
   ["B", "Yes! I'm {Jun}. We moved here from {Busan} last week."],
   ["A", "Welcome to the building! How do you like it so far?"],
   ["B", "It's nice. It's much {quieter} than my old place."],
   ["A", "Is there anything you need to know?"],
   ["B", "Actually, yes. Is there a good {park} near here?"],
   ["A", "There's one on Maple Street. I go there at seven every morning."],
   ["B", "Great! Maybe I'll see you there."],
   ["A", "Sure! Just knock if you need anything."]
  ],
  swap: [["your name", "Jun"], ["a city", "Busan"], ["an adjective", "quieter"], ["a place", "park"]],
  lang: [
   ["Welcome someone", ["Welcome to the building!", "How do you like it so far?"]],
   ["Offer help", ["Just knock if you need anything.", "Let me know if …"]],
   ["Ask for information", ["Is there a … near here?", "Where can I …?"]],
   ["Agree / disagree", ["I think so too.", "I'm not so sure."]]
  ],
  langPractice: ["I don't know any of my neighbors.", "Cities are better than towns.", "Weekends are too short.", "I'd love to live on Mars.", "Summer camp is boring.", "I want to live abroad someday."],
  survey: {
   ask: "Do you",
   cols: ["Me", "My teacher", "One more question"],
   rows: ["know your neighbors' names", "live in an apartment", "study on weekends", "believe in aliens", "prefer the city to the country", "want to live abroad"],
   q: "Do you …? → Yes. → Ask: Why? / Where? / Since when?",
   report: "My teacher and I both ___, but only I ___."
  },
  gap: {
   who: "Sora",
   q: ["Where does Sora live?", "What does she do on weekends?", "When is her vacation? Where to?", "Does she believe in aliens? Why?", "Where does she want to live someday?"],
   A: [["lives in", "Seoul, on the 12th floor"], ["weekends", "?"], ["vacation", "?"], ["aliens + why", "yes — space is huge"], ["wants to live in", "?"]],
   B: [["lives in", "?"], ["weekends", "hikes with her dad"], ["vacation", "in August, to Jeju"], ["aliens + why", "?"], ["wants to live in", "Canada"]],
   tip: "She → <b>does</b> · lives · wants · <b>in</b> August"
  },
  role: {
   A: ["You live in the building.", "Welcome B. Ask 5 questions + 2 follow-ups.", "Give 2 tips about the area."],
   B: ["You just moved in.", "Choose: from Busan / Canada / Brazil.", "Give reasons. Ask 2 questions about the area."]
  },
  tts: {
   title: "Design your ideal neighborhood",
   steps: ["Think: what makes a neighborhood great?", "Ask your teacher 4 of today's questions.", "Agree on the 3 most important places.", "Present your neighborhood in 1 minute."],
   lang: ["Our neighborhood has a ___ in the center.", "I think we need ___ because ___.", "That's a good idea, but ___."]
  },
  speech: {
   time: "2 min",
   model: [
    "Hi everyone. Let me tell you about where I live.",
    "I live in an apartment in Suwon, on the 12th floor.",
    "I know most of my neighbors, and they're very friendly.",
    "On weekends, I go hiking with my dad in the morning.",
    "My summer vacation is in August, and I'm going to Jeju.",
    "Someday, I'd like to live in another country, like Canada.",
    "Thanks for listening! Any questions?"
   ],
   outline: ["Hook — \"Let me tell you…\"", "Your home + neighbors", "Your weekend", "Your vacation", "A dream place to live", "Ask for questions"],
   check: ["Clear voice", "Eye contact", "at / in / on used well", "Answer 1 question"]
  },
  pron: {
   cols: [
    ["in +", ["in_an apartment", "in_August", "in_another country"]],
    ["on +", ["on_a trip", "on_Earth", "on_a Friday"]],
    ["at +", ["at_eleven", "at_a party", "at_a summer camp"]]
   ],
   up: "Do you believe in aliens?",
   down: "Why do people love Fridays?"
  },
  review: ["I can answer in 4 parts.", "I can use at / in / on for time and place.", "I can welcome a new neighbor.", "I can describe my neighborhood."]
 }
};
