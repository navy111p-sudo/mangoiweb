// New SIU 샘플 5판 — 사장님 「게임은 넣지 말고 말을 많이 하는 방법으로」.
// 원본(구글 드라이브 «001 - A talk with you.pdf», 2019)의 문법·질문 10개·낱말은 그대로.
// 말하기 장치: 3단계 대답(Answer → Reason → More) · 모범 대답(🔊 따라 말하기) · Talk more 이어 묻기 · A/B 역할 바꾸기 · 짝 인터뷰 → 반 앞 전달.
// 한글 뜻은 «먼저 짐작 → 확인»: 쪽 맨 아래 작은 각주에만.
import fs from 'fs';
const R = '/home/user/mangoiweb/';
const IMG = p => p.startsWith('gen/') ? `file://${R}docs/newsiu-sample/${p}.webp` : `file://${R}cloudflare-deploy/public/img/${p}.webp`;
const LOGO = `file://${R}cloudflare-deploy/public/img/mango-char.png`;
const BOOK = 'SIU BASIC 001 - A talk with you';
const e = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
const SPK = '<i class="spk"><svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg></i>';
const TOP = (tag, n, dark) => `<div class="top ${dark?'dk':''}"><b>${e(tag)}</b><span>SIU BASIC 001 · A Talk with You</span><em>${n}</em></div>`;
const S = []; const add = (cls, html, lines) => S.push([cls, html, lines]);
const P = () => S.length + 1;

const ARE=(a,r,m)=>`<ol class="are"><li><i>A</i><small>Answer</small>${e(a)}</li><li><i>R</i><small>Reason</small>${e(r)}</li><li><i>M</i><small>More</small>${e(m)}</li></ol>`;
const PAIR='<div class="pair"><b>A</b> asks → <b>B</b> answers → <b>switch!</b></div>';

// 1 표지
add('cover', `<img class="full" src="${IMG('gen/cover')}"><div class="shade"></div>
<div class="cv"><div class="stk">LESSON<br><b>001</b></div><p class="kick">SIU BASIC · Simple Present</p><h1>A Talk<br>with You</h1><p class="ko4">Speak more. Speak longer. 🗣</p></div><img class="logo" src="${LOGO}">`, ['A Talk with You']);

// 2 오늘의 약속 — 3단계 대답
add('rule', TOP("Today's Speaking Rule",P(),1)+`<h2 class="big">Don't stop at <span>one word!</span></h2>
<div class="rw"><div class="bad1"><small>✘ Too short</small><p>"Where do you live?"<br><b>"Seoul."</b></p></div>
<div class="good1"><small>✔ The 3-Step Answer</small>${ARE('I live in Seoul.','I live there with my family.','There is a big park near my home.')}</div></div>
<p class="foot">Every answer today = <b>3 sentences</b>. Answer → Reason → More.</p>`,
 ['Don\'t stop at one word!','Where do you live? Seoul. That is too short.','I live in Seoul. I live there with my family. There is a big park near my home.','Every answer today is three sentences. Answer, reason, more.']);

// 3 Simple Present (원본 2쪽) + 내 이야기
add('sp', TOP('Grammar',P())+`<h2>What is <span>Simple Present?</span></h2><div class="spg">
<div class="spc c1"><img src="${IMG('scene-words/18574')}"><div class="spb"><i>⏰</i><h3>Things we do again and again</h3><q>I <b>study</b> English every day.</q><div class="yt">🗣 Your turn: say 2 things you do every day.<br><span>I ___ every day. I ___ every weekend.</span></div></div></div>
<div class="spc c2"><img src="${IMG('scene-clips/7085')}"><div class="spb"><i>✅</i><h3>Things that are true now</h3><q>I <b>am</b> a student.</q><div class="yt">🗣 Your turn: say 2 true things about you.<br><span>I am ___. I have ___.</span></div></div></div></div>`,
 ['Simple present is used to talk about an action which happens on a regular basis.','I study English every day.','We use the present tense to talk about something that is true in the present.','I am a student.']);

// 4 Are you a student? (원본 3쪽) + 묻고 답하기 줄
const AY=['a student','hungry','from Korea','good at singing','a morning person'];
add('qa', `<img class="full" src="${IMG('scene-clips/7085')}"><div class="shade4"></div>${TOP('Ask & Answer',P(),1)}
<div class="bub l qa1"><small>Question</small><span class="tg t1">Are</span> <span class="tg t2">you</span> <span class="tg t3">a student</span>?</div>
<div class="lg"><span class="t1">auxiliary verb</span><span class="t2">subject</span><span class="t3">noun</span></div>
<div class="chain"><b>🗣 Ask your partner. Answer in a full sentence — then add one more!</b>${AY.map(a=>`<span>Are you ${e(a)}?</span>`).join('')}</div>
<div class="yn"><div class="y"><b>O</b><small>Affirmative</small>Yes, I am. I … every day.</div><div class="n"><b>X</b><small>Negative</small>No, I'm not. I am …</div></div>
<div class="kfn dk">💡 뜻 확인 · auxiliary verb 조동사 · subject 주어 · noun 명사</div>`,
 ['Are you a student?','Yes, I am a student.','No, I am not a student.',...AY.map(a=>'Are you '+a+'?')]);

// 5 동사 표 (원본 4쪽) + 우리 가족 말하기
const row = (lbl,cls,a,b) => `<div class="gr ${cls}"><div class="gl">${lbl}</div><div class="gx"><span>${a}</span></div><div class="gx"><span>${b}</span></div></div>`;
add('tbl', TOP('Grammar · like',P())+`<div class="tw"><div class="tt2"><h2>Do you <span>like</span><br>kimchi?</h2><img src="${IMG('scene-words/14867')}"><div class="sx"><b>+s</b>he · she · it</div></div>
<div class="gt"><div class="gh"><span></span><span>I · You · We · They</span><span>He · She · It</span></div>
${row('Affirmative','ga','I <b>like</b> kimchi.','She <b>like<u>s</u></b> kimchi.')}
${row('Negative','gn','I <b>don\'t like</b> kimchi.','He <b>doesn\'t like</b> kimchi.')}
${row('Question','gq','<b>Do</b> you like kimchi?','<b>Does</b> she like kimchi?')}
<div class="yt big">🗣 Talk about your family: "My mom <b>likes</b> ___. She <b>doesn't like</b> ___. <b>Does</b> your mom like ___?"</div></div></div>`,
 ['I like kimchi.','She likes kimchi.',"I don't like kimchi.","He doesn't like kimchi.",'Do you like kimchi?','Does she like kimchi?','My mom likes coffee. She doesn\'t like spicy food.']);

// 6 바꿔 말하기 (게임 대신 말하기 연습)
const DR=[['I','play soccer.'],['My brother','…'],['He (−)','…'],['Question: you','…'],['Question: he','…']];
add('drill', TOP('Say It Out Loud',P())+`<h2>Change the <span>subject!</span> <small class="hs">Say each line out loud</small></h2><div class="drw">
<ol class="dr">${DR.map((d,i)=>`<li><i>${i+1}</i><b>${e(d[0])}</b><span>${i?'__________________':e(d[1])}</span></li>`).join('')}</ol>
<div class="drt"><p>Now make your own with:</p><div class="topics">${['watch TV','eat breakfast','read books','go to school'].map(t=>`<span>${t}</span>`).join('')}</div>${PAIR}</div></div>
<div class="kfn">✅ 정답 확인 · 2) My brother plays soccer. 3) He doesn't play soccer. 4) Do you play soccer? 5) Does he play soccer?</div>`,
 ['I play soccer.','My brother plays soccer.',"He doesn't play soccer.",'Do you play soccer?','Does he play soccer?']);

// 7~16 질문 10개 (원본 5~14쪽) — 3단계 모범 대답 + Talk more
const Q=[
 ['Why do you study English?','study','verb','공부하다','to spend time learning about a subject, often with books','scene-words/16910',['I study English because I want to travel.','I want to talk to people from other countries.','Someday I want to visit London.'],['How long do you study every day?','What is hard about English?']],
 ['Where do you live?','live','verb','살다','to have your home in a place','scene-clips/7238',['I live in Seoul.','I live there with my family.','There is a big park near my home.'],['What do you like about your neighborhood?','Who do you live with?']],
 ['What is your favorite TV show?','watch','verb','보다','to look at something for a period of time','scene-clips/5023',['My favorite TV show is Running Man.','It is really funny.','I watch it with my brother on Sundays.'],['When do you usually watch it?','Who is your favorite person on the show?']],
 ['Do you have a pet?','pet','noun','반려동물','an animal you keep at home for company and fun','scene-clips/7224',['Yes, I do. I have a dog.','His name is Max.','I walk him every morning.'],['What does your pet eat?','No pet? What pet do you want?']],
 ['What is your favorite sport?','sport','noun','스포츠, 운동 경기','a physical game where players or teams compete','scene-words/16208',['My favorite sport is soccer.','It is exciting.','I play it with my friends after school.'],['Do you play it or watch it?','Who is your favorite player?']],
 ['What is the best thing about your friend?','best','adjective','가장 좋은','better than all the others','scene-words/17231',['The best thing about my friend is that she is kind.','She always helps me.','She shares her snacks with me.'],['How did you meet your friend?','What do you do together?']],
 ['What is one thing you want to learn?','learn','verb','배우다','to get knowledge or a skill by studying or practice','scene-words/14007',['I want to learn how to swim.','It looks fun.','I want to swim at the beach this summer.'],['Who can teach you?','Why is it important to you?']],
 ['How can you help other people?','help','verb','돕다','to make it easier for someone to do something','scene-clips/5035',['I can help people by cleaning the park.','It makes our town beautiful.','I also help my mom with cooking.'],['Who helps you the most?','How do you help at home?']],
 ['What would you like to teach someone?','teach','verb','가르치다','to show or explain to someone how to do something','scene-words/10017',['I would like to teach someone how to draw.','I am good at drawing.','I can teach my little sister.'],['Who taught you something special?','Is it easy or hard to teach?']],
 ['What are your hobbies?','hobby','noun','취미','an activity you do for fun in your free time','scene-words/19410',['My hobbies are drawing and reading.','They help me relax.','I read comic books every night.'],['How often do you do your hobby?','When did you start it?']],
];
Q.forEach((q,i)=>{
  const [ques,kw,pos,ko,def,img,m,tm]=q, v=i%3, n=String(i+1).padStart(2,'0');
  const body=`<div class="qn">Q${n}<small>/10</small></div><h2 class="qh">${e(ques)}</h2>
<div class="kw k5"><small>Keyword · ${pos}</small><b>${kw}</b><p>${e(def)}</p>${SPK}</div>
<div class="model"><small>🗣 Model answer — read it, then make yours</small>${ARE(m[0],m[1],m[2])}</div>
<div class="tm5"><b>💬 Talk more</b>${tm.map(t=>`<span>${e(t)}</span>`).join('')}</div>`;
  add('q q'+v, (v===1?`<img class="full" src="${IMG(img)}"><div class="shadeQ"></div>`:`<img class="qi" src="${IMG(img)}">`)+TOP('10 Questions',P(),v===1)+`<div class="qb">${body}</div><div class="kfn${v===1?' dk':''}">💡 뜻 확인 · ${kw} = ${ko}</div>`,
   [ques, kw+'. '+def.charAt(0).toUpperCase()+def.slice(1)+'.', ...m, ...tm]);
});

// 17 낱말로 말하기 (원본 퍼즐 대신 — 말하기)
add('words', TOP('Speak with the Words',P())+`<h2>Talk with <span>today's words</span></h2><div class="wds">${Q.map(q=>`<span>${q[1]}</span>`).join('')}</div>
<div class="ww"><div class="yt big">🗣 Pick 3 words. Make 3 sentences about <b>you</b>.<br><span>"I <b>study</b> English every day. My <b>hobby</b> is drawing. I want to <b>learn</b> how to swim."</span></div>
<div class="yt big">⏱ 1-minute talk: use <b>5 words</b> and don't stop!</div></div>
<div class="kfn">💡 뜻 확인 · ${Q.map(q=>q[1]+' '+q[3]).join(' · ')}</div>`,
 ['Pick three words. Make three sentences about you.','I study English every day. My hobby is drawing. I want to learn how to swim.','Talk for one minute. Use five words.']);

// 18 짝 인터뷰 → 반 앞 전달 (he/she + s)
add('intv', `<img class="full" src="${IMG('scene-clips/7260')}"><div class="shadeQ"></div>${TOP('Partner Interview',P(),1)}
<div class="iv"><h2 class="w">Interview your <span>partner</span></h2><ol class="ivs"><li><i>1</i>Ask 5 of today's questions.</li><li><i>2</i>Ask "Talk more" questions too.</li><li><i>3</i>Tell the class about your partner.</li></ol>
<div class="rep"><small>Report frame</small>"This is <b>___</b>. <b>She lives</b> in ___. <b>She likes</b> ___. <b>She doesn't have</b> a pet. Her hobby <b>is</b> ___."</div></div>`,
 ["Interview your partner.","Ask five of today's questions.",'Tell the class about your partner.',"This is Mina. She lives in Busan. She likes soccer. She doesn't have a pet."]);

// 19 마무리 — 오늘 말한 것 돌아보기
add('fin', `<img class="full" src="${IMG('gen/jump')}"><div class="shade"></div>${TOP('Wrap-up',P(),1)}
<div class="fn"><h1>Great talking<br>with you!</h1><ul class="chk">${['I can use the simple present.','I can use likes / doesn\'t / does.','I can answer in 3 sentences.','I can ask more questions.'].map(t=>`<li>☐ ${e(t)}</li>`).join('')}</ul>
<p class="ex3">Homework 🎧 Record your answers to 3 questions.</p><p>See you next time · <b>SIU BASIC 002 — About You</b></p></div><img class="logo" src="${LOGO}">`,
 ['Great talking with you!','I can use the simple present.',"I can use likes, doesn't, and does.",'I can answer in three sentences.','I can ask more questions.','Record your answers to three questions.']);

const css = fs.readFileSync(new URL('./style2.css', import.meta.url),'utf8') + fs.readFileSync(new URL('./style3.css', import.meta.url),'utf8') + fs.readFileSync(new URL('./style4.css', import.meta.url),'utf8') + fs.readFileSync(new URL('./style5.css', import.meta.url),'utf8');
const fonts = fs.readFileSync(new URL('./fonts2.css', import.meta.url),'utf8');
fs.writeFileSync(new URL('./slides.html', import.meta.url), `<!doctype html><meta charset="utf-8"><style>${fonts}${css}</style>`+S.map((s,i)=>`<section class="s k-${s[0].split(' ').join(' k-')}" id="s${i+1}">${s[1]}</section>`).join('\n'));
const say = Object.fromEntries(S.map((s,i)=>[`[${BOOK}] New / Slide${i+1}.JPG`, s[2].map(x=>[x])]));
fs.writeFileSync(new URL('./siu-basic-01.say.json', import.meta.url), JSON.stringify(say));
console.log('slides', S.length, 'lines', S.reduce((a,s)=>a+s[2].length,0));
