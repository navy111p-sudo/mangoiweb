// SIU ADVANCE 012 — Family (8판 형식, 001 본보기)
// 원본과 다른 점:
//  - 문법 예문 "Bill refuses to eat peas, nor will he touch carrots." 는 그대로 쓰기 어려워 nor 예문을 짧게 새로 씀
//  - Q1 "What are advantage and disadvantage of a big family?" → "What are the advantages and disadvantages of a big family?"
//  - Q4 "If you will become a parent, would be strict?" → "If you became a parent, would you be strict?"
//  - Q10 "…or should they have the liberty to choose another?" 는 그대로, 앞부분 쉼표만 정리
//  - Keyword Single(adj) 뜻 "is alone or having only one" → "only one, with no brothers or sisters"
//  - 대답 틀 "The advantages and disadvantages of a big family is" → "One advantage … is …, but one disadvantage is …" (수 일치)
//  - 쉬운 판(중고생): 체벌(Q7)은 «대화·규칙이 더 낫다» 로, 때리는 장면 묘사 없음
export default {
 no: "a012",
 title: "Family",
 book: "SIU ADVANCE 012 - Family",
 next: "013 Education",
 cover: { h1: "My", em: "Family", goals: ["Talk about family life and rules", "Ask and answer 10 questions", "Join ideas with and · but · or · so"] },
 KW: [
  ["family", "noun", "가족", "parents, children and relatives as a group"],
  ["single", "adjective", "혼자인, 단 하나의", "only one, with no brothers or sisters"],
  ["daughter", "noun", "딸", "someone's female child"],
  ["strict", "adjective", "엄격한", "making sure people follow the rules"],
  ["visit", "verb", "방문하다", "to go to see someone and spend time with them"],
  ["curfew", "noun", "통금 시간", "a time when you must be back home"],
  ["spank", "verb", "(엉덩이를) 때리다", "to hit a child with an open hand as punishment"],
  ["housework", "noun", "집안일", "work like cleaning, cooking and washing at home"],
  ["jealous", "adjective", "질투하는", "unhappy because someone has what you want"],
  ["liberty", "noun", "자유", "the freedom to choose how you live"]
 ],
 QS: [
  "What are the advantages and disadvantages of a big family?",
  "Is it good or bad to be a single child?",
  "If you could choose, would you rather have a daughter or a son?",
  "If you became a parent, would you be strict?",
  "Do you often visit your grandparents?",
  "Should parents set curfews for teens?",
  "Is spanking a good way to discipline children?",
  "Should children help with the housework?",
  "Are you jealous of any of your family members?",
  "Should people follow their parents' religion, or have the liberty to choose another?"
 ],
 IMG_E: ["scene-words/16380", "scene-words/15564", "scene-words/16860", "scene-words/18493", "scene-words/18640", "scene-words/19224", "scene-words/18145", "scene-words/15267", "scene-words/16754", "scene-words/21377"],
 IMG_H: ["scene-words/19307", "scene-words/12542", "scene-words/15083", "scene-words/17370", "scene-words/19411", "scene-words/12580", "scene-words/15415", "scene-words/16735", "scene-words/19015", "scene-words/15662"],
 PICS: {
  opener: "scene-words/14712",
  talk: "scene-words/12054",
  group: "scene-clips/7176",
  speech: "scene-words/15095",
  reporter: "scene-words/18482",
  survey: "scene-words/19398",
  pron: "scene-clips/7170",
  roleB: "scene-words/17240",
  cover: "scene-words/19411",
  back: "scene-words/18004"
 },
 gram1: {
  can: "join ideas with and · but · or · so",
  title: "Joining",
  em: "Sentences",
  rules: [
   ["Add / contrast", "I have a sister, <b>and</b> she's funny. I love her, <b>but</b> she's noisy."],
   ["Choose / result", "Tea <b>or</b> milk? It was late, <b>so</b> I went home."]
  ],
  hardNote: "F·A·N·B·O·Y·S = for · and · nor · but · or · yet · so",
  say: [
   "Coordinating conjunctions join two equal parts of a sentence.",
   "I have a sister, and she's funny. I love her, but she's noisy.",
   "Tea or milk? It was late, so I went home."
  ]
 },
 gram2: {
  can: "ask \"… or …?\" questions",
  cols: ["and · but · or", "so · yet · nor · for"],
  rows: [
   ["+", "I love my brother, <b>but</b> he's noisy.", "I was tired, <b>so</b> I went to bed."],
   ["−", "I <b>don't</b> have a brother <b>or</b> a sister.", "He didn't call, <b>nor</b> did he text."],
   ["?", "Do you want a son <b>or</b> a daughter?", "It's late, <b>so</b> should we go home?"]
  ]
 },
 gapCan: "ask \"Who does … in Mina's family?\"",
 role: {
  title: "The",
  em: "Family",
  tail: "Advice Show",
  opener: "Welcome to Family Talk! What's your question today?",
  a: "Radio host",
  b: "Caller"
 },
 pron: {
  can: "link and / or smoothly",
  title: "Linking",
  em: "and · or",
  game: "Teacher says two family words → you link them fast: <i>\"mom 'n' dad · son or daughter\"</i>"
 },
 E: {
  steps: ["Answer", "More"],
  model: [
   ["A big family is fun, but it can be noisy.", "You always have someone to play with."],
   ["It's good and bad.", "You get more attention, but you can feel lonely."],
   ["I would like a daughter.", "We could cook and play games together."],
   ["Yes, a little.", "I'd have rules, but I'd also listen to my kids."],
   ["Yes, I visit them every holiday.", "My grandma makes delicious rice cakes."],
   ["Yes, I think so.", "Parents worry, so teens should come home on time."],
   ["No, I don't think so.", "Talking and clear rules work better."],
   ["Yes, they should.", "Everyone lives there, so everyone should help."],
   ["Sometimes I am.", "My sister gets a bigger allowance, but she's older."],
   ["I think they should have the liberty to choose.", "But they can learn about their parents' beliefs, too."]
  ],
  frame: [
   "A big family is ___, but it can be ___.",
   "It's good because ___, but ___.",
   "I would like a ___. We could ___ together.",
   "Yes, a little. / No. I would ___, but I'd ___.",
   "Yes, I visit them ___. / Not often, but ___.",
   "Yes, I think so. / No. Parents ___, so ___.",
   "No, I don't think so. ___ work better.",
   "Yes, they should. They can ___ or ___.",
   "Sometimes I am, but ___. / No, I'm not.",
   "I think they should ___, but ___."
  ],
  bank: [
   ["fun", "busy", "noisy", "warm"],
   ["more attention", "lonely", "more toys", "no fights"],
   ["daughter", "son", "cook", "play soccer"],
   ["have rules", "be kind", "listen", "give chores"],
   ["every holiday", "on weekends", "once a month", "on birthdays"],
   ["worry", "care", "come home on time", "call"],
   ["Talking", "Clear rules", "Time-outs", "Hugs"],
   ["wash dishes", "clean their room", "cook", "take out trash"],
   ["jealous", "happy for them", "not jealous", "a little sad"],
   ["choose", "learn", "ask questions", "respect"]
  ],
  more: [
   ["How many people are in your family?", "Do you want a big family later?"],
   ["Do you have brothers or sisters?", "Would you like one more?"],
   ["Why did you choose that?", "What would you name your child?"],
   ["Are your parents strict?", "What is one rule at home?"],
   ["Where do your grandparents live?", "What do you do together?"],
   ["What time do you come home?", "Is that fair?"],
   ["What happens when you break a rule?", "What rule is fair?"],
   ["What housework do you do?", "Do you get money for it?"],
   ["Who gets the most attention at home?", "How do you share things?"],
   ["What holidays does your family celebrate?", "What traditions do you like?"]
  ],
  gram1: {
   chain: ["I love my ___, but ___.", "I was ___, so I ___."],
   ex: "T: I love my brother, but he takes my snacks.<br>S: I love my mom, but she's strict.<br>T: I was hungry, so …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["Cats or dogs?", "Brother or sister?", "Son or daughter?", "Summer or winter?", "Cook or clean?"],
    ans: "I like …, but … / I like … because … <b>+ one more</b>"
   },
   b: {
    title: "My family",
    big: "My family is ___, and we ___. We ___, but we ___.",
    ans: "Then ask: <b>What is your family like?</b>"
   }
  },
  opener: {
   think: ["Look at the photo. Who is in this family?", "Who do you live with?", "What do you do with your family on weekends?"]
  },
  convo: [
   ["A", "How many people are in your family?"],
   ["B", "Five. My parents, {two brothers} and me."],
   ["A", "Wow, that's a big family! Is it noisy?"],
   ["B", "Very! But it's fun, and we {play games} every night."],
   ["A", "Do you help with the housework?"],
   ["B", "Yes. I {wash the dishes}, and my brothers clean."],
   ["A", "That's fair. I'm {a single child}, so I help a lot too."]
  ],
  swap: [["your siblings", "two brothers"], ["a family activity", "play games"], ["a chore", "wash the dishes"], ["your partner's family", "a single child"]],
  lang: [
   ["Show interest", ["Wow!", "Really?", "That sounds fun!"]],
   ["Ask for more", ["Who does the cooking?", "What do you do together?"]],
   ["Agree / disagree", ["That's fair.", "I'm not so sure."]]
  ],
  langPractice: ["I have four sisters.", "I'm an only child.", "My curfew is 7 p.m.", "I never do housework.", "My grandma lives with us.", "My brother is really annoying."],
  survey: {
   ask: "Do you",
   cols: ["Me", "My teacher"],
   rows: ["have brothers or sisters", "live with your grandparents", "do housework every day", "have a curfew", "eat dinner with your family", "fight with your siblings"],
   q: "Do you …?  → Yes, I do. / No, I don't.",
   report: "I ___, but my teacher ___."
  },
  gap: {
   who: "Mina's family",
   q: ["How many people are in Mina's family?", "Who does the cooking?", "When does she visit her grandma?", "What is her curfew?"],
   A: [["family", "four people"], ["cooking", "?"], ["grandma", "every Sunday"], ["curfew", "?"]],
   B: [["family", "?"], ["cooking", "her dad"], ["grandma", "?"], ["curfew", "6 p.m. on weekdays"]],
   tip: "<b>Who</b> does the cooking? · Her dad cooks, <b>and</b> she cleans."
  },
  role: {
   A: ["You host a family advice show.", "Ask 5 questions.", "Give one piece of advice."],
   B: ["You have a small family problem.", "Choose: noisy brother / too much housework / early curfew.", "Answer with and / but / so."]
  },
  tts: {
   title: "Make \"Our family rules\"",
   steps: ["Think of 3 fair family rules.", "Ask your teacher 3 of today's questions.", "Agree on the best 3 rules.", "Share your rules and why!"],
   lang: ["Everyone should ___, and ___.", "Kids can ___, but ___.", "We ___, so ___."]
  },
  speech: {
   time: "1 min",
   model: ["Hello! Let me tell you about my family.", "There are four people: my parents, my sister and me.", "My dad is funny, and my mom is kind.", "My sister is sometimes noisy, but I love her.", "We visit my grandparents every month, so I see them often.", "My family is small, but it's warm. Thank you!"],
   outline: ["Hello", "Who is in your family", "and …", "but …", "so …", "Thank you!"],
   check: ["Loud voice", "Look at teacher", "and / but / so"]
  },
  pron: {
   cols: [["and → 'n'", ["mom 'n' dad", "you 'n' me", "salt 'n' pepper"]], ["or", ["son or daughter", "yes or no", "now or later"]], ["but / so ‖", ["…, but I", "…, so we", "…, but it's"]]],
   up: "Do you visit your grandparents?",
   down: "Who does the housework?"
  },
  review: ["I can talk about my family.", "I can use and / but / or / so.", "I can ask \"… or …?\" questions.", "I can say one more sentence."]
 },
 H: {
  steps: ["Answer", "Reason", "Example", "Ask back"],
  model: [
   ["A big family gives support, but it's expensive and crowded.", "You're never alone, yet privacy is rare.", "My mother grew up with six siblings and shared a room with three.", "Would you like a big family?"],
   ["It has both good and bad sides.", "You get attention, but you may feel pressure.", "My only-child friend says holidays feel quiet and lonely.", "Did you grow up with siblings?"],
   ["I wouldn't mind either, but I'd slightly prefer a daughter.", "I feel closer to my mom than my dad.", "My friend's daughter calls her mom every day.", "What about you?"],
   ["I'd be strict about safety, but relaxed about small things.", "Kids need clear limits and some freedom.", "My parents were strict about homework, yet they let me choose my hobbies.", "Were your parents strict?"],
   ["Not as often as I'd like, but we call weekly.", "They live three hours away, so visits take planning.", "We always visit on Chuseok and eat songpyeon together.", "How often do you see yours?"],
   ["Yes, but it should be flexible.", "Teens need freedom, yet parents need to know they're safe.", "My curfew was ten, but I could stay out later for events.", "Did you have a curfew?"],
   ["No, I don't think it's effective.", "It teaches fear, not understanding.", "Many countries have banned it, including Korea.", "How were you disciplined as a child?"],
   ["Definitely, and it should start young.", "It teaches responsibility, so kids become independent.", "I started doing laundry at twelve, and it helped in college.", "What chores did you do growing up?"],
   ["Honestly, I was jealous of my older brother.", "He got more freedom, but I had more rules.", "Now that we're adults, we laugh about it.", "Were you ever jealous of a sibling?"],
   ["I think people should have the liberty to choose.", "Faith should be a personal decision, not a duty.", "My friend chose a different religion, and her parents came to accept it.", "Should parents teach their religion?"]
  ],
  frame: [
   "A big family …, but … For example, …",
   "It's … because …, but …",
   "I'd prefer a … because … , yet …",
   "I'd be strict about …, but …",
   "I visit them …, so … We always …",
   "I think parents should …, but …",
   "I think spanking is … because …",
   "I think children should …, so …",
   "I was / wasn't jealous of …, but …",
   "I think people should …, for …"
  ],
  more: [
   ["Are families getting smaller? Why?", "Is it better to grow up with cousins nearby?", "How many children would you like?"],
   ["Are only children really spoiled?", "Why are so many Korean families having one child?", "Would you have just one child?"],
   ["Do parents treat sons and daughters differently?", "Has this changed over time?", "Would you rather have twins?"],
   ["What's the right balance of rules and freedom?", "Are strict parents more successful?", "What rule would you never give your kids?"],
   ["Should grandparents live with the family?", "What can grandparents teach us?", "How will you care for your parents later?"],
   ["What's a fair curfew for a sixteen-year-old?", "Should the curfew change on weekends?", "What if a teen breaks it?"],
   ["What's the best way to discipline a child?", "Should the law control how parents discipline?", "Can too little discipline be harmful?"],
   ["Should kids be paid for chores?", "Is housework shared equally in most homes?", "What chore do you hate most?"],
   ["Is sibling rivalry healthy?", "Do parents ever have favorites?", "How can jealousy be turned into motivation?"],
   ["At what age can people choose their beliefs?", "Can a family with different beliefs be close?", "Should schools teach about all religions?"]
  ],
  gram1: {
   chain: ["My family is ___, yet ___, so ___.", "We could either ___ or ___, but I'd rather ___."],
   ex: "T: My family is small, yet it's never quiet, so I rarely feel lonely.<br>S: My family is …<br>T: …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["Big family or small family?", "Strict or relaxed parents?", "Live near or far from parents?", "Paid chores or unpaid chores?", "Daughter or son?"],
    ans: "I'd prefer …, but … / …, so … <b>+ why? + example</b>"
   },
   b: {
    title: "Two sides",
    big: "Being an only child is ___, yet ___, so I think ___. Do you agree?",
    ans: "Then ask: <b>What was it like for you?</b>"
   }
  },
  opener: {
   think: ["How is family life different from your parents' generation?", "What makes a family close?", "Should adult children live with their parents?"]
  },
  convo: [
   ["A", "You look stressed. What's up?"],
   ["B", "My parents set a {ten o'clock} curfew, but I'm nineteen!"],
   ["A", "That's strict. Did you talk to them about it?"],
   ["B", "I tried, but they just worry, so they won't change it."],
   ["A", "Maybe offer a deal. You could {text them every hour}."],
   ["B", "That's a good idea, yet I'm not sure they'll agree."],
   ["A", "Try it. My parents agreed when I {shared my location}."],
   ["B", "Okay, I'll ask tonight, and I'll {offer to do more chores}."],
   ["A", "Good luck! Let me know how it goes."]
  ],
  swap: [["a curfew time", "ten o'clock"], ["a deal", "text them every hour"], ["what worked", "shared my location"], ["an extra offer", "offer to do more chores"]],
  lang: [
   ["Show concern", ["What's up?", "That's tough.", "I can see why you're upset."]],
   ["Suggest", ["You could …", "Why not …?", "Maybe try …"]],
   ["Compromise", ["How about a deal?", "Let's meet halfway."]],
   ["Contrast", ["…, but …", "…, yet …"]]
  ],
  langPractice: ["My parents read my messages.", "I still live with my parents at thirty.", "Chores should be paid.", "Only children are spoiled.", "My brother is my best friend.", "Grandparents are too soft on kids."],
  survey: {
   ask: "Do you think",
   cols: ["Me", "My teacher", "One more question"],
   rows: ["big families are happier", "teens need curfews", "kids should be paid for chores", "grandparents should live with families", "parents should be strict", "people should choose their own religion"],
   q: "Do you think …? → Yes/No, but … → Ask: Why? / Example?",
   report: "My teacher thinks ___, but I think ___, so we ___."
  },
  gap: {
   who: "The Kim family rules",
   q: ["What is the teen's curfew?", "Who does most of the housework?", "How do the parents discipline?", "When do they visit grandparents?", "What can the kids choose freely?"],
   A: [["curfew", "10 p.m., 11 on Fridays"], ["housework", "?"], ["discipline", "no phone for a day"], ["grandparents", "?"], ["free choice", "?"]],
   B: [["curfew", "?"], ["housework", "shared on a chart"], ["discipline", "?"], ["grandparents", "every other Sunday"], ["free choice", "hobbies and clubs"]],
   tip: "<b>Who</b> does …? · They share it, <b>so</b> … · …, <b>but</b> …"
  },
  role: {
   A: ["You host a family advice radio show.", "Ask 5 questions + 2 follow-ups.", "Suggest a compromise with and / but / so."],
   B: ["You call with a family problem.", "Choose: strict curfew / jealous sibling / unfair chores.", "Explain both sides fairly."]
  },
  tts: {
   title: "Design a \"Fair family agreement\"",
   steps: ["Think: what causes family arguments?", "Ask your teacher 4 of today's questions.", "Agree on 3 rules for parents and kids.", "Present your agreement in 1 minute."],
   lang: ["Kids should ___, and parents should ___.", "Teens can ___, but ___.", "If someone ___, then ___, so ___."]
  },
  speech: {
   time: "2 min",
   model: ["Hi everyone. Today I'll talk about being an only child.", "I grew up without brothers or sisters.", "I had my parents' full attention, and I had my own room.", "But I sometimes felt lonely, so I joined many clubs.", "My cousins lived nearby, yet they felt more like guests.", "Now I'm very independent, and I love quiet time.", "So being an only child had both good and bad sides.", "Thanks for listening! Any questions?"],
   outline: ["Hook — \"Today I'll talk about…\"", "Your family situation", "A good side (and …)", "A hard side (but … / so …)", "How it shaped you", "Ask for questions"],
   check: ["Clear voice", "Eye contact", "and / but / so / yet", "Answer 1 question"]
  },
  pron: {
   cols: [["and → 'n'", ["mom 'n' dad", "you 'n' me", "rules 'n' chores"]], ["or", ["son or daughter", "strict or relaxed", "now or never"]], ["but / yet / so ‖", ["…, but I", "…, yet we", "…, so they"]]],
   up: "Were your parents strict?",
   down: "What rule would you give your kids?"
  },
  review: ["I can answer in 4 parts.", "I can use and / but / or / so / yet.", "I can discuss family rules.", "I can give a short presentation."]
 }
};
