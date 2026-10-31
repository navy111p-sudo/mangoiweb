// New SIU 샘플 2판 — «더 흥미진진·다이나믹» (2026-09-28 사장님 지시)
// 쪽마다 다른 배치: 게임(미션·짝맞추기·빙고·두 개의 진실 하나의 거짓·60초 도전), VS, 만화 말풍선, 채팅 화면.
import fs from 'fs';
const R = '/home/user/mangoiweb/';
const IMG = p => p.startsWith('gen/') ? `file://${R}docs/newsiu-sample/${p}.webp` : `file://${R}cloudflare-deploy/public/img/${p}.webp`;
const LOGO = `file://${R}cloudflare-deploy/public/img/mango-char.png`;
const BOOK = 'SIU BASIC 001 - A talk with you';
const e = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
const SPK = '<i class="spk"><svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg></i>';
const TOP = (tag, n, dark) => `<div class="top ${dark?'dk':''}"><b>${e(tag)}</b><span>SIU BASIC 001 · A Talk with You</span><em>${n}</em></div>`;
const S = [];   // [html, lines]
const add = (cls, html, lines) => S.push([cls, html, lines]);

// 1 표지
add('cover', `<img class="full" src="${IMG('gen/cover')}"><div class="shade"></div>
<div class="cv"><div class="stk">LESSON<br><b>001</b></div><p class="kick">SIU BASIC · Let's talk!</p><h1>A Talk<br>with You</h1><p class="ko">서로 이야기 나누기</p></div><img class="logo" src="${LOGO}">`, ['A Talk with You']);

// 2 오늘의 미션
const M = [['🎤','Mission 1','Introduce yourself','scene-words/13125'],['🎯','Mission 2','Ask 3 questions','scene-clips/7260'],['🏆','Mission 3','Keep a 1-minute chat','scene-words/17307']];
add('mission', TOP('Your Missions',2,1)+`<h2 class="big">Today's <span>Missions</span></h2>
<div class="mis">${M.map((m,i)=>`<div class="mc m${i}"><img src="${IMG(m[3])}"><div class="mb"><span class="em">${m[0]}</span><small>${m[1]}</small><strong>${m[2]}</strong></div></div>`).join('')}</div>
<p class="foot">Complete all three to earn today's badge!</p>`, M.map(m=>m[2]+'.'));

// 3 만화 인사
add('comic', `<img class="full" src="${IMG('scene-clips/7115')}">${TOP('Warm-up',3)}
<div class="bub l" style="left:70px;top:150px">Hi! I'm Jun.<br>Nice to meet you!</div>
<div class="bub r" style="right:70px;top:250px">Nice to meet you, too!<br>I'm Ben.</div>
<div class="bub l" style="left:110px;top:400px">Where are you from, Ben?</div>
<div class="bub r" style="right:90px;top:480px">I'm from Canada.<br>How about you?</div>
<div class="strip">🗣 Say it with your partner! <span>짝과 함께 말해 보세요</span></div>`,
 ["Hi! I'm Jun. Nice to meet you!","Nice to meet you, too! I'm Ben.","Where are you from, Ben?","I'm from Canada. How about you?"]);

// 4 VS 투표
add('vs', `<div class="half hl"><img src="${IMG('scene-words/15597')}"><div class="lbl">OUTGOING</div></div><div class="half hr"><img src="${IMG('scene-words/12495')}"><div class="lbl">QUIET</div></div>
<div class="vsq"><div class="vsb">VS</div></div><div class="vt">${TOP('Quick Poll',4,1)}<h2>Which one are <span>you</span>?</h2></div>
<div class="vsbar">Raise your hand! Then tell your partner <b>why</b>.</div>`, ['Which one are you? Outgoing or quiet?','Raise your hand! Then tell your partner why.']);

// 5·6 낱말 카드
const V1=[['introduce','소개하다','scene-words/15496',-4],['outgoing','외향적인','scene-words/15597',3],['hobby','취미','scene-words/19428',-2],['hometown','고향','scene-words/14959',4]];
const V2=[['chat','수다를 떨다','scene-words/16862',3],['personality','성격','scene-words/19120',-3],['interest','관심사','scene-words/19410',2],['weekend','주말','scene-words/18590',-4]];
[V1,V2].forEach((V,k)=>add('vocab', TOP('New Words '+(k+1),5+k)+`<h2>Word <span>Cards</span></h2><div class="pol">${V.map(v=>`<figure style="transform:rotate(${v[3]}deg)"><img src="${IMG(v[2])}"><figcaption><b>${v[0]}</b><small>${v[1]}</small>${SPK}</figcaption></figure>`).join('')}</div>`, V.map(v=>v[0])));

// 7 짝맞추기 게임
const G=[['A','scene-words/16862'],['B','scene-words/14959'],['C','scene-words/15496'],['D','scene-words/19428']];
add('match', TOP('Game Time',7)+`<h2>Picture <span>Match!</span></h2><div class="mt"><div class="mg">${G.map(g=>`<div><img src="${IMG(g[1])}"><b>${g[0]}</b></div>`).join('')}</div>
<ol class="mw"><li><i>1</i>hobby<em>__</em></li><li><i>2</i>introduce<em>__</em></li><li><i>3</i>chat<em>__</em></li><li><i>4</i>hometown<em>__</em></li></ol></div>
<p class="foot">⏱ 30 seconds! Write the letter next to each word.</p>`, ['hobby','introduce','chat','hometown']);

// 8 채팅 화면 표현
const CH=[['q','Tell me about yourself.'],['a',"I'm a student. I love music!"],['q','Where are you from?'],['a',"I'm from Busan. 🌊"],['q','What do you do for fun?'],['a','I usually play soccer. ⚽'],['q','What are you interested in?'],['a',"I'm interested in cooking!"]];
add('chat', TOP('Key Expressions',8)+`<div class="chw"><div class="ct"><h2>Ask &amp;<br><span>Answer</span></h2><p>Ask one, answer one.<br>Keep the ball rolling!</p><div class="tipc">💡 Add one more question<br>after you answer.</div></div>
<div class="phone"><div class="pbar">Jun ↔ Ben</div>${CH.map(c=>`<div class="msg ${c[0]}">${e(c[1])}</div>`).join('')}<div class="pin">Your turn… ask Ben a question! ✏️</div></div></div>`, CH.map(c=>c[1].replace(/ [^\x00-\x7F]+$/,'')));

// 9 카페 만화
const CF=[["Jake","Is this seat taken?",40,372,'l'],["Minho","No, go ahead! Are you new here?",660,392,'r'],["Jake","Yes, I just moved from Sydney.",40,478,'l'],["Minho","Welcome! What do you do for fun?",660,498,'r'],["Jake","I like surfing. How about you?",40,584,'l'],["Minho","I play the guitar in a band!",660,604,'r']];
add('cafe', `<img class="full" src="${IMG('scene-clips/7260')}"><div class="shade4"></div>${TOP('Dialogue · At a Café',9)}${CF.map(c=>`<div class="bub ${c[4]} sm" style="left:${c[2]}px;top:${c[3]}px"><small>${c[0]}</small>${e(c[1])}</div>`).join('')}`, CF.map(c=>c[1]));

// 10 읽기 — 잡지 + DO/DON'T
add('mag', TOP('Reading',10)+`<div class="mg2"><img src="${IMG('scene-words/17307')}"><div class="mt2"><h2>The Art of <span>Small Talk</span></h2>
<p>Small talk is a short, easy chat about simple topics. You can do it with neighbors, classmates, and even strangers at a bus stop!</p>
<div class="dd"><div class="do"><b>✔ DO talk about</b><span>the weather</span><span>the weekend</span><span>food</span><span>hobbies</span></div><div class="dont"><b>✘ DON'T ask at first</b><span>money</span><span>age</span></div></div></div></div>`,
 ['Small talk is a short, easy chat about simple topics.','You can do it with neighbors, classmates, and even strangers at a bus stop!','Do talk about the weather, the weekend, food, and hobbies.',"Don't ask about money or age at first."]);

// 11 캐치볼
add('catch', `<img class="full" src="${IMG('gen/catch')}"><div class="shade2"></div>${TOP('Reading 2',11,1)}
<div class="cq"><h2 class="w">Talking is like<br><span>playing catch!</span></h2><ol><li><i>1</i>Throw a question.</li><li><i>2</i>Catch the answer.</li><li><i>3</i>Throw one back!</li></ol>
<p class="ex">"I like hiking." → "Cool! Where do you usually go?"</p></div>`,
 ['Talking is like playing catch!','Throw a question.','Catch the answer.','Throw one back!','I like hiking. Cool! Where do you usually go?']);

// 12 O/X
const TF=['Small talk is about simple topics.','Asking about money is a good first question.','A good talk is like a game of catch.','Good listeners never ask questions.'];
add('tf', TOP('Check',12)+`<h2>True or <span>False?</span></h2><div class="tfg">${TF.map((t,i)=>`<div class="tc"><i>${i+1}</i><p>${e(t)}</p><div class="ox"><span class="o">O</span><span class="x">X</span></div></div>`).join('')}</div>`, TF);

// 13 두 개의 진실 하나의 거짓
const TL=["I can surf.","I have three sisters.","I have been to the moon."];
add('truth', TOP('Game Time',13)+`<div class="tt"><div class="prof" ><img src="${IMG('gen/surfer2')}"><div class="pn"><b>Jake</b><small>16 · Sydney, Australia</small></div></div>
<div class="tr"><h2>2 Truths &amp;<br><span>1 Lie</span></h2><ol>${TL.map((t,i)=>`<li><i>${'ABC'[i]}</i>${e(t)}${SPK}</li>`).join('')}</ol><p class="q">Which one is the lie? 🤔<br><b>Now make yours!</b></p></div></div>`, [...TL,'Which one is the lie? Now make yours!']);

// 14 빙고
const BG=[['plays the guitar','scene-words/19428'],['has a pet','scene-words/16558'],['likes cooking','scene-words/18563'],['loves roller coasters','scene-words/15776'],['FREE',''],['can sing karaoke','scene-words/19100'],['plays soccer','scene-words/19279'],['reads every day','scene-words/12495'],['has been abroad','scene-words/17223']];
add('bingo', TOP('Class Game',14)+`<div class="bw"><div class="bt"><h2>Find Someone <span>Who…</span></h2><p>Walk around and ask:<br><b>"Do you …?"</b></p><p>Get a <b>YES</b>? Write the name.<br>Three in a row = <span class="bgo">BINGO!</span></p></div>
<div class="bgrid">${BG.map(b=>b[1]?`<div class="bc"><img src="${IMG(b[1])}"><span>${e(b[0])}</span><em>name: ______</em></div>`:`<div class="bc free"><img src="${LOGO}"><span>FREE</span></div>`).join('')}</div></div>`, BG.filter(b=>b[1]).map(b=>'Find someone who '+b[0]+'.'));

// 15 역할극 미션
const RP=[['First Day','scene-words/18491',"It's your first day in a new class. Introduce yourself and ask the person next to you one question."],['At a Party','scene-words/15597',"You meet someone at a friend's party. Start a chat and find one thing you both like."]];
add('role', TOP('Role-play',15)+`<h2>Mission <span>Cards</span></h2><div class="rc">${RP.map((r,i)=>`<article style="transform:rotate(${i?1.5:-1.5}deg)"><img src="${IMG(r[1])}"><div class="rb"><span class="tm">⏱ 1 min</span><h3>${r[0]}</h3><p>${e(r[2])}</p></div></article>`).join('')}</div>`, RP.map(r=>r[2]));

// 16 VS — 누구와 이야기할래
add('vs2', `<div class="half hl"><img src="${IMG('scene-words/18482')}"><div class="lbl sm">a famous person</div></div><div class="half hr"><img src="${IMG('gen/future')}"><div class="lbl sm">a person from<br>the future</div></div>
<div class="vsq"><div class="vsb">OR</div></div><div class="vt">${TOP('Would You Rather…?',16,1)}<h2>Who would you rather <span>talk to</span>?</h2></div>
<div class="vsbar">What would you ask them? Think of <b>3 questions</b>!</div>`, ['Would you rather talk to a famous person or a person from the future?','What would you ask them? Think of three questions!']);

// 17 60초 도전
const TP=['my hometown','my favorite food','my weekend','my dream'];
add('timer', `<img class="full" src="${IMG('gen/speaker')}"><div class="shade3"></div>${TOP('Final Challenge',17,1)}
<div class="tm2"><div class="ring"><b>60</b><small>seconds</small></div><div><h2 class="w">Talk for<br><span>60 seconds!</span></h2><p class="w2">Pick a topic and don't stop talking:</p><div class="topics">${TP.map(t=>`<span>${t}</span>`).join('')}</div></div></div>`, ['Talk for sixty seconds!','Pick a topic and don\'t stop talking.',...TP]);

// 18 마무리
const RV=['Nice to meet you.','Where are you from?','What do you do for fun?','What are you interested in?','Tell me about yourself.'];
add('fin', `<img class="full" src="${IMG('gen/jump')}"><div class="shade"></div>${TOP('Wrap-up',18,1)}
<div class="fn"><div class="badge">🏆<small>MISSION<br>COMPLETE</small></div><h1>Great talking<br>with you!</h1><ul>${RV.map(r=>`<li>✔ ${e(r)}</li>`).join('')}</ul><p>See you next time · <b>SIU BASIC 002 — About You</b></p></div><img class="logo" src="${LOGO}">`, ['Great talking with you!',...RV,'See you next time!']);

const css = fs.readFileSync(new URL('./style2.css', import.meta.url),'utf8');
const fonts = fs.readFileSync(new URL('./fonts2.css', import.meta.url),'utf8');
const html = `<!doctype html><meta charset="utf-8"><style>${fonts}${css}</style>`+S.map((s,i)=>`<section class="s k-${s[0]}" id="s${i+1}">${s[1]}</section>`).join('\n');
fs.writeFileSync(new URL('./slides.html', import.meta.url), html);
const say = Object.fromEntries(S.map((s,i)=>[`[${BOOK}] New / Slide${i+1}.JPG`, s[2].map(x=>[x])]));
fs.writeFileSync(new URL('./siu-basic-01.say.json', import.meta.url), JSON.stringify(say));
console.log('slides', S.length, 'lines', S.reduce((a,s)=>a+s[2].length,0));
