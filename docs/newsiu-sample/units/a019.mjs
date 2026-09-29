// SIU ADVANCE 019 — Travel (8판 형식, 001 본보기)
// 원본과 다른 점:
//  - 문법(목적격 대명사) 예문 "Bob took her to work Monday." 등은 여행 주제로 바꾸고, I→me · he→him … 표를 +−? 표로 정리
//  - Q4 "Pescribe the most interesting person…" → "Describe …" (OCR 오타)
//  - Q5 "What was your best and worst trip" → "What were your best and worst trips?"
//  - Q6 "Vid your class in high school go on a trip together?" → "Did your class …" (쉬운 판은 «school» 로 읽어도 됨)
//  - Q10 "…that you have ever bought when you travel before?" → "…that you have ever bought on a trip?"
//  - Keyword Lost 한글 «잃어버리다»(동사) → «길을 잃은»(형용사)
//  - Keyword Package 뜻 "a set of proposals or terms…" → 패키지 여행의 뜻으로 바꿈
//  - Keyword Harm 뜻 "physical injury, especially … deliberately inflicted" → 쉬운 뜻(해, 피해)으로
//  - 대답 틀 "No I never been lost on travel." → "No, I've never been lost." 등 문법을 바로잡아 새로 씀
export default {
 no: "a019",
 title: "Travel",
 book: "SIU ADVANCE 019 - Travel",
 next: "020 Relationship and Love",
 cover: { h1: "Let's", em: "Travel", goals: ["Talk about trips and tourists", "Ask and answer 10 questions", "Use object pronouns: me, him, them"] },
 KW: [
  ["tourist", "noun", "관광객", "a person who visits a place for fun"],
  ["pack", "verb", "(짐을) 싸다", "to put things into a bag for a trip"],
  ["alone", "adjective", "혼자", "with no one else"],
  ["interesting", "adjective", "흥미로운", "making you want to know more"],
  ["trip", "noun", "여행", "a journey to a place and back again"],
  ["together", "adverb", "함께", "with other people"],
  ["lost", "adjective", "길을 잃은", "not knowing where you are or how to get back"],
  ["package", "noun", "패키지 (여행 상품)", "a trip where travel, hotel and tours are sold together"],
  ["harm", "noun", "해, 피해", "damage or hurt done to something"],
  ["souvenir", "noun", "기념품", "something you buy to remember a place"]
 ],
 QS: [
  "Does your country have many tourists? What do you think of them?",
  "If you could only pack five things for a trip to an unknown place, what would you take?",
  "Are you afraid of going abroad alone?",
  "Describe the most interesting person you met on one of your travels.",
  "What were your best and worst trips?",
  "Did your class in high school go on a trip together?",
  "Have you ever gotten lost while traveling? If so, tell about it.",
  "Have you ever taken a package tour?",
  "Do you think tourism will harm the earth?",
  "What is the most interesting souvenir you have ever bought on a trip?"
 ],
 IMG_E: ["scene-words/14809", "scene-clips/7497", "scene-words/12746", "scene-words/17223", "scene-words/18006", "scene-words/12529", "scene-words/18530", "scene-words/18637", "scene-words/16683", "scene-words/15084"],
 IMG_H: ["scene-words/18122", "scene-words/14636", "scene-words/12542", "scene-words/18435", "scene-words/18634", "scene-words/12529", "scene-words/18754", "scene-words/17140", "scene-words/12769", "scene-words/14608"],
 PICS: {
  opener: "scene-words/18693",
  talk: "scene-words/18435",
  group: "scene-words/19286",
  speech: "scene-words/17404",
  reporter: "scene-words/17140",
  survey: "scene-words/18055",
  pron: "scene-words/18754",
  roleB: "scene-words/12746",
  cover: "scene-words/18122",
  back: "scene-words/12180"
 },
 gram1: {
  can: "use me, him, her, us, them",
  title: "Object",
  em: "Pronouns",
  rules: [
   ["After a verb", "The guide helped <b>us</b>."],
   ["After a preposition", "I bought a gift for <b>her</b>."]
  ],
  hardNote: "I→me · you→you · he→him · she→her · it→it · we→us · they→them",
  say: [
   "Object pronouns come after a verb or a preposition.",
   "The guide helped us.",
   "I bought a gift for her."
  ]
 },
 gram2: {
  can: "ask \"Can you help me?\"",
  cols: ["me · you · him · her", "it · us · them"],
  rows: [
   ["+", "A kind man showed <b>me</b> the way.", "We sent <b>them</b> a postcard."],
   ["−", "Don't leave <b>him</b> alone.", "I didn't pack <b>it</b>."],
   ["?", "Can you help <b>her</b>?", "Will you visit <b>us</b>?"]
  ]
 },
 gapCan: "ask \"Who did she travel with?\"",
 role: {
  title: "The",
  em: "Travel Agent",
  tail: "Desk",
  opener: "Hello! Where would you like to go this year?",
  a: "Travel agent",
  b: "Traveler"
 },
 pron: {
  can: "link him, her and them",
  title: "Weak forms of",
  em: "him · her · them",
  game: "Teacher says a sentence with a name → you say it with a pronoun: <i>\"I called Mina.\" → \"I called her.\"</i>"
 },
 E: {
  steps: ["Answer", "More"],
  model: [
   ["Yes, lots of tourists visit.", "I like them. They love K-food."],
   ["I'd take a phone, water and snacks.", "I'd also take a map and a jacket."],
   ["Yes, I'm a little afraid.", "I'd rather travel with my family."],
   ["I met a guide in Japan.", "He taught us some Japanese words."],
   ["My best trip was to Jeju.", "My worst trip was rainy and boring."],
   ["Yes, we went to Gyeongju together.", "We visited old temples."],
   ["Yes, I got lost in a big mall.", "A kind woman helped me."],
   ["Yes, I took one with my parents.", "A guide took us everywhere."],
   ["Yes, a little.", "Tourists sometimes leave trash."],
   ["I bought a funny cat magnet.", "I gave it to my sister."]
  ],
  frame: [
   "Yes / No. I ___ them.",
   "I'd take ___, ___ and ___.",
   "Yes, I'm ___. / No, I'm not.",
   "I met a ___ in ___.",
   "My best trip was ___.",
   "Yes, we went to ___ together.",
   "Yes, I got lost in ___. / No, never.",
   "Yes, I took one with ___. / No.",
   "Yes / No. Tourists ___.",
   "I bought a ___."
  ],
  bank: [
   ["like", "help", "welcome", "avoid"],
   ["a phone", "water", "snacks", "a map"],
   ["a little afraid", "scared", "excited", "brave"],
   ["guide", "kid", "shop owner", "Seoul / Tokyo"],
   ["to Jeju", "to the beach", "too long", "rainy"],
   ["a museum", "a park", "Gyeongju", "the mountains"],
   ["a mall", "a city", "a park", "a station"],
   ["my parents", "my class", "my grandma", "my aunt"],
   ["leave trash", "make noise", "use water", "spend money"],
   ["magnet", "key chain", "cup", "T-shirt"]
  ],
  more: [
   ["Where do tourists go?", "What would you show them?"],
   ["What would you forget to pack?", "Do you pack light?"],
   ["Where would you go alone?", "Who would you call?"],
   ["What did you talk about?", "Do you still remember him?"],
   ["Where do you want to go next?", "Who did you go with?"],
   ["What was the best part?", "What did you eat?"],
   ["How did you feel?", "Who helped you?"],
   ["Was the guide kind?", "Do you like tours or free travel?"],
   ["How can tourists help nature?", "Do you pick up trash?"],
   ["Who did you buy it for?", "Where is it now?"]
  ],
  gram1: {
   chain: ["I love my mom. I call ___ every day.", "My friends are fun. I visit ___ often."],
   ex: "T: I love my dog. I walk him every day.<br>S: I love my grandma. I visit her …<br>T: …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["Can you help me?", "Do you call her?", "Did you see them?", "Do you like him?", "Can you visit us?"],
    ans: "Yes, I can / do. / No … <b>+ one more sentence</b>"
   },
   b: {
    title: "A travel gift",
    big: "I bought a ___ for my ___. I gave it to ___.",
    ans: "Then ask: <b>What did you buy for them?</b>"
   }
  },
  opener: {
   think: ["Look at the photo. Where do they want to go?", "Where did you go on your last trip?", "What do you pack first?"]
  },
  convo: [
   ["A", "How was your trip to {Jeju}?"],
   ["B", "It was great! I went with {my cousins}."],
   ["A", "What did you do there?"],
   ["B", "We {rode horses} together."],
   ["A", "Did you buy any souvenirs?"],
   ["B", "Yes, I bought {a key chain} for you!"],
   ["A", "Wow, thank you! I'll keep it."]
  ],
  swap: [["a place", "Jeju"], ["people", "my cousins"], ["an activity", "rode horses"], ["a souvenir", "a key chain"]],
  lang: [
   ["Ask about a trip", ["How was your trip?", "Who did you go with?"]],
   ["Show interest", ["Wow!", "Sounds fun!", "Lucky you!"]],
   ["Say thanks", ["Thank you!", "That's so kind!"]]
  ],
  langPractice: ["I went to Japan.", "I got lost in Busan.", "I love beaches.", "I bought a T-shirt.", "I traveled alone.", "I never travel."],
  survey: {
   ask: "Do you like",
   cols: ["Me", "My teacher"],
   rows: ["traveling by plane", "beaches", "big cities", "camping", "trying new food", "buying souvenirs"],
   q: "Do you like …?  → Yes, I do. / No, I don't.",
   report: "I like ___, but my teacher ___."
  },
  gap: {
   who: "Mina's trip",
   q: ["Where did Mina go?", "Who did she go with?", "What did she do?", "What did she buy?"],
   A: [["place", "Thailand"], ["went with", "?"], ["did", "swam with fish"], ["bought", "?"]],
   B: [["place", "?"], ["went with", "her grandparents"], ["did", "?"], ["bought", "a hat for her dad"]],
   tip: "She went with <b>them</b> · She bought it for <b>him</b>"
  },
  role: {
   A: ["You are a travel agent.", "Ask 5 questions.", "Suggest a place."],
   B: ["You want to travel.", "Choose: beach / city / mountains.", "Answer with 2 sentences."]
  },
  tts: {
   title: "Plan a class trip",
   steps: ["Pick a place to visit.", "Ask your teacher what they like.", "Choose 3 things to do.", "Show your plan and tell!"],
   lang: ["Let's go to ___.", "We can ___ together.", "My teacher likes ___."]
  },
  speech: {
   time: "1 min",
   model: ["Hello! Let me tell you about my best trip.", "Last summer, I went to Jeju.", "I went with my cousins.", "We rode horses and swam together.", "I bought a key chain for my friend. She loves it.", "Thank you!"],
   outline: ["Hello", "Where and when", "Who you went with", "What you did", "A souvenir", "Thank you!"],
   check: ["Loud voice", "Look at teacher", "Use him / her / them"]
  },
  pron: {
   cols: [["him → 'im", ["tell him", "help him", "met him"]], ["her → 'er", ["call her", "ask her", "visit her"]], ["them → 'em", ["take them", "buy them", "love them"]]],
   up: "Did you like it?",
   down: "Where did you go?"
  },
  review: ["I can talk about trips.", "I can use me, him, her, them.", "I can ask about a trip.", "I can say one more sentence."]
 },
 H: {
  steps: ["Answer", "Reason", "Example", "Ask back"],
  model: [
   ["Yes, Korea gets millions of tourists now.", "I welcome them; they enjoy our culture.", "I once showed a lost couple the subway.", "Are tourists welcome where you live?"],
   ["I'd take a phone, a power bank and cash.", "They'd keep me connected and safe.", "I'd add a jacket and a first-aid kit too.", "What would you never travel without?"],
   ["Not really — I actually enjoy it.", "Traveling alone forces you to talk to people.", "In Vietnam, I made friends in a hostel in one night.", "Have you ever traveled alone?"],
   ["I met an old fisherman in Portugal.", "He'd sailed around the world twice.", "He told me stories while he fixed his nets.", "Who is the most interesting traveler you've met?"],
   ["My best trip was hiking in Switzerland.", "My worst was a beach trip that rained all week.", "We played cards in the hotel for five days.", "What was your worst trip?"],
   ["Yes, our class went to Gyeongju together.", "It was the first time I traveled without my parents.", "We stayed up all night telling ghost stories.", "What do you remember from school trips?"],
   ["Yes, I got lost in Tokyo once.", "All the stations looked the same to me.", "A student walked me to my hotel.", "How do you find your way now?"],
   ["Yes, I took one to China with my grandparents.", "It was easy, but we had little free time.", "They took us to many shops we didn't need.", "Do you prefer tours or free travel?"],
   ["Yes, mass tourism can harm fragile places.", "Crowds damage nature and raise local prices.", "Some beaches in Thailand had to close for years.", "How can tourists travel responsibly?"],
   ["I bought a wooden mask in Bali.", "It reminds me of a local festival I saw.", "It still hangs on my bedroom wall.", "What's the strangest souvenir you've seen?"]
  ],
  frame: [
   "Yes / No. I think tourists … because …",
   "I'd take … because … I'd also …",
   "I'm / I'm not afraid because … Once, …",
   "I met … in … He/She …",
   "My best trip was … My worst was …",
   "Yes, our class went to … It was …",
   "Yes, I got lost in … / No, I've never …",
   "Yes, I took one to … / No, because …",
   "I think tourism … because … For example, …",
   "I bought … in … It reminds me of …"
  ],
  more: [
   ["Should cities limit tourists?", "What do tourists get wrong here?", "Would you live in a tourist city?"],
   ["What's the most useless thing people pack?", "Do you pack light or heavy?", "What would you pack for a desert island?"],
   ["What are the risks of solo travel?", "Is solo travel safe for everyone?", "Where would you go alone?"],
   ["Why do we remember strangers from trips?", "Do you keep in touch with them?", "Would you host a traveler at home?"],
   ["What makes a trip great?", "Can a bad trip teach you something?", "Is it better to plan or be spontaneous?"],
   ["Are school trips useful for learning?", "Should schools have trips abroad?", "Who would you travel with again?"],
   ["Are maps apps making us worse at finding our way?", "What would you do without your phone?", "Is getting lost sometimes good?"],
   ["What are the pros and cons of package tours?", "Who are package tours best for?", "Would you trust a cheap tour?"],
   ["Should flights be more expensive to protect the planet?", "Is ecotourism a real solution?", "How has tourism changed your city?"],
   ["Are souvenirs a waste of money?", "What is a better way to remember a trip?", "What souvenir would you give a foreigner?"]
  ],
  gram1: {
   chain: ["On my last trip, a stranger helped ___ by ___.", "I bought a souvenir for ___ because ___."],
   ex: "T: On my last trip, a stranger helped me by lending me an umbrella.<br>S: A stranger helped me by …<br>T: …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["Have your friends ever visited you abroad?", "Would you travel with your parents now?", "Do you send your family photos when you travel?", "Did anyone ever help you on a trip?", "Would you lend your suitcase to a friend?"],
    ans: "Yes, I … them / her / him. <b>+ an example</b>"
   },
   b: {
    title: "Thank a helper",
    big: "A ___ helped me when I ___. I thanked him/her by ___. I'll never forget them.",
    ans: "Then ask: <b>Who helped you on a trip?</b>"
   }
  },
  opener: {
   think: ["Is traveling the best way to learn?", "Would you rather see many places quickly or one place slowly?", "Does tourism help or hurt a country?"]
  },
  convo: [
   ["A", "Welcome back! How was {Vietnam}?"],
   ["B", "Amazing, but I got totally lost on day one."],
   ["A", "Oh no! What happened?"],
   ["B", "My phone died in the middle of {Hanoi}."],
   ["A", "So how did you find your hotel?"],
   ["B", "A {street vendor} helped me. She walked me there."],
   ["A", "That's so kind of her! Did you thank her?"],
   ["B", "I bought her {a coffee}. We still message each other."],
   ["A", "That's the best souvenir — a new friend!"]
  ],
  swap: [["a country", "Vietnam"], ["a city", "Hanoi"], ["a helper", "street vendor"], ["a thank-you gift", "a coffee"]],
  lang: [
   ["Ask about a trip", ["How was it?", "What was the highlight?", "Would you go back?"]],
   ["React", ["Oh no!", "That's so kind!", "Lucky you!"]],
   ["Tell a story", ["On the first day, …", "Then, …", "In the end, …"]],
   ["Give advice", ["You should …", "Make sure you …"]]
  ],
  langPractice: ["I lost my passport in Paris.", "I only travel by package tour.", "I've never been abroad.", "Tourists are ruining my town.", "I spent all my money on souvenirs.", "I traveled alone for a month."],
  survey: {
   ask: "Would you",
   cols: ["Me", "My teacher", "One more question"],
   rows: ["travel alone for a month", "take a package tour", "stay in a hostel", "eat street food anywhere", "travel without a phone", "live abroad for a year"],
   q: "Would you …? → Yes. → Ask: Why? / Where? / Have you ever …?",
   report: "We both would ___, but only I ___."
  },
  gap: {
   who: "Leo's trip to Peru",
   q: ["Who did Leo travel with?", "Where did he get lost?", "Who helped him?", "What did he buy?", "Who did he give it to?"],
   A: [["traveled with", "two old friends"], ["got lost", "?"], ["helper", "a farmer"], ["bought", "?"], ["gave it to", "?"]],
   B: [["traveled with", "?"], ["got lost", "in the mountains"], ["helper", "?"], ["bought", "a warm wool hat"], ["gave it to", "his mother"]],
   tip: "Who helped <b>him</b>? · He gave <b>it</b> to <b>her</b>."
  },
  role: {
   A: ["You are a travel agent.", "Ask 5 questions + 2 follow-ups.", "Plan a trip and explain why it fits."],
   B: ["You want a special trip.", "Choose: honeymoon / solo trip / family trip.", "Give reasons. Say what you don't want."]
  },
  tts: {
   title: "Design a responsible trip",
   steps: ["Think: how can tourists cause less harm?", "Ask your teacher 4 of today's questions.", "Agree on a place and 3 travel rules.", "Present your trip in 1 minute."],
   lang: ["I think we should ___ because ___.", "Let's avoid ___ so we don't harm ___.", "We agree that ___."]
  },
  speech: {
   time: "2 min",
   model: ["Hi everyone. Today I'll tell you about an unforgettable trip.", "Two years ago, I traveled alone to Vietnam.", "On the first day, my phone died and I got lost.", "A street vendor saw me and walked me to my hotel.", "I bought her a coffee to thank her.", "We still message each other today.", "That trip taught me to trust strangers a little more.", "Thanks for listening! Any questions?"],
   outline: ["Hook — \"Today I'll tell you…\"", "Where, when, who with", "A problem", "Who helped you", "What you learned", "Ask for questions"],
   check: ["Clear voice", "Eye contact", "Object pronouns", "Answer 1 question"]
  },
  pron: {
   cols: [["him → 'im", ["thank him", "show him", "found him"]], ["her → 'er", ["help her", "tell her", "bought her"]], ["them → 'em", ["pack them", "visit them", "met them"]]],
   up: "Would you go back?",
   down: "What was the highlight?"
  },
  review: ["I can answer in 4 parts.", "I can use object pronouns.", "I can tell a travel story.", "I can give a short presentation."]
 }
};
