const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../public/js/ai-speaking-session.js'),'utf8');
function session(){const root={SESSION_ID:'s'};vm.runInNewContext(source,{window:root});return root.AiSpeakingSession;}
const p={source:'warmup-verified-turn',sessionId:'s',turn:1,grade:'partial',spokenWords:['i','like','apples'],reviewWords:['apple'],correction:{was:'apples',now:'apple'}};
test('confirmed turns dedupe and preserve observations without invented scores',()=>{const s=session();s.record(p,'ctx');s.record(p,'ctx');const r=s.result('ctx');assert.equal(r.turns,1);assert.equal(r.grades.partial,1);assert.equal(r.uniqueWords.length,3);assert.equal(r.score,null);assert.equal(r.stars,undefined);});
test('other sessions and unrecognized sources are ignored',()=>{const s=session();s.record({...p,sessionId:'other'},'ctx');s.record({...p,source:'preview'},'ctx');assert.equal(s.result('ctx').turns,0);});
test('new lesson context clears old observations',()=>{const s=session();s.record(p,'old');assert.equal(s.result('new').turns,0);});
test('replayed request IDs do not add another result even with a new response time',()=>{const s=session();s.record({...p,eventId:'same-request'},'ctx');s.record({...p,eventId:'same-request',turn:2},'ctx');assert.equal(s.result('ctx').turns,1);});
