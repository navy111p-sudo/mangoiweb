// New SIU 샘플 6판 — 잡지 «TALK!» 형식 · 쉬운 판/어려운 판 · 말하기 중심 · 문장마다 소리.
// 사장님 지시(2026-09-28): ① 말 많이 하기 ② 쉬운/어려운 두 판(연령·수준으로 자동 선택) ③ 소리 ④ 다채로운 글자 ⑤ 형식에 얽매이지 않는 잡지.
// 원본: 구글 드라이브 «SIU BOOKS/SUI - Basic(PDF)/001 - A talk with you(Korean).pdf» — 문법·질문 10개·낱말 그대로.
// 사용: node build6.mjs easy|hard  → slides-easy.html / slides-hard.html + say-easy.json / say-hard.json
import fs from 'fs';
import { KW, QS, IMG_E, IMG_H, E, H } from './content6.mjs';
const MODE = process.argv[2] === 'hard' ? 'hard' : 'easy';
const V = MODE === 'hard' ? H : E, IMGS = MODE === 'hard' ? IMG_H : IMG_E;
const R = '/home/user/mangoiweb/';
const IMG = p => p.startsWith('gen/') ? `file://${R}docs/newsiu-sample/${p}.webp` : `file://${R}cloudflare-deploy/public/img/${p}.webp`;
const LOGO = `file://${R}cloudflare-deploy/public/img/mango-char.png`;
const BOOK = 'SIU BASIC 001 - A talk with you';
const e = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
const blank = s => e(s).replace(/___/g,'<u class="bl"></u>').replace(/…/g,'<u class="bl bs"></u>');
const COL = ['#FF5A36','#2B59FF','#FF3D8B','#00A896','#7B4DFF','#FF9F1C'];
const S = []; const add = (cls, html, lines) => S.push([cls, html, lines]); const P = () => S.length + 1;
const FOL = (dark) => `<div class="fol ${dark?'dk':''}"><b>TALK!</b> Issue 001 · A Talk with You<span>${P()}</span></div><div class="lvtag ${MODE}">${V.tag}</div>`;
const KFN = (t, dark) => `<div class="kfn ${dark?'dk':''}">💡 ${t}</div>`;
const STEPS = `<div class="steps">${V.steps.map((s,i)=>`<span style="--c:${COL[i]}">${i+1} ${s}</span>`).join('<i>→</i>')}</div>`;

// 1 표지
add('cover', `<img class="full" src="${IMG('gen/cover')}"><div class="cvg"></div>
<div class="mast">TALK!</div><div class="iss">ISSUE 001 · SIU BASIC</div>
<div class="cl1"><em>The</em> Talk-a-lot <b>Issue</b></div>
<div class="cl2"><small>INSIDE</small>10 questions we asked real students</div>
<div class="cl3">How to answer<br><b>like a pro</b></div>
<div class="cl4">Grammar in<br>60 sec!</div>
<div class="cvt">A Talk<br><em>with You</em></div>
<div class="lvtag big ${MODE}">${V.tag}</div><img class="logo" src="${LOGO}">`, ['Talk! Issue one. A Talk with You.']);

// 2 목차 + 편집장의 말
const TOC = [['How to answer like a pro',3],['Simple present in 60 seconds',4],['Are you …?',5],['Likes & dislikes',6],['Say it out loud!',7],['10 student interviews',8],['Word wall',18],['Your cover story',19]];
add('toc', `<div class="tocw"><div class="toch"><small>INSIDE THIS ISSUE</small><h2>Con<em>tents</em></h2>
<ol>${TOC.map((t,i)=>`<li style="--c:${COL[i%6]}"><b>${String(t[1]).padStart(2,'0')}</b>${e(t[0])}</li>`).join('')}</ol></div>
<div class="tocp">${IMGS.slice(0,4).map((p,i)=>`<img src="${IMG(p)}" class="tp${i}">`).join('')}
<div class="ed"><small>Editor's note ✍</small><p>This issue is all about <b>YOU</b>. Talk, talk, talk! Every answer today has <b>${V.steps.length} parts</b>.</p><span class="sig">— Mr. Mango</span></div></div></div>${FOL()}`,
 ['Inside this issue.', ...TOC.map(t=>t[0]+'.'), 'This issue is all about you. Talk, talk, talk!']);

// 3 대답 요령
const ex = V.model[1];
add('pro', `<div class="prow"><div><div class="kick" style="--c:#FF3D8B">FEATURE</div><h2>How to answer<br><em>like a pro</em></h2>${STEPS}
<div class="bad2"><small>✘ Too short!</small>"Where do you live?"<br><b>"Seoul."</b></div></div>
<div class="good2"><small>✔ ${V.steps.length}-part answer</small>${ex.map((s,i)=>`<p style="--c:${COL[i]}"><i>${V.steps[i]}</i>${e(s)}</p>`).join('')}<div class="hand">Say it with your partner! →</div></div></div>${FOL()}`,
 ["Don't stop at one word!", 'Where do you live? Seoul. Too short!', ...ex]);

// 4 현재시제 (원본 2쪽)
add('sp', `<div class="kick" style="--c:#2B59FF">GRAMMAR IN 60 SECONDS</div><h2 class="sph">Simple <em>Present</em></h2>
<div class="spw"><div class="spk1"><img src="${IMG('scene-words/18574')}"><div><h3>Things we do <mark>again and again</mark></h3><q>I <b>study</b> English every day.</q></div></div>
<div class="spk2"><img src="${IMG('scene-clips/7085')}"><div><h3>Things that are <mark class="m2">true now</mark></h3><q>I <b>am</b> a student.</q></div></div>
<div class="yt6"><small>🗣 YOUR TURN — say 2 things about you</small>${V.spTurn.map(t=>`<p>${blank(t)}</p>`).join('')}${MODE==='hard'?'<div class="adv">always · usually · sometimes · never</div>':''}</div></div>${FOL()}`,
 ['Simple present is used to talk about an action which happens on a regular basis.','I study English every day.','We use the present tense to talk about something that is true in the present.','I am a student.']);

// 5 Are you …? (원본 3쪽)
add('qa', `<img class="full" src="${IMG('scene-clips/7085')}"><div class="qag"></div>
<div class="qab"><span class="t1">Are</span> <span class="t2">you</span> <span class="t3">a student</span>?</div>
<div class="qal"><span class="t1">auxiliary verb</span><span class="t2">subject</span><span class="t3">noun</span></div>
<div class="yes">Yes, I am!<small>+ one more sentence</small></div><div class="no">No, I'm not.<small>+ one more sentence</small></div>
<div class="qac"><small>🗣 ASK YOUR PARTNER</small>${V.are.map((a,i)=>`<span style="--c:${COL[i]}">Are you ${e(a)}?</span>`).join('')}</div>
${KFN('뜻 확인 · auxiliary verb 조동사 · subject 주어 · noun 명사',1)}${FOL(1)}`,
 ['Are you a student?','Yes, I am a student.','No, I am not a student.',...V.are.map(a=>'Are you '+a+'?')]);

// 6 like 표 (원본 4쪽)
add('tbl', `<div class="tbw"><div class="tbl6"><div class="kick" style="--c:#00A896">GRAMMAR</div><h2>Likes &amp;<br><em>Dislikes</em></h2>
<div class="gt6"><div class="c0"></div><div class="hd">I · you · we · they</div><div class="hd">he · she · it</div>
<div class="c0 a">+</div><div>I <b>like</b> kimchi.</div><div>She <b>like<mark>s</mark></b> kimchi.</div>
<div class="c0 n">−</div><div>I <b>don't like</b> kimchi.</div><div>He <b>doesn't like</b> kimchi.</div>
<div class="c0 q">?</div><div><b>Do</b> you like kimchi?</div><div><b>Does</b> she like kimchi?</div></div>
<div class="yt6"><small>🗣 TALK ABOUT YOUR FAMILY</small><p>${blank(V.family)}</p></div></div>
<div class="tbp"><img src="${IMG('scene-words/14867')}"><div class="plus">he · she · it<b>+s!</b></div><div class="hand h2">Do you like kimchi?</div></div></div>${FOL()}`,
 ['I like kimchi.','She likes kimchi.',"I don't like kimchi.","He doesn't like kimchi.",'Do you like kimchi?','Does she like kimchi?']);

// 7 바꿔 말하기
add('drill', `<div class="kick" style="--c:#7B4DFF">SAY IT OUT LOUD!</div><h2>Change the <em>subject</em></h2>
<div class="drw6"><ol>${V.drill.map((d,i)=>`<li style="--c:${COL[i%6]}"><b>${e(d[0])}</b><span>${i?'<u class="bl bw"></u>':e(d[1])}</span></li>`).join('')}</ol>
<div class="drs"><div class="hand">Read it. Say it. Faster!</div><div class="pair6"><b>A</b> reads the cue → <b>B</b> says the sentence → <b>switch!</b></div></div></div>
${KFN('정답 확인 · '+V.drill.slice(1).map((d,i)=>(i+2)+') '+d[2]).join('  '))}${FOL()}`, V.drill.map(d=>d[2]));

// 8~17 인터뷰 10개 (원본 5~14쪽)
QS.forEach((q,i)=>{
  const [kw,pos,ko,def]=KW[i], c=COL[i%6], c2=COL[(i+2)%6], L=i%4, [nm,age]=V.who[i], img=IMG(IMGS[i]), no=String(i+1).padStart(2,'0');
  const head=`<div class="kick" style="--c:${c}">INTERVIEW ${no} / 10</div><h2 class="iq">${e(q)}</h2>`;
  const sticker=`<div class="kws" style="--c:${c}"><small>${pos}</small><b>${kw}</b><p>${e(def)}</p></div>`;
  const quote=`<blockquote style="--c:${c}"><span class="qm">“</span>${V.model[i].map((s,k)=>`<span class="s${k}">${e(s)}</span>`).join(' ')}<cite>— ${nm}, ${age}</cite></blockquote>`;
  const turn=`<div class="turn" style="--c:${c2}"><small>🗣 YOUR TURN</small><p>${blank(V.frame[i])}</p>${MODE==='easy'?`<div class="bank">${V.bank[i].map(b=>`<span>${e(b)}</span>`).join('')}</div>`:''}</div>`;
  const more=`<div class="more"><small>💬 KEEP TALKING</small>${V.more[i].map(m=>`<p>${e(m)}</p>`).join('')}</div>`;
  const tt=`<div class="tt6">⏱ ${V.talk}</div>`;
  let html;
  if (L===0) html=`<div class="Lpic"><img src="${img}"><i class="tape"></i>${sticker}</div><div class="Ltxt">${head}${quote}${turn}${more}</div>${tt}`;
  else if (L===1) html=`<img class="full" src="${img}"><div class="Bpanel" style="--c:${c}">${head}${quote}${turn}${more}</div>${sticker}${tt}`;
  else if (L===2) html=`<div class="Cban"><img src="${img}"><div class="Chd">${head}</div>${sticker}</div><div class="Ccols"><div>${quote}</div><div>${turn}${more}</div></div>${tt}`;
  else html=`<div class="Dtxt">${head}${quote}${turn}${more}</div><div class="Dcirc" style="--c:${c}"><img src="${img}"></div>${sticker}${tt}`;
  add('iv L'+L, html+KFN(`뜻 확인 · ${kw} = ${ko}`, L===1)+FOL(L===1), [q, kw+'. '+def.charAt(0).toUpperCase()+def.slice(1)+'.', ...V.model[i], ...V.more[i]]);
});

// 18 낱말 벽 (원본 퍼즐 대신 말하기)
add('words', `<div class="kick" style="--c:#FF3D8B">WORD WALL</div><h2>Talk with <em>today's words</em></h2>
<div class="ww6">${KW.map((k,i)=>`<span style="--c:${COL[i%6]};--r:${[-4,3,-2,5,-3,2,-5,4,-1,3][i]}deg">${k[0]}</span>`).join('')}</div>
<div class="yt6 wide"><small>🗣 ${e(V.wordTask[0])}</small><p class="hand h3">${e(V.wordTask[1])}</p></div>
${KFN('뜻 확인 · '+KW.map(k=>k[0]+' '+k[2]).join(' · '))}${FOL()}`, [V.wordTask[0], V.wordTask[1].replace(/"/g,'')]);

// 19 커버 스토리 — 짝 인터뷰 → 반 앞 발표
add('story', `<div class="stw"><div class="stcov"><div class="mast sm">TALK!</div><div class="ph">📷<br>YOUR PARTNER<br>ON THE COVER</div><div class="stn">_________</div></div>
<div><div class="kick" style="--c:#FF9F1C">YOUR COVER STORY</div><h2>Interview <em>your partner</em></h2>
<ol class="stp"><li><b>1</b>Ask <mark>${V.story.n}</mark> of today's questions.</li><li><b>2</b>Ask "keep talking" questions too.</li><li><b>3</b>Present your partner to the class!</li></ol>
<div class="turn" style="--c:#2B59FF"><small>🎤 REPORT</small><p>${blank(V.story.frame)}</p></div></div></div>${FOL()}`,
 ['Interview your partner.',`Ask ${V.story.n===3?'three':'five'} of today's questions.`,'Present your partner to the class!']);

// 20 뒤표지
add('back', `<img class="full" src="${IMG('gen/jump')}"><div class="cvg r"></div>
<div class="bk"><div class="hand h4">Great talking with you!</div><h2 class="w">Can you…?</h2>
<ul>${['use the simple present','use likes / doesn\'t / does',`answer in ${V.steps.length} parts`,'keep the talk going'].map(t=>`<li>☐ I can ${e(t)}.</li>`).join('')}</ul>
<p class="hw">🎧 Homework: record your answers to 3 questions!</p><p class="nx">NEXT ISSUE · <b>002 About You</b></p></div>${FOL(1)}<img class="logo" src="${LOGO}">`,
 ['Great talking with you!','I can use the simple present.',"I can use likes, doesn't, and does.",`I can answer in ${V.steps.length} parts.`,'I can keep the talk going.','Record your answers to three questions!']);

const css = fs.readFileSync(new URL('./style6.css', import.meta.url),'utf8');
const fonts = fs.existsSync(new URL('./fonts6.css', import.meta.url)) ? fs.readFileSync(new URL('./fonts6.css', import.meta.url),'utf8') : '';
const html = `<!doctype html><meta charset="utf-8"><style>${fonts}${css}</style><body class="${MODE}">`+S.map((s,i)=>`<section class="s m-${s[0].split(' ').join(' m-')}" id="s${i+1}">${s[1]}</section>`).join('\n');
fs.writeFileSync(new URL(`./slides-${MODE}.html`, import.meta.url), html);
// 한글 글꼴 부분집합용 글자 목록
const ko = [...new Set(html.replace(/data:[^)]+/g,'').match(/[가-힣]/g)||[])].join('');
fs.writeFileSync(new URL(`./ko-chars-${MODE}.txt`, import.meta.url), ko);
const folder = MODE === 'hard' ? 'New Hard' : 'New Easy';
const say = Object.fromEntries(S.map((s,i)=>[`[${BOOK}] ${folder} / Slide${i+1}.JPG`, s[2].map(x=>[x])]));
fs.writeFileSync(new URL(`./say-${MODE}.json`, import.meta.url), JSON.stringify(say));
console.log(MODE, 'slides', S.length, 'lines', S.reduce((a,s)=>a+s[2].length,0));
