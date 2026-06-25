// -*- coding: utf-8 -*-
// 🥭 망고아이 핵심 기능 통합 테스트 하네스 (의존성 없음 · node 로 바로 실행)
//   실행:  node test-harness/core_features_harness.mjs
//   목적:  망고 화상영어의 5대 핵심 기능 "안전성 핵심 규칙"을 가짜 데이터로 검증한다.
//     1) 실시간 수업 세션 안정성   (src/signaling-room.ts, api-mango.ts attendance)
//     2) 숙제 처리 데이터 무결성    (api-mango.ts eval/create, points homework, retention)
//     3) AI 퀴즈 응답 정확도        (api-mango.ts rqGrade/rqNorm/rqWordAcc/rqSafe)
//     4) 카카오톡 평가표 발송 자동화 (src/solapi-client.ts)
//     5) 교재/교사 업로드 → 표시 검증 (api-mango.ts textbook-files, teacher-profiles)
//   주의: 이 하네스는 실제 소스의 규칙을 그대로 미러링한 사양(spec) 테스트입니다.
//         규칙을 바꾸면 여기도 같이 바꿔야 회귀를 잡습니다.
//         + 일부 항목은 실제 소스 파일을 직접 읽어 사양과 일치하는지 교차검증합니다.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = (f) => resolve(__dir, '../cloudflare-deploy/src/', f);
const readSrc = (f) => { try { return readFileSync(SRC(f), 'utf8'); } catch { return ''; } };
const readSrcAll = (f) => readSrc(f); // alias

let PASS = 0, FAIL = 0; const FAILS = [];
const SECT = {};
let cur = '(init)';
function section(name){ cur = name; SECT[cur] ??= { pass:0, fail:0 }; console.log('\n' + name); }
function check(name, cond){
  if (cond) { PASS++; SECT[cur].pass++; } else { FAIL++; SECT[cur].fail++; FAILS.push(cur + ' › ' + name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
}
function eq(name, a, b){ check(name + ` (=${JSON.stringify(b)})`, JSON.stringify(a) === JSON.stringify(b)); }

console.log('🥭 망고아이 핵심 기능 통합 테스트 하네스');
console.log('   ' + new Date().toISOString());

// ════════════════════════════════════════════════════════════════════
// [1] 실시간 수업 세션 안정성  (1:1 화상 시그널링 + 입장/출석 확정)
// ════════════════════════════════════════════════════════════════════
section('[1] 실시간 수업 세션 안정성');

// 1-A) 시그널링 방 정원 — src/signaling-room.ts 미러
//   주의(회귀 포인트): handleJoin 진입 시 자신은 이미 connections 에 들어가 있으므로
//                      size > MAX_PEERS 일 때만 room-full (>= 아님). >= 로 바꾸면 정상 2번째 입장이 막힘.
const MAX_PEERS = 2;
function handleJoinRoomFull(currentSizeAfterAdd){ return currentSizeAfterAdd > MAX_PEERS; }
eq('1번째 입장(size=1) → 정상', handleJoinRoomFull(1), false);
eq('2번째 입장(size=2) → 정상 (1:1 성립)', handleJoinRoomFull(2), false);
eq('3번째 입장(size=3) → room-full 차단', handleJoinRoomFull(3), true);
check('🔒 회귀가드: 정원 비교는 > 이며 >= 아님(2명 정상입장 보장)', !handleJoinRoomFull(MAX_PEERS));

// 교차검증: 실제 소스가 size > MAX_PEERS 를 쓰는지 확인
{
  const sig = readSrc('signaling-room.ts');
  check('소스 일치: MAX_PEERS = 2', /MAX_PEERS\s*=\s*2/.test(sig));
  check('소스 일치: room-full 은 sockets.length > MAX_PEERS', /sockets\.length\s*>\s*MAX_PEERS/.test(sig));
  check('소스 일치: room-full 시 거부 소켓 close', /room-full[\s\S]{0,200}ws\.close\(1000, 'room-full'\)/.test(sig));
}

// 1-B) 입장 토큰 만료 — exp(초) 검증
function tokenValid(payload, nowSec){ if (payload.exp && payload.exp < nowSec) return false; return true; }
const now = Math.floor(Date.now()/1000);
check('유효 토큰(exp 미래) → 입장 허용', tokenValid({ exp: now + 600 }, now));
check('만료 토큰(exp 과거) → 입장 거부', !tokenValid({ exp: now - 1 }, now));
check('exp 없는 토큰 → (구버전 호환) 통과', tokenValid({}, now));

// 1-C) 입장 → 출석 확정/결석 복구 — api-mango.ts /api/attendance/join 미러
//   수업 시간 내 입장이면 status='attended' 로 확정(결석배치 결과를 덮어씀), 시간 밖이면 'present'
function attendanceStatusOnJoin(withinClass){ return withinClass ? 'attended' : 'present'; }
eq('수업시간 내 입장 → attended 확정', attendanceStatusOnJoin(true), 'attended');
eq('수업시간 밖 입장 → present', attendanceStatusOnJoin(false), 'present');
// attended_at 은 COALESCE 로 최초값 보존(재입장해도 첫 입장시각 유지)
function coalesceAttendedAt(existing, now){ return existing != null ? existing : now; }
eq('재입장 시 attended_at 최초값 보존', coalesceAttendedAt(1000, 2000), 1000);
eq('첫 입장 시 attended_at 기록', coalesceAttendedAt(null, 2000), 2000);

// 교차검증: 실제 소스의 확정 로직
{
  const api = readSrc('api-mango.ts');
  check('소스 일치: 수업시간 내 status=attended 확정', /withinClass\s*\?\s*'attended'\s*:\s*'present'/.test(api));
  check('소스 일치: attended_at 은 COALESCE 보존', /attended_at\s*=\s*COALESCE\(attended_at/.test(api));
}

// ════════════════════════════════════════════════════════════════════
// [2] 숙제 처리 데이터 무결성  (평가표 점수 · 숙제 적립 · 미제출 리스크)
// ════════════════════════════════════════════════════════════════════
section('[2] 숙제 처리 데이터 무결성');

// 2-A) 평가표 종합점수 — api-mango.ts /api/eval/create 미러
//   5개 점수 중 null/NaN 제외, 평균을 소수1자리 반올림, 전부 비면 null
function evalOverall(scores){
  const v = scores.filter(x => x != null && !isNaN(x)).map(Number);
  return v.length ? Math.round((v.reduce((a,b)=>a+b,0)/v.length)*10)/10 : null;
}
eq('5점 평가 평균 (5,4,5,4,5) → 4.6', evalOverall([5,4,5,4,5]), 4.6);
eq('숙제 점수 null 은 평균에서 제외', evalOverall([5,null,5,null,5]), 5);
eq('전부 미입력 → null (0 으로 오염 금지)', evalOverall([null,null,null,null,null]), null);
eq('NaN 방어: 잘못된 입력 무시', evalOverall([4, NaN, 'x' === 'x' ? 4 : null]), 4);
check('🔒 무결성: 미입력 평가표가 0점으로 저장되지 않음', evalOverall([]) === null);

// 교차검증
{
  const api = readSrc('api-mango.ts');
  check('소스 일치: overall 은 null/NaN 제외 평균', /filter\(v\s*=>\s*v\s*!=\s*null\s*&&\s*!isNaN\(v\)\)/.test(api));
  check('소스 일치: overall 소수1자리 반올림', /Math\.round\(\(scores\.reduce[\s\S]{0,40}\/\s*scores\.length\)\s*\*\s*10\)\s*\/\s*10/.test(api));
  check('소스 일치: 평가 테이블에 score_homework 컬럼 존재', /score_homework\s+INTEGER/.test(api));
}

// 2-B) 숙제 완료 포인트 적립 — points 규칙(rule=homework): 20점, 쿨다운 3600s, 일일 3회
const HW_RULE = { code:'homework', points:20, cooldown_sec:3600, daily_limit:3 };
function canEarn(rule, lastEarnedAt, todayCount, now){
  if (now - lastEarnedAt < rule.cooldown_sec) return { ok:false, reason:'cooldown' };
  if (todayCount >= rule.daily_limit)         return { ok:false, reason:'daily_limit' };
  return { ok:true, add: rule.points };
}
eq('숙제 적립 정상 → +20', canEarn(HW_RULE, 0, 0, 100000), { ok:true, add:20 });
eq('쿨다운(1시간) 내 재적립 차단', canEarn(HW_RULE, 100000, 0, 100000+10).ok, false);
eq('일일 3회 초과 차단', canEarn(HW_RULE, 0, 3, 1e9).ok, false);
check('🔒 무결성: 중복 적립 방지(쿨다운+일일한도)', !canEarn(HW_RULE,100000,0,100100).ok && !canEarn(HW_RULE,0,5,1e9).ok);

// 교차검증: seed 규칙에 homework 20/3600/3 이 있는지
{
  const api = readSrc('api-mango.ts');
  check("소스 일치: 'homework' 적립규칙 20점/3600s/3회 seed", /'homework','숙제 완료',20,3600,3/.test(api));
}

// 2-C) 이탈위험(retention): 숙제 5회 이상 미제출 → 위험점수 +12, 코디네이터 액션
function homeworkRisk(missedCount){
  let risk = 0; const signals = {};
  if (missedCount >= 5) { risk += 12; signals.homework = 'high-miss'; }
  return { risk, signals };
}
eq('숙제 5회 미제출 → 위험 +12', homeworkRisk(5).risk, 12);
eq('숙제 4회 미제출 → 위험 0 (임계 미만)', homeworkRisk(4).risk, 0);
eq('high-miss 신호 발생', homeworkRisk(6).signals.homework, 'high-miss');
{
  const api = readSrc('api-mango.ts');
  check('소스 일치: hwMissed >= 5 → risk += 12', /hwMissed\s*>=\s*5[\s\S]{0,40}risk\s*\+=\s*12/.test(api));
}

// ════════════════════════════════════════════════════════════════════
// [3] AI 퀴즈 응답 정확도  (서버 채점 · 정답 비공개 · 랜덤출제 무결성)
// ════════════════════════════════════════════════════════════════════
section('[3] AI 퀴즈 응답 정확도');

// 아래 3개 함수는 api-mango.ts 의 rqNorm / rqWordAcc / rqGrade 를 그대로 포팅(미러)한 것
const rqNorm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9가-힣\s']/g,' ').replace(/\s+/g,' ').trim();
const rqWordAcc = (target, said) => {
  const t = rqNorm(target).split(' ').filter(Boolean);
  const s = rqNorm(said).split(' ').filter(Boolean);
  if (!t.length) return 0;
  const pool = s.slice(); let hit = 0;
  for (const w of t){ const i = pool.indexOf(w); if (i>=0){ hit++; pool.splice(i,1); } }
  return hit / t.length;
};
function rqGrade(qs, answers){
  let score = 0;
  const detail = qs.map((q,i) => {
    const type = q.type || 'choice';
    const a = answers[i];
    if (type === 'choice' || type === 'listen'){
      const ans = (a == null || a === '') ? NaN : Number(a);   // fix 미러: 무응답을 NaN 처리
      const correct = Number.isInteger(ans) && ans === Number(q.answer);
      if (correct) score++;
      return { idx:i, type, correct };
    }
    const said = String(a == null ? '' : a).slice(0,500);
    let accuracy = Math.round(rqWordAcc(q.answer_text, said) * 100);
    let correct = false;
    if (type === 'write'){
      const cands = [rqNorm(q.answer_text), ...((q.accept||[]).map(x=>rqNorm(x)))].filter(Boolean);
      correct = !!said.trim() && (cands.includes(rqNorm(said)) || accuracy >= 85);
    } else { // speak
      correct = accuracy >= 60;
    }
    if (correct) score++;
    return { idx:i, type, correct, accuracy };
  });
  return { score, detail };
}

// 3-A) 텍스트 정규화 — 대소문/문장부호/공백 무시
eq('정규화: 대문자·마침표 제거', rqNorm('Hello, World!'), 'hello world');
eq('정규화: 다중 공백 축소', rqNorm('  I   am  ok  '), 'i am ok');
eq('정규화: 한글 보존', rqNorm('사과 Apple!'), '사과 apple');

// 3-B) 단어 일치율
eq('일치율: 완전일치 = 1', rqWordAcc('I am happy', 'I am happy'), 1);
check('일치율: 2/3 ≈ 0.67', Math.abs(rqWordAcc('I am happy','I am sad') - 2/3) < 1e-9);
eq('일치율: 빈 정답 → 0', rqWordAcc('', 'anything'), 0);

// 3-C) 객관식/듣기 채점 (보기 index 일치)
{
  const qs = [{ type:'choice', answer:2 }, { type:'listen', answer:1 }];
  eq('객관식+듣기 둘다 정답 → 2/2', rqGrade(qs, [2,1]).score, 2);
  eq('객관식 오답 → 1/2', rqGrade(qs, [1,1]).score, 1);
  eq('무응답(undefined) → 오답 처리', rqGrade(qs, [undefined,undefined]).score, 0);
  eq('무응답(null) + 정답이 0번이 아니면 → 오답', rqGrade(qs, [null,null]).score, 0);
  eq('문자열 "2" 도 숫자로 채점', rqGrade([{type:'choice',answer:2}], ['2']).score, 1);
}

// 3-C') ✅ FIXED(회귀가드) — 무응답 null 채점 오류 수정 검증 (2026-06-13)
//   과거 버그: Number(null)===0 → "정답이 0번 보기"인 문항을 무응답(null)으로 두면 정답으로 오채점.
//   수정: api-mango.ts rqGrade 에서 a==null/'' 를 NaN 처리 → 무응답은 항상 오답.
{
  eq('FIXED: 무응답(null)+정답0번 → 오답(score 0)', rqGrade([{ type:'choice', answer:0 }], [null]).score, 0);
  eq('FIXED: 빈문자열 답+정답0번 → 오답', rqGrade([{ type:'choice', answer:0 }], ['']).score, 0);
  eq('정상: 0번 보기 정답을 0 으로 응답 → 정답 유지', rqGrade([{ type:'choice', answer:0 }], [0]).score, 1);
  const api = readSrc('api-mango.ts');
  check("소스 일치: rqGrade 가 무응답을 NaN 처리(a == null || a === '')", /const ans = \(a == null \|\| a === ''\) \? NaN : Number\(a\)/.test(api));
}

// 3-D) 쓰기 채점 (정규화 정확 일치 OR 85% 이상 OR accept 목록)
{
  const q = [{ type:'write', answer_text:'I like apples', accept:['I love apples'] }];
  eq('쓰기 정확일치(대소문 무관) → 정답', rqGrade(q, ['i like apples']).score, 1);
  eq('쓰기 accept 동의답안 → 정답', rqGrade(q, ['I love apples']).score, 1);
  eq('쓰기 85%↑ 부분일치 → 정답', rqGrade([{type:'write',answer_text:'I am very happy today'}], ['I am very happy today!']).score, 1);
  eq('쓰기 공백답 → 오답', rqGrade(q, ['']).score, 0);
}

// 3-E) 말하기 채점 (60% 이상)
{
  const q = [{ type:'speak', answer_text:'Good morning teacher' }];
  eq('말하기 100% → 정답', rqGrade(q, ['Good morning teacher']).score, 1);
  eq('말하기 67%(2/3) → 정답(>=60%)', rqGrade(q, ['Good morning everyone']).score, 1);
  eq('말하기 33%(1/3) → 오답(<60%)', rqGrade(q, ['Good night']).score, 0);
}

// 3-F) 🔒 정답 비공개 — 학생 전달 문항에는 answer/answer_text/audio_text 가 없어야 함 (rqSafeQuestions 미러)
const rqSafeQuestions = (qs) => qs.map((q,i) => {
  const type = q.type || 'choice';
  const out = { idx:i, type, q:q.q };
  if (type === 'choice' || type === 'listen') out.opts = q.opts;
  if (type === 'speak') out.target = q.answer_text;
  if (type === 'listen') out.has_audio = true;
  return out;
});
{
  const bank = [
    { type:'choice', q:'2+2?', opts:['3','4'], answer:1, explain:'사칙연산' },
    { type:'listen', q:'들어보세요', opts:['cat','dog'], answer:0, audio_text:'cat', explain:'동물' },
    { type:'write', q:'사과는?', answer_text:'apple', accept:['Apple'] },
  ];
  const safe = rqSafeQuestions(bank);
  check('객관식: answer 미노출', safe[0].answer === undefined);
  check('듣기: audio_text(원문) 미노출', safe[1].audio_text === undefined);
  check('듣기: has_audio 플래그만 노출', safe[1].has_audio === true);
  check('쓰기: answer_text 미노출', safe[2].answer_text === undefined);
  check('explain(해설) 미노출', safe.every(s => s.explain === undefined));
  check('🔒 보안: 학생 응답 정확도 조작 불가(정답이 클라이언트로 새지 않음)',
        !JSON.stringify(safe).includes('apple') && !JSON.stringify(safe).includes('"answer"'));
}

// 3-G) served(서버 추첨 문항) 채점 무결성 — 학생이 받은 문항만 채점, total=served 길이
function gradeSubmit(bank, served, answers){
  const gradeQs = (served && served.length) ? served.map(i => bank[i]) : bank;
  const { score } = rqGrade(gradeQs, answers);
  const total = gradeQs.length;
  return { score, total, percent: total ? Math.round((score/total)*100) : 0 };
}
{
  const bank = [{type:'choice',answer:0},{type:'choice',answer:1},{type:'choice',answer:0},{type:'choice',answer:1}];
  eq('served=[1,3] 두 문항만 채점 → total 2', gradeSubmit(bank,[1,3],[1,1]).total, 2);
  eq('served=[1,3] 둘 다 정답 → 100%', gradeSubmit(bank,[1,3],[1,1]).percent, 100);
  eq('served=[1,3] 한 개 정답 → 50%', gradeSubmit(bank,[1,3],[1,0]).percent, 50);
}

// 3-H) AI 자동출제 수량 클램프 — 유형별 0~5 로 제한 (rqAiGenerate 미러)
const lim = (v, dft) => Math.min(Math.max(Number(v ?? dft) || 0, 0), 5);
eq('AI 출제 수량 음수 → 0', lim(-3, 2), 0);
eq('AI 출제 수량 과다(99) → 5 상한', lim(99, 2), 5);
eq('AI 출제 수량 미지정 → 기본값', lim(undefined, 2), 2);
{
  const api = readSrc('api-mango.ts');
  check('소스 일치: 채점은 서버에서(rqGrade) 수행', /const\s*\{\s*score,\s*detail\s*\}\s*=\s*rqGrade/.test(api));
  check('소스 일치: submit 응답 percent 계산', /percent:\s*total\s*\?\s*Math\.round\(\(score\s*\/\s*total\)\s*\*\s*100\)/.test(api));
  check('소스 일치: AI 수량 클램프 0~5', /Math\.min\(Math\.max\(Number\(v\s*\?\?\s*dft\)\s*\|\|\s*0,\s*0\),\s*5\)/.test(api));
}

// ════════════════════════════════════════════════════════════════════
// [4] 카카오톡 평가표 발송 자동화  (src/solapi-client.ts)
// ════════════════════════════════════════════════════════════════════
section('[4] 카카오톡 평가표 발송 자동화');

// getSolapiMode 미러: 키 없으면 disabled, TEST_MODE=true 면 mock, 아니면 real
function getSolapiMode(env){
  if (!env.SOLAPI_API_KEY || !env.SOLAPI_API_SECRET) return 'disabled';
  if (env.SOLAPI_TEST_MODE === 'true') return 'mock';
  return 'real';
}
const normalizePhone = (p) => (p || '').replace(/[^0-9]/g, '');

// sendKakaoAlimtalk 의 분기(실제 네트워크 호출 제외) 미러
function sendKakao(env, params){
  const mode = getSolapiMode(env);
  const phone = normalizePhone(params.recipientPhone);
  if (mode === 'disabled') return { ok:false, mode, status:'skipped', message:'SOLAPI_API_KEY 미설정' };
  if (!params.templateCode) return { ok:false, mode, status:'skipped', message:'templateCode 미설정' };
  if (!phone || phone.length < 10) return { ok:false, mode, status:'failed', error:'invalid_phone' };
  if (mode === 'mock') return { ok:true, mode:'mock', status:'sent', messageId:'mock_x' };
  return { ok:true, mode:'real', status:'sent' }; // (실제 발송 분기 — 여기선 네트워크 미호출)
}

// 4-A) 모드 판정
eq('키 미설정 → disabled', getSolapiMode({}), 'disabled');
eq('TEST_MODE=true → mock', getSolapiMode({SOLAPI_API_KEY:'k',SOLAPI_API_SECRET:'s',SOLAPI_TEST_MODE:'true'}), 'mock');
eq('키 설정+운영 → real', getSolapiMode({SOLAPI_API_KEY:'k',SOLAPI_API_SECRET:'s'}), 'real');

// 4-B) 전화번호 정규화
eq('하이픈 제거', normalizePhone('010-1234-5678'), '01012345678');
eq('공백/괄호 제거', normalizePhone('(010) 1234 5678'), '01012345678');

// 4-C) 발송 분기 — 안전한 폴백(키 없으면 조용히 skipped, 크래시 금지)
const T = { templateCode:'EVAL_REPORT', recipientPhone:'010-1234-5678', variables:{} };
eq('키 없음 → skipped (자동발송이 시스템을 막지 않음)', sendKakao({}, T).status, 'skipped');
eq('템플릿코드 없음 → skipped', sendKakao({SOLAPI_API_KEY:'k',SOLAPI_API_SECRET:'s',SOLAPI_TEST_MODE:'true'}, {...T, templateCode:''}).status, 'skipped');
eq('잘못된 번호 → failed/invalid_phone', sendKakao({SOLAPI_API_KEY:'k',SOLAPI_API_SECRET:'s',SOLAPI_TEST_MODE:'true'}, {...T, recipientPhone:'12345'}).error, 'invalid_phone');
{
  const r = sendKakao({SOLAPI_API_KEY:'k',SOLAPI_API_SECRET:'s',SOLAPI_TEST_MODE:'true'}, T);
  check('mock 모드 → 실제발송 없이 성공(sent)', r.ok && r.mode==='mock' && r.status==='sent');
}
check('🔒 자동화 안전성: 평가표 작성은 발송 실패와 무관하게 진행(skipped 는 ok=false 지만 throw 아님)',
      sendKakao({}, T).ok === false && typeof sendKakao({}, T).status === 'string');

// 4-D) 학생+학부모 동시 발송 대상 결정 — 둘 다 있으면 둘 다, 없으면 건너뜀
function pickRecipients(stu){
  const out = [];
  if (stu.student_phone) out.push({ who:'student', phone:stu.student_phone });
  if (stu.parent_phone)  out.push({ who:'parent',  phone:stu.parent_phone });
  return out;
}
eq('학생+학부모 번호 → 2건 발송', pickRecipients({student_phone:'01011112222',parent_phone:'01033334444'}).length, 2);
eq('학부모 번호만 → 1건', pickRecipients({parent_phone:'01033334444'}).length, 1);
eq('번호 없음 → 0건(발송 안함)', pickRecipients({}).length, 0);

// 교차검증
{
  const sol = readSrc('solapi-client.ts');
  check('소스 일치: 키 없으면 disabled', /!env\.SOLAPI_API_KEY\s*\|\|\s*!env\.SOLAPI_API_SECRET\)\s*return\s*'disabled'/.test(sol));
  check('소스 일치: TEST_MODE=true → mock', /SOLAPI_TEST_MODE\s*===\s*'true'\)\s*return\s*'mock'/.test(sol));
  check('소스 일치: 키 미설정 발송 → skipped', /status:\s*'skipped'/.test(sol));
  check('소스 일치: 번호 10자리 미만 → invalid_phone', /phone\.length\s*<\s*10[\s\S]{0,160}invalid_phone/.test(sol));
}

// ════════════════════════════════════════════════════════════════════
// [5] 교재/교사 업로드 → 학생·수업화면 표시 검증
// ════════════════════════════════════════════════════════════════════
section('[5] 교재/교사 업로드 → 표시 검증');

// 5-A) 교재 파일 업로드 검증 — 확장자 화이트리스트 + 80MB 상한 (POST /api/admin/textbook-files 미러)
const ALLOWED_EXT = ['pdf','jpg','jpeg','png','webp'];
const MAX_SIZE = 80 * 1024 * 1024;
function validateTextbookUpload(filename, size){
  const ext = (filename.split('.').pop() || 'bin').toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) return { ok:false, error:'invalid_type' };
  if (size > MAX_SIZE) return { ok:false, error:'file_too_large' };
  return { ok:true, kind: ext === 'pdf' ? 'pdf' : 'image' };
}
eq('PDF 업로드 → pdf 종류', validateTextbookUpload('unit1.pdf', 1024).kind, 'pdf');
eq('PNG 업로드 → image 종류', validateTextbookUpload('cover.PNG', 1024).kind, 'image');
eq('실행파일(.exe) 차단', validateTextbookUpload('hack.exe', 100).error, 'invalid_type');
eq('80MB 초과 차단', validateTextbookUpload('big.pdf', MAX_SIZE + 1).error, 'file_too_large');
eq('80MB 정확히 → 허용', validateTextbookUpload('ok.pdf', MAX_SIZE).ok, true);

// 5-B) 🔒 학생 표시 데이터 — 내부 저장키(r2_key) 미노출, 안전한 url 만 제공 (GET /api/textbook-files 미러)
function studentTextbookView(row){
  // 학생 GET 이 SELECT 하는 컬럼만 노출 + url 합성
  const { id, name, kind, ext, size_bytes, level, unit_no, description, created_at } = row;
  return { id, name, kind, ext, size_bytes, level, unit_no, description, created_at, url:`/api/textbook-files/${id}/raw` };
}
{
  const dbRow = { id:7, name:'[Smart1] Unit3', kind:'pdf', ext:'pdf', size_bytes:2048, level:'Smart1', unit_no:3,
                  description:'3과', created_at:1700000000000, r2_key:'textbook-files/secret-key.pdf', uploaded_by:'teacher_kim' };
  const view = studentTextbookView(dbRow);
  check('업로드한 교재가 학생에게 표시됨(name/level/unit 일치)', view.name === dbRow.name && view.level === 'Smart1' && view.unit_no === 3);
  check('표시용 url 합성됨', view.url === '/api/textbook-files/7/raw');
  check('🔒 내부 r2_key 미노출', view.r2_key === undefined);
  check('🔒 uploaded_by(작성자) 미노출', view.uploaded_by === undefined);
}

// 5-C) 교재 라이브러리 그룹 집계 — [교재명] 접두사로 그룹핑(수업화면 칩/트리)
function bookFromName(name){
  const m = /^\[([^\]]+)\]/.exec(name);
  return m ? m[1] : '(기타)';
}
eq('[Smart1] 접두사 → 교재명 추출', bookFromName('[Smart1] Unit3'), 'Smart1');
eq('접두사 없음 → (기타)', bookFromName('자유업로드.pdf'), '(기타)');

// 5-D) 교사 프로필 표시 — 활동중만 노출 + 🔒 민감정보(전화/카톡/계좌/단가) 미노출 (GET /api/teacher-profiles 미러)
function teacherPublicView(t){
  // 학생용 GET 이 SELECT 하는 안전 컬럼만
  const allow = ['id','korean_name','english_name','image_url','intro_video_url','group_name','career',
                 'certifications','education','available_days','available_hours','status','origin_region','notes'];
  const out = {}; for (const k of allow) if (t[k] !== undefined) out[k] = t[k];
  return out;
}
function listActiveTeachers(rows){ return rows.filter(t => t.status === '활동중').map(teacherPublicView); }
{
  const rows = [
    { id:1, korean_name:'김선생', english_name:'Kate', status:'활동중', image_url:'/img/1.jpg',
      phone:'010-1111-2222', kakao_id:'kate_kk', bank_account:'123-456', fee_per_10min:5000, intro_video_url:'/v/1.mp4' },
    { id:2, korean_name:'박선생', english_name:'Ben', status:'퇴사', phone:'010-3333-4444' },
  ];
  const pub = listActiveTeachers(rows);
  eq('활동중 교사만 노출(퇴사 제외)', pub.length, 1);
  check('업로드한 교사정보 표시(이름/영문명/소개영상)', pub[0].korean_name === '김선생' && pub[0].english_name === 'Kate' && pub[0].intro_video_url === '/v/1.mp4');
  check('🔒 전화번호 미노출', pub[0].phone === undefined);
  check('🔒 카카오ID 미노출', pub[0].kakao_id === undefined);
  check('🔒 계좌번호 미노출', pub[0].bank_account === undefined);
  check('🔒 강사료 단가 미노출', pub[0].fee_per_10min === undefined);
}

// 교차검증: 실제 GET 쿼리가 활동중 필터 + 민감컬럼 미포함인지
{
  const api = readSrc('api-mango.ts');
  check("소스 일치: 교사 GET 은 status='활동중' 만", /teacher_profiles WHERE status = '활동중'/.test(api));
  check('소스 일치: 교사 공개 SELECT 에 bank/phone/kakao_id 미포함',
        /SELECT id, korean_name, english_name, image_url, intro_video_url, group_name, career, certifications, education, available_days, available_hours, status, origin_region, notes FROM teacher_profiles/.test(api));
  check('소스 일치: 학생 교재 GET 에 r2_key 미포함',
        /SELECT id, name, kind, ext, size_bytes, level, unit_no, description, created_at FROM textbook_files/.test(api));
  check('소스 일치: 교재 업로드 확장자 화이트리스트', /allowedExt\s*=\s*\['pdf',\s*'jpg',\s*'jpeg',\s*'png',\s*'webp'\]/.test(api));
}

// ════════════════════════════════════════════════════════════════════
// [6] 스키마 드리프트 회귀 가드 (코드 ↔ 실제 운영 D1 일치)
//   배경(2026-06-13): 운영 student_evaluations 는 레거시 스키마(user_id/eval_at/score_total/next_goal)로
//   생성돼 있어, 코드가 기대하는 E1~E4 컬럼(student_uid/score_homework/next_goals/viewed_by_parent …)이
//   없어서 평가서 작성·목록·열람·카톡발송이 전부 D1 에러로 실패했음.
//   기존 하네스는 "죽은 CREATE TABLE IF NOT EXISTS"(이미 테이블 존재 → no-op)만 정규식 검사해 이를 놓침.
//   → 자가치유 마이그레이션(PRAGMA + ALTER ADD COLUMN)과 레거시 NOT NULL 충족을 회귀 가드로 고정.
// ════════════════════════════════════════════════════════════════════
section('[6] 스키마 드리프트 회귀 가드');
{
  const api = readSrc('api-mango.ts');

  // 6-A) ensureEvalTable 가 가산 마이그레이션을 수행하는가
  check('ensureEvalTable: PRAGMA table_info 로 기존 컬럼 조회', /PRAGMA table_info\(student_evaluations\)/.test(api));
  check('ensureEvalTable: 누락 컬럼을 ALTER TABLE ADD COLUMN 으로 가산', /ALTER TABLE student_evaluations ADD COLUMN \$\{col\} \$\{typ\}/.test(api));
  check('ensureEvalTable: 신규 DB CREATE 에 user_id/eval_at 포함(레거시 호환)',
        /CREATE TABLE IF NOT EXISTS student_evaluations \(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, eval_at INTEGER,/.test(api));

  // 6-B) 마이그레이션 want 목록이 코드가 실제 읽고/쓰는 핵심 컬럼을 모두 덮는가
  const wantBlock = (api.match(/const want: Array<\[string, string\]> = \[([\s\S]*?)\];/) || [,''])[1];
  const migrated = new Set([...wantBlock.matchAll(/\['([a-z_]+)'/g)].map(m => m[1]));
  // 신규 CREATE/레거시 테이블이 이미 보장하는 컬럼
  const baseline = new Set(['id','user_id','eval_at','created_at','score_overall','parent_notified','score_speaking','score_listening','eval_type','level','score_reading','score_writing','score_total','evaluator','comment','next_goal']);
  const guaranteed = new Set([...migrated, ...baseline]);
  for (const c of ['student_uid','student_name','teacher_uid','teacher_name','score_homework','score_participation','score_comprehension','score_attitude','strengths','improvements','next_goals','teacher_comment','viewed_by_parent','viewed_at','parent_notified_at','updated_at','score_grammar','score_vocab']) {
    check(`마이그레이션 보장 컬럼: ${c}`, guaranteed.has(c));
  }

  // 6-C) eval/create INSERT 가 레거시 NOT NULL(user_id, eval_at)을 채우는가 + 컬럼/플레이스홀더 개수 일치
  const insMatch = api.match(/INSERT INTO student_evaluations \(([^)]*)\)\s*\n\s*VALUES \(([^)]*)\)/);
  check('eval INSERT: user_id/eval_at 를 함께 기입(레거시 NOT NULL 충족)',
        !!insMatch && /user_id, eval_at, student_uid/.test(insMatch[1]));
  if (insMatch) {
    const nCols = insMatch[1].split(',').length;
    const nPh = (insMatch[2].match(/\?/g) || []).length;
    eq('eval INSERT: 컬럼수 == 플레이스홀더수', nCols, nPh);
  } else { check('eval INSERT 패턴 매칭', false); }

  // 6-D) 학부모 대시보드 평가 SELECT 가 참조하는 모든 컬럼이 보장 집합에 포함되는가(런타임 no-such-column 방지)
  const pdSel = (api.match(/SELECT (id, lesson_date, score_overall, score_speaking, score_listening, score_grammar[^F]*?) FROM student_evaluations WHERE student_uid/) || [,''])[1];
  const pdCols = pdSel.split(',').map(x => x.trim().split(/\s+/).pop()).filter(Boolean);
  check('학부모 대시보드 평가 SELECT 컬럼이 비어있지 않음', pdCols.length >= 8);
  for (const c of pdCols) check(`학부모 대시보드 SELECT 컬럼 보장: ${c}`, guaranteed.has(c));
}
{
  // 6-E) VideoCallRoom 정원 초과 시 유령 연결 정리(거부된 참가자가 broadcastAll 수신 방지)
  const vcr = readFileSync(resolve(__dir, '../cloudflare-deploy/src/video-call-room.ts'), 'utf8');
  check('VideoCallRoom: room-full 시 정원초과 거부(joinedUsers>=MAX_USERS)', /joinedUsers\(\)\.length\s*>=\s*MAX_USERS[\s\S]{0,200}room-full/.test(vcr));
  check('VideoCallRoom: room-full 시 소켓 close()', /room-full[\s\S]{0,400}ws\.close\(1000, 'room-full'\)/.test(vcr));
}

// ════════════════════════════════════════════════════════════════════
//  결과 요약 + 리포트(txt) 저장
// ════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(60));
console.log('📊 영역별 결과');
const lines = [];
lines.push('🥭 망고아이 핵심 기능 통합 테스트 리포트');
lines.push('생성: ' + new Date().toISOString());
lines.push('='.repeat(60));
for (const [name, s] of Object.entries(SECT)) {
  const total = s.pass + s.fail;
  const mark = s.fail === 0 ? '✅' : '⚠️';
  const row = `${mark} ${name}: ${s.pass}/${total} 통과`;
  console.log('  ' + row);
  lines.push(row);
}
console.log('═'.repeat(60));
const totalAll = PASS + FAIL;
const summary = `총 ${totalAll}건 중 ✅ ${PASS} 통과 / ❌ ${FAIL} 실패`;
console.log(summary);
lines.push('-'.repeat(60));
lines.push(summary);
if (FAIL > 0) {
  console.log('\n❌ 실패 항목:');
  lines.push('', '실패 항목:');
  for (const f of FAILS) { console.log('  - ' + f); lines.push('  - ' + f); }
} else {
  const ok = '\n🎉 전체 통과 — 5대 핵심 기능 사양 회귀 없음.';
  console.log(ok); lines.push(ok.trim());
}

try {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(resolve(__dir, 'core_features_report.txt'), lines.join('\n') + '\n', 'utf8');
  console.log('\n📝 리포트 저장: test-harness/core_features_report.txt');
} catch (e) { console.log('리포트 저장 실패:', e.message); }

process.exit(FAIL > 0 ? 1 : 0);
