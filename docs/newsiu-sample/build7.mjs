// New SIU 샘플 7판 — 출판사 교재 구조(단원 흐름·I can 목표·모범 대화·정보차·설문·Time to speak·발표·발음) + 말하기 극대화.
// 사장님 지시(2026-09-28): 「국내외 잘 만든 출판사 교재들을 잘 보고 다시 한번 만들어 줄래. 여기에 말은 더 많이 할 수 있게.」
// 망고아이 수업은 1:1 화상이라 짝·모둠 활동을 «학생 ↔ 선생님» 으로 바꿨습니다.
// 쪽마다 «내가 말하는 횟수(turns)» 를 적고 뒤표지 앞 쪽에 합계를 보여 줍니다.
// 사용: node build7.mjs easy|hard → slides7-easy.html · say7-easy.json · ko-chars-7easy.txt
import fs from 'fs';
import { KW, QS, IMG_E, IMG_H, E6, H6, E7, H7, PICS } from './content7.mjs';
const MODE = process.argv[2] === 'hard' ? 'hard' : 'easy';
const V6 = MODE === 'hard' ? H6 : E6, V = MODE === 'hard' ? H7 : E7, IMGS = MODE === 'hard' ? IMG_H : IMG_E;
const R = '/home/user/mangoiweb/';
const IMG = p => p.startsWith('gen/') ? `file://${R}docs/newsiu-sample/${p}.webp` : `file://${R}cloudflare-deploy/public/img/${p}.webp`;
const LOGO = `file://${R}cloudflare-deploy/public/img/mango-char.png`;
const BOOK = 'SIU BASIC 001 - A talk with you';
const e = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
const blank = s => e(s).replace(/___/g,'<u class="bl"></u>').replace(/…/g,'<u class="bl bs"></u>');
const COL = ['#FF5A36','#2B59FF','#FF3D8B','#00A896','#7B4DFF','#FF9F1C'];
const S = []; let TRACK = 0; const T = () => `<span class="trk">🎧 ${String(++TRACK).padStart(2,'0')}</span>`;
// 쪽 하나: 부분(sec) 번호·이름, I can 목표, 내가 말하는 횟수, 본문, 읽을 문장
const page = (o) => S.push(o);
const HEAD = (o) => o.sec ? `<header class="hd7" style="--c:${o.c}"><b>${o.sec}</b><span>${o.name}</span>${o.can?`<em class="can">I can ${e(o.can)}</em>`:''}</header>` : '';
const FOOT = (o, n) => `<footer class="ft7 ${o.dark?'dk':''}">${o.ko?`<span class="kfn7">💡 ${o.ko}</span>`:'<span></span>'}${o.turns?`<span class="turns">🗣 My turns ×${o.turns}</span>`:''}<span class="fo">SIU BASIC 001 · A Talk with You <b>${n}</b></span></footer><div class="lvtag ${MODE}">${MODE==='hard'?'HARD':'EASY'}</div>`;
const PAIR = (a,b) => `<div class="who7"><span class="t">T</span>${a}<i>↔</i><span class="st">S</span>${b}</div>`;

// 1 표지
page({cls:'cover', dark:1, html:`<img class="full" src="${IMG('gen/cover')}"><div class="cvg7"></div>
<div class="cvbox"><small>SIU BASIC · UNIT 1</small><h1>A Talk<br><em>with You</em></h1>
<ul>${['Talk about yourself','Ask and answer 10 questions','Give a short presentation'].map(t=>`<li>${t}</li>`).join('')}</ul></div>
<div class="cvturn"><b>%%TOTAL%%</b>times you speak<br>in this unit</div><img class="logo7" src="${LOGO}">`, say:['Unit one. A Talk with You.']});

// 2 도입 Think-Pair-Share (NGL)
page({cls:'open', sec:'1', name:'Warm-up', c:COL[1], can:'share ideas with a partner', turns:6, html:`<div class="op7"><div class="opimg"><img src="${IMG(PICS.opener)}"></div>
<div><ol class="tps">${[['THINK','Think for 30 seconds.'],['PAIR','Tell your teacher.'],['SHARE','Ask your teacher back!']].map((t,i)=>`<li style="--c:${COL[i+2]}"><b>${t[0]}</b>${t[1]}</li>`).join('')}</ol>
<div class="qs7">${V.opener.think.map((q,i)=>`<p><b>${i+1}</b>${e(q)}</p>`).join('')}</div>
<div class="hint7">${MODE==='hard'?'Start with: <i>I think… because…</i>':'Start with: <i>I think… / Yes! / No.</i>'}</div></div></div>`, say:V.opener.think});

// 3 낱말 (Speak Now — 모든 활동에 말하기)
page({cls:'words', sec:'2', name:'Words', c:COL[0], can:'use 10 new words', turns:10, ko:'뜻 확인 · '+KW.map(k=>k[0]+' '+k[2]).join(' · '), html:`<div class="wd7">${KW.map((k,i)=>`<div class="wc" style="--c:${COL[i%6]}"><img src="${IMG(IMGS[i])}"><b>${k[0]}</b><small>${e(k[3])}</small></div>`).join('')}</div>
${PAIR('points to a picture','says the word + one sentence')}`, say:KW.map(k=>k[0]+'. '+k[3].charAt(0).toUpperCase()+k[3].slice(1)+'.')});

// 4 문법 1 현재시제 (원본 2쪽)
page({cls:'gr1', sec:'3', name:'Grammar', c:COL[3], can:'talk about things I do', turns:MODE==='hard'?6:4, html:`<div class="gr7"><div class="rule"><h2>Simple <em>Present</em></h2>
<p><mark>Again and again</mark> → I <b>study</b> English every day.</p><p><mark class="m2">True now</mark> → I <b>am</b> a student.</p>${MODE==='hard'?'<p class="adv7">always · usually · sometimes · never</p>':''}</div>
<div class="chain"><h3>🔗 Say it! Chain</h3><p>Take turns with your teacher. Don't stop!</p>${V6.spTurn.map(t=>`<div class="fr7">${blank(t)}</div>`).join('')}
<div class="ex7">T: I drink coffee every day.<br>S: I eat breakfast every day.<br>T: I …</div></div></div>`, say:['Simple present is used to talk about an action which happens on a regular basis.','I study English every day.','I am a student.']});

// 5 문법 2 like/likes · Are you (원본 3·4쪽)
page({cls:'gr2', sec:'3', name:'Grammar', c:COL[3], can:'ask "Do you…?" and "Are you…?"', turns:10, html:`<div class="gt7"><div class="c0"></div><div class="h">I · you · we · they</div><div class="h">he · she · it</div>
<div class="c0 a">+</div><div>I <b>like</b> kimchi.</div><div>She <b>like<mark>s</mark></b> kimchi.</div>
<div class="c0 n">−</div><div>I <b>don't like</b> kimchi.</div><div>He <b>doesn't like</b> kimchi.</div>
<div class="c0 q">?</div><div><b>Do</b> you like kimchi?</div><div><b>Does</b> she like kimchi?</div></div>
<div class="two7"><div class="card7" style="--c:${COL[1]}"><h3>Ask 5 times</h3>${V6.are.map(a=>`<span>Are you ${e(a)}?</span>`).join('')}<p class="ans">Yes, I am. / No, I'm not. <b>+ one more sentence</b></p></div>
<div class="card7" style="--c:${COL[2]}"><h3>Your family</h3><p class="big">${blank(V6.family)}</p><p class="ans">Then ask: <b>Does your mom like …?</b></p></div></div>`,
 say:['I like kimchi.','She likes kimchi.',"I don't like kimchi.","He doesn't like kimchi.",'Do you like kimchi?','Does she like kimchi?',...V6.are.map(a=>'Are you '+a+'?')]});

// 6 모범 대화 (Interchange) — 색칠한 곳 바꿔 말하기
const cv = V.convo.map(([w,t])=>`<p class="${w}"><b>${w}</b>${e(t).replace(/\{([^}]+)\}/g,'<mark>$1</mark>')}</p>`).join('');
page({cls:'conv', sec:'4', name:'Conversation', c:COL[4], can:'start a conversation', turns:MODE==='hard'?10:8, html:`<div class="cv7"><div class="cvimg"><img src="${IMG(PICS.talk)}"></div>
<div class="dlg">${T()}${cv}</div>
<div class="steps7"><p><b>1</b> Listen and read.</p><p><b>2</b> Practice with your teacher. Switch roles.</p><p><b>3</b> Change the <mark>colored words</mark>:</p>
<div class="sw">${V.swap.map(s=>`<span>${e(s[0])}</span>`).join('')}</div></div></div>`, say:V.convo.map(c=>c[1].replace(/[{}]/g,''))});

// 7 유용한 표현 (대화 전략)
page({cls:'lang', sec:'4', name:'Useful language', c:COL[4], can:'keep the talk going', turns:12, html:`<div class="ul7">${V.lang.map((g,i)=>`<div class="lb" style="--c:${COL[(i+1)%6]}"><h3>${g[0]}</h3>${g[1].map(x=>`<p>${e(x)}</p>`).join('')}</div>`).join('')}</div>
<div class="lp7"><h3>🔁 React! <small>Teacher says it → you react + ask back. Then switch.</small></h3><div>${V.langPractice.map((x,i)=>`<span style="--c:${COL[i%6]}">"${e(x)}"</span>`).join('')}</div></div>`,
 say:V.lang.flatMap(g=>g[1].map(x=>x.replace(' …',' like it, too.')))});

// 8~12 질문 카드 — 한 쪽에 두 질문 (원본 5~14쪽)
const QT = MODE==='hard' ? 8 : 6;
for (let p=0; p<5; p++) {
  const cards = [p*2, p*2+1].map(i => { const [kw,pos,ko,def]=KW[i], c=COL[i%6];
    return `<div class="qc" style="--c:${c}"><div class="qimg"><img src="${IMG(IMGS[i])}"><span class="kw7"><small>${pos}</small>${kw}</span></div>
<div class="qb"><h3><i>Q${i+1}</i>${e(QS[i])}</h3>
<div class="mdl">${T()}${V6.model[i].map((s,k)=>`<span class="m${k}"><em>${V6.steps[k]}</em>${e(s)}</span>`).join('')}</div>
<div class="fr7">${blank(V6.frame[i])}</div>${MODE==='easy'?`<div class="bnk7">${V6.bank[i].map(b=>`<span>${e(b)}</span>`).join('')}</div>`:''}
<div class="fu"><b>Follow-up</b>${V6.more[i].map(m=>`<span>${e(m)}</span>`).join('')}</div></div></div>`; }).join('');
  page({cls:'qp', sec:'5', name:`Talk time ${p+1}/5`, c:COL[(p+2)%6], can:`answer in ${V6.steps.length} parts`, turns:QT*2,
    ko:'뜻 확인 · '+[p*2,p*2+1].map(i=>KW[i][0]+' = '+KW[i][2]).join(' · '),
    html:`<div class="qg">${cards}</div><div class="loop7"><b>A</b> asks <i>→</i> <b>B</b> answers in ${V6.steps.length} parts <i>→</i> <b>A</b> asks a follow-up <i>→</i> <b>switch!</b></div>`,
    say:[p*2,p*2+1].flatMap(i=>[QS[i], ...V6.model[i], ...V6.more[i]])});
}

// 13 설문 (Smart Choice) — 1:1 이라 «나 · 선생님»
page({cls:'surv', sec:'6', name:'Survey', c:COL[5], can:'ask and report', turns:MODE==='hard'?20:14, html:`<div class="sv7"><div><h2>Me &amp; <em>my teacher</em></h2><p class="q7">${e(V.survey.q)}</p>
<table><thead><tr><th>Do you …</th>${V.survey.cols.map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>${V.survey.rows.map(r=>`<tr><td>${e(r)}?</td>${V.survey.cols.map(()=>'<td></td>').join('')}</tr>`).join('')}</tbody></table></div>
<div class="svr"><img src="${IMG(PICS.survey)}"><div class="rep"><small>📣 REPORT</small><p>${blank(V.survey.report)}</p></div></div></div>`, say:V.survey.rows.map(r=>'Do you '+r+'?')});

// 14 정보차 (British Council) — 선생님 A 카드 · 학생 B 카드
const gapCard = (side, rows) => `<div class="gc7 ${side}"><h3>${side==='A'?'Teacher card A':'Student card B'}</h3><p class="nm">${V.gap.who}</p>${rows.map(r=>`<p><span>${e(r[0])}</span>${r[1]==='?'?'<b class="q">?</b>':e(r[1])}</p>`).join('')}</div>`;
page({cls:'gap', sec:'6', name:'Information gap', c:COL[5], can:'ask "Does he…?"', turns:MODE==='hard'?10:8, html:`<div class="gp7">${gapCard('A',V.gap.A)}<div class="gq"><h2>Find the <em>missing</em> facts</h2><p>Don't show your card! Ask and answer.</p>${V.gap.q.map(q=>`<span>${e(q)}</span>`).join('')}<p class="tip">He / She → <b>does</b> · lives · likes</p></div>${gapCard('B',V.gap.B)}</div>`, say:V.gap.q});

// 15 역할극
page({cls:'role', sec:'7', name:'Role-play', c:COL[2], can:'interview someone', turns:MODE==='hard'?14:10, html:`<div class="rp7"><div class="rc a"><img src="${IMG(PICS.reporter)}"><h3>A · Reporter <small>(teacher first)</small></h3>${V.role.A.map(x=>`<p>${e(x)}</p>`).join('')}</div>
<div class="rmid"><h2>The <em>New Student</em> Interview</h2><p>Act it out. Then <b>switch roles</b>!</p><div class="opn">"Hi! Can I ask you some questions for the school paper?"</div></div>
<div class="rc b"><img src="${IMG(PICS.opener)}"><h3>B · New student <small>(you first)</small></h3>${V.role.B.map(x=>`<p>${e(x)}</p>`).join('')}</div></div>`, say:['Hi! Can I ask you some questions for the school paper?']});

// 16 Time to speak (Evolve)
page({cls:'tts', sec:'8', name:'Time to speak', c:COL[0], can:'plan and share ideas', turns:MODE==='hard'?12:8, html:`<div class="ts7"><div><h2>${e(V.tts.title)}</h2><ol>${V.tts.steps.map((s,i)=>`<li style="--c:${COL[i]}"><b>${['PREPARE','ASK','DISCUSS','PRESENT'][i]}</b>${e(s)}</li>`).join('')}</ol></div>
<div class="tsr"><img src="${IMG(PICS.group)}"><div class="lb2"><small>Useful language</small>${V.tts.lang.map(l=>`<p>${blank(l)}</p>`).join('')}</div></div></div>`, say:V.tts.steps});

// 17 발표 (Speaking Time — 모범 발표 → 개요 → 발표)
page({cls:'spch', sec:'9', name:'Presentation', c:COL[1], can:`talk about myself for ${V.speech.time}`, turns:MODE==='hard'?9:6, html:`<div class="sp7"><div class="mod">${T()}<h3>Model speech</h3>${V.speech.model.map(x=>`<p>${e(x)}</p>`).join('')}</div>
<div class="out"><h3>My outline <small>(key words only!)</small></h3>${V.speech.outline.map((x,i)=>`<p><b>${i+1}</b>${e(x)}<u class="bl bw"></u></p>`).join('')}</div>
<div class="spr"><img src="${IMG(PICS.speech)}"><div class="tm">⏱ ${V.speech.time}</div><div class="ck"><small>Teacher checks</small>${V.speech.check.map(c=>`<p>☐ ${e(c)}</p>`).join('')}</div></div></div>`, say:V.speech.model});

// 18 발음
page({cls:'pron', sec:'10', name:'Pronunciation', c:COL[3], can:'say -s endings clearly', turns:12, html:`<div class="pr7"><div><h2>Three sounds of <em>-s</em></h2><div class="cols">${[['/s/',V.pron.s],['/z/',V.pron.z],['/ɪz/',V.pron.iz]].map((c,i)=>`<div style="--c:${COL[i+1]}"><b>${c[0]}</b>${c[1].map(w=>`<span>${w}</span>`).join('')}</div>`).join('')}</div>
<p class="gm">Teacher says a word → you point to the sound → you make a sentence: <i>"My sister watches TV."</i></p></div>
<div class="into"><h3>${T()} Questions go up or down</h3><p class="up">${e(V.pron.up)} <b>↗</b></p><p class="dn">${e(V.pron.down)} <b>↘</b></p><p class="gm">Yes/No → up · Wh- → down</p><p class="task">🗣 Ask your teacher 3 Yes/No questions and 3 Wh- questions. Teacher points ↗ or ↘!</p></div></div>`,
 say:[...V.pron.s,...V.pron.z,...V.pron.iz, V.pron.up, V.pron.down]});

// 19 돌아보기 — 이 단원에서 말한 횟수 합계
const TOTAL = S.reduce((a,p)=>a+(p.turns||0),0);
page({cls:'rev', sec:'★', name:'Review', c:COL[4], html:`<div class="rv7"><div><h2>Can <em>you</em> do it?</h2><ul>${V.review.map(r=>`<li>😀 😐 😟 <span>${e(r)}</span></li>`).join('')}</ul>
<div class="hw7">🎧 Homework: record your 1-minute talk and send it to your teacher.</div></div>
<div class="tally"><small>This unit, you spoke about</small><b>${TOTAL}</b><span>times!</span><p>Next time, try to beat your number!</p></div></div>`, say:V.review});

// 20 뒤표지
page({cls:'back', dark:1, html:`<img class="full" src="${IMG('gen/jump')}"><div class="cvg7 r"></div><div class="bk7"><h2>Great talking <em>with you!</em></h2><p>Next unit · <b>002 About You</b></p></div><img class="logo7" src="${LOGO}">`, say:['Great talking with you!']});

const css = fs.readFileSync(new URL('./style7.css', import.meta.url),'utf8');
const fonts = fs.existsSync(new URL('./fonts6.css', import.meta.url)) ? fs.readFileSync(new URL('./fonts6.css', import.meta.url),'utf8') : '';
const html = `<!doctype html><meta charset="utf-8"><style>${fonts}${css}</style><body class="${MODE}">` + S.map((p,i)=>`<section class="s p-${p.cls} ${p.dark?'dark':''}" id="s${i+1}">${HEAD(p)}<div class="bd7">${p.html}</div>${FOOT(p,i+1)}</section>`).join('\n');
fs.writeFileSync(new URL(`./slides7-${MODE}.html`, import.meta.url), html.replace('%%TOTAL%%', TOTAL));
fs.writeFileSync(new URL(`./ko-chars-7${MODE}.txt`, import.meta.url), [...new Set(html.replace(/data:[^)]+/g,'').match(/[가-힣]/g)||[])].join(''));
const folder = MODE === 'hard' ? 'New Hard' : 'New Easy';
const say = Object.fromEntries(S.map((p,i)=>[`[${BOOK}] ${folder} / Slide${i+1}.JPG`, p.say.map(x=>[x])]));
fs.writeFileSync(new URL(`./say7-${MODE}.json`, import.meta.url), JSON.stringify(say));
fs.writeFileSync(new URL(`./turns7-${MODE}.json`, import.meta.url), JSON.stringify({total:TOTAL, pages:S.map(p=>p.turns||0)}));
console.log(MODE, 'pages', S.length, 'turns', TOTAL, 'say', S.reduce((a,p)=>a+p.say.length,0));
