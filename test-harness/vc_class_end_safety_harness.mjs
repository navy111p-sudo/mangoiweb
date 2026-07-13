// 🔒 화상수업 "절대 중간에 안 끊김" 안전망 회귀 하니스
// -----------------------------------------------------------------------------
// index.html 의 startPeerPoll 종료판정 콜백(3835~3876행)과 remoteCount(3759~) 의
// '판정 로직'을 그대로 옮겨와, 다음을 단언한다:
//   ① 조용한 끊김(dropped/미상)으로는 수업이 절대 자동 종료되지 않는다(무한 대기).
//   ② 상대가 '명시적으로 나가기(left)'를 눌렀을 때만 백업 종료가 FAST_TICKS 후 발동.
//   ③ 상대가 돌아오면(count>0) 카운트·플래그 리셋, 종료 안 함.
//   ④ 연결 불안정(connHealthy=false)이면 종료 카운트 정지.
//   ⑤ 강사가 한 번도 입장 안 함(everHadPeer=false)이면 종료 안 함.
//   ⑥ remoteCount 는 실제 vcPeerConnections 를 읽는다(옛 window.vcPeerConnections=항상 0 버그 회귀 방지).
//
// 로직은 index.html 과 '글자 단위로 동일'하게 유지할 것 — 아래 tick() 는 그 콜백의 사본이다.

let pass = 0, fail = 0;
function ok(name, cond){ if(cond){ pass++; console.log('  ✅', name); } else { fail++; console.log('  ❌', name); } }

// ── remoteCount: 실제 코드와 동일한 표현식(전역 vcPeerConnections 대체 = 인자로 주입) ──
function remoteCount(vcPeerConnections){
  try { return Object.keys((typeof vcPeerConnections === 'object' && vcPeerConnections) ? vcPeerConnections : {}).length; } catch(e){ return -1; }
}

// ── startPeerPoll 종료판정 콜백 사본 (index.html 3835~3876 과 동일) ──
// state: { zeroStreak, everHadPeer } 는 폴링 클로저 변수. env 는 외부 의존성 주입.
function makePoll(env){
  const state = { zeroStreak: 0, everHadPeer: false, cleared: false, endCalls: 0, bannerShown: 0 };
  const win = env.win;   // { __vcPeerLeftExplicit, __vcPeerGraceWait }
  const FAST_TICKS = 5;
  function tick(){
    if (state.cleared) return;   // clearInterval(iv) 후엔 콜백이 다시 안 돎(인터벌 제거 모델)
    // if (STATE.triggered) { clearInterval; return; }
    if (env.STATE.triggered) { state.cleared = true; return; }
    if (!env.inCall()) {
      state.zeroStreak = 0; state.everHadPeer = false;
      win.__vcPeerLeftExplicit = false; win.__vcPeerGraceWait = false;
      return;
    }
    if (!env.isStudentInClass()) return;
    var c = remoteCount(env.vcPeerConnections());
    if (c > 0) {
      state.everHadPeer = true;
      if (state.zeroStreak) { win.__vcPeerLeftExplicit = false; win.__vcPeerGraceWait = false; }
      state.zeroStreak = 0;
      return;
    }
    if (!state.everHadPeer) return;
    if (!env.connHealthy()) { state.zeroStreak = 0; return; }
    if (!win.__vcPeerLeftExplicit) {
      win.__vcPeerGraceWait = true;
      state.bannerShown++;
      state.zeroStreak = 0;
      return;
    }
    state.zeroStreak++;
    if (state.zeroStreak >= FAST_TICKS) {
      state.cleared = true;
      win.__vcPeerGraceWait = false;
      state.endCalls++;
    }
  }
  return { state, tick };
}

function baseEnv(over){
  const win = { __vcPeerLeftExplicit:false, __vcPeerGraceWait:false };
  return Object.assign({
    win,
    STATE: { triggered:false },
    inCall: () => true,
    isStudentInClass: () => true,
    connHealthy: () => true,
    vcPeerConnections: () => ({}),   // 원격 0명
  }, over || {});
}

console.log('\n=== ⑥ remoteCount 실측 (옛 버그 회귀 방지) ===');
ok('vcPeerConnections 2명 → 2 반환', remoteCount({a:1,b:2}) === 2);
ok('빈 객체 → 0', remoteCount({}) === 0);
ok('undefined(옛 window.vcPeerConnections) → 0(크래시 없음)', remoteCount(undefined) === 0);

console.log('\n=== ① 조용한 끊김(dropped/미상) → 절대 종료 안 함 ===');
{
  const env = baseEnv();
  const p = makePoll(env);
  // 먼저 강사 입장(count>0) 한 번 → everHadPeer=true
  env.vcPeerConnections = () => ({ teacher:1 }); p.tick();
  // 강사 조용히 끊김(count 0), 명시적 left 아님
  env.vcPeerConnections = () => ({});
  for (let i=0;i<200;i++) p.tick();   // 200틱 ≈ 1000초(16분) 경과 시뮬
  ok('endOfClassFlow 0회(무한 대기)', p.state.endCalls === 0);
  ok('재연결 배너 계속 노출', p.state.bannerShown >= 200);
  ok('종료 카운트 안 쌓임', p.state.zeroStreak === 0);
}

console.log('\n=== ② 명시적 나가기(left) → FAST_TICKS 후 백업 종료 ===');
{
  const env = baseEnv();
  const p = makePoll(env);
  env.vcPeerConnections = () => ({ teacher:1 }); p.tick();
  env.vcPeerConnections = () => ({});
  env.win.__vcPeerLeftExplicit = true;   // 서버가 reason=left 통보 → hookPeerLeave 가 세팅
  let endedAt = -1;
  for (let i=1;i<=10;i++){ p.tick(); if (p.state.endCalls===1 && endedAt<0) endedAt=i; }
  ok('정확히 1회 종료', p.state.endCalls === 1);
  ok('FAST_TICKS(5)째에 종료', endedAt === 5);
}

console.log('\n=== ③ 명시적 left 였다가 강사 복귀 → 종료 취소 ===');
{
  const env = baseEnv();
  const p = makePoll(env);
  env.vcPeerConnections = () => ({ teacher:1 }); p.tick();
  env.vcPeerConnections = () => ({});
  env.win.__vcPeerLeftExplicit = true;
  p.tick(); p.tick();                       // 2틱 카운트(아직 5 미만)
  env.vcPeerConnections = () => ({ teacher:1 });  // 강사 복귀
  p.tick();
  ok('복귀 시 left 플래그 리셋', env.win.__vcPeerLeftExplicit === false);
  ok('종료 카운트 리셋', p.state.zeroStreak === 0);
  env.vcPeerConnections = () => ({});
  for (let i=0;i<10;i++) p.tick();          // 복귀 후 다시 조용히 끊김 → left 플래그 없으니 종료 안 함
  ok('복귀 후엔 조용한 끊김 → 종료 안 함', p.state.endCalls === 0);
}

console.log('\n=== ④ 연결 불안정(connHealthy=false) → 종료 카운트 정지 ===');
{
  const env = baseEnv({ connHealthy: () => false });
  const p = makePoll(env);
  env.vcPeerConnections = () => ({ teacher:1 }); p.tick();
  env.vcPeerConnections = () => ({});
  env.win.__vcPeerLeftExplicit = true;      // left 여도
  for (let i=0;i<20;i++) p.tick();
  ok('불안정하면 종료 안 함', p.state.endCalls === 0);
}

console.log('\n=== ⑤ 강사 미입장(everHadPeer=false) → 종료 안 함 ===');
{
  const env = baseEnv();
  const p = makePoll(env);
  env.vcPeerConnections = () => ({});       // 처음부터 0명
  env.win.__vcPeerLeftExplicit = true;
  for (let i=0;i<20;i++) p.tick();
  ok('대기실 혼자 → 종료 안 함', p.state.endCalls === 0);
}

console.log('\n=== ⑥b 장시간 조용한 끊김 후 뒤늦게 명시적 left 도착 ===');
{
  const env = baseEnv();
  const p = makePoll(env);
  env.vcPeerConnections = () => ({ teacher:1 }); p.tick();
  env.vcPeerConnections = () => ({});
  for (let i=0;i<300;i++) p.tick();         // 25분 조용한 끊김 → 종료 안 함
  ok('25분 조용한 끊김에도 종료 0회', p.state.endCalls === 0);
  env.win.__vcPeerLeftExplicit = true;      // 그제서야 강사가 명시적 나가기
  for (let i=0;i<5;i++) p.tick();
  ok('명시적 left 후 5틱 내 종료', p.state.endCalls === 1);
}

console.log('\n────────────────────────────');
console.log(`RESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
