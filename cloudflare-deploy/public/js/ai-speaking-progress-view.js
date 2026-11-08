/* A.i speaking result card: read-only; never fabricates scores or grants rewards.
 * Pass a server-verified result object only after normal lesson completion.
 */
(function(root){
'use strict';
function text(v){return String(v == null ? '' : v);}
function node(tag,cls,content){var el=document.createElement(tag);if(cls)el.className=cls;if(content!=null)el.textContent=text(content);return el;}
function render(container,result,lang){
 if(!container)throw new Error('Missing container');
 container.replaceChildren();
 var ko=lang!=='en';
 if(!result||result.finishedNormally!==true){container.appendChild(node('p','ai-progress-empty',ko?'수업이 정상 종료되면 학습 결과를 확인할 수 있어요.':'Your results will appear after the lesson ends normally.'));return;}
 var title=node('h2','ai-progress-title',ko?'오늘의 말하기 성장':'Speaking progress');container.appendChild(title);
 var score=result.score;
 var valid=typeof score==='number'&&Number.isFinite(score)&&score>=0&&score<=100;
 container.appendChild(node('p','ai-progress-score',valid?Math.round(score)+'/100':ko?'종합 점수 미측정':'Overall score unavailable'));
 var names={pronunciation:['발음','Pronunciation'],fluency:['유창성','Fluency'],grammar:['문법','Grammar'],vocabulary:['어휘','Vocabulary'],sentence:['문장 구성','Sentence structure']};
 var list=node('dl','ai-progress-skills');
 Object.keys(names).forEach(function(k){
  var v=result.skills&&result.skills[k];
  var ok=typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100;
  var row=node('div','ai-progress-skill');
  row.appendChild(node('dt','',names[k][ko?0:1]));
  row.appendChild(node('dd','',ok?Math.round(v)+'/100':ko?'미측정':'Not measured'));
  list.appendChild(row);
 });container.appendChild(list);
 var words=Array.isArray(result.uniqueWords)?result.uniqueWords:[];
 var review=Array.isArray(result.reviewWords)?result.reviewWords:[];
 container.appendChild(node('p','ai-progress-words',(ko?'사용한 고유 단어: ':'Unique words used: ')+words.length));
 container.appendChild(node('p','ai-progress-review',(ko?'복습할 단어: ':'Words to review: ')+review.slice(0,12).map(text).join(', ')));
 // These are *informational* numbers only, not a wallet balance or award transaction.
 var stars=Number.isSafeInteger(result.stars)&&result.stars>=0?result.stars:0;
 var gems=Number.isSafeInteger(result.gems)&&result.gems>=0?result.gems:0;
 container.appendChild(node('p','ai-progress-reward',(ko?'예상 보상':'Estimated rewards')+' · ⭐ '+stars+' · 💎 '+gems));
}
root.AiSpeakingProgressView={render:render};
})(typeof window!=='undefined'?window:globalThis);
