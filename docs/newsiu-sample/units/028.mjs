// SIU BASIC 028 — 단원 파일(8판 형식). 본보기 001.mjs 와 같은 모양.
// 원본과 다른 점:
//  Q1 "go on camping" → "go camping"
//  Q2 "What would you prefer automatic or manual transmission?" → "Do you prefer automatic or manual?"
//  Q5 "experience being broken hearted" → "have your heart broken"
//  Q8 "travel outside to your country" → "travel outside your country"
//  Q10 "When did you first had a sear?" → "When did you get your first scar?"
//  Keyword "Outside" 품사 noun → preposition (질문 속 쓰임), Experience noun → verb (질문 속 쓰임)
//  답 틀 문법 바로잡음: "was happened" → "happened", "I was first give a speech" → "I first gave a speech",
//   "My first part-time job is on" → "was in", "I've never got any scar" → "I've never had a scar"
export default {
 no: '028',
 title: 'When Did You First…?',
 book: 'SIU BASIC 028 - When did you first',
 next: '029 Would You Ever…?',
 cover: { h1: 'When Did', em: 'You First…?', goals: ['Talk about first times', 'Use at / on / in for time', 'Tell a first-time story'] },
 KW: [
  ['camping', 'noun', '캠핑', 'sleeping in a tent outside for fun'],
  ['drive', 'verb', '운전하다', 'to control a car and make it go'],
  ['accident', 'noun', '사고', 'something bad that happens by mistake'],
  ['date', 'noun', '데이트 · 날짜', 'a time you go out with someone you like'],
  ['experience', 'verb', '겪다 · 경험하다', 'to have something happen to you'],
  ['part-time', 'adjective', '시간제의 (아르바이트)', 'working only some hours of the day or week'],
  ['speech', 'noun', '연설 · 발표', 'a talk you give to a group of people'],
  ['outside', 'preposition', '~밖으로', 'not in a place; out of it'],
  ['bicycle', 'noun', '자전거', 'a bike with two wheels and pedals'],
  ['scar', 'noun', '흉터', 'a mark left on your skin after a cut heals']
 ],
 QS: [
  'When did you first go camping?',
  'When did you first drive a car? Do you prefer automatic or manual?',
  'When did you first have a car accident?',
  'When did you first go on a date?',
  'When did you first have your heart broken?',
  'When did you first have a part-time job?',
  'When did you first give a speech?',
  'When did you first travel outside your country?',
  'When did you first ride a bicycle?',
  'When did you get your first scar?'
 ],
 IMG_E: ['scene-words/12831', 'scene-words/12606', 'scene-words/16675', 'scene-words/16707', 'scene-words/16270', 'scene-words/16004', 'scene-words/14020', 'scene-words/12309', 'scene-words/18586', 'scene-words/21057'],
 IMG_H: ['scene-words/19387', 'scene-words/14007', 'scene-words/14932', 'scene-clips/7355', 'scene-words/16269', 'scene-clips/7423', 'scene-words/18040', 'scene-clips/5024', 'scene-words/15083', 'scene-words/21057'],
 PICS: { opener: 'scene-words/16787', talk: 'scene-clips/5037', group: 'scene-words/13106', speech: 'scene-words/16400', reporter: 'scene-words/18065', survey: 'scene-words/18056', pron: 'scene-words/12179', roleB: 'scene-words/19320', cover: 'scene-clips/7376', back: 'scene-clips/7417' },
 gram1: {
  can: 'say when with at / on / in',
  title: 'Time:',
  em: 'at · on · in',
  rules: [
   ['Clock time', 'I start school <b>at</b> 8 o\'clock.'],
   ['Day / date', 'See you <b>on</b> Friday.'],
   ['Month / year / season', 'The garden is lovely <b>in</b> spring.']
  ],
  hardNote: 'at night · at Christmas · last summer · next Monday (no preposition!)',
  say: ['We use at for a clock time, on for a day or date, and in for a month, year or season.', 'I start school at 8 o\'clock.', 'See you on Friday.', 'The garden is lovely in spring.']
 },
 gram2: {
  can: 'ask "When did you first…?"',
  cols: ['at · on · in', 'last · next · this (no preposition)'],
  rows: [
   ['+', 'I went camping <b>in</b> 2019.', 'I went camping <b>last</b> summer.'],
   ['−', 'I didn\'t drive <b>on</b> Monday.', 'I didn\'t drive <b>last</b> week.'],
   ['?', 'Did you travel <b>in</b> May?', 'Are you free <b>this</b> evening?']
  ]
 },
 gapCan: 'ask "When did she first…?"',
 role: { title: 'The', em: 'First-Time', tail: 'Talk Show', opener: 'Welcome to the show! Tell us about your very first trip.', a: 'Talk show host', b: 'Guest' },
 pron: { can: 'say -ed endings clearly', title: 'Three sounds of', em: '-ed', game: 'Teacher says a word → you point to the sound → you make a sentence: <i>"I first traveled in 2020."</i>' },
 E: {
  steps: ['Answer', 'More'],
  model: [
   ['I first went camping in 2022.', 'We slept in a tent by a river.'],
   ['I have never driven a car. I am too young!', 'I want to drive a red car someday.'],
   ['I have never had a car accident.', 'But I fell off my bike last year.'],
   ['I have never gone on a date.', 'I go to the park with my friends on Saturdays.'],
   ['I felt very sad in 2023.', 'My best friend moved to another city.'],
   ['I don\'t have a part-time job.', 'I help my mom at home on Sundays.'],
   ['I first gave a speech in second grade.', 'I talked about my dog.'],
   ['I first traveled outside Korea in 2021.', 'I went to Japan with my family.'],
   ['I first rode a bicycle at age six.', 'My dad helped me in the park.'],
   ['I got my first scar in winter.', 'I fell on the ice and cut my knee.']
  ],
  frame: [
   'I first went camping in ___.',
   'I have never driven a car. I want to drive a ___.',
   'I have never ___. / I had a small accident on ___.',
   'I go to the ___ with my friends on ___.',
   'I felt very sad in ___. My ___.',
   'I help my ___ on ___.',
   'I first gave a speech in ___. I talked about ___.',
   'I first traveled to ___ in ___.',
   'I first rode a bicycle at age ___.',
   'I got my first scar in ___. I ___.'
  ],
  bank: [
   ['2021', '2022', 'summer', 'the mountains'],
   ['red car', 'bus', 'truck', 'fast car'],
   ['had an accident', 'my bike', 'the stairs', 'ice'],
   ['park', 'mall', 'Saturdays', 'Sundays'],
   ['2023', 'friend moved', 'pet died', 'toy broke'],
   ['mom', 'dad', 'grandma', 'weekends'],
   ['first grade', 'second grade', 'my family', 'my pet'],
   ['Japan', 'China', 'the USA', 'Vietnam'],
   ['five', 'six', 'seven', 'eight'],
   ['summer', 'winter', 'fell down', 'cut my hand']
  ],
  more: [
   ['Where did you go?', 'Did you like it?'],
   ['What car do you want?', 'Who drives in your family?'],
   ['Were you OK?', 'Who helped you?'],
   ['What do you do there?', 'Who is your best friend?'],
   ['How did you feel better?', 'Who helped you?'],
   ['What job do you want?', 'How do you help at home?'],
   ['Were you nervous?', 'Who listened to you?'],
   ['What did you eat there?', 'Where do you want to go next?'],
   ['Who taught you?', 'Did you fall down?'],
   ['Where is your scar?', 'Did it hurt?']
  ],
  gram1: { chain: ['I get up at ___.', 'My birthday is on ___. / in ___.'], ex: 'T: I eat lunch at 12 o\'clock.<br>S: I go to bed at 9 o\'clock.<br>T: I …' },
  gram2: {
   a: { title: 'Ask 5 times', items: ['When is your birthday?', 'When do you get up?', 'When do you go to bed?', 'When is your English class?', 'When do you play outside?'], ans: 'Answer with <b>at / on / in</b> + one more sentence' },
   b: { title: 'Your first time', big: 'I first ___ in ___. It was ___.', ans: 'Then ask: <b>When did you first …?</b>' }
  },
  opener: { think: ['Look at the photo. What is she looking at?', 'Do you remember your first day at school?', 'What was your first pet or toy?'] },
  convo: [
   ['A', 'Look at this old photo! Is that you?'],
   ['B', 'Yes! It\'s my first {camping trip}.'],
   ['A', 'Wow! When did you go?'],
   ['B', 'I went in {2021}. I was {seven}.'],
   ['A', 'Did you like it?'],
   ['B', 'Yes, I loved it! We {cooked outside}.'],
   ['A', 'Cool! I want to try it too.']
  ],
  swap: [['a first time', 'camping trip'], ['a year', '2021'], ['your age', 'seven'], ['something you did', 'cooked outside']],
  lang: [
   ['Ask when', ['When did you …?', 'How old were you?']],
   ['Show interest', ['Wow!', 'Really?', 'That\'s cool!']],
   ['Say one more', ['It was fun!', 'I was scared.']]
  ],
  langPractice: ['I first swam in 2020.', 'I rode a horse last summer.', 'I went to Jeju in May.', 'I lost my tooth on Monday.', 'I fell off my bike.', 'I flew on a plane at age five.'],
  survey: {
   ask: 'Have you ever',
   cols: ['Me', 'My teacher'],
   rows: ['gone camping', 'ridden a horse', 'given a speech', 'flown on a plane', 'broken a bone', 'had a scar'],
   q: 'Have you ever …? → Yes, I have. / No, I haven\'t.',
   report: 'I have ___, but my teacher has ___.'
  },
  gap: {
   who: 'Sora',
   q: ['When did Sora first go camping?', 'When did she first ride a bike?', 'Where did she first travel?', 'When did she first give a speech?'],
   A: [['first camping', 'in 2020'], ['first bike ride', '?'], ['first trip', 'to Japan'], ['first speech', '?']],
   B: [['first camping', '?'], ['first bike ride', 'at age five'], ['first trip', '?'], ['first speech', 'in third grade']],
   tip: 'When did she <b>first</b> …? → She first <b>went</b> … <b>in</b> …'
  },
  role: {
   A: ['You are a talk show host.', 'Ask 5 "When did you first…?" questions.', 'Say "Wow!" and ask one more.'],
   B: ['You are a famous guest.', 'Choose: singer / soccer player / chef.', 'Answer with at / on / in.']
  },
  tts: {
   title: 'Make a "My First Times" timeline',
   steps: ['Pick 4 first times.', 'Ask your teacher about them, too.', 'Put them in order on a line.', 'Tell your timeline!'],
   lang: ['I first ___ in ___.', 'Then, in ___, I ___.', 'My teacher first ___ at age ___.']
  },
  speech: {
   time: '1 min',
   model: ['Hello! Let me tell you about my first times.', 'I first rode a bicycle at age six.', 'I first went camping in 2022.', 'We slept in a tent. It was fun!', 'I first traveled outside Korea in 2021.', 'Thank you!'],
   outline: ['Hello!', 'First time 1 + when', 'First time 2 + when', 'How did you feel?', 'Thank you!'],
   check: ['Loud voice', 'Use at / on / in', 'Say 5 things']
  },
  pron: {
   cols: [['/t/', ['camped', 'walked', 'fixed']], ['/d/', ['traveled', 'played', 'cried']], ['/ɪd/', ['started', 'visited', 'needed']]],
   up: 'Did you go camping?',
   down: 'When did you first drive?'
  },
  review: ['I can talk about my first times.', 'I can use at / on / in.', 'I can ask "When did you first…?"', 'I can say -ed words clearly.']
 },
 H: {
  steps: ['Answer', 'Reason', 'Example', 'Ask back'],
  model: [
   ['I first went camping in the summer of 2019.', 'My uncle loves nature, so he took me to Gangwon-do.', 'We set up a tent by a lake and cooked ramen outside.', 'Have you ever slept in a tent?'],
   ['I first drove a car in 2022, right after I got my license.', 'I prefer automatic because it\'s much easier in traffic.', 'On my first drive, I stalled a manual car three times.', 'Which do you prefer, automatic or manual?'],
   ['Luckily, I\'ve never had a serious car accident.', 'I think it\'s because my dad drives very carefully.', 'Once a taxi bumped our car at a red light, but no one was hurt.', 'Have you ever been in an accident?'],
   ['I first went on a date when I was seventeen.', 'I was nervous, so I planned everything carefully.', 'We watched a movie and ate tteokbokki after.', 'Do you remember your first date?'],
   ['I first had my heart broken in high school.', 'My first love moved to another country.', 'I listened to sad songs for weeks, but my friends cheered me up.', 'How do you get over a sad time?'],
   ['I got my first part-time job at a café in 2020.', 'I wanted to earn my own money for a trip.', 'I worked on weekends and learned to make latte art.', 'What was your first job?'],
   ['I first gave a speech in middle school.', 'I was running for class president.', 'My hands were shaking, but people clapped at the end.', 'Do you get nervous before a speech?'],
   ['I first traveled abroad in 2015.', 'My parents wanted to show me a different culture.', 'We saw the Eiffel Tower in Paris at night.', 'What was your first trip abroad?'],
   ['I first rode a bicycle when I was about seven.', 'My dad believed everyone should learn it young.', 'He held the seat and let go without telling me.', 'Who taught you to ride a bike?'],
   ['I got my first scar on my chin when I was four.', 'I was running too fast at the playground.', 'I hit the slide, and I needed three stitches.', 'Do you have a scar with a story?']
  ],
  frame: [
   'I first went camping in … because … We …',
   'I first drove in … I prefer … because …',
   'I\'ve never … / Once, on …, …',
   'I first went on a date at age … We …',
   'I first had my heart broken in … because …',
   'My first part-time job was in … at … I …',
   'I first gave a speech on/in … about …',
   'I first traveled to … in … because …',
   'I first rode a bike at age … Someone …',
   'I got my first scar on … when I …'
  ],
  more: [
   ['Would you rather camp in a tent or stay in a hotel? Why?', 'What is the best place for camping?', 'What do you need to bring on a camping trip?'],
   ['At what age should people start driving?', 'Will self-driving cars be safe?', 'What makes someone a good driver?'],
   ['What should you do right after an accident?', 'Why do most accidents happen?', 'Should phones be banned while driving?'],
   ['What is a perfect first date?', 'Should you split the bill on a date?', 'Is online dating a good idea?'],
   ['What helps people heal after a breakup?', 'Can a sad time make you stronger?', 'Should friends give advice or just listen?'],
   ['Should students have part-time jobs?', 'What can you learn from a part-time job?', 'What is a good first job for a teenager?'],
   ['Why are people afraid of public speaking?', 'How can you prepare for a good speech?', 'Who is a great speaker you know?'],
   ['When should kids first travel abroad?', 'What surprised you on your first trip?', 'Is it better to travel alone or with others?'],
   ['Is cycling a good way to get to work?', 'Should cities build more bike lanes?', 'What are the dangers of riding a bike?'],
   ['Are scars something to hide or to be proud of?', 'Would you remove a scar if you could?', 'What other things remind us of the past?']
  ],
  gram1: { chain: ['I usually wake up at ___ on weekdays.', 'In ___, I first ___.'], ex: 'T: I first flew on a plane in 2003.<br>S: I first flew on a plane at age nine.<br>T: I …' },
  gram2: {
   a: { title: 'Ask 5 times', items: ['When did you first use a smartphone?', 'When did you first cook a meal?', 'When did you first stay up all night?', 'When did you first see snow?', 'When did you first earn money?'], ans: 'Answer with <b>at / on / in / last</b> <b>+ a detail</b>' },
   b: { title: 'Next plans', big: 'Next month, I\'m going to ___. On ___, I ___. What about you?', ans: 'Then ask: <b>What are you doing this weekend?</b>' }
  },
  opener: {
   think: ['Why do we remember "first times" so clearly?', 'Which first time changed your life the most?', 'Is it better to try new things young or old? Why?']
  },
  convo: [
   ['A', 'I found some old photos. Guess what this is!'],
   ['B', 'Is that your first {trip to Japan}?'],
   ['A', 'Yes! It was on {my tenth birthday}.'],
   ['B', 'No way! How did it feel?'],
   ['A', 'Honestly, I was {a little scared}. Everything was new.'],
   ['B', 'I know that feeling. My first {camping trip} was the same.'],
   ['A', 'Really? When did you go?'],
   ['B', 'In 2018. It rained the whole time!'],
   ['A', 'Ha! That\'s the kind of memory you never forget.']
  ],
  swap: [['a first trip', 'trip to Japan'], ['a date / day', 'my tenth birthday'], ['a feeling', 'a little scared'], ['another first time', 'camping trip']],
  lang: [
   ['Ask for details', ['When exactly was that?', 'How old were you?', 'What happened next?']],
   ['React', ['No way!', 'That sounds scary!', 'I know that feeling.']],
   ['Remember', ['If I remember right, …', 'I\'m not sure, but I think …']],
   ['Tell a story', ['At first, …', 'In the end, …']]
  ],
  langPractice: ['I first drove on the highway last week.', 'I broke my arm in 2015.', 'I gave a speech at a wedding.', 'I got lost in Tokyo on my first trip.', 'My first job was at a bakery.', 'I have a scar on my knee.'],
  survey: {
   ask: 'Have you ever',
   cols: ['Me', 'My teacher', 'When? (at/on/in)'],
   rows: ['gone camping', 'driven a car', 'had a part-time job', 'given a speech', 'traveled alone', 'broken a bone'],
   q: 'Have you ever …? → Yes. → Ask: When did you first…? / What happened?',
   report: 'My teacher first ___ in ___, but I first ___ on ___.'
  },
  gap: {
   who: 'Sora',
   q: ['When did Sora first travel abroad? Where?', 'When did she get her first job?', 'Why was her first speech special?', 'How did she get her scar?', 'When did she first drive?'],
   A: [['first trip abroad', 'on New Year\'s Day, 2016 — Vietnam'], ['first job', '?'], ['first speech', 'at her sister\'s wedding'], ['first scar', '?'], ['first drive', '?']],
   B: [['first trip abroad', '?'], ['first job', 'in 2019 — at a bookstore'], ['first speech', '?'], ['first scar', 'fell off a bike at age 8'], ['first drive', 'last spring, in the rain']],
   tip: 'When did she first …? → She first <b>went</b> … <b>on / in / at</b> …'
  },
  role: {
   A: ['You host a TV talk show.', 'Ask 5 "When did you first…?" questions + 2 follow-ups.', 'Summarize the guest\'s best story.'],
   B: ['You are a famous guest.', 'Choose: an actor / an athlete / an explorer.', 'Tell stories with dates. Keep one surprise for the end.']
  },
  tts: {
   title: 'Plan a "Firsts" podcast episode',
   steps: ['Choose 3 "first time" topics.', 'Interview your teacher about them.', 'Pick the best story and why it matters.', 'Present the episode in 1 minute.'],
   lang: ['The most interesting story was ___ because ___.', 'That\'s true, but ___.', 'Let\'s start with ___.']
  },
  speech: {
   time: '2 min',
   model: ['Today, I\'ll share three first times.', 'I first traveled abroad in 2015, to Paris.', 'It made me want to learn languages.', 'In 2020, I got my first job at a café.', 'It taught me to be patient.', 'Last spring, I first drove on the highway.', 'Each first time was scary, but it made me braver.', 'Thanks! What was your most important first?'],
   outline: ['Hook — "Three first times…"', 'First time 1 + date + lesson', 'First time 2 + date + lesson', 'First time 3 + date + lesson', 'What they taught you', 'Ask a question'],
   check: ['Clear voice', 'Correct at / on / in', 'Reasons and details', 'Answer 1 question']
  },
  pron: {
   cols: [['/t/', ['stopped', 'crashed', 'worked']], ['/d/', ['traveled', 'arrived', 'moved']], ['/ɪd/', ['started', 'visited', 'decided']]],
   up: 'Did you enjoy your first job?',
   down: 'When did you first give a speech?'
  },
  review: ['I can tell a first-time story with details.', 'I can use at / on / in and last / next.', 'I can ask follow-up questions.', 'I can give a 2-minute talk about first times.']
 }
};
