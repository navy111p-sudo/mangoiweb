// SIU ADVANCE 003 — Make Your Point (8판 형식, units/001.mjs 본보기)
// 원본과 다른 점:
//  - 원본 문법 = Relative Pronoun(관계대명사). 예문 "The moment which is lost, is lost forever." → 쉼표 빼고 쉬운 예문으로 다시 씀
//  - 원본 PDF 에 Q2 쪽이 빠져 있고 Q10 쪽이 두 번 들어 있음 → 낱말 퍼즐의 남은 낱말 Slim 으로 Q2 를 새로 만듦("Why do so many people want to be slim?")
//  - Q1 "Why as the communciation technology advances, people talk less" → "Why do people talk less as communication technology advances?"
//  - Q3 "Why is the more money we earn the more we spend?" → "Why do we spend more when we earn more?"
//  - Q4 "Why men often cheat in a relationship" → "Why do some people cheat?" (쉬운 판은 시험·게임, 어려운 판은 관계까지 다룸)
//  - Q5 "Why you should not judge a person by the person's appearance" → "Why shouldn't we judge people by their appearance?"
//  - Q6 "Why difficult experiences…" → "Why do difficult experiences make people stronger?"
//  - Q7 "have a jobs" → "have jobs", Q8 "Why is face to face communication is better…" → "Why is face-to-face communication better…"
//  - Q9 "Why women should be given an equal work opportunity as men?" → "Why should women get equal work opportunities?"
//  - Q10 "Is everything you learned is found in the book?" → "Did you learn everything from books?"
//  - Keyword Less(adv) 품사 → adverb, More(adj) 는 "more money" 쓰임이라 그대로 adjective
//  - 쉬운 판(중고생): Q2 는 «몸매» 대신 «건강», Q4 는 «연애» 대신 «시험·게임에서의 부정행위» 로만 다룸
export default {
 no: "a003",
 title: "Make Your Point",
 book: "SIU ADVANCE 003 - Make your point",
 next: "004 Environment",
 cover: { h1: "Make", em: "Your Point", goals: ["Give clear opinions with reasons", "Answer 10 \"Why…?\" questions", "Use who, which and that"] },
 KW: [
  ["less", "adverb", "덜, 더 적게", "not as much"],
  ["slim", "adjective", "날씬한", "thin in a healthy and attractive way"],
  ["more", "adjective", "더 많은", "a bigger amount of something"],
  ["cheat", "verb", "속이다, 부정행위를 하다", "to break the rules to get something unfairly"],
  ["judge", "verb", "판단하다", "to form an opinion about someone or something"],
  ["strong", "adjective", "강한", "able to deal with hard situations"],
  ["still", "adverb", "아직, 여전히", "even now; up to this time"],
  ["communication", "noun", "의사소통", "sharing information, ideas or feelings"],
  ["equal", "adjective", "평등한, 같은", "the same in amount, value or rights"],
  ["everything", "pronoun", "모든 것", "all things"]
 ],
 QS: [
  "Why do people talk less as communication technology advances?",
  "Why do so many people want to be slim?",
  "Why do we spend more when we earn more?",
  "Why do some people cheat?",
  "Why shouldn't we judge people by their appearance?",
  "Why do difficult experiences make people stronger?",
  "Is it okay for teenagers to have jobs while they are still students?",
  "Why is face-to-face communication better than other types?",
  "Why should women get equal work opportunities?",
  "Did you learn everything from books?"
 ],
 IMG_E: ["scene-words/15768", "scene-words/18588", "scene-words/12506", "scene-words/18551", "scene-words/15207", "scene-words/14455", "scene-words/18134", "scene-words/18146", "scene-words/19818", "scene-words/12401"],
 IMG_H: ["scene-words/19453", "scene-words/12199", "scene-words/13289", "scene-words/17164", "scene-words/12618", "scene-words/14886", "scene-clips/7039", "scene-words/12308", "scene-words/17372", "scene-words/14749"],
 PICS: {
  opener: "scene-words/18339",
  talk: "scene-clips/7460",
  group: "scene-words/17285",
  speech: "scene-words/16688",
  reporter: "scene-words/13053",
  survey: "scene-words/13329",
  pron: "scene-words/16172",
  roleB: "scene-words/19705",
  cover: "scene-words/17285",
  back: "scene-words/18146"
 },
 gram1: {
  can: "join ideas with who, which and that",
  title: "Relative",
  em: "Pronouns",
  rules: [
   ["People → who", "I have a friend <b>who</b> never cheats."],
   ["Things → which / that", "It's a phone <b>that</b> never stops ringing."]
  ],
  hardNote: "who (people) · which (things) · that (both) · whose (belongs to)",
  say: [
   "A relative pronoun joins two ideas and tells us more about a noun.",
   "I have a friend who never cheats.",
   "It's a phone that never stops ringing."
  ]
 },
 gram2: {
  can: "describe people and things with who / that",
  cols: ["People — who / that", "Things — which / that"],
  rows: [
   ["+", "I like people <b>who</b> are honest.", "I like books <b>that</b> are fun."],
   ["−", "I don't trust people <b>who</b> cheat.", "I don't buy things <b>which</b> are useless."],
   ["?", "Is there anyone <b>who</b> agrees?", "Is there a rule <b>that</b> is unfair?"]
  ]
 },
 gapCan: "ask \"Who is the person that…?\"",
 role: {
  title: "The",
  em: "Debate",
  tail: "Club",
  opener: "Today's topic: \"Should students have part-time jobs?\" Who wants to start?",
  a: "Debate host",
  b: "Speaker"
 },
 pron: {
  can: "say th sounds clearly",
  title: "The two",
  em: "th sounds",
  game: "Teacher says a th word → you say it with your tongue out, then use it: <i>\"I think that everything is possible.\"</i>"
 },
 E: {
  steps: ["Answer", "More"],
  model: [
   ["People talk less because they text a lot.", "My sister texts me from her room!"],
   ["Many people want to be slim because they see slim stars on TV.", "But being healthy is more important."],
   ["When we earn more, we want more things.", "My brother bought a new phone with his first pay."],
   ["Some people cheat because they want good grades.", "But cheating isn't fair to others."],
   ["Because looks can fool us.", "A quiet student in my class is really funny."],
   ["Difficult experiences teach us lessons.", "I failed a test, but now I study harder."],
   ["Yes, I think it's okay on weekends.", "Students can learn about money."],
   ["Because you can see the person's face.", "Texts can be misunderstood."],
   ["Because women and men can do the same work.", "It's fair to give everyone a chance."],
   ["No, I didn't. I learned a lot from people.", "My grandma taught me how to cook."]
  ],
  frame: [
   "People talk less because they ___.",
   "Many people want to be slim because ___.",
   "When we earn more, we want ___.",
   "Some people cheat because they want ___.",
   "Because looks can ___. For example, ___.",
   "Difficult experiences teach us ___.",
   "Yes / No, I think ___. Students can ___.",
   "Because you can ___. Texts can ___.",
   "Because women and men can ___.",
   "No, I didn't. I learned a lot from ___."
  ],
  bank: [
   ["text a lot", "use SNS", "play games", "watch videos"],
   ["of TV stars", "of social media", "it looks healthy", "of ads"],
   ["more things", "nicer clothes", "a new phone", "bigger houses"],
   ["good grades", "to win", "to look smart", "an easy way"],
   ["fool us", "be wrong", "change", "hide things"],
   ["lessons", "patience", "to try again", "to be brave"],
   ["learn about money", "get experience", "feel tired", "miss study time"],
   ["see faces", "hear voices", "be misunderstood", "sound cold"],
   ["do the same work", "work hard", "be leaders", "be great scientists"],
   ["my family", "friends", "the internet", "my mistakes"]
  ],
  more: [
   ["How many texts do you send a day?", "Do you call your friends?"],
   ["Is it good to be very thin?", "How do you stay healthy?"],
   ["What would you buy with more money?", "Do you save money?"],
   ["Is cheating in games bad, too?", "What should a teacher do?"],
   ["Did you ever judge someone wrong?", "What happened?"],
   ["What was a hard time for you?", "What did you learn?"],
   ["What job could a student do?", "Would your parents agree?"],
   ["Do you prefer texting or talking?", "Why?"],
   ["Are boys and girls treated the same?", "Is it fair?"],
   ["Who taught you the most?", "What did you learn?"]
  ],
  gram1: {
   chain: ["I like people who ___.", "I like things that ___."],
   ex: "T: I like people who are funny.<br>S: I like people who are kind.<br>T: …"
  },
  gram2: {
   a: {
    title: "Finish 5 times",
    items: ["A good friend is someone who …", "A good teacher is …", "A good phone is one that …", "A good book is …", "A good school is …"],
    ans: "Finish it. <b>+ why?</b>"
   },
   b: {
    title: "Guess who!",
    big: "I'm thinking of a person who ___. He/She is someone that ___.",
    ans: "Then ask: <b>Who is it?</b>"
   }
  },
  opener: {
   think: ["Look at the photo. What are the students doing?", "Do you like to share your opinion?", "What topic do you have a strong opinion on?"]
  },
  convo: [
   ["A", "I think phones are bad for friendships."],
   ["B", "Really? Why do you think so?"],
   ["A", "People who {text all day} don't talk."],
   ["B", "I see your point, but texting is {fast}."],
   ["A", "That's true. But talking is {warmer}."],
   ["B", "OK, you made your point!"]
  ],
  swap: [["a phone habit", "text all day"], ["a good point", "fast"], ["another point", "warmer"], ["the topic", "phones"]],
  lang: [
   ["Give your opinion", ["I think …", "In my opinion, …"]],
   ["Give a reason", ["because …", "The reason is …"]],
   ["Agree / disagree", ["I agree.", "I see your point, but …"]]
  ],
  langPractice: ["Phones are bad for kids.", "Homework is useless.", "Money makes people happy.", "Boys are better at sports.", "School should start later.", "Books are better than videos."],
  survey: {
   ask: "Do you think",
   cols: ["Me", "My teacher"],
   rows: ["phones make people talk less", "students should have jobs", "looks are important", "cheating is ever okay", "talking is better than texting", "books teach us everything"],
   q: "Do you think …?  → Yes, I do. / No, I don't.",
   report: "I think ___, but my teacher thinks ___."
  },
  gap: {
   who: "Yuna, the class debater",
   q: ["What topic did Yuna choose?", "What is her opinion?", "What is her reason?", "Who helped her?"],
   A: [["topic", "part-time jobs"], ["opinion", "?"], ["reason", "students learn about money"], ["helper", "?"]],
   B: [["topic", "?"], ["opinion", "they are okay on weekends"], ["reason", "?"], ["helper", "her friend who works at a café"]],
   tip: "Her friend <b>who</b> works … · a topic <b>that</b> …"
  },
  role: {
   A: ["You are the debate host.", "Ask 3 \"Why…?\" questions.", "Say who made the best point."],
   B: ["You are a speaker.", "Choose: phones / part-time jobs / books.", "Give your opinion and 1 reason."]
  },
  tts: {
   title: "Make a \"Top 3 opinions\" poster",
   steps: ["Pick 3 of today's questions.", "Ask your teacher's opinion.", "Choose the best reason for each.", "Draw it and tell!"],
   lang: ["We think ___ because ___.", "My teacher thinks ___.", "People who ___ should ___."]
  },
  speech: {
   time: "1 min",
   model: ["Hello! Today I want to make my point.", "I think face-to-face talking is better than texting.", "When we talk, we can see faces.", "Texts can be misunderstood.", "So let's put down our phones and talk!", "Thank you!"],
   outline: ["Hello", "Your opinion (I think …)", "Reason 1", "Reason 2", "Ending + thank you"],
   check: ["Clear voice", "Look at your teacher", "Give 2 reasons"]
  },
  pron: {
   cols: [["/θ/ (think)", ["think", "thing", "everything"]], ["/ð/ (that)", ["that", "the", "they"]], ["th ≠ s", ["think / sink", "thank / sank", "thick / sick"]]],
   up: "Do you think that's fair?",
   down: "Why do people cheat?"
  },
  review: ["I can give my opinion.", "I can give a reason.", "I can use who / that.", "I can say one more sentence."]
 },
 H: {
  steps: ["Answer", "Reason", "Example", "Ask back"],
  model: [
   ["People talk less because texting feels easier.", "You can avoid awkward moments.", "My friends make plans in a group chat.", "Do you call people or text them?"],
   ["Many people link being slim with success.", "Ads show one body type again and again.", "Some friends diet before every holiday photo.", "Is the media's ideal healthy?"],
   ["Our standards rise with our income.", "Luxuries start to feel normal.", "After my first raise, I started taking taxis.", "Is it hard for you to save?"],
   ["People cheat when the pressure to win is too big.", "They think the reward is worth the risk.", "Some cheat on exams, some on partners.", "Why do cheaters rarely stop?"],
   ["Appearance hides who people really are.", "First impressions are often wrong.", "My quietest coworker is the funniest one.", "Have you ever misjudged someone?"],
   ["Hard times build resilience.", "We learn we can survive them.", "After failing an interview, I prepared better.", "What experience changed you most?"],
   ["It's okay if the job doesn't hurt their studies.", "Work teaches responsibility.", "My cousin works weekends and is more independent.", "Should working hours be limited?"],
   ["Because we can see body language.", "Tone and faces carry most meaning.", "A text saying \"Fine.\" can sound angry.", "Which do you prefer for serious talks?"],
   ["Because talent has no gender.", "Fair workplaces are more productive.", "Diverse leaders often decide better.", "Is your country close to equality?"],
   ["No. Books taught me facts, people taught me life.", "Real skills come from practice.", "I learned to negotiate at a part-time job.", "What did you learn outside school?"]
  ],
  frame: [
   "I think people talk less because … For example, …",
   "Many people want to be slim because … I think …",
   "We spend more because … When I …",
   "People cheat when … For example, …",
   "We shouldn't judge by … because … Once, …",
   "Hard experiences … because … After I …",
   "I think it's okay / not okay because …",
   "Face-to-face talk is better because …",
   "Women should … because … For example, …",
   "No, I didn't. I learned … from … when …"
  ],
  more: [
   ["Is technology making us lonelier?", "Should phones be banned at dinner?", "Will people still talk in 50 years?"],
   ["Should ads use more realistic models?", "Is it okay to judge a diet by numbers?", "How can we build healthy body image?"],
   ["Is it wrong to enjoy spending?", "What is your money weakness?", "If you won the lottery, would you change?"],
   ["Is cheating in games as bad as in exams?", "Can a cheater ever be trusted again?", "Why do some people get away with it?"],
   ["Do companies judge people by looks?", "Is it natural to judge quickly?", "What do people judge you by?"],
   ["Is it possible to become stronger without pain?", "Should parents protect kids from failure?", "What made your parents strong?"],
   ["Should schools help students find jobs?", "At what age should people start working?", "What was your first job?"],
   ["Is online communication more honest?", "Can you build a real friendship online?", "Should important news be given in person?"],
   ["Why do some jobs still have few women?", "Should companies have gender quotas?", "Is equality at work improving?"],
   ["Is school still necessary with the internet?", "Who taught you the most in your life?", "What can't be learned from books?"]
  ],
  gram1: {
   chain: ["A person who ___ is someone I admire.", "A rule that ___ should be changed."],
   ex: "T: A person who keeps promises is someone I admire.<br>S: A person who … is someone I admire.<br>T: …"
  },
  gram2: {
   a: {
    title: "Define it!",
    items: ["A cheater is someone who …", "A good leader is a person who …", "Social media is something that …", "Equality is a situation in which …", "A hero is a person whose …"],
    ans: "Finish it. <b>+ give an example</b>"
   },
   b: {
    title: "Describe and guess",
    big: "It's something that ___. People who ___ use it every day. What is it?",
    ans: "Then ask: <b>Can you describe a person who inspires you?</b>"
   }
  },
  opener: {
   think: ["What makes an opinion convincing?", "Is it okay to change your opinion in a discussion?", "What topic do people argue about most?"]
  },
  convo: [
   ["A", "Honestly, I think {part-time jobs} are bad for students."],
   ["B", "Really? What makes you say that?"],
   ["A", "Students who work late have no time to study."],
   ["B", "I see your point, but they learn {responsibility}."],
   ["A", "That's true, but grades come first."],
   ["B", "Not always. Skills that you learn at work last longer."],
   ["A", "Hmm, maybe. So what's your solution?"],
   ["B", "Let them work, but only {on weekends}."],
   ["A", "Fair enough. You've made your point!"]
  ],
  swap: [["a topic", "part-time jobs"], ["a benefit", "responsibility"], ["a limit", "on weekends"], ["your opinion", "bad"]],
  lang: [
   ["State your opinion", ["Honestly, I think …", "I strongly believe …"]],
   ["Support it", ["The main reason is …", "Take … for example."]],
   ["Disagree politely", ["I see your point, but …", "That may be true, but …"]],
   ["Find common ground", ["Fair enough.", "We both agree that …"]]
  ],
  langPractice: ["Technology makes us lonely.", "Looks matter in job interviews.", "Everyone cheats sometimes.", "Men and women are already equal.", "University isn't necessary.", "Hard times are good for you."],
  survey: {
   ask: "Do you think",
   cols: ["Me", "My teacher", "One more question"],
   rows: ["technology makes us talk less", "the media creates body pressure", "earning more makes us spend more", "teens should have jobs", "face-to-face talk is better", "workplaces are equal now"],
   q: "Do you think …? → Why? / Can you give an example?",
   report: "My teacher and I both think ___, but only I think ___."
  },
  gap: {
   who: "The office debate",
   q: ["What was the topic?", "Who supported the idea?", "What was her main reason?", "Who disagreed?", "What did they decide?"],
   A: [["topic", "a four-day work week"], ["supporter", "?"], ["her reason", "people who rest work better"], ["disagreed", "?"], ["decision", "?"]],
   B: [["topic", "?"], ["supporter", "Ms. Kim, who leads HR"], ["her reason", "?"], ["disagreed", "the manager who handles sales"], ["decision", "a 3-month trial"]],
   tip: "the manager <b>who</b> … · an idea <b>that</b> …"
  },
  role: {
   A: ["You are the debate host.", "Ask 3 \"Why…?\" questions + 2 challenges.", "Summarize both sides. Choose a winner."],
   B: ["You are a speaker.", "Choose a side: for or against.", "Give 2 reasons and 1 example. Answer the challenge."]
  },
  tts: {
   title: "Hold a mini debate",
   steps: ["Think: pick one of today's questions.", "Ask your teacher's opinion and reasons.", "Take opposite sides and debate for 3 minutes.", "Summarize: what point was strongest?"],
   lang: ["The strongest point was ___ because ___.", "People who ___ might say ___.", "We both agree that ___."]
  },
  speech: {
   time: "2 min",
   model: ["Good afternoon. Today I'd like to make one point.", "We should stop judging people by their appearance.", "First, looks tell us nothing about someone's values.", "Second, first impressions are often wrong.", "My quietest coworker, who I ignored at first, is now my best friend.", "People who judge quickly miss great relationships.", "So next time, listen before you judge.", "Thank you. Any questions?"],
   outline: ["Hook — \"I'd like to make one point\"", "Your opinion", "Reason 1", "Reason 2", "A personal example", "Ask for questions"],
   check: ["Clear opinion", "Two reasons", "who / that / which", "Answer 1 question"]
  },
  pron: {
   cols: [["/θ/ (think)", ["think", "strength", "everything"]], ["/ð/ (that)", ["that", "whether", "although"]], ["th ≠ s / d", ["think / sink", "they / day", "thought / sought"]]],
   up: "Do you think that's true?",
   down: "Why do people judge others?"
  },
  review: ["I can answer in 4 parts.", "I can support my opinion with reasons.", "I can use who, which and that.", "I can disagree politely."]
 }
};
