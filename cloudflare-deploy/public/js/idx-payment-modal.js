(function(){
  const modal = document.getElementById('payment-modal');
  if (!modal) return;
  const result = document.getElementById('payment-result');

  let selectedProgram = null;
  let selectedPrice = 0;
  let selectedMethod = null;
  // ─── 신규/연장 분기 상태 ───
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
    'trial': { icon: '🎁', name: '무료 체험', detail: '1회 (40분)', price: 0 },
    '1on1-4': { icon: '📗', name: '1:1 4회권', detail: '맛보기 (40분)', price: 60000 },
    '1on1-8': { icon: '📘', name: '1:1 8회권', detail: '월 2회/주 (40분)', price: 120000 },
    '1on1-12': { icon: '📕', name: '1:1 12회권', detail: '월 3회/주 (40분)', price: 180000 },
    '1on1-24': { icon: '📚', name: '1:1 24회권', detail: '월 6회/주 (40분)', price: 360000 },
    'group-12': { icon: '👥', name: '그룹 12회권', detail: '2-4명 토론', price: 120000 },
    'business': { icon: '💼', name: '비즈니스 영어', detail: '실전 회의·이메일', price: 70000 },
    'kids': { icon: '👶', name: '키즈 영어', detail: '놀이형 4-12세', price: 50000 },
    'exam': { icon: '📝', name: '시험 영어', detail: 'TOEIC·OPIc·IELTS', price: 80000 },
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
    payGoStep(0);
    result.style.display = 'none';
    modal.style.display = 'flex';
    showPayGuideVideo();   // 🎬 결제 안내 영상 자동 재생
  };

  function closeModal(){
    modal.style.display = 'none';
    killPayGuideVideo();   // 영상도 함께 종료
    // 결제 모달 닫으면 히트맵 그리드(메뉴)로 자동 복귀
    const gm = document.getElementById('grid-menu');
    if (gm) gm.style.display = 'block';
  }
  document.getElementById('payment-close').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal.style.display !== 'none') closeModal(); });

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
      // 자동연장(auto)은 내부적으로 extend 흐름을 재사용 (학생 인증 → 패키지 선택 → 결제수단)
      // 다만 추가 할인과 자동결제 메타가 적용됨
      payMode = (mode === 'auto') ? 'extend' : mode;
      window._isAutoRenew = (mode === 'auto');
      document.querySelectorAll('.paymode-card.selected').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      setTimeout(() => {
        payGoStep(1);
        // 🆕 로그인한 학생이면 '학생 확인' 단계를 자동 통과
        if (payMode === 'extend') setTimeout(payAutoVerifyIfLoggedIn, 280);
      }, 180);
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

  // 상품 카드 클릭 → 선택 + step 2 자동 전환
  document.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', () => {
      // 규정 안내 카드는 상품 선택이 아니므로 제외
      if (card.classList.contains('rules-card')) return;
      document.querySelectorAll('.product-card.selected').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedProgram = card.dataset.program;
      selectedPrice = Number(card.dataset.price) || 0;
      // 🆕 로그인 + 유료 상품이면 정보 입력 단계(step2)를 건너뛰고 바로 결제수단(step3)으로.
      //    무료체험(trial)·상담형(other/b2b)은 연락 정보가 필요하므로 기존대로 step2 유지.
      var _logged   = window.payAutofillNewIfLoggedIn && window.payAutofillNewIfLoggedIn();
      var _skipInfo = _logged && selectedPrice > 0
                      && selectedProgram !== 'other' && selectedProgram !== 'b2b' && selectedProgram !== 'trial';
      setTimeout(() => payGoStep(_skipInfo ? 3 : 2), 300);
    });
  });

  // ━━━━━━━━━━ 결제 회사 정보 (실제 운영 시 변경) ━━━━━━━━━━
  const PAY_INFO = {
    bank_name: '신한은행',
    bank_code: 'SHINHAN',
    account_no: '110-555-123456',
    account_holder: '망고아이(주)',
    biz_name: '망고아이',
    kakaopay_url: 'https://qr.kakaopay.com/Ej86dkamx',  // 카카오페이 송금 코드 (실제 코드로 교체)
    toss_id: 'mangoi',                                    // toss.me/<id> (실제 ID로 교체)
    tosspayments_client_key: 'test_ck_D5GePWvyJnrK0W0k6q8gLzN97Eoq', // 토스페이먼츠 공식 테스트 클라이언트키 (실전 전환 시 live_ck_ 로 교체)
  };

  // 카드 결제 (토스페이먼츠) — 서버 주문 생성 → 결제창 (금액은 서버가 결정 = 위변조 방지)
  async function executeCardPayment(amount, payer, orderId, programLabel) {
    // 1) 서버에 주문 생성 — 서버 가격표로 금액을 확정하고 주문번호를 받는다.
    let order;
    try {
      var _u = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
      var student = (document.getElementById('pay-student') || {}).value || '';
      const res = await fetch('/api/pay/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          program: selectedProgram,
          payer: payer,
          student: student,
          method: 'card',
          uid: (_u && _u.uid) ? _u.uid : null
        })
      });
      order = await res.json().catch(function(){ return null; });
      if (!order || !order.ok) {
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
      const tp = window.TossPayments(PAY_INFO.tosspayments_client_key);
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

  // 결제수단 → 즉시 결제 패널 렌더
  function renderInstantPayPanel(method) {
    const amount = selectedPrice || (Number(document.getElementById('pay-amount')?.value) || 0);
    const amountStr = '₩ ' + amount.toLocaleString('ko-KR');
    const payer = (document.getElementById('pay-payer')?.value || '').trim() || '결제자';
    const student = (document.getElementById('pay-student')?.value || '').trim() || '학생';
    const orderId = 'PAY-' + Date.now().toString(36).toUpperCase() + '-' + Math.floor(Math.random()*999);
    const programLabel = (PROG_INFO[selectedProgram]||{}).name || '수강료';
    const depositName = student.replace(/\s+/g,'').slice(0,8) + (Math.floor(Math.random()*9000)+1000);

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
      const tossDeep = `supertoss://send?bank=${PAY_INFO.bank_code}&accountNo=${PAY_INFO.account_no.replace(/-/g,'')}&amount=${amount}&origin=mangoi`;
      c.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
          <span style="font-size:22px">🔵</span>
          <div>
            <div style="color:#86efac;font-size:14px;font-weight:800">토스 즉시 송금</div>
            <div style="color:#94a3b8;font-size:11px">토스 앱이 열려 자동으로 금액·계좌가 입력됩니다</div>
          </div>
        </div>
        <div style="background:rgba(0,0,0,0.3);padding:12px;border-radius:10px;margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;color:#cbd5e1;font-size:13px">
            <span>송금 금액</span><b style="color:#fbbf24;font-size:16px">${amountStr}</b>
          </div>
        </div>
        <a href="${tossWeb}" target="_blank" rel="noopener" style="display:block;text-align:center;padding:13px;background:linear-gradient(135deg,#0064FF,#0050cc);border-radius:10px;color:#fff;font-size:14px;font-weight:800;text-decoration:none;margin-bottom:8px">
          🔵 toss.me로 송금 (PC·모바일)
        </a>
        <a href="${tossDeep}" style="display:block;text-align:center;padding:11px;background:rgba(0,100,255,0.15);border:1px solid rgba(0,100,255,0.4);border-radius:10px;color:#60a5fa;font-size:12px;font-weight:700;text-decoration:none">
          📱 모바일 토스 앱 직접 열기
        </a>
      `;
    } else if (method === 'bank' || method === 'cash') {
      c.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
          <span style="font-size:22px">🏦</span>
          <div>
            <div style="color:#86efac;font-size:14px;font-weight:800">계좌이체 / 무통장입금</div>
            <div style="color:#94a3b8;font-size:11px">아래 계좌로 송금 후 "결제 완료 확인" 클릭</div>
          </div>
        </div>
        <div style="background:rgba(0,0,0,0.4);padding:14px;border-radius:10px;margin-bottom:10px;font-family:'SF Mono',Consolas,monospace">
          <div style="display:grid;grid-template-columns:90px 1fr auto;gap:8px;align-items:center;font-size:13px;color:#cbd5e1;margin-bottom:8px">
            <span style="color:#94a3b8">은행</span>
            <b style="color:#fff">${PAY_INFO.bank_name}</b>
            <span></span>
          </div>
          <div style="display:grid;grid-template-columns:90px 1fr auto;gap:8px;align-items:center;font-size:14px;color:#cbd5e1;margin-bottom:8px">
            <span style="color:#94a3b8">계좌번호</span>
            <b style="color:#fbbf24;letter-spacing:0.5px" id="bank-acct-text">${PAY_INFO.account_no}</b>
            <button type="button" onclick="copyText('${PAY_INFO.account_no}', this)" style="padding:4px 10px;background:rgba(251,191,36,0.2);border:1px solid rgba(251,191,36,0.4);border-radius:6px;color:#fbbf24;font-size:11px;cursor:pointer">복사</button>
          </div>
          <div style="display:grid;grid-template-columns:90px 1fr auto;gap:8px;align-items:center;font-size:13px;color:#cbd5e1;margin-bottom:8px">
            <span style="color:#94a3b8">예금주</span>
            <b style="color:#fff">${PAY_INFO.account_holder}</b>
            <span></span>
          </div>
          <div style="display:grid;grid-template-columns:90px 1fr auto;gap:8px;align-items:center;font-size:14px;color:#cbd5e1;margin-bottom:8px">
            <span style="color:#94a3b8">송금 금액</span>
            <b style="color:#86efac;font-size:15px">${amountStr}</b>
            <button type="button" onclick="copyText('${amount}', this)" style="padding:4px 10px;background:rgba(74,222,128,0.2);border:1px solid rgba(74,222,128,0.4);border-radius:6px;color:#86efac;font-size:11px;cursor:pointer">복사</button>
          </div>
          <div style="display:grid;grid-template-columns:90px 1fr auto;gap:8px;align-items:center;font-size:13px;color:#cbd5e1">
            <span style="color:#94a3b8">입금자명</span>
            <b style="color:#fbbf24" id="depositor-name">${depositName}</b>
            <button type="button" onclick="copyText('${depositName}', this)" style="padding:4px 10px;background:rgba(251,191,36,0.2);border:1px solid rgba(251,191,36,0.4);border-radius:6px;color:#fbbf24;font-size:11px;cursor:pointer">복사</button>
          </div>
        </div>
        <div style="padding:10px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);border-radius:8px;font-size:11px;color:#fca5a5;line-height:1.5">
          ⚠️ 입금자명을 정확히 <b style="color:#fbbf24">${depositName}</b> 으로 입력해주세요. (자동 매칭용)
        </div>
      `;
    } else if (method === 'naver') {
      c.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
          <span style="font-size:22px">🟢</span>
          <div>
            <div style="color:#86efac;font-size:14px;font-weight:800">네이버페이 송금</div>
            <div style="color:#94a3b8;font-size:11px">네이버 앱에서 간편 송금</div>
          </div>
        </div>
        <div style="background:rgba(0,0,0,0.3);padding:12px;border-radius:10px;margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;color:#cbd5e1;font-size:13px;margin-bottom:6px">
            <span>송금 금액</span><b style="color:#fbbf24;font-size:16px">${amountStr}</b>
          </div>
          <div style="display:flex;justify-content:space-between;color:#cbd5e1;font-size:12px">
            <span>입금 계좌</span><b>${PAY_INFO.bank_name} ${PAY_INFO.account_no}</b>
          </div>
        </div>
        <a href="https://new-m.pay.naver.com/historybenefit/transferGuide" target="_blank" rel="noopener" style="display:block;text-align:center;padding:13px;background:linear-gradient(135deg,#03C75A,#01a448);border-radius:10px;color:#fff;font-size:14px;font-weight:800;text-decoration:none">
          🟢 네이버페이 송금 열기
        </a>
        <p style="margin:10px 0 0;color:#94a3b8;font-size:11px;text-align:center">
          네이버 앱 → 송금 → 위 계좌번호 입력
        </p>
      `;
    } else if (method === 'virtual') {
      // 가상계좌 — 즉시 발급 시뮬레이션 (실제 PG 연동 시 서버에서 발급)
      const va = '79' + (Math.floor(Math.random()*1e10).toString().padStart(10,'0'));
      c.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
          <span style="font-size:22px">📑</span>
          <div>
            <div style="color:#86efac;font-size:14px;font-weight:800">가상계좌 즉시 발급 완료</div>
            <div style="color:#94a3b8;font-size:11px">전용 입금 계좌가 발급되었습니다</div>
          </div>
        </div>
        <div style="background:rgba(0,0,0,0.4);padding:14px;border-radius:10px;margin-bottom:10px;font-family:Consolas,monospace">
          <div style="display:grid;grid-template-columns:90px 1fr auto;gap:8px;align-items:center;font-size:13px;color:#cbd5e1;margin-bottom:8px">
            <span style="color:#94a3b8">발급 은행</span>
            <b style="color:#fff">우리은행 (가상계좌)</b>
            <span></span>
          </div>
          <div style="display:grid;grid-template-columns:90px 1fr auto;gap:8px;align-items:center;font-size:15px;color:#cbd5e1;margin-bottom:8px">
            <span style="color:#94a3b8;font-size:13px">계좌번호</span>
            <b style="color:#fbbf24;letter-spacing:1px">${va}</b>
            <button type="button" onclick="copyText('${va}', this)" style="padding:4px 10px;background:rgba(251,191,36,0.2);border:1px solid rgba(251,191,36,0.4);border-radius:6px;color:#fbbf24;font-size:11px;cursor:pointer">복사</button>
          </div>
          <div style="display:grid;grid-template-columns:90px 1fr auto;gap:8px;align-items:center;font-size:13px;color:#cbd5e1;margin-bottom:8px">
            <span style="color:#94a3b8">예금주</span>
            <b style="color:#fff">${PAY_INFO.account_holder}</b>
            <span></span>
          </div>
          <div style="display:grid;grid-template-columns:90px 1fr auto;gap:8px;align-items:center;font-size:14px;color:#cbd5e1">
            <span style="color:#94a3b8;font-size:13px">입금 금액</span>
            <b style="color:#86efac">${amountStr}</b>
            <span></span>
          </div>
        </div>
        <div style="padding:10px;background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.25);border-radius:8px;font-size:11px;color:#86efac">
          ✅ 위 가상계좌로 입금하시면 자동으로 결제 처리됩니다 (24시간 유효)
        </div>
      `;
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

  // 🆕 신규 결제 — 로그인 학생이면 결제자/학생/연락처를 세션값으로 자동채움.
  //   · 반환값 true = 로그인됨(정보 입력 단계 생략 가능), false = 비로그인(수동 입력).
  window.payAutofillNewIfLoggedIn = function(){
    try {
      var u = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
      if (!u) { try { u = JSON.parse(localStorage.getItem('mangoi_logged_user') || localStorage.getItem('mango_user') || 'null'); } catch(_){} }
      if (!u) return false;
      var uid  = u.uid || u.id || u.user_id || '';
      var name = u.name || u.user_name || uid;
      if (!uid && !name) return false;
      var setV = function(id, v){ var el = document.getElementById(id); if (el && !el.value.trim()) el.value = v; };
      setV('pay-payer',   name);
      setV('pay-student', name);
      setV('pay-contact', uid || name);   // 로그인 ID로 본인 인증 대체
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
      submitBtn.disabled = false;
    });
  });

  // 다음 버튼 (step 2 → 3) 검증
  const stepNextBtn = document.querySelector('#pay-step2 .pay-btn-next');
  if (stepNextBtn) {
    stepNextBtn.addEventListener('click', () => {
      const payer = document.getElementById('pay-payer').value.trim();
      const student = document.getElementById('pay-student').value.trim();
      const contact = document.getElementById('pay-contact').value.trim();
      if (!payer || !student || !contact) {
        alert('결제자, 학생, 연락처는 필수입니다.');
        return false;
      }
      if (selectedProgram === 'other' && (Number(document.getElementById('pay-amount').value) || 0) <= 0) {
        alert('"기타"를 선택하셨으면 금액을 입력해 주세요. (추가 정보 펼쳐서 입력)');
        return false;
      }
    }, true);
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
    // 카드 결제는 PG 결제창에서 자동 처리되므로 여기서 호출하면 안 됨
    if (selectedMethod === 'card') {
      const ok = confirm('💳 카드 결제는 위의 [카드 결제창 열기] 버튼을 누르셔야 결제됩니다.\n\n이미 결제하셨다면 [확인], 아니면 [취소]를 누르고 카드결제창을 열어주세요.');
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
          base_program: extPackage.baseCourseId || extStudent.current_program,
          carry_over: extStudent.remaining || 0,
          addons: Array.from(extAddons),
          // 자동연장 메타
          is_auto_renew: isAuto,
          auto_renew_amount: isAuto ? total : 0,
          auto_renew_cycle: isAuto ? 'monthly' : null,
        };
      } else {
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
        };
      }
      const r = await fetch('/api/student/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload)
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || '결제 처리 실패');

      // 성공 화면 — 즉시 수강 활성화 톤
      document.getElementById('pay-step3').style.display = 'none';
      result.style.display = 'block';
      const methodLabel = ({card:'💳 카드 결제',kakao:'🟡 카카오페이',toss:'🔵 토스 송금',bank:'🏦 계좌이체',cash:'💵 무통장입금',naver:'🟢 네이버페이',virtual:'📑 가상계좌'})[selectedMethod] || selectedMethod;
      result.innerHTML = `
        <div style="text-align:center;padding:28px 20px">
          <div style="font-size:64px;margin-bottom:10px;animation:slideDown .5s">🎉</div>
          <h2 style="color:#4ade80;font-size:23px;margin:0 0 8px;font-weight:900">결제가 완료되었어요!</h2>
          <p style="color:#cbd5e1;font-size:13px;line-height:1.6;margin-bottom:18px">입금 확인 후 즉시 수강이 활성화됩니다 (1~10분 이내)</p>
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
            <li>수업 시작 24시간 이내 연기: 1회 무상 (월 2회 한도)</li>
            <li>당일 연기/결강: 1회 차감</li>
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