/* Page-memory observations from confirmed server replies. No wallet or numeric grading. */
(function(root){
'use strict';
var context='', seen=new Set(), observations=[];
function reset(key){context=key;seen.clear();observations=[];}
function record(p,key){
 if(key!==context)reset(key);
 if(!p||p.source!=='warmup-verified-turn'||p.sessionId!==root.SESSION_ID||!Number.isSafeInteger(p.turn)||p.turn<1)return;
 var id=typeof p.eventId==='string'&&p.eventId.length<=100?p.eventId:p.turn;
 if(seen.has(id))return;
 seen.add(id);observations.push(p);
}
function result(key){
 if(key!==context)reset(key);
 var words=new Set(),review=new Set(),grades={perfect:0,partial:0,incomplete:0},fixes=[];
 observations.forEach(function(p){
  ['spokenWords','reviewWords'].forEach(function(k){(Array.isArray(p[k])?p[k]:[]).forEach(function(w){if(typeof w==='string'&&w.length<=200)(k==='spokenWords'?words:review).add(w);});});
  if(Object.prototype.hasOwnProperty.call(grades,p.grade))grades[p.grade]++;
  if(p.correction&&typeof p.correction.was==='string'&&typeof p.correction.now==='string')fixes.push(p.correction);
 });
 return {source:'warmup-session-observations',turns:observations.length,grades:grades,corrections:fixes,score:null,skills:{},wordCountMeasured:observations.every(function(p){return p.wordCountMeasured!==false;}),uniqueWords:Array.from(words),reviewWords:Array.from(review)};
}
root.AiSpeakingSession={clear:function(){reset('');},record:record,result:result,requestId:function(){return root.crypto.randomUUID();}};
function arm(){if(!document.getElementById('wgFinish'))armFriend();}
function armFriend(){
 var chat=document.getElementById('chat');if(!chat)return;
 if(!root.SESSION_ID)root.SESSION_ID=root.crypto.randomUUID();
 var tools=document.createElement('div');tools.id='friendProgressTools';tools.style.cssText='display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px;max-width:100%;box-sizing:border-box';
 var label=document.createElement('label');label.htmlFor='friendCorrectionTiming';
 var select=document.createElement('select');select.id='friendCorrectionTiming';select.style.maxWidth='100%';
 var opts=[['','기존 정책 유지','Keep existing policy'],['immediate','바로 교정','Correct immediately'],['key-mistakes','주요 실수 최대 3회','Up to 3 key corrections'],['after-lesson','연습 후 모아서 보기','Review after practice']];
 opts.forEach(function(x){var o=document.createElement('option');o.value=x[0];select.appendChild(o);});
 try{select.value=root.AiSpeakSettings.read(localStorage).timing;}catch(e){}
 var note=document.createElement('span');note.setAttribute('role','status');var failed=false;
 // Painted again on 🌐 so the dropdown never stays in the language it was first drawn in.
 function paint(){
  var en=false;try{en=typeof root.getLang==='function'&&root.getLang()==='en';}catch(e){}
  label.textContent=en?'Correction timing':'교정 시점';
  opts.forEach(function(x,i){select.options[i].textContent=en?x[2]:x[1];});
  note.textContent=failed?(en?'Could not save this setting.':'설정을 저장하지 못했어요.'):'';
 }
 select.onchange=function(){try{failed=!root.AiSpeakSettings.chooseTiming(localStorage,select.value);}catch(e){failed=true;}paint();};
 paint();root.addEventListener('mangoi:lang-changed',paint);document.addEventListener('mangoi:lang-changed',paint);
 tools.append(label,select,note);chat.before(tools);
}
if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',arm);else arm();}
})(typeof window!=='undefined'?window:globalThis);
