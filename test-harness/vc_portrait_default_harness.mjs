// 🥭 세로폰 기본화면 상태머신 회귀 하니스 (2026-07-13 사장님 지시)
// index.html phero IIFE 의 maybeDefault 사본으로 단언:
//  ① 입장 기본 = 선생님 크게(facepip)
//  ② 교사 교재/동영상 공유 → 내용 크게(pip) 자동 전환
//  ③ 공유 중지 → 선생님 크게 복귀
//  ④ 학생이 직접 모드 선택(_userChose) → 감시 틱이 절대 되돌리지 않음
//  ⑤ 단, 교사의 새 공유(fromShare)는 학생 선택보다 우선
//  ⑥ 감시 틱 반복 호출이 화면을 흔들지 않음(같은 목표 재적용 없음)
let pass=0, fail=0;
const ok=(n,c)=>{ c?(pass++,console.log('  ✅',n)):(fail++,console.log('  ❌',n)); };

function makeSim(){
  const S = { mode:null, setCalls:0, shared:{pdf:false, video:false},
              _applied:false, _userChose:false, _selfApplying:false, _lastWant:null };
  const row = { classList:{ contains:(c)=>('video-'+ (S.mode||'')) === c || (S.mode===c.replace('video-','')) } };
  function vcScreenSet(m){ if(!S._selfApplying) S._userChose = true; S.mode = m; S.setCalls++; }
  function isContentShared(){ return !!(S.shared.pdf || S.shared.video); }
  function maybeDefault(force, fromShare){
    // (inCall/isPortrait/hook 은 항상 참으로 가정)
    var want = isContentShared() ? 'pip' : 'facepip';
    if(fromShare){ S._userChose = false; }
    else {
      if(S._userChose || S.mode==='solo' || S.mode==='full') return;
      if(!force && S._applied && want === S._lastWant) return;
    }
    S._lastWant = want;
    if(S.mode === want){ S._applied = true; return; }
    S._selfApplying = true;
    try { vcScreenSet(want); } finally { S._selfApplying = false; }
    S._applied = true;
  }
  return { S, maybeDefault, userPick:(m)=>vcScreenSet(m) };
}

console.log('=== ① 입장 기본 = 선생님 크게 ===');
{ const t=makeSim(); t.maybeDefault(false);
  ok('facepip 적용', t.S.mode==='facepip');
  ok('사용자선택으로 오인 안 함', t.S._userChose===false); }

console.log('=== ② 공유 시작 → 내용 크게 ===');
{ const t=makeSim(); t.maybeDefault(false);
  t.S.shared.pdf=true; t.maybeDefault(true,true);
  ok('pip 전환', t.S.mode==='pip'); }

console.log('=== ③ 공유 중지 → 선생님 크게 복귀 ===');
{ const t=makeSim(); t.maybeDefault(false);
  t.S.shared.pdf=true; t.maybeDefault(true,true);
  t.S.shared.pdf=false; t.maybeDefault(true,true);
  ok('facepip 복귀', t.S.mode==='facepip'); }

console.log('=== ④ 학생 직접 선택은 감시 틱이 안 되돌림 ===');
{ const t=makeSim(); t.maybeDefault(false);
  t.userPick('half');                       // 학생이 1/2 분할 선택
  for(let i=0;i<20;i++) t.maybeDefault(false);
  ok('half 유지', t.S.mode==='half'); }

console.log('=== ⑤ 교사 공유는 학생 선택보다 우선 ===');
{ const t=makeSim(); t.maybeDefault(false);
  t.userPick('half');
  t.S.shared.video=true; t.maybeDefault(true,true);
  ok('공유 시작 → pip 강제', t.S.mode==='pip');
  t.S.shared.video=false; t.maybeDefault(true,true);
  ok('공유 끝 → facepip 복귀', t.S.mode==='facepip'); }

console.log('=== ⑥ 감시 틱 반복이 화면 안 흔듦 ===');
{ const t=makeSim(); t.maybeDefault(false);
  const calls = t.S.setCalls;
  for(let i=0;i<50;i++) t.maybeDefault(false);
  ok('vcScreenSet 재호출 0', t.S.setCalls===calls); }

console.log('=== ⑦ 학생이 기능(칠판) 열어 pip 된 뒤에도 감시 틱이 안 되돌림 ===');
{ const t=makeSim(); t.maybeDefault(false);
  t.userPick('pip');                        // wrapContentTab 경로 = 사용자 선택으로 기록됨
  for(let i=0;i<20;i++) t.maybeDefault(false);
  ok('pip(칠판 화면) 유지', t.S.mode==='pip'); }

console.log('────────────');
console.log(`RESULT: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
