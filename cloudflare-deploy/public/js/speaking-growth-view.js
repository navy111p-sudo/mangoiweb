/* Read-only report rendering. Unknown scores stay unknown; text is never HTML. */
(function(root){
'use strict';
function render(host,g,en){
 if(!host)return;host.replaceChildren();host.hidden=!g;if(!g)return;
 function add(tag,text){var e=document.createElement(tag);e.textContent=text;host.appendChild(e);return e;}
 add('h3',en?'Confirmed speaking records':'확인된 말하기 연습 기록');
 add('p',(en?'Recorded sessions: ':'기록된 연습: ')+g.sessions+(en?' · Confirmed results: ':'회 · 확인된 결과: ')+g.turns+(en?'':'건'));
 var grades=g.grades||{},graded=(grades.perfect||0)+(grades.partial||0)+(grades.incomplete||0);
 if(graded)add('p',(en?'Server sentence grades — error-free: ':'서버 문장 판정 — 오류 없음: ')+(grades.perfect||0)+(en?' · correction needed: ':' · 교정 필요: ')+(grades.partial||0)+(en?' · incomplete: ':' · 미완성: ')+(grades.incomplete||0));
 var r=g.reading||{};
 function score(v){return typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100?v+'/100':en?'Not measured':'미측정';}
 if(r.samples>0)add('p',(en?'Audio against a reference sentence (server Azure assessment, ':'기준 문장 대비 음성 (서버 Azure 평가 ')+r.samples+(en?' samples) — pronunciation: ':'회) — 발음: ')+score(r.pronunciation)+(en?' · fluency: ':' · 유창성: ')+score(r.fluency));
 add('p',en?'Conversation skill scores: pronunciation, fluency, grammar, vocabulary and sentence structure are not measured. Audio-reference scores are separate from free conversation.':'대화의 발음·유창성·문법·어휘·문장 구성 점수는 미측정입니다. 기준 문장 음성 점수는 자유 대화 평가와 구분합니다.');
 (Array.isArray(g.corrections)?g.corrections:[]).slice(0,2).forEach(function(f){add('p',String(f.was||'')+' → '+String(f.now||''));});
 add('p',en?'Only authenticated server results recorded since tracking began are included. Missing records do not prove that practice did not happen.':'기록 저장이 시작된 이후 본인 인증과 서버 확인을 거친 결과만 포함합니다. 기록이 없다고 연습하지 않았다는 뜻은 아닙니다.').style.fontSize='12px';
 host.style.overflowWrap='anywhere';
}
root.SpeakingGrowthView={render:render};
})(typeof window!=='undefined'?window:globalThis);
