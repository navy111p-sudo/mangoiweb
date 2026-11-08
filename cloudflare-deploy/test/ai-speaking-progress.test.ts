import test from 'node:test';
import assert from 'node:assert/strict';
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
