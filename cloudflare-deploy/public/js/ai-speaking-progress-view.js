/* A.i speaking result card: read-only; never fabricates scores or grants rewards.
 * Pass a server-verified result object only after normal lesson completion.
 */
(function(root){
'use strict';
function text(v){return String(v == null ? '' : v);}
function measured(v){return typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100;}
function node(tag,cls,content){var el=document.createElement(tag);if(cls)el.className=cls;if(content!=null)el.textContent=text(content);return el;}
function stat(value,label){var el=node('div','ai-progress-stat');el.appendChild(node('b','',value));el.appendChild(node('span','',label));return el;}
function svgEl(tag,attrs,content){var el=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.keys(attrs).forEach(function(k){el.setAttribute(k,attrs[k]);});if(content!=null)el.textContent=text(content);return el;}
// Triangle (3-axis radar). axes: [{label, ratio: 0..1 or null(unmeasured), shown}] - draws given values only, never fills a gap.
function triangle(container,title,axes){
 container.appendChild(node('h3','',title));
 var cx=130,cy=104,R=64,ang=[-90,30,150];
 var pt=function(i,r){var a=ang[i]*Math.PI/180;return [cx+R*r*Math.cos(a),cy+R*r*Math.sin(a)];};
 var pts=function(f){return [0,1,2].map(function(i){var p=pt(i,f(i));return p[0].toFixed(1)+','+p[1].toFixed(1);}).join(' ');};
 var svg=svgEl('svg',{'class':'ai-progress-tri',viewBox:'0 0 260 176',role:'img','aria-label':title+': '+axes.map(function(a){return a.label+' '+a.shown;}).join(', ')});
 [1/3,2/3,1].forEach(function(r){svg.appendChild(svgEl('polygon',{'class':'ai-progress-tri-grid',points:pts(function(){return r;})}));});
 var known=axes.every(function(a){return a.ratio!=null;});
 if(known)svg.appendChild(svgEl('polygon',{'class':'ai-progress-tri-shape',points:pts(function(i){return axes[i].ratio;})}));
 axes.forEach(function(a,i){
  var edge=pt(i,1);svg.appendChild(svgEl('line',{'class':'ai-progress-tri-grid',x1:cx,y1:cy,x2:edge[0].toFixed(1),y2:edge[1].toFixed(1)}));
  if(a.ratio!=null){var p=pt(i,a.ratio);svg.appendChild(svgEl('circle',{'class':'ai-progress-tri-dot',cx:p[0].toFixed(1),cy:p[1].toFixed(1),r:4}));}
  var x=edge[0].toFixed(1),y=i?edge[1]+16:edge[1]-22,label=svgEl('text',{'class':'ai-progress-tri-label',x:x,y:y.toFixed(1),'text-anchor':'middle'});
  label.appendChild(svgEl('tspan',{x:x},a.label));label.appendChild(svgEl('tspan',{'class':'ai-progress-tri-value',x:x,dy:14},a.shown));svg.appendChild(label);
 });
 container.appendChild(svg);
}
function vocabularyWeek(container,week,ko){
 if(week===undefined)return;
 container.appendChild(node('h3','',ko?'최근 7일 사용한 영어 단어':'English words used in the last 7 days'));
 var valid=Array.isArray(week)&&week.length===7&&week.every(function(d,i){
  if(!d||!/^\d{4}-\d{2}-\d{2}$/.test(d.date)||!Number.isSafeInteger(d.words)||d.words<0||typeof d.limited!=='boolean')return false;
  var at=Date.parse(d.date+'T00:00:00Z');
  return Number.isFinite(at)&&new Date(at).toISOString().slice(0,10)===d.date&&(!i||at-Date.parse(week[i-1].date+'T00:00:00Z')===86400000);
 });
 if(!valid){container.appendChild(node('p','ai-progress-note',ko?'어휘 사용 기록을 확인할 수 없어요.':'Vocabulary records are unavailable.'));return;}
 container.appendChild(node('p','ai-progress-note',ko?'한국 시간 기준 · 완료한 연습에서 하루 중복을 제외한 단어 수예요. 어휘 실력 점수는 아닙니다.':'Korea time · Distinct words per day from completed practice, not a vocabulary ability score.'));
 var list=node('ol','ai-progress-week'),max=Math.max.apply(null,week.map(function(d){return d.words;}).concat([1]));
 week.forEach(function(d){
  var row=node('li','ai-progress-day');
  row.appendChild(node('span','',d.date.slice(5).replace('-','/')));
  var bar=node('progress','ai-progress-bar');bar.max=max;bar.value=d.words;
  bar.setAttribute('aria-label',d.date+': '+d.words+(ko?'개 단어':' words'));row.appendChild(bar);
  row.appendChild(node('span','ai-progress-count',d.words+(ko?'개':' words')));list.appendChild(row);
 });container.appendChild(list);
 if(week.some(function(d){return d.limited;}))container.appendChild(node('p','ai-progress-note',ko?'긴 대화의 일부만 기록된 날이 포함되어 있어요.':'Some days include conversations with limited text capture.'));
}
function nextFocus(result){
 // Pick from server-confirmed corrections only; nothing confirmed means nothing shown.
 var fixes=Array.isArray(result.corrections)?result.corrections:[];
 for(var i=fixes.length-1;i>=0;i--){var f=fixes[i];if(f&&typeof f.now==='string'&&f.now.trim())return f.now.trim().slice(0,160);}
 var review=Array.isArray(result.reviewWords)?result.reviewWords:[];
 return review.length&&text(review[0]).trim()?text(review[0]).trim().slice(0,160):'';
}
function shareText(result,ko,focus){
 var lines=[ko?'망고아이 A.i 말하기':'Mangoi A.i Speaking'];
 var turns=Number.isSafeInteger(result.turns)?result.turns:result.recordedTurns;
 if(Number.isSafeInteger(turns)&&turns>0)lines.push(ko?'답변 '+turns+'회':turns+' replies');
 var words=Array.isArray(result.uniqueWords)?result.uniqueWords.length:0;
 if(result.wordCountMeasured!==false&&words>0)lines.push(ko?'사용한 영어 단어 '+words+'개':words+' English words used');
 if(focus)lines.push((ko?'다음 연습: ':'Next practice: ')+focus);
 return lines.join('\n');
}
function share(result,ko,focus,msg){
 var body=shareText(result,ko,focus),url='https://mangoi.ai',nav=root.navigator||{};
 var copied=function(){msg.textContent=ko?'복사했어요. 카카오톡·문자에 붙여넣어 보내세요.':'Copied. Paste it into KakaoTalk or a message.';};
 var manual=function(){msg.textContent=(ko?'아래 글을 복사해서 보내세요:\n':'Copy this text to share:\n')+body+'\n'+url;};
 var copy=function(){try{nav.clipboard.writeText(body+'\n'+url).then(copied,manual);}catch(_){manual();}};
 // Phones get the share sheet (KakaoTalk is there); PCs copy, like shareRecordingLink in adm-core.js.
 if((nav.maxTouchPoints||0)>0&&nav.share){
  nav.share({title:ko?'망고아이 A.i 말하기':'Mangoi A.i Speaking',text:body,url:url}).catch(function(e){if(!(e&&(e.name==='AbortError'||e.name==='NotAllowedError')))copy();});
  return;
 }
 copy();
}
function nextStep(container,result,ko){
 var focus=nextFocus(result);
 if(focus){
  container.appendChild(node('h3','',ko?'다음에 연습할 한 가지':'One thing to practice next'));
  container.appendChild(node('p','ai-progress-focus',focus));
 }
 var row=node('div','ai-progress-next'),msg=node('p','ai-progress-note','');
 var btn=node('button','ai-progress-retry',ko?'결과 공유하기':'Share result');btn.type='button';
 btn.onclick=function(){share(result,ko,focus,msg);};
 var link=node('a','ai-progress-retry',ko?'다음 원어민 수업 보기':'See my next class');link.href='/my-schedule.html';
 row.appendChild(btn);row.appendChild(link);container.appendChild(row);container.appendChild(msg);
}
function render(container,result,lang){
 if(!container)throw new Error('Missing container');
 container.replaceChildren();
 var ko=lang!=='en';
 var observed=!!result&&result.source==='warmup-session-observations'&&Number.isSafeInteger(result.turns)&&result.turns>0;
 if(!result||(!observed&&result.finishedNormally!==true)){container.appendChild(node('p','ai-progress-empty',ko?'수업이 정상 종료되면 학습 결과를 확인할 수 있어요.':'Your results will appear after the lesson ends normally.'));return;}
 var title=node('h2','ai-progress-title',observed?(ko?'이번 연습 결과':'This practice result'):(ko?'오늘의 말하기 성장':'Speaking progress'));container.appendChild(title);
 if(observed){
  var labels={perfect:['오류 없음','Error-free'],partial:['교정 필요','To fix'],incomplete:['미완성','Incomplete']};
  var count=function(k){var n=result.grades&&result.grades[k];return Number.isSafeInteger(n)&&n>=0?n:0;};
  var graded=Object.keys(labels).reduce(function(n,k){return n+count(k);},0);
  var stats=node('div','ai-progress-stats');stats.appendChild(stat(result.turns,ko?'확정된 답변':'Confirmed replies'));
  if(graded)Object.keys(labels).forEach(function(k){stats.appendChild(stat(count(k),labels[k][ko?0:1]));});
  container.appendChild(stats);
  if(!graded)container.appendChild(node('p','ai-progress-note',ko?'문장 등급 미제공':'Sentence grades not provided'));
  else triangle(container,ko?'문장 분포':'Sentence breakdown',Object.keys(labels).map(function(k){return {label:labels[k][ko?0:1],ratio:count(k)/graded,shown:count(k)};}));
  container.appendChild(node('p','ai-progress-note',ko?'현재 화면에서 확인한 문자 대화 결과예요. 새로고침하면 이 집계는 초기화돼요. 발음·유창성 등의 수치 평가는 제공되지 않았어요.':'These are text-conversation results confirmed on this page. This summary resets on reload. Numeric skill assessments, including pronunciation and fluency, were not provided.'));
  (Array.isArray(result.corrections)?result.corrections:[]).slice(-12).forEach(function(f){container.appendChild(node('p','ai-progress-correction',text(f.was)+' → '+text(f.now)+(f.why?' · '+text(f.why):'')));});
 }
 var score=result.evaluationStatus==='unavailable'?null:result.score;
 var skills=result.evaluationStatus==='unavailable'?{}:result.skills;
 var keys=['pronunciation','fluency','grammar','vocabulary','sentence'];
 var complete=keys.every(function(k){var v=skills&&skills[k];return typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100;});
 var valid=complete&&typeof score==='number'&&Number.isFinite(score)&&score>=0&&score<=100;
 container.appendChild(node('p',valid?'ai-progress-score':'ai-progress-score ai-progress-unmeasured',valid?Math.round(score)+'/100':ko?'종합 점수 미측정':'Overall score unavailable'));
 container.appendChild(node('p','ai-progress-note',ko?'서버가 확인한 연습 기록입니다. 검증된 수치가 없는 영역은 미측정으로 표시해요.':'These are server-confirmed practice records. Skills without validated numeric assessments are shown as not measured.'));
 if(Number.isSafeInteger(result.recordedTurns)) container.appendChild(node('p','ai-progress-note',ko?'기록된 발화 '+result.recordedTurns+'회 기준 · 종합 점수는 5영역 모두 측정된 경우 표시합니다.':'Based on '+result.recordedTurns+' recorded turns. The overall score requires all five measured skills.'));
 if(result.captureLimited) container.appendChild(node('p','ai-progress-note',ko?'대화가 길어 일부 기록을 기준으로 한 결과입니다.':'This long conversation is assessed from a limited recording of the text.'));
 if(result.evaluationStatus==='unavailable') container.appendChild(node('p','ai-progress-note',ko?'지금은 평가를 완료하지 못했어요. 기록된 단어와 확인된 보상만 표시합니다.':'Assessment is unavailable. Recorded words and confirmed rewards are shown below.'));
 var names={pronunciation:['발음','Pronunciation'],fluency:['유창성','Fluency'],grammar:['문법','Grammar'],vocabulary:['어휘','Vocabulary'],sentence:['문장 구성','Sentence structure']};
 var tri=['grammar','vocabulary','sentence'];
 if(!observed&&tri.some(function(k){return measured(skills&&skills[k]);}))triangle(container,ko?'문법 · 어휘 · 문장 구성':'Grammar · Vocabulary · Sentences',tri.map(function(k){var v=skills[k],ok=measured(v);return {label:names[k][ko?0:1],ratio:ok?v/100:null,shown:ok?Math.round(v):(ko?'미측정':'Not measured')};}));
 var list=node('dl','ai-progress-skills');
 Object.keys(names).forEach(function(k){
  var v=skills&&skills[k];
  var ok=measured(v);
  var row=node('div',ok?'ai-progress-skill':'ai-progress-skill ai-progress-unmeasured');if(ok&&row.style)row.style.setProperty('--v',Math.round(v)+'%');
  row.appendChild(node('dt','',names[k][ko?0:1]));
  row.appendChild(node('dd','',ok?Math.round(v)+'/100':ko?'미측정':'Not measured'));
  list.appendChild(row);
 });container.appendChild(list);
 var words=Array.isArray(result.uniqueWords)?result.uniqueWords:[];
 var review=Array.isArray(result.reviewWords)?result.reviewWords:[];
 container.appendChild(node('p','ai-progress-words',result.wordCountMeasured===false?(ko?'이 언어의 단어 수는 집계하지 않았어요.':'Word counts were not measured for this language.'):(ko?'사용한 영어 고유 단어: ':'Unique English words used: ')+words.length));
 container.appendChild(node('p','ai-progress-review',(ko?'교정문에서 복습할 표현: ':'Expressions from your corrections: ')+(review.length?review.slice(0,12).map(text).join(', '):ko?'아직 없어요':'None recorded')));
 vocabularyWeek(container,result.weeklyVocabulary,ko);
 var r=result.rewards;
 if(r){
  var value=function(v){return Number.isSafeInteger(v)&&v>=0?String(v):(ko?'확인 불가':'Unavailable');};
  container.appendChild(node('h3','',ko?'확인된 보상':'Confirmed rewards'));
  container.appendChild(node('p','', (ko?'이 연습의 적립 포인트: ':'Points earned in this practice: ')+value(r.pointsEarned)+(Number.isSafeInteger(r.pointsEarned)&&r.pointsEarned>=0?'P':'')));
  container.appendChild(node('p','', (ko?'확인한 포인트 잔액: ':'Confirmed point balance: ')+value(r.pointsBalance)+(Number.isSafeInteger(r.pointsBalance)&&r.pointsBalance>=0?'P':'')));
  container.appendChild(node('p','', '💎 '+(ko?'완료 시점 보유 보석: ':'Gem balance at completion: ')+value(r.gemsBalance)));
  container.appendChild(node('p','', (ko?'확인된 배지: ':'Recorded badges: ')+(Array.isArray(r.badges)?r.badges.length:(ko?'확인 불가':'Unavailable'))));
 }
 nextStep(container,result,ko);
}
root.AiSpeakingProgressView={render:render};
})(typeof window!=='undefined'?window:globalThis);
