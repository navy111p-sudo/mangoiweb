// SIU ADVANCE 006 — Meaning of Life (8판 형식, 001 본보기)
// 원본과 다른 점:
//  - 문법 설명 "Unlikely, irregular verbs are verbs that do not form its simple past…" → "Unlike regular verbs, …" 뜻으로 쉽게 다시 씀
//  - Q2 "what is the best symbol to represent your life: a rain, a cloud, a rainbow or ?" → "…: rain, a cloud, a rainbow or something else?"
//  - Q4 대답 틀 "Yes I prayed to god … / No Im not." → "Yes, I have. … / No, I haven't."
//  - Q5 "Some people worship God in churches or in temples, what do you think about that?" → 두 문장으로 나눔
//  - Q7 "Why are we here is this world?" → "Why are we here in this world?"
//  - Q8 "What will you do if you can live forever?" → "What would you do if you could live forever?"
//  - Q9 "Is religion can save you" → "Can religion save you?"
//  - Keyword Forever 품사 adj → adverb · Represent 뜻(대표로 말하다) → 이 질문의 뜻(나타내다·상징하다) · All(adv) 뜻을 "all about" 에 맞게
// 민감 내용: 쉬운 판은 종교·죽음을 «사람마다 믿음이 다르다·존중한다·추억» 중심으로 부드럽게, 특정 종교를 권하지 않음
export default {
 no: "a006",
 title: "Meaning of Life",
 book: "SIU ADVANCE 006 - Meaning of life",
 next: "007 Advantages and Disadvantages",
 cover: { h1: "Meaning", em: "of Life", goals: ["Talk about big life questions", "Use irregular past forms", "Respect different beliefs"] },
 KW: [
  ["all", "adverb", "완전히, 전부", "completely; the whole of something"],
  ["represent", "verb", "나타내다, 상징하다", "to show or stand for something"],
  ["eternity", "noun", "영원", "time that never ends"],
  ["God", "noun", "신, 하느님", "the being many people believe made the world"],
  ["worship", "verb", "예배하다, 숭배하다", "to show deep love and respect for God or a god"],
  ["death", "noun", "죽음", "the end of a life"],
  ["world", "noun", "세상, 세계", "the earth and all the people on it"],
  ["forever", "adverb", "영원히", "for all time; always"],
  ["religion", "noun", "종교", "a belief in God or gods and the way people worship"],
  ["evolution", "noun", "진화", "the slow change of living things over a long time"]
 ],
 QS: [
  "What do you think life is all about?",
  "What is the best symbol of your life: rain, a cloud, a rainbow or something else?",
  "What is your opinion on eternity and God?",
  "Have you ever prayed to God?",
  "Some people worship God in churches or temples. What do you think about that?",
  "What do you think will happen after death?",
  "Why are we here in this world?",
  "What would you do if you could live forever?",
  "Can religion save you?",
  "Do you believe in creation or evolution?"
 ],
 IMG_E: ["scene-words/17384", "scene-words/16238", "scene-words/16775", "scene-words/15603", "scene-words/15662", "scene-words/15031", "scene-words/12073", "scene-words/21103", "scene-words/21377", "scene-words/16286"],
 IMG_H: ["scene-words/18425", "scene-words/16239", "scene-words/12711", "scene-words/15268", "scene-words/17188", "scene-words/15031", "scene-words/12924", "scene-words/21103", "scene-words/19357", "scene-words/21341"],
 PICS: {
  opener: "scene-words/16038",
  talk: "scene-words/20023",
  group: "scene-words/16776",
  speech: "scene-words/16400",
  reporter: "scene-words/13053",
  survey: "scene-words/18249",
  pron: "scene-words/12095",
  roleB: "scene-words/16020",
  cover: "scene-words/18425",
  back: "scene-words/17153"
 },
 gram1: {
  can: "use irregular past forms",
  title: "Irregular",
  em: "Verbs",
  rules: [
   ["Regular → -ed", "I <b>prayed</b>. I <b>believed</b> it."],
   ["Irregular → new word", "go → <b>went</b> → <b>gone</b>"],
   ["Some don't change", "put → <b>put</b> → <b>put</b>"]
  ],
  hardNote: "begin–began–begun · think–thought–thought · become–became–become",
  say: [
   "Irregular verbs do not add -ed in the past. We must learn them.",
   "I prayed. I believed it.",
   "go, went, gone.",
   "put, put, put."
  ]
 },
 gram2: {
  can: "ask \"Did you…?\" and \"Have you ever…?\"",
  cols: ["Simple past", "Have + past participle"],
  rows: [
   ["+", "I <b>went</b> to a temple.", "I have <b>seen</b> a double rainbow."],
   ["−", "I <b>didn't go</b> to church.", "I haven't <b>thought</b> about it."],
   ["?", "<b>Did</b> you <b>go</b> there?", "Have you ever <b>felt</b> lucky?"]
  ]
 },
 gapCan: "ask \"What did he do?\"",
 role: {
  title: "The",
  em: "100-Year-Old",
  tail: "Guest",
  opener: "Welcome to the show! What's the secret of a happy life?",
  a: "Talk show host",
  b: "100-year-old guest"
 },
 pron: {
  can: "say irregular past forms",
  title: "Sounds of the",
  em: "Irregular Past",
  game: "Teacher says a verb → you say the past form → make a sentence: <i>\"I thought about my future.\"</i>"
 },
 E: {
  steps: ["Answer", "Why", "More"],
  model: [
   ["I think life is all about love.", "Family and friends make me happy.", "I want to help others, too."],
   ["My life is a rainbow.", "It has many colors.", "Some days are bright!"],
   ["I'm not sure about eternity.", "It is hard to imagine.", "People believe different things."],
   ["Yes, I have.", "I prayed for my grandma.", "She was sick last year."],
   ["I think it's good.", "It makes people feel calm.", "We should respect every belief."],
   ["I don't know.", "Some people believe in heaven.", "I think we live in memories."],
   ["We are here to learn and grow.", "Every day we learn something.", "We also help each other."],
   ["I would travel the whole world.", "I'd have lots of time.", "I would learn ten languages!"],
   ["I think it can help people.", "It gives them hope.", "But good friends help, too."],
   ["I believe in evolution.", "I learned it in science class.", "Dinosaurs lived long ago."]
  ],
  frame: [
   "I think life is all about ___.",
   "My life is ___. It is ___.",
   "I think eternity is ___.",
   "Yes, I have. I prayed for ___.",
   "I think it's ___.",
   "I think after death, ___.",
   "We are here to ___.",
   "I would ___.",
   "I think religion can / can't ___.",
   "I believe in ___ because ___."
  ],
  bank: [
   ["love", "family", "friends", "dreams"],
   ["a rainbow", "a cloud", "the sun", "colorful"],
   ["strange", "hard to imagine", "big", "scary"],
   ["my family", "my grandma", "a test", "my friend"],
   ["good", "peaceful", "important", "special"],
   ["heaven", "memories", "rest", "I'm not sure"],
   ["learn", "love", "help", "be happy"],
   ["travel", "read books", "learn", "meet people"],
   ["help", "give hope", "save", "comfort"],
   ["evolution", "creation", "science", "my family"]
  ],
  more: [
   ["What makes you happy?", "Who is important to you?"],
   ["Why did you choose it?", "What is your family's symbol?"],
   ["Do you think about big questions?", "Who do you talk to about them?"],
   ["What do you wish for?", "Where do you feel calm?"],
   ["Have you ever visited a temple?", "What did you see?"],
   ["Is it scary to think about?", "How do you remember people?"],
   ["What is your dream?", "What did you learn today?"],
   ["Would you like to live forever?", "What would be bad about it?"],
   ["What helps you when you're sad?", "Who gives you hope?"],
   ["What did you learn in science?", "Do you like dinosaurs?"]
  ],
  gram1: {
   chain: ["Yesterday, I ___ (go / eat / see).", "Last year, I ___ (begin / win / make)."],
   ex: "T: Yesterday, I went to the park.<br>S: Yesterday, I ate pizza.<br>T: I …"
  },
  gram2: {
   a: {
    title: "Ask 4 times",
    items: ["Have you ever seen a rainbow?", "Have you ever made a wish?", "Have you ever won a prize?", "Have you ever kept a diary?"],
    ans: "Yes, I have. / No, I haven't. <b>+ one more sentence</b>"
   },
   b: {
    title: "My best day",
    big: "My best day was ___. I went to ___ and I felt ___.",
    ans: "Then ask: <b>What did you do on your best day?</b>"
   }
  },
  opener: {
   think: ["Look at the photo. How does it make you feel?", "What is most important in your life?", "What makes a good life?"]
  },
  convo: [
   ["A", "Grandpa, what makes a happy life?"],
   ["B", "Hmm. I think it's {family}."],
   ["A", "Really? Not money?"],
   ["B", "No. I had little money, but I was happy."],
   ["A", "What was your happiest day?"],
   ["B", "The day I {met your grandma}!"],
   ["A", "Aww! For me, it's {my birthday}."]
  ],
  swap: [["something important", "family"], ["a happy moment", "met your grandma"], ["your happy day", "my birthday"], ["who you ask", "Grandpa"]],
  lang: [
   ["Give an opinion", ["I think …", "For me, …"]],
   ["Show respect", ["That's interesting.", "I see."]],
   ["Not sure", ["I'm not sure.", "Maybe …"]]
  ],
  langPractice: ["Life is about money.", "I went to a temple.", "I believe in heaven.", "I want to live forever.", "My life is a cloud.", "Friends are everything."],
  survey: {
   ask: "Have you ever",
   cols: ["Me", "My teacher"],
   rows: ["seen a double rainbow", "made a wish on a star", "written a letter to yourself", "felt very lucky", "visited a temple", "thought about your future job"],
   q: "Have you ever …?  → Yes, I have. / No, I haven't.",
   report: "I have ___, but my teacher hasn't ___."
  },
  gap: {
   who: "Grandpa Kim (age 90)",
   q: ["Where did he grow up?", "What job did he have?", "What was his happiest day?", "What advice did he give?"],
   A: [["grew up in", "a small farm town"], ["job", "?"], ["happiest day", "his wedding day"], ["advice", "?"]],
   B: [["grew up in", "?"], ["job", "a teacher"], ["happiest day", "?"], ["advice", "Be kind every day"]],
   tip: "grow → <b>grew</b> · have → <b>had</b> · give → <b>gave</b>"
  },
  role: {
   A: ["You are a talk show host.", "Ask 5 questions.", "Use \"What did you …?\""],
   B: ["You are 100 years old.", "Choose: farmer / doctor / singer.", "Answer with past forms."]
  },
  tts: {
   title: "Make a \"Happy life\" recipe",
   steps: ["Think of 5 things for a happy life.", "Ask your teacher for theirs.", "Choose the best 3 together.", "Present your recipe!"],
   lang: ["You need ___.", "Add a little ___.", "Don't forget ___!"]
  },
  speech: {
   time: "1 min",
   model: ["Hello! Let me tell you what life means to me.", "For me, life is all about family.", "Last year, my grandma got sick.", "We sat with her and I held her hand.", "She got better, and I felt thankful.", "Thank you!"],
   outline: ["Hello", "Life is about …", "One story (past)", "How you felt", "Thank you!"],
   check: ["Loud voice", "Look at your teacher", "Use 3 past forms"]
  },
  pron: {
   cols: [["-ought", ["thought", "bought", "brought"]], ["/æ/", ["began", "sang", "ran"]], ["/oʊ/", ["woke", "wrote", "rode"]]],
   up: "Have you ever prayed?",
   down: "What makes you happy?"
  },
  review: ["I can talk about life.", "I can use irregular past verbs.", "I can ask \"Have you ever …?\"", "I can respect other beliefs."]
 },
 H: {
  steps: ["Answer", "Reason", "Example", "Ask back"],
  model: [
   ["I think life is all about relationships.", "Success means little without people to share it with.", "My best memories are all with my family and friends.", "What do you think life is about?"],
   ["I'd choose a rainbow after the rain.", "My life has had hard times, but they led to good things.", "Failing an exam taught me how to study properly.", "What symbol would you choose?"],
   ["Honestly, eternity is hard for me to imagine.", "Our minds only understand things that end.", "I've read many views, but none fully convinced me.", "Do you think about these questions often?"],
   ["Yes, I have, especially in difficult times.", "Praying calms me down, even if I'm not sure.", "I prayed before my grandfather's surgery.", "Have you ever prayed for someone?"],
   ["I think it's a personal choice we should respect.", "Places of worship give people peace and community.", "My aunt's temple helps poor families every week.", "Do people in your country go to church?"],
   ["I believe we live on in the people we love.", "Our stories and values are passed down.", "My grandmother's recipes are still made today.", "What do you believe happens after death?"],
   ["I think we're here to make the world a bit better.", "Life feels meaningful when we help others.", "Volunteering at a shelter gave me a real purpose.", "Why do you think we're here?"],
   ["If I could live forever, I'd learn everything I could.", "Time is the only thing we never have enough of.", "I'd master every instrument and every language.", "Would you want to live forever?"],
   ["I think religion can save people, in some ways.", "It gives hope and a community in hard times.", "A friend found real support at church after a loss.", "What gives you strength in hard times?"],
   ["I believe in evolution, though I respect other views.", "The fossil record shows how life slowly changed.", "I saw whale fossils with tiny leg bones in a museum.", "Can science and religion live together?"]
  ],
  frame: [
   "I think life is all about … because …",
   "I'd choose … because my life …",
   "In my opinion, eternity … For example, …",
   "Yes, I have. / No, I haven't. …",
   "I think it's … because …",
   "I believe that after death … because …",
   "I think we're here to … For example, …",
   "If I could live forever, I'd …",
   "I think religion can / can't … because …",
   "I believe in … because …"
  ],
  more: [
   ["Does the meaning of life change with age?", "Is happiness a goal or a result?", "What would a perfect life look like?"],
   ["What symbol would your parents choose?", "Is your life more sunny or cloudy now?", "How do hard times shape us?"],
   ["Is it important to believe in something?", "Why do people think about eternity?", "Would eternity be a gift or a curse?"],
   ["Why do people pray?", "Is praying like meditation?", "Can words change what happens?"],
   ["Why do fewer young people go to worship?", "What role does religion play today?", "Should schools teach about religions?"],
   ["Why are people afraid of death?", "How do cultures remember the dead?", "Would you want to know when you'll die?"],
   ["Do we create our own purpose?", "Is it selfish to live only for yourself?", "What legacy would you like to leave?"],
   ["What would you get bored of?", "Would love mean more or less forever?", "Should science try to stop aging?"],
   ["Can people be good without religion?", "Has religion done more good or harm?", "What 'saves' people besides religion?"],
   ["Why do some people doubt evolution?", "Should schools teach both views?", "Where do you think humans are evolving?"]
  ],
  gram1: {
   chain: ["The best thing I ever did was ___.", "I have never ___, but I'd like to."],
   ex: "T: The best thing I ever did was quit my job to travel.<br>S: The best thing I ever did was …"
  },
  gram2: {
   a: {
    title: "Ask 4 times",
    items: ["Have you ever felt truly at peace?", "Have you ever changed a belief?", "Have you ever found a new purpose?", "Have you ever made a big decision?"],
    ans: "Yes, I have. / No, I haven't. <b>+ When? What happened?</b>"
   },
   b: {
    title: "A turning point",
    big: "When I was ___, I ___ and I realized that ___.",
    ans: "Then ask: <b>What was a turning point for you?</b>"
   }
  },
  opener: {
   think: ["What gives your life meaning right now?", "Do the big life questions matter, or should we just enjoy life?", "Would you rather have a happy life or a meaningful one?"]
  },
  convo: [
   ["A", "Can I ask you a deep question?"],
   ["B", "Sure, go ahead."],
   ["A", "What do you think life is really about?"],
   ["B", "For me, it's {helping others}. That's what I've found."],
   ["A", "Interesting. When did you realize that?"],
   ["B", "When I {volunteered abroad}. It changed me."],
   ["A", "I see. I used to think it was {success}."],
   ["B", "And now?"],
   ["A", "Now I'm not so sure. Maybe it's both."]
  ],
  swap: [["what life is about", "helping others"], ["a life-changing event", "volunteered abroad"], ["an old belief", "success"], ["a new belief", "both"]],
  lang: [
   ["Share a belief", ["Personally, I believe …", "The way I see it, …"]],
   ["Show respect", ["I respect that.", "That's a fair view."]],
   ["Disagree gently", ["I see it differently.", "I'm not sure I agree."]],
   ["Reflect", ["I used to think …", "Now I realize …"]]
  ],
  langPractice: ["Money brings happiness.", "Everything happens for a reason.", "Religion is outdated.", "Life has no meaning.", "I'd hate to live forever.", "Science will explain everything."],
  survey: {
   ask: "Have you ever",
   cols: ["Me", "My teacher", "One more question"],
   rows: ["changed a big belief", "felt your life had a purpose", "visited a place of worship abroad", "written down your life goals", "had a life-changing moment", "talked about death with family"],
   q: "Have you ever …? → Yes. → Ask: When? / What happened? / How did it change you?",
   report: "We have both ___, but only my teacher has ___."
  },
  gap: {
   who: "Grandpa Kim (age 90)",
   q: ["Where did he grow up?", "What did he do for work?", "What was his biggest challenge?", "What did he learn from it?", "What advice did he give?"],
   A: [["grew up", "a farm near Andong"], ["work", "?"], ["challenge", "lost his shop in a fire"], ["lesson", "?"], ["advice", "?"]],
   B: [["grew up", "?"], ["work", "taught math for 40 years"], ["challenge", "?"], ["lesson", "people matter more than things"], ["advice", "Forgive quickly"]],
   tip: "grew · taught · lost · learned · gave"
  },
  role: {
   A: ["You host a talk show.", "Ask 5 questions + 2 follow-ups.", "Find the guest's \"secret of life\"."],
   B: ["You are 100 years old.", "Choose: war survivor / famous chef / monk.", "Tell 2 stories with past forms."]
  },
  tts: {
   title: "Write \"5 rules for a meaningful life\"",
   steps: ["List 8 rules you believe in.", "Ask your teacher for theirs.", "Agree on the best 5 together.", "Present them with reasons."],
   lang: ["Rule one should be ___ because ___.", "I'd rather put ___ first.", "OK, we both agree on ___."]
  },
  speech: {
   time: "2 min",
   model: ["What is life all about? I asked myself this last year.", "I had always thought success was everything.", "Then my grandfather became ill.", "I spent weeks with him and heard stories I'd never heard.", "He taught me that people matter more than grades.", "Since then, I've made more time for family.", "Thank you! What gives your life meaning?"],
   outline: ["Hook — a big question", "What you used to think", "A turning point (past)", "What you learned", "How you've changed", "Ask for questions"],
   check: ["Clear voice", "Eye contact", "5 irregular verbs", "Answer 1 question"]
  },
  pron: {
   cols: [["-ought / -aught", ["thought", "brought", "taught"]], ["/ʌ/", ["begun", "won", "done"]], ["/oʊ/", ["chose", "spoke", "broke"]]],
   up: "Have you ever prayed?",
   down: "What did you learn from it?"
  },
  review: ["I can answer in 4 parts.", "I can use irregular past forms.", "I can share and respect beliefs.", "I can tell a life story."]
 }
};
