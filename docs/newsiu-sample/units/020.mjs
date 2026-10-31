// SIU BASIC 020 — Korea (8판 형식, 001 본보기와 같은 모양)
// 원본과 다른 점:
//  Q2 "Why the country of North Korea not as rich as South Korea?" → "Why is North Korea not as rich as South Korea?" (is 빠짐)
//  Q3 "…North Korea's leader Kim Jong Un?" → "…North Korea's leader, Kim Jong Un?" (쉼표)
//  Q8 "What is the most beautiful Place in Korea" → "…place in Korea?" (대문자·물음표)
//  KW beautiful: 원본 품사 noun → adjective 로 바로잡음
//  KW 뜻풀이(war·country·leader·proud·good·history·beautiful·group)를 쉬운 영어로 줄임
//  문법 예시: 원본 "Aah! The monster's got me!" "Eww! That movie was so gory." 등 → 한국 주제의 쉬운 예문으로
export default {
 no: "020",
 title: "Korea",
 book: "SIU BASIC 020 - Korea",
 next: "021 Likes and Dislikes",
 cover: { h1: "All About", em: "Korea", goals: ["Talk about Korea", "Ask and answer 10 questions", "Introduce a place in Korea"] },
 KW: [
  ["war", "noun", "전쟁", "fighting between countries or groups with armies"],
  ["country", "noun", "나라", "a nation with its own land and government"],
  ["leader", "noun", "지도자", "the person who leads a group or a country"],
  ["person", "noun", "사람", "one human being"],
  ["proud", "adjective", "자랑스러운", "happy about something good you or your people did"],
  ["good", "adjective", "좋은", "nice, pleasant or helpful"],
  ["history", "noun", "역사", "things that happened in the past"],
  ["beautiful", "adjective", "아름다운", "very pretty and nice to look at"],
  ["delicious", "adjective", "맛있는", "tasting very good"],
  ["group", "noun", "그룹", "a number of people or things together"]
 ],
 QS: [
  "What do you know about the Korean War?",
  "Why is North Korea not as rich as South Korea?",
  "What do you think about North Korea's leader, Kim Jong Un?",
  "What is your idea of a typical Korean person?",
  "What things about Korea do you think Korean people are proud of?",
  "What are the good things and bad things about North and South Korea?",
  "What do you know about North and South Korean history?",
  "What is the most beautiful place in Korea?",
  "What is the most delicious food in Korea?",
  "What is your favorite K-pop group?"
 ],
 IMG_E: ["scene-words/15031", "scene-words/13262", "scene-words/16455", "scene-words/16671", "scene-words/18654", "scene-words/15170", "scene-words/12017", "scene-words/14723", "scene-words/15313", "scene-words/13186"],
 IMG_H: ["scene-words/15031", "scene-words/14719", "scene-words/17345", "scene-words/17277", "scene-words/18481", "scene-words/13262", "scene-words/20252", "scene-words/16534", "scene-words/14867", "scene-words/12869"],
 PICS: {
  opener: "scene-words/15170", talk: "scene-words/17277", group: "scene-words/18360", speech: "scene-words/16671",
  reporter: "scene-words/16589", survey: "scene-words/15313", pron: "scene-words/19100", roleB: "scene-words/18481",
  cover: "scene-words/16589", back: "scene-words/18654"
 },
 gram1: {
  can: "show my feelings with Wow! and Oh no!",
  title: "Feelings with",
  em: "Interjections",
  rules: [
   ["Happy / surprised", "<b>Wow!</b> Jeju is so beautiful!"],
   ["Upset / hurt", "<b>Oh no!</b> It's raining. <b>Ouch!</b> That's hot!"]
  ],
  hardNote: "Wow! · Yay! · Oops! · Ouch! · Ugh! · Yuck!  →  use an ! mark",
  say: [
   "Interjections are short words that show a sudden feeling. We usually put an exclamation mark after them.",
   "Wow! Jeju is so beautiful!",
   "Oh no! It's raining. Ouch! That's hot!"
  ]
 },
 gram2: {
  can: "react with the right interjection",
  cols: ["Good feelings", "Bad feelings"],
  rows: [
   ["+", "<b>Yay!</b> We won the game!", "<b>Ugh!</b> This is too spicy!"],
   ["−", "<b>Phew!</b> It wasn't hard.", "<b>Oops!</b> I didn't see you."],
   ["?", "<b>Really?</b> Is Busan that big?", "<b>What?</b> You've never tried kimchi?"]
  ]
 },
 gapCan: "ask \"Where did he go?\"",
 role: { title: "Korea", em: "Tour", tail: "Guide", opener: "Hi! It's my first time in Korea. Can you help me?", a: "Tourist", b: "Tour guide" },
 pron: { can: "show feelings with my voice", title: "Say it with", em: "Feeling", game: "Teacher shows a picture → you react with a feeling word: <i>\"Wow! It's so big!\"</i>" },
 E: {
  steps: ["Answer", "More"],
  model: [
   ["The Korean War was between North and South Korea.", "It started in 1950."],
   ["North Korea is closed to other countries.", "It doesn't trade very much."],
   ["I don't know much about him.", "I hope he helps his people."],
   ["A typical Korean person works hard.", "They also like spicy food."],
   ["Korean people are proud of K-pop.", "It is famous all over the world."],
   ["A good thing about South Korea is fast Wi-Fi.", "A bad thing is we can't visit North Korea."],
   ["Long ago, Korea was one country.", "Now it is two countries."],
   ["I think Jeju Island is the most beautiful.", "It has blue sea and a big mountain."],
   ["The most delicious food is bulgogi.", "It is sweet and yummy."],
   ["My favorite K-pop group is BTS.", "Their songs are exciting."]
  ],
  frame: [
   "The Korean War was between ___ and ___.",
   "North Korea is ___. It doesn't ___.",
   "I don't know much about him. I hope ___.",
   "A typical Korean person is ___.",
   "Korean people are proud of ___.",
   "A good thing about South Korea is ___.",
   "Long ago, Korea was ___. Now it is ___.",
   "I think ___ is the most beautiful.",
   "The most delicious food is ___. It is ___.",
   "My favorite K-pop group is ___."
  ],
  bank: [
   ["North Korea", "South Korea", "1950", "1953"],
   ["closed", "poor", "trade", "have much food"],
   ["he is kind", "people are happy", "there is peace", "leader"],
   ["hardworking", "kind", "busy", "polite"],
   ["K-pop", "kimchi", "hanbok", "Hangeul"],
   ["fast Wi-Fi", "safe streets", "good food", "clean subways"],
   ["one country", "two countries", "a kingdom", "divided"],
   ["Jeju Island", "Seoraksan", "Busan", "Gyeongju"],
   ["bulgogi", "kimchi", "tteokbokki", "yummy / spicy"],
   ["BTS", "BLACKPINK", "NewJeans", "SEVENTEEN"]
  ],
  more: [
   ["Who told you about it?", "Have you seen a war movie?"],
   ["Would you like to visit North Korea?", "What do people there eat?"],
   ["What makes a good leader?", "Who is a leader you like?"],
   ["Are you a typical Korean?", "What do Koreans do on weekends?"],
   ["What are you proud of?", "What would you show a friend?"],
   ["What would you change in Korea?", "Is Korea a safe country?"],
   ["Who is a famous Korean king?", "Do you like history class?"],
   ["Have you been there?", "Who did you go with?"],
   ["Is it spicy?", "Who makes it for you?"],
   ["What is your favorite song?", "Who is your favorite member?"]
  ],
  gram1: {
   chain: ["Wow! ___ is so ___!", "Oh no! ___."],
   ex: "T: Wow! Seoul Tower is so tall!<br>S: Oh no! I lost my phone.<br>T: …"
  },
  gram2: {
   a: { title: "React 5 times", items: ["I got 100 on my test!", "I dropped my ice cream.", "This kimchi is very spicy.", "We're going to Jeju!", "I touched a hot pan."], ans: "Wow! / Yay! / Oh no! / Ouch! <b>+ one more sentence</b>" },
   b: { title: "Your turn", big: "Wow! In Korea, we have ___!", ans: "Then ask: <b>Do you have … in your country?</b>" }
  },
  opener: { think: ["Look at the photo. Where is this?", "What do you like about Korea?", "What Korean thing would you show a friend?"] },
  convo: [
   ["A", "Hi, Jun! I'm new in Korea."],
   ["B", "Welcome! Where do you want to go?"],
   ["A", "I don't know. What's beautiful here?"],
   ["B", "{Jeju Island}! It's really beautiful."],
   ["A", "Wow! What food should I try?"],
   ["B", "Try {bibimbap}. It's delicious!"],
   ["A", "Cool! And what music do you like?"],
   ["B", "I love {BTS}. Listen to them!"]
  ],
  swap: [["a place", "Jeju Island"], ["a food", "bibimbap"], ["a K-pop group", "BTS"], ["a good word", "delicious"]],
  lang: [
   ["React", ["Wow!", "Really?", "Cool!"]],
   ["Suggest", ["Try …!", "You should go to …"]],
   ["Say one more", ["It's really …", "I love it!"]]
  ],
  langPractice: ["I ate kimchi for the first time!", "I went to Seoul Tower.", "I don't like spicy food.", "I love BTS.", "I saw a palace today.", "I lost my subway card."],
  survey: {
   ask: "Do you like",
   cols: ["Me", "My teacher"],
   rows: ["kimchi", "K-pop", "Korean dramas", "hanbok", "spicy food", "Korean history"],
   q: "Do you like …?  → Yes, I do. / No, I don't.",
   report: "I like ___, but my teacher doesn't."
  },
  gap: {
   who: "Tom",
   q: ["Where did Tom go in Korea?", "What food did he eat?", "What did he buy?", "Did he like Korea?"],
   A: [["went to", "Busan"], ["ate", "?"], ["bought", "a hanbok"], ["liked Korea?", "?"]],
   B: [["went to", "?"], ["ate", "bulgogi"], ["bought", "?"], ["liked Korea?", "Yes — very much!"]],
   tip: "Past: <b>did</b> he go? · he <b>went</b> · he <b>ate</b> · he <b>bought</b>"
  },
  role: {
   A: ["You are a tourist.", "Ask 5 questions.", "React: Wow! / Really?"],
   B: ["You are a tour guide.", "Choose: Seoul / Busan / Jeju.", "Answer with 2 sentences."]
  },
  tts: {
   title: "Make a Korea travel poster",
   steps: ["Pick a place, a food and a song.", "Ask your teacher about them.", "Choose the best one together.", "Show your poster and tell!"],
   lang: ["Come to ___!", "Wow! It's so ___.", "You should try ___."]
  },
  speech: {
   time: "1 min",
   model: ["Hello! My name is Hana.", "Let me tell you about Korea.", "Jeju Island is very beautiful.", "Bulgogi is delicious.", "I love K-pop. BTS is the best!", "Thank you!"],
   outline: ["Name", "A place", "A food", "Music", "Thank you!"],
   check: ["Loud voice", "Look at the camera", "Say 1 Wow!"]
  },
  pron: {
   cols: [["Happy", ["Wow!", "Yay!", "Hooray!"]], ["Surprised", ["Oh!", "What?", "Really?"]], ["Unhappy", ["Oh no!", "Ugh!", "Ouch!"]]],
   up: "Is Jeju beautiful?",
   down: "What is your favorite food?"
  },
  review: ["I can talk about Korea.", "I can use Wow! / Oh no! / Ouch!", "I can suggest a place and a food.", "I can say one more sentence."]
 },
 H: {
  steps: ["Answer", "Reason", "Example", "Ask back"],
  model: [
   ["It was a war between North and South Korea.", "It lasted from 1950 to 1953.", "It never officially ended — there was only a ceasefire.", "Did you learn about it in school?"],
   ["I think its closed economy is the main reason.", "It trades very little with other countries.", "South Korea grew fast by selling cars and phones abroad.", "What do you think the reason is?"],
   ["He's a powerful leader, but I worry about him.", "His missile tests make the region tense.", "Many news stories say people there lack basic freedoms.", "How do people in your country see him?"],
   ["A typical Korean person is hardworking and fast.", "We call it the \"ppalli-ppalli\" culture.", "People expect food delivery in twenty minutes.", "Is that true in your country too?"],
   ["I think Koreans are proud of Hangeul.", "King Sejong made it so everyone could read.", "It's easy to learn — some people learn it in a day.", "What is your country proud of?"],
   ["South Korea is free and rich, but very stressful.", "Students study late at night and jobs are hard to get.", "North Korea has clean nature, but little freedom.", "Which problem is harder to fix?"],
   ["Korea was one country for over a thousand years.", "After World War II, it was divided in two.", "Families were split and many never met again.", "Do you think the two Koreas will reunite?"],
   ["I think Seoraksan is the most beautiful place.", "The mountains turn red and gold in autumn.", "I hiked there with my family last October.", "Where is a beautiful place in your country?"],
   ["For me, it's samgyeopsal.", "It's fun to grill it yourself at the table.", "We wrap it in lettuce with garlic and ssamjang.", "Have you tried Korean barbecue?"],
   ["My favorite group is SEVENTEEN.", "They write and produce many of their own songs.", "Their live dance performances are amazing.", "Do you listen to K-pop?"]
  ],
  frame: [
   "The Korean War was … It started in …",
   "I think the main reason is … because …",
   "I think he is … because …",
   "A typical Korean person is … For example, …",
   "Koreans are proud of … because …",
   "A good thing is …, but a bad thing is …",
   "Korea was … Then …",
   "I think … is the most beautiful because …",
   "For me, it's … because …",
   "My favorite group is … because …"
  ],
  more: [
   ["How does the war still affect Korea today?", "Should war history be taught in detail?", "What can young people learn from it?"],
   ["What makes a country rich?", "Can North Korea's economy change?", "Is money the best way to measure a country?"],
   ["What makes someone a good leader?", "Should leaders have term limits?", "Which world leader do you respect? Why?"],
   ["Are stereotypes ever true?", "How are Koreans different from their parents' generation?", "What surprises foreigners about Koreans?"],
   ["Is being proud of your country a good thing?", "What is Korea's biggest success?", "What should Korea be less proud of?"],
   ["Would you like to visit North Korea someday?", "What should South Korea improve?", "Is South Korea a good place to raise children?"],
   ["Will Korea be one country in your lifetime?", "What would change if Korea reunited?", "Which period of Korean history interests you?"],
   ["Is tourism good or bad for beautiful places?", "Where would you take a foreign friend?", "Should famous places limit visitors?"],
   ["Why has Korean food become popular abroad?", "Which Korean food is hard for foreigners?", "Should restaurants make food less spicy for tourists?"],
   ["Why is K-pop so popular around the world?", "Is the K-pop idol life too hard?", "Will K-pop still be popular in 20 years?"]
  ],
  gram1: {
   chain: ["Wow! I didn't know that ___!", "Oops! I forgot to ___."],
   ex: "T: Wow! I didn't know Hangeul was made in 1443!<br>S: Oops! I forgot to bring my umbrella.<br>T: …"
  },
  gram2: {
   a: { title: "React + ask", items: ["Korea has 30 islands with bridges.", "I lost my passport in Seoul.", "I ate live octopus yesterday.", "BTS is coming to my city!", "The subway was so crowded I missed my stop."], ans: "Interjection + <b>a follow-up question</b>" },
   b: { title: "Surprise me", big: "Guess what! In Korea, ___. — Really? ___?", ans: "Then switch: <b>teacher shares a fact about their country</b>" }
  },
  opener: { think: ["What three words describe Korea best?", "What do foreigners often get wrong about Korea?", "How has Korea changed in the last 30 years?"] },
  convo: [
   ["A", "Excuse me, is this your first time in Korea?"],
   ["B", "Yes! I just arrived from {Canada}."],
   ["A", "Welcome! How do you like it so far?"],
   ["B", "Wow, it's amazing. The subway is so {clean}!"],
   ["A", "Ha! Have you tried any Korean food yet?"],
   ["B", "I tried {tteokbokki}. Ouch, it was spicy!"],
   ["A", "Oh no! You should try something milder, like {japchae}."],
   ["B", "Thanks! Any places you'd recommend?"],
   ["A", "Definitely {Gyeongju}. It's full of history."]
  ],
  swap: [["a country", "Canada"], ["a good word", "clean"], ["a spicy food", "tteokbokki"], ["a place", "Gyeongju"]],
  lang: [
   ["React", ["Wow, really?", "No way!", "Oh no!"]],
   ["Recommend", ["You should try …", "I'd recommend …", "Definitely …"]],
   ["Explain", ["It's a kind of …", "It's famous for …"]],
   ["Ask opinions", ["How do you like …?", "What do you think of …?"]]
  ],
  langPractice: ["Koreans eat kimchi every day.", "I think K-pop is overrated.", "Seoul is the best city in Asia.", "The Korean War ended in 1953.", "Korean is hard to learn.", "I've never been to Jeju."],
  survey: {
   ask: "Have you ever",
   cols: ["Me", "My teacher", "One more question"],
   rows: ["worn a hanbok", "climbed Hallasan", "watched a K-drama all night", "eaten live octopus", "visited the DMZ", "been to a K-pop concert"],
   q: "Have you ever …? → Yes. → Ask: When? / Who with? / How was it?",
   report: "My teacher has ___, but I haven't. / We have both ___."
  },
  gap: {
   who: "Tom",
   q: ["Where is Tom from?", "Where did he go in Korea?", "What surprised him?", "What food did he love?", "What does he want to do next time?"],
   A: [["from", "Toronto, Canada"], ["went to", "?"], ["surprised by", "?"], ["loved", "Korean fried chicken"], ["next time", "?"]],
   B: [["from", "?"], ["went to", "Seoul and Gyeongju"], ["surprised by", "the fast delivery"], ["loved", "?"], ["next time", "hike Seoraksan"]],
   tip: "Past: <b>did</b> he …? · went · loved · was surprised <b>by</b> — react: <b>Wow! / Really?</b>"
  },
  role: {
   A: ["You are a tourist in Korea.", "Ask 5 questions + 2 follow-ups.", "React to each answer."],
   B: ["You are a tour guide.", "Choose: history tour / food tour / K-pop tour.", "Give reasons and examples. Hide one secret spot — tell it only if asked \"Anything special?\""]
  },
  tts: {
   title: "Plan a 3-day Korea trip for a foreign friend",
   steps: ["Think: what should a first-time visitor see?", "Ask your teacher 4 of today's questions.", "Agree on 1 place, 1 food and 1 experience a day.", "Present your plan in 1 minute."],
   lang: ["On day one, we should ___ because ___.", "That's a good idea, but ___.", "So we agree on ___."]
  },
  speech: {
   time: "2 min",
   model: [
    "Hi everyone. Let me introduce my country, Korea.",
    "Korea is small, but it has a long history.",
    "It has been divided since 1953, and many families are still apart.",
    "Today, South Korea is famous for K-pop, dramas and technology.",
    "My favorite place is Gyeongju because it's full of old temples.",
    "You should try samgyeopsal — wow, it's delicious!",
    "I'm proud of Korea, but it still has problems like stress.",
    "Thanks for listening! Any questions?"
   ],
   outline: ["Hook — \"Let me introduce…\"", "History — one fact", "What Korea is famous for", "A place + why", "A food + an interjection", "Proud of / problem + questions"],
   check: ["Clear voice", "Eye contact", "Reasons and examples", "Answer 1 question"]
  },
  pron: {
   cols: [["Happy", ["Wow!", "Yay!", "Awesome!"]], ["Surprised", ["No way!", "What?", "Seriously?"]], ["Unhappy", ["Oh no!", "Ugh!", "Yikes!"]]],
   up: "Have you tried kimchi?",
   down: "What is Korea famous for?"
  },
  review: ["I can answer in 4 parts.", "I can react with interjections.", "I can recommend places and food.", "I can introduce Korea in 2 minutes."]
 }
};
