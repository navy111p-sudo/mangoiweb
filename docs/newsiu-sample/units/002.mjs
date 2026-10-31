// SIU BASIC 002 — 단원 파일(8판 형식). 본보기: units/001.mjs
// 원본과 다른 점:
//  - Q4 "What are you afraid of - and why?" → "What are you afraid of? Why?"
//  - Q5 "on your free time" → "in your free time" (답 틀 "on my free time" → "in my free time")
//  - Q7 "If you were invisible … what will you do or where will you go?" → "…what would you do, or where would you go?" (가정법 일치, 괄호 설명 삭제)
//  - Q8 "If you can have three magic wishes, what will they be?" → "If you could have three magic wishes, what would they be?"
//  - Q9 "If you have one year … where will you go?" → "If you had one year … where would you go?"
//  - 문법 설명 "it's subject" → "its subject", "Tree" 류 오타 정리 · Wish 품사: 원본 verb 이나 뜻풀이가 명사 → noun 으로
export default {
 no: "002",
 title: "About You",
 book: "SIU BASIC 002 - About you",
 next: "003 Are There Reasons Why",
 cover: { h1: "About", em: "You", goals: ["Talk about your feelings", "Share your dreams and wishes", "Use he likes / they like correctly"] },
 KW: [
  ["angry", "adjective", "화난", "feeling very upset about something"],
  ["happy", "adjective", "행복한", "feeling good and pleased"],
  ["sad", "adjective", "슬픈", "feeling unhappy"],
  ["afraid", "adjective", "두려워하는", "scared that something bad will happen"],
  ["free time", "noun", "자유 시간", "time when you can do what you enjoy"],
  ["goal", "noun", "목표", "something you want to do or get in the future"],
  ["invisible", "adjective", "보이지 않는", "not able to be seen"],
  ["wish", "noun", "소원", "something you hope will happen"],
  ["travel", "verb", "여행하다", "to go on a trip to another place"],
  ["teacher", "noun", "선생님", "a person who teaches, often at a school"]
 ],
 QS: [
  "What makes you angry?",
  "What makes you happy?",
  "What makes you sad?",
  "What are you afraid of? Why?",
  "What do you like to do in your free time?",
  "What is your goal in life?",
  "If you were invisible, what would you do, or where would you go?",
  "If you could have three magic wishes, what would they be?",
  "If you had one year to travel the world, where would you go?",
  "Who is your favorite teacher? Why?"
 ],
 IMG_E: ["scene-words/18509", "scene-words/12290", "scene-words/16270", "scene-words/19041", "scene-words/12461", "scene-words/17317", "scene-words/13059", "scene-words/19699", "scene-words/12309", "scene-words/18948"],
 IMG_H: ["scene-words/18819", "scene-words/15384", "scene-words/21098", "scene-words/19755", "scene-words/17244", "scene-words/15815", "scene-words/18567", "scene-words/13000", "scene-clips/7376", "scene-words/12229"],
 PICS: {
  opener: "scene-words/12021", talk: "scene-clips/5032", group: "scene-words/10017", speech: "scene-words/18040",
  reporter: "scene-words/16345", survey: "scene-clips/7445", pron: "scene-clips/7170", roleB: "scene-words/16344",
  cover: "scene-words/12140", back: "scene-words/12021"
 },
 gram1: {
  can: "match the subject and the verb",
  title: "Subject–Verb",
  em: "Agreement",
  rules: [
   ["One person / thing", "My friend <b>draws</b> nice posters."],
   ["Two or more · I · you", "My friends <b>draw</b> posters. I <b>draw</b>, too."]
  ],
  hardNote: "The sun rises · The plane flies · Open your books",
  say: ["The verb must agree with its subject.", "My friend draws nice posters.", "My friends draw posters. I draw, too."]
 },
 gram2: {
  can: "say what makes people happy",
  cols: ["I · you · we · they", "he · she · it"],
  rows: [
   ["+", "Games <b>make</b> me happy.", "Music <b>make<mark>s</mark></b> me happy."],
   ["−", "Tests <b>don't make</b> me happy.", "Rain <b>doesn't make</b> me happy."],
   ["?", "<b>Do</b> spiders scare you?", "<b>Does</b> the dark scare you?"]
  ]
 },
 gapCan: "ask \"What makes her…?\"",
 role: {
  title: "The", em: "Feelings", tail: "Interview",
  opener: "Hi! Can I ask you about your feelings for our class video?",
  a: "Interviewer", b: "Student"
 },
 pron: {
  can: "stress the right part of a word",
  title: "Word", em: "Stress",
  game: "Teacher says a word → you clap the strong part → you make a sentence: <i>\"I'm afraid of spiders.\"</i>"
 },
 E: {
  steps: ["Answer", "More"],
  model: [
   ["My brother makes me angry.", "He takes my toys."],
   ["My dog makes me happy.", "He always plays with me."],
   ["Sad movies make me sad.", "I cry a lot."],
   ["I am afraid of spiders.", "They have long legs!"],
   ["I like to draw in my free time.", "I draw cats and dogs."],
   ["My goal is to be a doctor.", "I want to help sick people."],
   ["First, I will go to the zoo.", "Then I will play with the lions!"],
   ["I want to have a big house.", "I also want a puppy and a lot of candy."],
   ["I will go to Paris.", "Then I will go to London."],
   ["My favorite teacher is Ms. Kim.", "She is kind and funny."]
  ],
  frame: [
   "___ makes me angry. He/She/It ___.",
   "___ makes me happy.",
   "___ makes me sad.",
   "I am afraid of ___. They are ___.",
   "I like to ___ in my free time.",
   "My goal is to be a ___.",
   "First, I will ___. Then I will ___.",
   "I want to have ___.",
   "I will go to ___. Then I will go to ___.",
   "My favorite teacher is ___. He/She is ___."
  ],
  bank: [
   ["my brother", "homework", "noise", "a mean friend"],
   ["my dog", "ice cream", "my mom", "games"],
   ["sad movies", "rain", "a broken toy", "goodbyes"],
   ["spiders", "the dark", "dogs", "ghosts"],
   ["draw", "read", "play games", "ride my bike"],
   ["doctor", "teacher", "singer", "YouTuber"],
   ["go to the zoo", "eat snacks", "fly", "visit my friend"],
   ["a big house", "a puppy", "wings", "candy"],
   ["Paris", "London", "New York", "Tokyo"],
   ["kind", "funny", "smart", "nice"]
  ],
  more: [
   ["What do you do when you're angry?", "Who makes you angry?"],
   ["Who makes you happy?", "When are you happy?"],
   ["What do you do when you're sad?", "Who helps you?"],
   ["Are you afraid of the dark?", "Is your teacher afraid of it?"],
   ["Who do you do it with?", "Where do you do it?"],
   ["Why do you want to do it?", "What do you need to learn?"],
   ["Where will you go first?", "Who will you watch?"],
   ["Which wish is the best?", "Would you share a wish?"],
   ["Why do you want to go there?", "Who will you go with?"],
   ["What does he/she teach?", "Why do you like him/her?"]
  ],
  gram1: {
   chain: ["My friend ___s every day.", "My friends ___ every day."],
   ex: "T: My friend plays soccer.<br>S: My friends play soccer.<br>T: My mom …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["Does music make you happy?", "Does rain make you sad?", "Do dogs scare you?", "Does homework make you angry?", "Do games make you happy?"],
    ans: "Yes, it does. / No, they don't. <b>+ one more</b>"
   },
   b: {
    title: "Your family",
    big: "My dad likes ___. He doesn't like ___.",
    ans: "Then ask: <b>What makes your dad happy?</b>"
   }
  },
  opener: { think: ["Look at the photo. How do they feel?", "Are you happy today?", "What makes you smile?"] },
  convo: [
   ["A", "Hi, Jun! You look happy today."],
   ["B", "I am! My {dog} makes me happy."],
   ["A", "Cool! What do you do in your free time?"],
   ["B", "I like to {draw}. How about you?"],
   ["A", "I like to {read}. What makes you sad?"],
   ["B", "{Rain} makes me sad. I can't play outside."],
   ["A", "Me too!"]
  ],
  swap: [["something happy", "dog"], ["your free-time activity", "draw"], ["your teacher's activity", "read"], ["something sad", "Rain"]],
  lang: [
   ["Say how you feel", ["I'm happy!", "I'm sad.", "I'm scared!"]],
   ["Show you care", ["Oh no!", "That's too bad.", "Are you OK?"]],
   ["Ask back", ["How about you?", "What about you?"]]
  ],
  langPractice: ["I got a new puppy!", "I lost my phone.", "I'm afraid of dogs.", "I got 100 on my test!", "My friend is sick.", "I'm going to Jeju!"],
  survey: {
   ask: "Are you afraid of",
   cols: ["Me", "My teacher"],
   rows: ["spiders", "the dark", "dogs", "big waves", "ghosts", "tests"],
   q: "Are you afraid of …?  → Yes, I am. / No, I'm not.",
   report: "I am afraid of ___, but my teacher ___."
  },
  gap: {
   who: "Sora",
   q: ["What makes Sora happy?", "What makes her sad?", "What is she afraid of?", "What is her goal?"],
   A: [["happy", "her cat"], ["sad", "?"], ["afraid of", "snakes"], ["goal", "?"]],
   B: [["happy", "?"], ["sad", "goodbyes"], ["afraid of", "?"], ["goal", "to be a vet"]],
   tip: "He / She → make<b>s</b> · like<b>s</b> · want<b>s</b>"
  },
  role: {
   A: ["You make a class video.", "Ask 5 feeling questions.", "Say \"Thank you!\" at the end."],
   B: ["You are a student.", "Answer with 2 sentences.", "Show your feelings with your face!"]
  },
  tts: {
   title: "Make a \"Happy List\"",
   steps: ["Think of 3 things that make you happy.", "Ask your teacher what makes him/her happy.", "Find one thing that is the same.", "Tell your list!"],
   lang: ["___ makes me happy.", "___ makes my teacher happy.", "We both like ___!"]
  },
  speech: {
   time: "1 min",
   model: ["Hello! I'm Yuna.", "My dog makes me happy.", "Rain makes me sad.", "I am afraid of spiders.", "My goal is to be a vet.", "Thank you!"],
   outline: ["Name", "Happy", "Sad", "Afraid of", "My goal"],
   check: ["Loud voice", "Happy face", "Say 5 things"]
  },
  pron: {
   cols: [["● •", ["happy", "angry", "teacher"]], ["• ●", ["afraid", "upset", "alone"]], ["• ● • •", ["invisible", "impossible", "unusual"]]],
   up: "Are you afraid of the dark?",
   down: "What makes you happy?"
  },
  review: ["I can talk about my feelings.", "I can use makes / make.", "I can ask \"What makes you…?\"", "I can say one more sentence."]
 },
 H: {
  steps: ["Answer", "Reason", "Example", "Ask back"],
  model: [
   ["People who are rude to others make me angry.", "Everyone deserves respect.", "Yesterday a man pushed an old lady on the bus.", "What makes you angry?"],
   ["Spending time with my friends makes me happy.", "We laugh at everything together.", "Last weekend we had a picnic by the river.", "What makes you happy?"],
   ["Saying goodbye to people makes me sad.", "I don't like losing people I care about.", "My best friend moved to Canada last year.", "Do goodbyes make you sad, too?"],
   ["I'm afraid of heights.", "I feel dizzy when I look down.", "I couldn't even walk on the glass floor of a tower.", "What are you afraid of?"],
   ["I like to play the guitar in my free time.", "It helps me relax after school.", "I'm learning a new song every week.", "What do you do in your free time?"],
   ["My goal in life is to start my own business.", "I want to be my own boss.", "I'd like to open a small cafe.", "What is your goal?"],
   ["First, I'd sneak into a concert.", "I could see my favorite band for free.", "Then I'd walk around a movie studio.", "Where would you go?"],
   ["First, I'd wish for good health for my family.", "Nothing is more important.", "Then I'd wish for world peace and a trip to space.", "What would your wishes be?"],
   ["I'd go to South America first.", "I want to see the Amazon rainforest.", "Then I'd travel to Italy for the food.", "Where would you go first?"],
   ["My favorite teacher was Mr. Park.", "He made history feel like a story.", "He even dressed up as a king once!", "Who was your favorite teacher?"]
  ],
  frame: [
   "… makes me angry because …",
   "… makes me happy. For example, …",
   "… makes me sad because …",
   "I'm afraid of … because … Once, …",
   "In my free time, I like to … It helps me …",
   "My goal in life is to … because …",
   "First, I'd … Then I'd …",
   "First, I'd wish for … Then …",
   "I'd go to … first because … Then …",
   "My favorite teacher is/was … because …"
  ],
  more: [
   ["How do you calm down when you're angry?", "Is it OK to show anger?", "Do small things make you angry?"],
   ["Can money make people happy?", "Are you happier now than as a child?", "What makes your family happy?"],
   ["Is it good to cry when you're sad?", "How do you cheer up a sad friend?", "Do sad songs help you?"],
   ["How can people face their fears?", "Were you afraid of anything as a child?", "Is fear ever useful?"],
   ["Do you have enough free time?", "Is it better to rest or be busy?", "What hobby would you like to try?"],
   ["Should goals be big or small?", "What stops people from reaching goals?", "Who helps you with your goals?"],
   ["Would being invisible be fun or lonely?", "Would you use it to help people?", "What would be the danger?"],
   ["Would you wish for money? Why?", "Can a wish change your life?", "What would you wish for a friend?"],
   ["Would you travel alone or with friends?", "What would you pack?", "Which country would be hardest?"],
   ["What makes a teacher great?", "Can a teacher change your life?", "Would you like to be a teacher?"]
  ],
  gram1: {
   chain: ["My best friend always ___s …", "My parents never ___ …"],
   ex: "T: My sister studies every night.<br>S: My parents watch TV every night.<br>T: My cat …"
  },
  gram2: {
   a: {
    title: "Ask 5 times",
    items: ["Does rain make you sad?", "Does your job make you tired?", "Do crowds make you nervous?", "Does music help you relax?", "Do your friends make you laugh?"],
    ans: "Yes, it does. / No, it doesn't. <b>+ a reason</b>"
   },
   b: {
    title: "Someone you know",
    big: "My friend enjoys ___, but she doesn't like ___. What does your friend enjoy?",
    ans: "Then ask: <b>What makes him/her angry?</b>"
   }
  },
  opener: { think: ["Do you show your feelings easily? Why or why not?", "Is it OK for adults to cry?", "Which feeling is the hardest to hide?"] },
  convo: [
   ["A", "You look a bit down. Are you OK?"],
   ["B", "Not really. My {best friend} moved away."],
   ["A", "Oh no. That's too bad. Where did she go?"],
   ["B", "To {Canada}. I miss her already."],
   ["A", "I understand. What usually makes you feel better?"],
   ["B", "{Playing the guitar} helps. How about you?"],
   ["A", "I go for a long walk. It clears my head."],
   ["B", "That's a good idea. Maybe I'll try it."],
   ["A", "Let's go for a walk and get {bubble tea}!"]
  ],
  swap: [["someone important", "best friend"], ["a country", "Canada"], ["something relaxing", "Playing the guitar"], ["a treat", "bubble tea"]],
  lang: [
   ["Describe feelings", ["I'm a bit down.", "I'm really excited!", "I'm so frustrated."]],
   ["Show sympathy", ["That's too bad.", "I know how you feel.", "That must be hard."]],
   ["Ask for more", ["What happened?", "How did that feel?", "Why do you think so?"]],
   ["Cheer someone up", ["Don't worry.", "It'll be OK.", "You can do it!"]]
  ],
  langPractice: ["I failed my driving test.", "I got a new job!", "My dog is sick.", "I'm scared of speaking in public.", "I lost my wallet.", "I'm going to travel alone."],
  survey: {
   ask: "Are you afraid of",
   cols: ["Me", "My teacher", "Why?"],
   rows: ["heights", "public speaking", "the dark", "insects", "deep water", "failure"],
   q: "Are you afraid of …? → Yes. → Ask: Why? / Since when?",
   report: "My teacher and I are both afraid of ___, but only I ___."
  },
  gap: {
   who: "Daniel",
   q: ["What makes Daniel happy?", "What makes him angry?", "What is he afraid of? Why?", "What does he do in his free time?", "What is his goal?"],
   A: [["happy", "cooking for friends"], ["angry", "?"], ["afraid of", "?"], ["free time", "plays tennis"], ["goal", "?"]],
   B: [["happy", "?"], ["angry", "people who lie"], ["afraid of", "flying — too high"], ["free time", "?"], ["goal", "to open a restaurant"]],
   tip: "He / She → make<b>s</b> · enjoy<b>s</b> · want<b>s</b>"
  },
  role: {
   A: ["You host a radio show about feelings.", "Ask 5 questions + 2 follow-ups.", "Sum up 3 things you learned."],
   B: ["You are a famous guest.", "Choose: singer / athlete / chef.", "Give reasons and a short story."]
  },
  tts: {
   title: "Plan a \"Stress-Free Day\"",
   steps: ["Think: what makes people stressed?", "Ask your teacher what makes him/her happy.", "Agree on 3 activities for the day.", "Present your plan in 1 minute."],
   lang: ["I think we should ___ because ___.", "That sounds good, but ___.", "So our plan is ___."]
  },
  speech: {
   time: "2 min",
   model: ["Hi everyone. Let me tell you who I really am.", "Time with friends makes me happy.", "Rude people make me angry.", "I'm afraid of heights. I can't even look down from a bridge.", "In my free time, I play the guitar to relax.", "My goal is to open a small cafe.", "If I had three wishes, one would be a trip to space.", "Thanks for listening! Any questions?"],
   outline: ["Hook — \"Let me tell you…\"", "Happy / angry", "A fear + story", "Free time", "Goal + reason", "A wish · ask for questions"],
   check: ["Clear voice", "Eye contact", "Reasons and examples", "Answer 1 question"]
  },
  pron: {
   cols: [["● •", ["angry", "travel", "teacher"]], ["• ●", ["afraid", "upset", "annoyed"]], ["• ● • •", ["invisible", "impossible", "emotional"]]],
   up: "Does your job make you tired?",
   down: "What makes your friend angry?"
  },
  review: ["I can answer in 4 parts.", "I can match subject and verb.", "I can show sympathy.", "I can talk about feelings and dreams."]
 }
};
