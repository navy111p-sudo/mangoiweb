// SIU ADVANCE 014 — Entertainment (8판 형식, 001 본보기)
// 원본과 다른 점:
//  - Q5 "Have you ever been to casino?" → "…to a casino?" (관사)
//  - Q4 두 질문을 한 줄로: "How often do you visit museums? When was the last time?"
//  - 대답 틀 "Yes I've been to Disneyland last…" → 현재완료와 last 를 같이 쓰면 틀림 → "Yes, I went there last ___." 로 바로잡음
//  - 대답 틀 "I'm visiting museum every…" → "I visit museums once a ___.", "Popular games in our counry is" → "…are"
//  - Keyword Been 뜻 «되었습니다» → «가 본 적 있다(have been to)», Park 는 질문(놀이공원)에 맞게 풀이
//  - 쉬운 판(중고등): Q5 카지노·Q6 슬롯머신은 «어른만 되는 규칙» 으로 답하고, 인형뽑기·오락실 게임 이야기로 돌림(도박 경험 없음)
export default {
 no: "a014",
 title: "Entertainment",
 book: "SIU ADVANCE 014 - Entertainment",
 next: "015 Philosophy",
 cover: { h1: "Fun and", em: "Entertainment", goals: ["Talk about movies, parks and games", "Ask and answer 10 questions", "Say when things happen"] },
 KW: [
  ["anime", "noun", "일본 애니메이션", "a style of Japanese cartoon films and shows"],
  ["been", "verb", "가 본 적 있다", "visited a place (I have been to…)"],
  ["theater", "noun", "극장", "a building where plays and shows are performed"],
  ["museum", "noun", "박물관", "a building where special old objects are shown"],
  ["casino", "noun", "카지노", "a place where adults play games for money"],
  ["machine", "noun", "기계", "a piece of equipment that does a job"],
  ["park", "noun", "공원, 놀이공원", "a place people visit for fun and rest"],
  ["spend", "verb", "(돈을) 쓰다", "to use money to buy things"],
  ["computer", "noun", "컴퓨터", "a machine that stores and works with information"],
  ["popular", "adjective", "인기 있는", "liked by many people"]
 ],
 QS: [
  "Do you like to watch anime?",
  "Have you ever been to Disneyland?",
  "Have you ever been to the theater?",
  "How often do you visit museums? When was the last time?",
  "Have you ever been to a casino?",
  "Have you ever used a slot machine?",
  "What are some of the most popular amusement parks in your country?",
  "What are some things you can do without spending a cent?",
  "What computer games have you played?",
  "What games are popular in your country? Why are they popular?"
 ],
 IMG_E: ["scene-words/15204", "scene-words/15846", "scene-words/13335", "scene-clips/7280", "scene-words/15534", "scene-words/12654", "scene-words/16296", "scene-words/15615", "scene-words/17150", "scene-words/18587"],
 IMG_H: ["scene-words/18881", "scene-words/15776", "scene-words/16430", "scene-words/13122", "scene-words/16115", "scene-words/16245", "scene-words/15776", "scene-words/12409", "scene-words/12174", "scene-words/15218"],
 PICS: {
  opener: "scene-words/18156",
  talk: "scene-clips/7405",
  group: "scene-words/12055",
  speech: "scene-words/12053",
  reporter: "scene-words/13053",
  survey: "scene-clips/7090",
  pron: "scene-words/12869",
  roleB: "scene-words/16586",
  cover: "scene-words/15846",
  back: "scene-words/12870"
 },
 gram1: {
  can: "say when things happen",
  title: "Adverbs of",
  em: "Time",
  rules: [
   ["When?", "I went to the museum <b>yesterday</b>."],
   ["How long?", "We played the game <b>for two hours</b>."]
  ],
  hardNote: "yesterday · last year · tomorrow · later · soon · already · yet · for an hour",
  say: [
   "Adverbs of time tell us when, how long, or how often something happens.",
   "They often come at the end of the sentence.",
   "I went to the museum yesterday.",
   "We played the game for two hours."
  ]
 },
 gram2: {
  can: "ask \"When…?\" and \"How long…?\"",
  cols: ["When?", "How long? / Yet"],
  rows: [
   ["+", "I saw a play <b>last month</b>.", "I've <b>already</b> seen it."],
   ["−", "I didn't go out <b>yesterday</b>.", "I haven't played it <b>yet</b>."],
   ["?", "<b>When</b> did you go?", "<b>How long</b> did you stay?"]
  ]
 },
 gapCan: "ask \"When did she…?\"",
 role: {
  title: "The",
  em: "Weekend",
  tail: "Planner",
  opener: "Welcome! What kind of fun are you looking for this weekend?",
  a: "Event planner",
  b: "Visitor"
 },
 pron: {
  can: "say \"Have you ever been…?\" smoothly",
  title: "Link it:",
  em: "Have you ever",
  game: "Teacher names a place → you ask: <i>\"Have you ever been to…?\"</i>"
 },
 E: {
  steps: ["Answer", "More"],
  model: [
   ["Yes, I love anime.", "The stories are exciting and the art is beautiful."],
   ["No, I haven't, but I want to go.", "I want to ride the roller coasters."],
   ["Yes, I have. I saw a musical last year.", "The singing was amazing."],
   ["I visit museums once a year.", "The last time was last summer with my class."],
   ["No, I haven't.", "Casinos are only for adults."],
   ["No, I haven't. It's for adults.", "But I've tried a claw machine!"],
   ["Everland and Lotte World are popular.", "They have great rides."],
   ["I can go to the park for free.", "I can also read books at the library."],
   ["I've played Minecraft.", "I play it with my friends on weekends."],
   ["Mobile games are popular in Korea.", "People can play them anywhere."]
  ],
  frame: [
   "Yes, I ___ anime. / No, I don't. It's ___.",
   "Yes, I went there last ___. / No, I haven't.",
   "Yes, I saw a ___ last ___. / No, I haven't.",
   "I visit museums once a ___. The last time was ___.",
   "No, I haven't. Casinos are ___.",
   "No, I haven't. But I've tried a ___.",
   "___ is popular. It has great ___.",
   "I can ___ for free.",
   "I've played ___. I play it ___.",
   "___ are popular because ___."
  ],
  bank: [
   ["love", "like", "boring", "for kids"],
   ["year", "summer", "month", "vacation"],
   ["musical", "play", "concert", "ballet"],
   ["month", "year", "last spring", "on a school trip"],
   ["only for adults", "not for teens", "against the rules", "far away"],
   ["claw machine", "arcade game", "photo booth", "vending machine"],
   ["Everland", "Lotte World", "rides", "shows"],
   ["walk in the park", "read at the library", "play soccer", "visit a museum"],
   ["Minecraft", "Roblox", "on weekends", "with friends"],
   ["Mobile games", "Soccer games", "easy", "fun"]
  ],
  more: [
   ["What is your favorite anime?", "Who is your favorite character?"],
   ["Which ride do you want to try?", "Who would you go with?"],
   ["What show would you like to see?", "Do you like musicals or movies?"],
   ["What was the best museum?", "What did you see there?"],
   ["What games do you play with your family?", "Why do you think casinos are for adults?"],
   ["Have you ever won a prize?", "Is it easy to win?"],
   ["What is the scariest ride?", "When did you last go?"],
   ["What do you do on free weekends?", "Do you like picnics?"],
   ["How long do you play each day?", "Do your parents play, too?"],
   ["What game do your parents like?", "Do you like old games like yut-nori?"]
  ],
  gram1: {
   chain: ["Yesterday, I ___.", "Tomorrow, I will ___."],
   ex: "T: Yesterday, I watched a movie.<br>S: Yesterday, I played soccer.<br>T: Tomorrow, I will …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["When did you get up?", "How long did you sleep?", "Have you eaten yet?", "When did you see a movie?", "How long do you play games?"],
    ans: "Use a time word <b>+ one more sentence</b>"
   },
   b: {
    title: "My weekend",
    big: "Last weekend, I ___. Next weekend, I will ___.",
    ans: "Then ask: <b>What did you do last weekend?</b>"
   }
  },
  opener: {
   think: ["Look at the photo. What are they watching?", "What do you do for fun on weekends?", "Do you like movies or games more?"]
  },
  convo: [
   ["A", "What did you do last weekend?"],
   ["B", "I went to {Lotte World} with my friends."],
   ["A", "Cool! How long did you stay?"],
   ["B", "All day! We rode {the roller coaster} three times."],
   ["A", "Wow! I haven't been there yet."],
   ["B", "You should go! What did you do?"],
   ["A", "I stayed home and watched {anime}."],
   ["B", "That sounds {relaxing}, too."]
  ],
  swap: [["a fun place", "Lotte World"], ["a ride or show", "the roller coaster"], ["something at home", "anime"], ["a feeling word", "relaxing"]],
  lang: [
   ["Show interest", ["Cool!", "Wow!", "Lucky you!"]],
   ["Ask for time", ["When did you go?", "How long did you stay?"]],
   ["Recommend", ["You should go!", "You'll love it."]]
  ],
  langPractice: ["I went to a concert yesterday.", "I've never seen a musical.", "I played games for five hours.", "I love horror movies.", "I went to Everland last week.", "I watch anime every night."],
  survey: {
   ask: "Have you ever",
   cols: ["Me", "My teacher"],
   rows: ["been to an amusement park", "seen a musical", "watched anime", "visited a history museum", "played a computer game all day", "been to a concert"],
   q: "Have you ever …? → Yes, I have. / No, I haven't.",
   report: "I have ___, but my teacher hasn't ___."
  },
  gap: {
   who: "Yuna's fun week",
   q: ["When did Yuna see a movie?", "Where did she go on Saturday?", "How long did she play games?", "What will she do tomorrow?"],
   A: [["movie", "on Monday"], ["Saturday", "?"], ["games", "for one hour"], ["tomorrow", "?"]],
   B: [["movie", "?"], ["Saturday", "a science museum"], ["games", "?"], ["tomorrow", "visit a park"]],
   tip: "<b>When</b> did she…? · <b>How long</b> did she…?"
  },
  role: {
   A: ["You plan fun weekends.", "Ask 5 questions.", "Suggest one place."],
   B: ["You want some fun this weekend.", "Choose: love rides / love art / no money.", "Answer with 2 sentences."]
  },
  tts: {
   title: "Plan \"A perfect free day\"",
   steps: ["Think of 3 fun things that are free.", "Ask your teacher. Answer, too.", "Choose a time for each thing.", "Make a plan and tell!"],
   lang: ["In the morning, we will ___.", "After lunch, we can ___.", "It costs ___."]
  },
  speech: {
   time: "1 min",
   model: ["Hello! Let me tell you about my fun weekend.", "Last Saturday, I went to Everland.", "I rode the roller coaster three times!", "On Sunday, I watched anime at home.", "Next weekend, I will visit a museum.", "Thank you!"],
   outline: ["Hello", "Where you went (when?)", "What you did", "What you will do next", "Thank you!"],
   check: ["Loud voice", "Look at teacher", "Use time words"]
  },
  pron: {
   cols: [["/hævjə/", ["Have you", "Have you ever", "Have you been"]], ["/bɪn/", ["I've been", "never been", "have you been"]], ["Time word", ["last WEEK", "YESterday", "toMORrow"]]],
   up: "Have you ever been to Everland?",
   down: "When did you go there?"
  },
  review: ["I can talk about fun things I do.", "I can use yesterday / last / tomorrow.", "I can ask \"Have you ever…?\"", "I can say one more sentence."]
 },
 H: {
  steps: ["Answer", "Reason", "Example", "Ask back"],
  model: [
   ["Yes, I've watched anime since I was a kid.", "The stories deal with serious themes like loss and friendship.", "I watched a whole series last weekend in two days.", "Do you think anime is only for kids?"],
   ["Yes, I went to Tokyo Disneyland three years ago.", "I wanted to see the parades I'd watched on TV.", "We waited two hours for one ride, but it was worth it.", "Have you been to a theme park abroad?"],
   ["Yes, I saw a musical in Seoul last spring.", "Live shows have an energy that movies don't have.", "The whole audience stood up and cheered at the end.", "What was the last show you saw?"],
   ["I visit museums about twice a year.", "I love learning about history in a relaxed way.", "The last time was in March, at the National Museum.", "Which museum would you recommend?"],
   ["Yes, I went to one in Macau once.", "I was curious, but I set a strict limit.", "I lost thirty dollars in ten minutes and left.", "Do you think casinos should be legal?"],
   ["Yes, I tried one on that same trip.", "It's designed to make you keep playing.", "The lights and sounds made me want to try again.", "Why do you think people get addicted?"],
   ["Everland and Lotte World are the most popular.", "They're close to Seoul and have world-class rides.", "Everland's wooden roller coaster is famous.", "Which rides do you enjoy most?"],
   ["You can hike, visit free museums, or walk by the Han River.", "Fun doesn't have to cost money.", "Last Sunday I went hiking and had a picnic.", "What do you do when you're on a budget?"],
   ["I've played StarCraft and Minecraft.", "StarCraft was huge in Korea when I was growing up.", "I used to play at a PC room after school for hours.", "Do you play any games now?"],
   ["Mobile games and online team games are popular.", "Korea has fast internet and many PC rooms.", "Professional gamers here are as famous as athletes.", "Are games a sport, in your opinion?"]
  ],
  frame: [
   "I've watched … since … because …",
   "I went there … ago. / I haven't been yet, but …",
   "I saw … last … It was …",
   "I visit museums … The last time was …",
   "Yes, once, … / No, never, because …",
   "Yes, I tried it … / No, because …",
   "… is the most popular because …",
   "You can … for free. Last …, I …",
   "I've played … I used to … for …",
   "… are popular because … For example, …"
  ],
  more: [
   ["Why is anime popular around the world?", "Can cartoons be art?", "Would you visit Japan for anime?"],
   ["Are theme parks too expensive?", "Is it better to go as a child or an adult?", "What would your dream theme park have?"],
   ["Why are theater tickets so expensive?", "Will live shows survive streaming?", "Would you ever act on stage?"],
   ["Are museums boring for young people?", "Should museums be free?", "What would you put in a museum about your life?"],
   ["Should casinos be legal in every country?", "Is gambling a harmless hobby for some?", "What would you do if you won a big prize?"],
   ["Should slot machines be banned?", "How do games keep people playing?", "Is buying items in mobile games like gambling?"],
   ["Why do people love scary rides?", "Are theme parks worth the waiting time?", "Would you work at a theme park?"],
   ["Do people spend too much on fun?", "Was free time better in the past?", "What's the best free thing in your city?"],
   ["How many hours of gaming is too much?", "Can video games teach useful skills?", "Should gaming be an Olympic sport?"],
   ["Why do some games become trends so fast?", "Are traditional games disappearing?", "What game will be popular in ten years?"]
  ],
  gram1: {
   chain: ["Last ___, I ___ for ___.", "I haven't ___ yet, but I will ___ soon."],
   ex: "T: Last month, I binge-watched a drama for two days.<br>S: Last year, I …<br>T: …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["When did you last go to the theater?", "How long did your longest movie night last?", "Have you seen the new Marvel movie yet?", "When will you take your next trip?", "How often do you go to concerts?"],
    ans: "Answer with a time word <b>+ why?</b>"
   },
   b: {
    title: "Then and now",
    big: "Ten years ago, I ___ for fun. These days, I ___. Soon, I'd like to ___.",
    ans: "Then ask: <b>How has your free time changed?</b>"
   }
  },
  opener: {
   think: ["What counts as good entertainment — relaxing or exciting?", "Do we spend too much time on screens for fun?", "What did your parents do for fun when they were young?"]
  },
  convo: [
   ["A", "Any plans for the long weekend?"],
   ["B", "Not yet. I'm thinking of seeing {a musical}."],
   ["A", "Oh, I saw one last month. It was amazing."],
   ["B", "Really? How long was it?"],
   ["A", "About three hours, but it didn't feel long."],
   ["B", "Tickets are expensive, though."],
   ["A", "True. We could {go to Everland} instead."],
   ["B", "Hmm, or we could {hike Bukhansan} for free."],
   ["A", "Good idea. Let's do that {on Saturday}!"]
  ],
  swap: [["a show", "a musical"], ["a paid activity", "go to Everland"], ["a free activity", "hike Bukhansan"], ["a time", "on Saturday"]],
  lang: [
   ["Make plans", ["Any plans for …?", "We could …", "How about …?"]],
   ["Ask about time", ["How long was it?", "When did you go?", "How often do you …?"]],
   ["Give a reason", ["It didn't feel long.", "It's worth it.", "…, though."]],
   ["Agree", ["Good idea.", "Let's do that!"]]
  ],
  langPractice: ["I've never been to a museum.", "I spent 100 dollars at a theme park.", "I think anime is childish.", "I play games for six hours a day.", "Musicals are boring.", "I went to Las Vegas last year."],
  survey: {
   ask: "Have you ever",
   cols: ["Me", "My teacher", "One more question"],
   rows: ["been to a theme park abroad", "seen a live musical", "watched a whole series in one day", "been to an art museum alone", "stood in line for hours", "played a game all night"],
   q: "Have you ever …? → Yes. → Ask: When? / How long? / Was it worth it?",
   report: "My teacher and I both ___, but only I ___."
  },
  gap: {
   who: "Leo's weekend plan",
   q: ["When is Leo going to the museum?", "How long will he stay at the park?", "What show has he already seen?", "What hasn't he done yet?", "Where will he go on Sunday?"],
   A: [["museum", "Saturday morning"], ["park", "?"], ["already seen", "a jazz concert"], ["not yet", "?"], ["Sunday", "?"]],
   B: [["museum", "?"], ["park", "for three hours"], ["already seen", "?"], ["not yet", "ride the new coaster"], ["Sunday", "a free film festival"]],
   tip: "<b>When</b> is he…? · He hasn't … <b>yet</b>."
  },
  role: {
   A: ["You are a weekend event planner.", "Ask 5 questions + 2 follow-ups.", "Plan a day with times and a budget."],
   B: ["You want a great weekend.", "Choose: thrill seeker / art lover / no budget.", "Give reasons and past examples."]
  },
  tts: {
   title: "Design \"The best free weekend in your city\"",
   steps: ["Think: what is fun and costs nothing?", "Ask your teacher 4 of today's questions.", "Agree on a plan with times.", "Present your weekend in 1 minute."],
   lang: ["On Saturday morning, we'll ___.", "It only takes ___, so ___.", "We haven't decided ___ yet."]
  },
  speech: {
   time: "2 min",
   model: ["Hi everyone. Today I'll talk about entertainment in my life.", "When I was a kid, I watched anime every day after school.", "These days, I prefer live shows and musicals.", "Last spring, I saw a musical in Seoul, and it was unforgettable.", "I've never been to a casino, and I don't plan to go.", "I also love free fun, like hiking and street festivals.", "Next month, I'm going to visit a new art museum.", "Thanks for listening! Any questions?"],
   outline: ["Hook — \"Today I'll talk about…\"", "Fun as a child (then)", "Fun now (these days)", "A great memory + when", "A future plan", "Ask for questions"],
   check: ["Clear voice", "Eye contact", "Time words", "Answer 1 question"]
  },
  pron: {
   cols: [["/hævjə/", ["Have you ever", "Have you seen", "Have you tried"]], ["/bɪn/", ["I've been", "She's been", "never been"]], ["Time word", ["a year aGO", "ALready", "not YET"]]],
   up: "Have you ever been to a musical?",
   down: "How long did it last?"
  },
  review: ["I can answer in 4 parts.", "I can use adverbs of time.", "I can plan fun with a partner.", "I can give a short presentation."]
 }
};
