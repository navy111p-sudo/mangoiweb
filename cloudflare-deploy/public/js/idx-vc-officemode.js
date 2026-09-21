/* 🏢 사무실 모드 — 옆자리 교사 목소리가 학생에게 덜 들리게 «내 마이크 입력» 을 가공한다.
   (2026-09-08 사장님 요청 — 「사무실에서 주변 교사 목소리가 들리지 않게」)

   🔛 기본값 = 켜짐 (2026-09-09 사장님 「교사한테 항상 켜지는 것을 디폴트값으로」)
      · 저장값이 «없으면» 켜고, «'0'(사람이 껐음)» 이면 켜지 않는다 — 아래 pref()/wantOn() 참고.
      · «교사인가» 는 저장값이 아니라 실제로 거는 자리(armOnce → isStaff)가 봅니다.
        학생 브라우저에서는 armOnce 가 돌아도 아무 일도 안 하고 20초 뒤 끝납니다.

   ⚠️ 먼저 알아 둘 것 — 브라우저의 noiseSuppression 은 «사람 목소리» 를 못 지운다.
      그 엔진은 에어컨·팬·키보드 같은 «일정한 잡음» 을 겨냥해 만든 것이고, 옆자리 목소리는
      «지워야 할 잡음» 이 아니라 «지켜야 할 음성» 으로 분류된다. 그래서 잡음 제거를 켜 두어도
      (이미 기본 켜짐 — idx-main.js:424) 옆 소리는 그대로 넘어간다.
      ⇒ 이 파일이 하는 일은 «지우기» 가 아니라 «가까운 소리만 통과시키기» 다.
      ⛔ 그러니 이것만으로 완전히 없어지지 않는다. 가장 확실한 것은 붐 마이크 헤드셋(입에서 3~5cm)이고,
         그다음이 Krisp 같은 가상 마이크다(그건 장치 목록에 뜨므로 이 파일과 무관하게 그냥 고르면 된다).

   무엇을 하는가 — 세 가지뿐이고, 셋 다 «가까운 소리와 먼 소리의 차이» 를 벌린다.
     ① 자동 게인(autoGainControl) 끄기 — 켜져 있으면 내가 말을 쉬는 동안 마이크 감도를 자동으로 올려
        옆자리 소리를 «오히려 키운다». 사무실에서는 이게 제일 큰 역효과다.
     ② 하이패스 120Hz — 방 웅웅거림·책상 진동을 덜어 낸다(사람 목소리 기본 주파수 아래).
     ③ 노이즈 게이트 — 바닥 소음보다 충분히 큰 소리(=내 목소리)만 통과시키고 그 아래는 «줄인다».

   ⛔ 게이트는 «완전 무음» 으로 만들지 않는다(2026-09-09 기준 -30dB 감쇠까지만). 완전히 끊으면
      교사가 조용히 말할 때 첫 음절이 통째로 사라져서, 고치려던 것보다 나쁜 상태가 된다.
      ⚠️ 남기는 크기를 더 줄일수록 «잘못 닫혔을 때» 가 더 크게 티납니다 — 0 으로 가지 마세요.
   ⛔ 문턱을 «고정 숫자» 로 두지 않는다 — 사무실마다 바닥 소음이 다르다. 조용한 구간의 바닥을 배워
      그 위 몇 dB 로 잡는다. ⚠️ 그때 «위로는 아주 느리게» 만 따라간다 — 시끄러운 값을 평소로 배우면
      게이트가 스스로 열려 버려 아무 일도 안 하게 된다(CLAUDE.md 「기준값을 매 틱 올리면」과 같은 함정).

   ⚠️ 안전 원칙 — 어느 단계든 실패하면 «켜기 전» 으로 되돌아간다. 마이크는 수업 그 자체라
      «안 들리는» 실패가 «옆소리가 들리는» 것보다 훨씬 나쁘다. 그래서:
        · AudioContext 는 스위치를 누르는 «사용자 제스처» 안에서만 만든다(자동재생 정책).
        · 탭이 숨으면(다른 창으로 전환) 게이트를 활짝 열고 손을 뗀다 — 타이머가 느려진 사이
          게이트가 «닫힌 채 굳어» 목소리가 안 나가는 것을 원천 차단한다.
        · 음소거 상태(track.enabled)는 트랙을 갈아끼울 때 반드시 물려준다.

   ⛔ 상주 setInterval·body class MutationObserver 를 두지 않는다(CLAUDE.md — 홈 전체를 멎게 한 전력).
      타이머는 «사무실 모드가 켜진 동안» 에만 살고 끄면 즉시 사라진다.
   idx-main.js 는 한 줄도 고치지 않는다(849KB blocking · 첫 화면 예산 여유 116바이트) — 전역 함수를
   밖에서 감싸는 방식이다. ⚠️ 그래서 그 함수 이름이 바뀌면 조용히 헛돈다(원본이 없으면 건너뛴다). */
(function () {
  var KEY = 'mangoi_vc_office';

  /* 🔊 세기 — 2026-09-09 사장님 「옆자리 목소리가 아직 조금 들려. 문턱 좀 더 세게」로 한 단계 올렸습니다.
     ⚠️ 네 값이 하는 일이 서로 다릅니다. «되갚는» 값은 HOLD_MS «하나뿐» 이고 나머지 셋은 전부 세게 쪽입니다.
        · OPEN_DB↑ — «여는» 문턱(바닥+16). 옆소리로는 덜 열린다. ⛔ 대가: 내가 «조용히» 말하면 그 말이 게이트를 못 연다.
        · HYST_DB↑ — «닫는» 문턱(= 바닥 + OPEN_DB − HYST_DB → 바닥+6 에서 바닥+**8**). 한 번 열린 뒤
          옆사람이 계속 떠들어도 게이트를 붙잡고 있지 못하게 한다. ⛔ 대가: 내 «말끝» 이 더 일찍 줄어든다.
          ⚠️ 이 값을 올리는 것은 «더 잘 버티게» 가 아니라 «더 빨리 닫게» 다 — 반대로 적지 마세요(한 번 그렇게 적었습니다).
        · HOLD_MS↑ — 이것만이 되갚는 값이다. 문턱 아래로 떨어져도 300ms 는 열어 둬, 말 사이 공백에서
          깊어진 DUCK(-30dB)이 티나지 않게 한다.
        · DUCK↓  — «닫혔을 때만» 작동하므로 내 말을 자를 위험이 없다. 그래서 여기서 가장 많이 벌었다.
     ⚠️ 「너무 세다」의 증상은 «옆소리» 가 아니라 **«내 말 첫머리·말끝이 잘린다»** 입니다.
        그러면 OPEN_DB 를 12, DUCK 을 0.08, HYST_DB 를 6 으로 되돌리세요(2026-09-08 첫 판 값이고 하니스도 통과합니다). */
  var ATTACK   = 0.005;  // 열림 — 즉시(첫 음절을 자르지 않는다)
  var RELEASE  = 0.12;   // 닫힘 — 느리게(말 사이 공백에 딸꾹거리지 않는다)
  var HOLD_MS  = 300;    // 문턱 아래로 떨어져도 이만큼은 열어 둔다 (260 → 300)
  var DUCK     = 0.03;   // 게이트가 닫혔을 때 남기는 크기 (-30dB — 0.08 = -22dB 에서 8dB 더 줄임)
  var OPEN_DB  = 16;     // 바닥 + 이만큼 크면 «내 목소리» (12 → 16)
  var HYST_DB  = 8;      // 한 번 열리면 이만큼 낮아질 때까지 유지 (6 → 8)
  var ABS_DB   = -55;    // 문턱 절대 하한 — 너무 조용한 방에서 게이트가 예민해지지 않게
  var TICK_MS  = 25;

  var on = false, busy = false;
  /* 이 «페이지» 에서 켜기가 한 번 실패했는가 — 자동 적용만 그만둔다(사람이 스위치를 누르면 다시 시도).
     ⚠️ 저장값('0')으로 적지 않는 이유는 아래 enable() 의 실패 처리 주석에 있다. */
  var autoFailed = false;
  var ctx = null, srcNode = null, hpNode = null, gainNode = null, anaNode = null, destNode = null;
  var rawStream = null;   // 우리가 «새로» 잡은 원본 마이크 (AGC off) — 재사용에 성공하면 null 이다
  /* 🚀 (2026-09-11) «이미 열려 있는» 마이크를 빌려 쓸 때 그 트랙. 우리 것이 아니므로 함부로 stop 하지 않는다.
     [왜] 예전에는 켤 때도 끌 때도 getUserMedia 를 새로 불렀다 = 수업 한 번에 마이크를 두 번 더 연다.
          그 시간이 그대로 «교사만 입장이 느린» 이유였다(느린 환경 실측 438ms — 가짜 장치 기준이라
          진짜 마이크는 더 길다. 학생에게는 이 경로가 아예 없다).
     [지금] 이미 열린 트랙에 applyConstraints 로 AGC 만 끄고 그대로 쓴다 — 장치를 다시 열지 않는다.
     ⛔ 못 끄면(브라우저가 무시·미지원) 재사용을 «포기» 하고 예전처럼 새로 연다 — AGC 가 켜진 채로
        쓰면 이 기능의 ①번 효과가 통째로 죽는데 소리는 정상이라 아무도 모른다. */
  var borrowed = null;
  /* 🔴 되돌리는 «동안» 은 hookGum 이 손을 떼야 한다 — 안 그러면 「켜기 전으로 되돌리려고」 새로 여는
     그 마이크의 AGC 를 훅이 **또 꺼서** 영영 안 돌아온다(켜기 실패 경로에서 실제로 그랬다). */
  var restoring = false;
  var procTrack = null;   // peer 에게 실제로 보내는 가공 트랙
  var timer = null, buf = null, floorDb = -60, openUntil = 0, isOpen = false;
  var srcMicId = '';      // 켜기 «전» 에 쓰던 «진짜» 마이크 장치 id — 되돌릴 때 이것으로 다시 잡는다

  /* 🔛 저장값은 «셋» 이다 — '1'(켬) · '0'(사람이 껐음) · 없음(아직 안 정함).
     2026-09-09 사장님 「교사한테 항상 켜지는 것을 디폴트값으로」 → «없음» 을 «켬» 으로 읽는다.
     ⛔ 두 값으로 뭉개지 마세요 — «아직 안 정함» 과 «사람이 껐음» 이 같아지면
        교사가 끈 것이 다음 수업에 되살아납니다(CLAUDE.md 「상태가 셋인데 저장이 둘」).
     ⚠️ 「교사면」 이라는 조건은 여기서 묻지 않습니다 — 이 함수가 불리는 시점에는 역할이
        아직 안 왔을 수 있습니다. 실제로 거는 자리(armOnce)가 isStaff() 를 «폴링하며» 봅니다.
        그래서 학생 브라우저에서도 armOnce 는 돌지만 20초 뒤 아무것도 안 하고 끝납니다. */
  function pref() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function wantOn() { return pref() !== '0'; }
  function remember(v) { try { localStorage.setItem(KEY, v ? '1' : '0'); } catch (e) {} }
  /* 「아직 안 정함」으로 되돌린다 — «켜다가 실패한 것» 을 «사람이 껐다» 로 적으면
     한 번의 일시 장애가 그 교사의 기본값을 영영 꺼 버립니다(다음 수업에 다시 시도해야 합니다). */
  function forget() { try { localStorage.removeItem(KEY); } catch (e) {} }
  function inCall() { try { return document.body.classList.contains('vc-in-call'); } catch (e) { return false; } }

  /* 🎭 «선생님 + 관리자 로그인» — 2026-09-08 「선생님만 쓰게 막아줘」 → 2026-09-09 「사장님 계정도 보이게 넓혀줘」.
     판정은 정본 `vcIsStaffNow()` 하나만 봅니다(그 주석이 「강사 전용 기능은 전부 이걸 쓴다」).
     ⛔ «강사가 아니면 학생»(`!vcIsStaffNow()`)으로 판정하지 않습니다 — 그 판정은 **역할이 아직
        확정되지 않은 강사를 학생으로 오판**합니다(같은 파일 `vcIsStudentNow` 주석의 8/10 사고).
        여기서는 그 오판이 «교사가 자기 기능을 못 쓰는» 쪽이라, 아래 두 곳이 그것을 견딥니다:
        · 설정을 «열 때마다» 다시 판정합니다(역할이 늦게 오면 다시 열면 보입니다)
        · 수업 진입 자동 적용은 «교사가 될 때까지» 기다립니다(폴링)
     ⛔ 역할 정본을 고쳐서 풀지 마세요 — 그 값에는 화면공유·교재 넘김·장치 도우미 권한이
        함께 걸려 있습니다(CLAUDE.md). 여기서는 «묻기만» 합니다.
     ℹ️ 이것은 보안 게이트가 아닙니다 — 사무실 모드는 «자기 마이크» 만 가공하므로 학생이
        콘솔로 불러도 남에게 영향이 없습니다. 화면을 어지럽히지 않는 것이 목적입니다. */
  /* 🔑 (2026-09-09 사장님 「사장님 계정도 보이게 넓혀줘」) — 축을 «둘» 로 늘렸습니다.
     [왜 필요했나] 사장님이 수업 방에 들어가면 화면이 «학생» 으로 잡히는 경우가 있습니다.
       `index.html` 의 입장 판정(`js/idx-main.js:2625~2642`)이 관리자 로그인을 발견하면
       「스태프로 입장할까요?」를 묻는데, **취소하면 그 세션은 `vcMyRole='student'`** 입니다.
       그러면 위 `vcIsStaffNow()` 가 false 라 그 줄이 정상적으로 감춰집니다 — 사장님 화면에
       「사무실 모드가 없다」로 보이던 것이 이 자리입니다(2026-09-09).
     [무엇을 봤나] 그 브라우저에 **관리자 로그인이 있는가**(`mangoi_admin_session.uid`).
       그 키는 교사·본사·지사가 관리자 화면에 로그인할 때만 생기고, 학생 로그인은
       `mangoi_logged_user` 라 **키 자체가 다릅니다** — 그래서 진짜 학생 브라우저에는 없습니다.
       같은 키를 같은 뜻으로 이미 읽는 곳: `idx-main.js:2626`.
     ⛔ **정본 `vcIsStaffNow()` 를 고쳐서 넓히지 않았습니다** — 그 값에는 화면공유·교재 넘김·
        장치 도우미 «권한» 이 함께 걸려 있어, 거기를 넓히면 사무실 모드와 무관한 것까지 열립니다
        (CLAUDE.md 「역할 정본을 고쳐서 풀지 마세요」). 넓힌 것은 **이 게이트 하나**입니다.
     ℹ️ 보안 게이트가 아니라 «화면을 어지럽히지 않기» 가 목적이라 넓혀도 잃는 것이 없습니다 —
        사무실 모드는 «자기 마이크» 만 가공하므로 남에게 영향이 없습니다.
     ⚠️ localStorage 를 못 읽으면(사생활 보호 모드 등) false 로 떨어집니다 — 그때도 교사는
        위 `vcIsStaffNow()` 로 그대로 보이므로, 잃는 것은 «관리자인데 학생으로 입장한» 경우뿐입니다. */
  function hasAdminLogin() {
    try {
      var s = JSON.parse(localStorage.getItem('mangoi_admin_session') || '{}') || {};
      return !!String(s.uid || '').trim();
    } catch (e) { return false; }
  }
  /* 🔴 축이 «둘» 이다 — 지시가 둘이었고 서로 범위가 다르다.
       · 보이기(canSee)     = 선생님 «또는» 관리자 로그인   ← 9/09 「사장님 계정도 보이게」
       · 자동 켜기(isStaff) = 선생님만                      ← 9/09 「교사한테 항상 켜지는」
     ⛔ 하나로 합치지 마세요 — 합치면 **공용 PC 에 남은 관리자 세션으로 «학생으로 입장» 한 아이의
        마이크**에까지 게이트가 자동으로 걸립니다. `idx-main.js:2622` 주석이 바로 그 confirm 을
        「공용 PC 에 남은 관리자 세션으로 학생이 승격되는 길을 한 겹 막는다」고 못 박아 두었는데,
        합치면 그 방어선을 옆으로 돌아갑니다(2026-09-09 함정 대조가 잡음).
     ℹ️ 사장님이 «학생으로» 들어가신 경우에는 **줄은 보이고 자동으로 켜지지는 않습니다** —
        한 번 누르면 켜집니다. 「스태프로 입장」을 고르시면 그때는 자동으로 켜집니다.
     ✅ 되돌리려면 아래 canSee 를 isStaff 로 부르는 한 줄만 바꾸면 됩니다(사람이 정할 일). */
  function canSee() {
    try { if (typeof window.vcIsStaffNow === 'function' && window.vcIsStaffNow()) return true; }
    catch (e) {}
    return hasAdminLogin();
  }
  function isStaff() {
    try { return typeof window.vcIsStaffNow === 'function' && !!window.vcIsStaffNow(); }
    catch (e) { return false; }
  }
  window.vcOfficeModeAllowed = canSee;
  function localStream() { try { return window.vcLocalStream || null; } catch (e) { return null; } }
  function audioTrack() { var s = localStream(); try { return (s && s.getAudioTracks && s.getAudioTracks()[0]) || null; } catch (e) { return null; } }

  /* 모든 상대에게 보내는 오디오를 새 트랙으로 갈아끼운다.
     ⚠️ 음소거 상태를 물려주지 않으면 «음소거했는데 소리가 나가는» 사고가 된다. */
  /* keepOld=true 면 «빼기만» 하고 stop 하지 않는다 — 그 트랙을 우리가 WebAudio 소스로 계속 쓰기 때문이다.
     ⛔ 여기서 stop 해 버리면 빌려 쓰기가 원리상 불가능하다(그 자리가 마이크를 두 번 열던 이유). */
  function swapTrack(next, keepOld) {
    var stream = localStream();
    if (!stream || !next) return false;
    var old = audioTrack();
    /* 🔴 (2026-09-11) 같은 트랙을 «자기 자신» 으로 갈아끼우면 아무것도 하지 않는다.
       [실제 사고] 마이크를 빌려 쓰게 된 뒤, 켜기가 도중에 실패해 되돌릴 때 old 와 next 가
       같은 트랙이 된다. 그대로 두면 아래에서 그 트랙을 stop 하고 «죽은 것» 을 다시 넣어
       교사가 무음이 된다 — 이 기능이 가장 피하려는 실패 방향이다.
       (브라우저 검사 ⑧ 「실패해도 마이크가 살아 있다」가 실제로 잡았다.) */
    if (old === next) return true;
    try { next.enabled = old ? old.enabled : true; } catch (e) {}
    try {
      if (old) { stream.removeTrack(old); if (!keepOld) { try { old.stop(); } catch (e) {} } }
      stream.addTrack(next);
    } catch (e) { console.warn('[office] 스트림 교체 실패:', e); return false; }
    try {
      var pcs = window.vcPeerConnections || {};
      Object.keys(pcs).forEach(function (k) {
        try {
          var sender = pcs[k].getSenders().find(function (s) { return s.track && s.track.kind === 'audio'; });
          if (sender) sender.replaceTrack(next).catch(function () {});
        } catch (e) {}
      });
    } catch (e) {}
    return true;
  }

  /* 게이트 한 틱 — 지금 소리가 «바닥보다 충분히 큰가» 만 본다. */
  function tick() {
    if (!on || !ctx || !anaNode || !gainNode) return;
    /* ⛔ 탭이 숨으면 판정을 멈추고 활짝 연다 — 타이머가 느려진 사이 닫힌 채 굳으면 목소리가 안 나간다. */
    if (document.hidden) {
      try { gainNode.gain.setTargetAtTime(1, ctx.currentTime, ATTACK); } catch (e) {}
      return;
    }
    try {
      anaNode.getFloatTimeDomainData(buf);
      var sum = 0;
      for (var i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      var db = 20 * Math.log10(Math.sqrt(sum / buf.length) + 1e-8);

      /* 바닥 소음 학습 — 아래로는 빨리, 위로는 아주 느리게.
         ⛔ 위로 빨리 따라가면 시끄러운 사무실을 «평소» 로 배워 게이트가 영영 열린 채로 남는다. */
      floorDb += (db < floorDb) ? (db - floorDb) * 0.25 : (db - floorDb) * 0.0015;
      if (!isFinite(floorDb) || floorDb < -90) floorDb = -90;

      var thr = Math.max(floorDb + OPEN_DB, ABS_DB);
      var now = Date.now();
      if (db > thr) { isOpen = true; openUntil = now + HOLD_MS; }
      else if (isOpen && db < thr - HYST_DB && now > openUntil) { isOpen = false; }

      gainNode.gain.setTargetAtTime(isOpen ? 1 : DUCK, ctx.currentTime, isOpen ? ATTACK : RELEASE);
    } catch (e) {
      /* 재는 데 실패하면 «열어 두는» 쪽으로 실패한다 — 목소리가 막히는 것이 최악이다. */
      try { gainNode.gain.setTargetAtTime(1, ctx.currentTime, ATTACK); } catch (e2) {}
    }
  }

  /* 빌려 쓴 트랙을 놓는다.
     ⛔ «지금 vcLocalStream 이 쓰고 있으면» 절대 stop 하지 않는다 — 그건 되돌려 놓은 진짜 마이크다.
        그 가드가 없으면 사무실 모드를 끈 직후 교사가 무음이 된다. */
  function releaseBorrowed() {
    var b = borrowed; borrowed = null;
    if (!b) return;
    try {
      var s = localStream();
      var live = s && s.getAudioTracks && s.getAudioTracks().indexOf(b) >= 0;
      if (!live) b.stop();
    } catch (e) {}
  }

  /* keepBorrowed=true 면 빌린 트랙을 남겨 둔다 — 되돌리기(restorePlainMic)가 그것을 다시 쓴다.
     ⚠️ 남의 기능이 마이크를 갈아끼우는 경로(rewrap)에서는 기본값으로 불러 «놓아» 줘야 한다.
        안 그러면 stream 에서 빠진 옛 트랙이 stop 되지 않고 남아 마이크가 켜진 채 유령이 된다. */
  function teardown(keepBorrowed) {
    if (timer) { clearInterval(timer); timer = null; }
    try { if (srcNode) srcNode.disconnect(); } catch (e) {}
    try { if (hpNode) hpNode.disconnect(); } catch (e) {}
    try { if (gainNode) gainNode.disconnect(); } catch (e) {}
    try { if (anaNode) anaNode.disconnect(); } catch (e) {}
    try { if (ctx && ctx.state !== 'closed') ctx.close(); } catch (e) {}
    try { if (rawStream) rawStream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} }); } catch (e) {}
    if (keepBorrowed !== true) releaseBorrowed();
    ctx = srcNode = hpNode = gainNode = anaNode = destNode = null;
    rawStream = null; procTrack = null; buf = null;
    floorDb = -60; isOpen = false; openUntil = 0;
  }

  /* 지금 쓰는 «진짜» 마이크 장치 id.
     🔴 켜져 있는 동안 vcLocalStream 의 트랙은 WebAudio 가 만든 «가공 트랙» 이라 실제 장치 id 가 없다.
        그것을 deviceId:{exact:…} 로 넘기면 OverconstrainedError 가 나고, 되돌리기가 통째로 실패해
        «무음 가공 트랙» 이 그대로 남는다 = 사무실 모드를 껐는데 소리가 아예 안 나간다.
        (2026-09-08 브라우저 검사가 실제로 이 상태를 잡았다 — 문자열 검사로는 안 보인다.)
     ⇒ 켜져 있을 때는 «켤 때 기억해 둔 값» 이 정본이다. */
  function currentMicId() {
    if (on && srcMicId) return srcMicId;
    try {
      var t = audioTrack();
      var s = t && t.getSettings ? t.getSettings() : null;
      if (s && s.deviceId) return s.deviceId;
    } catch (e) {}
    /* ⛔ 키 이름을 여기에 복제하지 않는다 — 처음에 'mangoi_vc_mic' 이라고 적었는데 그건 «죽은 키» 였다
       (정본은 idx-main.js 의 VC_MIC_PREF_KEY = 'mangoi_vc_mic_id'). 읽으면 늘 null 이라 에러 없이
       «교사가 고른 마이크» 대신 기본 마이크를 잡는다. 정본 함수를 그대로 쓴다. */
    try { if (typeof window.vcSavedMicId === 'function') return window.vcSavedMicId() || ''; } catch (e) {}
    try { return localStorage.getItem('mangoi_vc_mic_id') || ''; } catch (e) { return ''; }
  }

  function micConstraints(officeOn, id) {
    var a = {
      echoCancellation: true,
      noiseSuppression: true,
      /* ① 사무실 모드에서는 자동 게인을 끈다 — 말을 쉴 때 옆자리 소리를 키우는 주범이다. */
      autoGainControl: !officeOn,
      channelCount: 1
    };
    if (id) a.deviceId = { exact: id };
    return { audio: a, video: false };
  }

  /* 🚀 (2026-09-11) 마이크를 «처음 열 때부터» AGC 를 끈 채로 연다 — 그래야 사무실 모드가 장치를
     다시 열지 않아도 된다. 이 한 줄이 «교사만 마이크를 두 번 여는» 것을 없앤다.
     [왜 이 방법뿐인가] 이미 열린 트랙에 applyConstraints 로 AGC 를 끄는 길은 **크로미움이
       조용히 무시한다** — 에러도 안 나고 getSettings().autoGainControl 이 true 그대로다
       (2026-09-11 실측). 그래서 «열고 나서 고치기» 는 원리상 불가능하고, «열 때 정하기» 만 된다.
     ⛔ 학생에게는 절대 걸지 않는다(isStaff) — 사무실 모드는 교사 기능이고, 학생 마이크의
        자동 게인을 말없이 끄면 조용히 말하는 아이 소리가 작아진다.
     ⛔ 사람이 꺼 둔 경우(wantOn=false)·이 페이지에서 이미 실패한 경우(autoFailed)·
        «되돌리는 중»(restoring)에는 손대지 않는다.
     ⚠️ 호출자가 넘긴 객체를 «고치지» 않고 사본을 만든다 — 그 객체를 재사용하는 코드가 있다. */
  function hookGum() {
    var md = navigator.mediaDevices;
    if (!md || typeof md.getUserMedia !== 'function' || md.__officeGum) return;
    var orig = md.getUserMedia.bind(md);
    md.getUserMedia = function (c) {
      try {
        if (c && c.audio && !restoring && isStaff() && wantOn() && !autoFailed) {
          var a = (c.audio === true) ? {} : c.audio;
          if (a && typeof a === 'object' && a.autoGainControl !== false) {
            var c2 = {}; for (var k in c) { if (Object.prototype.hasOwnProperty.call(c, k)) c2[k] = c[k]; }
            var a2 = {}; for (var k2 in a) { if (Object.prototype.hasOwnProperty.call(a, k2)) a2[k2] = a[k2]; }
            a2.autoGainControl = false;
            c2.audio = a2;
            c = c2;
          }
        }
      } catch (e) {}
      return orig(c);
    };
    md.__officeGum = 1;
  }

  /* 🚀 (2026-09-11) 소리 소스를 확보한다 — ① 이미 열려 있는 마이크를 «빌려» AGC 만 끄고,
     ② 그게 안 될 때만 예전처럼 새로 연다.
     ⚠️ 반드시 «실제로 꺼졌는가» 를 getSettings 로 확인하고서만 빌린다. applyConstraints 는
        브라우저가 조용히 무시할 수 있는데, 그대로 빌려 쓰면 ①번 효과(AGC off)가 통째로 죽고
        소리는 정상이라 아무도 못 알아챈다 — 그건 «느린 것» 보다 나쁘다.
     ⛔ 여기에 deviceId 를 넣지 않는다 — 이미 그 장치로 열린 트랙이고, exact 를 얹으면
        OverconstrainedError 로 멀쩡한 재사용이 실패한다. */
  async function openSource(id) {
    var t = audioTrack();
    if (t && t.readyState === 'live' && typeof t.getSettings === 'function') {
      try {
        var st = t.getSettings() || {};
        /* 위 hookGum 덕분에 대개 여기서 끝난다 — 이미 AGC 가 꺼진 트랙이므로 그대로 빌린다. */
        if (st.autoGainControl === false) { borrowed = t; return new MediaStream([t]); }
        /* 아니면 한 번 부탁해 본다. 크로미움은 무시하지만 다른 브라우저는 받아 줄 수 있다.
           ⚠️ «에러가 안 났다» 를 성공으로 읽지 않는다 — 반드시 getSettings 로 다시 확인한다. */
        if (typeof t.applyConstraints === 'function') {
          await t.applyConstraints(micConstraints(true, '').audio);
          st = t.getSettings() || {};
          if (st.autoGainControl === false) { borrowed = t; return new MediaStream([t]); }
        }
        console.log('[office] AGC 가 안 꺼져 마이크를 새로 엽니다 (autoGainControl=' + st.autoGainControl + ')');
      } catch (e) {
        console.log('[office] 기존 마이크를 못 빌렸습니다 — 새로 엽니다:', e && e.name);
      }
    }
    rawStream = await navigator.mediaDevices.getUserMedia(micConstraints(true, id));
    return rawStream;
  }

  /* byUser=true 는 «사람이 스위치를 눌렀다» 는 뜻이다.
     🔴 자동으로 켜졌을 때 remember(true) 를 쓰면 **첫 수업 한 번에 전 교사의 저장값이 '1'** 이 되어
        «아직 안 정함» 과 «사람이 켰음» 이 구별되지 않는다 — 나중에 기본값을 되돌릴 때 이미 켜진 채로
        굳는다(그것을 막으려고 «값을 안 쓰고 없음을 켬으로 읽는» 방식을 고른 것인데, 여기서 쓰면
        하루 늦게 같은 일이 일어난다. 2026-09-09 함정 대조가 잡음). */
  async function enable(byUser) {
    if (on || busy) return true;
    /* ⛔ 여기는 «스위치가 보이는 사람» 까지 받는다(canSee) — 자동 켜기가 아니라 «누른 것» 이기 때문이다.
       isStaff() 로 좁히면 사장님 화면에 **보이는데 눌러도 안 되는 버튼**이 남습니다
       (CLAUDE.md 「기능이 «있는데» 아무도 못 씀」). 「선생님만 자동으로」는 armOnce 가 맡습니다.
       ⚠️ 여기서 저장값을 지우지 않습니다 — 역할이 늦게 오는 강사의 저장값이 그 한 번의 오판으로
          사라지면 «다음 수업에도 안 켜지는» 상태가 굳습니다. 저장값은 사람이 눌렀을 때만 바뀝니다. */
    if (!canSee()) { console.log('[office] 선생님·관리자 전용입니다 — 건너뜁니다'); return false; }
    if (!inCall() || !localStream()) { if (byUser) remember(true); return true; }  // 수업에 들어갈 때 다시 건다
    busy = true;
    try {
      var id = currentMicId();
      srcMicId = id;   // 되돌릴 때 쓸 «진짜» 장치 id — 켜고 나면 트랙에서 못 읽는다
      var srcStream = await openSource(id);   // 빌리거나(빠름) · 못 빌리면 새로 연다(예전 동작)

      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error('AudioContext 없음');
      ctx = new AC();
      /* ⚠️ 사용자 제스처 안에서만 실제로 resume 된다 — 스위치 onclick 에서 부르는 이유다. */
      if (ctx.state === 'suspended') { try { await ctx.resume(); } catch (e) {} }
      if (ctx.state !== 'running') throw new Error('AudioContext 가 running 이 아님');

      srcNode  = ctx.createMediaStreamSource(srcStream);
      hpNode   = ctx.createBiquadFilter();  hpNode.type = 'highpass'; hpNode.frequency.value = 120;  // ②
      gainNode = ctx.createGain();          gainNode.gain.value = 1;                                 // ③
      anaNode  = ctx.createAnalyser();      anaNode.fftSize = 1024; anaNode.smoothingTimeConstant = 0;
      destNode = ctx.createMediaStreamDestination();

      srcNode.connect(hpNode);
      hpNode.connect(anaNode);          // 재는 것은 게이트 «앞» — 게이트가 줄인 소리로 다시 판정하면 굳는다
      hpNode.connect(gainNode);
      gainNode.connect(destNode);

      buf = new Float32Array(anaNode.fftSize);
      procTrack = destNode.stream.getAudioTracks()[0];
      if (!procTrack) throw new Error('가공 트랙 없음');

      /* 🔴 원본 마이크가 죽으면(USB 를 뽑거나 OS 가 장치를 뺏음) «스스로 손을 뗀다».
         왜 필요한가 — idx-main.js 의 마이크 자가치유(vcHealLocalMic)는
         「살아 있는 트랙이 하나라도 있으면 그만둔다」로 판정하는데,
         WebAudio 가 만든 가공 트랙은 **원본이 죽어도 계속 'live'** 다(실측).
         ⇒ 우리가 끼어 있는 동안에는 그 자가치유가 원리상 못 돈다 = 교사가 조용히 무음이 되고
            「🎤 마이크가 자동으로 다시 연결됐어요」 안내도 안 나온다.
         여기서 사무실 모드를 끄면 표준 마이크로 돌아가고, 그때부터 자가치유가 다시 일한다.
         ⚠️ 저장값은 «켜짐» 으로 둔다(keepPref) — 사람이 끈 것이 아니다. */
      try {
        var rawT = srcStream.getAudioTracks()[0];
        /* ⛔ onended 에 «대입» 하지 않는다 — 빌려 쓰는 경우 그 트랙은 남의 것이라, 다른 코드가
           걸어 둔 처리를 덮어써 버린다. 듣기만 하고 남의 것은 건드리지 않는다. */
        if (rawT) rawT.addEventListener('ended', function () {
          if (!on) return;
          console.warn('[office] 원본 마이크가 끊겨 사무실 모드를 해제합니다 — 마이크 자가치유에 넘깁니다');
          try { disable(true); } catch (e) {}
        });
      } catch (e) {}

      /* 빌린 트랙이면 stop 하지 않고 «빼기만» 한다 — 그것이 지금 WebAudio 의 소스다. */
      if (!swapTrack(procTrack, !!borrowed)) throw new Error('트랙 교체 실패');

      /* 한 번이라도 성공했으면 «이 기기에서는 된다» 는 뜻 — 자동 적용 차단을 푼다.
         (사람이 스위치로 켜서 성공한 경우도 여기로 온다.) */
      on = true; if (byUser) remember(true); autoFailed = false;
      timer = setInterval(tick, TICK_MS);
      console.log('[office] 사무실 모드 켜짐 — AGC off + 하이패스 120Hz + 노이즈 게이트');
      busy = false;
      return true;
    } catch (e) {
      console.warn('[office] 켜기 실패 — 원래대로 되돌립니다:', e);
      teardown(true); on = false; busy = false;   // 빌린 트랙은 남긴다 — 되돌리기가 그것을 쓴다
      try { await restorePlainMic(); } catch (e2) {}
      releaseBorrowed();
      /* ⛔ remember(false) 로 적지 않는다 — 그러면 «일시 장애» 가 «사람이 껐다» 로 굳어
         기본 켜짐(2026-09-09)이 그 브라우저에서 영영 사라진다. 「아직 안 정함」으로 되돌린다.
         ⚠️ 대신 이 페이지에서는 «자동으로» 다시 시도하지 않는다 — 계속 실패하는 기기에서
            수업마다 마이크를 다시 잡는 일이 되풀이되지 않게. 사람이 스위치를 누르면 다시 시도한다. */
      forget();
      autoFailed = true;
      return false;
    }
  }

  /* 표준 제약(자동 게인 켬)으로 마이크를 다시 잡아 원래 경로로 되돌린다.
     ⚠️ 여기는 «절대 실패하면 안 되는» 경로다 — 실패하면 무음 가공 트랙이 그대로 남아 소리가 안 나간다.
        그래서 ① 기억해 둔 장치로 잡아 보고 ② 안 되면 «아무 마이크나» 로 한 번 더 잡는다.
        ⛔ 장치 지정을 «먼저» 포기하지는 않는다 — 교사가 고른 마이크가 아닌 것으로 바뀌면 그것도 사고다. */
  async function restorePlainMic() {
    if (!inCall() || !localStream()) return;
    restoring = true;
    try {
      /* 🚀 (2026-09-11) 빌려 쓰던 트랙이 아직 살아 있으면 «제약만» 되돌려 그대로 쓸 수 있는지 본다 —
         되면 장치를 다시 열지 않아도 끄기가 끝난다.
         🔴 그런데 크로미움은 이 방향도 조용히 무시한다(2026-09-11 실측: AGC 를 끈 채로 연 트랙에
            applyConstraints({autoGainControl:true}) → 예외 없음 · getSettings 는 여전히 false).
            그대로 믿고 쓰면 «껐는데 AGC 는 꺼진 채» 로 그 세션 내내 가서, 조용히 말할 때
            교사 소리가 작아진다 — 「켜기 전으로 되돌아간다」가 거짓이 된다.
         ⚠️ 그래서 openSource 와 «같은 규칙» 을 쓴다: 에러가 안 난 것을 성공으로 읽지 않고
            getSettings 로 실제 값을 확인하고서만 그 트랙을 쓴다. 아니면 아래 예전 경로로 내려간다. */
      var b = borrowed;
      if (b && b.readyState === 'live') {
        try {
          if (typeof b.applyConstraints === 'function') await b.applyConstraints(micConstraints(false, '').audio);
          var bs = (typeof b.getSettings === 'function' ? b.getSettings() : null) || {};
          if (bs.autoGainControl !== false && swapTrack(b)) { borrowed = null; return; }
          console.log('[office] AGC 가 안 돌아와 마이크를 새로 엽니다 (autoGainControl=' + bs.autoGainControl + ')');
        } catch (e) {
          console.warn('[office] 빌린 마이크로 못 되돌렸습니다 — 새로 잡습니다:', e && e.name);
        }
      }
      /* 🔴 새로 열기 «전» 에 빌린 트랙을 놓는다 — 같은 장치가 아직 열려 있으면 크로미움이
         **그 트랙의 오디오 설정을 새 트랙에도 그대로 준다.** 그러면 「AGC 를 켜 달라」고
         제대로 요청해도 꺼진 채로 열려, 껐는데도 교사 소리가 계속 작아진다(2026-09-11 실측:
         놓기 전 false · 놓고 나면 true). 놓아도 무음이 되지 않는다 — 지금 내보내는 것은
         아직 가공 트랙이고, 바로 아래에서 새 트랙으로 갈아끼운다.
         ⚠️ releaseBorrowed 안의 가드(지금 쓰는 중이면 stop 안 함)는 그대로 지나간다. */
      releaseBorrowed();
      var s = null;
      var id = srcMicId || currentMicId();
      if (id) {
        try { s = await navigator.mediaDevices.getUserMedia(micConstraints(false, id)); }
        catch (e) { console.warn('[office] 원래 장치로 못 잡음 — 기본 마이크로 되돌립니다:', e && e.name); s = null; }
      }
      if (!s) s = await navigator.mediaDevices.getUserMedia(micConstraints(false, ''));
      var t = s.getAudioTracks()[0];
      if (t) swapTrack(t);
    } finally { restoring = false; }
  }

  /* keepPref=true 면 저장값을 «켜짐» 그대로 둔다.
     🔴 왜 갈라야 하나 — 수업에서 나갈 때도 이 함수를 부르는데, 무조건 remember(false) 로 두면
        «사람이 끈 것» 과 «수업이 끝난 것» 이 같은 값이 되어 **설정이 다음 수업으로 안 넘어간다.**
        (2026-09-08 함정 대조가 잡음: 나가기 전 '1' → 나간 뒤 '0'.)
        CLAUDE.md 「화면의 «끄기»를 눌렀더니 다시 켤 수가 없음 — 상태가 셋인데 저장이 둘」의 형제. */
  async function disable(keepPref) {
    if (busy) return;
    busy = true;
    var was = on;
    on = false;
    teardown(true);                              // 빌린 트랙은 남긴다 — 되돌리기가 그것을 쓴다
    if (keepPref !== true) remember(false);
    if (was) {
      try { await restorePlainMic(); }
      catch (e) {
        /* 🔴 여기까지 왔으면 무음이 될 수 있다 — 조용히 넘기지 않는다. 마지막으로 한 번 더 잡아 본다. */
        console.error('[office] 🔴 마이크 되돌리기 실패 — 소리가 안 나갈 수 있습니다:', e);
        restoring = true;   // 이 마지막 시도도 «켜기 전» 이어야 한다 — hookGum 이 AGC 를 또 끄면 안 된다
        try {
          var s2 = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          var t2 = s2.getAudioTracks()[0];
          if (t2) swapTrack(t2);
        } catch (e2) { console.error('[office] 🔴 마지막 시도도 실패:', e2); }
        finally { restoring = false; }
      }
    }
    releaseBorrowed();   // 되돌리기가 다 쓴 뒤 정리 — 지금 쓰는 중이면 stop 하지 않는다(그 안의 가드)
    srcMicId = '';
    console.log('[office] 사무실 모드 꺼짐');
    busy = false;
  }

  window.vcSetOfficeMode = function (want) {
    return want ? enable(true) : disable();   // 이 경로는 «사람이 눌렀다» 뿐이다(스위치·원격)
  };
  window.vcOfficeModeOn = function () { return on; };

  /* ── 다른 기능이 마이크 트랙을 갈아끼우면 우리 체인이 끊긴다 — 그 뒤에 다시 건다.
        ⚠️ 원본이 없으면 아무것도 하지 않는다(이름이 바뀌면 조용히 헛돈다는 뜻이기도 하다). ── */
  function rewrap(name) {
    var orig = window[name];
    if (typeof orig !== 'function' || orig.__officeWrapped) return;
    var wrapped = async function () {
      var wasOn = on;
      if (wasOn) { teardown(); on = false; }   // 우리 체인을 먼저 접는다(그쪽이 옛 트랙을 stop 한다)
      var r;
      try { r = await orig.apply(this, arguments); }
      finally { if (wasOn) { try { await enable(false); } catch (e) {} } }   // 이어 가는 것 — 저장값을 새로 쓰지 않는다
      return r;
    };
    wrapped.__officeWrapped = true;
    window[name] = wrapped;
  }

  function bootWraps() {
    rewrap('vcSetNoiseSuppression');
    rewrap('vcSetMicDevice');
    /* 🔴 vcSwitchMic 은 «직접» 불리는 경로가 둘이라 반드시 감싸야 한다 —
          index.html 의 <select id="vc-mic-select" onchange="vcSwitchMic(...)"> 와
          idx-main.js 의 강사→학생 「장치 도우미」 원격 전환.
          그 함수는 vcLocalStream 의 오디오 트랙을 전부 stop·remove 하므로 우리 가공 트랙이 날아가는데,
          감싸지 않으면 vcOfficeModeOn() 이 계속 true 라 «켜졌다고 말하는데 아무 일도 안 하는» 상태가 되고
          게이트 타이머·AudioContext·두 번째 마이크 캡처가 수업 내내 그대로 남는다.
          (2026-09-08 함정 대조 실측: trackChanged:true · nowRealMic:true 인데 officeSaysOn:true) */
    rewrap('vcSwitchMic');
  }

  /* 수업에 들어간 뒤 «저장된 값» 대로 한 번 건다.
     ⛔ body class 를 MutationObserver 로 지켜보지 않는다(홈 전체를 멎게 한 전력) —
        showView 를 감싸 그 순간에만 확인한다. */
  var pending = null;
  /* 🔴 여기서 「지금 수업인가」를 보고 아니면 그만두면 «한 번도 안 도는» 코드가 된다 —
        입장 순서가 `showView('view-videocall-call')` → `body.classList.add('vc-in-call')` 이라
        (idx-main.js:2869~2870 · 관찰자 입장 3830~3831도 같음) 우리 훅이 도는 순간 inCall() 은 아직 false 다.
        (2026-09-08 함정 대조 실측: 그 순서에서 vcOfficeModeOn() 이 영영 false 였다.)
     ⇒ «수업이 시작되기를» 잠깐 기다렸다가, 시작된 뒤에 마이크가 서면 건다. */
  function armOnce() {
    if (pending || autoFailed) return;
    var tries = 0, sawCall = false;
    pending = setInterval(function () {
      tries++;
      if (tries > 40) { clearInterval(pending); pending = null; return; }   // 20초면 포기
      /* 🔴 «이미 도는» 폴링도 실패를 봐야 한다 — autoFailed 를 진입할 때만 보면, 사람이 스위치를
         눌러 실패한 직후(저장값은 forget 으로 «아직 안 정함» = 기본 켜짐) 이 폴링이 곧바로 다시 켠다.
         그러면 「이 페이지에서는 자동으로 다시 시도하지 않는다」는 이 파일의 약속이 깨지고,
         되돌려 놓은 마이크를 다시 가공 트랙으로 갈아끼워 «켜기 전» 복구도 무효가 된다
         (2026-09-11 브라우저 검사 ⓙ-2 가 실제로 잡았다). */
      if (autoFailed) { clearInterval(pending); pending = null; return; }
      if (inCall()) sawCall = true;
      else if (sawCall) { clearInterval(pending); pending = null; return; } // 들어갔다 나갔으면 그만
      if (!sawCall) return;                                                  // 아직 입장 전 — 더 기다린다
      /* ⛔ 자동 켜기는 «선생님» 만 — canSee 로 넓히면 공용 PC 에 남은 관리자 세션으로
         «학생으로 입장» 한 아이의 마이크에까지 게이트가 걸립니다(위 canSee/isStaff 주석). */
      if (!isStaff()) return;   // 역할이 아직 안 왔을 수 있다 — 학생이면 그대로 20초 뒤 포기한다
      if (localStream() && audioTrack()) {
        clearInterval(pending); pending = null;
        if (wantOn() && !on) enable(false);   // 자동 — 저장값을 쓰지 않는다(위 enable 주석)
      }
    }, 500);
  }

  function hookShowView() {
    var orig = window.showView;
    if (typeof orig !== 'function' || orig.__officeHooked) return false;
    var wrapped = function () {
      var r = orig.apply(this, arguments);
      try {
        bootWraps();
        /* ⛔ 여기서 inCall() 로 가르지 않는다 — 위 armOnce 주석대로 입장 때는 아직 false 다.
           수업 화면으로 «가는» 전환이면 걸고, 수업 «밖» 으로 나가는 전환이면 끈다. */
        var toCall = false;
        try { toCall = String(arguments[0] || '').indexOf('videocall') >= 0; } catch (e2) {}
        if (toCall) { if (wantOn()) armOnce(); }
        else if (on) disable(true);   // 수업이 끝난 것 — «사람이 끈 것» 이 아니므로 저장값은 지킨다
      } catch (e) {}
      return r;
    };
    wrapped.__officeHooked = true;
    window.showView = wrapped;
    return true;
  }

  function boot() {
    bootWraps();
    hookGum();
    if (!hookShowView()) setTimeout(hookShowView, 1500);
    /* 이미 수업 중에 이 파일이 늦게 실린 경우 — armOnce 가 스스로 «입장했나» 를 확인하므로 그냥 건다. */
    /* ⚠️ 여기에 조건이 없으면 «홈을 여는 모든 방문자»(학생 29,000명 포함)가 20초 폴링을 시작한다.
       이 자리의 목적은 주석 그대로 «이미 수업 중일 때» 하나뿐이고, 수업 진입은 showView 훅이 맡는다. */
    if (wantOn() && inCall()) armOnce();
  }
  /* ⚠️ gUM 훅만은 DOMContentLoaded 를 기다리지 않는다 — 그 사이에 마이크가 열리면
     (자동입장 링크가 그렇다) AGC 가 켜진 트랙이 잡혀 이 수리가 통째로 헛돈다. */
  hookGum();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
