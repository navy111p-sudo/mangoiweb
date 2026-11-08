/* A.i speaking result card: read-only; never fabricates scores or grants rewards.
 * Pass a server-verified result object only after normal lesson completion.
 */
(function(root){
'use strict';
function text(v){return String(v == null ? '' : v);}
function measured(v){return typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100;}
function node(tag,cls,content){var el=document.createElement(tag);if(cls)el.className=cls;if(content!=null)el.textContent=text(content);return el;}
function render(container,result,lang){
 if(!container)throw new Error('Missing container');
 container.replaceChildren();
 var ko=lang!=='en';
 if(!result||result.finishedNormally!==true){container.appendChild(node('p','ai-progress-empty',ko?'수업이 정상 종료되면 학습 결과를 확인할 수 있어요.':'Your results will appear after the lesson ends normally.'));return;}
 var title=node('h2','ai-progress-title',ko?'오늘의 말하기 성장':'Speaking progress');container.appendChild(title);
 var score=result.score;
 var valid=measured(score)&&['pronunciation','fluency','grammar','vocabulary','sentence'].every(function(k){return measured(result.skills&&result.skills[k]);});
 container.appendChild(node('p','ai-progress-score',valid?Math.round(score)+'/100':ko?'종합 점수 미측정':'Overall score unavailable'));
 container.appendChild(node('p','ai-progress-note',ko?'기록된 영어 대화의 AI 평가입니다. 발음·유창성은 음성 평가가 없으면 미측정으로 표시해요.':'AI assessment of recorded English conversation. Pronunciation and fluency remain unmeasured without audio assessment.'));
 if(Number.isSafeInteger(result.recordedTurns)) container.appendChild(node('p','ai-progress-note',ko?'기록된 발화 '+result.recordedTurns+'회 기준 · 종합 점수는 5영역 모두 측정된 경우 표시합니다.':'Based on '+result.recordedTurns+' recorded turns. The overall score requires all five measured skills.'));
 if(result.captureLimited) container.appendChild(node('p','ai-progress-note',ko?'대화가 길어 일부 기록을 기준으로 한 결과입니다.':'This long conversation is assessed from a limited recording of the text.'));
 if(result.evaluationStatus==='unavailable') container.appendChild(node('p','ai-progress-note',ko?'지금은 평가를 완료하지 못했어요. 기록된 단어와 확인된 보상만 표시합니다.':'Assessment is unavailable. Recorded words and confirmed rewards are shown below.'));
 var names={pronunciation:['발음','Pronunciation'],fluency:['유창성','Fluency'],grammar:['문법','Grammar'],vocabulary:['어휘','Vocabulary'],sentence:['문장 구성','Sentence structure']};
 var list=node('dl','ai-progress-skills');
 Object.keys(names).forEach(function(k){
  var v=result.skills&&result.skills[k];
  var ok=measured(v);
  var row=node('div','ai-progress-skill');
  row.appendChild(node('dt','',names[k][ko?0:1]));
  row.appendChild(node('dd','',ok?Math.round(v)+'/100':ko?'미측정':'Not measured'));
  list.appendChild(row);
 });container.appendChild(list);
 var words=Array.isArray(result.uniqueWords)?result.uniqueWords:[];
 var review=Array.isArray(result.reviewWords)?result.reviewWords:[];
 container.appendChild(node('p','ai-progress-words',(ko?'사용한 영어 고유 단어: ':'Unique English words used: ')+words.length));
 container.appendChild(node('p','ai-progress-review',(ko?'교정문에서 복습할 표현: ':'Expressions from your corrections: ')+(review.length?review.slice(0,12).map(text).join(', '):ko?'아직 없어요':'None recorded')));
 var r=result.rewards;
 if(r){
  var value=function(v){return Number.isSafeInteger(v)&&v>=0?String(v):(ko?'확인 불가':'Unavailable');};
  container.appendChild(node('h3','',ko?'확인된 보상':'Confirmed rewards'));
  container.appendChild(node('p','', (ko?'이 연습의 적립 포인트: ':'Points earned in this practice: ')+value(r.pointsEarned)+(Number.isSafeInteger(r.pointsEarned)&&r.pointsEarned>=0?'P':'')));
  container.appendChild(node('p','', (ko?'완료 시점 포인트 잔액: ':'Point balance at completion: ')+value(r.pointsBalance)+(Number.isSafeInteger(r.pointsBalance)&&r.pointsBalance>=0?'P':'')));
  container.appendChild(node('p','', '💎 '+(ko?'완료 시점 보유 보석: ':'Gem balance at completion: ')+value(r.gemsBalance)));
  container.appendChild(node('p','', (ko?'확인된 배지: ':'Recorded badges: ')+(Array.isArray(r.badges)?r.badges.length:(ko?'확인 불가':'Unavailable'))));
 }
}
root.AiSpeakingProgressView={render:render};
})(typeof window!=='undefined'?window:globalThis);
