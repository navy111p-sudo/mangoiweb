const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const code=fs.readFileSync(require('node:path').join(__dirname,'../public/js/situation-resume.js'),'utf8');
function setup(){
 const s=new Map([['mangoi_warmup_sid','session-a']]),l=new Map();
 const storage=m=>({getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)});
 const c={window:{MangoiSituations:{find:id=>id==='new-friend'}},sessionStorage:storage(s),localStorage:storage(l)};
 vm.runInNewContext(code,c);return {api:c.window.MangoSituationResume,s,l};
}
test('same tab restores plain messages; account and session changes reject them',()=>{
 const {api,s,l}=setup();api.save('new-friend','session-a',[{who:'me',text:'Hello'}]);
 assert.equal(api.read().messages[0].text,'Hello');
 l.set('mango_user',JSON.stringify({uid:'other'}));assert.equal(api.read(),null);
 l.clear();s.set('mangoi_warmup_sid','new-session');assert.equal(api.read(),null);
});
test('expired, malformed and unknown-situation snapshots are not restored',()=>{
 const {api,s}=setup();api.save('new-friend','session-a',[{who:'ai',text:'Hi'}]);
 const valid=JSON.parse(s.get('mangoi_situation_resume'));
 for(const delta of [{at:Date.now()-1800001},{at:'bad'},{sit:'unknown'},{messages:[{who:'sys',text:'bad'}]}]){
  s.set('mangoi_situation_resume',JSON.stringify({...valid,...delta}));assert.equal(api.read(),null);
 }
});
test('saving keeps only the latest 48 messages',()=>{
 const {api}=setup();api.save('new-friend','session-a',Array.from({length:60},(_,i)=>({who:'me',text:String(i)})));
 assert.equal(api.read().messages.length,48);assert.equal(api.read().messages[0].text,'12');
});
test('Send finalizes recording, ignores repeated stop, and permits a chosen text answer after quiet cancellation',async()=>{
 const html=fs.readFileSync(require('node:path').join(__dirname,'../public/warmup.html'),'utf8');
 const source=html.slice(html.indexOf('async function sendMsg(){'),html.indexOf('/* 🌐 첫 그리기'));
 for(const state of [
  {_whisperOn:true,_recognizing:false,_micStopWanted:false,_micBase:'',_micSess:'',stops:1,reads:0},
  {_whisperOn:false,_recognizing:true,_micStopWanted:false,_micBase:'',_micSess:'hello',stops:1,reads:0},
  {_whisperOn:false,_recognizing:true,_micStopWanted:true,_micBase:'',_micSess:'hello',stops:0,reads:0},
  {_whisperOn:false,_recognizing:true,_micStopWanted:true,_micBase:'',_micSess:'',stops:0,reads:1}
 ]){
  let stops=0,reads=0;
  const c={...state,_warmPaused:false,sending:false,toggleMic:()=>stops++,warmupRatePreference:{get ready(){reads++;return new Promise(()=>{});}}};
  vm.runInNewContext(source+'\nsendMsg();',c);
  assert.equal(stops,state.stops);assert.equal(reads,state.reads);
 }
});
