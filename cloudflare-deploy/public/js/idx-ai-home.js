(function(){
  const input = document.getElementById('ai-home-input');
  const mic   = document.getElementById('ai-home-mic');
  const goBtn = document.getElementById('ai-home-go');
  const listening = document.getElementById('ai-home-listening');
  const suggest = document.getElementById('ai-home-suggest');
  if (!input) return;

  // 🔄 검색창 초기화 — 브라우저 자동완성/이전 검색어 강제 제거 (정우영 등 잔존값 방지)
  try { input.value = ''; } catch(e){}
  window.addEventListener('pageshow', () => { try { input.value = ''; } catch(e){} });

  // ========== 키워드 → 액션 룰 (오프라인 fallback) ==========
  const RULES = [
    // ℹ️ 망고아이 소개 (About 오버레이) — 최상단(‘소개’가 특장점보다 먼저 잡히도록)
    { kws:['망고아이란','망고아이 소개','망고아이소개','망고아이에 대해','망고아이 대해','망고아이가 뭐','망고아이 뭐','회사 소개','회사소개','서비스 소개','서비스소개','어떤 곳','about mangoi','mangoi','망고아이','소개'], action: () => { if (typeof window.openAboutMangoi==='function') window.openAboutMangoi(); }, label:'ℹ️ 망고아이 소개' },
    // 🧑‍💼 AI 상담사(아바타 위젯) — ‘상담사’가 신규상담(inquiry)보다 먼저 잡히도록 상단
    { kws:['상담사','ai 상담사','ai상담사','에이아이 상담사','상담 직원','상담직원','아바타 상담','아바타상담','ai 비서','ai비서','인공지능 상담'], action: () => { var w=document.getElementById('mangoi-widget'); if(w) w.click(); }, label:'🧑‍💼 AI 상담사' },
    // 🔐 로그인
    { kws:['로그인','로그 인','login','sign in','로그인하기','접속','내 계정','계정 로그인'], action: () => { if (typeof window.openLoginModal==='function') window.openLoginModal(); }, label:'🔐 로그인' },
    // 🤖 AI와 친구하기 (자기주도학습 오버레이) — 첫 화면 CTA와 동일
    { kws:['ai와 친구하기','ai와친구하기','친구하기','ai랑 놀기','ai 놀이','ai랑 공부','자기주도학습','자기주도 학습','ai 학습 모음','ai랑'], action: () => { if (typeof window.openAiFriendsOverlay==='function') window.openAiFriendsOverlay(); }, label:'🤖 AI와 친구하기' },
    // ═══ 전체메뉴 항목 직접 매칭 (이름 + 유사어) — 최우선 ═══
    // ⚔️ 3D 영어 배틀 (보스전) — 게임류보다 먼저(‘배틀’이 게임에 안 먹히도록)
    { kws:['배틀','영어배틀','영어 배틀','3d 배틀','보스전','보스 배틀','battle','보스몬스터','몬스터 배틀'], action: () => { if (typeof window.openBattleModal==='function') window.openBattleModal(); }, label:'⚔️ 3D 영어 배틀' },
    // 🎮 학생게임 허브 (student-games.html) — "게임"류 요청 최우선 라우팅
    { kws:['학생게임','학생 게임','학생용 게임','게임','게임하기','게임 하기','미니게임','미니 게임','학습게임','학습 게임','영어게임','영어 게임','게임장','게임 하러','게임할래','게임 열어','게임 페이지','오락','놀이','game','games','play game'], action: () => location.href='/student-games.html', label:'🎮 학생게임' },
    // 📔 AI 음성 일기
    { kws:['음성일기','음성 일기','ai 일기','ai일기','영어일기','영어 일기','일기','다이어리','voice diary','diary'], action: () => { if (typeof window.openVoiceDiaryModal==='function') window.openVoiceDiaryModal(); }, label:'📔 AI 음성 일기' },
    // 🎯 학습 목표
    { kws:['학습목표','학습 목표','내 목표','목표','목표설정','목표 설정','goal','goals','learning goal'], action: () => { if (typeof window.openLearningGoals==='function') window.openLearningGoals(); }, label:'🎯 학습 목표' },
    // 🏆 랭킹 / 리더보드
    { kws:['랭킹','리더보드','순위','랭킹보드','포인트 랭킹','1등','탑10','top10','leaderboard','ranking'], action: () => { if (typeof window.openLeaderboard==='function') window.openLeaderboard(); }, label:'🏆 랭킹·리더보드' },
    { kws:['포인트','포인트상점','포인트 상점','포인트샵','포인트 샵','포인트몰','기프트','기프티콘','기프티쇼','선물','상점','쇼핑','리워드','적립','마일리지','교환','point','points','gift','shop','reward'], action: () => { if (typeof window.showPointsShop==='function') window.showPointsShop(); }, label:'🎁 포인트 상점' },
    { kws:['주간 스케줄','주간스케줄','내 스케줄','내스케줄','스케줄','시간표','주간 시간표','내 수업 일정','수업 일정','일정표','schedule','timetable'], action: () => location.href='/admin/weekly-schedule.html?role=student', label:'📅 내 주간 스케줄' },
    { kws:['학생관리','학생 관리','학생목록','학생 목록','학생리스트','학생 명단','반 학생','students'], action: () => location.href='/admin/students.html', label:'👨‍🎓 학생 관리' },
    { kws:['수업자료','수업 자료','학습자료','학습 자료','강의자료','수업 교재','수업노트','materials'], action: () => location.href='/lessons.html', label:'📖 수업 자료' },
    { kws:['평가서','월말평가','월간평가','평가 결과','평가결과','evaluation'], action: () => location.href='/eval.html', label:'📝 평가서' },
    { kws:['리포트','학습리포트','학습 리포트','월간리포트','분석 리포트','report'], action: () => location.href='/report.html', label:'📊 리포트' },
    { kws:['ai 친구','ai친구','인공지능 친구','영어 친구','대화 연습','챗봇','ai friend','chatbot'], action: () => location.href='/ai-friend.html', label:'🤖 AI 친구' },
    { kws:['ai 작문','ai작문','영작','영작문','작문 첨삭','글쓰기','ai write','writing'], action: () => location.href='/ai-write.html', label:'✍ AI 작문' },
    { kws:['영어 발음 코치','영어발음코치','영어 발음 연습'], action: () => location.href='/speech-coach.html', label:'🗣 영어 발음 코치' },
    { kws:['단어장','단어 장','내 단어장','어휘장','어휘','vocab','vocabulary','word list'], action: () => location.href='/vocab.html', label:'📖 단어장' },
    { kws:['복습퀴즈','복습 퀴즈','선생님 퀴즈','리뷰 퀴즈','review quiz'], action: () => location.href='/review-quiz.html', label:'🧠 복습퀴즈' },
    { kws:['미니 퀴즈','미니퀴즈','퀴즈','단어 퀴즈','쪽지시험','quiz'], action: () => location.href='/micro-quiz.html', label:'🎯 미니 퀴즈' },
    { kws:['mbti 매칭','mbti매칭','엠비티아이 매칭','강사 매칭','성향 매칭','mbti match'], action: () => location.href='/mbti.html', label:'🧠 MBTI 매칭' },
    { kws:['mbti 테스트','mbti테스트','엠비티아이 테스트','성향 테스트','성격 테스트','mbti test'], action: () => location.href='/mbti-test.html', label:'🧪 MBTI 테스트' },
    { kws:['연속 출석','연속출석','출석','출석체크','출석 체크','스트릭','데일리 출석','streak','attendance'], action: () => location.href='/streak.html', label:'🔥 연속 출석' },
    { kws:['칭찬 스티커','칭찬스티커','칭찬','스티커','교사 칭찬','선생님 칭찬','별점','praise','sticker'], action: () => location.href='/teacher-praise.html', label:'🌟 칭찬 스티커' },
    { kws:['학부모','학부모 페이지','부모','자녀 보기','자녀보기','parent'], action: () => location.href='/parent.html', label:'👨‍👩‍👧 학부모 페이지' },
    { kws:['시스템 진단','시스템진단','상태 점검','헬스체크','health'], action: () => location.href='/admin/health.html', label:'🩺 시스템 진단' },
    // 수업입장 (구 화상통화)
    { kws: ['수업입장', '수업 입장', '입장', '수업 시작', '수업시작', '화상통화', '화상 통화', '비디오', 'video', '다자간', '그룹수업', '그룹 수업', '클래스', 'class', '강의실', '들어가기', '링크', '링크 연결', '공부시작', '공부 시작', '화상수업 로비', '방 들어가기'], action: () => showView('view-videocall-lobby'), label: '🎥 수업입장' },
    { kws: ['결제', '결제하기', '강의료', '수강료', '학원비', '등록금', '학비', '수업료', '월회비', '레슨비', '교육비', '등록비', '돈', '금액', '가격', '비용', '카드', '충전', '납부', 'payment', 'pay', 'tuition'], action: () => { if (window.gridActions && typeof window.gridActions.payment === 'function') window.gridActions.payment(); }, label: '💳 수강료 결제' },
    { kws: ['연기', '변경', '수업 연기', '수업연기', '스케줄 변경', '날짜 변경', '시간 변경', '시간 바꿈', '미루기', '일정 변경', '오늘 수업 패스', '수업 취소', '수업취소'], action: () => { if (typeof window.openLessonChangeModal === 'function') window.openLessonChangeModal(); }, label: '📅 연기/변경' },
    // 홈페이지 (구 1:1 통화) → 그리드 메뉴 표시
    { kws: ['홈페이지', '홈페', 'homepage', 'home', '메인', '처음'], action: () => { if (window.openAllMenuOverlay) window.openAllMenuOverlay(); }, label: '🏠 홈페이지 (전체 메뉴)' },
    // 관리자
    { kws: ['관리자', '대시보드', 'admin', 'dashboard'], action: () => location.href = '/admin.html', label: '📊 관리자 대시보드' },
    // 신규상담
    { kws: ['신규상담', '신규 상담', '상담', '상담신청', '상담 신청', '문의', '문의하기', '가입 문의', '가입문의', '첫 방문', '전화상담', '연락', 'inquiry', 'consult', '컨설팅'], action: () => window.openInquiryModal(), label: '💬 신규상담' },
    // 발음연습 (영어)
    { kws: ['발음', '발음연습', '발음 연습', '발음교정', '발음 교정', '발음테스트', '발음 체크', '영어발음', 'pronunciation', '스피치', 'speech', '스피킹', '말하기', '말하기 연습'], action: () => window.gridActions && window.gridActions.speech(), label: '🎤 영어 발음 코치 (AI 발음 평가)' },
    // ph157: 중국어 발음 코치
    { kws: ['중국어', '중국어발음', '중국어 발음', '중국어발음코치', 'chinese', 'mandarin', '다락원', 'darakwon', 'cn voice', '병음', 'pinyin'], action: () => location.href = '/speech-coach-cn.html', label: '🇨🇳 중국어 발음 코치 (다락원 마스터 + Lv 1~20)' },
    // ph178: 수업 신청 (시간·교사 선택 → 결제)
    { kws: ['수업신청', '수업 신청', '예약', '신청하기', '시간 선택', '교사 선택', 'book', 'booking', 'lesson booking'], action: () => location.href = '/lesson-booking-demo.html', label: '📝 수업 신청 (시간·교사 → 결제)' },
    // ph158: 교재 업로더 (폴더 드래그 → AI 자동 분류)
    { kws: ['교재', '교재업로더', '교재 업로더', '교재 폴더', '교재폴더', '폴더 업로드', '폴더업로드', '자동 분류', '자동분류', '교과서', 'textbook', 'upload', 'classify'], action: () => location.href = '/textbook-uploader.html', label: '📚 교재 업로더 (폴더 드래그 → AI 자동 분류)' },
    // ph158: 교재 뷰어 (단독 진입은 라이브러리 통해)
    { kws: ['교재보기', '교재 보기', '교재뷰어', '교재 뷰어', 'viewer', 'textbook viewer'], action: () => location.href = '/textbook-uploader.html', label: '📖 교재 라이브러리 (보기)' },
    // 학생 페이지들
    { kws: ['마이페이지', 'my page', 'mypage', '내정보', '내 정보', '프로필'], action: () => location.href = '/parent.html', label: '👤 마이페이지' },

    // ═══ 그리드 카드 자동 매칭 (히트맵 메뉴 20개) ═══
    { kws: ['특장점', '특징', '장점', '왜 망고', '왜 망고아이', '망고아이 특장점', '소개', 'features'], action: () => window.gridActions && window.gridActions.features(), label: '🌟 망고아이 특장점' },
    { kws: ['교육과정', '커리큘럼', 'curriculum', 'cefr', '학습 코스'], action: () => window.gridActions && window.gridActions.curriculum(), label: '📚 교육과정' },
    { kws: ['수강신청', '수강 신청', '등록', '신청', 'enroll', '회원가입'], action: () => window.gridActions && window.gridActions.enroll(), label: '📝 수강신청' },
    { kws: ['무료체험', '무료 체험', 'trial', '체험', '체험 수업', '시범 수업'], action: () => window.gridActions && window.gridActions.trial(), label: '🎁 무료체험' },
    { kws: ['faq', '자주 묻는 질문', '자주묻는질문', '자주 묻는', 'q&a', 'qa'], action: () => window.gridActions && window.gridActions.faq(), label: '❓ 자주 묻는 질문' },
    { kws: ['레벨테스트', '레벨 테스트', 'level test', '실력 테스트', '진단 테스트'], action: () => window.gridActions && window.gridActions.leveltest(), label: '📊 레벨테스트' },
    { kws: ['강사', '강사 소개', 'teacher', '선생', '선생님', '원어민'], action: () => window.gridActions && window.gridActions.teachers(), label: '👨‍🏫 강사 소개' },
    { kws: ['후기', '수업 후기', '리뷰', 'review', '수강 후기', '학부모 후기'], action: () => window.gridActions && window.gridActions.reviews(), label: '⭐ 수업 후기' },
    { kws: ['자가진단', '자가 진단', '진단', '카메라 테스트', '마이크 테스트', '시스템 점검'], action: () => window.gridActions && window.gridActions.diagnosis(), label: '🩺 자가진단' },
    { kws: ['카톡', '카카오', 'kakao', '카톡상담', '1:1 상담', '실시간 상담'], action: () => window.gridActions && window.gridActions.kakao(), label: '💬 1:1 카톡상담' },
    { kws: ['원격', 'pc원격', 'pc 원격', '원격지원', 'anydesk', '리모트', '원격 도움'], action: () => window.gridActions && window.gridActions.remote(), label: '💻 PC원격지원' },
    { kws: ['프로그램 설치', '설치', '설치 방법', 'install', '설치가이드'], action: () => window.gridActions && window.gridActions.installguide(), label: '⚙️ 프로그램 설치' },
    { kws: ['자료실', '자료', '교재', '다운로드', 'library', '교재 자료'], action: () => window.gridActions && window.gridActions.library(), label: '📁 자료실' },
    { kws: ['학습 가이드', '학습법', '공부법', '가이드', '학습 방법'], action: () => window.gridActions && window.gridActions.learnguide(), label: '🎓 학습 가이드' },
    { kws: ['이벤트', '혜택', 'event', '프로모션', '쿠폰', '할인'], action: () => window.gridActions && window.gridActions.event(), label: '🎉 이벤트·혜택' },
    { kws: ['고객센터', '연락처', '전화', 'contact', '문의처', '전화번호'], action: () => window.gridActions && window.gridActions.contact(), label: '☎️ 고객센터' },
    { kws: ['가맹점', '가맹', 'b2b', '제휴', 'franchise', '파트너', '대리점'], action: () => window.gridActions && window.gridActions.franchise(), label: '🏢 가맹점 문의' },
    { kws: ['콜센터', '현지 콜센터', '필리핀', '미국 지사', '영국 지사', '글로벌 연락처'], action: () => window.gridActions && window.gridActions.callcenter(), label: '🌏 현지 콜센터' },
    { kws: ['비디오 레슨', '원어민 수업비디오', '원어민 비디오', '강의 영상', 'vod'], action: () => window.gridActions && window.gridActions.videolesson(), label: '🎬 비디오 레슨' },
    { kws: ['녹화본', '녹화본 복습', '녹화 복습', '지난수업 녹화', '지난 수업', '다시보기', '녹화 보기', 'replay', 'recording'], action: () => window.gridActions && window.gridActions.recordings(), label: '📼 녹화본 복습' },
    { kws: ['집중도', '집중도 측정', '집중력', '시선 추적', '발화 비율', 'focus', 'attention', 'gaze', '아이트래킹'], action: () => window.gridActions && window.gridActions.focus(), label: '🎯 집중도 측정' },
    { kws: ['결제', '결제하기', '수강료', '결제 신청', 'payment', '결제 신청서', '결제폼'], action: () => window.gridActions && window.gridActions.payment(), label: '💳 결제하기' },
    { kws: ['공지', '공지사항', '알림', '소식', '뉴스', 'notice', '공지글'], action: () => window.gridActions && window.gridActions.notice(), label: '📢 공지사항' },
    { kws: ['평가표', '평가', '성적표', '성적', '점수', '시험점수', '테스트결과', '결과', '피드백', '내 성적', '일별평가서', '일별 평가', 'report', '리포트', '수업 평가', '리뷰표'], action: () => window.gridActions && window.gridActions.report(), label: '📋 평가표' },
    { kws: ['전체 메뉴', '전체메뉴', '메뉴', '모든 메뉴', '히트맵', '바로가기'], action: () => { if (window.openAllMenuOverlay) window.openAllMenuOverlay(); }, label: '🥭 전체 메뉴' },
    // 메인
  ];

  // ========== 지식 FAQ (정보성 질문 즉답 — 오프라인·무지연) ==========
  // 서버 STUDENT_FAQ 와 동일 취지. 답변을 말풍선으로 보여주고, 관련 모달을 함께 연다(페이지 이동 없이 답이 유지되도록 모달 위주).
  const FAQ = [
    { kws:['수업료','수강료','학원비','레슨비','얼마','가격','비용','요금','금액'],
      answer:'필리핀 현지 교육센터를 직접 운영해 거품을 뺀 합리적인 수강료예요. 1:1·1:2 중 선택할 수 있고, 1:2는 1인당 비용이 더 저렴해요. 정확한 금액은 무료 상담으로 맞춤 견적을 받아보세요.',
      go:() => { if (window.openInquiryModal) window.openInquiryModal(); } },
    { kws:['몇 살','몇살','나이','연령','대상','유아','유치원','초등','성인','어른'],
      answer:'유아부터 성인까지, 연령과 레벨에 맞춰 CEFR 국제 기준의 단계별 커리큘럼으로 수업해요. 무료 레벨테스트로 지금 실력에 맞는 반을 추천해 드려요.',
      go:() => window.gridActions && window.gridActions.leveltest && window.gridActions.leveltest() },
    { kws:['1:1','일대일','1대1','1:2','일대이','1대2','소수정예','전담','수업 방식','수업방식','몇 명','원어민'],
      answer:'검증된 원어민 전담 선생님과 1:1 또는 1:2 소수정예 화상수업으로 진행해요. 랜덤 매칭이 아니라 같은 선생님이 꾸준히 관리해 아이의 성향과 약점을 정확히 지도합니다.',
      go:() => window.gridActions && window.gridActions.teachers && window.gridActions.teachers() },
    { kws:['필리핀','현지','센터','어느 나라'],
      answer:'외주가 아니라 망고아이가 직접 운영하는 필리핀 현지 교육센터에서 수업해요. 전용 인터넷·장비를 갖춘 안정적인 환경에서 정규직 원어민 교사가 책임지고 지도합니다.',
      go:() => { if (window.openAboutMangoi) window.openAboutMangoi(); } },
    { kws:['교재','커리큘럼','무엇을 배','무슨 내용','어떤 내용'],
      answer:'연령과 레벨에 맞춘 자체 교재와 CEFR 기반 커리큘럼으로 학습해요. 아이가 흥미를 느끼는 실생활 주제로 구성해 스스로 말하고 싶게 만듭니다.',
      go:() => window.gridActions && window.gridActions.curriculum && window.gridActions.curriculum() },
    { kws:['환불','중도 해지','해지'],
      answer:'수강 변경·환불 등 자세한 안내는 상담으로 도와드려요. 아래 상담 신청 또는 고객센터로 문의해 주세요.',
      go:() => { if (window.openInquiryModal) window.openInquiryModal(); } },
    { kws:['앱','어플','설치','핸드폰','휴대폰','모바일','태블릿','기기'],
      answer:'PC·태블릿·휴대폰 어디서나 수업에 입장할 수 있어요. 카메라와 마이크만 있으면 되고, 준비 상태는 자가진단으로 미리 확인할 수 있어요.',
      go:() => window.gridActions && window.gridActions.diagnosis && window.gridActions.diagnosis() },
  ];
  // 질문형(정보를 물음)일 때만 FAQ 우선. 명령형("발음연습")은 기존 RULES 이동이 우선.
  const QUESTION_RE = /(뭐|무엇|무슨|어떤|어떻게|왜|얼마|몇|어디|언제|누구|있나|있어|되나|되요|하나요|인가요|일까|까요|궁금|알려|설명|차이|추천|\?|？)/;
  function findFaq(text) {
    const t = normText(text);
    const sq = t.replace(/\s+/g, '');
    for (const f of FAQ) { if (f.kws.some(k => { const kk = k.toLowerCase(); return t.includes(kk) || sq.includes(kk.replace(/\s+/g, '')); })) return f; }
    return null;
  }

  const QUICK_MAP = {
    'enter-class':   () => showView('view-videocall-lobby'),
    'lesson-change': () => { if (typeof window.openLessonChangeModal === 'function') window.openLessonChangeModal(); },
    'homepage':      () => { if (window.openAllMenuOverlay) window.openAllMenuOverlay(); },
    'inquiry':       () => window.openInquiryModal(),
    'trial':         () => window.openInquiryModal(),
    'enroll':        () => window.openInquiryModal(),
    'speech':        () => { location.href = '/speech-coach.html'; },
    'mypage':        () => location.href = '/parent.html',
    'admin':         () => location.href = '/admin.html',
    'payment':       () => { if (window.gridActions && typeof window.gridActions.payment === 'function') window.gridActions.payment(); else alert('결제 기능을 불러올 수 없습니다.'); },
  };

  // 서버 응답 d.run → 화이트리스트 함수만 실행 (임의 코드 실행 방지)
  function runWhitelisted(name) {
    try {
      if (!name) return;
      if (name.indexOf('grid:') === 0) {
        var k = name.slice(5);
        if (window.gridActions && typeof window.gridActions[k] === 'function') return window.gridActions[k]();
        return;
      }
      var MAP = {
        showPointsShop:        function(){ if (typeof window.showPointsShop === 'function') window.showPointsShop(); },
        openAllMenuOverlay:    function(){ if (typeof window.openAllMenuOverlay === 'function') window.openAllMenuOverlay(); },
        openInquiryModal:      function(){ if (typeof window.openInquiryModal === 'function') window.openInquiryModal(); },
        openLessonChangeModal: function(){ if (typeof window.openLessonChangeModal === 'function') window.openLessonChangeModal(); },
        openAboutMangoi:       function(){ if (typeof window.openAboutMangoi === 'function') window.openAboutMangoi(); },
        openLoginModal:        function(){ if (typeof window.openLoginModal === 'function') window.openLoginModal(); },
        openAiFriendsOverlay:  function(){ if (typeof window.openAiFriendsOverlay === 'function') window.openAiFriendsOverlay(); },
        openAiConsultant:      function(){ var w=document.getElementById('mangoi-widget'); if(w) w.click(); },
        openBattleModal:       function(){ if (typeof window.openBattleModal === 'function') window.openBattleModal(); },
        openVoiceDiaryModal:   function(){ if (typeof window.openVoiceDiaryModal === 'function') window.openVoiceDiaryModal(); },
        openLearningGoals:     function(){ if (typeof window.openLearningGoals === 'function') window.openLearningGoals(); },
        openLeaderboard:       function(){ if (typeof window.openLeaderboard === 'function') window.openLeaderboard(); }
      };
      if (MAP[name]) return MAP[name]();
    } catch (e) { console.warn('[ai-home] runWhitelisted err:', name, e); }
  }

  // ══════════════════════════════════════════════════════════════
  // 🔎 이해력 강화 레이어 — ① 정규화 사전(음성인식·오타 교정) ② 한글 자모 퍼지 매칭
  //    음성인식이 "망고아이"를 "마구아예"로 잘못 받아써도, 오타를 쳐도 최대한 알아듣게.
  // ══════════════════════════════════════════════════════════════
  // ① 정규화 사전 — 자주 틀리는 발음/표기를 표준어로 치환 (브랜드명·핵심 메뉴어)
  const NORMALIZE = [
    // 브랜드명 '망고아이' 오인식 총망라
    [/(망\s?고\s?아\s?이|마고아이|만고아이|망구아이|마구아이|맹고아이|망고아리|마구아예|마구아이|망가아이|맨고아이|먕고아이|망꼬아이|mango\s?ai|mangoi|mango\s?eye|mango\s?i)/g, '망고아이'],
    // 핵심 메뉴어 흔한 오인식
    [/(수업\s?입장|수업\s?잃장|수업\s?이잠|수업\s?이장)/g, '수업입장'],
    [/(발음\s?연십|바름연습|발음\s?년습|바름\s?연습)/g, '발음연습'],
    [/(단어\s?자앙|다너장|단어\s?짱)/g, '단어장'],
    [/(복습\s?퀴이즈|복습\s?퀴즈|복습퀴즈)/g, '복습퀴즈'],
    [/(포\s?인\s?트|포인또|포인뜨)/g, '포인트'],
  ];
  function normText(text) {
    let t = (text || '').toLowerCase().trim();
    for (const pair of NORMALIZE) t = t.replace(pair[0], pair[1]);
    return t.replace(/\s+/g, ' ').trim();
  }

  // ② 한글 → 자모(초·중·종성) 분해: "망고아이" → "ㅁㅏㅇㄱㅗㅇㅏㅇㅣ"
  const _CHO  = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  const _JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
  const _JONG = ' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ';
  function jamo(str) {
    let o = '';
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      if (c >= 0xAC00 && c <= 0xD7A3) {
        const s = c - 0xAC00;
        o += _CHO[Math.floor(s / 588)] + _JUNG[Math.floor((s % 588) / 28)];
        const j = s % 28; if (j) o += _JONG[j];
      } else if (c > 32) { o += str[i]; }
    }
    return o;
  }
  function _lev(a, b) {
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    let prev = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[n];
  }
  // needle(자모)이 haystack(자모) 안에 근사 등장하는 최대 유사도 0~1
  function jamoSim(hay, needle) {
    const nl = needle.length;
    if (nl < 4) return 0;                       // 너무 짧은 키워드는 오탐 위험 → 퍼지 제외
    const hl = hay.length;
    if (hl < nl) return 1 - _lev(hay, needle) / nl;
    let best = 0;
    for (let w = Math.max(3, nl - 2); w <= nl + 2 && w <= hl; w++) {
      for (let i = 0; i + w <= hl; i++) {
        const sim = 1 - _lev(hay.substr(i, w), needle) / Math.max(w, nl);
        if (sim > best) { best = sim; if (best >= 0.999) return 1; }
      }
    }
    return best;
  }

  // 정규화 + (공백무시) 부분일치. RULES 첫 매칭 반환.
  function findRule(text) {
    const t = normText(text);
    if (!t) return null;
    const sq = t.replace(/\s+/g, '');
    for (const r of RULES) {
      for (const k of r.kws) {
        const kk = k.toLowerCase();
        if (t.includes(kk) || sq.includes(kk.replace(/\s+/g, ''))) return r;
      }
    }
    return null;
  }
  // 정확 매칭 실패 시 자모 퍼지로 가장 가까운 RULE (제출 시에만 호출)
  function fuzzyFindRule(text) {
    const ij = jamo(normText(text).replace(/\s+/g, ''));
    if (ij.length < 4) return null;
    let best = null, bestSim = 0.80;            // 임계값(높게 유지해 오탐 방지)
    for (const r of RULES) {
      for (const k of r.kws) {
        const kj = jamo(k.toLowerCase().replace(/\s+/g, ''));
        const sim = jamoSim(ij, kj);
        if (sim > bestSim) { best = r; bestSim = sim; if (sim >= 0.97) return r; }
      }
    }
    return best;
  }
  // 완전 실패 시 "이런 걸 찾으셨나요?" 후보 — 임계값 낮춰(≥0.5) 근접 메뉴 상위 N개
  function topFuzzyRules(text, n) {
    const ij = jamo(normText(text).replace(/\s+/g, ''));
    if (ij.length < 3) return [];
    const scored = [];
    for (const r of RULES) {
      let best = 0;
      for (const k of r.kws) { const s = jamoSim(ij, jamo(k.toLowerCase().replace(/\s+/g, ''))); if (s > best) best = s; }
      if (best >= 0.5) scored.push({ r: r, s: best });
    }
    scored.sort((a, b) => b.s - a.s);
    const seen = new Set(), out = [];
    for (const x of scored) { if (seen.has(x.r.label)) continue; seen.add(x.r.label); out.push(x.r); if (out.length >= (n || 3)) break; }
    return out;
  }
  // 후보 목록을 클릭 가능한 추천 버튼 HTML 로 렌더
  function suggestButtonsHtml(rules, headline) {
    _sgMatches = rules.slice();
    return '<div class="ai-sg-head">' + (headline || '💡 이런 걸 찾으셨나요? — 눌러서 이동') + '</div>' +
      rules.map((m, i) => `<button type="button" class="ai-sg-item" data-sg="${i}">${m.label}</button>`).join('');
  }

  function showSuggest(html, autoHide) {
    suggest.innerHTML = html;
    suggest.style.display = 'block';
    if (autoHide) setTimeout(() => { suggest.style.display = 'none'; }, 3000);
  }

  // 실패 시 → 근접 메뉴 추천 버튼(클릭 이동). 후보 없으면 기본 안내.
  function showFailWithSuggest(text, leadMsg) {
    const cands = topFuzzyRules(text, 4);
    if (cands.length) {
      showSuggest((leadMsg ? ('<div style="margin-bottom:6px;color:#e2e8f0">' + leadMsg + '</div>') : '') + suggestButtonsHtml(cands, '💡 혹시 이 메뉴인가요? — 눌러서 이동'));
    } else {
      showSuggest(leadMsg || '💡 이해하지 못했어요. <br><small style="color:#94a3b8">"수업입장 · 발음연습 · 단어장 · 게임 · 전체 메뉴" 처럼 말해 보세요.</small>');
    }
  }

  // 인사/도움말 → 대표 메뉴 빠른 목록 (첫 사용자가 무엇을 할 수 있는지 바로 파악)
  const GREET_HELP_RE = /^(안녕|하이|반가|헬로|hello|hi|hey|도와|도움|도움말|help|뭐\s*할|뭐\s*있|무엇을|메뉴\s*(뭐|알려|보여)|메뉴판|기능|사용법|어떻게\s*(써|사용|해))/i;
  function popularQuickList() {
    return [
      { label: '🎥 수업 입장', action: () => showView('view-videocall-lobby') },
      { label: '🎮 학생게임', action: () => location.href = '/student-games.html' },
      { label: '📖 단어장', action: () => location.href = '/vocab.html' },
      { label: '🗣 발음연습', action: () => location.href = '/speech-coach.html' },
      { label: '🧠 복습퀴즈', action: () => location.href = '/review-quiz.html' },
      { label: '📊 성적표·리포트', action: () => location.href = '/report.html' },
      { label: '🎁 포인트 상점', action: () => { if (window.showPointsShop) window.showPointsShop(); } },
      { label: '💬 신규상담·체험', action: () => { if (window.openInquiryModal) window.openInquiryModal(); } },
      { label: '🥭 전체 메뉴', action: () => { if (window.openAllMenuOverlay) window.openAllMenuOverlay(); } }
    ];
  }

  // ========== 메인 처리 함수 ==========
  async function handleQuery(text) {
    if (!text || !text.trim()) return;
    text = text.trim();

    // 0-a. 인사·도움말 → 대표 기능을 눌러서 바로 가도록 안내
    if (GREET_HELP_RE.test(text.toLowerCase())) {
      showSuggest(suggestButtonsHtml(popularQuickList(), '🥭 안녕하세요! 무엇을 도와드릴까요? — 아래에서 골라보세요'));
      return;
    }

    const isQuestion = QUESTION_RE.test(text);

    // 0. 질문형("~얼마?/몇 살?/필리핀?")이면 지식 FAQ 즉답 + 관련 모달 (페이지 이동 없이 답 유지)
    if (isQuestion) {
      const faq = findFaq(text);
      if (faq) {
        showSuggest(`💬 ${faq.answer}`);
        try { if (window.MangoAvatar && window.MangoAvatar.speak) window.MangoAvatar.speak(faq.answer); } catch(_){}
        if (faq.go) setTimeout(faq.go, 900);
        return;
      }
    }

    // 1. 로컬 룰로 즉시 매칭 (메뉴 이동)
    const rule = findRule(text);
    if (rule) {
      showSuggest(`<b>${rule.label}</b> 으로 이동합니다...`, true);
      setTimeout(rule.action, 400);
      return;
    }

    // 1-a. 명령형인데 룰엔 없지만 FAQ 주제면 즉답 (예: "가격", "환불")
    {
      const faq = findFaq(text);
      if (faq) {
        showSuggest(`💬 ${faq.answer}`);
        try { if (window.MangoAvatar && window.MangoAvatar.speak) window.MangoAvatar.speak(faq.answer); } catch(_){}
        if (faq.go) setTimeout(faq.go, 900);
        return;
      }
    }

    // 1-b. 학생 이름(한글 2~4자) → 내 이름이면 마이페이지, 다른 이름이면 학생 정보 검색
    if (/^[가-힣]{2,4}$/.test(text)) {
      var _myName = '';
      try {
        var _u = JSON.parse(localStorage.getItem('mangoi_logged_user') || localStorage.getItem('mango_user') || 'null');
        _myName = (_u && (_u.name || _u.username || '')) || '';
      } catch(e){}
      if (_myName && _myName.replace(/\s/g,'') === text.replace(/\s/g,'')) {
        showSuggest(`<b>👤 ${text} 마이페이지</b> 로 이동합니다...`, true);
        setTimeout(() => { location.href = '/parent.html'; }, 400);
        return;
      }
      // 다른 이름 검색 → 관리자 로그인 상태에서만 관리자 학생검색으로. 방문자/학생은 관리자 페이지로 보내지 않음.
      var _isAdmin = false;
      try { _isAdmin = !!localStorage.getItem('mangoi_admin_session'); } catch(e){}
      if (_isAdmin) {
        showSuggest(`<b>👤 '${text}' 학생 정보</b> 로 이동합니다...`, true);
        setTimeout(() => { location.href = '/admin/students-unified.html?q=' + encodeURIComponent(text); }, 400);
        return;
      }
      // 비관리자: 아래 퍼지 매칭/추천으로 계속 진행 (예: 2~4자 메뉴 오타)
    }

    // 1-c. 정확 매칭 실패 → 자모 퍼지로 오타·음성인식 오류 흡수 (예: "마구아예에 대해"→망고아이 소개)
    {
      const fr = fuzzyFindRule(text);
      if (fr) {
        showSuggest(`<b>${fr.label}</b> 으로 이동합니다...`, true);
        setTimeout(fr.action, 400);
        return;
      }
    }

    // 2. 매칭 안 되면 서버 AI 호출
    showSuggest('🤖 AI가 분석 중입니다…');
    try {
      const r = await fetch('/api/student/ai-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: text })
      });
      if (!r.ok) throw new Error('AI 응답 실패');
      const d = await r.json();

      try { if (window.MangoAvatar && d && d.answer) window.MangoAvatar.speak(d.answer); } catch(_){}

      if (d.intent === 'navigate') {
        showSuggest(`<b>${d.answer || '이동합니다'}</b>`, true);
        setTimeout(() => {
          if (d.run) runWhitelisted(d.run);        // 서버가 지정한 모달/그리드 함수 실행 (결제·포인트상점·전체메뉴 등)
          else if (d.url) location.href = d.url;
          else if (d.external_url) window.open(d.external_url, '_blank');
          else if (d.view) showView(d.view);
        }, 400);
      } else if (d.intent === 'action' && d.name === 'inquiry') {
        showSuggest(`<b>${d.answer || '신규상담 신청 폼을 엽니다.'}</b>`, true);
        setTimeout(() => { if (window.openInquiryModal) window.openInquiryModal(); }, 400);
      } else if (d.intent === 'answer') {
        // 답변을 보여주되, 근접 메뉴가 있으면 추천 버튼도 함께 (막다른 응답 방지)
        const cands = topFuzzyRules(text, 3);
        showSuggest(`💬 ${d.answer || '죄송해요, 잘 모르겠어요.'}` + (cands.length ? '<div style="margin-top:8px">' + suggestButtonsHtml(cands, '↪ 관련 메뉴') + '</div>' : ''));
      } else {
        showFailWithSuggest(text, d.answer ? ('💬 ' + d.answer) : '💬 명령을 이해하지 못했어요.');
      }
    } catch (e) {
      // 서버 없거나 실패 → 근접 메뉴 추천으로 막다른 길 방지
      showFailWithSuggest(text, null);
    }
  }

  // ════════════════════════════════════════════════════════════════
  // 음성 입력 (MediaRecorder → AudioContext 변환 → 16kHz WAV → Whisper)
  // 핵심: Whisper와 100% 호환되는 WAV 포맷으로 직접 변환 후 전송
  // ════════════════════════════════════════════════════════════════
  let mediaRecorder = null;
  let mediaStream = null;
  let recordedChunks = [];
  let recordingStopTimer = null;
  let countdownTimer = null;
  let levelInterval = null;
  let audioCtxLevel = null;
  let analyserNode = null;
  const MAX_RECORD_SEC = 8;

  // ──── AudioBuffer → WAV 16kHz 모노 PCM 변환 ────
  function audioBufferToWav16k(audioBuffer) {
    const targetRate = 16000;
    const numCh = 1; // 모노
    // 리샘플링: 1차 채널만 추출 + 16kHz로
    const srcRate = audioBuffer.sampleRate;
    const srcLen = audioBuffer.length;
    const destLen = Math.floor(srcLen * targetRate / srcRate);
    const src = audioBuffer.getChannelData(0);
    const dest = new Float32Array(destLen);
    for (let i = 0; i < destLen; i++) {
      const idx = i * srcRate / targetRate;
      const lo = Math.floor(idx);
      const hi = Math.min(lo + 1, srcLen - 1);
      const t = idx - lo;
      dest[i] = src[lo] * (1 - t) + src[hi] * t;
    }
    // Float32 → Int16 PCM
    const pcm = new Int16Array(destLen);
    for (let i = 0; i < destLen; i++) {
      const s = Math.max(-1, Math.min(1, dest[i]));
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    // WAV 헤더 + 데이터
    const dataSize = pcm.length * 2;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    const writeStr = (off, str) => { for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i)); };
    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);          // PCM chunk size
    view.setUint16(20, 1, true);           // PCM format
    view.setUint16(22, numCh, true);
    view.setUint32(24, targetRate, true);
    view.setUint32(28, targetRate * numCh * 2, true); // byte rate
    view.setUint16(32, numCh * 2, true);   // block align
    view.setUint16(34, 16, true);          // bits per sample
    writeStr(36, 'data');
    view.setUint32(40, dataSize, true);
    // PCM 데이터
    new Int16Array(buffer, 44).set(pcm);
    return new Blob([buffer], { type: 'audio/wav' });
  }

  // ──── 마이크 시작 ────
  async function startRecording() {
    try {
      // 사용 가능한 마이크 목록 콘솔에 출력 (디버그)
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const mics = devices.filter(d => d.kind === 'audioinput');
        console.log('[voice] 사용 가능 마이크:', mics.map(m => ({ id: m.deviceId.slice(0,8), label: m.label || '(권한 필요)' })));
      } catch {}
      const audioConstraints = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 };
      if (window._nextMicDeviceId) {
        audioConstraints.deviceId = { exact: window._nextMicDeviceId };
        console.log('[voice] 지정 마이크 사용:', window._nextMicDeviceId.slice(0, 12));
        window._nextMicDeviceId = null;
      }
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints
      });
    } catch (e) {
      const name = e?.name || '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        showSuggest('⚠️ 마이크 권한이 필요해요.<br/><small style="color:#94a3b8">주소창 왼쪽 🔒 → 사이트 설정 → 마이크 "허용"으로 바꿔 주세요.</small>');
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        showSuggest('⚠️ 마이크 장치를 찾을 수 없어요.');
      } else {
        showSuggest(`⚠️ 마이크 접근 실패: ${e?.message || name || 'unknown'}`);
      }
      console.error('[voice] getUserMedia error:', e);
      return;
    }

    // 음성 레벨 시각화 (사용자가 마이크 작동 여부 확인 가능)
    try {
      audioCtxLevel = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioCtxLevel.createMediaStreamSource(mediaStream);
      analyserNode = audioCtxLevel.createAnalyser();
      analyserNode.fftSize = 256;
      source.connect(analyserNode);
    } catch (e) { console.warn('[voice] analyser failed', e); }

    // 어떤 마이크가 실제 선택됐는지 디버그 출력
    try {
      const tracks = mediaStream.getAudioTracks();
      tracks.forEach(t => {
        const settings = t.getSettings ? t.getSettings() : {};
        console.log('[voice] ★ 선택된 마이크:', t.label || '(label 없음)',
                    'settings:', settings);
      });
    } catch (e) { console.warn('[voice] track info err:', e); }
    recordedChunks = [];
    let mimeType = '';
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
    for (const t of candidates) {
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) { mimeType = t; break; }
    }
    try {
      mediaRecorder = mimeType ? new MediaRecorder(mediaStream, { mimeType }) : new MediaRecorder(mediaStream);
      console.log('[voice] MediaRecorder mime:', mediaRecorder.mimeType);
    } catch (e) {
      console.error('[voice] MediaRecorder create failed:', e);
      cleanup();
      showSuggest('⚠️ 이 브라우저는 음성 녹음을 지원하지 않아요.');
      return;
    }

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      mic.classList.remove('listening');
      stopLevelMeter();
      const origBlob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
      console.log('[voice] recorded blob:', origBlob.size, 'bytes,', origBlob.type);
      cleanup();
      if (origBlob.size < 1500) {
        listening.style.display = 'none';
        showSuggest('🎙 너무 짧거나 무음이에요. 마이크에 가까이서 1-2초 이상 말씀해 주세요.', true);
        return;
      }

      // ─── 음량 분석 + 게인 부스트 + WAV 변환 (Whisper 호환) ───
      listening.innerHTML = '⚙️ 음성 분석 중... ';
      let wavBlob;
      let audioRMS = 0;
      let audioPeak = 0;
      try {
        const arr = await origBlob.arrayBuffer();
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const audioBuffer = await ctx.decodeAudioData(arr.slice(0));
        console.log('[voice] decoded:', audioBuffer.duration.toFixed(2), 's, ',
                    audioBuffer.sampleRate, 'Hz,', audioBuffer.numberOfChannels, 'ch');

        // RMS (음량 평균) + Peak 계산
        const ch = audioBuffer.getChannelData(0);
        let sumSq = 0;
        for (let i = 0; i < ch.length; i++) {
          const s = ch[i];
          sumSq += s * s;
          if (Math.abs(s) > audioPeak) audioPeak = Math.abs(s);
        }
        audioRMS = Math.sqrt(sumSq / ch.length);
        console.log('[voice] RMS:', audioRMS.toFixed(4), 'Peak:', audioPeak.toFixed(4));

        // 너무 조용하면 즉시 알림 (RMS 0.005 미만 = 사실상 무음)
        if (audioRMS < 0.005) {
          ctx.close();
          listening.style.display = 'none';
          // ★ 자동 마이크 순회: 다른 마이크가 있으면 다음 마이크로 자동 재시도
          try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const mics = devices.filter(d => d.kind === 'audioinput' && d.deviceId);
            const tried = window._micTried || [];
            const usedDeviceId = (mediaRecorder && mediaRecorder.stream && mediaRecorder.stream.getAudioTracks()[0] && mediaRecorder.stream.getAudioTracks()[0].getSettings) ? mediaRecorder.stream.getAudioTracks()[0].getSettings().deviceId : '';
            tried.push(usedDeviceId);
            window._micTried = tried;
            const next = mics.find(m => !tried.includes(m.deviceId));
            if (next) {
              window._nextMicDeviceId = next.deviceId;
              const usedLabel = (mics.find(m => m.deviceId === usedDeviceId) || {}).label || '(알 수 없음)';
              const ok = confirm(
                '🚨 현재 마이크가 무음 상태 (RMS: ' + audioRMS.toFixed(4) + ')\n\n' +
                '다른 마이크로 자동 시도할까요?\n\n' +
                '방금 시도: ' + usedLabel + '\n' +
                '다음 시도: ' + (next.label || '(이름 없음)') + '\n\n' +
                '[확인] 다음 마이크로 즉시 재시도\n[취소] 중단'
              );
              if (ok) {
                setTimeout(function(){ mic.click(); }, 300);
                return;
              }
            } else {
              window._micTried = [];
              const list = mics.map(function(m, i){ return (i+1) + '. ' + (m.label || '(이름 없음)'); }).join('\n');
              alert(
                '🚨 모든 마이크 시도 완료, 모두 무음 상태\n\n' +
                '시도한 마이크 (' + mics.length + '개):\n' + list + '\n\n' +
                '[해결]\n' +
                '1. Win+I → 시스템 → 소리 → 입력 → 마이크 테스트\n' +
                '   막대가 안 움직이면 모든 마이크가 죽어있음\n' +
                '2. 마이크 속성 → 수준 100% + 부스트 +30dB\n' +
                '3. 마이크 향상 → 잡음 억제 OFF\n' +
                '4. 새 USB 마이크 연결\n\n' +
                '또는 검색창에 키보드로 직접 입력 (즉시 작동)'
              );
            }
          } catch (e) { console.warn('[voice] mic enumerate err:', e); }
          showSuggest('⚠️ 마이크가 무음 상태. 다른 마이크로 시도하거나 텍스트로 입력해 주세요.');
          return;
        }

        // ── 게인 자동 부스트 (피크 0.5 미만이면 정규화) ──
        let gain = 1;
        if (audioPeak < 0.95 && audioPeak > 0.0001) {
          gain = Math.min(100, 0.7 / audioPeak);  // 최대 4배까지 부스트
          console.log(`[voice] auto-boost gain: ${gain.toFixed(2)}x (peak ${audioPeak.toFixed(2)} → ${(audioPeak * gain).toFixed(2)})`);
        }

        // 부스트된 AudioBuffer 생성
        const boostedBuf = ctx.createBuffer(1, audioBuffer.length, audioBuffer.sampleRate);
        const boostedCh = boostedBuf.getChannelData(0);
        for (let i = 0; i < ch.length; i++) {
          let v = ch[i] * gain;
          if (v > 1) v = 1;
          if (v < -1) v = -1;
          boostedCh[i] = v;
        }

        wavBlob = audioBufferToWav16k(boostedBuf);
        console.log('[voice] WAV size:', wavBlob.size, 'bytes (gain ' + gain.toFixed(2) + 'x)');
        ctx.close();
      } catch (e) {
        console.error('[voice] WAV 변환 실패:', e);
        listening.style.display = 'none';
        showSuggest(`⚠️ 음성 변환 실패: ${e.message || e}`);
        return;
      }

      // ─── 서버 전송 ───
      listening.innerHTML = '🤖 AI가 음성을 인식하고 있어요...';
      try {
        const fd = new FormData();
        fd.append('audio', wavBlob, 'voice.wav');
        fd.append('original', origBlob, 'voice.webm');  // 원본도 함께 전송 (서버 fallback)
        fd.append('rms', String(audioRMS));
        fd.append('peak', String(audioPeak));
        const t0 = performance.now();
        // 라우트 수정(2026-06-20): /api/student/voice 는 서버에 없어 빈 응답→'Unexpected end of JSON input'.
        //   실제 동작하는 Whisper 엔드포인트 /api/voice/transcribe 로 호출.
        const r = await fetch('/api/voice/transcribe', { method: 'POST', body: fd, credentials: 'include' });
        // 방어 파싱: 빈 본문/HTML 응답이어도 JSON 파싱 예외로 죽지 않도록 text 먼저 읽고 안전 처리(모바일 대응).
        const raw = await r.text();
        let d;
        try { d = raw ? JSON.parse(raw) : {}; } catch (_) { d = {}; }
        if (typeof d !== 'object' || d === null) d = {};
        if (!d.ok && !d.text) {
          d.ok = false;
          if (!d.error) d.error = r.ok ? '서버가 빈 응답을 보냈어요' : ('서버 오류 ' + r.status);
        } else if (d.text && d.ok === undefined) {
          d.ok = true;
        }
        const ms = Math.round(performance.now() - t0);
        listening.style.display = 'none';
        console.log('[voice] response (' + ms + 'ms):', d);
        // 콘솔에서 펼쳐서 보기 쉽도록 별도 표
        console.table(d.debug?.attempts || d.debug?.attempts_summary || [{ ok: d.ok, text: d.text, error: d.error }]);

        if (!d.ok) {
          // 실패 시 alert로 진짜 원인 명확히 표시 (디버그 모드)
          const debug = d.debug ? '\n\n[디버그 정보]\n' + JSON.stringify(d.debug, null, 2) : '';
          alert('⚠️ 음성 인식 실패\n\n오류: ' + (d.error || 'unknown') + debug + '\n\n→ 텍스트로 직접 입력해 주세요.');
          showSuggest(`⚠️ ${d.error || '음성 인식 실패'} — 텍스트로 입력해 보세요.`);
          return;
        }
        // 성공 — 사용한 모델도 표시
        input.value = d.text;
        const modelName = d.model ? ` <small style="opacity:.7">(${d.model.split('/').pop()})</small>` : '';
        showSuggest(`🎤 "<b>${d.text}</b>"${modelName} 처리 중...`, true);
        setTimeout(() => handleQuery(d.text), 500);
      } catch (e) {
        listening.style.display = 'none';
        console.error('[voice] fetch failed:', e);
        alert('⚠️ 음성 전송 실패\n\n' + (e.message || e) + '\n\n네트워크 또는 서버 문제일 수 있어요.');
        showSuggest(`⚠️ 음성 전송 실패: ${e.message || e}`);
      }
    };

    mediaRecorder.onerror = (ev) => {
      console.error('[voice] MediaRecorder error:', ev);
      cleanup();
      listening.style.display = 'none';
      showSuggest(`⚠️ 녹음 오류 — 다시 시도해 주세요.`);
    };

    // 녹음 시작
    mediaRecorder.start();
    mic.classList.add('listening');
    listening.style.display = 'block';
    listening.innerHTML = `🎙 듣고 있어요... <b id="rec-countdown">${MAX_RECORD_SEC}</b>초 <span id="rec-level" style="display:inline-block;width:60px;height:6px;background:#374151;border-radius:3px;vertical-align:middle;overflow:hidden;margin-left:10px"><span id="rec-level-bar" style="display:block;height:100%;width:0%;background:linear-gradient(to right,#10b981,#fbbf24,#ef4444);transition:width 0.08s"></span></span>`;

    // 카운트다운
    let remain = MAX_RECORD_SEC;
    countdownTimer = setInterval(() => {
      remain--;
      const cd = document.getElementById('rec-countdown');
      if (cd) cd.textContent = remain;
      if (remain <= 0) clearInterval(countdownTimer);
    }, 1000);

    // 음성 레벨 미터 (실시간 마이크 작동 확인)
    if (analyserNode) {
      const buf = new Uint8Array(analyserNode.frequencyBinCount);
      let maxLevel = 0;
      levelInterval = setInterval(() => {
        analyserNode.getByteTimeDomainData(buf);
        let peak = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = Math.abs(buf[i] - 128);
          if (v > peak) peak = v;
        }
        const pct = Math.min(100, peak * 1.5);
        if (pct > maxLevel) maxLevel = pct;
        const bar = document.getElementById('rec-level-bar');
        if (bar) bar.style.width = pct + '%';
      }, 80);
    }

    // 자동 종료
    recordingStopTimer = setTimeout(() => {
      stopRecording();
    }, MAX_RECORD_SEC * 1000);
  }

  function stopLevelMeter() {
    if (levelInterval) { clearInterval(levelInterval); levelInterval = null; }
    if (audioCtxLevel) { try { audioCtxLevel.close(); } catch {} audioCtxLevel = null; }
    analyserNode = null;
  }

  function stopRecording() {
    if (recordingStopTimer) { clearTimeout(recordingStopTimer); recordingStopTimer = null; }
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try { mediaRecorder.stop(); } catch {}
    }
  }
  function cleanup() {
    if (mediaStream) {
      mediaStream.getTracks().forEach(t => t.stop());
      mediaStream = null;
    }
    mediaRecorder = null;
  }

  mic.addEventListener('click', () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      stopRecording();
      return;
    }
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      showSuggest('⚠️ 이 브라우저는 음성 녹음을 지원하지 않아요.');
      return;
    }
    startRecording();
  });

  // ========== Enter / 클릭으로 검색 ==========
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleQuery(input.value);
    }
  });
  if (goBtn) goBtn.addEventListener('click', () => handleQuery(input.value)); // ph272: 화살표 삭제로 null 가능 — 가드

  // ========== 빠른 진입 버튼 ==========
  document.querySelectorAll('.ai-quick-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const target = btn.dataset.go;
      const fn = QUICK_MAP[target];
      if (fn) {
        e._ph166Handled = true; // ph166 안전망 위임 핸들러가 같은 클릭을 중복 처리(모달 이중 호출)하지 않도록
        fn();
      }
    });
  });

  // ========== 입력 중 자동완성 힌트 (클릭 / ↓키 선택 → 해당 페이지로 이동) ==========
  let hintTimer;
  let _sgMatches = [];
  input.addEventListener('input', () => {
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => {
      const t = normText(input.value);
      if (!t) { suggest.style.display = 'none'; _sgMatches = []; return; }
      const matches = RULES.filter(r => r.kws.some(k => k.toLowerCase().startsWith(t) || t.includes(k.toLowerCase()))).slice(0, 6);
      _sgMatches = matches;
      if (matches.length) {
        suggest.innerHTML =
          '<div class="ai-sg-head">💡 추천 — 눌러서 이동 (↓ 키로 선택)</div>' +
          matches.map((m, i) => `<button type="button" class="ai-sg-item" data-sg="${i}">${m.label}</button>`).join('');
        suggest.style.display = 'block';
      } else {
        suggest.style.display = 'none';
      }
    }, 200);
  });

  function _runSg(i){
    const m = _sgMatches[i];
    if (m && typeof m.action === 'function') { suggest.style.display = 'none'; m.action(); }
  }
  // 추천 클릭 → 이동
  suggest.addEventListener('click', (e) => {
    const btn = e.target.closest('.ai-sg-item');
    if (btn) _runSg(Number(btn.getAttribute('data-sg')));
  });
  // 검색창에서 ↓ → 첫 추천으로 포커스
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && suggest.style.display === 'block') {
      const first = suggest.querySelector('.ai-sg-item');
      if (first) { e.preventDefault(); first.focus(); }
    }
  });
  // 추천 목록 내 ↑/↓ 이동 · Enter 실행 · Esc 닫기
  suggest.addEventListener('keydown', (e) => {
    const items = Array.prototype.slice.call(suggest.querySelectorAll('.ai-sg-item'));
    if (!items.length) return;
    const idx = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); (items[idx + 1] || items[0]).focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (idx <= 0) input.focus(); else items[idx - 1].focus(); }
    else if (e.key === 'Enter') { e.preventDefault(); var a = document.activeElement; if (a && a.getAttribute) _runSg(Number(a.getAttribute('data-sg'))); }
    else if (e.key === 'Escape') { suggest.style.display = 'none'; input.focus(); }
  });
})();