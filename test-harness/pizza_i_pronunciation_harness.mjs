import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=readFileSync('cloudflare-deploy/public/student-game-grammar-pizza.html','utf8');
const block=html.slice(html.indexOf('var TTS_LANG ='),html.indexOf('/* ══════════ 음성 인식'));
const sent=[], spoken=[], native=[];
const synth={getVoices:()=>[],cancel(){},speak(u){spoken.push(u.text);}};
const box={GLANG:'en',DIFF:1,RATE_BY_DIFF:[1],Audio:class{pause(){}play(){return Promise.resolve();}},speechSynthesis:synth,SpeechSynthesisUtterance:function(t){this.text=t;},setTimeout(){return 1;},clearTimeout(){},URL:{createObjectURL:()=> 'blob:test'},fetch:async(_,r)=>{sent.push(JSON.parse(r.body));return {ok:true,headers:{get:()=> 'audio/mpeg'},blob:async()=>({})};}};
box.window={speechSynthesis:synth};vm.createContext(box);vm.runInContext(block,box);
const tick=()=>new Promise(r=>setImmediate(r));
for(const word of ['I','i',' I ','I.']){
  box._pzCache={};box.prefetchTts(word);await tick();
  assert.equal(sent.at(-1).text,'eye');
  const count=sent.length;box.speakWord(word);await tick();assert.equal(sent.length,count,'playback reuses normalized prefetch');
}
box.speak('I like school.');await tick();assert.equal(sent.at(-1).text,'I like school.');
for(const [text,lang] of [['我','zh-CN'],['I','zh-CN'],['like','en-US'],["I'm",'en-US']])assert.equal(box._pzSpeechText(text,lang),text);
box._pzCache={};box.fetch=async()=>{throw new Error('offline');};box.speakWord('I');await tick();assert.equal(spoken.at(-1),'eye','browser fallback receives homophone');
box.window.AndroidTTS={isReady:()=>true,stop(){},speak(text){native.push(text);}};
box.speakWord('I');assert.equal(native.at(-1),'eye','Android receives homophone');
assert.ok(html.includes('showWordTip(el, s.tokens[tokenIdx][0])'),'display uses original token');
console.log('PASS: standalone I uses /ai/ homophone for server, prefetch/cache, browser fallback and Android; sentences, other words, Chinese and display preserved');
