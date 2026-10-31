// New SIU 샘플 4판 — 3판(원본 구성) + 게임쇼 구성(레벨·⭐·질문판·미니게임·보스 퍼즐), 한글 뜻은 «짐작 → 확인» 으로 각주·뜻 맞추기 게임에만.
// (아래는 3판 설명) — 원본(구글 드라이브 «001 - A talk with you.pdf», 2019)을 뼈대로 2판 디자인을 입힌 판.
// 원본 순서: 표지 → Simple Present → Are you a student? → 동사 표 → 질문 10개(Keyword·뜻·답 시작말) → 낱말 퍼즐.
// 원본의 문법·철자 오류는 바로잡았습니다(README «원본과 다른 점» 참고).
import fs from 'fs';
import { makeCrossword } from './crossword.mjs';
const R = '/home/user/mangoiweb/';
const IMG = p => p.startsWith('gen/') ? `file://${R}docs/newsiu-sample/${p}.webp` : `file://${R}cloudflare-deploy/public/img/${p}.webp`;
const LOGO = `file://${R}cloudflare-deploy/public/img/mango-char.png`;
const BOOK = 'SIU BASIC 001 - A talk with you';
const e = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
const SPK = '<i class="spk"><svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg></i>';
const TOP = (tag, n, dark) => `<div class="top ${dark?'dk':''}"><b>${e(tag)}</b><span>SIU BASIC 001 · A Talk with You</span><em>${n}</em></div>`;
const S = []; const add = (cls, html, lines) => S.push([cls, html, lines]);
const P = () => S.length + 1;

// 1 표지
add('cover', `<img class="full" src="${IMG('gen/cover')}"><div class="shade"></div>
<div class="cv"><div class="stk">LESSON<br><b>001</b></div><p class="kick">🎤 SIU BASIC · The Talk Show Game</p><h1>A Talk<br>with You</h1><p class="ko4">Collect <b>⭐ 20 stars</b> to win!</p></div><img class="logo" src="${LOGO}">`, ['A Talk with You']);

// 2 게임 지도 (레벨 3개 + 보스)
const LV=[['LEVEL 1','Grammar Gym','💪','scene-words/14867','Pages 3–6','+4⭐'],['LEVEL 2','Question Quest','🎲','scene-clips/7085','10 questions','+10⭐'],['LEVEL 3','Meaning Match','🧠','scene-words/19410','Guess → check','+3⭐'],['BOSS','Crossword Boss','🧩','scene-words/16910','Beat the boss!','+3⭐']];
add('map', TOP('Game Map',P(),1)+`<h2 class="big">Your <span>Game Map</span></h2><div class="path">${LV.map((l,i)=>`<div class="lv l${i}"><img src="${IMG(l[3])}"><div class="lvb"><small>${l[0]}</small><span class="em4">${l[2]}</span><strong>${l[1]}</strong><em>${l[4]}</em></div><b class="pt">${l[5]}</b></div>`).join('<i class="arr">➜</i>')}</div>
<p class="foot">Win stars in every level. Get <b>20 ⭐</b> and you're today's Talk Show Star!</p>`, ['Your game map.','Level 1, Grammar Gym.','Level 2, Question Quest.','Level 3, Meaning Match.','Beat the Crossword Boss!']);

// 3 What is Simple Present? (원본 2쪽)
add('sp', TOP('Level 1 · Grammar Gym',P())+`<div class="det">🔍 Detective!<small>Read both sentences. What's the rule?</small></div><h2>What is <span>Simple Present?</span></h2><div class="spg">
<div class="spc c1"><img src="${IMG('scene-words/18574')}"><div class="spb"><i>⏰</i><h3>Things we do<br>again and again</h3><p>An action that happens on a regular basis.</p><q>I <b>study</b> English every day.</q></div></div>
<div class="spc c2"><img src="${IMG('scene-clips/7085')}"><div class="spb"><i>✅</i><h3>Things that are<br>true now</h3><p>Something that is true in the present.</p><q>I <b>am</b> a student.</q></div></div></div>`,
 ['What is simple present?','Simple present is used to talk about an action which happens on a regular basis.','I study English every day.','We use the present tense to talk about something that is true in the present.','I am a student.']);

// 4 Are you a student? (원본 3쪽)
add('qa', `<img class="full" src="${IMG('scene-clips/7085')}"><div class="shade4"></div>${TOP('Level 1 · Yes or No',P(),1)}
<div class="bub l qa1"><small>Question</small><span class="tg t1">Are</span> <span class="tg t2">you</span> <span class="tg t3">a student</span>?</div>
<div class="lg"><span class="t1">auxiliary verb</span><span class="t2">subject</span><span class="t3">noun</span></div>
<div class="game4 g-qa"><b>⚡ Stand up!</b> Teacher asks — stand up for <b>YES</b>, sit down for <b>NO</b>. <em>+1⭐</em></div>
<div class="kfn dk">💡 뜻 확인 · auxiliary verb 조동사 · subject 주어 · noun 명사</div>
<div class="yn"><div class="y"><b>O</b><small>Affirmative</small>Yes, I am a student.</div><div class="n"><b>X</b><small>Negative</small>No, I am not a student.</div></div>`,
 ['Are you a student?','Yes, I am a student.','No, I am not a student.']);

// 5 동사 표 (원본 4쪽 — «He, She, It like» 는 likes 로 바로잡음)
const row = (lbl,cls,a,b) => `<div class="gr ${cls}"><div class="gl">${lbl}</div><div class="gx"><span>${a}</span></div><div class="gx"><span>${b}</span></div></div>`;
add('tbl', TOP('Level 1 · like',P())+`<div class="tw"><div class="tt2"><h2>Do you <span>like</span><br>kimchi?</h2><img src="${IMG('scene-words/14867')}"><div class="sx"><b>+s</b>he · she · it</div></div>
<div class="gt"><div class="gh"><span></span><span>I · You · We · They</span><span>He · She · It</span></div>
${row('Affirmative','ga','I <b>like</b> kimchi.','She <b>like<u>s</u></b> kimchi.')}
${row('Negative','gn','I <b>don\'t like</b> kimchi.','He <b>doesn\'t like</b> kimchi.')}
${row('Question','gq','<b>Do</b> you like kimchi?','<b>Does</b> she like kimchi?')}</div></div>`,
 ['Do you like kimchi?','I like kimchi.','She likes kimchi.',"I don't like kimchi.","He doesn't like kimchi.",'Do you like kimchi?','Does she like kimchi?']);

// 6 Fix it! 게임 (표를 바로 써먹기)
const FX=[['He like kimchi.','He likes kimchi.'],["She don't like cats.","She doesn't like cats."],['Do he play soccer?','Does he play soccer?'],['They likes music.','They like music.']];
add('fix', TOP('Level 1 · Speed Game',P())+`<div class="stamp">+2⭐</div><h2>Fix <span>It!</span> <small class="hs">Find the mistake!</small></h2><div class="fxg">${FX.map((f,i)=>`<div class="fx"><i>${i+1}</i><p class="bad">${e(f[0])}</p><p class="good blank">✔ __________________</p></div>`).join('')}</div>
<div class="kfn dk">✅ 정답 확인 · ${FX.map((f,i)=>(i+1)+') '+e(f[1])).join('  ')}</div>
<p class="foot">⏱ 30 seconds! Say the right sentence out loud.</p>`, FX.map(f=>f[1]));

// 7~16 질문 10개 (원본 5~14쪽). 뜻은 원본 사전식 풀이를 쉬운 영어로 줄였습니다.
const Q=[
 ['Why do you study English?','study','verb','공부하다','to spend time learning about a subject, often with books','I study English because…','scene-words/16910','How long do you study every day?'],
 ['Where do you live?','live','verb','살다','to have your home in a place','I live in…','scene-clips/7238','Do you like your neighborhood?'],
 ['What is your favorite TV show?','watch','verb','보다','to look at something for a period of time','My favorite TV show is…','scene-clips/5023','When do you usually watch it?'],
 ['Do you have a pet?','pet','noun','반려동물','an animal you keep at home for company and fun',"Yes, I do. I have a… / No, I don't.",'scene-clips/7224','What pet would you like to have?'],
 ['What is your favorite sport?','sport','noun','스포츠, 운동 경기','a physical game where players or teams compete','My favorite sport is…','scene-words/16208','Do you play it or watch it?'],
 ['What is the best thing about your friend?','best','adjective','가장 좋은','better than all the others','The best thing about my friend is…','scene-words/17231','How did you meet your friend?'],
 ['What is one thing you want to learn?','learn','verb','배우다','to get knowledge or a skill by studying or practice','I want to learn how to…','scene-words/14007','Who can teach you?'],
 ['How can you help other people?','help','verb','돕다','to make it easier for someone to do something','I can help people by…','scene-clips/5035','Who helps you the most?'],
 ['What would you like to teach someone?','teach','verb','가르치다','to show or explain to someone how to do something','I would like to teach someone how to…','scene-words/10017','Who taught you something special?'],
 ['What are your hobbies?','hobby','noun','취미','an activity you do for fun in your free time','My hobbies are…','scene-words/19410','How often do you do your hobby?'],
];
// 미니게임 — 질문마다 다른 놀이(원본 질문·낱말·답 시작말은 그대로)
const GM=[
 ['🏁','Reason Race','Say 3 reasons in 20 seconds!','20s','+1⭐'],
 ['📍','Guess Where','Give 3 clues. Your partner guesses the place!','30s','+1⭐'],
 ['🎭','Charades','Act out your favorite show. No talking!','30s','+1⭐'],
 ['🐾','Dream Pet','Draw your dream pet in 20 seconds. Tell its name!','20s','+1⭐'],
 ['🏅','Mime It','Mime a sport. Your partner says "You play…!"','20s','+1⭐'],
 ['💐','Compliment Chain','Say one nice thing about the person next to you!','1 min','+1⭐'],
 ['🎯','Top 3','Rank 3 things you want to learn. Why is #1 first?','30s','+1⭐'],
 ['🦸','Super Helper','You are a helper hero! What is your power?','30s','+1⭐'],
 ['🎓','Mini Teacher','Teach your partner something in 30 seconds!','30s','+1⭐'],
 ['🎲','Find a Match','Find a classmate with the same hobby!','1 min','+1⭐'],
];
Q.forEach((q,i)=>{
  const [ques,kw,pos,ko,def,ans,img,fu]=q, v=i%3, n=String(i+1).padStart(2,'0'), g=GM[i];
  const kcard=`<div class="kw"><small>Keyword · ${pos}</small><b>${kw}</b><p>${e(def)}</p>${SPK}</div>`;
  const body=`<div class="qn">Q${n}<small>/10</small></div><h2 class="qh">${e(ques)}</h2>${kcard}
<div class="ans"><small>Your answer</small>${e(ans)}</div>
<div class="game4"><span class="gi">${g[0]}</span><div><small>Mini-game · ⏱ ${g[3]}</small><b>${g[1]}</b><p>${e(g[2])}</p></div><em>${g[4]}</em></div>`;
  add('q q'+v, (v===1?`<img class="full" src="${IMG(img)}"><div class="shadeQ"></div>`:`<img class="qi" src="${IMG(img)}">`)+TOP('Level 2 · Question Quest',P(),v===1)+`<div class="qb">${body}</div><div class="kfn${v===1?' dk':''}">💡 뜻 확인 · ${kw} = ${ko}</div>`,
   [ques, kw+'. '+def.charAt(0).toUpperCase()+def.slice(1)+'.', ans.replace(/…/g,'...'), g[1]+'! '+g[2]]);
});

// 17 뜻 맞추기 게임 — 한글 뜻이 «처음으로» 크게 나오는 곳(짐작 → 확인)
const SH=[3,7,0,9,5,1,8,2,6,4];
add('mm', TOP('Level 3 · Meaning Match',P())+`<div class="stamp">+3⭐</div><h2>Meaning <span>Match!</span> <small class="hs">⏱ 60 seconds</small></h2><div class="mm">
<ol class="mmL">${Q.map((q,i)=>`<li><i>${i+1}</i>${q[1]}<span class="dot"></span></li>`).join('')}</ol>
<ol class="mmR">${SH.map((k,j)=>`<li><span class="dot"></span><i>${'ABCDEFGHIJ'[j]}</i>${Q[k][3]}</li>`).join('')}</ol></div>
<div class="kfn">✅ 정답 · ${Q.map((q,i)=>(i+1)+'-'+'ABCDEFGHIJ'[SH.indexOf(i)]).join('  ')}</div>`, Q.map(q=>q[1]));

// 17 낱말 퍼즐 (원본 15쪽 — 실제 풀 수 있는 판으로)
const CL=Object.fromEntries(Q.map(q=>[q[1].toUpperCase(),q[4]]));
const X=makeCrossword(Object.keys(CL));
const cell=40, grid=[];
const num={}; X.placed.forEach(p=>num[p.r+','+p.c]=p.n);
const on=new Set(); X.placed.forEach(p=>{for(let k=0;k<p.w.length;k++)on.add((p.r+(p.d?k:0))+','+(p.c+(p.d?0:k)))});
for(let r=0;r<X.H;r++)for(let c=0;c<X.W;c++)if(on.has(r+','+c))grid.push(`<div class="xc" style="left:${c*cell*1.35}px;top:${r*cell*1.35}px">${num[r+','+c]?`<sup>${num[r+','+c]}</sup>`:''}</div>`);
const clue=d=>X.placed.filter(p=>p.d===d).sort((a,b)=>a.n-b.n).map(p=>`<li><i>${p.n}</i><span>${e(CL[p.w])} <em>(${p.w.length})</em></span></li>`).join('');
add('xw', TOP('Boss Stage',P())+`<div class="stamp boss">👾 BOSS · +3⭐</div><h2>Beat the <span>Crossword!</span></h2><div class="xw"><div class="xg" style="width:${X.W*cell*1.35}px;height:${X.H*cell*1.35}px">${grid.join('')}</div>
<div class="xl"><h3>→ Across</h3><ol>${clue(0)}</ol><h3>↓ Down</h3><ol>${clue(1)}</ol></div></div>`,
 X.placed.sort((a,b)=>a.n-b.n).map(p=>p.n+'. '+CL[p.w]+'.'));
fs.writeFileSync(new URL('./crossword-answer.json', import.meta.url), JSON.stringify(X.placed.map(p=>({n:p.n,dir:p.d?'down':'across',word:p.w}))));

// 마지막 — 핫시트 인터뷰 + 별 세기
add('fin', `<img class="full" src="${IMG('gen/jump')}"><div class="shade"></div>${TOP('Final Round',P(),1)}
<div class="fn"><div class="badge">🏆<small>TALK SHOW<br>STAR</small></div><h1>Hot Seat<br>Interview!</h1><p class="w2b">One student sits in the hot seat 🔥. The class asks today's questions — answer as fast as you can!</p><p class="ex3">Then report: "<b>She likes</b> soccer. <b>She doesn't have</b> a pet."</p>
<div class="score"><span>Count your stars</span><b>⭐ ___ / 20</b></div><p>See you next time · <b>SIU BASIC 002 — About You</b></p></div><img class="logo" src="${LOGO}">`,
 ['Hot seat interview!',"The class asks today's questions. Answer as fast as you can!","She likes soccer. She doesn't have a pet.",'Count your stars!','See you next time!']);

const css = fs.readFileSync(new URL('./style2.css', import.meta.url),'utf8') + fs.readFileSync(new URL('./style3.css', import.meta.url),'utf8') + fs.readFileSync(new URL('./style4.css', import.meta.url),'utf8');
const fonts = fs.readFileSync(new URL('./fonts2.css', import.meta.url),'utf8');
fs.writeFileSync(new URL('./slides.html', import.meta.url), `<!doctype html><meta charset="utf-8"><style>${fonts}${css}</style>`+S.map((s,i)=>`<section class="s k-${s[0].split(' ').join(' k-')}" id="s${i+1}">${s[1]}</section>`).join('\n'));
const say = Object.fromEntries(S.map((s,i)=>[`[${BOOK}] New / Slide${i+1}.JPG`, s[2].map(x=>[x])]));
fs.writeFileSync(new URL('./siu-basic-01.say.json', import.meta.url), JSON.stringify(say));
console.log('slides', S.length, 'lines', S.reduce((a,s)=>a+s[2].length,0));
