// New SIU 7판 내용 — 잘 만든 출판사 교재의 «말하기 장치» 를 SIU 001 에 입힌 것.
// 뼈대(질문 10개·낱말 10개·문법 2개)는 6판과 같은 원본(구글 드라이브 «001 - A talk with you»)에서 옵니다.
//  · Four Corners / Evolve : 쪽마다 «I can» 목표, 단원에 «Time to speak» 과제 한 쪽
//  · Interchange           : 모범 대화 → 색칠한 곳을 내 말로 바꿔 말하기
//  · Smart Choice          : 설문(Find someone who) · Over to you
//  · Speaking Time(Compass): 모범 발표 → 개요 → 짧은 발표
//  · NGL Look / Time Zones : Think-Pair-Share 도입
//  · British Council       : 정보차(A·B 카드)
export { KW, QS, IMG_E, IMG_H, E as E6, H as H6 } from './content6.mjs';

export const PICS = {
  opener:'scene-words/17236', talk:'scene-clips/7477', group:'scene-words/10017', speech:'scene-words/14020',
  reporter:'scene-clips/7073', survey:'scene-clips/7445', pron:'scene-clips/7170',
};

export const E7 = {
  opener:{ think:['Look at the photo. What are they doing?','Do you like meeting new friends?','What do you say first?'] },
  convo:[['A','Hi! I\'m Mina. Are you new here?'],['B','Yes, I am. I\'m {Jun}.'],['A','Nice to meet you, {Jun}! Where do you live?'],['B','I live in {Seoul}. How about you?'],['A','Me too! What are your hobbies?'],['B','I like {drawing}. And you?'],['A','I like {soccer}. It\'s fun!']],
  swap:[['your name','Jun'],['your city','Seoul'],['your hobby','drawing'],['your partner\'s hobby','soccer']],
  lang:[
    ['Show interest',['Really?','Me too!','Cool!']],
    ['Ask back',['How about you?','And you?']],
    ['Say one more',['I also …','It\'s fun!']],
  ],
  langPractice:['I have a cat.','I like pizza.','I live in Busan.','I play soccer.','I can swim.','I watch cartoons.'],
  survey:{ cols:['Me','My teacher'], rows:['like kimchi','have a pet','live near school','watch TV every day','play soccer','want to learn to swim'], q:'Do you …?  → Yes, I do. / No, I don\'t.', report:'I ___, but my teacher ___.' },
  gap:{ who:'Minho', q:['Where does Minho live?','What is his hobby?','Does he have a pet?','What is his favorite sport?'],
    A:[['lives in','Busan'],['hobby','?'],['pet','a dog'],['favorite sport','?']],
    B:[['lives in','?'],['hobby','reading'],['pet','?'],['favorite sport','baseball']] },
  role:{ A:['You are a school reporter.','Ask 5 questions.','Write short notes.'], B:['You are a new student.','Choose: from Canada / Japan / Brazil.','Answer with 2 sentences.'] },
  tts:{ title:'Make a class poster', steps:['Pick 3 questions.','Ask your teacher. Answer, too.','Find one thing that is the same.','Draw it and tell!'], lang:['We both like ___!','I ___, but my teacher ___.','My teacher has a ___.'] },
  speech:{ time:'1 min', model:['Hello! My name is Jiwoo.','I am ten years old.','I live in Seoul with my family.','My hobby is drawing. I draw every day.','My favorite sport is soccer.','Thank you!'],
    outline:['Name / age','Where you live','Hobby','Favorite sport','Thank you!'], check:['Loud voice','Look at friends','Say 5 things'] },
  pron:{ s:['likes','eats','helps'], z:['lives','plays','learns'], iz:['watches','teaches','washes'], up:'Do you like kimchi?', down:'Where do you live?' },
  review:['I can talk about me.','I can use like / likes.','I can ask "Do you …?"','I can say one more sentence.'],
};

export const H7 = {
  opener:{ think:['What makes a first conversation easy — or awkward?','What three questions tell you the most about a person?','Is it rude to ask "Where do you live?" Why or why not?'] },
  convo:[['A','Hi, I don\'t think we\'ve met. I\'m Mina.'],['B','Oh, hi! I\'m {Jun}. I just moved here.'],['A','Really? Where did you move from?'],['B','From {Busan}. I live near the station now.'],['A','Cool. So what do you do for fun?'],['B','I\'m really into {photography}. I take pictures of street food.'],['A','That sounds interesting! Can you tell me more?'],['B','Sure. I post them online. How about you?'],['A','I play {basketball} every weekend. You should join us!']],
  swap:[['your name','Jun'],['a city','Busan'],['your hobby','photography'],['your partner\'s hobby','basketball']],
  lang:[
    ['Show interest',['Oh, really?','That sounds fun!','No way!']],
    ['Ask for more',['Can you tell me more?','Why do you like it?','How did you start?']],
    ['Buy time',['Hmm, let me think.','That\'s a good question.']],
    ['Agree / disagree',['I think so too.','I\'m not so sure.']],
  ],
  langPractice:['I have three cats.','I think homework is useless.','I want to live in Canada.','My favorite show is a cooking show.','I never eat breakfast.','English is easy for me.'],
  survey:{ cols:['Me','My teacher','One more question'], rows:['like kimchi','have a pet','live near school','watch TV every day','play a team sport','want to learn an instrument'], q:'Do you …? → Yes. → Ask: Why? / How often? / Since when?', report:'My teacher and I both ___, but only I ___.' },
  gap:{ who:'Minho', q:['Where does Minho live?','What does he do in his free time?','Does he have a pet? What kind?','Why does he like his sport?','What does he want to learn?'],
    A:[['lives in','Busan, near the sea'],['free time','?'],['pet','a dog named Max'],['sport + why','?'],['wants to learn','?']],
    B:[['lives in','?'],['free time','reads comics'],['pet','?'],['sport + why','baseball — teamwork'],['wants to learn','to cook']] },
  role:{ A:['You write for the school paper.','Ask 5 questions + 2 follow-ups.','Take notes. Report 3 facts.'], B:['You are a new exchange student.','Choose: Canada / Japan / Brazil.','Give reasons and examples. Hide one secret — tell it only if asked "Why?"'] },
  tts:{ title:'Design a "Welcome, new student!" guide', steps:['Think: what does a new student need to know?','Ask your teacher 4 of today\'s questions.','Agree on the 3 best tips together.','Present your guide in 1 minute.'], lang:['I think we should include ___ because ___.','That\'s a good idea, but ___.','So we agree on ___.'] },
  speech:{ time:'2 min', model:['Hi everyone. Let me tell you about myself.','My name is Minjun, and I\'m fifteen.','I live in Suwon, near Seoul. I like it because it\'s quiet.','In my free time, I bake and take photos.','I started baking last year, and now I make cookies every Sunday.','My favorite sport is basketball because I love teamwork.','This year, I want to learn how to play the guitar.','Thanks for listening! Any questions?'],
    outline:['Hook — "Let me tell you…"','Where you live + why you like it','Hobby + how you started','Sport + reason','A goal for this year','Ask for questions'], check:['Clear voice','Eye contact','Reasons and examples','Answer 1 question'] },
  pron:{ s:['likes','helps','visits'], z:['lives','learns','studies'], iz:['watches','teaches','practices'], up:'Does she like kimchi?', down:'What does he teach?' },
  review:['I can answer in 4 parts.','I can use likes / doesn\'t / does.','I can keep a conversation going.','I can give a short presentation.'],
};
