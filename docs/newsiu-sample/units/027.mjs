// SIU BASIC 027 — Weather and the Seasons (8판 형식, 001 본보기와 같은 모양)
// 원본과 다른 점:
//  - Keyword Weather 품사 verb → noun (뜻이 «날씨» 명사)
//  - Q2 "in you country which are caused by weather" → "Does your country have many disasters caused by weather?"
//  - Q4 "How does weather affect your attitude?" → 그대로
//  - Q6 "around you country" → "in your country"
//  - Q7 "Do you get tornadoes where you are from?" → 그대로
//  - Q9 "in advanced" → "in advance", Keyword Future 품사 adj → noun
//  - Q10 "What crops are produced in which seasons in your country?" → "Which crops grow in which seasons in your country?"
//  - 답 틀의 "their is … that cause be weather" → "there are … caused by weather", "No I never experience it" → "No, I never have."
export default {
 no: "027",
 title: "Weather and the Seasons",
 book: "SIU BASIC 027 - Weather and the Seasons",
 next: "028 When Did You First",
 cover: { h1: "Weather &", em: "the Seasons", goals: ["Talk about weather and seasons", "Ask and answer 10 questions", "Give a short weather report"] },
 KW: [
  ["weather", "noun", "날씨", "how hot, cold, sunny or rainy it is"],
  ["disaster", "noun", "재난", "a sudden event that causes great damage"],
  ["snow", "noun", "눈", "soft white ice that falls from the sky"],
  ["attitude", "noun", "태도", "how you feel and act about something"],
  ["typhoon", "noun", "태풍", "a huge storm with strong wind and rain"],
  ["month", "noun", "달, 월", "one of the 12 parts of a year"],
  ["tornado", "noun", "토네이도", "a spinning column of very strong wind"],
  ["married", "adjective", "결혼한", "having a husband or wife"],
  ["future", "noun", "미래", "the time that will come later"],
  ["crop", "noun", "농작물", "a plant farmers grow for food"]
 ],
 QS: [
  "Have you ever been caught in bad weather? What did you do?",
  "Does your country have many disasters caused by weather?",
  "Do you like snow?",
  "How does weather affect your attitude?",
  "Have you ever been caught in a typhoon?",
  "Which month gets the most rain in your country?",
  "Do you get tornadoes where you are from?",
  "What is the best season to get married?",
  "Why is it important to know the weather in advance?",
  "Which crops grow in which seasons in your country?"
 ],
 IMG_E: ["scene-words/16545", "scene-words/14373", "scene-words/18744", "scene-words/18174", "scene-words/18946", "scene-words/15650", "scene-words/15778", "scene-words/12360", "scene-words/12195", "scene-words/18041"],
 IMG_H: ["scene-words/19241", "scene-words/17340", "scene-words/16510", "scene-words/16231", "scene-words/17347", "scene-words/20244", "scene-words/21331", "scene-words/19462", "scene-words/20108", "scene-words/14686"],
 PICS: {
  opener: "scene-words/19248",
  talk: "scene-words/16230",
  group: "scene-clips/7041",
  speech: "scene-words/20206",
  reporter: "scene-words/18767",
  survey: "scene-words/18452",
  pron: "scene-clips/7477",
  roleB: "scene-words/16596",
  cover: "scene-words/18452",
  back: "scene-words/12820"
 },
 gram1: {
  can: "use words for groups",
  title: "Collective",
  em: "Nouns",
  rules: [
   ["One word for a group", "a <b>team</b> of players · a <b>crowd</b> of people"],
   ["Think of it as one", "The <b>team</b> <mark>is</mark> ready."]
  ],
  hardNote: "a band of musicians · a flock of birds · a herd of cows · a gang of thieves",
  say: ["A collective noun is one word for a group.", "A team of players. A crowd of people.", "The team is ready."]
 },
 gram2: {
  can: "talk about groups of people and animals",
  cols: ["People", "Animals"],
  rows: [
   ["+", "The <b>crowd</b> <mark>is</mark> wet from the rain.", "A <b>flock</b> of birds <mark>is</mark> flying south."],
   ["−", "The <b>team</b> <mark>isn't</mark> playing in the snow.", "The <b>herd</b> <mark>isn't</mark> in the field today."],
   ["?", "<b>Is</b> the <b>band</b> playing outside?", "<b>Is</b> the <b>flock</b> leaving for winter?"]
  ]
 },
 gapCan: "ask \"What's the weather like?\"",
 role: {
  title: "The",
  em: "Weather",
  tail: "Report",
  opener: "Good morning! Here is today's weather.",
  a: "Weather reporter",
  b: "Traveler"
 },
 pron: {
  can: "say weather words clearly",
  title: "The -y",
  em: "ending",
  game: "Teacher says a weather noun → you add -y and make a sentence: <i>\"rain → It's rainy today.\"</i>"
 },
 E: {
  steps: ["Answer", "More"],
  model: [
   ["Yes, I was caught in the rain.", "I ran into a store."],
   ["Yes, we have typhoons.", "Floods come in summer, too."],
   ["Yes, I love snow!", "I make a snowman every winter."],
   ["Sunny days make me happy.", "Rainy days make me sleepy."],
   ["Yes, I have.", "I stayed home and watched TV."],
   ["July gets the most rain.", "It rains almost every day."],
   ["No, we don't.", "I saw a tornado on TV."],
   ["Spring is the best season.", "The flowers are beautiful."],
   ["It helps us get ready.", "We can take an umbrella."],
   ["Rice grows in summer.", "We eat apples in fall."]
  ],
  frame: [
   "Yes, I was caught in the ___. I ___.",
   "Yes, we have ___. / No, we don't.",
   "Yes, I love snow! I ___. / No, I don't.",
   "___ days make me ___.",
   "Yes, I have. I ___. / No, I haven't.",
   "___ gets the most rain.",
   "Yes, we do. / No, we don't. I saw one ___.",
   "___ is the best season. It is ___.",
   "It helps us ___. We can ___.",
   "___ grows in ___."
  ],
  bank: [
   ["rain", "snow", "wind", "ran home"],
   ["typhoons", "floods", "heavy snow", "heat waves"],
   ["make a snowman", "throw snowballs", "go sledding", "stay inside"],
   ["Sunny", "Rainy", "happy", "sleepy"],
   ["stayed home", "watched TV", "closed the windows", "read books"],
   ["June", "July", "August", "September"],
   ["on TV", "in a movie", "in a book", "online"],
   ["Spring", "Fall", "warm", "beautiful"],
   ["get ready", "stay safe", "take an umbrella", "wear a coat"],
   ["Rice", "Apples", "summer", "fall"]
  ],
  more: [
   ["Were you wet?", "Who were you with?"],
   ["Are typhoons scary?", "What should we do in a flood?"],
   ["When did it snow last?", "Is snow cold or fun?"],
   ["What do you do on rainy days?", "What is your favorite weather?"],
   ["Was it windy?", "Were you scared?"],
   ["Do you like rain?", "Do you have rain boots?"],
   ["Do you want to see a tornado?", "Is it scary?"],
   ["Have you been to a wedding?", "What season was it?"],
   ["Do you check the weather?", "What is the weather today?"],
   ["What fruit do you like?", "What season is it now?"]
  ],
  gram1: {
   chain: ["I see a ___ of ___.", "The ___ is ___."],
   ex: "T: I see a team of players. The team is happy.<br>S: I see a crowd of people. The crowd is wet.<br>T: I …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["Is your class big?", "Is your family big?", "Is your soccer team good?", "Is your school band loud?", "Is your group of friends funny?"],
    ans: "Yes, it is. / No, it isn't. <b>+ one more sentence</b>"
   },
   b: {
    title: "Groups in the weather",
    big: "A ___ of birds is flying. The ___ is wet in the rain.",
    ans: "Then ask: <b>What group do you see in winter?</b>"
   }
  },
  opener: {
   think: ["Look at the tree. What season is it?", "What is the weather like today?", "What is your favorite season?"]
  },
  convo: [
   ["A", "Wow, it's {raining} again!"],
   ["B", "I know! I don't like {rainy} days."],
   ["A", "What's your favorite season?"],
   ["B", "I like {winter}. I can {play in the snow}."],
   ["A", "Cool! I like summer. I can swim."],
   ["B", "Let's check the weather for tomorrow."],
   ["A", "Good idea!"]
  ],
  swap: [["weather now", "raining"], ["weather you don't like", "rainy"], ["your season", "winter"], ["what you do", "play in the snow"]],
  lang: [
   ["Talk about weather", ["It's sunny.", "It's cold.", "It's raining."]],
   ["Ask back", ["How about you?", "What's your favorite?"]],
   ["React", ["Wow!", "Me too!", "Brr!"]]
  ],
  langPractice: ["It's snowing!", "It's so hot.", "I love spring.", "I hate rain.", "It's windy.", "I like winter."],
  survey: {
   ask: "Do you like",
   cols: ["Me", "My teacher"],
   rows: ["snow", "rainy days", "hot summers", "windy days", "spring flowers", "fall leaves"],
   q: "Do you like …?  → Yes, I do. / No, I don't.",
   report: "I like ___, but my teacher doesn't."
  },
  gap: {
   who: "Busan",
   q: ["What's the weather like in Busan today?", "How hot is it?", "What should people wear?", "What about tomorrow?"],
   A: [["today", "sunny"], ["temperature", "?"], ["wear", "a hat"], ["tomorrow", "?"]],
   B: [["today", "?"], ["temperature", "28 degrees"], ["wear", "?"], ["tomorrow", "rainy"]],
   tip: "It <b>is</b> sunny · It <b>will be</b> rainy"
  },
  role: {
   A: ["You are a TV weather reporter.", "Tell the weather for 3 cities.", "Say what to wear."],
   B: ["You are going on a trip.", "Choose: Jeju / Seoul / Busan.", "Ask 3 questions about the weather."]
  },
  tts: {
   title: "Make a seasons poster",
   steps: ["Pick your favorite season.", "Ask your teacher's favorite.", "Find one thing you both like.", "Draw it and tell!"],
   lang: ["I like ___ because ___.", "My teacher likes ___.", "We both like ___!"]
  },
  speech: {
   time: "1 min",
   model: ["Hello! I'm Jisu.", "My favorite season is winter.", "It is cold and snowy.", "I make a snowman with my brother.", "I don't like rainy days.", "Thank you!"],
   outline: ["Name", "Favorite season", "The weather", "What you do", "Thank you!"],
   check: ["Loud voice", "Look at the camera", "Say 5 things"]
  },
  pron: {
   cols: [["rain → rainy", ["rainy", "sunny", "windy"]], ["cloud → cloudy", ["cloudy", "snowy", "foggy"]], ["storm → stormy", ["stormy", "icy", "chilly"]]],
   up: "Is it raining?",
   down: "What's the weather like?"
  },
  review: ["I can talk about the weather.", "I can say group words.", "I can ask \"What's the weather like?\"", "I can say one more sentence."]
 },
 H: {
  steps: ["Answer", "Reason", "Example", "Ask back"],
  model: [
   ["Yes, I got caught in a storm last summer.", "The forecast said sunny, so I had no umbrella.", "I waited in a café for an hour, soaking wet.", "What would you have done?"],
   ["Yes, typhoons and floods hit us almost every year.", "Korea gets heavy rain in the monsoon season.", "In 2022, parts of Seoul were flooded.", "Are there natural disasters where you live?"],
   ["I like snow, but only for a day or two.", "It's beautiful, but it makes travel difficult.", "Last winter my bus was two hours late because of ice.", "Do you enjoy snow?"],
   ["Weather really affects my mood.", "Gray skies make me tired and less motivated.", "On sunny days, I want to go out and see friends.", "Are you affected by weather?"],
   ["Yes, a typhoon hit Jeju during my trip.", "All the flights were canceled.", "We stayed in the hotel for two extra days.", "Have you ever had a trip ruined by weather?"],
   ["July gets the most rain in Korea.", "That's when the monsoon season, jangma, comes.", "It sometimes rains for a week without stopping.", "What's the rainy season like where you live?"],
   ["No, we rarely get tornadoes in Korea.", "Our land and climate don't really cause them.", "I've only seen them in American movies.", "Would you ever go storm chasing?"],
   ["I think fall is the best season to get married.", "It's not too hot, and the sky is clear.", "My cousin had an outdoor wedding in October.", "Which season would you choose?"],
   ["It helps us plan and stay safe.", "Farmers, pilots and fishers depend on it.", "Before a typhoon, people tie down boats and close shops.", "Do you trust weather forecasts?"],
   ["Rice grows in summer, and we harvest it in fall.", "It needs lots of water and heat.", "Cabbage for kimchi is picked in late fall.", "What crops grow in your country?"]
  ],
  frame: [
   "Yes, I got caught in … I …",
   "Yes, … hit us … because …",
   "I like / don't like snow because … Once, …",
   "Weather affects my … For example, …",
   "Yes, … / No, but … Once, …",
   "… gets the most rain because …",
   "No, we rarely … because …",
   "… is the best season because …",
   "It's important because … For example, …",
   "… grows in … and we harvest it in …"
  ],
  more: [
   ["Do you check the forecast every morning?", "What is the worst weather you've been in?", "Is it fun to walk in the rain?"],
   ["Is climate change making disasters worse?", "How can a city prepare for floods?", "Should people rebuild in dangerous areas?"],
   ["Do you prefer a white winter or a warm one?", "What is the best snow activity?", "Should schools close on snowy days?"],
   ["Which weather makes you the most productive?", "Do sunny countries have happier people?", "Can music change a bad-weather mood?"],
   ["What should you pack for a typhoon?", "Should typhoons have people's names?", "Are you scared of strong winds?"],
   ["Do you like the rainy season? Why?", "What do you do on long rainy days?", "Is rain good for the economy?"],
   ["Which is worse: a tornado or an earthquake?", "Why do people chase storms?", "How can people stay safe in a tornado?"],
   ["Indoor or outdoor wedding — which is better?", "Should weather affect a wedding date?", "What makes a wedding memorable?"],
   ["How accurate are forecasts today?", "Should apps warn about heat waves?", "What jobs depend most on weather?"],
   ["Which season has the best food?", "Should we eat only seasonal food?", "How will climate change affect farming?"]
  ],
  gram1: {
   chain: ["A ___ of ___ is outside in the rain.", "The ___ isn't ___ today."],
   ex: "T: A crowd of fans is outside in the rain.<br>S: A flock of birds is outside in the rain.<br>T: The team isn't …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["Is your family big or small?", "Is your favorite team winning this season?", "Is the crowd at concerts too loud?", "Is your class good at teamwork?", "Is a herd of cows a common sight in Korea?"],
    ans: "Answer <b>+ reason and example</b>"
   },
   b: {
    title: "Group + weather",
    big: "In summer, I see a ___ of ___. In winter, I see a ___ of ___.",
    ans: "Then ask: <b>What group do you see most in your season?</b>"
   }
  },
  opener: {
   think: ["Which season shows the biggest change in nature?", "How does the weather change your plans?", "Is the weather in your country changing? How?"]
  },
  convo: [
   ["A", "Ugh, it's {pouring} again. This {rainy season} is so long."],
   ["B", "I know. It's been raining for a week!"],
   ["A", "Does bad weather affect your mood?"],
   ["B", "Definitely. I feel {lazy} all day."],
   ["A", "Same here. Which season do you like best?"],
   ["B", "{Fall}. The air is cool and the sky is clear."],
   ["A", "That sounds nice. I prefer summer, though."],
   ["B", "Really? Even with the heat?"],
   ["A", "Yeah! I love the beach. Let's check the forecast."]
  ],
  swap: [["weather now", "pouring"], ["a long season", "rainy season"], ["a mood", "lazy"], ["your season", "Fall"]],
  lang: [
   ["Describe weather", ["It's boiling hot.", "It's freezing.", "It's pouring."]],
   ["Make small talk", ["Nice weather today, huh?", "Can you believe this rain?", "I heard it'll snow."]],
   ["Give opinions", ["I prefer …", "For me, … is the best.", "I can't stand …"]],
   ["Agree / disagree", ["Same here.", "Really? Not me."]]
  ],
  langPractice: ["I love the rainy season.", "Summer is the worst.", "Forecasts are always wrong.", "I never use an umbrella.", "Snow is dangerous.", "Fall is too short."],
  survey: {
   ask: "Do you",
   cols: ["Me", "My teacher", "One more question"],
   rows: ["check the forecast daily", "enjoy the rainy season", "feel sleepy on cloudy days", "prefer winter to summer", "like walking in the rain", "worry about climate change"],
   q: "Do you …? → Yes. → Ask: Why? / How often? / Since when?",
   report: "My teacher and I both ___, but only I ___."
  },
  gap: {
   who: "Jeju",
   q: ["What's the weather like in Jeju today?", "How strong is the wind?", "Is a typhoon coming? When?", "What should travelers do?", "What will it be like next week?"],
   A: [["today", "cloudy and humid"], ["wind", "?"], ["typhoon", "yes — Thursday"], ["travelers", "?"], ["next week", "?"]],
   B: [["today", "?"], ["wind", "strong, 60 km/h"], ["typhoon", "?"], ["travelers", "check flights, stay inside"], ["next week", "sunny and clear"]],
   tip: "It <b>is</b> cloudy · It <b>will</b> clear up · It's <b>going to</b> rain"
  },
  role: {
   A: ["You are a TV weather reporter.", "Report the week: 3 days + 1 warning.", "Answer the traveler's questions."],
   B: ["You plan a trip to Jeju next week.", "Ask 5 questions + 2 follow-ups.", "Decide: go, change dates or cancel? Explain why."]
  },
  tts: {
   title: "Plan the perfect trip by season",
   steps: ["Think: which season is best for which trip?", "Ask your teacher 4 of today's questions.", "Agree on one trip, one season, and why.", "Present your plan in 1 minute."],
   lang: ["We should go in ___ because ___.", "Good point, but what about ___?", "So we agree on ___."]
  },
  speech: {
   time: "2 min",
   model: ["Good evening! Here is your weather report.", "Today in Seoul, it's cloudy and humid.", "It's 29 degrees, so drink plenty of water.", "Tomorrow, heavy rain is coming, so take an umbrella.", "A typhoon may reach Jeju on Thursday.", "Please check your flights and stay safe.", "By the weekend, it'll be sunny and clear.", "That's the weather. Any questions?"],
   outline: ["Hook — \"Here is your weather…\"", "Today + advice", "Tomorrow + advice", "A warning", "The weekend", "Ask for questions"],
   check: ["Clear voice", "Eye contact", "Weather + advice", "Answer 1 question"]
  },
  pron: {
   cols: [["rain → rainy", ["rainy", "sunny", "windy"]], ["cloud → cloudy", ["cloudy", "stormy", "foggy"]], ["humid", ["humid", "freezing", "chilly"]]],
   up: "Is it going to snow?",
   down: "Which season do you like best?"
  },
  review: ["I can answer in 4 parts.", "I can use collective nouns.", "I can make small talk about weather.", "I can give a weather report."]
 }
};
