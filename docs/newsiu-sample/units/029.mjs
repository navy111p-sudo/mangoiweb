// SIU BASIC 029 — 단원 파일(8판 형식). 본보기 001.mjs 와 같은 모양.
// 원본과 다른 점:
//  Q3 "Would you eat a cricket for $500?" → "Would you ever eat a cricket for $500?" (다른 질문과 맞춤)
//  Keyword "Alone" 품사 adj → adverb (질문 속 쓰임 "walk home alone")
//  Keyword "Surgery" 뜻에 plastic surgery(성형 수술) 쓰임을 함께 적음
//  답 틀 문법 바로잡음: "Yes I Lied about" → "Yes, I would. Once I lied about…", "lie on my friend" → "lie to my friend",
//   "Yes I can, and No I cant" → "Yes, I would. / No, I wouldn't.", "I will considered it" → "I would consider it",
//   "No I dont want because" → "No, I wouldn't, because", "Yes, I will slap" → "Yes, I would"
export default {
 no: '029',
 title: 'Would You Ever…?',
 book: 'SIU BASIC 029 - Would you ever',
 next: '030 Greatest, Most and Best',
 cover: { h1: 'Would You', em: 'Ever…?', goals: ['Talk about brave or strange choices', 'Use for / since / until', 'Give reasons for yes or no'] },
 KW: [
  ['lie', 'noun', '거짓말', 'something you say that is not true'],
  ['alone', 'adverb', '혼자', 'with no one else'],
  ['cricket', 'noun', '귀뚜라미', 'a small insect that jumps and chirps'],
  ['hitchhiker', 'noun', '히치하이커', 'someone who asks drivers for a free ride'],
  ['skydiving', 'noun', '스카이다이빙', 'jumping from a plane with a parachute'],
  ['surgery', 'noun', '수술 (성형 수술)', 'when a doctor opens the body to fix or change it'],
  ['book', 'noun', '책', 'pages with words, put together inside a cover'],
  ['stay', 'verb', '머무르다', 'to remain in one place'],
  ['slap', 'verb', '(손바닥으로) 때리다', 'to hit someone with an open hand'],
  ['feed', 'verb', '먹이를 주다', 'to give food to a person or an animal']
 ],
 QS: [
  'Would you ever lie to help a friend?',
  'Would you ever walk home alone at night?',
  'Would you ever eat a cricket for $500?',
  'Would you ever pick up a hitchhiker on the road?',
  'Would you ever consider going skydiving?',
  'Would you ever consider plastic surgery if a friend suggested it to you?',
  'Would you ever consider writing your own book?',
  'Would you ever try staying in the jungle for a month?',
  'Would you ever slap someone for something they said?',
  'Would you ever feed the animals at the zoo?'
 ],
 IMG_E: ['scene-words/16307', 'scene-words/17103', 'scene-words/17212', 'scene-words/16173', 'scene-words/12769', 'scene-words/13318', 'scene-words/12002', 'scene-words/16315', 'scene-words/18145', 'scene-words/15836'],
 IMG_H: ['scene-words/16307', 'scene-words/15583', 'scene-words/17210', 'scene-words/12730', 'scene-words/15318', 'scene-words/18281', 'scene-words/19297', 'scene-words/19487', 'scene-words/14680', 'scene-words/18148'],
 PICS: { opener: 'scene-words/12576', talk: 'scene-words/12575', group: 'scene-words/19495', speech: 'scene-words/15095', reporter: 'scene-words/13053', survey: 'scene-words/17158', pron: 'scene-clips/7330', roleB: 'scene-words/21313', cover: 'scene-words/15318', back: 'scene-clips/7324' },
 gram1: {
  can: 'say how long with for / since / until',
  title: 'Time:',
  em: 'for · since',
  rules: [
   ['Start → end', 'I work <b>from</b> 9 <b>to</b> 5.'],
   ['Up to a time', 'Wait <b>until</b> I come back.'],
   ['Starting point', 'He\'s been here <b>since</b> Monday.'],
   ['Length of time', 'We stayed <b>for</b> three days.']
  ],
  hardNote: 'since 2020 (a point) · for a month (a length)',
  say: ['We use from, to, until, since and for to talk about how long something lasts.', 'I work from 9 to 5.', 'Wait until I come back.', 'He\'s been here since Monday.', 'We stayed for three days.']
 },
 gram2: {
  can: 'ask "Would you ever…?" and "How long…?"',
  cols: ['for + a length', 'since / until / from…to'],
  rows: [
   ['+', 'I\'d stay <b>for</b> a month.', 'I\'ve lived here <b>since</b> 2020.'],
   ['−', 'I wouldn\'t stay <b>for</b> a week.', 'I won\'t be home <b>until</b> 6.'],
   ['?', 'Would you stay <b>for</b> a month?', 'Were you there <b>from</b> May <b>to</b> June?']
  ]
 },
 gapCan: 'ask "Would he ever…?"',
 role: { title: 'The', em: 'Adventure', tail: 'Interview', opener: 'So, would you ever jump out of a plane for a TV show?', a: 'TV reporter', b: 'Adventurer' },
 pron: { can: 'link "would you" and say I\'d / wouldn\'t', title: 'Say it', em: 'smoothly', game: 'Teacher says a word → you point to the group → you make a question: <i>"Would you ever sing on stage?"</i>' },
 E: {
  steps: ['Answer', 'More'],
  model: [
   ['No, I wouldn\'t. Lying is wrong.', 'I would help my friend in a different way.'],
   ['No, I wouldn\'t. It is too dark and scary.', 'I would walk home with my mom.'],
   ['Yes, I would! $500 is a lot of money.', 'I would buy a new bike.'],
   ['No, I wouldn\'t. I don\'t know the person.', 'My parents say it is not safe.'],
   ['Yes, I would. It looks exciting!', 'I want to fly like a bird.'],
   ['No, I wouldn\'t. I like my face!', 'I would say, "No, thank you."'],
   ['Yes, I would. I love stories.', 'My book would be about a magic cat.'],
   ['No, I wouldn\'t. There are too many bugs!', 'I would stay for one night only.'],
   ['No, I wouldn\'t. Hitting is wrong.', 'I would tell a teacher.'],
   ['Yes, I would! I love animals.', 'I would feed the giraffes.']
  ],
  frame: [
   'Yes, I would. / No, I wouldn\'t. Lying is ___.',
   'No, I wouldn\'t. It is too ___.',
   'Yes, I would! I would buy a ___.',
   'No, I wouldn\'t. It is not ___.',
   'Yes, I would. / No, I wouldn\'t. It looks ___.',
   'No, I wouldn\'t. I like my ___!',
   'Yes, I would. My book would be about ___.',
   'I would stay in the jungle for ___.',
   'No, I wouldn\'t. I would ___.',
   'Yes, I would! I would feed the ___.'
  ],
  bank: [
   ['wrong', 'bad', 'OK', 'sometimes OK'],
   ['dark', 'scary', 'cold', 'far'],
   ['bike', 'game', 'phone', 'puppy'],
   ['safe', 'smart', 'OK', 'good'],
   ['exciting', 'scary', 'fun', 'dangerous'],
   ['face', 'nose', 'eyes', 'smile'],
   ['a magic cat', 'dinosaurs', 'my family', 'space'],
   ['one night', 'one week', 'a month', 'a day'],
   ['tell a teacher', 'walk away', 'say "Stop!"', 'talk to my mom'],
   ['giraffes', 'monkeys', 'rabbits', 'elephants']
  ],
  more: [
   ['Have you ever told a lie?', 'Who is your best friend?'],
   ['Who walks home with you?', 'Are you scared of the dark?'],
   ['What bug would you never eat?', 'What would you buy?'],
   ['How do you get to school?', 'Who drives you?'],
   ['Are you scared of high places?', 'Have you been on a plane?'],
   ['What do you like about you?', 'Who is the most beautiful person to you?'],
   ['What is your favorite book?', 'What would your book be called?'],
   ['What would you eat there?', 'What animal would you see?'],
   ['What makes you angry?', 'How do you calm down?'],
   ['What is your favorite zoo animal?', 'When did you last go to the zoo?']
  ],
  gram1: { chain: ['I go to school from ___ to ___.', 'I have lived here since ___.'], ex: 'T: I watch TV for one hour.<br>S: I play games for 30 minutes.<br>T: I …' },
  gram2: {
   a: { title: 'Ask: Would you ever…?', items: ['eat a bug', 'touch a snake', 'sing on stage', 'swim in the sea', 'sleep in a tent'], ans: 'Yes, I would. / No, I wouldn\'t. <b>+ one reason</b>' },
   b: { title: 'How long?', big: 'I have studied English for ___.', ans: 'Then ask: <b>How long have you …?</b>' }
  },
  opener: { think: ['Look at the photo. Which door would you open?', 'Are you brave? When?', 'What is one thing you would never do?'] },
  convo: [
   ['A', 'Would you ever eat a {cricket}?'],
   ['B', 'No way! That\'s {gross}!'],
   ['A', 'What if I gave you {$100}?'],
   ['B', 'Hmm... Yes, I would!'],
   ['A', 'Ha ha! What would you buy?'],
   ['B', 'I would buy a {new game}. How about you?'],
   ['A', 'I would never eat it. Not for $1,000!']
  ],
  swap: [['something strange to eat', 'cricket'], ['a feeling word', 'gross'], ['some money', '$100'], ['something to buy', 'new game']],
  lang: [
   ['Say yes', ['Sure!', 'Why not?', 'Yes, I would!']],
   ['Say no', ['No way!', 'Never!', 'I don\'t think so.']],
   ['Give a reason', ['… because it\'s scary.', 'It looks fun!']]
  ],
  langPractice: ['I would eat a bug.', 'I would never ride a rollercoaster.', 'I would stay in a tent for a week.', 'I would swim with sharks.', 'I would sing on TV.', 'I would never touch a snake.'],
  survey: {
   ask: 'Would you ever',
   cols: ['Me', 'My teacher'],
   rows: ['eat a bug', 'sleep in a tent', 'sing on stage', 'touch a snake', 'swim in the sea', 'stay up all night'],
   q: 'Would you ever …? → Yes, I would. / No, I wouldn\'t.',
   report: 'I would ___. My teacher wouldn\'t.'
  },
  gap: {
   who: 'Jake',
   q: ['Would Jake ever eat a cricket?', 'Would he ever go skydiving?', 'Would he ever stay in the jungle?', 'Would he ever write a book?'],
   A: [['eat a cricket', 'Yes — for $50'], ['go skydiving', '?'], ['stay in the jungle', 'Yes — for a week'], ['write a book', '?']],
   B: [['eat a cricket', '?'], ['go skydiving', 'No — too scary'], ['stay in the jungle', '?'], ['write a book', 'Yes — about dogs']],
   tip: 'He / She → <b>would</b> · <b>wouldn\'t</b> (no -s!)'
  },
  role: {
   A: ['You are a TV reporter.', 'Ask 5 "Would you ever…?" questions.', 'Ask "Why?" every time.'],
   B: ['You are a brave adventurer.', 'Choose: jungle / sea / sky.', 'Answer: Yes, I would / No, I wouldn\'t + why.']
  },
  tts: {
   title: 'Make a "Brave Level" chart',
   steps: ['Pick 5 things from this unit.', 'Ask your teacher: Would you ever…?', 'Put them from easy to scary.', 'Show and tell your chart!'],
   lang: ['The scariest one is ___.', 'I would ___, but I would never ___.', 'My teacher is braver than me!']
  },
  speech: {
   time: '1 min',
   model: ['Hello! I want to talk about brave things.', 'I would feed the animals at the zoo.', 'I would stay in a tent for a week.', 'But I would never eat a cricket!', 'It looks too gross.', 'Thank you!'],
   outline: ['Hello!', 'I would … (1)', 'I would … (2)', 'I would never …', 'Why?'],
   check: ['Loud voice', 'Use would / wouldn\'t', 'Give a reason']
  },
  pron: {
   cols: [['would you', ['Would you…?', 'Could you…?', 'Did you…?']], ['I\'d', ['I\'d', 'you\'d', 'she\'d']], ['-n\'t', ['wouldn\'t', 'couldn\'t', 'don\'t']]],
   up: 'Would you eat a cricket?',
   down: 'Why would you do that?'
  },
  review: ['I can answer "Would you ever…?"', 'I can say why or why not.', 'I can use for / since / until.', 'I can say "would you" smoothly.']
 },
 H: {
  steps: ['Answer', 'Reason', 'Example', 'Ask back'],
  model: [
   ['Yes, I would, but only a small, harmless lie.', 'Sometimes the truth can hurt a friend for no reason.', 'I once said I loved my friend\'s ugly sweater — she knitted it herself!', 'Is a white lie ever OK to you?'],
   ['It depends on where I am.', 'In my neighborhood, the streets are bright and busy until midnight.', 'But in a new city, I would always take a taxi.', 'Do you feel safe walking at night?'],
   ['Honestly, yes, I would.', 'Many people in the world eat insects, and they\'re full of protein.', 'I tried a fried silkworm in Seoul once, and it wasn\'t bad.', 'Would you do it for less money?'],
   ['No, I wouldn\'t, unless it was an emergency.', 'I can\'t know if a stranger is safe.', 'If someone had a broken-down car, I\'d call for help instead.', 'Have you ever seen a hitchhiker?'],
   ['I would definitely consider it.', 'I\'ve wanted to try it since I was a kid.', 'My cousin jumped in Australia and said it was the best 60 seconds of her life.', 'What is the scariest thing you\'d try?'],
   ['No, I wouldn\'t, even if a friend suggested it.', 'I think confidence matters more than a perfect face.', 'A real friend would like me for who I am.', 'What do you think about plastic surgery?'],
   ['Yes, I\'d love to write a book someday.', 'I have many stories from my travels.', 'I\'ve kept a diary since 2018, so I already have ideas.', 'What would your book be about?'],
   ['Maybe for a week, but not for a month.', 'I love nature, but I need a bed and hot water.', 'I stayed in a jungle lodge in Borneo for three days, and that was enough.', 'How long could you last in the wild?'],
   ['No, I wouldn\'t. Violence never solves anything.', 'Words can hurt, but I\'d rather walk away and calm down.', 'Once, a classmate insulted me, and I talked to a teacher instead.', 'How do you deal with rude people?'],
   ['Yes, I would, if the zookeepers allowed it.', 'It\'s a great way to learn about animals up close.', 'At a farm zoo, I fed carrots to a giraffe with a long purple tongue!', 'Should visitors be allowed to feed zoo animals?']
  ],
  frame: [
   'Yes, I would, if … / No, I wouldn\'t, because …',
   'It depends on … In …, I would …',
   'Honestly, … because … Once, I …',
   'No, I wouldn\'t, unless … Instead, I\'d …',
   'I would (never) consider it. I\'ve … since …',
   'No, I wouldn\'t, even if … because …',
   'Yes, I\'d love to … My book would be about …',
   'Maybe for …, but not for … because …',
   'No, I wouldn\'t. I\'d rather … Once, …',
   'Yes, I would, if … At …, I …'
  ],
  more: [
   ['What is the difference between a white lie and a big lie?', 'Have you ever been caught lying?', 'Can honesty ever be unkind?'],
   ['Is your city safe at night? Why?', 'What makes a street feel safe?', 'Should teens have a curfew?'],
   ['Will insects be a common food in the future?', 'What is the strangest food you\'ve eaten?', 'What would you never eat, even for $10,000?'],
   ['Why was hitchhiking more common in the past?', 'Would you ever ask for a ride from a stranger?', 'How do people travel cheaply today?'],
   ['Why do people enjoy scary activities?', 'What is on your bucket list?', 'Should dangerous sports need a license?'],
   ['Why is plastic surgery so popular in Korea?', 'Is it OK for teenagers to have it?', 'Do social media make people care too much about looks?'],
   ['What makes a book a bestseller?', 'Paper books or e-books — which do you prefer?', 'Should everyone write down their life story?'],
   ['What three things would you bring to the jungle?', 'What is the most dangerous animal there?', 'Could you live without your phone for a month?'],
   ['Is it ever OK to use violence?', 'What should you do when someone insults you?', 'Why do words sometimes hurt more than actions?'],
   ['Are zoos good or bad for animals?', 'Why shouldn\'t people feed wild animals?', 'Which animal would you like to take care of?']
  ],
  gram1: { chain: ['I have lived in ___ since ___.', 'I would stay in ___ for ___.'], ex: 'T: I\'ve taught English for ten years.<br>S: I\'ve studied English since 2019.<br>T: I …' },
  gram2: {
   a: { title: 'Ask 5 times', items: ['Would you ever live abroad for a year?', 'Would you ever quit your phone for a week?', 'Would you ever work from 6 a.m. to 2 p.m.?', 'Would you ever stay up until sunrise?', 'Would you ever run a marathon?'], ans: 'Yes, I would, if … / No, I wouldn\'t, because … <b>+ how long</b>' },
   b: { title: 'Since or for?', big: 'I\'ve known my best friend ___ (since / for) ___. We\'ve been close ___.', ans: 'Then ask: <b>How long have you known …?</b>' }
  },
  opener: {
   think: ['Why do people choose to do scary or risky things?', 'What would you never do, even for a lot of money?', 'Do our choices show who we really are? Why?']
  },
  convo: [
   ['A', 'OK, quick question. Would you ever {go skydiving}?'],
   ['B', 'Hmm, maybe. I\'ve wanted to try it for {years}.'],
   ['A', 'Really? I thought you were afraid of heights!'],
   ['B', 'I am, a little. But I\'d do it with {a good instructor}.'],
   ['A', 'Brave! Would you ever {eat a cricket}, though?'],
   ['B', 'No way. Not until I\'m starving!'],
   ['A', 'Ha! So you\'d jump from a plane but not eat a bug?'],
   ['B', 'Exactly. Everyone has limits. What about you?'],
   ['A', 'I\'d eat the bug, but I\'d stay on the ground!']
  ],
  swap: [['a risky activity', 'go skydiving'], ['a length of time', 'years'], ['a condition', 'a good instructor'], ['a strange challenge', 'eat a cricket']],
  lang: [
   ['Set a condition', ['Only if …', 'It depends on …', 'Maybe, unless …']],
   ['Refuse strongly', ['Not in a million years!', 'No way, not even for …']],
   ['Explain', ['The main reason is …', 'For me, …']],
   ['Challenge', ['Really? Even if …?', 'What if …?']]
  ],
  langPractice: ['I would eat a bug for $100.', 'I\'d never go skydiving.', 'I would live in the jungle for a year.', 'I would get plastic surgery.', 'I\'d lie to protect a friend.', 'I would pick up a hitchhiker.'],
  survey: {
   ask: 'Would you ever',
   cols: ['Me', 'My teacher', 'Only if…?'],
   rows: ['eat an insect', 'go skydiving', 'live abroad for a year', 'write a book', 'lie to protect a friend', 'give up your phone for a month'],
   q: 'Would you ever …? → Maybe. → Ask: Only if what? / Why not?',
   report: 'My teacher would ___ only if ___, but I would never ___.'
  },
  gap: {
   who: 'Jake',
   q: ['Would Jake ever go skydiving? Why?', 'How long would he stay in the jungle?', 'Would he ever lie to a friend?', 'What would his book be about?', 'Since when has he wanted a pet?'],
   A: [['skydiving', 'Yes — he\'s wanted to since age 10'], ['jungle', '?'], ['lie to a friend', 'only a white lie'], ['book', '?'], ['wants a pet', '?']],
   B: [['skydiving', '?'], ['jungle', 'for two weeks, not a month'], ['lie to a friend', '?'], ['book', 'his trip across Asia'], ['wants a pet', 'since 2021']],
   tip: 'Would he ever …? → He <b>would</b> … <b>for</b> a week / <b>since</b> 2021'
  },
  role: {
   A: ['You report for an adventure TV show.', 'Ask 5 "Would you ever…?" questions + 2 "What if…?"', 'Decide: is the guest brave or careful?'],
   B: ['You are an adventurer.', 'Choose: jungle explorer / skydiver / deep-sea diver.', 'Use "only if" and "for / since". Keep one fear secret — tell it only if asked twice.']
  },
  tts: {
   title: 'Create a "Would You Ever?" challenge list',
   steps: ['Brainstorm 6 challenges, from easy to extreme.', 'Ask your teacher about each one.', 'Agree on the 3 best for a TV show.', 'Present the list and why in 1 minute.'],
   lang: ['I\'d include ___ because ___.', 'That\'s too dangerous — what about ___?', 'We both agree that ___.']
  },
  speech: {
   time: '2 min',
   model: ['Today, I\'ll tell you where my limits are.', 'I would go skydiving. I\'ve wanted to since I was ten.', 'I would also stay in the jungle, but only for a week.', 'I need hot water and a real bed!', 'But I would never slap anyone, even an angry customer.', 'I believe calm words work better than violence.', 'So, I\'m brave, but I\'m also careful.', 'Thanks! What would you never do?'],
   outline: ['Hook — "My limits…"', 'Something I would do + since/for', 'Something with a condition', 'Something I would never do', 'What this shows about me', 'Ask a question'],
   check: ['Clear voice', 'would / wouldn\'t / only if', 'Reasons and examples', 'Answer 1 question']
  },
  pron: {
   cols: [['would you', ['Would you…?', 'Could you…?', 'Should you…?']], ['I\'d', ['I\'d', 'we\'d', 'they\'d']], ['-n\'t', ['wouldn\'t', 'couldn\'t', 'shouldn\'t']]],
   up: 'Would you ever go skydiving?',
   down: 'What would you never do?'
  },
  review: ['I can answer with conditions (only if / unless).', 'I can use for / since / until / from…to.', 'I can challenge an idea with "What if…?"', 'I can talk about my limits for 2 minutes.']
 }
};
