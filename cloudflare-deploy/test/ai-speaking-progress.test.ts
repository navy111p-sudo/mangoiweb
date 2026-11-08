import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { defaultCorrectionMode, correctionPrompt, correctionTimingOf, showDuringPractice, evaluateSpeaking } from '../src/ai-speaking-progress.ts';
test('level defaults',()=>{assert.equal(defaultCorrectionMode(1),'immediate');assert.equal(defaultCorrectionMode(3),'key-mistakes');assert.equal(defaultCorrectionMode(5),'after-lesson');});
test('correction prompts',()=>{for(const mode of ['immediate','key-mistakes','after-lesson'] as const) assert.ok(correctionPrompt(mode).length > 30);});
test('timing independently filters validated corrections',()=>{
  const major = {severity:'major'} as const, minor = {severity:'minor'} as const;
  assert.equal(correctionTimingOf('focused'),'');
  assert.equal(showDuringPractice('',minor),true);
  assert.equal(showDuringPractice('immediate',minor),true);
  assert.equal(showDuringPractice('key-mistakes',minor),false);
  assert.equal(showDuringPractice('key-mistakes',major),true);
  assert.equal(showDuringPractice('after-lesson',major),false);
});
const sample={lessonId:'l1',studentId:'s1',finishedNormally:true,evaluatedAt:'2026-11-08T00:00:00Z',skills:{pronunciation:90,fluency:80,grammar:85},spokenWords:['Apple','apple','hello'],correctedWords:['Hello'],sentencesCompleted:4,evaluationSource:'verified-engine'};
test('overall score requires all five measured skills',()=>{
  const partial=evaluateSpeaking(sample);
  assert.equal(partial.score,null);
  assert.equal(partial.skills.grammar,85);
  assert.deepEqual(partial.uniqueWords,['apple','hello']);
  const full=evaluateSpeaking({...sample,skills:{...sample.skills,vocabulary:95,sentence:100}});
  assert.equal(full.score,90);
});
test('rejects incomplete lesson',()=>{assert.throws(()=>evaluateSpeaking({...sample,finishedNormally:false}));});
test('no invented score when none provided',()=>{assert.equal(evaluateSpeaking({...sample,skills:{}}).score,null);});
test('invalid scores rejected',()=>{assert.throws(()=>evaluateSpeaking({...sample,skills:{grammar:105}}));});

test('rejects malformed evaluation payloads at the runtime boundary',()=>{
  const invalid = [null, undefined, {...sample,studentId:' '}, {...sample,lessonId:12},
    {...sample,evaluationSource:''}, {...sample,finishedNormally:'true'},
    {...sample,evaluatedAt:'invalid'}, {...sample,skills:null}, {...sample,skills:[]},
    {...sample,skills:{grammar:NaN}}, {...sample,skills:{grammar:'90'}},
    {...sample,skills:{grammar:Infinity}}, {...sample,skills:{unknown:90}},
    {...sample,spokenWords:null}, {...sample,correctedWords:[12]},
    {...sample,sentencesCompleted:1.5}, {...sample,sentencesCompleted:-1}];
  for (const payload of invalid) assert.throws(()=>evaluateSpeaking(payload as any));
});
test('accepts all eight levels and rejects values outside the supported levels',()=>{
  for(let level=1;level<=8;level++) assert.ok(defaultCorrectionMode(level));
  for(const level of [0,-1,9,1.5,NaN,Infinity]) assert.throws(()=>defaultCorrectionMode(level));
});
test('result is detached from mutable evaluation scores',()=>{
  const e={...sample,skills:{grammar:90}};
  const result=evaluateSpeaking(e);
  e.skills.grammar=0;
  assert.equal(result.skills.grammar,90);
});
test('real evaluator output can be consumed by the result view',()=>{
  function element(tag:string):any{return {tagName:tag,children:[],textContent:'',className:'',appendChild(x:any){this.children.push(x)},replaceChildren(){this.children=[]}};}
  const window:any={};
  vm.runInNewContext(readFileSync(new URL('../public/js/ai-speaking-progress-view.js',import.meta.url),'utf8'),{window,document:{createElement:element}});
  const result=evaluateSpeaking(sample);
  assert.equal(result.studentId,'s1');
  assert.equal(result.lessonId,'l1');
  assert.equal(result.evaluatedAt,sample.evaluatedAt);
  const container=element('section');
  window.AiSpeakingProgressView.render(container,result,'en');
  assert.match(JSON.stringify(container),/Speaking progress/);
  assert.match(JSON.stringify(container),/90\/100/);
  assert.doesNotMatch(JSON.stringify(container),/after the lesson ends normally/);
});

