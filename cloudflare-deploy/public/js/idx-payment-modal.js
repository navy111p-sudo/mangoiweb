(function(){
  const modal = document.getElementById('payment-modal');
  if (!modal) return;
  const result = document.getElementById('payment-result');

  let selectedProgram = null;
  let selectedPrice = 0;
  let selectedMethod = null;
  /* ─── 신규/연장 분기 상태 ───
     🔴 (2026-07-30) 연장('extend'/'auto') 카드는 이제 클릭 즉시 /enroll.html 로 리다이렉트한다
     (제보 #4 — extPackage.id 가 서버 가격표에 없어 결제수단을 뭘 골라도 항상 거부되던 버그,
     B안 채택: enroll.html 의 이미 검증된 연장 기능 재사용). payMode 는 이제 'new' 외의 값이
     되지 않으므로, 아래 extStudent/extPackage/ADDON_CATALOG 와 payMode==='extend' 로 갈라지는
     코드들은 전부 도달 불가능(dead) 상태다 — 당장 지우진 않았지만(범위가 넓어 위험도가 높음),
     새 기능을 여기 추가하지 말 것. '자동연장'(매월 할인) 개념 자체를 되살리려면 별도 설계 필요. */
  let payMode = null;            // 'new' | 'extend'
  let extStudent = null;         // { uid, name, level, current_program, remaining, expire_at, total_classes, months }
  let extMode = 'same';          // 'same' | 'upgrade' | 'addon'
  let extPackage = null;         // 선택된 연장 패키지 { id, name, detail, base, discount_pct, final, classes }
  let extAddons = new Set();     // 선택된 추가 옵션 ID
  // 추가 옵션 카탈로그 (월 단가 KRW)
  const ADDON_CATALOG = [
    { id: 'fixed_teacher',  icon: '🎯', name: '강사 고정',          desc: '같은 강사 우선 배정 (월간 보장)', price: 30000 },
    { id: 'prime_time',     icon: '⏰', name: '시간대 우선권',      desc: '골든타임(저녁 7~10시) 우선 예약', price: 20000 },
    { id: 'writing_review', icon: '📚', name: '1:1 영작 첨삭',      desc: '주 1회 영작문 첨삭 + 음성 피드백', price: 40000 },
    { id: 'manager',        icon: '👨‍💼', name: '학습 매니저',        desc: '월 2회 1:1 학습 코칭 + 진도 점검', price: 50000 },
    { id: 'group_class',    icon: '🌍', name: '원어민 그룹 클래스',   desc: '주 1회 토론 클래스 무제한 참여',  price: 60000 },
    { id: 'pron_ai',        icon: '🤖', name: 'AI 발음 코치',         desc: '24시간 AI 발음 평가 + 피드백',      price: 15000 },
  ];
  // 코스 카탈로그 (연장 패키지 매핑용)
  const COURSE_CATALOG = {
    '1on1-4':  { name: '1:1 4회권',   classes: 4,  base: 60000,  per: 15000 },
    '1on1-8':  { name: '1:1 8회권',   classes: 8,  base: 120000, per: 15000 },
    '1on1-12': { name: '1:1 12회권',  classes: 12, base: 180000, per: 15000 },
    '1on1-24': { name: '1:1 24회권',  classes: 24, base: 360000, per: 15000 },
    'group-12':{ name: '그룹 12회권', classes: 12, base: 120000, per: 10000 },
    'business':{ name: '비즈니스',     classes: 4,  base: 70000,  per: 17500 },
    'kids':    { name: '키즈 영어',    classes: 4,  base: 50000,  per: 12500 },
    'exam':    { name: '시험 영어',    classes: 4,  base: 80000,  per: 20000 },
  };

  const PROG_INFO = {
    /* ⏱️ (2026-08-07, QA 2차 #3) 무료체험·레벨테스트는 20분으로 통일.
       유료 수강권(1:1 4/8/12/24회권)의 40분 표기는 그대로 둔다 — 요청에 "유료 상품에는
       영향이 없도록"이 명시돼 있다. 서버 기본 수업길이는 이미 20분이다(src/class-policy.ts
       DEFAULT_CLASS_MINUTES=20, 레벨테스트 배정도 이 값을 쓴다) — 즉 여기 40분은 «화면에만
       남아 있던 옛 표기»였고, 이 수정으로 화면과 실제가 처음으로 일치한다. */
    'trial': { icon: '🎁', name: '무료 체험', detail: '1회 (20분)', price: 0 },
    '1on1-4': { icon: '📗', name: '1:1 4회권', detail: '맛보기 (40분)', price: 60000 },
    '1on1-8': { icon: '📘', name: '1:1 8회권', detail: '월 2회/주 (40분)', price: 120000 },
    '1on1-12': { icon: '📕', name: '1:1 12회권', detail: '월 3회/주 (40분)', price: 180000 },
    '1on1-24': { icon: '📚', name: '1:1 24회권', detail: '월 6회/주 (40분)', price: 360000 },
    'group-12': { icon: '👥', name: '그룹 12회권', detail: '2-4명 토론', price: 120000 },
    'business': { icon: '💼', name: '비즈니스 영어', detail: '실전 회의·이메일', price: 70000 },
    'kids': { icon: '👶', name: '키즈 영어', detail: '놀이형 4-12세', price: 50000 },
    'exam': { icon: '📝', name: '시험 영어', detail: 'TOEIC·OPIc·IELTS', price: 80000 },
    /* 🤖 (2026-09-09) 화상수업 없이 AI 학습도구(판단력 훈련·AI 영작첨삭·AI 영어친구 등)만 쓰는 1개월 이용권.
       서버 가격표(src/api-pay.ts PRICES)와 이름·금액을 반드시 동기화할 것. */
    'ai_content': { icon: '🤖', name: 'AI 콘텐츠 전용', detail: '화상수업 없이 AI 학습도구만 (1개월)', price: 10000 },
    'b2b': { icon: '🏢', name: 'B2B / 학원', detail: '기업·학원 단체 도입', price: 0 },
    'other': { icon: '❓', name: '기타 / 상담', detail: '맞춤 코스', price: 0 },
  };

  // 🎬 결제 안내 영상 (typecast 남자 강사) — 결제하기 진입 시 자동 재생, 끝나면 자동으로 사라짐 (2026-06-12)
  function killPayGuideVideo(){
    var w = document.getElementById('pay-guide-vid-wrap');
    if (w) { try { var v = w.querySelector('video'); if (v) v.pause(); } catch(_){} if (w.parentNode) w.parentNode.removeChild(w); }
  }
  function showPayGuideVideo(){
    killPayGuideVideo();
    var vw = document.createElement('div');
    vw.id = 'pay-guide-vid-wrap';
    vw.style.cssText = 'position:fixed;top:12px;right:12px;z-index:10001;width:min(220px,44vw);aspect-ratio:1/1;border-radius:16px;overflow:hidden;box-shadow:0 12px 30px -8px rgba(0,0,0,.7);border:1px solid rgba(251,191,36,.45);background:#000;cursor:pointer;animation:fadeIn .25s';
    vw.innerHTML = '<video id="pay-guide-vid" src="/video/payment-guide-male.mp4" playsinline preload="auto" style="width:100%;height:100%;object-fit:cover;display:block;pointer-events:none"></video>'
      + '<button type="button" id="pay-guide-vid-mute" title="소리 켜기/끄기" aria-label="소리 켜기/끄기" style="position:absolute;right:6px;bottom:6px;width:32px;height:32px;border-radius:50%;border:0;background:rgba(0,0,0,.55);color:#fff;font-size:15px;cursor:pointer;display:none;align-items:center;justify-content:center;padding:0;z-index:2">🔊</button>'
      + '<button type="button" id="pay-guide-vid-x" title="닫기" aria-label="닫기" style="position:absolute;left:6px;top:6px;width:26px;height:26px;border-radius:50%;border:0;background:rgba(0,0,0,.5);color:#fff;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;z-index:4">✕</button>'
      + '<button type="button" id="pay-guide-vid-start" title="시작" aria-label="안내 영상 시작" style="position:absolute;left:50%;bottom:10px;transform:translateX(-50%);border:0;background:rgba(251,191,36,.97);color:#1a1a1a;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;padding:6px 14px;border-radius:999px;font-size:12px;font-weight:800;letter-spacing:.5px;box-shadow:0 3px 10px rgba(0,0,0,.5);z-index:3">'
        + '<span style="font-size:11px;line-height:1;padding-left:1px">▶</span><span>시작</span>'
      + '</button>';
    document.body.appendChild(vw);
    var vid = vw.querySelector('#pay-guide-vid');
    var vmb = vw.querySelector('#pay-guide-vid-mute');
    var vx  = vw.querySelector('#pay-guide-vid-x');
    var vst = vw.querySelector('#pay-guide-vid-start');
    function vupd(){ vmb.textContent = vid.muted ? '🔇' : '🔊'; }
    // 🔇 시작 전에는 재생하지 않고 ▶ 시작 버튼만 노출 (브라우저 자동 음성재생 금지 정책 대응)
    vid.muted = false;
    vupd();
    // ▶ 시작: 누르면 안내 영상이 '소리와 함께' 처음부터 재생
    vst.addEventListener('click', function(e){
      e.stopPropagation();
      try { vid.currentTime = 0; } catch(_){}
      vid.muted = false; vupd();
      var pp = vid.play();
      if (pp && pp.catch) pp.catch(function(){ vid.muted = true; vupd(); var p2 = vid.play(); if (p2 && p2.catch) p2.catch(function(){}); });
      vst.style.display = 'none';        // 시작 버튼 숨김
      vmb.style.display = 'flex';        // 음소거 토글 버튼 노출
    });
    vid.addEventListener('ended', killPayGuideVideo);           // 끝나면 자동으로 사라짐
    vmb.addEventListener('click', function(e){ e.stopPropagation(); vid.muted = !vid.muted; if (!vid.muted) { var pp = vid.play(); if (pp && pp.catch) pp.catch(function(){}); } vupd(); });
    vx.addEventListener('click', function(e){ e.stopPropagation(); killPayGuideVideo(); });
    vw.addEventListener('click', killPayGuideVideo);            // 재생 후 영상 클릭하면 바로 사라짐
  }

  window.openPaymentModal = function(){
    selectedProgram = null; selectedPrice = 0; selectedMethod = null;
    payMode = null; extStudent = null; extMode = 'same'; extPackage = null; extAddons = new Set();
    window._isAutoRenew = false;
    document.querySelectorAll('.product-card.selected').forEach(c => c.classList.remove('selected'));
    document.querySelectorAll('.method-card.selected').forEach(c => c.classList.remove('selected'));
    document.querySelectorAll('.paymode-card.selected').forEach(c => c.classList.remove('selected'));
    document.getElementById('payment-form-data') && (document.getElementById('payment-form-data').reset && document.getElementById('payment-form-data').reset());
    ['pay-payer','pay-student','pay-contact','pay-email','pay-referrer','pay-coupon','pay-memo','pay-amount','ext-uid','ext-auth'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    const studCard = document.getElementById('ext-student-card');
    if (studCard) { studCard.style.display = 'none'; studCard.innerHTML = ''; }
    const errEl = document.getElementById('ext-auth-err');
    if (errEl) errEl.style.display = 'none';
    // 즉석결제 패널 초기화
    const ipp = document.getElementById('instant-pay-panel');
    if (ipp) ipp.style.display = 'none';
    // ✅ 로그인 상태면 상단 안내 배너 표시 (정보 입력 없이 바로 결제 안내)
    try {
      var _pill = document.getElementById('pay-login-pill');
      if (_pill) {
        var _u = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
        if (_u && (_u.uid || _u.name)) {
          _pill.style.display = 'flex';
          _pill.innerHTML = '<span style="font-size:14px">✅</span>'
            + '<span style="color:#86efac;font-size:12px;font-weight:700">'
            + escapeHtml(_u.name || _u.uid) + '님 · 로그인됨 — 정보 입력 없이 바로 결제돼요</span>';
        } else {
          _pill.style.display = 'none';
          _pill.innerHTML = '';
        }
      }
    } catch (e) {}
    // 🔄 (2026-08-07) 로그인/로그아웃이 중간에 바뀌었을 수 있으니 자동채움 캐시는 열 때마다 버린다
    _payPrefillP = null;
    // 💳 (2026-08-07 #1) 결제 환경(라이브/테스트)을 서버에서 받아와 배너 갱신
    payLoadConfig().then(payRenderModeBanner).catch(function(){});

    payGoStep(0);
    result.style.display = 'none';
    modal.style.display = 'flex';
    showPayGuideVideo();   // 🎬 결제 안내 영상 자동 재생
  };

  /* 🎁 (2026-08-07, QA 2차 #2) 「체험수업」 메뉴 전용 빠른 진입.
     ⚠️ 신청 «폼»을 새로 만들지 않는다. 레벨테스트 신청서가 두 벌로 갈라져 접수가 새던 전례가 있다
        (2026-08-05, 어느 문으로 들어오느냐에 따라 계정이 생기기도 안 생기기도 했다).
     그래서 이미 있는 두 문 중 하나로만 보낸다 — 둘 다 접수는 POST /api/student/inquiry 한 곳이다.
       1순위: 무료체험 신청 폼(신규상담 모달, 과정=무료 체험). 홈 히어로 「무료 체험 신청」과 같은 문.
       2순위: 결제하기 안의 '무료 체험' 상품 카드(1순위를 못 찾았을 때만).
     기존 결제하기 → 상품선택 → 무료 체험 경로는 그대로 남는다(대체 아님, 입구 추가). */
  window.openTrialSignup = function(){
    if (window.gridActions && typeof window.gridActions.trial === 'function') {
      try { window.gridActions.trial(); return; } catch (_) {}
    }
    if (window.openInquiryModal) {
      window.openInquiryModal();
      setTimeout(function(){ var p = document.getElementById('inq-program'); if (p) p.value = 'trial'; }, 100);
      return;
    }
    window.openPaymentModal();
    payMode = 'new';
    window._isAutoRenew = false;
    document.querySelectorAll('.paymode-card.selected').forEach(c => c.classList.remove('selected'));
    var newCard = document.querySelector('.paymode-card[data-mode="new"]');
    if (newCard) newCard.classList.add('selected');
    setTimeout(function(){
      var trial = document.querySelector('.product-card[data-program="trial"]');
      if (trial) { trial.click(); return; }              // 카드 클릭 = 기존 흐름 그대로
      payGoStep(1);                                       // 카드를 못 찾으면 상품 선택 화면으로
    }, 120);
  };

  function closeModal(){
    modal.style.display = 'none';
    killPayGuideVideo();   // 영상도 함께 종료
    // 결제 모달 닫으면 히트맵 그리드(메뉴)로 자동 복귀
    const gm = document.getElementById('grid-menu');
    if (gm) gm.style.display = 'block';
  }
  document.getElementById('payment-close').addEventListener('click', closeModal);

  /* 🔒 (2026-08-07, QA 2차 #4) 배경(바깥) 클릭으로는 닫지 않는다.
     결제는 «상품 → 정보 입력 → 결제수단» 3단계다. 중간에 실수로 바깥을 누르면
     입력한 결제자·학생·연락처가 통째로 날아가고 처음부터 다시 해야 했다.
     정책과 «닫기 버튼이 실제로 있는지» 판정은 /js/mg-modal-policy.js 한 곳에 있다.
     ⚠️ 폴백은 true — 정책 스크립트를 못 받았으면 예전 동작(배경 닫힘)이 맞다. 가두면 안 된다. */
  function payBackdropOK(el){ return window.mgBackdropClosable ? window.mgBackdropClosable(el) : true; }
  modal.addEventListener('click', (e) => { if (e.target === modal && payBackdropOK(modal)) closeModal(); });

  /* ESC — 상품만 고른 0단계에서는 잃을 게 없으니 바로 닫고,
     정보를 입력하기 시작한 뒤(1단계~)에는 한 번 물어본다. */
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || modal.style.display === 'none') return;
    var typed = ['pay-payer','pay-student','pay-contact','pay-email','pay-memo','pay-amount']
      .some(function(id){ var el = document.getElementById(id); return el && String(el.value || '').trim(); });
    if (typed && window.mgConfirmDiscard && !window.mgConfirmDiscard()) return;
    closeModal();
  });

  // 단계 전환 (mode-aware: new vs extend)
  window.payGoStep = function(step) {
    // 모든 pane 숨김
    document.querySelectorAll('.pay-step-pane').forEach(p => p.style.display = 'none');

    // step·mode → 적절한 pane 표시
    let paneId = null;
    if (step === 0) paneId = 'pay-step0';
    else if (step === 1) paneId = (payMode === 'extend') ? 'pay-step1-ext' : 'pay-step1';
    else if (step === 2) paneId = (payMode === 'extend') ? 'pay-step2-ext' : 'pay-step2';
    else if (step === 3) paneId = 'pay-step3';
    const pane = document.getElementById(paneId);
    if (pane) pane.style.display = 'block';

    // step indicator 업데이트
    document.querySelectorAll('.pay-step').forEach(el => {
      const n = Number(el.dataset.step);
      el.classList.remove('pay-step-active', 'pay-step-done');
      if (n < step) el.classList.add('pay-step-done');
      else if (n === step) el.classList.add('pay-step-active');
    });

    // step indicator 라벨 (모드별 다름)
    const lab1 = document.getElementById('pay-step-label-1');
    const lab2 = document.getElementById('pay-step-label-2');
    if (lab1 && lab2) {
      if (payMode === 'extend') {
        lab1.textContent = '학생 확인';
        lab2.textContent = '연장 옵션';
      } else {
        lab1.textContent = '상품 선택';
        lab2.textContent = '정보 입력';
      }
    }
    // 헤더 타이틀
    const title = document.getElementById('pay-modal-title');
    const subt = document.getElementById('pay-modal-subtitle');
    if (title && subt) {
      if (payMode === 'extend' && window._isAutoRenew) {
        title.textContent = '♾️ 자동연장 결제';
        subt.textContent = '매월 자동 결제 · 최대 25% 할인 + 프리미엄 혜택';
      } else if (payMode === 'extend') {
        title.textContent = '🔄 연장 결제';
        subt.textContent = '잔여 회차 자동 이월 + 최대 20% 할인';
      } else if (payMode === 'new') {
        title.textContent = '🆕 신규 결제';
        subt.textContent = '원하시는 코스를 선택해 주세요';
      } else {
        title.textContent = '💳 결제하기';
        subt.textContent = '신규/연장을 선택해 주세요. 1분이면 끝나요!';
      }
    }

    // 신규 모드 — 기존 상품/정보 동기화
    if (payMode === 'new' && selectedProgram) {
      const info = PROG_INFO[selectedProgram];
      const setIfExists = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      setIfExists('sb-icon', info.icon);
      setIfExists('sb-name', info.name);
      setIfExists('sb-detail', info.detail);
      setIfExists('sb-price', selectedPrice > 0 ? '₩' + selectedPrice.toLocaleString('ko-KR') : '상담 후 결정');
      setIfExists('sb-icon-3', info.icon);
      setIfExists('sb-name-3', info.name);
      setIfExists('sb-price-3', selectedPrice > 0 ? '₩' + selectedPrice.toLocaleString('ko-KR') : '상담 후 결정');
      const payer = document.getElementById('pay-payer')?.value || '';
      const contact = document.getElementById('pay-contact')?.value || '';
      setIfExists('sb-payer-3', payer && contact ? `${payer} · ${contact}` : '결제자 정보');

      // 💬 '기타 / 상담' 코스: 요약 카드를 누르면 카카오 상담으로 바로 연결
      const sb2 = document.querySelector('#pay-step2 .selected-banner');
      if (sb2) {
        const isOther = (selectedProgram === 'other');
        sb2.style.cursor = isOther ? 'pointer' : '';
        sb2.title = isOther ? '카카오 상담으로 바로가기' : '';
        if (!sb2.dataset.kakaoHooked) {
          sb2.dataset.kakaoHooked = '1';
          sb2.addEventListener('click', function(ev){
            if (ev.target.closest('.sb-change')) return;      // '변경' 버튼은 제외
            if (selectedProgram === 'other' && window.openKakao) window.openKakao();
          });
        }
        let hint = document.getElementById('sb-kakao-hint');
        if (isOther) {
          if (!hint) {
            hint = document.createElement('div');
            hint.id = 'sb-kakao-hint';
            hint.style.cssText = 'font-size:11px;color:#FEE500;font-weight:700;margin:6px 2px 0';
            sb2.insertAdjacentElement('afterend', hint);
          }
          hint.textContent = '💬 위 카드를 누르면 카카오 상담으로 바로 연결돼요';
        } else if (hint) { hint.remove(); }
      }
    }

    // 연장 모드 — Step 3 진입 시 결제수단 카드 위에 연장 요약 배너
    if (payMode === 'extend' && step === 3 && extStudent && extPackage) {
      const setIfExists = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      const total = computeExtTotal();
      setIfExists('sb-icon-3', '🔄');
      setIfExists('sb-name-3', extPackage.name + ' (연장)');
      setIfExists('sb-price-3', '₩' + total.toLocaleString('ko-KR'));
      setIfExists('sb-payer-3', extStudent.name + ' · ' + (extStudent.uid || ''));
      // 연장 모드에서는 selectedPrice도 동기화 (즉석결제 패널 계산용)
      selectedPrice = total;
      selectedProgram = extPackage.id || 'extend-' + extMode;
    }

    // 'other' 선택 시 금액 입력란 표시
    const amtRow = document.getElementById('pay-amount-row');
    if (amtRow) amtRow.style.display = selectedProgram === 'other' ? 'block' : 'none';
  };

  // ━━━━━━━━━━ Step 0: 신규/연장/자동연장 카드 클릭 ━━━━━━━━━━
  document.querySelectorAll('.paymode-card').forEach(card => {
    card.addEventListener('click', () => {
      const mode = card.dataset.mode;

      /* 🔁 (2026-07-30) 연장·자동연장 → 수강신청 페이지(enroll.html)로 통일 — 제보 #4, B안.
         이 모달의 연장 흐름(업그레이드·부가옵션 포함)은 extPackage.id(예: '1on1-8-extend',
         'addon-8')를 서버 가격표가 전혀 모르는 값으로 만들어, 결제수단을 뭘 골라도 항상
         거부되고 있었다(한 번도 성공한 적 없음). enroll.html 에는 같은 요일·시간·강사로
         이어지는 연장 기능이 이미 정상 동작 중이라(서버가 금액을 그때그때 재계산), 그걸 그대로 쓴다.
         ⚠️ 트레이드오프: '자동연장'(매월 자동결제 할인)은 enroll.html에 없는 개념이라, 지금은
            일반 연장과 동일하게 처리된다(부가옵션·자동결제도 마찬가지). 둘 다 "고장난 상태"보다는
            "부가기능 없이 정상 동작"이 우선이라는 판단 — 자동연장을 살리려면 별도 기능 개발 필요. */
      if (mode === 'extend' || mode === 'auto') {
        location.href = '/enroll.html';
        return;
      }

      payMode = mode;
      document.querySelectorAll('.paymode-card.selected').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      setTimeout(() => { payGoStep(1); }, 180);
    });
  });

  // ━━━━━━━━━━ 외부 API: 신규결제 상품선택으로 직행 (ph178용) ━━━━━━━━━━
  // ph178 booking 진입 등에서 사용. payMode local 변수를 직접 세팅 + step1 로 이동
  window.openNewPaymentDirect = function() {
    // 모달이 닫혀있으면 먼저 열기
    if (modal.style.display === 'none' || !modal.style.display) {
      window.openPaymentModal();
    }
    // payMode 직접 세팅 (local 변수)
    payMode = 'new';
    window._isAutoRenew = false;
    // 신규결제 카드에 selected 표시
    document.querySelectorAll('.paymode-card.selected').forEach(c => c.classList.remove('selected'));
    const newCard = document.querySelector('.paymode-card[data-mode="new"]');
    if (newCard) newCard.classList.add('selected');
    // 짧은 딜레이 후 step1 진입 (modal render 시간 확보)
    setTimeout(function(){ payGoStep(1); }, 80);
    console.log('[openNewPaymentDirect] 신규결제 상품선택 진입 완료');
  };

  /* 1:1 수강권 — 강사·요일·시간이 반드시 필요한 상품군. enroll.html 이 담당한다.
     그룹(group-12)·비즈니스·키즈·시험은 enroll.html 에 대응 상품이 없어 제외. */
  const ONE_ON_ONE_PROGRAMS = new Set(['1on1-4', '1on1-8', '1on1-12', '1on1-24']);
  function payIsLoggedIn() {
    try {
      const u = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
      return !!(u && u.uid);
    } catch (e) { return false; }
  }

  // 상품 카드 클릭 → 선택 + step 2 자동 전환
  document.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', () => {
      // 규정 안내 카드는 상품 선택이 아니므로 제외
      if (card.classList.contains('rules-card')) return;
      document.querySelectorAll('.product-card.selected').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedProgram = card.dataset.program;
      selectedPrice = Number(card.dataset.price) || 0;

      /* 🔒 (2026-07-30) 비로그인 결제 차단 — 제보 #1.
         결제 어느 단계에도 로그인 검사가 없어서, 회원가입 없이도 카드/가상계좌 결제가
         끝까지 완료되고 있었다(결제기록이 학생 계정에 안 묶여 이후 수강배정·환불 처리 불가).
         유료 상품(무료체험·상담 제외)을 비로그인 상태로 고르면 여기서 막고 로그인창을 띄운다.
         서버(api-pay.ts create-order/manual-request)도 uid 없으면 거부하도록 이중으로 막아뒀다 —
         여기 클라이언트 가드는 UX 용이고, 실제 방어선은 서버 쪽이다. */
      if (selectedPrice > 0 && !payIsLoggedIn()) {
        document.querySelectorAll('.product-card.selected').forEach(c => c.classList.remove('selected'));
        card.classList.remove('selected');
        if (typeof window.openLoginModal === 'function') window.openLoginModal();
        else alert('로그인 후 이용해 주세요.');
        return;
      }

      /* 📝 (2026-07-29) 1:1 수강권은 '수강신청 페이지'로 보낸다 — 제보 #2 대응.
         이 결제창은 횟수(상품)만 받고 강사·요일·시간·개월·시작일을 아예 묻지 않는다.
         그래서 아무 것도 안 고르고 결제까지 가고, 결제해도 수업이 잡히지 않았다.
         enroll.html 은 6개 항목을 다 받고 강사 시간표 충돌까지 확인한 뒤에야 결제 버튼이 열린다.

         ⚠️ 1:1 계열만 보낸다. enroll.html 은 '주N회 × N개월' 1:1 모델만 지원하고
            그룹·비즈니스·키즈·시험 코스에 대응 상품이 없다. 그 4개는 기존 흐름 유지.
         ⚠️ enroll.html 은 로그인이 필수다. 비로그인 방문자는 여기서 보내면 막다른 길이므로
            기존 결제창을 그대로 쓰게 둔다(신규 고객 이탈 방지). */
      if (ONE_ON_ONE_PROGRAMS.has(selectedProgram) && payIsLoggedIn()) {
        location.href = '/enroll.html?program=' + encodeURIComponent(selectedProgram);
        return;
      }

      /* 🆕 로그인 + 유료 상품이면 정보 입력 단계(step2)를 건너뛰고 바로 결제수단(step3)으로.
         무료체험(trial)·상담형(other/b2b)은 연락 정보가 필요하므로 기존대로 step2 유지.
         🔴 (2026-08-07) 「건너뛰기」 조건을 '로그인했는가' 에서 '정보가 실제로 다 채워졌는가' 로
            바꿨다. 예전엔 연락처 칸을 아이디로 때워 놓고 건너뛰었기 때문에, 학부모가 화면을
            한 번도 못 보고 아이디가 연락처로 접수됐다(#5 의 진짜 피해). 등록 연락처가 없는
            회원은 이제 정보 입력 화면을 그대로 보게 된다. */
      var _logged   = payIsLoggedIn();
      var _eligible = _logged && selectedPrice > 0
                      && selectedProgram !== 'other' && selectedProgram !== 'b2b' && selectedProgram !== 'trial';
      /* 무료체험·상담형(trial/other/b2b)은 결제 API 를 안 타므로 토큰이 없어도 진행한다.
         돈이 오가는 상품만 «지금» 토큰을 확인하고, 만료됐으면 여기서 재로그인을 안내한다. */
      if (!_eligible) {
        if (_logged) payPrefill().then(function(d){ if (!(d && d.auth_expired)) payApplyPrefill(d); }).catch(function(){});
        setTimeout(() => payGoStep(2), 300);
        return;
      }
      payPrefill().then(function(d){
        if (d && d.auth_expired) { payHandleAuthExpired(); return; }   // 마지막이 아니라 지금 알린다
        var complete = payApplyPrefill(d);
        setTimeout(() => payGoStep(complete ? 3 : 2), 300);
      }).catch(function(){ setTimeout(() => payGoStep(2), 300); });
    });
  });

  // ━━━━━━━━━━ 결제 회사 정보 (실제 운영 시 변경) ━━━━━━━━━━
  const PAY_INFO = {
    // 🔴 (2026-07-30) bank_name/bank_code/account_no/account_holder — 장지웅 부장님 Q2:
    //   "실제 입금 계좌는 넣지 않고, 각 고객 앞으로 발행되는 가상계좌만 표기해야 합니다."
    //   → 이 4개 값을 채워서 되살릴 화면(계좌이체·네이버페이·토스 딥링크) 자체를 코드에서 지웠다.
    //   실제 계좌가 필요해질 일이 생겨도 여기 값만 바꿔서는 아무 화면도 안 바뀐다 — 값을 안 채우는 게 맞다.
    bank_name: '신한은행',
    bank_code: 'SHINHAN',
    account_no: '110-555-123456',
    account_holder: '망고아이(주)',
    biz_name: '망고아이',
    kakaopay_url: 'https://qr.kakaopay.com/Ej86dkamx',  // 카카오페이 송금 코드 (실제 코드로 교체 — Q3: 연동 예정)
    toss_id: 'mangoi',                                    // toss.me/<id> (실제 ID로 교체 — Q3: 연동 예정)
    /* 💳 (2026-08-07, QA 2차 #1) 여기 박아 두던 클라이언트키를 «서버에서 받아오는» 방식으로 바꿨다.
       이 값은 서버 시크릿(TOSS_SECRET_KEY)과 «반드시 같은 환경»이어야 한다. 테스트 클라이언트키로
       결제창을 띄우고 라이브 시크릿으로 confirm 하면 승인이 통째로 실패한다(=돈은 안 빠지지만
       학부모는 «결제가 안 된다»만 겪는다). 두 값을 사람이 각각 바꾸는 한 언젠가 반드시 어긋난다.
       → 이제 아래 payLoadConfig() 가 GET /api/pay/config 에서 키와 모드를 함께 받아온다.
         실결제 전환은 «wrangler secret 두 개 교체» 로 끝나고, 코드 수정이 필요 없다.
       아래 값은 서버 응답을 못 받았을 때만 쓰는 최후 폴백(공식 테스트키 = 실제 청구 없음). */
    tosspayments_client_key: 'test_ck_D5GePWvyJnrK0W0k6q8gLzN97Eoq',
  };

  /* ── 결제 환경 설정 (서버가 정본) ─────────────────────────────────────────
     { mode: 'live' | 'test' | 'disabled', clientKey, key_mismatch }
       live      : 실제 청구됨
       test      : 토스 샌드박스. 결제창에 토스가 직접 「실제 결제가 이루어지지 않는 테스트입니다」
                   배지를 그린다 — 그 배지는 우리 코드가 아니라 «테스트 키를 쓰고 있다는 사실»이다.
                   지우려면 키를 라이브로 바꾸는 수밖에 없다.
       disabled  : 시크릿 미설정 → 카드 승인(confirm) 자체가 불가
       key_mismatch : 클라이언트키와 시크릿키의 환경이 서로 다름(가장 위험한 상태) */
  var PAY_CONFIG = null, _payConfigP = null;
  function payLoadConfig(){
    if (PAY_CONFIG) return Promise.resolve(PAY_CONFIG);
    if (_payConfigP) return _payConfigP;
    _payConfigP = fetch('/api/pay/config', { headers: { 'Accept': 'application/json' } })
      .then(function(r){ return r.json(); })
      .then(function(d){
        if (d && d.ok && d.clientKey) {
          PAY_CONFIG = d;
          PAY_INFO.tosspayments_client_key = d.clientKey;
        } else {
          PAY_CONFIG = { ok: false, mode: 'unknown', clientKey: PAY_INFO.tosspayments_client_key };
        }
        return PAY_CONFIG;
      })
      .catch(function(){
        PAY_CONFIG = { ok: false, mode: 'unknown', clientKey: PAY_INFO.tosspayments_client_key };
        return PAY_CONFIG;
      });
    return _payConfigP;
  }

  /* 결제창을 열기 직전에 부른다 — 항상 서버가 준 키를 쓰게 하는 단일 통로. */
  async function payClientKey(){
    var c = await payLoadConfig();
    return (c && c.clientKey) || PAY_INFO.tosspayments_client_key;
  }

  /* 🧪 테스트/미설정 상태를 «우리 화면에서도» 정직하게 알린다.
     라이브 키로 바꾸면 이 배너는 자동으로 사라진다 — 즉 이 배너의 부재가 실결제 전환의 증거다. */
  function payRenderModeBanner(){
    var host = document.getElementById('pay-login-pill');
    if (!host || !host.parentNode) return;
    var el = document.getElementById('pay-mode-banner');
    var c = PAY_CONFIG;
    var mode = c && c.mode;
    var keyBroken = c && (c.key_mismatch || c.client_key_invalid || c.secret_key_invalid);
    var bad = (mode === 'test' || mode === 'disabled' || keyBroken);
    if (!bad) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement('div');
      el.id = 'pay-mode-banner';
      el.style.cssText = 'margin-top:10px;display:flex;align-items:center;gap:8px;background:rgba(168,85,247,0.12);'
        + 'border:1px solid rgba(216,180,254,0.45);border-radius:12px;padding:8px 14px;width:fit-content;max-width:100%';
      host.parentNode.insertBefore(el, host.nextSibling);
    }
    var ko = true; try { ko = (window.getLang ? window.getLang() : 'ko') !== 'en'; } catch(_){}
    var msg;
    if (c && (c.client_key_invalid || c.secret_key_invalid)) {
      /* 🛡️ (2026-08-07) 시크릿에 «키가 아닌 값»이 올라간 상태. 서버가 테스트키로 폴백해 두었으니
         결제창이 깨지진 않지만, 실결제로 착각하면 안 되므로 화면에서 분명히 말한다. */
      msg = ko ? '결제 설정 점검 필요 — 등록된 결제 키가 올바르지 않아 테스트 모드로 동작 중입니다.'
               : 'Payment setup needs attention — the registered key is invalid, running in test mode.';
    } else if (c && c.key_mismatch) {
      msg = ko ? '결제 설정 점검 필요 — 담당자에게 알려 주세요. (키 환경 불일치)'
               : 'Payment setup needs attention — please contact staff. (key environment mismatch)';
    } else if (mode === 'disabled') {
      msg = ko ? '카드 결제 준비 중이에요. 카카오 상담으로 도와드릴게요.'
               : 'Card payment is being set up. Please contact us via KakaoTalk.';
    } else {
      msg = ko ? '테스트 결제 모드 — 실제로 청구되지 않습니다.'
               : 'Test payment mode — you will not be charged.';
    }
    el.innerHTML = '<span style="font-size:14px">🧪</span>'
      + '<span style="color:#e9d5ff;font-size:12px;font-weight:700">' + escapeHtml(msg) + '</span>';
  }

  /* ━━━━━━━━━━ 🔴 (2026-07-29, 갱신 2026-07-30) 송금 목적지 안전장치 ━━━━━━━━━━
     위 PAY_INFO 의 값들은 전부 '개발용 자리표시자'인 채로 실서비스에 노출되고 있었다.
     학부모가 이 값으로 송금하면 반송되거나 엉뚱한 사람에게 간다. 그래서 아래처럼 처리한다.

       · 자리표시자 그대로면  → 링크를 감추고 '카카오 상담'(+가상계좌 추천) 패널을 대신 보여준다.
       · 실제 값으로 바꾸면   → kakaopay_url·toss_id 는 아무 것도 안 해도 원래 화면이 돌아온다.
       · account_no 는 예외다 — 표시할 화면 자체가 삭제됐으니 값을 바꿔도 아무 일도 안 일어난다
         (Q2: 계좌이체는 영구 비노출, 가상계좌로 대체됨). 목록에 남겨둔 건 payDestReady() 가
         계속 false 를 반환하게 하기 위한 안전핀일 뿐, "값이 오길 기다린다"는 뜻이 아니다.

     ▶ 카카오페이/토스 실제 값을 넣는 방법: 위 PAY_INFO 의 해당 값을 바꾸기만 하면 된다. */
  const PAY_PLACEHOLDERS = {
    account_no:   ['110-555-123456'],
    kakaopay_url: ['https://qr.kakaopay.com/Ej86dkamx'],
    toss_id:      ['mangoi'],
  };
  function payDestReady(key) {
    const v = String(PAY_INFO[key] || '').trim();
    if (!v) return false;
    return (PAY_PLACEHOLDERS[key] || []).indexOf(v) === -1;
  }
  /* 이 결제수단으로 실제 송금이 가능한 상태인가?
     false 면 '상담 안내' 패널이 뜨므로, 아래 「결제 완료 확인」 버튼도 눌리지 않게 막는다.
     (보낸 곳이 없는데 "결제 완료"를 접수하면 장부만 더럽혀진다) */
  function payMethodReady(method) {
    if (method === 'card') return true;                       // PG 결제창이 처리
    if (method === 'virtual') return true;                     // 🏦 (2026-07-30) 정식 PG 가상계좌 연동 완료
    if (method === 'kakao')  return payDestReady('kakaopay_url');
    if (method === 'toss')   return payDestReady('toss_id');
    /* 🔴 (2026-07-30) 장지웅 부장님 Q2: "실제 입금 계좌는 넣지 않고, 각 고객 앞으로 발행되는
       가상계좌만 표기해야 합니다." → 계좌이체(bank/cash)·네이버페이는 값이 오길 "기다리는" 게
       아니라 회사가 영구적으로 안 쓰기로 한 방식이다. account_no 는 앞으로도 채워지지 않는다. */
    if (method === 'bank' || method === 'cash' || method === 'naver') return payDestReady('account_no');
    return true;
  }

  /* 목적지가 아직 준비 안 된 결제수단에 띄울 안내 패널.
     "고장났다"가 아니라 "상담으로 도와드린다"로 읽히게 쓴다(학부모가 보는 화면).
     🏦 (2026-07-30) 가상계좌가 실제로 동작하게 된 뒤로는 상담보다 가상계좌가 더 빠른 대안이라
     recommendVirtual=true 인 경우 그 버튼을 우선 보여준다(bank/cash/naver 에서 사용). */
  /* 은/는 자동 선택 — '카카오페이 송금는' 같은 어색한 문장 방지.
     한글 마지막 글자에 받침이 있으면 '은', 없으면 '는'. */
  function josaEunNeun(word) {
    const ch = String(word || '').trim().slice(-1);
    const code = ch.charCodeAt(0);
    if (!(code >= 0xAC00 && code <= 0xD7A3)) return '는';   // 한글이 아니면 기본값
    return ((code - 0xAC00) % 28) > 0 ? '은' : '는';
  }
  function payNotReadyPanel(title, recommendVirtual) {
    const virtualBtn = recommendVirtual ? `
      <button type="button" onclick="paySwitchMethod('virtual')" style="width:100%;padding:13px;margin-bottom:8px;background:linear-gradient(135deg,#3b82f6,#1d4ed8);border:0;border-radius:10px;color:#fff;font-size:14px;font-weight:800;cursor:pointer">
        🏦 가상계좌로 결제하기 (더 빠름)
      </button>` : '';
    return `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <span style="font-size:22px">💬</span>
        <div>
          <div style="color:#fbbf24;font-size:14px;font-weight:800">${title}${josaEunNeun(title)} 상담으로 도와드려요</div>
          <div style="color:#94a3b8;font-size:11px">현재 이 결제수단은 준비 중이에요</div>
        </div>
      </div>
      <p style="margin:0 0 12px;color:#cbd5e1;font-size:12.5px;line-height:1.6">
        ${recommendVirtual ? '<b style="color:#93c5fd">가상계좌</b>는 발급 즉시 입금 확인까지 자동이에요. 또는 ' : ''}아래 <b style="color:#FEE500">카카오 상담</b>을 눌러주시면 담당자가 입금 방법을
        <b>1:1로 정확히 안내</b>해 드려요. 카드 결제는 지금 바로 가능합니다.
      </p>
      ${virtualBtn}
      <button type="button" onclick="window.openKakao&&window.openKakao()" style="width:100%;padding:13px;background:linear-gradient(135deg,#FEE500,#FFCD00);border:0;border-radius:10px;color:#3C1E1E;font-size:14px;font-weight:800;cursor:pointer">
        💬 카카오로 상담받기
      </button>`;
  }
  // 안내 패널의 "가상계좌로 결제하기" 버튼 → 실제 가상계좌 method-card 를 대신 눌러준다.
  window.paySwitchMethod = function(method){
    const card = document.querySelector(`.method-card[data-method="${method}"]`);
    if (card) card.click();
  };

  // 카드 결제 (토스페이먼츠) — 서버 주문 생성 → 결제창 (금액은 서버가 결정 = 위변조 방지)
  async function executeCardPayment(amount, payer, orderId, programLabel) {
    // 1) 서버에 주문 생성 — 서버 가격표로 금액을 확정하고 주문번호를 받는다.
    let order;
    try {
      var _u = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
      var student = (document.getElementById('pay-student') || {}).value || '';
      // 🔒 (2026-07-30) 서버가 uid 를 세션 토큰으로 재검증하므로(제보 #1) token 도 함께 보낸다.
      var _token = (function(){ try { return localStorage.getItem('mango_token') || ''; } catch(e){ return ''; } })();
      const res = await fetch('/api/pay/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          program: selectedProgram,
          payer: payer,
          student: student,
          method: 'card',
          uid: (_u && _u.uid) ? _u.uid : null,
          token: _token
        })
      });
      order = await res.json().catch(function(){ return null; });
      if (!order || !order.ok) {
        if (order && order.error === 'auth_required') {
          alert('로그인이 필요합니다. 다시 로그인 후 진행해 주세요.');
          if (typeof window.openLoginModal === 'function') window.openLoginModal();
          return;
        }
        alert('주문을 만들 수 없습니다: ' + ((order && order.message) || '상품을 다시 선택해 주세요.'));
        return;
      }
    } catch (e) {
      alert('주문 생성 중 오류가 발생했습니다: ' + (e.message || e) + '\n잠시 후 다시 시도해 주세요.');
      return;
    }

    // 2) 토스 SDK 로드
    if (!window.TossPayments) {
      try {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://js.tosspayments.com/v1/payment';
          s.onload = resolve; s.onerror = reject;
          document.head.appendChild(s);
        });
      } catch (e) {
        alert('결제 모듈을 불러오지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.');
        return;
      }
    }

    // 3) 결제창 — 서버가 준 orderId/amount 사용. 성공/실패 시 토스가 파라미터를 붙여 리다이렉트.
    try {
      const tp = window.TossPayments(await payClientKey());
      await tp.requestPayment('카드', {
        amount: order.amount,
        orderId: order.orderId,
        orderName: order.orderName || programLabel || '망고아이 수강료',
        customerName: payer,
        successUrl: location.origin + '/payment-success.html',
        failUrl: location.origin + '/payment-fail.html',
      });
    } catch (e) {
      // 사용자가 결제창을 닫은 경우 등 — 조용히 무시하거나 안내
      if (e && e.code !== 'USER_CANCEL') {
        alert('카드 결제창을 열 수 없습니다: ' + (e.message || 'unknown') + '\n잠시 후 다시 시도해 주세요.');
      }
    }
  }

  /* 🏦 (2026-07-30) 가상계좌 발급 — 장지웅 부장님 Q2 반영.
     "실제 회사 계좌는 노출하지 않고, 고객마다 발급되는 가상계좌만 표기해야 합니다"
     → 직접 계좌를 안내하는 대신, 토스가 주문마다 실제로 발급하는 가상계좌를 쓴다.
     흐름은 카드 결제와 거의 같다(서버 create-order → 토스 SDK → successUrl 콜백).
     차이는 tp.requestPayment 의 결제수단이 '가상계좌' 라는 것과, successUrl 로 돌아왔을 때
     '결제 완료'가 아니라 '입금 대기'로 표시된다는 것(서버 /api/pay/confirm 이 이미 분기 처리함).
     ⚠️ Toss SDK 파라미터 이름(cashReceipt 등)은 문서 기준으로 작성 — 브라우저 팝업으로 직접
        눌러보는 최종 확인은 못 했다(테스트 PG 라 실패해도 실제 청구는 없음). */
  async function executeVirtualAccountPayment(amount, payer, orderId, programLabel) {
    let order;
    try {
      var _u = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
      var student = (document.getElementById('pay-student') || {}).value || '';
      var _token = (function(){ try { return localStorage.getItem('mango_token') || ''; } catch(e){ return ''; } })();
      const res = await fetch('/api/pay/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          program: selectedProgram,
          payer: payer,
          student: student,
          method: 'virtual',
          uid: (_u && _u.uid) ? _u.uid : null,
          token: _token
        })
      });
      order = await res.json().catch(function(){ return null; });
      if (!order || !order.ok) {
        if (order && order.error === 'auth_required') {
          alert('로그인이 필요합니다. 다시 로그인 후 진행해 주세요.');
          if (typeof window.openLoginModal === 'function') window.openLoginModal();
          return;
        }
        alert('주문을 만들 수 없습니다: ' + ((order && order.message) || '상품을 다시 선택해 주세요.'));
        return;
      }
    } catch (e) {
      alert('주문 생성 중 오류가 발생했습니다: ' + (e.message || e) + '\n잠시 후 다시 시도해 주세요.');
      return;
    }

    if (!window.TossPayments) {
      try {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://js.tosspayments.com/v1/payment';
          s.onload = resolve; s.onerror = reject;
          document.head.appendChild(s);
        });
      } catch (e) {
        alert('결제 모듈을 불러오지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.');
        return;
      }
    }

    try {
      const tp = window.TossPayments(await payClientKey());
      await tp.requestPayment('가상계좌', {
        amount: order.amount,
        orderId: order.orderId,
        orderName: order.orderName || programLabel || '망고아이 수강료',
        customerName: payer,
        cashReceipt: { type: '미발행' },
        successUrl: location.origin + '/payment-success.html',
        failUrl: location.origin + '/payment-fail.html',
      });
    } catch (e) {
      if (e && e.code !== 'USER_CANCEL') {
        alert('가상계좌 발급창을 열 수 없습니다: ' + (e.message || 'unknown') + '\n잠시 후 다시 시도해 주세요.');
      }
    }
  }

  // 결제수단 → 즉시 결제 패널 렌더
  function renderInstantPayPanel(method) {
    const amount = selectedPrice || (Number(document.getElementById('pay-amount')?.value) || 0);
    const amountStr = '₩ ' + amount.toLocaleString('ko-KR');
    const payer = (document.getElementById('pay-payer')?.value || '').trim() || '결제자';
    const orderId = 'PAY-' + Date.now().toString(36).toUpperCase() + '-' + Math.floor(Math.random()*999);
    const programLabel = (PROG_INFO[selectedProgram]||{}).name || '수강료';
    // 🔴 (2026-07-30) student·depositName(입금자명 자동매칭용 랜덤 접미사) 삭제 — 이 값을 쓰던
    // 계좌이체 수기입금 화면 자체가 제거됐다(장지웅 부장님 Q2, 위 method==='virtual' 주석 참고).

    const c = document.getElementById('instant-pay-content');
    if (method === 'card') {
      c.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
          <span style="font-size:22px">💳</span>
          <div>
            <div style="color:#86efac;font-size:14px;font-weight:800">신용/체크카드 즉시 결제</div>
            <div style="color:#94a3b8;font-size:11px">토스페이먼츠 안전결제 (모든 카드사)</div>
          </div>
        </div>
        <div style="background:rgba(0,0,0,0.3);padding:12px;border-radius:10px;margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;color:#cbd5e1;font-size:13px">
            <span>결제 금액</span><b style="color:#fbbf24;font-size:16px">${amountStr}</b>
          </div>
        </div>
        <button type="button" id="btn-card-pay" style="width:100%;padding:13px;background:linear-gradient(135deg,#3b82f6,#1d4ed8);border:0;border-radius:10px;color:#fff;font-size:14px;font-weight:800;cursor:pointer">
          💳 카드 결제창 열기 (즉시 결제)
        </button>
        <p style="margin:10px 0 0;color:#64748b;font-size:11px;text-align:center">
          결제 완료 시 자동으로 수강이 활성화됩니다 · 영수증 자동 발급
        </p>
      `;
      setTimeout(() => {
        const btn = document.getElementById('btn-card-pay');
        if (btn) btn.addEventListener('click', () => executeCardPayment(amount, payer, orderId, programLabel));
      }, 0);
    } else if (method === 'kakao' && !payDestReady('kakaopay_url')) {
      c.innerHTML = payNotReadyPanel('카카오페이 송금');
    } else if (method === 'toss' && !payDestReady('toss_id')) {
      c.innerHTML = payNotReadyPanel('토스 송금');
    } else if ((method === 'bank' || method === 'cash' || method === 'naver') && !payDestReady('account_no')) {
      c.innerHTML = payNotReadyPanel(method === 'naver' ? '네이버페이 송금' : '계좌이체', /* recommendVirtual */ true);
    } else if (method === 'kakao') {
      c.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
          <span style="font-size:22px">🟡</span>
          <div>
            <div style="color:#86efac;font-size:14px;font-weight:800">카카오페이 송금</div>
            <div style="color:#94a3b8;font-size:11px">아래 버튼/QR로 카카오페이 앱이 열립니다</div>
          </div>
        </div>
        <div style="background:rgba(0,0,0,0.3);padding:12px;border-radius:10px;margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;color:#cbd5e1;font-size:13px;margin-bottom:6px">
            <span>송금 금액</span><b style="color:#fbbf24;font-size:16px">${amountStr}</b>
          </div>
          <div style="display:flex;justify-content:space-between;color:#cbd5e1;font-size:12px">
            <span>받는이</span><b>${PAY_INFO.biz_name}</b>
          </div>
        </div>
        <a href="${PAY_INFO.kakaopay_url}" target="_blank" rel="noopener" style="display:block;text-align:center;padding:13px;background:linear-gradient(135deg,#FEE500,#FFCD00);border-radius:10px;color:#3C1E1E;font-size:14px;font-weight:800;text-decoration:none">
          🟡 카카오페이로 즉시 송금하기
        </a>
        <div style="margin-top:10px;padding:10px;background:rgba(254,229,0,0.08);border-radius:8px;font-size:11px;color:#fbbf24;text-align:center">
          📱 모바일이면 카카오페이 앱이 자동 실행됩니다
        </div>
      `;
    } else if (method === 'toss') {
      const tossWeb = `https://toss.me/${PAY_INFO.toss_id}/${amount}`;
      /* 🔴 (2026-07-30) "모바일 토스 앱 직접 열기" 딥링크(tossDeep)를 삭제했다.
         이 링크는 PAY_INFO.account_no·bank_code(회사 계좌)로 딥링크를 만드는데,
         계좌이체와 마찬가지로 account_no 는 장지웅 부장님 Q2 에 따라 영구히 채워지지 않는다.
         이 결제수단은 payMethodReady() 가 toss_id 만 검사해서 열리므로, toss_id 만 실제값이
         되면 이 딥링크는 '가짜 회사 계좌로 딥링크가 뜨는' 상태로 조용히 살아있었을 것 —
         toss.me 링크(toss_id 기반) 하나만 남긴다. */
      c.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
          <span style="font-size:22px">🔵</span>
          <div>
            <div style="color:#86efac;font-size:14px;font-weight:800">토스 즉시 송금</div>
            <div style="color:#94a3b8;font-size:11px">토스 앱이 열려 자동으로 금액이 입력됩니다</div>
          </div>
        </div>
        <div style="background:rgba(0,0,0,0.3);padding:12px;border-radius:10px;margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;color:#cbd5e1;font-size:13px">
            <span>송금 금액</span><b style="color:#fbbf24;font-size:16px">${amountStr}</b>
          </div>
        </div>
        <a href="${tossWeb}" target="_blank" rel="noopener" style="display:block;text-align:center;padding:13px;background:linear-gradient(135deg,#0064FF,#0050cc);border-radius:10px;color:#fff;font-size:14px;font-weight:800;text-decoration:none">
          🔵 toss.me로 송금 (PC·모바일)
        </a>
      `;
    }
    /* 🔴 (2026-07-30) 계좌이체(bank/cash)·네이버페이의 "실제 계좌 표시" 렌더 코드는
       삭제했다. 위 payNotReadyPanel 분기가 payDestReady('account_no') 를 항상 false 로
       판정해 이 아래 코드는 도달하지 않는 죽은 코드였고, 장지웅 부장님 Q2 답변(실제 계좌는
       영구적으로 노출하지 않음)에 따라 앞으로도 도달할 일이 없다. 되살리지 말 것 —
       계좌 노출이 필요해지면 가상계좌(PG 정식 발급)를 쓴다. */
    else if (method === 'virtual') {
      /* 🏦 (2026-07-30) 정식 PG 가상계좌 — 브라우저가 지어내던 가짜 번호(2026-07-29 삭제)를
         토스가 실제로 발급하는 계좌로 교체. 흐름은 카드 결제와 동일(주문 생성 → SDK → 콜백). */
      c.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
          <span style="font-size:22px">🏦</span>
          <div>
            <div style="color:#86efac;font-size:14px;font-weight:800">가상계좌 발급</div>
            <div style="color:#94a3b8;font-size:11px">고객님 전용 계좌가 발급돼요 · 입금하면 자동 확인</div>
          </div>
        </div>
        <div style="background:rgba(0,0,0,0.3);padding:12px;border-radius:10px;margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;color:#cbd5e1;font-size:13px">
            <span>결제 금액</span><b style="color:#fbbf24;font-size:16px">${amountStr}</b>
          </div>
        </div>
        <button type="button" id="btn-virtual-pay" style="width:100%;padding:13px;background:linear-gradient(135deg,#3b82f6,#1d4ed8);border:0;border-radius:10px;color:#fff;font-size:14px;font-weight:800;cursor:pointer">
          🏦 가상계좌 발급받기
        </button>
        <p style="margin:10px 0 0;color:#64748b;font-size:11px;text-align:center">
          발급 후 24시간 내 입금하시면 자동으로 수강이 활성화됩니다
        </p>
      `;
      setTimeout(() => {
        const btn = document.getElementById('btn-virtual-pay');
        if (btn) btn.addEventListener('click', () => executeVirtualAccountPayment(amount, payer, orderId, programLabel));
      }, 0);
    }

    document.getElementById('instant-pay-panel').style.display = 'block';
  }

  // 텍스트 복사 헬퍼 (전역)
  window.copyText = function(text, btn) {
    navigator.clipboard.writeText(String(text)).then(() => {
      if (btn) {
        const old = btn.textContent;
        btn.textContent = '✓ 복사됨';
        setTimeout(() => { btn.textContent = old; }, 1500);
      }
    }).catch(() => alert('복사 실패: ' + text));
  };

  // ━━━━━━━━━━ 연장: 학생 조회 (인증) ━━━━━━━━━━
  window.lookupExtStudent = async function() {
    const uid = (document.getElementById('ext-uid')?.value || '').trim();
    const auth = (document.getElementById('ext-auth')?.value || '').trim();
    const err = document.getElementById('ext-auth-err');
    const studCard = document.getElementById('ext-student-card');
    const lookupBtn = document.getElementById('ext-lookup-btn');
    if (err) err.style.display = 'none';
    if (!uid || !auth) {
      if (err) { err.textContent = '학생 ID와 전화번호(또는 비밀번호)를 모두 입력해 주세요.'; err.style.display = 'block'; }
      return;
    }
    if (lookupBtn) { lookupBtn.disabled = true; lookupBtn.textContent = '⏳ 확인 중…'; }
    try {
      const r = await fetch('/api/student/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ user_id: uid, auth: auth })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error || ('조회 실패: ' + r.status));
      extStudent = d.student;
      renderExtStudentCard(extStudent);
    } catch (e) {
      // (fix 2026-06-10) 가짜 데모(홍길동) 폴백 제거 — 실패 시 정직하게 에러 표시
      if (err) { err.textContent = '학생 정보를 확인할 수 없습니다. 학생 ID와 비밀번호(또는 등록 전화번호)를 확인해 주세요.'; err.style.display = 'block'; }
    } finally {
      if (lookupBtn) { lookupBtn.disabled = false; lookupBtn.textContent = '🔍 학생 정보 확인'; }
    }
  };

  // 🆕 (fix 2026-06-10) 로그인 학생이면 '학생 확인' 단계 자동 통과 → 바로 연장옵션.
  //   · 가짜 전화번호 주입 / 가짜 데모(홍길동) 폴백 제거. 로그인 세션을 본인인증으로 사용.
  //   · 실데이터는 /api/student/lookup 으로 조회(비번 미설정 계정=로그인과 동일 보안수준). 없으면 정직하게 기본값.
  async function payAutoVerifyIfLoggedIn(){
    try {
      var u = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
      if (!u) { try { u = JSON.parse(localStorage.getItem('mangoi_logged_user') || localStorage.getItem('mango_user') || 'null'); } catch(_){} }
      var realUid = u && (u.uid || u.id || u.user_id);
      // 👪 학부모 편의(2026-07-10): 로그인 세션이 없으면 결제 딥링크의 uid(=자녀 ID)로 자동채움.
      //   parent.html 의 '결제하기'가 /?pay=1&uid=<자녀ID> 로 넘겨줌 → 학부모가 ID 재입력 불필요.
      //   (로그인 학생은 위 세션 uid 를 그대로 쓰므로 영향 없음)
      if (!realUid) {
        try { realUid = new URLSearchParams(location.search).get('uid') || window._payPrefillUid || ''; } catch(_){}
      }
      if (!realUid) return;                               // 비로그인·uid없음 → 기존 수동 입력 경로 유지
      var uidEl = document.getElementById('ext-uid');
      var authEl = document.getElementById('ext-auth');
      if (uidEl) uidEl.value = realUid;                   // 학생 ID 자동채움
      if (authEl) authEl.value = '';                      // 🔒 민감정보(전화/비번) 미주입
      var student = null;
      try {
        var r = await fetch('/api/student/lookup', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ user_id: realUid, from_session: true })
        });
        var d = await r.json().catch(function(){ return {}; });
        if (r.ok && d && d.ok && d.student) student = d.student;
      } catch(_){}
      extStudent = student || { uid: realUid, name: (u && (u.name || u.user_name)) || realUid, session_only: true };
      if (u && (u.name || u.user_name) && !extStudent.name) extStudent.name = u.name || u.user_name;
      try { renderExtStudentCard(extStudent); } catch(_){}
      setTimeout(function(){ try { payGoStep(2); } catch(_){} }, 150);   // 바로 연장옵션으로
    } catch(e){ console.warn('[pay-auto-verify]', e); }
  }

  /* ━━━━━━━━━━ 🆕 결제 정보 자동채움 (2026-08-07, QA 2차 #5) ━━━━━━━━━━
     지적: "결제자 이름·학생 이름·연락처 3칸에 전부 로그인 아이디(lemuel)가 들어가 있다."

     원인: 아래 옛 코드가 세션 객체에 이름이 없으면 uid 로 대체(`name = u.name || uid`)하고,
           연락처 칸에는 **아예 처음부터 uid 를 넣고 있었다**(`setV('pay-contact', uid || name)`).
           세션에는 학부모 이름도 전화번호도 없다 — 있을 리가 없는 값을 아이디로 때운 것이다.

     고침: 실제 회원 정보는 **서버만 안다**. POST /api/pay/prefill 로 받아온다.
           · 결제자 이름 = 등록된 학부모 이름, 없으면 학생 이름
           · 학생 이름   = 실제 등록된 학생 이름
           · 연락처      = 등록된 학부모 전화, 없으면 학생 전화
           · 셋 중 없는 값은 **비워 둔다**(아이디로 때우지 않는다 — 그게 이 지적의 본질).
     ⚠️ 자동으로 채운 값도 사용자가 고칠 수 있어야 한다 → readonly 로 잠그지 않는다.
        이미 사용자가 타이핑한 칸은 덮어쓰지 않는다(빈 칸만 채운다). */
  var _payPrefillP = null;
  function payPrefill(){
    if (_payPrefillP) return _payPrefillP;
    _payPrefillP = (async function(){
      var u = null;
      try { u = (typeof getCurrentUser === 'function') ? getCurrentUser() : null; } catch(_){}
      if (!u) { try { u = JSON.parse(localStorage.getItem('mangoi_logged_user') || localStorage.getItem('mango_user') || 'null'); } catch(_){} }
      var uid = u && (u.uid || u.id || u.user_id) || '';
      if (!uid) return null;
      var token = ''; try { token = localStorage.getItem('mango_token') || ''; } catch(_){}
      try {
        var r = await fetch('/api/pay/prefill', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ uid: uid, token: token })
        });
        var d = await r.json().catch(function(){ return null; });
        if (d && d.ok) return d;
        /* 🔴 (2026-08-07) 서버가 «토큰이 없다/만료됐다» 고 하면 그 사실을 숨기지 않는다.
           화면의 «로그인됨» 은 브라우저에 저장된 사용자 정보만 보고 판단하는데,
           서버 결제 API 는 서명 토큰(mango_token, 30일)을 따로 요구한다.
           토큰이 만료·무효가 되면 화면은 계속 «로그인됨» 이고 서버만 거부해서,
           **상품 고르고 정보 다 채운 뒤 마지막 「카드 결제창 열기」에서야** 막혔다.
           이 값을 위로 올려 «상품 고르는 순간» 재로그인을 안내한다. */
        if (d && d.error === 'auth_required') return { ok: false, auth_expired: true };
      } catch(_){}
      /* 서버에 물어보지 못했다 — 세션에 «진짜 이름»이 있으면 그것만 쓴다.
         이름이 없다고 아이디를 이름 칸에 넣지는 않는다(그게 이 지적 그대로다). */
      var nm = (u && (u.name || u.user_name) || '').trim();
      return { ok: true, payer_name: nm, student_name: nm, contact: '', source: 'session' };
    })();
    return _payPrefillP;
  }

  /** 로그인이 만료된 상태 — 고른 상품을 되돌리고 재로그인을 안내한다(빈손으로 되돌리지 않기 위해). */
  function payHandleAuthExpired(){
    try {
      document.querySelectorAll('.product-card.selected').forEach(function(c){ c.classList.remove('selected'); });
      selectedProgram = null; selectedPrice = 0;
      var ko = true; try { ko = (window.getLang ? window.getLang() : 'ko') !== 'en'; } catch(_){}
      alert(ko ? '로그인이 만료되었어요. 다시 로그인하시면 이어서 결제하실 수 있어요.'
               : 'Your login session has expired. Please sign in again to continue.');
      if (typeof window.openLoginModal === 'function') window.openLoginModal();
    } catch(_){}
  }

  /** 받아온 값을 빈 칸에만 채운다. 반환값 = 연락처까지 다 채워졌는가(정보입력 단계 생략 가능한가) */
  function payApplyPrefill(d){
    var setV = function(id, v){
      var el = document.getElementById(id);
      if (el && !String(el.value || '').trim() && String(v || '').trim()) el.value = String(v).trim();
    };
    if (d) {
      setV('pay-payer',   d.payer_name);
      setV('pay-student', d.student_name);
      setV('pay-contact', d.contact);
    }
    var got = function(id){ var el = document.getElementById(id); return !!(el && String(el.value||'').trim()); };
    return got('pay-payer') && got('pay-student') && got('pay-contact');
  }

  // 로그인 여부만 즉시 알려주는 동기 헬퍼 (기존 호출부 호환 유지)
  window.payAutofillNewIfLoggedIn = function(){
    try {
      var u = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
      if (!u) { try { u = JSON.parse(localStorage.getItem('mangoi_logged_user') || localStorage.getItem('mango_user') || 'null'); } catch(_){} }
      if (!u || !(u.uid || u.id || u.user_id)) return false;
      payPrefill().then(payApplyPrefill).catch(function(){});   // 값 채우기는 비동기로
      return true;
    } catch(e){ return false; }
  };

  function renderExtStudentCard(s) {
    const studCard = document.getElementById('ext-student-card');
    if (!studCard) return;
    const tierColor = { Bronze:'#cd7f32', Silver:'#a8a29e', Gold:'#fbbf24', Platinum:'#22d3ee' }[s.loyalty_tier] || '#86efac';
    const dDayClass = (s.d_day != null && s.d_day <= 7) ? 'warn' : 'good';
    const remainClass = (s.remaining != null && s.remaining <= 2) ? 'warn' : 'good';
    studCard.style.display = 'block';
    studCard.innerHTML = `
      <div class="ext-stud-card">
        <div class="ext-stud-head">
          <div class="ext-stud-avatar">${escapeHtml((s.name||'?').slice(0,1))}</div>
          <div class="ext-stud-info">
            <div class="ext-stud-name">🎓 ${escapeHtml(s.name||'-')}</div>
            <div class="ext-stud-sub">${escapeHtml(s.level||'-')} 레벨 · ${escapeHtml(s.current_program_label||'-')}</div>
          </div>
          <div class="ext-stud-badge" style="color:${tierColor};border-color:${tierColor}">${s.loyalty_tier?(escapeHtml(s.loyalty_tier)+' 등급'):'미등록'}</div>
        </div>
        <div class="ext-stud-grid">
          <div>
            <div class="ev-lab">잔여 수업</div>
            <div class="ev-val ${remainClass}">${s.remaining!=null?(s.remaining+'<span style="font-size:11px;color:#94a3b8">회</span>'):'<span style="font-size:13px;color:#94a3b8">—</span>'}</div>
          </div>
          <div>
            <div class="ev-lab">만료까지</div>
            <div class="ev-val ${dDayClass}">${s.d_day==null?'<span style="font-size:13px;color:#94a3b8">—</span>':(s.d_day<0?'만료됨':'D-'+s.d_day)}</div>
          </div>
          <div>
            <div class="ev-lab">누적 수강</div>
            <div class="ev-val">${(s.total_classes!=null||s.months!=null)?((s.total_classes||0)+'<span style="font-size:11px;color:#94a3b8">회 · '+(s.months||0)+'개월</span>'):'<span style="font-size:13px;color:#94a3b8">—</span>'}</div>
          </div>
        </div>
        ${s.favorite_teacher ? `<div style="margin-top:10px;padding:8px 12px;background:rgba(251,191,36,0.06);border-radius:8px;font-size:11px;color:#fde68a">💛 자주 듣는 강사: <b>${escapeHtml(s.favorite_teacher)}</b></div>` : ''}
        <button type="button" onclick="payGoStep(2)" style="width:100%;margin-top:12px;padding:11px;background:linear-gradient(135deg,#22c55e,#16a34a);border:0;border-radius:10px;color:#fff;font-size:13px;font-weight:800;cursor:pointer">✓ 본인 확인 — 연장 옵션 선택 →</button>
      </div>
    `;
  }

  function escapeHtml(s) { return String(s||'').replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c])); }

  // ━━━━━━━━━━ 연장: 모드 탭 + 패키지/추가옵션 렌더 ━━━━━━━━━━
  document.querySelectorAll('.ext-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.ext-tab.ext-tab-active').forEach(t => t.classList.remove('ext-tab-active'));
      tab.classList.add('ext-tab-active');
      extMode = tab.dataset.extmode;
      extPackage = null; // 모드 변경 시 선택 초기화
      renderExtPackages();
      renderExtSummary();
    });
  });

  function renderExtBanner() {
    const banner = document.getElementById('ext-student-banner');
    if (!banner || !extStudent) return;
    const s = extStudent;
    banner.innerHTML = `
      <span class="sb-icon">${escapeHtml((s.name||'?').slice(0,1))}</span>
      <div class="sb-text">
        <div class="sb-name">${escapeHtml(s.name||'-')} · ${escapeHtml(s.level||'-')}</div>
        <div class="sb-detail">현재: ${escapeHtml(s.current_program_label||'-')}${s.remaining!=null?(' · 잔여 '+s.remaining+'회'):''}${s.d_day!=null?(' · '+(s.d_day<0?'만료됨':'D-'+s.d_day)):''}</div>
      </div>
      <button type="button" onclick="payGoStep(1)" class="sb-change">변경</button>
    `;
  }

  function renderExtPackages() {
    const grid = document.getElementById('ext-packages');
    if (!grid || !extStudent) return;
    const s = extStudent;
    const cur = COURSE_CATALOG[s.current_program] || COURSE_CATALOG['1on1-8'];
    let pkgs = [];

    // 자동연장 모드일 때 모든 할인율에 +5% 추가 보너스 (= 같은 10%→15%, 업그레이드 20%→25%)
    const autoBonus = window._isAutoRenew ? 0.05 : 0;
    const autoLabel = window._isAutoRenew ? ' (자동연장 +5%)' : '';

    if (extMode === 'same') {
      // 같은 코스 — 10%(+자동5%) 연장 할인 + 잔여 이월
      const disc = 0.10 + autoBonus;
      const final = Math.round(cur.base * (1-disc));
      pkgs.push({
        id: s.current_program + '-extend',
        baseCourseId: s.current_program,
        name: cur.name + ' 연장' + (window._isAutoRenew ? ' ♾️ 자동' : ''),
        detail: `같은 코스 · ${cur.classes}회 + 잔여 ${s.remaining||0}회 자동 이월`,
        bonus: `+ 잔여 ${s.remaining||0}회 자동 이월 (실제 수강 ${cur.classes + (s.remaining||0)}회)${autoLabel}`,
        base: cur.base,
        final: final,
        discount_pct: disc * 100,
        save: cur.base - final,
        classes: cur.classes,
        recommend: true,
      });
      // 같은 카테고리 더 큰 패키지 (e.g. 8회 → 12회)
      const series = ['1on1-4','1on1-8','1on1-12','1on1-24'];
      const idx = series.indexOf(s.current_program);
      if (idx >= 0 && idx < series.length-1) {
        const big = COURSE_CATALOG[series[idx+1]];
        const bigDisc = 0.12 + autoBonus;
        const bigFinal = Math.round(big.base * (1-bigDisc));
        pkgs.push({
          id: series[idx+1] + '-extend',
          baseCourseId: series[idx+1],
          name: big.name + ' 연장 (한 단계 위)' + (window._isAutoRenew ? ' ♾️' : ''),
          detail: `${big.classes}회 + 잔여 자동 이월`,
          bonus: `+ 잔여 ${s.remaining||0}회 자동 이월 (실제 수강 ${big.classes + (s.remaining||0)}회)${autoLabel}`,
          base: big.base, final: bigFinal,
          discount_pct: bigDisc * 100, save: big.base - bigFinal,
          classes: big.classes,
        });
      }
    } else if (extMode === 'upgrade') {
      // 업그레이드 — 24회권/비즈니스/시험영어 (15~20% + 자동5%)
      ['1on1-24','business','exam'].forEach(id => {
        const c = COURSE_CATALOG[id]; if (!c) return;
        const disc = (id === '1on1-24' ? 0.20 : 0.15) + autoBonus;
        const final = Math.round(c.base * (1-disc));
        pkgs.push({
          id: id + '-upgrade',
          baseCourseId: id,
          name: c.name + ' 업그레이드' + (window._isAutoRenew ? ' ♾️' : ''),
          detail: `${c.classes}회 + 잔여 ${s.remaining||0}회 이월 + Gold 등급 승급`,
          bonus: `Gold 등급 승급 시 강사 우선권 + 그룹 클래스 무료 1개월${autoLabel}`,
          base: c.base, final: final,
          discount_pct: disc * 100, save: c.base - final,
          classes: c.classes,
          recommend: id === '1on1-24',
        });
      });
    } else if (extMode === 'addon') {
      // 추가 회차 — 단품 4/8/12회 (5~10% + 자동5%)
      [4, 8, 12].forEach(n => {
        const per = cur.per || 50000;
        const base = per * n;
        const disc = (n >= 12 ? 0.10 : (n >= 8 ? 0.07 : 0.05)) + autoBonus;
        const final = Math.round(base * (1-disc));
        pkgs.push({
          id: 'addon-' + n,
          baseCourseId: s.current_program,
          name: '추가 ' + n + '회권' + (window._isAutoRenew ? ' ♾️' : ''),
          detail: `현재 코스에 ${n}회 추가 (만료일 자동 연장)`,
          bonus: `만료일 ${Math.ceil(n/2)}주 자동 연장${autoLabel}`,
          base: base, final: final,
          discount_pct: disc*100, save: base-final,
          classes: n,
          recommend: n === 8,
        });
      });
    }

    grid.innerHTML = pkgs.map(p => `
      <div class="ext-pkg ${extPackage && extPackage.id === p.id ? 'selected' : ''}" data-pkgid="${p.id}">
        ${p.recommend ? '<span class="ext-pkg-badge recommend">⭐ 추천</span>' : (p.discount_pct >= 15 ? '<span class="ext-pkg-badge">'+p.discount_pct+'% 할인</span>' : '')}
        <div>
          <div class="ext-pkg-name">${escapeHtml(p.name)}</div>
          <div class="ext-pkg-detail">${escapeHtml(p.detail)}</div>
          <div class="ext-pkg-bonus">${escapeHtml(p.bonus)}</div>
        </div>
        <div class="ext-pkg-price">
          <div class="ext-pkg-orig">₩${p.base.toLocaleString('ko-KR')}</div>
          <div class="ext-pkg-final">₩${p.final.toLocaleString('ko-KR')}</div>
          <div class="ext-pkg-save">−₩${p.save.toLocaleString('ko-KR')} 절약</div>
        </div>
      </div>
    `).join('');

    // 클릭 핸들러
    grid.querySelectorAll('.ext-pkg').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.pkgid;
        extPackage = pkgs.find(p => p.id === id);
        grid.querySelectorAll('.ext-pkg.selected').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        renderExtSummary();
      });
    });
  }

  function renderExtAddons() {
    const grid = document.getElementById('ext-addons');
    if (!grid) return;
    grid.innerHTML = ADDON_CATALOG.map(a => `
      <div class="ext-addon ${extAddons.has(a.id) ? 'checked' : ''}" data-addonid="${a.id}">
        <div class="ad-check">${extAddons.has(a.id) ? '✓' : ''}</div>
        <div class="ad-info">
          <div class="ad-name">${a.icon} ${escapeHtml(a.name)}</div>
          <div class="ad-desc">${escapeHtml(a.desc)}</div>
        </div>
        <div></div>
        <div class="ad-price">+₩${a.price.toLocaleString('ko-KR')}</div>
      </div>
    `).join('');
    grid.querySelectorAll('.ext-addon').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.addonid;
        if (extAddons.has(id)) extAddons.delete(id);
        else extAddons.add(id);
        renderExtAddons();
        renderExtSummary();
      });
    });
  }

  function computeExtTotal() {
    if (!extPackage) return 0;
    let total = extPackage.final;
    extAddons.forEach(id => {
      const a = ADDON_CATALOG.find(x => x.id === id);
      if (!a) return;
      // 자동연장 시 강사고정·학습매니저 무료
      if (window._isAutoRenew && (a.id === 'fixed_teacher' || a.id === 'manager')) return;
      total += a.price;
    });
    return total;
  }

  function renderExtSummary() {
    const sum = document.getElementById('ext-summary');
    const nextBtn = document.getElementById('ext-next-btn');
    if (!sum) return;
    if (!extPackage) {
      sum.innerHTML = `<div style="text-align:center;color:#94a3b8;font-size:13px;padding:20px">↑ 연장 패키지를 먼저 선택해 주세요</div>`;
      if (nextBtn) nextBtn.disabled = true;
      return;
    }
    const rows = [];
    rows.push(`<div class="ext-sum-row"><span class="sl">${escapeHtml(extPackage.name)}</span><span class="sv">₩${extPackage.base.toLocaleString('ko-KR')}</span></div>`);
    if (extPackage.save > 0) {
      const discLabel = window._isAutoRenew ? '연장+자동결제 할인' : '연장 할인';
      rows.push(`<div class="ext-sum-row discount"><span class="sl">  └ ${discLabel} (-${extPackage.discount_pct.toFixed(0)}%)</span><span class="sv">−₩${extPackage.save.toLocaleString('ko-KR')}</span></div>`);
    }
    extAddons.forEach(id => {
      const a = ADDON_CATALOG.find(x => x.id === id);
      if (!a) return;
      // 자동연장 시 강사고정·학습매니저는 무료
      const isFreebie = window._isAutoRenew && (a.id === 'fixed_teacher' || a.id === 'manager');
      if (isFreebie) {
        rows.push(`<div class="ext-sum-row addon"><span class="sl">${a.icon} ${escapeHtml(a.name)} <span style="background:rgba(34,197,94,0.2);color:#86efac;padding:1px 6px;border-radius:4px;font-size:10px;margin-left:4px">자동결제 무료</span></span><span class="sv" style="text-decoration:line-through;color:#64748b">+₩${a.price.toLocaleString('ko-KR')}</span></div>`);
      } else {
        rows.push(`<div class="ext-sum-row addon"><span class="sl">${a.icon} ${escapeHtml(a.name)}</span><span class="sv">+₩${a.price.toLocaleString('ko-KR')}</span></div>`);
      }
    });
    const total = computeExtTotal();
    const monthlyTotal = window._isAutoRenew ? total : 0;
    sum.innerHTML = `
      <div style="color:#86efac;font-size:13px;font-weight:800;margin-bottom:8px">${window._isAutoRenew ? '♾️ 자동결제 요약 (매월 청구)' : '💰 결제 요약'}</div>
      ${rows.join('')}
      <div class="ext-sum-divider"></div>
      <div class="ext-sum-total">
        <span class="tl">${window._isAutoRenew ? '월 자동 결제액' : '총 결제 금액'}</span>
        <span class="tv">₩${total.toLocaleString('ko-KR')}${window._isAutoRenew ? '<span style="font-size:13px;color:#94a3b8;font-weight:600">/월</span>' : ''}</span>
      </div>
      ${extStudent && extStudent.remaining > 0 ? `<div style="margin-top:8px;padding:8px 10px;background:rgba(251,191,36,0.08);border-radius:8px;font-size:11px;color:#fde68a">💛 잔여 ${extStudent.remaining}회는 새 코스에 자동 합산되어 총 ${(extPackage.classes||0) + (extStudent.remaining||0)}회 수강 가능합니다.</div>` : ''}
      ${window._isAutoRenew ? `
        <div style="margin-top:8px;padding:10px 12px;background:linear-gradient(135deg,rgba(34,197,94,0.1),rgba(16,185,129,0.04));border:1px solid rgba(74,222,128,0.3);border-radius:10px;font-size:11.5px;color:#86efac;line-height:1.6">
          <b style="color:#22c55e">♾️ 자동연장 혜택</b><br/>
          ✓ 매월 ${(extPackage.discount_pct).toFixed(0)}% 할인 자동 적용<br/>
          ✓ 만료 5일 전 알림 + 자동 갱신 (수업 끊김 없음)<br/>
          ✓ <b>강사 고정 + 학습 매니저 (월 ₩80,000)</b> 자동 무료 적용<br/>
          ✓ 마이페이지에서 언제든 1초 해지 (해지 후 잔여 회차는 그대로)
        </div>
      ` : ''}
    `;
    if (nextBtn) nextBtn.disabled = false;
  }

  // 연장 step 2 진입 시 자동 렌더
  const _origPayGoStep = window.payGoStep;
  window.payGoStep = function(step) {
    _origPayGoStep(step);
    if (payMode === 'extend' && step === 2) {
      renderExtBanner();
      renderExtPackages();
      renderExtAddons();
      renderExtSummary();
    }
  };

  // 결제수단 카드 클릭
  const submitBtn = document.getElementById('payment-submit');
  document.querySelectorAll('.method-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.method-card.selected').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedMethod = card.dataset.method;
      renderInstantPayPanel(selectedMethod);
      // 🔴 (2026-07-29) 송금할 곳이 아직 없는 결제수단은 "결제 완료 확인"을 막는다.
      //   보낸 곳이 없는데 완료로 접수되면 장부가 어긋난다. 대신 문구로 다음 행동을 알려준다.
      const ready = payMethodReady(selectedMethod);
      submitBtn.disabled = !ready;
      submitBtn.textContent = ready ? '✅ 결제 완료 확인' : '💬 카카오 상담으로 진행해 주세요';
    });
  });

  // 다음 버튼 (step 2 → 3) 검증
  const stepNextBtn = document.querySelector('#pay-step2 .pay-btn-next');
  if (stepNextBtn) {
    stepNextBtn.addEventListener('click', (ev) => {
      /* 🔴 (2026-07-29) 이 검증은 그동안 '경고창만 뜨고 그냥 넘어가는' 상태였다.
         버튼에 인라인 onclick="payGoStep(3)" 이 함께 걸려 있는데, 여기서 return false 를 해도
         인라인 핸들러는 그대로 실행되기 때문. stopImmediatePropagation() 이어야 실제로 막힌다. */
      const block = () => { ev.preventDefault(); ev.stopImmediatePropagation(); };

      const payer = document.getElementById('pay-payer').value.trim();
      const student = document.getElementById('pay-student').value.trim();
      const contact = document.getElementById('pay-contact').value.trim();
      if (!payer || !student || !contact) {
        alert('결제자, 학생, 연락처는 필수입니다.');
        return block();
      }
      if (selectedProgram === 'other' && (Number(document.getElementById('pay-amount').value) || 0) <= 0) {
        alert('"기타"를 선택하셨으면 금액을 입력해 주세요. (추가 정보 펼쳐서 입력)');
        return block();
      }

      /* 🎁 (2026-07-29) 무료 체험은 결제 단계로 보내지 않는다.
         이전에는 trial(0원)도 결제수단 선택 화면으로 넘어가, 학부모가 "무료라더니 결제하라네" 를 봤다.
         (카드는 서버 가격표에 trial 이 없어 실제 청구까지 가진 않았지만, 화면은 그대로 결제였다)
         체험은 '결제'가 아니라 '신청'이므로 상담 접수 경로(/api/student/inquiry)로 보낸다. */
      if (selectedProgram === 'trial') {
        block();
        submitFreeTrial(payer, student, contact);
        return;
      }

      /* 🏢 (2026-08-07, QA 2차 #6) B2B / 학원도 결제 단계로 보내지 않는다.
         조사해 보니 'b2b' 는 서버 가격표(api-pay.ts PRICES)에 없어서, 결제수단까지 다 고른 뒤
         /api/pay/manual-request 가 400 not_payable 로 거부했다 —
         즉 "맞춤 견적"이라고 안내해 놓고 결제 깔때기 끝까지 끌고 가 문전박대하는 상태였다.
         B2B 는 단가·계약·정산이 건마다 달라 셀프 결제가 성립하지 않는다(#6 보고서 참고).
         체험과 같은 방식으로 '상담 접수'로 처리한다 — 접수처는 동일(POST /api/student/inquiry). */
      if (selectedProgram === 'b2b') {
        block();
        submitB2BInquiry(payer, student, contact);
      }
    }, true);
  }

  /* B2B(단체/기관) 도입 문의 접수 — 결제 모듈을 전혀 거치지 않는다. */
  async function submitB2BInquiry(payer, student, contact) {
    const btn = stepNextBtn;
    const oldLabel = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '접수 중…'; }
    try {
      const email = (document.getElementById('pay-email') || {}).value || '';
      const memo  = (document.getElementById('pay-memo')  || {}).value || '';
      const r = await fetch('/api/student/inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: payer,
          contact: contact,
          email: email.trim(),
          program: 'B2B / 학원 단체 도입 (맞춤 견적)',
          message: `[B2B 단체 도입 문의] 기관/담당: ${student} / 담당자: ${payer}` + (memo.trim() ? ` / 남긴말: ${memo.trim()}` : ''),
        })
      });
      const d = await r.json().catch(() => null);
      if (!d || !d.ok) throw new Error((d && (d.message || d.error)) || '접수 실패');

      document.getElementById('pay-step2').style.display = 'none';
      result.style.display = 'block';
      result.innerHTML = `
        <div style="text-align:center;padding:30px 20px">
          <div style="font-size:64px;margin-bottom:10px;animation:slideDown .5s">🏢</div>
          <h2 style="color:#93c5fd;font-size:23px;margin:0 0 8px;font-weight:900">단체 도입 문의 접수 완료!</h2>
          <p style="color:#cbd5e1;font-size:13px;line-height:1.7;margin-bottom:18px">
            <b style="color:#fbbf24">결제는 진행되지 않았어요</b> — 단체 도입은 인원·기간에 따라
            <b>맞춤 견적</b>으로 안내해 드립니다.<br/>담당자가 확인 후 연락드릴게요.
          </p>
          <div style="background:rgba(99,102,241,0.10);border:1px solid rgba(129,140,248,0.35);border-radius:14px;padding:16px;margin-bottom:16px;text-align:left">
            <div style="display:flex;justify-content:space-between;font-size:13px;color:#94a3b8;margin-bottom:8px">
              <span>문의 유형</span><b style="color:#fff">🏢 B2B / 학원 단체 도입</b>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:13px;color:#94a3b8">
              <span>담당자</span><b style="color:#fff">${escapeHtml(payer)}</b>
            </div>
          </div>
          <div style="display:flex;gap:8px;justify-content:center">
            <button onclick="window.openKakao&&window.openKakao()" style="padding:11px 22px;background:linear-gradient(135deg,#FEE500,#FFCD00);border:0;border-radius:10px;color:#3C1E1E;font-size:13px;font-weight:800;cursor:pointer">💬 카톡으로 문의</button>
            <button onclick="document.getElementById('payment-modal').style.display='none'" style="padding:11px 26px;background:linear-gradient(135deg,#6366f1,#4f46e5);border:0;border-radius:10px;color:#fff;font-size:13px;font-weight:800;cursor:pointer">확인</button>
          </div>
        </div>`;
    } catch (err) {
      alert('단체 도입 문의 접수 중 오류가 발생했어요: ' + (err.message || err) + '\n잠시 후 다시 시도해 주세요.');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = oldLabel; }
    }
  }

  /* 무료 체험 신청 접수 — 결제 모듈(PG)을 전혀 거치지 않는다. */
  async function submitFreeTrial(payer, student, contact) {
    const btn = stepNextBtn;
    const oldLabel = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '접수 중…'; }
    try {
      const email = (document.getElementById('pay-email') || {}).value || '';
      const memo  = (document.getElementById('pay-memo')  || {}).value || '';
      const r = await fetch('/api/student/inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: payer,
          contact: contact,
          email: email.trim(),
          program: '무료 체험 (1회 20분)',
          message: `[무료 체험 신청] 학생: ${student} / 결제자: ${payer}` + (memo.trim() ? ` / 남긴말: ${memo.trim()}` : ''),
        })
      });
      const d = await r.json().catch(() => null);
      if (!d || !d.ok) throw new Error((d && (d.message || d.error)) || '접수 실패');

      document.getElementById('pay-step2').style.display = 'none';
      result.style.display = 'block';
      result.innerHTML = `
        <div style="text-align:center;padding:30px 20px">
          <div style="font-size:64px;margin-bottom:10px;animation:slideDown .5s">🎁</div>
          <h2 style="color:#4ade80;font-size:23px;margin:0 0 8px;font-weight:900">무료 체험 신청 완료!</h2>
          <p style="color:#cbd5e1;font-size:13px;line-height:1.7;margin-bottom:18px">
            <b style="color:#fbbf24">결제 금액 0원</b> · 카드나 계좌에서 <b>아무 것도 빠져나가지 않아요</b>.<br/>
            담당자가 확인 후 <b>카카오톡으로 체험 수업 일정</b>을 안내해 드릴게요.
          </p>
          <div style="background:rgba(34,197,94,0.10);border:1px solid rgba(34,197,94,0.35);border-radius:14px;padding:16px;margin-bottom:16px;text-align:left">
            <div style="display:flex;justify-content:space-between;font-size:13px;color:#94a3b8;margin-bottom:8px">
              <span>신청 과정</span><b style="color:#fff">🎁 무료 체험 (1회 20분)</b>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:13px;color:#94a3b8;margin-bottom:8px">
              <span>학생</span><b style="color:#fff">${escapeHtml(student)}</b>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:14px;color:#94a3b8">
              <span>결제 금액</span><b style="color:#fbbf24;font-size:17px">₩ 0</b>
            </div>
          </div>
          <div style="display:flex;gap:8px;justify-content:center">
            <button onclick="window.openKakao&&window.openKakao()" style="padding:11px 22px;background:linear-gradient(135deg,#FEE500,#FFCD00);border:0;border-radius:10px;color:#3C1E1E;font-size:13px;font-weight:800;cursor:pointer">💬 카톡으로 문의</button>
            <button onclick="document.getElementById('payment-modal').style.display='none'" style="padding:11px 26px;background:linear-gradient(135deg,#4ade80,#16a34a);border:0;border-radius:10px;color:#fff;font-size:13px;font-weight:800;cursor:pointer">확인</button>
          </div>
        </div>`;
    } catch (err) {
      alert('체험 신청 중 오류가 발생했어요: ' + (err.message || err) + '\n잠시 후 다시 시도해 주세요.');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = oldLabel; }
    }
  }

  // 결제 신청 제출
  submitBtn.addEventListener('click', async () => {
    // 연장 모드 분기 — 학생 정보가 이미 있으므로 별도 검증
    let payer, student, contact;
    if (payMode === 'extend') {
      if (!extStudent || !extPackage) {
        alert('학생 정보 또는 연장 패키지를 먼저 선택해 주세요.');
        return;
      }
      if (!selectedMethod) { alert('결제수단을 선택해 주세요.'); return; }
      payer   = extStudent.name || extStudent.uid;
      student = extStudent.name || extStudent.uid;
      contact = extStudent.uid + ' (연장)';
    } else {
      if (!selectedProgram || !selectedMethod) {
        alert('상품과 결제수단을 모두 선택해 주세요.');
        return;
      }
      payer = document.getElementById('pay-payer').value.trim();
      student = document.getElementById('pay-student').value.trim();
      contact = document.getElementById('pay-contact').value.trim();
      if (!payer || !student || !contact) {
        alert('결제자·학생·연락처를 입력해 주세요.');
        payGoStep(2);
        return;
      }
    }
    // 카드·가상계좌는 PG 결제창(SDK)이 자동 처리하므로 여기서 수기접수로 호출하면 안 됨
    //   🏦 (2026-07-30) 가상계좌를 카드처럼 실제 PG 연동으로 바꾸면서 같은 함정이 생겼다 — 안 막으면
    //   "가상계좌 발급받기"를 누르기 전에 이 버튼을 눌러 미발급 상태로 manual-request 가 접수돼 버린다.
    if (selectedMethod === 'card') {
      const ok = confirm('💳 카드 결제는 위의 [카드 결제창 열기] 버튼을 누르셔야 결제됩니다.\n\n이미 결제하셨다면 [확인], 아니면 [취소]를 누르고 카드결제창을 열어주세요.');
      if (!ok) return;
    }
    if (selectedMethod === 'virtual') {
      const ok = confirm('🏦 가상계좌는 위의 [가상계좌 발급받기] 버튼을 누르셔야 발급됩니다.\n\n이미 발급받고 입금하셨다면 [확인], 아니면 [취소]를 누르고 발급받기를 눌러주세요.');
      if (!ok) return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = '처리 중…';
    try {
      // 연장 모드 — body 구성 다름
      let bodyPayload;
      if (payMode === 'extend') {
        const total = computeExtTotal();
        const addonsList = Array.from(extAddons).map(id => {
          const a = ADDON_CATALOG.find(x => x.id === id);
          return a ? a.name + '(₩'+a.price.toLocaleString('ko-KR')+')' : id;
        }).join(', ');
        const isAuto = !!window._isAutoRenew;
        const modeTag = isAuto ? '자동연장결제·' + extMode : '연장결제·' + extMode;
        const memoExt = `[${modeTag}] ${extPackage.name} | 잔여 ${extStudent.remaining||0}회 이월 | 추가옵션: ${addonsList||'없음'}${isAuto?' | ♾️ 매월 자동결제 (강사고정+매니저 무료)':''} | 즉석결제완료`;
        bodyPayload = {
          payer_name: payer,
          student_name: student,
          contact: contact,
          email: '',
          program: extPackage.id || ('extend-' + extMode),
          amount: total,
          method: selectedMethod,
          referrer: '',
          coupon_code: '',
          memo: memoExt,
          // 연장 전용 메타
          is_extension: true,
          uid: extStudent.uid,
          token: (function(){ try { return localStorage.getItem('mango_token') || ''; } catch(e){ return ''; } })(),
          base_program: extPackage.baseCourseId || extStudent.current_program,
          carry_over: extStudent.remaining || 0,
          addons: Array.from(extAddons),
          // 자동연장 메타
          is_auto_renew: isAuto,
          auto_renew_amount: isAuto ? total : 0,
          auto_renew_cycle: isAuto ? 'monthly' : null,
        };
      } else {
        // 🔒 (2026-07-30) 서버가 로그인을 요구하므로(제보 #1) uid/token 을 함께 보낸다.
        var _mrU = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
        var _mrToken = (function(){ try { return localStorage.getItem('mango_token') || ''; } catch(e){ return ''; } })();
        bodyPayload = {
          payer_name: payer,
          student_name: student,
          contact: contact,
          email: document.getElementById('pay-email').value.trim(),
          program: selectedProgram,
          amount: Number(document.getElementById('pay-amount').value) || selectedPrice,
          method: selectedMethod,
          referrer: document.getElementById('pay-referrer').value.trim(),
          coupon_code: document.getElementById('pay-coupon').value.trim(),
          memo: document.getElementById('pay-memo').value.trim() + ' [즉석결제완료]',
          uid: (_mrU && _mrU.uid) ? _mrU.uid : null,
          token: _mrToken,
        };
      }
      /* 🔴 (2026-07-29) 여기서 부르던 '/api/student/payment' 는 서버에 아예 없는 주소라
         항상 404 → 「결제 처리 중 오류: Not Found」 만 뜨고 접수가 하나도 안 됐다.
         실제로 존재하는 /api/pay/manual-request(신설)로 교체한다. 응답 필드명은 그대로 맞춰 뒀다. */
      const r = await fetch('/api/pay/manual-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload)
      });
      const d = await r.json().catch(() => null);
      if (!d || !d.ok) {
        if (d && d.error === 'auth_required') {
          alert('로그인이 필요합니다. 다시 로그인 후 진행해 주세요.');
          if (typeof window.openLoginModal === 'function') window.openLoginModal();
          submitBtn.disabled = false;
          submitBtn.textContent = '✅ 결제 완료 확인';
          return;
        }
        throw new Error((d && (d.message || d.error)) || '접수 처리 실패');
      }

      // 성공 화면 — 즉시 수강 활성화 톤
      document.getElementById('pay-step3').style.display = 'none';
      result.style.display = 'block';
      const methodLabel = ({card:'💳 카드 결제',kakao:'🟡 카카오페이',toss:'🔵 토스 송금',bank:'🏦 계좌이체',cash:'💵 무통장입금',naver:'🟢 네이버페이',virtual:'📑 가상계좌'})[selectedMethod] || selectedMethod;
      result.innerHTML = `
        <div style="text-align:center;padding:28px 20px">
          <div style="font-size:64px;margin-bottom:10px;animation:slideDown .5s">🎉</div>
          <h2 style="color:#4ade80;font-size:23px;margin:0 0 8px;font-weight:900">신청이 접수되었어요!</h2>
          <p style="color:#cbd5e1;font-size:13px;line-height:1.6;margin-bottom:18px">담당자가 <b>입금을 확인하는 대로</b> 수강이 활성화돼요.<br/>확인되면 카카오톡으로 알려드릴게요.</p>
          <div style="background:rgba(34,197,94,0.10);border:1px solid rgba(34,197,94,0.35);border-radius:14px;padding:16px;margin-bottom:16px;text-align:left">
            <div style="display:flex;justify-content:space-between;font-size:12px;color:#94a3b8;margin-bottom:8px">
              <span>접수번호</span>
              <code style="background:rgba(0,0,0,0.4);padding:2px 8px;border-radius:4px;color:#86efac;font-size:11px">${d.request_id || '-'}</code>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:13px;color:#94a3b8;margin-bottom:8px">
              <span>결제수단</span>
              <b style="color:#fff">${methodLabel}</b>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:13px;color:#94a3b8;margin-bottom:8px">
              <span>상품</span>
              <b style="color:#fff">${d.program_label || selectedProgram}</b>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:14px;color:#94a3b8">
              <span>금액</span>
              <b style="color:#fbbf24;font-size:17px">₩ ${(d.amount || 0).toLocaleString('ko-KR')}</b>
            </div>
          </div>
          <p style="color:#64748b;font-size:11px;line-height:1.5;margin-bottom:14px">
            📧 영수증/세금계산서가 입력하신 이메일·카톡으로 발송됩니다<br/>
            📞 문의: 1:1 카카오 상담 (우측 하단 노란 버튼)
          </p>
          <div style="display:flex;gap:8px;justify-content:center">
            <button onclick="window.openKakao&&window.openKakao()" style="padding:11px 22px;background:linear-gradient(135deg,#FEE500,#FFCD00);border:0;border-radius:10px;color:#3C1E1E;font-size:13px;font-weight:800;cursor:pointer">💬 카톡으로 확인받기</button>
            <button onclick="document.getElementById('payment-modal').style.display='none'" style="padding:11px 26px;background:linear-gradient(135deg,#4ade80,#16a34a);border:0;border-radius:10px;color:#fff;font-size:13px;font-weight:800;cursor:pointer">확인</button>
          </div>
        </div>
      `;
    } catch (err) {
      alert('결제 처리 중 오류: ' + err.message + '\n잠시 후 다시 시도해 주세요.');
      submitBtn.disabled = false;
      submitBtn.textContent = '✅ 결제 완료 확인';
    }
  });
})();

// ━━━━━━━━━━ 📋 결제 및 수강 규정 모달 ━━━━━━━━━━
window.showRulesModal = function() {
  let bg = document.getElementById('rules-modal-bg');
  if (!bg) {
    bg = document.createElement('div');
    bg.id = 'rules-modal-bg';
    bg.style.cssText = 'display:none;position:fixed;inset:0;z-index:10001;background:rgba(0,0,0,0.85);backdrop-filter:blur(10px);align-items:flex-start;justify-content:center;overflow-y:auto;padding:20px';
    bg.addEventListener('click', (e) => { if (e.target === bg) closeRulesModal(); });
    bg.innerHTML = `
      <div style="background:linear-gradient(135deg,#1e293b,#0f172a);border:1px solid rgba(251,191,36,0.35);border-radius:18px;max-width:720px;width:96%;margin:auto;box-shadow:0 24px 64px -16px rgba(0,0,0,0.8);overflow:hidden">
        <!-- 헤더 -->
        <div style="background:linear-gradient(135deg,rgba(251,191,36,0.15),rgba(245,158,11,0.05));padding:22px 26px 16px;border-bottom:1px solid rgba(255,255,255,0.06);position:relative">
          <button onclick="closeRulesModal()" style="position:absolute;top:14px;right:14px;background:rgba(255,255,255,0.1);border:0;color:#cbd5e1;font-size:18px;cursor:pointer;width:32px;height:32px;border-radius:50%">✕</button>
          <h2 style="color:#fbbf24;font-size:22px;margin:0 0 4px;font-weight:900;letter-spacing:-0.4px">📋 결제 및 수강 규정</h2>
          <p style="color:#cbd5e1;font-size:12.5px;margin:0">결제 전 반드시 확인 부탁드립니다.</p>
        </div>

        <!-- 본문 --->

        <!-- 본문 -->
        <div style="padding:20px 26px;color:#cbd5e1;font-size:13px;line-height:1.7;max-height:60vh;overflow-y:auto">
          <h3 style="color:#fbbf24;font-size:15px;margin:0 0 8px">1. 환불 규정</h3>
          <ul style="margin:0 0 14px;padding-left:18px">
            <li>수업 시작 전: 100% 환불</li>
            <li>수업 시작 7일 이내: 90% 환불</li>
            <li>수업 시작 8일 ~ 1/3 경과: 잔여 회차의 70% 환불</li>
            <li>1/3 경과 ~ 2/3 경과: 잔여 회차의 50% 환불</li>
            <li>2/3 경과 이후: 환불 불가</li>
          </ul>
          <h3 style="color:#fbbf24;font-size:15px;margin:0 0 8px">2. 수업 결강·연기</h3>
          <ul style="margin:0 0 14px;padding-left:18px">
            <li>당일 연기는 수업 시작 <b>30분 전까지</b> 신청 가능합니다</li>
            <li>월별 연기 가능 횟수: 주1회 수강 시 <b>월 2회</b> · 주2회 수강 시 <b>월 4회</b> · 주3회 수강 시 <b>월 6회</b> · 주5회 수강 시 <b>월 10회</b>까지</li>
            <li>강사 사정 결강: 다른 강사로 자동 대체 또는 1회 무상 보강</li>
          </ul>
          <h3 style="color:#fbbf24;font-size:15px;margin:0 0 8px">3. 수강 기간</h3>
          <ul style="margin:0 0 14px;padding-left:18px">
            <li>4회권 / 8회권: 결제일로부터 2개월</li>
            <li>12회권 / 24회권: 결제일로부터 3 ~ 6개월</li>
          </ul>
          <h3 style="color:#fbbf24;font-size:15px;margin:0 0 8px">4. 녹화본 보관</h3>
          <ul style="margin:0;padding-left:18px">
            <li>본인 수업 녹화본만 시청 가능 (1달간 보관)</li>
            <li>다운로드는 결제 회원만 가능</li>
            <li>제3자 공유·재배포 금지</li>
          </ul>
        </div>
      </div>`;
    document.body.appendChild(bg);
  }
  bg.style.display = 'flex';
};
window.closeRulesModal = function() {
  const bg = document.getElementById('rules-modal-bg');
  if (bg) bg.style.display = 'none';
};
/* ══════════════════════════════════════════════════════════════════
   🧭 신규결제 STEP1 — 대상 먼저 고르기 (2026-07-27, 직원 피드백 #13)

   왜: 첫 화면에 상품 카드가 12개 한꺼번에 나와서, 고르기도 전에 지친다는 지적.
       선택지가 늘수록 결정이 느려지고 '나중에 결정'이 '결정 안 함'이 된다.

   어떻게: 상품 카드와 결제 로직은 **하나도 건드리지 않는다**. data-program 으로
       분류만 해서 보이기/숨기기만 한다. 그래서 이 블록을 통째로 지워도 원래대로 돌아간다.

   ⚠️ '전체 요금표 보기'를 반드시 남겨 둘 것 — 비교표를 통째로 보려는 학부모가 많고,
      가격을 숨긴다는 인상을 주면 오히려 역효과다.
   ══════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';
  var CATS = [
    { id:'kids',     ko:'키즈 (4~12세)', en:'Kids (4–12)' },
    { id:'general',  ko:'일반 1:1',      en:'General 1:1' },
    { id:'group',    ko:'그룹',          en:'Group' },
    { id:'business', ko:'비즈니스',      en:'Business' },
    { id:'exam',     ko:'시험 대비',     en:'Test Prep' },
    { id:'b2b',      ko:'기업 · 학원',   en:'Company / Academy' },
    { id:'all',      ko:'전체 요금표 보기', en:'See all plans' }
  ];
  var MAP = {
    'kids':'kids', 'business':'business', 'exam':'exam', 'b2b':'b2b', 'group-12':'group',
    '1on1-4':'general', '1on1-8':'general', '1on1-12':'general', '1on1-24':'general'
  };
  // 어떤 대상을 골라도 늘 보이는 카드(무료체험·맞춤상담·규정 안내·AI 콘텐츠 전용)
  // ai_content 는 나이·목적 카테고리와 무관한 별도 상품이라 특정 대상에 묶지 않는다.
  var ALWAYS = { 'trial':1, 'other':1, 'ai_content':1 };

  function cardsIn(bar){
    var pane = bar.closest('#pay-step1') || document;
    return [].slice.call(pane.querySelectorAll('.product-card'));
  }
  function apply(bar, cat){
    cardsIn(bar).forEach(function(c){
      var p = c.getAttribute('data-program') || '';
      var show = !p || ALWAYS[p] || cat === 'all' || MAP[p] === cat;
      c.style.display = show ? '' : 'none';
    });
    [].slice.call(bar.querySelectorAll('button')).forEach(function(b){
      var on = b.getAttribute('data-cat') === cat;
      b.style.background = on ? 'linear-gradient(135deg,#fbbf24,#f59e0b)' : 'rgba(255,255,255,.06)';
      b.style.color      = on ? '#1a0f08' : '#e2e8f0';
      b.style.borderColor= on ? 'transparent' : 'rgba(148,163,184,.35)';
      b.style.fontWeight = on ? '800' : '700';
    });
    var hint = document.getElementById('pay-cat-hint');
    if (hint) hint.style.display = cat ? 'none' : '';
  }
  function build(){
    var bar = document.getElementById('pay-cat-bar');
    if (!bar || bar.dataset.ready) return;
    bar.dataset.ready = '1';
    bar.innerHTML = CATS.map(function(c){
      return '<button type="button" data-cat="'+c.id+'" data-ko="'+c.ko+'" data-en="'+c.en+'"'
        + ' style="padding:8px 13px;border-radius:99px;border:1px solid rgba(148,163,184,.35);'
        + 'background:rgba(255,255,255,.06);color:#e2e8f0;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">'
        + c.ko + '</button>';
    }).join('');
    var hint = document.createElement('div');
    hint.id = 'pay-cat-hint';
    hint.setAttribute('data-ko','↑ 먼저 대상을 골라 주세요. 그 대상에 맞는 과정만 보여드릴게요.');
    hint.setAttribute('data-en','↑ Pick who is learning first — we will show only the plans that fit.');
    hint.style.cssText = 'font-size:12.5px;color:#94a3b8;margin:2px 0 10px';
    hint.textContent = '↑ 먼저 대상을 골라 주세요. 그 대상에 맞는 과정만 보여드릴게요.';
    bar.parentNode.insertBefore(hint, bar.nextSibling);

    bar.addEventListener('click', function(e){
      var b = e.target.closest('button[data-cat]');
      if (!b) return;
      apply(bar, b.getAttribute('data-cat'));
    });
    apply(bar, '');   // 처음엔 아무 것도 안 고른 상태
    if (window.applyLang) { try { window.applyLang(); } catch(_){} }
  }

  // STEP1 이 열릴 때마다 준비 (모달이 나중에 만들어질 수도 있어 payGoStep 을 감싼다)
  var _prev = window.payGoStep;
  window.payGoStep = function(step){
    if (typeof _prev === 'function') _prev.apply(this, arguments);
    if (step === 1) setTimeout(build, 0);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else setTimeout(build, 0);
})();
