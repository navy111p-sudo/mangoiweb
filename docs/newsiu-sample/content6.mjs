// New SIU 6판 내용 — 쉬운 판(E) · 어려운 판(H). 원본(구글 드라이브 «001 - A talk with you.pdf») 질문 10개·낱말·문법이 뼈대.
// 쉬운 판 = 2문장 대답 + 빈칸 틀 + 낱말 고르기 · 어려운 판 = 4문장 대답(대답·이유·예·되묻기) + 생각 질문.
export const KW = [ // 원본 Keyword · 쉬운 영어 뜻 · 한글(각주에만)
 ['study','verb','공부하다','to spend time learning about a subject'],
 ['live','verb','살다','to have your home in a place'],
 ['watch','verb','보다','to look at something for a period of time'],
 ['pet','noun','반려동물','an animal you keep at home for fun and company'],
 ['sport','noun','스포츠','a physical game where players or teams compete'],
 ['best','adjective','가장 좋은','better than all the others'],
 ['learn','verb','배우다','to get a new skill or knowledge'],
 ['help','verb','돕다','to make it easier for someone to do something'],
 ['teach','verb','가르치다','to show someone how to do something'],
 ['hobby','noun','취미','something you do for fun in your free time'],
];
export const QS = ['Why do you study English?','Where do you live?','What is your favorite TV show?','Do you have a pet?','What is your favorite sport?','What is the best thing about your friend?','What is one thing you want to learn?','How can you help other people?','What would you like to teach someone?','What are your hobbies?'];
export const IMG_E = ['scene-words/16910','scene-clips/7238','scene-clips/5023','scene-clips/7224','scene-words/16208','scene-words/17231','scene-words/14007','scene-clips/5035','scene-words/10017','scene-words/19410'];
export const IMG_H = ['scene-words/16910','scene-words/18203','scene-clips/5023','scene-words/15422','scene-words/16202','scene-words/18463','scene-words/19428','scene-clips/5035','scene-words/10017','scene-words/19410'];

export const E = {
 tag:'EASY', talk:'1 min', steps:['Answer','More'],
 who:[['Jiwoo',10],['Minho',9],['Seoyeon',11],['Hana',10],['Junho',11],['Yuna',9],['Doyun',10],['Sora',11],['Eunji',10],['Taeho',9]],
 model:[
  ['I study English because I like songs.','I sing English songs every day.'],
  ['I live in Seoul.','I live in an apartment with my family.'],
  ['My favorite TV show is Pororo.','It is very funny.'],
  ['Yes, I do. I have a dog.','Her name is Coco.'],
  ['My favorite sport is soccer.','I play it after school.'],
  ['The best thing about my friend is that she is kind.','She shares her snacks with me.'],
  ['I want to learn how to swim.','It looks fun.'],
  ['I can help people by cleaning.','I help my mom at home.'],
  ['I would like to teach someone how to draw.','I am good at drawing.'],
  ['My hobbies are drawing and reading.','I draw every day.'],
 ],
 frame:['I study English because I ___.','I live in ___. I live in a/an ___.','My favorite TV show is ___. It is ___.',"Yes, I do. I have a ___. / No, I don't.",'My favorite sport is ___. I ___ it.','The best thing about my friend is that he/she is ___.','I want to learn how to ___.','I can help people by ___.','I would like to teach someone how to ___.','My hobbies are ___ and ___.'],
 bank:[['like songs','want to travel','like games','want to be a pilot'],['Seoul','Busan','apartment','house'],['funny','exciting','cute','cool'],['dog','cat','fish','hamster'],['soccer','basketball','swimming','play / watch'],['kind','funny','smart','brave'],['swim','cook','dance','play the piano'],['cleaning','sharing','cooking','smiling'],['draw','dance','play games','make cookies'],['drawing','reading','gaming','dancing']],
 more:[['Do you like English?','When do you study?'],['Who do you live with?','Is your home big or small?'],['When do you watch it?','Who do you watch it with?'],['What is its name?','What pet do you want?'],['Who do you play with?','Are you good at it?'],["What is your friend's name?",'What do you do together?'],['Who can teach you?','Why do you want to learn it?'],['Who do you help at home?','Who helps you?'],['Who would you teach?','Are you good at it?'],['When do you do your hobby?','Do you do it with friends?']],
 are:['a student','hungry','happy','from Korea','ten years old'],
 spTurn:['I ___ every day.','I am ___.'],
 family:'My mom likes ___. She doesn\'t like ___.',
 drill:[['I','play soccer.','I play soccer.'],['My brother','…','My brother plays soccer.'],['He (don\'t)','…',"He doesn't play soccer."],['you ?','…','Do you play soccer?'],['he ?','…','Does he play soccer?']],
 wordTask:['Say one sentence with each word.','"I study English. My hobby is reading."'],
 story:{n:3,frame:'This is ___. He/She likes ___. His/Her hobby is ___.'},
};
export const H = {
 tag:'HARD', talk:'2 min', steps:['Answer','Reason','Example','Ask back'],
 who:[['Minjun',15],['Chaewon',14],['Jaehyun',16],['Suah',15],['Hyunwoo',14],['Yerin',16],['Sihoo',15],['Dahye',14],['Joon',16],['Nari',15]],
 model:[
  ['I study English because I want to work abroad someday.','English helps me talk with people from all over the world.','For example, I watch English videos every night.','How about you — why do you study it?'],
  ['I live in Suwon, near Seoul.',"I like it because it's quiet but close to the city.",'There is a big park where I ride my bike on weekends.','Where do you live?'],
  ['My favorite show is Running Man.','The members are hilarious and the games are creative.','I usually watch it with my family on Sunday nights.','Have you seen it?'],
  ["No, I don't, but I really want a dog.",'Dogs are loyal and they make people happy.','My neighbor has a golden retriever, and I play with him every weekend.','Do you think pets are a lot of work?'],
  ['My favorite sport is basketball.',"I enjoy it because it's fast and you need teamwork.",'I play with my friends at the school court twice a week.','Which sport do you like to watch?'],
  ["The best thing about my friend Jisoo is that she's a great listener.","When I'm stressed, she always listens to me.",'Last month she helped me get ready for a big test.','What makes someone a good friend to you?'],
  ['I want to learn how to play the guitar.','It would be amazing to play songs for my friends.',"I've watched some online lessons, but I need a real teacher.",'What would you like to learn this year?'],
  ['I can help people by volunteering in my community.','Helping others makes me feel useful and happy.','Last year I picked up trash in the park with my classmates.','How do you help people around you?'],
  ['I would like to teach my little brother how to ride a bike.','I remember how proud I felt when I learned it.',"I'd hold the back of the seat and let go slowly.",'What would you be good at teaching?'],
  ['My hobbies are baking and photography.','Baking relaxes me, and I love sharing cookies with my family.','I also take photos of my food and post them online.','What do you do in your free time?'],
 ],
 frame:['I study English because … For example, …','I live in … I like it because …','My favorite show is … because …','I have / I want … because …','My favorite sport is … I enjoy it because …','The best thing about my friend is … Once, …','I want to learn how to … because …','I can help people by … Last time, …','I would like to teach … how to … First, …','My hobbies are … I started because …'],
 more:[['What is the hardest part of English for you?','Is English important for your future? Why?','If you could speak one more language, which one?'],['What is the best thing about your neighborhood?','What would you change about your town?','Where would you like to live in the future?'],['Do you prefer TV shows or YouTube? Why?','Which person on the show would you like to meet?','Is watching TV a waste of time? Why or why not?'],['What is the hardest part of having a pet?','Should pets be allowed in every apartment?','What unusual pet would you like to have?'],['Do you prefer team sports or individual sports?','Which sports star do you admire? Why?','Should schools have more PE classes?'],['How did you meet your best friend?','Is it better to have many friends or a few close ones?','Have you ever argued with a friend? What happened?'],['Is it better to learn from a teacher or from videos?','What skill will be important in the future?','How long does it take to learn a new skill?'],['Why do some people volunteer?','What small thing can make someone\'s day better?','Should students do volunteer work at school?'],['Who is the best teacher you\'ve ever had? Why?','What makes a good teacher?','Would you like to be a teacher someday?'],['How did you start your hobby?','Can a hobby become a job? Give an example.','What new hobby would you like to try?']],
 are:['interested in science','good at cooking','a morning person','afraid of anything','ready for the weekend'],
 spTurn:['I usually ___ after school.','I never ___ on weekends.'],
 family:'My dad likes ___, but he doesn\'t like ___. Does your dad like ___?',
 drill:[['She','watches TV every night.','She watches TV every night.'],['She (don\'t)','…',"She doesn't watch TV every night."],['she ?','…','Does she watch TV every night?'],['How often ?','…','How often does she watch TV?'],['They','…','They watch TV every night.'],['they ?','…','Do they watch TV every night?']],
 wordTask:['Tell a 1-minute story. Use 5 of the words.','"I study hard because I want to learn how to teach…"'],
 story:{n:5,frame:'This is ___. He/She lives in ___ and likes ___ because ___. He/She also ___.'},
};
