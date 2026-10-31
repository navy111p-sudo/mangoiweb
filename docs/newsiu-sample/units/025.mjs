// SIU BASIC 025 — Personality (8판 형식, 001 본보기와 같은 모양)
// 원본과 다른 점:
//  - Q1 "Are you shy? in what situations are you shy?" → "Are you shy? When are you shy?" (대문자·간결)
//  - Q4 "Which one you belong: introvert (focus on yourself) or extrovert (focus on other people)?" → "Which do you belong to: introverts or extroverts?" (do 빠짐)
//  - Q8 "What personality needs for a good sportsmanship" → "What personality do you need for good sportsmanship?" (주어·do·물음표)
//  - Q10 "What sort of things would you do to amuse yourself during a car journey?" → 그대로(물음표만 유지)
//  - 답 틀 "One of my personality is" → "One of my personality traits is …", "Running business need a pesonality" → "Running a business needs …"
//  - Keyword 뜻을 쉬운 영어로 짧게 바꿈(Determined 한글 «단호한» → «의지가 굳은»)
export default {
 no: "025",
 title: "Personality",
 book: "SIU BASIC 025 - Personality",
 next: "026 Should You",
 cover: { h1: "Your", em: "Personality", goals: ["Describe your personality", "Ask and answer 10 questions", "Give a short presentation"] },
 KW: [
  ["shy", "adjective", "수줍은", "nervous and quiet with new people"],
  ["personality", "noun", "성격", "the kind of person you are"],
  ["characteristic", "noun", "특징", "a quality that makes someone special"],
  ["belong", "verb", "속하다", "to be part of a group"],
  ["determined", "adjective", "의지가 굳은", "not giving up when things are hard"],
  ["change", "verb", "바꾸다", "to make something different"],
  ["similar", "adjective", "비슷한", "almost the same"],
  ["sportsmanship", "noun", "스포츠맨 정신", "playing fair and being kind in sports"],
  ["business", "noun", "사업", "buying and selling things to make money"],
  ["amuse", "verb", "즐겁게 하다", "to make someone have fun"]
 ],
 QS: [
  "Are you shy? When are you shy?",
  "Is your personality suited to your job?",
  "What are some characteristics of your personality?",
  "Which do you belong to: introverts or extroverts?",
  "Are you a determined person?",
  "What would you like to change about yourself?",
  "Is your personality more similar to your mother's or father's?",
  "What personality do you need for good sportsmanship?",
  "What personality traits are best for running a business?",
  "What would you do to amuse yourself during a car journey?"
 ],
 IMG_E: ["scene-words/21041", "scene-words/19120", "scene-words/19020", "scene-words/15597", "scene-words/18678", "scene-words/19876", "scene-words/18990", "scene-words/12122", "scene-words/18504", "scene-words/18634"],
 IMG_H: ["scene-words/19876", "scene-words/16343", "scene-words/19020", "scene-words/15597", "scene-words/15001", "scene-words/14085", "scene-words/14184", "scene-words/16523", "scene-words/18129", "scene-words/18634"],
 PICS: {
  opener: "scene-words/12021",
  talk: "scene-words/18146",
  group: "scene-clips/7041",
  speech: "scene-words/16400",
  reporter: "scene-words/16345",
  survey: "scene-words/15597",
  pron: "scene-clips/7477",
  roleB: "scene-words/16344",
  cover: "scene-words/19120",
  back: "scene-words/18131"
 },
 gram1: {
  can: "tell concrete and abstract nouns apart",
  title: "Concrete &",
  em: "Abstract Nouns",
  rules: [
   ["Concrete = you can see or touch it", "My <b>puppy</b> sits on the <b>sofa</b>."],
   ["Abstract = a feeling or an idea", "My puppy gives me <b>love</b> and <b>joy</b>."]
  ],
  hardNote: "abstract: kindness · courage · patience · honesty · fear",
  say: ["Concrete nouns are things we can see, hear, touch, smell or taste.", "Abstract nouns are feelings or ideas.", "My puppy sits on the sofa.", "My puppy gives me love and joy."]
 },
 gram2: {
  can: "talk about the good qualities people have",
  cols: ["Concrete (see it)", "Abstract (feel it)"],
  rows: [
   ["+", "I have a <b>bike</b>.", "I have a lot of <b>patience</b>."],
   ["−", "I don't have a <b>car</b>.", "I don't have much <b>courage</b>."],
   ["?", "Do you have a <b>pet</b>?", "Do you have <b>confidence</b>?"]
  ]
 },
 gapCan: "ask \"What is she like?\"",
 role: {
  title: "The",
  em: "Perfect Job",
  tail: "Interview",
  opener: "Hello! Please sit down. Can you tell me about your personality?",
  a: "Job interviewer",
  b: "Job seeker"
 },
 pron: {
  can: "stress the right part of long words",
  title: "Word",
  em: "stress",
  game: "Teacher says a word → you clap the loud part → you make a sentence: <i>\"I am a creAtive person.\"</i>"
 },
 E: {
  steps: ["Answer", "More"],
  model: [
   ["Yes, I am a little shy.", "I am shy when I meet new people."],
   ["I'm a student, so my job is studying.", "I am patient, so it is good for me."],
   ["I am kind and funny.", "I like to make my friends laugh."],
   ["I am an extrovert.", "I love playing with other people."],
   ["Yes, I am.", "I practice piano until I can play the song."],
   ["I want to change my bad habit.", "I want to get up early."],
   ["My personality is like my mom's.", "We are both chatty."],
   ["You need to be fair and kind.", "Say \"Good game!\" when you lose."],
   ["You need to be brave and friendly.", "Customers like friendly people."],
   ["I play word games with my family.", "I also sing songs in the car."]
  ],
  frame: [
   "Yes, I am. I am shy when ___.",
   "My job is ___. I am ___, so it is good.",
   "I am ___ and ___.",
   "I am an ___. I like ___.",
   "Yes, I am. / No, I'm not. I ___.",
   "I want to change ___.",
   "My personality is like my ___'s. We are both ___.",
   "You need to be ___ and ___.",
   "You need to be ___ and ___.",
   "In the car, I ___ and ___."
  ],
  bank: [
   ["meet new people", "speak in class", "sing", "talk on the phone"],
   ["studying", "patient", "careful", "hard-working"],
   ["kind", "funny", "calm", "brave"],
   ["introvert", "extrovert", "reading alone", "playing with friends"],
   ["practice", "try again", "never give up", "give up"],
   ["getting up late", "being lazy", "being shy", "eating too fast"],
   ["mom", "dad", "chatty", "quiet"],
   ["fair", "kind", "polite", "calm"],
   ["brave", "friendly", "smart", "honest"],
   ["sing songs", "play word games", "look outside", "sleep"]
  ],
  more: [
   ["Who helps you when you are shy?", "Are you shy with your teacher?"],
   ["What job do you want?", "Why is it good for you?"],
   ["What do your friends say about you?", "Are you funny?"],
   ["Do you like parties?", "Do you like quiet time?"],
   ["What did you never give up on?", "Is it hard to try again?"],
   ["Why do you want to change it?", "How can you change it?"],
   ["How are you different from your dad?", "Who is funnier?"],
   ["Are you a good loser?", "What do you say to the winner?"],
   ["Do you want your own shop?", "What would you sell?"],
   ["Where do you go by car?", "Do you get bored in the car?"]
  ],
  gram1: {
   chain: ["I can see a ___.", "I feel ___."],
   ex: "T: I can see a cat. I feel joy.<br>S: I can see a tree. I feel calm.<br>T: I …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["Do you have patience?", "Do you have courage?", "Do you have a pet?", "Do you have a best friend?", "Do you have a lot of energy?"],
    ans: "Yes, I do. / No, I don't. <b>+ one more sentence</b>"
   },
   b: {
    title: "Concrete or abstract?",
    big: "My mom has ___ (a thing) and ___ (a feeling).",
    ans: "Then ask: <b>Is \"love\" concrete or abstract?</b>"
   }
  },
  opener: {
   think: ["Look at the photo. Are they shy or friendly?", "Are you quiet or loud?", "What word describes you best?"]
  },
  convo: [
   ["A", "Hi! What are you like, {Jun}?"],
   ["B", "I'm {friendly}, but I'm a little shy."],
   ["A", "When are you shy?"],
   ["B", "When I {speak in class}."],
   ["A", "Me too! What do you want to change?"],
   ["B", "I want to be more {brave}."],
   ["A", "You can do it!"]
  ],
  swap: [["your name", "Jun"], ["a good quality", "friendly"], ["a shy time", "speak in class"], ["a new quality", "brave"]],
  lang: [
   ["Describe", ["I'm kind.", "I'm a bit shy.", "I'm very funny."]],
   ["Ask back", ["How about you?", "What are you like?"]],
   ["Cheer up", ["You can do it!", "Good idea!"]]
  ],
  langPractice: ["I'm shy.", "I'm very funny.", "I never give up.", "I'm like my dad.", "I love parties.", "I'm calm."],
  survey: {
   ask: "Are you",
   cols: ["Me", "My teacher"],
   rows: ["shy", "funny", "calm", "brave", "chatty", "patient"],
   q: "Are you …?  → Yes, I am. / No, I'm not.",
   report: "I am ___, but my teacher is ___."
  },
  gap: {
   who: "Sora",
   q: ["What is Sora like?", "When is she shy?", "Is she like her mom or dad?", "What does she want to change?"],
   A: [["personality", "kind and calm"], ["shy when", "?"], ["like her", "dad"], ["wants to change", "?"]],
   B: [["personality", "?"], ["shy when", "she sings"], ["like her", "?"], ["wants to change", "being late"]],
   tip: "She → <b>is</b> · has · wants"
  },
  role: {
   A: ["You need a new zookeeper.", "Ask 5 questions.", "Write short notes."],
   B: ["You want the job.", "Say 3 good qualities.", "Answer with 2 sentences."]
  },
  tts: {
   title: "Make a personality badge",
   steps: ["Pick 3 words that describe you.", "Ask your teacher's 3 words.", "Find one word you share.", "Draw your badge and tell!"],
   lang: ["I am ___ and ___.", "My teacher is ___.", "We are both ___!"]
  },
  speech: {
   time: "1 min",
   model: ["Hello! My name is Hana.", "I am kind and funny.", "I am a little shy with new people.", "I am like my mom. We both love to talk.", "I want to be braver.", "Thank you!"],
   outline: ["Name", "Two good qualities", "When you are shy", "Mom or dad?", "Thank you!"],
   check: ["Loud voice", "Look at the camera", "Say 5 things"]
  },
  pron: {
   cols: [["Oo", ["FUNny", "HAPpy", "CLEVer"]], ["Ooo", ["CURious", "WONderful", "BEAUtiful"]], ["oOo", ["deTERmined", "creAtive", "fanTAStic"]]],
   up: "Are you shy?",
   down: "What are you like?"
  },
  review: ["I can describe my personality.", "I can tell concrete and abstract nouns.", "I can ask \"Are you …?\"", "I can say one more sentence."]
 },
 H: {
  steps: ["Answer", "Reason", "Example", "Ask back"],
  model: [
   ["Yes, I can be shy in new places.", "I need time to feel comfortable with strangers.", "On my first day at a new academy, I barely spoke.", "Are you ever shy?"],
   ["I think it suits my job as a student.", "I'm patient, and studying needs patience.", "I can sit with a hard math problem for an hour.", "Does your personality fit your job?"],
   ["I'm curious, honest and a bit stubborn.", "I always want to know how things work.", "I once took apart a radio just to see inside.", "What are your main traits?"],
   ["I belong to the introverts.", "I get my energy from quiet time alone.", "After a party, I need a day of reading.", "Which one are you?"],
   ["Yes, I'm quite determined.", "When I set a goal, I don't give up easily.", "I practiced every day until I passed my swim test.", "What goal are you working on?"],
   ["I'd like to stop worrying so much.", "Worry wastes my time and energy.", "Before tests, I can't sleep well.", "What would you change about yourself?"],
   ["I'm more similar to my father.", "We're both calm and quiet.", "We can fish together for hours without talking.", "Who are you more like?"],
   ["You need to be fair and humble.", "Winning isn't everything in sports.", "Great players shake hands even after a loss.", "Do you think you're a good loser?"],
   ["You need to be confident and flexible.", "Businesses face surprises all the time.", "Many shops changed to online sales during COVID.", "Would you like to run a business?"],
   ["I usually listen to podcasts or play games.", "Long drives get boring very fast.", "On the way to Busan, we play \"20 Questions.\"", "How do you pass time in the car?"]
  ],
  frame: [
   "I'm shy when … because … Once, …",
   "I think my personality suits … because …",
   "I'm …, … and … For example, …",
   "I'm an introvert / extrovert because …",
   "I'm determined when … Once, …",
   "I'd like to change … because …",
   "I'm more like my … We're both …",
   "You need to be … because …",
   "Running a business needs … because …",
   "On car trips, I … because …"
  ],
  more: [
   ["Is being shy a bad thing? Why?", "How can shy people feel more confident?", "Are people shyer online or in person?"],
   ["Which job would be terrible for your personality?", "Should people choose jobs by personality or by salary?", "Can a job change your personality?"],
   ["Which trait do you like most in yourself?", "Do your friends see you the same way you see yourself?", "Are we born with our personality?"],
   ["Is school designed more for introverts or extroverts?", "Can an introvert be a good leader?", "Where do you get your energy from?"],
   ["What is the difference between determined and stubborn?", "Who is the most determined person you know?", "Can you learn to be determined?"],
   ["Is it easy to change a habit? Why?", "What trait would you never change?", "Do people really change as they grow up?"],
   ["What habit did you get from your parents?", "Is personality from genes or from the family?", "How are you different from your siblings?"],
   ["Which athlete shows great sportsmanship?", "Is it OK to celebrate a lot when you win?", "Should kids' sports keep score?"],
   ["Is it better to start a business young or old?", "Which is more important: a good idea or a good team?", "What business is missing in your town?"],
   ["Do you prefer road trips or flights? Why?", "Should kids use phones in the car?", "What was your best trip ever?"]
  ],
  gram1: {
   chain: ["A good friend has ___ (abstract).", "My bag has a ___ (concrete) in it."],
   ex: "T: A good friend has kindness.<br>S: A good leader has courage.<br>T: A good teacher has …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["Do you have a lot of patience?", "Do you have the courage to sing alone?", "Do you have confidence on stage?", "Do you have trust in your friends?", "Do you have enough free time?"],
    ans: "Yes, I do. / No, I don't. <b>+ reason and example</b>"
   },
   b: {
    title: "Three qualities",
    big: "A good leader needs ___, ___ and ___. I have ___, but I need more ___.",
    ans: "Then ask: <b>Which quality is the most important?</b>"
   }
  },
  opener: {
   think: ["Can you guess someone's personality from a photo?", "Do you act differently with friends and with strangers?", "Which three words would your best friend use for you?"]
  },
  convo: [
   ["A", "So, how would you describe yourself?"],
   ["B", "Hmm, I'm {curious} and pretty {calm}."],
   ["A", "Really? Are you an introvert or an extrovert?"],
   ["B", "Mostly an {introvert}. I recharge alone."],
   ["A", "Interesting. Are you shy, then?"],
   ["B", "Only at first. After I know people, I talk a lot."],
   ["A", "That makes sense. What would you like to change?"],
   ["B", "I'd like to be more {confident}. How about you?"],
   ["A", "I'm the opposite — I need more patience!"]
  ],
  swap: [["a trait", "curious"], ["another trait", "calm"], ["introvert / extrovert", "introvert"], ["a trait you want", "confident"]],
  lang: [
   ["Describe people", ["I'm fairly calm.", "She's really outgoing.", "He can be stubborn."]],
   ["Ask for more", ["What makes you say that?", "Can you give an example?", "Has it always been that way?"]],
   ["Soften it", ["I'm a bit…", "I tend to…", "Sometimes I can be…"]],
   ["Agree / disagree", ["That's so true.", "I see it differently."]]
  ],
  langPractice: ["I'm an extrovert.", "I never give up.", "I hate losing.", "I'm just like my mom.", "I'm too shy to sing.", "I'd love to run a café."],
  survey: {
   ask: "Are you",
   cols: ["Me", "My teacher", "One more question"],
   rows: ["shy with strangers", "competitive", "a good listener", "easily bored", "organized", "a risk-taker"],
   q: "Are you …? → Yes. → Ask: When? / Give me an example. / Since when?",
   report: "My teacher and I are both ___, but only I am ___."
  },
  gap: {
   who: "Sora",
   q: ["What is Sora like?", "When does she feel shy?", "Who is she similar to? How?", "What does she want to change? Why?", "What job would suit her?"],
   A: [["personality", "calm, kind, organized"], ["shy when", "?"], ["similar to", "her dad — both quiet"], ["wants to change", "?"], ["good job", "?"]],
   B: [["personality", "?"], ["shy when", "she speaks on stage"], ["similar to", "?"], ["wants to change", "being late — stressful"], ["good job", "a librarian"]],
   tip: "She → <b>is</b> calm · <b>feels</b> shy · <b>wants</b> to"
  },
  role: {
   A: ["You hire people for a busy café.", "Ask 5 questions + 2 follow-ups.", "Decide: hire or not? Explain why."],
   B: ["You want the café job.", "Sell your 3 best traits with examples.", "Hide one weakness — admit it only if asked."]
  },
  tts: {
   title: "Match the personality to the job",
   steps: ["Think: which traits do a pilot, a teacher and a CEO need?", "Ask your teacher for 2 ideas each.", "Agree on the best job for you and for your teacher.", "Present your matches in 1 minute."],
   lang: ["A ___ needs to be ___ because ___.", "I'm not sure. I think ___ matters more.", "So we agree that ___."]
  },
  speech: {
   time: "2 min",
   model: ["Hi everyone. Let me describe my personality.", "I'm Minjun, and I'm curious, calm and a bit stubborn.", "I'm an introvert. I recharge by reading alone.", "I can be shy with strangers, but not with friends.", "I'm most similar to my dad. We both think before we speak.", "I'm determined — I practiced swimming until I passed my test.", "One thing I'd like to change is my worrying.", "Thanks for listening! Any questions?"],
   outline: ["Hook — \"Let me describe…\"", "Three traits", "Introvert or extrovert + why", "Who you are like", "A determined moment", "What you'd change + questions"],
   check: ["Clear voice", "Eye contact", "Examples for each trait", "Answer 1 question"]
  },
  pron: {
   cols: [["Oo", ["HONest", "STUBborn", "PAtient"]], ["Ooo", ["CURious", "SENsitive", "CONfident"]], ["oOo", ["deTERmined", "amBItious", "roMANtic"]]],
   up: "Are you an introvert?",
   down: "How would you describe yourself?"
  },
  review: ["I can answer in 4 parts.", "I can use concrete and abstract nouns.", "I can describe people with examples.", "I can give a short presentation."]
 }
};
