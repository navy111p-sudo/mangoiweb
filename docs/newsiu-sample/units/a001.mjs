// SIU ADVANCE 001 — Explain (8판 형식, units/001.mjs 본보기)
// 원본과 다른 점:
//  - 원본 문법 = Personal Pronoun(인칭대명사). 뜻·예문을 쉽게 다시 씀. "My cat? He has climbed up the roof!" 류는 it/he 설명으로 정리
//  - Q5 "Action speaks louder than words" → "Actions speak louder than words" (속담 원형)
//  - Q6 "Expaint" → "Explain", Q7 "Explains" → "Explain", Q8 "Money cant" → "Money can't", Q2 "You can't please everybody" 그대로
//  - Q10 "He Who Chases two rabbits catches none" → "He who chases two rabbits catches neither" (none 은 2개에 어색 — 원형 그대로 두고 키워드 none 은 Q6 에서 씀)
//  - 질문을 "Explain: …" 대신 "What does '…' mean?" 모양으로 통일(말하기 질문이 되게)
//  - Keyword None(adv) → pronoun(대명사). Blind(noun) "people who are unable to see" → adjective(형용사) 뜻으로 바로잡음
//  - Keyword Tell 뜻 "communicate information…" → 속담 뜻(드러나다)에 맞게 "to show or make clear" 를 함께 씀
//  - 대답 틀 "You will ended up catches none" · "Love blinded because of" · "Time can be relate to" → 문법에 맞게 새로 씀
//  - 쉬운 판(중고생): "Love is blind" 는 연애 이야기 대신 «좋아하는 사람·가수·친구의 단점이 안 보인다» 로 다룸
export default {
 no: "a001",
 title: "Explain",
 book: "SIU ADVANCE 001 - Explain",
 next: "002 Job Interview",
 cover: { h1: "Explain", em: "the Saying", goals: ["Explain 10 famous English sayings", "Use personal pronouns correctly", "Give reasons and real examples"] },
 KW: [
  ["talk", "verb", "말하다, 힘을 쓰다", "to speak; (saying) to have power or influence"],
  ["everybody", "pronoun", "모든 사람", "all the people in a group or in the world"],
  ["blind", "adjective", "눈먼, 못 보는", "not able to see; not able to notice problems"],
  ["tell", "verb", "말하다, 드러나다", "to give information; to show or make clear"],
  ["action", "noun", "행동", "something you do to reach a goal"],
  ["none", "pronoun", "아무것도(아무도) ~않다", "not one; not any"],
  ["bed", "noun", "침대", "a piece of furniture you sleep on"],
  ["money", "noun", "돈", "coins and paper you use to buy things"],
  ["time", "noun", "시간", "minutes, hours and days as they pass"],
  ["chase", "verb", "뒤쫓다", "to run after someone or something to catch it"]
 ],
 QS: [
  "What does \"Money talks\" mean?",
  "What does \"You can't please everybody\" mean?",
  "What does \"Love is blind\" mean?",
  "What does \"Time will tell\" mean?",
  "What does \"Actions speak louder than words\" mean?",
  "What does \"It's none of your business\" mean?",
  "What does \"Life is not a bed of roses\" mean?",
  "Can money buy happiness?",
  "What does \"Time is money\" mean?",
  "What does \"He who chases two rabbits catches neither\" mean?"
 ],
 IMG_E: ["scene-words/12308", "scene-words/12284", "scene-words/12953", "scene-words/18635", "scene-words/19278", "scene-words/18675", "scene-words/16560", "scene-words/12338", "scene-words/16382", "scene-clips/7282"],
 IMG_H: ["scene-words/18797", "scene-words/18514", "scene-clips/7054", "scene-words/12580", "scene-words/19278", "scene-words/18945", "scene-words/15033", "scene-words/18636", "scene-words/15395", "scene-words/16321"],
 PICS: {
  opener: "scene-words/16096",
  talk: "scene-clips/7477",
  group: "scene-words/20023",
  speech: "scene-words/14020",
  reporter: "scene-words/13053",
  survey: "scene-words/21042",
  pron: "scene-words/16172",
  roleB: "scene-words/12095",
  cover: "scene-words/20023",
  back: "scene-words/12026"
 },
 gram1: {
  can: "use I · me · he · him correctly",
  title: "Personal",
  em: "Pronouns",
  rules: [
   ["Before the verb", "<b>I</b> like her. <b>She</b> likes me."],
   ["After the verb", "Call <b>me</b>. I'll help <b>them</b>."]
  ],
  hardNote: "I/me · he/him · she/her · we/us · they/them",
  say: [
   "A personal pronoun takes the place of a person, an animal or a thing.",
   "I like her. She likes me.",
   "Call me. I'll help them."
  ]
 },
 gram2: {
  can: "choose he or him, they or them",
  cols: ["Subject (before the verb)", "Object (after the verb)"],
  rows: [
   ["+", "<b>He</b> explained the saying.", "The teacher asked <b>him</b>."],
   ["−", "<b>They</b> don't believe it.", "Don't tell <b>them</b>."],
   ["?", "Does <b>she</b> agree?", "Did you ask <b>her</b>?"]
  ]
 },
 gapCan: "ask \"What does she think…?\"",
 role: {
  title: "Ask",
  em: "Grandpa",
  tail: "",
  opener: "Grandpa, what does \"Time is money\" mean?",
  a: "Grandparent",
  b: "Grandchild"
 },
 pron: {
  can: "say weak pronouns naturally",
  title: "Weak",
  em: "pronouns",
  game: "Teacher says a saying → you say it fast with weak pronouns: <i>\"Tell 'im. Ask 'er. Don't tell 'em.\"</i>"
 },
 E: {
  steps: ["Answer", "More"],
  model: [
   ["It means money has power.", "People with money often get what they want."],
   ["It means you can't make everyone happy.", "Some people will always disagree."],
   ["It means you can't see the bad points of someone you like.", "My friend thinks her favorite singer is perfect."],
   ["It means we will know the answer later.", "We have to wait and see."],
   ["It means what you do is more important than what you say.", "Don't just say sorry. Show it."],
   ["It means \"This is not about you.\"", "It can sound rude, so be careful."],
   ["It means life is not always easy.", "We all have hard days, like exam week."],
   ["No, I don't think so.", "Friends and family make me happy, not money."],
   ["It means time is valuable.", "Don't waste it, like money."],
   ["It means you can't do two things at once well.", "If you try, you may get nothing."]
  ],
  frame: [
   "It means ___. People with money ___.",
   "It means you can't ___. Some people ___.",
   "It means you can't see ___.",
   "It means we will know ___. We have to ___.",
   "It means what you ___ is more important than what you ___.",
   "It means ___. It can sound ___.",
   "It means life is not always ___. For example, ___.",
   "Yes / No, I think ___ makes me happy.",
   "It means time is ___. Don't ___.",
   "It means you should focus on ___ thing."
  ],
  bank: [
   ["has power", "is strong", "get more", "are listened to"],
   ["make everyone happy", "please everyone", "disagree", "complain"],
   ["bad points", "mistakes", "problems", "faults"],
   ["the answer later", "the result", "wait and see", "be patient"],
   ["do", "say", "show", "promise"],
   ["not about you", "private", "rude", "strong"],
   ["easy", "fun", "exam week", "moving schools"],
   ["friends", "family", "health", "money"],
   ["valuable", "important", "waste it", "be late"],
   ["one", "a single", "the most important", "your main"]
  ],
  more: [
   ["Is money power? Why?", "Who has power in your school?"],
   ["Do you try to please everyone?", "Is it tiring?"],
   ["Who is your favorite singer?", "Do they have any bad points?"],
   ["What are you waiting to find out?", "Are you patient?"],
   ["Who shows kindness with actions?", "What did they do?"],
   ["When do people say this?", "Is it rude?"],
   ["What was a hard day for you?", "How did you feel better?"],
   ["What makes you happy?", "What would you buy with $100?"],
   ["How do you waste time?", "How can you save time?"],
   ["Do you do two things at once?", "What is your one main goal?"]
  ],
  gram1: {
   chain: ["My friend is ___. I like him/her because ___.", "My parents help me. I thank them by ___."],
   ex: "T: My friend is funny. I like him because he makes jokes.<br>S: My friend is kind. I like her because …<br>T: …"
  },
  gram2: {
   a: {
    title: "He or him? She or her?",
    items: ["___ explained it to me.", "I asked ___ a question.", "___ are my classmates.", "Please call ___ later.", "Did ___ agree with you?"],
    ans: "Say it with a pronoun. <b>+ who is it?</b>"
   },
   b: {
    title: "Your best friend",
    big: "My friend's name is ___. He/She is ___. I often help him/her with ___.",
    ans: "Then ask: <b>What do you like about him/her?</b>"
   }
  },
  opener: {
   think: ["Look at the photo. What is the teacher doing?", "Do you know any sayings in Korean?", "Which saying do you like? Why?"]
  },
  convo: [
   ["A", "What's wrong? You look upset."],
   ["B", "I promised to help Jun, but I {forgot}."],
   ["A", "Did you say sorry to him?"],
   ["B", "Yes, but he's still angry with me."],
   ["A", "Actions speak louder than words!"],
   ["A", "{Help him with his homework} today."],
   ["B", "OK! I'll {bring him a snack}, too!"]
  ],
  swap: [["what went wrong", "forgot"], ["a good action", "help him…"], ["one more action", "bring him a snack"], ["the friend's name", "Jun"]],
  lang: [
   ["Explain", ["It means …", "In other words, …"]],
   ["Give an example", ["For example, …", "Like when …"]],
   ["Check", ["What do you mean?", "Do you mean …?"]]
  ],
  langPractice: ["Money talks.", "Time will tell.", "Love is blind.", "Time is money.", "Life is not a bed of roses.", "Actions speak louder than words."],
  survey: {
   ask: "Do you agree:",
   cols: ["Me", "My teacher"],
   rows: ["Money talks", "Time is money", "You can't please everybody", "Actions speak louder than words", "Money can't buy happiness", "Life is not a bed of roses"],
   q: "Do you agree …? → Yes, I agree. / No, I don't.",
   report: "I agree that ___, but my teacher ___."
  },
  gap: {
   who: "Mina's favorite saying",
   q: ["What is her favorite saying?", "What does it mean?", "Who told her?", "When does she use it?"],
   A: [["saying", "Time is money"], ["meaning", "?"], ["who told her", "her grandma"], ["uses it", "?"]],
   B: [["saying", "?"], ["meaning", "don't waste time"], ["who told her", "?"], ["uses it", "when her brother plays games"]],
   tip: "<b>She</b> uses it · Her grandma told <b>her</b>"
  },
  role: {
   A: ["You are a grandparent.", "Explain 2 sayings.", "Give one example from your life."],
   B: ["You are a grandchild.", "Ask about 2 sayings.", "Say if you agree. Use he/him, she/her."]
  },
  tts: {
   title: "Make a \"Saying of the week\" poster",
   steps: ["Pick one saying.", "Ask your teacher what it means.", "Find an example together.", "Draw it and explain!"],
   lang: ["Our saying is ___.", "It means ___.", "For example, ___."]
  },
  speech: {
   time: "1 min",
   model: ["Hello! My favorite saying is \"Time is money.\"", "It means time is valuable.", "My grandma told me this saying.", "I sometimes waste time on my phone.", "Now I study first and play later.", "Thank you!"],
   outline: ["Hello + your saying", "What it means", "Who told you", "Your example", "Thank you!"],
   check: ["Clear voice", "Look at your teacher", "Give one example"]
  },
  pron: {
   cols: [["him → 'im", ["tell him", "ask him", "help him"]], ["her → 'er", ["tell her", "ask her", "help her"]], ["them → 'em", ["tell them", "ask them", "help them"]]],
   up: "Did you tell him?",
   down: "What does it mean?"
  },
  review: ["I can explain a saying.", "I can use he/him, she/her.", "I can give an example.", "I can say one more sentence."]
 },
 H: {
  steps: ["Answer", "Reason", "Example", "Ask back"],
  model: [
   ["It means money gives people power and influence.", "Rich people can often buy access that others can't.", "Big companies spend a lot on lobbying to shape new laws.", "Do you think that's fair?"],
   ["It means you'll never make every single person happy.", "People have different tastes and needs.", "When I planned a class trip, half the class complained.", "How do you deal with criticism?"],
   ["It means love stops us from seeing someone's faults.", "Our feelings are stronger than our judgment.", "My cousin ignored every warning about her boyfriend.", "Have you ever been \"blind\" about someone?"],
   ["It means only the future will show the truth.", "Sometimes we can't know the answer yet.", "Nobody knew if my brother's startup would work. Time told.", "What are you waiting to find out?"],
   ["It means what you do shows who you really are.", "Anyone can make promises, but few keep them.", "My boss never praises us, but he always stays late to help.", "Do you trust words or actions more?"],
   ["It means \"Stay out of it — this doesn't concern you.\"", "It protects privacy, but it can sound rude.", "My aunt says it when relatives ask about her salary.", "What topics are too private to ask about?"],
   ["It means life isn't always easy or comfortable.", "Everyone faces problems and pressure.", "My first year at work was full of long nights and mistakes.", "What was a tough time in your life?"],
   ["I think money can buy comfort, but not real happiness.", "Relationships and purpose matter more.", "Studies show happiness stops rising above a certain income.", "Would you take a job you hate for double the pay?"],
   ["It means time is as valuable as money.", "You can earn money again, but not time.", "Freelancers charge by the hour, so wasted time is lost money.", "How do you use your free time?"],
   ["It means if you chase two goals, you may lose both.", "Focus is the key to success.", "I tried to learn Japanese and Spanish at once and gave up on both.", "Do you prefer to multitask or focus?"]
  ],
  frame: [
   "It means … because … For example, …",
   "It means you can't … because people …",
   "It means … Our feelings … Once, …",
   "It means … We can't know … yet.",
   "It means … I trust … more because …",
   "It means … It can sound … when …",
   "It means … Everyone … For me, …",
   "I think money can / can't … because …",
   "It means … You can … but …",
   "It means … I learned this when …"
  ],
  more: [
   ["Should money be kept out of politics?", "Does money talk louder in some countries?", "If you were rich, would you use your power?"],
   ["Is it good to be a people-pleaser?", "Should leaders try to please everyone?", "When is it okay to disappoint people?"],
   ["Is love blind, or just a little short-sighted?", "Do friends see our partners more clearly?", "Can you choose who you love?"],
   ["What question will only time answer for you?", "Are you patient or impatient?", "What will we know in 20 years that we don't now?"],
   ["Which leader acts more than they speak?", "Are words ever more important than actions?", "Would you forgive a friend who only says sorry?"],
   ["Is it rude to ask someone's age or salary?", "How is privacy different in Korea and the West?", "Should parents read their teens' messages?"],
   ["Does hardship make people stronger?", "Is life harder now than for our parents?", "If life were easy, would it be boring?"],
   ["What is something money can't buy?", "Are rich people happier?", "Would you trade 10 years of life for a billion won?"],
   ["What is your biggest time-waster?", "Is being busy the same as being productive?", "Would you pay money to get more time?"],
   ["Is multitasking a myth?", "Which two goals are you chasing now?", "If you had to drop one goal, which one?"]
  ],
  gram1: {
   chain: ["I trust my friend. I trust him/her because ___.", "My parents help me. I thank them by ___."],
   ex: "T: I trust her because she never lies.<br>S: I trust him because …<br>T: …"
  },
  gram2: {
   a: {
    title: "Subject or object?",
    items: ["___ told me this saying.", "Nobody could please ___.", "___ were blind to the problem.", "I'll explain it to ___.", "Did ___ keep the promise?"],
    ans: "Say it with a pronoun. <b>+ one more sentence</b>"
   },
   b: {
    title: "Someone you admire",
    big: "I admire ___. He/She taught me ___. When I met him/her, ___.",
    ans: "Then ask: <b>Who taught you an important lesson?</b>"
   }
  },
  opener: {
   think: ["Why do people use sayings instead of plain words?", "Which Korean saying is hard to translate?", "Are old sayings still true today?"]
  },
  convo: [
   ["A", "You look annoyed. What happened?"],
   ["B", "My coworker keeps promising to {send the report}, but he never does."],
   ["A", "Sounds like actions speak louder than words."],
   ["B", "Exactly. I've told him three times."],
   ["A", "Have you talked to {your manager}?"],
   ["B", "Not yet. I don't want to get him in trouble."],
   ["A", "I see, but you can't please everybody."],
   ["B", "True. Maybe I'll {set a deadline} for him."],
   ["A", "Good idea. Time will tell if it works!"]
  ],
  swap: [["a broken promise", "send the report"], ["someone to ask", "your manager"], ["a plan", "set a deadline"], ["a saying", "Time will tell"]],
  lang: [
   ["Explain", ["It means …", "In other words, …", "Basically, …"]],
   ["Give an example", ["For instance, …", "Take my friend, for example."]],
   ["Check meaning", ["What do you mean by …?", "So you're saying …?"]],
   ["Agree / disagree", ["That's so true.", "I see your point, but …"]]
  ],
  langPractice: ["Money can buy happiness.", "Love is blind.", "Hard work always pays off.", "Time is money.", "You should please everybody.", "Words matter more than actions."],
  survey: {
   ask: "Do you agree:",
   cols: ["Me", "My teacher", "One more question"],
   rows: ["Money talks", "Time is money", "Love is blind", "Actions speak louder than words", "Money can't buy happiness", "You can't please everybody"],
   q: "Do you agree …? → Why? / Can you give an example?",
   report: "My teacher and I both agree that ___, but only I think ___."
  },
  gap: {
   who: "Mr. Park's life lesson",
   q: ["What saying does he live by?", "Who taught it to him?", "What happened to him?", "What did he learn?", "What does he tell his kids?"],
   A: [["saying", "Don't chase two rabbits"], ["taught by", "?"], ["what happened", "ran two shops, both failed"], ["lesson", "?"], ["tells his kids", "?"]],
   B: [["saying", "?"], ["taught by", "his first boss"], ["what happened", "?"], ["lesson", "focus on one thing"], ["tells his kids", "pick one dream first"]],
   tip: "Who taught <b>him</b>? · <b>He</b> learned …"
  },
  role: {
   A: ["You are a grandparent with life experience.", "Explain 3 sayings with real stories.", "Ask what the young person thinks."],
   B: ["You are a young adult with a problem.", "Choose: money / a friend / a big decision.", "Ask which saying fits. Agree or disagree."]
  },
  tts: {
   title: "Create a new saying for today",
   steps: ["Think: what lesson do people need now?", "Ask your teacher 4 of today's questions.", "Write a short new saying together.", "Present it and explain it in 1 minute."],
   lang: ["Our saying is ___. It means ___.", "We made it because ___.", "For example, ___."]
  },
  speech: {
   time: "2 min",
   model: ["Hi everyone. Today I'll explain a saying I live by.", "It's \"Actions speak louder than words.\"", "It means what you do shows who you are.", "My grandfather rarely said \"I love you.\"", "But he drove me to school every day for six years.", "His actions told me everything.", "Now I try to show people I care, not just say it.", "Thanks for listening! Any questions?"],
   outline: ["Hook — \"a saying I live by\"", "The saying", "What it means", "A true story", "What you learned", "Ask for questions"],
   check: ["Clear voice", "Eye contact", "Correct pronouns", "Answer 1 question"]
  },
  pron: {
   cols: [["him → 'im", ["ask him", "told him", "trust him"]], ["her → 'er", ["ask her", "told her", "trust her"]], ["them → 'em", ["ask them", "told them", "please them"]]],
   up: "Do you trust him?",
   down: "Why did you tell them?"
  },
  review: ["I can answer in 4 parts.", "I can explain a saying with a story.", "I can use subject and object pronouns.", "I can give a short presentation."]
 }
};
