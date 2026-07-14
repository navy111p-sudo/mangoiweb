// ═══════════════════════════════════════════════════════════════
// idx-x2.js — index.html 인라인 추출 (3단계 36차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. VC·부팅 코드 아님(분류 후 추출).
//   원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  // 로그인 안 해도 누구나 접근 가능한 카드 (안내/공개 정보)
  const PUBLIC_CARDS = new Set([
    'franchise',     // 가맹점 문의
    'teachers',      // 강사 소개
    'contact',       // 고객센터
    'notice',        // 공지사항
    'introducing',   // 망고아이 특장점
    'trial',         // 무료체험 (신규상담)
    'callcenter',    // 현지 콜센터
    'event',         // 이벤트
    'reviews',       // 수업 후기
    'faq',           // 자주 묻는 질문
    'learnguide',    // 학습 가이드
    'installguide',  // 프로그램 설치
    'diagnosis',     // 자가진단
    'kakao',         // 카톡상담
    'remote',        // PC 원격지원
    'inquiry',       // 신규상담
    'homepage',      // 홈페이지
    'lessons',       // 학습 영상 (공개)
    'mbti',          // MBTI 매칭 (공개)
    'teacher-praise',// 교사 칭찬하기 (익명, 비로그인 가능)
    'streak',        // 🔥 데일리 스트릭 — 로그인된 사용자 자동 매핑
    'write',         // ✍️ AI 영작 첨삭 — 로그인된 사용자 자동 매핑
    'chat',          // 💬 AI 영어 친구 — 로그인된 사용자 자동 매핑
  ]);

  function isLoggedIn() {
    // 🔑 통합 로그인 인식 — 다음 중 하나라도 있으면 로그인된 것으로 본다.
    //   • mango_user        (구버전 키 — 호환용)
    //   • mangoi_logged_user (현재 메인 로그인이 사용하는 키)
    //   • mangoi_uid         (간단 매핑 키)
    try {
      const a = JSON.parse(localStorage.getItem('mango_user') || 'null');
      if (a && (a.uid || a.id || a.email)) return true;
    } catch(e){}
    try {
      const b = JSON.parse(localStorage.getItem('mangoi_logged_user') || 'null');
      if (b && b.uid) {
        // 호환을 위해 mango_user 에도 미러링 (앞으로 빈도 높은 쪽)
        try { localStorage.setItem('mango_user', JSON.stringify(b)); } catch(e){}
        return true;
      }
    } catch(e){}
    try { if (localStorage.getItem('mangoi_uid')) return true; } catch(e){}
    return false;
  }
  window.isLoggedIn = isLoggedIn;

  function showLoginGuard(cardLabel, intendedHref) {
    // 🔑 SSO — 이미 메인에서 로그인했으면 바로 통과 (모달 안 띄움)
    if (isLoggedIn()) {
      if (intendedHref) { try { window.location.href = intendedHref; return; } catch(e){} }
      return; // 호출자가 자체적으로 이어서 진행
    }
    // 의도된 목적지 저장 — 로그인 성공 후 자동 복귀
    try { if (intendedHref) sessionStorage.setItem('mangoi_post_login_redirect', intendedHref); } catch(e){}

    // 모든 카드 공통 — 비로그인이면 로그인 모달 열기 + 안내
    if (typeof window.openLoginModal === 'function') {
      window.openLoginModal();
      // 모달 안에 안내 메시지 추가
      setTimeout(() => {
        const sub = document.querySelector('.login-modal .lm-sub');
        if (sub && cardLabel) {
          // 기존 안내 박스 제거 후 새로 추가
          sub.querySelectorAll('.mangoi-login-notice').forEach(el => el.remove());
          sub.insertAdjacentHTML('beforeend', `<div class="mangoi-login-notice" style="margin-top:12px;padding:14px 16px;background:linear-gradient(135deg,rgba(251,191,36,0.18),rgba(245,158,11,0.10));border:1px solid rgba(251,191,36,0.45);border-radius:10px;color:#fde68a;font-size:13.5px;font-weight:700;text-align:center;line-height:1.55"><b>🔒 ${cardLabel}</b><br><span style="color:#fcd34d;font-size:13px;font-weight:600">로그인 후에 다시 사용해 주세요</span></div>`);
        }
      }, 100);
    } else {
      alert('로그인 후에 다시 사용해 주세요.');
    }
  }

  // 카드 클릭 가드 전체 비활성화 — 메인 로그인 한 번이면 모든 카드 자유 사용
  // (비로그인 사용자가 들어와도 각 페이지가 알아서 처리)
  document.addEventListener('click', function(e) {
    // 모든 카드 통과 — 별도 로그인 모달 없음
    return;
  }, true);

  // 🗂 카드 → 카테고리 매핑 (data-go 값 기준)
  const CARD_CATEGORY_MAP = {
    // 🚀 학습 시작 (Learn)
    'videolesson': 'learn', 'lessons': 'learn', 'speech': 'learn',
    'learnguide': 'learn', 'goals': 'learn', 'attend': 'learn',
    'streak': 'learn', 'leveltest': 'learn',
    // 🤖 AI 도구
    'ai-coach': 'ai', 'aispeech': 'ai', 'voice': 'ai',
    'write': 'ai', 'chat': 'ai', 'microquiz': 'ai',
    'vocab': 'ai', 'mbti': 'ai',
    // 📝 수업·평가
    'enroll': 'class', 'reviews': 'class', 'eval': 'class',
    'evaluation': 'class', 'recordings': 'class', 'curriculum': 'class',
    'teachers': 'class', 'teacher-praise': 'class',
    // 💎 포인트·이벤트
    'points': 'reward', 'ranking': 'reward', 'leaderboard': 'reward',
    'event': 'reward',
    // 👨‍👩‍👧 학부모·소통
    'parent-dashboard': 'parent', 'push-subscribe': 'parent',
    'notice': 'parent', 'faq': 'parent', 'kakao': 'parent',
    'callcenter': 'parent', 'contact': 'parent', 'trial': 'parent',
    'inquiry': 'parent',
    // 🛠 도움말·기타
    'library': 'tools', 'introducing': 'tools', 'payment': 'tools',
    'diagnosis': 'tools', 'focus': 'tools', 'installguide': 'tools',
    'remote': 'tools', 'franchise': 'tools', 'adminmgr': 'tools',
    'admin': 'tools', 'homepage': 'tools',
  };

  // 한글 라벨 기반 보조 분류 (data-go 가 없거나 매핑에 없는 카드용)
  const CARD_LABEL_FALLBACK = [
    [/단어장|단어|어휘/, 'ai'],
    [/AI|발음|음성|영작|챗봇|코칭/, 'ai'],
    [/MBTI/, 'ai'],
    [/포인트|랭킹|이벤트|혜택|배지|보석/, 'reward'],
    [/스트릭|출석/, 'learn'],
    [/비디오|레슨|학습|영상|커리큘럼|교육과정/, 'learn'],
    [/평가|수강|수업|강사|녹화|후기|칭찬/, 'class'],
    [/학부모|자녀|알림|공지|FAQ|카톡|콜센터|고객|상담|무료체험|문의/, 'parent'],
    [/자료|결제|진단|집중|설치|원격|가맹|관리자|홈페이지|특장/, 'tools'],
  ];

  function assignCardCategory(card) {
    const go = card.getAttribute('data-go') || '';
    let cat = CARD_CATEGORY_MAP[go];
    if (!cat) {
      const label = card.querySelector('.gm-label')?.textContent || '';
      for (const [re, c] of CARD_LABEL_FALLBACK) {
        if (re.test(label)) { cat = c; break; }
      }
    }
    if (!cat) cat = 'tools';  // 미분류 → 도움말·기타
    card.setAttribute('data-cat', cat);
  }

  window.setGmCategory = function(cat, btn) {
    // 활성화 표시
    document.querySelectorAll('.gm-cat-card').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    // 카드 필터링 (모달 안에서 보이도록)
    const cards = document.querySelectorAll('.gm-card[data-go]');
    cards.forEach(c => {
      if (!c.hasAttribute('data-cat')) assignCardCategory(c);
      const show = (cat === 'all') || (c.getAttribute('data-cat') === cat);
      if (show) c.removeAttribute('data-cat-hidden');
      else c.setAttribute('data-cat-hidden', '1');
    });
    // 빈 상태 안내 숨기기
    const hint = document.getElementById('gm-empty-hint');
    if (hint) hint.style.display = 'none';

    // 🖥️ 모달 오픈 (배경 흐리게 + 카드들을 모달 안에 표시)
    openCatModal(cat, btn);
  };

  function openCatModal(cat, btn) {
    const modal = document.getElementById('gm-cat-modal');
    if (!modal) return;
    const body = document.getElementById('gm-cat-modal-body');
    const titleEl = document.getElementById('gm-cat-modal-title');
    const subEl = document.getElementById('gm-cat-modal-sub');
    const emojiEl = document.getElementById('gm-cat-modal-emoji');

    // 카테고리 카드에서 이름·이모지·색상 추출
    const name = btn ? (btn.querySelector('.cat-name')?.textContent?.trim() || '카테고리') : '메뉴';
    const emoji = btn ? (btn.querySelector('.cat-emoji')?.textContent?.trim() || '🗂') : '🗂';
    const color = btn ? (btn.getAttribute('data-color') || 'mango') : 'mango';

    titleEl.textContent = name;
    emojiEl.textContent = emoji;
    modal.setAttribute('data-cat-color', color);

    // 해당 카테고리 카드들을 모달 body 에 옮기기 (원본 위치 기억)
    const cards = document.querySelectorAll('.gm-card[data-go]');
    const visible = [];
    cards.forEach(c => {
      if (!c.dataset.origParent) c.dataset.origParent = '__gm_cards__';  // 원래 #gm-cards
      if (!c.hasAttribute('data-cat-hidden')) visible.push(c);
    });
    // body 비우고 가시 카드 이동
    body.innerHTML = '';
    visible.forEach(c => body.appendChild(c));

    subEl.textContent = visible.length + (window.getLang && window.getLang() === 'en' ? ' menu items' : '개 메뉴');

    modal.classList.add('show');
    document.body.classList.add('gm-cat-modal-open');
    try { localStorage.setItem('mangoi_gm_cat', cat); } catch(e){}
  }

  window.closeCatModal = function() {
    const modal = document.getElementById('gm-cat-modal');
    const body = document.getElementById('gm-cat-modal-body');
    // 모달 안의 카드들을 원래 위치(#gm-cards)로 복귀
    const origParent = document.getElementById('gm-cards');
    if (origParent && body) {
      Array.from(body.children).forEach(c => {
        c.setAttribute('data-cat-hidden', '1');  // 다시 숨김
        origParent.appendChild(c);
      });
      body.innerHTML = '';
    }
    if (modal) modal.classList.remove('show');
    document.body.classList.remove('gm-cat-modal-open');
    // 카테고리 카드 active 해제
    document.querySelectorAll('.gm-cat-card').forEach(b => b.classList.remove('active'));
    // 빈 안내 다시 표시
    const hint = document.getElementById('gm-empty-hint');
    if (hint) hint.style.display = '';
    try { localStorage.removeItem('mangoi_gm_cat'); } catch(e){}
  };

  // ESC 키로 모달 닫기
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      const modal = document.getElementById('gm-cat-modal');
      if (modal && modal.classList.contains('show')) {
        e.stopPropagation();
        window.closeCatModal();
      }
    }
  });

  // 카테고리별 카드 갯수 계산 + heatmap 강도 + 갯수 표시 갱신
  function updateCategoryCounts() {
    const cards = document.querySelectorAll('.gm-card[data-go]');
    const counts = { all: 0, learn: 0, ai: 0, class: 0, reward: 0, parent: 0, tools: 0 };
    cards.forEach(c => {
      if (!c.hasAttribute('data-cat')) assignCardCategory(c);
      const cat = c.getAttribute('data-cat') || 'tools';
      if (counts[cat] !== undefined) counts[cat]++;
      counts.all++;
    });
    // 최댓값 찾아서 heatmap 강도 정규화
    const max = Math.max(...Object.values(counts).filter(v => v > 0), 1);
    document.querySelectorAll('.gm-cat-card').forEach(b => {
      const cat = b.getAttribute('data-cat');
      const n = counts[cat] || 0;
      const numEl = b.querySelector('[data-count-num]');
      if (numEl) numEl.textContent = n;
      const ratio = n / max;
      // heatmap: 0.35 ~ 1.0 사이로 매핑
      const heat = 0.35 + (ratio * 0.65);
      b.style.setProperty('--heat', heat.toFixed(2));
    });
  }

  // 페이지 로드 후 카드 분류 + 초기 상태: 모든 카드 무조건 숨김
  //   (이전에 저장된 카테고리도 무시 — 매번 빈 상태로 시작)
  function initGmCategory() {
    document.querySelectorAll('.gm-card[data-go]').forEach(c => {
      assignCardCategory(c);
      c.setAttribute('data-cat-hidden', '1');  // 무조건 숨김
    });
    // 모든 카테고리 카드의 active 해제
    document.querySelectorAll('.gm-cat-card').forEach(b => b.classList.remove('active'));
    updateCategoryCounts();
    // 안내 표시 (사용자가 카테고리 카드를 눌러야 카드 표시됨)
    const hint = document.getElementById('gm-empty-hint');
    if (hint) hint.style.display = '';
    // localStorage 의 이전 카테고리 기록은 그냥 무시 (매 진입 시 빈 상태)
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGmCategory);
  } else { initGmCategory(); }

  // 로그인 성공 후 자동 복귀 — mango_user 가 localStorage 에 새로 들어왔는지 감지
  let _lastLoggedIn = isLoggedIn();
  setInterval(() => {
    const now = isLoggedIn();
    if (!_lastLoggedIn && now) {
      // 방금 로그인됨 → 저장된 의도 페이지로 이동
      try {
        const dest = sessionStorage.getItem('mangoi_post_login_redirect');
        if (dest) {
          sessionStorage.removeItem('mangoi_post_login_redirect');
          setTimeout(() => { location.href = dest; }, 400);
        }
      } catch(e){}
    }
    _lastLoggedIn = now;
  }, 500);
})();
