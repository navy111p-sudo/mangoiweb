// -*- coding: utf-8 -*-
// 🧠 망고아이 복습퀴즈 통합 테스트 하네스 (의존성 없음 · node 로 바로 실행)
//   실행:  node test-harness/review_quiz_harness.mjs
//   범위:  복습퀴즈 전체 흐름 — 저장 검증 → 채점(전유형) → 정답 비공개 → 랜덤출제(draw)
//          → 서버 TTS 에러처리(할당량) → 관리자 '문제 미리보기/정검' 오류검출
//   주의:  실제 소스(api-mango.ts / admin.html / review-quiz.html) 규칙을 미러링한 사양 테스트 +
//          핵심 항목은 소스를 직접 읽어 일치 여부를 교차검증한다.

import { readFileSync } from 'node:fs';
import { allSrc, allAdm } from './_srcbundle.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, '..');
const read = (rel) => { try { return readFileSync(resolve(ROOT, rel), 'utf8'); } catch { return ''; } };
const API = allSrc();
const ADMIN = allAdm();
const STUDENT = read('cloudflare-deploy/public/review-quiz.html');

let PASS = 0, FAIL = 0; const FAILS = []; const SECT = {}; let cur = '(init)';
function section(n){ cur = n; SECT[cur] ??= { p:0, f:0 }; console.log('\n' + n); }
function check(n, c){ if(c){PASS++;SECT[cur].p++;}else{FAIL++;SECT[cur].f++;FAILS.push(cur+' › '+n);} console.log(`  ${c?'✅':'❌'} ${n}`); }
function eq(n,a,b){ check(n+` (=${JSON.stringify(b)})`, JSON.stringify(a)===JSON.stringify(b)); }

console.log('🧠 복습퀴즈 통합 테스트 하네스 · ' + new Date().toISOString());

// ════════════════════════════════════════════════════════════════════
// [A] 저장 검증 — rqParseQuestions (POST /api/admin/review-quiz/save 미러)
// ════════════════════════════════════════════════════════════════════
section('[A] 출제 저장 검증 (잘못된 문항 차단)');
function rqParse(raw){
  let list = [];
  if (Array.isArray(raw)) list = raw;
  else { try { list = JSON.parse(String(raw||'[]')); } catch { return { ok:false, error:'questions_invalid_json' }; } }
  if (!Array.isArray(list) || list.length===0) return { ok:false, error:'questions_required' };
  const clean = [];
  for (const q of list) {
    const type = ['choice','listen','write','speak'].includes(String(q&&q.type)) ? String(q.type) : 'choice';
    const explain = String((q&&q.explain)||'').trim();
    let text = String((q&&q.q)||'').trim();
    if (type==='choice' || type==='listen') {
      const opts = Array.isArray(q&&q.opts) ? q.opts.map(o=>String(o==null?'':o).trim()) : [];
      const answer = Number(q&&q.answer);
      if (type==='listen' && !text) text = '🎧 잘 듣고 알맞은 답을 고르세요.';
      if (!text) return { ok:false, error:'question_text_required' };
      if (opts.length<2 || opts.length>6 || opts.some(o=>!o)) return { ok:false, error:'options_required' };
      if (!Number.isInteger(answer) || answer<0 || answer>=opts.length) return { ok:false, error:'answer_index_invalid' };
      const audioText = String((q&&q.audio_text)||'').trim();
      if (type==='listen' && !audioText) return { ok:false, error:'audio_text_required' };
      const item = { type, q:text, opts, answer, explain };
      if (type==='listen') item.audio_text = audioText.slice(0,300);
      clean.push(item);
    } else {
      const answerText = String((q&&q.answer_text)||'').trim();
      if (!answerText) return { ok:false, error:'answer_text_required' };
      if (type==='speak' && !text) text = '🎤 아래 문장을 또박또박 읽어보세요.';
      if (type==='write' && !text) return { ok:false, error:'question_text_required' };
      const accept = (Array.isArray(q&&q.accept)?q.accept:[]).map(a=>String(a==null?'':a).trim()).filter(Boolean).slice(0,8);
      clean.push({ type, q:text, answer_text:answerText.slice(0,300), accept, explain });
    }
  }
  return { ok:true, list:clean };
}
eq('빈 문항배열 → questions_required', rqParse([]).error, 'questions_required');
eq('깨진 JSON → questions_invalid_json', rqParse('{not json').error, 'questions_invalid_json');
eq('객관식 보기 1개 → options_required', rqParse([{type:'choice',q:'?',opts:['a'],answer:0}]).error, 'options_required');
eq('객관식 보기 7개 → options_required(최대6)', rqParse([{type:'choice',q:'?',opts:['a','b','c','d','e','f','g'],answer:0}]).error, 'options_required');
eq('빈 보기 포함 → options_required', rqParse([{type:'choice',q:'?',opts:['a',''],answer:0}]).error, 'options_required');
eq('정답번호 범위밖 → answer_index_invalid', rqParse([{type:'choice',q:'?',opts:['a','b'],answer:5}]).error, 'answer_index_invalid');
eq('듣기 음성텍스트 없음 → audio_text_required', rqParse([{type:'listen',q:'?',opts:['a','b'],answer:0}]).error, 'audio_text_required');
eq('쓰기 정답문장 없음 → answer_text_required', rqParse([{type:'write',q:'?'}]).error, 'answer_text_required');
eq('말하기 정답문장 없음 → answer_text_required', rqParse([{type:'speak'}]).error, 'answer_text_required');
check('정상 객관식 → 저장 통과', rqParse([{type:'choice',q:'2+2?',opts:['3','4'],answer:1}]).ok);
check('듣기 지문 비면 기본문구 자동 채움', rqParse([{type:'listen',opts:['a','b'],answer:0,audio_text:'a'}]).list[0].q.length>0);
check('말하기 지문 비면 기본문구 자동 채움', rqParse([{type:'speak',answer_text:'hi'}]).list[0].q.length>0);
check('소스 일치: 저장검증이 answer_index_invalid 가드', /answer_index_invalid/.test(API) && /options_required/.test(API));

// ════════════════════════════════════════════════════════════════════
// [B] 채점 — rqGrade (POST /api/review-quiz/submit 미러, 무응답 NaN 수정 포함)
// ════════════════════════════════════════════════════════════════════
section('[B] 채점 정확도 (객관식/듣기/쓰기/말하기 + 무응답)');
const rqNorm = (s)=>String(s==null?'':s).toLowerCase().replace(/[^a-z0-9가-힣\s']/g,' ').replace(/\s+/g,' ').trim();
const rqWordAcc = (target,said)=>{ const t=rqNorm(target).split(' ').filter(Boolean), s=rqNorm(said).split(' ').filter(Boolean); if(!t.length)return 0; const pool=s.slice(); let hit=0; for(const w of t){const i=pool.indexOf(w); if(i>=0){hit++;pool.splice(i,1);}} return hit/t.length; };
function rqGrade(qs, answers){
  let score=0;
  const detail = qs.map((q,i)=>{
    const type=q.type||'choice'; const a=answers[i];
    if(type==='choice'||type==='listen'){
      const ans=(a==null||a==='')?NaN:Number(a);   // 수정 반영: 무응답은 NaN
      const correct=Number.isInteger(ans)&&ans===Number(q.answer);
      if(correct)score++; return {idx:i,type,correct};
    }
    const said=String(a==null?'':a).slice(0,500);
    let accuracy=Math.round(rqWordAcc(q.answer_text,said)*100); let correct=false;
    if(type==='write'){ const cands=[rqNorm(q.answer_text),...((q.accept||[]).map(x=>rqNorm(x)))].filter(Boolean); correct=!!said.trim()&&(cands.includes(rqNorm(said))||accuracy>=85); }
    else { correct=accuracy>=60; }
    if(correct)score++; return {idx:i,type,correct,accuracy};
  });
  return {score,detail};
}
eq('객관식 정답', rqGrade([{type:'choice',answer:1}],[1]).score, 1);
eq('객관식 오답', rqGrade([{type:'choice',answer:1}],[0]).score, 0);
eq('듣기 정답(보기index)', rqGrade([{type:'listen',answer:2}],[2]).score, 1);
eq('🔒 무응답(null)+정답0번 → 오답(회귀)', rqGrade([{type:'choice',answer:0}],[null]).score, 0);
eq('무응답(undefined) → 오답', rqGrade([{type:'choice',answer:0}],[undefined]).score, 0);
eq('쓰기 정확일치(대소문무관)', rqGrade([{type:'write',answer_text:'I like apples'}],['i like apples']).score, 1);
eq('쓰기 accept 동의답', rqGrade([{type:'write',answer_text:'I like apples',accept:['I love apples']}],['I love apples']).score, 1);
eq('말하기 60%이상 정답', rqGrade([{type:'speak',answer_text:'Good morning teacher'}],['good morning friend']).score, 1);
eq('말하기 33% 오답', rqGrade([{type:'speak',answer_text:'Good morning teacher'}],['good night']).score, 0);

// ════════════════════════════════════════════════════════════════════
// [C] 정답 비공개 + 랜덤출제(draw) + served 채점
// ════════════════════════════════════════════════════════════════════
section('[C] 정답 비공개 · 랜덤출제 · served 채점 무결성');
const rqSafe = (qs)=>qs.map((q,i)=>{ const t=q.type||'choice'; const o={idx:i,type:t,q:q.q}; if(t==='choice'||t==='listen')o.opts=q.opts; if(t==='speak')o.target=q.answer_text; if(t==='listen')o.has_audio=true; return o; });
{
  const bank=[{type:'listen',q:'들어보세요',opts:['cat','dog'],answer:0,audio_text:'cat',explain:'동물'},{type:'write',q:'사과?',answer_text:'apple'}];
  const safe=rqSafe(bank);
  check('듣기: audio_text(정답원문) 미노출', safe[0].audio_text===undefined);
  check('객관식/듣기: answer 미노출', safe[0].answer===undefined);
  check('쓰기: answer_text 미노출', safe[1].answer_text===undefined);
  check('해설 미노출', safe.every(x=>x.explain===undefined));
  check('🔒 정답이 클라이언트로 새지 않음', !JSON.stringify(safe).includes('apple') && !/"answer"/.test(JSON.stringify(safe)));
}
function gradeSubmit(bank, served, answers){ const qs=(served&&served.length)?served.map(i=>bank[i]):bank; const {score}=rqGrade(qs,answers); const total=qs.length; return {score,total,percent:total?Math.round(score/total*100):0}; }
{
  const bank=[{type:'choice',answer:0},{type:'choice',answer:1},{type:'choice',answer:0},{type:'choice',answer:1}];
  eq('served=[1,3] 두 문항만 채점', gradeSubmit(bank,[1,3],[1,1]).total, 2);
  eq('served=[1,3] 둘 다 정답 → 100%', gradeSubmit(bank,[1,3],[1,1]).percent, 100);
  eq('served=[1,3] 한 개 정답 → 50%', gradeSubmit(bank,[1,3],[1,0]).percent, 50);
}
check('소스 일치: submit 이 served 로만 채점', /served\s*&&\s*served\.length/.test(API) || /b\.served/.test(API));
check('소스 일치: 학생 get 은 rqSafeQuestions/rqSafeOne 사용', /rqSafeQuestions|rqSafeOne/.test(API));

// ════════════════════════════════════════════════════════════════════
// [D] 서버 TTS 에러처리 (POST /api/review-quiz/tts 미러 — 2026-06-13 수정)
//   버그였던 동작: aura-1 의 에러 Response(429) 를 음성으로 그대로 내보냄.
//   수정: raw.ok + audio content-type 일 때만 음성 반환, 429/뉴런소진은 quota 503.
// ════════════════════════════════════════════════════════════════════
section('[D] 서버 TTS 에러처리 (AI 할당량 소진 대응)');
const isQuota = (m)=>/429|neuron|allocation|free allocation/i.test(String(m||''));
// 핸들러 분기 미러 (네트워크/AI 미호출 — 응답 객체만 시뮬레이션)
function ttsDecide(auraResp, meloResult){
  let quota=false;
  if (auraResp){
    const ct = auraResp.headers['content-type']||'';
    if (auraResp.ok && /audio/i.test(ct)) return { kind:'audio', from:'aura' };
    if (auraResp.status===429) quota=true;
  }
  if (meloResult && meloResult.audio) return { kind:'audio', from:'melo' };
  if (meloResult && isQuota(meloResult.error)) quota=true;
  return { kind:'json', status: quota?503:500, error: quota?'ai_quota_exceeded':'tts_failed', quota };
}
eq('정상 aura 음성 → audio 반환', ttsDecide({ok:true,status:200,headers:{'content-type':'audio/mpeg'}},null).kind, 'audio');
check('🔒 aura 429(AiError) 를 음성으로 내보내지 않음', ttsDecide({ok:false,status:429,headers:{'content-type':'application/json'}},null).kind === 'json');
eq('aura 429 + melo 실패 → quota 503', ttsDecide({ok:false,status:429,headers:{'content-type':'application/json'}},{error:'used up your daily free allocation of 10,000 neurons'}).status, 503);
eq('quota 응답엔 ai_quota_exceeded', ttsDecide({ok:false,status:429,headers:{'content-type':'application/json'}},{error:'neuron'}).error, 'ai_quota_exceeded');
eq('aura 실패 → melo 음성 폴백', ttsDecide({ok:false,status:500,headers:{}},{audio:'BASE64'}).from, 'melo');
eq('둘 다 실패(비할당량) → tts_failed 500', ttsDecide({ok:false,status:500,headers:{}},{error:'model_error'}).status, 500);
check('할당량 분류기: 429/neuron/allocation 감지', isQuota('httpCode 429')&&isQuota('used up daily free allocation')&&isQuota('neuron'));
// 소스 교차검증 (수정이 실제 반영됐는지)
check('소스 일치: aura 는 raw.ok + audio 일 때만 반환', /raw\.ok\s*&&\s*\/audio\/i\.test\(ct\)/.test(API));
check('소스 일치: 429 를 quota 로 표시', /raw\.status\s*===\s*429[\s\S]{0,30}quota\s*=\s*true/.test(API));
check('소스 일치: quota 면 ai_quota_exceeded 503 반환', /ai_quota_exceeded[\s\S]{0,40}503/.test(API) || /quota\s*\?\s*'ai_quota_exceeded'/.test(API));
check('소스 일치(학생): playAudio 가 quota 메시지 표시', /음성 잠시 제한|Audio paused/.test(STUDENT));
check('소스 일치(학생): 듣기 실패해도 다음 진행(내비 버튼 항상 클릭 가능)', /onclick="moveQ\(1\)"/.test(STUDENT) && !/<button class="nav-btn[^>]*"\s+disabled/.test(STUDENT));

// ════════════════════════════════════════════════════════════════════
// [E] 관리자 '문제 미리보기/정검' 오류검출 (admin.html rqRenderPreview 미러)
// ════════════════════════════════════════════════════════════════════
section('[E] 관리자 정검(오류 자동검출)');
function rqQA(qs){
  let errs=0; const found=[];
  const norm=(v)=>String(v==null?'':v).trim().toLowerCase();
  qs.forEach((x,i)=>{
    const t=(x&&x.type)||'choice'; const w=[];
    if(t==='choice'||t==='listen'){
      const opts=x.opts||[]; const ans=Number(x.answer);
      if(opts.length<2) w.push('보기부족');
      if(!(typeof ans==='number'&&ans%1===0&&ans>=0&&ans<opts.length)) w.push('정답범위밖');
      const seen={}; opts.forEach(o=>{const k=norm(o); if(k){ if(seen[k]) w.push('보기중복'); seen[k]=1; }});
      if(t==='listen'){ if(!norm(x.audio_text)) w.push('음성텍스트없음'); else if(opts[ans]!=null&&norm(x.audio_text)!==norm(opts[ans])) w.push('음성≠정답'); }
    } else if(t==='write'){ if(!norm(x.answer_text)) w.push('정답없음'); }
    else { if(!norm(x.answer_text)) w.push('문장없음'); }
    if(!norm(x.q)&&t!=='speak') w.push('지문없음');
    errs+=w.length; if(w.length) found.push({i,w});
  });
  return {errs,found};
}
eq('정상 듣기문항 → 오류 0', rqQA([{type:'listen',q:'?',opts:['cat','dog'],answer:0,audio_text:'cat'}]).errs, 0);
eq('정답 범위밖 검출', rqQA([{type:'choice',q:'?',opts:['a','b'],answer:9}]).found[0].w.includes('정답범위밖'), true);
eq('보기 중복 검출', rqQA([{type:'choice',q:'?',opts:['a','a'],answer:0}]).found[0].w.includes('보기중복'), true);
eq('듣기 음성텍스트 누락 검출', rqQA([{type:'listen',q:'?',opts:['a','b'],answer:0}]).found[0].w.includes('음성텍스트없음'), true);
eq('듣기 음성≠정답보기 검출', rqQA([{type:'listen',q:'?',opts:['cat','dog'],answer:0,audio_text:'bird'}]).found[0].w.includes('음성≠정답'), true);
eq('빈 지문(객관식) 검출', rqQA([{type:'choice',q:'',opts:['a','b'],answer:0}]).found[0].w.includes('지문없음'), true);
eq('쓰기 정답문장 누락 검출', rqQA([{type:'write',q:'?'}]).found[0].w.includes('정답없음'), true);
eq('말하기 지문없음은 오류 아님', rqQA([{type:'speak',q:'',answer_text:'hi'}]).errs, 0);
check('소스 일치: admin 에 rqRenderPreview/rqPreview 존재', /function rqRenderPreview/.test(ADMIN) && /window\.rqPreview/.test(ADMIN));
check('소스 일치: 정검이 음성≠정답/정답범위밖 검출', /음성텍스트 ≠ 정답보기|정답 번호 범위 밖/.test(ADMIN));
check('소스 일치: 제목 클릭 → rqPreview 연결', /onclick="rqPreview\(/.test(ADMIN));

// ════════════════════════════════════════════════════════════════════
//  요약 + 리포트
// ════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(60));
const lines = ['🧠 복습퀴즈 통합 테스트 리포트', '생성: '+new Date().toISOString(), '='.repeat(60)];
for (const [n,s] of Object.entries(SECT)) { const t=s.p+s.f; const row=`${s.f===0?'✅':'⚠️'} ${n}: ${s.p}/${t} 통과`; console.log('  '+row); lines.push(row); }
console.log('═'.repeat(60));
const summary = `총 ${PASS+FAIL}건 중 ✅ ${PASS} 통과 / ❌ ${FAIL} 실패`;
console.log(summary); lines.push('-'.repeat(60), summary);
if (FAIL>0){ console.log('\n❌ 실패:'); lines.push('', '실패 항목:'); for(const f of FAILS){ console.log('  - '+f); lines.push('  - '+f);} }
else { console.log('\n🎉 복습퀴즈 전체 통과 — 출제·채점·정답비공개·TTS에러·정검 회귀 없음.'); lines.push('🎉 전체 통과'); }
try { const { writeFileSync } = await import('node:fs'); writeFileSync(resolve(__dir,'review_quiz_report.txt'), lines.join('\n')+'\n','utf8'); console.log('\n📝 리포트: test-harness/review_quiz_report.txt'); } catch(e){}
process.exit(FAIL>0?1:0);
