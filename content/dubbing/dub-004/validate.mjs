import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const HERE=dirname(fileURLToPath(import.meta.url));
const ROOT=resolve(HERE,'../../..'), PUB=resolve(ROOT,'cloudflare-deploy/public');
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const C=createRequire(import.meta.url)(resolve(PUB,'js/ai-dubbing-core.js'));
const draft=read(resolve(HERE,'episode.draft.json')), plan=read(resolve(HERE,'production-plan.json'));
const n=C.normalizeEpisode(draft);
assert.equal(n.ok,true);assert.deepEqual(n.problems,[]);
assert.equal(draft.id,'dub-004');assert.equal(draft.status,'preview');assert.equal(draft.timing,'provisional');
assert.deepEqual(draft.playable,['kai','emma','maya','pip','momo']);
assert.equal(draft.scenes.length,6);assert.equal(draft.scenes.reduce((a,s)=>a+s.durationSec,0),240);
const ids=new Set();
for(const s of draft.scenes){
 assert.equal(s.lines.length,10);assert.equal(s.durationSec,40);
 assert.equal(C.sceneTimingValid(s),true,'planned timing must be ordered, although NOT lip-synced');
 for(const id of draft.playable)assert.equal(s.lines.filter(l=>l.speaker===id).length,2);
 for(const l of s.lines){assert(!ids.has(l.id));ids.add(l.id);assert(l.ko&&l.emotion);const wc=(l.en.match(/[A-Za-z']+/g)||[]).length;assert(wc>=3&&wc<=8,`${l.id}: ${wc} words`);}
 assert.equal(s.videoAudio,'mute');assert.deepEqual(s.voices,{});assert.equal(s.bgm,null);
}
assert.equal(ids.size,60);
assert.equal(new Set(Object.values(draft.characters).map(c=>c.ttsSpeaker)).size,5);
const api=readFileSync(resolve(ROOT,'cloudflare-deploy/src/api-games.ts'),'utf8');
const getSet=key=>new Set(api.match(new RegExp(`const ${key} = new Set\\(\\[([^\\]]+)\\]\\)`))[1].match(/[a-z]+/g));
const a1=getSet('AURA1'),a2=getSet('AURA2'),male=getSet('AURA2_MALE'),sub={};
api.match(/const AURA1_SUB[^\{]*\{([\s\S]*?)\};/)[1].replace(/\/\/[^\n]*/g,'').replace(/([a-z]+): '([a-z]+)'/g,(_,k,v)=>sub[k]=v);
const voices=Object.values(draft.characters).map(c=>c.ttsSpeaker);
assert(voices.every(x=>a2.has(x)));assert.equal(new Set(voices.map(x=>a1.has(x)?x:sub[x]||(male.has(x)?'orion':'luna'))).size,5);
// All 31 non-empty subsets of the five roles; production core, not a second engine.
let assignments=0;
for(let mask=1;mask<32;mask++){
 const cast=draft.playable.filter((_,i)=>mask&(1<<i)).map(character=>({name:character,character}));
 assert.deepEqual(C.castProblems(cast,n.episode),[]);
 const muted=C.mutedCharacters(cast);
 for(const s of n.episode.scenes){
  assert.equal(s.timing,'turn');assert.equal(s.voiceMode,'tts');
  for(const a of C.assignLines(s,cast,{})){assert.equal(a.performer.type,muted[a.line.speaker]?'student':'native');assignments++;}
 }
}
// Simulated future complete stems prove contract compatibility, NOT media quality.
const simulated=structuredClone(draft);simulated.timing='synced';
for(const s of simulated.scenes){s.bgm=`/media/dubbing/dub-004/scene-${s.no}-bgm.wav`;s.voices=Object.fromEntries(draft.playable.map(id=>[id,`/media/dubbing/dub-004/scene-${s.no}-${id}.wav`]));}
const syn=C.normalizeEpisode(simulated);assert.deepEqual(syn.problems,[]);
for(const s of syn.episode.scenes){assert.equal(s.timing,'synced');assert.equal(s.voiceMode,'stems');assert(s.bgm.endsWith('-bgm.wav'));}
delete simulated.scenes[5].voices.pip;
assert.equal(C.normalizeEpisode(simulated).episode.scenes[5].voiceMode,'tts','missing final-scene Pip stem must fall back');
assert.equal(plan.scenes.flatMap(s=>s.shots).length,24);
assert.equal(plan.scenes.flatMap(s=>s.shots).reduce((v,s)=>v+s.end-s.start,0),240);
const idx=read(resolve(PUB,'data/dubbing/index.json'));
assert.equal(idx.episodes.find(x=>x.id==='dub-004').status,'coming');
assert(!existsSync(resolve(PUB,'data/dubbing/dub-004.json')),'unproduced episode must remain outside public assets');
console.log(`PASS: 6 scenes / 240 planned seconds / 60 bilingual lines / 5 roles / ${assignments} role assignments / distinct TTS fallbacks / 24 shots / simulated stem fallback / public card remains coming.`);
console.log('NOT TESTED: real video, microphone, TTS audio, pronunciation API, lip sync, mixed export. No media exists.');
