// ═══ i18n-sweep v1 (2026-06-12) — EN 전역 번역 스위퍼 ═══
// 사전(DICT) 기반: lang=en이면 텍스트 노드/속성을 영어로 치환, ko로 돌아오면 원문 복원.
// 동적 생성 UI(전체메뉴·망고아이란?·수업신청·관리자로그인 등)는 MutationObserver로 자동 처리.
(function(){
  'use strict';
  var DICT = {
"전체 메뉴": "All Menu",
"관리자 페이지": "Admin Page",
"마이페이지": "My Page",
"학생 관리": "Student Management",
"내 주간 스케줄": "My Weekly Schedule",
"고객센터": "Customer Center",
"커리큘럼": "Curriculum",
"수업 자료": "Lesson Materials",
"평가서": "Evaluations",
"리포트": "Reports",
"AI 친구": "AI Friend",
"AI 작문": "AI Writing",
"영어 발음 코치": "English Pronunciation Coach",
"중국어 발음 코치": "Chinese Pronunciation Coach",
"교재 업로더": "Textbook Uploader",
"단어장": "Vocabulary",
"미니 퀴즈": "Mini Quiz",
"MBTI 매칭": "MBTI Matching",
"MBTI 테스트": "MBTI Test",
"연속 출석": "Attendance Streak",
"칭찬 스티커": "Praise Stickers",
"수업 신청": "Book Class",
"수업 연기·변경": "Postpone / Change",
"학부모 페이지": "Parent Page",
"시스템 진단": "System Check",
"관리자 로그인": "Admin Login",
"망고아이란?": "About Mangoi",
"📊 관리자": "📊 Admin",
"👤 마이페이지": "👤 My Page",
"🎁 포인트상점": "🎁 Point Shop",
"🎤 단계별 발음": "🎤 Curriculum Pronunciation",
"📅 연기/변경": "📅 Postpone/Change",
"💬 신규상담": "💬 New Inquiry",
"🎥 수업 진단": "🎥 PreCheck",
"📝 수업 신청": "📝 Book Class",
"👨‍🏫 교사 소개": "👨‍🏫 Our Teachers",
"🏠 전체메뉴": "🏠 All Menu",
"열림": "Open",
"닫힘": "Close",
"20년 전통 · 국내 최초의 화상영어 기업": "20 Years of Tradition · Korea's First Video English Company",
"원어민 1:1 화상수업과 A.I 학습관리로, 합리적인 비용에 최고의 영어 말하기 효과를 드립니다.": "Native 1:1 video lessons plus A.I learning management — the best English speaking results at a reasonable cost.",
"카드를 누르면 자세히 볼 수 있어요 👆": "Tap a card to see details 👆",
"무료 상담 신청하기": "Request a Free Consultation",
"교사와 A.I가 함께 학생 실력 향상": "Teachers and A.I Improve Skills Together",
"원어민 선생님의 1:1 화상수업과 A.I 학습관리가 하나의 시스템 안에서 맞물려 돌아갑니다. 수업은 사람이 이끌고, 예습·복습·평가·발음 교정은 A.I가 24시간 도와 학습의 빈틈을 메웁니다.": "Native-teacher 1:1 video lessons and A.I learning management run as one system. Teachers lead the class, while A.I supports preview, review, evaluation and pronunciation correction 24/7 to fill every gap in learning.",
"원어민 선생님과 1:1 / 1:2 수업": "1:1 / 1:2 Lessons with Native Teachers",
"엄격하게 검증된 원어민 전담 선생님과 1:1 또는 1:2 소수정예로 진행합니다. 같은 선생님이 꾸준히 관리하기 때문에 아이의 성향과 약점을 정확히 파악해 맞춤 지도를 합니다.": "Classes are taught 1:1 or 1:2 by strictly vetted, dedicated native teachers. The same teacher manages your child consistently, accurately understanding their traits and weaknesses for tailored teaching.",
"영어 커뮤니케이션 능력의 향상": "Better English Communication Skills",
"문법 암기가 아니라 실제로 입이 트이는 말하기 중심 수업입니다. 매 수업 충분한 발화량과 즉각적인 교정으로 머릿속 영어를 살아있는 회화로 바꿔 줍니다.": "Speaking-centered lessons that actually open your mouth — not grammar memorization. Plenty of speaking time and instant correction in every class turn head knowledge into living conversation.",
"저렴한 비용으로 최고의 학습 효과": "Top Learning Results at a Low Cost",
"필리핀 현지 교육센터를 직접 운영해 불필요한 중간 비용을 없앴습니다. 영미권 원어민 화상영어 대비 합리적인 가격으로, 같은 예산이면 더 자주 수업할 수 있습니다.": "We run our own education center in the Philippines, removing unnecessary middleman costs. Compared with US/UK native video English, the price is reasonable — the same budget buys more classes.",
"최고의 강사진과 체계적인 관리 시스템": "Great Teachers, Systematic Management",
"엄격한 채용과 정기 교육을 거친 강사진이 수업을 맡고, 출결·진도·성취를 데이터로 관리합니다. 담당 매니저가 학습 전반을 함께 챙겨 드립니다.": "Teachers pass strict hiring and regular training, and attendance, progress and achievement are managed with data. A dedicated manager looks after the whole learning journey with you.",
"시간과 장소에 구애받지 않는 시스템": "Learn Anytime, Anywhere",
"집, 학교, 여행지 어디서나 PC·태블릿·휴대폰으로 수업에 입장합니다. 원하는 시간대로 예약하고, 갑작스러운 일정은 연기·변경으로 유연하게 조정할 수 있습니다.": "Join classes from home, school or anywhere with a PC, tablet or phone. Book the time you want, and flexibly postpone or change when plans suddenly shift.",
"우수한 교재로 영어 말하기 동기 부여": "Great Textbooks That Motivate Speaking",
"연령과 레벨에 맞춰 설계된 자체 교재와 CEFR 기반 커리큘럼으로 학습합니다. 아이가 흥미를 느끼는 주제로 구성해 스스로 말하고 싶게 만듭니다.": "Learn with our own textbooks designed by age and level on a CEFR-based curriculum. Topics kids find interesting make them want to speak up on their own.",
"편리하고 다양한 기능의 앱과 홈페이지": "A Convenient All-in-One App & Website",
"수업 입장부터 예습·복습, 평가 확인, 결제, 상담까지 하나의 앱과 홈페이지에서 끝납니다. A.I 검색으로 원하는 기능을 말 한마디로 바로 찾을 수 있습니다.": "From entering class to preview, review, evaluations, payment and consultation — everything is done in one app and website. With A.I search, one phrase takes you straight to any feature.",
"즐겁고 효과적인 예습·복습 비디오와 퀴즈": "Fun, Effective Preview & Review Videos and Quizzes",
"수업 전 예습 영상으로 미리 준비하고, 수업 후에는 복습 퀴즈와 단어 게임으로 반복 학습합니다. 배운 내용을 놀이처럼 익혀 오래 기억하게 합니다.": "Prepare with preview videos before class, then reinforce with review quizzes and word games afterward. Learning feels like play, so it stays in memory longer.",
"A.I를 활용한 수업 평가 · 복습 · 소통": "A.I-Powered Evaluation · Review · Communication",
"매 수업이 끝나면 A.I가 발음·표현·참여도를 분석해 평가서를 자동으로 만들고, 아이에게 꼭 필요한 맞춤 복습을 추천합니다. 월간 리포트로 성장 흐름도 정리해 드립니다.": "After every class, A.I analyzes pronunciation, expressions and participation to auto-generate an evaluation, and recommends the review your child needs most. Monthly reports sum up growth at a glance.",
"직영 필리핀 현지 교육센터 운영": "Our Own Education Center in the Philippines",
"외주 업체가 아니라 망고아이가 직접 운영하는 필리핀 현지 교육센터입니다. 안정적인 인터넷과 근무 환경에서 검증된 정규 교사가 책임감 있게 수업합니다.": "Not an outsourced vendor — Mangoi directly runs its education center in the Philippines. Verified full-time teachers teach responsibly in a stable internet and work environment.",
"20년 전통, 국내 최초의 화상영어 기업": "20 Years of Tradition — Korea's First Video English Company",
"국내에서 화상영어를 가장 먼저 시작한 20년 전통의 기업입니다. 오랜 노하우와 수많은 학생 데이터가 쌓인, 시간으로 검증된 교육 시스템을 제공합니다.": "The first company to start video English in Korea, with 20 years of history. A time-tested education system built on long know-how and data from countless students.",
"학생 정보를 카카오톡으로 실시간 제공": "Real-Time Student Updates via KakaoTalk",
"수업 출결, 평가, 진도, 공지를 학부모님 카카오톡으로 실시간 전송합니다. 따로 앱을 열지 않아도 아이의 학습 상황을 바로 확인할 수 있습니다.": "Attendance, evaluations, progress and notices are sent to parents via KakaoTalk in real time. Check your child's learning instantly without opening another app.",
"수업(사람) + 학습관리(A.I)를 한 곳에서 — 수업만 제공하는 캠블리·링글과 다릅니다": "Lessons (people) + learning management (A.I) in one place — unlike Cambly or Ringle, which offer lessons only",
"매 수업이 끝나면 A.I가 자동으로 평가서와 맞춤 복습 퀴즈를 생성": "After every class, A.I automatically creates an evaluation and a personalized review quiz",
"교사 피드백과 A.I 학습 데이터가 서로 연동되어 약점을 정확히 보완": "Teacher feedback and A.I learning data are linked to precisely fix weaknesses",
"매번 바뀌는 랜덤 매칭이 아닌 전담 선생님제로 안정적인 관리": "A dedicated-teacher system, not random matching — stable, consistent care",
"형제·친구와 함께하는 1:2 수업으로 비용 부담은 낮추고 효과는 그대로": "1:2 classes with siblings or friends lower the cost while keeping the results",
"직영 센터에서 근무하는 정규 교사 — 검증된 수업 품질": "Full-time teachers at our own center — verified lesson quality",
"수업 외 시간에도 A.I 발음 코치로 무제한 말하기 연습": "Unlimited speaking practice with the A.I pronunciation coach outside class",
"발화량과 발음 점수를 데이터로 기록해 성장 과정을 확인": "Speaking volume and pronunciation scores recorded as data to track growth",
"실생활 표현 중심 커리큘럼으로 바로 쓰는 영어": "A real-life-expression curriculum you can use right away",
"직영 운영으로 거품을 뺀 합리적인 수강료": "Reasonable tuition with no bubble, thanks to direct operation",
"1:2 수업을 선택하면 1인당 비용을 한 번 더 절감": "Choose 1:2 classes to cut the per-person cost even further",
"월 단위 부담 없이 시작 — 무료 상담으로 맞춤 견적 제공": "Start without monthly pressure — free consultation with a personalized quote",
"매 수업 평가표를 자동으로 생성해 성장 추이를 한눈에": "Auto-generated evaluations every class show growth at a glance",
"전담 매니저의 학습 케어와 정기 상담": "Learning care and regular consultations from a dedicated manager",
"데이터 기반 진도 관리로 빠짐없는 학습": "Data-driven progress management leaves nothing out",
"모바일까지 완벽 대응 — 언제 어디서나 수업 입장": "Fully mobile-ready — join class anytime, anywhere",
"수업 연기·변경 기능으로 일정 변동에도 빠짐없이": "Postpone/change features keep you on track despite schedule changes",
"원하는 시간대 자유 예약": "Free booking at the time you want",
"CEFR 국제 기준에 맞춘 단계별 커리큘럼": "Step-by-step curriculum aligned to the international CEFR standard",
"디지털 교재 뷰어로 예습·복습이 간편": "Digital textbook viewer makes preview and review easy",
"연령·관심사 맞춤 주제로 학습 동기 부여": "Topics tailored to age and interests keep motivation high",
"여러 앱을 오갈 필요 없는 올인원 통합 플랫폼": "One integrated all-in-one platform — no juggling multiple apps",
"A.I 음성·텍스트 검색으로 원하는 기능 즉시 이동": "A.I voice/text search jumps straight to any feature",
"전체 메뉴 한눈에 보기": "See the entire menu at a glance",
"게임형 마이크로 퀴즈로 지루하지 않은 복습": "Game-style micro quizzes make review fun, never boring",
"단어장·연속 학습(스트릭)으로 꾸준한 습관 형성": "Vocabulary book and learning streaks build steady habits",
"예습 영상으로 수업 이해도 향상": "Preview videos boost class comprehension",
"수업마다 A.I 자동 평가서 생성": "A.I auto-generates an evaluation for every class",
"약점을 짚어 주는 맞춤형 복습 추천": "Personalized review recommendations that target weaknesses",
"월간 A.I 리포트로 한 달 성장 요약": "A monthly A.I report summarizes a month of growth",
"외주가 아닌 직영 운영 — 수업 품질과 비용을 직접 관리": "Directly operated, not outsourced — we control quality and cost ourselves",
"전용 인터넷·장비를 갖춘 안정적인 수업 환경": "A stable class environment with dedicated internet and equipment",
"정규직 교사의 책임 있는 전담 관리": "Responsible, dedicated care from full-time teachers",
"신생 스타트업과는 다른 20년의 운영 노하우": "20 years of operating know-how — unlike young startups",
"수많은 학생을 지도하며 다듬어 온 커리큘럼": "A curriculum refined by teaching countless students",
"실제 학부모·학생 후기로 검증된 신뢰": "Trust verified by real parent and student reviews",
"수업 출결·평가를 카카오톡으로 실시간 알림": "Real-time KakaoTalk alerts for attendance and evaluations",
"월간 A.I 리포트도 카카오톡으로 발송": "Monthly A.I reports also delivered via KakaoTalk",
"학부모와 센터 간 빠른 소통 창구": "A fast communication channel between parents and the center",
"🤖 AI 학습 친구 만나기": "🤖 Meet Your AI Learning Friend",
"📝 수업 신청하러 가기": "📝 Book a Class",
"🎤 AI 발음 코치 체험": "🎤 Try the AI Pronunciation Coach",
"💳 수강료·결제 안내": "💳 Tuition & Payment Info",
"📋 평가표 살펴보기": "📋 View Evaluations",
"📅 수업 연기·변경 보기": "📅 Postpone / Change Classes",
"📚 교육과정 보기": "📚 View Curriculum",
"🏠 전체 메뉴 열기": "🏠 Open All Menu",
"🎯 복습 퀴즈 체험": "🎯 Try a Review Quiz",
"📊 월간 AI 리포트 보기": "📊 View Monthly AI Report",
"🌟 망고아이 특장점": "🌟 Why Mangoi",
"⭐ 수강 후기 보기": "⭐ Read Reviews",
"💬 카카오톡 채널 가기": "💬 Go to KakaoTalk Channel",
"📝 마스터 클래스 디자인 — 망고아이": "📝 Master Class Design — Mangoi",
"📝 마스터 클래스 디자인": "📝 Master Class Design",
"당신의 목표를 세우고 시간을 예술처럼 디자인하세요.": "Set your goals and design your schedule like art.",
"① 시간 선택": "① Time",
"② 교사 선택": "② Teacher",
"③ 결제": "③ Payment",
"🏠 홈": "🏠 Home",
"👥 수업 형태": "👥 Class Type",
"1:1 마스터": "1:1 Master",
"그룹 토론": "Group Discussion",
"🔍 선택 방식": "🔍 Selection Mode",
"📅 날짜로 선택": "📅 By Date",
"🧑‍🏫 교사로 선택": "🧑‍🏫 By Teacher",
"🎯 주간 수업 횟수 설정": "🎯 Classes per Week",
"📅 날짜 선택 (요일 자유 이동)": "📅 Select Dates (move freely)",
"⏰ 시간 선택 (최소 20분 자동 블록 + 연속 확장)": "⏰ Select Time (20-min auto blocks, extendable)",
"⏰ 위에서 시간을 선택하세요": "⏰ Select a time above",
"➕ 장바구니에 담기": "➕ Add to Cart",
"🛒 선택된 마스터 예약 목록": "🛒 Selected Bookings",
"요일을 이동하며 일정을 장바구니에 채워보세요.": "Move between days and fill your cart with sessions.",
"완벽한 일정 디자인! 결제로 이동 ➡️": "Perfect schedule! Proceed to Payment ➡️",
"😢 이 시간에 가능한 교사가 없어요. 다른 시간을 선택해 주세요.": "😢 No teachers are available at this time. Please pick another.",
"🧑‍🏫 교사 선택 — 먼저 선생님을 고르세요": "🧑‍🏫 Choose Your Teacher First",
"🧑‍🏫 먼저 위에서 교사를 선택하세요": "🧑‍🏫 Select a teacher above first",
"🧑‍🏫 이 시간에 가능한 교사 — 누르면 바로 등록돼요": "🧑‍🏫 Teachers available at this time — tap to book",
"월": "Mon",
"화": "Tue",
"수": "Wed",
"목": "Thu",
"금": "Fri",
"토": "Sat",
"일": "Sun",
"관리자 로그인 — 망고아이": "Admin Login — Mangoi",
"역할에 맞는 데이터 범위가 자동 적용됩니다.": "Data scope is applied automatically based on your role.",
"👤 아이디": "👤 Username",
"🔑 비밀번호": "🔑 Password",
"💾 아이디 저장": "💾 Remember ID",
"🔧 비밀번호 찾기": "🔧 Forgot Password",
"✅ 로그인": "✅ Log In",
"또는 소셜 계정으로 로그인": "Or sign in with a social account",
"💬 카카오": "💬 Kakao",
"네이버": "Naver",
"구글": "Google",
"▸ 💡 시연용 데모 계정 보기": "▸ 💡 View Demo Accounts",
"문의:": "Contact:",
"· 망고아이 화상수업 운영 시스템": "· Mangoi Video Class Operating System",
"🏠 홈으로": "🏠 Home",
"👑 본사·경영진": "👑 HQ · Executives",
"🛠️ 본사·관리자": "🛠️ HQ · Admin",
"🏬 지사": "🏬 Branch",
"🤝 대리점": "🤝 Agency",
"👨‍🏫 교사": "👨‍🏫 Teacher",
"💁‍♀️ 상담직원 인사말": "💁‍♀️ Staff Greeting",
"나가기": "Exit",
"멈춤": "Pause",
"멈춤/재생": "Pause/Play",
"무음": "Mute",
"무음/소리 전환": "Toggle sound",
"🔊 소리 켜고 다시 듣기": "🔊 Listen Again with Sound",
"비밀번호 보기/숨기기": "Show/hide password",
"👨‍🏫 강사 소개": "👨‍🏫 Our Teachers",
"1,000명+ 검증된 강사들이 매일 7,000건+의 수업을 진행합니다.": "1,000+ verified teachers run 7,000+ classes every day.",
"🌍 강사 구성": "🌍 Teacher Composition",
"🇵🇭 필리핀": "🇵🇭 Philippines",
"현지 원어민 강사": "Local native teachers",
"🇺🇸 미국·캐나다": "🇺🇸 US · Canada",
"원어민": "Native speakers",
"🇬🇧 영국·호주": "🇬🇧 UK · Australia",
"준비중": "Coming soon",
"🇨🇳 중국어": "🇨🇳 Chinese",
"이중언어": "Bilingual",
"🌴 필리핀 강사진 미리보기": "🌴 Meet Our Filipino Teachers",
"영어 회화": "English Conversation",
"🇵🇭 망고아이 필리핀 본사 검증 강사 · TESOL/CELTA 자격 + 평균 5년+ 경력": "🇵🇭 Verified by Mangoi Philippines HQ · TESOL/CELTA certified + 5+ yrs average experience",
"✅ 채용 기준": "✅ Hiring Standards",
"대학 졸업 이상 (영어 관련 학과 우대)": "University degree or higher (English majors preferred)",
"TESOL/CELTA/TEFL 자격증 보유": "TESOL/CELTA/TEFL certified",
"최소 2년 영어 교육 경험": "At least 2 years of English teaching experience",
"망고아이 자체 4단계 시범 수업 통과": "Passed Mangoi's own 4-stage trial lessons",
"분기별 학생 평가 4.0/5.0 이상 유지": "Maintains 4.0/5.0+ student ratings every quarter",
"⭐ 강사 평가 시스템": "⭐ Teacher Evaluation System",
"매 수업 후 학생 5단계 평가": "5-level student rating after every class",
"월별 동료/매니저 모니터링": "Monthly peer/manager monitoring",
"S·A·B·C 등급 기반 인센티브": "Incentives based on S·A·B·C grades",
"오늘의 학습 평가서": "Today's Learning Evaluations",
"오늘의 학습 평가서 — 망고아이": "Today's Learning Evaluations — Mangoi",
"📥 평가서를 불러오는 중…": "📥 Loading evaluations…",
"총": "Total",
"홈으로": "Home",
"망고아이 홈": "Mangoi Home",
"🏠 망고아이 홈페이지로": "🏠 Go to Mangoi Homepage",
"강사": "Teacher",
"담당 강사": "Teacher",
"종합 / 5점": "Overall / 5",
"수업": "Class",
"✨ 잘한 점": "✨ Strengths",
"💪 보완할 점": "💪 To Improve",
"🎯 다음 수업 목표": "🎯 Next Lesson Goals",
"📝 강사 코멘트": "📝 Teacher Comment",
"📝 숙제 완성": "📝 Homework Done",
"🗣 말하기": "🗣 Speaking",
"💡 이해도": "💡 Comprehension",
"🎯 참여도": "🎯 Participation",
"😊 수업 태도": "😊 Attitude",
"🏆 매우 우수": "🏆 Excellent",
"⭐ 우수": "⭐ Great",
"👍 양호": "👍 Good",
"🙂 보통": "🙂 Fair",
"💪 분발 필요": "💪 Needs Effort",
"— 아직 입력되지 않았어요.": "— Not entered yet.",
"1on1 영어 회화": "1-on-1 English Conversation",
"문법 - 현재완료": "Grammar — Present Perfect",
"어휘 확장 Day 12": "Vocabulary Expansion Day 12",
"오늘 발음이 많이 좋아졌어요! 다음 시간에는 새 단어 5개 외워오기.": "Pronunciation improved a lot today! Memorize 5 new words for next time.",
"문법 이해도가 좋아요. 회화 연습 더 필요.": "Good grasp of grammar. Needs more conversation practice.",
"완벽한 수업! 모든 영역에서 우수.": "Perfect class! Excellent in every area.",
"홍길동": "Hong Gildong",
"박지윤": "Park Ji-yoon",
"이서연": "Lee Seo-yeon",
"정수아": "Jung Su-a",
"🎥 수업 입장 전 자가진단": "🎥 Pre-Class Self-Check",
"🎥 수업 입장 전 자가진단 · 망고아이 PreCheck": "🎥 Pre-Class Self-Check · Mangoi PreCheck",
"망고아이 수업 진단": "Mangoi Class Diagnosis",
"9가지 항목을 자동으로 검사합니다 — 카메라·마이크·스피커·대역폭·연결 안정성·보안. 약 15초 소요. 수업 5분 전에 한 번 돌려 주세요.": "Automatically checks 9 items — camera, mic, speaker, bandwidth, connection stability and security. Takes about 15 seconds. Run it once, 5 minutes before class.",
"✅ 입장 준비 완료": "✅ Ready to Join",
"모든 항목 정상입니다. 안심하고 수업에 입장하세요.": "All checks passed. Join the class with confidence.",
"안전·선명·안정": "Secure · Clear · Stable",
"⚠️ 입장 가능 (개선 권장)": "⚠️ Can join (improvements recommended)",
"연결은 가능하지만 더 선명하고 안정적인 수업을 위해 아래 권장사항을 확인하세요.": "You can connect, but check the recommendations below for a clearer, more stable class.",
"❌ 입장 어려움": "❌ Trouble joining",
"연결에 심각한 문제가 있습니다. 아래 권장사항을 먼저 해결하세요.": "There are serious connection problems. Resolve the recommendations below first.",
"보안 연결 (HTTPS)": "Secure Connection (HTTPS)",
"HTTPS 보안 연결 ✓": "HTTPS secure connection ✓",
"HTTPS 가 아닙니다": "Not HTTPS",
"HTTPS 가 아닙니다 — 주소창 https:// 로 시작하는지 확인하세요.": "Not HTTPS — make sure the address starts with https://.",
"암호화된 통신 환경인지 확인합니다. WebRTC는 HTTPS 에서만 작동합니다.": "Checks for an encrypted connection. WebRTC only works over HTTPS.",
"브라우저 호환성": "Browser Compatibility",
"— WebRTC 미지원": "— WebRTC not supported",
"— 최신 버전 권장": "— latest version recommended",
"권장 브라우저(크롬/에지/사파리/파이어폭스 최신)로 변경해 주세요.": "Please switch to a recommended browser (latest Chrome/Edge/Safari/Firefox).",
"크롬·에지·사파리·파이어폭스 최신 버전 권장.": "Latest Chrome, Edge, Safari or Firefox recommended.",
"이 브라우저는 WebRTC 지원이 부족합니다. 크롬을 추천드립니다.": "This browser has poor WebRTC support. We recommend Chrome.",
"카메라": "Camera",
"카메라 권한과 해상도를 확인합니다.": "Checks camera permission and resolution.",
"카메라 권한이 거부됐습니다. 주소창 자물쇠 → 카메라 허용으로 변경.": "Camera permission denied. Click the address-bar lock → allow Camera.",
"카메라 접근 실패:": "Camera access failed:",
"해상도가 낮습니다 — 외장 1080p 카메라 권장.": "Low resolution — an external 1080p camera is recommended.",
"마이크": "Microphone",
"에코·노이즈 억제 활성, 음성 입력 레벨 측정.": "Echo/noise suppression on; measures voice input level.",
"마이크 권한이 거부됐습니다. 주소창 자물쇠 → 마이크 허용으로 변경.": "Microphone permission denied. Click the address-bar lock → allow Microphone.",
"마이크 접근 실패:": "Microphone access failed:",
"마이크 입력이 매우 작습니다. 마이크에 더 가까이 말하거나 시스템 음량을 올려 주세요.": "Microphone input is very low. Speak closer to the mic or raise the system volume.",
"마이크에 가까이 말하거나 음량을 높이세요.": "Speak closer to the mic or raise the volume.",
"에코 캔슬·노이즈 억제 활성화됨 ✓": "Echo cancellation · noise suppression on ✓",
"스피커 / 이어폰": "Speaker / Earphones",
"아래 버튼으로 테스트 음을 재생합니다 — 들리면 ✅ 클릭.": "Play the test sound with the button below — click ✅ if you hear it.",
"🔊 테스트 음 재생": "🔊 Play Test Sound",
"✅ 들려요": "✅ I hear it",
"❌ 안 들려요": "❌ I don't hear it",
"스피커에서 소리가 안 납니다. 음소거 해제·볼륨 확인·이어폰 연결 확인.": "No sound from the speaker. Unmute, check the volume and earphone connection.",
"사용자 확인 — 정상 ✓": "Confirmed by user — OK ✓",
"사용자가 안 들린다고 표시": "User reported no sound",
"재생 실패:": "Playback failed:",
"이 브라우저는 AudioContext 를 지원하지 않습니다.": "This browser does not support AudioContext.",
"검사 중": "Checking",
"측정 중": "Measuring",
"대기": "Waiting",
"네트워크 대역폭": "Network Bandwidth",
"다운로드 속도 측정. 화상수업은 최소 2 Mbps 권장.": "Measures download speed. At least 2 Mbps recommended for video classes.",
"대역폭이 부족합니다(2 Mbps 미만). 유선 LAN 또는 5GHz Wi-Fi 권장.": "Insufficient bandwidth (under 2 Mbps). Wired LAN or 5GHz Wi-Fi recommended.",
"대역폭이 빠듯합니다. 백그라운드 다운로드·스트리밍을 중단하세요.": "Bandwidth is tight. Stop background downloads/streaming.",
"측정 불가 — 캐시 또는 네트워크 응답 비정상": "Cannot measure — abnormal cache or network response",
"측정 실패": "Measurement failed",
"측정 실패 (방화벽/네트워크 제한 가능)": "Measurement failed (possible firewall/network limits)",
"백그라운드 트래픽을 중단하세요.": "Stop background traffic.",
"STUN / TURN 연결성": "STUN / TURN Connectivity",
"NAT/방화벽 통과 가능성을 확인합니다.": "Checks NAT/firewall traversal.",
"공인 IP 회신 ✓": "Public IP returned ✓",
"로컬 후보만 회신 — NAT 통과 불확실": "Only local candidates — NAT traversal uncertain",
"STUN 응답 없음 — 방화벽 차단 가능": "No STUN response — possibly blocked by a firewall",
"STUN 서버 연결 실패 — 방화벽/회사망에서 차단됐을 수 있습니다.": "STUN server connection failed — may be blocked by a firewall/corporate network.",
"STUN 검사 오류:": "STUN check error:",
"SDP 생성 실패:": "SDP creation failed:",
"TURN 서버 사용을 권장합니다.": "Using a TURN server is recommended.",
"지연시간 (RTT)": "Latency (RTT)",
"서버 응답 시간 측정. 150 ms 이하가 이상적.": "Measures server response time. Under 150 ms is ideal.",
"지연시간이 다소 큽니다. 공유기에 더 가까이 가거나 LAN을 사용해 주세요.": "Latency is a bit high. Move closer to the router or use LAN.",
"지연시간이 매우 큽니다. 네트워크 환경을 변경하세요.": "Latency is very high. Change your network environment.",
"비디오 코덱 지원": "Video Codec Support",
"VP9 / AV1 / H.264 지원 여부 — 화질에 직접 영향.": "VP9 / AV1 / H.264 support — directly affects video quality.",
"지원 ✓": "Supported ✓",
"VP9/AV1 미지원 — H.264로 동작합니다(약간 낮은 화질).": "VP9/AV1 not supported — falls back to H.264 (slightly lower quality).",
"주요 코덱 미지원": "Major codecs not supported",
"코덱 확인 불가 (브라우저 제한)": "Cannot check codecs (browser limitation)",
"H.264 만 지원 (화질 보통)": "H.264 only (average quality)",
"(제한적 지원)": "(limited support)",
"권장사항": "Recommendations",
"유선 LAN·이어폰·정면 조명을 사용하시면 더욱 선명한 수업이 됩니다.": "Wired LAN, earphones and front lighting make for an even clearer class.",
"🔄 다시 진단": "🔄 Re-check",
"🎥 수업 입장하기": "🎥 Join Class",
"← 홈으로": "← Home",
"학생 홈으로": "Student Home",
"진단 진행 중…": "Diagnosis in progress…",
"잠시만 기다려 주세요. 카메라·마이크 접근을 허용해 주시면 자동으로 시작됩니다.": "Please wait. The check starts automatically once you allow camera/mic access.",
"© 망고아이 화상수업 · 자가진단 v1.0": "© Mangoi Video Class · Self-Check v1.0",
"✅ 정상": "✅ OK",
"⚠️ 주의": "⚠️ Caution",
"❌ 실패": "❌ Failed",
"개선 권장": "Improvement advised",
"문제 있음": "Has issues",
"허용 필요": "Permission needed",
"수업 연기 / 변경 — Premium 모바일": "Postpone / Change Classes — Premium Mobile",
"📅 수업 일정": "📅 Class Schedule",
"무엇을 도와드릴까요?": "How can we help you?",
"원하시는 작업을 선택해 주세요": "Choose what you want to do",
"수업 연기하기": "Postpone Classes",
"이번 주 수업을 다음 주로 미루기.": "Push this week's classes to next week.",
"수업 횟수는 그대로 보존됩니다.": "Your class count is preserved.",
"수업 변경하기": "Change Classes",
"원하는 다른 날짜·교사로": "To a different date or teacher",
"즉시 예약을 교체합니다.": "Replaces the booking immediately.",
"시작하기 →": "Start →",
"🎯 주간 횟수 · 담을 수업 수": "🎯 Weekly count · classes to add",
"📅 날짜 선택 · 좌우로 밀어보세요": "📅 Select a date · swipe left/right",
"👆 먼저 날짜를 선택해 주세요": "👆 Select a date first",
"🕐 시간 선택": "🕐 Select Time",
"🕐 시간으로": "🕐 By Time",
"👨‍🏫 교사로": "👨‍🏫 By Teacher",
"😢 가능한 시간이 없습니다": "😢 No times available",
"😢 이 시간에 가능한 교사가 없습니다": "😢 No teachers available at this time",
"⏳ 가능한 교사 검색 중...": "⏳ Searching for available teachers...",
"✅ 가능한 교사": "✅ Available teachers",
"👨‍🏫 교사 선택 · 카드를 탭하면 시간이 펼쳐집니다": "👨‍🏫 Select a teacher · tap a card to see times",
"일정을 골라 장바구니에 담아주세요.": "Pick schedules and add them to your cart.",
"이미 담긴 일정이에요": "Already in your cart",
"완료하기 ✓": "Finish ✓",
"완료": "Done",
"확정": "Confirm",
"닫기": "Close",
"기존:": "Current:",
"다음 날짜": "Next date",
"이전 날짜": "Previous date",
"상담": "Consult",
"카카오톡 상담": "KakaoTalk Consultation",
"🔄 다시하기": "🔄 Start Over",
"음소거 전환": "Toggle mute",
"소리 켜기/끄기": "Sound on/off",
"안내 영상 닫기": "Close guide video",
"⏩ 전체 일정을 한 수업씩 뒤로 밀었어요": "⏩ All classes pushed back by one session",
"완료되었습니다": "Completed",
"되었습니다": "done",
"간단 MBTI 테스트 — 망고아이": "Quick MBTI Test — Mangoi",
"12문항 · 2~3분 · 자기 성향 빠르게 알아보기": "12 questions · 2–3 min · discover your type fast",
"사람 많은 파티에 가면 어떤가요?": "How do you feel at a crowded party?",
"에너지가 충전돼요": "I feel energized",
"빨리 집에 가서 쉬고 싶어요": "I want to go home and rest",
"새로운 사람을 만났을 때?": "When you meet someone new?",
"먼저 다가가 인사함": "I approach and greet first",
"상대가 먼저 말 걸기를 기다림": "I wait for them to speak first",
"주말에 가장 좋은 건?": "Best weekend plan?",
"친구들과 모임/약속": "Hanging out with friends",
"혼자만의 시간": "Time alone",
"새로운 것을 배울 때?": "When learning something new?",
"단계별로 차근차근": "Step by step",
"큰 그림과 개념 먼저 이해": "Big picture and concepts first",
"영화를 볼 때 더 흥미로운 건?": "What interests you more in a movie?",
"장면의 디테일과 사실": "Details and facts of each scene",
"캐릭터의 미래 가능성·숨은 의미": "Characters' possibilities and hidden meanings",
"결정할 때 더 중요한 건?": "What matters more when deciding?",
"논리·효율·결과": "Logic, efficiency, results",
"사람들의 감정·관계": "People's feelings and relationships",
"친구가 고민 상담하면?": "When a friend shares a problem?",
"논리적으로 해결책 분석": "Analyze solutions logically",
"공감하고 위로 먼저": "Empathize and comfort first",
"비판을 받을 때?": "When criticized?",
"객관적으로 받아들임": "Take it objectively",
"마음이 상함": "It hurts my feelings",
"약속 시간은?": "About appointments?",
"항상 미리 도착": "Always arrive early",
"아슬아슬·가끔 늦음": "Just in time, sometimes late",
"책상/방은?": "Your desk/room?",
"늘 정리정돈": "Always tidy",
"좀 어수선해도 괜찮음": "A little messy is fine",
"마감일 앞두고?": "Before a deadline?",
"미리미리 끝냄": "Finish well in advance",
"막판에 몰아서": "Cram at the last minute",
"휴가 계획은?": "Vacation planning?",
"일정·예약 미리 꼼꼼하게": "Plan and book thoroughly in advance",
"일단 가서 자유롭게": "Just go and be free",
"전략가": "Architect",
"논리술사": "Logician",
"통솔자": "Commander",
"변론가": "Debater",
"옹호자": "Advocate",
"중재자": "Mediator",
"선도자": "Protagonist",
"활동가": "Campaigner",
"현실주의자": "Logistician",
"수호자": "Defender",
"경영자": "Executive",
"친선도모자": "Consul",
"장인": "Virtuoso",
"거장": "Virtuoso",
"모험가": "Adventurer",
"사업가": "Entrepreneur",
"연예인": "Entertainer",
"논리적·독립적·계획적 — 큰 그림을 그리며 체계적으로 목표 달성": "Logical, independent, organized — achieves goals systematically with the big picture in mind",
"호기심 많고 분석적 — 새로운 아이디어와 이론을 사랑하는 사색가": "Curious and analytical — a thinker who loves new ideas and theories",
"대담하고 결단력 — 타고난 리더, 도전을 두려워하지 않음": "Bold and decisive — a born leader who fears no challenge",
"재치 있고 활발 — 논쟁과 새로운 가능성을 즐기는 혁신가": "Witty and lively — an innovator who enjoys debate and new possibilities",
"고요하고 신비롭 — 깊은 통찰과 강한 신념을 가진 이상주의자": "Quiet and mysterious — an idealist with deep insight and strong conviction",
"시적이고 친절 — 자신만의 가치를 가진 따뜻한 이상주의자": "Poetic and kind — a warm idealist with values of their own",
"카리스마 있고 영감 — 사람을 끌어당기는 따뜻한 리더": "Charismatic and inspiring — a warm leader who draws people in",
"열정적·창의적 — 가능성을 즐기는 자유로운 영혼": "Passionate and creative — a free spirit who enjoys possibilities",
"책임감 있고 성실 — 사실과 전통을 중시하는 신뢰의 아이콘": "Responsible and diligent — an icon of trust who values facts and tradition",
"따뜻하고 헌신적 — 소중한 사람을 보호하는 든든한 친구": "Warm and devoted — a steadfast friend who protects loved ones",
"우수한 관리자 — 사물·사람 관리에 탁월한 전통주의자": "An excellent manager — a traditionalist great at managing things and people",
"배려심 많고 사교적 — 항상 도움 줄 준비 된 따뜻한 사람": "Caring and sociable — a warm person always ready to help",
"대담하고 실용적 — 도구를 다루는 능숙한 실험가": "Bold and practical — a skilled experimenter with tools",
"유연하고 매력적 — 새로운 것을 항상 탐험하는 예술가": "Flexible and charming — an artist always exploring something new",
"영리하고 활기 — 위험 감수하며 즐기는 행동파": "Smart and energetic — a doer who enjoys taking risks",
"자발적이고 열정 — 어디서나 분위기 메이커가 되는 자유로운 영혼": "Spontaneous and passionate — a free spirit who livens up any room",
"뒤로": "Back",
"홈": "Home",
"결과 분석 중...": "Analyzing results...",
"🔄 다시 테스트": "🔄 Retake Test",
"🌟 잘 맞는 강사 찾기": "🌟 Find Matching Teachers",
"강사 찾기 →": "Find Teachers →",
"더 자세히 보기 →": "See More →",
"선생님 정보를 불러오지 못했어요.": "Could not load teacher info.",
"아직 등록된 선생님 MBTI 가 없어요.": "No teacher MBTI registered yet.",
"음소거": "Mute",
"소리 켜기": "Sound On",
"음성 켜기/끄기": "Voice on/off",
"💡 정확한 결과를 원하면": "💡 For more accurate results",
"💳 결제하기": "💳 Payment",
"신규/연장을 선택해 주세요. 1분이면 끝나요!": "Choose new or renewal. It only takes a minute!",
"결제 종류": "Payment Type",
"상품 선택": "Select Plan",
"정보 입력": "Your Info",
"결제": "Payment",
"학생 확인": "Verify Student",
"연장 옵션": "Renewal Options",
"어떤 결제를 진행하시나요?": "Which payment would you like to make?",
"신규 결제": "New Payment",
"처음 시작": "First Time",
"처음 망고아이를 시작해요. 무료체험·1:1·그룹 등 모든 코스 선택 가능": "Starting Mangoi for the first time. Choose any course — free trial, 1:1, group and more",
"✓ 10개 코스 중 선택": "✓ Choose from 10 courses",
"✓ 신규 회원 5,000원 쿠폰": "✓ ₩5,000 coupon for new members",
"✓ 첫 수업 만족도 보장": "✓ First-class satisfaction guarantee",
"연장 결제": "Renewal Payment",
"⭐ 회원 혜택": "⭐ Member Benefits",
"현재 수강생만 가능. 잔여 회차 자동 이월 + 최대 20% 할인": "Current students only. Remaining sessions carry over + up to 20% off",
"잔여 회차 자동 이월 + 최대 20% 할인": "Remaining sessions carry over + up to 20% off",
"✓ 잔여 수업 자동 이월": "✓ Remaining classes carry over automatically",
"✓ 연장 할인 10~20%": "✓ 10–20% renewal discount",
"✓ 강사 우선권·추가 옵션": "✓ Teacher priority & extra options",
"연장 진행 →": "Renew →",
"자동연장 결제": "Auto-Renewal Payment",
"🔥 최대 할인": "🔥 Best Discount",
"매월 자동 결제·연장. 끊김 없이 학습 + 25% 추가 할인 + 프리미엄 혜택": "Automatic monthly payment & renewal. Uninterrupted learning + extra 25% off + premium perks",
"매월 자동 결제·최대 25% 할인 + 프리미엄 혜택": "Monthly auto-payment · up to 25% off + premium perks",
"✓ 최대 25% 추가 할인": "✓ Up to 25% extra discount",
"최대 25% 추가 할인": "Up to 25% extra discount",
"✓ 만료 5일 전 자동 갱신": "✓ Auto-renews 5 days before expiry",
"✓ 강사 고정 + 매니저 무료": "✓ Keep your teacher + free manager",
"✓ 언제든 1초 해지 가능": "✓ Cancel anytime in one second",
"자동결제 시작 →": "Start Auto-Pay →",
"📌 연장 결제는 학생 ID·전화번호 인증 후 진행됩니다. 잔여 회차는 새 코스에 자동 합산돼요.": "📌 Renewal requires student ID & phone verification. Remaining sessions are added to your new course automatically.",
"♾️ 자동연장은 등록 카드로 매월 자동 결제됩니다. 마이페이지에서 언제든 해지 가능.": "♾️ Auto-renewal charges your registered card monthly. Cancel anytime in My Page.",
"🎓 학생 정보 확인": "🎓 Verify Student Info",
"현재 수강 중인 학생 ID와 등록된 전화번호 (또는 비밀번호)를 입력해 주세요.": "Enter the enrolled student ID and registered phone number (or password).",
"🆔 학생 ID (또는 카톡 ID)": "🆔 Student ID (or Kakao ID)",
"📱 등록 전화번호 또는 🔑 비밀번호": "📱 Registered phone or 🔑 password",
"010-1234-5678 또는 비밀번호": "010-1234-5678 or password",
"예) hong_gildong": "e.g. hong_gildong",
"← 이전": "← Back",
"🔍 학생 정보 확인": "🔍 Verify Student Info",
"본인 인증을 위해 이름·연락처가 학생관리 DB와 일치해야 합니다.": "For verification, the name and contact must match the student database.",
"학생 ID와 전화번호(또는 비밀번호)를 모두 입력해 주세요.": "Please enter both the student ID and phone number (or password).",
"원하시는 코스를 선택해 주세요": "Please choose your course",
"원하시는 과정을 선택하세요": "Choose the course you want",
"무료 체험": "Free Trial",
"무료": "Free",
"1회 (40분)": "1 session (40 min)",
"1:1 8회권": "1:1 — 8 Sessions",
"1:1 24회권": "1:1 — 24 Sessions",
"1:1 4회권": "1:1 — 4 Sessions",
"1:1 12회권": "1:1 — 12 Sessions",
"그룹 12회권": "Group — 12 Sessions",
"맛보기 (40분)": "Taster (40 min)",
"2-4명 토론": "2–4 person discussion",
"비즈니스": "Business",
"실전 회의·이메일": "Real meetings & email",
"전문 강사 16주": "Expert teacher · 16 weeks",
"키즈 영어": "Kids English",
"놀이형 4-12세": "Play-based, ages 4–12",
"노래·게임": "Songs & games",
"시험 영어": "Exam English",
"집중 12주": "Intensive 12 weeks",
"기타 / 상담": "Other / Consultation",
"맞춤 코스": "Custom course",
"상담 후 결정": "Decide after consultation",
"결제 및 수강 규정": "Payment & Course Policy",
"환불·변경·이수 안내": "Refund, change & completion guide",
"자세히 보기 →": "See Details →",
"⭐ 인기": "⭐ Popular",
"결제 정보를 알려주세요": "Tell us your payment details",
"결제자 정보": "Payer Info",
"결제자 이름": "Payer name",
"홍길동 (학부모 또는 본인)": "e.g. Hong Gildong (parent or self)",
"학생 이름": "Student name",
"실제 수강할 학생 이름": "Name of the student taking classes",
"연락처 (전화 또는 카톡 ID)": "Contact (phone or Kakao ID)",
"이메일 (영수증 발송)": "Email (for receipt)",
"추가 정보 (이메일·쿠폰·요청사항)": "Additional info (email, coupon, requests)",
"추천인 ID": "Referrer ID",
"쿠폰 코드": "Coupon code",
"메모 / 요청사항": "Memo / requests",
"원하시는 시간대·강사 등": "Preferred times, teacher, etc.",
"선택사항": "Optional",
"선택한 과정": "Selected course",
"금액 (KRW) — 기타 선택 시": "Amount (KRW) — if Other selected",
"설명": "Description",
"변경": "Change",
"결제수단 선택 →": "Choose Payment Method →",
"신용/체크카드": "Credit/Debit Card",
"간편 결제": "Easy Pay",
"카카오페이": "KakaoPay",
"네이버페이": "NaverPay",
"토스 송금": "Toss Transfer",
"계좌이체": "Bank Transfer",
"가상계좌": "Virtual Account",
"즉시 결제": "Instant payment",
"바로 송금": "Direct transfer",
"앱 자동 열림": "App opens automatically",
"계좌 즉시 표시": "Account shown instantly",
"자동 발급": "Auto-issued",
"✅ 결제 완료 확인": "✅ Confirm Payment Complete",
"💳 결제수단을 선택하면 바로 결제됩니다": "💳 Payment starts as soon as you choose a method",
"📌 송금 후 \"결제 완료 확인\" 버튼을 눌러주시면 바로 수강이 활성화됩니다": "📌 After transferring, press \"Confirm Payment Complete\" and your course activates right away",
"📦 연장 방식 선택": "📦 Choose Renewal Type",
"🔄 같은 코스": "🔄 Same Course",
"⬆️ 업그레이드": "⬆️ Upgrade",
"➕ 추가 회차": "➕ Extra Sessions",
"✨ 추가 옵션": "✨ Extra Options",
"다음 →": "Next →"
};
  var MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var PATTERNS = [
    { re:/^(\d{1,2})월$/, fn:function(m){ var i=+m[1]; return (i>=1&&i<=12)?MONTHS[i-1]:m[0]; } },
    { re:/^주 (\d+)회$/, fn:function(m){ return m[1]+'x / week'; } },
    { re:/^\((\d+)\s*\/\s*(\d+)회 완료\)$/, fn:function(m){ return '('+m[1]+' / '+m[2]+' done)'; } },
    { re:/^주 (\d+)회 일정을 장바구니에 모두 담아주세요\.(?:\s*\(현재 (\d+)회\))?$/, fn:function(m){ return 'Add all '+m[1]+' weekly sessions to your cart.'+(m[2]!==undefined?' (currently '+m[2]+')':''); } },
    { re:/^(\d+)개$/, fn:function(m){ return m[1]; } },
    { re:/^(\d+)년차$/, fn:function(m){ return m[1]+' yrs'; } },
    { re:/^⭐ (\d(?:\.\d)?) · (\d+)년차$/, fn:function(m){ return '⭐ '+m[1]+' · '+m[2]+' yrs'; } },
    { re:/^✓ 본사 ERP 등록 강사 (\d+)명 표시$/, fn:function(m){ return '✓ Showing '+m[1]+' HQ ERP-registered teachers'; } },
    { re:/^📌 현재 수업 \((\d+)회\)$/, fn:function(m){ return '📌 Current classes ('+m[1]+')'; } },
    { re:/^✅ 주 (\d+)회를 모두 담았어요$/, fn:function(m){ return '✅ All '+m[1]+' weekly sessions added'; } },
    { re:/^(.+) 선생님$/, fn:function(m){ return m[1]+' (Teacher)'; } },
    { re:/^1회당 ₩([\d,]+)$/, fn:function(m){ return '₩'+m[1]+' / session'; } },
    { re:/^\/(\d+)회$/, fn:function(m){ return '/ '+m[1]+' sessions'; } },
    { re:/^월 (\d+)회\/주 \((\d+)분\)$/, fn:function(m){ return m[1]+'x / week ('+m[2]+' min)'; } },
  ];
  var REPL = [["(월)", "(Mon)"], ["(화)", "(Tue)"], ["(수)", "(Wed)"], ["(목)", "(Thu)"], ["(금)", "(Fri)"], ["(토)", "(Sat)"], ["(일)", "(Sun)"], ["님의 학습 평가서", "'s Learning Evaluations"], ["의 평가서", " evaluations"], ["평가서 #", "Evaluation #"], ["선생님 ·", "(Teacher) ·"], ["Mbps · 충분 ✓", "Mbps · sufficient ✓"], ["Mbps · 빠듯", "Mbps · tight"], ["Mbps · 부족", "Mbps · insufficient"], ["ms · 매우 빠름 ✓", "ms · very fast ✓"], ["ms · 양호", "ms · good"], ["ms · 다소 느림", "ms · a bit slow"], ["ms · 매우 느림", "ms · very slow"], ["에코 캔슬·노이즈 억제 ✓ · peak", "Echo cancel · noise suppression ✓ · peak"], ["입력 레벨 매우 작음 (peak", "Input level very low (peak"], ["입력 레벨 작음 (peak", "Input level low (peak"], ["날짜로 연기", "Postpone by Date"], ["교사로 연기", "Postpone by Teacher"], ["날짜로 변경", "Change by Date"], ["교사로 변경", "Change by Teacher"], ["연기 장바구니", "Postpone Cart"], ["변경 장바구니", "Change Cart"], ["⏩ 전체 일정 한 수업씩 뒤로 밀기", "⏩ Push all classes back one session"], ["(자동 연기)", "(auto postpone)"], ["(자동 변경)", "(auto change)"], ["일정을 더 담아주세요", "Add more sessions"], ["와 잘 맞는 선생님 — 눌러서 선택하세요!", " — matching teachers, tap to choose!"], ["와 잘 맞는 선생님을 찾는 중…", " — finding matching teachers…"], ["에서 정밀 검사도 추천드려요.", " — we also recommend a full test there."]];
  var ATTRS=['placeholder','title','aria-label','alt'];
  var SKIP=/^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|CODE|PRE)$/;
  var records=[];

  // 🌐 자동번역 폴백 — 사전에 없는 한국어는 서버 AI로 번역 후 localStorage 캐시
  var AUTO = {};
  try { AUTO = JSON.parse(localStorage.getItem('mangoi_i18n_en') || '{}') || {}; } catch(e) { AUTO = {}; }
  var MISS = {};        // 이번 배치 대상
  var TRIED = {};       // 세션 내 1회만 시도 (무한루프 방지)
  var flushTimer = null;
  function hasKo(s){ return /[가-힣]/.test(s); }
  function maybeQueue(k){
    if (TRIED[k]) return;
    if (!hasKo(k) || k.length > 200) return;
    TRIED[k] = true; MISS[k] = true; scheduleFlush();
  }
  function scheduleFlush(){ if (flushTimer) return; flushTimer = setTimeout(flushMiss, 900); }
  function flushMiss(){
    flushTimer = null;
    var items = Object.keys(MISS); MISS = {};
    if (!items.length || !isEn()) return;
    (async function(){
      var changed = false;
      for (var i = 0; i < items.length; i += 50){
        var chunk = items.slice(i, i + 50);
        try {
          var r = await fetch('/api/i18n/translate', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ texts: chunk, target: 'en' }) }).then(function(x){ return x.json(); });
          if (r && r.map){
            for (var key in r.map){ var en = r.map[key]; if (en && en !== key){ AUTO[key] = en; changed = true; } }
          }
        } catch(e) {}
      }
      if (changed){ try { localStorage.setItem('mangoi_i18n_en', JSON.stringify(AUTO)); } catch(e){} }
      if (changed && isEn()){ try { sweep(document.body); } catch(e){} }
    })();
  }

  function lang(){
    try{ if(window.getLang) return window.getLang(); }catch(e){}
    try{ var l=localStorage.getItem('mangoi_lang'); if(l) return l; }catch(e){}
    return document.documentElement.lang || 'ko';
  }
  function isEn(){ return lang()==='en'; }

  function trText(t){
    var k=t.trim(); if(!k) return null;
    var v=DICT[k];
    if(v===undefined){
      for(var i=0;i<PATTERNS.length;i++){ var m=k.match(PATTERNS[i].re); if(m){ v=PATTERNS[i].fn(m); break; } }
    }
    if(v===undefined){
      var r=k, hit=false;
      for(var j=0;j<REPL.length;j++){ var nr=r.split(REPL[j][0]).join(REPL[j][1]); if(nr!==r){ r=nr; hit=true; } }
      if(hit) v=r;
    }
    if(v===undefined && AUTO[k]!==undefined) v=AUTO[k];
    if(v===undefined){ maybeQueue(k); return null; }
    return t.replace(k, v);
  }

  function applyTextNode(n){
    var out=trText(n.nodeValue||'');
    if(out!==null && out!==n.nodeValue){ records.push({n:n,a:null,o:n.nodeValue}); n.nodeValue=out; }
  }
  function applyEl(el){
    for(var i=0;i<ATTRS.length;i++){
      var a=ATTRS[i], v=el.getAttribute && el.getAttribute(a);
      if(v){ var out=trText(v); if(out!==null && out!==v){ records.push({n:el,a:a,o:v}); el.setAttribute(a,out); } }
    }
  }
  function walk(root){
    if(!root) return;
    if(root.nodeType===3){ applyTextNode(root); return; }
    if(root.nodeType!==1 && root.nodeType!==11) return;
    if(root.nodeType===1){ if(SKIP.test(root.tagName)) return; applyEl(root); }
    var w=document.createTreeWalker(root, NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT, {
      acceptNode:function(nd){
        if(nd.nodeType===1) return SKIP.test(nd.tagName)?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var nd;
    while((nd=w.nextNode())){
      if(nd.nodeType===3) applyTextNode(nd);
      else applyEl(nd);
    }
  }
  // 참고: 번역 결과(영어)는 DICT 키(한국어)와 다시 매칭되지 않으므로 무한루프 없음 → 가드 플래그 불필요
  function sweep(root){
    if(!isEn()) return;
    walk(root||document.body);
    try{ var t=trText(document.title); if(t!==null) document.title=t; }catch(e){}
  }
  function restore(){
    for(var i=0;i<records.length;i++){
      var r=records[i];
      try{ if(r.a){ r.n.setAttribute(r.a, r.o); } else { r.n.nodeValue=r.o; } }catch(e){}
    }
    records=[];
  }

  function start(){
    if(isEn()) sweep();
    // 동적 노드 감시
    try{
      new MutationObserver(function(muts){
        if(!isEn()) return;
        for(var i=0;i<muts.length;i++){
          var m=muts[i];
          if(m.type==='characterData') applyTextNode(m.target);
          if(m.addedNodes) for(var j=0;j<m.addedNodes.length;j++) walk(m.addedNodes[j]);
        }
      }).observe(document.body,{childList:true,subtree:true,characterData:true});
    }catch(e){}
    // 언어 전환 감지 (<html lang> — applyLang()이 갱신)
    try{
      var last=lang();
      new MutationObserver(function(){
        var l=lang();
        if(l===last) return;
        last=l;
        if(l==='en') sweep(); else restore();
      }).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
    }catch(e){}
    // 다른 탭/페이지에서 언어 변경
    try{
      window.addEventListener('storage', function(ev){
        if(ev.key!=='mangoi_lang') return;
        if(ev.newValue==='en') sweep(); else restore();
      });
    }catch(e){}
    console.log('[i18n-sweep] 활성 — '+Object.keys(DICT).length+' entries, lang='+lang());
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
