// 🔒 화상수업 "절대 중간에 안 끊김" + '연결끊김 안내카드' 회귀 하니스
// -----------------------------------------------------------------------------
// index.html startPeerPoll 종료판정 콜백 + remoteCount + 안내카드(showTeacherGoneNotice)
// 로직의 사본으로 다음을 단언:
//   ① 조용한 끊김(dropped/미상)으론 수업 절대 자동종료 안 함(무한 대기).
//   ② 상대 '명시적 나가기(left)' 때만 FAST_TICKS 후 백업 종료.
//   ③ 상대 복귀(count>0) → 카운트·플래그·안내카드 리셋, 종료 안 함.
//   ④ connHealthy=false → 종료 카운트 정지.
//   ⑤ everHadPeer=false → 종료 안 함.
//   ⑥ remoteCount 실측(옛 window.vcPeerConnections=항상0 회귀 방지).
//   ⑦ 조용한 끊김 ≈90초(SILENT_NOTICE_TICKS) 지속 → 안내카드 1회 표시(자동종료는 여전히 0).
//   ⑧ '계속 기다리기'(스누즈) → 카드 숨김, 90초 후 계속 끊겨 있으면 재표시.
//   ⑨ 상대 복귀 → 카드 자동 제거.
//   ⑩ '수업 마치기' → 학생이 직접 endOfClassFlow(자동 아님).
// 로직은 index.html 과 '동일'하게 유지할 것.

let pass = 0, fail = 0;
function ok(name, cond){ if(cond){ pass++; console.log('  ✅', name); } else { fail++; console.log('  ❌', name); } }

function remoteCount(vcPeerConnections){
  try { return Object.keys((typeof vcPeerConnections === 'object' && vcPeerConnections) ? vcPeerConnections : {}).length; } catch(e){ return -1; }
}

function makePoll(env){
  const clock = { t: 1_000_000 };                 // 가짜 시계(ms). 매 틱 5초 전진.
  const win = env.win;
  const FAST_TICKS = 5;
  const SILENT_NOTICE_TICKS = 18;
  let _tgSnoozeUntil = 0;
  const state = {
    zeroStreak: 0, silentTicks: 0, everHadPeer: false, cleared: false,
    endCalls: 0, bannerShown: 0, cardShown: false, cardShowCount: 0,
  };
  function hideCard(){ state.cardShown = false; }
  function showCard(){
    if (state.cardShown) return;
    if (!env.inCall() || env.STATE.triggered) return;
    state.cardShown = true; state.cardShowCount++;
  }
  // 카드 버튼 동작(브라우저에선 클릭 핸들러)
  function clickWait(){ _tgSnoozeUntil = clock.t + 90000; hideCard(); }
  function clickEnd(){ hideCard(); state.endCalls++; state.cleared = true; env.STATE.triggered = true; }

  function tick(){
    clock.t += 5000;
    if (state.cleared) return;                     // clearInterval 모델
    if (env.STATE.triggered) { state.cleared = true; return; }
    if (!env.inCall()) {
      state.zeroStreak = 0; state.everHadPeer = false; state.silentTicks = 0;
      win.__vcPeerLeftExplicit = false; win.__vcPeerGraceWait = false;
      hideCard();
      return;
    }
    if (!env.isStudentInClass()) return;
    var c = remoteCount(env.vcPeerConnections());
    if (c > 0) {
      state.everHadPeer = true;
      if (state.zeroStreak || state.silentTicks) { win.__vcPeerLeftExplicit = false; win.__vcPeerGraceWait = false; state.bannerShown = state.bannerShown; }
      state.zeroStreak = 0; state.silentTicks = 0;
      hideCard();
      return;
    }
    if (!state.everHadPeer) return;
    if (!env.connHealthy()) { state.zeroStreak = 0; state.silentTicks = 0; return; }
    if (!win.__vcPeerLeftExplicit) {
      win.__vcPeerGraceWait = true;
      state.bannerShown++;
      state.zeroStreak = 0;
      state.silentTicks++;
      if (state.silentTicks >= SILENT_NOTICE_TICKS && clock.t >= _tgSnoozeUntil) showCard();
      return;
    }
    state.zeroStreak++;
    if (state.zeroStreak >= FAST_TICKS) {
      state.cleared = true;
      win.__vcPeerGraceWait = false;
      state.endCalls++;
    }
  }
  return { state, tick, clock, clickWait, clickEnd };
}

function baseEnv(over){
  const win = { __vcPeerLeftExplicit:false, __vcPeerGraceWait:false };
  return Object.assign({
    win, STATE: { triggered:false },
    inCall: () => true, isStudentInClass: () => true, connHealthy: () => true,
    vcPeerConnections: () => ({}),
  }, over || {});
}

console.log('\n=== ⑥ remoteCount 실측 ===');
ok('2명 → 2', remoteCount({a:1,b:2}) === 2);
ok('빈 → 0', remoteCount({}) === 0);
ok('undefined(옛 버그) → 0', remoteCount(undefined) === 0);

console.log('\n=== ① 조용한 끊김 → 절대 종료 안 함 ===');
{
  const env = baseEnv(); const p = makePoll(env);
  env.vcPeerConnections = () => ({ teacher:1 }); p.tick();
  env.vcPeerConnections = () => ({});
  for (let i=0;i<200;i++) p.tick();
  ok('endOfClassFlow 0회', p.state.endCalls === 0);
  ok('종료 카운트 안 쌓임', p.state.zeroStreak === 0);
}

console.log('\n=== ② 명시적 나가기(left) → FAST_TICKS 후 종료 ===');
{
  const env = baseEnv(); const p = makePoll(env);
  env.vcPeerConnections = () => ({ teacher:1 }); p.tick();
  env.vcPeerConnections = () => ({}); env.win.__vcPeerLeftExplicit = true;
  let endedAt = -1;
  for (let i=1;i<=10;i++){ p.tick(); if (p.state.endCalls===1 && endedAt<0) endedAt=i; }
  ok('정확히 1회 종료', p.state.endCalls === 1);
  ok('FAST_TICKS(5)째 종료', endedAt === 5);
}

console.log('\n=== ③ left 였다가 강사 복귀 → 취소 ===');
{
  const env = baseEnv(); const p = makePoll(env);
  env.vcPeerConnections = () => ({ teacher:1 }); p.tick();
  env.vcPeerConnections = () => ({}); env.win.__vcPeerLeftExplicit = true;
  p.tick(); p.tick();
  env.vcPeerConnections = () => ({ teacher:1 }); p.tick();
  ok('복귀 시 left 플래그 리셋', env.win.__vcPeerLeftExplicit === false);
  ok('종료 카운트 리셋', p.state.zeroStreak === 0);
  env.vcPeerConnections = () => ({});
  for (let i=0;i<10;i++) p.tick();
  ok('복귀 후 조용한 끊김 → 종료 안 함', p.state.endCalls === 0);
}

console.log('\n=== ④ connHealthy=false → 종료 정지 ===');
{
  const env = baseEnv({ connHealthy: () => false }); const p = makePoll(env);
  env.vcPeerConnections = () => ({ teacher:1 }); p.tick();
  env.vcPeerConnections = () => ({}); env.win.__vcPeerLeftExplicit = true;
  for (let i=0;i<20;i++) p.tick();
  ok('불안정하면 종료 안 함', p.state.endCalls === 0);
}

console.log('\n=== ⑤ 강사 미입장 → 종료 안 함 ===');
{
  const env = baseEnv(); const p = makePoll(env);
  env.vcPeerConnections = () => ({}); env.win.__vcPeerLeftExplicit = true;
  for (let i=0;i<20;i++) p.tick();
  ok('대기실 혼자 → 종료 안 함', p.state.endCalls === 0);
}

console.log('\n=== ⑦ 조용한 끊김 90초 → 안내카드 1회, 종료는 0 ===');
{
  const env = baseEnv(); const p = makePoll(env);
  env.vcPeerConnections = () => ({ teacher:1 }); p.tick();
  env.vcPeerConnections = () => ({});
  for (let i=0;i<17;i++) p.tick();
  ok('17틱(85초)엔 카드 아직 없음', p.state.cardShown === false && p.state.cardShowCount === 0);
  p.tick();  // 18틱 = 90초
  ok('18틱(90초)에 카드 표시', p.state.cardShown === true && p.state.cardShowCount === 1);
  for (let i=0;i<50;i++) p.tick();
  ok('이후에도 종료 0회(자동종료 안 함)', p.state.endCalls === 0);
  ok('카드 중복 표시 안 함(1회 유지)', p.state.cardShowCount === 1);
}

console.log('\n=== ⑧ 계속 기다리기(스누즈) → 숨김, 90초 후 재표시 ===');
{
  const env = baseEnv(); const p = makePoll(env);
  env.vcPeerConnections = () => ({ teacher:1 }); p.tick();
  env.vcPeerConnections = () => ({});
  for (let i=0;i<18;i++) p.tick();          // 카드 뜸
  ok('카드 떠 있음', p.state.cardShown === true);
  p.clickWait();                             // '계속 기다리기'
  ok('클릭 후 카드 숨김', p.state.cardShown === false);
  for (let i=0;i<17;i++) p.tick();           // 85초 더 — 스누즈(90초) 內
  ok('스누즈 중 재표시 안 함', p.state.cardShown === false && p.state.cardShowCount === 1);
  for (let i=0;i<5;i++) p.tick();            // 스누즈 넘어감
  ok('스누즈 후 재표시', p.state.cardShown === true && p.state.cardShowCount === 2);
}

console.log('\n=== ⑨ 카드 떠 있는데 강사 복귀 → 자동 제거 ===');
{
  const env = baseEnv(); const p = makePoll(env);
  env.vcPeerConnections = () => ({ teacher:1 }); p.tick();
  env.vcPeerConnections = () => ({});
  for (let i=0;i<18;i++) p.tick();
  ok('카드 떠 있음', p.state.cardShown === true);
  env.vcPeerConnections = () => ({ teacher:1 }); p.tick();
  ok('강사 복귀 → 카드 제거', p.state.cardShown === false);
  ok('silentTicks 리셋', p.state.silentTicks === 0);
}

console.log('\n=== ⑩ 수업 마치기 → 학생이 직접 종료 ===');
{
  const env = baseEnv(); const p = makePoll(env);
  env.vcPeerConnections = () => ({ teacher:1 }); p.tick();
  env.vcPeerConnections = () => ({});
  for (let i=0;i<18;i++) p.tick();
  ok('카드 떠 있음', p.state.cardShown === true);
  p.clickEnd();                              // '수업 마치기'
  ok('직접 종료 1회', p.state.endCalls === 1);
  ok('카드 숨김', p.state.cardShown === false);
  const before = p.state.endCalls;
  for (let i=0;i<10;i++) p.tick();
  ok('이후 폴링이 추가 종료 안 함', p.state.endCalls === before);
}

console.log('\n────────────────────────────');
console.log(`RESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
