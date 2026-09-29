// SIU ADVANCE 008 — Politics and Government (8판 형식, 001 본보기)
// 원본과 다른 점:
//  - 문법 제목 "What is a Intransitive Verb?" → "an intransitive verb"
//  - Q1 대답 틀 "First thing that spring on my mind" → "The first thing that comes to mind is …"
//  - Q3 "…who run for a position in polities?" → "…who run for political office?"
//  - Q5 "What, in general, do you think are…" → "In general, what do you think are…"
//  - Q7 "work on a government office" → "work in a government office"
//  - Q8 "What types of government does your country have?" → "What type of government does your country have?"
//  - Q9 "If you will be a politician, what is the first thing you will do to your country?" → "If you were a politician, what would you do first for your country?"
//  - Q10 "What government should do to fight terrorism?" → "What should the government do to fight terrorism?"
//  - Keyword Vote: 원본은 noun 인데 뜻이 동사 뜻 → 명사 뜻으로 맞춤
// 민감 내용: 쉬운 판(중고생)은 시위·부패·테러를 «학교 선거·정직·공정·안전» 으로 다룸(폭력 묘사 없음). 특정 정당·정치인 지지 없음.
export default {
 no: "a008",
 title: "Politics and Government",
 book: "SIU ADVANCE 008 - Politics and government",
 next: "009 Goals and Dreams",
 cover: { h1: "Politics", em: "and Government", goals: ["Talk about leaders and voting", "Use verbs with and without an object", "Give a campaign speech"] },
 KW: [
  ["government", "noun", "정부", "the group of people who control a country"],
  ["vote", "noun", "투표, 표", "a choice you make in an election"],
  ["politics", "noun", "정치", "the work of governments and leaders"],
  ["protest", "noun", "시위, 항의", "an action to show you disagree with something"],
  ["qualities", "noun", "자질, 특성", "the good parts of a person's character"],
  ["corruption", "noun", "부패", "dishonest acts by people in power, like taking bribes"],
  ["office", "noun", "사무실, 관청", "a place where people work at desks"],
  ["type", "noun", "종류, 유형", "a kind of thing"],
  ["politician", "noun", "정치인", "a person whose job is in politics"],
  ["terrorism", "noun", "테러", "using violence to scare people for political goals"]
 ],
 QS: [
  "What images come to mind when you hear the word 'government'?",
  "Is voting an important responsibility of a citizen?",
  "What is your opinion about actors who run for political office?",
  "Have you ever been to a political protest? If so, what happened?",
  "In general, what do you think are the qualities of a good political leader?",
  "Why is there so much corruption in many governments?",
  "Would you like to work in a government office?",
  "What type of government does your country have?",
  "If you were a politician, what would you do first for your country?",
  "What should the government do to fight terrorism?"
 ],
 IMG_E: ["scene-words/18239", "scene-words/16425", "scene-words/14344", "scene-words/15652", "scene-words/17251", "scene-words/20224", "scene-words/12253", "scene-words/15065", "scene-words/19759", "scene-words/18020"],
 IMG_H: ["scene-words/14402", "scene-words/16687", "scene-words/16886", "scene-words/14344", "scene-words/13076", "scene-words/18797", "scene-words/18633", "scene-words/18958", "scene-words/19759", "scene-words/16045"],
 PICS: {
  opener: "scene-words/18647",
  talk: "scene-words/17285",
  group: "scene-words/16776",
  speech: "scene-words/18171",
  reporter: "scene-words/18065",
  survey: "scene-words/16425",
  pron: "scene-words/16400",
  roleB: "scene-words/15652",
  cover: "scene-words/14721",
  back: "scene-words/19717"
 },
 gram1: {
  can: "use verbs without an object",
  title: "Intransitive",
  em: "Verbs",
  rules: [
   ["No object", "It <b>snowed</b>. We <b>laughed</b>."],
   ["+ place / time", "They <b>arrived</b> on time."]
  ],
  hardNote: "arrive · happen · cry · die · sleep · laugh — no object",
  say: [
   "An intransitive verb does not need an object. It makes sense alone.",
   "It snowed. We laughed.",
   "They arrived on time."
  ]
 },
 gram2: {
  can: "tell verbs with and without an object",
  cols: ["No object", "+ object"],
  rows: [
   ["+", "The people <b>voted</b>.", "The people <b>chose</b> a leader."],
   ["−", "He didn't <b>arrive</b> on time.", "She didn't <b>answer</b> the question."],
   ["?", "Did prices <b>rise</b>?", "Did you <b>raise</b> your hand?"]
  ]
 },
 gapCan: "ask \"What does she promise?\"",
 role: {
  title: "The",
  em: "Election",
  tail: "Interview",
  opener: "Thanks for joining us. Why should people vote for you?",
  a: "News reporter",
  b: "Candidate"
 },
 pron: {
  can: "move the stress in word families",
  title: "Word Family",
  em: "Stress",
  game: "Teacher says a word → you say its family: <i>politics → political → politician.</i> The stress moves!"
 },
 E: {
  steps: ["Answer", "Why", "More"],
  model: [
   ["I think of a big building.", "Leaders work there.", "I also think of the flag."],
   ["Yes, I think it's important.", "We choose our leaders.", "I'll vote when I'm 18."],
   ["I think it's OK.", "Anyone can be a leader.", "But they must study hard."],
   ["No, I haven't.", "But I saw one on the news.", "People held big signs."],
   ["A good leader must be honest.", "People need to trust them.", "They should listen, too."],
   ["Some leaders want money.", "It's not fair to people.", "Leaders must follow the rules."],
   ["Yes, I would.", "I want to help people.", "It's a stable job."],
   ["Korea is a democracy.", "People vote for the president.", "We vote every five years."],
   ["I would build more parks.", "Kids need places to play.", "I'd also help old people."],
   ["It should keep people safe.", "It can have more police.", "It can check bags at airports."]
  ],
  frame: [
   "I think of ___.",
   "Yes, it's ___. We choose ___.",
   "I think it's ___ because ___.",
   "Yes, I have. / No, I haven't. ___",
   "A good leader must be ___.",
   "Some leaders ___. It's not ___.",
   "Yes, I would. / No, I wouldn't. ___",
   "Korea is a ___.",
   "I would ___ first.",
   "It should ___."
  ],
  bank: [
   ["a building", "a flag", "leaders", "rules"],
   ["important", "our leaders", "a duty", "fair"],
   ["OK", "strange", "fair", "not good"],
   ["the news", "signs", "a campaign", "school"],
   ["honest", "fair", "kind", "smart"],
   ["want money", "fair", "lie", "honest"],
   ["help people", "stable", "boring", "busy"],
   ["democracy", "republic", "president", "vote"],
   ["build parks", "help kids", "clean air", "lower prices"],
   ["keep people safe", "add police", "check bags", "work together"]
  ],
  more: [
   ["Who is a leader you know?", "What do they do?"],
   ["Have you voted at school?", "Who did you vote for?"],
   ["Do you know a famous actor?", "Would they be a good leader?"],
   ["What would you protest about?", "How can students share ideas?"],
   ["Who is a good leader at school?", "Why?"],
   ["Why is honesty important?", "What should happen to liars?"],
   ["What job do you want?", "Why?"],
   ["Who is the leader of Korea?", "What does a president do?"],
   ["What is a problem in your town?", "How can we fix it?"],
   ["How do you stay safe?", "Who keeps your school safe?"]
  ],
  gram1: {
   chain: ["Yesterday, I ___ (slept / laughed / cried).", "I usually arrive ___."],
   ex: "T: Yesterday, I laughed a lot.<br>S: Yesterday, I slept early.<br>T: I …"
  },
  gram2: {
   a: {
    title: "Object or no object?",
    items: ["I voted.", "I voted for Mina.", "She smiled.", "He broke the rule."],
    ans: "Say it. Then say <b>your own sentence</b>."
   },
   b: {
    title: "Class election",
    big: "If I become class president, I will ___.",
    ans: "Then ask: <b>What would you do?</b>"
   }
  },
  opener: {
   think: ["Look at the photo. What are the students doing?", "Have you voted in a class election?", "What makes a good class president?"]
  },
  convo: [
   ["A", "Are you running for class president?"],
   ["B", "Yes! I want to {make lunch better}."],
   ["A", "Great idea! What's your plan?"],
   ["B", "I'll ask everyone and talk to the {principal}."],
   ["A", "I'll vote for you!"],
   ["B", "Thanks! Can you help with my {posters}?"],
   ["A", "Sure. Let's make them {after school}."]
  ],
  swap: [["a promise", "make lunch better"], ["a school leader", "principal"], ["campaign things", "posters"], ["a time", "after school"]],
  lang: [
   ["Give an opinion", ["I think …", "In my opinion, …"]],
   ["Make a promise", ["I will …", "I promise to …"]],
   ["Agree / disagree", ["I agree.", "I don't think so."]]
  ],
  langPractice: ["Voting is boring.", "Kids should vote.", "Leaders are rich.", "I'd like to be president.", "Rules are important.", "Actors can be leaders."],
  survey: {
   ask: "Do you think",
   cols: ["Me", "My teacher"],
   rows: ["voting is important", "students should vote at 16", "leaders must be honest", "actors can be good leaders", "school rules are fair", "you'd like a government job"],
   q: "Do you think …?  → Yes, I do. / No, I don't.",
   report: "I think ___, but my teacher ___."
  },
  gap: {
   who: "Candidate Seo Yuna",
   q: ["How old is Yuna?", "What does she promise?", "What does she want to fix?", "When does the vote happen?"],
   A: [["age", "16"], ["promise", "?"], ["wants to fix", "the old gym"], ["vote day", "?"]],
   B: [["age", "?"], ["promise", "free snacks on Friday"], ["wants to fix", "?"], ["vote day", "next Monday"]],
   tip: "She <b>promises</b> … · The vote <b>happens</b> …"
  },
  role: {
   A: ["You are a news reporter.", "Ask 5 questions.", "Ask: \"What will you do?\""],
   B: ["You are running for class president.", "Choose: better lunch / more clubs / cleaner school.", "Answer with 2 sentences."]
  },
  tts: {
   title: "Plan a class election campaign",
   steps: ["Pick 3 school problems.", "Ask your teacher for ideas.", "Choose one promise together.", "Give your 30-second speech!"],
   lang: ["Vote for me because ___.", "I will ___.", "Together we can ___."]
  },
  speech: {
   time: "1 min",
   model: ["Hello, everyone! I'm Minji.", "I want to be your class president.", "Our classroom is too hot in summer.", "I will ask for a new fan.", "I will listen to everyone.", "Please vote for me. Thank you!"],
   outline: ["Hello + name", "What you want", "A problem", "Your promise", "Vote for me!"],
   check: ["Loud voice", "Look at your teacher", "Use will"]
  },
  pron: {
   cols: [["Ooo", ["politics", "government", "citizen"]], ["oOo", ["election", "corruption", "opinion"]], ["ooOo", ["politician", "population", "education"]]],
   up: "Is voting important?",
   down: "Who will you vote for?"
  },
  review: ["I can talk about government.", "I can use verbs with no object.", "I can make a promise with will.", "I can give a short speech."]
 },
 H: {
  steps: ["Answer", "Reason", "Example", "Ask back"],
  model: [
   ["I picture the National Assembly and heated debates.", "Politics on the news is often about arguments.", "Last week lawmakers argued all night over a budget.", "What comes to your mind?"],
   ["Yes, voting is a key responsibility of every citizen.", "If people don't vote, a small group decides for all.", "Some elections are won by only a few hundred votes.", "Do you always vote?"],
   ["I think it's fine if they're qualified.", "Fame helps them win, but it doesn't make them skilled.", "Some actors became capable governors in the US.", "Would you vote for a celebrity?"],
   ["Yes, I joined a peaceful climate march once.", "I wanted leaders to hear young people's voices.", "Thousands of students marched to city hall.", "Have you ever joined a protest?"],
   ["A good leader must be honest and a good listener.", "People only follow leaders they trust.", "The best mayors hold town meetings every month.", "What quality matters most to you?"],
   ["I think power without checks leads to corruption.", "When nobody watches, officials abuse their positions.", "Free media often exposes bribery scandals.", "How can we reduce corruption?"],
   ["Yes, I'd like to work in a government office.", "It offers stability and a chance to serve the public.", "My cousin works at city hall and helps new residents.", "Would you prefer the public or private sector?"],
   ["Korea is a democratic republic with a president.", "The president is elected every five years.", "The National Assembly makes the laws.", "How is your country's government different?"],
   ["If I were a politician, I'd focus on housing first.", "Young people can't afford homes in big cities.", "I'd build affordable apartments near subway lines.", "What would you do first?"],
   ["The government should prevent attacks with good intelligence.", "Stopping a plan early saves the most lives.", "Countries share information to catch threats early.", "How much privacy should we give up for safety?"]
  ],
  frame: [
   "I picture … because …",
   "Voting is … because … For example, …",
   "I think it's … if … However, …",
   "Yes, I joined … / No, I haven't, but …",
   "A good leader must be … because …",
   "I think corruption happens because …",
   "Yes, I'd like to … / No, I'd rather …",
   "My country is a … The leader is …",
   "If I were a politician, I'd … first.",
   "The government should … because …"
  ],
  more: [
   ["Do people trust the government more or less today?", "Is a big or small government better?", "Should politics be taught at school?"],
   ["Should voting be required by law?", "Should the voting age be 16?", "Why don't young people vote more?"],
   ["Does fame help or hurt a politician?", "Should leaders need special training?", "Is politics a job or a duty?"],
   ["Do protests really change anything?", "When does a protest go too far?", "Is online protest real protest?"],
   ["Can a leader be honest and successful?", "Are leaders born or made?", "Which world leader do you admire?"],
   ["Is corruption worse in some countries?", "Should corrupt politicians go to prison?", "Can a small gift be a bribe?"],
   ["What are the downsides of a government job?", "Why is civil service popular in Korea?", "Should officials earn more?"],
   ["Is democracy the best system?", "What would you change about it?", "Compare a president and a king."],
   ["What would you do in your first 100 days?", "Which problem is the hardest to fix?", "Would you really want to be a politician?"],
   ["Is it OK to check phones for safety?", "Can fighting terrorism cause new problems?", "How can citizens help keep a country safe?"]
  ],
  gram1: {
   chain: ["Last election, turnout ___ (rose / fell).", "In my country, most protests ___."],
   ex: "T: Last election, turnout rose.<br>S: In my country, most protests end peacefully.<br>T: …"
  },
  gram2: {
   a: {
    title: "Rise or raise?",
    items: ["Taxes rise / raise every year.", "They rise / raise taxes.", "Prices rose / raised fast.", "She rose / raised a point."],
    ans: "Choose one. <b>Why? Object or not?</b>"
   },
   b: {
    title: "What happened?",
    big: "During the last election, ___ happened, and people ___.",
    ans: "Then ask: <b>How did people react?</b>"
   }
  },
  opener: {
   think: ["Why do so many people say they \"hate politics\"?", "Should young people care more about politics?", "Can one vote really make a difference?"]
  },
  convo: [
   ["A", "Did you watch the debate last night?"],
   ["B", "I did. I thought {the younger candidate} did well."],
   ["A", "Really? I wasn't convinced."],
   ["B", "Why not? Her plan for {housing} was clear."],
   ["A", "Maybe, but she didn't explain the cost."],
   ["B", "Fair point. Who are you voting for, then?"],
   ["A", "I haven't decided. I care most about {jobs}."],
   ["B", "Then read both plans before you vote."],
   ["A", "Good idea. I'll check them {this weekend}."]
  ],
  swap: [["a candidate", "the younger candidate"], ["an issue", "housing"], ["your top issue", "jobs"], ["a time", "this weekend"]],
  lang: [
   ["Give a view", ["As far as I'm concerned, …", "From my point of view, …"]],
   ["Challenge politely", ["I'm not convinced.", "But what about …?"]],
   ["Ask for evidence", ["What makes you say that?", "Where did you hear that?"]],
   ["Find common ground", ["We both want …", "I can see why …"]]
  ],
  langPractice: ["Voting should be required.", "Politicians are all the same.", "Protests never work.", "Actors shouldn't run for office.", "Taxes are too high.", "Teens should vote at 16."],
  survey: {
   ask: "Should",
   cols: ["Me", "My teacher", "One more question"],
   rows: ["voting be required by law", "16-year-olds be able to vote", "politicians have a term limit", "celebrities run for office", "the government give free transport", "schools teach politics"],
   q: "Should …? → Yes / No. → Ask: Why? / What are the risks?",
   report: "My teacher thinks ___, but I disagree because ___."
  },
  gap: {
   who: "Candidate Seo Yuna",
   q: ["What is Yuna's job now?", "What is her main promise?", "How will she pay for it?", "Who supports her?", "What do critics say?"],
   A: [["job now", "city council member"], ["main promise", "?"], ["pay for it", "tax on empty houses"], ["supporters", "?"], ["critics", "?"]],
   B: [["job now", "?"], ["main promise", "cheap housing for youth"], ["pay for it", "?"], ["supporters", "young workers"], ["critics", "her plan is too slow"]],
   tip: "She <b>promises</b> … · Support <b>grew</b> · Prices <b>rose</b>"
  },
  role: {
   A: ["You are a TV news reporter.", "Ask 5 questions + 2 tough follow-ups.", "Ask about cost and evidence."],
   B: ["You are a candidate for mayor.", "Choose: housing / public transport / clean air.", "Give a clear plan and answer criticism."]
  },
  tts: {
   title: "Write a 5-point campaign plan",
   steps: ["List the 5 biggest problems in your city.", "Ask your teacher which matters most.", "Agree on a plan and how to pay for it.", "Give a 1-minute campaign speech."],
   lang: ["Our first priority is ___.", "We'll pay for it by ___.", "I understand your concern, but ___."]
  },
  speech: {
   time: "2 min",
   model: ["Good evening. Let me ask you: can you afford a home?", "For most young people, the answer is no.", "Prices rose 30 percent in five years.", "If I'm elected, I'll build 10,000 affordable homes.", "We'll pay for it with a tax on empty houses.", "Change won't happen overnight, but it can happen.", "Thank you. Any questions?"],
   outline: ["Hook — a question", "The problem + a fact", "Your promise", "How you'll pay", "Closing line", "Ask for questions"],
   check: ["Clear voice", "Eye contact", "Use facts", "Answer 1 question"]
  },
  pron: {
   cols: [["Ooo", ["politics", "citizen", "candidate"]], ["oOoo", ["political", "democracy", "authority"]], ["ooOo", ["politician", "population", "demonstration"]]],
   up: "Should voting be required?",
   down: "What's your top priority?"
  },
  review: ["I can answer in 4 parts.", "I can use intransitive verbs.", "I can debate a political issue.", "I can give a campaign speech."]
 }
};
