// SIU BASIC 030 — 단원 파일(8판 형식). 본보기 001.mjs 와 같은 모양. 마지막 단원이라 next: ''.
// 원본과 다른 점:
//  Q2 "Who is the greatest leader in the past?" → "Who is the greatest leader of the past?"
//  Q6 "What place most people visited to your country?" → "What is the most visited place in your country?"
//  Q7 물음표 빠짐 → "What is the most disgusting food in your country?"
//  Q8 "learn new language" → "learn a new language?"
//  Q10 "what is the best way to fall asleep as fast as possible" → 대문자·물음표 바로잡음
//  Keyword "Past" 품사 adj → noun (고친 질문 속 쓰임), "Master" 영어 뜻(형용사 뜻이 적혀 있었음) → 명사 뜻
//  답 틀 문법 바로잡음: "The great pop singer I ever know is" → "The greatest pop singer I know is",
//   "Karate maste" → "karate master", "its because" → "it's because", "The workout for me to Lose weight is" → "The best workout to lose weight is"
export default {
 no: '030',
 title: 'Greatest, Most and Best',
 book: 'SIU BASIC 030 - Greatest, Most and Best',
 next: '',
 cover: { h1: 'Greatest, Most', em: 'and Best', goals: ['Talk about the best and greatest', 'Use before / after / by', 'Give your opinion with reasons'] },
 KW: [
  ['great', 'adjective', '위대한 · 훌륭한', 'very good or very important'],
  ['past', 'noun', '과거', 'the time before now'],
  ['master', 'noun', '달인 · 사범', 'a person with great skill at something'],
  ['restaurant', 'noun', '식당', 'a place where you pay to eat a meal'],
  ['boxer', 'noun', '권투 선수', 'a person who fights in the sport of boxing'],
  ['visit', 'verb', '방문하다', 'to go to see a place or a person'],
  ['disgusting', 'adjective', '역겨운', 'very bad to taste, smell or see'],
  ['language', 'noun', '언어', 'the words people use to speak and write'],
  ['workout', 'noun', '운동', 'a time of hard exercise'],
  ['asleep', 'adjective', '잠든', 'sleeping']
 ],
 QS: [
  'Who is the greatest pop singer?',
  'Who is the greatest leader of the past?',
  'Who is the greatest karate master?',
  'What restaurant has the most delicious food you have ever eaten?',
  'Who is the greatest boxer?',
  'What is the most visited place in your country?',
  'What is the most disgusting food in your country?',
  'What is the best way to learn a new language?',
  'What is the best workout to lose weight?',
  'What is the best way to fall asleep as fast as possible?'
 ],
 IMG_E: ['scene-words/16261', 'scene-words/20151', 'scene-words/14417', 'scene-clips/5020', 'scene-words/12785', 'scene-words/15170', 'scene-words/19495', 'scene-words/12479', 'scene-words/18708', 'scene-words/13276'],
 IMG_H: ['scene-words/13186', 'scene-words/20151', 'scene-words/14417', 'scene-words/18837', 'scene-words/14725', 'scene-words/19006', 'scene-words/12951', 'scene-words/18510', 'scene-words/19267', 'scene-words/12417'],
 PICS: { opener: 'scene-words/18282', talk: 'scene-words/19100', group: 'scene-words/18645', speech: 'scene-words/18661', reporter: 'scene-words/18065', survey: 'scene-words/15761', pron: 'scene-words/16053', roleB: 'scene-words/16722', cover: 'scene-words/12870', back: 'scene-words/19658' },
 gram1: {
  can: 'say when with before / after / by',
  title: 'Time:',
  em: 'before · after',
  rules: [
   ['Earlier', 'I get nervous <b>before</b> exams.'],
   ['Later', 'We ate <b>after</b> shopping.'],
   ['Two times', 'Call me <b>between</b> 1 and 3.'],
   ['Not later than', 'Finish it <b>by</b> Friday.'],
   ['Until then', '<b>Up to</b> now, it\'s fine.']
  ],
  hardNote: 'by 6 = at 6 or earlier',
  say: ['Before, after, between, by and up to tell us about time.', 'I get nervous before exams.', 'We ate after shopping.', 'Call me between 1 and 3.', 'Finish it by Friday.', 'Up to now, it\'s fine.']
 },
 gram2: {
  can: 'plan my day with before / after / by',
  cols: ['before · after', 'between · by · up to'],
  rows: [
   ['+', 'I stretch <b>before</b> a workout.', 'Call me <b>between</b> 2 and 4.'],
   ['−', 'Don\'t eat <b>after</b> 9 p.m.', 'I can\'t finish <b>by</b> Monday.'],
   ['?', 'Do you read <b>before</b> bed?', 'Can you come <b>by</b> 6?']
  ]
 },
 gapCan: 'ask "What is his favorite…?"',
 role: { title: 'The', em: 'Best of Korea', tail: 'Tour', opener: 'Hi! What\'s the best place to visit in Korea?', a: 'Travel blogger', b: 'Local guide' },
 pron: { can: 'say "the" and -est clearly', title: 'Say', em: 'the best', game: 'Teacher says a word → you point to the sound → you make a sentence: <i>"The easiest way is…"</i>' },
 E: {
  steps: ['Answer', 'More'],
  model: [
   ['The greatest pop singer is IU.', 'Her songs are beautiful.'],
   ['The greatest leader of the past is King Sejong.', 'He made Hangeul.'],
   ['The greatest karate master is my teacher.', 'He is strong and kind.'],
   ['The best restaurant is a pizza place near my house.', 'The pizza is very cheesy.'],
   ['The greatest boxer is Muhammad Ali.', 'My dad told me about him.'],
   ['The most visited place is Gyeongbokgung Palace.', 'Many people wear hanbok there.'],
   ['The most disgusting food is silkworm pupae.', 'They smell bad to me!'],
   ['The best way is to watch cartoons in English.', 'It is fun and easy.'],
   ['The best workout is jumping rope.', 'I do it after school.'],
   ['The best way is to read a book before bed.', 'I fall asleep fast.']
  ],
  frame: [
   'The greatest pop singer is ___. Her/His songs are ___.',
   'The greatest leader of the past is ___. He/She ___.',
   'The greatest karate master is ___.',
   'The best restaurant is ___. The ___ is yummy.',
   'The greatest boxer is ___.',
   'The most visited place is ___.',
   'The most disgusting food is ___. It ___.',
   'The best way is to ___ in English.',
   'The best workout is ___.',
   'The best way is to ___ before bed.'
  ],
  bank: [
   ['IU', 'BTS', 'fun', 'beautiful'],
   ['King Sejong', 'Admiral Yi', 'made Hangeul', 'was brave'],
   ['my teacher', 'my dad', 'Bruce Lee', 'my coach'],
   ['a pizza place', 'a noodle shop', 'pizza', 'chicken'],
   ['Muhammad Ali', 'Manny Pacquiao', 'my uncle', 'I don\'t know'],
   ['Gyeongbokgung', 'Jeju Island', 'Namsan Tower', 'Lotte World'],
   ['silkworm pupae', 'raw fish', 'smells bad', 'tastes bad'],
   ['watch cartoons', 'sing songs', 'read books', 'talk'],
   ['jumping rope', 'running', 'swimming', 'dancing'],
   ['read a book', 'drink warm milk', 'listen to music', 'count sheep']
  ],
  more: [
   ['What is your favorite song?', 'Can you sing it?'],
   ['Why is he great?', 'Who do you want to meet?'],
   ['Can you do karate?', 'What sport do you do?'],
   ['What do you order there?', 'Who do you go with?'],
   ['Do you like boxing?', 'Who is the strongest person you know?'],
   ['Have you been there?', 'What did you see?'],
   ['Would you eat it?', 'What is your favorite food?'],
   ['What language do you want to learn?', 'How do you study English?'],
   ['When do you exercise?', 'What sport do you like?'],
   ['When do you go to bed?', 'Do you have a teddy bear?']
  ],
  gram1: { chain: ['Before school, I ___.', 'After school, I ___.'], ex: 'T: Before school, I drink coffee.<br>S: Before school, I eat breakfast.<br>T: After school, I …' },
  gram2: {
   a: { title: 'Ask 5 times', items: ['before school?', 'after school?', 'before bed?', 'after dinner?', 'on weekends?'], ans: 'Ask: <b>What do you do …?</b> + one more sentence' },
   b: { title: 'My day', big: 'I finish my homework by ___. I play between ___ and ___.', ans: 'Then ask: <b>When do you …?</b>' }
  },
  opener: { think: ['Look at the photo. What do you see?', 'What is the best thing you have?', 'Who is the greatest person you know?'] },
  convo: [
   ['A', 'Who is the greatest singer in the world?'],
   ['B', 'I think it\'s {IU}!'],
   ['A', 'Really? Why?'],
   ['B', 'Her songs are {so beautiful}.'],
   ['A', 'Cool. What is the best food in Korea?'],
   ['B', 'The best food is {tteokbokki}. It\'s {spicy}!'],
   ['A', 'Me too! I love it.']
  ],
  swap: [['a singer', 'IU'], ['why', 'so beautiful'], ['a food', 'tteokbokki'], ['a taste word', 'spicy']],
  lang: [
   ['Give your opinion', ['I think …', 'For me, …']],
   ['Agree', ['Me too!', 'I agree!', 'Good choice!']],
   ['Don\'t agree', ['Really?', 'I like … more.']]
  ],
  langPractice: ['Pizza is the best food.', 'Summer is the best season.', 'Dogs are the cutest animals.', 'Math is the hardest subject.', 'BTS is the greatest band.', 'Jeju is the most beautiful place.'],
  survey: {
   ask: 'What is the best',
   cols: ['Me', 'My teacher'],
   rows: ['food in Korea', 'place to visit', 'movie ever', 'season', 'game to play', 'animal'],
   q: 'What is the best …? → I think the best … is ___.',
   report: 'My teacher thinks the best ___ is ___.'
  },
  gap: {
   who: 'Leo',
   q: ['Who is Leo\'s greatest singer?', 'What is his best restaurant?', 'What is his best workout?', 'When does he go to sleep?'],
   A: [['greatest singer', 'BTS'], ['best restaurant', '?'], ['best workout', 'swimming'], ['bedtime', '?']],
   B: [['greatest singer', '?'], ['best restaurant', 'a noodle shop'], ['best workout', '?'], ['bedtime', 'before 10 p.m.']],
   tip: 'the <b>greatest</b> · the <b>best</b> · the <b>most</b> famous'
  },
  role: {
   A: ['You are a travel blogger.', 'Ask 5 "What is the best…?" questions.', 'Say "Wow!" and ask why.'],
   B: ['You are a local guide in Korea.', 'Choose: Seoul / Busan / Jeju.', 'Answer: The best … is … because …']
  },
  tts: {
   title: 'Make a "Best of Me" poster',
   steps: ['Pick 4 "best" topics.', 'Ask your teacher about them, too.', 'Choose the best answer for each.', 'Show and tell your poster!'],
   lang: ['The best ___ is ___.', 'I think ___ is the greatest.', 'My teacher and I both like ___!']
  },
  speech: {
   time: '1 min',
   model: ['Hello! Here is my "best" list.', 'The best food is tteokbokki.', 'The greatest singer is IU.', 'The best place to visit is Jeju Island.', 'I read a book before bed. It is the best way to sleep!', 'Thank you!'],
   outline: ['Hello!', 'The best food', 'The greatest singer', 'The best place', 'Thank you!'],
   check: ['Loud voice', 'Use the best / the greatest', 'Say 5 things']
  },
  pron: {
   cols: [['the /ðə/', ['the best', 'the most', 'the greatest']], ['the /ði/', ['the easiest', 'the oldest', 'the ugliest']], ['-est /ɪst/', ['greatest', 'fastest', 'biggest']]],
   up: 'Is pizza the best food?',
   down: 'Who is the greatest singer?'
  },
  review: ['I can talk about the best and greatest.', 'I can use the best / the most / the greatest.', 'I can use before / after / by.', 'I can give my opinion.']
 },
 H: {
  steps: ['Answer', 'Reason', 'Example', 'Ask back'],
  model: [
   ['For me, the greatest pop singer is Michael Jackson.', 'He changed music and dance forever.', 'Even now, people all over the world copy his moonwalk.', 'Who is the greatest singer to you?'],
   ['I think the greatest leader of the past is King Sejong.', 'He cared about ordinary people, not just the rich.', 'He created Hangeul so everyone could read and write.', 'Which leader do you admire?'],
   ['The greatest karate master is probably Mas Oyama.', 'He trained for years alone in the mountains.', 'He even fought bulls to show his power!', 'Have you ever learned a martial art?'],
   ['The best restaurant I\'ve ever been to is a tiny sushi bar in Busan.', 'The fish was the freshest I\'ve ever tasted.', 'The chef made each piece by hand right in front of us.', 'What\'s the most delicious meal you\'ve had?'],
   ['I\'d say the greatest boxer is Muhammad Ali.', 'He was the fastest heavyweight of his time.', 'He also stood up for his beliefs.', 'Do you enjoy watching boxing?'],
   ['The most visited place in Korea is Myeongdong.', 'It\'s the best place for shopping and street food.', 'On weekends, you can hardly walk.', 'What\'s the most popular place in your city?'],
   ['For foreigners, the most disgusting food is beondegi.', 'They are silkworm pupae with a strong smell.', 'My Canadian friend tried one and made a face.', 'What\'s the strangest food you\'ve tried?'],
   ['The best way is to use the language every day.', 'You remember words when you need them.', 'I watch dramas and repeat the lines.', 'How do you practice English?'],
   ['I think the best workout is interval running.', 'It burns the most calories in the shortest time.', 'I run fast for 30 seconds, then walk for a minute.', 'What\'s your favorite workout?'],
   ['The best way is to put your phone away.', 'The light from the screen keeps your brain awake.', 'I stop using my phone an hour before bed.', 'What do you do when you can\'t sleep?']
  ],
  frame: [
   'For me, the greatest … is … because …',
   'I think the greatest leader of the past is … He/She …',
   'The greatest master is … because …',
   'The best restaurant I\'ve ever been to is … The …',
   'I\'d say the greatest boxer is … because …',
   'The most visited place is … It\'s the best place for …',
   'The most disgusting food is … because … Once, …',
   'The best way to learn a language is to … For example, …',
   'The best workout is … because it … I …',
   'The best way to fall asleep is to … before bed.'
  ],
  more: [
   ['What makes a singer "great" — voice, songs or personality?', 'Will today\'s pop stars be famous in 50 years?', 'Who is the most overrated singer?'],
   ['What makes someone a great leader?', 'Are there great leaders today?', 'Would you like to be a leader? Why?'],
   ['Why do people learn martial arts?', 'Is taekwondo or karate harder?', 'Should self-defense be taught at school?'],
   ['What makes a restaurant the best — food, service or price?', 'Do you trust online restaurant reviews?', 'What is the most expensive meal you\'ve had?'],
   ['Is boxing too dangerous to be a sport?', 'What makes an athlete great?', 'Which sport needs the most courage?'],
   ['Is tourism good or bad for a city?', 'What place in Korea is underrated?', 'Where would you take a foreign friend first?'],
   ['Why do cultures find different foods strange?', 'Would you try a food that looks strange?', 'What Korean food is hardest for foreigners?'],
   ['Is it better to study grammar or just speak?', 'Can AI replace language learning?', 'What is the hardest language to learn?'],
   ['Is diet or exercise more important?', 'Why do people give up on workouts?', 'Do you prefer the gym or working out outside?'],
   ['How much sleep do you really need?', 'Why do so many people sleep badly today?', 'Are naps good or bad?']
  ],
  gram1: { chain: ['Before a big test, I always ___.', 'I try to finish my work by ___.'], ex: 'T: After work, I usually go to the gym.<br>S: After school, I usually …<br>T: Before bed, I …' },
  gram2: {
   a: { title: 'Ask 5 times', items: ['What do you do before an exam?', 'What\'s the best thing to do after work?', 'When are you free — between 2 and 5?', 'What must you finish by Friday?', 'Up to now, what\'s your best memory?'], ans: 'Answer with <b>before / after / by</b> <b>+ a detail</b>' },
   b: { title: 'A perfect day', big: 'Before noon, I\'d ___. Between 1 and 5, I\'d ___. By 10, I\'d ___.', ans: 'Then ask: <b>What would your perfect day be?</b>' }
  },
  opener: {
   think: ['What makes someone or something "the best"?', 'Can "the greatest" be different for each person? Why?', 'What is the best decision you have ever made?']
  },
  convo: [
   ['A', 'OK, big question. Who\'s the greatest singer of all time?'],
   ['B', 'Easy. It\'s {Michael Jackson}.'],
   ['A', 'Really? Why do you think so?'],
   ['B', 'He was the most {creative} performer ever.'],
   ['A', 'Fair point. But I\'d pick {Freddie Mercury}.'],
   ['B', 'Good choice! What about the best food in Korea?'],
   ['A', 'Definitely {bibimbap}. It\'s the healthiest, too.'],
   ['B', 'Hmm, I\'d say fried chicken — but only after a workout!'],
   ['A', 'Ha! That\'s the best excuse I\'ve ever heard.']
  ],
  swap: [['a great singer', 'Michael Jackson'], ['a quality', 'creative'], ['another singer', 'Freddie Mercury'], ['a Korean food', 'bibimbap']],
  lang: [
   ['Give an opinion', ['In my opinion, …', 'I\'d say …', 'Without a doubt, …']],
   ['Compare', ['… is better than …', 'Nothing beats …']],
   ['Disagree politely', ['I see your point, but …', 'That\'s true, but …']],
   ['Ask for reasons', ['What makes it the best?', 'Why do you think so?']]
  ],
  langPractice: ['BTS is the greatest band ever.', 'Seoul is the best city in Asia.', 'Running is the worst workout.', 'Kimchi is the most famous Korean food.', 'English is the easiest language.', 'Winter is the best season.'],
  survey: {
   ask: 'What is the best',
   cols: ['Me', 'My teacher', 'Why?'],
   rows: ['food in Korea', 'movie of all time', 'way to relax', 'city to live in', 'time of day to study', 'app on your phone'],
   q: 'What is the best …? → Ask: Why? / What makes it the best?',
   report: 'My teacher thinks the best ___ is ___, but I think it\'s ___.'
  },
  gap: {
   who: 'Leo',
   q: ['Who is Leo\'s greatest singer? Why?', 'What is his best restaurant?', 'What is his best way to learn English?', 'What does he do before bed?', 'What is the most disgusting food to him?'],
   A: [['greatest singer', 'Freddie Mercury — his voice'], ['best restaurant', '?'], ['learn English', 'podcasts on the bus'], ['before bed', '?'], ['most disgusting', '?']],
   B: [['greatest singer', '?'], ['best restaurant', 'a taco truck in LA'], ['learn English', '?'], ['before bed', 'reads, no phone after 10'], ['most disgusting', 'blue cheese']],
   tip: 'the great<b>est</b> · the <b>best</b> · the <b>most</b> disgusting'
  },
  role: {
   A: ['You write a travel blog.', 'Ask 5 "best / most" questions + 2 follow-ups.', 'Pick the top 3 tips for your readers.'],
   B: ['You are a local guide in Korea.', 'Choose: Seoul / Busan / Jeju.', 'Give reasons and times (before / after / by). Recommend one secret place.']
  },
  tts: {
   title: 'Create a "Top 3 of Korea" guide',
   steps: ['List ideas: food, places, activities.', 'Ask your teacher for the best of each.', 'Agree on the top 3 and rank them.', 'Present the guide in 1 minute.'],
   lang: ['Number one should be ___ because ___.', 'I see your point, but ___ is better.', 'So our top 3 are ___.']
  },
  speech: {
   time: '2 min',
   model: ['Today, I\'ll share my "best" list.', 'The greatest leader of the past is King Sejong.', 'He made Hangeul so everyone could read.', 'The best restaurant I know is in Busan.', 'The best way to learn a language is daily use.', 'I practice English before school.', 'These are my best things right now.', 'Thanks! What\'s the best thing in your life?'],
   outline: ['Hook — "My best list…"', 'Greatest person + why', 'Best place or food + example', 'Best way to learn + routine', 'Wrap up', 'Ask a question'],
   check: ['Clear voice', 'Superlatives (-est / most / best)', 'Reasons and examples', 'Answer 1 question']
  },
  pron: {
   cols: [['the /ðə/', ['the best', 'the most', 'the greatest']], ['the /ði/', ['the easiest', 'the oldest', 'the ugliest']], ['-est /ɪst/', ['greatest', 'freshest', 'healthiest']]],
   up: 'Is it the best restaurant in town?',
   down: 'What is the best way to relax?'
  },
  review: ['I can give opinions with superlatives.', 'I can use before / after / between / by.', 'I can disagree politely.', 'I can present my "best" list for 2 minutes.']
 }
};
